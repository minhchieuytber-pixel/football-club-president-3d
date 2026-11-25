// src/ui/RelationshipViews.js
// Giao diện Hệ thống Quản lý Quan hệ Nội bộ CLB:
// 1. Làm việc với HLV trưởng -> Định hướng sử dụng cầu thủ
// 2. Báo cáo Tình hình Phòng thay đồ (KPIs, 7 bộ lọc, Mâu thuẫn, Cam kết, Nguy cơ ra đi, Rò rỉ báo chí)
// 3. Phòng Họp riêng đa lượt giữa Chủ tịch Phạm Minh Chiêu & Cầu thủ (Task Window)

import { getPlayerPortraitDataUrl } from '../players/PlayerDatabase.js';
import {
  RELATIONSHIP_METRIC_DEFS,
  PLAYER_TRAITS,
  DIRECTIVE_CATEGORIES,
  DIRECTIVE_STATUS,
  COMMITMENT_STATUS,
  CONFLICT_LEVELS,
  PRESS_LEAK_RESPONSES,
  PRIVATE_MEETING_TACTICS
} from '../relations/ClubRelationshipSystem.js';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function moodTagClass(mood) {
  if (mood === 'Rất hài lòng' || mood === 'Hài lòng') return 'ok';
  if (mood === 'Bình thường') return '';
  if (mood === 'Thất vọng') return 'warn';
  return 'bad';
}

function directiveStatusClass(status) {
  if (status === DIRECTIVE_STATUS.AGREED || status === DIRECTIVE_STATUS.COMPLETED) return 'ok';
  if (status === DIRECTIVE_STATUS.PARTIAL || status === DIRECTIVE_STATUS.ALTERNATIVE || status === DIRECTIVE_STATUS.CONSIDERING) return 'warn';
  if (status === DIRECTIVE_STATUS.REJECTED) return 'bad';
  return '';
}

