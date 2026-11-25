// tests/verify_internal_relationships.mjs
// Bộ kiểm thử toàn diện 20 kịch bản Hệ thống Quản lý Quan hệ Nội bộ CLB Chuyên sâu (PHẦN 13)
// + Kiểm thử UI: Ban huấn luyện -> Định hướng cầu thủ, Báo cáo Phòng thay đồ (7 bộ lọc),
//   Họp riêng đa lượt (Task Window), Hồ sơ cầu thủ Tab 7 & Tab 8, Điện thoại Cảnh báo Tương lai, Save/Load.

import assert from 'node:assert/strict';
import { GameState } from '../src/club/GameState.js';
import { SaveManager } from '../src/save/SaveManager.js';
import { UIManager } from '../src/ui/UIManager.js';
import {
  DIRECTIVE_STATUS,
  COMMITMENT_STATUS,
  PRESS_LEAK_RESPONSES
} from '../src/relations/ClubRelationshipSystem.js';

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
    remove(...cls) { cls.forEach((c) => this._set.delete(c)); }
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
    set outerHTML(v) {
      if (!this.parentElement) return;
      const wrapper = new MockElement('DIV');
      parseHtmlIntoChildren(String(v ?? ''), wrapper);
      const idx = this.parentElement.children.indexOf(this);
      if (idx === -1) return;
      const replacement = wrapper.children;
      replacement.forEach((c) => { c.parentElement = this.parentElement; });
      this.parentElement.children.splice(idx, 1, ...replacement);
    }
    get outerHTML() { return this._innerHTML; }
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
    ['toast-stack', 'DIV'], ['interact-prompt', 'DIV'], ['interact-text', 'SPAN'],
    ['hud-date', 'DIV'], ['hud-budget', 'DIV'], ['hud-next-match', 'DIV'], ['hud-unread', 'SPAN'], ['hud-pending', 'SPAN'],
    ['btn-speed', 'BUTTON'], ['btn-phone', 'BUTTON'], ['btn-squad', 'BUTTON'], ['btn-matchday', 'BUTTON'],
    ['btn-fast-travel', 'BUTTON'], ['btn-save', 'BUTTON'], ['btn-audio', 'BUTTON'], ['btn-quality', 'BUTTON'],
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

function makeStubCallbacks(calls = { summoned: [] }) {
  return {
    pauseGame: () => {}, resumeGame: () => {}, cycleTimeScale: () => 1, cycleQuality: () => 'high',
    teleport: () => {}, summonBoard: () => {},
    summonPlayer: (name) => { calls.summoned.push(name); },
    endBoard: () => {}, dismissPlayer: () => {},
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
    console.error(`❌ [FAIL] ${name}:`, err.stack || err.message);
    process.exitCode = 1;
  }
}

function makeFakeMatchResult(state, playedIds = [], options = {}) {
  const starters = options.starterIds || state.formationSystem.starterIds.slice();
  const subbedOutIds = options.subbedOutIds || [];
  const minutesByPlayer = options.minutesByPlayer || {};
  const roleByPlayer = options.roleByPlayer || {};
  const ratingsByPlayer = options.ratingsByPlayer || {};
  const ratings = playedIds.map((id) => {
    const p = state.getPlayerById(id);
    return {
      id,
      name: p?.name || id,
      position: p?.position || 'CM',
      assignedRole: roleByPlayer[id] || p?.position || 'CM',
      minutes: minutesByPlayer[id] ?? (subbedOutIds.includes(id) ? 48 : 88),
      rating: ratingsByPlayer[id] ?? 7.2,
      goals: 0,
      assists: 0
    };
  });
  return {
    fixture: options.fixture || { id: `fx_test_${Math.random()}`, comp: 'Ligue 1', home: 'Paris Saint-Germain', away: 'AS Monaco' },
    psgIsHome: true,
    psgWon: options.psgWon !== undefined ? options.psgWon : true,
    psgDrew: false,
    starterIds: starters,
    subbedOutIds,
    ratings
  };
}

