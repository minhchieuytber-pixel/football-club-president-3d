// src/core/AdaptivePerformanceManager.js
// Adaptive Performance & Telemetry Manager for Football Club President Simulator 3D (iPhone Portrait & Desktop)
// Zero-GC rolling frame-time buffer, hysteresis-based 4-tier scaling, shadow map pacing, modal power-save & opt-in ?perf=1 HUD.

const TIER_NAMES = ['High', 'Medium', 'Low', 'Emergency'];

function detectMobileIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function detectMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  return detectMobileIOS() || /Android|Mobile/i.test(navigator.userAgent || '');
}

export class AdaptivePerformanceManager {
  constructor(renderer, camera, scene, sunLight = null) {
    this.renderer = renderer;
    this.camera = camera;
    this.scene = scene;
    this.sunLight = sunLight;

    this.isIOS = detectMobileIOS();
    this.isMobile = detectMobileDevice();

    // Tier presets ordered 0 (High) -> 3 (Emergency)
    this.tiers = [
      {
        name: 'High',
        maxDpr: this.isIOS ? 1.5 : 1.75,
        shadows: true,
        shadowSize: 1024,
        shadowInterval: 2,
        npcLodStrideMultiplier: 1.0,
        cameraFar: 320,
        fogNear: 120,
        fogFar: 305
      },
      {
        name: 'Medium',
        maxDpr: 1.25,
        shadows: true,
        shadowSize: 512,
        shadowInterval: 4,
        npcLodStrideMultiplier: 1.5,
        cameraFar: 280,
        fogNear: 110,
        fogFar: 265
      },
      {
        name: 'Low',
        maxDpr: 1.0,
        shadows: false,
        shadowSize: 512,
        shadowInterval: 0,
        npcLodStrideMultiplier: 2.0,
        cameraFar: 240,
        fogNear: 95,
        fogFar: 228
      },
      {
        name: 'Emergency',
        maxDpr: 0.85,
        shadows: false,
        shadowSize: 512,
        shadowInterval: 0,
        npcLodStrideMultiplier: 3.0,
        cameraFar: 200,
        fogNear: 80,
        fogFar: 192
      }
    ];

    // User quality ceiling ('High' | 'Medium' | 'Low')
    this.userCeiling = 'Medium';
    this.ceilingIdx = 1;
    this.tierIdx = 1;

    // Zero-GC 60-frame rolling window
    this._windowSize = 60;
    this._samples = new Float32Array(this._windowSize);
    this._sorted = new Float32Array(this._windowSize);
    this._sampleCursor = 0;
    this._sampleCount = 0;
    this._sampleSum = 0;

    // Computed telemetry
    this.fps = 60;
    this.avgMs = 16.67;
    this.p95Ms = 16.67;
    this.npcLodStrideMultiplier = 1.5;

    // Hysteresis state (seconds)
    this._slowAccumSec = 0;
    this._fastAccumSec = 0;
    this._cooldownSec = 2.0; // Grace period right after boot
    this._downgradeThresholdMs = 22.0; // < ~45 FPS
    this._downgradeHoldSec = 2.5;
    this._upgradeThresholdMs = 14.0;   // > ~71 FPS / plenty of headroom (or < 14ms)
    this._upgradeHoldSec = 6.0;
    this._tierCooldownSec = 4.0;

    // Shadow pacing state
    this._renderFrameCounter = 0;
    this._forceShadowUpdate = true;
    this._currentAppliedDpr = 0;
    this._currentShadowSize = 1024;

    // Modal power-save state (~20 FPS when full-screen modal covers 3D canvas)
    this._modalBackdropEl = (typeof document !== 'undefined') ? document.getElementById('modal-backdrop') : null;
    this._lastModalRenderMs = 0;
    this._modalRenderIntervalMs = 50; // 20 FPS

    // Opt-in ?perf=1 debug HUD
    this._debugHudEnabled = this._checkPerfQueryFlag();
    this._debugHudEl = null;
    this._lastDebugHudUpdateMs = 0;
    if (this._debugHudEnabled) {
      this._createDebugHud();
    }

    // Configure renderer shadow defaults once
    if (this.renderer && this.renderer.shadowMap) {
      if (typeof THREE !== 'undefined' && THREE.PCFShadowMap !== undefined) {
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
      }
      this.renderer.shadowMap.autoUpdate = false;
    }
  }

