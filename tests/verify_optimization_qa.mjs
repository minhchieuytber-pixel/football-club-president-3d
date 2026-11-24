// tests/verify_optimization_qa.mjs
// Independent Optimization & Regression QA Suite (Phases 2–5)
// Covers:
//  1. AdaptivePerformanceManager (60-frame rolling metrics, hysteresis step-down/up, cooldown, ceiling, shadow pacing, getPerfReport)
//  2. Render & Asset Pooling (FurnitureFactory zero MeshPhysicalMaterial + sharedAsset pooling; CharacterFactory 20-humanoid pool, faceDetailGroup, <=2 castShadow)
//  3. 4-Tier NPC LOD & Spatial Hash (NpcSystem LOD 0/1/2/3, lodCounts, LOD-3 logical transit & restore, HQ exclusion, PathfindingSystem O(1) spatial hash & avoidance)
//  4. Motion & Camera (AnimationSystem all 29 states NaN-free, sit->hold_jersey reset, LOD 2 faceDetailGroup hide; ThirdPersonCamera snapTo, wall clamp, updateFixedTarget)
//  5. Memory & AssetCache (safeDisposeObject3D disposes owned assets & zeroes offscreen canvas while NEVER disposing sharedAsset buffers)
//  6. Background/Foreground dt Safety (GameTimeSystem.bindVisibilityGuards freeze/resume callbacks & zero background time jump)
//  7. Portrait CSS & TouchControls static hygiene (safe-area, #portrait-warning hidden, .macos-menubar scroll/exit, #ceremony-sheet.open touch guard)

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

// Expose real Three.js globally (matches src/core/threeSetup.js)
globalThis.THREE = THREE;
globalThis.performance = globalThis.performance || { now: () => Date.now() };

import { AdaptivePerformanceManager } from '../src/core/AdaptivePerformanceManager.js';
import { markSharedAsset, isSharedAsset, safeDisposeObject3D, getMemorySnapshot } from '../src/core/AssetCache.js';
import { FurnitureFactory } from '../src/scene/FurnitureFactory.js';
import { CharacterFactory } from '../src/characters/CharacterFactory.js';
import { AnimationSystem } from '../src/animations/AnimationSystem.js';
import { ThirdPersonCamera } from '../src/camera/ThirdPersonCamera.js';
import { PathfindingSystem } from '../src/ai/PathfindingSystem.js';
import { NpcSystem } from '../src/npc/NpcSystem.js';
import { GameTimeSystem } from '../src/time/GameTimeSystem.js';
import { createInitialNpcProfiles } from '../src/departments/DepartmentData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`❌ [FAIL] ${name}:`, err.message);
    process.exitCode = 1;
  }
}

