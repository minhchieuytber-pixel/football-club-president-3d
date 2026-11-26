// src/training/TrainingSystem.js
// Hệ thống Huấn Luyện Cầu Thủ 3D:
// - 7 nhóm bài tập thực tế (Thể lực, Sút bóng, Chuyền bóng, Chiến thuật theo sơ đồ SquadFormationSystem, Đấu tập đối kháng 2 đội, Phòng ngự, Tình huống cố định)
// - Đạo cụ 3D trên sân tập (cọc tập, rào đá phạt, 3 quả bóng 3D chuyển động thực tế: chuyền, sút vào khung thành & thủ môn đổ người, đấu tập)
// - Lịch tập mẫu 09:00–12:00 + tùy chỉnh bởi Chủ tịch/HLV + Báo cáo sau buổi tập + Tương tác báo cáo giữa Ban huấn luyện và Chủ tịch!
import { FORMATION_PRESETS } from '../squad/SquadFormationSystem.js';

export const DEFAULT_TRAINING_SCHEDULE = [
  { id: 'slot_1', start: 9.0,  end: 9.25,  timeLabel: '09:00–09:15', drill: 'gather',    title: 'Cầu thủ tập trung & điểm danh',  ownerRole: 'assistant_manager', ownerLabel: 'Trợ lý HLV trưởng' },
  { id: 'slot_2', start: 9.25, end: 9.5,   timeLabel: '09:15–09:30', drill: 'warmup',    title: 'Khởi động & giãn cơ',            ownerRole: 'fitness_coach',     ownerLabel: 'Trợ lý thể lực' },
  { id: 'slot_3', start: 9.5,  end: 10.0,  timeLabel: '09:30–10:00', drill: 'fitness',   title: 'Tập thể lực & chạy nước rút',    ownerRole: 'fitness_coach',     ownerLabel: 'Trợ lý thể lực' },
  { id: 'slot_4', start: 10.0, end: 10.5,  timeLabel: '10:00–10:30', drill: 'passing',   title: 'Tập chuyền bóng & Rondo',        ownerRole: 'technical_coach',   ownerLabel: 'Trợ lý kỹ thuật' },
  { id: 'slot_5', start: 10.5, end: 11.0,  timeLabel: '10:30–11:00', drill: 'shooting',  title: 'Tập dứt điểm & Thủ môn cản phá', ownerRole: 'technical_coach',   ownerLabel: 'Trợ lý kỹ thuật & HLV Thủ môn' },
  { id: 'slot_6', start: 11.0, end: 11.5,  timeLabel: '11:00–11:30', drill: 'tactics',   title: 'Tập chiến thuật theo sơ đồ PSG', ownerRole: 'tactical_coach',    ownerLabel: 'Trợ lý chiến thuật' },
  { id: 'slot_7', start: 11.5, end: 12.0,  timeLabel: '11:30–12:00', drill: 'scrimmage', title: 'Đấu tập đối kháng (2 đội)',      ownerRole: 'head_coach',        ownerLabel: 'HLV trưởng' },
  { id: 'slot_8', start: 12.0, end: 12.25, timeLabel: '12:00–12:15', drill: 'summary',   title: 'Tổng kết & Lập báo cáo buổi tập', ownerRole: 'head_coach',        ownerLabel: 'Ban huấn luyện' },
  { id: 'slot_9', start: 15.0, end: 15.75, timeLabel: '15:00–15:45', drill: 'defending', title: 'Tập phòng ngự & bọc lót',        ownerRole: 'tactical_coach',    ownerLabel: 'Trợ lý chiến thuật' },
  { id: 'slot_10',start: 15.75,end: 16.5,  timeLabel: '15:45–16:30', drill: 'set_pieces',title: 'Tập đá phạt & phạt góc',         ownerRole: 'set_piece_coach',   ownerLabel: 'HLV tình huống cố định' }
];

export const DRILL_CATALOG = {
  gather:     { label: 'Tập trung điểm danh', desc: 'Cầu thủ di chuyển từ phòng thay đồ ra đường biên tập trung nhận giáo án.' },
  warmup:     { label: 'Khởi động', desc: 'Giãn cơ, xoay khớp, chạy nhẹ tăng nhịp tim dưới sự hướng dẫn của Trợ lý thể lực.' },
  fitness:    { label: 'Tập thể lực', desc: 'Chạy bền, chạy nước rút, đổi hướng qua cọc, tăng tốc & thăng bằng.' },
  passing:    { label: 'Tập chuyền bóng', desc: 'Chuyền ngắn một chạm, phối hợp tam giác, chuyền dài & giữ bóng dưới áp lực.' },
  shooting:   { label: 'Tập sút bóng', desc: 'Đồng đội chuyền bóng → cầu thủ dứt điểm → bóng bay về khung thành → thủ môn đổ người cản phá.' },
  tactics:    { label: 'Tập chiến thuật', desc: 'Sắp xếp vị trí theo đúng sơ đồ từ Global Squad Formation System, pressing & chuyển trạng thái.' },
  scrimmage:  { label: 'Đấu tập đối kháng', desc: 'Hai đội phân màu áo (Xanh PSG vs Áo tập Vàng) thi đấu đối kháng chuyền/rê/sút/phòng ngự trên sân tập.' },
  defending:  { label: 'Tập phòng ngự', desc: 'Kèm người, bọc lót, cắt đường chuyền & giữ cự ly hàng phòng ngự.' },
  set_pieces: { label: 'Tập tình huống cố định', desc: 'Đá phạt trực tiếp qua hàng rào, đá phạt góc tấn công & tổ chức phòng ngự phạt góc.' },
  recovery:   { label: 'Phục hồi nhẹ', desc: 'Đi bộ thả lỏng, giãn cơ & phục hồi thể trạng cùng HLV phục hồi.' },
  summary:    { label: 'Tổng kết buổi tập', desc: 'Ban huấn luyện đánh giá chỉ số từng cầu thủ và gửi báo cáo cho Chủ tịch.' }
};

export const TRAINING_PITCH = {
  cx: 192.0,
  cz: -86.0,
  minX: 156.0,
  maxX: 228.0,
  minZ: -108.0,
  maxZ: -64.0,
  westGoalX: 155.0,
  eastGoalX: 229.0
};

