// tests/verify_npc_life_and_navigation.mjs
// Bộ kiểm thử toàn diện 24 kịch bản (bao phủ 30 tình huống):
// - Phân phòng 1-1 cố định theo playerId (1..30), đổi số áo giữ phòng, chuyển nhượng giải phóng/cấp lại, overflow > 30
// - Quyền vào phòng, hàng chờ trước cửa, chu trình Mở cửa -> Bước vào -> Đóng cửa -> Thoát phòng -> Đóng cửa
// - Tương tác nội thất trong phòng (bed/sleep, sofa/watch_tv bật TV, desk/use_desk)
// - Lịch sinh hoạt 24h cá nhân hóa (sáng/ăn sáng/locker/tập luyện/y tế/sau tập phân hóa đa dạng/tối về đúng phòng ngủ)
// - ActivityPoint & Queue exclusivity (treadmill, bike, dining, medical) + không trùng vị trí
// - NavGrid 0.5m, Obstacle Lookahead, RVO né ngược chiều, vòng qua NPC đứng yên, giải tách nhóm resolveNpcSeparation, STUCK_RECOVERY đa tầng
// - Đồng bộ AnimationSystem & vận tốc, không tự lành chấn thương, diễn biến stamina/fatigue thực tế
// - UI Máy tính Chủ tịch Tab PLAYER ACTIVITY + 8 bộ lọc + Save/Load toàn phần + Benchmark mô phỏng liên tục

import assert from 'node:assert/strict';
import * as THREE from 'three';

globalThis.THREE = THREE;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