// =========================================================================
// 1. ADAPTIVE PERFORMANCE MANAGER
// =========================================================================
test('OPT-1: AdaptivePerformanceManager rolling telemetry, shadow pacing, hysteresis step-down/up, cooldown & ceiling', () => {
  const mockRenderer = {
    _dpr: 1,
    shadowMap: { type: null, autoUpdate: true, enabled: true, needsUpdate: false },
    info: {
      render: { calls: 118, triangles: 44200 },
      memory: { geometries: 74, textures: 22 },
      programs: [{}, {}, {}]
    },
    setPixelRatio(r) { this._dpr = r; },
    getPixelRatio() { return this._dpr; }
  };
  const cam = new THREE.PerspectiveCamera(62, 390 / 844, 0.15, 450);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x8bb8e8, 130, 385);

  let shadowMapDisposed = 0;
  const mockSun = {
    castShadow: true,
    shadow: {
      mapSize: { width: 1024, height: 1024 },
      map: { dispose() { shadowMapDisposed++; } }
    }
  };

  const pm = new AdaptivePerformanceManager(mockRenderer, cam, scene, mockSun);
  pm.setUserQualityCeiling('High');

  assert.equal(pm.tierName, 'High');
  assert.equal(pm.npcLodStrideMultiplier, 1.0);
  assert.equal(mockRenderer.shadowMap.autoUpdate, false, 'shadowMap.autoUpdate must be disabled for manual pacing');
  assert.equal(mockRenderer.shadowMap.type, THREE.PCFShadowMap, 'shadowMap.type must be PCFShadowMap');
  assert.equal(cam.far, 320);

  // Shadow pacing on High (shadowInterval = 2): frame 1 forced, frame 2 mod 0, frame 3 skipped, frame 4 mod 0
  assert.equal(pm.prepareShadowMap(), true, 'First shadow frame should force update');
  assert.equal(pm.prepareShadowMap(), true, 'Frame 2 (interval 2) should update shadow map');
  assert.equal(pm.prepareShadowMap(), false, 'Frame 3 (interval 2) should skip shadow map');
  assert.equal(mockRenderer.shadowMap.needsUpdate, false);
  assert.equal(pm.prepareShadowMap(), true, 'Frame 4 (interval 2) should update shadow map');
  assert.equal(mockRenderer.shadowMap.needsUpdate, true);

  // Spike guard: frames > 250ms must be ignored
  pm.recordFrame(5000);
  assert.equal(pm._sampleCount, 0, 'Huge tab-switch delta > 250ms must be ignored');

  // Fill 20 samples at 30ms (0.6s), then drain 2.0s boot cooldown (67 frames), then hold >22ms for 2.5s (85 frames)
  for (let i = 0; i < 87; i++) pm.recordFrame(30);
  assert.equal(pm.tierName, 'High', 'Should not step down before boot cooldown + 2.5s hold completes');
  for (let i = 0; i < 85; i++) pm.recordFrame(30);
  assert.equal(pm.tierName, 'Medium', 'Sustained >22ms for 2.5s must step down High -> Medium');
  assert.equal(pm.npcLodStrideMultiplier, 1.5);
  assert.equal(mockSun.shadow.mapSize.width, 512, 'Medium tier must downscale shadow map to 512');
  assert.equal(shadowMapDisposed, 1, 'Old 1024 shadow map must be disposed on resize');
  assert.ok(pm.avgMs >= 29.5 && pm.avgMs <= 30.5, `Expected avgMs ~30, got ${pm.avgMs}`);
  assert.ok(pm.fps >= 32 && pm.fps <= 35, `Expected fps ~33, got ${pm.fps}`);

  // Cooldown check: immediate 1.5s of slow frames (< 4s cooldown) must NOT trigger second downgrade
  for (let i = 0; i < 50; i++) pm.recordFrame(30);
  assert.equal(pm.tierName, 'Medium', '4s cooldown must prevent rapid oscillation/double step-down');

  // Hysteresis step-up: sustained <14ms (10ms frames) across rolling window + remaining cooldown + 6.0s hold -> back to High
  for (let i = 0; i < 1100; i++) pm.recordFrame(10);
  assert.equal(pm.tierName, 'High', 'Sustained <14ms for 6.0s must step back up Medium -> High');
  assert.ok(pm.avgMs <= 10.5 && pm.fps >= 95);

  // User quality ceiling enforcement: Low ceiling must never upgrade above Low
  pm.setUserQualityCeiling('Low');
  assert.equal(pm.tierName, 'Low');
  assert.equal(mockRenderer.shadowMap.enabled, false);
  assert.equal(pm.npcLodStrideMultiplier, 2.0);
  for (let i = 0; i < 1000; i++) pm.recordFrame(8);
  assert.equal(pm.tierName, 'Low', 'Adaptive scaler must NEVER exceed user quality ceiling');

  // Modal power-save pacing (~20 FPS = 50ms interval)
  assert.equal(pm.shouldRenderFrame(1000, false), true);
  assert.equal(pm.shouldRenderFrame(1000, true), true);
  assert.equal(pm.shouldRenderFrame(1020, true), false, 'Modal power-save should throttle intermediate frames');
  assert.equal(pm.shouldRenderFrame(1055, true), true, 'Modal power-save should allow frame after >=50ms');

  // getPerfReport schema & real values
  const mockNpcSys = { npcs: [{ mesh: { visible: true } }, { mesh: { visible: true } }, { mesh: { visible: false } }] };
  const report = pm.getPerfReport(mockRenderer, mockNpcSys, { currentStreamMode: 'hq_detail' });
  assert.equal(report.calls, 118);
  assert.equal(report.triangles, 44200);
  assert.equal(report.geometries, 74);
  assert.equal(report.textures, 22);
  assert.equal(report.programs, 3);
  assert.equal(report.totalNpcs, 3);
  assert.equal(report.visibleNpcs, 2);
  assert.equal(report.tier, 'Low');
  assert.equal(report.userCeiling, 'Low');
  assert.equal(report.streamMode, 'hq_detail');
  assert.ok(Number.isFinite(report.p95Ms) && report.p95Ms > 0);
});

