// tests/verify_living_world_clock_medical_nav.mjs
// Kiểm thử toàn diện hệ thống:
// 1. Đồng hồ toàn cục (1 ngày = 15 phút thực = x96), Pause / x1 / x2 / x4 đồng bộ tốc độ simulation & chống xuyên tường
// 2. Trung tâm Y tế PSG (168, -38): Trưởng bộ phận Y tế (npc_med), đội ngũ bác sĩ/vật lý trị liệu, nội thất & collider 3D
// 3. Global NPC Avoidance & Collision cho TẤT CẢ NPC (Lookahead obstacle, cửa khóa, RVO tránh nhau, resolveNpcSeparation)
// 4. Lịch trình 24h theo chức vụ nhân sự + LOD 3 parity + Save/Load fidelity
// 5. Ô chữ nhật bé góc trên phải (#hud-team-status) & TrainingSystem.getSquadScheduleStatus

import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';

globalThis.THREE = THREE;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

function createTestEnv() {
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
    constructor() { this._set = new Set(); }
    add(...cls) { cls.forEach((c) => c && this._set.add(c)); }
    remove(...cls) { cls.forEach((c) => this._set.delete(c)); }
    contains(c) { return this._set.has(c); }
    toggle(c, force) {
      if (force === undefined) {
        if (this._set.has(c)) { this._set.delete(c); return false; }
        this._set.add(c); return true;
      }
      if (force) { this._set.add(c); return true; }
      this._set.delete(c); return false;
    }
    toString() { return Array.from(this._set).join(' '); }
  }

  class MockElement {
    constructor(tag = 'DIV', id = '') {
      this.tagName = tag;
      this.id = id;
      this.textContent = '';
      this.innerHTML = '';
      this.value = '';
      this.title = '';
      this.disabled = false;
      this.dataset = {};
      this.style = {};
      this.children = [];
      this._listeners = new Map();
      this.classList = new MockClassList();
    }
    appendChild(c) { this.children.push(c); return c; }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(fn);
    }
    removeEventListener() {}
    dispatchEvent(e) {
      (this._listeners.get(e.type) || []).forEach((fn) => fn(e));
    }
    click() { this.dispatchEvent({ type: 'click', stopPropagation() {}, preventDefault() {} }); }
    querySelectorAll() { return []; }
    querySelector() { return null; }
  }

  const elementsById = new Map();
  const registerEl = (id, tag = 'DIV', dataset = {}) => {
    const el = new MockElement(tag, id);
    el.dataset = dataset;
    elementsById.set(id, el);
    return el;
  };
  [
    'hud-season', 'hud-clock', 'hud-budget', 'hud-fps', 'hud-match-alert',
    'phone-badge', 'btn-interact', 'interact-hint', 'desk-doc-menu',
    'btn-time-pause', 'hud-team-status', 'hud-team-status-badge',
    'hud-team-status-window', 'hud-team-status-title', 'toast-box',
    'btn-phone', 'btn-next-week', 'btn-mute', 'btn-quality', 'btn-sprint'
  ].forEach((id) => registerEl(id, 'DIV'));

  const speedBtns = [1, 2, 4].map((s) => {
    const b = new MockElement('BUTTON');
    b.dataset = { speed: String(s) };
    return b;
  });

  globalThis.document = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return { width: 512, height: 256, getContext: () => ctxMock, toDataURL: () => '' };
      }
      return new MockElement(tag.toUpperCase());
    },
    getElementById: (id) => elementsById.get(id) || null,
    querySelectorAll: (sel) => (sel === '[data-speed]' ? speedBtns : []),
    querySelector: () => null,
    addEventListener: () => {}
  };
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: () => {}
  };

  return { elementsById, speedBtns };
}

const { elementsById } = createTestEnv();

