// src/matchday/MatchdaySystem.js
// HỆ THỐNG MATCHDAY DUY NHẤT XỬ LÝ TOÀN BỘ TRẬN ĐẤU TRONG GAME
// - Thay thế hoàn toàn mô phỏng cũ (MatchSimulationEngine / Match3DScene / simulateLigue1Round).
// - Tự động kích hoạt đúng ngày thi đấu từ GameTimeSystem.
// - Trước trận: Đội hình & chiến thuật do CoachMatchAI quyết định hoàn toàn (Chủ tịch chỉ xem).
// - Trong trận: Hỗ trợ theo dõi diễn biến trực tiếp, nhận/từ chối đề xuất thay người của HLV hoặc thay người hợp lệ (tối đa 5, không vào lại).
// - Mô phỏng trọn vẹn tất cả các trận khác cùng vòng đấu, cập nhật BXH (tie-breaker, ▲/▼, form 5 trận),
//   5 báo cáo Ban huấn luyện, tin tức sau trận không trùng lặp, và bảo toàn trạng thái Save/Load.

import { RivalrySystem } from '../matches/MatchSystems.js';
import { PressNewsSystem } from '../media/PressNewsSystem.js';
import { CoachMatchAI } from './CoachMatchAI.js';
import { MatchCalendarSystem } from './MatchCalendarSystem.js';
import { buildFiveStaffReports } from './MatchdayReportEngine.js';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function getClubRoster(state, clubName) {
  const real = (state.players || []).filter((p) => p.club === clubName && (p.injuryDays || 0) <= 0);
  if (real.length >= 11) {
    return real.slice(0, 18).map((p, idx) => ({
      id: p.id,
      name: p.name,
      position: p.position || (idx === 0 ? 'GK' : 'CM'),
      ovr: p.ovr || 77,
      age: p.age || 25,
      shirtNumber: p.shirtNumber || (idx + 1)
    }));
  }
  const club = (state.clubs || []).find((c) => c.name === clubName);
  const baseOvr = club?.rating || 78;
  const short = (clubName || 'CLB').split(/\s+/).filter((w) => w.length > 2)[0] || clubName.slice(0, 6);
  const roles = ['GK', 'LB', 'CB', 'CB', 'RB', 'DM', 'CM', 'CM', 'LW', 'ST', 'RW', 'CM', 'ST', 'CB', 'RW', 'GK'];
  const existingNames = new Set(real.map((r) => r.name));
  const out = real.map((p, idx) => ({
    id: p.id,
    name: p.name,
    position: p.position || roles[idx % roles.length],
    ovr: p.ovr || baseOvr,
    age: p.age || 25,
    shirtNumber: p.shirtNumber || (idx + 1)
  }));
  const firstNames = ['Lucas', 'Théo', 'Mathieu', 'Julien', 'Romain', 'Kévin', 'Antoine', 'Hugo', 'Benoît', 'Maxime', 'Enzo', 'Noah', 'Léo', 'Arthur', 'Gabriel', 'Sacha'];
  const lastNames = ['Moreau', 'Bernard', 'Girard', 'Mercier', 'Roux', 'Fournier', 'Chevalier', 'Gauthier', 'Perrin', 'Fontaine', 'Marchand', 'Lemaire', 'Dupont', 'Lambert', 'Robin', 'Masson'];
  let seed = clubName.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  while (out.length < 16) {
    const idx = out.length;
    const fn = firstNames[(seed + idx * 3) % firstNames.length];
    const ln = lastNames[(seed + idx * 5) % lastNames.length];
    const name = `${fn} ${ln}`;
    if (!existingNames.has(name)) {
      existingNames.add(name);
      out.push({
        id: `npc_pl_${short}_${idx}`,
        name,
        position: roles[idx % roles.length],
        ovr: clamp(baseOvr - 2 + (idx % 5), 68, 93),
        age: 20 + ((seed + idx) % 12),
        shirtNumber: idx + 1
      });
    } else {
      seed += 7;
    }
  }
  return out;
}

function buildOpponentPlan(state, club) {
  const roster = getClubRoster(state, club?.name || 'Đối thủ');
  const gk = roster.find((p) => p.position === 'GK') || roster[0];
  const outfield = roster.filter((p) => p.id !== gk.id);
  const starters = [gk, ...outfield.slice(0, 10)].map((p, idx) => ({
    slotIndex: idx,
    playerId: p.id,
    name: p.name,
    shirtNumber: p.shirtNumber || (idx + 1),
    position: p.position,
    assignedRole: idx === 0 ? 'GK' : p.position,
    ovr: p.ovr,
    age: p.age,
    liveStamina: 92,
    liveRating: 6.4,
    goals: 0,
    assists: 0,
    saves: 0,
    yellowCard: false,
    redCarded: false,
    injuredOut: false,
    minutesPlayed: 0,
    subbedInMinute: null,
    subbedOutMinute: null
  }));
  const bench = outfield.slice(10, 16).map((p) => ({
    playerId: p.id,
    name: p.name,
    shirtNumber: p.shirtNumber || 19,
    position: p.position,
    ovr: p.ovr,
    age: p.age
  }));
  return {
    formation: '4-3-3',
    coachName: club?.manager || 'HLV Đối thủ',
    starters,
    bench
  };
}

export class MatchdaySystem {
  constructor(state) {
    this.state = state;
    this.matchesById = {};
    this.processedMatchIds = new Set();
    this.publishedNewsMatchIds = new Set();
    this.roundFixturesByKey = {};
    this.clubForm5 = {};
    this.clubPrevRanks = {};
    this.activeMatchdayId = null;
    this.unreadMatchdayIds = [];
    this.liveSession = null;
    this._autoOpenListeners = [];
    this._lastAutoCheckedEpoch = 0;

    this.syncScheduleFromState();
  }

  onAutoTrigger(fn) {
    if (typeof fn === 'function') this._autoOpenListeners.push(fn);
  }

  _emitAutoTrigger(payload) {
    this._autoOpenListeners.forEach((fn) => {
      try { fn(payload); } catch (_) {}
    });
  }

  syncScheduleFromState() {
    const map = this.state?.fixtures?._roundFixturesMap;
    if (map && typeof map === 'object') {
      this.roundFixturesByKey = {};
      Object.entries(map).forEach(([rk, list]) => {
        this.roundFixturesByKey[rk] = list.map((f) => ({ ...f }));
      });
    } else if (Array.isArray(this.state?.fixtures)) {
      // Fallback: đảm bảo luôn có roundFixturesByKey ngay cả khi fixtures đến từ bản save cũ
      this.roundFixturesByKey = {};
      this.state.fixtures.forEach((fx) => {
        const rk = fx.roundKey || `${fx.comp}_${fx.round}_${fx.week}`;
        fx.roundKey = rk;
        if (!fx.matchId) fx.matchId = fx.id;
        if (!fx.kickoffEpoch && fx.date) fx.kickoffEpoch = MatchCalendarSystem.computeKickoffEpoch(fx.date, fx.time || '20:00');
        if (!this.roundFixturesByKey[rk]) this.roundFixturesByKey[rk] = [];
        this.roundFixturesByKey[rk].push(fx);
      });
    }
  }

  resetForNewSeason() {
    this.activeMatchdayId = null;
    this.unreadMatchdayIds = [];
    this.liveSession = null;
    this.clubForm5 = {};
    this.clubPrevRanks = {};
    this.syncScheduleFromState();
  }

  getUnreadMatchdayId() {
    return this.unreadMatchdayIds[0] || null;
  }

  markMatchdayRead(matchId) {
    if (!matchId) {
      this.unreadMatchdayIds = [];
      return;
    }
    this.unreadMatchdayIds = this.unreadMatchdayIds.filter((id) => id !== matchId);
  }

  getMatchRecord(matchId) {
    return this.matchesById[matchId] || null;
  }

  getFixturesForRound(roundKey) {
    const raw = this.roundFixturesByKey[roundKey] || [];
    return raw.map((fx) => {
      const mId = fx.matchId || fx.id;
      const done = this.matchesById[mId];
      if (done) {
        return {
          ...fx,
          played: true,
          status: 'Đã kết thúc',
          homeGoals: done.homeGoals,
          awayGoals: done.awayGoals,
          penalties: done.penalties || null
        };
      }
      return fx;
    });
  }

