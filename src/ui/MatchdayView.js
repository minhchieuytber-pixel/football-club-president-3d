// src/ui/MatchdayView.js
// Giao diện Trung tâm MATCHDAY duy nhất (iPhone Portrait + Desktop responsive):
// - Chế độ Trực tiếp (Live Matchday): Bảng tỷ số, đồng hồ phút 0'->90', tốc độ 1x/2x/4x,
//   Tạm dừng/Tiếp tục, Đề xuất thay người từ HLV Trưởng (Chấp nhận/Từ chối),
//   Quyền thay người hợp lệ của Chủ tịch (<=5 lượt, không vào lại), Diễn biến & Thống kê trực tiếp.
// - Chế độ Trung tâm Kết quả (6 màn hình con độc lập):
//   1. Kết quả trận đấu (Diễn biến theo thời gian, Thống kê, MotM, Điểm số từng cầu thủ & từng tuyến GK/DEF/MID/ATT)
//   2. Kết quả vòng đấu (Tất cả các cặp đấu cùng vòng, bấm vào xem chi tiết & quay lại danh sách vòng)
//   3. Bảng xếp hạng (Điểm -> HS -> BT -> Đối đầu -> Tên, ▲/▼, form 5 trận W/D/L, nổi bật PSG)
//   4. Báo cáo Ban huấn luyện (5 báo cáo chuyên môn tách biệt + duyệt đề xuất HLV Trưởng)
//   5. Tin tức sau trận (Bài báo & bình luận không trùng lặp, bấm đọc chi tiết & quay lại tin tức)
//   6. Đội hình & Chiến thuật – Chỉ xem (100% do CoachMatchAI quyết định, Chủ tịch chỉ xem, KHÔNG có nút sửa)

import { getClubLogoDataUrl } from '../matchday/ClubLogoFactory.js';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function crestImg(clubName, color = null, size = 34) {
  const url = getClubLogoDataUrl(clubName, color);
  return `<img class="md-crest" src="${url}" alt="${esc(clubName)}" style="width:${size}px;height:${size}px;" />`;
}

function renderStatsBarRow(label, leftVal, rightVal, isPct = false) {
  const lNum = parseFloat(leftVal) || 0;
  const rNum = parseFloat(rightVal) || 0;
  const tot = lNum + rNum;
  const lPct = tot > 0 ? Math.round((lNum / tot) * 100) : 50;
  return `
    <div class="md-stat-row">
      <span class="md-stat-val tabular-nums">${esc(leftVal)}${isPct ? '%' : ''}</span>
      <div class="md-stat-mid">
        <div class="md-stat-lbl">${esc(label)}</div>
        <div class="md-stat-track">
          <div class="md-stat-fill-home" style="width:${lPct}%;"></div>
        </div>
      </div>
      <span class="md-stat-val tabular-nums">${esc(rightVal)}${isPct ? '%' : ''}</span>
    </div>`;
}

function renderEventsFeedHTML(events = []) {
  if (!events.length) {
    return '<div class="muted" style="padding:8px 0;">Chưa có tình huống đáng chú ý nào được ghi nhận.</div>';
  }
  const ordered = [...events].sort((a, b) => a.minute - b.minute || (a.seq || 0) - (b.seq || 0));
  return ordered.map((e) => {
    const sideCls = e.type === 'goal' ? 'ev-goal' : e.type === 'red' ? 'ev-red' : e.type === 'injury' ? 'ev-inj' : e.type === 'sub' ? 'ev-sub' : '';
    return `
      <div class="md-ev-item ${sideCls}">
        <span class="md-ev-min tabular-nums">${e.minute}'</span>
        <span class="md-ev-txt">${esc(e.text)}</span>
      </div>`;
  }).join('');
}

