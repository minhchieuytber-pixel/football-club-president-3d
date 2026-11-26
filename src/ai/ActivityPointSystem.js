// src/ai/ActivityPointSystem.js
// Hệ thống Quản lý Điểm Hoạt Động (Activity Points) & Hàng Đợi (Queue System) cho toàn bộ PSG Campus & Player Residence.
// Đảm bảo mỗi ghế, giường, máy tập, giường y tế, bàn ăn, tủ đồ chỉ phục vụ đúng sức chứa (mặc định 1 cầu thủ/slot),
// không bao giờ có 2 NPC đứng trùng hoặc ngồi chồng lên nhau; tự động xếp hàng có khoảng cách khi kín chỗ.

import { RESIDENCE_ROOM_BLUEPRINTS } from '../club/PlayerResidenceSystem.js';

export const INTERACTION_ANIM_MAP = Object.freeze({
  sleep: 'sleep',
  lie_rest: 'lie_rest',
  sit_sofa: 'sit',
  watch_tv: 'watch_tv',
  use_desk: 'use_desk',
  use_wardrobe: 'idle',
  pull_curtain: 'pull_curtain',
  use_door: 'open_door',
  eat: 'eat',
  socialize: 'talk',
  talk: 'talk',
  dress: 'talk',
  gym_treadmill: 'gym_treadmill',
  gym_bike: 'gym_bike',
  gym_weights: 'gym_weights',
  stretch: 'stretch',
  medical_exam: 'lie_rest',
  physio: 'lie_rest',
  cryo: 'idle',
  ice_tub: 'sit',
  biometrics: 'idle',
  recovery_bed: 'lie_rest',
  train_drill: 'train',
  rehab_drill: 'stretch',
  medical_office_desk: 'work_pc',
  medical_report_review: 'observe',
  medical_monitor: 'tablet',
  rehab_office_desk: 'work_pc',
  medical_staff_duty: 'clipboard',
  security_post: 'observe'
});

function createPoint(cfg) {
  return {
    activityPointId: cfg.id,
    area: cfg.area,
    roomNumber: cfg.roomNumber ?? null,
    ownerId: cfg.ownerId ?? null,
    position: { x: cfg.x, y: cfg.y ?? 0.14, z: cfg.z },
    standPosition: cfg.standPosition ? { ...cfg.standPosition } : { x: cfg.x, y: 0.14, z: cfg.z },
    direction: cfg.direction ?? 0,
    capacity: cfg.capacity ?? 1,
    occupiedBy: [],
    reservedBy: null,
    reservedAt: 0,
    availability: 'free',
    interactionType: cfg.interactionType,
    animation: cfg.animation || INTERACTION_ANIM_MAP[cfg.interactionType] || 'idle',
    elevatedY: cfg.elevatedY ?? 0.14,
    label: cfg.label || cfg.id,
    get occupantNpcId() {
      return this.occupiedBy[0] || this.reservedBy || null;
    }
  };
}

export class ActivityPointSystem {
  constructor() {
    this.points = new Map();
    this.byArea = new Map();
    this.byRoom = new Map();
    this.queues = new Map();
    this._npcPointIndex = new Map();
    this._buildDefaultPoints();
  }

  _register(pt) {
    this.points.set(pt.activityPointId, pt);
    if (!this.byArea.has(pt.area)) this.byArea.set(pt.area, []);
    this.byArea.get(pt.area).push(pt);
    if (pt.roomNumber != null) {
      if (!this.byRoom.has(pt.roomNumber)) this.byRoom.set(pt.roomNumber, []);
      this.byRoom.get(pt.roomNumber).push(pt);
    }
  }