// ============================================================================
// KỊCH BẢN 1 & 19: CẦU THỦ TRẺ BỊ BỎ RƠI DẦN DẦN & TÍNH CÁCH PHẢN ỨNG KHÁC NHAU
// ============================================================================
test('KB-1 & KB-19: Cầu thủ trẻ phong độ cao bị dự bị giảm hài lòng dần dần (không khủng hoảng ngay trận 1) & phân hóa theo tính cách, không đổi OVR/POT', () => {
  const state = new GameState();
  const rel = state.relationshipSystem;
  const squad = state.getPsgSquad();
  const starters = new Set(state.formationSystem.starterIds);

  const youth = squad.find((p) => !starters.has(p.id) && p.age <= 21) || squad.find((p) => !starters.has(p.id));
  assert.ok(youth, 'Phải có cầu thủ dự bị trong đội một');
  const origOvr = youth.ovr;
  const origPot = youth.pot;
  youth.pot = Math.max(86, youth.pot);
  youth.form = 82;

  const prof = rel.ensurePlayerProfile(youth.id);
  const startPlaytime = prof.metrics.satisfactionPlaytime;

  // Trận 1 ngồi dự bị -> giảm hài lòng nhưng CHƯA được tạo mâu thuẫn ngay sau 1 trận!
  rel.onMatchCompleted(makeFakeMatchResult(state, state.formationSystem.starterIds));
  assert.ok(prof.metrics.satisfactionPlaytime < startPlaytime, 'Ngồi dự bị phải giảm mức độ hài lòng thời lượng');
  assert.equal(rel.getActiveConflict(youth.id), null, 'Không được bùng phát mâu thuẫn ngay chỉ sau 1 trận dự bị');
  assert.equal(youth.ovr, origOvr, 'Không được sửa OVR gốc');
  assert.equal(youth.pot, origPot, 'Không được sửa POT gốc');

  // Trận 2 ngồi dự bị liên tiếp -> bắt đầu phát sinh mâu thuẫn nhẹ Cấp 1
  rel.onMatchCompleted(makeFakeMatchResult(state, state.formationSystem.starterIds));
  const cnf = rel.getActiveConflict(youth.id);
  assert.ok(cnf && cnf.level === 1, `Sau 2 trận dự bị phải phát sinh mâu thuẫn Cấp 1 (hiện có ${cnf?.level})`);

  // Kịch bản 19: Hai cầu thủ có tính cách đối lập (Kiên nhẫn/Chuyên nghiệp vs Cá tính mạnh/Tham vọng) cùng ngồi dự bị
  const benchOthers = squad.filter((p) => !starters.has(p.id) && p.id !== youth.id).slice(0, 2);
  const pPatient = benchOthers[0];
  const pEgo = benchOthers[1];
  pPatient.ovr = 84; pPatient.form = 78;
  pEgo.ovr = 84; pEgo.form = 78;
  const profPat = rel.ensurePlayerProfile(pPatient.id);
  const profEgo = rel.ensurePlayerProfile(pEgo.id);
  profPat.traits = ['patient', 'professional', 'loyal'];
  profEgo.traits = ['strong_ego', 'ambitious', 'sensitive'];
  profPat.metrics.satisfactionPlaytime = 75;
  profEgo.metrics.satisfactionPlaytime = 75;

  rel.onMatchCompleted(makeFakeMatchResult(state, state.formationSystem.starterIds));
  assert.ok(profEgo.metrics.satisfactionPlaytime < profPat.metrics.satisfactionPlaytime, 'Cầu thủ cá tính mạnh/tham vọng phải tụt hài lòng nhanh hơn cầu thủ kiên nhẫn');
});