  _checkPerfQueryFlag() {
    try {
      if (typeof window === 'undefined' || !window.location) return false;
      const params = new URLSearchParams(window.location.search || '');
      return params.get('perf') === '1';
    } catch (_) {
      return false;
    }
  }

  _createDebugHud() {
    if (typeof document === 'undefined' || !document.body) return;
    let el = document.getElementById('perf-debug-hud');
    if (!el) {
      el = document.createElement('div');
      el.id = 'perf-debug-hud';
      el.style.cssText = [
        'position:fixed',
        'left:max(10px, env(safe-area-inset-left))',
        'top:max(54px, calc(env(safe-area-inset-top) + 46px))',
        'z-index:120',
        'pointer-events:none',
        'background:rgba(6,13,28,0.88)',
        'border:1px solid rgba(56,189,248,0.45)',
        'border-radius:8px',
        'padding:6px 9px',
        'font:600 10.5px/1.4 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace',
        'color:#e2e8f0',
        'max-width:92vw',
        'white-space:pre-wrap',
        'box-shadow:0 4px 16px rgba(0,0,0,0.45)'
      ].join(';');
      document.body.appendChild(el);
    }
    this._debugHudEl = el;
  }

  get currentTier() {
    return this.tiers[this.tierIdx];
  }

  get tierName() {
    return TIER_NAMES[this.tierIdx] || 'Medium';
  }

  setUserQualityCeiling(level) {
    const normalized = level === 'High' ? 'High' : level === 'Low' ? 'Low' : 'Medium';
    this.userCeiling = normalized;
    this.ceilingIdx = normalized === 'High' ? 0 : normalized === 'Low' ? 2 : 1;
    this.tierIdx = this.ceilingIdx;
    this._slowAccumSec = 0;
    this._fastAccumSec = 0;
    this._cooldownSec = 2.0;
    this.applyTier(this.tierIdx, true);
  }

  reapplyCurrentTier() {
    this.applyTier(this.tierIdx, true);
  }

  applyTier(idx, force = false) {
    const clampedIdx = Math.max(this.ceilingIdx, Math.min(this.tiers.length - 1, idx));
    if (!force && clampedIdx === this.tierIdx) return;
    this.tierIdx = clampedIdx;
    const cfg = this.tiers[this.tierIdx];

    this.npcLodStrideMultiplier = cfg.npcLodStrideMultiplier;

    // 1. Dynamic Pixel Ratio (only reallocate backbuffer if changed)
    const nativeDpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    const targetDpr = Math.max(0.75, Math.min(cfg.maxDpr, nativeDpr));
    if (this.renderer && (force || Math.abs(targetDpr - this._currentAppliedDpr) > 0.01)) {
      this._currentAppliedDpr = targetDpr;
      this.renderer.setPixelRatio(targetDpr);
    }

    // 2. Shadows (PCFShadowMap + paced manual updates + safe map resize)
    if (this.renderer && this.renderer.shadowMap) {
      if (typeof THREE !== 'undefined' && THREE.PCFShadowMap !== undefined) {
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
      }
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.shadowMap.enabled = cfg.shadows;

      if (this.sunLight && this.sunLight.shadow) {
        this.sunLight.castShadow = cfg.shadows;
        if (cfg.shadows && this._currentShadowSize !== cfg.shadowSize) {
          this._currentShadowSize = cfg.shadowSize;
          this.sunLight.shadow.mapSize.width = cfg.shadowSize;
          this.sunLight.shadow.mapSize.height = cfg.shadowSize;
          if (this.sunLight.shadow.map) {
            this.sunLight.shadow.map.dispose();
            this.sunLight.shadow.map = null;
          }
        }
      }
      this._forceShadowUpdate = cfg.shadows;
    }

    // 3. Camera Far Clip & Fog Distance (keeps Parc des Princes skyline visible)
    if (this.camera && this.camera.far !== cfg.cameraFar) {
      this.camera.far = cfg.cameraFar;
      this.camera.updateProjectionMatrix();
    }
    if (this.scene && this.scene.fog && typeof this.scene.fog.near === 'number') {
      this.scene.fog.near = cfg.fogNear;
      this.scene.fog.far = cfg.fogFar;
    }
  }

