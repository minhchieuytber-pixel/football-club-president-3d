// src/media/SigningEventSystem.js
// Trung tâm điều phối toàn bộ Official Signing & Media Event System:
// - SigningEventSystem & ContractCeremonySystem & MediaEventManager
// - JournalistNPCSystem & PhotographerNPCSystem (10 NPC truyền thông thực tế có ID, trang phục, lịch, animation & Pathfinding)
// - EventScheduleSystem & EventArchiveSystem (Lưu trữ đầy đủ lịch sử sự kiện + chống tạo trùng 2 sự kiện cho 1 thương vụ!)

import { PressQuestionSystem, PSGTVBroadcastSystem } from './PressConferenceSystem.js';
import { MediaNewsGenerator, FanReactionSystem, MediaReputationSystem } from './MediaNewsGenerator.js';

export const EVENT_TYPE_LABELS = {
  player_signing:                'Lễ Ký Hợp Đồng & Ra Mắt Tân Binh',
  record_signing:                'Sự Kiện Công Bố Bản Hợp Đồng Kỷ Lục',
  contract_renewal:              'Lễ Gia Hạn Hợp Đồng Chính Thức',
  head_coach_appointment:        'Lễ Công Bố HLV Trưởng Mới PSG',
  sporting_director_appointment: 'Lễ Công Bố Giám Đốc Thể Thao PSG',
  youth_promotion:               'Lễ Đôn Cầu Thủ Trẻ Lên Đội Một',
  major_sponsor:                 'Lễ Ký Kết Nhà Tài Trợ Chiến Lược',
  commercial_partner:            'Lễ Công Bố Đối Tác Thương Mại'
};

export const SIGNING_CEREMONY_STEPS = [
  { id: 'place_docs',   label: '1. Nhân viên đặt hồ sơ hợp đồng & bút ký lên bàn', presAnim: 'sit',           subjAnim: 'sit',           mediaAnim: 'clipboard', photoFlash: false },
  { id: 'pres_sign',    label: '2. Chủ tịch Phạm Minh Chiêu kiểm tra & đặt bút ký',  presAnim: 'sign_contract', subjAnim: 'sit',           mediaAnim: 'observe',   photoFlash: true },
  { id: 'player_sign',  label: '3. Tân binh / Nhân sự đặt bút ký hợp đồng chính thức', presAnim: 'observe',     subjAnim: 'sign_contract', mediaAnim: 'observe',   photoFlash: true },
  { id: 'handshake',    label: '4. Trao đổi tài liệu & Bắt tay chính thức',           presAnim: 'handshake',     subjAnim: 'handshake',     mediaAnim: 'talk',      photoFlash: true },
  { id: 'hold_jersey',  label: '5. Đứng dậy cầm áo đấu PSG chụp ảnh cùng phóng viên', presAnim: 'hold_jersey',   subjAnim: 'hold_jersey',   mediaAnim: 'gesture',   photoFlash: true }
];

