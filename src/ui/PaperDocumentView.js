// src/ui/PaperDocumentView.js
// Giao diện Đọc Hồ Sơ Văn Bản Giấy 3D & Khay KHẨN CẤP (tách biệt hoàn toàn khỏi màn hình Máy tính Mac OS)
import {
  DOC_STACK_META,
  DOC_STATUS,
  DOC_STATUS_LABELS,
  PRIORITY_LABELS,
  DELEGATION_MODE,
  DELEGATION_MODE_LABELS,
  ROLE_RESPONSIBILITY_MAP,
  isActivePendingDocStatus,
  qualifiesForUrgentTray
} from '../executive/DocumentTypes.js';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getPriorityBadgeStyle(priority) {
  if (priority === 'URGENT') return 'background:#b91c1c;color:#fef08a;border:1px solid #f87171;';
  if (priority === 'HIGH') return 'background:#b45309;color:#fef3c7;border:1px solid #fbbf24;';
  if (priority === 'MEDIUM') return 'background:#1e3a8a;color:#dbeafe;border:1px solid #60a5fa;';
  return 'background:#334155;color:#e2e8f0;';
}

function getStatusBadgeClass(status) {
  if (status === DOC_STATUS.COMPLETED) return 'ok';
  if (status === DOC_STATUS.REJECTED || status === DOC_STATUS.EXPIRED) return 'bad';
  return '';
}

export function renderStackDossierListHTML(state, category, filter = 'active') {
  const docSys = state.documentSystem;
  const meta = DOC_STACK_META.find((m) => m.category === category) || DOC_STACK_META[0];
  const allCat = (docSys?.documents || []).filter((d) => d.category === category);
  const archivedCat = (docSys?.archivedDocuments || []).filter((d) => d.category === category);

  let docs = allCat;
  if (filter === 'pending') docs = allCat.filter((d) => isActivePendingDocStatus(d.status));
  else if (filter === 'approved') docs = allCat.filter((d) => d.status === DOC_STATUS.APPROVED);
  else if (filter === 'archived') docs = archivedCat;

  const pendingCount = allCat.filter((d) => isActivePendingDocStatus(d.status)).length;
  const urgentCount = allCat.filter((d) => qualifiesForUrgentTray(d)).length;

  return `
    <div class="paper-desk-header" style="border-left:5px solid ${meta.colorHex};">
      <div>
        <div class="paper-kicker">${meta.icon} CHỒNG HỒ SƠ CHUYÊN BIỆT · MÃ ${meta.shortCode}</div>
        <h3 style="margin:2px 0;">${esc(meta.label)}</h3>
        <div class="paper-muted">${esc(meta.dept)}</div>
      </div>
      <div class="kpi-mini">
        <span>Chờ duyệt: <b>${pendingCount}</b></span>
        <span>Khẩn: <b style="color:#dc2626;">${urgentCount}</b></span>
        <span>Đã lưu trữ: <b>${archivedCat.length}</b></span>
      </div>
    </div>

    <div class="tab-strip" style="margin-top:8px;">
      <button type="button" class="tab-btn pd-stack-filter ${filter === 'active' ? 'active' : ''}" data-cat="${category}" data-flt="active">📂 Đang mở (${allCat.length})</button>
      <button type="button" class="tab-btn pd-stack-filter ${filter === 'pending' ? 'active' : ''}" data-cat="${category}" data-flt="pending">⏳ Chờ Chủ tịch (${pendingCount})</button>
      <button type="button" class="tab-btn pd-stack-filter ${filter === 'approved' ? 'active' : ''}" data-cat="${category}" data-flt="approved">⚙️ Đang thực thi</button>
      <button type="button" class="tab-btn pd-stack-filter ${filter === 'archived' ? 'active' : ''}" data-cat="${category}" data-flt="archived">🗄️ Lưu trữ (${archivedCat.length})</button>
    </div>

    <div class="scroll-list" style="max-height:52vh;">
      ${docs.length === 0
        ? `<div class="paper-sheet" style="text-align:center;padding:24px;">
            <strong>✅ Không có hồ sơ giấy nào trong nhóm lọc này</strong>
            <p class="paper-muted">Ngăn xếp ${esc(meta.label)} hiện sạch sẽ. Chủ tịch có thể kiểm tra Văn thư Lưu trữ trên Máy tính macOS.</p>
          </div>`
        : docs.map((d) => `
          <div class="paper-list-card ${d.priority === 'URGENT' ? 'is-urgent' : ''}">
            <div class="card-head">
              <strong>[${esc(d.code)}] ${esc(d.title)}</strong>
              <span class="tag" style="${getPriorityBadgeStyle(d.priority)}">${PRIORITY_LABELS[d.priority] || d.priority}</span>
            </div>
            <div class="paper-meta-row">
              <span>🏢 <b>${esc(d.senderDept)}</b> (${esc(d.senderName)})</span>
              <span>📅 Nhận: ${esc(d.receivedDate)}</span>
              <span>⏰ Hạn: <b>${esc(d.deadlineLabel)}</b></span>
            </div>
            <div class="card-head" style="margin-top:6px;">
              <span class="tag ${getStatusBadgeClass(d.status)}">${DOC_STATUS_LABELS[d.status] || d.status}${!d.readByPresident ? ' · CHƯA ĐỌC' : ''}</span>
              <div class="btn-row" style="margin:0;">
                <button type="button" class="btn-xs btn-primary pd-open-doc" data-docid="${d.id}">📄 Mở bìa & Đọc hồ sơ</button>
              </div>
            </div>
          </div>`).join('')}
    </div>`;
}