// ============================================================================
// KỊCH BẢN 2, 3, 4, 14, 15: ĐỊNH HƯỚNG CHỦ TỊCH & AI HLV TỰ CHỦ (ĐỒNG Ý / TỪ CHỐI / NGHỈ NGƠI / MỘT PHẦN / ĐỀ XUẤT KHÁC)
// ============================================================================
test('KB-2, KB-3, KB-4, KB-14, KB-15: HLV trưởng tự chủ Đồng ý / Từ chối / Cho nghỉ trụ cột / Đồng ý một phần / Đề xuất phương án khác & Thực thi vào trận đấu', () => {
  const state = new GameState();
  const rel = state.relationshipSystem;
  const squad = state.getPsgSquad();
  const starters = new Set(state.formationSystem.starterIds);

  // KB-2: Định hướng hợp lý -> HLV Đồng ý & MatchdaySystem/CoachMatchAI thực sự cho vào đá chính!
  const benchGood = squad.find((p) => !starters.has(p.id) && p.position !== 'GK' && p.ovr >= 78);
  assert.ok(benchGood);
  benchGood.form = 86;
  benchGood.injuryDays = 0;
  if (benchGood.health) benchGood.health.fitness = 92;

  const fxWeak = {
    id: 'fx_small',
    matchId: 'fx_small',
    week: state.week,
    played: false,
    comp: 'Coupe de France',
    home: 'Paris Saint-Germain',
    away: 'RC Strasbourg Alsace',
    date: state.timeSystem.getDateString(),
    time: '21:00',
    importance: 0.9
  };
  state.fixtures.unshift(fxWeak);

  const dirAgree = rel.submitCoachDirective({
    playerId: benchGood.id,
    categoryKey: 'usage',
    optionKey: 'prioritize_starter',
    priority: 'high',
    note: 'Phong độ rất tốt, cân nhắc đá chính trận tới.'
  });
  assert.equal(dirAgree.ok, true);
  assert.equal(dirAgree.directive.coachDecision, 'agreed');
  assert.equal(dirAgree.directive.status, DIRECTIVE_STATUS.AGREED);

  const overrides = rel.getCoachMatchSelectionOverrides();
  assert.equal(overrides.boostStarterIds.has(benchGood.id), true, 'HLV đồng ý phải phản ánh vào override chọn đội hình');

  const simRes = state.matchdaySystem.simulateMatchComplete(fxWeak);
  assert.ok(simRes.starterIds.includes(benchGood.id), 'HLV phải thực sự đưa cầu thủ được đồng ý vào đội hình xuất phát khi mô phỏng Matchday');

  // simulateMatchComplete đã kích hoạt onMatchCompleted 1 lần; thêm 1 trận nữa -> chỉ đạo chuyển vào directiveHistory với trạng thái Đã thực hiện
  rel.onMatchCompleted(simRes);
  assert.ok(rel.directiveHistory.some((d) => d.id === dirAgree.directive.id && d.status === DIRECTIVE_STATUS.COMPLETED));

  // KB-3: Định hướng vô lý (cầu thủ phong độ cực thấp 52 -> đòi đá chính) -> HLV từ chối kèm lý do chuyên môn
  const badFormPlayer = squad.find((p) => !starters.has(p.id) && p.id !== benchGood.id && p.position !== 'GK');
  badFormPlayer.form = 52;
  const dirReject = rel.submitCoachDirective({
    playerId: badFormPlayer.id,
    categoryKey: 'usage',
    optionKey: 'prioritize_starter'
  });
  assert.equal(dirReject.directive.coachDecision, 'rejected');
  assert.equal(dirReject.directive.status, DIRECTIVE_STATUS.REJECTED);
  assert.ok(dirReject.directive.coachReason.length > 10);

  // KB-4: Yêu cầu cho trụ cột quá tải nghỉ ngơi -> HLV đồng ý & trụ cột được cho nghỉ mà không bất mãn
  const tiredStarId = state.formationSystem.starterIds.find((id) => {
    const p = state.getPlayerById(id);
    return p && p.position !== 'GK';
  });
  const tiredStar = state.getPlayerById(tiredStarId);
  if (tiredStar.health) { tiredStar.health.fatigue = 76; tiredStar.health.fitness = 68; }
  const dirRest = rel.submitCoachDirective({
    playerId: tiredStar.id,
    categoryKey: 'fitness',
    optionKey: 'rest_star',
    priority: 'urgent'
  });
  assert.equal(dirRest.directive.coachDecision, 'agreed');
  const fxRest = {
    id: 'fx_small_rest',
    matchId: 'fx_small_rest',
    week: state.week,
    played: false,
    comp: 'Coupe de France',
    home: 'Paris Saint-Germain',
    away: 'RC Strasbourg Alsace',
    date: state.timeSystem.getDateString(),
    time: '21:00',
    importance: 0.9
  };
  state.fixtures.unshift(fxRest);
  const starProf = rel.ensurePlayerProfile(tiredStar.id);
  const trustBeforeRest = starProf.metrics.trustCoach;
  const simRest = state.matchdaySystem.simulateMatchComplete(fxRest);
  assert.equal(simRest.starterIds.includes(tiredStar.id), false, 'HLV phải cho trụ cột được duyệt nghỉ ngơi ngồi ngoài');
  assert.ok(starProf.metrics.trustCoach >= trustBeforeRest, 'Nghỉ ngơi đúng kế hoạch không được bị phạt như bị bỏ rơi');

  // KB-14: Đồng ý một phần -> chỉ định subOpportunityIds (tách chu kỳ tuần mới để không dính can thiệp dày trong tuần test trước)
  rel.recentInterferenceWeeks = [];
  fxWeak.played = true;
  const partTarget = squad.find((p) => !starters.has(p.id) && p.id !== benchGood.id && p.id !== badFormPlayer.id && p.position !== 'GK');
  partTarget.ovr = 77; partTarget.form = 71; partTarget.age = 24;
  if (partTarget.health) partTarget.health.fitness = 75;
  const fxBig = { id: 'fx_ucl', week: state.week, played: false, comp: 'UEFA Champions League', home: 'Paris Saint-Germain', away: 'Real Madrid', importance: 1.4 };
  state.fixtures.unshift(fxBig);
  const dirPartial = rel.submitCoachDirective({ playerId: partTarget.id, categoryKey: 'usage', optionKey: 'prioritize_starter' });
  assert.ok(['partial', 'alternative'].includes(dirPartial.directive.coachDecision), `Trong bối cảnh trận lớn & OVR trung bình phải là partial/alternative (nhận ${dirPartial.directive.coachDecision})`);
  const ov2 = rel.getCoachMatchSelectionOverrides();
  assert.ok(ov2.subOpportunityIds.has(partTarget.id) || ov2.boostStarterIds.has(partTarget.id));

  // KB-15: Đề xuất phương án khác ở trận lớn khi vị trí đã có siêu sao OVR cao hơn >=6
  const juniorPos = squad.find((p) => !starters.has(p.id) && p.position !== 'GK' && squad.some((s) => s.id !== p.id && s.position === p.position && s.ovr - p.ovr >= 7));
  if (juniorPos) {
    juniorPos.form = 80;
    const dirAlt = rel.submitCoachDirective({ playerId: juniorPos.id, categoryKey: 'usage', optionKey: 'prioritize_starter' });
    assert.equal(dirAlt.directive.coachDecision, 'alternative');
    assert.equal(dirAlt.directive.status, DIRECTIVE_STATUS.ALTERNATIVE);
    assert.ok(dirAlt.directive.alternativePlan?.type);
  }
});

