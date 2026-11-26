// src/ui/ExecutiveMacViews.js
// Giao diện nâng cấp Hệ điều hành Mac OS Chủ tịch (PSG PRESIDENTIAL MANAGEMENT SYSTEM):
// - Presidential Daily Briefing (Dữ liệu thật 100%)
// - Executive Action Tracker (Theo dõi tiến độ thực thi đa bước & can thiệp của Chủ tịch)
// - Document Archive (Tìm kiếm & tra cứu lịch sử văn bản / chữ ký / lưu trữ)
// - Strategic Planning (Hoạch định chiến lược nhiều mùa & phát hành tờ trình giấy)
// - Staff Authority & Accountability Matrix (Quyền hạn, nhiệm vụ & đánh giá NPC)

import {
  DOC_STACK_META,
  DOC_STATUS,
  DOC_STATUS_LABELS,
  TASK_STATUS,
  TASK_STATUS_LABELS,
  DELEGATION_MODE_LABELS,
  ROLE_RESPONSIBILITY_MAP
} from '../executive/DocumentTypes.js';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getTaskBadgeClass(status) {
  if (status === TASK_STATUS.COMPLETED) return 'ok';
  if (status === TASK_STATUS.FAILED || status === TASK_STATUS.BLOCKED) return 'bad';
  return '';
}

export function renderDailyBriefingWidgetHTML(state) {
  const exec = state.executionSystem;
  const br = exec?.buildDailyBriefingData?.();
  if (!br) return '';

  return `
    <div class="card-item" style="border-left:4px solid #d4af37;background:rgba(15,23,42,0.92);">
      <div class="card-head">
        <strong>🌅 BÁO CÁO ĐẦU NGÀY CHỦ TỊCH (PRESIDENTIAL DAILY BRIEFING)</strong>
        <span class="tag ok">${esc(br.date)} · Tuần ${br.week}</span>
      </div>
      <div class="kpi-mini" style="margin:4px 0 6px;">
        <span>Hồ sơ KHẨN: <b style="color:#f87171;">${br.urgentDocsCount}</b></span>
        <span>Hồ sơ giấy chờ duyệt: <b>${br.pendingDocsCount}</b></span>
        <span>Việc đang triển khai: <b style="color:#38bdf8;">${br.activeTasksCount}</b></span>
        <span>Vướng mắc: <b style="color:#fbbf24;">${br.blockedTasksCount}</b></span>
      </div>
      <div class="muted" style="margin-bottom:6px;">
        <b>Trận kế tiếp:</b> ${esc(br.upcomingMatch)} · <b>HLV Trưởng:</b> ${esc(br.coachName)} · <b>FFP:</b> ${esc(br.ffpStatus)}
      </div>
      ${br.injuredList.length > 0 ? `<div class="muted" style="color:#fca5a5;margin-bottom:6px;">🏥 Chấn thương: ${esc(br.injuredList.join(', '))}</div>` : ''}
      <div class="section-label" style="margin:6px 0 4px;">🎯 Trọng tâm điều hành hôm nay</div>
      <ul class="mem-list" style="color:#e2e8f0;margin-bottom:8px;">
        ${br.topPriorities.map((p) => `<li>${esc(p)}</li>`).join('')}
      </ul>
      <div class="btn-row">
        <button type="button" class="btn-xs btn-danger ov-open-urgent">🚨 Mở Khay KHẨN (${br.urgentDocsCount})</button>
        <button type="button" class="btn-xs btn-primary ov-jump-app" data-pctab="action_tracker">📌 Action Tracker (${br.activeTasksCount})</button>
        <button type="button" class="btn-xs btn-secondary ov-jump-app" data-pctab="archive">🗄️ Văn Thư Lưu Trữ</button>
        <button type="button" class="btn-xs btn-accent ov-jump-app" data-pctab="strategy">🧭 Chiến Lược CLB</button>
      </div>
    </div>`;
}

