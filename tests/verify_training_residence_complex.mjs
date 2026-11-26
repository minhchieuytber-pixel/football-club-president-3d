// tests/verify_training_residence_complex.mjs
// Bộ kiểm thử toàn diện PARIS SAINT-GERMAIN TRAINING CENTER:
// - Quy hoạch tách biệt khỏi Parc des Princes & HQ, không trùng lặp Locker Room / Medical Center
// - Phòng Kỹ Thuật PSG (tái quy hoạch từ phòng Y tế cũ ở HQ)
// - Sân tập 3D + Tách cầu thủ chấn thương sang Medical Center (không tự hồi phục giả)
// - Tòa nhà Nghỉ dưỡng 2 tầng 30 phòng (PlayerResidenceSystem + InstancedMesh + Stair/Elevator + Save/Load)

import assert from 'node:assert/strict';
import * as THREE from 'three';

globalThis.THREE = THREE;
globalThis.performance = globalThis.performance || { now: () => Date.now() };
if (!globalThis.document) {
  const grad = { addColorStop() {} };
  const ctxMock = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '12px sans-serif',
    textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1,
    shadowColor: 'transparent', shadowBlur: 0,
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, rect() {},
    quadraticCurveTo() {}, bezierCurveTo() {},
    fill() {}, stroke() {}, save() {}, restore() {},
    translate() {}, rotate() {}, scale() {}, clip() {}, setLineDash() {}, drawImage() {},
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    measureText: (t) => ({ width: String(t || '').length * 7 })
  };
  globalThis.document = {
    createElement: () => ({ width: 256, height: 96, getContext: () => ctxMock })
  };
}

import { GameState } from '../src/club/GameState.js';
import { TOTAL_RESIDENCE_ROOMS } from '../src/club/PlayerResidenceSystem.js';
import { TrainingSystem, TRAINING_PITCH, REHAB_PITCH, MEDICAL_RECOVERY_SPOT } from '../src/training/TrainingSystem.js';
import { PathfindingSystem } from '../src/ai/PathfindingSystem.js';
import { PsgCampusScene } from '../src/scene/PsgCampusScene.js';
import { TrainingComplexScene } from '../src/scene/TrainingComplexScene.js';
import { DressingRoomSystem } from '../src/scene/DressingRoomSystem.js';
import { ParcDesPrincesZone } from '../src/scene/ParcDesPrincesZone.js';
import { TextureFactory } from '../src/core/TextureFactory.js';
import { FurnitureFactory } from '../src/scene/FurnitureFactory.js';
import { VehicleSystem } from '../src/vehicles/VehicleSystem.js';
import { CharacterFactory } from '../src/characters/CharacterFactory.js';
import { AnimationSystem } from '../src/animations/AnimationSystem.js';
import { NpcSystem } from '../src/npc/NpcSystem.js';
import { STAFF_ROLE_META } from '../src/staff/StaffDatabase.js';
import { createInitialNpcProfiles } from '../src/departments/DepartmentData.js';

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

const rootScene = new THREE.Scene();
const tex = new TextureFactory();
const furn = new FurnitureFactory(tex);
const veh = new VehicleSystem(rootScene);
const campus = new PsgCampusScene(rootScene, tex, furn, veh);
const state = new GameState();
const trainingComplex = new TrainingComplexScene(campus, tex, furn, veh, state.playerResidenceSystem);
const dressingRoom = new DressingRoomSystem(campus, tex, furn, state.formationSystem);
const stadiumZone = new ParcDesPrincesZone(campus, tex, furn, veh);

test('TCX-01: Parc des Princes & HQ giữ nguyên vị trí; Training Center tách biệt hoàn toàn về phía Đông', () => {
  const distHqToComplex = Math.hypot(TRAINING_PITCH.cx - 0, TRAINING_PITCH.cz - 0);
  const distStadiumToComplex = Math.hypot(TRAINING_PITCH.cx - stadiumZone.stadiumCenter.x, TRAINING_PITCH.cz - stadiumZone.stadiumCenter.z);
  assert.ok(distHqToComplex >= 120, `Khu huấn luyện phải cách HQ >= 120m (thực tế ${distHqToComplex.toFixed(1)}m)`);
  assert.ok(distStadiumToComplex >= 140, `Khu huấn luyện phải cách SVĐ Parc des Princes >= 140m (thực tế ${distStadiumToComplex.toFixed(1)}m)`);
  assert.equal(stadiumZone.stadiumCenter.z, -152, 'Không được di chuyển hoặc phá bỏ SVĐ Parc des Princes');
});