export function renderCoachDirectivesHTML(state, draft = {}) {
  const rel = state.relationshipSystem;
  const hc = state.managerSystem?.getActiveByRole?.('head_coach') || state.coach;
  const style = rel.getCoachStyleProfile();
  const squad = state.getPsgSquad();
  const selPlayerId = draft.playerId && squad.some((p) => p.id === draft.playerId) ? draft.playerId : (squad[0]?.id || '');
  const selCatKey = draft.categoryKey || DIRECTIVE_CATEGORIES[0].key;
  const selCat = DIRECTIVE_CATEGORIES.find((c) => c.key === selCatKey) || DIRECTIVE_CATEGORIES[0];
  const selOptKey = draft.optionKey && selCat.options.some((o) => o.key === draft.optionKey)
    ? draft.optionKey
    : selCat.options[0].key;
  const selPriority = draft.priority || 'normal';
  const activeDirectives = rel.directives || [];
  const historyDirectives = (rel.directiveHistory || []).slice(0, 12);

  return `
    <div class="card-item">
      <div class="card-head">
        <strong>👔 Phong cách & Quyền tự chủ HLV: ${esc(hc?.name || 'HLV Tạm quyền')}</strong>
        <div class="btn-row" style="gap:6px;">
          <span class="tag ${style.chairmanRelation >= 72 ? 'ok' : style.chairmanRelation >= 52 ? 'warn' : 'bad'} tabular-nums">Tin cậy Chủ tịch–HLV: ${style.chairmanRelation}/100</span>
          <button type="button" class="btn-xs btn-secondary" id="dir-open-locker">🏥 Báo cáo Phòng thay đồ</button>
        </div>
      </div>
      <div class="kpi-mini" style="margin-top:6px;">
        <span>Tin dùng trẻ: <b class="tabular-nums">${style.youthTrust}</b></span>
        <span>Ưu tiên kinh nghiệm: <b class="tabular-nums">${style.experiencePriority}</b></span>
        <span>Ưu tiên phong độ: <b class="tabular-nums">${style.formPriority}</b></span>
        <span>Cứng rắn chiến thuật: <b class="tabular-nums">${style.tacticsStrictness}</b></span>
        <span>Xoay tua: <b class="tabular-nums">${style.rotationTendency}</b></span>
        <span>Kiểm soát PTĐ: <b class="tabular-nums">${style.dressingRoomControl}</b></span>
        <span>Bảo thủ: <b class="tabular-nums">${style.stubbornness}</b></span>
      </div>
      <p class="muted" style="margin-top:6px;">HLV trưởng sẽ tự chủ phản biện dựa trên phong độ, thể lực, tầm quan trọng trận đấu và tính cách huấn luyện. Can thiệp quá dày sẽ làm giảm niềm tin giữa Chủ tịch và HLV.</p>
    </div>

    <div class="card-item">
      <div class="section-label" style="margin-top:0;">🎯 Gửi định hướng sử dụng cầu thủ cho HLV trưởng</div>
      <div class="grid-2" style="gap:8px;margin-top:6px;">
        <div>
          <label class="muted" for="dir-player-sel">Chọn cầu thủ đội một PSG:</label>
          <select id="dir-player-sel" class="input-ctrl" style="min-height:44px;margin-top:4px;">
            ${squad.map((p) => {
              const prof = rel.ensurePlayerProfile(p.id);
              return `<option value="${esc(p.id)}" ${p.id === selPlayerId ? 'selected' : ''}>${esc(p.name)} (${p.position} · OVR ${p.ovr} · ${p.age}t · ${esc(prof?.mood || 'Ổn định')})</option>`;
            }).join('')}
          </select>
        </div>
        <div>
          <label class="muted" for="dir-cat-sel">Nhóm định hướng:</label>
          <select id="dir-cat-sel" class="input-ctrl" style="min-height:44px;margin-top:4px;">
            ${DIRECTIVE_CATEGORIES.map((c) => `<option value="${esc(c.key)}" ${c.key === selCat.key ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="muted" for="dir-opt-sel">Nội dung đề nghị cụ thể:</label>
          <select id="dir-opt-sel" class="input-ctrl" style="min-height:44px;margin-top:4px;">
            ${selCat.options.map((o) => `<option value="${esc(o.key)}" ${o.key === selOptKey ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="muted" for="dir-prio-sel">Mức độ ưu tiên:</label>
          <select id="dir-prio-sel" class="input-ctrl" style="min-height:44px;margin-top:4px;">
            <option value="normal" ${selPriority === 'normal' ? 'selected' : ''}>Bình thường (Tham khảo chuyên môn)</option>
            <option value="high" ${selPriority === 'high' ? 'selected' : ''}>Cao (Ưu tiên cân nhắc)</option>
            <option value="urgent" ${selPriority === 'urgent' ? 'selected' : ''}>Khẩn cấp (Xử lý khủng hoảng / thể lực)</option>
          </select>
        </div>
      </div>
      <div style="margin-top:8px;">
        <label class="muted" for="dir-note-inp">Ghi chú / Lý do của Chủ tịch:</label>
        <input type="text" id="dir-note-inp" class="input-ctrl" style="min-height:44px;margin-top:4px;" value="${esc(draft.note || '')}" placeholder="Ví dụ: Cần xoay tua giữ chân cho Champions League hoặc tạo cơ hội cho cầu thủ trẻ..." />
      </div>
      <div class="btn-row" style="margin-top:10px;">
        <button type="button" class="btn-primary" id="dir-submit-btn" style="min-height:44px;">📨 Gửi định hướng tới HLV ${esc(hc?.name || '')}</button>
      </div>
    </div>

    <div class="section-label">📋 Định hướng đang theo dõi (${activeDirectives.length})</div>
    <div class="scroll-list" style="max-height:24vh;">
      ${activeDirectives.length === 0 ? '<div class="card-item muted">Hiện không có định hướng nào đang chờ hoặc đang thực thi.</div>' : activeDirectives.map((d) => `
        <div class="card-item">
          <div class="card-head">
            <strong>${esc(d.playerName)} (${d.playerPosition} · OVR ${d.playerOvr})</strong>
            <span class="tag ${directiveStatusClass(d.status)}">${esc(d.status)}</span>
          </div>
          <div class="muted">${esc(d.optionLabel)} · Gửi Tuần ${d.createdWeek} (Hạn T${d.expiresWeek}) · Tiến độ: <b class="tabular-nums">${d.executedMatches}/${d.targetMatches} trận</b></div>
          <p style="margin-top:4px;"><b>Phản hồi HLV ${esc(d.coachName)}:</b> "${esc(d.coachReply)}"</p>
          <div class="muted">Căn cứ chuyên môn: ${esc(d.coachReason)}</div>
        </div>
      `).join('')}
    </div>

    <div class="section-label">🗂️ Lịch sử đã thực hiện / Lưu trữ (${historyDirectives.length})</div>
    <div class="scroll-list" style="max-height:18vh;">
      ${historyDirectives.length === 0 ? '<div class="card-item muted">Chưa có chỉ đạo nào hoàn tất hoặc lưu trữ.</div>' : historyDirectives.map((d) => `
        <div class="card-item">
          <div class="card-head">
            <span><b>${esc(d.playerName)}</b> — ${esc(d.optionLabel)}</span>
            <span class="tag ${directiveStatusClass(d.status)}">${esc(d.status)}</span>
          </div>
          <div class="muted">${esc(d.coachReason)} (${esc(d.closedDate || d.createdDate)})</div>
        </div>
      `).join('')}
    </div>
  `;
}

export function renderLockerRoomReportHTML(state, filters = {}) {
  const rel = state.relationshipSystem;
  const rep = rel.getLockerRoomReport(filters);
  const k = rep.kpis;
  const positions = ['ALL', 'GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'];

  return `
    <div class="kpi-grid">
      <div class="kpi-card"><span>Cầu thủ hài lòng</span><strong class="tabular-nums" style="color:#4ade80;">${k.satisfiedCount}/${k.totalPlayers}</strong></div>
      <div class="kpi-card"><span>Cầu thủ bất mãn</span><strong class="tabular-nums" style="color:${k.dissatisfiedCount > 0 ? '#fbbf24' : '#94a3b8'};">${k.dissatisfiedCount}</strong></div>
      <div class="kpi-card"><span>Nguy cơ đòi ra đi</span><strong class="tabular-nums" style="color:${k.transferRiskCount > 0 ? '#f87171' : '#94a3b8'};">${k.transferRiskCount}</strong></div>
      <div class="kpi-card"><span>Đoàn kết toàn đội</span><strong class="tabular-nums">${k.teamUnity}/100</strong></div>
      <div class="kpi-card"><span>TB Quan hệ HLV–Cầu thủ</span><strong class="tabular-nums">${k.avgCoachRelation}/100</strong></div>
    </div>

    <div class="btn-row" style="margin-bottom:8px;">
      <button type="button" class="btn-primary" id="lr-jump-directives" style="min-height:44px;">🎯 Định hướng sử dụng cầu thủ (HLV trưởng)</button>
      <button type="button" class="btn-secondary" id="lr-jump-media" style="min-height:44px;">📰 Xem tin tức & khủng hoảng truyền thông</button>
    </div>

    ${rep.activeConflicts.length > 0 ? `
      <div class="section-label">🔥 Mâu thuẫn đang diễn ra (${rep.activeConflicts.length})</div>
      <div class="scroll-list" style="max-height:20vh;">
        ${rep.activeConflicts.map((c) => {
          const meta = CONFLICT_LEVELS[c.level] || CONFLICT_LEVELS[1];
          return `
            <div class="card-item urgent">
              <div class="card-head">
                <strong>${esc(c.playerName)} · Cấp ${c.level}/5 (${esc(meta.label)})</strong>
                <span class="tag bad">${esc(c.startedDate)}</span>
              </div>
              <p>${esc(c.cause)}</p>
              <div class="btn-row" style="margin-top:6px;">
                <button type="button" class="btn-xs btn-primary lr-open-meet" data-pid="${esc(c.playerId)}" style="min-height:36px;">🗣️ Họp riêng</button>
                <button type="button" class="btn-xs btn-secondary lr-ask-coach" data-pid="${esc(c.playerId)}" style="min-height:36px;">👔 Yêu cầu HLV giải trình</button>
                <button type="button" class="btn-xs btn-accent lr-open-prof" data-pid="${esc(c.playerId)}" style="min-height:36px;">👤 Hồ sơ tâm lý</button>
              </div>
            </div>`;
        }).join('')}
      </div>` : ''}

    ${rep.pressLeaks.length > 0 ? `
      <div class="section-label">📡 Rò rỉ báo chí nội bộ chưa đóng (${rep.pressLeaks.length})</div>
      <div class="scroll-list" style="max-height:22vh;">
        ${rep.pressLeaks.map((l) => `
          <div class="card-item urgent">
            <div class="card-head">
              <strong>${esc(l.headline)}</strong>
              <span class="tag ${l.stage >= 4 ? 'bad' : 'warn'}">${esc(l.stageLabel)}</span>
            </div>
            <p class="muted">${esc(l.detail)}</p>
            <div class="btn-row" style="margin-top:6px;">
              ${PRESS_LEAK_RESPONSES.map((r) => `
                <button type="button" class="btn-xs ${l.chairmanResponse === r.key ? 'btn-primary' : 'btn-secondary'} lr-leak-resp" data-lid="${esc(l.id)}" data-resp="${esc(r.key)}" title="${esc(r.desc)}">${esc(r.label)}</button>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>` : ''}

    ${rep.allCommitments.length > 0 ? `
      <div class="section-label">🤝 Theo dõi Cam kết của Chủ tịch (${rep.openCommitments.length} đang mở / ${rep.allCommitments.length} tổng)</div>
      <div class="scroll-list" style="max-height:18vh;">
        ${rep.allCommitments.slice(0, 8).map((cm) => `
          <div class="card-item">
            <div class="card-head">
              <strong>${esc(cm.playerName)} — ${esc(cm.content)}</strong>
              <span class="tag ${cm.status === COMMITMENT_STATUS.COMPLETED ? 'ok' : cm.status === COMMITMENT_STATUS.BROKEN ? 'bad' : 'warn'}">${esc(cm.status)}</span>
            </div>
            <div class="muted">Phụ trách: ${esc(cm.responsibleParty)} · Hạn: Tuần ${cm.deadlineWeek} · HLV đồng thuận: <b>${cm.coachAgreed ? 'Có' : 'Chưa'}</b> · Tiến độ: <b class="tabular-nums">${cm.progressCount}/${cm.targetCount}</b></div>
            ${cm.outcomeNote ? `<div class="muted">${esc(cm.outcomeNote)}</div>` : ''}
          </div>
        `).join('')}
      </div>` : ''}

    <div class="section-label">🔍 Bộ lọc cầu thủ & Tình trạng phòng thay đồ (${rep.rows.length})</div>
    <div class="filter-bar" style="margin-bottom:8px;">
      <input type="text" id="lr-f-search" class="input-ctrl" value="${esc(filters.search || '')}" placeholder="Tìm tên cầu thủ..." />
      <select id="lr-f-squad" class="input-ctrl">
        <option value="first_team" ${filters.squad === 'first_team' ? 'selected' : ''}>Đội một PSG</option>
        <option value="academy" ${filters.squad === 'academy' ? 'selected' : ''}>Đội trẻ / Học viện</option>
        <option value="all" ${filters.squad === 'all' ? 'selected' : ''}>Toàn CLB (Đội một + Trẻ)</option>
      </select>
      <select id="lr-f-pos" class="input-ctrl">
        ${positions.map((pos) => `<option value="${pos}" ${filters.pos === pos ? 'selected' : ''}>${pos === 'ALL' ? 'Mọi vị trí' : pos}</option>`).join('')}
      </select>
      <select id="lr-f-mood" class="input-ctrl">
        <option value="ALL" ${filters.moodLevel === 'ALL' ? 'selected' : ''}>Mọi tâm lý</option>
        <option value="happy" ${filters.moodLevel === 'happy' ? 'selected' : ''}>Hài lòng / Tích cực</option>
        <option value="unhappy" ${filters.moodLevel === 'unhappy' ? 'selected' : ''}>Thất vọng / Bất mãn</option>
        <option value="critical" ${filters.moodLevel === 'critical' ? 'selected' : ''}>Nghiêm trọng / Muốn đi</option>
      </select>
      <select id="lr-f-coach" class="input-ctrl">
        <option value="ALL" ${filters.coachRel === 'ALL' ? 'selected' : ''}>Mọi quan hệ HLV</option>
        <option value="good" ${filters.coachRel === 'good' ? 'selected' : ''}>Tin tưởng HLV (>=70)</option>
        <option value="tense" ${filters.coachRel === 'tense' ? 'selected' : ''}>Căng thẳng HLV (<65)</option>
      </select>
      <select id="lr-f-contract" class="input-ctrl">
        <option value="ALL" ${filters.contract === 'ALL' ? 'selected' : ''}>Mọi hợp đồng</option>
        <option value="expiring" ${filters.contract === 'expiring' ? 'selected' : ''}>Sắp hết hạn (<=1 năm)</option>
      </select>
      <select id="lr-f-cmt" class="input-ctrl">
        <option value="ALL" ${filters.hasCommitment === 'ALL' ? 'selected' : ''}>Mọi cam kết</option>
        <option value="open" ${filters.hasCommitment === 'open' ? 'selected' : ''}>Có cam kết chưa xong</option>
        <option value="broken" ${filters.hasCommitment === 'broken' ? 'selected' : ''}>Từng bị thất hứa</option>
      </select>
    </div>

    <div class="table-wrap" style="max-height:36vh;">
      <table class="data-table">
        <thead>
          <tr>
            <th>Cầu thủ</th>
            <th>VT</th>
            <th>Tâm lý</th>
            <th>HLV</th>
            <th>Thời lượng</th>
            <th>Chủ tịch</th>
            <th>Mâu thuẫn / Rủi ro</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          ${rep.rows.length === 0 ? `<tr><td colspan="8" class="muted" style="text-align:center;">Không có cầu thủ phù hợp bộ lọc hiện tại.</td></tr>` : rep.rows.map((r) => {
            const p = r.player;
            const prof = r.profile;
            const m = prof.metrics;
            return `
              <tr>
                <td>
                  <button type="button" class="btn-xs open-profile-btn" data-pid="${esc(p.id)}" data-pptab="psychology">${esc(p.name)}</button>
                  <div class="muted">${p.age}t · OVR ${p.ovr} · HĐ ${p.contractYears || 1}n</div>
                </td>
                <td><b>${esc(p.position)}</b></td>
                <td><span class="tag ${moodTagClass(prof.mood)}">${esc(prof.mood)}</span></td>
                <td class="tabular-nums">${r.coachAvg}</td>
                <td class="tabular-nums">${m.satisfactionPlaytime}</td>
                <td class="tabular-nums">${m.trustChairman}</td>
                <td>
                  ${r.conflict ? `<span class="tag bad">Cấp ${r.conflict.level}/5</span>` : '<span class="muted">Ổn định</span>'}
                  ${r.openCommitments.length > 0 ? `<span class="tag warn">${r.openCommitments.length} cam kết</span>` : ''}
                  ${r.hasBid ? `<span class="tag bad">Đang bị hỏi mua</span>` : ''}
                </td>
                <td>
                  <button type="button" class="btn-xs btn-primary lr-open-meet" data-pid="${esc(p.id)}">🗣️ Họp</button>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export function renderPrivateMeetingHTML(state, session, squad = []) {
  const p = state.getPlayerById(session.playerId);
  if (!p) return '<div class="card-item muted">Không tìm thấy cầu thủ.</div>';
  const portrait = getPlayerPortraitDataUrl(p);
  const snap = session.snapshot || {};
  const traitsStr = (snap.traits || []).join(' · ') || 'Chuyên nghiệp';
  const cmList = snap.activeCommitments || [];

  return `
    <div class="card-item">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <img src="${portrait}" alt="${esc(p.name)}" style="width:52px;height:52px;border-radius:12px;object-fit:cover;flex-shrink:0;" />
        <div style="flex:1;min-width:180px;">
          <div class="card-head">
            <strong>${p.shirtNumber ? `#${p.shirtNumber} ` : ''}${esc(p.name)} (${p.position} · ${p.age}t)</strong>
            <span class="tag ${moodTagClass(snap.mood)}">${esc(snap.mood)}</span>
          </div>
          <div class="muted">Vai trò: <b>${esc(p.psychology?.squadRole || 'Đội một')}</b> · Tính cách: <b>${esc(traitsStr)}</b></div>
          <div class="kpi-mini" style="margin-top:4px;">
            <span>Tin HLV: <b class="tabular-nums">${snap.coachRelation}/100</b></span>
            <span>Tin Chủ tịch: <b class="tabular-nums">${snap.chairmanTrust}/100</b></span>
            <span>HĐ: <b class="tabular-nums">${p.contractYears || 1} năm</b></span>
            <span>Lương: <b class="tabular-nums">€${p.wage}k</b></span>
          </div>
        </div>
      </div>
      <div style="margin-top:8px;">
        <label class="muted" for="pm-select">Đổi cầu thủ triệu tập lên Văn phòng Chủ tịch:</label>
        <select id="pm-select" class="input-ctrl" style="min-height:42px;margin-top:4px;">
          ${squad.map((sp) => `<option value="${esc(sp.id)}" ${sp.id === p.id ? 'selected' : ''}>${esc(sp.name)} (${sp.position} · OVR ${sp.ovr})</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="card-item">
      <div class="section-label" style="margin-top:0;">📌 Bối cảnh & Vấn đề cần tháo gỡ</div>
      <p>${esc(snap.conflictCause)}</p>
      ${cmList.length > 0 ? `<div class="muted" style="margin-top:4px;">Cam kết liên quan: ${cmList.map((c) => `<b>${esc(c.content)}</b> [${esc(c.status)}]`).join('; ')}</div>` : ''}
      <div class="btn-row" style="margin-top:6px;">
        <button type="button" class="btn-xs btn-secondary" id="pm-ask-coach">👔 Yêu cầu HLV giải trình</button>
        <button type="button" class="btn-xs btn-accent" id="pm-send-directive">🎯 Gửi định hướng cho HLV</button>
      </div>
    </div>

    <div class="section-label">💬 Diễn biến cuộc họp riêng (Lượt ${session.turn}/${session.maxTurns})</div>
    <div class="scroll-list" style="max-height:22vh;">
      ${session.transcript.map((msg) => `
        <div class="card-item ${msg.role === 'outcome' ? 'urgent' : ''}">
          <div class="card-head"><strong>${esc(msg.speaker)}</strong><span class="muted">Lượt ${msg.turn}</span></div>
          <p style="margin-top:3px;">${esc(msg.text)}</p>
        </div>
      `).join('')}
    </div>

    ${!session.finished ? `
      <div class="section-label">🎙️ Chọn hướng xử lý của Chủ tịch Phạm Minh Chiêu</div>
      <div class="scroll-list" style="max-height:24vh;">
        ${PRIVATE_MEETING_TACTICS.map((t) => `
          <button type="button" class="btn-secondary pm-tactic-btn" data-tactic="${esc(t.key)}" style="width:100%;text-align:left;min-height:46px;margin-bottom:6px;white-space:normal;">
            <b>${esc(t.label)}</b><br/><span class="muted">${esc(t.desc)}</span>
          </button>
        `).join('')}
      </div>
    ` : `
      <div class="card-item urgent">
        <div class="card-head">
          <strong>✅ Kết quả tự quyết của ${esc(p.name)}</strong>
          <span class="tag ${session.finalOutcome === 'insist_leaving' ? 'bad' : 'ok'}">${esc(session.finalLabel)}</span>
        </div>
        <div class="btn-row" style="margin-top:8px;">
          <button type="button" class="btn-primary" id="pm-finish-close" style="min-height:44px;">Hoàn tất & Lưu kết quả</button>
        </div>
      </div>
    `}
  `;
}