  requestShadowUpdate() {
    if (this.currentTier.shadows) {
      this._forceShadowUpdate = true;
    }
  }

  prepareShadowMap() {
    const cfg = this.currentTier;
    if (!this.renderer || !this.renderer.shadowMap || !cfg.shadows) return false;
    this._renderFrameCounter++;
    const interval = cfg.shadowInterval || 2;
    if (this._forceShadowUpdate || (this._renderFrameCounter % interval === 0)) {
      this._forceShadowUpdate = false;
      this.renderer.shadowMap.needsUpdate = true;
      return true;
    }
    this.renderer.shadowMap.needsUpdate = false;
    return false;
  }

  isModalCoveringViewport() {
    if (!this._modalBackdropEl && typeof document !== 'undefined') {
      this._modalBackdropEl = document.getElementById('modal-backdrop');
    }
    return !!(this._modalBackdropEl && this._modalBackdropEl.classList.contains('open'));
  }

  shouldRenderFrame(nowMs, modalCovering = false) {
    if (!modalCovering) return true;
    if (nowMs - this._lastModalRenderMs >= this._modalRenderIntervalMs) {
      this._lastModalRenderMs = nowMs;
      return true;
    }
    return false;
  }

  resetHistory() {
    this._sampleCursor = 0;
    this._sampleCount = 0;
    this._sampleSum = 0;
    this._slowAccumSec = 0;
    this._fastAccumSec = 0;
    this._cooldownSec = 1.5;
  }

  recordFrame(frameDeltaMs, skipAdaptiveScaling = false) {
    // Ignore giant pauses (tab switch, debugger pause, first frame)
    if (!Number.isFinite(frameDeltaMs) || frameDeltaMs <= 0 || frameDeltaMs > 250) return;

    if (this._sampleCount === this._windowSize) {
      this._sampleSum -= this._samples[this._sampleCursor];
    } else {
      this._sampleCount++;
    }
    this._samples[this._sampleCursor] = frameDeltaMs;
    this._sampleSum += frameDeltaMs;
    this._sampleCursor = (this._sampleCursor + 1) % this._windowSize;

    this.avgMs = this._sampleSum / this._sampleCount;
    this.fps = Math.max(1, Math.min(120, Math.round(1000 / Math.max(1, this.avgMs))));

    if (skipAdaptiveScaling || this._sampleCount < 20) return;

    const dtSec = frameDeltaMs * 0.001;
    if (this._cooldownSec > 0) {
      this._cooldownSec = Math.max(0, this._cooldownSec - dtSec);
      return;
    }

    if (this.avgMs > this._downgradeThresholdMs && this.tierIdx < this.tiers.length - 1) {
      this._slowAccumSec += dtSec;
      this._fastAccumSec = 0;
      if (this._slowAccumSec >= this._downgradeHoldSec) {
        this._slowAccumSec = 0;
        this._cooldownSec = this._tierCooldownSec;
        this.applyTier(this.tierIdx + 1, false);
      }
    } else if (this.avgMs < this._upgradeThresholdMs && this.tierIdx > this.ceilingIdx) {
      this._fastAccumSec += dtSec;
      this._slowAccumSec = 0;
      if (this._fastAccumSec >= this._upgradeHoldSec) {
        this._fastAccumSec = 0;
        this._cooldownSec = this._tierCooldownSec;
        this.applyTier(this.tierIdx - 1, false);
      }
    } else {
      // Gentle decay so transient spikes don't accumulate indefinitely
      this._slowAccumSec = Math.max(0, this._slowAccumSec - dtSec * 0.5);
      this._fastAccumSec = Math.max(0, this._fastAccumSec - dtSec * 0.5);
    }
  }

