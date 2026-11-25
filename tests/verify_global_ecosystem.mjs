// tests/verify_global_ecosystem.mjs
// Bộ kiểm thử toàn diện Hệ thống AI Đối thủ – Thị trường Chuyển nhượng – Tài chính Toàn cầu – Định giá Cầu thủ
import assert from 'node:assert/strict';

globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.localStorage = globalThis.localStorage || (() => {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); }
  };
})();

import { GameState } from '../src/club/GameState.js';
import { SaveManager } from '../src/save/SaveManager.js';
import { renderMarketValueCenterHTML } from '../src/ui/MarketValueCenterView.js';
import { renderPlayerProfileHTML } from '../src/ui/PlayerProfileView.js';
import { renderTransferMarketHTML } from '../src/ui/TransferMarketView.js';
import { renderLeaguesComputerTabHTML } from '../src/ui/MatchdayView.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err);
    process.exitCode = 1;
  }
}

function advanceThroughCurrentMatchIfNeeded(state) {
  const fx = state.getCurrentWeekFixture();
  if (fx && !fx.played) {
    state.runAutomaticMatchday('none');
  }
}

// 1. Khởi tạo & bảo toàn cấu trúc Tài chính PSG + Tài chính Toàn cầu cho mọi CLB
test('1. Preserve PSG finance structure & initialize global club finance/coach profiles', () => {
  const state = new GameState();
  const f = state.finance;
  assert.ok(typeof f.budget === 'number' && f.budget > 0, 'budget phải tồn tại');
  assert.ok(typeof f.transferBudget === 'number', 'transferBudget phải tồn tại');
  assert.ok(typeof f.weeklyWages === 'number', 'weeklyWages phải tồn tại');
  assert.ok(Array.isArray(f.ledger), 'ledger phải là mảng');
  assert.ok(typeof f.cash === 'number' && Math.abs(f.cash - f.budget) < 0.01, 'cash đồng bộ với budget');
  assert.ok(Array.isArray(f.receivables) && Array.isArray(f.payables), 'receivables/payables phải tồn tại');
  assert.ok(f.periodReports && typeof f.periodReports.seasonIn === 'number', 'periodReports phải tồn tại');

  assert.ok(state.clubs.length >= 25, 'Có đầy đủ CLB Châu Âu');
  state.clubs.forEach((c) => {
    assert.ok(['giant', 'contender', 'developer'].includes(c.tier), `${c.name} thiếu tier hợp lệ`);
    assert.ok(c.finance && typeof c.finance.cash === 'number', `${c.name} thiếu finance.cash`);
    assert.ok(c.finance && typeof c.finance.transferBudget === 'number', `${c.name} thiếu finance.transferBudget`);
    assert.ok(c.coachProfile && typeof c.coachProfile.tacticalStyle === 'string', `${c.name} thiếu coachProfile`);
  });
});

// 2. Bất biến 1 cầu thủ chỉ thuộc 1 CLB + Idempotency tài chính + Trả góp (Receivables/Payables)
test('2. Single playerId ownership invariant, transaction idempotency, and installment settlement', () => {
  const state = new GameState();
  const ownCheck = state.transferSystem.verifySingleClubOwnership();
  assert.equal(ownCheck.ok, true, 'Không có cầu thủ trùng sở hữu lúc khởi tạo');
  assert.ok(ownCheck.uniquePlayerCount >= 200, `Quy mô cầu thủ toàn cầu >= 200 (hiện có ${ownCheck.uniquePlayerCount})`);

  const cashBefore = state.finance.cash;
  const r1 = state.recordFinanceTransaction({ txKey: 'idem_test_001', desc: 'Test Idempotency', amount: 12.5 });
  const r2 = state.recordFinanceTransaction({ txKey: 'idem_test_001', desc: 'Test Idempotency Duplicate', amount: 12.5 });
  assert.equal(r1.ok, true);
  assert.equal(r2.duplicate, true, 'Giao dịch trùng txKey phải bị chặn');
  assert.equal(state.finance.cash, +(cashBefore + 12.5).toFixed(2), 'Tiền chỉ được cộng đúng 1 lần');

  // Test trả góp (payables & receivables) đến hạn
  state.finance.receivables.push({
    id: 'test_rcv_1',
    counterparty: 'Real Madrid',
    desc: 'Bán cầu thủ Test',
    totalAmount: 10,
    remaining: 10,
    perInstallment: 5,
    installmentsLeft: 2,
    dueIntervalWeeks: 1,
    nextDueWeek: state.week
  });
  state.finance.payables.push({
    id: 'test_pay_1',
    counterparty: 'Arsenal',
    desc: 'Mua cầu thủ Test',
    totalAmount: 6,
    remaining: 6,
    perInstallment: 3,
    installmentsLeft: 2,
    dueIntervalWeeks: 1,
    nextDueWeek: state.week
  });
  const cashPreInst = state.finance.cash;
  state.processDueInstallments();
  assert.equal(state.finance.cash, +(cashPreInst + 5 - 3).toFixed(2), 'Thu +5M và trả -3M trả góp đúng hạn');
  assert.equal(state.finance.receivables[0].remaining, 5);
  assert.equal(state.finance.payables[0].remaining, 3);
});