export function renderUrgentTrayHTML(state) {
  const docSys = state.documentSystem;
  const urgentDocs = docSys ? docSys.getUrgentDocuments() : [];

  return `
    <div class="urgent-tray-banner">
      <div>
        <div style="font-size:11px;font-weight:800;letter-spacing:0.8px;color:#fef08a;">🚨 PRESIDENTIAL PRIORITY · KHAY ĐỎ BÀN CHỦ TỊCH</div>
        <h3 style="margin:2px 0;color:#fff;">HỒ SƠ KHẨN CẤP CẦN QUYẾT ĐỊNH (${urgentDocs.length})</h3>
        <div style="font-size:11.5px;color:#fecaca;">Chỉ tiếp nhận hồ sơ khẩn, sát hạn (≤ 2 ngày), tác động ≥ €25M hoặc nhiệm vụ bị vướng mắc leo thang. Sắp xếp tự động theo độ ưu tiên cao nhất.</div>
      </div>
      <div class="urgent-badge-pill">${urgentDocs.length > 0 ? `URGENT: ${String(urgentDocs.length).padStart(2, '0')}` : 'EMPTY'}</div>
    </div>

    <div class="scroll-list" style="max-height:54vh;margin-top:8px;">
      ${urgentDocs.length === 0
        ? `<div class="paper-sheet" style="text-align:center;padding:26px;">
            <strong>✅ KHAY KHẨN CẤP ĐANG TRỐNG (EMPTY)</strong>
            <p class="paper-muted">Tất cả hồ sơ ưu tiên hàng đầu đã được Chủ tịch Phạm Minh Chiêu xử lý dứt điểm!</p>
          </div>`
        : urgentDocs.map((d, idx) => `
          <div class="paper-list-card is-urgent">
            <div class="card-head">
              <strong>#${idx + 1} · [${esc(d.code)}] ${esc(d.title)}</strong>
              <span class="tag" style="${getPriorityBadgeStyle(d.priority)}">${d.isEscalated ? 'LEO THANG KHẨN' : PRIORITY_LABELS[d.priority]}</span>
            </div>
            <p style="margin:4px 0;color:#1e293b;">${esc(d.summary)}</p>
            <div class="paper-meta-row">
              <span>📁 ${esc(d.categoryLabel)}</span>
              <span>🏢 ${esc(d.senderName)}</span>
              <span>⏰ Hạn: <b style="color:#b91c1c;">${esc(d.deadlineLabel)}</b></span>
              ${d.financialImpactM !== 0 ? `<span>💶 Tác động: <b>${d.financialImpactM >= 0 ? '+' : ''}€${Number(d.financialImpactM).toFixed(1)}M</b></span>` : ''}
            </div>
            <div class="card-head" style="margin-top:6px;">
              <span class="tag">${DOC_STATUS_LABELS[d.status] || d.status}${d.isNewAlert ? ' · MỚI ĐẾN' : ''}</span>
              <button type="button" class="btn-xs btn-danger pd-open-doc" data-docid="${d.id}">📂 Nhấc hồ sơ & Xử lý ngay</button>
            </div>
          </div>`).join('')}
    </div>`;
}

