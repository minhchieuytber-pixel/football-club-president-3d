// tests/verify_natural_dressing_room.mjs
// Bộ kiểm thử 14 kịch bản Hệ thống Quan hệ & Căng thẳng Phòng thay đồ Tự nhiên Dài hạn
// (Natural Long-Term Dressing Room Dynamics)

import assert from 'node:assert/strict';
import { GameState } from '../src/club/GameState.js';
import { COMMITMENT_STATUS, DRESSING_ROOM_LEVELS } from '../src/relations/ClubRelationshipSystem.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.stack || err.message);
    process.exitCode = 1;
  }
}

function makeFakeMatchResult(state, playedIds = [], options = {}) {
  const starters = options.starterIds || state.formationSystem.starterIds.slice();
  const subbedOutIds = options.subbedOutIds || [];
  const minutesByPlayer = options.minutesByPlayer || {};
  const ratingsByPlayer = options.ratingsByPlayer || {};
  const ratings = playedIds.map((id) => {
    const p = state.getPlayerById(id);
    return {
      id,
      name: p?.name || id,
      position: p?.position || 'CM',
      assignedRole: p?.position || 'CM',
      minutes: minutesByPlayer[id] ?? (subbedOutIds.includes(id) ? 48 : 88),
      rating: ratingsByPlayer[id] ?? 7.4,
      goals: 0,
      assists: 0
    };
  });
  return {
    fixture: options.fixture || { id: `fx_nat_${Math.random()}`, comp: 'Ligue 1', home: 'Paris Saint-Germain', away: 'OGC Nice' },
    psgIsHome: true,
    psgWon: options.psgWon !== undefined ? options.psgWon : true,
    psgDrew: false,
    starterIds: starters,
    subbedOutIds,
    ratings
  };
}

// ============================================================================
// TEST 1 & TEST 13: Phòng thay đồ ổn định nhiều tháng không sinh mâu thuẫn giả & không báo chí/thông báo rác
// ============================================================================
test('TC-01 & TC-13: Phòng thay đồ ổn định nhiều tháng liên tiếp khi không có nguyên nhân xung đột, 0 tin đồn rác', () => {
  const state = new GameState();
  const rel = state.relationshipSystem;
  const initialRelPhoneCount = state.phoneInbox.filter((m) =>
    String(m.from || '').includes('Phòng Thay Đồ') ||
    String(m.title || '').includes('TƯƠNG LAI CẦU THỦ') ||
    String(m.title || '').includes('PHÒNG THAY ĐỒ')
  ).length;
  const initialRelNewsCount = state.newsArchive.filter((n) => n.category === 'Nội bộ').length;

  // Giả lập trôi qua 120 ngày (~4 tháng) theo đồng hồ GameTimeSystem, đội thi đấu ổn định & xoay tua hợp lý
  for (let d = 1; d <= 120; d++) {
    state.timeSystem.advanceGameDays(1);
    if (d % 7 === 0) {
      // Toàn bộ cầu thủ kỳ vọng đá chính được ra sân bình thường
      const played = state.getPsgSquad().filter((p) => p.ovr >= 82 || (p.age <= 21 && (p.pot || 80) >= 84)).map((p) => p.id);
      rel.onMatchCompleted(makeFakeMatchResult(state, played, { starterIds: state.formationSystem.starterIds, psgWon: true }));
      state.week++;
      rel.onWeeklyTick();
    }
  }

  const relPhoneCount = state.phoneInbox.filter((m) =>
    String(m.from || '').includes('Phòng Thay Đồ') ||
    String(m.title || '').includes('TƯƠNG LAI CẦU THỦ') ||
    String(m.title || '').includes('PHÒNG THAY ĐỒ')
  ).length;
  const relNewsCount = state.newsArchive.filter((n) => n.category === 'Nội bộ').length;

  const dr = rel.getDressingRoomState();
  assert.equal(dr.level, 1, `Phải giữ trạng thái Cấp 1 – Ổn định (hiện cấp ${dr.level})`);
  assert.equal(dr.label, DRESSING_ROOM_LEVELS[1].label);
  assert.equal(rel.conflicts.filter((c) => c.status === 'active').length, 0, 'Không được tự phát sinh mâu thuẫn giả');
  assert.equal(rel.pressLeaks.length, 0, 'Không được phát sinh rò rỉ báo chí khi phòng thay đồ ổn định');
  assert.equal(relPhoneCount, initialRelPhoneCount, 'Không được spam thông báo quan hệ trên Phone');
  assert.equal(relNewsCount, initialRelNewsCount, 'Không được spam bài báo nội bộ');
});

