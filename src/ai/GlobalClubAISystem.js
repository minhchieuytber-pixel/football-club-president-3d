// src/ai/GlobalClubAISystem.js
// Hệ thống AI Quản lý CLB Toàn Cầu, Tài chính Toàn Cầu, Chiến thuật HLV, Cạnh tranh Chuyển nhượng & Giải đấu Đa quốc gia
// - Tích hợp trực tiếp lên state.clubs & state.players mà không trùng lặp dữ liệu hay tạo hệ thống thứ hai.
// - Mọi CLB đều có Tài chính thật (cash, bankBalance, transferBudget, wageBudget, revenue, expenses, receivables, payables, debt, ffpStatus, profitLoss),
//   Phân khúc CLB (giant / contender / developer có lên/xuống hạng theo mùa) và Hồ sơ HLV chiến thuật riêng.

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function r1(v) {
  return +Number(v || 0).toFixed(1);
}

function r2(v) {
  return +Number(v || 0).toFixed(2);
}

const TACTICAL_PROFILES = [
  { style: '4-3-3 Kiểm soát bóng', formation: '4-3-3', atk: 84, def: 79, press: 84, poss: 88, cnt: 72, youth: 80, rot: 78 },
  { style: '4-2-3-1 Pressing tầm cao', formation: '4-2-3-1', atk: 85, def: 80, press: 89, poss: 79, cnt: 81, youth: 76, rot: 80 },
  { style: '3-5-2 Chuyển trạng thái nhanh', formation: '3-5-2', atk: 82, def: 84, press: 82, poss: 74, cnt: 88, youth: 74, rot: 77 },
  { style: '4-4-2 Phòng ngự phản công', formation: '4-4-2', atk: 79, def: 86, press: 75, poss: 68, cnt: 90, youth: 72, rot: 75 },
  { style: '4-3-3 Phát triển cầu thủ trẻ', formation: '4-3-3', atk: 81, def: 77, press: 82, poss: 81, cnt: 78, youth: 92, rot: 84 },
  { style: '3-4-2-1 Kiểm soát linh hoạt', formation: '3-4-2-1', atk: 84, def: 81, press: 85, poss: 85, cnt: 77, youth: 78, rot: 81 }
];

const AI_MANAGER_POOL = [
  { name: 'Xabi Alonso', nat: 'Tây Ban Nha', ability: 88, styleIdx: 5 },
  { name: 'Zinédine Zidane', nat: 'Pháp', ability: 90, styleIdx: 0 },
  { name: 'Jürgen Klopp', nat: 'Đức', ability: 91, styleIdx: 1 },
  { name: 'Thomas Tuchel', nat: 'Đức', ability: 86, styleIdx: 2 },
  { name: 'Mauricio Pochettino', nat: 'Argentina', ability: 83, styleIdx: 1 },
  { name: 'Roberto Mancini', nat: 'Ý', ability: 84, styleIdx: 0 },
  { name: 'Christophe Galtier', nat: 'Pháp', ability: 79, styleIdx: 3 },
  { name: 'Julien Stéphan', nat: 'Pháp', ability: 77, styleIdx: 4 },
  { name: 'Laurent Blanc', nat: 'Pháp', ability: 78, styleIdx: 0 },
  { name: 'Thiago Motta', nat: 'Ý', ability: 82, styleIdx: 5 },
  { name: 'Marco Rose', nat: 'Đức', ability: 82, styleIdx: 1 },
  { name: 'Oliver Glasner', nat: 'Áo', ability: 81, styleIdx: 2 },
  { name: 'Michel Sánchez', nat: 'Tây Ban Nha', ability: 81, styleIdx: 0 },
  { name: 'Franck Haise', nat: 'Pháp', ability: 80, styleIdx: 2 }
];

const SIMULATED_LEAGUES = [
  'Premier League',
  'La Liga',
  'Bundesliga',
  'Serie A',
  'Primeira Liga',
  'Eredivisie'
];

export class GlobalClubAISystem {
  constructor(state) {
    this.state = state;
    this.reset();
  }

  reset() {
    this.lastTickPeriodId = null;
    this.leagueRounds = {};
    this.tierChangeLogs = [];
    this.coachChangeLogs = [];
    this._ensureAllClubsInitialized();
  }

  _dateStr() {
    return this.state?.timeSystem?.getDateString?.() || `Tuần ${this.state?.week || 1}`;
  }

  _classifyInitialTier(club) {
    if (!club) return 'developer';
    if (club.tier && ['giant', 'contender', 'developer'].includes(club.tier)) return club.tier;
    if (
      club.name === 'Paris Saint-Germain' ||
      (club.rating >= 87 && (club.budget || 0) >= 150) ||
      ['Real Madrid', 'Manchester City', 'Bayern Munich', 'Liverpool', 'Arsenal', 'FC Barcelona', 'Inter Milan', 'Chelsea'].includes(club.name)
    ) {
      return 'giant';
    }
    if (club.rating >= 80 || (club.budget || 0) >= 85) {
      return 'contender';
    }
    return 'developer';
  }

  _ensureAllClubsInitialized() {
    const clubs = this.state?.clubs || [];
    clubs.forEach((club, idx) => this.ensureClubProfile(club, idx));
    // Tính lại rating thực tế theo đội hình hiện có nhưng không làm sai lệch cân bằng khởi tạo
    clubs.forEach((club) => {
      if (!club._initialPowerSynced) {
        this.recomputeClubStrength(club.name, true);
        club._initialPowerSynced = true;
      }
    });
  }

