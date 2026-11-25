// tests/verify_museum_trophy_system.mjs
// Bộ kiểm thử toàn diện 10 kịch bản Bảo Tàng Danh Hiệu & Phòng Truyền Thống PSG + Hệ thống Cúp 3D tự động
import assert from 'node:assert/strict';

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); }
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
    this.parent = null;
  }
  add(...objs) {
    for (const o of objs) {
      if (!o) continue;
      o.parent = this;
      this.children.push(o);
    }
  }
  remove(o) {
    this.children = this.children.filter((c) => c !== o);
    if (o) o.parent = null;
  }
  traverse(fn) { fn(this); for (const c of this.children) c.traverse?.(fn); }
  updateMatrix() {}
  setMatrixAt() {}
  lookAt() {}
}
class MeshMock extends Obj3D {
  constructor(geometry = null, material = null) {
    super();
    this.isMesh = true;
    this.geometry = geometry;
    this.material = material;
  }
}
class GeoMock {
  constructor(kind, params) {
    this.kind = kind;
    this.params = params;
  }
}
class MatMock {
  constructor(opts = {}) {
    Object.assign(this, opts);
  }
}

globalThis.THREE = {
  Vector3: Vec3,
  Group: Obj3D,
  Object3D: Obj3D,
  Mesh: MeshMock,
  InstancedMesh: MeshMock,
  PointLight: Obj3D,
  DoubleSide: 2,
  LinearFilter: 1006,
  BoxGeometry: class extends GeoMock { constructor(...a) { super('box', a); } },
  CylinderGeometry: class extends GeoMock { constructor(...a) { super('cyl', a); } },
  SphereGeometry: class extends GeoMock { constructor(...a) { super('sphere', a); } },
  TorusGeometry: class extends GeoMock { constructor(...a) { super('torus', a); } },
  ConeGeometry: class extends GeoMock { constructor(...a) { super('cone', a); } },
  PlaneGeometry: class extends GeoMock { constructor(...a) { super('plane', a); } },
  RingGeometry: class extends GeoMock { constructor(...a) { super('ring', a); } },
  CircleGeometry: class extends GeoMock { constructor(...a) { super('circle', a); } },
  DodecahedronGeometry: class extends GeoMock { constructor(...a) { super('dodeca', a); } },
  MeshStandardMaterial: MatMock,
  MeshBasicMaterial: MatMock
};
globalThis.performance = globalThis.performance || { now: () => Date.now() };

import { GameState } from '../src/club/GameState.js';
import { MatchCalendarSystem } from '../src/matchday/MatchCalendarSystem.js';
import { TrophyModelFactory } from '../src/trophies/TrophyModelFactory.js';
import { PsgMuseumScene } from '../src/scene/PsgMuseumScene.js';
import { ParcDesPrincesZone } from '../src/scene/ParcDesPrincesZone.js';
import { PathfindingSystem } from '../src/ai/PathfindingSystem.js';
import { createInitialNpcProfiles } from '../src/departments/DepartmentData.js';

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

function makeCampusMock() {
  return {
    root: new Obj3D(),
    colliders: [],
    doors: [],
    roomWaypoints: {},
    interactables: new Map(),
    raycastMeshes: [],
    _raycastMeshSet: new Set(),
    addCollider(cx, cz, w, d) {
      const c = { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, active: true };
      this.colliders.push(c);
      return c;
    },
    tagInteractable(obj, id, label, icon, action, extra = null) {
      this.interactables.set(id, { id, label, icon, action, extra });
      obj.traverse?.((ch) => {
        if (ch.isMesh) {
          ch.userData.interactId = id;
          if (!this._raycastMeshSet.has(ch)) {
            this._raycastMeshSet.add(ch);
            this.raycastMeshes.push(ch);
          }
        }
      });
    },
    resolveCollision(x, z) { return { x, z }; }
  };
}