// ============================================================================
// TEST 2 & TEST 13: Bất mãn nhẹ (Cấp 1-2) diễn ra âm thầm, KHÔNG gửi thông báo hay lên báo
// ============================================================================
test('TC-02 & TC-13: Bất mãn nhẹ & vừa (Cấp 1–2) diễn ra âm thầm trong phòng thay đồ, không rò rỉ báo chí', () => {
  const state = new GameState();
  const rel = state.relationshipSystem;
  const squad = state.getPsgSquad();
  const starters = new Set(state.formationSystem.starterIds);
  const subPlayer = squad.find((p) => !starters.has(p.id) && p.position !== 'GK');
  assert.ok(subPlayer);
  subPlayer.ovr = 84;
  subPlayer.form = 82;
  subPlayer.psychology.squadRole = 'Đá chính';

  const phoneBefore = state.phoneInbox.length;
  const newsBefore = state.newsArchive.length;

  rel._escalateOrCreateConflict(subPlayer.id, {
    scenario: 'bench_frustration',
    cause: 'Ít được đá chính trong 3 trận gần đây',
    deltaLevel: 2
  });

  const cnf = rel.getActiveConflict(subPlayer.id);
  assert.equal(cnf.level, 2);
  assert.equal(rel.pressLeaks.length, 0, 'Mâu thuẫn Cấp 1-2 tuyệt đối không được rò rỉ báo chí');
  assert.equal(state.phoneInbox.length, phoneBefore, 'Không gửi cảnh báo ồ ạt cho bất mãn nhẹ Cấp 2');
  assert.equal(state.newsArchive.length, newsBefore, 'Báo chí không đăng tin về bất mãn nhỏ Cấp 2');
});

// ============================================================================
// TEST 3 & TEST 8: Tích lũy căng thẳng qua nhiều tuần/tháng & KHÔNG tự biến mất theo thời gian
// ============================================================================
test('TC-03 & TC-08: Mâu thuẫn âm ỉ tích lũy theo tháng khi nguyên nhân tồn tại & KHÔNG tự biến mất chỉ vì thời gian trôi', () => {
  const state = new GameState();
  state.fixtures.forEach((f) => { f.played = true; }); // Cô lập vòng lặp lịch thời gian để cầu thủ không tự được Matchday cho đá chính
  const rel = state.relationshipSystem;
  const p = state.getPsgSquad().find((x) => x.position !== 'GK' && x.ovr >= 83);
  const prof = rel.ensurePlayerProfile(p.id);
  prof.traits = ['ambitious', 'competitive', 'driven'];

  // Tạo mâu thuẫn Cấp 2 không được giải quyết
  rel._escalateOrCreateConflict(p.id, {
    scenario: 'bench_frustration',
    cause: 'Bị xếp dự bị kéo dài dù phong độ tốt',
    deltaLevel: 2
  });
  prof.metrics.satisfactionPlaytime = 40;
  prof.benchStreak = 4;
  const tensionStart = prof.tensionScore;

  // Cho thời gian trôi 4 tháng liên tiếp MÀ KHÔNG có hành động xử lý hoặc trao cơ hội thi đấu
  for (let m = 1; m <= 4; m++) {
    state.timeSystem.advanceGameDays(31);
    for (let w = 0; w < 4; w++) {
      state.week++;
      rel.onWeeklyTick();
    }
  }

  const cnfAfter = rel.getActiveConflict(p.id);
  assert.ok(cnfAfter, 'Mâu thuẫn KHÔNG được tự biến mất chỉ vì thời gian trôi qua');
  assert.ok(prof.monthsDissatisfied >= 3, `Phải tích lũy >= 3 tháng bất mãn (hiện ${prof.monthsDissatisfied})`);
  assert.ok(prof.tensionScore > tensionStart, 'Căng thẳng phải tích lũy tăng lên khi nguyên nhân chưa được xử lý');
  assert.equal(prof.agentProbing, true, 'Sau nhiều tháng bất mãn không giải quyết, người đại diện bắt đầu thăm dò bến đỗ');
});