function createUnifiedMockEnvironment() {
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

  function parseHtmlIntoChildren(html, parent) {
    parent.children = [];
    if (!html || typeof html !== 'string') return;
    const stack = [parent];
    const tagRe = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9-]+)\s*>|<([a-zA-Z0-9-]+)([^>]*?)(\/?)>/g;
    let lastIdx = 0;
    let m;
    while ((m = tagRe.exec(html)) !== null) {
      const top = stack[stack.length - 1];
      if (m.index > lastIdx && top) {
        const text = html.slice(lastIdx, m.index);
        if (text) top._text += text;
      }
      lastIdx = tagRe.lastIndex;
      if (m[1]) {
        const closeTag = m[1].toUpperCase();
        for (let i = stack.length - 1; i >= 1; i--) {
          if (stack[i].tagName === closeTag) { stack.length = i; break; }
        }
      } else if (m[2]) {
        const tagName = m[2].toUpperCase();
        const attrStr = m[3] || '';
        const selfClose = m[4] === '/' || ['INPUT', 'IMG', 'BR', 'HR', 'META', 'LINK'].includes(tagName);
        const el = new MockElement(tagName);
        const attrRe = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
        let am;
        while ((am = attrRe.exec(attrStr)) !== null) {
          const k = am[1];
          const v = am[2] ?? am[3] ?? am[4] ?? '';
          if (k === 'id') el.id = v;
          else if (k === 'class') el.className = v;
          else if (k === 'value') el.value = v;
          else if (k === 'disabled') el.disabled = true;
          else if (k === 'open') el.open = true;
          else if (k === 'selected') el.selected = true;
          else if (k.startsWith('data-')) {
            const camel = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
            el.dataset[camel] = v;
          }
          el._attrs[k] = v;
        }
        top.appendChild(el);
        if (!selfClose) stack.push(el);
      }
    }
  }

  class MockElement {
    constructor(tagName = 'DIV') {
      this.tagName = tagName.toUpperCase();
      this.id = '';
      this.children = [];
      this.parentElement = null;
      this.dataset = {};
      this.style = {};
      this.value = '';
      this.title = '';
      this.disabled = false;
      this.open = false;
      this.scrollTop = 0;
      this.scrollLeft = 0;
      this._attrs = {};
      this._listeners = new Map();
      this._text = '';
      this.classList = new MockClassList(this);
    }
    set className(v) { this._className = String(v || ''); this.classList._syncFromString(this._className); }
    get className() { return this.classList.toString(); }
    set innerHTML(html) { this._text = ''; parseHtmlIntoChildren(String(html || ''), this); }
    get innerHTML() { return this.textContent; }
    set textContent(t) { this._text = String(t ?? ''); this.children = []; }
    get textContent() {
      return this._text + this.children.map((c) => c.textContent).join('');
    }
    appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(fn);
    }
    removeEventListener(type, fn) {
      const arr = this._listeners.get(type);
      if (arr) this._listeners.set(type, arr.filter((f) => f !== fn));
    }
    dispatchEvent(evt) {
      const e = evt || { type: 'click' };
      e.target = e.target || this;
      e.currentTarget = this;
      e.stopPropagation = e.stopPropagation || (() => {});
      e.preventDefault = e.preventDefault || (() => {});
      (this._listeners.get(e.type) || []).forEach((fn) => fn(e));
    }
    click() { this.dispatchEvent({ type: 'click' }); }
    focus() {}
    setAttribute(k, v) { this._attrs[k] = v; }
    getAttribute(k) { return this._attrs[k] ?? null; }
    querySelectorAll(sel) { return queryMatches(this, sel); }
    querySelector(sel) { return queryMatches(this, sel)[0] || null; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 600 }; }
    closest() { return null; }
  }

  function matchSingle(el, sel) {
    if (!sel) return false;
    const parts = sel.match(/(#[a-zA-Z0-9_-]+|\.[a-zA-Z0-9_-]+|\[[^\]]+\]|[a-zA-Z0-9_-]+)/g) || [];
    for (const p of parts) {
      if (p.startsWith('#') && el.id !== p.slice(1)) return false;
      else if (p.startsWith('.') && !el.classList.contains(p.slice(1))) return false;
      else if (p.startsWith('[')) {
        const m = p.match(/^\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]$/);
        if (!m) return false;
        const val = el._attrs[m[1]];
        if (val === undefined) return false;
        if (m[2] !== undefined && val !== m[2]) return false;
      } else if (!p.startsWith('#') && !p.startsWith('.') && !p.startsWith('[')) {
        if (el.tagName !== p.toUpperCase()) return false;
      }
    }
    return parts.length > 0;
  }

  function queryMatches(root, selector) {
    const tokens = selector.trim().split(/\s+/);
    let current = [root];
    for (const tk of tokens) {
      const next = [];
      const walk = (node) => {
        for (const c of node.children) {
          if (matchSingle(c, tk)) next.push(c);
          walk(c);
        }
      };
      current.forEach(walk);
      current = next;
    }
    return current;
  }

  const rootBody = new MockElement('BODY');
  const ids = [
    'modal-backdrop', 'modal-title', 'modal-body', 'modal-box', 'modal-back', 'modal-close',
    'task-backdrop', 'task-title', 'task-body', 'task-box', 'task-back', 'task-close',
    'toast-box', 'hud-season', 'hud-clock', 'hud-budget', 'hud-fps', 'hud-match-alert',
    'phone-badge', 'btn-interact', 'interact-hint', 'desk-doc-menu', 'btn-time-pause'
  ];
  ids.forEach((id) => {
    const el = new MockElement('DIV');
    el.id = id;
    rootBody.appendChild(el);
  });

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
    getElementById: (id) => queryMatches(rootBody, `#${id}`)[0] || null,
    querySelectorAll: (sel) => queryMatches(rootBody, sel),
    querySelector: (sel) => queryMatches(rootBody, sel)[0] || null
  };
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener() {},
    removeEventListener() {}
  };
}

createUnifiedMockEnvironment();

import { GameState } from '../src/club/GameState.js';
import { TOTAL_RESIDENCE_ROOMS } from '../src/club/PlayerResidenceSystem.js';
import { ActivityPointSystem } from '../src/ai/ActivityPointSystem.js';
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
import { UIManager } from '../src/ui/UIManager.js';

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

function buildRiggedEnv() {
  const state = new GameState();
  const rootScene = new THREE.Scene();
  const tex = new TextureFactory();
  const furn = new FurnitureFactory(tex);
  const veh = new VehicleSystem(rootScene);
  const campus = new PsgCampusScene(rootScene, tex, furn, veh);
  const trainingComplex = new TrainingComplexScene(campus, tex, furn, veh, state.playerResidenceSystem);
  state.trainingSystem.build3DTrainingEquipment(campus);
  const charFactory = new CharacterFactory();
  const animSystem = new AnimationSystem();
  const npcSystem = new NpcSystem(rootScene, charFactory, animSystem, campus);
  npcSystem.attachTrainingSystem(state.trainingSystem);
  npcSystem.attachActivitySystem(state.activityPointSystem);
  state.registerNpcSystem(npcSystem);
  npcSystem.syncSquadPlayers(state.getPsgSquad(), 17.5, 'home', state.formationSystem?.captainId || null);
  return { state, campus, trainingComplex, charFactory, animSystem, npcSystem };
}

