// src/transfers/TransferSystem.js
// Hệ thống Chuyển nhượng toàn diện: Kỳ chuyển nhượng mùa hè & mùa đông cấu hình theo mùa, Đàm phán 2 giai đoạn (CLB -> Cầu thủ),
// Mua/Bán/Cho mượn, Đôn cầu thủ trẻ giữ nguyên playerId, Đề xuất từ Học viện & GĐ Thể thao, AI các CLB khác tự vận hành.
import { PressNewsSystem } from '../media/PressNewsSystem.js';

export class TransferSystem {
  constructor(state) {
    this.state = state;
    this.reset();
  }

  reset() {
    this.windowState = 'summer'; // 'summer' | 'winter' | 'closed'
    this.windowConfig = this.buildWindowConfig(2026);
    this.activeNegotiations = []; // Đang đàm phán 2 giai đoạn
    this.completedDeals = [];     // Thương vụ hoàn tất (PSG & Thế giới)
    this.failedDeals = [];        // Thương vụ thất bại
    this.incomingBids = [];       // Lời đề nghị từ CLB khác hỏi mua/mượn cầu thủ PSG
    this.rumors = [];             // Tin đồn chuyển nhượng
    this.academyProposals = [];   // Đề xuất đôn cầu thủ trẻ từ GĐ Học viện
    this.windowReports = [];      // Báo cáo đóng kỳ chuyển nhượng gửi Chủ tịch
    this.seedInitialMarketData();
  }

  // Cấu hình ngày mở/đóng linh hoạt theo từng mùa giải (không hardcode cố định)
  buildWindowConfig(seasonStartYear) {
    return {
      seasonStartYear,
      summer: {
        label: `Kỳ chuyển nhượng Mùa Hè ${seasonStartYear}`,
        startMonth: 7, startDay: 1,
        endMonth: 8, endDay: 31,
        openDate: `01/07/${seasonStartYear}`,
        closeDate: `31/08/${seasonStartYear}`
      },
      winter: {
        label: `Kỳ chuyển nhượng Mùa Đông ${seasonStartYear + 1}`,
        startMonth: 1, startDay: 1,
        endMonth: 1, endDay: 31,
        openDate: `01/01/${seasonStartYear + 1}`,
        closeDate: `31/01/${seasonStartYear + 1}`
      }
    };
  }

  seedInitialMarketData() {
    this.rumors = [
      { id: 'rum_1', date: 'Tháng 8', title: 'Real Madrid theo dõi sát thị trường hậu vệ cánh châu Âu', detail: 'Đội bóng Hoàng gia Tây Ban Nha sẵn sàng chi €75M nếu bán được nhân sự dự bị.', reliability: 'Cao' },
      { id: 'rum_2', date: 'Tháng 8', title: 'Arsenal và Manchester City cạnh tranh tài năng trẻ Ligue 1', detail: 'Các tuyển trạch viên Anh đã xuất hiện tại nhiều sân vận động Ligue 1 tuần qua.', reliability: 'Trung bình' },
      { id: 'rum_3', date: 'Tháng 8', title: 'PSG cân nhắc tăng cường thêm 1 trung phong cắm đẳng cấp', detail: 'Giám đốc thể thao đang trình Chủ tịch Phạm Minh Chiêu danh sách 5 mục tiêu ưu tiên.', reliability: 'Cao' }
    ];
    this.generateAcademyProposals();
  }

  getDateStr() {
    if (this.state.timeSystem) return this.state.timeSystem.getDateString();
    return `Tuần ${this.state.week} · ${this.state.season}`;
  }

  // Đồng bộ trạng thái kỳ chuyển nhượng theo lịch thời gian thực tế của GameTimeSystem
  syncWindowWithDate(year, month, day) {
    const cfg = this.windowConfig;
    const isSummer = (month === cfg.summer.startMonth && day >= cfg.summer.startDay) ||
                     (month === cfg.summer.endMonth && day <= cfg.summer.endDay);
    const isWinter = (month === cfg.winter.startMonth && day >= cfg.winter.startDay && day <= cfg.winter.endDay);

    const nextState = isSummer ? 'summer' : isWinter ? 'winter' : 'closed';
    if (nextState !== this.windowState) {
      if (nextState === 'closed' && this.windowState !== 'closed') {
        this.closeCurrentWindow(false);
      } else if (nextState === 'summer') {
        this.openWindow('summer', year);
      } else if (nextState === 'winter') {
        this.openWindow('winter', year - 1);
      }
    }
  }

  isWindowOpen() {
    return this.windowState === 'summer' || this.windowState === 'winter';
  }

  getWindowLabel() {
    if (this.windowState === 'summer') return `🟢 ĐANG MỞ · ${this.windowConfig.summer.label} (${this.windowConfig.summer.openDate} – ${this.windowConfig.summer.closeDate})`;
    if (this.windowState === 'winter') return `🟢 ĐANG MỞ · ${this.windowConfig.winter.label} (${this.windowConfig.winter.openDate} – ${this.windowConfig.winter.closeDate})`;
    return `🔴 ĐÃ ĐÓNG CỬA · Chờ kỳ tiếp theo (${this.windowConfig.winter.openDate} hoặc Hè ${this.windowConfig.seasonStartYear + 1})`;
  }

  openWindow(type = 'summer', seasonStartYear = null) {
    if (seasonStartYear) this.windowConfig = this.buildWindowConfig(seasonStartYear);
    this.windowState = type;
    const label = type === 'summer' ? this.windowConfig.summer.label : this.windowConfig.winter.label;
    this.state.pushPhoneMsg(
      'Phòng Chuyển Nhượng PSG',
      `🟢 MỞ CỬA ${label.toUpperCase()}`,
      `Thị trường chuyển nhượng đã chính thức mở cửa! Quỹ chuyển nhượng hiện có: €${this.state.finance.transferBudget.toFixed(1)}M. Các CLB châu Âu đã bắt đầu đàm phán sôi động.`,
      true
    );
    this.generateIncomingBids(2);
    this.generateAcademyProposals();
    this.runAiTransferMarketCycle(4);
    return { ok: true, windowState: this.windowState, label };
  }

