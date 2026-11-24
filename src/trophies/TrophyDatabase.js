// src/trophies/TrophyDatabase.js
// Cơ sở dữ liệu danh mục giải đấu, mô hình cúp 3D, cột mốc lịch sử PSG (1970–nay) & Phòng Huyền Thoại PSG

export const COMPETITION_CATALOG = {
  ligue_1: {
    competitionId: 'ligue_1',
    competitionName: 'Ligue 1',
    shortName: 'Ligue 1',
    category: 'domestic',
    trophyModel: 'ligue_1',
    matchComp: 'Ligue 1',
    prestigeBonus: 6,
    prizeBonusM: 35.0,
    accentColor: '#d4af37',
    heritageCountPre2026: 13,
    description: 'Giải Vô địch Quốc gia Pháp — Biểu tượng thống trị của Paris Saint-Germain tại đấu trường quốc nội.'
  },
  coupe_de_france: {
    competitionId: 'coupe_de_france',
    competitionName: 'Coupe de France',
    shortName: 'Coupe de France',
    category: 'domestic',
    trophyModel: 'coupe_de_france',
    matchComp: 'Coupe de France',
    prestigeBonus: 4,
    prizeBonusM: 12.0,
    accentColor: '#eab308',
    heritageCountPre2026: 16,
    description: 'Cúp Quốc gia Pháp danh giá ra đời năm 1917 với chiếc cúp Charles Simon truyền thống.'
  },
  trophee_des_champions: {
    competitionId: 'trophee_des_champions',
    competitionName: 'Trophée des Champions',
    shortName: 'Siêu Cúp Pháp',
    category: 'domestic',
    trophyModel: 'trophee_des_champions',
    matchComp: 'Trophée des Champions',
    prestigeBonus: 3,
    prizeBonusM: 5.0,
    accentColor: '#cbd5e1',
    heritageCountPre2026: 13,
    description: 'Siêu cúp Pháp — Trận tranh ngôi mở màn mùa giải giữa nhà vô địch Ligue 1 và Coupe de France.'
  },
  coupe_de_la_ligue: {
    competitionId: 'coupe_de_la_ligue',
    competitionName: 'Coupe de la Ligue',
    shortName: 'Cúp Liên Đoàn',
    category: 'domestic',
    trophyModel: 'coupe_de_la_ligue',
    matchComp: 'Coupe de la Ligue',
    prestigeBonus: 3,
    prizeBonusM: 4.0,
    accentColor: '#94a3b8',
    heritageCountPre2026: 9,
    description: 'Danh hiệu Cúp Liên đoàn Pháp lịch sử mà Paris Saint-Germain giữ kỷ lục vô địch nhiều nhất.'
  },
  ucl: {
    competitionId: 'ucl',
    competitionName: 'UEFA Champions League',
    shortName: 'Champions League',
    category: 'international',
    trophyModel: 'ucl',
    matchComp: 'UEFA Champions League',
    prestigeBonus: 10,
    prizeBonusM: 65.0,
    accentColor: '#f8fafc',
    heritageCountPre2026: 1,
    description: 'Đỉnh cao danh vọng bóng đá châu Âu cấp câu lạc bộ — Chiếc cúp Tai Voi danh giá nhất lục địa già.'
  },
  uefa_super_cup: {
    competitionId: 'uefa_super_cup',
    competitionName: 'UEFA Super Cup',
    shortName: 'Siêu Cúp Châu Âu',
    category: 'international',
    trophyModel: 'uefa_super_cup',
    matchComp: 'UEFA Super Cup',
    prestigeBonus: 5,
    prizeBonusM: 10.0,
    accentColor: '#e2e8f0',
    heritageCountPre2026: 1,
    description: 'Siêu cúp Châu Âu — Cuộc thư hùng giữa nhà vô địch UEFA Champions League và UEFA Europa League.'
  },
  fifa_club_world_cup: {
    competitionId: 'fifa_club_world_cup',
    competitionName: 'FIFA Club World Cup',
    shortName: 'Club World Cup',
    category: 'international',
    trophyModel: 'fifa_club_world_cup',
    matchComp: 'FIFA Club World Cup',
    prestigeBonus: 8,
    prizeBonusM: 45.0,
    accentColor: '#facc15',
    heritageCountPre2026: 0,
    description: 'Giải Vô địch Thế giới các CLB FIFA — Danh hiệu khẳng định vị thế bá chủ bóng đá toàn cầu.'
  }
};

