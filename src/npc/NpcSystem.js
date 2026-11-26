// src/npc/NpcSystem.js
// Hệ thống NPC 3D toàn diện: Pathfinding A* + RVO/ORCA Local Avoidance + ActivityPoint & Queue System +
// AI Lịch sinh hoạt 24h cá nhân hóa + 4-Tier Simulation/Animation LOD + Quản lý phòng cá nhân & Save/Load đồng bộ
import { PathfindingSystem } from '../ai/PathfindingSystem.js';
import { ActivityPointSystem } from '../ai/ActivityPointSystem.js';
import { formatKitName } from '../characters/PlayerKitSystem.js';

export const NPC_STATES = Object.freeze([
  'IDLE',
  'WALKING',
  'GOING_TO_ROOM',
  'WAITING_FOR_DOOR',
  'OPENING_DOOR',
  'ENTERING_ROOM',
  'INSIDE_ROOM',
  'RESTING',
  'WATCHING_TV',
  'EATING',
  'SOCIALIZING',
  'GOING_TO_GYM',
  'TRAINING',
  'MEDICAL_CHECK',
  'RECOVERY',
  'GOING_TO_LOCKER_ROOM',
  'SLEEPING',
  'WAITING_FOR_ACTIVITY',
  'AVOIDING_OBSTACLE',
  'AVOIDING_NPC',
  'STUCK_RECOVERY'
]);

const COACH_SIDELINE_SPOTS = [
  { x: 192.0, z: -61.5 }, { x: 182.0, z: -61.5 }, { x: 202.0, z: -61.5 }, { x: 192.0, z: -59.5 }
];

// Khu vực nghỉ ngơi & phục hồi dành riêng cho cầu thủ: nằm trong Phòng Thay Đồ Mới (132, -48) & Tòa nhà Nghỉ dưỡng (184, 9)
// (TUYỆT ĐỐI KHÔNG tự ý đi vào Nhà làm việc!)
const PLAYER_REST_SPOTS = [
  { x: 126.5, z: -52.5 }, { x: 126.5, z: -48.0 }, { x: 126.5, z: -43.5 },
  { x: 130.0, z: -54.8 }, { x: 135.0, z: -54.8 }, { x: 138.5, z: -52.5 },
  { x: 138.5, z: -43.5 }, { x: 133.5, z: -43.0 }, { x: 129.5, z: -43.0 },
  { x: 138.5, z: -47.5 }
];

const RESIDENCE_LOUNGE_SPOTS = [
  { x: 180.5, z: 17.5 }, { x: 187.5, z: 17.5 }, { x: 184.0, z: 13.5 },
  { x: 175.0, z: 9.0 },  { x: 193.0, z: 9.0 },  { x: 184.0, z: 2.0 },
  { x: 184.0, z: -2.2 }, { x: 165.0, z: 9.0 },  { x: 202.0, z: 9.0 }
];

const COACH_PROP_STATES = new Set(['clipboard', 'tablet', 'notes', 'supervise', 'coach_drill']);
const SITTING_ANIMS = new Set(['sit', 'work_pc', 'sign_contract', 'raise_hand', 'watch_tv', 'use_desk', 'gym_bike']);
const ACTIVITY_LOCKED_ANIMS = new Set(['sleep', 'lie_rest', 'watch_tv', 'use_desk', 'gym_treadmill', 'gym_bike', 'gym_weights', 'sit', 'eat']);
const BOARD_COACH_ROLES = new Set(['head_coach', 'tactical_coach', 'assistant_manager', 'set_piece_coach']);
const TABLET_COACH_ROLES = new Set(['tactical_analyst', 'performance_analyst', 'fitness_coach', 'rehab_coach', 'individual_dev_coach']);

const SECURITY_PATROL_ROUTE = [
  { x: -4.8, z: 24.5, task: 'Trực cổng chính Trụ sở PSG' },
  { x: -1.8, z: 12.0, task: 'Tuần tra sảnh lễ tân Trụ sở PSG' },
  { x: 3.0, z: -26.0, task: 'Kiểm tra an ninh sân nội bộ phía Bắc' },
  { x: 104.0, z: -24.0, task: 'Tuần tra cổng an ninh Training Center' }
];

const FACILITY_PATROL_ROUTE = [
  { x: 138.0, z: -72.0, task: 'Kiểm tra kho dụng cụ & bảo trì sân tập' },
  { x: 168.0, z: -24.5, task: 'Kiểm tra hạ tầng Trung tâm Y tế PSG' },
  { x: 184.0, z: -2.0, task: 'Kiểm tra hệ thống kỹ thuật Residence' },
  { x: 3.5, z: -25.0, task: 'Kiểm tra cơ sở vật chất khu Trụ sở & SVĐ' }
];

const MEDICAL_STAFF_STATIONS = [
  { pointId: 'med_head_desk', x: 174.5, z: -35.5, rotY: 0, anim: 'work_pc', task: 'Xem hồ sơ bệnh án tại Văn phòng Trưởng Bộ phận Y tế' },
  { pointId: 'med_report_station', x: 170.5, z: -33.4, rotY: 0, anim: 'observe', task: 'Tiếp nhận & đối chiếu báo cáo chấn thương cầu thủ' },
  { pointId: 'med_monitor_wall', x: 178.0, z: -36.5, rotY: Math.PI / 2, anim: 'tablet', task: 'Theo dõi chỉ số nhịp sinh học & hồi phục trên màn hình Y tế' }
];

const MEDICAL_LUNCH_SPOTS = [
  { x: 177.2, z: 2.2, task: 'Nghỉ trưa & trao đổi dinh dưỡng tại Khu Ăn uống Residence' },
  { x: 180.4, z: 2.2, task: 'Dùng bữa trưa dinh dưỡng cùng bộ phận Y tế' }
];

const MUSEUM_PATROL_SPOTS = [
  { x: 26.2, z: -42.5 },
  { x: 27.5, z: -48.2 },
  { x: 38.5, z: -44.0 },
  { x: 41.0, z: -48.2 },
  { x: 42.0, z: -38.5 },
  { x: 27.5, z: -39.5 }
];

const EXEC_CONSULT_SPOTS = {
  npc_sporting: { x: 12.5, z: -11.5, task: 'Trao đổi chiến lược nhân sự với CEO tại HQ' },
  npc_scout: { x: -24.5, z: 6.2, task: 'Báo cáo hồ sơ chuyển nhượng cho BHL' },
  npc_acad: { x: 165.0, z: -61.5, task: 'Theo dõi tài năng trẻ tại Khu Huấn luyện PSG' },
  npc_pcare: { x: 180.5, z: 13.5, task: 'Thăm hỏi đời sống cầu thủ tại Player Residence' },
  npc_ceo: { x: -2.0, z: -9.5, task: 'Điều hành cuộc họp điều phối ban lãnh đạo' },
  npc_vp: { x: 12.5, z: -11.5, task: 'Hội ý kế hoạch thương mại với CEO' },
  npc_cfo: { x: 21.2, z: -10.5, task: 'Rà soát ngân sách vận hành cùng Phó Chủ tịch' },
  npc_media: { x: 45.0, z: 9.5, task: 'Kiểm tra công tác truyền thông tại Cánh Báo chí' }
};

