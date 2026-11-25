// tests/verify_matchday_system.mjs
// Bộ kiểm thử toàn diện Hệ thống MATCHDAY duy nhất thay thế hoàn toàn mô phỏng cũ
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { GameState } from '../src/club/GameState.js';
import { SaveManager } from '../src/save/SaveManager.js';
import { UIManager } from '../src/ui/UIManager.js';
import { CoachMatchAI } from '../src/matchday/CoachMatchAI.js';
import { MatchCalendarSystem } from '../src/matchday/MatchCalendarSystem.js';
import { buildFiveStaffReports } from '../src/matchday/MatchdayReportEngine.js';
import { getClubLogoDataUrl } from '../src/matchday/ClubLogoFactory.js';

function createMockDomEnvironment() {
  const storageMap = new Map();
  const localStorage = {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
    clear: () => storageMap.clear()
  };

  class MockClassList {
    constructor(el) { this.el = el; this._set = new Set(); }
    _syncFromString(str) { this._set = new Set(String(str || '').split(/\s+/).filter(Boolean)); }
    add(...cls) { cls.forEach((c) => c && this._set.add(c)); }
    remove(...cls) { cls.forEach((c) => c && this._set.delete(c)); }
    contains(c) { return this._set.has(c); }
    toggle(c, force) {
      if (force === undefined) {
        if (this._set.has(c)) { this._set.delete(c); return false; }
        this._set.add(c); return true;
      }
      if (force) { this._set.add(c); return true; }
      this._set.delete(c); return false;
    }
    toString() { return Array.from(this._set).join(' '); }
  }

  function parseHtmlIntoChildren(html, parent) {
    parent.children = [];
    if (!html || typeof html !== 'string') return;
    const stack = [parent];
    const tagRe = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9-]+)\s*>|<([a-zA-Z0-9-]+)([^>]*?)(\/?)>/g;
    let lastIdx = 0;
    let m;
    while ((m = tagRe.exec(html)) !== null) {
      const top = stack[stack.length - 1];
      if (m.index > lastIdx && top) {
        const text = html.slice(lastIdx, m.index);
        if (text) top._text += text;
      }
      lastIdx = tagRe.lastIndex;
      if (m[1]) {
        const closeTag = m[1].toUpperCase();
        for (let i = stack.length - 1; i >= 1; i--) {
          if (stack[i].tagName === closeTag) { stack.length = i; break; }
        }
      } else if (m[2]) {
        const tagName = m[2].toUpperCase();
        const attrStr = m[3] || '';
        const selfClose = m[4] === '/' || ['INPUT', 'IMG', 'BR', 'HR', 'META', 'LINK'].includes(tagName);
        const el = new MockElement(tagName);
        const attrRe = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
        let am;
        while ((am = attrRe.exec(attrStr)) !== null) {
          const k = am[1];
          const v = am[2] ?? am[3] ?? am[4] ?? '';
          if (k === 'id') el.id = v;
          else if (k === 'class') el.className = v;
          else if (k === 'value') el.value = v;
          else if (k === 'disabled') el.disabled = true;
          else if (k === 'open') el.open = true;
          else if (k === 'selected') el.selected = true;
          else if (k.startsWith('data-')) {
            const camel = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
            el.dataset[camel] = v;
          }
          el._attrs[k] = v;
        }
        top.appendChild(el);
        if (!selfClose) stack.push(el);
      }
    }
    const fixSelects = (node) => {
      if (node.tagName === 'SELECT') {
        const opts = node.children.filter((c) => c.tagName === 'OPTION');
        const sel = opts.find((o) => o.selected) || opts[0];
        if (sel) node.value = sel.value !== '' ? sel.value : sel.textContent.trim();
      }
      node.children.forEach(fixSelects);
    };
    fixSelects(parent);
  }

  class MockElement {
    constructor(tagName = 'DIV') {
      this.tagName = tagName.toUpperCase();
      this.id = '';
      this.children = [];
      this.parentElement = null;
      this.dataset = {};
      this.style = {};
      this.value = '';
      this.title = '';
      this.disabled = false;
      this.open = false;
      this.scrollTop = 0;
      this.scrollLeft = 0;
      this._attrs = {};
      this._listeners = new Map();
      this._text = '';
      this._innerHTML = '';
      this.classList = new MockClassList(this);
    }
    set className(v) { this.classList._syncFromString(v); }
    get className() { return this.classList.toString(); }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this._text = String(v ?? ''); this.children = []; this._innerHTML = ''; }
    set innerHTML(v) {
      this._innerHTML = String(v ?? '');
      this._text = '';
      parseHtmlIntoChildren(this._innerHTML, this);
    }
    get innerHTML() { return this._innerHTML; }
    prepend(child) { child.parentElement = this; this.children.unshift(child); return child; }
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
    remove() {
      if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
    }
    setAttribute(k, v) {
      this._attrs[k] = String(v);
      if (k === 'id') this.id = String(v);
      else if (k === 'class') this.className = String(v);
      else if (k.startsWith('data-')) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        this.dataset[camel] = String(v);
      }
    }
    getAttribute(k) { return this._attrs[k] ?? null; }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(fn);
    }
    removeEventListener(type, fn) {
      const arr = this._listeners.get(type);
      if (!arr) return;
      this._listeners.set(type, arr.filter((f) => f !== fn));
    }
    dispatchEvent(evt) {
      const e = evt || {};
      e.target = e.target || this;
      e.currentTarget = this;
      e.preventDefault = e.preventDefault || (() => {});
      e.stopPropagation = e.stopPropagation || (() => {});
      const arr = this._listeners.get(e.type) || [];
      for (const fn of [...arr]) fn.call(this, e);
    }
    click() { this.dispatchEvent({ type: 'click' }); }
    focus() { this._focused = true; }
    setSelectionRange() {}
    getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 600 }; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    querySelectorAll(sel) {
      const parts = sel.split(',').map((s) => s.trim()).filter(Boolean);
      const results = [];
      const seen = new Set();
      for (const p of parts) {
        for (const el of querySubtree(this, p)) {
          if (!seen.has(el)) { seen.add(el); results.push(el); }
        }
      }
      return results;
    }
  }

  function matchSimpleSelector(el, token) {
    let rem = token;
    const idMatch = rem.match(/^#([a-zA-Z0-9_-]+)/);
    let tagPart = null;
    if (!idMatch && !rem.startsWith('.') && !rem.startsWith('[')) {
      const tm = rem.match(/^([a-zA-Z0-9_-]+)/);
      if (tm) { tagPart = tm[1].toUpperCase(); rem = rem.slice(tm[0].length); }
    }
    if (tagPart && el.tagName !== tagPart) return false;
    while (rem.length > 0) {
      if (rem.startsWith('#')) {
        const m = rem.match(/^#([a-zA-Z0-9_-]+)/);
        if (!m || el.id !== m[1]) return false;
        rem = rem.slice(m[0].length);
      } else if (rem.startsWith('.')) {
        const m = rem.match(/^\.([a-zA-Z0-9_-]+)/);
        if (!m || !el.classList.contains(m[1])) return false;
        rem = rem.slice(m[0].length);
      } else if (rem.startsWith('[')) {
        const m = rem.match(/^\[([a-zA-Z0-9_:-]+)(?:="([^"]*)")?\]/);
        if (!m) return false;
        const attr = m[1];
        const expected = m[2];
        const has = attr.startsWith('data-')
          ? (attr.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase()) in el.dataset)
          : (attr in el._attrs);
        if (!has) return false;
        if (expected !== undefined) {
          const val = attr.startsWith('data-')
            ? el.dataset[attr.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())]
            : el._attrs[attr];
          if (val !== expected) return false;
        }
        rem = rem.slice(m[0].length);
      } else {
        return false;
      }
    }
    return true;
  }

  function querySubtree(root, selector) {
    const chain = selector.split(/\s+/).filter(Boolean);
    function collectAll(node, out) {
      for (const c of node.children) { out.push(c); collectAll(c, out); }
    }
    const allNodes = [];
    collectAll(root, allNodes);
    if (chain.length === 1) return allNodes.filter((n) => matchSimpleSelector(n, chain[0]));
    const ancestorsMatch = (el, chainIdx) => {
      if (chainIdx < 0) return true;
      let cur = el.parentElement;
      while (cur) {
        if (matchSimpleSelector(cur, chain[chainIdx])) {
          if (chainIdx === 0) return true;
          if (ancestorsMatch(cur, chainIdx - 1)) return true;
        }
        cur = cur.parentElement;
      }
      return false;
    };
    const leaf = chain[chain.length - 1];
    return allNodes.filter((n) => matchSimpleSelector(n, leaf) && ancestorsMatch(n, chain.length - 2));
  }

  const root = new MockElement('BODY');
  const shellIds = [
    ['modal-backdrop', 'DIV'], ['modal-box', 'DIV'], ['modal-head-bar', 'DIV'],
    ['modal-smart-back', 'BUTTON'], ['modal-title', 'DIV'], ['modal-close', 'BUTTON'], ['modal-body', 'DIV'],
    ['task-backdrop', 'DIV'], ['task-box', 'DIV'], ['task-head-bar', 'DIV'],
    ['task-smart-back', 'BUTTON'], ['task-title', 'DIV'], ['task-status-badge', 'SPAN'],
    ['task-close', 'BUTTON'], ['task-body', 'DIV'],
    ['smart-confirm-overlay', 'DIV'], ['sc-title', 'H4'], ['sc-msg', 'P'], ['sc-cancel', 'BUTTON'], ['sc-confirm', 'BUTTON'],
    ['toast-stack', 'DIV'], ['toast-box', 'DIV'], ['interact-prompt', 'DIV'], ['interact-hint', 'DIV'], ['interact-text', 'SPAN'],
    ['hud-date', 'DIV'], ['hud-season', 'DIV'], ['hud-clock', 'DIV'], ['hud-budget', 'DIV'], ['hud-fps', 'DIV'],
    ['hud-next-match', 'DIV'], ['hud-match-alert', 'BUTTON'], ['hud-unread', 'SPAN'], ['phone-badge', 'SPAN'], ['hud-pending', 'SPAN'],
    ['btn-speed', 'BUTTON'], ['btn-time-pause', 'BUTTON'], ['btn-phone', 'BUTTON'], ['btn-squad', 'BUTTON'], ['btn-matchday', 'BUTTON'],
    ['btn-fast-travel', 'BUTTON'], ['btn-save', 'BUTTON'], ['btn-audio', 'BUTTON'], ['btn-mute', 'BUTTON'], ['btn-quality', 'BUTTON'],
    ['btn-interact', 'BUTTON'], ['btn-sprint', 'BUTTON'], ['btn-next-week', 'BUTTON'],
    ['ceremony-sheet', 'DIV']
  ];
  for (const [id, tag] of shellIds) {
    const el = new MockElement(tag);
    el.id = id;
    root.appendChild(el);
  }

  const windowListeners = new Map();
  const mockWindow = {
    innerWidth: 390,
    innerHeight: 844,
    addEventListener(type, fn) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = windowListeners.get(type);
      if (!arr) return;
      windowListeners.set(type, arr.filter((f) => f !== fn));
    },
    dispatchEvent(evt) {
      const arr = windowListeners.get(evt.type) || [];
      for (const fn of [...arr]) fn(evt);
    }
  };

  const docListeners = new Map();
  const mockDocument = {
    body: root,
    getElementById(id) {
      const stack = [...root.children];
      while (stack.length) {
        const cur = stack.shift();
        if (cur.id === id) return cur;
        if (cur.children.length) stack.unshift(...cur.children);
      }
      return null;
    },
    querySelector(sel) { return root.querySelector(sel); },
    querySelectorAll(sel) { return root.querySelectorAll(sel); },
    createElement(tag) { return new MockElement(tag); },
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    dispatchEvent(evt) {
      const e = evt || {};
      e.preventDefault = e.preventDefault || (() => {});
      const arr = docListeners.get(e.type) || [];
      for (const fn of [...arr]) fn(e);
    }
  };

  globalThis.localStorage = localStorage;
  globalThis.window = mockWindow;
  globalThis.document = mockDocument;
  globalThis.requestAnimationFrame = (fn) => { try { fn(); } catch (_) {} return 1; };
  return { mockDocument, mockWindow, localStorage };
}