export function renderPaperDossierReaderHTML(state, doc, pageIdx = 0, draft = {}) {
  const execSys = state.executionSystem;
  const meta = DOC_STACK_META.find((m) => m.category === doc.category) || DOC_STACK_META[4];
  const pages = doc.pages || [];
  const totalPages = pages.length + 2; // 0: Bìa hồ sơ, 1..pages.length: Các trang nội dung, last: Hồ sơ liên quan & Lịch sử
  const safePage = Math.max(0, Math.min(totalPages - 1, Number(pageIdx || 0)));
  const selectedOwnerKey = draft.ownerRoleKey || doc.defaultOwnerRoleKey || 'ceo';
  const selectedDelegation = draft.delegationMode || DELEGATION_MODE.SUPERVISE;
  const noteVal = draft.instruction || '';
  const activeTask = doc.executionTaskId ? execSys?.getTaskById?.(doc.executionTaskId) : null;
  const isDecidable = isActivePendingDocStatus(doc.status);

  const ownerChoices = Object.values(ROLE_RESPONSIBILITY_MAP).map((r) => {
    const resolved = execSys?.resolveOwnerNpc?.(r.roleKey);
    const load = execSys?.getOwnerWorkloadCount?.(r.roleKey) || 0;
    return {
      roleKey: r.roleKey,
      label: `${resolved?.name || r.title} · ${r.title} (${load} việc đang chạy)`
    };
  });

  let sheetHtml = '';
  if (safePage === 0) {
    sheetHtml = `
      <div class="paper-cover">
        <div class="paper-crest-row">
          <span class="paper-seal">PARIS SAINT-GERMAIN · VĂN PHÒNG CHỦ TỊCH</span>
          <span class="tag" style="${getPriorityBadgeStyle(doc.priority)}">${PRIORITY_LABELS[doc.priority] || doc.priority}</span>
        </div>
        <h2 class="paper-doc-title">${esc(doc.title)}</h2>
        <div class="paper-doc-sub">${esc(doc.subtitle || doc.categoryLabel)}</div>
        <div class="paper-grid-meta">
          <div><span>Mã hồ sơ:</span><b>${esc(doc.code)}</b></div>
          <div><span>Loại tài liệu:</span><b>${esc(doc.categoryLabel)}</b></div>
          <div><span>Người / Bộ phận trình:</span><b>${esc(doc.senderName)} (${esc(doc.senderDept)})</b></div>
          <div><span>Ngày tiếp nhận:</span><b>${esc(doc.receivedDate)}</b></div>
          <div><span>Thời hạn xử lý:</span><b style="color:#b91c1c;">${esc(doc.deadlineLabel)}</b></div>
          <div><span>Trạng thái hiện tại:</span><b>${esc(DOC_STATUS_LABELS[doc.status] || doc.status)}</b></div>
        </div>
        <div class="paper-callout">
          <strong>Tóm tắt nội dung trình Chủ tịch Phạm Minh Chiêu:</strong>
          <p>${esc(doc.summary)}</p>
        </div>
        <div class="paper-callout warn">
          <strong>Đề xuất hành động & Hệ quả dự kiến:</strong>
          <p><b>Khuyến nghị:</b> ${esc(doc.recommendedAction)}</p>
          <p><b>Nếu Phê duyệt / Ký:</b> ${esc(doc.consequences?.approve)}</p>
          <p><b>Nếu Từ chối:</b> ${esc(doc.consequences?.reject)}</p>
        </div>
      </div>`;
  } else if (safePage <= pages.length) {
    const p = pages[safePage - 1];
    sheetHtml = `
      <div class="paper-page-inner">
        <div class="paper-page-num">Trang ${safePage} / ${totalPages - 1} · [${esc(doc.code)}]</div>
        <h3 style="color:#00205b;margin:4px 0 8px;">${esc(p.heading)}</h3>
        <p style="line-height:1.65;color:#0f172a;font-size:13px;">${esc(p.body)}</p>
        ${(p.bullets || []).length > 0 ? `
          <ul class="paper-bullets">
            ${p.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}
          </ul>` : ''}
      </div>`;
  } else {
    sheetHtml = `
      <div class="paper-page-inner">
        <div class="paper-page-num">Phụ lục Hồ sơ & Lịch sử Ý kiến · [${esc(doc.code)}]</div>
        <h3 style="color:#00205b;margin:4px 0 8px;">📎 Tài liệu đính kèm & Ghi chú</h3>
        <ul class="paper-bullets">
          ${(doc.relatedDocs || []).length > 0
            ? doc.relatedDocs.map((rd) => `<li>${esc(rd)}</li>`).join('')
            : '<li>Chứng từ gốc đã được đồng bộ với Trung tâm Lưu trữ Máy tính macOS.</li>'}
        </ul>
        <h4 style="color:#00205b;margin:10px 0 4px;">✍️ Lịch sử Chữ ký & Chỉ đạo (${(doc.decisionHistory || []).length + (doc.notes || []).length})</h4>
        ${(doc.notes || []).length === 0 && (doc.decisionHistory || []).length === 0
          ? '<p class="paper-muted">Chưa có quyết định hoặc bút phê nào trên văn bản này.</p>'
          : `<ul class="paper-bullets">
              ${(doc.decisionHistory || []).map((dh) => `<li><b>${esc(dh.decidedAt)}</b>: Chủ tịch chọn <b>${esc(dh.action)}</b> · Giao <b>${esc(dh.assignedOwnerName)}</b>${dh.instruction ? ` ("${esc(dh.instruction)}")` : ''}</li>`).join('')}
              ${(doc.notes || []).map((nt) => `<li><b>${esc(nt.date)}</b>: ${esc(nt.text)}</li>`).join('')}
            </ul>`}
      </div>`;
  }

  return `
    <div class="paper-reader-shell">
      <div class="paper-reader-topbar" style="border-bottom:3px solid ${meta.colorHex};">
        <button type="button" class="btn-xs btn-secondary" id="pd-back-list">← Về danh sách</button>
        <div class="paper-page-tabs">
          <button type="button" class="tab-btn pd-page-tab ${safePage === 0 ? 'active' : ''}" data-pidx="0">📕 Bìa Hồ Sơ</button>
          ${pages.map((_, i) => `<button type="button" class="tab-btn pd-page-tab ${safePage === i + 1 ? 'active' : ''}" data-pidx="${i + 1}">📄 Trang ${i + 1}</button>`).join('')}
          <button type="button" class="tab-btn pd-page-tab ${safePage === totalPages - 1 ? 'active' : ''}" data-pidx="${totalPages - 1}">📎 Phụ lục</button>
        </div>
        <div class="paper-page-nav">
          <button type="button" class="btn-xs btn-secondary" id="pd-prev-page" ${safePage <= 0 ? 'disabled' : ''}>◀ Lật trước</button>
          <button type="button" class="btn-xs btn-secondary" id="pd-next-page" ${safePage >= totalPages - 1 ? 'disabled' : ''}>Lật sau ▶</button>
        </div>
      </div>

      <div class="paper-sheet">${sheetHtml}</div>

      ${activeTask ? `
        <div class="card-item" style="margin-top:8px;border-left:4px solid #38bdf8;">
          <div class="card-head">
            <strong>⚙️ Nhiệm vụ thực thi liên kết: ${esc(activeTask.statusLabel)} (${activeTask.progress}%)</strong>
            <button type="button" class="btn-xs btn-primary" id="pd-jump-tracker" data-tid="${activeTask.id}">🖥️ Theo dõi trên Mac Tracker</button>
          </div>
          <div class="muted">Phụ trách: <b>${esc(activeTask.ownerName)}</b> · Hạn: ${activeTask.daysElapsed}/${activeTask.deadlineDays} ngày</div>
        </div>` : ''}

      <div class="card-item" style="margin-top:8px;">
        <div class="section-label" style="margin-top:0;">⚖️ Bảng Ra Quyết Định & Giao Việc Của Chủ Tịch</div>
        <div class="grid-2" style="margin-bottom:8px;">
          <div class="form-row" style="margin-top:0;">
            <label style="font-size:11px;color:#cbd5e1;">Người chịu trách nhiệm thực thi:</label>
            <select id="pd-owner-sel" class="input-ctrl">
              ${ownerChoices.map((o) => `<option value="${o.roleKey}" ${o.roleKey === selectedOwnerKey ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
            </select>
          </div>
          <div class="form-row" style="margin-top:0;">
            <label style="font-size:11px;color:#cbd5e1;">Chế độ điều hành / Ủy quyền:</label>
            <select id="pd-delegation-sel" class="input-ctrl">
              ${Object.entries(DELEGATION_MODE_LABELS).map(([k, lbl]) => `<option value="${k}" ${k === selectedDelegation ? 'selected' : ''}>${esc(lbl)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-row" style="margin-top:4px;margin-bottom:8px;">
          <input id="pd-instruction-inp" class="input-ctrl" value="${esc(noteVal)}" placeholder="Nhập chỉ đạo, lý do từ chối hoặc yêu cầu chỉnh sửa / thông tin bổ sung..." />
        </div>

        <div class="btn-row">
          ${isDecidable ? `
            <button type="button" class="btn-primary pd-act-btn" data-act="APPROVE">✅ Phê duyệt (APPROVE)</button>
            <button type="button" class="btn-accent pd-act-btn" data-act="SIGN">✍️ Ký ban hành (SIGN)</button>
            <button type="button" class="btn-primary pd-act-btn" data-act="ASSIGN_TASK">📌 Giao nhiệm vụ (ASSIGN TASK)</button>
            <button type="button" class="btn-danger pd-act-btn" data-act="REJECT">❌ Từ chối (REJECT)</button>
            <button type="button" class="btn-secondary pd-act-btn" data-act="REQUEST_REVISION">📝 Yêu cầu sửa (REVISION)</button>
            <button type="button" class="btn-secondary pd-act-btn" data-act="REQUEST_INFORMATION">🔍 Hỏi thêm thông tin</button>
            <button type="button" class="btn-secondary pd-act-btn" data-act="FORWARD">📨 Chuyển tiếp bộ phận</button>
          ` : ''}
          <button type="button" class="btn-secondary pd-act-btn" data-act="ADD_INSTRUCTION">💬 Thêm chỉ đạo</button>
          <button type="button" class="btn-secondary pd-act-btn" data-act="CLOSE">↩️ Đóng hồ sơ</button>
        </div>
      </div>
    </div>`;
}
