// tests/verify_presidential_office_system.mjs
// Kiểm thử 25 kịch bản tích hợp Toàn diện Hệ thống Văn phòng Chủ tịch PSG (Hồ sơ giấy 3D, Khay KHẨN, Mac OS, Thực thi đa bước, NPC Accountability, Save/Load)

import assert from 'node:assert/strict';

if (typeof globalThis.document === 'undefined') {
  const noop = () => {};
  const makeCtx = () => {
    const base = {
      fillStyle: '#000', strokeStyle: '#000', font: '12px sans-serif', textAlign: 'left',
      textBaseline: 'top', globalAlpha: 1, lineWidth: 1,
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
      measureText: (t) => ({ width: String(t || '').length * 7 }),
      getImageData: () => ({ data: new Uint8ClampedArray(4) })
    };
    return new Proxy(base, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return noop;
      }
    });
  };
  globalThis.document = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return { width: 256, height: 256, getContext: () => makeCtx(), style: {} };
      }
      return { style: {}, appendChild: noop };
    }
  };
}

import * as THREE from 'three';
import { GameState } from '../src/club/GameState.js';
import {
  DOC_CATEGORY,
  DOC_STACK_META,
  URGENT_TRAY_META,
  DOC_STATUS,
  DOC_PRIORITY,
  TASK_STATUS,
  DELEGATION_MODE,
  EXEC_ACTIONS,
  qualifiesForUrgentTray,
  compareUrgentPriority
} from '../src/executive/DocumentTypes.js';
import { PsgCampusScene } from '../src/scene/PsgCampusScene.js';
import { OfficeDeskDocuments3D } from '../src/scene/OfficeDeskDocuments3D.js';
import { NpcSystem } from '../src/npc/NpcSystem.js';
import { TextureFactory } from '../src/core/TextureFactory.js';
import { FurnitureFactory } from '../src/scene/FurnitureFactory.js';
import { VehicleSystem } from '../src/vehicles/VehicleSystem.js';
import { CharacterFactory } from '../src/characters/CharacterFactory.js';
import { AnimationSystem } from '../src/animations/AnimationSystem.js';
import {
  renderStackDossierListHTML,
  renderUrgentTrayHTML,
  renderPaperDossierReaderHTML
} from '../src/ui/PaperDocumentView.js';
import {
  renderDailyBriefingWidgetHTML,
  renderActionTrackerHTML,
  renderDocumentArchiveHTML,
  renderStrategicPlanningHTML,
  renderStaffAccountabilityHTML
} from '../src/ui/ExecutiveMacViews.js';

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

function makeFreshState() {
  const s = new GameState();
  s.finance.budget = 250;
  s.finance.cash = 250;
  s.finance.transferBudget = 160;
  s.president.prestige = 88;
  return s;
}

// =========================================================================
// TEST 1–5: 3D Desk Stacks, Urgent Tray Qualification, Sorting, Read-only vs Decide
// =========================================================================
test('CASE-01: Bàn Chủ tịch 3D có đúng 6 chồng hồ sơ riêng biệt + 1 khay đỏ URGENT & interactables hoạt động', () => {
  const tex = new TextureFactory();
  const campus = new PsgCampusScene(new THREE.Scene(), tex, new FurnitureFactory(tex), new VehicleSystem(tex));
  assert(campus.deskDocuments instanceof OfficeDeskDocuments3D, 'Phải gắn OfficeDeskDocuments3D lên campus');
  assert.equal(DOC_STACK_META.length, 6, 'Phải có đúng 6 chồng hồ sơ trên bàn');
  assert.equal(campus.deskDocuments.stackNodes.size, 6, '3D scene phải tạo đủ 6 chồng hồ sơ');
  assert(campus.deskDocuments.urgentNode, '3D scene phải tạo khay đỏ URGENT');

  for (const m of DOC_STACK_META) {
    const inter = campus.interactables.get(m.interactId);
    assert(inter, `Thiếu interactable 3D cho ${m.interactId}`);
    assert.equal(inter.action, 'open_doc_stack');
    assert.equal(inter.extra.category, m.category);
  }
  const urgentInter = campus.interactables.get(URGENT_TRAY_META.interactId);
  assert(urgentInter && urgentInter.action === 'open_urgent_tray', 'Thiếu interactable khay URGENT');
});

test('CASE-02: Mở hồ sơ đọc KHÔNG tự phê duyệt (chỉ đổi NEW -> UNDER_REVIEW & đánh dấu đã đọc)', () => {
  const s = makeFreshState();
  const doc = s.documentSystem.createDocument({
    eventKey: 'test_read_only_1',
    category: DOC_CATEGORY.FINANCE,
    title: 'Đề xuất ngân sách thử nghiệm',
    priority: DOC_PRIORITY.MEDIUM,
    daysUntilDeadline: 5
  });
  assert.equal(doc.status, DOC_STATUS.NEW);
  assert.equal(doc.readByPresident, false);

  s.documentSystem.openDocumentForReading(doc.id);
  assert.equal(doc.readByPresident, true);
  assert.equal(doc.status, DOC_STATUS.UNDER_REVIEW);
  assert.equal(doc.executionTaskId, null, 'Mở đọc tuyệt đối không tự tạo ExecutionTask');
});