export const REHAB_PITCH = {
  cx: 192.0,
  cz: -131.0
};

export const MEDICAL_RECOVERY_SPOT = {
  cx: 168.0,
  cz: -38.0
};

function markSharedAsset(obj) {
  if (!obj) return obj;
  if (!obj.userData) obj.userData = {};
  obj.userData.sharedAsset = true;
  return obj;
}

export class TrainingSystem {
  constructor(state) {
    this.state = state;
    this.sceneGroup = null;
    this.balls = {};
    this.ballTimers = { pass: 0, shoot: 0, scrimmage: 0 };
    this.shootPhase = 0; // 0 = chuyền kiến tạo, 1 = sút vào khung thành, 2 = reset
    this.shootState = {
      startX: TRAINING_PITCH.cx - 21.5,
      startZ: TRAINING_PITCH.cz + 8.0,
      targetX: TRAINING_PITCH.westGoalX + 1.0,
      targetZ: TRAINING_PITCH.cz,
      t: 0,
      scored: false
    };
    this.passState = { idx: 0, t: 0 };
    this.scrimmageState = { carrierIdx: 0, targetIdx: 1, t: 0, shotMode: false };
    // Zero-GC scratch buffers & đồng hồ mô phỏng nội bộ (không phụ thuộc wall-clock performance.now())
    this._playerNpcs = [];
    this._gks = [];
    this._outfield = [];
    this._injuredNpcs = [];
    this._simTime = 0;
    this._wasZoneActive = true;
    this.reset();
  }

  reset() {
    this.schedule = DEFAULT_TRAINING_SCHEDULE.map((s) => ({ ...s }));
    this.intensity = 'Trung bình'; // 'Hồi phục' | 'Nhẹ' | 'Trung bình' | 'Cao'
    this.focus = 'Cân bằng';       // 'Cân bằng' | 'Thể lực' | 'Kỹ thuật' | 'Chiến thuật' | 'Dứt điểm' | 'Đấu tập' | 'Phục hồi'
    this.trainingReports = [];
    this.pendingCoachInteractions = [];
    this.lastReportedDayKey = null;
    this.currentDrillKey = 'gather';
    this.lastDrillKey = null;
    this.seedInitialCoachProposal();
  }

  seedInitialCoachProposal() {
    const tactName = this.state.staffDb?.active?.find((s) => s.roleKey === 'tactical_coach')?.name || 'Aitor Unzué';
    const fitName = this.state.staffDb?.active?.find((s) => s.roleKey === 'fitness_coach')?.name || 'Pedro Gómez';
    this.pendingCoachInteractions = [
      {
        id: 'ci_init_1',
        date: 'Hôm nay',
        staffName: fitName,
        role: 'Trợ Lý Thể Lực',
        roleKey: 'fitness_coach',
        message: 'Thưa Chủ tịch, giáo án khởi đầu mùa giải đang ở cường độ Trung bình. Nếu ngài muốn tăng cường nền tảng thể lực trước chuỗi trận Champions League, tôi đề xuất đẩy nhóm bài chạy nước rút thêm 15%.',
        proposedAction: { intensity: 'Cao', focus: 'Thể lực' },
        status: 'pending'
      },
      {
        id: 'ci_init_2',
        date: 'Hôm nay',
        staffName: tactName,
        role: 'Trợ Lý Chiến Thuật',
        roleKey: 'tactical_coach',
        message: `Thưa Chủ tịch, đội bóng đang tập theo sơ đồ ${this.state.formationSystem?.formation || '4-3-3'}. Chúng ta cần tăng thêm các bài chuyển trạng thái từ phòng ngự sang tấn công giữa tuyến giữa và hàng công.`,
        proposedAction: { focus: 'Chiến thuật' },
        status: 'pending'
      }
    ];
  }

