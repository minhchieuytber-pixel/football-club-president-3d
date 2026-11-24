// src/squad/PositionSuitabilityAI.js
// Hệ thống AI Đánh Giá Mức Độ Phù Hợp Vị Trí (Position Suitability Intelligence)
// Tính điểm 0–100 theo 4 nhóm yếu tố (Vị trí & kinh nghiệm 35%, Chỉ số chuyên môn 35%, Phù hợp chiến thuật 20%, Thể trạng & phong độ 10%),
// hỗ trợ Cache theo (playerId, position, formation, tactic, dataVersion), phân tích Top 3 vị trí tối ưu & đánh giá tổng thể toàn đội.

export const CANONICAL_POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'];

export const POSITION_ALIASES = {
  GK: 'GK',
  CB: 'CB',
  LB: 'LB',
  LWB: 'LB',
  RB: 'RB',
  RWB: 'RB',
  DM: 'DM',
  CDM: 'DM',
  CM: 'CM',
  AM: 'AM',
  CAM: 'AM',
  LW: 'LW',
  LM: 'LW',
  RW: 'RW',
  RM: 'RW',
  ST: 'ST',
  CF: 'ST'
};

export const POSITION_DISPLAY_LABEL = {
  GK: 'GK',
  CB: 'CB',
  LB: 'LB',
  RB: 'RB',
  DM: 'CDM',
  CM: 'CM',
  AM: 'CAM',
  LW: 'LW',
  RW: 'RW',
  ST: 'ST'
};

export const POSITION_VI_NAME = {
  GK: 'Thủ môn (GK)',
  CB: 'Trung vệ (CB)',
  LB: 'Hậu vệ trái (LB)',
  RB: 'Hậu vệ phải (RB)',
  DM: 'Tiền vệ phòng ngự (CDM)',
  CM: 'Tiền vệ trung tâm (CM)',
  AM: 'Tiền vệ công (CAM)',
  LW: 'Tiền đạo cánh trái (LW)',
  RW: 'Tiền đạo cánh phải (RW)',
  ST: 'Trung phong cắm (ST)'
};

export function normalizePosition(pos) {
  if (!pos) return 'CM';
  const up = String(pos).trim().toUpperCase();
  return POSITION_ALIASES[up] || (CANONICAL_POSITIONS.includes(up) ? up : 'CM');
}

export function getPositionGroup(pos) {
  const norm = normalizePosition(pos);
  if (norm === 'GK') return 'GK';
  if (norm === 'CB' || norm === 'LB' || norm === 'RB') return 'DEF';
  if (norm === 'DM' || norm === 'CM' || norm === 'AM') return 'MID';
  return 'ATT';
}

export function getSuitabilityTier(score) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s >= 90) {
    return { key: 'excellent', label: 'Rất phù hợp', shortLabel: 'Rất hợp', color: '#4ade80', bg: 'rgba(20, 83, 45, 0.92)', border: '#22c55e' };
  }
  if (s >= 80) {
    return { key: 'good', label: 'Phù hợp', shortLabel: 'Phù hợp', color: '#38bdf8', bg: 'rgba(12, 74, 110, 0.92)', border: '#0ea5e9' };
  }
  if (s >= 65) {
    return { key: 'acceptable', label: 'Có thể đảm nhiệm', shortLabel: 'Đảm nhiệm', color: '#facc15', bg: 'rgba(113, 63, 18, 0.92)', border: '#eab308' };
  }
  if (s >= 50) {
    return { key: 'poor', label: 'Không phù hợp', shortLabel: 'Trái sở trường', color: '#fb923c', bg: 'rgba(124, 45, 18, 0.92)', border: '#f97316' };
  }
  return { key: 'unsuitable', label: 'Rất không phù hợp', shortLabel: 'Rất không hợp', color: '#f87171', bg: 'rgba(127, 29, 29, 0.94)', border: '#ef4444' };
}

// Trọng số 4 yếu tố điều chỉnh nhẹ theo từng tuyến vị trí
const GROUP_WEIGHTS = {
  GK:  { nat: 0.38, attr: 0.36, tact: 0.16, fit: 0.10 },
  DEF: { nat: 0.35, attr: 0.35, tact: 0.20, fit: 0.10 },
  MID: { nat: 0.34, attr: 0.35, tact: 0.21, fit: 0.10 },
  ATT: { nat: 0.35, attr: 0.35, tact: 0.20, fit: 0.10 }
};

