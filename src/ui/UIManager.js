import { MatchSimulationEngine } from '../matches/MatchSimulationEngine.js';
import { PressNewsSystem } from '../media/PressNewsSystem.js';
import { RoleDialogueDatabase, NPCPersonalitySystem, TaskAssignmentSystem } from '../dialogue/DialogueSystem.js';
import { renderPlayerProfileHTML } from './PlayerProfileView.js';
import { renderStaffCoachTabHTML, renderTrainingTabHTML } from './StaffAndTrainingViews.js';
import { renderTransferMarketHTML } from './TransferMarketView.js';
import { renderSigningEventHubHTML, renderLiveCeremonySheetHTML } from './SigningEventView.js';
import { renderFormationPitchTabHTML, bindFormationPitchEvents } from './FormationPitchView.js';
import { STAFF_ROLE_META } from '../staff/StaffDatabase.js';
import { PSG_LEGENDS } from '../trophies/TrophyDatabase.js';
import {
  renderMuseumHubHTML,
  renderTrophyDetailHTML,
  renderLegendDetailHTML,
  renderSeasonArchiveDetailHTML,
  renderCoronationModalHTML
} from './MuseumView.js';
// src/ui/UIManager.js
// Giao diện cảm ứng iPhone Landscape tối ưu + macOS Executive OS tích hợp đầy đủ:
// Hồ sơ cầu thủ 8 tab, Nhân sự & Ban huấn luyện 12 chức vụ, Huấn luyện 3D, Chuyển nhượng 2 giai đoạn, Đồng hồ thống nhất & Speed Controls
export class UIManager {
  constructor(state, audio, saveManager, callbacks) {
    this.state = state;
    this.audio = audio;
    this.saveManager = saveManager;
    this.cb = callbacks;
    this.activeTab = 'reports';
    this.macMinimized = false;
    this.macMaximized = false;
    this.academyFilter = 'U19';
    this.transferSubTab = 'buy';
    this.transferFilters = { search: '', club: '', nat: '', pos: 'ALL', minOvr: '', minPot: '', maxAge: '', maxVal: '', maxWage: '', maxContract: '' };
    this.staffSubTab = 'head_coach';
    this.trainingSubTab = 'schedule';
    this.eventSubTab = 'pending';
    this.museumSubTab = 'history';
    this.newsCategory = 'ALL';
    this.activeArticleId = null;
    this.selectedSlotIdx = null;
    this.selectedBenchId = null;
    this.benchPosFilter = 'ALL';
    this.pendingFormationPreview = null;
    this.confirmOptimalXI = false;
    this.pitchZoom = 1.0;
    this._abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    this._hudEls = null;
    this._hudCache = {
      season: null,
      clock: null,
      budget: null,
      fps: null,
      matchText: null,
      matchHidden: null,
      unreadText: null,
      unreadShow: null,
      aimedPrompt: '__init__',
      timePaused: null,
      timeSpeed: null
    };
    this._ceremonyHeaderSpan = null;
    this._lastCeremonyHeaderText = '';
    this.bindStaticButtons();
  }

  destroy() {
    if (this._toastTimer) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    if (typeof document !== 'undefined') {
      const body = document.getElementById('modal-body');
      if (body && body.innerHTML !== '') body.innerHTML = '';
      const sheet = document.getElementById('ceremony-sheet');
      if (sheet && sheet.innerHTML !== '') sheet.innerHTML = '';
    }
    this._hudEls = null;
    this._ceremonyHeaderSpan = null;
    this._lastCeremonyHeaderText = '';
  }

  _getHudEls() {
    if (this._hudEls || typeof document === 'undefined') return this._hudEls;
    this._hudEls = {
      season: document.getElementById('hud-season'),
      clock: document.getElementById('hud-clock'),
      budget: document.getElementById('hud-budget'),
      fps: document.getElementById('hud-fps'),
      matchPill: document.getElementById('hud-match-alert'),
      phoneBadge: document.getElementById('phone-badge'),
      interactBtn: document.getElementById('btn-interact'),
      hintPill: document.getElementById('interact-hint'),
      pauseBtn: document.getElementById('btn-time-pause'),
      speedBtns: Array.from(document.querySelectorAll('[data-speed]'))
    };
    return this._hudEls;
  }