  closeCurrentWindow(manual = true) {
    if (this.windowState === 'closed') return { ok: false, reason: 'Kỳ chuyển nhượng đã đóng.' };
    const closedLabel = this.windowState === 'summer' ? this.windowConfig.summer.label : this.windowConfig.winter.label;
    // Hủy các cuộc đàm phán chưa hoàn tất khi đóng cửa sổ
    this.activeNegotiations.forEach((neg) => {
      if (neg.status !== 'completed' && neg.status !== 'failed') {
        neg.status = 'failed';
        neg.failReason = 'Hết hạn kỳ chuyển nhượng trước khi hoàn tất chữ ký';
        this.failedDeals.unshift({ ...neg, closedAt: this.getDateStr() });
      }
    });
    this.activeNegotiations = [];
    this.windowState = 'closed';

    // Cập nhật đồng bộ đội hình, số áo, tủ đồ & tài chính
    this.state.formationSystem?.notify();
    this.recalcWeeklyWages();

    const psgDeals = this.completedDeals.filter((d) => d.from === 'Paris Saint-Germain' || d.to === 'Paris Saint-Germain').slice(0, 10);
    const report = {
      id: `win_rep_${Date.now()}`,
      date: this.getDateStr(),
      windowLabel: closedLabel,
      completedCount: this.completedDeals.length,
      failedCount: this.failedDeals.length,
      psgIn: psgDeals.filter((d) => d.to === 'Paris Saint-Germain'),
      psgOut: psgDeals.filter((d) => d.from === 'Paris Saint-Germain'),
      remainingBudget: +this.state.finance.transferBudget.toFixed(2),
      weeklyWages: this.state.finance.weeklyWages
    };
    this.windowReports.unshift(report);
    this.state.pushPhoneMsg(
      'Phòng Chuyển Nhượng PSG',
      `🔒 ĐÓNG CỬA ${closedLabel.toUpperCase()}`,
      `Đã chốt danh sách đội hình PSG (${this.state.getPsgSquad().length} cầu thủ). Đã hoàn tất ${report.psgIn.length} thương vụ đến, ${report.psgOut.length} thương vụ đi. Quỹ còn lại: €${report.remainingBudget}M.`,
      true
    );
    if (manual) this.state.generateDailyBriefing();
    return { ok: true, report };
  }

  // GĐ Thể thao đề xuất các cầu thủ phù hợp với điểm yếu đội hình PSG
  getRecommendedTargets() {
    const psgSquad = this.state.getPsgSquad();
    const posCounts = {};
    psgSquad.forEach((p) => { posCounts[p.position] = (posCounts[p.position] || 0) + 1; });
    const needPos = ['ST', 'CB', 'DM', 'CM', 'RW', 'LB', 'GK'].sort((a, b) => (posCounts[a] || 0) - (posCounts[b] || 0));
    const budget = this.state.finance.transferBudget;
    return this.state.players
      .filter((p) => p.club !== 'Paris Saint-Germain' && p.value <= budget * 1.25 && (p.ovr >= 80 || p.pot >= 88))
      .sort((a, b) => {
        const aNeed = needPos.indexOf(a.position) < 3 ? 12 : 0;
        const bNeed = needPos.indexOf(b.position) < 3 ? 12 : 0;
        return (b.pot + b.ovr * 0.6 + bNeed) - (a.pot + a.ovr * 0.6 + aNeed);
      })
      .slice(0, 12);
  }

  // ==================== ĐÀM PHÁN 2 GIAI ĐOẠN (CLB -> CẦU THỦ) ====================