// Ma trận độ gần giữa vị trí tự nhiên & vị trí được xếp (không dùng secondaryPositions ở đây)
const POS_PROXIMITY_MATRIX = {
  GK: { GK: 100, CB: 8, LB: 6, RB: 6, DM: 6, CM: 5, AM: 4, LW: 4, RW: 4, ST: 4 },
  CB: { GK: 8, CB: 100, LB: 68, RB: 68, DM: 72, CM: 52, AM: 32, LW: 28, RW: 28, ST: 24 },
  LB: { GK: 6, CB: 70, LB: 100, RB: 78, DM: 62, CM: 56, AM: 42, LW: 68, RW: 50, ST: 32 },
  RB: { GK: 6, CB: 70, LB: 78, RB: 100, DM: 62, CM: 56, AM: 42, LW: 50, RW: 68, ST: 32 },
  DM: { GK: 6, CB: 70, LB: 58, RB: 58, DM: 100, CM: 84, AM: 64, LW: 42, RW: 42, ST: 34 },
  CM: { GK: 5, CB: 50, LB: 54, RB: 54, DM: 82, CM: 100, AM: 82, LW: 58, RW: 58, ST: 46 },
  AM: { GK: 4, CB: 30, LB: 38, RB: 38, DM: 60, CM: 82, AM: 100, LW: 78, RW: 78, ST: 72 },
  LW: { GK: 4, CB: 24, LB: 56, RB: 44, DM: 38, CM: 58, AM: 78, LW: 100, RW: 84, ST: 78 },
  RW: { GK: 4, CB: 24, LB: 44, RB: 56, DM: 38, CM: 58, AM: 78, LW: 84, RW: 100, ST: 78 },
  ST: { GK: 4, CB: 20, LB: 26, RB: 26, DM: 28, CM: 44, AM: 68, LW: 76, RW: 76, ST: 100 }
};