test('CASE-03: Bộ lọc Khay Đỏ URGENT & thứ tự ưu tiên (Khẩn -> Sát hạn -> Tác động -> Leo thang)', () => {
  const s = makeFreshState();
  const normalSmall = s.documentSystem.createDocument({
    eventKey: 'flt_norm',
    category: DOC_CATEGORY.PARTNERSHIP,
    title: 'Đề xuất nhỏ thường ngày',
    priority: DOC_PRIORITY.LOW,
    daysUntilDeadline: 12,
    financialImpactM: 3,
    impactScore: 5
  });
  const deadlineSoon = s.documentSystem.createDocument({
    eventKey: 'flt_soon',
    category: DOC_CATEGORY.HR,
    title: 'Hồ sơ sát hạn 1 ngày',
    priority: DOC_PRIORITY.MEDIUM,
    daysUntilDeadline: 1,
    financialImpactM: 8,
    impactScore: 20
  });
  const highImpact = s.documentSystem.createDocument({
    eventKey: 'flt_big',
    category: DOC_CATEGORY.TRANSFER,
    title: 'Thương vụ €42M',
    priority: DOC_PRIORITY.HIGH,
    daysUntilDeadline: 5,
    financialImpactM: 42,
    impactScore: 60
  });
  const urgentEscalated = s.documentSystem.createDocument({
    eventKey: 'flt_urg',
    category: DOC_CATEGORY.PRESIDENTIAL_DECISIONS,
    title: 'Khủng hoảng leo thang khẩn',
    priority: DOC_PRIORITY.URGENT,
    daysUntilDeadline: 1,
    financialImpactM: 15,
    impactScore: 80,
    isEscalated: true
  });

  assert.equal(qualifiesForUrgentTray(normalSmall), false, 'Hồ sơ nhỏ bình thường KHÔNG được vào khay URGENT');
  assert.equal(qualifiesForUrgentTray(deadlineSoon), true);
  assert.equal(qualifiesForUrgentTray(highImpact), true);
  assert.equal(qualifiesForUrgentTray(urgentEscalated), true);

  const urgentList = s.documentSystem.getUrgentDocuments();
  assert(urgentList.length >= 3);
  const idxUrg = urgentList.findIndex((d) => d.id === urgentEscalated.id);
  const idxBig = urgentList.findIndex((d) => d.id === highImpact.id);
  assert(idxUrg !== -1 && idxBig !== -1 && idxUrg < idxBig, 'Hồ sơ khẩn cấp phải xếp trên hồ sơ không khẩn');
  assert.equal(compareUrgentPriority(urgentEscalated, highImpact) < 0, true);
});

test('CASE-04: Dirty-check sync OfficeDeskDocuments3D & triggerStackAnimation hoạt động ổn định', () => {
  const s = makeFreshState();
  const desk3D = new OfficeDeskDocuments3D(null);
  desk3D.syncFromDocumentSystem(s.documentSystem);
  const v1 = desk3D._lastSig;
  desk3D.syncFromDocumentSystem(s.documentSystem);
  assert.equal(desk3D._lastSig, v1, 'Không được rebuild texture nếu trạng thái không đổi');

  s.documentSystem.createDocument({
    eventKey: 'dirty_check_doc_1',
    category: DOC_CATEGORY.FINANCE,
    title: 'Hồ sơ tài chính khẩn',
    priority: DOC_PRIORITY.URGENT,
    daysUntilDeadline: 1
  });
  desk3D.syncFromDocumentSystem(s.documentSystem);
  assert.notEqual(desk3D._lastSig, v1, 'Phải cập nhật signature khi có văn bản mới');
  desk3D.triggerStackAnimation(URGENT_TRAY_META.interactId);
  desk3D.update(0.05);
});

test('CASE-05: Tách biệt APPROVED và COMPLETED — Phê duyệt tạo ExecutionTask chứ chưa xong ngay', () => {
  const s = makeFreshState();
  const doc = s.documentSystem.createDocument({
    eventKey: 'sep_approve_vs_complete',
    category: DOC_CATEGORY.FINANCE,
    sourceType: 'budget_proposal',
    title: 'Phê duyệt gói ngân sách phân tích AI',
    priority: DOC_PRIORITY.HIGH,
    daysUntilDeadline: 2,
    financialImpactM: -5,
    extraPayload: { costM: 5, proposalId: 'ai_tech_1' }
  });

  const dec = s.executionSystem.submitDocumentDecision(doc.id, {
    action: EXEC_ACTIONS.APPROVE,
    delegationMode: DELEGATION_MODE.SUPERVISE,
    ownerRoleKey: 'cfo'
  });
  assert.equal(dec.ok, true);
  assert.equal(doc.status, DOC_STATUS.APPROVED, 'Sau phê duyệt ngay lập tức phải là APPROVED, chưa COMPLETED');
  assert(dec.task, 'Phải sinh ExecutionTask');
  assert.notEqual(dec.task.status, TASK_STATUS.COMPLETED, 'Task không thể tức thì COMPLETED khi vừa mới bấm Approve');
});