  // Khởi tạo hoặc lấy phiên đàm phán
  startNegotiation(playerId, dealType = 'buy') {
    const p = this.state.getPlayerById(playerId);
    if (!p) return { ok: false, error: 'Không tìm thấy cầu thủ.' };
    if (p.club === 'Paris Saint-Germain') return { ok: false, error: 'Cầu thủ đã thuộc biên chế PSG.' };
    if (!this.isWindowOpen() && (p.contract?.contractYears ?? p.contractYears) > 0) {
      return { ok: false, error: 'Kỳ chuyển nhượng đang đóng! Hãy chờ mở cửa kỳ Mùa Hè / Mùa Đông.' };
    }

    const existing = this.activeNegotiations.find((n) => n.playerId === playerId && n.status !== 'failed' && n.status !== 'completed');
    if (existing) return { ok: true, negotiation: existing };

    const askFee = dealType === 'loan'
      ? Math.max(2, Math.round(p.value * 0.16))
      : Math.round(p.value * (p.contractYears <= 1 ? 0.88 : 1.12));

    const neg = {
      id: `neg_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      playerId: p.id,
      playerName: p.name,
      fromClub: p.club,
      position: p.position,
      ovr: p.ovr,
      pot: p.pot,
      dealType, // 'buy' | 'loan' | 'loan_buy'
      stage: 1, // 1 = Đàm phán CLB, 2 = Đàm phán Cầu thủ
      status: 'club_stage', // 'club_stage' | 'player_stage' | 'completed' | 'failed'
      clubAskFee: askFee,
      clubAgreedTerms: null,
      playerAskWage: Math.round((p.wage || 80) * 1.15),
      rounds: 0,
      history: [`Khởi tạo đàm phán với ${p.club} cho ${p.name} (Định giá ban đầu: €${askFee}M).`]
    };
    this.activeNegotiations.unshift(neg);
    return { ok: true, negotiation: neg };
  }

  // GIAI ĐOẠN 1: Gửi đề nghị cho CLB chủ quản
  submitClubOffer(negId, offer) {
    const neg = this.activeNegotiations.find((n) => n.id === negId);
    if (!neg) return { ok: false, error: 'Không tìm thấy phiên đàm phán.' };
    const p = this.state.getPlayerById(neg.playerId);
    if (!p) return { ok: false, error: 'Không tìm thấy hồ sơ cầu thủ.' };

    const fee = Math.max(0, Number(offer.fee || 0));
    const installments = Math.max(0, Math.min(3, Number(offer.installments || 0)));
    const perfBonus = Math.max(0, Number(offer.perfBonus || 0));
    const sellOnPct = Math.max(0, Math.min(25, Number(offer.sellOnPct || 0)));
    const swapPlayerId = offer.swapPlayerId || null;
    const swapPlayer = swapPlayerId ? this.state.getPsgSquad().find((x) => x.id === swapPlayerId) : null;
    const buyOptionFee = Math.max(0, Number(offer.buyOptionFee || 0));

    // Kiểm tra khả năng chi trả đợt 1
    const upfront = installments > 0 ? +(fee / (installments + 1)).toFixed(2) : fee;
    if (upfront > this.state.finance.transferBudget) {
      return { ok: false, error: `Số tiền trả trước (€${upfront}M) vượt quá quỹ chuyển nhượng (€${this.state.finance.transferBudget.toFixed(1)}M)!` };
    }

    // Tính tổng giá trị gói đề nghị
    const swapCredit = swapPlayer ? swapPlayer.value * 0.85 : 0;
    const bonusCredit = perfBonus * 0.65;
    const sellOnCredit = (sellOnPct / 100) * p.value * 0.35;
    const installmentPenalty = installments * (fee * 0.04);
    const effectiveValue = fee - installmentPenalty + bonusCredit + sellOnCredit + swapCredit;

    neg.rounds++;
    const targetValue = neg.clubAskFee;

    if (effectiveValue >= targetValue * 0.96) {
      neg.stage = 2;
      neg.status = 'player_stage';
      neg.clubAgreedTerms = { fee, upfront, installments, perfBonus, sellOnPct, swapPlayerId, swapPlayerName: swapPlayer?.name || null, buyOptionFee };
      neg.history.push(`✅ ${neg.fromClub} CHẤP NHẬN đề nghị €${fee}M${perfBonus ? ` + €${perfBonus}M thưởng` : ''}${swapPlayer ? ` + đổi ${swapPlayer.name}` : ''}! Chuyển sang Giai đoạn 2: Đàm phán hợp đồng cá nhân với ${p.name}.`);
      return { ok: true, outcome: 'accepted', negotiation: neg, message: `${neg.fromClub} đã đồng ý mức phí! Mời Chủ tịch bước sang Giai đoạn 2 đàm phán trực tiếp với ${p.name}.` };
    }

    if (effectiveValue >= targetValue * 0.78 && neg.rounds < 4) {
      const counterFee = Math.round((targetValue + fee) / 2 + 2);
      neg.clubAskFee = counterFee;
      neg.history.push(`💬 ${neg.fromClub} phản hồi: "Mức đề nghị €${fee}M chưa đạt kỳ vọng. Chúng tôi muốn €${counterFee}M (có thể kèm thưởng thành tích hoặc điều khoản bán lại)."`);
      return { ok: true, outcome: 'counter', counterFee, negotiation: neg, message: `${neg.fromClub} đề nghị lại mức giá €${counterFee}M.` };
    }

    // Từ chối thẳng và kết thúc đàm phán
    neg.status = 'failed';
    neg.failReason = `${neg.fromClub} từ chối mức đề nghị quá thấp (€${fee}M so với yêu cầu €${targetValue}M)`;
    neg.history.push(`❌ ${neg.failReason}.`);
    this.failedDeals.unshift({ ...neg, closedAt: this.getDateStr() });
    this.activeNegotiations = this.activeNegotiations.filter((n) => n.id !== neg.id);
    return { ok: true, outcome: 'rejected', negotiation: neg, message: `${neg.fromClub} đã chấm dứt đàm phán vì mức giá quá thấp!` };
  }

  // GIAI ĐOẠN 2: Đàm phán điều khoản cá nhân với cầu thủ
  submitPlayerOffer(negId, offer) {
    const neg = this.activeNegotiations.find((n) => n.id === negId);
    if (!neg || neg.stage !== 2) return { ok: false, error: 'Cần hoàn tất đàm phán với CLB chủ quản trước!' };
    const p = this.state.getPlayerById(neg.playerId);
    if (!p) return { ok: false, error: 'Không tìm thấy hồ sơ cầu thủ.' };

    const weeklyWage = Math.max(10, Number(offer.weeklyWage || neg.playerAskWage));
    const contractYears = Math.max(1, Math.min(5, Number(offer.contractYears || 4)));
    const signingBonus = Math.max(0, Number(offer.signingBonus || 0));
    const squadRole = offer.squadRole || 'Đá chính thường xuyên';
    const playtimeGuarantee = offer.playtimeGuarantee || 'Cao';
    const releaseClause = Math.max(0, Number(offer.releaseClause || Math.round(p.value * 2)));

    if (signingBonus + (neg.clubAgreedTerms?.upfront || 0) > this.state.finance.transferBudget) {
      return { ok: false, error: 'Tổng phí trả trước + thưởng ký hợp đồng vượt quá quỹ chuyển nhượng!' };
    }

    // Đánh giá cầu thủ có đồng ý hay không
    const wageRatio = weeklyWage / Math.max(1, neg.playerAskWage);
    const bonusBoost = signingBonus >= 2 ? 0.08 : signingBonus >= 1 ? 0.04 : 0;
    const roleBoost = (p.ovr >= 86 && squadRole === 'Trụ cột không thể thay thế') ? 0.08
      : (p.ovr >= 86 && squadRole === 'Dự bị') ? -0.28
        : squadRole === 'Đá chính thường xuyên' ? 0.04 : 0;
    const prestigeBoost = (this.state.president.prestige - 80) * 0.005;
    const totalScore = wageRatio + bonusBoost + roleBoost + prestigeBoost;

    neg.rounds++;

    if (totalScore >= 0.96) {
      const agreedPlayerTerms = { weeklyWage, contractYears, signingBonus, squadRole, playtimeGuarantee, releaseClause };
      const done = this.completeIncomingTransfer(neg, agreedPlayerTerms);
      return { ok: true, outcome: 'accepted', deal: done, message: `🎉 ${p.name} đã đồng ý toàn bộ điều khoản và chính thức gia nhập Paris Saint-Germain!` };
    }

    if (totalScore >= 0.80 && neg.rounds < 6) {
      const counterWage = Math.round(neg.playerAskWage * 0.98);
      neg.playerAskWage = counterWage;
      neg.history.push(`💬 Người đại diện của ${p.name}: "Cầu thủ mong muốn mức lương €${counterWage}k/tuần và vai trò tối thiểu Đá chính tại PSG."`);
      return { ok: true, outcome: 'counter', counterWage, negotiation: neg, message: `${p.name} đề nghị mức lương €${counterWage}k/tuần.` };
    }

    neg.status = 'failed';
    neg.failReason = `${p.name} từ chối điều khoản cá nhân (€${weeklyWage}k/tuần · Vai trò: ${squadRole})`;
    neg.history.push(`❌ ${neg.failReason}.`);
    this.failedDeals.unshift({ ...neg, closedAt: this.getDateStr() });
    this.activeNegotiations = this.activeNegotiations.filter((n) => n.id !== neg.id);
    return { ok: true, outcome: 'rejected', negotiation: neg, message: `${p.name} đã từ chối hợp đồng cá nhân — Thương vụ đổ bể!` };
  }

  // Hoàn tất thương vụ mua/mượn vào PSG -> ĐỒNG BỘ TOÀN BỘ SINGLE SOURCE OF TRUTH
  completeIncomingTransfer(neg, playerTerms) {
    const p = this.state.getPlayerById(neg.playerId);
    const oldClub = p.club;
    const clubTerms = neg.clubAgreedTerms || { fee: neg.clubAskFee, upfront: neg.clubAskFee, installments: 0, perfBonus: 0, sellOnPct: 0 };
    const dateStr = this.getDateStr();
    const curYear = this.state.timeSystem ? this.state.timeSystem.year : (2025 + this.state.seasonNum);

    // 1. Cập nhật PlayerDatabase
    p.club = 'Paris Saint-Germain';
    p.squadLevel = 'Đội một';
    p.wage = playerTerms.weeklyWage;
    p.contractYears = neg.dealType === 'loan' ? 1 : playerTerms.contractYears;
    p.justJoined = true;
    p.shirtNumber = null; // Để FormationSystem cấp số áo trống hợp lệ mới
    p.contract = {
      ...(p.contract || {}),
      weeklyWage: playerTerms.weeklyWage,
      annualWage: +((playerTerms.weeklyWage * 52) / 1000).toFixed(2),
      signedDate: dateStr,
      expiryDate: `30/06/${curYear + p.contractYears}`,
      contractYears: p.contractYears,
      marketValue: p.value,
      expectedTransferFee: Math.round(p.value * 1.15),
      bonuses: `Thưởng ký €${playerTerms.signingBonus}M · Cam kết ra sân: ${playerTerms.playtimeGuarantee}`,
      clauses: [`Điều khoản giải phóng €${playerTerms.releaseClause}M`, ...(clubTerms.sellOnPct ? [`Chia sẻ bán lại ${clubTerms.sellOnPct}% cho ${oldClub}`] : [])],
      renewalStatus: 'Ổn định',
      releaseClause: playerTerms.releaseClause
    };
    p.psychology = {
      ...(p.psychology || {}),
      squadRole: playerTerms.squadRole,
      morale: 92,
      satisfaction: 94,
      loyalty: 80,
      futureDesire: 'Khát khao tỏa sáng và giành danh hiệu cùng Paris Saint-Germain.'
    };
    p.morale = 92;
    p.satisfaction = 94;

    if (neg.dealType === 'loan' || neg.dealType === 'loan_buy') {
      p.loanInfo = {
        parentClub: oldClub,
        loanClub: 'Paris Saint-Germain',
        startSeason: this.state.season,
        endSeason: this.state.season,
        buyOptionFee: neg.dealType === 'loan_buy' ? (clubTerms.buyOptionFee || Math.round(p.value * 0.95)) : null,
        loanApps: 0,
        loanGoals: 0
      };
      p.career.loanHistory.unshift({ season: this.state.season, from: oldClub, to: 'Paris Saint-Germain', buyOption: p.loanInfo.buyOptionFee });
    } else {
      p.loanInfo = null;
    }

    p.career.transferHistory.unshift({
      date: dateStr,
      from: oldClub,
      to: 'Paris Saint-Germain',
      fee: `€${clubTerms.fee}M`,
      type: neg.dealType === 'buy' ? 'Mua đứt' : neg.dealType === 'loan_buy' ? 'Mượn kèm mua đứt' : 'Cho mượn'
    });
    p.career.pastClubs.push({ club: 'Paris Saint-Germain', years: `${curYear}–Hiện tại`, apps: 0, goals: 0, assists: 0 });

    // 2. Nếu có trao đổi cầu thủ PSG -> chuyển cầu thủ đó sang CLB đối tác
    if (clubTerms.swapPlayerId) {
      const sw = this.state.getPsgSquad().find((x) => x.id === clubTerms.swapPlayerId);
      if (sw) {
        sw.club = oldClub;
        sw.shirtNumber = null;
        sw.career.transferHistory.unshift({ date: dateStr, from: 'Paris Saint-Germain', to: oldClub, fee: 'Trao đổi cầu thủ', type: 'Trao đổi' });
        this.removePlayerFromFormation(sw.id);
      }
    }

    // 3. Cập nhật Tài chính & CLB đối tác
    const totalUpfront = +(clubTerms.upfront + (playerTerms.signingBonus || 0)).toFixed(2);
    this.state.addLedger(`${neg.dealType === 'buy' ? 'Chiêu mộ' : 'Mượn'} ${p.name} từ ${oldClub}`, -totalUpfront);
    const seller = this.state.clubs.find((c) => c.name === oldClub);
    if (seller) seller.budget = +(seller.budget + clubTerms.fee).toFixed(1);
    this.recalcWeeklyWages();

    // 4. Lưu lịch sử thương vụ
    const dealRecord = {
      id: `deal_${Date.now()}`,
      date: dateStr,
      playerId: p.id,
      playerName: p.name,
      position: p.position,
      from: oldClub,
      to: 'Paris Saint-Germain',
      fee: clubTerms.fee,
      wage: playerTerms.weeklyWage,
      type: neg.dealType === 'buy' ? 'Mua đứt' : neg.dealType === 'loan_buy' ? 'Mượn kèm mua đứt' : 'Mượn'
    };
    this.completedDeals.unshift(dealRecord);
    this.activeNegotiations = this.activeNegotiations.filter((n) => n.id !== neg.id);

    // 5. Đồng bộ Đội hình, Số áo, Tủ đồ 3D, NPC 3D & Báo chí
    this.state.formationSystem?.ensureShirtNumbers();
    this.state.formationSystem?.notify();
    PressNewsSystem.generateTransferNews(this.state, p.name, oldClub, clubTerms.fee, true);
    this.state.pushPhoneMsg(
      'Phòng Chuyển Nhượng PSG',
      `🎉 TÂN BINH CHÍNH THỨC: ${p.name} (#${p.shirtNumber})`,
      `${p.name} đã hoàn tất kiểm tra y tế, nhận áo số #${p.shirtNumber}, nhận tủ đồ cá nhân trong Phòng Thay Đồ và sẵn sàng ra sân tập 3D cùng đội một PSG!`,
      true
    );
    this.state.notifySquadChanged();

    // Tự động chuyển sang trạng thái Awaiting Official Signing Event khi thương vụ đã xác nhận hoàn tất!
    if (this.state.signingEventSystem) {
      this.state.signingEventSystem.scheduleOfficialEvent({
        dealVerified: true,
        dealKey: dealRecord.id,
        eventType: 'player_signing',
        playerId: p.id,
        subjectName: p.name,
        position: p.position,
        shirtNumber: p.shirtNumber,
        ovr: p.ovr,
        fromClub: oldClub,
        fee: clubTerms.fee,
        wage: playerTerms.weeklyWage,
        contractYears: p.contractYears,
        contractSnapshot: { ...p.contract }
      });
    }

    return dealRecord;
  }

  // ==================== ĐÔN CẦU THỦ TRẺ LÊN ĐỘI MỘT (GIỮ NGUYÊN playerId) ====================

  generateAcademyProposals() {
    const dir = this.state.staffDb?.active?.find((s) => s.roleKey === 'academy_director')?.name || 'Yohan Cabaye';
    const eligible = this.state.academy
      .filter((y) => !y.promoted && !y.loanClub && (y.squad === 'U19' || y.squad === 'Đội dự bị') && y.pot >= 83)
      .sort((a, b) => (b.pot + b.ovr) - (a.pot + a.ovr))
      .slice(0, 5);

    this.academyProposals = eligible.map((y) => ({
      id: `prop_ac_${y.id}`,
      playerId: y.id,
      playerName: y.name,
      squad: y.squad,
      position: y.position,
      age: y.age,
      ovr: y.ovr,
      pot: y.pot,
      author: dir,
      recommendation: `${dir}: "${y.name} (${y.age} tuổi, ${y.position}, OVR ${y.ovr}/POT ${y.pot}) đang thể hiện vượt trội tại ${y.squad}. Tôi đề xuất Chủ tịch đôn em lên đội một hoặc cho mượn tích lũy kinh nghiệm."`,
      status: 'pending' // 'pending' | 'promoted' | 'evaluating' | 'rejected' | 'loaned'
    }));
  }

  // Đôn cầu thủ trẻ lên đội một: TUYỆT ĐỐI GIỮ NGUYÊN playerId (không tạo bản ghi trùng!)
  promoteAcademyPlayer(playerId) {
    const yIdx = this.state.academy.findIndex((x) => x.id === playerId);
    if (yIdx === -1) return { ok: false, error: 'Không tìm thấy cầu thủ trẻ trong Học viện.' };
    const y = this.state.academy[yIdx];
    if (y.promoted) return { ok: false, error: 'Cầu thủ này đã được đôn lên đội một.' };

    const dateStr = this.getDateStr();
    const curYear = this.state.timeSystem ? this.state.timeSystem.year : (2025 + this.state.seasonNum);

    // Giữ nguyên chính object & playerId (y.id === y.playerId)
    y.promoted = true;
    y.proContract = true;
    y.club = 'Paris Saint-Germain';
    y.squadLevel = 'Đội một';
    y.justJoined = true;
    y.wage = Math.max(22, Math.round((y.ovr - 55) * 1.4));
    y.contractYears = 4;
    y.value = Math.max(4, Math.round((y.ovr - 58) * 1.1 + (y.pot >= 86 ? 6 : 2)));
    y.shirtNumber = null;
    y.contract = {
      ...(y.contract || {}),
      weeklyWage: y.wage,
      annualWage: +((y.wage * 52) / 1000).toFixed(2),
      signedDate: dateStr,
      expiryDate: `30/06/${curYear + 4}`,
      contractYears: 4,
      marketValue: y.value,
      expectedTransferFee: Math.round(y.value * 1.25),
      bonuses: 'Thưởng ra mắt đội một €15k · Thưởng danh hiệu €80k',
      clauses: ['Hợp đồng chuyên nghiệp đầu tiên xuất thân Học viện PSG'],
      renewalStatus: 'Ổn định',
      releaseClause: Math.round(y.value * 2.5)
    };
    y.psychology = {
      ...(y.psychology || {}),
      squadRole: 'Triển vọng đội một',
      morale: 95,
      satisfaction: 96,
      loyalty: 95,
      futureDesire: 'Quyết tâm chứng tỏ bản thân trong màu áo đội một Paris Saint-Germain.'
    };
    y.morale = 95;
    y.satisfaction = 96;
    y.career.transferHistory.unshift({
      date: dateStr,
      from: `Học viện PSG (${y.squad})`,
      to: 'Đội một Paris Saint-Germain',
      fee: 'Đôn từ Học viện',
      type: 'Đôn đội một'
    });

    // Đưa đúng bản ghi playerId đó sang danh sách đội một (kiểm tra chắc chắn không trùng ID)
    const alreadyInPlayers = this.state.players.some((p) => p.id === y.id);
    if (!alreadyInPlayers) {
      this.state.players.push(y);
    }

    const prop = this.academyProposals.find((pr) => pr.playerId === y.id);
    if (prop) prop.status = 'promoted';

    this.state.formationSystem?.ensureShirtNumbers();
    this.state.formationSystem?.notify();
    this.recalcWeeklyWages();

    this.state.pushPhoneMsg(
      'Học Viện Bóng Đá PSG',
      `🎓 ĐÔN ĐỘI MỘT THÀNH CÔNG: ${y.name} (#${y.shirtNumber})`,
      `Cầu thủ trẻ ${y.name} (ID: ${y.id}) đã ký hợp đồng chuyên nghiệp 4 năm (€${y.wage}k/tuần), nhận áo #${y.shirtNumber}, có tủ cá nhân và đã gia nhập buổi tập đội một!`,
      false
    );
    this.state.notifySquadChanged();

    // Tạo sự kiện ra mắt đôn cầu thủ trẻ lên đội một (giữ nguyên playerId!)
    if (this.state.signingEventSystem) {
      this.state.signingEventSystem.scheduleOfficialEvent({
        dealVerified: true,
        dealKey: `youth_promo_${y.id}`,
        eventType: 'youth_promotion',
        playerId: y.id,
        subjectName: y.name,
        position: y.position,
        shirtNumber: y.shirtNumber,
        ovr: y.ovr,
        fromClub: `Học viện PSG (${y.squad})`,
        fee: 0,
        wage: y.wage,
        contractYears: y.contractYears,
        contractSnapshot: { ...y.contract }
      });
    }

    return { ok: true, player: y };
  }

  respondToAcademyProposal(playerId, action) {
    const y = this.state.academy.find((x) => x.id === playerId);
    const prop = this.academyProposals.find((pr) => pr.playerId === playerId);
    if (!y) return { ok: false, error: 'Không tìm thấy cầu thủ trẻ.' };

    if (action === 'promote') return this.promoteAcademyPlayer(playerId);
    if (action === 'evaluate') {
      y.trainingWithFirstTeam = true;
      y.ovr = Math.min(y.pot, y.ovr + 1);
      if (prop) prop.status = 'evaluating';
      return { ok: true, message: `Đã yêu cầu GĐ Học viện đánh giá thêm và cho ${y.name} tập thử cùng đội một (+1 OVR).` };
    }
    if (action === 'loan') {
      const dest = this.state.clubs.find((c) => c.league === 'Ligue 1' && c.name !== 'Paris Saint-Germain' && c.rating <= 77) || this.state.clubs[10];
      return this.loanOutPlayer(playerId, dest.name, null);
    }
    if (action === 'stay') {
      if (prop) prop.status = 'stay_youth';
      return { ok: true, message: `${y.name} sẽ tiếp tục thi đấu tích lũy kinh nghiệm tại ${y.squad}.` };
    }
    if (prop) prop.status = 'rejected';
    return { ok: true, message: `Đã từ chối đề xuất đôn ${y.name} ở thời điểm hiện tại.` };
  }

  // ==================== BÁN & CHO MƯỢN CẦU THỦ PSG ====================

  removePlayerFromFormation(playerId) {
    const fs = this.state.formationSystem;
    if (!fs) return;
    fs.starterIds = fs.starterIds.filter((id) => id !== playerId);
    if (fs.captainId === playerId) {
      const nextCap = this.state.getPsgSquad().find((p) => p.id !== playerId);
      fs.captainId = nextCap ? nextCap.id : null;
    }
    fs.notify();
  }

  sellPlayer(playerId, buyerClubName, fee) {
    const p = this.state.getPsgSquad().find((x) => x.id === playerId);
    if (!p) return { ok: false, error: 'Không tìm thấy cầu thủ trong đội một PSG.' };
    if (this.state.getPsgSquad().length <= 15) {
      return { ok: false, error: 'Đội một cần tối thiểu 15 cầu thủ, không thể bán thêm!' };
    }

    const buyer = this.state.clubs.find((c) => c.name === buyerClubName) || this.state.clubs.find((c) => c.name !== 'Paris Saint-Germain' && c.budget >= fee * 0.7);
    const destName = buyer ? buyer.name : buyerClubName || 'Chelsea';
    const saleFee = Math.max(1, Number(fee || p.value));
    const dateStr = this.getDateStr();

    p.club = destName;
    p.shirtNumber = null;
    p.transferListed = false;
    p.loanInfo = null;
    p.career.transferHistory.unshift({ date: dateStr, from: 'Paris Saint-Germain', to: destName, fee: `€${saleFee}M`, type: 'Bán đứt' });

    if (buyer) buyer.budget = Math.max(5, +(buyer.budget - saleFee).toFixed(1));
    this.state.addLedger(`Bán ${p.name} cho ${destName}`, +saleFee);
    this.state.finance.income.sales = +(this.state.finance.income.sales + saleFee).toFixed(1);

    this.removePlayerFromFormation(p.id);
    this.recalcWeeklyWages();

    const deal = { id: `deal_${Date.now()}`, date: dateStr, playerId: p.id, playerName: p.name, position: p.position, from: 'Paris Saint-Germain', to: destName, fee: saleFee, type: 'Bán đứt' };
    this.completedDeals.unshift(deal);
    this.incomingBids = this.incomingBids.filter((b) => b.playerId !== p.id);

    PressNewsSystem.generateTransferNews(this.state, p.name, destName, saleFee, false);
    this.state.notifySquadChanged();
    return { ok: true, deal };
  }

  loanOutPlayer(playerId, loanClubName, buyOptionFee = null) {
    const p = this.state.getPlayerById(playerId);
    if (!p) return { ok: false, error: 'Không tìm thấy cầu thủ.' };
    const dateStr = this.getDateStr();
    const destName = loanClubName || 'RC Strasbourg Alsace';

    p.loanClub = destName;
    p.loanListed = false;
    p.squadLevel = 'Cho mượn';
    p.club = destName; // Đang thi đấu tạm thời tại CLB mượn
    p.loanInfo = {
      parentClub: 'Paris Saint-Germain',
      loanClub: destName,
      startSeason: this.state.season,
      endSeason: this.state.season,
      buyOptionFee: buyOptionFee ? Number(buyOptionFee) : null,
      wageSplit: 60, // CLB mượn trả 60% lương
      loanApps: 0,
      loanGoals: 0,
      loanAvgRating: 7.0
    };
    p.career.loanHistory.unshift({ season: this.state.season, from: 'Paris Saint-Germain', to: destName, buyOption: buyOptionFee });

    const prop = this.academyProposals.find((pr) => pr.playerId === p.id);
    if (prop) prop.status = 'loaned';

    this.removePlayerFromFormation(p.id);
    this.recalcWeeklyWages();

    const deal = { id: `deal_${Date.now()}`, date: dateStr, playerId: p.id, playerName: p.name, position: p.position, from: 'Paris Saint-Germain', to: destName, fee: 0, type: buyOptionFee ? `Cho mượn (Mua đứt €${buyOptionFee}M)` : 'Cho mượn' };
    this.completedDeals.unshift(deal);
    this.state.notifySquadChanged();
    return { ok: true, deal, player: p };
  }

  // Theo dõi phong độ cầu thủ đang cho mượn mỗi tuần
  simulateLoanProgress() {
    const loaned = this.getLoanedOutPlayers();
    loaned.forEach((p) => {
      if (!p.loanInfo) return;
      p.loanInfo.loanApps = (p.loanInfo.loanApps || 0) + 1;
      if (['ST', 'LW', 'RW', 'AM'].includes(p.position) && Math.random() < 0.35) {
        p.loanInfo.loanGoals = (p.loanInfo.loanGoals || 0) + 1;
      }
      p.loanInfo.loanAvgRating = +(6.5 + Math.random() * 1.4).toFixed(1);
      if (p.age <= 23 && p.ovr < p.pot && Math.random() < 0.14) {
        p.ovr = Math.min(p.pot, p.ovr + 1);
      }
    });
  }

  // Tự động xử lý khi hết hạn cho mượn vào cuối mùa giải
  processExpiredLoans() {
    const returned = [];
    const boughtOut = [];
    const all = [...this.state.players, ...this.state.academy];
    const seen = new Set();

    all.forEach((p) => {
      if (seen.has(p.id) || !p.loanInfo) return;
      seen.add(p.id);
      const li = p.loanInfo;

      // Trường hợp PSG cho CLB khác mượn
      if (li.parentClub === 'Paris Saint-Germain') {
        const clubWantsBuy = li.buyOptionFee && (li.loanAvgRating >= 7.2 || p.ovr >= 78) && Math.random() < 0.55;
        if (clubWantsBuy) {
          this.state.addLedger(`${li.loanClub} kích hoạt mua đứt ${p.name}`, +li.buyOptionFee);
          p.club = li.loanClub;
          p.squadLevel = 'Đội một';
          p.loanInfo = null;
          p.loanClub = null;
          boughtOut.push(`${p.name} → ${li.loanClub} (+€${li.buyOptionFee}M)`);
        } else {
          p.club = 'Paris Saint-Germain';
          p.squadLevel = p.promoted || !p.squad ? 'Đội một' : p.squad;
          p.loanInfo = null;
          p.loanClub = null;
          returned.push(p.name);
        }
      } else if (li.loanClub === 'Paris Saint-Germain') {
        // Trường hợp PSG mượn cầu thủ từ CLB khác -> trả về CLB chủ quản cuối mùa
        p.club = li.parentClub;
        p.shirtNumber = null;
        p.loanInfo = null;
        this.removePlayerFromFormation(p.id);
      }
    });

    if (returned.length > 0 || boughtOut.length > 0) {
      this.state.pushPhoneMsg(
        'Phòng Chuyển Nhượng PSG',
        '📋 Tổng kết hết hạn cho mượn cuối mùa',
        `${returned.length ? `Trở lại PSG: ${returned.join(', ')}. ` : ''}${boughtOut.length ? `Kích hoạt mua đứt: ${boughtOut.join(', ')}.` : ''}`,
        false
      );
      this.state.formationSystem?.notify();
      this.state.notifySquadChanged();
    }
    return { returned, boughtOut };
  }

  getLoanedOutPlayers() {
    const seen = new Set();
    const out = [];
    [...this.state.players, ...this.state.academy].forEach((p) => {
      if (!seen.has(p.id) && p.loanInfo && p.loanInfo.parentClub === 'Paris Saint-Germain') {
        seen.add(p.id);
        out.push(p);
      }
    });
    return out;
  }

  // ==================== HOẠT ĐỘNG AI CỦA CÁC CLB KHÁC ====================

  generateIncomingBids(maxNew = 2) {
    if (!this.isWindowOpen()) return;
    const psgSquad = this.state.getPsgSquad();
    const candidates = psgSquad.filter((p) => p.transferListed || p.ovr >= 78);
    const richClubs = this.state.clubs.filter((c) => c.name !== 'Paris Saint-Germain' && c.budget >= 35);
    if (candidates.length === 0 || richClubs.length === 0) return;

    for (let i = 0; i < maxNew; i++) {
      if (this.incomingBids.length >= 5) break;
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      if (this.incomingBids.some((b) => b.playerId === target.id)) continue;
      const buyer = richClubs.find((c) => c.budget >= target.value * 0.9);
      if (!buyer) continue;
      const offerFee = Math.round(target.value * (0.95 + Math.random() * 0.25));
      if (offerFee > buyer.budget) continue;
      this.incomingBids.unshift({
        id: `bid_${Date.now()}_${i}`,
        date: this.getDateStr(),
        buyerClub: buyer.name,
        playerId: target.id,
        playerName: target.name,
        position: target.position,
        ovr: target.ovr,
        fee: offerFee
      });
    }
  }

  // AI các CLB khác tự mua bán, gia hạn hợp đồng, cho mượn, thay HLV & phát triển cầu thủ trẻ (không vượt ngân sách!)
  runAiTransferMarketCycle(dealCount = 3) {
    const aiClubs = this.state.clubs.filter((c) => c.name !== 'Paris Saint-Germain');
    const dateStr = this.getDateStr();
    const created = [];

    for (let i = 0; i < dealCount; i++) {
      const buyer = aiClubs[Math.floor(Math.random() * aiClubs.length)];
      if (!buyer || buyer.budget < 12) continue;

      // Xác định nhu cầu vị trí & ngân sách hợp lý của CLB AI
      const clubPlayers = this.state.players.filter((p) => p.club === buyer.name);
      const posNeeded = ['ST', 'CM', 'CB', 'GK', 'RW', 'LW'].find((pos) => !clubPlayers.some((cp) => cp.position === pos)) || 'ST';
      const maxSpend = +(buyer.budget * 0.65).toFixed(1);

      const pool = this.state.players.filter((p) =>
        p.club !== 'Paris Saint-Germain' &&
        p.club !== buyer.name &&
        !p.loanInfo &&
        p.value <= maxSpend &&
        p.ovr >= buyer.rating - 10 &&
        p.ovr <= buyer.rating + 5
      );
      if (pool.length === 0) continue;

      const prioritized = pool.filter((p) => p.position === posNeeded);
      const chosen = (prioritized.length ? prioritized : pool)[Math.floor(Math.random() * (prioritized.length ? prioritized.length : pool.length))];
      if (!chosen) continue;

      const oldClubName = chosen.club;
      const seller = this.state.clubs.find((c) => c.name === oldClubName);
      const fee = Math.min(maxSpend, Math.round(chosen.value * (0.95 + Math.random() * 0.2)));
      if (fee > buyer.budget) continue;

      chosen.club = buyer.name;
      chosen.contractYears = 4;
      if (chosen.contract) chosen.contract.contractYears = 4;
      chosen.career.transferHistory.unshift({ date: dateStr, from: oldClubName, to: buyer.name, fee: `€${fee}M`, type: 'Mua đứt' });

      buyer.budget = +(buyer.budget - fee).toFixed(1);
      if (seller) seller.budget = +(seller.budget + fee).toFixed(1);

      const rec = { id: `ai_deal_${Date.now()}_${i}`, date: dateStr, playerId: chosen.id, playerName: chosen.name, position: chosen.position, from: oldClubName, to: buyer.name, fee, type: 'AI Chuyển nhượng' };
      this.completedDeals.unshift(rec);
      created.push(rec);

      if (fee >= 40) {
        this.state.pushSocial('Fabrizio Romano', '@FabrizioRomano', `Here we go! ${buyer.name} hoàn tất chiêu mộ ${chosen.name} từ ${oldClubName} với mức phí €${fee}M!`, 'neutral');
      }
    }

    // AI gia hạn hợp đồng cho trụ cột sắp hết hạn
    this.state.players.forEach((p) => {
      if (p.club !== 'Paris Saint-Germain' && p.contractYears <= 1 && p.ovr >= 82 && Math.random() < 0.3) {
        p.contractYears = 3;
        if (p.contract) {
          p.contract.contractYears = 3;
          p.contract.renewalStatus = 'Ổn định';
        }
      }
    });

    // AI sa thải / bổ nhiệm HLV nếu CLB Ligue 1 thành tích tệ
    const ligue1Underperf = aiClubs.filter((c) => c.league === 'Ligue 1' && c.played >= 10 && c.rating >= 79 && c.pts / c.played < 1.15);
    const aiManagers = ['Christophe Galtier', 'Philippe Clement', 'Franck Passi', 'Julien Stéphan', 'Laurent Blanc', 'Rudi Garcia'];
    ligue1Underperf.forEach((c) => {
      if (Math.random() < 0.25) {
        const nextMgr = aiManagers[Math.floor(Math.random() * aiManagers.length)];
        if (nextMgr !== c.manager) {
          c.manager = nextMgr;
          this.rumors.unshift({ id: `rum_${Date.now()}`, date: dateStr, title: `${c.name} thay tướng: Bổ nhiệm HLV ${nextMgr}`, detail: `Thành tích bết bát tại Ligue 1 buộc Ban lãnh đạo ${c.name} thay đổi HLV trưởng.`, reliability: 'Chính thức' });
        }
      }
    });

    if (this.completedDeals.length > 80) this.completedDeals.length = 80;
    if (this.rumors.length > 20) this.rumors.length = 20;
    return created;
  }

  recalcWeeklyWages() {
    const psgSquad = this.state.getPsgSquad();
    const playerWeeklyM = psgSquad.reduce((s, p) => s + (p.wage || 50), 0) / 1000;
    const staffWeeklyM = (this.state.staffDb?.active || []).reduce((s, st) => s + (st.wage || 30), 0) / 1000;
    this.state.finance.weeklyWages = +(playerWeeklyM + staffWeeklyM + 0.55).toFixed(2);
  }

  exportState() {
    return {
      windowState: this.windowState,
      windowConfig: this.windowConfig,
      activeNegotiations: this.activeNegotiations,
      completedDeals: this.completedDeals,
      failedDeals: this.failedDeals,
      incomingBids: this.incomingBids,
      rumors: this.rumors,
      academyProposals: this.academyProposals,
      windowReports: this.windowReports
    };
  }

  importState(snap) {
    if (!snap) return;
    this.windowState = snap.windowState || 'summer';
    if (snap.windowConfig) this.windowConfig = snap.windowConfig;
    this.activeNegotiations = snap.activeNegotiations || [];
    this.completedDeals = snap.completedDeals || [];
    this.failedDeals = snap.failedDeals || [];
    this.incomingBids = snap.incomingBids || [];
    this.rumors = snap.rumors || [];
    this.academyProposals = snap.academyProposals || [];
    this.windowReports = snap.windowReports || [];
  }
}