const { GameTimeSystem, GAME_TIME_SCALE } = await import('../src/time/GameTimeSystem.js');
const { GameState } = await import('../src/club/GameState.js');
const { TextureFactory } = await import('../src/core/TextureFactory.js');
const { FurnitureFactory } = await import('../src/scene/FurnitureFactory.js');
const { VehicleSystem } = await import('../src/vehicles/VehicleSystem.js');
const { PsgCampusScene } = await import('../src/scene/PsgCampusScene.js');
const { TrainingComplexScene } = await import('../src/scene/TrainingComplexScene.js');
const { CharacterFactory } = await import('../src/characters/CharacterFactory.js');
const { AnimationSystem } = await import('../src/animations/AnimationSystem.js');
const { NpcSystem } = await import('../src/npc/NpcSystem.js');
const { ActivityPointSystem } = await import('../src/ai/ActivityPointSystem.js');
const { createInitialNpcProfiles } = await import('../src/departments/DepartmentData.js');
const { UIManager } = await import('../src/ui/UIManager.js');
await import('../src/training/TrainingSystem.js');

function test(name, fn) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err);
    process.exitCode = 1;
  }
}

const state = new GameState();
const scene = new THREE.Scene();
const tex = new TextureFactory();
const furn = new FurnitureFactory(tex);
const veh = new VehicleSystem(scene);
const campus = new PsgCampusScene(scene, tex, furn, veh);
const trainingComplex = new TrainingComplexScene(campus, tex, furn, veh, state.playerResidenceSystem);
const charFactory = new CharacterFactory();
const animSystem = new AnimationSystem();
const activitySystem = state.activityPointSystem;
const npcSystem = new NpcSystem(scene, charFactory, animSystem, campus);
npcSystem.attachTrainingSystem(state.trainingSystem);
npcSystem.attachActivitySystem(activitySystem);
npcSystem.spawnFromProfiles(state.npcs, state.clockHour);
npcSystem.syncStaffNpcs(state.staffDb.active, state.clockHour);
npcSystem.syncSquadPlayers(
  state.getPsgSquad(),
  state.clockHour,
  state.activeKit,
  state.formationSystem?.captainId || null
);
state.registerNpcSystem?.(npcSystem);
const trainingSystem = state.trainingSystem;

test('TIME-SCALE: 1 ngày trong game = 15 phút ngoài đời (x96), Pause đóng băng, x2/x4 đồng bộ', () => {
  assert.equal(GAME_TIME_SCALE, 96, 'GAME_TIME_SCALE phải bằng 96 (86400 / 900)');
  const ts = new GameTimeSystem('2026-08-03T09:00:00Z');
  // 0.625s thực = 1 phút game
  ts.tick(0.625);
  assert.ok(Math.abs(ts.clockHour - (9 + 1 / 60)) < 1e-4, `0.625s thực phải bằng 1 phút game (got ${ts.clockHour})`);
  // 37.5s thực = 1 giờ game
  const tsHour = new GameTimeSystem('2026-08-03T08:00:00Z');
  tsHour.tick(37.5);
  assert.ok(Math.abs(tsHour.clockHour - 9.0) < 1e-4, `37.5s thực phải bằng 1 giờ game (got ${tsHour.clockHour})`);
  // 900s thực = 24 giờ (1 ngày)
  const tsDay = new GameTimeSystem('2026-08-03T09:00:00Z');
  for (let i = 0; i < 900; i++) tsDay.tick(1.0);
  assert.equal(tsDay.day, 4, 'Sau 900 giây (15 phút thực) phải sang Ngày 04/08');
  assert.ok(Math.abs(tsDay.clockHour - 9.0) < 1e-3, 'Sau đúng 900s phải giữ nguyên 09:00 ngày mới');
  // Pause đóng băng
  tsDay.setPaused(true);
  const frozenHour = tsDay.clockHour;
  tsDay.tick(50);
  assert.equal(tsDay.clockHour, frozenHour, 'Khi Pause đồng hồ phải đóng băng hoàn toàn');
  // x4 scale
  tsDay.setPaused(false);
  tsDay.setSpeed(4);
  tsDay.tick(37.5 / 4);
  assert.ok(Math.abs(tsDay.clockHour - 10.0) < 1e-4, 'Ở tốc độ x4, 9.375s thực phải trôi 1 giờ game');

  // Verify main.js wires simDt with speedMultiplier & pause state
  const mainSrc = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(mainSrc.includes('speedMultiplier') && mainSrc.includes('dt * speedMult'), 'main.js phải nhân simDt với speedMultiplier khi không pause');
});