function makeStubAudio() {
  return {
    muted: false,
    playClick() {}, playSuccess() {}, playAlert() {}, playDoor() {}, playWhistle() {},
    toggleMute() { this.muted = !this.muted; return this.muted; }
  };
}

function makeStubCallbacks() {
  return {
    pauseGame: () => {}, resumeGame: () => {}, cycleTimeScale: () => 1, cycleQuality: () => 'high',
    teleport: () => {}, summonBoard: () => {}, summonPlayer: () => {}, endBoard: () => {}, dismissPlayer: () => {},
    toggleTvPower: () => true, switchTvChannel: () => {},
    autoSaveNow: async () => ({ ok: true }),
    exportSnapshot: () => ({}), importSnapshot: () => {},
    refreshMuseumAndTv: () => {}, setEventCamera: () => {}, setStadiumCctv: () => {},
    resetNewGame: () => {}
  };
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err?.stack || err?.message);
    process.exitCode = 1;
  }
}

// ============================================================================
// MD-1: Kiến trúc sạch sẽ, xóa bỏ mô phỏng cũ & giữ nguyên tốc độ thời gian 96x
// ============================================================================
test('MD-1: Đã xóa bỏ hoàn toàn MatchSimulationEngine / Match3DScene / bus / #match-hud & bảo toàn thời gian 96x', () => {
  assert.equal(fs.existsSync(path.resolve('src/matches/MatchSimulationEngine.js')), false, 'Phải xóa MatchSimulationEngine.js');
  assert.equal(fs.existsSync(path.resolve('src/matches/Match3DScene.js')), false, 'Phải xóa Match3DScene.js');

  const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
  assert.doesNotMatch(indexHtml, /id="match-hud"/, 'index.html không được còn #match-hud cũ');
  assert.match(indexHtml, /\.md-root/, 'index.html phải có CSS Matchday Center');
  assert.match(indexHtml, /\.md-root\s+button\s*\{\s*min-height:\s*44px/, 'Mobile portrait phải có touch target >= 44px');

  const timeSysSrc = fs.readFileSync(path.resolve('src/time/GameTimeSystem.js'), 'utf8');
  assert.match(timeSysSrc, /GAME_TIME_SCALE\s*=\s*96/, 'Không được thay đổi GAME_TIME_SCALE = 96');

  const gs = new GameState();
  assert.ok(gs.matchdaySystem, 'GameState phải sở hữu MatchdaySystem duy nhất');
  const crestUrl = getClubLogoDataUrl('Paris Saint-Germain');
  assert.match(crestUrl, /^data:image\/svg\+xml/, 'Logo CLB phải là SVG Data URI nội bộ không lỗi tải');
});

// ============================================================================
// MD-2: Tự động kích hoạt theo GameTimeSystem & Chống tính toán trùng lặp (idempotent)
// ============================================================================
test('MD-2: Tự động kích hoạt đúng ngày giờ thi đấu & KHÔNG tính lặp nếu gọi lại cùng matchId', () => {
  const gs = new GameState();
  const md = gs.matchdaySystem;
  const fx = gs.getNextFixture();
  assert.ok(fx && fx.kickoffEpoch > 0, 'Lịch thi đấu phải có kickoffEpoch chuẩn');

  const triggers = [];
  md.onAutoTrigger((payload) => triggers.push(payload));

  // Nhảy đồng hồ tới đúng ngày giờ kickoff trận kế tiếp (bulk jump)
  const koSec = fx.kickoffEpoch + 120;
  const dt = new Date(koSec * 1000);
  gs.timeSystem.setCalendarDate(
    dt.getUTCFullYear(),
    dt.getUTCMonth() + 1,
    dt.getUTCDate(),
    dt.getUTCHours(),
    dt.getUTCMinutes()
  );
  // Đồng bộ force check
  const firstRun = md.onTimeAdvanced(gs.timeSystem, { force: true, bulkJump: true });
  assert.ok(firstRun, 'Khi qua giờ kickoff phải tự tính toán trận đấu');
  assert.equal(md.processedMatchIds.has(fx.matchId), true);
  assert.ok(md.unreadMatchdayIds.includes(fx.matchId), 'Trận tự tính phải đánh dấu chưa xem (unreadMatchdayIds)');
  assert.ok(triggers.length >= 1, 'Phải phát sự kiện onAutoTrigger');

  const psg = gs.clubs.find((c) => c.name === 'Paris Saint-Germain');
  const playedAfter1 = psg.played;
  const ptsAfter1 = psg.pts;
  const newsLenAfter1 = gs.newsArchive.length;

  // Gọi lại onTimeAdvanced và simulateMatchComplete cho cùng matchId -> PHẢI idempotent!
  md.onTimeAdvanced(gs.timeSystem, { force: true, bulkJump: true });
  const dupRes = md.simulateMatchComplete(fx);
  assert.equal(dupRes.matchId, firstRun.matchId);
  assert.equal(psg.played, playedAfter1, 'Không được cộng dồn số trận đã đấu');
  assert.equal(psg.pts, ptsAfter1, 'Không được cộng dồn điểm');
  assert.equal(gs.newsArchive.length, newsLenAfter1, 'Không được đăng trùng bản tin sau trận');
});

// ============================================================================
// MD-3: Phân quyền tuyệt đối: Trước trận HLV quyết định 100%, Trong trận Chủ tịch thay người hợp lệ
// ============================================================================
test('MD-3: Trước trận HLV AI tự quyết định đội hình (Chủ tịch chỉ xem); Trong trận Chủ tịch duyệt/từ chối & thay người <=5 lượt, cấm vào lại, cấm thay thẻ đỏ', () => {
  const gs = new GameState();
  const md = gs.matchdaySystem;
  const fx = gs.getNextFixture();

  // Trước trận: CoachMatchAI tạo đội hình tự chủ, bỏ qua cầu thủ chấn thương/treo giò
  const injuredPlayer = gs.getPsgSquad().find((p) => p.position !== 'GK');
  injuredPlayer.injuryDays = 10;
  const plan = CoachMatchAI.selectMatchdayLineup(gs, fx);
  assert.equal(plan.starters.length, 11);
  assert.equal(plan.starters.some((s) => s.playerId === injuredPlayer.id), false, 'Cầu thủ chấn thương không được đá chính');
  assert.ok(plan.unavailable.some((u) => u.playerId === injuredPlayer.id && u.status === 'Chấn thương'));
  assert.ok(plan.coachRationale.length >= 3, 'HLV phải có đầy đủ lý do chuyên môn');

  // Khởi tạo phiên Live Matchday
  const session = md.startLiveMatchday(fx);
  assert.ok(session && !session.finished);

  // Chạy tới phút 58 để nhận đề xuất thay người từ HLV
  while (session.minute < 58 && !session.paused) {
    md.stepLiveMatch(1);
  }
  assert.ok(session.pendingSubSuggestion, 'Phút 58 HLV phải đưa ra đề xuất thay người');
  assert.equal(session.paused, true);

  // Chủ tịch chấp nhận đề xuất của HLV
  const subsBeforeAccept = session.subsUsed;
  const sugOutId = session.pendingSubSuggestion.outPlayerId;
  const sugInId = session.pendingSubSuggestion.inPlayerId;
  const acceptRes = md.acceptCoachSubSuggestion();
  assert.equal(acceptRes.ok, true);
  assert.equal(session.subsUsed, subsBeforeAccept + 1);
  assert.equal(session.paused, false);
  assert.ok(session.subbedOutIds.includes(sugOutId));
  assert.ok(session.activeStarters.some((s) => s.playerId === sugInId));

  // Cấm đưa cầu thủ đã rời sân trở lại sân!
  const targetSlot = session.activeStarters.find((s) => s.assignedRole !== 'GK').slotIndex;
  const reEnterRes = md.performChairmanLiveSub(targetSlot, sugOutId);
  assert.equal(reEnterRes.ok, false);
  assert.match(reEnterRes.reason, /không thể vào lại/i);

  // Chạy tiếp tới phút 70 -> từ chối đề xuất HLV
  while (session.minute < 70 && !session.paused) {
    md.stepLiveMatch(1);
  }
  if (session.pendingSubSuggestion) {
    const rejRes = md.rejectCoachSubSuggestion();
    assert.equal(rejRes.ok, true);
    assert.equal(session.pendingSubSuggestion, null);
    assert.equal(session.paused, false);
  }

  // Đánh dấu 1 cầu thủ thẻ đỏ -> cấm thay người cho cầu thủ bị thẻ đỏ
  const redSlot = session.activeStarters.find((s) => s.assignedRole !== 'GK');
  redSlot.redCarded = true;
  const benchCand = session.bench.find((b) => !session.subbedInIds.includes(b.playerId) && !session.subbedOutIds.includes(b.playerId) && b.position !== 'GK');
  const redSubRes = md.performChairmanLiveSub(redSlot.slotIndex, benchCand.playerId);
  assert.equal(redSubRes.ok, false);
  assert.match(redSubRes.reason, /thẻ đỏ/i);

  // Thực hiện đủ 5 lượt thay người -> chặn lượt thứ 6
  while (session.subsUsed < 5) {
    const validSlot = session.activeStarters.find((s) => s.assignedRole !== 'GK' && !s.redCarded);
    const validBench = session.bench.find((b) => !session.subbedInIds.includes(b.playerId) && !session.subbedOutIds.includes(b.playerId) && b.position !== 'GK');
    if (!validSlot || !validBench) break;
    const r = md.performChairmanLiveSub(validSlot.slotIndex, validBench.playerId);
    assert.equal(r.ok, true);
  }
  assert.equal(session.subsUsed, 5);
  const extraBench = session.bench.find((b) => !session.subbedInIds.includes(b.playerId) && !session.subbedOutIds.includes(b.playerId));
  const extraSlot = session.activeStarters.find((s) => s.assignedRole !== 'GK' && !s.redCarded);
  if (extraBench && extraSlot) {
    const overSub = md.performChairmanLiveSub(extraSlot.slotIndex, extraBench.playerId);
    assert.equal(overSub.ok, false);
    assert.match(overSub.reason, /5\/5/);
  }

  const finalRes = md.finishLiveMatchImmediately();
  assert.equal(finalRes.fixture.played, true);
  assert.equal(finalRes.subRecords.length, 5);
});

// ============================================================================
// MD-4: Kịch bản Sân nhà / Sân khách, Thắng / Hòa / Thua, Nhiều bàn (4+), Thẻ đỏ & Chấn thương
// ============================================================================
test('MD-4: Đủ kịch bản Sân nhà/Sân khách, Thắng/Hòa/Thua, Bàn thắng cao (4+), Thẻ đỏ giảm sức mạnh & Chấn thương', () => {
  const gs = new GameState();
  const md = gs.matchdaySystem;

  // 1. Sân nhà thắng đậm (4 bàn trở lên) & nhất quán goalEvents
  const fxHomeWin = {
    id: 'fx_md_home_4', matchId: 'fx_md_home_4', week: 1, comp: 'Ligue 1', round: 'Vòng 1',
    roundKey: 'Ligue 1_1', home: 'Paris Saint-Germain', away: 'Olympique Lyonnais',
    stadium: 'Parc des Princes', date: '16/08/2026', time: '21:00', played: false
  };
  gs.fixtures.unshift(fxHomeWin);
  const s1 = md.startLiveMatchday(fxHomeWin);
  const sc = s1.activeStarters.find((x) => x.assignedRole === 'ST' || x.assignedRole === 'RW') || s1.activeStarters[9];
  for (let g = 1; g <= 4; g++) {
    sc.goals++;
    s1.homeGoals++;
    md._pushLiveEvent(s1, {
      minute: 10 + g * 15, type: 'goal', side: 'home', isPsg: true, teamName: 'Paris Saint-Germain',
      scorerId: sc.playerId, scorerName: sc.name, text: `⚽ ${10 + g * 15}' — ${sc.name} ghi bàn!`
    });
  }
  const r1 = md.finalizeLiveSession();
  assert.equal(r1.psgIsHome, true);
  assert.equal(r1.psgWon, true);
  assert.equal(r1.homeGoals, 4);
  assert.equal(r1.goalEvents.filter((e) => e.side === 'home').length, 4);

  // 2. Sân khách hòa + Thẻ đỏ làm giảm số cầu thủ & giảm chỉ số _computeTeamPower rõ rệt + Tin thẻ đỏ + Tin chấn thương
  const fxAwayDraw = {
    id: 'fx_md_away_red', matchId: 'fx_md_away_red', week: 2, comp: 'Ligue 1', round: 'Vòng 2',
    roundKey: 'Ligue 1_2', home: 'Olympique de Marseille', away: 'Paris Saint-Germain',
    stadium: 'Orange Vélodrome', date: '23/08/2026', time: '20:45', played: false
  };
  gs.fixtures.unshift(fxAwayDraw);
  const s2 = md.startLiveMatchday(fxAwayDraw);
  const pwrFull = md._computeTeamPower(true, gs.clubs[0], s2.activeStarters, s2.plan, fxAwayDraw, gs);
  const redVictim = s2.activeStarters.find((x) => x.assignedRole === 'CB');
  redVictim.redCarded = true;
  s2.stats.awayRed = 1;
  const pwrAfterRed = md._computeTeamPower(true, gs.clubs[0], s2.activeStarters, s2.plan, fxAwayDraw, gs);
  assert.ok(pwrAfterRed < pwrFull - 7, `Thẻ đỏ phải làm giảm sức mạnh đội hình (${pwrAfterRed} vs ${pwrFull})`);
  md._pushLiveEvent(s2, {
    minute: 41, type: 'red', side: 'away', isPsg: true, teamName: 'Paris Saint-Germain',
    playerId: redVictim.playerId, playerName: redVictim.name, text: `🟥 41' — ${redVictim.name} nhận thẻ đỏ!`
  });
  const injVictim = s2.activeStarters.find((x) => x.assignedRole === 'CM');
  s2.injuriesInMatch.push({ playerId: injVictim.playerId, playerName: injVictim.name, minute: 62, days: 9, type: 'Căng cơ trong trận' });
  md._pushLiveEvent(s2, {
    minute: 62, type: 'injury', side: 'away', isPsg: true, playerId: injVictim.playerId,
    playerName: injVictim.name, text: `🏥 62' — ${injVictim.name} chấn thương!`
  });
  // 1-1 Draw
  md._pushLiveEvent(s2, { minute: 20, type: 'goal', side: 'home', isPsg: false, teamName: 'Olympique de Marseille', scorerId: 'om1', scorerName: 'OM ST', text: '⚽ 20' });
  md._pushLiveEvent(s2, { minute: 75, type: 'goal', side: 'away', isPsg: true, teamName: 'Paris Saint-Germain', scorerId: injVictim.playerId, scorerName: injVictim.name, text: '⚽ 75' });
  const r2 = md.finalizeLiveSession();
  assert.equal(r2.psgIsHome, false);
  assert.equal(r2.psgDrew, true);
  assert.equal(gs.getPlayerById(redVictim.playerId).suspended, true, 'Nhận thẻ đỏ phải bị treo giò trận sau');
  assert.equal(gs.getPlayerById(injVictim.playerId).injuryDays, 9, 'Chấn thương trong trận phải lưu đúng số ngày nghỉ');
  const postNews2 = md.getPostMatchNews(r2.matchId);
  assert.ok(postNews2.some((n) => n.title.includes('thẻ đỏ')), 'Phải có bản tin thẻ đỏ');
  assert.ok(postNews2.some((n) => n.title.includes(injVictim.name)), 'Phải có bản tin chấn thương');

  // 3. Kịch bản Thua (0-2)
  const fxLoss = {
    id: 'fx_md_loss', matchId: 'fx_md_loss', week: 3, comp: 'Ligue 1', round: 'Vòng 3',
    roundKey: 'Ligue 1_3', home: 'Paris Saint-Germain', away: 'AS Monaco',
    stadium: 'Parc des Princes', date: '30/08/2026', time: '21:00', played: false
  };
  gs.fixtures.unshift(fxLoss);
  const s3 = md.startLiveMatchday(fxLoss);
  md._pushLiveEvent(s3, { minute: 30, type: 'goal', side: 'away', isPsg: false, teamName: 'AS Monaco', scorerId: 'm1', scorerName: 'Monaco ST', text: '⚽ 30' });
  md._pushLiveEvent(s3, { minute: 80, type: 'goal', side: 'away', isPsg: false, teamName: 'AS Monaco', scorerId: 'm2', scorerName: 'Monaco RW', text: '⚽ 80' });
  const r3 = md.finalizeLiveSession();
  assert.equal(r3.psgWon, false);
  assert.equal(r3.psgDrew, false);
  assert.equal(r3.homeGoals, 0);
  assert.equal(r3.awayGoals, 2);
});

// ============================================================================
// MD-5: Trận cùng vòng đấu, BXH Tie-Breaker + ▲/▼ + Form 5, 5 Báo cáo BHL & Save/Load
// ============================================================================
test('MD-5: Toàn bộ trận cùng vòng, BXH (▲/▼, form5, tie-breaker), 5 báo cáo BHL & Save/Load bảo toàn unreadMatchdayIds', () => {
  const gs = new GameState();
  const md = gs.matchdaySystem;
  const ligue1First = gs.fixtures.find((f) => f.comp === 'Ligue 1');
  assert.ok(ligue1First && ligue1First.roundKey);

  // Mô phỏng vòng Ligue 1 đầu tiên
  const res = md.simulateMatchComplete(ligue1First);
  md.unreadMatchdayIds.unshift(res.matchId);
  md.activeMatchdayId = res.matchId;

  // Tất cả các cặp đấu cùng vòng phải được mô phỏng và truy xuất chi tiết được
  const roundList = md.getFixturesForRound(ligue1First.roundKey);
  assert.ok(roundList.length >= 8, `Vòng Ligue 1 phải có đủ các cặp đấu (${roundList.length})`);
  for (const rfx of roundList) {
    assert.equal(rfx.played, true, `Cặp ${rfx.home} vs ${rfx.away} cùng vòng phải đã kết thúc`);
    const rec = md.getMatchRecord(rfx.matchId || rfx.id);
    assert.ok(rec && rec.events && rec.stats, 'Phải mở được chi tiết diễn biến & thống kê từng trận cùng vòng');
  }

  // Kiểm tra BXH: số trận, điểm, form5 và thứ tự chuẩn
  const standings = md.getStandings('Ligue 1');
  assert.equal(standings.length, 16);
  assert.ok(standings.every((row) => row.played === 1 && row.form5.length === 1));
  for (let i = 0; i < standings.length - 1; i++) {
    const a = standings[i];
    const b = standings[i + 1];
    assert.ok(
      a.pts > b.pts || (a.pts === b.pts && (a.gd > b.gd || (a.gd === b.gd && a.gf >= b.gf))),
      `Thứ tự BXH phải chuẩn tại hạng ${i + 1}`
    );
  }

  // Kiểm tra 5 báo cáo Ban huấn luyện độc lập
  const reports = buildFiveStaffReports(res, gs);
  assert.deepEqual(
    reports.orderedKeys,
    ['head_coach', 'tactical_analyst', 'fitness_coach', 'goalkeeper_coach', 'player_development']
  );
  assert.equal(reports.orderedKeys.every((k) => Boolean(reports[k] && reports[k].summary)), true);
  assert.ok(reports.head_coach.proposals.length >= 1);

  // Save & Load giữ nguyên unreadMatchdayIds, matchesById, processedMatchIds, clubForm5
  const snap = JSON.parse(JSON.stringify(gs.exportFullState({ x: -24, z: -15 })));
  const gs2 = new GameState();
  gs2.importFullState(snap);
  assert.equal(gs2.matchdaySystem.getUnreadMatchdayId(), res.matchId);
  assert.ok(gs2.matchdaySystem.getMatchRecord(res.matchId));
  assert.equal(gs2.matchdaySystem.processedMatchIds.has(res.matchId), true);
  assert.equal(gs2.matchdaySystem.getStandings('Ligue 1').length, 16);
});

// ============================================================================
// MD-6: Giao diện Matchday Center (6 màn hình con + Live UI + Computer Leagues Tab + Smart Back + Bảo toàn Dock)
// ============================================================================
test('MD-6: UIManager render đủ 6 màn hình Matchday, tab Kết quả & BXH trên PC, Smart Back giữa các trận vòng đấu & không đụng macOS Dock', () => {
  const { mockDocument } = createMockDomEnvironment();
  const gs = new GameState();
  const ui = new UIManager(gs, makeStubAudio(), new SaveManager(), makeStubCallbacks());

  const ligue1Fx = gs.fixtures.find((f) => f.comp === 'Ligue 1');
  const res = gs.matchdaySystem.simulateMatchComplete(ligue1Fx);
  gs.matchdaySystem.unreadMatchdayIds.unshift(res.matchId);
  gs.matchdaySystem.activeMatchdayId = res.matchId;

  // HUD hiển thị thông báo kết quả Matchday chưa xem
  ui.updateTopHUD(60, null);
  assert.match(mockDocument.getElementById('hud-match-alert').textContent, /Kết quả Matchday chưa xem/i);

  // Mở Trung tâm Matchday -> tự đánh dấu đã đọc unreadMatchdayId
  ui.openMatchdayCenter({ matchId: res.matchId, subTab: 'result' });
  assert.equal(gs.matchdaySystem.getUnreadMatchdayId(), null);
  assert.match(mockDocument.getElementById('modal-body').innerHTML, /Diễn biến trận đấu/);
  assert.match(mockDocument.getElementById('modal-body').innerHTML, /Thống kê chi tiết/);
  assert.match(mockDocument.getElementById('modal-body').innerHTML, /Đánh giá từng tuyến PSG/);

  // Chuyển sang Tab 2: Kết quả vòng đấu -> bấm vào một trận khác -> bấm Smart Back quay về danh sách vòng
  mockDocument.querySelector('#modal-body [data-mdtab="round"]').click();
  assert.match(mockDocument.getElementById('modal-body').innerHTML, /Toàn bộ kết quả/);
  const otherCard = mockDocument.querySelector('#modal-body .md-round-match-card[data-mdmid]');
  assert.ok(otherCard);
  otherCard.click();
  assert.ok(mockDocument.getElementById('md-back-to-round'), 'Khi xem chi tiết cặp đấu khác phải có nút quay lại vòng đấu');
  ui.handleSmartBack();
  assert.equal(ui.mdState.mdDetailMatchId, null, 'Smart Back phải quay về danh sách vòng đấu');
  assert.equal(ui.mdState.mdSubTab, 'round');

  // Chuyển Tab 3: BXH
  mockDocument.querySelector('#modal-body [data-mdtab="standings"]').click();
  assert.match(mockDocument.getElementById('modal-body').innerHTML, /Paris Saint-Germain/);

  // Chuyển Tab 4: 5 Báo cáo BHL + Duyệt đề xuất
  mockDocument.querySelector('#modal-body [data-mdtab="reports"]').click();
  assert.equal(mockDocument.querySelectorAll('#modal-body [data-mdrep]').length, 5, 'Phải hiển thị đủ 5 tab báo cáo Ban huấn luyện');
  const approveBtn = mockDocument.querySelector('#modal-body .md-prop-act');
  assert.ok(approveBtn);
  approveBtn.click();

  // Chuyển Tab 5: Tin tức sau trận -> mở bài báo -> quay lại tin tức
  mockDocument.querySelector('#modal-body [data-mdtab="news"]').click();
  const artBtn = mockDocument.querySelector('#modal-body .md-news-card[data-mdart]');
  if (artBtn) {
    artBtn.click();
    assert.ok(mockDocument.getElementById('md-news-back'));
    mockDocument.getElementById('md-news-back').click();
    assert.equal(ui.mdState.mdArticleId, null);
  }

  // Chuyển Tab 6: Đội hình & Chiến thuật (Chỉ xem - KHÔNG có nút chỉnh sửa đội hình)
  mockDocument.querySelector('#modal-body [data-mdtab="lineup"]').click();
  const lineupHtml = mockDocument.getElementById('modal-body').innerHTML;
  assert.match(lineupHtml, /Chỉ xem/);
  assert.doesNotMatch(lineupHtml, /swapStarter|autoSelectBestXI|confirm-opt-xi/, 'Tab Matchday Lineup phải hoàn toàn chỉ xem');

  // Kiểm tra Computer -> Kết quả & BXH dùng dữ liệu Matchday mới
  ui.openComputer('leagues');
  const pcHtml = mockDocument.getElementById('modal-body').innerHTML;
  assert.match(pcHtml, /Trung tâm Lịch thi đấu & Matchday PSG/);
  assert.match(pcHtml, /Bảng xếp hạng Ligue 1/);

  ui.closeModal();
  ui.destroy();
});

console.log(`\n🏆 TỔNG KẾT KIỂM THỬ MATCHDAY SYSTEM: ${passed} bộ kiểm thử chuyên sâu đã vượt qua 100%!`);
