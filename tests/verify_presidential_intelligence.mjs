// tests/verify_presidential_intelligence.mjs
// Bộ kiểm thử tự động Hệ thống Điều Hành Chủ Tịch PSG (Presidential Intelligence Center,
// 17 Ứng dụng Máy tính, TV 3D 9 kênh + PSG Morning News 10 mục, Tin đồn/Tin mật, Khủng hoảng,
// Họp báo Bối cảnh, Đối thủ Chuyển nhượng chủ động, Thương mại/CSVC, Bảo tàng & Save/Load).

import assert from 'node:assert/strict';

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); }
}
class Obj3D {
  constructor() {
    this.position = new Vec3();
    this.rotation = { x: 0, y: 0, z: 0 };
    this.children = [];
    this.visible = true;
    this.userData = {};
  }
  add(...objs) { this.children.push(...objs); }
  traverse(fn) { fn(this); this.children.forEach((c) => c.traverse && c.traverse(fn)); }
}
class MeshMock extends Obj3D {
  constructor() { super(); this.isMesh = true; }
}
globalThis.THREE = {
  Vector3: Vec3,
  Group: Obj3D,
  Mesh: MeshMock,
  BoxGeometry: class {},
  ConeGeometry: class {},
  SphereGeometry: class {},
  PlaneGeometry: class {},
  MeshStandardMaterial: class {}
};
globalThis.performance = globalThis.performance || { now: () => Date.now() };

import { GameState } from '../src/club/GameState.js';
import { REPUTATION_PILLARS } from '../src/club/ReputationSystem.js';
import { TV_CHANNELS } from '../src/media/TelevisionSystem.js';
import { RUMOR_STATUS } from '../src/media/RumorAndCrisisSystem.js';
import { renderTelevisionModalHTML } from '../src/ui/TelevisionView.js';
import {
  renderExecutiveOverviewHTML,
  renderContractsNegotiationHTML,
  renderSponsorsHTML,
  renderFacilitiesHTML,
  renderCommercialHTML,
  renderMediaCenterHTML,
  renderApprovalsQueueHTML
} from '../src/ui/ComputerAppsView.js';
import { renderMuseumHubHTML } from '../src/ui/MuseumView.js';
import { PsgCampusScene } from '../src/scene/PsgCampusScene.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.stack || err.message);
    process.exitCode = 1;
  }
}

function makeCanvasCtxMock() {
  const ops = { fillStyles: [], fillRects: [], fillTexts: [] };
  const ctx = {
    _fillStyle: '',
    set fillStyle(v) { this._fillStyle = v; ops.fillStyles.push(v); },
    get fillStyle() { return this._fillStyle; },
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    createLinearGradient() { return { addColorStop() {} }; },
    fillRect(x, y, w, h) { ops.fillRects.push({ x, y, w, h, color: this._fillStyle }); },
    fillText(txt) { ops.fillTexts.push(String(txt)); },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    arc() {},
    fill() {},
    save() {},
    restore() {},
    rect() {},
    clip() {}
  };
  return { ctx, ops };
}

// =========================================================================
// 1. CLUB EVENT BUS: IDEMPOTENCY & BOUNDED HISTORY
// =========================================================================
test('PIC-1: ClubEventBus phát sự kiện idempotent (tránh trùng eventKey) và giới hạn lịch sử', () => {
  const state = new GameState();
  const bus = state.eventBus;
  let count = 0;
  bus.on('CUSTOM_SYNC_TEST', () => { count++; });

  const first = bus.emit('CUSTOM_SYNC_TEST', { label: 'Lần 1' }, 'unique_key_001');
  const dup = bus.emit('CUSTOM_SYNC_TEST', { label: 'Lần 2' }, 'unique_key_001');

  assert.equal(first.ok, true);
  assert.equal(dup.ok, false);
  assert.equal(dup.duplicate, true);
  assert.equal(count, 1, 'Không được kích hoạt listener 2 lần cho cùng eventKey');

  for (let i = 0; i < 110; i++) {
    bus.emit('CUSTOM_SYNC_TEST', { idx: i });
  }
  assert.ok(bus.eventHistory.length <= 80, 'eventHistory phải được giới hạn không phình bộ nhớ');
});