test('MEDICAL-CENTER: Trưởng bộ phận Y tế (npc_med) duy nhất ở (168, -38), đủ 3D props, không đụng door_medical HQ', () => {
  const initialNpcs = createInitialNpcProfiles();
  const medCount = initialNpcs.filter((n) => n.id === 'npc_med').length;
  assert.equal(medCount, 1, 'Không được trùng lặp Trưởng bộ phận Y tế (npc_med) trong DepartmentData');
  const medNpc = npcSystem.getById('npc_med');
  assert.ok(medNpc, 'Phải có npc_med trong NpcSystem');
  assert.ok(medNpc.home.x >= 165 && medNpc.home.x <= 180 && medNpc.home.z >= -42 && medNpc.home.z <= -30,
    `npc_med home phải nằm trong Trung tâm Y tế (168,-38), nhận (${medNpc.home.x}, ${medNpc.home.z})`);
  assert.ok(npcSystem.getById('npc_med_doc'), 'Phải có bác sĩ hỗ trợ npc_med_doc tại Trung tâm Y tế');
  assert.ok(npcSystem.getById('npc_med_physio'), 'Phải có chuyên viên VLTL npc_med_physio tại Trung tâm Y tế');

  // HQ door_medical still exists cleanly
  assert.ok(campus.doors.some((d) => d.id === 'door_medical'), 'Phải giữ nguyên door_medical tại HQ để tương thích công trình hiện có');

  // Medical 3D interactables & ActivityPoints
  const tcInteractIds = new Set([...campus.interactables.values()].map((it) => it.id));
  ['tc_med_doctor_desk', 'tc_med_reports', 'tc_med_records_0', 'tc_med_monitor', 'tc_med_schedule_board'].forEach((id) => {
    assert.ok(tcInteractIds.has(id), `Thiếu vật thể 3D Y tế: ${id}`);
  });
  ['med_head_desk', 'med_report_station', 'med_monitor_wall', 'med_rehab_desk', 'med_doctor_station_1', 'med_doctor_station_2'].forEach((id) => {
    assert.ok(activitySystem.getPoint(id), `Thiếu ActivityPoint chuyên môn Y tế: ${id}`);
  });

  // Check docDesk & docChair colliders / chairs
  assert.ok(campus.hasChairAt(174.5, -35.5, 0.78), 'Ghế Trưởng bộ phận Y tế phải được đăng ký tại (174.5, -35.5)');
  assert.ok(trainingComplex, 'TrainingComplexScene phải được khởi tạo');
});

