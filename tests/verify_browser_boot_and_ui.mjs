// tests/verify_browser_boot_and_ui.mjs
// Kiểm thử toàn diện quá trình khởi chạy trình duyệt thực tế (src/main.js), thế giới 3D,
// vòng lặp frame, và toàn bộ các màn hình UI (HUD, Điện thoại, TV, Bảo tàng, 18 App Máy tính, Tham vấn Chuyển nhượng).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const htmlSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// =========================================================================
// MOCK BROWSER ENVIRONMENT (Canvas 2D + WebGLRenderer + DOM + Storage)
// =========================================================================
function createMockCtx2D() {
  const grad = { addColorStop() {} };
  return {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '12px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    shadowColor: 'transparent',
    shadowBlur: 0,
    fillRect() {},
    strokeRect() {},
    clearRect() {},
    fillText() {},
    strokeText() {},
    measureText: (txt) => ({ width: String(txt || '').length * 7 }),
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    ellipse() {},
    rect() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    clip() {},
    setLineDash() {},
    drawImage() {},
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    getImageData: () => ({ data: new Uint8ClampedArray(16) }),
    putImageData() {}
  };
}

class MockClassList {
  constructor() { this.set = new Set(); }
  _sync(str) { this.set = new Set(String(str || '').split(/\s+/).filter(Boolean)); }
  add(...xs) { xs.forEach((x) => x && this.set.add(x)); }
  remove(...xs) { xs.forEach((x) => this.set.delete(x)); }
  contains(x) { return this.set.has(x); }
  toggle(x, force) {
    if (force === undefined) {
      if (this.set.has(x)) { this.set.delete(x); return false; }
      this.set.add(x); return true;
    }
    if (force) { this.set.add(x); return true; }
    this.set.delete(x); return false;
  }
}

function makeMockElement(tagName = 'div', id = '') {
  const listeners = new Map();
  const children = [];
  const el = {
    tagName: tagName.toUpperCase(),
    id,
    className: '',
    classList: new MockClassList(),
    dataset: {},
    style: { cssText: '', setProperty() {} },
    value: '',
    textContent: '',
    _innerHTML: '',
    scrollTop: 0,
    scrollLeft: 0,
    width: 300,
    height: 150,
    offsetParent: {},
    children,
    parentNode: null,
    appendChild(child) { children.push(child); child.parentNode = el; return child; },
    removeChild(child) {
      const i = children.indexOf(child);
      if (i >= 0) children.splice(i, 1);
      return child;
    },
    remove() {},
    focus() {},
    blur() {},
    click() {
      const cbs = listeners.get('click') || [];
      cbs.forEach((cb) => cb({ target: el, currentTarget: el, preventDefault() {}, stopPropagation() {} }));
    },
    closest() { return null; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844, right: 390, bottom: 844 }),
    getContext: (type) => (type === '2d' ? createMockCtx2D() : {}),
    toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=',
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(type) || [];
      listeners.set(type, arr.filter((x) => x !== fn));
    },
    setAttribute(k, v) { if (k === 'id') el.id = v; if (k === 'class') { el.className = v; el.classList._sync(v); } },
    getAttribute(k) { return k === 'id' ? el.id : k === 'class' ? el.className : null; },
    querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) {
      // Collect matching elements from last rendered HTML by id or class
      const matches = [];
      const parts = String(sel).split(',').map((s) => s.trim()).filter(Boolean);
      for (const p of parts) {
        if (p.startsWith('#')) {
          const found = byId.get(p.slice(1));
          if (found) matches.push(found);
        } else if (p.startsWith('.')) {
          const cls = p.slice(1).split('.')[0];
          const found = byClass.get(cls) || [];
          matches.push(...found);
        } else if (p.startsWith('[') && p.endsWith(']')) {
          const attr = p.slice(1, -1).split('=')[0];
          const found = byAttr.get(attr) || [];
          matches.push(...found);
        }
      }
      return matches;
    }
  };
  Object.defineProperty(el, 'innerHTML', {
    get: () => el._innerHTML,
    set: (val) => {
      el._innerHTML = String(val || '');
      indexHtmlTokens(el._innerHTML);
    }
  });
  return el;
}

const byId = new Map();
const byClass = new Map();
const byAttr = new Map();

