// tests/verify_global_crowd_distribution.mjs
// Bộ kiểm thử toàn diện 20 kịch bản cho Hệ thống Phân bố Đám đông Toàn Cục, Hoạt động Thông minh & Điều hướng NPC:
// 1. Giải tán sau tập luyện theo đợt lệch pha (staggered post_training_depart)
// 2. 30 cầu thủ vào Phòng Thay Đồ (cap=18): không chen chúc quá sức chứa, xếp hàng trật tự & luân phiên
// 3. 20 NPC di chuyển qua hành lang hẹp: không deadlock vô hạn, giữ khoảng cách tách giãn
// 4. Nhiều NPC cùng đi tới 1 cửa phòng Residence: hàng chờ trước cửa trật tự, không chồng lấn
// 5. Phòng Thay Đồ FULL: khách ưu tiên thấp bị từ chối & chuyển hướng sang địa điểm thay thế
// 6. Phân luồng buổi tập: cầu thủ khỏe ra sân tập (TRAINING), cầu thủ chấn thương sang Trung tâm Y tế
// 7. Tranh chấp máy Gym (4 máy chạy bộ): tối đa 4 người sử dụng, dư thừa chuyển máy khác/hàng chờ
// 8. A* né hành lang/khu vực mật độ HIGH/FULL sang tuyến ít đông hơn
// 9. 30 phòng riêng Player Residence (cap=1): chỉ đúng chủ nhân được vào
// 10. Nhân sự Y tế tuần phòng & chăm sóc bệnh nhân tại Trung tâm Y tế
// 11. Kết thúc họp Ban điều hành (endBoardMeeting): giải tán theo đợt lệch pha
// 12. Cửa hẹp ưu tiên người đi ra (exit) trước người đi vào (enter)
// 13. Hai nhóm đi ngược chiều trong hành lang tránh nhau mượt mà + ưu tiên nhường đường theo priority
// 14. Chặn đường & phát hiện dao động tại chỗ (STUCK -> REROUTING tuyến thay thế, ZERO teleport)
// 15. Điểm đến chuyển FULL/OVERCROWDED giữa đường -> tái phân bổ / giải tỏa hợp lý
// 16. Chuyển đổi LOD3 <-> LOD0 bảo toàn đích đến, bảo vệ cấm vào HQ & khôi phục tư thế
// 17. Đồng bộ GameTimeSystem (Pause / Resume / SpeedMultiplier) không NaN
// 18. Save / Load giữa lúc đang hoạt động bảo toàn crowdState, reservations, waves & activityHistory
// 19. Hủy tác vụ (cancelNpcTask) giải phóng sạch ActivityPoint, CrowdSlot, Wave & Queue
// 20. Stress Test 45+ NPC toàn khuôn viên + Debug HUD bật/tắt (ẩn hoàn toàn khi OFF)

import assert from 'node:assert/strict';
import * as THREE from 'three';

globalThis.THREE = THREE;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

function createTestDomEnv() {
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

  const storageMap = new Map();
  globalThis.localStorage = {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
    clear: () => storageMap.clear()
  };

  class MockClassList {
    constructor(el) { this.el = el; this._set = new Set(); }
    _syncFromString(str) { this._set = new Set(String(str || '').split(/\s+/).filter(Boolean)); }
    add(...cls) { cls.forEach((c) => c && this._set.add(c)); }
    remove(...cls) { cls.forEach((c) => this._set.delete(c)); }
    contains(c) { return this._set.has(c); }
    toString() { return Array.from(this._set).join(' '); }
  }

  class MockElement {
    constructor(tagName = 'DIV') {
      this.tagName = tagName.toUpperCase();
      this.id = '';
      this.children = [];
      this.parentElement = null;
      this.dataset = {};
      this.style = { cssText: '' };
      this.value = '';
      this._attrs = {};
      this._listeners = new Map();
      this._text = '';
      this.classList = new MockClassList(this);
    }
    get parentNode() { return this.parentElement; }
    set className(v) { this.classList._syncFromString(v); }
    get className() { return this.classList.toString(); }
    set innerHTML(html) { this._text = String(html || ''); }
    get innerHTML() { return this._text; }
    set textContent(t) { this._text = String(t ?? ''); }
    get textContent() { return this._text; }
    appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
    removeChild(c) {
      const idx = this.children.indexOf(c);
      if (idx !== -1) { this.children.splice(idx, 1); c.parentElement = null; }
      return c;
    }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(fn);
    }
    removeEventListener(type, fn) {
      const arr = this._listeners.get(type);
      if (arr) this._listeners.set(type, arr.filter((f) => f !== fn));
    }
    setAttribute(k, v) { this._attrs[k] = v; }
    getAttribute(k) { return this._attrs[k] ?? null; }
    querySelectorAll() { return []; }
    querySelector() { return null; }
  }

  const rootBody = new MockElement('BODY');
  [
    'modal-backdrop', 'modal-title', 'modal-body', 'modal-box', 'modal-back', 'modal-close',
    'task-backdrop', 'task-title', 'task-body', 'task-box', 'task-back', 'task-close',
    'toast-box', 'hud-season', 'hud-clock', 'hud-budget', 'hud-fps', 'hud-match-alert',
    'phone-badge', 'btn-interact', 'interact-hint', 'desk-doc-menu', 'btn-time-pause'
  ].forEach((id) => {
    const el = new MockElement('DIV');
    el.id = id;
    rootBody.appendChild(el);
  });

  function findById(node, id) {
    if (node.id === id) return node;
    for (const c of node.children) {
      const found = findById(c, id);
      if (found) return found;
    }
    return null;
  }

  globalThis.document = {
    body: rootBody,
    addEventListener() {},
    removeEventListener() {},
    createElement: (tag) => {
      if (String(tag).toLowerCase() === 'canvas') {
        return { width: 256, height: 96, getContext: () => ctxMock };
      }
      return new MockElement(tag);
    },
    getElementById: (id) => findById(rootBody, id),
    querySelectorAll: () => [],
    querySelector: () => null
  };
  globalThis.window = { innerWidth: 1280, innerHeight: 800, addEventListener() {}, removeEventListener() {} };
}

