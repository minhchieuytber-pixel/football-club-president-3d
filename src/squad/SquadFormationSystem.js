// src/squad/SquadFormationSystem.js
// Hệ thống Sơ đồ Đội hình đồng bộ toàn game (Global Squad Formation System),
// AI Đánh giá độ phù hợp vị trí (PositionSuitabilityAI), Tủ đồ cá nhân (LockerAssignmentSystem),
// Đội trưởng (CaptainSystem), Quản lý Thay người Trước trận / Trong trận & Lịch sinh hoạt 60 phút trước giờ tập.
import {
  PositionSuitabilityAI,
  normalizePosition,
  POSITION_DISPLAY_LABEL
} from './PositionSuitabilityAI.js';

export const FORMATION_PRESETS = {
  '4-3-3': [
    { role: 'GK', x: 50, y: 89 },
    { role: 'LB', x: 16, y: 71 }, { role: 'CB', x: 38, y: 74 }, { role: 'CB', x: 62, y: 74 }, { role: 'RB', x: 84, y: 71 },
    { role: 'CM', x: 28, y: 50 }, { role: 'DM', x: 50, y: 55 }, { role: 'CM', x: 72, y: 50 },
    { role: 'LW', x: 18, y: 24 }, { role: 'ST', x: 50, y: 18 }, { role: 'RW', x: 82, y: 24 }
  ],
  '4-2-3-1': [
    { role: 'GK', x: 50, y: 89 },
    { role: 'LB', x: 16, y: 72 }, { role: 'CB', x: 38, y: 75 }, { role: 'CB', x: 62, y: 75 }, { role: 'RB', x: 84, y: 72 },
    { role: 'DM', x: 36, y: 56 }, { role: 'DM', x: 64, y: 56 },
    { role: 'LW', x: 18, y: 36 }, { role: 'AM', x: 50, y: 36 }, { role: 'RW', x: 82, y: 36 },
    { role: 'ST', x: 50, y: 17 }
  ],
  '4-4-2': [
    { role: 'GK', x: 50, y: 89 },
    { role: 'LB', x: 16, y: 72 }, { role: 'CB', x: 38, y: 75 }, { role: 'CB', x: 62, y: 75 }, { role: 'RB', x: 84, y: 72 },
    { role: 'LW', x: 16, y: 48 }, { role: 'CM', x: 39, y: 51 }, { role: 'CM', x: 61, y: 51 }, { role: 'RW', x: 84, y: 48 },
    { role: 'ST', x: 37, y: 20 }, { role: 'ST', x: 63, y: 20 }
  ],
  '3-5-2': [
    { role: 'GK', x: 50, y: 89 },
    { role: 'CB', x: 26, y: 74 }, { role: 'CB', x: 50, y: 76 }, { role: 'CB', x: 74, y: 74 },
    { role: 'LB', x: 14, y: 49 }, { role: 'CM', x: 34, y: 53 }, { role: 'DM', x: 50, y: 58 }, { role: 'CM', x: 66, y: 53 }, { role: 'RB', x: 86, y: 49 },
    { role: 'ST', x: 37, y: 20 }, { role: 'ST', x: 63, y: 20 }
  ],
  '3-4-3': [
    { role: 'GK', x: 50, y: 89 },
    { role: 'CB', x: 26, y: 74 }, { role: 'CB', x: 50, y: 76 }, { role: 'CB', x: 74, y: 74 },
    { role: 'LB', x: 16, y: 50 }, { role: 'CM', x: 39, y: 52 }, { role: 'CM', x: 61, y: 52 }, { role: 'RB', x: 84, y: 50 },
    { role: 'LW', x: 20, y: 23 }, { role: 'ST', x: 50, y: 17 }, { role: 'RW', x: 80, y: 23 }
  ],
  '4-1-4-1': [
    { role: 'GK', x: 50, y: 89 },
    { role: 'LB', x: 16, y: 72 }, { role: 'CB', x: 38, y: 75 }, { role: 'CB', x: 62, y: 75 }, { role: 'RB', x: 84, y: 72 },
    { role: 'DM', x: 50, y: 60 },
    { role: 'LW', x: 16, y: 41 }, { role: 'CM', x: 39, y: 43 }, { role: 'CM', x: 61, y: 43 }, { role: 'RW', x: 84, y: 41 },
    { role: 'ST', x: 50, y: 18 }
  ],
  '5-3-2': [
    { role: 'GK', x: 50, y: 89 },
    { role: 'LB', x: 13, y: 68 }, { role: 'CB', x: 31, y: 75 }, { role: 'CB', x: 50, y: 77 }, { role: 'CB', x: 69, y: 75 }, { role: 'RB', x: 87, y: 68 },
    { role: 'CM', x: 28, y: 50 }, { role: 'DM', x: 50, y: 54 }, { role: 'CM', x: 72, y: 50 },
    { role: 'ST', x: 37, y: 21 }, { role: 'ST', x: 63, y: 21 }
  ],
  '4-3-1-2': [
    { role: 'GK', x: 50, y: 89 },
    { role: 'LB', x: 16, y: 72 }, { role: 'CB', x: 38, y: 75 }, { role: 'CB', x: 62, y: 75 }, { role: 'RB', x: 84, y: 72 },
    { role: 'CM', x: 28, y: 54 }, { role: 'DM', x: 50, y: 58 }, { role: 'CM', x: 72, y: 54 },
    { role: 'AM', x: 50, y: 36 },
    { role: 'ST', x: 37, y: 19 }, { role: 'ST', x: 63, y: 19 }
  ]
};