// ============================================================================
// KỊCH BẢN 5, 6, 7, 8: THAY RA SỚM -> MÂU THUẪN LEO THANG -> RÒ RỈ BÁO CHÍ 5 GIAI ĐOẠN & 5 PHẢN HỒI PR + CẢNH BÁO PHONE
// ============================================================================
test('KB-5, KB-6, KB-7, KB-8: Bị thay ra sớm liên tục -> Leo thang mâu thuẫn -> Rò rỉ báo chí thật 5 giai đoạn -> 5 phản hồi PR & Cảnh báo tương lai trên Phone', () => {
  const state = new GameState();
  const rel = state.relationshipSystem;
  const starId = state.formationSystem.starterIds.find((id) => state.getPlayerById(id)?.position !== 'GK');
  const star = state.getPlayerById(starId);
  const prof = rel.ensurePlayerProfile(star.id);

  // KB-5: Thay ra sớm ở phút 46 dù rating 7.5 liên tiếp 2 trận -> earlySubStreak tạo mâu thuẫn Cấp 1
  for (let i = 0; i < 2; i++) {
    rel.onMatchCompleted(makeFakeMatchResult(state, state.formationSystem.starterIds, {
      subbedOutIds: [star.id],
      minutesByPlayer: { [star.id]: 46 },
      ratingsByPlayer: { [star.id]: 7.5 }
    }));
  }
  assert.ok(prof.earlySubStreak >= 2);
  let cnf = rel.getActiveConflict(star.id);
  assert.ok(cnf && cnf.scenario === 'early_sub', 'Phải phát sinh mâu thuẫn do bị rút ra sớm vô lý');

  // KB-6 & KB-7: Leo thang lên Cấp 2 -> 3 -> 4 -> 5 qua các sự kiện liên tiếp -> rò rỉ báo chí đúng sự thật, không bịa hoàn tất CN
  rel._escalateOrCreateConflict(star.id, { scenario: 'early_sub', cause: 'Bị thay ra sớm lần 3 liên tiếp', deltaLevel: 1 });
  rel._escalateOrCreateConflict(star.id, { scenario: 'bench_frustration', cause: 'Bị đẩy lên ghế dự bị sau tranh cãi', deltaLevel: 1 });
  rel._escalateOrCreateConflict(star.id, { scenario: 'bench_frustration', cause: 'Không tìm được tiếng nói chung với HLV', deltaLevel: 1 });
  cnf = rel.getActiveConflict(star.id);
  assert.equal(cnf.level, 4);

  const leak = rel.pressLeaks.find((l) => l.playerId === star.id);
  assert.ok(leak && leak.stage >= 4, 'Phải tạo bản tin rò rỉ báo chí giai đoạn 4');
  const leakNews = state.newsArchive.find((n) => n.relatedEntity === star.name && n.category === 'Nội bộ');
  assert.ok(leakNews, 'PressNewsSystem phải đăng bài báo nội bộ thực tế');
  assert.doesNotMatch(leakNews.title, /CHÍNH THỨC GIA NHẬP|HOÀN TẤT CHUYỂN NHƯỢNG/i, 'Không được bịa tin đã chuyển nhượng xong');

  // KB-8: Phải gửi cảnh báo Tương lai cầu thủ tới Phone & không tự ý bán cầu thủ
  assert.ok(state.phoneInbox.some((m) => m.title.includes('CẢNH BÁO – TƯƠNG LAI CẦU THỦ') && m.title.includes(star.name)));
  assert.equal(star.club, 'Paris Saint-Germain', 'Không được tự động bán cầu thủ');

  // Kiểm tra cả 5 phản hồi PR của Chủ tịch tác động tới Uy tín & Báo chí
  const repBefore = state.reputationSystem.metrics.mediaTrust;
  for (const prOpt of PRESS_LEAK_RESPONSES) {
    const res = rel.respondToPressLeak(leak.id, prOpt.key);
    assert.equal(res.ok, true);
  }
  assert.notEqual(state.reputationSystem.metrics.mediaTrust, repBefore, 'Phản hồi PR phải tác động thực tế tới chỉ số Uy tín truyền thông');
});

