// src/leagues/TournamentSystem.js
// Hệ thống quản lý tiến trình các giải đấu chính thức (Ligue 1, Coupe de France, Trophée des Champions,
// UEFA Champions League, UEFA Super Cup, FIFA Club World Cup), xác nhận đội vô địch thực tế và kích hoạt TrophySystem.
import { resolveCompetitionByMatchComp } from '../trophies/TrophyDatabase.js';

export class TournamentSystem {
  constructor(gameState, trophySystem) {
    this.state = gameState;
    this.trophySystem = trophySystem;
    this.resetSeasonState();
  }

  resetSeasonState() {
    this.seasonName = this.state?.season || '2026/27';
    this.status = {
      ligue_1: { active: true, champion: null, psgPosition: 1, completedRounds: 0 },
      trophee_des_champions: { active: true, champion: null, eliminated: false },
      coupe_de_france: { active: true, champion: null, eliminated: false, stageReached: 'Vòng 1/16' },
      ucl: { active: true, champion: null, eliminated: false, groupPoints: 0, groupPlayed: 0, stageReached: 'Vòng bảng' },
      uefa_super_cup: { active: true, champion: null, eliminated: false },
      fifa_club_world_cup: { active: true, champion: null, eliminated: false }
    };
    this.notableMatches = [];
    this._resolvedFinals = new Set();
  }

  _recordNotableMatch(res) {
    if (!res || !res.fixture) return;
    const fx = res.fixture;
    const scoreStr = `${fx.home} ${res.homeGoals} - ${res.awayGoals} ${fx.away}${res.penalties ? ` (Pen ${res.penalties.home}-${res.penalties.away})` : ''}`;
    const goalDiff = Math.abs(res.homeGoals - res.awayGoals);
    const isHighlight = fx.isFinal || fx.comp === 'UEFA Champions League' || goalDiff >= 3 || (fx.importance || 1) >= 1.2;
    if (isHighlight) {
      this.notableMatches.unshift(`${scoreStr} · ${fx.comp} (${fx.round})`);
      if (this.notableMatches.length > 8) this.notableMatches.pop();
    }
  }

  _cancelFutureFixturesForComp(competitionId, compName) {
    if (!Array.isArray(this.state?.fixtures)) return;
    for (const fx of this.state.fixtures) {
      if (fx.played) continue;
      if (fx.competitionId === competitionId || fx.comp === compName) {
        fx.played = true;
        fx.status = 'PSG đã dừng bước';
        fx.skippedEliminated = true;
      }
    }
  }

