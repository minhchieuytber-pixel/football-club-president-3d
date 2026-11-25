// tests/verify_squad_formation_ai.mjs
// Bộ kiểm thử toàn diện 14 Test Cases cho Hệ thống Sơ đồ Chiến thuật Kéo Thả + AI Position Suitability Intelligence
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Minimal THREE & performance shims for headless Node test execution
class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  normalize() {
    const l = Math.hypot(this.x, this.y, this.z) || 1;
    this.x /= l; this.y /= l; this.z /= l; return this;
  }
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
  remove(o) { this.children = this.children.filter((x) => x !== o); }
  updateMatrix() {}
  traverse(fn) { fn(this); this.children.forEach((c) => c.traverse && c.traverse(fn)); }
}
class InstancedMeshMock extends Obj3D {
  constructor() { super(); this.instanceColor = { needsUpdate: false }; }
  setMatrixAt() {}
  setColorAt() {}
}
globalThis.THREE = {
  Vector3: Vec3,
  Group: Obj3D,
  Mesh: Obj3D,
  InstancedMesh: InstancedMeshMock,
  Color: class { constructor(c) { this.c = c; } },
  Object3D: Obj3D,
  HemisphereLight: Obj3D,
  DirectionalLight: class extends Obj3D { constructor() { super(); this.shadow = { mapSize: {} }; } },
  Fog: class {},
  Scene: Obj3D,
  BoxGeometry: class {},
  CylinderGeometry: class {},
  ConeGeometry: class {},
  SphereGeometry: class {},
  PlaneGeometry: class {},
  MeshStandardMaterial: class {},
  MeshBasicMaterial: class {}
};
globalThis.performance = globalThis.performance || { now: () => Date.now() };

import { GameState } from '../src/club/GameState.js';
import { CoachMatchAI } from '../src/matchday/CoachMatchAI.js';
import { renderFormationPitchTabHTML } from '../src/ui/FormationPitchView.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err?.stack || err?.message || err);
    process.exitCode = 1;
  }
}

function makeFreshState() {
  const gs = new GameState();
  return gs;
}

// ============================================================================
// TEST CASE 1: Đưa cầu thủ dự bị vào thay cầu thủ đá chính & bảo toàn ID
// ============================================================================
test('Case 1: Thay cầu thủ dự bị vào vị trí đá chính, không tạo bản sao, đồng bộ bench', () => {
  const gs = makeFreshState();
  const fs = gs.formationSystem;
  const before = fs.getFormationData();
  assert.equal(before.starters.length, 11);

  const availBench = before.bench.find((b) => b.availability === 'available');
  assert.ok(availBench, 'Phải có cầu thủ dự bị khả dụng');
  const targetSlot = 6; // DM
  const oldStarterId = before.starters[targetSlot].playerId;
  assert.notEqual(availBench.playerId, oldStarterId);

  const res = fs.swapStarter(targetSlot, availBench.playerId);
  assert.equal(res.ok, true);

  const after = fs.getFormationData();
  assert.equal(after.starters[targetSlot].playerId, availBench.playerId);
  assert.equal(after.starters.filter((s) => s.playerId === availBench.playerId).length, 1);

  const uniqueStarterIds = new Set(after.starters.map((s) => s.playerId));
  assert.equal(uniqueStarterIds.size, 11, '11 cầu thủ đá chính không được trùng ID');

  assert.ok(after.bench.some((b) => b.playerId === oldStarterId), 'Cầu thủ bị thay ra phải xuống danh sách dự bị');
  assert.ok(!after.bench.some((b) => b.playerId === availBench.playerId), 'Cầu thủ vừa vào đá chính không còn ở bench');
});

