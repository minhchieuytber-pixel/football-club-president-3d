// src/media/RumorAndCrisisSystem.js
// Hệ thống Tin đồn & Tin mật (5 hành động Chủ tịch, phân biệt rõ Tin đồn / Tin chưa xác nhận / Thông báo chính thức)
// và Hệ thống Khủng hoảng Truyền thông (tham vấn GĐ Thể thao, GĐ Truyền thông, HLV trưởng).

export const RUMOR_STATUS = {
  RUMOR: 'Tin đồn',
  UNCONFIRMED: 'Tin chưa xác nhận',
  OFFICIAL: 'Thông báo chính thức'
};

export const CRISIS_DEFS = {
  player_exit_demand: {
    title: 'Ngôi sao đội một đánh tiếng muốn rời PSG',
    severity: 'Cao',
    category: 'Phòng thay đồ',
    summary: (ctx) => `${ctx.playerName || 'Một trụ cột PSG'} được cho là không hài lòng với thời lượng thi đấu và đang cân nhắc đề nghị từ nước ngoài.`
  },
  coach_pressure: {
    title: 'Áp lực sa thải bủa vây HLV trưởng PSG',
    severity: 'Nghiêm trọng',
    category: 'Chuyên môn',
    summary: (ctx) => `Sau chuỗi trận thiếu thuyết phục (${ctx.loseStreak || 2} thất bại gần nhất), truyền thông Paris đặt dấu hỏi về tương lai của HLV ${ctx.coachName || 'PSG'}.`
  },
  sponsor_unhappy: {
    title: 'Nhà tài trợ chiến lược lo ngại về hiệu ứng truyền thông',
    severity: 'Cao',
    category: 'Thương mại',
    summary: (ctx) => `Đối tác ${ctx.sponsorName || 'Qatar Airways'} yêu cầu làm rõ định hướng hình ảnh và thành tích của CLB.`
  },
  fan_transfer_backlash: {
    title: 'CĐV phản ứng gay gắt trước chính sách chuyển nhượng',
    severity: 'Trung bình',
    category: 'Cộng đồng CĐV',
    summary: (ctx) => `Hội CĐV tại Parc des Princes bày tỏ bất bình sau thương vụ ${ctx.subjectName || 'nhân sự gần đây'}.`
  },
  ffp_doubts: {
    title: 'Báo chí châu Âu đặt nghi vấn Luật Công bằng Tài chính (FFP)',
    severity: 'Cao',
    category: 'Tài chính',
    summary: () => 'Một số tờ báo tài chính thể thao đặt câu hỏi về cấu trúc quỹ lương và chi tiêu chuyển nhượng của PSG.'
  },
  deal_leaked_early: {
    title: 'Thông tin đàm phán mật bị rò rỉ trước ngày công bố',
    severity: 'Trung bình',
    category: 'Bảo mật & Mercato',
    summary: (ctx) => `Các chi tiết tài chính liên quan tới ${ctx.subjectName || 'mục tiêu chuyển nhượng'} bất ngờ xuất hiện trên mặt báo trước khi ký kết.`
  },
  benched_star_unhappy: {
    title: 'Cầu thủ dự bị công khai bất mãn trên mạng xã hội',
    severity: 'Trung bình',
    category: 'Kỷ luật nội bộ',
    summary: (ctx) => `${ctx.playerName || 'Cầu thủ đội một'} bày tỏ sự thất vọng vì liên tục ngồi dự bị trong các trận gần đây.`
  }
};

export class RumorAndCrisisSystem {
  constructor(state) {
    this.state = state;
    this.reset();
  }

  reset() {
    this.rumors = [];
    this.crises = [];
    this.resolvedLog = [];
    this._seedInitialRumors();
  }

  _dateStr() {
    return this.state?.timeSystem
      ? `${this.state.timeSystem.getDateString()} · ${this.state.timeSystem.getTimeString()}`
      : `Tuần ${this.state?.week || 1}`;
  }

