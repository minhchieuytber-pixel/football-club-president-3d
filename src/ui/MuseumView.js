// src/ui/MuseumView.js
// Giao diện HTML cho Bảo tàng Truyền thống & Danh hiệu PSG (5 khu trưng bày, chi tiết Cúp 3D, Huyền thoại, Mùa giải & Lễ Đăng Quang)
import {
  COMPETITION_CATALOG,
  PSG_HISTORY_TIMELINE,
  PSG_LEGENDS
} from '../trophies/TrophyDatabase.js';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderMuseumHubHTML(state, activeTab = 'history') {
  const ts = state.trophySystem;
  const careerCount = ts ? ts.getTotalCareerTrophies() : 0;
  const totalClubCount = ts ? ts.getTotalClubTrophies() : 53;
  const domesticCareer = ts ? ts.getByCategory('domestic') : [];
  const intlCareer = ts ? ts.getByCategory('international') : [];
  const archives = ts ? ts.seasonArchives : [];

  const completedPsgDeals = (state.transferSystem?.completedDeals || []).filter((d) => d.to === 'Paris Saint-Germain');
  const individualHonors = [
    { year: '2025', award: 'Ballon d\'Or & Cầu thủ Xuất sắc nhất FIFA', winner: 'Ousmane Dembélé', detail: 'Vinh danh mùa giải ăn ba lịch sử cùng UEFA Champions League 2025 của Paris Saint-Germain.' },
    { year: '2024', award: 'Vua phá lưới Ligue 1 (6 mùa liên tiếp)', winner: 'Kylian Mbappé', detail: 'Kỷ lục ghi 256 bàn thắng mọi đấu trường trong màu áo PSG (2017–2024).' },
    { year: '2021 & 2023', award: 'Quả bóng Vàng Thế giới tại Parc des Princes', winner: 'Lionel Messi', detail: 'Hai danh hiệu Ballon d\'Or gắn liền với quãng thời gian thi đấu cho Paris Saint-Germain.' },
    { year: '2013–2016', award: '3x Cầu thủ Xuất sắc nhất Ligue 1 (UNFP)', winner: 'Zlatan Ibrahimović', detail: '3 lần giành danh hiệu Vua phá lưới Ligue 1 và đặt nền móng kỷ nguyên thống trị quốc nội.' },
    { year: '1995', award: 'Ballon d\'Or Châu Âu', winner: 'George Weah', detail: 'Chân sút kiệt xuất đưa PSG vào Bán kết Champions League 1995 trước khi đoạt Quả bóng Vàng.' }
  ];
  const iconicSignings = [
    { year: '2017', player: 'Neymar Jr', from: 'FC Barcelona', fee: '€222M', note: 'Thương vụ kỷ lục thế giới nâng tầm thương hiệu PSG lên quy mô toàn cầu.' },
    { year: '2017', player: 'Kylian Mbappé', from: 'AS Monaco', fee: '€180M', note: 'Thần đồng bóng đá Pháp trở thành chân sút vĩ đại nhất lịch sử CLB.' },
    { year: '2012', player: 'Zlatan Ibrahimović & Thiago Silva', from: 'AC Milan', fee: '€63M', note: 'Cặp chữ ký biểu tượng mở đầu kỷ nguyên thống trị bóng đá Pháp.' },
    { year: '2023', player: 'Ousmane Dembélé', from: 'FC Barcelona', fee: '€50M', note: 'Ngòi nổ chủ lực giúp PSG đăng quang UEFA Champions League 2025.' }
  ];

  const subTabs = [
    ['history', '📜 1. Lịch Sử & Thành Tích'],
    ['domestic', `🇫🇷 2. Cúp Quốc Nội (${domesticCareer.length})`],
    ['international', `🌍 3. Cúp Quốc Tế (${intlCareer.length})`],
    ['legends', `⭐ 4. Huyền Thoại & Áo Đấu (${PSG_LEGENDS.length})`],
    ['awards', `🏅 5. Giải Cá Nhân & Hợp Đồng (${individualHonors.length + completedPsgDeals.length})`],
    ['seasons', `📚 6. Đội Hình Qua Các Mùa (${archives.length})`]
  ];

  const renderTrophyCards = (list, catKey) => {
    const comps = Object.values(COMPETITION_CATALOG).filter((c) => c.category === catKey);
    const countersHtml = `
      <div class="grid-2" style="margin-bottom:10px;">
        ${comps.map((c) => {
          const wonNow = list.filter((t) => t.competitionId === c.competitionId).length;
          return `
            <div class="card-item" style="border-left:3px solid ${c.accentColor};">
              <div class="card-head">
                <strong>🏆 ${esc(c.competitionName)}</strong>
                <span class="tag ${wonNow > 0 ? 'ok' : ''}">Tổng CLB: ${c.heritageCountPre2026 + wonNow} (+${wonNow} mới)</span>
              </div>
              <p class="muted" style="margin:4px 0 0;">${esc(c.description)}</p>
            </div>`;
        }).join('')}
      </div>`;

    if (list.length === 0) {
      return `
        ${countersHtml}
        <div class="card-item" style="text-align:center;padding:18px;">
          <strong>🏛️ Bệ Vinh Danh Đang Sẵn Sàng Chờ Đón Chiếc Cúp Mới</strong>
          <p class="muted" style="margin-top:6px;">
            Chưa có danh hiệu mới nào được bổ sung trong triều đại Chủ tịch ${esc(state.president?.name || 'Phạm Minh Chiêu')}.
            Cúp 3D chỉ được tạo và trưng bày tự động khi Paris Saint-Germain thực sự vô địch giải đấu chính thức!
          </p>
        </div>`;
    }

    const cardsHtml = list.slice().reverse().map((t) => `
      <div class="card-item ${t.isNewHighlight ? 'urgent' : ''}">
        <div class="card-head">
          <strong>🏆 ${esc(t.competitionName)} · Mùa ${esc(t.seasonName)}</strong>
          <div>
            ${t.isNewHighlight ? '<span class="tag ok" style="margin-right:4px;">MỚI</span>' : ''}
            <span class="tag">${esc(t.winningDate)}</span>
          </div>
        </div>
        <div class="muted" style="margin:4px 0;">
          📍 ${esc(t.displayLocation)} · 👔 HLV: <b>${esc(t.winningManagerName)}</b> · 👥 Đội hình vô địch: <b>${t.squadSnapshot?.length || 0} cầu thủ</b>
        </div>
        <p style="margin:4px 0;">${esc(t.finalMatchText)}</p>
        <div class="btn-row" style="margin-top:6px;">
          <button class="btn-xs btn-primary mus-open-trophy" data-tid="${esc(t.trophyId)}">🔍 Xem Cúp, Thông Tin & Đội Hình Vô Địch</button>
        </div>
      </div>`).join('');

    return `${countersHtml}<div class="section-label">Danh hiệu đã chinh phục trong sự nghiệp (${list.length})</div>${cardsHtml}`;
  };

  let bodyHtml = '';
  if (activeTab === 'history') {
    bodyHtml = `
      <div class="card-item" style="background:linear-gradient(135deg, rgba(0,32,91,0.78), rgba(15,23,42,0.92));border-color:#d4af37;">
        <div class="card-head">
          <strong>🏛️ PARIS SAINT-GERMAIN · FONDÉ EN 1970</strong>
          <span class="tag ok">Tổng di sản: ${totalClubCount} danh hiệu</span>
        </div>
        <p>Ra đời ngày 12/08/1970 tại thủ đô Paris, Paris Saint-Germain đã vươn mình thành thế lực hàng đầu bóng đá Pháp và châu Âu với thánh địa Parc des Princes.</p>
        <div class="kpi-mini">
          <span>Năm thành lập: <b>1970</b></span>
          <span>Sân nhà: <b>Parc des Princes</b></span>
          <span>Danh hiệu sự nghiệp (2026+): <b>${careerCount}</b></span>
        </div>
      </div>
      <div class="section-label">Dòng thời gian phát triển & Thành tích lịch sử PSG</div>
      ${PSG_HISTORY_TIMELINE.map((m) => `
        <div class="card-item">
          <div class="card-head"><strong>📌 ${esc(m.year)} · ${esc(m.title)}</strong><span class="tag">${esc(m.generation)}</span></div>
          <p>${esc(m.summary)}</p>
        </div>`).join('')}`;
  } else if (activeTab === 'domestic') {
    bodyHtml = renderTrophyCards(domesticCareer, 'domestic');
  } else if (activeTab === 'international') {
    bodyHtml = renderTrophyCards(intlCareer, 'international');
  } else if (activeTab === 'legends') {
    bodyHtml = `
      <div class="section-label">⭐ Phòng Vinh Danh Huyền Thoại & Áo Đấu Biểu Tượng PSG</div>
      <div class="grid-2">
        ${PSG_LEGENDS.map((l) => `
          <div class="card-item">
            <div class="card-head">
              <strong>⭐ #${l.shirtNumber} ${esc(l.name)}</strong>
              <span class="tag">${esc(l.era)}</span>
            </div>
            <div class="muted">${esc(l.position)} · ${esc(l.nationality)} · ${esc(l.apps)} trận / ${esc(l.goals)} bàn</div>
            <div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
              <span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:7px;background:${esc(l.jerseyColor || '#00205b')};border:1.5px solid #da291c;font-weight:800;font-size:11px;color:#fff;">#${l.shirtNumber}</span>
              <span class="muted">Áo đấu lưu niệm #${l.shirtNumber} · ${esc(l.trophies)}</span>
            </div>
            <p class="muted" style="margin:0 0 6px;">${esc(l.contribution)}</p>
            <button class="btn-xs btn-secondary mus-open-legend" data-lid="${esc(l.legendId)}">🏅 Xem bảng vinh danh</button>
          </div>`).join('')}
      </div>`;
  } else if (activeTab === 'awards') {
    bodyHtml = `
      <div class="section-label">🏅 Giải Thưởng Cá Nhân Cao Quý Trong Lịch Sử PSG</div>
      <div class="grid-2" style="margin-bottom:10px;">
        ${individualHonors.map((aw) => `
          <div class="card-item">
            <div class="card-head"><strong>${esc(aw.winner)}</strong><span class="tag ok">${esc(aw.year)}</span></div>
            <div class="card-sub">${esc(aw.award)}</div>
            <p class="muted">${esc(aw.detail)}</p>
          </div>`).join('')}
      </div>
      <div class="section-label">✍️ Những Bản Hợp Đồng Đáng Nhớ & Tân Binh Triều Đại Mới</div>
      ${completedPsgDeals.length > 0 ? `
        <div class="grid-2" style="margin-bottom:8px;">
          ${completedPsgDeals.slice(0, 6).map((d) => `
            <div class="card-item urgent">
              <div class="card-head"><strong>${esc(d.playerName)} (${esc(d.from)} → PSG)</strong><span class="tag ok">€${d.fee}M · ${esc(d.date)}</span></div>
              <p class="muted">Bản hợp đồng chính thức dưới triều đại Chủ tịch ${esc(state.president?.name || 'Phạm Minh Chiêu')}.</p>
            </div>`).join('')}
        </div>` : ''}
      <div class="grid-2">
        ${iconicSignings.map((sg) => `
          <div class="card-item">
            <div class="card-head"><strong>${esc(sg.player)} (${esc(sg.year)})</strong><span class="tag">${esc(sg.fee)}</span></div>
            <div class="muted">Từ: ${esc(sg.from)}</div>
            <p class="muted">${esc(sg.note)}</p>
          </div>`).join('')}
      </div>`;
  } else {
    bodyHtml = `
      <div class="section-label">📸 Lưu Trữ Đội Hình & Hồ Sơ Từng Mùa Giải PSG (${archives.length} mùa)</div>
      ${archives.map((arc) => `
        <div class="card-item">
          <div class="card-head">
            <strong>📚 Mùa giải ${esc(arc.season)}</strong>
            <span class="tag ${arc.trophyNames?.length ? 'ok' : ''}">${arc.trophyNames?.length ? arc.trophyNames.join(' · ') : '0 danh hiệu'}</span>
          </div>
          <div class="muted" style="margin:4px 0;">
            🏛️ Chủ tịch: <b>${esc(arc.presidentName)}</b> · 👔 HLV: <b>${esc(arc.coachName)}</b> · 📊 ${esc(arc.psgRank)} · 💶 ${esc(arc.revenue)}
          </div>
          ${arc.notableMatches?.length ? `<p class="muted" style="margin:4px 0;">⚽ Trận nổi bật: ${esc(arc.notableMatches[0])}</p>` : ''}
          <div class="btn-row" style="margin-top:6px;">
            <button class="btn-xs btn-primary mus-open-season" data-season="${esc(arc.season)}">📋 Xem đội hình & hồ sơ mùa ${esc(arc.season)}</button>
          </div>
        </div>`).join('')}`;
  }

  return `
    <div class="card-item" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;border-color:#d4af37;">
      <div>
        <strong style="font-size:15px;color:#fde68a;">🏛️ PARIS SAINT-GERMAIN CLUB MUSEUM</strong>
        <div class="muted">Phòng Truyền Thống & Bảo Tàng Danh Hiệu 3D · Tổng: <b>${totalClubCount}</b> danh hiệu (${careerCount} mới từ triều đại ${esc(state.president?.name || 'Chủ tịch')})</div>
      </div>
      <button class="btn-xs btn-accent" id="mus-walk-3d">🚶 Tham quan Bảo tàng 3D trực tiếp</button>
    </div>
    <div class="btn-row" style="margin:8px 0;flex-wrap:wrap;">
      ${subTabs.map(([k, lbl]) => `
        <button class="btn-xs ${activeTab === k ? 'btn-primary' : 'btn-secondary'} mus-tab-btn" data-mustab="${k}">${lbl}</button>
      `).join('')}
    </div>
    ${bodyHtml}`;
}

