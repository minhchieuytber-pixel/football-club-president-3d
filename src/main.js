// src/main.js
// Khởi chạy chính Football Club President Simulator 3D — Paris Saint-Germain (Chủ tịch Phạm Minh Chiêu)
// Tích hợp đồng bộ: GameTimeSystem (15 phút thực = 1 ngày game), AdaptivePerformanceManager, Pathfinding + Local Avoidance,
// Huấn luyện 3D (12 chức vụ BHL + bóng 3D), Quản lý nhân sự thực tế, Chuyển nhượng 2 giai đoạn, Hồ sơ cầu thủ 8 tab & Save/Load đa mùa giải.
import './core/threeSetup.js';
import { AudioManager } from './audio/AudioManager.js';
import { TextureFactory } from './core/TextureFactory.js';
import { getMemorySnapshot } from './core/AssetCache.js';
import { AdaptivePerformanceManager } from './core/AdaptivePerformanceManager.js';
import { FurnitureFactory } from './scene/FurnitureFactory.js';
import { CharacterFactory } from './characters/CharacterFactory.js';
import { AnimationSystem } from './animations/AnimationSystem.js';
import { VehicleSystem } from './vehicles/VehicleSystem.js';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera.js';
import { TouchControls } from './controls/TouchControls.js';
import { PsgCampusScene } from './scene/PsgCampusScene.js';
import { DressingRoomSystem } from './scene/DressingRoomSystem.js';
import { MediaEventRooms } from './scene/MediaEventRooms.js';
import { ParcDesPrincesZone } from './scene/ParcDesPrincesZone.js';
import { NpcSystem } from './npc/NpcSystem.js';
import { SaveManager } from './save/SaveManager.js';
import { GameState } from './club/GameState.js';
import { UIManager } from './ui/UIManager.js';

const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 3;
const STREAM_INTERVAL = 0.2;    // 5 Hz zone streaming & culling
const RAYCAST_INTERVAL = 0.08;  // 12.5 Hz crosshair interaction raycast
const HUD_INTERVAL = 0.2;       // 5 Hz top HUD refresh (instant on prompt change)
const DAYLIGHT_INTERVAL = 0.5;  // 2 Hz daylight cycle check
const CEREMONY_HUD_INTERVAL = 0.5;
const NO_INPUT = Object.freeze({ x: 0, y: 0, moving: false });

function isObjectVisibleInHierarchy(obj) {
  let cur = obj;
  while (cur) {
    if (!cur.visible) return false;
    cur = cur.parent;
  }
  return true;
}

class FootballPresidentGame3D {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.audio = new AudioManager();
    this.saveManager = new SaveManager();
    this.state = new GameState();

