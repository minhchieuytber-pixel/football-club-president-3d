// src/valuation/DynamicMarketValueSystem.js
// Hệ thống Định Giá Cầu Thủ Toàn Cầu Theo Tuần (Dynamic Player Market Value)
// - Chỉ tính toán lại 1 lần duy nhất mỗi tuần mới khi Chủ tịch bấm NEXT (advanceWeek), chống lặp lại theo periodId.
// - Tách biệt rõ 4 khái niệm giá: Market Value (giá thị trường ước tính), Asking Price (giá CLB đòi), Offer Price & Actual Transfer Fee.
// - Bao phủ toàn bộ cầu thủ thế giới + Học viện, tính lịch sử biểu đồ (4W/12W/24W/52W/Career), peak/lowest, delta, CLB quan tâm.

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function roundMoney(v) {
  return Math.max(0.5, +Number(v || 0).toFixed(1));
}

export class DynamicMarketValueSystem {
  constructor(state) {
    this.state = state;
    this.reset();
  }

  reset() {
    this.lastValuationPeriodId = null;
    this.latestWeeklyReport = null;
    this.hasUnreadReport = false;
    this.weeklySnapshots = []; // Lịch sử tổng hợp toàn thị trường theo tuần
    this._ensureAllPlayersInitialized();
  }

  getCurrentPeriodId() {
    const sNum = this.state?.seasonNum || 1;
    const wk = this.state?.week || 1;
    return `S${sNum}_W${wk}`;
  }

  _dateStr() {
    return this.state?.timeSystem?.getDateString?.() || `Tuần ${this.state?.week || 1}`;
  }

  _getAllTrackedPlayers() {
    if (this.state?.getAllPlayers) return this.state.getAllPlayers();
    const map = new Map();
    (this.state?.players || []).forEach((p) => map.set(p.id, p));
    (this.state?.academy || []).forEach((y) => { if (!map.has(y.id)) map.set(y.id, y); });
    return Array.from(map.values());
  }

  _ensureAllPlayersInitialized() {
    const all = this._getAllTrackedPlayers();
    all.forEach((p) => this.ensurePlayerValuation(p));
  }

  _computePotentialValue(p) {
    const pot = Math.max(p.ovr || 70, p.pot || 75);
    const posMult = ['ST', 'LW', 'RW', 'AM'].includes(p.position) ? 1.12
      : ['CM', 'DM'].includes(p.position) ? 1.05
      : ['CB', 'LB', 'RB'].includes(p.position) ? 0.96 : 0.85;
    // Cầu thủ tiềm năng cao ở đỉnh cao sự nghiệp
    const ovrAbove = Math.max(1, pot - 64);
    const raw = Math.pow(ovrAbove / 6.2, 2.25) * 4.1 * posMult;
    return roundMoney(clamp(raw, 1.0, 220));
  }