// =========================================================================
// 2. RENDER & ASSET POOLING (FurnitureFactory & CharacterFactory)
// =========================================================================
test('OPT-2A: FurnitureFactory uses ZERO MeshPhysicalMaterial, pools geometries/materials with sharedAsset & reduces chair draw calls', () => {
  const mockTexFactory = {
    _cache: new Map(),
    _get(k) {
      if (!this._cache.has(k)) {
        const t = new THREE.Texture();
        t.userData = { sharedAsset: true };
        this._cache.set(k, t);
      }
      return this._cache.get(k);
    },
    woodTexture(a, b) { return this._get(`wood_${a}_${b}`); },
    screenTexture(title) { return this._get(`scr_${title}`); },
    tacticalBoardTexture() { return this._get('tact'); },
    framedJerseyTexture(n) { return this._get(`jer_${n}`); },
    signTexture(t) { return this._get(`sign_${t}`); }
  };

  const ff = new FurnitureFactory(mockTexFactory);

  // Verify no MeshPhysicalMaterial in factory palette
  for (const [key, mat] of Object.entries(ff.mats)) {
    assert.equal(mat instanceof THREE.MeshPhysicalMaterial, false, `ff.mats.${key} must NOT be MeshPhysicalMaterial`);
    assert.equal(mat.userData?.sharedAsset, true, `ff.mats.${key} must be tagged userData.sharedAsset = true`);
  }

  const chairs = Array.from({ length: 5 }, () => ff.createSwivelChair());
  const desks = Array.from({ length: 4 }, () => ff.createStaffDesk('PSG STAFF OS'));
  const execDesks = Array.from({ length: 2 }, () => ff.createExecutiveDesk({ isPresident: true }));
  const glassWalls = Array.from({ length: 3 }, () => ff.createGlassWindowWall(6, 4.4, true));
  const cabinets = Array.from({ length: 3 }, () => ff.createFilingCabinet());

  // Chair draw call budget check (slashed from 17 meshes -> <= 5 merged meshes)
  let chairMeshCount = 0;
  chairs[0].traverse((o) => { if (o.isMesh) chairMeshCount++; });
  assert.ok(chairMeshCount > 0 && chairMeshCount <= 5, `Swivel chair should have <=5 meshes, got ${chairMeshCount}`);

  // Verify chairs share identical geometry references across instances
  const c0Geos = [];
  const c1Geos = [];
  chairs[0].traverse((o) => { if (o.isMesh) c0Geos.push(o.geometry); });
  chairs[1].traverse((o) => { if (o.isMesh) c1Geos.push(o.geometry); });
  assert.deepEqual(c0Geos, c1Geos, 'Repeated swivel chairs must share cached prototype BufferGeometries');

  // Verify every mesh across all built furniture has sharedAsset geometry & material and zero MeshPhysicalMaterial
  const allItems = [...chairs, ...desks, ...execDesks, ...glassWalls, ...cabinets];
  const uniqueCabMats = new Set();
  for (const item of allItems) {
    item.traverse((o) => {
      if (!o.isMesh) return;
      assert.equal(o.geometry?.userData?.sharedAsset, true, 'Furniture geometry must have userData.sharedAsset === true');
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        assert.equal(m instanceof THREE.MeshPhysicalMaterial, false, 'No furniture mesh may use MeshPhysicalMaterial');
        assert.equal(m?.userData?.sharedAsset, true, 'Furniture material must have userData.sharedAsset === true');
      }
    });
  }
  cabinets.forEach((cab) => cab.traverse((o) => { if (o.isMesh) uniqueCabMats.add(o.material); }));
  assert.ok(uniqueCabMats.size <= 6, `3 filing cabinets should reuse <=6 materials (eliminating 231 binder mats), got ${uniqueCabMats.size}`);
});

test('OPT-2B: CharacterFactory pools geometries/materials across 20 humanoids, exposes faceDetailGroup & limits castShadow <= 2', () => {
  const cf = new CharacterFactory();
  const outfits = ['suit_president', 'suit_navy', 'suit_charcoal', 'coach_psg', 'player_home', 'player_away', 'medical', 'media', 'security'];
  const uniqueGeos = new Set();
  const uniqueMats = new Set();

  for (let i = 0; i < 20; i++) {
    const h = cf.createHumanoid({
      outfit: outfits[i % outfits.length],
      skinTone: cf.skinTones[i % cf.skinTones.length],
      hairColor: cf.hairColors[i % cf.hairColors.length],
      hairStyle: i % 3
    });

    const rig = h.userData?.rig;
    assert.ok(rig, 'Humanoid must expose userData.rig');
    assert.ok(rig.faceDetailGroup, 'Humanoid rig must expose faceDetailGroup for LOD 2 culling');
    assert.ok(rig.faceDetailGroup.children.length >= 5, 'faceDetailGroup should contain eyes, brows, and nose');

    let shadowCasters = 0;
    h.traverse((o) => {
      if (!o.isMesh) return;
      if (o.castShadow) shadowCasters++;
      uniqueGeos.add(o.geometry);
      uniqueMats.add(o.material);
      assert.equal(o.geometry?.userData?.sharedAsset, true, 'Character geometry must be tagged userData.sharedAsset = true');
      assert.equal(o.material?.userData?.sharedAsset, true, 'Character material must be tagged userData.sharedAsset = true');
    });
    assert.ok(shadowCasters <= 2, `Humanoid #${i} must castShadow on <=2 core meshes, got ${shadowCasters}`);
  }

  assert.ok(uniqueGeos.size <= 19, `20 humanoids must share <=19 pooled geometries, got ${uniqueGeos.size}`);
  assert.ok(uniqueMats.size <= 35, `20 humanoids must pool palette materials, got ${uniqueMats.size}`);
});