  _buildDefaultPoints() {
    this.points.clear();
    this.byArea.clear();
    this.byRoom.clear();
    this.queues.clear();
    this._npcPointIndex.clear();

    // 1. 30 Phòng Cá Nhân tại PSG Player Residence (ROOM 01..30)
    for (let i = 0; i < RESIDENCE_ROOM_BLUEPRINTS.length; i++) {
      const bp = RESIDENCE_ROOM_BLUEPRINTS[i];
      const sSign = bp.side === 'north' ? 1 : -1;
      const toZ = (lz) => bp.doorZ - sSign * lz;
      const n = bp.roomNumber;

      // Giường ngủ cá nhân (ngủ đêm / nghỉ trưa / phục hồi mệt mỏi)
      this._register(createPoint({
        id: `res_room_${n}_bed`,
        area: 'residence_room',
        roomNumber: n,
        x: bp.cx - 0.88,
        y: 0.14,
        z: toZ(4.60),
        standPosition: { x: bp.cx + 0.52, y: 0.14, z: toZ(4.60) },
        direction: sSign > 0 ? Math.PI / 2 : -Math.PI / 2,
        interactionType: 'sleep',
        animation: 'sleep',
        elevatedY: 0.44,
        label: `Giường ngủ ${bp.code}`
      }));

      // Sofa xem TV & thư giãn trong phòng
      this._register(createPoint({
        id: `res_room_${n}_sofa`,
        area: 'residence_room',
        roomNumber: n,
        x: bp.cx - 1.44,
        y: 0.14,
        z: toZ(7.75),
        standPosition: { x: bp.cx + 0.45, y: 0.14, z: toZ(7.75) },
        direction: Math.PI / 2,
        interactionType: 'watch_tv',
        animation: 'watch_tv',
        elevatedY: 0.24,
        label: `Sofa & TV ${bp.code}`
      }));

      // Bàn làm việc / PC phân tích chiến thuật cá nhân
      this._register(createPoint({
        id: `res_room_${n}_desk`,
        area: 'residence_room',
        roomNumber: n,
        x: bp.cx + 1.05,
        y: 0.14,
        z: toZ(9.95),
        standPosition: { x: bp.cx + 0.48, y: 0.14, z: toZ(9.95) },
        direction: Math.PI / 2,
        interactionType: 'use_desk',
        animation: 'use_desk',
        elevatedY: 0.14,
        label: `Bàn làm việc PC ${bp.code}`
      }));

      // Tủ quần áo thay đồ cá nhân
      this._register(createPoint({
        id: `res_room_${n}_wardrobe`,
        area: 'residence_room',
        roomNumber: n,
        x: bp.cx + 0.72,
        y: 0.14,
        z: toZ(1.52),
        standPosition: { x: bp.cx + 0.58, y: 0.14, z: toZ(1.52) },
        direction: Math.PI / 2,
        interactionType: 'use_wardrobe',
        animation: 'idle',
        elevatedY: 0.14,
        label: `Tủ đồ ${bp.code}`
      }));
    }

    // 2. Khu Sinh Hoạt Chung & Khu Ăn Uống / Dinh Dưỡng tại Player Residence
    const loungeSeats = [
      { id: 'res_lounge_sofa_n1', x: 183.1, z: 21.0, sx: 183.1, sz: 19.9, dir: 0, type: 'sit_sofa' },
      { id: 'res_lounge_sofa_n2', x: 184.9, z: 21.0, sx: 184.9, sz: 19.9, dir: 0, type: 'socialize' },
      { id: 'res_lounge_sofa_s1', x: 183.1, z: 16.0, sx: 183.1, sz: 17.1, dir: Math.PI, type: 'sit_sofa' },
      { id: 'res_lounge_sofa_s2', x: 184.9, z: 16.0, sx: 184.9, sz: 17.1, dir: Math.PI, type: 'socialize' },
      { id: 'res_lounge_alcove_w', x: 175.875, z: 19.9, sx: 175.875, sz: 19.5, dir: 0, type: 'sit_sofa' },
      { id: 'res_lounge_alcove_e', x: 192.125, z: 19.9, sx: 192.125, sz: 19.5, dir: 0, type: 'sit_sofa' },
      { id: 'res_lobby_sofa_1', x: 180.0, z: -0.3, sx: 180.9, sz: -0.3, dir: Math.PI / 2, type: 'sit_sofa' },
      { id: 'res_lobby_sofa_2', x: 180.0, z: 1.1, sx: 180.9, sz: 1.1, dir: Math.PI / 2, type: 'socialize' },
      { id: 'res_lounge_chat_w', x: 177.2, z: 14.2, sx: 177.2, sz: 14.2, dir: Math.PI / 4, type: 'socialize' },
      { id: 'res_lounge_chat_e', x: 190.8, z: 14.2, sx: 190.8, sz: 14.2, dir: -Math.PI / 4, type: 'socialize' }
    ];
    for (let i = 0; i < loungeSeats.length; i++) {
      const s = loungeSeats[i];
      this._register(createPoint({
        id: s.id,
        area: 'residence_lounge',
        x: s.x,
        z: s.z,
        standPosition: { x: s.sx, y: 0.14, z: s.sz },
        direction: s.dir,
        interactionType: s.type,
        elevatedY: s.type === 'sit_sofa' ? 0.24 : 0.14,
        label: 'Khu Sinh Hoạt Chung Residence'
      }));
    }

    // Khu ăn uống / dinh dưỡng (dọc Sảnh Bắc & Lounge Dinh Dưỡng Residence, cách nhau >= 1.4m)
    const diningSpots = [
      { id: 'res_dining_1', x: 182.2, z: 1.8, dir: Math.PI / 2 },
      { id: 'res_dining_2', x: 182.2, z: 3.4, dir: Math.PI / 2 },
      { id: 'res_dining_3', x: 185.6, z: 1.8, dir: -Math.PI / 2 },
      { id: 'res_dining_4', x: 185.6, z: 3.4, dir: -Math.PI / 2 },
      { id: 'res_dining_5', x: 181.2, z: 14.2, dir: 0 },
      { id: 'res_dining_6', x: 186.8, z: 14.2, dir: 0 },
      { id: 'res_dining_7', x: 174.5, z: 16.2, dir: Math.PI / 2 },
      { id: 'res_dining_8', x: 193.5, z: 16.2, dir: -Math.PI / 2 }
    ];
    for (let i = 0; i < diningSpots.length; i++) {
      const d = diningSpots[i];
      this._register(createPoint({
        id: d.id,
        area: 'residence_dining',
        x: d.x,
        z: d.z,
        direction: d.dir,
        interactionType: 'eat',
        animation: 'eat',
        label: 'Khu Ăn Uống & Dinh Dưỡng PSG'
      }));
    }

    // 3. Phòng Thay Đồ Đội Một (cx=132, cz=-48)
    for (let i = 0; i < 12; i++) {
      this._register(createPoint({
        id: `locker_bench_w_${i + 1}`,
        area: 'locker_room',
        x: 132 - 9.15,
        z: -48 - 8.5 + i * 1.45,
        direction: Math.PI / 2,
        interactionType: 'dress',
        label: `Tủ đồ #${i + 1} Phòng Thay Đồ`
      }));
    }
    for (let i = 0; i < 8; i++) {
      this._register(createPoint({
        id: `locker_bench_n_${i + 1}`,
        area: 'locker_room',
        x: 132 - 7.5 + i * 1.6,
        z: -48 - 9.8,
        direction: 0,
        interactionType: 'dress',
        label: `Tủ đồ #${13 + i} Phòng Thay Đồ`
      }));
    }
    // Bàn họp chiến thuật trung tâm + Sofa + Tủ lạnh + Giường phục hồi
    const drTacSpots = [
      { x: 130.2, z: -50.8, dir: 0 },
      { x: 132.5, z: -50.8, dir: 0 },
      { x: 134.8, z: -50.8, dir: 0 },
      { x: 130.2, z: -47.4, dir: Math.PI },
      { x: 132.5, z: -47.4, dir: Math.PI },
      { x: 134.8, z: -47.4, dir: Math.PI }
    ];
    for (let i = 0; i < drTacSpots.length; i++) {
      this._register(createPoint({
        id: `locker_tactical_${i + 1}`,
        area: 'locker_room',
        x: drTacSpots[i].x,
        z: drTacSpots[i].z,
        direction: drTacSpots[i].dir,
        interactionType: 'talk',
        label: 'Bàn Chiến Thuật Phòng Thay Đồ'
      }));
    }
    this._register(createPoint({
      id: 'locker_sofa_1',
      area: 'locker_room',
      x: 137.8,
      z: -40.8,
      standPosition: { x: 137.8, y: 0.14, z: -42.1 },
      direction: Math.PI,
      interactionType: 'sit_sofa',
      elevatedY: 0.24,
      label: 'Sofa Phòng Thay Đồ'
    }));
    this._register(createPoint({
      id: 'locker_sofa_2',
      area: 'locker_room',
      x: 139.2,
      z: -40.8,
      standPosition: { x: 139.2, y: 0.14, z: -42.1 },
      direction: Math.PI,
      interactionType: 'sit_sofa',
      elevatedY: 0.24,
      label: 'Sofa Phòng Thay Đồ'
    }));
    this._register(createPoint({
      id: 'locker_fridge_1',
      area: 'locker_room',
      x: 140.4,
      z: -39.5,
      direction: Math.PI / 2,
      interactionType: 'eat',
      label: 'Quầy Nước & Dinh Dưỡng Phòng Thay Đồ'
    }));
    this._register(createPoint({
      id: 'locker_recovery_bed',
      area: 'locker_room',
      x: 126.5,
      z: -38.8,
      standPosition: { x: 126.5, y: 0.14, z: -40.2 },
      direction: 0,
      interactionType: 'lie_rest',
      elevatedY: 0.44,
      label: 'Giường Phục Hồi Phòng Thay Đồ'
    }));

    // 4. Trung Tâm Thể Lực & Gym (cx=200, cz=-38)
    for (let i = 0; i < 4; i++) {
      const tx = 188.8 + i * 2.1;
      this._register(createPoint({
        id: `gym_treadmill_${i + 1}`,
        area: 'gym',
        x: tx,
        z: -44.1,
        standPosition: { x: tx, y: 0.14, z: -42.2 },
        direction: Math.PI,
        interactionType: 'gym_treadmill',
        animation: 'gym_treadmill',
        elevatedY: 0.26,
        label: `Máy chạy bộ #${i + 1} PSG Gym`
      }));
    }
    for (let i = 0; i < 3; i++) {
      const bx = 204.5 + i * 2.4;
      this._register(createPoint({
        id: `gym_bike_${i + 1}`,
        area: 'gym',
        x: bx,
        z: -44.0,
        standPosition: { x: bx, y: 0.14, z: -42.2 },
        direction: Math.PI,
        interactionType: 'gym_bike',
        animation: 'gym_bike',
        elevatedY: 0.24,
        label: `Xe đạp thể lực #${i + 1} PSG Gym`
      }));
    }
    [190.5, 194.2].forEach((rx, idx) => {
      this._register(createPoint({
        id: `gym_weights_${idx + 1}`,
        area: 'gym',
        x: rx,
        z: -35.8,
        standPosition: { x: rx, y: 0.14, z: -36.2 },
        direction: 0,
        interactionType: 'gym_weights',
        animation: 'gym_weights',
        elevatedY: 0.14,
        label: `Khung tạ sức mạnh #${idx + 1} PSG Gym`
      }));
    });
    const stretchCoords = [
      { x: 205.5, z: -33.6 },
      { x: 207.5, z: -33.6 },
      { x: 209.5, z: -33.6 },
      { x: 207.5, z: -35.6 }
    ];
    for (let i = 0; i < stretchCoords.length; i++) {
      this._register(createPoint({
        id: `gym_stretch_${i + 1}`,
        area: 'gym',
        x: stretchCoords[i].x,
        z: stretchCoords[i].z,
        direction: Math.PI,
        interactionType: 'stretch',
        animation: 'stretch',
        elevatedY: 0.18,
        label: `Thảm giãn cơ #${i + 1} PSG Gym`
      }));
    }

    // 5. Trung Tâm Y Tế & Phục Hồi PSG (cx=168, cz=-38)
    [158.0, 161.2].forEach((bx, idx) => {
      this._register(createPoint({
        id: `med_exam_${idx + 1}`,
        area: 'medical',
        x: bx,
        z: -31.5,
        standPosition: { x: bx, y: 0.14, z: -33.1 },
        direction: 0,
        interactionType: 'medical_exam',
        animation: 'lie_rest',
        elevatedY: 0.44,
        label: `Giường khám tổng quát #${idx + 1}`
      }));
    });
    [157.8, 161.2].forEach((px, idx) => {
      this._register(createPoint({
        id: `med_physio_${idx + 1}`,
        area: 'medical',
        x: px,
        z: -44.2,
        standPosition: { x: px, y: 0.14, z: -42.4 },
        direction: Math.PI,
        interactionType: 'physio',
        animation: 'lie_rest',
        elevatedY: 0.44,
        label: `Bàn vật lý trị liệu #${idx + 1}`
      }));
    });
    this._register(createPoint({
      id: 'med_cryo_1',
      area: 'medical',
      x: 174.5,
      z: -42.5,
      standPosition: { x: 174.5, y: 0.14, z: -42.1 },
      direction: Math.PI,
      interactionType: 'cryo',
      animation: 'idle',
      elevatedY: 0.14,
      label: 'Buồng Liệu Pháp Lạnh Cryo'
    }));
    this._register(createPoint({
      id: 'med_icetub_1',
      area: 'medical',
      x: 178.2,
      z: -42.3,
      standPosition: { x: 178.2, y: 0.14, z: -42.0 },
      direction: Math.PI,
      interactionType: 'ice_tub',
      animation: 'sit',
      elevatedY: 0.14,
      label: 'Bồn Nước Đá Phục Hồi'
    }));
    this._register(createPoint({
      id: 'med_biometrics_1',
      area: 'medical',
      x: 168.0,
      z: -40.9,
      direction: Math.PI,
      interactionType: 'biometrics',
      animation: 'idle',
      label: 'Trạm Đo Sinh Trắc Học VO2'
    }));
    [173.5, 177.2].forEach((rx, idx) => {
      this._register(createPoint({
        id: `med_quiet_bed_${idx + 1}`,
        area: 'medical',
        x: rx,
        z: -38.8,
        standPosition: { x: rx, y: 0.14, z: -37.2 },
        direction: 0,
        interactionType: 'recovery_bed',
        animation: 'lie_rest',
        elevatedY: 0.44,
        label: `Giường Phục Hồi Yên Tĩnh #${idx + 1}`
      }));
    });

    // 5b. Trạm làm việc Chuyên môn Y tế (Trưởng bộ phận Y tế, Bác sĩ, Vật lý trị liệu, Tiếp nhận báo cáo)
    this._register(createPoint({
      id: 'med_head_desk',
      area: 'medical',
      ownerId: 'npc_med',
      x: 174.5,
      z: -35.5,
      standPosition: { x: 174.5, y: 0.14, z: -35.5 },
      direction: 0,
      interactionType: 'medical_office_desk',
      animation: 'work_pc',
      elevatedY: 0.14,
      label: 'Văn phòng Trưởng Bộ Phận Y Tế'
    }));
    this._register(createPoint({
      id: 'med_report_station',
      area: 'medical',
      x: 170.5,
      z: -33.4,
      standPosition: { x: 170.5, y: 0.14, z: -33.4 },
      direction: 0,
      interactionType: 'medical_report_review',
      animation: 'observe',
      elevatedY: 0.14,
      label: 'Quầy Tiếp Nhận Báo Cáo Y Tế'
    }));
    this._register(createPoint({
      id: 'med_monitor_wall',
      area: 'medical',
      x: 178.4,
      z: -36.5,
      standPosition: { x: 178.0, y: 0.14, z: -36.5 },
      direction: Math.PI / 2,
      interactionType: 'medical_monitor',
      animation: 'tablet',
      elevatedY: 0.14,
      label: 'Màn Hình Theo Dõi Sức Khỏe Cầu Thủ'
    }));
    this._register(createPoint({
      id: 'med_rehab_desk',
      area: 'medical',
      ownerId: 'npc_rehab_coach',
      x: 162.5,
      z: -36.5,
      standPosition: { x: 162.5, y: 0.14, z: -36.5 },
      direction: Math.PI,
      interactionType: 'rehab_office_desk',
      animation: 'work_pc',
      elevatedY: 0.14,
      label: 'Bàn HLV Phục Hồi Thể Lực'
    }));
    this._register(createPoint({
      id: 'med_doctor_station_1',
      area: 'medical',
      x: 159.6,
      z: -33.6,
      standPosition: { x: 159.6, y: 0.14, z: -33.6 },
      direction: 0,
      interactionType: 'medical_staff_duty',
      animation: 'clipboard',
      elevatedY: 0.14,
      label: 'Trạm Bác Sĩ Khám Tổng Quát'
    }));
    this._register(createPoint({
      id: 'med_doctor_station_2',
      area: 'medical',
      x: 159.5,
      z: -42.0,
      standPosition: { x: 159.5, y: 0.14, z: -42.0 },
      direction: Math.PI,
      interactionType: 'medical_staff_duty',
      animation: 'observe',
      elevatedY: 0.14,
      label: 'Trạm Vật Lý Trị Liệu & Cryo'
    }));

    // 6. Sân Tập Chính & Sân Phục Hồi (30 ô phân tán trên cỏ, cách nhau >= 4m)
    for (let i = 0; i < 30; i++) {
      const col = i % 6;
      const row = Math.floor(i / 6);
      const px = 166 + col * 9.5;
      const pz = -102 + row * 7.5;
      this._register(createPoint({
        id: `pitch_slot_${i + 1}`,
        area: 'training_pitch',
        x: px,
        z: pz,
        direction: Math.PI,
        interactionType: 'train_drill',
        animation: 'train',
        label: `Vị trí sân tập #${i + 1}`
      }));
    }
    for (let i = 0; i < 6; i++) {
      this._register(createPoint({
        id: `rehab_pitch_${i + 1}`,
        area: 'rehab_pitch',
        x: 180 + i * 4.8,
        z: -131,
        direction: 0,
        interactionType: 'rehab_drill',
        animation: 'stretch',
        label: `Sân phục hồi #${i + 1}`
      }));
    }
  }