  // Đánh giá ngay sau mỗi trận đấu vừa kết thúc (chạy cả cho mô phỏng tự động & trận 3D)
  evaluateMatchResult(res) {
    if (!res || !res.fixture) return null;
    const fx = res.fixture;
    const compMeta = resolveCompetitionByMatchComp(fx.competitionId || fx.comp);
    if (!compMeta) return null;

    this._recordNotableMatch(res);
    const compId = compMeta.competitionId;
    const oppName = res.oppName || (fx.home === 'Paris Saint-Germain' ? fx.away : fx.home);
    const penStr = res.penalties ? ` (Pen ${res.penalties.home}-${res.penalties.away})` : '';
    const finalText = `${fx.home} ${res.homeGoals} - ${res.awayGoals} ${fx.away}${penStr}`;

    if (compId === 'ligue_1') {
      const st = this.status.ligue_1;
      st.completedRounds++;
      const ligue1 = (this.state.clubs || [])
        .filter((c) => c.league === 'Ligue 1')
        .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
      const idx = ligue1.findIndex((c) => c.name === 'Paris Saint-Germain');
      st.psgPosition = idx >= 0 ? idx + 1 : 1;

      const remainingL1 = (this.state.fixtures || []).some((f) => !f.played && (f.competitionId === 'ligue_1' || f.comp === 'Ligue 1'));
      if (!remainingL1) {
        return this.confirmLigue1Champion();
      }
      return null;
    }

    if (compId === 'trophee_des_champions' || compId === 'uefa_super_cup' || compId === 'fifa_club_world_cup') {
      const st = this.status[compId];
      const winner = res.psgWon ? 'Paris Saint-Germain' : oppName;
      st.champion = winner;
      st.eliminated = !res.psgWon;
      if (res.psgWon) {
        return this.awardCompetitionChampion(compId, winner, { finalMatchText: finalText, opponentName: oppName });
      }
      return { competitionId: compId, champion: winner, awarded: false };
    }

    if (compId === 'coupe_de_france') {
      const st = this.status.coupe_de_france;
      st.stageReached = fx.round;
      if (!res.psgWon) {
        st.eliminated = true;
        st.champion = oppName;
        this._cancelFutureFixturesForComp('coupe_de_france', 'Coupe de France');
        return { competitionId: 'coupe_de_france', champion: oppName, awarded: false };
      }
      if (fx.isFinal || fx.stage === 'final' || String(fx.round).toLowerCase().includes('chung kết')) {
        st.champion = 'Paris Saint-Germain';
        return this.awardCompetitionChampion('coupe_de_france', 'Paris Saint-Germain', { finalMatchText: finalText, opponentName: oppName });
      }
      return null;
    }

    if (compId === 'ucl') {
      const st = this.status.ucl;
      st.stageReached = fx.round;
      if (fx.stage === 'group' || String(fx.round).includes('Vòng bảng')) {
        st.groupPlayed++;
        if (res.psgWon) st.groupPoints += 3;
        else if (res.psgDrew) st.groupPoints += 1;
        // Sau 4 lượt vòng bảng, tối thiểu 4 điểm mới vào Tứ kết
        if (st.groupPlayed >= 4 && st.groupPoints < 4) {
          st.eliminated = true;
          st.champion = oppName;
          this._cancelFutureFixturesForComp('ucl', 'UEFA Champions League');
          return { competitionId: 'ucl', champion: oppName, awarded: false };
        }
        return null;
      }

      if (!res.psgWon) {
        st.eliminated = true;
        st.champion = oppName;
        this._cancelFutureFixturesForComp('ucl', 'UEFA Champions League');
        return { competitionId: 'ucl', champion: oppName, awarded: false };
      }

      if (fx.isFinal || fx.stage === 'final' || String(fx.round).toLowerCase().includes('chung kết')) {
        st.champion = 'Paris Saint-Germain';
        return this.awardCompetitionChampion('ucl', 'Paris Saint-Germain', { finalMatchText: finalText, opponentName: oppName });
      }
      return null;
    }

    return null;
  }

  confirmLigue1Champion() {
    const ligue1 = (this.state.clubs || [])
      .filter((c) => c.league === 'Ligue 1')
      .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
    const champ = ligue1[0]?.name || 'Paris Saint-Germain';
    const psg = ligue1.find((c) => c.name === 'Paris Saint-Germain');
    const runnerUp = ligue1[1]?.name || 'AS Monaco';
    this.status.ligue_1.champion = champ;
    this.status.ligue_1.psgPosition = Math.max(1, ligue1.findIndex((c) => c.name === 'Paris Saint-Germain') + 1);

    if (champ === 'Paris Saint-Germain' && ((psg?.pts || 0) > 0 || (psg?.played || 0) > 0)) {
      return this.awardCompetitionChampion('ligue_1', 'Paris Saint-Germain', {
        finalMatchText: `Hạng 1 Ligue 1 (${psg?.pts ?? 0} điểm)`,
        opponentName: runnerUp
      });
    }
    return { competitionId: 'ligue_1', champion: champ, awarded: false };
  }

