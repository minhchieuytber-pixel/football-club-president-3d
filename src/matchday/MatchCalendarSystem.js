// src/matchday/MatchCalendarSystem.js
// Hệ thống Lịch Thi Đấu Chính Thức duy nhất cho Matchday:
// - Tạo lịch vòng tròn đầy đủ (Berger round-robin) cho TOÀN BỘ 16 đội Ligue 1 (8 trận/vòng x 30 vòng = 240 trận)
// - Tạo lịch đầy đủ cho UEFA Champions League, Coupe de France, Trophée des Champions, UEFA Super Cup, FIFA Club World Cup & Giao hữu
// - Mọi trận đấu có matchId duy nhất & roundKey dùng chung để Matchday xử lý trọn vẹn cả vòng đấu.

function formatUtcDate(dateObj) {
  const dd = String(dateObj.getUTCDate()).padStart(2, '0');
  const mm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${dateObj.getUTCFullYear()}`;
}

function computeKickoffEpoch(dateStr, timeStr = '20:00') {
  const parts = String(dateStr || '').split('/').map(Number);
  if (parts.length !== 3) return 0;
  const [dd, mm, yyyy] = parts;
  const [hh, mi] = String(timeStr || '20:00').split(':').map(Number);
  return Math.floor(Date.UTC(yyyy, mm - 1, dd, Number.isFinite(hh) ? hh : 20, Number.isFinite(mi) ? mi : 0, 0) / 1000);
}

// Thuật toán Berger tạo lịch vòng tròn chuẩn không trùng cặp, không bỏ sót đội nào
function buildBergerPairings(clubList) {
  const teams = [...clubList];
  if (teams.length % 2 === 1) teams.push(null);
  const n = teams.length;
  const half = n / 2;
  const rounds = [];
  const fixed = teams[0];
  let rot = teams.slice(1);

  for (let r = 0; r < n - 1; r++) {
    const line = [fixed, ...rot];
    const pairs = [];
    for (let i = 0; i < half; i++) {
      const a = line[i];
      const b = line[n - 1 - i];
      if (!a || !b) continue;
      const flip = (r % 2 === 1 && i === 0) || (i > 0 && (r + i) % 2 === 1);
      pairs.push(flip ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    rot = [rot[rot.length - 1], ...rot.slice(0, rot.length - 1)];
  }
  return rounds;
}

export class MatchCalendarSystem {
  static computeKickoffEpoch(dateStr, timeStr = '20:00') {
    return computeKickoffEpoch(dateStr, timeStr);
  }

  static buildSeasonSchedule(clubs, seasonStartYear = 2026, options = {}) {
    const ligue1All = clubs.filter((c) => c.league === 'Ligue 1');
    const ligue1Opp = ligue1All.filter((c) => c.name !== 'Paris Saint-Germain');
    const uclPool = clubs.filter((c) => c.rating >= 82 && c.name !== 'Paris Saint-Germain').slice(0, 14);
    const qualifiedSuperCup = options.qualifiedSuperCup !== undefined ? !!options.qualifiedSuperCup : true;
    const qualifiedClubWorldCup = options.qualifiedClubWorldCup !== undefined ? !!options.qualifiedClubWorldCup : true;

    const psgFixtures = [];
    const roundFixturesMap = {};
    let psgSeq = 1;
    let allSeq = 1;

    // Mốc khởi đầu mùa 2026/27: 03/08/2026 (khớp GameTimeSystem) -> Trận tuần 1 diễn ra tối 04/08/2026 (hoặc 03/08/2026 20:00)
    const makeDateStr = (weekNum) => {
      const d = new Date(Date.UTC(seasonStartYear, 7, 3 + (weekNum - 1) * 7));
      return formatUtcDate(d);
    };

    const registerMatch = ({
      id, week, comp, competitionId, round, roundKey, stage, isFinal,
      date, time, homeClub, awayClub, importance, isPsgMatch
    }) => {
      const mObj = {
        id,
        matchId: id,
        week,
        comp,
        competitionId: competitionId || comp.toLowerCase().replace(/\s+/g, '_'),
        round,
        roundKey,
        stage: stage || null,
        isFinal: !!isFinal,
        date,
        time,
        kickoffEpoch: computeKickoffEpoch(date, time),
        home: homeClub.name,
        away: awayClub.name,
        stadium: stage === 'final' && competitionId === 'ucl'
          ? 'Allianz Arena (Trung lập)'
          : stage === 'final' && competitionId === 'coupe_de_france'
            ? 'Stade de France'
            : competitionId === 'uefa_super_cup'
              ? 'Sân Trung Lập Châu Âu'
              : competitionId === 'fifa_club_world_cup'
                ? 'Sân Trung Lập FIFA'
                : (homeClub.stadium || 'Parc des Princes'),
        status: 'Sắp diễn ra',
        played: false,
        homeGoals: null,
        awayGoals: null,
        importance: importance || 1.0,
        isPsgMatch: !!isPsgMatch
      };
      if (!roundFixturesMap[roundKey]) roundFixturesMap[roundKey] = [];
      roundFixturesMap[roundKey].push(mObj);
      if (isPsgMatch) psgFixtures.push(mObj);
      return mObj;
    };

    const psgClub = clubs.find((c) => c.name === 'Paris Saint-Germain') || ligue1All[0];

    // Tuần 1: Giao hữu tiền mùa giải
    const friendlyOpp = uclPool[0] || clubs.find((c) => c.name === 'Bayern Munich') || ligue1Opp[0];
    registerMatch({
      id: `fx_${psgSeq++}`,
      week: 1,
      comp: 'Giao hữu',
      competitionId: 'friendly',
      round: 'Giao hữu Quốc tế',
      roundKey: `friendly_w1`,
      date: makeDateStr(1),
      time: '20:00',
      homeClub: psgClub,
      awayClub: friendlyOpp,
      importance: 0.75,
      isPsgMatch: true
    });

    // Tuần 2: Trophée des Champions
    const monaco = clubs.find((c) => c.name === 'AS Monaco') || ligue1Opp[0];
    registerMatch({
      id: `fx_${psgSeq++}`,
      week: 2,
      comp: 'Trophée des Champions',
      competitionId: 'trophee_des_champions',
      round: 'Chung kết Siêu cúp Pháp',
      roundKey: 'tdc_final',
      stage: 'final',
      isFinal: true,
      date: makeDateStr(2),
      time: '21:00',
      homeClub: psgClub,
      awayClub: monaco,
      importance: 1.25,
      isPsgMatch: true
    });

    let weekCursor = 3;
    if (qualifiedSuperCup) {
      const uelRep = clubs.find((c) => c.name === 'Tottenham Hotspur' || c.name === 'Chelsea') || uclPool[1];
      registerMatch({
        id: `fx_${psgSeq++}`,
        week: weekCursor,
        comp: 'UEFA Super Cup',
        competitionId: 'uefa_super_cup',
        round: 'Chung kết Siêu cúp Châu Âu',
        roundKey: 'usc_final',
        stage: 'final',
        isFinal: true,
        date: makeDateStr(weekCursor),
        time: '21:00',
        homeClub: psgClub,
        awayClub: uelRep,
        importance: 1.35,
        isPsgMatch: true
      });
      weekCursor++;
    }

    // Lịch vòng tròn 16 đội Ligue 1: 15 vòng lượt đi + 15 vòng lượt về = 30 vòng (8 trận/vòng)
    const firstHalfRounds = buildBergerPairings(ligue1All);
    const secondHalfRounds = firstHalfRounds.map((pairs) => pairs.map(([h, a]) => [a, h]));
    const all30Rounds = [...firstHalfRounds, ...secondHalfRounds];

    for (let idx = 0; idx < 30; idx++) {
      const roundNum = idx + 1;
      const roundKey = `l1_r${roundNum}`;
      const matchDate = makeDateStr(weekCursor);
      const pairs = all30Rounds[idx];

      // Đảm bảo PSG xuất hiện đúng 1 lần trong vòng đấu
      pairs.forEach(([h, a], pIdx) => {
        const isPsg = h.name === 'Paris Saint-Germain' || a.name === 'Paris Saint-Germain';
        const opp = h.name === 'Paris Saint-Germain' ? a : h;
        const isBig = isPsg && ['Olympique de Marseille', 'AS Monaco', 'Olympique Lyonnais', 'LOSC Lille'].includes(opp.name);
        const matchId = isPsg ? `fx_${psgSeq++}` : `rm_l1_r${roundNum}_${pIdx + 1}_${allSeq++}`;
        registerMatch({
          id: matchId,
          week: weekCursor,
          comp: 'Ligue 1',
          competitionId: 'ligue_1',
          round: `Vòng ${roundNum}`,
          roundKey,
          date: matchDate,
          time: isPsg ? (h.name === 'Paris Saint-Germain' ? '21:00' : '19:00') : (pIdx % 2 === 0 ? '17:00' : '19:00'),
          homeClub: h,
          awayClub: a,
          importance: isBig ? 1.25 : 1.0,
          isPsgMatch: isPsg
        });
      });
      weekCursor++;

      // UEFA Champions League (mỗi 4 vòng Ligue 1)
      if (roundNum % 4 === 0 && uclPool.length >= 6) {
        const uclIdx = Math.floor(roundNum / 4) - 1;
        const uOpp = uclPool[uclIdx % uclPool.length];
        const uHome = roundNum === 28 ? true : (roundNum / 4) % 2 === 1;
        const stage = roundNum <= 16 ? 'group' : roundNum === 20 ? 'qf' : roundNum === 24 ? 'sf' : 'final';
        const roundLabel = roundNum <= 16
          ? `Vòng bảng · Lượt ${roundNum / 4}`
          : roundNum === 20
            ? 'Tứ kết Champions League'
            : roundNum === 24
              ? 'Bán kết Champions League'
              : 'Chung kết UEFA Champions League';
        const uclRoundKey = `ucl_${stage}_${roundNum}`;
        const uclDate = makeDateStr(weekCursor);

        registerMatch({
          id: `fx_${psgSeq++}`,
          week: weekCursor,
          comp: 'UEFA Champions League',
          competitionId: 'ucl',
          round: roundLabel,
          roundKey: uclRoundKey,
          stage,
          isFinal: stage === 'final',
          date: uclDate,
          time: '21:00',
          homeClub: uHome ? psgClub : uOpp,
          awayClub: uHome ? uOpp : psgClub,
          importance: stage === 'final' ? 1.55 : 1.35,
          isPsgMatch: true
        });

        // Các cặp đấu khác cùng vòng UCL (nếu không phải chung kết)
        if (stage !== 'final') {
          const others = uclPool.filter((c) => c.name !== uOpp.name).slice(0, stage === 'group' ? 8 : stage === 'qf' ? 6 : 2);
          for (let oi = 0; oi + 1 < others.length; oi += 2) {
            registerMatch({
              id: `rm_ucl_r${roundNum}_${oi}_${allSeq++}`,
              week: weekCursor,
              comp: 'UEFA Champions League',
              competitionId: 'ucl',
              round: roundLabel,
              roundKey: uclRoundKey,
              stage,
              date: uclDate,
              time: '21:00',
              homeClub: others[oi],
              awayClub: others[oi + 1],
              importance: 1.2,
              isPsgMatch: false
            });
          }
        }
        weekCursor++;
      }

      // FIFA Club World Cup
      if (roundNum === 18 && qualifiedClubWorldCup) {
        const cwcOpp = clubs.find((c) => c.name === 'Real Madrid') || uclPool[0];
        registerMatch({
          id: `fx_${psgSeq++}`,
          week: weekCursor,
          comp: 'FIFA Club World Cup',
          competitionId: 'fifa_club_world_cup',
          round: 'Chung kết FIFA Club World Cup',
          roundKey: 'fcwc_final',
          stage: 'final',
          isFinal: true,
          date: makeDateStr(weekCursor),
          time: '20:00',
          homeClub: psgClub,
          awayClub: cwcOpp,
          importance: 1.48,
          isPsgMatch: true
        });
        weekCursor++;
      }

      // Coupe de France
      if (roundNum === 8 || roundNum === 16 || roundNum === 24 || roundNum === 29) {
        const cOpp = ligue1Opp[(roundNum + 2) % ligue1Opp.length];
        const stage = roundNum === 8 ? 'r16' : roundNum === 16 ? 'qf' : roundNum === 24 ? 'sf' : 'final';
        const cRound = roundNum === 8 ? 'Vòng 1/16' : roundNum === 16 ? 'Tứ kết' : roundNum === 24 ? 'Bán kết' : 'Chung kết Coupe de France';
        const cdfRoundKey = `cdf_${stage}`;
        const cdfDate = makeDateStr(weekCursor);

        registerMatch({
          id: `fx_${psgSeq++}`,
          week: weekCursor,
          comp: 'Coupe de France',
          competitionId: 'coupe_de_france',
          round: cRound,
          roundKey: cdfRoundKey,
          stage,
          isFinal: stage === 'final',
          date: cdfDate,
          time: '20:45',
          homeClub: psgClub,
          awayClub: cOpp,
          importance: stage === 'final' ? 1.35 : 1.15,
          isPsgMatch: true
        });

        if (stage !== 'final') {
          const cdfOthers = ligue1Opp.filter((c) => c.name !== cOpp.name).slice(0, 6);
          for (let ci = 0; ci + 1 < cdfOthers.length; ci += 2) {
            registerMatch({
              id: `rm_cdf_${stage}_${ci}_${allSeq++}`,
              week: weekCursor,
              comp: 'Coupe de France',
              competitionId: 'coupe_de_france',
              round: cRound,
              roundKey: cdfRoundKey,
              stage,
              date: cdfDate,
              time: '20:45',
              homeClub: cdfOthers[ci],
              awayClub: cdfOthers[ci + 1],
              importance: 1.05,
              isPsgMatch: false
            });
          }
        }
        weekCursor++;
      }
    }

    if (psgFixtures[0]) psgFixtures[0].status = 'Hôm nay thi đấu';
    // Đính kèm bản đồ vòng đấu trực tiếp lên mảng fixtures (non-enumerable property để không phá JSON.stringify)
    Object.defineProperty(psgFixtures, '_roundFixturesMap', {
      value: roundFixturesMap,
      enumerable: false,
      configurable: true,
      writable: true
    });
    return psgFixtures;
  }
}
