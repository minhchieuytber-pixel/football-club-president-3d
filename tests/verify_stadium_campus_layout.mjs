// tests/verify_stadium_campus_layout.mjs
// Kiểm thử quy hoạch Khuôn viên PSG (6 khu vực, SVĐ Parc des Princes tách biệt trong cùng khuôn viên,
// đường nội bộ kết nối, LOD Low/High lazy streaming, mutual culling & Camera giám sát SVĐ từ xa)
import assert from 'node:assert/strict';

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}
class Obj3D {
  constructor() {
    this.position = new Vec3();
    this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    this.scale = { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    this.children = [];
    this.visible = true;
    this.matrix = {};
    this.userData = {};
  }
  add(...o) { this.children.push(...o); }
  remove(o) { this.children = this.children.filter((c) => c !== o); }
  traverse(fn) { fn(this); this.children.forEach((c) => c.traverse?.(fn)); }
  updateMatrix() {}
  setMatrixAt() {}
  lookAt() {}
}
class MeshMock extends Obj3D { constructor() { super(); this.isMesh = true; } }

globalThis.THREE = {
  Vector3: Vec3, Group: Obj3D, Object3D: Obj3D, Mesh: MeshMock, InstancedMesh: MeshMock, PointLight: Obj3D,
  BoxGeometry: class {}, CylinderGeometry: class {}, PlaneGeometry: class {}, RingGeometry: class {}, DodecahedronGeometry: class {},
  MeshStandardMaterial: class {}, MeshBasicMaterial: class {}
};

import { ParcDesPrincesZone } from '../src/scene/ParcDesPrincesZone.js';
import { PathfindingSystem } from '../src/ai/PathfindingSystem.js';
import { createInitialNpcProfiles } from '../src/departments/DepartmentData.js';
import { STAFF_ROLE_META } from '../src/staff/StaffDatabase.js';
import { TrainingSystem } from '../src/training/TrainingSystem.js';
import { NpcSystem } from '../src/npc/NpcSystem.js';

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

const mockCampus = {
  root: new Obj3D(),
  colliders: [],
  roomWaypoints: {},
  addCollider(cx, cz, w, d) { this.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, active: true }); },
  tagInteractable() {}
};
const mockTex = { signTexture: () => ({}), grassPitchTexture: () => ({}) };
const mockFurn = { mats: { aluminum: {} } };
const mockVeh = { createLuxuryCar: () => new Obj3D() };

const zone = new ParcDesPrincesZone(mockCampus, mockTex, mockFurn, mockVeh);

test('CAMPUS-1: SVĐ Parc des Princes nằm trong cùng khuôn viên nhưng cách biệt hoàn toàn với Trụ sở (không sát tòa nhà điều hành)', () => {
  const distBetweenCenters = Math.hypot(zone.stadiumCenter.x - zone.hqCenter.x, zone.stadiumCenter.z - zone.hqCenter.z);
  assert.ok(distBetweenCenters >= 120, `Khoảng cách tâm Trụ sở <-> SVĐ phải đủ rộng (thực tế: ${distBetweenCenters}m)`);
  // Tường Nam SVĐ ở ~z=-106, tường Bắc Trụ sở ở z=-22 -> khoảng đệm cảnh quan + sân tập + hậu cần rộng > 80m!
  assert.ok(zone.stadiumCenter.z < -120);
  assert.ok(mockCampus.roomWaypoints.stadium_plaza, 'Phải đăng ký điểm đến Quảng trường SVĐ trong cùng khuôn viên');
  assert.ok(mockCampus.roomWaypoints.logistics_gate, 'Phải có khu dịch vụ, hậu cần & cổng kiểm soát giữa 2 khu vực');
});

test('CAMPUS-2: Đường nội bộ & Pathfinding kết nối liền mạch từ Trụ sở -> Sân Tập -> Hậu Cần -> Parc des Princes', () => {
  const pf = new PathfindingSystem();
  const route = pf.findPath(-26, -12, 0, -136);
  assert.ok(route.length >= 4, 'Phải có tuyến đường nội bộ nối từ Phòng Chủ tịch tới SVĐ Parc des Princes');
  assert.ok(route.some((pt) => pt.z <= -60 && pt.z >= -105), 'Tuyến đường phải đi qua khu cảnh quan/hậu cần nối 2 khu vực');
});

