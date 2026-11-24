// tests/verify_player_kit_system.mjs
// Bộ kiểm thử toàn diện Hệ thống Trang phục Cầu thủ 3D PSG (10 tiêu chí bắt buộc)
import assert from 'node:assert/strict';
import * as THREE from 'three';

globalThis.THREE = THREE;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

// Canvas2D headless mock ghi lại mọi lệnh vẽ (fillRect, fillText, strokeText, font, fillStyle...)
function createMockCanvas() {
  const ops = [];
  const canvas = {
    width: 512,
    height: 256,
    _ops: ops,
    getContext(type) {
      if (type !== '2d') return null;
      return {
        _fillStyle: '#000000',
        _strokeStyle: '#000000',
        _font: '12px sans-serif',
        _lineWidth: 1,
        _textAlign: 'start',
        _textBaseline: 'alphabetic',
        set fillStyle(v) { this._fillStyle = v; },
        get fillStyle() { return this._fillStyle; },
        set strokeStyle(v) { this._strokeStyle = v; },
        get strokeStyle() { return this._strokeStyle; },
        set font(v) { this._font = v; },
        get font() { return this._font; },
        set lineWidth(v) { this._lineWidth = v; },
        get lineWidth() { return this._lineWidth; },
        set textAlign(v) { this._textAlign = v; },
        get textAlign() { return this._textAlign; },
        set textBaseline(v) { this._textBaseline = v; },
        get textBaseline() { return this._textBaseline; },
        save() {},
        restore() {},
        beginPath() {},
        closePath() {},
        clip() {},
        rect() {},
        moveTo() {},
        lineTo() {},
        arc() {},
        fill() {},
        stroke() {},
        strokeRect() {},
        createLinearGradient() { return { addColorStop() {} }; },
        fillRect(x, y, w, h) {
          ops.push({ op: 'fillRect', x, y, w, h, fillStyle: this._fillStyle });
        },
        fillText(text, x, y) {
          ops.push({ op: 'fillText', text: String(text), x, y, fillStyle: this._fillStyle, font: this._font });
        },
        strokeText(text, x, y) {
          ops.push({ op: 'strokeText', text: String(text), x, y, strokeStyle: this._strokeStyle, font: this._font });
        },
        measureText(text) {
          const m = /(\d+)px/.exec(this._font || '');
          const px = m ? Number(m[1]) : 16;
          return { width: String(text).length * px * 0.56 };
        }
      };
    }
  };
  return canvas;
}

globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') return createMockCanvas();
    return {};
  }
};

import {
  KIT_ATLAS_LAYOUT,
  KIT_TYPES,
  PSG_KIT_THEMES,
  createMappedKitChestGeometry,
  drawJerseyBackSection,
  formatKitName,
  normalizeKitSpec,
  sharedPlayerKitSystem
} from '../src/characters/PlayerKitSystem.js';
import { CharacterFactory } from '../src/characters/CharacterFactory.js';
import { AnimationSystem } from '../src/animations/AnimationSystem.js';
import { GameState } from '../src/club/GameState.js';
import { PathfindingSystem } from '../src/ai/PathfindingSystem.js';
import { NpcSystem } from '../src/npc/NpcSystem.js';
import { DressingRoomSystem } from '../src/scene/DressingRoomSystem.js';
import { MediaEventRooms } from '../src/scene/MediaEventRooms.js';
import { Match3DScene } from '../src/matches/Match3DScene.js';
import { safeDisposeObject3D } from '../src/core/AssetCache.js';

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