    const isMobileViewport = (
      typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent || '')
    ) || Math.min(window.innerWidth, window.innerHeight) <= 500;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !isMobileViewport,
      powerPreference: 'high-performance',
      stencil: false
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    this.campusSceneObj = new THREE.Scene();
    this.campusSceneObj.background = new THREE.Color(0x8bb8e8);
    this.campusSceneObj.fog = new THREE.Fog(0x8bb8e8, 110, 265);

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / Math.max(1, window.innerHeight), 0.15, 280);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 4.8;
    this.centerNDC = new THREE.Vector2(0, 0);

    // Pre-allocated scratch vectors & arrays (zero per-frame GC)
    this._vForward = new THREE.Vector3();
    this._vRight = new THREE.Vector3();
    this._vMoveDir = new THREE.Vector3();
    this._rayTargets = [];
    this._rayHits = [];
    this._extraZones = { mediaRoomsGroup: null, dressingRoomGroup: null, trainingEquipGroup: null, eventActive: false };
    this._npcUpdateOpts = { focusPos: null, lodStrideMultiplier: 1.5, stadiumTrainingVisible: true };

    this.texFactory = new TextureFactory();
    this.furnFactory = new FurnitureFactory(this.texFactory);
    this.charFactory = new CharacterFactory();
    this.animSystem = new AnimationSystem();
    this.vehicleSystem = new VehicleSystem(this.texFactory);

    this.campus = new PsgCampusScene(this.campusSceneObj, this.texFactory, this.furnFactory, this.vehicleSystem);
    this.dressingRoom = new DressingRoomSystem(this.campus, this.texFactory, this.furnFactory, this.state.formationSystem);
    this.mediaRooms = new MediaEventRooms(this.campus, this.texFactory, this.furnFactory);
    this.stadiumZone = new ParcDesPrincesZone(this.campus, this.texFactory, this.furnFactory, this.vehicleSystem);
    this.state.trainingSystem.build3DTrainingEquipment(this.campus);

    this.perfManager = new AdaptivePerformanceManager(
      this.renderer,
      this.camera,
      this.campusSceneObj,
      this.campus.sunLight
    );

    this.npcSystem = new NpcSystem(this.campusSceneObj, this.charFactory, this.animSystem, this.campus);
    this.npcSystem.attachTrainingSystem(this.state.trainingSystem);
    this.npcSystem.spawnFromProfiles(this.state.npcs, this.state.clockHour);
    this.npcSystem.syncStaffNpcs(this.state.staffDb.active, this.state.clockHour);
    this.npcSystem.syncSquadPlayers(this.state.getPsgSquad(), this.state.clockHour);
    this.state.signingEventSystem.attach3D(this.mediaRooms, this.npcSystem);

    this.eventCameraAngle = null; // Góc máy truyền hình 3D khi đang diễn ra Lễ Ký Kết / Họp Báo / PSG TV LIVE
    this.stadiumCctvKey = null;   // Camera giám sát SVĐ Parc des Princes từ xa (dùng LOD thấp không tải nặng)

    // Đăng ký đồng bộ Single Source of Truth -> Thế giới 3D!
    this.state.onSquadChange(() => {
      this.npcSystem.syncSquadPlayers(this.state.getPsgSquad(), this.state.clockHour);
      this.dressingRoom.refreshDynamicElements();
    });
    this.state.onStaffChange(() => {
      this.npcSystem.syncStaffNpcs(this.state.staffDb.active, this.state.clockHour);
    });

    this.playerMesh = this.charFactory.createHumanoid({ outfit: 'suit_president', heightScale: 1.02 });
    this.playerMesh.visible = false;
    this.playerMesh.position.set(-26.0, 0.14, -12.5);
    this.campusSceneObj.add(this.playerMesh);

    // Fixed-timestep physics state for player position & smooth kinematics
    this._physPos = { x: -26.0, z: -12.5 };
    this._prevPhysPos = { x: -26.0, z: -12.5 };
    this._lastVisualPos = { x: -26.0, z: -12.5 };
    this._velX = 0;
    this._velZ = 0;
    this._stepDistAccum = 0;
    this._simAccum = 0;
    this._preEventPlayerState = null;

    this.tpCam = new ThirdPersonCamera(this.camera);
    this.tpCam.setCollisionResolver((x, z, r) => this.campus.resolveCollision(x, z, r));
    this.tpCam.snapTo(this.playerMesh.position, 0, -0.06);
    this.controls = new TouchControls(this.tpCam, this.canvas, () => this.handleInteract());

    this.mode = 'campus';
    this.seatedSeat = null;
    this.aimedTarget = null;
    this.fpsFrames = 0;
    this.fpsTime = performance.now();
    this.currentFps = 60;

    // Throttled subsystem timers
    this._daylightTimer = 0;
    this._lastDaylightKey = '';
    this._streamTimer = 0;
    this._raycastTimer = 0;
    this._hudTimer = HUD_INTERVAL;
    this._ceremonyHudTimer = 0;
    this._lastAimedPrompt = '__init__';
    this._resizeTimer = null;

    // Managed RAF & lifecycle state
    this._rafId = null;
    this._loopPaused = false;
    this._contextLost = false;
    this._boundLoop = (now) => this.loop(now);

    this.ui = new UIManager(this.state, this.audio, this.saveManager, {
      teleport: (room) => this.teleportToRoom(room),
      startMatch: () => this.enterMatchday(),
      exitMatch: () => {},
      summonBoard: () => this.npcSystem.summonBoardMeeting(),
      endBoard: () => this.npcSystem.endBoardMeeting(),
      summonPlayer: (nameOrId) => this.npcSystem.summonPlayerToPresidentOffice(nameOrId),
      dismissPlayer: () => this.npcSystem.dismissSummonedPlayer(),
      dispatchNpcTask: (npcId, rKey) => this.npcSystem.dispatchNpcForTask(npcId, rKey),
      setEventCamera: (angleKey) => {
        const nextAngle = angleKey || null;
        if (nextAngle && !this._preEventPlayerState) {
          this._preEventPlayerState = {
            x: this.playerMesh.position.x,
            y: this.playerMesh.position.y,
            z: this.playerMesh.position.z,
            rotY: this.playerMesh.rotation.y
          };
        }
        this.eventCameraAngle = nextAngle;
        if (nextAngle) this.state.signingEventSystem.broadcast.setCameraAngle(nextAngle);
        this.playerMesh.visible = !!nextAngle;
        if (nextAngle === 'signing_desk' && this.mediaRooms?.seatPositions?.signing?.president) {
          const sp = this.mediaRooms.seatPositions.signing.president;
          this.playerMesh.position.set(sp.x, 0.14, sp.z);
          this.playerMesh.rotation.y = sp.rotY;
          this._syncPhysicsFromVisual();
        } else if (nextAngle && this.mediaRooms?.seatPositions?.press?.president) {
          const sp = this.mediaRooms.seatPositions.press.president;
          this.playerMesh.position.set(sp.x, 0.48, sp.z);
          this.playerMesh.rotation.y = sp.rotY;
          this._syncPhysicsFromVisual();
        } else if (!nextAngle && this._preEventPlayerState) {
          const prev = this._preEventPlayerState;
          this._preEventPlayerState = null;
          this.playerMesh.position.set(prev.x, prev.y, prev.z);
          this.playerMesh.rotation.y = prev.rotY;
          this._syncPhysicsFromVisual();
          this.tpCam.snapTo(this.playerMesh.position);
        }
        this.updateWorldStreaming(true);
      },
      setStadiumCctv: (camKey) => {
        this.stadiumCctvKey = camKey || null;
        if (this.stadiumZone) this.stadiumZone.cctvModeActive = !!camKey;
        this.updateWorldStreaming(true);
      },
      getStadiumZoneStatus: () => ({
        zoneLabel: this.stadiumZone?.getPlayerZoneLabel(this.playerMesh.position) || 'Khu Nhà Điều Hành PSG',
        streamMode: this.stadiumZone?.currentStreamMode || 'hq_detail',
        lodHighBuilt: !!this.stadiumZone?.lodHighBuilt,
        lodHighVisible: !!this.stadiumZone?.lodHighGroup?.visible,
        cctvCameras: this.stadiumZone?.cctvCameras || {}
      }),
      setQuality: (q) => this.applyQuality(q),
      toggleSprint: () => { this.controls.sprint = !this.controls.sprint; return this.controls.sprint; },
      interact: () => this.handleInteract(),
      exportSnapshot: () => this.state.exportFullState({ x: this.playerMesh.position.x, z: this.playerMesh.position.z }),
      importSnapshot: (snap) => {
        this.state.importFullState(snap);
        this.npcSystem.spawnFromProfiles(this.state.npcs, this.state.clockHour);
        this.npcSystem.syncStaffNpcs(this.state.staffDb.active, this.state.clockHour);
        this.npcSystem.syncSquadPlayers(this.state.getPsgSquad(), this.state.clockHour);
        this.dressingRoom.refreshDynamicElements();
        this.campus.updateDayNightCycle(this.state.clockHour, this.state.timeSystem.weather);
        this.standUp(true);
        this._preEventPlayerState = null;
        if (snap.playerPos) {
          this.playerMesh.position.set(snap.playerPos.x, 0.14, snap.playerPos.z);
          this._syncPhysicsFromVisual();
          this.tpCam.snapTo(this.playerMesh.position);
        }
        this.updateWorldStreaming(true);
        this.perfManager.requestShadowUpdate();
      }
    });

    this._toastInfoCb = (msg) => this.ui.toast(msg, 'info');
    this.state._onNewDayToast = this._toastInfoCb;

    // Tự động đóng băng đồng hồ & reset deltaTime an toàn khi ẩn tab / khóa màn hình iPhone / quay lại app!
    this.state.timeSystem.bindVisibilityGuards(
      () => {
        this.lastTime = performance.now();
        this._simAccum = 0;
        if (typeof document !== 'undefined' && document.hidden) {
          this.pauseLoop();
        }
      },
      () => {
        this.lastTime = performance.now();
        this._simAccum = 0;
        this.perfManager.resetHistory();
        if (!this._contextLost && (typeof document === 'undefined' || !document.hidden)) {
          this.resumeLoop();
        }
      }
    );

    // Xử lý an toàn WebGL context lost / restored trên iPhone Safari
    this._bindWebGLContextHandlers();

    const savedSettings = this.saveManager.loadSettings();
    const defaultQuality = savedSettings.quality || 'Medium';
    this.ui.currentQuality = defaultQuality;
    const qBtn = document.getElementById('btn-quality');
    if (qBtn) qBtn.textContent = defaultQuality;
    this.audio.muted = !!savedSettings.muted;
    this.applyQuality(defaultQuality);

    this.campus.updateDayNightCycle(this.state.clockHour, this.state.timeSystem.weather);
    this.updateWorldStreaming(true);
    this.onResize();

    this._onWindowResize = () => this._scheduleResize();
    window.addEventListener('resize', this._onWindowResize);
    window.addEventListener('orientationchange', this._onWindowResize);

    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (isLocal) {
        // Gỡ bỏ Service Worker cache cũ trên localhost để không bao giờ bị kẹt ở bản index cũ
        navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
        if (window.caches) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
      } else {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      }
    }

    this.lastTime = performance.now();
    this.ui.toast('Chào mừng Chủ tịch Phạm Minh Chiêu! Đồng hồ chuẩn 15 phút = 1 ngày game · Trỏ vào bàn/NPC để tương tác.', 'success');
    this.resumeLoop();
  }

  _bindWebGLContextHandlers() {
    if (!this.canvas) return;
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this._contextLost = true;
      this.pauseLoop();
      this.state.timeSystem.hiddenPaused = true;
      this.ui.toast('⚠️ WebGL tạm ngắt bộ nhớ — đang tự động khôi phục...', 'warn');
    }, false);

    this.canvas.addEventListener('webglcontextrestored', () => {
      this._contextLost = false;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.06;
      if (this.texFactory?.markAllNeedsUpdate) this.texFactory.markAllNeedsUpdate();
      if (this.mediaRooms?.markTexturesNeedsUpdate) this.mediaRooms.markTexturesNeedsUpdate();
      if (this.dressingRoom?.markTexturesNeedsUpdate) this.dressingRoom.markTexturesNeedsUpdate();
      this.perfManager.reapplyCurrentTier();
      this.perfManager.requestShadowUpdate();
      this.onResize();
      this.state.timeSystem.hiddenPaused = !!(typeof document !== 'undefined' && document.hidden);
      this.lastTime = performance.now();
      this._simAccum = 0;
      if (!this.state.timeSystem.hiddenPaused) this.resumeLoop();
      this.ui.toast('✅ Đồ họa 3D đã khôi phục ổn định.', 'success');
    }, false);
  }

  _syncPhysicsFromVisual() {
    const px = this.playerMesh.position.x;
    const pz = this.playerMesh.position.z;
    this._physPos.x = px;
    this._physPos.z = pz;
    this._prevPhysPos.x = px;
    this._prevPhysPos.z = pz;
    this._lastVisualPos.x = px;
    this._lastVisualPos.z = pz;
    this._velX = 0;
    this._velZ = 0;
    this._stepDistAccum = 0;
    this._simAccum = 0;
  }

  _scheduleResize() {
    if (this._resizeTimer !== null) clearTimeout(this._resizeTimer);
    this._resizeTimer = setTimeout(() => {
      this._resizeTimer = null;
      this.onResize();
    }, 120);
  }

  getPerfReport() {
    return this.perfManager.getPerfReport(this.renderer, this.npcSystem, this.stadiumZone);
  }

  getMemorySnapshot() {
    return getMemorySnapshot(this.renderer);
  }

  applyQuality(level) {
    this.perfManager.setUserQualityCeiling(level);
    this.onResize();
    this.perfManager.requestShadowUpdate();
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.perfManager.requestShadowUpdate();
  }

  pauseLoop() {
    this._loopPaused = true;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  resumeLoop() {
    if (this._contextLost) return;
    this._loopPaused = false;
    this.lastTime = performance.now();
    this._simAccum = 0;
    if (this._rafId === null) {
      this._rafId = requestAnimationFrame(this._boundLoop);
    }
  }

  updateWorldStreaming(force = false) {
    if (!this.stadiumZone) return;
    this._extraZones.mediaRoomsGroup = this.mediaRooms?.group || null;
    this._extraZones.dressingRoomGroup = this.dressingRoom?.group || null;
    this._extraZones.trainingEquipGroup = this.state.trainingSystem?.sceneGroup || null;
    this._extraZones.eventActive = !!this.eventCameraAngle;
    this.stadiumZone.updateStreaming(
      this.playerMesh.position,
      this.campus.hqInteriorGroup,
      this.npcSystem.npcs,
      this._extraZones
    );
    if (force) this.perfManager.requestShadowUpdate();
  }

  sitOnSeat(seat) {
    this.seatedSeat = seat;
    this.playerMesh.position.set(seat.x, 0.14, seat.z);
    this._syncPhysicsFromVisual();
    this.tpCam.setSeated(true);
    this.tpCam.setLookDirection(seat.lookYaw, -0.08, true);
    this.audio.playClick();
    this.ui.toast(`Đã ngồi vào ${seat.label}. Kéo joystick để đứng dậy.`, 'info');
  }

  standUp(silent = false) {
    if (!this.seatedSeat) return;
    const safe = this.campus.resolveCollision(this.seatedSeat.standX, this.seatedSeat.standZ, 0.42);
    this.playerMesh.position.set(safe.x, 0.14, safe.z);
    this._syncPhysicsFromVisual();
    this.seatedSeat = null;
    this.tpCam.setSeated(false);
    if (!silent) { this.audio.playClick(); this.ui.toast('Đã đứng dậy.', 'info'); }
  }

  teleportToRoom(roomKey) {
    this.standUp(true);
    const pt = this.campus.roomWaypoints[roomKey];
    if (pt) {
      const safe = this.campus.resolveCollision(pt.x, pt.z, 0.42);
      this.playerMesh.position.set(safe.x, 0.14, safe.z);
      this._syncPhysicsFromVisual();
      this.tpCam.snapTo(this.playerMesh.position);
      this.updateWorldStreaming(true);
      this.perfManager.requestShadowUpdate();
    }
  }

  enterMatchday() {
    this.ui.openMatchdayFlow();
  }

  detectAimedTarget() {
    if (this.stadiumCctvKey || this.eventCameraAngle || this.perfManager.isModalCoveringViewport()) {
      return null;
    }

    this.raycaster.setFromCamera(this.centerNDC, this.camera);

    const targets = this._rayTargets;
    targets.length = 0;
    const npcMeshes = this.npcSystem.raycastMeshes;
    for (let i = 0; i < npcMeshes.length; i++) {
      const m = npcMeshes[i];
      if (m && isObjectVisibleInHierarchy(m)) targets.push(m);
    }
    const campusMeshes = this.campus.raycastMeshes;
    for (let i = 0; i < campusMeshes.length; i++) {
      const m = campusMeshes[i];
      if (m && isObjectVisibleInHierarchy(m)) targets.push(m);
    }

    const hits = this._rayHits;
    hits.length = 0;
    this.raycaster.intersectObjects(targets, false, hits);

    if (hits.length > 0) {
      const obj = hits[0].object;
      if (obj.userData.npcId) {
        const npc = this.npcSystem.getById(obj.userData.npcId);
        if (npc) return { type: 'npc', data: npc, prompt: `💬 ${npc.name} · ${npc.role} (${npc.dept})` };
      }
      if (obj.userData.interactId) {
        const meta = this.campus.interactables.get(obj.userData.interactId);
        if (meta) {
          if (meta.action === 'toggle_door' && meta.extra) {
            return { type: 'obj', data: meta, prompt: meta.extra.open ? '🚪 Đóng cửa gỗ' : '🚪 Mở cửa gỗ' };
          }
          return { type: 'obj', data: meta, prompt: `${meta.icon} ${meta.label}` };
        }
      }
    }
    if (this.seatedSeat) {
      return { type: 'stand', data: null, prompt: '🧍 Đứng dậy khỏi ghế' };
    }
    return null;
  }

  handleInteract() {
    if (this.mode !== 'campus') return;
    const t = this.aimedTarget;
    if (!t) return;
    this.audio.playClick();
    if (t.type === 'stand') { this.standUp(); return; }
    if (t.type === 'npc') {
      if (t.data.isPlayer) {
        const sq = this.state.getPlayerById(t.data.playerId) || this.state.getPsgSquad().find((p) => p.name === t.data.name);
        if (sq) { this.ui.openPlayerProfileModal(sq.id, 'overview'); return; }
      }
      this.ui.openNpcDialogue(t.data);
    } else {
      const act = t.data.action;
      if (act === 'toggle_door' && t.data.extra) {
        const isOpen = this.campus.toggleDoor(t.data.extra);
        this.audio.playDoor();
        this.ui.toast(isOpen ? 'Đã mở cửa gỗ.' : 'Đã đóng cửa gỗ.', 'info');
      } else if (act === 'sit_seat' && t.data.extra) this.sitOnSeat(t.data.extra);
      else if (act === 'open_computer') this.ui.openComputer('reports');
      else if (act === 'open_reports') this.ui.openComputer('reports');
      else if (act === 'open_history') this.ui.openComputer('history');
      else if (act === 'open_board_meeting') this.ui.openBoardMeeting();
      else if (act === 'open_medical') this.ui.openComputer('squad');
      else if (act === 'open_tactics' || act === 'open_formation') this.ui.openComputer('formation');
      else if (act === 'open_signing_event') this.ui.openComputer('events');
      else if (act === 'open_stadium_cctv') this.ui.openStadiumCctvOverlay('overview_gate');
      else if (act === 'open_matchday') this.enterMatchday();
    }
  }

  _stepPlayerPhysics(fixedDt, targetVx, targetVz, isSprint) {
    const prevX = this._physPos.x;
    const prevZ = this._physPos.z;
    this._prevPhysPos.x = prevX;
    this._prevPhysPos.z = prevZ;

    const hasInput = (targetVx * targetVx + targetVz * targetVz) > 0.0004;
    const accelRate = hasInput ? 12.0 : 14.0;
    const f = 1 - Math.exp(-accelRate * fixedDt);
    this._velX += (targetVx - this._velX) * f;
    this._velZ += (targetVz - this._velZ) * f;

    const speedSq = this._velX * this._velX + this._velZ * this._velZ;
    if (!hasInput && speedSq < 0.0004) {
      this._velX = 0;
      this._velZ = 0;
      this._stepDistAccum = 0;
      return;
    }

    const resolved = this.campus.resolveCollision(
      prevX + this._velX * fixedDt,
      prevZ + this._velZ * fixedDt,
      0.42
    );
    this._physPos.x = resolved.x;
    this._physPos.z = resolved.z;

    // Tính quãng đường thực di chuyển sau xử lý va chạm tường (trượt tường mượt & phát tiếng bước chân chuẩn sải)
    const actualDx = resolved.x - prevX;
    const actualDz = resolved.z - prevZ;
    const actualDist = Math.hypot(actualDx, actualDz);
    if (fixedDt > 0) {
      const actualVx = actualDx / fixedDt;
      const actualVz = actualDz / fixedDt;
      if (Math.abs(actualVx - this._velX) > 0.25) this._velX = actualVx;
      if (Math.abs(actualVz - this._velZ) > 0.25) this._velZ = actualVz;
    }

    if (actualDist > 0.001) {
      this._stepDistAccum += actualDist;
      const strideLen = isSprint ? 1.55 : 1.15;
      if (this._stepDistAccum >= strideLen) {
        this._stepDistAccum -= strideLen;
        this.audio.playStep(isSprint);
      }
    }
  }

  updateCampus(dt, modalOpen = false) {
    // 1. Cập nhật đồng hồ thống nhất toàn game (GameTimeElapsed = RealTimeElapsed × 96 × speedMultiplier)
    this.state.tickTime(dt);

    // 2. Cập nhật ánh sáng ngày/đêm mỗi 0.5 giây thực (dirty-check theo giờ + thời tiết)
    this._daylightTimer += dt;
    if (this._daylightTimer >= DAYLIGHT_INTERVAL) {
      this._daylightTimer = 0;
      const dayKey = `${Math.round(this.state.clockHour * 120)}_${this.state.timeSystem.weather}`;
      if (dayKey !== this._lastDaylightKey) {
        this._lastDaylightKey = dayKey;
        this.campus.updateDayNightCycle(this.state.clockHour, this.state.timeSystem.weather);
        this.perfManager.requestShadowUpdate();
      }
    }

    // Detect external position overrides (e.g. teleport / debug probes setting playerMesh.position directly)
    if (
      Math.abs(this.playerMesh.position.x - this._lastVisualPos.x) > 0.02 ||
      Math.abs(this.playerMesh.position.z - this._lastVisualPos.z) > 0.02
    ) {
      this._syncPhysicsFromVisual();
    }

    // 3. Fixed-timestep player movement & smooth kinematics (FIXED_DT = 1/60, max 3 substeps)
    const canMove = !modalOpen && !this.stadiumCctvKey && !this.eventCameraAngle;
    const inp = canMove ? this.controls.getInputVector() : NO_INPUT;
    const maxSpeed = this.controls.sprint ? 7.2 : 4.2;
    let targetVx = 0;
    let targetVz = 0;

    if (inp.moving) {
      if (this.seatedSeat) this.standUp(true);
      const yaw = this.tpCam.yaw;
      this._vForward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      this._vRight.set(Math.cos(yaw), 0, -Math.sin(yaw));
      this._vMoveDir
        .set(0, 0, 0)
        .addScaledVector(this._vRight, inp.x)
        .addScaledVector(this._vForward, -inp.y);
      const dirLenSq = this._vMoveDir.lengthSq();
      if (dirLenSq > 0.0004) {
        // Bảo toàn biên độ analog joystick (0..1) thay vì ép tốc độ tối đa ngay lập tức
        const analogMag = Math.min(1, Math.hypot(inp.x, inp.y));
        const invLen = 1 / Math.sqrt(dirLenSq);
        targetVx = this._vMoveDir.x * invLen * maxSpeed * analogMag;
        targetVz = this._vMoveDir.z * invLen * maxSpeed * analogMag;
      }
    }

    this._simAccum = Math.min(this._simAccum + dt, FIXED_DT * MAX_SUBSTEPS);
    let steps = 0;
    while (this._simAccum >= FIXED_DT && steps < MAX_SUBSTEPS) {
      this._stepPlayerPhysics(FIXED_DT, targetVx, targetVz, this.controls.sprint);
      this._simAccum -= FIXED_DT;
      steps++;
    }

    const curSpeed = Math.hypot(this._velX, this._velZ);
    const isMovingVisually = curSpeed > 0.02 || this._physPos.x !== this._prevPhysPos.x || this._physPos.z !== this._prevPhysPos.z;
    if (isMovingVisually) {
      const alpha = Math.min(1, this._simAccum / FIXED_DT);
      this.playerMesh.position.x = this._prevPhysPos.x + (this._physPos.x - this._prevPhysPos.x) * alpha;
      this.playerMesh.position.z = this._prevPhysPos.z + (this._physPos.z - this._prevPhysPos.z) * alpha;
    } else {
      this.playerMesh.position.x = this._physPos.x;
      this.playerMesh.position.z = this._physPos.z;
    }
    this._lastVisualPos.x = this.playerMesh.position.x;
    this._lastVisualPos.z = this.playerMesh.position.z;
    this.tpCam.setMotionState(Math.min(1.4, curSpeed / 4.2), this.controls.sprint && curSpeed > 4.6);

    // 4. Streaming & Culling theo khoảng cách (5 Hz) + Doors + Signing Event + NPC 3D
    this._streamTimer += dt;
    if (this._streamTimer >= STREAM_INTERVAL) {
      this._streamTimer = 0;
      this.updateWorldStreaming(false);
    }

    const simDt = this.state.timeSystem.isPaused() ? 0 : dt;
    this.campus.updateDoors(dt, this.playerMesh.position, this.npcSystem.npcs);
    this.state.signingEventSystem.update(dt);

    if (simDt > 0) {
      let focusPos = this.playerMesh.position;
      if (this.stadiumCctvKey && this.stadiumZone?.cctvCameras?.[this.stadiumCctvKey]) {
        focusPos = this.stadiumZone.cctvCameras[this.stadiumCctvKey].look;
      } else if (this.eventCameraAngle && this.mediaRooms?.cameraTargets?.[this.eventCameraAngle]) {
        focusPos = this.mediaRooms.cameraTargets[this.eventCameraAngle].look;
      }
      this._npcUpdateOpts.focusPos = focusPos;
      this._npcUpdateOpts.lodStrideMultiplier = this.perfManager.npcLodStrideMultiplier;
      this._npcUpdateOpts.stadiumTrainingVisible = Boolean(this.stadiumZone?.lodHighGroup?.visible || this.stadiumZone?.cctvModeActive);
      this.npcSystem.update(
        simDt,
        this.playerMesh.position,
        this.state.clockHour,
        this._toastInfoCb,
        this.state.coach?.name || 'PSG',
        this._npcUpdateOpts
      );
    }

    // 5. Variable-rate camera & ceremony animation
    // Ưu tiên 1: Camera Giám sát SVĐ Parc des Princes từ xa (hoạt động mượt trên LOD thấp!)
    if (this.stadiumCctvKey && this.stadiumZone?.cctvCameras?.[this.stadiumCctvKey]) {
      const c = this.stadiumZone.cctvCameras[this.stadiumCctvKey];
      this.tpCam.updateFixedTarget(c.pos, c.look, dt);
    // Ưu tiên 2: Camera Lễ Ký Kết / Họp Báo / PSG TV LIVE
    } else if (this.eventCameraAngle && this.mediaRooms?.cameraTargets?.[this.eventCameraAngle]) {
      const camCfg = this.mediaRooms.cameraTargets[this.eventCameraAngle];
      this.tpCam.updateFixedTarget(camCfg.pos, camCfg.look, dt);
      const evt = this.state.signingEventSystem.activeEvent;
      if (evt && this.playerMesh.visible) {
        const presAnim = evt.phase === 'signing'
          ? (['sit', 'sign_contract', 'observe', 'handshake', 'hold_jersey'][evt.signingStepIdx] || 'sit')
          : 'sit';
        this.animSystem.updateRig(this.playerMesh, presAnim, dt, 1.0, 0);
      }
      this._ceremonyHudTimer += dt;
      if (this._ceremonyHudTimer >= CEREMONY_HUD_INTERVAL) {
        this._ceremonyHudTimer = 0;
        this.ui.refreshLiveCeremonyHeader();
      }
    } else {
      this.tpCam.update(this.playerMesh.position, dt);
    }

    // 6. Throttled crosshair raycast (12.5 Hz, skipped during modal/CCTV/Ceremony)
    this._raycastTimer += dt;
    if (this._raycastTimer >= RAYCAST_INTERVAL) {
      this._raycastTimer = 0;
      this.aimedTarget = this.detectAimedTarget();
    }
  }

  loop(now = performance.now()) {
    if (this._loopPaused || this._contextLost) {
      this._rafId = null;
      return;
    }
    this._rafId = requestAnimationFrame(this._boundLoop);

    const rawMs = now - this.lastTime;
    this.lastTime = now;
    const dt = Math.min(0.05, Math.max(0, rawMs / 1000));

    const modalOpen = this.perfManager.isModalCoveringViewport();
    this.updateCampus(dt, modalOpen);

    // Modal power-save: pace 3D rendering to ~20 FPS while full-screen modal covers viewport
    if (this.perfManager.shouldRenderFrame(now, modalOpen)) {
      this.perfManager.recordFrame(rawMs, modalOpen);
      this.perfManager.prepareShadowMap();
      this.renderer.render(this.campusSceneObj, this.camera);

      this.fpsFrames++;
      if (now - this.fpsTime >= 500) {
        this.currentFps = modalOpen ? this.perfManager.fps : Math.round((this.fpsFrames * 1000) / (now - this.fpsTime));
        this.fpsFrames = 0;
        this.fpsTime = now;
      }

      this.perfManager.tickDebugHud(now, this.npcSystem, this.stadiumZone);
    }

    // Throttled HUD updates (5 Hz, or instant when aimed prompt changes)
    const prompt = this.aimedTarget ? this.aimedTarget.prompt : null;
    this._hudTimer += dt;
    if (this._hudTimer >= HUD_INTERVAL || prompt !== this._lastAimedPrompt) {
      this._hudTimer = 0;
      this._lastAimedPrompt = prompt;
      this.ui.updateTopHUD(this.currentFps, prompt);
    }
  }
}

function bootGame() {
  if (window.__PSG_GAME__) return;
  try {
    window.__PSG_GAME__ = new FootballPresidentGame3D();
  } catch (err) {
    console.error('[PSG3D Boot Error]', err);
    const b = document.getElementById('boot-error-banner');
    const t = document.getElementById('boot-error-text');
    if (b && t) {
      b.style.display = 'flex';
      t.textContent = `Lỗi khởi chạy game: ${err?.message || err}`;
    }
  }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  bootGame();
} else {
  window.addEventListener('DOMContentLoaded', bootGame);
  window.addEventListener('load', bootGame);
}
