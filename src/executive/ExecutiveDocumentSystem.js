// src/executive/ExecutiveDocumentSystem.js
// Hệ thống Quản lý Hồ sơ Văn bản Giấy & Khay KHẨN CẤP (Single Source of Truth cho 6 chồng tài liệu + 1 khay đỏ URGENT)
import {
  DOC_CATEGORY,
  DOC_STACK_META,
  DOC_STATUS,
  DOC_PRIORITY,
  isActivePendingDocStatus,
  isTerminalDocStatus,
  qualifiesForUrgentTray,
  compareUrgentPriority
} from './DocumentTypes.js';

export class ExecutiveDocumentSystem {
  constructor(state) {
    this.state = state;
    this.reset();
  }

  reset() {
    this.documents = [];
    this.archivedDocuments = [];
    this._seq = 1;
    this._urgentDirtyVersion = 1;
    this._lastUrgentNotifiedIds = new Set();
  }

  _nextId(prefix = 'doc') {
    const n = this._seq++;
    return `${prefix}_s${this.state?.seasonNum || 1}_${String(n).padStart(4, '0')}`;
  }

  _nextCode(category) {
    const meta = DOC_STACK_META.find((m) => m.category === category);
    const sc = meta?.shortCode || 'HS';
    return `PSG-${sc}-${String(this._seq).padStart(3, '0')}`;
  }

  _currentDateStr() {
    if (this.state?.timeSystem?.getDateString) return this.state.timeSystem.getDateString();
    return `Tuần ${this.state?.week || 1} · ${this.state?.season || '2026/27'}`;
  }

  getAllActiveDocuments() {
    return this.documents.filter((d) => !isTerminalDocStatus(d.status));
  }

  getPendingDocuments(category = null) {
    return this.documents
      .filter((d) => isActivePendingDocStatus(d.status) && (!category || d.category === category))
      .sort(compareUrgentPriority);
  }

  getStackDocuments(category) {
    return this.documents
      .filter((d) => d.category === category && !isTerminalDocStatus(d.status))
      .sort(compareUrgentPriority);
  }

  getStackCounts() {
    const counts = {};
    for (const m of DOC_STACK_META) counts[m.category] = 0;
    for (const d of this.documents) {
      if (isActivePendingDocStatus(d.status) && counts[d.category] !== undefined) {
        counts[d.category]++;
      }
    }
    return counts;
  }

  getUrgentDocuments() {
    return this.documents
      .filter((d) => qualifiesForUrgentTray(d))
      .sort(compareUrgentPriority);
  }

  getUrgentCount() {
    return this.getUrgentDocuments().length;
  }

  getUnreadUrgentCount() {
    return this.getUrgentDocuments().filter((d) => !d.readByPresident).length;
  }

  hasNewUrgentPulse() {
    return this.getUrgentDocuments().some((d) => d.isNewAlert && !d.readByPresident);
  }

  getDocumentById(docId) {
    return (
      this.documents.find((d) => d.id === docId) ||
      this.archivedDocuments.find((d) => d.id === docId) ||
      null
    );
  }

  findByEventKey(eventKey) {
    if (!eventKey) return null;
    return (
      this.documents.find((d) => d.eventKey === eventKey) ||
      this.archivedDocuments.find((d) => d.eventKey === eventKey) ||
      null
    );
  }

  findBySourceRef(sourceType, sourceRefId) {
    if (!sourceRefId) return null;
    return (
      this.documents.find((d) => d.sourceType === sourceType && d.sourceRefId === sourceRefId) ||
      this.archivedDocuments.find((d) => d.sourceType === sourceType && d.sourceRefId === sourceRefId) ||
      null
    );
  }