function makeLightCampusMock() {
  const dummyTex = () => new THREE.Texture();
  const mat = new THREE.MeshStandardMaterial({ color: 0x334155 });
  return {
    campus: {
      root: new THREE.Group(),
      colliders: [],
      doors: [],
      interactables: new Map(),
      roomWaypoints: {},
      addCollider() {},
      addGlassWindow() {},
      addWoodenDoor() {},
      addRoomLabel() {},
      registerChairPosition() {},
      tagInteractable(mesh, id, label, icon, action) {
        this.interactables.set(id, { id, label, icon, action });
      },
      addSeat() {},
      resolveCollision(x, z) { return { x, z }; }
    },
    texFactory: {
      signTexture: dummyTex,
      psgCrestTexture: dummyTex,
      woodTexture: dummyTex,
      marbleTexture: dummyTex
    },
    furnFactory: {
      mats: { darkWood: mat, leatherNavy: mat, matteBlack: mat, chrome: mat, gold: mat },
      createConferenceTable: () => new THREE.Group(),
      createExecutiveDesk: () => new THREE.Group(),
      createTrophyCabinet: () => new THREE.Group(),
      createSwivelChair: () => new THREE.Group(),
      createSofa: () => new THREE.Group(),
      createMedicalBed: () => new THREE.Group(),
      createFilingCabinet: () => new THREE.Group()
    }
  };
}

// ============================================================================
// 1. BACK-OF-JERSEY UV PLACEMENT & NON-OVERLAP + NO PROTRUDING STRIPE
// ============================================================================
test('KIT-1: UV mặt lưng (-Z) nằm gọn trong KIT_ATLAS_LAYOUT.back, không chồng lấn front, không còn khối stripe thừa', () => {
  const geo = createMappedKitChestGeometry();
  assert.ok(geo, 'createMappedKitChestGeometry phải trả về BufferGeometry');

  const { width: W, height: H, front, back } = KIT_ATLAS_LAYOUT;
  const fU = [front.x / W, (front.x + front.w) / W];
  const fV = [1 - (front.y + front.h) / H, 1 - front.y / H];
  const bU = [back.x / W, (back.x + back.w) / W];
  const bV = [1 - (back.y + back.h) / H, 1 - back.y / H];

  assert.ok(fU[1] < bU[0], 'Vùng front và back trên Atlas không được phép chồng lấn nhau');

  const uv = geo.attributes.uv;
  const norm = geo.attributes.normal;
  let frontVerts = 0;
  let backVerts = 0;
  for (let i = 0; i < uv.count; i++) {
    const nz = norm.getZ(i);
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (nz > 0.5) {
      frontVerts++;
      assert.ok(u >= fU[0] - 1e-5 && u <= fU[1] + 1e-5 && v >= fV[0] - 1e-5 && v <= fV[1] + 1e-5);
    } else if (nz < -0.5) {
      backVerts++;
      assert.ok(u >= bU[0] - 1e-5 && u <= bU[1] + 1e-5 && v >= bV[0] - 1e-5 && v <= bV[1] + 1e-5);
    }
  }
  assert.equal(frontVerts, 4);
  assert.equal(backVerts, 4);

  const cf = new CharacterFactory();
  const pMesh = cf.createHumanoid({ outfit: 'player_home', kit: { fullName: 'Kylian Mbappé', shirtNumber: 7 } });
  const torsoChildren = pMesh.userData.rig.torso.children;
  // chest + neck + headGroup + LShoulder + RShoulder = 5 (không có mesh stripe lồi đè chữ lưng)
  assert.equal(torsoChildren.length, 5, `Áo cầu thủ không được có khối stripe lồi đè chữ lưng, got ${torsoChildren.length}`);
  assert.equal(torsoChildren.some((c) => c.geometry === cf._geoCache.stripe), false);
});