// 3. Weekly Player Valuation CHỈ chạy đúng 1 lần mỗi tuần mới trên NEXT (advanceWeek), không chạy khi xem/trận/ngày
test('3. Dynamic Market Value updates ONLY once per week on advanceWeek (NEXT), never on match/daily ticks/loads', () => {
  const state = new GameState();
  const vs = state.valuationSystem;
  const star = state.getPsgSquad().find((p) => p.ovr >= 85) || state.getPsgSquad()[0];
  const initialVal = star.value;

  // Tick thời gian ngày không được làm đổi giá
  state.timeSystem.tick(30); // 30s thực -> ~48 phút game
  assert.equal(star.value, initialVal, 'Tick thời gian trong tuần không làm đổi giá thị trường');

  // Mô phỏng trận đấu không làm đổi giá trực tiếp (chờ tuần mới NEXT)
  const fx = state.getCurrentWeekFixture();
  if (fx && !fx.played) {
    state.runAutomaticMatchday('none');
  }
  assert.equal(star.value, initialVal, 'Kết thúc trận đấu trong tuần không làm nhảy giá tức thì');

  // Render UI hồ sơ / toggle range không làm đổi giá
  renderPlayerProfileHTML(star, 'overview', true, null, '4w');
  renderPlayerProfileHTML(star, 'overview', true, null, '52w');
  assert.equal(star.value, initialVal, 'Mở hồ sơ cầu thủ không kích hoạt định giá lại');

  // Gọi trực tiếp runWeeklyValuation lần 1 rồi lần 2 trong cùng week/periodId
  const pId = vs.getCurrentPeriodId();
  vs.runWeeklyValuation();
  const resDup = vs.runWeeklyValuation();
  assert.equal(resDup.duplicate, true, `Không được định giá lặp lại trong cùng tuần ${pId}`);
  assert.equal(resDup.ran, false);

  // Bây giờ bấm NEXT qua tuần 2
  advanceThroughCurrentMatchIfNeeded(state);
  star.goals += 4;
  star.form = 94;
  const wkRes = state.advanceWeek();
  assert.equal(wkRes.blocked, false);
  assert.ok(wkRes.valuationReport && wkRes.valuationReport.week === state.week, 'advanceWeek phải trả về valuationReport tuần mới');
  assert.ok(star.valuation.history.length >= 2, 'Lịch sử biểu đồ giá phải ghi nhận thêm mốc tuần mới');
  assert.ok(
    state.phoneInbox.some((m) => m.actionType === 'open_market_value'),
    'Thông báo WEEKLY PLAYER VALUATION phải xuất hiện trong hộp thư với actionType open_market_value'
  );

  // Tách biệt Market Value và Asking Price
  const ask = vs.computeAskingPrice(star);
  assert.ok(typeof ask === 'number' && ask > 0);
  assert.notEqual(ask, star.valuation.current, 'Asking Price phải tính độc lập với Market Value');
});

// 4. Hành vi phản ứng giá theo Phong độ/Bàn thắng, Chấn thương, Tuổi tác, Tiềm năng & Hợp đồng
test('4. Valuation responds realistically to form/goals, injury, age>=32 decline, youth POT & contract', () => {
  const state = new GameState();

  // Cầu thủ trẻ tiềm năng ghi bàn & phong độ cao
  const wonderkid = state.players.find((p) => p.age <= 21 && p.pot >= 86) || state.players[0];
  wonderkid.form = 95;
  wonderkid.goals += 5;
  wonderkid.assists += 3;
  wonderkid.injuryDays = 0;
  wonderkid.contractYears = 4;
  if (wonderkid.contract) wonderkid.contract.contractYears = 4;

  // Cầu thủ lớn tuổi chấn thương, hết hợp đồng
  const veteran = state.players.find((p) => p.id !== wonderkid.id && p.age >= 29) || state.players[1];
  veteran.age = 34;
  veteran.form = 52;
  veteran.injuryDays = 45;
  veteran.contractYears = 1;
  if (veteran.contract) veteran.contract.contractYears = 1;

  const wkBefore = wonderkid.value;
  const vetBefore = veteran.value;

  advanceThroughCurrentMatchIfNeeded(state);
  state.advanceWeek();

  assert.ok(wonderkid.valuation.current >= wkBefore, `Wonderkid phong độ cao phải giữ/tăng giá (${wkBefore} -> ${wonderkid.valuation.current})`);
  assert.ok(veteran.valuation.current <= vetBefore, `Cầu thủ 34t chấn thương & sắp hết HĐ phải giảm/không tăng (${vetBefore} -> ${veteran.valuation.current})`);
});