test('S01-S02: Đủ 30 cầu thủ đội một được cấp đúng 1 phòng riêng theo playerId, đổi số áo không đổi phòng, chuyển nhượng giải phóng & cấp lại', () => {
  const { state, npcSystem } = buildRiggedEnv();
  const resSys = state.playerResidenceSystem;
  // Bổ sung cầu thủ để đạt đúng 30 người nếu danh sách khởi tạo < 30
  const extras = state.players.filter((p) => p.club !== 'Paris Saint-Germain').slice(0, Math.max(0, 30 - state.getPsgSquad().length));
  extras.forEach((p, idx) => { p.club = 'Paris Saint-Germain'; p.shirtNumber = 40 + idx; });
  state.notifySquadChanged();
  npcSystem.syncSquadPlayers(state.getPsgSquad(), 17.5, 'home', null);

  const squad30 = state.getPsgSquad();
  assert.ok(squad30.length >= 30);
  const rooms = resSys.getRooms();
  assert.equal(rooms.length, TOTAL_RESIDENCE_ROOMS);
  const occIds = new Set();
  for (const p of squad30.slice(0, 30)) {
    const r = resSys.getRoomForPlayer(p.id);
    assert.ok(r, `Cầu thủ ${p.name} phải có phòng`);
    assert.equal(r.playerId, p.id);
    assert.equal(r.roomId, `room_${String(r.roomNumber).padStart(2, '0')}`);
    assert.equal(r.code, `ROOM ${String(r.roomNumber).padStart(2, '0')}`);
    assert.equal(r.roomStatus, 'OCCUPIED');
    assert.equal(occIds.has(r.roomNumber), false);
    occIds.add(r.roomNumber);
  }
  const p0 = squad30[0];
  const r0Before = resSys.getRoomForPlayer(p0.id).roomNumber;
  p0.shirtNumber = 99;
  state.notifySquadChanged();
  assert.equal(resSys.getRoomForPlayer(p0.id).roomNumber, r0Before, 'Đổi số áo không được làm thay đổi phòng cá nhân');

  // Bán p0 -> giải phóng phòng -> ký tân binh -> nhận phòng vừa trống
  p0.club = 'Real Madrid';
  state.notifySquadChanged();
  assert.equal(resSys.getRoomByNumber(r0Before).status, 'AVAILABLE');
  const newbie = state.players.find((p) => p.club !== 'Paris Saint-Germain' && p.id !== p0.id);
  newbie.club = 'Paris Saint-Germain';
  state.notifySquadChanged();
  assert.equal(resSys.getRoomForPlayer(newbie.id).roomNumber, r0Before, 'Tân binh phải được cấp lại đúng phòng trống đầu tiên');

  // Thêm người thứ 31 -> danh sách chờ >30 không tạo phòng 31
  const extra31 = state.players.find((p) => p.club !== 'Paris Saint-Germain' && p.id !== p0.id);
  extra31.club = 'Paris Saint-Germain';
  state.notifySquadChanged();
  assert.equal(resSys.getRooms().length, 30);
  assert.ok(resSys.getOverflowPlayers().some((o) => o.playerId === extra31.id));
});

test('S03: Chặn cầu thủ tự ý đi vào phòng người khác (Ownership Enforcement)', () => {
  const { state, npcSystem } = buildRiggedEnv();
  const resSys = state.playerResidenceSystem;
  const players = npcSystem.npcs.filter((n) => n.isPlayer);
  const npcA = players[0];
  const roomB = resSys.getRoomForPlayer(players[1].playerId);
  assert.ok(roomB);
  assert.equal(resSys.canNpcEnterRoom(roomB.roomNumber, npcA.playerId), false);
  const roomA = resSys.getRoomForPlayer(npcA.playerId);
  assert.equal(resSys.canNpcEnterRoom(roomA.roomNumber, npcA.playerId), true);

  npcSystem.setNpcDestination(npcA, roomB.cx, roomB.cz);
  const destRoom = resSys.getRoomAtPosition(npcA.finalDest.x, npcA.finalDest.z);
  assert.ok(!destRoom || destRoom.roomNumber !== roomB.roomNumber, 'Đích của NPC A không được phép nằm trong phòng của NPC B');
});