// ============================================================================
// TEST CASE 2: Hoán đổi 2 cầu thủ đá chính & kéo sang vùng trống/vai trò mới
// ============================================================================
test('Case 2: Hoán đổi RW <-> LW và kéo cầu thủ sang vùng trống CDM mà không đổi chỉ số gốc', () => {
  const gs = makeFreshState();
  const fs = gs.formationSystem;
  const before = fs.getFormationData();

  const lwSlot = before.slots.find((s) => s.role === 'LW');
  const rwSlot = before.slots.find((s) => s.role === 'RW');
  assert.ok(lwSlot && rwSlot);

  const lwPlayer = lwSlot.player;
  const rwPlayer = rwSlot.player;
  const origLwPos = lwPlayer.position;
  const origLwOvr = lwPlayer.ovr;

  // Hoán đổi LW <-> RW
  const swapRes = fs.moveStarterToSlot(lwSlot.slotIndex, rwSlot.slotIndex);
  assert.equal(swapRes.ok, true);
  assert.equal(swapRes.swapped, true);

  const mid = fs.getFormationData();
  assert.equal(mid.slots[rwSlot.slotIndex].playerId, lwPlayer.id);
  assert.equal(mid.slots[lwSlot.slotIndex].playerId, rwPlayer.id);

  // Bảo toàn vị trí sở trường và chỉ số gốc
  assert.equal(lwPlayer.position, origLwPos);
  assert.equal(lwPlayer.ovr, origLwOvr);

  // Kéo một cầu thủ sang vùng trống (slot trống sau khi benchStarter) + đổi vai trò vùng chiến thuật
  const benchOut = fs.benchStarter(5); // Để trống slot 5 (CM)
  assert.equal(benchOut.ok, true);
  const afterBench = fs.getFormationData({ fillEmpty: false });
  assert.equal(afterBench.slots[5].playerId, null);
  assert.equal(afterBench.emptySlots.length, 1);

  const moveEmpty = fs.moveStarterToSlot(rwSlot.slotIndex, 5);
  assert.equal(moveEmpty.ok, true);
  const afterMoveEmpty = fs.getFormationData({ fillEmpty: false });
  assert.equal(afterMoveEmpty.slots[5].playerId, lwPlayer.id);
  assert.equal(afterMoveEmpty.slots[rwSlot.slotIndex].playerId, null);

  // Kéo sang tọa độ & vai trò mới (ST -> AM)
  const zoneRes = fs.moveStarterToTacticalZone(5, 'CAM', 50, 35);
  assert.equal(zoneRes.ok, true);
  assert.equal(zoneRes.newRole, 'AM');
  assert.equal(lwPlayer.position, origLwPos, 'Không được tự động sửa vị trí gốc của cầu thủ');
});

// ============================================================================
// TEST CASE 3: Đặt tiền đạo (ST/LW) xuống đá tiền vệ (DM/CM) -> điểm giảm rõ rệt
// ============================================================================
test('Case 3: Đặt tiền đạo vào vị trí tiền vệ phòng ngự/trung tâm -> điểm giảm kèm giải thích', () => {
  const gs = makeFreshState();
  const ai = gs.formationSystem.suitabilityAI;
  const st = gs.getPsgSquad().find((p) => p.position === 'ST') || gs.getPsgSquad().find((p) => p.position === 'LW');
  assert.ok(st);

  const natEval = ai.evaluatePlayerAtPosition(st, st.position);
  const dmEval = ai.evaluatePlayerAtPosition(st, 'DM');
  assert.ok(natEval.score >= 90, `Sở trường phải >= 90, nhận ${natEval.score}`);
  assert.ok(dmEval.score < natEval.score - 20, `Đá DM điểm phải giảm rõ rệt (${dmEval.score} vs ${natEval.score})`);
  assert.ok(dmEval.weaknesses.length > 0, 'Phải có giải thích điểm yếu khi đá trái vị trí');
});

// ============================================================================
// TEST CASE 4: Đặt tiền vệ (CM/AM) xuống đá hậu vệ (CB) -> điểm giảm & cảnh báo thủ
// ============================================================================
test('Case 4: Đặt tiền vệ sáng tạo xuống đá Trung vệ (CB) -> điểm giảm & cảnh báo chỉ số phòng ngự', () => {
  const gs = makeFreshState();
  const ai = gs.formationSystem.suitabilityAI;
  const mid = gs.getPsgSquad().find((p) => p.name === 'Vitinha') || gs.getPsgSquad().find((p) => p.position === 'CM');
  assert.ok(mid);

  const cmEval = ai.evaluatePlayerAtPosition(mid, 'CM');
  const cbEval = ai.evaluatePlayerAtPosition(mid, 'CB');
  assert.ok(cmEval.score >= 90);
  assert.ok(cbEval.score < 72, `Tiền vệ đá CB điểm phải tụt xuống thấp, nhận ${cbEval.score}`);
  assert.ok(cbEval.weaknesses.some((w) => /Phòng ngự|Không chiến|Kèm người|Trái sở trường|Tranh chấp|Tắc bóng/i.test(w)));
});

