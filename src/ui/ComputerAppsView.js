// src/ui/ComputerAppsView.js
// Giao diện chi tiết cho các ứng dụng chuyên sâu trên Máy tính Chủ tịch PSG:
// 1. Dashboard Tổng quan (KPI + 6 chỉ số uy tín Chủ tịch + Launcher 17 ứng dụng)
// 2. Đàm phán Hợp đồng (Gia hạn đội một + Hồ sơ mua/mượn + Đề nghị từ đối thủ)
// 3. Nhà tài trợ (HĐ hiện tại + Gia hạn + Đề nghị tài trợ mới)
// 4. Cơ sở vật chất (6 hạng mục nâng cấp thực tế)
// 5. Quản lý Truyền thông (4 nhóm tin + trạng thái xác thực, 5 hành động Tin đồn/Tin mật, Khủng hoảng 3 cố vấn, Họp báo bối cảnh, Sự kiện 3D)
// 6. Quản lý Thương mại (Áo đấu, Ngôi sao bán chạy, Flagship Store, Chiến dịch)
// 7. Công việc chờ phê duyệt (Hàng đợi tập trung toàn CLB)
// 8. Quản lý Nhân sự (12 phòng ban + Lịch sử nhân sự)

import { REPUTATION_PILLARS } from '../club/ReputationSystem.js';
import { FACILITY_DEFS } from '../club/CommercialFacilitySystem.js';
import { RUMOR_STATUS } from '../media/RumorAndCrisisSystem.js';
import { renderSigningEventHubHTML } from './SigningEventView.js';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getVerificationBadgeClass(status) {
  if (status === RUMOR_STATUS.OFFICIAL || status === 'Chính thức') return 'ok';
  if (status === RUMOR_STATUS.UNCONFIRMED || status === 'Tin chưa xác nhận') return 'warn';
  return '';
}

export function renderExecutiveOverviewHTML(state, appsList = []) {
  const weekFx = state.getCurrentWeekFixture();
  const ligue1 = state.clubs
    .filter((c) => c.league === 'Ligue 1')
    .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
  const rank = ligue1.findIndex((c) => c.name === 'Paris Saint-Germain') + 1;

  const repSys = state.reputationSystem;
  const repMetrics = repSys?.metrics || {
    fanTrust: state.president.fanSupport,
    playerTrust: 86,
    coachTrust: 85,
    mediaTrust: 83,
    partnerTrust: 87,
    governanceSkill: state.president.boardTrust
  };
  const overallRep = repSys?.getOverallScore?.() ?? state.president.prestige;
  const tierLabel = repSys?.getTierLabel?.() ?? 'Lãnh đạo Xuất sắc';
  const pendingTotal = state.getTotalPendingApprovalsCount?.() ?? state.pendingReports.length;
  const activeCrises = (state.rumorCrisisSystem?.crises || []).filter((c) => c.status === 'active');

  return `
    <div class="kpi-grid">
      <div class="kpi-card"><span>Ngân sách CLB</span><strong class="tabular-nums">€${state.finance.budget.toFixed(1)}M</strong></div>
      <div class="kpi-card"><span>Quỹ chuyển nhượng</span><strong class="tabular-nums">€${state.finance.transferBudget.toFixed(1)}M</strong></div>
      <div class="kpi-card"><span>Ligue 1</span><strong class="tabular-nums">Hạng ${rank || 1}</strong></div>
      <div class="kpi-card"><span>Chờ phê duyệt</span><strong class="tabular-nums">${pendingTotal} việc</strong></div>
    </div>

    <div class="card-item ${weekFx ? 'urgent' : ''}">
      <div class="card-head">
        <strong>⚽ Điều hành Tuần ${state.week} · ${esc(state.season)}</strong>
        <span class="tag ${weekFx ? '' : 'ok'}">${weekFx ? esc(weekFx.comp) : 'Sẵn sàng qua tuần'}</span>
      </div>
      <p>${weekFx ? `${esc(weekFx.round)}: <b>${esc(weekFx.home)}</b> vs <b>${esc(weekFx.away)}</b> (Chưa thi đấu)` : 'Đã hoàn thành lịch thi đấu tuần này. Chủ tịch có thể qua tuần hoặc rà soát chiến lược CLB.'}</p>
      <div class="btn-row">
        <button class="btn-primary" id="ov-play-match">🏟️ Ra SVĐ · Thi đấu 3D</button>
        <button class="btn-accent" id="ov-board">🏛️ Họp Ban Lãnh Đạo</button>
        <button class="btn-secondary" id="ov-player-meet">🗣️ Họp riêng cầu thủ</button>
        <button class="btn-secondary" id="ov-open-tv">📺 Bật TV Truyền thông</button>
      </div>
    </div>

    ${activeCrises.length > 0 ? `
      <div class="card-item urgent">
        <div class="card-head">
          <strong>🚨 Khủng hoảng đang cần xử lý (${activeCrises.length})</strong>
          <button class="btn-xs btn-danger ov-jump-app" data-pctab="media" data-msub="crises">Xử lý ngay</button>
        </div>
        <p class="muted">${esc(activeCrises[0].title)} — ${esc(activeCrises[0].summary)}</p>
      </div>` : ''}

    <div class="card-item">
      <div class="card-head">
        <strong>🏛️ Uy tín Chủ tịch Phạm Minh Chiêu (${overallRep}/100)</strong>
        <span class="tag ok">${esc(tierLabel)}</span>
      </div>
      <div class="rep-grid">
        ${REPUTATION_PILLARS.map((p) => {
          const val = repMetrics[p.key] ?? 80;
          return `
            <div class="rep-pillar">
              <div class="rep-pillar-head">
                <span>${p.icon} ${esc(p.label)}</span>
                <b class="tabular-nums">${val}/100</b>
              </div>
              <div class="attr-bar-track"><div class="attr-bar-fill" style="width:${val}%;background:${p.color};"></div></div>
            </div>`;
        }).join('')}
      </div>
    </div>

    <div class="section-label">💻 Toàn bộ 17 Ứng dụng Quản trị PSG</div>
    <div class="app-launcher-grid">
      ${appsList.map((a) => `
        <button class="app-tile-btn" data-pctab="${a.id}">
          <span class="app-tile-icon" style="background:${a.bg}">${a.icon}</span>
          <span class="app-tile-name">${esc(a.name)}</span>
        </button>`).join('')}
    </div>`;
}