  // Bảng xếp hạng đầy đủ: điểm -> hiệu số -> bàn thắng -> đối đầu -> tên CLB, kèm ▲/▼ & form 5 trận
  getStandings(leagueName = 'Ligue 1') {
    const clubs = (this.state.clubs || []).filter((c) => c.league === leagueName);
    const h2h = this.state.headToHead || {};
    const sorted = [...clubs].sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      const gdA = a.gf - a.ga;
      const gdB = b.gf - b.ga;
      if (gdB !== gdA) return gdB - gdA;
      if (b.gf !== a.gf) return b.gf - a.gf;
      const rec = h2h[`${a.name}|${b.name}`];
      if (rec && rec.homeWins !== rec.awayWins) return rec.awayWins - rec.homeWins;
      return a.name.localeCompare(b.name);
    });

    return sorted.map((c, idx) => {
      const rank = idx + 1;
      const prev = this.clubPrevRanks[c.name] ?? rank;
      const rankDelta = prev - rank;
      return {
        rank,
        prevRank: prev,
        rankDelta,
        club: c,
        name: c.name,
        color: c.color,
        played: c.played,
        won: c.won,
        drawn: c.drawn,
        lost: c.lost,
        gf: c.gf,
        ga: c.ga,
        gd: c.gf - c.ga,
        pts: c.pts,
        form5: [...(this.clubForm5[c.name] || [])],
        isPsg: c.name === 'Paris Saint-Germain'
      };
    });
  }

  _snapshotLigue1Ranks() {
    const current = this.getStandings('Ligue 1');
    current.forEach((row) => {
      this.clubPrevRanks[row.name] = row.rank;
    });
  }

  // ==================== TỰ ĐỘNG KÍCH HOẠT THEO THỜI GIAN GAME ====================
  onTimeAdvanced(timeSystem, opts = {}) {
    if (!timeSystem || !Array.isArray(this.state.fixtures)) return null;
    const nowEpoch = timeSystem.epochSeconds;
    if (nowEpoch === this._lastAutoCheckedEpoch && !opts.force) return null;
    this._lastAutoCheckedEpoch = nowEpoch;

    // Nếu đang có trận live đang chạy chưa kết thúc, không tự mở trận mới đè lên
    if (this.liveSession && !this.liveSession.finished) return null;

    const dueFixtures = this.state.fixtures.filter((fx) => {
      if (fx.played || fx.skippedEliminated) return false;
      const mId = fx.matchId || fx.id;
      if (this.processedMatchIds.has(mId)) return false;
      const ko = fx.kickoffEpoch || MatchCalendarSystem.computeKickoffEpoch(fx.date, fx.time || '20:00');
      fx.kickoffEpoch = ko;
      return ko > 0 && nowEpoch >= ko;
    });

    if (dueFixtures.length === 0) return null;

    dueFixtures.sort((a, b) => (a.kickoffEpoch || 0) - (b.kickoffEpoch || 0));
    const bulkJump = !!opts.bulkJump || dueFixtures.length > 1 || (nowEpoch - (dueFixtures[0].kickoffEpoch || nowEpoch)) > 7200;

    if (bulkJump) {
      let lastRes = null;
      for (const fx of dueFixtures) {
        lastRes = this.simulateMatchComplete(fx, { reason: 'auto_date_elapsed' });
        if (lastRes) {
          const id = fx.matchId || fx.id;
          if (!this.unreadMatchdayIds.includes(id)) this.unreadMatchdayIds.unshift(id);
          this.activeMatchdayId = id;
        }
      }
      if (lastRes) {
        this._emitAutoTrigger({ mode: 'computed', matchId: this.activeMatchdayId, result: lastRes });
      }
      return lastRes;
    }

    // Đúng giờ thi đấu theo dòng thời gian thực -> tự động mở Matchday trực tiếp!
    const nextFx = dueFixtures[0];
    const session = this.startLiveMatchday(nextFx, { autoTriggered: true });
    if (session) {
      this._emitAutoTrigger({ mode: 'live', matchId: session.matchId, session });
    }
    return session;
  }

  // ==================== TÍNH TOÁN SỨC MẠNH & CHIẾN THUẬT ====================
  _computeTeamPower(sideIsPsg, club, starters, plan, fixture, state) {
    const oppHome = fixture.home === club?.name;
    const importance = fixture.importance || 1.0;

    if (sideIsPsg) {
      const active = starters.filter((s) => !s.redCarded);
      const countFactor = active.length / 11;
      const avgOvr = active.length ? active.reduce((s, p) => s + p.ovr, 0) / active.length : 83;
      const avgSuit = active.length ? active.reduce((s, p) => s + (p.suitabilityScore || 85), 0) / active.length : 85;
      const avgForm = active.length ? active.reduce((s, p) => s + (p.form || 76), 0) / active.length : 76;
      const avgFit = active.length ? active.reduce((s, p) => s + (p.liveStamina ?? p.fitness ?? 88), 0) / active.length : 86;
      const avgMorale = active.length ? active.reduce((s, p) => s + (p.morale || 80), 0) / active.length : 80;

      const coachSkill = (state.coach?.tactics || 88) * 0.55 + (state.coach?.experience || 86) * 0.45;
      // Ảnh hưởng đoàn kết & tâm lý phòng thay đồ từ ClubRelationshipSystem (đã sửa lỗi .profiles -> .playerRelations)
      const relSys = state.relationshipSystem;
      const profiles = Object.values(relSys?.playerRelations || {});
      const drState = relSys?.getDressingRoomState?.();
      const unityScore = profiles.length
        ? profiles.reduce((s, pr) => s + ((pr.metrics?.dressingRoomHarmony ?? pr.metrics?.teamIntegration ?? 78) * 0.5 + (pr.metrics?.trustCoach ?? 76) * 0.5), 0) / profiles.length
        : 78;
      const drMatchMod = drState?.level === 5 ? -4.5 : drState?.level === 4 ? -2.4 : drState?.level === 3 ? -0.9 : drState?.level === 1 && (drState.harmonyScore || 0) >= 82 ? +1.2 : 0;

      const homeBonus = oppHome ? 2.8 : -1.0;
      const redPenalty = (11 - active.length) * 8.5;
      const staminaPenalty = avgFit < 68 ? (68 - avgFit) * 0.25 : 0;

      const base =
        avgOvr * 0.54 +
        avgSuit * 0.14 +
        avgForm * 0.12 +
        avgMorale * 0.06 +
        coachSkill * 0.08 +
        unityScore * 0.06 +
        drMatchMod +
        homeBonus -
        staminaPenalty -
        redPenalty;

      return clamp(base * (0.72 + 0.28 * countFactor) + (importance > 1.2 ? 0.8 : 0), 42, 108);
    }

    const activeOpp = starters.filter((s) => !s.redCarded);
    const redPenalty = (11 - activeOpp.length) * 8.0;
    const baseClubPower = state.globalClubAI?.getEffectiveClubPower?.(club, fixture) ?? ((club?.rating || 78) * 0.96 + (oppHome ? 2.6 : -0.9));
    return clamp(baseClubPower - redPenalty, 40, 104);
  }

  // ==================== KHỞI TẠO PHIÊN MATCHDAY TRỰC TIẾP ====================
  startLiveMatchday(fixture, options = {}) {
    if (!fixture) return null;
    const matchId = fixture.matchId || fixture.id;
    if (this.processedMatchIds.has(matchId) && this.matchesById[matchId]) {
      this.activeMatchdayId = matchId;
      return this.matchesById[matchId];
    }
    if (this.liveSession && this.liveSession.matchId === matchId && !this.liveSession.finished) {
      return this.liveSession;
    }

    const homeClub = this.state.clubs.find((c) => c.name === fixture.home) || this.state.clubs[0];
    const awayClub = this.state.clubs.find((c) => c.name === fixture.away) || this.state.clubs[1];
    const psgIsHome = fixture.home === 'Paris Saint-Germain';

    const psgPlan = CoachMatchAI.selectMatchdayLineup(this.state, fixture, options);
    const oppClub = psgIsHome ? awayClub : homeClub;
    const oppPlan = buildOpponentPlan(this.state, oppClub);

    const makeLivePitchPlayer = (s, isPsg) => ({
      ...s,
      isPsg,
      liveStamina: s.fitness ?? 90,
      liveRating: 6.4,
      goals: 0,
      assists: 0,
      saves: 0,
      yellowCard: false,
      redCarded: false,
      injuredOut: false,
      minutesPlayed: 0,
      subbedInMinute: 0,
      subbedOutMinute: null
    });

    const psgActive = psgPlan.starters.map((s) => makeLivePitchPlayer(s, true));
    const oppActive = oppPlan.starters.map((s) => makeLivePitchPlayer(s, false));

    // Yếu tố phong độ ngày thi đấu / bất ngờ hợp lý (không để đội mạnh thắng 100%)
    const homeShock = (Math.random() - 0.5) * 7.2;
    const awayShock = (Math.random() - 0.5) * 7.2;

    this.liveSession = {
      matchId,
      fixture: { ...fixture, matchId },
      homeClubName: homeClub.name,
      awayClubName: awayClub.name,
      psgIsHome,
      oppName: oppClub.name,
      plan: psgPlan,
      oppPlan,
      activeStarters: psgActive,
      oppActiveStarters: oppActive,
      bench: psgPlan.bench,
      oppBench: oppPlan.bench,
      minute: 0,
      finished: false,
      paused: false,
      speed: 1,
      maxSubs: 5,
      subsUsed: 0,
      oppSubsUsed: 0,
      subbedOutIds: [],
      subbedInIds: [],
      subRecords: [],
      injuriesInMatch: [],
      pendingSubSuggestion: null,
      handledSuggestionMinutes: [],
      events: [],
      seqCounter: 0,
      stats: {
        homePossTicks: 50,
        awayPossTicks: 50,
        homePoss: 50,
        awayPoss: 50,
        homeShots: 0,
        awayShots: 0,
        homeOnTarget: 0,
        awayOnTarget: 0,
        homeBigChances: 0,
        awayBigChances: 0,
        homeCorners: 0,
        awayCorners: 0,
        homeFouls: 0,
        awayFouls: 0,
        homeSaves: 0,
        awaySaves: 0,
        homeYellow: 0,
        awayYellow: 0,
        homeRed: 0,
        awayRed: 0,
        homeXg: 0,
        awayXg: 0
      },
      homeShock,
      awayShock,
      homeGoals: 0,
      awayGoals: 0,
      penalties: null
    };

    this.activeMatchdayId = matchId;
    this.state.timeSystem?.pushAutoPause?.('matchday');
    return this.liveSession;
  }

  _pushLiveEvent(session, evt) {
    session.seqCounter = (session.seqCounter || 0) + 1;
    session.events.push({
      id: `ev_${session.matchId}_${session.seqCounter}`,
      seq: session.seqCounter,
      ...evt
    });
  }

  _pickPitchPlayer(activeList, preferredRoles, excludeId = null) {
    const elig = activeList.filter((p) => !p.redCarded && !p.injuredOut && p.playerId !== excludeId);
    if (elig.length === 0) return null;
    const weights = elig.map((p) => {
      const r = p.assignedRole || p.position;
      if (r === 'GK') return preferredRoles.includes('GK') ? 10 : 0.05;
      if (preferredRoles.includes(r)) return 5.5;
      if (['ST', 'LW', 'RW', 'AM'].includes(r) && preferredRoles.some((x) => ['ST', 'LW', 'RW', 'AM'].includes(x))) return 3.2;
      return 1.2;
    });
    let sum = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    for (let i = 0; i < elig.length; i++) {
      r -= weights[i];
      if (r <= 0) return elig[i];
    }
    return elig[0];
  }

  _stepMinute(session, minute, allowInteractivePause = true) {
    if (!session || session.finished) return;
    session.minute = minute;

    const homeClub = this.state.clubs.find((c) => c.name === session.homeClubName);
    const awayClub = this.state.clubs.find((c) => c.name === session.awayClubName);
    const psgActive = session.activeStarters;
    const oppActive = session.oppActiveStarters;

    const homeList = session.psgIsHome ? psgActive : oppActive;
    const awayList = session.psgIsHome ? oppActive : psgActive;

    // Hao tổn thể lực nhẹ theo phút
    for (const p of psgActive) {
      if (!p.redCarded && !p.injuredOut) {
        const drain = p.assignedRole === 'GK' ? 0.08 : 0.34;
        p.liveStamina = clamp(p.liveStamina - drain, 26, 100);
        p.minutesPlayed = minute - (p.subbedInMinute || 0);
      }
    }
    for (const p of oppActive) {
      if (!p.redCarded && !p.injuredOut) {
        p.liveStamina = clamp(p.liveStamina - (p.assignedRole === 'GK' ? 0.08 : 0.34), 26, 100);
        p.minutesPlayed = minute - (p.subbedInMinute || 0);
      }
    }

    const psgPower = this._computeTeamPower(true, session.psgIsHome ? homeClub : awayClub, psgActive, session.plan, session.fixture, this.state);
    const oppPower = this._computeTeamPower(false, session.psgIsHome ? awayClub : homeClub, oppActive, session.oppPlan, session.fixture, this.state);

    const homePower = (session.psgIsHome ? psgPower : oppPower) + (session.homeShock || 0);
    const awayPower = (session.psgIsHome ? oppPower : psgPower) + (session.awayShock || 0);
    const diff = homePower - awayPower;

    // Cập nhật quyền kiểm soát bóng
    const hTick = clamp(50 + diff * 1.15 + (Math.random() - 0.5) * 14, 24, 76);
    session.stats.homePossTicks += hTick;
    session.stats.awayPossTicks += (100 - hTick);
    const totTicks = session.stats.homePossTicks + session.stats.awayPossTicks;
    session.stats.homePoss = Math.round((session.stats.homePossTicks / totTicks) * 100);
    session.stats.awayPoss = 100 - session.stats.homePoss;

    // Xác suất có tình huống đáng chú ý trong phút này
    const resolveSideAttack = (isHomeSide) => {
      const attList = isHomeSide ? homeList : awayList;
      const defList = isHomeSide ? awayList : homeList;
      const isPsgSide = isHomeSide === session.psgIsHome;
      const teamName = isHomeSide ? session.homeClubName : session.awayClubName;
      const sideKey = isHomeSide ? 'home' : 'away';
      const powerEdge = isHomeSide ? diff : -diff;

      const shotProb = clamp(0.115 + powerEdge * 0.0036, 0.045, 0.24);
      if (Math.random() >= shotProb) return;

      const shooter = this._pickPitchPlayer(attList, ['ST', 'LW', 'RW', 'AM', 'CM']);
      if (!shooter) return;

      if (isHomeSide) session.stats.homeShots++;
      else session.stats.awayShots++;

      const bigChance = Math.random() < clamp(0.24 + powerEdge * 0.007, 0.10, 0.44);
      if (bigChance) {
        if (isHomeSide) session.stats.homeBigChances++;
        else session.stats.awayBigChances++;
      }

      const shotQuality = clamp(0.06 + (bigChance ? 0.24 : 0.03) + ((shooter.ovr - 75) * 0.005) + powerEdge * 0.0035, 0.03, 0.52);
      if (isHomeSide) session.stats.homeXg = +(session.stats.homeXg + shotQuality).toFixed(2);
      else session.stats.awayXg = +(session.stats.awayXg + shotQuality).toFixed(2);

      const onTargetProb = clamp(0.36 + (bigChance ? 0.22 : 0) + (shooter.ovr - 78) * 0.008, 0.22, 0.72);
      const isOnTarget = Math.random() < onTargetProb;

      if (!isOnTarget) {
        if (Math.random() < 0.35) {
          if (isHomeSide) session.stats.homeCorners++;
          else session.stats.awayCorners++;
        }
        return;
      }

      if (isHomeSide) session.stats.homeOnTarget++;
      else session.stats.awayOnTarget++;

      const defGk = defList.find((p) => !p.redCarded && (p.assignedRole === 'GK' || p.position === 'GK')) || defList[0];
      const gkFactor = defGk ? clamp((defGk.ovr - 75) * 0.012, -0.05, 0.22) : 0;
      const goalProb = clamp((bigChance ? 0.44 : 0.20) + (shooter.ovr - 78) * 0.009 - gkFactor + (defList.filter((d) => d.redCarded).length * 0.14), 0.10, 0.65);

      if (Math.random() < goalProb) {
        // BÀN THẮNG!
        const assister = Math.random() < 0.76
          ? this._pickPitchPlayer(attList, ['AM', 'CM', 'LW', 'RW', 'LB', 'RB'], shooter.playerId)
          : null;
        shooter.goals++;
        shooter.liveRating = clamp(shooter.liveRating + 1.05, 4.5, 9.9);
        if (assister) {
          assister.assists++;
          assister.liveRating = clamp(assister.liveRating + 0.55, 4.5, 9.8);
        }
        if (defGk) defGk.liveRating = clamp(defGk.liveRating - 0.18, 4.5, 9.5);
        if (isHomeSide) session.homeGoals++;
        else session.awayGoals++;

        this._pushLiveEvent(session, {
          minute,
          type: 'goal',
          side: sideKey,
          isPsg: isPsgSide,
          teamName,
          scorerId: shooter.playerId,
          scorerName: shooter.name,
          assisterId: assister?.playerId || null,
          assisterName: assister?.name || null,
          scoreAfter: `${session.homeGoals}-${session.awayGoals}`,
          text: `⚽ ${minute}' — VÀOOO! ${shooter.name}${assister ? ` (kiến tạo: ${assister.name})` : ''} ghi bàn cho ${teamName}! (${session.homeGoals}-${session.awayGoals})`
        });
      } else {
        // Thủ môn cản phá
        if (isHomeSide) session.stats.awaySaves++;
        else session.stats.homeSaves++;
        if (defGk) {
          defGk.saves++;
          defGk.liveRating = clamp(defGk.liveRating + 0.28, 4.5, 9.8);
        }
        if (bigChance) {
          this._pushLiveEvent(session, {
            minute,
            type: 'save',
            side: isHomeSide ? 'away' : 'home',
            isPsg: !isPsgSide,
            playerName: defGk?.name || 'Thủ môn',
            text: `🧤 ${minute}' — ${defGk?.name || 'Thủ môn'} xuất sắc cản phá cú sút nguy hiểm của ${shooter.name}!`
          });
        }
      }
    };

    resolveSideAttack(true);
    resolveSideAttack(false);

    // Phạm lỗi & Thẻ vàng / Thẻ đỏ
    const resolveDiscipline = (isHomeSide) => {
      const list = isHomeSide ? homeList : awayList;
      const isPsgSide = isHomeSide === session.psgIsHome;
      const teamName = isHomeSide ? session.homeClubName : session.awayClubName;
      const sideKey = isHomeSide ? 'home' : 'away';

      if (Math.random() >= 0.21) return;
      if (isHomeSide) session.stats.homeFouls++;
      else session.stats.awayFouls++;

      const cardRoll = Math.random();
      if (cardRoll < 0.0045 && (isHomeSide ? session.stats.homeRed : session.stats.awayRed) < 1) {
        // Thẻ đỏ trực tiếp (hiếm)
        const offender = this._pickPitchPlayer(list, ['CB', 'DM', 'LB', 'RB', 'CM']);
        if (offender && offender.assignedRole !== 'GK') {
          offender.redCarded = true;
          offender.liveRating = clamp(offender.liveRating - 1.2, 4.0, 9.0);
          if (isHomeSide) session.stats.homeRed++;
          else session.stats.awayRed++;
          this._pushLiveEvent(session, {
            minute,
            type: 'red',
            side: sideKey,
            isPsg: isPsgSide,
            teamName,
            playerId: offender.playerId,
            playerName: offender.name,
            text: `🟥 ${minute}' — THẺ ĐỎ TRỰC TIẾP! ${offender.name} (${teamName}) bị truất quyền thi đấu!`
          });
        }
      } else if (cardRoll < 0.145) {
        const offender = this._pickPitchPlayer(list, ['DM', 'CB', 'LB', 'RB', 'CM']);
        if (!offender || offender.assignedRole === 'GK') return;
        if (offender.yellowCard) {
          // Thẻ vàng thứ 2 -> Thẻ đỏ
          offender.redCarded = true;
          offender.liveRating = clamp(offender.liveRating - 0.9, 4.0, 9.0);
          if (isHomeSide) { session.stats.homeYellow++; session.stats.homeRed++; }
          else { session.stats.awayYellow++; session.stats.awayRed++; }
          this._pushLiveEvent(session, {
            minute,
            type: 'red',
            side: sideKey,
            isPsg: isPsgSide,
            teamName,
            playerId: offender.playerId,
            playerName: offender.name,
            secondYellow: true,
            text: `🟨🟥 ${minute}' — THẺ ĐỎ GIÁN TIẾP! ${offender.name} (${teamName}) nhận thẻ vàng thứ hai và phải rời sân!`
          });
        } else {
          offender.yellowCard = true;
          offender.liveRating = clamp(offender.liveRating - 0.15, 4.5, 9.5);
          if (isHomeSide) session.stats.homeYellow++;
          else session.stats.awayYellow++;
          this._pushLiveEvent(session, {
            minute,
            type: 'yellow',
            side: sideKey,
            isPsg: isPsgSide,
            teamName,
            playerId: offender.playerId,
            playerName: offender.name,
            text: `🟨 ${minute}' — Thẻ vàng cho ${offender.name} (${teamName}) sau pha vào bóng quyết liệt.`
          });
        }
      }
    };

    resolveDiscipline(true);
    resolveDiscipline(false);

    // Chấn thương trong trận (xác suất thấp, nếu có -> bắt buộc thay hoặc rút ra)
    if (minute >= 12 && minute <= 84 && session.injuriesInMatch.length === 0 && Math.random() < 0.0022) {
      const victim = this._pickPitchPlayer(psgActive, ['ST', 'LW', 'RW', 'CM', 'CB', 'LB', 'RB']);
      if (victim && victim.assignedRole !== 'GK') {
        const injDays = 7 + Math.floor(Math.random() * 14);
        session.injuriesInMatch.push({
          playerId: victim.playerId,
          playerName: victim.name,
          minute,
          days: injDays,
          type: 'Căng cơ trong trận'
        });
        this._pushLiveEvent(session, {
          minute,
          type: 'injury',
          side: session.psgIsHome ? 'home' : 'away',
          isPsg: true,
          playerId: victim.playerId,
          playerName: victim.name,
          text: `🏥 ${minute}' — ${victim.name} (PSG) bị đau sau pha va chạm và không thể tiếp tục thi đấu!`
        });
        // Tự động thay khẩn cấp nếu còn lượt thay người
        const subCand = session.bench.find(
          (b) => !session.subbedInIds.includes(b.playerId) && !session.subbedOutIds.includes(b.playerId) && b.position !== 'GK'
        );
        if (subCand && session.subsUsed < session.maxSubs) {
          this._applyPsgSub(session, victim.slotIndex, subCand.playerId, minute, 'Thay người bắt buộc do chấn thương');
        } else {
          victim.injuredOut = true;
        }
      }
    }

    // Thay người của đối thủ
    if ((minute === 60 || minute === 73 || minute === 82) && session.oppSubsUsed < 5) {
      const oppOut = [...oppActive].filter((p) => !p.redCarded && p.assignedRole !== 'GK').sort((a, b) => a.liveStamina - b.liveStamina)[0];
      const oppIn = session.oppBench[session.oppSubsUsed];
      if (oppOut && oppIn) {
        session.oppSubsUsed++;
        const oldName = oppOut.name;
        oppOut.subbedOutMinute = minute;
        const idx = oppActive.findIndex((x) => x.playerId === oppOut.playerId);
        if (idx !== -1) {
          oppActive[idx] = {
            ...oppIn,
            slotIndex: oppOut.slotIndex,
            assignedRole: oppOut.assignedRole,
            isPsg: false,
            liveStamina: 98,
            liveRating: 6.5,
            goals: 0,
            assists: 0,
            saves: 0,
            yellowCard: false,
            redCarded: false,
            injuredOut: false,
            minutesPlayed: 0,
            subbedInMinute: minute,
            subbedOutMinute: null
          };
        }
        this._pushLiveEvent(session, {
          minute,
          type: 'sub',
          side: session.psgIsHome ? 'away' : 'home',
          isPsg: false,
          teamName: session.oppName,
          outName: oldName,
          inName: oppIn.name,
          text: `🔄 ${minute}' — Thay người (${session.oppName}): ${oppIn.name} vào thay ${oldName}.`
        });
      }
    }

    // Đề xuất thay người của HLV PSG (mốc 58', 70', 80')
    if ([58, 70, 80].includes(minute) && session.subsUsed < session.maxSubs && !session.handledSuggestionMinutes.includes(minute)) {
      session.handledSuggestionMinutes.push(minute);
      const sug = CoachMatchAI.generateLiveSubSuggestion(session, this.state);
      if (sug) {
        if (allowInteractivePause) {
          session.pendingSubSuggestion = sug;
          session.paused = true;
        } else {
          // Chế độ tự động hoàn tất: HLV thực hiện đề xuất của chính mình
          this._applyPsgSub(session, sug.slotIndex, sug.inPlayerId, minute, sug.reason);
        }
      }
    }
  }

  _applyPsgSub(session, slotIndex, inPlayerId, minute, note = 'Thay người chiến thuật') {
    if (!session || session.finished) return { ok: false, reason: 'Trận đấu đã kết thúc.' };
    if (session.subsUsed >= session.maxSubs) return { ok: false, reason: `Đã dùng hết ${session.maxSubs}/${session.maxSubs} lượt thay người.` };
    if (session.subbedOutIds.includes(inPlayerId)) return { ok: false, reason: 'Cầu thủ đã rời sân không thể vào lại trận đấu.' };
    if (session.activeStarters.some((s) => s.playerId === inPlayerId)) return { ok: false, reason: 'Cầu thủ đang thi đấu trên sân.' };

    const outIdx = session.activeStarters.findIndex((s) => s.slotIndex === slotIndex);
    const outPlayer = outIdx !== -1 ? session.activeStarters[outIdx] : null;
    const inBench = session.bench.find((b) => b.playerId === inPlayerId);
    if (!outPlayer || !inBench) return { ok: false, reason: 'Không tìm thấy cầu thủ cần thay thế.' };
    if (outPlayer.redCarded) return { ok: false, reason: 'Không thể thay cầu thủ đã nhận thẻ đỏ.' };

    outPlayer.subbedOutMinute = minute;
    outPlayer.minutesPlayed = Math.max(1, minute - (outPlayer.subbedInMinute || 0));
    session.subbedOutIds.push(outPlayer.playerId);
    session.subbedInIds.push(inBench.playerId);
    session.subsUsed++;

    const rec = {
      minute,
      slotIndex,
      outPlayerId: outPlayer.playerId,
      outName: outPlayer.name,
      outPosition: outPlayer.position,
      outOvr: outPlayer.ovr,
      outAge: outPlayer.age,
      outGoals: outPlayer.goals,
      outAssists: outPlayer.assists,
      outRating: +outPlayer.liveRating.toFixed(1),
      inPlayerId: inBench.playerId,
      inName: inBench.name,
      note
    };
    session.subRecords.push(rec);

    // Đưa cầu thủ dự bị vào vị trí trên sân
    const suitabilityAI = this.state.formationSystem?.suitabilityAI;
    const ctx = { formation: session.plan.formation, tacticName: session.plan.tacticName };
    const suit = suitabilityAI ? suitabilityAI.evaluatePlayerAtPosition(inBench.player, outPlayer.assignedRole, ctx).score : 82;

    session.activeStarters[outIdx] = {
      slotIndex,
      playerId: inBench.playerId,
      name: inBench.name,
      shirtNumber: inBench.shirtNumber,
      position: inBench.position,
      assignedRole: outPlayer.assignedRole,
      displayRole: outPlayer.displayRole,
      formationX: outPlayer.formationX,
      formationY: outPlayer.formationY,
      ovr: inBench.ovr,
      age: inBench.age,
      form: inBench.form,
      fitness: inBench.fitness,
      suitabilityScore: suit,
      avatar: inBench.avatar,
      player: inBench.player,
      isPsg: true,
      liveStamina: 98,
      liveRating: 6.5,
      goals: 0,
      assists: 0,
      saves: 0,
      yellowCard: false,
      redCarded: false,
      injuredOut: false,
      minutesPlayed: 0,
      subbedInMinute: minute,
      subbedOutMinute: null
    };

    this._pushLiveEvent(session, {
      minute,
      type: 'sub',
      side: session.psgIsHome ? 'home' : 'away',
      isPsg: true,
      teamName: 'Paris Saint-Germain',
      outPlayerId: outPlayer.playerId,
      outName: outPlayer.name,
      inPlayerId: inBench.playerId,
      inName: inBench.name,
      text: `🔄 ${minute}' — Thay người (PSG): ${inBench.name} vào thay ${outPlayer.name}.`
    });

    return { ok: true, record: rec };
  }

  // Các thao tác của Chủ tịch khi trận đấu ĐANG DIỄN RA (PHẦN 4.4)
  acceptCoachSubSuggestion() {
    const s = this.liveSession;
    if (!s || !s.pendingSubSuggestion || s.finished) return { ok: false, reason: 'Không có đề xuất thay người nào.' };
    const sug = s.pendingSubSuggestion;
    const res = this._applyPsgSub(s, sug.slotIndex, sug.inPlayerId, s.minute, sug.reason);
    if (res.ok) {
      sug.status = 'accepted';
      s.pendingSubSuggestion = null;
      s.paused = false;
    }
    return res;
  }

  rejectCoachSubSuggestion() {
    const s = this.liveSession;
    if (!s || !s.pendingSubSuggestion) return { ok: false };
    s.pendingSubSuggestion.status = 'rejected';
    s.pendingSubSuggestion = null;
    s.paused = false;
    return { ok: true };
  }

  performChairmanLiveSub(slotIndex, inPlayerId) {
    const s = this.liveSession;
    if (!s || s.finished) return { ok: false, reason: 'Chỉ được thay người khi trận đấu đang diễn ra.' };
    const res = this._applyPsgSub(s, slotIndex, inPlayerId, Math.max(1, s.minute), 'Chủ tịch Phạm Minh Chiêu trực tiếp phê duyệt thay người');
    if (res.ok && s.pendingSubSuggestion?.slotIndex === slotIndex) {
      s.pendingSubSuggestion = null;
      s.paused = false;
    }
    return res;
  }

  stepLiveMatch(minutesStep = 1) {
    const s = this.liveSession;
    if (!s || s.finished) return null;
    if (s.paused) return s;

    const target = Math.min(90, s.minute + Math.max(1, Math.floor(minutesStep)));
    for (let m = s.minute + 1; m <= target; m++) {
      this._stepMinute(s, m, true);
      if (s.paused) break; // Tạm dừng nếu HLV đề xuất thay người
    }
    if (s.minute >= 90 && !s.finished) {
      return this.finalizeLiveSession();
    }
    return s;
  }

  finishLiveMatchImmediately() {
    const s = this.liveSession;
    if (!s) return null;
    if (s.finished) return this.matchesById[s.matchId];
    s.paused = false;
    s.pendingSubSuggestion = null;
    for (let m = s.minute + 1; m <= 90; m++) {
      this._stepMinute(s, m, false);
    }
    return this.finalizeLiveSession();
  }

  // Chạy toàn bộ 90' không cần chờ UI (tự động đúng ngày / advanceWeek / kiểm thử)
  simulateMatchComplete(fixture, options = {}) {
    if (!fixture) return null;
    const matchId = fixture.matchId || fixture.id;
    if (this.processedMatchIds.has(matchId) && this.matchesById[matchId]) {
      return this.matchesById[matchId];
    }
    const session = this.startLiveMatchday(fixture, options);
    if (!session) return null;
    for (let m = session.minute + 1; m <= 90; m++) {
      this._stepMinute(session, m, false);
    }
    return this.finalizeLiveSession(options);
  }

  // Chốt kết quả trận đấu + cập nhật bảng điểm, tất cả trận cùng vòng, báo cáo BHL, tin tức (CHỈ 1 LẦN DUY NHẤT mỗi matchId!)
  finalizeLiveSession(options = {}) {
    const s = this.liveSession;
    if (!s) return null;
    const matchId = s.matchId;
    if (this.processedMatchIds.has(matchId) && this.matchesById[matchId]) {
      this.state.timeSystem?.popAutoPause?.('matchday');
      return this.matchesById[matchId];
    }

    s.finished = true;
    s.minute = 90;

    // Đảm bảo tỷ số khớp tuyệt đối 100% với danh sách sự kiện ghi bàn (PHẦN 6)
    const goalEvents = s.events.filter((e) => e.type === 'goal');
    const homeGoals = goalEvents.filter((e) => e.side === 'home').length;
    const awayGoals = goalEvents.filter((e) => e.side === 'away').length;
    s.homeGoals = homeGoals;
    s.awayGoals = awayGoals;

    // Bảo đảm thống kê sút & trúng đích nhất quán
    s.stats.homeOnTarget = Math.max(homeGoals, s.stats.homeOnTarget);
    s.stats.awayOnTarget = Math.max(awayGoals, s.stats.awayOnTarget);
    s.stats.homeShots = Math.max(s.stats.homeOnTarget, s.stats.homeShots);
    s.stats.awayShots = Math.max(s.stats.awayOnTarget, s.stats.awayShots);

    const psgGoals = s.psgIsHome ? homeGoals : awayGoals;
    const oppGoals = s.psgIsHome ? awayGoals : homeGoals;
    const fx = s.fixture;
    const isKnockout = !!(fx.isFinal || ['r16', 'qf', 'sf', 'final'].includes(fx.stage));

    let penalties = null;
    let psgWon = psgGoals > oppGoals;
    let psgDrew = psgGoals === oppGoals;
    if (isKnockout && psgGoals === oppGoals) {
      const hPen = 4 + (Math.random() < 0.55 ? 1 : 0);
      let aPen = 3 + (Math.random() < 0.65 ? 1 : 0);
      if (hPen === aPen) {
        if (s.psgIsHome) aPen = hPen - 1;
        else aPen = hPen + 1;
      }
      const winner = hPen > aPen ? fx.home : fx.away;
      penalties = { home: hPen, away: aPen, winner };
      psgWon = winner === 'Paris Saint-Germain';
      psgDrew = false;
    }

    // Tổng hợp điểm & phút thi đấu cho toàn bộ cầu thủ PSG tham dự (đá chính + vào thay + bị thay ra)
    const cleanSheet = oppGoals === 0;
    const ratings = [];
    const seenIds = new Set();

    const computeFinalRating = (base, g, a, pos, won, drew, clean, red, saves) => {
      let val = base + (won ? 0.35 : drew ? 0.05 : -0.35) + (clean && ['GK', 'CB', 'LB', 'RB'].includes(pos) ? 0.55 : 0) + (saves >= 4 && pos === 'GK' ? 0.45 : 0) - (red ? 1.1 : 0);
      if (g === 0 && a === 0 && !clean) val += (Math.random() - 0.5) * 0.45;
      return +clamp(val, 4.2, 9.9).toFixed(1);
    };

    for (const p of s.activeStarters) {
      seenIds.add(p.playerId);
      const mins = Math.max(1, 90 - (p.subbedInMinute || 0));
      const rating = computeFinalRating(p.liveRating, p.goals, p.assists, p.position, psgWon, psgDrew, cleanSheet, p.redCarded, p.saves);
      let note = p.subbedInMinute ? `Vào sân từ phút ${p.subbedInMinute}'` : 'Thi đấu tròn vai';
      if (p.goals >= 2) note = `Cú đúp (${p.goals} bàn), tỏa sáng rực rỡ`;
      else if (p.goals === 1 && p.assists >= 1) note = 'Ghi bàn & kiến tạo đẳng cấp';
      else if (p.goals === 1) note = 'Ghi bàn thắng quan trọng cho PSG';
      else if (p.assists >= 1) note = `Đóng góp ${p.assists} pha kiến tạo`;
      else if (p.redCarded) note = 'Nhận thẻ đỏ rời sân';
      else if (p.position === 'GK' && cleanSheet) note = 'Giữ sạch lưới chắc chắn';
      else if (rating < 6.2) note = 'Phong độ dưới kỳ vọng, cần tập trung hơn';

      ratings.push({
        id: p.playerId,
        name: p.name,
        shirtNumber: p.shirtNumber,
        position: p.position,
        assignedRole: p.assignedRole || p.position,
        age: p.age,
        minutes: mins,
        goals: p.goals,
        assists: p.assists,
        rating,
        yellowCard: !!p.yellowCard,
        redCard: !!p.redCarded,
        note
      });
    }

    for (const subOut of s.subRecords) {
      if (seenIds.has(subOut.outPlayerId)) continue;
      seenIds.add(subOut.outPlayerId);
      ratings.push({
        id: subOut.outPlayerId,
        name: subOut.outName,
        shirtNumber: subOut.outShirtNumber || '-',
        position: subOut.outPosition || 'CM',
        assignedRole: subOut.outPosition || 'CM',
        age: subOut.outAge || 25,
        minutes: subOut.minute,
        goals: subOut.outGoals || 0,
        assists: subOut.outAssists || 0,
        rating: computeFinalRating(subOut.outRating || 6.5, subOut.outGoals || 0, subOut.outAssists || 0, subOut.outPosition, psgWon, psgDrew, cleanSheet, false, 0),
        yellowCard: false,
        redCard: false,
        note: `Thi đấu ${subOut.minute} phút trước khi được thay ra`
      });
    }

    const avgLine = (roles) => {
      const grp = ratings.filter((r) => roles.includes(r.assignedRole || r.position));
      if (!grp.length) return +(psgWon ? 7.1 : psgDrew ? 6.6 : 6.2).toFixed(1);
      return +(grp.reduce((sum, x) => sum + x.rating, 0) / grp.length).toFixed(1);
    };
    const lineRatings = {
      GK: avgLine(['GK']),
      DEF: avgLine(['CB', 'LB', 'RB']),
      MID: avgLine(['DM', 'CM', 'AM']),
      ATT: avgLine(['LW', 'RW', 'ST'])
    };

    const sortedRatings = [...ratings].sort((a, b) => b.rating - a.rating);
    const motm = sortedRatings[0] || { id: null, name: 'Ousmane Dembélé', rating: 7.5 };
    const gkRating = ratings.find((r) => r.position === 'GK') || null;
    const youngStar = ratings.find((r) => (r.age || 25) <= 22 && r.rating >= 7.2) || null;
    const lateWinner = psgWon && goalEvents.some((e) => e.isPsg && e.minute >= 80);

    // Sắp xếp diễn biến theo trình tự thời gian chuẩn xác
    const eventsSorted = [...s.events].sort((a, b) => a.minute - b.minute || a.seq - b.seq);

    const yellowCards = eventsSorted.filter((e) => e.type === 'yellow' && e.isPsg).map((e) => `${e.playerName} (${e.minute}')`);
    const redCards = eventsSorted.filter((e) => e.type === 'red').map((e) => `${e.playerName} (${e.minute}')`);

    const partialResult = {
      matchId,
      fixture: { ...fx, played: true, status: 'Đã kết thúc', homeGoals, awayGoals, penalties },
      homeClub: this.state.clubs.find((c) => c.name === fx.home),
      awayClub: this.state.clubs.find((c) => c.name === fx.away),
      homeGoals,
      awayGoals,
      penalties,
      psgIsHome: s.psgIsHome,
      psgGoals,
      oppGoals,
      psgWon,
      psgDrew,
      cleanSheet,
      lateWinner,
      oppName: s.oppName,
      starterIds: s.plan.starters.map((x) => x.playerId),
      subbedOutIds: [...s.subbedOutIds],
      subRecords: [...s.subRecords],
      injuriesInMatch: [...s.injuriesInMatch],
      matchInjury: s.injuriesInMatch.length ? s.injuriesInMatch.map((i) => `${i.playerName} (nghỉ ${i.days} ngày)`).join(', ') : null,
      plan: s.plan,
      oppPlan: s.oppPlan,
      stats: { ...s.stats, yellowCards, redCards },
      events: eventsSorted,
      goalEvents: eventsSorted.filter((e) => e.type === 'goal'),
      ratings,
      lineRatings,
      motm,
      gkRating,
      youngStar,
      standouts: sortedRatings.filter((r) => r.rating >= 7.6).slice(0, 3),
      underperformers: sortedRatings.filter((r) => r.rating <= 6.1).slice(0, 3)
    };

    partialResult.staffReports = buildFiveStaffReports(partialResult, this.state);
    // Giữ tương thích trường coachReport cho UI/modules cũ
    const hc = partialResult.staffReports.head_coach;
    partialResult.coachReport = {
      fixtureId: fx.id,
      date: fx.date,
      comp: fx.comp,
      scoreText: `${fx.home} ${homeGoals} - ${awayGoals} ${fx.away}`,
      resultLabel: psgWon ? 'Chiến thắng' : psgDrew ? 'Hòa' : 'Thất bại',
      summary: hc.summary,
      strengths: hc.highlights[1] || hc.highlights[0],
      weaknesses: hc.highlights[2] || hc.recommendations[0],
      ratings,
      proposals: hc.proposals
    };

    // Đánh dấu đã xử lý duy nhất & cam kết thay đổi toàn hệ thống (không bao giờ lặp lại)
    this.processedMatchIds.add(matchId);
    this.matchesById[matchId] = partialResult;
    this._commitMatchSideEffectsOnce(partialResult, options);

    this.liveSession = null;
    this.state.timeSystem?.popAutoPause?.('matchday');
    return partialResult;
  }

  _commitMatchSideEffectsOnce(res, options = {}) {
    const fx = res.fixture;
    const state = this.state;

    // 1. Đồng bộ fixture gốc trong state.fixtures
    const targetFx = state.fixtures.find((f) => (f.matchId || f.id) === res.matchId);
    if (targetFx) {
      targetFx.played = true;
      targetFx.status = 'Đã kết thúc';
      targetFx.homeGoals = res.homeGoals;
      targetFx.awayGoals = res.awayGoals;
      targetFx.penalties = res.penalties || null;
      targetFx.score = `${res.homeGoals} - ${res.awayGoals}`;
    }

    state.lastMatchResult = res;
    state.matchReports.unshift(res.coachReport);
    if (state.matchReports.length > 35) state.matchReports.pop();

    // 2. Snapshot thứ hạng trước vòng đấu Ligue 1 -> Cập nhật BXH PSG & toàn bộ các cặp đấu khác cùng vòng!
    if (fx.comp === 'Ligue 1') {
      this._snapshotLigue1Ranks();
      this._applyTableStandingForMatch(fx.home, fx.away, res.homeGoals, res.awayGoals);
    }

    this._simulateRoundCompanionMatches(fx.roundKey, res.matchId);

    // 3. Lịch sử đối đầu
    if (!state.headToHead) state.headToHead = {};
    RivalrySystem.recordResult(
      state.headToHead,
      fx.home,
      fx.away,
      res.homeGoals,
      res.awayGoals,
      fx.comp,
      state.season,
      res.goalEvents.map((e) => `${e.scorerName} (${e.minute}')`)
    );

    // 4. Cập nhật chỉ số cá nhân cầu thủ PSG (bàn thắng, kiến tạo, số trận, rating, thể lực, thẻ đỏ, chấn thương)
    res.ratings.forEach((r) => {
      const pl = state.getPlayerById(r.id);
      if (!pl) return;
      pl.apps++;
      pl.goals += r.goals;
      pl.assists += r.assists;
      if (r.redCard) pl.suspended = true;
      else if (pl.suspended && !res.starterIds.includes(pl.id)) pl.suspended = false;

      if (pl.career) {
        pl.career.totalApps = (pl.career.totalApps || 0) + 1;
        pl.career.totalGoals = (pl.career.totalGoals || 0) + r.goals;
        pl.career.totalAssists = (pl.career.totalAssists || 0) + r.assists;
        if (pl.career.seasonStats) {
          pl.career.seasonStats.apps = pl.apps;
          pl.career.seasonStats.goals = pl.goals;
          pl.career.seasonStats.assists = pl.assists;
          pl.career.seasonStats.minutes = (pl.career.seasonStats.minutes || 0) + (r.minutes ?? 86);
          pl.career.seasonStats.avgRating = +(((pl.career.seasonStats.avgRating * (pl.apps - 1)) + r.rating) / pl.apps).toFixed(2);
        }
        if (Array.isArray(pl.career.recentForm5)) {
          pl.career.recentForm5.unshift(r.rating);
          if (pl.career.recentForm5.length > 5) pl.career.recentForm5.pop();
        }
      }
      if (pl.health) {
        const minFactor = (r.minutes || 90) / 90;
        pl.health.fatigue = Math.min(100, Math.round((pl.health.fatigue || 0) + 15 * minFactor));
        pl.health.fitness = Math.max(42, Math.round((pl.health.fitness || 90) - 11 * minFactor));
      }
      if (r.rating >= 7.8) {
        pl.form = Math.min(99, pl.form + 3);
        pl.morale = Math.min(100, pl.morale + 4);
      } else if (r.rating <= 5.9) {
        pl.form = Math.max(46, pl.form - 2);
        pl.morale = Math.max(36, pl.morale - 3);
      }
      if (pl.psychology) pl.psychology.morale = pl.morale;
    });

    // Giảm án treo giò 1 trận cho những cầu thủ bị treo giò ở trận trước (đã ngồi ngoài trận này)
    state.getPsgSquad().forEach((pl) => {
      const gotRedToday = res.ratings.some((r) => r.id === pl.id && r.redCard);
      if (!gotRedToday && pl.suspended && !res.starterIds.includes(pl.id)) {
        pl.suspended = false;
      }
    });

    // Áp dụng chấn thương phát sinh trong trận
    res.injuriesInMatch.forEach((inj) => {
      const pl = state.getPlayerById(inj.playerId);
      if (pl) {
        pl.injuryDays = inj.days;
        if (pl.health) {
          pl.health.injuryDays = inj.days;
          pl.health.injuryType = inj.type;
        }
      }
    });

    // 5. Tài chính, Uy tín & Cúp (chống ghi sổ trùng lặp theo matchId)
    const vipLv = state.commercialSystem?.getFacilityLevel('parc_vip') || 4;
    if (res.psgIsHome) {
      state.addLedger(
        `Doanh thu bán vé & VIP Parc des Princes (${fx.comp})`,
        +(3.6 + vipLv * 0.7).toFixed(1),
        { txKey: `match_gate_${res.matchId}`, category: 'Bán vé SVĐ', counterparty: 'Parc des Princes', incomeField: 'tickets' }
      );
    } else {
      const homeOppClub = state.clubs.find((c) => c.name === fx.home);
      if (homeOppClub && state.globalClubAI) {
        state.globalClubAI.recordAiClubTx(homeOppClub, {
          txKey: `opp_gate_${res.matchId}`,
          cashDelta: homeOppClub.tier === 'giant' ? 2.6 : 1.4,
          revKey: 'tickets',
          revAmt: homeOppClub.tier === 'giant' ? 2.6 : 1.4
        });
      }
    }
    if (res.psgWon) {
      state.loseStreak = 0;
      state.reputationSystem?.applyDelta(
        { fanTrust: +3, coachTrust: +2, partnerTrust: +1, governanceSkill: +1 },
        `Thắng ${res.oppName} (${res.homeGoals}-${res.awayGoals})`,
        `match_rep_${res.matchId}`
      );
      if (fx.comp === 'UEFA Champions League') {
        state.addLedger(
          'Tiền thưởng chiến thắng UEFA Champions League',
          2.8,
          { txKey: `ucl_win_${res.matchId}`, category: 'Tiền thưởng UEFA', counterparty: 'UEFA', incomeField: 'prize' }
        );
      }
    } else if (!res.psgDrew) {
      state.loseStreak++;
      state.reputationSystem?.applyDelta(
        { fanTrust: -3, coachTrust: -2, mediaTrust: -1 },
        `Thua ${res.oppName} (${res.homeGoals}-${res.awayGoals})`,
        `match_rep_${res.matchId}`
      );
    }

    const tourRes = state.tournamentSystem?.evaluateMatchResult?.(res);
    if (tourRes?.awarded && tourRes.trophy) {
      res.awardedTrophy = tourRes.trophy;
      state.reputationSystem?.applyDelta(
        { fanTrust: +5, partnerTrust: +4, governanceSkill: +4, mediaTrust: +3 },
        `Đăng quang ${tourRes.trophy.competitionName}`,
        `trophy_rep_${tourRes.trophy.trophyId}`
      );
    }

    // 6. Quan hệ nội bộ & Sự kiện
    state.relationshipSystem?.onMatchCompleted?.(res);
    state.eventBus?.emit?.('MATCH_COMPLETED', res, `match_evt_${res.matchId}`);

    // 7. Báo chí & Truyền thông (CHỈ tạo 1 lần duy nhất cho mỗi matchId)
    this._publishPostMatchNewsOnce(res);

    // 8. Thông báo điện thoại & Bản tin ngày
    state.pushPhoneMsg(
      'Trung Tâm Matchday PSG',
      `🏁 KẾT QUẢ: ${fx.home} ${res.homeGoals} - ${res.awayGoals} ${fx.away} (${fx.comp})`,
      `Cầu thủ xuất sắc nhất: ${res.motm.name} (${res.motm.rating} điểm). 5 báo cáo chuyên môn Ban huấn luyện & BXH đã cập nhật.`,
      true
    );
    state.generateDailyBriefing?.();
    state.morningNewsSystem?.generateDigest?.(true);
  }

  _applyTableStandingForMatch(homeName, awayName, hg, ag) {
    const hClub = this.state.clubs.find((c) => c.name === homeName);
    const aClub = this.state.clubs.find((c) => c.name === awayName);
    if (!hClub || !aClub) return;

    hClub.played++;
    aClub.played++;
    hClub.gf += hg;
    hClub.ga += ag;
    aClub.gf += ag;
    aClub.ga += hg;

    if (!this.clubForm5[homeName]) this.clubForm5[homeName] = [];
    if (!this.clubForm5[awayName]) this.clubForm5[awayName] = [];

    if (hg > ag) {
      hClub.won++; hClub.pts += 3; aClub.lost++;
      this.clubForm5[homeName].push('W');
      this.clubForm5[awayName].push('L');
    } else if (hg < ag) {
      aClub.won++; aClub.pts += 3; hClub.lost++;
      this.clubForm5[homeName].push('L');
      this.clubForm5[awayName].push('W');
    } else {
      hClub.drawn++; aClub.drawn++; hClub.pts += 1; aClub.pts += 1;
      this.clubForm5[homeName].push('D');
      this.clubForm5[awayName].push('D');
    }
    if (this.clubForm5[homeName].length > 5) this.clubForm5[homeName].shift();
    if (this.clubForm5[awayName].length > 5) this.clubForm5[awayName].shift();
  }

  // Mô phỏng toàn bộ các cặp đấu khác cùng vòng bằng chính hệ thống Matchday
  _simulateRoundCompanionMatches(roundKey, skipMatchId = null) {
    if (!roundKey || !Array.isArray(this.roundFixturesByKey[roundKey])) return [];
    const list = this.roundFixturesByKey[roundKey];
    const results = [];

    for (const fx of list) {
      const mId = fx.matchId || fx.id;
      if (mId === skipMatchId || this.processedMatchIds.has(mId)) continue;
      if (fx.home === 'Paris Saint-Germain' || fx.away === 'Paris Saint-Germain') continue;

      const simRes = this._simulateCompanionMatch(fx);
      this.processedMatchIds.add(mId);
      this.matchesById[mId] = simRes;
      fx.played = true;
      fx.status = 'Đã kết thúc';
      fx.homeGoals = simRes.homeGoals;
      fx.awayGoals = simRes.awayGoals;
      fx.score = `${simRes.homeGoals} - ${simRes.awayGoals}`;

      if (fx.comp === 'Ligue 1') {
        this._applyTableStandingForMatch(fx.home, fx.away, simRes.homeGoals, simRes.awayGoals);
      }
      results.push(simRes);
    }
    return results;
  }

  _simulateCompanionMatch(fx) {
    const mId = fx.matchId || fx.id;
    const hClub = this.state.clubs.find((c) => c.name === fx.home) || { name: fx.home, rating: 78 };
    const aClub = this.state.clubs.find((c) => c.name === fx.away) || { name: fx.away, rating: 78 };
    const hPlan = buildOpponentPlan(this.state, hClub);
    const aPlan = buildOpponentPlan(this.state, aClub);

    const hShock = (Math.random() - 0.5) * 6.5;
    const aShock = (Math.random() - 0.5) * 6.5;
    const hPow = this.state.globalClubAI?.getEffectiveClubPower?.(hClub, fx) ?? ((hClub.rating || 78) + 2.6);
    const aPow = this.state.globalClubAI?.getEffectiveClubPower?.(aClub, fx) ?? ((aClub.rating || 78) - 0.8);
    const diff = (hPow + hShock) - (aPow + aShock);

    if (this.state.globalClubAI && hClub.name !== 'Paris Saint-Germain') {
      this.state.globalClubAI.recordAiClubTx(hClub, {
        txKey: `l1_gate_${mId}`,
        cashDelta: hClub.tier === 'giant' ? 1.6 : 0.85,
        revKey: 'tickets',
        revAmt: hClub.tier === 'giant' ? 1.6 : 0.85
      });
    }

    const homePoss = clamp(Math.round(50 + diff * 1.2 + (Math.random() - 0.5) * 8), 32, 68);
    const awayPoss = 100 - homePoss;

    const events = [];
    let seq = 0;
    let homeShots = 0, awayShots = 0, homeOnTarget = 0, awayOnTarget = 0;
    let homeBigChances = 0, awayBigChances = 0, homeXg = 0, awayXg = 0;
    let homeRed = 0, awayRed = 0, homeYellow = 0, awayYellow = 0;
    let homeGoals = 0, awayGoals = 0;

    for (let min = 1; min <= 90; min++) {
      const hActive = hPlan.starters.filter((p) => !p.redCarded);
      const aActive = aPlan.starters.filter((p) => !p.redCarded);
      const liveDiff = diff - (11 - hActive.length) * 8 + (11 - aActive.length) * 8;

      const trySide = (isHome) => {
        const list = isHome ? hActive : aActive;
        const dList = isHome ? aActive : hActive;
        const edge = isHome ? liveDiff : -liveDiff;
        if (Math.random() < clamp(0.11 + edge * 0.0034, 0.04, 0.22)) {
          if (isHome) homeShots++; else awayShots++;
          const shooter = this._pickPitchPlayer(list, ['ST', 'LW', 'RW', 'AM', 'CM']) || list[0];
          const big = Math.random() < 0.24;
          if (big) { if (isHome) homeBigChances++; else awayBigChances++; }
          const xg = clamp(0.08 + (big ? 0.22 : 0.03), 0.04, 0.45);
          if (isHome) homeXg = +(homeXg + xg).toFixed(2); else awayXg = +(awayXg + xg).toFixed(2);
          if (Math.random() < 0.40) {
            if (isHome) homeOnTarget++; else awayOnTarget++;
            const gp = clamp((big ? 0.38 : 0.18) + edge * 0.005, 0.09, 0.54);
            if (Math.random() < gp && shooter) {
              const assister = Math.random() < 0.7 ? this._pickPitchPlayer(list, ['AM', 'CM', 'LW', 'RW'], shooter.playerId) : null;
              shooter.goals++;
              shooter.liveRating = clamp(shooter.liveRating + 1.0, 5.0, 9.8);
              if (assister) assister.assists++;
              if (isHome) homeGoals++; else awayGoals++;
              events.push({
                id: `ev_${mId}_${++seq}`,
                seq,
                minute: min,
                type: 'goal',
                side: isHome ? 'home' : 'away',
                isPsg: false,
                teamName: isHome ? fx.home : fx.away,
                scorerId: shooter.playerId,
                scorerName: shooter.name,
                assisterName: assister?.name || null,
                text: `⚽ ${min}' — ${shooter.name} ghi bàn cho ${isHome ? fx.home : fx.away} (${homeGoals}-${awayGoals})`
              });
            } else {
              const gk = dList[0];
              if (gk) gk.saves++;
            }
          }
        }
        if (Math.random() < 0.032) {
          const p = this._pickPitchPlayer(list, ['CB', 'DM', 'CM']);
          if (p && p.assignedRole !== 'GK') {
            if (Math.random() < 0.06 && (isHome ? homeRed : awayRed) === 0) {
              p.redCarded = true;
              if (isHome) homeRed++; else awayRed++;
              events.push({ id: `ev_${mId}_${++seq}`, seq, minute: min, type: 'red', side: isHome ? 'home' : 'away', isPsg: false, playerName: p.name, text: `🟥 ${min}' — ${p.name} nhận thẻ đỏ!` });
            } else if (!p.yellowCard) {
              p.yellowCard = true;
              if (isHome) homeYellow++; else awayYellow++;
              events.push({ id: `ev_${mId}_${++seq}`, seq, minute: min, type: 'yellow', side: isHome ? 'home' : 'away', isPsg: false, playerName: p.name, text: `🟨 ${min}' — Thẻ vàng ${p.name}` });
            }
          }
        }
      };
      trySide(true);
      trySide(false);
    }

    const goalsFromEventsH = events.filter((e) => e.type === 'goal' && e.side === 'home').length;
    const goalsFromEventsA = events.filter((e) => e.type === 'goal' && e.side === 'away').length;
    const ratings = [...hPlan.starters, ...aPlan.starters].map((p) => ({
      id: p.playerId,
      name: p.name,
      position: p.position,
      goals: p.goals,
      assists: p.assists,
      rating: +clamp(p.liveRating, 5.2, 9.6).toFixed(1)
    }));
    const motm = [...ratings].sort((a, b) => b.rating - a.rating)[0];

    return {
      matchId: mId,
      isCompanionMatch: true,
      fixture: { ...fx, played: true, status: 'Đã kết thúc', homeGoals: goalsFromEventsH, awayGoals: goalsFromEventsA },
      homeClub: hClub,
      awayClub: aClub,
      homeGoals: goalsFromEventsH,
      awayGoals: goalsFromEventsA,
      stats: {
        homePoss, awayPoss,
        homeShots: Math.max(homeOnTarget, homeShots),
        awayShots: Math.max(awayOnTarget, awayShots),
        homeOnTarget: Math.max(goalsFromEventsH, homeOnTarget),
        awayOnTarget: Math.max(goalsFromEventsA, awayOnTarget),
        homeBigChances, awayBigChances,
        homeXg, awayXg,
        homeYellow, awayYellow, homeRed, awayRed,
        homeCorners: 2 + Math.floor(homeShots * 0.3),
        awayCorners: 2 + Math.floor(awayShots * 0.3),
        homeFouls: 6 + homeYellow * 2,
        awayFouls: 6 + awayYellow * 2,
        homeSaves: Math.max(0, awayOnTarget - goalsFromEventsA),
        awaySaves: Math.max(0, homeOnTarget - goalsFromEventsH)
      },
      events: events.sort((a, b) => a.minute - b.minute || a.seq - b.seq),
      goalEvents: events.filter((e) => e.type === 'goal'),
      ratings,
      motm
    };
  }

  _publishPostMatchNewsOnce(res) {
    if (this.publishedNewsMatchIds.has(res.matchId)) return;
    this.publishedNewsMatchIds.add(res.matchId);

    // Gắn matchId để lọc riêng tin sau trận cho từng trận trong Matchday UI
    const beforeLen = (this.state.newsArchive || []).length;
    const compatRes = {
      ...res,
      goalEvents: res.goalEvents.map((e) => ({
        ...e,
        scorer: e.scorerName,
        assister: e.assisterName,
        team: e.teamName
      }))
    };
    PressNewsSystem.generatePostMatchNews(this.state, compatRes);

    // Bổ sung tin thẻ đỏ / chấn thương / đua vô địch thực tế
    const reds = res.events.filter((e) => e.type === 'red');
    if (reds.length > 0) {
      PressNewsSystem.createArticle(this.state, {
        scenarioId: 19,
        category: 'Sau trận',
        tagType: 'Điểm nóng trận đấu',
        title: `Trọng tài rút thẻ đỏ trong trận ${res.fixture.home} vs ${res.fixture.away}: Bước ngoặt lớn!`,
        summary: `${reds[0].playerName} bị truất quyền thi đấu ở phút ${reds[0].minute}', tác động mạnh đến cục diện trận đấu.`,
        body: `Chiếc thẻ đỏ ở phút ${reds[0].minute}' buộc đội bóng phải điều chỉnh đấu pháp phòng ngự chặt trong phần còn lại của trận đấu kết thúc với tỷ số ${res.homeGoals}-${res.awayGoals}.`,
        imageType: 'pre_clash',
        imageCaption: `THẺ ĐỎ PHÚT ${reds[0].minute}'`,
        relatedEntity: reds[0].playerName,
        fanTone: res.psgWon ? 'win' : 'loss'
      });
    }
    if (res.injuriesInMatch.length > 0) {
      const inj = res.injuriesInMatch[0];
      PressNewsSystem.createArticle(this.state, {
        scenarioId: 16,
        category: 'Tin PSG',
        tagType: 'Y tế PSG',
        title: `Lo lắng nhân sự: ${inj.playerName} chấn thương phải nghỉ ${inj.days} ngày`,
        summary: `Chấn thương ở phút ${inj.minute}' trong trận gặp ${res.oppName} khiến ${inj.playerName} phải điều trị y tế.`,
        body: `Bộ phận y tế PSG xác nhận ${inj.playerName} cần khoảng ${inj.days} ngày hồi phục sau trận đấu tại ${res.fixture.stadium}.`,
        imageType: 'training',
        imageCaption: `Y TẾ PSG · ${inj.playerName.toUpperCase()}`,
        relatedEntity: inj.playerName,
        fanTone: 'neutral'
      });
    }

    const afterLen = (this.state.newsArchive || []).length;
    const addedCount = Math.max(0, afterLen - beforeLen);
    for (let i = 0; i < addedCount; i++) {
      if (this.state.newsArchive[i]) {
        this.state.newsArchive[i].matchId = res.matchId;
      }
    }

    this.state.televisionSystem?.pushBreakingNews?.(
      `KẾT QUẢ: ${res.fixture.home} ${res.homeGoals}-${res.awayGoals} ${res.fixture.away} (${res.fixture.comp})`,
      'match_result'
    );
  }

  getPostMatchNews(matchId) {
    const all = this.state.newsArchive || [];
    const exact = all.filter((a) => a.matchId === matchId);
    if (exact.length > 0) return exact;
    const rec = this.matchesById[matchId];
    if (!rec) return [];
    return all.filter((a) => a.category === 'Sau trận' || a.category === 'Champions League' || a.title?.includes(rec.oppName)).slice(0, 4);
  }

  // ==================== LƯU / KHÔI PHỤC SAVE/LOAD ====================
  exportState() {
    // Lưu tối đa 60 kết quả trận gần nhất chi tiết để đảm bảo Save nhẹ & nhanh
    const keys = Object.keys(this.matchesById);
    const trimmedMatches = {};
    keys.slice(-90).forEach((k) => {
      trimmedMatches[k] = this.matchesById[k];
    });
    return {
      matchesById: trimmedMatches,
      processedMatchIds: Array.from(this.processedMatchIds),
      publishedNewsMatchIds: Array.from(this.publishedNewsMatchIds),
      roundFixturesByKey: this.roundFixturesByKey,
      clubForm5: this.clubForm5,
      clubPrevRanks: this.clubPrevRanks,
      activeMatchdayId: this.activeMatchdayId,
      unreadMatchdayIds: [...this.unreadMatchdayIds],
      liveSession: this.liveSession ? { ...this.liveSession } : null
    };
  }

  importState(snap) {
    if (!snap) return;
    this.matchesById = snap.matchesById && typeof snap.matchesById === 'object' ? { ...snap.matchesById } : {};
    this.processedMatchIds = new Set(Array.isArray(snap.processedMatchIds) ? snap.processedMatchIds : []);
    this.publishedNewsMatchIds = new Set(Array.isArray(snap.publishedNewsMatchIds) ? snap.publishedNewsMatchIds : []);
    if (snap.roundFixturesByKey && typeof snap.roundFixturesByKey === 'object') {
      this.roundFixturesByKey = snap.roundFixturesByKey;
    } else {
      this.syncScheduleFromState();
    }
    this.clubForm5 = snap.clubForm5 && typeof snap.clubForm5 === 'object' ? { ...snap.clubForm5 } : {};
    this.clubPrevRanks = snap.clubPrevRanks && typeof snap.clubPrevRanks === 'object' ? { ...snap.clubPrevRanks } : {};
    this.activeMatchdayId = snap.activeMatchdayId || null;
    this.unreadMatchdayIds = Array.isArray(snap.unreadMatchdayIds) ? [...snap.unreadMatchdayIds] : [];
    this.liveSession = snap.liveSession || null;
  }
}