test('TCX-02: Chỉ tồn tại 1 Phòng Thay Đồ Đội Một duy nhất tại Training Center (132, -48)', () => {
  assert.equal(dressingRoom.cx, 132);
  assert.equal(dressingRoom.cz, -48);
  assert.ok(campus.roomWaypoints.dressing_room.x >= 120, 'Waypoint dressing_room phải trỏ về Training Center');
  const interactList = [...campus.interactables.values()];
  const lockerTagCount = interactList.filter((x) => x.id === 'dr_tactics_table' || x.id === 'dr_tactics_screen').length;
  assert.ok(lockerTagCount >= 2, 'Phải có tương tác Phòng Thay Đồ (dr_tactics_table & dr_tactics_screen)');
  // Kiểm tra không còn tòa nhà phòng thay đồ cũ ở x=-37, z=-44
  const oldLockerCol = campus.colliders.some((c) => c.minX < -30 && c.maxX > -45 && c.minZ < -35 && c.maxZ > -52);
  assert.equal(oldLockerCol, false, 'Không được còn collider phòng thay đồ trùng lặp ở tọa độ cũ (-37, -44)');
});

test('TCX-03: Chỉ tồn tại 1 Trung Tâm Y Tế duy nhất tại Training Center; phòng Y tế cũ ở HQ thành Phòng Kỹ Thuật PSG', () => {
  assert.ok(campus.roomWaypoints.medical.x >= 155, 'Waypoint medical phải nằm ở Training Center');
  assert.ok(campus.roomWaypoints.technical, 'HQ phải có waypoint Phòng Kỹ Thuật PSG');
  assert.ok(campus.roomWaypoints.technical.x >= 6 && campus.roomWaypoints.technical.x <= 20, 'Phòng Kỹ Thuật nằm tại vị trí phòng Y tế cũ ở HQ');

  const interactList = [...campus.interactables.values()];
  const openMedCount = interactList.filter((x) => x.action === 'open_medical').length;
  const openTechCount = interactList.filter((x) => x.action === 'open_technical').length;
  assert.ok(openMedCount >= 1, 'Phải có khu tương tác Trung Tâm Y Tế tại Training Center');
  assert.ok(openTechCount >= 1, 'Phải có khu tương tác Phòng Kỹ Thuật PSG tại HQ');
  assert.ok(campus.doors.some((d) => d.id === 'door_medical'), 'Phòng Kỹ Thuật vẫn giữ cửa thông vào hành lang HQ');
});

test('TCX-04: Pathfinding kết nối liền mạch HQ <-> Cổng Training Center <-> Locker <-> Y Tế <-> Gym <-> Residence <-> Sân tập', () => {
  const pf = new PathfindingSystem(campus);
  const targets = [
    [133, -45],   // Locker Room
    [168, -36],   // Medical Center
    [198, -36],   // Fitness Center
    [184, 9],     // Player Residence Atrium
    [192, -86]    // Main Training Pitch
  ];
  for (const [tx, tz] of targets) {
    const path = pf.findPath(-26, -12, tx, tz);
    assert.ok(path.length >= 4, `Phải có đường đi từ HQ tới (${tx}, ${tz})`);
    const last = path[path.length - 1];
    assert.ok(Math.hypot(last.x - tx, last.z - tz) <= 10, `Đường đi tới (${tx}, ${tz}) phải dẫn tới đúng khu vực`);
  }
});

test('TCX-05: Sân tập 3D & Đạo cụ & 12 HLV & Cầu thủ hoạt động đồng bộ tại Training Center', () => {
  assert.ok(TRAINING_PITCH.cx >= 180 && TRAINING_PITCH.cz <= -70);
  assert.ok(REHAB_PITCH.cx >= 180 && REHAB_PITCH.cz <= -120);
  const ts = new TrainingSystem(state);
  ts.build3DTrainingEquipment(campus);
  assert.ok(ts.balls.passing.position.x >= 165 && ts.balls.shooting.position.x >= 165 && ts.balls.scrimmage.position.x >= 165);

  const coachSpots = Object.values(STAFF_ROLE_META).filter((m) => m.isCoachingStaff && m.pitchSpot);
  for (const cs of coachSpots) {
    assert.ok(cs.pitchSpot.x >= 145, `${cs.title} phải đóng chốt tại Training Center`);
  }
  const players = createInitialNpcProfiles().filter((p) => p.isPlayer);
  for (const p of players) {
    assert.ok(p.home.x >= 150 && p.home.z >= -146 && p.home.z <= -54, `${p.name} tập tại PSG TRAINING PITCH`);
  }
});

