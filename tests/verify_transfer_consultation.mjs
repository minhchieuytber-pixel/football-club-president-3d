// tests/verify_transfer_consultation.mjs
// Bộ kiểm thử toàn diện HỆ THỐNG THAM VẤN CÁC BỘ PHẬN KHI NHẬN ĐỀ NGHỊ CHUYỂN NHƯỢNG CẦU THỦ
// Bao gồm đầy đủ 12 tình huống nghiệp vụ bắt buộc, kiểm thử UI/DOM, GK Coach có điều kiện, và Save/Load.

import assert from 'node:assert/strict';
import { GameState } from '../src/club/GameState.js';
import {
  SD_RECOMMENDATIONS,
  COACH_RECOMMENDATIONS,
  CONSULTATION_DECISIONS
} from '../src/transfers/TransferConsultationSystem.js';
import { renderTransferMarketHTML } from '../src/ui/TransferMarketView.js';
import { renderApprovalsQueueHTML, renderContractsNegotiationHTML } from '../src/ui/ComputerAppsView.js';

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

function makeBid(state, player, opts = {}) {
  const mv = player.valuation?.current ?? player.value ?? 30;
  const fee = opts.fee ?? Math.round(mv * 1.1);
  const bid = {
    id: opts.id || `bid_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    date: '15/08/2025',
    buyerClub: opts.buyerClub || 'Bayern Munich',
    buyerStrategy: opts.buyerStrategy || 'Cạnh tranh danh hiệu châu Âu',
    dealType: opts.dealType || 'buy',
    playerId: player.id,
    playerName: player.name,
    position: player.position,
    ovr: player.ovr,
    fee,
    askingPrice: opts.askingPrice ?? Math.round(mv * 1.18),
    buyOptionFee: opts.buyOptionFee ?? (opts.dealType === 'loan' ? Math.round(mv * 0.95) : 0),
    clauses: opts.clauses || { sellOnPct: 10, bonusFee: 4, paymentTerms: '65% trả trước + 35% trả góp', extraNotes: [] },
    deadlineWeek: opts.deadlineWeek ?? ((state.week || 1) + 2),
    deadlineDate: `Cuối Tuần ${(opts.deadlineWeek ?? ((state.week || 1) + 2))}`,
    rounds: opts.rounds || 0,
    status: 'pending'
  };
  state.transferSystem.incomingBids.unshift(bid);
  return bid;
}

function createFreshState() {
  const state = new GameState();
  state.transferSystem.incomingBids = [];
  return state;
}

// ---------------------------------------------------------------------------
// 1. Đề nghị mua cầu thủ dự bị
// ---------------------------------------------------------------------------
test('1. Tham vấn đề nghị mua cầu thủ dự bị / xoay tua', () => {
  const state = createFreshState();
  const starters = new Set(state.formationSystem.starterIds);
  const benchPlayer = state.getPsgSquad().find((p) => !starters.has(p.id) && p.position !== 'GK' && p.ovr <= 82)
    || state.getPsgSquad().find((p) => !starters.has(p.id) && p.position !== 'GK');
  assert(benchPlayer, 'Phải tìm được cầu thủ dự bị trong đội hình PSG');

  const mv = benchPlayer.valuation?.current ?? benchPlayer.value;
  const bid = makeBid(state, benchPlayer, { fee: Math.round(mv * 1.25), buyerClub: 'AC Milan' });
  const res = state.transferConsultationSystem.consultOffer(bid.id);
  assert.equal(res.ok, true);
  assert.equal(res.consultation.playerSummary.isStarter, false);
  // Mở tham vấn tuyệt đối không tự chấp nhận hay tự từ chối
  assert.equal(state.transferSystem.incomingBids.some((b) => b.id === bid.id), true);
  assert.equal(res.consultation.finalDecision, null);
  assert(res.consultation.summaryTable.length === 5, 'Cầu thủ thường có đúng 5 bộ phận tham gia (không có HLV thủ môn)');
});

// ---------------------------------------------------------------------------
// 2. Đề nghị mua cầu thủ đá chính / ngôi sao
// ---------------------------------------------------------------------------
test('2. Tham vấn đề nghị mua cầu thủ đá chính quan trọng', () => {
  const state = createFreshState();
  state.week = 12;
  const starterId = state.formationSystem.starterIds.find((id) => {
    const pl = state.getPlayerById(id);
    return pl && pl.position !== 'GK' && pl.ovr >= 85;
  }) || state.formationSystem.starterIds[1];
  const star = state.getPlayerById(starterId);
  assert(star);

  const mv = star.valuation?.current ?? star.value;
  const bid = makeBid(state, star, { fee: mv, buyerClub: 'Real Madrid' });
  const res = state.transferConsultationSystem.consultOffer(bid.id);
  assert.equal(res.ok, true);
  const hc = res.consultation.opinions.find((o) => o.roleKey === 'head_coach');
  assert(
    [COACH_RECOMMENDATIONS.DISAGREE_SELL, COACH_RECOMMENDATIONS.SELL_END_OF_SEASON, COACH_RECOMMENDATIONS.AGREE_WITH_REPLACEMENT].includes(hc.recommendation),
    `HLV trưởng không thể dễ dàng đồng ý bán thẳng trụ cột giữa mùa (nhận: ${hc.recommendation})`
  );
});

// ---------------------------------------------------------------------------
// 3. Đề nghị giá thấp hơn giá trị thị trường
// ---------------------------------------------------------------------------
test('3. Đề nghị giá thấp hơn giá thị trường -> GĐ Thể thao phản đối bán rẻ', () => {
  const state = createFreshState();
  const star = state.getPsgSquad().find((p) => p.position !== 'GK' && p.ovr >= 85);
  const mv = star.valuation?.current ?? star.value;
  const lowFee = Math.max(5, Math.round(mv * 0.65));
  const bid = makeBid(state, star, { fee: lowFee, buyerClub: 'Arsenal' });

  const res = state.transferConsultationSystem.consultOffer(bid.id);
  assert.equal(res.ok, true);
  const sd = res.consultation.opinions.find((o) => o.roleKey === 'sporting_director');
  assert(
    [SD_RECOMMENDATIONS.NEVER_SELL_NOW, SD_RECOMMENDATIONS.KEEP, SD_RECOMMENDATIONS.SELL_HIGHER].includes(sd.recommendation),
    `GĐ Thể thao phải phản đối/đòi tăng giá khi đề nghị thấp hơn thị trường (nhận: ${sd.recommendation})`
  );
  assert(sd.quote.includes(`${lowFee}`) || sd.quote.includes(`${mv}`), 'Nhận định phải gắn với số liệu giá thực');
});

// ---------------------------------------------------------------------------
// 4. Đề nghị giá rất cao
// ---------------------------------------------------------------------------
test('4. Đề nghị giá rất cao -> GĐ Thể thao đánh giá tích cực tài chính', () => {
  const state = createFreshState();
  const starters = new Set(state.formationSystem.starterIds);
  const target = state.getPsgSquad().find((p) => !starters.has(p.id) && p.position !== 'GK') || state.getPsgSquad()[5];
  target.contractYears = 1;
  target.age = 29;
  const mv = target.valuation?.current ?? target.value;
  const highFee = Math.round(mv * 1.48);
  const bid = makeBid(state, target, { fee: highFee, buyerClub: 'Manchester City' });

  const res = state.transferConsultationSystem.consultOffer(bid.id);
  assert.equal(res.ok, true);
  const sd = res.consultation.opinions.find((o) => o.roleKey === 'sporting_director');
  assert(
    [SD_RECOMMENDATIONS.SELL, SD_RECOMMENDATIONS.SELL_WITH_REPLACEMENT].includes(sd.recommendation),
    `GĐ Thể thao phải khuyến nghị bán khi giá rất cao (nhận: ${sd.recommendation})`
  );
});

// ---------------------------------------------------------------------------
// 5. Cầu thủ muốn rời đi
// ---------------------------------------------------------------------------
test('5. Cầu thủ muốn rời đi -> HLV & GĐ Thể thao ghi nhận áp lực tâm lý', () => {
  const state = createFreshState();
  const starters = new Set(state.formationSystem.starterIds);
  const pLeave = state.getPsgSquad().find((p) => !starters.has(p.id) && p.position !== 'GK');
  const relLeave = state.relationshipSystem.ensurePlayerProfile(pLeave.id);
  relLeave.wantsToLeave = true;
  relLeave.mood = 'Bất mãn';
  relLeave.satisfaction = 32;

  const bidLeave = makeBid(state, pLeave, { fee: Math.round((pLeave.valuation?.current ?? pLeave.value) * 1.05) });
  const cLeave = state.transferConsultationSystem.consultOffer(bidLeave.id).consultation;
  const hcLeave = cLeave.opinions.find((o) => o.roleKey === 'head_coach');

  assert.equal(cLeave.playerSummary.wantsToLeave, true);
  assert.equal(hcLeave.recommendation, COACH_RECOMMENDATIONS.AGREE_SELL);
  assert(hcLeave.quote.includes('muốn đi') || hcLeave.factors.some((f) => f.includes('muốn ra đi')));
});

// ---------------------------------------------------------------------------
// 6. Cầu thủ hài lòng muốn ở lại
// ---------------------------------------------------------------------------
test('6. Cầu thủ hài lòng muốn ở lại -> HLV đánh giá cao sự gắn bó', () => {
  const state = createFreshState();
  const starters = new Set(state.formationSystem.starterIds);
  const pStay = state.getPsgSquad().find((p) => starters.has(p.id) && p.position !== 'GK' && p.ovr >= 85);
  const relStay = state.relationshipSystem.ensurePlayerProfile(pStay.id);
  relStay.wantsToLeave = false;
  relStay.mood = 'Hài lòng';
  relStay.satisfaction = 92;

  const bidStay = makeBid(state, pStay, { fee: Math.round((pStay.valuation?.current ?? pStay.value) * 1.05) });
  const cStay = state.transferConsultationSystem.consultOffer(bidStay.id).consultation;
  const hcStay = cStay.opinions.find((o) => o.roleKey === 'head_coach');

  assert.equal(cStay.playerSummary.wantsToLeave, false);
  assert.notEqual(hcStay.recommendation, COACH_RECOMMENDATIONS.AGREE_SELL);
  assert(hcStay.factors.some((f) => f.includes('gắn bó')));
});

// ---------------------------------------------------------------------------
// 7. HLV trưởng đồng ý bán nhưng Giám đốc thể thao phản đối (giá bèo / cầu thủ đòi đi còn HĐ dài)
// ---------------------------------------------------------------------------
test('7. HLV trưởng đồng ý bán nhưng GĐ Thể thao phản đối vì giá chưa đạt / tiềm năng bán cao hơn', () => {
  const state = createFreshState();
  const starters = new Set(state.formationSystem.starterIds);
  const youngBench = state.getPsgSquad().find((p) => !starters.has(p.id) && p.position !== 'GK') || state.getPsgSquad()[12];
  youngBench.age = 20;
  youngBench.ovr = 79;
  youngBench.pot = 89;
  youngBench.contractYears = 4;
  youngBench.value = 40;
  if (youngBench.valuation) youngBench.valuation.current = 40;
  const rel = state.relationshipSystem.ensurePlayerProfile(youngBench.id);
  rel.wantsToLeave = true;
  rel.mood = 'Bất mãn';

  // Đề nghị rất thấp (26M vs giá trị 40M)
  const bid = makeBid(state, youngBench, { fee: 26, buyerClub: 'Borussia Dortmund' });
  const cons = state.transferConsultationSystem.consultOffer(bid.id).consultation;

  const hc = cons.opinions.find((o) => o.roleKey === 'head_coach');
  const sd = cons.opinions.find((o) => o.roleKey === 'sporting_director');

  assert.equal(hc.recommendation, COACH_RECOMMENDATIONS.AGREE_SELL);
  assert(
    [SD_RECOMMENDATIONS.SELL_HIGHER, SD_RECOMMENDATIONS.KEEP, SD_RECOMMENDATIONS.NEVER_SELL_NOW].includes(sd.recommendation),
    `GĐ Thể thao không thể đồng ý bán rẻ tài năng trẻ (nhận: ${sd.recommendation})`
  );
  assert.equal(cons.conclusion.divergenceType, 'coach_sell_sd_hold');
});

// ---------------------------------------------------------------------------
// 8. HLV trưởng phản đối bán nhưng Giám đốc thể thao đồng ý bán (giá rất cao cho trụ cột giữa mùa)
// ---------------------------------------------------------------------------
test('8. HLV trưởng phản đối bán nhưng GĐ Thể thao đồng ý bán (bất đồng chiến lược)', () => {
  const state = createFreshState();
  state.week = 14;
  // Chọn vị trí ít người dự phòng hoặc chỉnh chênh lệch OVR dự phòng để HLV bảo vệ tối đa
  const vitalId = state.formationSystem.starterIds.find((id) => {
    const p = state.getPlayerById(id);
    return p && p.position !== 'GK';
  });
  const vital = state.getPlayerById(vitalId);
  vital.ovr = 89;
  vital.age = 29;
  vital.contractYears = 1;
  vital.wage = 220;
  vital.value = 60;
  if (vital.valuation) vital.valuation.current = 60;
  const rel = state.relationshipSystem.ensurePlayerProfile(vital.id);
  rel.wantsToLeave = false;

  // Xóa tạm các đồng đội cùng vị trí khác khỏi PSG trong kịch bản này để tạo áp lực thiếu người thay thế cho HLV
  const othersSamePos = state.getPsgSquad().filter((x) => x.id !== vital.id && x.position === vital.position);
  othersSamePos.forEach((x) => { x.ovr = 72; });

  const bid = makeBid(state, vital, { fee: 95, buyerClub: 'Chelsea' }); // 95M vs 60M (+58%)
  const cons = state.transferConsultationSystem.consultOffer(bid.id).consultation;

  const hc = cons.opinions.find((o) => o.roleKey === 'head_coach');
  const sd = cons.opinions.find((o) => o.roleKey === 'sporting_director');

  assert([SD_RECOMMENDATIONS.SELL, SD_RECOMMENDATIONS.SELL_WITH_REPLACEMENT].includes(sd.recommendation));
  assert([COACH_RECOMMENDATIONS.DISAGREE_SELL, COACH_RECOMMENDATIONS.SELL_END_OF_SEASON].includes(hc.recommendation));
  assert(cons.opinions.length === 5);
});

// ---------------------------------------------------------------------------
// 9. Các trợ lý HLV có góc nhìn khác nhau & câu trả lời hỏi thêm dùng dữ liệu thật
// ---------------------------------------------------------------------------
test('9. Các trợ lý có góc nhìn riêng & tính năng Hỏi thêm hoạt động với dữ liệu thật', () => {
  const state = createFreshState();
  const starter = state.getPlayerById(state.formationSystem.starterIds.find((id) => state.getPlayerById(id)?.position !== 'GK'));
  starter.health = { fitness: 64, fatigue: 42 };
  starter.career.injuryHistory = [{ type: 'Cơ đùi' }, { type: 'Mắt cá' }, { type: 'Gân kheo' }];
  const bid = makeBid(state, starter, { fee: Math.round((starter.valuation?.current ?? starter.value) * 1.15) });

  const cons = state.transferConsultationSystem.consultOffer(bid.id).consultation;
  const tac = cons.opinions.find((o) => o.roleKey === 'tactical_coach');
  const fit = cons.opinions.find((o) => o.roleKey === 'fitness_coach');
  const dev = cons.opinions.find((o) => o.roleKey === 'development_coach');

  assert(tac && fit && dev);
  assert.notEqual(tac.quote, fit.quote);
  assert.notEqual(fit.quote, dev.quote);
  assert(fit.quote.includes('quá tải') || fit.quote.includes('chấn thương') || fit.factors.some((f) => f.includes('64%')));

  const qa1 = state.transferConsultationSystem.askFollowUp(
    cons.consultationId,
    'head_coach',
    'Nếu bán cầu thủ này, đội sẽ vận hành chiến thuật thế nào?'
  );
  assert.equal(qa1.ok, true);
  assert(qa1.entry.answer.includes(starter.name));

  const qa2 = state.transferConsultationSystem.askFollowUp(
    cons.consultationId,
    'sporting_director',
    'Có thể bán với mức giá cao hơn vào mùa hè không?'
  );
  assert.equal(qa2.ok, true);
  assert(qa2.entry.answer.includes('€'));
  assert.equal(cons.followUps.length, 2);
});

// ---------------------------------------------------------------------------
// 10. Thủ môn (có HLV thủ môn) vs Cầu thủ thường (ẩn HLV thủ môn) + Quyết định trái số đông
// ---------------------------------------------------------------------------
test('10. GK Coach chỉ xuất hiện với Thủ môn & Chủ tịch quyết định trái ý kiến HLV có hậu quả quan hệ', () => {
  const state = createFreshState();
  const gk = state.getPsgSquad().find((p) => p.position === 'GK' && state.formationSystem.starterIds.includes(p.id))
    || state.getPsgSquad().find((p) => p.position === 'GK');
  assert(gk, 'Phải có thủ môn PSG');

  const outfield = state.getPsgSquad().find((p) => p.position !== 'GK' && state.formationSystem.starterIds.includes(p.id));
  const bidOut = makeBid(state, outfield, { fee: Math.round((outfield.valuation?.current ?? outfield.value) * 1.2) });
  const consOut = state.transferConsultationSystem.consultOffer(bidOut.id).consultation;
  assert.equal(consOut.opinions.some((o) => o.roleKey === 'gk_coach'), false, 'Cầu thủ ngoài sân KHÔNG được hiện HLV Thủ môn');

  const bidGk = makeBid(state, gk, { fee: Math.round((gk.valuation?.current ?? gk.value) * 1.25), buyerClub: 'Bayern Munich' });
  const consGk = state.transferConsultationSystem.consultOffer(bidGk.id).consultation;
  assert.equal(consGk.opinions.some((o) => o.roleKey === 'gk_coach'), true, 'Thủ môn BẮT BUỘC có đánh giá của HLV Thủ môn');

  // Chủ tịch vẫn có quyền bán thủ môn dù HLV trưởng & HLV thủ môn phản đối
  const trustBefore = state.relationshipSystem.chairmanCoachTrust;
  const hcGk = consGk.opinions.find((o) => o.roleKey === 'head_coach');
  hcGk.recommendation = COACH_RECOMMENDATIONS.DISAGREE_SELL; // Đảm bảo kịch bản trái ý kiến HLV
  const execRes = state.transferConsultationSystem.executeDecision(consGk.consultationId, CONSULTATION_DECISIONS.ACCEPT);
  assert.equal(execRes.ok, true, 'Chủ tịch phải thực thi được quyết định bán dù trái ý kiến đa số');
  assert.equal(state.getPlayerById(gk.id).club, 'Bayern Munich');
  assert(state.relationshipSystem.chairmanCoachTrust < trustBefore, 'Bán trụ cột trái ý kiến HLV phải làm giảm niềm tin HLV-Chủ tịch');
});

// ---------------------------------------------------------------------------
// 11. Offer thay đổi sau khi tham vấn -> phát hiện dữ liệu cũ & đánh giá lại
// ---------------------------------------------------------------------------
test('11. Đề nghị thay đổi đáng kể sau khi tham vấn -> cảnh báo cũ & đánh giá lại thành công', () => {
  const state = createFreshState();
  const player = state.getPsgSquad().find((p) => p.position !== 'GK' && p.ovr >= 82);
  const mv = player.valuation?.current ?? player.value;
  const bid = makeBid(state, player, { fee: Math.round(mv * 0.72), buyerClub: 'Liverpool' });

  const r1 = state.transferConsultationSystem.consultOffer(bid.id);
  assert.equal(r1.ok, true);
  assert.equal(r1.stale, false);
  const oldConsId = r1.consultation.consultationId;

  // Đối tác nâng giá mạnh từ 72% lên 145% (thay đổi đáng kể)
  bid.fee = Math.round(mv * 1.45);
  const rCheck = state.transferConsultationSystem.consultOffer(bid.id);
  assert.equal(rCheck.stale, true, 'Phải phát hiện báo cáo cũ đã lỗi thời khi giá thay đổi >10%');

  const r2 = state.transferConsultationSystem.consultOffer(bid.id, { forceReevaluate: true });
  assert.equal(r2.stale, false);
  assert.notEqual(r2.consultation.consultationId, oldConsId);
  assert.equal(r2.consultation.offerSummary.fee, bid.fee);
  assert.equal(r2.consultation.version, 2);
});

// ---------------------------------------------------------------------------
// 12. Save / Load & Toàn bộ hành động phụ (Require Replacement, Clauses, Defer) + UI Render Check
// ---------------------------------------------------------------------------
test('12. Save/Load giữ nguyên lịch sử tham vấn không trùng lặp + kiểm tra UI & nút điều hướng', () => {
  const state = createFreshState();
  const p = state.getPsgSquad().find((x) => x.position !== 'GK');
  const bid = makeBid(state, p, { fee: Math.round((p.valuation?.current ?? p.value) * 1.1) });

  const res = state.transferConsultationSystem.consultOffer(bid.id);
  const consId = res.consultation.consultationId;
  state.transferConsultationSystem.askFollowUp(consId, 'sporting_director', 'Thị trường hiện có ứng viên nào thay thế phù hợp?');

  // Kiểm tra HTML render các điểm vào giao diện đều có nút THAM KHẢO Ý KIẾN CÁC BỘ PHẬN và giữ nút cũ
  const transferHtml = renderTransferMarketHTML(state, { transferSubTab: 'sell', transferFilters: {} });
  assert(transferHtml.includes('tr-consult-bid'), 'Tab Bán phải có nút Tham khảo ý kiến các bộ phận');
  assert(transferHtml.includes('tr-accept-bid') && transferHtml.includes('tr-reject-bid'), 'Phải giữ nguyên các nút xử lý hiện có');

  const contractsHtml = renderContractsNegotiationHTML(state);
  assert(contractsHtml.includes('ct-consult-bid'));

  const approvalsHtml = renderApprovalsQueueHTML(state);
  assert(approvalsHtml.includes('app-consult-bid'));

  // Kiểm tra hành động Yêu cầu tìm người thay thế trước khi bán (không tự bán cầu thủ!)
  const holdRes = state.transferConsultationSystem.executeDecision(consId, CONSULTATION_DECISIONS.REQUIRE_REPLACEMENT);
  assert.equal(holdRes.ok, true);
  assert.equal(state.getPlayerById(p.id).club, 'Paris Saint-Germain', 'Yêu cầu tìm người thay thế không được tự ý bán cầu thủ');
  assert.equal(bid.status, 'awaiting_replacement');

  // Kiểm tra yêu cầu bổ sung điều khoản
  const clauseRes = state.transferConsultationSystem.executeDecision(consId, CONSULTATION_DECISIONS.COUNTER_CLAUSES, { sellOnPct: 20, bonusFee: 6 });
  assert.equal(clauseRes.ok, true);
  assert(bid.clauses.sellOnPct >= 20 || bid.clauses.bonusFee >= 6);

  // Kiểm tra Save -> Load Round-Trip
  const exported = JSON.parse(JSON.stringify(state.exportFullState()));
  const restored = new GameState();
  restored.importFullState(exported);

  assert.equal(restored.transferConsultationSystem.consultations.length, 1, 'Không được nhân đôi bản ghi tham vấn khi load');
  const restoredCons = restored.transferConsultationSystem.getConsultationById(consId);
  assert(restoredCons, 'Phải khôi phục đúng consultationId sau Save/Load');
  assert.equal(restoredCons.followUps.length, 1);
  assert.equal(restored.transferConsultationSystem.replacementWatchlist.length, 1);

  // Kiểm tra Tạm hoãn quyết định
  const deferRes = restored.transferConsultationSystem.executeDecision(consId, CONSULTATION_DECISIONS.DEFER);
  assert.equal(deferRes.ok, true);
  const reloadedBid = restored.transferSystem.incomingBids.find((b) => b.id === bid.id);
  assert.equal(reloadedBid.status, 'deferred');
});

console.log(`\n🎉 TỔNG KẾT TRANSFER CONSULTATION VERIFICATION: ${passed}/12 bộ kiểm thử PASSED!`);
if (process.exitCode && process.exitCode !== 0) process.exit(process.exitCode);
