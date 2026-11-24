// src/ui/FormationPitchView.js
// Giao diện Đội Hình Chiến Thuật PSG (Chạm 2 lần để Thay/Hoán đổi — KHÔNG kéo thả):
// 1. Header -> 2. Thanh Chiến thuật & Sơ đồ -> 3. Sân bóng cố định + Banner hướng dẫn
// -> 4. Danh sách Dự bị cuộn độc lập (30-45+ cầu thủ, Card 2 cột / List, Tìm kiếm, 7 Bộ lọc)
// -> 5. Đánh giá AI Position Suitability toàn đội & cầu thủ đang chọn

import { FORMATION_PRESETS } from '../squad/SquadFormationSystem.js';
import {
  CANONICAL_POSITIONS as ALL_POSITIONS,
  POSITION_DISPLAY_LABEL,
  normalizePosition,
  getSuitabilityTier as getSuitabilityVisual
} from '../squad/PositionSuitabilityAI.js';
import { getPlayerPortraitDataUrl } from '../players/PlayerDatabase.js';

const BENCH_FILTERS = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'GK', label: 'Thủ môn' },
  { key: 'DEF', label: 'Hậu vệ' },
  { key: 'MID', label: 'Tiền vệ' },
  { key: 'ATT', label: 'Tiền đạo' },
  { key: 'YOUTH', label: 'Cầu thủ trẻ' },
  { key: 'MULTI', label: 'Đa năng' }
];

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getPlayerAvatarSrc(p) {
  if (!p) return '';
  if (p.avatarSvg) return p.avatarSvg;
  return getPlayerPortraitDataUrl(p);
}

function matchesBenchFilter(benchItem, filterKey) {
  const pos = normalizePosition(benchItem.position);
  const p = benchItem.player || {};
  switch (filterKey) {
    case 'GK': return pos === 'GK';
    case 'DEF': return ['CB', 'LB', 'RB'].includes(pos);
    case 'MID': return ['DM', 'CM', 'AM'].includes(pos);
    case 'ATT': return ['LW', 'RW', 'ST'].includes(pos);
    case 'YOUTH': return (Number(p.age) > 0 && Number(p.age) <= 21) || !!p.academyOrigin;
    case 'MULTI': return Array.isArray(p.secondaryPositions) && p.secondaryPositions.length > 0;
    case 'ALL':
    default:
      return true;
  }
}

function matchesSearchQuery(benchItem, rawQuery) {
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q) return true;
  const full = String(benchItem.fullName || '').toLowerCase();
  const disp = String(benchItem.displayName || '').toLowerCase();
  const num = String(benchItem.shirtNumber ?? '');
  const cleanQ = q.replace(/^#/, '');
  return full.includes(q) || disp.includes(q) || (cleanQ && num === cleanQ) || num.includes(cleanQ);
}

function renderPitchLinesSvg() {
  return `
    <svg class="tac-pitch-svg" viewBox="0 0 100 130" preserveAspectRatio="none" aria-hidden="true">
      <rect x="4" y="4" width="92" height="122" fill="none" stroke="rgba(255,255,255,0.44)" stroke-width="0.7" />
      <line x1="4" y1="65" x2="96" y2="65" stroke="rgba(255,255,255,0.42)" stroke-width="0.6" />
      <circle cx="50" cy="65" r="11.5" fill="none" stroke="rgba(255,255,255,0.42)" stroke-width="0.6" />
      <circle cx="50" cy="65" r="0.9" fill="rgba(255,255,255,0.65)" />
      <rect x="23" y="4" width="54" height="18" fill="none" stroke="rgba(255,255,255,0.42)" stroke-width="0.6" />
      <rect x="35" y="4" width="30" height="7" fill="none" stroke="rgba(255,255,255,0.42)" stroke-width="0.6" />
      <rect x="23" y="108" width="54" height="18" fill="none" stroke="rgba(255,255,255,0.42)" stroke-width="0.6" />
      <rect x="35" y="119" width="30" height="7" fill="none" stroke="rgba(255,255,255,0.42)" stroke-width="0.6" />
      <circle cx="50" cy="113" r="0.8" fill="rgba(255,255,255,0.65)" />
      <path d="M 38 108 A 14 14 0 0 1 62 108" fill="none" stroke="rgba(255,255,255,0.36)" stroke-width="0.55" />
    </svg>`;
}