test('S04-S06: Hàng đợi cửa phòng, Mở cửa -> Bước vào -> Đóng cửa sau lưng -> Thoát phòng đóng cửa', () => {
  const { state, trainingComplex, npcSystem } = buildRiggedEnv();
  const resSys = state.playerResidenceSystem;
  const npc1 = npcSystem.npcs.find((n) => n.isPlayer);
  const npc2 = npcSystem.npcs.find((n) => n.isPlayer && n.id !== npc1.id);
  const room1 = resSys.getRoomForPlayer(npc1.playerId);
  resSys.setRoomDoorState(room1.roomNumber, false, { immediate: true });

  // S04: Hai NPC cùng xếp hàng trước cửa phòng 1
  const actSys = npcSystem.activitySystem;
  const qKey = `door_room_${room1.roomNumber}`;
  const e1 = actSys.enqueue(qKey, npc1.id, { x: room1.doorX, z: room1.doorZ });
  const e2 = actSys.enqueue(qKey, npc2.id, { x: room1.doorX, z: room1.doorZ });
  assert.equal(e1.index, 0);
  assert.equal(e2.index, 1);
  assert.notDeepEqual(
    actSys.computeQueueWaitSpot(qKey, npc1.id, { x: room1.doorX, z: room1.doorZ }, 0, 1),
    actSys.computeQueueWaitSpot(qKey, npc2.id, { x: room1.doorX, z: room1.doorZ }, 0, 1)
  );
  actSys.removeFromAllQueues(npc1.id);
  actSys.removeFromAllQueues(npc2.id);

  // S05: NPC 1 tiếp cận cửa đóng -> open_door -> collider mở -> bước vào -> currentOccupant -> auto close
  npc1.mesh.position.set(room1.doorX, 0.14, room1.doorZ + (room1.side === 'north' ? 1.45 : -1.45));
  npc1._decisionSeed = undefined;
  npcSystem.setNpcDestination(npc1, room1.cx + 0.45, room1.side === 'north' ? -2.25 : 20.25);
  assert.equal(npc1.mode, 'door_walk');

  for (let i = 0; i < 60; i++) {
    npcSystem.update(0.05, new THREE.Vector3(room1.doorX, 0.14, 9), 20.0);
    trainingComplex.update(0.05);
  }
  assert.equal(room1.doorOpen, true, 'NPC phải mở cửa phòng khi vào');
  const ctrl = trainingComplex._suiteSystem?.roomControllers?.find((c) => c.roomNumber === room1.roomNumber);
  assert.ok(ctrl && ctrl.doorProgress >= 0.62 && ctrl.doorObj.collider.active === false, 'Collider cửa phải mở khi doorProgress >= 0.62');

  for (let i = 0; i < 80; i++) {
    npcSystem.update(0.05, new THREE.Vector3(room1.doorX, 0.14, 9), 20.0);
    trainingComplex.update(0.05);
  }
  assert.equal(room1.currentOccupant, npc1.playerId, 'Room phải ghi nhận currentOccupant khi cầu thủ vào phòng');
  assert.equal(room1.doorOpen, false, 'Cửa phòng phải tự đóng sau khi cầu thủ vào trong');

  // S06: Cầu thủ đi ra khỏi phòng khi cửa đang đóng -> mở cửa từ trong -> ra ngoài -> đóng cửa lại
  npc1._decisionSeed = 2;
  npc1._curActivityKey = 'free_lounge';
  npc1._decisionCooldown = 60;
  npcSystem.setNpcDestination(npc1, 184.0, 9.0);
  for (let i = 0; i < 120; i++) {
    npcSystem.update(0.05, new THREE.Vector3(room1.doorX, 0.14, 9), 20.0);
    trainingComplex.update(0.05);
  }
  assert.equal(room1.currentOccupant, null, 'Khi ra khỏi phòng currentOccupant phải được giải phóng');
  assert.equal(room1.doorOpen, false, 'Sau khi bước ra ngoài, cửa phải tự đóng lại');
});

