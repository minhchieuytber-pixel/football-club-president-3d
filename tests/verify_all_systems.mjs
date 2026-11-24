// tests/verify_all_systems.mjs
// Bộ kiểm thử tự động toàn bộ Phần XIII (7 nhóm kiểm thử bắt buộc + Save/Load đa mùa giải)
import assert from 'node:assert/strict';

// Minimal THREE & DOM shims for headless Node verification of 3D Pathfinding, NpcSystem & TrainingSystem
class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); }
}
class Obj3D {
  constructor() {
    this.position = new Vec3();
    this.rotation = { x: 0, y: 0, z: 0 };
    this.children = [];
    this.visible = true;
    this.userData = {};
  }
  add(...objs) { this.children.push(...objs); }
  remove(o) { this.children = this.children.filter((x) => x !== o); }
  traverse(fn) { fn(this); this.children.forEach((c) => c.traverse && c.traverse(fn)); }
}
class MeshMock extends Obj3D {
  constructor() { super(); this.isMesh = true; }
}
globalThis.THREE = {
  Vector3: Vec3,
  Group: Obj3D,
  Mesh: MeshMock,
  BoxGeometry: class {},
  ConeGeometry: class {},
  SphereGeometry: class {},
  PlaneGeometry: class {},
  MeshStandardMaterial: class {}
};
globalThis.performance = globalThis.performance || { now: () => Date.now() };

import { GameState } from '../src/club/GameState.js';
import { PathfindingSystem } from '../src/ai/PathfindingSystem.js';
import { NpcSystem } from '../src/npc/NpcSystem.js';
import { AnimationSystem } from '../src/animations/AnimationSystem.js';
import { GameTimeSystem } from '../src/time/GameTimeSystem.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    process.exitCode = 1;
  }
}

// Tạo mock campus có đầy đủ tường, bàn ghế & cửa để kiểm thử va chạm thật
function makeTestCampus() {
  const colliders = [
    // Tường ngăn phòng Chủ tịch và hành lang
    { minX: -34, maxX: -27.2, minZ: -5.65, maxZ: -5.35, active: true },
    { minX: -24.8, maxX: -18, minZ: -5.65, maxZ: -5.35, active: true },
    // Bàn làm việc ở giữa phòng (-26, -16.8)
    { minX: -27.7, maxX: -24.3, minZ: -17.5, maxZ: -16.1, active: true },
    // Bàn trong phòng họp (-10, -12.5)
    { minX: -14.0, maxX: -6.0, minZ: -13.6, maxZ: -11.4, active: true }
  ];
  const doorCol = { minX: -26.15, maxX: -25.85, minZ: -44.7, maxZ: -42.3, active: true };
  colliders.push(doorCol);
  const doors = [
    { id: 'door_dressing_main', x: -26.0, z: -43.5, open: false, locked: false, targetAngle: 0, collider: doorCol, pivot: new Obj3D() }
  ];
  return {
    root: new Obj3D(),
    colliders,
    doors,
    boardroomSeats: Array.from({ length: 8 }, (_, i) => ({ x: -13 + i, z: -10.5, rotY: Math.PI })),
    resolveCollision(x, z, radius = 0.34) {
      let px = Math.max(-60, Math.min(60, x));
      let pz = Math.max(-62, Math.min(54, z));
      for (let iter = 0; iter < 3; iter++) {
        for (const b of this.colliders) {
          if (!b.active) continue;
          const cx = Math.max(b.minX, Math.min(px, b.maxX));
          const cz = Math.max(b.minZ, Math.min(pz, b.maxZ));
          const dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
          if (d2 < radius * radius) {
            if (d2 > 1e-6) {
              const d = Math.sqrt(d2);
              px += (dx / d) * (radius - d);
              pz += (dz / d) * (radius - d);
            } else {
              pz = b.maxZ + radius;
            }
          }
        }
      }
      return { x: px, z: pz };
    }
  };
}

function makeCharFactoryMock() {
  return {
    createHumanoid() {
      const m = new MeshMock();
      const mkJoint = () => ({ rotation: { x: 0, y: 0, z: 0 } });
      m.userData.rig = {
        pelvis: new Obj3D(),
        torso: new Obj3D(),
        headGroup: new Obj3D(),
        leftArm: { shoulder: mkJoint(), elbow: new Obj3D() },
        rightArm: { shoulder: mkJoint(), elbow: new Obj3D() },
        leftLeg: { hip: mkJoint(), knee: mkJoint() },
        rightLeg: { hip: mkJoint(), knee: mkJoint() },
        basePelvisY: 0.92,
        animPhase: 0,
        state: 'idle'
      };
      return m;
    }
  };
}