// ============================================================================
// TEST CASE 5: Thủ môn đá tiền đạo & Cầu thủ sân ngoài bắt gôn -> < 49 (Rất không phù hợp)
// ============================================================================
test('Case 5: Thủ môn đá ST và Cầu thủ đá trên bắt GK -> điểm <= 49 (Rất không phù hợp)', () => {
  const gs = makeFreshState();
  const ai = gs.formationSystem.suitabilityAI;
  const gk = gs.getPsgSquad().find((p) => p.position === 'GK');
  const fw = gs.getPsgSquad().find((p) => p.position === 'ST' || p.position === 'RW');
  assert.ok(gk && fw);

  const gkAsSt = ai.evaluatePlayerAtPosition(gk, 'ST');
  const fwAsGk = ai.evaluatePlayerAtPosition(fw, 'GK');

  assert.ok(gkAsSt.score <= 49, `GK đá ST phải <= 49, nhận ${gkAsSt.score}`);
  assert.equal(gkAsSt.tier.label, 'Rất không phù hợp');

  assert.ok(fwAsGk.score <= 49, `Outfield bắt GK phải <= 49, nhận ${fwAsGk.score}`);
  assert.equal(fwAsGk.tier.label, 'Rất không phù hợp');
});

// ============================================================================
// TEST CASE 6: Cầu thủ đá đúng vị trí sở trường -> 90–100 (Rất phù hợp)
// ============================================================================
test('Case 6: Đúng sở trường (Donnarumma GK, Marquinhos CB, Vitinha CM, Dembélé RW) đạt 90-100', () => {
  const gs = makeFreshState();
  const ai = gs.formationSystem.suitabilityAI;
  const checks = [
    ['Gianluigi Donnarumma', 'GK'],
    ['Marquinhos', 'CB'],
    ['Vitinha', 'CM'],
    ['Ousmane Dembélé', 'RW']
  ];
  for (const [name, role] of checks) {
    const p = gs.getPsgSquad().find((x) => x.name === name);
    assert.ok(p, `Phải tìm thấy ${name}`);
    const ev = ai.evaluatePlayerAtPosition(p, role);
    assert.ok(ev.score >= 90 && ev.score <= 100, `${name} tại ${role} phải 90-100, nhận ${ev.score}`);
    assert.equal(ev.tier.label, 'Rất phù hợp');
  }
});

// ============================================================================
// TEST CASE 7: Vị trí phụ (65-89) + Top 3 vị trí tối ưu đề xuất đúng vị trí tốt nhất
// ============================================================================
test('Case 7: Đánh giá vị trí phụ (65-89) & getTop3Positions đề xuất đúng #1 sở trường', () => {
  const gs = makeFreshState();
  const ai = gs.formationSystem.suitabilityAI;
  const dembele = gs.getPsgSquad().find((x) => x.name === 'Ousmane Dembélé');
  assert.ok(dembele);

  const lwEval = ai.evaluatePlayerAtPosition(dembele, 'LW');
  assert.ok(lwEval.score >= 65 && lwEval.score <= 89, `Dembélé đá cánh đối diện LW phải 65-89, nhận ${lwEval.score}`);

  const top3 = ai.getTop3Positions(dembele, gs.formationSystem.getContext(), 'ST');
  assert.equal(top3.top3.length, 3);
  assert.equal(top3.bestPosition, 'RW');
  assert.ok(top3.top3[0].score >= top3.top3[1].score && top3.top3[1].score >= top3.top3[2].score);
});

// ============================================================================
// TEST CASE 8: Vị trí rất không phù hợp -> 0-64
// ============================================================================
test('Case 8: Đánh giá cầu thủ trái hẳn tuyến thi đấu rơi vào khoảng 0-64', () => {
  const gs = makeFreshState();
  const ai = gs.formationSystem.suitabilityAI;
  const marq = gs.getPsgSquad().find((x) => x.name === 'Marquinhos');
  assert.ok(marq);

  const asRw = ai.evaluatePlayerAtPosition(marq, 'RW');
  assert.ok(asRw.score >= 0 && asRw.score <= 64, `Marquinhos đá RW phải 0-64, nhận ${asRw.score}`);
  assert.ok(['Không phù hợp', 'Rất không phù hợp'].includes(asRw.tier.label));
});