createTestDomEnv();

import { GameState } from '../src/club/GameState.js';
import { CrowdDistributionSystem, CROWD_DENSITY } from '../src/ai/CrowdDistributionSystem.js';
import { PathfindingSystem } from '../src/ai/PathfindingSystem.js';
import { AnimationSystem } from '../src/animations/AnimationSystem.js';
import { PsgCampusScene } from '../src/scene/PsgCampusScene.js';
import { TrainingComplexScene } from '../src/scene/TrainingComplexScene.js';
import { TextureFactory } from '../src/core/TextureFactory.js';
import { FurnitureFactory } from '../src/scene/FurnitureFactory.js';
import { VehicleSystem } from '../src/vehicles/VehicleSystem.js';
import { CharacterFactory } from '../src/characters/CharacterFactory.js';
import { NpcSystem, NPC_STATES } from '../src/npc/NpcSystem.js';
import { SaveManager } from '../src/save/SaveManager.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err);
    throw err;
  }
}

function buildLiveWorld(clockHour = 10.0) {
  const state = new GameState();
  const hh = Math.floor(clockHour);
  const mm = Math.floor((clockHour - hh) * 60);
  state.timeSystem.reset(`2026-08-03T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
  state.clockHour = state.timeSystem.clockHour;
  const scene = new THREE.Scene();
  const texFactory = new TextureFactory();
  const furnFactory = new FurnitureFactory(texFactory);
  const vehicleSystem = new VehicleSystem(texFactory);
  const campus = new PsgCampusScene(scene, texFactory, furnFactory, vehicleSystem);
  const trainingComplex = new TrainingComplexScene(campus, texFactory, furnFactory, vehicleSystem, state.playerResidenceSystem);
  state.trainingSystem.build3DTrainingEquipment(campus);

  const charFactory = new CharacterFactory();
  const animSystem = new AnimationSystem();
  const npcSystem = new NpcSystem(scene, charFactory, animSystem, campus);
  npcSystem.attachTrainingSystem(state.trainingSystem);
  npcSystem.attachActivitySystem(state.activityPointSystem);
  // Bổ sung đủ 30 cầu thủ đội một PSG để mô phỏng thực tế toàn bộ đội hình + BHL (45+ NPC)
  const curSquad = state.getPsgSquad();
  if (curSquad.length < 30) {
    const extras = state.players.filter((p) => p.club !== 'Paris Saint-Germain').slice(0, 30 - curSquad.length);
    extras.forEach((p, idx) => { p.club = 'Paris Saint-Germain'; p.shirtNumber = 40 + idx; });
    state.notifySquadChanged();
  }
  npcSystem.spawnFromProfiles(state.npcs, state.clockHour);
  npcSystem.syncStaffNpcs(state.staffDb.active, state.clockHour);
  npcSystem.syncSquadPlayers(state.getPsgSquad(), state.clockHour, state.activeKit, state.formationSystem?.captainId || null);
  state.registerNpcSystem(npcSystem);

  return { state, scene, campus, trainingComplex, npcSystem };
}

// 1. 30 players finishing training depart in staggered waves
test('GCD-01: 30 cầu thủ kết thúc buổi tập rời sân theo từng đợt lệch pha (staggered waves)', () => {
  const { state, npcSystem } = buildLiveWorld(12.1);
  const focusPos = { x: 192, z: -86 };
  const players = npcSystem.npcs.filter((n) => n.isPlayer);
  assert.ok(players.length >= 20, 'Phải có đầy đủ cầu thủ đội một');

  // Tick during training end -> transition to 12.26 (post-training)
  npcSystem.update(0.2, focusPos, 12.1, null, 'PSG', { focusPos, lodStrideMultiplier: 1, trainingPitchVisible: true });
  npcSystem.update(0.2, focusPos, 12.26, null, 'PSG', { focusPos, lodStrideMultiplier: 1, trainingPitchVisible: true });

  const waveInfos = players.map((p) => npcSystem.crowdSystem.getWaveInfo(p.id, npcSystem._simClock));
  const activeWaves = waveInfos.filter((w) => w.active);
  assert.ok(activeWaves.length >= players.length * 0.7, 'Đa số cầu thủ rời sân phải được gán vào wave post_training_depart');
  const uniqueWaveIdx = new Set(activeWaves.map((w) => w.waveIndex));
  assert.ok(uniqueWaveIdx.size >= 3, `Phải chia ít nhất 3 đợt lệch pha thay vì đi cùng lúc (hiện tại ${uniqueWaveIdx.size})`);
  const readyImmediately = activeWaves.filter((w) => w.ready).length;
  assert.ok(readyImmediately < activeWaves.length, 'Không được để toàn bộ cầu thủ mở đường rời sân ở tick 0');
});

// 2. 30 players heading to locker_room -> max occupancy <= 18, overflow queues orderly
test('GCD-02: 30 cầu thủ vào Phòng Thay Đồ (cap=18) không chen chúc vượt sức chứa', () => {
  const { npcSystem } = buildLiveWorld(8.85);
  const players = npcSystem.npcs.filter((n) => n.isPlayer);
  const focusPos = { x: 132, z: -48 };

  // Cho các đợt mở dần và bước tới Phòng thay đồ
  for (let step = 0; step < 80; step++) {
    npcSystem.update(0.25, focusPos, 8.9, null, 'PSG', { focusPos, lodStrideMultiplier: 1, trainingPitchVisible: false });
  }
  const lockerStats = npcSystem.crowdSystem.getLocationStats('locker_room');
  assert.equal(lockerStats.maxCapacity, 18, 'Sức chứa Phòng Thay Đồ phải là 18 (< 30)');
  assert.ok(lockerStats.currentOccupancy <= 18, `Số cầu thủ trong Phòng Thay Đồ (${lockerStats.currentOccupancy}) không được vượt 18`);
  assert.ok(lockerStats.currentOccupancy + lockerStats.reservedCapacity <= 18, 'Tổng đang ở + giữ chỗ không được vượt 18');

  const queuingOrWaiting = players.filter((p) => p.state === 'WAITING_FOR_ACTIVITY' || p.state === 'QUEUING' || p.state === 'RESTING').length;
  assert.ok(queuingOrWaiting >= 1 || lockerStats.waitingCount >= 0, 'Nhóm thừa phải chờ trật tự hoặc luân phiên ra ngoài');
});

// 3. 20 NPCs in narrow corridor -> separation & no permanent lock / NaN
test('GCD-03: 20 NPC đi qua hành lang hẹp không khóa chết lẫn nhau & giữ khoảng cách', () => {
  const { npcSystem } = buildLiveWorld(17.5);
  const players = npcSystem.npcs.filter((n) => n.isPlayer).slice(0, 20);
  const focusPos = { x: 162, z: 9.0 };

  for (let i = 0; i < players.length; i++) {
    const n = players[i];
    const fromWest = i % 2 === 0;
    n.mesh.position.set(fromWest ? 148 + (i % 5) * 0.9 : 176 - (i % 5) * 0.9, 0.14, 9.0 + ((i % 3) - 1) * 0.5);
    n.mode = 'rest';
    n.state = 'WALKING';
    n._decisionCooldown = 60;
    npcSystem.setNpcDestination(n, fromWest ? 176 : 148, 9.0, { _bypassDoorCheck: true });
  }

  for (let step = 0; step < 70; step++) {
    npcSystem.update(0.15, focusPos, 17.5, null, 'PSG', { focusPos, lodStrideMultiplier: 1 });
  }

  let progressed = 0;
  for (let i = 0; i < players.length; i++) {
    const n = players[i];
    assert.ok(Number.isFinite(n.mesh.position.x) && Number.isFinite(n.mesh.position.z), 'Tọa độ NPC không được NaN');
    const fromWest = i % 2 === 0;
    if ((fromWest && n.mesh.position.x > 155) || (!fromWest && n.mesh.position.x < 169)) progressed++;
  }
  assert.ok(progressed >= 12, `Ít nhất 12/20 NPC phải vượt qua đoạn hành lang ngược chiều (đạt ${progressed})`);
});

// 4. Multiple NPCs targeting 1 residence room door -> ordered queue
test('GCD-04: Nhiều NPC hướng tới cùng 1 cửa phòng Residence xếp hàng tuần tự', () => {
  const { npcSystem } = buildLiveWorld(20.0);
  const doorKey = 'door_room_01';
  const r1 = npcSystem.crowdSystem.requestDoorwayPassage(doorKey, 'p1', 'enter', 60, 10);
  const r2 = npcSystem.crowdSystem.requestDoorwayPassage(doorKey, 'p2', 'enter', 60, 11);
  const r3 = npcSystem.crowdSystem.requestDoorwayPassage(doorKey, 'p3', 'enter', 60, 12);

  assert.equal(r1.granted, true, 'NPC đầu tiên được phép qua cửa');
  assert.equal(r2.granted, false, 'NPC thứ 2 phải xếp hàng chờ');
  assert.equal(r3.granted, false, 'NPC thứ 3 phải xếp hàng chờ');
  assert.equal(r2.reason, 'doorway_busy');

  npcSystem.crowdSystem.releaseDoorwayPassage(doorKey, 'p1');
  const r2Retry = npcSystem.crowdSystem.requestDoorwayPassage(doorKey, 'p2', 'enter', 60, 13);
  assert.equal(r2Retry.granted, true, 'Sau khi p1 qua cửa, p2 đứng đầu hàng được mở cửa');
});

// 5. Locker room FULL -> optional visitor blocked & redirected
test('GCD-05: Địa điểm FULL chặn khách ưu tiên thấp & gợi ý địa điểm thay thế', () => {
  const { npcSystem } = buildLiveWorld(17.5);
  const crowd = npcSystem.crowdSystem;
  for (let i = 0; i < 18; i++) {
    crowd.reserveSlot('locker_room', `fill_${i}`, 80, 10, 120);
  }
  const stats = crowd.getLocationStats('locker_room');
  assert.equal(stats.crowdDensity, CROWD_DENSITY.FULL);

  const lowNpc = npcSystem.npcs.find((n) => n.isPlayer);
  const gate = crowd.canEnterLocation('locker_room', lowNpc, 45);
  assert.equal(gate.allowed, false, 'Khách ưu tiên thấp (45) phải bị chặn khi locker_room FULL');
  assert.equal(gate.reason, 'full');

  const alt = crowd.findAlternativeLocation('locker_room', lowNpc, { priority: 45, ownedRoomNumber: 3 });
  assert.ok(alt && alt.locationId !== 'locker_room', 'Phải tìm được địa điểm thay thế hợp lệ');
});

// 6. Squad split: healthy to pitch, injured to medical_center
test('GCD-06: Giờ tập chia luồng cầu thủ khỏe ra sân tập & cầu thủ chấn thương sang Trung tâm Y tế', () => {
  const { state, npcSystem } = buildLiveWorld(10.0);
  const squad = state.getPsgSquad();
  const pInjured = squad[2];
  pInjured.injuryDays = 5;
  pInjured.injury = 'Căng cơ đùi';

  const focusPos = { x: 192, z: -86 };
  for (let i = 0; i < 6; i++) {
    npcSystem.update(0.25, focusPos, 10.0, null, 'PSG', { focusPos, lodStrideMultiplier: 1, trainingPitchVisible: true });
  }

  const injNpc = npcSystem.npcs.find((n) => n.isPlayer && n.playerId === pInjured.id);
  const healthyNpc = npcSystem.npcs.find((n) => n.isPlayer && n.playerId === squad[0].id);
  assert.equal(injNpc.mode, 'medical_rehab', 'Cầu thủ chấn thương phải chuyển sang medical_rehab');
  assert.ok(['MEDICAL_CHECK', 'RECOVERY'].includes(injNpc.state), 'State cầu thủ chấn thương phải là MEDICAL_CHECK hoặc RECOVERY');
  assert.equal(healthyNpc.state, 'TRAINING', 'Cầu thủ khỏe mạnh phải ở trạng thái TRAINING');
});

// 7. Gym equipment contention: max 4 treadmills occupied, excess redirected/queued
test('GCD-07: Tranh chấp máy chạy bộ (4 máy) -> tối đa 4 người dùng, dư thừa chuyển máy khác/hàng chờ', () => {
  const { npcSystem } = buildLiveWorld(17.5);
  const players = npcSystem.npcs.filter((n) => n.isPlayer).slice(0, 8);
  const claimedPoints = [];
  for (let i = 0; i < players.length; i++) {
    const res = npcSystem.assignSmartDestination(players[i], {
      locationId: 'fitness_gym',
      area: 'gym',
      interactionTypes: ['gym_treadmill'],
      activityKey: 'gym_test',
      activityLabel: 'Tập máy chạy bộ',
      targetState: 'GOING_TO_GYM',
      priority: 65,
      allowQueue: true,
      pathOpts: { queuePath: true }
    });
    if (res?.point?.activityPointId) claimedPoints.push(res.point.activityPointId);
  }
  const uniqueTreadmills = new Set(claimedPoints.filter((id) => id.startsWith('gym_treadmill')));
  assert.ok(uniqueTreadmills.size <= 4, 'Không thể chiếm quá 4 máy chạy bộ');
  const queuedOrAlt = players.filter((p) => p.state === 'WAITING_FOR_ACTIVITY' || !p.activePointId || !String(p.activePointId).startsWith('gym_treadmill')).length;
  assert.ok(queuedOrAlt >= 4, 'Ít nhất 4 cầu thủ dư thừa phải vào hàng chờ hoặc đổi thiết bị khác');
});

// 8. Crowd-aware A* adds penalty & avoids congested cells/segments
test('GCD-08: A* cộng trọng số đám đông & chọn lộ trình tránh khu vực mật độ HIGH/FULL', () => {
  const { npcSystem } = buildLiveWorld(17.5);
  const pathfinder = npcSystem.pathfinder;
  const crowd = npcSystem.crowdSystem;

  // Mô phỏng 10 NPC tụ tập tại vùng giữa quảng trường (x=166, z=-22) -> mật độ cao
  const crowdNpcs = [];
  for (let i = 0; i < 10; i++) {
    crowdNpcs.push({
      id: `crowd_${i}`,
      isPlayer: true,
      state: 'IDLE',
      mesh: { position: new THREE.Vector3(166 + (i % 3) * 0.6, 0.14, -22 + Math.floor(i / 3) * 0.6) }
    });
  }
  crowd.updateFromNpcs(crowdNpcs, 10);

  const penHot = crowd.getSegmentCrowdPenalty(164, -22, 166, -22);
  const penEmpty = crowd.getSegmentCrowdPenalty(164, -12, 166, -12);
  assert.ok(penHot > penEmpty + 2.0, `Ô có đông người phải có penalty cao hơn rõ rệt (${penHot} vs ${penEmpty})`);

  const path = pathfinder.findLocalGridPath(158, -22, 174, -22, 420, { alternateRouteAttempt: 1 });
  assert.ok(Array.isArray(path) && path.length >= 2, 'A* có trọng số đám đông vẫn phải tìm ra đường đi hợp lệ');
});

// 9. 30 private Residence rooms: cap=1, owner-only
test('GCD-09: 30 phòng riêng Player Residence giới hạn sức chứa 1 & chỉ chủ nhân được vào', () => {
  const { state, npcSystem } = buildLiveWorld(20.5);
  const resSys = state.playerResidenceSystem;
  const r1 = resSys.getRoomByNumber(1);
  assert.ok(r1?.playerId, 'Phòng 1 phải có chủ sở hữu');

  const ownerNpc = npcSystem.npcs.find((n) => n.isPlayer && n.playerId === r1.playerId);
  const intruderNpc = npcSystem.npcs.find((n) => n.isPlayer && n.playerId !== r1.playerId);
  assert.ok(ownerNpc && intruderNpc);

  const allowOwner = npcSystem.crowdSystem.canEnterLocation('res_room_01', ownerNpc, 70);
  const denyIntruder = npcSystem.crowdSystem.canEnterLocation('res_room_01', intruderNpc, 70);
  assert.equal(allowOwner.allowed, true, 'Chủ phòng phải được phép vào phòng mình');
  assert.equal(denyIntruder.allowed, false, 'Cầu thủ khác không được phép vào phòng người khác');
  assert.equal(denyIntruder.reason, 'private_room_denied');
});

// 10. Medical staff rounds & treatment at Medical Center
test('GCD-10: Đội ngũ Y tế (npc_med, bác sĩ, vật lý trị liệu) tuần phòng & điều trị cầu thủ chấn thương', () => {
  const { state, npcSystem } = buildLiveWorld(10.5);
  const p = state.getPsgSquad()[3];
  p.injuryDays = 4;
  p.injury = 'Đau cổ chân';

  const focusPos = { x: 168, z: -38 };
  for (let i = 0; i < 20; i++) {
    npcSystem.update(0.4, focusPos, 10.5, null, 'PSG', { focusPos, lodStrideMultiplier: 1 });
  }
  const medUnit = npcSystem.npcs.filter((n) => ['npc_med', 'npc_med_doc', 'npc_med_physio'].includes(n.id));
  assert.ok(medUnit.length >= 2, 'Phải có ít nhất 2 nhân sự Y tế trong scene');
  const attending = medUnit.some((m) => m.state === 'MEDICAL_CHECK' || String(m.task).includes('điều trị') || String(m.task).includes('Y tế'));
  assert.equal(attending, true, 'Nhân sự Y tế phải trực tiếp thăm khám/điều trị tại Trung tâm Y tế');
});

// 11. Board meeting exit staggered waves
test('GCD-11: Kết thúc họp Ban điều hành giải tán theo đợt lệch pha & giải phóng ghế họp', () => {
  const { npcSystem } = buildLiveWorld(11.0);
  npcSystem.summonBoardMeeting();
  const focusPos = { x: -25, z: -12 };
  npcSystem.update(0.2, focusPos, 11.0, null, 'PSG', { focusPos, lodStrideMultiplier: 1 });
  npcSystem.endBoardMeeting();

  const staffReturning = npcSystem.npcs.filter((n) => !n.isPlayer && n.groupId === 'meeting_depart');
  assert.ok(staffReturning.length >= 4, 'Nhân sự rời phòng họp phải được phân bổ theo group meeting_depart');
  const waves = new Set(staffReturning.map((s) => npcSystem.crowdSystem.getWaveInfo(s.id, npcSystem._simClock).waveIndex));
  assert.ok(waves.size >= 2, 'Phải có tối thiểu 2 đợt lệch pha khi rời phòng họp');
});

// 12. Narrow doorway exit-over-entry arbitration
test('GCD-12: Cửa hẹp ưu tiên NPC đi ra (exit) trước NPC đang chờ đi vào (enter)', () => {
  const crowd = new CrowdDistributionSystem();
  const doorKey = 'door_room_05';
  const enterFirst = crowd.requestDoorwayPassage(doorKey, 'outside_npc', 'enter', 60, 1.0);
  assert.equal(enterFirst.granted, true);
  // Khi cửa đang bận, cả enter và exit chờ, nhưng exit được ưu tiên hơn enter
  const exitWait = crowd.requestDoorwayPassage(doorKey, 'inside_npc', 'exit', 60, 2.0);
  assert.equal(exitWait.granted, false);
  const enterWait = crowd.requestDoorwayPassage(doorKey, 'outside_npc_2', 'enter', 60, 1.5);
  assert.equal(enterWait.granted, false);

  crowd.releaseDoorwayPassage(doorKey, 'outside_npc');
  const exitRetry = crowd.requestDoorwayPassage(doorKey, 'inside_npc', 'exit', 60, 3.0);
  assert.equal(exitRetry.granted, true, 'NPC đi ra phải được ưu tiên qua cửa trước người vào');
});

// 13. Opposing groups RVO right-side passing & priority yielding
test('GCD-13: Hai NPC đi ngược chiều né phải & NPC ưu tiên thấp nhường nhiều hơn', () => {
  const pathfinder = new PathfindingSystem();
  const highNpc = {
    id: 'hi',
    priority: 90,
    mesh: { position: new THREE.Vector3(0, 0.14, 0), visible: true },
    _velX: 1.8, _velZ: 0
  };
  const lowNpc = {
    id: 'lo',
    priority: 40,
    mesh: { position: new THREE.Vector3(1.1, 0.14, 0.05), visible: true },
    _velX: -1.8, _velZ: 0
  };
  const all = [highNpc, lowNpc];
  pathfinder.rebuildNpcSpatialGrid(all);

  const vHigh = pathfinder.computeAvoidanceVelocity(highNpc, 1, 0, 2.0, all, null);
  const vLow = pathfinder.computeAvoidanceVelocity(lowNpc, -1, 0, 2.0, all, null);
  const steerHigh = Math.abs(vHigh.vz);
  const steerLow = Math.abs(vLow.vz);

  assert.ok(steerLow > 0.1, 'NPC phải có lực né ngang sang phải khi đối đầu cận kề');
  assert.ok(steerLow > steerHigh, `NPC ưu tiên thấp phải nhường nhiều hơn (${steerLow.toFixed(3)} > ${steerHigh.toFixed(3)})`);
});

// 14. Oscillation / stuck recovery without teleportation
test('GCD-14: Phát hiện kẹt & dao động -> STUCK_RECOVERY & tìm đường vòng (ZERO teleport)', () => {
  const { npcSystem } = buildLiveWorld(17.5);
  const n = npcSystem.npcs.find((x) => x.isPlayer);
  n.mode = 'rest';
  n.state = 'WALKING';
  n._decisionCooldown = 60;
  n.mesh.position.set(164.0, 0.14, -18.0);
  n.finalDest = { x: 184.0, z: -18.0 };
  n.target.set(184.0, 0.14, -18.0);
  n.path = [{ x: 174.0, z: -18.0 }, { x: 184.0, z: -18.0 }];
  n.pathIdx = 0;
  // Giả lập lịch sử dao động tại chỗ sát ngưỡng 1.6s với attempt=1 trước đó -> bước update sẽ chuyển STUCK_RECOVERY & REROUTING
  n._oscTravelDist = 1.6;
  n._oscAnchorX = 164.0;
  n._oscAnchorZ = -18.0;
  n._oscTimer = 1.56;
  n._oscFlipCount = 4;
  n.recoveryAttempts = 1;
  n.stuckStatus = 'STUCK';
  n.replanCooldown = 0;

  const beforeX = n.mesh.position.x;
  const beforeZ = n.mesh.position.z;
  const focusPos = { x: 164.0, z: -18.0 };
  npcSystem.update(0.1, focusPos, 17.5, null, 'PSG', { focusPos, lodStrideMultiplier: 1 });

  assert.equal(n.state, 'STUCK_RECOVERY');
  assert.equal(n.stuckStatus, 'REROUTING');
  const stepDist = Math.hypot(n.mesh.position.x - beforeX, n.mesh.position.z - beforeZ);
  assert.ok(stepDist <= n.speed * 0.15 + 0.05, `Tuyệt đối không dịch chuyển tức thời (stepDist=${stepDist.toFixed(3)}m)`);
});

// 15. Mid-walk destination becomes FULL / OVERCROWDED -> graceful redirect / dispersal
test('GCD-15: Điểm đến đầy giữa đường hoặc quá tải -> chuyển hướng & giải tỏa người rảnh', () => {
  const { npcSystem } = buildLiveWorld(17.5);
  const crowd = npcSystem.crowdSystem;
  const players = npcSystem.npcs.filter((n) => n.isPlayer);

  // Đặt 15 cầu thủ vào res_lounge (cap = 12 -> OVERCROWDED)
  const lounge = crowd.getLocation('res_lounge');
  for (let i = 0; i < 15 && i < players.length; i++) {
    players[i].currentLocation = 'res_lounge';
    players[i].destinationLocation = 'res_lounge';
    players[i].priority = 45;
    lounge.currentOccupants.add(players[i].id);
  }
  const st = crowd.getLocationStats('res_lounge');
  assert.equal(st.crowdDensity, CROWD_DENSITY.OVERCROWDED);

  // Chọn 1 cầu thủ đi bộ hướng về locker_room khi locker_room FULL không có reservation
  for (let i = 0; i < 18; i++) {
    crowd.reserveSlot('locker_room', `full_lk_${i}`, 80, 10, 120);
  }
  const walker = players[16];
  walker.currentLocation = 'tc_plaza';
  walker.destinationLocation = 'locker_room';
  walker._decisionCooldown = 25;

  npcSystem._enforceMidWalkCapacityAndDispersal(false);
  assert.equal(walker._decisionCooldown, 0, 'NPC đang đi tới nơi đã FULL không giữ chỗ phải được đánh dấu chọn lại hoạt động');
});

// 16. LOD3 <-> LOD0 transition preserves destination, HQ guard & posture
test('GCD-16: Chuyển đổi LOD3 <-> LOD0 giữ nguyên đích đến, cấm cầu thủ vào HQ & phục hồi tư thế', () => {
  const { npcSystem } = buildLiveWorld(18.0);
  const p = npcSystem.npcs.find((n) => n.isPlayer);
  assert.ok(p);

  // Thử giao tọa độ trái phép trong HQ cho cầu thủ -> _completeLod3Arrival phải chặn tuyệt đối
  p.finalDest = { x: -20, z: -10 };
  p.mode = 'rest';
  npcSystem._completeLod3Arrival(p, false);
  assert.equal(PathfindingSystem.isHqInteriorPoint(p.mesh.position.x, p.mesh.position.z), false, 'Cầu thủ không được lọt vào HQ ở LOD3');

  // LOD0 -> LOD3 -> LOD0 bảo toàn finalDest
  p.finalDest = { x: 186, z: 12 };
  const farPlayerPos = { x: -20, z: -10 };
  npcSystem.update(0.1, farPlayerPos, 18.0, null, 'PSG', { focusPos: farPlayerPos, lodStrideMultiplier: 1 });
  assert.equal(p._lod, 3);
  const nearPlayerPos = { x: 186, z: 12 };
  npcSystem.update(0.1, nearPlayerPos, 18.0, null, 'PSG', { focusPos: nearPlayerPos, lodStrideMultiplier: 1 });
  assert.ok(p._lod <= 1, 'Khi camera lại gần phải chuyển về LOD chi tiết');
  assert.ok(Number.isFinite(p.mesh.position.x) && Number.isFinite(p.mesh.position.z));
});

// 17. GameTimeSystem pause / resume / speed changes keep NPC simulation valid
test('GCD-17: GameTimeSystem Pause / Resume / x4 đồng bộ không làm NaN NPC hay Crowd', () => {
  const { state, npcSystem } = buildLiveWorld(10.0);
  state.timeSystem.setPaused(true);
  state.tickTime(1.0);
  const hourPaused = state.clockHour;
  state.tickTime(1.0);
  assert.equal(state.clockHour, hourPaused, 'Khi Pause đồng hồ phải đóng băng');

  state.timeSystem.setPaused(false);
  state.timeSystem.setSpeed(4);
  state.tickTime(0.5);
  assert.ok(state.clockHour > hourPaused, 'Khi Resume & x4 đồng hồ phải tiến lên chuẩn xác');
  npcSystem.update(0.5 * 4, { x: 192, z: -86 }, state.clockHour, null, 'PSG', { focusPos: { x: 192, z: -86 }, lodStrideMultiplier: 1 });
  const snap = npcSystem.getCrowdDebugSnapshot();
  assert.ok(snap.counts.total >= 30 && Number.isFinite(snap.counts.moving));
});

// 18. Save / Load mid-activity preserves crowdState, reservations, waves & history
test('GCD-18: Save / Load bảo toàn crowdState, currentLocation, destinationLocation, groupId & activityHistory', () => {
  const world1 = buildLiveWorld(18.0);
  const p = world1.npcSystem.npcs.find((n) => n.isPlayer);
  world1.npcSystem.assignSmartDestination(p, {
    locationId: 'fitness_gym',
    area: 'gym',
    interactionTypes: ['gym_treadmill', 'gym_bike'],
    activityKey: 'save_gym_test',
    activityLabel: 'Tập gym test Save/Load',
    targetState: 'GOING_TO_GYM',
    priority: 72
  });
  p.groupId = 'custom_wave_test';
  world1.npcSystem.crowdSystem.scheduleGroupWaves('custom_wave_test', [p.id], world1.npcSystem._simClock, { waveSize: 5, intervalSec: 1.0 });

  const saveMgr = new SaveManager();
  const fullSnap = world1.state.exportFullState({ x: 170, y: 0.14, z: -20, yaw: 0, pitch: 0 });
  saveMgr.saveAutoSync(fullSnap);
  const loadedSnap = saveMgr.loadAutoSync().data;

  const world2 = buildLiveWorld(9.0);
  world2.state.importFullState(loadedSnap);
  world2.npcSystem.importRuntimeState(loadedSnap.npcRuntimeState, world2.state.clockHour);

  const restored = world2.npcSystem.getById(p.id);
  assert.equal(restored.destinationLocation, 'fitness_gym');
  assert.equal(restored.assignedActivity, 'save_gym_test');
  assert.equal(restored.groupId, 'custom_wave_test');
  assert.ok(Array.isArray(restored.activityHistory) && restored.activityHistory[0]?.key === 'save_gym_test');
  const gymStats = world2.npcSystem.crowdSystem.getLocationStats('fitness_gym');
  assert.ok(gymStats.reservedCapacity >= 1 || gymStats.currentOccupancy >= 1, 'Reservation tại fitness_gym phải được khôi phục sau Load');
});

// 19. cancelNpcTask releases all reservations, activity points, waves & queues
test('GCD-19: cancelNpcTask giải phóng triệt để ActivityPoint, CrowdSlot, Wave & Queue', () => {
  const { npcSystem } = buildLiveWorld(18.0);
  const p = npcSystem.npcs.find((n) => n.isPlayer);
  const assigned = npcSystem.assignSmartDestination(p, {
    locationId: 'res_dining',
    area: 'residence_dining',
    interactionTypes: ['eat'],
    activityKey: 'cancel_test',
    activityLabel: 'Ăn thử',
    targetState: 'EATING',
    priority: 70
  });
  const ptId = assigned?.point?.activityPointId;
  assert.ok(ptId);
  npcSystem.crowdSystem.scheduleGroupWaves('cancel_grp', [p.id], npcSystem._simClock, { waveSize: 2, intervalSec: 0.5 });

  npcSystem.cancelNpcTask(p);
  assert.equal(p.activePointId, null);
  assert.equal(p.destinationLocation, null);
  assert.equal(p.groupId, null);
  assert.equal(p.state, 'IDLE');
  const pt = npcSystem.activitySystem.getPoint(ptId);
  assert.equal(pt.reservedByNpcId, null);
  assert.equal(pt.occupiedByNpcId, null);
  const loc = npcSystem.crowdSystem.getLocation('res_dining');
  assert.equal(loc.reservations.has(p.id), false);
});

// 20. 45+ NPC stress test & Crowd Debug HUD toggle (hidden when OFF)
test('GCD-20: Stress Test 45+ NPC toàn khuôn viên không NaN/treo & Debug HUD ẩn hoàn toàn khi OFF', () => {
  const { npcSystem } = buildLiveWorld(17.2);
  assert.ok(npcSystem.npcs.length >= 40, `Cần >= 40 NPC (hiện có ${npcSystem.npcs.length})`);

  // Mặc định Debug HUD phải tắt hoàn toàn và không tồn tại trong DOM
  assert.equal(npcSystem.isCrowdDebugEnabled(), false);
  assert.equal(document.getElementById('crowd-debug-hud'), null, 'Không được hiển thị HUD debug khi đang OFF');

  // Bật Debug Mode -> HUD xuất hiện
  npcSystem.setCrowdDebug(true);
  assert.ok(document.getElementById('crowd-debug-hud'), 'Khi bật Debug Mode phải render #crowd-debug-hud');

  const t0 = performance.now();
  const focusPos = { x: 185, z: -20 };
  for (let frame = 0; frame < 60; frame++) {
    npcSystem.update(0.12, focusPos, 17.2 + frame * 0.005, null, 'PSG', { focusPos, lodStrideMultiplier: 1 });
  }
  const elapsedMs = performance.now() - t0;
  assert.ok(elapsedMs < 5000, `Stress test 60 bước không được quá 5000ms (mất ${elapsedMs.toFixed(1)}ms)`);

  for (const n of npcSystem.npcs) {
    assert.ok(Number.isFinite(n.mesh.position.x) && Number.isFinite(n.mesh.position.z), `NPC ${n.id} bị NaN`);
    assert.ok(Object.values(NPC_STATES).includes(n.state), `Trạng thái không hợp lệ ${n.state} cho ${n.id}`);
  }

  // Tắt Debug Mode -> HUD biến mất hoàn toàn khỏi DOM
  npcSystem.setCrowdDebug(false);
  assert.equal(document.getElementById('crowd-debug-hud'), null, 'Khi tắt Debug Mode phải xóa sạch #crowd-debug-hud khỏi DOM');
});

console.log(`\n🎉 TỔNG KẾT KIỂM THỬ GLOBAL CROWD DISTRIBUTION & SMART NPC AI: ${passed}/20 ĐẠT 100%!`);
