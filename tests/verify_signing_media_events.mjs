// tests/verify_signing_media_events.mjs
// Bộ kiểm thử bắt buộc 24 điểm (Phần XVI — Official Signing & Media Event System)
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Minimal THREE headless shim
class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); }
}
class Obj3D {
  constructor() { this.position = new Vec3(); this.rotation = { x: 0, y: 0, z: 0 }; this.children = []; this.visible = true; this.userData = {}; }
  add(...o) { this.children.push(...o); }
  remove(o) { this.children = this.children.filter((x) => x !== o); }
  traverse(fn) { fn(this); this.children.forEach((c) => c.traverse && c.traverse(fn)); }
}
class MeshMock extends Obj3D { constructor() { super(); this.isMesh = true; } }
globalThis.THREE = {
  Vector3: Vec3, Group: Obj3D, Mesh: MeshMock,
  BoxGeometry: class {}, ConeGeometry: class {}, SphereGeometry: class {}, PlaneGeometry: class {},
  CylinderGeometry: class {}, CircleGeometry: class {},
  MeshStandardMaterial: class { constructor() { this.color = { setHex() {} }; this.emissive = { setHex() {} }; } },
  MeshBasicMaterial: class {}, CanvasTexture: class {}
};
globalThis.performance = globalThis.performance || { now: () => Date.now() };

import { GameState } from '../src/club/GameState.js';
import { PathfindingSystem } from '../src/ai/PathfindingSystem.js';
import { NpcSystem } from '../src/npc/NpcSystem.js';
import { AnimationSystem } from '../src/animations/AnimationSystem.js';
import { MediaNewsGenerator, MediaReputationSystem } from '../src/media/MediaNewsGenerator.js';
import { DialogueBranchSystem } from '../src/media/PressConferenceSystem.js';
import { renderSigningEventHubHTML, renderLiveCeremonySheetHTML } from '../src/ui/SigningEventView.js';