test('GLOBAL-NAV-COLLISION: Lookahead vật cản, cửa khóa, RVO tránh NPC ngược chiều, substep x4 & tách giãn không xuyên tường', () => {
  const medNpc = npcSystem.getById('npc_med');
  const docNpc = npcSystem.getById('npc_med_doc');
  const techNpc = npcSystem.getById('npc_fac_tech');
  assert.ok(medNpc && docNpc && techNpc);

  // Check standardized fields
  assert.equal(medNpc.collisionRadius, 0.34, 'NPC phải có collisionRadius chuẩn 0.34');
  assert.ok('avoidanceState' in medNpc && 'lastBlockedAt' in medNpc, 'NPC phải có avoidanceState & lastBlockedAt');

  // 1. Obstacle Lookahead against desk collider at (174.5, -33.2)
  medNpc.mesh.position.set(174.5, 0.14, -34.5);
  medNpc.target.set(174.5, 0.14, -32.2); // straight into docDesk at z = -33.2
  npcSystem.pathfinder.rebuildNpcSpatialGrid(npcSystem.npcs);
  const avObs = npcSystem.pathfinder.computeAvoidanceVelocity(medNpc, 0, 1, medNpc.speed, npcSystem.npcs, null, { useSpatialGrid: true });
  assert.ok(['BRAKING', 'SIDESTEPPING', 'WAITING'].includes(avObs.avoidanceReason),
    `Lookahead phải nhận diện vật cản trước mặt (got ${avObs.avoidanceReason})`);

  // 2. Closed door avoidance inside castObstacleLookahead & computeAvoidanceVelocity
  const medDoor = campus.doors.find((d) => d.id === 'door_tc_medical');
  if (medDoor) {
    const prevLocked = medDoor.locked;
    const prevOpen = medDoor.open;
    medDoor.locked = true;
    medDoor.open = false;
    if (medDoor.collider) medDoor.collider.active = true;
    techNpc.mesh.position.set(medDoor.x, 0.14, medDoor.z + 0.65);
    const doorAhead = npcSystem.pathfinder.castObstacleLookahead(medDoor.x, medDoor.z + 0.65, 0, -1, 1.05, 0.33, true);
    assert.equal(doorAhead.blocked, true, 'Lookahead phải phát hiện cửa đang khóa');
    const avDoor = npcSystem.pathfinder.computeAvoidanceVelocity(techNpc, 0, -1, techNpc.speed, npcSystem.npcs, null, { useSpatialGrid: true, respectClosedDoors: true });
    assert.ok(avDoor.waiting || avDoor.avoidanceReason === 'SIDESTEPPING' || avDoor.avoidanceReason === 'BRAKING',
      `Cửa khóa phải buộc NPC phanh/né/chờ trước cửa (got ${avDoor.avoidanceReason})`);
    assert.ok(avDoor.waiting || avDoor.vz > -techNpc.speed * 0.5,
      'Cửa khóa không được cho NPC lao thẳng tốc độ tối đa xuyên qua cánh cửa');
    medDoor.locked = prevLocked;
    medDoor.open = prevOpen;
    if (medDoor.collider) medDoor.collider.active = !prevOpen;
  }

  // 3. Head-on NPC-NPC avoidance
  docNpc.mesh.position.set(168.0, 0.14, -22.0);
  docNpc._velX = 0; docNpc._velZ = -2.1;
  techNpc.mesh.position.set(168.0, 0.14, -23.6);
  techNpc._velX = 0; techNpc._velZ = 2.1;
  npcSystem.pathfinder.rebuildNpcSpatialGrid(npcSystem.npcs);
  const avHeadOn = npcSystem.pathfinder.computeAvoidanceVelocity(docNpc, 0, -1, 2.2, npcSystem.npcs, null, { useSpatialGrid: true });
  assert.ok(avHeadOn.avoidanceReason === 'SIDESTEPPING' || avHeadOn.avoidanceReason === 'YIELDING' || avHeadOn.waiting,
    `Hai NPC đi đối đầu nhau phải né hoặc nhường đường (got ${avHeadOn.avoidanceReason})`);

  // 4. High-speed substepping (simDt = 0.2s equivalent to x4 at 50ms frame) never lets NPC jump inside a wall
  medNpc.mesh.position.set(174.5, 0.14, -35.5);
  medNpc.mode = 'stand_duty';
  medNpc.timer = 999; // keep manual target active during substep test
  medNpc.finalDest = { x: 174.5, z: -31.8 };
  medNpc.target.set(174.5, 0.14, -31.8);
  for (let k = 0; k < 20; k++) {
    npcSystem.update(0.2, new THREE.Vector3(174.5, 0.14, -35.5), 10.5, null, 'Luis Enrique');
  }
  assert.ok(!npcSystem.pathfinder.isPointBlocked(medNpc.mesh.position.x, medNpc.mesh.position.z, 0.30, true),
    'Khi chạy mô phỏng tốc độ cao (dt=0.2s / x4), NPC tuyệt đối không được xuyên vào collider bàn/tường');
});

