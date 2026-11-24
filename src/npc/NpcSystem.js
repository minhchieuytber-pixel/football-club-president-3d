// src/npc/NpcSystem.js
// Hệ thống NPC 3D toàn diện: Pathfinding A* kết hợp Spatial-Hash Local Avoidance + Steering + 4-Tier Simulation/Animation LOD + Quản lý vòng đời NPC (Safe Disposal) + Đồng bộ huấn luyện 3D
import { PathfindingSystem } from '../ai/PathfindingSystem.js';

const COACH_SIDELINE_SPOTS = [
  { x: 0, z: -130.5 }, { x: -10, z: -130.5 }, { x: 10, z: -130.5 }, { x: 0, z: -133.0 }
];

// Khu vực nghỉ ngơi & phục hồi dành riêng cho cầu thủ: nằm hoàn toàn trong Tòa nhà Phòng Thay Đồ PSG (TUYỆT ĐỐI KHÔNG tự ý đi vào Nhà làm việc!)
const PLAYER_REST_SPOTS = [
  { x: -43.5, z: -48.5 }, { x: -43.5, z: -44.0 }, { x: -43.5, z: -39.5 },
  { x: -39.0, z: -50.8 }, { x: -34.0, z: -50.8 }, { x: -30.5, z: -48.5 },
  { x: -30.5, z: -39.5 }, { x: -35.5, z: -39.0 }, { x: -39.5, z: -39.0 },
  { x: -30.5, z: -43.5 }
];