// Các vùng chiến thuật chuẩn trên sân để hỗ trợ kéo cầu thủ sang vị trí trống hoặc đổi vai trò trực tiếp
export const TACTICAL_ZONE_ANCHORS = [
  { role: 'ST',  label: 'ST',  x: 50, y: 16 },
  { role: 'LW',  label: 'LW',  x: 17, y: 24 },
  { role: 'RW',  label: 'RW',  x: 83, y: 24 },
  { role: 'AM',  label: 'CAM', x: 50, y: 35 },
  { role: 'CM',  label: 'CM',  x: 34, y: 49 },
  { role: 'CM',  label: 'CM',  x: 66, y: 49 },
  { role: 'DM',  label: 'CDM', x: 50, y: 59 },
  { role: 'LB',  label: 'LB',  x: 15, y: 71 },
  { role: 'RB',  label: 'RB',  x: 85, y: 71 },
  { role: 'CB',  label: 'CB',  x: 39, y: 75 },
  { role: 'CB',  label: 'CB',  x: 61, y: 75 },
  { role: 'GK',  label: 'GK',  x: 50, y: 89 }
];

const DEFAULT_PSG_NUMBERS = {
  'Gianluigi Donnarumma': 1, 'Achraf Hakimi': 2, 'Marquinhos': 5, 'Khvicha Kvaratskhelia': 7,
  'Fabián Ruiz': 8, 'Gonçalo Ramos': 9, 'Ousmane Dembélé': 10, 'Désiré Doué': 14,
  'Vitinha': 17, 'Lee Kang-in': 19, 'Lucas Hernández': 21, 'Senny Mayulu': 24,
  'Nuno Mendes': 25, 'Bradley Barcola': 29, 'Warren Zaïre-Emery': 33, 'Lucas Beraldo': 35,
  'Matvey Safonov': 39, 'Willian Pacho': 51, 'João Neves': 87
};

function cloneSlots(slots) {
  return (slots || []).map((s, idx) => ({
    slotIndex: typeof s.slotIndex === 'number' ? s.slotIndex : idx,
    role: normalizePosition(s.role),
    x: Number(s.x),
    y: Number(s.y)
  }));
}

export class SquadFormationSystem {
  constructor(state) {
    this.state = state;
    this.listeners = [];
    this.suitabilityAI = new PositionSuitabilityAI();
    this.formation = '4-3-3';
    this.tacticName = 'PSG Kiểm Soát Bóng (Mặc định)';
    this.captainId = null;
    this.starterIds = []; // length 11, phần tử có thể là string playerId hoặc null (slot trống)
    this.customSlots = cloneSlots(FORMATION_PRESETS['4-3-3']);
    this.lockers = [];
    this.schedules = {};
    this.undoStack = [];
    this.matchSubSession = this._createDefaultMatchSession();
    this.initFromSquad();
  }

  _createDefaultMatchSession() {
    return {
      active: false,
      mode: 'pre_match', // 'pre_match' | 'in_match'
      matchMinute: 0,
      matchFinished: false,
      maxSubs: 5,
      subsUsed: 0,
      subbedOutIds: [],
      subHistory: []
    };
  }

