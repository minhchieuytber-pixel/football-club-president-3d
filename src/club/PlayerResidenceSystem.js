// src/club/PlayerResidenceSystem.js
// Hệ thống Quản lý Tòa nhà Nghỉ dưỡng Cầu thủ PSG (PSG PLAYER RESIDENCE — đúng 30 phòng riêng cố định ROOM 01..30)
// Quy tắc nghiêm ngặt:
// - Chỉ cầu thủ đội một PSG hợp lệ (state.getPsgSquad()) mới được cấp phòng (1 phòng / 1 cầu thủ, tuyệt đối không ở chung).
// - Phòng chưa có cầu thủ ở giữ nguyên trạng thái AVAILABLE (phòng trống, không tự sinh cầu thủ giả).
// - Nếu quân số đội một > 30: giới hạn 30 phòng, ghi nhận danh sách chờ (overflowPlayers) và phát cảnh báo cho Ban Lãnh Đạo (không tạo Phòng 31).
// - Đổi số áo không làm đổi số phòng; tân binh / đôn học viện tự động nhận phòng trống đầu tiên; cầu thủ rời đội tự động giải phóng phòng.
// - Save / Load bảo toàn chính xác bản đồ 30 phòng (không random lại).

export const TOTAL_RESIDENCE_ROOMS = 30;

export const CURTAIN_STATES = Object.freeze(['open', 'partial_open', 'partial_closed', 'closed']);
export const PRIVACY_PREFERENCES = Object.freeze([
  'privacy_seeker',
  'sunlight_lover',
  'routine_balanced',
  'low_concern'
]);

export const CURTAIN_PROGRESS_MAP = Object.freeze({
  open: 0.0,
  partial_open: 0.35,
  partial_closed: 0.70,
  closed: 1.0
});

export const CURTAIN_LABELS_VI = Object.freeze({
  open: 'Mở hoàn toàn',
  partial_open: 'Mở một phần',
  partial_closed: 'Đóng một phần',
  closed: 'Đóng hoàn toàn'
});

export const PRIVACY_LABELS_VI = Object.freeze({
  privacy_seeker: 'Ưa không gian riêng tư',
  sunlight_lover: 'Ưa ánh sáng tự nhiên',
  routine_balanced: 'Thói quen ổn định theo lịch',
  low_concern: 'Ít quan tâm rèm cửa'
});

// Tòa nhà kiến trúc 8 tầng: chỉ Tầng 1 có nội thất hoàn chỉnh & sử dụng được (toàn bộ 30 phòng bố trí tại Tầng 1; Tầng 2-8 chỉ là vỏ kiến trúc ngoài)
export const RESIDENCE_ORIGIN = {
  cx: 184,
  cz: 9,
  floorHeight: 4.2,
  exteriorFloors: 8,
  westXs: [146.125, 150.375, 154.625, 158.875, 163.125, 167.375, 171.625, 175.875],
  eastXs: [192.125, 196.375, 200.625, 204.875, 209.125, 213.375, 217.625, 221.875]
};