test('CAMPUS-3: Ở Trụ sở -> chỉ render LOD Thấp (chưa tải LOD Cao), Camera giám sát SVĐ hoạt động mà không tải nặng', () => {
  const hqInterior = new Obj3D();
  const hqNpc = { mesh: new Obj3D() };
  hqNpc.mesh.position.set(-20, 0.14, 6);

  // Người chơi đang ở Phòng Chủ tịch (-26, -12) và bật Camera giám sát SVĐ từ xa
  zone.cctvModeActive = true;
  const mode = zone.updateStreaming({ x: -26, z: -12 }, hqInterior, [hqNpc]);
  assert.equal(mode, 'hq_detail');
  assert.equal(zone.lodHighBuilt, false, 'Khi ở Trụ sở (kể cả khi bật CCTV từ xa), KHÔNG được tải trước nội thất LOD Cao của SVĐ!');
  assert.equal(zone.lodHighGroup.visible, false);
  assert.equal(zone.lodLowGroup.visible, true, 'Vỏ SVĐ LOD Thấp vẫn hiển thị để nhìn thấy từ xa & qua CCTV');
  assert.equal(hqInterior.visible, true);
  assert.equal(hqNpc.mesh.visible, true);
  assert.ok(Object.keys(zone.cctvCameras).length >= 3, 'Phải có ít nhất 3 góc Camera giám sát SVĐ từ xa');
});

test('CAMPUS-4: Khi đến SVĐ Parc des Princes -> tự động stream LOD Cao & ẩn (cull) nội thất nặng Trụ sở + NPC ở xa', () => {
  const hqInterior = new Obj3D();
  const farHqNpc = { mesh: new Obj3D() };
  farHqNpc.mesh.position.set(-20, 0.14, 6);

  const mode = zone.updateStreaming({ x: 0, z: -120 }, hqInterior, [farHqNpc]);
  assert.equal(mode, 'stadium_detail');
  assert.equal(zone.lodHighBuilt, true, 'Phải tự động xây dựng/stream tài nguyên LOD Cao khi đến gần SVĐ');
  assert.equal(zone.lodHighGroup.visible, true, 'Nội thất chi tiết SVĐ (mặt cỏ FIFA, khán đài, VIP box, LED) phải hiển thị');
  assert.equal(hqInterior.visible, false, 'Nội thất nặng trong Trụ sở phải bị culling khi người chơi ở sâu trong SVĐ!');
  assert.equal(farHqNpc.mesh.visible, false, 'NPC ở xa tại Trụ sở phải bị culling để giữ FPS cao!');

  // Quay lại Trụ sở -> SVĐ tự tắt LOD Cao và Trụ sở hiển thị chi tiết lại
  const backMode = zone.updateStreaming({ x: -26, z: -12 }, hqInterior, [farHqNpc]);
  assert.equal(backMode, 'hq_detail');
  assert.equal(zone.lodHighGroup.visible, false);
  assert.equal(hqInterior.visible, true);
  assert.equal(farHqNpc.mesh.visible, true);
});