  _seedInitialRumors() {
    this.rumors = [
      {
        id: 'rum_init_1',
        type: 'secret_talks',
        title: 'PSG bí mật tiếp cận một ngôi sao tấn công hàng đầu châu Âu',
        detail: 'Nguồn tin từ Tây Ban Nha cho biết đại diện PSG đã có cuộc trao đổi kín tại Paris nhằm thăm dò khả năng chuyển nhượng trong kỳ Hè.',
        source: 'Mercato Whisper',
        date: 'Hôm nay · 08:30',
        verificationStatus: RUMOR_STATUS.RUMOR,
        isFactuallyTrue: false,
        reliability: 'Trung bình',
        relatedEntity: 'Hàng công PSG',
        handled: false,
        presidentAction: null,
        mediaNote: ''
      },
      {
        id: 'rum_init_2',
        type: 'rival_approach',
        title: 'Hai đại gia Ngoại hạng Anh theo sát trụ cột tuyến giữa PSG',
        detail: 'Các tuyển trạch viên từ Premier League được phát hiện theo dõi sát sao tình hình hợp đồng của một số tiền vệ PSG.',
        source: 'London Sports Wire',
        date: 'Hôm nay · 09:00',
        verificationStatus: RUMOR_STATUS.UNCONFIRMED,
        isFactuallyTrue: true,
        reliability: 'Cao',
        relatedEntity: 'Tuyến giữa PSG',
        handled: false,
        presidentAction: null,
        mediaNote: ''
      }
    ];
  }

  subscribeToEventBus(eventBus) {
    if (!eventBus) return;

    eventBus.on('TRANSFER_NEGOTIATION_STARTED', (payload) => {
      this.addRumor({
        type: 'secret_talks',
        title: `Rò rỉ: PSG âm thầm đàm phán với ${payload.fromClub} về ${payload.playerName}`,
        detail: `Giới thạo tin phát hiện Giám đốc Thể thao PSG liên hệ ${payload.fromClub} cho thương vụ ${payload.playerName} (định giá khoảng €${payload.askFee}M).`,
        source: 'Transfer Insider',
        verificationStatus: RUMOR_STATUS.UNCONFIRMED,
        isFactuallyTrue: true,
        reliability: 'Cao',
        relatedEntity: payload.playerName,
        linkedDealId: payload.negId,
        notifyPhone: true
      }, `rum_neg_${payload.negId}`);
    });

    eventBus.on('TRANSFER_BID_RECEIVED', (payload) => {
      if ((payload.fee || 0) >= 25 || (payload.ovr || 0) >= 83) {
        this.addRumor({
          type: 'rival_approach',
          title: `${payload.buyerClub} bất ngờ tiếp cận ngôi sao PSG ${payload.playerName}`,
          detail: `Đội bóng ${payload.buyerClub} đã gửi đề nghị ${payload.dealType === 'loan' ? 'hỏi mượn' : `mua €${payload.fee}M`} dành cho ${payload.playerName}.`,
          source: 'European Mercato',
          verificationStatus: RUMOR_STATUS.UNCONFIRMED,
          isFactuallyTrue: true,
          reliability: 'Cao',
          relatedEntity: payload.playerName,
          linkedBidId: payload.bidId,
          notifyPhone: false
        }, `rum_bid_${payload.bidId}`);
      }
    });

    eventBus.on('TRANSFER_DEAL_FAILED', (payload) => {
      if ((payload.fee || 0) >= 55) {
        this.addRumor({
          type: 'agent_wage_leak',
          title: `Người đại diện tiết lộ bất đồng lương bổng khiến thương vụ ${payload.playerName} đổ bể`,
          detail: payload.reason || `Hai bên không tìm được tiếng nói chung trong quá trình đàm phán ${payload.playerName}.`,
          source: 'RMC Mercato',
          verificationStatus: RUMOR_STATUS.UNCONFIRMED,
          isFactuallyTrue: true,
          reliability: 'Cao',
          relatedEntity: payload.playerName,
          notifyPhone: false
        }, `rum_fail_${payload.negId || payload.playerName}_${this.state.week}`);
      }
    });

    eventBus.on('MATCH_COMPLETED', (res) => {
      if ((this.state?.loseStreak || 0) >= 2) {
        this.triggerCrisis('coach_pressure', {
          coachName: this.state.coach?.name,
          loseStreak: this.state.loseStreak
        }, `crisis_coach_w${this.state.week}`);
      }
      // Cầu thủ dự bị có OVR cao ngồi ngoài nhiều dễ bất mãn
      if (!res.psgWon && Math.random() < 0.35) {
        const starters = new Set(this.state.formationSystem?.starterIds || []);
        const benchedStar = this.state.getPsgSquad().find((p) => !starters.has(p.id) && p.ovr >= 82);
        if (benchedStar) {
          this.triggerCrisis('benched_star_unhappy', {
            playerId: benchedStar.id,
            playerName: benchedStar.name
          }, `crisis_bench_${benchedStar.id}_w${this.state.week}`);
        }
      }
    });
  }

