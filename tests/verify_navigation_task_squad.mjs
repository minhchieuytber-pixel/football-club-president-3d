// tests/verify_navigation_task_squad.mjs
// Bộ kiểm thử toàn diện cho 3 trụ cột nâng cấp:
// 1. Smart Back + Phím tắt ESC / Alt+ArrowLeft + Vuốt cạnh trái iPhone Safari
// 2. Smart Task Management (6 tầng UI độc lập, vòng đời 5 trạng thái, lỗi giữ cửa sổ cho thử lại, hoàn thành giữ nguyên App)
// 3. Squad Formation Overhaul (Zero Drag&Drop, Tap-to-Select 2 bước, Bench cuộn độc lập 35+ cầu thủ, Card/List, Search, 7 Filters, AI Top-3, In-Match 5 lượt, Save/Load)

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GameState } from '../src/club/GameState.js';
import { SaveManager } from '../src/save/SaveManager.js';
import { UIManager } from '../src/ui/UIManager.js';
import { SmartTaskManager, TASK_STATUS } from '../src/ui/TaskManager.js';

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
    prepend(child) {
      child.parentElement = this;
      this.children.unshift(child);
      return child;
    }
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
      for (const c of node.children) {
        out.push(c);
        collectAll(c, out);
      }
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
    ['modal-backdrop', 'DIV'],
    ['modal-box', 'DIV'],
    ['modal-head-bar', 'DIV'],
    ['modal-smart-back', 'BUTTON'],
    ['modal-title', 'DIV'],
    ['modal-close', 'BUTTON'],
    ['modal-body', 'DIV'],
    ['task-backdrop', 'DIV'],
    ['task-box', 'DIV'],
    ['task-head-bar', 'DIV'],
    ['task-smart-back', 'BUTTON'],
    ['task-title', 'DIV'],
    ['task-status-badge', 'SPAN'],
    ['task-close', 'BUTTON'],
    ['task-body', 'DIV'],
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
    ['ceremony-sheet', 'DIV']
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

// ============================================================================
// PART 1: SMART BACK + ESC / ALT+LEFT / IPHONE LEFT-EDGE SWIPE
// ============================================================================
test('NAV-1: ESC, Alt+ArrowLeft & Vuốt mép trái iPhone Safari điều hướng chuẩn và không ảnh hưởng khi đang ở Desktop', () => {
  const { mockDocument, mockWindow } = createMockDomEnvironment();
  const state = new GameState();
  const ui = new UIManager(state, makeStubAudio(), new SaveManager(), makeStubCallbacks());

  // Khi đang ở Desktop 3D (không mở Modal hay Task) -> vuốt trái & ESC không làm gì
  mockDocument.dispatchEvent({ type: 'touchstart', touches: [{ clientX: 12, clientY: 300 }] });
  mockDocument.dispatchEvent({ type: 'touchend', changedTouches: [{ clientX: 98, clientY: 306 }] });
  assert.equal(ui.isModalOpen(), false);

  // Mở Overview -> Squad -> Hồ sơ cầu thủ
  ui.openComputer('overview');
  ui.openComputer('squad');
  const firstProf = mockDocument.querySelector('#modal-body .open-profile-btn');
  assert.ok(firstProf);
  firstProf.click();
  assert.equal(ui.navHistory.current.screen, 'player_profile');

  // Vuốt từ giữa màn hình (clientX=110) KHÔNG được trigger Smart Back
  mockDocument.dispatchEvent({ type: 'touchstart', touches: [{ clientX: 110, clientY: 300 }] });
  mockDocument.dispatchEvent({ type: 'touchend', changedTouches: [{ clientX: 210, clientY: 302 }] });
  assert.equal(ui.navHistory.current.screen, 'player_profile', 'Vuốt từ giữa màn hình không được Back');

  // Vuốt mép trái iPhone (clientX <= 28, dx >= 62) -> quay về Squad
  mockDocument.dispatchEvent({ type: 'touchstart', touches: [{ clientX: 16, clientY: 300 }] });
  mockDocument.dispatchEvent({ type: 'touchend', changedTouches: [{ clientX: 96, clientY: 308 }] });
  assert.equal(ui.navHistory.current.routeKey, 'pc:squad');

  // Alt+ArrowLeft -> quay về Overview
  mockDocument.dispatchEvent({ type: 'keydown', key: 'ArrowLeft', altKey: true });
  assert.equal(ui.navHistory.current.routeKey, 'pc:overview');

  // ESC ở gốc -> đóng về Desktop 3D
  mockDocument.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(ui.isModalOpen(), false);
});