// ============================================================================
// KỊCH BẢN 9, 10, 11, 16, 17: HỌP RIÊNG ĐA LƯỢT, CAM KẾT, THẤT HỨA & PHÂN TÁCH TIN CHỦ TỊCH VS HLV
// ============================================================================
test('KB-9, KB-10, KB-11, KB-16, KB-17: Họp riêng đa lượt (Ở lại có điều kiện / Ra đi), Cam kết hết hạn -> Thất hứa, và Mất niềm tin lặp lại', () => {
  const state = new GameState();
  const rel = state.relationshipSystem;
  const squad = state.getPsgSquad();
  const p = squad.find((x) => x.position !== 'GK' && x.ovr >= 82);
  const prof = rel.ensurePlayerProfile(p.id);

  // KB-16: Cầu thủ vẫn tin Chủ tịch (88) nhưng bất mãn với HLV (36)
  prof.metrics.trustCoach = 36;
  prof.metrics.respectCoach = 40;
  prof.metrics.trustChairman = 88;
  rel._escalateOrCreateConflict(p.id, { scenario: 'bench_frustration', cause: 'Bất đồng chiến thuật với HLV', deltaLevel: 2 });
  assert.ok(prof.metrics.trustChairman > prof.metrics.trustCoach + 40, 'Hệ thống phải phân biệt rõ tin Chủ tịch vs tin HLV');

  // KB-9: Họp riêng 3 lượt với cam kết thời lượng thi đấu -> Thành công với stay_conditional + tạo Cam kết (chưa hoàn thành ngay!)
  rel.startPrivateMeeting(p.id);
  rel.submitPrivateMeetingTurn(p.id, 'listen_needs');
  let sess = rel.submitPrivateMeetingTurn(p.id, 'commit_playtime').session;
  if (!sess.finished) sess = rel.submitPrivateMeetingTurn(p.id, 'persuade_stay').session;
  assert.equal(sess.finished, true);
  assert.ok(['stay_conditional', 'stay_agreed'].includes(sess.finalOutcome), `Phải thuyết phục thành công (nhận ${sess.finalOutcome})`);
  const cm = rel.commitments.find((c) => c.playerId === p.id);
  assert.ok(cm, 'Phải tạo Cam kết chính thức');
  assert.notEqual(cm.status, COMMITMENT_STATUS.COMPLETED, 'Cam kết mới hứa KHÔNG được đánh dấu hoàn thành trước khi đá thật');

  // KB-11 & KB-17: Hết hạn tuần mà không đá đủ -> Cam kết chuyển Thất hứa, tụt trustChairman/satisfactionBoard & Uy tín
  const trustBeforeBreak = prof.metrics.trustChairman;
  const repPlayerBefore = state.reputationSystem.metrics.playerTrust;
  state.week = cm.deadlineWeek + 1;
  rel.onWeeklyTick();
  assert.equal(cm.status, COMMITMENT_STATUS.BROKEN, 'Quá hạn phải chuyển sang Thất hứa / Hết hạn');
  assert.ok(prof.metrics.trustChairman < trustBeforeBreak - 10, 'Thất hứa phải làm giảm mạnh niềm tin vào Chủ tịch');
  assert.ok(state.reputationSystem.metrics.playerTrust < repPlayerBefore, 'Thất hứa phải làm giảm uy tín đối với cầu thủ');

  // KB-17 & KB-10: Mở lại cuộc họp sau khi thất hứa -> lời hứa suông bị phản tác dụng -> thất bại / cầu thủ đòi ra đi -> transferListed = true
  prof.metrics.clubAttachment = 38;
  prof.metrics.satisfactionBoard = 35;
  rel.startPrivateMeeting(p.id);
  let failSess = rel.submitPrivateMeetingTurn(p.id, 'commit_playtime').session;
  if (!failSess.finished) failSess = rel.submitPrivateMeetingTurn(p.id, 'commit_playtime').session;
  if (!failSess.finished) failSess = rel.submitPrivateMeetingTurn(p.id, 'persuade_stay').session;
  assert.equal(failSess.finished, true);
  assert.ok(['insist_leaving', 'undecided'].includes(failSess.finalOutcome));

  // Chủ tịch tôn trọng quyết định ra đi -> dứt khoát mở chuyển nhượng, không cưỡng ép giữ hay tự động bán
  const p2 = squad.find((x) => x.id !== p.id && x.position !== 'GK');
  rel.startPrivateMeeting(p2.id);
  const leaveRes = rel.submitPrivateMeetingTurn(p2.id, 'respect_decision');
  assert.equal(leaveRes.session.finalOutcome, 'insist_leaving');
  assert.equal(p2.transferListed, true);
  assert.equal(p2.club, 'Paris Saint-Germain');
});