  getPoint(pointId) {
    return this.points.get(pointId) || null;
  }

  getPointsByArea(area) {
    return this.byArea.get(area) || [];
  }

  getPointsByRoom(roomNumber) {
    return this.byRoom.get(Number(roomNumber)) || [];
  }

  getPointForNpc(npcId) {
    const pid = this._npcPointIndex.get(npcId);
    return pid ? this.points.get(pid) || null : null;
  }

  _syncAvailability(pt) {
    if (pt.occupiedBy.length >= pt.capacity) {
      pt.availability = 'occupied';
    } else if (pt.reservedBy) {
      pt.availability = 'reserved';
    } else {
      pt.availability = 'free';
    }
  }

  isPointAvailableForNpc(pt, npcId) {
    if (!pt) return false;
    if (pt.occupiedBy.includes(npcId) || pt.reservedBy === npcId) return true;
    return pt.occupiedBy.length < pt.capacity && !pt.reservedBy;
  }

  reservePoint(pointId, npcId, simTime = 0) {
    const pt = this.points.get(pointId);
    if (!pt || !npcId) return false;

    const prevId = this._npcPointIndex.get(npcId);
    if (prevId && prevId !== pointId) {
      this.releaseNpc(npcId);
    }

    if (pt.occupiedBy.includes(npcId) || pt.reservedBy === npcId) {
      this._npcPointIndex.set(npcId, pointId);
      return true;
    }

    if (pt.occupiedBy.length >= pt.capacity || (pt.reservedBy && pt.reservedBy !== npcId)) {
      return false;
    }

    pt.reservedBy = npcId;
    pt.reservedAt = simTime;
    this._syncAvailability(pt);
    this._npcPointIndex.set(npcId, pointId);
    return true;
  }