// 5. AI Quản lý CLB đối thủ: Mua/Bán/Mượn/Gia hạn/Đôn trẻ/Sa thải HLV & Giới hạn tài chính + Đa giải đấu
test('5. Rival AI clubs manage transfers, loans, renewals, youth, finances, managers & 6 European leagues', () => {
  const state = new GameState();
  const ai = state.globalClubAI;
  const startDeals = state.transferSystem.completedDeals.length;

  for (let w = 0; w < 6; w++) {
    advanceThroughCurrentMatchIfNeeded(state);
    const res = state.advanceWeek();
    assert.equal(res.blocked, false);
  }

  assert.ok(state.transferSystem.completedDeals.length > startDeals, 'Các CLB AI phải tự thực hiện chuyển nhượng qua các tuần');
  const own = state.transferSystem.verifySingleClubOwnership();
  assert.equal(own.ok, true, 'Sau 6 tuần AI chuyển nhượng, mỗi cầu thủ vẫn thuộc đúng 1 CLB');

  // Kiểm tra BXH 6 giải đấu Châu Âu đã được mô phỏng
  const multiLeagues = ['Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Primeira Liga', 'Eredivisie'];
  multiLeagues.forEach((lg) => {
    const tbl = ai.getLeagueTable(lg);
    assert.ok(tbl.length >= 2, `Giải ${lg} phải có CLB và được mô phỏng`);
    assert.ok(tbl.some((c) => c.played > 0), `Giải ${lg} phải có số trận đã đấu > 0`);
  });

  // Kiểm tra giới hạn tài chính AI (CLB hết tiền không được phép mua)
  const poorClub = state.clubs.find((c) => c.name !== 'Paris Saint-Germain');
  poorClub.finance.cash = 1;
  poorClub.finance.transferBudget = 1;
  assert.equal(ai.canClubAfford(poorClub, 45, 100), false, 'CLB AI thiếu tiền không thể chi €45M');

  // Kiểm tra sa thải HLV khi chuỗi thành tích bết bát
  const targetClub = state.clubs.find((c) => c.name !== 'Paris Saint-Germain' && c.league === 'Ligue 1');
  const oldCoach = targetClub.coachProfile.name;
  targetClub.played = 12;
  targetClub.won = 1;
  targetClub.drawn = 2;
  targetClub.lost = 9;
  targetClub.pts = 5;
  targetClub.boardConfidence = 18;
  ai._evaluateGlobalManagers([targetClub], state.week, state.seasonNum, true);
  assert.notEqual(targetClub.coachProfile.name, oldCoach, 'HLV CLB AI bết bát phải bị sa thải và thay thế');
});

// 6. Cạnh tranh đấu giá & PSG có thể THUA thương vụ nếu đãi ngộ kém hơn ông lớn khác + Strength Live
test('6. Bidding war competition lets PSG lose a signing if rival package is better, and updates live club power', () => {
  const state = new GameState();
  state.transferSystem.openWindow('summer');
  const target = state.players.find((p) => p.club !== 'Paris Saint-Germain' && p.ovr >= 84 && p.club !== 'Real Madrid');
  assert.ok(target, 'Phải có mục tiêu ngôi sao để kiểm thử cạnh tranh');

  const rival = state.clubs.find((c) => c.name === 'Real Madrid') || state.clubs.find((c) => c.tier === 'giant' && c.name !== 'Paris Saint-Germain');
  rival.finance.cash = 350;
  rival.finance.transferBudget = 250;
  rival.finance.wageBudget = 12.0;
  rival.finance.debt = 0;
  rival.finance.austerityMode = false;
  rival.budget = 250;

  // Giả lập PSG trả lương quá thấp & vai trò Dự bị trong khi đối thủ trả lương cao & Chủ lực
  const choice = state.globalClubAI.evaluatePlayerDestinationChoice(
    target,
    {
      weeklyWage: Math.round((target.wage || 80) * 0.5),
      askWage: target.wage || 80,
      squadRole: 'Dự bị',
      playtimeGuarantee: 'Thấp',
      signingBonus: 0
    },
    {
      rivalClub: rival,
      rivalWage: Math.round((target.wage || 80) * 1.5),
      rivalRole: 'Trụ cột không thể thay thế'
    }
  );

  assert.equal(choice.winner, rival.name, 'Khi PSG trả lương thấp & vai trò Dự bị, cầu thủ phải chọn đối thủ');
  const hijack = state.globalClubAI.completeRivalTransferHijack(target, rival, Math.round(target.value * 1.2), Math.round((target.wage || 80) * 1.5));
  assert.ok(hijack && hijack.to === rival.name, 'Đối thủ thắng đấu giá phải hoàn tất chiêu mộ cầu thủ');
  assert.equal(target.club, rival.name, 'Cầu thủ phải chuyển sang CLB đối thủ');

  // Kiểm tra sức mạnh CLB trong Matchday phản ánh squad rating & coachProfile
  const pwr = state.globalClubAI.getEffectiveClubPower(rival.name);
  assert.ok(pwr >= 70 && pwr <= 98, 'getEffectiveClubPower trả về giá trị thực tế');

  // Kiểm tra UCL winner không hardcode cứng Real Madrid nếu bị loại/yếu hơn
  state.clubs.forEach((c) => {
    if (c.name === 'Real Madrid') c.rating = 70;
  });
  const uclChamp = state.globalClubAI.resolveUclChampionIfPsgEliminated();
  assert.ok(uclChamp && uclChamp !== 'Real Madrid', `Nhà vô địch UCL mô phỏng động phải chọn đội mạnh thật sự (nhận: ${uclChamp})`);
});