// ============================================================================
// KỊCH BẢN 12 & 13: BẤT MÃN NHẬN ĐỀ NGHỊ & TỪ CHỐI CLB ĐẲNG CẤP THẤP
// ============================================================================
test('KB-12 & KB-13: Cầu thủ muốn ra đi nhận đề nghị chuyển nhượng, nhưng TỪ CHỐI gia nhập CLB tầm thấp dù PSG đồng ý bán', () => {
  const state = new GameState();
  state.transferSystem.openWindow('summer');
  const star = state.getPsgSquad().find((p) => p.ovr >= 85 && p.position !== 'GK');
  assert.ok(star);
  const prof = relProfile(state, star.id);
  prof.wantsToLeave = true;
  star.transferListed = true;

  const lowClub = state.clubs.find((c) => c.name !== 'Paris Saint-Germain' && c.rating <= 76) || { name: 'AJ Auxerre', rating: 72 };
  const fakeBidId = 'bid_low_test';
  state.transferSystem.incomingBids.unshift({
    id: fakeBidId,
    date: '05/08/2026',
    buyerClub: lowClub.name,
    buyerStrategy: 'Trụ hạng',
    dealType: 'buy',
    playerId: star.id,
    playerName: star.name,
    position: star.position,
    ovr: star.ovr,
    fee: star.value,
    status: 'pending'
  });

  const acceptRes = state.transferSystem.acceptIncomingBid(fakeBidId);
  assert.equal(acceptRes.ok, false);
  assert.equal(acceptRes.playerRejected, true, 'Ngôi sao OVR cao phải tự từ chối CLB tầm thấp');
  assert.equal(star.club, 'Paris Saint-Germain', 'Cầu thủ từ chối nên vẫn ở lại PSG');
});