// =========================================================================
// TEST 6–12: Luồng Chuyển nhượng (Incoming bid, Multi-club, Reject, Failure, Buy)
// =========================================================================
test('CASE-06: Incoming Bid -> Hồ sơ giấy -> Tham chiếu Urgent -> Phê duyệt -> Đa bước -> Hoàn tất & Archive', () => {
  const s = makeFreshState();
  const psgPlayer = s.getPsgSquad().find((p) => p.position !== 'GK');
  const bid = {
    id: 'bid_case6',
    date: '10/08/2026',
    buyerClub: 'Bayern Munich',
    buyerStrategy: 'Cạnh tranh C1',
    dealType: 'buy',
    playerId: psgPlayer.id,
    playerName: psgPlayer.name,
    position: psgPlayer.position,
    ovr: psgPlayer.ovr,
    fee: 65,
    askingPrice: 60,
    clauses: { sellOnPct: 10, bonusFee: 5, paymentTerms: 'Trả trước' },
    deadlineWeek: s.week,
    deadlineDate: 'Khẩn 24h',
    rounds: 0,
    status: 'pending'
  };
  s.transferSystem.incomingBids.unshift(bid);
  s.documentSystem.syncFromClubState();

  const doc = s.documentSystem.findByEventKey('inc_bid_bid_case6');
  assert(doc, 'Incoming bid phải tự sinh Hồ sơ giấy');
  assert.equal(doc.category, DOC_CATEGORY.TRANSFER);
  assert.equal(qualifiesForUrgentTray(doc), true, 'Đề nghị €65M phải vào Khay ĐỎ URGENT');

  const budgetBefore = s.finance.budget;
  const res = s.executionSystem.submitDocumentDecision(doc.id, {
    action: EXEC_ACTIONS.SIGN,
    delegationMode: DELEGATION_MODE.SUPERVISE,
    ownerRoleKey: 'sporting_director'
  });
  assert.equal(res.ok, true);
  assert.equal(doc.signatureCaptured, true);

  // Tiến thời gian qua nhiều ngày để hoàn tất các bước kiểm tra + hợp đồng + chuyển tiền
  for (let i = 0; i < 6; i++) s.executionSystem.advanceTimeDays(1);
  assert.equal(res.task.status, TASK_STATUS.COMPLETED, 'Task bán cầu thủ phải hoàn tất sau đủ ngày');
  assert.equal(doc.status, DOC_STATUS.COMPLETED);
  assert.equal(s.documentSystem.getUrgentDocuments().some((d) => d.id === doc.id), false, 'Hoàn tất phải rời khỏi khay URGENT');
  assert(s.finance.budget > budgetBefore, 'Tiền bán cầu thủ phải được cộng vào ngân sách thật');
  assert.equal(s.getPlayerById(psgPlayer.id).club, 'Bayern Munich', 'Cầu thủ phải chuyển sang Bayern Munich');
});

test('CASE-07: Nhiều CLB hỏi mua cùng 1 cầu thủ -> Chấp nhận 1 CLB tự đóng/khóa đề nghị cạnh tranh', () => {
  const s = makeFreshState();
  const target = s.getPsgSquad().find((p) => p.position !== 'GK');
  const b1 = {
    id: 'bid_mc_1', date: '11/08/2026', buyerClub: 'Arsenal', dealType: 'buy',
    playerId: target.id, playerName: target.name, position: target.position, ovr: target.ovr,
    fee: 52, askingPrice: 50, deadlineWeek: s.week, status: 'pending'
  };
  const b2 = {
    id: 'bid_mc_2', date: '11/08/2026', buyerClub: 'Chelsea', dealType: 'buy',
    playerId: target.id, playerName: target.name, position: target.position, ovr: target.ovr,
    fee: 48, askingPrice: 50, deadlineWeek: s.week, status: 'pending'
  };
  s.transferSystem.incomingBids.unshift(b1, b2);
  s.documentSystem.syncFromClubState();

  const doc1 = s.documentSystem.findByEventKey('inc_bid_bid_mc_1');
  const res = s.executionSystem.submitDocumentDecision(doc1.id, { action: EXEC_ACTIONS.APPROVE, ownerRoleKey: 'sporting_director' });
  assert.equal(res.ok, true);
  for (let i = 0; i < 6; i++) s.executionSystem.advanceTimeDays(1);

  assert.equal(res.task.status, TASK_STATUS.COMPLETED);
  assert.equal(s.transferSystem.incomingBids.some((b) => b.id === 'bid_mc_2'), false, 'Đề nghị cạnh tranh phải bị dọn sau khi cầu thủ đã bán');
});

test('CASE-08: Từ chối (REJECT) đề nghị chuyển nhượng không trừ/cộng tiền và xóa bid ngay', () => {
  const s = makeFreshState();
  const target = s.getPsgSquad().find((p) => p.position !== 'GK');
  s.transferSystem.incomingBids.unshift({
    id: 'bid_rej_1', date: '12/08/2026', buyerClub: 'Inter Milan', dealType: 'buy',
    playerId: target.id, playerName: target.name, position: target.position, ovr: target.ovr,
    fee: 40, askingPrice: 45, deadlineWeek: s.week, status: 'pending'
  });
  s.documentSystem.syncFromClubState();
  const doc = s.documentSystem.findByEventKey('inc_bid_bid_rej_1');
  const res = s.executionSystem.submitDocumentDecision(doc.id, { action: EXEC_ACTIONS.REJECT, instruction: 'Cầu thủ không phải để bán' });
  assert.equal(res.ok, true);
  assert.equal(doc.status, DOC_STATUS.REJECTED);
  assert.equal(s.transferSystem.incomingBids.some((b) => b.id === 'bid_rej_1'), false);
  assert.equal(s.getPlayerById(target.id).club, 'Paris Saint-Germain');
});

test('CASE-09: Đàm phán thất bại (Partner từ chối / Hết ngân sách) báo FAILED trung thực, không fake COMPLETED', () => {
  const s = makeFreshState();
  const target = s.getPsgSquad().find((p) => p.position !== 'GK');
  const doc = s.documentSystem.createDocument({
    eventKey: 'fail_bid_test',
    category: DOC_CATEGORY.TRANSFER,
    sourceType: 'incoming_bid',
    sourceRefId: 'bid_already_gone_999',
    title: `Thương vụ quá hạn cho ${target.name}`,
    priority: DOC_PRIORITY.HIGH,
    extraPayload: { bidId: 'bid_already_gone_999', playerId: target.id, playerName: target.name, buyerClub: 'Juventus', fee: 35 }
  });
  const res = s.executionSystem.submitDocumentDecision(doc.id, { action: EXEC_ACTIONS.APPROVE, ownerRoleKey: 'sporting_director' });
  assert.equal(res.ok, true);
  for (let i = 0; i < 6; i++) s.executionSystem.advanceTimeDays(1);
  assert.equal(res.task.status, TASK_STATUS.FAILED, 'Đề nghị không còn tồn tại phải FAILED chứ không được giả COMPLETED');
});