// Danh sách 9 NPC chuyên trách truyền thông bổ sung (kết hợp cùng Giám đốc Truyền thông npc_media Sophie Chevalier thành đủ 10 vị trí!)
export function createMediaNpcProfiles() {
  return [
    { id: 'npc_media_host',  name: 'Élodie Laurent',    role: 'Người Dẫn Chương Trình PSG TV', dept: 'Truyền Thông', age: 31, gender: 'Nữ',  personality: 'Hòa đồng', skill: 88, morale: 90, relation: 85, outfit: 'media',         skin: 0xf6d5b8, hair: 0xb88a44, hairStyle: 1, home: { x: 25.0, z: 8.6 }, isMediaCrew: true, mediaRole: 'host',       task: 'Dẫn chương trình trực tiếp PSG TV & điều phối họp báo' },
    { id: 'npc_rep_psgtv',   name: 'Julien Bernard',    role: 'Phóng Viên PSG TV',             dept: 'Truyền Thông', age: 29, gender: 'Nam', personality: 'Nhiệt tình', skill: 85, morale: 88, relation: 84, outfit: 'media',       skin: 0xf2c6a0, hair: 0x2c1d11, hairStyle: 2, home: { x: 29.0, z: 8.6 }, isMediaCrew: true, mediaRole: 'journalist', outlet: 'PSG TV', task: 'Đưa tin trực tiếp & phỏng vấn độc quyền cho PSG TV' },
    { id: 'npc_rep_lequipe', name: 'Matthieu Delacroix', role: 'Phóng Viên Sports Daily',      dept: 'Báo Chí',      age: 38, gender: 'Nam', personality: 'Thẳng thắn', skill: 87, morale: 84, relation: 78, outfit: 'suit_charcoal', skin: 0xf2c6a0, hair: 0x4a321f, hairStyle: 0, home: { x: 4.5,  z: 19.2 }, isMediaCrew: true, mediaRole: 'journalist', outlet: 'Sports Daily', task: 'Phân tích chuyên môn & đặt câu hỏi tại họp báo PSG' },
    { id: 'npc_rep_intl',    name: 'Clara Rossi',       role: 'Phóng Viên Truyền Hình Quốc Tế', dept: 'Báo Chí',     age: 33, gender: 'Nữ',  personality: 'Tham vọng',  skill: 86, morale: 85, relation: 80, outfit: 'media',       skin: 0xf6d5b8, hair: 0x141414, hairStyle: 1, home: { x: -4.5, z: 19.2 }, isMediaCrew: true, mediaRole: 'journalist', outlet: 'International Sports Network', task: 'Tác nghiệp truyền hình quốc tế tại Paris' },
    { id: 'npc_rep_insider', name: 'Matteo Romano',     role: 'Phóng Viên Transfer Insider',   dept: 'Báo Chí',      age: 34, gender: 'Nam', personality: 'Nhiệt tình', skill: 90, morale: 87, relation: 82, outfit: 'suit_navy',   skin: 0xe0ac82, hair: 0x141414, hairStyle: 2, home: { x: 2.5,  z: 21.0 }, isMediaCrew: true, mediaRole: 'journalist', outlet: 'Transfer Insider', task: 'Săn tin độc quyền & chất vấn tài chính chuyển nhượng' },
    { id: 'npc_photo_1',     name: 'Lucas Vasseur',     role: 'Nhiếp Ảnh Gia Chính Thức',      dept: 'Truyền Thông', age: 32, gender: 'Nam', personality: 'Cẩn thận',  skill: 88, morale: 87, relation: 83, outfit: 'security',    skin: 0xf2c6a0, hair: 0x2c1d11, hairStyle: 0, home: { x: 38.0, z: -4.0 }, isMediaCrew: true, mediaRole: 'photographer', task: 'Ghi lại khoảnh khắc ký hợp đồng, bắt tay & cầm áo đấu' },
    { id: 'npc_cam_1',       name: 'Romain Petit',      role: 'Quay Phim PSG TV',              dept: 'Truyền Thông', age: 35, gender: 'Nam', personality: 'Cẩn thận',  skill: 87, morale: 86, relation: 82, outfit: 'security',    skin: 0xe0ac82, hair: 0x4a321f, hairStyle: 2, home: { x: 38.0, z: 4.0 },  isMediaCrew: true, mediaRole: 'cameraman',    task: 'Vận hành máy quay truyền hình phát sóng trực tiếp PSG TV' },
    { id: 'npc_tech_audio',  name: 'Thomas Mercier',    role: 'Kỹ Thuật Viên Âm Thanh',        dept: 'Truyền Thông', age: 30, gender: 'Nam', personality: 'Ít nói',    skill: 85, morale: 85, relation: 80, outfit: 'security',    skin: 0xf6d5b8, hair: 0x6b4c2e, hairStyle: 0, home: { x: 37.8, z: 15.0 }, isMediaCrew: true, mediaRole: 'audio_tech',   task: 'Kiểm soát micro sân khấu & âm thanh hội trường' },
    { id: 'npc_tech_light',  name: 'Nicolas Fabre',     role: 'Kỹ Thuật Viên Ánh Sáng & Sự Kiện', dept: 'Truyền Thông', age: 31, gender: 'Nam', personality: 'Cẩn thận', skill: 85, morale: 86, relation: 81, outfit: 'security',   skin: 0xf2c6a0, hair: 0x141414, hairStyle: 0, home: { x: 37.8, z: 16.2 }, isMediaCrew: true, mediaRole: 'light_tech',   task: 'Điều chỉnh ánh sáng sân khấu, backdrop LED & thẻ tác nghiệp' }
  ];
}