function relProfile(state, pid) {
  return state.relationshipSystem.ensurePlayerProfile(pid);
}

// ============================================================================
// KỊCH BẢN 18: THAY HLV TRƯỞNG -> GIỮ LỊCH SỬ MÂU THUẪN CŨ & CẬP NHẬT QUAN HỆ MỚI
// ============================================================================
test('KB-18: Sa thải và bổ nhiệm HLV trưởng mới giữ nguyên lịch sử mâu thuẫn với HLV cũ & thiết lập quan hệ mới', () => {
  const state = new GameState();
  const rel = state.relationshipSystem;
  const p = state.getPsgSquad().find((x) => x.position !== 'GK');
  const prof = rel.ensurePlayerProfile(p.id);
  rel._escalateOrCreateConflict(p.id, { scenario: 'bench_frustration', cause: 'Bất đồng chiến thuật với Luis Enrique', deltaLevel: 2 });
  assert.ok(rel.getActiveConflict(p.id));

  const xabi = state.managerSystem.getCandidatesForRole('head_coach').find((c) => c.name === 'Xabi Alonso');
  assert.ok(xabi);
  state.managerSystem.appointStaff(xabi.staffId, { wage: xabi.wage, contractYears: 3 });

  assert.equal(prof.formerCoachConflicts.length, 1, 'Lịch sử mâu thuẫn với HLV tiền nhiệm PHẢI được lưu giữ');
  assert.equal(prof.formerCoachConflicts[0].coachName, 'Luis Enrique');
  assert.equal(rel.getActiveConflict(p.id), null, 'Mâu thuẫn riêng với HLV cũ được chuyển sang lịch sử khi đổi tướng');
  assert.equal(prof.coachId, xabi.staffId);
});

