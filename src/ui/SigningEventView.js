// src/ui/SigningEventView.js
// Giao diện Lễ Ký Hợp Đồng 3D, Họp Báo Tương Tác, PSG TV LIVE & Kho Sự Kiện (Event Archive)
// Tối ưu chuẩn Portrait Mode trên iPhone (khung trên thấy sân khấu 3D trực tiếp, khung dưới câu hỏi & nút xếp dọc, tôn trọng safe-area!)

import { SIGNING_CEREMONY_STEPS } from '../media/SigningEventSystem.js';
import { MediaReputationSystem } from '../media/MediaNewsGenerator.js';

export function renderSigningEventHubHTML(state, subTab = 'pending') {
  const ses = state.signingEventSystem;
  const bm = MediaReputationSystem.ensureBrandMetrics(state);
  const bc = ses.broadcast;
  const pending = ses.pendingEvents || [];
  const active = ses.activeEvent;
  const archive = ses.eventArchive || [];

  let body = '';
  if (subTab === 'pending') {
    body = `
      <div class="kpi-grid">
        <div class="kpi-card"><span>Danh tiếng Toàn cầu</span><strong>${bm.globalReputation}/100</strong></div>
        <div class="kpi-card"><span>Ảnh hưởng Truyền thông</span><strong>${bm.mediaInfluence}/100</strong></div>
        <div class="kpi-card"><span>Giá trị Thương hiệu</span><strong>€${bm.brandValue}M</strong></div>
        <div class="kpi-card"><span>Fan toàn cầu / Tài trợ</span><strong>${bm.fanbase}M · ${bm.sponsorAppeal}%</strong></div>
      </div>

      ${active ? `
        <div class="card-item urgent">
          <div class="card-head">
            <strong>🎬 ĐANG DIỄN RA: ${active.headline}</strong>
            <span class="tag ok">${active.status}</span>
          </div>
          <p class="muted">Nhân vật chính: <b>${active.subjectName}</b> ${active.shirtNumber ? `(#${active.shirtNumber})` : ''} · Giai đoạn: <b>${active.phase}</b></p>
          <div class="btn-row">
            <button class="btn-primary se-resume-live">🎥 Vào ngay Sân khấu 3D / Tiếp tục buổi lễ</button>
            <button class="btn-accent se-open-tv">📺 Xem PSG TV LIVE</button>
          </div>
        </div>
      ` : ''}

      <div class="section-label">📅 Sự kiện Chờ Tổ Chức — Awaiting Official Signing Event (${pending.length})</div>
      <div class="scroll-list" style="max-height:24vh;">
        ${pending.length === 0
          ? `<div class="card-item muted">Hiện chưa có thương vụ mới nào chờ tổ chức lễ ký kết. Khi PSG hoàn tất mua cầu thủ (đủ 2 giai đoạn), đôn cầu thủ trẻ, bổ nhiệm HLV trưởng/GĐ Thể thao hoặc ký tài trợ lớn, sự kiện sẽ tự động xuất hiện tại đây!</div>`
          : pending.map((e) => `
            <div class="card-item urgent">
              <div class="card-head"><strong>${e.eventTypeLabel}: ${e.subjectName}</strong><span class="tag">${e.status}</span></div>
              <div class="muted">${e.position ? `${e.position} · ` : ''}${e.shirtNumber ? `Áo #${e.shirtNumber} · ` : ''}${e.fee ? `Phí €${e.fee}M · ` : ''}${e.wage ? `Lương €${e.wage}k/tuần · ` : ''}HĐ ${e.contractYears} năm · Ngày tạo: ${e.createdAt}</div>
              <div class="btn-row">
                <button class="btn-primary se-start-evt" data-evtid="${e.eventId}">🎬 Chủ trì Lễ Ký Kết & Họp Báo 3D</button>
              </div>
            </div>`).join('')}
      </div>

      <div class="section-label">🤝 Tổ chức Sự kiện Thương mại & Đối tác PSG</div>
      <div class="btn-row">
        <button class="btn-secondary se-create-sponsor">✈️ Ký Tài Trợ Chiến Lược (+€25M)</button>
        <button class="btn-secondary se-create-partner">💎 Công Bố Đối Tác Thương Mại (+€14M)</button>
        <button class="btn-secondary se-goto-signing">🏢 Đến Phòng Ký Hợp Đồng 3D</button>
        <button class="btn-secondary se-goto-press">🎙️ Đến Phòng Họp Báo PSG</button>
      </div>`;
  } else if (subTab === 'psgtv') {
    const camAngles = [
      ['wide_stage', '🎥 Toàn sân khấu'],
      ['president_closeup', '👔 Chủ tịch'],
      ['player_closeup', '⚽ Tân binh'],
      ['journalist_cam', '📰 Phóng viên'],
      ['signing_desk', '✍️ Phòng Ký']
    ];
    body = `
      <div class="psgtv-frame">
        <div class="psgtv-topbar">
          <span class="psgtv-live-badge ${bc.isLive ? 'on' : ''}">${bc.isLive ? '● LIVE' : '○ STANDBY'}</span>
          <b>${bc.programTitle}</b>
          <span>⏱️ ${bc.getFormattedDuration()} · 👁️ ${bc.viewerCount.toLocaleString('vi-VN')}</span>
        </div>
        <div class="psgtv-screen">
          <div style="font-size:11px;color:#fde68a;font-weight:700;letter-spacing:1px;">PARIS SAINT-GERMAIN · PARC DES PRINCES BROADCAST</div>
          <h3 style="margin:6px 0;font-size:17px;">${bc.isLive ? `CHỦ TỊCH PHẠM MINH CHIÊU RA MẮT ${bc.subjectName.toUpperCase()}` : 'PSG TV ĐANG CHỜ SỰ KIỆN TRỰC TIẾP'}</h3>
          <div class="muted">${bc.isLive ? `Góc máy hiện tại: <b>${camAngles.find((c) => c[0] === bc.activeCameraAngle)?.[1] || 'Toàn sân khấu'}</b> · Người dẫn: Élodie Laurent` : 'Hãy bắt đầu một Lễ Ký Hợp Đồng & Họp Báo để kích hoạt sóng trực tiếp PSG TV!'}</div>
          <div class="btn-row" style="justify-content:center;margin-top:8px;">
            ${camAngles.map(([k, lbl]) => `<button class="btn-xs ${bc.activeCameraAngle === k ? 'btn-primary' : 'btn-secondary'} psgtv-cam" data-camkey="${k}">${lbl}</button>`).join('')}
          </div>
        </div>
        <div class="psgtv-ticker">${bc.tickerText}</div>
      </div>
      <div class="section-label">💬 Bình luận khán giả trực tiếp (${bc.liveComments.length})</div>
      <div class="scroll-list" style="max-height:22vh;">
        ${bc.liveComments.length
          ? bc.liveComments.map((c) => `<div class="card-item" style="padding:6px 9px;"><b>${c.user}</b>: ${c.text}</div>`).join('')
          : '<div class="card-item muted">Chưa có bình luận trực tiếp.</div>'}
      </div>`;
  } else {
    body = `
      <div class="section-label">🗄️ Kho Lưu Trữ Sự Kiện PSG — Event Archive (${archive.length})</div>
      <div class="scroll-list" style="max-height:44vh;">
        ${archive.length === 0
          ? '<div class="card-item muted">Chưa có sự kiện nào được lưu trữ. Hoàn tất lễ ký kết & họp báo đầu tiên để lưu vào hồ sơ lịch sử PSG!</div>'
          : archive.map((e) => `
            <div class="card-item">
              <div class="card-head">
                <strong>${e.eventTypeLabel} · ${e.subjectName} ${e.shirtNumber ? `(#${e.shirtNumber})` : ''}</strong>
                <span class="tag ok">${e.completedAt || e.createdAt}</span>
              </div>
              <div class="muted">Mã SK: <code>${e.eventId}</code>${e.playerId ? ` · PlayerID: <code>${e.playerId}</code>` : ''} · ${e.broadcastStatus}</div>
              <p class="muted">Phí: €${e.fee}M · Lương: €${e.wage}k/tuần · HĐ: ${e.contractYears} năm · Bài báo đã đăng: <b>${(e.generatedArticles || []).length}</b></p>
              ${e.reputationDelta ? `<div class="btn-row" style="margin:4px 0;">
                <span class="tag ok">Danh tiếng ${e.reputationDelta.globalReputation >= 0 ? '+' : ''}${e.reputationDelta.globalReputation}</span>
                <span class="tag ok">Thương hiệu ${e.reputationDelta.brandValueM >= 0 ? '+' : ''}€${e.reputationDelta.brandValueM}M</span>
                <span class="tag">Fan ${e.reputationDelta.fanbaseM >= 0 ? '+' : ''}${e.reputationDelta.fanbaseM}M</span>
              </div>` : ''}
              <details style="margin-top:5px;">
                <summary style="cursor:pointer;color:#93c5fd;font-weight:600;">Xem biên bản hỏi đáp, bài báo & phản ứng CĐV</summary>
                <div style="margin-top:6px;">
                  ${(e.presidentAnswers || []).map((a) => `<p><b>🎤 ${a.reporter} (${a.outlet}):</b> ${a.question}<br/><span style="color:#fde68a;">👔 Chủ tịch: "${a.text}"</span></p>`).join('')}
                  ${(e.playerAnswers || []).map((a) => `<p><b>🎤 ${a.reporter} (${a.outlet}):</b> ${a.question}<br/><span style="color:#86efac;">⚽ ${e.subjectName}: ${a.text}</span></p>`).join('')}
                  <div class="section-label">💬 Phản ứng người hâm mộ (${(e.fanReactions || []).length} nhóm)</div>
                  ${(e.fanReactions || []).map((fr) => `<p class="muted">• <b>[${fr.group}] ${fr.author}:</b> "${fr.text}"</p>`).join('')}
                </div>
              </details>
            </div>`).join('')}
      </div>`;
  }

  return `
    <div class="tab-strip">
      <button class="tab-btn ${subTab === 'pending' ? 'active' : ''}" data-setab="pending">🎬 Sự kiện & Thương hiệu (${pending.length + (active ? 1 : 0)})</button>
      <button class="tab-btn ${subTab === 'psgtv' ? 'active' : ''}" data-setab="psgtv">📺 PSG TV ${bc.isLive ? '🔴 LIVE' : ''}</button>
      <button class="tab-btn ${subTab === 'archive' ? 'active' : ''}" data-setab="archive">🗄️ Event Archive (${archive.length})</button>
    </div>
    ${body}`;
}