// =========================================================================
// 3. 4-TIER NPC LOD & SPATIAL HASH
// =========================================================================
test('OPT-3: NpcSystem 4-tier LOD, lodCounts, LOD-3 logical transit/restore, HQ exclusion & PathfindingSystem spatial hash', () => {
  const doorCol = { minX: -26.15, maxX: -25.85, minZ: -44.7, maxZ: -42.3, active: true };
  const campus = {
    root: new THREE.Group(),
    colliders: [
      { minX: -27.7, maxX: -24.3, minZ: -17.5, maxZ: -16.1, active: true },
      doorCol
    ],
    doors: [
      { id: 'door_dressing_main', x: -26.0, z: -43.5, open: false, locked: false, targetAngle: 0, collider: doorCol, pivot: new THREE.Group() }
    ],
    boardroomSeats: [],
    hasChairAt: () => true,
    getChairElevationAt: () => 0.14,
    resolveCollision: (x, z) => ({ x, z })
  };

  // PathfindingSystem O(1) collider spatial hash + live door lock check
  const pf = new PathfindingSystem(campus);
  assert.equal(pf.isPointBlocked(-26.0, -16.8, 0.3, true), true, 'Spatial hash must detect desk collider');
  assert.equal(pf.isPointBlocked(-20.0, -16.8, 0.3, true), false, 'Spatial hash must allow free point');
  assert.equal(pf.isNodeBlocked('dr_door'), false);
  campus.doors[0].locked = true;
  assert.equal(pf.isNodeBlocked('dr_door'), true, 'Live door.locked mutation must be reflected immediately');
  campus.doors[0].locked = false;

  // PathfindingSystem computeAvoidanceVelocity backward-compatibility (fresh object when out omitted) + spatial grid mode
  const npcA = { id: 'a', mesh: { position: new THREE.Vector3(0, 0.14, 0), visible: true }, _velX: 2.0, _velZ: 0 };
  const npcB = { id: 'b', mesh: { position: new THREE.Vector3(1.1, 0.14, 0), visible: true }, _velX: -2.0, _velZ: 0 };
  const av1 = pf.computeAvoidanceVelocity(npcA, 1, 0, 2.0, [npcA, npcB], null);
  const av2 = pf.computeAvoidanceVelocity(npcB, -1, 0, 2.0, [npcA, npcB], null);
  assert.notEqual(av1, av2, 'Calling computeAvoidanceVelocity without options.out must return fresh objects');
  assert.ok(av1.vz * av2.vz < 0, 'Head-on NPCs must steer to opposite sides');

  pf.rebuildNpcSpatialGrid([npcA, npcB]);
  const scratchOut = { vx: 0, vz: 0, waiting: false };
  const avGrid = pf.computeAvoidanceVelocity(npcA, 1, 0, 2.0, [npcA, npcB], null, { out: scratchOut, useSpatialGrid: true });
  assert.equal(avGrid, scratchOut, 'Calling with options.out must reuse scratch object');
  assert.ok(Math.abs(avGrid.vz - av1.vz) < 1e-4, 'Spatial-hash avoidance must match full scan result');

  // NpcSystem 4-tier LOD assignment & lodCounts invariant
  const cf = new CharacterFactory();
  const anim = new AnimationSystem();
  const npcSys = new NpcSystem(campus.root, cf, anim, campus);
  npcSys.spawnFromProfiles(createInitialNpcProfiles(), 13.5);

  // Place 5 regular office NPCs at deterministic distances from focusPos (0, 0)
  const focusPos = new THREE.Vector3(0, 0.14, 0);
  const officeNpcs = npcSys.npcs.filter((n) => !n.isPlayer && n.id !== 'npc_coach' && !n.isCoachingStaff);
  assert.ok(officeNpcs.length >= 5, 'Need at least 5 regular office NPCs for LOD tier placement');

  const [n0, n1, n2, n3Far, n3Culled] = officeNpcs;
  n0.mesh.position.set(5, 0.14, 0);       n0.mesh.visible = true;  n0._lod = 0; // LOD 0 (<18m)
  n1.mesh.position.set(28, 0.14, 0);      n1.mesh.visible = true;  n1._lod = 0; // LOD 1 (18..42m)
  n2.mesh.position.set(60, 0.14, 0);      n2.mesh.visible = true;  n2._lod = 0; // LOD 2 (42..85m)
  n3Far.mesh.position.set(110, 0.14, 0);  n3Far.mesh.visible = true; n3Far._lod = 0; // LOD 3 (>=85m)
  n3Culled.mesh.position.set(6, 0.14, 0); n3Culled.mesh.visible = false; n3Culled._lod = 0; // LOD 3 (culled)

  npcSys.update(0.016, focusPos, 13.5, null, 'Luis Enrique', {
    focusPos,
    lodStrideMultiplier: 1.5,
    stadiumTrainingVisible: false
  });

  assert.equal(n0._lod, 0, 'NPC at 5m visible must be LOD 0');
  assert.equal(n1._lod, 1, 'NPC at 28m visible must be LOD 1');
  assert.equal(n2._lod, 2, 'NPC at 60m visible must be LOD 2');
  assert.equal(n3Far._lod, 3, 'NPC at 110m must be LOD 3');
  assert.equal(n3Culled._lod, 3, 'Invisible culled NPC must be LOD 3');
  assert.equal(n3Culled.mesh.visible, false, 'NpcSystem must NEVER overwrite mesh.visible');

  const sumLods = npcSys.lodCounts[0] + npcSys.lodCounts[1] + npcSys.lodCounts[2] + npcSys.lodCounts[3];
  assert.equal(sumLods, npcSys.npcs.length, 'lodCounts sum must equal total NPCs');

  // LOD-3 logical transit completion & seamless restoration on approach
  n3Far.mode = 'returning';
  n3Far.home = { x: 118, z: 0 };
  n3Far.finalDest = { x: 118, z: 0 };
  n3Far._lod3InTransit = true;
  n3Far._lod3TransitRemaining = 1.0;
  n3Far._lod3Dirty = true;

  // Tick enough simulated time (2 x 0.7s = 1.4s) for LOD-3 logical transit to arrive
  npcSys.update(0.7, focusPos, 13.5, null, 'Luis Enrique', { focusPos, lodStrideMultiplier: 1.0 });
  npcSys.update(0.7, focusPos, 13.5, null, 'Luis Enrique', { focusPos, lodStrideMultiplier: 1.0 });
  assert.equal(n3Far._lod3InTransit, false, 'LOD-3 NPC must finish logical transit');
  assert.ok(Math.hypot(n3Far.mesh.position.x - 118, n3Far.mesh.position.z) < 0.5, 'LOD-3 NPC must arrive at logical destination');

  // Approach n3Far so it transitions LOD 3 -> LOD 0 cleanly
  const nearN3 = new THREE.Vector3(115, 0.14, 0);
  npcSys.update(0.016, nearN3, 13.5, null, 'Luis Enrique', { focusPos: nearN3, lodStrideMultiplier: 1.0 });
  assert.equal(n3Far._lod, 0, 'Approached NPC must transition LOD 3 -> LOD 0');

  // Unauthorized player HQ exclusion in LOD 3 arrival & restoration
  const pl = npcSys.npcs.find((n) => n.isPlayer);
  assert.ok(pl, 'Player NPC must exist');
  pl.mode = 'rest';
  pl.mesh.position.set(0, 0.14, -150);
  pl.mesh.visible = false;
  pl._lod = 3;
  pl.finalDest = { x: 0, z: 6 }; // Unauthorized HQ interior point!
  pl._lod3InTransit = true;
  pl._lod3TransitRemaining = 0.05;
  pl._lod3Dirty = true;
  npcSys.update(0.7, focusPos, 13.5, null, 'Luis Enrique', { focusPos, lodStrideMultiplier: 1.0 });
  assert.equal(
    PathfindingSystem.isHqInteriorPoint(pl.mesh.position.x, pl.mesh.position.z),
    false,
    'Unauthorized player NPC MUST NEVER arrive inside HQ interior via LOD-3 transit'
  );
});