export function renderActionTrackerHTML(state, filter = { status: 'ACTIVE', owner: 'ALL' }) {
  const exec = state.executionSystem;
  const allTasks = exec?.executionTasks || [];
  const activeCount = allTasks.filter((t) =>
    t.status !== TASK_STATUS.COMPLETED &&
    t.status !== TASK_STATUS.FAILED &&
    t.status !== TASK_STATUS.CANCELLED
  ).length;
  const blockedCount = allTasks.filter((t) => t.status === TASK_STATUS.BLOCKED).length;
  const waitingCount = allTasks.filter((t) => t.status === TASK_STATUS.WAITING_RESPONSE).length;
  const completedCount = allTasks.filter((t) => t.status === TASK_STATUS.COMPLETED).length;

  let tasks = allTasks;
  if (filter.status === 'ACTIVE') {
    tasks = allTasks.filter((t) =>
      t.status !== TASK_STATUS.COMPLETED &&
      t.status !== TASK_STATUS.FAILED &&
      t.status !== TASK_STATUS.CANCELLED
    );
  } else if (filter.status !== 'ALL') {
    tasks = allTasks.filter((t) => t.status === filter.status);
  }
  if (filter.owner && filter.owner !== 'ALL') {
    tasks = tasks.filter((t) => t.ownerRoleKey === filter.owner);
  }

  return `
    <div class="kpi-grid">
      <div class="kpi-card"><span>Đang triển khai</span><strong class="tabular-nums" style="color:#38bdf8;">${activeCount}</strong></div>
      <div class="kpi-card"><span>Chờ đối tác phản hồi</span><strong class="tabular-nums">${waitingCount}</strong></div>
      <div class="kpi-card"><span>Vướng mắc / Chặn</span><strong class="tabular-nums" style="color:#f87171;">${blockedCount}</strong></div>
      <div class="kpi-card"><span>Đã hoàn thành</span><strong class="tabular-nums" style="color:#4ade80;">${completedCount}</strong></div>
    </div>

    <div class="card-item" style="padding:8px 10px;">
      <div class="filter-bar" style="margin-bottom:0;">
        <select id="trk-flt-status" class="input-ctrl">
          <option value="ACTIVE" ${filter.status === 'ACTIVE' ? 'selected' : ''}>Đang xử lý & Vướng mắc (${activeCount})</option>
          <option value="BLOCKED" ${filter.status === 'BLOCKED' ? 'selected' : ''}>Chỉ xem Đang vướng mắc (${blockedCount})</option>
          <option value="COMPLETED" ${filter.status === 'COMPLETED' ? 'selected' : ''}>Đã hoàn thành (${completedCount})</option>
          <option value="FAILED" ${filter.status === 'FAILED' ? 'selected' : ''}>Thất bại</option>
          <option value="ALL" ${filter.status === 'ALL' ? 'selected' : ''}>Tất cả nhiệm vụ (${allTasks.length})</option>
        </select>
        <select id="trk-flt-owner" class="input-ctrl">
          <option value="ALL">Tất cả người phụ trách</option>
          ${Object.values(ROLE_RESPONSIBILITY_MAP).map((r) => `<option value="${r.roleKey}" ${filter.owner === r.roleKey ? 'selected' : ''}>${esc(r.title)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="scroll-list" style="max-height:48vh;">
      ${tasks.length === 0
        ? `<div class="card-item muted" style="text-align:center;padding:18px;">
            Chưa có nhiệm vụ thực thi nào khớp bộ lọc. Hãy mở các chồng hồ sơ giấy trên bàn Chủ tịch để ký duyệt và giao việc!
          </div>`
        : tasks.map((t) => `
          <div class="card-item ${t.status === TASK_STATUS.BLOCKED ? 'urgent' : ''}">
            <div class="card-head">
              <strong>[${esc(t.documentCode)}] ${esc(t.title)}</strong>
              <span class="tag ${getTaskBadgeClass(t.status)}">${TASK_STATUS_LABELS[t.status] || t.statusLabel} (${t.progress}%)</span>
            </div>
            <div class="kpi-mini" style="margin:4px 0;">
              <span>Phụ trách: <b>${esc(t.ownerName)}</b> (${esc(t.department)})</span>
              <span>Chế độ: <b>${esc(DELEGATION_MODE_LABELS[t.delegationMode] || t.delegationMode)}</b></span>
              <span>Tiến độ ngày: <b>${t.daysElapsed}/${t.deadlineDays} ngày</b></span>
            </div>
            <div class="attr-bar-track" style="margin:5px 0 8px;">
              <div class="attr-bar-fill" style="width:${t.progress}%;background:${t.status === TASK_STATUS.BLOCKED ? '#ef4444' : t.status === TASK_STATUS.COMPLETED ? '#22c55e' : '#38bdf8'};"></div>
            </div>
            <div class="muted" style="font-size:11px;margin-bottom:6px;">
              Các bước: ${(t.steps || []).map((st, idx) => `${st.done ? '✅' : idx === t.currentStepIdx ? '⏳' : '⬜'} ${esc(st.name)}`).join(' → ')}
            </div>
            ${t.blocker ? `
              <div class="task-error-banner" style="margin-bottom:6px;">
                <b>🚧 ${esc(t.blocker.title)}:</b> ${esc(t.blocker.detail)}
              </div>` : ''}
            ${t.failureReason ? `<p style="color:#fca5a5;">❌ Lý do: ${esc(t.failureReason)}</p>` : ''}
            ${t.reports?.[0] ? `<div class="dialogue-bubble" style="margin:4px 0;padding:6px 10px;font-size:11.5px;"><b>${esc(t.reports[0].author)}</b> (${esc(t.reports[0].date)}): "${esc(t.reports[0].text)}"</div>` : ''}

            ${t.status !== TASK_STATUS.COMPLETED && t.status !== TASK_STATUS.FAILED && t.status !== TASK_STATUS.CANCELLED ? `
              <div class="btn-row" style="margin-top:6px;">
                <button type="button" class="btn-xs btn-primary trk-req-report" data-tid="${t.id}">📊 Yêu cầu báo cáo</button>
                <button type="button" class="btn-xs btn-accent trk-send-inst" data-tid="${t.id}">📌 Gửi chỉ đạo</button>
                <button type="button" class="btn-xs btn-secondary trk-extend" data-tid="${t.id}">⏰ Gia hạn +3 ngày</button>
                <button type="button" class="btn-xs btn-secondary trk-reassign" data-tid="${t.id}">🔄 Đổi người phụ trách</button>
                <button type="button" class="btn-xs btn-secondary trk-explain" data-tid="${t.id}">🗣️ Yêu cầu giải trình</button>
                <button type="button" class="btn-xs btn-secondary trk-pause" data-tid="${t.id}">${t.status === TASK_STATUS.PAUSED ? '▶️ Tiếp tục' : '⏸️ Tạm dừng'}</button>
                ${t.status === TASK_STATUS.BLOCKED ? `<button type="button" class="btn-xs btn-primary trk-unblock" data-tid="${t.id}">🛠️ Tháo gỡ & Tiếp tục</button>` : ''}
                <button type="button" class="btn-xs btn-danger trk-cancel" data-tid="${t.id}">🚫 Hủy bỏ</button>
                <button type="button" class="btn-xs btn-secondary trk-open-doc" data-docid="${t.documentId}">📄 Xem văn bản gốc</button>
              </div>` : `
              <div class="btn-row">
                <button type="button" class="btn-xs btn-secondary trk-open-doc" data-docid="${t.documentId}">📄 Xem hồ sơ lưu trữ</button>
              </div>`}
          </div>`).join('')}
    </div>`;
}

export function renderDocumentArchiveHTML(state, filters = { query: '', category: 'ALL', status: 'ALL', dept: 'ALL' }) {
  const docSys = state.documentSystem;
  const results = docSys ? docSys.searchArchive(filters) : [];

  return `
    <div class="kpi-grid">
      <div class="kpi-card"><span>Hồ sơ đã lưu trữ</span><strong class="tabular-nums">${docSys?.archivedDocuments?.length || 0}</strong></div>
      <div class="kpi-card"><span>Tổng quyết định đã ký</span><strong class="tabular-nums">${state.executionSystem?.decisions?.length || 0}</strong></div>
      <div class="kpi-card"><span>Kết quả khớp bộ lọc</span><strong class="tabular-nums">${results.length}</strong></div>
    </div>

    <div class="card-item" style="padding:8px 10px;">
      <div class="filter-bar" style="margin-bottom:0;">
        <input id="arc-search" class="input-ctrl" value="${esc(filters.query)}" placeholder="Tìm theo mã hồ sơ (PSG-CN...), tên, người trình..." />
        <select id="arc-cat" class="input-ctrl">
          <option value="ALL">Tất cả 6 nhóm văn bản</option>
          ${DOC_STACK_META.map((m) => `<option value="${m.category}" ${filters.category === m.category ? 'selected' : ''}>${m.icon} ${esc(m.label)}</option>`).join('')}
        </select>
        <select id="arc-status" class="input-ctrl">
          <option value="ALL">Mọi trạng thái</option>
          <option value="${DOC_STATUS.COMPLETED}" ${filters.status === DOC_STATUS.COMPLETED ? 'selected' : ''}>Hoàn tất thực thi</option>
          <option value="${DOC_STATUS.APPROVED}" ${filters.status === DOC_STATUS.APPROVED ? 'selected' : ''}>Đã phê duyệt</option>
          <option value="${DOC_STATUS.REJECTED}" ${filters.status === DOC_STATUS.REJECTED ? 'selected' : ''}>Đã từ chối</option>
          <option value="${DOC_STATUS.ARCHIVED}" ${filters.status === DOC_STATUS.ARCHIVED ? 'selected' : ''}>Đã lưu trữ</option>
        </select>
      </div>
    </div>

    <div class="scroll-list" style="max-height:48vh;">
      ${results.length === 0
        ? '<div class="card-item muted" style="text-align:center;padding:18px;">Chưa có văn bản lưu trữ phù hợp với bộ lọc tìm kiếm.</div>'
        : results.map((d) => {
          const dec = d.decisionHistory?.[0];
          return `
            <div class="card-item">
              <div class="card-head">
                <strong>[${esc(d.code)}] ${esc(d.title)}</strong>
                <span class="tag ${d.status === DOC_STATUS.COMPLETED ? 'ok' : d.status === DOC_STATUS.REJECTED ? 'bad' : ''}">${DOC_STATUS_LABELS[d.status] || d.status}</span>
              </div>
              <div class="muted">Bộ phận: <b>${esc(d.senderDept)}</b> (${esc(d.senderName)}) · Nhận: ${esc(d.receivedDate)} · Lưu: ${esc(d.archivedDate || d.signedAt || 'Đang theo dõi')}</div>
              ${dec ? `<div class="muted" style="color:#93c5fd;">✍️ Quyết định: <b>${esc(dec.action)}</b> · Giao: <b>${esc(dec.assignedOwnerName)}</b> (${esc(dec.decidedAt)})</div>` : ''}
              <div class="btn-row">
                <button type="button" class="btn-xs btn-primary arc-open-doc" data-docid="${d.id}">📄 Mở lại hồ sơ & Lịch sử chữ ký</button>
                ${d.executionTaskId ? `<button type="button" class="btn-xs btn-secondary arc-open-task" data-tid="${d.executionTaskId}">📌 Xem kết quả thực thi</button>` : ''}
              </div>
            </div>`;
        }).join('')}
    </div>`;
}

export function renderStrategicPlanningHTML(state) {
  const s = state;
  const ligue1 = s.clubs.filter((c) => c.league === 'Ligue 1').sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
  const rank = ligue1.findIndex((c) => c.name === 'Paris Saint-Germain') + 1;
  const avgFac = (Object.values(s.commercialSystem?.facilities || {}).reduce((sum, f) => sum + (f.level || 3), 0) / 6).toFixed(1);
  const avgPerf = Math.round((s.departments || []).reduce((sum, d) => sum + d.performance, 0) / Math.max(1, (s.departments || []).length));
  const promotedCount = (s.academy || []).filter((y) => y.promoted).length;

  return `
    <div class="kpi-grid">
      <div class="kpi-card"><span>Ligue 1 Hiện tại</span><strong>Hạng ${rank || 1}</strong></div>
      <div class="kpi-card"><span>Trung bình CSVC</span><strong>Lv ${avgFac}/5.0</strong></div>
      <div class="kpi-card"><span>KPI 12 Phòng ban</span><strong>${avgPerf}%</strong></div>
      <div class="kpi-card"><span>Tài năng trẻ đã đôn</span><strong>${promotedCount} cầu thủ</strong></div>
    </div>

    <div class="card-item" style="border-left:4px solid #d4af37;">
      <div class="card-head">
        <strong>🧭 Lộ trình Chiến lược Paris Saint-Germain (${esc(s.season)})</strong>
        <span class="tag ok">Uy tín Chủ tịch: ${s.reputationSystem?.getOverallScore?.() ?? s.president.prestige}/100</span>
      </div>
      <ul class="mem-list" style="color:#e2e8f0;margin-bottom:8px;">
        <li><b>Mục tiêu Chuyên môn:</b> Bảo vệ ngôi vương Ligue 1 & Lọt tối thiểu Bán kết UEFA Champions League.</li>
        <li><b>Mục tiêu Tài chính & FFP:</b> Duy trì chi phí quỹ lương ≤ 75% doanh thu và ngân sách dự phòng ≥ €80M.</li>
        <li><b>Mục tiêu Học viện & Nhân sự:</b> Đôn ít nhất 2 cầu thủ U19 tiềm năng 86+ và duy trì KPI phòng ban ≥ 85%.</li>
      </ul>
      <div class="btn-row">
        <button type="button" class="btn-primary" id="str-raise-kpi-doc">📄 Trình Tờ trình Chiến lược KPI ra Bàn Giấy</button>
        <button type="button" class="btn-accent" id="str-raise-youth-doc">🎓 Lập Hồ sơ Đầu tư Học viện (-€8M)</button>
        <button type="button" class="btn-secondary" id="str-jump-tracker">📌 Theo dõi Thực thi (Action Tracker)</button>
      </div>
    </div>

    <div class="section-label">🏛️ Phân quyền & Đánh giá Năng lực Ban Điều Hành</div>
    ${renderStaffAccountabilityHTML(state)}`;
}

export function renderStaffAccountabilityHTML(state) {
  const exec = state.executionSystem;
  const rows = exec?.getStaffAccountabilityList?.() || [];
  return `
    <div class="table-wrap" style="max-height:36vh;">
      <table class="data-table">
        <thead>
          <tr>
            <th>Chức vụ</th>
            <th>Nhân sự hiện tại</th>
            <th>Phạm vi quyền</th>
            <th>Đang chạy</th>
            <th>Đúng hạn / Trễ / Hỏng</th>
            <th>Năng lực</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `
            <tr class="${r.vacant ? 'highlight-row' : ''}">
              <td><b>${esc(r.title)}</b></td>
              <td>${r.vacant ? `<span class="tag bad">${esc(r.ownerName)}</span>` : `<b>${esc(r.ownerName)}</b>`}</td>
              <td class="muted">${esc((r.authorityScope || []).join(', '))} (Ký ≤ €${r.canSignSmallUnderM}M)</td>
              <td><b>${r.currentTasks.length}</b> việc</td>
              <td><span style="color:#4ade80;">${r.onTimeCount}</span> / <span style="color:#fbbf24;">${r.delayedCount}</span> / <span style="color:#f87171;">${r.failedCount}</span></td>
              <td><span class="tag ${r.competency >= 82 ? 'ok' : ''}">${r.competency}/100</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}