  _computeP95Ms() {
    const n = this._sampleCount;
    if (n === 0) return 0;
    for (let i = 0; i < n; i++) this._sorted[i] = this._samples[i];
    // Simple insertion sort on <=60 floats (zero GC, ~100ns)
    for (let i = 1; i < n; i++) {
      const key = this._sorted[i];
      let j = i - 1;
      while (j >= 0 && this._sorted[j] > key) {
        this._sorted[j + 1] = this._sorted[j];
        j--;
      }
      this._sorted[j + 1] = key;
    }
    const idx = Math.min(n - 1, Math.floor(n * 0.95));
    return this._sorted[idx];
  }

  getPerfReport(renderer = this.renderer, npcSystem = null, stadiumZone = null) {
    this.p95Ms = this._computeP95Ms();
    const infoRender = renderer?.info?.render || {};
    const infoMem = renderer?.info?.memory || {};
    const programs = Array.isArray(renderer?.info?.programs) ? renderer.info.programs.length : 0;

    let totalNpcs = 0;
    let visibleNpcs = 0;
    if (npcSystem && Array.isArray(npcSystem.npcs)) {
      totalNpcs = npcSystem.npcs.length;
      for (let i = 0; i < totalNpcs; i++) {
        if (npcSystem.npcs[i]?.mesh?.visible) visibleNpcs++;
      }
    }

    let usedHeapMB = null;
    try {
      if (typeof performance !== 'undefined' && performance.memory && Number.isFinite(performance.memory.usedJSHeapSize)) {
        usedHeapMB = +(performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
      }
    } catch (_) {}

    return {
      fps: this.fps,
      avgMs: +this.avgMs.toFixed(2),
      p95Ms: +this.p95Ms.toFixed(2),
      tier: this.tierName,
      userCeiling: this.userCeiling,
      calls: infoRender.calls ?? 0,
      triangles: infoRender.triangles ?? 0,
      geometries: infoMem.geometries ?? 0,
      textures: infoMem.textures ?? 0,
      programs,
      totalNpcs,
      visibleNpcs,
      usedHeapMB,
      pixelRatio: +(renderer?.getPixelRatio?.() ?? this._currentAppliedDpr ?? 1).toFixed(2),
      shadowsEnabled: !!this.currentTier.shadows,
      npcLodStrideMultiplier: this.npcLodStrideMultiplier,
      streamMode: stadiumZone?.currentStreamMode || 'hq_detail'
    };
  }

  tickDebugHud(nowMs, npcSystem = null, stadiumZone = null) {
    if (!this._debugHudEnabled) return;
    if (nowMs - this._lastDebugHudUpdateMs < 500) return;
    this._lastDebugHudUpdateMs = nowMs;
    if (!this._debugHudEl) this._createDebugHud();
    if (!this._debugHudEl) return;

    const r = this.getPerfReport(this.renderer, npcSystem, stadiumZone);
    this._debugHudEl.dataset.perfJson = JSON.stringify(r);
    const heapStr = r.usedHeapMB !== null ? `${r.usedHeapMB}MB` : 'n/a';
    this._debugHudEl.textContent =
      `PERF [${r.tier}/${r.userCeiling}] ${r.fps} FPS (${r.avgMs}ms avg | p95 ${r.p95Ms}ms)\n` +
      `Draws: ${r.calls} | Tris: ${r.triangles} | DPR: ${r.pixelRatio} | Shdw: ${r.shadowsEnabled ? 'ON' : 'OFF'}\n` +
      `Mem: ${r.geometries} geo · ${r.textures} tex · ${r.programs} prog · Heap: ${heapStr}\n` +
      `NPCs: ${r.visibleNpcs}/${r.totalNpcs} (LOD×${r.npcLodStrideMultiplier}) | Zone: ${r.streamMode}`;
  }
}
