// src/ui/FormationPitchView.js
// Giao diện Sân Bóng Chiến Thuật Kéo Thả (Drag & Drop Pointer Events) + AI Position Suitability Intelligence
// Tối ưu cả màn hình dọc iPhone Safari lẫn Desktop, không xung đột camera 3D, không lag/jitter khi kéo thả.
import { getPlayerPortraitDataUrl } from '../players/PlayerDatabase.js';
import { FORMATION_PRESETS, TACTICAL_ZONE_ANCHORS } from '../squad/SquadFormationSystem.js';
import {
  CANONICAL_POSITIONS,
  POSITION_DISPLAY_LABEL,
  getPositionGroup,
  getSuitabilityTier,
  normalizePosition
} from '../squad/PositionSuitabilityAI.js';
import { PSG_KIT_THEMES } from '../characters/PlayerKitSystem.js';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPitchLinesSVG() {
  return `
    <svg class="tac-pitch-svg" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
      <!-- Đường biên & Vạch giữa sân -->
      <rect x="4" y="5" width="92" height="130" fill="none" stroke="rgba(255,255,255,0.78)" stroke-width="0.7" />
      <line x1="4" y1="70" x2="96" y2="70" stroke="rgba(255,255,255,0.72)" stroke-width="0.6" />
      <circle cx="50" cy="70" r="12" fill="none" stroke="rgba(255,255,255,0.72)" stroke-width="0.6" />
      <circle cx="50" cy="70" r="0.9" fill="rgba(255,255,255,0.85)" />

      <!-- Khung thành & Khu vực 16m50 / 5m50 phía trên (Hướng tấn công PSG) -->
      <rect x="41" y="1.4" width="18" height="3.6" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.88)" stroke-width="0.75" />
      <rect x="23" y="5" width="54" height="19" fill="none" stroke="rgba(255,255,255,0.74)" stroke-width="0.6" />
      <rect x="35" y="5" width="30" height="7.5" fill="none" stroke="rgba(255,255,255,0.74)" stroke-width="0.55" />
      <circle cx="50" cy="18.2" r="0.8" fill="rgba(255,255,255,0.85)" />
      <path d="M 40,24 A 11,11 0 0 0 60,24" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="0.55" />

      <!-- Khung thành & Khu vực 16m50 / 5m50 phía dưới (Khung thành PSG) -->
      <rect x="41" y="135" width="18" height="3.6" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.88)" stroke-width="0.75" />
      <rect x="23" y="116" width="54" height="19" fill="none" stroke="rgba(255,255,255,0.74)" stroke-width="0.6" />
      <rect x="35" y="127.5" width="30" height="7.5" fill="none" stroke="rgba(255,255,255,0.74)" stroke-width="0.55" />
      <circle cx="50" cy="121.8" r="0.8" fill="rgba(255,255,255,0.85)" />
      <path d="M 40,116 A 11,11 0 0 1 60,116" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="0.55" />
    </svg>`;
}

function renderStarterSlotCardHTML(slot, isSelected, isSwapCandidate) {
  if (!slot.player) {
    return `
      <button type="button"
        class="tac-slot-card empty ${isSelected ? 'selected' : ''} ${isSwapCandidate ? 'drop-candidate' : ''}"
        data-slot="${slot.slotIndex}"
        data-role="${slot.role}"
        style="left:${slot.formationX}%;top:${slot.formationY}%;"
        aria-label="Vị trí trống ${slot.displayRole}">
        <span class="tac-empty-plus">+</span>
        <span class="tac-slot-role-pill">${slot.displayRole}</span>
        <span class="tac-empty-lbl">Trống</span>
      </button>`;
  }

  const p = slot.player;
  const suit = slot.suitability;
  const score = suit ? suit.score : 85;
  const tier = suit ? suit.tier : getSuitabilityTier(score);
  const portrait = getPlayerPortraitDataUrl(p);
  const displaySurname = p.name.trim().split(/\s+/).slice(-1)[0].toUpperCase();
  const isCap = slot.playerId && slot.isCaptain;
  const isWarn = score < 65;

  return `
    <button type="button"
      class="tac-slot-card filled ${isSelected ? 'selected' : ''} ${isSwapCandidate ? 'drop-candidate' : ''} ${isWarn ? 'mismatch-warn' : ''}"
      data-slot="${slot.slotIndex}"
      data-pid="${p.id}"
      data-role="${slot.role}"
      style="left:${slot.formationX}%;top:${slot.formationY}%;--suit-color:${tier.color};--suit-border:${tier.border};"
      title="${escapeHtml(p.name)} (#${p.shirtNumber}) · ${slot.displayRole} · Độ phù hợp: ${score}/100">
      <div class="tac-card-top">
        <img class="tac-avatar" src="${portrait}" alt="" draggable="false" />
        <span class="tac-num-badge">${p.shirtNumber}</span>
        ${isCap ? '<span class="tac-cap-badge" title="Đội trưởng">C</span>' : ''}
        <span class="tac-suit-pill" style="background:${tier.bg};color:${tier.color};border-color:${tier.border};">${score}</span>
      </div>
      <div class="tac-card-name">${escapeHtml(displaySurname)}</div>
      <div class="tac-card-meta">
        <span>${slot.displayRole}</span>
        <span>·</span>
        <b>${p.ovr}</b>
      </div>
    </button>`;
}