// ============================================================================
// TEST CASE 9: Chuyển sơ đồ 4-3-3 -> 3-5-2 (Preview không tự phá, xác nhận mới đổi)
// ============================================================================
test('Case 9: Đổi sơ đồ (4-3-3 -> 3-5-2) qua previewFormationChange & xác nhận rõ ràng', () => {
  const gs = makeFreshState();
  const fs = gs.formationSystem;
  assert.equal(fs.formation, '4-3-3');

  const preview = fs.previewFormationChange('3-5-2');
  assert.ok(preview);
  assert.equal(preview.targetFormation, '3-5-2');
  assert.ok(Array.isArray(preview.mismatches));
  assert.ok(preview.mismatches.length >= 1, 'Chuyển 4-3-3 -> 3-5-2 giữ nguyên slot cũ phải phát hiện cầu thủ trái vị trí (LW/RW sang CB/ST)');
  assert.equal(fs.formation, '4-3-3', 'Preview KHÔNG được phép tự động đổi sơ đồ hiện tại');

  // Xác nhận áp dụng tối ưu khi đổi sang 3-5-2
  fs.setFormation('3-5-2', { autoArrange: true });
  assert.equal(fs.formation, '3-5-2');
  const afterEval = fs.getSquadEvaluation();
  assert.ok(afterEval.avgSuitability >= 84, `Đội hình 3-5-2 sau tối ưu phải có avgSuitability cao (${afterEval.avgSuitability})`);
});

// ============================================================================
// TEST CASE 10: Thay người trong trận (tối đa 5 lượt, cập nhật XI, cấm vào lại sân)
// ============================================================================
test('Case 10: Thay người trong trận cập nhật XI, ghi lịch sử & chặn cầu thủ đã ra sân vào lại', () => {
  const gs = makeFreshState();
  const fs = gs.formationSystem;
  fs.startInMatchSession(5, 58);

  const d0 = fs.getFormationData();
  const outPlayerId = d0.starters[9].playerId; // ST
  const subIn = d0.bench.find((b) => b.availability === 'available');
  assert.ok(subIn);

  const subRes = fs.performInMatchSubstitution(9, subIn.playerId, { minute: 60 });
  assert.equal(subRes.ok, true);
  assert.equal(subRes.subsUsed, 1);
  assert.equal(subRes.subsRemaining, 4);
  assert.equal(subRes.subRecord.minute, 60);

  const d1 = fs.getFormationData();
  assert.equal(d1.starters[9].playerId, subIn.playerId);
  const outBenchEntry = d1.bench.find((b) => b.playerId === outPlayerId);
  assert.ok(outBenchEntry);
  assert.equal(outBenchEntry.availability, 'subbed_out');

  // Cấm đưa người vừa bị thay ra trở lại sân
  const reEnter = fs.performInMatchSubstitution(8, outPlayerId, { minute: 72 });
  assert.equal(reEnter.ok, false);
  assert.match(reEnter.reason, /không thể trở lại sân/i);
});

// ============================================================================
// TEST CASE 11: Vượt quá 5 lượt thay người trong trận + Đồng bộ MatchdaySystem Live
// ============================================================================
test('Case 11: Chặn lượt thay người thứ 6 & kiểm tra MatchdaySystem.performChairmanLiveSub', () => {
  const gs = makeFreshState();
  const fs = gs.formationSystem;
  fs.startInMatchSession(5, 55);

  for (let i = 0; i < 5; i++) {
    const d = fs.getFormationData();
    const cand = d.bench.find((b) => b.availability === 'available');
    assert.ok(cand, `Phải còn dự bị cho lượt thay ${i + 1}`);
    const r = fs.performInMatchSubstitution(10 - i, cand.playerId, { minute: 60 + i * 3 });
    assert.equal(r.ok, true, `Lượt thay ${i + 1} phải thành công`);
  }
  assert.equal(fs.getRemainingSubs(), 0);

  const dAfter5 = fs.getFormationData();
  const extraCand = dAfter5.bench.find((b) => b.availability === 'available');
  if (extraCand) {
    const r6 = fs.performInMatchSubstitution(2, extraCand.playerId, { minute: 82 });
    assert.equal(r6.ok, false, 'Lượt thay thứ 6 phải bị từ chối');
    assert.match(r6.reason, /hết lượt thay người/i);
  }

  // Kiểm tra MatchdaySystem live session sync & giới hạn thay người trong trận
  const gs2 = makeFreshState();
  const fx = gs2.getCurrentWeekFixture() || gs2.getNextFixture();
  const live = gs2.matchdaySystem.startLiveMatchday(fx);
  assert.ok(live && !live.finished);
  gs2.matchdaySystem.stepLiveMatch(5);
  const subInMd = live.bench.find((b) => b.position !== 'GK');
  assert.ok(subInMd);
  const outSlot = live.activeStarters.find((s) => s.assignedRole !== 'GK' && !s.redCarded);
  const resMd = gs2.matchdaySystem.performChairmanLiveSub(outSlot.slotIndex, subInMd.playerId);
  assert.equal(resMd.ok, true);
  assert.equal(live.activeStarters.find((s) => s.slotIndex === outSlot.slotIndex).playerId, subInMd.playerId);
  assert.ok(live.subbedOutIds.includes(outSlot.playerId));
});

