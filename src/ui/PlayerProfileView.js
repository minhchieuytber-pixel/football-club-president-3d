// src/ui/PlayerProfileView.js
// Giao diện Hồ sơ cầu thủ chi tiết 8 tab dùng chung cho Điện thoại, Máy tính macOS, Sơ đồ, Học viện, Chuyển nhượng, Báo cáo tập luyện & NPC 3D.
import { getPlayerPortraitDataUrl } from '../players/PlayerDatabase.js';
import { RELATIONSHIP_METRIC_DEFS, EXTRA_RELATIONSHIP_TARGETS, DRESSING_ROOM_GROUPS, PLAYER_TRAITS, CONFLICT_LEVELS } from '../relations/ClubRelationshipSystem.js';

function attrRow(label, val) {
  const v = Math.max(0, Math.min(99, Math.round(val || 0)));
  const col = v >= 85 ? '#22c55e' : v >= 75 ? '#38bdf8' : v >= 65 ? '#facc15' : '#f87171';
  return `<div class="attr-bar-row"><span class="attr-bar-label">${label}</span><div class="attr-bar-track"><div class="attr-bar-fill" style="width:${v}%;background:${col};"></div></div><span class="attr-bar-val">${v}</span></div>`;
}

function renderValueChartSVG(player, range = '12w') {
  const v = player.valuation;
  const hist = v?.history || [];
  const limitMap = { '4w': 4, '12w': 12, '24w': 24, '52w': 52, 'career': Math.max(1, hist.length) };
  const limit = limitMap[range] || 12;
  const pts = (hist.length ? hist : [{ week: 1, value: player.value || 10, reason: 'Khởi tạo' }]).slice(-Math.max(1, limit));

  const W = 420;
  const H = 115;
  const padX = 24;
  const padY = 16;
  const vals = pts.map((p) => Number(p.value || 0));
  const minVal = Math.max(0, Math.min(...vals) * 0.92);
  const maxVal = Math.max(minVal + 2, Math.max(...vals) * 1.06);

  const coords = pts.map((pt, idx) => {
    const x = pts.length === 1 ? W / 2 : padX + (idx / (pts.length - 1)) * (W - padX * 2);
    const y = H - padY - ((pt.value - minVal) / (maxVal - minVal)) * (H - padY * 2);
    return { x: +x.toFixed(1), y: +y.toFixed(1), pt };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
  const areaPath = coords.length > 1
    ? `${linePath} L${coords[coords.length - 1].x},${H - padY} L${coords[0].x},${H - padY} Z`
    : '';

  const cur = v?.current ?? player.value;
  const delta = v?.delta ?? 0;
  const deltaPct = v?.deltaPct ?? 0;
  const stroke = delta > 0.05 ? '#4ade80' : delta < -0.05 ? '#f87171' : '#facc15';

  return `
    <div class="card-item" style="margin-top:8px;">
      <div class="card-head">
        <strong>📈 Biểu đồ Biến động Giá trị Thị trường</strong>
        <div class="btn-row" style="margin-top:0;">
          ${[['4w', '4W'], ['12w', '12W'], ['24w', '24W'], ['52w', '52W'], ['career', 'Career']].map(([rk, rl]) => `
            <button type="button" class="btn-xs ${range === rk ? 'btn-primary' : 'btn-secondary'}" data-vrange="${rk}" data-pid="${player.id}">${rl}</button>
          `).join('')}
        </div>
      </div>
      <div class="kpi-mini" style="margin-bottom:6px;">
        <span>Giá Thị Trường: <b style="color:#fde68a;">€${cur}M</b></span>
        <span>Giá Đòi Hỏi CLB: <b>€${v?.askingPrice ?? Math.round(cur * 1.15)}M</b></span>
        <span>Tuần qua: <b style="color:${stroke};">${delta >= 0 ? '+' : ''}€${delta}M (${delta >= 0 ? '+' : ''}${deltaPct}%)</b></span>
        <span>Đỉnh / Đáy: <b>€${v?.peak ?? cur}M / €${v?.lowest ?? cur}M</b></span>
      </div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:112px;background:rgba(15,23,42,0.55);border-radius:8px;border:1px solid rgba(255,255,255,0.08);">
        <line x1="${padX}" y1="${padY}" x2="${W - padX}" y2="${padY}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3,3"/>
        <line x1="${padX}" y1="${H - padY}" x2="${W - padX}" y2="${H - padY}" stroke="rgba(255,255,255,0.12)"/>
        ${areaPath ? `<path d="${areaPath}" fill="${stroke}" opacity="0.14" />` : ''}
        ${coords.length > 1 ? `<path d="${linePath}" fill="none" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />` : ''}
        ${coords.map((c) => `<circle cx="${c.x}" cy="${c.y}" r="3.2" fill="${stroke}"><title>Tuần ${c.pt.week}: €${c.pt.value}M (${c.pt.reason || ''})</title></circle>`).join('')}
        <text x="${padX}" y="12" fill="#94a3b8" font-size="9" font-family="sans-serif">Max €${maxVal.toFixed(1)}M</text>
        <text x="${padX}" y="${H - 4}" fill="#94a3b8" font-size="9" font-family="sans-serif">Min €${minVal.toFixed(1)}M · ${pts.length} mốc tuần</text>
      </svg>
      <div class="muted" style="margin-top:4px;font-size:11px;">
        Lý do gần nhất: <b>${v?.lastReason || 'Ổn định'}</b> · Giá trị tiềm năng: <b>€${v?.potentialValue ?? cur}M</b>
        ${(v?.interestedClubs || []).length ? ` · CLB quan tâm: <b>${v.interestedClubs.join(', ')}</b>` : ''}
      </div>
    </div>`;
}

export function renderPlayerProfileHTML(player, activeTab = 'overview', isPsgFirstTeam = false, relExtras = null, chartRange = '12w') {
  const tabs = [
    ['overview', '1. Tổng quan'],
    ['stats', '2. Chỉ số'],
    ['career', '3. Sự nghiệp'],
    ['season', '4. Mùa giải'],
    ['contract', '5. Hợp đồng'],
    ['health', '6. Sức khỏe'],
    ['psychology', '7. Tâm lý'],
    ['history', '8. Lịch sử']
  ];
  const portrait = getPlayerPortraitDataUrl(player);
  const a = player.attributes || {};
  const c = player.career || {};
  const ct = player.contract || {};
  const h = player.health || {};
  const psy = player.psychology || {};

  let tabBody = '';
  if (activeTab === 'overview') {
    tabBody = `
      <div class="grid-2">
        <div class="card-item">
          <div class="section-label" style="margin-top:0;">Thông tin cá nhân</div>
          <p>Mã cầu thủ (playerId): <b><code>${player.id}</code></b></p>
          <p>Ngày sinh / Tuổi: <b>${player.dob || '01/01/2002'} (${player.age} tuổi)</b></p>
          <p>Quốc tịch: <b>${player.nationality}</b> · Chân thuận: <b>${player.foot || 'Phải'}</b></p>
          <p>Thể hình: <b>${player.height || 180} cm · ${player.weight || 74} kg</b></p>
          <p>Vị trí sở trường: <b>${player.position}</b> · Vị trí phụ: <b>${(player.secondaryPositions || []).join(', ') || 'Không'}</b></p>
          <p>CLB / Đội: <b>${player.club}</b> (${player.squadLevel || 'Đội một'}) ${player.shirtNumber ? `· Áo số <b>#${player.shirtNumber}</b>` : ''}</p>
        </div>
        <div class="card-item">
          <div class="section-label" style="margin-top:0;">Đánh giá nhanh</div>
          <div class="kpi-grid">
            <div class="kpi-card"><span>Overall / Potential</span><strong>${player.ovr} / ${player.pot}</strong></div>
            <div class="kpi-card"><span>Giá trị thị trường</span><strong>€${player.value}M</strong></div>
            <div class="kpi-card"><span>Lương tuần</span><strong>€${player.wage}k</strong></div>
            <div class="kpi-card"><span>Hợp đồng còn</span><strong>${player.contractYears} năm</strong></div>
          </div>
          <p class="muted">Vai trò: <b>${psy.squadRole || 'Đội một'}</b> · Phân khúc: <b>${player.tier || 'Chuyên nghiệp'}</b></p>
          ${player.loanInfo ? `<p style="color:#fde68a;">🔄 Đang cho mượn tại <b>${player.loanInfo.loanClub}</b> (CLB gốc: ${player.loanInfo.parentClub})</p>` : ''}
        </div>
      </div>
      ${renderValueChartSVG(player, chartRange)}`;
  } else if (activeTab === 'stats') {
    tabBody = `
      <div class="grid-2">
        <div class="card-item">
          <div class="section-label" style="margin-top:0;">Chỉ số chung</div>
          ${attrRow('Overall Rating', player.ovr)}
          ${attrRow('Potential', player.pot)}
          ${attrRow('Technical Ability', player.tech)}
          ${attrRow('Physical Ability', player.phys)}
          ${attrRow('Mentality', player.mentality)}
          ${attrRow('Consistency', player.consistency)}
          ${attrRow('Professionalism', player.professionalism)}
          ${attrRow('Tư duy chiến thuật', a.training?.tacticalAwareness || player.tact)}
        </div>
        <div class="card-item">
          <div class="section-label" style="margin-top:0;">${player.position === 'GK' ? 'Chỉ số Thủ môn' : ['CB', 'LB', 'RB'].includes(player.position) ? 'Chỉ số Hậu vệ' : ['DM', 'CM', 'AM'].includes(player.position) ? 'Chỉ số Tiền vệ' : 'Chỉ số Tiền đạo'}</div>
          ${player.position === 'GK' ? `
            ${attrRow('Phản xạ', a.gk?.reflexes)}
            ${attrRow('Bắt bóng', a.gk?.handling)}
            ${attrRow('Đổ người', a.gk?.diving)}
            ${attrRow('Phát bóng', a.gk?.kicking)}
            ${attrRow('Chọn vị trí', a.gk?.positioning)}
            ${attrRow('Không chiến', a.gk?.aerial)}
          ` : ['CB', 'LB', 'RB'].includes(player.position) ? `
            ${attrRow('Kèm người', a.def?.marking)}
            ${attrRow('Tắc bóng', a.def?.tackling)}
            ${attrRow('Cắt bóng', a.def?.interceptions)}
            ${attrRow('Tranh chấp', a.def?.duels)}
            ${attrRow('Tốc độ', a.def?.pace)}
            ${attrRow('Chọn vị trí', a.def?.positioning)}
          ` : ['DM', 'CM', 'AM'].includes(player.position) ? `
            ${attrRow('Chuyền ngắn', a.mid?.shortPassing)}
            ${attrRow('Chuyền dài', a.mid?.longPassing)}
            ${attrRow('Tầm nhìn', a.mid?.vision)}
            ${attrRow('Kiểm soát bóng', a.mid?.ballControl)}
            ${attrRow('Giữ bóng', a.mid?.ballRetention)}
            ${attrRow('Thể lực', a.mid?.stamina)}
          ` : `
            ${attrRow('Dứt điểm', a.att?.finishing)}
            ${attrRow('Tốc độ', a.att?.pace)}
            ${attrRow('Rê bóng', a.att?.dribbling)}
            ${attrRow('Chọn vị trí', a.att?.positioning)}
            ${attrRow('Không chiến', a.att?.aerial)}
            ${attrRow('Tạo cơ hội', a.att?.chanceCreation)}
          `}
        </div>
      </div>
      <div class="card-item">
        <div class="section-label" style="margin-top:0;">Chỉ số tập luyện bổ trợ</div>
        <div class="grid-2">
          <div>${attrRow('Tăng tốc', a.training?.acceleration)}${attrRow('Tốc độ bứt tốc', a.training?.sprintSpeed)}${attrRow('Khéo léo', a.training?.agility)}${attrRow('Bình tĩnh', a.training?.composure)}</div>
          <div>${attrRow('Lực sút', a.training?.shotPower)}${attrRow('Sút xa', a.training?.longShots)}${attrRow('Vô-lê', a.training?.volleys)}${attrRow('Chuyền ngắn', a.mid?.shortPassing)}</div>
        </div>
      </div>`;
  } else if (activeTab === 'career') {
    const clubs = c.pastClubs || [];
    tabBody = `
      <div class="kpi-grid">
        <div class="kpi-card"><span>Tổng số trận</span><strong>${c.totalApps || 0}</strong></div>
        <div class="kpi-card"><span>Tổng bàn thắng</span><strong>${c.totalGoals || 0}</strong></div>
        <div class="kpi-card"><span>Tổng kiến tạo</span><strong>${c.totalAssists || 0}</strong></div>
        <div class="kpi-card"><span>Phong độ 5 trận</span><strong>${(c.recentForm5 || []).join(' · ') || '—'}</strong></div>
      </div>
      <div class="card-item">
        <div class="section-label" style="margin-top:0;">CLB từng thi đấu</div>
        <table class="data-table">
          <thead><tr><th>CLB</th><th>Giai đoạn</th><th>Trận</th><th>Bàn</th><th>Kiến tạo</th></tr></thead>
          <tbody>${clubs.map((cl) => `<tr><td><b>${cl.club}</b></td><td>${cl.years}</td><td>${cl.apps}</td><td>${cl.goals}</td><td>${cl.assists}</td></tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="grid-2">
        <div class="card-item"><div class="section-label" style="margin-top:0;">🏆 Danh hiệu</div><p>${(c.trophies || []).length ? c.trophies.map((t) => `• ${t}`).join('<br/>') : 'Chưa có danh hiệu lớn.'}</p></div>
        <div class="card-item"><div class="section-label" style="margin-top:0;">⭐ Thành tích cá nhân</div><p>${(c.awards || []).length ? c.awards.map((t) => `• ${t}`).join('<br/>') : 'Đang tích lũy thành tích cá nhân.'}</p></div>
      </div>`;
  } else if (activeTab === 'season') {
    const ss = c.seasonStats || { apps: player.apps || 0, goals: player.goals || 0, assists: player.assists || 0, avgRating: 7.0, minutes: 0, cleanSheets: 0, yellowCards: 0 };
    tabBody = `
      <div class="kpi-grid">
        <div class="kpi-card"><span>Số trận mùa này</span><strong>${ss.apps}</strong></div>
        <div class="kpi-card"><span>Bàn thắng</span><strong>${ss.goals}</strong></div>
        <div class="kpi-card"><span>Kiến tạo</span><strong>${ss.assists}</strong></div>
        <div class="kpi-card"><span>Điểm trung bình</span><strong>${ss.avgRating}</strong></div>
        <div class="kpi-card"><span>Phút thi đấu</span><strong>${ss.minutes}'</strong></div>
        <div class="kpi-card"><span>Phong độ hiện tại</span><strong>${player.form}/99</strong></div>
      </div>
      <div class="card-item">
        <div class="section-label" style="margin-top:0;">Phong độ 5 trận gần nhất</div>
        <div class="btn-row">${(c.recentForm5 || [7.1, 7.3, 6.9, 7.6, 7.4]).map((r, i) => `<span class="tag ${r >= 7.6 ? 'ok' : r < 6.4 ? 'bad' : ''}">Trận ${i + 1}: ${r}</span>`).join('')}</div>
      </div>`;
  } else if (activeTab === 'contract') {
    tabBody = `
      <div class="kpi-grid">
        <div class="kpi-card"><span>Lương tuần</span><strong>€${ct.weeklyWage ?? player.wage}k</strong></div>
        <div class="kpi-card"><span>Lương năm</span><strong>€${ct.annualWage ?? ((player.wage * 52) / 1000).toFixed(2)}M</strong></div>
        <div class="kpi-card"><span>Giá trị thị trường</span><strong>€${ct.marketValue ?? player.value}M</strong></div>
        <div class="kpi-card"><span>Giá CN dự kiến</span><strong>€${ct.expectedTransferFee ?? Math.round(player.value * 1.15)}M</strong></div>
      </div>
      <div class="card-item">
        <p>Ngày ký hợp đồng: <b>${ct.signedDate || '01/07/2025'}</b> · Ngày hết hạn: <b>${ct.expiryDate || '30/06/2029'}</b> (còn <b>${player.contractYears} năm</b>)</p>
        <p>Điều khoản giải phóng: <b>€${ct.releaseClause || Math.round(player.value * 1.8)}M</b> · Tình trạng gia hạn: <span class="tag ${player.contractYears <= 1 ? 'bad' : 'ok'}">${ct.renewalStatus || 'Ổn định'}</span></p>
        <p>Tiền thưởng: <b>${ct.bonuses || 'Thưởng ra sân & danh hiệu'}</b></p>
        <p>Điều khoản hợp đồng: ${(ct.clauses || []).map((x) => `<span class="tag">${x}</span>`).join(' ') || 'Tiêu chuẩn'}</p>
      </div>`;
  } else if (activeTab === 'health') {
    tabBody = `
      <div class="card-item">
        ${attrRow('Thể lực hiện tại (Fitness)', h.fitness ?? 88)}
        ${attrRow('Thể lực thi đấu (Match Fitness)', h.matchFitness ?? 85)}
        ${attrRow('Mức độ mệt mỏi (Fatigue)', h.fatigue ?? 15)}
        ${attrRow('Nguy cơ chấn thương (%)', h.injuryRisk ?? 8)}
        <p style="margin-top:8px;">Tình trạng chấn thương: ${player.injuryDays > 0 ? `<span class="tag bad">🏥 Chấn thương (${player.injuryDays} ngày · ${h.injuryType || 'Cơ bắp'})</span>` : `<span class="tag ok">💚 Khỏe mạnh, sẵn sàng thi đấu</span>`}</p>
        <p>Nhu cầu phục hồi: ${h.recoveryNeeded ? `<span class="tag bad">⚠️ Cần giảm cường độ tập để tránh quá tải</span>` : `<span class="tag ok">✅ Tốt</span>`}</p>
      </div>`;
  } else if (activeTab === 'psychology') {
    const prof = relExtras?.profile || null;
    const conflict = relExtras?.conflict || null;
    const cmList = relExtras?.commitments || [];
    const traitsStr = prof ? prof.traits.map((k) => PLAYER_TRAITS[k]?.label || k).join(' · ') : 'Chuyên nghiệp';
    const moodStr = prof?.mood || 'Hài lòng';

    tabBody = `
      <div class="card-item">
        <div class="card-head">
          <strong>🧠 Tâm lý & Tính cách cá nhân</strong>
          <span class="tag ${['Rất hài lòng', 'Hài lòng'].includes(moodStr) ? 'ok' : moodStr === 'Thất vọng' ? 'warn' : 'bad'}">${moodStr}</span>
        </div>
        <p style="margin-top:4px;">Tính cách nổi bật: <b>${traitsStr}</b> · Vai trò: <b>${psy.squadRole || 'Đội một'}</b></p>
        <p>Mong muốn tương lai: <i>"${psy.futureDesire || 'Gắn bó và chinh phục danh hiệu lớn.'}"</i></p>
      </div>
      ${prof ? `
        <div class="card-item">
          <div class="section-label" style="margin-top:0;">📊 10 Chỉ số Quan hệ Nội bộ (0–100)</div>
          <div class="grid-2">
            <div>${RELATIONSHIP_METRIC_DEFS.slice(0, 5).map((d) => attrRow(d.label, prof.metrics[d.key])).join('')}</div>
            <div>${RELATIONSHIP_METRIC_DEFS.slice(5).map((d) => attrRow(d.label, prof.metrics[d.key])).join('')}</div>
          </div>
        </div>
        <div class="card-item">
          <div class="section-label" style="margin-top:0;">🌐 Quan hệ đa đối tượng & Tích lũy dài hạn</div>
          <div class="grid-2">
            <div>${EXTRA_RELATIONSHIP_TARGETS.slice(0, 3).map((d) => attrRow(d.label, prof.metrics[d.key] ?? 80)).join('')}</div>
            <div>${EXTRA_RELATIONSHIP_TARGETS.slice(3).map((d) => attrRow(d.label, prof.metrics[d.key] ?? 80)).join('')}</div>
          </div>
          <div class="kpi-mini" style="margin-top:6px;">
            <span>Nhóm PTĐ: <b>${DRESSING_ROOM_GROUPS[prof.dressingRoomGroup] || 'Đội một'}</b></span>
            <span>Tích lũy căng thẳng: <b class="tabular-nums">${prof.tensionScore || 0}/100</b></span>
            <span>Thời gian bất mãn: <b class="tabular-nums">${prof.weeksDissatisfied || 0} tuần (${prof.monthsDissatisfied || 0} tháng)</b></span>
            ${prof.agentProbing ? '<span class="tag bad">Đại diện đang thăm dò bến đỗ</span>' : ''}
            ${prof.lostSpotTo ? `<span class="tag warn">Cạnh tranh vị trí với ${prof.lostSpotTo.playerName}</span>` : ''}
          </div>
          ${Object.values(prof.teammateBonds || {}).length ? `<div class="muted" style="margin-top:6px;">Quan hệ đồng đội nổi bật: ${Object.values(prof.teammateBonds).slice(0, 4).map((b) => `<b>${b.name}</b> (${b.score}/100 · ${b.type === 'rivalry' ? 'Cạnh tranh' : b.type === 'mentor' ? 'Đàn anh' : 'Thân thiết'})`).join(', ')}</div>` : ''}
        </div>
      ` : `
        <div class="card-item">
          ${attrRow('Tinh thần (Morale)', psy.morale ?? player.morale)}
          ${attrRow('Mức độ hài lòng', psy.satisfaction ?? player.satisfaction)}
          ${attrRow('Lòng trung thành', psy.loyalty ?? player.loyalty)}
          ${attrRow('Quan hệ với HLV trưởng', psy.coachRelation ?? 82)}
          ${attrRow('Quan hệ với đồng đội', psy.teammateRelation ?? 84)}
        </div>
      `}
      ${conflict ? `
        <div class="card-item urgent">
          <div class="card-head"><strong>🔥 Mâu thuẫn hiện tại: Cấp ${conflict.level}/5 (${CONFLICT_LEVELS[conflict.level]?.label || ''})</strong><span class="tag bad">${conflict.startedDate}</span></div>
          <p>${conflict.cause}</p>
        </div>` : ''}
      ${cmList.length > 0 ? `
        <div class="card-item">
          <div class="section-label" style="margin-top:0;">🤝 Cam kết của Chủ tịch (${cmList.length})</div>
          ${cmList.map((cm) => `<p>• <b>${cm.content}</b> — <span class="tag">${cm.status}</span> (Hạn Tuần ${cm.deadlineWeek})</p>`).join('')}
        </div>` : ''}`;
  } else {
    const trHist = c.transferHistory || [];
    const injHist = c.injuryHistory || [];
    const loanHist = c.loanHistory || [];
    const devLog = player.developmentLog || [];
    const relEvents = relExtras?.profile?.eventLog || [];
    const monthlyHist = relExtras?.profile?.monthlyHistory || [];
    const formerCoachConflicts = relExtras?.profile?.formerCoachConflicts || [];
    tabBody = `
      <div class="grid-2">
        <div class="card-item">
          <div class="section-label" style="margin-top:0;">🧭 Lịch sử Quan hệ & Mâu thuẫn (${relEvents.length})</div>
          ${relEvents.length ? relEvents.slice(0, 8).map((x) => `<p>• <b>${x.date}</b>: ${x.message}${x.impact ? ` <span class="muted">(${x.impact})</span>` : ''}</p>`).join('') : '<p class="muted">Chưa ghi nhận biến động quan hệ.</p>'}
          ${monthlyHist.length ? `<div class="section-label">🗓️ Diễn biến theo tháng (${monthlyHist.length})</div>${monthlyHist.slice(0, 4).map((mh) => `<p>• <b>${mh.monthKey}</b>: ${mh.mood} · Căng thẳng ${mh.tensionScore} · HLV ${mh.coachAvg}/100</p>`).join('')}` : ''}
          ${formerCoachConflicts.length ? `<div class="section-label">👔 Mâu thuẫn với HLV tiền nhiệm</div>${formerCoachConflicts.map((fc) => `<p>• Với <b>${fc.coachName}</b> (Cấp ${fc.level}): ${fc.cause} (${fc.archivedDate})</p>`).join('')}` : ''}
        </div>
        <div class="card-item">
          <div class="section-label" style="margin-top:0;">📈 Lịch sử phát triển huấn luyện</div>
          ${devLog.length ? devLog.slice(0, 6).map((x) => `<p>• <b>${x.date}</b> (${x.intensity}): <span style="color:#4ade80;">${x.changes.join(', ')}</span></p>`).join('') : '<p class="muted">Chưa ghi nhận biến động chỉ số từ tập luyện.</p>'}
        </div>
      </div>
      <div class="grid-2">
        <div class="card-item">
          <div class="section-label" style="margin-top:0;">🤝 Lịch sử chuyển nhượng</div>
          ${trHist.length ? trHist.map((x) => `<p>• <b>${x.date}</b>: ${x.from} → <b>${x.to}</b> (${x.fee} · ${x.type})</p>`).join('') : '<p class="muted">Chưa có lịch sử chuyển nhượng.</p>'}
        </div>
        <div class="card-item">
          <div class="section-label" style="margin-top:0;">🏥 Chấn thương & 🔄 Cho mượn</div>
          ${injHist.length ? injHist.map((x) => `<p>• ${x.date}: ${x.type} (${x.days} ngày)</p>`).join('') : '<p class="muted">Chưa từng chấn thương nghiêm trọng.</p>'}
          ${loanHist.length ? loanHist.map((x) => `<p>• ${x.season}: ${x.from} → ${x.to}${x.buyOption ? ` (Mua đứt €${x.buyOption}M)` : ''}</p>`).join('') : ''}
        </div>
      </div>`;
  }

  return `
    <div class="profile-hero">
      <img class="profile-avatar" src="${portrait}" alt="${player.name}" />
      <div style="flex:1;min-width:0;">
        <div class="card-head">
          <strong style="font-size:15px;">${player.shirtNumber ? `#${player.shirtNumber} ` : ''}${player.name}</strong>
          <span class="tag ok">OVR ${player.ovr} · POT ${player.pot}</span>
        </div>
        <div class="muted">${player.position} · ${player.age} tuổi · ${player.nationality} · ${player.club} (${player.squadLevel || 'Đội một'})</div>
        <div class="btn-row" style="margin-top:6px;">
          ${isPsgFirstTeam ? `
            <button class="btn-xs btn-primary" id="pp-meet" data-pid="${player.id}">🗣️ Họp riêng</button>
            <button class="btn-xs btn-accent" id="pp-renew" data-pid="${player.id}">✍️ Gia hạn (+2 năm)</button>
          ` : player.club !== 'Paris Saint-Germain' ? `
            <button class="btn-xs btn-primary" id="pp-negotiate" data-pid="${player.id}">🤝 Đàm phán chiêu mộ</button>
          ` : !player.promoted && player.squad ? `
            <button class="btn-xs btn-primary" id="pp-promote" data-pid="${player.id}">⬆️ Đôn lên Đội một PSG</button>
          ` : ''}
        </div>
      </div>
    </div>
    <div class="tab-strip">
      ${tabs.map(([k, lbl]) => `<button class="tab-btn ${activeTab === k ? 'active' : ''}" data-pptab="${k}" data-pid="${player.id}">${lbl}</button>`).join('')}
    </div>
    <div class="scroll-list" style="max-height:46vh;">${tabBody}</div>`;
}