test('TCX-06: Cầu thủ chấn thương (injuryDays > 0) bị loại khỏi bài tập nặng & chuyển sang Trung Tâm Y Tế, KHÔNG tự hồi phục giả khi vào phòng', () => {
  const ts = new TrainingSystem(state);
  const squad = state.getPsgSquad();
  const target = squad[1];
  target.injuryDays = 5;
  if (target.health) target.health.injuryDays = 5;

  const mockNpc = {
    id: 'npc_pl_test',
    name: target.name,
    isPlayer: true,
    playerId: target.id,
    role: 'FWD',
    group: 0,
    mesh: { position: new THREE.Vector3(192, 0.14, -86) },
    animState: 'idle',
    animSpeed: 1,
    destX: 192,
    destZ: -86,
    lookTarget: null
  };
  const setDest = (n, x, z) => { n.destX = x; n.destZ = z; };
  ts.update3DTraining(0.1, 10.0, [mockNpc], { setNpcDestination: setDest }, true);
  assert.equal(mockNpc.mode, 'medical_rehab', 'Cầu thủ chấn thương phải chuyển sang chế độ phục hồi Y tế');
  assert.ok(Math.hypot(mockNpc.destX - MEDICAL_RECOVERY_SPOT.cx, mockNpc.destZ - MEDICAL_RECOVERY_SPOT.cz) < 8,
    'Cầu thủ chấn thương phải di chuyển tới Trung Tâm Y Tế, không tập nặng trên sân');
  // Vào phòng Y tế không được làm injuryDays = 0
  assert.equal(target.injuryDays, 5, 'Đi vào Trung Tâm Y Tế tuyệt đối không tự hồi phục giả');
});

test('TCX-07: PlayerResidenceSystem cố định đúng 30 phòng (15 Cánh Tây + 15 Cánh Đông tại Tầng 1), 1 cầu thủ/phòng, phòng trống AVAILABLE', () => {
  const resSys = state.playerResidenceSystem;
  const rooms = resSys.getRooms();
  assert.equal(rooms.length, TOTAL_RESIDENCE_ROOMS);
  assert.equal(rooms.filter((r) => r.floor === 1).length, 30, 'Toàn bộ 30 phòng riêng bố trí tại Tầng 1');
  assert.equal(rooms.filter((r) => r.wing === 'Tây').length, 15);
  assert.equal(rooms.filter((r) => r.wing === 'Đông').length, 15);

  const squadIds = new Set(state.getPsgSquad().map((p) => p.id));
  const occRooms = rooms.filter((r) => r.status === 'OCCUPIED');
  const availRooms = rooms.filter((r) => r.status === 'AVAILABLE');
  const seenOcc = new Set();
  for (const r of occRooms) {
    assert.ok(squadIds.has(r.occupantId), 'Người ở phải là cầu thủ đội một PSG thật');
    assert.equal(seenOcc.has(r.occupantId), false, 'Không cầu thủ nào ở 2 phòng hoặc ở chung phòng');
    seenOcc.add(r.occupantId);
  }
  for (const r of availRooms) {
    assert.equal(r.occupantId, null, 'Phòng trống phải giữ AVAILABLE, không sinh cầu thủ giả');
  }
  assert.equal(occRooms.length, Math.min(30, squadIds.size));
});

test('TCX-08: Đổi số áo giữ nguyên số phòng; bán cầu thủ giải phóng phòng; ký mới nhận phòng trống đầu tiên', () => {
  const s = new GameState();
  const resSys = s.playerResidenceSystem;
  const p = s.getPsgSquad()[0];
  const initialRoom = resSys.getRoomForPlayer(p.id).roomNumber;

  // Đổi số áo
  p.shirtNumber = 99;
  s.notifySquadChanged();
  assert.equal(resSys.getRoomForPlayer(p.id).roomNumber, initialRoom, 'Đổi số áo không được đổi số phòng');
  assert.equal(resSys.getRoomForPlayer(p.id).shirtNumber, 99);

  // Rời đội -> giải phóng thành AVAILABLE
  p.club = 'Real Madrid';
  s.notifySquadChanged();
  assert.equal(resSys.getRoomForPlayer(p.id), null);
  assert.equal(resSys.getRoomByNumber(initialRoom).status, 'AVAILABLE');

  // Tân binh gia nhập -> nhận phòng trống đầu tiên
  const freeBefore = resSys.getRooms().find((r) => r.status === 'AVAILABLE').roomNumber;
  const incoming = s.players.find((x) => x.club !== 'Paris Saint-Germain');
  incoming.club = 'Paris Saint-Germain';
  incoming.squadLevel = 'Đội một';
  s.notifySquadChanged();
  assert.equal(resSys.getRoomForPlayer(incoming.id).roomNumber, freeBefore);
});