// ============================================================================
// 2. NON-MIRRORED ORIENTATION UNDER 360 ORBIT
// ============================================================================
test('KIT-2: Chiều UV mặt lưng (-Z) thuận chiều đọc từ trái sang phải, không bị ngược chữ', () => {
  const geo = createMappedKitChestGeometry();
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const norm = geo.attributes.normal;

  let topLeftU = null;
  let topRightU = null;
  let botLeftV = null;
  let topLeftV = null;

  for (let i = 0; i < pos.count; i++) {
    if (norm.getZ(i) >= -0.5) continue;
    const x = pos.getX(i);
    const y = pos.getY(i);
    // Khi camera ở -Z nhìn về gốc tọa độ (+Z) với +Y hướng lên:
    // Bên TRÁI của người xem là +X, bên PHẢI của người xem là -X!
    if (x > 0 && y > 0) {
      topLeftU = uv.getX(i);
      topLeftV = uv.getY(i);
    } else if (x < 0 && y > 0) {
      topRightU = uv.getX(i);
    } else if (x > 0 && y < 0) {
      botLeftV = uv.getY(i);
    }
  }

  assert.ok(topLeftU !== null && topRightU !== null, 'Tìm thấy đủ đỉnh góc trên mặt lưng');
  assert.ok(topRightU > topLeftU, `UV U phải tăng từ trái sang phải khi nhìn từ sau lưng (${topLeftU} -> ${topRightU})`);
  assert.ok(topLeftV > botLeftV, `UV V phải tăng từ dưới lên trên (${botLeftV} -> ${topLeftV})`);
});

// ============================================================================
// 3. ANIMATION DEFORMATION FIDELITY
// ============================================================================
test('KIT-3: Thân áo gắn trực tiếp vào rig.torso và giữ nguyên tên/số áo khi chạy, sút, bay người bắt bóng, ăn mừng & cầm áo', () => {
  sharedPlayerKitSystem.disposeAll();
  const cf = new CharacterFactory();
  const anim = new AnimationSystem();
  const npcMesh = cf.createHumanoid({
    outfit: 'kit_home',
    kit: { playerId: 'p_dembele', fullName: 'Ousmane Dembélé', shirtNumber: 10, isCaptain: false }
  });
  const rig = npcMesh.userData.rig;
  assert.ok(rig.torso.children.includes(rig.kitParts.chest), 'Chest phải là con trực tiếp của rig.torso');

  const states = ['run', 'kick', 'dive_gk', 'celebrate', 'hold_jersey'];

  for (const st of states) {
    for (let step = 0; step < 5; step++) {
      anim.updateRig(npcMesh, st, 0.08, 1.0, 0);
    }
    assert.ok(Number.isFinite(rig.torso.rotation.x) && Number.isFinite(rig.torso.rotation.z), `Torso không NaN ở state ${st}`);
    assert.equal(rig.kitParts.chest.parent, rig.torso, `Chest không tách khỏi torso ở state ${st}`);
    assert.equal(npcMesh.userData.kitData.displayName, 'DEMBÉLÉ');
    assert.equal(npcMesh.userData.kitData.shirtNumber, '10');
  }
});