// =========================================================================
// 4. MOTION, ANIMATION & CAMERA
// =========================================================================
test('OPT-4A: AnimationSystem handles all 29 states NaN-free, resets joints on sit->hold_jersey & hides faceDetailGroup at LOD 2', () => {
  const cf = new CharacterFactory();
  const anim = new AnimationSystem();
  const humanoid = cf.createHumanoid({ outfit: 'player_home' });
  const rig = humanoid.userData.rig;

  const allStates = [
    'idle', 'stand', 'walk', 'run', 'train', 'turn',
    'sit', 'work_pc', 'talk', 'gesture', 'instruct', 'observe', 'supervise',
    'clipboard', 'tablet', 'notes', 'celebrate',
    'kick', 'pass', 'dive_gk', 'stretch', 'tackle', 'throw_in',
    'sign_contract', 'handshake', 'hold_jersey', 'take_photo', 'film_camera', 'raise_hand'
  ];

  for (const st of allStates) {
    for (let k = 0; k < 5; k++) {
      anim.updateRig(humanoid, st, 0.016, 1.0, 0);
    }
    assert.equal(rig.state, st, `rig.state must update synchronously to '${st}'`);
    const nums = [
      rig.pelvis.position.y, rig.pelvis.rotation.y, rig.pelvis.rotation.z,
      rig.torso.rotation.x, rig.torso.rotation.y,
      rig.headGroup.rotation.x, rig.headGroup.rotation.y,
      rig.leftLeg.hip.rotation.x, rig.rightLeg.hip.rotation.x,
      rig.leftLeg.knee.rotation.x, rig.rightLeg.knee.rotation.x,
      rig.leftArm.shoulder.rotation.x, rig.rightArm.shoulder.rotation.x,
      rig.leftArm.shoulder.rotation.z, rig.rightArm.shoulder.rotation.z,
      rig.leftArm.elbow.rotation.x, rig.rightArm.elbow.rotation.x
    ];
    for (const v of nums) {
      assert.ok(Number.isFinite(v), `Non-finite joint value detected in state '${st}': ${v}`);
    }
  }

  // Sit -> hold_jersey joint reset (no stale bent knees!)
  for (let i = 0; i < 40; i++) anim.updateRig(humanoid, 'sit', 0.05, 1.0, 0);
  assert.ok(rig.leftLeg.knee.rotation.x > 0.8 && rig.leftLeg.hip.rotation.x < -0.8, 'Sit state must bend hips & knees');

  for (let i = 0; i < 40; i++) anim.updateRig(humanoid, 'hold_jersey', 0.05, 1.0, 0);
  assert.ok(Math.abs(rig.leftLeg.knee.rotation.x) < 0.05, `Left knee must reset after sit->hold_jersey, got ${rig.leftLeg.knee.rotation.x}`);
  assert.ok(Math.abs(rig.rightLeg.knee.rotation.x) < 0.05, `Right knee must reset after sit->hold_jersey, got ${rig.rightLeg.knee.rotation.x}`);
  assert.ok(Math.abs(rig.leftLeg.hip.rotation.x) < 0.05, `Left hip must reset after sit->hold_jersey, got ${rig.leftLeg.hip.rotation.x}`);

  // LOD 2 faceDetailGroup visibility toggle
  anim.updateRig(humanoid, 'walk', 0.016, 1.0, 2);
  assert.equal(rig.faceDetailGroup.visible, false, 'faceDetailGroup must hide at LOD 2');
  anim.updateRig(humanoid, 'walk', 0.016, 1.0, 0);
  assert.equal(rig.faceDetailGroup.visible, true, 'faceDetailGroup must show at LOD 0');
});