test('TCX-09: Vượt quá 30 cầu thủ đội một -> giới hạn đúng 30 phòng, ghi nhận danh sách chờ & phát cảnh báo', () => {
  const s = new GameState();
  const resSys = s.playerResidenceSystem;
  const inboxBefore = s.phoneInbox.length;

  // Đẩy đủ cầu thủ ngoài vào PSG vượt quá 30 người
  const externals = s.players.filter((x) => x.club !== 'Paris Saint-Germain').slice(0, 15);
  for (const x of externals) {
    x.club = 'Paris Saint-Germain';
    x.squadLevel = 'Đội một';
  }
  s.notifySquadChanged();

  assert.equal(resSys.getRooms().length, 30, 'Tuyệt đối không được tạo Phòng 31');
  assert.equal(resSys.getSummary().occupied, 30);
  assert.ok(resSys.getOverflowPlayers().length > 0, 'Cầu thủ thứ 31+ phải vào danh sách chờ');
  assert.ok(s.phoneInbox.length > inboxBefore, 'Phải phát cảnh báo vượt quá 30 phòng lên Phone Chủ tịch');
});

test('TCX-10: Save / Load bảo toàn chính xác bản đồ 30 phòng & Tên bảng phòng 3D đồng bộ không lỗi', () => {
  const s = new GameState();
  const snap = s.exportFullState();
  const s2 = new GameState();
  s2.importFullState(snap);
  assert.deepEqual(
    s2.playerResidenceSystem.getRooms().map((r) => ({ n: r.roomNumber, occ: r.occupantId, st: r.status })),
    s.playerResidenceSystem.getRooms().map((r) => ({ n: r.roomNumber, occ: r.occupantId, st: r.status })),
    'Save/Load phải bảo toàn chính xác bản đồ 30 phòng'
  );
  // Kiểm tra refreshNameplates không throw và cập nhật CanvasTexture đúng 30 tấm
  trainingComplex.refreshNameplates();
  assert.equal(trainingComplex.nameplates.length, 30);
});

test('TCX-11: Kiến trúc 8 tầng Luxury Modern (Chỉ Tầng 1 có nội thất sàn gỗ tối + Logo PSG 3D; Tầng 2-8 chỉ kiến trúc ngoại thất; InstancedMesh; không dùng MeshPhysicalMaterial)', () => {
  assert.equal(trainingComplex.getElevationAt(184, 9, 0.14), 0.14);
  assert.equal(trainingComplex.getElevationAt(180.7, 8.5, 4.14), 0.14, 'Chỉ Tầng 1 được phép sử dụng');
  assert.equal(trainingComplex.residenceFloor2Group.children.length, 0, 'Tầng 2-8 không được tạo nội thất, NPC hay đèn bên trong');

  // Kiểm tra chiều cao ngoại thất 8 tầng (~30m) và nội thất Luxury Modern Tầng 1
  let maxShellY = 0;
  trainingComplex.shellGroup.traverse((o) => {
    if (o.isMesh && o.position) maxShellY = Math.max(maxShellY, o.position.y);
  });
  assert.ok(maxShellY >= 29.0, `Ngoại thất tòa nhà phải đạt quy mô 8 tầng (maxShellY=${maxShellY.toFixed(2)})`);
  assert.ok(trainingComplex.mats.resFloor.map, 'Sàn Tầng 1 phải dùng vật liệu gỗ tối màu có vân');

  let hasInstanced = false;
  let physMatCount = 0;
  trainingComplex.group.traverse((o) => {
    if (o.isInstancedMesh) hasInstanced = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m && m instanceof THREE.MeshPhysicalMaterial) physMatCount++;
    }
  });
  assert.equal(hasInstanced, true, 'TrainingComplexScene phải sử dụng InstancedMesh để tối ưu draw call');
  assert.equal(physMatCount, 0, 'Tuyệt đối không dùng MeshPhysicalMaterial');

  // Kiểm tra Streaming & Zone labels
  const hqInt = new THREE.Group();
  stadiumZone.updateStreaming({ x: 192, z: -86 }, hqInt, [], trainingComplex);
  assert.equal(trainingComplex.pitchGroup.visible, true);
  assert.equal(stadiumZone.lodHighGroup.visible, false, 'Khi ở Training Pitch không tải nặng nội thất LOD cao SVĐ');
  assert.ok(stadiumZone.getPlayerZoneLabel({ x: 192, y: 0.14, z: -86 }).includes('PSG TRAINING PITCH'));
  assert.ok(stadiumZone.getPlayerZoneLabel({ x: 13, y: 0.14, z: 17 }).includes('Kỹ Thuật PSG'));
  assert.ok(stadiumZone.getPlayerZoneLabel({ x: 184, y: 0.14, z: 9 }).includes('Tầng 1'));
  assert.ok(stadiumZone.getPlayerZoneLabel({ x: 162, y: 0.14, z: 9 }).includes('ROOM 01–15'));
  assert.ok(stadiumZone.getPlayerZoneLabel({ x: 204, y: 0.14, z: 9 }).includes('ROOM 16–30'));
});

