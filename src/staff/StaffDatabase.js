// src/staff/StaffDatabase.js
// Single Source of Truth cho toàn bộ Ban huấn luyện PSG (12 chức vụ chuyên môn), Ban lãnh đạo & Ứng viên thị trường nhân sự.
// Mỗi nhân sự có staffId duy nhất bất biến, không bao giờ dùng tên hiển thị làm khóa dữ liệu.

export const STAFF_ROLE_META = {
  // 12 chức vụ Ban huấn luyện PSG (Phần VI — trực tiếp chỉ đạo tập luyện ngay trong SVĐ Parc des Princes!)
  head_coach:           { title: 'HLV Trưởng', dept: 'Ban Huấn Luyện', deptId: 'coaching', npcId: 'npc_coach', isCoachingStaff: true, home: { x: -23.2, z: 6.65 }, pitchSpot: { x: 0.0, z: -130.5 }, duty: 'Điều hành toàn bộ chuyên môn & chiến thuật đội một tại Parc des Princes' },
  assistant_manager:    { title: 'Trợ Lý HLV Trưởng', dept: 'Ban Huấn Luyện', deptId: 'coaching', npcId: 'npc_asst', isCoachingStaff: true, home: { x: -30.8, z: 6.15 }, pitchSpot: { x: -8.0, z: -131.0 }, duty: 'Điều phối hoạt động huấn luyện & tập trung cầu thủ' },
  tactical_coach:       { title: 'Trợ Lý Chiến Thuật', dept: 'Ban Huấn Luyện', deptId: 'coaching', npcId: 'npc_tact_coach', isCoachingStaff: true, home: { x: -28.2, z: 6.15 }, pitchSpot: { x: 8.5, z: -131.0 }, duty: 'Xây dựng và tổ chức bài tập chiến thuật theo sơ đồ' },
  fitness_coach:        { title: 'Trợ Lý Thể Lực', dept: 'Ban Huấn Luyện', deptId: 'coaching', npcId: 'npc_fit_coach', isCoachingStaff: true, home: { x: -30.8, z: 9.05 }, pitchSpot: { x: 20.0, z: -139.0 }, duty: 'Quản lý thể lực, chạy bền, nước rút & cường độ tập' },
  technical_coach:      { title: 'Trợ Lý Kỹ Thuật', dept: 'Ban Huấn Luyện', deptId: 'coaching', npcId: 'npc_tech_coach', isCoachingStaff: true, home: { x: -28.2, z: 9.05 }, pitchSpot: { x: -16.0, z: -143.0 }, duty: 'Huấn luyện dứt điểm, sút bóng & kỹ thuật cá nhân' },
  gk_coach:             { title: 'HLV Thủ Môn', dept: 'Ban Huấn Luyện', deptId: 'coaching', npcId: 'npc_gk_coach', isCoachingStaff: true, home: { x: -25.0, z: 8.8 }, pitchSpot: { x: -30.5, z: -148.0 }, duty: 'Huấn luyện phản xạ, đổ người & phát bóng cho thủ môn' },
  asst_gk_coach:        { title: 'Trợ Lý HLV Thủ Môn', dept: 'Ban Huấn Luyện', deptId: 'coaching', npcId: 'npc_asst_gk_coach', isCoachingStaff: true, home: { x: -23.0, z: 8.8 }, pitchSpot: { x: -30.5, z: -156.0 }, duty: 'Hỗ trợ bài tập bắt bóng bổng & phân tích thủ môn' },
  tactical_analyst:     { title: 'Chuyên Viên Phân Tích Chiến Thuật', dept: 'Tuyển Trạch', deptId: 'scouting', npcId: 'npc_scout2', isCoachingStaff: true, home: { x: -16.8, z: 6.15 }, pitchSpot: { x: -14.0, z: -130.5 }, duty: 'Phân tích băng hình đối thủ và cấu trúc chiến thuật' },
  performance_analyst:  { title: 'Chuyên Viên Phân Tích Hiệu Suất', dept: 'Ban Huấn Luyện', deptId: 'coaching', npcId: 'npc_perf_analyst', isCoachingStaff: true, home: { x: -14.2, z: 6.15 }, pitchSpot: { x: 14.5, z: -130.5 }, duty: 'Đánh giá chỉ số GPS, tốc độ & hiệu suất cầu thủ' },
  rehab_coach:          { title: 'HLV Phục Hồi Thể Lực', dept: 'Y Tế', deptId: 'medical', npcId: 'npc_rehab_coach', isCoachingStaff: true, home: { x: 14.0, z: 17.5 }, pitchSpot: { x: -18.0, z: -166.0 }, duty: 'Phối hợp phòng Y tế phục hồi cầu thủ quá tải/chấn thương' },
  individual_dev_coach: { title: 'HLV Phát Triển Cá Nhân', dept: 'Học Viện', deptId: 'academy', npcId: 'npc_ind_coach', isCoachingStaff: true, home: { x: -14.2, z: 17.55 }, pitchSpot: { x: 4.0, z: -166.0 }, duty: 'Xây dựng giáo án phát triển kỹ năng riêng cho từng cầu thủ' },
  set_piece_coach:      { title: 'HLV Tình Huống Cố Định', dept: 'Ban Huấn Luyện', deptId: 'coaching', npcId: 'npc_setpiece_coach', isCoachingStaff: true, home: { x: -26.2, z: 9.05 }, pitchSpot: { x: 22.0, z: -163.0 }, duty: 'Huấn luyện đá phạt trực tiếp, phạt góc & tổ chức hàng rào' },

  // Các chức vụ lãnh đạo & chuyên môn chủ chốt khác (Phần III.3)
  sporting_director:    { title: 'Giám Đốc Thể Thao', dept: 'Chuyển Nhượng', deptId: 'transfers', npcId: 'npc_sporting', isCoachingStaff: false, home: { x: 29.7, z: -16.6 }, pitchSpot: null, duty: 'Hoạch định chiến lược chuyển nhượng & xây dựng đội hình' },
  academy_director:     { title: 'Giám Đốc Học Viện', dept: 'Học Viện', deptId: 'academy', npcId: 'npc_acad', isCoachingStaff: false, home: { x: -9.2, z: 18.05 }, pitchSpot: null, duty: 'Đào tạo 100 cầu thủ trẻ & đề xuất tài năng lên đội một' },
  head_medical:         { title: 'Trưởng Bộ Phận Y Tế', dept: 'Y Tế', deptId: 'medical', npcId: 'npc_med', isCoachingStaff: false, home: { x: 17.2, z: 17.35 }, pitchSpot: null, duty: 'Phòng ngừa chấn thương, điều trị & kiểm soát thể trạng' },
  cfo:                  { title: 'Giám Đốc Tài Chính (CFO)', dept: 'Tài Chính', deptId: 'finance', npcId: 'npc_cfo', isCoachingStaff: false, home: { x: 16.8, z: 6.65 }, pitchSpot: null, duty: 'Quản lý ngân sách, quỹ lương & tuân thủ Luật FFP UEFA' }
};

