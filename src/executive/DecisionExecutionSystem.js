// src/executive/DecisionExecutionSystem.js
// Hệ thống Ra Quyết Định Chủ Tịch, Thực Thi Nhiệm Vụ Đa Bước & Giám Sát Trách Nhiệm NPC
import {
  DOC_CATEGORY,
  DOC_STATUS,
  DOC_PRIORITY,
  TASK_STATUS,
  DELEGATION_MODE,
  EXEC_ACTIONS,
  ROLE_RESPONSIBILITY_MAP
} from './DocumentTypes.js';

export class DecisionExecutionSystem {
  constructor(state) {
    this.state = state;
    this.reset();
  }

  reset() {
    this.decisions = [];
    this.executionTasks = [];
    this.staffEvaluations = {};
    this.officeVisitQueue = [];
    this.activeOfficeVisit = null;
    this.sentEventNotifications = new Set();
    this._seq = 1;
    this._initDefaultEvaluations();
  }

  _initDefaultEvaluations() {
    Object.values(ROLE_RESPONSIBILITY_MAP).forEach((meta) => {
      if (!this.staffEvaluations[meta.roleKey]) {
        this.staffEvaluations[meta.roleKey] = {
          roleKey: meta.roleKey,
          competency: 82,
          onTimeCount: 0,
          delayedCount: 0,
          failedCount: 0,
          completedCount: 0,
          notes: []
        };
      }
    });
  }

  _dateStr() {
    if (this.state?.timeSystem?.getDateString) return this.state.timeSystem.getDateString();
    return `Tuần ${this.state?.week || 1}`;
  }

  _docSys() {
    return this.state?.documentSystem || null;
  }

  // Tra cứu NPC phụ trách hiện tại theo roleKey (đảm bảo KHÔNG BAO GIỜ trả về HLV/nhân sự cũ đã rời CLB!)
  resolveOwnerNpc(roleKey) {
    const mapMeta = ROLE_RESPONSIBILITY_MAP[roleKey] || ROLE_RESPONSIBILITY_MAP.ceo;
    const managed = this.state?.managerSystem?.getActiveByRole?.(roleKey);
    if (managed) {
      const npcObj = this.state?.npcs?.find((n) => n.id === managed.npcId || n.staffId === managed.staffId);
      return {
        roleKey,
        npcId: managed.npcId || mapMeta.npcId,
        name: managed.name,
        title: managed.role || mapMeta.title,
        dept: managed.dept || mapMeta.dept,
        skill: managed.overall || managed.reputation || 82,
        personality: managed.personality || 'Cẩn thận',
        relation: npcObj?.relation ?? managed.relation ?? 80,
        morale: npcObj?.morale ?? managed.morale ?? 82,
        present: true
      };
    }

    // Nếu là ghế do ManagerManagementSystem quản lý nhưng đang trống -> không trả tên người cũ!
    if (roleKey === 'head_coach' && (this.state?.coach?.vacant || !this.state?.managerSystem?.getActiveByRole?.('head_coach'))) {
      return {
        roleKey,
        npcId: null,
        name: 'Vị trí đang trống (Tạm quyền: GĐ Thể thao)',
        title: 'HLV Trưởng (Đang tuyển dụng)',
        dept: 'Ban Huấn Luyện',
        skill: 72,
        personality: 'Cẩn thận',
        relation: 75,
        morale: 75,
        vacant: true,
        present: false
      };
    }

    const npc = this.state?.npcs?.find((n) => n.id === mapMeta.npcId && !n.isPlayer);
    if (npc) {
      return {
        roleKey,
        npcId: npc.id,
        name: npc.name,
        title: npc.role || mapMeta.title,
        dept: npc.dept || mapMeta.dept,
        skill: npc.skill || 82,
        personality: npc.personality || 'Cẩn thận',
        relation: npc.relation ?? 82,
        morale: npc.morale ?? 82,
        present: true
      };
    }

    // Fallback về CEO nếu vị trí chưa có NPC
    const ceoNpc = this.state?.npcs?.find((n) => n.id === 'npc_ceo');
    return {
      roleKey: 'ceo',
      npcId: ceoNpc?.id || 'npc_ceo',
      name: ceoNpc?.name || 'Victoriano Melero',
      title: 'Tổng Giám Đốc (Kiêm nhiệm)',
      dept: 'Ban Điều Hành',
      skill: ceoNpc?.skill || 85,
      personality: ceoNpc?.personality || 'Ngoại giao',
      relation: ceoNpc?.relation ?? 85,
      morale: ceoNpc?.morale ?? 85,
      present: true
    };
  }

  getActiveTasks() {
    return this.executionTasks.filter((t) =>
      t.status !== TASK_STATUS.COMPLETED &&
      t.status !== TASK_STATUS.FAILED &&
      t.status !== TASK_STATUS.CANCELLED
    );
  }

  getTaskById(taskId) {
    return this.executionTasks.find((t) => t.id === taskId) || null;
  }

  getOwnerWorkloadCount(roleKey) {
    return this.getActiveTasks().filter((t) => t.ownerRoleKey === roleKey).length;
  }

  _notifyOnce(eventKey, from, title, body, urgent = false, extra = {}) {
    if (eventKey && this.sentEventNotifications.has(eventKey)) return;
    if (eventKey) this.sentEventNotifications.add(eventKey);
    this.state?.pushPhoneMsg?.(from, title, body, urgent, extra);
  }

  _queueOfficeVisit(visit) {
    if (!visit || !visit.npcId) return;
    const dup = this.officeVisitQueue.some((v) => v.taskId === visit.taskId && v.reasonType === visit.reasonType);
    if (dup) return;
    this.officeVisitQueue.push({
      id: `visit_${Date.now()}_${this._seq++}`,
      createdDate: this._dateStr(),
      ...visit
    });
  }

  // ==================== RA QUYẾT ĐỊNH TỪ VĂN BẢN GIẤY ====================