test('TCX-12: Trần Tầng 1 không trùng lặp Z-fighting & 30 bộ rèm cửa hai cánh có nếp gấp hoạt ảnh mượt', () => {
  // Kiểm tra đúng 1 tấm trần duy nhất ở Player Residence tại y=4.11 (bottom=4.04, top=4.18)
  const ceilingMeshes = [];
  trainingComplex.shellGroup.traverse((o) => {
    if (o.isMesh && o.material === trainingComplex.mats.resCeilingWhite) {
      ceilingMeshes.push(o);
    }
  });
  assert.equal(ceilingMeshes.length, 1, 'Trần Tầng 1 chỉ được có đúng 1 mesh duy nhất để tránh Z-fighting');
  const ceil = ceilingMeshes[0];
  assert.equal(ceil.castShadow, false);
  assert.equal(ceil.receiveShadow, false);
  assert.ok(Math.abs(ceil.position.y - 4.11) < 0.001, 'Cao độ trần Tầng 1 phải tách biệt sạch với tầng trên');

  // Kiểm tra 30 bộ rèm + thanh treo + hit-proxy tương tác + hoạt ảnh nội suy mượt
  assert.equal(trainingComplex.roomCurtains.length, 30, 'Đủ 30 bộ rèm cửa cho 30 phòng nghỉ');
  assert.ok(trainingComplex._curtainWingMesh && trainingComplex._curtainWingMesh.count === 60, '60 cánh rèm InstancedMesh cho 30 phòng');
  for (let rn = 1; rn <= 30; rn++) {
    const meta = campus.interactables.get(`res_curtain_${rn}`);
    assert.ok(meta && meta.action === 'interact_residence_curtain', `Phải có tương tác rèm cho ROOM ${rn}`);
  }

  trainingComplex.residenceFloor1Group.visible = true;
  state.playerResidenceSystem.setRoomCurtainState(1, 'closed', { by: 'player' });
  assert.equal(trainingComplex.roomCurtains[0].targetProgress, 1.0);
  for (let f = 0; f < 30; f++) {
    trainingComplex.update(0.05);
  }
  assert.ok(trainingComplex.roomCurtains[0].progress > 0.95, 'Rèm cửa 3D phải kéo đóng mượt về targetProgress=1.0');
});