  computeInterestedClubs(p) {
    const clubs = this.state?.clubs || [];
    const val = p.valuation?.current ?? p.value ?? 10;
    const matches = [];
    for (let i = 0; i < clubs.length; i++) {
      const c = clubs[i];
      if (!c || c.name === p.club) continue;
      const fin = c.finance;
      const budget = fin ? Math.max(fin.transferBudget || 0, c.budget || 0) : (c.budget || 0);
      if (budget < val * 0.72) continue;
      const needsPos = Array.isArray(c.positionalNeeds) && c.positionalNeeds.includes(p.position);
      const ovrFit = p.ovr >= (c.rating || 78) - 4 && p.ovr <= (c.rating || 78) + 8;
      const youthGem = p.age <= 22 && (p.pot || 80) >= 85 && (c.tier === 'giant' || c.tier === 'contender' || c.rating >= 80);
      if ((needsPos && ovrFit) || youthGem) {
        matches.push({ club: c.name, score: (needsPos ? 20 : 8) + budget * 0.08 + (c.rating || 78) * 0.4 });
      }
    }
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, 5).map((m) => m.club);
  }

  // Tính Giá Đòi Hỏi (Asking Price) tách biệt rõ với Giá Thị Trường (Market Value)
  computeAskingPrice(p, sellerClub = null) {
    const mv = p.valuation?.current ?? p.value ?? 5;
    const club = sellerClub || (this.state?.clubs || []).find((c) => c.name === p.club);
    const fin = club?.finance;
    const contractYears = p.contract?.contractYears ?? p.contractYears ?? 2;
    const interestedCount = p.valuation?.interestedClubs?.length ?? 0;

    let mult = 1.15;
    // Hợp đồng còn dài -> CLB hét giá cao; sắp hết hạn -> giảm giá đòi hỏi
    if (contractYears >= 4) mult += 0.14;
    else if (contractYears === 3) mult += 0.06;
    else if (contractYears === 1) mult -= 0.22;
    else if (contractYears <= 0) mult -= 0.45;

    // Cầu thủ trẻ tiềm năng cao hoặc ngôi sao chủ lực
    if (p.age <= 22 && (p.pot || 80) >= 86) mult += 0.16;
    if (p.ovr >= 88) mult += 0.12;

    // Nếu bị rao bán hoặc CLB đang thiếu tiền mặt / áp lực FFP -> giảm giá để bán nhanh
    if (p.transferListed) mult -= 0.18;
    if (fin) {
      if ((fin.cash ?? 50) < 12 || (fin.debt ?? 0) > 75 || (fin.profitLoss ?? 0) < -30) {
        mult -= 0.14;
      } else if ((fin.cash ?? 50) > 150 && club?.tier === 'giant') {
        mult += 0.10;
      }
    }

    // Nhiều CLB quan tâm -> đẩy giá chào bán lên
    if (interestedCount >= 3) mult += 0.10;
    else if (interestedCount >= 1) mult += 0.04;

    // Phong độ cao / chấn thương
    if ((p.form || 75) >= 85) mult += 0.06;
    if ((p.injuryDays || 0) >= 14) mult -= 0.08;

    return roundMoney(clamp(mv * clamp(mult, 0.55, 1.85), 0.5, 290));
  }

  ensurePlayerValuation(p) {
    if (!p) return null;
    const baseVal = roundMoney(p.value || 5);
    const periodId = this.getCurrentPeriodId();
    const dateStr = this._dateStr();

    if (!p.valuation || typeof p.valuation !== 'object') {
      const potVal = this._computePotentialValue(p);
      p.valuation = {
        current: baseVal,
        prevWeek: baseVal,
        seasonStart: baseVal,
        potentialValue: potVal,
        peak: baseVal,
        lowest: baseVal,
        delta: 0,
        deltaPct: 0,
        trend: 'stable',
        askingPrice: roundMoney(baseVal * (p.contractYears <= 1 ? 0.88 : 1.15)),
        interestedClubs: [],
        lastPeriodId: periodId,
        lastReason: 'Định giá khởi đầu mùa giải',
        history: [
          {
            week: this.state?.week || 1,
            season: this.state?.season || '2026/27',
            periodId,
            date: dateStr,
            value: baseVal,
            delta: 0,
            ovr: p.ovr,
            form: p.form || 75,
            reason: 'Định giá khởi đầu'
          }
        ]
      };
    } else {
      // Đồng bộ hai chiều an toàn nếu save cũ hoặc có giá mới
      p.valuation.current = roundMoney(p.valuation.current ?? baseVal);
      p.valuation.prevWeek = roundMoney(p.valuation.prevWeek ?? p.valuation.current);
      p.valuation.seasonStart = roundMoney(p.valuation.seasonStart ?? p.valuation.current);
      p.valuation.peak = roundMoney(Math.max(p.valuation.peak ?? p.valuation.current, p.valuation.current));
      p.valuation.lowest = roundMoney(Math.min(p.valuation.lowest ?? p.valuation.current, p.valuation.current));
      p.valuation.potentialValue = p.valuation.potentialValue || this._computePotentialValue(p);
      if (!Array.isArray(p.valuation.history) || p.valuation.history.length === 0) {
        p.valuation.history = [{
          week: this.state?.week || 1,
          season: this.state?.season || '2026/27',
          periodId,
          date: dateStr,
          value: p.valuation.current,
          delta: 0,
          ovr: p.ovr,
          form: p.form || 75,
          reason: 'Khôi phục lịch sử định giá'
        }];
      }
    }

    p.value = p.valuation.current;
    if (p.contract) {
      p.contract.marketValue = p.valuation.current;
      p.contract.expectedTransferFee = p.valuation.askingPrice;
    }
    return p.valuation;
  }

  // Tính giá trị mục tiêu (Fundamental Target Value) đa nhân tố có kiểm soát độ mượt
  _computeTargetMarketValue(p) {
    const ovr = clamp(p.ovr || 72, 50, 99);
    const pot = clamp(Math.max(ovr, p.pot || ovr), 55, 99);
    const age = clamp(p.age || 24, 15, 42);
    const form = clamp(p.form ?? 75, 40, 99);
    const contractYears = p.contract?.contractYears ?? p.contractYears ?? 2;
    const injDays = p.injuryDays || 0;
    const fitness = p.health?.fitness ?? 88;
    const squadLevel = p.squadLevel || 'Đội một';

    // 1. Nền tảng năng lực chuyên môn (OVR) + vị trí
    const posMult = ['ST', 'LW', 'RW', 'AM'].includes(p.position) ? 1.11
      : ['CM', 'DM'].includes(p.position) ? 1.04
      : ['CB', 'LB', 'RB'].includes(p.position) ? 0.96 : 0.84;

    const baseCore = Math.pow(Math.max(1, ovr - 61) / 6.3, 2.24) * 3.85 * posMult;

    // 2. Đường cong tuổi tác & tiềm năng (POT)
    let ageMult = 1.0;
    if (age <= 19) ageMult = 1.18;
    else if (age <= 22) ageMult = 1.24;
    else if (age <= 26) ageMult = 1.16;
    else if (age <= 28) ageMult = 1.04;
    else if (age === 29) ageMult = 0.92;
    else if (age === 30) ageMult = 0.80;
    else if (age === 31) ageMult = 0.67;
    else if (age === 32) ageMult = 0.54;
    else if (age === 33) ageMult = 0.42;
    else ageMult = Math.max(0.22, 0.36 - (age - 33) * 0.045);

    const potGap = Math.max(0, pot - ovr);
    const youthUpside = age <= 24 ? potGap * (age <= 20 ? 1.35 : 0.95) : potGap * 0.25;

    // 3. Phong độ gần đây & đóng góp thực tế (bàn thắng, kiến tạo, điểm 5 trận)
    const recent5 = p.career?.recentForm5 || [];
    const avgRecent = recent5.length > 0
      ? recent5.reduce((s, r) => s + r, 0) / recent5.length
      : (p.career?.seasonStats?.avgRating || 7.0);
    const formBoost = ((form - 74) * 0.008) + ((avgRecent - 7.0) * 0.09);
    const goalContrib = Math.min(0.24, ((p.goals || 0) * 0.012 + (p.assists || 0) * 0.009));
    const perfMult = clamp(1 + formBoost + goalContrib, 0.78, 1.36);

    // 4. Hợp đồng & Vị thế giải đấu / CLB
    const clubObj = (this.state?.clubs || []).find((c) => c.name === p.club);
    const clubPrestigeMult = clubObj
      ? clamp(0.86 + ((clubObj.rating || 78) - 75) * 0.012, 0.82, 1.14)
      : 0.95;

    let contractMult = 1.0;
    if (contractYears >= 4) contractMult = 1.05;
    else if (contractYears === 1) contractMult = 0.88;
    else if (contractYears <= 0) contractMult = 0.72;

    // 5. Chấn thương & thể trạng
    let healthMult = 1.0;
    if (injDays >= 28) healthMult = 0.86;
    else if (injDays >= 14) healthMult = 0.91;
    else if (injDays > 0) healthMult = 0.96;
    else if (fitness < 65) healthMult = 0.96;

    // 6. Nhu cầu thị trường / số CLB quan tâm + học viện
    const interestCnt = p.valuation?.interestedClubs?.length || 0;
    const marketDemandMult = 1 + Math.min(0.12, interestCnt * 0.025);
    const academyDiscount = (squadLevel !== 'Đội một' && !p.promoted && p.club === 'Paris Saint-Germain') ? 0.76 : 1.0;

    const rawTarget = (baseCore * ageMult + youthUpside) * perfMult * clubPrestigeMult * contractMult * healthMult * marketDemandMult * academyDiscount;
    return roundMoney(clamp(rawTarget, 0.5, 235));
  }

  // CHỈ chạy đúng 1 lần mỗi tuần mới khi bấm NEXT!
  runWeeklyValuation(explicitPeriodId = null) {
    const periodId = explicitPeriodId || this.getCurrentPeriodId();
    if (this.lastValuationPeriodId === periodId) {
      return { ran: false, duplicate: true, periodId };
    }
    this.lastValuationPeriodId = periodId;

    const week = this.state?.week || 1;
    const season = this.state?.season || '2026/27';
    const dateStr = this._dateStr();
    const clubsMap = new Map((this.state?.clubs || []).map((c) => [c.name, c]));

    const all = this._getAllTrackedPlayers();
    const changes = [];

    for (let i = 0; i < all.length; i++) {
      const p = all[i];
      const val = this.ensurePlayerValuation(p);
      const prev = val.current;

      // Làm mới danh sách CLB quan tâm (giới hạn nhanh theo nhu cầu)
      val.interestedClubs = this.computeInterestedClubs(p);
      val.potentialValue = this._computePotentialValue(p);

      const target = this._computeTargetMarketValue(p);
      // Dịch chuyển mượt có biên độ giới hạn mỗi tuần (±7% hoặc khi chấn thương/bùng nổ)
      const diff = target - prev;
      const alpha = Math.abs(diff) > prev * 0.25 ? 0.18 : 0.14;
      let step = diff * alpha;

      // Nhiễu thị trường rất nhẹ theo độ ổn định (-0.4% đến +0.5%) tránh đứng im tuyệt đối nhưng không nhảy loạn
      const seedJitter = (((p.ovr + week * 7 + i * 3) % 11) - 5) * 0.0018;
      step += prev * seedJitter;

      const maxPct = (p.injuryDays || 0) >= 14 ? 0.08 : 0.065;
      const maxAbs = Math.max(0.4, prev * maxPct);
      step = clamp(step, -maxAbs, maxAbs);

      // Tác động trực tiếp theo trạng thái chấn thương đang kéo dài hoặc phong độ rực sáng
      if ((p.injuryDays || 0) >= 10 && step > -0.2) {
        step = -Math.max(0.2, +(prev * 0.025).toFixed(2));
      } else if ((p.form || 75) >= 88 && (p.goals || 0) + (p.assists || 0) >= 3 && (p.injuryDays || 0) === 0 && step < 0.2) {
        step = Math.max(0.2, +(prev * 0.025).toFixed(2));
      }

      const nextVal = roundMoney(clamp(prev + step, 0.5, 240));
      const delta = +(nextVal - prev).toFixed(2);
      const deltaPct = prev > 0 ? +((delta / prev) * 100).toFixed(1) : 0;

      // Xác định lý do chính giải thích biến động
      let reason = 'Cân bằng theo thị trường tuần';
      if ((p.injuryDays || 0) > 0 && delta < 0) reason = `Chấn thương (${p.injuryDays} ngày) làm giảm đà định giá`;
      else if (p.age <= 22 && p.ovr < p.pot && delta > 0) reason = `Tài năng trẻ tiến bộ tốt (OVR ${p.ovr}/POT ${p.pot})`;
      else if ((p.form || 75) >= 84 && delta > 0) reason = `Phong độ ấn tượng (${p.form}/99 · ${p.goals || 0}B/${p.assists || 0}KT)`;
      else if (p.age >= 31 && delta < 0) reason = `Tuổi tác (${p.age}t) ảnh hưởng giá trị dài hạn`;
      else if ((p.contractYears ?? 2) <= 1 && delta < 0) reason = 'Thời hạn hợp đồng còn ngắn (≤ 1 năm)';
      else if (val.interestedClubs.length >= 2 && delta > 0) reason = `${val.interestedClubs.length} CLB lớn đang quan tâm săn đón`;

      val.prevWeek = prev;
      val.current = nextVal;
      val.delta = delta;
      val.deltaPct = deltaPct;
      val.trend = delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'stable';
      val.peak = roundMoney(Math.max(val.peak || nextVal, nextVal));
      val.lowest = roundMoney(Math.min(val.lowest || nextVal, nextVal));
      val.lastPeriodId = periodId;
      val.lastReason = reason;
      val.askingPrice = this.computeAskingPrice(p, clubsMap.get(p.club));

      val.history.push({
        week,
        season,
        periodId,
        date: dateStr,
        value: nextVal,
        delta,
        ovr: p.ovr,
        form: p.form || 75,
        reason
      });
      if (val.history.length > 130) val.history.shift();

      // Đồng bộ về Player object & Contract object
      p.value = nextVal;
      if (p.contract) {
        p.contract.marketValue = nextVal;
        p.contract.expectedTransferFee = val.askingPrice;
      }

      if (Math.abs(delta) >= 0.1) {
        changes.push({
          playerId: p.id,
          name: p.name,
          club: p.club,
          position: p.position,
          age: p.age,
          ovr: p.ovr,
          pot: p.pot,
          prev,
          current: nextVal,
          delta,
          deltaPct,
          reason
        });
      }
    }

    const risers = [...changes].filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta || b.deltaPct - a.deltaPct).slice(0, 8);
    const fallers = [...changes].filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta || a.deltaPct - b.deltaPct).slice(0, 8);
    const topValued = [...all]
      .sort((a, b) => (b.valuation?.current ?? b.value) - (a.valuation?.current ?? a.value))
      .slice(0, 8)
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        club: p.club,
        value: p.valuation?.current ?? p.value,
        delta: p.valuation?.delta ?? 0,
        deltaPct: p.valuation?.deltaPct ?? 0
      }));
    const psgSquadChanges = changes.filter((c) => c.club === 'Paris Saint-Germain').sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 6);

    const topRiserTxt = risers[0] ? `${risers[0].name} (+€${risers[0].delta}M)` : 'Thị trường ổn định';
    const topFallerTxt = fallers[0] ? `${fallers[0].name} (€${fallers[0].delta}M)` : 'Không có biến động lớn';

    this.latestWeeklyReport = {
      periodId,
      week,
      season,
      date: dateStr,
      totalEvaluated: all.length,
      risersCount: changes.filter((c) => c.delta > 0).length,
      fallersCount: changes.filter((c) => c.delta < 0).length,
      risers,
      fallers,
      topValued,
      psgSquadChanges,
      headline: `📈 WEEKLY PLAYER VALUATION · Tuần ${week} (${season})`,
      summaryText: `Đã cập nhật định giá ${all.length} cầu thủ toàn cầu. Tăng mạnh nhất: ${topRiserTxt} · Giảm mạnh nhất: ${topFallerTxt}.`
    };
    this.hasUnreadReport = true;
    this.weeklySnapshots.unshift({
      periodId,
      week,
      season,
      date: dateStr,
      risersCount: this.latestWeeklyReport.risersCount,
      fallersCount: this.latestWeeklyReport.fallersCount,
      topRiser: risers[0] || null,
      topFaller: fallers[0] || null
    });
    if (this.weeklySnapshots.length > 30) this.weeklySnapshots.length = 30;

    this.state?.eventBus?.emit?.('WEEKLY_VALUATION_UPDATED', this.latestWeeklyReport, `val_${periodId}`);
    return { ran: true, periodId, report: this.latestWeeklyReport };
  }

  onSeasonRollover() {
    const all = this._getAllTrackedPlayers();
    all.forEach((p) => {
      const val = this.ensurePlayerValuation(p);
      val.seasonStart = val.current;
    });
  }

  getPlayerChartSeries(playerId, range = '12w') {
    const p = this.state?.getPlayerById?.(playerId);
    if (!p) return { points: [], min: 0, max: 10, range };
    const val = this.ensurePlayerValuation(p);
    const hist = val.history || [];
    const limitMap = { '4w': 4, '12w': 12, '24w': 24, '52w': 52, 'career': hist.length };
    const limit = limitMap[range] ?? 12;
    const sliced = hist.slice(-Math.max(1, limit));
    const vals = sliced.map((x) => x.value);
    const min = Math.min(...vals, val.lowest ?? vals[0] ?? 0);
    const max = Math.max(...vals, val.peak ?? vals[0] ?? 10);
    return { points: sliced, min, max, range, valuation: val };
  }

  getMarketValueCenterData(category = 'top_valued', filters = {}, page = 1, pageSize = 20) {
    const clubsByName = new Map((this.state?.clubs || []).map((c) => [c.name, c]));
    let pool = [...(this.state?.players || [])];

    if (category === 'youth') {
      const ac = (this.state?.academy || []).filter((y) => !y.promoted);
      pool = [...pool, ...ac].filter((p) => p.age <= 22);
    } else if (category === 'psg_sellable') {
      pool = this.state?.getPsgSquad ? [...this.state.getPsgSquad()] : pool.filter((p) => p.club === 'Paris Saint-Germain');
    } else if (category === 'available') {
      pool = pool.filter((p) =>
        p.club !== 'Paris Saint-Germain' &&
        (p.transferListed || (p.contractYears ?? 2) <= 2 || p.loanListed || (p.valuation?.askingPrice ?? p.value) <= (p.valuation?.current ?? p.value) * 1.15)
      );
    } else if (category === 'most_wanted') {
      pool = pool.filter((p) => (p.valuation?.interestedClubs?.length || 0) > 0);
    }

    const q = String(filters.search || '').trim().toLowerCase();
    const clubQ = String(filters.club || '').trim().toLowerCase();
    const leagueQ = filters.league || 'ALL';
    const posQ = filters.pos || 'ALL';
    const maxAge = filters.maxAge ? Number(filters.maxAge) : 99;
    const maxVal = filters.maxVal ? Number(filters.maxVal) : 999;
    const minPot = filters.minPot ? Number(filters.minPot) : 0;
    const minChangePct = filters.minChangePct ? Number(filters.minChangePct) : -999;

    const filtered = pool.filter((p) => {
      const val = this.ensurePlayerValuation(p);
      const clubObj = clubsByName.get(p.club);
      const leagueName = clubObj?.league || 'Học viện';
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (clubQ && !String(p.club || '').toLowerCase().includes(clubQ)) return false;
      if (leagueQ !== 'ALL' && leagueName !== leagueQ) return false;
      if (posQ !== 'ALL' && p.position !== posQ) return false;
      if (p.age > maxAge) return false;
      if (val.current > maxVal) return false;
      if ((p.pot || p.ovr) < minPot) return false;
      if (val.deltaPct < minChangePct) return false;
      return true;
    });

    filtered.sort((a, b) => {
      const va = a.valuation || this.ensurePlayerValuation(a);
      const vb = b.valuation || this.ensurePlayerValuation(b);
      if (category === 'risers') return (vb.delta - va.delta) || (vb.deltaPct - va.deltaPct);
      if (category === 'fallers') return (va.delta - vb.delta) || (va.deltaPct - vb.deltaPct);
      if (category === 'youth') return ((b.pot || b.ovr) - (a.pot || a.ovr)) || (vb.current - va.current);
      if (category === 'most_wanted') return ((vb.interestedClubs?.length || 0) - (va.interestedClubs?.length || 0)) || (vb.current - va.current);
      if (category === 'psg_sellable') return (vb.askingPrice - va.askingPrice);
      return (vb.current - va.current) || (b.ovr - a.ovr);
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const curPage = clamp(Number(page) || 1, 1, totalPages);
    const items = filtered.slice((curPage - 1) * pageSize, curPage * pageSize);

    return { items, total, page: curPage, totalPages, pageSize };
  }

  exportState() {
    return {
      lastValuationPeriodId: this.lastValuationPeriodId,
      latestWeeklyReport: this.latestWeeklyReport,
      hasUnreadReport: this.hasUnreadReport,
      weeklySnapshots: this.weeklySnapshots
    };
  }

  importState(snap) {
    if (!snap) {
      this._ensureAllPlayersInitialized();
      return;
    }
    this.lastValuationPeriodId = snap.lastValuationPeriodId || null;
    this.latestWeeklyReport = snap.latestWeeklyReport || null;
    this.hasUnreadReport = !!snap.hasUnreadReport;
    this.weeklySnapshots = Array.isArray(snap.weeklySnapshots) ? snap.weeklySnapshots : [];
    // Khôi phục mà TUYỆT ĐỐI không chạy lại định giá mới khi Load
    this._ensureAllPlayersInitialized();
  }
}