  submitDocumentDecision(docId, options = {}) {
    const docSys = this._docSys();
    if (!docSys) return { ok: false, error: 'Hệ thống văn bản chưa sẵn sàng.' };
    const doc = docSys.getDocumentById(docId);
    if (!doc) return { ok: false, error: 'Không tìm thấy hồ sơ văn bản.' };

    const action = options.action || EXEC_ACTIONS.APPROVE;
    const delegationMode = options.delegationMode || DELEGATION_MODE.SUPERVISE;
    const ownerRoleKey = options.ownerRoleKey || doc.defaultOwnerRoleKey || 'ceo';
    const ownerInfo = this.resolveOwnerNpc(ownerRoleKey);
    const instruction = String(options.instruction || '').trim();
    const dateStr = this._dateStr();

    // 1. Hành động CLOSE (chỉ đóng hồ sơ xem sau, không thay đổi quyết định)
    if (action === EXEC_ACTIONS.CLOSE) {
      doc.readByPresident = true;
      return { ok: true, doc, action, message: `Đã cất hồ sơ [${doc.code}] trở lại ngăn xếp.` };
    }

    // 2. Hành động ADD_INSTRUCTION (chỉ thêm chỉ đạo bằng văn bản, chưa chốt duyệt/từ chối)
    if (action === EXEC_ACTIONS.ADD_INSTRUCTION) {
      if (!instruction) return { ok: false, error: 'Vui lòng nhập nội dung chỉ đạo trước khi ghi vào hồ sơ.' };
      doc.instructions.unshift({ date: dateStr, author: 'Chủ tịch Phạm Minh Chiêu', text: instruction });
      doc.notes.unshift({ date: dateStr, text: `Chỉ đạo Chủ tịch: "${instruction}"` });
      return { ok: true, doc, action, message: `Đã ghi chỉ đạo vào hồ sơ [${doc.code}].` };
    }

    // 3. Hành động REQUEST_REVISION / REQUEST_INFORMATION (chưa phê duyệt, trả về bộ phận)
    if (action === EXEC_ACTIONS.REQUEST_REVISION || action === EXEC_ACTIONS.REQUEST_INFORMATION) {
      const nextSt = action === EXEC_ACTIONS.REQUEST_REVISION ? DOC_STATUS.REVISION_REQUIRED : DOC_STATUS.WAITING_INFORMATION;
      docSys.setStatus(doc.id, nextSt, instruction || (action === EXEC_ACTIONS.REQUEST_REVISION
        ? `Chủ tịch yêu cầu ${doc.senderDept} chỉnh sửa lại phương án.`
        : `Chủ tịch yêu cầu ${ownerInfo.name} bổ sung số liệu thẩm định.`));
      doc.infoRequests.unshift({
        date: dateStr,
        type: action,
        targetRoleKey: ownerRoleKey,
        targetName: ownerInfo.name,
        note: instruction || 'Cần làm rõ chi phí, rủi ro và phương án dự phòng.',
        resolved: false
      });
      // Nếu là đề nghị cần rà soát trước hạn, vẫn lưu record
      const rec = this._createDecisionRecord(doc, action, delegationMode, ownerInfo, instruction, null);
      return {
        ok: true,
        doc,
        decision: rec,
        action,
        message: action === EXEC_ACTIONS.REQUEST_REVISION
          ? `📝 Đã trả hồ sơ [${doc.code}] yêu cầu ${doc.senderDept} chỉnh sửa lại.`
          : `🔍 Đã yêu cầu ${ownerInfo.name} bổ sung thông tin cho [${doc.code}].`
      };
    }

    // 4. Hành động FORWARD (chuyển tiếp thẩm định sang phòng ban/NPC khác)
    if (action === EXEC_ACTIONS.FORWARD) {
      doc.defaultOwnerRoleKey = ownerRoleKey;
      doc.notes.unshift({ date: dateStr, text: `Chuyển tiếp thẩm định tới ${ownerInfo.name} (${ownerInfo.title})${instruction ? `: "${instruction}"` : ''}.` });
      docSys.setStatus(doc.id, DOC_STATUS.UNDER_REVIEW);
      const rec = this._createDecisionRecord(doc, action, delegationMode, ownerInfo, instruction, null);
      return {
        ok: true,
        doc,
        decision: rec,
        action,
        message: `📨 Đã chuyển tiếp hồ sơ [${doc.code}] cho ${ownerInfo.name} (${ownerInfo.title}) xem xét.`
      };
    }

    // 5. Hành động REJECT (Từ chối -> Thực thi hậu quả từ chối & Lưu trữ ngay)
    if (action === EXEC_ACTIONS.REJECT) {
      const rejectRes = this._executeImmediateReject(doc, ownerInfo, instruction);
      const rec = this._createDecisionRecord(doc, EXEC_ACTIONS.REJECT, delegationMode, ownerInfo, instruction, null);
      docSys.setStatus(doc.id, DOC_STATUS.REJECTED, rejectRes.note);
      this._notifyOnce(
        `dec_rej_${doc.id}`,
        'Văn Phòng Chủ Tịch PSG',
        `❌ Đã từ chối hồ sơ [${doc.code}]`,
        `${doc.title}. ${rejectRes.note}`,
        false
      );
      return {
        ok: true,
        doc,
        decision: rec,
        action,
        message: `❌ Đã từ chối & lưu trữ hồ sơ [${doc.code}]. ${rejectRes.note}`
      };
    }

    // 6. Hành động APPROVE / SIGN / ASSIGN_TASK -> PHÊ DUYỆT & CHUYỂN SANG THỰC THI ĐA BƯỚC (KHÔNG TỰ COMPLETED!)
    if (action === EXEC_ACTIONS.APPROVE || action === EXEC_ACTIONS.SIGN || action === EXEC_ACTIONS.ASSIGN_TASK) {
      // Kiểm tra nếu đã có task đang chạy cho doc này -> chống tạo trùng task!
      if (doc.executionTaskId) {
        const existingTask = this.getTaskById(doc.executionTaskId);
        if (existingTask && existingTask.status !== TASK_STATUS.FAILED && existingTask.status !== TASK_STATUS.CANCELLED) {
          return { ok: false, error: `Hồ sơ [${doc.code}] đã có nhiệm vụ thực thi (${existingTask.id}) đang theo dõi.` };
        }
      }

      // Kiểm tra điều kiện ngân sách ban đầu nếu là chi ngân sách lớn
      const preCheck = this._preValidateApproval(doc, options);
      if (!preCheck.ok) {
        return preCheck;
      }

      if (action === EXEC_ACTIONS.SIGN || doc.requiresSignature) {
        doc.signatureCaptured = true;
        doc.signedAt = dateStr;
      }

      // Chuyển trạng thái văn bản -> APPROVED (chưa COMPLETED!)
      docSys.setStatus(
        doc.id,
        DOC_STATUS.APPROVED,
        `Chủ tịch Phạm Minh Chiêu đã ký duyệt (${action}). Giao ${ownerInfo.name} tổ chức thực hiện.`
      );

      // Tạo ExecutionTask thực tế
      const task = this._createExecutionTaskForDoc(doc, action, delegationMode, ownerInfo, instruction, options);
      doc.executionTaskId = task.id;
      const rec = this._createDecisionRecord(doc, action, delegationMode, ownerInfo, instruction, task.id);

      // Thực hiện bước khởi tạo (Step 1: Giao việc / Đặt cọc / Gửi đề nghị) chứ KHÔNG đốt cháy giai đoạn hoàn tất toàn bộ!
      const step1Result = this._runTaskStep(task, 1, options);

      // Điều động NPC phụ trách di chuyển trong thế giới 3D (nếu có NpcSystem callback)
      this._triggerNpcMovementForTask(task);

      this._notifyOnce(
        `dec_app_${doc.id}_${task.id}`,
        `${ownerInfo.name} (${ownerInfo.dept})`,
        `✅ Tiếp nhận thực thi [${doc.code}]`,
        `${task.title} — Đã giao ${ownerInfo.name} triển khai (${step1Result.summary}). Theo dõi tại Tracker trên Mac.`,
        false,
        { actionType: 'open_action_tracker', taskId: task.id, actionLabel: 'Theo Dõi Tiến Độ' }
      );

      return {
        ok: true,
        doc,
        decision: rec,
        task,
        action,
        message: `✍️ Đã phê duyệt [${doc.code}] & giao ${ownerInfo.name} thực hiện (${task.statusLabel}: ${task.progress}%). ${step1Result.summary}`
      };
    }

    return { ok: false, error: `Hành động không hợp lệ: ${action}` };
  }

  _preValidateApproval(doc, options = {}) {
    const s = this.state;
    const budget = Number(s?.finance?.budget || 0);
    if (doc.sourceType === 'facility_upgrade') {
      const cost = Number(doc.extraPayload?.totalCost || Math.abs(doc.financialImpactM) || 0);
      const deposit = +(cost * 0.4).toFixed(1);
      if (budget < deposit) {
        return { ok: false, error: `Ngân sách CLB (€${budget.toFixed(1)}M) không đủ tiền đặt cọc khởi công €${deposit}M!` };
      }
    }
    if (doc.sourceType === 'pending_report') {
      const cost = Number(doc.extraPayload?.cost || 0);
      if (cost < 0 && budget < Math.abs(cost)) {
        return { ok: false, error: `Ngân sách CLB (€${budget.toFixed(1)}M) chưa đủ để chi €${Math.abs(cost).toFixed(1)}M!` };
      }
    }
    if (doc.sourceType === 'budget_proposal') {
      const cost = Number(doc.extraPayload?.costM || Math.abs(doc.financialImpactM) || 0);
      if (cost > 0 && budget < cost) {
        return { ok: false, error: `Ngân sách CLB (€${budget.toFixed(1)}M) chưa đủ để duyệt khoản chi €${cost.toFixed(1)}M!` };
      }
    }
    if (doc.sourceType === 'sponsor_offer') {
      const off = s?.commercialSystem?.sponsorOffers?.find((o) => o.id === doc.sourceRefId);
      const overallRep = s?.reputationSystem?.getOverallScore?.() ?? s?.president?.prestige ?? 80;
      if (off && overallRep < off.minPrestige) {
        return { ok: false, error: `Đối tác ${off.name} yêu cầu uy tín Chủ tịch ≥ ${off.minPrestige}/100 (hiện tại ${overallRep}).` };
      }
    }
    if (doc.sourceType === 'coach_hire_proposal' && options.buyoutCost > budget) {
      return { ok: false, error: `Không đủ ngân sách đền bù giải phóng hợp đồng HLV (€${options.buyoutCost}M).` };
    }
    return { ok: true };
  }