  ensureClubProfile(club, idx = 0) {
    if (!club) return null;
    if (!club.tier) club.tier = this._classifyInitialTier(club);
    if (!club.baseRating) club.baseRating = club.rating || 78;

    if (!club.coachProfile || typeof club.coachProfile !== 'object') {
      const tp = TACTICAL_PROFILES[(idx + (club.tier === 'developer' ? 4 : 0)) % TACTICAL_PROFILES.length];
      const ability = clamp((club.rating || 78) + (club.tier === 'giant' ? 2 : 0), 68, 95);
      club.coachProfile = {
        name: club.manager || 'HLV Trưởng',
        ability,
        tacticalStyle: club.name === 'Paris Saint-Germain' ? (this.state?.coach?.tacticalStyle || tp.style) : tp.style,
        preferredFormation: tp.formation,
        attack: tp.atk + Math.round((ability - 82) * 0.4),
        defense: tp.def + Math.round((ability - 82) * 0.4),
        pressing: tp.press,
        possession: tp.poss,
        counter: tp.cnt,
        youthTrust: club.tier === 'developer' ? Math.max(85, tp.youth) : tp.youth,
        rotation: tp.rot,
        contractYears: 2 + (idx % 3),
        wage: Math.round(ability * 1.45),
        patience: club.tier === 'giant' ? 68 : club.tier === 'contender' ? 76 : 84
      };
    } else {
      club.coachProfile.name = club.manager || club.coachProfile.name;
    }

    if (club.name === 'Paris Saint-Germain' && this.state?.finance) {
      this.syncPsgClubSummary();
      return club;
    }

    if (!club.finance || typeof club.finance !== 'object') {
      const tb = r1(club.budget || 50);
      const cash = r1(Math.max(12, tb * 1.18 + (club.tier === 'giant' ? 38 : club.tier === 'contender' ? 16 : 6)));
      const squad = (this.state?.players || []).filter((p) => p.club === club.name);
      const squadWageM = squad.length
        ? r2(squad.reduce((s, p) => s + (p.wage || 45), 0) / 1000)
        : r2(club.wageBudget || tb * 0.032 + 1.2);

      const tv = r1(club.league === 'Premier League' ? 135 : ['La Liga', 'Bundesliga', 'Serie A', 'Ligue 1'].includes(club.league) ? 72 + (club.rating - 75) * 2.5 : 32 + (club.rating - 74) * 1.6);
      const sponsors = r1(club.tier === 'giant' ? 115 + (club.rating - 86) * 12 : club.tier === 'contender' ? 42 + (club.rating - 80) * 6 : 16 + Math.max(0, club.rating - 74) * 2.5);
      const tickets = r1(club.tier === 'giant' ? 62 : club.tier === 'contender' ? 30 : 14);
      const commercial = r1(club.tier === 'giant' ? 54 : club.tier === 'contender' ? 22 : 9);
      const opsCost = r1(club.tier === 'giant' ? 48 : club.tier === 'contender' ? 24 : 11);
      const debt = club.name === 'FC Barcelona' ? 120 : club.tier === 'contender' && idx % 3 === 0 ? 36 : (idx % 4 === 0 ? 18 : 0);

      club.finance = {
        cash,
        bankBalance: cash,
        transferBudget: tb,
        wageBudget: r2(Math.max(squadWageM * 1.18, club.wageBudget || squadWageM * 1.25)),
        weeklyWages: squadWageM,
        revenue: { tv, tickets, sponsors, commercial, prize: 0, sales: 0 },
        expenses: { wages: r1(squadWageM * 42), transfers: 0, ops: opsCost, debtInterest: r1(debt * 0.04) },
        profitLoss: r1((tv + sponsors + tickets + commercial) - (squadWageM * 42 + opsCost + debt * 0.04)),
        debt,
        receivables: [],
        payables: [],
        sponsors,
        commercialRev: commercial,
        prizeMoney: 0,
        ffpStatus: debt > 95 ? 'Cảnh báo FFP' : 'An toàn FFP',
        prestige: clamp((club.rating || 78) + (club.tier === 'giant' ? 4 : 0), 60, 99),
        austerityMode: cash < 20 || debt > 105,
        processedTxIds: []
      };
      club.wageBudget = club.finance.wageBudget;
    } else {
      club.finance.cash = r1(club.finance.cash ?? club.budget ?? 35);
      club.finance.bankBalance = club.finance.cash;
      club.finance.transferBudget = r1(club.budget ?? club.finance.transferBudget ?? 35);
      if (!Array.isArray(club.finance.receivables)) club.finance.receivables = [];
      if (!Array.isArray(club.finance.payables)) club.finance.payables = [];
      if (!Array.isArray(club.finance.processedTxIds)) club.finance.processedTxIds = [];
      this._recalcAiClubFinancialHealth(club);
    }

    return club;
  }

  syncPsgClubSummary() {
    const psgClub = (this.state?.clubs || []).find((c) => c.name === 'Paris Saint-Germain');
    const f = this.state?.finance;
    if (!psgClub || !f) return;
    psgClub.budget = r1(f.transferBudget);
    psgClub.wageBudget = r2(Math.max(f.weeklyWages * 1.2, 6.2));
    const incTotal = Object.values(f.income || {}).reduce((s, v) => s + Number(v || 0), 0);
    const expTotal = Object.values(f.expenses || {}).reduce((s, v) => s + Number(v || 0), 0);
    psgClub.finance = {
      cash: r1(f.cash ?? f.budget),
      bankBalance: r1(f.bankBalance ?? f.budget),
      transferBudget: r1(f.transferBudget),
      wageBudget: psgClub.wageBudget,
      weeklyWages: r2(f.weeklyWages),
      revenue: { ...(f.income || {}) },
      expenses: { ...(f.expenses || {}) },
      profitLoss: r1(incTotal - expTotal),
      debt: r1(f.debt || 0),
      receivables: f.receivables || [],
      payables: f.payables || [],
      sponsors: f.income?.sponsors || 145,
      commercialRev: f.income?.merch || 54,
      prizeMoney: f.income?.prize || 42,
      ffpStatus: f.ffpStatus,
      prestige: this.state?.president?.prestige || 88,
      austerityMode: (f.cash ?? f.budget) < 15
    };
  }

  _recalcAiClubFinancialHealth(club) {
    if (!club?.finance || club.name === 'Paris Saint-Germain') return;
    const fin = club.finance;
    const revSum = Object.values(fin.revenue || {}).reduce((s, x) => s + Number(x || 0), 0);
    const expSum = Object.values(fin.expenses || {}).reduce((s, x) => s + Number(x || 0), 0);
    fin.profitLoss = r1(revSum - expSum);
    fin.bankBalance = r1(fin.cash);
    fin.transferBudget = r1(Math.max(0, Math.min(fin.transferBudget, Math.max(fin.cash * 0.92, fin.transferBudget * 0.85))));
    club.budget = fin.transferBudget;

    const wageAndTransferRatio = revSum > 0 ? ((fin.expenses.wages || 0) + (fin.expenses.transfers || 0) * 0.35) / revSum : 0.9;
    if (fin.cash < 10 || fin.debt > 110 || wageAndTransferRatio > 0.96) {
      fin.ffpStatus = 'Vi phạm / Siết FFP';
      fin.austerityMode = true;
    } else if (fin.cash < 24 || fin.debt > 70 || wageAndTransferRatio > 0.84) {
      fin.ffpStatus = 'Cảnh báo FFP';
      fin.austerityMode = fin.cash < 16 || fin.debt > 85;
    } else {
      fin.ffpStatus = `An toàn FFP (${Math.round(clamp(wageAndTransferRatio * 100, 42, 82))}% DT)`;
      fin.austerityMode = false;
    }
  }

