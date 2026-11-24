// src/ui/TransferMarketView.js
// Giao diện Thị trường Chuyển nhượng 8 mục (Phần IV & V):
// Bộ lọc 10 tiêu chí, Đề xuất, Đàm phán 2 giai đoạn (CLB -> Cầu thủ), Hoàn tất, Bán & Lời mời AI, Cho mượn, Hết hạn HĐ, Tin đồn & Đóng/Mở kỳ chuyển nhượng.

export function renderTransferMarketHTML(state, uiState) {
  const ts = state.transferSystem;
  const sub = uiState.transferSubTab || 'buy';
  const f = uiState.transferFilters || {};

  const subTabs = [
    ['buy', '🛒 Mua cầu thủ'],
    ['recommended', '⭐ Đề xuất'],
    ['negotiating', `✍️ Đang đàm phán (${ts.activeNegotiations.length})`],
    ['completed', `✅ Hoàn tất (${ts.completedDeals.length})`],
    ['sell', `💰 Bán (${ts.incomingBids.length} hỏi mua)`],
    ['loan', `🔄 Cho mượn (${ts.getLoanedOutPlayers().length})`],
    ['expiring', '⏳ Sắp hết HĐ'],
    ['rumors', '📰 Tin đồn & Kỳ CN']
  ];

  let content = '';
  if (sub === 'buy') {
    const q = (f.search || '').toLowerCase();
    const natQ = (f.nat || '').toLowerCase();
    const clubQ = (f.club || '').toLowerCase();
    const maxVal = f.maxVal ? Number(f.maxVal) : 999;
    const minOvr = f.minOvr ? Number(f.minOvr) : 0;
    const minPot = f.minPot ? Number(f.minPot) : 0;
    const maxAge = f.maxAge ? Number(f.maxAge) : 99;
    const maxWage = f.maxWage ? Number(f.maxWage) : 9999;
    const maxContract = f.maxContract ? Number(f.maxContract) : 99;

    const allMatches = state.players.filter((p) =>
      p.club !== 'Paris Saint-Germain' &&
      (!f.pos || f.pos === 'ALL' || p.position === f.pos) &&
      (!q || p.name.toLowerCase().includes(q)) &&
      (!natQ || p.nationality.toLowerCase().includes(natQ)) &&
      (!clubQ || p.club.toLowerCase().includes(clubQ)) &&
      p.value <= maxVal &&
      p.ovr >= minOvr &&
      p.pot >= minPot &&
      p.age <= maxAge &&
      p.wage <= maxWage &&
      p.contractYears <= maxContract
    );
    const pageSize = 25;
    const totalPages = Math.max(1, Math.ceil(allMatches.length / pageSize));
    const curPage = Math.max(1, Math.min(totalPages, Number(uiState.transferPage) || 1));
    const startIdx = (curPage - 1) * pageSize;
    const list = allMatches.slice(startIdx, startIdx + pageSize);

    content = `
      <div class="filter-bar">
        <input id="tf-search" class="input-ctrl" placeholder="Tên cầu thủ..." value="${f.search || ''}" />
        <input id="tf-club" class="input-ctrl" placeholder="CLB..." value="${f.club || ''}" style="max-width:120px;" />
        <input id="tf-nat" class="input-ctrl" placeholder="Quốc tịch..." value="${f.nat || ''}" style="max-width:105px;" />
        <select id="tf-pos" class="input-ctrl" style="max-width:95px;"><option value="ALL">Vị trí</option>${['GK','CB','LB','RB','DM','CM','AM','LW','RW','ST'].map((x) => `<option value="${x}" ${f.pos === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <input id="tf-minovr" type="number" class="input-ctrl" placeholder="OVR≥" value="${f.minOvr || ''}" style="max-width:68px;" />
        <input id="tf-minpot" type="number" class="input-ctrl" placeholder="POT≥" value="${f.minPot || ''}" style="max-width:68px;" />
        <input id="tf-maxage" type="number" class="input-ctrl" placeholder="Tuổi≤" value="${f.maxAge || ''}" style="max-width:68px;" />
        <input id="tf-maxval" type="number" class="input-ctrl" placeholder="Giá≤€M" value="${f.maxVal || ''}" style="max-width:74px;" />
        <input id="tf-maxwage" type="number" class="input-ctrl" placeholder="Lương≤k" value="${f.maxWage || ''}" style="max-width:76px;" />
        <input id="tf-maxct" type="number" class="input-ctrl" placeholder="HĐ≤năm" value="${f.maxContract || ''}" style="max-width:74px;" />
      </div>
      <div class="table-wrap" style="max-height:33vh;">
        <table class="data-table">
          <thead><tr><th>Cầu thủ</th><th>CLB</th><th>VT</th><th>Tuổi</th><th>OVR/POT</th><th>Giá</th><th>Lương</th><th>HĐ</th><th>Thao tác</th></tr></thead>
          <tbody>
            ${list.map((p) => `<tr class="${uiState.selectedPlayerId === p.id ? 'highlight-row' : ''}" data-rowid="${p.id}">
              <td><button class="btn-xs btn-secondary open-profile-btn" data-pid="${p.id}">👤 ${p.name}</button></td>
              <td>${p.club}</td><td>${p.position}</td><td>${p.age}</td>
              <td><b>${p.ovr}</b>/${p.pot}</td><td>€${p.value}M</td><td>€${p.wage}k</td><td>${p.contractYears}n</td>
              <td>
                <button class="btn-xs btn-primary tr-start-neg" data-pid="${p.id}" data-dealtype="buy">✍️ Mua</button>
                <button class="btn-xs btn-secondary tr-start-loan-in" data-pid="${p.id}">🤝 Mượn</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="btn-row" style="justify-content:space-between;align-items:center;margin-top:6px;">
        <span class="muted">Tìm thấy <b>${allMatches.length}</b> cầu thủ · Trang <b>${curPage}/${totalPages}</b></span>
        <div class="btn-row" style="margin-top:0;">
          <button class="btn-xs btn-secondary" id="tf-prev-page" ${curPage <= 1 ? 'disabled' : ''}>◀ Trang trước</button>
          <button class="btn-xs btn-secondary" id="tf-next-page" ${curPage >= totalPages ? 'disabled' : ''}>Trang sau ▶</button>
        </div>
      </div>`;
  } else if (sub === 'recommended') {
    const recs = ts.getRecommendedTargets();
    content = `
      <div class="section-label">🎯 Mục tiêu được Giám đốc Thể thao đề xuất theo nhu cầu đội hình</div>
      <div class="table-wrap" style="max-height:40vh;">
        <table class="data-table">
          <thead><tr><th>Cầu thủ</th><th>CLB</th><th>VT</th><th>Tuổi</th><th>OVR/POT</th><th>Giá</th><th>Thao tác</th></tr></thead>
          <tbody>${recs.map((p) => `<tr><td><button class="btn-xs btn-secondary open-profile-btn" data-pid="${p.id}">${p.name}</button></td><td>${p.club}</td><td>${p.position}</td><td>${p.age}</td><td><b>${p.ovr}</b>/${p.pot}</td><td>€${p.value}M</td><td><button class="btn-xs btn-primary tr-start-neg" data-pid="${p.id}">🤝 Đàm phán 2 bước</button></td></tr>`).join('')}</tbody>
        </table>
      </div>`;
  } else if (sub === 'negotiating') {
    content = `
      <div class="scroll-list" style="max-height:40vh;">
        ${ts.activeNegotiations.length === 0 ? '<div class="card-item muted">Hiện không có thương vụ nào đang đàm phán. Hãy chọn cầu thủ ở mục Mua cầu thủ để bắt đầu Giai đoạn 1!</div>' : ts.activeNegotiations.map((n) => `
          <div class="card-item urgent">
            <div class="card-head"><strong>${n.playerName} (${n.fromClub} · ${n.position} · OVR ${n.ovr})</strong><span class="stage-pill">Giai đoạn ${n.stage}/2 · ${n.stage === 1 ? 'Đàm phán CLB' : 'Đàm phán Cầu thủ'}</span></div>
            <p class="muted">${n.history[n.history.length - 1]}</p>
            <div class="btn-row"><button class="btn-xs btn-primary tr-resume-neg" data-negid="${n.id}">✍️ Tiếp tục đàm phán</button></div>
          </div>`).join('')}
      </div>`;
  } else if (sub === 'completed') {
    content = `
      <div class="table-wrap" style="max-height:40vh;">
        <table class="data-table">
          <thead><tr><th>Ngày</th><th>Cầu thủ</th><th>Từ CLB</th><th>Đến CLB</th><th>Phí</th><th>Loại</th></tr></thead>
          <tbody>${ts.completedDeals.length ? ts.completedDeals.map((d) => `<tr class="${d.to === 'Paris Saint-Germain' || d.from === 'Paris Saint-Germain' ? 'highlight-row' : ''}"><td>${d.date}</td><td><b>${d.playerName}</b></td><td>${d.from}</td><td><b>${d.to}</b></td><td>€${d.fee}M</td><td><span class="tag">${d.type}</span></td></tr>`).join('') : '<tr><td colspan="6" class="muted">Chưa có thương vụ nào hoàn tất.</td></tr>'}</tbody>
        </table>
      </div>`;
  } else if (sub === 'sell') {
    const squad = state.getPsgSquad();
    content = `
      ${ts.incomingBids.length > 0 ? `
        <div class="section-label">📩 Lời hỏi mua / mượn từ các CLB đối thủ (${ts.incomingBids.length})</div>
        ${ts.incomingBids.map((b) => `
          <div class="card-item urgent">
            <div class="card-head">
              <strong>${b.buyerClub} hỏi ${b.dealType === 'loan' ? 'MƯỢN' : 'MUA'} ${b.playerName} (${b.position} · OVR ${b.ovr})</strong>
              <span class="tag ok">${b.dealType === 'loan' ? `Phí mượn €${b.fee}M${b.buyOptionFee ? ` · Mua đứt €${b.buyOptionFee}M` : ''}` : `Đề nghị €${b.fee}M`}</span>
            </div>
            <div class="muted" style="margin-bottom:6px;">Chiến lược đối tác: ${b.buyerStrategy || 'Cạnh tranh châu Âu'} · Vòng thương lượng: ${b.rounds || 0}</div>
            <div class="btn-row">
              <button class="btn-xs btn-primary tr-review-bid" data-bid="${b.id}">📋 Xử lý tác vụ</button>
              <button class="btn-xs btn-primary tr-accept-bid" data-bid="${b.id}">✅ Chấp nhận (+€${b.fee}M)</button>
              <button class="btn-xs btn-accent tr-counter-bid" data-bid="${b.id}" data-fee="${Math.round(b.fee * 1.15)}">💬 Ép giá (+15%)</button>
              <button class="btn-xs btn-danger tr-reject-bid" data-bid="${b.id}">❌ Từ chối</button>
            </div>
          </div>`).join('')}
      ` : ''}
      <div class="section-label">Đội một PSG — Đưa vào danh sách bán / Bán nhanh</div>
      <div class="table-wrap" style="max-height:30vh;">
        <table class="data-table">
          <thead><tr><th>Cầu thủ</th><th>VT</th><th>OVR</th><th>Giá trị</th><th>Lương</th><th>Thao tác</th></tr></thead>
          <tbody>${squad.map((p) => `<tr>
            <td><button class="btn-xs btn-secondary open-profile-btn" data-pid="${p.id}">#${p.shirtNumber || ''} ${p.name}</button></td>
            <td>${p.position}</td><td><b>${p.ovr}</b></td><td>€${p.value}M</td><td>€${p.wage}k</td>
            <td>
              <button class="btn-xs ${p.transferListed ? 'btn-accent' : 'btn-secondary'} tr-toggle-list" data-pid="${p.id}">${p.transferListed ? '📌 Đang rao bán' : 'Rao bán'}</button>
              <button class="btn-xs btn-danger tr-quick-sell" data-pid="${p.id}">💰 Bán (€${p.value}M)</button>
            </td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
  } else if (sub === 'loan') {
    const loaned = ts.getLoanedOutPlayers();
    const psgLoanCandidates = state.getPsgSquad().filter((p) => p.age <= 24 || p.ovr <= 83);
    content = `
      <div class="section-label">🔄 Cầu thủ PSG đang được cho mượn (${loaned.length})</div>
      <div class="scroll-list" style="max-height:17vh;margin-bottom:8px;">
        ${loaned.length ? loaned.map((p) => `<div class="card-item"><div class="card-head"><strong>${p.name} (${p.position} · OVR ${p.ovr})</strong><span class="tag ok">Tại ${p.loanInfo.loanClub}</span></div><div class="muted">Trận: ${p.loanInfo.loanApps} · Bàn: ${p.loanInfo.loanGoals} · Điểm TB: ${p.loanInfo.loanAvgRating} · Mua đứt: ${p.loanInfo.buyOptionFee ? `€${p.loanInfo.buyOptionFee}M` : 'Không'}</div></div>`).join('') : '<div class="card-item muted">Hiện chưa có cầu thủ nào đang được cho mượn.</div>'}
      </div>
      <div class="section-label">Gửi cầu thủ đội một / trẻ đi cho mượn tích lũy kinh nghiệm</div>
      <div class="table-wrap" style="max-height:22vh;">
        <table class="data-table">
          <thead><tr><th>Cầu thủ</th><th>VT</th><th>Tuổi</th><th>OVR/POT</th><th>Cho mượn</th></tr></thead>
          <tbody>${psgLoanCandidates.map((p) => `<tr><td><b>${p.name}</b></td><td>${p.position}</td><td>${p.age}</td><td>${p.ovr}/${p.pot}</td><td><button class="btn-xs btn-primary tr-loan-out" data-pid="${p.id}">🔄 Cho mượn 1 mùa</button></td></tr>`).join('')}</tbody>
        </table>
      </div>`;
  } else if (sub === 'expiring') {
    const psgExp = state.getPsgSquad().filter((p) => p.contractYears <= 1);
    const worldExp = state.players.filter((p) => p.club !== 'Paris Saint-Germain' && p.contractYears <= 1).slice(0, 20);
    content = `
      <div class="section-label">⚠️ Cầu thủ PSG sắp hết hợp đồng (${psgExp.length})</div>
      ${psgExp.length ? psgExp.map((p) => `<div class="card-item urgent"><div class="card-head"><strong>${p.name} (${p.position} · OVR ${p.ovr})</strong><button class="btn-xs btn-primary tr-renew-psg" data-pid="${p.id}">✍️ Gia hạn +3 năm</button></div></div>`).join('') : '<div class="card-item muted">Tất cả cầu thủ PSG đều còn hạn hợp đồng an toàn (>1 năm).</div>'}
      <div class="section-label">🌐 Cầu thủ thế giới còn ≤ 1 năm hợp đồng (Giá tốt)</div>
      <div class="table-wrap" style="max-height:24vh;">
        <table class="data-table">
          <thead><tr><th>Cầu thủ</th><th>CLB</th><th>VT</th><th>OVR</th><th>Giá</th><th>Đàm phán</th></tr></thead>
          <tbody>${worldExp.map((p) => `<tr><td><button class="btn-xs btn-secondary open-profile-btn" data-pid="${p.id}">${p.name}</button></td><td>${p.club}</td><td>${p.position}</td><td><b>${p.ovr}</b></td><td>€${p.value}M</td><td><button class="btn-xs btn-primary tr-start-neg" data-pid="${p.id}">✍️ Chiêu mộ</button></td></tr>`).join('')}</tbody>
        </table>
      </div>`;
  } else {
    content = `
      <div class="card-item">
        <div class="card-head"><strong>🗓️ Quản trị Kỳ Chuyển Nhượng (${state.season})</strong><span class="tag">${ts.windowState.toUpperCase()}</span></div>
        <p class="muted">${ts.getWindowLabel()}</p>
        <div class="btn-row">
          <button class="btn-xs btn-primary" id="tr-sim-ai">🌐 Mô phỏng thị trường AI ngay</button>
          ${ts.isWindowOpen() ? `<button class="btn-xs btn-danger" id="tr-close-win">🔒 Đóng kỳ chuyển nhượng & Lập báo cáo</button>` : `<button class="btn-xs btn-accent" id="tr-open-win">🟢 Mở kỳ chuyển nhượng bổ sung</button>`}
        </div>
      </div>
      <div class="section-label">🏟️ Chiến lược & Ngân sách CLB Đối thủ Châu Âu</div>
      <div class="table-wrap" style="max-height:18vh;margin-bottom:8px;">
        <table class="data-table">
          <thead><tr><th>CLB</th><th>Giải</th><th>Quỹ CN</th><th>Quỹ lương/t</th><th>Nhu cầu</th><th>Chiến lược</th></tr></thead>
          <tbody>
            ${state.clubs.filter((c) => c.name !== 'Paris Saint-Germain' && c.rating >= 81).slice(0, 14).map((c) => `
              <tr><td><b>${c.name}</b></td><td>${c.league}</td><td>€${c.budget}M</td><td>€${c.wageBudget || 4.5}M</td><td>${(c.positionalNeeds || []).join(', ')}</td><td>${c.strategy || 'Cân bằng'}</td></tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="section-label">📰 Tin đồn chuyển nhượng Châu Âu</div>
      <div class="scroll-list" style="max-height:20vh;">
        ${ts.rumors.map((r) => `<div class="card-item"><div class="card-head"><strong>${r.title}</strong><span class="tag">${r.reliability}</span></div><p class="muted">${r.detail}</p></div>`).join('')}
      </div>`;
  }

  return `
    <div class="card-item" style="padding:7px 10px;margin-bottom:6px;">
      <div class="card-head" style="margin-bottom:0;">
        <span style="font-size:11.5px;font-weight:700;">${ts.getWindowLabel()}</span>
        <span class="tag ok">Quỹ CN: €${state.finance.transferBudget.toFixed(1)}M</span>
      </div>
    </div>
    <div class="tab-strip">
      ${subTabs.map(([k, lbl]) => `<button class="tab-btn ${sub === k ? 'active' : ''}" data-trsub="${k}">${lbl}</button>`).join('')}
    </div>
    ${content}`;
}