  // Tạo văn bản giấy mới (có chống trùng lặp theo eventKey)
  createDocument(spec) {
    if (!spec || !spec.title) return null;
    if (spec.eventKey) {
      const existing = this.findByEventKey(spec.eventKey);
      if (existing) return existing;
    }

    const category = spec.category || DOC_CATEGORY.EXECUTIVE;
    const stackMeta = DOC_STACK_META.find((m) => m.category === category) || DOC_STACK_META[4];
    const docId = spec.id || this._nextId('doc');
    const code = spec.code || this._nextCode(category);
    const seq = this._seq;
    const priority = spec.priority || DOC_PRIORITY.MEDIUM;
    const daysUntilDeadline = Number.isFinite(spec.daysUntilDeadline) ? spec.daysUntilDeadline : 5;

    const doc = {
      id: docId,
      code,
      createdSeq: seq,
      eventKey: spec.eventKey || null,
      sourceType: spec.sourceType || 'manual',
      sourceRefId: spec.sourceRefId || null,
      category,
      categoryLabel: stackMeta.label,
      title: spec.title,
      subtitle: spec.subtitle || '',
      senderName: spec.senderName || 'Ban Điều Hành PSG',
      senderRole: spec.senderRole || 'Trưởng Bộ Phận',
      senderDept: spec.senderDept || stackMeta.dept,
      defaultOwnerRoleKey: spec.defaultOwnerRoleKey || 'ceo',
      receivedDate: spec.receivedDate || this._currentDateStr(),
      receivedWeek: spec.receivedWeek || this.state?.week || 1,
      deadlineWeek: spec.deadlineWeek || ((this.state?.week || 1) + (daysUntilDeadline <= 2 ? 0 : 1)),
      deadlineLabel: spec.deadlineLabel || (daysUntilDeadline <= 1 ? 'Khẩn trong 24h' : `Cuối Tuần ${this.state?.week || 1}`),
      daysUntilDeadline,
      priority,
      status: spec.status || DOC_STATUS.NEW,
      readByPresident: false,
      isNewAlert: priority === DOC_PRIORITY.URGENT,
      isEscalated: !!spec.isEscalated,
      hasDeadlineWarning: daysUntilDeadline <= 2,
      requiresSignature: spec.requiresSignature !== false,
      signatureCaptured: false,
      signedAt: null,
      financialImpactM: Number(spec.financialImpactM || 0),
      impactScore: Number(spec.impactScore || 10),
      summary: spec.summary || '',
      pages: Array.isArray(spec.pages) && spec.pages.length > 0 ? spec.pages : [
        {
          heading: '1. Tổng quan & Bối cảnh đề xuất',
          body: spec.summary || spec.title,
          bullets: spec.keyFacts || []
        },
        {
          heading: '2. Chi tiết Tài chính & Tác động CLB',
          body: spec.financialDetail || `Tác động dự kiến: ${Number(spec.financialImpactM || 0) >= 0 ? '+' : ''}€${Number(spec.financialImpactM || 0).toFixed(1)}M.`,
          bullets: spec.riskNotes || ['Tuân thủ khung ngân sách & Luật Công bằng Tài chính (FFP).']
        },
        {
          heading: '3. Tham mưu các Bộ phận & HLV',
          body: spec.consultationNote || 'Các phòng ban liên quan đã hoàn tất thẩm định sơ bộ.',
          bullets: spec.advisorOpinions || []
        }
      ],
      relatedDocs: spec.relatedDocs || [],
      recommendedAction: spec.recommendedAction || 'Phê duyệt triển khai đúng quy trình',
      consequences: spec.consequences || {
        approve: 'Chuyển sang giai đoạn thực thi thực tế và giao NPC phụ trách.',
        reject: 'Hủy bỏ đề xuất và lưu kết quả vào Văn thư Lưu trữ.'
      },
      extraPayload: spec.extraPayload || {},
      executionTaskId: null,
      decisionHistory: [],
      infoRequests: [],
      instructions: [],
      notes: []
    };

    this.documents.unshift(doc);
    this._urgentDirtyVersion++;

    // Đồng bộ thông báo điện thoại nếu khẩn hoặc quan trọng (chỉ tạo đúng 1 lần theo eventKey)
    if (qualifiesForUrgentTray(doc) && !this._lastUrgentNotifiedIds.has(doc.id)) {
      this._lastUrgentNotifiedIds.add(doc.id);
      this.state?.pushPhoneMsg?.(
        `${doc.senderName} (${doc.senderDept})`,
        `🚨 Hồ sơ KHẨN [${doc.code}]: ${doc.title}`,
        `${doc.summary} (Hạn: ${doc.deadlineLabel}). Đã đặt vào khay ĐỎ URGENT trên bàn Chủ tịch.`,
        true,
        { actionType: 'open_paper_doc', docId: doc.id, actionLabel: 'Mở Hồ Sơ Giấy' }
      );
    }

    return doc;
  }

  // Mở hồ sơ đọc -> chuyển NEW -> UNDER_REVIEW & đánh dấu đã đọc, KHÔNG BAO GIỜ tự phê duyệt!
  openDocumentForReading(docId) {
    const doc = this.getDocumentById(docId);
    if (!doc) return null;
    doc.readByPresident = true;
    doc.isNewAlert = false;
    if (doc.status === DOC_STATUS.NEW || doc.status === DOC_STATUS.PENDING) {
      doc.status = DOC_STATUS.UNDER_REVIEW;
    }
    this._urgentDirtyVersion++;
    return doc;
  }

  setStatus(docId, nextStatus, note = null) {
    const doc = this.getDocumentById(docId);
    if (!doc) return null;
    doc.status = nextStatus;
    doc.isNewAlert = false;
    if (note) {
      doc.notes.unshift({ date: this._currentDateStr(), text: note });
    }
    this._urgentDirtyVersion++;
    if (isTerminalDocStatus(nextStatus)) {
      this.archiveDocument(docId);
    }
    return doc;
  }