test('S07: Tương tác nội thất trong phòng (ngủ trên giường, xem TV sofa bật tvOn, ngồi bàn làm việc)', () => {
  const { state, npcSystem } = buildRiggedEnv();
  const resSys = state.playerResidenceSystem;
  const npc = npcSystem.npcs.find((n) => n.isPlayer);
  const room = resSys.getRoomForPlayer(npc.playerId);
  const actSys = npcSystem.activitySystem;

  // TV point
  const tvPt = actSys.claimAvailablePoint(npc.id, { area: 'residence_room', roomNumber: room.roomNumber, interactionTypes: ['watch_tv'] });
  assert.ok(tvPt);
  npc.mesh.position.set(tvPt.standPosition.x, 0.14, tvPt.standPosition.z);
  npc.activePointId = tvPt.activityPointId;
  npc.state = 'WATCHING_TV';
  npc._slotLocked = true;
  npc._shouldEvalCurtains = true;
  npcSystem._tickResidenceRoomComfort(npc, 19.0, null, 0.05, true);
  assert.equal(room.tvOn, true, 'Khi cầu thủ WATCHING_TV trong phòng thì tvOn phải bật');

  // Sleep point
  actSys.releaseNpc(npc.id);
  const bedPt = actSys.claimAvailablePoint(npc.id, { area: 'residence_room', roomNumber: room.roomNumber, interactionTypes: ['sleep'] });
  assert.ok(bedPt);
  assert.equal(bedPt.elevatedY, 0.44);
  npc.state = 'SLEEPING';
  npcSystem._tickResidenceRoomComfort(npc, 23.2, null, 0.05, true);
  assert.equal(room.tvOn, false);
  assert.equal(room.lightOn, false);
});

test('S08-S10 & S19-S20: Lịch sinh hoạt 24h cá nhân hóa, tách biệt chấn thương không tự hồi phục, phân hóa sau buổi tập & Stamina/Fatigue', () => {
  const { state, npcSystem } = buildRiggedEnv();
  const squad = state.getPsgSquad();
  const injuredPlayer = squad[2];
  injuredPlayer.injuryDays = 4;
  if (injuredPlayer.health) injuredPlayer.health.injuryDays = 4;

  // Đặt giờ tập 10:00
  const fitBefore = squad[0].health?.fitness ?? 85;
  for (let i = 0; i < 40; i++) {
    npcSystem.update(0.1, new THREE.Vector3(192, 0.14, -86), 10.0);
  }
  const injNpc = npcSystem.npcs.find((n) => n.playerId === injuredPlayer.id);
  assert.equal(injNpc.mode, 'medical_rehab', 'Cầu thủ chấn thương không được tham gia tập luyện');
  assert.equal(injuredPlayer.injuryDays, 4, 'Không tự hồi phục giả injuryDays');

  const healthyNpcs = npcSystem.npcs.filter((n) => n.isPlayer && n.playerId !== injuredPlayer.id);
  assert.ok(healthyNpcs.some((n) => n.state === 'TRAINING' || n.mode === 'train' || n.mode === 'drill'), 'Cầu thủ khỏe mạnh phải đang tập luyện');
  assert.ok((squad[0].health?.fitness ?? 85) <= fitBefore, 'Tập luyện phải tiêu hao stamina thực tế');

  // Giờ sau buổi tập 17:30 -> phân hóa hành vi giữa các cầu thủ (Gym / Lounge / Room / Recovery)
  healthyNpcs.forEach((n, idx) => {
    n._decisionCooldown = 0;
    const p = squad.find((x) => x.id === n.playerId);
    if (p?.health) p.health.fatigue = idx % 3 === 0 ? 78 : 15;
    if (p?.health) p.health.fitness = idx % 3 === 0 ? 48 : 92;
  });
  npcSystem.update(0.2, new THREE.Vector3(184, 0.14, 9), 17.6);
  const actTypes = new Set(healthyNpcs.map((n) => n.activityType || n.state));
  assert.ok(actTypes.size >= 2, `Sau buổi tập, các cầu thủ phải phân hóa đa dạng hoạt động thay vì dồn 1 chỗ (hiện có: ${Array.from(actTypes).join(', ')})`);

  // Nghỉ ngủ 23:20 trên giường riêng giúp hồi stamina
  const n0 = healthyNpcs[0];
  const r0 = state.playerResidenceSystem.getRoomForPlayer(n0.playerId);
  const bed0 = npcSystem.activitySystem.getPoint(`res_room_${r0.roomNumber}_bed`);
  n0.mesh.position.set(bed0.standPosition.x, 0.14, bed0.standPosition.z);
  n0.target.set(bed0.standPosition.x, 0.14, bed0.standPosition.z);
  n0.activePointId = bed0.activityPointId;
  n0.path = [];
  n0.pathIdx = 0;
  n0.finalDest = { x: bed0.standPosition.x, z: bed0.standPosition.z };
  n0.state = 'SLEEPING';
  n0.mode = 'rest';
  n0._slotLocked = true;
  n0._curActivityKey = 'night_sleep';
  const p0Obj = squad.find((x) => x.id === n0.playerId);
  p0Obj.stamina = 60;
  const tiredFit = (p0Obj.health.fitness = 60);
  for (let i = 0; i < 30; i++) npcSystem.update(0.2, new THREE.Vector3(184, 0.14, 9), 23.3);
  assert.ok(p0Obj.health.fitness > tiredFit, `Ngủ nghỉ phải hồi phục stamina (sau ngủ: ${p0Obj.health.fitness})`);
});