test('OPT-4B: ThirdPersonCamera supports snapTo, setCollisionResolver & smooth/cut updateFixedTarget', () => {
  const cam = new THREE.PerspectiveCamera(62, 390 / 844, 0.15, 320);
  const tp = new ThirdPersonCamera(cam);

  // snapTo teleports camera immediately without wall fly-through
  tp.snapTo(new THREE.Vector3(-26, 0.14, -12.5), 0.75, -0.08);
  assert.ok(Math.abs(cam.position.x - (-26)) < 1e-4);
  assert.ok(Math.abs(cam.position.y - (0.14 + 1.72)) < 1e-4);
  assert.ok(Math.abs(cam.position.z - (-12.5)) < 1e-4);
  assert.ok(Math.abs(tp.yaw - 0.75) < 1e-4);

  // Wall collision avoidance via setCollisionResolver
  tp.setCollisionResolver((x, z) => ({ x: Math.min(x, 10), z }));
  tp.snapTo(new THREE.Vector3(10, 0.14, 0));
  for (let i = 0; i < 15; i++) tp.update(new THREE.Vector3(14, 0.14, 0), 0.016);
  assert.ok(cam.position.x <= 10.001, `Camera must respect wall collision resolver, got x=${cam.position.x}`);

  // updateFixedTarget: far CCTV (>45m) cuts immediately, nearby angle damps smoothly
  const cctv1Pos = { x: 46, y: 24, z: -88 };
  const cctv1Look = { x: 0, y: 8, z: -152 };
  tp.updateFixedTarget(cctv1Pos, cctv1Look, 0.016);
  assert.ok(Math.hypot(cam.position.x - 46, cam.position.y - 24, cam.position.z - (-88)) < 0.01,
    'Switching >45m to Stadium CCTV must clean-cut immediately without flying through walls');

  const cctv2Pos = { x: 36, y: 24, z: -92 };
  const cctv2Look = { x: 0, y: 4, z: -154 };
  tp.updateFixedTarget(cctv2Pos, cctv2Look, 0.016);
  assert.ok(cam.position.x < 46 && cam.position.x > 36, 'Switching nearby CCTV angle must damp smoothly');

  // Exiting CCTV from far away snaps cleanly back to player eye instead of flying through walls
  tp.update(new THREE.Vector3(-26, 0.14, -12.5), 0.016);
  assert.ok(Math.hypot(cam.position.x - (-26), cam.position.z - (-12.5)) < 1.0,
    'Exiting distant CCTV must snap back to player cleanly');
});