  // Xây dựng đạo cụ huấn luyện 3D trực tiếp trên mặt cỏ PSG TRAINING PITCH (tâm 192, -86)
  build3DTrainingEquipment(campusScene) {
    if (!campusScene || !campusScene.root || typeof THREE === 'undefined') return;
    if (this.sceneGroup) campusScene.root.remove(this.sceneGroup);

    const { cx, cz } = TRAINING_PITCH;
    const g = new THREE.Group();
    const coneMat = markSharedAsset(new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 }));
    const yellowConeMat = markSharedAsset(new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 }));
    const coneGeo = markSharedAsset(new THREE.ConeGeometry(0.16, 0.34, 8));

    // 1. Cọc chạy đổi hướng khu Thể lực (góc Đông Nam sân tập PSG TRAINING PITCH)
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(coneGeo, coneMat);
      c.position.set(cx + 12 + i * 2.2, 0.24, cz + 13.5 + (i % 2 === 0 ? 0 : 1.8));
      g.add(c);
    }

    // 2. Tam giác / vòng tròn Rondo khu Chuyền bóng (vòng tròn trung tâm sân tập)
    const rondoPts = [[-6, 6], [6, 6], [0, 0], [-6, -6], [6, -6]];
    for (let i = 0; i < rondoPts.length; i++) {
      const [ox, oz] = rondoPts[i];
      const c = new THREE.Mesh(coneGeo, yellowConeMat);
      c.position.set(cx + ox, 0.24, cz + oz);
      g.add(c);
    }

    // 3. Hàng rào người nộm đá phạt (dùng chung 1 BoxGeometry + 1 Material)
    const wallMat = markSharedAsset(new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.5 }));
    const dummyGeo = markSharedAsset(new THREE.BoxGeometry(0.45, 1.78, 0.14));
    for (let i = 0; i < 4; i++) {
      const dummy = new THREE.Mesh(dummyGeo, wallMat);
      dummy.position.set(cx + 22.5, 0.96, cz - 2.0 + i * 0.65);
      dummy.rotation.y = Math.PI / 2;
      dummy.castShadow = true;
      g.add(dummy);
    }

    // 4. Bảng chiến thuật đứng ngoài đường biên Nam sân tập (cạnh Ban huấn luyện)
    const boardStand = new THREE.Mesh(
      markSharedAsset(new THREE.BoxGeometry(1.5, 1.05, 0.08)),
      markSharedAsset(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 }))
    );
    boardStand.position.set(cx + 3.8, 1.35, cz + 25.0);
    const boardFace = new THREE.Mesh(
      markSharedAsset(new THREE.PlaneGeometry(1.38, 0.92)),
      markSharedAsset(new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.6 }))
    );
    boardFace.position.set(cx + 3.8, 1.35, cz + 24.95);
    boardFace.rotation.y = Math.PI;
    g.add(boardStand, boardFace);

    // 5. Ba quả bóng 3D thực tế trên sân tập chính (dùng chung 1 SphereGeometry + 1 Material)
    const ballGeo = markSharedAsset(new THREE.SphereGeometry(0.15, 12, 10));
    const ballMat = markSharedAsset(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 }));
    const makeBall = () => {
      const ball = new THREE.Mesh(ballGeo, ballMat);
      ball.castShadow = true;
      ball.position.set(cx, 0.22, cz);
      g.add(ball);
      return ball;
    };
    this.balls = {
      passing: makeBall(),
      shooting: makeBall(),
      scrimmage: makeBall()
    };
    this.balls.passing.position.set(cx, 0.22, cz);
    this.balls.shooting.position.set(cx - 18, 0.22, cz);
    this.balls.scrimmage.position.set(cx, 0.22, cz);

    campusScene.root.add(g);
    this.sceneGroup = g;
  }

  getActiveSlot(clockHour) {
    return this.schedule.find((s) => clockHour >= s.start && clockHour < s.end) || null;
  }

  _formatClockWindow(startH, endH) {
    const fmt = (val) => {
      const h = Math.floor(((val % 24) + 24) % 24);
      const m = Math.round((val - Math.floor(val)) * 60) % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };
    return `${fmt(startH)}–${fmt(endH)}`;
  }

  getSquadScheduleStatus(clockHour = 9.5, matchdaySystem = null) {
    if (matchdaySystem?.isActive || matchdaySystem?.liveSession && !matchdaySystem.liveSession.finished) {
      return {
        icon: '🏟️',
        badge: 'MATCHDAY',
        title: 'Đội một đang thi đấu Matchday',
        windowText: 'Trực tiếp'
      };
    }

    const h = ((Number(clockHour) || 0) % 24 + 24) % 24;
    if (h >= 8.75 && h < 9.25) {
      return { icon: '👕', badge: 'THAY ĐỒ', title: 'Chuẩn bị tập buổi sáng', windowText: '08:45–09:25' };
    }
    if (h >= 9.25 && h < 12.15) {
      const slot = this.getActiveSlot(h);
      const title = slot?.title || DRILL_CATALOG[this.currentDrillKey]?.label || 'Tập luyện đội một PSG';
      const win = slot ? this._formatClockWindow(slot.start, slot.end) : '09:25–12:15';
      return { icon: '⚽', badge: 'TẬP SÁNG', title, windowText: win };
    }
    if (h >= 12.15 && h < 13.0) {
      return { icon: '💧', badge: 'HẠ NHIỆT', title: 'Thay đồ & phục hồi sau tập', windowText: '12:15–13:00' };
    }
    if (h >= 13.0 && h < 13.75) {
      return { icon: '🍽️', badge: 'ĂN TRƯA', title: 'Dùng bữa trưa dinh dưỡng', windowText: '13:00–13:45' };
    }
    if (h >= 13.75 && h < 14.25) {
      return { icon: '🛋️', badge: 'NGHỈ TRƯA', title: 'Nghỉ ngơi giữa ngày', windowText: '13:45–14:25' };
    }
    if (h >= 14.25 && h < 15.0) {
      return { icon: '👕', badge: 'THAY ĐỒ', title: 'Chuẩn bị tập buổi chiều', windowText: '14:25–15:00' };
    }
    if (h >= 15.0 && h < 16.5) {
      const slot = this.getActiveSlot(h);
      const title = slot?.title || 'Tập chiến thuật buổi chiều';
      const win = slot ? this._formatClockWindow(slot.start, slot.end) : '15:00–16:30';
      return { icon: '⚽', badge: 'TẬP CHIỀU', title, windowText: win };
    }
    if (h >= 16.5 && h < 17.65) {
      return { icon: '💪', badge: 'TỰ DO · GYM', title: 'Gym, trị liệu & phục hồi', windowText: '16:30–17:40' };
    }
    if (h >= 17.65 && h < 19.35) {
      return { icon: '🍽️', badge: 'ĂN TỐI', title: 'Dùng bữa tối Residence', windowText: '17:40–19:20' };
    }
    if (h >= 19.35 && h < 21.25) {
      return { icon: '📺', badge: 'TỰ DO', title: 'Thư giãn Lounge & phòng riêng', windowText: '19:20–21:15' };
    }
    if (h >= 21.25 && h < 22.5) {
      return { icon: '🛏️', badge: 'VỀ PHÒNG', title: 'Nghỉ ngơi tại phòng cá nhân', windowText: '21:15–22:30' };
    }
    if (h >= 6.5 && h < 7.35) {
      return { icon: '☀️', badge: 'THỨC DẬY', title: 'Vệ sinh & khởi đầu ngày mới', windowText: '06:30–07:20' };
    }
    if (h >= 7.35 && h < 8.75) {
      return { icon: '🥐', badge: 'ĂN SÁNG', title: 'Ăn sáng dinh dưỡng đội một', windowText: '07:20–08:45' };
    }
    return { icon: '🌙', badge: 'NGỦ ĐÊM', title: 'Giờ ngủ nghỉ toàn đội', windowText: '22:30–06:30' };
  }

  setIntensity(level) {
    if (!['Hồi phục', 'Nhẹ', 'Trung bình', 'Cao'].includes(level)) return false;
    this.intensity = level;
    return true;
  }

  // Tùy chỉnh giáo án tập theo yêu cầu Chủ tịch / đề xuất HLV trưởng
  applyTrainingFocus(focusKey) {
    this.focus = focusKey;
    const map = {
      'Thể lực':     ['warmup', 'fitness', 'fitness', 'passing', 'scrimmage'],
      'Kỹ thuật':    ['warmup', 'passing', 'passing', 'shooting', 'scrimmage'],
      'Chiến thuật': ['warmup', 'passing', 'tactics', 'tactics', 'scrimmage'],
      'Dứt điểm':    ['warmup', 'fitness', 'shooting', 'shooting', 'scrimmage'],
      'Đấu tập':     ['warmup', 'passing', 'tactics', 'scrimmage', 'scrimmage'],
      'Phục hồi':    ['warmup', 'recovery', 'recovery', 'passing', 'recovery'],
      'Cân bằng':    ['warmup', 'fitness', 'passing', 'shooting', 'tactics']
    };
    const seq = map[focusKey] || map['Cân bằng'];
    const roleMap = {
      warmup: ['fitness_coach', 'Trợ lý thể lực'],
      fitness: ['fitness_coach', 'Trợ lý thể lực'],
      passing: ['technical_coach', 'Trợ lý kỹ thuật'],
      shooting: ['technical_coach', 'Trợ lý kỹ thuật & HLV Thủ môn'],
      tactics: ['tactical_coach', 'Trợ lý chiến thuật'],
      scrimmage: ['head_coach', 'HLV trưởng'],
      recovery: ['rehab_coach', 'HLV phục hồi thể lực']
    };
    // Cập nhật 5 khung tập chính buổi sáng (slot_2..slot_6)
    for (let i = 0; i < 5; i++) {
      const slot = this.schedule[i + 1];
      if (!slot) continue;
      const dk = seq[i];
      slot.drill = dk;
      slot.title = DRILL_CATALOG[dk]?.label || dk;
      slot.ownerRole = roleMap[dk]?.[0] || 'head_coach';
      slot.ownerLabel = roleMap[dk]?.[1] || 'Ban huấn luyện';
    }
    if (focusKey === 'Phục hồi') this.intensity = 'Hồi phục';
  }

  _isOnTrainingPitch(pos) {
    if (!pos) return false;
    return pos.x >= TRAINING_PITCH.minX - 6 && pos.x <= TRAINING_PITCH.maxX + 6 &&
           pos.z >= TRAINING_PITCH.minZ - 6 && pos.z <= TRAINING_PITCH.maxZ + 6;
  }

  _assignPitchTarget(n, tx, tz, npcSystem, allowAStar) {
    if (allowAStar && n.mesh && !this._isOnTrainingPitch(n.mesh.position)) {
      npcSystem.setNpcDestination(n, tx, tz);
      return;
    }
    if (n.finalDest) {
      n.finalDest.x = tx;
      n.finalDest.z = tz;
    } else {
      n.finalDest = { x: tx, z: tz };
    }
    if (n.path && n.path.length > 0) n.path.length = 0;
    n.pathIdx = 0;
    n.target.set(tx, 0.14, tz);
  }

  // Điều phối toàn bộ cầu thủ & bóng 3D thực hiện bài tập thật tại PSG TRAINING PITCH theo giờ GameTimeSystem!
  // Cầu thủ chấn thương (injuryDays > 0) bị loại khỏi bài tập cường độ cao và đưa sang Trung tâm Y tế / Phục hồi.
  update3DTraining(dt, clockHour, allNpcs, npcSystem, zoneActive = true) {
    this._simTime += dt;
    const slot = this.getActiveSlot(clockHour);
    const drill = slot ? slot.drill : null;
    this.currentDrillKey = drill || 'idle';

    // Khi kết thúc khung tập sáng (12:00), luôn tự động lập báo cáo buổi tập 1 lần/ngày bất kể player đứng ở đâu!
    const dayKey = this.state?.timeSystem ? this.state.timeSystem.getDayKey() : `d_${this.state?.dayNum ?? 1}`;
    if (drill === 'summary' && this.lastReportedDayKey !== dayKey) {
      this.concludeTrainingSession(dayKey);
    }

    const drillChanged = drill !== this.lastDrillKey;
    const zoneJustActivated = zoneActive && !this._wasZoneActive;

    // Thu thập danh sách cầu thủ bằng scratch array (Zero-GC, không .filter() mỗi frame)
    const playerNpcs = this._playerNpcs;
    const gks = this._gks;
    const outfield = this._outfield;
    const injuredNpcs = this._injuredNpcs;
    playerNpcs.length = 0;
    gks.length = 0;
    outfield.length = 0;
    injuredNpcs.length = 0;

    const summoned = npcSystem ? npcSystem.summonedPlayerNpc : null;
    for (let i = 0; i < allNpcs.length; i++) {
      const n = allNpcs[i];
      if (!n.isPlayer || n === summoned) continue;
      const m = n.mode;
      if (m === 'going_president' || m === 'sit_president' || m === 'event_travel' || m === 'event_hold') continue;
      playerNpcs.push(n);

      const pObj = this.state?.getPlayerById?.(n.playerId);
      const isInjured = Boolean(pObj && (pObj.injuryDays || 0) > 0);
      if (isInjured) {
        injuredNpcs.push(n);
      } else if (n.position === 'GK') {
        gks.push(n);
      } else {
        outfield.push(n);
      }
    }

    // Cầu thủ chấn thương luôn chuyển sang chế độ hồi phục tại Trung tâm Y tế (tuyệt đối không tham gia tập nặng!)
    const actSys = npcSystem?.activitySystem || null;
    for (let ii = 0; ii < injuredNpcs.length; ii++) {
      const inj = injuredNpcs[ii];
      inj.mode = 'medical_rehab';
      inj.state = 'MEDICAL_CHECK';
      inj.activityType = 'medical';
      inj.scrimmageTeam = null;
      if (inj.bibMesh) inj.bibMesh.visible = false;
      inj.task = 'Đang điều trị & phục hồi chấn thương tại Trung tâm Y tế PSG (Miễn tập nặng)';

      let rx = MEDICAL_RECOVERY_SPOT.cx + 4.5 + (ii % 2) * 3.0;
      let rz = MEDICAL_RECOVERY_SPOT.cz - 4.0 + Math.floor(ii / 2) * 3.2;
      let targetAnim = 'idle';
      if (actSys) {
        const pt = actSys.claimAvailablePoint(inj.id, {
          area: 'medical',
          interactionTypes: ['medical_exam', 'physio', 'recovery_bed', 'cryo', 'ice_tub', 'biometrics'],
          preferNearX: MEDICAL_RECOVERY_SPOT.cx,
          preferNearZ: MEDICAL_RECOVERY_SPOT.cz
        });
        if (pt) {
          rx = pt.standPosition.x;
          rz = pt.standPosition.z;
          inj.activePointId = pt.activityPointId;
          targetAnim = pt.animation || 'idle';
        }
      }
      const nearTarget = Math.hypot(inj.mesh.position.x - rx, inj.mesh.position.z - rz) < 0.75;
      if (nearTarget && actSys && inj.activePointId) {
        actSys.occupyPoint(inj.activePointId, inj.id);
        const pt = actSys.getPoint(inj.activePointId);
        if (pt) {
          inj.state = pt.interactionType === 'recovery_bed' || pt.interactionType === 'physio' ? 'RECOVERY' : 'MEDICAL_CHECK';
          inj._slotLocked = true;
          inj.drillAnim = targetAnim;
        }
      } else {
        inj._slotLocked = false;
        inj.drillAnim = 'idle';
        if (drillChanged || zoneJustActivated || !inj.finalDest || Math.hypot(inj.finalDest.x - rx, inj.finalDest.z - rz) > 0.5) {
          if (npcSystem?.setNpcDestination) npcSystem.setNpcDestination(inj, rx, rz);
          else inj.target.set(rx, 0.14, rz);
        }
      }
    }

    if (!drill || drill === 'gather' || drill === 'summary') {
      if (drillChanged || zoneJustActivated) {
        for (let i = 0; i < playerNpcs.length; i++) {
          const n = playerNpcs[i];
          n.drillAnim = null;
          n.scrimmageTeam = null;
          if (n.bibMesh) n.bibMesh.visible = false;
        }
      }
      this.lastDrillKey = drill;
      this._wasZoneActive = zoneActive;
      return;
    }

    this.lastDrillKey = drill;
    this._wasZoneActive = zoneActive;

    // LOD 3 Gate: Khi Chủ tịch ở Trụ sở (xa SVĐ > 95m) & không mở CCTV -> bỏ qua toàn bộ vật lý bóng & dao động mỗi frame!
    // Chỉ đồng bộ trạng thái bài tập một lần duy nhất khi đổi khung bài tập (drillChanged).
    if (!zoneActive && !drillChanged) {
      return;
    }

    const simT = this._simTime;
    const refreshMeta = drillChanged || zoneJustActivated;
    const half = Math.ceil(outfield.length / 2);
    const { cx: pcx, cz: pcz, westGoalX } = TRAINING_PITCH;

    // 1. Thủ môn luôn tập phản xạ / cản phá cùng HLV Thủ môn tại khung thành Tây PSG TRAINING PITCH
    for (let gi = 0; gi < gks.length; gi++) {
      const gk = gks[gi];
      gk.mode = 'drill';
      if (refreshMeta || !gk.task) {
        gk.task = 'Đang tập phản xạ, đổ người cản phá & phát bóng tại PSG TRAINING PITCH';
      }
      const gx = westGoalX + 2.4 + gi * 1.4;
      const gz = zoneActive ? (pcz + Math.sin(simT * 2.0 + gi) * 1.8) : pcz;
      if (!zoneActive) {
        this._assignPitchTarget(gk, gx, gz, npcSystem, false);
        gk._lod3Dirty = true;
      } else if (drillChanged && Math.hypot(gk.mesh.position.x - gx, gk.mesh.position.z - gz) > 3.5) {
        this._assignPitchTarget(gk, gx, gz, npcSystem, true);
      } else if (this._isOnTrainingPitch(gk.mesh.position) || !gk.path || gk.path.length === 0) {
        gk.target.set(gx, 0.14, gz);
      }
      gk.drillAnim = (zoneActive && drill === 'shooting' && this.shootPhase === 1 && this.shootState.t > 0.65) ? 'dive_gk' : 'idle';
    }

    // 2. Cầu thủ trên mặt cỏ PSG TRAINING PITCH thực hiện đúng từng bài tập 3D
    if (drill === 'warmup' || drill === 'recovery') {
      const taskText = drill === 'warmup'
        ? 'Đang khởi động giãn cơ tại PSG TRAINING PITCH'
        : 'Đang tập phục hồi thể lực nhẹ tại Sân tập phụ PSG';
      const baseCx = drill === 'recovery' ? REHAB_PITCH.cx : pcx;
      const baseCz = drill === 'recovery' ? REHAB_PITCH.cz : pcz;
      for (let i = 0; i < outfield.length; i++) {
        const n = outfield[i];
        n.mode = 'drill';
        n.scrimmageTeam = null;
        if (n.bibMesh) n.bibMesh.visible = false;
        if (refreshMeta || !n.task) n.task = taskText;
        const tx = baseCx - 12 + (i % 6) * 4.4;
        const tz = baseCz + 10 - Math.floor(i / 6) * 4.0;
        if (drillChanged || !zoneActive) {
          this._assignPitchTarget(n, tx, tz, npcSystem, zoneActive);
          if (!zoneActive) n._lod3Dirty = true;
        }
        if (zoneActive) {
          const dx = n.mesh.position.x - tx;
          const dz = n.mesh.position.z - tz;
          n.drillAnim = (dx * dx + dz * dz) < 0.64 ? 'stretch' : 'walk';
        }
      }
    } else if (drill === 'fitness') {
      const taskText = 'Đang chạy nước rút & đổi hướng qua cọc tại PSG TRAINING PITCH';
      for (let i = 0; i < outfield.length; i++) {
        const n = outfield[i];
        n.mode = 'drill';
        n.speed = 4.9;
        n.scrimmageTeam = null;
        if (n.bibMesh) n.bibMesh.visible = false;
        if (refreshMeta || !n.task) n.task = taskText;
        const laneZ = pcz + 14.0 - (i % 7) * 4.2;
        const phase = Math.sin(simT * 1.4 + i * 0.8);
        const tx = phase >= 0 ? (pcx + 26.0) : (pcx - 8.0);
        if (!zoneActive) {
          this._assignPitchTarget(n, tx, laneZ, npcSystem, false);
          n._lod3Dirty = true;
        } else {
          const dx = n.mesh.position.x - n.target.x;
          const dz = n.mesh.position.z - n.target.z;
          if ((dx * dx + dz * dz) < 0.64 || drillChanged || zoneJustActivated) {
            this._assignPitchTarget(n, tx, laneZ, npcSystem, drillChanged);
          }
        }
        n.drillAnim = 'run';
      }
    } else if (drill === 'passing') {
      const ringCount = Math.max(3, outfield.length);
      const rad = 9.0;
      const taskText = 'Đang tập chuyền bóng một chạm & Rondo tại vòng tròn trung tâm PSG TRAINING PITCH';
      for (let i = 0; i < outfield.length; i++) {
        const n = outfield[i];
        n.mode = 'drill';
        n.speed = 3.6;
        n.scrimmageTeam = null;
        if (n.bibMesh) n.bibMesh.visible = false;
        if (refreshMeta || !n.task) n.task = taskText;
        const ang = (i / ringCount) * Math.PI * 2;
        const tx = pcx + Math.cos(ang) * rad;
        const tz = pcz + Math.sin(ang) * rad;
        if (!zoneActive) {
          this._assignPitchTarget(n, tx, tz, npcSystem, false);
          n._lod3Dirty = true;
        } else if (drillChanged) {
          this._assignPitchTarget(n, tx, tz, npcSystem, true);
        } else if (this._isOnTrainingPitch(n.mesh.position) || !n.path || n.path.length === 0) {
          n.target.set(tx, 0.14, tz);
        }
        n.drillAnim = (i === this.passState.idx % ringCount && this.passState.t < 0.25) ? 'pass' : 'train';
      }
      if (zoneActive && this.balls.passing && outfield.length >= 2) {
        this.passState.t += dt * 1.4;
        if (this.passState.t >= 1) {
          this.passState.t = 0;
          this.passState.idx = (this.passState.idx + 1 + Math.floor(Math.random() * 2)) % outfield.length;
        }
        const fromN = outfield[this.passState.idx % outfield.length];
        const toN = outfield[(this.passState.idx + 1) % outfield.length];
        if (fromN && toN) {
          const f = this.passState.t;
          this.balls.passing.position.set(
            fromN.mesh.position.x + (toN.mesh.position.x - fromN.mesh.position.x) * f,
            0.22 + Math.sin(f * Math.PI) * 0.25,
            fromN.mesh.position.z + (toN.mesh.position.z - fromN.mesh.position.z) * f
          );
        }
      }
    } else if (drill === 'shooting') {
      const taskText = 'Đang tập dứt điểm cầu môn Tây tại PSG TRAINING PITCH';
      for (let i = 0; i < outfield.length; i++) {
        const n = outfield[i];
        n.mode = 'drill';
        n.speed = 4.0;
        n.scrimmageTeam = null;
        if (n.bibMesh) n.bibMesh.visible = false;
        if (refreshMeta || !n.task) n.task = taskText;
        const tx = i === 0 ? (pcx - 18.0) : i === 1 ? (pcx - 21.5) : (pcx - 10 + (i % 5) * 3.8);
        const tz = i === 0 ? pcz : i === 1 ? (pcz + 8.0) : (pcz + 7 - Math.floor(i / 5) * 4.5);
        if (!zoneActive) {
          this._assignPitchTarget(n, tx, tz, npcSystem, false);
          n._lod3Dirty = true;
        } else if (drillChanged) {
          this._assignPitchTarget(n, tx, tz, npcSystem, true);
        } else if (this._isOnTrainingPitch(n.mesh.position) || !n.path || n.path.length === 0) {
          n.target.set(tx, 0.14, tz);
        }
        n.drillAnim = i === 0 && this.shootPhase === 1 && this.shootState.t < 0.35 ? 'kick' : (i === 1 && this.shootPhase === 0 ? 'pass' : 'idle');
      }
      if (zoneActive && this.balls.shooting) {
        this.shootState.t += dt * (this.shootPhase === 1 ? 1.85 : 1.1);
        if (this.shootState.t >= 1) {
          this.shootState.t = 0;
          this.shootPhase = (this.shootPhase + 1) % 2;
          if (this.shootPhase === 1) {
            this.shootState.targetZ = pcz + (Math.random() - 0.5) * 5.6;
          }
        }
        const f = this.shootState.t;
        if (this.shootPhase === 0) {
          this.balls.shooting.position.set(pcx - 21.5 + 3.5 * f, 0.22, pcz + 8.0 - 8.0 * f);
        } else {
          const sx = pcx - 18.0;
          const gx = westGoalX + 1.0;
          this.balls.shooting.position.set(sx + (gx - sx) * f, 0.22 + Math.sin(f * Math.PI) * 1.55, pcz + (this.shootState.targetZ - pcz) * f);
        }
      }
    } else if (drill === 'tactics' || drill === 'defending' || drill === 'set_pieces') {
      const formName = this.state?.formationSystem?.formation || '4-3-3';
      const slots = FORMATION_PRESETS[formName] || FORMATION_PRESETS['4-3-3'];
      const drift = zoneActive ? Math.sin(simT * 0.9) * 5.2 : 0;
      const taskText = drill === 'tactics'
        ? `Đang tập di chuyển chiến thuật sơ đồ ${formName} tại PSG TRAINING PITCH`
        : drill === 'defending'
          ? 'Đang tập kèm người, bọc lót & giữ cự ly hàng phòng ngự tại PSG TRAINING PITCH'
          : 'Đang tập phối hợp đá phạt & phạt góc tại PSG TRAINING PITCH';
      for (let i = 0; i < outfield.length; i++) {
        const n = outfield[i];
        n.mode = 'drill';
        n.speed = 3.8;
        n.scrimmageTeam = null;
        if (n.bibMesh) n.bibMesh.visible = false;
        if (refreshMeta || !n.task) n.task = taskText;
        const sl = slots[(i + 1) % slots.length];
        const pitchX = pcx + ((100 - sl.y) / 100) * 52 - 26 + drift;
        const pitchZ = (pcz - 18) + (sl.x / 100) * 36;
        if (!zoneActive) {
          this._assignPitchTarget(n, pitchX, pitchZ, npcSystem, false);
          n._lod3Dirty = true;
        } else if (drillChanged) {
          this._assignPitchTarget(n, pitchX, pitchZ, npcSystem, true);
        } else if (this._isOnTrainingPitch(n.mesh.position) || !n.path || n.path.length === 0) {
          n.target.set(pitchX, 0.14, pitchZ);
        }
        n.drillAnim = 'train';
      }
    } else if (drill === 'scrimmage') {
      const bx = this.balls.scrimmage ? this.balls.scrimmage.position.x : pcx;
      const bz = this.balls.scrimmage ? this.balls.scrimmage.position.z : pcz;
      const carrierSlot = this.scrimmageState.carrierIdx % Math.max(1, outfield.length);
      for (let i = 0; i < outfield.length; i++) {
        const n = outfield[i];
        const isTeamB = i >= half;
        n.mode = 'drill';
        n.speed = 4.4;
        n.scrimmageTeam = isTeamB ? 'B' : 'A';
        if (n.bibMesh) n.bibMesh.visible = isTeamB;
        if (refreshMeta || !n.task) {
          n.task = isTeamB
            ? 'Đang đấu tập đối kháng (Đội Áo Vàng) tại PSG TRAINING PITCH'
            : 'Đang đấu tập đối kháng (Đội Hình Chính PSG) tại PSG TRAINING PITCH';
        }

        if (!zoneActive) {
          const baseX = pcx + (isTeamB ? 10 : -10);
          const tx = Math.max(pcx - 28, Math.min(pcx + 28, baseX + ((i % 4) - 1.5) * 4.5));
          const tz = Math.max(pcz - 18, Math.min(pcz + 18, pcz + (Math.floor(i / 4) - 1.5) * 6.0));
          this._assignPitchTarget(n, tx, tz, npcSystem, false);
          n._lod3Dirty = true;
          n.drillAnim = 'run';
          continue;
        }

        n.timer -= dt;
        if (n.timer <= 0 || drillChanged || zoneJustActivated) {
          n.timer = 2.0 + Math.random() * 2.5;
          const baseX = pcx + (isTeamB ? 10 : -10);
          const tx = Math.max(pcx - 28, Math.min(pcx + 28, baseX * 0.4 + bx * 0.6 + (Math.random() - 0.5) * 16));
          const tz = Math.max(pcz - 18, Math.min(pcz + 18, bz * 0.5 + pcz * 0.5 + (Math.random() - 0.5) * 16));
          this._assignPitchTarget(n, tx, tz, npcSystem, false);
        }
        n.drillAnim = (i === carrierSlot) ? 'pass' : 'run';
      }

      if (zoneActive && this.balls.scrimmage && outfield.length >= 2) {
        this.scrimmageState.t += dt * 1.25;
        if (this.scrimmageState.t >= 1) {
          this.scrimmageState.t = 0;
          this.scrimmageState.carrierIdx = this.scrimmageState.targetIdx;
          this.scrimmageState.targetIdx = Math.floor(Math.random() * outfield.length);
          if (this.scrimmageState.targetIdx === this.scrimmageState.carrierIdx) {
            this.scrimmageState.targetIdx = (this.scrimmageState.carrierIdx + 1) % outfield.length;
          }
        }
        const a = outfield[this.scrimmageState.carrierIdx % outfield.length];
        const b = outfield[this.scrimmageState.targetIdx % outfield.length];
        if (a && b) {
          const f = this.scrimmageState.t;
          this.balls.scrimmage.position.set(
            a.mesh.position.x + (b.mesh.position.x - a.mesh.position.x) * f,
            0.22 + Math.sin(f * Math.PI) * 0.48,
            a.mesh.position.z + (b.mesh.position.z - a.mesh.position.z) * f
          );
        }
      }
    }
  }

  // Tổng kết buổi tập: chạy PlayerDevelopmentSystem, tạo Báo cáo chi tiết & sinh đề xuất báo cáo trực tiếp cho Chủ tịch!
  concludeTrainingSession(dayKey = null) {
    const key = dayKey || (this.state.timeSystem ? this.state.timeSystem.getDayKey() : `d_${this.state.dayNum}_${Date.now()}`);
    this.lastReportedDayKey = key;
    const dateLabel = this.state.timeSystem ? this.state.timeSystem.getDateString() : `Ngày ${this.state.dayNum} · Tuần ${this.state.week}`;

    const drillsExecuted = this.schedule
      .filter((s) => !['gather', 'summary', 'warmup'].includes(s.drill))
      .map((s) => s.drill);
    const uniqueDrills = [...new Set(drillsExecuted)];

    const dev = this.state.developmentSystem.evaluateTrainingSession(uniqueDrills, this.intensity, dateLabel);
    const activeResults = dev.results.filter((r) => r.participated);
    const sorted = [...activeResults].sort((a, b) => b.rating - a.rating);
    const standouts = sorted.slice(0, 3);
    const underperformers = sorted.slice(-2);
    const needRecovery = activeResults.filter((r) => r.recoveryNeeded);
    const attendancePct = Math.round((activeResults.length / Math.max(1, dev.results.length)) * 100);
    const completionPct = Math.min(100, Math.round(82 + (this.state.coachingSystem?.getTrainingQualityMultipliers()?.overall || 1) * 14));

    const headName = this.state.coach?.name || 'Ban huấn luyện PSG';
    const fitName = this.state.staffDb?.active?.find((s) => s.roleKey === 'fitness_coach')?.name || 'Trợ lý thể lực';
    const tactName = this.state.staffDb?.active?.find((s) => s.roleKey === 'tactical_coach')?.name || 'Trợ lý chiến thuật';

    const proposalText = needRecovery.length >= 3
      ? `${fitName}: Đề xuất giảm cường độ buổi tới xuống "Nhẹ" hoặc "Hồi phục" vì có ${needRecovery.length} cầu thủ dấu hiệu quá tải.`
      : `${tactName}: Đội hình đáp ứng tốt sơ đồ ${this.state.formationSystem?.formation || '4-3-3'}, đề xuất giữ nhịp độ và tăng bài chuyển trạng thái.`;

    const report = {
      id: `tr_rep_${Date.now()}`,
      date: dateLabel,
      focus: this.focus,
      drills: uniqueDrills.map((d) => DRILL_CATALOG[d]?.label || d),
      duration: '180 phút (09:00–12:00)',
      intensity: this.intensity,
      attendancePct,
      completionPct,
      headCoach: headName,
      standouts,
      underperformers,
      needRecovery,
      injuries: dev.injuriesTriggered,
      proposal: proposalText,
      playerResults: dev.results
    };

    this.trainingReports.unshift(report);
    if (this.trainingReports.length > 25) this.trainingReports.pop();
    this.state.relationshipSystem?.onTrainingEvaluated?.(report);

    // Tạo tương tác trực tiếp từ Trợ lý / HLV gửi Chủ tịch sau buổi tập (Phần IX)
    const interactive = needRecovery.length >= 2
      ? {
          id: `ci_${Date.now()}`,
          date: dateLabel,
          staffName: fitName,
          role: 'Trợ Lý Thể Lực',
          roleKey: 'fitness_coach',
          message: `Thưa Chủ tịch, buổi tập hôm nay đã hoàn thành (${completionPct}%). Phần lớn cầu thủ đáp ứng tốt yêu cầu thể lực. Tuy nhiên, ${needRecovery.slice(0, 3).map((x) => x.name).join(', ')} cần giảm cường độ để tránh quá tải.`,
          proposedAction: { intensity: 'Nhẹ', focus: 'Phục hồi' },
          targetPlayerId: needRecovery[0]?.playerId || null,
          status: 'pending'
        }
      : {
          id: `ci_${Date.now()}`,
          date: dateLabel,
          staffName: tactName,
          role: 'Trợ Lý Chiến Thuật',
          roleKey: 'tactical_coach',
          message: `Thưa Chủ tịch, buổi tập hôm nay nổi bật nhất là ${standouts[0]?.name || 'đội một'} (${standouts[0]?.rating || 8.2} điểm). Đội bóng vẫn cần sắc bén hơn khi chuyển trạng thái từ phòng ngự sang tấn công. Tôi đề xuất tăng thêm bài tập phối hợp tuyến giữa và hàng công.`,
          proposedAction: { focus: 'Chiến thuật' },
          targetPlayerId: underperformers[0]?.playerId || null,
          status: 'pending'
        };

    this.pendingCoachInteractions.unshift(interactive);
    if (this.pendingCoachInteractions.length > 8) this.pendingCoachInteractions.pop();

    if (dev.injuriesTriggered.length > 0) {
      const inj = dev.injuriesTriggered[0];
      this.state.pushPhoneMsg(
        'Trung Tâm Y Tế & BHL',
        `🏥 Chấn thương tập luyện: ${inj.name} (${inj.days} ngày)`,
        `${inj.name} bị ${inj.type}. Phòng Y tế và HLV phục hồi đã tiếp nhận điều trị.`,
        true
      );
    }

    return report;
  }

  // Chủ tịch phản hồi đề xuất của Ban huấn luyện sau tập -> tác động thực tế đến giáo án!
  respondToCoachInteraction(interactionId, decision) {
    const item = this.pendingCoachInteractions.find((x) => x.id === interactionId);
    if (!item) return { ok: false, message: 'Không tìm thấy đề xuất.' };

    if (decision === 'approve') {
      item.status = 'Đã đồng ý';
      if (item.proposedAction?.intensity) this.setIntensity(item.proposedAction.intensity);
      if (item.proposedAction?.focus) this.applyTrainingFocus(item.proposedAction.focus);
      return { ok: true, message: `Chủ tịch đã phê duyệt đề xuất của ${item.staffName}! Giáo án huấn luyện đã cập nhật ngay lập tức.` };
    }
    if (decision === 'explain') {
      item.explanation = `${item.staffName}: "Dựa trên dữ liệu GPS và báo cáo hiệu suất 3 buổi gần nhất, mức tải cơ của nhóm trụ cột đã tăng 18%, điều chỉnh ngay sẽ giúp giữ đỉnh phong độ cho trận đấu cuối tuần."`;
      return { ok: true, message: item.explanation, keepOpen: true };
    }
    if (decision === 'change_plan') {
      item.status = 'Đã điều chỉnh giáo án';
      this.applyTrainingFocus('Kỹ thuật');
      this.setIntensity('Trung bình');
      return { ok: true, message: `Chủ tịch yêu cầu chuyển trọng tâm giáo án sang Kỹ thuật (Cường độ Trung bình). Ban huấn luyện đã cập nhật lịch tập.` };
    }
    if (decision === 'ask_head_coach') {
      item.status = 'Chuyển HLV trưởng xem xét';
      return { ok: true, message: `Đã chuyển đề xuất của ${item.staffName} cho HLV trưởng ${this.state.coach?.name || 'PSG'} thẩm định chuyên môn.` };
    }
    if (decision === 'reject') {
      item.status = 'Đã từ chối';
      return { ok: true, message: `Chủ tịch đã từ chối đề xuất của ${item.staffName}. Giữ nguyên kế hoạch huấn luyện hiện tại.` };
    }
    return { ok: true, message: 'Đã ghi nhận ý kiến Chủ tịch.' };
  }

  exportState() {
    return {
      schedule: this.schedule,
      intensity: this.intensity,
      focus: this.focus,
      trainingReports: this.trainingReports,
      pendingCoachInteractions: this.pendingCoachInteractions,
      lastReportedDayKey: this.lastReportedDayKey
    };
  }

  importState(snap) {
    if (!snap) return;
    if (Array.isArray(snap.schedule) && snap.schedule.length > 0) this.schedule = snap.schedule;
    if (snap.intensity) this.intensity = snap.intensity;
    if (snap.focus) this.focus = snap.focus;
    if (Array.isArray(snap.trainingReports)) this.trainingReports = snap.trainingReports;
    if (Array.isArray(snap.pendingCoachInteractions)) this.pendingCoachInteractions = snap.pendingCoachInteractions;
    this.lastReportedDayKey = snap.lastReportedDayKey || null;
  }
}