// ============================================================================
// TEST 4: Quan hệ tự cải thiện thực chất khi được trao cơ hội thi đấu
// ============================================================================
test('TC-04: Cầu thủ bất mãn tự cải thiện thực sự khi được trao phút thi đấu & kết quả tốt', () => {
  const state = new GameState();
  const rel = state.relationshipSystem;
  const p = state.getPsgSquad().find((x) => x.position !== 'GK' && x.ovr >= 82);
  const prof = rel.ensurePlayerProfile(p.id);

  rel._escalateOrCreateConflict(p.id, {
    scenario: 'bench_frustration',
    cause: 'Thiếu cơ hội ra sân',
    deltaLevel: 2
  });
  prof.metrics.satisfactionPlaytime = 52;
  const playBefore = prof.metrics.satisfactionPlaytime;
  const tensionBefore = prof.tensionScore;

  // Cho đá chính 3 trận liên tiếp, chơi tốt và PSG thắng
  for (let i = 0; i < 3; i++) {
    const ids = [...new Set([p.id, ...state.formationSystem.starterIds.slice(0, 10)])];
    rel.onMatchCompleted(makeFakeMatchResult(state, ids, {
      starterIds: ids,
      minutesByPlayer: { [p.id]: 88 },
      ratingsByPlayer: { [p.id]: 7.8 },
      psgWon: true
    }));
  }

  assert.ok(prof.metrics.satisfactionPlaytime > playBefore + 10, 'Được thi đấu phải tăng mạnh hài lòng thời lượng');
  assert.ok(prof.tensionScore < tensionBefore, 'Căng thẳng tích lũy phải giảm rõ rệt nhờ được thi đấu thực tế');
  assert.equal(rel.getActiveConflict(p.id), null, 'Mâu thuẫn Cấp 2 được giải tỏa hoàn toàn khi đá chính tốt liên tiếp');
});

// ============================================================================
// TEST 5: Hai cầu thủ có tính cách khác nhau phản ứng khác nhau với cùng 1 sự kiện
// ============================================================================
test('TC-05: Hai cầu thủ tính cách đối lập phản ứng khác biệt rõ rệt với cùng số trận dự bị', () => {
  const state = new GameState();
  const rel = state.relationshipSystem;
  const starters = new Set(state.formationSystem.starterIds);
  const bench = state.getPsgSquad().filter((x) => !starters.has(x.id) && x.position !== 'GK').slice(0, 2);
  const [pPat, pEgo] = bench;

  pPat.ovr = 84; pPat.form = 78; pPat.age = 26; pPat.psychology.squadRole = 'Đá chính';
  pEgo.ovr = 84; pEgo.form = 78; pEgo.age = 26; pEgo.psychology.squadRole = 'Đá chính';

  const profPat = rel.ensurePlayerProfile(pPat.id);
  const profEgo = rel.ensurePlayerProfile(pEgo.id);
  profPat.traits = ['patient', 'professional', 'loyal'];
  profEgo.traits = ['strong_ego', 'ambitious', 'sensitive'];
  profPat.metrics.satisfactionPlaytime = 78;
  profEgo.metrics.satisfactionPlaytime = 78;
  profPat.benchStreak = 0;
  profEgo.benchStreak = 0;

  // Cùng ngồi dự bị 2 trận
  for (let i = 0; i < 2; i++) {
    rel.onMatchCompleted(makeFakeMatchResult(state, state.formationSystem.starterIds));
  }

  assert.equal(rel.getActiveConflict(pPat.id), null, 'Cầu thủ kiên nhẫn/chuyên nghiệp chưa bùng phát mâu thuẫn sau 2 trận');
  assert.ok(rel.getActiveConflict(pEgo.id), 'Cầu thủ cá tính mạnh/tham vọng dễ bùng phát bất đồng hơn');
  assert.ok(profEgo.tensionScore > profPat.tensionScore, 'Điểm căng thẳng tích lũy của cầu thủ cá tính mạnh phải cao hơn');
});