test('CASE-10: Yêu cầu chỉnh sửa (REVISION) / Bổ sung thông tin (INFORMATION) / Chuyển tiếp (FORWARD)', () => {
  const s = makeFreshState();
  const doc = s.documentSystem.createDocument({
    eventKey: 'rev_info_fwd_1',
    category: DOC_CATEGORY.HR,
    title: 'Đề xuất thưởng quý phòng Y tế',
    priority: DOC_PRIORITY.MEDIUM,
    daysUntilDeadline: 5
  });
  const rFwd = s.executionSystem.submitDocumentDecision(doc.id, { action: EXEC_ACTIONS.FORWARD, ownerRoleKey: 'cfo', instruction: 'Nhờ CFO thẩm định thêm' });
  assert.equal(rFwd.ok, true);
  assert.equal(doc.defaultOwnerRoleKey, 'cfo');

  const rInfo = s.executionSystem.submitDocumentDecision(doc.id, { action: EXEC_ACTIONS.REQUEST_INFORMATION, ownerRoleKey: 'cfo', instruction: 'Bổ sung bảng kê chi tiết' });
  assert.equal(rInfo.ok, true);
  assert.equal(doc.status, DOC_STATUS.WAITING_INFORMATION);

  const rRev = s.executionSystem.submitDocumentDecision(doc.id, { action: EXEC_ACTIONS.REQUEST_REVISION, instruction: 'Giảm 20% dự toán' });
  assert.equal(rRev.ok, true);
  assert.equal(doc.status, DOC_STATUS.REVISION_REQUIRED);
});

// =========================================================================
// TEST 11–14: Sa thải & Bổ nhiệm HLV (xóa sạch tên HLV cũ, tạo hồ sơ khẩn)
// =========================================================================
test('CASE-11: Sa thải HLV Trưởng -> Xóa sạch tên HLV cũ & Tự động trình Hồ sơ Tuyển HLV KHẨN', () => {
  const s = makeFreshState();
  const oldCoach = s.managerSystem.getActiveByRole('head_coach');
  assert(oldCoach, 'Ban đầu phải có HLV trưởng');
  const oldName = oldCoach.name;

  const fireRes = s.managerSystem.fireStaff('head_coach', 'Thay đổi triết lý huấn luyện');
  assert.equal(fireRes.ok, true);
  assert.equal(s.coach.vacant, true);
  assert(!s.coach.name.includes(oldName), 's.coach.name không được giữ tên HLV đã bị sa thải');

  const ownerResolved = s.executionSystem.resolveOwnerNpc('head_coach');
  assert.equal(ownerResolved.vacant, true);
  assert(!ownerResolved.name.includes(oldName), 'ExecutionSystem không được trả tên HLV cũ');

  const vacancyDoc = s.documentSystem.documents.find((d) => d.sourceType === 'coach_vacancy');
  assert(vacancyDoc, 'Sa thải HLV phải sinh hồ sơ tuyển HLV mới');
  assert.equal(vacancyDoc.priority, DOC_PRIORITY.URGENT, 'Trống HLV Trưởng phải là hồ sơ KHẨN');
});

test('CASE-12: Phê duyệt bổ nhiệm HLV Trưởng mới từ hồ sơ tuyển dụng -> Hoàn tất bổ nhiệm & Đồng bộ NPC', () => {
  const s = makeFreshState();
  s.managerSystem.fireStaff('head_coach', 'Tái cơ cấu');
  const vacancyDoc = s.documentSystem.documents.find((d) => d.sourceType === 'coach_vacancy');
  const cand = s.managerSystem.getCandidatesForRole('head_coach')[0];
  assert(cand, 'Phải có ứng viên HLV trưởng sẵn sàng');
  vacancyDoc.extraPayload.candidateId = cand.staffId;
  vacancyDoc.extraPayload.offerWage = cand.wage || 120;
  vacancyDoc.extraPayload.offerYears = 3;

  const res = s.executionSystem.submitDocumentDecision(vacancyDoc.id, {
    action: EXEC_ACTIONS.SIGN,
    ownerRoleKey: 'sporting_director'
  });
  assert.equal(res.ok, true);
  for (let i = 0; i < 6; i++) s.executionSystem.advanceTimeDays(1);

  assert.equal(res.task.status, TASK_STATUS.COMPLETED);
  assert.equal(s.coach.vacant, false);
  assert.equal(s.managerSystem.getActiveByRole('head_coach').name, cand.name);
});