  awardCompetitionChampion(competitionId, winner, extra = {}) {
    const seasonName = this.state?.season || this.seasonName || '2026/27';
    const key = `${competitionId}|${seasonName}`;
    if (winner !== 'Paris Saint-Germain') {
      return { competitionId, champion: winner, awarded: false };
    }
    if (this._resolvedFinals.has(key) || this.trophySystem?.hasTrophy(competitionId, seasonName)) {
      return { competitionId, champion: winner, awarded: false, duplicate: true };
    }
    this._resolvedFinals.add(key);
    const res = this.trophySystem.awardTrophy({
      competitionId,
      winner,
      seasonName,
      finalMatchText: extra.finalMatchText || '',
      opponentName: extra.opponentName || ''
    });
    return { competitionId, champion: winner, awarded: !!res.ok, trophy: res.trophy || null };
  }

  // Gọi khi kết thúc mùa giải để chốt mọi danh hiệu còn lại (đặc biệt Ligue 1 từ BXH) & lưu Archive mùa giải
  resolveEndOfSeason() {
    const l1Res = this.confirmLigue1Champion();
    const ligue1 = (this.state.clubs || [])
      .filter((c) => c.league === 'Ligue 1')
      .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
    const ligue1Winner = ligue1[0]?.name || 'Paris Saint-Germain';
    const psgClub = ligue1.find((c) => c.name === 'Paris Saint-Germain');
    const psgRankIdx = Math.max(1, ligue1.findIndex((c) => c.name === 'Paris Saint-Germain') + 1);

    const uclChamp = this.status.ucl.champion || (this.status.ucl.eliminated ? 'Real Madrid' : 'Real Madrid');
    const seasonName = this.state?.season || this.seasonName;
    const earnedThisSeason = (this.trophySystem?.trophies || []).filter((t) => t.seasonName === seasonName);
    const psgSquad = this.state?.getPsgSquad ? this.state.getPsgSquad() : [];
    const topScorer = [...psgSquad].sort((a, b) => (b.goals || 0) - (a.goals || 0))[0];
    const topAssister = [...psgSquad].sort((a, b) => (b.assists || 0) - (a.assists || 0))[0];
    const revenueNum = Math.round(760 + (this.state?.president?.prestige || 85) * 1.2);

    const archive = this.trophySystem?.recordSeasonArchive({
      season: seasonName,
      presidentName: this.state?.president?.name || 'Phạm Minh Chiêu',
      coachId: this.state?.coach?.staffId || 'stf_hc_01',
      coachName: this.state?.coach?.name || 'HLV Trưởng PSG',
      ligue1Winner,
      uclWinner: uclChamp,
      psgRank: `Hạng ${psgRankIdx}`,
      points: psgClub?.pts ?? 0,
      topScorer: topScorer ? `${topScorer.name} (${topScorer.goals || 0} bàn)` : 'Ousmane Dembélé',
      topAssister: topAssister ? `${topAssister.name} (${topAssister.assists || 0} kiến tạo)` : 'Vitinha',
      revenue: `€${revenueNum}M`,
      trophyNames: earnedThisSeason.map((t) => t.competitionName),
      earnedTrophyIds: earnedThisSeason.map((t) => t.trophyId),
      notableMatches: this.notableMatches,
      summaryNote: earnedThisSeason.length > 0
        ? `PSG giành ${earnedThisSeason.length} danh hiệu: ${earnedThisSeason.map((t) => t.competitionName).join(', ')}.`
        : `PSG khép lại mùa giải ${seasonName} ở vị trí ${psgRankIdx} Ligue 1.`
    });

    return { l1Res, ligue1Winner, uclWinner: uclChamp, psgRankIdx, earnedThisSeason, archive };
  }

  exportState() {
    return {
      seasonName: this.seasonName,
      status: this.status,
      notableMatches: this.notableMatches,
      resolvedFinals: Array.from(this._resolvedFinals)
    };
  }

  importState(data) {
    if (!data) return;
    this.seasonName = data.seasonName || this.state?.season || '2026/27';
    if (data.status) this.status = data.status;
    if (Array.isArray(data.notableMatches)) this.notableMatches = data.notableMatches;
    this._resolvedFinals = new Set(Array.isArray(data.resolvedFinals) ? data.resolvedFinals : []);
  }
}