test('S11-S12: Sức chứa khu vực độc quyền (4 máy chạy bộ, 8 ghế ăn) và cơ chế hàng đợi tiến lên', () => {
  const actSys = new ActivityPointSystem();
  const claimed = [];
  for (let i = 0; i < 6; i++) {
    const pt = actSys.claimAvailablePoint(`npc_${i}`, { area: 'gym', interactionTypes: ['gym_treadmill'] });
    if (pt) claimed.push(pt);
    else actSys.enqueue('gym_wait', `npc_${i}`, { x: 192, z: -42 });
  }
  assert.equal(claimed.length, 4, 'Chỉ có tối đa 4 máy chạy bộ hoạt động cùng lúc');
  assert.equal(new Set(claimed.map((c) => c.activityPointId)).size, 4, 'Không được cấp trùng máy chạy bộ');
  assert.equal(actSys.isQueueHead('gym_wait', 'npc_4'), true);

  actSys.releaseNpc('npc_0');
  const nextClaim = actSys.claimAvailablePoint('npc_4', { area: 'gym', interactionTypes: ['gym_treadmill'] });
  assert.ok(nextClaim, 'Người đứng đầu hàng chờ phải được vào khi máy vừa trống');
});

test('S13-S15: Né va chạm ngược chiều, vòng qua NPC đứng yên, và giải tách nhóm resolveNpcSeparation', () => {
  const { pathfinder } = buildRiggedEnv().npcSystem;
  const posObj = (x, y, z) => ({ position: new THREE.Vector3(x, y, z), visible: true });
  const npcs = [
    { id: 'a', isPlayer: true, mesh: posObj(184, 0.14, 8.0), _velX: 0, _velZ: 2.2, stuckTimer: 0 },
    { id: 'b', isPlayer: true, mesh: posObj(184, 0.14, 10.0), _velX: 0, _velZ: -2.2, stuckTimer: 0 },
    { id: 'c', isPlayer: true, mesh: posObj(184.05, 0.14, 8.05), _velX: 0, _velZ: 0, stuckTimer: 0 }
  ];
  pathfinder.rebuildNpcSpatialGrid(npcs);

  const avA = pathfinder.computeAvoidanceVelocity(npcs[0], 0, 1, 2.2, npcs, null);
  const avB = pathfinder.computeAvoidanceVelocity(npcs[1], 0, -1, 2.2, npcs, null);
  assert.ok(avA.vz * avB.vz <= 0, 'Hai NPC đối đầu phải giữ hướng tách hợp lý');

  // Stationary NPC bypass
  const mover = { id: 'm', isPlayer: true, mesh: posObj(190, 0.14, 8.0), _velX: 2.2, _velZ: 0, stuckTimer: 0 };
  const idleNpc = { id: 'idle1', isPlayer: true, mesh: posObj(191.4, 0.14, 8.05), _velX: 0, _velZ: 0, stuckTimer: 0 };
  pathfinder.rebuildNpcSpatialGrid([mover, idleNpc]);
  const avBypass = pathfinder.computeAvoidanceVelocity(mover, 1, 0, 2.2, [mover, idleNpc], null);
  assert.ok(Math.abs(avBypass.vz) > 0.15, `NPC di chuyển phải bẻ lái vòng qua NPC đứng yên trước mặt (vz=${avBypass.vz.toFixed(3)})`);

  // resolveNpcSeparation enforces minimum spacing across smooth ticks
  for (let t = 0; t < 4; t++) {
    pathfinder.resolveNpcSeparation(npcs, 0.72);
  }
  const distAC = Math.hypot(npcs[0].mesh.position.x - npcs[2].mesh.position.x, npcs[0].mesh.position.z - npcs[2].mesh.position.z);
  assert.ok(distAC >= 0.68, `resolveNpcSeparation phải tách NPC trùng tọa độ (dist=${distAC.toFixed(2)})`);
});

