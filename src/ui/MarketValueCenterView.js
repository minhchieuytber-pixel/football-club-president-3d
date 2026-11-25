// src/ui/MarketValueCenterView.js
// Trung tâm Định giá Thị trường Cầu thủ Toàn Cầu (Market Value Center)
// - 7 nhóm hiển thị: Top giá trị, Tăng mạnh nhất, Giảm mạnh nhất, Trẻ tăng giá, Có thể mua, PSG có thể bán, Được nhiều CLB săn đón
// - 7 bộ lọc độc lập + phân trang tối ưu cho iPhone Safari

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderMarketValueCenterHTML(state, uiState = {}) {
  const vs = state.valuationSystem;
  if (!vs) {
    return '<div class="card-item muted">Hệ thống Định giá Toàn cầu đang khởi tạo...</div>';
  }
  vs.hasUnreadReport = false;

  const mvState = uiState.valuationViewState || {};
  const category = mvState.category || 'top_valued';
  const filters = mvState.filters || {};
  const page = Number(mvState.page || 1);

  const categories = [
    ['top_valued', '👑 Top giá trị'],
    ['risers', '📈 Tăng mạnh nhất'],
    ['fallers', '📉 Giảm mạnh nhất'],
    ['youth', '🌱 Trẻ tăng giá'],
    ['available', '🏷️ Có thể mua'],
    ['psg_sellable', '🔵 PSG có thể bán'],
    ['most_wanted', '🔥 Săn đón nhiều']
  ];

  const leagues = ['ALL', 'Ligue 1', 'Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Primeira Liga', 'Eredivisie', 'Học viện'];
  const positions = ['ALL', 'GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'];

  const result = vs.getMarketValueCenterData(category, filters, page, 18);
  const report = vs.latestWeeklyReport;

  const deltaBadge = (delta, deltaPct) => {
    if (delta > 0.05) return `<span class="tag ok">+€${delta}M (+${deltaPct}%)</span>`;
    if (delta < -0.05) return `<span class="tag bad">-€${Math.abs(delta)}M (${deltaPct}%)</span>`;
    return `<span class="tag">0.0M (0%)</span>`;
  };

  return `
    <div class="card-item" style="border-color:rgba(212,175,55,0.45);">
      <div class="card-head">
        <strong>📈 TRUNG TÂM ĐỊNH GIÁ CẦU THỦ TOÀN CẦU</strong>
        <span class="tag ok">${report ? `Cập nhật Tuần ${report.week} · ${report.totalEvaluated} cầu thủ` : `Tuần ${state.week} · Khởi tạo`}</span>
      </div>
      <div class="muted">${report ? esc(report.summaryText) : 'Giá trị thị trường được cập nhật tự động đúng 1 lần mỗi tuần mới (khi Chủ tịch bấm NEXT).'}</div>
      ${report ? `
        <div class="kpi-mini" style="margin-top:6px;">
          <span>Tăng giá: <b style="color:#4ade80;">${report.risersCount} cầu thủ</b></span>
          <span>Giảm giá: <b style="color:#f87171;">${report.fallersCount} cầu thủ</b></span>
          <span>Top tăng: <b>${report.risers?.[0] ? `${esc(report.risers[0].name)} (+€${report.risers[0].delta}M)` : '—'}</b></span>
          <span>Top giảm: <b>${report.fallers?.[0] ? `${esc(report.fallers[0].name)} (€${report.fallers[0].delta}M)` : '—'}</b></span>
        </div>
      ` : ''}
    </div>

    <div class="tab-strip">
      ${categories.map(([k, lbl]) => `<button type="button" class="tab-btn ${category === k ? 'active' : ''}" data-mvcat="${k}">${lbl}</button>`).join('')}
    </div>

    <div class="filter-bar">
      <input id="mv-search" class="input-ctrl" placeholder="Tìm cầu thủ..." value="${esc(filters.search || '')}" />
      <input id="mv-club" class="input-ctrl" placeholder="CLB..." value="${esc(filters.club || '')}" style="max-width:110px;" />
      <select id="mv-league" class="input-ctrl" style="max-width:125px;">
        ${leagues.map((lg) => `<option value="${esc(lg)}" ${filters.league === lg ? 'selected' : ''}>${lg === 'ALL' ? 'Mọi giải đấu' : esc(lg)}</option>`).join('')}
      </select>
      <select id="mv-pos" class="input-ctrl" style="max-width:85px;">
        ${positions.map((pos) => `<option value="${pos}" ${filters.pos === pos ? 'selected' : ''}>${pos === 'ALL' ? 'Vị trí' : pos}</option>`).join('')}
      </select>
      <input id="mv-maxage" type="number" class="input-ctrl" placeholder="Tuổi≤" value="${esc(filters.maxAge || '')}" style="max-width:72px;" />
      <input id="mv-maxval" type="number" class="input-ctrl" placeholder="Giá≤€M" value="${esc(filters.maxVal || '')}" style="max-width:78px;" />
      <input id="mv-minpot" type="number" class="input-ctrl" placeholder="POT≥" value="${esc(filters.minPot || '')}" style="max-width:72px;" />
    </div>

    <div class="table-wrap" style="max-height:42vh;">
      <table class="data-table">
        <thead>
          <tr>
            <th>Cầu thủ</th>
            <th>CLB</th>
            <th>VT · Tuổi</th>
            <th>OVR/POT</th>
            <th>Giá Thị Trường</th>
            <th>Biến động Tuần</th>
            <th>Giá Đòi Hỏi</th>
            <th>CLB Quan tâm</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          ${result.items.length === 0 ? '<tr><td colspan="9" class="muted">Không có cầu thủ phù hợp bộ lọc hiện tại.</td></tr>' : result.items.map((p) => {
            const v = p.valuation || vs.ensurePlayerValuation(p);
            const interestedStr = (v.interestedClubs || []).slice(0, 2).join(', ') || '—';
            const isPsg = p.club === 'Paris Saint-Germain';
            return `
              <tr>
                <td>
                  <button type="button" class="btn-xs btn-secondary open-profile-btn" data-pid="${esc(p.id)}">👤 ${esc(p.name)}</button>
                  <div class="muted" style="font-size:10px;margin-top:2px;">${esc(v.lastReason || '')}</div>
                </td>
                <td>${esc(p.club)}</td>
                <td>${esc(p.position)} · ${p.age}t</td>
                <td><b>${p.ovr}</b>/${p.pot}</td>
                <td><strong class="tabular-nums" style="color:#fde68a;">€${v.current}M</strong></td>
                <td>${deltaBadge(v.delta, v.deltaPct)}</td>
                <td class="tabular-nums">€${v.askingPrice}M</td>
                <td style="font-size:10.5px;">${esc(interestedStr)}</td>
                <td>
                  ${!isPsg
                    ? `<button type="button" class="btn-xs btn-primary mv-start-neg" data-pid="${esc(p.id)}">🤝 Đàm phán</button>`
                    : `<button type="button" class="btn-xs btn-accent open-profile-btn" data-pid="${esc(p.id)}">📊 Biểu đồ</button>`}
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div class="btn-row" style="justify-content:space-between;align-items:center;margin-top:8px;">
      <span class="muted">Hiển thị <b>${result.items.length}</b> / <b>${result.total}</b> cầu thủ · Trang <b>${result.page}/${result.totalPages}</b></span>
      <div class="btn-row" style="margin-top:0;">
        <button type="button" class="btn-xs btn-secondary" id="mv-prev-page" ${result.page <= 1 ? 'disabled' : ''}>◀ Trang trước</button>
        <button type="button" class="btn-xs btn-secondary" id="mv-next-page" ${result.page >= result.totalPages ? 'disabled' : ''}>Trang sau ▶</button>
      </div>
    </div>`;
}