// ============================================================================
// PART 2: SMART TASK MANAGEMENT (6 TẦNG UI + VÒNG ĐỜI + LỖI + ĐA APP)
// ============================================================================
test('TASK-1: SmartTaskManager quản lý đầy đủ 5 trạng thái vòng đời & cô lập trạng thái nhiều App', () => {
  const tm = new SmartTaskManager();
  const t1 = tm.createTask({ id: 't1', type: 'transfer_neg', title: 'Đàm phán Kylian', sourceApp: 'transfers', status: TASK_STATUS.PENDING });
  assert.equal(t1.status, TASK_STATUS.PENDING);

  tm.startTask('t1');
  assert.equal(tm.getTask('t1').status, TASK_STATUS.IN_PROGRESS);

  tm.failTask('t1', 'Thiếu ngân sách');
  assert.equal(tm.getTask('t1').status, TASK_STATUS.FAILED);
  assert.equal(tm.getTask('t1').lastError, 'Thiếu ngân sách');

  tm.startTask('t1');
  tm.completeTask('t1', { signed: true });
  assert.equal(tm.getTask('t1').status, TASK_STATUS.COMPLETED);

  tm.markAppOpen('transfers');
  tm.saveAppViewState('transfers', { transferPage: 2 });
  tm.markAppOpen('finance');
  tm.saveAppViewState('finance', { scrollMainTop: 120 });
  assert.equal(tm.getAppViewState('transfers').transferPage, 2);
  assert.equal(tm.getAppViewState('finance').scrollMainTop, 120);
});