// ============================================================================
// TEST CASE 12: Cache Suitability AI + Giao diện Sân bóng & Mobile Portrait contract
// ============================================================================
test('Case 12: Cache AI hoạt động đúng (hit/invalidate) & Giao diện sân bóng đủ vạch kẻ + Responsive Mobile', () => {
  const gs = makeFreshState();
  const ai = gs.formationSystem.suitabilityAI;
  ai.invalidateCache();
  const p = gs.getPsgSquad()[0];
  const ctx = gs.formationSystem.getContext();

  ai.evaluatePlayerAtPosition(p, 'GK', ctx);
  const s1 = ai.getCacheStats();
  assert.equal(s1.misses, 1);

  ai.evaluatePlayerAtPosition(p, 'GK', ctx);
  const s2 = ai.getCacheStats();
  assert.equal(s2.hits, 1);

  ai.invalidateCache();
  assert.equal(ai.getCacheStats().size, 0);

  // Kiểm tra HTML Sân bóng chiến thuật render đủ vạch sân + bench đầy đủ nhóm lọc
  const mockUi = { selectedSlotIdx: 0, selectedBenchId: null, benchPosFilter: 'ALL', benchViewMode: 'card', benchSearchQuery: '', pendingFormationPreview: null, confirmOptimalXI: false };
  const html = renderFormationPitchTabHTML(gs, mockUi);
  assert.match(html, /tac-pitch-svg/, 'Phải render sân bóng SVG từ trên xuống');
  assert.match(html, /circle cx="50" cy="65" r="11.5"/, 'Phải có vòng tròn giữa sân');
  assert.match(html, /line x1="4" y1="65" x2="96" y2="65"/, 'Phải có vạch giữa sân');
  assert.match(html, /rect x="23" y="4" width="54" height="18"/, 'Phải có khu vực 16m50');
  assert.match(html, /rect x="35" y="4" width="30" height="7"/, 'Phải có khu vực 5m50');
  assert.match(html, /Thủ môn \(/, 'Phải có bộ lọc dự bị GK');
  assert.match(html, /Hậu vệ \(/, 'Phải có bộ lọc dự bị DEF');
  assert.match(html, /Tiền vệ \(/, 'Phải có bộ lọc dự bị MID');
  assert.match(html, /Tiền đạo \(/, 'Phải có bộ lọc dự bị ATT');
  assert.match(html, /Cầu thủ trẻ \(/, 'Phải có bộ lọc cầu thủ trẻ');
  assert.match(html, /Đa năng \(/, 'Phải có bộ lọc cầu thủ đa năng');

  // Kiểm tra CSS mobile portrait & đã xóa bỏ Drag & Drop (thay bằng chạm 2 bước + cuộn dự bị độc lập)
  const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
  assert.doesNotMatch(indexHtml, /tac-drag-ghost|tac-zone-layer/, 'Không được còn CSS kéo thả cũ');
  assert.match(indexHtml, /\.tac-slot-card\s*\{[\s\S]*touch-action:\s*manipulation/, 'Thẻ cầu thủ trên sân phải hỗ trợ chạm nhanh touch-action: manipulation');
  assert.match(indexHtml, /\.tac-bench-scroll\s*\{[\s\S]*touch-action:\s*pan-y/, 'Danh sách dự bị phải cuộn dọc mượt mà với touch-action: pan-y');
  assert.match(indexHtml, /@media \(orientation: portrait\), \(max-width: 520px\)/, 'Phải có responsive iPhone portrait');

  // Kiểm tra CoachMatchAI tích hợp avgSuitability tự động cho Matchday
  const fxCheck = gs.getCurrentWeekFixture() || gs.getNextFixture();
  const aiPlan = CoachMatchAI.selectMatchdayLineup(gs, fxCheck);
  assert.equal(aiPlan.starters.length, 11);
  assert.ok(aiPlan.avgSuitability >= 80);
});

// ============================================================================
// TEST CASE 13: Save & Load bảo toàn sơ đồ, vai trò tùy chỉnh, đội trưởng & phiên trong trận
// ============================================================================
test('Case 13: Save & Load bảo toàn sơ đồ, vai trò slot tùy chỉnh, số áo, đội trưởng & trạng thái trong trận', () => {
  const gs1 = makeFreshState();
  const fs1 = gs1.formationSystem;
  fs1.setFormation('4-2-3-1', { autoArrange: true });
  fs1.setTacticName('PSG Pressing Tốc Độ');
  const d = fs1.getFormationData();
  fs1.setCaptain(d.starters[10].playerId);
  fs1.changeSlotRole(8, 'ST');
  fs1.startInMatchSession(5, 68);
  const subCand = d.bench.find((b) => b.availability === 'available');
  fs1.performInMatchSubstitution(7, subCand.playerId, { minute: 70 });

  const snapshot = gs1.exportFullState();

  const gs2 = makeFreshState();
  gs2.importFullState(snapshot);
  const fs2 = gs2.formationSystem;

  assert.equal(fs2.formation, '4-2-3-1');
  assert.equal(fs2.tacticName, 'PSG Pressing Tốc Độ');
  assert.equal(fs2.captainId, d.starters[10].playerId);
  assert.equal(fs2.customSlots[8].role, 'ST');
  assert.equal(fs2.matchSubSession.active, true);
  assert.equal(fs2.matchSubSession.subsUsed, 1);
  assert.equal(fs2.getFormationData().starters[7].playerId, subCand.playerId);
});

// ============================================================================
// TEST CASE 14: Đồng bộ sau Chuyển nhượng (Mua/Bán/Cho mượn) & Đôn cầu thủ Học viện
// ============================================================================
test('Case 14: Đồng bộ đội hình sau Mua cầu thủ, Đôn cầu thủ trẻ, Bán & Cho mượn cầu thủ', () => {
  const gs = makeFreshState();
  const fs = gs.formationSystem;

  // 1. Mua một ngôi sao bên ngoài về PSG -> phải có trên danh sách dự bị / khả dụng với cùng ID
  const targetBuy = gs.players.find((p) => p.club !== 'Paris Saint-Germain' && p.ovr >= 82);
  assert.ok(targetBuy);
  targetBuy.club = 'Paris Saint-Germain';
  targetBuy.squadLevel = 'Đội một';
  fs.notify();

  let fd = fs.getFormationData();
  assert.ok(fd.bench.some((b) => b.playerId === targetBuy.id) || fd.starters.some((s) => s.playerId === targetBuy.id),
    'Cầu thủ mới mua phải lập tức có mặt trong đội hình/dự bị');

  // 2. Đôn cầu thủ trẻ học viện lên Đội một (giữ nguyên ID) -> phải xuất hiện trên danh sách dự bị
  const youth = gs.academy.find((y) => !y.promoted && !y.loanInfo);
  assert.ok(youth);
  const promoteRes = gs.transferSystem.promoteAcademyPlayer(youth.id);
  assert.equal(promoteRes.ok, true);
  fd = fs.getFormationData();
  assert.ok(fd.bench.some((b) => b.playerId === youth.id), 'Cầu thủ trẻ được đôn phải xuất hiện ở danh sách dự bị với đúng ID');

  // 3. Bán một cầu thủ đang đá chính -> phải tự động loại khỏi XI và khỏi bench (không giữ cầu thủ đã rời CLB)
  const soldId = fd.starters[6].playerId;
  const sellRes = gs.transferSystem.sellPlayer(soldId, 'Chelsea', 50);
  assert.equal(sellRes.ok, true);
  fd = fs.getFormationData({ fillEmpty: false });
  assert.ok(!fd.starters.some((s) => s.playerId === soldId), 'Cầu thủ đã bán không được nằm trong XI');
  assert.ok(!fd.bench.some((b) => b.playerId === soldId), 'Cầu thủ đã bán không được nằm trong danh sách dự bị');

  // 4. Cho mượn một cầu thủ PSG -> không được xuất hiện ở XI hay bench PSG
  const loanTarget = fd.bench.find((b) => b.playerId !== youth.id && b.availability === 'available');
  assert.ok(loanTarget);
  const loanRes = gs.transferSystem.loanOutPlayer(loanTarget.playerId, 'AS Monaco', 10);
  assert.equal(loanRes.ok, true);
  fd = fs.getFormationData({ fillEmpty: false });
  assert.ok(!fd.starters.some((s) => s.playerId === loanTarget.playerId));
  assert.ok(!fd.bench.some((b) => b.playerId === loanTarget.playerId));
});

console.log(`\n🏁 Tổng kết Squad Formation & AI Suitability Tests: ${passed}/14 passed.`);