function makeStaff(data) {
  const meta = STAFF_ROLE_META[data.roleKey] || {};
  return {
    staffId: data.staffId,
    npcId: data.npcId || meta.npcId || `npc_${data.roleKey}`,
    roleKey: data.roleKey,
    role: data.role || meta.title || 'Nhân sự PSG',
    dept: data.dept || meta.dept || 'Ban Huấn Luyện',
    deptId: data.deptId || meta.deptId || 'coaching',
    isCoachingStaff: data.isCoachingStaff ?? !!meta.isCoachingStaff,
    name: data.name,
    age: data.age,
    nationality: data.nationality,
    currentClub: data.currentClub || 'Paris Saint-Germain',
    status: data.status || 'active', // 'active' | 'departed' | 'candidate'
    experience: data.experience || 82,
    achievements: data.achievements || ['Kinh nghiệm dày dạn tại các giải VĐQG hàng đầu Châu Âu'],
    tacticalStyle: data.tacticalStyle || 'Kiểm soát bóng & Pressing tầm cao (4-3-3)',
    youthDev: data.youthDev || 82,
    dressingRoom: data.dressingRoom || 83,
    reputation: data.reputation || 84,
    overall: data.overall || 84,
    specialty: data.specialty || meta.duty || 'Chuyên môn bóng đá đỉnh cao',
    ratings: data.ratings || {
      tactics: 82, fitness: 80, technical: 82, gk: 70, analysis: 80, medical: 65, management: 82, scouting: 78
    },
    personality: data.personality || 'Cẩn thận',
    wage: data.wage || 45, // k€/tuần
    contractYears: data.contractYears || 3,
    signedDate: data.signedDate || '01/07/2025',
    expiryDate: data.expiryDate || '30/06/2028',
    schedule: data.schedule || '08:30 Chuẩn bị giáo án · 09:00–12:00 Tập sáng · 14:30–16:30 Tập chiều & Báo cáo',
    currentDuty: data.currentDuty || meta.duty || 'Thực hiện nhiệm vụ chuyên môn',
    home: data.home || meta.home || { x: -26.0, z: 6.5 },
    pitchSpot: data.pitchSpot !== undefined ? data.pitchSpot : (meta.pitchSpot || null),
    appearance: data.appearance || { outfit: meta.isCoachingStaff ? 'coach_psg' : 'suit_navy', skin: 0xf2c6a0, hair: 0x2c1d11, hairStyle: 0 },
    morale: 86,
    relation: 82
  };
}