export class SigningEventSystem {
  constructor(state) {
    this.state = state;
    this.broadcast = new PSGTVBroadcastSystem();
    this.mediaRooms = null;
    this.npcSystem = null;
    this._flashTimer = 0;
    this.reset();
  }

  reset() {
    this.pendingEvents = [];     // Các sự kiện đang chờ tổ chức (Awaiting Official Signing Event)
    this.activeEvent = null;     // Sự kiện đang diễn ra trong thế giới 3D
    this.eventArchive = [];      // Kho lưu trữ toàn bộ lịch sử lễ ký kết & họp báo (EventArchiveSystem)
    this.createdDealKeys = [];   // Chống tạo 2 sự kiện cho cùng 1 thương vụ!
    this.broadcast.reset();
    MediaReputationSystem.ensureBrandMetrics(this.state);
  }

  attach3D(mediaRooms, npcSystem) {
    this.mediaRooms = mediaRooms;
    this.npcSystem = npcSystem;
    if (this.activeEvent && this.mediaRooms) {
      this.mediaRooms.updateEventVisuals(this.activeEvent);
    }
  }

  // ==================== BƯỚC 1: KHỞI TẠO SỰ KIỆN KHI THƯƠNG VỤ ĐÃ XÁC NHẬN HOÀN TẤT ====================
  scheduleOfficialEvent(payload) {
    // QUY TẮC BẮT BUỘC: Không tự động tổ chức sự kiện nếu thương vụ chưa được xác nhận hoàn tất!
    if (!payload || !payload.dealVerified) {
      return { ok: false, error: 'Thương vụ chưa được xác nhận hoàn tất — không thể mở lễ ký hợp đồng chính thức!' };
    }
    const dealKey = payload.dealKey || `${payload.eventType}_${payload.playerId || payload.staffId || payload.subjectName}_${this.state.season}`;
    if (this.createdDealKeys.includes(dealKey)) {
      return { ok: false, error: 'Sự kiện cho thương vụ này đã được tạo trước đó (không tạo trùng).' };
    }

    // Tự động nâng hạng thành Bản hợp đồng kỷ lục nếu phí >= €80M hoặc OVR >= 88
    let eventType = payload.eventType || 'player_signing';
    if (eventType === 'player_signing' && ((payload.fee || 0) >= 80 || (payload.ovr || 0) >= 88)) {
      eventType = 'record_signing';
    }

    const isCompactRenewal = eventType === 'contract_renewal' && !payload.forceFullPress;
    const dateStr = this.state.timeSystem ? `${this.state.timeSystem.getDateString()} · ${this.state.timeSystem.getTimeString()}` : `Tuần ${this.state.week}`;
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const evt = {
      eventId,
      dealKey,
      dealVerified: true,
      eventType,
      eventTypeLabel: EVENT_TYPE_LABELS[eventType] || 'Sự Kiện Chính Thức PSG',
      status: 'Awaiting Official Signing Event',
      phase: 'awaiting', // 'awaiting' | 'preparing' | 'arrival' | 'signing' | 'press_conference' | 'completed'
      signingStepIdx: 0,
      hasFullPressConference: !isCompactRenewal,
      hadPressConference: false,
      createdAt: dateStr,
      completedAt: null,

      // Dữ liệu thực lấy từ Single Source of Truth (PlayerDatabase / ContractSystem / StaffDatabase)
      playerId: payload.playerId || null,
      staffId: payload.staffId || null,
      subjectName: payload.subjectName,
      position: payload.position || '',
      shirtNumber: payload.shirtNumber || null,
      kitType: payload.kitType || (payload.position === 'GK' ? 'gk' : (this.state.activeKit || 'home')),
      ovr: payload.ovr || null,
      fromClub: payload.fromClub || '',
      fee: Number(payload.fee || 0),
      wage: Number(payload.wage || 0),
      contractYears: Number(payload.contractYears || 4),
      contractSnapshot: payload.contractSnapshot || null,
      headline: `${EVENT_TYPE_LABELS[eventType] || 'Lễ Ký Hợp Đồng'} · ${payload.subjectName}`,

      // Dữ liệu chuẩn bị & họp báo
      prepChecklist: [
        { key: 'schedule', label: 'Đặt lịch sự kiện & thông báo Chủ tịch', done: false },
        { key: 'rooms',    label: 'Chuẩn bị Phòng Ký Hợp Đồng & Phòng Họp Báo 3D', done: false },
        { key: 'visuals',  label: 'Cập nhật Backdrop tài trợ, Màn hình LED & Áo đấu PSG', done: false },
        { key: 'av',       label: 'Lắp đặt micro, loa, máy ảnh & camera PSG TV', done: false },
        { key: 'invite',   label: 'Gửi lời mời phóng viên & kích hoạt kíp quay PSG TV', done: false }
      ],
      attendees: ['Chủ tịch Phạm Minh Chiêu', payload.subjectName, 'Sophie Chevalier (GĐ Truyền Thông)', 'Luís Campos (GĐ Thể Thao)'],
      questions: [],
      currentQuestionIdx: 0,
      presidentAnswers: [],
      playerAnswers: [],
      generatedArticles: [],
      fanReactions: [],
      reputationDelta: null,
      broadcastStatus: 'Chờ phát sóng',
      broadcastPeakViewers: 0
    };

    this.createdDealKeys.push(dealKey);
    this.pendingEvents.unshift(evt);

    // Gửi thông báo đến Chủ tịch trên Điện thoại & Giao nhiệm vụ chuẩn bị cho Giám đốc Truyền thông
    const mediaDir = this.state.departments?.find((d) => d.id === 'media')?.head || 'Sophie Chevalier';
    this.state.pushPhoneMsg(
      `${mediaDir} (GĐ Truyền Thông)`,
      `🎬 SỰ KIỆN CHÍNH THỨC: ${evt.eventTypeLabel} — ${evt.subjectName}`,
      `Thương vụ ${evt.subjectName} đã hoàn tất hợp lệ (${evt.status}). Phòng Ký Hợp Đồng & Phòng Họp Báo PSG đã sẵn sàng! Mời Chủ tịch mở mục Sự Kiện / PSG TV để chủ trì buổi lễ.`,
      true
    );

    return { ok: true, event: evt };
  }