function indexHtmlTokens(html) {
  const tagRe = /<([a-zA-Z0-9-]+)([^>]*)>/g;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[1];
    const attrsStr = m[2];
    const idM = /\bid=["']([^"']+)["']/.exec(attrsStr);
    const clsM = /\bclass=["']([^"']+)["']/.exec(attrsStr);
    const el = (idM && byId.get(idM[1])) || makeMockElement(tag, idM ? idM[1] : '');
    if (idM) byId.set(idM[1], el);
    if (clsM) {
      el.className = clsM[1];
      el.classList._sync(clsM[1]);
      clsM[1].split(/\s+/).filter(Boolean).forEach((c) => {
        if (!byClass.has(c)) byClass.set(c, []);
        if (!byClass.get(c).includes(el)) byClass.get(c).push(el);
      });
    }
    const attrRe = /\b(data-[a-zA-Z0-9_-]+)=["']([^"']*)["']/g;
    let am;
    while ((am = attrRe.exec(attrsStr)) !== null) {
      const key = am[1].replace(/^data-/, '').replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      el.dataset[key] = am[2];
      if (!byAttr.has(am[1])) byAttr.set(am[1], []);
      if (!byAttr.get(am[1]).includes(el)) byAttr.get(am[1]).push(el);
    }
    const valM = /\bvalue=["']([^"']*)["']/.exec(attrsStr);
    if (valM) el.value = valM[1];
    const styleM = /\bstyle=["']([^"']*)["']/.exec(attrsStr);
    if (styleM) {
      el.style.cssText = styleM[1];
      styleM[1].split(';').forEach((decl) => {
        const idx = decl.indexOf(':');
        if (idx > 0) {
          const prop = decl.slice(0, idx).trim().replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
          const val = decl.slice(idx + 1).trim();
          if (prop) el.style[prop] = val;
        }
      });
    }
  }
}

indexHtmlTokens(htmlSrc);

const storageMap = new Map();
globalThis.localStorage = {
  getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear()
};

globalThis.window = {
  location: { protocol: 'https:', hostname: 'minhchieuytber-pixel.github.io', search: '' },
  innerWidth: 390,
  innerHeight: 844,
  devicePixelRatio: 2,
  addEventListener() {},
  removeEventListener() {},
  localStorage: globalThis.localStorage
};
globalThis.document = {
  readyState: 'complete',
  hidden: false,
  body: makeMockElement('body'),
  activeElement: null,
  getElementById: (id) => byId.get(id) || null,
  createElement: (tag) => makeMockElement(tag),
  querySelector: (sel) => globalThis.document.body.querySelector(sel),
  querySelectorAll: (sel) => globalThis.document.body.querySelectorAll(sel),
  addEventListener() {},
  removeEventListener() {}
};
if (!globalThis.navigator) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 },
    configurable: true
  });
}
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
globalThis.performance = globalThis.performance || { now: () => Date.now() };

// Stub WebGLRenderer on THREE before importing main.js so real 3D scene builds cleanly without GPU
class StubWebGLRenderer {
  constructor() {
    this.domElement = byId.get('game-canvas');
    this.shadowMap = { enabled: false, type: THREE.PCFShadowMap, autoUpdate: true, needsUpdate: false };
    this.toneMapping = THREE.ACESFilmicToneMapping;
    this.toneMappingExposure = 1.0;
    this.info = { render: { calls: 42, triangles: 12000 }, memory: { geometries: 30, textures: 12 }, programs: [{}] };
    this._dpr = 1;
  }
  setPixelRatio(r) { this._dpr = r; }
  getPixelRatio() { return this._dpr; }
  setSize() {}
  render() {}
}

await import('../src/core/threeSetup.js');
const ThreePatched = { ...THREE, WebGLRenderer: StubWebGLRenderer };
globalThis.THREE = ThreePatched;
globalThis.window.THREE = ThreePatched;

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

await import('../src/main.js');
const game = globalThis.window.__PSG_GAME__;

test('BOOT-1: FootballPresidentGame3D khởi chạy thành công không lỗi JS với toàn bộ 3D campus + NPC + UI', () => {
  assert(game, 'window.__PSG_GAME__ phải được khởi tạo');
  assert(game.campus, 'PsgCampusScene phải khởi tạo thành công');
  assert(game.trainingComplex, 'TrainingComplexScene 3D phải khởi tạo');
  assert(game.dressingRoom, 'DressingRoomSystem 3D phải khởi tạo');
  assert(game.museumScene, 'PsgMuseumScene 3D phải khởi tạo');
  assert(game.stadiumZone, 'ParcDesPrincesZone 3D phải khởi tạo');
  assert(game.state.playerResidenceSystem, 'PlayerResidenceSystem 30 phòng phải khởi tạo');
  assert(game.npcSystem.npcs.length > 20, 'Phải sinh đủ NPC & cầu thủ PSG trong thế giới 3D');
  assert.equal(byId.get('boot-error-banner')?.style.display, 'none', 'Không được hiện boot-error-banner');
});

test('BOOT-2: Vòng lặp render/physics, streaming 3D, teleport và tương tác hoạt động mượt', () => {
  game.lastTime = performance.now() - 16;
  for (let i = 0; i < 5; i++) {
    game.loop(performance.now() + i * 16);
  }
  game.teleportToRoom('president_office');
  game.teleportToRoom('training_pitch');
  game.teleportToRoom('player_residence_f2');
  game.teleportToRoom('stadium_pitch');
  game.teleportToRoom('psg_museum');
  game.updateWorldStreaming(true);
  game.detectAimedTarget();
});