// ============================================================================
// 4. ALL 6 PSG KITS + SCRIMMAGE + OPPONENT CONTRAST + GK LONG SLEEVES
// ============================================================================
test('KIT-4: 6 bộ áo PSG + scrimmage + opponent render đúng tên in hoa, số áo cỡ lớn, tương phản màu và tay dài thủ môn', () => {
  sharedPlayerKitSystem.disposeAll();
  const cf = new CharacterFactory();
  const mesh = cf.createHumanoid({
    outfit: 'kit_home',
    kit: { playerId: 'p_10', fullName: 'Ousmane Dembélé', shirtNumber: 10 }
  });

  for (const kType of [...KIT_TYPES, 'scrimmage']) {
    cf.applyPlayerKit(mesh, { kitType: kType });
    const key = mesh.userData.kitKey;
    const poolEntry = sharedPlayerKitSystem._pool.get(key);
    assert.ok(poolEntry, `Pool entry phải tồn tại cho ${kType}`);
    const ops = poolEntry.canvas._ops;

    const textOps = ops.filter((o) => o.op === 'fillText');
    const nameOp = textOps.find((o) => o.text === 'DEMBÉLÉ');
    const numOp = textOps.find((o) => o.text === '10');
    assert.ok(nameOp, `${kType}: thiếu tên DEMBÉLÉ trên canvas`);
    assert.ok(numOp, `${kType}: thiếu số 10 trên canvas`);
    assert.equal(nameOp.fillStyle, PSG_KIT_THEMES[kType].textHex);
    assert.equal(numOp.fillStyle, PSG_KIT_THEMES[kType].textHex);
    // Số áo phải ở dưới tên trên mặt lưng
    assert.ok(numOp.y > nameOp.y, `${kType}: số áo (${numOp.y}) phải nằm dưới tên (${nameOp.y})`);
    assert.ok(numOp.x > KIT_ATLAS_LAYOUT.back.x && numOp.x < KIT_ATLAS_LAYOUT.back.x + KIT_ATLAS_LAYOUT.back.w);

    if (kType === 'gk') {
      assert.notEqual(mesh.userData.rig.kitParts.lowerArms[0].material, mesh.userData.rig.kitParts.skinMat, 'GK phải mặc áo tay dài');
    }
  }

  // Opponent contrast check (vàng sáng -> chữ tối #0f172a; xanh đậm -> chữ trắng #ffffff)
  cf.applyPlayerKit(mesh, { kitType: 'opponent', club: 'Nantes FC', clubColor: 0xfde047, fullName: 'Jean Dupont', shirtNumber: 9 });
  assert.equal(sharedPlayerKitSystem._pool.get(mesh.userData.kitKey).spec.theme.textHex, '#0f172a');

  cf.applyPlayerKit(mesh, { kitType: 'opponent', club: 'Olympique Lyonnais', clubColor: 0x1e3a8a, fullName: 'Jean Dupont', shirtNumber: 9 });
  assert.equal(sharedPlayerKitSystem._pool.get(mesh.userData.kitKey).spec.theme.textHex, '#ffffff');
});

// ============================================================================
// 5. LIVE SHIRT NUMBER & CAPTAIN EDIT PROPAGATION
// ============================================================================
test('KIT-5: Đổi số áo và Đội trưởng đồng bộ tức thì tới NPC 3D và Phòng Thay Đồ', () => {
  sharedPlayerKitSystem.disposeAll();
  const state = new GameState();
  const cf = new CharacterFactory();
  const anim = new AnimationSystem();
  const env = makeLightCampusMock();
  const npcs = new NpcSystem(new THREE.Scene(), cf, anim, env.campus);
  const dressing = new DressingRoomSystem(env.campus, env.texFactory, env.furnFactory, state.formationSystem);

  npcs.syncSquadPlayers(state.getPsgSquad(), 10, state.activeKit, state.formationSystem.captainId);
  state.onSquadChange = () => {
    npcs.syncSquadPlayers(state.getPsgSquad(), state.clockHour, state.activeKit, state.formationSystem.captainId);
  };

  const target = state.getPsgSquad().find((p) => p.position !== 'GK');
  assert.ok(target);
  state.formationSystem.setShirtNumber(target.id, 77);
  state.formationSystem.setCaptain(target.id);

  const npc = npcs.npcs.find((n) => n.playerId === target.id);
  assert.ok(npc, 'NPC cầu thủ phải tồn tại');
  assert.equal(npc.shirtNumber, 77);
  assert.equal(npc.isCaptain, true);
  assert.equal(npc.mesh.userData.kitData.shirtNumber, '77');
  assert.equal(npc.mesh.userData.kitData.isCaptain, true);
  assert.ok(npc.mesh.userData.kitKey.includes('|77|1'));

  const locker = dressing.lockerMeshes.find((slot) => state.formationSystem.lockers[slot.idx]?.playerId === target.id);
  if (locker) {
    assert.ok(locker.lastKey.includes('|77|'), 'Tủ đồ 3D phải cập nhật dirty-key có số 77');
  }
  dressing.dispose();
});