  recordAiClubTx(club, { txKey, cashDelta = 0, transferBudgetDelta = null, revKey = null, revAmt = 0, expKey = null, expAmt = 0, debtDelta = 0 }) {
    if (!club || club.name === 'Paris Saint-Germain') return false;
    this.ensureClubProfile(club);
    const fin = club.finance;
    if (txKey && fin.processedTxIds.includes(txKey)) return false;
    if (txKey) {
      fin.processedTxIds.push(txKey);
      if (fin.processedTxIds.length > 160) fin.processedTxIds.shift();
    }

    fin.cash = r1(fin.cash + cashDelta);
    if (fin.cash < 0) {
      // Thâm hụt tiền mặt chuyển thành nợ ngắn hạn thay vì để tiền âm vô hạn
      fin.debt = r1((fin.debt || 0) + Math.abs(fin.cash));
      fin.cash = 0;
    }
    fin.bankBalance = fin.cash;

    const tbDelta = transferBudgetDelta !== null ? transferBudgetDelta : (cashDelta >= 0 ? cashDelta * 0.65 : cashDelta);
    fin.transferBudget = r1(Math.max(0, Math.min(fin.cash * 1.15, fin.transferBudget + tbDelta)));
    club.budget = fin.transferBudget;

    if (revKey && revAmt) {
      fin.revenue[revKey] = r1((fin.revenue[revKey] || 0) + revAmt);
      if (revKey === 'prize') fin.prizeMoney = r1((fin.prizeMoney || 0) + revAmt);
      if (revKey === 'sponsors') fin.sponsors = r1(fin.revenue.sponsors);
      if (revKey === 'commercial') fin.commercialRev = r1(fin.revenue.commercial);
    }
    if (expKey && expAmt) {
      fin.expenses[expKey] = r1((fin.expenses[expKey] || 0) + expAmt);
    }
    if (debtDelta) {
      fin.debt = r1(Math.max(0, (fin.debt || 0) + debtDelta));
    }
    this._recalcAiClubFinancialHealth(club);
    return true;
  }

  // Tính lại sức mạnh CLB dựa trên đội hình thực tế đang sở hữu + HLV trưởng
  recomputeClubStrength(clubName, preserveInitialFloor = false) {
    const club = (this.state?.clubs || []).find((c) => c.name === clubName);
    if (!club) return 78;
    const roster = (this.state?.players || []).filter((p) => p.club === clubName && (p.injuryDays || 0) === 0);
    const fullRoster = (this.state?.players || []).filter((p) => p.club === clubName);
    const sorted = [...roster].sort((a, b) => b.ovr - a.ovr);

    if (sorted.length === 0) {
      return club.rating || 78;
    }

    const topPlayers = sorted.slice(0, Math.min(11, sorted.length));
    const avgTopOvr = topPlayers.reduce((s, p) => s + p.ovr, 0) / topPlayers.length;
    const avgForm = topPlayers.reduce((s, p) => s + (p.form || 75), 0) / topPlayers.length;
    const baseSeed = club.baseRating || club.rating || 78;
    // Khi một CLB mới chỉ có 3-5 ngôi sao trong PlayerDatabase200, pha trộn hài hòa với baseRating + biến động chuyển nhượng
    const rosterWeight = sorted.length >= 11 ? 0.85 : clamp(sorted.length / 12, 0.25, 0.72);
    const depthBonus = sorted.length >= 14 ? 1.2 : sorted.length <= 3 ? -0.8 : 0;
    const coachBonus = ((club.coachProfile?.ability || 80) - 80) * 0.14;
    const formBonus = (avgForm - 75) * 0.06;

    let computed = avgTopOvr * rosterWeight + baseSeed * (1 - rosterWeight) + depthBonus + coachBonus + formBonus;
    if (preserveInitialFloor) {
      computed = baseSeed * 0.65 + computed * 0.35;
    }
    club.rating = Math.round(clamp(computed, 66, 95));

    if (club.name !== 'Paris Saint-Germain' && club.finance && fullRoster.length > 0) {
      const realWageM = r2(fullRoster.reduce((s, p) => s + (p.wage || 45), 0) / 1000);
      const minScale = club.tier === 'giant' ? 2.4 : club.tier === 'contender' ? 1.15 : 0.45;
      club.finance.weeklyWages = r2(Math.max(realWageM, minScale));
    }
    return club.rating;
  }

  // Sức mạnh thực chiến trong trận đấu (dùng bởi MatchdaySystem & mô phỏng đa giải)
  getEffectiveClubPower(clubOrName, fixture = null) {
    const club = typeof clubOrName === 'string'
      ? (this.state?.clubs || []).find((c) => c.name === clubOrName)
      : clubOrName;
    if (!club || typeof club !== 'object') return 76;
    this.ensureClubProfile(club);
    const cp = club.coachProfile || {};
    const tacFit = ((cp.attack || 80) + (cp.defense || 80) + (cp.pressing || 80)) / 3;
    const moraleBoost = club.finance?.austerityMode ? -1.4 : 0.4;
    const homeBonus = fixture && fixture.home === club.name ? 2.5 : fixture && fixture.away === club.name ? -0.8 : 0;
    const importanceBoost = fixture && (fixture.importance || 1) >= 1.2 && club.tier === 'giant' ? 0.9 : 0;
    return clamp((club.rating || 78) * 0.90 + tacFit * 0.08 + moraleBoost + homeBonus + importanceBoost, 52, 102);
  }

  canClubAfford(clubOrName, upfrontCostM, addedWeeklyWageK = 0, totalFeeM = upfrontCostM) {
    const club = typeof clubOrName === 'string'
      ? (this.state?.clubs || []).find((c) => c.name === clubOrName)
      : clubOrName;
    if (!club || typeof club !== 'object') return false;
    if (club.name === 'Paris Saint-Germain') {
      return (this.state?.finance?.transferBudget || 0) >= upfrontCostM && (this.state?.finance?.cash ?? this.state?.finance?.budget ?? 0) >= upfrontCostM;
    }
    this.ensureClubProfile(club);
    const fin = club.finance;
    if (fin.austerityMode && upfrontCostM > 12) return false;
    if (upfrontCostM > fin.transferBudget || upfrontCostM > fin.cash * 0.92) return false;
    const projectedWeeklyWageM = (fin.weeklyWages || 1.2) + (addedWeeklyWageK / 1000);
    if (projectedWeeklyWageM > (fin.wageBudget || 4.0) * 1.15) return false;
    if ((fin.debt || 0) > 125 && totalFeeM > 20) return false;
    return true;
  }

  // ==================== ĐẤU GIÁ & TÂM LÝ CHỌN CLB CỦA CẦU THỦ ====================

  evaluatePsgCompetitiveBid(player, neg) {
    if (!player || !neg || neg.dealType === 'loan') return null;
    if (player.ovr < 81 && (player.pot || 75) < 86) return null;

    const rivals = (this.state?.clubs || []).filter((c) =>
      c.name !== 'Paris Saint-Germain' &&
      c.name !== player.club &&
      (c.tier === 'giant' || (c.tier === 'contender' && player.ovr <= 86)) &&
      this.canClubAfford(c, (player.valuation?.current ?? player.value) * 0.95, player.wage || 80) &&
      (c.positionalNeeds?.includes(player.position) || (player.valuation?.interestedClubs || []).includes(c.name))
    );
    if (rivals.length === 0) return null;

    // Sắp xếp CLB khao khát nhất
    rivals.sort((a, b) => ((b.finance?.prestige || b.rating) + (b.finance?.transferBudget || 0) * 0.1) - ((a.finance?.prestige || a.rating) + (a.finance?.transferBudget || 0) * 0.1));
    const rival = rivals[0];
    const baseAsk = neg.clubAskFee || player.valuation?.askingPrice || Math.round(player.value * 1.15);
    const rivalFee = r1(Math.min(rival.finance.transferBudget * 0.85, baseAsk * (1.03 + Math.random() * 0.11)));
    const rivalWage = Math.round((player.wage || 80) * (1.08 + (rival.tier === 'giant' ? 0.12 : 0.04)));
    return {
      rivalClub: rival,
      rivalClubName: rival.name,
      rivalFee,
      rivalWage,
      rivalRole: player.ovr >= (rival.rating - 1) ? 'Trụ cột không thể thay thế' : 'Đá chính thường xuyên'
    };
  }