export function renderTrophyDetailHTML(trophy, state) {
  const squad = Array.isArray(trophy.squadSnapshot) ? trophy.squadSnapshot : [];
  return `
    <div class="card-item urgent" style="border-color:#d4af37;text-align:center;">
      <div class="tag ok">${trophy.category === 'domestic' ? 'DANH HIỆU QUỐC NỘI' : 'DANH HIỆU QUỐC TẾ'} · ${esc(trophy.seasonName)}</div>
      <h2 style="margin:8px 0 4px;color:#fde68a;">🏆 ${esc(trophy.competitionName.toUpperCase())}</h2>
      <div class="muted">Paris Saint-Germain · Ngày đăng quang: <b>${esc(trophy.winningDate)}</b></div>
      <div class="kpi-mini" style="justify-content:center;margin-top:8px;">
        <span>👔 HLV trưởng: <b>${esc(trophy.winningManagerName)}</b></span>
        <span>🏛️ Chủ tịch: <b>${esc(trophy.presidentName)}</b></span>
        <span>📍 Vị trí: <b>${esc(trophy.displayLocation)}</b></span>
      </div>
    </div>
    <div class="card-item">
      <strong>📖 Ghi chép lịch sử & Trận quyết định</strong>
      <p style="margin:6px 0 4px;"><b>Dấu ấn:</b> ${esc(trophy.finalMatchText)}</p>
      <p class="muted" style="margin:0;">${esc(trophy.historicalDescription)}</p>
    </div>
    <div class="section-label">👥 Đội hình Vô địch được khắc tên bất biến (${squad.length} cầu thủ)</div>
    <div class="table-wrap" style="max-height:240px;">
      <table class="data-table">
        <thead><tr><th>Số áo</th><th>Cầu thủ</th><th>VT</th><th>OVR</th><th>G/A mùa</th><th>Hồ sơ</th></tr></thead>
        <tbody>
          ${squad.map((p) => {
            const livePlayer = state?.getPlayerById ? state.getPlayerById(p.playerId) : null;
            return `
              <tr>
                <td><b>#${p.shirtNumber || '-'}</b></td>
                <td><b>${esc(p.name)}</b>${p.isCaptain ? ' <span class="tag ok">(C)</span>' : ''}</td>
                <td>${esc(p.position)}</td>
                <td>${p.ovr || '-'}</td>
                <td>${p.goals ?? 0}/${p.assists ?? 0}</td>
                <td>${livePlayer
                  ? `<button class="btn-xs btn-secondary open-profile-btn" data-pid="${esc(p.playerId)}">🔍 Hồ sơ</button>`
                  : '<span class="muted">Lưu trữ lịch sử</span>'}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="btn-row" style="margin-top:10px;">
      <button class="btn-primary" id="td-open-museum">🏛️ Mở Toàn Cảnh Bảo Tàng PSG</button>
      <button class="btn-secondary" id="td-close">Đóng</button>
    </div>`;
}

export function renderLegendDetailHTML(legend) {
  return `
    <div class="card-item" style="border-color:#d4af37;">
      <div class="card-head">
        <strong>⭐ HUYỀN THOẠI PARIS SAINT-GERMAIN · SỐ ÁO #${legend.shirtNumber}</strong>
        <span class="tag ok">${esc(legend.era)}</span>
      </div>
      <h2 style="margin:8px 0 4px;color:#fde68a;">${esc(legend.name)}</h2>
      <div class="kpi-mini" style="margin:6px 0;">
        <span>Vị trí: <b>${esc(legend.position)}</b></span>
        <span>Quốc tịch: <b>${esc(legend.nationality)}</b></span>
        <span>Số trận: <b>${esc(legend.apps)}</b></span>
        <span>Bàn thắng: <b>${esc(legend.goals)}</b></span>
      </div>
      <p><b>Danh hiệu & Thành tích nổi bật:</b> ${esc(legend.trophies)}</p>
      <p class="muted"><b>Đóng góp cho PSG:</b> ${esc(legend.contribution)}</p>
    </div>
    <div class="btn-row" style="margin-top:8px;">
      <button class="btn-primary" id="lgd-open-museum">🏛️ Xem toàn bộ Phòng Huyền Thoại</button>
      <button class="btn-secondary" id="lgd-close">Đóng</button>
    </div>`;
}

export function renderSeasonArchiveDetailHTML(archive, state) {
  const squad = Array.isArray(archive.squadSnapshot) ? archive.squadSnapshot : [];
  return `
    <div class="card-item" style="border-color:#d4af37;">
      <div class="card-head">
        <strong>📚 HỒ SƠ MÙA GIẢI ${esc(archive.season)}</strong>
        <span class="tag ${archive.trophyNames?.length ? 'ok' : ''}">${archive.trophyNames?.length ? `${archive.trophyNames.length} danh hiệu` : '0 danh hiệu'}</span>
      </div>
      <div class="kpi-mini" style="margin:6px 0;">
        <span>🏛️ Chủ tịch: <b>${esc(archive.presidentName)}</b></span>
        <span>👔 HLV trưởng: <b>${esc(archive.coachName)}</b></span>
        <span>📊 Thứ hạng Ligue 1: <b>${esc(archive.psgRank)}</b></span>
        <span>💶 Doanh thu: <b>${esc(archive.revenue)}</b></span>
      </div>
      <p style="margin:6px 0;"><b>Danh hiệu giành được:</b> ${archive.trophyNames?.length ? esc(archive.trophyNames.join(', ')) : 'Không có danh hiệu chính thức'}</p>
      <p class="muted" style="margin:4px 0;"><b>Vô địch Ligue 1:</b> ${esc(archive.ligue1Winner)} · <b>Vô địch UCL:</b> ${esc(archive.uclWinner)}</p>
      ${archive.topScorer ? `<p class="muted" style="margin:4px 0;">⚽ Vua phá lưới PSG: <b>${esc(archive.topScorer)}</b>${archive.topAssister ? ` · Kiến tạo: <b>${esc(archive.topAssister)}</b>` : ''}</p>` : ''}
    </div>
    ${archive.notableMatches?.length ? `
      <div class="section-label">⚡ Những trận đấu đáng nhớ mùa ${esc(archive.season)}</div>
      <div class="card-item">
        ${archive.notableMatches.map((m) => `<p style="margin:3px 0;">• ${esc(m)}</p>`).join('')}
      </div>` : ''}
    <div class="section-label">👥 Đội hình PSG mùa giải ${esc(archive.season)} (${squad.length} cầu thủ)</div>
    <div class="table-wrap" style="max-height:220px;">
      <table class="data-table">
        <thead><tr><th>#</th><th>Cầu thủ</th><th>VT</th><th>OVR</th><th>G/A</th><th>Hồ sơ</th></tr></thead>
        <tbody>
          ${squad.map((p) => {
            const livePlayer = state?.getPlayerById ? state.getPlayerById(p.playerId) : null;
            return `
              <tr>
                <td>#${p.shirtNumber || '-'}</td>
                <td><b>${esc(p.name)}</b>${p.isCaptain ? ' (C)' : ''}</td>
                <td>${esc(p.position)}</td>
                <td>${p.ovr || '-'}</td>
                <td>${p.goals ?? 0}/${p.assists ?? 0}</td>
                <td>${livePlayer
                  ? `<button class="btn-xs btn-secondary open-profile-btn" data-pid="${esc(p.playerId)}">🔍 Hồ sơ</button>`
                  : '<span class="muted">Lưu trữ</span>'}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="btn-row" style="margin-top:8px;">
      <button class="btn-primary" id="sa-open-museum">🏛️ Quay lại Phòng Mùa Giải</button>
      <button class="btn-secondary" id="sa-close">Đóng</button>
    </div>`;
}

export function renderCoronationModalHTML(trophy) {
  return `
    <div class="card-item urgent" style="background:linear-gradient(145deg, rgba(0,32,91,0.92), rgba(212,175,55,0.22));border:2px solid #d4af37;text-align:center;padding:18px;">
      <div style="font-size:46px;line-height:1.1;">🏆✨🎉</div>
      <div class="tag ok" style="margin-top:6px;">LỄ ĐĂNG QUANG CHÍNH THỨC · PARIS SAINT-GERMAIN</div>
      <h2 style="margin:8px 0 4px;color:#fde68a;font-size:21px;">CHÚC MỪNG VÔ ĐỊCH ${esc(trophy.competitionName.toUpperCase())} ${esc(trophy.seasonName)}!</h2>
      <p style="margin:6px 0;">${esc(trophy.finalMatchText)}</p>
      <div class="kpi-mini" style="justify-content:center;margin:10px 0;">
        <span>📅 Ngày đăng quang: <b>${esc(trophy.winningDate)}</b></span>
        <span>👔 HLV: <b>${esc(trophy.winningManagerName)}</b></span>
        <span>👥 Khắc tên: <b>${trophy.squadSnapshot?.length || 0} cầu thủ</b></span>
      </div>
      <div class="card-item" style="background:rgba(15,23,42,0.72);margin-top:10px;">
        <strong>🏛️ Cập nhật tự động vào PARIS SAINT-GERMAIN CLUB MUSEUM</strong>
        <p class="muted" style="margin:4px 0 0;">
          Chiếc cúp 3D đã được đưa lên <b>${esc(trophy.displayLocation)}</b> với vòng sáng vinh danh <b>"MỚI"</b>, đồng thời phát sóng trên TV Phòng Chủ tịch & trang nhất Báo chí PSG!
        </p>
      </div>
      <div class="btn-row" style="justify-content:center;margin-top:12px;">
        <button class="btn-primary" id="cor-go-museum">🏛️ Đến Bảo Tàng PSG Chiêm Ngưỡng Cúp Mới</button>
        <button class="btn-accent" id="cor-inspect">🔍 Xem Chi Tiết Cúp & Đội Hình</button>
        <button class="btn-secondary" id="cor-skip">⏭️ Bỏ qua hiệu ứng</button>
      </div>
    </div>`;
}
