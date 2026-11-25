// src/matchday/MatchdayReportEngine.js
// Tạo 5 Báo Cáo Chuyên Môn Ban Huấn Luyện độc lập sau mỗi trận Matchday,
// phản ánh chính xác 100% diễn biến, tỷ số, thống kê, điểm cầu thủ, thể lực, thẻ phạt & chấn thương.

export function buildFiveStaffReports(matchResult, state) {
  const {
    fixture,
    psgIsHome,
    homeGoals,
    awayGoals,
    psgGoals,
    oppGoals,
    psgWon,
    psgDrew,
    oppName,
    stats,
    events,
    ratings,
    lineRatings,
    motm,
    plan,
    injuriesInMatch,
    subRecords
  } = matchResult;

  const staffDb = state.staffDb?.active || [];
  const getStaffName = (roleKey, fallback) => staffDb.find((s) => s.roleKey === roleKey)?.name || fallback;

  const hcName = state.coach?.name || getStaffName('head_coach', 'Luis Enrique');
  const tacticianName = getStaffName('tactical_analyst', 'Aitor Unzué');
  const fitnessName = getStaffName('fitness_coach', 'Rafel Pol');
  const gkCoachName = getStaffName('goalkeeper_coach', 'Borja Álvarez');
  const devCoachName = getStaffName('youth_coach', 'David Fernández');

  const psgPoss = psgIsHome ? stats.homePoss : stats.awayPoss;
  const oppPoss = 100 - psgPoss;
  const psgShots = psgIsHome ? stats.homeShots : stats.awayShots;
  const psgOnTarget = psgIsHome ? stats.homeOnTarget : stats.awayOnTarget;
  const psgXg = psgIsHome ? stats.homeXg : stats.awayXg;
  const oppShots = psgIsHome ? stats.awayShots : stats.homeShots;
  const oppOnTarget = psgIsHome ? stats.awayOnTarget : stats.homeOnTarget;
  const oppXg = psgIsHome ? stats.awayXg : stats.homeXg;
  const psgBigChances = psgIsHome ? stats.homeBigChances : stats.awayBigChances;

  const sortedRatings = [...ratings].sort((a, b) => b.rating - a.rating);
  const top3 = sortedRatings.slice(0, 3);
  const lowPlayers = sortedRatings.filter((r) => r.rating < 6.3);
  const redCardsPsg = events.filter((e) => e.type === 'red' && e.isPsg);
  const yellowCardsPsg = events.filter((e) => e.type === 'yellow' && e.isPsg);
  const lateGoals = events.filter((e) => e.type === 'goal' && e.minute >= 78);

  // 1. Báo cáo HLV Trưởng
  const turningPoints = [];
  if (redCardsPsg.length > 0) turningPoints.push(`Thẻ đỏ của ${redCardsPsg[0].playerName} (${redCardsPsg[0].minute}') khiến đội hình phải đá thiếu người.`);
  if (lateGoals.length > 0) turningPoints.push(`Bàn thắng muộn ở phút ${lateGoals[lateGoals.length - 1].minute}' của ${lateGoals[lateGoals.length - 1].scorerName} định đoạt cục diện.`);
  if (subRecords.length > 0) turningPoints.push(`Thực hiện ${subRecords.length} lượt thay người trong trận (${subRecords.map((s) => `${s.inName} ${s.minute}'`).join(', ')}).`);
  if (turningPoints.length === 0) turningPoints.push('Thế trận duy trì theo nhịp độ kiểm soát đã chuẩn bị trước giờ bóng lăn.');

  const proposals = [];
  if (!psgWon) {
    proposals.push({
      id: `prop_${fixture.id}_1`,
      text: 'Đề xuất tăng cường bài tập chuyển trạng thái phòng ngự và dứt điểm 1 chạm trong tuần tới.',
      actionType: 'drill',
      status: 'Chờ duyệt'
    });
  } else {
    proposals.push({
      id: `prop_${fixture.id}_1`,
      text: 'Đề xuất giữ nguyên khung chiến thuật hiện tại và cho nhóm đá chính đủ 90 phút tập hồi phục nhẹ.',
      actionType: 'rest',
      status: 'Chờ duyệt'
    });
  }

  const headCoachReport = {
    key: 'head_coach',
    title: 'Báo cáo HLV Trưởng',
    author: hcName,
    role: 'HLV Trưởng PSG',
    verdictBadge: psgWon ? 'Đạt yêu cầu' : psgDrew ? 'Cần cải thiện dứt điểm' : 'Đáng báo động',
    summary: psgWon
      ? `PSG giành chiến thắng ${homeGoals}-${awayGoals} trước ${oppName}. Sơ đồ ${plan.formation} vận hành mạch lạc với ngôi sao sáng nhất ${motm.name} (${motm.rating} điểm).`
      : psgDrew
        ? `Trận hòa ${homeGoals}-${awayGoals} trước ${oppName} để lại nhiều tiếc nuối khi PSG kiểm soát ${psgPoss}% bóng nhưng chưa tận dụng hết ${psgBigChances} cơ hội lớn.`
        : `Thất bại ${homeGoals}-${awayGoals} trước ${oppName} là bài học đắt giá. Tôi nhận trách nhiệm chuyên môn và sẽ rà soát ngay các điểm hở chiến thuật.`,
    highlights: [
      `Bước ngoặt trận đấu: ${turningPoints.join(' ')}`,
      `Điểm sáng nổi bật: ${top3.map((p) => `${p.name} (${p.rating})`).join(', ')}.`,
      lowPlayers.length > 0
        ? `Cầu thủ dưới phong độ: ${lowPlayers.map((p) => `${p.name} (${p.rating})`).join(', ')} cần nhắc nhở riêng.`
        : 'Không có cầu thủ nào tụt điểm phong độ quá sâu.'
    ],
    recommendations: [
      oppGoals >= 2 ? 'Điều chỉnh cự ly hàng thủ & hỗ trợ đánh chặn từ tiền vệ phòng ngự.' : 'Duy trì áp lực pressing tầm cao trong 25 phút đầu trận.',
      yellowCardsPsg.length >= 3 ? 'Kiểm soát kỷ luật thi đấu để tránh thẻ phạt tích lũy.' : 'Giữ nhịp xoay tua hợp lý cho vòng đấu kế tiếp.'
    ],
    proposals
  };

  // 2. Báo cáo Phân tích Chiến thuật
  const convRate = psgOnTarget > 0 ? Math.round((psgGoals / psgOnTarget) * 100) : 0;
  const tacticalAnalystReport = {
    key: 'tactical_analyst',
    title: 'Báo cáo Phân tích Chiến thuật',
    author: tacticianName,
    role: 'Chuyên gia Phân tích Chiến thuật',
    verdictBadge: `${plan.formation} · xG ${psgXg} - ${oppXg}`,
    summary: `Sơ đồ ${plan.formation} (${plan.tacticName}) đạt độ phù hợp AI ${plan.avgSuitability}/100. PSG cầm bóng ${psgPoss}% vs ${oppPoss}%, tung ${psgShots} cú sút (${psgOnTarget} trúng đích), hiệu suất chuyển hóa ${convRate}%.`,
    highlights: [
      `Điểm trung bình các tuyến: Thủ môn ${lineRatings.GK} · Hậu vệ ${lineRatings.DEF} · Tiền vệ ${lineRatings.MID} · Tiền đạo ${lineRatings.ATT}.`,
      `Tạo ra ${psgBigChances} cơ hội rõ rệt (xG ${psgXg}), trong khi đối thủ có ${oppShots} cú sút (${oppOnTarget} trúng đích, xG ${oppXg}).`,
      psgPoss >= 56
        ? 'Tuyến giữa kiểm soát không gian trung lộ tốt, đẩy lùi khối đội hình đối thủ.'
        : 'Đối thủ tranh chấp quyết liệt ở khu vực giữa sân khiến bóng luân chuyển biên nhiều hơn.'
    ],
    recommendations: [
      lineRatings.DEF < 6.7 ? 'Cần thu hẹp khoảng trống giữa trung vệ và hậu vệ biên khi chuyển trạng thái.' : 'Hàng thủ giữ bẫy việt vị và cự ly tuyến tốt.',
      psgGoals < Math.floor(psgXg) ? 'Cải thiện chất lượng ra quyết định ở 1/3 sân cuối cùng.' : 'Tận dụng tốt các tình huống xâm nhập vòng cấm.'
    ]
  };

  // 3. Báo cáo Thể lực
  const squad = state.getPsgSquad();
  const tiredList = [...ratings]
    .map((r) => {
      const pl = squad.find((p) => p.id === r.id);
      return { name: r.name, minutes: r.minutes, fitness: pl?.health?.fitness ?? 78, fatigue: pl?.health?.fatigue ?? 35 };
    })
    .sort((a, b) => b.fatigue - a.fatigue);
  const overloadPlayers = tiredList.filter((x) => x.fatigue >= 58 || x.fitness < 72);
  const avgPostFitness = tiredList.length
    ? Math.round(tiredList.reduce((s, x) => s + x.fitness, 0) / tiredList.length)
    : 82;

  const fitnessCoachReport = {
    key: 'fitness_coach',
    title: 'Báo cáo Thể lực',
    author: fitnessName,
    role: 'HLV Thể lực & Phục hồi',
    verdictBadge: overloadPlayers.length > 0 ? `${overloadPlayers.length} cầu thủ cần hồi phục` : `Thể lực TB ${avgPostFitness}%`,
    summary: `Nền tảng thể lực trung bình sau trận của nhóm thi đấu đạt ${avgPostFitness}%. ${injuriesInMatch.length > 0 ? `Ghi nhận ${injuriesInMatch.length} ca chấn thương trong trận: ${injuriesInMatch.map((i) => `${i.playerName} (${i.days} ngày)`).join(', ')}.` : 'Không phát sinh chấn thương mới trong 90 phút thi đấu.'}`,
    highlights: [
      `Nhóm hao tổn thể lực cao nhất: ${tiredList.slice(0, 3).map((x) => `${x.name} (TL ${x.fitness}%, mệt ${x.fatigue}%)`).join(' · ')}.`,
      subRecords.length > 0
        ? `Việc thay ${subRecords.length} cầu thủ đúng thời điểm giúp giảm tải áp lực cơ bắp cuối trận.`
        : 'Các cầu thủ đá trọn 90 phút cần được theo dõi chỉ số hồi phục trong 48 giờ tới.'
    ],
    recommendations: [
      overloadPlayers.length > 0
        ? `Khuyến nghị cho ${overloadPlayers.slice(0, 3).map((x) => x.name).join(', ')} tập hồi phục Cryotherapy & giảm tải buổi tập kế tiếp.`
        : 'Toàn đội đáp ứng tốt cường độ vận động, sẵn sàng cho giáo án chiến thuật tuần tới.'
    ]
  };

  // 4. Báo cáo Thủ môn
  const gkRating = ratings.find((r) => r.position === 'GK');
  const psgSaves = psgIsHome ? stats.homeSaves : stats.awaySaves;
  const gkNotes = [];
  if (oppGoals === 0) gkNotes.push('Giữ sạch lưới hoàn toàn, làm chủ khu vực 5m50 và chỉ huy hàng thủ chắc chắn.');
  else if (psgSaves >= 4) gkNotes.push(`Thực hiện ${psgSaves} pha cứu thua quan trọng trước ${oppOnTarget} cú sút trúng đích (xG đối thủ ${oppXg}).`);
  else gkNotes.push(`Cứu thua ${psgSaves} lần nhưng đối mặt với những pha dứt điểm cận thành hiểm hóc (thua ${oppGoals} bàn).`);

  const goalkeeperCoachReport = {
    key: 'goalkeeper_coach',
    title: 'Báo cáo Thủ môn',
    author: gkCoachName,
    role: 'HLV Thủ môn',
    verdictBadge: gkRating ? `${gkRating.name} · ${gkRating.rating}đ` : 'Chưa có dữ liệu',
    summary: gkRating
      ? `Thủ môn ${gkRating.name} đạt ${gkRating.rating}/10 điểm trong trận gặp ${oppName}. ${gkNotes[0]}`
      : 'Không có thủ môn PSG được ghi nhận trong trận đấu này.',
    highlights: [
      `Số pha cứu thua: ${psgSaves} · Số bàn thua: ${oppGoals} · Đối mặt sút trúng đích: ${oppOnTarget}.`,
      `Phát động bóng từ tuyến dưới ổn định, phối hợp nhịp nhàng với cặp trung vệ.`
    ],
    recommendations: [
      oppGoals >= 2
        ? 'Tập bổ sung phản xạ cự ly gần và tình huống cố định chống bóng bổng.'
        : 'Duy trì nhịp độ tập phản xạ và giao tiếp với hàng phòng ngự.'
    ]
  };

  // 5. Báo cáo Phát triển Cầu thủ
  const youngPlayed = ratings.filter((r) => (r.age || 25) <= 22);
  const youngUnused = [...(plan.bench || []), ...(plan.unused || [])].filter((p) => (p.age || 25) <= 22);
  const topYoung = [...youngPlayed].sort((a, b) => b.rating - a.rating)[0];

  const playerDevelopmentReport = {
    key: 'player_development',
    title: 'Báo cáo Phát triển Cầu thủ',
    author: devCoachName,
    role: 'Trưởng Bộ phận Phát triển Cầu thủ',
    verdictBadge: youngPlayed.length > 0 ? `${youngPlayed.length} cầu thủ U22 ra sân` : 'Chưa dùng cầu thủ trẻ',
    summary: youngPlayed.length > 0
      ? `Có ${youngPlayed.length} cầu thủ trẻ (U22) được thi đấu trận này. Nổi bật nhất là ${topYoung.name} (${topYoung.age} tuổi) với ${topYoung.rating} điểm sau ${topYoung.minutes} phút.`
      : 'Trận đấu có tính chất căng thẳng nên HLV trưởng ưu tiên các cầu thủ giàu kinh nghiệm.',
    highlights: [
      youngPlayed.length > 0
        ? `Chi tiết nhóm trẻ thi đấu: ${youngPlayed.map((y) => `${y.name} (${y.minutes}', ${y.rating}đ${y.goals ? `, ${y.goals}G` : ''})`).join(' · ')}.`
        : 'Các cầu thủ trẻ vẫn tích lũy quan sát chiến thuật từ băng ghế dự bị.',
      youngUnused.length > 0
        ? `Tài năng trẻ chờ cơ hội tiếp theo: ${youngUnused.slice(0, 3).map((y) => `${y.name} (${y.position}, OVR ${y.ovr})`).join(', ')}.`
        : 'Không còn cầu thủ trẻ U22 ngoài sân chưa được đăng ký.'
    ],
    recommendations: [
      topYoung && topYoung.rating >= 7.2
        ? `${topYoung.name} đang tiến bộ rất nhanh — phù hợp tiếp tục trao phút thi đấu ở các vòng tới.`
        : 'Cân nhắc tạo 20–30 phút cuối trận cho các tài năng học viện khi đội đã tạo cách biệt an toàn.'
    ]
  };

  return {
    head_coach: headCoachReport,
    tactical_analyst: tacticalAnalystReport,
    fitness_coach: fitnessCoachReport,
    goalkeeper_coach: goalkeeperCoachReport,
    player_development: playerDevelopmentReport,
    orderedKeys: ['head_coach', 'tactical_analyst', 'fitness_coach', 'goalkeeper_coach', 'player_development']
  };
}