// ============================================================================
// 6. TRANSFER IN/OUT & ACADEMY PROMOTION SYNC
// ============================================================================
test('KIT-6: Chuyển nhượng mua/bán & Đôn cầu thủ trẻ giữ duy nhất 1 playerId và đồng bộ bộ áo 3D sạch sẽ', () => {
  sharedPlayerKitSystem.disposeAll();
  const state = new GameState();
  const cf = new CharacterFactory();
  const anim = new AnimationSystem();
  const env = makeLightCampusMock();
  const npcs = new NpcSystem(new THREE.Scene(), cf, anim, env.campus);
  state.onSquadChange = () => {
    npcs.syncSquadPlayers(state.getPsgSquad(), state.clockHour, state.activeKit, state.formationSystem.captainId);
  };

  npcs.syncSquadPlayers(state.getPsgSquad(), 10, 'home', state.formationSystem.captainId);

  // Đôn cầu thủ trẻ học viện
  const academyBoy = state.academy[0];
  assert.ok(academyBoy);
  const promRes = state.promoteAcademyPlayer(academyBoy.id);
  assert.ok(promRes.ok, 'Đôn cầu thủ trẻ thành công');

  const promotedInSquad = state.getPsgSquad().filter((p) => p.id === academyBoy.id);
  assert.equal(promotedInSquad.length, 1, 'Không được nhân đôi playerId sau khi đôn từ học viện');
  const promotedNpc = npcs.npcs.find((n) => n.playerId === academyBoy.id);
  assert.ok(promotedNpc, 'NPC cầu thủ trẻ mới đôn phải có trong NpcSystem');
  assert.equal(promotedNpc.mesh.userData.kitData.displayName, formatKitName(academyBoy.name));
  assert.ok(Number(promotedNpc.mesh.userData.kitData.shirtNumber) > 0);

  // Bán cầu thủ -> phải xóa NPC và trả refCount bộ áo
  const squadCopy = state.getPsgSquad();
  const sellCandidate = squadCopy.find((p) => p.id === academyBoy.id);
  const soldKey = promotedNpc.mesh.userData.kitKey;
  const sellRes = state.sellPlayer(sellCandidate.id, 15, 'Monaco');
  assert.ok(sellRes.ok, 'Bán cầu thủ thành công');
  assert.equal(npcs.npcs.find((n) => n.playerId === sellCandidate.id), undefined, 'Cầu thủ đã bán không còn trong NpcSystem');
  assert.equal(sharedPlayerKitSystem._pool.get(soldKey)?.refCount || 0, 0, 'RefCount kit của cầu thủ bị bán phải về 0');
});

// ============================================================================
// 7. DRESSING ROOM & MEDIA EVENT ROOMS SYNC ON KIT SWITCH
// ============================================================================
test('KIT-7: Đổi activeKit (Sân nhà / Sân khách / Áo thứ ba) đồng bộ Phòng Thay Đồ & Áo trưng bày Lễ Ký Kết', () => {
  sharedPlayerKitSystem.disposeAll();
  const state = new GameState();
  const env = makeLightCampusMock();
  const dressing = new DressingRoomSystem(env.campus, env.texFactory, env.furnFactory, state.formationSystem);
  const mediaRooms = new MediaEventRooms(env.campus, env.texFactory, env.furnFactory);

  state.setActiveKit('away');
  assert.equal(state.activeKit, 'away');
  const firstAssigned = dressing.lockerMeshes.find((slot) => state.formationSystem.lockers[slot.idx]?.isAssigned);
  assert.ok(firstAssigned.lastKey.startsWith('away|'), `Dirty-key tủ đồ phải bắt đầu bằng away|, got ${firstAssigned.lastKey}`);

  const canvasTexts = firstAssigned.canvas._ops.filter((o) => o.op === 'fillText');
  const lockerData = state.formationSystem.lockers[firstAssigned.idx];
  assert.ok(canvasTexts.some((t) => t.text === String(lockerData.shirtNumber)), 'Tủ đồ vẽ đúng số áo cầu thủ');

  mediaRooms.updateEventVisuals({
    phase: 'signing',
    kitType: 'away',
    subjectName: 'Lamine Yamal',
    shirtNumber: 19,
    position: 'RW',
    eventTypeLabel: 'Lễ Ra Mắt Tân Binh'
  });
  const mediaJerseyOps = mediaRooms.jerseyCanvas._ops.filter((o) => o.op === 'fillText');
  assert.ok(mediaJerseyOps.some((o) => o.text === 'YAMAL' && o.fillStyle === '#00205b'));
  assert.ok(mediaJerseyOps.some((o) => o.text === '19' && o.fillStyle === '#00205b'));

  dressing.dispose();
  mediaRooms.dispose();
});

