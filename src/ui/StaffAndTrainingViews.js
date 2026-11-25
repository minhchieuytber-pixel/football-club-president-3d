// src/ui/StaffAndTrainingViews.js
// Giao diện Quản lý Nhân sự & Ban Huấn Luyện 12 chức vụ (Phần III & VI) + Hệ thống Huấn luyện 3D, Lịch tập, Báo cáo & Tương tác BHL (Phần VII, VIII, IX)
import { STAFF_ROLE_META } from '../staff/StaffDatabase.js';
import { COACHING_ROLE_ORDER } from '../staff/CoachingStaffSystem.js';
import { DRILL_CATALOG } from '../training/TrainingSystem.js';
import { renderCoachDirectivesHTML } from './RelationshipViews.js';

export function renderStaffCoachTabHTML(state, subTab = 'head_coach', directiveDraft = {}) {
  const hc = state.managerSystem.getActiveByRole('head_coach');
  const mults = state.coachingSystem.getTrainingQualityMultipliers();
  const coachingList = state.coachingSystem.getCoachingTeam();
  const execRoles = ['sporting_director', 'academy_director', 'head_medical', 'cfo'];

  let body = '';
  if (subTab === 'head_coach') {
    const sev = hc ? state.managerSystem.calculateSeverance(hc) : 0;
    const cands = state.managerSystem.getCandidatesForRole('head_coach');
    body = `
      <div class="card-item ${hc ? '' : 'urgent'}">
        <div class="card-head">
          <strong>👔 HLV Trưởng PSG: ${hc ? hc.name : '⚠️ ĐANG TUYỂN DỤNG (TRỐNG GHẾ)'}</strong>
          <span class="tag ${hc ? 'ok' : 'bad'}">${hc ? `OVR ${hc.overall} · HĐ ${hc.contractYears} năm · €${hc.wage}k/tuần` : 'Chưa bổ nhiệm'}</span>
        </div>
        ${hc ? `
          <div class="muted">${hc.age} tuổi · ${hc.nationality} · Kinh nghiệm: <b>${hc.experience}</b> · Chiến thuật: <b>${hc.ratings?.tactics}</b> · Trẻ: <b>${hc.youthDev}</b> · Phòng thay đồ: <b>${hc.dressingRoom}</b></div>
          <p>Phong cách: <b>${hc.tacticalStyle}</b> · Thành tích: ${(hc.achievements || []).join(' · ')}</p>
          <p class="muted">Khoản bồi thường nếu sa thải ngay: <b style="color:#f87171;">€${sev}M</b></p>
          <div class="btn-row">
            <button class="btn-primary" id="stf-extend-hc">✍️ Gia hạn +2 năm (+8% lương)</button>
            <button class="btn-accent" id="stf-open-directives">🎯 Định hướng sử dụng cầu thủ</button>
            <button class="btn-secondary" id="stf-open-locker">🏥 Báo cáo Phòng thay đồ</button>
            <button class="btn-danger" id="stf-fire-hc">🔥 Sa thải HLV trưởng (Bồi thường €${sev}M)</button>
          </div>
        ` : `<p style="color:#fde68a;">Ghế HLV trưởng đang trống! Hãy chọn ứng viên bên dưới để đàm phán và bổ nhiệm ngay lập tức.</p>`}
      </div>
      <div class="section-label">📋 Danh sách Ứng viên HLV Trưởng (${cands.length})</div>
      <div class="scroll-list" style="max-height:36vh;">
        ${cands.map((c) => `
          <div class="card-item">
            <div class="card-head">
              <strong>${c.name} (${c.age}t · ${c.nationality})</strong>
              <span class="tag ok">Danh tiếng ${c.reputation} · Yêu cầu €${c.wage}k/tuần (${c.contractYears} năm)</span>
            </div>
            <div class="muted">CLB hiện tại: <b>${c.currentClub}</b> · Chiến thuật: <b>${c.ratings?.tactics}</b> · Phát triển trẻ: <b>${c.youthDev}</b> · Quản lý PTĐ: <b>${c.dressingRoom}</b></div>
            <p>Triết lý: ${c.tacticalStyle} · Thành tích: ${(c.achievements || []).slice(0, 2).join(' · ')}</p>
            <div class="btn-row">
              <button class="btn-xs btn-primary stf-open-neg" data-sid="${c.staffId}">🤝 Gửi lời mời & Đàm phán hợp đồng</button>
            </div>
          </div>`).join('')}
      </div>`;
  } else if (subTab === 'coaching_12') {
    body = `
      <div class="kpi-grid">
        <div class="kpi-card"><span>Nhân sự BHL</span><strong>${state.coachingSystem.getActiveCount()} / 12</strong></div>
        <div class="kpi-card"><span>Hệ số Thể lực</span><strong>x${mults.fitness}</strong></div>
        <div class="kpi-card"><span>Hệ số Kỹ thuật / Sút</span><strong>x${mults.technical}</strong></div>
        <div class="kpi-card"><span>Hệ số Chiến thuật / GK</span><strong>x${mults.tactical} / x${mults.gk}</strong></div>
      </div>
      <div class="table-wrap" style="max-height:40vh;">
        <table class="data-table">
          <thead><tr><th>#</th><th>Chức vụ</th><th>Nhân sự</th><th>OVR</th><th>Lương</th><th>Nhiệm vụ 3D</th><th>Quản lý</th></tr></thead>
          <tbody>
            ${coachingList.map(({ order, roleKey, staff }) => {
              const meta = STAFF_ROLE_META[roleKey];
              return `<tr>
                <td>${order}</td>
                <td><b>${meta.title}</b></td>
                <td>${staff ? `<b>${staff.name}</b> <span class="muted">(${staff.nationality})</span>` : `<span class="tag bad">Trống</span>`}</td>
                <td>${staff ? `<b>${staff.overall}</b>` : '-'}</td>
                <td>${staff ? `€${staff.wage}k` : '-'}</td>
                <td class="muted" style="max-width:210px;white-space:normal;">${meta.duty}</td>
                <td>
                  ${staff ? `<button class="btn-xs btn-danger stf-fire-role" data-rkey="${roleKey}">Sa thải</button>` : ''}
                  <button class="btn-xs btn-primary stf-recruit-role" data-rkey="${roleKey}">Tuyển mới</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  } else if (subTab === 'executives') {
    body = `
      <div class="scroll-list" style="max-height:44vh;">
        ${execRoles.map((rk) => {
          const meta = STAFF_ROLE_META[rk];
          const cur = state.managerSystem.getActiveByRole(rk);
          const sev = cur ? state.managerSystem.calculateSeverance(cur) : 0;
          return `
            <div class="card-item ${cur ? '' : 'urgent'}">
              <div class="card-head"><strong>${meta.title} (${meta.dept})</strong><span class="tag ${cur ? 'ok' : 'bad'}">${cur ? `${cur.name} · OVR ${cur.overall}` : 'Đang tuyển dụng'}</span></div>
              <div class="muted">${meta.duty}${cur ? ` · Lương €${cur.wage}k/tuần · HĐ ${cur.contractYears} năm` : ''}</div>
              <div class="btn-row">
                ${cur ? `<button class="btn-xs btn-danger stf-fire-role" data-rkey="${rk}">🔥 Miễn nhiệm (€${sev}M)</button>` : ''}
                <button class="btn-xs btn-primary stf-recruit-role" data-rkey="${rk}">🤝 Xem ứng viên & Tuyển dụng</button>
              </div>
            </div>`;
        }).join('')}
      </div>`;
  } else if (subTab === 'directives') {
    body = renderCoachDirectivesHTML(state, directiveDraft);
  } else {
    const hist = state.staffDb.history || [];
    const dep = state.staffDb.departed || [];
    body = `
      <div class="section-label">📜 Lịch sử Bổ nhiệm & Miễn nhiệm (${hist.length})</div>
      <div class="scroll-list" style="max-height:22vh;">
        ${hist.map((h) => `<div class="card-item"><div class="card-head"><strong>${h.action}: ${h.name} (${h.role})</strong><span class="muted">${h.date}</span></div><p class="muted">${h.reason}${h.cost ? ` · Chi phí: €${h.cost}M` : ''}</p></div>`).join('')}
      </div>
      <div class="section-label">🚪 Nhân sự đã rời PSG (${dep.length})</div>
      <div class="scroll-list" style="max-height:18vh;">
        ${dep.length ? dep.map((d) => `<div class="card-item"><b>${d.name}</b> (${d.role}) · Rời ngày: ${d.departedDate} · Lý do: ${d.departureReason}</div>`).join('') : '<div class="card-item muted">Chưa có nhân sự nào rời CLB.</div>'}
      </div>`;
  }

  return `
    <div class="tab-strip">
      <button class="tab-btn ${subTab === 'head_coach' ? 'active' : ''}" data-stftab="head_coach">👔 HLV Trưởng & Ứng viên</button>
      <button class="tab-btn ${subTab === 'directives' ? 'active' : ''}" data-stftab="directives">🎯 Định hướng cầu thủ (${state.relationshipSystem?.directives?.length || 0})</button>
      <button class="tab-btn ${subTab === 'coaching_12' ? 'active' : ''}" data-stftab="coaching_12">🏃 Ban Huấn Luyện (12 vị trí)</button>
      <button class="tab-btn ${subTab === 'executives' ? 'active' : ''}" data-stftab="executives">🏛️ Lãnh Đạo Chuyên Môn</button>
      <button class="tab-btn ${subTab === 'history' ? 'active' : ''}" data-stftab="history">📜 Lịch Sử Nhân Sự</button>
    </div>
    ${body}`;
}