function hashNpcSeed(str) {
  let h = 2166136261;
  const s = String(str || 'psg');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const LOD0_OUT_SQ = 20 * 20;
const LOD1_IN_SQ = 18 * 18;
const LOD1_OUT_SQ = 44 * 44;
const LOD2_IN_SQ = 42 * 42;
const LOD2_OUT_SQ = 87 * 87;
const LOD3_IN_SQ = 85 * 85;
const STADIUM_ACTIVE_RADIUS_SQ = 95 * 95;
const EMPTY_PATH_OPTS = Object.freeze({});
const SKIP_LOCAL_GRID_OPTS = Object.freeze({ skipLocalGrid: true });

function markSharedAsset(obj) {
  if (!obj) return obj;
  if (!obj.userData) obj.userData = {};
  obj.userData.sharedAsset = true;
  return obj;
}

function lerpAngle(current, target, factor) {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * Math.min(1, factor);
}

export class NpcSystem {
  constructor(scene, charFactory, animSystem, campusScene) {
    this.scene = scene;
    this.charFactory = charFactory;
    this.animSystem = animSystem;
    this.campus = campusScene;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.npcs = [];
    this.npcById = new Map();
    this.raycastMeshes = [];
    this.meetingActive = false;
    this.summonedPlayerNpc = null;
    this.wasTraining = null;
    this._wasDrNow = null;
    this._wasMeetingActive = false;
    this.pathfinder = new PathfindingSystem(campusScene);
    this.activitySystem = new ActivityPointSystem();
    this.trainingSystem = null;
    this.activeClubKit = 'home';
    this.captainId = null;
    this._sharedAssets = null;
    this._frameCounter = 0;
    this._curtainEvalTimer = 0;
    this._shouldEvalCurtains = false;
    this._simClock = 0;
    this.lodCounts = [0, 0, 0, 0];
    this._avoidOut = { vx: 0, vz: 0, waiting: false };
    this._avoidOpts = { out: this._avoidOut, useSpatialGrid: true, skipWhiskers: false };
  }

  attachActivitySystem(activitySystem) {
    if (activitySystem) this.activitySystem = activitySystem;
  }

  _getSharedAssets() {
    if (this._sharedAssets || typeof THREE === 'undefined') return this._sharedAssets;
    this._sharedAssets = {
      boardGeo: markSharedAsset(new THREE.BoxGeometry(0.28, 0.02, 0.36)),
      boardMat: markSharedAsset(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 })),
      tabletGeo: markSharedAsset(new THREE.BoxGeometry(0.24, 0.016, 0.30)),
      tabletMat: markSharedAsset(new THREE.MeshStandardMaterial({ color: 0x1e293b, emissive: 0x0ea5e9, emissiveIntensity: 0.35 })),
      // Đai phân đội mỏng ở gấu áo (KHÔNG che tên & số áo trên lưng!)
      bibGeo: markSharedAsset(new THREE.BoxGeometry(0.415, 0.055, 0.242)),
      bibMat: markSharedAsset(new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.45 }))
    };
    return this._sharedAssets;
  }

  // Giải phóng an toàn geometry/material không dùng chung khi xóa/tái tạo NPC (tuyệt đối KHÔNG dispose sharedAsset!)
  _disposeMeshTree(mesh) {
    if (!mesh || typeof mesh.traverse !== 'function') return;
    this.charFactory?.releaseMeshKit?.(mesh);
    mesh.traverse((child) => {
      if (!child.isMesh) return;
      if (child.geometry && !child.geometry.userData?.sharedAsset && typeof child.geometry.dispose === 'function') {
        child.geometry.dispose();
      }
      const mat = child.material;
      if (Array.isArray(mat)) {
        for (let i = 0; i < mat.length; i++) {
          const m = mat[i];
          if (m && !m.userData?.sharedAsset && typeof m.dispose === 'function') {
            if (m.map && !m.map.userData?.sharedAsset && typeof m.map.dispose === 'function') m.map.dispose();
            m.dispose();
          }
        }
      } else if (mat && !mat.userData?.sharedAsset && typeof mat.dispose === 'function') {
        if (mat.map && !mat.map.userData?.sharedAsset && typeof mat.map.dispose === 'function') mat.map.dispose();
        mat.dispose();
      }
    });
  }

  attachTrainingSystem(trainingSystem) {
    this.trainingSystem = trainingSystem;
  }

  rebuildRaycastMeshes() {
    this.raycastMeshes.length = 0;
    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i];
      if (!npc.mesh || !npc.mesh.visible) continue;
      npc.mesh.traverse((child) => {
        if (child.isMesh) {
          child.userData.npcId = npc.id;
          this.raycastMeshes.push(child);
        }
      });
    }
  }

  getCorrectDeskRotation(p) {
    if (p.id === 'npc_recep') return 0;
    if (p.id === 'npc_sec') return 0;
    if (p.id === 'npc_rehab_coach') return Math.PI;
    if (p.id === 'npc_med_physio') return Math.PI;
    if (p.home && p.home.z < 0) return 0;
    return Math.PI;
  }

  attachCoachProp(mesh, roleKey) {
    // Thêm bảng chiến thuật hoặc máy tính bảng 3D dùng chung geometry/material (sharedAsset = true)
    const rig = mesh?.userData?.rig;
    if (!rig || !rig.leftArm?.elbow) return;
    const assets = this._getSharedAssets();
    if (!assets) return;
    if (BOARD_COACH_ROLES.has(roleKey)) {
      const board = new THREE.Mesh(assets.boardGeo, assets.boardMat);
      board.position.set(0, -0.26, 0.14);
      board.name = 'coach_prop';
      board.visible = false;
      rig.leftArm.elbow.add(board);
      mesh.userData.coachProp = board;
    } else if (TABLET_COACH_ROLES.has(roleKey)) {
      const tablet = new THREE.Mesh(assets.tabletGeo, assets.tabletMat);
      tablet.position.set(0, -0.25, 0.14);
      tablet.name = 'coach_prop';
      tablet.visible = false;
      rig.leftArm.elbow.add(tablet);
      mesh.userData.coachProp = tablet;
    }
  }

  _resolvePlayerKitType(npc, trainingNow = false, drNow = false, clockHour = 9.5) {
    if (npc.position === 'GK') return 'gk';
    if (npc.mode === 'event_travel' || npc.mode === 'event_hold' || npc.mode === 'going_president' || npc.mode === 'sit_president') {
      return this.activeClubKit || 'home';
    }
    if (drNow && clockHour >= 9.25 && clockHour < 9.5) return 'warmup';
    if (trainingNow) {
      if (npc.scrimmageTeam === 'B' || npc.bibMesh?.visible) return 'scrimmage';
      const drill = this.trainingSystem?.currentDrill;
      if (drill === 'warmup' || drill === 'recovery') return 'warmup';
      return 'training';
    }
    return this.activeClubKit || 'home';
  }

  _syncPlayerNpcKit(npc, kitType = null, trainingNow = false, drNow = false, clockHour = 9.5) {
    if (!npc || !npc.isPlayer || !npc.mesh || typeof this.charFactory?.applyPlayerKit !== 'function') return;
    const resolvedType = kitType || this._resolvePlayerKitType(npc, trainingNow, drNow, clockHour);
    this.charFactory.applyPlayerKit(npc.mesh, {
      kitType: resolvedType,
      playerId: npc.playerId || npc.id,
      displayName: npc.kitName || formatKitName(npc.name),
      fullName: npc.name,
      shirtNumber: npc.shirtNumber,
      isCaptain: !!(npc.isCaptain || (this.captainId && npc.playerId === this.captainId)),
      position: npc.position,
      club: 'Paris Saint-Germain'
    });
  }

  createNpcRecord(p, idx, trainingAtStart = false) {
    const initialKit = p.isPlayer
      ? {
          kitType: p.position === 'GK' ? 'gk' : (trainingAtStart ? 'training' : (this.activeClubKit || 'home')),
          playerId: p.playerId || p.id,
          displayName: p.kitName || formatKitName(p.name),
          fullName: p.name,
          shirtNumber: p.shirtNumber ?? null,
          isCaptain: !!p.isCaptain,
          position: p.position,
          club: 'Paris Saint-Germain'
        }
      : null;

    const mesh = this.charFactory.createHumanoid({
      outfit: p.outfit || (p.isPlayer ? (p.position === 'GK' ? 'kit_gk' : 'player_home') : p.isCoachingStaff ? 'coach_psg' : 'suit_navy'),
      skinTone: p.skin || 0xf2c6a0,
      hairColor: p.hair || 0x2c1d11,
      hairStyle: p.hairStyle ?? (idx % 3),
      heightScale: p.heightScale || (0.96 + (idx % 5) * 0.02),
      jerseyColor: p.jerseyColor || (p.position === 'GK' ? 0xeab308 : 0x00205b),
      kit: initialKit
    });

    if (p.isCoachingStaff) this.attachCoachProp(mesh, p.roleKey);

    const seatRotY = this.getCorrectDeskRotation(p);
    const restSpot = p.isPlayer ? PLAYER_REST_SPOTS[idx % PLAYER_REST_SPOTS.length] : (p.home || { x: 0, z: 6 });
    let startX = p.home?.x ?? 192;
    let startZ = p.home?.z ?? -86;
    if (p.isPlayer && !trainingAtStart) {
      startX = restSpot.x;
      startZ = restSpot.z;
    }
    const homeHasChair = this.campus?.hasChairAt ? this.campus.hasChairAt(startX, startZ, 0.78) : false;
    let startMode = p.isPlayer
      ? (trainingAtStart ? 'train' : 'dressing')
      : (homeHasChair ? 'work_pc' : 'stand_duty');
    let startRotY = seatRotY;

    if (p.isCoachingStaff && trainingAtStart && p.pitchSpot) {
      startX = p.pitchSpot.x;
      startZ = p.pitchSpot.z;
      startMode = 'coach_drill';
      startRotY = Math.PI;
    } else if (p.id === 'npc_coach' && trainingAtStart) {
      startX = 192;
      startZ = -61.5;
      startMode = 'supervise';
      startRotY = Math.PI;
    }

    mesh.position.set(startX, 0.14, startZ);
    mesh.rotation.y = startRotY;
    this.group.add(mesh);

    const npc = {
      ...p,
      mesh,
      target: new THREE.Vector3(startX, 0.14, startZ),
      finalDest: { x: startX, z: startZ },
      restSpot,
      mode: startMode,
      state: p.isPlayer ? (trainingAtStart ? 'TRAINING' : 'GOING_TO_LOCKER_ROOM') : 'IDLE',
      activityType: p.isPlayer ? (trainingAtStart ? 'training' : 'dressing') : 'duty',
      activityLabel: p.task || (p.isPlayer ? 'Sinh hoạt đội một PSG' : 'Làm việc tại CLB'),
      nextActivity: p.isPlayer ? (trainingAtStart ? 'Nghỉ trưa & Phục hồi' : 'Tập luyện cùng đội') : 'Trực văn phòng',
      activePointId: null,
      queueKey: null,
      _waitingDoorRoom: null,
      _waitingDoorResume: null,
      _slotLocked: false,
      _decisionSeed: hashNpcSeed(p.playerId || p.id),
      _decisionCooldown: 1.5 + (idx % 9) * 1.1,
      _activityHoldTimer: 0,
      _curActivityKey: null,
      recoveryAttempts: 0,
      stuckLogCount: 0,
      timer: 2.5 + (idx % 7) * 1.5,
      memory: p.memory || [],
      speed: p.isPlayer ? 3.8 : (p.id === 'npc_coach' || p.isCoachingStaff ? 3.5 : 2.15),
      collisionRadius: 0.34,
      avoidanceState: 'NONE',
      lastBlockedAt: 0,
      staffSpotIdx: idx % 4,
      _staffSlotKey: 'office_desk',
      _staffActivityAnim: null,
      seatRotY,
      coachWaypointIdx: idx % 4,
      path: [],
      pathIdx: 0,
      taskWorkTimer: 0,
      stuckTimer: 0,
      replanCooldown: 0,
      waitTimer: 0,
      lastPosX: startX,
      lastPosZ: startZ,
      _velX: 0,
      _velZ: 0,
      drillAnim: null,
      bibMesh: null,
      scrimmageTeam: null,
      kitName: p.kitName || (p.isPlayer ? formatKitName(p.name) : null),
      shirtNumber: p.shirtNumber ?? null,
      isCaptain: !!p.isCaptain,
      // Trạng thái 4-Tier LOD & cache ghế 3D
      _lod: 0,
      _accDt: 0,
      _lod3Timer: 0,
      _lod3Dirty: false,
      _lod3InTransit: false,
      _lod3TransitRemaining: 0,
      _chairCacheX: NaN,
      _chairCacheZ: NaN,
      _chairCacheHas: homeHasChair,
      _chairCacheY: 0.14
    };

    // Đai phân đội mỏng ở gấu áo (luôn giữ mặt lưng thoáng 100% để tên & số áo hiển thị rõ nét!)
    if (p.isPlayer && mesh.userData?.rig?.torso) {
      const assets = this._getSharedAssets();
      if (assets) {
        const bib = new THREE.Mesh(assets.bibGeo, assets.bibMat);
        bib.position.y = 0.055;
        bib.visible = false;
        mesh.userData.rig.torso.add(bib);
        npc.bibMesh = bib;
      }
    }

    return npc;
  }

  spawnFromProfiles(profiles, initialClockHour = 9.25) {
    for (let i = 0; i < this.npcs.length; i++) {
      const old = this.npcs[i];
      if (old.mesh) {
        this.group.remove(old.mesh);
        this._disposeMeshTree(old.mesh);
      }
    }
    while (this.group.children.length > 0) this.group.remove(this.group.children[0]);
    this.npcs = [];
    this.npcById.clear();
    this.raycastMeshes = [];
    this.summonedPlayerNpc = null;
    this.pathfinder.bakeObstacleGrid();

    const trainingAtStart = this.isTrainingHour(initialClockHour);
    this.wasTraining = trainingAtStart;
    this._wasDrNow = this.isDressingRoomHour(initialClockHour);
    this._wasMeetingActive = this.meetingActive;

    for (let idx = 0; idx < profiles.length; idx++) {
      const npc = this.createNpcRecord(profiles[idx], idx, trainingAtStart);
      this.npcs.push(npc);
      if (npc.id) this.npcById.set(npc.id, npc);
    }
    this.rebuildRaycastMeshes();
  }

  // Thêm NPC mới ngay lập tức vào thế giới 3D (hỗ trợ skipRebuild khi đồng bộ hàng loạt)
  addNpc(profile, currentClockHour = 9.5, skipRebuild = false) {
    if (!profile || !profile.id) return null;
    const existing = this.getById(profile.id);
    if (existing) {
      this.removeNpc(profile.id, true);
    }
    const npc = this.createNpcRecord(profile, this.npcs.length, this.isTrainingHour(currentClockHour));
    this.npcs.push(npc);
    this.npcById.set(npc.id, npc);
    if (!skipRebuild) this.rebuildRaycastMeshes();
    return npc;
  }

  // Xóa NPC khỏi thế giới 3D + giải phóng GPU buffer an toàn (không đụng sharedAsset)
  removeNpc(npcId, skipRebuild = false) {
    const idx = this.npcs.findIndex((n) => n.id === npcId || n.playerId === npcId || n.staffId === npcId);
    if (idx === -1) return false;
    const [removed] = this.npcs.splice(idx, 1);
    if (removed.id) {
      this.npcById.delete(removed.id);
      this.activitySystem?.releaseNpc?.(removed.id);
    }
    if (this.summonedPlayerNpc === removed) this.summonedPlayerNpc = null;
    if (removed.mesh) {
      this.group.remove(removed.mesh);
      this._disposeMeshTree(removed.mesh);
    }
    if (!skipRebuild) this.rebuildRaycastMeshes();
    return true;
  }

  // Đồng bộ toàn bộ cầu thủ đội một PSG vào thế giới 3D (tối đa 30 cầu thủ tương ứng 30 phòng Residence + 4-Tier LOD giữ mượt FPS)
  syncSquadPlayers(psgSquad, currentClockHour = 9.5, activeKit = null, captainId = null) {
    if (activeKit) this.activeClubKit = activeKit;
    if (captainId !== null) this.captainId = captainId;

    const validIds = new Set(psgSquad.map((p) => p.id));
    // Xóa NPC cầu thủ đã bị bán / cho mượn + giải phóng ActivityPoint & buffer an toàn
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const n = this.npcs[i];
      if (n.isPlayer && n.playerId && !validIds.has(n.playerId)) {
        if (this.summonedPlayerNpc === n) this.summonedPlayerNpc = null;
        if (n.id) {
          this.npcById.delete(n.id);
          this.activitySystem?.releaseNpc?.(n.id);
        }
        if (n.mesh) {
          this.group.remove(n.mesh);
          this._disposeMeshTree(n.mesh);
        }
        this.npcs.splice(i, 1);
      }
    }

    const skinPalette = [0xf2c6a0, 0xe0ac82, 0xc68652, 0x8d5524, 0xf6d5b8];
    const hairPalette = [0x141414, 0x2c1d11, 0x4a321f, 0x6b4c2e];
    const squadByName = new Map();
    for (let i = 0; i < psgSquad.length; i++) {
      squadByName.set(psgSquad[i].name, psgSquad[i]);
    }

    const existingByPlayerId = new Map();
    let playerNpcCount = 0;
    for (let i = 0; i < this.npcs.length; i++) {
      const n = this.npcs[i];
      if (!n.isPlayer) continue;
      playerNpcCount++;
      if (!n.playerId) {
        const match = squadByName.get(n.name);
        if (match) n.playerId = match.id;
      }
      if (n.playerId) existingByPlayerId.set(n.playerId, n);
    }

    const trainingNow = this.isTrainingHour(currentClockHour);
    const drNow = this.isDressingRoomHour(currentClockHour);
    const maxVisiblePlayers = 30;

    // Đảm bảo mọi cầu thủ mới mua / mới đôn lên đội một đều có NPC thực tế trong thế giới 3D!
    const candidates = [...psgSquad].sort((a, b) => (b.justJoined ? 1 : 0) - (a.justJoined ? 1 : 0) || b.ovr - a.ovr);
    for (let idx = 0; idx < candidates.length; idx++) {
      const p = candidates[idx];
      const existingNpc = existingByPlayerId.get(p.id);
      const isCap = !!(this.captainId && p.id === this.captainId);
      const kitName = formatKitName(p.name);
      if (existingNpc) {
        existingNpc.name = p.name;
        existingNpc.kitName = kitName;
        existingNpc.shirtNumber = p.shirtNumber ?? existingNpc.shirtNumber;
        existingNpc.isCaptain = isCap;
        existingNpc.role = `${p.position} · #${p.shirtNumber || ''} PSG`;
        existingNpc.skill = p.ovr;
        existingNpc.morale = p.morale;
        existingNpc.position = p.position;
        this._syncPlayerNpcKit(existingNpc, null, trainingNow, drNow, currentClockHour);
        continue;
      }
      if (playerNpcCount >= maxVisiblePlayers && !p.justJoined) continue;
      let hash = 0;
      for (let c = 0; c < p.id.length; c++) hash += p.id.charCodeAt(c);
      const pitchX = p.position === 'GK' ? 158.0 : (168 + ((idx * 7) % 48));
      const pitchZ = p.position === 'GK' ? -86.0 : (-102 + ((idx * 5) % 28));
      const profile = {
        id: `npc_pl_${p.id}`,
        playerId: p.id,
        name: p.name,
        kitName,
        shirtNumber: p.shirtNumber ?? null,
        isCaptain: isCap,
        role: `${p.position} · #${p.shirtNumber || ''} PSG`,
        dept: 'Đội Một PSG',
        position: p.position,
        age: p.age,
        gender: 'Nam',
        personality: p.personality || 'Tham vọng',
        skill: p.ovr,
        morale: p.morale || 84,
        relation: 82,
        outfit: p.position === 'GK' ? 'kit_gk' : 'player_home',
        jerseyColor: p.position === 'GK' ? 0xeab308 : 0x00205b,
        skin: skinPalette[hash % skinPalette.length],
        hair: hairPalette[hash % hairPalette.length],
        hairStyle: hash % 3,
        home: { x: pitchX, z: pitchZ },
        isPlayer: true,
        task: 'Sẵn sàng tập luyện cùng đội một PSG'
      };
      const added = this.addNpc(profile, currentClockHour, true);
      if (added) {
        this._syncPlayerNpcKit(added, null, trainingNow, drNow, currentClockHour);
        existingByPlayerId.set(p.id, added);
        playerNpcCount++;
      }
    }
    this.rebuildRaycastMeshes();
  }

  // Đồng bộ toàn bộ nhân sự (HLV trưởng, 12 thành viên BHL, lãnh đạo) từ StaffDatabase sang thế giới 3D
  syncStaffNpcs(activeStaffList, currentClockHour = 9.5) {
    const activeIds = new Set(activeStaffList.map((s) => s.npcId));
    // Xóa các NPC nhân sự đã bị sa thải / rời CLB
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const n = this.npcs[i];
      if ((n.isManagedStaff || n.isCoachingStaff) && !activeIds.has(n.id)) {
        if (n.id) this.npcById.delete(n.id);
        if (n.mesh) {
          this.group.remove(n.mesh);
          this._disposeMeshTree(n.mesh);
        }
        this.npcs.splice(i, 1);
      }
    }

    // Thêm mới hoặc cập nhật nhân sự đang tại vị (batch rebuildRaycastMeshes 1 lần cuối)
    for (let i = 0; i < activeStaffList.length; i++) {
      const st = activeStaffList[i];
      const cur = this.getById(st.npcId);
      if (cur) {
        if (cur.staffId && cur.staffId !== st.staffId) {
          this.removeNpc(cur.id, true);
          this.addNpc(this.staffToNpcProfile(st), currentClockHour, true);
        } else {
          cur.staffId = st.staffId;
          cur.name = st.name;
          cur.role = st.role;
          cur.roleKey = st.roleKey;
          cur.dept = st.dept;
          cur.skill = st.overall || st.reputation || 85;
          cur.personality = st.personality || 'Cẩn thận';
          cur.isCoachingStaff = !!st.isCoachingStaff;
          cur.isManagedStaff = true;
          cur.pitchSpot = st.pitchSpot || null;
        }
      } else {
        this.addNpc(this.staffToNpcProfile(st), currentClockHour, true);
      }
    }
    this.rebuildRaycastMeshes();
  }

  staffToNpcProfile(st) {
    return {
      id: st.npcId,
      staffId: st.staffId,
      roleKey: st.roleKey,
      name: st.name,
      role: st.role,
      dept: st.dept,
      age: st.age,
      gender: st.gender || 'Nam',
      personality: st.personality || 'Cẩn thận',
      skill: st.overall || st.reputation || 85,
      morale: st.morale || 85,
      relation: st.relation || 80,
      outfit: st.appearance?.outfit || (st.isCoachingStaff ? 'coach_psg' : 'suit_navy'),
      skin: st.appearance?.skin || 0xf2c6a0,
      hair: st.appearance?.hair || 0x2c1d11,
      hairStyle: st.appearance?.hairStyle ?? 0,
      home: st.home || { x: -25.0, z: 6.2 },
      pitchSpot: st.pitchSpot || null,
      isCoachingStaff: !!st.isCoachingStaff,
      isManagedStaff: true,
      task: st.currentDuty || st.specialty || 'Thực hiện nhiệm vụ chuyên môn tại PSG'
    };
  }

  isTrainingHour(clockHour) {
    return (clockHour >= 9.25 && clockHour < 12.15) || (clockHour >= 15.0 && clockHour < 16.5);
  }

  isDressingRoomHour(clockHour) {
    return (clockHour >= 8.75 && clockHour < 9.25) || (clockHour >= 12.15 && clockHour < 13.0) || (clockHour >= 14.25 && clockHour < 15.0);
  }

  // Cầu thủ CHỈ được phép vào Nhà làm việc khi có lệnh triệu tập của Chủ tịch hoặc tham dự Sự kiện Ký hợp đồng / Họp báo chính thức!
  isAuthorizedHqVisit(npc) {
    if (!npc || !npc.isPlayer) return true;
    if (npc === this.summonedPlayerNpc) return true;
    return npc.mode === 'going_president' || npc.mode === 'sit_president' || npc.mode === 'event_travel' || npc.mode === 'event_hold';
  }

  setNpcDestination(npc, destX, destZ, options = {}) {
    let targetX = destX;
    let targetZ = destZ;
    let pathOptions = options;
    let needsClone = false;

    if (npc.isPlayer && !this.isAuthorizedHqVisit(npc)) {
      // Nếu đích đến nằm trong Nhà làm việc mà cầu thủ không được triệu tập -> chuyển hướng về Phòng Thay Đồ Mới!
      if (PathfindingSystem.isHqInteriorPoint(targetX, targetZ)) {
        const safeSpot = (npc.restSpot && !PathfindingSystem.isHqInteriorPoint(npc.restSpot.x, npc.restSpot.z))
          ? npc.restSpot
          : { x: 133.5, z: -43.0 };
        targetX = safeSpot.x;
        targetZ = safeSpot.z;
      }
      // Nếu cầu thủ đang ở ngoài Nhà làm việc -> cấm A* cắt đường xuyên qua Nhà làm việc!
      const currentlyInHq = npc.mesh ? PathfindingSystem.isHqInteriorPoint(npc.mesh.position.x, npc.mesh.position.z) : false;
      if (!currentlyInHq && !pathOptions.forbidHqInterior) {
        needsClone = true;
      }
    }

    if (needsClone) {
      pathOptions = { ...options, forbidHqInterior: true };
    }

    // Kiểm tra đi qua cửa phòng riêng tại Player Residence (cầu thủ phải xếp hàng, lại gần mở cửa rồi mới bước vào/ra)
    const resSys = this.trainingSystem?.state?.playerResidenceSystem;
    if (npc.isPlayer && !pathOptions._bypassDoorCheck && npc.mesh && resSys) {
      const nx = npc.mesh.position.x;
      const nz = npc.mesh.position.z;
      const curRoom = resSys.getRoomAtPosition(nx, nz);
      let destRoom = resSys.getRoomAtPosition(targetX, targetZ);

      if (destRoom && !resSys.canNpcEnterRoom(destRoom.roomNumber, npc.playerId)) {
        const fallback = RESIDENCE_LOUNGE_SPOTS[0];
        targetX = fallback.x;
        targetZ = fallback.z;
        destRoom = null;
      }

      if (curRoom && (!destRoom || destRoom.roomNumber !== curRoom.roomNumber)) {
        resSys.setRoomOccupantPresence?.(curRoom.roomNumber, null);
        if (!curRoom.doorOpen) {
          const spots = resSys.getDoorApproachSpots(curRoom);
          if (spots) {
            npc._doorTransition = {
              phase: 'exit_walk',
              roomNumber: curRoom.roomNumber,
              resumeMode: npc.mode,
              resumeState: npc.state,
              resumeDestX: targetX,
              resumeDestZ: targetZ,
              resumeOpts: pathOptions,
              faceRotY: spots.inside.faceRotY,
              timer: 0.78,
              opened: false
            };
            npc.mode = 'door_walk';
            npc.state = 'OPENING_DOOR';
            npc._slotLocked = false;
            this.setNpcDestination(npc, spots.inside.x, spots.inside.z, { ...pathOptions, _bypassDoorCheck: true });
            return;
          }
        } else {
          npc._autoCloseRoomNumber = curRoom.roomNumber;
          npc._autoCloseTimer = 2.6;
        }
      } else if (destRoom && (!curRoom || curRoom.roomNumber !== destRoom.roomNumber)) {
        if (!destRoom.doorOpen) {
          const spots = resSys.getDoorApproachSpots(destRoom);
          if (spots) {
            const dQueueKey = `door_room_${destRoom.roomNumber}`;
            const qEntry = this.activitySystem
              ? this.activitySystem.enqueue(dQueueKey, npc.id, {
                  x: spots.outside.x,
                  z: spots.outside.z,
                  dirX: 0,
                  dirZ: destRoom.side === 'north' ? 1 : -1,
                  spacing: 1.05
                }, this._simClock)
              : null;
            if (qEntry && !qEntry.isHead) {
              npc.queueKey = dQueueKey;
              npc._waitingDoorRoom = destRoom.roomNumber;
              npc._waitingDoorResume = { x: targetX, z: targetZ, opts: pathOptions };
              npc.state = 'WAITING_FOR_DOOR';
              npc._slotLocked = false;
              this.setNpcDestination(npc, qEntry.waitSpot.x, qEntry.waitSpot.z, { ...pathOptions, _bypassDoorCheck: true });
              return;
            }
            npc._doorTransition = {
              phase: 'enter_walk',
              roomNumber: destRoom.roomNumber,
              resumeMode: npc.mode,
              resumeState: npc.state,
              resumeDestX: targetX,
              resumeDestZ: targetZ,
              resumeOpts: pathOptions,
              faceRotY: spots.outside.faceRotY,
              timer: 0.78,
              opened: false
            };
            npc.mode = 'door_walk';
            npc.state = 'GOING_TO_ROOM';
            npc._slotLocked = false;
            this.setNpcDestination(npc, spots.outside.x, spots.outside.z, { ...pathOptions, _bypassDoorCheck: true });
            return;
          }
        } else {
          npc._autoCloseRoomNumber = destRoom.roomNumber;
          npc._autoCloseTimer = 2.8;
        }
      }
    }

    if (npc.finalDest) {
      npc.finalDest.x = targetX;
      npc.finalDest.z = targetZ;
    } else {
      npc.finalDest = { x: targetX, z: targetZ };
    }
    const pts = this.pathfinder.findPath(npc.mesh.position.x, npc.mesh.position.z, targetX, targetZ, pathOptions);
    npc.path = pts;
    npc.pathIdx = 0;
    npc.stuckTimer = 0;
    npc.recoveryAttempts = 0;
    npc._slotLocked = false;
    npc._lod3Dirty = true;
    npc._lod3InTransit = false;
    npc._chairCacheX = NaN;
    if (pts.length > 0) npc.target.set(pts[0].x, 0.14, pts[0].z);
  }

  // Đặt đích logic nhẹ cho NPC ở LOD 3 (không chạy A*, vẫn bảo vệ tuyệt đối quy tắc cấm cầu thủ vào HQ!)
  _setLod3LogicalDestination(npc, destX, destZ) {
    let targetX = destX;
    let targetZ = destZ;
    if (npc.isPlayer && !this.isAuthorizedHqVisit(npc)) {
      if (PathfindingSystem.isHqInteriorPoint(targetX, targetZ)) {
        const safeSpot = (npc.restSpot && !PathfindingSystem.isHqInteriorPoint(npc.restSpot.x, npc.restSpot.z))
          ? npc.restSpot
          : { x: 133.5, z: -43.0 };
        targetX = safeSpot.x;
        targetZ = safeSpot.z;
      }
    }
    if (npc.finalDest) {
      npc.finalDest.x = targetX;
      npc.finalDest.z = targetZ;
    } else {
      npc.finalDest = { x: targetX, z: targetZ };
    }
    if (npc.path && npc.path.length > 0) npc.path.length = 0;
    npc.pathIdx = 0;
    npc.target.set(targetX, 0.14, targetZ);
    const dist = Math.hypot(targetX - npc.mesh.position.x, targetZ - npc.mesh.position.z);
    npc._lod3TransitRemaining = dist / Math.max(1.5, npc.speed || 2.5);
    npc._lod3InTransit = dist > 0.35;
    npc._velX = 0;
    npc._velZ = 0;
    npc._chairCacheX = NaN;
  }

  _routeNpc(npc, destX, destZ, pathOpts = EMPTY_PATH_OPTS, isLod3 = false) {
    if (isLod3) {
      this._setLod3LogicalDestination(npc, destX, destZ);
    } else {
      this.setNpcDestination(npc, destX, destZ, pathOpts);
    }
  }

  dispatchNpcForTask(npcId, resultKey) {
    const npc = this.getById(npcId);
    if (!npc) return null;
    const dest = PathfindingSystem.getTaskTargetRoom(resultKey);
    npc.mode = 'task_travel';
    npc.taskWorkTimer = 14;
    this.setNpcDestination(npc, dest.x, dest.z);
    return dest;
  }

  summonBoardMeeting() {
    this.meetingActive = true;
    const execIds = ['npc_ceo', 'npc_vp', 'npc_sporting', 'npc_coach', 'npc_cfo', 'npc_media', 'npc_mkt', 'npc_legal'];
    for (let i = 0; i < execIds.length; i++) {
      const npc = this.getById(execIds[i]);
      const seat = this.campus.boardroomSeats[i];
      if (npc && seat) {
        this.setNpcDestination(npc, seat.x, seat.z);
        npc.meetingRotY = seat.rotY;
        npc.mode = 'going_meeting';
      }
    }
  }

  endBoardMeeting() {
    this.meetingActive = false;
    for (let i = 0; i < this.npcs.length; i++) {
      const n = this.npcs[i];
      if (n.mode === 'going_meeting' || n.mode === 'meeting') {
        this.setNpcDestination(n, n.home.x, n.home.z);
        n.mode = 'returning';
      }
    }
  }

  summonPlayerToPresidentOffice(playerNameOrId) {
    let npc = this.npcs.find((n) => n.playerId === playerNameOrId || n.name === playerNameOrId);
    if (!npc) npc = this.npcs.find((n) => n.isPlayer);
    if (!npc) return null;
    this.summonedPlayerNpc = npc;
    npc.mode = 'going_president';
    npc.meetingRotY = Math.PI;
    this.setNpcDestination(npc, -26.0, -15.2);
    return npc;
  }

  dismissSummonedPlayer() {
    if (!this.summonedPlayerNpc) return;
    const n = this.summonedPlayerNpc;
    this.setNpcDestination(n, n.home.x, n.home.z);
    n.mode = 'returning';
    this.summonedPlayerNpc = null;
  }

  // Nhân sự/Trưởng bộ phận chủ động lên Phòng Chủ tịch báo cáo tiến độ hoặc vướng mắc
  visitPresidentOfficeForReport(npcId, visitData = null) {
    const npc = this.getById(npcId);
    if (!npc || npc.isPlayer) return null;
    npc.officeVisitData = visitData || null;
    npc.mode = 'going_president';
    npc.meetingRotY = Math.PI;
    this.setNpcDestination(npc, -24.9, -15.2);
    return npc;
  }

  dismissOfficeVisitor(npcId) {
    const npc = this.getById(npcId);
    if (!npc || npc.isPlayer) return false;
    npc.officeVisitData = null;
    if (npc.mode === 'going_president' || npc.mode === 'sit_president') {
      this.setNpcDestination(npc, npc.home.x, npc.home.z);
      npc.mode = 'returning';
    }
    return true;
  }

  // Phân loại 4 tầng Simulation & Animation LOD có trễ (hysteresis 2m chống nhấp nháy ranh giới)
  // KHÔNG BAO GIỜ ghi đè n.mesh.visible (chỉ đọc từ ParcDesPrincesZone.updateStreaming!)
  _computeNpcLod(n, focusPos, playerPos) {
    // Luôn giữ LOD 0 cho NPC đang tham gia Lễ ký kết/Họp báo hoặc đang được Chủ tịch triệu tập
    const resumeMode = n._doorTransition?.resumeMode;
    if (
      n === this.summonedPlayerNpc ||
      n.mode === 'event_travel' ||
      n.mode === 'event_hold' ||
      n.mode === 'going_president' ||
      n.mode === 'sit_president' ||
      resumeMode === 'event_travel' ||
      resumeMode === 'going_president'
    ) {
      return 0;
    }
    if (!n.mesh.visible) return 3;
    if (!focusPos && !playerPos) return 0;

    const nx = n.mesh.position.x;
    const nz = n.mesh.position.z;
    let distSq = Infinity;
    if (focusPos) {
      const dx = nx - focusPos.x;
      const dz = nz - focusPos.z;
      distSq = dx * dx + dz * dz;
    }
    if (playerPos && playerPos !== focusPos) {
      const dxp = nx - playerPos.x;
      const dzp = nz - playerPos.z;
      const pSq = dxp * dxp + dzp * dzp;
      if (pSq < distSq) distSq = pSq;
    }

    const prev = n._lod ?? 0;
    if (prev === 0) {
      if (distSq >= LOD2_OUT_SQ) return 3;
      if (distSq >= LOD1_OUT_SQ) return 2;
      if (distSq >= LOD0_OUT_SQ) return 1;
      return 0;
    }
    if (prev === 1) {
      if (distSq < LOD1_IN_SQ) return 0;
      if (distSq >= LOD2_OUT_SQ) return 3;
      if (distSq >= LOD1_OUT_SQ) return 2;
      return 1;
    }
    if (prev === 2) {
      if (distSq < LOD1_IN_SQ) return 0;
      if (distSq < LOD2_IN_SQ) return 1;
      if (distSq >= LOD2_OUT_SQ) return 3;
      return 2;
    }
    // prev === 3
    if (distSq < LOD1_IN_SQ) return 0;
    if (distSq < LOD2_IN_SQ) return 1;
    if (distSq < LOD3_IN_SQ) return 2;
    return 3;
  }

  _finalizeArrivalMode(n, trainingNow) {
    if (n.mode === 'task_travel') {
      n.mode = 'task_working';
      n.taskWorkTimer = 14;
    } else if (n.mode === 'event_travel') {
      n.mode = 'event_hold';
      if (typeof n.eventTargetRotY === 'number') n.mesh.rotation.y = n.eventTargetRotY;
    } else if (n.mode === 'going_meeting') {
      n.mode = 'meeting';
      n.mesh.rotation.y = n.meetingRotY ?? 0;
    } else if (n.mode === 'going_president') {
      n.mode = 'sit_president';
      n.mesh.rotation.y = Math.PI;
    } else if (n.mode === 'supervise_walk') {
      n.mode = 'supervise';
      n.mesh.rotation.y = Math.PI;
      n.timer = 4.5;
    } else if (n.mode === 'coach_walk') {
      n.mode = 'coach_drill';
      n.mesh.rotation.y = Math.PI;
      n.timer = 5.0;
    } else if (n.mode === 'curtain_walk') {
      n.mode = 'curtain_action';
      if (n.curtainTask) {
        n.mesh.rotation.y = n.curtainTask.faceRotY;
        n.curtainTask.actionTimer = 1.5;
        n.curtainTask.applied = false;
      }
    } else if (n.mode === 'door_walk') {
      n.mode = 'door_action';
      n.state = 'OPENING_DOOR';
      if (n._doorTransition) {
        if (typeof n._doorTransition.faceRotY === 'number') {
          n.mesh.rotation.y = n._doorTransition.faceRotY;
        }
        n._doorTransition.timer = 0.78;
        n._doorTransition.opened = false;
      }
    } else if (n.mode === 'returning') {
      const homeChair = this.campus?.hasChairAt ? this.campus.hasChairAt(n.home.x, n.home.z, 0.78) : false;
      n.mode = n.isPlayer ? (trainingNow ? 'train' : 'rest') : (homeChair ? 'work_pc' : 'stand_duty');
      n.state = n.isPlayer ? (trainingNow ? 'TRAINING' : 'RESTING') : 'IDLE';
      n.mesh.rotation.y = n.seatRotY;
    }
  }

  // Hoàn tất vị trí logic an toàn khi đến đích trong LOD 3 (bảo toàn 100% quy tắc cấm cầu thủ vào HQ!)
  _completeLod3Arrival(n, trainingNow) {
    if (!n.finalDest) return;
    let tx = n.finalDest.x;
    let tz = n.finalDest.z;
    if (n.isPlayer && !this.isAuthorizedHqVisit(n) && PathfindingSystem.isHqInteriorPoint(tx, tz)) {
      const safeSpot = (n.restSpot && !PathfindingSystem.isHqInteriorPoint(n.restSpot.x, n.restSpot.z))
        ? n.restSpot
        : { x: 133.5, z: -43.0 };
      tx = safeSpot.x;
      tz = safeSpot.z;
      n.finalDest.x = tx;
      n.finalDest.z = tz;
    }
    n.mesh.position.x = tx;
    n.mesh.position.y = 0.14;
    n.mesh.position.z = tz;
    n.target.set(tx, 0.14, tz);
    n.lastPosX = tx;
    n.lastPosZ = tz;
    n._velX = 0;
    n._velZ = 0;
    if (n.path && n.path.length > 0) n.path.length = 0;
    n.pathIdx = 0;
    n._lod3InTransit = false;
    n._lod3TransitRemaining = 0;
    n._chairCacheX = NaN;
    if (n.mode === 'door_walk' && n._doorTransition) {
      const tr = n._doorTransition;
      n._doorTransition = null;
      n.mode = tr.resumeMode || 'rest';
      tx = tr.resumeDestX;
      tz = tr.resumeDestZ;
      n.mesh.position.set(tx, 0.14, tz);
      n.target.set(tx, 0.14, tz);
      n.finalDest.x = tx;
      n.finalDest.z = tz;
      n.lastPosX = tx;
      n.lastPosZ = tz;
    }
    this._finalizeArrivalMode(n, trainingNow);
    const resSys = this.trainingSystem?.state?.playerResidenceSystem;
    if (n.isPlayer && resSys && n.playerId) {
      const rm = resSys.getRoomForPlayer(n.playerId);
      if (rm && rm.doorOpen && rm.lastDoorAction?.by !== 'player') {
        resSys.setRoomDoorState(rm.roomNumber, false, { by: 'npc', npcId: n.id, npcName: n.name, immediate: true });
      }
    }
  }

  // Khôi phục liền mạch vị trí, trạng thái, đạo cụ & tư thế ghế 3D khi NPC chuyển từ LOD 3 -> LOD 0/1/2
  _restoreFromLod3(n, newLod, trainingNow) {
    if (n._lod3InTransit && n.finalDest) {
      if (n._lod3TransitRemaining <= 0) {
        this._completeLod3Arrival(n, trainingNow);
      } else {
        // Vẫn đang trên đường di chuyển -> lập lộ trình thật từ vị trí hiện tại tới đích
        this.setNpcDestination(n, n.finalDest.x, n.finalDest.z, newLod === 2 ? SKIP_LOCAL_GRID_OPTS : EMPTY_PATH_OPTS);
      }
    } else if (n.isPlayer && !this.isAuthorizedHqVisit(n) && PathfindingSystem.isHqInteriorPoint(n.mesh.position.x, n.mesh.position.z)) {
      // Bảo vệ tuyệt đối: không bao giờ khôi phục cầu thủ trái phép trong HQ
      const safeSpot = n.restSpot || { x: 133.5, z: -43.0 };
      n.mesh.position.set(safeSpot.x, 0.14, safeSpot.z);
      n.target.set(safeSpot.x, 0.14, safeSpot.z);
      n.lastPosX = safeSpot.x;
      n.lastPosZ = safeSpot.z;
    }
    n._lod3InTransit = false;
    n._accDt = 0;
    n.stuckTimer = 0;
    n._chairCacheX = NaN;

    if (n.mesh.userData?.coachProp) {
      n.mesh.userData.coachProp.visible = COACH_PROP_STATES.has(n.drillAnim || n.mode);
    }
    // Đồng bộ ngay tư thế ghế 3D nếu đang đứng yên tại bàn/phòng họp
    if (n.mode === 'work_pc' || n.mode === 'meeting' || n.mode === 'sit_president') {
      const reqAnim = n.mode === 'work_pc' ? (n.id === 'npc_sec' ? 'idle' : 'work_pc') : 'sit';
      const safeAnim = this.resolveSafePosture(n, reqAnim);
      this.animSystem.updateRig(n.mesh, safeAnim, 0.016, 1.0, newLod);
    }
  }

  // Cập nhật theo lịch/sự kiện cho NPC ở LOD 3 (đồng bộ 100% lịch sinh hoạt 24h & thể lực theo clockHour!)
  _updateNpcLod3(n, stepDt, trainingNow, drNow, clockHour) {
    if (n.mesh.userData?.coachProp) {
      n.mesh.userData.coachProp.visible = COACH_PROP_STATES.has(n.drillAnim || n.mode);
    }

    // 1. Toàn bộ Nhân sự CLB (HLV trưởng, BHL, Y tế, An ninh, Giám đốc, Nhân viên)
    if (!n.isPlayer) {
      this._tickStaffDailySchedule(n, stepDt, clockHour, trainingNow, drNow, SKIP_LOCAL_GRID_OPTS, true);
    }

    // 2. Cầu thủ đội một (dùng CHUNG AI lịch sinh hoạt 24h & thể lực với LOD 0..2!)
    if (n.isPlayer && n !== this.summonedPlayerNpc && n.mode !== 'going_president' && n.mode !== 'sit_president' && n.mode !== 'event_travel' && n.mode !== 'event_hold') {
      const resSys = this.trainingSystem?.state?.playerResidenceSystem;
      const pObj = this.trainingSystem?.state?.getPlayerById?.(n.playerId);
      const isInjured = !!(pObj && (pObj.injuryDays || 0) > 0);
      if (isInjured) {
        n.mode = 'medical_rehab';
        n.state = 'MEDICAL_CHECK';
      } else {
        this._tickPlayerDailySchedule(n, stepDt, clockHour, trainingNow, drNow, this._lastPlayerPos || null, SKIP_LOCAL_GRID_OPTS, resSys, pObj, true);
      }
    }
    if (n.isPlayer) {
      this._syncPlayerNpcKit(n, null, trainingNow, drNow, clockHour);
      if (this._shouldEvalCurtains) {
        this._tickResidenceRoomComfort(n, clockHour, this._lastPlayerPos || null, stepDt, true);
      }
      this._tickPlayerVitals(n, stepDt, clockHour);
    }

    // Kiểm tra NPC được hệ thống ngoài đổi đích logic khi đang ở LOD 3
    if (!n._lod3InTransit && n.finalDest) {
      const dx = n.finalDest.x - n.mesh.position.x;
      const dz = n.finalDest.z - n.mesh.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > 0.64) {
        n._lod3TransitRemaining = Math.sqrt(distSq) / Math.max(1.5, n.speed || 2.5);
        n._lod3InTransit = true;
      }
    }

    if (n._lod3InTransit) {
      n._lod3TransitRemaining -= stepDt;
      if (n._lod3TransitRemaining <= 0) {
        this._completeLod3Arrival(n, trainingNow);
      }
      return;
    }

    if (n.mode === 'task_working') {
      n.taskWorkTimer -= stepDt;
      if (n.taskWorkTimer <= 0) {
        n.mode = 'returning';
        this._setLod3LogicalDestination(n, n.home.x, n.home.z);
      }
    }
  }

  // Bước di chuyển lõi phân tầng theo LOD (LOD 0: full steering + whiskers + avoidance; LOD 1: spatial avoidance, whiskers chỉ khi kẹt; LOD 2: waypoint trực tiếp không raycast)
  moveNpcTowardTarget(n, dt, playerPos, lod = 0) {
    const dx = n.target.x - n.mesh.position.x;
    const dz = n.target.z - n.mesh.position.z;
    const distSq = dx * dx + dz * dz;
    if (distSq <= 0.28 * 0.28) return false;
    const dist = Math.sqrt(distSq);

    if (n.waitTimer > 0) {
      n.waitTimer -= dt;
      n._velX = 0;
      n._velZ = 0;
      if (lod <= 1) this.animSystem.updateRig(n.mesh, 'idle', dt, 1.0, lod);
      return true;
    }

    const dirX = dx / dist;
    const dirZ = dz / dist;

    let vx, vz, waiting = false, avoidReason = 'NONE';
    if (lod <= 1) {
      this._avoidOpts.useSpatialGrid = true;
      this._avoidOpts.skipWhiskers = (lod === 1 && n.stuckTimer <= 0.35) || (n.mode === 'door_walk' && dist < 1.25);
      this._avoidOpts.respectClosedDoors = !(n.mode === 'door_walk' && dist < 1.25);
      const av = this.pathfinder.computeAvoidanceVelocity(n, dirX, dirZ, n.speed, this.npcs, playerPos, this._avoidOpts);
      vx = av.vx;
      vz = av.vz;
      waiting = av.waiting;
      avoidReason = av.avoidanceReason || (waiting ? 'WAITING' : 'NONE');
    } else {
      // LOD 2 (xa): di chuyển thẳng theo waypoint, KHÔNG raycast avoidance
      vx = dirX * n.speed;
      vz = dirZ * n.speed;
    }

    n.avoidanceState = avoidReason;
    if (waiting) {
      n.waitTimer = 0.45;
      n._velX = 0;
      n._velZ = 0;
      n.lastBlockedAt = this._simClock;
      n.state = avoidReason === 'YIELDING' ? 'AVOIDING_NPC' : 'AVOIDING_OBSTACLE';
      if (lod <= 1) this.animSystem.updateRig(n.mesh, 'idle', dt, 1.0, lod);
      return true;
    }
    if (avoidReason === 'BRAKING' || avoidReason === 'SIDESTEPPING') {
      n.lastBlockedAt = this._simClock;
    }

    const stepDist = Math.hypot(vx * dt, vz * dt);
    const clampedFactor = stepDist > dist ? dist / Math.max(0.0001, stepDist) : 1.0;
    const rawX = n.mesh.position.x + vx * dt * clampedFactor;
    const rawZ = n.mesh.position.z + vz * dt * clampedFactor;

    const curInHq = PathfindingSystem.isHqInteriorPoint(n.mesh.position.x, n.mesh.position.z);
    let nextX = rawX;
    let nextZ = rawZ;
    if (lod <= 1 && this.campus) {
      const res = this.campus.resolveCollision(rawX, rawZ, n.collisionRadius || 0.34);
      nextX = res.x;
      nextZ = res.z;
    }

    // Hàng rào cứng (áp dụng cho MỌI LOD!): Cầu thủ không có lệnh triệu tập / sự kiện TUYỆT ĐỐI KHÔNG được bước chân vào Nhà làm việc!
    if (n.isPlayer && !this.isAuthorizedHqVisit(n) && !curInHq && PathfindingSystem.isHqInteriorPoint(nextX, nextZ)) {
      n._velX = 0;
      n._velZ = 0;
      const safeSpot = n.restSpot || { x: 133.5, z: -43.0 };
      this.setNpcDestination(n, safeSpot.x, safeSpot.z, lod === 2 ? SKIP_LOCAL_GRID_OPTS : EMPTY_PATH_OPTS);
      return false;
    }

    const movedX = nextX - n.mesh.position.x;
    const movedZ = nextZ - n.mesh.position.z;
    const movedDist = Math.hypot(movedX, movedZ);
    n.mesh.position.x = nextX;
    n.mesh.position.y = 0.14;
    n.mesh.position.z = nextZ;
    n._velX = vx;
    n._velZ = vz;
    n._chairCacheX = NaN;

    // Quay mặt mượt theo hướng di chuyển thực tế
    if (movedDist > 0.004) {
      const targetYaw = Math.atan2((nextX - n.lastPosX) || vx, (nextZ - n.lastPosZ) || vz);
      n.mesh.rotation.y = lerpAngle(n.mesh.rotation.y, targetYaw, dt * 10);
      n.stuckTimer = Math.max(0, n.stuckTimer - dt * 1.5);
      if (movedDist > 0.03) n.recoveryAttempts = 0;
    } else if (lod <= 1) {
      n.stuckTimer += dt;
    }
    n.lastPosX = nextX;
    n.lastPosZ = nextZ;

    if (n.replanCooldown > 0) n.replanCooldown -= dt;

    // Chống kẹt đa tầng (STUCK_RECOVERY): A* toàn tuyến -> lách ngang -> đổi điểm dự phòng an toàn
    if (lod <= 1 && n.stuckTimer > 0.85 && n.replanCooldown <= 0) {
      n.stuckTimer = 0;
      n.replanCooldown = 1.4;
      n.recoveryAttempts = (n.recoveryAttempts || 0) + 1;
      n.stuckLogCount = (n.stuckLogCount || 0) + 1;
      n.state = 'STUCK_RECOVERY';

      if (n.mode === 'roam') {
        n.mode = 'work_pc';
        this.setNpcDestination(n, n.home.x, n.home.z);
      } else if (n.recoveryAttempts >= 3 && n.isPlayer) {
        // Fallback an toàn khi bị bít hoàn toàn 2 lần
        n.recoveryAttempts = 0;
        this.activitySystem?.releaseNpc?.(n.id);
        n.activePointId = null;
        n.queueKey = null;
        const alt = RESIDENCE_LOUNGE_SPOTS[Math.abs(n._decisionSeed || 0) % RESIDENCE_LOUNGE_SPOTS.length];
        this.setNpcDestination(n, alt.x, alt.z, EMPTY_PATH_OPTS);
      } else if (n.finalDest) {
        if (n.recoveryAttempts === 2 && this.campus) {
          // Thử dịch nhẹ sang cạnh thông thoáng gần nhất trước khi lập lộ trình lại
          const perpX = -dirZ;
          const perpZ = dirX;
          for (const sign of [1, -1]) {
            const cx = nextX + perpX * 0.65 * sign;
            const cz = nextZ + perpZ * 0.65 * sign;
            if (!this.pathfinder.isPointBlocked(cx, cz, 0.34, true)) {
              n.mesh.position.x = cx;
              n.mesh.position.z = cz;
              break;
            }
          }
        }
        const altPath = this.pathfinder.findPath(n.mesh.position.x, n.mesh.position.z, n.finalDest.x, n.finalDest.z, EMPTY_PATH_OPTS);
        if (altPath.length > 0) {
          n.path = altPath;
          n.pathIdx = 0;
          n.target.set(altPath[0].x, 0.14, altPath[0].z);
        }
      }
    }

    // Hoạt ảnh bước chân đồng bộ vận tốc thực & LOD tier (khi gần như đứng yên thì không trượt chân)
    const actualSpeed = dt > 0.0001 ? movedDist / dt : n.speed;
    let animState = 'idle';
    if (actualSpeed > 0.12) {
      animState = n.isPlayer && (n.mode === 'train' || n.mode === 'drill')
        ? (n.speed > 4.2 ? 'run' : 'train')
        : 'walk';
    }
    const speedFactor = animState === 'run'
      ? Math.max(0.75, Math.min(1.35, actualSpeed / 4.6))
      : Math.max(0.6, Math.min(1.25, actualSpeed / 2.6));
    this.animSystem.updateRig(n.mesh, animState, Math.min(0.1, dt), speedFactor, lod);
    return true;
  }

  update(dt, playerPos, clockHour = 9.5, onScheduleToast = null, coachName = 'Luis Enrique', options = null) {
    this._frameCounter = (this._frameCounter + 1) & 0x3fffffff;
    this._simClock += dt;
    this._lastPlayerPos = playerPos || null;
    this._curtainEvalTimer += dt;
    if (this._curtainEvalTimer >= 1.4) {
      this._curtainEvalTimer = 0;
      this._shouldEvalCurtains = true;
    } else {
      this._shouldEvalCurtains = false;
    }
    const trainingNow = this.isTrainingHour(clockHour);
    const drNow = this.isDressingRoomHour(clockHour);

    const trainingChanged = this.wasTraining !== null && trainingNow !== this.wasTraining;
    const drChanged = this._wasDrNow !== null && drNow !== this._wasDrNow;
    const meetingChanged = this.meetingActive !== this._wasMeetingActive;
    const scheduleEdge = trainingChanged || drChanged || meetingChanged;

    if (trainingChanged) {
      this.wasTraining = trainingNow;
      if (onScheduleToast) {
        onScheduleToast(trainingNow
          ? `⚽ Đã đến giờ tập! HLV ${coachName} và toàn đội PSG đã ra Trung tâm Huấn luyện PSG tập luyện 3D.`
          : `☕ Kết thúc ca tập tại PSG Training Center! Đội một PSG về Phòng Thay Đồ & Khu Nghỉ Dưỡng phục hồi.`);
      }
    } else if (this.wasTraining === null) {
      this.wasTraining = trainingNow;
    }
    this._wasDrNow = drNow;
    this._wasMeetingActive = this.meetingActive;

    const focusPos = (options && options.focusPos) || playerPos || null;
    const lodStrideMult = Math.max(0.5, Math.min(4.0, (options && typeof options.lodStrideMultiplier === 'number') ? options.lodStrideMultiplier : 1.0));
    const stride1 = Math.max(1, Math.round(2 * lodStrideMult));
    const stride2 = Math.max(2, Math.round(6 * lodStrideMult));

    // Xác định vùng sân tập PSG TRAINING PITCH (tâm 192, -86) có đang active (người chơi ở gần Khu Huấn Luyện) không
    let trainingZoneActive = true;
    if (options && typeof options.trainingPitchVisible === 'boolean') {
      trainingZoneActive = options.trainingPitchVisible;
    } else if (focusPos) {
      const sdx = focusPos.x - 192.0;
      const sdz = focusPos.z + 86.0;
      trainingZoneActive = (sdx * sdx + sdz * sdz) <= STADIUM_ACTIVE_RADIUS_SQ;
    }

    // Cập nhật lịch tập & bóng 3D (ở LOD 3 chỉ giữ kiểm tra lịch/báo cáo 12:00 & sự kiện đổi bài tập)
    if (this.trainingSystem) {
      this.trainingSystem.update3DTraining(dt, clockHour, this.npcs, this, trainingZoneActive);
    }

    // Dựng lại NPC Spatial Hash 1 lần/frame cho Local Avoidance O(1)
    this.pathfinder.rebuildNpcSpatialGrid(this.npcs);

    this.lodCounts[0] = 0;
    this.lodCounts[1] = 0;
    this.lodCounts[2] = 0;
    this.lodCounts[3] = 0;

    // Bảo đảm ở tốc độ cao (x2, x4) bước di chuyển vẫn được chia nhỏ <= 0.05s để không xuyên tường/vật cản!
    const subCount = dt > 0.05 ? Math.min(4, Math.ceil(dt / 0.05)) : 1;
    const stepBaseDt = dt / subCount;
    const npcs = this.npcs;
    const frameCounter = this._frameCounter;

    for (let sub = 0; sub < subCount; sub++) {
      if (sub > 0) this.pathfinder.rebuildNpcSpatialGrid(npcs);
      const isPrimarySub = sub === 0;
      if (isPrimarySub) {
        this.lodCounts[0] = 0;
        this.lodCounts[1] = 0;
        this.lodCounts[2] = 0;
        this.lodCounts[3] = 0;
      }

      for (let idx = 0; idx < npcs.length; idx++) {
        const n = npcs[idx];
        if (!n.mesh) continue;

        let lod = n._lod ?? 0;
        if (isPrimarySub) {
          const prevLod = lod;
          lod = this._computeNpcLod(n, focusPos, playerPos);
          n._lod = lod;
          this.lodCounts[lod]++;

          // Chuyển từ LOD 3 -> LOD 0/1/2: khôi phục liền mạch vị trí, trạng thái & tư thế ghế 3D!
          if (prevLod === 3 && lod < 3) {
            this._restoreFromLod3(n, lod, trainingNow);
          }

          // LOD 3 (ngoài vùng hoạt động / đã bị culling): chỉ cập nhật theo lịch & sự kiện (~1.6Hz)
          if (lod === 3) {
            n._lod3Timer = (n._lod3Timer || 0) + dt;
            if (scheduleEdge || n._lod3Dirty || n._lod3Timer >= 0.6) {
              const lod3Dt = n._lod3Timer;
              n._lod3Timer = 0;
              n._lod3Dirty = false;
              this._updateNpcLod3(n, lod3Dt, trainingNow, drNow, clockHour);
            }
            continue;
          }
        } else if (lod === 3) {
          continue;
        }

        // Phân tầng tần suất cập nhật cho LOD 0 / LOD 1 / LOD 2 với accumulated dt
        let stepDt = stepBaseDt;
        if (lod === 1) {
          n._accDt = (n._accDt || 0) + stepBaseDt;
          if (!scheduleEdge && ((frameCounter + sub + idx) % stride1) !== 0) continue;
          stepDt = Math.min(0.06, n._accDt);
          n._accDt = 0;
        } else if (lod === 2) {
          n._accDt = (n._accDt || 0) + stepBaseDt;
          if (!scheduleEdge && ((frameCounter + sub + idx) % stride2) !== 0) continue;
          stepDt = Math.min(0.10, n._accDt);
          n._accDt = 0;
        } else {
          n._accDt = 0;
        }

        const pathOpts = lod === 2 ? SKIP_LOCAL_GRID_OPTS : EMPTY_PATH_OPTS;

        // Ẩn/hiện bảng chiến thuật hoặc tablet của BHL (tra cứu Set O(1), không cấp phát mảng)
        if (n.mesh.userData?.coachProp) {
          n.mesh.userData.coachProp.visible = COACH_PROP_STATES.has(n.drillAnim || n.mode);
        }

        // 1 & 2. Hành vi Toàn bộ Nhân sự CLB (HLV trưởng, BHL, Y tế, An ninh, Giám đốc, Nhân viên)
        if (!n.isPlayer) {
          this._tickStaffDailySchedule(n, stepDt, clockHour, trainingNow, drNow, pathOpts, false);
        }

        // 3. Hành vi Cầu thủ đội một (Lịch sinh hoạt 24h cá nhân hóa + Phòng riêng + Activity Points + Y tế/Gym/Ăn uống)
        if (n.isPlayer && n !== this.summonedPlayerNpc && n.mode !== 'going_president' && n.mode !== 'sit_president' && n.mode !== 'event_travel' && n.mode !== 'event_hold' && n.mode !== 'medical_rehab') {
          const resSys = this.trainingSystem?.state?.playerResidenceSystem;
          const pObj = this.trainingSystem?.state?.getPlayerById?.(n.playerId);
          const isInjured = !!(pObj && (pObj.injuryDays || 0) > 0);
          if (isInjured) {
            n.mode = 'medical_rehab';
            n.state = 'MEDICAL_CHECK';
          } else {
            this._tickPlayerDailySchedule(n, stepDt, clockHour, trainingNow, drNow, playerPos, pathOpts, resSys, pObj, false);
          }
        }
        if (n.isPlayer) {
          this._syncPlayerNpcKit(n, null, trainingNow, drNow, clockHour);
          this._tickResidenceRoomComfort(n, clockHour, playerPos, stepDt, false);
          this._tickPlayerVitals(n, stepDt, clockHour);
        }

        // 4. Thực hiện bước di chuyển phân tầng theo LOD
        const stillMoving = this.moveNpcTowardTarget(n, stepDt, playerPos, lod);
        if (stillMoving) continue;

        // 5. Đã tới điểm trung gian -> chuyển điểm kế tiếp bằng con trỏ pathIdx (Zero-GC, không path.shift()!)
        if (n.path && n.pathIdx + 1 < n.path.length) {
          n.pathIdx++;
          const nextWp = n.path[n.pathIdx];
          n.target.set(nextWp.x, 0.14, nextWp.z);
          continue;
        }
        if (n.path && n.path.length > 0) {
          n.path.length = 0;
          n.pathIdx = 0;
        }
        n._velX = 0;
        n._velZ = 0;
        n.avoidanceState = 'NONE';

        // 6. Xử lý trạng thái khi tới đích
        const animDt = Math.min(0.1, stepDt);
        const animateStationary = lod <= 1;

        if (n.mode === 'task_travel') {
          n.mode = 'task_working';
          n.taskWorkTimer = 14;
        } else if (n.mode === 'task_working') {
          n.taskWorkTimer -= stepDt;
          if (animateStationary) this.animSystem.updateRig(n.mesh, 'talk', animDt, 1.0, lod);
          if (n.taskWorkTimer <= 0) {
            n.mode = 'returning';
            this.setNpcDestination(n, n.home.x, n.home.z, pathOpts);
          }
          continue;
        }

        if (n.mode === 'event_travel') {
          n.mode = 'event_hold';
          if (typeof n.eventTargetRotY === 'number') n.mesh.rotation.y = n.eventTargetRotY;
        } else if (n.mode === 'event_hold') {
          if (typeof n.eventTargetRotY === 'number') n.mesh.rotation.y = lerpAngle(n.mesh.rotation.y, n.eventTargetRotY, animDt * 8);
          const safeAnim = this.resolveSafePosture(n, n.eventAnim || 'sit');
          this.animSystem.updateRig(n.mesh, safeAnim, animDt, 1.0, lod);
          continue;
        }

        this._finalizeArrivalMode(n, trainingNow);

        if (n.mode === 'supervise') {
          n.mesh.rotation.y = lerpAngle(n.mesh.rotation.y, Math.PI, animDt * 6);
          n.timer -= stepDt;
          if (n.timer <= 0) {
            n.timer = 5.5 + Math.random() * 4.5;
            n.coachWaypointIdx = (n.coachWaypointIdx + 1) % COACH_SIDELINE_SPOTS.length;
            const wp = COACH_SIDELINE_SPOTS[n.coachWaypointIdx];
            this.setNpcDestination(n, wp.x, wp.z, pathOpts);
            n.mode = 'supervise_walk';
          }
          if (animateStationary) this.animSystem.updateRig(n.mesh, n.drillAnim || 'supervise', animDt, 1.0, lod);
        } else if (n.mode === 'coach_drill') {
          n.timer -= stepDt;
          if (n.timer <= 0 && n.pitchSpot) {
            n.timer = 5.0 + Math.random() * 5.0;
            const ox = (Math.random() - 0.5) * 5.0;
            const oz = (Math.random() - 0.5) * 4.0;
            this.setNpcDestination(n, n.pitchSpot.x + ox, n.pitchSpot.z + oz, pathOpts);
            n.mode = 'coach_walk';
          }
          if (animateStationary) {
            const roleAnim = n.drillAnim || (
              n.roleKey === 'tactical_coach' ? 'clipboard'
                : n.roleKey === 'tactical_analyst' || n.roleKey === 'performance_analyst' ? 'tablet'
                  : n.roleKey === 'fitness_coach' || n.roleKey === 'technical_coach' ? 'instruct'
                    : 'observe'
            );
            this.animSystem.updateRig(n.mesh, roleAnim, animDt, 1.0, lod);
          }
        } else if (n.mode === 'meeting' || n.mode === 'sit_president') {
          n.mesh.rotation.y = n.mode === 'sit_president' ? Math.PI : (n.meetingRotY ?? 0);
          const safeAnim = this.resolveSafePosture(n, 'sit');
          if (animateStationary) this.animSystem.updateRig(n.mesh, safeAnim, animDt, 1.0, lod);
        } else if (n.isPlayer && (n.mode === 'train' || n.mode === 'drill')) {
          if (n.drillAnim) {
            if (animateStationary) this.animSystem.updateRig(n.mesh, n.drillAnim, animDt, 1.0, lod);
          } else {
            n.timer -= stepDt;
            if (n.timer <= 0) {
              n.timer = 2.4 + Math.random() * 3.0;
              n.target.set(
                Math.max(162, Math.min(222, n.home.x + (Math.random() - 0.5) * 16)),
                0.14,
                Math.max(-106, Math.min(-66, n.home.z + (Math.random() - 0.5) * 12))
              );
            }
            if (animateStationary) this.animSystem.updateRig(n.mesh, 'train', animDt, 1.0, lod);
          }
        } else if (n.isPlayer && n.mode === 'door_action') {
          const tr = n._doorTransition;
          if (!tr) {
            n.mode = 'rest';
            n.state = 'INSIDE_ROOM';
          } else {
            if (typeof tr.faceRotY === 'number') {
              n.mesh.rotation.y = lerpAngle(n.mesh.rotation.y, tr.faceRotY, animDt * 10);
            }
            tr.timer -= stepDt;
            if (!tr.opened && tr.timer <= 0.60) {
              tr.opened = true;
              const resSys = this.trainingSystem?.state?.playerResidenceSystem;
              if (resSys) {
                resSys.setRoomDoorState(tr.roomNumber, true, {
                  by: 'npc',
                  npcId: n.id,
                  npcName: n.name,
                  clockHour
                });
              }
            }
            if (animateStationary) this.animSystem.updateRig(n.mesh, 'open_door', animDt, 1.0, lod);
            if (tr.timer <= 0) {
              n._doorTransition = null;
              n.mode = tr.resumeMode || 'rest';
              n.state = tr.phase === 'enter_walk' ? 'ENTERING_ROOM' : (tr.resumeState || 'WALKING');
              this.activitySystem?.dequeue?.(`door_room_${tr.roomNumber}`, n.id);
              n._autoCloseRoomNumber = tr.roomNumber;
              n._autoCloseTimer = 2.6;
              const resSys = this.trainingSystem?.state?.playerResidenceSystem;
              if (tr.phase === 'enter_walk' && resSys) {
                resSys.setRoomOccupantPresence?.(tr.roomNumber, n.playerId || n.id);
              }
              this.setNpcDestination(n, tr.resumeDestX, tr.resumeDestZ, {
                ...(tr.resumeOpts || {}),
                _bypassDoorCheck: true
              });
            }
          }
        } else if (n.isPlayer && n.mode === 'curtain_action') {
          if (!n.curtainTask) {
            n.mode = 'rest';
            n.state = 'INSIDE_ROOM';
          } else {
            n.mesh.rotation.y = lerpAngle(n.mesh.rotation.y, n.curtainTask.faceRotY, animDt * 10);
            n.curtainTask.actionTimer -= stepDt;
            if (!n.curtainTask.applied && n.curtainTask.actionTimer <= 0.85) {
              n.curtainTask.applied = true;
              const resSys = this.trainingSystem?.state?.playerResidenceSystem;
              if (resSys && resSys.canNpcEnterRoom(n.curtainTask.roomNumber, n.playerId)) {
                resSys.setRoomCurtainState(n.curtainTask.roomNumber, n.curtainTask.targetState, {
                  by: 'npc',
                  npcId: n.id,
                  npcName: n.name,
                  reason: n.curtainTask.reason,
                  clockHour
                });
              }
            }
            if (animateStationary) this.animSystem.updateRig(n.mesh, 'pull_curtain', animDt, 1.0, lod);
            if (n.curtainTask.actionTimer <= 0) {
              n.curtainTask = null;
              n.mode = 'rest';
              const activePt = n.activePointId ? this.activitySystem?.getPoint?.(n.activePointId) : null;
              if (activePt) {
                n.state = activePt.interactionType === 'sleep' ? 'SLEEPING'
                  : activePt.interactionType === 'watch_tv' ? 'WATCHING_TV'
                  : 'INSIDE_ROOM';
                this.setNpcDestination(n, activePt.standPosition.x, activePt.standPosition.z, pathOpts);
              } else {
                n.state = 'INSIDE_ROOM';
                const rSpot = this._getPlayerResidenceSpot(n);
                this.setNpcDestination(n, rSpot.x, rSpot.z, pathOpts);
              }
            }
          }
        } else if (n.isPlayer && (n.mode === 'rest' || n.mode === 'dressing' || n.mode === 'medical_rehab')) {
          // Kiểm tra nếu đang chờ ở cửa phòng -> khi cửa trống hoặc thành người đứng đầu hàng đợi thì tiếp tục bước vào
          if (n.state === 'WAITING_FOR_DOOR' && n._waitingDoorRoom && n._waitingDoorResume) {
            const dKey = `door_room_${n._waitingDoorRoom}`;
            const isHead = this.activitySystem ? this.activitySystem.isQueueHead(dKey, n.id) : true;
            const resSys = this.trainingSystem?.state?.playerResidenceSystem;
            const roomObj = resSys?.getRoomByNumber?.(n._waitingDoorRoom);
            if (isHead && roomObj && !roomObj.doorBusyByNpcId) {
              const resume = n._waitingDoorResume;
              n._waitingDoorRoom = null;
              n._waitingDoorResume = null;
              n.queueKey = null;
              n.state = 'GOING_TO_ROOM';
              this.setNpcDestination(n, resume.x, resume.z, resume.opts || pathOpts);
            } else if (animateStationary) {
              this.animSystem.updateRig(n.mesh, 'idle', animDt, 1.0, lod);
            }
            continue;
          }

          const actPt = n.activePointId ? this.activitySystem?.getPoint?.(n.activePointId) : null;
          if (actPt) {
            const nearStand = Math.hypot(n.mesh.position.x - actPt.standPosition.x, n.mesh.position.z - actPt.standPosition.z) < 0.78;
            if (nearStand) {
              this.activitySystem.occupyPoint(actPt.activityPointId, n.id);
              n._slotLocked = ACTIVITY_LOCKED_ANIMS.has(actPt.animation);
              if (n._slotLocked) {
                n.mesh.position.x = actPt.position.x;
                n.mesh.position.z = actPt.position.z;
                n.mesh.position.y = actPt.elevatedY ?? 0.14;
              }
              n.mesh.rotation.y = lerpAngle(n.mesh.rotation.y, actPt.direction ?? 0, animDt * 8);
              const resolvedAnim = actPt.animation || 'idle';
              if (actPt.interactionType === 'sleep') n.state = 'SLEEPING';
              else if (actPt.interactionType === 'watch_tv') n.state = 'WATCHING_TV';
              else if (actPt.interactionType === 'eat') n.state = 'EATING';
              else if (actPt.interactionType === 'socialize' || actPt.interactionType === 'talk') n.state = 'SOCIALIZING';
              else if (actPt.interactionType.startsWith('gym_')) n.state = 'GOING_TO_GYM';
              else if (actPt.interactionType === 'recovery_bed' || actPt.interactionType === 'physio' || actPt.interactionType === 'cryo' || actPt.interactionType === 'ice_tub') n.state = 'RECOVERY';
              else if (actPt.interactionType === 'medical_exam' || actPt.interactionType === 'biometrics') n.state = 'MEDICAL_CHECK';
              else if (actPt.area === 'residence_room') n.state = 'INSIDE_ROOM';
              else n.state = 'RESTING';

              if (animateStationary) {
                const safeAnim = SITTING_ANIMS.has(resolvedAnim) ? this.resolveSafePosture(n, resolvedAnim) : resolvedAnim;
                this.animSystem.updateRig(n.mesh, safeAnim, animDt, 1.0, lod);
              }
            } else {
              if (animateStationary) this.animSystem.updateRig(n.mesh, n.mode === 'dressing' ? 'talk' : 'idle', animDt, 1.0, lod);
            }
          } else if (n.mode === 'medical_rehab') {
            if (animateStationary) this.animSystem.updateRig(n.mesh, n.drillAnim || 'idle', animDt, 1.0, lod);
          } else {
            if (animateStationary) this.animSystem.updateRig(n.mesh, n.mode === 'dressing' ? 'talk' : 'idle', animDt, 1.0, lod);
          }
        } else {
          // Tư thế đứng/ngồi tại trạm làm việc của nhân sự
          if (n.mode === 'work_pc') {
            n.mesh.rotation.y = lerpAngle(n.mesh.rotation.y, n._targetRotY ?? n.seatRotY, animDt * 8);
          } else if (typeof n._targetRotY === 'number') {
            n.mesh.rotation.y = lerpAngle(n.mesh.rotation.y, n._targetRotY, animDt * 8);
          }
          if (animateStationary) {
            let closeToPlayer = false;
            if (playerPos) {
              const pdx = n.mesh.position.x - playerPos.x;
              const pdz = n.mesh.position.z - playerPos.z;
              closeToPlayer = (pdx * pdx + pdz * pdz) < 4.5 * 4.5;
            }
            const rawAnim = n._staffActivityAnim
              ? (closeToPlayer && n._staffActivityAnim !== 'work_pc' ? 'talk' : n._staffActivityAnim)
              : (n.mode === 'work_pc'
                ? (n.id === 'npc_sec' ? 'idle' : 'work_pc')
                : n.mode === 'stand_duty'
                  ? (closeToPlayer ? 'talk' : 'observe')
                  : (closeToPlayer ? 'talk' : 'idle'));
            const safeAnim = this.resolveSafePosture(n, rawAnim);
            this.animSystem.updateRig(n.mesh, safeAnim, animDt, 1.0, lod);
          }
        }
      }

      // Hậu xử lý chống chồng lấn toàn cục (Zero-GC Spatial Hash): tách giãn mọi NPC đang đứng/di chuyển quá gần nhau
      this.pathfinder.resolveNpcSeparation(npcs, 0.72);
    }
  }

  // Bảo vệ tuyệt đối: KHÔNG BAO GIỜ cho nhân vật ngồi trên không ở vị trí không có ghế 3D
  // Ngoại lệ hợp lệ: NPC đang khóa vào ActivityPoint thuộc ghế/sofa/xe đạp/giường đã xác nhận trên campus!
  resolveSafePosture(n, requestedAnim) {
    const px = n.mesh.position.x;
    const pz = n.mesh.position.z;
    if (SITTING_ANIMS.has(requestedAnim)) {
      if (n.activePointId && this.activitySystem) {
        const pt = this.activitySystem.getPoint(n.activePointId);
        if (pt && Math.hypot(px - pt.position.x, pz - pt.position.z) < 0.85) {
          n.mesh.position.y = pt.elevatedY ?? 0.24;
          return requestedAnim;
        }
      }
      const dx = px - n._chairCacheX;
      const dz = pz - n._chairCacheZ;
      if (typeof n._chairCacheX !== 'number' || Number.isNaN(n._chairCacheX) || (dx * dx + dz * dz) > 0.0144) {
        const hasChair = this.campus?.hasChairAt
          ? this.campus.hasChairAt(px, pz, 0.78)
          : true;
        n._chairCacheX = px;
        n._chairCacheZ = pz;
        n._chairCacheHas = hasChair;
        n._chairCacheY = (hasChair && this.campus?.getChairElevationAt)
          ? this.campus.getChairElevationAt(px, pz, 0.78)
          : 0.14;
      }
      if (!n._chairCacheHas) {
        n.mesh.position.y = 0.14;
        return requestedAnim === 'work_pc' ? 'observe' : requestedAnim === 'raise_hand' ? 'gesture' : 'idle';
      }
      n.mesh.position.y = n._chairCacheY;
    } else {
      n.mesh.position.y = (n.mode === 'event_hold' && px > 52.5 && pz > 3.5 && pz < 18.5) ? 0.48 : 0.14;
    }
    return requestedAnim;
  }

  // ==================== AI LỊCH SINH HOẠT 24H & QUYẾT ĐỊNH CÁ NHÂN HÓA ====================
  _getUpcomingActivityLabel(clockHour) {
    if (clockHour < 6.5) return 'Thức dậy & vệ sinh cá nhân (06:30)';
    if (clockHour < 8.75) return 'Vào Phòng Thay Đồ chuẩn bị tập (08:45)';
    if (clockHour < 9.25) return 'Tập luyện buổi sáng (09:25)';
    if (clockHour < 12.15) return 'Hạ nhiệt & Ăn trưa dinh dưỡng (12:15)';
    if (clockHour < 14.25) return 'Chuẩn bị buổi tập chiều (14:25)';
    if (clockHour < 15.0) return 'Tập luyện buổi chiều (15:00)';
    if (clockHour < 16.5) return 'Hồi phục / Tập thêm / Sinh hoạt tự do (16:30)';
    if (clockHour < 21.5) return 'Trở về phòng cá nhân nghỉ ngơi (21:30)';
    return 'Đi ngủ đêm (22:30)';
  }

  _tickStaffDailySchedule(n, stepDt, clockHour, trainingNow, drNow, pathOpts = EMPTY_PATH_OPTS, isLod3 = false) {
    if (this.meetingActive || n.mode === 'going_meeting' || n.mode === 'meeting' || n.mode === 'going_president' || n.mode === 'sit_president' || n.mode === 'task_travel' || n.mode === 'task_working' || n.mode === 'event_travel' || n.mode === 'event_hold') {
      return;
    }
    if (n.mode === 'returning' && (n._lod3InTransit || (n.path && n.path.length > 0))) {
      return;
    }

    // 1. HLV trưởng
    if (n.id === 'npc_coach') {
      if (drNow && clockHour >= 9.0 && clockHour < 9.25) {
        n.task = 'Đang phổ biến chiến thuật đầu buổi tập tại Phòng Thay Đồ PSG';
        n.activityLabel = n.task;
        n.state = 'GOING_TO_LOCKER_ROOM';
        if (Math.hypot((n.finalDest?.x ?? 0) - 134.5, (n.finalDest?.z ?? 0) - (-48.8)) > 1.5) {
          this._routeNpc(n, 134.5, -48.8, pathOpts, isLod3);
          n.mode = 'supervise_walk';
        }
      } else if (trainingNow) {
        n.task = 'Trực tiếp điều hành & quan sát toàn bộ buổi tập PSG tại PSG TRAINING PITCH';
        n.activityLabel = n.task;
        n.state = 'TRAINING';
        if (n.mode !== 'supervise' && n.mode !== 'supervise_walk') {
          this._routeNpc(n, 192.0, -61.5, pathOpts, isLod3);
          n.mode = 'supervise_walk';
        }
      } else if (clockHour >= 12.5 && clockHour < 13.75) {
        n.task = 'Nghỉ trưa & tổng kết giáo án sáng cùng Ban huấn luyện';
        n.activityLabel = n.task;
        if (n._staffSlotKey !== 'coach_lunch') {
          n._staffSlotKey = 'coach_lunch';
          n.mode = 'work_pc';
          n.state = 'RESTING';
          n._targetRotY = n.seatRotY;
          this._routeNpc(n, n.home.x, n.home.z, pathOpts, isLod3);
        }
      } else {
        n.task = 'Phân tích băng hình đối thủ và lên giáo án tại Phòng HLV Trưởng';
        n.activityLabel = n.task;
        if (n.mode === 'supervise' || n.mode === 'supervise_walk' || n._staffSlotKey === 'coach_lunch') {
          n._staffSlotKey = 'coach_office';
          this._routeNpc(n, n.home.x, n.home.z, pathOpts, isLod3);
          n.mode = 'returning';
        }
      }
      return;
    }

    // 2. Đội ngũ Trợ lý Ban huấn luyện trên sân
    if (n.isCoachingStaff) {
      if (trainingNow && n.pitchSpot) {
        n.state = 'TRAINING';
        if (n.mode !== 'coach_drill' && n.mode !== 'coach_walk') {
          this._routeNpc(n, n.pitchSpot.x, n.pitchSpot.z, pathOpts, isLod3);
          n.mode = 'coach_walk';
        }
      } else if (!trainingNow && (n.mode === 'coach_drill' || n.mode === 'coach_walk')) {
        this._routeNpc(n, n.home.x, n.home.z, pathOpts, isLod3);
        n.mode = 'returning';
      }
      return;
    }

    // 3. Bộ phận Y tế tại Trung tâm Y tế PSG (cx=168, cz=-38): Trưởng bộ phận Y tế, Bác sĩ, Vật lý trị liệu, Phục hồi
    const isMedicalUnit = n.id === 'npc_med' || n.id === 'npc_med_doc' || n.id === 'npc_med_physio' || n.id === 'npc_rehab_coach';
    if (isMedicalUnit) {
      n.timer -= stepDt;
      if (n.timer > 0 && n._staffSlotKey) return;

      let activePatient = null;
      const allNpcs = this.npcs;
      for (let i = 0; i < allNpcs.length; i++) {
        const pn = allNpcs[i];
        if (!pn.isPlayer || !pn.mesh) continue;
        if (pn.mode === 'medical_rehab' || pn.state === 'MEDICAL_CHECK' || pn.state === 'RECOVERY') {
          activePatient = pn;
          break;
        }
      }

      if (clockHour >= 12.5 && clockHour < 13.25 && n.id !== 'npc_med') {
        n.timer = 14;
        if (n._staffSlotKey !== 'med_lunch') {
          n._staffSlotKey = 'med_lunch';
          const sp = MEDICAL_LUNCH_SPOTS[n.staffSpotIdx % MEDICAL_LUNCH_SPOTS.length];
          n.mode = 'stand_duty';
          n.state = 'EATING';
          n._staffActivityAnim = 'idle';
          n.task = sp.task;
          n.activityLabel = sp.task;
          this._routeNpc(n, sp.x, sp.z, pathOpts, isLod3);
        }
        return;
      }

      if (n.id === 'npc_med') {
        n.timer = 11 + (n._decisionSeed % 5);
        if (activePatient && (n.staffSpotIdx % 3 === 1)) {
          n.staffSpotIdx++;
          n._staffSlotKey = 'med_head_round';
          const rx = Math.max(156.5, Math.min(179.0, activePatient.mesh.position.x + 0.95));
          const rz = Math.max(-46.5, Math.min(-30.0, activePatient.mesh.position.z + 0.65));
          n.mode = 'stand_duty';
          n.state = 'MEDICAL_CHECK';
          n._staffActivityAnim = 'clipboard';
          n._targetRotY = Math.atan2(activePatient.mesh.position.x - rx, activePatient.mesh.position.z - rz);
          n.task = `Kiểm tra phác đồ điều trị cho ${activePatient.name} tại Trung tâm Y tế`;
          n.activityLabel = n.task;
          this._routeNpc(n, rx, rz, pathOpts, isLod3);
        } else {
          const stIdx = n.staffSpotIdx % MEDICAL_STAFF_STATIONS.length;
          n.staffSpotIdx++;
          const st = MEDICAL_STAFF_STATIONS[stIdx];
          n._staffSlotKey = st.pointId;
          n.mode = st.anim === 'work_pc' ? 'work_pc' : 'stand_duty';
          n.state = 'IDLE';
          n._staffActivityAnim = st.anim;
          n._targetRotY = st.rotY;
          n.task = st.task;
          n.activityLabel = st.task;
          this._routeNpc(n, st.x, st.z, pathOpts, isLod3);
        }
        return;
      }

      if (n.id === 'npc_med_doc' || n.id === 'npc_med_physio') {
        n.timer = 12 + (n._decisionSeed % 6);
        if (activePatient) {
          n._staffSlotKey = 'med_treat_patient';
          const ox = n.id === 'npc_med_doc' ? -0.95 : 0.95;
          const rx = Math.max(156.5, Math.min(179.0, activePatient.mesh.position.x + ox));
          const rz = Math.max(-46.5, Math.min(-30.0, activePatient.mesh.position.z + 0.4));
          n.mode = 'stand_duty';
          n.state = 'MEDICAL_CHECK';
          n._staffActivityAnim = n.id === 'npc_med_doc' ? 'clipboard' : 'observe';
          n._targetRotY = Math.atan2(activePatient.mesh.position.x - rx, activePatient.mesh.position.z - rz);
          n.task = `Trực tiếp điều trị y tế cho ${activePatient.name}`;
          n.activityLabel = n.task;
          this._routeNpc(n, rx, rz, pathOpts, isLod3);
        } else {
          n._staffSlotKey = 'med_station_home';
          n.mode = 'stand_duty';
          n.state = 'IDLE';
          n._staffActivityAnim = (n.staffSpotIdx++ % 2 === 0) ? 'clipboard' : 'observe';
          n._targetRotY = n.seatRotY;
          n.task = n.role || 'Trực chuyên môn tại Trung tâm Y tế PSG';
          n.activityLabel = n.task;
          this._routeNpc(n, n.home.x, n.home.z, pathOpts, isLod3);
        }
        return;
      }

      // npc_rehab_coach
      n.timer = 13;
      if (trainingNow && (n.staffSpotIdx++ % 3 === 0)) {
        n._staffSlotKey = 'rehab_monitor';
        n.mode = 'stand_duty';
        n.state = 'IDLE';
        n._staffActivityAnim = 'tablet';
        n._targetRotY = Math.PI / 2;
        n.task = 'Đánh giá ngưỡng phục hồi thể lực trên màn hình Y tế';
        this._routeNpc(n, 178.0, -36.5, pathOpts, isLod3);
      } else {
        n._staffSlotKey = 'rehab_home';
        n.mode = 'work_pc';
        n.state = 'IDLE';
        n._staffActivityAnim = 'work_pc';
        n._targetRotY = n.seatRotY;
        n.task = 'Lập giáo án phục hồi thể lực tại Trung tâm Y tế PSG';
        this._routeNpc(n, n.home.x, n.home.z, pathOpts, isLod3);
      }
      return;
    }

    // 4. An ninh (Tuần tra liên hoàn các cổng HQ & Training Center)
    if (n.id === 'npc_sec') {
      n.timer -= stepDt;
      if (n.timer > 0 && n._staffSlotKey) return;
      n.timer = 13 + (n._decisionSeed % 5);
      const wp = SECURITY_PATROL_ROUTE[n.staffSpotIdx % SECURITY_PATROL_ROUTE.length];
      n.staffSpotIdx++;
      n._staffSlotKey = `sec_${n.staffSpotIdx % 4}`;
      n.mode = 'stand_duty';
      n.state = 'WALKING';
      n._staffActivityAnim = 'observe';
      n._targetRotY = 0;
      n.task = wp.task;
      n.activityLabel = wp.task;
      this._routeNpc(n, wp.x, wp.z, pathOpts, isLod3);
      return;
    }

    // 5. Bảo tàng CLB (tuần tra trưng bày giờ mở cửa, nghỉ tối)
    if (n.isMuseumNpc) {
      n.timer -= stepDt;
      if (n.timer > 0 && n._staffSlotKey) return;
      n.timer = 10 + (n._decisionSeed % 6);
      if (clockHour >= 21.0 || clockHour < 7.5) {
        n._staffSlotKey = 'museum_home';
        n.mode = 'stand_duty';
        n._staffActivityAnim = 'idle';
        this._routeNpc(n, n.home.x, n.home.z, pathOpts, isLod3);
      } else {
        const spot = MUSEUM_PATROL_SPOTS[n.staffSpotIdx % MUSEUM_PATROL_SPOTS.length];
        n.staffSpotIdx++;
        n._staffSlotKey = 'museum_patrol';
        n.mode = 'stand_duty';
        n._staffActivityAnim = 'observe';
        this._routeNpc(n, spot.x, spot.z, pathOpts, isLod3);
      }
      return;
    }

    // 6. Cơ sở vật chất & Kỹ thuật sân tập
    if (n.id === 'npc_fac' || n.id === 'npc_fac_tech') {
      n.timer -= stepDt;
      if (n.timer > 0 && n._staffSlotKey) return;
      n.timer = 14 + (n._decisionSeed % 6);
      if (clockHour >= 8.0 && clockHour < 19.5 && (n.staffSpotIdx % 2 === 1)) {
        const wp = FACILITY_PATROL_ROUTE[(n.staffSpotIdx + (n.id === 'npc_fac_tech' ? 1 : 0)) % FACILITY_PATROL_ROUTE.length];
        n.staffSpotIdx++;
        n._staffSlotKey = 'fac_inspect';
        n.mode = 'stand_duty';
        n._staffActivityAnim = 'observe';
        n.task = wp.task;
        n.activityLabel = wp.task;
        this._routeNpc(n, wp.x, wp.z, pathOpts, isLod3);
      } else {
        n.staffSpotIdx++;
        n._staffSlotKey = 'fac_home';
        const hasHomeChair = this.campus?.hasChairAt ? this.campus.hasChairAt(n.home.x, n.home.z, 0.78) : false;
        n.mode = hasHomeChair ? 'work_pc' : 'stand_duty';
        n._staffActivityAnim = hasHomeChair ? 'work_pc' : 'observe';
        n._targetRotY = n.seatRotY;
        this._routeNpc(n, n.home.x, n.home.z, pathOpts, isLod3);
      }
      return;
    }

    // 7. Lễ tân & Ban điều hành / Giám đốc phòng ban HQ
    n.timer -= stepDt;
    if (n.timer > 0 && n._staffSlotKey) return;
    n.timer = 14 + (n._decisionSeed % 8);

    const consultTarget = EXEC_CONSULT_SPOTS[n.id];
    const isLunchHour = clockHour >= 12.5 && clockHour < 13.5;
    const isConsultWindow = (clockHour >= 10.25 && clockHour < 11.75) || (clockHour >= 15.0 && clockHour < 16.5);

    if (isLunchHour && n.id !== 'npc_recep' && (n.staffSpotIdx % 2 === 0)) {
      n.staffSpotIdx++;
      n._staffSlotKey = 'exec_lunch';
      n.mode = 'stand_duty';
      n.state = 'RESTING';
      n._staffActivityAnim = 'idle';
      n.task = 'Nghỉ trưa & trao đổi nhanh tại Khu VIP Trụ sở PSG';
      this._routeNpc(n, -1.2 + ((n._decisionSeed % 5) - 2) * 0.9, -9.2, pathOpts, isLod3);
    } else if (consultTarget && isConsultWindow && (n.staffSpotIdx % 3 === 1)) {
      n.staffSpotIdx++;
      n._staffSlotKey = 'exec_consult';
      n.mode = 'stand_duty';
      n.state = 'SOCIALIZING';
      n._staffActivityAnim = 'talk';
      n.task = consultTarget.task;
      this._routeNpc(n, consultTarget.x, consultTarget.z, pathOpts, isLod3);
    } else {
      n.staffSpotIdx++;
      n._staffSlotKey = 'office_desk';
      const hasHomeChair = this.campus?.hasChairAt ? this.campus.hasChairAt(n.home.x, n.home.z, 0.78) : false;
      n.mode = hasHomeChair ? 'work_pc' : 'stand_duty';
      n.state = 'IDLE';
      n._staffActivityAnim = hasHomeChair ? 'work_pc' : (n.id === 'npc_recep' ? 'observe' : 'idle');
      n._targetRotY = n.seatRotY;
      this._routeNpc(n, n.home.x, n.home.z, pathOpts, isLod3);
    }
  }

  _tickPlayerDailySchedule(n, stepDt, clockHour, trainingNow, drNow, playerPos, pathOpts, resSys, pObj, isLod3 = false) {
    // 1. Pha thay đồ trước/sau tập (08:45-09:25, 12:15-13:00, 14:25-15:00)
    if (drNow) {
      n.curtainTask = null;
      if (n.bibMesh) n.bibMesh.visible = false;
      n.scrimmageTeam = null;
      n.nextActivity = clockHour < 10 ? 'Tập luyện buổi sáng' : clockHour < 13.5 ? 'Ăn trưa & Nghỉ ngơi' : 'Tập luyện buổi chiều';
      n.activityType = 'dressing';
      n.activityLabel = 'Đang chuẩn bị tại Phòng Thay Đồ PSG';
      n.task = 'Có mặt tại Phòng Thay Đồ thay trang phục & chuẩn bị giáo án';
      if (n.mode !== 'dressing' && !(n.mode === 'door_walk' && n._doorTransition?.resumeMode === 'dressing') && !(n.mode === 'door_action' && n._doorTransition?.resumeMode === 'dressing')) {
        n._doorTransition = null;
        this.activitySystem?.releaseNpc?.(n.id);
        n.activePointId = null;
        n.mode = 'dressing';
        n.state = 'GOING_TO_LOCKER_ROOM';
        const pt = this.activitySystem?.claimAvailablePoint(n.id, {
          area: 'locker_room',
          interactionTypes: ['dress', 'talk', 'sit_sofa'],
          preferNearX: n.mesh.position.x,
          preferNearZ: n.mesh.position.z,
          simTime: this._simClock
        });
        const dest = pt ? pt.standPosition : n.restSpot;
        if (pt) n.activePointId = pt.activityPointId;
        this._routeNpc(n, dest.x, dest.z, pathOpts, isLod3);
      }
      return;
    }

    // 2. Pha tập luyện chính thức trên sân tập (09:25-12:15, 15:00-16:30)
    if (trainingNow) {
      n.curtainTask = null;
      n.nextActivity = clockHour < 13 ? 'Hồi phục & Ăn trưa' : 'Tự do phục hồi / Gym / Về phòng';
      n.activityType = 'training';
      n.activityLabel = 'Đang tập luyện cùng đội một PSG';
      if (n.mode === 'rest' || n.mode === 'dressing' || n.mode === 'returning' || n.mode === 'curtain_walk' || n.mode === 'curtain_action' || n.mode === 'door_walk' || n.mode === 'door_action') {
        if (!(n._doorTransition?.resumeMode === 'train')) {
          n._doorTransition = null;
          this.activitySystem?.releaseNpc?.(n.id);
          n.activePointId = null;
          n.mode = 'train';
          n.state = 'TRAINING';
          this._routeNpc(n, n.home.x, n.home.z, pathOpts, isLod3);
        }
      } else {
        n.state = 'TRAINING';
      }
      return;
    }

    // 3. Nếu đang thực hiện tương tác cửa hoặc kéo rèm -> để hoàn tất trơn tru
    if (n.bibMesh) n.bibMesh.visible = false;
    n.scrimmageTeam = null;
    if (n.mode === 'curtain_walk' || n.mode === 'curtain_action' || n.mode === 'door_walk' || n.mode === 'door_action' || n.state === 'WAITING_FOR_DOOR') {
      return;
    }

    // Giữ tương thích với mock NPC đơn giản (không có _decisionSeed, ví dụ TCX-15)
    if (typeof n._decisionSeed !== 'number') {
      const rSpot = this._getPlayerResidenceSpot(n);
      n.task = 'Nghỉ ngơi & sinh hoạt tại Tòa nhà Nghỉ dưỡng Cầu thủ PSG';
      if (n.mode !== 'rest' || Math.hypot((n.finalDest?.x ?? 0) - rSpot.x, (n.finalDest?.z ?? 0) - rSpot.z) > 1.5) {
        n.mode = 'rest';
        this._routeNpc(n, rSpot.x, rSpot.z, pathOpts, isLod3);
      } else if (this._shouldEvalCurtains) {
        this._tryStartNpcCurtainTask(n, clockHour, playerPos, pathOpts, isLod3);
      }
      return;
    }

    // 4. Trạng thái ngoài giờ tập: áp dụng AI lịch sinh hoạt cá nhân hóa 24h
    n.nextActivity = this._getUpcomingActivityLabel(clockHour);
    n._decisionCooldown = (n._decisionCooldown ?? 0) - stepDt;

    // Xác định khung hoạt động hiện tại phù hợp với từng cầu thủ
    const ownedRoom = resSys && n.playerId ? resSys.getRoomForPlayer(n.playerId) : null;
    const seed = n._decisionSeed;
    const stamina = typeof pObj?.stamina === 'number' ? pObj.stamina : 82;
    const fatigue = typeof pObj?.health?.fatigue === 'number' ? pObj.health.fatigue : (100 - stamina);
    const morale = typeof pObj?.morale === 'number' ? pObj.morale : (n.morale || 80);
    const personality = String(pObj?.personality || n.personality || '').toLowerCase();

    let desiredSlotKey = 'room_rest';
    let targetArea = 'residence_room';
    let targetTypes = ['watch_tv', 'use_desk', 'sleep'];
    let fallbackState = 'INSIDE_ROOM';
    let desiredLabel = 'Đang nghỉ ngơi trong phòng riêng';

    if (clockHour < 6.5 || clockHour >= 22.5) {
      // Giờ ngủ đêm trong phòng cá nhân
      desiredSlotKey = 'night_sleep';
      targetArea = 'residence_room';
      targetTypes = ['sleep'];
      fallbackState = 'SLEEPING';
      desiredLabel = ownedRoom ? `Đang ngủ tại ${ownedRoom.code}` : 'Đang ngủ nghỉ';
    } else if (clockHour >= 21.25 && clockHour < 22.5) {
      // Trở về phòng cá nhân buổi tối
      desiredSlotKey = 'evening_room';
      targetArea = 'residence_room';
      targetTypes = (seed % 2 === 0) ? ['watch_tv', 'use_desk', 'sleep'] : ['use_desk', 'watch_tv', 'sleep'];
      fallbackState = 'GOING_TO_ROOM';
      desiredLabel = ownedRoom ? `Sinh hoạt tối tại ${ownedRoom.code}` : 'Nghỉ ngơi tối';
    } else if (clockHour >= 6.5 && clockHour < 7.35) {
      desiredSlotKey = 'morning_wake';
      targetArea = 'residence_room';
      targetTypes = ['use_wardrobe', 'use_desk'];
      fallbackState = 'INSIDE_ROOM';
      desiredLabel = ownedRoom ? `Chuẩn bị buổi sáng tại ${ownedRoom.code}` : 'Vệ sinh buổi sáng';
    } else if ((clockHour >= 7.35 && clockHour < 8.75) || (clockHour >= 13.0 && clockHour < 13.75)) {
      // Ăn sáng hoặc ăn trưa dinh dưỡng (hoặc nghỉ trưa nếu mệt)
      if (clockHour >= 13.0 && (fatigue > 62 || stamina < 58)) {
        desiredSlotKey = 'midday_nap';
        targetArea = 'residence_room';
        targetTypes = ['sleep'];
        fallbackState = 'RESTING';
        desiredLabel = ownedRoom ? `Nghỉ trưa hồi phục tại ${ownedRoom.code}` : 'Nghỉ trưa hồi phục';
      } else {
        desiredSlotKey = clockHour < 9 ? 'breakfast' : 'lunch';
        targetArea = 'residence_dining';
        targetTypes = ['eat'];
        fallbackState = 'EATING';
        desiredLabel = clockHour < 9 ? 'Đang ăn sáng dinh dưỡng tại Residence' : 'Đang ăn trưa & bù năng lượng';
      }
    } else if (clockHour >= 13.75 && clockHour < 14.25) {
      desiredSlotKey = 'midday_rest';
      targetArea = 'residence_room';
      targetTypes = ['sleep', 'watch_tv'];
      fallbackState = 'RESTING';
      desiredLabel = ownedRoom ? `Nghỉ ngơi giữa ngày tại ${ownedRoom.code}` : 'Nghỉ giữa ngày';
    } else {
      // Khung tự do sau tập (16:30–21:25): quyết định cá nhân hóa đa dạng theo thể lực, tâm lý, tính cách
      const dinnerWindowStart = 17.6 + ((seed % 5) * 0.42); // Phân tán giờ ăn tối 17:36..19:20
      if (clockHour >= dinnerWindowStart && clockHour < dinnerWindowStart + 0.55) {
        desiredSlotKey = 'dinner';
        targetArea = 'residence_dining';
        targetTypes = ['eat'];
        fallbackState = 'EATING';
        desiredLabel = 'Đang dùng bữa tối dinh dưỡng tại Residence';
      } else if (fatigue >= 60 || stamina <= 55) {
        if ((seed % 3) === 0) {
          desiredSlotKey = 'post_recovery_med';
          targetArea = 'medical';
          targetTypes = ['cryo', 'ice_tub', 'physio', 'recovery_bed'];
          fallbackState = 'RECOVERY';
          desiredLabel = 'Đang phục hồi Cryo/Vật lý trị liệu tại Trung tâm Y tế';
        } else {
          desiredSlotKey = 'post_rest_room';
          targetArea = 'residence_room';
          targetTypes = ['sleep', 'watch_tv'];
          fallbackState = 'RESTING';
          desiredLabel = ownedRoom ? `Nghỉ ngơi phục hồi tại ${ownedRoom.code}` : 'Nghỉ ngơi phục hồi';
        }
      } else {
        // Phân nhóm tự nhiên theo tính cách & seed + luân phiên theo slot giờ
        const slotRoll = (seed + Math.floor(clockHour * 2)) % 5;
        const lovesGym = personality.includes('tham vọng') || personality.includes('chuyên nghiệp') || personality.includes('quyết tâm');
        const lovesSocial = morale >= 78 && !personality.includes('hướng nội');

        if ((lovesGym && slotRoll <= 2 && stamina >= 65) || slotRoll === 0) {
          desiredSlotKey = 'free_gym';
          targetArea = 'gym';
          targetTypes = ['gym_treadmill', 'gym_bike', 'gym_weights', 'stretch'];
          fallbackState = 'GOING_TO_GYM';
          desiredLabel = 'Đang tập gym bổ trợ tại Fitness Center PSG';
        } else if ((lovesSocial && slotRoll === 1) || slotRoll === 2) {
          desiredSlotKey = 'free_lounge';
          targetArea = 'residence_lounge';
          targetTypes = ['sit_sofa', 'socialize'];
          fallbackState = 'SOCIALIZING';
          desiredLabel = 'Đang giao lưu & thư giãn tại Lounge Cầu thủ';
        } else if (slotRoll === 3) {
          desiredSlotKey = 'free_locker_recovery';
          targetArea = 'locker_room';
          targetTypes = ['sit_sofa', 'eat', 'lie_rest'];
          fallbackState = 'RESTING';
          desiredLabel = 'Đang thư giãn tại Phòng Thay Đồ';
        } else {
          desiredSlotKey = 'free_own_room';
          targetArea = 'residence_room';
          targetTypes = (seed % 2 === 0) ? ['watch_tv', 'use_desk'] : ['use_desk', 'watch_tv'];
          fallbackState = 'INSIDE_ROOM';
          desiredLabel = ownedRoom ? `Sinh hoạt riêng tư tại ${ownedRoom.code}` : 'Thư giãn tại phòng riêng';
        }
      }
    }

    const needSwitch = (n._curActivityKey !== desiredSlotKey) ||
      (n._decisionCooldown <= 0 && !n.activePointId && n.mode !== 'rest') ||
      (n.mode !== 'rest');

    if (needSwitch) {
      n._curActivityKey = desiredSlotKey;
      n._decisionCooldown = 14 + (seed % 8) * 2.5;
      n._doorTransition = null;
      n._waitingDoorRoom = null;
      n._waitingDoorResume = null;
      this.activitySystem?.releaseNpc?.(n.id);
      n.activePointId = null;
      n.mode = 'rest';

      let pt = null;
      if (this.activitySystem) {
        if (targetArea === 'residence_room') {
          if (ownedRoom) {
            pt = this.activitySystem.claimAvailablePoint(n.id, {
              area: 'residence_room',
              roomNumber: ownedRoom.roomNumber,
              interactionTypes: targetTypes,
              simTime: this._simClock
            });
          } else {
            // Cầu thủ overflow chưa có phòng: dùng Lounge thay vì vào nhầm phòng người khác
            pt = this.activitySystem.claimAvailablePoint(n.id, {
              area: 'residence_lounge',
              interactionTypes: ['sit_sofa', 'socialize'],
              simTime: this._simClock
            });
          }
        } else {
          pt = this.activitySystem.claimAvailablePoint(n.id, {
            area: targetArea,
            interactionTypes: targetTypes,
            preferNearX: n.mesh.position.x,
            preferNearZ: n.mesh.position.z,
            simTime: this._simClock
          });
        }
      }

      if (pt) {
        n.activePointId = pt.activityPointId;
        n.activityType = targetArea === 'gym' ? 'gym'
          : targetArea === 'medical' ? 'recovery'
          : targetArea === 'residence_dining' ? 'eat'
          : targetArea === 'residence_lounge' ? 'socialize'
          : targetTypes[0] === 'sleep' ? 'sleep'
          : 'rest';
        n.activityLabel = desiredLabel;
        n.task = desiredLabel;
        n.state = fallbackState;
        this._routeNpc(n, pt.standPosition.x, pt.standPosition.z, pathOpts, isLod3);
      } else if (this.activitySystem && (targetArea === 'gym' || targetArea === 'residence_dining' || targetArea === 'medical')) {
        // Kín chỗ: xếp hàng trật tự ở bên ngoài điểm hoạt động thay vì chen đè lên người khác!
        const qKey = `queue_${targetArea}`;
        const anchor = targetArea === 'gym'
          ? { x: 200, z: -31.5, dirX: 0, dirZ: 1, spacing: 1.05 }
          : targetArea === 'medical'
            ? { x: 168, z: -30.5, dirX: 1, dirZ: 0, spacing: 1.05 }
            : { x: 184, z: 4.8, dirX: 0, dirZ: 1, spacing: 1.05 };
        const qEntry = this.activitySystem.enqueue(qKey, n.id, anchor, this._simClock);
        n.queueKey = qKey;
        n.state = 'WAITING_FOR_ACTIVITY';
        n.activityType = targetArea === 'gym' ? 'gym' : targetArea === 'medical' ? 'recovery' : 'eat';
        n.activityLabel = `Đang xếp hàng chờ tại ${targetArea === 'gym' ? 'Gym' : targetArea === 'medical' ? 'Trung tâm Y tế' : 'Khu Ăn uống'}`;
        n.task = n.activityLabel;
        if (qEntry?.waitSpot) {
          this._routeNpc(n, qEntry.waitSpot.x, qEntry.waitSpot.z, pathOpts, isLod3);
        }
      } else {
        const fallbackSpot = this._getPlayerResidenceSpot(n);
        n.activityType = 'rest';
        n.activityLabel = desiredLabel;
        n.task = desiredLabel;
        n.state = fallbackState;
        this._routeNpc(n, fallbackSpot.x, fallbackSpot.z, pathOpts, isLod3);
      }
    } else if (n.state === 'WAITING_FOR_ACTIVITY' && this.activitySystem && n._decisionCooldown <= 0) {
      // Thử lại xin slot trống cho người đang xếp hàng
      n._decisionCooldown = 4.0;
      const pt = this.activitySystem.claimAvailablePoint(n.id, {
        area: targetArea,
        interactionTypes: targetTypes,
        preferNearX: n.mesh.position.x,
        preferNearZ: n.mesh.position.z,
        simTime: this._simClock
      });
      if (pt) {
        this.activitySystem.dequeue(n.queueKey, n.id);
        n.queueKey = null;
        n.activePointId = pt.activityPointId;
        n.state = fallbackState;
        n.activityLabel = desiredLabel;
        this._routeNpc(n, pt.standPosition.x, pt.standPosition.z, pathOpts, isLod3);
      }
    } else if (this._shouldEvalCurtains && targetArea === 'residence_room' && !(n.state === 'SLEEPING' && n._slotLocked)) {
      this._tryStartNpcCurtainTask(n, clockHour, playerPos, pathOpts, isLod3);
    }
  }

  _tickPlayerVitals(n, stepDt, clockHour) {
    const pObj = this.trainingSystem?.state?.getPlayerById?.(n.playerId);
    if (!pObj || stepDt <= 0) return;

    // Quy đổi tốc độ thay đổi thể lực nhẹ, mượt theo thời gian thực (tuyệt đối KHÔNG chạm injuryDays!)
    const curStamina = typeof pObj.stamina === 'number'
      ? pObj.stamina
      : (typeof pObj.health?.fitness === 'number' ? pObj.health.fitness : 82);
    const curFatigue = typeof pObj.health?.fatigue === 'number' ? pObj.health.fatigue : (100 - curStamina);
    let dStamina = 0;
    let dFatigue = 0;

    if (n.state === 'TRAINING' || n.mode === 'train' || n.mode === 'drill') {
      dStamina = -0.35 * stepDt;
      dFatigue = 0.28 * stepDt;
    } else if (n.state === 'GOING_TO_GYM' && n._slotLocked) {
      dStamina = -0.22 * stepDt;
      dFatigue = 0.18 * stepDt;
    } else if (n.state === 'SLEEPING') {
      dStamina = 0.55 * stepDt;
      dFatigue = -0.50 * stepDt;
    } else if (n.state === 'RECOVERY' || n.state === 'MEDICAL_CHECK') {
      dStamina = 0.42 * stepDt;
      dFatigue = -0.38 * stepDt;
    } else if (n.state === 'EATING' || n.state === 'RESTING' || n.state === 'WATCHING_TV' || n.state === 'INSIDE_ROOM') {
      dStamina = 0.25 * stepDt;
      dFatigue = -0.20 * stepDt;
    }

    if (dStamina !== 0) {
      pObj.stamina = Math.max(18, Math.min(100, curStamina + dStamina));
      if (pObj.health) {
        pObj.health.fatigue = Math.max(0, Math.min(100, curFatigue + dFatigue));
        pObj.health.fitness = Math.max(25, Math.min(100, Math.round(pObj.stamina)));
      }
    }
  }

  _tryStartNpcCurtainTask(npc, clockHour, playerPos, pathOpts = EMPTY_PATH_OPTS, isLod3 = false) {
    const resSys = this.trainingSystem?.state?.playerResidenceSystem;
    if (!resSys || !npc?.isPlayer || !npc.playerId) return false;
    const room = resSys.getRoomForPlayer(npc.playerId);
    if (!room || !resSys.canNpcEnterRoom(room.roomNumber, npc.playerId)) return false;

    const desired = resSys.computeDesiredCurtainForRoom(room, { clockHour, playerPos });
    if (!desired) return false;

    if (isLod3) {
      resSys.setRoomCurtainState(room.roomNumber, desired.state, {
        by: 'npc',
        npcId: npc.id,
        npcName: npc.name,
        reason: desired.reason,
        clockHour,
        immediate: true
      });
      return true;
    }

    // Chỉ đi kéo rèm bằng animation khi cầu thủ đã vào gần/trong tòa nhà nghỉ dưỡng
    const distToRoom = Math.hypot(npc.mesh.position.x - room.cx, npc.mesh.position.z - room.cz);
    if (distToRoom > 16) return false;

    const spot = resSys.getWindowStandSpot(room);
    if (!spot) return false;
    npc.curtainTask = {
      roomNumber: room.roomNumber,
      targetState: desired.state,
      reason: desired.reason,
      windowX: spot.x,
      windowZ: spot.z,
      faceRotY: spot.faceRotY,
      actionTimer: 1.5,
      applied: false
    };
    npc.mode = 'curtain_walk';
    npc.state = 'INSIDE_ROOM';
    npc.task = `${desired.reason} (${room.code})`;
    this.setNpcDestination(npc, spot.x, spot.z, pathOpts);
    return true;
  }

  _tickResidenceRoomComfort(npc, clockHour, playerPos, stepDt, immediate = false) {
    const resSys = this.trainingSystem?.state?.playerResidenceSystem;
    if (!resSys || !npc?.isPlayer || !npc.playerId || !npc.mesh) return;

    const isDoorwayClear = (rm) => {
      if (!rm) return false;
      const nx = npc.mesh.position.x;
      const nz = npc.mesh.position.z;
      if (Math.hypot(nx - rm.doorX, nz - rm.doorZ) < 1.38) return false;
      if (playerPos && Math.hypot(playerPos.x - rm.doorX, playerPos.z - rm.doorZ) < 1.48) return false;
      return true;
    };

    if (npc._autoCloseRoomNumber) {
      npc._autoCloseTimer = (npc._autoCloseTimer || 0) - stepDt;
      if (npc._autoCloseTimer <= 0) {
        const rm = resSys.getRoomByNumber(npc._autoCloseRoomNumber);
        if (rm && rm.doorOpen) {
          const playerRecentlyOpened = rm.lastDoorAction?.by === 'player' &&
            Math.abs(clockHour - (rm.lastDoorAction.clockHour ?? clockHour)) < 0.35;
          if (!playerRecentlyOpened && isDoorwayClear(rm)) {
            resSys.setRoomDoorState(rm.roomNumber, false, {
              by: 'npc',
              npcId: npc.id,
              npcName: npc.name,
              clockHour,
              immediate
            });
            npc._autoCloseRoomNumber = null;
          } else {
            npc._autoCloseTimer = 1.4;
          }
        } else {
          npc._autoCloseRoomNumber = null;
        }
      }
    }

    const ownedRoom = resSys.getRoomForPlayer(npc.playerId);
    if (!ownedRoom || !resSys.canNpcEnterRoom(ownedRoom.roomNumber, npc.playerId)) return;

    const curRoom = resSys.getRoomAtPosition(npc.mesh.position.x, npc.mesh.position.z);
    const insideOwnRoom = !!(curRoom && curRoom.roomNumber === ownedRoom.roomNumber);
    resSys.setRoomOccupantPresence?.(ownedRoom.roomNumber, insideOwnRoom ? (npc.playerId || npc.id) : null);

    if ((!this._shouldEvalCurtains && !immediate) || !insideOwnRoom) return;

    const isSleepHour = clockHour >= 22.8 || clockHour < 6.0 || npc.state === 'SLEEPING';
    const isEveningLeisure = clockHour >= 17.5 && clockHour < 22.8;

    if (isSleepHour) {
      if (ownedRoom.lightOn) resSys.setRoomLightState(ownedRoom.roomNumber, false);
      if (ownedRoom.tvOn) resSys.setRoomTvState(ownedRoom.roomNumber, false);
      if (ownedRoom.doorOpen && ownedRoom.lastDoorAction?.by !== 'player' && isDoorwayClear(ownedRoom)) {
        resSys.setRoomDoorState(ownedRoom.roomNumber, false, {
          by: 'npc',
          npcId: npc.id,
          npcName: npc.name,
          clockHour,
          immediate
        });
      }
    } else if (npc.state === 'WATCHING_TV' || isEveningLeisure) {
      if (!ownedRoom.lightOn) resSys.setRoomLightState(ownedRoom.roomNumber, true);
      if ((npc.state === 'WATCHING_TV' || (ownedRoom.roomNumber % 2 === 1 && clockHour >= 18.5 && clockHour < 22.2)) && !ownedRoom.tvOn) {
        resSys.setRoomTvState(ownedRoom.roomNumber, true);
      }
    } else {
      if (!ownedRoom.lightOn) resSys.setRoomLightState(ownedRoom.roomNumber, true);
      if (ownedRoom.tvOn && clockHour < 17.5) resSys.setRoomTvState(ownedRoom.roomNumber, false);
    }
  }

  _getPlayerResidenceSpot(npc) {
    const resSys = this.trainingSystem?.state?.playerResidenceSystem;
    const room = resSys && npc?.playerId ? resSys.getRoomForPlayer(npc.playerId) : null;
    if (room && room.floor === 1) {
      // Vị trí đứng/thư giãn rộng rãi giữa khu tiếp khách & giường ngủ (lz_in = 7.75, cách mọi nội thất >0.65m)
      return {
        x: room.cx + 0.45,
        z: room.side === 'north' ? -2.25 : 20.25
      };
    }
    const idx = Math.abs((npc?.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % RESIDENCE_LOUNGE_SPOTS.length;
    return RESIDENCE_LOUNGE_SPOTS[idx];
  }

  exportRuntimeState() {
    const items = [];
    for (let i = 0; i < this.npcs.length; i++) {
      const n = this.npcs[i];
      if (!n?.mesh) continue;
      items.push({
        id: n.id,
        playerId: n.playerId || null,
        x: Number(n.mesh.position.x.toFixed(3)),
        y: Number(n.mesh.position.y.toFixed(3)),
        z: Number(n.mesh.position.z.toFixed(3)),
        rotY: Number((n.mesh.rotation.y || 0).toFixed(3)),
        mode: n.mode,
        state: n.state || 'IDLE',
        avoidanceState: n.avoidanceState || 'NONE',
        lastBlockedAt: n.lastBlockedAt || 0,
        timer: n.timer ?? 2.5,
        staffSpotIdx: n.staffSpotIdx ?? 0,
        activityType: n.activityType || null,
        activityLabel: n.activityLabel || null,
        nextActivity: n.nextActivity || null,
        activePointId: n.activePointId || null,
        queueKey: n.queueKey || null,
        _curActivityKey: n._curActivityKey || null,
        _decisionCooldown: n._decisionCooldown ?? 5,
        destX: n.finalDest?.x ?? n.mesh.position.x,
        destZ: n.finalDest?.z ?? n.mesh.position.z
      });
    }
    return {
      npcs: items,
      activityState: this.activitySystem ? this.activitySystem.exportState() : null
    };
  }

  importRuntimeState(snap, clockHour = 9.5) {
    if (!snap || typeof snap !== 'object') return;
    if (snap.activityState && this.activitySystem) {
      this.activitySystem.importState(snap.activityState);
    }
    if (!Array.isArray(snap.npcs)) return;

    const byId = new Map();
    for (let i = 0; i < snap.npcs.length; i++) {
      const s = snap.npcs[i];
      if (s?.id) byId.set(s.id, s);
    }

    const resSys = this.trainingSystem?.state?.playerResidenceSystem;
    for (let i = 0; i < this.npcs.length; i++) {
      const n = this.npcs[i];
      const saved = byId.get(n.id);
      if (!saved || !n.mesh) continue;

      let sx = typeof saved.x === 'number' ? saved.x : n.mesh.position.x;
      let sy = typeof saved.y === 'number' ? saved.y : 0.14;
      let sz = typeof saved.z === 'number' ? saved.z : n.mesh.position.z;

      // Bảo vệ chống load vào phòng người khác hoặc HQ trái phép hoặc xuyên tường
      if (n.isPlayer) {
        if (!this.isAuthorizedHqVisit(n) && PathfindingSystem.isHqInteriorPoint(sx, sz)) {
          const safe = n.restSpot || { x: 133.5, z: -43.0 };
          sx = safe.x; sz = safe.z; sy = 0.14;
        }
        if (resSys) {
          const rm = resSys.getRoomAtPosition(sx, sz);
          if (rm && !resSys.canNpcEnterRoom(rm.roomNumber, n.playerId)) {
            const safeL = RESIDENCE_LOUNGE_SPOTS[0];
            sx = safeL.x; sz = safeL.z; sy = 0.14;
          }
        }
      }

      if (this.campus && !saved.activePointId) {
        const resolved = this.campus.resolveCollision(sx, sz, 0.34);
        sx = resolved.x;
        sz = resolved.z;
      }

      n.mesh.position.set(sx, sy, sz);
      n.mesh.rotation.y = typeof saved.rotY === 'number' ? saved.rotY : 0;
      n.lastPosX = sx;
      n.lastPosZ = sz;
      n.mode = saved.mode || n.mode;
      n.state = saved.state || n.state || 'IDLE';
      n.avoidanceState = saved.avoidanceState || 'NONE';
      n.lastBlockedAt = typeof saved.lastBlockedAt === 'number' ? saved.lastBlockedAt : 0;
      if (typeof saved.timer === 'number') n.timer = saved.timer;
      if (typeof saved.staffSpotIdx === 'number') n.staffSpotIdx = saved.staffSpotIdx;
      n.activityType = saved.activityType || n.activityType;
      n.activityLabel = saved.activityLabel || n.activityLabel;
      n.nextActivity = saved.nextActivity || n.nextActivity;
      n.activePointId = saved.activePointId || null;
      n.queueKey = saved.queueKey || null;
      n._curActivityKey = saved._curActivityKey || null;
      n._decisionCooldown = typeof saved._decisionCooldown === 'number' ? saved._decisionCooldown : 8;
      n._doorTransition = null;
      n._waitingDoorRoom = null;
      n._waitingDoorResume = null;
      n._slotLocked = !!(n.activePointId && this.activitySystem?.getPoint(n.activePointId));

      const dx = typeof saved.destX === 'number' ? saved.destX : sx;
      const dz = typeof saved.destZ === 'number' ? saved.destZ : sz;
      if (Math.hypot(dx - sx, dz - sz) > 0.6) {
        this.setNpcDestination(n, dx, dz, { _bypassDoorCheck: true });
      } else {
        n.finalDest = { x: sx, z: sz };
        n.target.set(sx, sy, sz);
        n.path = [];
        n.pathIdx = 0;
      }
      if (n.isPlayer) this._tickResidenceRoomComfort(n, clockHour, null, 0.1, true);
    }
    this.pathfinder.rebuildNpcSpatialGrid(this.npcs);
    this.pathfinder.resolveNpcSeparation(this.npcs, 0.72);
  }

  getById(id) {
    return this.npcById.get(id) || null;
  }
}