export function renderFormationPitchTabHTML(state, uiState) {
  const fs = state.formationSystem;
  const data = fs.getFormationData();
  const teamEval = fs.getSquadEvaluation();
  const ctx = fs.getContext();
  const isInMatch = !!data.subSession?.active;

  const selectedSlotIdx = Number.isInteger(uiState.selectedSlotIdx) ? uiState.selectedSlotIdx : null;
  const selectedBenchId = uiState.selectedBenchId || null;
  const benchFilter = uiState.benchPosFilter || 'ALL';
  const benchViewMode = uiState.benchViewMode === 'list' ? 'list' : 'card';
  const benchSearchQuery = String(uiState.benchSearchQuery || '');
  const pendingPreview = uiState.pendingFormationPreview || null;

  const selectedSlot = selectedSlotIdx !== null ? data.slots[selectedSlotIdx] : null;
  const selectedBenchItem = selectedBenchId ? data.bench.find((b) => b.playerId === selectedBenchId) : null;
  const inspectedPlayer = selectedSlot?.player || selectedBenchItem?.player || data.starters[0]?.player || null;
  const inspectedRole = selectedSlot ? selectedSlot.role : (inspectedPlayer?.position || 'CM');

  const top3Report = inspectedPlayer
    ? fs.suitabilityAI.getTop3Positions(inspectedPlayer, ctx, inspectedRole)
    : null;
  const inspectedSuit = inspectedPlayer
    ? fs.suitabilityAI.evaluatePlayerAtPosition(inspectedPlayer, inspectedRole, ctx)
    : null;

  const formCompare = fs.suitabilityAI.compareFormations(state.getPsgSquad(), FORMATION_PRESETS, data.formation, ctx);

  // Đánh giá Top 3 cầu thủ dự bị phù hợp nhất khi Chủ tịch đã chọn 1 vị trí/cầu thủ trên sân
  const benchSuitMap = new Map();
  const top3ReplacementRankMap = new Map();
  if (selectedSlot) {
    const scoredCandidates = [];
    data.bench.forEach((b) => {
      if (!b.player) return;
      const ev = fs.suitabilityAI.evaluatePlayerAtPosition(b.player, selectedSlot.role, ctx);
      benchSuitMap.set(b.playerId, ev);
      if (b.availability === 'available') {
        scoredCandidates.push({ playerId: b.playerId, score: ev.score });
      }
    });
    scoredCandidates.sort((a, b) => b.score - a.score);
    scoredCandidates.slice(0, 3).forEach((cand, idx) => {
      top3ReplacementRankMap.set(cand.playerId, idx + 1);
    });
  }

  // Banner hướng dẫn thao tác Chạm 2 bước
  let bannerActive = false;
  let bannerHtml = 'Chạm 1 cầu thủ trên sân để <b>thay dự bị</b> hoặc <b>hoán đổi vị trí</b> (hoặc chạm cầu thủ dự bị trước).';
  if (selectedSlot && selectedSlot.player) {
    bannerActive = true;
    bannerHtml = `Đang chọn <strong>#${selectedSlot.player.shirtNumber || ''} ${escapeHtml(selectedSlot.player.name)}</strong> (${escapeHtml(selectedSlot.displayRole)}) — <b>Hãy chọn cầu thủ dự bị để thay thế</b> hoặc chạm cầu thủ khác trên sân để hoán đổi.`;
  } else if (selectedSlot && !selectedSlot.player) {
    bannerActive = true;
    bannerHtml = `Đang chọn ô trống <strong>${escapeHtml(selectedSlot.displayRole)}</strong> — <b>Hãy chọn cầu thủ dự bị để đưa vào sân</b>.`;
  } else if (selectedBenchItem) {
    bannerActive = true;
    const posLbl = escapeHtml(selectedBenchItem.displayPosition || selectedBenchItem.position);
    bannerHtml = `Đang chọn dự bị <strong>#${selectedBenchItem.shirtNumber || ''} ${escapeHtml(selectedBenchItem.fullName)}</strong> (${posLbl}) — <b>Chạm vào 1 cầu thủ trên sân</b> để thay thế ngay.`;
  }

  // FilterCounts cho 7 nhóm bộ lọc
  const filterCounts = {};
  BENCH_FILTERS.forEach((f) => {
    filterCounts[f.key] = data.bench.filter((b) => matchesBenchFilter(b, f.key)).length;
  });

  // Lọc toàn bộ danh sách dự bị (không cắt ngắn để hiển thị đủ 30–40+ cầu thủ)
  const filteredBench = data.bench
    .filter((b) => matchesBenchFilter(b, benchFilter) && matchesSearchQuery(b, benchSearchQuery));

  if (selectedSlot) {
    filteredBench.sort((a, b) => {
      const availA = a.availability === 'available' ? 1 : 0;
      const availB = b.availability === 'available' ? 1 : 0;
      if (availA !== availB) return availB - availA;
      const sa = benchSuitMap.get(a.playerId)?.score || 0;
      const sb = benchSuitMap.get(b.playerId)?.score || 0;
      return sb - sa;
    });
  }

  const slotCardsHtml = data.slots.map((sl) => {
    const isSelected = selectedSlotIdx === sl.slotIndex;
    const isSwapTarget = !isSelected && (selectedSlotIdx !== null || selectedBenchId !== null);
    const yCss = Math.max(8, Math.min(93, Math.round(sl.formationY * 0.96)));
    if (!sl.player) {
      return `
        <button type="button"
          class="tac-slot-card empty ${isSelected ? 'selected' : ''} ${isSwapTarget ? 'swap-target' : ''}"
          data-slotidx="${sl.slotIndex}"
          style="left:${sl.formationX}%;top:${yCss}%;"
          title="Vị trí trống (${escapeHtml(sl.displayRole)}) — Chạm để xếp cầu thủ">
          <span class="tac-empty-plus">+</span>
          <span class="tac-slot-role-pill">${escapeHtml(sl.displayRole)}</span>
          <span class="tac-empty-lbl">Trống</span>
        </button>`;
    }

    const p = sl.player;
    const suit = sl.suitability || { score: 75, badgeColor: '#38bdf8', shortReason: '' };
    const vis = getSuitabilityVisual(suit.score);
    const isCap = p.id === data.captainId;
    const mismatchWarn = suit.score < 62;
    const surname = escapeHtml(fs.getDisplaySurname(p.name));

    return `
      <button type="button"
        class="tac-slot-card ${isSelected ? 'selected' : ''} ${isSwapTarget ? 'swap-target' : ''} ${mismatchWarn ? 'mismatch-warn' : ''}"
        data-slotidx="${sl.slotIndex}"
        data-pid="${p.id}"
        style="left:${sl.formationX}%;top:${yCss}%;--suit-border:${vis.border};"
        title="${escapeHtml(p.name)} (${escapeHtml(p.position)}) tại ${escapeHtml(sl.displayRole)} — Phù hợp ${suit.score}/100">
        <div class="tac-card-top">
          <img class="tac-avatar" src="${getPlayerAvatarSrc(p)}" alt="${surname}" />
          <span class="tac-num-badge">${p.shirtNumber || '-'}</span>
          ${isCap ? '<span class="tac-cap-badge">C</span>' : ''}
          <span class="tac-suit-pill" style="background:${vis.bg};color:${vis.color};border-color:${vis.border};">${suit.score}</span>
        </div>
        <div class="tac-card-name">${surname}</div>
        <div class="tac-card-meta"><span>${escapeHtml(sl.displayRole)}</span><b>${p.ovr}</b></div>
      </button>`;
  }).join('');

  const matchBannerHtml = isInMatch ? `
    <div class="tac-match-banner">
      <div>
        <span class="psgtv-live-badge on">● TRONG TRẬN · PHÚT ${data.subSession.matchMinute}'</span>
        <b>Lượt thay người còn lại: ${data.subSession.maxSubs - data.subSession.subsUsed}/${data.subSession.maxSubs}</b>
        <span class="muted"> · Chạm cầu thủ đang đá rồi chạm dự bị để thay người (hoặc chạm 2 cầu thủ trên sân để đổi chỗ)</span>
      </div>
      ${data.subSession.subHistory.length > 0 ? `
        <div class="tac-sub-log">
          ${data.subSession.subHistory.map((h) => `<span class="tag ok">${h.minute}' 🔄 ${escapeHtml(h.inName)} ← ${escapeHtml(h.outName)}</span>`).join('')}
        </div>` : ''}
    </div>` : '';

  const previewModalHtml = pendingPreview ? `
    <div class="tac-confirm-card">
      <div class="card-head">
        <strong>🔄 Đánh giá chuyển từ ${escapeHtml(pendingPreview.currentFormation)} → ${escapeHtml(pendingPreview.targetFormation)}</strong>
        <span class="tag ${pendingPreview.mismatches.length > 0 ? 'bad' : 'ok'}">${pendingPreview.mismatches.length} vị trí lệch</span>
      </div>
      <div class="kpi-mini" style="margin:6px 0;">
        <span>Hiện tại: <b>${pendingPreview.currentEvaluation.avgSuitability}/100</b></span>
        <span>Giữ nguyên người sang ${escapeHtml(pendingPreview.targetFormation)}: <b style="color:${pendingPreview.keepLineupEvaluation.avgSuitability < 75 ? '#f87171' : '#fde68a'}">${pendingPreview.keepLineupEvaluation.avgSuitability}/100</b></span>
        <span>AI sắp xếp tối ưu: <b style="color:#4ade80;">${pendingPreview.optimalEvaluation.avgSuitability}/100</b></span>
      </div>
      ${pendingPreview.mismatches.length > 0 ? `
        <div class="muted" style="margin-bottom:6px;">
          <b>Cảnh báo lệch vai trò nếu giữ người cũ:</b>
          ${pendingPreview.mismatches.slice(0, 4).map((m) => `${escapeHtml(m.playerName)} (${escapeHtml(m.naturalPosition)} → ${escapeHtml(m.targetRole)}: ${m.score}đ)`).join(' · ')}
        </div>` : ''}
      <div class="btn-row">
        <button type="button" class="btn-xs btn-primary" id="tac-pv-auto">✨ Đổi sang ${escapeHtml(pendingPreview.targetFormation)} & AI tự xếp tốt nhất</button>
        <button type="button" class="btn-xs btn-secondary" id="tac-pv-keep">Giữ đội hình hiện tại, chỉ đổi khung</button>
        <button type="button" class="btn-xs btn-danger" id="tac-pv-cancel">Hủy</button>
      </div>
    </div>` : '';

  const optimalConfirmHtml = uiState.confirmOptimalXI ? `
    <div class="tac-confirm-card">
      <div class="card-head"><strong>✨ Xác nhận AI Tự Sắp Xếp Đội Hình Tối Ưu</strong></div>
      <p class="muted" style="margin:4px 0 8px;">Hệ thống AI sẽ chọn 11 cầu thủ khỏe mạnh phù hợp nhất với sơ đồ <b>${escapeHtml(data.formation)}</b> & chiến thuật <b>${escapeHtml(data.tacticName)}</b>.</p>
      <div class="btn-row">
        <button type="button" class="btn-xs btn-primary" id="tac-opt-yes">✅ Áp dụng ngay</button>
        <button type="button" class="btn-xs btn-secondary" id="tac-opt-no">Hủy</button>
      </div>
    </div>` : '';

  const inspectedVis = inspectedSuit ? getSuitabilityVisual(inspectedSuit.score) : getSuitabilityVisual(80);
  const availTag = !inspectedPlayer ? ''
    : (inspectedPlayer.injuryDays || 0) > 0 ? `<span class="tag bad">🏥 Chấn thương ${inspectedPlayer.injuryDays}n</span>`
      : inspectedPlayer.suspended ? '<span class="tag bad">🟥 Treo giò</span>'
        : data.subSession.subbedOutIds?.includes(inspectedPlayer.id) ? '<span class="tag bad">🔻 Đã rời sân</span>'
          : '<span class="tag ok">✅ Sẵn sàng</span>';

  const benchCardsHtml = filteredBench.length > 0 ? filteredBench.map((b) => {
    const p = b.player;
    const isSel = selectedBenchId === b.playerId;
    const disabled = b.availability !== 'available';
    const rank = !disabled ? top3ReplacementRankMap.get(b.playerId) : null;
    const fitEval = benchSuitMap.get(b.playerId);
    const fitVis = fitEval ? getSuitabilityVisual(fitEval.score) : null;
    const reasonBadge = b.availability === 'injured' ? `🏥 ${p.injuryDays}n`
      : b.availability === 'suspended' ? '🟥 Treo giò'
        : b.availability === 'subbed_out' ? '🔻 Đã ra sân'
          : `TL ${p.health?.fitness ?? 90}%`;

    const secPosStr = Array.isArray(p.secondaryPositions) && p.secondaryPositions.length > 0
      ? ` · Phụ: ${p.secondaryPositions.map((sp) => POSITION_DISPLAY_LABEL[sp] || sp).join('/')}`
      : '';
    const youthTag = ((p.age <= 21 || p.academyOrigin) ? ' · 🎓 Trẻ' : '');

    return `
      <button type="button"
        class="tac-bench-card ${isSel ? 'selected' : ''} ${rank ? 'top-fit-rec' : ''} ${disabled ? 'disabled' : ''}"
        data-benchpid="${b.playerId}"
        data-avail="${b.availability}"
        title="${escapeHtml(b.fullName)} · ${escapeHtml(b.position)} · OVR ${p.ovr}${fitEval ? ` · Hợp ${selectedSlot?.displayRole}: ${fitEval.score}/100` : ''}">
        <img class="tac-bench-avatar" src="${getPlayerAvatarSrc(p)}" alt="${escapeHtml(b.displayName)}" />
        <div class="tac-bench-info">
          <div class="tac-bench-title">#${b.shirtNumber || '-'} ${escapeHtml(b.fullName)}</div>
          <div class="tac-bench-sub">
            <b>${escapeHtml(b.displayPosition || b.position)}</b> · OVR <b>${p.ovr}</b>${benchViewMode === 'list' ? `${secPosStr}${youthTag}` : ''} · ${reasonBadge}
          </div>
        </div>
        <div class="tac-bench-right">
          ${rank ? `<span class="tag ok" style="font-size:9.5px;">Top ${rank}</span>` : ''}
          ${fitEval ? `<span class="tac-fit-badge" style="background:${fitVis.bg};color:${fitVis.color};border-color:${fitVis.border};">${fitEval.score}đ</span>` : `<span class="tag">${escapeHtml(b.position)}</span>`}
        </div>
      </button>`;
  }).join('') : `<div class="muted" style="padding:14px 8px;text-align:center;">Không có cầu thủ dự bị nào khớp với từ khóa / bộ lọc hiện tại.</div>`;

  return `
    <div class="tac-root" id="tac-root">
      <!-- PHẦN 1: HEADER QUẢN LÝ ĐỘI HÌNH -->
      <div class="tac-header-bar">
        <div>
          <div class="tac-header-title">👕 QUẢN LÝ ĐỘI HÌNH & CHIẾN THUẬT PSG</div>
          <div class="muted">Sơ đồ <b>${escapeHtml(data.formation)}</b> · Lối chơi <b>${escapeHtml(data.tacticName)}</b> · Đá chính ${data.starters.length}/11 · Dự bị ${data.bench.length} cầu thủ</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <span class="tag ok">AI TB: ${teamEval.avgSuitability}/100</span>
          <span class="tag ${isInMatch ? 'bad' : ''}">${isInMatch ? `🔴 TRONG TRẬN (${data.subSession.maxSubs - data.subSession.subsUsed} lượt)` : '🟢 TRƯỚC TRẬN'}</span>
        </div>
      </div>

      <!-- PHẦN 2: THANH CHIẾN THUẬT & SƠ ĐỒ -->
      <div class="tac-toolbar">
        <div class="tac-toolbar-row">
          <select id="tac-form-select" class="input-ctrl tac-select" ${isInMatch ? 'disabled' : ''}>
            ${Object.keys(FORMATION_PRESETS).map((f) => `<option value="${f}" ${data.formation === f ? 'selected' : ''}>${f}</option>`).join('')}
          </select>
          <input id="tac-name-input" class="input-ctrl tac-name-input" value="${escapeHtml(data.tacticName)}" placeholder="Tên chiến thuật PSG..." />
          <button type="button" class="btn-secondary tac-btn" id="tac-name-save">💾 Lưu tên</button>
          <button type="button" class="btn-primary tac-btn" id="tac-optimal-btn" ${isInMatch ? 'disabled' : ''}>✨ Tự xếp 11 tối ưu</button>
          <button type="button" class="btn-secondary tac-btn" id="tac-undo-btn" ${fs.canUndo() ? '' : 'disabled'}>↩️ Hoàn tác</button>
          ${data.emptySlots.length > 0 ? `<button type="button" class="btn-accent tac-btn" id="tac-fill-empty">➕ Điền ${data.emptySlots.length} vị trí trống</button>` : ''}
          <button type="button" class="btn-accent tac-btn ${isInMatch ? 'tac-btn-live' : ''}" id="tac-match-toggle">
            ${isInMatch ? `🏁 Kết thúc trận (${data.subSession.subsUsed}/${data.subSession.maxSubs})` : '⚽ Mô phỏng Trong Trận (5 lượt)'}
          </button>
        </div>
        <div class="tac-sync-bar muted">
          ⚡ Đồng bộ tức thì: <b>Phòng Thay Đồ 3D (${fs.lockers.filter((l) => l.isAssigned).length} tủ)</b> · <b>Sân Tập 3D</b> · <b>Trận Đấu 3D</b> · ${data.emptySlots.length === 0 ? '<span style="color:#4ade80;">Đủ 11 cầu thủ ra sân</span>' : `<span style="color:#f87171;">⚠️ Còn ${data.emptySlots.length} vị trí trống!</span>`}
        </div>
      </div>

      ${matchBannerHtml}
      ${previewModalHtml}
      ${optimalConfirmHtml}

      <!-- PHẦN 3 & 4: SÂN BÓNG CỐ ĐỊNH + BANNER CHỌN 2 BƯỚC & DỰ BỊ CUỘN ĐỘC LẬP -->
      <div class="tac-board-layout">
        <!-- PHẦN 3: SÂN BÓNG CHIẾN THUẬT CỐ ĐỊNH -->
        <div class="tac-pitch-sticky">
          <div id="tac-selection-banner" class="tac-selection-banner ${bannerActive ? 'is-active' : ''}">
            <div class="tac-selection-text">${bannerHtml}</div>
            ${bannerActive ? '<button type="button" class="btn-xs btn-danger" id="tac-cancel-select">✕ Hủy chọn</button>' : ''}
          </div>
          <div class="tac-pitch-board" id="tac-pitch-board">
            <div class="tac-goal-label top">KHUNG THÀNH ĐỐI PHƯƠNG</div>
            ${renderPitchLinesSvg()}
            ${slotCardsHtml}
            <div class="tac-goal-label bot">KHUNG THÀNH PSG</div>
          </div>
        </div>

        <!-- PHẦN 4: DANH SÁCH DỰ BỊ CUỘN ĐỘC LẬP -->
        <div class="tac-bench-section">
          <div class="tac-bench-header">
            <div class="tac-bench-top-row">
              <strong>🪑 Dự bị & Xoay tua (${filteredBench.length}/${data.bench.length})</strong>
              <div class="tac-bench-view-toggle" role="group" aria-label="Chế độ xem dự bị">
                <button type="button" id="tac-view-card" class="tac-view-btn ${benchViewMode === 'card' ? 'active' : ''}">⊞ Thẻ (2 cột)</button>
                <button type="button" id="tac-view-list" class="tac-view-btn ${benchViewMode === 'list' ? 'active' : ''}">☰ Danh sách</button>
              </div>
            </div>
            <div class="tac-bench-search-row">
              <input id="tac-bench-search" type="search" class="input-ctrl tac-bench-search" value="${escapeHtml(benchSearchQuery)}" placeholder="Tìm theo tên hoặc số áo (#)..." />
              ${benchSearchQuery ? '<button type="button" class="btn-xs btn-secondary" id="tac-bench-clear-q">✕</button>' : ''}
            </div>
            <div class="tac-bench-tabs">
              ${BENCH_FILTERS.map((f) => `<button type="button" class="tac-filter-btn ${benchFilter === f.key ? 'active' : ''}" data-bfilter="${f.key}">${f.label} (${filterCounts[f.key] ?? 0})</button>`).join('')}
            </div>
          </div>
          <div class="tac-bench-scroll" id="tac-bench-scroll">
            <div class="tac-bench-grid ${benchViewMode === 'list' ? 'mode-list' : 'mode-card'}">
              ${benchCardsHtml}
            </div>
          </div>
        </div>
      </div>

      <!-- PHẦN 5: ĐÁNH GIÁ ĐỘI HÌNH & CHI TIẾT AI POSITION SUITABILITY -->
      <div class="tac-eval-section">
        <div class="card-item" style="margin-bottom:0;">
          ${inspectedPlayer ? `
            <div class="tac-player-hero">
              <img class="tac-hero-img" src="${getPlayerAvatarSrc(inspectedPlayer)}" alt="${escapeHtml(inspectedPlayer.name)}" />
              <div style="flex:1;min-width:0;">
                <div class="card-head" style="margin-bottom:2px;">
                  <strong>#${inspectedPlayer.shirtNumber || '-'} ${escapeHtml(inspectedPlayer.name)}</strong>
                  ${availTag}
                </div>
                <div class="muted">
                  Sở trường: <b>${escapeHtml(POSITION_DISPLAY_LABEL[inspectedPlayer.position] || inspectedPlayer.position)}</b>
                  · OVR <b>${inspectedPlayer.ovr}</b>/POT ${inspectedPlayer.pot} · TL ${inspectedPlayer.health?.fitness ?? 90}%
                </div>
                <div style="margin-top:4px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                  <span class="tag" style="background:${inspectedVis.bg};color:${inspectedVis.color};border:1px solid ${inspectedVis.border};">
                    ${selectedSlot ? `Tại ${escapeHtml(selectedSlot.displayRole)}` : `Vị trí gốc`}: <b>${inspectedSuit.score}/100</b> (${escapeHtml(inspectedSuit.tier?.label || '')})
                  </span>
                </div>
              </div>
            </div>

            <div class="tac-quick-actions">
              <button type="button" class="btn-xs btn-secondary open-profile-btn" data-pid="${inspectedPlayer.id}">👤 Hồ sơ 8 tab</button>
              <button type="button" class="btn-xs btn-accent" id="tac-set-cap" data-pid="${inspectedPlayer.id}">${inspectedPlayer.id === data.captainId ? '©️ Đang là Đội trưởng' : '©️ Chọn làm Đội trưởng'}</button>
              ${selectedSlot && !isInMatch ? `<button type="button" class="btn-xs btn-danger" id="tac-bench-slot" data-slot="${selectedSlot.slotIndex}">⬇️ Rút xuống dự bị</button>` : ''}
              <div class="tac-num-edit">
                <input id="tac-num-inp" type="number" min="1" max="99" value="${inspectedPlayer.shirtNumber || 10}" class="input-ctrl" style="width:54px;min-width:54px;padding:3px 6px;" />
                <button type="button" class="btn-xs btn-primary" id="tac-num-save" data-pid="${inspectedPlayer.id}">Lưu số</button>
              </div>
            </div>

            ${selectedSlot ? `
              <div class="tac-role-changer">
                <span class="muted">Đổi vai trò chiến thuật của ô #${selectedSlot.slotIndex + 1} (${escapeHtml(selectedSlot.displayRole)}):</span>
                <div class="tac-role-chips">
                  ${ALL_POSITIONS.map((rp) => `<button type="button" class="tac-role-chip ${selectedSlot.role === rp ? 'active' : ''}" data-setrole="${rp}">${escapeHtml(POSITION_DISPLAY_LABEL[rp] || rp)}</button>`).join('')}
                </div>
              </div>` : ''}

            <div class="section-label" style="margin-top:8px;">🧠 Top 3 vị trí phù hợp nhất (AI Suitability)</div>
            <div class="tac-top3-list">
              ${(top3Report?.top3 || []).map((item, i) => {
                const v = getSuitabilityVisual(item.score);
                return `
                  <div class="tac-top3-row">
                    <span class="tac-rank">#${i + 1}</span>
                    <b>${escapeHtml(item.displayPosition)}</b>
                    <div class="tac-score-bar-track"><div class="tac-score-bar-fill" style="width:${item.score}%;background:${v.color};"></div></div>
                    <b style="color:${v.color};">${item.score}</b>
                  </div>`;
              }).join('')}
            </div>
            <div class="tac-ai-explain">
              <div><b>Phân tích AI:</b> ${escapeHtml(inspectedSuit?.explanation || '')}</div>
              <div class="muted" style="margin-top:3px;">${escapeHtml(top3Report?.recommendationText || '')}</div>
            </div>` : '<div class="muted">Chạm vào một cầu thủ bất kỳ để xem phân tích AI.</div>'}
        </div>

        <div class="card-item" style="margin-bottom:0;">
          <div class="card-head">
            <strong>📊 Đánh giá Tổng hợp Đội hình (${escapeHtml(data.formation)})</strong>
            <span class="tag ${teamEval.avgSuitability >= 82 ? 'ok' : teamEval.avgSuitability >= 68 ? '' : 'bad'}">Tối ưu ${teamEval.overallScore ?? teamEval.avgSuitability}/100</span>
          </div>
          <div class="tac-kpi-4">
            <div class="tac-mini-kpi"><span>Phù hợp TB</span><b>${teamEval.avgSuitability}/100</b></div>
            <div class="tac-mini-kpi"><span>Cân bằng</span><b>${teamEval.balanceScore ?? 80}/100</b></div>
            <div class="tac-mini-kpi"><span>Hợp HLV</span><b>${teamEval.coachTacticFit ?? 82}/100</b></div>
            <div class="tac-mini-kpi"><span>Vắng / Lệch</span><b style="color:${((teamEval.weakPositions || []).length + data.emptySlots.length) > 0 ? '#f87171' : '#4ade80'}">${(teamEval.weakPositions || []).length}</b></div>
          </div>
          <div class="tac-pos-counts muted">
            <span>GK: <b>${teamEval.ratings?.gk ?? '--'}</b></span> ·
            <span>HV: <b>${teamEval.ratings?.defense ?? '--'}</b></span> ·
            <span>TV: <b>${teamEval.ratings?.midfield ?? '--'}</b></span> ·
            <span>TĐ: <b>${teamEval.ratings?.attack ?? '--'}</b></span>
          </div>
          ${(teamEval.weakPositions || []).length > 0 ? `
            <div class="section-label">⚠️ Điểm yếu đội hình cần điều chỉnh</div>
            <div class="tac-weak-list">
              ${teamEval.weakPositions.slice(0, 3).map((w) => `
                <button type="button" class="tac-weak-chip" data-focus-slot="${w.slotIndex}">
                  Slot #${w.slotIndex + 1} (${escapeHtml(w.assignedPos)}): <b>${escapeHtml(w.playerName)}</b> chỉ đạt ${w.score}/100 — Gợi ý: <b>${escapeHtml(w.bestPos)}</b>
                </button>`).join('')}
            </div>` : '<div class="muted" style="margin-top:6px;color:#86efac;">✅ Toàn bộ các tuyến đều đạt độ phù hợp chiến thuật tốt!</div>'}
          <div class="section-label">📐 Xếp hạng sơ đồ tốt nhất cho PSG</div>
          <div class="tac-form-rank">
            ${formCompare.slice(0, 4).map((fc) => `
              <button type="button" class="tac-form-pill ${fc.formation === data.formation ? 'current' : ''}" data-pickform="${fc.formation}">
                <b>${escapeHtml(fc.formation)}</b>
                <span>${fc.avgSuit ?? fc.avgSuitability ?? fc.score}đ</span>
              </button>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
}