function buildRoomBlueprint() {
  const slots = [];
  let roomNumber = 1;
  const floor = 1;
  const floorY = 0;

  // Cánh Tây - Dãy Bắc: 8 phòng (ROOM 01..08)
  for (let i = 0; i < 8; i++) {
    const x = RESIDENCE_ORIGIN.westXs[i];
    slots.push({
      roomNumber,
      code: `ROOM ${String(roomNumber).padStart(2, '0')}`,
      floor,
      floorY,
      wing: 'Tây',
      side: 'north',
      cx: x,
      cz: -0.25,
      doorX: x,
      doorZ: 5.5,
      corridorZ: 6.9,
      plaqueX: x + 1.38,
      plaqueY: 1.88,
      plaqueZ: 5.66,
      plaqueRotY: 0,
      bedX: x - 1.15,
      bedZ: -3.6,
      windowZ: -5.72,
      accentColorIdx: (roomNumber - 1) % 3
    });
    roomNumber++;
  }

  // Cánh Tây - Dãy Nam: 7 phòng (ROOM 09..15; ô x=175.875 để mở làm Sảnh phụ Cánh Tây)
  for (let i = 0; i < 7; i++) {
    const x = RESIDENCE_ORIGIN.westXs[i];
    slots.push({
      roomNumber,
      code: `ROOM ${String(roomNumber).padStart(2, '0')}`,
      floor,
      floorY,
      wing: 'Tây',
      side: 'south',
      cx: x,
      cz: 18.25,
      doorX: x,
      doorZ: 12.5,
      corridorZ: 11.1,
      plaqueX: x - 1.38,
      plaqueY: 1.88,
      plaqueZ: 12.34,
      plaqueRotY: Math.PI,
      bedX: x + 1.15,
      bedZ: 21.6,
      windowZ: 23.72,
      accentColorIdx: (roomNumber - 1) % 3
    });
    roomNumber++;
  }

  // Cánh Đông - Dãy Bắc: 8 phòng (ROOM 16..23)
  for (let i = 0; i < 8; i++) {
    const x = RESIDENCE_ORIGIN.eastXs[i];
    slots.push({
      roomNumber,
      code: `ROOM ${String(roomNumber).padStart(2, '0')}`,
      floor,
      floorY,
      wing: 'Đông',
      side: 'north',
      cx: x,
      cz: -0.25,
      doorX: x,
      doorZ: 5.5,
      corridorZ: 6.9,
      plaqueX: x + 1.38,
      plaqueY: 1.88,
      plaqueZ: 5.66,
      plaqueRotY: 0,
      bedX: x - 1.15,
      bedZ: -3.6,
      windowZ: -5.72,
      accentColorIdx: (roomNumber - 1) % 3
    });
    roomNumber++;
  }

  // Cánh Đông - Dãy Nam: 7 phòng (ROOM 24..30; ô x=192.125 để mở làm Sảnh phụ Cánh Đông)
  for (let i = 1; i < 8; i++) {
    const x = RESIDENCE_ORIGIN.eastXs[i];
    slots.push({
      roomNumber,
      code: `ROOM ${String(roomNumber).padStart(2, '0')}`,
      floor,
      floorY,
      wing: 'Đông',
      side: 'south',
      cx: x,
      cz: 18.25,
      doorX: x,
      doorZ: 12.5,
      corridorZ: 11.1,
      plaqueX: x - 1.38,
      plaqueY: 1.88,
      plaqueZ: 12.34,
      plaqueRotY: Math.PI,
      bedX: x + 1.15,
      bedZ: 21.6,
      windowZ: 23.72,
      accentColorIdx: (roomNumber - 1) % 3
    });
    roomNumber++;
  }

  return slots;
}

export const RESIDENCE_ROOM_BLUEPRINTS = buildRoomBlueprint();