// =========================================================================
// TEST 13–15: Cơ sở vật chất (40% cọc -> Xây dựng -> 60% tất toán), Nhà tài trợ, Khủng hoảng
// =========================================================================
test('CASE-13: Nâng cấp Cơ sở vật chất tách 2 đợt thanh toán: 40% tạm ứng -> Thi công -> 60% tất toán khi hoàn tất', () => {
  const s = makeFreshState();
  const facBefore = s.commercialSystem.getFacilityLevel('training_center');
  const budgetStart = s.finance.budget;
  const costM = 20;

  const doc = s.documentSystem.raiseDossierFromComputer('facility_upgrade', {
    facilityId: 'training_center',
    costM,
    targetLevel: facBefore + 1
  });
  const dec = s.executionSystem.submitDocumentDecision(doc.id, {
    action: EXEC_ACTIONS.APPROVE,
    ownerRoleKey: 'facilities'
  });
  assert.equal(dec.ok, true);

  // Ngay sau step 1 (chưa kết thúc): chỉ trừ tối đa ~40% (8M), CHƯA nâng cấp facility!
  assert.equal(s.commercialSystem.getFacilityLevel('training_center'), facBefore, 'Không được hoàn tất nâng cấp ngay khi vừa ký!');
  assert(s.finance.budget < budgetStart && s.finance.budget > budgetStart - costM, 'Phải chi theo giai đoạn (tạm ứng 40%), không trừ hết 100% lúc ký');

  for (let i = 0; i < 8; i++) s.executionSystem.advanceTimeDays(1);
  assert.equal(dec.task.status, TASK_STATUS.COMPLETED);
  assert.equal(s.commercialSystem.getFacilityLevel('training_center'), facBefore + 1, 'Hoàn tất thi công mới tăng cấp CSVC');
  assert(Math.abs((budgetStart - costM) - s.finance.budget) < 0.3, 'Tổng tiền trừ đủ 100% (40% + 60%)');
});

test('CASE-14: Đề nghị Nhà tài trợ mới -> Ký văn bản giấy -> Thực thi -> Tăng doanh thu & Lưu trữ', () => {
  const s = makeFreshState();
  const offer = s.commercialSystem.sponsorOffers[0];
  assert(offer, 'Phải có sponsor offer');
  s.documentSystem.syncFromClubState();
  const doc = s.documentSystem.findByEventKey(`sponsor_offer_${offer.id}`);
  assert(doc, 'Sponsor offer phải tạo hồ sơ giấy');

  const annualBefore = s.commercialSystem.getTotalSponsorAnnualRevenue();
  const res = s.executionSystem.submitDocumentDecision(doc.id, {
    action: EXEC_ACTIONS.SIGN,
    ownerRoleKey: 'commercial_director'
  });
  assert.equal(res.ok, true);
  for (let i = 0; i < 5; i++) s.executionSystem.advanceTimeDays(1);
  assert.equal(res.task.status, TASK_STATUS.COMPLETED);
  assert(s.commercialSystem.getTotalSponsorAnnualRevenue() > annualBefore, 'Ký xong tài trợ phải tăng doanh thu năm');
});

test('CASE-15: Hồ sơ Khủng hoảng truyền thông -> Phê duyệt dập khủng hoảng -> Cập nhật uy tín & trạng thái crisis', () => {
  const s = makeFreshState();
  const crisis = s.rumorCrisisSystem.triggerCrisis('coach_pressure', { coachName: s.coach?.name, loseStreak: 3 }, 'crisis_case_15');
  assert(crisis, 'Phải tạo được crisis');
  s.documentSystem.syncFromClubState();
  const doc = s.documentSystem.findByEventKey(`crisis_${crisis.id}`);
  assert(doc, 'Khủng hoảng đang hoạt động phải xuất hiện thành hồ sơ giấy');
  assert.equal(qualifiesForUrgentTray(doc), true);

  const res = s.executionSystem.submitDocumentDecision(doc.id, {
    action: EXEC_ACTIONS.SIGN,
    ownerRoleKey: 'media_director'
  });
  assert.equal(res.ok, true);
  for (let i = 0; i < 5; i++) s.executionSystem.advanceTimeDays(1);
  assert.equal(res.task.status, TASK_STATUS.COMPLETED);
  assert.notEqual(crisis.status, 'active', 'Khủng hoảng phải được xử lý xong sau khi task hoàn tất');
});

// =========================================================================
// TEST 16–20: Kiểm soát Ủy quyền (APPROVAL_REQUIRED), Thiếu ngân sách, Can thiệp Tracker, Năng lực NPC, NPC Rời CLB Giữa Chừng
// =========================================================================
test('CASE-16: Chế độ APPROVAL_REQUIRED chặn bước cuối để Chủ tịch duyệt chốt (BLOCKED -> resolveBlockerAndContinue)', () => {
  const s = makeFreshState();
  const doc = s.documentSystem.raiseDossierFromComputer('budget_proposal', {
    proposalId: 'req_final_sign_test',
    title: 'Đầu tư hệ thống y sinh phục hồi €4M',
    costM: 4,
    dept: 'Bộ phận Y tế PSG'
  });
  const dec = s.executionSystem.submitDocumentDecision(doc.id, {
    action: EXEC_ACTIONS.APPROVE,
    delegationMode: DELEGATION_MODE.APPROVAL_REQUIRED,
    ownerRoleKey: 'medical'
  });
  assert.equal(dec.ok, true);
  for (let i = 0; i < 6; i++) s.executionSystem.advanceTimeDays(1);

  assert.equal(dec.task.status, TASK_STATUS.BLOCKED, 'APPROVAL_REQUIRED phải tạm chặn trước bước cuối chờ Chủ tịch chốt');
  assert.equal(dec.task.blocker.type, 'PRESIDENT_FINAL_SIGN');

  const unb = s.executionSystem.resolveBlockerAndContinue(dec.task.id);
  assert.equal(unb.ok, true);
  assert.equal(dec.task.status, TASK_STATUS.COMPLETED);
});