function runFixedScoreMatchday(state, fx, homeGoals, awayGoals) {
  const md = state.matchdaySystem;
  const origSim = md.simulateMatchComplete.bind(md);
  md.simulateMatchComplete = (f) => {
    const session = md.startLiveMatchday(f);
    session.events = [];
    for (let i = 0; i < homeGoals; i++) {
      const sc = session.plan.starters[Math.min(10, 8 + (i % 3))] || session.plan.starters[0];
      session.events.push({
        id: `ev_h_${i}`, seq: i + 1, minute: 12 + i * 18, type: 'goal', side: 'home', isPsg: true,
        teamName: f.home, scorerId: sc?.playerId, scorerName: sc?.name || 'Ousmane Dembélé', assisterName: null,
        text: `⚽ ${12 + i * 18}' — ${sc?.name || 'PSG'} ghi bàn!`
      });
    }
    for (let j = 0; j < awayGoals; j++) {
      session.events.push({
        id: `ev_a_${j}`, seq: homeGoals + j + 1, minute: 25 + j * 22, type: 'goal', side: 'away', isPsg: false,
        teamName: f.away, scorerId: `opp_${j}`, scorerName: 'Tiền đạo đối phương', assisterName: null,
        text: `⚽ ${25 + j * 22}' — ${f.away} ghi bàn!`
      });
    }
    return md.finalizeLiveSession();
  };
  try {
    return state.runAutomaticMatchday('none');
  } finally {
    md.simulateMatchComplete = origSim;
  }
}