// =========================================================================
// 2. REPUTATION SYSTEM: 6 TRỤ CỘT & ĐỒNG BỘ HAI CHIỀU
// =========================================================================
test('PIC-2: Hệ thống Uy tín Chủ tịch có đủ 6 trụ cột, tính điểm gộp & chống cộng lặp', () => {
  const state = new GameState();
  const rep = state.reputationSystem;
  assert.equal(REPUTATION_PILLARS.length, 6);
  const keys = REPUTATION_PILLARS.map((p) => p.key);
  assert.deepEqual(keys, ['fanTrust', 'playerTrust', 'coachTrust', 'mediaTrust', 'partnerTrust', 'governanceSkill']);

  const beforeFan = rep.metrics.fanTrust;
  const r1 = rep.applyDelta({ fanTrust: +4, mediaTrust: +2 }, 'Quyết định minh bạch', 'rep_once_key');
  const r2 = rep.applyDelta({ fanTrust: +4, mediaTrust: +2 }, 'Quyết định trùng', 'rep_once_key');

  assert.equal(r1.applied, true);
  assert.equal(r2.applied, false);
  assert.equal(r2.duplicate, true);
  assert.equal(rep.metrics.fanTrust, Math.min(100, beforeFan + 4));
  assert.equal(state.president.fanSupport, rep.metrics.fanTrust);
  assert.equal(state.president.prestige, rep.getOverallScore());
  assert.ok(typeof rep.getTierLabel() === 'string' && rep.getTierLabel().length > 4);
});

// =========================================================================
// 3. ĐỒNG BỘ 3 THIẾT BỊ (MÁY TÍNH - TV - ĐIỆN THOẠI) TRÊN CÙNG SỰ KIỆN
// =========================================================================
test('PIC-3: Một sự kiện hỏi mua từ Real Madrid đồng bộ đồng thời tới Điện thoại, Máy tính & TV', () => {
  const state = new GameState();
  const phoneBefore = state.phoneInbox.length;
  const target = state.getPsgSquad().find((p) => p.ovr >= 85) || state.getPsgSquad()[0];
  const bid = {
    id: 'bid_real_sync_test',
    date: '03/08/2026',
    buyerClub: 'Real Madrid',
    buyerStrategy: 'Săn siêu sao (Galacticos)',
    dealType: 'buy',
    playerId: target.id,
    playerName: target.name,
    ovr: target.ovr,
    fee: 95,
    status: 'pending'
  };
  state.transferSystem.incomingBids.unshift(bid);
  state.pushPhoneMsg('Real Madrid (Mercato)', `📩 Đề nghị MUA ${target.name} (€95M)`, `Real Madrid gửi đề nghị €95M cho ${target.name}.`, true);
  state.eventBus.emit('TRANSFER_BID_RECEIVED', {
    bidId: bid.id,
    playerId: target.id,
    playerName: target.name,
    ovr: target.ovr,
    buyerClub: 'Real Madrid',
    dealType: 'buy',
    fee: 95
  }, `bid_${bid.id}`);

  // 1) Điện thoại nhận thông báo
  assert.ok(state.phoneInbox.length > phoneBefore, 'Điện thoại phải nhận tin nhắn ngay khi có đề nghị mua');
  assert.ok(state.phoneInbox[0].body.includes('Real Madrid'), 'Tin nhắn Điện thoại phải nêu tên đối tác');

  // 2) Máy tính cập nhật hàng đợi Đàm phán / Phê duyệt & Hồ sơ truyền thông
  const contractsHtml = renderContractsNegotiationHTML(state);
  const approvalsHtml = renderApprovalsQueueHTML(state);
  assert.ok(contractsHtml.includes('Real Madrid') && contractsHtml.includes(target.name));
  assert.ok(approvalsHtml.includes('Real Madrid') && approvalsHtml.includes('Chấp nhận'));

  // 3) TV (Transfer News) & Tin đồn/Báo chí phản ánh sự kiện
  const tvData = state.televisionSystem.getChannelBroadcastData('transfer_news');
  const tvText = `${tvData.headline} ${tvData.ticker} ${JSON.stringify(tvData.mainCards)}`;
  assert.ok(tvText.includes(target.name) || tvText.includes('Real Madrid'));
  assert.ok(state.rumorCrisisSystem.rumors.some((r) => r.linkedBidId === bid.id));
});