  _executeImmediateReject(doc, ownerInfo, instruction) {
    const s = this.state;
    if (doc.sourceType === 'incoming_bid' && doc.sourceRefId && s?.transferSystem) {
      s.transferSystem.rejectIncomingBid(doc.sourceRefId);
      return { note: `Đã gửi văn bản từ chối chính thức tới ${doc.extraPayload?.buyerClub || 'CLB đối tác'}.` };
    }
    if (doc.sourceType === 'pending_report' && doc.sourceRefId && s?.resolvePendingReport) {
      s.resolvePendingReport(doc.sourceRefId, false);
      return { note: `Đã thông báo ${doc.senderName} không duyệt đề xuất này.` };
    }
    if (doc.sourceType === 'sponsor_offer' && doc.sourceRefId && s?.commercialSystem?.sponsorOffers) {
      const idx = s.commercialSystem.sponsorOffers.findIndex((o) => o.id === doc.sourceRefId);
      if (idx !== -1) s.commercialSystem.sponsorOffers.splice(idx, 1);
      return { note: `Đã từ chối đề nghị tài trợ từ ${doc.extraPayload?.sponsorName || 'đối tác'}.` };
    }
    return {
      note: instruction
        ? `Chủ tịch từ chối với lý do: "${instruction}".`
        : `${ownerInfo.name} đã ghi nhận lệnh từ chối và đóng hồ sơ.`
    };
  }

  _createDecisionRecord(doc, action, delegationMode, ownerInfo, instruction, executionTaskId) {
    const rec = {
      id: `dec_${Date.now()}_${this._seq++}`,
      documentId: doc.id,
      documentCode: doc.code,
      documentTitle: doc.title,
      action,
      delegationMode,
      decidedAt: this._dateStr(),
      decidedWeek: this.state?.week || 1,
      decidedBy: 'Chủ tịch Phạm Minh Chiêu',
      assignedOwnerRoleKey: ownerInfo.roleKey,
      assignedOwnerNpcId: ownerInfo.npcId,
      assignedOwnerName: ownerInfo.name,
      instruction,
      executionTaskId: executionTaskId || null
    };
    this.decisions.unshift(rec);
    doc.decisionHistory.unshift(rec);
    if (this.decisions.length > 300) this.decisions.length = 300;
    return rec;
  }

  _createExecutionTaskForDoc(doc, action, delegationMode, ownerInfo, instruction, options = {}) {
    const id = `ex_task_${Date.now()}_${this._seq++}`;
    const totalDaysNeeded = this._estimateDurationDays(doc);
    const deadlineDays = Math.max(totalDaysNeeded + 1, Number(options.deadlineDays || totalDaysNeeded + 2));

    const steps = this._buildStepsForDoc(doc);

    const task = {
      id,
      documentId: doc.id,
      documentCode: doc.code,
      category: doc.category,
      sourceType: doc.sourceType,
      sourceRefId: doc.sourceRefId,
      title: doc.title,
      delegationMode,
      ownerRoleKey: ownerInfo.roleKey,
      ownerNpcId: ownerInfo.npcId,
      ownerName: ownerInfo.name,
      ownerTitle: ownerInfo.title,
      department: ownerInfo.dept,
      status: TASK_STATUS.ASSIGNED,
      statusLabel: 'Đã giao phụ trách',
      progress: 12,
      currentStepIdx: 0,
      totalSteps: steps.length,
      steps,
      daysElapsed: 0,
      estimatedDays: totalDaysNeeded,
      deadlineDays,
      createdDate: this._dateStr(),
      createdWeek: this.state?.week || 1,
      blocker: null,
      failureReason: null,
      financialCommittedM: 0,
      financialRemainingM: Math.abs(Number(doc.financialImpactM || 0)),
      instructionHistory: instruction ? [{ date: this._dateStr(), text: instruction }] : [],
      reports: [
        {
          date: this._dateStr(),
          author: ownerInfo.name,
          status: TASK_STATUS.ASSIGNED,
          text: `Đã tiếp nhận hồ sơ [${doc.code}] từ Chủ tịch theo chế độ "${delegationMode}". Bắt đầu bước 1/${steps.length}.`
        }
      ],
      extraPayload: { ...(doc.extraPayload || {}), ...(options.extraPayload || {}), counterFee: options.counterFee || null },
      completedDate: null
    };

    this.executionTasks.unshift(task);
    return task;
  }

  _estimateDurationDays(doc) {
    if (doc.sourceType === 'facility_upgrade') return 4;
    if (doc.sourceType === 'incoming_bid' || doc.sourceType === 'player_buy' || doc.sourceType === 'player_renewal') return 2;
    if (doc.sourceType === 'coach_hire_proposal' || doc.sourceType === 'coach_vacancy') return 2;
    if (doc.sourceType === 'sponsor_offer') return 3;
    if (doc.sourceType === 'crisis') return 1;
    if (doc.sourceType === 'strategic_directive') return 4;
    return 2;
  }

  _buildStepsForDoc(doc) {
    if (doc.sourceType === 'facility_upgrade') {
      return [
        { name: 'Giải ngân đặt cọc 40% & Ký lệnh khởi công', done: false },
        { name: 'Thi công lắp đặt thiết bị chuyên môn', done: false },
        { name: 'Nghiệm thu kỹ thuật, tất toán 60% & Bàn giao', done: false }
      ];
    }
    if (doc.sourceType === 'incoming_bid' || doc.sourceType === 'player_buy' || doc.sourceType === 'player_renewal') {
      return [
        { name: 'Gửi văn bản điều khoản tới đối tác / người đại diện', done: false },
        { name: 'Đàm phán chốt phí & Chờ kiểm tra y tế / xác nhận FFP', done: false },
        { name: 'Ký hợp đồng chính thức, cập nhật đội hình & tài chính', done: false }
      ];
    }
    if (doc.sourceType === 'sponsor_offer') {
      return [
        { name: 'Thẩm định pháp lý & điều khoản thương mại', done: false },
        { name: 'Thống nhất lịch công bố & quyền lợi thương hiệu', done: false },
        { name: 'Ký hợp đồng tài trợ, ghi nhận doanh thu & sự kiện', done: false }
      ];
    }
    if (doc.sourceType === 'coach_hire_proposal' || doc.sourceType === 'coach_vacancy') {
      return [
        { name: 'Tiếp xúc ứng viên & thống nhất triết lý chuyên môn', done: false },
        { name: 'Hoàn tất hợp đồng & Bổ nhiệm chính thức tại Campus PSG', done: false }
      ];
    }
    return [
      { name: 'Lên kế hoạch & điều phối bộ phận', done: false },
      { name: 'Triển khai thực tế & kiểm tra kết quả', done: false }
    ];
  }