  onChange(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== fn);
    };
  }

  notify() {
    this.suitabilityAI.invalidateCache();
    this.syncLockers();
    this.listeners.forEach((fn) => { try { fn(this); } catch (_) {} });
  }

  getContext() {
    return {
      formation: this.formation,
      tacticName: this.tacticName,
      tacticalStyle: this.state?.coach?.tacticalStyle || this.tacticName,
      coachTacticalStyle: this.state?.coach?.tacticalStyle || this.tacticName
    };
  }

  getDisplaySurname(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/);
    return (parts[parts.length - 1] || fullName).toUpperCase();
  }

  ensureShirtNumbers() {
    const squad = this.state.getPsgSquad();
    const used = new Set();
    squad.forEach((p) => {
      if (p.shirtNumber) used.add(p.shirtNumber);
    });
    let nextFree = 3;
    squad.forEach((p) => {
      if (!p.shirtNumber) {
        const pref = DEFAULT_PSG_NUMBERS[p.name];
        if (pref && !used.has(pref)) {
          p.shirtNumber = pref;
          used.add(pref);
        } else {
          while (used.has(nextFree) || nextFree === 1) nextFree++;
          p.shirtNumber = nextFree;
          used.add(nextFree);
        }
      }
    });
  }

  initFromSquad() {
    this.ensureShirtNumbers();
    const squad = this.state.getPsgSquad();
    const cap = squad.find((p) => p.name === 'Marquinhos') || squad[0];
    this.captainId = cap ? cap.id : null;
    this.customSlots = cloneSlots(FORMATION_PRESETS[this.formation] || FORMATION_PRESETS['4-3-3']);
    this.autoFillStarters();
    this.syncLockers();
    this.initSchedules();
    this.undoStack = [];
    this.matchSubSession = this._createDefaultMatchSession();
  }

  autoFillStarters() {
    const squad = this.state.getPsgSquad().filter((p) => (p.injuryDays || 0) <= 0 && !p.suspended);
    const slots = this.customSlots?.length === 11
      ? this.customSlots
      : (FORMATION_PRESETS[this.formation] || FORMATION_PRESETS['4-3-3']);
    const picked = [];
    slots.forEach((slot) => {
      const exact = squad.find((p) => !picked.includes(p.id) && normalizePosition(p.position) === normalizePosition(slot.role));
      if (exact) { picked.push(exact.id); return; }
      const near = squad.find((p) => !picked.includes(p.id) && (
        (slot.role === 'GK' && p.position === 'GK') ||
        (['CB', 'LB', 'RB'].includes(slot.role) && ['CB', 'LB', 'RB'].includes(p.position)) ||
        (['DM', 'CM', 'AM'].includes(slot.role) && ['DM', 'CM', 'AM'].includes(p.position)) ||
        (['LW', 'RW', 'ST'].includes(slot.role) && ['LW', 'RW', 'ST', 'AM'].includes(p.position))
      ));
      if (near) { picked.push(near.id); return; }
      const any = squad.find((p) => !picked.includes(p.id));
      picked.push(any ? any.id : null);
    });
    while (picked.length < 11) picked.push(null);
    this.starterIds = picked.slice(0, 11);
  }

  _pushUndo() {
    this.undoStack.push({
      formation: this.formation,
      tacticName: this.tacticName,
      captainId: this.captainId,
      starterIds: [...this.starterIds],
      customSlots: cloneSlots(this.customSlots)
    });
    if (this.undoStack.length > 25) this.undoStack.shift();
  }

  canUndo() {
    return this.undoStack.length > 0 && !this.matchSubSession.active;
  }

  undo() {
    if (this.matchSubSession.active) {
      return { ok: false, reason: 'Không thể hoàn tác tự do khi trận đấu đang diễn ra.' };
    }
    if (this.undoStack.length === 0) {
      return { ok: false, reason: 'Chưa có thao tác nào để hoàn tác.' };
    }
    const prev = this.undoStack.pop();
    this.formation = prev.formation;
    this.tacticName = prev.tacticName;
    this.captainId = prev.captainId;
    this.starterIds = [...prev.starterIds];
    this.customSlots = cloneSlots(prev.customSlots);
    if (this.state?.coach) {
      this.state.coach.formation = `${this.formation} · ${this.tacticName}`;
    }
    this.notify();
    return { ok: true };
  }

  // Đồng bộ 100% tủ đồ cá nhân theo danh sách cầu thủ PSG hiện tại
  syncLockers() {
    this.ensureShirtNumbers();
    const squad = this.state.getPsgSquad();
    const totalLockers = Math.max(20, squad.length);
    const nextLockers = [];
    for (let i = 0; i < totalLockers; i++) {
      const p = squad[i] || null;
      nextLockers.push({
        lockerId: `locker_${i + 1}`,
        playerId: p ? p.id : null,
        shirtNumber: p ? p.shirtNumber : null,
        displayName: p ? this.getDisplaySurname(p.name) : 'TRỐNG',
        fullName: p ? p.name : 'Tủ trống',
        position: p ? p.position : '',
        isCaptain: p ? p.id === this.captainId : false,
        isAssigned: !!p
      });
    }
    this.lockers = nextLockers;
  }

  initSchedules() {
    const squad = this.state.getPsgSquad();
    squad.forEach((p, idx) => {
      if (!this.schedules[p.id]) {
        const late = idx === 4 && Math.random() < 0.25;
        this.schedules[p.id] = {
          playerId: p.id,
          trainingStartTime: '10:00',
          requiredArrivalTime: '09:00',
          actualArrivalTime: late ? '09:12' : `08:${50 + (idx % 9)}`,
          currentActivity: 'Có mặt tại phòng thay đồ chuẩn bị tập',
          attendanceStatus: late ? 'late' : 'on_time'
        };
      }
    });
  }

  getRoutinePhase(clockHour) {
    if (clockHour < 9.0) return { key: 'home', label: 'Đang ở nhà / Di chuyển tới CLB', loc: 'off_campus' };
    if (clockHour < 9.25) return { key: 'arrive', label: '09:00–09:15 · Đến phòng thay đồ & chào đồng đội', loc: 'dressing_room' };
    if (clockHour < 9.5) return { key: 'change', label: '09:15–09:30 · Thay trang phục tập & chuẩn bị giày tại tủ', loc: 'dressing_room' };
    if (clockHour < 9.75) return { key: 'rest_pre', label: '09:30–09:45 · Nghỉ ngơi, uống nước & trò chuyện', loc: 'dressing_room' };
    if (clockHour < 10.0) return { key: 'briefing', label: '09:45–10:00 · HLV Luis Enrique phổ biến giáo án tại Phòng Thay Đồ', loc: 'dressing_room_table' };
    if (clockHour < 11.5) return { key: 'training', label: '10:00–11:30 · Tập luyện trên sân tập chính dưới sự chỉ đạo của HLV', loc: 'pitch' };
    if (clockHour < 12.5) return { key: 'cooldown', label: '11:30–12:30 · Trở lại phòng thay đồ, tắm & phục hồi', loc: 'dressing_room' };
    if (clockHour < 14.0) return { key: 'lunch', label: '12:30–14:00 · Nghỉ trưa / Sinh hoạt tự do', loc: 'lobby' };
    if (clockHour < 15.0) return { key: 'briefing_pm', label: '14:00–15:00 · Tập trung phòng thay đồ trước ca tập chiều (trước 60 phút)', loc: 'dressing_room_table' };
    if (clockHour < 16.5) return { key: 'training_pm', label: '15:00–16:30 · Tập chiến thuật chiều trên sân tập', loc: 'pitch' };
    return { key: 'leave', label: '16:30+ · Kết thúc lịch CLB & trở về nhà', loc: 'off_campus' };
  }

  _ensureSlotsValid() {
    if (!Array.isArray(this.customSlots) || this.customSlots.length !== 11) {
      this.customSlots = cloneSlots(FORMATION_PRESETS[this.formation] || FORMATION_PRESETS['4-3-3']);
    }
    if (!Array.isArray(this.starterIds)) this.starterIds = new Array(11).fill(null);
    while (this.starterIds.length < 11) this.starterIds.push(null);
    if (this.starterIds.length > 11) this.starterIds = this.starterIds.slice(0, 11);
  }

  // Làm sạch starterIds theo đội hình PSG thực tế & loại trùng lặp tuyệt đối
  _sanitizeStarterSlots(squad, autoFillMissing = false) {
    this._ensureSlotsValid();
    const validIds = new Set(squad.map((p) => p.id));
    const seen = new Set();

    for (let i = 0; i < 11; i++) {
      const pid = this.starterIds[i];
      if (!pid || !validIds.has(pid) || seen.has(pid)) {
        this.starterIds[i] = null;
        continue;
      }
      const p = squad.find((x) => x.id === pid);
      if (!p || (p.injuryDays || 0) > 0 || p.suspended) {
        this.starterIds[i] = null;
        continue;
      }
      seen.add(pid);
    }

    if (autoFillMissing) {
      for (let i = 0; i < 11; i++) {
        if (this.starterIds[i]) continue;
        const slotRole = this.customSlots[i]?.role || 'CM';
        const avail = squad.filter((p) => !seen.has(p.id) && (p.injuryDays || 0) <= 0 && !p.suspended);
        const match = avail.find((p) => normalizePosition(p.position) === normalizePosition(slotRole)) || avail[0];
        if (match) {
          this.starterIds[i] = match.id;
          seen.add(match.id);
        }
      }
    }

    // Bảo toàn captain hợp lệ
    if (this.captainId && !validIds.has(this.captainId)) {
      this.captainId = squad[0]?.id || null;
    }
  }

  getFormationData(options = {}) {
    const { fillEmpty = false } = options;
    this.ensureShirtNumbers();
    const squad = this.state.getPsgSquad();
    this._sanitizeStarterSlots(squad, fillEmpty);

    const ctx = this.getContext();
    const slots = this.customSlots.map((slot, idx) => {
      const pid = this.starterIds[idx] || null;
      const p = pid ? squad.find((x) => x.id === pid) : null;
      const suitability = p ? this.suitabilityAI.evaluatePlayerAtPosition(p, slot.role, ctx) : null;
      return {
        slotIndex: idx,
        role: slot.role,
        displayRole: POSITION_DISPLAY_LABEL[slot.role] || slot.role,
        formationX: slot.x,
        formationY: slot.y,
        playerId: p ? p.id : null,
        player: p || null,
        suitability
      };
    });

    const starters = slots
      .filter((sl) => !!sl.player)
      .map((sl) => ({
        slotIndex: sl.slotIndex,
        playerId: sl.player.id,
        shirtNumber: sl.player.shirtNumber,
        displayName: this.getDisplaySurname(sl.player.name),
        fullName: sl.player.name,
        position: sl.role,
        displayPosition: sl.displayRole,
        naturalPosition: sl.player.position,
        formationX: sl.formationX,
        formationY: sl.formationY,
        isCaptain: sl.player.id === this.captainId,
        isStarter: true,
        availability: sl.player.injuryDays > 0 ? 'injured' : sl.player.suspended ? 'suspended' : 'available',
        suitability: sl.suitability,
        player: sl.player
      }));

    const starterSet = new Set(starters.map((s) => s.playerId));
    const subbedOutSet = new Set(this.matchSubSession.active ? this.matchSubSession.subbedOutIds : []);

    const bench = squad
      .filter((p) => !starterSet.has(p.id))
      .map((p) => {
        const isSubbedOut = subbedOutSet.has(p.id);
        return {
          playerId: p.id,
          shirtNumber: p.shirtNumber,
          displayName: this.getDisplaySurname(p.name),
          fullName: p.name,
          position: p.position,
          displayPosition: POSITION_DISPLAY_LABEL[normalizePosition(p.position)] || p.position,
          isCaptain: p.id === this.captainId,
          isStarter: false,
          subbedOut: isSubbedOut,
          availability: p.injuryDays > 0 ? 'injured' : p.suspended ? 'suspended' : isSubbedOut ? 'subbed_out' : 'available',
          player: p
        };
      });

    const emptySlots = slots.filter((sl) => !sl.playerId);

    return {
      formation: this.formation,
      tacticName: this.tacticName,
      captainId: this.captainId,
      starters,
      slots,
      emptySlots,
      bench,
      subSession: { ...this.matchSubSession, subbedOutIds: [...this.matchSubSession.subbedOutIds], subHistory: [...this.matchSubSession.subHistory] }
    };
  }

  getSquadEvaluation() {
    const data = this.getFormationData();
    return this.suitabilityAI.evaluateSquad(data, this.getContext());
  }

  fillEmptySlotsWithBestAvailable() {
    this._pushUndo();
    const squad = this.state.getPsgSquad();
    this._sanitizeStarterSlots(squad, true);
    this.notify();
    return { ok: true };
  }

  setFormation(name, options = {}) {
    if (!FORMATION_PRESETS[name]) return false;
    const { preserveCustomCoords = false, autoArrange = false } = options;
    this._pushUndo();
    this.formation = name;
    if (!preserveCustomCoords) {
      this.customSlots = cloneSlots(FORMATION_PRESETS[name]);
    }
    if (autoArrange) {
      const squad = this.state.getPsgSquad();
      this.starterIds = this.suitabilityAI.computeOptimalXI(squad, this.customSlots, this.getContext());
    }
    if (this.state?.coach) {
      this.state.coach.formation = `${name} · ${this.tacticName}`;
    }
    this.notify();
    return true;
  }

  // Đánh giá trước khi đổi sơ đồ (KHÔNG tự động thay đổi đội hình hiện tại)
  previewFormationChange(targetFormation) {
    if (!FORMATION_PRESETS[targetFormation]) return null;
    const targetSlots = cloneSlots(FORMATION_PRESETS[targetFormation]);
    const squad = this.state.getPsgSquad();
    const currentData = this.getFormationData();
    const ctx = { ...this.getContext(), formation: targetFormation };

    const mismatches = [];
    const projectedSlots = targetSlots.map((slot, idx) => {
      const currentStarter = currentData.slots[idx]?.player || null;
      const ev = currentStarter ? this.suitabilityAI.evaluatePlayerAtPosition(currentStarter, slot.role, ctx) : null;
      if (currentStarter && ev && ev.score < 70) {
        mismatches.push({
          slotIndex: idx,
          playerId: currentStarter.id,
          playerName: currentStarter.name,
          naturalPosition: currentStarter.position,
          targetRole: slot.role,
          score: ev.score,
          tier: ev.tier,
          bestPosition: this.suitabilityAI.getTop3Positions(currentStarter, ctx, slot.role)?.bestDisplayPosition
        });
      }
      return {
        slotIndex: idx,
        role: slot.role,
        displayRole: POSITION_DISPLAY_LABEL[slot.role] || slot.role,
        formationX: slot.x,
        formationY: slot.y,
        playerId: currentStarter?.id || null,
        player: currentStarter,
        suitability: ev
      };
    });

    const projectedData = {
      formation: targetFormation,
      slots: projectedSlots,
      starters: projectedSlots
        .filter((sl) => !!sl.player)
        .map((sl) => ({
          slotIndex: sl.slotIndex,
          playerId: sl.player.id,
          fullName: sl.player.name,
          position: sl.role,
          player: sl.player
        }))
    };

    const currentEval = this.suitabilityAI.evaluateSquad(currentData, this.getContext());
    const keepLineupEval = this.suitabilityAI.evaluateSquad(projectedData, ctx);

    const optimalIds = this.suitabilityAI.computeOptimalXI(squad, targetSlots, ctx);
    const optimalSlots = targetSlots.map((slot, idx) => {
      const p = squad.find((x) => x.id === optimalIds[idx]) || null;
      return {
        slotIndex: idx,
        role: slot.role,
        playerId: p?.id || null,
        player: p
      };
    });
    const optimalEval = this.suitabilityAI.evaluateSquad({
      formation: targetFormation,
      slots: optimalSlots,
      starters: optimalSlots.filter((x) => !!x.player).map((x) => ({ slotIndex: x.slotIndex, playerId: x.player.id, fullName: x.player.name, position: x.role, player: x.player }))
    }, ctx);

    return {
      currentFormation: this.formation,
      targetFormation,
      mismatches,
      currentEvaluation: currentEval,
      keepLineupEvaluation: keepLineupEval,
      optimalEvaluation: optimalEval,
      optimalStarterIds: optimalIds
    };
  }

  applyOptimalXI() {
    this._pushUndo();
    this._ensureSlotsValid();
    const squad = this.state.getPsgSquad();
    this.starterIds = this.suitabilityAI.computeOptimalXI(squad, this.customSlots, this.getContext());
    this.notify();
    return { ok: true, starterIds: [...this.starterIds] };
  }

  setTacticName(name) {
    this._pushUndo();
    this.tacticName = String(name || '').trim() || 'Chiến thuật PSG';
    if (this.state?.coach) {
      this.state.coach.formation = `${this.formation} · ${this.tacticName}`;
    }
    this.notify();
  }

  setCaptain(playerId) {
    const p = this.state.getPsgSquad().find((x) => x.id === playerId);
    if (!p) return false;
    this._pushUndo();
    this.captainId = playerId;
    this.notify();
    this.state?.notifySquadChanged?.();
    return true;
  }

  setShirtNumber(playerId, newNum) {
    const n = Math.max(1, Math.min(99, Math.round(Number(newNum))));
    const squad = this.state.getPsgSquad();
    const target = squad.find((x) => x.id === playerId);
    if (!target || !n) return false;
    const holder = squad.find((x) => x.id !== playerId && x.shirtNumber === n);
    if (holder) holder.shirtNumber = target.shirtNumber;
    target.shirtNumber = n;
    this.notify();
    this.state?.notifySquadChanged?.();
    return true;
  }

  // Hoán đổi hoặc đưa cầu thủ vào slot (hỗ trợ cả Trước trận & Trong trận!)
  swapStarter(slotIndex, replacementPlayerId, options = {}) {
    if (this.matchSubSession.active) {
      return this.performInMatchSubstitution(slotIndex, replacementPlayerId, options);
    }
    return this._assignBeforeMatch(slotIndex, replacementPlayerId);
  }

  _assignBeforeMatch(slotIndex, replacementPlayerId) {
    this._ensureSlotsValid();
    if (slotIndex < 0 || slotIndex >= 11) {
      return { ok: false, reason: 'Vị trí trên sân không hợp lệ.' };
    }
    const squad = this.state.getPsgSquad();
    const rep = squad.find((x) => x.id === replacementPlayerId);
    if (!rep) return { ok: false, reason: 'Không tìm thấy cầu thủ trong đội một PSG.' };
    if ((rep.injuryDays || 0) > 0) return { ok: false, reason: `${rep.name} đang chấn thương (${rep.injuryDays} ngày), không thể vào đội hình chính!` };
    if (rep.suspended) return { ok: false, reason: `${rep.name} đang bị treo giò!` };

    this._pushUndo();
    const existingIdx = this.starterIds.indexOf(replacementPlayerId);
    if (existingIdx !== -1 && existingIdx !== slotIndex) {
      const tmp = this.starterIds[slotIndex] || null;
      this.starterIds[slotIndex] = replacementPlayerId;
      this.starterIds[existingIdx] = tmp;
    } else {
      this.starterIds[slotIndex] = replacementPlayerId;
    }

    this.notify();
    const role = this.customSlots[slotIndex]?.role || 'CM';
    const evalAfter = this.suitabilityAI.evaluatePlayerAtPosition(rep, role, this.getContext());
    return { ok: true, slotIndex, playerId: rep.id, role, suitability: evalAfter };
  }

  // Kéo cầu thủ đá chính sang một slot khác (swap nếu đã có người, hoặc chuyển sang slot trống!)
  moveStarterToSlot(fromSlotIdx, toSlotIdx) {
    if (this.matchSubSession.active) {
      // Trong trận được phép hoán đổi vị trí giữa các cầu thủ ĐANG trên sân (không tốn lượt thay người)
      this._ensureSlotsValid();
      if (fromSlotIdx === toSlotIdx || fromSlotIdx < 0 || toSlotIdx < 0 || fromSlotIdx >= 11 || toSlotIdx >= 11) {
        return { ok: false, reason: 'Vị trí không hợp lệ.' };
      }
      const fromId = this.starterIds[fromSlotIdx];
      const toId = this.starterIds[toSlotIdx];
      if (!fromId) return { ok: false, reason: 'Không có cầu thủ ở vị trí xuất phát.' };
      this.starterIds[toSlotIdx] = fromId;
      this.starterIds[fromSlotIdx] = toId || null;
      this.notify();
      return { ok: true, inMatchReposition: true };
    }

    this._ensureSlotsValid();
    if (fromSlotIdx === toSlotIdx || fromSlotIdx < 0 || toSlotIdx < 0 || fromSlotIdx >= 11 || toSlotIdx >= 11) {
      return { ok: false, reason: 'Vị trí di chuyển không hợp lệ.' };
    }
    const movingId = this.starterIds[fromSlotIdx];
    if (!movingId) return { ok: false, reason: 'Ô xuất phát đang trống.' };

    this._pushUndo();
    const targetId = this.starterIds[toSlotIdx] || null;
    this.starterIds[toSlotIdx] = movingId;
    this.starterIds[fromSlotIdx] = targetId;
    this.notify();

    const squad = this.state.getPsgSquad();
    const movingPlayer = squad.find((p) => p.id === movingId);
    const toRole = this.customSlots[toSlotIdx]?.role || 'CM';
    return {
      ok: true,
      swapped: !!targetId,
      suitability: movingPlayer ? this.suitabilityAI.evaluatePlayerAtPosition(movingPlayer, toRole, this.getContext()) : null
    };
  }

  // Kéo cầu thủ đá chính sang một vùng chiến thuật trống bất kỳ trên sân (đổi vai trò/tọa độ slot mà KHÔNG đổi chỉ số gốc!)
  moveStarterToTacticalZone(fromSlotIdx, newRole, x, y) {
    this._ensureSlotsValid();
    if (fromSlotIdx < 0 || fromSlotIdx >= 11) return { ok: false, reason: 'Slot không hợp lệ.' };
    const pid = this.starterIds[fromSlotIdx];
    if (!pid) return { ok: false, reason: 'Không có cầu thủ tại vị trí này.' };

    const normRole = normalizePosition(newRole);
    const clampedX = Math.max(10, Math.min(90, Number(x)));
    const clampedY = Math.max(12, Math.min(91, Number(y)));

    if (!this.matchSubSession.active) this._pushUndo();
    this.customSlots[fromSlotIdx] = {
      slotIndex: fromSlotIdx,
      role: normRole,
      x: clampedX,
      y: clampedY
    };
    this.notify();

    const p = this.state.getPsgSquad().find((pl) => pl.id === pid);
    return {
      ok: true,
      slotIndex: fromSlotIdx,
      newRole: normRole,
      suitability: p ? this.suitabilityAI.evaluatePlayerAtPosition(p, normRole, this.getContext()) : null
    };
  }

  // Đổi vai trò chiến thuật của 1 slot (VD: CM -> CDM hoặc LW -> RW)
  changeSlotRole(slotIndex, newRole) {
    this._ensureSlotsValid();
    if (slotIndex < 0 || slotIndex >= 11) return { ok: false };
    const slot = this.customSlots[slotIndex];
    return this.moveStarterToTacticalZone(slotIndex, newRole, slot.x, slot.y);
  }

  // Đưa 1 cầu thủ đá chính xuống ghế dự bị (để lại vị trí trống trước khi xếp người mới)
  benchStarter(slotIndex) {
    if (this.matchSubSession.active) {
      return { ok: false, reason: 'Trong trận đấu không thể rút người ra mà không đưa cầu thủ dự bị vào thế chỗ!' };
    }
    this._ensureSlotsValid();
    if (slotIndex < 0 || slotIndex >= 11 || !this.starterIds[slotIndex]) {
      return { ok: false, reason: 'Vị trí đã trống.' };
    }
    this._pushUndo();
    const removedId = this.starterIds[slotIndex];
    this.starterIds[slotIndex] = null;
    this.notify();
    return { ok: true, removedPlayerId: removedId };
  }

  // ==================== QUẢN LÝ THAY NGƯỜI TRƯỚC TRẬN VS TRONG TRẬN ====================

  startInMatchSession(maxSubs = 5, initialMinute = 1) {
    const squad = this.state.getPsgSquad();
    this._sanitizeStarterSlots(squad, true);
    this.matchSubSession = {
      active: true,
      mode: 'in_match',
      matchMinute: Math.max(0, Math.min(90, Number(initialMinute) || 1)),
      matchFinished: false,
      maxSubs: Math.max(1, Number(maxSubs) || 5),
      subsUsed: 0,
      subbedOutIds: [],
      subHistory: []
    };
    this.notify();
    return { ok: true, session: { ...this.matchSubSession } };
  }

  updateInMatchMinute(minute, finished = false) {
    if (!this.matchSubSession.active) return;
    this.matchSubSession.matchMinute = Math.max(0, Math.min(120, Number(minute) || 0));
    this.matchSubSession.matchFinished = !!finished;
  }

  endInMatchSession() {
    this.matchSubSession = this._createDefaultMatchSession();
    this.notify();
    return { ok: true };
  }

  getRemainingSubs() {
    if (!this.matchSubSession.active) return Infinity;
    return Math.max(0, this.matchSubSession.maxSubs - this.matchSubSession.subsUsed);
  }

  performInMatchSubstitution(slotIndex, inPlayerId, options = {}) {
    if (!this.matchSubSession.active) {
      return this._assignBeforeMatch(slotIndex, inPlayerId);
    }
    const minute = typeof options.minute === 'number' ? options.minute : this.matchSubSession.matchMinute;
    if (this.matchSubSession.matchFinished || minute >= 95) {
      return { ok: false, reason: 'Trận đấu đã kết thúc, không thể thay người thêm!' };
    }
    if (this.matchSubSession.subsUsed >= this.matchSubSession.maxSubs) {
      return { ok: false, reason: `Đã hết lượt thay người (${this.matchSubSession.subsUsed}/${this.matchSubSession.maxSubs})!` };
    }

    this._ensureSlotsValid();
    if (slotIndex < 0 || slotIndex >= 11) {
      return { ok: false, reason: 'Vị trí thay người không hợp lệ.' };
    }

    const squad = this.state.getPsgSquad();
    const inPlayer = squad.find((p) => p.id === inPlayerId);
    if (!inPlayer) return { ok: false, reason: 'Không tìm thấy cầu thủ dự bị thuộc đội một PSG.' };
    if ((inPlayer.injuryDays || 0) > 0) return { ok: false, reason: `${inPlayer.name} đang chấn thương (${inPlayer.injuryDays} ngày)!` };
    if (inPlayer.suspended) return { ok: false, reason: `${inPlayer.name} đang bị treo giò!` };

    if (this.matchSubSession.subbedOutIds.includes(inPlayerId)) {
      return { ok: false, reason: `${inPlayer.name} đã bị thay ra trước đó, theo luật không thể trở lại sân!` };
    }
    if (this.starterIds.includes(inPlayerId)) {
      return { ok: false, reason: `${inPlayer.name} đang thi đấu trên sân!` };
    }

    const outPlayerId = this.starterIds[slotIndex];
    const outPlayer = outPlayerId ? squad.find((p) => p.id === outPlayerId) : null;

    this.starterIds[slotIndex] = inPlayerId;
    if (outPlayerId && !this.matchSubSession.subbedOutIds.includes(outPlayerId)) {
      this.matchSubSession.subbedOutIds.push(outPlayerId);
    }
    this.matchSubSession.subsUsed++;

    const role = this.customSlots[slotIndex]?.role || inPlayer.position;
    const subRecord = {
      minute: Math.floor(minute),
      slotIndex,
      role,
      outPlayerId: outPlayerId || null,
      outName: outPlayer ? outPlayer.name : 'Vị trí trống',
      inPlayerId,
      inName: inPlayer.name,
      suitability: this.suitabilityAI.evaluatePlayerAtPosition(inPlayer, role, this.getContext()).score
    };
    this.matchSubSession.subHistory.unshift(subRecord);
    this.notify();

    return {
      ok: true,
      subRecord,
      subsUsed: this.matchSubSession.subsUsed,
      subsRemaining: this.getRemainingSubs()
    };
  }

  exportState() {
    return {
      formation: this.formation,
      tacticName: this.tacticName,
      captainId: this.captainId,
      starterIds: [...this.starterIds],
      customSlots: cloneSlots(this.customSlots),
      schedules: this.schedules,
      matchSubSession: {
        ...this.matchSubSession,
        subbedOutIds: [...this.matchSubSession.subbedOutIds],
        subHistory: [...this.matchSubSession.subHistory]
      }
    };
  }

  importState(snap) {
    if (!snap) return;
    if (snap.formation && FORMATION_PRESETS[snap.formation]) this.formation = snap.formation;
    if (snap.tacticName) this.tacticName = snap.tacticName;
    if (snap.captainId) this.captainId = snap.captainId;
    if (Array.isArray(snap.starterIds)) {
      this.starterIds = [...snap.starterIds];
    }
    if (Array.isArray(snap.customSlots) && snap.customSlots.length === 11) {
      this.customSlots = cloneSlots(snap.customSlots);
    } else {
      this.customSlots = cloneSlots(FORMATION_PRESETS[this.formation] || FORMATION_PRESETS['4-3-3']);
    }
    if (snap.schedules) this.schedules = snap.schedules;
    if (snap.matchSubSession) {
      this.matchSubSession = {
        ...this._createDefaultMatchSession(),
        ...snap.matchSubSession,
        subbedOutIds: Array.isArray(snap.matchSubSession.subbedOutIds) ? [...snap.matchSubSession.subbedOutIds] : [],
        subHistory: Array.isArray(snap.matchSubSession.subHistory) ? [...snap.matchSubSession.subHistory] : []
      };
    } else {
      this.matchSubSession = this._createDefaultMatchSession();
    }
    this.undoStack = [];
    this.notify();
  }

  // Render SVG áo đấu PSG thật (hỗ trợ cả hàm cũ lẫn view mới)
  static renderJerseyCardHTML(slot, isSelected = false) {
    const isGK = slot.position === 'GK';
    const bodyCol = isGK ? '#eab308' : '#00205b';
    const stripeCol = isGK ? '#ca8a04' : '#da291c';
    const textCol = isGK ? '#0f172a' : '#ffffff';
    const suit = slot.suitability;
    const badgeColor = suit?.tier?.color || '#4ade80';
    return `
      <button class="pitch-jersey ${isSelected ? 'selected' : ''}" data-slot="${slot.slotIndex}" data-pid="${slot.playerId}" style="left:${slot.formationX}%;top:${slot.formationY}%;" title="${slot.fullName} (#${slot.shirtNumber})">
        <svg viewBox="0 0 64 62" class="jersey-svg">
          <path d="M18,6 L46,6 L60,19 L51,29 L46,24 L46,58 L18,58 L18,24 L13,29 L4,19 Z" fill="${bodyCol}" stroke="#ffffff" stroke-width="2.2"/>
          <rect x="27" y="6" width="10" height="52" fill="${stripeCol}"/>
          <text x="32" y="38" text-anchor="middle" fill="${textCol}" font-size="18" font-weight="900" font-family="sans-serif">${slot.shirtNumber}</text>
        </svg>
        ${slot.isCaptain ? `<span class="cap-badge">C</span>` : ''}
        <span class="jersey-name">${slot.displayName}</span>
        <span class="jersey-pos">${slot.displayPosition || slot.position}${suit ? ` · <b style="color:${badgeColor}">${suit.score}</b>` : ''}</span>
      </button>`;
  }

  // Vẽ Canvas Texture động cho Màn hình Chiến thuật 3D trong Phòng Thay Đồ (cập nhật thật theo sơ đồ hiện tại!)
  drawTacticalScreenCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#07142b';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1b5e20';
    ctx.fillRect(18, 48, w - 36, h - 66);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeRect(24, 54, w - 48, h - 78);
    ctx.beginPath(); ctx.moveTo(24, 54 + (h - 78) / 2); ctx.lineTo(w - 24, 54 + (h - 78) / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(w / 2, 54 + (h - 78) / 2, 36, 0, Math.PI * 2); ctx.stroke();

    const data = this.getFormationData({ fillEmpty: false });
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`PSG · SƠ ĐỒ ${data.formation} · ${data.tacticName}`, 20, 32);

    data.starters.forEach((s) => {
      const px = 24 + (s.formationX / 100) * (w - 48);
      const py = 54 + (s.formationY / 100) * (h - 78);
      ctx.fillStyle = s.position === 'GK' ? '#eab308' : '#00205b';
      ctx.fillRect(px - 14, py - 14, 28, 26);
      ctx.fillStyle = s.position === 'GK' ? '#ca8a04' : '#da291c';
      ctx.fillRect(px - 4, py - 14, 8, 26);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px - 14, py - 14, 28, 26);
      ctx.fillStyle = s.position === 'GK' ? '#0f172a' : '#ffffff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(s.shirtNumber), px, py + 4);
      if (s.isCaptain) {
        ctx.fillStyle = '#facc15';
        ctx.fillRect(px + 10, py - 18, 13, 13);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText('C', px + 16.5, py - 8);
      }
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(s.displayName, px, py + 23);
    });
  }
}