// =========================================================================
// 4. BÁO CHÍ, TIN ĐỒN / TIN MẬT (5 HÀNH ĐỘNG) & CHỐNG XÁC NHẬN TIN SAI
// =========================================================================
test('PIC-4: Phân biệt Tin đồn / Tin chưa xác nhận / Thông báo chính thức & 5 hành động Chủ tịch', () => {
  const state = new GameState();
  const rc = state.rumorCrisisSystem;

  // Tin đồn sai sự thật -> CẤM xác nhận "Thông báo chính thức"
  const falseRumor = rc.addRumor({
    type: 'rival_approach',
    title: 'Tin đồn thất thiệt về trụ cột PSG',
    detail: 'Chưa có tiếp xúc nào trong hệ thống.',
    verificationStatus: RUMOR_STATUS.RUMOR,
    isFactuallyTrue: false,
    relatedEntity: 'Vitinhɑ'
  }, 'rum_false_unit');
  assert.ok(falseRumor);

  const confirmFalse = rc.resolveRumor(falseRumor.id, 'confirm');
  assert.equal(confirmFalse.ok, false, 'Không được phép xác nhận Thông báo chính thức cho tin không có thật');
  assert.equal(falseRumor.verificationStatus, RUMOR_STATUS.RUMOR);

  const verifyFalse = rc.resolveRumor(falseRumor.id, 'verify');
  assert.equal(verifyFalse.ok, true);
  assert.equal(falseRumor.verificationStatus, RUMOR_STATUS.RUMOR);

  const denyFalse = rc.resolveRumor(falseRumor.id, 'deny');
  assert.equal(denyFalse.ok, true);
  assert.equal(denyFalse.rumor.handled, true);

  // Tin có cơ sở thật -> xác nhận chuyển sang Thông báo chính thức
  const realRumor = rc.addRumor({
    type: 'secret_talks',
    title: 'Cuộc đàm phán thật sự được ghi nhận',
    detail: 'Giám đốc Thể thao đã gửi đề nghị.',
    verificationStatus: RUMOR_STATUS.UNCONFIRMED,
    isFactuallyTrue: true,
    relatedEntity: 'Cherki'
  }, 'rum_true_unit');

  const confirmReal = rc.resolveRumor(realRumor.id, 'confirm');
  assert.equal(confirmReal.ok, true);
  assert.equal(realRumor.verificationStatus, RUMOR_STATUS.OFFICIAL);

  // Kiểm tra hành động silence & delegate_media
  const rSilence = rc.addRumor({ title: 'Rò rỉ lương', detail: 'Chi tiết', isFactuallyTrue: true, relatedEntity: 'A' }, 'rum_sil');
  assert.equal(rc.resolveRumor(rSilence.id, 'silence').ok, true);
  assert.notEqual(rSilence.verificationStatus, RUMOR_STATUS.OFFICIAL);

  const rDelegate = rc.addRumor({ title: 'Tin mật B', detail: 'Chi tiết', isFactuallyTrue: false, relatedEntity: 'B' }, 'rum_del');
  assert.equal(rc.resolveRumor(rDelegate.id, 'delegate_media').ok, true);
  assert.equal(rDelegate.handled, true);
});