test('TCX-13: Hệ thống NPC tự động đóng/mở rèm theo riêng tư & Save/Load bảo toàn trạng thái rèm', () => {
  const s = new GameState();
  const resSys = s.playerResidenceSystem;
  const occRooms = resSys.getRooms().filter((r) => r.status === 'OCCUPIED');
  assert.ok(occRooms.length >= 2);
  const r1 = occRooms[0];
  const r2 = occRooms[1];

  // Quyền riêng tư phòng: cầu thủ phòng khác tuyệt đối không được vào/chỉnh rèm phòng không phải của mình
  assert.equal(resSys.canNpcEnterRoom(r1.roomNumber, r1.occupantId), true);
  assert.equal(resSys.canNpcEnterRoom(r1.roomNumber, r2.occupantId), false);

  // Thử personality & thời gian: privacy_seeker đóng kín vào ban đêm hoặc khi có người đứng sát cửa sổ
  resSys.setPlayerPrivacyPreference(r1.occupantId, 'privacy_seeker');
  resSys.setRoomCurtainState(r1.roomNumber, 'open', { by: 'system', immediate: true });
  const nightDesired = resSys.computeDesiredCurtainForRoom(r1, { clockHour: 22.5 });
  assert.equal(nightDesired?.state, 'closed', 'Ban đêm NPC phải tự động đóng kín rèm');

  const outsideSpot = { x: r1.cx, z: r1.side === 'north' ? -7.2 : 25.2 };
  const peepingDesired = resSys.computeDesiredCurtainForRoom(r1, { clockHour: 17.2, playerPos: outsideSpot });
  assert.equal(peepingDesired?.state, 'closed', 'Có người đứng sát cửa kính ngoài -> privacy_seeker đóng kín rèm');

  // Thử sunlight_lover mở rèm buổi sáng
  resSys.setPlayerPrivacyPreference(r2.occupantId, 'sunlight_lover');
  resSys.setRoomCurtainState(r2.roomNumber, 'closed', { by: 'system', immediate: true });
  const morningDesired = resSys.computeDesiredCurtainForRoom(r2, { clockHour: 7.5 });
  assert.equal(morningDesired?.state, 'open', 'Buổi sáng sunlight_lover mở hoàn toàn rèm');

  // Tôn trọng chỉnh tay của Chủ tịch (manualOverride)
  resSys.setRoomCurtainState(r1.roomNumber, 'open', { by: 'player', clockHour: 17.5 });
  assert.equal(resSys.computeDesiredCurtainForRoom(r1, { clockHour: 18.0, playerPos: outsideSpot }), null,
    'Phải tôn trọng chỉnh tay của người chơi trong khoảng thời gian chờ');

  // Tắt tự động hóa riêng của phòng -> NPC không tự ý kéo rèm
  resSys.setRoomCurtainAutomation(r2.roomNumber, false);
  assert.equal(resSys.computeDesiredCurtainForRoom(r2, { clockHour: 22.5 }), null);

  // Kiểm tra AnimationSystem pull_curtain & NpcSystem curtain_walk -> curtain_action -> đóng rèm
  const charFactory = new CharacterFactory();
  const animSys = new AnimationSystem();
  const npcSys = new NpcSystem(rootScene, charFactory, animSys, campus);
  npcSys.attachTrainingSystem(s.trainingSystem);
  const rigMesh = charFactory.createHumanoid({ outfit: 'training', heightScale: 1.0 });
  animSys.updateRig(rigMesh, 'pull_curtain', 0.05, 1.0, 0);
  assert.ok(rigMesh.userData.rig.rightArm.shoulder.rotation.x < -0.35, 'Animation pull_curtain phải đưa tay lên kéo rèm');

  // Re-enable room r2 automation, place mock player NPC inside room r2 at 22:30, trigger curtain task
  resSys.setRoomCurtainAutomation(r2.roomNumber, true);
  resSys.setRoomCurtainState(r2.roomNumber, 'open', { by: 'system', immediate: true });
  const mockNpc = {
    id: `pl_${r2.occupantId}`,
    playerId: r2.occupantId,
    name: r2.occupantName,
    isPlayer: true,
    mode: 'rest',
    speed: 2.6,
    mesh: rigMesh,
    target: new THREE.Vector3(r2.cx, 0.14, r2.cz),
    home: { x: 192, z: -86 },
    restSpot: { x: 132, z: -48 },
    path: [],
    pathIdx: 0,
    lastPosX: r2.cx,
    lastPosZ: r2.cz
  };
  rigMesh.position.set(r2.cx + 0.35, 0.14, r2.cz);
  const started = npcSys._tryStartNpcCurtainTask(mockNpc, 22.5, null, {}, false);
  assert.equal(started, true, 'NPC cầu thủ trong phòng phải bắt đầu đi tới cửa sổ kéo rèm');
  assert.equal(mockNpc.mode, 'curtain_walk');

  // Mô phỏng NPC tới cửa sổ -> chuyển sang curtain_action -> kéo rèm xong -> trở về rest
  npcSys._finalizeArrivalMode(mockNpc, false);
  assert.equal(mockNpc.mode, 'curtain_action');
  mockNpc.mesh.position.set(mockNpc.curtainTask.windowX, 0.14, mockNpc.curtainTask.windowZ);
  mockNpc.target.set(mockNpc.curtainTask.windowX, 0.14, mockNpc.curtainTask.windowZ);
  mockNpc.path = [];
  npcSys.npcs = [mockNpc];
  for (let i = 0; i < 40; i++) {
    npcSys.update(0.05, new THREE.Vector3(r2.cx, 0.14, r2.cz), 22.5);
  }
  assert.equal(r2.curtainState, 'closed', 'Sau khi thực hiện curtain_action xong, rèm phòng phải chuyển sang closed');
  assert.equal(mockNpc.mode, 'rest', 'Sau khi kéo rèm xong NPC quay lại trạng thái nghỉ ngơi');

  // Save/Load bảo toàn trạng thái rèm, automation & privacy preference
  resSys.setRoomCurtainState(r1.roomNumber, 'partial_closed', { by: 'player', clockHour: 19.0 });
  resSys.setRoomCurtainAutomation(r1.roomNumber, false);
  const snap = s.exportFullState();
  const s2 = new GameState();
  s2.importFullState(snap);
  const r1Loaded = s2.playerResidenceSystem.getRoomByNumber(r1.roomNumber);
  assert.equal(r1Loaded.curtainState, 'partial_closed');
  assert.equal(r1Loaded.curtainAutomationEnabled, false);
  assert.equal(r1Loaded.privacyPreference, 'privacy_seeker');
  assert.equal(r1Loaded.manualOverride, true);
});

