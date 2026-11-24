// src/ui/TelevisionView.js
// Giao diện TV Truyền Thông Phòng Chủ Tịch (Bật/Tắt, 9 Kênh Dữ Liệu Thực & Bản Tin Sáng PSG 10 Mục)
import { TV_CHANNELS } from '../media/TelevisionSystem.js';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderTelevisionModalHTML(state, switchingChannel = false) {
  const tv = state.televisionSystem;
  const isOn = !!tv?.isOn;
  const muted = !!tv?.muted;
  const activeId = tv?.activeChannelId || 'psg_tv';
  const chMeta = tv?.getChannelMeta(activeId) || TV_CHANNELS[0];
  const mode = tv?.programMode || 'channel';
  const morning = state.morningNewsSystem?.currentProgram || state.morningNewsSystem?.generateDigest?.(false)?.program;

  let screenBodyHtml = '';
  if (!isOn) {
    screenBodyHtml = `
      <div class="tv-off-screen">
        <div class="tv-off-led">NGUỒN TẮT · STANDBY</div>
        <div class="tv-off-title">MÀN HÌNH TV ĐANG TẮT</div>
        <p class="muted" style="margin:6px 0 12px;">Bấm nút Nguồn để bật TV theo dõi 9 kênh truyền thông bóng đá & Bản Tin Sáng PSG.</p>
        <button class="btn-primary tv-power-btn">⏻ Bật TV Truyền Thông</button>
      </div>`;
  } else if (mode === 'morning_news' && morning) {
    screenBodyHtml = `
      <div class="tv-screen-live" style="background:linear-gradient(155deg,#001742 0%,#091326 60%,#1c0d19 100%);border-color:#d4af37;">
        <div class="tv-broadcast-head">
          <div>
            <span class="tv-ch-badge" style="background:#da291c;">PSG TV · SPECIAL</span>
            <span class="muted" style="margin-left:8px;">${esc(morning.dateLabel)} · ${esc(morning.generatedAt)}</span>
          </div>
          <span class="muted">Dẫn chương trình: <b>${esc(morning.presenter)}</b></span>
        </div>
        <h3 class="tv-headline" style="color:#fde68a;">☀️ ${esc(morning.programTitle)}</h3>
        <div class="tv-morning-grid">
          ${(morning.sections || []).map((sec) => `
            <div class="tv-morning-card">
              <div class="tv-morning-head">
                <strong>${esc(sec.title)}</strong>
                <span class="tv-sec-meta">${esc(sec.badge)}</span>
              </div>
              <p>${esc(sec.content)}</p>
            </div>`).join('')}
        </div>
        <div class="tv-ticker-bar" style="background:#da291c;">
          ☀️ PSG MORNING NEWS · Tổng hợp 10 chuyên mục thực tế dành riêng cho Chủ tịch Phạm Minh Chiêu · Cập nhật tự động khi sang ngày hoặc có sự kiện mới
        </div>
      </div>`;
  } else {
    const data = tv.getChannelBroadcastData(activeId);
    screenBodyHtml = `
      <div class="tv-screen-live ${switchingChannel ? 'tv-channel-flash' : ''}" style="background:linear-gradient(155deg, ${chMeta.bgA}, ${chMeta.bgB});border-color:${chMeta.accent};">
        <div class="tv-broadcast-head">
          <div>
            <span class="tv-ch-badge" style="background:${chMeta.accent};color:#fff;">● ${esc(chMeta.name)}</span>
            <span class="muted" style="margin-left:8px;">MC: <b>${esc(chMeta.presenter)}</b></span>
          </div>
          <span class="muted">${muted ? '🔇 Đã tắt tiếng' : '🔊 Âm thanh TV: Bật'} · ${state.timeSystem?.getTimeString?.() || 'LIVE'}</span>
        </div>

        <h3 class="tv-headline">${esc(data.headline)}</h3>
        <div class="tv-subheadline">${esc(data.subheadline)}</div>

        <div class="tv-cards-grid">
          ${(data.mainCards || []).map((c) => `
            <div class="tv-story-card">
              <div class="tv-story-meta">
                <span>${esc(c.label)}</span>
                <span class="tv-story-tag">${esc(c.tag)}</span>
              </div>
              <div class="tv-story-title">${esc(c.title)}</div>
            </div>`).join('')}
        </div>

        <div class="tv-stats-strip">
          ${(data.statsStrip || []).map((st) => `
            <div class="tv-stat-box">
              <span>${esc(st.k)}</span>
              <strong class="tabular-nums">${esc(st.v)}</strong>
            </div>`).join('')}
        </div>

        <div class="tv-ticker-bar" style="background:${chMeta.accent === '#d4af37' ? '#92400e' : '#b91c1c'};">
          ${esc(data.ticker)}
        </div>
      </div>`;
  }

  return `
    <div class="tv-chassis">
      <div class="tv-remote-bar">
        <div class="tv-remote-left">
          <button class="btn-xs ${isOn ? 'btn-danger' : 'btn-primary'} tv-power-btn">${isOn ? '⏻ Tắt TV' : '⏻ Bật TV'}</button>
          <button class="btn-xs btn-secondary tv-mute-btn" ${!isOn ? 'disabled' : ''}>${muted ? '🔇 Bật tiếng' : '🔊 Tắt tiếng'}</button>
          <button class="btn-xs ${mode === 'morning_news' && isOn ? 'btn-accent' : 'btn-primary'} tv-morning-btn">☀️ Bản Tin Sáng PSG (10 Mục)</button>
        </div>
        <div class="tv-remote-right">
          <button class="btn-xs btn-secondary tv-refresh-morning" title="Làm mới bản tin theo dữ liệu hiện tại">🔄 Cập nhật tin</button>
          <button class="btn-xs btn-secondary tv-goto-media">📰 Mở Báo chí Máy tính</button>
        </div>
      </div>

      <div class="tv-bezel">
        ${screenBodyHtml}
      </div>

      <div class="section-label" style="margin:8px 0 5px;">📡 Chọn Kênh Truyền Hình (9 Kênh Trực Tiếp)</div>
      <div class="tv-channels-strip">
        ${TV_CHANNELS.map((ch, idx) => `
          <button class="tv-ch-btn ${isOn && mode === 'channel' && activeId === ch.id ? 'active' : ''}" data-tvch="${ch.id}">
            <span class="tv-ch-num">${idx + 1}</span>
            <span>${esc(ch.name)}</span>
          </button>`).join('')}
      </div>
    </div>`;
}