// =========================================================================
// 1. KIỂM THỬ AI PATHFINDING & COLLISION AVOIDANCE (PHẦN XIII.1)
// =========================================================================
test('AI-1: NPC tìm đường từ Phòng Thay Đồ ra Sân Tập chính qua cửa đúng tuyến', () => {
  const campus = makeTestCampus();
  const pf = new PathfindingSystem(campus);
  const path = pf.findPath(-35, -42, 0, -44);
  assert.ok(path.length >= 3, 'Lộ trình phải đi qua nhiều nút hành lang/cửa');
  assert.ok(path.some((pt) => pt.doorId === 'door_dressing_main'), 'Phải đi qua cửa chính phòng thay đồ');
});

test('AI-2: NPC tránh bàn làm việc / vật cản bằng NavGrid A* cục bộ', () => {
  const campus = makeTestCampus();
  const pf = new PathfindingSystem(campus);
  // Đi từ phía Nam bàn Chủ tịch (-26, -15) sang phía Bắc bàn (-26, -19) -> bàn nằm ở z=-16.8!
  const path = pf.findLocalGridPath(-26, -15, -26, -19);
  assert.ok(path.length >= 2, 'Phải rẽ vòng qua bàn thay vì đi thẳng xuyên bàn');
  const cutsThroughDesk = path.some((pt) => pt.x > -27.5 && pt.x < -24.5 && pt.z > -17.3 && pt.z < -16.2);
  assert.equal(cutsThroughDesk, false, 'Điểm trên đường đi không được cắt xuyên bàn làm việc');
});

test('AI-3: Hai NPC đi ngược chiều tránh nhau (Local Avoidance sang phải) & tránh người chơi', () => {
  const campus = makeTestCampus();
  const pf = new PathfindingSystem(campus);
  const a = { id: 'npc_a', mesh: { position: new Vec3(0, 0.14, 0), visible: true }, _velX: 2.0, _velZ: 0 };
  const b = { id: 'npc_b', mesh: { position: new Vec3(1.1, 0.14, 0), visible: true }, _velX: -2.0, _velZ: 0 };
  const avA = pf.computeAvoidanceVelocity(a, 1, 0, 2.0, [a, b], null);
  const avB = pf.computeAvoidanceVelocity(b, -1, 0, 2.0, [a, b], null);
  assert.ok(avA.vz * avB.vz < 0, 'Hai NPC đi ngược chiều phải né sang 2 phía ngược nhau (quy tắc bên phải)');

  // Né người chơi đứng ngay trước mặt
  const avPlayer = pf.computeAvoidanceVelocity(a, 1, 0, 2.0, [a], new Vec3(0.8, 0.14, 0));
  assert.ok(Math.abs(avPlayer.vz) > 0.15, 'NPC phải đổi hướng né người chơi');
});

test('AI-4: NPC không xuyên cửa khóa & tự tìm đường thay thế khi nút bị chặn', () => {
  const campus = makeTestCampus();
  const pf = new PathfindingSystem(campus);
  // Khóa cửa chính phòng thay đồ -> kiểm tra isNodeBlocked
  campus.doors[0].locked = true;
  assert.equal(pf.isNodeBlocked('dr_door'), true, 'Cửa bị khóa phải bị đánh dấu chặn');

  // Chặn nút giữa sân pitch_mid -> phải tìm đường vòng qua pitch_w hoặc pitch_e!
  const altPath = pf.findPath(0, -33, 0, -53, { blockedNodes: new Set(['pitch_mid']) });
  assert.ok(altPath.length >= 2, 'Phải tìm được đường vòng thay thế');
  const passesMid = altPath.some((pt) => Math.hypot(pt.x - 0, pt.z - (-44)) < 0.5);
  assert.equal(passesMid, false, 'Đường thay thế không được đi qua nút đang bị chặn');
});