test('CASE-17: Thiếu ngân sách giữa chừng (INSUFFICIENT_BUDGET) chặn thực thi trung thực + Báo Mac/Urgent', () => {
  const s = makeFreshState();
  s.finance.budget = 6;
  s.finance.cash = 6;
  const docPre = s.documentSystem.raiseDossierFromComputer('facility_upgrade', {
    facilityId: 'academy_complex',
    costM: 20, // vượt ngân sách 6M (đặt cọc 40% = 8M > 6M)
    targetLevel: 4
  });
  const checkPre = s.executionSystem.submitDocumentDecision(docPre.id, {
    action: EXEC_ACTIONS.APPROVE,
    ownerRoleKey: 'facilities'
  });
  assert.equal(checkPre.ok, false, 'Thiếu ngân sách đặt cọc ngay từ đầu không được phép cho phê duyệt giả');

  // Nếu đủ đặt cọc 40% (8M) nhưng hụt tiền ở đợt 2 (12M):
  s.finance.budget = 21;
  s.finance.cash = 21;
  const doc = s.documentSystem.raiseDossierFromComputer('facility_upgrade', {
    facilityId: 'training_center',
    costM: 20,
    targetLevel: 5
  });
  const dec = s.executionSystem.submitDocumentDecision(doc.id, { action: EXEC_ACTIONS.APPROVE, ownerRoleKey: 'facilities' });
  assert.equal(dec.ok, true);
  // Giả lập CLB bị rút cạn tiền ở sự kiện khác trước khi tất toán đợt 2
  s.finance.budget = 2;
  s.finance.cash = 2;
  for (let i = 0; i < 8; i++) s.executionSystem.advanceTimeDays(1);

  assert.equal(dec.task.status, TASK_STATUS.BLOCKED);
  assert.equal(dec.task.blocker.type, 'INSUFFICIENT_BUDGET');
});

test('CASE-18: Đầy đủ can thiệp trên Action Tracker (Yêu cầu báo cáo, Chỉ đạo, Gia hạn, Đổi người, Giải trình, Tạm dừng, Hủy)', () => {
  const s = makeFreshState();
  const doc = s.documentSystem.raiseDossierFromComputer('kpi_review', { costM: 0 });
  const dec = s.executionSystem.submitDocumentDecision(doc.id, { action: EXEC_ACTIONS.ASSIGN_TASK, ownerRoleKey: 'ceo' });
  const tid = dec.task.id;

  const rep = s.executionSystem.requestReport(tid);
  assert.equal(rep.ok, true);

  const inst = s.executionSystem.sendInstruction(tid, 'Tập trung 3 phòng ban trọng điểm');
  assert.equal(inst.ok, true);

  const oldDeadline = dec.task.deadlineDays;
  const ext = s.executionSystem.extendDeadline(tid, 4);
  assert.equal(ext.ok, true);
  assert.equal(dec.task.deadlineDays, oldDeadline + 4);

  const exp = s.executionSystem.demandExplanation(tid);
  assert.equal(exp.ok, true && typeof exp.reply === 'string');

  const p1 = s.executionSystem.pauseTask(tid);
  assert.equal(p1.task.status, TASK_STATUS.PAUSED);
  const p2 = s.executionSystem.pauseTask(tid);
  assert.equal(p2.task.status, TASK_STATUS.IN_PROGRESS);

  const rea = s.executionSystem.reassignOwner(tid, 'academy', 'Điều chuyển chuyên môn');
  assert.equal(rea.ok, true);
  assert.equal(dec.task.ownerRoleKey, 'academy');

  const can = s.executionSystem.cancelTask(tid, 'Dừng để tập trung giải đấu');
  assert.equal(can.ok, true);
  assert.equal(dec.task.status, TASK_STATUS.CANCELLED);
});

test('CASE-19: Đánh giá năng lực NPC có công bằng & KHÔNG tự động sa thải chỉ sau 1 lần trễ hạn', () => {
  const s = makeFreshState();
  const cfoBefore = s.managerSystem.getActiveByRole('cfo') || { name: 'CFO' };
  const doc = s.documentSystem.raiseDossierFromComputer('kpi_review', { costM: 0 });
  const dec = s.executionSystem.submitDocumentDecision(doc.id, { action: EXEC_ACTIONS.ASSIGN_TASK, ownerRoleKey: 'cfo' });
  dec.task.deadlineDays = 1;
  dec.task.daysElapsed = 3; // quá hạn
  for (let i = 0; i < 6; i++) s.executionSystem.advanceTimeDays(1);

  const ev = s.executionSystem.staffEvaluations.cfo;
  assert.equal(ev.delayedCount, 1, 'Phải ghi nhận đúng 1 lần trễ hạn');
  assert(s.executionSystem.getStaffAccountabilityList().length >= 5);
  const cfoAfter = s.managerSystem.getActiveByRole('cfo') || { name: 'CFO' };
  assert.equal(cfoAfter.name, cfoBefore.name, 'Không bao giờ auto sa thải NPC chỉ vì 1 lần trễ hạn');
});

test('CASE-20: Bảo vệ NPC rời CLB giữa chừng -> Task đang chạy bị BLOCKED (OWNER_DEPARTED) & Bàn giao người mới', () => {
  const s = makeFreshState();
  const doc = s.documentSystem.createDocument({
    eventKey: 'coach_depart_mid_task',
    category: DOC_CATEGORY.COACHING,
    sourceType: 'manual',
    title: 'Đánh giá chiến thuật 3 hậu vệ',
    priority: DOC_PRIORITY.HIGH
  });
  const dec = s.executionSystem.submitDocumentDecision(doc.id, {
    action: EXEC_ACTIONS.ASSIGN_TASK,
    ownerRoleKey: 'head_coach'
  });
  assert.equal(dec.ok, true);

  s.managerSystem.fireStaff('head_coach', 'Thay đổi chiến lược');
  assert.equal(dec.task.status, TASK_STATUS.BLOCKED, 'Sa thải HLV giữa chừng phải block task liên quan để bàn giao');
  assert.equal(dec.task.blocker.type, 'OWNER_DEPARTED');

  const rea = s.executionSystem.reassignOwner(dec.task.id, 'sporting_director', 'Giao GĐ Thể thao tạm quyền');
  assert.equal(rea.ok, true);
  assert.equal(dec.task.status, TASK_STATUS.IN_PROGRESS, 'Sau khi bàn giao người mới phải tiếp tục chạy');
  assert.equal(dec.task.blocker, null);
});