export function bindFormationPitchEvents(state, uiState, onRerender, extraCallbacks = {}) {
  const fs = state.formationSystem;
  if (!fs || typeof document === 'undefined') return;

  const rerenderNow = (extraOpts = {}) => {
    const benchScroll = document.getElementById('tac-bench-scroll');
    const savedBenchTop = benchScroll ? Math.round(benchScroll.scrollTop || 0) : 0;
    onRerender({ ...extraOpts, savedBenchTop });
  };

  const clearSelection = () => {
    uiState.selectedSlotIdx = null;
    uiState.selectedBenchId = null;
  };

  // --- Nút Hủy chọn ---
  document.getElementById('tac-cancel-select')?.addEventListener('click', (e) => {
    e.stopPropagation();
    clearSelection();
    uiState.audio?.playClick?.();
    rerenderNow();
  });

  // --- Đổi sơ đồ (chỉ xem trước xác nhận chứ KHÔNG tự phá đội hình đang xếp) ---
  document.getElementById('tac-form-select')?.addEventListener('change', (e) => {
    const nextForm = e.target.value;
    if (nextForm === fs.formation) return;
    uiState.pendingFormationPreview = fs.previewFormationChange(nextForm);
    uiState.confirmOptimalXI = false;
    uiState.audio?.playClick?.();
    rerenderNow();
  });

  document.getElementById('tac-pv-auto')?.addEventListener('click', () => {
    if (!uiState.pendingFormationPreview) return;
    fs.setFormation(uiState.pendingFormationPreview.targetFormation, { autoArrange: true });
    uiState.pendingFormationPreview = null;
    clearSelection();
    uiState.audio?.playSuccess?.();
    uiState.toast?.(`✨ Đã đổi sang ${fs.formation} và AI tự sắp xếp 11 cầu thủ tối ưu!`, 'success');
    rerenderNow();
  });
  document.getElementById('tac-pv-keep')?.addEventListener('click', () => {
    if (!uiState.pendingFormationPreview) return;
    fs.setFormation(uiState.pendingFormationPreview.targetFormation, { autoArrange: false });
    uiState.pendingFormationPreview = null;
    clearSelection();
    uiState.audio?.playClick?.();
    rerenderNow();
  });
  document.getElementById('tac-pv-cancel')?.addEventListener('click', () => {
    uiState.pendingFormationPreview = null;
    uiState.audio?.playClick?.();
    rerenderNow();
  });

  // --- Tên chiến thuật & AI tự xếp tối ưu & Hoàn tác ---
  document.getElementById('tac-name-save')?.addEventListener('click', () => {
    const val = document.getElementById('tac-name-input')?.value || 'Chiến thuật PSG';
    fs.setTacticName(val);
    uiState.audio?.playSuccess?.();
    uiState.toast?.(`Đã cập nhật chiến thuật "${fs.tacticName}"`, 'success');
    rerenderNow();
  });
  document.getElementById('tac-optimal-btn')?.addEventListener('click', () => {
    uiState.confirmOptimalXI = true;
    uiState.pendingFormationPreview = null;
    rerenderNow();
  });
  document.getElementById('tac-opt-yes')?.addEventListener('click', () => {
    fs.applyOptimalXI();
    uiState.confirmOptimalXI = false;
    clearSelection();
    uiState.audio?.playSuccess?.();
    uiState.toast?.('✨ AI đã sắp xếp đội hình xuất phát tối ưu nhất!', 'success');
    rerenderNow();
  });
  document.getElementById('tac-opt-no')?.addEventListener('click', () => {
    uiState.confirmOptimalXI = false;
    rerenderNow();
  });
  document.getElementById('tac-undo-btn')?.addEventListener('click', () => {
    const res = fs.undo();
    if (res.ok) {
      clearSelection();
      uiState.audio?.playClick?.();
      uiState.toast?.('↩️ Đã hoàn tác thao tác đội hình trước đó.', 'info');
      rerenderNow();
    } else if (res.reason) {
      uiState.toast?.(res.reason, 'warn');
    }
  });
  document.getElementById('tac-fill-empty')?.addEventListener('click', () => {
    fs.fillEmptySlotsWithBestAvailable();
    clearSelection();
    uiState.audio?.playSuccess?.();
    uiState.toast?.('Đã điền cầu thủ phù hợp vào các vị trí trống!', 'success');
    rerenderNow();
  });
  document.getElementById('tac-match-toggle')?.addEventListener('click', () => {
    if (fs.matchSubSession.active) {
      fs.endInMatchSession();
      uiState.toast?.('🏁 Đã kết thúc mô phỏng thay người trong trận.', 'info');
    } else {
      fs.startInMatchSession(5, 62);
      uiState.toast?.('⚽ Đã bật chế độ Trong trận (tối đa 5 lượt thay người). Chạm cầu thủ trên sân rồi chạm dự bị để thay!', 'info');
    }
    clearSelection();
    rerenderNow();
  });

  // --- Chạm-Chọn Hai Cầu Thủ: Slot trên sân ---
  document.querySelectorAll('.tac-slot-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(card.dataset.slotidx);
      const slotsNow = fs.getFormationData().slots;
      const targetSlot = slotsNow[idx];
      if (!targetSlot) return;

      // Trường hợp 1: Đang chọn sẵn 1 cầu thủ dự bị -> Đưa cầu thủ dự bị vào vị trí này ngay!
      if (uiState.selectedBenchId) {
        const subPlayer = state.getPlayerById?.(uiState.selectedBenchId)
          || state.getPsgSquad().find((p) => p.id === uiState.selectedBenchId);
        const outName = targetSlot.player ? targetSlot.player.name : targetSlot.displayRole;
        const res = fs.swapStarter(idx, uiState.selectedBenchId);
        if (res.ok) {
          uiState.audio?.playSuccess?.();
          uiState.toast?.(
            `✅ Đã thay ${outName} bằng ${subPlayer?.name || 'cầu thủ dự bị'} (${targetSlot.displayRole} · Phù hợp ${res.suitability?.score ?? '--'}/100)`,
            'success'
          );
          clearSelection();
        } else {
          uiState.audio?.playAlert?.();
          uiState.toast?.(res.reason || 'Không thể thay cầu thủ này.', 'error');
        }
        rerenderNow();
        return;
      }

      // Trường hợp 2: Chạm lại đúng cầu thủ đang chọn -> Hủy chọn
      if (uiState.selectedSlotIdx === idx) {
        clearSelection();
        uiState.audio?.playClick?.();
        rerenderNow();
        return;
      }

      // Trường hợp 3: Đã chọn 1 cầu thủ trên sân (selectedSlotIdx !== null) -> Hoán đổi 2 vị trí trên sân!
      if (Number.isInteger(uiState.selectedSlotIdx)) {
        const fromIdx = uiState.selectedSlotIdx;
        const fromSlot = slotsNow[fromIdx];
        const res = fs.moveStarterToSlot(fromIdx, idx);
        if (res.ok) {
          uiState.audio?.playSuccess?.();
          const aName = fromSlot?.player?.name || `#${fromIdx + 1}`;
          const bName = targetSlot?.player?.name || targetSlot.displayRole;
          uiState.toast?.(`🔄 Đã hoán đổi vị trí: ${aName} ↔ ${bName}`, 'success');
          clearSelection();
        } else {
          uiState.audio?.playAlert?.();
          uiState.toast?.(res.reason || 'Không thể hoán đổi hai vị trí này.', 'error');
        }
        rerenderNow();
        return;
      }

      // Trường hợp 4: Chọn cầu thủ đầu tiên trên sân
      uiState.selectedSlotIdx = idx;
      uiState.selectedBenchId = null;
      if (targetSlot.player) {
        uiState.selectedPlayerId = targetSlot.player.id;
      }
      uiState.audio?.playClick?.();
      rerenderNow();
    });
  });

  // --- Chạm-Chọn Hai Cầu Thủ: Cầu thủ trên ghế dự bị ---
  document.querySelectorAll('.tac-bench-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      const pid = card.dataset.benchpid;
      const avail = card.dataset.avail;
      const bPlayer = state.getPlayerById?.(pid) || state.getPsgSquad().find((p) => p.id === pid);

      // Kiểm tra điều kiện hợp lệ ngay khi chạm cầu thủ dự bị không khả dụng
      if (avail !== 'available') {
        const reason = avail === 'injured'
          ? `${bPlayer?.name || 'Cầu thủ'} đang chấn thương (${bPlayer?.injuryDays || 1} ngày), không thể vào sân!`
          : avail === 'suspended'
            ? `${bPlayer?.name || 'Cầu thủ'} đang bị treo giò!`
            : `${bPlayer?.name || 'Cầu thủ'} đã bị thay ra trước đó, theo luật không thể trở lại sân!`;
        uiState.audio?.playAlert?.();
        uiState.toast?.(reason, 'error');
        return;
      }

      // Trường hợp A: Đã chọn sẵn 1 cầu thủ trên sân -> Thực hiện thay ngay!
      if (Number.isInteger(uiState.selectedSlotIdx)) {
        const slotIdx = uiState.selectedSlotIdx;
        const slotInfo = fs.getFormationData().slots[slotIdx];
        const outName = slotInfo?.player?.name || slotInfo?.displayRole || `#${slotIdx + 1}`;
        const res = fs.swapStarter(slotIdx, pid);
        if (res.ok) {
          uiState.audio?.playSuccess?.();
          uiState.toast?.(
            `✅ Đã thay ${outName} bằng ${bPlayer?.name || 'cầu thủ dự bị'} (${slotInfo?.displayRole || ''} · Phù hợp ${res.suitability?.score ?? '--'}/100)`,
            'success'
          );
          clearSelection();
        } else {
          uiState.audio?.playAlert?.();
          uiState.toast?.(res.reason || 'Không thể thực hiện thay người.', 'error');
        }
        rerenderNow();
        return;
      }

      // Trường hợp B: Chạm lại cầu thủ dự bị đang chọn -> Hủy chọn
      if (uiState.selectedBenchId === pid) {
        uiState.selectedBenchId = null;
        uiState.audio?.playClick?.();
        rerenderNow();
        return;
      }

      // Trường hợp C: Chọn cầu thủ dự bị làm bước 1 -> Yêu cầu chọn cầu thủ đá chính để thay
      uiState.selectedBenchId = pid;
      uiState.selectedSlotIdx = null;
      uiState.selectedPlayerId = pid;
      uiState.audio?.playClick?.();
      rerenderNow();
    });
  });

  // --- Chế độ xem Thẻ (2 cột) / Danh sách & Tìm kiếm & 7 Bộ lọc ---
  document.getElementById('tac-view-card')?.addEventListener('click', () => {
    if (uiState.benchViewMode === 'card') return;
    uiState.benchViewMode = 'card';
    uiState.audio?.playClick?.();
    rerenderNow();
  });
  document.getElementById('tac-view-list')?.addEventListener('click', () => {
    if (uiState.benchViewMode === 'list') return;
    uiState.benchViewMode = 'list';
    uiState.audio?.playClick?.();
    rerenderNow();
  });

  const searchInp = document.getElementById('tac-bench-search');
  searchInp?.addEventListener('input', (e) => {
    uiState.benchSearchQuery = e.target.value || '';
    rerenderNow({ focusId: 'tac-bench-search' });
  });
  document.getElementById('tac-bench-clear-q')?.addEventListener('click', () => {
    uiState.benchSearchQuery = '';
    rerenderNow({ focusId: 'tac-bench-search' });
  });

  document.querySelectorAll('[data-bfilter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiState.benchPosFilter = btn.dataset.bfilter || 'ALL';
      uiState.audio?.playClick?.();
      rerenderNow();
    });
  });

  // --- Hành động nhanh trên cầu thủ đang inspect ---
  document.getElementById('tac-set-cap')?.addEventListener('click', (e) => {
    const pid = e.currentTarget.dataset.pid;
    if (fs.setCaptain(pid)) {
      uiState.audio?.playSuccess?.();
      uiState.toast?.('©️ Đã bổ nhiệm Đội trưởng mới & đồng bộ băng đội trưởng 3D!', 'success');
      rerenderNow();
    }
  });
  document.getElementById('tac-bench-slot')?.addEventListener('click', (e) => {
    const sIdx = Number(e.currentTarget.dataset.slot);
    const res = fs.benchStarter(sIdx);
    if (res.ok) {
      uiState.audio?.playClick?.();
      uiState.toast?.('⬇️ Đã rút cầu thủ xuống dự bị. Chạm vào ô trống trên sân hoặc chọn dự bị để bổ sung!', 'info');
      rerenderNow();
    } else {
      uiState.toast?.(res.reason || 'Không thể rút xuống dự bị.', 'warn');
    }
  });
  document.getElementById('tac-num-save')?.addEventListener('click', (e) => {
    const pid = e.currentTarget.dataset.pid;
    const val = Number(document.getElementById('tac-num-inp')?.value);
    if (fs.setShirtNumber(pid, val)) {
      uiState.audio?.playSuccess?.();
      uiState.toast?.(`Đã cập nhật số áo #${val} (Đồng bộ áo 3D & tủ đồ)!`, 'success');
      rerenderNow();
    }
  });
  document.querySelectorAll('[data-setrole]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!Number.isInteger(uiState.selectedSlotIdx)) return;
      const res = fs.changeSlotRole(uiState.selectedSlotIdx, btn.dataset.setrole);
      if (res.ok) {
        uiState.audio?.playSuccess?.();
        rerenderNow();
      }
    });
  });
  document.querySelectorAll('[data-focus-slot]').forEach((btn) => {
    btn.addEventListener('click', () => {
      uiState.selectedSlotIdx = Number(btn.dataset.focusSlot);
      uiState.selectedBenchId = null;
      uiState.audio?.playClick?.();
      rerenderNow();
    });
  });
  document.querySelectorAll('[data-pickform]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const f = btn.dataset.pickform;
      if (f === fs.formation) return;
      if (fs.matchSubSession.active) {
        uiState.toast?.('Không thể đổi khung sơ đồ khi trận đấu đang diễn ra.', 'warn');
        return;
      }
      uiState.pendingFormationPreview = fs.previewFormationChange(f);
      rerenderNow();
    });
  });

  if (typeof extraCallbacks?.onAfterBind === 'function') {
    extraCallbacks.onAfterBind();
  }
}