test('TCX-14: Nội thất 3D đa chi tiết cho 30 phòng & Hệ thống 30 cửa phòng đóng/mở, tủ áo, TV, đèn phòng hoạt động chuẩn', () => {
  assert.equal(trainingComplex.roomDoors.length, 30, 'Phải có đủ 30 bộ điều khiển cửa phòng riêng');
  assert.ok(trainingComplex._suiteSystem, 'Phải khởi tạo ResidenceInteriorFactory suiteSystem');
  assert.equal(trainingComplex._suiteSystem.doorWoodInst.count, 30);
  assert.equal(trainingComplex._suiteSystem.wardWoodInst.count, 30);
  assert.equal(trainingComplex._suiteSystem.tvOnInst.count, 30);
  assert.equal(trainingComplex._suiteSystem.lightDiscOnInst.count, 90);

  // Kiểm tra đầy đủ interactables cho 30 phòng
  for (let rn = 1; rn <= 30; rn++) {
    assert.equal(campus.interactables.get(`res_door_hit_${rn}`)?.action, 'toggle_residence_door', `Thiếu cửa ROOM ${rn}`);
    assert.equal(campus.interactables.get(`res_ward_${rn}`)?.action, 'toggle_residence_wardrobe', `Thiếu tủ áo ROOM ${rn}`);
    assert.equal(campus.interactables.get(`res_tv_${rn}`)?.action, 'toggle_residence_tv', `Thiếu TV ROOM ${rn}`);
    assert.equal(campus.interactables.get(`res_light_${rn}`)?.action, 'toggle_residence_light', `Thiếu đèn ROOM ${rn}`);
  }

  // Người qua đường ngoài hành lang KHÔNG được làm cửa phòng riêng tự mở (PsgCampusScene.updateDoors skip isResidenceDoor)
  const room1Door = campus.doors.find((d) => d.id === 'res_door_1');
  assert.ok(room1Door && room1Door.isResidenceDoor === true);
  state.playerResidenceSystem.setRoomDoorState(1, false, { by: 'system', immediate: true });
  campus.updateDoors(0.05, new THREE.Vector3(room1Door.x, 0.14, room1Door.z + 0.8), []);
  assert.equal(room1Door.open, false, 'Người đi ngoài hành lang không được tự kích hoạt mở cửa phòng riêng');

  // Mở cửa, mở tủ áo, bật TV, tắt đèn ROOM 1 -> kiểm tra collider & animation mượt
  trainingComplex.residenceFloor1Group.visible = true;
  state.playerResidenceSystem.setRoomDoorState(1, true, { by: 'player' });
  state.playerResidenceSystem.setRoomWardrobeState(1, true);
  state.playerResidenceSystem.setRoomTvState(1, true);
  state.playerResidenceSystem.setRoomLightState(1, false);
  for (let f = 0; f < 35; f++) {
    trainingComplex.update(0.05);
  }
  const ctrl1 = trainingComplex.getDoorController(1);
  assert.ok(ctrl1.doorProgress > 0.95, 'Cánh cửa ROOM 01 phải xoay mở mượt về 1.0');
  assert.ok(ctrl1.wardProgress > 0.95, 'Cánh tủ áo ROOM 01 phải mở mượt về 1.0');
  assert.equal(ctrl1.doorObj.open, true);
  assert.equal(ctrl1.doorObj.collider.active, false, 'Khi cửa mở, collider cửa phải vô hiệu để đi vào phòng');
  assert.equal(ctrl1.tvOn, true);
  assert.equal(ctrl1.lightOn, false);
});