  // Cầu thủ tự so sánh lời đề nghị giữa PSG và đối thủ (có thể từ chối PSG nếu PSG trả thấp hơn hoặc CLB kia hấp dẫn hơn!)
  evaluatePlayerDestinationChoice(player, psgOffer, rivalComp = null) {
    const psgClub = (this.state?.clubs || []).find((c) => c.name === 'Paris Saint-Germain');
    const psgPrestige = this.state?.president?.prestige || psgClub?.rating || 88;
    const psgCoachAbility = this.state?.coach?.tactics || 90;

    const scoreOffer = ({ clubPrestige, wage, askWage, role, playtime, bonusM, coachAbility, leagueName, isPsg }) => {
      const wageScore = clamp((wage / Math.max(20, askWage)) * 36, 10, 52);
      const roleMap = {
        'Trụ cột không thể thay thế': 18,
        'Đá chính thường xuyên': 14,
        'Xoay tua đội hình': 6,
        'Triển vọng': 3,
        'Dự bị': -8
      };
      const roleScore = roleMap[role] ?? 10;
      const playtimeScore = playtime === 'Cao' ? 8 : playtime === 'Trung bình' ? 4 : 1;
      const prestigeScore = (clubPrestige - 72) * 0.75;
      const leagueBonus = leagueName === 'Premier League' ? 5 : ['La Liga', 'Ligue 1', 'Bundesliga', 'Serie A'].includes(leagueName) ? 4 : 1;
      const coachScore = (coachAbility - 75) * 0.35;
      const bonusScore = Math.min(8, (bonusM || 0) * 1.8);
      // Cầu thủ trẻ ưu tiên cơ hội ra sân, ngôi sao ưu tiên danh hiệu + lương
      const ambitionMod = player.age <= 22 ? playtimeScore * 0.4 : (clubPrestige >= 87 ? 3 : 0);
      return wageScore + roleScore + playtimeScore + prestigeScore + leagueBonus + coachScore + bonusScore + ambitionMod;
    };

    const psgScore = scoreOffer({
      clubPrestige: psgPrestige,
      wage: psgOffer.weeklyWage,
      askWage: psgOffer.askWage || player.wage || 80,
      role: psgOffer.squadRole,
      playtime: psgOffer.playtimeGuarantee,
      bonusM: psgOffer.signingBonus || 0,
      coachAbility: psgCoachAbility,
      leagueName: 'Ligue 1',
      isPsg: true
    });

    if (!rivalComp || !rivalComp.rivalClub) {
      return { winner: 'PSG', psgScore, rivalScore: 0 };
    }

    const rc = typeof rivalComp.rivalClub === 'string'
      ? (this.state?.clubs || []).find((c) => c.name === rivalComp.rivalClub)
      : rivalComp.rivalClub;
    if (!rc) return { winner: 'PSG', psgScore, rivalScore: 0 };
    const rivalScore = scoreOffer({
      clubPrestige: rc.finance?.prestige || rc.rating || 85,
      wage: rivalComp.rivalWage,
      askWage: psgOffer.askWage || player.wage || 80,
      role: rivalComp.rivalRole,
      playtime: 'Cao',
      bonusM: 1.0,
      coachAbility: rc.coachProfile?.ability || 84,
      leagueName: rc.league,
      isPsg: false
    });

    if (rivalScore > psgScore + 6.5) {
      return {
        winner: rc.name,
        psgScore: r1(psgScore),
        rivalScore: r1(rivalScore),
        reason: `${player.name} chọn gia nhập ${rc.name} (€${rivalComp.rivalWage}k/tuần · ${rc.league} · Điểm thu hút ${r1(rivalScore)} vs PSG ${r1(psgScore)})`
      };
    }
    return { winner: 'PSG', psgScore: r1(psgScore), rivalScore: r1(rivalScore) };
  }

  // Hoàn tất thương vụ cho CLB đối thủ khi thắng cuộc đua đấu giá trước PSG
  completeRivalTransferHijack(player, rivalClubOrName, feeM, wageK) {
    const rivalClub = typeof rivalClubOrName === 'string'
      ? (this.state?.clubs || []).find((c) => c.name === rivalClubOrName)
      : rivalClubOrName;
    if (!player || !rivalClub) return null;
    const oldClubName = player.club;
    const seller = (this.state?.clubs || []).find((c) => c.name === oldClubName);
    const dateStr = this._dateStr();

    const upfront = r1(feeM * 0.55);
    const remainder = r1(feeM - upfront);

    if (!this.canClubAfford(rivalClub, upfront, wageK, feeM)) return null;

    this.recordAiClubTx(rivalClub, {
      txKey: `hijack_buy_${player.id}_${this.state.seasonNum}_${this.state.week}`,
      cashDelta: -upfront,
      transferBudgetDelta: -upfront,
      expKey: 'transfers',
      expAmt: feeM
    });
    if (remainder > 0) {
      rivalClub.finance.payables.push({
        id: `pay_${Date.now()}_${player.id}`,
        counterparty: oldClubName,
        desc: `Trả góp mua ${player.name}`,
        remaining: remainder,
        perInstallment: r1(remainder / 2),
        installmentsLeft: 2,
        dueIntervalWeeks: 4,
        nextDueWeek: (this.state?.week || 1) + 4
      });
    }

    if (seller && seller.name !== 'Paris Saint-Germain') {
      this.recordAiClubTx(seller, {
        txKey: `hijack_sell_${player.id}_${this.state.seasonNum}_${this.state.week}`,
        cashDelta: upfront,
        revKey: 'sales',
        revAmt: feeM
      });
      if (remainder > 0) {
        seller.finance.receivables.push({
          id: `rcv_${Date.now()}_${player.id}`,
          counterparty: rivalClub.name,
          desc: `Phải thu bán ${player.name}`,
          remaining: remainder,
          perInstallment: r1(remainder / 2),
          installmentsLeft: 2,
          dueIntervalWeeks: 4,
          nextDueWeek: (this.state?.week || 1) + 4
        });
      }
    }

    player.club = rivalClub.name;
    player.wage = wageK;
    player.contractYears = 4;
    player.transferListed = false;
    player.loanInfo = null;
    if (player.contract) {
      player.contract.weeklyWage = wageK;
      player.contract.contractYears = 4;
      player.contract.renewalStatus = 'Ổn định';
    }
    player.career?.transferHistory?.unshift({
      date: dateStr,
      from: oldClubName,
      to: rivalClub.name,
      fee: `€${feeM}M`,
      type: 'Thắng đấu giá PSG'
    });

    this.recomputeClubStrength(oldClubName);
    this.recomputeClubStrength(rivalClub.name);
    this.state?.transferSystem?.verifySingleClubOwnership?.();

    const rec = {
      id: `ai_hijack_${Date.now()}_${player.id}`,
      date: dateStr,
      playerId: player.id,
      playerName: player.name,
      position: player.position,
      from: oldClubName,
      to: rivalClub.name,
      fee: feeM,
      type: 'Cạnh tranh thắng PSG'
    };
    this.state?.transferSystem?.completedDeals?.unshift(rec);
    this.state?.pushSocial?.('Fabrizio Romano', '@FabrizioRomano', `🚨 HIJACKED! ${rivalClub.name} vượt mặt PSG để ký hợp đồng với ${player.name} (€${feeM}M)!`, 'neutral');
    return rec;
  }