// 7. Loan fee + Wage Split + Kết thúc mùa & Save/Load đầy đủ không mất dữ liệu
test('7. Loan fee & wage split, dynamic season rollover, Save/Load round-trip, and UI view renders', () => {
  const state = new GameState();
  state.transferSystem.openWindow('summer');
  const psgPlayer = state.getPsgSquad()[state.getPsgSquad().length - 1];
  const destClub = state.clubs.find((c) => c.name !== 'Paris Saint-Germain' && c.league === 'Ligue 1');
  destClub.finance.cash = 120;
  destClub.finance.transferBudget = 60;
  const cashBeforeLoan = state.finance.cash;

  const loanRes = state.transferSystem.loanOutPlayer(psgPlayer.id, destClub.name, psgPlayer.value + 5, {
    loanFee: 3.5,
    wageSplit: 70
  });
  assert.equal(loanRes.ok, true, 'Cho mượn có phí mượn & chia sẻ lương thành công');
  assert.ok(state.finance.cash >= cashBeforeLoan + 3.4, 'PSG nhận phí mượn thực €3.5M');
  assert.equal(psgPlayer.loanInfo.wageSplit, 70);

  // Kiểm tra Save/Load giữ nguyên tiền mặt, payables/receivables, club finances & player valuations
  const saveMgr = new SaveManager();
  const snap = state.exportFullState();
  const saved = saveMgr.saveAutoSync(snap);
  assert.equal(saved.ok, true);
  const loadedRec = saveMgr.loadAutoSync();
  assert.ok(loadedRec && loadedRec.data);

  const restored = new GameState();
  restored.importFullState(loadedRec.data);
  assert.equal(restored.finance.cash, state.finance.cash, 'Load game giữ nguyên tiền mặt PSG');
  assert.equal(restored.valuationSystem.lastValuationPeriodId, state.valuationSystem.lastValuationPeriodId, 'Load game không chạy lại valuation tuần hiện tại');
  const rClub = restored.clubs.find((c) => c.name === destClub.name);
  assert.ok(rClub.finance && typeof rClub.finance.cash === 'number', 'Load game giữ nguyên tài chính CLB đối thủ');

  // Kiểm tra render 4 giao diện HTML không lỗi runtime
  const mvHtml = renderMarketValueCenterHTML(restored, {
    valuationViewState: { category: 'top_valued', filters: { league: 'ALL', pos: 'ALL' }, page: 1 }
  });
  assert.ok(mvHtml.includes('TRUNG TÂM ĐỊNH GIÁ CẦU THỦ TOÀN CẦU'));
  const ppHtml = renderPlayerProfileHTML(restored.getPsgSquad()[0], 'overview', true, null, '12w');
  assert.ok(ppHtml.includes('<svg') && ppHtml.includes('data-vrange="52w"'));
  const tmHtml = renderTransferMarketHTML(restored, { transferSubTab: 'rumors', transferFilters: {} });
  assert.ok(tmHtml.includes('CLB (Hạng)') && tmHtml.includes('Cash'));
  const lgHtml = renderLeaguesComputerTabHTML(restored, 'Premier League');
  assert.ok(lgHtml.includes('lg-league-select') && lgHtml.includes('Premier League'));
});

console.log(`\n=== KẾT QUẢ KIỂM THỬ GLOBAL ECOSYSTEM: ${passed}/7 NHÓM PASS ===`);