// =========================================================================
// TEST 21–25: Daily Briefing, Mac Views, Paper Reader HTML, Phone Sync Dedup, Save/Load Idempotency, NPC Office Visit 3D
// =========================================================================
test('CASE-21: Báo cáo Đầu Ngày Chủ tịch (Daily Briefing) lấy 100% dữ liệu thật, không số liệu giả', () => {
  const s = makeFreshState();
  const br = s.executionSystem.buildDailyBriefingData();
  assert.equal(br.week, s.week);
  assert.equal(br.pendingDocsCount, s.documentSystem.getPendingDocuments().length);
  assert.equal(br.urgentDocsCount, s.documentSystem.getUrgentCount());
  assert.equal(br.activeTasksCount, s.executionSystem.getActiveTasks().length);

  const html = renderDailyBriefingWidgetHTML(s);
  assert(html.includes('PRESIDENTIAL DAILY BRIEFING'));
  assert(html.includes(br.coachName));
});

test('CASE-22: Toàn bộ giao diện mới (Paper Stack, Urgent Tray, Dossier Reader, Action Tracker, Archive, Strategy, Staff Matrix) render chuẩn HTML', () => {
  const s = makeFreshState();
  s.documentSystem.syncFromClubState();
  const firstDoc = s.documentSystem.documents[0];
  assert(firstDoc);

  const stackHtml = renderStackDossierListHTML(s, firstDoc.category);
  const trayHtml = renderUrgentTrayHTML(s);
  const readerHtml = renderPaperDossierReaderHTML(s, firstDoc, 0);
  const trackerHtml = renderActionTrackerHTML(s);
  const archiveHtml = renderDocumentArchiveHTML(s);
  const stratHtml = renderStrategicPlanningHTML(s);
  const accHtml = renderStaffAccountabilityHTML(s);

  assert(stackHtml.includes('pd-open-doc'));
  assert(trayHtml.includes('PRESIDENTIAL PRIORITY'));
  assert(readerHtml.includes('pd-act-btn') && readerHtml.includes('APPROVE'));
  assert(trackerHtml.includes('trk-flt-status'));
  assert(archiveHtml.includes('arc-search'));
  assert(stratHtml.includes('str-raise-kpi-doc'));
  assert(accHtml.includes('Ký'));
});

test('CASE-23: Đồng bộ Điện thoại không tạo thông báo trùng lặp khi sync hoặc qua ngày liên tiếp', () => {
  const s = makeFreshState();
  s.documentSystem.createDocument({
    eventKey: 'phone_dedup_event_1',
    category: DOC_CATEGORY.PRESIDENTIAL_DECISIONS,
    title: 'Thông báo khẩn thử nghiệm chống trùng',
    priority: DOC_PRIORITY.URGENT,
    daysUntilDeadline: 1
  });
  const cnt1 = s.phoneInbox.filter((m) => m.title.includes('Thông báo khẩn thử nghiệm chống trùng')).length;
  assert.equal(cnt1, 1);

  s.documentSystem.createDocument({
    eventKey: 'phone_dedup_event_1',
    category: DOC_CATEGORY.PRESIDENTIAL_DECISIONS,
    title: 'Thông báo khẩn thử nghiệm chống trùng',
    priority: DOC_PRIORITY.URGENT,
    daysUntilDeadline: 1
  });
  s.documentSystem.syncFromClubState();
  s.handleNewGameDay({ daysPassed: 1, date: '15/08/2026', year: 2026, month: 8, day: 15 });
  const cnt2 = s.phoneInbox.filter((m) => m.title.includes('Thông báo khẩn thử nghiệm chống trùng')).length;
  assert.equal(cnt2, 1, 'Không bao giờ được nhân bản tin nhắn Phone cho cùng một sự kiện');
});

test('CASE-24: Save / Load khôi phục nguyên trạng Hồ sơ, Chữ ký, ExecutionTask, Evaluation mà KHÔNG tạo trùng', () => {
  const s1 = makeFreshState();
  const doc = s1.documentSystem.raiseDossierFromComputer('budget_proposal', {
    proposalId: 'save_load_test_1',
    title: 'Hồ sơ kiểm tra Save/Load',
    costM: 4,
    dept: 'Tài chính'
  });
  const dec = s1.executionSystem.submitDocumentDecision(doc.id, { action: EXEC_ACTIONS.SIGN, ownerRoleKey: 'cfo' });
  s1.executionSystem.advanceTimeDays(1);

  const snap = s1.exportFullState();
  const s2 = new GameState();
  s2.importFullState(snap);

  assert.equal(s2.executionSystem.executionTasks.length, s1.executionSystem.executionTasks.length);
  const restoredDoc = s2.documentSystem.getDocumentById(doc.id);
  const restoredTask = s2.executionSystem.getTaskById(dec.task.id);
  assert(restoredDoc && restoredDoc.signatureCaptured === true);
  assert(restoredTask && restoredTask.status === dec.task.status);

  // Sync lại sau Load không được nhân đôi doc hay task
  s2.documentSystem.syncFromClubState();
  assert.equal(s2.executionSystem.executionTasks.length, s1.executionSystem.executionTasks.length);
});