  _runTaskStep(task, stepNumber, options = {}) {
    const s = this.state;
    const stepIdx = Math.max(0, Math.min(task.steps.length - 1, stepNumber - 1));
    task.currentStepIdx = stepIdx;
    task.steps[stepIdx].done = true;

    // Step 1 logic (khởi động thực tế — không tự đốt cháy kết quả cuối!)
    if (stepNumber === 1) {
      task.status = TASK_STATUS.IN_PROGRESS;
      task.statusLabel = 'Đang thực hiện';
      task.progress = Math.max(task.progress, Math.round((1 / task.totalSteps) * 45));

      if (task.sourceType === 'facility_upgrade') {
        const totalCost = Number(task.extraPayload.totalCost || 14);
        const deposit = +(totalCost * 0.4).toFixed(1);
        if (s?.finance?.budget >= deposit) {
          s.addLedger(`Tạm ứng 40% khởi công nâng cấp CSVC (${task.extraPayload.facilityId})`, -deposit, {
            txKey: `fac_dep_${task.id}`,
            category: 'Cơ sở vật chất'
          });
          task.financialCommittedM = deposit;
          task.financialRemainingM = +(totalCost - deposit).toFixed(1);
          return { summary: `Đã giải ngân đặt cọc 40% (-€${deposit}M) và khởi công giai đoạn 1.` };
        }
      }

      if (task.sourceType === 'incoming_bid' && task.extraPayload?.bidId) {
        const counterFee = Number(options.counterFee || 0);
        if (counterFee > 0 && s?.transferSystem) {
          task.status = TASK_STATUS.WAITING_RESPONSE;
          task.statusLabel = 'Chờ phản hồi đối tác';
          return { summary: `Đã gửi văn bản phản đề nghị €${counterFee}M tới ${task.extraPayload.buyerClub}, đang chờ hồi âm.` };
        }
        return { summary: `Đã giao ${task.ownerName} liên hệ chốt giấy tờ & kiểm tra điều kiện với ${task.extraPayload.buyerClub}.` };
      }

      if (task.sourceType === 'coach_fire_action') {
        // Sa thải HLV trưởng ngay lập tức -> xóa tên HLV cũ khỏi toàn bộ trạng thái!
        const rk = task.extraPayload?.roleKey || 'head_coach';
        const fireRes = s?.managerSystem?.fireStaff?.(rk, task.instructionHistory?.[0]?.text || 'Quyết định của Chủ tịch PSG');
        if (fireRes?.ok) {
          this.handleStaffDeparted(rk, fireRes.departed?.name || 'HLV cũ', 'Miễn nhiệm theo quyết định Chủ tịch');
          this._docSys()?.syncFromClubState();
          return { summary: `Đã chấm dứt hợp đồng với ${fireRes.departed.name} (đền bù €${fireRes.severance}M). Hồ sơ tuyển HLV mới đã được đẩy lên khay KHẨN!` };
        }
      }

      return { summary: `Bước 1/ ${task.totalSteps}: ${task.steps[0].name} đã triển khai.` };
    }

    // Step giữa (Step 2 nếu có 3 bước): có thể gặp phản hồi đối tác / vướng mắc thực tế!
    if (stepNumber < task.totalSteps) {
      task.progress = Math.max(task.progress, Math.round((stepNumber / task.totalSteps) * 78));

      // Kiểm tra chế độ APPROVAL_REQUIRED -> dừng chờ Chủ tịch duyệt bước chốt
      if (task.delegationMode === DELEGATION_MODE.APPROVAL_REQUIRED && !task._finalApprovalGranted) {
        task.status = TASK_STATUS.BLOCKED;
        task.statusLabel = 'Chờ Chủ tịch ký duyệt chốt';
        task.blocker = {
          type: 'PRESIDENT_FINAL_SIGN',
          title: 'Chờ Chủ tịch xác nhận bước cuối cùng',
          detail: `${task.ownerName} đã hoàn tất đàm phán/chuẩn bị kỹ thuật. Do chế độ "Cần Chủ tịch duyệt bước chốt", nhiệm vụ cần Chủ tịch xác nhận tiếp tục.`,
          needsUrgentEscalation: true
        };
        this._escalateTaskBlocker(task);
        return { summary: `Đang tạm dừng chờ Chủ tịch phê duyệt bước cuối.` };
      }

      // Khả năng phát sinh trở ngại thực tế dựa trên loại việc & năng lực NPC
      const evalRec = this.staffEvaluations[task.ownerRoleKey];
      const skill = evalRec?.competency ?? 82;
      if (task.sourceType === 'facility_upgrade' && s?.finance?.budget < task.financialRemainingM) {
        task.status = TASK_STATUS.BLOCKED;
        task.statusLabel = 'Thiếu ngân sách tất toán';
        task.blocker = {
          type: 'INSUFFICIENT_BUDGET',
          title: 'Ngân sách CLB không đủ giải ngân đợt cuối',
          detail: `Cần €${task.financialRemainingM}M để tất toán & đưa công trình vào sử dụng, nhưng ngân sách khả dụng chỉ còn €${s.finance.budget.toFixed(1)}M.`
        };
        this._escalateTaskBlocker(task);
        return { summary: 'Dự án tạm ngưng do thiếu ngân sách đợt cuối!' };
      }

      if (task.sourceType === 'incoming_bid' && task.extraPayload?.counterFee && !task._counterChecked) {
        task._counterChecked = true;
        const bid = s?.transferSystem?.incomingBids?.find((b) => b.id === task.sourceRefId);
        if (bid) {
          const cntRes = s.transferSystem.counterIncomingBid(bid.id, task.extraPayload.counterFee);
          if (cntRes?.outcome === 'rejected' || !s.transferSystem.incomingBids.some((b) => b.id === bid.id)) {
            return this._failTask(task, `${bid.buyerClub} đã rút lui khỏi bàn đàm phán vì không chấp nhận mức ép giá €${task.extraPayload.counterFee}M.`);
          }
          task.status = TASK_STATUS.WAITING_RESPONSE;
          task.statusLabel = 'Đang chốt thỏa thuận mới';
          return { summary: cntRes.message || 'Đối tác đã phản hồi nâng giá.' };
        }
      }

      if (skill < 74 && Math.random() < 0.25 && !task._hadMinorDelay) {
        task._hadMinorDelay = true;
        task.estimatedDays += 1;
        task.reports.unshift({
          date: this._dateStr(),
          author: task.ownerName,
          status: TASK_STATUS.WAITING_RESPONSE,
          text: 'Phát sinh chậm trễ nhỏ trong khâu rà soát hồ sơ với đối tác, dự kiến cần thêm 1 ngày.'
        });
        return { summary: 'Phát sinh chậm tiến độ nhẹ 1 ngày trong quá trình xử lý.' };
      }

      task.status = TASK_STATUS.IN_PROGRESS;
      task.statusLabel = 'Đang hoàn thiện';
      return { summary: `Đã hoàn tất bước ${stepNumber}/${task.totalSteps}: ${task.steps[stepIdx].name}.` };
    }

    // Nếu ở bước cuối cùng nhưng chế độ APPROVAL_REQUIRED chưa được Chủ tịch duyệt chốt -> Tạm chặn chờ duyệt chốt!
    if (task.delegationMode === DELEGATION_MODE.APPROVAL_REQUIRED && !task._finalApprovalGranted) {
      task.steps[stepIdx].done = false;
      task.status = TASK_STATUS.BLOCKED;
      task.statusLabel = 'Chờ Chủ tịch ký duyệt chốt';
      task.blocker = {
        type: 'PRESIDENT_FINAL_SIGN',
        title: 'Chờ Chủ tịch xác nhận bước cuối cùng',
        detail: `${task.ownerName} đã hoàn tất bước chuẩn bị. Do chế độ "Cần Chủ tịch duyệt bước chốt", nhiệm vụ cần Chủ tịch xác nhận để hoàn công.`,
        needsUrgentEscalation: true
      };
      this._escalateTaskBlocker(task);
      return { summary: 'Đang tạm dừng chờ Chủ tịch phê duyệt bước cuối.' };
    }

    // Bước cuối: Thực thi hoàn tất nghiệp vụ thật vào GameState!
    return this._completeTaskRealOutcome(task);
  }