  occupyPoint(pointId, npcId) {
    const pt = this.points.get(pointId);
    if (!pt || !npcId) return false;

    const prevId = this._npcPointIndex.get(npcId);
    if (prevId && prevId !== pointId) {
      this.releaseNpc(npcId);
    }

    if (pt.occupiedBy.includes(npcId)) {
      pt.reservedBy = null;
      this._syncAvailability(pt);
      this._npcPointIndex.set(npcId, pointId);
      return true;
    }

    if (pt.occupiedBy.length >= pt.capacity) return false;
    if (pt.reservedBy && pt.reservedBy !== npcId) return false;

    pt.reservedBy = null;
    pt.occupiedBy.push(npcId);
    this._syncAvailability(pt);
    this._npcPointIndex.set(npcId, pointId);
    return true;
  }

  releaseNpc(npcId) {
    if (!npcId) return;
    const pid = this._npcPointIndex.get(npcId);
    if (pid) {
      const pt = this.points.get(pid);
      if (pt) {
        const idx = pt.occupiedBy.indexOf(npcId);
        if (idx !== -1) pt.occupiedBy.splice(idx, 1);
        if (pt.reservedBy === npcId) pt.reservedBy = null;
        this._syncAvailability(pt);
      }
      this._npcPointIndex.delete(npcId);
    }
    this.removeFromAllQueues(npcId);
  }