function hashString(str) {
  let h = 2166136261;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createRoomRecord(bp) {
  const room = {
    ...bp,
    status: 'AVAILABLE',
    occupantId: null,
    occupantName: null,
    shirtNumber: null,
    position: null,
    curtainState: 'open',
    privacyPreference: null,
    lastCurtainAction: null,
    curtainAutomationEnabled: true,
    manualOverride: false,
    manualOverrideClock: null,
    manualOverrideDay: null,
    lastNpcCurtainClock: null,
    lastNpcCurtainDay: null,
    curtainBusyByNpcId: null,
    doorOpen: false,
    doorBusyByNpcId: null,
    lastDoorAction: null,
    tvOn: false,
    lightOn: true,
    wardrobeOpen: false,
    interiorVariant: (bp.roomNumber - 1) % 4
  };

  Object.defineProperties(room, {
    CurtainState: {
      enumerable: false,
      get() { return this.curtainState; }
    },
    PrivacyPreference: {
      enumerable: false,
      get() { return this.privacyPreference; }
    },
    LastCurtainAction: {
      enumerable: false,
      get() { return this.lastCurtainAction; }
    },
    CurtainAutomationEnabled: {
      enumerable: false,
      get() { return this.curtainAutomationEnabled; }
    },
    CurrentOccupant: {
      enumerable: false,
      get() { return this.occupantId; }
    },
    RoomOccupancyState: {
      enumerable: false,
      get() { return this.status; }
    }
  });

  return room;
}

export class PlayerResidenceSystem {
  constructor(state) {
    this.state = state;
    this._listeners = [];
    this._lastOverflowAlertKey = '';
    this.playerPreferences = {};
    this.reset();
  }

  onChange(fn) {
    if (typeof fn === 'function') this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter((f) => f !== fn);
    };
  }

  notify(meta = null) {
    for (let i = 0; i < this._listeners.length; i++) {
      try { this._listeners[i](this, meta); } catch (_) {}
    }
  }

  _getDayStamp() {
    const ts = this.state?.timeSystem;
    if (ts && typeof ts.day === 'number') {
      return (ts.year || 2026) * 10000 + (ts.month || 1) * 100 + ts.day;
    }
    return this.state?.week || 1;
  }

  _getClockHour() {
    return typeof this.state?.clockHour === 'number' ? this.state.clockHour : 9.5;
  }

  getPrivacyPreferenceForPlayer(playerId) {
    if (!playerId) return 'routine_balanced';
    const existing = this.playerPreferences[playerId];
    if (PRIVACY_PREFERENCES.includes(existing)) return existing;
    const pref = PRIVACY_PREFERENCES[hashString(playerId) % PRIVACY_PREFERENCES.length];
    this.playerPreferences[playerId] = pref;
    return pref;
  }

  setPlayerPrivacyPreference(playerId, pref) {
    if (!playerId || !PRIVACY_PREFERENCES.includes(pref)) return false;
    this.playerPreferences[playerId] = pref;
    const room = this.getRoomForPlayer(playerId);
    if (room) {
      room.privacyPreference = pref;
      this.notify({ reason: 'preference_changed', roomNumber: room.roomNumber });
    }
    return true;
  }

  _defaultInitialCurtainForPreference(pref) {
    const h = this._getClockHour();
    const isNight = h >= 21.5 || h < 6.0;
    if (isNight) return 'closed';
    if (pref === 'privacy_seeker') return 'partial_closed';
    if (pref === 'sunlight_lover') return 'open';
    if (pref === 'routine_balanced') return h >= 18.5 ? 'partial_closed' : 'partial_open';
    return 'open';
  }

  reset() {
    this.rooms = RESIDENCE_ROOM_BLUEPRINTS.map((bp) => createRoomRecord(bp));
    this.overflowPlayers = [];
    this.activityLog = [];
    this.playerPreferences = {};
    this._lastOverflowAlertKey = '';
    this.syncWithSquad({ silentAlert: true, immediateCurtains: true });
  }

  _logActivity(msg) {
    const dateLabel = this.state?.timeSystem?.getDateLabel?.() || `Tuần ${this.state?.week || 1}`;
    this.activityLog.unshift({ date: dateLabel, text: msg });
    if (this.activityLog.length > 40) this.activityLog.length = 40;
  }

  // Đồng bộ 30 phòng với đội một PSG hiện tại:
  // - Giữ nguyên phòng cho cầu thủ cũ (kể cả khi đổi số áo)
  // - Giải phóng phòng của cầu thủ đã rời đội thành AVAILABLE & xóa thói quen/khóa rèm của người cũ
  // - Cấp phòng trống đầu tiên cho tân binh / cầu thủ trẻ vừa đôn đội một với thói quen riêng
  // - Nếu > 30 cầu thủ: đưa phần dư vào overflowPlayers & phát cảnh báo
  syncWithSquad(opts = {}) {
    const squad = this.state?.getPsgSquad ? this.state.getPsgSquad() : [];
    const squadById = new Map();
    for (let i = 0; i < squad.length; i++) {
      squadById.set(squad[i].id, squad[i]);
    }

    const assignedPlayerIds = new Set();
    let changed = false;

    // 1. Giữ nguyên phòng cho người cũ còn ở PSG; giải phóng người đã rời CLB
    for (let i = 0; i < this.rooms.length; i++) {
      const r = this.rooms[i];
      if (!r.occupantId) {
        if (r.status !== 'AVAILABLE' || r.occupantName !== null || r.shirtNumber !== null) {
          r.status = 'AVAILABLE';
          r.occupantName = null;
          r.shirtNumber = null;
          r.position = null;
          r.privacyPreference = null;
          r.manualOverride = false;
          r.manualOverrideClock = null;
          r.manualOverrideDay = null;
          r.curtainBusyByNpcId = null;
          changed = true;
        }
        continue;
      }

      const p = squadById.get(r.occupantId);
      if (!p || assignedPlayerIds.has(r.occupantId)) {
        // Giải phóng phòng vì đã rời đội -> KHÔNG truyền lại thói quen/khóa rèm cũ cho người sau!
        const prevName = r.occupantName;
        r.status = 'AVAILABLE';
        r.occupantId = null;
        r.occupantName = null;
        r.shirtNumber = null;
        r.position = null;
        r.privacyPreference = null;
        r.curtainState = 'open';
        r.lastCurtainAction = null;
        r.curtainAutomationEnabled = true;
        r.manualOverride = false;
        r.manualOverrideClock = null;
        r.manualOverrideDay = null;
        r.lastNpcCurtainClock = null;
        r.lastNpcCurtainDay = null;
        r.curtainBusyByNpcId = null;
        r.doorOpen = false;
        r.doorBusyByNpcId = null;
        r.lastDoorAction = null;
        r.tvOn = false;
        r.lightOn = true;
        r.wardrobeOpen = false;
        changed = true;
        if (prevName && !opts.silentLog) {
          this._logActivity(`${r.code} đã giải phóng thành AVAILABLE (${prevName} rời đội một).`);
        }
      } else {
        assignedPlayerIds.add(p.id);
        const nextNum = p.shirtNumber || null;
        const nextPref = r.privacyPreference || this.getPrivacyPreferenceForPlayer(p.id);
        if (
          r.status !== 'OCCUPIED' ||
          r.occupantName !== p.name ||
          r.shirtNumber !== nextNum ||
          r.position !== p.position ||
          r.privacyPreference !== nextPref
        ) {
          r.status = 'OCCUPIED';
          r.occupantName = p.name;
          r.shirtNumber = nextNum;
          r.position = p.position;
          r.privacyPreference = nextPref;
          changed = true;
        }
      }
    }

    // 2. Cấp phòng trống đầu tiên cho các cầu thủ PSG chưa có phòng
    const nextOverflow = [];
    for (let i = 0; i < squad.length; i++) {
      const p = squad[i];
      if (assignedPlayerIds.has(p.id)) continue;

      const freeRoom = this.rooms.find((r) => !r.occupantId);
      if (freeRoom) {
        const pref = this.getPrivacyPreferenceForPlayer(p.id);
        freeRoom.status = 'OCCUPIED';
        freeRoom.occupantId = p.id;
        freeRoom.occupantName = p.name;
        freeRoom.shirtNumber = p.shirtNumber || null;
        freeRoom.position = p.position;
        freeRoom.privacyPreference = pref;
        freeRoom.curtainAutomationEnabled = true;
        freeRoom.manualOverride = false;
        freeRoom.manualOverrideClock = null;
        freeRoom.manualOverrideDay = null;
        freeRoom.lastNpcCurtainClock = null;
        freeRoom.lastNpcCurtainDay = null;
        freeRoom.curtainBusyByNpcId = null;
        freeRoom.doorOpen = false;
        freeRoom.doorBusyByNpcId = null;
        freeRoom.lastDoorAction = null;
        freeRoom.tvOn = false;
        freeRoom.lightOn = true;
        freeRoom.wardrobeOpen = false;
        freeRoom.curtainState = this._defaultInitialCurtainForPreference(pref);
        freeRoom.lastCurtainAction = null;
        assignedPlayerIds.add(p.id);
        changed = true;
        if (!opts.silentLog) {
          this._logActivity(`Đã cấp ${freeRoom.code} (Tầng ${freeRoom.floor}) cho ${p.name}${p.shirtNumber ? ` (#${p.shirtNumber})` : ''}.`);
        }
      } else {
        nextOverflow.push({
          playerId: p.id,
          name: p.name,
          position: p.position,
          shirtNumber: p.shirtNumber || null
        });
      }
    }

    const prevOverflowKey = this.overflowPlayers.map((x) => x.playerId).join(',');
    const nextOverflowKey = nextOverflow.map((x) => x.playerId).join(',');
    if (prevOverflowKey !== nextOverflowKey) {
      this.overflowPlayers = nextOverflow;
      changed = true;
    }

    // 3. Phát cảnh báo cho Ban Lãnh Đạo nếu đội một vượt quá 30 cầu thủ
    if (this.overflowPlayers.length > 0 && !opts.silentAlert) {
      const alertKey = `${this.overflowPlayers.length}:${nextOverflowKey}`;
      if (alertKey !== this._lastOverflowAlertKey) {
        this._lastOverflowAlertKey = alertKey;
        const names = this.overflowPlayers.map((o) => o.name).join(', ');
        if (Array.isArray(this.state?.phoneInbox)) {
          this.state.phoneInbox.unshift({
            id: `msg_res_overflow_${Date.now()}`,
            from: 'Ban Quản Lý Tòa Nhà Cầu Thủ PSG',
            title: `⚠️ Tòa nhà Nghỉ dưỡng đã kín 30/30 phòng (+${this.overflowPlayers.length} cầu thủ chờ)`,
            body: `Đội một PSG hiện có ${squad.length} cầu thủ, vượt sức chứa tối đa 30 phòng riêng tại PSG PLAYER RESIDENCE. Cầu thủ chưa có phòng: ${names}. Đề nghị Chủ tịch & GĐTT xem xét tinh gọn hoặc cho mượn cầu thủ.`,
            urgent: true,
            read: false
          });
          if (this.state.phoneInbox.length > 40) this.state.phoneInbox.length = 40;
        }
        this.state?.eventBus?.emit?.('RESIDENCE_CAPACITY_EXCEEDED', {
          totalRooms: TOTAL_RESIDENCE_ROOMS,
          squadSize: squad.length,
          overflowCount: this.overflowPlayers.length,
          overflowNames: names
        });
      }
    } else if (this.overflowPlayers.length === 0) {
      this._lastOverflowAlertKey = '';
    }

    if (changed) this.notify({ immediateCurtains: !!opts.immediateCurtains });
    return this.getSummary();
  }

  setRoomCurtainState(roomNumber, nextState, meta = {}) {
    if (!CURTAIN_STATES.includes(nextState)) return false;
    const room = this.getRoomByNumber(roomNumber);
    if (!room) return false;

    const by = meta.by || 'system';
    const clockHour = typeof meta.clockHour === 'number' ? meta.clockHour : this._getClockHour();
    const dayIndex = typeof meta.dayIndex === 'number' ? meta.dayIndex : this._getDayStamp();

    room.curtainState = nextState;
    room.lastCurtainAction = {
      by,
      actorName: meta.npcName || (by === 'player' ? 'Chủ tịch' : 'Hệ thống'),
      state: nextState,
      reason: meta.reason || (by === 'player' ? 'Chỉnh rèm trực tiếp' : ''),
      clockHour,
      dayIndex
    };

    if (by === 'player') {
      room.manualOverride = true;
      room.manualOverrideClock = clockHour;
      room.manualOverrideDay = dayIndex;
    } else if (by === 'npc') {
      room.manualOverride = false;
      room.manualOverrideClock = null;
      room.manualOverrideDay = null;
      room.lastNpcCurtainClock = clockHour;
      room.lastNpcCurtainDay = dayIndex;
      room.curtainBusyByNpcId = null;
    }

    this.notify({ reason: 'curtain_changed', roomNumber: room.roomNumber, immediateCurtains: !!meta.immediate });
    return true;
  }

  setRoomCurtainAutomation(roomNumber, enabled) {
    const room = this.getRoomByNumber(roomNumber);
    if (!room) return false;
    room.curtainAutomationEnabled = !!enabled;
    if (enabled && room.manualOverride) {
      // Cho phép NPC hoạt động lại ở chu kỳ lịch tiếp theo khi bật lại tự động hóa
      room.manualOverride = false;
    }
    this.notify({ reason: 'automation_changed', roomNumber: room.roomNumber });
    return true;
  }

  isManualOverrideActive(room, clockHour = this._getClockHour(), dayIndex = this._getDayStamp()) {
    if (!room || !room.manualOverride) return false;
    const prevDay = room.manualOverrideDay ?? dayIndex;
    const prevClock = room.manualOverrideClock ?? clockHour;
    const elapsedHours = (dayIndex - prevDay) * 24 + (clockHour - prevClock);
    // Tôn trọng chỉnh tay của người chơi ít nhất 3.5 giờ game, chỉ hết hiệu lực khi bước sang pha sáng/đêm mới sau đó
    if (elapsedHours < 3.5) return true;
    const isSleepReset = clockHour >= 22.0 && prevClock < 21.5;
    const isMorningReset = dayIndex > prevDay && clockHour >= 7.0;
    return !(isSleepReset || isMorningReset);
  }

  setRoomDoorState(roomNumber, isOpen, meta = {}) {
    const room = this.getRoomByNumber(roomNumber);
    if (!room) return false;
    const next = !!isOpen;
    const by = meta.by || 'system';
    room.doorOpen = next;
    room.lastDoorAction = {
      by,
      actorName: meta.npcName || (by === 'player' ? 'Chủ tịch' : 'Hệ thống'),
      open: next,
      clockHour: typeof meta.clockHour === 'number' ? meta.clockHour : this._getClockHour()
    };
    this.notify({ reason: 'door_changed', roomNumber: room.roomNumber, immediateDoors: !!meta.immediate });
    return true;
  }

  toggleRoomDoor(roomNumber, meta = {}) {
    const room = this.getRoomByNumber(roomNumber);
    if (!room) return false;
    const next = !room.doorOpen;
    this.setRoomDoorState(roomNumber, next, meta);
    return next;
  }

  setRoomTvState(roomNumber, isOn) {
    const room = this.getRoomByNumber(roomNumber);
    if (!room) return false;
    room.tvOn = !!isOn;
    this.notify({ reason: 'tv_changed', roomNumber: room.roomNumber });
    return true;
  }

  toggleRoomTv(roomNumber) {
    const room = this.getRoomByNumber(roomNumber);
    if (!room) return false;
    room.tvOn = !room.tvOn;
    this.notify({ reason: 'tv_changed', roomNumber: room.roomNumber });
    return room.tvOn;
  }

  setRoomLightState(roomNumber, isOn) {
    const room = this.getRoomByNumber(roomNumber);
    if (!room) return false;
    room.lightOn = !!isOn;
    this.notify({ reason: 'light_changed', roomNumber: room.roomNumber });
    return true;
  }

  toggleRoomLight(roomNumber) {
    const room = this.getRoomByNumber(roomNumber);
    if (!room) return false;
    room.lightOn = !room.lightOn;
    this.notify({ reason: 'light_changed', roomNumber: room.roomNumber });
    return room.lightOn;
  }

  setRoomWardrobeState(roomNumber, isOpen) {
    const room = this.getRoomByNumber(roomNumber);
    if (!room) return false;
    room.wardrobeOpen = !!isOpen;
    this.notify({ reason: 'wardrobe_changed', roomNumber: room.roomNumber });
    return true;
  }

  toggleRoomWardrobe(roomNumber) {
    const room = this.getRoomByNumber(roomNumber);
    if (!room) return false;
    room.wardrobeOpen = !room.wardrobeOpen;
    this.notify({ reason: 'wardrobe_changed', roomNumber: room.roomNumber });
    return room.wardrobeOpen;
  }

  canNpcEnterRoom(roomNumber, playerId) {
    const room = this.getRoomByNumber(roomNumber);
    if (!room) return false;
    if (room.status === 'OCCUPIED' && room.occupantId && room.occupantId !== playerId) {
      return false;
    }
    return room.occupantId === playerId;
  }

  getRoomAtPosition(x, z) {
    if (typeof x !== 'number' || typeof z !== 'number') return null;
    for (let i = 0; i < this.rooms.length; i++) {
      const r = this.rooms[i];
      if (Math.abs(x - r.cx) > 2.04) continue;
      if (r.side === 'north') {
        if (z >= -5.95 && z <= 5.45) return r;
      } else {
        if (z >= 12.55 && z <= 23.95) return r;
      }
    }
    return null;
  }

  getNearestDoorRoom(x, z, maxDist = 2.6) {
    if (typeof x !== 'number' || typeof z !== 'number') return null;
    let best = null;
    let bestD2 = maxDist * maxDist;
    for (let i = 0; i < this.rooms.length; i++) {
      const r = this.rooms[i];
      const dx = x - r.doorX;
      const dz = z - r.doorZ;
      const d2 = dx * dx + dz * dz;
      if (d2 <= bestD2) {
        bestD2 = d2;
        best = r;
      }
    }
    return best;
  }

  getDoorApproachSpots(room) {
    if (!room) return null;
    if (room.side === 'north') {
      return {
        outside: { x: room.cx, z: 6.32, faceRotY: Math.PI },
        inside: { x: room.cx, z: 4.50, faceRotY: 0 },
        aisleEntry: { x: room.cx + 0.62, z: 4.40 }
      };
    }
    return {
      outside: { x: room.cx, z: 11.68, faceRotY: 0 },
      inside: { x: room.cx, z: 13.50, faceRotY: Math.PI },
      aisleEntry: { x: room.cx + 0.62, z: 13.60 }
    };
  }

  getWindowStandSpot(room) {
    if (!room) return null;
    if (room.side === 'north') {
      return { x: room.cx - 0.55, z: -5.05, faceRotY: Math.PI };
    }
    return { x: room.cx - 0.55, z: 23.05, faceRotY: 0 };
  }

  computeDesiredCurtainForRoom(room, opts = {}) {
    if (!room || room.status !== 'OCCUPIED' || !room.occupantId) return null;
    if (room.curtainAutomationEnabled === false) return null;

    const clockHour = typeof opts.clockHour === 'number' ? opts.clockHour : this._getClockHour();
    const dayIndex = typeof opts.dayIndex === 'number' ? opts.dayIndex : this._getDayStamp();
    if (this.isManualOverrideActive(room, clockHour, dayIndex)) return null;

    const pref = room.privacyPreference || this.getPrivacyPreferenceForPlayer(room.occupantId);
    const playerPos = opts.playerPos || null;
    const isNight = clockHour >= 21.5 || clockHour < 6.0;

    // Kiểm tra người bên ngoài đứng gần cửa kính phòng nghỉ
    let observerNearWindow = false;
    if (playerPos && typeof playerPos.x === 'number' && typeof playerPos.z === 'number') {
      const outsideSide = (room.side === 'north' && playerPos.z < -5.8) || (room.side === 'south' && playerPos.z > 23.8);
      if (outsideSide) {
        const dist = Math.hypot(playerPos.x - room.cx, playerPos.z - (room.windowZ ?? (room.side === 'north' ? -5.72 : 23.72)));
        observerNearWindow = dist < 6.5;
      }
    }

    // Cooldown giữa 2 lần tự động kéo rèm (trừ lúc chuyển đêm muộn hoặc có người áp sát cửa sổ)
    if (!isNight && !observerNearWindow && typeof room.lastNpcCurtainClock === 'number') {
      const prevDay = room.lastNpcCurtainDay ?? dayIndex;
      const elapsedHours = (dayIndex - prevDay) * 24 + (clockHour - room.lastNpcCurtainClock);
      if (elapsedHours >= 0 && elapsedHours < 1.0) return null;
    }

    let desired = null;
    let reason = '';

    if (observerNearWindow && (pref === 'privacy_seeker' || pref === 'routine_balanced')) {
      desired = 'closed';
      reason = 'Đóng rèm đảm bảo riêng tư khi có người ở gần cửa sổ';
    } else if (observerNearWindow && pref === 'low_concern' && !isNight) {
      desired = 'partial_closed';
      reason = 'Khép bớt rèm khi có người đi ngang cửa kính';
    } else if (isNight) {
      if (pref === 'sunlight_lover' && clockHour >= 21.5 && clockHour < 22.25) {
        desired = 'partial_closed';
        reason = 'Khép rèm chuẩn bị nghỉ ngơi buổi tối';
      } else {
        desired = 'closed';
        reason = 'Đóng kín rèm nghỉ ngơi ban đêm';
      }
    } else if (clockHour >= 6.5 && clockHour < 9.0) {
      if (pref === 'sunlight_lover') {
        desired = 'open';
        reason = 'Mở hoàn toàn rèm đón nắng buổi sáng';
      } else if (pref === 'routine_balanced' && clockHour >= 7.0) {
        desired = 'open';
        reason = 'Mở rèm theo thói quen buổi sáng';
      } else if (pref === 'privacy_seeker') {
        desired = 'partial_open';
        reason = 'Mở hé rèm buổi sáng giữ sự kín đáo';
      } else if (pref === 'low_concern' && clockHour >= 7.5) {
        desired = 'partial_open';
        reason = 'Mở nhẹ rèm buổi sáng';
      }
    } else if (clockHour >= 12.6 && clockHour < 14.25) {
      if (pref === 'privacy_seeker') {
        desired = 'closed';
        reason = 'Đóng kín rèm nghỉ trưa riêng tư';
      } else if (pref === 'routine_balanced') {
        desired = 'partial_closed';
        reason = 'Khép rèm nghỉ trưa';
      } else if (pref === 'sunlight_lover') {
        desired = 'partial_open';
        reason = 'Giữ ánh sáng dịu khi nghỉ trưa';
      }
    } else if (clockHour >= 18.8 && clockHour < 21.5) {
      if (pref === 'privacy_seeker') {
        desired = 'closed';
        reason = 'Đóng rèm giữ không gian riêng tư buổi tối';
      } else if (pref === 'routine_balanced') {
        desired = clockHour >= 19.8 ? 'closed' : 'partial_closed';
        reason = 'Kéo rèm sinh hoạt buổi tối';
      } else if (pref === 'sunlight_lover') {
        desired = clockHour >= 20.0 ? 'partial_closed' : 'partial_open';
        reason = 'Khép nhẹ rèm khi trời tối';
      } else if (pref === 'low_concern' && clockHour >= 20.2) {
        desired = 'partial_closed';
        reason = 'Khép bớt rèm buổi tối';
      }
    } else if (clockHour >= 16.5 && clockHour < 18.8) {
      if (pref === 'privacy_seeker') {
        desired = 'partial_closed';
        reason = 'Khép rèm thư giãn sau buổi tập';
      } else if (pref === 'sunlight_lover') {
        desired = 'open';
        reason = 'Mở rèm đón ánh sáng tự nhiên buổi chiều';
      } else if (pref === 'routine_balanced') {
        desired = 'partial_open';
        reason = 'Điều chỉnh rèm vừa phải buổi chiều';
      }
    }

    if (!desired || desired === room.curtainState) return null;
    return { state: desired, reason };
  }

  getRooms() {
    return this.rooms;
  }

  getRoomByNumber(roomNumber) {
    return this.rooms.find((r) => r.roomNumber === Number(roomNumber)) || null;
  }

  getRoomForPlayer(playerId) {
    if (!playerId) return null;
    return this.rooms.find((r) => r.occupantId === playerId) || null;
  }

  getOverflowPlayers() {
    return this.overflowPlayers;
  }

  getSummary() {
    const occupied = this.rooms.filter((r) => r.status === 'OCCUPIED').length;
    const available = this.rooms.length - occupied;
    return {
      totalRooms: TOTAL_RESIDENCE_ROOMS,
      occupied,
      available,
      overflowCount: this.overflowPlayers.length,
      overflowPlayers: this.overflowPlayers
    };
  }

  exportState() {
    return {
      assignments: this.rooms.map((r) => ({
        roomNumber: r.roomNumber,
        occupantId: r.occupantId,
        occupantName: r.occupantName,
        shirtNumber: r.shirtNumber,
        position: r.position,
        curtainState: r.curtainState,
        privacyPreference: r.privacyPreference,
        lastCurtainAction: r.lastCurtainAction ? { ...r.lastCurtainAction } : null,
        curtainAutomationEnabled: r.curtainAutomationEnabled !== false,
        manualOverride: !!r.manualOverride,
        manualOverrideClock: r.manualOverrideClock,
        manualOverrideDay: r.manualOverrideDay,
        lastNpcCurtainClock: r.lastNpcCurtainClock,
        lastNpcCurtainDay: r.lastNpcCurtainDay,
        doorOpen: !!r.doorOpen,
        tvOn: !!r.tvOn,
        lightOn: r.lightOn !== false,
        wardrobeOpen: !!r.wardrobeOpen
      })),
      playerPreferences: { ...this.playerPreferences },
      overflowPlayers: this.overflowPlayers.slice(),
      activityLog: this.activityLog.slice(0, 30),
      lastOverflowAlertKey: this._lastOverflowAlertKey
    };
  }

  importState(snap) {
    this.rooms = RESIDENCE_ROOM_BLUEPRINTS.map((bp) => createRoomRecord(bp));
    this.overflowPlayers = [];
    this.activityLog = [];
    this.playerPreferences = snap?.playerPreferences && typeof snap.playerPreferences === 'object'
      ? { ...snap.playerPreferences }
      : {};
    this._lastOverflowAlertKey = snap?.lastOverflowAlertKey || '';

    if (snap && Array.isArray(snap.assignments)) {
      const byRoom = new Map();
      for (let i = 0; i < snap.assignments.length; i++) {
        const a = snap.assignments[i];
        if (a && a.roomNumber >= 1 && a.roomNumber <= TOTAL_RESIDENCE_ROOMS) {
          byRoom.set(a.roomNumber, a);
        }
      }
      for (let i = 0; i < this.rooms.length; i++) {
        const r = this.rooms[i];
        const saved = byRoom.get(r.roomNumber);
        if (!saved) continue;
        if (CURTAIN_STATES.includes(saved.curtainState)) {
          r.curtainState = saved.curtainState;
        }
        r.curtainAutomationEnabled = saved.curtainAutomationEnabled !== false;
        r.manualOverride = !!saved.manualOverride;
        r.manualOverrideClock = typeof saved.manualOverrideClock === 'number' ? saved.manualOverrideClock : null;
        r.manualOverrideDay = typeof saved.manualOverrideDay === 'number' ? saved.manualOverrideDay : null;
        r.lastNpcCurtainClock = typeof saved.lastNpcCurtainClock === 'number' ? saved.lastNpcCurtainClock : null;
        r.lastNpcCurtainDay = typeof saved.lastNpcCurtainDay === 'number' ? saved.lastNpcCurtainDay : null;
        r.lastCurtainAction = saved.lastCurtainAction ? { ...saved.lastCurtainAction } : null;
        r.doorOpen = !!saved.doorOpen;
        r.tvOn = !!saved.tvOn;
        r.lightOn = saved.lightOn !== false;
        r.wardrobeOpen = !!saved.wardrobeOpen;

        if (saved.occupantId) {
          r.occupantId = saved.occupantId;
          r.occupantName = saved.occupantName || null;
          r.shirtNumber = saved.shirtNumber || null;
          r.position = saved.position || null;
          r.status = 'OCCUPIED';
          if (PRIVACY_PREFERENCES.includes(saved.privacyPreference)) {
            r.privacyPreference = saved.privacyPreference;
            this.playerPreferences[saved.occupantId] = saved.privacyPreference;
          } else {
            r.privacyPreference = this.getPrivacyPreferenceForPlayer(saved.occupantId);
          }
        }
      }
    }
    if (Array.isArray(snap?.activityLog)) {
      this.activityLog = snap.activityLog.slice(0, 30);
    }

    // Đối chiếu chính xác với đội hình đã load (không thay đổi số phòng hay trạng thái phòng đã lưu!)
    this.syncWithSquad({ silentAlert: true, silentLog: true, immediateCurtains: true });
    this.notify({ immediateCurtains: true, immediateDoors: true });
  }
}