export function renderContractsNegotiationHTML(state) {
  const squad = state.getPsgSquad();
  const urgentRenewals = [...squad].sort((a, b) => (a.contractYears || 2) - (b.contractYears || 2)).slice(0, 12);
  const activeNegs = state.transferSystem?.activeNegotiations || [];
  const incomingBids = state.transferSystem?.incomingBids || [];
  const staffList = state.staffDb?.active || [];

  return `
    <div class="kpi-grid">
      <div class="kpi-card"><span>Đàm phán mua/mượn</span><strong class="tabular-nums">${activeNegs.length} hồ sơ</strong></div>
      <div class="kpi-card"><span>CLB hỏi mua cầu thủ PSG</span><strong class="tabular-nums">${incomingBids.length} đề nghị</strong></div>
      <div class="kpi-card"><span>HĐ ≤ 1 năm (Đội 1)</span><strong class="tabular-nums">${squad.filter((p) => p.contractYears <= 1).length} cầu thủ</strong></div>
      <div class="kpi-card"><span>Quỹ lương / tuần</span><strong class="tabular-nums">€${state.finance.weeklyWages}M</strong></div>
    </div>

    <div class="section-label">📩 Đề nghị Hỏi Mua / Mượn từ Đối thủ (${incomingBids.length})</div>
    ${incomingBids.length === 0
      ? '<div class="card-item muted">Hiện chưa có đề nghị mới nào gửi tới bàn Chủ tịch.</div>'
      : incomingBids.map((b) => `
        <div class="card-item urgent">
          <div class="card-head">
            <strong>${esc(b.buyerClub)} muốn ${b.dealType === 'loan' ? 'MƯỢN' : 'MUA'} ${esc(b.playerName)} (${esc(b.position)} · OVR ${b.ovr})</strong>
            <span class="tag ok">€${b.fee}M</span>
          </div>
          <div class="muted">Chiến lược: ${esc(b.buyerStrategy || 'Tăng cường lực lượng')} · Vòng: ${b.rounds || 0}</div>
          <div class="btn-row">
            <button class="btn-xs btn-primary ct-accept-bid" data-bid="${b.id}">✅ Chấp nhận (+€${b.fee}M)</button>
            <button class="btn-xs btn-accent ct-counter-bid" data-bid="${b.id}" data-fee="${Math.round(b.fee * 1.15)}">💬 Ép giá €${Math.round(b.fee * 1.15)}M</button>
            <button class="btn-xs btn-danger ct-reject-bid" data-bid="${b.id}">❌ Từ chối</button>
          </div>
        </div>`).join('')}

    <div class="section-label">✍️ Hồ sơ Đàm phán Chuyển nhượng 2 Giai đoạn (${activeNegs.length})</div>
    ${activeNegs.length === 0
      ? '<div class="card-item muted">Chưa có thương vụ mua/mượn nào đang mở. Vào mục Chuyển nhượng để khởi tạo đàm phán.</div>'
      : activeNegs.map((n) => `
        <div class="card-item">
          <div class="card-head">
            <strong>${esc(n.playerName)} (${esc(n.fromClub)} · ${esc(n.position)})</strong>
            <span class="stage-pill">Giai đoạn ${n.stage}/2</span>
          </div>
          <div class="muted">${esc(n.history[n.history.length - 1] || '')}</div>
          <div class="btn-row"><button class="btn-xs btn-primary tr-resume-neg" data-negid="${n.id}">✍️ Mở bàn đàm phán</button></div>
        </div>`).join('')}

    <div class="section-label">📋 Hợp đồng Cầu thủ Đội một & Gia hạn</div>
    <div class="table-wrap" style="max-height:28vh;">
      <table class="data-table">
        <thead><tr><th>Cầu thủ</th><th>VT</th><th>Tuổi</th><th>OVR</th><th>Lương/tuần</th><th>Thời hạn</th><th>Gia hạn</th></tr></thead>
        <tbody>
          ${urgentRenewals.map((p) => `
            <tr class="${p.contractYears <= 1 ? 'highlight-row' : ''}">
              <td><button class="btn-xs btn-secondary open-profile-btn" data-pid="${p.id}">👤 ${esc(p.name)}</button></td>
              <td>${esc(p.position)}</td>
              <td>${p.age}</td>
              <td><b>${p.ovr}</b></td>
              <td class="tabular-nums">€${p.wage}k</td>
              <td><span class="tag ${p.contractYears <= 1 ? 'bad' : 'ok'}">${p.contractYears} năm</span></td>
              <td>
                <button class="btn-xs btn-primary ct-renew-player" data-pid="${p.id}" data-years="3" data-wage="${Math.round(p.wage * 1.1)}">✍️ +3 năm (€${Math.round(p.wage * 1.1)}k)</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="section-label">👔 Hợp đồng Ban Huấn Luyện Chủ chốt</div>
    <div class="grid-2">
      ${staffList.slice(0, 4).map((st) => `
        <div class="card-item">
          <div class="card-head"><strong>${esc(st.name)}</strong><span class="tag">${esc(st.role)}</span></div>
          <div class="muted">Lương: €${st.wage}k/tuần · Còn ${st.contractYears} năm</div>
          <div class="btn-row">
            <button class="btn-xs btn-secondary ct-renew-staff" data-rkey="${st.roleKey}">✍️ Gia hạn +2 năm</button>
          </div>
        </div>`).join('')}
    </div>`;
}

export function renderSponsorsHTML(state) {
  const comm = state.commercialSystem;
  const active = comm?.sponsors || [];
  const offers = comm?.sponsorOffers || [];
  const overallRep = state.reputationSystem?.getOverallScore?.() ?? state.president.prestige;

  return `
    <div class="kpi-grid">
      <div class="kpi-card"><span>Tổng tài trợ / năm</span><strong class="tabular-nums">€${comm?.getTotalSponsorAnnualRevenue() || 145}M</strong></div>
      <div class="kpi-card"><span>Đối tác đang hợp tác</span><strong class="tabular-nums">${active.length} thương hiệu</strong></div>
      <div class="kpi-card"><span>Đề nghị mới chờ duyệt</span><strong class="tabular-nums">${offers.length} hồ sơ</strong></div>
      <div class="kpi-card"><span>Uy tín Đối tác</span><strong class="tabular-nums">${state.reputationSystem?.metrics?.partnerTrust ?? 87}/100</strong></div>
    </div>

    <div class="section-label">🤝 Đề nghị Tài trợ Mới Chờ Ký Kết (${offers.length})</div>
    ${offers.length === 0
      ? '<div class="card-item muted">Hiện tại không còn hồ sơ đề nghị tài trợ mới nào đang chờ.</div>'
      : offers.map((o) => {
        const eligible = overallRep >= o.minPrestige;
        return `
          <div class="card-item urgent">
            <div class="card-head">
              <strong>${esc(o.name)} · ${esc(o.sector)}</strong>
              <span class="tag ok">+€${o.annualValueM}M/năm · ${o.years} năm</span>
            </div>
            <div class="muted">Hạng mục: <b>${esc(o.slot)}</b> · Thưởng ký ngay: <b>+€${o.signingBonusM}M</b> · Yêu cầu uy tín: ${o.minPrestige}/100 (Hiện tại: ${overallRep})</div>
            <p class="muted">Mục tiêu: ${esc(o.objective)}</p>
            <div class="btn-row">
              <button class="btn-xs ${eligible ? 'btn-primary' : 'btn-secondary'} sp-sign-offer" data-oid="${o.id}" ${!eligible ? 'disabled' : ''}>${eligible ? '✍️ Ký Hợp Đồng Tài Trợ & Tổ Chức Lễ Công Bố' : `Chưa đủ uy tín (${o.minPrestige})`}</button>
            </div>
          </div>`;
      }).join('')}

    <div class="section-label">🏢 Danh mục Nhà Tài Trợ Hiện Tại (${active.length})</div>
    <div class="grid-2">
      ${active.map((sp) => `
        <div class="card-item">
          <div class="card-head">
            <strong>${esc(sp.name)}</strong>
            <span class="tag ok">€${sp.annualValueM}M/năm</span>
          </div>
          <div class="muted">${esc(sp.slot)} · ${esc(sp.sector)}</div>
          <div class="kpi-mini" style="margin:6px 0;">
            <span>Thời hạn: <b>${sp.yearsLeft} năm</b></span>
            <span>Hài lòng: <b>${sp.satisfaction}%</b></span>
            <span>Thưởng: <b>+€${sp.bonusM}M</b></span>
          </div>
          <p class="muted">Cam kết: ${esc(sp.objective)}</p>
          <div class="btn-row">
            <button class="btn-xs btn-secondary sp-renew-btn" data-spid="${sp.id}">🔄 Đàm phán gia hạn (+2 năm)</button>
          </div>
        </div>`).join('')}
    </div>`;
}

export function renderFacilitiesHTML(state) {
  const comm = state.commercialSystem;
  const totalUpkeep = comm?.getTotalWeeklyFacilityUpkeep() || 1.36;

  return `
    <div class="kpi-grid">
      <div class="kpi-card"><span>Ngân sách CLB</span><strong class="tabular-nums">€${state.finance.budget.toFixed(1)}M</strong></div>
      <div class="kpi-card"><span>Bảo trì / tuần</span><strong class="tabular-nums">€${totalUpkeep}M</strong></div>
      <div class="kpi-card"><span>Cấp Trung bình</span><strong class="tabular-nums">Lv ${(FACILITY_DEFS.reduce((s, d) => s + comm.getFacilityLevel(d.id), 0) / FACILITY_DEFS.length).toFixed(1)}/5</strong></div>
      <div class="kpi-card"><span>Trung tâm PSG</span><strong>6 Khu Hiện đại</strong></div>
    </div>

    <div class="grid-2">
      ${FACILITY_DEFS.map((def) => {
        const fac = comm?.facilities?.[def.id] || { level: 3, condition: 92 };
        const isMax = fac.level >= def.maxLevel;
        const nextCost = Math.round(def.baseCost * (1 + (fac.level - 1) * 0.45));
        return `
          <div class="card-item">
            <div class="card-head">
              <strong>${def.icon} ${esc(def.name)}</strong>
              <span class="tag ${isMax ? 'ok' : ''}">Cấp ${fac.level}/${def.maxLevel}</span>
            </div>
            <div class="muted">${esc(def.category)} · Tình trạng: <b>${fac.condition}%</b> · Bảo trì: €${(def.weeklyUpkeep * fac.level).toFixed(2)}M/tuần</div>
            <p style="margin:6px 0;">Hiệu quả hiện tại: <b>${esc(def.bonusDesc(fac.level))}</b></p>
            <div class="btn-row">
              ${isMax
                ? '<span class="tag ok">Đã đạt chuẩn Tối đa Châu Âu</span>'
                : `<button class="btn-xs btn-primary fac-upgrade-btn" data-fid="${def.id}">⬆️ Nâng cấp lên Cấp ${fac.level + 1} (-€${nextCost}M)</button>`}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

export function renderCommercialHTML(state) {
  const comm = state.commercialSystem;
  const cData = comm?.commercial || { jerseysSoldK: 940, jerseyPriceEur: 115, merchRevenueM: 54, globalStores: 14, activeCampaigns: [] };
  const topStars = comm?.getTopSellingPlayers?.(5) || [];

  return `
    <div class="kpi-grid">
      <div class="kpi-card"><span>Doanh thu Thương mại</span><strong class="tabular-nums">€${cData.merchRevenueM}M</strong></div>
      <div class="kpi-card"><span>Áo đấu đã bán</span><strong class="tabular-nums">${cData.jerseysSoldK}k chiếc</strong></div>
      <div class="kpi-card"><span>Cửa hàng Toàn cầu</span><strong class="tabular-nums">${cData.globalStores} Flagship</strong></div>
      <div class="kpi-card"><span>Cộng đồng Fan</span><strong class="tabular-nums">${state.brandMetrics?.fanbase || 185.4}M</strong></div>
    </div>

    <div class="section-label">🚀 Phát động Chiến dịch Thương mại Mới</div>
    <div class="grid-3">
      <div class="card-item">
        <strong>👕 Chiến dịch Áo đấu Ngôi sao</strong>
        <p class="muted">Chi phí €2.5M · Dự kiến bán +95k áo đấu & thu €9.5M</p>
        <button class="btn-xs btn-primary comm-launch-btn" data-ctype="jersey_star">Triển khai ngay</button>
      </div>
      <div class="card-item">
        <strong>🏬 Mở Flagship Store Mới</strong>
        <p class="muted">Chi phí €4.0M · Mở rộng Châu Á/Mỹ (+€13.0M doanh thu)</p>
        <button class="btn-xs btn-primary comm-launch-btn" data-ctype="global_store">Mở Flagship Store</button>
      </div>
      <div class="card-item">
        <strong>✈️ Tour Du đấu & Tri ân Fan</strong>
        <p class="muted">Chi phí €3.0M · +2.6M người hâm mộ & €11.2M doanh thu</p>
        <button class="btn-xs btn-accent comm-launch-btn" data-ctype="exhibition_tour" ${cData.tourCompletedThisSeason ? 'disabled' : ''}>${cData.tourCompletedThisSeason ? 'Đã hoàn thành mùa này' : 'Tổ chức Tour'}</button>
      </div>
    </div>

    <div class="section-label">⭐ Top 5 Cầu thủ PSG Bán Áo Đấu Chạy Nhất</div>
    <div class="table-wrap" style="max-height:24vh;">
      <table class="data-table">
        <thead><tr><th>Số áo</th><th>Cầu thủ</th><th>Vị trí</th><th>Độ nổi tiếng</th><th>Áo bán ra</th><th>Doanh thu ước tính</th></tr></thead>
        <tbody>
          ${topStars.map((p) => `
            <tr>
              <td><b>#${p.shirtNumber}</b></td>
              <td><button class="btn-xs btn-secondary open-profile-btn" data-pid="${p.id}">${esc(p.name)}</button></td>
              <td>${esc(p.position)}</td>
              <td class="tabular-nums">${p.popularity}/100</td>
              <td class="tabular-nums">${p.estSoldK}k</td>
              <td class="tabular-nums"><b>€${p.estRevenueM}M</b></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="section-label">📜 Lịch sử Chiến dịch Thương mại (${(cData.activeCampaigns || []).length})</div>
    <div class="scroll-list" style="max-height:16vh;">
      ${(cData.activeCampaigns || []).map((cmp) => `
        <div class="card-item" style="padding:7px 10px;">
          <div class="card-head"><strong>${esc(cmp.name)}</strong><span class="tag ok">+€${cmp.revenueM}M</span></div>
          <div class="muted">Trạng thái: ${esc(cmp.status)} · Tăng trưởng thương hiệu +${cmp.boostPct}%</div>
        </div>`).join('')}
    </div>`;
}

export function renderMediaCenterHTML(state, uiState) {
  const sub = uiState.mediaSubTab || 'news';
  const rumors = state.rumorCrisisSystem?.rumors || [];
  const unhandledCount = rumors.filter((r) => !r.handled).length;
  const crises = state.rumorCrisisSystem?.crises || [];
  const activeCrises = crises.filter((c) => c.status === 'active');
  const pendingEvents = state.signingEventSystem?.pendingEvents || [];

  const subTabs = [
    ['news', `📰 Tin tức (${(state.newsArchive || []).length})`],
    ['rumors', `🕵️ Tin đồn & Tin mật (${unhandledCount})`],
    ['crises', `🚨 Khủng hoảng (${activeCrises.length})`],
    ['press', '🎙️ Họp báo Bối cảnh'],
    ['ceremony', `🎬 Sự kiện & Ký kết (${pendingEvents.length})`]
  ];

  let body = '';
  if (sub === 'news') {
    const cats = ['ALL', 'Tin chuyển nhượng', 'Tin nội bộ', 'Tin thi đấu', 'Tin thương mại', 'SAVED'];
    const labels = { ALL: 'Tất cả', SAVED: '🔖 Đã lưu' };
    const selectedCat = uiState.newsCategory || 'ALL';
    const articles = (state.newsArchive || []).filter((a) => {
      if (selectedCat === 'ALL') return true;
      if (selectedCat === 'SAVED') return a.saved;
      return a.group === selectedCat || a.category === selectedCat ||
        (selectedCat === 'Tin chuyển nhượng' && a.category === 'Chuyển nhượng') ||
        (selectedCat === 'Tin nội bộ' && a.category === 'Nội bộ') ||
        (selectedCat === 'Tin thi đấu' && ['Trước trận', 'Sau trận', 'Champions League', 'Tin PSG'].includes(a.category));
    });

    if (uiState.activeArticleId) {
      const art = (state.newsArchive || []).find((x) => x.id === uiState.activeArticleId);
      if (art) {
        art.read = true;
        body = `
          <div class="btn-row" style="margin-bottom:8px;">
            <button class="btn-secondary" id="news-back">← Quay lại Tòa soạn</button>
            <button class="btn-accent" id="news-save" data-nid="${art.id}">${art.saved ? '🔖 Đã lưu' : '📑 Lưu bài viết'}</button>
          </div>
          <div class="card-item">
            <img src="${art.image}" alt="${esc(art.title)}" style="width:100%;max-height:200px;object-fit:cover;border-radius:10px;margin-bottom:8px;" />
            <div class="card-head">
              <span class="tag">${esc(art.outlet)} · ${esc(art.group || art.category)}</span>
              <span class="tag ${getVerificationBadgeClass(art.verificationStatus || art.tagType)}">${esc(art.verificationStatus || art.tagType)}</span>
            </div>
            <h3 style="margin:6px 0;font-size:16px;">${esc(art.title)}</h3>
            <div class="muted" style="margin-bottom:8px;">${esc(art.date)} · Mức độ: <b>${esc(art.importance || 'Cao')}</b> · Liên quan: ${esc(art.relatedEntity || 'PSG')} · ❤️ ${(art.likes || 0).toLocaleString('vi-VN')}</div>
            <p style="line-height:1.6;">${esc(art.body)}</p>
          </div>
          <div class="section-label">💬 Bình luận người hâm mộ (${(art.comments || []).length})</div>
          ${(art.comments || []).map((c) => `<div class="card-item"><b>${esc(c.user)}</b>: ${esc(c.text)}</div>`).join('')}`;
      }
    }

    if (!body) {
      body = `
        <div class="tab-strip">
          ${cats.map((c) => `<button class="tab-btn ${selectedCat === c ? 'active' : ''}" data-ncat="${c}">${labels[c] || c}</button>`).join('')}
        </div>
        <div class="grid-2">
          ${articles.length === 0
            ? '<div class="card-item muted">Chưa có bài viết nào trong chuyên mục này.</div>'
            : articles.slice(0, 14).map((a) => `
              <div class="card-item news-card" data-open-news="${a.id}" style="cursor:pointer;">
                <img src="${a.image}" alt="${esc(a.title)}" loading="lazy" style="width:100%;height:105px;object-fit:cover;border-radius:8px;margin-bottom:6px;" />
                <div class="card-head">
                  <span class="tag">${esc(a.outlet)}</span>
                  <span class="tag ${getVerificationBadgeClass(a.verificationStatus || a.tagType)}">${esc(a.verificationStatus || a.tagType)}</span>
                </div>
                <div style="font-weight:700;font-size:12.5px;margin:4px 0;color:#fff;">${esc(a.title)}</div>
                <p class="muted">${esc(a.summary)}</p>
                <div class="muted" style="margin-top:4px;font-size:10.5px;">${esc(a.group || a.category)} · ${esc(a.date)}</div>
              </div>`).join('')}
        </div>`;
    }
  } else if (sub === 'rumors') {
    body = `
      <div class="card-item" style="padding:8px 10px;">
        <div class="muted">Hệ thống tách bạch rõ: <b>Tin đồn</b> · <b>Tin chưa xác nhận</b> · <b>Thông báo chính thức</b>. Không thể xác nhận chính thức nếu thông tin chưa có sự kiện thực tế.</div>
      </div>
      <div class="scroll-list" style="max-height:46vh;">
        ${rumors.map((r) => `
          <div class="card-item ${!r.handled ? 'urgent' : ''}">
            <div class="card-head">
              <strong>${esc(r.title)}</strong>
              <span class="tag ${getVerificationBadgeClass(r.verificationStatus)}">${esc(r.verificationStatus)}</span>
            </div>
            <div class="muted">Nguồn: <b>${esc(r.source)}</b> · Đối tượng: ${esc(r.relatedEntity)} · Tin cậy: ${esc(r.reliability)} · ${esc(r.date)}</div>
            <p style="margin:5px 0;">${esc(r.detail)}</p>
            ${r.mediaNote ? `<div class="dialogue-bubble" style="margin:5px 0;padding:6px 10px;font-size:11.5px;">${esc(r.mediaNote)}</div>` : ''}
            ${!r.handled ? `
              <div class="btn-row">
                <button class="btn-xs btn-secondary rum-act-btn" data-rid="${r.id}" data-act="verify">🔍 Xác minh</button>
                <button class="btn-xs btn-secondary rum-act-btn" data-rid="${r.id}" data-act="silence">🤫 Giữ im lặng</button>
                <button class="btn-xs btn-danger rum-act-btn" data-rid="${r.id}" data-act="deny">🚫 Phủ nhận</button>
                <button class="btn-xs btn-primary rum-act-btn" data-rid="${r.id}" data-act="confirm">📢 Xác nhận</button>
                <button class="btn-xs btn-accent rum-act-btn" data-rid="${r.id}" data-act="delegate_media">🏛️ Giao Bộ phận Truyền thông</button>
              </div>` : `<div class="tag ok" style="display:inline-block;margin-top:4px;">Đã xử lý: ${esc(r.presidentAction)}</div>`}
          </div>`).join('')}
      </div>`;
  } else if (sub === 'crises') {
    body = `
      <div class="scroll-list" style="max-height:48vh;">
        ${crises.length === 0
          ? '<div class="card-item muted">✅ Hiện không có khủng hoảng truyền thông nào tại Paris Saint-Germain.</div>'
          : crises.map((c) => `
            <div class="card-item ${c.status === 'active' ? 'urgent' : ''}">
              <div class="card-head">
                <strong>🚨 ${esc(c.title)}</strong>
                <span class="tag ${c.status === 'active' ? 'bad' : 'ok'}">${c.status === 'active' ? `Đang xử lý · Mức ${esc(c.severity)}` : 'Đã ổn định'}</span>
              </div>
              <p>${esc(c.summary)}</p>
              <div class="section-label" style="margin:6px 0 4px;">Ý kiến Tham mưu Ban Lãnh Đạo:</div>
              <div class="grid-3">
                ${(c.advisors || []).map((adv) => `
                  <div class="card-item" style="margin-bottom:0;padding:7px 9px;">
                    <strong>${esc(adv.name)}</strong>
                    <div class="muted">${esc(adv.role)}</div>
                    <p class="muted" style="margin-top:4px;">"${esc(adv.advice)}"</p>
                  </div>`).join('')}
              </div>
              ${c.status === 'active' ? `
                <div class="section-label" style="margin:8px 0 4px;">Quyết định của Chủ tịch Phạm Minh Chiêu:</div>
                <div class="btn-row" style="flex-direction:column;align-items:stretch;">
                  ${(c.options || []).map((opt) => `
                    <button class="btn-secondary crs-resolve-btn" data-cid="${c.id}" data-opt="${opt.key}" style="text-align:left;padding:8px 10px;">
                      <b>${esc(opt.label)}</b> ${opt.costM > 0 ? `(Chi phí €${opt.costM}M)` : ''}<br/>
                      <span class="muted">${esc(opt.desc)}</span>
                    </button>`).join('')}
                </div>` : `<p class="muted" style="margin-top:6px;">✅ Đã xử lý (${esc(c.resolution?.date)}): <b>${esc(c.resolution?.label)}</b></p>`}
            </div>`).join('')}
      </div>`;
  } else if (sub === 'press') {
    const activeCtx = state.contextPressConference?.activeSession;
    if (activeCtx) {
      const q = activeCtx.questions[activeCtx.currentIdx];
      body = `
        <div class="card-item urgent">
          <div class="card-head">
            <strong>🎙️ ${esc(activeCtx.title)}</strong>
            <span class="tag ok">Câu ${activeCtx.currentIdx + 1}/${activeCtx.questions.length}</span>
          </div>
          ${q ? `
            <div class="muted" style="margin:4px 0;">Phóng viên: <b>${esc(q.reporter)}</b> (${esc(q.outlet)}) · Chủ đề: ${esc(q.category)}</div>
            <div class="dialogue-bubble">"${esc(q.question)}"</div>
            <div class="btn-row" style="flex-direction:column;align-items:stretch;">
              ${(q.options || []).map((opt) => `
                <button class="btn-secondary ctx-press-ans" data-opt="${opt.key}" style="text-align:left;padding:8px 10px;">
                  <b style="color:#fde68a;">${opt.key}.</b> ${esc(opt.text)}
                </button>`).join('')}
            </div>` : ''}
        </div>`;
    } else {
      body = `
        <div class="section-label">🎙️ Tổ chức Họp báo Chủ tịch Theo Bối cảnh Thực tế</div>
        <div class="grid-2">
          <div class="card-item">
            <strong>🏆 Họp báo Định hướng Mùa giải ${esc(state.season)}</strong>
            <p class="muted">Trả lời báo chí về mục tiêu Ligue 1, Champions League và kế hoạch sử dụng cầu thủ trẻ.</p>
            <button class="btn-xs btn-primary ctx-press-start" data-ptype="pre_season">Bắt đầu Họp báo</button>
          </div>
          <div class="card-item">
            <strong>⚽ Họp báo Trước Trận đấu Kế tiếp</strong>
            <p class="muted">Gây áp lực tâm lý hoặc động viên tinh thần trước cuộc đối đầu sắp tới của PSG.</p>
            <button class="btn-xs btn-primary ctx-press-start" data-ptype="pre_big_match">Bắt đầu Họp báo</button>
          </div>
          <div class="card-item">
            <strong>🏁 Họp báo Phân tích Sau Trận</strong>
            <p class="muted">Phản hồi báo giới về màn trình diễn gần nhất của toàn đội và HLV trưởng.</p>
            <button class="btn-xs btn-secondary ctx-press-start" data-ptype="post_match">Bắt đầu Họp báo</button>
          </div>
          <div class="card-item">
            <strong>🚨 Họp báo Xử lý Khủng hoảng & Dư luận</strong>
            <p class="muted">Trực tiếp dập tắt các tin đồn phòng thay đồ và bảo vệ hình ảnh thương hiệu PSG.</p>
            <button class="btn-xs btn-danger ctx-press-start" data-ptype="crisis_response">Bắt đầu Họp báo</button>
          </div>
        </div>`;
    }
  } else {
    body = renderSigningEventHubHTML(state, uiState.eventSubTab || 'pending');
  }

  return `
    <div class="tab-strip">
      ${subTabs.map(([k, lbl]) => `<button class="tab-btn ${sub === k ? 'active' : ''}" data-msub="${k}">${lbl}</button>`).join('')}
    </div>
    ${body}`;
}

export function renderApprovalsQueueHTML(state) {
  const reports = state.pendingReports || [];
  const acProps = (state.transferSystem?.academyProposals || []).filter((p) => p.status === 'pending' || p.status === 'evaluating');
  const bids = state.transferSystem?.incomingBids || [];
  const crises = (state.rumorCrisisSystem?.crises || []).filter((c) => c.status === 'active');
  const rumors = (state.rumorCrisisSystem?.rumors || []).filter((r) => !r.handled);
  const signEvents = state.signingEventSystem?.pendingEvents || [];
  const total = reports.length + acProps.length + bids.length + crises.length + rumors.length + signEvents.length;

  return `
    <div class="kpi-grid">
      <div class="kpi-card"><span>Tổng đầu việc chờ duyệt</span><strong class="tabular-nums">${total}</strong></div>
      <div class="kpi-card"><span>Báo cáo & Học viện</span><strong class="tabular-nums">${reports.length + acProps.length}</strong></div>
      <div class="kpi-card"><span>Chuyển nhượng & Lễ ký</span><strong class="tabular-nums">${bids.length + signEvents.length}</strong></div>
      <div class="kpi-card"><span>Khủng hoảng & Tin mật</span><strong class="tabular-nums">${crises.length + rumors.length}</strong></div>
    </div>

    ${total === 0 ? `
      <div class="card-item" style="text-align:center;padding:18px;">
        <strong>✅ Mọi Công Việc Đã Được Chủ Tịch Phê Duyệt</strong>
        <p class="muted">Không còn đề xuất, khủng hoảng hay hồ sơ tồn đọng nào trên bàn làm việc.</p>
      </div>` : `
      <div class="scroll-list" style="max-height:52vh;">
        ${crises.map((c) => `
          <div class="card-item urgent">
            <div class="card-head"><strong>🚨 Khủng hoảng: ${esc(c.title)}</strong><span class="tag bad">${esc(c.severity)}</span></div>
            <p class="muted">${esc(c.summary)}</p>
            <button class="btn-xs btn-danger app-jump" data-pctab="media" data-msub="crises">Họp cố vấn & Xử lý ngay</button>
          </div>`).join('')}

        ${bids.map((b) => `
          <div class="card-item urgent">
            <div class="card-head"><strong>📩 ${esc(b.buyerClub)} hỏi ${b.dealType === 'loan' ? 'mượn' : 'mua'} ${esc(b.playerName)}</strong><span class="tag ok">€${b.fee}M</span></div>
            <div class="btn-row">
              <button class="btn-xs btn-primary app-accept-bid" data-bid="${b.id}">✅ Chấp nhận</button>
              <button class="btn-xs btn-accent app-counter-bid" data-bid="${b.id}" data-fee="${Math.round(b.fee * 1.15)}">💬 Ép giá €${Math.round(b.fee * 1.15)}M</button>
              <button class="btn-xs btn-danger app-reject-bid" data-bid="${b.id}">❌ Từ chối</button>
            </div>
          </div>`).join('')}

        ${reports.map((r) => `
          <div class="card-item urgent">
            <div class="card-head"><strong>📨 ${esc(r.title)}</strong><span class="tag">${esc(r.dept)}</span></div>
            <div class="muted">Trình duyệt: ${esc(r.author)} · Chi phí: ${r.cost >= 0 ? '+' : ''}€${r.cost}M</div>
            <p class="muted">${esc(r.detail)}</p>
            <div class="btn-row">
              <button class="btn-xs btn-primary app-rep-approve" data-rid="${r.id}">✅ Phê duyệt</button>
              <button class="btn-xs btn-danger app-rep-reject" data-rid="${r.id}">❌ Từ chối</button>
            </div>
          </div>`).join('')}

        ${acProps.map((pr) => `
          <div class="card-item">
            <div class="card-head"><strong>🎓 Đề xuất đôn Đội 1: ${esc(pr.playerName)} (${esc(pr.position)} · OVR ${pr.ovr})</strong><span class="tag">${esc(pr.squad)}</span></div>
            <div class="btn-row">
              <button class="btn-xs btn-primary app-ac-promote" data-yid="${pr.playerId}">⬆️ Đôn lên Đội một</button>
              <button class="btn-xs btn-secondary app-jump" data-pctab="academy">Xem chi tiết</button>
            </div>
          </div>`).join('')}

        ${signEvents.map((e) => `
          <div class="card-item">
            <div class="card-head"><strong>🎬 Lễ ký kết chờ chủ trì: ${esc(e.subjectName)}</strong><span class="tag ok">${esc(e.eventTypeLabel)}</span></div>
            <button class="btn-xs btn-primary se-start-evt" data-evtid="${e.eventId}">🎬 Chủ trì ngay</button>
          </div>`).join('')}

        ${rumors.slice(0, 4).map((r) => `
          <div class="card-item">
            <div class="card-head"><strong>🕵️ ${esc(r.title)}</strong><span class="tag">${esc(r.verificationStatus)}</span></div>
            <div class="btn-row">
              <button class="btn-xs btn-secondary app-rum-act" data-rid="${r.id}" data-act="verify">🔍 Xác minh</button>
              <button class="btn-xs btn-accent app-rum-act" data-rid="${r.id}" data-act="delegate_media">🏛️ Giao Truyền thông</button>
              <button class="btn-xs btn-danger app-rum-act" data-rid="${r.id}" data-act="deny">🚫 Phủ nhận</button>
            </div>
          </div>`).join('')}
      </div>`}`;
}