  // ==================== BƯỚC 2 & 3: BẮT ĐẦU SỰ KIỆN -> CHUẨN BỊ & ĐIỀU PHỐI NPC DI CHUYỂN BẰNG PATHFINDING ====================
  startEvent(eventId) {
    const idx = this.pendingEvents.findIndex((e) => e.eventId === eventId);
    let evt = idx !== -1 ? this.pendingEvents[idx] : (this.activeEvent?.eventId === eventId ? this.activeEvent : null);
    if (!evt) return { ok: false, error: 'Không tìm thấy sự kiện.' };

    if (idx !== -1) this.pendingEvents.splice(idx, 1);
    this.activeEvent = evt;
    evt.status = 'Preparing & Arrival';
    evt.phase = 'arrival';
    evt.signingStepIdx = 0;

    // Cập nhật toàn bộ hạng mục chuẩn bị của Phòng Truyền Thông
    evt.prepChecklist.forEach((c) => { c.done = true; });
    evt.questions = PressQuestionSystem.buildQuestionsForEvent(evt, this.state);
    evt.currentQuestionIdx = 0;

    // Cập nhật động Màn hình LED 3D, Backdrop & Áo đấu 3D trong thế giới game!
    evt.kitType = evt.position === 'GK' ? 'gk' : (this.state.activeKit || evt.kitType || 'home');
    if (this.mediaRooms) {
      this.mediaRooms.updateEventVisuals(evt);
    }
    this.state.notifySquadChanged?.();

    // Điều phối toàn bộ NPC đi bộ bằng Pathfinding (KHÔNG dịch chuyển tức thời!) đến Phòng Ký Hợp Đồng & Phòng Họp Báo
    this.dispatchNpcsForSigningRoom(evt);

    return { ok: true, event: evt };
  }