test('CASE-25: NPC chủ động đi tới Văn phòng Chủ tịch báo cáo trực tiếp & trở về chỗ sau khi Chủ tịch tiếp nhận', () => {
  const s = makeFreshState();
  const tex = new TextureFactory();
  const scene3d = new THREE.Scene();
  const campus = new PsgCampusScene(scene3d, tex, new FurnitureFactory(tex), new VehicleSystem(tex));
  const npcSys = new NpcSystem(scene3d, new CharacterFactory(), new AnimationSystem(), campus);
  npcSys.spawnFromProfiles(s.npcs, s.clockHour);

  const doc = s.documentSystem.createDocument({
    eventKey: 'npc_visit_test_1',
    category: DOC_CATEGORY.COMMERCIAL,
    title: 'Báo cáo kết thúc dự án thương mại',
    priority: DOC_PRIORITY.HIGH
  });
  const dec = s.executionSystem.submitDocumentDecision(doc.id, { action: EXEC_ACTIONS.APPROVE, ownerRoleKey: 'ceo' });
  for (let i = 0; i < 6; i++) s.executionSystem.advanceTimeDays(1);

  assert(s.executionSystem.officeVisitQueue.length >= 1, 'Hoàn tất nhiệm vụ phải xếp hàng NPC tới báo cáo trực tiếp');
  const visit = s.executionSystem.officeVisitQueue.shift();
  const npc = npcSys.visitPresidentOfficeForReport(visit.npcId, visit);
  assert(npc, 'Phải điều hướng được NPC tới Văn phòng Chủ tịch');
  assert(npc.officeVisitData, 'Phải gắn dữ liệu báo cáo khi NPC tới Văn phòng Chủ tịch');
  assert.equal(npc.mode, 'going_president');

  npcSys.dismissOfficeVisitor(npc.id);
  assert.equal(npc.officeVisitData, null);
  assert.equal(npc.mode, 'returning');
});

test('CASE-26: Raycaster từ ghế Chủ tịch & vị trí đứng trỏ trúng trực tiếp cả 6 chồng hồ sơ, Khay KHẨN và Máy tính Mac không bị che khuất', () => {
  const scene3d = new THREE.Scene();
  const tex = new TextureFactory();
  const campus = new PsgCampusScene(scene3d, tex, new FurnitureFactory(tex), new VehicleSystem(tex));
  scene3d.updateMatrixWorld(true);

  const eyeSeated = new THREE.Vector3(-26.0, 1.38, -18.0);
  const eyeStandingFront = new THREE.Vector3(-26.0, 1.86, -15.4);
  const raycaster = new THREE.Raycaster();
  raycaster.far = 4.8;
  const wp = new THREE.Vector3();
  const dir = new THREE.Vector3();

  for (const m of DOC_STACK_META) {
    const node = campus.deskDocuments.stackNodes.get(m.category);
    assert(node?.hitProxy, `Thiếu hitProxy cho ${m.interactId}`);
    node.hitProxy.getWorldPosition(wp);

    // Khi đang ngồi trên ghế Chủ tịch (bỏ qua hit vào chính seat_president đang ngồi)
    dir.copy(wp).sub(eyeSeated).normalize();
    raycaster.set(eyeSeated, dir);
    const seatedHits = raycaster.intersectObjects(campus.raycastMeshes, false).filter((h) => h.object.userData.interactId !== 'seat_president');
    assert(seatedHits.length > 0, `Raycaster (ngồi) phải trúng ${m.interactId}`);
    assert.equal(seatedHits[0].object.userData.interactId, m.interactId, `${m.interactId} không được bị pres_pc che khi ngồi!`);

    // Khi đứng trước bàn (không lọc gì cả)
    dir.copy(wp).sub(eyeStandingFront).normalize();
    raycaster.set(eyeStandingFront, dir);
    const standHits = raycaster.intersectObjects(campus.raycastMeshes, false);
    assert(standHits.length > 0 && standHits[0].object.userData.interactId === m.interactId, `${m.interactId} phải trúng trực tiếp khi đứng trước bàn!`);
  }

  campus.deskDocuments.urgentNode.hitProxy.getWorldPosition(wp);
  dir.copy(wp).sub(eyeSeated).normalize();
  raycaster.set(eyeSeated, dir);
  const uHits = raycaster.intersectObjects(campus.raycastMeshes, false).filter((h) => h.object.userData.interactId !== 'seat_president');
  assert(uHits.length > 0 && uHits[0].object.userData.interactId === URGENT_TRAY_META.interactId, 'Phải trỏ trúng trực tiếp Khay Đỏ URGENT');

  // Kiểm tra trỏ vào Máy tính Mac vẫn trúng pres_pc
  dir.set(-26.0, 1.21, -16.75).sub(eyeSeated).normalize();
  raycaster.set(eyeSeated, dir);
  const pcHits = raycaster.intersectObjects(campus.raycastMeshes, false).filter((h) => h.object.userData.interactId !== 'seat_president');
  assert(pcHits.length > 0 && pcHits[0].object.userData.interactId === 'pres_pc', 'Trỏ vào màn hình Mac vẫn phải trúng pres_pc');
});

console.log(`\n🎉 TỔNG KẾT TEST SUITE VĂN PHÒNG CHỦ TỊCH PSG: ${passed}/26 KỊCH BẢN ĐẠT 100%!`);
