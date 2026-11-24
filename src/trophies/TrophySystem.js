// src/trophies/TrophySystem.js
// Quản lý kho danh hiệu 3D tự động, lưu trữ bất biến đội hình vô địch, chống trùng lặp & lưu trữ lịch sử mùa giải PSG
import { COMPETITION_CATALOG, getHeritageTotalCount } from './TrophyDatabase.js';
import { PressNewsSystem } from '../media/PressNewsSystem.js';

export function normalizeSeasonId(seasonName) {
  return String(seasonName || '2026/27').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export class TrophySystem {
  constructor(gameState) {
    this.state = gameState;
    this.trophies = []; // Danh sách danh hiệu thật sự giành được từ triều đại hiện tại (2026/27+)
    this.seasonArchives = [
      {
        seasonId: '2025_26',
        season: '2025/26',
        presidentName: 'Phạm Minh Chiêu',
        coachId: 'stf_hc_01',
        coachName: 'Luis Enrique',
        ligue1Winner: 'Paris Saint-Germain',
        uclWinner: 'Paris Saint-Germain',
        psgRank: 'Hạng 1',
        points: 78,
        topScorer: 'Ousmane Dembélé (24 bàn)',
        topAssister: 'Vitinha (14 kiến tạo)',
        revenue: '€805M',
        trophyNames: ['Ligue 1', 'Coupe de France', 'UEFA Champions League'],
        earnedTrophyIds: [],
        notableMatches: [
          'Paris Saint-Germain 3 - 1 Inter Milan (Chung kết UEFA Champions League 2025)',
          'Paris Saint-Germain 4 - 0 Olympique de Marseille (Le Classique tại Parc des Princes)'
        ],
        squadSnapshot: [
          { playerId: 'psg_archive_gk', name: 'Gianluigi Donnarumma', position: 'GK', shirtNumber: 1, ovr: 89, goals: 0, assists: 0 },
          { playerId: 'psg_archive_cb', name: 'Marquinhos (C)', position: 'CB', shirtNumber: 5, ovr: 88, goals: 3, assists: 1, isCaptain: true },
          { playerId: 'psg_archive_rb', name: 'Achraf Hakimi', position: 'RB', shirtNumber: 2, ovr: 88, goals: 5, assists: 9 },
          { playerId: 'psg_archive_cm', name: 'Vitinha', position: 'CM', shirtNumber: 17, ovr: 88, goals: 7, assists: 14 },
          { playerId: 'psg_archive_rw', name: 'Ousmane Dembélé', position: 'RW', shirtNumber: 10, ovr: 89, goals: 24, assists: 11 }
        ],
        summaryNote: 'Mùa giải bản lề rực rỡ trước khi Bảo tàng Danh hiệu PSG chính thức khánh thành.'
      }
    ];
    this.pendingCelebrations = [];
    this.lastAwardedTrophyId = null;
    this.version = 1;
    this._listeners = [];
  }

  onChange(fn) {
    if (typeof fn === 'function') this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter((x) => x !== fn);
    };
  }

  _notifyChanged() {
    this.version++;
    for (let i = 0; i < this._listeners.length; i++) {
      try { this._listeners[i](this); } catch (_) {}
    }
  }

  createTrophyId(competitionId, seasonName) {
    return `trophy_${competitionId}_${normalizeSeasonId(seasonName)}`;
  }

  hasTrophy(competitionId, seasonName = this.state?.season) {
    const tid = this.createTrophyId(competitionId, seasonName);
    return this.trophies.some((t) => t.trophyId === tid || (t.competitionId === competitionId && t.seasonName === seasonName));
  }

  getTrophyById(trophyId) {
    return this.trophies.find((t) => t.trophyId === trophyId) || null;
  }

  getByCategory(category) {
    return this.trophies.filter((t) => t.category === category);
  }

  getTotalCareerTrophies() {
    return this.trophies.length;
  }

  getTotalClubTrophies() {
    return getHeritageTotalCount() + this.trophies.length;
  }

  _buildSquadSnapshot() {
    const squad = this.state?.getPsgSquad ? this.state.getPsgSquad() : [];
    const captainId = this.state?.formationSystem?.captainId || null;
    return squad.map((p) => ({
      playerId: p.id,
      name: p.name,
      position: p.position,
      shirtNumber: p.shirtNumber || 0,
      ovr: p.ovr || 80,
      nationality: p.nationality || 'Pháp',
      apps: p.apps || 0,
      goals: p.goals || 0,
      assists: p.assists || 0,
      isCaptain: p.id === captainId
    }));
  }

  awardTrophy({
    competitionId,
    winner = 'Paris Saint-Germain',
    seasonName = null,
    winningDate = null,
    finalMatchText = '',
    opponentName = '',
    historicalDescription = null,
    silent = false
  } = {}) {
    if (winner !== 'Paris Saint-Germain') {
      return { ok: false, reason: 'not_winner' };
    }
    const meta = COMPETITION_CATALOG[competitionId];
    if (!meta) {
      return { ok: false, reason: 'unknown_competition' };
    }

    const sName = seasonName || this.state?.season || '2026/27';
    const seasonId = normalizeSeasonId(sName);
    const trophyId = this.createTrophyId(competitionId, sName);

    const existing = this.trophies.find((t) => t.trophyId === trophyId || (t.competitionId === competitionId && t.seasonName === sName));
    if (existing) {
      return { ok: false, duplicate: true, trophy: existing };
    }

    const catList = this.getByCategory(meta.category);
    const slotNum = catList.length + 1;
    const roomLabel = meta.category === 'domestic' ? 'Phòng Danh Hiệu Quốc Nội' : 'Phòng Danh Hiệu Quốc Tế';
    const dateStr = winningDate || (this.state?.timeSystem ? this.state.timeSystem.getDateString() : `Tuần ${this.state?.week || 1}`);
    const managerId = this.state?.coach?.staffId || 'stf_hc_01';
    const managerName = this.state?.coach?.name || 'HLV Trưởng PSG';
    const presidentName = this.state?.president?.name || 'Phạm Minh Chiêu';
    const squadSnapshot = this._buildSquadSnapshot();
    const playerIds = squadSnapshot.map((p) => p.playerId);

    const desc = historicalDescription ||
      `Dưới sự dẫn dắt của Chủ tịch ${presidentName} và HLV trưởng ${managerName}, Paris Saint-Germain đã xuất sắc đăng quang ${meta.competitionName} mùa giải ${sName}${finalMatchText ? ` (${finalMatchText})` : ''}. Chiếc cúp thứ ${slotNum} thuộc khu vực ${roomLabel} đã được đưa vào Bảo tàng PSG.`;

    const record = {
      trophyId,
      competitionId: meta.competitionId,
      competitionName: meta.competitionName,
      category: meta.category,
      seasonId,
      seasonName: sName,
      winningDate: dateStr,
      trophyModel: meta.trophyModel,
      displayLocation: `${roomLabel} · Bệ Vinh Danh #${slotNum}`,
      slotIndex: slotNum - 1,
      winningManagerId: managerId,
      winningManagerName: managerName,
      presidentName,
      finalMatchText: finalMatchText || `${meta.competitionName} ${sName}`,
      opponentName: opponentName || '',
      squadSnapshot,
      playerIds,
      historicalDescription: desc,
      isNewHighlight: true,
      awardedAtIso: new Date().toISOString()
    };

    this.trophies.push(record);
    this.lastAwardedTrophyId = trophyId;

    // Ghi nhận vào hồ sơ cầu thủ hiện tại (không ghi đè, chống trùng)
    const labelForPlayer = `${meta.competitionName} (${sName})`;
    if (this.state?.getPsgSquad) {
      this.state.getPsgSquad().forEach((pl) => {
        if (!pl.career) pl.career = {};
        if (!Array.isArray(pl.career.trophies)) pl.career.trophies = [];
        if (!pl.career.trophies.includes(labelForPlayer)) {
          pl.career.trophies.unshift(labelForPlayer);
        }
      });
    }

    // Thưởng uy tín, CĐV & tiền thưởng danh hiệu + nhật ký TV / Báo chí / Điện thoại
    if (this.state && !silent) {
      if (this.state.president) {
        this.state.president.prestige = Math.min(100, (this.state.president.prestige || 85) + meta.prestigeBonus);
        this.state.president.fanSupport = Math.min(100, (this.state.president.fanSupport || 82) + meta.prestigeBonus);
        this.state.president.boardTrust = Math.min(100, (this.state.president.boardTrust || 84) + Math.ceil(meta.prestigeBonus * 0.7));
      }
      if (meta.prizeBonusM > 0 && typeof this.state.addLedger === 'function') {
        this.state.addLedger(`Tiền thưởng vô địch ${meta.competitionName} (${sName})`, meta.prizeBonusM);
      }

      this.state.latestTrophyBroadcast = {
        trophyId,
        title: `PSG VÔ ĐỊCH ${meta.competitionName.toUpperCase()} ${sName}!`,
        subtitle: `HLV ${managerName} · ${dateStr} · Bảo tàng PSG`,
        awardedAt: Date.now()
      };

      if (typeof this.state.pushPhoneMsg === 'function') {
        this.state.pushPhoneMsg(
          'Ban Tổ Chức & Bảo Tàng PSG',
          `🏆 VÔ ĐỊCH ${meta.competitionName.toUpperCase()} (${sName})!`,
          `Chúc mừng Chủ tịch ${presidentName}! Chiếc cúp ${meta.competitionName} đã tự động được khắc tên, lưu đội hình vô địch (${squadSnapshot.length} cầu thủ) và trưng bày tại ${record.displayLocation}.`,
          true
        );
      }

      if (typeof this.state.pushSocial === 'function') {
        this.state.pushSocial(
          'Paris Saint-Germain Official',
          '@PSG_inside',
          `🏆 CHAMPIONS! PSG chính thức vô địch ${meta.competitionName} mùa ${sName}! Chiếc cúp mới đang tỏa sáng tại Bảo tàng CLB! #ICICESTPARIS`,
          'positive'
        );
      }

      try {
        PressNewsSystem.generateTrophyNews?.(this.state, record);
      } catch (_) {}

      this.pendingCelebrations.push(record);
    }

    this._notifyChanged();
    return { ok: true, trophy: record };
  }

  popNextCelebration() {
    if (this.pendingCelebrations.length === 0) return null;
    return this.pendingCelebrations.shift();
  }

  clearHighlight(trophyId) {
    const t = this.getTrophyById(trophyId);
    if (t && t.isNewHighlight) {
      t.isNewHighlight = false;
      this._notifyChanged();
    }
  }

  recordSeasonArchive(archiveData) {
    if (!archiveData || !archiveData.season) return null;
    const seasonId = normalizeSeasonId(archiveData.season);
    const snapshot = Array.isArray(archiveData.squadSnapshot)
      ? archiveData.squadSnapshot
      : this._buildSquadSnapshot();
    const record = {
      seasonId,
      season: archiveData.season,
      presidentName: archiveData.presidentName || this.state?.president?.name || 'Phạm Minh Chiêu',
      coachId: archiveData.coachId || this.state?.coach?.staffId || 'stf_hc_01',
      coachName: archiveData.coachName || this.state?.coach?.name || 'HLV Trưởng PSG',
      ligue1Winner: archiveData.ligue1Winner || 'Paris Saint-Germain',
      uclWinner: archiveData.uclWinner || 'Real Madrid',
      psgRank: archiveData.psgRank || 'Hạng 1',
      points: archiveData.points ?? 0,
      topScorer: archiveData.topScorer || '',
      topAssister: archiveData.topAssister || '',
      revenue: archiveData.revenue || '€800M',
      trophyNames: Array.isArray(archiveData.trophyNames) ? [...archiveData.trophyNames] : [],
      earnedTrophyIds: Array.isArray(archiveData.earnedTrophyIds) ? [...archiveData.earnedTrophyIds] : [],
      notableMatches: Array.isArray(archiveData.notableMatches) ? [...archiveData.notableMatches] : [],
      squadSnapshot: snapshot,
      summaryNote: archiveData.summaryNote || `Hoàn tất mùa giải ${archiveData.season}.`
    };
    const idx = this.seasonArchives.findIndex((a) => a.seasonId === seasonId || a.season === archiveData.season);
    if (idx !== -1) this.seasonArchives[idx] = record;
    else this.seasonArchives.unshift(record);
    this._notifyChanged();
    return record;
  }

  exportState() {
    return {
      trophies: this.trophies,
      seasonArchives: this.seasonArchives,
      lastAwardedTrophyId: this.lastAwardedTrophyId
    };
  }

  importState(data) {
    if (!data) return;
    if (Array.isArray(data.trophies)) {
      // Deduplicate defensively on import
      const seen = new Set();
      this.trophies = data.trophies.filter((t) => {
        if (!t || !t.trophyId || seen.has(t.trophyId)) return false;
        seen.add(t.trophyId);
        return true;
      });
    }
    if (Array.isArray(data.seasonArchives) && data.seasonArchives.length > 0) {
      this.seasonArchives = data.seasonArchives;
    }
    this.lastAwardedTrophyId = data.lastAwardedTrophyId || null;
    this.pendingCelebrations = [];
    this._notifyChanged();
  }
}