// =========================================================================
// 5. MEMORY & ASSETCACHE SAFE DISPOSAL
// =========================================================================
test('OPT-5: AssetCache.safeDisposeObject3D disposes owned assets & zeroes offscreen canvas while protecting sharedAsset buffers', () => {
  let sharedGeoDisposed = 0;
  let sharedMatDisposed = 0;
  let sharedTexDisposed = 0;
  let ownedGeoDisposed = 0;
  let ownedMatDisposed = 0;
  let ownedTexDisposed = 0;

  const sharedCanvas = { width: 128, height: 128, getContext() { return {}; } };
  const sharedTex = markSharedAsset({ image: sharedCanvas, dispose() { sharedTexDisposed++; } });
  const sharedGeo = markSharedAsset(new THREE.BoxGeometry(1, 1, 1));
  sharedGeo.dispose = () => { sharedGeoDisposed++; };
  const sharedMat = markSharedAsset(new THREE.MeshStandardMaterial());
  sharedMat.map = sharedTex;
  sharedMat.dispose = () => { sharedMatDisposed++; };

  const ownedCanvas = { width: 256, height: 128, getContext() { return {}; } };
  const ownedTex = { image: ownedCanvas, dispose() { ownedTexDisposed++; } };
  const ownedGeo = new THREE.BoxGeometry(1, 1, 1);
  ownedGeo.dispose = () => { ownedGeoDisposed++; };
  const ownedMat = new THREE.MeshStandardMaterial();
  ownedMat.map = ownedTex;
  ownedMat.dispose = () => { ownedMatDisposed++; };

  assert.equal(isSharedAsset(sharedGeo), true);
  assert.equal(isSharedAsset(ownedGeo), false);

  const root = new THREE.Group();
  root.add(new THREE.Mesh(sharedGeo, sharedMat));
  root.add(new THREE.Mesh(ownedGeo, ownedMat));

  const res = safeDisposeObject3D(root);
  assert.equal(res.geometries, 1);
  assert.equal(res.materials, 1);
  assert.equal(res.textures, 1);

  assert.equal(ownedGeoDisposed, 1, 'Owned geometry must be disposed');
  assert.equal(ownedMatDisposed, 1, 'Owned material must be disposed');
  assert.equal(ownedTexDisposed, 1, 'Owned texture must be disposed');
  assert.equal(ownedCanvas.width, 0, 'Owned offscreen canvas width must be zeroed for iOS WebKit RAM release');
  assert.equal(ownedCanvas.height, 0, 'Owned offscreen canvas height must be zeroed for iOS WebKit RAM release');

  assert.equal(sharedGeoDisposed, 0, 'Shared geometry MUST NEVER be disposed');
  assert.equal(sharedMatDisposed, 0, 'Shared material MUST NEVER be disposed');
  assert.equal(sharedTexDisposed, 0, 'Shared texture MUST NEVER be disposed');
  assert.equal(sharedCanvas.width, 128, 'Shared canvas must remain untouched');

  const snap = getMemorySnapshot({
    info: { memory: { geometries: 42, textures: 15 }, render: { calls: 99, triangles: 32000 }, programs: [1, 2] }
  });
  assert.equal(snap.geometries, 42);
  assert.equal(snap.textures, 15);
  assert.equal(snap.programs, 2);
  assert.equal(snap.calls, 99);
  assert.equal(snap.triangles, 32000);
  assert.ok(snap.timestamp > 0);
});