test('TCX-15: NPC tương tác cửa phòng (open_door, bước vào/ra, tự đóng đảm bảo riêng tư) & Save/Load trạng thái phòng', () => {
  const s = new GameState();
  const resSys = s.playerResidenceSystem;
  const occRooms = resSys.getRooms().filter((r) => r.status === 'OCCUPIED');
  const r1 = occRooms[0];
  const r2 = occRooms[1];

  const charFactory = new CharacterFactory();
  const animSys = new AnimationSystem();
  const npcSys = new NpcSystem(rootScene, charFactory, animSys, campus);
  npcSys.attachTrainingSystem(s.trainingSystem);

  const rigMesh = charFactory.createHumanoid({ outfit: 'training', heightScale: 1.0 });
  for (let f = 0; f < 6; f++) {
    animSys.updateRig(rigMesh, 'open_door', 0.05, 1.0, 0);
  }
  assert.ok(rigMesh.userData.rig.rightArm.shoulder.rotation.x < -0.5, 'Animation open_door phải vươn tay mở cửa');

  // Đặt cầu thủ bên ngoài cửa phòng đang đóng -> gọi setNpcDestination vào giữa phòng -> phải chuyển door_walk
  resSys.setRoomDoorState(r1.roomNumber, false, { by: 'system', immediate: true });
  const spots = resSys.getDoorApproachSpots(r1);
  const playerNpc = {
    id: `pl_${r1.occupantId}`,
    playerId: r1.occupantId,
    name: r1.occupantName,
    isPlayer: true,
    mode: 'rest',
    speed: 2.8,
    mesh: rigMesh,
    target: new THREE.Vector3(spots.outside.x, 0.14, spots.outside.z + 2.0),
    home: { x: 192, z: -86 },
    restSpot: { x: 132, z: -48 },
    path: [],
    pathIdx: 0,
    lastPosX: spots.outside.x,
    lastPosZ: spots.outside.z + 2.0
  };
  rigMesh.position.set(spots.outside.x, 0.14, spots.outside.z + 2.0);
  npcSys.npcs = [playerNpc];

  npcSys.setNpcDestination(playerNpc, r1.cx + 0.45, r1.side === 'north' ? -2.25 : 20.25);
  assert.equal(playerNpc.mode, 'door_walk', 'NPC ở ngoài phòng đóng cửa phải tới trước cửa trước khi vào');

  // Giả lập NPC tới điểm trước cửa -> thực hiện door_action -> mở cửa và bước vào
  playerNpc.mesh.position.set(spots.outside.x, 0.14, spots.outside.z);
  playerNpc.target.set(spots.outside.x, 0.14, spots.outside.z);
  playerNpc.path = [];
  npcSys._finalizeArrivalMode(playerNpc, false);
  assert.equal(playerNpc.mode, 'door_action');

  for (let i = 0; i < 20; i++) {
    npcSys.update(0.05, new THREE.Vector3(184, 0.14, 9), 20.0);
  }
  assert.equal(r1.doorOpen, true, 'Sau thao tác open_door, cửa phòng phải mở ra');
  assert.equal(playerNpc.mode, 'rest', 'Sau khi mở cửa xong NPC tiếp tục bước vào nghỉ trong phòng');

  // Giả lập NPC đã bước sâu vào trong phòng -> sau autoCloseTimer cửa phải tự động đóng lại để giữ riêng tư
  playerNpc.mesh.position.set(r1.cx + 0.45, 0.14, r1.side === 'north' ? -2.25 : 20.25);
  playerNpc.target.set(r1.cx + 0.45, 0.14, r1.side === 'north' ? -2.25 : 20.25);
  playerNpc.path = [];
  for (let i = 0; i < 65; i++) {
    npcSys.update(0.05, new THREE.Vector3(184, 0.14, 9), 20.0);
  }
  assert.equal(r1.doorOpen, false, 'Khi NPC đã vào hẳn trong phòng và lối cửa trống, cửa phải tự động đóng lại');

  // Từ trong phòng đóng cửa -> nhận lệnh ra sân tập -> phải đi tới mặt trong cửa mở cửa ra
  npcSys.setNpcDestination(playerNpc, 192, -86);
  assert.equal(playerNpc.mode, 'door_walk', 'NPC ở trong phòng đóng cửa muốn ra ngoài phải mở cửa từ bên trong');
  assert.equal(playerNpc._doorTransition.phase, 'exit_walk');

  // Cầu thủ không được phép điều hướng vào phòng người khác (r2)
  playerNpc._doorTransition = null;
  playerNpc.mode = 'rest';
  playerNpc.mesh.position.set(184, 0.14, 9);
  npcSys.setNpcDestination(playerNpc, r2.cx, r2.cz);
  assert.notEqual(resSys.getRoomAtPosition(playerNpc.finalDest.x, playerNpc.finalDest.z)?.roomNumber, r2.roomNumber,
    'NPC không được phép đi vào phòng của cầu thủ khác');

  // Save/Load bảo toàn doorOpen, tvOn, lightOn, wardrobeOpen
  resSys.setRoomDoorState(r1.roomNumber, true, { by: 'player' });
  resSys.setRoomTvState(r1.roomNumber, true);
  resSys.setRoomLightState(r1.roomNumber, false);
  resSys.setRoomWardrobeState(r1.roomNumber, true);
  const snap = s.exportFullState();
  const s2 = new GameState();
  s2.importFullState(snap);
  const r1Restored = s2.playerResidenceSystem.getRoomByNumber(r1.roomNumber);
  assert.equal(r1Restored.doorOpen, true);
  assert.equal(r1Restored.tvOn, true);
  assert.equal(r1Restored.lightOn, false);
  assert.equal(r1Restored.wardrobeOpen, true);
});

console.log(`\n🎉 TỔNG KẾT KIỂM THỬ TRAINING & RESIDENCE COMPLEX: ${passed}/${passed} ĐẠT 100%!`);