  // Điều phối NPC bằng Pathfinding tới Phòng Ký Hợp Đồng (Bảo vệ đón cổng -> Lễ tân tiếp -> GĐ Thể thao dẫn cầu thủ -> Nhiếp ảnh/Quay phim vào vị trí!)
  dispatchNpcsForSigningRoom(evt) {
    if (!this.npcSystem || !this.mediaRooms) return;
    const spots = this.mediaRooms.seatPositions?.signing;
    if (!spots) return;

    const sendNpc = (npc, target, mode, anim = null) => {
      if (!npc || !target) return;
      npc.eventMode = mode;
      npc.eventTargetRotY = target.rotY ?? 0;
      npc.eventAnim = anim;
      npc.mode = 'event_travel';
      this.npcSystem.setNpcDestination(npc, target.x, target.z);
    };

    // Tìm NPC cầu thủ mới / HLV mới / nhân vật chính
    const subjNpc = evt.playerId
      ? this.npcSystem.npcs.find((n) => n.playerId === evt.playerId)
      : evt.staffId
        ? this.npcSystem.npcs.find((n) => n.staffId === evt.staffId)
        : null;

    if (subjNpc) {
      // Nếu cầu thủ đang ở sân tập/phòng thay đồ, cho di chuyển từ cổng trụ sở/hành lang vào Phòng Ký bằng A* Pathfinding!
      sendNpc(subjNpc, spots.player, 'signing_seat', 'sit');
    }

    const sdNpc = this.npcSystem.getById('npc_sporting');
    if (sdNpc) sendNpc(sdNpc, spots.sporting, 'signing_seat', 'sit');

    const mediaDirNpc = this.npcSystem.getById('npc_media');
    if (mediaDirNpc) sendNpc(mediaDirNpc, spots.mediaDir, 'signing_staff', 'clipboard');

    const photoNpc = this.npcSystem.getById('npc_photo_1');
    if (photoNpc) sendNpc(photoNpc, spots.photographer, 'signing_photo', 'take_photo');

    const camNpc = this.npcSystem.getById('npc_cam_1');
    if (camNpc) sendNpc(camNpc, spots.cameraman, 'signing_cam', 'film_camera');

    // Phóng viên & Kỹ thuật viên đi thẳng tới Phòng Họp Báo kiểm tra thẻ, ngồi vào chỗ và chuẩn bị thiết bị!
    const pSpots = this.mediaRooms.seatPositions?.press;
    if (pSpots) {
      const journalists = this.npcSystem.npcs.filter((n) => n.mediaRole === 'journalist');
      journalists.forEach((j, i) => {
        const seat = pSpots.journalists[i % pSpots.journalists.length];
        sendNpc(j, seat, 'press_seat', 'work_pc');
        j.task = 'Đang kiểm tra thẻ tác nghiệp & ngồi vào vị trí tại Phòng Họp Báo PSG';
      });
      const hostNpc = this.npcSystem.getById('npc_media_host');
      if (hostNpc) sendNpc(hostNpc, pSpots.host, 'press_host', 'talk');
      const aTech = this.npcSystem.getById('npc_tech_audio');
      if (aTech) sendNpc(aTech, pSpots.audioTech, 'press_tech', 'work_pc');
      const lTech = this.npcSystem.getById('npc_tech_light');
      if (lTech) sendNpc(lTech, pSpots.lightTech, 'press_tech', 'work_pc');
    }
  }

  // ==================== BƯỚC 4: LỄ KÝ KẾT HỢP ĐỒNG 3D ====================
  enterSigningCeremony() {
    const evt = this.activeEvent;
    if (!evt) return { ok: false, error: 'Chưa có sự kiện đang diễn ra.' };
    evt.phase = 'signing';
    evt.status = 'Signing Ceremony In Progress';
    evt.signingStepIdx = 0;
    this.broadcast.setCameraAngle('signing_desk');
    this.applySigningStepAnimations();
    return { ok: true, step: SIGNING_CEREMONY_STEPS[0], event: evt };
  }

  advanceSigningStep() {
    const evt = this.activeEvent;
    if (!evt || evt.phase !== 'signing') return { ok: false, error: 'Không ở bước lễ ký kết.' };

    if (evt.signingStepIdx < SIGNING_CEREMONY_STEPS.length - 1) {
      evt.signingStepIdx++;
      this.applySigningStepAnimations();
      const curStep = SIGNING_CEREMONY_STEPS[evt.signingStepIdx];
      if (curStep.photoFlash && this.mediaRooms) {
        this.mediaRooms.triggerCameraFlash();
      }
      return { ok: true, doneSigning: false, step: curStep, stepIdx: evt.signingStepIdx };
    }

    // Hoàn tất bước 5 (cầm áo đấu chụp ảnh) -> nếu là gia hạn nhỏ không cần họp báo đầy đủ thì hoàn tất luôn, ngược lại chuyển sang Họp báo!
    if (!evt.hasFullPressConference) {
      return { ok: true, doneSigning: true, nextPhase: 'completed', finalResult: this.completeActiveEvent() };
    }
    return this.enterPressConference();
  }