// ============================================================================
// 8. MULTI-PLAYER MATCH 3D SCENE + LIVE SUBSTITUTION
// ============================================================================
test('KIT-8: Match3DScene khởi tạo 22 cầu thủ đúng tên/số/áo PSG + đối thủ và live-sync khi thay người', () => {
  sharedPlayerKitSystem.disposeAll();
  const state = new GameState();
  const cf = new CharacterFactory();
  const anim = new AnimationSystem();
  const env = makeLightCampusMock();
  env.texFactory.grassPitchTexture = () => new THREE.Texture();
  env.texFactory.signTexture = () => new THREE.Texture();
  const audioMock = { playWhistle() {}, playGoal() {}, playCheer() {}, playClick() {} };
  const match3d = new Match3DScene(env.texFactory, cf, anim, audioMock);

  const fData = state.formationSystem.getFormationData({ fillEmpty: true });
  const benchPlayer = fData.bench[0].player;
  const homeClub = state.clubs.find((c) => c.isUser);
  const awayClub = state.clubs.find((c) => !c.isUser);

  match3d.startMatch(
    { home: 'Paris Saint-Germain', away: awayClub.name, comp: 'Ligue 1', round: 'Vòng 1' },
    homeClub,
    awayClub,
    state.getPsgSquad(),
    {},
    null,
    null,
    state.formationSystem,
    { psgKit: 'third' }
  );

  const homeTeamPlayers = match3d.players.filter((p) => p.isHome);
  const awayTeamPlayers = match3d.players.filter((p) => !p.isHome);
  assert.equal(homeTeamPlayers.length, 11);
  assert.equal(awayTeamPlayers.length, 11);

  const homeOutfielder = homeTeamPlayers.find((p) => p.role !== 'GK');
  assert.equal(homeOutfielder.mesh.userData.kitData.kitType, 'third');
  const homeGk = homeTeamPlayers.find((p) => p.role === 'GK');
  assert.equal(homeGk.mesh.userData.kitData.kitType, 'gk');

  const awayOutfielder = awayTeamPlayers.find((p) => p.role !== 'GK');
  assert.equal(awayOutfielder.mesh.userData.kitData.kitType, 'opponent');

  // Thay người trực tiếp trong trận 3D
  const subRes = match3d.substituteHomePlayer(homeOutfielder.player.id, benchPlayer);
  assert.equal(subRes.ok, true);
  assert.equal(homeOutfielder.player.id, benchPlayer.id);
  assert.equal(homeOutfielder.mesh.userData.kitData.displayName, formatKitName(benchPlayer.name));
  assert.equal(homeOutfielder.mesh.userData.kitData.shirtNumber, String(benchPlayer.shirtNumber));
  assert.equal(homeOutfielder.mesh.userData.kitData.kitType, benchPlayer.position === 'GK' ? 'gk' : 'third');

  // Clean up match meshes & verify refCounts reach 0
  match3d.players.forEach((p) => cf.releaseMeshKit(p.mesh));
  match3d.players = [];
  const stats = sharedPlayerKitSystem.getCacheStats();
  assert.equal(stats.totalRefs, 0, 'Sau khi kết thúc trận toàn bộ refCount phải được giải phóng về 0');
});