  archiveDocument(docId) {
    const idx = this.documents.findIndex((d) => d.id === docId);
    if (idx === -1) return this.archivedDocuments.find((d) => d.id === docId) || null;
    const [doc] = this.documents.splice(idx, 1);
    doc.archivedDate = this._currentDateStr();
    doc.isNewAlert = false;
    this.archivedDocuments.unshift(doc);
    if (this.archivedDocuments.length > 250) {
      this.archivedDocuments.length = 250;
    }
    this._urgentDirtyVersion++;
    return doc;
  }

  // Đồng bộ tự động & idempotent toàn bộ đề xuất/khủng hoảng/chuyển nhượng thật trong Club State thành Hồ sơ Văn bản Giấy
  syncFromClubState() {
    const s = this.state;
    if (!s) return;

    const currentCoachName = s.managerSystem?.getActiveByRole?.('head_coach')?.name || s.coach?.name || 'HLV Trưởng';
    const sdStaff = s.managerSystem?.getActiveByRole?.('sporting_director');
    const sdName = sdStaff?.name || 'Luís Campos';
    const cfoStaff = s.managerSystem?.getActiveByRole?.('cfo');
    const cfoName = cfoStaff?.name || 'Jean-Baptiste Laurent';
    const mktNpc = s.npcs?.find((n) => n.id === 'npc_mkt');
    const mktName = mktNpc?.name || 'Antoine Lefèvre';
    const facNpc = s.npcs?.find((n) => n.id === 'npc_fac');
    const facName = facNpc?.name || 'Benoît Delacroix';
    const ceoNpc = s.npcs?.find((n) => n.id === 'npc_ceo');
    const ceoName = ceoNpc?.name || 'Victoriano Melero';

    // 1. Đề nghị Hỏi Mua / Mượn cầu thủ PSG từ các CLB khác -> Hồ sơ Chuyển nhượng
    const bids = s.transferSystem?.incomingBids || [];
    const activeBidIds = new Set(bids.map((b) => b.id));
    for (const bid of bids) {
      const p = s.getPlayerById?.(bid.playerId);
      const mv = p?.valuation?.current ?? p?.value ?? bid.fee;
      const isUrgentBid = bid.fee >= 45 || (p?.ovr || 80) >= 85;
      this.createDocument({
        eventKey: `inc_bid_${bid.id}`,
        sourceType: 'incoming_bid',
        sourceRefId: bid.id,
        category: DOC_CATEGORY.TRANSFER,
        title: `Đề nghị ${bid.dealType === 'loan' ? 'mượn' : 'mua'} ${bid.playerName} từ ${bid.buyerClub} (€${bid.fee}M)`,
        subtitle: `${bid.buyerClub} · ${bid.position} · OVR ${bid.ovr} · Giá TT €${mv}M`,
        senderName: sdName,
        senderRole: 'Giám Đốc Thể Thao',
        senderDept: 'Phòng Chuyển Nhượng PSG',
        defaultOwnerRoleKey: 'sporting_director',
        priority: isUrgentBid ? DOC_PRIORITY.URGENT : DOC_PRIORITY.HIGH,
        daysUntilDeadline: bid.deadlineWeek <= s.week ? 1 : 3,
        deadlineWeek: bid.deadlineWeek || s.week + 1,
        deadlineLabel: bid.deadlineDate || `Cuối Tuần ${bid.deadlineWeek || s.week}`,
        financialImpactM: Number(bid.fee || 0),
        impactScore: isUrgentBid ? 35 : 22,
        summary: `${bid.buyerClub} gửi hồ sơ chính thức hỏi ${bid.dealType === 'loan' ? 'mượn' : 'mua'} ${bid.playerName} với mức phí €${bid.fee}M (Định giá thị trường: €${mv}M).`,
        recommendedAction: bid.fee >= mv * 1.1 ? 'Xem xét Phê duyệt hoặc Ép giá thêm 10%' : 'Yêu cầu đàm phán tăng giá hoặc Từ chối',
        advisorOpinions: [
          `GĐ Thể thao (${sdName}): ${bid.fee >= mv ? 'Mức giá tiệm cận định giá hợp lý.' : 'Giá đề nghị vẫn thấp hơn giá trị thực của cầu thủ.'}`,
          `HLV Trưởng (${currentCoachName}): ${p?.ovr >= 85 ? 'Đề nghị giữ trụ cột trừ khi tìm được người thay thế.' : 'Có thể cân nhắc nếu có phương án xoay tua.'}`,
          `CFO (${cfoName}): Phương án thu tiền bán cầu thủ giúp cân đối quỹ lương và FFP (+€${bid.fee}M).`
        ],
        relatedDocs: [
          `Hồ sơ cầu thủ ${bid.playerName} (OVR ${bid.ovr}, HĐ còn ${p?.contractYears ?? 2} năm)`,
          `Báo cáo định giá thị trường Tuần ${s.week}: €${mv}M`
        ],
        consequences: {
          approve: `Chuyển hồ sơ cho ${sdName} chốt hợp đồng chuyển nhượng với ${bid.buyerClub} (+€${bid.fee}M).`,
          reject: `Từ chối chính thức đề nghị của ${bid.buyerClub} và đóng hồ sơ.`
        },
        extraPayload: { bidId: bid.id, playerId: bid.playerId, buyerClub: bid.buyerClub, fee: bid.fee }
      });
    }

    // Nếu incoming bid đã biến mất khỏi TransferSystem (đã chốt bằng UI cũ) -> tự đồng bộ đóng hồ sơ giấy
    for (const d of [...this.documents]) {
      if (d.sourceType === 'incoming_bid' && d.sourceRefId && !activeBidIds.has(d.sourceRefId) && !d.executionTaskId && isActivePendingDocStatus(d.status)) {
        this.setStatus(d.id, DOC_STATUS.COMPLETED, 'Đã xử lý trực tiếp trên bàn đàm phán chuyển nhượng.');
      }
    }

    // 2. Ghế HLV trưởng đang trống -> Hồ sơ KHẨN bổ nhiệm HLV Trưởng
    const activeHc = s.managerSystem?.getActiveByRole?.('head_coach');
    if (!activeHc || s.coach?.vacant) {
      const topCand = s.managerSystem?.getCandidatesForRole?.('head_coach')?.[0];
      this.createDocument({
        eventKey: `coach_vacant_s${s.seasonNum}_w${s.week}`,
        sourceType: 'coach_vacancy',
        sourceRefId: 'head_coach',
        category: DOC_CATEGORY.COACHING,
        title: `KHẨN: Bổ nhiệm HLV Trưởng Đội Một PSG${topCand ? ` (Ứng viên số 1: ${topCand.name})` : ''}`,
        subtitle: 'Ghế HLV Trưởng đang trống — Cần quyết định trước trận đấu tiếp theo',
        senderName: sdName,
        senderRole: 'Giám Đốc Thể Thao',
        senderDept: 'Ban Thể Thao & Nhân Sự',
        defaultOwnerRoleKey: 'sporting_director',
        priority: DOC_PRIORITY.URGENT,
        daysUntilDeadline: 1,
        deadlineLabel: 'Khẩn — Trước ngày thi đấu',
        financialImpactM: -(topCand ? 4.5 : 3.0),
        impactScore: 45,
        summary: `Vị trí HLV Trưởng PSG đang bỏ trống. ${sdName} đã tổng hợp danh sách ứng viên sẵn sàng đàm phán và ký hợp đồng ngay lập tức.`,
        recommendedAction: topCand ? `Phê duyệt đàm phán bổ nhiệm ${topCand.name} (Danh tiếng ${topCand.reputation})` : 'Phê duyệt tuyển dụng HLV trưởng mới',
        advisorOpinions: [
          `GĐ Thể thao (${sdName}): Ưu tiên HLV phù hợp triết lý kiểm soát bóng và phát triển cầu thủ trẻ.`,
          `Đội trưởng Marquinhos: Phòng thay đồ cần một người dẫn dắt bản lĩnh càng sớm càng tốt.`
        ],
        consequences: {
          approve: 'Giao GĐ Thể thao tiến hành đàm phán điều khoản và trình hợp đồng HLV trưởng mới.',
          reject: 'Tạm giữ ghế trống thêm (Cảnh báo giảm tinh thần & hiệu suất tập luyện).'
        },
        extraPayload: { roleKey: 'head_coach', candidateId: topCand?.staffId || null }
      });
    }

    // 3. Các đề xuất phòng ban pendingReports -> Phân loại vào đúng chồng tài liệu
    const pendingReps = s.pendingReports || [];
    const activeRepIds = new Set(pendingReps.map((r) => r.id));
    for (const rep of pendingReps) {
      let cat = DOC_CATEGORY.EXECUTIVE;
      let ownerKey = 'ceo';
      if (/y tế|huấn luyện|chiến thuật|cầu thủ/i.test(`${rep.dept} ${rep.title}`)) {
        cat = DOC_CATEGORY.COACHING;
        ownerKey = rep.dept.includes('Y Tế') ? 'head_medical' : 'head_coach';
      } else if (/marketing|tài trợ|thương mại/i.test(`${rep.dept} ${rep.title}`)) {
        cat = DOC_CATEGORY.COMMERCIAL;
        ownerKey = 'marketing';
      } else if (/tuyển trạch|chuyển nhượng/i.test(`${rep.dept} ${rep.title}`)) {
        cat = DOC_CATEGORY.TRANSFER;
        ownerKey = 'sporting_director';
      } else if (/tài chính|ngân sách/i.test(`${rep.dept} ${rep.title}`)) {
        cat = DOC_CATEGORY.FINANCE;
        ownerKey = 'cfo';
      }
      const isHighCost = Math.abs(Number(rep.cost || 0)) >= 10;
      this.createDocument({
        eventKey: `pending_rep_${rep.id}`,
        sourceType: 'pending_report',
        sourceRefId: rep.id,
        category: cat,
        title: rep.title,
        subtitle: `Trình bởi ${rep.author} · ${rep.dept}`,
        senderName: rep.author,
        senderRole: rep.dept,
        senderDept: rep.dept,
        defaultOwnerRoleKey: ownerKey,
        priority: isHighCost ? DOC_PRIORITY.HIGH : DOC_PRIORITY.MEDIUM,
        daysUntilDeadline: 4,
        financialImpactM: Number(rep.cost || 0),
        impactScore: isHighCost ? 24 : 12,
        summary: rep.detail,
        advisorOpinions: [
          `${rep.author}: Đề xuất giúp tăng hiệu suất bộ phận ${rep.dept} và đóng góp mục tiêu chung CLB.`
        ],
        consequences: {
          approve: `Giải ngân/triển khai thực tế qua NPC phụ trách (${rep.cost >= 0 ? '+' : ''}€${rep.cost}M).`,
          reject: 'Không phê duyệt hạng mục này trong kỳ hiện tại.'
        },
        extraPayload: { reportId: rep.id, cost: rep.cost, effect: rep.effect || {} }
      });
    }
    for (const d of [...this.documents]) {
      if (d.sourceType === 'pending_report' && d.sourceRefId && !activeRepIds.has(d.sourceRefId) && !d.executionTaskId && isActivePendingDocStatus(d.status)) {
        this.setStatus(d.id, DOC_STATUS.COMPLETED, 'Đề xuất phòng ban đã được xử lý.');
      }
    }

    // 4. Đề nghị Tài trợ mới -> Hồ sơ Đối tác & Thương mại
    const sponsorOffers = s.commercialSystem?.sponsorOffers || [];
    for (const off of sponsorOffers.slice(0, 2)) {
      this.createDocument({
        eventKey: `sponsor_offer_${off.id}`,
        sourceType: 'sponsor_offer',
        sourceRefId: off.id,
        category: DOC_CATEGORY.COMMERCIAL,
        title: `Hồ sơ Tài trợ: ${off.name} (+€${off.annualValueM}M/năm · ${off.years} năm)`,
        subtitle: `${off.slot} · Thưởng ký +€${off.signingBonusM}M`,
        senderName: mktName,
        senderRole: 'Giám Đốc Thương Mại & Tài Trợ',
        senderDept: 'Phòng Marketing & Thương Mại',
        defaultOwnerRoleKey: 'marketing',
        priority: off.annualValueM >= 16 ? DOC_PRIORITY.HIGH : DOC_PRIORITY.MEDIUM,
        daysUntilDeadline: 5,
        financialImpactM: Number(off.signingBonusM || 0) + Number(off.annualValueM || 0),
        impactScore: 26,
        summary: `${off.name} (${off.sector}) gửi văn bản đề nghị tài trợ ${off.slot} với tổng giá trị €${(off.annualValueM * off.years + off.signingBonusM).toFixed(1)}M trong ${off.years} năm.`,
        advisorOpinions: [
          `GĐ Thương mại (${mktName}): Hợp đồng phù hợp định vị Modern Luxury & giúp mở rộng doanh thu thương mại.`,
          `CFO (${cfoName}): Thưởng ký +€${off.signingBonusM}M giúp cải thiện dòng tiền ngay sau khi hoàn tất ký kết.`
        ],
        consequences: {
          approve: `Giao Phòng Thương mại & Pháp chế hoàn tất hợp đồng với ${off.name}, ghi nhận tài chính & sự kiện ký kết.`,
          reject: `Từ chối đề nghị hợp tác của ${off.name}.`
        },
        extraPayload: { offerId: off.id, sponsorName: off.name, annualValueM: off.annualValueM, signingBonusM: off.signingBonusM }
      });
    }

    // 5. Khủng hoảng truyền thông nghiêm trọng -> Khay KHẨN & Chồng Quyết định Chủ tịch
    const crises = (s.rumorCrisisSystem?.crises || []).filter((c) => c.status === 'active');
    for (const cr of crises) {
      this.createDocument({
        eventKey: `crisis_${cr.id}`,
        sourceType: 'crisis',
        sourceRefId: cr.id,
        category: DOC_CATEGORY.EXECUTIVE,
        title: `KHẨN CẤP: ${cr.title}`,
        subtitle: `Mức độ ${cr.severity} · Yêu cầu chỉ đạo xử lý khủng hoảng`,
        senderName: ceoName,
        senderRole: 'Tổng Giám Đốc (CEO)',
        senderDept: 'Ban Điều Hành & Truyền Thông',
        defaultOwnerRoleKey: 'media',
        priority: DOC_PRIORITY.URGENT,
        daysUntilDeadline: 1,
        deadlineLabel: 'Xử lý khẩn trong ngày',
        financialImpactM: -1.5,
        impactScore: 40,
        summary: cr.summary,
        advisorOpinions: (cr.advisors || []).map((a) => `${a.name} (${a.role}): "${a.advice}"`),
        recommendedAction: 'Phê duyệt phương án ứng phó khủng hoảng & giao Bộ phận Truyền thông thực thi',
        extraPayload: { crisisId: cr.id, defaultOptKey: cr.options?.[0]?.key || 'apologize' }
      });
    }

    // 6. Đề xuất Nâng cấp Cơ sở vật chất (1 đề xuất tiêu biểu đang chờ trình) -> Hồ sơ Tài chính
    const trainFac = s.commercialSystem?.facilities?.training_center;
    if (trainFac && trainFac.level < 5) {
      const nextLv = trainFac.level + 1;
      const cost = Math.round(14 * (1 + (trainFac.level - 1) * 0.45));
      this.createDocument({
        eventKey: `fac_prop_training_center_lv${nextLv}`,
        sourceType: 'facility_upgrade',
        sourceRefId: 'training_center',
        category: DOC_CATEGORY.FINANCE,
        title: `Tờ trình Đầu tư: Nâng cấp Trung tâm Huấn luyện Campus PSG lên Cấp ${nextLv} (€${cost}M)`,
        subtitle: `Tác động tài chính: -€${cost}M (Giải ngân theo tiến độ thi công)`,
        senderName: facName,
        senderRole: 'Giám Đốc Cơ Sở Vật Chất',
        senderDept: 'Ban Tài Chính & Quản Lý CSVC',
        defaultOwnerRoleKey: 'facilities',
        priority: cost >= 20 ? DOC_PRIORITY.HIGH : DOC_PRIORITY.MEDIUM,
        daysUntilDeadline: 6,
        financialImpactM: -cost,
        impactScore: 22,
        summary: `Đề xuất nâng cấp khu huấn luyện thể lực, phòng phân tích video và mặt cỏ Campus lên Cấp ${nextLv}. Kinh phí dự kiến €${cost}M, thi công theo tiến độ nhiều ngày (đặt cọc 40% khi khởi công, tất toán 60% khi nghiệm thu).`,
        advisorOpinions: [
          `GĐ CSVC (${facName}): Nâng cấp giúp tăng +${nextLv * 4}% tốc độ phát triển kỹ thuật & thể lực.`,
          `CFO (${cfoName}): Ngân sách hiện tại €${s.finance.budget.toFixed(1)}M — ${s.finance.budget >= cost ? 'Đủ khả năng đáp ứng giải ngân theo giai đoạn.' : 'Cần cân nhắc nguồn vốn trước khi duyệt!'}`
        ],
        consequences: {
          approve: `Phê duyệt dự án nâng cấp Campus & giao ${facName} khởi công theo giai đoạn (chỉ trừ tiền cọc ban đầu).`,
          reject: 'Hoãn kế hoạch nâng cấp trong giai đoạn này.'
        },
        extraPayload: { facilityId: 'training_center', targetLevel: nextLv, totalCost: cost }
      });
    }

    // 7. Hồ sơ Nhân sự: Gia hạn hợp đồng cầu thủ trụ cột còn ≤ 1 năm (nếu có)
    const expiringStar = s.getPsgSquad?.().find((p) => (p.contractYears || 2) <= 1 && (p.ovr || 75) >= 82);
    if (expiringStar) {
      this.createDocument({
        eventKey: `hr_renew_${expiringStar.id}_s${s.seasonNum}`,
        sourceType: 'player_renewal',
        sourceRefId: expiringStar.id,
        category: DOC_CATEGORY.HR,
        title: `Hồ sơ Gia hạn Hợp đồng Trụ cột: ${expiringStar.name} (${expiringStar.position} · OVR ${expiringStar.ovr})`,
        subtitle: `Chỉ còn ${expiringStar.contractYears} năm hợp đồng · Nguy cơ mất trắng hoặc bị ép giá`,
        senderName: s.npcs?.find((n) => n.id === 'npc_hr')?.name || 'Claire Moreau',
        senderRole: 'Giám Đốc Nhân Sự & Quản Lý Cầu Thủ',
        senderDept: 'Phòng Nhân Sự & Pháp Chế PSG',
        defaultOwnerRoleKey: 'sporting_director',
        priority: expiringStar.ovr >= 86 ? DOC_PRIORITY.URGENT : DOC_PRIORITY.HIGH,
        daysUntilDeadline: 2,
        deadlineLabel: 'Cần gia hạn sớm',
        financialImpactM: -((expiringStar.wage || 100) * 52 * 0.001),
        impactScore: 28,
        summary: `Hợp đồng của ${expiringStar.name} chỉ còn ${expiringStar.contractYears} năm (Lương hiện tại: €${expiringStar.wage}k/tuần). Đề xuất mở đàm phán gia hạn +3 năm để giữ vững bộ khung PSG.`,
        advisorOpinions: [
          `GĐ Thể thao (${sdName}): Rất cần thiết để bảo vệ giá trị thị trường €${expiringStar.valuation?.current ?? expiringStar.value}M.`,
          `HLV Trưởng (${currentCoachName}): ${expiringStar.name} nằm trong kế hoạch chuyên môn mùa giải này.`
        ],
        extraPayload: { playerId: expiringStar.id, addYears: 3, targetWage: Math.round((expiringStar.wage || 90) * 1.1) }
      });
    }

    // 8. Hồ sơ Quyết định Chủ tịch: Kế hoạch Chiến lược Mùa Giải
    this.createDocument({
      eventKey: `exec_strategy_s${s.seasonNum}`,
      sourceType: 'strategic_directive',
      sourceRefId: `season_${s.seasonNum}`,
      category: DOC_CATEGORY.EXECUTIVE,
      title: `Nghị quyết Chiến lược Điều hành PSG Mùa ${s.season}`,
      subtitle: 'Phê duyệt KPI 12 Phòng ban & Khung Kiểm soát Quỹ lương FFP',
      senderName: ceoName,
      senderRole: 'Tổng Giám Đốc (CEO)',
      senderDept: 'Văn Phòng Chủ Tịch & Ban Điều Hành',
      defaultOwnerRoleKey: 'ceo',
      priority: DOC_PRIORITY.MEDIUM,
      daysUntilDeadline: 5,
      financialImpactM: 0,
      impactScore: 20,
      summary: `CEO ${ceoName} trình bộ chỉ tiêu vận hành quý: kiểm soát trần lương tuần ≤ €5.5M/tuần, tối ưu hiệu suất 12 phòng ban ≥ 88% và ưu tiên đôn 2 tài năng trẻ Học viện.`,
      advisorOpinions: [
        `CEO (${ceoName}): Đồng bộ toàn bộ trưởng phòng làm việc theo KPI quý.`,
        `CFO (${cfoName}): Duy trì trạng thái FFP An toàn để mở dư địa chuyển nhượng.`
      ],
      extraPayload: { strategyKey: 'quarterly_kpi_alignment' }
    });
  }