// ============================================================================
// KỊCH BẢN 20 + KIỂM THỬ GIAO DIỆN TOÀN DIỆN (PC, COACH DIRECTIVES, LOCKER ROOM 7 FILTERS, HỒ SƠ TAB 7-8, PHONE, SAVE/LOAD)
// ============================================================================
test('KB-20 & UI: Giao diện Định hướng HLV, Báo cáo Phòng thay đồ (7 bộ lọc), Họp riêng, Phone cảnh báo, Hồ sơ Tab 7-8 & Save/Load toàn phần', () => {
  const { mockDocument } = createMockDomEnvironment();
  const state = new GameState();
  const calls = { summoned: [] };
  const ui = new UIManager(state, makeStubAudio(), new SaveManager(), makeStubCallbacks(calls));
  const rel = state.relationshipSystem;

  // Tạo trạng thái phong phú để test UI & Save/Load
  const p = state.getPsgSquad().find((x) => x.position !== 'GK' && x.ovr >= 82);
  p.contractYears = 1;
  rel._escalateOrCreateConflict(p.id, { scenario: 'bench_frustration', cause: 'Thiếu phút thi đấu', deltaLevel: 2 });
  rel._escalateOrCreateConflict(p.id, { scenario: 'bench_frustration', cause: 'Tiếp tục dự bị', deltaLevel: 1 });
  rel._escalateOrCreateConflict(p.id, { scenario: 'bench_frustration', cause: 'Đòi gặp Chủ tịch', deltaLevel: 1 });
  rel.createCommitment({ playerId: p.id, type: 'give_playtime', content: 'Trao thêm phút thi đấu', deadlineWeeks: 4 });

  // 1. Điện thoại Chủ tịch hiển thị cảnh báo tương lai & nút Họp riêng ngay
  ui.openPhone();
  assert.ok(mockDocument.getElementById('ph-meet-risk'), 'Điện thoại phải hiện cảnh báo tương lai cầu thủ kèm nút Họp riêng');

  // 2. Ban huấn luyện -> Tab 5 Định hướng sử dụng cầu thủ
  ui.staffSubTab = 'directives';
  ui.openComputer('coach');
  assert.ok(mockDocument.getElementById('dir-submit-btn'), 'Tab Ban huấn luyện phải có mục Định hướng sử dụng cầu thủ');
  mockDocument.getElementById('dir-note-inp').value = 'Cân nhắc xoay tua hợp lý';
  mockDocument.getElementById('dir-submit-btn').click();
  assert.ok(rel.directives.length >= 1, 'Gửi định hướng trên UI phải lưu chỉ đạo vào ClubRelationshipSystem');

  // 3. Báo cáo Phòng thay đồ + 7 bộ lọc + Phản hồi Rò rỉ báo chí
  ui.openComputer('locker_room');
  assert.ok(mockDocument.querySelectorAll('#modal-body .kpi-card').length >= 5, 'Phải có 5 KPI tổng quan phòng thay đồ');
  assert.ok(mockDocument.querySelector('#modal-body .lr-leak-resp'), 'Phải hiển thị nút phản hồi rò rỉ báo chí');

  for (const [elId, val] of [
    ['lr-f-squad', 'all'],
    ['lr-f-pos', p.position],
    ['lr-f-mood', 'critical'],
    ['lr-f-contract', 'expiring'],
    ['lr-f-cmt', 'open'],
    ['lr-f-search', p.name.slice(0, 4)]
  ]) {
    const sel = mockDocument.getElementById(elId);
    assert.ok(sel, `Phải có bộ lọc ${elId}`);
    sel.value = val;
    sel.dispatchEvent({ type: elId === 'lr-f-search' ? 'input' : 'change' });
  }
  assert.ok(mockDocument.querySelector(`#modal-body .lr-open-prof[data-pid="${p.id}"]`), 'Kết quả lọc phải khớp cầu thủ mục tiêu');

  // 4. Mở Hồ sơ cầu thủ Tab 7 (Tâm lý) & Tab 8 (Lịch sử) từ Phòng thay đồ
  mockDocument.querySelector(`.open-profile-btn[data-pid="${p.id}"]`).click();
  assert.ok(mockDocument.querySelector('#modal-body .profile-hero'), 'Phải mở Hồ sơ cầu thủ');
  assert.match(mockDocument.getElementById('modal-body').innerHTML, /10 Chỉ số Quan hệ Nội bộ/);
  mockDocument.querySelector('#modal-body [data-pptab="history"]').click();
  assert.match(mockDocument.getElementById('modal-body').innerHTML, /Lịch sử Quan hệ & Mâu thuẫn/);

  // 5. Mở Họp riêng đa lượt từ Task Window & triệu tập nhân vật 3D
  ui.openPlayerMeetingSelector(p.id, { restart: true });
  assert.ok(calls.summoned.includes(p.name), 'Phải gọi callback summonPlayer trong 3D khi họp riêng');
  assert.ok(mockDocument.querySelector('#task-body .pm-tactic-btn'));
  mockDocument.querySelector('#task-body .pm-tactic-btn[data-tactic="listen_needs"]').click();
  mockDocument.querySelector('#task-body .pm-tactic-btn[data-tactic="respect_decision"]').click();
  mockDocument.getElementById('pm-finish-close').click();
  assert.equal(ui.isTaskWindowOpen(), false);

  // 6. Save / Load khôi phục nguyên vẹn toàn bộ hệ thống quan hệ & không trùng playerId
  const snap = state.exportFullState({ x: -24, z: -15 });
  const state2 = new GameState();
  state2.importFullState(JSON.parse(JSON.stringify(snap)));
  const rel2 = state2.relationshipSystem;
  assert.equal(rel2.directives.length, rel.directives.length);
  assert.equal(rel2.commitments.length, rel.commitments.length);
  assert.equal(rel2.conflicts.length, rel.conflicts.length);
  assert.equal(rel2.pressLeaks.length, rel.pressLeaks.length);
  assert.equal(rel2.ensurePlayerProfile(p.id).wantsToLeave, rel.ensurePlayerProfile(p.id).wantsToLeave);

  const ids = state2.getAllPlayers().map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, 'Không được tồn tại bất kỳ playerId trùng lặp nào sau Save/Load');
});

console.log(`\n🏆 KẾT QUẢ KIỂM THỬ QUAN HỆ NỘI BỘ CLB: ${passed} bộ kiểm thử chuyên sâu đã vượt qua.`);