test('STAFF-SCHEDULES-AND-LOD3: Nhân sự hoạt động theo chức vụ 24h & LOD 3 đồng bộ lịch sinh hoạt + thể lực', () => {
  const secNpc = npcSystem.getById('npc_sec');
  const medNpc = npcSystem.getById('npc_med');
  assert.ok(secNpc && medNpc);

  // Force staff timers ready and tick at 10:30
  secNpc.timer = 0; secNpc._staffSlotKey = null;
  medNpc.timer = 0; medNpc._staffSlotKey = null;
  npcSystem.update(0.2, new THREE.Vector3(-25, 0.14, -15), 10.5, null, 'Luis Enrique');
  assert.ok(secNpc.task && secNpc.task.length > 5, 'npc_sec phải có nhiệm vụ tuần tra an ninh rõ ràng');
  assert.ok(medNpc.task && medNpc.task.length > 5, 'npc_med phải có lịch trực chuyên môn tại Trung tâm Y tế');

  // Check LOD 3 parity for distant player at dinner / night sleep (23:00 -> SLEEPING inside Residence room)
  const testPlayer = npcSystem.npcs.find((n) => n.isPlayer);
  assert.ok(testPlayer, 'Phải có cầu thủ trong NpcSystem');
  testPlayer.mesh.visible = false; // forces LOD 3
  testPlayer._lod = 3;
  testPlayer._decisionCooldown = 0;
  testPlayer._curActivityKey = null;
  // Far focus position so player is LOD 3
  const farFocus = new THREE.Vector3(-200, 0, -200);
  npcSystem.update(1.0, farFocus, 23.0, null, 'Luis Enrique');
  assert.equal(testPlayer._curActivityKey, 'night_sleep', 'Ở LOD 3 lúc 23:00 cầu thủ phải chuyển sang lịch ngủ đêm (night_sleep) thay vì logic cũ');
  assert.ok(testPlayer.state === 'SLEEPING' || testPlayer.mode === 'rest', 'Cầu thủ LOD 3 lúc 23:00 phải ở trạng thái ngủ/nghỉ tại phòng');

  // Verify Save/Load runtime fidelity
  medNpc.avoidanceState = 'SIDESTEPPING';
  medNpc.lastBlockedAt = 42.5;
  const snap = npcSystem.exportRuntimeState();
  const savedMed = snap.npcs.find((x) => x.id === 'npc_med');
  assert.equal(savedMed.avoidanceState, 'SIDESTEPPING', 'exportRuntimeState phải lưu avoidanceState');
  assert.equal(savedMed.lastBlockedAt, 42.5, 'exportRuntimeState phải lưu lastBlockedAt');
  medNpc.avoidanceState = 'NONE';
  medNpc.lastBlockedAt = 0;
  npcSystem.importRuntimeState(snap, 10.5);
  assert.equal(medNpc.avoidanceState, 'SIDESTEPPING', 'importRuntimeState phải khôi phục avoidanceState');
  assert.equal(medNpc.lastBlockedAt, 42.5, 'importRuntimeState phải khôi phục lastBlockedAt');
});

test('HUD-TEAM-STATUS-BOX: Ô chữ nhật bé góc trên phải đồng bộ 24h & Matchday theo thời gian thực', () => {
  const sMorning = trainingSystem.getSquadScheduleStatus(9.5, null);
  assert.equal(sMorning.badge, 'TẬP SÁNG');
  const sLunch = trainingSystem.getSquadScheduleStatus(13.2, null);
  assert.equal(sLunch.badge, 'ĂN TRƯA');
  const sSleep = trainingSystem.getSquadScheduleStatus(23.5, null);
  assert.equal(sSleep.badge, 'NGỦ ĐÊM');
  const sMatch = trainingSystem.getSquadScheduleStatus(10.0, { isActive: true });
  assert.equal(sMatch.badge, 'MATCHDAY');

  // Wire UIManager updateTopHUD
  const ui = new UIManager(
    state,
    { playClick() {}, playWhistle() {} },
    { loadSettings: () => ({}) },
    { startMatch() {}, interact() {}, setQuality() {}, toggleSprint() {}, refreshMuseumAndTv() {} }
  );
  state.clockHour = 13.25;
  ui.updateTopHUD(60, null, null);
  assert.ok(elementsById.get('hud-team-status-badge').textContent.includes('ĂN TRƯA'),
    'HUD team status badge phải tự động hiển thị ĂN TRƯA lúc 13:15');
  assert.equal(elementsById.get('hud-team-status-window').textContent, '13:00–13:45',
    'HUD team status window phải hiển thị đúng khung giờ 13:00–13:45');
});