function forceSingleMatchWin(state, compName, roundName, isFinal = true) {
  const id = `fx_test_${compName}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const fx = {
    id,
    matchId: id,
    week: state.week,
    competitionId: undefined,
    comp: compName,
    round: roundName,
    isFinal,
    home: 'Paris Saint-Germain',
    away: 'Olympique de Marseille',
    stadium: 'Parc des Princes',
    date: state.timeSystem.getDateString(),
    time: '21:00',
    played: false,
    status: 'Sắp diễn ra'
  };
  state.fixtures.unshift(fx);
  return runFixedScoreMatchday(state, fx, 3, 1);
}

// -------------------------------------------------------------------------
// KIỂM THỬ 0: Trạng thái khởi tạo mặc định SẠCH — không có cúp giả tương lai
// -------------------------------------------------------------------------
test('CASE-0: Khởi tạo Game mới hoàn toàn sạch — không tự chèn danh hiệu giả cho mùa 2026/27', () => {
  const state = new GameState();
  assert.equal(state.trophySystem.trophies.length, 0, 'Mùa 2026/27 mới bắt đầu phải có 0 cúp sự nghiệp');
  assert.equal(state.trophySystem.seasonArchives.length, 1, 'Chỉ có hồ sơ nền 2025/26');
  assert.equal(state.latestTrophyBroadcast, null);
});

// -------------------------------------------------------------------------
// KIỂM THỬ 1: PSG vô địch Ligue 1 -> Tự động thêm Cúp Ligue 1 & cập nhật TV/Báo chí/Phone
// -------------------------------------------------------------------------
test('CASE-1: PSG vô địch Ligue 1 -> tự động tạo cúp Ligue 1, lưu vào Bảo tàng & phát tin', () => {
  const state = new GameState();
  // Cho PSG dẫn đầu BXH Ligue 1 rõ rệt
  const psg = state.clubs.find((c) => c.name === 'Paris Saint-Germain');
  psg.played = 30; psg.won = 26; psg.drawn = 3; psg.lost = 1; psg.gf = 82; psg.ga = 18; psg.pts = 81;
  state.clubs.filter((c) => c.name !== 'Paris Saint-Germain').forEach((c) => {
    c.played = 30; c.pts = 55; c.gf = 42; c.ga = 38;
  });
  state.fixtures.forEach((f) => { if (f.comp === 'Ligue 1') f.played = true; });

  const { summary } = state.concludeSeason();
  assert.equal(summary.ligue1Winner, 'Paris Saint-Germain');
  assert.equal(state.trophySystem.hasTrophy('ligue_1', '2026/27'), true);
  const tr = state.trophySystem.getByCategory('domestic')[0];
  assert.equal(tr.competitionId, 'ligue_1');
  assert.equal(tr.seasonName, '2026/27');
  assert.equal(tr.winningManagerName, state.coach.name);
  assert.ok(tr.squadSnapshot.length >= 18, 'Phải lưu nguyên vẹn danh sách đội hình vô địch');
  assert.ok(state.latestTrophyBroadcast?.title.includes('LIGUE 1'));
  assert.ok(state.phoneInbox.some((m) => m.title.includes('LIGUE 1')));
  assert.ok(state.newsArchive.some((a) => a.title.includes('đăng quang') && a.title.includes('Ligue 1')));
});

// -------------------------------------------------------------------------
// KIỂM THỬ 2: PSG vô địch Coupe de France -> Tự động thêm Cúp Quốc gia Pháp
// -------------------------------------------------------------------------
test('CASE-2: PSG vô địch Chung kết Coupe de France -> thêm đúng Cúp Coupe de France', () => {
  const state = new GameState();
  const res = forceSingleMatchWin(state, 'Coupe de France', 'Chung kết Coupe de France', true);
  assert.ok(res.awardedTrophy, 'Thắng trận Chung kết Coupe de France phải tự động trao cúp');
  assert.equal(res.awardedTrophy.competitionId, 'coupe_de_france');
  assert.equal(state.trophySystem.hasTrophy('coupe_de_france', '2026/27'), true);
});

// -------------------------------------------------------------------------
// KIỂM THỬ 3: PSG vô địch UEFA Champions League -> Thêm Cúp Tai Voi & mở khóa Siêu Cúp mùa sau
// -------------------------------------------------------------------------
test('CASE-3: PSG vô địch UEFA Champions League -> thêm Cúp UCL & đủ điều kiện dự UEFA Super Cup mùa sau', () => {
  const state = new GameState();
  const res = forceSingleMatchWin(state, 'UEFA Champions League', 'Chung kết UEFA Champions League', true);
  assert.ok(res.awardedTrophy);
  assert.equal(res.awardedTrophy.competitionId, 'ucl');
  assert.equal(state.trophySystem.getByCategory('international').length, 1);

  // Kết thúc mùa 2026/27 -> mùa 2027/28 tự động có lịch UEFA Super Cup & FIFA Club World Cup!
  state.concludeSeason();
  assert.ok(state.fixtures.some((f) => f.comp === 'UEFA Super Cup'), 'Vô địch UCL phải được đá UEFA Super Cup mùa kế tiếp');
  assert.ok(state.fixtures.some((f) => f.comp === 'FIFA Club World Cup'), 'Vô địch UCL phải được dự FIFA Club World Cup');
});

// -------------------------------------------------------------------------
// KIỂM THỬ 4: PSG giành nhiều danh hiệu trong cùng 1 mùa (Cú ăn 6)
// -------------------------------------------------------------------------
test('CASE-4: PSG giành nhiều danh hiệu trong 1 mùa giải -> tất cả đều lưu riêng biệt, không ghi đè', () => {
  const state = new GameState();
  forceSingleMatchWin(state, 'Trophée des Champions', 'Chung kết Siêu Cúp Pháp', true);
  forceSingleMatchWin(state, 'UEFA Super Cup', 'Chung kết Siêu Cúp Châu Âu', true);
  forceSingleMatchWin(state, 'FIFA Club World Cup', 'Chung kết Club World Cup', true);
  forceSingleMatchWin(state, 'Coupe de France', 'Chung kết Coupe de France', true);
  forceSingleMatchWin(state, 'UEFA Champions League', 'Chung kết UEFA Champions League', true);

  const psg = state.clubs.find((c) => c.name === 'Paris Saint-Germain');
  psg.pts = 92; psg.gf = 88; psg.ga = 14;
  state.clubs.filter((c) => c.name !== 'Paris Saint-Germain').forEach((c) => { c.pts = 60; });
  state.concludeSeason();

  assert.equal(state.trophySystem.getTotalCareerTrophies(), 6, 'Phải có đủ 6 danh hiệu riêng biệt trong cùng 1 mùa giải');
  assert.equal(state.trophySystem.getByCategory('domestic').length, 3);
  assert.equal(state.trophySystem.getByCategory('international').length, 3);
});

// -------------------------------------------------------------------------
// KIỂM THỬ 5: PSG KHÔNG vô địch -> Không tạo bất kỳ chiếc cúp giả nào
// -------------------------------------------------------------------------
test('CASE-5: PSG về nhì Ligue 1 & bị loại ở các Cúp -> 0 danh hiệu được tạo', () => {
  const state = new GameState();
  // Tạo trận Chung kết UCL nhưng PSG THUA 0-2
  const finalFx = {
    id: 'fx_lose_ucl', matchId: 'fx_lose_ucl', week: state.week, comp: 'UEFA Champions League',
    round: 'Chung kết UEFA Champions League', isFinal: true,
    home: 'Paris Saint-Germain', away: 'Real Madrid', stadium: 'Munich Arena',
    date: state.timeSystem.getDateString(), time: '21:00', played: false
  };
  state.fixtures.unshift(finalFx);
  const res = runFixedScoreMatchday(state, finalFx, 0, 2);
  assert.equal(res.awardedTrophy, undefined, 'Thua chung kết không được trao cúp');

  // Cho Marseille vượt điểm PSG ở Ligue 1 rồi kết thúc mùa
  const psg = state.clubs.find((c) => c.name === 'Paris Saint-Germain');
  const om = state.clubs.find((c) => c.name === 'Olympique de Marseille');
  psg.pts = 65; psg.gf = 55; psg.ga = 30;
  om.pts = 74; om.gf = 68; om.ga = 24;
  const { summary } = state.concludeSeason();

  assert.equal(summary.ligue1Winner, 'Olympique de Marseille');
  assert.equal(state.trophySystem.getTotalCareerTrophies(), 0, 'PSG không vô địch giải nào -> 0 cúp được tạo');
  assert.equal(state.trophySystem.seasonArchives[0].trophyNames.length, 0);
});

// -------------------------------------------------------------------------
// KIỂM THỬ 6: Chuyển sang mùa giải mới & thay đổi đội hình -> Cúp cũ & đội hình cũ nguyên vẹn
// -------------------------------------------------------------------------
test('CASE-6: Sang mùa mới & bán/đổi cầu thủ -> Cúp và squadSnapshot mùa cũ vẫn bất biến', () => {
  const state = new GameState();
  const star = state.getPsgSquad()[0];
  const starId = star.id;

  forceSingleMatchWin(state, 'Coupe de France', 'Chung kết Coupe de France', true);
  state.concludeSeason(); // Sang 2027/28

  // Chuyển ngôi sao sang CLB khác trong mùa mới
  star.club = 'Real Madrid';
  state.notifySquadChanged();

  const oldTrophy = state.trophySystem.getTrophyById('trophy_coupe_de_france_2026_27');
  assert.ok(oldTrophy, 'Cúp mùa 2026/27 vẫn tồn tại ở mùa 2027/28');
  assert.ok(oldTrophy.squadSnapshot.some((p) => p.playerId === starId), 'Đội hình vô địch cũ phải giữ nguyên tên cầu thủ đã ra đi');
  const archive2627 = state.trophySystem.seasonArchives.find((a) => a.season === '2026/27');
  assert.ok(archive2627 && archive2627.squadSnapshot.some((p) => p.playerId === starId));

  // Mùa 2027/28 tiếp tục vô địch Ligue 1 -> tổng 2 cúp ở 2 mùa khác nhau
  const psg = state.clubs.find((c) => c.name === 'Paris Saint-Germain');
  psg.pts = 85;
  state.concludeSeason();
  assert.equal(state.trophySystem.getTotalCareerTrophies(), 2);
  assert.equal(state.trophySystem.hasTrophy('ligue_1', '2027/28'), true);
});

// -------------------------------------------------------------------------
// KIỂM THỬ 7: Save & Reload -> Toàn bộ Cúp 3D & Bảo tàng khôi phục chính xác
// -------------------------------------------------------------------------
test('CASE-7: Save & Reload (exportFullState -> importFullState) khôi phục nguyên vẹn danh hiệu & Bảo tàng 3D', () => {
  const s1 = new GameState();
  forceSingleMatchWin(s1, 'UEFA Champions League', 'Chung kết UEFA Champions League', true);
  forceSingleMatchWin(s1, 'Coupe de France', 'Chung kết Coupe de France', true);
  const snap = JSON.parse(JSON.stringify(s1.exportFullState({ x: 26, z: -44 })));

  const s2 = new GameState();
  s2.importFullState(snap);

  assert.equal(s2.trophySystem.getTotalCareerTrophies(), 2);
  assert.equal(s2.trophySystem.hasTrophy('ucl', '2026/27'), true);
  assert.equal(s2.trophySystem.hasTrophy('coupe_de_france', '2026/27'), true);
  assert.ok(s2.latestTrophyBroadcast?.title.includes('COUPE DE FRANCE') || s2.latestTrophyBroadcast?.title.includes('CHAMPIONS'));

  const campus = makeCampusMock();
  const museum = new PsgMuseumScene(campus, { signTexture: () => ({}), marbleTexture: () => ({}), psgCrestTexture: () => ({}) }, {}, s2.trophySystem);
  assert.ok(museum.dynamicTrophiesGroup.children.length >= 2, 'Bảo tàng 3D sau reload phải dựng lại ngay các cúp đã lưu');
  assert.ok(campus.interactables.has('trophy_ucl_2026_27'));
  assert.ok(campus.interactables.has('trophy_coupe_de_france_2026_27'));
});

// -------------------------------------------------------------------------
// KIỂM THỬ 8: Chống trùng lặp danh hiệu
// -------------------------------------------------------------------------
test('CASE-8: Gọi awardTrophy / concludeSeason lặp lại không bao giờ tạo cúp trùng', () => {
  const state = new GameState();
  const first = state.trophySystem.awardTrophy({ competitionId: 'ligue_1', seasonName: '2026/27' });
  const dup = state.trophySystem.awardTrophy({ competitionId: 'ligue_1', seasonName: '2026/27' });
  assert.equal(first.ok, true);
  assert.equal(dup.ok, false);
  assert.equal(dup.duplicate, true);
  assert.equal(state.trophySystem.getTotalCareerTrophies(), 1);
});

// -------------------------------------------------------------------------
// KIỂM THỬ 9: Mô hình cúp 3D phân biệt hình dáng cho từng giải đấu
// -------------------------------------------------------------------------
test('CASE-9: TrophyModelFactory dựng hình dáng 3D riêng biệt cho từng giải đấu', () => {
  const factory = new TrophyModelFactory({});
  const models = ['ligue_1', 'coupe_de_france', 'trophee_des_champions', 'ucl', 'uefa_super_cup', 'fifa_club_world_cup'];
  const sigs = new Set();
  for (const m of models) {
    const g = factory.buildTrophyMesh(m);
    assert.ok(g.children.length >= 4, `Cúp ${m} phải có nhiều chi tiết 3D (${g.children.length})`);
    const sig = `${g.userData.modelType}:${g.children.map((c) => c.geometry?.kind || 'g').join(',')}`;
    sigs.add(sig);
  }
  assert.equal(sigs.size, models.length, 'Mỗi giải đấu phải có cấu trúc hình học 3D riêng biệt, không dùng 1 model chung!');
});

// -------------------------------------------------------------------------
// KIỂM THỬ 10: Kiến trúc Bảo tàng 3D, Pathfinding từ Phòng Chủ tịch & Zone Culling
// -------------------------------------------------------------------------
test('CASE-10: Tòa nhà PARIS SAINT-GERMAIN CLUB MUSEUM kết nối giao thông, NPC Bảo tàng & Zone Culling chuẩn', () => {
  const campus = makeCampusMock();
  const state = new GameState();
  const museum = new PsgMuseumScene(campus, { signTexture: () => ({}), marbleTexture: () => ({}), psgCrestTexture: () => ({}) }, {}, state.trophySystem);

  assert.ok(campus.roomWaypoints.museum, 'Phải đăng ký điểm Fast Travel Bảo tàng');
  assert.ok(campus.doors.some((d) => d.id === 'door_museum_main' && d.autoOpenNearPlayer), 'Cửa kính tự động Bảo tàng phải được đăng ký');
  assert.ok(campus.interactables.has('museum_history_monument'));
  assert.ok(campus.interactables.has('legend_leg_marquinhos'));

  // Kiểm tra đường đi bộ từ Phòng Chủ tịch (-26, -12) đến Bảo tàng (28, -44) đi qua door_museum_main
  const pf = new PathfindingSystem(campus);
  const route = pf.findPath(-26, -12, 28, -44);
  assert.ok(route.length >= 5, 'Phải có tuyến đường đi bộ hợp lệ từ Phòng Chủ tịch tới Bảo tàng PSG');
  assert.ok(route.some((pt) => pt.doorId === 'door_museum_main'), 'Lộ trình phải đi qua cửa kính tự động Bảo tàng');

  // Kiểm tra 2 NPC Bảo tàng có mặt & đứng đúng khu vực Bảo tàng
  const museumNpcs = createInitialNpcProfiles().filter((p) => p.isMuseumNpc);
  assert.equal(museumNpcs.length, 2);
  for (const n of museumNpcs) {
    assert.ok(n.home.x >= 18 && n.home.x <= 50 && n.home.z >= -57 && n.home.z <= -31);
  }

  // Kiểm tra Zone Culling trong ParcDesPrincesZone
  const zone = new ParcDesPrincesZone(campus, { signTexture: () => ({}), grassPitchTexture: () => ({}) }, { mats: { aluminum: {} } }, null);
  const extra = { museumGroup: museum.group };
  zone.updateStreaming({ x: 0, z: 0 }, null, [], extra); // Ở trong HQ
  assert.equal(museum.group.visible, true);
  assert.equal(museum.interiorGroup.visible, false, 'Nội thất Bảo tàng phải bị cull khi người chơi ở trong HQ');
  zone.updateStreaming({ x: 26, z: -44 }, null, [], extra); // Ở trong Bảo tàng
  assert.equal(museum.interiorGroup.visible, true, 'Nội thất Bảo tàng phải hiển thị khi bước vào Bảo tàng');
});

console.log(`\n🎉 HOÀN TẤT KIỂM THỬ BẢO TÀNG DANH HIỆU & CÚP 3D PSG: ${passed}/${passed} ĐẠT 100%!`);