const COACH_PROP_STATES = new Set(['clipboard', 'tablet', 'notes', 'supervise', 'coach_drill']);
const SITTING_ANIMS = new Set(['sit', 'work_pc', 'sign_contract', 'raise_hand']);
const BOARD_COACH_ROLES = new Set(['head_coach', 'tactical_coach', 'assistant_manager', 'set_piece_coach']);
const TABLET_COACH_ROLES = new Set(['tactical_analyst', 'performance_analyst', 'fitness_coach', 'rehab_coach', 'individual_dev_coach']);

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
    this.trainingSystem = null;
    this._sharedAssets = null;
    this._frameCounter = 0;
    this.lodCounts = [0, 0, 0, 0];
    this._avoidOut = { vx: 0, vz: 0, waiting: false };
    this._avoidOpts = { out: this._avoidOut, useSpatialGrid: true, skipWhiskers: false };
  }

  _getSharedAssets() {
    if (this._sharedAssets || typeof THREE === 'undefined') return this._sharedAssets;
    this._sharedAssets = {
      boardGeo: markSharedAsset(new THREE.BoxGeometry(0.28, 0.02, 0.36)),
      boardMat: markSharedAsset(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 })),
      tabletGeo: markSharedAsset(new THREE.BoxGeometry(0.24, 0.016, 0.30)),
      tabletMat: markSharedAsset(new THREE.MeshStandardMaterial({ color: 0x1e293b, emissive: 0x0ea5e9, emissiveIntensity: 0.35 })),
      bibGeo: markSharedAsset(new THREE.BoxGeometry(0.43, 0.42, 0.255)),
      bibMat: markSharedAsset(new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.45 }))
    };
    return this._sharedAssets;
  }

  // Giải phóng an toàn geometry/material không dùng chung khi xóa/tái tạo NPC (tuyệt đối KHÔNG dispose sharedAsset!)
  _disposeMeshTree(mesh) {
    if (!mesh || typeof mesh.traverse !== 'function') return;
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

  createNpcRecord(p, idx, trainingAtStart = false) {
    const mesh = this.charFactory.createHumanoid({
      outfit: p.outfit || (p.isPlayer ? 'player_home' : p.isCoachingStaff ? 'coach_psg' : 'suit_navy'),
      skinTone: p.skin || 0xf2c6a0,
      hairColor: p.hair || 0x2c1d11,
      hairStyle: p.hairStyle ?? (idx % 3),
      heightScale: p.heightScale || (0.96 + (idx % 5) * 0.02),
      jerseyColor: p.jerseyColor || (p.position === 'GK' ? 0xfacc15 : 0x00205b)
    });

    if (p.isCoachingStaff) this.attachCoachProp(mesh, p.roleKey);

    const seatRotY = this.getCorrectDeskRotation(p);
    const restSpot = p.isPlayer ? PLAYER_REST_SPOTS[idx % PLAYER_REST_SPOTS.length] : (p.home || { x: 0, z: 6 });
    let startX = p.home?.x ?? 0;
    let startZ = p.home?.z ?? -152;
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
      startX = 0;
      startZ = -130.5;
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
      timer: 2.5 + (idx % 7) * 1.5,
      memory: p.memory || [],
      speed: p.isPlayer ? 3.8 : (p.id === 'npc_coach' || p.isCoachingStaff ? 3.5 : 2.15),
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

    // Thêm áo tập phân đội (bib) dùng chung geometry/material (sharedAsset = true)
    if (p.isPlayer && mesh.userData?.rig?.torso) {
      const assets = this._getSharedAssets();
      if (assets) {
        const bib = new THREE.Mesh(assets.bibGeo, assets.bibMat);
        bib.position.y = 0.27;
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
    if (removed.id) this.npcById.delete(removed.id);
    if (this.summonedPlayerNpc === removed) this.summonedPlayerNpc = null;
    if (removed.mesh) {
      this.group.remove(removed.mesh);
      this._disposeMeshTree(removed.mesh);
    }
    if (!skipRebuild) this.rebuildRaycastMeshes();
    return true;
  }

  // Đồng bộ danh sách cầu thủ đội một PSG vào thế giới 3D (tối đa 16 cầu thủ active trên sân tập & phòng thay đồ để mượt trên iPhone)
  syncSquadPlayers(psgSquad, currentClockHour = 9.5) {
    const validIds = new Set(psgSquad.map((p) => p.id));
    // Xóa NPC cầu thủ đã bị bán / cho mượn + giải phóng buffer an toàn + dọn summonedPlayerNpc nếu trùng
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const n = this.npcs[i];
      if (n.isPlayer && n.playerId && !validIds.has(n.playerId)) {
        if (this.summonedPlayerNpc === n) this.summonedPlayerNpc = null;
        if (n.id) this.npcById.delete(n.id);
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

    const maxVisiblePlayers = 16;

    // Đảm bảo mọi cầu thủ mới mua / mới đôn lên đội một đều có NPC thực tế trong thế giới 3D!
    const candidates = [...psgSquad].sort((a, b) => (b.justJoined ? 1 : 0) - (a.justJoined ? 1 : 0) || b.ovr - a.ovr);
    for (let idx = 0; idx < candidates.length; idx++) {
      const p = candidates[idx];
      const existingNpc = existingByPlayerId.get(p.id);
      if (existingNpc) {
        existingNpc.name = p.name;
        existingNpc.role = `${p.position} · #${p.shirtNumber || ''} PSG`;
        existingNpc.skill = p.ovr;
        existingNpc.morale = p.morale;
        existingNpc.position = p.position;
        continue;
      }
      if (playerNpcCount >= maxVisiblePlayers && !p.justJoined) continue;
      let hash = 0;
      for (let c = 0; c < p.id.length; c++) hash += p.id.charCodeAt(c);
      const pitchX = p.position === 'GK' ? -33.0 : (-24 + ((idx * 7) % 48));
      const pitchZ = p.position === 'GK' ? -152.0 : (-166 + ((idx * 5) % 28));
      const profile = {
        id: `npc_pl_${p.id}`,
        playerId: p.id,
        name: p.name,
        role: `${p.position} · #${p.shirtNumber || ''} PSG`,
        dept: 'Đội Một PSG',
        position: p.position,
        age: p.age,
        gender: 'Nam',
        personality: p.personality || 'Tham vọng',
        skill: p.ovr,
        morale: p.morale || 84,
        relation: 82,
        outfit: p.position === 'GK' ? 'player_away' : 'player_home',
        jerseyColor: p.position === 'GK' ? 0xfacc15 : 0x00205b,
        skin: skinPalette[hash % skinPalette.length],
        hair: hairPalette[hash % hairPalette.length],
        hairStyle: hash % 3,
        home: { x: pitchX, z: pitchZ },
        isPlayer: true,
        task: 'Sẵn sàng tập luyện cùng đội một PSG'
      };
      const added = this.addNpc(profile, currentClockHour, true);
      if (added) {
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
      // Nếu đích đến nằm trong Nhà làm việc mà cầu thủ không được triệu tập -> chuyển hướng về Phòng Thay Đồ!
      if (PathfindingSystem.isHqInteriorPoint(targetX, targetZ)) {
        const safeSpot = (npc.restSpot && !PathfindingSystem.isHqInteriorPoint(npc.restSpot.x, npc.restSpot.z))
          ? npc.restSpot
          : { x: -35.5, z: -39.0 };
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
          : { x: -35.5, z: -39.0 };
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

  // Phân loại 4 tầng Simulation & Animation LOD có trễ (hysteresis 2m chống nhấp nháy ranh giới)
  // KHÔNG BAO GIỜ ghi đè n.mesh.visible (chỉ đọc từ ParcDesPrincesZone.updateStreaming!)
  _computeNpcLod(n, focusPos, playerPos) {
    // Luôn giữ LOD 0 cho NPC đang tham gia Lễ ký kết/Họp báo hoặc đang được Chủ tịch triệu tập
    if (
      n === this.summonedPlayerNpc ||
      n.mode === 'event_travel' ||
      n.mode === 'event_hold' ||
      n.mode === 'going_president' ||
      n.mode === 'sit_president'
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
    } else if (n.mode === 'returning') {
      const homeChair = this.campus?.hasChairAt ? this.campus.hasChairAt(n.home.x, n.home.z, 0.78) : false;
      n.mode = n.isPlayer ? (trainingNow ? 'train' : 'rest') : (homeChair ? 'work_pc' : 'stand_duty');
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
        : { x: -35.5, z: -39.0 };
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
    this._finalizeArrivalMode(n, trainingNow);
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
      const safeSpot = n.restSpot || { x: -35.5, z: -39.0 };
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

  // Cập nhật theo lịch/sự kiện cho NPC ở LOD 3 (tần suất thấp ~1.6Hz, 0 A*, 0 avoidance, 0 animation, 0 roam)
  _updateNpcLod3(n, stepDt, trainingNow, drNow, clockHour) {
    if (n.mesh.userData?.coachProp) {
      n.mesh.userData.coachProp.visible = COACH_PROP_STATES.has(n.drillAnim || n.mode);
    }

    // 1. HLV trưởng
    if (n.id === 'npc_coach' && !this.meetingActive && n.mode !== 'going_meeting' && n.mode !== 'meeting' && n.mode !== 'task_travel' && n.mode !== 'task_working' && n.mode !== 'event_travel' && n.mode !== 'event_hold') {
      if (drNow && clockHour >= 9.0 && clockHour < 9.25) {
        n.task = 'Đang phổ biến chiến thuật đầu buổi tập tại Phòng Thay Đồ PSG';
        if (Math.hypot((n.finalDest?.x ?? 0) - (-34.5), (n.finalDest?.z ?? 0) - (-44.8)) > 1.5) {
          this._setLod3LogicalDestination(n, -34.5, -44.8);
          n.mode = 'supervise_walk';
        }
      } else if (trainingNow) {
        n.task = 'Trực tiếp điều hành & quan sát toàn bộ buổi tập PSG tại SVĐ Parc des Princes';
        if (n.mode !== 'supervise' && n.mode !== 'supervise_walk') {
          this._setLod3LogicalDestination(n, 0, -130.5);
          n.mode = 'supervise_walk';
        }
      } else {
        n.task = 'Phân tích băng hình đối thủ và lên giáo án tại Phòng HLV Trưởng';
        if (n.mode === 'supervise' || n.mode === 'supervise_walk') {
          this._setLod3LogicalDestination(n, n.home.x, n.home.z);
          n.mode = 'returning';
        }
      }
    }

    // 2. 11 Trợ lý Ban huấn luyện
    if (n.isCoachingStaff && n.id !== 'npc_coach' && !this.meetingActive && n.mode !== 'task_travel' && n.mode !== 'task_working') {
      if (trainingNow && n.pitchSpot) {
        if (n.mode !== 'coach_drill' && n.mode !== 'coach_walk') {
          this._setLod3LogicalDestination(n, n.pitchSpot.x, n.pitchSpot.z);
          n.mode = 'coach_walk';
        }
      } else if (!trainingNow && (n.mode === 'coach_drill' || n.mode === 'coach_walk')) {
        this._setLod3LogicalDestination(n, n.home.x, n.home.z);
        n.mode = 'returning';
      }
    }

    // 3. Cầu thủ đội một
    if (n.isPlayer && n !== this.summonedPlayerNpc && n.mode !== 'going_president' && n.mode !== 'sit_president' && n.mode !== 'event_travel' && n.mode !== 'event_hold') {
      if (drNow) {
        if (n.bibMesh) n.bibMesh.visible = false;
        n.task = 'Có mặt tại Phòng Thay Đồ thay trang phục & chuẩn bị giáo án';
        if (n.mode !== 'dressing') {
          n.mode = 'dressing';
          this._setLod3LogicalDestination(n, n.restSpot.x, n.restSpot.z);
        }
      } else if (trainingNow) {
        if (n.mode === 'rest' || n.mode === 'dressing' || n.mode === 'returning') {
          n.mode = 'train';
          this._setLod3LogicalDestination(n, n.home.x, n.home.z);
        }
      } else {
        if (n.bibMesh) n.bibMesh.visible = false;
        n.task = 'Nghỉ ngơi & phục hồi thể lực tại Phòng Thay Đồ Cầu Thủ PSG';
        if (n.mode === 'train' || n.mode === 'drill' || n.mode === 'dressing') {
          n.mode = 'rest';
          this._setLod3LogicalDestination(n, n.restSpot.x, n.restSpot.z);
        }
      }
    }

    // Kiểm tra cầu thủ được TrainingSystem đổi đích logic khi đang ở LOD 3
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

    let vx, vz, waiting = false;
    if (lod <= 1) {
      this._avoidOpts.useSpatialGrid = true;
      this._avoidOpts.skipWhiskers = (lod === 1 && n.stuckTimer <= 0.35);
      const av = this.pathfinder.computeAvoidanceVelocity(n, dirX, dirZ, n.speed, this.npcs, playerPos, this._avoidOpts);
      vx = av.vx;
      vz = av.vz;
      waiting = av.waiting;
    } else {
      // LOD 2 (xa): di chuyển thẳng theo waypoint, KHÔNG raycast avoidance
      vx = dirX * n.speed;
      vz = dirZ * n.speed;
    }

    if (waiting) {
      n.waitTimer = 0.55;
      n._velX = 0;
      n._velZ = 0;
      if (lod <= 1) this.animSystem.updateRig(n.mesh, 'idle', dt, 1.0, lod);
      return true;
    }

    const stepDist = Math.hypot(vx * dt, vz * dt);
    const clampedFactor = stepDist > dist ? dist / Math.max(0.0001, stepDist) : 1.0;
    const rawX = n.mesh.position.x + vx * dt * clampedFactor;
    const rawZ = n.mesh.position.z + vz * dt * clampedFactor;

    const curInHq = PathfindingSystem.isHqInteriorPoint(n.mesh.position.x, n.mesh.position.z);
    let nextX = rawX;
    let nextZ = rawZ;
    if (lod <= 1 && this.campus) {
      const res = this.campus.resolveCollision(rawX, rawZ, 0.34);
      nextX = res.x;
      nextZ = res.z;
    }

    // Hàng rào cứng (áp dụng cho MỌI LOD!): Cầu thủ không có lệnh triệu tập / sự kiện TUYỆT ĐỐI KHÔNG được bước chân vào Nhà làm việc!
    if (n.isPlayer && !this.isAuthorizedHqVisit(n) && !curInHq && PathfindingSystem.isHqInteriorPoint(nextX, nextZ)) {
      n._velX = 0;
      n._velZ = 0;
      const safeSpot = n.restSpot || { x: -35.5, z: -39.0 };
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
    if (movedDist > 0.003) {
      const targetYaw = Math.atan2((nextX - n.lastPosX) || vx, (nextZ - n.lastPosZ) || vz);
      n.mesh.rotation.y = lerpAngle(n.mesh.rotation.y, targetYaw, dt * 10);
      n.stuckTimer = Math.max(0, n.stuckTimer - dt * 1.5);
    } else if (lod <= 1) {
      n.stuckTimer += dt;
    }
    n.lastPosX = nextX;
    n.lastPosZ = nextZ;

    if (n.replanCooldown > 0) n.replanCooldown -= dt;

    // Chống kẹt (chỉ cho LOD 0/1; LOD 2 không chạy local grid A* replan)
    if (lod <= 1 && n.stuckTimer > 1.0 && n.replanCooldown <= 0) {
      n.stuckTimer = 0;
      n.replanCooldown = 1.6;
      if (n.mode === 'roam') {
        n.mode = 'work_pc';
        this.setNpcDestination(n, n.home.x, n.home.z);
      } else if (n.finalDest) {
        const altPath = this.pathfinder.findLocalGridPath(n.mesh.position.x, n.mesh.position.z, n.finalDest.x, n.finalDest.z, 260);
        if (altPath.length > 0) {
          n.path = altPath;
          n.pathIdx = 0;
          n.target.set(altPath[0].x, 0.14, altPath[0].z);
        }
      }
    }

    // Hoạt ảnh bước chân đồng bộ vận tốc thực & LOD tier
    const animState = n.isPlayer && (n.mode === 'train' || n.mode === 'drill')
      ? (n.speed > 4.2 ? 'run' : 'train')
      : 'walk';
    const actualSpeed = dt > 0.0001 ? movedDist / dt : n.speed;
    const speedFactor = animState === 'run'
      ? Math.max(0.75, Math.min(1.35, actualSpeed / 4.6))
      : Math.max(0.6, Math.min(1.25, actualSpeed / 2.6));
    this.animSystem.updateRig(n.mesh, animState, Math.min(0.1, dt), speedFactor, lod);
    return true;
  }

  update(dt, playerPos, clockHour = 9.5, onScheduleToast = null, coachName = 'Luis Enrique', options = null) {
    this._frameCounter = (this._frameCounter + 1) & 0x3fffffff;
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
          ? `⚽ Đã đến giờ tập! HLV ${coachName} và toàn đội PSG đã ra SVĐ Parc des Princes tập luyện 3D.`
          : `☕ Kết thúc ca tập tại Parc des Princes! Đội một PSG về Phòng Thay Đồ phục hồi và BHL tổng hợp báo cáo.`);
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

    // Xác định vùng tập luyện Parc des Princes có đang active (người chơi gần SVĐ hoặc đang mở CCTV SVĐ) không
    let trainingZoneActive = true;
    if (options && typeof options.stadiumTrainingVisible === 'boolean') {
      trainingZoneActive = options.stadiumTrainingVisible;
    } else if (focusPos) {
      const sdx = focusPos.x;
      const sdz = focusPos.z + 152;
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

    const npcs = this.npcs;
    const frameCounter = this._frameCounter;

    for (let idx = 0; idx < npcs.length; idx++) {
      const n = npcs[idx];
      if (!n.mesh) continue;

      const prevLod = n._lod ?? 0;
      const lod = this._computeNpcLod(n, focusPos, playerPos);
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

      // Phân tầng tần suất cập nhật cho LOD 0 / LOD 1 / LOD 2 với accumulated dt
      let stepDt = dt;
      if (lod === 1) {
        n._accDt = (n._accDt || 0) + dt;
        if (!scheduleEdge && ((frameCounter + idx) % stride1) !== 0) continue;
        stepDt = Math.min(0.1, n._accDt);
        n._accDt = 0;
      } else if (lod === 2) {
        n._accDt = (n._accDt || 0) + dt;
        if (!scheduleEdge && ((frameCounter + idx) % stride2) !== 0) continue;
        stepDt = Math.min(0.15, n._accDt);
        n._accDt = 0;
      } else {
        n._accDt = 0;
      }

      const pathOpts = lod === 2 ? SKIP_LOCAL_GRID_OPTS : EMPTY_PATH_OPTS;

      // Ẩn/hiện bảng chiến thuật hoặc tablet của BHL (tra cứu Set O(1), không cấp phát mảng)
      if (n.mesh.userData?.coachProp) {
        n.mesh.userData.coachProp.visible = COACH_PROP_STATES.has(n.drillAnim || n.mode);
      }

      // 1. Hành vi HLV trưởng khi không bận họp Ban lãnh đạo / Sự kiện ký kết
      if (n.id === 'npc_coach' && !this.meetingActive && n.mode !== 'going_meeting' && n.mode !== 'meeting' && n.mode !== 'task_travel' && n.mode !== 'task_working' && n.mode !== 'event_travel' && n.mode !== 'event_hold') {
        if (drNow && clockHour >= 9.0 && clockHour < 9.25) {
          n.task = 'Đang phổ biến chiến thuật đầu buổi tập tại Phòng Thay Đồ PSG';
          if (Math.hypot((n.finalDest?.x ?? 0) - (-34.5), (n.finalDest?.z ?? 0) - (-44.8)) > 1.5) {
            this.setNpcDestination(n, -34.5, -44.8, pathOpts);
            n.mode = 'supervise_walk';
          }
        } else if (trainingNow) {
          n.task = 'Trực tiếp điều hành & quan sát toàn bộ buổi tập PSG tại SVĐ Parc des Princes';
          if (n.mode !== 'supervise' && n.mode !== 'supervise_walk') {
            this.setNpcDestination(n, 0, -130.5, pathOpts);
            n.mode = 'supervise_walk';
          }
        } else {
          n.task = 'Phân tích băng hình đối thủ và lên giáo án tại Phòng HLV Trưởng';
          if (n.mode === 'supervise' || n.mode === 'supervise_walk') {
            this.setNpcDestination(n, n.home.x, n.home.z, pathOpts);
            n.mode = 'returning';
          }
        }
      }

      // 2. Hành vi 11 Trợ lý Ban huấn luyện
      if (n.isCoachingStaff && n.id !== 'npc_coach' && !this.meetingActive && n.mode !== 'task_travel' && n.mode !== 'task_working') {
        if (trainingNow && n.pitchSpot) {
          if (n.mode !== 'coach_drill' && n.mode !== 'coach_walk') {
            this.setNpcDestination(n, n.pitchSpot.x, n.pitchSpot.z, pathOpts);
            n.mode = 'coach_walk';
          }
        } else if (!trainingNow && (n.mode === 'coach_drill' || n.mode === 'coach_walk')) {
          this.setNpcDestination(n, n.home.x, n.home.z, pathOpts);
          n.mode = 'returning';
        }
      }

      // 3. Hành vi Cầu thủ đội một (khi không bị triệu tập lên phòng Chủ tịch hoặc đang dự Lễ ký kết / Họp báo)
      if (n.isPlayer && n !== this.summonedPlayerNpc && n.mode !== 'going_president' && n.mode !== 'sit_president' && n.mode !== 'event_travel' && n.mode !== 'event_hold') {
        if (drNow) {
          if (n.bibMesh) n.bibMesh.visible = false;
          n.task = 'Có mặt tại Phòng Thay Đồ thay trang phục & chuẩn bị giáo án';
          if (n.mode !== 'dressing') {
            n.mode = 'dressing';
            this.setNpcDestination(n, n.restSpot.x, n.restSpot.z, pathOpts);
          }
        } else if (trainingNow) {
          if (n.mode === 'rest' || n.mode === 'dressing' || n.mode === 'returning') {
            n.mode = 'train';
            this.setNpcDestination(n, n.home.x, n.home.z, pathOpts);
          }
        } else {
          if (n.bibMesh) n.bibMesh.visible = false;
          n.task = 'Nghỉ ngơi & phục hồi thể lực tại Phòng Thay Đồ Cầu Thủ PSG';
          if (n.mode === 'train' || n.mode === 'drill' || n.mode === 'dressing') {
            n.mode = 'rest';
            this.setNpcDestination(n, n.restSpot.x, n.restSpot.z, pathOpts);
          }
        }
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
              Math.max(-28, Math.min(28, n.home.x + (Math.random() - 0.5) * 16)),
              0.14,
              Math.max(-170, Math.min(-134, n.home.z + (Math.random() - 0.5) * 12))
            );
          }
          if (animateStationary) this.animSystem.updateRig(n.mesh, 'train', animDt, 1.0, lod);
        }
      } else if (n.isPlayer && (n.mode === 'rest' || n.mode === 'dressing')) {
        if (animateStationary) this.animSystem.updateRig(n.mesh, n.mode === 'dressing' ? 'talk' : 'idle', animDt, 1.0, lod);
      } else {
        if (n.mode === 'work_pc') n.mesh.rotation.y = n.seatRotY;
        n.timer -= stepDt;
        if (n.timer <= 0 && !this.meetingActive && lod <= 1) {
          n.timer = 9 + Math.random() * 10;
          if (n.mode === 'work_pc' && n.id !== 'npc_recep' && n.id !== 'npc_sec') {
            n.mode = 'roam';
            const rx = n.home.x + (Math.random() - 0.5) * 1.8;
            const rz = n.home.z + (n.home.z < 0 ? 1.4 : -1.4);
            this.setNpcDestination(n, rx, rz);
          } else {
            const hasHomeChair = this.campus?.hasChairAt ? this.campus.hasChairAt(n.home.x, n.home.z, 0.78) : false;
            n.mode = hasHomeChair ? 'work_pc' : 'stand_duty';
            this.setNpcDestination(n, n.home.x, n.home.z);
          }
        }
        if (animateStationary) {
          let closeToPlayer = false;
          if (playerPos) {
            const pdx = n.mesh.position.x - playerPos.x;
            const pdz = n.mesh.position.z - playerPos.z;
            closeToPlayer = (pdx * pdx + pdz * pdz) < 4.5 * 4.5;
          }
          const rawAnim = n.mode === 'work_pc'
            ? (n.id === 'npc_sec' ? 'idle' : 'work_pc')
            : n.mode === 'stand_duty'
              ? (closeToPlayer ? 'talk' : 'observe')
              : (closeToPlayer ? 'talk' : 'idle');
          const safeAnim = this.resolveSafePosture(n, rawAnim);
          this.animSystem.updateRig(n.mesh, safeAnim, animDt, 1.0, lod);
        }
      }
    }
  }

  // Bảo vệ tuyệt đối: KHÔNG BAO GIỜ cho nhân vật ngồi trên không ở vị trí không có ghế 3D!
  // Tối ưu bằng cache theo tọa độ (x, z) để tránh gọi hasChairAt/getChairElevationAt lặp lại khi đứng yên.
  resolveSafePosture(n, requestedAnim) {
    const px = n.mesh.position.x;
    const pz = n.mesh.position.z;
    if (SITTING_ANIMS.has(requestedAnim)) {
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

  getById(id) {
    return this.npcById.get(id) || null;
  }
}
