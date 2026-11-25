// src/matches/MatchSystems.js
// Hệ thống lưu trữ lịch sử đối đầu (RivalrySystem) dùng chung cho MatchdaySystem

export class RivalrySystem {
  static key(c1, c2) {
    return [c1, c2].sort().join('__VS__');
  }

  static getRecord(h2hMap, homeName, awayName) {
    const k = RivalrySystem.key(homeName, awayName);
    const rec = h2hMap[k] || { matches: 0, wins: {}, draws: 0, goals: {}, history: [] };
    return {
      matches: rec.matches,
      homeWins: rec.wins[homeName] || 0,
      awayWins: rec.wins[awayName] || 0,
      draws: rec.draws || 0,
      lastMatch: rec.history[0] || null
    };
  }

  static recordResult(h2hMap, homeName, awayName, hg, ag, comp, season, scorers = []) {
    const k = RivalrySystem.key(homeName, awayName);
    if (!h2hMap[k]) h2hMap[k] = { matches: 0, wins: {}, draws: 0, goals: {}, history: [] };
    const rec = h2hMap[k];
    rec.matches++;
    rec.goals[homeName] = (rec.goals[homeName] || 0) + hg;
    rec.goals[awayName] = (rec.goals[awayName] || 0) + ag;
    if (hg > ag) rec.wins[homeName] = (rec.wins[homeName] || 0) + 1;
    else if (ag > hg) rec.wins[awayName] = (rec.wins[awayName] || 0) + 1;
    else rec.draws++;
    rec.history.unshift({ season, comp, home: homeName, away: awayName, score: `${hg}-${ag}`, scorers: scorers.slice(0, 4) });
    if (rec.history.length > 15) rec.history.pop();
  }
}