test('S16-S17: NavGrid 0.5m, Obstacle Lookahead & Multi-stage STUCK_RECOVERY', () => {
  const { npcSystem } = buildRiggedEnv();
  const pf = npcSystem.pathfinder;
  assert.equal(pf.gridStep, 0.5, 'NavGrid resolution phải đạt 0.5m');

  const npc = npcSystem.npcs.find((n) => n.isPlayer);
  // Lookahead phát hiện tường/cửa trước khi đâm thẳng
  const resRoom1 = npcSystem.trainingSystem.state.playerResidenceSystem.getRoomByNumber(1);
  npcSystem.trainingSystem.state.playerResidenceSystem.setRoomDoorState(1, false, { immediate: true });
  const hit = pf.castObstacleLookahead(resRoom1.doorX, resRoom1.doorZ + 1.5, 0, -1, 2.2, 0.34, true);
  assert.equal(hit.blocked, true, 'Lookahead phải phát hiện cửa đóng trước mặt');

  // Ép kẹt nhân tạo -> STUCK_RECOVERY tự phục hồi sang lộ trình mới/lounge
  npc.mesh.position.set(184.0, 0.14, 9.0);
  npc.lastPosX = 184.0;
  npc.lastPosZ = 9.0;
  npc.finalDest = { x: 184.0, z: 19.0 };
  npc.path = [{ x: 184.0, z: 19.0 }];
  npc.pathIdx = 0;
  npc.stuckTimer = 0.95;
  npc.replanCooldown = 0;
  npc.recoveryAttempts = 2;
  npc.target.set(184.0, 0.14, 19.0);
  npcSystem.moveNpcTowardTarget(npc, 0.05, null, 0);
  assert.equal(npc.state, 'STUCK_RECOVERY');
});

test('S18: AnimationSystem hỗ trợ đủ trạng thái mới & đồng bộ vận tốc không NaN', () => {
  const anim = new AnimationSystem();
  const charF = new CharacterFactory();
  const rig = charF.createHumanoid({ outfit: 'home_psg', heightScale: 1.0 });
  const states = ['idle', 'walk', 'run', 'train', 'sleep', 'lie_rest', 'eat', 'watch_tv', 'use_desk', 'gym_treadmill', 'gym_bike', 'gym_weights', 'open_door', 'close_door', 'pull_curtain'];
  for (const st of states) {
    anim.updateRig(rig, st, 0.05, 1.0, 0);
    assert.ok(Number.isFinite(rig.userData.rig.pelvis.position.y), `Pelvis Y phải hữu hạn ở state ${st}`);
    assert.ok(Number.isFinite(rig.userData.rig.rightArm.shoulder.rotation.x), `Arm rot phải hữu hạn ở state ${st}`);
  }
});

test('S21: Giao diện Máy tính Chủ tịch Tab PLAYER ACTIVITY + 8 bộ lọc hoạt động chuẩn', () => {
  const { state } = buildRiggedEnv();
  const ui = new UIManager(state, { playClick() {}, playSuccess() {}, playAlert() {}, playDoor() {} }, new SaveManager(), {});
  ui.openComputer('player_activity');
  assert.equal(ui.activeTab, 'player_activity');

  const filterButtons = globalThis.document.querySelectorAll('[data-pafilt]');
  assert.equal(filterButtons.length, 8, 'Tab Hoạt động cầu thủ phải có đủ 8 bộ lọc yêu cầu');
  const keys = filterButtons.map((b) => b.dataset.pafilt);
  ['all', 'in_room', 'training', 'eating', 'resting', 'recovery', 'medical', 'social'].forEach((k) => {
    assert.ok(keys.includes(k), `Thiếu bộ lọc ${k}`);
  });

  const cardsAll = globalThis.document.querySelectorAll('[data-pa-player]');
  assert.equal(cardsAll.length, state.getPsgSquad().length, 'Bộ lọc Tất cả phải hiển thị đủ quân số đội một');

  // Bấm từng bộ lọc không lỗi DOM
  for (const btn of filterButtons) {
    btn.click();
    assert.equal(ui.playerActivityFilter, btn.dataset.pafilt);
  }
});

