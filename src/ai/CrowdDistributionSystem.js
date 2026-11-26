// src/ai/CrowdDistributionSystem.js
// Hệ thống Điều phối Mật độ Đám đông Toàn Khuôn viên PSG (Global Crowd Distribution & Location Capacity Manager)
// Quản lý sức chứa thực tế từng khu vực, đặt chỗ trước khi di chuyển (Reserve-Before-Walk),
// điều phối làn sóng ra/vào lệch pha (Staggered Waves), chống nghẽn hành lang/cửa & cung cấp Crowd Debug snapshot.

import { RESIDENCE_ROOM_BLUEPRINTS } from '../club/PlayerResidenceSystem.js';

export const CROWD_DENSITY = Object.freeze({
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  FULL: 'FULL',
  OVERCROWDED: 'OVERCROWDED'
});

export const LOCATION_TYPES = Object.freeze({
  OFFICE: 'OFFICE',
  CORRIDOR: 'CORRIDOR',
  LOBBY: 'LOBBY',
  LOCKER_ROOM: 'LOCKER_ROOM',
  GYM: 'GYM',
  MEDICAL: 'MEDICAL',
  DINING: 'DINING',
  LOUNGE: 'LOUNGE',
  RESIDENCE_ROOM: 'RESIDENCE_ROOM',
  TRAINING_PITCH: 'TRAINING_PITCH',
  REHAB_PITCH: 'REHAB_PITCH',
  MEETING_ROOM: 'MEETING_ROOM',
  STADIUM: 'STADIUM',
  EXTERIOR: 'EXTERIOR',
  ACADEMY: 'ACADEMY',
  STORAGE: 'STORAGE'
});

const DENSITY_PENALTY = Object.freeze({
  LOW: 0,
  NORMAL: 1.5,
  HIGH: 8.5,
  FULL: 18.0,
  OVERCROWDED: 26.0
});

// Ánh xạ area của ActivityPointSystem -> locationId trong CrowdDistributionSystem
export const ACTIVITY_AREA_TO_LOCATION = Object.freeze({
  locker_room: 'locker_room',
  medical: 'medical_center',
  gym: 'fitness_gym',
  residence_dining: 'res_dining',
  residence_lounge: 'res_lounge',
  training_pitch: 'training_pitch',
  rehab_pitch: 'rehab_pitch',
  equipment_storage: 'equipment_storage',
  hq_academy: 'hq_academy',
  hq_boardroom: 'hq_boardroom',
  hq_vip: 'hq_vip',
  hq_lobby: 'hq_lobby',
  hq_press_hall: 'hq_press_hall',
  hq_signing_room: 'hq_signing_room',
  club_museum: 'club_museum',
  parc_pitch: 'parc_pitch',
  parc_dugouts: 'parc_dugouts',
  parc_service_hub: 'parc_service_hub'
});

// Ánh xạ hoạt động thay thế khi điểm ưu tiên bị HIGH/FULL/OVERCROWDED
const ALTERNATIVE_LOCATION_POOLS = Object.freeze({
  locker_room: ['tc_plaza', 'res_lounge', 'res_lobby'],
  fitness_gym: ['rehab_pitch', 'res_lounge', 'medical_center', 'residence_room'],
  medical_center: ['res_lounge', 'residence_room', 'tc_plaza'],
  res_dining: ['res_lounge', 'res_lobby', 'residence_room'],
  res_lounge: ['res_lobby', 'residence_room', 'tc_plaza'],
  residence_room: ['res_lounge', 'res_lobby'],
  hq_vip: ['hq_lobby', 'hq_boardroom'],
  hq_boardroom: ['hq_vip', 'hq_lobby'],
  office: ['hq_vip', 'hq_lobby', 'hq_boardroom']
});

export class CrowdDistributionSystem {
  constructor() {
    this.locations = new Map();
    this._locationOrder = []; // Thứ tự ưu tiên kiểm tra vùng (phòng nhỏ/cụ thể trước, hành lang/sân lớn sau)
    this._npcReservationLoc = new Map(); // npcId -> locId
    this._npcOccupancyLoc = new Map(); // npcId -> locId
    this._waves = new Map(); // npcId -> { groupId, waveIndex, releaseTime, targetLocId }
    this._doorLocks = new Map(); // doorKey -> { npcId, direction, priority, expiresAt }
    this._densityGrid = new Map(); // cellKey -> count (8m spatial grid)
    this._gridCounts = {
      moving: 0,
      waiting: 0,
      active: 0,
      stuck: 0,
      total: 0
    };
    this._simTime = 0;
    this._debugEnabled = false;
    this._initDefaultLocations();
  }

  _registerLocation(def) {
    const rec = {
      locationId: def.locationId,
      label: def.label || def.locationId,
      locationType: def.locationType || LOCATION_TYPES.EXTERIOR,
      zone: def.zone || 'campus',
      cx: def.cx ?? 0,
      cz: def.cz ?? 0,
      bounds: def.bounds || null, // [minX, maxX, minZ, maxZ]
      maxCapacity: Math.max(1, Number(def.maxCapacity) || 8),
      priorityLevel: def.priorityLevel ?? 10, // Càng cao càng kiểm tra trước trong getLocationAtPosition
      hqInterior: Boolean(def.hqInterior),
      roomNumber: def.roomNumber ?? null,
      ownerId: null,
      entryPoints: Array.isArray(def.entryPoints) ? def.entryPoints : [],
      exitPoints: Array.isArray(def.exitPoints) ? def.exitPoints : [],
      activityPoints: Array.isArray(def.activityPoints) ? def.activityPoints : [],
      waitingPositions: Array.isArray(def.waitingPositions) ? def.waitingPositions : [],
      currentOccupants: new Set(),
      reservations: new Map(), // npcId -> { npcId, reservedAt, expiresAt, priority }
      waitingNpcs: new Set(),
      lastDensity: CROWD_DENSITY.LOW
    };
    this.locations.set(rec.locationId, rec);
    return rec;
  }