  _completeTaskRealOutcome(task) {
    const s = this.state;
    const docSys = this._docSys();
    const doc = docSys?.getDocumentById(task.documentId);
    let outcomeSummary = 'Đã hoàn thành đầy đủ nhiệm vụ theo chỉ đạo.';

    if (task.sourceType === 'incoming_bid') {
      const bid = s?.transferSystem?.incomingBids?.find((b) => b.id === task.sourceRefId);
      if (!bid) {
        return this._failTask(task, 'Đề nghị chuyển nhượng đã hết hạn hoặc bị đối tác rút lại trước khi ký.');
      }
      const res = s.transferSystem.acceptIncomingBid(bid.id);
      if (!res?.ok) {
        return this._failTask(task, res?.error || 'Không thể hoàn tất chuyển nhượng.');
      }
      outcomeSummary = `💰 Hoàn tất chuyển nhượng ${res.deal.playerName} sang ${res.deal.to} (+€${res.deal.fee}M)!`;
    } else if (task.sourceType === 'pending_report') {
      const rep = s?.pendingReports?.find((r) => r.id === task.sourceRefId);
      if (rep) {
        if (rep.cost < 0 && (s.finance?.budget || 0) < Math.abs(rep.cost)) {
          return this._failTask(task, `Ngân sách CLB không đủ chi €${Math.abs(rep.cost)}M tại thời điểm giải ngân.`);
        }
        s.resolvePendingReport(rep.id, true);
      }
      outcomeSummary = `Đã hoàn tất triển khai đề xuất "${task.title}" và cập nhật hiệu suất bộ phận.`;
    } else if (task.sourceType === 'sponsor_offer') {
      const off = s?.commercialSystem?.sponsorOffers?.find((o) => o.id === task.sourceRefId);
      if (!off) {
        return this._failTask(task, 'Đề nghị tài trợ không còn hiệu lực.');
      }
      const res = s.commercialSystem.signSponsorOffer(off.id);
      if (!res?.ok) {
        return this._failTask(task, res?.error || 'Đối tác từ chối ký kết ở phút chót.');
      }
      outcomeSummary = `🤝 Đã ký chính thức hợp đồng tài trợ ${res.sponsor.name} (+€${res.sponsor.annualValueM}M/năm)!`;
    } else if (task.sourceType === 'facility_upgrade') {
      const fid = task.extraPayload?.facilityId;
      const fac = s?.commercialSystem?.facilities?.[fid];
      if (!fac) return this._failTask(task, 'Không tìm thấy hạng mục cơ sở vật chất.');
      if ((s?.finance?.budget || 0) < task.financialRemainingM) {
        task.status = TASK_STATUS.BLOCKED;
        task.statusLabel = 'Thiếu ngân sách tất toán';
        task.blocker = {
          type: 'INSUFFICIENT_BUDGET',
          title: 'Thiếu ngân sách tất toán 60% còn lại',
          detail: `Cần €${task.financialRemainingM}M để nghiệm thu ${fid}.`
        };
        this._escalateTaskBlocker(task);
        return { summary: task.blocker.detail };
      }
      if (task.financialRemainingM > 0) {
        s.addLedger(`Nghiệm thu & tất toán 60% nâng cấp CSVC (${fid})`, -task.financialRemainingM, {
          txKey: `fac_fin_${task.id}`,
          category: 'Cơ sở vật chất'
        });
      }
      fac.level = Math.min(5, Math.max(fac.level + 1, Number(task.extraPayload?.targetLevel || fac.level + 1)));
      fac.condition = 100;
      s.reputationSystem?.applyDelta({ governanceSkill: +3, playerTrust: +2, coachTrust: +2 }, `Hoàn công nâng cấp ${fid} lên Cấp ${fac.level}`);
      s.eventBus?.emit('FACILITY_UPGRADED', { facilityId: fid, newLevel: fac.level, cost: task.extraPayload?.totalCost || 0 });
      outcomeSummary = `🏟️ Đã nghiệm thu nâng cấp ${fid} lên Cấp ${fac.level}/5 và đưa vào vận hành!`;
    } else if (task.sourceType === 'player_renewal') {
      const res = s?.renewPsgPlayerContract?.(task.extraPayload?.playerId, task.extraPayload?.addYears || 3, task.extraPayload?.targetWage);
      if (!res?.ok) {
        return this._failTask(task, res?.error || 'Cầu thủ không đồng ý gia hạn vào lúc này.');
      }
      outcomeSummary = `✍️ Đã ký gia hạn thành công với ${res.player.name} (+${res.newYears} năm · €${res.newWage}k/tuần).`;
    } else if (task.sourceType === 'coach_vacancy' || task.sourceType === 'coach_hire_proposal') {
      const candId = task.extraPayload?.candidateId;
      const roleKey = task.extraPayload?.roleKey || 'head_coach';
      const cand = candId
        ? s?.managerSystem?.getById?.(candId)
        : s?.managerSystem?.getCandidatesForRole?.(roleKey)?.[0];
      if (!cand) {
        return this._failTask(task, 'Không tìm thấy ứng viên HLV khả dụng để hoàn tất ký kết.');
      }
      const offerWage = Number(task.extraPayload?.offerWage || cand.wage || 120);
      const offerYears = Number(task.extraPayload?.offerYears || cand.contractYears || 3);
      const negRes = s?.managerSystem?.negotiateOffer?.(cand.staffId, { wage: offerWage, contractYears: offerYears });
      if (negRes && negRes.outcome === 'rejected') {
        return this._failTask(task, negRes.message || 'Ứng viên từ chối đề nghị hợp đồng.');
      }
      if (negRes && negRes.outcome === 'counter' && task.delegationMode === DELEGATION_MODE.APPROVAL_REQUIRED) {
        task.status = TASK_STATUS.BLOCKED;
        task.statusLabel = 'Ứng viên phản đề nghị lương';
        task.blocker = {
          type: 'CANDIDATE_COUNTER',
          title: `${cand.name} yêu cầu điều chỉnh đãi ngộ`,
          detail: negRes.message
        };
        if (negRes.counterOffer) {
          task.extraPayload.offerWage = negRes.counterOffer.wage;
          task.extraPayload.offerYears = negRes.counterOffer.contractYears;
        }
        this._escalateTaskBlocker(task);
        return { summary: negRes.message };
      }
      const finalTerms = negRes?.agreedOffer || negRes?.counterOffer || { wage: offerWage, contractYears: offerYears };
      const hireRes = s?.managerSystem?.appointStaff?.(cand.staffId, finalTerms);
      if (!hireRes?.ok) {
        return this._failTask(task, hireRes?.error || 'Không thể hoàn tất bổ nhiệm ứng viên.');
      }
      outcomeSummary = `👔 Đã chính thức bổ nhiệm ${cand.name} làm ${cand.role} của Paris Saint-Germain!`;
    } else if (task.sourceType === 'crisis') {
      const cr = s?.rumorCrisisSystem?.crises?.find((c) => c.id === task.sourceRefId);
      if (cr && cr.status === 'active') {
        const optKey = task.extraPayload?.defaultOptKey || cr.options?.[0]?.key;
        s.rumorCrisisSystem.resolveCrisis(cr.id, optKey);
      }
      outcomeSummary = '🛡️ Đã hoàn tất chiến dịch dập tắt khủng hoảng & ổn định dư luận truyền thông PSG.';
    } else if (task.sourceType === 'strategic_directive') {
      s?.departments?.forEach((d) => {
        d.performance = Math.min(100, d.performance + 3);
      });
      s.reputationSystem?.applyDelta({ governanceSkill: +3 }, 'Hoàn tất triển khai Nghị quyết Chiến lược CLB');
      outcomeSummary = '📈 12 phòng ban PSG đã đồng bộ KPI quý mới (+3% hiệu suất toàn khối).';
    } else if (task.sourceType === 'budget_proposal') {
      const costM = Math.abs(Number(task.extraPayload?.costM || task.financialRemainingM || 0));
      if (costM > 0) {
        if ((s?.finance?.budget || 0) < costM) {
          task.status = TASK_STATUS.BLOCKED;
          task.statusLabel = 'Thiếu ngân sách giải ngân';
          task.blocker = {
            type: 'INSUFFICIENT_BUDGET',
            title: 'Ngân sách không đủ giải ngân',
            detail: `Cần €${costM}M nhưng ngân sách khả dụng chỉ còn €${s.finance.budget.toFixed(1)}M.`
          };
          this._escalateTaskBlocker(task);
          return { summary: task.blocker.detail };
        }
        s.addLedger(`Giải ngân theo hồ sơ [${task.documentCode}]: ${task.title}`, -costM, {
          txKey: `bud_${task.id}`,
          category: 'Đầu tư Điều hành'
        });
      }
      s?.reputationSystem?.applyDelta({ governanceSkill: +2 }, `Hoàn tất giải ngân ${task.title}`);
      outcomeSummary = `💶 Đã hoàn tất thẩm định & giải ngân €${costM.toFixed(1)}M cho "${task.title}".`;
    }

    task.status = TASK_STATUS.COMPLETED;
    task.statusLabel = 'Đã hoàn thành';
    task.progress = 100;
    task.completedDate = this._dateStr();
    task.blocker = null;
    task.reports.unshift({
      date: this._dateStr(),
      author: task.ownerName,
      status: TASK_STATUS.COMPLETED,
      text: outcomeSummary
    });

    if (doc) {
      docSys?.setStatus(doc.id, DOC_STATUS.COMPLETED, outcomeSummary);
    }

    // Ghi nhận đánh giá NPC hoàn thành đúng hạn / trễ hạn
    const onTime = task.daysElapsed <= task.deadlineDays;
    this._recordStaffEvaluation(task.ownerRoleKey, 'completed', onTime, outcomeSummary);

    // Nếu người vừa hoàn thành là nhân sự cốt cán -> hẹn báo cáo trực tiếp tại phòng Chủ tịch nếu phù hợp
    if (task.ownerNpcId) {
      this._queueOfficeVisit({
        npcId: task.ownerNpcId,
        npcName: task.ownerName,
        taskId: task.id,
        reasonType: 'completed',
        headline: `Báo cáo hoàn tất: ${task.title}`,
        dialogue: `${outcomeSummary} Tôi đã cập nhật đầy đủ chứng từ lên hệ thống macOS và Văn thư Lưu trữ.`
      });
    }

    this._notifyOnce(
      `task_done_${task.id}`,
      `${task.ownerName} (${task.department})`,
      `✅ Hoàn thành: ${task.documentCode}`,
      outcomeSummary,
      false,
      { actionType: 'open_action_tracker', taskId: task.id, actionLabel: 'Xem Kết Quả' }
    );

    return { summary: outcomeSummary };
  }