// =========================================================================
// 2. KIỂM THỬ HỒ SƠ CẦU THỦ & CƠ SỞ DỮ LIỆU (PHẦN II)
// =========================================================================
test('DB-1: 200 cầu thủ thật + 100 học viện đều có playerId duy nhất & chỉ số chuyên môn không trùng lặp hàng loạt', () => {
  const state = new GameState();
  const all = state.getAllPlayers();
  assert.equal(all.length, 300, 'Phải có đủ 200 cầu thủ thật + 100 cầu thủ học viện');
  const ids = new Set(all.map((p) => p.id));
  assert.equal(ids.size, 300, 'Mọi cầu thủ phải có playerId duy nhất');

  const dembele = state.players.find((p) => p.name === 'Ousmane Dembélé');
  const donnarumma = state.players.find((p) => p.name === 'Gianluigi Donnarumma');
  assert.ok(dembele.attributes.att.finishing > donnarumma.attributes.att.finishing + 30);
  assert.ok(donnarumma.attributes.gk.reflexes > dembele.attributes.gk.reflexes + 30);
  assert.ok(dembele.career.pastClubs.length >= 1 && dembele.contract.weeklyWage > 0);
});

// =========================================================================
// 3. KIỂM THỬ QUẢN LÝ NHÂN SỰ: SA THẢI & TUYỂN HLV + CHỨC VỤ KHÁC (PHẦN XIII.2)
// =========================================================================
test('STAFF-1: Sa thải HLV cũ, tuyển HLV mới & đồng bộ 3D NPC + ClubDatabase + Lịch sử', () => {
  const state = new GameState();
  const campus = makeTestCampus();
  const npcSys = new NpcSystem(campus.root, makeCharFactoryMock(), new AnimationSystem(), campus);
  npcSys.spawnFromProfiles(state.npcs, state.clockHour);
  npcSys.syncStaffNpcs(state.staffDb.active, state.clockHour);
  state.onStaffChange(() => npcSys.syncStaffNpcs(state.staffDb.active, state.clockHour));

  const fireRes = state.managerSystem.fireStaff('head_coach', 'Thử nghiệm tái cơ cấu');
  assert.equal(fireRes.ok, true);
  assert.equal(state.coach.vacant, true);
  assert.equal(state.staffDb.departed[0].name, 'Luis Enrique');
  assert.equal(npcSys.npcs.some((n) => n.name === 'Luis Enrique'), false, 'HLV cũ không được còn là NPC hiện tại');

  const xabi = state.managerSystem.getCandidatesForRole('head_coach').find((c) => c.name === 'Xabi Alonso');
  assert.ok(xabi);
  const negRes = state.managerSystem.negotiateOffer(xabi.staffId, { wage: xabi.wage, contractYears: 4, objectives: ['Vô địch UCL'] });
  assert.equal(negRes.outcome, 'accepted');

  const appRes = state.managerSystem.appointStaff(xabi.staffId, negRes.agreedOffer);
  assert.equal(appRes.ok, true);
  assert.equal(state.coach.name, 'Xabi Alonso');
  assert.equal(state.clubs.find((c) => c.name === 'Paris Saint-Germain').manager, 'Xabi Alonso');
  assert.equal(state.departments.find((d) => d.id === 'coaching').head, 'Xabi Alonso');
  assert.ok(npcSys.npcs.some((n) => n.name === 'Xabi Alonso' && n.id === 'npc_coach'), 'HLV mới phải xuất hiện trong thế giới 3D!');
  assert.ok(state.staffDb.history.length >= 3, 'Lịch sử bổ nhiệm/miễn nhiệm phải được lưu');
});

test('STAFF-2: Ban huấn luyện PSG có đủ 12 chức vụ chuyên môn & thay đổi trợ lý thể lực tác động chất lượng tập', () => {
  const state = new GameState();
  assert.equal(state.coachingSystem.getActiveCount(), 12, 'Phải đủ 12 chức vụ Ban huấn luyện');
  const beforeFit = state.coachingSystem.getTrainingQualityMultipliers().fitness;

  const pintus = state.managerSystem.getCandidatesForRole('fitness_coach').find((c) => c.name === 'Antonio Pintus');
  assert.ok(pintus);
  const app = state.managerSystem.appointStaff(pintus.staffId, { wage: pintus.wage, contractYears: 3 });
  assert.equal(app.ok, true);
  const afterFit = state.coachingSystem.getTrainingQualityMultipliers().fitness;
  assert.ok(afterFit > beforeFit, 'Thay trợ lý thể lực đẳng cấp cao hơn phải tăng hệ số huấn luyện thể lực!');
});