  _rebuildLocationLookupOrder() {
    this._locationOrder = Array.from(this.locations.values()).sort((a, b) => {
      if (b.priorityLevel !== a.priorityLevel) return b.priorityLevel - a.priorityLevel;
      const areaA = a.bounds ? (a.bounds[1] - a.bounds[0]) * (a.bounds[3] - a.bounds[2]) : 1e9;
      const areaB = b.bounds ? (b.bounds[1] - b.bounds[0]) * (b.bounds[3] - b.bounds[2]) : 1e9;
      return areaA - areaB;
    });
  }

  _initDefaultLocations() {
    this.locations.clear();

    // ===== 1. TRỤ SỞ CHÍNH HQ (x ∈ [-34, 58], z ∈ [-22, 22]) =====
    this._registerLocation({
      locationId: 'hq_president', label: 'Phòng Chủ tịch', locationType: LOCATION_TYPES.OFFICE,
      zone: 'hq', cx: -26, cz: -13.5, bounds: [-34, -18, -22, -5], maxCapacity: 4, priorityLevel: 30, hqInterior: true,
      entryPoints: [{ x: -24.5, z: -5.2 }], exitPoints: [{ x: -24.5, z: -4.2 }],
      waitingPositions: [{ x: -22.5, z: -2.0 }, { x: -26.5, z: -2.0 }]
    });
    this._registerLocation({
      locationId: 'hq_boardroom', label: 'Phòng Họp Hội đồng', locationType: LOCATION_TYPES.MEETING_ROOM,
      zone: 'hq', cx: -10, cz: -12.5, bounds: [-18, -2, -22, -5], maxCapacity: 12, priorityLevel: 30, hqInterior: true,
      entryPoints: [{ x: -10, z: -5.2 }], exitPoints: [{ x: -10, z: -4.0 }],
      waitingPositions: [{ x: -12, z: -2.0 }, { x: -8, z: -2.0 }]
    });
    this._registerLocation({
      locationId: 'hq_vip', label: 'Khu VIP Trụ sở', locationType: LOCATION_TYPES.LOUNGE,
      zone: 'hq', cx: 3, cz: -12.5, bounds: [-2, 8, -22, -5], maxCapacity: 8, priorityLevel: 30, hqInterior: true,
      entryPoints: [{ x: 3, z: -5.2 }], exitPoints: [{ x: 3, z: -4.0 }],
      waitingPositions: [{ x: 1.5, z: -2.0 }, { x: 4.5, z: -2.0 }]
    });
    this._registerLocation({
      locationId: 'hq_ceo', label: 'Phòng CEO', locationType: LOCATION_TYPES.OFFICE,
      zone: 'hq', cx: 12.5, cz: -12.5, bounds: [8, 17, -22, -5], maxCapacity: 4, priorityLevel: 30, hqInterior: true,
      entryPoints: [{ x: 12.5, z: -5.2 }], exitPoints: [{ x: 12.5, z: -4.0 }]
    });
    this._registerLocation({
      locationId: 'hq_vp', label: 'Phòng Phó Chủ tịch', locationType: LOCATION_TYPES.OFFICE,
      zone: 'hq', cx: 21.2, cz: -12.5, bounds: [17, 25.5, -22, -5], maxCapacity: 4, priorityLevel: 30, hqInterior: true,
      entryPoints: [{ x: 21.2, z: -5.2 }], exitPoints: [{ x: 21.2, z: -4.0 }]
    });
    this._registerLocation({
      locationId: 'hq_sporting', label: 'Phòng Giám đốc Thể thao', locationType: LOCATION_TYPES.OFFICE,
      zone: 'hq', cx: 29.7, cz: -12.5, bounds: [25.5, 34, -22, -5], maxCapacity: 5, priorityLevel: 30, hqInterior: true,
      entryPoints: [{ x: 29.7, z: -5.2 }], exitPoints: [{ x: 29.7, z: -4.0 }]
    });
    this._registerLocation({
      locationId: 'hq_coaching', label: 'Phòng Ban Huấn luyện', locationType: LOCATION_TYPES.OFFICE,
      zone: 'hq', cx: -27, cz: 6.5, bounds: [-34, -20, 3.5, 10.2], maxCapacity: 8, priorityLevel: 30, hqInterior: true,
      entryPoints: [{ x: -27, z: 3.5 }], exitPoints: [{ x: -27, z: 2.2 }]
    });
    this._registerLocation({
      locationId: 'hq_scouting', label: 'Phòng Tuyển trạch', locationType: LOCATION_TYPES.OFFICE,
      zone: 'hq', cx: -13, cz: 6.5, bounds: [-20, -6, 3.5, 10.2], maxCapacity: 8, priorityLevel: 30, hqInterior: true,
      entryPoints: [{ x: -13, z: 3.5 }], exitPoints: [{ x: -13, z: 2.2 }]
    });
    this._registerLocation({
      locationId: 'hq_finance', label: 'Phòng Tài chính & Pháp lý', locationType: LOCATION_TYPES.OFFICE,
      zone: 'hq', cx: 13, cz: 6.5, bounds: [6, 20, 3.5, 10.2], maxCapacity: 8, priorityLevel: 30, hqInterior: true,
      entryPoints: [{ x: 13, z: 3.5 }], exitPoints: [{ x: 13, z: 2.2 }]
    });
    this._registerLocation({
      locationId: 'hq_media', label: 'Phòng Truyền thông & Marketing', locationType: LOCATION_TYPES.OFFICE,
      zone: 'hq', cx: 27, cz: 6.5, bounds: [20, 34, 3.5, 10.2], maxCapacity: 8, priorityLevel: 30, hqInterior: true,
      entryPoints: [{ x: 27, z: 3.5 }], exitPoints: [{ x: 27, z: 2.2 }]
    });
    this._registerLocation({
      locationId: 'hq_transfers', label: 'Phòng Chuyển nhượng', locationType: LOCATION_TYPES.OFFICE,
      zone: 'hq', cx: -27, cz: 17.9, bounds: [-34, -20, 14.2, 22], maxCapacity: 8, priorityLevel: 30, hqInterior: true,
      entryPoints: [{ x: -27, z: 14.2 }], exitPoints: [{ x: -27, z: 12.8 }]
    });
    this._registerLocation({
      locationId: 'hq_academy', label: 'Phòng Quản lý Học viện', locationType: LOCATION_TYPES.ACADEMY,
      zone: 'hq', cx: -13, cz: 17.9, bounds: [-20, -6, 14.2, 22], maxCapacity: 8, priorityLevel: 30, hqInterior: true,
      entryPoints: [{ x: -13, z: 14.2 }], exitPoints: [{ x: -13, z: 12.8 }]
    });
    this._registerLocation({
      locationId: 'hq_technical', label: 'Phòng Kỹ thuật & Phân tích', locationType: LOCATION_TYPES.OFFICE,
      zone: 'hq', cx: 13, cz: 17.9, bounds: [6, 20, 14.2, 22], maxCapacity: 8, priorityLevel: 30, hqInterior: true,
      entryPoints: [{ x: 13, z: 14.2 }], exitPoints: [{ x: 13, z: 12.8 }]
    });
    this._registerLocation({
      locationId: 'hq_hr', label: 'Phòng Nhân sự & CSVC', locationType: LOCATION_TYPES.OFFICE,
      zone: 'hq', cx: 27, cz: 17.9, bounds: [20, 34, 14.2, 22], maxCapacity: 8, priorityLevel: 30, hqInterior: true,
      entryPoints: [{ x: 27, z: 14.2 }], exitPoints: [{ x: 27, z: 12.8 }]
    });
    this._registerLocation({
      locationId: 'hq_signing_room', label: 'Phòng Ký hợp đồng', locationType: LOCATION_TYPES.MEETING_ROOM,
      zone: 'hq', cx: 46, cz: -10, bounds: [34, 58, -20, -1], maxCapacity: 8, priorityLevel: 30, hqInterior: true,
      entryPoints: [{ x: 34.5, z: -2.0 }], exitPoints: [{ x: 33.5, z: 0 }]
    });
    this._registerLocation({
      locationId: 'hq_press_hall', label: 'Hội trường Họp báo', locationType: LOCATION_TYPES.MEETING_ROOM,
      zone: 'hq', cx: 46, cz: 10, bounds: [34, 58, 1, 20], maxCapacity: 22, priorityLevel: 30, hqInterior: true,
      entryPoints: [{ x: 34.5, z: 2.0 }], exitPoints: [{ x: 33.5, z: 0 }]
    });
    this._registerLocation({
      locationId: 'hq_lobby', label: 'Sảnh Lễ tân Trụ sở', locationType: LOCATION_TYPES.LOBBY,
      zone: 'hq', cx: 0, cz: 15.5, bounds: [-6, 6, 10.2, 22], maxCapacity: 14, priorityLevel: 25, hqInterior: true,
      entryPoints: [{ x: 0, z: 22.8 }, { x: 0, z: 11.2 }], exitPoints: [{ x: 0, z: 24.0 }, { x: 0, z: 11.2 }],
      waitingPositions: [{ x: -3.2, z: 16.5 }, { x: 3.2, z: 16.5 }, { x: -4.2, z: 24.5 }, { x: 4.2, z: 24.5 }]
    });
    this._registerLocation({
      locationId: 'hq_corridor_main', label: 'Hành lang chính HQ', locationType: LOCATION_TYPES.CORRIDOR,
      zone: 'hq', cx: 0, cz: 0, bounds: [-34, 34, -3.5, 3.5], maxCapacity: 18, priorityLevel: 20, hqInterior: true,
      waitingPositions: [{ x: -12, z: 1.8 }, { x: 12, z: -1.8 }]
    });
    this._registerLocation({
      locationId: 'hq_corridor_south', label: 'Hành lang Nam HQ', locationType: LOCATION_TYPES.CORRIDOR,
      zone: 'hq', cx: 0, cz: 12.2, bounds: [-34, 34, 10.2, 14.2], maxCapacity: 14, priorityLevel: 20, hqInterior: true,
      waitingPositions: [{ x: -8, z: 12.8 }, { x: 8, z: 12.8 }]
    });
    this._registerLocation({
      locationId: 'club_museum', label: 'Bảo tàng CLB PSG', locationType: LOCATION_TYPES.LOUNGE,
      zone: 'campus', cx: 34, cz: -44, bounds: [21, 47, -56, -32], maxCapacity: 16, priorityLevel: 25,
      entryPoints: [{ x: 34, z: -32.2 }], exitPoints: [{ x: 34, z: -30.8 }]
    });

    // ===== 2. TRAINING CENTER & PLAYER RESIDENCE =====
    // Phòng thay đồ giới hạn 18 (<30) để bắt buộc điều phối lệch pha (Staggered Entry), không chen chúc 30 người 1 lúc!
    this._registerLocation({
      locationId: 'locker_room', label: 'Phòng Thay Đồ PSG', locationType: LOCATION_TYPES.LOCKER_ROOM,
      zone: 'training_center', cx: 132, cz: -48, bounds: [120, 144, -60, -36], maxCapacity: 18, priorityLevel: 30,
      entryPoints: [{ x: 143, z: -47.5 }], exitPoints: [{ x: 145.5, z: -47.5 }],
      waitingPositions: [
        { x: 147.2, z: -44.8 }, { x: 147.2, z: -50.2 },
        { x: 149.2, z: -44.8 }, { x: 149.2, z: -50.2 },
        { x: 151.2, z: -45.8 }, { x: 151.2, z: -49.2 },
        { x: 153.2, z: -46.5 }, { x: 153.2, z: -48.5 }
      ]
    });
    this._registerLocation({
      locationId: 'equipment_storage', label: 'Kho Dụng cụ Sân tập', locationType: LOCATION_TYPES.STORAGE,
      zone: 'training_center', cx: 136, cz: -74, bounds: [128, 144, -82, -66], maxCapacity: 4, priorityLevel: 30,
      entryPoints: [{ x: 142, z: -74 }], exitPoints: [{ x: 145, z: -74 }]
    });
    this._registerLocation({
      locationId: 'medical_center', label: 'Trung tâm Y tế PSG', locationType: LOCATION_TYPES.MEDICAL,
      zone: 'training_center', cx: 168, cz: -38, bounds: [154, 182, -49, -27], maxCapacity: 12, priorityLevel: 30,
      entryPoints: [{ x: 168, z: -28 }, { x: 168, z: -48 }], exitPoints: [{ x: 168, z: -25.5 }, { x: 168, z: -50.5 }],
      waitingPositions: [
        { x: 165.0, z: -24.0 }, { x: 171.0, z: -24.0 },
        { x: 163.0, z: -24.0 }, { x: 173.0, z: -24.0 }
      ]
    });
    this._registerLocation({
      locationId: 'fitness_gym', label: 'Phòng Gym & Thể lực', locationType: LOCATION_TYPES.GYM,
      zone: 'training_center', cx: 200, cz: -38, bounds: [188, 212, -48, -28], maxCapacity: 13, priorityLevel: 30,
      entryPoints: [{ x: 200, z: -28 }], exitPoints: [{ x: 200, z: -25.5 }],
      waitingPositions: [
        { x: 197.2, z: -24.0 }, { x: 202.8, z: -24.0 },
        { x: 195.2, z: -24.0 }, { x: 204.8, z: -24.0 }
      ]
    });
    this._registerLocation({
      locationId: 'training_pitch', label: 'Sân tập chính PSG', locationType: LOCATION_TYPES.TRAINING_PITCH,
      zone: 'training_center', cx: 192, cz: -86, bounds: [164, 224, -108, -64], maxCapacity: 32, priorityLevel: 25,
      entryPoints: [{ x: 192, z: -63.5 }, { x: 166, z: -72 }], exitPoints: [{ x: 192, z: -61.5 }]
    });
    this._registerLocation({
      locationId: 'rehab_pitch', label: 'Sân tập Phục hồi', locationType: LOCATION_TYPES.REHAB_PITCH,
      zone: 'training_center', cx: 192, cz: -131, bounds: [170, 214, -145, -117], maxCapacity: 10, priorityLevel: 25,
      entryPoints: [{ x: 192, z: -116.5 }], exitPoints: [{ x: 192, z: -114.5 }]
    });
    this._registerLocation({
      locationId: 'tc_plaza', label: 'Quảng trường Training Center', locationType: LOCATION_TYPES.EXTERIOR,
      zone: 'training_center', cx: 168, cz: -18, bounds: [128, 212, -27, -7], maxCapacity: 24, priorityLevel: 12,
      waitingPositions: [
        { x: 158, z: -18 }, { x: 164, z: -18 }, { x: 172, z: -18 }, { x: 178, z: -18 }
      ]
    });

    // Player Residence Tầng 1: Atrium, Dining, Lounge, 2 hành lang & 30 phòng riêng ROOM 01..30
    this._registerLocation({
      locationId: 'res_lobby', label: 'Sảnh Residence', locationType: LOCATION_TYPES.LOBBY,
      zone: 'residence', cx: 184, cz: 2, bounds: [179.5, 188.5, -5.8, 7.5], maxCapacity: 12, priorityLevel: 30,
      entryPoints: [{ x: 184, z: -6.0 }], exitPoints: [{ x: 184, z: -8.0 }],
      waitingPositions: [{ x: 181.2, z: -9.5 }, { x: 186.8, z: -9.5 }, { x: 179.4, z: -11.0 }, { x: 188.6, z: -11.0 }]
    });
    this._registerLocation({
      locationId: 'res_dining', label: 'Phòng Ăn Residence', locationType: LOCATION_TYPES.DINING,
      zone: 'residence', cx: 184, cz: 10.5, bounds: [179.2, 188.8, 7.5, 13.5], maxCapacity: 8, priorityLevel: 30,
      entryPoints: [{ x: 184, z: 7.5 }], exitPoints: [{ x: 184, z: 6.2 }],
      waitingPositions: [{ x: 181.5, z: 5.5 }, { x: 186.5, z: 5.5 }, { x: 181.5, z: 3.8 }, { x: 186.5, z: 3.8 }]
    });
    this._registerLocation({
      locationId: 'res_lounge', label: 'Lounge Cầu thủ Residence', locationType: LOCATION_TYPES.LOUNGE,
      zone: 'residence', cx: 184, cz: 18.5, bounds: [178.5, 189.5, 13.5, 23.8], maxCapacity: 12, priorityLevel: 30,
      entryPoints: [{ x: 184, z: 13.5 }], exitPoints: [{ x: 184, z: 12.5 }],
      waitingPositions: [{ x: 181.2, z: 14.5 }, { x: 186.8, z: 14.5 }]
    });
    this._registerLocation({
      locationId: 'res_corridor_w', label: 'Hành lang Tây Residence', locationType: LOCATION_TYPES.CORRIDOR,
      zone: 'residence', cx: 162, cz: 9, bounds: [144, 179.5, 6.2, 11.8], maxCapacity: 10, priorityLevel: 25
    });
    this._registerLocation({
      locationId: 'res_corridor_e', label: 'Hành lang Đông Residence', locationType: LOCATION_TYPES.CORRIDOR,
      zone: 'residence', cx: 206, cz: 9, bounds: [188.5, 224, 6.2, 11.8], maxCapacity: 10, priorityLevel: 25
    });

    for (let i = 0; i < RESIDENCE_ROOM_BLUEPRINTS.length; i++) {
      const bp = RESIDENCE_ROOM_BLUEPRINTS[i];
      const minZ = bp.side === 'north' ? -6.0 : 12.2;
      const maxZ = bp.side === 'north' ? 5.8 : 24.0;
      this._registerLocation({
        locationId: `res_room_${String(bp.roomNumber).padStart(2, '0')}`,
        label: bp.code,
        locationType: LOCATION_TYPES.RESIDENCE_ROOM,
        zone: 'residence',
        cx: bp.cx,
        cz: bp.cz,
        bounds: [bp.cx - 2.1, bp.cx + 2.1, minZ, maxZ],
        maxCapacity: 1,
        priorityLevel: 40,
        roomNumber: bp.roomNumber,
        entryPoints: [{ x: bp.doorX, z: bp.corridorZ }],
        exitPoints: [{ x: bp.doorX, z: bp.corridorZ }],
        waitingPositions: [{ x: bp.doorX, z: bp.side === 'north' ? bp.corridorZ + 0.8 : bp.corridorZ - 0.8 }]
      });
    }

    // ===== 3. PARC DES PRINCES =====
    this._registerLocation({
      locationId: 'parc_plaza', label: 'Quảng trường Parc des Princes', locationType: LOCATION_TYPES.EXTERIOR,
      zone: 'stadium', cx: 0, cz: -101, bounds: [-35, 35, -112, -88], maxCapacity: 30, priorityLevel: 15
    });
    this._registerLocation({
      locationId: 'parc_pitch', label: 'Sân chính Parc des Princes', locationType: LOCATION_TYPES.STADIUM,
      zone: 'stadium', cx: 0, cz: -152, bounds: [-50, 50, -192, -112], maxCapacity: 32, priorityLevel: 20
    });
    this._registerLocation({
      locationId: 'parc_dugouts', label: 'Khu Kỹ thuật SVĐ', locationType: LOCATION_TYPES.STADIUM,
      zone: 'stadium', cx: 0, cz: -176.5, bounds: [-18, 18, -180, -173], maxCapacity: 14, priorityLevel: 28
    });
    this._registerLocation({
      locationId: 'parc_service_hub', label: 'Khu Dịch vụ & Megastore SVĐ', locationType: LOCATION_TYPES.OFFICE,
      zone: 'stadium', cx: -32, cz: -82, bounds: [-42, -22, -92, -72], maxCapacity: 8, priorityLevel: 25
    });

    // ===== 4. KHUÔN VIÊN NGOÀI TRỜI CHUNG =====
    this._registerLocation({
      locationId: 'campus_grounds', label: 'Khuôn viên PSG Campus', locationType: LOCATION_TYPES.EXTERIOR,
      zone: 'campus', cx: 65, cz: -40, bounds: [-140, 280, -240, 80], maxCapacity: 60, priorityLevel: 1
    });

    this._rebuildLocationLookupOrder();
  }