export function createInitialStaffDatabase() {
  const active = [
    // 12 CHỨC VỤ BAN HUẤN LUYỆN PSG
    makeStaff({
      staffId: 'stf_hc_01', roleKey: 'head_coach', name: 'Luis Enrique', age: 55, nationality: 'Tây Ban Nha',
      experience: 90, reputation: 91, overall: 91, youthDev: 86, dressingRoom: 85,
      tacticalStyle: '4-3-3 Kiểm soát bóng & Gegenpressing hiện đại',
      achievements: ['Vô địch UEFA Champions League (2015, 2025)', 'Vô địch Ligue 1 & Coupe de France', 'Cú ăn ba lịch sử cùng Barcelona'],
      ratings: { tactics: 93, fitness: 86, technical: 90, gk: 74, analysis: 91, medical: 72, management: 88, scouting: 82 },
      personality: 'Thẳng thắn', wage: 195, contractYears: 3,
      appearance: { outfit: 'coach_psg', skin: 0xe0ac82, hair: 0x5c5c5c, hairStyle: 2 }
    }),
    makeStaff({
      staffId: 'stf_am_01', roleKey: 'assistant_manager', name: 'Rafel Pol', age: 39, nationality: 'Tây Ban Nha',
      experience: 84, reputation: 83, overall: 86, youthDev: 85, dressingRoom: 88,
      tacticalStyle: 'Phối hợp nhịp độ & Điều phối nhóm tập',
      achievements: ['Trợ lý số 1 cùng Luis Enrique vô địch Ligue 1 & UCL', 'Cựu trợ lý ĐT Tây Ban Nha'],
      ratings: { tactics: 87, fitness: 88, technical: 84, gk: 70, analysis: 86, medical: 75, management: 87, scouting: 78 },
      personality: 'Nhiệt tình', wage: 52, contractYears: 3,
      appearance: { outfit: 'coach_psg', skin: 0xf2c6a0, hair: 0x2c1d11, hairStyle: 0 }
    }),
    makeStaff({
      staffId: 'stf_tc_01', roleKey: 'tactical_coach', name: 'Aitor Unzué', age: 35, nationality: 'Tây Ban Nha',
      experience: 80, reputation: 80, overall: 85, youthDev: 82, dressingRoom: 81,
      tacticalStyle: 'Cấu trúc cự ly đội hình & Chuyển trạng thái nhanh',
      achievements: ['Chuyên gia sơ đồ 4-3-3 & 3-2-5 khi có bóng tại PSG'],
      ratings: { tactics: 90, fitness: 76, technical: 82, gk: 68, analysis: 91, medical: 66, management: 79, scouting: 80 },
      personality: 'Cẩn thận', wage: 38, contractYears: 3,
      appearance: { outfit: 'coach_psg', skin: 0xf2c6a0, hair: 0x141414, hairStyle: 2 }
    }),
    makeStaff({
      staffId: 'stf_fc_01', roleKey: 'fitness_coach', name: 'Pedro Gómez', age: 44, nationality: 'Tây Ban Nha',
      experience: 86, reputation: 84, overall: 87, youthDev: 80, dressingRoom: 84,
      tacticalStyle: 'Chu kỳ tải vận động khoa học & Phòng chống quá tải',
      achievements: ['Tối ưu nền tảng thể lực cường độ cao cho PSG mùa 2025/26'],
      ratings: { tactics: 74, fitness: 92, technical: 72, gk: 64, analysis: 84, medical: 86, management: 82, scouting: 68 },
      personality: 'Thẳng thắn', wage: 40, contractYears: 3,
      appearance: { outfit: 'coach_psg', skin: 0xe0ac82, hair: 0x2c1d11, hairStyle: 0 }
    }),
    makeStaff({
      staffId: 'stf_tech_01', roleKey: 'technical_coach', name: 'Joaquín Valdés', age: 47, nationality: 'Tây Ban Nha',
      experience: 85, reputation: 82, overall: 86, youthDev: 86, dressingRoom: 87,
      tacticalStyle: 'Kỹ thuật xử lý bước một, dứt điểm & tâm lý thi đấu',
      achievements: ['Chuyên gia rèn dứt điểm & bản lĩnh thi đấu cho hàng công PSG'],
      ratings: { tactics: 80, fitness: 78, technical: 91, gk: 68, analysis: 82, medical: 70, management: 85, scouting: 75 },
      personality: 'Hòa đồng', wage: 36, contractYears: 3,
      appearance: { outfit: 'coach_psg', skin: 0xf2c6a0, hair: 0x4a321f, hairStyle: 0 }
    }),
    makeStaff({
      staffId: 'stf_gk_01', roleKey: 'gk_coach', name: 'Borja Álvarez', age: 38, nationality: 'Tây Ban Nha',
      experience: 83, reputation: 82, overall: 86, youthDev: 84, dressingRoom: 83,
      tacticalStyle: 'Thủ môn chơi chân hiện đại & phản xạ cự ly gần',
      achievements: ['Nâng tầm khả năng phát bóng & cản phá cho Donnarumma'],
      ratings: { tactics: 78, fitness: 80, technical: 82, gk: 92, analysis: 80, medical: 70, management: 80, scouting: 74 },
      personality: 'Cẩn thận', wage: 35, contractYears: 3,
      appearance: { outfit: 'coach_psg', skin: 0xf6d5b8, hair: 0x2c1d11, hairStyle: 2 }
    }),
    makeStaff({
      staffId: 'stf_agk_01', roleKey: 'asst_gk_coach', name: 'Jean-Luc Aubert', age: 42, nationality: 'Pháp',
      experience: 79, reputation: 76, overall: 81, youthDev: 83, dressingRoom: 82,
      tacticalStyle: 'Huấn luyện không chiến, bắt bóng bổng & phản xạ tầm thấp',
      achievements: ['Đào tạo thủ môn trẻ xuất sắc tại hệ thống bóng đá Pháp'],
      ratings: { tactics: 72, fitness: 78, technical: 76, gk: 86, analysis: 76, medical: 68, management: 76, scouting: 70 },
      personality: 'Hòa đồng', wage: 24, contractYears: 2,
      appearance: { outfit: 'coach_psg', skin: 0xf2c6a0, hair: 0x6b4c2e, hairStyle: 0 }
    }),
    makeStaff({
      staffId: 'stf_ta_01', roleKey: 'tactical_analyst', name: 'Lucas Ferreira', age: 31, nationality: 'Bồ Đào Nha',
      experience: 78, reputation: 79, overall: 84, youthDev: 78, dressingRoom: 77,
      tacticalStyle: 'Phân tích dữ liệu xG, pressing trap & băng hình đối thủ',
      achievements: ['Xây dựng hệ thống phân tích video thời gian thực cho PSG'],
      ratings: { tactics: 86, fitness: 70, technical: 76, gk: 66, analysis: 91, medical: 64, management: 74, scouting: 85 },
      personality: 'Cẩn thận', wage: 28, contractYears: 3,
      appearance: { outfit: 'media', skin: 0xe0ac82, hair: 0x141414, hairStyle: 2 }
    }),
    makeStaff({
      staffId: 'stf_pa_01', roleKey: 'performance_analyst', name: 'Hugo Delmas', age: 33, nationality: 'Pháp',
      experience: 77, reputation: 77, overall: 83, youthDev: 79, dressingRoom: 79,
      tacticalStyle: 'Theo dõi GPS, tốc độ bứt tốc, quãng đường di chuyển & tải cơ',
      achievements: ['Chuyên gia khoa học dữ liệu thể thao Ligue 1'],
      ratings: { tactics: 78, fitness: 85, technical: 75, gk: 65, analysis: 89, medical: 80, management: 75, scouting: 76 },
      personality: 'Cẩn thận', wage: 26, contractYears: 3,
      appearance: { outfit: 'media', skin: 0xf6d5b8, hair: 0x4a321f, hairStyle: 0 }
    }),
    makeStaff({
      staffId: 'stf_rh_01', roleKey: 'rehab_coach', name: 'Guillem Hernández', age: 36, nationality: 'Tây Ban Nha',
      experience: 81, reputation: 80, overall: 85, youthDev: 78, dressingRoom: 84,
      tacticalStyle: 'Phục hồi chức năng cơ bắp, cân bằng động & trở lại sân an toàn',
      achievements: ['Rút ngắn 20% thời gian hồi phục chấn thương dây chằng & gân kheo'],
      ratings: { tactics: 70, fitness: 89, technical: 72, gk: 62, analysis: 80, medical: 90, management: 78, scouting: 65 },
      personality: 'Cẩn thận', wage: 30, contractYears: 3,
      appearance: { outfit: 'medical', skin: 0xf2c6a0, hair: 0x2c1d11, hairStyle: 2 }
    }),
    makeStaff({
      staffId: 'stf_id_01', roleKey: 'individual_dev_coach', name: 'Thomas Moreau', age: 37, nationality: 'Pháp',
      experience: 80, reputation: 79, overall: 84, youthDev: 90, dressingRoom: 85,
      tacticalStyle: 'Lộ trình cá nhân hóa cho cầu thủ trẻ U21 & tân binh đội một',
      achievements: ['Giúp Zaïre-Emery & Doué tăng trưởng vượt bậc về tư duy chiến thuật'],
      ratings: { tactics: 82, fitness: 80, technical: 87, gk: 68, analysis: 84, medical: 70, management: 84, scouting: 82 },
      personality: 'Nhiệt tình', wage: 28, contractYears: 3,
      appearance: { outfit: 'coach_psg', skin: 0xf6d5b8, hair: 0x6b4c2e, hairStyle: 0 }
    }),
    makeStaff({
      staffId: 'stf_sp_01', roleKey: 'set_piece_coach', name: 'Nicolas Girard', age: 40, nationality: 'Pháp',
      experience: 82, reputation: 80, overall: 85, youthDev: 78, dressingRoom: 80,
      tacticalStyle: 'Bài phối hợp phạt góc biến hóa, đá phạt trực tiếp & chống bóng chết',
      achievements: ['Tăng 32% hiệu suất ghi bàn từ tình huống cố định tại Ligue 1'],
      ratings: { tactics: 88, fitness: 75, technical: 85, gk: 74, analysis: 87, medical: 65, management: 78, scouting: 75 },
      personality: 'Tham vọng', wage: 30, contractYears: 3,
      appearance: { outfit: 'coach_psg', skin: 0xe0ac82, hair: 0x141414, hairStyle: 0 }
    }),

    // CÁC CHỨC VỤ LÃNH ĐẠO CHỦ CHỐT CÓ THỂ QUẢN LÝ / THAY THẾ
    makeStaff({
      staffId: 'stf_sd_01', roleKey: 'sporting_director', name: 'Luís Campos', age: 60, nationality: 'Bồ Đào Nha',
      experience: 94, reputation: 92, overall: 93, youthDev: 90, dressingRoom: 84,
      tacticalStyle: 'Tuyển mộ tài năng trẻ bùng nổ kết hợp ngôi sao chiến lược',
      achievements: ['Kiến trúc sư chuyển nhượng tại AS Monaco, LOSC Lille & PSG'],
      ratings: { tactics: 82, fitness: 70, technical: 78, gk: 65, analysis: 89, medical: 65, management: 91, scouting: 95 },
      personality: 'Tham vọng', wage: 110, contractYears: 3,
      appearance: { outfit: 'suit_navy', skin: 0xe0ac82, hair: 0x777777, hairStyle: 0 }
    }),
    makeStaff({
      staffId: 'stf_ad_01', roleKey: 'academy_director', name: 'Yohan Cabaye', age: 40, nationality: 'Pháp',
      experience: 82, reputation: 84, overall: 87, youthDev: 91, dressingRoom: 88,
      tacticalStyle: 'Bóng đá kiểm soát kỹ thuật bản sắc Paris cho U15–U19–Dự bị',
      achievements: ['Cựu tuyển thủ Pháp, nâng cấp toàn diện Học viện PSG'],
      ratings: { tactics: 83, fitness: 80, technical: 86, gk: 66, analysis: 82, medical: 70, management: 86, scouting: 88 },
      personality: 'Nhiệt tình', wage: 48, contractYears: 3,
      appearance: { outfit: 'coach_psg', skin: 0xf2c6a0, hair: 0x2c1d11, hairStyle: 2 }
    }),
    makeStaff({
      staffId: 'stf_med_01', roleKey: 'head_medical', name: 'BS. Christophe Baudot', age: 50, nationality: 'Pháp',
      experience: 90, reputation: 88, overall: 89, youthDev: 74, dressingRoom: 85,
      tacticalStyle: 'Y học thể thao hiện đại, phòng ngừa chấn thương dây chằng & cơ',
      achievements: ['Trưởng bộ phận Y tế PSG, chuyên gia đầu ngành bóng đá Pháp'],
      ratings: { tactics: 62, fitness: 88, technical: 65, gk: 60, analysis: 84, medical: 94, management: 84, scouting: 62 },
      personality: 'Cẩn thận', wage: 55, contractYears: 4,
      appearance: { outfit: 'medical', skin: 0xf2c6a0, hair: 0x4a321f, hairStyle: 0 }
    }),
    makeStaff({
      staffId: 'stf_cfo_01', roleKey: 'cfo', name: 'Jean-Baptiste Laurent', age: 47, nationality: 'Pháp',
      experience: 90, reputation: 87, overall: 91, youthDev: 70, dressingRoom: 78,
      tacticalStyle: 'Quản trị dòng tiền bền vững & tối ưu tuân thủ UEFA FFP',
      achievements: ['Đưa doanh thu PSG vượt mốc €800M/mùa giải'],
      ratings: { tactics: 65, fitness: 60, technical: 60, gk: 55, analysis: 92, medical: 60, management: 93, scouting: 72 },
      personality: 'Bảo thủ', wage: 68, contractYears: 4,
      appearance: { outfit: 'suit_charcoal', skin: 0xf2c6a0, hair: 0x2c1d11, hairStyle: 0 }
    })
  ];

  const candidates = [
    // ỨNG VIÊN HLV TRƯỞNG
    makeStaff({
      staffId: 'cand_hc_01', roleKey: 'head_coach', name: 'Xabi Alonso', age: 44, nationality: 'Tây Ban Nha',
      currentClub: 'Bayer 04 Leverkusen', status: 'candidate',
      experience: 86, reputation: 93, overall: 93, youthDev: 90, dressingRoom: 91,
      tacticalStyle: '3-4-2-1 / 4-3-3 Kiểm soát nhịp độ & Pressing cấu trúc',
      achievements: ['Vô địch Bundesliga bất bại (2023/24)', 'Cúp Quốc gia Đức', 'HLV xuất sắc nhất năm Châu Âu'],
      ratings: { tactics: 95, fitness: 87, technical: 92, gk: 75, analysis: 94, medical: 75, management: 92, scouting: 85 },
      personality: 'Cẩn thận', wage: 210, contractYears: 4,
      appearance: { outfit: 'coach_psg', skin: 0xf2c6a0, hair: 0x6b4c2e, hairStyle: 2 }
    }),
    makeStaff({
      staffId: 'cand_hc_02', roleKey: 'head_coach', name: 'Zinédine Zidane', age: 53, nationality: 'Pháp',
      currentClub: 'Tự do', status: 'candidate',
      experience: 92, reputation: 97, overall: 94, youthDev: 84, dressingRoom: 96,
      tacticalStyle: '4-3-3 Linh hoạt đẳng cấp ngôi sao & Bản lĩnh Champions League',
      achievements: ['3 chức vô địch UEFA Champions League liên tiếp', '2 chức vô địch La Liga', 'Biểu tượng bóng đá Pháp'],
      ratings: { tactics: 91, fitness: 85, technical: 94, gk: 74, analysis: 88, medical: 74, management: 97, scouting: 84 },
      personality: 'Ngoại giao', wage: 245, contractYears: 3,
      appearance: { outfit: 'coach_psg', skin: 0xe0ac82, hair: 0x8a8a8a, hairStyle: 0 }
    }),
    makeStaff({
      staffId: 'cand_hc_03', roleKey: 'head_coach', name: 'Jürgen Klopp', age: 58, nationality: 'Đức',
      currentClub: 'Tự do', status: 'candidate',
      experience: 95, reputation: 96, overall: 94, youthDev: 91, dressingRoom: 95,
      tacticalStyle: '4-3-3 Gegenpressing tốc độ cao & Chuyển trạng thái bùng nổ',
      achievements: ['UEFA Champions League (2019)', 'Premier League (2020)', '2x Bundesliga'],
      ratings: { tactics: 93, fitness: 94, technical: 88, gk: 76, analysis: 90, medical: 78, management: 96, scouting: 88 },
      personality: 'Nhiệt tình', wage: 235, contractYears: 4,
      appearance: { outfit: 'coach_psg', skin: 0xf6d5b8, hair: 0x8a8a8a, hairStyle: 2 }
    }),
    makeStaff({
      staffId: 'cand_hc_04', roleKey: 'head_coach', name: 'Simone Inzaghi', age: 50, nationality: 'Ý',
      currentClub: 'Inter Milan', status: 'candidate',
      experience: 88, reputation: 90, overall: 91, youthDev: 82, dressingRoom: 89,
      tacticalStyle: '3-5-2 Tổ chức phòng ngự chặt chẽ & Phản công bài bản',
      achievements: ['Vô địch Serie A', 'Chung kết UEFA Champions League', '3x Coppa Italia'],
      ratings: { tactics: 94, fitness: 88, technical: 85, gk: 78, analysis: 92, medical: 76, management: 89, scouting: 82 },
      personality: 'Thẳng thắn', wage: 185, contractYears: 3,
      appearance: { outfit: 'coach_psg', skin: 0xf2c6a0, hair: 0x141414, hairStyle: 2 }
    }),
    makeStaff({
      staffId: 'cand_hc_05', roleKey: 'head_coach', name: 'Julian Nagelsmann', age: 38, nationality: 'Đức',
      currentClub: 'ĐT Đức', status: 'candidate',
      experience: 84, reputation: 89, overall: 89, youthDev: 92, dressingRoom: 83,
      tacticalStyle: '4-2-3-1 / 3-4-3 Hiện đại dựa trên dữ liệu & Pressing chủ động',
      achievements: ['Vô địch Bundesliga', 'HLV trẻ xuất sắc nhất châu Âu'],
      ratings: { tactics: 92, fitness: 87, technical: 86, gk: 74, analysis: 94, medical: 74, management: 84, scouting: 86 },
      personality: 'Tham vọng', wage: 175, contractYears: 4,
      appearance: { outfit: 'coach_psg', skin: 0xf6d5b8, hair: 0x4a321f, hairStyle: 2 }
    }),
    makeStaff({
      staffId: 'cand_hc_06', roleKey: 'head_coach', name: 'Roberto De Zerbi', age: 46, nationality: 'Ý',
      currentClub: 'Olympique de Marseille', status: 'candidate',
      experience: 82, reputation: 85, overall: 87, youthDev: 88, dressingRoom: 82,
      tacticalStyle: '4-2-3-1 Triển khai bóng từ tuyến dưới cực kỳ táo bạo',
      achievements: ['Tạo dấu ấn chiến thuật mạnh tại Premier League & Ligue 1'],
      ratings: { tactics: 90, fitness: 82, technical: 88, gk: 76, analysis: 89, medical: 70, management: 82, scouting: 81 },
      personality: 'Thẳng thắn', wage: 145, contractYears: 3,
      appearance: { outfit: 'coach_psg', skin: 0xe0ac82, hair: 0x2c1d11, hairStyle: 2 }
    }),

    // ỨNG VIÊN GIÁM ĐỐC THỂ THAO
    makeStaff({
      staffId: 'cand_sd_01', roleKey: 'sporting_director', name: 'Michael Edwards', age: 46, nationality: 'Anh',
      currentClub: 'Tự do', status: 'candidate', experience: 92, reputation: 93, overall: 93, youthDev: 88, dressingRoom: 86,
      tacticalStyle: 'Phân tích dữ liệu nâng cao & Tối ưu ROI chuyển nhượng',
      achievements: ['Xây dựng thế hệ vô địch UCL & Premier League tại Liverpool'],
      ratings: { tactics: 80, fitness: 70, technical: 75, gk: 65, analysis: 96, medical: 72, management: 92, scouting: 96 },
      personality: 'Cẩn thận', wage: 115, contractYears: 4
    }),
    makeStaff({
      staffId: 'cand_sd_02', roleKey: 'sporting_director', name: 'Andrea Berta', age: 54, nationality: 'Ý',
      currentClub: 'Tự do', status: 'candidate', experience: 90, reputation: 89, overall: 90, youthDev: 84, dressingRoom: 85,
      tacticalStyle: 'Đàm phán cứng rắn & Săn ngôi sao Nam Mỹ / Châu Âu',
      achievements: ['Hơn 10 năm thành công cùng Atlético de Madrid'],
      ratings: { tactics: 78, fitness: 68, technical: 74, gk: 64, analysis: 88, medical: 66, management: 90, scouting: 93 },
      personality: 'Tham vọng', wage: 98, contractYears: 3
    }),

    // ỨNG VIÊN BAN HUẤN LUYỆN & PHÒNG BAN KHÁC
    makeStaff({
      staffId: 'cand_am_01', roleKey: 'assistant_manager', name: 'Pepijn Lijnders', age: 43, nationality: 'Hà Lan',
      currentClub: 'Tự do', status: 'candidate', experience: 85, reputation: 86, overall: 88, youthDev: 90, dressingRoom: 87,
      tacticalStyle: 'Pressing cường độ cao & Phát triển cầu thủ trẻ',
      achievements: ['Cựu trợ lý HLV trưởng Liverpool vô địch UCL & Premier League'],
      ratings: { tactics: 89, fitness: 88, technical: 87, gk: 70, analysis: 88, medical: 74, management: 86, scouting: 82 },
      personality: 'Nhiệt tình', wage: 58, contractYears: 3
    }),
    makeStaff({
      staffId: 'cand_fc_01', roleKey: 'fitness_coach', name: 'Antonio Pintus', age: 63, nationality: 'Ý',
      currentClub: 'Real Madrid', status: 'candidate', experience: 96, reputation: 95, overall: 95, youthDev: 82, dressingRoom: 89,
      tacticalStyle: 'Phương pháp Pintus — Đỉnh cao sức bền & bứt tốc mùa xuân',
      achievements: ['5 chức vô địch UEFA Champions League cùng Real Madrid'],
      ratings: { tactics: 76, fitness: 98, technical: 74, gk: 65, analysis: 88, medical: 91, management: 86, scouting: 68 },
      personality: 'Thẳng thắn', wage: 62, contractYears: 3
    }),
    makeStaff({
      staffId: 'cand_fc_02', roleKey: 'fitness_coach', name: 'Grégory Dupont', age: 53, nationality: 'Pháp',
      currentClub: 'Tự do', status: 'candidate', experience: 89, reputation: 88, overall: 89, youthDev: 83, dressingRoom: 85,
      tacticalStyle: 'Khoa học thể lực ĐT Pháp vô địch World Cup 2018',
      achievements: ['Vô địch World Cup 2018 cùng ĐT Pháp', 'Cựu Trưởng thể lực Real Madrid'],
      ratings: { tactics: 74, fitness: 94, technical: 72, gk: 64, analysis: 89, medical: 90, management: 84, scouting: 66 },
      personality: 'Cẩn thận', wage: 48, contractYears: 3
    }),
    makeStaff({
      staffId: 'cand_tc_01', roleKey: 'tactical_coach', name: 'Juanma Lillo', age: 60, nationality: 'Tây Ban Nha',
      currentClub: 'Tự do', status: 'candidate', experience: 93, reputation: 89, overall: 91, youthDev: 86, dressingRoom: 85,
      tacticalStyle: 'Bóng đá vị trí (Juego de Posición) bậc thầy',
      achievements: ['Cựu trợ lý chiến thuật Pep Guardiola vô địch cú ăn ba Man City'],
      ratings: { tactics: 95, fitness: 78, technical: 88, gk: 70, analysis: 94, medical: 68, management: 86, scouting: 84 },
      personality: 'Cẩn thận', wage: 54, contractYears: 2
    }),
    makeStaff({
      staffId: 'cand_tech_01', roleKey: 'technical_coach', name: 'Thierry Henry', age: 48, nationality: 'Pháp',
      currentClub: 'Tự do', status: 'candidate', experience: 84, reputation: 93, overall: 90, youthDev: 90, dressingRoom: 91,
      tacticalStyle: 'Hoàn thiện kỹ năng dứt điểm, di chuyển không bóng & bản lĩnh tiền đạo',
      achievements: ['Huyền thoại bóng đá Pháp, HCB Olympic Paris 2024'],
      ratings: { tactics: 84, fitness: 82, technical: 96, gk: 68, analysis: 86, medical: 70, management: 88, scouting: 82 },
      personality: 'Tham vọng', wage: 65, contractYears: 3
    }),
    makeStaff({
      staffId: 'cand_gk_01', roleKey: 'gk_coach', name: 'Christophe Lollichon', age: 62, nationality: 'Pháp',
      currentClub: 'Tự do', status: 'candidate', experience: 93, reputation: 90, overall: 91, youthDev: 86, dressingRoom: 85,
      tacticalStyle: 'Phản xạ góc hẹp & làm chủ vòng cấm chuẩn Premier League',
      achievements: ['15 năm tại Chelsea, đào tạo Petr Čech & Thibaut Courtois'],
      ratings: { tactics: 80, fitness: 82, technical: 84, gk: 96, analysis: 86, medical: 72, management: 84, scouting: 80 },
      personality: 'Cẩn thận', wage: 46, contractYears: 3
    }),
    makeStaff({
      staffId: 'cand_ta_01', roleKey: 'tactical_analyst', name: 'Carles Planchart', age: 53, nationality: 'Tây Ban Nha',
      currentClub: 'Tự do', status: 'candidate', experience: 91, reputation: 88, overall: 91, youthDev: 80, dressingRoom: 82,
      tacticalStyle: 'Phân tích video chuyên sâu thời gian thực & giải mã đối thủ UCL',
      achievements: ['Trưởng bộ phận phân tích chiến thuật gắn bó với Pep Guardiola'],
      ratings: { tactics: 91, fitness: 72, technical: 78, gk: 68, analysis: 96, medical: 66, management: 82, scouting: 88 },
      personality: 'Cẩn thận', wage: 42, contractYears: 3
    }),
    makeStaff({
      staffId: 'cand_ad_01', roleKey: 'academy_director', name: 'Patrick Kluivert', age: 49, nationality: 'Hà Lan',
      currentClub: 'Tự do', status: 'candidate', experience: 86, reputation: 89, overall: 89, youthDev: 93, dressingRoom: 88,
      tacticalStyle: 'Triết lý đào tạo trẻ La Masia kết hợp tốc độ hiện đại',
      achievements: ['Cựu Giám đốc Học viện FC Barcelona & PSG'],
      ratings: { tactics: 84, fitness: 78, technical: 90, gk: 66, analysis: 82, medical: 68, management: 87, scouting: 90 },
      personality: 'Hòa đồng', wage: 58, contractYears: 3
    }),
    makeStaff({
      staffId: 'cand_med_01', roleKey: 'head_medical', name: 'BS. Hans-Wilhelm Müller', age: 57, nationality: 'Đức',
      currentClub: 'Tự do', status: 'candidate', experience: 94, reputation: 93, overall: 93, youthDev: 75, dressingRoom: 87,
      tacticalStyle: 'Chẩn đoán cơ xương khớp đỉnh cao & hồi phục nhanh không tái phát',
      achievements: ['Chuyên gia y học thể thao hàng đầu Bundesliga & ĐT Đức'],
      ratings: { tactics: 60, fitness: 90, technical: 65, gk: 60, analysis: 88, medical: 97, management: 86, scouting: 62 },
      personality: 'Cẩn thận', wage: 64, contractYears: 4
    }),
    makeStaff({
      staffId: 'cand_cfo_01', roleKey: 'cfo', name: 'Frédéric Longuépée', age: 58, nationality: 'Pháp',
      currentClub: 'Tự do', status: 'candidate', experience: 92, reputation: 90, overall: 92, youthDev: 72, dressingRoom: 82,
      tacticalStyle: 'Tối ưu doanh thu thương mại, bản quyền & cân bằng FFP',
      achievements: ['Cựu lãnh đạo tài chính cấp cao PSG & Ligue 1'],
      ratings: { tactics: 68, fitness: 60, technical: 60, gk: 55, analysis: 94, medical: 60, management: 94, scouting: 75 },
      personality: 'Ngoại giao', wage: 74, contractYears: 4
    }),
    makeStaff({
      staffId: 'cand_sp_01', roleKey: 'set_piece_coach', name: 'Nicolas Jover', age: 44, nationality: 'Pháp',
      currentClub: 'Arsenal', status: 'candidate', experience: 87, reputation: 91, overall: 92, youthDev: 80, dressingRoom: 84,
      tacticalStyle: 'Bậc thầy phạt góc & đá phạt trực tiếp hiệu suất số 1 châu Âu',
      achievements: ['Giúp Arsenal dẫn đầu châu Âu về bàn thắng tình huống cố định'],
      ratings: { tactics: 92, fitness: 78, technical: 88, gk: 76, analysis: 93, medical: 66, management: 83, scouting: 78 },
      personality: 'Tham vọng', wage: 46, contractYears: 3
    })
  ];

  return {
    active,
    departed: [],
    candidates,
    history: [
      {
        id: 'stf_hist_0',
        date: '01/07/2025',
        action: 'Bổ nhiệm',
        roleKey: 'head_coach',
        role: 'HLV Trưởng',
        staffId: 'stf_hc_01',
        name: 'Luis Enrique',
        reason: 'Xây dựng triết lý kiểm soát bóng & chinh phục UEFA Champions League',
        cost: 0
      }
    ]
  };
}