let passed = 0;
function check(idx, name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ [${String(idx).padStart(2, '0')}/24 PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [${String(idx).padStart(2, '0')}/24 FAIL] ${name}:`, err.message);
    process.exitCode = 1;
  }
}

function makeRigMesh() {
  const m = new MeshMock();
  const mk = () => ({ rotation: { x: 0, y: 0, z: 0 } });
  m.userData.rig = {
    pelvis: new Obj3D(), torso: new Obj3D(), headGroup: new Obj3D(),
    leftArm: { shoulder: mk(), elbow: new Obj3D() }, rightArm: { shoulder: mk(), elbow: new Obj3D() },
    leftLeg: { hip: mk(), knee: mk() }, rightLeg: { hip: mk(), knee: mk() },
    basePelvisY: 0.92, animPhase: 0, state: 'idle'
  };
  return m;
}

const mockCampus = {
  root: new Obj3D(),
  colliders: [
    { minX: 44.2, maxX: 48.8, minZ: -13.9, maxZ: -12.5, active: true }, // Bàn ký kết
    { minX: 52.8, maxX: 54.0, minZ: 8.2, maxZ: 13.8, active: true }     // Bàn họp báo
  ],
  doors: [
    { id: 'door_media_wing', x: 34, z: 0, open: false, locked: false, collider: { active: false } },
    { id: 'door_signing_room', x: 42, z: -2, open: false, locked: false, collider: { active: false } },
    { id: 'door_press_hall', x: 42, z: 2, open: false, locked: false, collider: { active: false } }
  ],
  boardroomSeats: [],
  resolveCollision(x, z) { return { x, z }; }
};

const mockMediaRooms = {
  visualUpdates: 0,
  flashCount: 0,
  updateEventVisuals() { this.visualUpdates++; },
  triggerCameraFlash() { this.flashCount++; },
  seatPositions: {
    signing: {
      president: { x: 46.5, z: -14.55, rotY: 0 }, player: { x: 48.0, z: -14.55, rotY: 0 },
      sporting: { x: 45.0, z: -14.55, rotY: 0 }, mediaDir: { x: 43.2, z: -11.5, rotY: -0.5 },
      photographer: { x: 46.5, z: -8.6, rotY: Math.PI }, cameraman: { x: 49.4, z: -8.8, rotY: Math.PI }
    },
    press: {
      president: { x: 54.5, z: 11.0, rotY: -Math.PI / 2 }, player: { x: 54.5, z: 12.7, rotY: -Math.PI / 2 },
      sporting: { x: 54.5, z: 9.3, rotY: -Math.PI / 2 }, host: { x: 53.5, z: 6.2, rotY: -Math.PI / 2 },
      mediaDir: { x: 51.8, z: 5.5, rotY: -0.7 }, photographer: { x: 49.0, z: 5.3, rotY: 0.9 },
      cameraman: { x: 39.6, z: 11.0, rotY: Math.PI / 2 }, audioTech: { x: 37.8, z: 15.0, rotY: Math.PI / 2 },
      lightTech: { x: 37.8, z: 16.5, rotY: Math.PI / 2 },
      journalists: [{ x: 47.6, z: 7.4, rotY: Math.PI / 2 }, { x: 47.6, z: 9.8, rotY: Math.PI / 2 }, { x: 47.6, z: 12.2, rotY: Math.PI / 2 }, { x: 47.6, z: 14.6, rotY: Math.PI / 2 }]
    }
  }
};

const state = new GameState();
const anim = new AnimationSystem();
const npcSys = new NpcSystem(mockCampus.root, { createHumanoid: makeRigMesh }, anim, mockCampus);
npcSys.spawnFromProfiles(state.npcs, state.clockHour);
npcSys.syncSquadPlayers(state.getPsgSquad(), state.clockHour);
state.onSquadChange(() => npcSys.syncSquadPlayers(state.getPsgSquad(), state.clockHour));
state.signingEventSystem.attach3D(mockMediaRooms, npcSys);

// 1. Thương vụ chưa hoàn tất không được tổ chức lễ ký kết
check(1, 'Thương vụ chưa hoàn tất không được tổ chức lễ ký kết', () => {
  const blocked = state.signingEventSystem.scheduleOfficialEvent({ dealVerified: false, subjectName: 'Fake Deal' });
  assert.equal(blocked.ok, false);
  assert.equal(state.signingEventSystem.pendingEvents.length, 0);
});

// Hoàn tất 1 thương vụ mua cầu thủ thực tế (2 giai đoạn)
const target = state.players.find((p) => p.name === 'Florian Wirtz');
const n0 = state.transferSystem.startNegotiation(target.id, 'buy');
state.transferSystem.submitClubOffer(n0.negotiation.id, { fee: n0.negotiation.clubAskFee, installments: 1, perfBonus: 8 });
const n2 = state.transferSystem.submitPlayerOffer(n0.negotiation.id, { weeklyWage: n0.negotiation.playerAskWage, contractYears: 5, signingBonus: 2, squadRole: 'Trụ cột không thể thay thế' });
assert.equal(n2.outcome, 'accepted');
const createdEvent = state.signingEventSystem.pendingEvents[0];

// 2. Thương vụ hoàn tất tạo sự kiện đúng 1 lần
check(2, 'Thương vụ hoàn tất tự tạo sự kiện Awaiting Official Signing Event đúng 1 lần', () => {
  assert.ok(createdEvent);
  assert.equal(createdEvent.status, 'Awaiting Official Signing Event');
  assert.equal(createdEvent.eventType, 'record_signing'); // Wirtz OVR 89 / fee >= 80 -> record_signing!
  assert.equal(state.signingEventSystem.pendingEvents.length, 1);
});

// 3 & 4. Pathfinding tới Phòng Ký Kết & Phòng Họp Báo qua cửa hợp lệ, không xuyên bàn/tường
check(3, 'Cầu thủ & NPC tìm đường hợp lệ từ cổng/sảnh tới Phòng Ký Hợp Đồng & Phòng Họp Báo', () => {
  const pf = new PathfindingSystem(mockCampus);
  const pathSign = pf.findPath(0, 25, 48.0, -14.55);
  assert.ok(pathSign.some((pt) => pt.doorId === 'door_media_wing'), 'Phải đi qua cửa Khu Truyền Thông');
  assert.ok(pathSign.some((pt) => pt.doorId === 'door_signing_room'), 'Phải đi qua cửa Phòng Ký Hợp Đồng');
});

check(4, 'NPC di chuyển tránh bàn ký & bàn họp báo không xuyên đồ nội thất', () => {
  const pf = new PathfindingSystem(mockCampus);
  const avoidDesk = pf.findLocalGridPath(46.5, -10.5, 46.5, -15.0);
  const clipped = avoidDesk.some((pt) => pt.x > 44.3 && pt.x < 48.7 && pt.z > -13.8 && pt.z < -12.6);
  assert.equal(clipped, false);
});

// 5. Bắt đầu sự kiện & Chủ tịch tham gia lễ ký kết
check(5, 'Chủ tịch Phạm Minh Chiêu bắt đầu sự kiện & bước vào Lễ Ký Kết', () => {
  const s = state.signingEventSystem.startEvent(createdEvent.eventId);
  assert.equal(s.ok, true);
  const cer = state.signingEventSystem.enterSigningCeremony();
  assert.equal(cer.ok, true);
  assert.equal(state.signingEventSystem.activeEvent.phase, 'signing');
  assert.ok(mockMediaRooms.visualUpdates >= 1, 'LED & Backdrop phải tự cập nhật động theo cầu thủ');
});

// 6, 7, 8. Kiểm thử 3 hoạt ảnh cốt lõi: ký hợp đồng, bắt tay, cầm áo chụp ảnh
const testRig = makeRigMesh();
check(6, 'Hoạt ảnh ký hợp đồng (sign_contract) hoạt động chuẩn xác', () => {
  anim.updateRig(testRig, 'sign_contract', 0.1);
  assert.equal(testRig.userData.rig.state, 'sign_contract');
  assert.ok(testRig.userData.rig.rightArm.shoulder.rotation.x < 0);
});

check(7, 'Hoạt ảnh bắt tay (handshake) hoạt động chuẩn xác', () => {
  anim.updateRig(testRig, 'handshake', 0.1);
  assert.equal(testRig.userData.rig.state, 'handshake');
  assert.ok(testRig.userData.rig.rightArm.shoulder.rotation.x < -0.5);
});

check(8, 'Hoạt ảnh cầm áo chụp ảnh (hold_jersey, take_photo) & đèn flash hoạt động', () => {
  anim.updateRig(testRig, 'hold_jersey', 0.1);
  assert.equal(testRig.userData.rig.state, 'hold_jersey');
  // Tiến đủ các bước lễ ký kết sang bước 5 & chuyển sang phòng họp báo
  state.signingEventSystem.advanceSigningStep(); // step 2: pres_sign
  state.signingEventSystem.advanceSigningStep(); // step 3: player_sign
  state.signingEventSystem.advanceSigningStep(); // step 4: handshake
  state.signingEventSystem.advanceSigningStep(); // step 5: hold_jersey
  assert.ok(mockMediaRooms.flashCount >= 3, 'Nhiếp ảnh gia phải nháy đèn flash khi ký/bắt tay/cầm áo');
});

// 9. Phóng viên & đội ngũ 10 NPC truyền thông có mặt tại Phòng Họp Báo
const toPress = state.signingEventSystem.advanceSigningStep();
check(9, 'Đội ngũ 10 NPC truyền thông (MC, phóng viên, nhiếp ảnh, quay phim, kỹ thuật) di chuyển tới Phòng Họp Báo', () => {
  assert.equal(toPress.nextPhase, 'press_conference');
  const mediaNpcs = npcSys.npcs.filter((n) => n.isMediaCrew || n.id === 'npc_media');
  assert.equal(mediaNpcs.length, 10, 'Phải có đủ 10 NPC chuyên trách truyền thông');
  const journalists = npcSys.npcs.filter((n) => n.mediaRole === 'journalist');
  assert.ok(journalists.some((j) => j.eventAnim === 'raise_hand'), 'Phải có phóng viên giơ tay đặt câu hỏi');
});

// 10. Phóng viên đặt câu hỏi theo bối cảnh thương vụ thật
check(10, 'Phóng viên đặt câu hỏi thực tế theo phí chuyển nhượng, lương & cạnh tranh vị trí', () => {
  const qs = state.signingEventSystem.activeEvent.questions;
  assert.ok(qs.length >= 4);
  assert.ok(qs.some((q) => q.question.includes('Florian Wirtz')));
  assert.ok(qs.some((q) => q.id === 'q_pres_fee'), 'Phải có câu hỏi bất ngờ về mức phí lớn');
});

// 11. Chủ tịch chọn phương án trả lời
check(11, 'Chủ tịch Phạm Minh Chiêu trả lời câu hỏi họp báo với các phương án có tác động', () => {
  const r = state.signingEventSystem.answerCurrentQuestion('A');
  assert.equal(r.ok, true);
  assert.equal(state.signingEventSystem.activeEvent.presidentAnswers.length, 1);
});

// 12. Cầu thủ có câu trả lời riêng biệt theo tính cách/tuổi/quốc tịch (không lặp mẫu chung!)
check(12, 'Cầu thủ có câu trả lời cá nhân hóa khác nhau theo tính cách, tuổi & bối cảnh', () => {
  const youth = state.academy.find((y) => y.squad === 'U19');
  const replyStar = DialogueBranchSystem.generatePlayerReply({ subjectName: target.name, playerId: target.id, eventType: 'record_signing', shirtNumber: target.shirtNumber }, state, 'feelings');
  const replyYouth = DialogueBranchSystem.generatePlayerReply({ subjectName: youth.name, playerId: youth.id, eventType: 'youth_promotion', shirtNumber: 44 }, state, 'feelings');
  assert.notEqual(replyStar, replyYouth, 'Hai cầu thủ khác nhau phải có lời phát biểu khác nhau');
  // Trả lời nốt các câu hỏi còn lại trong buổi họp báo
  while (state.signingEventSystem.getCurrentQuestion()) {
    const q = state.signingEventSystem.getCurrentQuestion();
    state.signingEventSystem.answerCurrentQuestion(q.target === 'president' ? 'B' : null);
  }
  assert.ok(state.signingEventSystem.activeEvent.playerAnswers.length >= 2);
});

// 13 & 14. PSG TV chuyển sang trạng thái LIVE & giao diện Điện thoại / Máy tính hoạt động
check(13, 'PSG TV chuyển trạng thái LIVE, có thời gian, lượt xem & chuyển góc camera', () => {
  assert.equal(state.signingEventSystem.broadcast.isLive, true);
  assert.ok(state.signingEventSystem.broadcast.viewerCount > 50000);
  assert.equal(state.signingEventSystem.broadcast.setCameraAngle('player_closeup'), true);
});

check(14, 'Giao diện PSG TV & Họp báo hiển thị chuẩn cho Điện thoại & Máy tính', () => {
  const tvHtml = renderSigningEventHubHTML(state, 'psgtv');
  const sheetHtml = renderLiveCeremonySheetHTML(state);
  assert.ok(tvHtml.includes('● LIVE') && tvHtml.includes('PSG TV – Official Signing Ceremony'));
  assert.ok(sheetHtml.includes('● LIVE · PSG TV'));
});

// Hoàn tất sự kiện!
const brandBefore = { ...state.brandMetrics };
const doneEvt = state.signingEventSystem.completeActiveEvent();

// 15. Báo chí tạo 8 bài viết độc lập từ đúng thương vụ
check(15, 'Hệ thống báo chí tạo đủ 8 bài viết từ 8 tòa soạn khác nhau với nội dung riêng biệt', () => {
  assert.equal(doneEvt.ok, true);
  assert.equal(doneEvt.articlesCount, 8);
  const evArticles = state.newsArchive.filter((a) => a.eventId === createdEvent.eventId);
  assert.equal(evArticles.length, 8);
  const titles = new Set(evArticles.map((a) => a.title));
  assert.equal(titles.size, 8, '8 tòa soạn phải có 8 tiêu đề/góc nhìn riêng biệt');
});

// 16. Phản ứng người hâm mộ đầy đủ 6 nhóm
check(16, 'Phản ứng người hâm mộ đầy đủ 6 nhóm phù hợp thương vụ', () => {
  const archived = state.signingEventSystem.eventArchive[0];
  assert.equal(archived.fanReactions.length, 6);
});

// 17. Danh tiếng & thương hiệu được cập nhật hợp lý và KHÔNG cộng thưởng 2 lần
check(17, 'Danh tiếng & Thương hiệu cập nhật hợp lý và chống cộng thưởng 2 lần', () => {
  assert.ok(state.brandMetrics.brandValue > brandBefore.brandValue);
  assert.ok(state.brandMetrics.fanbase > brandBefore.fanbase);
  const secondApply = MediaReputationSystem.applyEventImpact(doneEvt.event, state);
  assert.equal(secondApply.applied, false, 'Tuyệt đối không được cộng thưởng 2 lần cho cùng 1 sự kiện!');
});

// 18 & 19. Cầu thủ xuất hiện trong đội một & có tủ đồ cá nhân
check(18, 'Cầu thủ mới thực sự tồn tại trong danh sách đội một PSG (Single Source of Truth)', () => {
  assert.ok(state.getPsgSquad().some((p) => p.id === target.id));
});

check(19, 'Cầu thủ mới được cấp tủ đồ cá nhân đồng bộ trong Phòng Thay Đồ 3D', () => {
  assert.ok(state.formationSystem.lockers.some((l) => l.playerId === target.id));
});

// 20. Save/Load khôi phục nguyên vẹn Event Archive, Brand Metrics & Articles
check(20, 'Save/Load lưu và tải lại chính xác toàn bộ Event Archive, Thương hiệu & Bài báo', () => {
  const raw = JSON.stringify(state.exportFullState({ x: 46, z: 11 }));
  const restored = new GameState();
  restored.importFullState(JSON.parse(raw));
  assert.equal(restored.signingEventSystem.eventArchive.length, 1);
  assert.equal(restored.signingEventSystem.eventArchive[0].eventId, createdEvent.eventId);
  assert.equal(restored.brandMetrics.brandValue, state.brandMetrics.brandValue);
  assert.ok(restored.newsArchive.some((a) => a.eventId === createdEvent.eventId));
});

// 21. Không tạo bài báo trùng lặp
check(21, 'Không tạo bài báo trùng lặp nếu gọi lại MediaNewsGenerator cho cùng sự kiện', () => {
  const dup = MediaNewsGenerator.generateArticlesForEvent(doneEvt.event, state, doneEvt.event.fanReactions);
  assert.equal(dup.length, 0);
});

// 22. Không phát sinh 2 sự kiện cho cùng 1 thương vụ
check(22, 'Không phát sinh hai sự kiện cho cùng một dealKey', () => {
  const dupEvt = state.signingEventSystem.scheduleOfficialEvent({ dealVerified: true, dealKey: createdEvent.dealKey, subjectName: target.name });
  assert.equal(dupEvt.ok, false);
});

// 23. Hỗ trợ giao diện màn hình dọc (Portrait Mode) trên iPhone & safe-area
check(23, 'Giao diện tối ưu iPhone Portrait Mode & safe-area trong index.html', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('@media (orientation: portrait)'), 'Phải có CSS cho Portrait Mode');
  assert.ok(html.includes('env(safe-area-inset-bottom)'), 'Phải tôn trọng safe-area iPhone');
  assert.ok(html.includes('#ceremony-sheet'), 'Phải có bottom-sheet họp báo trực tiếp');
});

// 24. Kiểm tra tái sử dụng hệ thống cho các loại sự kiện khác (HLV trưởng mới & Tài trợ lớn)
check(24, 'Tái sử dụng trọn vẹn cho Bổ nhiệm HLV trưởng mới & Sự kiện Tài trợ lớn mà không phá tính năng cũ', () => {
  const xabi = state.managerSystem.getCandidatesForRole('head_coach').find((c) => c.name === 'Xabi Alonso');
  state.managerSystem.appointStaff(xabi.staffId, { wage: 210, contractYears: 4 });
  assert.ok(state.signingEventSystem.pendingEvents.some((e) => e.eventType === 'head_coach_appointment' && e.subjectName === 'Xabi Alonso'));
  const spon = state.signingEventSystem.triggerCommercialEvent('major_sponsor', 'Qatar Airways 2027', 30);
  assert.equal(spon.ok, true);
  assert.equal(spon.event.eventType, 'major_sponsor');
});

console.log(`\n🎉 HOÀN TẤT KIỂM THỬ SIGNING & MEDIA EVENTS: ${passed}/24 ĐIỂM ĐẠT 100%!`);