test('TASK-2: Hoàn thành Chuyển nhượng 2 giai đoạn, Tài chính & Tuyển BHL chỉ đóng Task Window, giữ nguyên App đang mở', () => {
  const { mockDocument } = createMockDomEnvironment();
  const state = new GameState();
  state.transferSystem.openWindow('summer');
  const ui = new UIManager(state, makeStubAudio(), new SaveManager(), makeStubCallbacks());

  // A. Từ Tab Chuyển nhượng -> Đàm phán 2 giai đoạn trong Task Window -> Thử lỗi ngân sách -> Sửa -> Chốt ký
  ui.openComputer('transfers');
  const target = state.players.find((p) => p.club !== 'Paris Saint-Germain' && p.value <= 40);
  assert.ok(target);
  const startNegRes = state.transferSystem.startNegotiation(target.id, 'buy');
  assert.equal(startNegRes.ok, true);
  ui.openTwoStageTransferModal(startNegRes.negotiation.id);

  assert.equal(ui.isTaskWindowOpen(), true, 'Task Window phải mở');
  assert.equal(ui.isModalOpen(), true, 'App Máy tính bên dưới vẫn phải đang mở');
  assert.equal(ui.activeTab, 'transfers');

  // Nhập số tiền vượt quỹ -> Task FAIL nhưng Task Window VẪN MỞ & hiện #task-error-banner để thử lại
  const feeInput = mockDocument.getElementById('n1-fee');
  feeInput.value = String(Math.round(state.finance.transferBudget + 500));
  mockDocument.getElementById('n1-submit').click();
  assert.equal(ui.isTaskWindowOpen(), true, 'Lỗi không được đóng Task Window');
  assert.ok(mockDocument.getElementById('task-error-banner'), 'Phải hiển thị banner lỗi ngay trong Task Window');
  assert.equal(ui.taskManager.getTask(`transfer_neg_${startNegRes.negotiation.id}`).status, TASK_STATUS.FAILED);

  // Sửa lại mức giá hợp lý -> Giai đoạn 1 thành công -> Giai đoạn 2 -> Chốt chữ ký -> CHỈ đóng Task Window, VẪN ở tab transfers!
  mockDocument.getElementById('n1-fee').value = String(Math.round(startNegRes.negotiation.clubAskFee * 1.1));
  mockDocument.getElementById('n1-submit').click();
  assert.equal(startNegRes.negotiation.stage, 2);
  mockDocument.getElementById('n2-wage').value = String(Math.round(startNegRes.negotiation.playerAskWage * 1.1));
  mockDocument.getElementById('n2-submit').click();

  assert.equal(target.club, 'Paris Saint-Germain');
  assert.equal(ui.isTaskWindowOpen(), false, 'Hoàn tất tác vụ phải đóng Task Window');
  assert.equal(ui.isModalOpen(), true, 'Đóng Task Window KHÔNG được thoát về Desktop');
  assert.equal(ui.activeTab, 'transfers', 'Hoàn thành chuyển nhượng phải giữ nguyên App đang mở (transfers), không tự nhảy sang squad');

  // B. Tab Tài chính -> Phê duyệt ngân sách -> Test over-budget -> Test thành công giữ nguyên tab Finance
  ui.openComputer('finance');
  const firstFinBtn = mockDocument.querySelector('.fin-open-task');
  assert.ok(firstFinBtn);
  const ledgerBefore = state.finance.ledger.length;
  firstFinBtn.click();
  assert.equal(ui.isTaskWindowOpen(), true);
  mockDocument.getElementById('fin-amount').value = '99999';
  mockDocument.getElementById('fin-approve').click();
  assert.equal(ui.isTaskWindowOpen(), true, 'Vượt ngân sách phải giữ Task Window mở để chỉnh lại');
  assert.ok(mockDocument.getElementById('task-error-banner'));

  mockDocument.getElementById('fin-amount').value = '25';
  mockDocument.getElementById('fin-approve').click();
  assert.equal(ui.isTaskWindowOpen(), false);
  assert.equal(ui.activeTab, 'finance', 'Sau duyệt tài chính phải ở nguyên tab Tài chính');
  assert.equal(state.finance.ledger.length, ledgerBefore + 1);

  // C. Tab Ban Huấn Luyện -> Đa bước Sa thải / Ứng viên / Đàm phán trong Task Window -> Back giữa các bước & Hoàn thành giữ nguyên Coach tab
  ui.openComputer('coach');
  const recruitBtn = mockDocument.querySelector('.stf-recruit-role') || mockDocument.getElementById('stf-fire-hc');
  assert.ok(recruitBtn);
  if (recruitBtn.id === 'stf-fire-hc') {
    recruitBtn.click();
    assert.equal(ui.isTaskWindowOpen(), true);
    mockDocument.getElementById('confirm-fire-btn').click();
  } else {
    recruitBtn.click();
  }
  const candPick = mockDocument.querySelector('#task-body .cand-pick-btn');
  assert.ok(candPick);
  candPick.click();
  assert.ok(mockDocument.getElementById('sn-wage'), 'Đang ở bước đàm phán BHL');

  // Nút Back của Task Window quay về danh sách ứng viên (không thoát App!)
  mockDocument.getElementById('task-smart-back').click();
  assert.ok(mockDocument.querySelector('#task-body .cand-pick-btn'), 'Smart Back Task Window phải lùi về bước Ứng viên');
  assert.equal(ui.activeTab, 'coach');

  // Chọn lại và bổ nhiệm thành công -> đóng Task Window & giữ nguyên tab coach
  mockDocument.querySelector('#task-body .cand-pick-btn').click();
  const cWage = Number(mockDocument.getElementById('sn-wage').value || 100);
  mockDocument.getElementById('sn-wage').value = String(Math.round(cWage * 1.2));
  mockDocument.getElementById('sn-submit').click();
  assert.equal(ui.isTaskWindowOpen(), false);
  assert.equal(ui.activeTab, 'coach', 'Hoàn thành bổ nhiệm BHL phải ở nguyên tab Ban huấn luyện');
});

