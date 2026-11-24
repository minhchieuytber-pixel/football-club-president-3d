// tests/verify_dock_and_smart_back.mjs
// Bộ kiểm thử tự động:
// Phần 1: Sửa lỗi thanh Dock macOS (giữ nguyên vị trí, tọa độ kéo thả, scroll, hướng, kích thước, thu gọn khi bấm app/đổi tab/thu nhỏ/đóng mở/Save-Load).
// Phần 2: Nút Quay lại Thông minh (Smart Back đa cấp, khôi phục tab/scroll/filter/page/selectedPlayer/collapse, đóng popup con trước, cảnh báo form chưa lưu).

import assert from 'node:assert/strict';
import { DockStateManager, NavigationHistoryManager, DEFAULT_DOCK_STATE } from '../src/ui/DockAndNavManager.js';
import { GameState } from '../src/club/GameState.js';
import { SaveManager } from '../src/save/SaveManager.js';
import { UIManager } from '../src/ui/UIManager.js';

// =========================================================================
// MOCK DOM / WINDOW / LOCALSTORAGE NHẸ CHO NODE ESM
// =========================================================================
function createMockDomEnvironment() {
  const storageMap = new Map();
  const localStorage = {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
    clear: () => storageMap.clear()
  };

  class MockClassList {
    constructor(el) {
      this.el = el;
      this._set = new Set();
    }
    _syncFromString(str) {
      this._set = new Set(String(str || '').split(/\s+/).filter(Boolean));
    }
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
    // Lightweight tag tokenizer sufficient for querying #id, .class, [attr], input/select/button/details
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
          if (stack[i].tagName === closeTag) {
            stack.length = i;
            break;
          }
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
    // For <select>, pick selected option value or first option
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
    get textContent() {
      return this._text + this.children.map((c) => c.textContent).join('');
    }
    set textContent(v) {
      this._text = String(v ?? '');
      this.children = [];
      this._innerHTML = '';
    }
    set innerHTML(v) {
      this._innerHTML = String(v ?? '');
      this._text = '';
      parseHtmlIntoChildren(this._innerHTML, this);
    }
    get innerHTML() { return this._innerHTML; }
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }
    remove() {
      if (this.parentElement) {
        this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
      }
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
    click() {
      this.dispatchEvent({ type: 'click' });
    }
    focus() {}
    setSelectionRange() {}
    getBoundingClientRect() {
      if (this.id === 'macos-stage') return { left: 0, top: 0, width: 960, height: 600 };
      if (this.id === 'macos-dock-shell') {
        const x = this.style.left ? parseFloat(this.style.left) : 260;
        const y = this.style.top ? parseFloat(this.style.top) : 520;
        return { left: x, top: y, width: 220, height: 54 };
      }
      return { left: 0, top: 0, width: 100, height: 40 };
    }
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
      for (const c of node.children) {
        out.push(c);
        collectAll(c, out);
      }
    }
    const allNodes = [];
    collectAll(root, allNodes);
    if (chain.length === 1) {
      return allNodes.filter((n) => matchSimpleSelector(n, chain[0]));
    }
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
    ['modal-backdrop', 'DIV'],
    ['modal-box', 'DIV'],
    ['modal-smart-back', 'BUTTON'],
    ['modal-title', 'DIV'],
    ['modal-close', 'BUTTON'],
    ['modal-body', 'DIV'],
    ['smart-confirm-overlay', 'DIV'],
    ['sc-title', 'H4'],
    ['sc-msg', 'P'],
    ['sc-cancel', 'BUTTON'],
    ['sc-confirm', 'BUTTON'],
    ['toast-stack', 'DIV'],
    ['interact-prompt', 'DIV'],
    ['interact-text', 'SPAN'],
    ['hud-date', 'DIV'],
    ['hud-budget', 'DIV'],
    ['hud-next-match', 'DIV'],
    ['hud-unread', 'SPAN'],
    ['hud-pending', 'SPAN'],
    ['btn-speed', 'BUTTON'],
    ['btn-phone', 'BUTTON'],
    ['btn-squad', 'BUTTON'],
    ['btn-matchday', 'BUTTON'],
    ['btn-fast-travel', 'BUTTON'],
    ['btn-save', 'BUTTON'],
    ['btn-audio', 'BUTTON'],
    ['btn-quality', 'BUTTON'],
    ['ceremony-sheet', 'DIV'],
    ['task-backdrop', 'DIV'],
    ['task-box', 'DIV'],
    ['task-head-bar', 'DIV'],
    ['task-smart-back', 'BUTTON'],
    ['task-title', 'DIV'],
    ['task-status-badge', 'SPAN'],
    ['task-close', 'BUTTON'],
    ['task-body', 'DIV']
  ];
  for (const [id, tag] of shellIds) {
    const el = new MockElement(tag);
    el.id = id;
    if (id === 'modal-smart-back' || id === 'task-smart-back') {
      const arr = new MockElement('SPAN'); arr.className = 'smart-back-arrow'; arr.textContent = '←';
      const lbl = new MockElement('SPAN'); lbl.className = 'smart-back-label'; lbl.textContent = 'Quay lại';
      el.appendChild(arr); el.appendChild(lbl);
    }
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
    addEventListener() {}
  };

  globalThis.localStorage = localStorage;
  globalThis.window = mockWindow;
  globalThis.document = mockDocument;
  globalThis.requestAnimationFrame = (fn) => { try { fn(); } catch (_) {} return 1; };

  return { mockDocument, mockWindow, localStorage };
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