  applySigningStepAnimations() {
    const evt = this.activeEvent;
    if (!evt || !this.npcSystem) return;
    const step = SIGNING_CEREMONY_STEPS[evt.signingStepIdx] || SIGNING_CEREMONY_STEPS[0];
    const subjNpc = evt.playerId
      ? this.npcSystem.npcs.find((n) => n.playerId === evt.playerId)
      : evt.staffId
        ? this.npcSystem.npcs.find((n) => n.staffId === evt.staffId)
        : null;
    if (subjNpc) {
      subjNpc.eventAnim = step.subjAnim;
      subjNpc.task = step.label;
    }
    const mediaDirNpc = this.npcSystem.getById('npc_media');
    if (mediaDirNpc) mediaDirNpc.eventAnim = step.mediaAnim;
  }

  // ==================== BƯỚC 5: CHUYỂN SANG PHÒNG HỌP BÁO & KÍCH HOẠT PSG TV LIVE ====================
  enterPressConference() {
    const evt = this.activeEvent;
    if (!evt) return { ok: false, error: 'Không có sự kiện đang diễn ra.' };

    evt.phase = 'press_conference';
    evt.status = 'Press Conference · PSG TV LIVE';
    evt.hadPressConference = true;
    evt.broadcastStatus = 'LIVE';
    evt.currentQuestionIdx = 0;

    // Kích hoạt phát sóng trực tiếp PSG TV!
    this.broadcast.startLive(evt);

    // Cập nhật màn hình LED Phòng Họp Báo sang trạng thái ● LIVE · PSG TV!
    if (this.mediaRooms) {
      this.mediaRooms.updateEventVisuals(evt);
    }

    // Điều phối Chủ thể sự kiện, GĐ Thể thao, GĐ Truyền thông, Nhiếp ảnh & Quay phim đi bộ sang Phòng Họp Báo bằng Pathfinding!
    if (this.npcSystem && this.mediaRooms?.seatPositions?.press) {
      const pSpots = this.mediaRooms.seatPositions.press;
      const sendTo = (npc, sp, anim) => {
        if (!npc || !sp) return;
        npc.mode = 'event_travel';
        npc.eventTargetRotY = sp.rotY;
        npc.eventAnim = anim;
        this.npcSystem.setNpcDestination(npc, sp.x, sp.z);
      };
      const subjNpc = evt.playerId
        ? this.npcSystem.npcs.find((n) => n.playerId === evt.playerId)
        : evt.staffId
          ? this.npcSystem.npcs.find((n) => n.staffId === evt.staffId)
          : null;
      if (subjNpc) sendTo(subjNpc, pSpots.player, 'sit');
      sendTo(this.npcSystem.getById('npc_sporting'), pSpots.sporting, 'sit');
      sendTo(this.npcSystem.getById('npc_media'), pSpots.mediaDir, 'clipboard');
      sendTo(this.npcSystem.getById('npc_photo_1'), pSpots.photographer, 'take_photo');
      sendTo(this.npcSystem.getById('npc_cam_1'), pSpots.cameraman, 'film_camera');

      // Cho phóng viên đầu tiên giơ tay đặt câu hỏi!
      this.highlightAskingJournalist();
    }

    return { ok: true, doneSigning: true, nextPhase: 'press_conference', event: evt };
  }

  highlightAskingJournalist() {
    const evt = this.activeEvent;
    if (!evt || !this.npcSystem) return;
    const q = evt.questions[evt.currentQuestionIdx];
    const journalists = this.npcSystem.npcs.filter((n) => n.mediaRole === 'journalist');
    journalists.forEach((j, idx) => {
      const isAsking = q && (j.name === q.reporter || idx === evt.currentQuestionIdx % Math.max(1, journalists.length));
      j.eventAnim = isAsking ? 'raise_hand' : 'work_pc';
      j.task = isAsking ? `Đang giơ tay đặt câu hỏi tại Họp báo PSG (${j.outlet || 'Báo chí'})` : 'Đang ghi chép tường thuật buổi họp báo PSG';
    });
  }