// ============================================================================
// 9. POOLING, PRUNE & SAFE DISPOSAL (VRAM HYGIENE)
// ============================================================================
test('KIT-9: Pooling dùng chung CanvasTexture cho cấu hình giống nhau, prune giới hạn cache & bảo vệ sharedAsset khi dispose', () => {
  sharedPlayerKitSystem.disposeAll();
  sharedPlayerKitSystem.maxIdleEntries = 4;
  const cf = new CharacterFactory();

  const m1 = cf.createHumanoid({ outfit: 'kit_home', kit: { fullName: 'Vitinha', shirtNumber: 17 } });
  const m2 = cf.createHumanoid({ outfit: 'kit_home', kit: { fullName: 'Vitinha', shirtNumber: 17 } });
  assert.equal(m1.userData.rig.kitParts.chest.material, m2.userData.rig.kitParts.chest.material, 'Cùng kit phải dùng chung material');
  const key = m1.userData.kitKey;
  assert.equal(sharedPlayerKitSystem._pool.get(key).refCount, 2);

  // Dispose mesh thông qua safeDisposeObject3D không được làm hỏng shared material/texture đang dùng chung
  let disposedFlag = false;
  m1.userData.rig.kitParts.chest.material.dispose = () => { disposedFlag = true; };
  safeDisposeObject3D(m1);
  assert.equal(disposedFlag, false, 'AssetCache KHÔNG được dispose material gắn userData.sharedAsset');

  cf.releaseMeshKit(m1);
  cf.releaseMeshKit(m2);
  assert.equal(sharedPlayerKitSystem._pool.get(key).refCount, 0);

  // Tạo thêm 6 entry rồi nhả -> pruneUnusedCache phải giữ tối đa maxIdleEntries = 4
  for (let i = 1; i <= 6; i++) {
    const tmp = cf.createHumanoid({ outfit: 'kit_home', kit: { fullName: `Test ${i}`, shirtNumber: i } });
    cf.releaseMeshKit(tmp);
  }
  const stats = sharedPlayerKitSystem.getCacheStats();
  assert.ok(stats.idleEntries <= 4, `Idle cache phải được prune <= 4, got ${stats.idleEntries}`);
  sharedPlayerKitSystem.maxIdleEntries = 24;
  sharedPlayerKitSystem.disposeAll();
});

// ============================================================================
// 10. SAVE & LOAD PERSISTENCE
// ============================================================================
test('KIT-10: Save & Load bảo toàn activeKit, số áo, đội trưởng và đồng bộ lại 3D khi tải game', () => {
  sharedPlayerKitSystem.disposeAll();
  const s1 = new GameState();
  const target = s1.getPsgSquad().find((p) => p.position !== 'GK');
  s1.setActiveKit('third');
  s1.formationSystem.setShirtNumber(target.id, 88);
  s1.formationSystem.setCaptain(target.id);

  const snap = s1.exportFullState();

  const s2 = new GameState();
  s2.importFullState(snap);
  assert.equal(s2.activeKit, 'third');
  const restored = s2.getPsgSquad().find((p) => p.id === target.id);
  assert.equal(restored.shirtNumber, 88);
  assert.equal(s2.formationSystem.captainId, target.id);

  const cf = new CharacterFactory();
  const env = makeLightCampusMock();
  const npcs2 = new NpcSystem(new THREE.Scene(), cf, new AnimationSystem(), env.campus);
  npcs2.syncSquadPlayers(s2.getPsgSquad(), 19, s2.activeKit, s2.formationSystem.captainId);
  const npcRestored = npcs2.npcs.find((n) => n.playerId === target.id);
  assert.equal(npcRestored.mesh.userData.kitData.kitType, 'third');
  assert.equal(npcRestored.mesh.userData.kitData.shirtNumber, '88');
  assert.equal(npcRestored.mesh.userData.kitData.isCaptain, true);
});

console.log(`\n🎉 HOÀN TẤT KIỂM THỬ PSG PLAYER KIT SYSTEM: ${passed}/10 ĐẠT 100%!`);
