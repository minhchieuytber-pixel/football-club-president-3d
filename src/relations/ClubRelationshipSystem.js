// src/relations/ClubRelationshipSystem.js
// Hệ thống Quản lý Quan hệ Nội bộ CLB Chuyên sâu (Single Source of Truth theo playerId)
// Kết nối sự kiện thực tế: Cầu thủ - HLV Trưởng - Chủ tịch - Báo chí - Chuyển nhượng - Uy tín đa chiều.

import { PositionSuitabilityAI, normalizePosition } from '../squad/PositionSuitabilityAI.js';
import { PressNewsSystem } from '../media/PressNewsSystem.js';

const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(v)));

function hashSeed(str) {
  let h = 2166136261 >>> 0;
  const s = String(str || 'psg');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6D2B79F5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const RELATIONSHIP_METRIC_DEFS = [
  { key: 'trustCoach', label: 'Tin tưởng HLV trưởng' },
  { key: 'respectCoach', label: 'Tôn trọng HLV trưởng' },
  { key: 'satisfactionRole', label: 'Hài lòng vai trò hiện tại' },
  { key: 'satisfactionPlaytime', label: 'Hài lòng thời lượng thi đấu' },
  { key: 'satisfactionTactics', label: 'Hài lòng chiến thuật' },
  { key: 'clubAttachment', label: 'Gắn bó với PSG' },
  { key: 'trustChairman', label: 'Tin tưởng Chủ tịch' },
  { key: 'satisfactionBoard', label: 'Hài lòng Ban lãnh đạo' },
  { key: 'teamIntegration', label: 'Hòa nhập với đồng đội' },
  { key: 'satisfactionDevelopment', label: 'Hài lòng kế hoạch phát triển' }
];

export const PLAYER_MOODS = [
  'Rất hài lòng',
  'Hài lòng',
  'Bình thường',
  'Thất vọng',
  'Bất mãn',
  'Tức giận',
  'Mất niềm tin',
  'Muốn ra đi'
];

export const PLAYER_TRAITS = {
  professional: { key: 'professional', label: 'Chuyên nghiệp', benchMult: 0.65, subMult: 0.6, criticismMult: 0.7, stayBonus: 8 },
  ambitious:    { key: 'ambitious', label: 'Tham vọng', benchMult: 1.35, subMult: 1.25, criticismMult: 1.15, stayBonus: -6 },
  patient:      { key: 'patient', label: 'Kiên nhẫn', benchMult: 0.55, subMult: 0.65, criticismMult: 0.75, stayBonus: 10 },
  sensitive:    { key: 'sensitive', label: 'Nhạy cảm', benchMult: 1.3, subMult: 1.4, criticismMult: 1.45, stayBonus: -5 },
  loyal:        { key: 'loyal', label: 'Trung thành', benchMult: 0.75, subMult: 0.8, criticismMult: 0.85, stayBonus: 14 },
  competitive:  { key: 'competitive', label: 'Cạnh tranh', benchMult: 1.25, subMult: 1.2, criticismMult: 1.0, stayBonus: 0 },
  leader:       { key: 'leader', label: 'Lãnh đạo', benchMult: 0.9, subMult: 0.95, criticismMult: 0.9, stayBonus: 6 },
  strong_ego:   { key: 'strong_ego', label: 'Cá tính mạnh', benchMult: 1.4, subMult: 1.45, criticismMult: 1.35, stayBonus: -8 },
  pragmatic:    { key: 'pragmatic', label: 'Thực dụng', benchMult: 1.0, subMult: 0.9, criticismMult: 0.85, stayBonus: -2 },
  driven:       { key: 'driven', label: 'Cầu tiến', benchMult: 1.15, subMult: 1.05, criticismMult: 0.8, stayBonus: 4 }
};

export const DIRECTIVE_STATUS = {
  PENDING: 'Đang chờ phản hồi',
  RECEIVED: 'Đã tiếp nhận',
  CONSIDERING: 'Đang cân nhắc',
  AGREED: 'Đồng ý',
  PARTIAL: 'Đồng ý một phần',
  REJECTED: 'Từ chối',
  ALTERNATIVE: 'Đề xuất phương án khác',
  COMPLETED: 'Đã thực hiện',
  OBSOLETE: 'Không còn phù hợp'
};

export const DIRECTIVE_CATEGORIES = [
  {
    key: 'usage',
    label: '1. Đề nghị sử dụng / Tăng cơ hội thi đấu',
    options: [
      { key: 'prioritize_starter', label: 'Ưu tiên đá chính nhiều hơn', impact: 'starter' },
      { key: 'give_bench_minutes', label: 'Cho vào sân từ ghế dự bị', impact: 'sub' },
      { key: 'test_cup_small', label: 'Thử nghiệm ở trận gặp đối thủ yếu / cúp quốc gia', impact: 'cup' },
      { key: 'restore_natural_pos', label: 'Đưa trở lại vị trí sở trường', impact: 'natural_pos' },
      { key: 'increase_recent_minutes', label: 'Tăng thời lượng thi đấu trong vài trận tới', impact: 'minutes' },
      { key: 'consider_young_talent', label: 'Cân nhắc trao cơ hội cho tài năng trẻ', impact: 'youth' }
    ]
  },
  {
    key: 'fitness',
    label: '2. Đề nghị xoay tua / Quản lý thể lực',
    options: [
      { key: 'rest_star', label: 'Cho cầu thủ trụ cột nghỉ ngơi', impact: 'rest' },
      { key: 'reduce_minutes', label: 'Giảm số phút thi đấu để tránh chấn thương', impact: 'reduce_minutes' },
      { key: 'protect_tired', label: 'Bảo vệ cầu thủ có dấu hiệu quá tải', impact: 'protect' },
      { key: 'rotate_congested', label: 'Xoay tua ở giai đoạn lịch dày', impact: 'rotate' }
    ]
  },
  {
    key: 'development',
    label: '3. Đề nghị định hướng phát triển',
    options: [
      { key: 'adapt_new_player', label: 'Tạo điều kiện hòa nhập cho tân binh', impact: 'adapt' },
      { key: 'play_youth_form', label: 'Cho cầu thủ trẻ đang có phong độ tốt ra sân', impact: 'youth_form' },
      { key: 'help_recover_form', label: 'Giúp cầu thủ lấy lại phong độ', impact: 'recover_form' },
      { key: 'keep_key_morale', label: 'Giữ tinh thần cho cầu thủ quan trọng sắp hết HĐ / có dấu hiệu bất mãn', impact: 'morale_protect' }
    ]
  }
];

export const COMMITMENT_TYPES = {
  give_playtime: 'Đảm bảo thời lượng thi đấu trong các trận tới',
  start_opportunities: 'Trao thêm suất đá chính',
  cup_opportunities: 'Tạo cơ hội ở Cúp Quốc Gia / xoay tua',
  natural_position: 'Sắp xếp thi đấu đúng vị trí sở trường',
  contract_extension: 'Xúc tiến đề nghị gia hạn hợp đồng xứng đáng',
  role_upgrade: 'Nâng cấp vai trò trong kế hoạch đội một',
  rest_workload: 'Giảm tải và cho nghỉ ngơi hợp lý',
  development_plan: 'Xây dựng lộ trình phát triển cá nhân cùng BHL'
};

export const COMMITMENT_STATUS = {
  PENDING: 'Chưa thực hiện',
  IN_PROGRESS: 'Đang thực hiện',
  COMPLETED: 'Đã hoàn thành',
  BROKEN: 'Thất hứa / Hết hạn',
  OBSOLETE: 'Không còn phù hợp'
};

export const CONFLICT_LEVELS = {
  1: { level: 1, label: 'Bất đồng nhẹ', color: '#facc15' },
  2: { level: 2, label: 'Không hài lòng', color: '#fb923c' },
  3: { level: 3, label: 'Mất niềm tin', color: '#f97316' },
  4: { level: 4, label: 'Mâu thuẫn nghiêm trọng', color: '#ef4444' },
  5: { level: 5, label: 'Khủng hoảng nội bộ', color: '#dc2626' }
};

export const LEAK_STAGES = {
  1: 'Giai đoạn 1 · Tin đồn nhỏ',
  2: 'Giai đoạn 2 · Nguồn tin nội bộ',
  3: 'Giai đoạn 3 · Báo chí xác nhận có bất đồng',
  4: 'Giai đoạn 4 · Khủng hoảng truyền thông nội bộ',
  5: 'Giai đoạn 5 · Công khai đòi ra đi'
};

export const PRESS_LEAK_RESPONSES = [
  { key: 'silence', label: 'Giữ im lặng', desc: 'Không bình luận thêm để tránh thổi bùng tranh cãi.' },
  { key: 'deny', label: 'Phủ nhận rò rỉ', desc: 'Bác bỏ thông tin bất đồng trước truyền thông.' },
  { key: 'confirm_handling', label: 'Xác nhận & đang xử lý', desc: 'Thừa nhận có trao đổi nội bộ và Ban lãnh đạo đang giải quyết.' },
  { key: 'press_briefing', label: 'Tổ chức họp báo ổn định', desc: 'Chủ tịch trực tiếp xuất hiện bảo vệ tập thể trước báo giới.' },
  { key: 'reassure_fans', label: 'Trấn an cổ động viên', desc: 'Gửi thông điệp cam kết đoàn kết và bảo vệ bản sắc PSG.' }
];

export const PRIVATE_MEETING_TACTICS = [
  { key: 'persuade_stay', label: 'Thuyết phục ở lại vì tham vọng PSG', desc: 'Nhấn mạnh tầm quan trọng của cầu thủ trong dự án vô địch Champions League.' },
  { key: 'commit_playtime', label: 'Cam kết cơ hội thi đấu cụ thể', desc: 'Hứa thúc đẩy thời lượng ra sân trong 3–4 tuần tới (tạo Cam kết chính thức).' },
  { key: 'listen_needs', label: 'Lắng nghe thẳng thắn nguyện vọng', desc: 'Tạo không gian cởi mở để cầu thủ bộc bạch nguyên nhân bất mãn.' },
  { key: 'propose_roadmap', label: 'Đề nghị lộ trình mới & vai trò dài hạn', desc: 'Đưa ra kế hoạch vị trí sở trường, phát triển hoặc cải thiện đãi ngộ.' },
  { key: 'respect_decision', label: 'Tôn trọng quyết định chuyên nghiệp', desc: 'Giữ thái độ tôn trọng nếu cầu thủ thực sự muốn tìm bến đỗ mới phù hợp.' }
];

export class ClubRelationshipSystem {
  constructor(state) {
    this.state = state;
    this.suitabilityAI = new PositionSuitabilityAI();
    this.reset();
  }

  reset() {
    this.playerRelations = {};
    this.coachRelations = {};
    this.directives = [];
    this.directiveHistory = [];
    this.commitments = [];
    this.conflicts = [];
    this.pressLeaks = [];
    this.privateMeetingSessions = {};
    this.chairmanCoachTrust = 84;
    this.recentInterferenceWeeks = [];
    this._matchCounter = 0;

    // Khởi tạo hồ sơ cho toàn bộ cầu thủ PSG & Học viện
    const all = this.state?.getAllPlayers ? this.state.getAllPlayers() : [];
    all.forEach((p) => {
      if (p.club === 'Paris Saint-Germain' || p.squad) {
        this.ensurePlayerProfile(p.id);
      }
    });
  }

  _dateStr() {
    return this.state?.timeSystem
      ? this.state.timeSystem.getDateString()
      : `Tuần ${this.state?.week || 1}`;
  }

  _week() {
    return this.state?.week || 1;
  }

  // ==================== 1. PHONG CÁCH & TÂM LÝ HLV TRƯỞNG ====================

  getCoachStyleProfile(coachStaff = null) {
    const hc = coachStaff || this.state?.managerSystem?.getActiveByRole?.('head_coach') || this.state?.coach;
    const coachId = hc?.staffId || 'hc_interim';
    if (this.coachRelations[coachId]?.style) {
      return {
        ...this.coachRelations[coachId].style,
        coachId,
        coachName: hc?.name || 'HLV Tạm quyền',
        chairmanRelation: this.coachRelations[coachId].chairmanRelation ?? this.chairmanCoachTrust
      };
    }

    const rng = hashSeed(`${coachId}_${hc?.name || 'coach'}`);
    const youthBase = hc?.youthDev ?? 80;
    const tactBase = hc?.ratings?.tactics ?? hc?.tactics ?? 85;
    const roomBase = hc?.dressingRoom ?? 82;
    const pers = String(hc?.personality || 'Thẳng thắn');

    const style = {
      experiencePriority: clamp(68 + (100 - youthBase) * 0.45 + rng() * 14, 42, 96),
      youthTrust: clamp(youthBase - 4 + rng() * 12, 35, 96),
      formPriority: clamp(72 + rng() * 20, 50, 96),
      tacticsStrictness: clamp(tactBase - 3 + (pers === 'Thẳng thắn' ? 6 : 0), 45, 98),
      rotationTendency: clamp(62 + (pers === 'Nhiệt tình' ? 10 : 0) + (rng() - 0.3) * 20, 38, 92),
      starLoyalty: clamp(66 + rng() * 20, 45, 95),
      disciplineFocus: clamp(74 + (pers === 'Cẩn thận' || pers === 'Thẳng thắn' ? 8 : 0) + rng() * 10, 50, 97),
      dressingRoomControl: clamp(roomBase + rng() * 8, 45, 97),
      stubbornness: clamp(pers === 'Thẳng thắn' ? 76 + rng() * 16 : 52 + rng() * 24, 30, 95),
      mediationSkill: clamp(roomBase - 2 + (pers === 'Hòa đồng' ? 12 : 0), 40, 96),
      adaptability: clamp(64 + rng() * 24, 40, 95)
    };

    this.coachRelations[coachId] = {
      coachId,
      coachName: hc?.name || 'HLV Tạm quyền',
      style,
      chairmanRelation: this.chairmanCoachTrust,
      interferenceStreak: 0,
      lastEvaluatedWeek: 0
    };

    return {
      ...style,
      coachId,
      coachName: hc?.name || 'HLV Tạm quyền',
      chairmanRelation: this.chairmanCoachTrust
    };
  }

  _adjustChairmanCoachRelation(delta, reason = '') {
    const st = this.getCoachStyleProfile();
    const rec = this.coachRelations[st.coachId];
    const next = clamp((rec?.chairmanRelation ?? this.chairmanCoachTrust) + delta, 15, 100);
    if (rec) rec.chairmanRelation = next;
    this.chairmanCoachTrust = next;
    this.state?.reputationSystem?.applyDelta(
      { coachTrust: delta > 0 ? Math.min(4, Math.ceil(delta / 2)) : Math.max(-5, Math.floor(delta / 2)) },
      reason || 'Quan hệ Chủ tịch – HLV trưởng'
    );
    return next;
  }

  // ==================== 2. HỒ SƠ QUAN HỆ & TÍNH CÁCH CẦU THỦ ====================

  _generateTraitsForPlayer(p) {
    const rng = hashSeed(`${p.id}_${p.name}_${p.position}`);
    const pool = [];
    if ((p.professionalism || 75) >= 82) pool.push('professional');
    if ((p.pot || 80) >= 86 && p.age <= 24) pool.push('driven');
    if (p.ovr >= 85 || (p.pot || 80) >= 88) pool.push('ambitious');
    if (p.age >= 28 && (p.mentality || 78) >= 82) pool.push('leader');
    if (p.club === 'Paris Saint-Germain' && ((p.psychology?.loyalty || p.loyalty || 75) >= 80 || p.squad)) {
      pool.push('loyal');
    }
    const candidates = Object.keys(PLAYER_TRAITS);
    while (pool.length < 3) {
      const pick = candidates[Math.floor(rng() * candidates.length)];
      if (!pool.includes(pick)) pool.push(pick);
    }
    return pool.slice(0, 3);
  }

  ensurePlayerProfile(playerId) {
    if (!playerId) return null;
    if (this.playerRelations[playerId]) {
      return this.playerRelations[playerId];
    }
    const p = this.state?.getPlayerById?.(playerId);
    if (!p) return null;

    const rng = hashSeed(`rel_${p.id}_${p.name}`);
    const baseCoach = clamp(p.psychology?.coachRelation ?? (74 + rng() * 18), 35, 96);
    const baseSat = clamp(p.psychology?.satisfaction ?? p.satisfaction ?? (74 + rng() * 18), 35, 96);
    const baseMorale = clamp(p.psychology?.morale ?? p.morale ?? (76 + rng() * 16), 35, 96);
    const baseLoyalty = clamp(p.psychology?.loyalty ?? p.loyalty ?? (p.squad ? 86 : 74 + rng() * 16), 35, 98);

    const profile = {
      playerId: p.id,
      coachId: this.state?.coach?.staffId || 'stf_hc_01',
      traits: this._generateTraitsForPlayer(p),
      metrics: {
        trustCoach: baseCoach,
        respectCoach: clamp(baseCoach + 2, 35, 98),
        satisfactionRole: baseSat,
        satisfactionPlaytime: clamp(baseSat + (p.ovr >= 84 ? 2 : -2), 30, 96),
        satisfactionTactics: clamp(baseCoach + (rng() - 0.5) * 10, 35, 96),
        clubAttachment: baseLoyalty,
        trustChairman: clamp(82 + (rng() - 0.5) * 10, 40, 96),
        satisfactionBoard: clamp(80 + (rng() - 0.5) * 10, 40, 96),
        teamIntegration: clamp(p.psychology?.teammateRelation ?? (p.justJoined ? 66 : 80 + rng() * 14), 35, 98),
        satisfactionDevelopment: clamp(p.age <= 22 ? 78 + rng() * 12 : 76 + rng() * 14, 35, 96)
      },
      mood: 'Hài lòng',
      wantsToLeave: false,
      transferRequestSent: false,
      benchStreak: 0,
      earlySubStreak: 0,
      outOfPosStreak: 0,
      overworkStreak: 0,
      weeksWithoutFirstTeamApps: 0,
      recentMinutes: [], // [{ week, matchId, minutes, starter, subbedOffEarly, outOfPos, rating }]
      brokenPromisesCount: 0,
      fulfilledPromisesCount: 0,
      eventLog: [],
      formerCoachConflicts: []
    };

    this.playerRelations[p.id] = profile;
    this.recomputeMoodAndSyncPlayer(p.id);
    return profile;
  }

  _getTraitModifiers(profile) {
    const traits = profile?.traits || [];
    let benchMult = 1;
    let subMult = 1;
    let criticismMult = 1;
    let stayBonus = 0;
    traits.forEach((tk) => {
      const def = PLAYER_TRAITS[tk];
      if (!def) return;
      benchMult *= def.benchMult;
      subMult *= def.subMult;
      criticismMult *= def.criticismMult;
      stayBonus += def.stayBonus;
    });
    return {
      benchMult: Math.max(0.45, Math.min(1.75, benchMult)),
      subMult: Math.max(0.45, Math.min(1.75, subMult)),
      criticismMult: Math.max(0.5, Math.min(1.8, criticismMult)),
      stayBonus
    };
  }

  _logPlayerEvent(profile, type, message, impact = '') {
    if (!profile) return;
    profile.eventLog.unshift({
      id: `rel_evt_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      date: this._dateStr(),
      week: this._week(),
      type,
      message,
      impact
    });
    if (profile.eventLog.length > 36) profile.eventLog.length = 36;
  }

  getActiveConflict(playerId) {
    return this.conflicts.find((c) => c.playerId === playerId && c.status === 'active') || null;
  }

  recomputeMoodAndSyncPlayer(playerId) {
    const profile = this.playerRelations[playerId];
    const p = this.state?.getPlayerById?.(playerId);
    if (!profile || !p) return null;

    const m = profile.metrics;
    const activeConflict = this.getActiveConflict(playerId);
    const conflictLvl = activeConflict?.level || 0;
    const avgPlay = (m.satisfactionPlaytime + m.satisfactionRole + m.satisfactionTactics) / 3;
    const avgCoach = (m.trustCoach + m.respectCoach) / 2;
    const avgClub = (m.clubAttachment + m.trustChairman + m.satisfactionBoard) / 3;
    const composite = Math.round(avgPlay * 0.42 + avgCoach * 0.32 + avgClub * 0.26);

    let mood = 'Bình thường';
    if (profile.wantsToLeave || conflictLvl >= 5 || (composite <= 32 && m.clubAttachment <= 46)) {
      mood = 'Muốn ra đi';
    } else if (m.trustCoach <= 35 && m.trustChairman <= 42) {
      mood = 'Mất niềm tin';
    } else if (conflictLvl >= 4 || composite <= 40) {
      mood = 'Tức giận';
    } else if (conflictLvl >= 2 || composite <= 52 || m.satisfactionPlaytime <= 42) {
      mood = 'Bất mãn';
    } else if (conflictLvl === 1 || composite <= 63) {
      mood = 'Thất vọng';
    } else if (composite >= 84 && conflictLvl === 0) {
      mood = 'Rất hài lòng';
    } else if (composite >= 72) {
      mood = 'Hài lòng';
    }

    profile.mood = mood;

    // Đồng bộ tâm lý & tinh thần sang bản ghi PlayerDatabase (TUYỆT ĐỐI không thay đổi ovr/pot/chỉ số gốc!)
    p.morale = clamp(Math.round(composite * 0.7 + m.teamIntegration * 0.3), 18, 100);
    p.satisfaction = clamp(Math.round(avgPlay), 15, 100);
    p.loyalty = clamp(m.clubAttachment, 15, 100);
    if (!p.psychology) p.psychology = {};
    p.psychology.morale = p.morale;
    p.psychology.satisfaction = p.satisfaction;
    p.psychology.loyalty = p.loyalty;
    p.psychology.coachRelation = clamp(Math.round(avgCoach), 10, 100);
    p.psychology.teammateRelation = clamp(m.teamIntegration, 15, 100);
    if (mood === 'Muốn ra đi') {
      p.psychology.futureDesire = 'Đang cân nhắc nghiêm túc việc tìm bến đỗ mới do bất mãn kéo dài.';
    } else if (mood === 'Bất mãn' || mood === 'Tức giận' || mood === 'Mất niềm tin') {
      p.psychology.futureDesire = 'Đòi hỏi ban huấn luyện và Chủ tịch có giải pháp rõ ràng về cơ hội thi đấu.';
    } else if (mood === 'Rất hài lòng') {
      p.psychology.futureDesire = 'Rất hạnh phúc tại Paris Saint-Germain và muốn cống hiến lâu dài.';
    }
    return profile;
  }

  _applyMetricDeltas(playerId, deltas = {}, reason = '') {
    const profile = this.ensurePlayerProfile(playerId);
    if (!profile) return null;
    Object.entries(deltas).forEach(([k, val]) => {
      if (profile.metrics[k] !== undefined && Number(val)) {
        profile.metrics[k] = clamp(profile.metrics[k] + Number(val), 5, 100);
      }
    });
    if (reason) {
      const summary = Object.entries(deltas)
        .filter(([, v]) => v !== 0)
        .map(([k, v]) => `${k}:${v > 0 ? `+${Math.round(v)}` : Math.round(v)}`)
        .join(', ');
      this._logPlayerEvent(profile, 'metric_shift', reason, summary);
    }
    return this.recomputeMoodAndSyncPlayer(playerId);
  }

  // ==================== 3. ĐỊNH HƯỚNG SỬ DỤNG CẦU THỦ & AI HLV TRƯỞNG ====================

  submitCoachDirective({ playerId, categoryKey, optionKey, note = '', priority = 'normal' }) {
    const p = this.state?.getPlayerById?.(playerId);
    if (!p) return { ok: false, error: 'Không tìm thấy cầu thủ mục tiêu.' };
    if (p.club !== 'Paris Saint-Germain') {
      return { ok: false, error: 'Chỉ có thể gửi định hướng cho cầu thủ thuộc biên chế Paris Saint-Germain.' };
    }

    const cat = DIRECTIVE_CATEGORIES.find((c) => c.key === categoryKey) || DIRECTIVE_CATEGORIES[0];
    const opt = cat.options.find((o) => o.key === optionKey) || cat.options[0];
    const hc = this.state?.managerSystem?.getActiveByRole?.('head_coach') || this.state?.coach;
    const profile = this.ensurePlayerProfile(p.id);

    const directive = {
      id: `dir_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      playerId: p.id,
      playerName: p.name,
      playerPosition: p.position,
      playerOvr: p.ovr,
      playerAge: p.age,
      coachId: hc?.staffId || 'hc_interim',
      coachName: hc?.name || 'HLV trưởng PSG',
      categoryKey: cat.key,
      categoryLabel: cat.label,
      optionKey: opt.key,
      optionLabel: opt.label,
      impactType: opt.impact,
      note: String(note || '').trim(),
      priority, // 'normal' | 'high' | 'urgent'
      createdWeek: this._week(),
      createdDate: this._dateStr(),
      expiresWeek: this._week() + (priority === 'urgent' ? 3 : 4),
      status: DIRECTIVE_STATUS.RECEIVED,
      coachDecision: null, // 'agreed' | 'partial' | 'rejected' | 'alternative'
      coachReply: '',
      coachReason: '',
      alternativePlan: null,
      reevaluated: false,
      executedMatches: 0,
      targetMatches: opt.impact === 'cup' || opt.impact === 'rest' ? 1 : 2
    };

    // Ghi nhận tần suất can thiệp của Chủ tịch
    this.recentInterferenceWeeks.push(this._week());
    this.recentInterferenceWeeks = this.recentInterferenceWeeks.filter((w) => this._week() - w <= 3);

    // Đánh giá tự chủ của HLV trưởng
    const evalRes = this.evaluateDirective(directive, profile);
    directive.status = evalRes.status;
    directive.coachDecision = evalRes.decision;
    directive.coachReply = evalRes.reply;
    directive.coachReason = evalRes.reason;
    directive.alternativePlan = evalRes.alternativePlan || null;

    this.directives.unshift(directive);
    if (this.directives.length > 40) this.directives.length = 40;

    // Cập nhật quan hệ Chủ tịch - HLV
    if (evalRes.interferencePenalty < 0) {
      this._adjustChairmanCoachRelation(
        evalRes.interferencePenalty,
        `Can thiệp chuyên môn quá mức với HLV ${directive.coachName} (${p.name})`
      );
    } else if (evalRes.decision === 'agreed' && evalRes.coachRespectBoost > 0) {
      this._adjustChairmanCoachRelation(
        evalRes.coachRespectBoost,
        `Phối hợp định hướng hợp lý với HLV ${directive.coachName} về ${p.name}`
      );
    }

    // Nếu cầu thủ biết Chủ tịch có nỗ lực bảo vệ/định hướng (nhất là khi có cam kết hoặc bất mãn)
    if (evalRes.decision === 'agreed' || evalRes.decision === 'partial') {
      this._applyMetricDeltas(p.id, { trustChairman: +3, satisfactionBoard: +2 }, `Chủ tịch định hướng HLV về ${opt.label}`);
    }

    this.state?.eventBus?.emit('COACH_DIRECTIVE_EVALUATED', {
      directiveId: directive.id,
      playerId: p.id,
      playerName: p.name,
      decision: directive.coachDecision,
      status: directive.status
    }, `dir_${directive.id}`);

    return { ok: true, directive, evalRes };
  }

  evaluateDirective(directive, profile = null) {
    const p = this.state?.getPlayerById?.(directive.playerId);
    const style = this.getCoachStyleProfile();
    const nextFx = this.state?.getCurrentWeekFixture?.() || this.state?.getNextFixture?.();
    const isBigMatch = !!(nextFx && ((nextFx.importance || 1) >= 1.2 || nextFx.comp === 'UEFA Champions League' || nextFx.isFinal));
    const isCupOrWeakOpp = !!(nextFx && (nextFx.comp === 'Coupe de France' || nextFx.comp === 'Giao hữu' || (nextFx.importance || 1) <= 1.0));
    const oppName = nextFx ? (nextFx.home === 'Paris Saint-Germain' ? nextFx.away : nextFx.home) : '';
    const oppClub = this.state?.clubs?.find((c) => c.name === oppName);
    const oppRating = oppClub?.rating || 78;

    const fitness = p?.health?.fitness ?? 86;
    const fatigue = p?.health?.fatigue ?? 18;
    const form = p?.form ?? 76;
    const injured = (p?.injuryDays || 0) > 0;
    const mood = profile?.mood || 'Hài lòng';
    const squad = this.state?.getPsgSquad?.() || [];
    const startersSet = new Set(this.state?.formationSystem?.starterIds || []);
    const samePosBest = squad
      .filter((x) => x.id !== p.id && x.position === p.position && (x.injuryDays || 0) <= 0)
      .sort((a, b) => b.ovr - a.ovr)[0];

    const recentDirectivesCount = this.recentInterferenceWeeks.length;
    const overInterfering = recentDirectivesCount >= 4;
    let interferencePenalty = overInterfering ? -4 : (recentDirectivesCount >= 3 ? -2 : 0);

    // Chấn thương -> HLV chắc chắn từ chối ra sân, nhưng đồng ý nghỉ/phục hồi
    if (injured && ['starter', 'sub', 'cup', 'minutes', 'youth', 'youth_form', 'natural_pos'].includes(directive.impactType)) {
      return {
        decision: 'rejected',
        status: DIRECTIVE_STATUS.REJECTED,
        reason: `${p.name} đang chấn thương (${p.injuryDays} ngày), không thể đăng ký thi đấu.`,
        reply: `Thưa Chủ tịch, bộ phận Y tế xác nhận ${p.name} còn ${p.injuryDays} ngày hồi phục. Tôi không thể mạo hiểm sử dụng cậu ấy lúc này.`,
        interferencePenalty: 0,
        coachRespectBoost: 0
      };
    }

    // 1. Nhóm quản lý thể lực / nghỉ ngơi trụ cột
    if (['rest', 'reduce_minutes', 'protect', 'rotate'].includes(directive.impactType)) {
      if (isBigMatch && p.ovr >= 85 && fatigue < 62 && directive.impactType === 'rest') {
        if (style.stubbornness >= 68 || style.starLoyalty >= 75) {
          return {
            decision: 'alternative',
            status: DIRECTIVE_STATUS.ALTERNATIVE,
            reason: `Trận gặp ${oppName || 'đối thủ lớn'} (${nextFx?.comp}) có tính chất quyết định, cần trụ cột tốt nhất.`,
            reply: `Thưa Chủ tịch, trận gặp ${oppName || 'sắp tới'} rất quan trọng cho mục tiêu mùa giải. Tôi đề xuất vẫn để ${p.name} đá chính nhưng rút ra nghỉ sau phút 60 nếu thế trận an toàn, hoặc cho nghỉ hoàn toàn ở vòng Ligue 1 kế tiếp.`,
            alternativePlan: { type: 'reduce_minutes', targetMinutes: 60 },
            interferencePenalty,
            coachRespectBoost: +1
          };
        }
      }
      if (fatigue >= 40 || fitness <= 82 || isCupOrWeakOpp || directive.priority === 'urgent') {
        return {
          decision: 'agreed',
          status: DIRECTIVE_STATUS.AGREED,
          reason: `Hợp lý với trạng thái thể lực (Fitness ${fitness}% · Mệt mỏi ${fatigue}%).`,
          reply: `Tôi đồng tình với Chủ tịch. ${p.name} cần được điều tiết tải vận động (thể lực hiện ${fitness}%) để giữ trạng thái tốt nhất cho chặng đường dài.`,
          interferencePenalty: 0,
          coachRespectBoost: +2
        };
      }
      return {
        decision: 'partial',
        status: DIRECTIVE_STATUS.PARTIAL,
        reason: `Cầu thủ hiện vẫn sung sức (Fitness ${fitness}%), chỉ cần giảm nhẹ phút thi đấu cuối trận.`,
        reply: `Thể lực của ${p.name} đang ở mức ổn (${fitness}%). Tôi sẽ chỉ rút cậu ấy ra sớm trong hiệp 2 thay vì gạch tên hoàn toàn khỏi đội hình.`,
        alternativePlan: { type: 'reduce_minutes', targetMinutes: 68 },
        interferencePenalty,
        coachRespectBoost: +1
      };
    }

    // 2. Nhóm đưa về vị trí sở trường
    if (directive.impactType === 'natural_pos') {
      const slotIdx = (this.state?.formationSystem?.starterIds || []).indexOf(p.id);
      const curSlot = slotIdx >= 0 ? this.state?.formationSystem?.customSlots?.[slotIdx] : null;
      const fit = curSlot ? this.suitabilityAI.evaluatePlayerAtPosition(p, curSlot.role, this.state.formationSystem.getContext()) : null;
      if (fit && fit.score >= 92) {
        return {
          decision: 'partial',
          status: DIRECTIVE_STATUS.PARTIAL,
          reason: `${p.name} hiện đã thi đấu đúng khu vực tương thích cao (${fit.score}%).`,
          reply: `Thực tế ${p.name} đang đạt độ phù hợp ${fit.score}% trong sơ đồ ${this.state.formationSystem.formation}. Tuy nhiên tôi sẽ tinh chỉnh vai trò gần vị trí ${p.position} hơn.`,
          interferencePenalty,
          coachRespectBoost: 0
        };
      }
      return {
        decision: 'agreed',
        status: DIRECTIVE_STATUS.AGREED,
        reason: `Đảm bảo ${p.name} phát huy đúng sở trường ${p.position} thay vì phải vá chỗ trống.`,
        reply: `Tôi tiếp thu góp ý này. Tôi sẽ điều chỉnh sắp xếp để ${p.name} trở lại đúng vị trí sở trường ${p.position} ở trận tới.`,
        interferencePenalty: 0,
        coachRespectBoost: +2
      };
    }

    // 3. Nhóm cầu thủ trẻ / tăng cơ hội ra sân / đá chính
    const scoreFactors =
      (form - 72) * 1.1 +
      (p.ovr - 78) * 1.4 +
      (fitness - 74) * 0.45 +
      (p.age <= 21 ? (style.youthTrust - 72) * 0.55 : 0) +
      (isBigMatch ? -14 : 6) +
      (oppRating <= 78 ? 10 : -4) +
      (overInterfering ? -14 : 0) +
      (directive.priority === 'urgent' ? 6 : directive.priority === 'high' ? 3 : 0) +
      (style.chairmanRelation - 75) * 0.35 -
      (style.stubbornness - 65) * 0.3;

    // Nếu yêu cầu đá chính ngay nhưng có trụ cột cùng vị trí OVR cao hơn hẳn & trận lớn -> HLV phản biện / từ chối hoặc đề xuất xoay tua!
    if (directive.impactType === 'starter') {
      if ((form < 66 || fitness < 66) && style.formPriority >= 72) {
        return {
          decision: 'rejected',
          status: DIRECTIVE_STATUS.REJECTED,
          reason: `Phong độ (${form}/99) hoặc thể lực (${fitness}%) của ${p.name} chưa đáp ứng suất đá chính ngay.`,
          reply: `Thưa Chủ tịch, tôi tôn trọng định hướng của ngài nhưng ở góc độ chuyên môn, ${p.name} mới đạt phong độ ${form}/99 (thể lực ${fitness}%). Đưa cậu ấy đá chính lúc này sẽ ảnh hưởng trực tiếp tới kết quả tập thể.`,
          interferencePenalty: overInterfering ? -5 : -2,
          coachRespectBoost: 0
        };
      }
      if (samePosBest && samePosBest.ovr - p.ovr >= 6 && isBigMatch) {
        return {
          decision: 'alternative',
          status: DIRECTIVE_STATUS.ALTERNATIVE,
          reason: `${samePosBest.name} (OVR ${samePosBest.ovr}) đang vượt trội cho trận cầu lớn gặp ${oppName}.`,
          reply: `Trước đối thủ mạnh như ${oppName}, tôi cần ${samePosBest.name} (OVR ${samePosBest.ovr}) đá chính. Tôi đề xuất phương án khác: trao cho ${p.name} 25–30 phút từ ghế dự bị hoặc đá chính ở trận Cúp/Ligue 1 kế tiếp.`,
          alternativePlan: { type: 'sub', targetMinutes: 28 },
          interferencePenalty,
          coachRespectBoost: +1
        };
      }
      if (overInterfering && style.stubbornness >= 65 && scoreFactors < 18) {
        return {
          decision: 'rejected',
          status: DIRECTIVE_STATUS.REJECTED,
          reason: `HLV cảm thấy Chủ tịch can thiệp quá sâu vào quyền lựa chọn đội hình xuất phát (${recentDirectivesCount} chỉ đạo liên tiếp).`,
          reply: `Thưa Chủ tịch, ngài đã gửi ${recentDirectivesCount} yêu cầu xếp đội hình gần đây. Tôi cần giữ quyền tự chủ chuyên môn trong phòng thay đồ để đảm bảo công bằng cho các cầu thủ khác.`,
          interferencePenalty: -6,
          coachRespectBoost: 0
        };
      }
      if (scoreFactors >= 8) {
        return {
          decision: 'agreed',
          status: DIRECTIVE_STATUS.AGREED,
          reason: `${p.name} đạt điểm chuyên môn, phong độ (${form}) và bối cảnh phù hợp để đá chính.`,
          reply: `Tôi đồng ý với Chủ tịch. ${p.name} đang tập luyện tích cực (phong độ ${form}, thể lực ${fitness}%) và xứng đáng có cơ hội đá chính trong kế hoạch tới.`,
          interferencePenalty: 0,
          coachRespectBoost: +2
        };
      }
      return {
        decision: 'partial',
        status: DIRECTIVE_STATUS.PARTIAL,
        reason: `Chưa đảm bảo đá chính ngay lập tức, nhưng có thể trao suất vào sân từ ghế dự bị.`,
        reply: `Tôi chưa thể cam kết suất đá chính ngay cho ${p.name}, nhưng tôi đồng ý một phần: cậu ấy sẽ nằm trong kế hoạch ưu tiên vào sân hiệp 2 (20–35 phút) ở trận tới.`,
        alternativePlan: { type: 'sub', targetMinutes: 25 },
        interferencePenalty,
        coachRespectBoost: +1
      };
    }

    // Nhóm dự bị / cúp / cầu thủ trẻ / hòa nhập / lấy lại phong độ
    if (['sub', 'cup', 'youth', 'youth_form', 'minutes', 'adapt', 'recover_form', 'morale_protect'].includes(directive.impactType)) {
      if (overInterfering && style.stubbornness >= 72 && p.ovr < 75 && isBigMatch) {
        return {
          decision: 'rejected',
          status: DIRECTIVE_STATUS.REJECTED,
          reason: `Áp lực thành tích trận lớn khiến HLV từ chối mạo hiểm thay đổi nhân sự.`,
          reply: `Trận gặp ${oppName} không cho phép thử nghiệm mạo hiểm với ${p.name} (OVR ${p.ovr}). Tôi xin phép giữ bộ khung ổn định nhất lúc này.`,
          interferencePenalty: -4,
          coachRespectBoost: 0
        };
      }
      if (p.age <= 21 && style.youthTrust < 55 && isBigMatch) {
        return {
          decision: 'alternative',
          status: DIRECTIVE_STATUS.ALTERNATIVE,
          reason: `HLV ưu tiên kinh nghiệm ở trận lớn; đề xuất dời cơ hội cầu thủ trẻ sang trận dễ hơn.`,
          reply: `Tôi đánh giá cao tiềm năng của ${p.name}, nhưng phong cách của tôi là bảo vệ cầu thủ trẻ trước áp lực quá lớn. Hãy để cậu ấy đá chính ở trận Cúp Quốc Gia hoặc gặp đội nửa dưới BXH.`,
          alternativePlan: { type: 'cup', targetMinutes: 65 },
          interferencePenalty: 0,
          coachRespectBoost: +1
        };
      }
      if (scoreFactors >= -4 || directive.impactType === 'cup' || directive.impactType === 'morale_protect' || mood === 'Bất mãn' || mood === 'Thất vọng') {
        return {
          decision: 'agreed',
          status: DIRECTIVE_STATUS.AGREED,
          reason: `Phù hợp định hướng xoay tua, phát triển nhân sự và giữ tinh thần phòng thay đồ.`,
          reply: `Tôi hoàn toàn nhất trí với Chủ tịch. Ban huấn luyện sẽ đưa ${p.name} vào kế hoạch ${directive.optionLabel.toLowerCase()} ngay trong chu kỳ thi đấu tới.`,
          interferencePenalty: 0,
          coachRespectBoost: +2
        };
      }
      return {
        decision: 'partial',
        status: DIRECTIVE_STATUS.PARTIAL,
        reason: `Đồng ý thử nghiệm từng bước qua ghế dự bị tùy diễn biến trận đấu.`,
        reply: `Tôi đồng ý một phần: nếu thế trận thuận lợi trong hiệp 2, tôi sẽ ưu tiên tung ${p.name} vào sân để tích lũy nhịp thi đấu.`,
        alternativePlan: { type: 'sub', targetMinutes: 20 },
        interferencePenalty: 0,
        coachRespectBoost: +1
      };
    }

    return {
      decision: 'agreed',
      status: DIRECTIVE_STATUS.AGREED,
      reason: 'Phù hợp định hướng chung của CLB.',
      reply: `Đã tiếp nhận định hướng về ${p.name} và đưa vào kế hoạch chuẩn bị của Ban huấn luyện.`,
      interferencePenalty: 0,
      coachRespectBoost: +1
    };
  }

  // HLV tự đánh giá lại các định hướng đang cân nhắc/từ chối khi bối cảnh thay đổi (vd: chấn thương trụ cột, phong độ tăng)
  reevaluateDirectivesOnContextChange(reasonLabel = 'Thay đổi nhân sự đội hình') {
    const updated = [];
    this.directives.forEach((d) => {
      if (![DIRECTIVE_STATUS.REJECTED, DIRECTIVE_STATUS.CONSIDERING, DIRECTIVE_STATUS.PARTIAL].includes(d.status)) return;
      if (d.reevaluated || this._week() > d.expiresWeek) return;
      const p = this.state?.getPlayerById?.(d.playerId);
      if (!p || p.club !== 'Paris Saint-Germain' || (p.injuryDays || 0) > 0) return;
      const prof = this.ensurePlayerProfile(p.id);
      const nextEval = this.evaluateDirective(d, prof);
      if (nextEval.decision === 'agreed' && d.coachDecision !== 'agreed') {
        d.status = DIRECTIVE_STATUS.AGREED;
        d.coachDecision = 'agreed';
        d.reevaluated = true;
        d.coachReply = `[Cập nhật sau ${reasonLabel}] ${nextEval.reply}`;
        d.coachReason = `${reasonLabel} -> HLV chủ động điều chỉnh kế hoạch cho ${p.name}.`;
        updated.push(d);
      }
    });
    if (updated.length > 0) {
      this.state?.pushPhoneMsg?.(
        `${this.state?.coach?.name || 'HLV Trưởng PSG'}`,
        `🔄 HLV đánh giá lại định hướng: ${updated.map((u) => u.playerName).join(', ')}`,
        `Do ${reasonLabel.toLowerCase()}, HLV trưởng đã chủ động chuyển sang ĐỒNG Ý phương án sử dụng ${updated.map((u) => u.playerName).join(', ')} ở trận tới.`,
        false
      );
    }
    return updated;
  }

  // Lấy quyết định chuyên môn hiện hành của HLV để CoachMatchAI & MatchdaySystem tự chủ áp dụng
  getCoachMatchSelectionOverrides() {
    const restPlayerIds = new Set();
    const reduceMinutesIds = new Set();
    const boostStarterIds = new Set();
    const subOpportunityIds = new Set();
    const naturalPosIds = new Set();

    const nextFx = this.state?.getCurrentWeekFixture?.() || this.state?.getNextFixture?.();
    const isCupOrWeak = !!(nextFx && (nextFx.comp === 'Coupe de France' || nextFx.comp === 'Giao hữu' || (nextFx.importance || 1) <= 1.0));

    this.directives.forEach((d) => {
      if (d.status !== DIRECTIVE_STATUS.AGREED && d.status !== DIRECTIVE_STATUS.PARTIAL && d.status !== DIRECTIVE_STATUS.ALTERNATIVE) return;
      if (this._week() > d.expiresWeek) return;
      const p = this.state?.getPlayerById?.(d.playerId);
      if (!p || p.club !== 'Paris Saint-Germain' || (p.injuryDays || 0) > 0) return;

      if (d.coachDecision === 'agreed') {
        if (d.impactType === 'rest' || d.impactType === 'protect') restPlayerIds.add(d.playerId);
        else if (d.impactType === 'reduce_minutes' || d.impactType === 'rotate') reduceMinutesIds.add(d.playerId);
        else if (d.impactType === 'natural_pos') naturalPosIds.add(d.playerId);
        else if (['starter', 'youth_form', 'morale_protect'].includes(d.impactType)) boostStarterIds.add(d.playerId);
        else if (d.impactType === 'cup') {
          if (isCupOrWeak) boostStarterIds.add(d.playerId);
          else subOpportunityIds.add(d.playerId);
        } else {
          subOpportunityIds.add(d.playerId);
        }
      } else if (d.coachDecision === 'partial' || d.coachDecision === 'alternative') {
        const altType = d.alternativePlan?.type;
        if (altType === 'reduce_minutes') reduceMinutesIds.add(d.playerId);
        else if (altType === 'cup' && isCupOrWeak) boostStarterIds.add(d.playerId);
        else subOpportunityIds.add(d.playerId);
      }
    });

    return { restPlayerIds, reduceMinutesIds, boostStarterIds, subOpportunityIds, naturalPosIds };
  }

  _archiveDirective(d, finalStatus, reason = '') {
    d.status = finalStatus;
    if (reason) d.coachReason = reason;
    d.closedWeek = this._week();
    d.closedDate = this._dateStr();
    this.directiveHistory.unshift({ ...d });
    if (this.directiveHistory.length > 50) this.directiveHistory.length = 50;
    this.directives = this.directives.filter((x) => x.id !== d.id);
  }

  // ==================== 4. HỆ THỐNG CAM KẾT / LỜI HỨA CỦA CHỦ TỊCH ====================

  createCommitment({ playerId, type, content, deadlineWeeks = 3, source = 'private_meeting', sendDirectiveToCoach = false }) {
    const p = this.state?.getPlayerById?.(playerId);
    if (!p) return null;
    const typeLabel = COMMITMENT_TYPES[type] || COMMITMENT_TYPES.give_playtime;
    // Tránh trùng cam kết đang mở cùng loại cho cùng cầu thủ
    const existing = this.commitments.find((c) =>
      c.playerId === playerId &&
      c.type === type &&
      (c.status === COMMITMENT_STATUS.PENDING || c.status === COMMITMENT_STATUS.IN_PROGRESS)
    );
    if (existing) return existing;

    const cm = {
      id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      playerId: p.id,
      playerName: p.name,
      type,
      typeLabel,
      content: content || typeLabel,
      responsibleParty: this.state?.coach?.name || 'HLV trưởng PSG',
      source,
      commitDate: this._dateStr(),
      commitWeek: this._week(),
      deadlineWeek: this._week() + Math.max(1, deadlineWeeks),
      status: COMMITMENT_STATUS.PENDING, // Tách biệt: Chủ tịch hứa != HLV đồng ý != Đã thực hiện!
      coachAgreed: false,
      coachExecuted: false,
      progressCount: 0,
      targetCount: type === 'contract_extension' || type === 'rest_workload' ? 1 : 2,
      outcomeNote: ''
    };
    this.commitments.unshift(cm);

    // Nếu Chủ tịch đồng thời gửi định hướng cho HLV, kiểm tra xem HLV có đồng ý hay không (NHƯNG KHÔNG đánh dấu đã hoàn thành!)
    if (sendDirectiveToCoach) {
      const mapToDirective = {
        give_playtime: { categoryKey: 'usage', optionKey: 'increase_recent_minutes' },
        start_opportunities: { categoryKey: 'usage', optionKey: 'prioritize_starter' },
        cup_opportunities: { categoryKey: 'usage', optionKey: 'test_cup_small' },
        natural_position: { categoryKey: 'usage', optionKey: 'restore_natural_pos' },
        rest_workload: { categoryKey: 'fitness', optionKey: 'rest_star' },
        development_plan: { categoryKey: 'development', optionKey: 'help_recover_form' }
      }[type];
      if (mapToDirective) {
        const res = this.submitCoachDirective({
          playerId: p.id,
          categoryKey: mapToDirective.categoryKey,
          optionKey: mapToDirective.optionKey,
          note: `Thực hiện cam kết với ${p.name}`,
          priority: 'high'
        });
        if (res.ok && (res.directive.coachDecision === 'agreed' || res.directive.coachDecision === 'partial')) {
          cm.coachAgreed = true;
          cm.status = COMMITMENT_STATUS.IN_PROGRESS;
          cm.outcomeNote = `HLV ${res.directive.coachName} đã tiếp nhận kế hoạch (${res.directive.status}), đang chờ thực thi trên sân.`;
        } else if (res.ok) {
          cm.outcomeNote = `Cảnh báo: HLV ${res.directive.coachName} chưa đồng thuận (${res.directive.status}: ${res.directive.coachReason}). Chủ tịch cần làm việc thêm hoặc thương lượng lại!`;
        }
      }
    }

    const profile = this.ensurePlayerProfile(p.id);
    this._logPlayerEvent(profile, 'commitment_created', `Chủ tịch cam kết: ${cm.content}`, `Hạn Tuần ${cm.deadlineWeek}`);
    return cm;
  }

  _fulfillCommitment(cm, note) {
    if (!cm || cm.status === COMMITMENT_STATUS.COMPLETED || cm.status === COMMITMENT_STATUS.BROKEN) return;
    cm.status = COMMITMENT_STATUS.COMPLETED;
    cm.coachExecuted = true;
    cm.outcomeNote = note || 'Đã thực hiện đúng cam kết với cầu thủ.';
    cm.completedDate = this._dateStr();

    const prof = this.ensurePlayerProfile(cm.playerId);
    if (prof) {
      prof.fulfilledPromisesCount = (prof.fulfilledPromisesCount || 0) + 1;
      prof.wantsToLeave = false;
      this._applyMetricDeltas(cm.playerId, {
        trustChairman: +11,
        satisfactionBoard: +9,
        clubAttachment: +7,
        satisfactionRole: +8,
        satisfactionPlaytime: +9
      }, `Chủ tịch giữ đúng lời hứa: ${cm.content}`);
    }
    this._deescalateConflict(cm.playerId, 2, `Cam kết "${cm.content}" đã được thực thi trên thực tế.`);
    this.state?.reputationSystem?.applyDelta(
      { playerTrust: +4, governanceSkill: +3 },
      `Giữ đúng cam kết với ${cm.playerName}`,
      `cmt_done_${cm.id}`
    );
  }

  _breakCommitment(cm, note) {
    if (!cm || cm.status === COMMITMENT_STATUS.COMPLETED || cm.status === COMMITMENT_STATUS.BROKEN) return;
    cm.status = COMMITMENT_STATUS.BROKEN;
    cm.outcomeNote = note || `Quá hạn Tuần ${cm.deadlineWeek} nhưng cam kết chưa được thực hiện trên thực tế.`;
    cm.completedDate = this._dateStr();

    const prof = this.ensurePlayerProfile(cm.playerId);
    const mods = this._getTraitModifiers(prof);
    if (prof) {
      prof.brokenPromisesCount = (prof.brokenPromisesCount || 0) + 1;
      this._applyMetricDeltas(cm.playerId, {
        trustChairman: Math.round(-18 * mods.criticismMult),
        satisfactionBoard: Math.round(-15 * mods.criticismMult),
        clubAttachment: -10,
        trustCoach: -6
      }, `Thất hứa cam kết "${cm.content}"`);
    }
    this._escalateOrCreateConflict(cm.playerId, {
      scenario: 'broken_promise',
      cause: `Ban lãnh đạo không thực hiện lời hứa "${cm.content}" đúng hạn Tuần ${cm.deadlineWeek}.`,
      deltaLevel: 2,
      fromBrokenPromise: true
    });
    this.state?.reputationSystem?.applyDelta(
      { playerTrust: -6, governanceSkill: -5, coachTrust: -2 },
      `Không thực hiện cam kết với ${cm.playerName}`,
      `cmt_brk_${cm.id}`
    );
    this.state?.pushPhoneMsg?.(
      'Phòng Thay Đồ PSG',
      `⚠️ THẤT HỨA VỚI CẦU THỦ: ${cm.playerName}`,
      `${cm.playerName} rất thất vọng vì cam kết "${cm.content}" đã quá hạn (Tuần ${cm.deadlineWeek}) mà chưa được thực hiện!`,
      true
    );
  }

  // ==================== 5. MÂU THUẪN TỰ NHIÊN (5 CẤP ĐỘ) & RÒ RỈ BÁO CHÍ (5 GIAI ĐOẠN) ====================

  _escalateOrCreateConflict(playerId, { scenario = 'bench_frustration', cause = '', deltaLevel = 1, fromBrokenPromise = false } = {}) {
    const p = this.state?.getPlayerById?.(playerId);
    const profile = this.ensurePlayerProfile(playerId);
    if (!p || !profile) return null;

    let conflict = this.getActiveConflict(playerId);
    const dateStr = this._dateStr();

    if (!conflict) {
      conflict = {
        id: `cnf_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        playerId: p.id,
        playerName: p.name,
        coachId: this.state?.coach?.staffId || 'stf_hc_01',
        coachName: this.state?.coach?.name || 'HLV trưởng PSG',
        scenario,
        level: clamp(deltaLevel, 1, 2), // Tuyệt đối không nhảy thẳng lên khủng hoảng chỉ sau 1 sự kiện đầu!
        status: 'active', // 'active' | 'resolved' | 'archived_coach_change'
        startedDate: dateStr,
        startedWeek: this._week(),
        cause,
        escalations: [{ date: dateStr, week: this._week(), level: clamp(deltaLevel, 1, 2), note: cause }],
        resolutions: [],
        outcome: null
      };
      this.conflicts.unshift(conflict);
    } else {
      const maxStep = fromBrokenPromise ? 2 : 1;
      const nextLvl = clamp(conflict.level + Math.min(maxStep, deltaLevel), 1, 5);
      if (nextLvl > conflict.level) {
        conflict.level = nextLvl;
        conflict.cause = cause || conflict.cause;
        conflict.escalations.push({ date: dateStr, week: this._week(), level: nextLvl, note: cause });
      }
    }

    this._logPlayerEvent(profile, 'conflict', `Mâu thuẫn Cấp ${conflict.level}: ${CONFLICT_LEVELS[conflict.level]?.label}`, cause);

    // Từ Cấp 3 trở lên có nguy cơ rò rỉ báo chí; Cấp 4-5 hoặc mất niềm tin -> Yêu cầu ra đi
    if (conflict.level >= 2) {
      this._triggerOrEscalatePressLeak(conflict);
    }
    if (conflict.level >= 4 || (conflict.level >= 3 && profile.brokenPromisesCount >= 1 && profile.metrics.trustChairman < 45)) {
      this._triggerTransferRequestIfNeeded(p, profile, conflict);
    }

    this.recomputeMoodAndSyncPlayer(playerId);
    return conflict;
  }

  _deescalateConflict(playerId, dropLevels = 1, resolutionNote = 'Đã trao đổi giải tỏa') {
    const conflict = this.getActiveConflict(playerId);
    if (!conflict) return null;
    conflict.resolutions.push({ date: this._dateStr(), week: this._week(), note: resolutionNote });
    if (conflict.level - dropLevels <= 0) {
      conflict.status = 'resolved';
      conflict.outcome = resolutionNote;
      const prof = this.ensurePlayerProfile(playerId);
      if (prof && prof.metrics.satisfactionPlaytime >= 50) prof.wantsToLeave = false;
    } else {
      conflict.level = Math.max(1, conflict.level - dropLevels);
    }
    this.recomputeMoodAndSyncPlayer(playerId);
    return conflict;
  }

  _triggerTransferRequestIfNeeded(p, profile, conflict) {
    if (!p || !profile) return;
    profile.wantsToLeave = true;
    this.recomputeMoodAndSyncPlayer(p.id);
    if (profile.transferRequestSent) return;
    profile.transferRequestSent = true;

    this.state?.pushPhoneMsg?.(
      'Ban Cố Vấn Phòng Thay Đồ',
      `🚨 CẢNH BÁO – TƯƠNG LAI CẦU THỦ: ${p.name}`,
      `${p.name} (${p.position} · OVR ${p.ovr}) đang ở trạng thái ${profile.mood} (Mâu thuẫn cấp ${conflict.level}/5: ${conflict.cause}). Cầu thủ đề nghị được gặp trực tiếp Chủ tịch hoặc cân nhắc tìm bến đỗ mới!`,
      true
    );

    this.state?.eventBus?.emit('PLAYER_TRANSFER_REQUEST', {
      playerId: p.id,
      playerName: p.name,
      conflictLevel: conflict.level,
      cause: conflict.cause
    }, `treq_${p.id}_w${this._week()}`);
  }

  // ==================== 6. RÒ RỈ BÁO CHÍ THEO DIỄN BIẾN THỰC TẾ (5 GIAI ĐOẠN) ====================

  _triggerOrEscalatePressLeak(conflict) {
    if (!conflict || !this.state) return null;
    const p = this.state.getPlayerById(conflict.playerId);
    if (!p) return null;

    // Quy đổi cấp mâu thuẫn sang giai đoạn báo chí thực tế (chỉ lên Stage 5 khi cầu thủ thực sự muốn ra đi công khai)
    const prof = this.ensurePlayerProfile(p.id);
    const targetStage = conflict.level >= 5 && prof?.wantsToLeave ? 5
      : conflict.level >= 4 ? 4
      : conflict.level >= 3 ? 3
      : conflict.level === 2 ? 2
      : 1;

    let leak = this.pressLeaks.find((l) => l.playerId === p.id && !l.closed);
    if (!leak) {
      leak = {
        id: `leak_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        conflictId: conflict.id,
        playerId: p.id,
        playerName: p.name,
        stage: targetStage,
        stageLabel: LEAK_STAGES[targetStage],
        headline: this._buildLeakHeadline(p, conflict, targetStage),
        detail: `Nguyên nhân thực tế: ${conflict.cause}`,
        date: this._dateStr(),
        week: this._week(),
        handled: false,
        closed: false,
        chairmanResponse: null
      };
      this.pressLeaks.unshift(leak);
      if (this.pressLeaks.length > 24) this.pressLeaks.length = 24;
    } else if (targetStage > leak.stage) {
      leak.stage = targetStage;
      leak.stageLabel = LEAK_STAGES[targetStage];
      leak.headline = this._buildLeakHeadline(p, conflict, targetStage);
      leak.detail = `Căng thẳng leo thang: ${conflict.cause}`;
      leak.date = this._dateStr();
      leak.handled = false;
    } else {
      return leak;
    }

    // Tạo bài báo thực tế theo đúng mức độ xác thực (KHÔNG tự bịa chuyển nhượng đã hoàn tất!)
    const verificationStatus = leak.stage >= 3 ? 'Chính thức' : leak.stage === 2 ? 'Chưa xác nhận' : 'Tin đồn';
    const tagType = leak.stage >= 3 ? 'Nóng' : leak.stage === 2 ? 'Chưa xác nhận' : 'Tin đồn';

    PressNewsSystem.createArticle(this.state, {
      scenarioId: 44 + leak.stage,
      category: 'Nội bộ',
      tagType,
      verificationStatus,
      title: leak.headline,
      summary: leak.detail,
      body: `Theo thông tin ghi nhận quanh Campus PSG, tình hình của ${p.name} tại Paris Saint-Germain đang thu hút sự chú ý (${leak.stageLabel}). ${conflict.cause} Ban lãnh đạo và Chủ tịch Phạm Minh Chiêu đang đứng trước áp lực đưa ra phản hồi chính thức.`,
      imageType: 'boardroom',
      imageCaption: `PHÒNG THAY ĐỒ PSG · ${p.name.toUpperCase()}`,
      relatedEntity: p.name,
      fanTone: leak.stage >= 4 ? 'loss' : 'neutral',
      dedupeKey: `leak_art_${leak.id}_s${leak.stage}`
    });

    if (leak.stage >= 3 && this.state.rumorCrisisSystem) {
      this.state.rumorCrisisSystem.triggerCrisis(
        leak.stage >= 5 ? 'player_exit_demand' : 'benched_star_unhappy',
        { playerId: p.id, playerName: p.name },
        `crs_rel_${p.id}_s${leak.stage}`
      );
    }

    if (leak.stage >= 3) {
      this.state.televisionSystem?.pushBreakingNews?.(`NỘI BỘ PSG: ${leak.headline}`, 'internal_crisis');
    }

    return leak;
  }

  _buildLeakHeadline(p, conflict, stage) {
    if (stage === 1) return `Tin đồn: ${p.name} chưa hoàn toàn hài lòng với vai trò tại PSG`;
    if (stage === 2) return `Nguồn tin nội bộ: Xuất hiện dấu hiệu căng thẳng giữa ${p.name} và HLV ${conflict.coachName}`;
    if (stage === 3) return `Báo chí Pháp xác nhận bất đồng trong phòng thay đồ PSG liên quan tới ${p.name}`;
    if (stage === 4) return `KHỦNG HOẢNG NỘI BỘ PSG: Mối quan hệ ${p.name} – BHL rạn nứt nghiêm trọng`;
    return `NÓNG: ${p.name} công khai ý định rời Paris Saint-Germain nếu tình hình không thay đổi`;
  }

  respondToPressLeak(leakId, responseKey) {
    const leak = this.pressLeaks.find((l) => l.id === leakId);
    if (!leak) return { ok: false, error: 'Không tìm thấy bản tin rò rỉ.' };
    const p = this.state?.getPlayerById?.(leak.playerId);
    const prof = this.ensurePlayerProfile(leak.playerId);

    leak.handled = true;
    leak.chairmanResponse = responseKey;

    let msg = '';
    if (responseKey === 'silence') {
      msg = `Chủ tịch giữ im lặng về trường hợp ${leak.playerName}. Tin đồn vẫn âm ỉ trên mặt báo.`;
      this.state?.reputationSystem?.applyDelta({ mediaTrust: -2, governanceSkill: +1 }, `Giữ im lặng trước rò rỉ ${leak.playerName}`);
    } else if (responseKey === 'deny') {
      const actuallySevere = leak.stage >= 3;
      this.state?.reputationSystem?.applyDelta(
        actuallySevere ? { mediaTrust: -4, fanTrust: +1, coachTrust: +2 } : { mediaTrust: +2, fanTrust: +2 },
        `Phủ nhận rò rỉ nội bộ về ${leak.playerName}`
      );
      if (actuallySevere && prof) {
        this._applyMetricDeltas(p.id, { trustChairman: -4 }, 'Chủ tịch phủ nhận bất đồng thực tế');
      }
      msg = `Chủ tịch công khai phủ nhận tin đồn mâu thuẫn liên quan đến ${leak.playerName}.`;
    } else if (responseKey === 'confirm_handling') {
      this.state?.reputationSystem?.applyDelta(
        { mediaTrust: +3, governanceSkill: +4, playerTrust: +2, coachTrust: +1 },
        `Xác nhận đang xử lý nội bộ vụ ${leak.playerName}`
      );
      if (p) this._applyMetricDeltas(p.id, { trustChairman: +4, satisfactionBoard: +3 }, 'Chủ tịch xác nhận lắng nghe và xử lý');
      leak.closed = leak.stage <= 3;
      msg = `PSG xác nhận có trao đổi nội bộ và Chủ tịch đang trực tiếp xử lý ổn thỏa cho ${leak.playerName}.`;
    } else if (responseKey === 'press_briefing') {
      this.state?.reputationSystem?.applyDelta(
        { mediaTrust: +5, fanTrust: +3, partnerTrust: +2, governanceSkill: +2 },
        `Tổ chức họp báo ổn định vụ ${leak.playerName}`
      );
      this._deescalateConflict(leak.playerId, 1, 'Chủ tịch họp báo hạ nhiệt dư luận');
      leak.closed = true;
      msg = `Cuộc họp báo của Chủ tịch giúp hạ nhiệt đáng kể áp lực truyền thông quanh ${leak.playerName}.`;
    } else if (responseKey === 'reassure_fans') {
      this.state?.reputationSystem?.applyDelta(
        { fanTrust: +5, mediaTrust: +2, playerTrust: +1 },
        `Trấn an CĐV về tương lai ${leak.playerName}`
      );
      if (p) this._applyMetricDeltas(p.id, { clubAttachment: +3 }, 'Thông điệp gắn kết gửi CĐV Paris');
      msg = `Đã phát đi thông điệp trấn an hội CĐV Parc des Princes về cam kết đoàn kết toàn đội.`;
    }

    PressNewsSystem.createArticle(this.state, {
      scenarioId: 50,
      category: 'Nội bộ',
      tagType: 'Chính thức',
      verificationStatus: 'Chính thức',
      title: `Chủ tịch Phạm Minh Chiêu lên tiếng về tình hình của ${leak.playerName}`,
      summary: msg,
      body: `${msg} Đội ngũ truyền thông PSG khẳng định mọi quyết định nhân sự đều đặt lợi ích chuyên môn và sự ổn định của Paris Saint-Germain lên hàng đầu.`,
      imageType: 'boardroom',
      imageCaption: 'PHẢN HỒI CHÍNH THỨC · CHỦ TỊCH PSG',
      relatedEntity: leak.playerName,
      fanTone: 'positive'
    });

    return { ok: true, leak, message: msg };
  }

  // ==================== 7. CẬP NHẬT SAU TRẬN ĐẤU & HÀNG TUẦN (EVENT-DRIVEN) ====================

  onMatchCompleted(matchRes) {
    if (!matchRes || !this.state) return;
    this._matchCounter++;
    const week = this._week();
    const playedMap = new Map();
    (matchRes.ratings || []).forEach((r) => playedMap.set(r.id, r));

    const squad = this.state.getPsgSquad();
    const starters = new Set(matchRes.starterIds || this.state.formationSystem?.starterIds || []);
    const subbedOutIds = new Set(matchRes.subbedOutIds || []);
    const ctx = this.state.formationSystem?.getContext?.() || { formation: '4-3-3' };

    squad.forEach((p) => {
      const profile = this.ensurePlayerProfile(p.id);
      if (!profile) return;
      const mods = this._getTraitModifiers(profile);

      if ((p.injuryDays || 0) > 0 || p.suspended) {
        // Bị chấn thương/treo giò không tính là bị HLV bỏ rơi
        profile.benchStreak = 0;
        return;
      }

      const playedRec = playedMap.get(p.id);
      if (playedRec) {
        const mins = playedRec.minutes ?? (subbedOutIds.has(p.id) ? 54 : 86);
        const wasStarter = starters.has(p.id) || mins >= 60;
        const earlySub = wasStarter && mins < 60;
        const playedRole = playedRec.assignedRole || p.position;
        const suit = this.suitabilityAI.evaluatePlayerAtPosition(p, playedRole, ctx);
        const outOfPos = suit.score < 70 && normalizePosition(playedRole) !== normalizePosition(p.position);

        profile.benchStreak = 0;
        profile.weeksWithoutFirstTeamApps = 0;
        profile.recentMinutes.unshift({ week, minutes: mins, starter: wasStarter, rating: playedRec.rating, outOfPos });
        if (profile.recentMinutes.length > 8) profile.recentMinutes.length = 8;

        // 1. Ghi nhận nếu bị thay ra sớm nhiều lần dù rating ổn
        if (earlySub && playedRec.rating >= 6.6) {
          profile.earlySubStreak = (profile.earlySubStreak || 0) + 1;
          this._applyMetricDeltas(p.id, {
            satisfactionPlaytime: Math.round(-4 * mods.subMult),
            trustCoach: Math.round(-3 * mods.subMult)
          }, `Bị thay ra sớm (${mins}') dù điểm chuyên môn ${playedRec.rating}`);
          if (profile.earlySubStreak >= 2) {
            this._escalateOrCreateConflict(p.id, {
              scenario: 'early_sub',
              cause: `Liên tục bị rút ra sớm (${mins}') dù đang đạt phong độ ổn định.`,
              deltaLevel: 1
            });
          }
        } else {
          profile.earlySubStreak = 0;
        }

        // 2. Thi đấu trái sở trường nhiều trận
        if (outOfPos) {
          profile.outOfPosStreak = (profile.outOfPosStreak || 0) + 1;
          this._applyMetricDeltas(p.id, {
            satisfactionRole: -5,
            satisfactionTactics: -5,
            trustCoach: -3
          }, `Phải đá trái sở trường (${playedRole} thay vì ${p.position}, tương thích ${suit.score}%)`);
          if (profile.outOfPosStreak >= 2) {
            this._escalateOrCreateConflict(p.id, {
              scenario: 'out_of_position',
              cause: `Thường xuyên bị xếp trái sở trường ${p.position} -> ${playedRole}.`,
              deltaLevel: 1
            });
          }
        } else {
          profile.outOfPosStreak = 0;
        }

        // 3. Quá tải thể lực mà vẫn bị ép đá chính nhiều phút
        const fatigueNow = p.health?.fatigue ?? 30;
        if (mins >= 75 && fatigueNow >= 74) {
          profile.overworkStreak = (profile.overworkStreak || 0) + 1;
          this._applyMetricDeltas(p.id, {
            satisfactionBoard: -3,
            trustCoach: -4
          }, `Thi đấu quá tải (Mệt mỏi ${fatigueNow}%) không được xoay tua nghỉ ngơi`);
          if (profile.overworkStreak >= 2) {
            this._escalateOrCreateConflict(p.id, {
              scenario: 'overworked_star',
              cause: 'Trụ cột bị vắt kiệt thể lực liên tiếp qua nhiều trận đấu căng thẳng.',
              deltaLevel: 1
            });
          }
        } else {
          profile.overworkStreak = 0;
        }

        // 4. Khi được ra sân và chơi tốt -> cải thiện sự hài lòng
        if (!earlySub && !outOfPos) {
          const playGain = mins >= 65 ? +5 : +3;
          this._applyMetricDeltas(p.id, {
            satisfactionPlaytime: playGain,
            satisfactionRole: mins >= 65 ? +4 : +2,
            trustCoach: playedRec.rating >= 7.2 ? +4 : +2,
            respectCoach: matchRes.psgWon ? +3 : +1,
            satisfactionTactics: matchRes.psgWon ? +3 : 0,
            satisfactionDevelopment: p.age <= 22 ? +5 : +2
          });
          if (profile.metrics.satisfactionPlaytime >= 62 && !fromActiveSevere(this.getActiveConflict(p.id))) {
            this._deescalateConflict(p.id, 1, `${p.name} đã được ra sân (${mins}') và cải thiện tâm lý.`);
          }
        }

        // 5. Kiểm tra hoàn thành Chỉ đạo HLV & Cam kết Chủ tịch từ việc ra sân thực tế!
        this._checkDirectivesAndCommitmentsOnPlay(p, mins, wasStarter, outOfPos, matchRes.fixture);
      } else {
        // Không được vào sân trận này
        profile.benchStreak = (profile.benchStreak || 0) + 1;
        profile.earlySubStreak = 0;
        profile.overworkStreak = 0;

        // Kiểm tra nếu đây là cầu thủ được HLV đồng ý cho NGHỈ NGƠI giữ sức
        const restDirective = this.directives.find((d) =>
          d.playerId === p.id &&
          (d.status === DIRECTIVE_STATUS.AGREED || d.status === DIRECTIVE_STATUS.PARTIAL) &&
          ['rest', 'protect', 'rotate'].includes(d.impactType)
        );
        const restCommitment = this.commitments.find((c) =>
          c.playerId === p.id &&
          c.type === 'rest_workload' &&
          (c.status === COMMITMENT_STATUS.PENDING || c.status === COMMITMENT_STATUS.IN_PROGRESS)
        );

        if (restDirective || restCommitment) {
          this._applyMetricDeltas(p.id, {
            trustCoach: +3,
            trustChairman: +3,
            satisfactionBoard: +3
          }, 'Được HLV cho nghỉ ngơi phục hồi thể lực theo đúng kế hoạch');
          if (restDirective) {
            restDirective.executedMatches++;
            if (restDirective.executedMatches >= restDirective.targetMatches) {
              this._archiveDirective(restDirective, DIRECTIVE_STATUS.COMPLETED, `Đã cho ${p.name} nghỉ ngơi phục hồi thành công.`);
            }
          }
          if (restCommitment) {
            this._fulfillCommitment(restCommitment, `${p.name} đã được cho nghỉ ngơi bảo toàn thể lực.`);
          }
        } else {
          // Dự bị không có lý do bảo toàn thể lực
          const expectsMinutes =
            p.ovr >= 82 ||
            (p.age <= 21 && (p.pot || 80) >= 84 && p.form >= 74) ||
            String(p.psychology?.squadRole || '').includes('Trụ cột') ||
            String(p.psychology?.squadRole || '').includes('Đá chính');

          if (expectsMinutes) {
            const benchPenalty = Math.round((p.form >= 76 ? -7 : -4) * mods.benchMult);
            this._applyMetricDeltas(p.id, {
              satisfactionPlaytime: benchPenalty,
              satisfactionRole: Math.round(-4 * mods.benchMult),
              trustCoach: Math.round(-4 * mods.benchMult),
              satisfactionDevelopment: p.age <= 22 ? -5 : -2
            }, `Ngồi dự bị trọn trận (Chuỗi ${profile.benchStreak} trận liên tiếp, phong độ ${p.form})`);

            // Chỉ tạo/leo thang mâu thuẫn dần dần sau >= 2 trận dự bị liên tiếp!
            if (profile.benchStreak >= 2) {
              this._escalateOrCreateConflict(p.id, {
                scenario: p.age <= 21 ? 'youth_ignored' : 'bench_frustration',
                cause: p.age <= 21
                  ? `Tài năng trẻ ${p.name} (POT ${p.pot}, phong độ ${p.form}) không được trao phút thi đấu suốt ${profile.benchStreak} trận.`
                  : `${p.name} (OVR ${p.ovr}) liên tục phải ngồi dự bị ${profile.benchStreak} trận dù sẵn sàng ra sân.`,
                deltaLevel: 1
              });
            }
          }
        }
      }

      // Thua trận đậm hoặc thua liên tiếp tác động nhẹ tới niềm tin chiến thuật
      if (!matchRes.psgWon && !matchRes.psgDrew && (this.state.loseStreak || 0) >= 2) {
        this._applyMetricDeltas(p.id, { satisfactionTactics: -4, trustCoach: -3 });
      }
    });
  }

  _checkDirectivesAndCommitmentsOnPlay(p, mins, wasStarter, outOfPos, fixture) {
    // 1. Cập nhật Chỉ đạo HLV
    this.directives.slice().forEach((d) => {
      if (d.playerId !== p.id) return;
      if (d.status !== DIRECTIVE_STATUS.AGREED && d.status !== DIRECTIVE_STATUS.PARTIAL && d.status !== DIRECTIVE_STATUS.ALTERNATIVE) return;

      let counted = false;
      if (d.impactType === 'starter' && wasStarter) counted = true;
      else if (d.impactType === 'natural_pos' && !outOfPos) counted = true;
      else if (d.impactType === 'cup' && (fixture?.comp === 'Coupe de France' || mins >= 20)) counted = true;
      else if (d.impactType === 'reduce_minutes' && mins <= 72) counted = true;
      else if (!['rest', 'protect', 'starter', 'natural_pos'].includes(d.impactType) && mins >= 15) counted = true;

      if (counted) {
        d.executedMatches++;
        if (d.executedMatches >= d.targetMatches) {
          this._archiveDirective(d, DIRECTIVE_STATUS.COMPLETED, `HLV ${d.coachName} đã thực hiện đúng định hướng cho ${p.name} (${d.executedMatches} trận).`);
        }
      }
    });

    // 2. Cập nhật Cam kết Chủ tịch (chỉ hoàn thành khi cầu thủ thực sự được thi đấu đúng cam kết!)
    this.commitments.forEach((cm) => {
      if (cm.playerId !== p.id) return;
      if (cm.status !== COMMITMENT_STATUS.PENDING && cm.status !== COMMITMENT_STATUS.IN_PROGRESS) return;

      let matched = false;
      if (cm.type === 'start_opportunities' && wasStarter) matched = true;
      else if (cm.type === 'natural_position' && !outOfPos && mins >= 45) matched = true;
      else if (cm.type === 'cup_opportunities' && mins >= 25) matched = true;
      else if (['give_playtime', 'role_upgrade', 'development_plan'].includes(cm.type) && mins >= 20) matched = true;

      if (matched) {
        cm.coachAgreed = true;
        cm.progressCount++;
        cm.status = COMMITMENT_STATUS.IN_PROGRESS;
        cm.outcomeNote = `Đã thi đấu ${cm.progressCount}/${cm.targetCount} trận theo cam kết (${mins}' gần nhất).`;
        if (cm.progressCount >= cm.targetCount) {
          this._fulfillCommitment(cm, `Cầu thủ ${p.name} đã xác nhận được trao cơ hội thực tế (${cm.progressCount} trận).`);
        }
      }
    });
  }

  onContractRenewed(p) {
    if (!p) return;
    this.ensurePlayerProfile(p.id);
    this._applyMetricDeltas(p.id, {
      satisfactionBoard: +12,
      trustChairman: +10,
      clubAttachment: +10,
      satisfactionRole: +6
    }, `Gia hạn hợp đồng mới (${p.contractYears} năm · €${p.wage}k/tuần)`);

    this.commitments.forEach((cm) => {
      if (cm.playerId === p.id && cm.type === 'contract_extension' &&
        (cm.status === COMMITMENT_STATUS.PENDING || cm.status === COMMITMENT_STATUS.IN_PROGRESS)) {
        this._fulfillCommitment(cm, `Đã hoàn tất gia hạn hợp đồng mới (${p.contractYears} năm · €${p.wage}k/tuần).`);
      }
    });
  }

  onWeeklyTick() {
    const curWeek = this._week();

    // 1. Kiểm tra hạn cam kết (Nếu hết hạn mà chưa thực hiện -> Thất hứa!)
    this.commitments.forEach((cm) => {
      if (cm.status === COMMITMENT_STATUS.PENDING || cm.status === COMMITMENT_STATUS.IN_PROGRESS) {
        if (curWeek > cm.deadlineWeek) {
          this._breakCommitment(cm);
        }
      }
    });

    // 2. Lưu trữ các chỉ đạo quá hạn không còn phù hợp
    this.directives.slice().forEach((d) => {
      if (curWeek > d.expiresWeek) {
        this._archiveDirective(d, DIRECTIVE_STATUS.OBSOLETE, 'Đã qua chu kỳ lịch thi đấu của định hướng.');
      }
    });

    // 3. Kiểm tra cầu thủ trẻ Học viện tiềm năng cao nếu bị bỏ quên quá lâu
    const academyTop = (this.state?.academy || []).filter((y) => !y.promoted && !y.loanClub && y.pot >= 86 && y.age >= 18);
    academyTop.slice(0, 6).forEach((y) => {
      const prof = this.ensurePlayerProfile(y.id);
      if (!prof) return;
      prof.weeksWithoutFirstTeamApps = (prof.weeksWithoutFirstTeamApps || 0) + 1;
      if (prof.weeksWithoutFirstTeamApps >= 4) {
        this._applyMetricDeltas(y.id, { satisfactionDevelopment: -4, satisfactionPlaytime: -4 }, 'Chờ đợi cơ hội thử sức cùng đội một');
      }
    });

    // 4. Đánh giá lại chỉ đạo nếu có thay đổi điều kiện
    this.reevaluateDirectivesOnContextChange(`cập nhật nhân sự Tuần ${curWeek}`);

    // 5. Nếu cầu thủ muốn ra đi -> đẩy khả năng các CLB phù hợp gửi đề nghị hỏi mua ở kỳ chuyển nhượng
    if (this.state?.transferSystem?.isWindowOpen?.()) {
      const wantsOutPlayers = this.state.getPsgSquad().filter((p) => this.playerRelations[p.id]?.wantsToLeave);
      if (wantsOutPlayers.length > 0 && Math.random() < 0.55) {
        wantsOutPlayers[0].transferListed = true;
        this.state.transferSystem.generateIncomingBids(1);
      }
    }
  }

  // ==================== 8. THAY ĐỔI HLV TRƯỞNG (GIỮ LẠI LỊCH SỬ MÂU THUẪN) ====================

  onHeadCoachChanged(oldCoach, newCoach) {
    const oldCoachId = oldCoach?.staffId || 'hc_old';
    const oldCoachName = oldCoach?.name || 'HLV tiền nhiệm';
    const newCoachId = newCoach?.staffId || 'hc_interim';
    const newCoachName = newCoach?.name || 'HLV mới';

    // 1. Các chỉ đạo chuyên môn cho HLV cũ không còn phù hợp -> lưu trữ vào lịch sử
    this.directives.slice().forEach((d) => {
      this._archiveDirective(d, DIRECTIVE_STATUS.OBSOLETE, `CLB đã thay HLV trưởng (${oldCoachName} → ${newCoachName}).`);
    });

    // 2. Mâu thuẫn với HLV cũ được ghi nhận sang lịch sử cũ của cầu thủ (KHÔNG xóa mất!)
    this.conflicts.forEach((c) => {
      if (c.status === 'active') {
        c.status = 'archived_coach_change';
        c.outcome = `Chuyển tiếp lịch sử khi thay HLV (${oldCoachName} → ${newCoachName}).`;
        const prof = this.ensurePlayerProfile(c.playerId);
        if (prof) {
          prof.formerCoachConflicts.unshift({
            coachId: c.coachId,
            coachName: c.coachName,
            level: c.level,
            cause: c.cause,
            startedDate: c.startedDate,
            archivedDate: this._dateStr()
          });
        }
      }
    });

    // 3. Tính lại quan hệ giữa cầu thủ và HLV mới dựa trên phong cách HLV mới (nhưng KHÔNG xóa lịch sử thất hứa của Chủ tịch!)
    const newStyle = this.getCoachStyleProfile(newCoach);
    Object.values(this.playerRelations).forEach((prof) => {
      const p = this.state?.getPlayerById?.(prof.playerId);
      if (!p) return;
      prof.coachId = newCoachId;
      const youthAffinity = p.age <= 22 ? (newStyle.youthTrust - 75) * 0.35 : 0;
      const starAffinity = p.ovr >= 85 ? (newStyle.starLoyalty - 75) * 0.25 : 0;
      const roomAffinity = (newStyle.dressingRoomControl - 75) * 0.3;
      const freshBase = clamp(74 + youthAffinity + starAffinity + roomAffinity, 48, 92);

      prof.metrics.trustCoach = Math.round((prof.metrics.trustCoach * 0.25) + (freshBase * 0.75));
      prof.metrics.respectCoach = Math.round((prof.metrics.respectCoach * 0.25) + (freshBase * 0.75));
      prof.metrics.satisfactionTactics = clamp(freshBase, 45, 92);
      prof.benchStreak = 0;
      prof.earlySubStreak = 0;

      // Nếu mâu thuẫn trước chỉ đến từ HLV cũ (chủ tịch không thất hứa) -> cầu thủ tạm lắng nghe HLV mới
      if (prof.brokenPromisesCount === 0 && prof.metrics.trustChairman >= 55) {
        prof.wantsToLeave = false;
      }
      this._logPlayerEvent(
        prof,
        'coach_changed',
        `HLV trưởng thay đổi: ${oldCoachName} → ${newCoachName}`,
        `Lịch sử mâu thuẫn cũ được giữ nguyên; thiết lập quan hệ mới với ${newCoachName}.`
      );
      this.recomputeMoodAndSyncPlayer(prof.playerId);
    });
  }

  // ==================== 9. HỌP RIÊNG ĐA LƯỢT GIỮA CHỦ TỊCH & CẦU THỦ ====================

  startPrivateMeeting(playerId) {
    const p = this.state?.getPlayerById?.(playerId);
    if (!p) return { ok: false, error: 'Không tìm thấy hồ sơ cầu thủ.' };
    const profile = this.ensurePlayerProfile(p.id);
    const conflict = this.getActiveConflict(p.id);
    const activeCommitments = this.commitments.filter((c) =>
      c.playerId === p.id &&
      (c.status === COMMITMENT_STATUS.PENDING || c.status === COMMITMENT_STATUS.IN_PROGRESS || c.status === COMMITMENT_STATUS.BROKEN)
    );

    const openingText = this._buildMeetingOpeningLine(p, profile, conflict);
    const session = {
      id: `pm_${p.id}`,
      playerId: p.id,
      playerName: p.name,
      turn: 1,
      maxTurns: 3,
      finished: false,
      persuasionScore: this._computeInitialMeetingScore(p, profile, conflict),
      commitmentProposedType: null,
      finalOutcome: null, // 'stay_agreed' | 'stay_conditional' | 'need_time' | 'undecided' | 'insist_leaving'
      finalLabel: '',
      transcript: [
        {
          speaker: p.name,
          role: 'player',
          text: openingText,
          turn: 1
        }
      ],
      snapshot: {
        mood: profile.mood,
        conflictLevel: conflict?.level || 0,
        conflictCause: conflict?.cause || 'Trao đổi định hướng chuyên môn & tương lai tại PSG.',
        coachRelation: Math.round((profile.metrics.trustCoach + profile.metrics.respectCoach) / 2),
        chairmanTrust: profile.metrics.trustChairman,
        traits: profile.traits.map((k) => PLAYER_TRAITS[k]?.label || k),
        activeCommitments
      }
    };

    this.privateMeetingSessions[p.id] = session;
    return { ok: true, session };
  }

  _buildMeetingOpeningLine(p, profile, conflict) {
    if (profile.brokenPromisesCount > 0) {
      return `Thưa Chủ tịch Phạm Minh Chiêu, thành thật mà nói tôi rất hụt hẫng vì lời hứa trước đây vẫn chưa thành hiện thực. Tôi cần câu trả lời thực tế chứ không chỉ lời động viên.`;
    }
    if (conflict && conflict.level >= 4) {
      return `Thưa Chủ tịch, tình hình hiện tại đã vượt quá giới hạn chịu đựng của tôi (${conflict.cause}). Tôi đang cân nhắc nghiêm túc việc rời PSG nếu không có thay đổi rõ ràng.`;
    }
    if (conflict) {
      return `Cảm ơn Chủ tịch đã dành thời gian gặp riêng. Tôi vẫn tôn trọng PSG, nhưng ${conflict.cause.toLowerCase()}`;
    }
    if (p.age <= 21) {
      return `Thưa Chủ tịch, tôi luôn nỗ lực mỗi ngày ở Campus PSG và mong muốn được biết rõ lộ trình phát triển cũng như cơ hội ra sân của mình.`;
    }
    return `Chào Chủ tịch Phạm Minh Chiêu, tôi luôn sẵn sàng lắng nghe định hướng từ ngài cho giai đoạn sắp tới cùng đội bóng.`;
  }

  _computeInitialMeetingScore(p, profile, conflict) {
    const mods = this._getTraitModifiers(profile);
    let score = 52;
    score += (profile.metrics.trustChairman - 70) * 0.45;
    score += (profile.metrics.clubAttachment - 70) * 0.35;
    score += (profile.metrics.trustCoach - 65) * 0.2;
    score += mods.stayBonus;
    score -= (conflict?.level || 0) * 7.5;
    score -= (profile.brokenPromisesCount || 0) * 18;
    if ((this.state?.transferSystem?.incomingBids || []).some((b) => b.playerId === p.id)) {
      score -= 8;
    }
    if ((p.contractYears || 2) <= 1) score -= 5;
    return Math.round(score);
  }

  submitPrivateMeetingTurn(playerId, tacticKey) {
    const session = this.privateMeetingSessions[playerId] || this.startPrivateMeeting(playerId).session;
    if (!session || session.finished) return { ok: false, error: 'Phiên họp đã kết thúc.', session };

    const p = this.state?.getPlayerById?.(playerId);
    const profile = this.ensurePlayerProfile(playerId);
    if (!p || !profile) return { ok: false, error: 'Không tìm thấy hồ sơ cầu thủ.' };

    const mods = this._getTraitModifiers(profile);
    const tactic = PRIVATE_MEETING_TACTICS.find((t) => t.key === tacticKey) || PRIVATE_MEETING_TACTICS[0];

    let delta = 0;
    let playerReply = '';
    let chairmanLine = '';

    if (tacticKey === 'persuade_stay') {
      chairmanLine = `Tôi hiểu cảm giác của cậu, ${p.name}. PSG đang xây dựng một tập thể cạnh tranh chức vô địch Champions League và cậu là phần quan trọng trong dự án đó.`;
      const loyalImpact = profile.traits.includes('loyal') || profile.traits.includes('leader') ? +12 : +5;
      delta = profile.brokenPromisesCount > 0 ? loyalImpact - 10 : loyalImpact;
      playerReply = delta >= 8
        ? `Tôi trân trọng sự ghi nhận của Chủ tịch. Tôi thực sự yêu màu áo Paris và muốn giành vinh quang tại Parc des Princes.`
        : `Dự án của PSG rất hấp dẫn, nhưng một cầu thủ cần được chơi bóng thường xuyên chứ không chỉ ngồi ngoài nhìn đồng đội.`;
    } else if (tacticKey === 'commit_playtime') {
      chairmanLine = `Tôi sẽ trực tiếp trao đổi với HLV trưởng để thúc đẩy cơ hội thi đấu cho cậu trong 3 tuần tới. Tôi cam kết theo dõi sát sao việc này.`;
      if (profile.brokenPromisesCount > 0) {
        delta = -4;
        playerReply = `Chủ tịch từng hứa với tôi trước đây rồi nhưng mọi thứ trên sân vẫn không thay đổi! Làm sao tôi có thể đặt niềm tin thêm lần nữa?`;
      } else {
        delta = profile.traits.includes('ambitious') || profile.traits.includes('competitive') ? +15 : +11;
        session.commitmentProposedType = p.age <= 21 ? 'cup_opportunities' : 'give_playtime';
        playerReply = `Nếu Chủ tịch đứng ra cam kết thúc đẩy cơ hội thi đấu thực tế trong 3 tuần tới, tôi sẵn sàng tiếp tục cống hiến và chờ câu trả lời trên sân cỏ!`;
      }
    } else if (tacticKey === 'listen_needs') {
      chairmanLine = `Hãy nói thẳng với tôi điều gì khiến cậu bận tâm nhất lúc này — vị trí thi đấu, HLV trưởng hay kế hoạch tương lai?`;
      delta = profile.traits.includes('sensitive') || profile.traits.includes('strong_ego') ? +12 : +8;
      this._applyMetricDeltas(p.id, { trustChairman: +4, satisfactionBoard: +3 });
      playerReply = `Cảm ơn Chủ tịch đã lắng nghe thay vì chỉ áp đặt kỷ luật. Điều tôi cần nhất là được đối xử công bằng theo phong độ và có lộ trình minh bạch.`;
    } else if (tacticKey === 'propose_roadmap') {
      chairmanLine = `Chúng tôi có thể điều chỉnh lộ trình riêng cho cậu: tối ưu vị trí sở trường ${p.position}, kế hoạch phát triển và xem xét vai trò dài hạn tại PSG.`;
      delta = profile.traits.includes('driven') || profile.traits.includes('pragmatic') ? +14 : +9;
      session.commitmentProposedType = profile.outOfPosStreak > 0 ? 'natural_position' : 'development_plan';
      playerReply = `Một lộ trình rõ ràng về chuyên môn và vị trí sở trường là điều tôi luôn tìm kiếm. Tôi đánh giá cao cách tiếp cận thực tế này của Chủ tịch.`;
    } else if (tacticKey === 'respect_decision') {
      chairmanLine = `PSG luôn tôn trọng lựa chọn nghề nghiệp của cậu. Nếu cậu cảm thấy không còn phù hợp, CLB sẵn sàng lắng nghe các đề nghị nghiêm túc.`;
      session.finished = true;
      session.finalOutcome = 'insist_leaving';
      session.finalLabel = 'Tôn trọng nguyện vọng rời PSG (Mở chuyển nhượng)';
      playerReply = `Cảm ơn Chủ tịch Phạm Minh Chiêu đã hành xử đầy tôn trọng và chuyên nghiệp. Tôi sẽ tập luyện nghiêm túc trong lúc chờ bến đỗ phù hợp.`;
      p.transferListed = true;
      profile.wantsToLeave = true;
      this._applyMetricDeltas(p.id, { trustChairman: +4, respectCoach: 0 }, 'Chủ tịch tôn trọng nguyện vọng tìm bến đỗ mới');
    }

    session.transcript.push({ speaker: 'Chủ tịch Phạm Minh Chiêu', role: 'chairman', text: chairmanLine, turn: session.turn });
    session.transcript.push({ speaker: p.name, role: 'player', text: playerReply, turn: session.turn });
    session.persuasionScore += Math.round(delta * (mods.stayBonus >= 0 ? 1.0 : 0.92));

    // Kết thúc phiên họp nếu đã đạt ngưỡng thuyết phục hoặc hết lượt
    if (!session.finished && (session.turn >= session.maxTurns || session.persuasionScore >= 76 || session.persuasionScore <= 22)) {
      this._finalizePrivateMeeting(session, p, profile);
    } else if (!session.finished) {
      session.turn++;
    }

    this.recomputeMoodAndSyncPlayer(p.id);
    return { ok: true, session };
  }

  _finalizePrivateMeeting(session, p, profile) {
    session.finished = true;
    const score = session.persuasionScore;

    if (score >= 70) {
      if (session.commitmentProposedType) {
        session.finalOutcome = 'stay_conditional';
        session.finalLabel = 'Đồng ý ở lại nếu vai trò/thời lượng được cải thiện (Đã lập Cam kết)';
        const cm = this.createCommitment({
          playerId: p.id,
          type: session.commitmentProposedType,
          content: COMMITMENT_TYPES[session.commitmentProposedType],
          deadlineWeeks: 3,
          source: 'private_meeting',
          sendDirectiveToCoach: true
        });
        session.createdCommitment = cm;
      } else {
        session.finalOutcome = 'stay_agreed';
        session.finalLabel = 'Đồng ý ở lại PSG toàn tâm cống hiến';
      }
      profile.wantsToLeave = false;
      p.transferListed = false;
      this._applyMetricDeltas(p.id, { trustChairman: +8, satisfactionBoard: +7, clubAttachment: +6 }, 'Họp riêng thành công với Chủ tịch');
      this._deescalateConflict(p.id, 2, 'Cuộc gặp riêng giữa Chủ tịch và cầu thủ đạt đồng thuận tích cực.');
      this.state?.reputationSystem?.applyDelta({ playerTrust: +3, governanceSkill: +2 }, `Thuyết phục thành công ${p.name} ở lại PSG`);
    } else if (score >= 52) {
      session.finalOutcome = 'need_time';
      session.finalLabel = 'Muốn có thêm thời gian suy nghĩ';
      if (session.commitmentProposedType) {
        session.createdCommitment = this.createCommitment({
          playerId: p.id,
          type: session.commitmentProposedType,
          content: COMMITMENT_TYPES[session.commitmentProposedType],
          deadlineWeeks: 2,
          source: 'private_meeting',
          sendDirectiveToCoach: true
        });
      }
      this._applyMetricDeltas(p.id, { trustChairman: +4 }, 'Cầu thủ cần thêm thời gian quan sát hành động thực tế');
      this._deescalateConflict(p.id, 1, 'Cầu thủ tạm lắng nghe nhưng cần theo dõi thực tế 2 tuần tới.');
    } else if (score >= 38) {
      session.finalOutcome = 'undecided';
      session.finalLabel = 'Chưa quyết định — tiếp tục theo dõi';
      this._applyMetricDeltas(p.id, { trustChairman: +1 });
    } else {
      session.finalOutcome = 'insist_leaving';
      session.finalLabel = 'Kiên quyết muốn ra đi';
      profile.wantsToLeave = true;
      p.transferListed = true;
      this._applyMetricDeltas(p.id, { clubAttachment: -8, satisfactionBoard: -6 }, 'Họp riêng bất thành — cầu thủ kiên quyết muốn ra đi');
      this._escalateOrCreateConflict(p.id, {
        scenario: 'failed_meeting',
        cause: `${p.name} không tìm được tiếng nói chung trong cuộc gặp riêng và kiên quyết xin chuyển nhượng.`,
        deltaLevel: 1
      });
    }

    session.transcript.push({
      speaker: 'Hệ thống',
      role: 'outcome',
      text: `KẾT QUẢ CUỘC HỌP: ${session.finalLabel}`,
      turn: session.turn
    });
    this._logPlayerEvent(profile, 'private_meeting', session.finalLabel, `Điểm thuyết phục: ${score}`);
  }

  // ==================== 10. QUYỀN TỰ QUYẾT KHI CÓ ĐỀ NGHỊ CHUYỂN NHƯỢNG ====================

  evaluateIncomingBidByPlayer(bid) {
    if (!bid) return { accepted: true };
    const p = this.state?.getPlayerById?.(bid.playerId);
    if (!p) return { accepted: true };
    const buyer = this.state?.clubs?.find((c) => c.name === bid.buyerClub);
    const prof = this.ensurePlayerProfile(p.id);
    const buyerRating = buyer?.rating || 76;

    // Cầu thủ OVR cao từ chối CLB có đẳng cấp/tham vọng quá thấp so với bản thân (trừ khi thực sự tuyệt vọng muốn đi bằng mọi giá và CLB vẫn đủ tầm)
    const gap = p.ovr - buyerRating;
    const isLoan = bid.dealType === 'loan';
    const clubNeedsPos = buyer?.positionalNeeds?.includes(p.position);

    if (!isLoan && gap >= 9 && !(prof?.wantsToLeave && buyerRating >= 80)) {
      const reason = `${p.name} (OVR ${p.ovr}) từ chối gia nhập ${bid.buyerClub} (Rating ${buyerRating}) vì CLB này không đáp ứng tham vọng thể thao và cơ hội cạnh tranh danh hiệu đỉnh cao.`;
      this._logPlayerEvent(prof, 'bid_rejected_by_player', `Từ chối đề nghị từ ${bid.buyerClub}`, reason);
      this.state?.pushPhoneMsg?.(
        'Phòng Chuyển Nhượng PSG',
        `🙅 ${p.name} TỪ CHỐI GIA NHẬP ${bid.buyerClub.toUpperCase()}`,
        reason,
        false
      );
      return { accepted: false, reason };
    }

    if (!isLoan && gap >= 6 && !clubNeedsPos && !prof?.wantsToLeave && !p.transferListed) {
      const reason = `${p.name} không muốn chuyển tới ${bid.buyerClub} khi chưa thấy vai trò chiến thuật rõ ràng tại bến đỗ mới.`;
      return { accepted: false, reason };
    }

    return { accepted: true, reason: `${p.name} sẵn sàng lắng nghe đề nghị từ ${bid.buyerClub}.` };
  }

  onPlayerDeparted(playerId, destClubName = '') {
    const prof = this.playerRelations[playerId];
    if (prof) {
      prof.wantsToLeave = false;
      prof.transferRequestSent = false;
      this._logPlayerEvent(prof, 'departed', `Chuyển sang ${destClubName || 'CLB mới'}`, 'Đóng các cam kết PSG');
    }
    this.directives.slice().forEach((d) => {
      if (d.playerId === playerId) {
        this._archiveDirective(d, DIRECTIVE_STATUS.OBSOLETE, `Cầu thủ đã chuyển tới ${destClubName || 'CLB khác'}.`);
      }
    });
    this.commitments.forEach((cm) => {
      if (cm.playerId === playerId && (cm.status === COMMITMENT_STATUS.PENDING || cm.status === COMMITMENT_STATUS.IN_PROGRESS)) {
        cm.status = COMMITMENT_STATUS.OBSOLETE;
        cm.outcomeNote = `Cầu thủ đã rời PSG sang ${destClubName || 'CLB mới'}.`;
      }
    });
    this.conflicts.forEach((c) => {
      if (c.playerId === playerId && c.status === 'active') {
        c.status = 'resolved';
        c.outcome = `Kết thúc khi cầu thủ chuyển sang ${destClubName || 'CLB mới'}.`;
      }
    });
    this.pressLeaks.forEach((l) => {
      if (l.playerId === playerId) l.closed = true;
    });
  }

  onPlayerJoinedPsg(p, sourceLabel = 'Gia nhập PSG') {
    if (!p) return null;
    const prof = this.ensurePlayerProfile(p.id);
    if (!prof) return null;
    prof.wantsToLeave = false;
    prof.transferRequestSent = false;
    prof.benchStreak = 0;
    prof.earlySubStreak = 0;
    prof.outOfPosStreak = 0;
    prof.overworkStreak = 0;
    prof.weeksWithoutFirstTeamApps = 0;
    this._applyMetricDeltas(p.id, {
      satisfactionRole: +10,
      trustChairman: +8,
      satisfactionBoard: +8,
      clubAttachment: +8,
      satisfactionDevelopment: +10
    }, sourceLabel);
    return prof;
  }

  askCoachExplanation(playerId) {
    const p = this.state?.getPlayerById?.(playerId);
    if (!p) return { ok: false, error: 'Không tìm thấy cầu thủ.' };
    const prof = this.ensurePlayerProfile(p.id);
    const hc = this.state?.managerSystem?.getActiveByRole?.('head_coach') || this.state?.coach;
    const style = this.getCoachStyleProfile();
    const conflict = this.getActiveConflict(p.id);

    const answer = conflict
      ? `HLV ${hc?.name || 'trưởng'}: "Tôi hiểu ${p.name} đang ${prof.mood.toLowerCase()}, nhưng lựa chọn đội hình của tôi dựa trên tính cân bằng chiến thuật (kỷ luật ${style.disciplineFocus}/100) và phong độ hiện tại (${p.form}/99). Nếu Chủ tịch muốn, tôi có thể cân nhắc phương án xoay tua hợp lý."`
      : `HLV ${hc?.name || 'trưởng'}: "Tôi đánh giá ${p.name} vẫn nằm trong kế hoạch tập thể. Cậu ấy cần duy trì thể lực (${p.health?.fitness ?? 85}%) và sự kiên nhẫn để chờ cơ hội."`;

    this._logPlayerEvent(prof, 'coach_explanation', `Chủ tịch yêu cầu HLV ${hc?.name || ''} giải trình`, answer);
    return { ok: true, coachName: hc?.name || 'HLV trưởng', explanation: answer };
  }

  // ==================== 11. BÁO CÁO PHÒNG THAY ĐỒ & BỘ LỌC ====================

  getRelationshipSummaryKPIs() {
    const squad = this.state?.getPsgSquad ? this.state.getPsgSquad() : [];
    squad.forEach((p) => this.ensurePlayerProfile(p.id));

    let satisfiedCount = 0;
    let dissatisfiedCount = 0;
    let transferRiskCount = 0;
    let coachRelSum = 0;
    let integrationSum = 0;

    squad.forEach((p) => {
      const prof = this.playerRelations[p.id];
      if (!prof) return;
      if (['Rất hài lòng', 'Hài lòng'].includes(prof.mood)) satisfiedCount++;
      if (['Thất vọng', 'Bất mãn', 'Tức giận', 'Mất niềm tin', 'Muốn ra đi'].includes(prof.mood)) dissatisfiedCount++;
      if (prof.wantsToLeave || prof.mood === 'Muốn ra đi' || (this.getActiveConflict(p.id)?.level || 0) >= 4) transferRiskCount++;
      coachRelSum += (prof.metrics.trustCoach + prof.metrics.respectCoach) / 2;
      integrationSum += prof.metrics.teamIntegration;
    });

    const n = Math.max(1, squad.length);
    const avgCoachRelation = Math.round(coachRelSum / n);
    const activeConflictPenalty = this.conflicts.filter((c) => c.status === 'active').reduce((s, c) => s + c.level * 2, 0);
    const teamUnity = clamp(Math.round((integrationSum / n) * 0.65 + avgCoachRelation * 0.35 - activeConflictPenalty), 20, 100);

    return {
      totalPlayers: squad.length,
      satisfiedCount,
      dissatisfiedCount,
      transferRiskCount,
      teamUnity,
      avgCoachRelation,
      activeConflictsCount: this.conflicts.filter((c) => c.status === 'active').length,
      pendingDirectivesCount: this.directives.length,
      openCommitmentsCount: this.commitments.filter((c) => c.status === COMMITMENT_STATUS.PENDING || c.status === COMMITMENT_STATUS.IN_PROGRESS).length,
      activeLeaksCount: this.pressLeaks.filter((l) => !l.closed).length
    };
  }

  getLockerRoomReport(filters = {}) {
    const f = {
      squad: filters.squad || 'first_team', // 'all' | 'first_team' | 'academy'
      pos: filters.pos || 'ALL',
      moodLevel: filters.moodLevel || 'ALL', // 'ALL' | 'happy' | 'unhappy' | 'critical'
      coachRel: filters.coachRel || 'ALL', // 'ALL' | 'good' | 'tense'
      contract: filters.contract || 'ALL', // 'ALL' | 'expiring'
      hasCommitment: filters.hasCommitment || 'ALL', // 'ALL' | 'open' | 'broken'
      search: String(filters.search || '').trim().toLowerCase()
    };

    let pool = [];
    if (f.squad === 'academy') {
      pool = (this.state?.academy || []).filter((y) => !y.promoted && !y.loanClub);
    } else if (f.squad === 'all') {
      pool = [...(this.state?.getPsgSquad() || []), ...(this.state?.academy || []).filter((y) => !y.promoted && !y.loanClub)];
    } else {
      pool = this.state?.getPsgSquad() || [];
    }

    const rows = pool.map((p) => {
      const prof = this.ensurePlayerProfile(p.id);
      const conflict = this.getActiveConflict(p.id);
      const openCmt = this.commitments.filter((c) => c.playerId === p.id && (c.status === COMMITMENT_STATUS.PENDING || c.status === COMMITMENT_STATUS.IN_PROGRESS));
      const brokenCmt = this.commitments.filter((c) => c.playerId === p.id && c.status === COMMITMENT_STATUS.BROKEN);
      const coachAvg = Math.round((prof.metrics.trustCoach + prof.metrics.respectCoach) / 2);
      const hasBid = (this.state?.transferSystem?.incomingBids || []).some((b) => b.playerId === p.id);
      return {
        player: p,
        profile: prof,
        conflict,
        coachAvg,
        openCommitments: openCmt,
        brokenCommitments: brokenCmt,
        hasBid
      };
    }).filter((r) => {
      if (f.pos !== 'ALL' && r.player.position !== f.pos) return false;
      if (f.search && !r.player.name.toLowerCase().includes(f.search)) return false;
      if (f.moodLevel === 'happy' && !['Rất hài lòng', 'Hài lòng'].includes(r.profile.mood)) return false;
      if (f.moodLevel === 'unhappy' && !['Thất vọng', 'Bất mãn', 'Tức giận', 'Mất niềm tin', 'Muốn ra đi'].includes(r.profile.mood)) return false;
      if (f.moodLevel === 'critical' && !(r.profile.wantsToLeave || (r.conflict?.level || 0) >= 3 || ['Tức giận', 'Mất niềm tin', 'Muốn ra đi'].includes(r.profile.mood))) return false;
      if (f.coachRel === 'good' && r.coachAvg < 70) return false;
      if (f.coachRel === 'tense' && r.coachAvg >= 65) return false;
      if (f.contract === 'expiring' && (r.player.contractYears || 2) > 1) return false;
      if (f.hasCommitment === 'open' && r.openCommitments.length === 0) return false;
      if (f.hasCommitment === 'broken' && r.brokenCommitments.length === 0) return false;
      return true;
    }).sort((a, b) => {
      const ca = (a.conflict?.level || 0) * 20 + (a.profile.wantsToLeave ? 30 : 0) + (100 - a.profile.metrics.satisfactionPlaytime);
      const cb = (b.conflict?.level || 0) * 20 + (b.profile.wantsToLeave ? 30 : 0) + (100 - b.profile.metrics.satisfactionPlaytime);
      return cb - ca;
    });

    return {
      kpis: this.getRelationshipSummaryKPIs(),
      rows,
      activeConflicts: this.conflicts.filter((c) => c.status === 'active'),
      pendingDirectives: this.directives,
      directiveHistory: this.directiveHistory.slice(0, 20),
      openCommitments: this.commitments.filter((c) => c.status === COMMITMENT_STATUS.PENDING || c.status === COMMITMENT_STATUS.IN_PROGRESS),
      allCommitments: this.commitments.slice(0, 30),
      poachingRisks: (this.state?.transferSystem?.incomingBids || []).slice(0, 10),
      pressLeaks: this.pressLeaks.filter((l) => !l.closed)
    };
  }

  // ==================== 12. SAVE / LOAD FULL STATE ====================

  exportState() {
    return {
      playerRelations: this.playerRelations,
      coachRelations: this.coachRelations,
      directives: this.directives,
      directiveHistory: this.directiveHistory.slice(0, 50),
      commitments: this.commitments.slice(0, 60),
      conflicts: this.conflicts.slice(0, 40),
      pressLeaks: this.pressLeaks.slice(0, 30),
      chairmanCoachTrust: this.chairmanCoachTrust,
      recentInterferenceWeeks: [...this.recentInterferenceWeeks],
      matchCounter: this._matchCounter
    };
  }

  importState(snap) {
    if (!snap) return;
    this.playerRelations = snap.playerRelations || {};
    this.coachRelations = snap.coachRelations || {};
    this.directives = Array.isArray(snap.directives) ? snap.directives : [];
    this.directiveHistory = Array.isArray(snap.directiveHistory) ? snap.directiveHistory : [];
    this.commitments = Array.isArray(snap.commitments) ? snap.commitments : [];
    this.conflicts = Array.isArray(snap.conflicts) ? snap.conflicts : [];
    this.pressLeaks = Array.isArray(snap.pressLeaks) ? snap.pressLeaks : [];
    this.chairmanCoachTrust = typeof snap.chairmanCoachTrust === 'number' ? snap.chairmanCoachTrust : 84;
    this.recentInterferenceWeeks = Array.isArray(snap.recentInterferenceWeeks) ? snap.recentInterferenceWeeks : [];
    this._matchCounter = snap.matchCounter || 0;
    this.privateMeetingSessions = {};

    // Re-sync derived mood/psychology values smoothly
    Object.keys(this.playerRelations).forEach((pid) => {
      this.recomputeMoodAndSyncPlayer(pid);
    });
  }
}

function fromActiveSevere(conflict) {
  return !!conflict && conflict.level >= 4;
}