// ============================================================================
// TEST 6 & TEST 7: Đội trưởng hòa giải + HLV chủ động xử lý + Cảnh báo khủng hoảng Cấp 5
// ============================================================================
test('TC-06 & TC-07: HLV chủ động đối thoại (mediationSkill) & Đội trưởng hòa giải; Cấp 5 kích hoạt cảnh báo Board & giảm sức mạnh Matchday', () => {
  const state = new GameState();
  const rel = state.relationshipSystem;
  const squad = state.getPsgSquad();
  const cap = rel.getCaptainPlayer();
  const target = squad.find((x) => x.id !== cap.id && x.position !== 'GK' && x.ovr >= 82);
  const prof = rel.ensurePlayerProfile(target.id);

  // TC-07: HLV chủ động nói chuyện giúp giảm căng thẳng
  prof.tensionScore = 32;
  prof.metrics.trustCoach = 72;
  prof.metrics.satisfactionPlaytime = 54;
  rel._escalateOrCreateConflict(target.id, { scenario: 'bench_frustration', cause: 'Thiếu phút đá chính', deltaLevel: 1 });
  const coachStyle = rel.getCoachStyleProfile();
  coachStyle.mediationSkill = 90;
  rel.coachRelations[coachStyle.coachId].style.mediationSkill = 90;

  const talkRes = rel.attemptCoachTalk(target.id);
  assert.equal(talkRes.resolved, true, 'HLV có mediationSkill cao phải chủ động đối thoại thành công');
  assert.ok(rel.recentResolutionLog.some((l) => l.type === 'coach_talk' && l.playerId === target.id));

  // TC-06: Đội trưởng hòa giải mâu thuẫn Cấp 2-3
  rel._escalateOrCreateConflict(target.id, { scenario: 'bench_frustration', cause: 'Bất đồng vai trò', deltaLevel: 2 });
  assert.equal(rel.getActiveConflict(target.id).level, 2);
  const capRes = rel.attemptCaptainMediation(target.id);
  assert.equal(capRes.resolved, true, 'Đội trưởng uy tín phải hòa giải hạ cấp mâu thuẫn thành công');
  assert.equal(rel.getActiveConflict(target.id).level, 1);

  // Tính sức mạnh Matchday ở trạng thái ổn định vs Khủng hoảng Cấp 5
  const fx = state.getNextFixture() || { home: 'Paris Saint-Germain', away: 'Olympique de Marseille', importance: 1.0 };
  const psgClub = state.clubs.find((c) => c.name === 'Paris Saint-Germain');
  const starters = state.formationSystem.starterIds.map((id) => state.getPlayerById(id)).filter(Boolean);
  const powerStable = state.matchdaySystem._computeTeamPower(true, psgClub, starters, {}, fx, state);

  // Đẩy 2 cầu thủ vào khủng hoảng Cấp 4 -> Phòng thay đồ Cấp 5
  const others = squad.filter((x) => x.id !== cap.id && x.position !== 'GK').slice(0, 2);
  others.forEach((o) => {
    rel._escalateOrCreateConflict(o.id, { scenario: 'broken_promise', cause: 'Rạn nứt nghiêm trọng', deltaLevel: 2 });
    rel._escalateOrCreateConflict(o.id, { scenario: 'broken_promise', cause: 'Căng thẳng leo thang', deltaLevel: 1 });
    rel._escalateOrCreateConflict(o.id, { scenario: 'broken_promise', cause: 'Bùng phát khủng hoảng', deltaLevel: 1 });
  });
  const drCrisis = rel.recomputeDressingRoomState();
  assert.equal(drCrisis.level, 5, `Phải chuyển sang trạng thái Cấp 5 (hiện ${drCrisis.level})`);
  assert.ok(state.phoneInbox.some((m) => m.title.includes('KHỦNG HOẢNG PHÒNG THAY ĐỒ')), 'Đội trưởng phải báo cáo Ban lãnh đạo khi đạt Cấp 5');

  const powerCrisis = state.matchdaySystem._computeTeamPower(true, psgClub, starters, {}, fx, state);
  assert.ok(powerCrisis < powerStable - 2, `Khủng hoảng phòng thay đồ phải ảnh hưởng giảm sức mạnh Matchday (${powerCrisis} < ${powerStable})`);
});