  // Tạo văn bản từ Máy tính (VD: khi Chủ tịch bấm "Lập hồ sơ duyệt chi" từ Tài chính / Chuyển nhượng / CSVC)
  raiseDossierFromComputer(specOrType, payload = {}) {
    if (specOrType && typeof specOrType === 'object') {
      return this.createDocument({
        ...specOrType,
        status: DOC_STATUS.PENDING
      });
    }
    const kind = String(specOrType || 'budget_proposal');
    const costM = Number(payload.costM ?? payload.totalCost ?? 0);
    if (kind === 'facility_upgrade') {
      const fid = payload.facilityId || 'training_center';
      const targetLevel = Number(payload.targetLevel || 4);
      const totalCost = Math.max(4, costM || 14);
      return this.createDocument({
        eventKey: `manual_fac_${fid}_lv${targetLevel}`,
        sourceType: 'facility_upgrade',
        sourceRefId: fid,
        category: DOC_CATEGORY.FINANCE,
        title: `Tờ trình Đầu tư CSVC: Nâng cấp ${fid} lên Cấp ${targetLevel} (€${totalCost}M)`,
        subtitle: `Giải ngân theo tiến độ: Đặt cọc 40% khi khởi công, 60% khi nghiệm thu`,
        senderName: this.state?.npcs?.find((n) => n.id === 'npc_fac')?.name || 'Alexandre Rossi',
        senderRole: 'Giám Đốc Cơ Sở Vật Chất',
        senderDept: 'Ban Tài Chính & Quản Lý CSVC',
        defaultOwnerRoleKey: 'facilities',
        priority: totalCost >= 25 ? DOC_PRIORITY.HIGH : DOC_PRIORITY.MEDIUM,
        daysUntilDeadline: 5,
        financialImpactM: -totalCost,
        impactScore: Math.max(15, Math.round(totalCost)),
        summary: `Đề xuất phê duyệt nâng cấp hạng mục ${fid} lên Cấp ${targetLevel} với tổng mức đầu tư €${totalCost}M (tạm ứng 40% khởi công, 60% khi bàn giao).`,
        extraPayload: { facilityId: fid, targetLevel, totalCost },
        status: DOC_STATUS.PENDING
      });
    }
    if (kind === 'kpi_review') {
      return this.createDocument({
        eventKey: `manual_kpi_s${this.state?.seasonNum || 1}_w${this.state?.week || 1}`,
        sourceType: 'strategic_directive',
        sourceRefId: `kpi_${this.state?.week || 1}`,
        category: DOC_CATEGORY.EXECUTIVE,
        title: `Chỉ thị Điều hành KPI 12 Phòng ban (Tuần ${this.state?.week || 1})`,
        subtitle: 'Kiểm soát hiệu suất bộ phận & chuẩn hóa vận hành PSG',
        senderName: this.state?.npcs?.find((n) => n.id === 'npc_ceo')?.name || 'Victoriano Melero',
        senderRole: 'Tổng Giám Đốc (CEO)',
        senderDept: 'Ban Điều Hành PSG',
        defaultOwnerRoleKey: 'ceo',
        priority: DOC_PRIORITY.MEDIUM,
        daysUntilDeadline: 4,
        financialImpactM: 0,
        impactScore: 18,
        summary: 'Nghị quyết giao chỉ tiêu KPI cho toàn bộ 12 phòng ban PSG và theo dõi báo cáo tiến độ hằng ngày.',
        extraPayload: { strategyKey: 'manual_kpi_review' },
        status: DOC_STATUS.PENDING
      });
    }
    const propId = payload.proposalId || `prop_${Date.now()}`;
    return this.createDocument({
      eventKey: `manual_budget_${propId}`,
      sourceType: 'budget_proposal',
      sourceRefId: propId,
      category: DOC_CATEGORY.FINANCE,
      title: payload.title || `Tờ trình Phê duyệt Ngân sách (€${costM}M)`,
      subtitle: payload.dept || 'Ban Tài chính PSG',
      senderName: this.state?.npcs?.find((n) => n.id === 'npc_cfo')?.name || 'Jean-Baptiste Laurent',
      senderRole: 'Giám Đốc Tài Chính (CFO)',
      senderDept: payload.dept || 'Ban Tài Chính PSG',
      defaultOwnerRoleKey: 'cfo',
      priority: costM >= 25 ? DOC_PRIORITY.URGENT : costM >= 10 ? DOC_PRIORITY.HIGH : DOC_PRIORITY.MEDIUM,
      daysUntilDeadline: costM >= 25 ? 2 : 5,
      financialImpactM: -Math.abs(costM),
      impactScore: Math.max(12, Math.round(Math.abs(costM))),
      summary: payload.detail || `Tờ trình đề nghị phê duyệt giải ngân €${costM}M từ ngân sách CLB.`,
      extraPayload: { proposalId: propId, costM: Math.abs(costM) },
      status: DOC_STATUS.PENDING
    });
  }