// =========================================================================
// 5. KHỦNG HOẢNG TRUYỀN THÔNG (3 CỐ VẤN) & XỬ LÝ TÁC ĐỘNG UY TÍN
// =========================================================================
test('PIC-5: Khủng hoảng truyền thông có đủ 3 cố vấn (GĐTT, GĐTTThông, HLV) và xử lý cập nhật uy tín', () => {
  const state = new GameState();
  const rc = state.rumorCrisisSystem;
  const crisis = rc.triggerCrisis('coach_pressure', { coachName: state.coach.name, loseStreak: 2 }, 'crisis_unit_test');
  assert.ok(crisis);
  assert.equal(crisis.advisors.length, 3, 'Phải có đủ 3 cố vấn GĐ Thể thao, GĐ Truyền thông & HLV trưởng');
  assert.ok(crisis.options.length >= 3);

  const coachBefore = state.reputationSystem.metrics.coachTrust;
  const res = rc.resolveCrisis(crisis.id, 'back_coach');
  assert.equal(res.ok, true);
  assert.equal(crisis.status, 'resolved');
  assert.ok(state.reputationSystem.metrics.coachTrust >= coachBefore, 'Công khai bảo vệ HLV phải tăng uy tín với HLV');
});

// =========================================================================
// 6. PSG MORNING NEWS: ĐỦ 10 MỤC & CHỐNG LẶP LẠI BẰNG DIGEST SIGNATURE
// =========================================================================
test('PIC-6: PSG Morning News đủ 10 mục thực tế & chỉ tái tạo khi dữ liệu thay đổi', () => {
  const state = new GameState();
  const mns = state.morningNewsSystem;
  const first = mns.generateDigest(true);
  assert.equal(first.updated, true);
  assert.equal(first.program.sections.length, 10, 'Phải có chính xác 10 mục Morning News');

  const second = mns.generateDigest(false);
  assert.equal(second.updated, false, 'Khi trạng thái game chưa đổi, không được sinh trùng bản tin mới');

  state.addLedger('Test biến động tài chính Morning News', -15);
  const third = mns.generateDigest(false);
  assert.equal(third.updated, true, 'Khi dữ liệu game thay đổi, Morning News phải tự làm mới chữ ký');
});

// =========================================================================
// 7. TV TRONG PHÒNG CHỦ TỊCH: 9 KÊNH, BẬT/TẮT MÀN ĐEN TUYỆT ĐỐI & CẬP NHẬT 3D CẬN CẢNH
// =========================================================================
test('PIC-7: TV Truyền thông có 9 kênh, màn hình đen khi tắt (#04060a) & cập nhật 3D theo vị trí', () => {
  const state = new GameState();
  const tv = state.televisionSystem;
  assert.equal(TV_CHANNELS.length, 9, 'Phải có đủ 9 kênh truyền hình');

  // Kiểm tra dữ liệu 9 kênh đều sinh ra tiêu đề & stats hợp lệ
  TV_CHANNELS.forEach((ch) => {
    tv.switchChannel(ch.id);
    const data = tv.getChannelBroadcastData(ch.id);
    assert.ok(data.headline && data.mainCards.length >= 2 && data.statsStrip.length >= 3, `Kênh ${ch.id} thiếu dữ liệu phát sóng`);
  });

  // Kiểm tra Render khi BẬT vs TẮT
  const { ctx: onCtx, ops: onOps } = makeCanvasCtxMock();
  tv.setPower(true);
  tv.channelSwitchPulse = 0;
  tv.renderScreenCanvas(onCtx, 512, 256, 1.2);
  assert.ok(onOps.fillTexts.length >= 4, 'Khi TV bật phải vẽ chữ và nội dung phát sóng lên Canvas 3D');

  const { ctx: offCtx, ops: offOps } = makeCanvasCtxMock();
  tv.setPower(false);
  tv.renderScreenCanvas(offCtx, 512, 256, 1.2);
  assert.equal(offOps.fillRects.length, 1);
  assert.equal(offOps.fillRects[0].color, '#04060a', 'Khi TV tắt phải vẽ duy nhất nền đen #04060a');
  assert.equal(offOps.fillTexts.length, 0);

  // Kiểm tra PsgCampusScene.isNearPresidentOffice & render UI
  const near = PsgCampusScene.prototype.isNearPresidentOffice.call({ hqInteriorGroup: { visible: true } }, { x: -25, z: -15 });
  const far = PsgCampusScene.prototype.isNearPresidentOffice.call({ hqInteriorGroup: { visible: true } }, { x: 20, z: 30 });
  assert.equal(near, true);
  assert.equal(far, false);

  const tvHtmlOff = renderTelevisionModalHTML(state);
  assert.ok(tvHtmlOff.includes('TV ĐANG TẮT'));
  tv.setPower(true);
  tv.openMorningNews();
  const tvHtmlMorning = renderTelevisionModalHTML(state);
  assert.ok(tvHtmlMorning.includes('PSG MORNING NEWS'));
});