// 6. Đội hình & Chiến thuật – Chỉ xem (Khóa hoàn toàn chỉnh sửa đội hình trước trận!)
function renderLineupReadOnlyHTML(plan, titleNote = 'Đội hình & Chiến thuật chính thức do HLV Trưởng quyết định') {
  if (!plan) return '<div class="card-item">Chưa có dữ liệu đội hình Matchday.</div>';
  const starters = plan.starters || [];
  const bench = plan.bench || [];
  const unavailable = plan.unavailable || [];
  const unused = plan.unused || [];

  return `
    <div class="card-item md-lock-banner">
      <div class="card-head">
        <strong>🔒 ${esc(titleNote)}</strong>
        <span class="tag ok">${esc(plan.formation)} · Chỉ xem</span>
      </div>
      <div class="muted">${esc(plan.lockNote || 'Trước trận, toàn bộ sơ đồ, đá chính, dự bị & băng đội trưởng do HLV Trưởng và Ban huấn luyện toàn quyền quyết định.')}</div>
      <div class="kpi-mini" style="margin-top:6px;">
        <span>HLV Trưởng: <b>${esc(plan.coachName)}</b></span>
        <span>Chiến thuật: <b>${esc(plan.tacticName)}</b></span>
        <span>Đội trưởng: <b>${esc(plan.captainName || '--')} (C)</b></span>
        <span>Phù hợp AI: <b style="color:#4ade80;">${plan.avgSuitability ?? 85}/100</b></span>
      </div>
    </div>

    <div class="card-item">
      <div class="section-label" style="margin-top:0;">🧠 Lý do chuyên môn của Ban huấn luyện</div>
      <ul class="mem-list" style="color:#e2e8f0;line-height:1.5;">
        ${(plan.coachRationale || []).map((r) => `<li>${esc(r)}</li>`).join('')}
      </ul>
    </div>

    <div class="md-lineup-grid">
      <div class="card-item md-pitch-readonly">
        <div class="section-label" style="margin-top:0;">🏟️ Sơ đồ ${esc(plan.formation)} (Chỉ xem)</div>
        <div class="md-mini-pitch">
          <div class="md-pitch-midline"></div>
          <div class="md-pitch-circle"></div>
          ${starters.map((s) => `
            <div class="md-pitch-node" style="left:${s.formationX ?? 50}%;top:${s.formationY ?? 50}%;">
              <div class="md-node-badge">
                #${esc(s.shirtNumber)}${s.isCaptain ? '<span class="md-cap-c">C</span>' : ''}
              </div>
              <div class="md-node-name">${esc(s.name.split(' ').slice(-1)[0])}</div>
              <div class="md-node-role">${esc(s.assignedRole)} · ${s.ovr}</div>
            </div>`).join('')}
        </div>
      </div>

      <div class="card-item">
        <div class="section-label" style="margin-top:0;">📋 Danh sách 11 cầu thủ đá chính</div>
        <div class="md-roster-list">
          ${starters.map((s) => `
            <div class="md-roster-row">
              <div class="md-roster-main">
                <span class="tag">${esc(s.assignedRole)}</span>
                <b>#${esc(s.shirtNumber)} ${esc(s.name)}${s.isCaptain ? ' ©' : ''}</b>
              </div>
              <div class="muted">OVR <b>${s.ovr}</b> · TL ${Math.round(s.fitness ?? 90)}% · PĐ ${s.form ?? 76} · ${esc(s.selectionReason || 'Đúng sở trường')}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card-item">
        <div class="section-label" style="margin-top:0;">🪑 Băng ghế dự bị (${bench.length})</div>
        ${bench.length ? bench.map((b) => `
          <div class="md-roster-row">
            <div class="md-roster-main"><span class="tag">${esc(b.position)}</span><b>#${esc(b.shirtNumber)} ${esc(b.name)}</b></div>
            <div class="muted">OVR ${b.ovr} · TL ${Math.round(b.fitness ?? 90)}% · ${esc(b.benchNote || 'Dự bị')}</div>
          </div>`).join('') : '<div class="muted">Không có cầu thủ dự bị.</div>'}
      </div>

      <div class="card-item">
        <div class="section-label" style="margin-top:0;">🚫 Vắng mặt & Không sử dụng (${unavailable.length + unused.length})</div>
        ${unavailable.map((u) => `
          <div class="md-roster-row">
            <div class="md-roster-main"><span class="tag bad">${esc(u.status)}</span><b>#${esc(u.shirtNumber)} ${esc(u.name)}</b> (${esc(u.position)})</div>
            <div class="muted">${esc(u.detail)}</div>
          </div>`).join('')}
        ${unused.slice(0, 8).map((u) => `
          <div class="md-roster-row">
            <div class="md-roster-main"><span class="tag">${esc(u.position)}</span><b>#${esc(u.shirtNumber)} ${esc(u.name)}</b></div>
            <div class="muted">${esc(u.reason)}</div>
          </div>`).join('')}
        ${unavailable.length + unused.length === 0 ? '<div class="muted">Toàn bộ cầu thủ đều góp mặt trong danh sách đăng ký.</div>' : ''}
      </div>
    </div>`;
}

// Giao diện 1 trận đấu đang diễn ra trực tiếp (Live Matchday)
function renderLiveMatchdayHTML(session, state, uiState) {
  const fx = session.fixture;
  const hClub = state.clubs.find((c) => c.name === session.homeClubName);
  const aClub = state.clubs.find((c) => c.name === session.awayClubName);
  const st = session.stats;
  const liveSubTab = uiState.mdLiveTab || 'events'; // 'events' | 'subs' | 'lineup'

  const pendSug = session.pendingSubSuggestion;
  const availBench = (session.bench || []).filter(
    (b) => !session.subbedInIds.includes(b.playerId) && !session.subbedOutIds.includes(b.playerId)
  );
  const pitchCandidates = (session.activeStarters || []).filter((s) => !s.redCarded && !s.injuredOut);

  return `
    <div class="md-root" data-md-mode="live">
      <div class="md-scoreboard">
        <div class="md-comp-row">
          <span class="tag bad">● TRỰC TIẾP · ${esc(fx.comp)}</span>
          <span class="muted">${esc(fx.round)} · 🏟️ ${esc(fx.stadium)}</span>
        </div>
        <div class="md-teams-bar">
          <div class="md-team-col">
            ${crestImg(session.homeClubName, hClub?.color, 40)}
            <div class="md-team-name">${esc(session.homeClubName)}</div>
          </div>
          <div class="md-score-center">
            <div class="md-score-nums tabular-nums">${session.homeGoals} - ${session.awayGoals}</div>
            <div class="md-min-pill tabular-nums">${session.minute}' / 90' ${session.paused ? '· ⏸️ TẠM DỪNG' : ''}</div>
          </div>
          <div class="md-team-col">
            ${crestImg(session.awayClubName, aClub?.color, 40)}
            <div class="md-team-name">${esc(session.awayClubName)}</div>
          </div>
        </div>
        <div class="md-live-controls">
          <button type="button" class="btn-xs ${session.paused ? 'btn-primary' : 'btn-secondary'}" id="md-live-pause">
            ${session.paused ? '▶️ Tiếp tục' : '⏸️ Tạm dừng'}
          </button>
          ${[1, 2, 4].map((spd) => `
            <button type="button" class="btn-xs ${session.speed === spd ? 'btn-primary' : 'btn-secondary'} md-live-spd" data-spd="${spd}">
              ${spd}x
            </button>`).join('')}
          <button type="button" class="btn-xs btn-accent" id="md-live-finish">⏩ Hoàn tất & Xem Kết quả</button>
        </div>
      </div>

      ${pendSug ? `
        <div class="card-item urgent md-sug-banner">
          <div class="card-head">
            <strong>👔 ĐỀ XUẤT THAY NGƯỜI TỪ HLV ${esc(session.plan.coachName)} (${pendSug.minute}')</strong>
            <span class="tag warn">Chờ Chủ tịch duyệt</span>
          </div>
          <p>${esc(pendSug.reason)}</p>
          <div class="btn-row">
            <button type="button" class="btn-primary" id="md-sug-accept">✅ Chấp nhận (${esc(pendSug.inName)} thay ${esc(pendSug.outName)})</button>
            <button type="button" class="btn-secondary" id="md-sug-reject">❌ Từ chối & Giữ nguyên</button>
          </div>
        </div>` : ''}

      <div class="tab-strip">
        <button type="button" class="tab-btn ${liveSubTab === 'events' ? 'active' : ''}" data-mdlivetab="events">📋 Diễn biến & Thống kê</button>
        <button type="button" class="tab-btn ${liveSubTab === 'subs' ? 'active' : ''}" data-mdlivetab="subs">🔄 Thay người (${session.subsUsed}/${session.maxSubs})</button>
        <button type="button" class="tab-btn ${liveSubTab === 'lineup' ? 'active' : ''}" data-mdlivetab="lineup">👕 Đội hình (Chỉ xem)</button>
      </div>

      ${liveSubTab === 'events' ? `
        <div class="grid-2">
          <div class="card-item">
            <div class="section-label" style="margin-top:0;">⏱️ Diễn biến trực tiếp</div>
            <div class="scroll-list" style="max-height:260px;">${renderEventsFeedHTML(session.events)}</div>
          </div>
          <div class="card-item">
            <div class="section-label" style="margin-top:0;">📊 Thông số trực tiếp</div>
            ${renderStatsBarRow('Kiểm soát bóng', st.homePoss, st.awayPoss, true)}
            ${renderStatsBarRow('Tổng cú sút', st.homeShots, st.awayShots)}
            ${renderStatsBarRow('Sút trúng đích', st.homeOnTarget, st.awayOnTarget)}
            ${renderStatsBarRow('xG (Bàn thắng kỳ vọng)', st.homeXg, st.awayXg)}
            ${renderStatsBarRow('Cơ hội lớn', st.homeBigChances, st.awayBigChances)}
            ${renderStatsBarRow('Thẻ vàng / Đỏ', `${st.homeYellow}/${st.homeRed}`, `${st.awayYellow}/${st.awayRed}`)}
          </div>
        </div>` : ''}

      ${liveSubTab === 'subs' ? `
        <div class="card-item">
          <div class="card-head">
            <strong>🔄 Quyền thay người trong trận của Chủ tịch</strong>
            <span class="tag ${session.subsUsed >= session.maxSubs ? 'bad' : 'ok'}">Đã dùng ${session.subsUsed}/${session.maxSubs}</span>
          </div>
          <p class="muted">Trong trận đấu đang diễn ra, Chủ tịch có thể phê duyệt tối đa 5 lượt thay người hợp lệ. Cầu thủ đã rời sân hoặc nhận thẻ đỏ không thể vào lại.</p>
          ${session.subsUsed >= session.maxSubs || availBench.length === 0 ? `
            <div class="tag bad" style="margin-top:6px;">${session.subsUsed >= session.maxSubs ? 'Đã sử dụng hết 5/5 lượt thay người.' : 'Không còn cầu thủ dự bị khả dụng.'}</div>
          ` : `
            <div class="grid-2" style="margin-top:8px;">
              <div class="form-row">
                <label>Cầu thủ rời sân (đang thi đấu):</label>
                <select id="md-sub-out" class="input-ctrl">
                  ${pitchCandidates.map((p) => `<option value="${p.slotIndex}">#${p.shirtNumber} ${esc(p.name)} (${esc(p.assignedRole)} · TL ${Math.round(p.liveStamina)}% · ${p.liveRating.toFixed(1)}đ${p.yellowCard ? ' 🟨' : ''})</option>`).join('')}
                </select>
              </div>
              <div class="form-row">
                <label>Cầu thủ dự bị vào sân:</label>
                <select id="md-sub-in" class="input-ctrl">
                  ${availBench.map((b) => `<option value="${b.playerId}">#${b.shirtNumber} ${esc(b.name)} (${esc(b.position)} · OVR ${b.ovr})</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="btn-row" style="margin-top:8px;">
              <button type="button" class="btn-primary" id="md-do-sub">✅ Thực hiện thay người ngay</button>
            </div>
          `}
          ${session.subRecords.length > 0 ? `
            <div class="section-label">Nhật ký thay người trận này</div>
            ${session.subRecords.map((r) => `<div class="muted">• ${r.minute}' — <b>${esc(r.inName)}</b> vào thay <b>${esc(r.outName)}</b> (${esc(r.note)})</div>`).join('')}
          ` : ''}
        </div>` : ''}

      ${liveSubTab === 'lineup' ? renderLineupReadOnlyHTML(session.plan, 'Đội hình đang thi đấu (Khóa đội hình trước trận)') : ''}
    </div>`;
}

// Màn hình 1: Kết quả trận đấu (dùng chung cho trận PSG & chi tiết các trận vòng đấu)
function renderMatchResultSubViewHTML(res, showBackToRound = false) {
  if (!res) return '<div class="card-item">Chưa có dữ liệu trận đấu.</div>';
  const fx = res.fixture || {};
  const st = res.stats || {};
  const ratings = res.ratings || [];
  const lineRatings = res.lineRatings || { GK: '-', DEF: '-', MID: '-', ATT: '-' };
  const isCompanion = !!res.isCompanionMatch;

  return `
    ${showBackToRound ? `
      <div class="btn-row" style="margin-bottom:8px;">
        <button type="button" class="btn-secondary" id="md-back-to-round">← Quay lại Kết quả vòng đấu</button>
      </div>` : ''}
    <div class="card-item ${res.psgWon === false && !isCompanion ? 'urgent' : ''}">
      <div class="card-head">
        <span class="tag">${esc(fx.comp)} · ${esc(fx.round)}</span>
        <span class="muted">🏟️ ${esc(fx.stadium || res.homeClub?.stadium || '')} · 📅 ${esc(fx.date || '')}</span>
      </div>
      <div class="md-teams-bar" style="margin:8px 0;">
        <div class="md-team-col">
          ${crestImg(fx.home, res.homeClub?.color, 44)}
          <div class="md-team-name">${esc(fx.home)}</div>
        </div>
        <div class="md-score-center">
          <div class="md-score-nums tabular-nums">${res.homeGoals} - ${res.awayGoals}</div>
          ${res.penalties ? `<div class="tag ok">Luân lưu: ${res.penalties.home}-${res.penalties.away} (${esc(res.penalties.winner)})</div>` : '<div class="muted">Chung cuộc (90\')</div>'}
        </div>
        <div class="md-team-col">
          ${crestImg(fx.away, res.awayClub?.color, 44)}
          <div class="md-team-name">${esc(fx.away)}</div>
        </div>
      </div>
      ${res.motm ? `<div style="text-align:center;" class="muted">⭐ Cầu thủ xuất sắc nhất (MotM): <b style="color:#fde68a;">${esc(res.motm.name)} (${res.motm.rating} điểm)</b></div>` : ''}
    </div>

    ${res.awardedTrophy ? `
      <div class="card-item urgent" style="border:2px solid #d4af37;background:linear-gradient(135deg,rgba(0,32,91,0.92),rgba(212,175,55,0.22));text-align:center;">
        <strong style="color:#fde68a;font-size:14.5px;">🏆 VÔ ĐỊCH ${esc(res.awardedTrophy.competitionName).toUpperCase()} (${esc(res.awardedTrophy.seasonName)})!</strong>
        <p style="margin:4px 0;">Chiếc cúp mới đã tự động cập nhật vào Bảo tàng Truyền thống PSG.</p>
      </div>` : ''}

    <div class="grid-2">
      <div class="card-item">
        <div class="section-label" style="margin-top:0;">⏱️ Diễn biến trận đấu (${res.events?.length || 0})</div>
        <div class="scroll-list" style="max-height:240px;">${renderEventsFeedHTML(res.events)}</div>
      </div>
      <div class="card-item">
        <div class="section-label" style="margin-top:0;">📊 Thống kê chi tiết</div>
        ${renderStatsBarRow('Kiểm soát bóng', st.homePoss ?? 50, st.awayPoss ?? 50, true)}
        ${renderStatsBarRow('Tổng cú sút', st.homeShots ?? 0, st.awayShots ?? 0)}
        ${renderStatsBarRow('Sút trúng đích', st.homeOnTarget ?? 0, st.awayOnTarget ?? 0)}
        ${renderStatsBarRow('xG (Bàn thắng kỳ vọng)', st.homeXg ?? 0, st.awayXg ?? 0)}
        ${renderStatsBarRow('Cơ hội lớn', st.homeBigChances ?? 0, st.awayBigChances ?? 0)}
        ${renderStatsBarRow('Cứu thua thủ môn', st.homeSaves ?? 0, st.awaySaves ?? 0)}
        ${renderStatsBarRow('Phạt góc', st.homeCorners ?? 0, st.awayCorners ?? 0)}
        ${renderStatsBarRow('Phạm lỗi', st.homeFouls ?? 0, st.awayFouls ?? 0)}
      </div>
    </div>

    ${!isCompanion ? `
      <div class="card-item">
        <div class="section-label" style="margin-top:0;">📈 Đánh giá từng tuyến PSG</div>
        <div class="kpi-grid" style="margin-bottom:0;">
          <div class="kpi-card"><span>Thủ môn (GK)</span><strong class="tabular-nums">${lineRatings.GK}</strong></div>
          <div class="kpi-card"><span>Hậu vệ (DEF)</span><strong class="tabular-nums">${lineRatings.DEF}</strong></div>
          <div class="kpi-card"><span>Tiền vệ (MID)</span><strong class="tabular-nums">${lineRatings.MID}</strong></div>
          <div class="kpi-card"><span>Tiền đạo (ATT)</span><strong class="tabular-nums">${lineRatings.ATT}</strong></div>
        </div>
      </div>` : ''}

    <div class="card-item">
      <div class="section-label" style="margin-top:0;">⭐ Điểm số cầu thủ (${ratings.length})</div>
      <div class="table-wrap" style="max-height:230px;">
        <table class="data-table">
          <thead><tr><th>Cầu thủ</th><th>VT</th><th>Phút</th><th>Điểm</th><th>G / A</th><th>Nhận xét</th></tr></thead>
          <tbody>
            ${ratings.map((r) => `
              <tr>
                <td><b>${esc(r.name)}</b>${r.yellowCard ? ' 🟨' : ''}${r.redCard ? ' 🟥' : ''}</td>
                <td>${esc(r.assignedRole || r.position)}</td>
                <td class="tabular-nums">${r.minutes ?? 90}'</td>
                <td class="tabular-nums"><b style="color:${r.rating >= 7.6 ? '#4ade80' : r.rating < 6.2 ? '#f87171' : '#fff'}">${r.rating}</b></td>
                <td class="tabular-nums">${r.goals}/${r.assists}</td>
                <td>${esc(r.note || (r.goals > 0 ? 'Ghi bàn' : 'Thi đấu ổn định'))}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

// Màn hình 2: Kết quả vòng đấu (chạm bất kỳ trận nào để xem chi tiết)
function renderRoundResultsSubViewHTML(matchResult, state, uiState) {
  const sys = state.matchdaySystem;
  const rk = uiState.mdRoundKey || matchResult?.fixture?.roundKey;
  if (uiState.mdDetailMatchId) {
    const det = sys.getMatchRecord(uiState.mdDetailMatchId);
    if (det) return renderMatchResultSubViewHTML(det, true);
  }
  const roundList = sys.getFixturesForRound(rk);
  const compTitle = matchResult?.fixture ? `${matchResult.fixture.comp} · ${matchResult.fixture.round}` : 'Vòng đấu hiện tại';

  return `
    <div class="card-item">
      <div class="card-head">
        <strong>🏟️ Toàn bộ kết quả ${esc(compTitle)} (${roundList.length} trận)</strong>
        <span class="tag ok">Bấm từng trận để xem chi tiết</span>
      </div>
      <div class="muted">Tất cả các trận đấu cùng vòng đều được xử lý thống nhất bởi hệ thống Matchday.</div>
    </div>
    <div class="grid-2">
      ${roundList.map((fx) => {
        const mId = fx.matchId || fx.id;
        const hClub = state.clubs.find((c) => c.name === fx.home);
        const aClub = state.clubs.find((c) => c.name === fx.away);
        const isPsgMatch = fx.home === 'Paris Saint-Germain' || fx.away === 'Paris Saint-Germain';
        const done = !!fx.played;
        return `
          <button type="button" class="card-item md-round-match-card ${isPsgMatch ? 'is-psg' : ''}" data-mdmid="${esc(mId)}">
            <div class="card-head">
              <span class="tag ${done ? 'ok' : ''}">${done ? 'Đã kết thúc' : esc(fx.time || '20:00')}</span>
              <span class="muted">${esc(fx.date || '')}</span>
            </div>
            <div class="md-round-row">
              <span class="md-round-team">${crestImg(fx.home, hClub?.color, 22)} <b>${esc(fx.home)}</b></span>
              <span class="md-round-score tabular-nums">${done ? `${fx.homeGoals} - ${fx.awayGoals}` : 'vs'}</span>
              <span class="md-round-team" style="justify-content:flex-end;"><b>${esc(fx.away)}</b> ${crestImg(fx.away, aClub?.color, 22)}</span>
            </div>
          </button>`;
      }).join('')}
    </div>`;
}

// Màn hình 3: Bảng xếp hạng (Tie-breaker đầy đủ, ▲/▼, Form 5 trận, Highlight PSG)
function renderStandingsSubViewHTML(state) {
  const rows = state.matchdaySystem.getStandings('Ligue 1');
  return `
    <div class="card-item">
      <div class="card-head">
        <strong>📊 Bảng Xếp Hạng Ligue 1 · Mùa ${esc(state.season)}</strong>
        <span class="tag ok">Cập nhật tự động sau vòng đấu</span>
      </div>
      <div class="muted">Tiêu chí xếp hạng: Điểm → Hiệu số (HS) → Bàn thắng (BT) → Đối đầu trực tiếp → Tên CLB.</div>
    </div>
    <div class="table-wrap" style="max-height:52vh;">
      <table class="data-table">
        <thead>
          <tr><th>#</th><th>±</th><th>Câu lạc bộ</th><th>Tr</th><th>T</th><th>H</th><th>B</th><th>BT/BB</th><th>HS</th><th>Điểm</th><th>5 trận</th></tr>
        </thead>
        <tbody>
          ${rows.map((r) => {
            const deltaHtml = r.rankDelta > 0
              ? `<span style="color:#4ade80;font-weight:800;">▲${r.rankDelta}</span>`
              : r.rankDelta < 0
                ? `<span style="color:#f87171;font-weight:800;">▼${Math.abs(r.rankDelta)}</span>`
                : '<span class="muted">—</span>';
            const formHtml = r.form5.length
              ? r.form5.map((f) => `<span class="md-form-dot f-${f}">${f}</span>`).join('')
              : '<span class="muted">—</span>';
            return `
              <tr class="${r.isPsg ? 'highlight-row' : ''}">
                <td class="tabular-nums"><b>${r.rank}</b></td>
                <td class="tabular-nums">${deltaHtml}</td>
                <td><div style="display:flex;align-items:center;gap:6px;">${crestImg(r.name, r.color, 20)}<b>${esc(r.name)}</b></div></td>
                <td class="tabular-nums">${r.played}</td>
                <td class="tabular-nums">${r.won}</td>
                <td class="tabular-nums">${r.drawn}</td>
                <td class="tabular-nums">${r.lost}</td>
                <td class="tabular-nums">${r.gf}/${r.ga}</td>
                <td class="tabular-nums">${r.gd >= 0 ? `+${r.gd}` : r.gd}</td>
                <td class="tabular-nums"><b style="color:#fde68a;">${r.pts}</b></td>
                <td><div class="md-form-strip">${formHtml}</div></td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

// Màn hình 4: 5 Báo cáo chuyên môn Ban Huấn Luyện
function renderStaffReportsSubViewHTML(matchResult, uiState) {
  const reports = matchResult?.staffReports;
  if (!reports) return '<div class="card-item">Chưa có báo cáo Ban huấn luyện cho trận đấu này.</div>';
  const keys = reports.orderedKeys || ['head_coach', 'tactical_analyst', 'fitness_coach', 'goalkeeper_coach', 'player_development'];
  const activeKey = keys.includes(uiState.mdReportKey) ? uiState.mdReportKey : keys[0];
  const rep = reports[activeKey];

  return `
    <div class="tab-strip">
      ${keys.map((k) => `<button type="button" class="tab-btn ${activeKey === k ? 'active' : ''}" data-mdrep="${k}">${esc(reports[k].title)}</button>`).join('')}
    </div>
    <div class="card-item">
      <div class="card-head">
        <div>
          <strong style="font-size:14.5px;">${esc(rep.title)}</strong>
          <div class="muted">${esc(rep.author)} · ${esc(rep.role)}</div>
        </div>
        <span class="tag ok">${esc(rep.verdictBadge)}</span>
      </div>
      <p style="line-height:1.55;margin-top:8px;">${esc(rep.summary)}</p>
      <div class="section-label">Điểm nhấn phân tích</div>
      <ul class="mem-list" style="color:#e2e8f0;line-height:1.5;">
        ${(rep.highlights || []).map((h) => `<li>${esc(h)}</li>`).join('')}
      </ul>
      <div class="section-label">Khuyến nghị hành động</div>
      <ul class="mem-list" style="color:#fde68a;line-height:1.5;">
        ${(rep.recommendations || []).map((rc) => `<li>${esc(rc)}</li>`).join('')}
      </ul>
      ${Array.isArray(rep.proposals) && rep.proposals.length > 0 ? `
        <div class="section-label">Đề xuất trình Chủ tịch</div>
        ${rep.proposals.map((pr) => `
          <div class="card-item" style="margin-top:6px;">
            <div class="card-head"><span>${esc(pr.text)}</span><span class="tag">${esc(pr.status)}</span></div>
            ${pr.status === 'Chờ duyệt' ? `
              <div class="btn-row">
                <button type="button" class="btn-xs btn-primary md-prop-act" data-prid="${esc(pr.id)}" data-act="Đã phê duyệt">✅ Phê duyệt</button>
                <button type="button" class="btn-xs btn-danger md-prop-act" data-prid="${esc(pr.id)}" data-act="Đã từ chối">❌ Từ chối</button>
              </div>` : ''}
          </div>`).join('')}` : ''}
    </div>`;
}

// Màn hình 5: Tin tức sau trận (không trùng lặp, xem chi tiết & quay lại Tin tức)
function renderPostMatchNewsSubViewHTML(matchResult, state, uiState) {
  const articles = state.matchdaySystem.getPostMatchNews(matchResult?.matchId);
  if (uiState.mdArticleId) {
    const art = articles.find((a) => a.id === uiState.mdArticleId) || (state.newsArchive || []).find((a) => a.id === uiState.mdArticleId);
    if (art) {
      art.read = true;
      return `
        <div class="btn-row" style="margin-bottom:8px;">
          <button type="button" class="btn-secondary" id="md-news-back">← Quay lại Tin tức sau trận</button>
        </div>
        <div class="card-item">
          <img src="${art.image}" alt="${esc(art.title)}" style="width:100%;max-height:200px;object-fit:cover;border-radius:10px;margin-bottom:8px;" />
          <div class="card-head"><span class="tag">${esc(art.outlet)} · ${esc(art.category)}</span><span class="tag ok">${esc(art.tagType)}</span></div>
          <h3 style="margin:6px 0;font-size:15.5px;">${esc(art.title)}</h3>
          <div class="muted" style="margin-bottom:8px;">${esc(art.date)} · ❤️ ${Number(art.likes || 0).toLocaleString('vi-VN')}</div>
          <p style="line-height:1.6;">${esc(art.body)}</p>
        </div>
        <div class="section-label">💬 Bình luận người hâm mộ & giới chuyên môn (${(art.comments || []).length})</div>
        ${(art.comments || []).map((c) => `<div class="card-item"><b>${esc(c.user)}</b>: ${esc(c.text)}</div>`).join('')}`;
    }
  }

  return `
    <div class="card-item">
      <div class="card-head">
        <strong>📰 Truyền thông & Phản ứng sau trận (${articles.length} bài)</strong>
        <span class="tag ok">Đồng bộ với TV & Máy tính Chủ tịch</span>
      </div>
    </div>
    ${articles.length === 0 ? '<div class="card-item">Chưa có bài báo sau trận nào.</div>' : `
      <div class="grid-2">
        ${articles.map((a) => `
          <button type="button" class="card-item md-news-card" data-mdart="${esc(a.id)}" style="text-align:left;cursor:pointer;color:inherit;">
            <img src="${a.image}" alt="${esc(a.title)}" loading="lazy" style="width:100%;height:104px;object-fit:cover;border-radius:8px;margin-bottom:6px;" />
            <div class="card-head"><span class="tag">${esc(a.outlet)}</span><span class="muted">${esc(a.tagType)}</span></div>
            <div style="font-weight:700;font-size:12.5px;margin:4px 0;color:#fff;">${esc(a.title)}</div>
            <p class="muted">${esc(a.summary)}</p>
          </button>`).join('')}
      </div>`}`;
}

export function renderMatchdayHubHTML(state, uiState = {}) {
  const sys = state.matchdaySystem;
  const live = sys.liveSession;

  if (live && !live.finished) {
    return renderLiveMatchdayHTML(live, state, uiState);
  }

  const targetMatchId = uiState.mdMatchId || sys.getUnreadMatchdayId() || sys.activeMatchdayId || state.lastMatchResult?.matchId;
  const matchResult = targetMatchId ? sys.getMatchRecord(targetMatchId) : state.lastMatchResult;

  if (!matchResult) {
    const nextFx = state.getCurrentWeekFixture() || state.getNextFixture();
    if (!nextFx) {
      return `
        <div class="card-item urgent" style="text-align:center;">
          <h3>🏆 Đã hoàn tất toàn bộ lịch thi đấu mùa giải ${esc(state.season)}!</h3>
          <p class="muted">Chủ tịch có thể tổng kết mùa giải để trao cúp và bước sang mùa mới.</p>
          <button type="button" class="btn-primary" id="md-conclude-season">🏆 Tổng kết mùa giải ngay</button>
        </div>`;
    }
    const fxClubH = state.clubs.find((c) => c.name === nextFx.home);
    const fxClubA = state.clubs.find((c) => c.name === nextFx.away);
    return `
      <div class="md-root" data-md-mode="prematch">
        <div class="card-item urgent">
          <div class="card-head">
            <span class="tag">${esc(nextFx.comp)} · ${esc(nextFx.round)}</span>
            <span class="muted">📅 ${esc(nextFx.date)} · ⏰ ${esc(nextFx.time)}</span>
          </div>
          <div class="md-teams-bar" style="margin:10px 0;">
            <div class="md-team-col">${crestImg(nextFx.home, fxClubH?.color, 42)}<div class="md-team-name">${esc(nextFx.home)}</div></div>
            <div class="md-score-center"><div class="md-score-nums">VS</div><div class="muted">🏟️ ${esc(nextFx.stadium)}</div></div>
            <div class="md-team-col">${crestImg(nextFx.away, fxClubA?.color, 42)}<div class="md-team-name">${esc(nextFx.away)}</div></div>
          </div>
          <div class="btn-row" style="justify-content:center;">
            <button type="button" class="btn-primary" id="md-start-live">⚽ Bắt đầu Matchday trực tiếp</button>
            <button type="button" class="btn-accent" id="md-sim-instant">⏩ Mô phỏng trọn vẹn & Xem Kết quả</button>
          </div>
        </div>
        <div class="card-item">
          <div class="muted">🔒 <b>Ghi chú chuyên môn:</b> Trước trận đấu, Chủ tịch không can thiệp sắp xếp đội hình hay chiến thuật. Toàn bộ 11 đá chính và dự bị do HLV Trưởng <b>${esc(state.coach?.name || 'PSG')}</b> tự chủ quyết định khi bóng lăn.</div>
        </div>
      </div>`;
  }

  const subTab = uiState.mdSubTab || 'result';
  const tabs = [
    ['result', '🏁 Kết quả trận'],
    ['round', '🏟️ Kết quả vòng'],
    ['standings', '📊 Bảng xếp hạng'],
    ['reports', '👔 Báo cáo BHL (5)'],
    ['news', '📰 Tin sau trận'],
    ['lineup', '👕 Đội hình (Chỉ xem)']
  ];

  let bodyHtml = '';
  if (subTab === 'result') bodyHtml = renderMatchResultSubViewHTML(matchResult, false);
  else if (subTab === 'round') bodyHtml = renderRoundResultsSubViewHTML(matchResult, state, uiState);
  else if (subTab === 'standings') bodyHtml = renderStandingsSubViewHTML(state);
  else if (subTab === 'reports') bodyHtml = renderStaffReportsSubViewHTML(matchResult, uiState);
  else if (subTab === 'news') bodyHtml = renderPostMatchNewsSubViewHTML(matchResult, state, uiState);
  else if (subTab === 'lineup') bodyHtml = renderLineupReadOnlyHTML(matchResult.plan);

  return `
    <div class="md-root" data-md-mode="hub">
      <div class="tab-strip md-tabs-sticky">
        ${tabs.map(([id, label]) => `<button type="button" class="tab-btn ${subTab === id ? 'active' : ''}" data-mdtab="${id}">${label}</button>`).join('')}
      </div>
      <div class="md-hub-body">${bodyHtml}</div>
      <div class="md-footer-bar">
        <button type="button" class="btn-primary" id="md-continue-club" style="flex:1;">🏢 Tiếp tục quản lý CLB</button>
      </div>
    </div>`;
}

export function bindMatchdayViewEvents(state, uiState, callbacks) {
  const { refresh, closeMatchday, concludeSeason, onToast, onAudio } = callbacks;
  const sys = state.matchdaySystem;

  document.getElementById('md-conclude-season')?.addEventListener('click', () => {
    concludeSeason?.();
  });

  document.getElementById('md-start-live')?.addEventListener('click', () => {
    const fx = state.getCurrentWeekFixture() || state.getNextFixture();
    if (!fx) return;
    sys.startLiveMatchday(fx);
    uiState.mdLiveTab = 'events';
    onAudio?.('whistle');
    refresh?.({ skipHistory: true });
  });

  document.getElementById('md-sim-instant')?.addEventListener('click', () => {
    const fx = state.getCurrentWeekFixture() || state.getNextFixture();
    if (!fx) return;
    const res = sys.simulateMatchComplete(fx);
    if (res) {
      uiState.mdMatchId = res.matchId;
      uiState.mdSubTab = 'result';
      uiState.mdDetailMatchId = null;
      uiState.mdArticleId = null;
      onAudio?.('whistle');
      refresh?.({ skipHistory: true });
    }
  });

  // Live controls
  document.getElementById('md-live-pause')?.addEventListener('click', () => {
    if (!sys.liveSession) return;
    sys.liveSession.paused = !sys.liveSession.paused;
    onAudio?.('click');
    refresh?.({ skipHistory: true, preserveScroll: true });
  });

  document.querySelectorAll('.md-live-spd').forEach((b) => {
    b.addEventListener('click', () => {
      if (!sys.liveSession) return;
      sys.liveSession.speed = Number(b.dataset.spd) || 1;
      onAudio?.('click');
      refresh?.({ skipHistory: true, preserveScroll: true });
    });
  });

  document.getElementById('md-live-finish')?.addEventListener('click', () => {
    const res = sys.finishLiveMatchImmediately();
    if (res) {
      uiState.mdMatchId = res.matchId;
      uiState.mdSubTab = 'result';
      uiState.mdDetailMatchId = null;
      uiState.mdArticleId = null;
      onAudio?.('whistle');
      refresh?.({ skipHistory: true });
    }
  });

  document.getElementById('md-sug-accept')?.addEventListener('click', () => {
    const res = sys.acceptCoachSubSuggestion();
    if (res.ok) {
      onAudio?.('success');
      onToast?.(`✅ Đã duyệt thay người: ${res.record.inName} vào thay ${res.record.outName}`, 'success');
    } else {
      onToast?.(res.reason || 'Không thể thay người.', 'error');
    }
    refresh?.({ skipHistory: true, preserveScroll: true });
  });

  document.getElementById('md-sug-reject')?.addEventListener('click', () => {
    sys.rejectCoachSubSuggestion();
    onAudio?.('click');
    onToast?.('Đã giữ nguyên đội hình hiện tại.', 'info');
    refresh?.({ skipHistory: true, preserveScroll: true });
  });

  document.querySelectorAll('[data-mdlivetab]').forEach((b) => {
    b.addEventListener('click', () => {
      uiState.mdLiveTab = b.dataset.mdlivetab;
      onAudio?.('click');
      refresh?.({ skipHistory: true });
    });
  });

  document.getElementById('md-do-sub')?.addEventListener('click', () => {
    const slotIdx = Number(document.getElementById('md-sub-out')?.value);
    const inId = document.getElementById('md-sub-in')?.value;
    const res = sys.performChairmanLiveSub(slotIdx, inId);
    if (res.ok) {
      onAudio?.('success');
      onToast?.(`🔄 Thay người: ${res.record.inName} vào thay ${res.record.outName}!`, 'success');
    } else {
      onAudio?.('alert');
      onToast?.(res.reason || 'Thao tác thay người không hợp lệ.', 'error');
    }
    refresh?.({ skipHistory: true, preserveScroll: true });
  });

  // Hub 6 sub-tabs
  document.querySelectorAll('[data-mdtab]').forEach((b) => {
    b.addEventListener('click', () => {
      uiState.mdSubTab = b.dataset.mdtab;
      uiState.mdDetailMatchId = null;
      uiState.mdArticleId = null;
      onAudio?.('click');
      refresh?.({ skipHistory: true });
    });
  });

  // Round match click -> view detail without closing Matchday
  document.querySelectorAll('.md-round-match-card').forEach((b) => {
    b.addEventListener('click', () => {
      uiState.mdDetailMatchId = b.dataset.mdmid;
      onAudio?.('click');
      refresh?.({ skipHistory: true });
    });
  });
  document.getElementById('md-back-to-round')?.addEventListener('click', () => {
    uiState.mdDetailMatchId = null;
    onAudio?.('click');
    refresh?.({ skipHistory: true });
  });

  // 5 coaching staff report sub-tabs
  document.querySelectorAll('[data-mdrep]').forEach((b) => {
    b.addEventListener('click', () => {
      uiState.mdReportKey = b.dataset.mdrep;
      onAudio?.('click');
      refresh?.({ skipHistory: true });
    });
  });
  document.querySelectorAll('.md-prop-act').forEach((b) => {
    b.addEventListener('click', () => {
      const mId = uiState.mdMatchId || sys.activeMatchdayId || state.lastMatchResult?.matchId;
      const res = sys.getMatchRecord(mId);
      const pr = res?.staffReports?.head_coach?.proposals?.find((x) => x.id === b.dataset.prid);
      if (pr) {
        pr.status = b.dataset.act;
        onAudio?.('success');
        onToast?.(`Đã cập nhật đề xuất HLV: ${pr.status}`, 'success');
        refresh?.({ skipHistory: true, preserveScroll: true });
      }
    });
  });

  // Post-match news detail & back
  document.querySelectorAll('.md-news-card').forEach((b) => {
    b.addEventListener('click', () => {
      uiState.mdArticleId = b.dataset.mdart;
      onAudio?.('click');
      refresh?.({ skipHistory: true });
    });
  });
  document.getElementById('md-news-back')?.addEventListener('click', () => {
    uiState.mdArticleId = null;
    onAudio?.('click');
    refresh?.({ skipHistory: true });
  });

  // Close Matchday -> Continue managing club
  document.getElementById('md-continue-club')?.addEventListener('click', () => {
    const mId = uiState.mdMatchId || sys.activeMatchdayId || state.lastMatchResult?.matchId;
    if (mId) sys.markMatchdayRead(mId);
    closeMatchday?.();
  });
}

// Giao diện Ứng dụng Lịch thi đấu & Bảng xếp hạng trên Máy tính Chủ tịch (đồng bộ 100% với Matchday)
export function renderLeaguesComputerTabHTML(state) {
  const sys = state.matchdaySystem;
  const rows = sys.getStandings('Ligue 1');
  const upcoming = state.fixtures.filter((f) => !f.played && !f.skippedEliminated).slice(0, 4);
  const recentDone = state.fixtures.filter((f) => f.played).slice(-4).reverse();

  return `
    <div class="card-item">
      <div class="card-head">
        <strong>⚽ Trung tâm Lịch thi đấu & Matchday PSG</strong>
        <button type="button" class="btn-xs btn-primary" id="lg-open-matchday">🏟️ Mở Trung tâm Matchday</button>
      </div>
      <div class="muted">Mọi trận đấu của PSG và toàn giải Ligue 1 đều do hệ thống Matchday duy nhất xử lý tự động theo lịch thi đấu thực.</div>
    </div>

    <div class="section-label">📅 Lịch thi đấu sắp tới của PSG</div>
    <div class="grid-2" style="margin-bottom:8px;">
      ${upcoming.length ? upcoming.map((f, i) => `
        <div class="card-item">
          <div class="card-head"><span class="tag">${esc(f.comp)}</span><span class="muted">${esc(f.date)} · ${esc(f.time)}</span></div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
            ${crestImg(f.home, null, 20)} <b>${esc(f.home)}</b> vs <b>${esc(f.away)}</b> ${crestImg(f.away, null, 20)}
          </div>
          ${i === 0 ? `<button type="button" class="btn-xs btn-primary" id="lg-play-now" style="margin-top:6px;">⚽ Vào Matchday trận kế tiếp</button>` : ''}
        </div>`).join('') : '<div class="card-item">Đã hoàn thành lịch thi đấu mùa này.</div>'}
    </div>

    ${recentDone.length > 0 ? `
      <div class="section-label">🏁 Kết quả gần nhất (Bấm để xem lại báo cáo Matchday)</div>
      <div class="grid-2" style="margin-bottom:8px;">
        ${recentDone.map((f) => `
          <button type="button" class="card-item lg-open-res" data-mid="${esc(f.matchId || f.id)}" style="text-align:left;cursor:pointer;color:inherit;">
            <div class="card-head"><span class="tag ok">${esc(f.comp)} · ${esc(f.round)}</span><span class="muted">${esc(f.date)}</span></div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
              <span>${esc(f.home)}</span>
              <b class="tabular-nums">${f.homeGoals} - ${f.awayGoals}</b>
              <span>${esc(f.away)}</span>
            </div>
          </button>`).join('')}
      </div>` : ''}

    <div class="section-label">📊 Bảng xếp hạng Ligue 1</div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>#</th><th>±</th><th>CLB</th><th>Trận</th><th>T</th><th>H</th><th>B</th><th>HS</th><th>Điểm</th><th>5 trận</th></tr></thead>
        <tbody>
          ${rows.map((r) => {
            const deltaHtml = r.rankDelta > 0 ? `<span style="color:#4ade80;">▲${r.rankDelta}</span>` : r.rankDelta < 0 ? `<span style="color:#f87171;">▼${Math.abs(r.rankDelta)}</span>` : '—';
            return `
              <tr class="${r.isPsg ? 'highlight-row' : ''}">
                <td class="tabular-nums">${r.rank}</td>
                <td class="tabular-nums">${deltaHtml}</td>
                <td><div style="display:flex;align-items:center;gap:6px;">${crestImg(r.name, r.color, 18)}<b>${esc(r.name)}</b></div></td>
                <td class="tabular-nums">${r.played}</td>
                <td class="tabular-nums">${r.won}</td>
                <td class="tabular-nums">${r.drawn}</td>
                <td class="tabular-nums">${r.lost}</td>
                <td class="tabular-nums">${r.gd >= 0 ? `+${r.gd}` : r.gd}</td>
                <td class="tabular-nums"><b>${r.pts}</b></td>
                <td><div class="md-form-strip">${r.form5.map((x) => `<span class="md-form-dot f-${x}">${x}</span>`).join('')}</div></td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}