  _failTask(task, reason) {
    task.status = TASK_STATUS.FAILED;
    task.statusLabel = 'Thất bại';
    task.failureReason = reason;
    task.reports.unshift({
      date: this._dateStr(),
      author: task.ownerName,
      status: TASK_STATUS.FAILED,
      text: `❌ Thất bại: ${reason}`
    });
    const doc = this._docSys()?.getDocumentById(task.documentId);
    if (doc) {
      // Nếu là hồ sơ chuyển nhượng/tuyển dụng thất bại -> đẩy lên khay khẩn hoặc lưu lý do thất bại
      this._docSys().setStatus(doc.id, DOC_STATUS.REJECTED, `Thực thi thất bại: ${reason}`);
    }
    this._recordStaffEvaluation(task.ownerRoleKey, 'failed', false, reason);

    this._notifyOnce(
      `task_fail_${task.id}`,
      `${task.ownerName} (${task.department})`,
      `⚠️ Nhiệm vụ thất bại [${task.documentCode}]`,
      reason,
      true,
      { actionType: 'open_action_tracker', taskId: task.id, actionLabel: 'Kiểm Tra Nguyên Nhân' }
    );
    return { summary: reason };
  }

  _escalateTaskBlocker(task) {
    const doc = this._docSys()?.getDocumentById(task.documentId);
    if (doc) {
      doc.isEscalated = true;
      doc.priority = DOC_PRIORITY.URGENT;
    }
    if (task.ownerNpcId) {
      this._queueOfficeVisit({
        npcId: task.ownerNpcId,
        npcName: task.ownerName,
        taskId: task.id,
        reasonType: 'blocked',
        headline: `Báo cáo vướng mắc: ${task.title}`,
        dialogue: task.blocker?.detail || 'Nhiệm vụ đang gặp trở ngại cần Chủ tịch trực tiếp tháo gỡ.'
      });
    }
    this._notifyOnce(
      `task_blk_${task.id}_${task.blocker?.type || 'blk'}`,
      `${task.ownerName} (${task.department})`,
      `🚧 Vướng mắc cần chỉ đạo [${task.documentCode}]`,
      task.blocker?.detail || 'Nhiệm vụ đang bị chặn và cần quyết định mới từ Chủ tịch.',
      true,
      { actionType: 'open_action_tracker', taskId: task.id, actionLabel: 'Xử Lý Vướng Mắc' }
    );
  }

  _recordStaffEvaluation(roleKey, outcome, onTime, note) {
    const ev = this.staffEvaluations[roleKey];
    if (!ev) return;
    if (outcome === 'completed') {
      ev.completedCount++;
      if (onTime) {
        ev.onTimeCount++;
        ev.competency = Math.min(99, ev.competency + 1);
      } else {
        ev.delayedCount++;
        // Trễ nhẹ KHÔNG tự động sa thải — chỉ giảm nhẹ điểm đánh giá (-2)
        ev.competency = Math.max(45, ev.competency - 2);
      }
    } else if (outcome === 'failed') {
      ev.failedCount++;
      ev.competency = Math.max(40, ev.competency - 3);
    }
    if (note) {
      ev.notes.unshift({ date: this._dateStr(), text: note });
      if (ev.notes.length > 15) ev.notes.length = 15;
    }
  }

  _triggerNpcMovementForTask(task) {
    const npc = this.state?.npcs?.find((n) => n.id === task.ownerNpcId);
    if (npc) {
      npc.task = `Thực thi [${task.documentCode}]: ${task.title}`;
      npc.memory = npc.memory || [];
      npc.memory.unshift(`${this._dateStr()}: Tiếp nhận hồ sơ [${task.documentCode}] từ Chủ tịch.`);
    }
    if (typeof this.state?._onDispatchNpcTask === 'function' && task.ownerNpcId) {
      this.state._onDispatchNpcTask(task.ownerNpcId, task.sourceType);
    }
  }

  // ==================== CHỦ TỊCH CAN THIỆP TRÊN ACTION TRACKER ====================

  requestReport(taskId) {
    const task = this.getTaskById(taskId);
    if (!task) return { ok: false, error: 'Không tìm thấy nhiệm vụ.' };
    const stepText = task.steps?.[task.currentStepIdx]?.name || 'Đang xử lý';
    const reportText = `Báo cáo nhanh từ ${task.ownerName}: Tiến độ hiện đạt ${task.progress}% (${task.statusLabel}). Giai đoạn: "${stepText}". Đã trôi ${task.daysElapsed}/${task.deadlineDays} ngày.${task.blocker ? ` Vướng mắc: ${task.blocker.detail}` : ''}`;
    task.reports.unshift({ date: this._dateStr(), author: task.ownerName, status: task.status, text: reportText });
    return { ok: true, task, reportText };
  }