  addRumor(cfg, dedupeKey = null) {
    if (dedupeKey && this.rumors.some((r) => r.dedupeKey === dedupeKey)) return null;
    const item = {
      id: `rum_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      dedupeKey: dedupeKey || null,
      type: cfg.type || 'secret_talks',
      title: cfg.title,
      detail: cfg.detail,
      source: cfg.source || 'Nguồn tin nội bộ Châu Âu',
      date: this._dateStr(),
      verificationStatus: cfg.verificationStatus || RUMOR_STATUS.RUMOR,
      isFactuallyTrue: !!cfg.isFactuallyTrue,
      reliability: cfg.reliability || (cfg.isFactuallyTrue ? 'Cao' : 'Thấp'),
      relatedEntity: cfg.relatedEntity || 'PSG',
      linkedDealId: cfg.linkedDealId || null,
      linkedBidId: cfg.linkedBidId || null,
      handled: false,
      presidentAction: null,
      mediaNote: ''
    };
    this.rumors.unshift(item);
    if (this.rumors.length > 24) this.rumors.length = 24;

    if (cfg.notifyPhone && this.state?.pushPhoneMsg) {
      this.state.pushPhoneMsg(
        'Phòng Tình Báo Truyền Thông',
        `🕵️ TIN MẬT / RÒ RỈ: ${item.title}`,
        `${item.detail} [Trạng thái: ${item.verificationStatus}]. Chủ tịch có thể xử lý trên Điện thoại hoặc Máy tính.`,
        true
      );
    }

    this.state?.eventBus?.emit('RUMOR_CREATED', item, dedupeKey || item.id);
    return item;
  }

  // Tạo tin đồn/rò rỉ ngẫu nhiên theo diễn biến tuần
  generateWeeklyIntel() {
    const psgSquad = this.state?.getPsgSquad ? this.state.getPsgSquad() : [];
    const star = psgSquad[Math.floor(Math.random() * Math.min(8, psgSquad.length))];
    const rival = this.state?.clubs?.find((c) => c.name !== 'Paris Saint-Germain' && c.rating >= 85) || { name: 'Real Madrid' };
    const neg = this.state?.transferSystem?.activeNegotiations?.[0];

    const pool = [
      () => star && {
        type: 'agent_wage_leak',
        title: `Người đại diện của ${star.name} rò rỉ mức lương yêu cầu mới`,
        detail: `Giới truyền thông Pháp đưa tin đại diện của ${star.name} kỳ vọng mức đãi ngộ €${Math.round((star.wage || 120) * 1.18)}k/tuần nếu gia hạn với PSG.`,
        source: 'Paris Insider',
        verificationStatus: RUMOR_STATUS.RUMOR,
        isFactuallyTrue: (star.contractYears || 2) <= 2,
        reliability: (star.contractYears || 2) <= 2 ? 'Cao' : 'Trung bình',
        relatedEntity: star.name
      },
      () => neg && {
        type: 'meeting_spotted',
        title: `Ống kính phóng viên bắt gặp cuộc gặp kín giữa PSG và ${neg.fromClub}`,
        detail: `Đại diện cấp cao hai CLB được trông thấy dùng bữa trưa gần đại lộ Champs-Élysées giữa lúc thương vụ ${neg.playerName} đang nóng lên.`,
        source: 'Le Parisien Flash',
        verificationStatus: RUMOR_STATUS.UNCONFIRMED,
        isFactuallyTrue: true,
        reliability: 'Cao',
        relatedEntity: neg.playerName,
        linkedDealId: neg.id
      },
      () => star && {
        type: 'rival_approach',
        title: `${rival.name} âm thầm dò hỏi khả năng chiêu mộ ${star.name}`,
        detail: `Theo tin đồn từ Tây Ban Nha/Anh, ${rival.name} đang cân nhắc gửi đề nghị thử thách lòng kiên nhẫn của Chủ tịch Phạm Minh Chiêu.`,
        source: 'Euro Mercato',
        verificationStatus: RUMOR_STATUS.RUMOR,
        isFactuallyTrue: false,
        reliability: 'Thấp',
        relatedEntity: star.name
      }
    ];

    const factory = pool[Math.floor(Math.random() * pool.length)];
    const built = factory ? factory() : null;
    if (built) {
      this.addRumor(built, `rum_weekly_${this.state.week}_${built.type}_${built.relatedEntity}`);
    }
  }

  // 5 hành động của Chủ tịch: 'verify' | 'silence' | 'deny' | 'confirm' | 'delegate_media'
  resolveRumor(rumorId, action) {
    const rum = this.rumors.find((r) => r.id === rumorId);
    if (!rum) return { ok: false, error: 'Không tìm thấy tin đồn / tin mật này.' };
    if (rum.handled && action !== 'verify') {
      return { ok: false, error: 'Thông tin này đã được Chủ tịch xử lý trước đó.' };
    }

    const rep = this.state?.reputationSystem;
    let message = '';

    if (action === 'verify') {
      rum.verificationStatus = rum.isFactuallyTrue ? RUMOR_STATUS.UNCONFIRMED : RUMOR_STATUS.RUMOR;
      rum.mediaNote = rum.isFactuallyTrue
        ? `Xác minh nội bộ: Thông tin liên quan tới ${rum.relatedEntity} CÓ CƠ SỞ thực tế trong hệ thống.`
        : `Xác minh nội bộ: Đây chỉ là suy đoán báo chí chưa có giao dịch thực tế.`;
      rep?.applyDelta({ governanceSkill: +2, mediaTrust: +1 }, `Xác minh tin mật về ${rum.relatedEntity}`, `rum_verify_${rum.id}`);
      message = rum.mediaNote;
    } else if (action === 'silence') {
      rum.handled = true;
      rum.presidentAction = 'Giữ im lặng';
      rum.mediaNote = 'Chủ tịch chọn giữ im lặng chiến lược để bảo toàn lợi thế đàm phán.';
      rep?.applyDelta({ governanceSkill: +1, mediaTrust: -1 }, `Giữ im lặng trước tin đồn ${rum.relatedEntity}`, `rum_act_${rum.id}`);
      message = 'Đã chọn giữ im lặng chiến lược. Báo chí vẫn để trạng thái Tin chưa xác nhận.';
    } else if (action === 'deny') {
      rum.handled = true;
      rum.presidentAction = 'Phủ nhận công khai';
      rum.verificationStatus = RUMOR_STATUS.RUMOR;
      rum.mediaNote = 'PSG chính thức bác bỏ thông tin sai lệch trên truyền thông.';
      const delta = rum.isFactuallyTrue
        ? { mediaTrust: -2, fanTrust: +1, playerTrust: +1 }
        : { mediaTrust: +2, fanTrust: +2, governanceSkill: +1 };
      rep?.applyDelta(delta, `Phủ nhận tin đồn về ${rum.relatedEntity}`, `rum_act_${rum.id}`);
      message = 'Đã phát thông cáo phủ nhận. Tin tức giữ nguyên nhãn Tin đồn / Bác bỏ.';
    } else if (action === 'confirm') {
      if (!rum.isFactuallyTrue) {
        return {
          ok: false,
          error: 'Không thể xác nhận "Thông báo chính thức" cho tin đồn chưa có sự kiện thực tế! Hãy Xác minh, Phủ nhận hoặc giao Phòng Truyền thông xử lý.'
        };
      }
      rum.handled = true;
      rum.presidentAction = 'Xác nhận chính thức';
      rum.verificationStatus = RUMOR_STATUS.OFFICIAL;
      rum.mediaNote = 'Chủ tịch xác nhận thông tin là chính xác trước truyền thông.';
      rep?.applyDelta({ mediaTrust: +3, fanTrust: +2, partnerTrust: +1 }, `Xác nhận chính thức thông tin ${rum.relatedEntity}`, `rum_act_${rum.id}`);
      message = `Đã xác nhận chính thức thông tin về ${rum.relatedEntity}.`;
    } else if (action === 'delegate_media') {
      rum.handled = true;
      rum.presidentAction = 'Giao Phòng Truyền thông xử lý';
      rum.mediaNote = 'GĐ Truyền thông Sophie Chevalier đã kiểm soát nguồn tin và định hướng dư luận Paris.';
      rep?.applyDelta({ mediaTrust: +3, fanTrust: +1, governanceSkill: +2 }, `Giao Bộ phận Truyền thông xử lý tin ${rum.relatedEntity}`, `rum_act_${rum.id}`);
      message = 'Phòng Truyền thông PSG đã tiếp quản và ổn định dư luận.';
    } else {
      return { ok: false, error: 'Hành động không hợp lệ.' };
    }

    if (rum.handled) {
      this.resolvedLog.unshift({
        id: rum.id,
        title: rum.title,
        action: rum.presidentAction,
        verificationStatus: rum.verificationStatus,
        date: this._dateStr()
      });
      if (this.resolvedLog.length > 30) this.resolvedLog.length = 30;
    }

    this.state?.eventBus?.emit('RUMOR_ACTION_TAKEN', {
      rumor: rum,
      action,
      message,
      official: rum.verificationStatus === RUMOR_STATUS.OFFICIAL
    });

    return { ok: true, rumor: rum, message };
  }

  // ==================== HỆ THỐNG KHỦNG HOẢNG TRUYỀN THÔNG ====================

  triggerCrisis(type, context = {}, dedupeKey = null) {
    const def = CRISIS_DEFS[type];
    if (!def) return null;
    if (dedupeKey && this.crises.some((c) => c.dedupeKey === dedupeKey)) return null;
    if (this.crises.filter((c) => c.status === 'active').length >= 3) return null;
    if (this.crises.some((c) => c.status === 'active' && c.type === type)) return null;

    const sdName = this.state?.departments?.find((d) => d.id === 'scouting' || d.id === 'sporting')?.head || 'Luís Campos';
    const mediaName = this.state?.departments?.find((d) => d.id === 'media')?.head || 'Sophie Chevalier';
    const coachName = this.state?.coach?.name || 'Luis Enrique';

    const crisis = {
      id: `crs_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      dedupeKey,
      type,
      title: def.title,
      severity: def.severity,
      category: def.category,
      summary: def.summary(context),
      context,
      status: 'active', // 'active' | 'resolved'
      date: this._dateStr(),
      resolution: null,
      advisors: [
        {
          role: 'Giám đốc Thể thao',
          name: sdName,
          advice: type === 'player_exit_demand' || type === 'benched_star_unhappy'
            ? 'Nên đối thoại riêng, giữ kỷ luật quỹ lương nhưng bảo vệ giá trị chuyển nhượng của CLB.'
            : 'Hãy bảo vệ sự ổn định chuyên môn và tránh xáo trộn nhân sự đột ngột.'
        },
        {
          role: 'Giám đốc Truyền thông',
          name: mediaName,
          advice: 'Chúng ta cần phát thông điệp nhất quán trên PSG TV để tránh tin đồn bị thổi phồng thêm.'
        },
        {
          role: 'HLV Trưởng PSG',
          name: coachName,
          advice: type === 'coach_pressure'
            ? 'Tôi cần sự ủng hộ rõ ràng từ Chủ tịch để giữ uy quyền trong phòng thay đồ trước trận kế tiếp.'
            : 'Tập trung tối đa vào sân cỏ sẽ giúp dập tắt mọi hoài nghi của dư luận.'
        }
      ],
      options: this._buildCrisisOptions(type, context)
    };

    this.crises.unshift(crisis);
    if (this.crises.length > 18) this.crises.length = 18;

    this.state?.pushPhoneMsg(
      'Ban Xử Lý Khủng Hoảng PSG',
      `🚨 KHỦNG HOẢNG: ${crisis.title}`,
      `${crisis.summary} Mời Chủ tịch hội ý với GĐ Thể thao, GĐ Truyền thông & HLV trưởng để đưa ra quyết định.`,
      true
    );
    this.state?.eventBus?.emit('CRISIS_TRIGGERED', crisis, dedupeKey || crisis.id);
    return crisis;
  }