  toast(msg, type = 'info') {
    const el = document.getElementById('toast-box');
    if (!el) return;
    el.textContent = msg;
    el.className = `toast-box show ${type}`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.className = 'toast-box'; }, 3500);
  }

  bindStaticButtons() {
    const opts = this._abortController ? { signal: this._abortController.signal } : undefined;
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', (e) => { e.stopPropagation(); this.audio.playClick(); fn(e); }, opts);
    };

    on('btn-phone', () => this.openPhone());
    on('btn-next-week', () => this.handleAdvanceWeek());
    on('hud-match-alert', () => this.cb.startMatch());
    on('btn-mute', () => {
      const muted = this.audio.toggleMute();
      const b = document.getElementById('btn-mute');
      if (b) b.textContent = muted ? '🔇' : '🔊';
      this.saveManager.saveSettings({ quality: this.currentQuality || 'Medium', muted });
    });
    on('btn-quality', () => {
      const order = ['Low', 'Medium', 'High'];
      const cur = this.currentQuality || 'Medium';
      const next = order[(order.indexOf(cur) + 1) % order.length];
      this.currentQuality = next;
      const b = document.getElementById('btn-quality');
      if (b) b.textContent = next;
      this.cb.setQuality(next);
      this.saveManager.saveSettings({ quality: next, muted: this.audio.muted });
      this.toast(`Đã chuyển chất lượng đồ họa sang mức ${next}`, 'success');
    });
    on('btn-sprint', () => {
      const active = this.cb.toggleSprint();
      const b = document.getElementById('btn-sprint');
      if (b) b.classList.toggle('active', active);
    });
    on('btn-interact', () => this.cb.interact());
    on('btn-dismiss-rotate', () => {
      const ov = document.getElementById('portrait-warning');
      if (ov) ov.classList.add('dismissed');
    });
    on('modal-close', () => this.closeModal());

    // Điều khiển tốc độ & tạm dừng đồng hồ toàn game (GameTimeSystem)
    on('btn-time-pause', () => {
      const paused = this.state.timeSystem.togglePause();
      this.refreshTimeSpeedButtons();
      this.toast(paused ? '⏸️ Đã tạm dừng thời gian toàn game.' : `▶️ Tiếp tục thời gian (x${this.state.timeSystem.speedMultiplier}).`, 'info');
    });
    document.querySelectorAll('[data-speed]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.audio.playClick();
        const spd = Number(btn.dataset.speed);
        this.state.timeSystem.setSpeed(spd);
        this.refreshTimeSpeedButtons();
        this.toast(`⏩ Tốc độ thời gian: x${spd} (1 ngày = ${(15 / spd).toFixed(2)} phút thực)`, 'info');
      }, opts);
    });

    document.querySelectorAll('[data-cam]').forEach((btn) => {
      btn.addEventListener('click', () => { this.audio.playClick(); this.cb.setMatchCam(btn.dataset.cam); }, opts);
    });
    document.querySelectorAll('[data-tactic]').forEach((btn) => {
      btn.addEventListener('click', () => { this.audio.playClick(); this.cb.setMatchTactic(btn.dataset.tactic); }, opts);
    });
    on('btn-match-speed', () => this.cb.toggleMatchSpeed());
    on('btn-match-pause', () => this.cb.toggleMatchPause());
    on('btn-match-exit', () => this.cb.exitMatch());
    on('btn-match-stats', () => this.openMatchStatsModal());
    on('btn-match-sub', () => {
      const sub = this.cb.makeImpactSub();
      if (sub) { this.audio.playSuccess(); this.toast(`🔄 Thay người: ${sub.inName} vào thay ${sub.oldName}!`, 'success'); }
      else this.toast('Đã hết lượt thay người hoặc cầu thủ dự bị.', 'warn');
    });
    on('btn-match-replay', () => this.openReplayModal());
  }

  refreshTimeSpeedButtons() {
    const ts = this.state.timeSystem;
    if (!ts) return;
    const paused = ts.isPaused();
    const spd = ts.speedMultiplier;
    if (this._hudCache.timePaused === paused && this._hudCache.timeSpeed === spd) return;
    this._hudCache.timePaused = paused;
    this._hudCache.timeSpeed = spd;

    const els = this._getHudEls();
    if (!els) return;
    if (els.pauseBtn) {
      els.pauseBtn.textContent = paused ? '▶️' : '⏸️';
      els.pauseBtn.classList.toggle('active', paused);
    }
    const btns = els.speedBtns;
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      b.classList.toggle('active', !paused && Number(b.dataset.speed) === spd);
    }
  }

  formatClock() {
    const ts = this.state.timeSystem;
    if (!ts) return '09:15';
    return `${ts.getFullHudString()}${ts.isPaused() ? ' · ⏸️' : ts.speedMultiplier > 1 ? ` · x${ts.speedMultiplier}` : ''}`;
  }

  updateTopHUD(fps, aimedPrompt) {
    const els = this._getHudEls();
    if (!els) return;
    const s = this.state;
    const c = this._hudCache;

    const weekFx = s.getCurrentWeekFixture();
    const nextFx = weekFx || s.getNextFixture();
    const countdown = s.timeSystem ? s.timeSystem.getCountdownToFixture(nextFx) : '';
    const seasonText = `${s.season} · T${s.week}${countdown ? ` · ${countdown}` : ''}`;
    if (c.season !== seasonText) {
      c.season = seasonText;
      if (els.season) els.season.textContent = seasonText;
    }

    const clockText = this.formatClock();
    if (c.clock !== clockText) {
      c.clock = clockText;
      if (els.clock) els.clock.textContent = clockText;
    }

    const budgetText = `€${s.finance.budget.toFixed(1)}M`;
    if (c.budget !== budgetText) {
      c.budget = budgetText;
      if (els.budget) els.budget.textContent = budgetText;
    }

    const fpsText = `${fps} FPS`;
    if (c.fps !== fpsText) {
      c.fps = fpsText;
      if (els.fps) els.fps.textContent = fpsText;
    }

    this.refreshTimeSpeedButtons();

    // Thông báo trận đấu trong tuần trên thanh trạng thái
    if (els.matchPill) {
      if (weekFx) {
        const opp = weekFx.home === 'Paris Saint-Germain' ? weekFx.away : weekFx.home;
        const matchText = `⚽ Tuần ${s.week}: vs ${opp} (Chưa đá)`;
        if (c.matchText !== matchText) {
          c.matchText = matchText;
          els.matchPill.textContent = matchText;
        }
        if (c.matchHidden !== false) {
          c.matchHidden = false;
          els.matchPill.classList.remove('hidden');
        }
      } else if (c.matchHidden !== true) {
        c.matchHidden = true;
        els.matchPill.classList.add('hidden');
      }
    }

    let unread = s.incomingCall ? 1 : 0;
    const inbox = s.phoneInbox;
    for (let i = 0; i < inbox.length; i++) {
      if (!inbox[i].read) unread++;
    }
    if (els.phoneBadge) {
      const showBadge = unread > 0;
      const badgeText = showBadge ? String(unread) : '';
      if (c.unreadText !== badgeText) {
        c.unreadText = badgeText;
        els.phoneBadge.textContent = badgeText;
      }
      if (c.unreadShow !== showBadge) {
        c.unreadShow = showBadge;
        els.phoneBadge.style.display = showBadge ? 'flex' : 'none';
      }
    }

    // Nút tương tác CHỈ HIỆN LÊN khi tâm ngắm đang trỏ vào vật thể/NPC/cửa/ghế
    const normPrompt = aimedPrompt || null;
    if (c.aimedPrompt !== normPrompt && els.interactBtn && els.hintPill) {
      c.aimedPrompt = normPrompt;
      if (normPrompt) {
        els.interactBtn.classList.remove('hidden');
        els.interactBtn.classList.add('ready');
        els.hintPill.textContent = normPrompt;
        els.hintPill.classList.add('show');
      } else {
        els.interactBtn.classList.add('hidden');
        els.interactBtn.classList.remove('ready');
        els.hintPill.classList.remove('show');
      }
    }
  }

  handleAdvanceWeek() {
    const res = this.state.advanceWeek((evt) => {
      this.toast(`⚡ ${evt.slice(0, 90)}...`, 'warn');
    });
    if (res && res.blocked) {
      this.audio.playAlert();
      const fx = res.fixture;
      this.openModal('⚠️ KHÔNG THỂ QUA TUẦN — TRẬN ĐẤU CHƯA DIỄN RA', `
        <div class="card-item urgent">
          <h4>⚽ ${fx.comp} · ${fx.round}</h4>
          <p>Tuần ${this.state.week} có trận đấu giữa <b>${fx.home}</b> và <b>${fx.away}</b> chưa diễn ra. Chủ tịch Phạm Minh Chiêu không thể tua qua tuần trước khi hoàn thành trận đấu này.</p>
          <div class="btn-row" style="margin-top:10px;">
            <button class="btn-primary" id="wk-go-match">🏟️ Ra SVĐ Parc des Princes thi đấu ngay</button>
            <button class="btn-secondary" id="wk-stay">Ở lại Trụ sở PSG</button>
          </div>
        </div>`, 'normal');
      document.getElementById('wk-go-match')?.addEventListener('click', () => { this.closeModal(); this.cb.startMatch(); });
      document.getElementById('wk-stay')?.addEventListener('click', () => this.closeModal());
      return;
    }

    this.audio.playSuccess();
    this.cb.autoSaveNow?.(true);
    this.toast(`Đã sang Tuần ${this.state.week} (${this.state.dayName}) · Bản tin hằng ngày đã cập nhật!`, 'success');
    if (this.state.incomingCall) {
      this.audio.playPhoneRing();
      this.showIncomingCall(this.state.incomingCall);
    }
  }

  openModal(title, html, mode = 'normal') {
    const wrap = document.getElementById('modal-backdrop');
    const box = document.getElementById('modal-box');
    const head = document.getElementById('modal-head-bar');
    const tEl = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    if (!wrap || !box || !body) return;
    tEl.textContent = title;
    body.innerHTML = html;
    if (mode === 'macos') {
      box.className = 'modal-box macos-shell';
      if (head) head.style.display = 'none';
      body.style.padding = '0';
    } else {
      box.className = mode === 'wide' ? 'modal-box wide' : 'modal-box';
      if (head) head.style.display = 'flex';
      body.style.padding = '12px 14px';
    }
    wrap.classList.add('open');
  }

  closeModal() {
    const wrap = document.getElementById('modal-backdrop');
    if (wrap) wrap.classList.remove('open');
    const body = document.getElementById('modal-body');
    if (body && body.innerHTML !== '') body.innerHTML = '';
    this.state.timeSystem?.clearAutoPause();
    this.cb.endBoard();
    this.cb.dismissPlayer();
  }

  // --- 1. ĐIỆN THOẠI CHỦ TỊCH ---
  showIncomingCall(call) {
    this.state.timeSystem?.pushAutoPause('incoming_call');
    const html = `
      <div class="call-card">
        <div class="call-pulse">📞</div>
        <h3>${call.caller}</h3>
        <p class="call-text">"${call.summary}"</p>
        <div class="btn-row">
          <button class="btn-primary" id="call-accept">✅ ${call.acceptLabel}</button>
          <button class="btn-danger" id="call-reject">❌ ${call.rejectLabel}</button>
        </div>
      </div>`;
    this.openModal('📱 CUỘC GỌI KHẨN ĐẾN CHỦ TỊCH PHẠM MINH CHIÊU', html, 'normal');
    document.getElementById('call-accept')?.addEventListener('click', () => {
      call.onAccept(); this.state.incomingCall = null; this.audio.playSuccess();
      this.toast('Đã phê duyệt qua điện thoại.', 'success'); this.closeModal();
    });
    document.getElementById('call-reject')?.addEventListener('click', () => {
      call.onReject(); this.state.incomingCall = null; this.audio.playClick();
      this.toast('Đã từ chối và kết thúc cuộc gọi.', 'info'); this.closeModal();
    });
  }

  openPhone() {
    if (this.state.incomingCall) { this.showIncomingCall(this.state.incomingCall); return; }
    this.state.phoneInbox.forEach((m) => (m.read = true));
    const weekFx = this.state.getCurrentWeekFixture();
    const msgsHtml = this.state.phoneInbox.map((m) => `
      <div class="card-item ${m.urgent ? 'urgent' : ''}">
        <div class="card-head"><strong>${m.from}</strong><span class="tag">${m.urgent ? 'KHẨN' : 'Tin nhắn'}</span></div>
        <div class="card-sub">${m.title}</div>
        <p>${m.body}</p>
      </div>`).join('');

    const html = `
      <div class="phone-quick-actions">
        <button class="btn-primary" id="ph-board">🏛️ Họp Ban Lãnh Đạo</button>
        <button class="btn-accent" id="ph-player">🗣️ Họp Riêng Cầu Thủ</button>
        <button class="btn-primary" id="ph-profiles">👤 Hồ sơ cầu thủ</button>
        <button class="btn-secondary" id="ph-training">🏃 Lịch tập 3D</button>
        <button class="btn-secondary" id="ph-staff">👔 BHL & Nhân sự</button>
        <button class="btn-danger" id="ph-events">📺 Sự kiện & PSG TV${(this.state.signingEventSystem?.pendingEvents?.length || 0) > 0 ? ` (${this.state.signingEventSystem.pendingEvents.length})` : ''}</button>
        <button class="btn-secondary" id="ph-archive">🗄️ Event Archive</button>
        <button class="btn-accent" id="ph-cctv">📹 Camera SVĐ Parc des Princes</button>
        <button class="btn-secondary" id="ph-map">🗺️ Đi nhanh khuôn viên</button>
        <button class="btn-primary" id="ph-museum">🏛️ Bảo tàng PSG (${this.state.trophySystem?.getTotalClubTrophies?.() || 53})</button>
        <button class="btn-danger" id="ph-match">⚽ ${weekFx ? `Ngày thi đấu Tuần ${this.state.week}` : 'Lịch thi đấu'}</button>
        <button class="btn-secondary" id="ph-press">📰 Báo chí</button>
        <button class="btn-primary" id="ph-form">👕 Sơ đồ đội hình</button>
      </div>
      <div class="section-label">Hộp thư & Thông báo Chủ tịch</div>
      <div class="scroll-list">${msgsHtml}</div>`;
    this.openModal('📱 ĐIỆN THOẠI CHỦ TỊCH PHẠM MINH CHIÊU', html, 'normal');
    document.getElementById('ph-board')?.addEventListener('click', () => this.openBoardMeeting());
    document.getElementById('ph-player')?.addEventListener('click', () => this.openPlayerMeetingSelector());
    document.getElementById('ph-profiles')?.addEventListener('click', () => {
      const first = this.state.getPsgSquad()[0];
      if (first) this.openPlayerProfileModal(first.id, 'overview');
    });
    document.getElementById('ph-training')?.addEventListener('click', () => { this.openComputer('training'); });
    document.getElementById('ph-staff')?.addEventListener('click', () => { this.openComputer('coach'); });
    document.getElementById('ph-events')?.addEventListener('click', () => { this.eventSubTab = this.state.signingEventSystem?.broadcast?.isLive ? 'psgtv' : 'pending'; this.openComputer('events'); });
    document.getElementById('ph-archive')?.addEventListener('click', () => { this.eventSubTab = 'archive'; this.openComputer('events'); });
    document.getElementById('ph-cctv')?.addEventListener('click', () => { this.closeModal(); this.openStadiumCctvOverlay('overview_gate'); });
    document.getElementById('ph-map')?.addEventListener('click', () => this.openFastTravel());
    document.getElementById('ph-museum')?.addEventListener('click', () => { this.openComputer('museum'); });
    document.getElementById('ph-match')?.addEventListener('click', () => { this.openMatchdayFlow(); });
    document.getElementById('ph-press')?.addEventListener('click', () => { this.openComputer('media'); });
    document.getElementById('ph-form')?.addEventListener('click', () => { this.openComputer('formation'); });
  }

  openFastTravel() {
    const places = [
      ['president', '🏢 Phòng Chủ tịch Phạm Minh Chiêu'],
      ['boardroom', '🏛️ Phòng Họp Ban Lãnh Đạo'],
      ['lobby', '✨ Sảnh Lễ Tân PSG'],
      ['sporting', '🎯 Phòng Giám Đốc Thể Thao'],
      ['coach', '📋 Phòng HLV Trưởng'],
      ['finance', '💶 Phòng Tài Chính'],
      ['medical', '🏥 Trung Tâm Y Tế PSG'],
      ['museum', '🏛️ Bảo tàng Lịch sử & Danh hiệu PSG'],
      ['dressing_room', '👕 Tòa Nhà Phòng Thay Đồ Cầu Thủ PSG'],
      ['signing_room', '✍️ Phòng Ký Hợp Đồng Cao Cấp 3D'],
      ['press_hall', '📺 Phòng Họp Báo & Trường Quay PSG TV'],
      ['logistics_gate', '🛣️ Khu Dịch Vụ, Hậu Cần & Trạm Kiểm Soát SVĐ'],
      ['stadium_plaza', '🏟️ Quảng Trường SVĐ Parc des Princes'],
      ['stadium_pitch', '⚽ Mặt Sân SVĐ Parc des Princes (Tập luyện 3D & Thi đấu)'],
      ['parking', '🚘 Bãi Đỗ Xe Trụ Sở & Xe Buýt Đội Bóng']
    ];
    const zInfo = this.cb.getStadiumZoneStatus ? this.cb.getStadiumZoneStatus() : null;
    const html = `
      ${zInfo ? `<div class="card-item" style="padding:7px 10px;margin-bottom:8px;"><b>Vị trí hiện tại:</b> ${zInfo.zoneLabel} · <span class="tag ok">${zInfo.lodHighVisible ? 'SVĐ LOD Cao' : 'SVĐ LOD Thấp (Tiết kiệm hiệu năng)'}</span></div>` : ''}
      <div class="grid-2">${places.map(([k, label]) =>
        `<button class="btn-secondary nav-jump" data-room="${k}">${label}</button>`
      ).join('')}</div>
      <div class="btn-row" style="margin-top:8px;">
        <button class="btn-accent" id="nav-open-cctv" style="width:100%;">📹 Xem Camera Giám Sát SVĐ Parc des Princes từ xa (Không cần tải LOD Cao)</button>
      </div>`;
    this.openModal('🗺️ BẢN ĐỒ KHUÔN VIÊN TỔNG THỂ PSG (6 KHU VỰC)', html, 'normal');
    document.getElementById('nav-open-cctv')?.addEventListener('click', () => { this.closeModal(); this.openStadiumCctvOverlay('overview_gate'); });
    document.querySelectorAll('.nav-jump').forEach((b) => {
      b.addEventListener('click', () => {
        this.audio.playDoor(); this.cb.teleport(b.dataset.room); this.closeModal();
        this.toast(`Đã di chuyển đến ${b.textContent}`, 'info');
      });
    });
  }

  // --- 2. HỘI THOẠI CHUYÊN SÂU THEO TỪNG CHỨC VỤ, TÍNH CÁCH & GIAO NHIỆM VỤ THỰC TẾ ---
  openNpcDialogue(npc, lastReply = null) {
    const menu = RoleDialogueDatabase.buildMenu(npc, this.state);
    const quote = lastReply || menu.greeting;
    const npcTasks = (this.state.assignedTasks || []).filter((t) => t.ownerId === npc.id);
    const memHtml = npc.memory.length > 0
      ? npc.memory.slice(0, 4).map((m) => `<li>${m}</li>`).join('')
      : '<li>Chưa có quyết định riêng nào được ghi nhận tuần này.</li>';

    const tasksHtml = npcTasks.length > 0 ? npcTasks.slice(0, 3).map((t) => `
      <div class="card-item" style="padding:7px 10px;">
        <div class="card-head"><strong>${t.title}</strong><span class="tag ${t.status === 'Hoàn thành' ? 'ok' : ''}">${t.status} (${t.progress}%)</span></div>
        <div class="muted">Phối hợp: ${t.collaborators} · Ưu tiên: ${t.priority}</div>
        ${t.finalReport ? `<p style="color:#86efac;">📄 ${t.finalReport}</p>` : ''}
      </div>`).join('') : '<div class="muted">Chưa có nhiệm vụ nào đang giao cho nhân vật này.</div>';

    const html = `
      <div class="npc-header">
        <div>
          <h3>${npc.name}</h3>
          <div class="muted">${npc.role} · ${npc.dept} · Tính cách: <b>${npc.personality}</b></div>
        </div>
        <div class="kpi-mini">
          <span>Chuyên môn: <b>${npc.skill}</b></span>
          <span>Thái độ: <b>${npc.morale}%</b></span>
          <span>Quan hệ: <b>${npc.relation}/100</b></span>
        </div>
      </div>
      <div class="dialogue-bubble">"${quote}"</div>
      <div class="section-label">Mệnh lệnh & Hội thoại dành riêng cho ${npc.role}</div>
      <div class="scroll-list" style="max-height:195px;">
        ${menu.options.map((o, idx) => `
          <button class="${o.type === 'task' ? 'btn-primary' : o.type === 'challenge' ? 'btn-danger' : o.type === 'praise' ? 'btn-accent' : 'btn-secondary'} role-opt" data-oidx="${idx}" style="width:100%;text-align:left;margin-bottom:5px;">
            ${o.label}
          </button>`).join('')}
      </div>
      <div class="section-label">📌 Nhiệm vụ Chủ tịch đã giao cho ${npc.name}</div>
      ${tasksHtml}
      <div class="section-label">Ký ức hội thoại gần đây</div>
      <ul class="mem-list">${memHtml}</ul>`;

    this.openModal(`💬 ${npc.name.toUpperCase()} · ${npc.role.toUpperCase()}`, html, 'wide');

    document.querySelectorAll('.role-opt').forEach((b) => {
      b.addEventListener('click', () => {
        const opt = menu.options[Number(b.dataset.oidx)];
        if (!opt) return;
        if (opt.type === 'task') {
          const task = TaskAssignmentSystem.createTask(this.state, npc, opt);
          const destInfo = this.cb.dispatchNpcTask ? this.cb.dispatchNpcTask(npc.id, opt.resultKey) : null;
          const reaction = NPCPersonalitySystem.getReaction(npc.personality, 'accept_task');
          npc.relation = Math.min(100, npc.relation + 3);
          npc.memory.unshift(`Tuần ${this.state.week}: Tiếp nhận nhiệm vụ "${task.title}" (${task.collaborators}).`);
          this.audio.playSuccess();
          this.toast(`📌 ${npc.name} đang tự tìm đường đến ${destInfo ? destInfo.label : "phòng phối hợp"} để thực hiện nhiệm vụ!`, 'success');
          this.openNpcDialogue(npc, `${reaction} (Đã tạo nhiệm vụ: "${task.title}" · Phối hợp: ${task.collaborators})`);
        } else if (opt.type === 'challenge') {
          npc.morale = Math.max(25, npc.morale - 4);
          npc.memory.unshift(`Tuần ${this.state.week}: Chủ tịch chất vấn thẳng thắn về tiến độ.`);
          this.audio.playAlert();
          const react = opt.reply || NPCPersonalitySystem.getReaction(npc.personality, 'challenge');
          this.openNpcDialogue(npc, react);
        } else if (opt.type === 'praise') {
          npc.morale = Math.min(100, npc.morale + 7);
          npc.relation = Math.min(100, npc.relation + 6);
          npc.memory.unshift(`Tuần ${this.state.week}: Chủ tịch khen ngợi đóng góp.`);
          this.audio.playSuccess();
          this.openNpcDialogue(npc, opt.reply);
        } else {
          npc.relation = Math.min(100, npc.relation + 2);
          this.audio.playClick();
          this.openNpcDialogue(npc, opt.reply);
        }
      });
    });
  }

  // --- 3. HỌP BAN LÃNH ĐẠO & HỌP RIÊNG CẦU THỦ ---
  openBoardMeeting(topicIdx = 0) {
    this.state.timeSystem?.pushAutoPause('board_meeting');
    this.cb.summonBoard();
    const agendas = [
      {
        title: 'Phê duyệt gói đầu tư Chuyển nhượng €40M bổ sung',
        opinions: [
          ['Victoriano Melero (CEO)', 'Ủng hộ', 'Cần giữ cân đối dòng tiền nhưng sẽ tăng doanh thu thương mại.'],
          ['Luís Campos (GĐ Thể Thao)', 'Ủng hộ', 'Đội hình cần thêm 1 ngôi sao đẳng cấp thế giới để vô địch UCL.'],
          ['Luis Enrique (HLV Trưởng)', 'Ủng hộ', 'Chiều sâu đội hình là yếu tố sống còn cho lịch thi đấu dày đặc.'],
          ['Jean-Baptiste Laurent (CFO)', 'Phản đối', 'Cảnh báo rủi ro áp lực quỹ lương theo Luật FFP của UEFA.']
        ],
        applyApprove: () => {
          this.state.finance.transferBudget = +(this.state.finance.transferBudget + 40).toFixed(1);
          this.state.president.fanSupport = Math.min(100, this.state.president.fanSupport + 5);
        },
        applyReject: () => { this.state.president.boardTrust = Math.min(100, this.state.president.boardTrust + 4); }
      },
      {
        title: 'Đầu tư €12M nâng cấp Học viện PSG & Trung tâm Y tế',
        opinions: [
          ['Yohan Cabaye (GĐ Học Viện)', 'Ủng hộ', 'Giúp 100 cầu thủ trẻ phát triển nhanh hơn và tạo bản sắc Paris.'],
          ['BS. Christophe Baudot (Y Tế)', 'Ủng hộ', 'Giảm mạnh chấn thương cơ bắp cho trụ cột.'],
          ['Jean-Baptiste Laurent (CFO)', 'Trắng', 'Chi phí €12M chấp nhận được nếu phân bổ hợp lý.']
        ],
        applyApprove: () => {
          this.state.addLedger('Đầu tư nâng cấp Học viện & Y tế', -12);
          this.state.academy.forEach((y) => { if (y.ovr < y.pot) y.ovr = Math.min(y.pot, y.ovr + 1); });
        },
        applyReject: () => {}
      }
    ];
    const ag = agendas[topicIdx] || agendas[0];
    const approveCnt = ag.opinions.filter((o) => o[1] === 'Ủng hộ').length;
    const rejectCnt = ag.opinions.filter((o) => o[1] === 'Phản đối').length;
    const absCnt = ag.opinions.filter((o) => o[1] === 'Trắng').length;

    const html = `
      <div class="tab-strip">
        ${agendas.map((_, i) => `<button class="tab-btn ${i === topicIdx ? 'active' : ''}" data-ag="${i}">Chủ đề ${i + 1}</button>`).join('')}
      </div>
      <div class="card-item"><h4>📌 ${ag.title}</h4></div>
      <div class="scroll-list">${ag.opinions.map(([w, v, t]) => `<div class="card-item"><div class="card-head"><strong>${w}</strong><span class="tag ${v === 'Ủng hộ' ? 'ok' : v === 'Phản đối' ? 'bad' : ''}">${v}</span></div><p>"${t}"</p></div>`).join('')}</div>
      <div class="vote-bar">Biểu quyết: <b>${approveCnt} Đồng ý</b> · <b>${rejectCnt} Phản đối</b> · <b>${absCnt} Trắng</b></div>
      <div class="grid-2">
        <button class="btn-primary" id="bm-approve">✅ Chủ tịch Phê duyệt</button>
        <button class="btn-danger" id="bm-reject">❌ Chủ tịch Bác bỏ</button>
      </div>`;
    this.openModal('🏛️ HỌP BAN LÃNH ĐẠO PARIS SAINT-GERMAIN', html, 'wide');
    document.querySelectorAll('[data-ag]').forEach((b) => b.addEventListener('click', () => this.openBoardMeeting(Number(b.dataset.ag))));
    const done = (label, ok) => {
      if (ok) ag.applyApprove(); else ag.applyReject();
      this.state.meetingMinutes.unshift({ id: `mm_${Date.now()}`, date: `Tuần ${this.state.week} · ${this.state.season}`, topic: ag.title, attendees: ag.opinions.map((o) => o[0]), votes: { approve: approveCnt, reject: rejectCnt, abstain: absCnt }, decision: `${label} (Chủ tịch Phạm Minh Chiêu)`, owner: 'Ban Điều Hành PSG' });
      this.audio.playSuccess(); this.toast(`Đã lưu Biên bản họp: ${label}`, 'success'); this.closeModal();
    };
    document.getElementById('bm-approve')?.addEventListener('click', () => done('PHÊ DUYỆT', true));
    document.getElementById('bm-reject')?.addEventListener('click', () => done('BÁC BỎ', false));
  }

  openPlayerMeetingSelector(preselectedId = null) {
    const squad = this.state.getPsgSquad();
    const chosen = squad.find((p) => p.id === preselectedId) || squad[0];
    if (!chosen) return;
    this.cb.summonPlayer(chosen.name);
    const topics = [
      ['motivate', '🔥 Động viên tinh thần (+8 Tinh thần, +4 Trung thành)'],
      ['praise', '⭐ Khen ngợi phong độ (+6 Hài lòng)'],
      ['contract', '✍️ Gia hạn hợp đồng (+2 năm, +10% lương)'],
      ['captain', '©️ Giao vai trò thủ lĩnh phòng thay đồ (+10 Trung thành)'],
      ['discipline', '⚠️ Nhắc nhở phong độ & thái độ tập luyện']
    ];
    const html = `
      <div class="card-item">
        <select id="pm-select" class="input-ctrl">${squad.map((p) => `<option value="${p.id}" ${p.id === chosen.id ? 'selected' : ''}>${p.name} (${p.position} · OVR ${p.ovr})</option>`).join('')}</select>
        <div class="kpi-mini" style="margin-top:8px;"><span>Lương: <b>€${chosen.wage}k</b></span><span>HĐ: <b>${chosen.contractYears} năm</b></span><span>Hài lòng: <b>${chosen.satisfaction}%</b></span></div>
      </div>
      <div class="scroll-list">${topics.map(([k, txt]) => `<button class="btn-secondary pm-topic" data-topic="${k}" style="width:100%;text-align:left;margin-bottom:5px;">${txt}</button>`).join('')}</div>`;
    this.openModal(`🗣️ HỌP RIÊNG CẦU THỦ · ${chosen.name.toUpperCase()}`, html, 'normal');
    document.getElementById('pm-select')?.addEventListener('change', (e) => this.openPlayerMeetingSelector(e.target.value));
    document.querySelectorAll('.pm-topic').forEach((b) => {
      b.addEventListener('click', () => {
        const t = b.dataset.topic;
        if (t === 'motivate') { chosen.morale = Math.min(100, chosen.morale + 8); chosen.loyalty = Math.min(100, chosen.loyalty + 4); }
        else if (t === 'praise') chosen.satisfaction = Math.min(100, chosen.satisfaction + 6);
        else if (t === 'contract') { chosen.contractYears += 2; chosen.wage = Math.round(chosen.wage * 1.1); chosen.satisfaction = 95; }
        else if (t === 'captain') chosen.loyalty = Math.min(100, chosen.loyalty + 10);
        else chosen.form = Math.min(99, chosen.form + 5);
        this.audio.playSuccess();
        this.toast(`${chosen.name} đã ghi nhận trao đổi riêng với Chủ tịch!`, 'success');
        this.closeModal();
      });
    });
  }

  // --- 4. MÁY TÍNH macOS (CÓ MỤC BÁO CÁO HẰNG NGÀY & BÁO CÁO CHỜ DUYỆT TỰ BIẾN MẤT) ---
  openComputer(tab = this.activeTab) {
    this.activeTab = tab;
    const pendingCnt = this.state.pendingReports.length;
    const apps = [
      { id: 'reports', icon: '📋', name: `Báo cáo${pendingCnt > 0 ? ` (${pendingCnt})` : ''}`, bg: 'linear-gradient(135deg,#e11d48,#881337)' },
      { id: 'overview', icon: '🏢', name: 'Tổng quan', bg: 'linear-gradient(135deg,#2563eb,#1e3a8a)' },
      { id: 'departments', icon: '🏛️', name: '12 Phòng ban', bg: 'linear-gradient(135deg,#7c3aed,#4c1d95)' },
      { id: 'formation', icon: '👕', name: 'Sơ đồ đội hình', bg: 'linear-gradient(135deg,#0284c7,#00205b)' },
      { id: 'squad', icon: '⚽', name: 'Đội hình & Hồ sơ', bg: 'linear-gradient(135deg,#1d4ed8,#0f172a)' },
      { id: 'training', icon: '🏃', name: 'Huấn luyện 3D', bg: 'linear-gradient(135deg,#059669,#064e3b)' },
      { id: 'coach', icon: '🎯', name: 'Nhân sự & BHL (12)', bg: 'linear-gradient(135deg,#0891b2,#164e63)' },
      { id: 'academy', icon: '🎓', name: 'Học viện', bg: 'linear-gradient(135deg,#16a34a,#14532d)' },
      { id: 'transfers', icon: '🤝', name: 'Chuyển nhượng', bg: 'linear-gradient(135deg,#ea580c,#9a3412)' },
      { id: 'events', icon: '📺', name: `Sự kiện & PSG TV${(this.state.signingEventSystem?.pendingEvents?.length || 0) > 0 ? ` (${this.state.signingEventSystem.pendingEvents.length})` : ''}`, bg: 'linear-gradient(135deg,#dc2626,#7f1d1d)' },
      { id: 'finance', icon: '💶', name: 'Tài chính', bg: 'linear-gradient(135deg,#ca8a04,#713f12)' },
      { id: 'leagues', icon: '🏆', name: 'Lịch & BXH', bg: 'linear-gradient(135deg,#dc2626,#7f1d1d)' },
      { id: 'museum', icon: '🏛️', name: 'Bảo tàng PSG', bg: 'linear-gradient(135deg,#b45309,#1e293b)' },
      { id: 'media', icon: '📰', name: 'Truyền thông', bg: 'linear-gradient(135deg,#db2777,#831843)' },
      { id: 'history', icon: '💾', name: 'Lưu & Biên bản', bg: 'linear-gradient(135deg,#475569,#1e293b)' }
    ];
    const currentApp = apps.find((a) => a.id === tab) || apps[0];

    let content = '';
    if (tab === 'reports') content = this.renderReportsTab();
    else if (tab === 'overview') content = this.renderOverviewTab();
    else if (tab === 'departments') content = this.renderDepartmentsTab();
    else if (tab === 'formation') content = this.renderFormationTab();
    else if (tab === 'squad') content = this.renderSquadTab();
    else if (tab === 'training') content = renderTrainingTabHTML(this.state, this.trainingSubTab);
    else if (tab === 'academy') content = this.renderAcademyTab();
    else if (tab === 'transfers') content = renderTransferMarketHTML(this.state, this);
    else if (tab === 'events') content = renderSigningEventHubHTML(this.state, this.eventSubTab);
    else if (tab === 'coach') content = renderStaffCoachTabHTML(this.state, this.staffSubTab);
    else if (tab === 'finance') content = this.renderFinanceTab();
    else if (tab === 'leagues') content = this.renderLeaguesTab();
    else if (tab === 'museum') content = renderMuseumHubHTML(this.state, this.museumSubTab);
    else if (tab === 'media') content = this.renderMediaTab();
    else content = this.renderHistorySaveTab();

    const html = `
      <div class="macos-desktop ${this.macMaximized ? 'maximized' : ''}">
        <div class="macos-menubar">
          <div class="mac-menu-left">
            <span class="mac-apple"></span>
            <b>${currentApp.name}</b>
            <span class="mac-menu-item">PSG OS</span>
            <span class="mac-menu-item">Hồ sơ</span>
          </div>
          <div class="mac-menu-right">
            <span>€${this.state.finance.budget.toFixed(1)}M</span>
            <span>${this.formatClock(this.state.clockHour)}</span>
            <button class="mac-exit-btn" id="mac-top-exit">Thoát</button>
          </div>
        </div>
        <div class="macos-workspace">
          ${this.macMinimized ? `
            <div class="macos-desktop-hint">
              <div class="mac-desktop-badge">PARIS SAINT-GERMAIN · macOS EXECUTIVE</div>
              <p>Chọn biểu tượng trên thanh Dock bên dưới để mở ứng dụng quản lý.</p>
            </div>
          ` : `
            <div class="macos-window">
              <div class="macos-titlebar">
                <div class="traffic-lights">
                  <button class="tl red" id="mac-close" title="Đóng máy tính"></button>
                  <button class="tl yellow" id="mac-min" title="Thu nhỏ xuống Desktop"></button>
                  <button class="tl green" id="mac-max" title="Phóng to / Thu gọn"></button>
                </div>
                <div class="macos-win-title">${currentApp.icon} ${currentApp.name} — Paris Saint-Germain</div>
                <div style="width:48px;"></div>
              </div>
              <div class="macos-body">
                <aside class="macos-sidebar">
                  ${apps.map((a) => `<button class="mac-side-item ${a.id === tab ? 'active' : ''}" data-pctab="${a.id}"><span>${a.icon}</span><span>${a.name}</span></button>`).join('')}
                </aside>
                <main class="macos-main">${content}</main>
              </div>
            </div>
          `}
        </div>
        <div class="macos-dock-wrap">
          <div class="macos-dock">
            ${apps.map((a) => `
              <button class="dock-item ${a.id === tab && !this.macMinimized ? 'active' : ''}" data-pctab="${a.id}" title="${a.name}">
                <span class="dock-icon" style="background:${a.bg}">${a.icon}</span>
                <span class="dock-dot"></span>
              </button>`).join('')}
          </div>
        </div>
      </div>`;

    this.openModal('', html, 'macos');

    document.getElementById('mac-close')?.addEventListener('click', () => { this.audio.playClick(); this.closeModal(); });
    document.getElementById('mac-top-exit')?.addEventListener('click', () => { this.audio.playClick(); this.closeModal(); });
    document.getElementById('mac-min')?.addEventListener('click', () => { this.audio.playClick(); this.macMinimized = true; this.openComputer(this.activeTab); });
    document.getElementById('mac-max')?.addEventListener('click', () => { this.audio.playClick(); this.macMaximized = !this.macMaximized; this.openComputer(this.activeTab); });
    document.querySelectorAll('[data-pctab]').forEach((b) => {
      b.addEventListener('click', () => { this.audio.playClick(); this.macMinimized = false; this.openComputer(b.dataset.pctab); });
    });
    if (!this.macMinimized) this.bindComputerTabEvents(tab);
  }

  renderReportsTab() {
    const pending = this.state.pendingReports;
    const briefings = this.state.dailyBriefings;
    return `
      <div class="section-label">📅 Thông báo tình hình mỗi ngày cho Giám đốc / Chủ tịch</div>
      <div class="scroll-list" style="max-height:190px;margin-bottom:10px;">
        ${briefings.map((b) => `
          <div class="card-item">
            <div class="card-head"><strong>🗓️ ${b.date}</strong><span class="tag ok">Bản tin ngày</span></div>
            <p>${b.matchAlert}</p>
            <p>${b.trainingNote}</p>
            <p>${b.healthNote}</p>
            <p class="muted">${b.financeNote}</p>
          </div>`).join('')}
      </div>
      <div class="section-label">📨 Báo cáo & Đề xuất chờ duyệt (${pending.length}) — Sẽ biến mất sau khi duyệt</div>
      ${pending.length === 0 ? `<div class="card-item"><p class="muted">✅ Tất cả báo cáo phòng ban đã được Chủ tịch xử lý xong!</p></div>` : `
        <div class="scroll-list" style="max-height:220px;">
          ${pending.map((r) => `
            <div class="card-item urgent">
              <div class="card-head"><strong>${r.title}</strong><span class="tag">${r.dept}</span></div>
              <div class="muted">Người trình: <b>${r.author}</b> · Tác động tài chính: <b>${r.cost >= 0 ? '+' : ''}€${r.cost}M</b></div>
              <p>${r.detail}</p>
              <div class="btn-row">
                <button class="btn-primary rep-approve" data-rid="${r.id}">✅ Phê duyệt</button>
                <button class="btn-danger rep-reject" data-rid="${r.id}">❌ Từ chối</button>
              </div>
            </div>`).join('')}
        </div>`}
      <div class="section-label">📌 Theo dõi Nhiệm vụ Chủ tịch đã giao (${(this.state.assignedTasks || []).length})</div>
      ${(this.state.assignedTasks || []).length === 0 ? `<div class="card-item"><p class="muted">Chưa có nhiệm vụ nào được giao. Hãy gặp trực tiếp các giám đốc/trưởng phòng để giao nhiệm vụ!</p></div>` : `
        <div class="scroll-list" style="max-height:180px;">
          ${this.state.assignedTasks.map((t) => `
            <div class="card-item">
              <div class="card-head"><strong>${t.title}</strong><span class="tag ${t.status === 'Hoàn thành' ? 'ok' : ''}">${t.status} (${t.progress}%)</span></div>
              <div class="muted">Phụ trách: <b>${t.owner}</b> · Phối hợp: ${t.collaborators} · Hạn: Tuần ${t.deadlineWeek}</div>
              ${t.finalReport ? `<p style="color:#86efac;">✅ Kết quả: ${t.finalReport}</p>` : ''}
            </div>`).join('')}
        </div>`}`;
  }

  renderOverviewTab() {
    const s = this.state;
    const weekFx = s.getCurrentWeekFixture();
    const ligue1 = s.clubs.filter((c) => c.league === 'Ligue 1').sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
    const rank = ligue1.findIndex((c) => c.name === 'Paris Saint-Germain') + 1;
    return `
      <div class="kpi-grid">
        <div class="kpi-card"><span>Ngân sách CLB</span><strong>€${s.finance.budget.toFixed(1)}M</strong></div>
        <div class="kpi-card"><span>Quỹ chuyển nhượng</span><strong>€${s.finance.transferBudget.toFixed(1)}M</strong></div>
        <div class="kpi-card"><span>Ligue 1</span><strong>Hạng ${rank || 1}</strong></div>
        <div class="kpi-card"><span>Uy tín / CĐV</span><strong>${s.president.prestige} / ${s.president.fanSupport}%</strong></div>
      </div>
      <div class="card-item ${weekFx ? 'urgent' : ''}">
        <div class="card-head"><strong>⚽ Lịch thi đấu Tuần ${s.week}</strong><span class="tag">${weekFx ? weekFx.comp : 'Đã hoàn thành'}</span></div>
        <p>${weekFx ? `${weekFx.round}: <b>${weekFx.home}</b> vs <b>${weekFx.away}</b> (Chưa thi đấu — không thể tua qua tuần)` : 'Bạn đã hoàn thành trận đấu tuần này và có thể qua tuần mới.'}</p>
        <div class="btn-row">
          <button class="btn-primary" id="ov-play-match">🏟️ Ra SVĐ Parc des Princes · Thi đấu 3D</button>
          <button class="btn-accent" id="ov-board">🏛️ Họp Ban Lãnh Đạo</button>
          <button class="btn-secondary" id="ov-player-meet">🗣️ Họp riêng cầu thủ</button>
        </div>
      </div>`;
  }

  renderDepartmentsTab() {
    return `<div class="scroll-list">${this.state.departments.map((d) => `
      <div class="card-item">
        <div class="card-head"><strong>${d.name}</strong><span class="tag ok">Hiệu suất ${d.performance}% · Hài lòng ${d.morale}%</span></div>
        <div class="muted">Trưởng phòng: <b>${d.head}</b> · Nhân sự: ${d.staffCount} · Ngân sách: €${d.budget}M/năm</div>
        <p>Đang làm: ${d.activeTask}</p>
        ${d.proposalApproved ? '' : `
          <p class="proposal-txt">💡 Đề xuất chờ duyệt: ${d.proposal}</p>
          <div class="btn-row">
            <button class="btn-primary dept-approve" data-dept="${d.id}">✅ Phê duyệt (-€1.2M, +5%)</button>
            <button class="btn-secondary dept-boost" data-dept="${d.id}">📌 Giao KPI (+3%)</button>
          </div>`}
      </div>`).join('')}</div>`;
  }

  renderFormationTab() {
    return renderFormationPitchTabHTML(this.state, this);
  }

  renderSquadTab() {
    const squad = this.state.getPsgSquad();
    return `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>#</th><th>Cầu thủ</th><th>VT</th><th>Tuổi</th><th>OVR/POT</th><th>Thể lực</th><th>Giá trị</th><th>Lương</th><th>Thao tác</th></tr></thead>
      <tbody>${squad.map((p) => `<tr>
        <td><b>${p.shirtNumber || '-'}</b></td>
        <td><button class="btn-xs btn-secondary open-profile-btn" data-pid="${p.id}">👤 ${p.name}</button> ${p.injuryDays > 0 ? `<span class="tag bad">🏥 ${p.injuryDays}n</span>` : ''}</td>
        <td>${p.position}</td><td>${p.age}</td><td><b>${p.ovr}</b>/${p.pot}</td>
        <td>${p.health?.fitness ?? 88}%</td><td>€${p.value}M</td><td>€${p.wage}k</td>
        <td><button class="btn-xs sq-meet" data-pid="${p.id}">🗣️ Họp riêng</button></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  renderAcademyTab() {
    const groups = ['U15', 'U17', 'U19', 'Đội dự bị'];
    const list = this.state.academy.filter((y) => y.squad === this.academyFilter && !y.promoted && !y.loanInfo);
    const props = (this.state.transferSystem.academyProposals || []).filter((pr) => pr.status === 'pending' || pr.status === 'evaluating');
    return `
      ${props.length > 0 ? `
        <div class="section-label" style="margin-top:0;">🌟 Đề xuất đôn Đội một từ Giám Đốc Học Viện (${props.length})</div>
        <div class="scroll-list" style="max-height:16vh;margin-bottom:8px;">
          ${props.map((pr) => `
            <div class="card-item urgent" style="padding:7px 10px;">
              <div class="card-head"><strong>${pr.playerName} (${pr.squad} · ${pr.position} · OVR ${pr.ovr}/POT ${pr.pot})</strong><span class="tag">${pr.status === 'evaluating' ? 'Đang đánh giá' : 'Đề xuất mới'}</span></div>
              <p class="muted">${pr.recommendation}</p>
              <div class="btn-row">
                <button class="btn-xs btn-primary ac-prop-act" data-yid="${pr.playerId}" data-act="promote">⬆️ Phê duyệt đôn Đội 1</button>
                <button class="btn-xs btn-secondary open-profile-btn" data-pid="${pr.playerId}">👤 Hồ sơ</button>
                <button class="btn-xs btn-accent ac-prop-act" data-yid="${pr.playerId}" data-act="evaluate">🔍 Đánh giá thêm</button>
                <button class="btn-xs btn-secondary ac-prop-act" data-yid="${pr.playerId}" data-act="loan">🔄 Cho mượn</button>
                <button class="btn-xs btn-secondary ac-prop-act" data-yid="${pr.playerId}" data-act="stay">⏳ Ở lại đội trẻ</button>
                <button class="btn-xs btn-danger ac-prop-act" data-yid="${pr.playerId}" data-act="reject">❌ Từ chối</button>
              </div>
            </div>`).join('')}
        </div>` : ''}
      <div class="btn-row" style="margin-bottom:8px;">${groups.map((g) => `<button class="tab-btn ${this.academyFilter === g ? 'active' : ''}" data-acgrp="${g}">${g} (${this.state.academy.filter((y) => y.squad === g && !y.promoted && !y.loanInfo).length})</button>`).join('')}</div>
      <div class="table-wrap" style="max-height:28vh;"><table class="data-table">
        <thead><tr><th>Cầu thủ trẻ</th><th>VT</th><th>Tuổi</th><th>OVR</th><th>POT</th><th>Tính cách</th><th>Quyết định</th></tr></thead>
        <tbody>${list.map((y) => `<tr><td><button class="btn-xs btn-secondary open-profile-btn" data-pid="${y.id}">👤 ${y.name}</button></td><td>${y.position}</td><td>${y.age}</td><td>${y.ovr}</td><td><b style="color:${y.pot >= 85 ? '#4ade80' : '#cbd5e1'}">${y.pot}</b></td><td>${y.personality}</td><td><button class="btn-xs ac-promote" data-yid="${y.id}">⬆️ Đôn Đội 1</button> <button class="btn-xs ac-train" data-yid="${y.id}">⚡ Tập Đội 1</button></td></tr>`).join('')}</tbody>
      </table></div>`;
  }

  renderTransfersTab() {
    const q = this.transferSearch.toLowerCase();
    const list = this.state.players.filter((p) =>
      p.club !== 'Paris Saint-Germain' &&
      (this.transferPos === 'ALL' || p.position === this.transferPos) &&
      (this.transferTier === 'ALL' || p.tier === this.transferTier) &&
      (!q || p.name.toLowerCase().includes(q) || p.club.toLowerCase().includes(q))
    ).slice(0, 60);
    return `
      <div class="filter-bar">
        <input id="tr-search" class="input-ctrl" placeholder="Tìm trong 200 cầu thủ thật..." value="${this.transferSearch}" />
        <select id="tr-pos" class="input-ctrl"><option value="ALL">Mọi vị trí</option>${['GK','CB','LB','RB','DM','CM','AM','LW','RW','ST'].map((pos) => `<option value="${pos}" ${this.transferPos === pos ? 'selected' : ''}>${pos}</option>`).join('')}</select>
        <select id="tr-tier" class="input-ctrl"><option value="ALL">Mọi phân khúc</option>${['Siêu sao','Đẳng cấp cao','Triển vọng','Chất lượng tốt','Ít tên tuổi hơn'].map((t) => `<option value="${t}" ${this.transferTier === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Cầu thủ</th><th>CLB</th><th>VT</th><th>OVR/POT</th><th>Giá</th><th>Phân khúc</th><th>Đàm phán</th></tr></thead>
        <tbody>${list.map((p) => `<tr><td><b>${p.name}</b></td><td>${p.club}</td><td>${p.position}</td><td><b>${p.ovr}</b>/${p.pot}</td><td>€${p.value}M</td><td><span class="tag">${p.tier}</span></td><td><button class="btn-xs tr-neg" data-pid="${p.id}">✍️ Đàm phán</button></td></tr>`).join('')}</tbody>
      </table></div>`;
  }

  openTransferNegotiation(playerId) {
    const p = this.state.players.find((x) => x.id === playerId);
    if (!p) return;
    const askFee = Math.round(p.value * 1.12);
    const askWage = Math.round(p.wage * 1.15);
    const html = `
      <div class="card-item"><h4>📋 ${p.name} (${p.club}) · OVR ${p.ovr}/${p.pot}</h4><p class="muted">Định giá: €${askFee}M · Kỳ vọng lương: €${askWage}k/tuần</p></div>
      <div class="form-row"><label>Hình thức:</label><select id="neg-type" class="input-ctrl"><option value="buy">Mua đứt</option><option value="loan">Cho mượn (18% phí)</option><option value="loan_buy">Mượn kèm mua đứt</option></select></div>
      <div class="form-row"><label>Phí đề nghị (€M):</label><input id="neg-fee" type="number" class="input-ctrl" value="${askFee}" /></div>
      <div class="form-row"><label>Lương (k€/tuần):</label><input id="neg-wage" type="number" class="input-ctrl" value="${askWage}" /></div>
      <div class="btn-row" style="margin-top:10px;"><button class="btn-primary" id="neg-submit">✅ Phê duyệt & Ký</button><button class="btn-secondary" id="neg-back">↩️ Quay lại</button></div>`;
    this.openModal(`🤝 ĐÀM PHÁN · ${p.name.toUpperCase()}`, html, 'normal');
    document.getElementById('neg-back')?.addEventListener('click', () => this.openComputer('transfers'));
    document.getElementById('neg-submit')?.addEventListener('click', () => {
      const type = document.getElementById('neg-type')?.value || 'buy';
      const rawFee = Number(document.getElementById('neg-fee')?.value || askFee);
      const offerWage = Number(document.getElementById('neg-wage')?.value || askWage);
      const fee = type === 'buy' ? rawFee : Math.max(2, Math.round(rawFee * 0.18));
      if (fee > this.state.finance.transferBudget) { this.audio.playAlert(); this.toast('Không đủ quỹ chuyển nhượng!', 'error'); return; }
      if (type === 'buy' && rawFee < p.value * 0.92) { this.audio.playAlert(); this.toast(`${p.club} từ chối mức giá quá thấp!`, 'error'); return; }
      const oldClub = p.club;
      p.club = 'Paris Saint-Germain'; p.wage = offerWage; p.contractYears = type === 'buy' ? 5 : 1;
      this.state.addLedger(`${type === 'buy' ? 'Mua' : 'Mượn'} ${p.name} từ ${oldClub}`, -fee);
      PressNewsSystem.generateTransferNews(this.state, p.name, oldClub, fee, true);
      this.state.formationSystem.notify();
      this.audio.playSuccess(); this.toast(`🎉 Chào mừng ${p.name} gia nhập PSG!`, 'success');
      this.openComputer('squad');
    });
  }

  renderCoachTab() {
    const c = this.state.coach;
    return `
      <div class="card-item">
        <div class="card-head"><strong>👔 HLV Trưởng: ${c.name}</strong><span class="tag ok">HĐ còn ${c.contractYears} năm · €${c.wage}k/tuần</span></div>
        <p>Sơ đồ: <b>${c.formation}</b> · Lịch duy trì sân tập: <b>09:00–11:30 & 15:00–17:00</b></p>
        <div class="btn-row" style="margin-top:8px;">
          <button class="btn-primary" id="coach-extend">✍️ Gia hạn +2 năm</button>
          <button class="btn-danger" id="coach-replace">🔄 Bổ nhiệm Xabi Alonso (€8M)</button>
        </div>
      </div>`;
  }

  renderFinanceTab() {
    const f = this.state.finance;
    return `
      <div class="kpi-grid">
        <div class="kpi-card"><span>Ngân sách</span><strong>€${f.budget.toFixed(1)}M</strong></div>
        <div class="kpi-card"><span>Chuyển nhượng</span><strong>€${f.transferBudget.toFixed(1)}M</strong></div>
        <div class="kpi-card"><span>Lương / tuần</span><strong>€${f.weeklyWages}M</strong></div>
        <div class="kpi-card"><span>FFP</span><strong>${f.ffpStatus}</strong></div>
      </div>
      <div class="scroll-list">${f.ledger.map((l) => `<div class="card-item"><div class="card-head"><span>${l.date} — ${l.desc}</span><b style="color:${l.amount >= 0 ? '#4ade80' : '#f87171'}">${l.amount >= 0 ? '+' : ''}€${l.amount}M</b></div></div>`).join('')}</div>`;
  }

  renderLeaguesTab() {
    const ligue1 = this.state.clubs.filter((c) => c.league === 'Ligue 1').sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
    const upcoming = this.state.fixtures.filter((f) => !f.played).slice(0, 4);
    return `
      <div class="grid-2" style="margin-bottom:8px;">${upcoming.map((f, i) => `<div class="card-item"><div class="card-head"><span class="tag">${f.comp}</span><span class="muted">Tuần ${f.week}</span></div><div><b>${f.home}</b> vs <b>${f.away}</b></div>${i === 0 ? `<button class="btn-xs btn-primary" id="lg-play-now" style="margin-top:6px;">⚽ Thi đấu 3D</button>` : ''}</div>`).join('')}</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>#</th><th>CLB</th><th>Trận</th><th>T</th><th>H</th><th>B</th><th>HS</th><th>Điểm</th></tr></thead>
        <tbody>${ligue1.map((c, i) => `<tr class="${c.name === 'Paris Saint-Germain' ? 'highlight-row' : ''}"><td>${i + 1}</td><td><b>${c.name}</b></td><td>${c.played}</td><td>${c.won}</td><td>${c.drawn}</td><td>${c.lost}</td><td>${c.gf - c.ga}</td><td><b>${c.pts}</b></td></tr>`).join('')}</tbody>
      </table></div>`;
  }

  renderMediaTab() {
    const cats = ['ALL', 'Tin PSG', 'Trước trận', 'Sau trận', 'Chuyển nhượng', 'Champions League', 'Nội bộ', 'SAVED'];
    const labels = { ALL: 'Tất cả', SAVED: '🔖 Đã lưu' };
    const articles = (this.state.newsArchive || []).filter((a) =>
      this.newsCategory === 'ALL' ? true : this.newsCategory === 'SAVED' ? a.saved : a.category === this.newsCategory
    );

    if (this.activeArticleId) {
      const art = (this.state.newsArchive || []).find((x) => x.id === this.activeArticleId);
      if (art) {
        art.read = true;
        return `
          <div class="btn-row" style="margin-bottom:8px;">
            <button class="btn-secondary" id="news-back">← Quay lại Tòa soạn</button>
            <button class="btn-accent" id="news-save" data-nid="${art.id}">${art.saved ? '🔖 Đã lưu' : '📑 Lưu bài viết'}</button>
          </div>
          <div class="card-item">
            <img src="${art.image}" alt="${art.title}" style="width:100%;max-height:210px;object-fit:cover;border-radius:10px;margin-bottom:8px;" />
            <div class="card-head"><span class="tag">${art.outlet} · ${art.category}</span><span class="tag ok">${art.tagType}</span></div>
            <h3 style="margin:6px 0;font-size:16px;">${art.title}</h3>
            <div class="muted" style="margin-bottom:8px;">${art.date} · ❤️ ${art.likes.toLocaleString('vi-VN')} lượt quan tâm</div>
            <p style="line-height:1.6;">${art.body}</p>
          </div>
          <div class="section-label">💬 Bình luận người hâm mộ PSG (${art.comments.length})</div>
          ${art.comments.map((c) => `<div class="card-item"><b>${c.user}</b>: ${c.text}</div>`).join('')}`;
      }
    }

    return `
      <div class="tab-strip">
        ${cats.map((c) => `<button class="tab-btn ${this.newsCategory === c ? 'active' : ''}" data-ncat="${c}">${labels[c] || c}</button>`).join('')}
      </div>
      <div class="kpi-mini" style="margin-bottom:8px;">
        <span>Uy tín CLB: <b>${this.state.president.prestige}/100</b></span>
        <span>Ủng hộ CĐV: <b>${this.state.president.fanSupport}%</b></span>
        <span>Niềm tin Ban LĐ: <b>${this.state.president.boardTrust}%</b></span>
        <span>Kho lưu trữ: <b>${(this.state.newsArchive || []).length} bài</b></span>
      </div>
      <div class="grid-2">
        ${articles.slice(0, 12).map((a) => `
          <div class="card-item news-card" data-open-news="${a.id}" style="cursor:pointer;">
            <img src="${a.image}" alt="${a.title}" loading="lazy" style="width:100%;height:112px;object-fit:cover;border-radius:8px;margin-bottom:6px;" />
            <div class="card-head"><span class="tag">${a.outlet} · ${a.category}</span><span class="muted">${a.tagType}</span></div>
            <div style="font-weight:700;font-size:12.5px;margin:4px 0;color:#fff;">${a.title}</div>
            <p class="muted">${a.summary}</p>
          </div>`).join('')}
      </div>`;
  }

  renderHistorySaveTab() {
    return `
      <div class="section-label">🔄 Tự động lưu khi thoát (Auto-Save)</div>
      <div class="card-item" style="border-color:rgba(212,175,55,0.45);">
        <div class="card-head"><strong>Tiến trình tự động (Khôi phục ngay khi mở lại game)</strong><span class="tag ok">Đang bật</span></div>
        <div class="muted" id="meta-autosave">Đang kiểm tra bản tự động lưu...</div>
        <div class="btn-row" style="margin-top:6px;">
          <button class="btn-xs btn-primary" id="sv-auto-now">💾 Lưu tự động ngay</button>
          <button class="btn-xs btn-danger" id="sv-reset-new">🔄 Chơi lại từ đầu</button>
        </div>
      </div>
      <div class="section-label">💾 Lưu / Tải Game Thủ Công (3 Ô lưu)</div>
      <div class="grid-3">${['slot_1', 'slot_2', 'slot_3'].map((id, i) => `<div class="card-item"><strong>Ô lưu ${i + 1}</strong><div class="muted" id="meta-${id}">Đang kiểm tra...</div><div class="btn-row" style="margin-top:6px;"><button class="btn-xs btn-primary sv-save" data-slot="${id}">💾 Lưu</button><button class="btn-xs btn-secondary sv-load" data-slot="${id}">📂 Tải</button></div></div>`).join('')}</div>
      <div class="section-label">🏛️ Biên bản Họp Ban Lãnh Đạo (${this.state.meetingMinutes.length})</div>
      <div class="scroll-list" style="max-height:110px;">${this.state.meetingMinutes.map((m) => `<div class="card-item"><div class="card-head"><strong>${m.topic}</strong><span class="muted">${m.date}</span></div><p>${m.decision}</p></div>`).join('')}</div>`;
  }

  bindComputerTabEvents(tab) {
    if (tab === 'reports') {
      document.querySelectorAll('.rep-approve').forEach((b) => {
        b.addEventListener('click', () => {
          const rep = this.state.resolvePendingReport(b.dataset.rid, true);
          this.audio.playSuccess();
          if (rep) this.toast(`Đã phê duyệt "${rep.title}" — Báo cáo đã được xử lý xong!`, 'success');
          this.openComputer('reports');
        });
      });
      document.querySelectorAll('.rep-reject').forEach((b) => {
        b.addEventListener('click', () => {
          const rep = this.state.resolvePendingReport(b.dataset.rid, false);
          this.audio.playClick();
          if (rep) this.toast(`Đã từ chối "${rep.title}".`, 'info');
          this.openComputer('reports');
        });
      });
    } else if (tab === 'overview') {
      document.getElementById('ov-play-match')?.addEventListener('click', () => { this.closeModal(); this.cb.startMatch(); });
      document.getElementById('ov-board')?.addEventListener('click', () => this.openBoardMeeting());
      document.getElementById('ov-player-meet')?.addEventListener('click', () => this.openPlayerMeetingSelector());
    } else if (tab === 'departments') {
      document.querySelectorAll('.dept-approve').forEach((b) => {
        b.addEventListener('click', () => {
          const d = this.state.departments.find((x) => x.id === b.dataset.dept);
          if (!d) return;
          d.proposalApproved = true; // Biến mất sau khi duyệt!
          d.performance = Math.min(100, d.performance + 5);
          d.morale = Math.min(100, d.morale + 5);
          this.state.addLedger(`Phê duyệt đề xuất của ${d.name}`, -1.2);
          this.audio.playSuccess();
          this.toast(`Đã duyệt đề xuất của ${d.name}!`, 'success');
          this.openComputer('departments');
        });
      });
      document.querySelectorAll('.dept-boost').forEach((b) => {
        b.addEventListener('click', () => {
          const d = this.state.departments.find((x) => x.id === b.dataset.dept);
          if (!d) return;
          d.performance = Math.min(100, d.performance + 3);
          this.audio.playClick();
          this.toast(`Đã giao KPI mới cho ${d.name}.`, 'info');
          this.openComputer('departments');
        });
      });
    } else if (tab === 'formation') {
      bindFormationPitchEvents(this.state, this, () => this.openComputer('formation'));
    }

    // Sự kiện dùng chung trên mọi tab macOS: bấm vào tên cầu thủ mở Hồ sơ 8 tab!
    document.querySelectorAll('.open-profile-btn').forEach((b) => {
      b.addEventListener('click', () => this.openPlayerProfileModal(b.dataset.pid, 'overview'));
    });

    if (tab === 'squad') {
      document.querySelectorAll('.sq-meet').forEach((b) => b.addEventListener('click', () => this.openPlayerMeetingSelector(b.dataset.pid)));
    } else if (tab === 'training') {
      document.querySelectorAll('[data-trtab]').forEach((b) => b.addEventListener('click', () => { this.trainingSubTab = b.dataset.trtab; this.openComputer('training'); }));
      document.getElementById('tr-go-pitch')?.addEventListener('click', () => { this.cb.teleport('stadium_pitch'); this.closeModal(); this.toast('🏟️ Đã di chuyển vào SVĐ Parc des Princes quan sát toàn đội tập luyện 3D!', 'info'); });
      document.getElementById('tr-run-eval')?.addEventListener('click', () => {
        const rep = this.state.trainingSystem.concludeTrainingSession();
        this.audio.playSuccess();
        this.trainingSubTab = 'reports';
        this.toast(`📊 Đã hoàn tất đánh giá buổi tập (${rep.completionPct}%) · Có báo cáo mới từ BHL!`, 'success');
        this.openComputer('training');
      });
      document.getElementById('tr-focus-sel')?.addEventListener('change', (e) => {
        this.state.trainingSystem.applyTrainingFocus(e.target.value);
        this.audio.playSuccess();
        this.toast(`Đã chuyển trọng tâm giáo án sang: ${e.target.value}`, 'success');
        this.openComputer('training');
      });
      document.getElementById('tr-int-sel')?.addEventListener('change', (e) => {
        this.state.trainingSystem.setIntensity(e.target.value);
        this.audio.playSuccess();
        this.toast(`Đã đổi cường độ tập sang: ${e.target.value}`, 'info');
        this.openComputer('training');
      });
      document.querySelectorAll('.ci-btn').forEach((b) => {
        b.addEventListener('click', () => {
          const res = this.state.trainingSystem.respondToCoachInteraction(b.dataset.ciid, b.dataset.act);
          this.audio.playSuccess();
          this.toast(res.message, 'info');
          this.openComputer('training');
        });
      });
      document.querySelectorAll('.ci-inspect').forEach((b) => {
        b.addEventListener('click', () => this.openPlayerProfileModal(b.dataset.pid, 'health'));
      });
    } else if (tab === 'academy') {
      document.querySelectorAll('[data-acgrp]').forEach((b) => b.addEventListener('click', () => { this.academyFilter = b.dataset.acgrp; this.openComputer('academy'); }));
      document.querySelectorAll('.ac-prop-act').forEach((b) => {
        b.addEventListener('click', () => {
          const res = this.state.transferSystem.respondToAcademyProposal(b.dataset.yid, b.dataset.act);
          if (res.ok) {
            this.audio.playSuccess();
            this.toast(res.message || `🎉 Đã đôn ${res.player?.name} (ID ${res.player?.id}) lên Đội một PSG & cấp tủ cá nhân!`, 'success');
          } else {
            this.audio.playAlert();
            this.toast(res.error || 'Không thể thực hiện.', 'error');
          }
          this.openComputer('academy');
        });
      });
      document.querySelectorAll('.ac-promote').forEach((b) => {
        b.addEventListener('click', () => {
          const res = this.state.transferSystem.promoteAcademyPlayer(b.dataset.yid);
          if (res.ok) {
            this.audio.playSuccess();
            this.toast(`🎓 Đã đôn ${res.player.name} (giữ nguyên ID ${res.player.id}) lên Đội một #${res.player.shirtNumber} & cấp tủ 3D!`, 'success');
          } else {
            this.audio.playAlert();
            this.toast(res.error, 'error');
          }
          this.openComputer('academy');
        });
      });
      document.querySelectorAll('.ac-train').forEach((b) => {
        b.addEventListener('click', () => {
          const y = this.state.academy.find((x) => x.id === b.dataset.yid);
          if (!y) return;
          y.trainingWithFirstTeam = true; y.ovr = Math.min(y.pot, y.ovr + 1);
          this.audio.playClick(); this.toast(`${y.name} đã lên tập cùng Đội một!`, 'info'); this.openComputer('academy');
        });
      });
    } else if (tab === 'transfers') {
      document.querySelectorAll('[data-trsub]').forEach((b) => b.addEventListener('click', () => { this.transferSubTab = b.dataset.trsub; this.openComputer('transfers'); }));
      const bindFilter = (id, key, evt = 'change') => {
        document.getElementById(id)?.addEventListener(evt, (e) => { this.transferFilters[key] = e.target.value; this.openComputer('transfers'); });
      };
      bindFilter('tf-search', 'search'); bindFilter('tf-club', 'club'); bindFilter('tf-nat', 'nat');
      bindFilter('tf-pos', 'pos'); bindFilter('tf-minovr', 'minOvr'); bindFilter('tf-minpot', 'minPot');
      bindFilter('tf-maxage', 'maxAge'); bindFilter('tf-maxval', 'maxVal'); bindFilter('tf-maxwage', 'maxWage'); bindFilter('tf-maxct', 'maxContract');

      document.querySelectorAll('.tr-start-neg').forEach((b) => {
        b.addEventListener('click', () => {
          const res = this.state.transferSystem.startNegotiation(b.dataset.pid, 'buy');
          if (!res.ok) { this.audio.playAlert(); this.toast(res.error, 'error'); return; }
          this.openTwoStageTransferModal(res.negotiation.id);
        });
      });
      document.querySelectorAll('.tr-resume-neg').forEach((b) => {
        b.addEventListener('click', () => this.openTwoStageTransferModal(b.dataset.negid));
      });
      document.querySelectorAll('.tr-accept-bid').forEach((b) => {
        b.addEventListener('click', () => {
          const bid = this.state.transferSystem.incomingBids.find((x) => x.id === b.dataset.bid);
          if (!bid) return;
          const res = this.state.transferSystem.sellPlayer(bid.playerId, bid.buyerClub, bid.fee);
          if (res.ok) { this.audio.playSuccess(); this.toast(`💰 Đã bán ${bid.playerName} sang ${bid.buyerClub} (+€${bid.fee}M)!`, 'success'); }
          else { this.audio.playAlert(); this.toast(res.error, 'error'); }
          this.openComputer('transfers');
        });
      });
      document.querySelectorAll('.tr-reject-bid').forEach((b) => {
        b.addEventListener('click', () => {
          this.state.transferSystem.incomingBids = this.state.transferSystem.incomingBids.filter((x) => x.id !== b.dataset.bid);
          this.audio.playClick(); this.toast('Đã từ chối lời hỏi mua.', 'info'); this.openComputer('transfers');
        });
      });
      document.querySelectorAll('.tr-toggle-list').forEach((b) => {
        b.addEventListener('click', () => {
          const p = this.state.getPlayerById(b.dataset.pid);
          if (p) { p.transferListed = !p.transferListed; this.audio.playClick(); this.openComputer('transfers'); }
        });
      });
      document.querySelectorAll('.tr-quick-sell').forEach((b) => {
        b.addEventListener('click', () => {
          const p = this.state.getPlayerById(b.dataset.pid);
          if (!p) return;
          const res = this.state.transferSystem.sellPlayer(p.id, null, p.value);
          if (res.ok) { this.audio.playSuccess(); this.toast(`💰 Đã bán ${p.name} sang ${res.deal.to} (+€${res.deal.fee}M) & giải phóng tủ 3D!`, 'success'); }
          else { this.audio.playAlert(); this.toast(res.error, 'error'); }
          this.openComputer('transfers');
        });
      });
      document.querySelectorAll('.tr-loan-out').forEach((b) => {
        b.addEventListener('click', () => {
          const p = this.state.getPlayerById(b.dataset.pid);
          if (!p) return;
          const res = this.state.transferSystem.loanOutPlayer(p.id, 'RC Strasbourg Alsace', Math.round(p.value * 1.1));
          if (res.ok) { this.audio.playSuccess(); this.toast(`🔄 Đã cho mượn ${p.name} tới ${res.deal.to}!`, 'success'); }
          else { this.audio.playAlert(); this.toast(res.error, 'error'); }
          this.openComputer('transfers');
        });
      });
      document.querySelectorAll('.tr-renew-psg').forEach((b) => {
        b.addEventListener('click', () => {
          const p = this.state.getPlayerById(b.dataset.pid);
          if (!p) return;
          p.contractYears += 3;
          p.wage = Math.round(p.wage * 1.1);
          if (p.contract) { p.contract.contractYears = p.contractYears; p.contract.weeklyWage = p.wage; p.contract.renewalStatus = 'Ổn định'; }
          this.audio.playSuccess(); this.toast(`✍️ Đã gia hạn hợp đồng với ${p.name} (+3 năm)!`, 'success'); this.openComputer('transfers');
        });
      });
      document.getElementById('tr-sim-ai')?.addEventListener('click', () => {
        const created = this.state.transferSystem.runAiTransferMarketCycle(4);
        this.state.transferSystem.generateIncomingBids(2);
        this.audio.playSuccess();
        this.toast(`🌐 Thị trường AI đã hoàn tất ${created.length} thương vụ mới!`, 'success');
        this.openComputer('transfers');
      });
      document.getElementById('tr-close-win')?.addEventListener('click', () => {
        const res = this.state.transferSystem.closeCurrentWindow(true);
        if (res.ok) { this.audio.playSuccess(); this.toast(`🔒 Đã đóng kỳ chuyển nhượng và gửi báo cáo cho Chủ tịch!`, 'info'); }
        this.openComputer('transfers');
      });
      document.getElementById('tr-open-win')?.addEventListener('click', () => {
        this.state.transferSystem.openWindow('winter');
        this.audio.playSuccess(); this.toast('🟢 Đã mở kỳ chuyển nhượng Mùa Đông!', 'success'); this.openComputer('transfers');
      });
    } else if (tab === 'events') {
      document.querySelectorAll('[data-setab]').forEach((b) => b.addEventListener('click', () => { this.eventSubTab = b.dataset.setab; this.openComputer('events'); }));
      document.querySelectorAll('.se-start-evt').forEach((b) => {
        b.addEventListener('click', () => {
          const res = this.state.signingEventSystem.startEvent(b.dataset.evtid);
          if (res.ok) {
            this.audio.playSuccess();
            this.closeModal();
            this.cb.setEventCamera?.('signing_desk');
            this.openLiveCeremonySheet();
            this.toast(`🎬 Bắt đầu ${res.event.eventTypeLabel} cho ${res.event.subjectName}!`, 'success');
          } else {
            this.audio.playAlert();
            this.toast(res.error, 'error');
          }
        });
      });
      document.querySelector('.se-resume-live')?.addEventListener('click', () => {
        const evt = this.state.signingEventSystem.activeEvent;
        if (!evt) return;
        this.closeModal();
        this.cb.setEventCamera?.(evt.phase === 'press_conference' ? 'wide_stage' : 'signing_desk');
        this.openLiveCeremonySheet();
      });
      document.querySelector('.se-open-tv')?.addEventListener('click', () => { this.eventSubTab = 'psgtv'; this.openComputer('events'); });
      document.querySelector('.se-create-sponsor')?.addEventListener('click', () => {
        const res = this.state.signingEventSystem.triggerCommercialEvent('major_sponsor', 'Qatar Airways Global', 25);
        if (res.ok) { this.audio.playSuccess(); this.toast('✈️ Đã tạo Sự kiện Ký Tài Trợ Chiến Lược (+€25M)!', 'success'); this.openComputer('events'); }
        else this.toast(res.error, 'info');
      });
      document.querySelector('.se-create-partner')?.addEventListener('click', () => {
        const res = this.state.signingEventSystem.triggerCommercialEvent('commercial_partner', 'Dior Paris Luxury', 14);
        if (res.ok) { this.audio.playSuccess(); this.toast('💎 Đã tạo Sự kiện Công Bố Đối Tác Thương Mại (+€14M)!', 'success'); this.openComputer('events'); }
        else this.toast(res.error, 'info');
      });
      document.querySelector('.se-goto-signing')?.addEventListener('click', () => { this.cb.teleport('signing_room'); this.closeModal(); this.toast('🏢 Đã đến Phòng Ký Hợp Đồng Cao Cấp 3D!', 'info'); });
      document.querySelector('.se-goto-press')?.addEventListener('click', () => { this.cb.teleport('press_hall'); this.closeModal(); this.toast('🎙️ Đã đến Phòng Họp Báo & Trường Quay PSG TV!', 'info'); });
      document.querySelectorAll('.psgtv-cam').forEach((b) => {
        b.addEventListener('click', () => {
          this.state.signingEventSystem.broadcast.setCameraAngle(b.dataset.camkey);
          this.cb.setEventCamera?.(b.dataset.camkey);
          this.audio.playClick();
          this.openComputer('events');
        });
      });
    } else if (tab === 'coach') {
      document.querySelectorAll('[data-stftab]').forEach((b) => b.addEventListener('click', () => { this.staffSubTab = b.dataset.stftab; this.openComputer('coach'); }));
      document.getElementById('stf-extend-hc')?.addEventListener('click', () => {
        this.state.managerSystem.extendStaffContract('head_coach', 2, 0.08);
        this.audio.playSuccess(); this.toast('✍️ Đã gia hạn hợp đồng HLV trưởng (+2 năm)!', 'success'); this.openComputer('coach');
      });
      document.getElementById('stf-fire-hc')?.addEventListener('click', () => this.openFireStaffModal('head_coach'));
      document.querySelectorAll('.stf-open-neg').forEach((b) => b.addEventListener('click', () => this.openStaffNegotiationModal(b.dataset.sid)));
      document.querySelectorAll('.stf-fire-role').forEach((b) => b.addEventListener('click', () => this.openFireStaffModal(b.dataset.rkey)));
      document.querySelectorAll('.stf-recruit-role').forEach((b) => b.addEventListener('click', () => this.openRoleCandidatesModal(b.dataset.rkey)));
    } else if (tab === 'leagues') {
      document.getElementById('lg-play-now')?.addEventListener('click', () => { this.closeModal(); this.cb.startMatch(); });
    } else if (tab === 'museum') {
      document.getElementById('mus-walk-3d')?.addEventListener('click', () => {
        this.audio.playDoor();
        this.cb.teleport('museum_entrance');
        this.closeModal();
        this.toast('🏛️ Đã tới trước Cổng Bảo Tàng PARIS SAINT-GERMAIN CLUB MUSEUM! Bước vào để cửa kính tự động mở.', 'info');
      });
      document.querySelectorAll('.mus-tab-btn').forEach((b) => b.addEventListener('click', () => {
        this.audio.playClick();
        this.museumSubTab = b.dataset.mustab || 'history';
        this.openComputer('museum');
      }));
      document.querySelectorAll('.mus-open-trophy').forEach((b) => b.addEventListener('click', () => {
        this.audio.playClick();
        this.openTrophyDetail(b.dataset.tid);
      }));
      document.querySelectorAll('.mus-open-legend').forEach((b) => b.addEventListener('click', () => {
        this.audio.playClick();
        this.openLegendDetail(b.dataset.lid);
      }));
      document.querySelectorAll('.mus-open-season').forEach((b) => b.addEventListener('click', () => {
        this.audio.playClick();
        this.openSeasonArchive(b.dataset.season);
      }));
    } else if (tab === 'media') {
      document.querySelectorAll('[data-ncat]').forEach((b) => b.addEventListener('click', () => {
        this.newsCategory = b.dataset.ncat; this.activeArticleId = null;
        this.openComputer('media');
      }));
      document.querySelectorAll('[data-open-news]').forEach((card) => card.addEventListener('click', () => {
        this.activeArticleId = card.dataset.openNews; this.openComputer('media');
      }));
      document.getElementById('news-back')?.addEventListener('click', () => {
        this.activeArticleId = null;
        this.openComputer('media');
      });
      document.getElementById('news-save')?.addEventListener('click', (e) => {
        const a = this.state.newsArchive.find((x) => x.id === e.target.dataset.nid);
        if (a) { a.saved = !a.saved; this.audio.playClick(); this.openComputer('media'); }
      });
    } else if (tab === 'history') {
      this.saveManager.loadAuto().then((rec) => {
        const el = document.getElementById('meta-autosave');
        if (el) el.textContent = rec ? `${rec.summary} (Lưu lúc ${rec.savedAt})` : 'Chưa có bản tự động lưu (sẽ tự lưu khi thoát hoặc mỗi 30 giây)';
      });
      document.getElementById('sv-auto-now')?.addEventListener('click', async () => {
        await this.cb.autoSaveNow?.(true);
        this.audio.playSuccess();
        this.toast('Đã lưu tự động tiến trình hiện tại!', 'success');
        this.openComputer('history');
      });
      let resetArmed = false;
      document.getElementById('sv-reset-new')?.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        if (!resetArmed) {
          resetArmed = true;
          btn.textContent = '⚠️ Bấm lần nữa để xác nhận chơi mới';
          setTimeout(() => {
            if (resetArmed) {
              resetArmed = false;
              btn.textContent = '🔄 Chơi lại từ đầu';
            }
          }, 4000);
          return;
        }
        this.cb.resetNewGame?.();
      });
      this.saveManager.listSlots().then((slots) => {
        slots.forEach(({ id, rec }) => { const el = document.getElementById(`meta-${id}`); if (el) el.textContent = rec ? `${rec.summary} (${rec.savedAt})` : 'Ô trống'; });
      });
      document.querySelectorAll('.sv-save').forEach((b) => b.addEventListener('click', async () => {
        const res = await this.saveManager.saveSlot(b.dataset.slot, this.cb.exportSnapshot());
        this.audio.playSuccess(); this.toast(res.ok ? `Đã lưu ${b.dataset.slot}!` : 'Lỗi lưu.', res.ok ? 'success' : 'error'); this.openComputer('history');
      }));
      document.querySelectorAll('.sv-load').forEach((b) => b.addEventListener('click', async () => {
        const rec = await this.saveManager.loadSlot(b.dataset.slot);
        if (!rec) { this.toast('Ô trống.', 'warn'); return; }
        this.cb.importSnapshot(rec.data); this.cb.autoSaveNow?.(true); this.audio.playSuccess(); this.toast('Đã tải game!', 'success'); this.closeModal();
      }));
    }
  }

  // === QUY TRÌNH NGÀY THI ĐẤU 4 GIAI ĐOẠN (CHỦ TỊCH PHẠM MINH CHIÊU) ===
  openMatchdayFlow() {
    const fx = this.state.getCurrentWeekFixture() || this.state.getNextFixture();
    if (!fx) {
      const { summary } = this.state.concludeSeason();
      this.cb.refreshMuseumAndTv?.();
      this.cb.autoSaveNow?.(true);
      const nextTrophy = this.state.trophySystem?.popNextCelebration?.();
      if (nextTrophy) {
        this.audio.playSuccess();
        this.openCoronationCelebration(nextTrophy);
      } else {
        this.toast(`Đã tổng kết mùa ${summary.season} & sang mùa giải mới ${this.state.season}!`, 'success');
      }
      return;
    }
    const rep = MatchSimulationEngine.buildPreMatchCoachReport(fx, this.state);
    const directives = [
      ['cheer', '👏 1. Chúc toàn đội thi đấu tốt (+Tinh thần)'],
      ['coach', `🤝 2. Động viên HLV trưởng ${this.state.coach?.name || 'PSG'} (+Tâm lý BHL)`],
      ['rest', '🛡️ 3. Yêu cầu ưu tiên bảo toàn thể lực (-Rủi ro chấn thương)'],
      ['win', '🔥 4. Yêu cầu tập trung giành chiến thắng (+Động lực tấn công)'],
      ['youth', '🎓 5. Yêu cầu tạo cơ hội cho cầu thủ trẻ'],
      ['none', '📋 6. Không đưa ra chỉ đạo (Giao toàn quyền cho HLV)']
    ];

    const html = `
      <div class="card-item urgent">
        <div class="card-head"><strong>📢 THÔNG BÁO NGÀY THI ĐẤU · ${fx.comp}</strong><span class="tag">${fx.round}</span></div>
        <h3 style="margin:6px 0;font-size:16px;">${fx.home}  vs  ${fx.away}</h3>
        <div class="muted">📅 ${fx.date} · ⏰ ${fx.time} · 🏟️ ${fx.stadium} · Trạng thái: <b>${fx.status}</b></div>
      </div>
      <div class="card-item">
        <div class="card-head"><strong>👔 Báo cáo trước trận của HLV ${rep.coachName}</strong><span class="tag ok">${rep.formation}</span></div>
        <p>"${rep.summary}"</p>
        <div class="muted" style="margin-top:6px;">
          <b>Sơ đồ đồng bộ (${this.state.formationSystem.formation}):</b> ${this.state.formationSystem.getFormationData().starters.map((s) => `#${s.shirtNumber} ${s.displayName}${s.isCaptain ? ' (C)' : ''}`).join(' · ')}<br/>
          <b>Độ phù hợp chiến thuật AI TB:</b> <span style="color:#4ade80;font-weight:700;">${rep.avgSuitability ?? '--'}/100</span><br/>
          <b>Phong độ cao:</b> ${rep.inForm.map((p) => `${p.name} (${p.form})`).join(' · ')}<br/>
          <b>Chấn thương / Vắng mặt:</b> ${rep.injured.length ? rep.injured.map((p) => `${p.name} (${p.injuryDays}n)`).join(', ') : 'Không có'} · <b>Điểm cần lưu ý:</b> ${rep.vulnerable}
        </div>
      </div>
      <div class="section-label">Giai đoạn 3: Ý kiến của Chủ tịch Phạm Minh Chiêu → Tự động mô phỏng trận đấu</div>
      <div class="grid-2">
        ${directives.map(([k, txt]) => `<button class="btn-primary md-dir" data-dir="${k}" style="text-align:left;">${txt}</button>`).join('')}
      </div>
      <div class="btn-row" style="margin-top:8px;align-items:center;">
        <select id="md-kit-select" class="input-ctrl" aria-label="Chọn áo đấu PSG trận này" style="max-width:190px;">
          <option value="home" ${(this.state.activeKit || 'home') === 'home' ? 'selected' : ''}>👕 Áo Sân nhà PSG</option>
          <option value="away" ${this.state.activeKit === 'away' ? 'selected' : ''}>👕 Áo Sân khách PSG</option>
          <option value="third" ${this.state.activeKit === 'third' ? 'selected' : ''}>👕 Áo Thứ ba PSG</option>
        </select>
        <button class="btn-secondary" id="md-open-news">📰 Tin báo chí trước trận</button>
        <button class="btn-accent" id="md-open-form">👕 Chỉnh Sơ đồ đội hình</button>
      </div>`;

    this.openModal('⚽ NGÀY THI ĐẤU — PARIS SAINT-GERMAIN', html, 'wide');
    document.getElementById('md-kit-select')?.addEventListener('change', (e) => {
      this.state.setActiveKit?.(e.target.value);
      this.audio.playClick();
      this.toast('👕 Đã cập nhật trang phục thi đấu 3D của PSG!', 'info');
    });
    document.getElementById('md-open-news')?.addEventListener('click', () => this.openComputer('media'));
    document.getElementById('md-open-form')?.addEventListener('click', () => this.openComputer('formation'));
    document.querySelectorAll('.md-dir').forEach((b) => {
      b.addEventListener('click', () => {
        const res = this.state.runAutomaticMatchday(b.dataset.dir);
        if (res) {
          this.audio.playWhistle();
          this.cb.refreshMuseumAndTv?.();
          this.cb.autoSaveNow?.(true);
          this.openMatchResultModal(res);
        }
      });
    });
  }

  openMatchResultModal(res) {
    const psgGoalsList = res.goalEvents.filter((e) => e.team === 'Paris Saint-Germain');
    const oppGoalsList = res.goalEvents.filter((e) => e.team !== 'Paris Saint-Germain');
    const cr = res.coachReport;
    const penLine = res.penalties
      ? `<div class="tag ok" style="margin-top:4px;">⚖️ Luân lưu 11m: ${res.fixture.home} ${res.penalties.home} - ${res.penalties.away} ${res.fixture.away} (Thắng: ${res.penalties.winner})</div>`
      : '';
    const trophyBanner = res.awardedTrophy
      ? `
        <div class="card-item urgent" style="border:2px solid #d4af37;background:linear-gradient(135deg,rgba(0,32,91,0.9),rgba(212,175,55,0.22));text-align:center;">
          <strong style="color:#fde68a;font-size:15px;">🏆 CHÚC MỪNG VÔ ĐỊCH ${res.awardedTrophy.competitionName.toUpperCase()} (${res.awardedTrophy.seasonName})!</strong>
          <p style="margin:4px 0;">Chiếc cúp 3D mới đã tự động được khắc tên đội hình & trưng bày tại <b>${res.awardedTrophy.displayLocation}</b>.</p>
          <button class="btn-xs btn-primary" id="mr-celebrate">🎉 Mở Lễ Đăng Quang & Xem Bảo Tàng PSG</button>
        </div>`
      : '';

    const html = `
      ${trophyBanner}
      <div class="card-item ${res.psgWon ? '' : 'urgent'}" style="text-align:center;">
        <div class="tag">${res.fixture.comp} · ${res.fixture.round} · ${res.fixture.stadium}</div>
        <h2 style="margin:8px 0;font-size:21px;">${res.fixture.home}  ${res.homeGoals} - ${res.awayGoals}  ${res.fixture.away}</h2>
        ${penLine}
        <div class="muted">⭐ Cầu thủ xuất sắc nhất: <b style="color:#fde68a;">${res.motm.name} (${res.motm.rating})</b> · ${cr.resultLabel}</div>
        <div class="kpi-mini" style="justify-content:center;margin-top:8px;">
          <span>Kiểm soát: <b>${res.stats.homePoss}% - ${res.stats.awayPoss}%</b></span>
          <span>Sút (Trúng): <b>${res.stats.homeShots}(${res.stats.homeOnTarget}) - ${res.stats.awayShots}(${res.stats.awayOnTarget})</b></span>
          <span>xG: <b>${res.stats.homeXg} - ${res.stats.awayXg}</b></span>
        </div>
      </div>
      <div class="grid-2">
        <div class="card-item">
          <strong>⚽ Ghi bàn (Paris Saint-Germain)</strong>
          <p>${psgGoalsList.length ? psgGoalsList.map((e) => `• ${e.scorer} (${e.minute}')${e.assister ? ` — kiến tạo: ${e.assister}` : ''}`).join('<br/>') : 'Không có bàn thắng'}</p>
        </div>
        <div class="card-item">
          <strong>⚽ Ghi bàn (${res.oppName})</strong>
          <p>${oppGoalsList.length ? oppGoalsList.map((e) => `• ${e.scorer} (${e.minute}')`).join('<br/>') : 'Giữ sạch lưới!'}</p>
        </div>
      </div>
      <div class="card-item">
        <strong>👔 Báo cáo chuyên môn của HLV ${this.state.coach.name}</strong>
        <p>${cr.summary}</p>
        <p class="muted"><b>Điểm mạnh:</b> ${cr.strengths} · <b>Điểm yếu:</b> ${cr.weaknesses}${res.matchInjury ? ` · 🏥 Chấn thương mới: ${res.matchInjury}` : ''}</p>
      </div>
      <div class="section-label">📊 Đánh giá cầu thủ PSG sau trận</div>
      <div class="table-wrap" style="max-height:155px;">
        <table class="data-table">
          <thead><tr><th>Cầu thủ</th><th>VT</th><th>Điểm</th><th>G/A</th><th>Nhận xét chuyên môn</th></tr></thead>
          <tbody>${cr.ratings.map((r) => `<tr><td><b>${r.name}</b></td><td>${r.position}</td><td><b style="color:${r.rating >= 7.5 ? '#4ade80' : r.rating < 6.2 ? '#f87171' : '#fff'}">${r.rating}</b></td><td>${r.goals}/${r.assists}</td><td>${r.note}</td></tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="section-label">💡 Đề xuất của Ban huấn luyện sau trận</div>
      ${cr.proposals.map((pr) => `
        <div class="card-item">
          <p>"${pr.text}" <span class="tag">${pr.status}</span></p>
          ${pr.status === 'Chờ duyệt' ? `
            <div class="btn-row">
              <button class="btn-xs btn-primary cp-act" data-cpid="${pr.id}" data-act="Đã phê duyệt">✅ Phê duyệt</button>
              <button class="btn-xs btn-danger cp-act" data-cpid="${pr.id}" data-act="Đã từ chối">❌ Từ chối</button>
              <button class="btn-xs btn-secondary cp-act" data-cpid="${pr.id}" data-act="Đã chuyển GĐ Thể thao">📤 Chuyển GĐ Thể thao</button>
            </div>` : ''}
        </div>`).join('')}
      <div class="btn-row" style="margin-top:8px;">
        <button class="btn-primary" id="mr-press">📰 Đọc báo chí & bình luận CĐV sau trận</button>
        <button class="btn-secondary" id="mr-close">${res.awardedTrophy ? '🏆 Tiếp tục Lễ Đăng Quang' : '🏢 Đóng báo cáo'}</button>
      </div>`;

    this.openModal('🏁 THÔNG BÁO KẾT QUẢ & BÁO CÁO SAU TRẬN', html, 'wide');
    document.querySelectorAll('.cp-act').forEach((b) => {
      b.addEventListener('click', () => {
        const pr = cr.proposals.find((x) => x.id === b.dataset.cpid);
        if (pr) { pr.status = b.dataset.act; this.audio.playSuccess(); this.toast(`Đã cập nhật đề xuất HLV: ${pr.status}`, 'success'); this.openMatchResultModal(res); }
      });
    });
    document.getElementById('mr-celebrate')?.addEventListener('click', () => {
      const nextTrophy = this.state.trophySystem?.popNextCelebration?.() || res.awardedTrophy;
      if (nextTrophy) this.openCoronationCelebration(nextTrophy);
    });
    document.getElementById('mr-press')?.addEventListener('click', () => {
      this.activeArticleId = null;
      this.selectedSlotIdx = null;
      this.pitchZoom = 1.0;
      this.newsCategory = 'ALL';
      this.openComputer('media');
    });
    document.getElementById('mr-close')?.addEventListener('click', () => {
      const nextTrophy = this.state.trophySystem?.popNextCelebration?.();
      if (nextTrophy) {
        this.openCoronationCelebration(nextTrophy);
      } else {
        this.closeModal();
      }
    });
  }

  // ==================== BẢO TÀNG TRUYỀN THỐNG & LỄ ĐĂNG QUANG PSG ====================
  openMuseumModal(tab = 'history') {
    this.museumSubTab = tab;
    this.openComputer('museum');
  }

  openTrophyDetail(trophyId) {
    const t = this.state.trophySystem?.getTrophyById?.(trophyId);
    if (!t) return;
    if (t.isNewHighlight) {
      this.state.trophySystem.clearHighlight(trophyId);
      this.cb.refreshMuseumAndTv?.();
    }
    const html = renderTrophyDetailHTML(t, this.state);
    this.openModal(`🏆 CHIÊM NGƯỠNG DANH HIỆU · ${t.competitionName.toUpperCase()} (${t.seasonName})`, html, 'wide');
    document.querySelectorAll('#modal-body .open-profile-btn').forEach((b) => {
      b.addEventListener('click', () => this.openPlayerProfileModal(b.dataset.pid, 'overview'));
    });
    document.getElementById('td-open-museum')?.addEventListener('click', () => {
      this.openMuseumModal(t.category === 'domestic' ? 'domestic' : 'international');
    });
    document.getElementById('td-close')?.addEventListener('click', () => this.closeModal());
  }

  openLegendDetail(legendId) {
    const leg = PSG_LEGENDS.find((l) => l.legendId === legendId);
    if (!leg) return;
    const html = renderLegendDetailHTML(leg);
    this.openModal(`⭐ HUYỀN THOẠI PSG · ${leg.name.toUpperCase()}`, html, 'normal');
    document.getElementById('lgd-open-museum')?.addEventListener('click', () => this.openMuseumModal('legends'));
    document.getElementById('lgd-close')?.addEventListener('click', () => this.closeModal());
  }

  openSeasonArchive(seasonName) {
    const arc = this.state.trophySystem?.seasonArchives?.find((a) => a.season === seasonName || a.seasonId === seasonName);
    if (!arc) return;
    const html = renderSeasonArchiveDetailHTML(arc, this.state);
    this.openModal(`📚 LỊCH SỬ MÙA GIẢI ${arc.season} · PARIS SAINT-GERMAIN`, html, 'wide');
    document.querySelectorAll('#modal-body .open-profile-btn').forEach((b) => {
      b.addEventListener('click', () => this.openPlayerProfileModal(b.dataset.pid, 'overview'));
    });
    document.getElementById('sa-open-museum')?.addEventListener('click', () => this.openMuseumModal('seasons'));
    document.getElementById('sa-close')?.addEventListener('click', () => this.closeModal());
  }

  openCoronationCelebration(trophy) {
    if (!trophy) return;
    const html = renderCoronationModalHTML(trophy);
    this.openModal(`🏆 LỄ ĐĂNG QUANG · ${trophy.competitionName.toUpperCase()} ${trophy.seasonName}`, html, 'normal');
    document.getElementById('cor-go-museum')?.addEventListener('click', () => {
      this.audio.playDoor();
      this.cb.teleport('museum');
      this.closeModal();
      this.toast(`🏛️ Chào mừng Chủ tịch đến Bảo tàng PSG chiêm ngưỡng Cúp ${trophy.competitionName} mới!`, 'success');
    });
    document.getElementById('cor-inspect')?.addEventListener('click', () => {
      this.openTrophyDetail(trophy.trophyId);
    });
    document.getElementById('cor-skip')?.addEventListener('click', () => {
      const next = this.state.trophySystem?.popNextCelebration?.();
      if (next) this.openCoronationCelebration(next);
      else this.closeModal();
    });
  }

  // ==================== HỒ SƠ CẦU THỦ CHI TIẾT 8 TAB (DÙNG CHUNG TOÀN GAME) ====================
  openPlayerProfileModal(playerId, activeTab = 'overview') {
    const p = this.state.getPlayerById(playerId);
    if (!p) return;
    const isPsgFirstTeam = p.club === 'Paris Saint-Germain' && p.squadLevel === 'Đội một';
    const html = renderPlayerProfileHTML(p, activeTab, isPsgFirstTeam);
    this.openModal(`👤 HỒ SƠ CẦU THỦ · ${p.name.toUpperCase()} (${p.id})`, html, 'wide');

    document.querySelectorAll('[data-pptab]').forEach((b) => {
      b.addEventListener('click', () => {
        this.audio.playClick();
        this.openPlayerProfileModal(b.dataset.pid, b.dataset.pptab);
      });
    });
    document.getElementById('pp-meet')?.addEventListener('click', () => this.openPlayerMeetingSelector(p.id));
    document.getElementById('pp-renew')?.addEventListener('click', () => {
      p.contractYears += 2;
      p.wage = Math.round(p.wage * 1.1);
      if (p.contract) { p.contract.contractYears = p.contractYears; p.contract.weeklyWage = p.wage; p.contract.renewalStatus = 'Ổn định'; }
      this.state.signingEventSystem?.scheduleOfficialEvent({
        dealVerified: true,
        dealKey: `renew_${p.id}_${this.state.season}_${p.contractYears}`,
        eventType: 'contract_renewal',
        playerId: p.id,
        subjectName: p.name,
        position: p.position,
        shirtNumber: p.shirtNumber,
        ovr: p.ovr,
        fromClub: 'Paris Saint-Germain',
        fee: 0,
        wage: p.wage,
        contractYears: p.contractYears,
        contractSnapshot: { ...p.contract }
      });
      this.audio.playSuccess();
      this.toast(`✍️ Đã gia hạn +2 năm cho ${p.name} & tạo sự kiện ký kết trong mục Sự kiện!`, 'success');
      this.openPlayerProfileModal(p.id, 'contract');
    });
    document.getElementById('pp-negotiate')?.addEventListener('click', () => {
      const res = this.state.transferSystem.startNegotiation(p.id, 'buy');
      if (!res.ok) { this.audio.playAlert(); this.toast(res.error, 'error'); return; }
      this.openTwoStageTransferModal(res.negotiation.id);
    });
    document.getElementById('pp-promote')?.addEventListener('click', () => {
      const res = this.state.transferSystem.promoteAcademyPlayer(p.id);
      if (res.ok) {
        this.audio.playSuccess();
        this.toast(`🎓 Đã đôn ${p.name} (ID ${p.id}) lên Đội một PSG!`, 'success');
        this.openPlayerProfileModal(p.id, 'overview');
      } else {
        this.audio.playAlert();
        this.toast(res.error, 'error');
      }
    });
  }

  // ==================== SA THẢI & TUYỂN DỤNG NHÂN SỰ / HLV TRƯỞNG (PHẦN III) ====================
  openFireStaffModal(roleKey) {
    this.state.timeSystem?.pushAutoPause('staff_decision');
    const staff = this.state.managerSystem.getActiveByRole(roleKey);
    if (!staff) return;
    const sev = this.state.managerSystem.calculateSeverance(staff);
    const html = `
      <div class="card-item urgent">
        <h4>⚠️ Xác nhận Miễn nhiệm / Sa thải: ${staff.name} (${staff.role})</h4>
        <p>Hợp đồng hiện tại còn <b>${staff.contractYears} năm</b> (€${staff.wage}k/tuần). Khoản bồi thường chấm dứt hợp đồng: <b style="color:#f87171;">€${sev}M</b>.</p>
        <div class="form-row">
          <label>Lý do sa thải (lưu vào lịch sử nhân sự CLB):</label>
          <select id="fire-reason" class="input-ctrl">
            <option value="Thành tích và lối chơi chưa đạt kỳ vọng của Ban lãnh đạo">Thành tích & lối chơi chưa đạt kỳ vọng</option>
            <option value="Tái cơ cấu bộ máy chuyên môn theo chiến lược mới của Chủ tịch">Tái cơ cấu chiến lược chuyên môn mới</option>
            <option value="Mâu thuẫn định hướng phát triển cầu thủ trẻ & phòng thay đồ">Mâu thuẫn định hướng phát triển</option>
          </select>
        </div>
        <div class="btn-row" style="margin-top:10px;">
          <button class="btn-danger" id="confirm-fire-btn">🔥 Xác nhận Sa thải & Mở tuyển dụng mới</button>
          <button class="btn-secondary" id="cancel-fire-btn">↩️ Hủy bỏ</button>
        </div>
      </div>`;
    this.openModal(`🔥 SA THẢI ${staff.role.toUpperCase()}`, html, 'normal');
    document.getElementById('cancel-fire-btn')?.addEventListener('click', () => this.openComputer('coach'));
    document.getElementById('confirm-fire-btn')?.addEventListener('click', () => {
      const reason = document.getElementById('fire-reason')?.value || 'Quyết định của Chủ tịch';
      const res = this.state.managerSystem.fireStaff(roleKey, reason);
      if (res.ok) {
        this.audio.playAlert();
        this.toast(`🔥 Đã sa thải ${staff.name} (-€${res.severance}M). Mời chọn ứng viên mới!`, 'info');
        this.openRoleCandidatesModal(roleKey);
      }
    });
  }

  openRoleCandidatesModal(roleKey) {
    this.state.timeSystem?.pushAutoPause('staff_decision');
    const meta = STAFF_ROLE_META[roleKey] || { title: roleKey };
    const cands = this.state.managerSystem.getCandidatesForRole(roleKey);
    const html = `
      <div class="muted" style="margin-bottom:8px;">Chọn ứng viên cho vị trí <b>${meta.title}</b> (${meta.dept || 'PSG'}) để đàm phán lương & hợp đồng:</div>
      <div class="scroll-list" style="max-height:48vh;">
        ${cands.map((c) => `
          <div class="card-item">
            <div class="card-head"><strong>${c.name} (${c.age}t · ${c.nationality})</strong><span class="tag ok">OVR ${c.overall} · Yêu cầu €${c.wage}k/tuần</span></div>
            <div class="muted">CLB hiện tại: <b>${c.currentClub}</b> · Kinh nghiệm: ${c.experience} · Danh tiếng: ${c.reputation} · Thời hạn mong muốn: ${c.contractYears} năm</div>
            <p>${c.tacticalStyle}</p>
            <div class="btn-row"><button class="btn-xs btn-primary cand-pick-btn" data-sid="${c.staffId}">🤝 Đàm phán hợp đồng</button></div>
          </div>`).join('')}
      </div>
      <div class="btn-row" style="margin-top:8px;"><button class="btn-secondary" id="cand-back-btn">↩️ Quay lại Quản lý Nhân sự</button></div>`;
    this.openModal(`📋 DANH SÁCH ỨNG VIÊN · ${meta.title.toUpperCase()}`, html, 'wide');
    document.getElementById('cand-back-btn')?.addEventListener('click', () => this.openComputer('coach'));
    document.querySelectorAll('.cand-pick-btn').forEach((b) => {
      b.addEventListener('click', () => this.openStaffNegotiationModal(b.dataset.sid));
    });
  }

  openStaffNegotiationModal(staffId, feedback = null, prefill = null) {
    this.state.timeSystem?.pushAutoPause('staff_decision');
    const c = this.state.managerSystem.getById(staffId);
    if (!c) return;
    const buyout = this.state.managerSystem.calculateBuyout(c);
    const wVal = prefill?.wage ?? c.wage;
    const yVal = prefill?.contractYears ?? c.contractYears;
    const html = `
      <div class="card-item">
        <div class="card-head"><strong>👔 ${c.name} (${c.role})</strong><span class="tag ok">OVR ${c.overall} · ${c.currentClub}</span></div>
        <p class="muted">Kỳ vọng lương: <b>€${c.wage}k/tuần</b> · Thời hạn: <b>${c.contractYears} năm</b>${buyout > 0 ? ` · Phí giải phóng CLB cũ: <b style="color:#f87171;">€${buyout}M</b>` : ' · Chuyển nhượng tự do'}</p>
      </div>
      ${feedback ? `<div class="dialogue-bubble">${feedback}</div>` : ''}
      <div class="grid-2">
        <div class="form-row"><label>Lương đề nghị (k€/tuần):</label><input id="sn-wage" type="number" class="input-ctrl" value="${wVal}" /></div>
        <div class="form-row"><label>Thời hạn hợp đồng (năm):</label><input id="sn-years" type="number" min="1" max="5" class="input-ctrl" value="${yVal}" /></div>
      </div>
      <div class="form-row"><label>Mục tiêu mùa giải Chủ tịch giao:</label><input id="sn-obj" class="input-ctrl" value="Vô địch Ligue 1, Bán kết UEFA Champions League & phát triển cầu thủ trẻ" /></div>
      <div class="form-row"><label>Yêu cầu chuyên môn:</label><input id="sn-req" class="input-ctrl" value="${c.tacticalStyle}" /></div>
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn-primary" id="sn-submit">📩 Gửi lời mời & Đàm phán</button>
        <button class="btn-secondary" id="sn-back">↩️ Quay lại danh sách</button>
      </div>`;
    this.openModal(`🤝 ĐÀM PHÁN BỔ NHIỆM · ${c.name.toUpperCase()}`, html, 'normal');
    document.getElementById('sn-back')?.addEventListener('click', () => this.openRoleCandidatesModal(c.roleKey));
    document.getElementById('sn-submit')?.addEventListener('click', () => {
      const offer = {
        wage: Number(document.getElementById('sn-wage')?.value || c.wage),
        contractYears: Number(document.getElementById('sn-years')?.value || c.contractYears),
        objectives: [document.getElementById('sn-obj')?.value || 'Vô địch Ligue 1'],
        tacticalReq: document.getElementById('sn-req')?.value || c.tacticalStyle
      };
      const res = this.state.managerSystem.negotiateOffer(c.staffId, offer);
      if (res.outcome === 'accepted') {
        const app = this.state.managerSystem.appointStaff(c.staffId, res.agreedOffer);
        if (app.ok) {
          this.audio.playSuccess();
          this.toast(`🎉 Chính thức bổ nhiệm ${c.name} (${c.role})! NPC mới đã xuất hiện trong thế giới 3D!`, 'success');
          this.openComputer('coach');
        }
      } else if (res.outcome === 'counter') {
        this.audio.playClick();
        this.openStaffNegotiationModal(c.staffId, res.message, res.counterOffer);
      } else {
        this.audio.playAlert();
        this.openStaffNegotiationModal(c.staffId, res.message, offer);
      }
    });
  }

  // ==================== ĐÀM PHÁN CHUYỂN NHƯỢNG 2 GIAI ĐOẠN (CLB -> CẦU THỦ) ====================
  openTwoStageTransferModal(negId, feedback = null) {
    this.state.timeSystem?.pushAutoPause('transfer_negotiation');
    const neg = this.state.transferSystem.activeNegotiations.find((n) => n.id === negId);
    if (!neg) { this.openComputer('transfers'); return; }
    const psgSquad = this.state.getPsgSquad();

    let stageHtml = '';
    if (neg.stage === 1) {
      stageHtml = `
        <div class="section-label">Giai đoạn 1/2 · Đàm phán trực tiếp với ${neg.fromClub}</div>
        <div class="grid-2">
          <div class="form-row"><label>Hình thức:</label><select id="n1-type" class="input-ctrl"><option value="buy" ${neg.dealType === 'buy' ? 'selected' : ''}>Mua đứt</option><option value="loan">Mượn 1 mùa</option><option value="loan_buy">Mượn kèm mua đứt</option></select></div>
          <div class="form-row"><label>Giá đề nghị (€M · Định giá €${neg.clubAskFee}M):</label><input id="n1-fee" type="number" class="input-ctrl" value="${neg.clubAskFee}" /></div>
          <div class="form-row"><label>Trả góp (số đợt bổ sung):</label><select id="n1-inst" class="input-ctrl"><option value="0">Trả thẳng 1 lần</option><option value="1">Trả góp 2 đợt</option><option value="2">Trả góp 3 đợt</option><option value="3">Trả góp 4 đợt</option></select></div>
          <div class="form-row"><label>Thưởng thành tích (€M):</label><input id="n1-bonus" type="number" class="input-ctrl" value="5" /></div>
          <div class="form-row"><label>Điều khoản bán lại (%):</label><select id="n1-sellon" class="input-ctrl"><option value="0">0%</option><option value="10">10%</option><option value="15">15%</option><option value="20">20%</option></select></div>
          <div class="form-row"><label>Trao đổi cầu thủ PSG (tùy chọn):</label><select id="n1-swap" class="input-ctrl"><option value="">Không trao đổi</option>${psgSquad.map((p) => `<option value="${p.id}">${p.name} (${p.position} · €${p.value}M)</option>`).join('')}</select></div>
        </div>
        <div class="btn-row" style="margin-top:10px;">
          <button class="btn-primary" id="n1-submit">📩 Gửi đề nghị cho ${neg.fromClub}</button>
          <button class="btn-secondary" id="n-back">↩️ Quay lại Chuyển nhượng</button>
        </div>`;
    } else {
      stageHtml = `
        <div class="section-label">Giai đoạn 2/2 · Đàm phán hợp đồng cá nhân với ${neg.playerName}</div>
        <div class="grid-2">
          <div class="form-row"><label>Lương tuần (k€ · Kỳ vọng €${neg.playerAskWage}k):</label><input id="n2-wage" type="number" class="input-ctrl" value="${neg.playerAskWage}" /></div>
          <div class="form-row"><label>Thời hạn hợp đồng (năm):</label><input id="n2-years" type="number" min="1" max="5" class="input-ctrl" value="5" /></div>
          <div class="form-row"><label>Thưởng ký hợp đồng (€M):</label><input id="n2-sbonus" type="number" class="input-ctrl" value="2" /></div>
          <div class="form-row"><label>Vai trò trong đội:</label><select id="n2-role" class="input-ctrl"><option value="Trụ cột không thể thay thế">Trụ cột không thể thay thế</option><option value="Đá chính thường xuyên" selected>Đá chính thường xuyên</option><option value="Xoay tua đội hình">Xoay tua đội hình</option><option value="Triển vọng">Triển vọng</option></select></div>
          <div class="form-row"><label>Cam kết thời gian thi đấu:</label><select id="n2-play" class="input-ctrl"><option value="Cao">Cao (75%+ số trận)</option><option value="Trung bình">Trung bình (50%+)</option><option value="Linh hoạt">Linh hoạt theo phong độ</option></select></div>
          <div class="form-row"><label>Điều khoản giải phóng (€M):</label><input id="n2-rc" type="number" class="input-ctrl" value="${Math.round(neg.clubAskFee * 2)}" /></div>
        </div>
        <div class="btn-row" style="margin-top:10px;">
          <button class="btn-primary" id="n2-submit">✍️ Đề xuất hợp đồng & Chốt chữ ký</button>
          <button class="btn-secondary" id="n-back">↩️ Quay lại Chuyển nhượng</button>
        </div>`;
    }

    const html = `
      <div class="card-item">
        <div class="card-head"><strong>${neg.playerName} (${neg.fromClub} · ${neg.position} · OVR ${neg.ovr}/${neg.pot})</strong><span class="stage-pill">Giai đoạn ${neg.stage}/2</span></div>
        <div class="muted">Quỹ chuyển nhượng khả dụng: <b>€${this.state.finance.transferBudget.toFixed(1)}M</b></div>
      </div>
      ${feedback ? `<div class="dialogue-bubble">${feedback}</div>` : ''}
      ${stageHtml}
      <div class="section-label">Nhật ký đàm phán</div>
      <div class="scroll-list" style="max-height:95px;">${neg.history.map((h) => `<div class="muted">• ${h}</div>`).join('')}</div>`;

    this.openModal(`🤝 ĐÀM PHÁN 2 GIAI ĐOẠN · ${neg.playerName.toUpperCase()}`, html, 'wide');
    document.getElementById('n-back')?.addEventListener('click', () => this.openComputer('transfers'));

    document.getElementById('n1-submit')?.addEventListener('click', () => {
      neg.dealType = document.getElementById('n1-type')?.value || 'buy';
      const res = this.state.transferSystem.submitClubOffer(neg.id, {
        fee: Number(document.getElementById('n1-fee')?.value || neg.clubAskFee),
        installments: Number(document.getElementById('n1-inst')?.value || 0),
        perfBonus: Number(document.getElementById('n1-bonus')?.value || 0),
        sellOnPct: Number(document.getElementById('n1-sellon')?.value || 0),
        swapPlayerId: document.getElementById('n1-swap')?.value || null
      });
      if (!res.ok) { this.audio.playAlert(); this.toast(res.error, 'error'); return; }
      if (res.outcome === 'accepted') {
        this.audio.playSuccess();
        this.openTwoStageTransferModal(neg.id, res.message);
      } else if (res.outcome === 'counter') {
        this.audio.playClick();
        this.openTwoStageTransferModal(neg.id, res.message);
      } else {
        this.audio.playAlert();
        this.toast(res.message, 'error');
        this.openComputer('transfers');
      }
    });

    document.getElementById('n2-submit')?.addEventListener('click', () => {
      const res = this.state.transferSystem.submitPlayerOffer(neg.id, {
        weeklyWage: Number(document.getElementById('n2-wage')?.value || neg.playerAskWage),
        contractYears: Number(document.getElementById('n2-years')?.value || 5),
        signingBonus: Number(document.getElementById('n2-sbonus')?.value || 0),
        squadRole: document.getElementById('n2-role')?.value || 'Đá chính thường xuyên',
        playtimeGuarantee: document.getElementById('n2-play')?.value || 'Cao',
        releaseClause: Number(document.getElementById('n2-rc')?.value || 150)
      });
      if (!res.ok) { this.audio.playAlert(); this.toast(res.error, 'error'); return; }
      if (res.outcome === 'accepted') {
        this.audio.playSuccess();
        this.toast(res.message, 'success');
        const pendingEvt = this.state.signingEventSystem?.pendingEvents?.[0];
        if (pendingEvt) {
          this.eventSubTab = 'pending';
          this.openComputer('events');
        } else {
          this.openComputer('squad');
        }
      } else if (res.outcome === 'counter') {
        this.audio.playClick();
        this.openTwoStageTransferModal(neg.id, res.message);
      } else {
        this.audio.playAlert();
        this.toast(res.message, 'error');
        this.openComputer('transfers');
      }
    });
  }

  // ==================== BẢNG ĐIỀU KHIỂN LỄ KÝ KẾT & HỌP BÁO 3D TRỰC TIẾP (PORTRAIT + LANDSCAPE) ====================
  openLiveCeremonySheet() {
    const el = document.getElementById('ceremony-sheet');
    if (!el) return;
    const evt = this.state.signingEventSystem?.activeEvent;
    if (!evt) { this.closeLiveCeremonySheet(); return; }
    el.innerHTML = renderLiveCeremonySheetHTML(this.state);
    el.classList.add('open');
    this._ceremonyHeaderSpan = el.querySelector('.ceremony-header > span:last-child');
    this._lastCeremonyHeaderText = this._ceremonyHeaderSpan ? this._ceremonyHeaderSpan.textContent : '';

    document.getElementById('cer-minimize')?.addEventListener('click', () => {
      this.closeLiveCeremonySheet();
      this.toast('Bạn có thể tự do đi lại quan sát phòng 3D, hoặc mở Sự kiện & PSG TV để tiếp tục buổi lễ.', 'info');
    });
    document.getElementById('cer-begin-signing')?.addEventListener('click', () => {
      this.state.signingEventSystem.enterSigningCeremony();
      this.cb.setEventCamera?.('signing_desk');
      this.audio.playSuccess();
      this.openLiveCeremonySheet();
    });
    document.getElementById('cer-flash-photo')?.addEventListener('click', () => {
      this.state.signingEventSystem.mediaRooms?.triggerCameraFlash();
      this.audio.playClick();
      this.toast('📸 Nhiếp ảnh gia PSG đã ghi lại khoảnh khắc lễ ký hợp đồng!', 'info');
    });
    document.getElementById('cer-next-sign-step')?.addEventListener('click', () => {
      const res = this.state.signingEventSystem.advanceSigningStep();
      if (!res.ok) return;
      this.audio.playSuccess();
      if (res.nextPhase === 'press_conference') {
        this.cb.setEventCamera?.('wide_stage');
        this.toast('🔴 PSG TV đã chuyển sang trạng thái LIVE! Bắt đầu Họp báo ra mắt!', 'success');
        this.openLiveCeremonySheet();
      } else if (res.nextPhase === 'completed') {
        this.closeLiveCeremonySheet();
        this.toast('✅ Đã hoàn tất Lễ Ký Kết & đăng tải thông cáo báo chí!', 'success');
        this.eventSubTab = 'archive';
        this.openComputer('events');
      } else {
        this.openLiveCeremonySheet();
      }
    });
    document.querySelectorAll('.cer-cam-btn').forEach((b) => {
      b.addEventListener('click', () => {
        this.cb.setEventCamera?.(b.dataset.camkey);
        this.audio.playClick();
        this.openLiveCeremonySheet();
      });
    });
    document.querySelectorAll('.cer-ans-opt').forEach((b) => {
      b.addEventListener('click', () => {
        const res = this.state.signingEventSystem.answerCurrentQuestion(b.dataset.opt);
        if (res.ok) {
          this.cb.setEventCamera?.(this.state.signingEventSystem.broadcast.activeCameraAngle);
          this.audio.playSuccess();
          this.openLiveCeremonySheet();
        }
      });
    });
    document.getElementById('cer-player-next')?.addEventListener('click', () => {
      const res = this.state.signingEventSystem.answerCurrentQuestion();
      if (res.ok) {
        this.cb.setEventCamera?.(this.state.signingEventSystem.broadcast.activeCameraAngle);
        this.audio.playClick();
        this.openLiveCeremonySheet();
      }
    });
    const finishPress = () => {
      const done = this.state.signingEventSystem.completeActiveEvent();
      this.closeLiveCeremonySheet();
      if (done.ok) {
        this.audio.playSuccess();
        this.toast(`🎉 Họp báo kết thúc! Đã đăng ${done.articlesCount} bài báo độc lập & cập nhật thương hiệu PSG!`, 'success');
        this.eventSubTab = 'archive';
        this.openComputer('events');
      }
    };
    document.getElementById('cer-end-press')?.addEventListener('click', finishPress);
    document.getElementById('cer-finish-all')?.addEventListener('click', finishPress);
  }

  closeLiveCeremonySheet() {
    const el = document.getElementById('ceremony-sheet');
    if (el) {
      el.classList.remove('open');
      if (el.innerHTML !== '') el.innerHTML = '';
    }
    this._ceremonyHeaderSpan = null;
    this._lastCeremonyHeaderText = '';
    this.cb.setEventCamera?.(null);
  }

  refreshLiveCeremonyHeader() {
    const el = document.getElementById('ceremony-sheet');
    if (!el || !el.classList.contains('open')) return;
    const bc = this.state.signingEventSystem?.broadcast;
    if (!bc || !bc.isLive) return;
    const span = this._ceremonyHeaderSpan || el.querySelector('.ceremony-header > span:last-child');
    if (!span) return;
    this._ceremonyHeaderSpan = span;
    const nextText = `⏱️ ${bc.getFormattedDuration()} · 👁️ ${bc.viewerCount.toLocaleString('vi-VN')}`;
    if (nextText !== this._lastCeremonyHeaderText) {
      this._lastCeremonyHeaderText = nextText;
      span.textContent = nextText;
    }
  }

  // ==================== CAMERA GIÁM SÁT SVĐ PARC DES PRINCES TỪ XA (LOD THẤP TIẾT KIỆM HIỆU NĂNG) ====================
  openStadiumCctvOverlay(camKey = 'overview_gate') {
    const el = document.getElementById('ceremony-sheet');
    if (!el) return;
    this._ceremonyHeaderSpan = null;
    this._lastCeremonyHeaderText = '';
    this.cb.setStadiumCctv?.(camKey);
    const zInfo = this.cb.getStadiumZoneStatus ? this.cb.getStadiumZoneStatus() : { cctvCameras: {}, lodHighVisible: false, zoneLabel: 'Khu Nhà Điều Hành PSG' };
    const cams = Object.entries(zInfo.cctvCameras || {});

    el.innerHTML = `
      <div class="ceremony-header">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span class="psgtv-live-badge on">● CCTV · PARC DES PRINCES</span>
          <b style="font-size:12px;">Camera Giám Sát SVĐ Trong Khuôn Viên PSG</b>
        </div>
        <span class="tag ok">${zInfo.lodHighVisible ? 'LOD Cao' : 'LOD Thấp · Tối ưu FPS'}</span>
      </div>
      <div class="muted">Vị trí Chủ tịch: <b>${zInfo.zoneLabel}</b> · Chế độ giám sát từ xa giữ nguyên tài nguyên Trụ sở mà không tải nặng nội thất SVĐ.</div>
      <div class="ceremony-cam-strip">
        ${cams.map(([k, cfg]) => `<button class="btn-xs ${camKey === k ? 'btn-primary' : 'btn-secondary'} cctv-pick" data-cam="${k}">${cfg.label}</button>`).join('')}
      </div>
      <div class="btn-row">
        <button class="btn-primary" id="cctv-go-stadium" style="flex:1;">🚶 Di chuyển tới SVĐ Parc des Princes (Tự động tải LOD Cao)</button>
        <button class="btn-danger" id="cctv-close">✕ Thoát Camera Giám Sát</button>
      </div>`;
    el.classList.add('open');

    document.querySelectorAll('.cctv-pick').forEach((b) => {
      b.addEventListener('click', () => { this.audio.playClick(); this.openStadiumCctvOverlay(b.dataset.cam); });
    });
    document.getElementById('cctv-go-stadium')?.addEventListener('click', () => {
      this.cb.setStadiumCctv?.(null);
      el.classList.remove('open');
      el.innerHTML = '';
      this.cb.teleport('stadium_plaza');
      this.audio.playDoor();
      this.toast('🏟️ Đã đến Quảng trường Parc des Princes — Hệ thống tự động kích hoạt LOD Cao!', 'success');
    });
    document.getElementById('cctv-close')?.addEventListener('click', () => {
      this.cb.setStadiumCctv?.(null);
      el.classList.remove('open');
      el.innerHTML = '';
      this.audio.playClick();
    });
  }
}