export function renderFormationPitchTabHTML(state, ui) {
  const fs = state.formationSystem;
  const ai = fs.suitabilityAI;
  const data = fs.getFormationData({ fillEmpty: false });
  const squadEval = ai.evaluateSquad(data, fs.getContext());
  const subSession = data.subSession;
  const inMatch = !!subSession?.active;

  const benchFilter = ui.benchPosFilter || 'ALL';
  const filteredBench = data.bench.filter((b) => {
    if (benchFilter === 'ALL') return true;
    return getPositionGroup(b.position) === benchFilter;
  });

  const groupCounts = {
    ALL: data.bench.length,
    GK: data.bench.filter((b) => getPositionGroup(b.position) === 'GK').length,
    DEF: data.bench.filter((b) => getPositionGroup(b.position) === 'DEF').length,
    MID: data.bench.filter((b) => getPositionGroup(b.position) === 'MID').length,
    ATT: data.bench.filter((b) => getPositionGroup(b.position) === 'ATT').length
  };

  const selectedSlot = ui.selectedSlotIdx !== null
    ? data.slots.find((sl) => sl.slotIndex === ui.selectedSlotIdx)
    : null;
  const selectedBench = !selectedSlot && ui.selectedBenchId
    ? data.bench.find((b) => b.playerId === ui.selectedBenchId)
    : null;

  const activePlayer = selectedSlot?.player || selectedBench?.player || null;
  const activeRole = selectedSlot?.role || activePlayer?.position || null;
  const top3Info = activePlayer ? ai.getTop3Positions(activePlayer, fs.getContext(), activeRole) : null;

  const teamTier = squadEval.tier;
  const compFormations = ai.compareFormations(state.getPsgSquad(), FORMATION_PRESETS, data.formation, fs.getContext());
  const phase = fs.getRoutinePhase(state.clockHour);

  // Vùng chiến thuật phụ (hiển thị khi người dùng đang kéo cầu thủ đá chính)
  const extraAnchors = TACTICAL_ZONE_ANCHORS.filter((anc) =>
    !data.slots.some((sl) => Math.hypot(sl.formationX - anc.x, sl.formationY - anc.y) < 11 && sl.role === anc.role)
  );

  const pendingPreview = ui.pendingFormationPreview;
  const currentKit = state.activeKit || 'home';
  const kitOptions = [
    ['home', 'Sân nhà', PSG_KIT_THEMES.home],
    ['away', 'Sân khách', PSG_KIT_THEMES.away],
    ['third', 'Áo thứ ba', PSG_KIT_THEMES.third]
  ];

  return `
    <div class="tac-root" id="tac-root">
      <!-- Thanh công cụ gọn, chạm dễ trên iPhone & Desktop -->
      <div class="tac-toolbar">
        <div class="tac-toolbar-row">
          <select id="fm-preset" class="input-ctrl tac-select" aria-label="Chọn sơ đồ chiến thuật">
            ${Object.keys(FORMATION_PRESETS).map((k) => `<option value="${k}" ${k === data.formation ? 'selected' : ''}>Sơ đồ ${k}</option>`).join('')}
          </select>
          <input id="fm-name" class="input-ctrl tac-name-input" value="${escapeHtml(data.tacticName)}" placeholder="Tên chiến thuật..." />
          <button type="button" class="btn-primary tac-btn" id="fm-save-lineup" title="Lưu & đồng bộ toàn game">💾 Lưu</button>
        </div>
        <div class="tac-toolbar-row">
          <button type="button" class="btn-secondary tac-btn" id="fm-undo" ${!fs.canUndo() ? 'disabled' : ''}>↩️ Hoàn tác${fs.undoStack.length ? ` (${fs.undoStack.length})` : ''}</button>
          <button type="button" class="btn-accent tac-btn" id="fm-auto-opt" ${inMatch ? 'disabled' : ''}>🤖 AI Tối ưu XI</button>
          <button type="button" class="btn-secondary tac-btn ${inMatch ? 'tac-btn-live' : ''}" id="fm-toggle-match-mode">
            ${inMatch ? `⏱️ Trong trận (${subSession.maxSubs - subSession.subsUsed}/${subSession.maxSubs} lượt)` : '📋 Trước trận · Chế độ 5 lượt thay'}
          </button>
        </div>
        <div class="tac-toolbar-row" aria-label="Chọn trang phục thi đấu PSG">
          <span class="muted" style="font-size:11px;font-weight:700;">👕 Áo đấu 3D:</span>
          ${kitOptions.map(([key, label, theme]) => `
            <button type="button"
              class="tac-filter-pill ${currentKit === key ? 'active' : ''}"
              data-set-kit="${key}"
              style="display:inline-flex;align-items:center;gap:5px;">
              <span style="width:10px;height:10px;border-radius:2px;background:${theme.baseHex};border:1px solid ${theme.accentHex};display:inline-block;"></span>
              ${label}
            </button>
          `).join('')}
        </div>
      </div>

      ${inMatch ? `
        <div class="tac-match-banner">
          <div>
            <b>⚽ TRẠNG THÁI TRONG TRẬN · Phút ${Math.floor(subSession.matchMinute)}'</b>
            <span class="muted"> · Còn <b>${subSession.maxSubs - subSession.subsUsed}/${subSession.maxSubs}</b> lượt thay người · Cầu thủ đã rời sân không thể vào lại</span>
          </div>
          ${subSession.subHistory.length ? `
            <div class="tac-sub-log">
              ${subSession.subHistory.slice(0, 3).map((h) => `<span class="tag ok">${h.minute}' ↑${escapeHtml(h.inName)} / ↓${escapeHtml(h.outName)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      ` : `
        <div class="tac-sync-bar muted">
          <span>📅 ${escapeHtml(phase.label)}</span> · <span>Đồng bộ Cầu thủ 3D, Phòng Thay Đồ & Ngày Thi Đấu</span>
        </div>
      `}

      ${pendingPreview ? `
        <div class="tac-confirm-card" id="fm-confirm-switch">
          <div class="card-head">
            <strong>⚠️ Xác nhận chuyển sơ đồ ${pendingPreview.currentFormation} → ${pendingPreview.targetFormation}</strong>
            <span class="tag">Điểm dự kiến: ${pendingPreview.keepLineupEvaluation.avgSuitability} → AI Tối ưu: ${pendingPreview.optimalEvaluation.avgSuitability}</span>
          </div>
          ${pendingPreview.mismatches.length > 0 ? `
            <p class="muted" style="margin:4px 0;">
              Phát hiện <b>${pendingPreview.mismatches.length}</b> cầu thủ trái sở trường nếu giữ nguyên vị trí:
              ${pendingPreview.mismatches.map((m) => `<b>${escapeHtml(m.playerName)}</b> (${m.targetRole}: ${m.score}/100, hợp ${m.bestPosition})`).join(' · ')}
            </p>
          ` : `<p class="muted" style="margin:4px 0;">Đội hình hiện tại tương thích tốt với sơ đồ ${pendingPreview.targetFormation}.</p>`}
          <div class="btn-row">
            <button type="button" class="btn-primary tac-btn" id="fm-confirm-opt">🤖 Áp dụng ${pendingPreview.targetFormation} & AI sắp xếp vị trí</button>
            <button type="button" class="btn-secondary tac-btn" id="fm-confirm-keep">✅ Giữ nhân sự hiện tại & Đổi sơ đồ</button>
            <button type="button" class="btn-danger tac-btn" id="fm-confirm-cancel">✕ Hủy</button>
          </div>
        </div>
      ` : ''}

      ${ui.confirmOptimalXI ? `
        <div class="tac-confirm-card" id="fm-confirm-auto">
          <div class="card-head">
            <strong>🤖 Xác nhận AI Tự động sắp xếp Đội hình Tối ưu (${data.formation})</strong>
            <span class="tag ok">Đề xuất bởi Trợ lý chiến thuật AI</span>
          </div>
          <p class="muted" style="margin:4px 0;">Hệ thống sẽ chọn 11 cầu thủ có mức độ phù hợp vị trí & phong độ cao nhất hiện có (có thể Hoàn tác ngay sau khi áp dụng).</p>
          <div class="btn-row">
            <button type="button" class="btn-primary tac-btn" id="fm-opt-yes">✅ Áp dụng Đội hình Tối ưu</button>
            <button type="button" class="btn-secondary tac-btn" id="fm-opt-no">✕ Giữ nguyên</button>
          </div>
        </div>
      ` : ''}

      <div class="tac-main-grid">
        <!-- CỘT TRÁI: SÂN CHIẾN THUẬT + DỰ BỊ -->
        <div class="tac-pitch-col">
          <div class="tac-pitch-wrap" id="tac-pitch-wrap">
            <!-- Thanh preview AI nhỏ gọn nổi trên mép sân khi kéo/hover -->
            <div class="tac-drag-preview hidden" id="fm-drag-preview"></div>
            <div class="tac-pitch-board" id="tac-pitch-board">
              ${renderPitchLinesSVG()}
              <div class="tac-goal-label top">HƯỚNG TẤN CÔNG ↑</div>
              <div class="tac-goal-label bot">KHUNG THÀNH PSG</div>

              <!-- Các vùng chiến thuật trống bổ sung (hiện khi kéo cầu thủ đá chính) -->
              <div class="tac-zone-layer" id="tac-zone-layer">
                ${extraAnchors.map((anc) => `
                  <div class="tac-zone-anchor" data-zone-role="${anc.role}" data-zx="${anc.x}" data-zy="${anc.y}" style="left:${anc.x}%;top:${anc.y}%;">
                    <span>${anc.label}</span>
                  </div>
                `).join('')}
              </div>

              <!-- 11 vị trí chiến thuật -->
              ${data.slots.map((sl) => {
                const isSel = ui.selectedSlotIdx === sl.slotIndex;
                const canAcceptTapSwap = (ui.selectedBenchId !== null) || (ui.selectedSlotIdx !== null && ui.selectedSlotIdx !== sl.slotIndex);
                return renderStarterSlotCardHTML({
                  ...sl,
                  playerId: sl.playerId,
                  isCaptain: sl.playerId === data.captainId
                }, isSel, canAcceptTapSwap);
              }).join('')}
            </div>
          </div>

          <!-- Danh sách Dự bị phân loại theo vị trí GK / DEF / MID / ATT -->
          <div class="tac-bench-section">
            <div class="tac-bench-header">
              <div class="section-label" style="margin:0;">🪑 Dự bị (${filteredBench.length}) · Kéo thẻ lên sân để thay</div>
              <div class="tac-bench-tabs">
                ${[
                  ['ALL', `Tất cả (${groupCounts.ALL})`],
                  ['GK', `GK (${groupCounts.GK})`],
                  ['DEF', `DEF (${groupCounts.DEF})`],
                  ['MID', `MID (${groupCounts.MID})`],
                  ['ATT', `ATT (${groupCounts.ATT})`]
                ].map(([k, lbl]) => `
                  <button type="button" class="tac-filter-pill ${benchFilter === k ? 'active' : ''}" data-bfilter="${k}">${lbl}</button>
                `).join('')}
              </div>
            </div>
            <div class="tac-bench-grid" id="tac-bench-grid">
              ${filteredBench.map((b) => {
                const p = b.player;
                const avail = b.availability;
                const disabled = avail !== 'available';
                const isSel = ui.selectedBenchId === b.playerId;
                const portrait = getPlayerPortraitDataUrl(p);
                const statusTag = avail === 'injured'
                  ? `<span class="tag bad">Chấn thương ${p.injuryDays}n</span>`
                  : avail === 'suspended'
                    ? '<span class="tag bad">Treo giò</span>'
                    : avail === 'subbed_out'
                      ? '<span class="tag bad">Đã thay ra</span>'
                      : `<span class="tag ok">OVR ${p.ovr}</span>`;
                return `
                  <div class="tac-bench-card ${disabled ? 'disabled' : ''} ${isSel ? 'selected' : ''}"
                    data-bench-pid="${b.playerId}"
                    data-avail="${avail}"
                    role="button"
                    tabindex="0"
                    aria-label="${escapeHtml(b.fullName)}">
                    <img class="tac-bench-avatar" src="${portrait}" alt="" draggable="false" />
                    <div class="tac-bench-info">
                      <div class="tac-bench-title">#${b.shirtNumber} <b>${escapeHtml(b.fullName)}</b></div>
                      <div class="tac-bench-sub">${b.displayPosition} · Thể lực ${p.health?.fitness ?? 88}%</div>
                    </div>
                    <div class="tac-bench-right">${statusTag}</div>
                  </div>`;
              }).join('')}
              ${filteredBench.length === 0 ? '<div class="muted" style="padding:8px;">Không có cầu thủ dự bị nào ở nhóm vị trí này.</div>' : ''}
            </div>
          </div>
        </div>

        <!-- CỘT PHẢI: AI POSITION SUITABILITY & TEAM INTELLIGENCE -->
        <div class="tac-side-col">
          ${activePlayer && top3Info ? `
            <div class="card-item tac-ai-player-card">
              <div class="tac-player-hero">
                <img class="tac-hero-img" src="${getPlayerPortraitDataUrl(activePlayer)}" alt="" />
                <div style="flex:1;min-width:0;">
                  <div class="card-head">
                    <strong style="font-size:13.5px;">#${activePlayer.shirtNumber} ${escapeHtml(activePlayer.name)} ${activePlayer.id === data.captainId ? '©️' : ''}</strong>
                    <span class="tag ok">OVR ${activePlayer.ovr}</span>
                  </div>
                  <div class="muted">
                    Sở trường: <b>${POSITION_DISPLAY_LABEL[normalizePosition(activePlayer.position)] || activePlayer.position}</b>
                    ${selectedSlot ? ` · Đang xếp: <b style="color:${top3Info.currentEval.tier.color}">${selectedSlot.displayRole} (${top3Info.currentEval.score}/100)</b>` : ' · Ghế dự bị'}
                  </div>
                  <div class="kpi-mini" style="margin-top:4px;">
                    <span>Thể lực: <b>${activePlayer.health?.fitness ?? 88}%</b></span>
                    <span>Phong độ: <b>${activePlayer.form}</b></span>
                    <span>Chân thuận: <b>${activePlayer.foot}</b></span>
                  </div>
                </div>
              </div>

              ${selectedSlot ? `
                <div class="tac-quick-actions">
                  <button type="button" class="btn-xs btn-primary open-profile-btn" data-pid="${activePlayer.id}">👤 Hồ sơ</button>
                  <button type="button" class="btn-xs btn-accent" id="fm-set-cap" data-pid="${activePlayer.id}">©️ Đội trưởng</button>
                  ${!inMatch ? `<button type="button" class="btn-xs btn-secondary" id="fm-bench-slot" data-slot="${selectedSlot.slotIndex}">↓ Đưa xuống dự bị</button>` : ''}
                  <div class="tac-num-edit">
                    <input id="fm-num-inp" type="number" min="1" max="99" value="${activePlayer.shirtNumber}" class="input-ctrl" style="width:54px;min-width:54px;padding:4px 6px;" />
                    <button type="button" class="btn-xs btn-secondary" id="fm-set-num" data-pid="${activePlayer.id}">Đổi số</button>
                  </div>
                </div>
                <div class="tac-role-changer">
                  <span class="muted" style="font-size:11px;">Đổi vai trò ô này:</span>
                  <div class="tac-role-chips">
                    ${CANONICAL_POSITIONS.map((r) => `
                      <button type="button" class="tac-role-chip ${selectedSlot.role === r ? 'active' : ''}" data-set-slot="${selectedSlot.slotIndex}" data-new-role="${r}">
                        ${POSITION_DISPLAY_LABEL[r] || r}
                      </button>
                    `).join('')}
                  </div>
                </div>
              ` : `
                <div class="tac-quick-actions">
                  <button type="button" class="btn-xs btn-primary open-profile-btn" data-pid="${activePlayer.id}">👤 Mở Hồ sơ</button>
                  <span class="muted" style="font-size:11px;">Chạm hoặc kéo vào 1 vị trí trên sân để đưa vào thi đấu.</span>
                </div>
              `}

              <!-- Top 3 Vị trí Tối Ưu AI -->
              <div class="section-label" style="margin-top:8px;">🧠 AI Đề Xuất Top 3 Vị Trí Tối Ưu</div>
              <div class="tac-top3-list">
                ${top3Info.top3.map((item, idx) => `
                  <div class="tac-top3-row">
                    <span class="tac-rank">#${idx + 1}</span>
                    <strong style="width:36px;">${item.displayPosition}</strong>
                    <div class="tac-score-bar-track">
                      <div class="tac-score-bar-fill" style="width:${item.score}%;background:${item.tier.color};"></div>
                    </div>
                    <b style="color:${item.tier.color};min-width:28px;text-align:right;">${item.score}</b>
                    <span class="muted" style="font-size:10.5px;min-width:96px;text-align:right;">${item.tier.label}</span>
                  </div>
                `).join('')}
              </div>
              <div class="tac-ai-explain">
                <div><b style="color:#86efac;">Điểm mạnh:</b> ${escapeHtml(top3Info.strengths.join(', '))}</div>
                ${top3Info.weaknessesAtCurrent.length ? `<div><b style="color:#fca5a5;">Lưu ý tại ${top3Info.currentEval.displayPosition}:</b> ${escapeHtml(top3Info.weaknessesAtCurrent.join(', '))}</div>` : ''}
                <div style="color:#fde68a;margin-top:3px;">💡 ${escapeHtml(top3Info.recommendationText)}</div>
              </div>
            </div>
          ` : `
            <div class="card-item">
              <strong>👆 Chạm hoặc Kéo Thả Cầu Thủ</strong>
              <p class="muted" style="margin:4px 0;">
                • Kéo cầu thủ dự bị vào bất kỳ ô nào trên sân để thay người.<br/>
                • Kéo cầu thủ đá chính sang nhau để hoán đổi, hoặc kéo vào vùng chiến thuật trống để đổi vai trò.<br/>
                • Chạm vào cầu thủ để xem AI phân tích 3 vị trí tối ưu nhất.
              </p>
            </div>
          `}

          <!-- Đánh giá Tổng Thể Toàn Đội của AI -->
          <div class="card-item tac-team-ai-card">
            <div class="card-head">
              <strong>📊 AI Đánh Giá Toàn Đội (${data.formation})</strong>
              <span class="tag" style="background:${teamTier.bg};color:${teamTier.color};border:1px solid ${teamTier.border};">
                ${squadEval.overallScore}/100 · ${teamTier.label}
              </span>
            </div>
            <div class="tac-kpi-4">
              <div class="tac-mini-kpi"><span>Phù hợp TB</span><b>${squadEval.avgSuitability}%</b></div>
              <div class="tac-mini-kpi"><span>Công / Giữa</span><b>${squadEval.ratings.attack} / ${squadEval.ratings.midfield}</b></div>
              <div class="tac-mini-kpi"><span>Thủ / GK</span><b>${squadEval.ratings.defense} / ${squadEval.ratings.gk}</b></div>
              <div class="tac-mini-kpi"><span>Cân bằng / HLV</span><b>${squadEval.balanceScore}% / ${squadEval.coachTacticFit}%</b></div>
            </div>
            <div class="tac-pos-counts muted">
              <span style="color:#4ade80;">● ${squadEval.naturalCount} đúng sở trường</span> ·
              <span style="color:#facc15;">● ${squadEval.secondaryCount} kiêm nhiệm</span> ·
              <span style="color:#f87171;">● ${squadEval.outOfPosCount} trái sở trường</span>
              ${squadEval.emptySlotsCount ? ` · <span style="color:#fb923c;">● ${squadEval.emptySlotsCount} trống</span>` : ''}
            </div>
            <p class="muted" style="margin:5px 0;color:#e2e8f0;">${escapeHtml(squadEval.summaryText)}</p>

            ${squadEval.weakPositions.length > 0 ? `
              <div class="tac-weak-list">
                <div class="muted" style="font-size:10.5px;margin-bottom:3px;">Vị trí cần gia cố / điều chỉnh:</div>
                ${squadEval.weakPositions.slice(0, 4).map((w) => `
                  <button type="button" class="tac-weak-chip" data-jump-slot="${w.slotIndex}">
                    ${w.assignedPos}: ${escapeHtml(w.playerName)} (${w.score}/100 → hợp ${w.bestPos})
                  </button>
                `).join('')}
              </div>
            ` : ''}

            <div class="section-label" style="margin-top:8px;">📐 Xếp hạng sơ đồ phù hợp nhất với PSG hiện tại</div>
            <div class="tac-form-rank">
              ${compFormations.slice(0, 4).map((f) => `
                <button type="button" class="tac-form-pill ${f.isCurrent ? 'current' : ''}" data-pick-form="${f.formation}">
                  <span>${f.formation}</span>
                  <b>${f.score}đ</b>
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

// Bộ điều khiển Pointer Events Drag & Drop + Sự kiện UI
export function bindFormationPitchEvents(state, ui, rerenderFn, extraCallbacks = {}) {
  const fs = state.formationSystem;
  const ai = fs.suitabilityAI;
  const root = document.getElementById('tac-root');
  if (!root) return;

  const refresh = () => rerenderFn();

  // 1. Toolbar & Confirmation Controls
  document.getElementById('fm-preset')?.addEventListener('change', (e) => {
    const nextF = e.target.value;
    if (nextF === fs.formation) return;
    ui.pendingFormationPreview = fs.previewFormationChange(nextF);
    ui.confirmOptimalXI = false;
    refresh();
  });

  document.getElementById('fm-confirm-opt')?.addEventListener('click', () => {
    if (!ui.pendingFormationPreview) return;
    const f = ui.pendingFormationPreview.targetFormation;
    ui.pendingFormationPreview = null;
    fs.setFormation(f, { autoArrange: true });
    ui.audio?.playSuccess();
    ui.toast?.(`✅ Đã chuyển sơ đồ ${f} & AI tối ưu hóa 11 vị trí!`, 'success');
    refresh();
  });

  document.getElementById('fm-confirm-keep')?.addEventListener('click', () => {
    if (!ui.pendingFormationPreview) return;
    const f = ui.pendingFormationPreview.targetFormation;
    ui.pendingFormationPreview = null;
    fs.setFormation(f, { autoArrange: false });
    ui.audio?.playSuccess();
    ui.toast?.(`✅ Đã chuyển sang sơ đồ ${f} (giữ nguyên nhân sự).`, 'success');
    refresh();
  });

  document.getElementById('fm-confirm-cancel')?.addEventListener('click', () => {
    ui.pendingFormationPreview = null;
    const sel = document.getElementById('fm-preset');
    if (sel) sel.value = fs.formation;
    refresh();
  });

  document.getElementById('fm-save-lineup')?.addEventListener('click', () => {
    const val = document.getElementById('fm-name')?.value || '';
    if (val.trim()) fs.setTacticName(val);
    else fs.notify();
    ui.cb?.autoSaveNow?.(true);
    ui.audio?.playSuccess();
    ui.toast?.('💾 Đã lưu sơ đồ & đồng bộ Phòng Thay Đồ 3D!', 'success');
    refresh();
  });

  document.getElementById('fm-undo')?.addEventListener('click', () => {
    const res = fs.undo();
    if (res.ok) {
      ui.audio?.playClick();
      ui.toast?.('↩️ Đã hoàn tác thao tác đội hình.', 'info');
      refresh();
    } else {
      ui.toast?.(res.reason, 'warn');
    }
  });

  document.getElementById('fm-auto-opt')?.addEventListener('click', () => {
    ui.confirmOptimalXI = !ui.confirmOptimalXI;
    ui.pendingFormationPreview = null;
    refresh();
  });

  document.getElementById('fm-opt-yes')?.addEventListener('click', () => {
    ui.confirmOptimalXI = false;
    fs.applyOptimalXI();
    ui.audio?.playSuccess();
    ui.toast?.('🤖 AI đã sắp xếp đội hình tối ưu theo vị trí & phong độ!', 'success');
    refresh();
  });

  document.getElementById('fm-opt-no')?.addEventListener('click', () => {
    ui.confirmOptimalXI = false;
    refresh();
  });

  document.getElementById('fm-toggle-match-mode')?.addEventListener('click', () => {
    if (fs.matchSubSession.active) {
      fs.endInMatchSession();
      ui.toast?.('📋 Đã chuyển về Chế độ Chuẩn bị Trước Trận (chỉnh sửa tự do).', 'info');
    } else {
      fs.startInMatchSession(5, 62);
      ui.toast?.('⏱️ Đã bật Chế độ Trong Trận (phút 62 · tối đa 5 lượt thay người).', 'info');
    }
    refresh();
  });

  // Kit switcher (Home / Away / Third)
  root.querySelectorAll('[data-set-kit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kitKey = btn.dataset.setKit;
      if (typeof state.setActiveKit === 'function') {
        state.setActiveKit(kitKey);
        const label = PSG_KIT_THEMES[kitKey]?.label || kitKey;
        ui.audio?.playSuccess();
        ui.toast?.(`👕 Đã đổi trang phục PSG sang ${label} (đồng bộ Cầu thủ 3D & Tủ đồ)!`, 'success');
        refresh();
      }
    });
  });

  // Quick formation pills
  root.querySelectorAll('[data-pick-form]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetF = btn.dataset.pickForm;
      if (targetF === fs.formation) return;
      ui.pendingFormationPreview = fs.previewFormationChange(targetF);
      ui.confirmOptimalXI = false;
      refresh();
    });
  });

  // Bench category filters
  root.querySelectorAll('[data-bfilter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ui.benchPosFilter = btn.dataset.bfilter;
      ui.audio?.playClick();
      refresh();
    });
  });

  // Jump to weak position
  root.querySelectorAll('[data-jump-slot]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ui.selectedSlotIdx = Number(btn.dataset.jumpSlot);
      ui.selectedBenchId = null;
      ui.audio?.playClick();
      refresh();
    });
  });

  // Role changer chips
  root.querySelectorAll('[data-new-role]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slotIdx = Number(btn.dataset.setSlot);
      const role = btn.dataset.newRole;
      const res = fs.changeSlotRole(slotIdx, role);
      if (res.ok) {
        ui.audio?.playSuccess();
        ui.toast?.(`Đã đổi vai trò ô thành ${POSITION_DISPLAY_LABEL[role] || role} (Phù hợp: ${res.suitability?.score ?? '--'}/100)`, 'info');
        refresh();
      }
    });
  });

  document.getElementById('fm-set-cap')?.addEventListener('click', (e) => {
    fs.setCaptain(e.currentTarget.dataset.pid);
    ui.audio?.playSuccess();
    ui.toast?.('©️ Đã cập nhật Đội trưởng (C) trên toàn game!', 'success');
    refresh();
  });

  document.getElementById('fm-set-num')?.addEventListener('click', (e) => {
    const num = document.getElementById('fm-num-inp')?.value;
    fs.setShirtNumber(e.currentTarget.dataset.pid, num);
    ui.audio?.playSuccess();
    ui.toast?.(`👕 Đã đổi số áo #${num} (đồng bộ Tủ đồ 3D)!`, 'success');
    refresh();
  });

  document.getElementById('fm-bench-slot')?.addEventListener('click', (e) => {
    const idx = Number(e.currentTarget.dataset.slot);
    const res = fs.benchStarter(idx);
    if (res.ok) {
      ui.selectedSlotIdx = null;
      ui.audio?.playClick();
      ui.toast?.('Đã chuyển cầu thủ xuống danh sách dự bị (để trống vị trí).', 'info');
      refresh();
    } else {
      ui.toast?.(res.reason, 'error');
    }
  });

  // 2. Pointer Events Drag & Drop + Tap-to-Swap Logic
  const pitchBoard = document.getElementById('tac-pitch-board');
  const dragPreviewEl = document.getElementById('fm-drag-preview');
  const zoneLayer = document.getElementById('tac-zone-layer');
  if (!pitchBoard) return;

  const execSlotAssignment = (targetSlotIdx, incomingPid, fromSlotIdx = null) => {
    let res;
    if (fromSlotIdx !== null) {
      res = fs.moveStarterToSlot(fromSlotIdx, targetSlotIdx);
    } else if (extraCallbacks.onInMatchSub && fs.matchSubSession.active) {
      res = extraCallbacks.onInMatchSub(targetSlotIdx, incomingPid);
    } else {
      res = fs.swapStarter(targetSlotIdx, incomingPid);
    }

    if (res?.ok) {
      ui.selectedSlotIdx = targetSlotIdx;
      ui.selectedBenchId = null;
      ui.audio?.playSuccess();
      const fd = fs.getFormationData({ fillEmpty: false });
      const sl = fd.slots[targetSlotIdx];
      const msg = res.subRecord
        ? `🔄 Thay người ${res.subRecord.minute}': ${res.subRecord.inName} vào thay ${res.subRecord.outName} (Còn ${res.subsRemaining} lượt)`
        : sl?.player
          ? `✅ ${sl.player.name} → ${sl.displayRole} (Phù hợp: ${sl.suitability?.score ?? '--'}/100)`
          : '✅ Đã cập nhật đội hình!';
      ui.toast?.(msg, 'success');
      refresh();
    } else {
      ui.audio?.playAlert();
      ui.toast?.(res?.reason || 'Không thể thực hiện thay đổi.', 'error');
    }
  };

  let dragState = null;

  const clearDragArtifacts = () => {
    if (dragState?.ghostEl && dragState.ghostEl.parentNode) {
      dragState.ghostEl.parentNode.removeChild(dragState.ghostEl);
    }
    root.querySelectorAll('.drop-hot').forEach((el) => el.classList.remove('drop-hot'));
    if (zoneLayer) zoneLayer.classList.remove('active');
    if (dragPreviewEl) {
      dragPreviewEl.classList.add('hidden');
      dragPreviewEl.innerHTML = '';
    }
    dragState = null;
  };

  const updateDragPreviewBadge = (player, targetRole, targetKey) => {
    if (!dragPreviewEl || !dragState) return;
    if (dragState.lastTargetKey === targetKey) return;
    dragState.lastTargetKey = targetKey;

    if (!targetRole) {
      dragPreviewEl.classList.add('hidden');
      return;
    }
    const ev = ai.evaluatePlayerAtPosition(player, targetRole, fs.getContext());
    const top3 = ai.getTop3Positions(player, fs.getContext(), targetRole);
    const rec = top3 && top3.bestPosition !== ev.targetPosition && top3.bestScore - ev.score >= 5
      ? ` · Khuyến nghị: <b>${top3.bestDisplayPosition}</b> (${top3.bestScore})`
      : '';
    dragPreviewEl.innerHTML = `
      <span class="tac-prev-name">${escapeHtml(player.name)}</span>
      <span>→ <b>${ev.displayPosition}</b></span>
      <span class="tac-prev-score" style="background:${ev.tier.bg};color:${ev.tier.color};border-color:${ev.tier.border};">${ev.score}/100 · ${ev.tier.label}</span>
      ${rec ? `<span class="tac-prev-rec">${rec}</span>` : ''}
    `;
    dragPreviewEl.classList.remove('hidden');
  };

  const handlePointerStart = (e, source) => {
    // Chỉ xử lý chuột trái hoặc cảm ứng
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();

    const player = state.getPsgSquad().find((p) => p.id === source.playerId);
    if (!player) return;

    dragState = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      source, // { type: 'starter'|'bench', slotIndex, playerId }
      player,
      dragging: false,
      ghostEl: null,
      lastTargetKey: null,
      hoveredDrop: null
    };

    const onMove = (mv) => {
      if (!dragState || mv.pointerId !== dragState.pointerId) return;
      const dx = mv.clientX - dragState.startX;
      const dy = mv.clientY - dragState.startY;
      if (!dragState.dragging && Math.hypot(dx, dy) > 7) {
        dragState.dragging = true;
        if (zoneLayer && dragState.source.type === 'starter') {
          zoneLayer.classList.add('active');
        }
        // Tạo thẻ ghost nổi GPU-accelerated (translate3d)
        const ghost = document.createElement('div');
        ghost.className = 'tac-drag-ghost';
        ghost.innerHTML = `<img src="${getPlayerPortraitDataUrl(player)}" alt="" /><span>#${player.shirtNumber} ${escapeHtml(fs.getDisplaySurname(player.name))}</span>`;
        document.body.appendChild(ghost);
        dragState.ghostEl = ghost;
      }

      if (!dragState.dragging) return;
      mv.preventDefault();
      mv.stopPropagation();

      if (dragState.ghostEl) {
        dragState.ghostEl.style.transform = `translate3d(${mv.clientX - 34}px, ${mv.clientY - 38}px, 0)`;
      }

      // Hit-test mượt mà qua elementFromPoint
      const elUnder = document.elementFromPoint(mv.clientX, mv.clientY);
      const slotBtn = elUnder?.closest?.('.tac-slot-card');
      const zoneBtn = !slotBtn ? elUnder?.closest?.('.tac-zone-anchor') : null;

      root.querySelectorAll('.drop-hot').forEach((el) => el.classList.remove('drop-hot'));
      if (slotBtn && Number(slotBtn.dataset.slot) !== dragState.source.slotIndex) {
        slotBtn.classList.add('drop-hot');
        const tIdx = Number(slotBtn.dataset.slot);
        const tRole = slotBtn.dataset.role || 'CM';
        dragState.hoveredDrop = { kind: 'slot', slotIndex: tIdx, role: tRole };
        updateDragPreviewBadge(player, tRole, `slot_${tIdx}`);
      } else if (zoneBtn && dragState.source.type === 'starter') {
        zoneBtn.classList.add('drop-hot');
        const zRole = zoneBtn.dataset.zoneRole;
        const zx = Number(zoneBtn.dataset.zx);
        const zy = Number(zoneBtn.dataset.zy);
        dragState.hoveredDrop = { kind: 'zone', role: zRole, x: zx, y: zy };
        updateDragPreviewBadge(player, zRole, `zone_${zRole}_${zx}_${zy}`);
      } else {
        dragState.hoveredDrop = null;
        updateDragPreviewBadge(player, null, 'none');
      }
    };

    const cleanupListeners = () => {
      window.removeEventListener('pointermove', onMove, { passive: false });
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onCancel);
    };

    const onEnd = (up) => {
      if (!dragState || up.pointerId !== dragState.pointerId) return;
      cleanupListeners();

      const ds = dragState;
      const wasDragging = ds.dragging;
      const drop = ds.hoveredDrop;
      clearDragArtifacts();

      if (!wasDragging) {
        // Xử lý chạm/click (Select hoặc Tap-to-Swap)
        if (ds.source.type === 'starter') {
          const clickedSlot = ds.source.slotIndex;
          if (ui.selectedBenchId) {
            execSlotAssignment(clickedSlot, ui.selectedBenchId, null);
          } else if (ui.selectedSlotIdx !== null && ui.selectedSlotIdx !== clickedSlot) {
            execSlotAssignment(clickedSlot, ds.source.playerId, ui.selectedSlotIdx);
          } else {
            ui.selectedSlotIdx = ui.selectedSlotIdx === clickedSlot ? null : clickedSlot;
            ui.selectedBenchId = null;
            ui.audio?.playClick();
            refresh();
          }
        } else {
          // Tap bench card
          if (ui.selectedSlotIdx !== null) {
            execSlotAssignment(ui.selectedSlotIdx, ds.source.playerId, null);
          } else {
            ui.selectedBenchId = ui.selectedBenchId === ds.source.playerId ? null : ds.source.playerId;
            ui.selectedSlotIdx = null;
            ui.audio?.playClick();
            refresh();
          }
        }
        return;
      }

      // Xử lý thả (Drop)
      if (!drop) return;
      if (drop.kind === 'slot') {
        execSlotAssignment(
          drop.slotIndex,
          ds.source.playerId,
          ds.source.type === 'starter' ? ds.source.slotIndex : null
        );
      } else if (drop.kind === 'zone' && ds.source.type === 'starter') {
        const res = fs.moveStarterToTacticalZone(ds.source.slotIndex, drop.role, drop.x, drop.y);
        if (res.ok) {
          ui.selectedSlotIdx = ds.source.slotIndex;
          ui.audio?.playSuccess();
          ui.toast?.(`🧭 Đã chuyển ${ds.player.name} sang vùng ${POSITION_DISPLAY_LABEL[drop.role] || drop.role} (${res.suitability?.score ?? '--'}/100)`, 'success');
          refresh();
        }
      }
    };

    const onCancel = (cEvt) => {
      if (!dragState || cEvt.pointerId !== dragState.pointerId) return;
      cleanupListeners();
      clearDragArtifacts();
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onCancel);
  };

  // Gắn pointerdown lên các thẻ đá chính trên sân (cả filled & empty!)
  root.querySelectorAll('.tac-slot-card').forEach((card) => {
    const slotIdx = Number(card.dataset.slot);
    const pid = card.dataset.pid || null;

    if (pid) {
      card.addEventListener('pointerdown', (e) => {
        handlePointerStart(e, { type: 'starter', slotIndex: slotIdx, playerId: pid });
      });
    } else {
      // Ô trống: chạm để đưa cầu thủ đang chọn (từ bench hoặc từ ô khác) vào vị trí trống!
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        if (ui.selectedBenchId) {
          execSlotAssignment(slotIdx, ui.selectedBenchId, null);
        } else if (ui.selectedSlotIdx !== null && ui.selectedSlotIdx !== slotIdx) {
          execSlotAssignment(slotIdx, null, ui.selectedSlotIdx);
        } else {
          ui.selectedSlotIdx = slotIdx;
          ui.selectedBenchId = null;
          refresh();
        }
      });
    }
  });

  // Gắn pointerdown lên các thẻ cầu thủ dự bị
  root.querySelectorAll('.tac-bench-card').forEach((card) => {
    const pid = card.dataset.benchPid;
    const avail = card.dataset.avail;
    card.addEventListener('pointerdown', (e) => {
      if (avail !== 'available') {
        ui.audio?.playAlert();
        const reason = avail === 'subbed_out'
          ? 'Cầu thủ đã bị thay ra trước đó, không thể vào lại sân!'
          : avail === 'injured'
            ? 'Cầu thủ đang chấn thương!'
            : 'Cầu thủ đang bị treo giò!';
        ui.toast?.(reason, 'error');
        return;
      }
      handlePointerStart(e, { type: 'bench', slotIndex: null, playerId: pid });
    });
  });
}