  getCurrentQuestion() {
    const evt = this.activeEvent;
    if (!evt || !evt.questions) return null;
    return evt.questions[evt.currentQuestionIdx] || null;
  }

  // Chủ tịch chọn phương án trả lời hoặc nghe cầu thủ trả lời câu hỏi hiện tại
  answerCurrentQuestion(optionKey = null) {
    const evt = this.activeEvent;
    if (!evt || evt.phase !== 'press_conference') return { ok: false, error: 'Không trong buổi họp báo.' };
    const q = this.getCurrentQuestion();
    if (!q) return { ok: false, error: 'Đã hết câu hỏi họp báo.' };

    if (q.target === 'president') {
      const opt = (q.options || []).find((o) => o.key === optionKey) || q.options?.[0];
      if (!opt) return { ok: false, error: 'Phương án trả lời không hợp lệ.' };
      evt.presidentAnswers.push({
        questionId: q.id,
        reporter: q.reporter,
        outlet: q.outlet,
        question: q.question,
        key: opt.key,
        text: opt.text,
        tone: opt.tone,
        impact: opt.impact
      });
      this.broadcast.setCameraAngle('president_closeup');
      this.broadcast.pushLiveReaction(
        q.outlet,
        `Chủ tịch Phạm Minh Chiêu: "${opt.text.slice(0, 72)}..."`,
        3200
      );
    } else {
      evt.playerAnswers.push({
        questionId: q.id,
        reporter: q.reporter,
        outlet: q.outlet,
        question: q.question,
        text: q.playerReply
      });
      this.broadcast.setCameraAngle('player_closeup');
      this.broadcast.pushLiveReaction(
        'PSG_FanLive',
        `${evt.subjectName} trả lời quá ấn tượng! 🔥`,
        2900
      );
    }

    if (this.mediaRooms) this.mediaRooms.triggerCameraFlash();
    evt.currentQuestionIdx++;
    const hasMore = evt.currentQuestionIdx < evt.questions.length;
    if (hasMore) {
      this.highlightAskingJournalist();
    }
    return { ok: true, hasMore, nextQuestion: hasMore ? evt.questions[evt.currentQuestionIdx] : null };
  }

  // ==================== HOÀN TẤT SỰ KIỆN -> BÁO CHÍ, CĐV, DANH TIẾNG, LƯU TRỮ & ĐỒNG BỘ ====================
  completeActiveEvent() {
    const evt = this.activeEvent;
    if (!evt) return { ok: false, error: 'Không có sự kiện nào đang hoạt động.' };
    if (evt.phase === 'completed') return { ok: true, alreadyCompleted: true, event: evt };

    // Tự động ghi nhận các câu trả lời cầu thủ còn lại nếu Chủ tịch kết thúc sớm họp báo
    while (evt.currentQuestionIdx < (evt.questions || []).length) {
      const q = evt.questions[evt.currentQuestionIdx];
      if (q.target === 'player') {
        evt.playerAnswers.push({ questionId: q.id, reporter: q.reporter, outlet: q.outlet, question: q.question, text: q.playerReply });
      }
      evt.currentQuestionIdx++;
    }

    evt.phase = 'completed';
    evt.status = 'Completed';
    evt.completedAt = this.state.timeSystem ? `${this.state.timeSystem.getDateString()} · ${this.state.timeSystem.getTimeString()}` : `Tuần ${this.state.week}`;
    evt.broadcastPeakViewers = this.broadcast.peakViewers || 68000;
    evt.broadcastStatus = evt.hadPressConference ? `Đã phát sóng LIVE (${evt.broadcastPeakViewers.toLocaleString('vi-VN')} lượt xem đỉnh điểm)` : 'Thông cáo chính thức';

    this.broadcast.stopLive();

    // 1. Sinh phản ứng 6 nhóm người hâm mộ
    const fanReactions = FanReactionSystem.generateReactions(evt, this.state);
    evt.fanReactions = fanReactions;

    // 2. Sinh 8 bài viết độc lập từ 8 tòa soạn (chống trùng lặp!)
    const articles = MediaNewsGenerator.generateArticlesForEvent(evt, this.state, fanReactions);
    evt.generatedArticles = articles.map((a) => ({ id: a.id, outlet: a.outlet, title: a.title, views: a.views }));

    // 3. Cập nhật thương hiệu, danh tiếng & thương mại (đảm bảo chỉ cộng 1 lần duy nhất!)
    const repRes = MediaReputationSystem.applyEventImpact(evt, this.state);
    evt.reputationDelta = repRes.delta;

    // 4. Đẩy bài viết nổi bật lên Social Feed & Thông báo Điện thoại Chủ tịch
    fanReactions.slice(0, 2).forEach((fr) => {
      this.state.pushSocial(fr.author, `@${fr.author.replace(/\s+/g, '')}`, fr.text, fr.sentiment === 'positive' ? 'positive' : 'neutral');
    });

    this.state.pushPhoneMsg(
      'Phòng Truyền Thông & PSG TV',
      `✅ HOÀN TẤT SỰ KIỆN: ${evt.subjectName} (${articles.length} bài báo đã đăng)`,
      `Lễ ký kết & họp báo ${evt.subjectName} đã khép lại thành công! ${articles.length} tờ báo lớn đã đưa tin, sự kiện đã được lưu vào Event Archive.`,
      false
    );

    // 5. Lưu trữ sự kiện vào Event Archive (Phần XV)
    this.eventArchive.unshift({ ...evt });
    if (this.eventArchive.length > 40) this.eventArchive.pop();

    // 6. Đưa toàn bộ NPC trở lại nhiệm vụ bình thường & cập nhật lại LED về chế độ chờ
    this.releaseEventNpcs();
    if (this.mediaRooms) this.mediaRooms.updateEventVisuals(null);

    // 7. Đồng bộ đội hình, tủ đồ 3D & tài chính (Single Source of Truth)
    this.state.formationSystem?.notify();
    this.state.notifySquadChanged();
    this.state.generateDailyBriefing();

    this.activeEvent = null;
    return { ok: true, event: evt, articlesCount: articles.length, reputationDelta: repRes.delta };
  }