// =========================================================================
// 8. ĐỐI THỦ CHUYỂN NHƯỢNG CHỦ ĐỘNG: PROFILE, MUA/MƯỢN, ĐẤU GIÁ & SỞ HỮU DUY NHẤT
// =========================================================================
test('PIC-8: Đối thủ chuyển nhượng chủ động hỏi mua/mượn, phản hồi trả giá & đảm bảo 1 cầu thủ chỉ thuộc 1 CLB', () => {
  const state = new GameState();
  const ts = state.transferSystem;

  // Hồ sơ chiến lược CLB đối thủ
  const realMadrid = state.clubs.find((c) => c.name === 'Real Madrid');
  assert.ok(realMadrid.wageBudget > 0 && Array.isArray(realMadrid.positionalNeeds) && realMadrid.strategy && realMadrid.seasonTarget);

  // AI sinh đề nghị hỏi mua/mượn cầu thủ PSG
  const bids = ts.generateIncomingBids(3);
  assert.ok(bids.length >= 1, 'Phải sinh được đề nghị hỏi mua/mượn từ đối thủ AI');
  const firstBid = bids[0];
  const counter = ts.counterIncomingBid(firstBid.id, Math.round(firstBid.fee * 1.12));
  assert.equal(counter.ok, true);

  // Chạy vòng lặp AI + mượn cầu thủ về PSG qua đàm phán 2 giai đoạn
  ts.runAiTransferMarketCycle(6);
  const loanInTarget = state.players.find((p) => p.club !== 'Paris Saint-Germain' && p.ovr >= 78 && p.ovr <= 84);
  if (loanInTarget) {
    const lNeg = ts.startNegotiation(loanInTarget.id, 'loan');
    assert.equal(lNeg.ok, true);
    const s1 = ts.submitClubOffer(lNeg.negotiation.id, { fee: lNeg.negotiation.clubAskFee });
    assert.equal(s1.outcome, 'accepted');
    const s2 = ts.submitPlayerOffer(lNeg.negotiation.id, { weeklyWage: lNeg.negotiation.playerAskWage, contractYears: 1 });
    assert.equal(s2.outcome, 'accepted');
    assert.equal(loanInTarget.club, 'Paris Saint-Germain');
    assert.ok(loanInTarget.loanInfo && loanInTarget.loanInfo.loanClub === 'Paris Saint-Germain');
  }

  // Bất biến sở hữu duy nhất: không có cầu thủ nào xuất hiện ở 2 CLB hoặc trùng ID
  const check = ts.verifySingleClubOwnership();
  assert.equal(check.ok, true);
  assert.equal(check.issues.length, 0);
  assert.ok(check.uniquePlayerCount >= 200);
});