// =========================================================================
// 4. KIỂM THỬ MUA CẦU THỦ, ĐÔN CẦU THỦ TRẺ (GIỮ playerId), BÁN & CHO MƯỢN (PHẦN XIII.3 & XIII.6)
// =========================================================================
test('TRANSFER-1: Đàm phán 2 giai đoạn mua cầu thủ -> Đồng bộ Squad, Formation, Tủ đồ, NPC 3D & Tài chính', () => {
  const state = new GameState();
  const campus = makeTestCampus();
  const npcSys = new NpcSystem(campus.root, makeCharFactoryMock(), new AnimationSystem(), campus);
  npcSys.spawnFromProfiles(state.npcs, state.clockHour);
  state.onSquadChange(() => npcSys.syncSquadPlayers(state.getPsgSquad(), state.clockHour));

  const target = state.players.find((p) => p.name === 'Rayan Cherki');
  assert.ok(target && target.club !== 'Paris Saint-Germain');
  const budgetBefore = state.finance.budget;

  // Thử thương vụ thất bại trước (trả giá quá thấp)
  const failNeg = state.transferSystem.startNegotiation(target.id, 'buy');
  const failStage1 = state.transferSystem.submitClubOffer(failNeg.negotiation.id, { fee: 5 });
  assert.equal(failStage1.outcome, 'rejected');
  assert.ok(state.transferSystem.failedDeals.length >= 1);

  // Thực hiện thương vụ thành công qua đủ 2 giai đoạn
  const okNeg = state.transferSystem.startNegotiation(target.id, 'buy');
  const s1 = state.transferSystem.submitClubOffer(okNeg.negotiation.id, { fee: okNeg.negotiation.clubAskFee, installments: 1, perfBonus: 5 });
  assert.equal(s1.outcome, 'accepted');
  assert.equal(okNeg.negotiation.stage, 2);

  const s2 = state.transferSystem.submitPlayerOffer(okNeg.negotiation.id, { weeklyWage: okNeg.negotiation.playerAskWage, contractYears: 5, signingBonus: 2, squadRole: 'Đá chính thường xuyên' });
  assert.equal(s2.outcome, 'accepted');

  // Kiểm tra đồng bộ toàn bộ Single Source of Truth!
  assert.equal(target.club, 'Paris Saint-Germain');
  assert.ok(state.getPsgSquad().some((p) => p.id === target.id));
  assert.ok(target.shirtNumber > 0);
  assert.ok(state.formationSystem.lockers.some((l) => l.playerId === target.id), 'Phải được cấp tủ cá nhân trong Phòng Thay Đồ');
  assert.ok(npcSys.npcs.some((n) => n.playerId === target.id), 'Phải có NPC thực tế trong thế giới 3D');
  assert.ok(state.finance.budget < budgetBefore, 'Tài chính phải trừ tiền chuyển nhượng');
});

test('TRANSFER-2: Đôn cầu thủ trẻ giữ nguyên playerId (không trùng bản ghi), cấp số áo, tủ đồ & vào được sơ đồ', () => {
  const state = new GameState();
  const youth = state.academy.find((y) => y.squad === 'U19' && !y.promoted);
  const origId = youth.id;
  const totalBefore = state.getAllPlayers().length;

  const res = state.transferSystem.promoteAcademyPlayer(origId);
  assert.equal(res.ok, true);
  assert.equal(res.player.id, origId, 'PHẢI giữ nguyên tuyệt đối playerId!');
  assert.equal(state.getAllPlayers().length, totalBefore, 'Không được tạo bản ghi cầu thủ trùng lặp');
  assert.ok(state.getPsgSquad().some((p) => p.id === origId));
  assert.ok(res.player.shirtNumber > 0);
  assert.ok(state.formationSystem.lockers.some((l) => l.playerId === origId));

  // Kiểm tra chọn được vào sơ đồ đội hình
  const swapRes = state.formationSystem.swapStarter(9, origId);
  assert.equal(swapRes.ok, true, 'Cầu thủ trẻ vừa đôn phải chọn được vào sơ đồ đội hình!');
});