  getLocation(locId) {
    return this.locations.get(locId) || null;
  }

  mapAreaToLocationId(area, roomNumber = null) {
    if (area === 'residence_room' && roomNumber != null) {
      return `res_room_${String(roomNumber).padStart(2, '0')}`;
    }
    if (ACTIVITY_AREA_TO_LOCATION[area]) return ACTIVITY_AREA_TO_LOCATION[area];
    if (this.locations.has(area)) return area;
    return 'campus_grounds';
  }

  getLocationAtPosition(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 'campus_grounds';
    for (let i = 0; i < this._locationOrder.length; i++) {
      const loc = this._locationOrder[i];
      const b = loc.bounds;
      if (!b) continue;
      if (x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3]) {
        return loc.locationId;
      }
    }
    return 'campus_grounds';
  }

  computeDensity(currentOccupancy, reservedCapacity, maxCapacity) {
    if (currentOccupancy > maxCapacity) return CROWD_DENSITY.OVERCROWDED;
    const total = currentOccupancy + reservedCapacity;
    if (total >= maxCapacity) return CROWD_DENSITY.FULL;
    const ratio = total / Math.max(1, maxCapacity);
    if (ratio >= 0.70) return CROWD_DENSITY.HIGH;
    if (ratio >= 0.40) return CROWD_DENSITY.NORMAL;
    return CROWD_DENSITY.LOW;
  }

  getLocationStats(locId) {
    const loc = this.locations.get(locId);
    if (!loc) return null;
    const currentOccupancy = loc.currentOccupants.size;
    // Chỉ tính reservation của những NPC chưa thực sự có mặt trong currentOccupants
    let reservedCapacity = 0;
    for (const rNpcId of loc.reservations.keys()) {
      if (!loc.currentOccupants.has(rNpcId)) reservedCapacity++;
    }
    const availableCapacity = Math.max(0, loc.maxCapacity - currentOccupancy - reservedCapacity);
    const crowdDensity = this.computeDensity(currentOccupancy, reservedCapacity, loc.maxCapacity);
    loc.lastDensity = crowdDensity;
    return {
      locationId: loc.locationId,
      label: loc.label,
      locationType: loc.locationType,
      zone: loc.zone,
      maxCapacity: loc.maxCapacity,
      currentOccupancy,
      reservedCapacity,
      availableCapacity,
      ratio: (currentOccupancy + reservedCapacity) / Math.max(1, loc.maxCapacity),
      crowdDensity,
      waitingCount: loc.waitingNpcs.size
    };
  }

  syncRoomOwnership(playerResidenceSystem) {
    if (!playerResidenceSystem?.rooms) return;
    for (let i = 0; i < playerResidenceSystem.rooms.length; i++) {
      const rm = playerResidenceSystem.rooms[i];
      const loc = this.locations.get(`res_room_${String(rm.roomNumber).padStart(2, '0')}`);
      if (loc) {
        loc.ownerId = rm.occupantId || null;
      }
    }
  }

  canEnterLocation(locId, npc, priority = 50) {
    const loc = this.locations.get(locId);
    if (!loc) return { allowed: true, reason: 'unknown_passthrough' };

    const npcId = npc?.id || null;
    // Bảo vệ quyền sở hữu tuyệt đối với 30 phòng nghỉ riêng
    if (loc.locationType === LOCATION_TYPES.RESIDENCE_ROOM) {
      if (loc.ownerId && npc?.playerId && loc.ownerId !== npc.playerId) {
        return { allowed: false, reason: 'private_room_denied' };
      }
      if (!loc.ownerId && npc?.isPlayer) {
        return { allowed: false, reason: 'unowned_room_denied' };
      }
    }

    // Nếu NPC đã đang ở trong hoặc đã đặt chỗ trước tại địa điểm này -> luôn được phép
    if (npcId && (loc.currentOccupants.has(npcId) || loc.reservations.has(npcId))) {
      return { allowed: true, reason: 'already_claimed' };
    }

    const stats = this.getLocationStats(locId);
    if (!stats) return { allowed: true, reason: 'no_stats' };

    // Khi OVERCROWDED: chặn mọi lượt vào mới trừ cấp cứu y tế khẩn cấp (priority >= 96)
    if (stats.crowdDensity === CROWD_DENSITY.OVERCROWDED) {
      if (priority >= 96 && stats.currentOccupancy < loc.maxCapacity + 2) {
        return { allowed: true, reason: 'emergency_override', stats };
      }
      return { allowed: false, reason: 'overcrowded', stats };
    }

    // Khi FULL: chặn hoàn toàn lượt vào thường, chỉ cho ưu tiên khẩn cấp (y tế/triệu tập) nếu chưa vượt trần
    if (stats.crowdDensity === CROWD_DENSITY.FULL) {
      if (priority >= 95 && stats.currentOccupancy < loc.maxCapacity) {
        return { allowed: true, reason: 'urgent_override', stats };
      }
      return { allowed: false, reason: 'full', stats };
    }

    // Khi HIGH (>=70%): hạn chế hoạt động tùy chọn / không khẩn cấp (priority < 58)
    if (stats.crowdDensity === CROWD_DENSITY.HIGH && priority < 58) {
      return { allowed: false, reason: 'high_density_optional_defer', stats };
    }

    return { allowed: true, reason: 'ok', stats };
  }

  reserveSlot(locId, npcId, priority = 50, simTime = this._simTime, ttlSec = 48) {
    if (!locId || !npcId) return false;
    const loc = this.locations.get(locId);
    if (!loc) return false;

    const prevResLoc = this._npcReservationLoc.get(npcId);
    if (prevResLoc && prevResLoc !== locId) {
      const prevLoc = this.locations.get(prevResLoc);
      prevLoc?.reservations.delete(npcId);
      this._npcReservationLoc.delete(npcId);
    }

    if (loc.currentOccupants.has(npcId) || loc.reservations.has(npcId)) {
      loc.reservations.set(npcId, {
        npcId,
        reservedAt: simTime,
        expiresAt: simTime + ttlSec,
        priority
      });
      this._npcReservationLoc.set(npcId, locId);
      return true;
    }

    const stats = this.getLocationStats(locId);
    if (stats.availableCapacity <= 0 && priority < 95) {
      return false;
    }

    loc.reservations.set(npcId, {
      npcId,
      reservedAt: simTime,
      expiresAt: simTime + ttlSec,
      priority
    });
    this._npcReservationLoc.set(npcId, locId);
    return true;
  }

  occupyLocation(locId, npcId) {
    if (!locId || !npcId) return false;
    const loc = this.locations.get(locId);
    if (!loc) return false;

    const prevOcc = this._npcOccupancyLoc.get(npcId);
    if (prevOcc && prevOcc !== locId) {
      this.locations.get(prevOcc)?.currentOccupants.delete(npcId);
    }
    const prevRes = this._npcReservationLoc.get(npcId);
    if (prevRes) {
      this.locations.get(prevRes)?.reservations.delete(npcId);
      this._npcReservationLoc.delete(npcId);
    }

    loc.currentOccupants.add(npcId);
    loc.waitingNpcs.delete(npcId);
    this._npcOccupancyLoc.set(npcId, locId);
    return true;
  }

  markWaitingAtLocation(locId, npcId, waiting = true) {
    if (!locId || !npcId) return;
    const loc = this.locations.get(locId);
    if (!loc) return;
    if (waiting) loc.waitingNpcs.add(npcId);
    else loc.waitingNpcs.delete(npcId);
  }

  releaseNpc(npcId) {
    if (!npcId) return;
    const occLoc = this._npcOccupancyLoc.get(npcId);
    if (occLoc) {
      this.locations.get(occLoc)?.currentOccupants.delete(npcId);
      this._npcOccupancyLoc.delete(npcId);
    }
    const resLoc = this._npcReservationLoc.get(npcId);
    if (resLoc) {
      this.locations.get(resLoc)?.reservations.delete(npcId);
      this._npcReservationLoc.delete(npcId);
    }
    for (const loc of this.locations.values()) {
      loc.waitingNpcs.delete(npcId);
    }
    for (const [doorKey, lock] of this._doorLocks.entries()) {
      if (lock.npcId === npcId) this._doorLocks.delete(doorKey);
    }
  }

  pruneExpiredReservations(simTime = this._simTime) {
    let pruned = 0;
    for (const loc of this.locations.values()) {
      for (const [npcId, res] of loc.reservations.entries()) {
        if (simTime > res.expiresAt) {
          loc.reservations.delete(npcId);
          if (this._npcReservationLoc.get(npcId) === loc.locationId) {
            this._npcReservationLoc.delete(npcId);
          }
          pruned++;
        }
      }
    }
    for (const [doorKey, lock] of this._doorLocks.entries()) {
      if (simTime > lock.expiresAt) {
        this._doorLocks.delete(doorKey);
      }
    }
    return pruned;
  }

  findAlternativeLocation(desiredLocOrActivity, npc, opts = {}) {
    const pool = ALTERNATIVE_LOCATION_POOLS[desiredLocOrActivity] || ['res_lounge', 'tc_plaza', 'res_lobby'];
    const isPlayer = Boolean(npc?.isPlayer);
    const allowHq = Boolean(opts.allowHq);
    let bestLoc = null;
    let bestScore = -Infinity;

    for (let i = 0; i < pool.length; i++) {
      let candId = pool[i];
      if (candId === 'residence_room') {
        const rmNum = opts.ownedRoomNumber;
        if (!rmNum) continue;
        candId = `res_room_${String(rmNum).padStart(2, '0')}`;
      }
      const loc = this.locations.get(candId);
      if (!loc) continue;
      if (isPlayer && loc.hqInterior && !allowHq) continue;

      const check = this.canEnterLocation(candId, npc, opts.priority ?? 55);
      if (!check.allowed) continue;

      const stats = this.getLocationStats(candId);
      const densityBonus = stats.crowdDensity === CROWD_DENSITY.LOW ? 20
        : stats.crowdDensity === CROWD_DENSITY.NORMAL ? 10 : -5;
      const score = densityBonus - stats.ratio * 15 - i * 3;
      if (score > bestScore) {
        bestScore = score;
        bestLoc = loc;
      }
    }
    return bestLoc;
  }

  // Đề xuất giải tỏa nhẹ các NPC không khẩn cấp khi địa điểm rơi vào OVERCROWDED / FULL
  selectDispersalCandidates(locId, maxToDisperse = 2, npcLookupFn = null) {
    const loc = this.locations.get(locId);
    if (!loc || typeof npcLookupFn !== 'function') return [];
    const stats = this.getLocationStats(locId);
    if (!stats || (stats.crowdDensity !== CROWD_DENSITY.OVERCROWDED && stats.crowdDensity !== CROWD_DENSITY.FULL)) {
      return [];
    }
    const candidates = [];
    for (const npcId of loc.currentOccupants) {
      const n = npcLookupFn(npcId);
      if (!n) continue;
      const prio = typeof n.priority === 'number' ? n.priority : 50;
      if (prio >= 80) continue; // Không bao giờ đuổi cầu thủ đang tập bắt buộc / ca y tế / họp chỉ đạo
      candidates.push({ npc: n, priority: prio });
    }
    candidates.sort((a, b) => a.priority - b.priority);
    return candidates.slice(0, maxToDisperse).map((c) => c.npc);
  }

  getWaitingPosition(locId, slotIndex = 0) {
    const loc = this.locations.get(locId);
    if (!loc) return { x: 168, z: -18 };
    if (loc.waitingPositions.length > 0) {
      const wp = loc.waitingPositions[Math.abs(slotIndex) % loc.waitingPositions.length];
      const tier = Math.floor(Math.abs(slotIndex) / loc.waitingPositions.length);
      return { x: wp.x + (tier % 2 === 0 ? tier * 0.65 : -tier * 0.65), z: wp.z + tier * 0.5 };
    }
    const entry = loc.entryPoints[0] || { x: loc.cx, z: loc.cz };
    const ang = (slotIndex * 0.85) % (Math.PI * 2);
    return { x: entry.x + Math.cos(ang) * 2.2, z: entry.z + Math.sin(ang) * 2.2 };
  }

  // ==================== LỊCH PHÂN TÁN THEO NHÓM & LÀN SÓNG LỆCH PHA (STAGGERED WAVES) ====================
  scheduleGroupWaves(groupId, npcIds, simTime = this._simTime, opts = {}) {
    if (!groupId || !Array.isArray(npcIds) || npcIds.length === 0) return [];
    const waveSize = Math.max(2, Number(opts.waveSize) || 7);
    const intervalSec = Math.max(0.2, Number(opts.intervalSec) || 0.75);
    const targetLocId = opts.targetLocId || null;
    const assigned = [];

    for (let i = 0; i < npcIds.length; i++) {
      const npcId = npcIds[i];
      const waveIndex = Math.floor(i / waveSize);
      const releaseTime = simTime + waveIndex * intervalSec;
      const entry = {
        groupId,
        waveIndex,
        slotInWave: i % waveSize,
        releaseTime,
        targetLocId
      };
      this._waves.set(npcId, entry);
      assigned.push({ npcId, ...entry });
    }
    return assigned;
  }

  getWaveInfo(npcId, simTime = this._simTime) {
    const entry = this._waves.get(npcId);
    if (!entry) return { active: false, ready: true, waveIndex: 0, waitRemaining: 0, groupId: null };
    const waitRemaining = Math.max(0, entry.releaseTime - simTime);
    return {
      active: true,
      ready: waitRemaining <= 0.001,
      waveIndex: entry.waveIndex,
      waitRemaining,
      groupId: entry.groupId,
      targetLocId: entry.targetLocId
    };
  }

  clearWaveForNpc(npcId) {
    this._waves.delete(npcId);
  }

  // ==================== ĐIỀU PHỐI LUỒNG CỬA RA VÀO & HÀNH LANG HẸP ====================
  requestDoorwayPassage(doorKey, npcId, direction = 'enter', priority = 50, simTime = this._simTime) {
    if (!doorKey || !npcId) return { granted: true };
    const existing = this._doorLocks.get(doorKey);
    if (!existing || existing.npcId === npcId || simTime > existing.expiresAt) {
      this._doorLocks.set(doorKey, {
        npcId,
        direction,
        priority,
        expiresAt: simTime + 2.4
      });
      return { granted: true };
    }
    // Ưu tiên NPC đang đi RA khỏi phòng để giải phóng cửa trước khi người khác bước VÀO (chống khóa chéo)
    if (direction === 'exit' && existing.direction === 'enter' && priority >= existing.priority - 10) {
      return { granted: false, holderNpcId: existing.npcId, holderDirection: existing.direction, reason: 'doorway_busy' };
    }
    return { granted: false, holderNpcId: existing.npcId, holderDirection: existing.direction, reason: 'doorway_busy' };
  }

  releaseDoorwayPassage(doorKey, npcId) {
    const existing = this._doorLocks.get(doorKey);
    if (existing && (!npcId || existing.npcId === npcId)) {
      this._doorLocks.delete(doorKey);
    }
  }

  // ==================== ĐỒNG BỘ MẬT ĐỘ & TRỌNG SỐ TẮC NGHẼN CHO PATHFINDING ====================
  updateFromNpcs(npcs, simTime = this._simTime) {
    this._simTime = simTime;
    this._densityGrid.clear();
    for (const loc of this.locations.values()) {
      loc.currentOccupants.clear();
    }
    this._npcOccupancyLoc.clear();

    let moving = 0;
    let waiting = 0;
    let active = 0;
    let stuck = 0;
    let total = 0;

    if (Array.isArray(npcs)) {
      for (let i = 0; i < npcs.length; i++) {
        const n = npcs[i];
        if (!n?.mesh) continue;
        total++;
        const px = n.mesh.position.x;
        const pz = n.mesh.position.z;
        const locId = this.getLocationAtPosition(px, pz);
        n.currentLocation = locId;
        const loc = this.locations.get(locId);
        if (loc) {
          loc.currentOccupants.add(n.id);
          this._npcOccupancyLoc.set(n.id, locId);
          // Khi đã có mặt ở khu vực đích thì giải phóng slot giữ chỗ trước để tránh tính trùng capacity
          if (loc.reservations.has(n.id)) {
            loc.reservations.delete(n.id);
            if (this._npcReservationLoc.get(n.id) === locId) {
              this._npcReservationLoc.delete(n.id);
            }
          }
        }

        // Spatial grid 8m x 8m cho trọng số đường đi A*
        const gx = Math.floor(px / 8);
        const gz = Math.floor(pz / 8);
        const cellKey = `${gx},${gz}`;
        this._densityGrid.set(cellKey, (this._densityGrid.get(cellKey) || 0) + 1);

        const st = n.state || 'IDLE';
        const isMoving = (n.path && n.path.length > 0 && n.pathIdx < n.path.length) ||
          n._lod3InTransit ||
          Math.hypot(n._velX || 0, n._velZ || 0) > 0.25;
        if (st === 'STUCK' || st === 'STUCK_RECOVERY' || st === 'REROUTING' || n.stuckStatus === 'STUCK' || n.stuckStatus === 'REROUTING') {
          stuck++;
        } else if (st === 'WAITING' || st === 'QUEUING' || st === 'WAITING_FOR_ACTIVITY' || st === 'WAITING_FOR_DOOR') {
          waiting++;
        } else if (isMoving) {
          moving++;
        } else {
          active++;
        }
      }
    }

    this._gridCounts.moving = moving;
    this._gridCounts.waiting = waiting;
    this._gridCounts.active = active;
    this._gridCounts.stuck = stuck;
    this._gridCounts.total = total;

    this.pruneExpiredReservations(simTime);
  }

  getPointCrowdPenalty(x, z, options = null) {
    if (options?.ignoreCrowd) return 0;
    const gx = Math.floor(x / 8);
    const gz = Math.floor(z / 8);
    const count = this._densityGrid.get(`${gx},${gz}`) || 0;
    let penalty = count >= 8 ? (count - 6) * 2.6 : count >= 5 ? (count - 4) * 1.4 : 0;

    const locId = this.getLocationAtPosition(x, z);
    if (locId && locId !== 'campus_grounds') {
      const loc = this.locations.get(locId);
      if (loc && (loc.locationType === LOCATION_TYPES.CORRIDOR || loc.locationType === LOCATION_TYPES.LOBBY || loc.locationType === LOCATION_TYPES.LOCKER_ROOM)) {
        const stats = this.getLocationStats(locId);
        if (stats) penalty += DENSITY_PENALTY[stats.crowdDensity] || 0;
      }
    }
    return penalty;
  }

  getSegmentCrowdPenalty(ax, az, bx, bz, options = null) {
    if (options?.ignoreCrowd) return 0;
    const mx = (ax + bx) * 0.5;
    const mz = (az + bz) * 0.5;
    return this.getPointCrowdPenalty(mx, mz, options) * 0.8 + this.getPointCrowdPenalty(bx, bz, options) * 0.4;
  }

  // ==================== CHẨN ĐOÁN, DEBUG SNAPSHOT & SAVE/LOAD ====================
  getDebugSnapshot(npcs = [], pathfinder = null) {
    const locations = [];
    for (const loc of this.locations.values()) {
      const s = this.getLocationStats(loc.locationId);
      if (!s) continue;
      if (s.currentOccupancy > 0 || s.reservedCapacity > 0 || s.waitingCount > 0 || loc.locationId === 'locker_room' || loc.locationId === 'fitness_gym' || loc.locationId === 'medical_center' || loc.locationId === 'res_dining' || loc.locationId === 'res_lounge') {
        locations.push(s);
      }
    }
    locations.sort((a, b) => (b.currentOccupancy + b.reservedCapacity) - (a.currentOccupancy + a.reservedCapacity));

    const groups = new Map();
    const activeRoutes = [];
    if (Array.isArray(npcs)) {
      for (let i = 0; i < npcs.length; i++) {
        const n = npcs[i];
        if (!n) continue;
        if (n.groupId) {
          groups.set(n.groupId, (groups.get(n.groupId) || 0) + 1);
        }
        if (n.path && n.path.length > 0 && n.pathIdx < n.path.length) {
          activeRoutes.push({
            id: n.id,
            name: n.name,
            state: n.state,
            stuckStatus: n.stuckStatus || 'OK',
            from: n.currentLocation || 'campus_grounds',
            to: n.destinationLocation || 'unknown',
            remainingWaypoints: n.path.length - n.pathIdx
          });
        }
      }
    }

    return {
      simTime: Number(this._simTime.toFixed(2)),
      counts: { ...this._gridCounts },
      locations,
      groups: Array.from(groups.entries()).map(([groupId, count]) => ({ groupId, count })),
      activeRoutesCount: activeRoutes.length,
      activeRoutes: activeRoutes.slice(0, 20),
      navDiagnosticsCount: pathfinder?.getNavDiagnostics?.().length || 0,
      navDiagnostics: pathfinder?.getNavDiagnostics?.().slice(-8) || []
    };
  }

  exportState() {
    const reservations = [];
    for (const loc of this.locations.values()) {
      if (loc.reservations.size === 0) continue;
      for (const res of loc.reservations.values()) {
        reservations.push({
          locId: loc.locationId,
          npcId: res.npcId,
          reservedAt: res.reservedAt,
          expiresAt: res.expiresAt,
          priority: res.priority
        });
      }
    }
    const waves = [];
    for (const [npcId, w] of this._waves.entries()) {
      waves.push({ npcId, ...w });
    }
    return {
      simTime: this._simTime,
      reservations,
      waves
    };
  }

  importState(snap) {
    for (const loc of this.locations.values()) {
      loc.reservations.clear();
      loc.currentOccupants.clear();
      loc.waitingNpcs.clear();
    }
    this._npcReservationLoc.clear();
    this._npcOccupancyLoc.clear();
    this._waves.clear();
    this._doorLocks.clear();
    if (!snap || typeof snap !== 'object') return;
    if (typeof snap.simTime === 'number') this._simTime = snap.simTime;
    if (Array.isArray(snap.reservations)) {
      for (let i = 0; i < snap.reservations.length; i++) {
        const r = snap.reservations[i];
        const loc = this.locations.get(r?.locId);
        if (!loc || !r?.npcId) continue;
        loc.reservations.set(r.npcId, {
          npcId: r.npcId,
          reservedAt: r.reservedAt || 0,
          expiresAt: r.expiresAt || (this._simTime + 45),
          priority: r.priority ?? 50
        });
        this._npcReservationLoc.set(r.npcId, loc.locationId);
      }
    }
    if (Array.isArray(snap.waves)) {
      for (let i = 0; i < snap.waves.length; i++) {
        const w = snap.waves[i];
        if (!w?.npcId) continue;
        this._waves.set(w.npcId, {
          groupId: w.groupId || null,
          waveIndex: w.waveIndex || 0,
          slotInWave: w.slotInWave || 0,
          releaseTime: w.releaseTime || 0,
          targetLocId: w.targetLocId || null
        });
      }
    }
  }
}