  sendInstruction(taskId, text) {
    const task = this.getTaskById(taskId);
    if (!task) return { ok: false, error: 'Không tìm thấy nhiệm vụ.' };
    const clean = String(text || '').trim();
    if (!clean) return { ok: false, error: 'Nội dung chỉ đạo không được để trống.' };
    task.instructionHistory.unshift({ date: this._dateStr(), text: clean });
    task.reports.unshift({
      date: this._dateStr(),
      author: 'Chủ tịch Phạm Minh Chiêu',
      status: task.status,
      text: `Chỉ đạo mới: "${clean}" (Đã gửi tới ${task.ownerName}).`
    });
    // Chỉ đạo quyết liệt giúp tăng tốc nhẹ tiến độ
    if (task.status === TASK_STATUS.BLOCKED && task.blocker?.type === 'PRESIDENT_FINAL_SIGN') {
      task._finalApprovalGranted = true;
      task.status = TASK_STATUS.IN_PROGRESS;
      task.statusLabel = 'Chủ tịch đã duyệt chốt';
      task.blocker = null;
    }
    return { ok: true, task };
  }

  extendDeadline(taskId, extraDays = 3) {
    const task = this.getTaskById(taskId);
    if (!task) return { ok: false, error: 'Không tìm thấy nhiệm vụ.' };
    task.deadlineDays += Math.max(1, Number(extraDays || 3));
    task.reports.unshift({
      date: this._dateStr(),
      author: 'Chủ tịch Phạm Minh Chiêu',
      status: task.status,
      text: `Gia hạn thêm +${extraDays} ngày (Hạn mới: ${task.deadlineDays} ngày).`
    });
    return { ok: true, task };
  }

  reassignOwner(taskId, newRoleKey) {
    const task = this.getTaskById(taskId);
    if (!task) return { ok: false, error: 'Không tìm thấy nhiệm vụ.' };
    const newOwner = this.resolveOwnerNpc(newRoleKey);
    const oldName = task.ownerName;
    task.ownerRoleKey = newOwner.roleKey;
    task.ownerNpcId = newOwner.npcId;
    task.ownerName = newOwner.name;
    task.ownerTitle = newOwner.title;
    task.department = newOwner.dept;
    if (task.status === TASK_STATUS.BLOCKED && task.blocker?.type === 'OWNER_DEPARTED') {
      task.status = TASK_STATUS.IN_PROGRESS;
      task.statusLabel = 'Đã bàn giao người mới';
      task.blocker = null;
    }
    task.reports.unshift({
      date: this._dateStr(),
      author: 'Chủ tịch Phạm Minh Chiêu',
      status: task.status,
      text: `Điều chuyển phụ trách từ ${oldName} sang ${newOwner.name} (${newOwner.title}).`
    });
    this._triggerNpcMovementForTask(task);
    return { ok: true, task, newOwner };
  }

  demandExplanation(taskId) {
    const task = this.getTaskById(taskId);
    if (!task) return { ok: false, error: 'Không tìm thấy nhiệm vụ.' };
    const owner = this.resolveOwnerNpc(task.ownerRoleKey);
    const reply = task.blocker
      ? `${owner.name}: "Thưa Chủ tịch, tiến độ đang bị chững lại do: ${task.blocker.detail}. Tôi đề xuất giải pháp tháo gỡ ngay."`
      : `${owner.name}: "Thưa Chủ tịch, chúng tôi đang bám sát quy trình từng bước để tránh rủi ro pháp lý/tài chính. Hiện đạt ${task.progress}%."`;
    task.reports.unshift({ date: this._dateStr(), author: owner.name, status: task.status, text: `Giải trình trước Chủ tịch: ${reply}` });
    return { ok: true, task, reply };
  }

  pauseTask(taskId) {
    const task = this.getTaskById(taskId);
    if (!task) return { ok: false, error: 'Không tìm thấy nhiệm vụ.' };
    if (task.status === TASK_STATUS.PAUSED) {
      task.status = TASK_STATUS.IN_PROGRESS;
      task.statusLabel = 'Tiếp tục thực hiện';
    } else if (task.status !== TASK_STATUS.COMPLETED && task.status !== TASK_STATUS.FAILED && task.status !== TASK_STATUS.CANCELLED) {
      task.status = TASK_STATUS.PAUSED;
      task.statusLabel = 'Tạm dừng theo lệnh';
    }
    return { ok: true, task };
  }

  cancelTask(taskId, reason = 'Chủ tịch ra lệnh hủy bỏ kế hoạch') {
    const task = this.getTaskById(taskId);
    if (!task) return { ok: false, error: 'Không tìm thấy nhiệm vụ.' };
    task.status = TASK_STATUS.CANCELLED;
    task.statusLabel = 'Đã hủy';
    task.failureReason = reason;
    task.reports.unshift({ date: this._dateStr(), author: 'Chủ tịch Phạm Minh Chiêu', status: TASK_STATUS.CANCELLED, text: reason });
    const doc = this._docSys()?.getDocumentById(task.documentId);
    if (doc) this._docSys().setStatus(doc.id, DOC_STATUS.ARCHIVED, reason);
    return { ok: true, task };
  }

  resolveBlockerAndContinue(taskId) {
    const task = this.getTaskById(taskId);
    if (!task) return { ok: false, error: 'Không tìm thấy nhiệm vụ.' };
    task._finalApprovalGranted = true;
    if (task.blocker?.type === 'INSUFFICIENT_BUDGET' && (this.state?.finance?.budget || 0) < task.financialRemainingM) {
      return { ok: false, error: `Ngân sách vẫn chỉ còn €${this.state.finance.budget.toFixed(1)}M, chưa đủ €${task.financialRemainingM}M!` };
    }
    task.blocker = null;
    task.status = TASK_STATUS.IN_PROGRESS;
    task.statusLabel = 'Đang tiếp tục thực thi';
    const nextStep = Math.min(task.totalSteps, task.currentStepIdx + 2);
    const res = this._runTaskStep(task, nextStep);
    return { ok: true, task, message: res.summary };
  }

  // ==================== BẢO VỆ KHI NPC RỜI CLB GIỮA CHỪNG ====================

  handleStaffDeparted(roleKey, oldName, reason = 'Nhân sự đã rời Paris Saint-Germain') {
    const impacted = [];
    for (const task of this.executionTasks) {
      if (
        task.ownerRoleKey === roleKey &&
        task.status !== TASK_STATUS.COMPLETED &&
        task.status !== TASK_STATUS.FAILED &&
        task.status !== TASK_STATUS.CANCELLED
      ) {
        task.status = TASK_STATUS.BLOCKED;
        task.statusLabel = 'Chờ bàn giao (Nhân sự cũ đã rời CLB)';
        task.ownerName = `Trống vị trí (${ROLE_RESPONSIBILITY_MAP[roleKey]?.title || roleKey})`;
        task.ownerNpcId = null;
        task.blocker = {
          type: 'OWNER_DEPARTED',
          title: `${oldName} đã rời PSG giữa chừng`,
          detail: `${oldName} (${reason}) không còn tại vị. Chủ tịch hãy điều chuyển nhiệm vụ [${task.documentCode}] sang CEO hoặc người kế nhiệm.`
        };
        task.reports.unshift({
          date: this._dateStr(),
          author: 'Hệ thống Điều Hành PSG',
          status: TASK_STATUS.BLOCKED,
          text: `⚠️ ${oldName} đã rời CLB. Nhiệm vụ đang tạm dừng chờ bàn giao người phụ trách mới.`
        });
        impacted.push(task);
        this._escalateTaskBlocker(task);
      }
    }
    return impacted;
  }

  // ==================== TIẾN TRIỂN THEO THỜI GIAN THỰC TRONG GAME ====================