  // ==================== TICK HÀNG TUẦN TOÀN CẦU (AI CLUBS + LEAGUES + COACHES) ====================

  onWeeklyEcosystemTick(explicitPeriodId = null) {
    const sNum = this.state?.seasonNum || 1;
    const wk = this.state?.week || 1;
    const periodId = explicitPeriodId || `S${sNum}_W${wk}`;
    if (this.lastTickPeriodId === periodId) return { ran: false, duplicate: true, periodId };
    this.lastTickPeriodId = periodId;

    const aiClubs = (this.state?.clubs || []).filter((c) => c.name !== 'Paris Saint-Germain');

    // 1. Quyết toán trả góp receivables/payables & Thu chi tuần cho toàn bộ CLB AI
    for (let i = 0; i < aiClubs.length; i++) {
      const c = aiClubs[i];
      this.ensureClubProfile(c, i);
      this._processAiClubWeeklyCashflow(c, wk, sNum);
    }

    // 2. Mô phỏng 1 vòng đấu cho tất cả các giải vô địch quốc gia khác (Anh, TBN, Đức, Ý, BĐN, Hà Lan)
    this._simulateOtherLeaguesWeeklyRound(wk);

    // 3. Hành vi AI tự chủ của các CLB (mua, bán, cho mượn, mượn, gia hạn, thanh lý, tuyển trẻ, thay thế ngôi sao)
    const aiActions = this._runAutonomousClubDecisions(aiClubs, periodId);

    // 4. Đánh giá HLV toàn cầu & sa thải/bổ nhiệm nếu phong độ kém
    this._evaluateGlobalManagers(aiClubs, wk, sNum);

    // 5. Cập nhật sức mạnh CLB & tóm tắt PSG
    aiClubs.forEach((c) => this.recomputeClubStrength(c.name));
    this.syncPsgClubSummary();

    return { ran: true, periodId, aiActions };
  }

  _processAiClubWeeklyCashflow(club, week, seasonNum) {
    const fin = club.finance;
    if (!fin) return;

    // Thu/chi trả góp đến hạn
    const dueRec = [];
    fin.receivables = (fin.receivables || []).filter((r) => {
      if (r.remaining > 0 && week >= (r.nextDueWeek || 0)) {
        const amt = Math.min(r.remaining, r.perInstallment || r.remaining);
        dueRec.push({ ...r, amt });
        r.remaining = r1(r.remaining - amt);
        r.installmentsLeft = Math.max(0, (r.installmentsLeft || 1) - 1);
        r.nextDueWeek = week + (r.dueIntervalWeeks || 4);
        return r.remaining > 0.05;
      }
      return r.remaining > 0.05;
    });
    dueRec.forEach((r) => {
      this.recordAiClubTx(club, { txKey: `ai_rcv_${club.id}_${r.id}_w${week}_s${seasonNum}`, cashDelta: r.amt, transferBudgetDelta: r.amt * 0.5 });
    });

    const duePay = [];
    fin.payables = (fin.payables || []).filter((p) => {
      if (p.remaining > 0 && week >= (p.nextDueWeek || 0)) {
        const amt = Math.min(p.remaining, p.perInstallment || p.remaining);
        duePay.push({ ...p, amt });
        p.remaining = r1(p.remaining - amt);
        p.installmentsLeft = Math.max(0, (p.installmentsLeft || 1) - 1);
        p.nextDueWeek = week + (p.dueIntervalWeeks || 4);
        return p.remaining > 0.05;
      }
      return p.remaining > 0.05;
    });
    duePay.forEach((p) => {
      this.recordAiClubTx(club, { txKey: `ai_pay_${club.id}_${p.id}_w${week}_s${seasonNum}`, cashDelta: -p.amt, transferBudgetDelta: 0 });
    });

    // Dòng tiền tuần: lương, vận hành vs doanh thu TV/thương mại/vé
    const weeklyWageCost = r2(fin.weeklyWages || 1.2);
    const weeklyOps = r2((fin.expenses?.ops || 18) / 44);
    const weeklyRev = r2(((fin.revenue?.tv || 40) * 0.45 + (fin.revenue?.sponsors || 30) * 0.5 + (fin.revenue?.commercial || 15) * 0.5 + (fin.revenue?.tickets || 18) * 0.65) / 44);
    const netWeekly = r2(weeklyRev - weeklyWageCost - weeklyOps);
    this.recordAiClubTx(club, {
      txKey: `ai_wk_${club.id}_s${seasonNum}_w${week}`,
      cashDelta: netWeekly,
      transferBudgetDelta: netWeekly > 0 ? netWeekly * 0.35 : netWeekly * 0.25
    });
  }

  _runAutonomousClubDecisions(aiClubs, periodId) {
    const windowOpen = this.state?.transferSystem?.isWindowOpen?.() ?? true;
    const players = this.state?.players || [];
    const dateStr = this._dateStr();
    const actionsSummary = { buys: 0, loans: 0, renewals: 0, youth: 0, releases: 0 };

    // Cập nhật nhu cầu vị trí thực tế dựa trên độ tuổi & lỗ hổng đội hình
    const corePositions = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'ST', 'RW', 'LW'];
    aiClubs.forEach((c) => {
      const roster = players.filter((p) => p.club === c.name);
      const missing = corePositions.filter((pos) => !roster.some((p) => p.position === pos));
      const agingPos = roster.filter((p) => p.age >= 31 && p.ovr >= 78).map((p) => p.position);
      const combined = [...new Set([...missing.slice(0, 2), ...agingPos.slice(0, 2), ...(c.positionalNeeds || [])])];
      c.positionalNeeds = combined.slice(0, 4);

      // CLB gặp áp lực tài chính -> rao bán cầu thủ lương cao hoặc dư thừa
      if (c.finance?.austerityMode) {
        roster
          .filter((p) => !p.loanInfo && (p.wage >= 90 || p.age >= 29))
          .slice(0, 2)
          .forEach((p) => { p.transferListed = true; });
      }
    });