function makeStubAudio() {
  return {
    muted: false,
    playClick() {},
    playSuccess() {},
    playAlert() {},
    playDoor() {},
    playWhistle() {},
    toggleMute() { this.muted = !this.muted; return this.muted; }
  };
}

function makeStubCallbacks() {
  return {
    pauseGame: () => {},
    resumeGame: () => {},
    cycleTimeScale: () => 1,
    cycleQuality: () => 'high',
    teleport: () => {},
    summonBoard: () => {},
    summonPlayer: () => {},
    endBoard: () => {},
    dismissPlayer: () => {},
    toggleTvPower: () => true,
    switchTvChannel: () => {},
    autoSaveNow: async () => ({ ok: true }),
    exportSnapshot: () => ({}),
    importSnapshot: () => {},
    refreshMuseumAndTv: () => {},
    setEventCamera: () => {},
    setStadiumCctv: () => {},
    resetNewGame: () => {}
  };
}

// =========================================================================
// PART 1: DOCK STATE MANAGER & PERSISTENCE UNIT + INTEGRATION TESTS
// =========================================================================
test('DOCK-1: DockStateManager lưu giữ đúng cấu hình, chuẩn hóa tọa độ & chỉ reset khi yêu cầu', () => {
  const dm = new DockStateManager();
  assert.deepEqual(dm.getState(), DEFAULT_DOCK_STATE);

  dm.setPosition('left');
  assert.equal(dm.getState().position, 'left');
  assert.equal(dm.getState().orientation, 'vertical');

  dm.setFloatingCoordinates(1200, 900, { containerWidth: 960, containerHeight: 600, dockWidth: 220, dockHeight: 54 });
  const fs = dm.getState();
  assert.equal(fs.position, 'floating');
  assert.ok(fs.x <= 960 - 220 - 6 && fs.x >= 6);
  assert.ok(fs.y <= 600 - 54 - 6 && fs.y >= 32);

  dm.toggleCollapsed(true);
  dm.setSize('large');
  dm.updateScroll(315, 22);
  const snap = dm.exportState();

  const dm2 = new DockStateManager(snap);
  assert.equal(dm2.getState().position, 'floating');
  assert.equal(dm2.getState().collapsed, true);
  assert.equal(dm2.getState().size, 'large');
  assert.equal(dm2.getState().scrollLeft, 315);

  dm2.resetToDefault();
  assert.deepEqual(dm2.getState(), DEFAULT_DOCK_STATE);
});