export function renderTrainingTabHTML(state, subTab = 'schedule') {
  const ts = state.trainingSystem;
  const activeSlot = ts.getActiveSlot(state.clockHour);
  const focuses = ['Cân bằng', 'Thể lực', 'Kỹ thuật', 'Chiến thuật', 'Dứt điểm', 'Đấu tập', 'Phục hồi'];
  const intensities = ['Hồi phục', 'Nhẹ', 'Trung bình', 'Cao'];

  let body = '';
  if (subTab === 'schedule') {
    body = `
      <div class="card-item urgent">
        <div class="card-head">
          <strong>🏟️ Tập luyện 3D tại SVĐ Parc des Princes (${state.timeSystem.getTimeString()})</strong>
          <span class="tag ok">${activeSlot ? activeSlot.title : 'Ngoài giờ tập · Phục hồi'}</span>
        </div>
        <div class="muted">Địa điểm: <b>SVĐ Parc des Princes</b> · Phụ trách: <b>${activeSlot ? activeSlot.ownerLabel : 'Ban huấn luyện'}</b> · Sơ đồ đồng bộ: <b>${state.formationSystem.formation}</b> · BHL trên sân: <b>${state.coachingSystem.getActiveCount()}/12</b></div>
        <div class="btn-row" style="margin-top:8px;">
          <button class="btn-primary" id="tr-go-pitch">🏟️ Đến ngay SVĐ Parc des Princes quan sát tập luyện 3D</button>
          <button class="btn-accent" id="tr-run-eval">📊 Tổng kết & Đánh giá buổi tập ngay</button>
        </div>
      </div>
      <div class="card-item">
        <div class="section-label" style="margin-top:0;">⚙️ Tùy chỉnh Giáo án & Cường độ (Chủ tịch / HLV trưởng)</div>
        <div class="filter-bar">
          <select id="tr-focus-sel" class="input-ctrl">
            ${focuses.map((f) => `<option value="${f}" ${ts.focus === f ? 'selected' : ''}>Trọng tâm: ${f}</option>`).join('')}
          </select>
          <select id="tr-int-sel" class="input-ctrl">
            ${intensities.map((i) => `<option value="${i}" ${ts.intensity === i ? 'selected' : ''}>Cường độ: ${i}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="table-wrap" style="max-height:30vh;">
        <table class="data-table">
          <thead><tr><th>Khung giờ</th><th>Bài tập 3D</th><th>Người phụ trách</th><th>Mô tả thực hiện</th></tr></thead>
          <tbody>
            ${ts.schedule.map((s) => `<tr class="${activeSlot?.id === s.id ? 'highlight-row' : ''}"><td><b>${s.timeLabel}</b></td><td><b>${s.title}</b></td><td>${s.ownerLabel}</td><td class="muted" style="white-space:normal;max-width:250px;">${DRILL_CATALOG[s.drill]?.desc || ''}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } else if (subTab === 'interactions') {
    const items = ts.pendingCoachInteractions || [];
    body = `
      <div class="section-label">🗣️ Báo cáo & Đề xuất trực tiếp từ Ban Huấn Luyện gửi Chủ tịch</div>
      <div class="scroll-list" style="max-height:44vh;">
        ${items.length === 0 ? '<div class="card-item muted">Chưa có đề xuất mới từ Ban huấn luyện.</div>' : items.map((it) => `
          <div class="card-item ${it.status === 'pending' ? 'urgent' : ''}">
            <div class="card-head"><strong>${it.staffName} · ${it.role}</strong><span class="tag ${it.status === 'pending' ? '' : 'ok'}">${it.status === 'pending' ? 'Chờ Chủ tịch quyết định' : it.status}</span></div>
            <div class="dialogue-bubble">"${it.message}"</div>
            ${it.explanation ? `<p style="color:#93c5fd;">ℹ️ ${it.explanation}</p>` : ''}
            ${it.status === 'pending' ? `
              <div class="btn-row">
                <button class="btn-xs btn-primary ci-btn" data-ciid="${it.id}" data-act="approve">✅ Đồng ý</button>
                <button class="btn-xs btn-secondary ci-btn" data-ciid="${it.id}" data-act="explain">❓ Yêu cầu giải thích</button>
                ${it.targetPlayerId ? `<button class="btn-xs btn-accent ci-inspect" data-pid="${it.targetPlayerId}">🔍 Kiểm tra cầu thủ</button>` : ''}
                <button class="btn-xs btn-secondary ci-btn" data-ciid="${it.id}" data-act="change_plan">📝 Đổi giáo án</button>
                <button class="btn-xs btn-secondary ci-btn" data-ciid="${it.id}" data-act="ask_head_coach">👔 Chuyển HLV trưởng</button>
                <button class="btn-xs btn-danger ci-btn" data-ciid="${it.id}" data-act="reject">❌ Từ chối</button>
              </div>` : ''}
          </div>`).join('')}
      </div>`;
  } else {
    const reps = ts.trainingReports || [];
    body = `
      <div class="section-label">📄 Báo cáo sau buổi tập (${reps.length})</div>
      <div class="scroll-list" style="max-height:44vh;">
        ${reps.length === 0 ? `<div class="card-item muted">Chưa có báo cáo buổi tập nào. Bấm "Tổng kết & Đánh giá buổi tập ngay" hoặc đợi đến 12:00!</div>` : reps.map((r) => `
          <div class="card-item">
            <div class="card-head"><strong>📅 ${r.date} · Trọng tâm: ${r.focus} (${r.intensity})</strong><span class="tag ok">Tham gia ${r.attendancePct}% · Hoàn thành ${r.completionPct}%</span></div>
            <div class="muted">Nội dung: ${r.drills.join(', ')} · Thời lượng: ${r.duration}</div>
            <p>⭐ <b>Nổi bật:</b> ${r.standouts.map((x) => `<button class="btn-xs open-profile-btn" data-pid="${x.playerId}">${x.name} (${x.rating})</button>`).join(' ')}</p>
            <p>⚠️ <b>Chưa đạt / Cần cải thiện:</b> ${r.underperformers.map((x) => `${x.name} (${x.rating})`).join(', ')}</p>
            <p>🏥 <b>Cần phục hồi (${r.needRecovery.length}):</b> ${r.needRecovery.length ? r.needRecovery.map((x) => `${x.name} (Thể lực ${x.fitness}%)`).join(', ') : 'Không có'}</p>
            <p style="color:#fde68a;">💡 ${r.proposal}</p>
            <details style="margin-top:6px;"><summary style="cursor:pointer;color:#93c5fd;">Xem kết quả & biến động chỉ số từng cầu thủ (${r.playerResults.length})</summary>
              <table class="data-table" style="margin-top:6px;">
                <thead><tr><th>Cầu thủ</th><th>Điểm</th><th>Thể lực</th><th>Tiến bộ chỉ số</th></tr></thead>
                <tbody>${r.playerResults.map((pr) => `<tr><td><button class="btn-xs open-profile-btn" data-pid="${pr.playerId}">${pr.name}</button></td><td>${pr.participated ? pr.rating : 'Nghỉ'}</td><td>${pr.fitness ?? '-'}%</td><td style="color:#4ade80;">${(pr.changes || []).join(', ') || pr.status}</td></tr>`).join('')}</tbody>
              </table>
            </details>
          </div>`).join('')}
      </div>`;
  }

  return `
    <div class="tab-strip">
      <button class="tab-btn ${subTab === 'schedule' ? 'active' : ''}" data-trtab="schedule">📅 Lịch & Điều khiển 3D</button>
      <button class="tab-btn ${subTab === 'interactions' ? 'active' : ''}" data-trtab="interactions">🗣️ Báo cáo từ BHL (${(ts.pendingCoachInteractions || []).filter((x) => x.status === 'pending').length})</button>
      <button class="tab-btn ${subTab === 'reports' ? 'active' : ''}" data-trtab="reports">📊 Báo cáo & Chỉ số (${(ts.trainingReports || []).length})</button>
    </div>
    ${body}`;
}
