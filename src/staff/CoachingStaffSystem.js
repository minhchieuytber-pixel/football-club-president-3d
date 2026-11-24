// src/staff/CoachingStaffSystem.js
// Hệ thống Ban Huấn Luyện PSG chuyên nghiệp gồm đầy đủ 12 chức vụ thực tế.
// Tính toán trực tiếp hiệu quả tập luyện, phòng chống quá tải/chấn thương, phân tích chiến thuật & điều phối hoạt động 3D trên sân tập.

export const COACHING_ROLE_ORDER = [
  'head_coach',
  'assistant_manager',
  'tactical_coach',
  'fitness_coach',
  'technical_coach',
  'gk_coach',
  'asst_gk_coach',
  'tactical_analyst',
  'performance_analyst',
  'rehab_coach',
  'individual_dev_coach',
  'set_piece_coach'
];

export class CoachingStaffSystem {
  constructor(state) {
    this.state = state;
  }

  getCoachingTeam() {
    return COACHING_ROLE_ORDER.map((roleKey, idx) => {
      const staff = this.state.staffDb.active.find((s) => s.roleKey === roleKey && s.status === 'active') || null;
      return { order: idx + 1, roleKey, staff };
    });
  }

  getCoachByRole(roleKey) {
    return this.state.staffDb.active.find((s) => s.roleKey === roleKey && s.status === 'active') || null;
  }

  // Tính hệ số chất lượng huấn luyện thực tế từ năng lực 12 thành viên Ban huấn luyện
  getTrainingQualityMultipliers() {
    const ratingOf = (roleKey, attr, fallback = 62) => {
      const s = this.getCoachByRole(roleKey);
      if (!s) return fallback;
      return s.ratings?.[attr] || s.overall || fallback;
    };

    const headFactor = ratingOf('head_coach', 'tactics', 65) / 85;
    const asstFactor = ratingOf('assistant_manager', 'management', 68) / 85;
    const fitness = (ratingOf('fitness_coach', 'fitness', 65) * 0.7 + ratingOf('performance_analyst', 'fitness', 65) * 0.3) / 82;
    const technical = (ratingOf('technical_coach', 'technical', 65) * 0.7 + ratingOf('individual_dev_coach', 'technical', 65) * 0.3) / 82;
    const tactical = (ratingOf('tactical_coach', 'tactics', 65) * 0.65 + ratingOf('tactical_analyst', 'analysis', 65) * 0.35) / 82;
    const gk = (ratingOf('gk_coach', 'gk', 65) * 0.72 + ratingOf('asst_gk_coach', 'gk', 65) * 0.28) / 82;
    const setPieces = ratingOf('set_piece_coach', 'tactics', 65) / 82;
    const rehab = (ratingOf('rehab_coach', 'medical', 65) * 0.65 + (this.state.staffDb.active.find((s) => s.roleKey === 'head_medical')?.ratings?.medical || 75) * 0.35) / 82;
    const youthDev = (ratingOf('individual_dev_coach', 'management', 65) * 0.5 + (this.getCoachByRole('head_coach')?.youthDev || 70) * 0.5) / 82;

    return {
      overall: +(((headFactor + asstFactor) / 2)).toFixed(2),
      fitness: +fitness.toFixed(2),
      technical: +technical.toFixed(2),
      tactical: +tactical.toFixed(2),
      gk: +gk.toFixed(2),
      setPieces: +setPieces.toFixed(2),
      rehab: +rehab.toFixed(2),
      youthDev: +youthDev.toFixed(2)
    };
  }

  getActiveCount() {
    return COACHING_ROLE_ORDER.filter((rk) => !!this.getCoachByRole(rk)).length;
  }

  getWeeklyWageBillK() {
    return this.getCoachingTeam().reduce((sum, item) => sum + (item.staff?.wage || 0), 0);
  }
}