  advanceTimeDays(daysPassed = 1) {
    const days = Math.max(1, Number(daysPassed || 1));
    const docSys = this._docSys();

    // 1. Giảm dần daysUntilDeadline của các văn bản giấy đang chờ duyệt
    if (docSys) {
      for (const d of docSys.documents) {
        if (Number.isFinite(d.daysUntilDeadline) && d.daysUntilDeadline > 0) {
          d.daysUntilDeadline = Math.max(0, d.daysUntilDeadline - days);
          if (d.daysUntilDeadline <= 2 && !d.hasDeadlineWarning) {
            d.hasDeadlineWarning = true;
            d.priority = DOC_PRIORITY.URGENT;
          }
        }
      }
      docSys.syncFromClubState();
    }

    // 2. Tiến triển từng ExecutionTask đang chạy (trừ PAUSED, BLOCKED, COMPLETED, FAILED, CANCELLED)
    for (const task of this.executionTasks) {
      if (
        task.status !== TASK_STATUS.ASSIGNED &&
        task.status !== TASK_STATUS.IN_PROGRESS &&
        task.status !== TASK_STATUS.WAITING_RESPONSE
      ) {
        continue;
      }

      // Guard nếu NPC rời CLB mà chưa kịp hook
      if (task.ownerRoleKey === 'head_coach' && this.state?.coach?.vacant && task.sourceType !== 'coach_vacancy') {
        this.handleStaffDeparted('head_coach', 'HLV tiền nhiệm', 'Vị trí đang trống');
        continue;
      }

      task.daysElapsed += days;
      const evalSkill = this.staffEvaluations[task.ownerRoleKey]?.competency ?? 82;
      const speedFactor = (task.delegationMode === DELEGATION_MODE.DIRECT_CONTROL ? 1.15 : 1.0) * (evalSkill >= 85 ? 1.1 : 1.0);
      const effectiveProgressTarget = Math.min(100, Math.round((task.daysElapsed / Math.max(1, task.estimatedDays)) * 100 * speedFactor));

      if (task.daysElapsed > task.deadlineDays && task.status !== TASK_STATUS.COMPLETED) {
        task.reports.unshift({
          date: this._dateStr(),
          author: task.ownerName,
          status: task.status,
          text: `⏳ Cảnh báo quá hạn (${task.daysElapsed}/${task.deadlineDays} ngày): Đang khẩn trương xử lý các bước cuối.`
        });
      }

      if (effectiveProgressTarget >= 100) {
        // Đạt mốc hoàn thành bước cuối
        this._runTaskStep(task, task.totalSteps);
      } else if (effectiveProgressTarget >= 50 && task.currentStepIdx === 0 && task.totalSteps >= 2) {
        this._runTaskStep(task, 2);
      } else {
        task.progress = Math.max(task.progress, Math.min(90, effectiveProgressTarget));
      }
    }
  }

  // ==================== BÁO CÁO ĐẦU NGÀY CHỦ TỊCH (DỮ LIỆU THẬT 100%) ====================

  buildDailyBriefingData() {
    const s = this.state;
    const docSys = this._docSys();
    const pendingDocs = docSys ? docSys.getPendingDocuments() : [];
    const urgentDocs = docSys ? docSys.getUrgentDocuments() : [];
    const activeTasks = this.getActiveTasks();
    const blockedTasks = activeTasks.filter((t) => t.status === TASK_STATUS.BLOCKED);
    const nextFx = s?.getCurrentWeekFixture?.() || s?.getNextFixture?.();
    const injured = s?.getPsgSquad?.().filter((p) => p.injuryDays > 0) || [];
    const hc = s?.managerSystem?.getActiveByRole?.('head_coach');

    const topPriorities = [];
    if (urgentDocs.length > 0) {
      topPriorities.push(`Xử lý ${urgentDocs.length} hồ sơ KHẨN trên khay ĐỎ (Ưu tiên 1: [${urgentDocs[0].code}] ${urgentDocs[0].title}).`);
    }
    if (blockedTasks.length > 0) {
      topPriorities.push(`Tháo gỡ ${blockedTasks.length} nhiệm vụ đang vướng mắc tại Action Tracker.`);
    }
    if (!hc || s?.coach?.vacant) {
      topPriorities.push('Bổ nhiệm ngay HLV trưởng mới để ổn định phòng thay đồ và lịch tập.');
    }
    if (nextFx) {
      topPriorities.push(`Chuẩn bị trận ${nextFx.comp}: ${nextFx.home} vs ${nextFx.away}.`);
    }
    if (topPriorities.length === 0) {
      topPriorities.push('Rà soát hiệu suất 12 phòng ban và hoạch định mục tiêu chuyển nhượng.');
    }

    return {
      date: this._dateStr(),
      season: s?.season || '2026/27',
      week: s?.week || 1,
      budgetM: Number(s?.finance?.budget || 0).toFixed(1),
      transferBudgetM: Number(s?.finance?.transferBudget || 0).toFixed(1),
      ffpStatus: s?.finance?.ffpStatus || 'An toàn',
      coachName: hc ? hc.name : '⚠️ Đang trống ghế HLV trưởng',
      upcomingMatch: nextFx ? `${nextFx.comp} · ${nextFx.home} vs ${nextFx.away}` : 'Chưa có trận trong tuần',
      injuredList: injured.map((p) => `${p.name} (${p.injuryDays} ngày)`),
      pendingDocsCount: pendingDocs.length,
      urgentDocsCount: urgentDocs.length,
      activeTasksCount: activeTasks.length,
      blockedTasksCount: blockedTasks.length,
      topPriorities,
      urgentPreview: urgentDocs.slice(0, 3),
      activeTaskPreview: activeTasks.slice(0, 4)
    };
  }

  getStaffAccountabilityList() {
    const res = [];
    Object.values(ROLE_RESPONSIBILITY_MAP).forEach((meta) => {
      const owner = this.resolveOwnerNpc(meta.roleKey);
      const ev = this.staffEvaluations[meta.roleKey] || { competency: owner.skill || 80, onTimeCount: 0, delayedCount: 0, failedCount: 0, completedCount: 0 };
      const currentTasks = this.getActiveTasks().filter((t) => t.ownerRoleKey === meta.roleKey);
      res.push({
        roleKey: meta.roleKey,
        title: meta.title,
        dept: meta.dept,
        authorityScope: meta.authorityScope,
        canSignSmallUnderM: meta.canSignSmallUnderM,
        ownerName: owner.name,
        npcId: owner.npcId,
        vacant: !!owner.vacant,
        skill: owner.skill,
        relation: owner.relation,
        personality: owner.personality,
        competency: ev.competency,
        completedCount: ev.completedCount,
        onTimeCount: ev.onTimeCount,
        delayedCount: ev.delayedCount,
        failedCount: ev.failedCount,
        currentTasks
      });
    });
    return res;
  }

  exportState() {
    return {
      seq: this._seq,
      decisions: this.decisions,
      executionTasks: this.executionTasks,
      staffEvaluations: this.staffEvaluations,
      officeVisitQueue: this.officeVisitQueue,
      sentEventNotifications: Array.from(this.sentEventNotifications)
    };
  }

  importState(snap) {
    if (!snap) return;
    if (Number.isFinite(snap.seq)) this._seq = Math.max(1, snap.seq);
    if (Array.isArray(snap.decisions)) this.decisions = snap.decisions;
    if (Array.isArray(snap.executionTasks)) this.executionTasks = snap.executionTasks;
    if (snap.staffEvaluations && typeof snap.staffEvaluations === 'object') {
      this.staffEvaluations = { ...this.staffEvaluations, ...snap.staffEvaluations };
    }
    if (Array.isArray(snap.officeVisitQueue)) this.officeVisitQueue = snap.officeVisitQueue;
    if (Array.isArray(snap.sentEventNotifications)) {
      this.sentEventNotifications = new Set(snap.sentEventNotifications);
    }
  }
}