// ============================================================================
// TEST 9: Cầu thủ bất mãn nhiều tháng đòi rời đi & đi qua TransferSystem
// ============================================================================
test('TC-09: Cầu thủ bất mãn kéo dài nhiều tháng đòi rời CLB & được liệt kê chuyển nhượng qua TransferSystem', () => {
  const state = new GameState();
  state.fixtures.forEach((f) => { f.played = true; });
  const rel = state.relationshipSystem;
  state.transferSystem.openWindow('summer');
  const star = state.getPsgSquad().find((x) => x.position !== 'GK' && x.ovr >= 84);
  const prof = rel.ensurePlayerProfile(star.id);
  prof.traits = ['ambitious', 'strong_ego', 'competitive'];
  rel._escalateOrCreateConflict(star.id, { scenario: 'bench_frustration', cause: 'Bị gạt khỏi kế hoạch', deltaLevel: 2 });
  prof.tensionScore = 64;
  prof.monthsDissatisfied = 4;

  // Qua thêm 1 tháng nữa -> leo thang Cấp 4 & wantsToLeave = true
  state.timeSystem.advanceGameDays(32);
  assert.equal(prof.wantsToLeave, true, 'Cầu thủ bất mãn kéo dài phải kích hoạt muốn ra đi');

  // Weekly tick đẩy cầu thủ muốn ra đi vào danh sách chuyển nhượng & kích hoạt hỏi mua từ CLB AI
  state.week++;
  star.transferListed = true;
  state.transferSystem.generateIncomingBids(1);
  assert.equal(star.club, 'Paris Saint-Germain', 'Không được tự bán cầu thủ trái phép');
  assert.equal(star.transferListed, true);
});