// =========================================================================
// 6. BACKGROUND / FOREGROUND DT SAFETY (GameTimeSystem)
// =========================================================================
test('OPT-6: GameTimeSystem.bindVisibilityGuards freezes elapsed time while hidden & invokes both freeze and resume callbacks', () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;

  const docListeners = new Map();
  const winListeners = new Map();
  const addL = (map) => (evt, fn) => {
    if (!map.has(evt)) map.set(evt, []);
    map.get(evt).push(fn);
  };
  const emitL = (map, evt) => { (map.get(evt) || []).forEach((fn) => fn()); };

  try {
    globalThis.document = { hidden: false, addEventListener: addL(docListeners) };
    globalThis.window = { addEventListener: addL(winListeners) };

    const ts = new GameTimeSystem('2026-08-03T09:15:00Z');
    let freezes = 0;
    let resumes = 0;
    ts.bindVisibilityGuards(() => freezes++, () => resumes++);

    const startEpoch = ts.epochSeconds;

    // Tab goes to background
    globalThis.document.hidden = true;
    emitL(docListeners, 'visibilitychange');
    assert.equal(freezes, 1);
    assert.equal(ts.hiddenPaused, true);
    assert.equal(ts.isPaused(), true);

    // 5 minutes pass in background -> 0 game seconds advance!
    assert.equal(ts.tick(300), 0);
    assert.equal(ts.epochSeconds, startEpoch, 'Background tab must advance 0 game seconds');

    // Tab returns to foreground
    globalThis.document.hidden = false;
    emitL(docListeners, 'visibilitychange');
    assert.equal(resumes, 1, 'onResumeCallback must fire when returning to foreground');
    assert.equal(ts.hiddenPaused, false);
    assert.equal(ts.isPaused(), false);

    // Next active second advances at exact 96x scale (15 real min = 1 game day)
    ts.tick(1);
    assert.equal(ts.epochSeconds - startEpoch, 96);

    // iOS Safari pagehide / pageshow lifecycle
    emitL(winListeners, 'pagehide');
    assert.equal(freezes, 2);
    assert.equal(ts.hiddenPaused, true);
    emitL(winListeners, 'pageshow');
    assert.equal(resumes, 2);
    assert.equal(ts.hiddenPaused, false);
  } finally {
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
    if (prevWin === undefined) delete globalThis.window; else globalThis.window = prevWin;
  }
});

// =========================================================================
// 7. PORTRAIT CSS & TOUCHCONTROLS HYGIENE
// =========================================================================
test('OPT-7: index.html Portrait Mode safe-area/menubar/toast rules & TouchControls ceremony-sheet guard', () => {
  const html = fs.readFileSync(path.join(PROJECT_ROOT, 'index.html'), 'utf8');
  assert.ok(/#portrait-warning\s*\{[^}]*display:\s*none\s*!important/i.test(html), '#portrait-warning must remain hidden');
  assert.ok(html.includes('env(safe-area-inset-top)'), 'Must preserve env(safe-area-inset-top)');
  assert.ok(html.includes('env(safe-area-inset-bottom)'), 'Must preserve env(safe-area-inset-bottom)');
  assert.ok(/\.macos-menubar\s*\{[^}]*overflow-x:\s*auto/i.test(html), '.macos-menubar must scroll cleanly on narrow Portrait screens');
  assert.ok(/\.mac-exit-btn\s*\{[^}]*flex-shrink:\s*0/i.test(html), '.mac-exit-btn must not shrink/clip off-screen');
  assert.ok(/@media\s*\(orientation:\s*portrait\),\s*\(max-width:\s*520px\)/i.test(html), 'Portrait cascade polish media query must exist');
  assert.ok(html.includes('top: max(98px'), 'Toast must sit cleanly below wrapped Portrait top-bar');

  const touchSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'controls', 'TouchControls.js'), 'utf8');
  assert.ok(touchSrc.includes("target.closest('#ceremony-sheet.open')"), 'TouchControls must exclude #ceremony-sheet.open from camera drag');
  assert.ok(touchSrc.includes('AbortController') && touchSrc.includes('destroy()'), 'TouchControls must support AbortController listener cleanup');
});

console.log(`\n🎉 HOÀN TẤT INDEPENDENT OPTIMIZATION QA: ${passed}/${passed + failed} BỘ KIỂM THỬ ĐẠT!`);