test('DOCK-2: Bấm app trên Dock, chuyển tab, thu nhỏ/phóng to, đóng/mở Máy tính KHÔNG reset vị trí & scrollLeft của Dock', () => {
  const { mockDocument, mockWindow, localStorage } = createMockDomEnvironment();
  localStorage.clear();

  const state = new GameState();
  const save = new SaveManager();
  const ui = new UIManager(state, makeStubAudio(), save, makeStubCallbacks());

  ui.openComputer('overview');
  const shellFirst = mockDocument.getElementById('macos-dock-shell');
  assert.ok(shellFirst, 'Dock shell phải tồn tại khi mở Máy tính');

  // Kéo thả Dock sang vị trí nổi (180, 140) thông qua #dock-drag-handle
  const handle = mockDocument.getElementById('dock-drag-handle');
  handle.dispatchEvent({ type: 'pointerdown', pointerId: 1, clientX: 260, clientY: 520, pointerType: 'mouse', button: 0 });
  mockWindow.dispatchEvent({ type: 'pointermove', pointerId: 1, clientX: 180, clientY: 140 });
  mockWindow.dispatchEvent({ type: 'pointerup', pointerId: 1, clientX: 180, clientY: 140 });

  assert.equal(ui.dockManager.getState().position, 'floating');
  const draggedX = ui.dockManager.getState().x;
  const draggedY = ui.dockManager.getState().y;
  assert.ok(draggedX > 10 && draggedY > 10, 'Tọa độ kéo thả phải được lưu');

  // Cuộn ngang danh sách icon Dock & thu gọn + chọn cỡ L
  const scrollEl = mockDocument.getElementById('dock-items-scroll');
  scrollEl.scrollLeft = 240;
  scrollEl.dispatchEvent({ type: 'scroll' });
  mockDocument.getElementById('dock-collapse-btn').click();
  ui.dockManager.setSize('large');
  ui._saveDockState();
  ui.applyDockVisualState({ preserveScroll: true });

  // 1) Bấm 1 icon app bất kỳ trên Dock -> Không dựng lại shell & không đổi vị trí/scroll
  const squadDockBtn = mockDocument.querySelector('#macos-dock-shell .dock-item[data-pctab="squad"]');
  assert.ok(squadDockBtn);
  squadDockBtn.click();
  assert.equal(ui.activeTab, 'squad');
  assert.equal(mockDocument.getElementById('macos-dock-shell'), shellFirst, 'DOM Dock shell phải được giữ nguyên tại chỗ (không destroy/rebuild)');
  assert.equal(ui.dockManager.getState().position, 'floating');
  assert.equal(ui.dockManager.getState().x, draggedX);
  assert.equal(ui.dockManager.getState().y, draggedY);
  assert.equal(mockDocument.getElementById('dock-items-scroll').scrollLeft, 240);
  assert.equal(ui.dockManager.getState().collapsed, true);
  assert.equal(ui.dockManager.getState().size, 'large');

  // 2) Chuyển đổi qua lại giữa các ứng dụng (sidebar + nút Thu nhỏ/Phóng to)
  mockDocument.querySelector('#macos-workspace [data-pctab="transfers"]').click();
  assert.equal(ui.activeTab, 'transfers');
  mockDocument.getElementById('mac-min').click();
  assert.equal(ui.macMinimized, true);
  mockDocument.querySelector('#macos-dock-shell .dock-item[data-pctab="finance"]').click();
  assert.equal(ui.macMinimized, false);
  assert.equal(ui.activeTab, 'finance');
  mockDocument.getElementById('mac-max').click();

  assert.equal(ui.dockManager.getState().position, 'floating');
  assert.equal(ui.dockManager.getState().x, draggedX);
  assert.equal(ui.dockManager.getState().y, draggedY);
  assert.equal(mockDocument.getElementById('dock-items-scroll').scrollLeft, 240);

  // 3) Mở Điện thoại rồi quay lại, hoặc đóng Máy tính rồi mở lại -> Dock vẫn giữ đúng vị trí đã kéo & cuộn
  ui.openPhone();
  ui.handleSmartBack();
  assert.equal(ui.activeTab, 'finance');
  assert.equal(ui.dockManager.getState().x, draggedX);
  assert.equal(mockDocument.getElementById('dock-items-scroll').scrollLeft, 240);

  ui.closeModal(true);
  ui.openComputer('overview');
  assert.equal(ui.dockManager.getState().position, 'floating');
  assert.equal(ui.dockManager.getState().x, draggedX);
  assert.equal(ui.dockManager.getState().y, draggedY);
  assert.equal(mockDocument.getElementById('dock-items-scroll').scrollLeft, 240);

  // 4) Lưu / Khởi tạo lại UIManager từ SaveManager & GameState.uiPrefs -> vẫn giữ Dock
  state.uiPrefs = { dockState: ui.dockManager.exportState(), navState: ui.navHistory.exportState() };
  const exported = state.exportFullState();
  ui.closeModal(true);
  const state2 = new GameState();
  state2.importFullState(exported);
  const ui2 = new UIManager(state2, makeStubAudio(), save, makeStubCallbacks());
  ui2.openComputer('overview');
  assert.equal(ui2.dockManager.getState().position, 'floating');
  assert.equal(ui2.dockManager.getState().x, draggedX);
  assert.equal(ui2.dockManager.getState().size, 'large');

  // 5) Chỉ reset khi người chơi chủ động bấm Đặt lại mặc định (#dock-pop-reset)
  mockDocument.getElementById('dock-gear-btn').click();
  mockDocument.getElementById('dock-pop-reset').click();
  assert.equal(ui2.dockManager.getState().position, 'bottom');
  assert.equal(ui2.dockManager.getState().x, null);
  assert.equal(ui2.dockManager.getState().collapsed, false);
  assert.equal(ui2.dockManager.getState().scrollLeft, 0);
});