    // Gia hạn hợp đồng cho trụ cột sắp hết hạn (hành động năm tròn)
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p.club === 'Paris Saint-Germain' || p.loanInfo) continue;
      if ((p.contractYears ?? 2) <= 1 && p.ovr >= 80 && p.age <= 31 && Math.random() < 0.22) {
        const owner = aiClubs.find((c) => c.name === p.club);
        if (owner && !owner.finance?.austerityMode) {
          p.contractYears = 3;
          p.wage = Math.round((p.wage || 60) * 1.08);
          if (p.contract) {
            p.contract.contractYears = 3;
            p.contract.weeklyWage = p.wage;
            p.contract.renewalStatus = 'Ổn định';
          }
          actionsSummary.renewals++;
        }
      }
      // Thanh lý / giải phóng cầu thủ lớn tuổi sa sút hoặc đội đang thiếu tiền
      if (p.club !== 'Paris Saint-Germain' && !p.loanInfo && p.age >= 33 && (p.contractYears ?? 2) <= 1 && p.ovr <= 79 && Math.random() < 0.14) {
        const owner = aiClubs.find((c) => c.name === p.club);
        const rosterCnt = players.filter((x) => x.club === p.club).length;
        if (owner && rosterCnt > 2) {
          p.transferListed = true;
          actionsSummary.releases++;
        }
      }
    }

    // Phát triển & bổ sung cầu thủ trẻ ở các CLB đào tạo (developer/contender)
    if ((this.state?.week || 1) % 3 === 0) {
      const devClubs = aiClubs.filter((c) => c.tier === 'developer' || (c.coachProfile?.youthTrust || 75) >= 84);
      const picked = devClubs[Math.floor(Math.random() * devClubs.length)];
      if (picked && players.length < 295) {
        const youthPool = players.filter((p) => p.club === picked.name && p.age <= 22 && p.ovr < p.pot);
        if (youthPool.length > 0) {
          const yp = youthPool[0];
          yp.ovr = Math.min(yp.pot, yp.ovr + 1);
          actionsSummary.youth++;
        }
      }
    }

    if (!windowOpen) return actionsSummary;

    // Cho mượn cầu thủ trẻ dư thừa từ Giant -> Developer
    if (Math.random() < 0.55) {
      const giantLoaners = aiClubs.filter((c) => c.tier === 'giant');
      const devBorrowers = aiClubs.filter((c) => c.tier === 'developer' && (c.finance?.cash || 0) >= 12);
      const loanTarget = players.find((p) =>
        p.club !== 'Paris Saint-Germain' &&
        !p.loanInfo &&
        p.age <= 22 &&
        p.ovr <= 80 &&
        giantLoaners.some((g) => g.name === p.club)
      );
      if (loanTarget && devBorrowers.length > 0) {
        const parentName = loanTarget.club;
        const parentClub = aiClubs.find((c) => c.name === parentName);
        const borrower = devBorrowers.find((b) => b.positionalNeeds?.includes(loanTarget.position)) || devBorrowers[0];
        if (borrower && parentClub) {
          const loanFee = r1(Math.max(1.0, (loanTarget.valuation?.current ?? loanTarget.value) * 0.1));
          if (this.canClubAfford(borrower, loanFee, (loanTarget.wage || 40) * 0.6)) {
            this.recordAiClubTx(borrower, { txKey: `ai_loan_in_${loanTarget.id}_${periodId}`, cashDelta: -loanFee, expKey: 'transfers', expAmt: loanFee });
            this.recordAiClubTx(parentClub, { txKey: `ai_loan_out_${loanTarget.id}_${periodId}`, cashDelta: loanFee, revKey: 'sales', revAmt: loanFee });
            loanTarget.club = borrower.name;
            loanTarget.loanInfo = {
              parentClub: parentName,
              loanClub: borrower.name,
              startSeason: this.state?.season,
              endSeason: this.state?.season,
              buyOptionFee: r1((loanTarget.valuation?.current ?? loanTarget.value) * 1.05),
              wageSplit: 60,
              loanApps: 0,
              loanGoals: 0,
              loanAvgRating: 7.0
            };
            loanTarget.career?.loanHistory?.unshift({ season: this.state?.season, from: parentName, to: borrower.name, buyOption: loanTarget.loanInfo.buyOptionFee });
            this.state?.transferSystem?.completedDeals?.unshift({
              id: `ai_loan_${Date.now()}_${loanTarget.id}`,
              date: dateStr,
              playerId: loanTarget.id,
              playerName: loanTarget.name,
              position: loanTarget.position,
              from: parentName,
              to: borrower.name,
              fee: loanFee,
              type: 'AI Cho mượn'
            });
            actionsSummary.loans++;
          }
        }
      }
    }

    // Mua bán giữa các CLB AI theo ngân sách thật + nhu cầu vị trí + thay thế ngôi sao
    const activeBuyers = aiClubs.filter((c) => !c.finance?.austerityMode && (c.finance?.transferBudget || 0) >= 14);
    for (let k = 0; k < 2; k++) {
      if (activeBuyers.length === 0) break;
      const buyer = activeBuyers[Math.floor(Math.random() * activeBuyers.length)];
      const maxFee = r1(Math.min(buyer.finance.transferBudget * 0.72, buyer.finance.cash * 0.65));
      if (maxFee < 8) continue;

      const candidates = players.filter((p) =>
        p.club !== 'Paris Saint-Germain' &&
        p.club !== buyer.name &&
        !p.loanInfo &&
        (p.valuation?.current ?? p.value) <= maxFee &&
        p.ovr >= buyer.rating - 9 &&
        p.ovr <= buyer.rating + 5 &&
        (buyer.positionalNeeds?.includes(p.position) || p.transferListed || p.age <= 23)
      );
      if (candidates.length === 0) continue;

      candidates.sort((a, b) => ((buyer.positionalNeeds?.includes(b.position) ? 10 : 0) + b.ovr) - ((buyer.positionalNeeds?.includes(a.position) ? 10 : 0) + a.ovr));
      const target = candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];
      const seller = aiClubs.find((c) => c.name === target.club);
      const askPrice = target.valuation?.askingPrice ?? Math.round((target.valuation?.current ?? target.value) * 1.1);
      const actualFee = r1(clamp(askPrice * (target.transferListed ? 0.88 : 0.96), 2, maxFee));

      if (!this.canClubAfford(buyer, actualFee, target.wage || 60, actualFee)) continue;

      const upfront = actualFee >= 25 ? r1(actualFee * 0.6) : actualFee;
      const rem = r1(actualFee - upfront);

      this.recordAiClubTx(buyer, {
        txKey: `ai_tr_buy_${target.id}_${periodId}`,
        cashDelta: -upfront,
        transferBudgetDelta: -upfront,
        expKey: 'transfers',
        expAmt: actualFee
      });
      if (rem > 0) {
        buyer.finance.payables.push({
          id: `pay_ai_${Date.now()}_${target.id}`,
          counterparty: target.club,
          desc: `Trả góp mua ${target.name}`,
          remaining: rem,
          perInstallment: r1(rem / 2),
          installmentsLeft: 2,
          dueIntervalWeeks: 4,
          nextDueWeek: (this.state?.week || 1) + 4
        });
      }

      if (seller) {
        this.recordAiClubTx(seller, {
          txKey: `ai_tr_sell_${target.id}_${periodId}`,
          cashDelta: upfront,
          revKey: 'sales',
          revAmt: actualFee
        });
        if (rem > 0) {
          seller.finance.receivables.push({
            id: `rcv_ai_${Date.now()}_${target.id}`,
            counterparty: buyer.name,
            desc: `Phải thu bán ${target.name}`,
            remaining: rem,
            perInstallment: r1(rem / 2),
            installmentsLeft: 2,
            dueIntervalWeeks: 4,
            nextDueWeek: (this.state?.week || 1) + 4
          });
        }
      }

      const oldClub = target.club;
      target.club = buyer.name;
      target.transferListed = false;
      target.contractYears = 4;
      if (target.contract) {
        target.contract.contractYears = 4;
        target.contract.renewalStatus = 'Ổn định';
      }
      target.career?.transferHistory?.unshift({
        date: dateStr,
        from: oldClub,
        to: buyer.name,
        fee: `€${actualFee}M`,
        type: 'AI Chuyển nhượng'
      });

      const rec = {
        id: `ai_deal_${Date.now()}_${k}_${target.id}`,
        date: dateStr,
        playerId: target.id,
        playerName: target.name,
        position: target.position,
        from: oldClub,
        to: buyer.name,
        fee: actualFee,
        type: 'AI Chuyển nhượng'
      };
      this.state?.transferSystem?.completedDeals?.unshift(rec);
      actionsSummary.buys++;

      if (actualFee >= 35) {
        this.state?.pushSocial?.('Fabrizio Romano', '@FabrizioRomano', `Here we go! ${buyer.name} hoàn tất chiêu mộ ${target.name} từ ${oldClub} (€${actualFee}M)!`, 'neutral');
      }
    }

    this.state?.transferSystem?.verifySingleClubOwnership?.();
    return actionsSummary;
  }

  // ==================== MÔ PHỎNG CÁC GIẢI ĐẤU CHÂU ÂU KHÁC ====================

  _simulateOtherLeaguesWeeklyRound(week) {
    const clubs = this.state?.clubs || [];
    for (let l = 0; l < SIMULATED_LEAGUES.length; l++) {
      const league = SIMULATED_LEAGUES[l];
      const teams = clubs.filter((c) => c.league === league);
      if (teams.length < 4) continue;
      // Mỗi giải chạy tối đa ~34 trận / mùa hoặc số vòng cân đối
      const maxMatches = (teams.length - 1) * 4;
      if (teams[0].played >= Math.min(38, maxMatches)) continue;

      const offset = (week + l) % teams.length;
      const rotated = [...teams.slice(offset), ...teams.slice(0, offset)];
      for (let i = 0; i + 1 < rotated.length; i += 2) {
        const home = rotated[i];
        const away = rotated[i + 1];
        const pHome = this.getEffectiveClubPower(home, { home: home.name, away: away.name, importance: 1.0 });
        const pAway = this.getEffectiveClubPower(away, { home: home.name, away: away.name, importance: 1.0 });
        const diff = (pHome - pAway) + (Math.random() - 0.5) * 9.5;

        let hg = 1;
        let ag = 1;
        if (diff > 10) { hg = 2 + (Math.random() < 0.45 ? 1 : 0); ag = Math.random() < 0.45 ? 1 : 0; }
        else if (diff > 3) { hg = 1 + (Math.random() < 0.65 ? 1 : 0); ag = Math.random() < 0.55 ? 1 : 0; }
        else if (diff < -10) { ag = 2 + (Math.random() < 0.45 ? 1 : 0); hg = Math.random() < 0.45 ? 1 : 0; }
        else if (diff < -3) { ag = 1 + (Math.random() < 0.65 ? 1 : 0); hg = Math.random() < 0.55 ? 1 : 0; }
        else { hg = Math.floor(Math.random() * 3); ag = Math.random() < 0.5 ? hg : Math.floor(Math.random() * 3); }

        home.played++; away.played++;
        home.gf += hg; home.ga += ag;
        away.gf += ag; away.ga += hg;
        if (hg > ag) { home.won++; home.pts += 3; away.lost++; }
        else if (ag > hg) { away.won++; away.pts += 3; home.lost++; }
        else { home.drawn++; away.drawn++; home.pts += 1; away.pts += 1; }

        // Thu nhập bán vé sân nhà giải VĐQG
        this.recordAiClubTx(home, {
          txKey: `lg_gate_${home.id}_w${week}_s${this.state?.seasonNum || 1}`,
          cashDelta: home.tier === 'giant' ? 1.8 : home.tier === 'contender' ? 0.95 : 0.45,
          revKey: 'tickets',
          revAmt: home.tier === 'giant' ? 1.8 : home.tier === 'contender' ? 0.95 : 0.45
        });
      }
    }
  }

  _evaluateGlobalManagers(aiClubs, week, seasonNum, forceCheck = false) {
    if (!forceCheck && week < 7) return;
    const dateStr = this._dateStr();
    aiClubs.forEach((club) => {
      if ((club.played || 0) < 7) return;
      const ppg = (club.pts || 0) / club.played;
      const threshold = club.tier === 'giant' ? 1.65 : club.tier === 'contender' ? 1.25 : 0.85;
      if (ppg >= threshold && (club.boardConfidence ?? 65) >= 25) return;

      const lastSackWeek = club._lastSackWeek || 0;
      if (!forceCheck && week - lastSackWeek < 10) return;
      if ((club.boardConfidence ?? 65) >= 25 && Math.random() > 0.22) return;

      const oldMgr = club.manager;
      const candidates = AI_MANAGER_POOL.filter((m) => m.name !== oldMgr);
      const next = candidates[Math.floor(Math.random() * candidates.length)];
      if (!next) return;

      const tp = TACTICAL_PROFILES[next.styleIdx % TACTICAL_PROFILES.length];
      const severance = r1(clamp((club.coachProfile?.wage || 90) * 0.025, 1.0, 5.5));
      club._lastSackWeek = week;
      club.manager = next.name;
      club.coachProfile = {
        name: next.name,
        ability: next.ability,
        tacticalStyle: tp.style,
        preferredFormation: tp.formation,
        attack: tp.atk,
        defense: tp.def,
        pressing: tp.press,
        possession: tp.poss,
        counter: tp.cnt,
        youthTrust: tp.youth,
        rotation: tp.rot,
        contractYears: 3,
        wage: Math.round(next.ability * 1.4),
        patience: 80
      };
      this.recordAiClubTx(club, {
        txKey: `sack_${club.id}_s${seasonNum}_w${week}`,
        cashDelta: -severance,
        expKey: 'ops',
        expAmt: severance
      });

      const logItem = {
        season: this.state?.season,
        week,
        date: dateStr,
        club: club.name,
        league: club.league,
        oldCoach: oldMgr,
        newCoach: next.name,
        tacticalStyle: tp.style,
        severance
      };
      this.coachChangeLogs.unshift(logItem);
      if (this.coachChangeLogs.length > 30) this.coachChangeLogs.length = 30;

      this.state?.transferSystem?.rumors?.unshift({
        id: `mgr_${Date.now()}_${club.id}`,
        date: dateStr,
        title: `${club.name} sa thải ${oldMgr}, bổ nhiệm HLV ${next.name}`,
        detail: `Phong độ kém (${club.pts}đ/${club.played} trận) khiến ${club.name} thay tướng với chiến thuật ${tp.style}.`,
        reliability: 'Chính thức'
      });
    });
  }

  // Mô phỏng nhà vô địch UEFA Champions League thực tế khi PSG bị loại hoặc không vô địch
  resolveUclChampionIfPsgEliminated() {
    const contenders = (this.state?.clubs || [])
      .filter((c) => c.name !== 'Paris Saint-Germain' && (c.tier === 'giant' || c.rating >= 83))
      .slice(0, 12);
    if (contenders.length === 0) return 'Bayern Munich';

    const weights = contenders.map((c) => Math.pow(Math.max(1, this.getEffectiveClubPower(c) - 64), 2.3));
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < contenders.length; i++) {
      r -= weights[i];
      if (r <= 0) return contenders[i].name;
    }
    return contenders[0].name;
  }

  // ==================== TỔNG KẾT MÙA GIẢI & CHUYỂN PHÂN KHÚC CLB ĐỘNG ====================

  onSeasonEnd(eosData = {}) {
    const clubs = this.state?.clubs || [];
    const sNum = this.state?.seasonNum || 1;
    const uclWinner = eosData.uclWinner || null;

    // 1. Chia tiền thưởng VĐQG cho tất cả các giải châu Âu & UCL winner
    const allLeagues = ['Ligue 1', ...SIMULATED_LEAGUES];
    allLeagues.forEach((league) => {
      const table = clubs
        .filter((c) => c.league === league)
        .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));

      table.forEach((club, idx) => {
        const rank = idx + 1;
        const basePrize = league === 'Premier League' ? 42 : 28;
        const prizeM = r1(Math.max(4, basePrize - idx * 1.8));
        if (club.name !== 'Paris Saint-Germain') {
          this.recordAiClubTx(club, {
            txKey: `eos_prize_${club.id}_s${sNum}`,
            cashDelta: prizeM,
            revKey: 'prize',
            revAmt: prizeM,
            transferBudgetDelta: prizeM * 0.55
          });
          // Thăng / Giáng phân khúc CLB động
          this._evaluateDynamicTierChange(club, rank, table.length, uclWinner === club.name);
        }
      });
    });

    if (uclWinner && uclWinner !== 'Paris Saint-Germain') {
      const uc = clubs.find((c) => c.name === uclWinner);
      if (uc) {
        this.recordAiClubTx(uc, {
          txKey: `ucl_champ_prize_${uc.id}_s${sNum}`,
          cashDelta: 45,
          revKey: 'prize',
          revAmt: 45,
          transferBudgetDelta: 28
        });
        uc.finance.prestige = Math.min(99, (uc.finance.prestige || 86) + 3);
      }
    }

    // 2. Đặt lại năm hợp đồng coach AI & mở đánh giá mua đứt cho cầu thủ cho mượn giữa các CLB AI
    (this.state?.players || []).forEach((p) => {
      if (p.loanInfo && p.loanInfo.parentClub !== 'Paris Saint-Germain' && p.loanInfo.loanClub !== 'Paris Saint-Germain') {
        const borrower = clubs.find((c) => c.name === p.loanInfo.loanClub);
        const parent = clubs.find((c) => c.name === p.loanInfo.parentClub);
        const optFee = p.loanInfo.buyOptionFee;
        if (borrower && optFee && p.ovr >= borrower.rating - 4 && this.canClubAfford(borrower, optFee, p.wage || 45)) {
          this.recordAiClubTx(borrower, { txKey: `ai_loan_opt_${p.id}_s${sNum}`, cashDelta: -optFee, expKey: 'transfers', expAmt: optFee });
          if (parent) this.recordAiClubTx(parent, { txKey: `ai_loan_opt_sell_${p.id}_s${sNum}`, cashDelta: optFee, revKey: 'sales', revAmt: optFee });
          p.club = borrower.name;
          p.loanInfo = null;
        } else {
          p.club = p.loanInfo.parentClub;
          p.loanInfo = null;
        }
      }
    });

    this.syncPsgClubSummary();
  }

  _evaluateDynamicTierChange(club, rank, leagueSize, wonUcl) {
    if (!club || club.name === 'Paris Saint-Germain') return;
    const prevTier = club.tier || 'contender';
    const fin = club.finance || {};
    let nextTier = prevTier;

    if (prevTier === 'contender' && (wonUcl || (rank <= 2 && club.rating >= 83 && (fin.cash || 0) >= 65))) {
      nextTier = 'giant';
    } else if (prevTier === 'developer' && (rank <= 3 && club.rating >= 79 && (fin.cash || 0) >= 35)) {
      nextTier = 'contender';
    } else if (prevTier === 'giant' && rank >= Math.ceil(leagueSize * 0.55) && ((fin.debt || 0) > 85 || club.rating < 82)) {
      nextTier = 'contender';
    } else if (prevTier === 'contender' && rank >= Math.max(4, leagueSize - 2) && (fin.austerityMode || club.rating < 78)) {
      nextTier = 'developer';
    }

    if (nextTier !== prevTier) {
      club.tier = nextTier;
      this.tierChangeLogs.unshift({
        season: this.state?.season,
        club: club.name,
        from: prevTier,
        to: nextTier,
        reason: nextTier === 'giant' ? 'Thăng tiến thành Ông lớn Châu Âu' : nextTier === 'contender' && prevTier === 'developer' ? 'Vươn tầm CLB Cạnh tranh' : 'Suy giảm phân khúc do thành tích & tài chính'
      });
    }
  }

  getLeagueTable(leagueName = 'Ligue 1') {
    return (this.state?.clubs || [])
      .filter((c) => c.league === leagueName)
      .sort((a, b) => (b.pts - a.pts) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf));
  }

  getRivalFinanceOverview(limit = 20) {
    return (this.state?.clubs || [])
      .map((c) => {
        this.ensureClubProfile(c);
        return {
          id: c.id,
          name: c.name,
          league: c.league,
          tier: c.tier,
          rating: c.rating,
          manager: c.manager,
          tacticalStyle: c.coachProfile?.tacticalStyle || '4-3-3',
          cash: c.finance?.cash ?? c.budget,
          transferBudget: c.finance?.transferBudget ?? c.budget,
          weeklyWages: c.finance?.weeklyWages ?? c.wageBudget ?? 2.0,
          profitLoss: c.finance?.profitLoss ?? 0,
          debt: c.finance?.debt ?? 0,
          ffpStatus: c.finance?.ffpStatus || 'An toàn FFP',
          austerityMode: !!c.finance?.austerityMode,
          positionalNeeds: c.positionalNeeds || []
        };
      })
      .sort((a, b) => (b.cash + b.transferBudget) - (a.cash + a.transferBudget))
      .slice(0, limit);
  }

  exportState() {
    return {
      lastTickPeriodId: this.lastTickPeriodId,
      tierChangeLogs: this.tierChangeLogs,
      coachChangeLogs: this.coachChangeLogs
    };
  }

  importState(snap) {
    if (snap) {
      this.lastTickPeriodId = snap.lastTickPeriodId || null;
      this.tierChangeLogs = Array.isArray(snap.tierChangeLogs) ? snap.tierChangeLogs : [];
      this.coachChangeLogs = Array.isArray(snap.coachChangeLogs) ? snap.coachChangeLogs : [];
    }
    this._ensureAllClubsInitialized();
  }
}