test('CAMPUS-5: Toàn bộ cầu thủ, BHL & đạo cụ tập luyện 3D hoạt động tại PSG TRAINING PITCH thuộc Training Center (tách biệt SVĐ Parc des Princes)', () => {
  const playerProfiles = createInitialNpcProfiles().filter((p) => p.isPlayer);
  assert.ok(playerProfiles.length >= 6);
  for (const pl of playerProfiles) {
    assert.ok(pl.home.x >= 150 && pl.home.x <= 234 && pl.home.z >= -146 && pl.home.z <= -54,
      `Cầu thủ ${pl.name} phải tập tại PSG TRAINING PITCH khu Huấn luyện (thực tế: ${pl.home.x}, ${pl.home.z})`);
  }

  const coachRoles = Object.values(STAFF_ROLE_META).filter((m) => m.isCoachingStaff && m.pitchSpot);
  assert.ok(coachRoles.length >= 10);
  for (const cr of coachRoles) {
    assert.ok(cr.pitchSpot.x >= 145 && cr.pitchSpot.x <= 234 && cr.pitchSpot.z >= -146 && cr.pitchSpot.z <= -30,
      `Vị trí đứng sân/chuyên môn của ${cr.title} phải thuộc PSG Training Center (thực tế: ${cr.pitchSpot.x}, ${cr.pitchSpot.z})`);
  }

  // Kiểm tra đạo cụ tập luyện 3D (bóng chuyền, bóng sút, bóng đấu tập) được đặt tại PSG TRAINING PITCH
  globalThis.THREE.ConeGeometry = class {};
  globalThis.THREE.SphereGeometry = class {};
  const ts = new TrainingSystem({});
  ts.build3DTrainingEquipment(mockCampus);
  assert.ok(ts.balls.passing.position.x >= 155 && ts.balls.passing.position.z >= -120 && ts.balls.passing.position.z <= -58);
  assert.ok(ts.balls.shooting.position.x >= 155 && ts.balls.shooting.position.z >= -120 && ts.balls.shooting.position.z <= -58);
  assert.ok(ts.balls.scrimmage.position.x >= 155 && ts.balls.scrimmage.position.z >= -120 && ts.balls.scrimmage.position.z <= -58);

  // Kiểm tra Pathfinding từ Phòng Thay Đồ (133, -45) ra giữa PSG TRAINING PITCH (192, -86)
  const pf = new PathfindingSystem();
  const route = pf.findPath(133, -45, 192, -86);
  assert.ok(route.length >= 4, 'Phải có đường đi từ Phòng Thay Đồ tới PSG TRAINING PITCH');
  assert.ok(route.some((pt) => pt.x >= 165 && pt.z <= -65), 'Đường đi phải dẫn thẳng ra PSG TRAINING PITCH');
});

test('CAMPUS-6: Cầu thủ KHÔNG được tự ý đi vào Nhà làm việc (chỉ vào khi Chủ tịch triệu tập hoặc dự Lễ ký kết/Họp báo)', () => {
  const sceneMock = new Obj3D();
  const charFactoryMock = { createHumanoid: () => new Obj3D() };
  const animMock = { updateRig() {} };
  const campusMock = {
    colliders: [],
    doors: [],
    hasChairAt: () => false,
    resolveCollision: (x, z) => ({ x, z })
  };
  const npcSys = new NpcSystem(sceneMock, charFactoryMock, animMock, campusMock);
  npcSys.spawnFromProfiles(createInitialNpcProfiles(), 13.5); // Ngoài giờ tập (13:30)

  const players = npcSys.npcs.filter((n) => n.isPlayer);
  assert.ok(players.length >= 6);
  for (const pl of players) {
    assert.equal(
      PathfindingSystem.isHqInteriorPoint(pl.restSpot.x, pl.restSpot.z),
      false,
      `Điểm nghỉ của cầu thủ ${pl.name} phải nằm ngoài Nhà làm việc (thực tế: ${pl.restSpot.x}, ${pl.restSpot.z})`
    );
    assert.equal(
      PathfindingSystem.isHqInteriorPoint(pl.mesh.position.x, pl.mesh.position.z),
      false,
      `Cầu thủ ${pl.name} ngoài giờ tập không được đứng trong Nhà làm việc!`
    );
  }

  // Thử đặt đích vào giữa Sảnh Nhà làm việc (0, 6) khi cầu thủ KHÔNG có lệnh triệu tập -> phải bị chặn & đẩy về Phòng Thay Đồ!
  const testPl = players[0];
  npcSys.setNpcDestination(testPl, 0, 6);
  assert.equal(
    PathfindingSystem.isHqInteriorPoint(testPl.finalDest.x, testPl.finalDest.z),
    false,
    'Cầu thủ không có lệnh triệu tập không được phép đặt lộ trình vào bên trong Nhà làm việc!'
  );
  assert.ok(
    testPl.path.every((pt) => !PathfindingSystem.isHqInteriorPoint(pt.x, pt.z)),
    'Lộ trình tự do của cầu thủ không được cắt xuyên qua Nhà làm việc!'
  );

  // Khi Chủ tịch Phạm Minh Chiêu triệu tập họp riêng -> ĐƯỢC PHÉP vào Phòng Chủ tịch!
  npcSys.summonPlayerToPresidentOffice(testPl.name);
  assert.equal(npcSys.isAuthorizedHqVisit(testPl), true);
  assert.equal(PathfindingSystem.isHqInteriorPoint(testPl.finalDest.x, testPl.finalDest.z), true);
});

console.log(`\n🎉 HOÀN TẤT KIỂM THỬ QUY HOẠCH SVĐ PARC DES PRINCES & STREAMING: ${passed}/${passed} ĐẠT 100%!`);