// Giao diện trực tiếp Lễ Ký Hợp Đồng 3D & Họp Báo Tương Tác (Bottom-sheet Portrait-optimized để nửa trên hiển thị trực tiếp Sân khấu 3D!)
export function renderLiveCeremonySheetHTML(state) {
  const ses = state.signingEventSystem;
  const evt = ses.activeEvent;
  if (!evt) return '';
  const bc = ses.broadcast;

  if (evt.phase === 'arrival') {
    return `
      <div class="ceremony-header">
        <span class="tag ok">BƯỚC 2 & 3 · ĐÓN TIẾP TẠI TRỤ SỞ PSG</span>
        <b>${evt.headline}</b>
      </div>
      <div class="ceremony-body">
        <p style="margin:4px 0;">Giám đốc Truyền thông đã hoàn tất chuẩn bị phòng ký kết, phòng họp báo, backdrop, áo đấu và mời phóng viên. Các NPC đang di chuyển bằng <b>AI Pathfinding</b> tới Phòng Ký Hợp Đồng!</p>
        <div class="grid-2" style="margin:6px 0;">
          ${evt.prepChecklist.map((c) => `<div style="font-size:11.5px;color:#86efac;">✅ ${c.label}</div>`).join('')}
        </div>
        <div class="btn-row">
          <button class="btn-primary" id="cer-begin-signing" style="flex:1;">✍️ Bước vào Lễ Ký Hợp Đồng 3D</button>
          <button class="btn-secondary" id="cer-minimize">👁️ Quan sát tự do</button>
        </div>
      </div>`;
  }

  if (evt.phase === 'signing') {
    const step = SIGNING_CEREMONY_STEPS[evt.signingStepIdx] || SIGNING_CEREMONY_STEPS[0];
    const isLast = evt.signingStepIdx >= SIGNING_CEREMONY_STEPS.length - 1;
    return `
      <div class="ceremony-header">
        <span class="tag ok">BƯỚC 4 · LỄ KÝ HỢP ĐỒNG 3D (${evt.signingStepIdx + 1}/${SIGNING_CEREMONY_STEPS.length})</span>
        <b>${evt.subjectName} ${evt.shirtNumber ? `#${evt.shirtNumber}` : ''}</b>
      </div>
      <div class="ceremony-body">
        <div class="dialogue-bubble" style="margin:4px 0;"><b>${step.label}</b><br/>
          <span class="muted">Hợp đồng ContractSystem: ${evt.contractYears} năm · Lương €${evt.wage}k/tuần${evt.fee ? ` · Phí €${evt.fee}M` : ''} · Chủ tịch Phạm Minh Chiêu & ${evt.subjectName}</span>
        </div>
        <div class="btn-row">
          <button class="btn-primary" id="cer-next-sign-step" style="flex:1;">${isLast ? (evt.hasFullPressConference ? '🎙️ Chuyển sang Phòng Họp Báo & Bật PSG TV LIVE →' : '✅ Hoàn tất Lễ Ký Kết & Đăng Báo') : '▶️ Thực hiện bước ký kết tiếp theo →'}</button>
          <button class="btn-secondary" id="cer-flash-photo">📸 Chụp ảnh</button>
        </div>
      </div>`;
  }

  // phase === 'press_conference' -> HỌP BÁO TƯƠNG TÁC + PSG TV LIVE (TỐI ƯU PORTRAIT IPHONE!)
  const q = ses.getCurrentQuestion();
  const totalQ = (evt.questions || []).length;
  const qNum = Math.min(totalQ, evt.currentQuestionIdx + 1);
  const cams = [
    ['wide_stage', '🎥 Sân khấu'],
    ['president_closeup', '👔 Chủ tịch'],
    ['player_closeup', '⚽ Tân binh'],
    ['journalist_cam', '📰 Phóng viên']
  ];

  return `
    <div class="ceremony-header">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span class="psgtv-live-badge on">● LIVE · PSG TV</span>
        <b style="font-size:12px;">${bc.programTitle}</b>
      </div>
      <span style="font-size:11px;color:#93c5fd;">⏱️ ${bc.getFormattedDuration()} · 👁️ ${bc.viewerCount.toLocaleString('vi-VN')}</span>
    </div>
    <div class="ceremony-cam-strip">
      ${cams.map(([k, lbl]) => `<button class="btn-xs ${bc.activeCameraAngle === k ? 'btn-primary' : 'btn-secondary'} cer-cam-btn" data-camkey="${k}">${lbl}</button>`).join('')}
      <button class="btn-xs btn-danger" id="cer-end-press" style="margin-left:auto;">🏁 Kết thúc họp báo</button>
    </div>
    <div class="ceremony-body">
      ${evt.currentQuestionIdx === 0 && evt.presidentAnswers.length === 0 ? `<div class="muted" style="margin-bottom:5px;">🎙️ <b>MC Élodie Laurent:</b> "Chào mừng quý vị đến với PSG TV LIVE! Hôm nay Chủ tịch Phạm Minh Chiêu, Giám đốc Thể thao và <b>${evt.subjectName}</b> sẽ trực tiếp trả lời các phóng viên."</div>` : ''}
      ${q ? `
        <div class="card-item urgent" style="padding:8px 10px;margin-bottom:6px;">
          <div class="card-head">
            <strong>🎤 ${q.reporter} (${q.outlet})</strong>
            <span class="tag">Câu ${qNum}/${totalQ} · ${q.category}</span>
          </div>
          <p style="font-weight:600;color:#fff;margin:3px 0;">"${q.question}"</p>
        </div>
        ${q.target === 'president' ? `
          <div class="portrait-options-stack">
            ${(q.options || []).map((o) => `
              <button class="btn-secondary cer-ans-opt" data-opt="${o.key}" style="width:100%;text-align:left;padding:8px 10px;line-height:1.4;">
                <b style="color:#fde68a;">${o.key}.</b> ${o.text}
              </button>`).join('')}
          </div>
        ` : `
          <div class="dialogue-bubble" style="margin:6px 0;">
            <b>⚽ ${evt.subjectName} trả lời:</b><br/>${q.playerReply}
          </div>
          <button class="btn-primary" id="cer-player-next" style="width:100%;">➡️ Chuyển câu hỏi tiếp theo</button>
        `}
      ` : `
        <div class="card-item" style="text-align:center;">
          <b>✅ Đã hoàn tất toàn bộ câu hỏi họp báo!</b>
          <p class="muted">Kết thúc họp báo để xuất bản 8 bài báo độc lập, tổng hợp phản ứng người hâm mộ, cập nhật thương hiệu PSG & lưu vào Event Archive.</p>
          <button class="btn-primary" id="cer-finish-all" style="width:100%;margin-top:6px;">🏁 Kết thúc họp báo & Công bố Truyền thông</button>
        </div>
      `}
    </div>`;
}