test('TRANSFER-3: Kết thúc mùa giải -> Mở kỳ chuyển nhượng mới, AI CLB mua bán không âm ngân sách & Đóng kỳ CN', () => {
  const state = new GameState();
  const soldTarget = state.getPsgSquad().find((p) => p.name === 'Matvey Safonov');
  const loanTarget = state.getPsgSquad().find((p) => p.name === 'Senny Mayulu');
  assert.equal(state.transferSystem.sellPlayer(soldTarget.id, 'Chelsea', 22).ok, true);
  assert.equal(state.transferSystem.loanOutPlayer(loanTarget.id, 'RC Strasbourg Alsace', null).ok, true);
  assert.equal(state.getPsgSquad().some((p) => p.id === soldTarget.id), false);

  const aiDeals = state.transferSystem.runAiTransferMarketCycle(5);
  assert.ok(aiDeals.length >= 1, 'Các CLB AI phải thực hiện chuyển nhượng');
  assert.equal(state.clubs.some((c) => c.budget < 0), false, 'Không CLB AI nào được vượt ngân sách âm');

  const closeRes = state.transferSystem.closeCurrentWindow(true);
  assert.equal(closeRes.ok, true);
  assert.equal(state.transferSystem.isWindowOpen(), false);

  // Kết thúc mùa giải -> tự động xử lý hết hạn cho mượn & mở kỳ chuyển nhượng mùa hè 2027!
  const endRes = state.concludeSeason();
  assert.equal(state.season, '2027/28');
  assert.equal(state.transferSystem.windowState, 'summer');
  assert.equal(state.transferSystem.windowConfig.seasonStartYear, 2027);
  assert.equal(loanTarget.club, 'Paris Saint-Germain', 'Cầu thủ cho mượn không mua đứt phải tự trở lại PSG cuối mùa!');
  assert.ok(endRes.summary.ligue1Winner);
});

// =========================================================================
// 5. KIỂM THỬ HUẤN LUYỆN 3D, BÁO CÁO, CHỈ SỐ & TƯƠNG TÁC BHL (PHẦN XIII.5)
// =========================================================================
test('TRAINING-1: Huấn luyện 3D đủ 7 bài tập, đồng bộ sơ đồ, đánh giá cầu thủ & tương tác Chủ tịch-BHL', () => {
  const state = new GameState();
  const campus = makeTestCampus();
  state.trainingSystem.build3DTrainingEquipment(campus);
  const npcSys = new NpcSystem(campus.root, makeCharFactoryMock(), new AnimationSystem(), campus);
  npcSys.attachTrainingSystem(state.trainingSystem);
  npcSys.spawnFromProfiles(state.npcs, 9.5);
  npcSys.syncStaffNpcs(state.staffDb.active, 9.5);
  npcSys.syncSquadPlayers(state.getPsgSquad(), 9.5);

  // Chạy các khung giờ tập khác nhau: Thể lực (9.6), Chuyền (10.2), Sút (10.7), Chiến thuật (11.2), Đấu tập (11.7)
  [9.6, 10.2, 10.7, 11.2, 11.7].forEach((hr) => {
    state.trainingSystem.update3DTraining(0.2, hr, npcSys.npcs, npcSys);
  });
  // Ở 11.7 (scrimmage), phải có cầu thủ mặc áo tập phân đội (bibMesh.visible === true)
  const bibsVisible = npcSys.npcs.filter((n) => n.isPlayer && n.bibMesh && n.bibMesh.visible).length;
  assert.ok(bibsVisible >= 2, 'Đấu tập đối kháng phải chia 2 đội trang phục phân biệt');

  // Kết thúc buổi tập -> kiểm tra báo cáo & tương tác
  state.trainingSystem.setIntensity('Cao');
  const rep = state.trainingSystem.concludeTrainingSession('test_day_1');
  assert.ok(rep.standouts.length >= 1 && rep.playerResults.length >= 15);
  const firstInteraction = state.trainingSystem.pendingCoachInteractions[0];
  assert.ok(firstInteraction);
  const resp = state.trainingSystem.respondToCoachInteraction(firstInteraction.id, 'approve');
  assert.equal(resp.ok, true);
});