  releaseRoomPoints(roomNumber) {
    const pts = this.getPointsByRoom(roomNumber);
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      if (pt.reservedBy) this._npcPointIndex.delete(pt.reservedBy);
      for (let j = 0; j < pt.occupiedBy.length; j++) {
        this._npcPointIndex.delete(pt.occupiedBy[j]);
      }
      pt.reservedBy = null;
      pt.occupiedBy.length = 0;
      pt.availability = 'free';
    }
  }

  // Tìm và khóa ngay ActivityPoint trống phù hợp nhất trong area/interactionTypes
  claimAvailablePoint(npcId, opts = {}) {
    if (!npcId) return null;
    const {
      area = null,
      roomNumber = null,
      interactionTypes = null,
      preferNearX = null,
      preferNearZ = null,
      simTime = 0
    } = opts;

    // Nếu NPC đã giữ 1 điểm hợp lệ khớp yêu cầu -> trả lại luôn
    const cur = this.getPointForNpc(npcId);
    if (cur) {
      const areaOk = !area || cur.area === area;
      const roomOk = roomNumber == null || cur.roomNumber === Number(roomNumber);
      const typeOk = !interactionTypes || interactionTypes.includes(cur.interactionType);
      if (areaOk && roomOk && typeOk) return cur;
    }

    let pool = [];
    if (roomNumber != null) {
      pool = this.getPointsByRoom(roomNumber);
    } else if (area) {
      pool = this.getPointsByArea(area);
    } else {
      pool = Array.from(this.points.values());
    }

    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const pt = pool[i];
      if (area && pt.area !== area) continue;
      if (roomNumber != null && pt.roomNumber !== Number(roomNumber)) continue;
      if (interactionTypes && !interactionTypes.includes(pt.interactionType)) continue;
      if (!this.isPointAvailableForNpc(pt, npcId)) continue;

      let score = 0;
      if (typeof preferNearX === 'number' && typeof preferNearZ === 'number') {
        score = Math.hypot(pt.standPosition.x - preferNearX, pt.standPosition.z - preferNearZ);
      } else {
        score = i;
      }
      if (score < bestScore) {
        bestScore = score;
        best = pt;
      }
    }

    if (best && this.reservePoint(best.activityPointId, npcId, simTime)) {
      return best;
    }
    return null;
  }

  // ==================== QUEUE SYSTEM (HÀNG ĐỢI CÓ THỨ TỰ & KHOẢNG CÁCH) ====================
  _getQueue(queueKey) {
    let q = this.queues.get(queueKey);
    if (!q) {
      q = [];
      this.queues.set(queueKey, q);
    }
    return q;
  }

  // Tạo vị trí chờ có khoảng cách đều (>= 1.05m), tránh chồng chéo và tránh đứng chắn ngay trước cửa
  computeQueueWaitSpot(anchorX, anchorZ, dirX, dirZ, index, spacing = 1.05) {
    const mag = Math.hypot(dirX, dirZ) || 1;
    const ux = dirX / mag;
    const uz = dirZ / mag;
    // Xếp hàng lệch nhẹ sang hai bên theo hình chữ chi nhẹ để nhìn tự nhiên & không tụ 1 điểm
    const sideOffset = (index % 2 === 0 ? 1 : -1) * Math.min(0.42, index * 0.14);
    const perpX = -uz;
    const perpZ = ux;
    return {
      x: anchorX + ux * (index * spacing) + perpX * sideOffset,
      z: anchorZ + uz * (index * spacing) + perpZ * sideOffset,
      yaw: Math.atan2(-ux, -uz)
    };
  }

  enqueue(queueKey, npcId, anchor = null, simTime = 0) {
    if (!queueKey || !npcId) return null;
    const q = this._getQueue(queueKey);
    let idx = q.findIndex((e) => e.npcId === npcId);
    if (idx === -1) {
      idx = q.length;
      q.push({
        npcId,
        enqueuedAt: simTime,
        anchor: anchor ? { ...anchor } : null
      });
    } else if (anchor) {
      q[idx].anchor = { ...anchor };
    }
    return this.getQueueEntry(queueKey, npcId);
  }

  getQueueEntry(queueKey, npcId) {
    const q = this.queues.get(queueKey);
    if (!q) return null;
    const idx = q.findIndex((e) => e.npcId === npcId);
    if (idx === -1) return null;
    const item = q[idx];
    const anc = item.anchor || { x: 184, z: 9, dirX: 0, dirZ: 1, spacing: 1.05 };
    const waitSpot = this.computeQueueWaitSpot(
      anc.x,
      anc.z,
      anc.dirX ?? 0,
      anc.dirZ ?? 1,
      idx,
      anc.spacing ?? 1.05
    );
    return {
      queueKey,
      index: idx,
      isHead: idx === 0,
      length: q.length,
      waitSpot
    };
  }

  isQueueHead(queueKey, npcId) {
    const q = this.queues.get(queueKey);
    if (!q || q.length === 0) return true;
    return q[0].npcId === npcId;
  }

  dequeue(queueKey, npcId) {
    const q = this.queues.get(queueKey);
    if (!q) return false;
    const idx = q.findIndex((e) => e.npcId === npcId);
    if (idx === -1) return false;
    q.splice(idx, 1);
    if (q.length === 0) this.queues.delete(queueKey);
    return true;
  }

  removeFromAllQueues(npcId) {
    if (!npcId) return;
    for (const [k, q] of this.queues.entries()) {
      const idx = q.findIndex((e) => e.npcId === npcId);
      if (idx !== -1) {
        q.splice(idx, 1);
        if (q.length === 0) this.queues.delete(k);
      }
    }
  }

  getAreaOccupancySummary() {
    const out = {};
    for (const [area, list] of this.byArea.entries()) {
      let occupied = 0;
      let reserved = 0;
      for (let i = 0; i < list.length; i++) {
        if (list[i].occupiedBy.length > 0) occupied++;
        else if (list[i].reservedBy) reserved++;
      }
      out[area] = { total: list.length, occupied, reserved, free: list.length - occupied - reserved };
    }
    return out;
  }

  exportState() {
    const pointStates = [];
    for (const pt of this.points.values()) {
      if (pt.occupiedBy.length > 0 || pt.reservedBy) {
        pointStates.push({
          id: pt.activityPointId,
          occupiedBy: pt.occupiedBy.slice(),
          reservedBy: pt.reservedBy,
          reservedAt: pt.reservedAt
        });
      }
    }
    const queueStates = [];
    for (const [key, q] of this.queues.entries()) {
      if (q.length > 0) {
        queueStates.push({
          key,
          entries: q.map((e) => ({ npcId: e.npcId, enqueuedAt: e.enqueuedAt, anchor: e.anchor ? { ...e.anchor } : null }))
        });
      }
    }
    return { pointStates, queueStates };
  }

  resetAll() {
    this.importState(null);
  }

  importState(snap) {
    this._npcPointIndex.clear();
    this.queues.clear();
    for (const pt of this.points.values()) {
      pt.occupiedBy.length = 0;
      pt.reservedBy = null;
      pt.reservedAt = 0;
      pt.availability = 'free';
    }
    if (!snap || typeof snap !== 'object') return;

    if (Array.isArray(snap.pointStates)) {
      for (let i = 0; i < snap.pointStates.length; i++) {
        const s = snap.pointStates[i];
        const pt = this.points.get(s?.id);
        if (!pt) continue;
        if (Array.isArray(s.occupiedBy)) {
          for (let j = 0; j < s.occupiedBy.length; j++) {
            const nid = s.occupiedBy[j];
            if (nid && pt.occupiedBy.length < pt.capacity) {
              pt.occupiedBy.push(nid);
              this._npcPointIndex.set(nid, pt.activityPointId);
            }
          }
        }
        if (s.reservedBy && pt.occupiedBy.length < pt.capacity) {
          pt.reservedBy = s.reservedBy;
          pt.reservedAt = s.reservedAt || 0;
          this._npcPointIndex.set(s.reservedBy, pt.activityPointId);
        }
        this._syncAvailability(pt);
      }
    }

    if (Array.isArray(snap.queueStates)) {
      for (let i = 0; i < snap.queueStates.length; i++) {
        const qItem = snap.queueStates[i];
        if (!qItem?.key || !Array.isArray(qItem.entries)) continue;
        this.queues.set(qItem.key, qItem.entries.map((e) => ({
          npcId: e.npcId,
          enqueuedAt: e.enqueuedAt || 0,
          anchor: e.anchor ? { ...e.anchor } : null
        })));
      }
    }
  }
}