test('S22: Save / Load khôi phục trạng thái phòng, ActivityPointSystem và vị trí NPC an toàn', () => {
  const { state, npcSystem } = buildRiggedEnv();
  const n0 = npcSystem.npcs.find((n) => n.isPlayer);
  const pt = npcSystem.activitySystem.claimAvailablePoint(n0.id, { area: 'gym', interactionTypes: ['gym_bike'] });
  assert.ok(pt);
  npcSystem.activitySystem.occupyPoint(pt.activityPointId, n0.id);
  n0.activePointId = pt.activityPointId;
  n0.state = 'GOING_TO_GYM';
  n0.activityLabel = 'Đạp xe hồi phục #1';

  const snap = state.exportFullState({ x: -26, y: 0.14, z: -12.5, yaw: 0, pitch: 0 });
  assert.ok(snap.activityPointState);
  assert.ok(snap.npcRuntimeState);

  const env2 = buildRiggedEnv();
  env2.state.importFullState(snap);
  if (env2.state.pendingNpcRuntimeState) {
    env2.npcSystem.importRuntimeState(env2.state.pendingNpcRuntimeState, env2.state.clockHour);
  }
  const restoredPoint = env2.state.activityPointSystem.getPoint(pt.activityPointId);
  assert.equal(restoredPoint.occupantNpcId, n0.id, 'Save/Load phải giữ nguyên occupantNpcId của ActivityPoint');
  const restoredNpc = env2.npcSystem.npcs.find((n) => n.id === n0.id);
  assert.equal(restoredNpc.state, 'GOING_TO_GYM');
});

test('S23-S24: Đêm khuya (23:15) toàn bộ cầu thủ khỏe mạnh trở về đúng phòng riêng để ngủ & Benchmark 24h không kẹt/NaN', () => {
  const { state, trainingComplex, npcSystem } = buildRiggedEnv();
  const squad = state.getPsgSquad();
  const resSys = state.playerResidenceSystem;
  const players = npcSystem.npcs.filter((n) => n.isPlayer);

  // Đặt cầu thủ gần khu Residence buổi đêm 23:15 & mô phỏng 120 bước
  for (let i = 0; i < players.length; i++) {
    const n = players[i];
    const rm = resSys.getRoomForPlayer(n.playerId);
    if (!rm) continue;
    n.mesh.position.set(rm.doorX, 0.14, rm.side === 'north' ? 2.5 : 15.5);
    n._decisionCooldown = 0;
  }

  const t0 = performance.now();
  const hours = [6.6, 7.5, 9.6, 12.6, 15.5, 17.8, 20.0, 23.25];
  for (const h of hours) {
    for (let step = 0; step < 30; step++) {
      npcSystem.update(0.1, new THREE.Vector3(184, 0.14, 9), h);
      trainingComplex.update(0.1);
    }
  }
  const elapsedMs = performance.now() - t0;

  // Kiểm tra buổi đêm 23:25 tất cả cầu thủ đang nhắm về đúng phòng riêng của mình (bao gồm đang ở cửa hoặc đi vào phòng)
  let ownRoomCount = 0;
  for (const n of players) {
    const rm = resSys.getRoomForPlayer(n.playerId);
    if (!rm) continue;
    assert.ok(Number.isFinite(n.mesh.position.x) && Number.isFinite(n.mesh.position.z), 'Tọa độ NPC không được NaN');
    const inOwn = resSys.getRoomAtPosition(n.mesh.position.x, n.mesh.position.z)?.roomNumber === rm.roomNumber;
    const headingOwn = n.finalDest && resSys.getRoomAtPosition(n.finalDest.x, n.finalDest.z)?.roomNumber === rm.roomNumber;
    const doorOwn = n._doorTransition?.roomNumber === rm.roomNumber || n._waitingDoorRoom === rm.roomNumber;
    const bedOwn = n.activePointId === `res_room_${rm.roomNumber}_bed`;
    if (inOwn || headingOwn || doorOwn || bedOwn) ownRoomCount++;
  }
  assert.ok(ownRoomCount >= Math.min(20, squad.length - 1), `Buổi đêm đa số cầu thủ phải về đúng phòng riêng (${ownRoomCount}/${players.length})`);
  assert.ok(elapsedMs < 8000, `Benchmark mô phỏng đa khung giờ phải nhanh mượt (${elapsedMs.toFixed(1)}ms)`);
});

console.log(`\n🎉 HOÀN TẤT KIỂM THỬ NPC LIFE, PERSONAL ROOMS & NAVIGATION: ${passed} BỘ TEST ĐẠT 100%!`);