  _buildCrisisOptions(type, ctx) {
    if (type === 'coach_pressure') {
      return [
        {
          key: 'back_coach',
          label: 'Công khai bảo vệ HLV trưởng trên PSG TV',
          desc: 'Khẳng định niềm tin tuyệt đối vào ban huấn luyện, ổn định phòng thay đồ.',
          repDelta: { coachTrust: +6, playerTrust: +2, mediaTrust: +2, fanTrust: -2 },
          costM: 0
        },
        {
          key: 'ultimatum',
          label: 'Đặt mục tiêu tối hậu thư 3 trận tới (nội bộ)',
          desc: 'Giữ uy nghiêm quản trị và trấn an cổ động viên đang sốt ruột.',
          repDelta: { governanceSkill: +4, fanTrust: +3, coachTrust: -4 },
          costM: 0
        },
        {
          key: 'press_briefing',
          label: 'Tổ chức họp báo giải trình chiến lược dài hạn',
          desc: 'Trực tiếp đối thoại với truyền thông để hạ nhiệt chỉ trích.',
          repDelta: { mediaTrust: +5, partnerTrust: +2, governanceSkill: +2 },
          costM: 0.4
        }
      ];
    }
    if (type === 'player_exit_demand' || type === 'benched_star_unhappy') {
      return [
        {
          key: 'private_talk',
          label: 'Gặp riêng động viên & cam kết cơ hội xoay tua',
          desc: 'Giữ cầu thủ ở lại, cải thiện tinh thần nhưng đòi hỏi sự cam kết chuyên môn.',
          repDelta: { playerTrust: +5, coachTrust: +2, governanceSkill: +2 },
          moraleBoost: +12,
          costM: 0
        },
        {
          key: 'firm_stance',
          label: 'Cứng rắn khẳng định kỷ luật tập thể là tối thượng',
          desc: 'Không cá nhân nào lớn hơn PSG; bảo vệ quyền uy HLV trưởng.',
          repDelta: { governanceSkill: +4, coachTrust: +4, fanTrust: +2, playerTrust: -3 },
          moraleBoost: -4,
          costM: 0
        },
        {
          key: 'transfer_open',
          label: 'Mở cửa lắng nghe đề nghị chuyển nhượng hợp lý',
          desc: 'Sẵn sàng bán/cho mượn nếu đối tác trả đúng giá trị CLB.',
          repDelta: { governanceSkill: +3, mediaTrust: +2, playerTrust: +1 },
          listForTransfer: true,
          costM: 0
        }
      ];
    }
    return [
      {
        key: 'transparent_audit',
        label: 'Công bố báo cáo minh bạch & cam kết chiến lược',
        desc: 'Củng cố niềm tin với đối tác, truyền thông và cơ quan quản lý.',
        repDelta: { partnerTrust: +5, mediaTrust: +4, governanceSkill: +4 },
        costM: 0.5
      },
      {
        key: 'pr_campaign',
        label: 'Phát động chiến dịch truyền thông tích cực trên PSG TV',
        desc: 'Đưa hình ảnh hậu trường tập luyện và gắn kết cộng đồng Paris.',
        repDelta: { fanTrust: +4, mediaTrust: +3, partnerTrust: +2 },
        costM: 1.2
      },
      {
        key: 'ignore',
        label: 'Tập trung chuyên môn, không bình luận thêm',
        desc: 'Tránh sa đà tranh cãi nhưng dễ làm báo chí tiếp tục suy đoán.',
        repDelta: { governanceSkill: +1, mediaTrust: -3, fanTrust: -1 },
        costM: 0
      }
    ];
  }