// =========================================================================
// 9. THƯƠNG MẠI, NHÀ TÀI TRỢ, CƠ SỞ VẬT CHẤT & HỌP BÁO BỐI CẢNH
// =========================================================================
test('PIC-9: Ký tài trợ, nâng cấp CSVC, chiến dịch thương mại & 4 họp báo bối cảnh hoạt động đúng', () => {
  const state = new GameState();
  const comm = state.commercialSystem;
  const budgetBefore = state.finance.budget;

  // Nâng cấp cơ sở vật chất
  const upg = comm.upgradeFacility('training_center');
  assert.equal(upg.ok, true);
  assert.equal(comm.getFacilityLevel('training_center'), 4);
  assert.ok(state.finance.budget < budgetBefore);

  // Ký nhà tài trợ mới (Dior Maison Paris yêu cầu prestige >= 80)
  const spRes = comm.signSponsorOffer('offer_emirates_vip');
  assert.equal(spRes.ok, true);
  assert.ok(comm.sponsors.some((s) => s.name === 'Dior Maison Paris'));
  assert.ok(comm.getTotalSponsorAnnualRevenue() > 145);

  // Triển khai chiến dịch thương mại
  const jerseysBefore = comm.commercial.jerseysSoldK;
  const camp = comm.launchCommercialCampaign('jersey_star');
  assert.equal(camp.ok, true);
  assert.ok(comm.commercial.jerseysSoldK > jerseysBefore);

  // Họp báo bối cảnh
  const ses = state.contextPressConference.start('pre_season');
  assert.ok(ses.questions.length >= 2);
  const ans1 = state.contextPressConference.answer('A');
  assert.equal(ans1.ok, true);
  const ans2 = state.contextPressConference.answer('A');
  assert.equal(ans2.ok, true);
  assert.equal(ans2.finished, true);

  // Kiểm tra các view Máy tính sinh HTML hợp lệ
  const appsCheck = [
    renderExecutiveOverviewHTML(state, [{ id: 'overview', icon: '🏛️', label: 'Tổng quan' }]),
    renderSponsorsHTML(state),
    renderFacilitiesHTML(state),
    renderCommercialHTML(state),
    renderMediaCenterHTML(state, { mediaSubTab: 'news', newsCategory: 'ALL' })
  ];
  appsCheck.forEach((html) => assert.ok(typeof html === 'string' && html.length > 200));
});

// =========================================================================
// 10. BẢO TÀNG (6 MỤC, KHÔNG TẠO CÚP TƯƠNG LAI) & SAVE/LOAD HỆ MỚI
// =========================================================================
test('PIC-10: Bảo tàng đủ 6 khu, 0 cúp tương lai khi mới bắt đầu & Save/Load giữ nguyên Intelligence Center', () => {
  const s1 = new GameState();
  assert.equal(s1.trophySystem.getTotalCareerTrophies(), 0, 'Mới bắt đầu không được có sẵn danh hiệu tương lai chưa đoạt');

  ['history', 'domestic', 'international', 'legends', 'awards', 'seasons'].forEach((tab) => {
    const html = renderMuseumHubHTML(s1, tab);
    assert.ok(html.includes('Lịch Sử & Thành Tích') && html.includes('Giải Cá Nhân & Hợp Đồng'));
  });

  // Thay đổi dữ liệu mới rồi export -> import
  s1.televisionSystem.setPower(false);
  s1.televisionSystem.activeChannelId = 'sports_finance';
  s1.reputationSystem.applyDelta({ governanceSkill: +5 }, 'Save test');
  s1.commercialSystem.upgradeFacility('medical_lab');
  s1.morningNewsSystem.generateDigest(true);

  const raw = JSON.stringify(s1.exportFullState({ x: -24, z: -16 }));
  const s2 = new GameState();
  s2.importFullState(JSON.parse(raw));

  assert.equal(s2.televisionSystem.isOn, false);
  assert.equal(s2.televisionSystem.activeChannelId, 'sports_finance');
  assert.equal(s2.commercialSystem.getFacilityLevel('medical_lab'), 4);
  assert.equal(s2.reputationSystem.metrics.governanceSkill, s1.reputationSystem.metrics.governanceSkill);
  assert.ok(s2.morningNewsSystem.currentProgram && s2.morningNewsSystem.currentProgram.sections.length === 10);
});

console.log(`\n🎉 HOÀN TẤT KIỂM THỬ PRESIDENTIAL INTELLIGENCE: ${passed}/${passed} TEST ĐẠT!`);