test('BOOT-3: Mở toàn bộ 18 ứng dụng Máy tính, Điện thoại, TV, Bảo tàng, Matchday, Training Complex & Tham vấn chuyển nhượng không lỗi', () => {
  const ui = game.ui;
  const tabs = [
    'overview', 'approvals', 'squad', 'formation', 'training',
    'transfers', 'valuation', 'contracts', 'locker_room', 'finance',
    'sponsors', 'facilities', 'commercial', 'media', 'museum',
    'leagues', 'staff', 'reports', 'history'
  ];
  for (const tab of tabs) {
    ui.openComputer(tab);
    assert(byId.get('modal-body').innerHTML.length > 50, `Tab ${tab} phải render nội dung hợp lệ`);
  }

  ui.openMedicalCenterModal();
  assert(byId.get('modal-body').innerHTML.includes('6 Khu Chức Năng'));
  ui.openFitnessCenterModal();
  assert(byId.get('modal-body').innerHTML.includes('FITNESS & PERFORMANCE'));
  ui.openPlayerResidenceModal(1);
  assert(byId.get('modal-body').innerHTML.includes('ROOM 01'));
  ui.openTechnicalDepartmentModal();
  assert(byId.get('modal-body').innerHTML.includes('PHÒNG KỸ THUẬT PSG'));

  // Tạo 1 incoming bid thực tế rồi mở Phone, TaskModal và TransferConsultationModal
  const target = game.state.getPsgSquad().find((p) => p.position !== 'GK');
  const bid = {
    id: 'bid_ui_smoke_1',
    date: '05/08/2026',
    buyerClub: 'Real Madrid',
    buyerStrategy: 'Galácticos',
    dealType: 'buy',
    playerId: target.id,
    playerName: target.name,
    position: target.position,
    ovr: target.ovr,
    fee: Math.round((target.valuation?.current ?? target.value) * 1.1),
    askingPrice: Math.round((target.valuation?.current ?? target.value) * 1.2),
    buyOptionFee: 0,
    clauses: { sellOnPct: 10, bonusFee: 5, paymentTerms: '65% trả trước + 35% trả góp', extraNotes: [] },
    deadlineWeek: 3,
    deadlineDate: 'Cuối Tuần 3',
    rounds: 0,
    status: 'pending'
  };
  game.state.transferSystem.incomingBids.unshift(bid);

  ui.openPhone();
  assert(byId.get('modal-body').innerHTML.includes('ph-bid-consult'));

  ui.openIncomingBidTaskModal(bid.id);
  assert(byId.get('task-body').innerHTML.includes('bid-consult'));

  ui.openTransferConsultationModal(bid.id);
  assert(byId.get('task-body').innerHTML.includes('Bảng Tổng Hợp Tham Vấn Nội Bộ'));

  ui.openTelevisionModal();
  ui.openMuseumModal('history');
  ui.openMatchdayCenter();
  ui.openFastTravel();
  ui.openBoardMeeting();
});

test('BOOT-4: Bản build Vite (dist/) hợp lệ cho GitHub Pages (đường dẫn tương đối, .nojekyll, không còn bare import three)', () => {
  const distDir = path.join(ROOT, 'dist');
  assert(fs.existsSync(path.join(distDir, 'index.html')), 'Thiếu dist/index.html — hãy chạy npm run build');
  assert(fs.existsSync(path.join(distDir, '.nojekyll')), 'Thiếu dist/.nojekyll cho GitHub Pages');
  assert(fs.existsSync(path.join(distDir, 'sw.js')), 'Thiếu dist/sw.js');
  assert(fs.existsSync(path.join(distDir, 'manifest.json')), 'Thiếu dist/manifest.json');
  assert(fs.existsSync(path.join(distDir, 'icons', 'psg-president-192.svg')), 'Thiếu dist/icons/psg-president-192.svg');

  const distHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  assert(!distHtml.includes('./src/main.js'), 'dist/index.html không được trỏ tới ./src/main.js thô');
  assert(/src=["']\.\/assets\/index-[^"']+\.js["']/.test(distHtml), 'dist/index.html phải nhúng bundle ./assets/index-*.js tương thích subpath GitHub Pages');

  const assetsDir = path.join(distDir, 'assets');
  const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
  assert(jsFiles.length >= 1, 'dist/assets phải có file JS bundle');
  for (const jf of jsFiles) {
    const code = fs.readFileSync(path.join(assetsDir, jf), 'utf8');
    assert(!/\bfrom\s*['"]three['"]/.test(code), `Bundle ${jf} không được còn bare import "three"`);
  }
});

console.log(`\n🎉 TỔNG KẾT BROWSER BOOT & FULL UI SMOKE TEST: ${passed}/4 PASSED!`);
if (process.exitCode && process.exitCode !== 0) process.exit(process.exitCode);