// =========================================================================
// PART 2: SMART BACK BUTTON & MULTI-LEVEL STATE RESTORATION TESTS
// =========================================================================
test('BACK-1: NavigationHistoryManager không trùng lặp frame & hoạt động chính xác đa cấp', () => {
  const nav = new NavigationHistoryManager(10);
  nav.navigate({ routeKey: 'pc:overview', screen: 'computer', label: 'Tổng quan', params: { tab: 'overview' }, uiSnapshot: { activeTab: 'overview' } });
  nav.navigate({ routeKey: 'pc:transfers', screen: 'computer', label: 'Chuyển nhượng', params: { tab: 'transfers' }, uiSnapshot: { activeTab: 'transfers', transferPage: 1 } });
  // Cùng routeKey -> cập nhật tại chỗ, không nhân đôi stack
  nav.navigate({ routeKey: 'pc:transfers', screen: 'computer', label: 'Chuyển nhượng', params: { tab: 'transfers' }, uiSnapshot: { activeTab: 'transfers', transferPage: 2 } }, { skipHistory: true });
  nav.navigate({ routeKey: 'player_profile:P1', screen: 'player_profile', label: 'Hồ sơ', params: { playerId: 'P1' }, uiSnapshot: { selectedPlayerId: 'P1' } });

  assert.equal(nav.stack.length, 2);
  assert.equal(nav.canGoBack(), true);
  assert.equal(nav.peekBackLabel(), 'Chuyển nhượng');

  const back1 = nav.pop();
  assert.equal(back1.routeKey, 'pc:transfers');
  assert.equal(back1.uiSnapshot.transferPage, 2);

  const back2 = nav.pop();
  assert.equal(back2.routeKey, 'pc:overview');
  assert.equal(nav.canGoBack(), false);
  assert.equal(nav.pop(), null);
});