  resolveCrisis(crisisId, optionKey) {
    const crisis = this.crises.find((c) => c.id === crisisId);
    if (!crisis) return { ok: false, error: 'Không tìm thấy khủng hoảng.' };
    if (crisis.status === 'resolved') return { ok: false, error: 'Khủng hoảng này đã được xử lý.' };
    const opt = crisis.options.find((o) => o.key === optionKey) || crisis.options[0];
    if (!opt) return { ok: false, error: 'Phương án xử lý không hợp lệ.' };

    if (opt.costM > 0 && (this.state?.finance?.budget || 0) >= opt.costM) {
      this.state.addLedger(`Xử lý truyền thông: ${crisis.title}`, -opt.costM);
    }
    if (crisis.context?.playerId && this.state?.getPlayerById) {
      const p = this.state.getPlayerById(crisis.context.playerId);
      if (p) {
        if (opt.moraleBoost) {
          p.morale = Math.max(35, Math.min(100, (p.morale || 75) + opt.moraleBoost));
          if (p.psychology) p.psychology.morale = p.morale;
        }
        if (opt.listForTransfer) p.transferListed = true;
      }
    }

    this.state?.reputationSystem?.applyDelta(
      opt.repDelta,
      `Xử lý khủng hoảng: ${crisis.title} (${opt.label})`,
      `crisis_res_${crisis.id}`
    );

    crisis.status = 'resolved';
    crisis.resolution = {
      optionKey: opt.key,
      label: opt.label,
      date: this._dateStr()
    };

    this.state?.eventBus?.emit('CRISIS_RESOLVED', {
      crisis,
      option: opt
    }, `crisis_resolved_${crisis.id}`);

    return { ok: true, crisis, option: opt };
  }

  getActiveCount() {
    return this.crises.filter((c) => c.status === 'active').length + this.rumors.filter((r) => !r.handled).length;
  }

  exportState() {
    return {
      rumors: this.rumors.slice(0, 24),
      crises: this.crises.slice(0, 18),
      resolvedLog: this.resolvedLog.slice(0, 30)
    };
  }

  importState(snap) {
    if (!snap) return;
    if (Array.isArray(snap.rumors)) this.rumors = snap.rumors;
    if (Array.isArray(snap.crises)) this.crises = snap.crises;
    if (Array.isArray(snap.resolvedLog)) this.resolvedLog = snap.resolvedLog;
  }
}