export const PSG_HISTORY_TIMELINE = [
  {
    year: '1970',
    title: 'Ngày Khai Sinh Paris Saint-Germain',
    summary: 'Ngày 12/08/1970, PSG chính thức được thành lập tại thủ đô Paris với khát vọng xây dựng biểu tượng bóng đá Pháp hiện đại.',
    generation: 'Thế hệ Sáng lập (1970–1979)'
  },
  {
    year: '1974',
    title: 'Chính thức Ngự trị tại Parc des Princes',
    summary: 'PSG thăng hạng Division 1 và chuyển về sân vận động huyền thoại Parc des Princes — thánh địa bất khả xâm phạm của người Paris.',
    generation: 'Thế hệ Đỏ-Xanh đầu tiên'
  },
  {
    year: '1982–1986',
    title: 'Những Chiếc Cúp Đầu Tiên & Chức Vô Địch Quốc Gia 1986',
    summary: 'Cú đúp Coupe de France (1982, 1983) cùng ngôi vương Division 1 đầu tiên năm 1986 với nhạc trưởng Safet Sušić.',
    generation: 'Thế hệ Sušić · Rocheteau · Bats'
  },
  {
    year: '1994–1996',
    title: 'Vinh Quang Châu Âu — UEFA Cup Winners\' Cup 1996',
    summary: 'Thế hệ vàng của Raí, George Weah, David Ginola, Youri Djorkaeff đưa PSG vô địch Ligue 1 (1994) và đăng quang Cúp C2 Châu Âu 1996.',
    generation: 'Thế hệ Vàng Thập niên 90'
  },
  {
    year: '2011–2025',
    title: 'Kỷ Nguyên Thống Trị Quốc Nội & Đỉnh Cao Champions League 2025',
    summary: 'PSG thiết lập kỷ lục vô địch Pháp, quy tụ những siêu sao kiệt xuất và hoàn tất giấc mơ UEFA Champions League lịch sử năm 2025.',
    generation: 'Thế hệ Ibrahimović · Cavani · Thiago Silva · Marquinhos · Dembélé'
  },
  {
    year: '2026+',
    title: 'Triều Đại Chủ Tịch Phạm Minh Chiêu — Kỷ Nguyên Bảo Tàng & Toàn Cầu Hóa',
    summary: 'Chủ tịch Phạm Minh Chiêu tái thiết hệ thống điều hành 12 phòng ban, Học viện 100 tài năng trẻ và xây dựng Bảo tàng Danh hiệu PSG.',
    generation: 'Thế hệ Đương đại & Học viện PSG'
  }
];