  searchArchive({ query = '', category = 'ALL', status = 'ALL', dept = 'ALL', owner = 'ALL' } = {}) {
    const q = String(query || '').trim().toLowerCase();
    const pool = [...this.archivedDocuments, ...this.documents.filter((d) => !isActivePendingDocStatus(d.status))];
    const seen = new Set();
    const unique = [];
    for (const d of pool) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      if (category !== 'ALL' && d.category !== category) continue;
      if (status !== 'ALL' && d.status !== status) continue;
      if (dept !== 'ALL' && !(d.senderDept || '').includes(dept)) continue;
      if (owner !== 'ALL') {
        const lastDec = d.decisionHistory?.[0];
        const handler = `${lastDec?.assignedOwnerName || ''} ${d.senderName || ''}`.toLowerCase();
        if (!handler.includes(owner.toLowerCase())) continue;
      }
      if (q) {
        const hay = `${d.code} ${d.title} ${d.subtitle} ${d.senderName} ${d.senderDept} ${d.summary}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      unique.push(d);
    }
    return unique;
  }

  exportState() {
    return {
      seq: this._seq,
      documents: this.documents,
      archivedDocuments: this.archivedDocuments,
      notifiedIds: Array.from(this._lastUrgentNotifiedIds)
    };
  }

  importState(snap) {
    if (!snap) return;
    if (Number.isFinite(snap.seq)) this._seq = Math.max(1, snap.seq);
    if (Array.isArray(snap.documents)) this.documents = snap.documents;
    if (Array.isArray(snap.archivedDocuments)) this.archivedDocuments = snap.archivedDocuments;
    if (Array.isArray(snap.notifiedIds)) this._lastUrgentNotifiedIds = new Set(snap.notifiedIds);
    this._urgentDirtyVersion++;
  }
}