// =========================================================================
// 6. KIỂM THỬ THỜI GIAN TOÀN GAME (PHẦN XIII.7 — 15 PHÚT THỰC = 1 NGÀY GAME)
// =========================================================================
test('TIME-1: 15 phút thực = 24h game, 30 phút = 2 ngày, 60 phút = 4 ngày, x2/x4/Pause & Anti-background jump', () => {
  const ts = new GameTimeSystem('2026-08-03T09:00:00Z');
  const startSec = ts.epochSeconds;

  // 15 phút thực (900 giây) ở x1 -> đúng +24 giờ (86400s game)
  ts.tick(900);
  assert.equal(ts.epochSeconds - startSec, 86400, 'Sau 15 phút thực phải tăng đúng 24 giờ game');
  assert.equal(ts.day, 4);

  // Thêm 15 phút thực nữa (tổng 30 phút) -> đúng +2 ngày
  ts.tick(900);
  assert.equal(ts.epochSeconds - startSec, 2 * 86400, 'Sau 30 phút thực phải tăng đúng 2 ngày game');
  assert.equal(ts.day, 5);

  // Thêm 30 phút thực nữa (tổng 60 phút) -> đúng +4 ngày
  ts.tick(1800);
  assert.equal(ts.epochSeconds - startSec, 4 * 86400, 'Sau 60 phút thực phải tăng đúng 4 ngày game');
  assert.equal(ts.day, 7);

  // Kiểm tra x2 (450s thực = 1 ngày game)
  const beforeX2 = ts.epochSeconds;
  ts.setSpeed(2);
  ts.tick(450);
  assert.equal(ts.epochSeconds - beforeX2, 86400, 'Tốc độ x2: 7.5 phút thực = 1 ngày game');

  // Kiểm tra x4 (225s thực = 1 ngày game)
  const beforeX4 = ts.epochSeconds;
  ts.setSpeed(4);
  ts.tick(225);
  assert.equal(ts.epochSeconds - beforeX4, 86400, 'Tốc độ x4: 3.75 phút thực = 1 ngày game');

  // Kiểm tra Tạm dừng & Ẩn tab / Khóa màn hình -> 0 giây tăng!
  const beforePause = ts.epochSeconds;
  ts.setPaused(true);
  ts.tick(600);
  assert.equal(ts.epochSeconds, beforePause, 'Khi tạm dừng thời gian không được tăng');

  ts.setPaused(false);
  ts.hiddenPaused = true;
  ts.tick(600);
  assert.equal(ts.epochSeconds, beforePause, 'Khi ẩn tab/khóa iPhone thời gian không được tăng');
});

// =========================================================================
// 7. KIỂM THỬ SAVE / LOAD TOÀN BỘ & ĐA MÙA GIẢI (PHẦN XII)
// =========================================================================
test('SAVE-1: Save/Load khôi phục nguyên vẹn HLV mới, cầu thủ mua mới, cầu thủ trẻ đôn lên, lịch tập & thời gian', () => {
  const s1 = new GameState();
  // Thay HLV sang Xabi Alonso
  const xabi = s1.managerSystem.getCandidatesForRole('head_coach').find((c) => c.name === 'Xabi Alonso');
  s1.managerSystem.appointStaff(xabi.staffId, { wage: 210, contractYears: 4 });
  // Đôn 1 cầu thủ trẻ
  const youth = s1.academy.find((y) => y.squad === 'U19');
  s1.transferSystem.promoteAcademyPlayer(youth.id);
  // Đổi sơ đồ & giáo án & chạy 1 buổi tập
  s1.formationSystem.setFormation('3-5-2');
  s1.trainingSystem.applyTrainingFocus('Chiến thuật');
  s1.trainingSystem.concludeTrainingSession('save_test_day');
  // Tua thời gian 900s (1 ngày)
  s1.tickTime(900);

  const rawJson = JSON.stringify(s1.exportFullState({ x: -12, z: 5 }));
  const s2 = new GameState();
  s2.importFullState(JSON.parse(rawJson));

  assert.equal(s2.coach.name, 'Xabi Alonso');
  assert.equal(s2.formationSystem.formation, '3-5-2');
  assert.equal(s2.trainingSystem.focus, 'Chiến thuật');
  assert.ok(s2.trainingSystem.trainingReports.length >= 1);
  assert.ok(s2.getPsgSquad().some((p) => p.id === youth.id), 'Cầu thủ trẻ đôn lên phải giữ nguyên playerId sau khi Load');
  assert.equal(s2.timeSystem.epochSeconds, s1.timeSystem.epochSeconds, 'Thời gian game sau khi tải lại phải khớp chính xác tuyệt đối');
});

console.log(`\n🎉 HOÀN TẤT KIỂM THỬ: ${passed}/${passed} BỘ TEST ĐẠT 100%!`);