export const PSG_LEGENDS = [
  {
    legendId: 'leg_marquinhos',
    name: 'Marquinhos',
    shirtNumber: 5,
    position: 'Trung vệ (CB)',
    era: '2013–Nay',
    nationality: 'Brazil',
    apps: '470+',
    goals: '40+',
    trophies: '30+ danh hiệu cùng PSG (kỷ lục CLB)',
    contribution: 'Đội trưởng mẫu mực, biểu tượng lòng trung thành và thủ lĩnh hàng phòng ngự qua nhiều thế hệ.',
    jerseyColor: '#00205b'
  },
  {
    legendId: 'leg_cavani',
    name: 'Edinson Cavani',
    shirtNumber: 9,
    position: 'Tiền đạo cắm (ST)',
    era: '2013–2020',
    nationality: 'Uruguay',
    apps: '301',
    goals: '200',
    trophies: '6 Ligue 1 · 4 Coupe de France · 5 Coupe de la Ligue',
    contribution: 'El Matador với 200 bàn thắng, tinh thần chiến đấu không biết mệt mỏi vì tập thể Paris.',
    jerseyColor: '#00205b'
  },
  {
    legendId: 'leg_ibra',
    name: 'Zlatan Ibrahimović',
    shirtNumber: 10,
    position: 'Tiền đạo (ST)',
    era: '2012–2016',
    nationality: 'Thụy Điển',
    apps: '180',
    goals: '156',
    trophies: '4 Ligue 1 liên tiếp · 3 Vua phá lưới Ligue 1',
    contribution: 'Người đặt nền móng đẳng cấp siêu sao và bản lĩnh thống trị cho kỷ nguyên hiện đại của PSG.',
    jerseyColor: '#00205b'
  },
  {
    legendId: 'leg_rai',
    name: 'Raí',
    shirtNumber: 10,
    position: 'Tiền vệ tấn công (AM)',
    era: '1993–1998',
    nationality: 'Brazil',
    apps: '215',
    goals: '72',
    trophies: 'Ligue 1 1994 · UEFA Cup Winners\' Cup 1996 · 2 Coupe de France',
    contribution: 'Đội trưởng huyền thoại thập niên 1990, linh hồn lối chơi hoa mỹ và tình yêu bất diệt tại Parc des Princes.',
    jerseyColor: '#00205b'
  },
  {
    legendId: 'leg_pauleta',
    name: 'Pedro Miguel Pauleta',
    shirtNumber: 9,
    position: 'Tiền đạo (ST)',
    era: '2003–2008',
    nationality: 'Bồ Đào Nha',
    apps: '211',
    goals: '109',
    trophies: '2 Coupe de France (2004, 2006) · Coupe de la Ligue 2008',
    contribution: 'Đại bàng vùng Azores, người giữ ngọn lửa niềm tin cho người hâm mộ Paris suốt thập niên 2000.',
    jerseyColor: '#00205b'
  },
  {
    legendId: 'leg_thiago',
    name: 'Thiago Silva',
    shirtNumber: 2,
    position: 'Trung vệ (CB)',
    era: '2012–2020',
    nationality: 'Brazil',
    apps: '315',
    goals: '17',
    trophies: '7 Ligue 1 · 5 Coupe de France · Chung kết UCL 2020',
    contribution: 'O Monstro — Một trong những trung vệ xuất sắc nhất lịch sử giải VĐQG Pháp với đẳng cấp đọc tình huống bậc thầy.',
    jerseyColor: '#00205b'
  },
  {
    legendId: 'leg_susic',
    name: 'Safet Sušić',
    shirtNumber: 10,
    position: 'Tiền vệ kiến thiết (AM)',
    era: '1982–1991',
    nationality: 'Nam Tư / Bosnia',
    apps: '344',
    goals: '85',
    trophies: 'Division 1 1986 · Coupe de France 1983',
    contribution: 'Nghệ sĩ sân cỏ vĩ đại nhất thế kỷ 20 của PSG, dẫn dắt CLB đến chức vô địch Pháp đầu tiên.',
    jerseyColor: '#00205b'
  },
  {
    legendId: 'leg_verratti',
    name: 'Marco Verratti',
    shirtNumber: 6,
    position: 'Tiền vệ trung tâm (CM)',
    era: '2012–2023',
    nationality: 'Ý',
    apps: '416',
    goals: '11',
    trophies: '9 Ligue 1 (Kỷ lục cầu thủ vô địch Ligue 1 nhiều nhất lịch sử)',
    contribution: 'Nhạc trưởng tuyến giữa gắn bó hơn một thập kỷ, biểu tượng kiểm soát bóng của PSG.',
    jerseyColor: '#00205b'
  }
];

export function resolveCompetitionByMatchComp(matchComp) {
  if (!matchComp) return null;
  const values = Object.values(COMPETITION_CATALOG);
  return values.find((c) => c.matchComp === matchComp || c.competitionName === matchComp || c.competitionId === matchComp) || null;
}

export function getHeritageTotalCount() {
  // 13 Ligue 1 + 16 Coupe de France + 13 Trophée des Champions + 9 Coupe de la Ligue + 1 UCL + 1 UEFA Super Cup + 1 Cup Winners' Cup (1996) + 1 Intertoto (2001)
  return Object.values(COMPETITION_CATALOG).reduce((s, c) => s + (c.heritageCountPre2026 || 0), 0) + 2;
}