test('BACK-2: Quay lại đa cấp Máy tính -> Chuyển nhượng (filter, trang 2, scroll, cầu thủ) -> Hồ sơ -> Đàm phán (cảnh báo form bẩn)', () => {
  const { mockDocument, localStorage } = createMockDomEnvironment();
  localStorage.clear();

  const state = new GameState();
  const ui = new UIManager(state, makeStubAudio(), new SaveManager(), makeStubCallbacks());

  // Cấp 1: Tổng quan Máy tính
  ui.openComputer('overview');
  assert.equal(mockDocument.getElementById('pc-smart-back').classList.contains('is-root'), true);

  // Cấp 2: Chuyển nhượng -> chọn lọc, sang trang 2, cuộn trang & chọn cầu thủ
  ui.openComputer('transfers');
  const nextPageBtn = mockDocument.getElementById('tf-next-page');
  assert.ok(nextPageBtn && !nextPageBtn.disabled, 'Phải có trang 2 trên Thị trường Chuyển nhượng');
  nextPageBtn.click();
  assert.equal(ui.transferPage, 2);

  const posSelect = mockDocument.getElementById('tf-pos');
  posSelect.value = 'ST';
  // Reset về trang 1 khi đổi bộ lọc, rồi giữ kết quả lọc ST
  posSelect.dispatchEvent({ type: 'change' });
  assert.equal(ui.transferFilters.pos, 'ST');
  // Đặt lại trang 1 để đảm bảo danh sách có dòng ST, hoặc test bộ lọc 'ALL' + trang 2
  const posSelect2 = mockDocument.getElementById('tf-pos');
  posSelect2.value = 'ALL';
  posSelect2.dispatchEvent({ type: 'change' });
  mockDocument.getElementById('tf-next-page').click();
  assert.equal(ui.transferPage, 2);

  const macMain = mockDocument.querySelector('.macos-main');
  const tableWrap = mockDocument.querySelector('#modal-body .table-wrap');
  macMain.scrollTop = 185;
  macMain.dispatchEvent({ type: 'scroll' });
  tableWrap.scrollTop = 310;
  tableWrap.dispatchEvent({ type: 'scroll' });

  // Mở hồ sơ một cầu thủ ở trang 2
  const profileBtn = mockDocument.querySelector('#modal-body .open-profile-btn');
  assert.ok(profileBtn);
  const pickedPid = profileBtn.dataset.pid;
  profileBtn.click();

  // Cấp 3: Đang ở Hồ sơ cầu thủ -> Đổi tab nội bộ 'contract' không được tạo thêm cấp back trùng
  const depthBeforeProfileTab = ui.navHistory.stack.length;
  const contractTabBtn = mockDocument.querySelector('[data-pptab="contract"]');
  assert.ok(contractTabBtn);
  contractTabBtn.click();
  assert.equal(ui.navHistory.stack.length, depthBeforeProfileTab, 'Đổi tab trong Hồ sơ không tạo thêm entry lịch sử');

  // Cấp 4: Mở Đàm phán chuyển nhượng từ Hồ sơ (mở trong Task Window độc lập Lớp 4)
  const negBtn = mockDocument.getElementById('pp-negotiate');
  if (negBtn) {
    negBtn.click();
    assert.equal(ui.isTaskWindowOpen(), true);
    assert.equal(ui.navHistory.current.screen, 'player_profile', 'Task Window không ghi đè lịch sử App bên dưới');

    // Sửa input trong Task Window để kích hoạt dirty guard
    const feeInput = mockDocument.getElementById('n1-fee');
    assert.ok(feeInput);
    feeInput.value = '999';
    feeInput.dispatchEvent({ type: 'input' });

    // Bấm Smart Back lần 1 -> hiện #smart-confirm-overlay chứ chưa đóng Task Window
    mockDocument.getElementById('task-smart-back').click();
    assert.equal(ui.isSmartConfirmOpen(), true);
    assert.equal(ui.isTaskWindowOpen(), true);

    // Bấm Smart Back lần 2 -> đóng #smart-confirm-overlay trước
    mockDocument.getElementById('task-smart-back').click();
    assert.equal(ui.isSmartConfirmOpen(), false);
    assert.equal(ui.isTaskWindowOpen(), true);

    // Bấm Smart Back lần 3 -> xác nhận hủy tác vụ -> đóng Task Window & vẫn ở đúng Hồ sơ cầu thủ
    mockDocument.getElementById('task-smart-back').click();
    assert.equal(ui.isSmartConfirmOpen(), true);
    mockDocument.getElementById('sc-confirm').click();
    assert.equal(ui.isTaskWindowOpen(), false);
    assert.equal(ui.navHistory.current.screen, 'player_profile');
    assert.equal(ui.navHistory.current.params.playerId, pickedPid);
  }

  // Quay lại từ Hồ sơ cầu thủ -> về đúng pc:transfers trang 2 + scroll + highlight cầu thủ vừa chọn
  mockDocument.getElementById('modal-smart-back').click();
  assert.equal(ui.navHistory.current.routeKey, 'pc:transfers');
  assert.equal(ui.transferPage, 2, 'Phải khôi phục đúng trang 2');
  assert.equal(ui.selectedPlayerId, pickedPid, 'Phải giữ đúng cầu thủ đã chọn');
  assert.equal(mockDocument.querySelector('.macos-main').scrollTop, 185, 'Phải khôi phục scrollTop của khung chính');
  assert.equal(mockDocument.querySelector('#modal-body .table-wrap').scrollTop, 310, 'Phải khôi phục scrollTop của bảng');
  const highlightedRow = mockDocument.querySelector(`#modal-body [data-rowid="${pickedPid}"]`);
  assert.ok(highlightedRow && highlightedRow.classList.contains('highlight-row'), 'Dòng cầu thủ vừa xem phải được highlight');

  // Quay lại từ pc:transfers -> về pc:overview
  mockDocument.getElementById('pc-smart-back').click();
  assert.equal(ui.navHistory.current.routeKey, 'pc:overview');

  // Quay lại ở cấp gốc pc:overview -> thoát về Desktop 3D & dọn lịch sử
  mockDocument.getElementById('pc-smart-back').click();
  assert.equal(mockDocument.getElementById('modal-backdrop').classList.contains('open'), false);
  assert.equal(ui.navHistory.current, null);
});