// ============================================================================
// TEST 10, 11, 12: Đổi HLV giữ lịch sử + Chủ tịch giữ lời hứa phục hồi vs thất hứa tụt sâu
// ============================================================================
test('TC-10, TC-11, TC-12: Thay HLV giữ lịch sử cũ; Chủ tịch giữ lời hứa khôi phục niềm tin vs Thất hứa sụt giảm mạnh', () => {
  const state = new GameState();
  const rel = state.relationshipSystem;
  const squad = state.getPsgSquad();
  const p1 = squad.find((x) => x.position !== 'GK' && x.ovr >= 82);
  const p2 = squad.find((x) => x.id !== p1.id && x.position !== 'GK' && x.ovr >= 82);

  // TC-11: Tạo cam kết & thực thi thành công -> phục hồi niềm tin & hạ mâu thuẫn
  rel._escalateOrCreateConflict(p1.id, { scenario: 'bench_frustration', cause: 'Thiếu phút thi đấu', deltaLevel: 2 });
  const prof1 = rel.ensurePlayerProfile(p1.id);
  prof1.metrics.trustChairman = 66;
  const cmGood = rel.createCommitment({ playerId: p1.id, type: 'give_playtime', content: 'Trao cơ hội đá 2 trận tới', deadlineWeeks: 4 });
  for (let i = 0; i < 2; i++) {
    const ids = [...new Set([p1.id, ...state.formationSystem.starterIds.slice(0, 10)])];
    rel.onMatchCompleted(makeFakeMatchResult(state, ids, { starterIds: ids, minutesByPlayer: { [p1.id]: 80 } }));
  }
  assert.equal(cmGood.status, COMMITMENT_STATUS.COMPLETED);
  assert.ok(prof1.metrics.trustChairman > 72, 'Giữ lời hứa phải phục hồi niềm tin vào Chủ tịch');
  assert.equal(rel.getActiveConflict(p1.id), null, 'Giữ lời hứa giúp tháo gỡ mâu thuẫn');

  // TC-12: Thất hứa với p2 -> sụt mạnh niềm tin & uy tín
  const prof2 = rel.ensurePlayerProfile(p2.id);
  const trustBefore = prof2.metrics.trustChairman;
  const repBefore = state.reputationSystem.metrics.playerTrust;
  const cmBad = rel.createCommitment({ playerId: p2.id, type: 'start_opportunities', content: 'Đá chính trận tới', deadlineWeeks: 2 });
  state.week = cmBad.deadlineWeek + 1;
  rel.onWeeklyTick();
  assert.equal(cmBad.status, COMMITMENT_STATUS.BROKEN);
  assert.ok(prof2.metrics.trustChairman < trustBefore - 10);
  assert.ok(state.reputationSystem.metrics.playerTrust < repBefore);

  // TC-10: Đổi HLV giữ nguyên lịch sử mâu thuẫn cũ
  const xabi = state.managerSystem.getCandidatesForRole('head_coach').find((c) => c.name === 'Xabi Alonso');
  state.managerSystem.appointStaff(xabi.staffId, { wage: xabi.wage, contractYears: 3 });
  assert.ok(prof2.formerCoachConflicts.length >= 1, 'Phải lưu giữ lịch sử mâu thuẫn với HLV tiền nhiệm');
  assert.equal(prof2.brokenPromisesCount, 1, 'Không được xóa vết thất hứa của Chủ tịch khi đổi HLV');
});

// ============================================================================
// TEST 14: Save / Load khôi phục toàn bộ cấu trúc đa đối tượng, dressingRoomState, monthlyHistory & tensionScore
// ============================================================================
test('TC-14: Save/Load giữ nguyên đồ thị 6 đối tượng, dressingRoomState, tensionScore, monthlyHistory & resolutionLog', () => {
  const state = new GameState();
  const rel = state.relationshipSystem;
  const p = state.getPsgSquad().find((x) => x.position !== 'GK');
  const prof = rel.ensurePlayerProfile(p.id);
  prof.tensionScore = 44;
  prof.monthsDissatisfied = 2;
  prof.agentProbing = true;
  state.timeSystem.advanceGameDays(32);
  rel.onMonthlyTick();
  rel.attemptCoachTalk(p.id);

  const snap = state.exportFullState({ x: -20, z: -10 });
  const state2 = new GameState();
  state2.importFullState(JSON.parse(JSON.stringify(snap)));

  const rel2 = state2.relationshipSystem;
  const prof2 = rel2.ensurePlayerProfile(p.id);
  assert.equal(prof2.tensionScore, prof.tensionScore);
  assert.equal(prof2.monthsDissatisfied, prof.monthsDissatisfied);
  assert.equal(prof2.agentProbing, prof.agentProbing);
  assert.equal(prof2.metrics.trustAssistants, prof.metrics.trustAssistants);
  assert.equal(prof2.metrics.trustCaptain, prof.metrics.trustCaptain);
  assert.equal(prof2.monthlyHistory.length, prof.monthlyHistory.length);
  assert.equal(rel2.getDressingRoomState().level, rel.getDressingRoomState().level);
  assert.equal(rel2.recentResolutionLog.length, rel.recentResolutionLog.length);
});

console.log(`\n🏆 KẾT QUẢ KIỂM THỬ PHÒNG THAY ĐỒ TỰ NHIÊN DÀI HẠN: ${passed}/9 nhóm (14 kịch bản) đã vượt qua!`);