// ============================================================================
// PART 3: SQUAD FORMATION OVERHAUL (NO DRAG-DROP, TAP 2 BƯỚC, BENCH ĐỘC LẬP 35+ CẦU THỦ)
// ============================================================================
test('SQUAD-1: Xóa bỏ hoàn toàn Drag & Drop, giữ 5 phần bố cục và hỗ trợ cuộn toàn bộ 35+ cầu thủ', () => {
  const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
  const fpSource = fs.readFileSync(path.resolve('src/ui/FormationPitchView.js'), 'utf8');

  assert.doesNotMatch(indexHtml, /tac-drag-ghost|tac-zone-layer/, 'Không được còn CSS kéo thả cũ');
  assert.doesNotMatch(fpSource, /tac-drag-ghost|tac-zone-layer|pointermove|draggable=/, 'Không được còn JS kéo thả cũ');
  assert.match(indexHtml, /\.tac-pitch-sticky\s*\{[\s\S]*flex-shrink:\s*0/, 'Sân bóng phải cố định không bị cuộn mất theo danh sách dự bị');
  assert.match(indexHtml, /\.tac-bench-scroll\s*\{[\s\S]*overflow-y:\s*auto[\s\S]*touch-action:\s*pan-y/, 'Khu vực dự bị phải cuộn dọc mượt trên Safari');

  const { mockDocument } = createMockDomEnvironment();
  const state = new GameState();
  // Đảm bảo đội một PSG có ít nhất 35 cầu thủ để kiểm tra không cắt bớt danh sách dự bị
  const existingPsg = state.getPsgSquad();
  const needExtra = Math.max(0, 36 - existingPsg.length);
  const nonPsg = state.players.filter((p) => p.club !== 'Paris Saint-Germain').slice(0, needExtra);
  nonPsg.forEach((p) => { p.club = 'Paris Saint-Germain'; p.squadLevel = 'Đội một'; });
  state.formationSystem.notify();

  const ui = new UIManager(state, makeStubAudio(), new SaveManager(), makeStubCallbacks());
  ui.openComputer('formation');

  const benchCards = mockDocument.querySelectorAll('#tac-bench-scroll .tac-bench-card');
  const expectedBenchCount = state.formationSystem.getFormationData().bench.length;
  assert.ok(expectedBenchCount >= 24, `Dự bị phải có >= 24 cầu thủ (hiện có ${expectedBenchCount})`);
  assert.equal(benchCards.length, expectedBenchCount, 'Phải hiển thị TOÀN BỘ danh sách cầu thủ dự bị mà không cắt xén');
});

test('SQUAD-2: Tap-to-Select 2 bước, Hủy chọn, Card/List Toggle, Tìm kiếm, 7 Bộ lọc, Top 3 AI, Không rebuild Dock & In-Match 5 lượt', () => {
  const { mockDocument } = createMockDomEnvironment();
  const state = new GameState();
  const ui = new UIManager(state, makeStubAudio(), new SaveManager(), makeStubCallbacks());
  ui.openComputer('formation');

  const dockShellBefore = mockDocument.getElementById('macos-dock-shell');
  const benchScroller = mockDocument.getElementById('tac-bench-scroll');
  benchScroller.scrollTop = 260;

  // 1. Chạm cầu thủ đá chính #8 -> hiện hướng dẫn + Top 3 AI đề xuất + nút Hủy chọn
  const slot8Before = state.formationSystem.starterIds[8];
  mockDocument.querySelector('.tac-slot-card[data-slotidx="8"]').click();
  assert.equal(ui.selectedSlotIdx, 8);
  assert.ok(mockDocument.getElementById('tac-cancel-select'), 'Phải hiện nút Hủy chọn khi đã chọn 1 cầu thủ');
  const recs = mockDocument.querySelectorAll('.tac-bench-card.top-fit-rec');
  assert.ok(recs.length >= 1 && recs.length <= 3, 'Phải đánh dấu Top 3 cầu thủ thay thế phù hợp nhất');

  // Bấm Hủy chọn -> xóa lựa chọn, giữ nguyên vị trí cuộn bench & giữ nguyên DOM thanh Dock
  mockDocument.getElementById('tac-cancel-select').click();
  assert.equal(ui.selectedSlotIdx, null);
  assert.equal(mockDocument.getElementById('macos-dock-shell'), dockShellBefore, 'Cập nhật chiến thuật tại chỗ không được rebuild thanh Dock');
  assert.equal(mockDocument.getElementById('tac-bench-scroll').scrollTop, 260, 'Phải bảo toàn vị trí cuộn bench');

  // 2. Chạm Đá chính (8) -> Chạm Dự bị khả dụng -> Đổi người ngay lập tức & giữ nguyên bench scroll
  const availBenchBtn = mockDocument.querySelector('.tac-bench-card[data-avail="available"]');
  assert.ok(availBenchBtn);
  const subInPid = availBenchBtn.dataset.benchpid;

  mockDocument.querySelector('.tac-slot-card[data-slotidx="8"]').click();
  mockDocument.querySelector(`.tac-bench-card[data-benchpid="${subInPid}"]`).click();

  assert.equal(state.formationSystem.starterIds[8], subInPid, 'Phải đưa cầu thủ dự bị vào vị trí #8');
  assert.equal(ui.selectedSlotIdx, null);
  assert.equal(mockDocument.getElementById('macos-dock-shell'), dockShellBefore);
  assert.equal(mockDocument.getElementById('tac-bench-scroll').scrollTop, 260);
  assert.ok(state.formationSystem.getFormationData().bench.some((b) => b.playerId === slot8Before), 'Cầu thủ bị thay ra phải xuống danh sách dự bị');

  // 3. Chạm Đá chính (3) -> Chạm Đá chính (4) -> Đổi vị trí trên sân cho nhau
  const p3 = state.formationSystem.starterIds[3];
  const p4 = state.formationSystem.starterIds[4];
  mockDocument.querySelector('.tac-slot-card[data-slotidx="3"]').click();
  mockDocument.querySelector('.tac-slot-card[data-slotidx="4"]').click();
  assert.equal(state.formationSystem.starterIds[3], p4);
  assert.equal(state.formationSystem.starterIds[4], p3);

  // 4. Chạm Dự bị trước -> Chạm Đá chính (9) -> Đổi người ngược lại
  const benchPick2 = mockDocument.querySelector('.tac-bench-card[data-avail="available"]').dataset.benchpid;
  mockDocument.querySelector(`.tac-bench-card[data-benchpid="${benchPick2}"]`).click();
  assert.equal(ui.selectedBenchId, benchPick2);
  mockDocument.querySelector('.tac-slot-card[data-slotidx="9"]').click();
  assert.equal(state.formationSystem.starterIds[9], benchPick2);

  // 5. Chuyển chế độ Card (2 cột) / List (1 cột) & Tìm kiếm theo Tên / Số áo & 7 Bộ lọc
  mockDocument.getElementById('tac-view-list').click();
  assert.equal(ui.benchViewMode, 'list');
  assert.ok(mockDocument.querySelector('#tac-bench-scroll .tac-bench-grid').classList.contains('mode-list'));

  mockDocument.getElementById('tac-view-card').click();
  assert.equal(ui.benchViewMode, 'card');
  assert.ok(mockDocument.querySelector('#tac-bench-scroll .tac-bench-grid').classList.contains('mode-card'));

  const firstBenchPlayer = state.formationSystem.getFormationData().bench[0].player;
  const searchEl = mockDocument.getElementById('tac-bench-search');
  searchEl.value = firstBenchPlayer.name.slice(0, 5);
  searchEl.dispatchEvent({ type: 'input' });
  const searchRes = mockDocument.querySelectorAll('#tac-bench-scroll .tac-bench-card');
  assert.ok(searchRes.length >= 1, 'Tìm kiếm theo tên phải trả về cầu thủ phù hợp');

  // Tìm theo số áo
  const searchEl2 = mockDocument.getElementById('tac-bench-search');
  searchEl2.value = String(firstBenchPlayer.shirtNumber);
  searchEl2.dispatchEvent({ type: 'input' });
  assert.ok(mockDocument.querySelector(`.tac-bench-card[data-benchpid="${firstBenchPlayer.id}"]`), 'Tìm kiếm theo số áo phải thấy cầu thủ');

  // Reset tìm kiếm & kiểm tra 7 bộ lọc: ALL, GK, DEF, MID, ATT, YOUTH, MULTI
  mockDocument.getElementById('tac-bench-search').value = '';
  mockDocument.getElementById('tac-bench-search').dispatchEvent({ type: 'input' });
  for (const filterKey of ['ALL', 'GK', 'DEF', 'MID', 'ATT', 'YOUTH', 'MULTI']) {
    const fBtn = mockDocument.querySelector(`.tac-filter-btn[data-bfilter="${filterKey}"]`);
    assert.ok(fBtn, `Phải có nút lọc ${filterKey}`);
    fBtn.click();
    assert.equal(ui.benchPosFilter, filterKey);
  }
  mockDocument.querySelector('.tac-filter-btn[data-bfilter="ALL"]').click();

  // 6. Chặn thay cầu thủ chấn thương & Giới hạn 5 lượt thay người trong trận
  const injuredBench = state.formationSystem.getFormationData().bench.find((b) => b.availability === 'available');
  injuredBench.player.injuryDays = 10;
  ui._refreshFormationInPlace();
  mockDocument.querySelector('.tac-slot-card[data-slotidx="7"]').click();
  mockDocument.querySelector(`.tac-bench-card[data-benchpid="${injuredBench.playerId}"]`).click();
  assert.notEqual(state.formationSystem.starterIds[7], injuredBench.playerId, 'Không được cho cầu thủ chấn thương vào sân');
  injuredBench.player.injuryDays = 0;

  mockDocument.getElementById('tac-match-toggle').click();
  assert.equal(state.formationSystem.matchSubSession.active, true);
  for (let i = 0; i < 5; i++) {
    const subCand = state.formationSystem.getFormationData().bench.find((b) => b.availability === 'available');
    mockDocument.querySelector('.tac-slot-card[data-slotidx="6"]').click();
    mockDocument.querySelector(`.tac-bench-card[data-benchpid="${subCand.playerId}"]`).click();
  }
  assert.equal(state.formationSystem.matchSubSession.subsUsed, 5);
  const blockedSub = state.formationSystem.getFormationData().bench.find((b) => b.availability === 'available');
  const starter6 = state.formationSystem.starterIds[6];
  mockDocument.querySelector('.tac-slot-card[data-slotidx="6"]').click();
  mockDocument.querySelector(`.tac-bench-card[data-benchpid="${blockedSub.playerId}"]`).click();
  assert.equal(state.formationSystem.starterIds[6], starter6, 'Hết 5 lượt thay người phải chặn thay mới từ bench');

  // 7. Lưu/Tải + Không trùng lặp ID cầu thủ toàn CLB
  const singleClubCheck = state.transferSystem.verifySingleClubOwnership();
  assert.equal(singleClubCheck.ok, true, 'Không được tồn tại ID cầu thủ trùng lặp');
  const exported = state.exportFullState();
  const state2 = new GameState();
  state2.importFullState(exported);
  assert.deepEqual(state2.formationSystem.starterIds, state.formationSystem.starterIds);
  assert.equal(state2.formationSystem.matchSubSession.subsUsed, 5);
});

console.log(`\n🎯 TỔNG KẾT KIỂM THỬ ĐIỀU HƯỚNG, TÁC VỤ & ĐỘI HÌNH: ${passed} bài kiểm thử đã vượt qua.`);