test('BACK-3: Đóng popup xác nhận chiến thuật trước khi rời tab & luồng Điện thoại -> Tin tức -> Chi tiết bài báo', () => {
  const { mockDocument, localStorage } = createMockDomEnvironment();
  localStorage.clear();

  const state = new GameState();
  const ui = new UIManager(state, makeStubAudio(), new SaveManager(), makeStubCallbacks());

  // 1) Popup con Chiến thuật (pendingFormationPreview / confirmOptimalXI)
  ui.openComputer('formation');
  ui.pendingFormationPreview = state.formationSystem.previewFormationChange('4-2-3-1');
  ui.openComputer('formation', { skipHistory: true });
  mockDocument.getElementById('pc-smart-back').click();
  assert.equal(ui.pendingFormationPreview, null, 'Smart Back phải đóng hộp thoại xác nhận sơ đồ trước');
  assert.equal(ui.activeTab, 'formation', 'Không được rời tab Chiến thuật khi mới đóng popup con');
  ui.closeModal(true);

  // 2) Điện thoại -> Tin tức Máy tính -> Mở chi tiết bài báo -> Back từng cấp
  ui.openPhone();
  assert.equal(ui.navHistory.current.screen, 'phone');
  ui.mediaSubTab = 'news';
  ui.activeArticleId = null;
  ui.openComputer('media');
  assert.equal(ui.navHistory.current.routeKey, 'pc:media');

  const newsCard = mockDocument.querySelector('[data-open-news]');
  if (newsCard) {
    const nid = newsCard.dataset.openNews;
    newsCard.click();
    assert.equal(ui.navHistory.current.routeKey, `pc:media:article:${nid}`);

    // Back 1: Chi tiết bài báo -> Danh sách báo chí
    mockDocument.getElementById('pc-smart-back').click();
    assert.equal(ui.navHistory.current.routeKey, 'pc:media');
    assert.equal(ui.activeArticleId, null);

    // Back 2: Danh sách báo chí -> Điện thoại
    mockDocument.getElementById('pc-smart-back').click();
    assert.equal(ui.navHistory.current.screen, 'phone');

    // Back 3: Điện thoại -> Desktop 3D
    mockDocument.getElementById('modal-smart-back').click();
    assert.equal(mockDocument.getElementById('modal-backdrop').classList.contains('open'), false);
  }
});

console.log(`\n🎯 TỔNG KẾT KIỂM THỬ DOCK & SMART BACK: ${passed} bài kiểm thử đã vượt qua.`);