function clampScore(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function normalizeAttrScale(val) {
  // Chuyển đổi chỉ số gốc 40–99 sang thang đánh giá 0–100 mượt mà
  const v = Number(val) || 50;
  return Math.max(0, Math.min(100, ((v - 32) / 62) * 100));
}

export class PositionSuitabilityAI {
  constructor() {
    this._cache = new Map();
    this._dataVersion = 1;
    this._hits = 0;
    this._misses = 0;
  }

  invalidateCache() {
    this._dataVersion++;
    this._cache.clear();
  }

  getCacheStats() {
    return { version: this._dataVersion, size: this._cache.size, hits: this._hits, misses: this._misses };
  }

  _buildPlayerFingerprint(player) {
    const h = player?.health || {};
    return `${player?.ovr || 0}:${player?.form || 0}:${player?.morale || 0}:${h.fitness ?? 88}:${h.fatigue ?? 12}:${player?.injuryDays || 0}:${player?.suspended ? 1 : 0}:${player?.position || ''}`;
  }

  _computeAttributeFit(player, targetPos) {
    const a = player?.attributes || {};
    const gk = a.gk || {};
    const def = a.def || {};
    const mid = a.mid || {};
    const att = a.att || {};
    const tr = a.training || {};

    const num = (v, fb = player?.ovr || 65) => (typeof v === 'number' && !Number.isNaN(v) ? v : fb);
    const foot = String(player?.foot || 'Phải').toLowerCase();

    let raw = 60;
    const keyStrengths = [];
    const keyWeaknesses = [];

    const checkMetric = (label, val) => {
      if (val >= 82) keyStrengths.push(`${label} (${Math.round(val)})`);
      else if (val < 64) keyWeaknesses.push(`${label} thấp (${Math.round(val)})`);
    };

    if (targetPos === 'GK') {
      const reflexes = num(gk.reflexes, 25);
      const handling = num(gk.handling, 25);
      const diving = num(gk.diving, 25);
      const gkPos = num(gk.positioning, 25);
      const kicking = num(gk.kicking, 30);
      raw = reflexes * 0.28 + diving * 0.24 + handling * 0.22 + gkPos * 0.16 + kicking * 0.10;
      checkMetric('Phản xạ', reflexes);
      checkMetric('Bắt dính', handling);
      checkMetric('Đổ người', diving);
    } else if (targetPos === 'CB') {
      const marking = num(def.marking, 40);
      const tackling = num(def.tackling, 40);
      const inter = num(def.interceptions, 40);
      const duels = num(def.duels, 45);
      const aerial = num(att.aerial, 50);
      const pace = num(def.pace, 60);
      raw = marking * 0.24 + tackling * 0.24 + inter * 0.20 + duels * 0.16 + aerial * 0.08 + pace * 0.08;
      checkMetric('Kèm người', marking);
      checkMetric('Tắc bóng', tackling);
      checkMetric('Tranh chấp', duels);
      const defAvg = Math.round((marking + tackling + inter + duels) / 4);
      if (defAvg < 76 && keyWeaknesses.length === 0) {
        keyWeaknesses.push(`Phòng ngự & tranh chấp CB chưa tối ưu (${defAvg})`);
      } else if (aerial < 72 && keyWeaknesses.length === 0) {
        keyWeaknesses.push(`Không chiến trung vệ hạn chế (${Math.round(aerial)})`);
      }
    } else if (targetPos === 'LB' || targetPos === 'RB') {
      const pace = num(def.pace, 60);
      const tackling = num(def.tackling, 50);
      const marking = num(def.marking, 48);
      const stamina = num(mid.stamina, 65);
      const cross = num(att.chanceCreation, 55);
      const pass = num(mid.shortPassing, 60);
      const footBonus = (targetPos === 'LB' && foot.includes('trái')) || (targetPos === 'RB' && foot.includes('phải'))
        ? 4
        : foot.includes('hai') ? 3 : -2;
      raw = pace * 0.23 + tackling * 0.20 + stamina * 0.18 + cross * 0.15 + marking * 0.14 + pass * 0.10 + footBonus;
      checkMetric('Tốc độ', pace);
      checkMetric('Thể lực', stamina);
      checkMetric('Tắc bóng', tackling);
    } else if (targetPos === 'DM') {
      const inter = num(def.interceptions, 50);
      const tackling = num(def.tackling, 50);
      const pass = num(mid.shortPassing, 60);
      const retention = num(mid.ballRetention, 60);
      const stamina = num(mid.stamina, 65);
      const tact = num(tr.tacticalAwareness, player?.tact || 65);
      raw = inter * 0.23 + tackling * 0.21 + pass * 0.20 + retention * 0.14 + stamina * 0.12 + tact * 0.10;
      checkMetric('Cắt bóng', inter);
      checkMetric('Chuyền ngắn', pass);
      checkMetric('Tư duy chiến thuật', tact);
    } else if (targetPos === 'CM') {
      const pass = num(mid.shortPassing, 65);
      const vision = num(mid.vision, 62);
      const ctrl = num(mid.ballControl, 65);
      const stamina = num(mid.stamina, 65);
      const longPass = num(mid.longPassing, 60);
      const tackling = num(def.tackling, 50);
      raw = pass * 0.24 + vision * 0.20 + ctrl * 0.18 + stamina * 0.16 + longPass * 0.12 + tackling * 0.10;
      checkMetric('Chuyền ngắn', pass);
      checkMetric('Tầm nhìn', vision);
      checkMetric('Kiểm soát bóng', ctrl);
    } else if (targetPos === 'AM') {
      const vision = num(mid.vision, 62);
      const create = num(att.chanceCreation, 62);
      const drib = num(att.dribbling, 62);
      const ctrl = num(mid.ballControl, 65);
      const finish = num(att.finishing, 55);
      const longShots = num(tr.longShots, 55);
      raw = vision * 0.24 + create * 0.24 + drib * 0.18 + ctrl * 0.16 + finish * 0.10 + longShots * 0.08;
      checkMetric('Sáng tạo', create);
      checkMetric('Tầm nhìn', vision);
      checkMetric('Rê bóng', drib);
    } else if (targetPos === 'LW' || targetPos === 'RW') {
      const pace = num(att.pace, num(def.pace, 65));
      const drib = num(att.dribbling, 62);
      const create = num(att.chanceCreation, 60);
      const finish = num(att.finishing, 58);
      const agility = num(tr.agility, 65);
      const stamina = num(mid.stamina, 65);
      // Hỗ trợ cả cánh thuận chân lẫn tiền đạo cánh đảo chân (inverted winger)
      const invBonus = (targetPos === 'RW' && foot.includes('trái')) || (targetPos === 'LW' && foot.includes('phải')) ? 2.5 : 1.5;
      raw = pace * 0.24 + drib * 0.24 + create * 0.18 + finish * 0.16 + agility * 0.10 + stamina * 0.08 + invBonus;
      checkMetric('Tốc độ', pace);
      checkMetric('Rê bóng', drib);
      checkMetric('Tạo cơ hội', create);
    } else {
      // ST
      const finish = num(att.finishing, 50);
      const pos = num(att.positioning, 50);
      const composure = num(tr.composure, 60);
      const shotPow = num(tr.shotPower, 58);
      const pace = num(att.pace, num(def.pace, 62));
      const aerial = num(att.aerial, 55);
      raw = finish * 0.28 + pos * 0.24 + composure * 0.14 + shotPow * 0.12 + pace * 0.12 + aerial * 0.10;
      checkMetric('Dứt điểm', finish);
      checkMetric('Chọn vị trí', pos);
      checkMetric('Bình tĩnh', composure);
    }

    return {
      score: clampScore(normalizeAttrScale(raw), 5, 100),
      rawAvg: Math.round(raw),
      strengths: keyStrengths.slice(0, 3),
      weaknesses: keyWeaknesses.slice(0, 3)
    };
  }

  _computeNaturalScore(player, targetPos) {
    const natPos = normalizePosition(player?.position);
    if (natPos === targetPos) {
      return { score: 100, relation: 'natural' };
    }
    const secList = Array.isArray(player?.secondaryPositions)
      ? player.secondaryPositions.map(normalizePosition)
      : [];
    if (secList.includes(targetPos)) {
      return { score: 82, relation: 'secondary' };
    }
    const base = POS_PROXIMITY_MATRIX[natPos]?.[targetPos] ?? 40;
    return { score: base, relation: base >= 65 ? 'adjacent' : 'out_of_position' };
  }

  _computeTacticalFit(player, targetPos, context = {}) {
    const formation = context.formation || '4-3-3';
    const tactic = String(context.tacticName || context.tacticalStyle || 'Kiểm soát bóng').toLowerCase();
    const tr = player?.attributes?.training || {};
    const mid = player?.attributes?.mid || {};
    const def = player?.attributes?.def || {};
    const att = player?.attributes?.att || {};

    let base = 74 + Math.min(20, Math.max(-12, ((player?.tact || tr.tacticalAwareness || 75) - 72) * 0.8));

    // Phù hợp triết lý kiểm soát bóng (PSG)
    if (tactic.includes('kiểm soát') || tactic.includes('possession')) {
      const techScore = ((mid.shortPassing || 65) + (mid.ballControl || 65)) / 2;
      base += (techScore - 72) * 0.35;
    } else if (tactic.includes('pressing') || tactic.includes('tổng lực')) {
      const workRate = ((mid.stamina || 68) + (def.pace || 68)) / 2;
      base += (workRate - 72) * 0.35;
    } else if (tactic.includes('phản công')) {
      const speedMix = ((att.pace || def.pace || 68) + (mid.longPassing || 65)) / 2;
      base += (speedMix - 72) * 0.35;
    }

    // Đặc thù sơ đồ 3 hậu vệ: hậu vệ biên đá wing-back cần thể lực + tấn công cánh cao hơn
    if ((formation === '3-5-2' || formation === '3-4-3') && (targetPos === 'LB' || targetPos === 'RB')) {
      const wb = ((mid.stamina || 68) + (att.chanceCreation || 65)) / 2;
      base += (wb - 74) * 0.3;
    }
    if (formation === '4-2-3-1' && targetPos === 'AM') {
      base += ((att.chanceCreation || 68) - 72) * 0.25;
    }

    const natPos = normalizePosition(player?.position);
    if ((natPos === 'GK') !== (targetPos === 'GK')) {
      base = Math.min(25, base * 0.28);
    }
    return clampScore(base, 10, 100);
  }

  _computeFitnessReadiness(player) {
    if (!player) return 0;
    if ((player.injuryDays || 0) > 0) return 15;
    if (player.suspended) return 20;
    const h = player.health || {};
    const fitness = typeof h.fitness === 'number' ? h.fitness : 88;
    const fatigue = typeof h.fatigue === 'number' ? h.fatigue : 12;
    const form = typeof player.form === 'number' ? player.form : 78;
    const morale = typeof player.morale === 'number' ? player.morale : 80;
    const raw = fitness * 0.38 + (100 - fatigue) * 0.22 + form * 0.22 + morale * 0.18;
    return clampScore(raw, 25, 100);
  }

  evaluatePlayerAtPosition(player, targetPosInput, context = {}) {
    if (!player) {
      return {
        playerId: null,
        targetPosition: normalizePosition(targetPosInput),
        displayPosition: POSITION_DISPLAY_LABEL[normalizePosition(targetPosInput)] || 'CM',
        score: 0,
        tier: getSuitabilityTier(0),
        relation: 'empty',
        factors: { natural: 0, attributes: 0, tactical: 0, fitness: 0 },
        strengths: [],
        weaknesses: ['Chưa bố trí cầu thủ'],
        explanation: 'Vị trí trống.'
      };
    }

    const targetPos = normalizePosition(targetPosInput);
    const formation = context.formation || '4-3-3';
    const tacticKey = context.tacticName || context.tacticalStyle || 'default';
    const fp = this._buildPlayerFingerprint(player);
    const cacheKey = `${player.id}::${targetPos}::${formation}::${tacticKey}::${this._dataVersion}::${fp}`;

    const cached = this._cache.get(cacheKey);
    if (cached) {
      this._hits++;
      return cached;
    }
    this._misses++;

    const group = getPositionGroup(targetPos);
    const w = GROUP_WEIGHTS[group] || GROUP_WEIGHTS.MID;

    const natEval = this._computeNaturalScore(player, targetPos);
    const attrEval = this._computeAttributeFit(player, targetPos);
    const tactScore = this._computeTacticalFit(player, targetPos, context);
    const fitScore = this._computeFitnessReadiness(player);

    let total =
      natEval.score * w.nat +
      attrEval.score * w.attr +
      tactScore * w.tact +
      fitScore * w.fit;

    const natPos = normalizePosition(player.position);

    // Hiệu chỉnh hợp lý theo bóng đá thực tế để phân biệt rõ 5 bậc
    if (natPos === targetPos && (player.injuryDays || 0) <= 0 && !player.suspended) {
      // Vị trí sở trường: cầu thủ PSG fit ổn định nằm trong nhóm 90–100 (tỷ lệ theo OVR + phong độ)
      const ovrScale = 90 + Math.max(0, Math.min(9, ((player.ovr || 80) - 72) * 0.42)) + (fitScore >= 85 ? 1 : 0);
      total = Math.max(total, ovrScale);
      if ((player.ovr || 80) < 70) total = Math.min(total, 89);
    } else if (natEval.relation === 'secondary') {
      // Vị trí phụ: dao động 72–87 (Phù hợp / Có thể đảm nhiệm)
      total = Math.max(70, Math.min(88, total));
    } else if (natPos === 'GK' && targetPos !== 'GK') {
      // Thủ môn đá cầu thủ sân -> Rất không phù hợp (< 40)
      total = Math.min(36, total);
    } else if (natPos !== 'GK' && targetPos === 'GK') {
      // Cầu thủ sân bắt gôn -> Rất không phù hợp (< 40)
      total = Math.min(38, total);
    } else if (natEval.relation === 'out_of_position') {
      // Đá trái tuyến rõ rệt (VD: ST đá CB/DM hoặc CM đá CB)
      if (natEval.score <= 35) total = Math.min(54, total);
      else if (natEval.score <= 55) total = Math.min(64, total);
    }

    if ((player.injuryDays || 0) > 0 || player.suspended) {
      total = Math.min(total, 38);
    }

    const score = clampScore(total, 0, 100);
    const tier = getSuitabilityTier(score);

    const weaknesses = [...attrEval.weaknesses];
    if (natPos === 'GK' && targetPos !== 'GK') {
      weaknesses.unshift('Thủ môn không có kỹ năng di chuyển, dứt điểm và tranh chấp trên sân');
    } else if (natPos !== 'GK' && targetPos === 'GK') {
      weaknesses.unshift('Cầu thủ sân thiếu phản xạ, đổ người và bắt dính thủ môn');
    } else if (natEval.relation === 'out_of_position') {
      weaknesses.unshift(`Trái sở trường (${POSITION_DISPLAY_LABEL[natPos]} → ${POSITION_DISPLAY_LABEL[targetPos]})`);
    }
    if ((player.injuryDays || 0) > 0) weaknesses.unshift(`Đang chấn thương (${player.injuryDays} ngày)`);
    if (player.suspended) weaknesses.unshift('Đang bị treo giò');

    let explanation = '';
    if (natPos === targetPos) {
      explanation = `${player.name} thi đấu đúng sở trường ${POSITION_DISPLAY_LABEL[targetPos]}, phát huy tối đa bộ chỉ số chuyên môn (${attrEval.rawAvg}).`;
    } else if (natEval.relation === 'secondary') {
      explanation = `${POSITION_DISPLAY_LABEL[targetPos]} là vị trí phụ quen thuộc của ${player.name} (sở trường ${POSITION_DISPLAY_LABEL[natPos]}).`;
    } else if (natEval.relation === 'adjacent') {
      explanation = `${player.name} có thể xoay tua đảm nhiệm ${POSITION_DISPLAY_LABEL[targetPos]}, nhưng hiệu quả nhất vẫn là ${POSITION_DISPLAY_LABEL[natPos]}.`;
    } else {
      explanation = `Bố trí ${player.name} (${POSITION_DISPLAY_LABEL[natPos]}) ở vị trí ${POSITION_DISPLAY_LABEL[targetPos]} làm suy giảm hiệu quả thi đấu rõ rệt.`;
    }

    const res = {
      playerId: player.id,
      naturalPosition: natPos,
      targetPosition: targetPos,
      displayPosition: POSITION_DISPLAY_LABEL[targetPos] || targetPos,
      score,
      tier,
      relation: natEval.relation,
      factors: {
        natural: Math.round(natEval.score),
        attributes: Math.round(attrEval.score),
        tactical: Math.round(tactScore),
        fitness: Math.round(fitScore)
      },
      strengths: attrEval.strengths.length ? attrEval.strengths : [`OVR ${player.ovr}`],
      weaknesses: weaknesses.slice(0, 3),
      explanation
    };

    if (this._cache.size > 2400) {
      // Giới hạn kích thước cache tránh phình RAM trên Safari iOS
      this._cache.clear();
    }
    this._cache.set(cacheKey, res);
    return res;
  }

  getTop3Positions(player, context = {}, currentSlotPos = null) {
    if (!player) return null;
    const allScores = CANONICAL_POSITIONS.map((pos) => this.evaluatePlayerAtPosition(player, pos, context));
    allScores.sort((a, b) => b.score - a.score);
    const top3 = allScores.slice(0, 3);
    const best = top3[0];
    const currentEval = currentSlotPos ? this.evaluatePlayerAtPosition(player, currentSlotPos, context) : best;

    let recommendationText = `${player.name} tối ưu nhất tại ${best.displayPosition} (${best.score}/100 · ${best.tier.label}).`;
    if (currentSlotPos && normalizePosition(currentSlotPos) !== best.targetPosition && best.score - currentEval.score >= 4) {
      recommendationText = `Khuyến nghị: ${best.displayPosition} phù hợp hơn (${best.score}/100 so với ${currentEval.score}/100 ở ${currentEval.displayPosition}).`;
    }

    return {
      playerId: player.id,
      bestPosition: best.targetPosition,
      bestDisplayPosition: best.displayPosition,
      bestScore: best.score,
      currentEval,
      top3,
      strengths: best.strengths,
      weaknessesAtCurrent: currentEval.weaknesses,
      recommendationText
    };
  }

  evaluateSquad(formationData, context = {}) {
    const slots = formationData?.slots || [];
    const starters = formationData?.starters || [];
    const totalSlots = Math.max(11, slots.length || 11);

    const evals = starters.map((s) => ({
      slot: s,
      eval: this.evaluatePlayerAtPosition(s.player, s.position, context)
    }));

    const filledCount = evals.length;
    const emptySlotsCount = Math.max(0, totalSlots - filledCount);

    let suitSum = 0;
    let naturalCount = 0;
    let secondaryCount = 0;
    let outOfPosCount = 0;

    const lineBuckets = { GK: [], DEF: [], MID: [], ATT: [] };
    const weakPositions = [];

    evals.forEach(({ slot, eval: ev }) => {
      suitSum += ev.score;
      if (ev.relation === 'natural') naturalCount++;
      else if (ev.relation === 'secondary' || ev.relation === 'adjacent') secondaryCount++;
      else outOfPosCount++;

      const grp = getPositionGroup(slot.position);
      const effectivePerf = (slot.player?.ovr || 75) * (0.52 + (ev.score / 100) * 0.48);
      lineBuckets[grp].push(effectivePerf);

      if (ev.score < 78) {
        weakPositions.push({
          slotIndex: slot.slotIndex,
          playerId: slot.playerId,
          playerName: slot.fullName,
          assignedPos: ev.displayPosition,
          naturalPos: POSITION_DISPLAY_LABEL[ev.naturalPosition] || ev.naturalPosition,
          score: ev.score,
          tier: ev.tier,
          bestPos: this.getTop3Positions(slot.player, context, slot.position)?.bestDisplayPosition
        });
      }
    });

    // Ghi nhận vị trí trống vào danh sách cần bổ sung
    slots.forEach((sl) => {
      if (!sl.playerId) {
        weakPositions.push({
          slotIndex: sl.slotIndex,
          playerId: null,
          playerName: 'Vị trí trống',
          assignedPos: POSITION_DISPLAY_LABEL[normalizePosition(sl.role)] || sl.role,
          naturalPos: '-',
          score: 0,
          tier: getSuitabilityTier(0),
          bestPos: POSITION_DISPLAY_LABEL[normalizePosition(sl.role)] || sl.role
        });
      }
    });

    const avgSuitability = filledCount > 0 ? Math.round(suitSum / totalSlots) : 0;
    const avgArr = (arr, fb = 0) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : fb);

    const gkRating = avgArr(lineBuckets.GK, 40);
    const defRating = avgArr(lineBuckets.DEF, 50);
    const midRating = avgArr(lineBuckets.MID, 50);
    const attRating = avgArr(lineBuckets.ATT, 50);

    // Độ cân bằng giữa 4 tuyến + có đủ GK, DEF, MID, ATT không
    const lineSpread = Math.max(gkRating, defRating, midRating, attRating) - Math.min(gkRating, defRating, midRating, attRating);
    const missingLinePenalty = (!lineBuckets.GK.length ? 22 : 0) + (!lineBuckets.DEF.length ? 18 : 0) + (!lineBuckets.MID.length ? 14 : 0) + (!lineBuckets.ATT.length ? 14 : 0);
    const balanceScore = clampScore(96 - lineSpread * 0.9 - missingLinePenalty - emptySlotsCount * 8, 15, 100);

    // Đánh giá mức độ khớp chiến thuật HLV trưởng
    const coachStyle = String(context.coachTacticalStyle || '').toLowerCase();
    const formName = formationData?.formation || '4-3-3';
    let coachBonus = 84;
    if (coachStyle.includes(formName)) coachBonus += 12;
    else if (coachStyle.includes('4-3-3') && (formName === '4-2-3-1' || formName === '3-4-3')) coachBonus += 5;
    const coachTacticFit = clampScore(coachBonus - outOfPosCount * 5 - emptySlotsCount * 7, 25, 100);

    const rawTeamStrength = ((gkRating * 0.14) + (defRating * 0.28) + (midRating * 0.29) + (attRating * 0.29));
    const overallScore = clampScore(
      avgSuitability * 0.42 + rawTeamStrength * 0.36 + balanceScore * 0.12 + coachTacticFit * 0.10 - emptySlotsCount * 5,
      10, 99
    );

    const tier = getSuitabilityTier(overallScore);

    let summaryText = '';
    if (emptySlotsCount > 0) {
      summaryText = `Cảnh báo: Đội hình đang thiếu ${emptySlotsCount} vị trí chưa có người. Kéo cầu thủ dự bị vào ô trống để hoàn tất 11 người.`;
    } else if (outOfPosCount === 0 && avgSuitability >= 90) {
      summaryText = `Đội hình ${formName} vận hành tối ưu: ${naturalCount}/11 cầu thủ đá đúng sở trường, ba tuyến cân bằng (${attRating}/${midRating}/${defRating}) và rất khớp triết lý HLV.`;
    } else if (outOfPosCount >= 2) {
      summaryText = `Cảnh báo AI: Có ${outOfPosCount} cầu thủ đang đá trái sở trường làm giảm độ phù hợp trung bình xuống ${avgSuitability}/100. Nên hoán đổi theo gợi ý AI.`;
    } else {
      summaryText = `Đội hình ${formName} đạt độ gắn kết ổn định (${avgSuitability}/100), ${naturalCount} cầu thủ sở trường và ${secondaryCount} cầu thủ kiêm nhiệm hiệu quả.`;
    }

    return {
      formation: formName,
      overallScore,
      tier,
      avgSuitability,
      filledCount,
      emptySlotsCount,
      naturalCount,
      secondaryCount,
      outOfPosCount,
      ratings: {
        gk: gkRating,
        defense: defRating,
        midfield: midRating,
        attack: attRating
      },
      balanceScore,
      coachTacticFit,
      weakPositions,
      summaryText
    };
  }

  // Tìm đội hình tối ưu 11 cầu thủ cho bộ slot cho trước (chống trùng playerId tuyệt đối)
  computeOptimalXI(squad, targetSlots, context = {}) {
    const avail = (squad || []).filter((p) => (p.injuryDays || 0) <= 0 && !p.suspended);
    const usedIds = new Set();
    const slotChoices = new Array(targetSlots.length).fill(null);

    // Ưu tiên chọn GK và các vị trí chuyên biệt nhất trước (GK -> CB -> ST -> LB/RB -> DM/LW/RW -> CM/AM)
    const priorityOrder = targetSlots
      .map((slot, idx) => ({ slot, idx, prio: slot.role === 'GK' ? 0 : slot.role === 'CB' ? 1 : slot.role === 'ST' ? 2 : 3 }))
      .sort((a, b) => a.prio - b.prio);

    priorityOrder.forEach(({ slot, idx }) => {
      let bestPlayer = null;
      let bestScore = -1;
      for (const p of avail) {
        if (usedIds.has(p.id)) continue;
        const ev = this.evaluatePlayerAtPosition(p, slot.role, context);
        const composite = ev.score * 0.72 + (p.ovr || 75) * 0.28;
        if (composite > bestScore) {
          bestScore = composite;
          bestPlayer = p;
        }
      }
      if (bestPlayer) {
        usedIds.add(bestPlayer.id);
        slotChoices[idx] = bestPlayer.id;
      }
    });

    return slotChoices;
  }

  // So sánh toàn bộ sơ đồ hiện có trên nhân sự PSG để gợi ý sơ đồ tối ưu nhất
  compareFormations(squad, presets, currentFormation, context = {}) {
    const results = Object.entries(presets).map(([name, slots]) => {
      const optimalIds = this.computeOptimalXI(squad, slots, { ...context, formation: name });
      let suitSum = 0;
      let ovrSum = 0;
      let count = 0;
      optimalIds.forEach((pid, idx) => {
        const p = squad.find((x) => x.id === pid);
        if (!p) return;
        const ev = this.evaluatePlayerAtPosition(p, slots[idx].role, { ...context, formation: name });
        suitSum += ev.score;
        ovrSum += p.ovr;
        count++;
      });
      const avgSuit = count ? Math.round(suitSum / count) : 0;
      const avgOvr = count ? Math.round(ovrSum / count) : 0;
      const score = clampScore(avgSuit * 0.6 + avgOvr * 0.4, 0, 100);
      return { formation: name, avgSuit, avgOvr, score, isCurrent: name === currentFormation };
    });
    results.sort((a, b) => b.score - a.score);
    return results;
  }
}