  releaseEventNpcs() {
    if (!this.npcSystem) return;
    this.npcSystem.npcs.forEach((n) => {
      if (n.mode === 'event_travel' || n.mode === 'event_hold' || n.eventMode) {
        n.eventMode = null;
        n.eventAnim = null;
        n.mode = 'returning';
        this.npcSystem.setNpcDestination(n, n.home.x, n.home.z);
      }
    });
  }

  // Cập nhật từng frame trong vòng lặp 3D (đếm giờ PSG TV LIVE + đèn flash nhiếp ảnh gia)
  update(dt) {
    if (this.broadcast.isLive) {
      this.broadcast.tick(dt);
    }
    if (this.activeEvent && (this.activeEvent.phase === 'signing' || this.activeEvent.phase === 'press_conference')) {
      this._flashTimer += dt;
      if (this._flashTimer >= 3.2) {
        this._flashTimer = 0;
        if (this.mediaRooms) this.mediaRooms.triggerCameraFlash();
      }
    }
  }

  // Tiện ích tổ chức sự kiện Tài trợ lớn / Đối tác thương mại (Phần XII)
  triggerCommercialEvent(type = 'major_sponsor', partnerName = 'Qatar Airways Global', dealValueM = 25) {
    const dealKey = `${type}_${partnerName}_${this.state.season}_${this.state.week}`;
    this.state.addLedger(`Ký hợp đồng đối tác chiến lược ${partnerName}`, +dealValueM);
    return this.scheduleOfficialEvent({
      dealVerified: true,
      dealKey,
      eventType: type,
      subjectName: partnerName,
      position: type === 'major_sponsor' ? 'Nhà Tài Trợ Chính' : 'Đối Tác Thương Mại',
      fee: dealValueM,
      contractYears: 3,
      ovr: 86
    });
  }

  exportState() {
    return {
      pendingEvents: this.pendingEvents,
      activeEvent: this.activeEvent,
      eventArchive: this.eventArchive,
      createdDealKeys: this.createdDealKeys,
      broadcast: this.broadcast.exportState()
    };
  }

  importState(snap) {
    if (!snap) return;
    this.pendingEvents = snap.pendingEvents || [];
    this.activeEvent = snap.activeEvent || null;
    this.eventArchive = snap.eventArchive || [];
    this.createdDealKeys = snap.createdDealKeys || [];
    if (snap.broadcast) this.broadcast.importState(snap.broadcast);
    if (this.mediaRooms) this.mediaRooms.updateEventVisuals(this.activeEvent);
  }
}
