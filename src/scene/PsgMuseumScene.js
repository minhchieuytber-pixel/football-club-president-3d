// src/scene/PsgMuseumScene.js
// Công trình 3D độc lập: PARIS SAINT-GERMAIN CLUB MUSEUM (Phòng Truyền Thống & Bảo Tàng Danh Hiệu PSG)
// Vị trí trong khuôn viên tổng thể: (cx = 34, cz = -44), x ∈ [18, 50], z ∈ [-57, -31], đối xứng Phòng Thay Đồ qua Đại lộ Công Viên Trung Tâm.
// Kiến trúc Modern Luxury: Mặt tiền kính cường lực + đá tự nhiên, logo PSG tại cổng vòm, sảnh trần cao, cửa kính tự động, 5 khu trưng bày bên trong.
// Tối ưu hiệu năng WebGL/iPhone: tách shellGroup / interiorGroup để Zone Culling, không dùng PointLight runtime trong nội thất,
// chia sẻ geometry/material (sharedAsset = true), dirty-check đồng bộ cúp 3D & safeDisposeObject3D khi làm mới.
import { PSG_HISTORY_TIMELINE, PSG_LEGENDS } from '../trophies/TrophyDatabase.js';
import { TrophyModelFactory } from '../trophies/TrophyModelFactory.js';
import { safeDisposeObject3D } from '../core/AssetCache.js';

function markShared(asset) {
  if (!asset) return asset;
  if (!asset.userData) asset.userData = {};
  asset.userData.sharedAsset = true;
  return asset;
}

function freezeStaticTree(root) {
  if (!root || typeof root.traverse !== 'function') return;
  root.traverse((obj) => {
    if (obj.userData && obj.userData.dynamicObject) return;
    if (typeof obj.updateMatrix === 'function') obj.updateMatrix();
    obj.matrixAutoUpdate = false;
  });
}

function makeCanvasPanelTex(drawFn, w = 512, h = 256) {
  if (typeof document === 'undefined' || typeof THREE.CanvasTexture !== 'function') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) drawFn(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.generateMipmaps = false;
  if (typeof THREE.LinearFilter !== 'undefined') tex.minFilter = THREE.LinearFilter;
  return tex;
}

export class PsgMuseumScene {
  constructor(campusScene, texFactory, furnFactory, trophySystem = null) {
    this.campus = campusScene;
    this.tex = texFactory;
    this.furn = furnFactory;
    this.trophySystem = trophySystem;
    this.trophyFactory = new TrophyModelFactory(texFactory);

    // Tọa độ trung tâm công trình Bảo tàng (32m x 26m, tách biệt hoàn toàn với HQ & Parc des Princes)
    this.cx = 34;
    this.cz = -44;
    this.width = 32;
    this.depth = 26;

    this.group = new THREE.Group();
    this.shellGroup = new THREE.Group();
    this.interiorGroup = new THREE.Group();
    this.dynamicTrophiesGroup = new THREE.Group();
    this.dynamicSeasonsGroup = new THREE.Group();
    this.interiorGroup.add(this.dynamicTrophiesGroup, this.dynamicSeasonsGroup);
    this.group.add(this.shellGroup, this.interiorGroup);

    this.group.userData.shellGroup = this.shellGroup;
    this.group.userData.interiorGroup = this.interiorGroup;

    this._lastSyncedVersion = -1;
    this._dynamicInteractIds = [];
    this._dynamicColliders = [];
    this._geos = new Map();
    this._mats = null;

    this.campus.root.add(this.group);
    this.buildShellAndWalkways();
    this.buildStaticInterior();
    this.syncWithTrophySystem(this.trophySystem);

    if (this.trophySystem && typeof this.trophySystem.onChange === 'function') {
      this._unsubscribeTrophy = this.trophySystem.onChange((ts) => {
        this.syncWithTrophySystem(ts);
      });
    }
  }

  _initMats() {
    if (this._mats) return this._mats;
    const StdMat = THREE.MeshStandardMaterial;
    const BasicMat = THREE.MeshBasicMaterial || StdMat;
    this._mats = {
      stoneWall: markShared(new StdMat({ color: 0xd8d1c5, roughness: 0.58, metalness: 0.04 })),
      darkStone: markShared(new StdMat({ color: 0x1e2533, roughness: 0.42, metalness: 0.18 })),
      marbleFloor: markShared(new StdMat({
        color: 0x1b2333,
        map: this.tex?.marbleTexture?.('#1e293b', '#334155') || null,
        roughness: 0.24,
        metalness: 0.12
      })),
      walkwayStone: markShared(new StdMat({ color: 0x64748b, roughness: 0.64 })),
      bronzeTrim: markShared(new StdMat({ color: 0xd4af37, roughness: 0.24, metalness: 0.82 })),
      psgNavy: markShared(new StdMat({ color: 0x00205b, roughness: 0.36, metalness: 0.28 })),
      psgRed: markShared(new StdMat({ color: 0xda291c, roughness: 0.45, metalness: 0.12 })),
      glassFacade: markShared(new StdMat({ color: 0xcbe3ff, transparent: true, opacity: 0.24, roughness: 0.10, metalness: 0.20, depthWrite: false })),
      skylightGlass: markShared(new StdMat({ color: 0xe0f2fe, transparent: true, opacity: 0.28, roughness: 0.08, depthWrite: false })),
      warmStrip: markShared(new BasicMat({ color: 0xfef3c7 })),
      crestMat: markShared(new BasicMat({ map: this.tex?.psgCrestTexture?.() || null, transparent: true })),
      previewSlot: markShared(new StdMat({ color: 0x263248, roughness: 0.38, metalness: 0.25 })),
      screenFrame: markShared(new StdMat({ color: 0x0f172a, roughness: 0.32, metalness: 0.45 }))
    };
    return this._mats;
  }

  _boxGeo(w, h, d) {
    const k = `b_${w}_${h}_${d}`;
    if (!this._geos.has(k)) this._geos.set(k, markShared(new THREE.BoxGeometry(w, h, d)));
    return this._geos.get(k);
  }

  _planeGeo(w, h) {
    const k = `p_${w}_${h}`;
    if (!this._geos.has(k)) this._geos.set(k, markShared(new THREE.PlaneGeometry(w, h)));
    return this._geos.get(k);
  }

  _cylGeo(rt, rb, h, seg = 16) {
    const k = `c_${rt}_${rb}_${h}_${seg}`;
    if (!this._geos.has(k)) this._geos.set(k, markShared(new THREE.CylinderGeometry(rt, rb, h, seg)));
    return this._geos.get(k);
  }

  _signMat(text, bg = '#00205b', fg = '#ffffff', accent = '#d4af37') {
    const MatCtor = THREE.MeshBasicMaterial || THREE.MeshStandardMaterial;
    const map = this.tex?.signTexture ? this.tex.signTexture(text, bg, fg, accent) : null;
    return markShared(new MatCtor(map ? { map } : { color: 0x00205b }));
  }

  _registerInteractive(obj, id, label, icon, action, extra = null, isDynamic = false) {
    this.campus.tagInteractable(obj, id, label, icon, action, extra);
    if (isDynamic) this._dynamicInteractIds.push({ id, obj });
  }

  _clearDynamicInteractables() {
    for (const item of this._dynamicInteractIds) {
      this.campus.interactables?.delete(item.id);
      if (item.obj && typeof item.obj.traverse === 'function') {
        item.obj.traverse((child) => {
          if (child.isMesh) {
            this.campus._raycastMeshSet?.delete(child);
          }
        });
      }
    }
    if (this._dynamicInteractIds.length > 0 && Array.isArray(this.campus.raycastMeshes)) {
      const activeSet = this.campus._raycastMeshSet;
      if (activeSet) {
        this.campus.raycastMeshes = this.campus.raycastMeshes.filter((m) => activeSet.has(m));
      }
    }
    this._dynamicInteractIds.length = 0;

    for (const col of this._dynamicColliders) {
      col.active = false;
    }
    if (this._dynamicColliders.length > 0 && Array.isArray(this.campus.colliders)) {
      const dead = new Set(this._dynamicColliders);
      this.campus.colliders = this.campus.colliders.filter((c) => !dead.has(c));
    }
    this._dynamicColliders.length = 0;
  }

  // ==================== XÂY DỰNG NGOẠI THẤT MODERN LUXURY & ĐƯỜNG KẾT NỐI ====================
  buildShellAndWalkways() {
    const mats = this._initMats();
    const cx = this.cx;
    const cz = this.cz;
    const hw = this.width / 2;  // 16
    const hd = this.depth / 2;  // 13
    const hWall = 6.6;

    // Đăng ký các điểm đi nhanh (Fast Travel) vào Bảo tàng
    this.campus.roomWaypoints.museum_entrance = { x: cx - hw - 3.2, z: cz }; // (14.8, -44)
    this.campus.roomWaypoints.museum = { x: cx - 10.5, z: cz };             // (23.5, -44) giữa Sảnh Lịch Sử

    // 1. Đường đi bộ đá tự nhiên kết nối từ Đại lộ Công Viên (x = 0, z = -44) thẳng tới Cổng Bảo tàng (x = 18)
    const westWalk = new THREE.Mesh(this._boxGeo(14.5, 0.08, 6.0), mats.walkwayStone);
    westWalk.position.set(11.0, 0.015, cz);
    westWalk.receiveShadow = true;
    this.shellGroup.add(westWalk);

    // Quảng trường đón tiếp phía Tây Bảo tàng + lối nối phía Nam hướng về HQ & Văn phòng Chủ tịch
    const westPlaza = new THREE.Mesh(this._boxGeo(6.4, 0.09, 13.0), mats.walkwayStone);
    westPlaza.position.set(15.2, 0.018, cz);
    westPlaza.receiveShadow = true;
    const southVipLink = new THREE.Mesh(this._boxGeo(5.2, 0.07, 17.5), mats.walkwayStone);
    southVipLink.position.set(13.2, 0.014, -30.5);
    southVipLink.receiveShadow = true;
    const hqConnector = new THREE.Mesh(this._boxGeo(14.0, 0.07, 4.6), mats.walkwayStone);
    hqConnector.position.set(6.5, 0.014, -24.5);
    hqConnector.receiveShadow = true;
    this.shellGroup.add(westPlaza, southVipLink, hqConnector);

    // Biển chỉ dẫn ngoài trời trên đại lộ công viên
    const waySign = new THREE.Mesh(
      this._planeGeo(6.6, 1.05),
      this._signMat('← PHÒNG THAY ĐỒ  |  BẢO TÀNG DANH HIỆU PSG →', '#00205b', '#ffffff', '#d4af37')
    );
    waySign.position.set(7.5, 2.75, cz - 3.6);
    const poleGeo = this._cylGeo(0.07, 0.08, 3.0, 8);
    const p1 = new THREE.Mesh(poleGeo, mats.darkStone); p1.position.set(5.2, 1.5, cz - 3.6);
    const p2 = new THREE.Mesh(poleGeo, mats.darkStone); p2.position.set(9.8, 1.5, cz - 3.6);
    this.shellGroup.add(waySign, p1, p2);

    // 2. Nền móng đá sang trọng & Sàn đá cẩm thạch bên trong
    const plinth = new THREE.Mesh(this._boxGeo(this.width + 0.8, 0.22, this.depth + 0.8), mats.darkStone);
    plinth.position.set(cx, 0.06, cz);
    plinth.receiveShadow = true;
    const floor = new THREE.Mesh(this._boxGeo(this.width - 0.3, 0.08, this.depth - 0.3), mats.marbleFloor);
    floor.position.set(cx, 0.15, cz);
    floor.receiveShadow = true;
    this.shellGroup.add(plinth, floor);

    // 3. Tường đá tự nhiên kết hợp mặt tiền kính cường lực hiện đại
    const addWall = (x, z, w, d, h = hWall, mat = mats.stoneWall, withCol = true) => {
      const m = new THREE.Mesh(this._boxGeo(w, h, d), mat);
      m.position.set(x, h / 2 + 0.14, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.shellGroup.add(m);
      if (withCol) this.campus.addCollider(x, z, w, d);
      return m;
    };

    const addGlassBay = (x, z, w, d, h = hWall - 0.8, withCol = true) => {
      const g = new THREE.Mesh(this._boxGeo(w, h, d), mats.glassFacade);
      g.position.set(x, h / 2 + 0.22, z);
      this.shellGroup.add(g);
      // Khung viền chân & đỉnh kính
      const sill = new THREE.Mesh(this._boxGeo(w + 0.04, 0.24, d + 0.14), mats.darkStone);
      sill.position.set(x, 0.24, z);
      const lint = new THREE.Mesh(this._boxGeo(w + 0.04, 0.42, d + 0.16), mats.darkStone);
      lint.position.set(x, hWall - 0.05, z);
      this.shellGroup.add(sill, lint);
      if (withCol) this.campus.addCollider(x, z, Math.max(0.28, w), Math.max(0.28, d));
    };

    // Tường Bắc (z = cz - hd = -57) & Tường Đông (x = cx + hw = 50): Đá tự nhiên sang trọng + cột trang trí
    addWall(cx, cz - hd, this.width, 0.36);
    addWall(cx + hw, cz, 0.36, this.depth);

    // Tường Nam (z = cz + hd = -31, hướng về phía Trụ sở & Văn phòng Chủ tịch): Đá kết hợp kính panorama
    addWall(cx - 12.0, cz + hd, 8.0, 0.36, hWall, mats.stoneWall);
    addGlassBay(cx, cz + hd, 16.0, 0.14);
    addWall(cx + 12.0, cz + hd, 8.0, 0.36, hWall, mats.stoneWall);

    // Tường Tây (x = cx - hw = 18, Mặt tiền chính có Lối vào tự động rộng 3.2m tại z ∈ [-45.6, -42.4])
    addWall(cx - hw, cz - 9.5, 0.36, 7.0, hWall, mats.stoneWall);
    addGlassBay(cx - hw, cz - 3.8, 0.14, 4.4);
    addGlassBay(cx - hw, cz + 3.8, 0.14, 4.4);
    addWall(cx - hw, cz + 9.5, 0.36, 7.0, hWall, mats.stoneWall);

    // Cổng vòm đón tiếp mặt tiền Tây (Mái hiên kính-đá, 2 cột đá tự nhiên, Logo PSG, Biển tên công trình)
    const canopy = new THREE.Mesh(this._boxGeo(3.6, 0.34, 8.2), mats.darkStone);
    canopy.position.set(cx - hw - 1.6, 4.85, cz);
    const canopyGoldTrim = new THREE.Mesh(this._boxGeo(3.65, 0.08, 8.26), mats.bronzeTrim);
    canopyGoldTrim.position.set(cx - hw - 1.6, 4.68, cz);
    const colL = new THREE.Mesh(this._boxGeo(0.55, 4.7, 0.55), mats.stoneWall);
    colL.position.set(cx - hw - 3.0, 2.5, cz - 3.4);
    const colR = new THREE.Mesh(this._boxGeo(0.55, 4.7, 0.55), mats.stoneWall);
    colR.position.set(cx - hw - 3.0, 2.5, cz + 3.4);
    this.campus.addCollider(cx - hw - 3.0, cz - 3.4, 0.65, 0.65);
    this.campus.addCollider(cx - hw - 3.0, cz + 3.4, 0.65, 0.65);

    const westTitleSign = new THREE.Mesh(
      this._planeGeo(7.6, 1.15),
      this._signMat('PARIS SAINT-GERMAIN CLUB MUSEUM', '#00205b', '#fde68a', '#da291c')
    );
    westTitleSign.position.set(cx - hw - 3.44, 5.55, cz);
    westTitleSign.rotation.y = -Math.PI / 2;

    const westCrest = new THREE.Mesh(this._planeGeo(1.75, 1.75), mats.crestMat);
    westCrest.position.set(cx - hw - 0.15, 5.75, cz);
    westCrest.rotation.y = -Math.PI / 2;

    // Biển tên mặt tiền Nam hướng thẳng về Trụ sở Chủ tịch
    const southTitleSign = new THREE.Mesh(
      this._planeGeo(15.5, 1.45),
      this._signMat('PARIS SAINT-GERMAIN CLUB MUSEUM · PHÒNG TRUYỀN THỐNG', '#00205b', '#ffffff', '#d4af37')
    );
    southTitleSign.position.set(cx, 5.95, cz + hd + 0.24);

    this.shellGroup.add(canopy, canopyGoldTrim, colL, colR, westTitleSign, westCrest, southTitleSign);
    this._registerInteractive(westTitleSign, 'museum_exterior_portal', 'Tham quan Bảo tàng PSG (Phòng Truyền Thống)', '🏛️', 'open_museum_ui');

    // 4. Cửa kính tự động đôi tại Lối vào chính (x = 18, z = -44) — tự mở mượt khi Chủ tịch lại gần!
    this._addAutomaticGlassDoor('door_museum_main', cx - hw, cz);

    // 5. Mái sảnh cao 6.8m với dải giếng trời kính trung tâm (lấy sáng tự nhiên sang trọng)
    const roofN = new THREE.Mesh(this._boxGeo(this.width + 0.8, 0.36, 9.5), mats.darkStone);
    roofN.position.set(cx, hWall + 0.32, cz - 8.5);
    roofN.castShadow = true;
    const roofS = new THREE.Mesh(this._boxGeo(this.width + 0.8, 0.36, 9.5), mats.darkStone);
    roofS.position.set(cx, hWall + 0.32, cz + 8.5);
    roofS.castShadow = true;
    const roofSky = new THREE.Mesh(this._boxGeo(this.width - 2.0, 0.12, 7.6), mats.skylightGlass);
    roofSky.position.set(cx, hWall + 0.34, cz);
    const roofBorder = new THREE.Mesh(this._boxGeo(this.width + 0.9, 0.14, 0.4), mats.bronzeTrim);
    roofBorder.position.set(cx, hWall + 0.42, cz + hd + 0.3);
    this.shellGroup.add(roofN, roofS, roofSky, roofBorder);

    freezeStaticTree(this.shellGroup);
  }

  _addAutomaticGlassDoor(id, x, z) {
    const mats = this._initMats();
    const frameGroup = new THREE.Group();
    frameGroup.position.set(x, 0.14, z);
    const lintel = new THREE.Mesh(this._boxGeo(0.32, 2.2, 3.2), mats.darkStone);
    lintel.position.set(0, 5.4, 0);
    const beam = new THREE.Mesh(this._boxGeo(0.36, 0.18, 3.2), mats.bronzeTrim);
    beam.position.set(0, 3.35, 0);
    frameGroup.add(lintel, beam);
    this.shellGroup.add(frameGroup);

    // Hai cánh cửa kính tự động xoay mở đồng bộ vào cơ chế PsgCampusScene.doors
    const doorGroup = new THREE.Group();
    doorGroup.position.set(x, 0.14, z);
    doorGroup.rotation.y = Math.PI / 2;
    doorGroup.userData.dynamicObject = true;
    this.shellGroup.add(doorGroup);

    const pivot = new THREE.Group();
    pivot.position.set(-1.35, 0, 0);
    pivot.userData.dynamicObject = true;
    doorGroup.add(pivot);

    const glassLeaf = new THREE.Mesh(this._boxGeo(2.65, 3.15, 0.08), mats.glassFacade);
    glassLeaf.position.set(1.32, 1.58, 0);
    glassLeaf.userData.dynamicObject = true;
    const leafFrameTop = new THREE.Mesh(this._boxGeo(2.7, 0.12, 0.12), mats.bronzeTrim);
    leafFrameTop.position.set(1.32, 3.12, 0);
    leafFrameTop.userData.dynamicObject = true;
    const handleBar = new THREE.Mesh(this._boxGeo(0.14, 0.75, 0.16), mats.bronzeTrim);
    handleBar.position.set(2.35, 1.25, 0);
    handleBar.userData.dynamicObject = true;
    pivot.add(glassLeaf, leafFrameTop, handleBar);

    const col = this.campus.addCollider(x, z, 0.30, 2.8);
    const doorObj = {
      id, x, z, pivot, open: false, locked: false, targetAngle: 0, collider: col,
      autoOpenNearPlayer: true
    };
    this.campus.doors.push(doorObj);
    this._registerInteractive(glassLeaf, id, 'Cửa kính tự động Bảo tàng PSG', '🚪', 'toggle_door', doorObj);
  }

  // ==================== XÂY DỰNG 5 KHU VỰC TRƯNG BÀY BÊN TRONG ====================
  buildStaticInterior() {
    const mats = this._initMats();
    const cx = this.cx;
    const cz = this.cz;

    // 1. Hệ thống đèn trần kiến trúc sang trọng (dùng dải LED emissive — 0 PointLight runtime!)
    for (let lx = cx - 12; lx <= cx + 12; lx += 8) {
      const strip = new THREE.Mesh(this._boxGeo(5.2, 0.06, 0.24), mats.warmStrip);
      strip.position.set(lx, 6.42, cz);
      this.interiorGroup.add(strip);
    }

    // Vách ngăn nghệ thuật lửng (tạo ranh giới 5 khu vực nhưng vẫn thông thoáng lối đi rộng >= 3.2m)
    const addDivider = (x, z, w, d, h = 3.2) => {
      const wall = new THREE.Mesh(this._boxGeo(w, h, d), mats.darkStone);
      wall.position.set(x, h / 2 + 0.16, z);
      const cap = new THREE.Mesh(this._boxGeo(w + 0.06, 0.08, d + 0.06), mats.bronzeTrim);
      cap.position.set(x, h + 0.18, z);
      this.interiorGroup.add(wall, cap);
      this.campus.addCollider(x, z, w, d);
    };
    // Vách giữa Khu Quốc Nội (Bắc-Tây) & Quốc Tế (Bắc-Đông)
    addDivider(34.5, -52.5, 0.28, 7.6, 3.6);
    // Vách giữa Sảnh Lịch Sử & Phòng Huyền Thoại / Quốc Tế
    addDivider(34.5, -35.8, 0.28, 8.2, 3.2);

    // Biển tên 5 khu vực treo trang trọng trên cao
    const addZoneSign = (text, x, y, z, rotY = 0, w = 5.4, h = 0.72) => {
      const s = new THREE.Mesh(this._planeGeo(w, h), this._signMat(text, '#0f172a', '#fde68a', '#da291c'));
      s.position.set(x, y, z);
      s.rotation.y = rotY;
      this.interiorGroup.add(s);
    };
    addZoneSign('1. SẢNH LỊCH SỬ PSG · FONDÉ EN 1970', 24.5, 4.75, -40.2, Math.PI, 5.8, 0.74);
    addZoneSign('2. PHÒNG DANH HIỆU QUỐC NỘI · FRANCE', 26.8, 4.75, -56.4, 0, 6.4, 0.76);
    addZoneSign('3. PHÒNG DANH HIỆU QUỐC TẾ · EUROPE & WORLD', 42.2, 4.75, -56.4, 0, 6.8, 0.76);
    addZoneSign('4. PHÒNG HUYỀN THOẠI · PSG LEGENDS', 49.4, 4.75, -37.5, -Math.PI / 2, 6.4, 0.76);
    addZoneSign('5. PHÒNG LỊCH SỬ CÁC MÙA GIẢI · ARCHIVES', 26.8, 4.75, -31.5, Math.PI, 6.4, 0.76);

    // --- KHU 1: SẢNH LỊCH SỬ PSG (x ≈ 23.5, z = -44) ---
    // Đài kỷ niệm Logo PSG & Năm thành lập 1970 ngay trung tâm sảnh
    const histPed = new THREE.Mesh(this._cylGeo(1.15, 1.35, 1.05, 24), mats.darkStone);
    histPed.position.set(23.5, 0.68, -44.0);
    const histGoldRing = new THREE.Mesh(this._cylGeo(1.22, 1.22, 0.08, 24), mats.bronzeTrim);
    histGoldRing.position.set(23.5, 1.22, -44.0);
    const histCrest = new THREE.Mesh(this._planeGeo(1.55, 1.55), mats.crestMat);
    histCrest.position.set(23.5, 2.25, -44.0);
    histCrest.rotation.y = -Math.PI / 2;
    const histCrestBack = new THREE.Mesh(this._planeGeo(1.55, 1.55), mats.crestMat);
    histCrestBack.position.set(23.5, 2.25, -44.0);
    histCrestBack.rotation.y = Math.PI / 2;
    this.interiorGroup.add(histPed, histGoldRing, histCrest, histCrestBack);
    this.campus.addCollider(23.5, -44.0, 2.3, 2.3);
    this._registerInteractive(histPed, 'museum_history_monument', 'Lịch sử & Di sản Paris Saint-Germain (Từ 1970)', '📜', 'open_museum_ui', { tab: 'history' });

    // Bảng Dòng Thời Gian Lịch Sử (Timeline Board) gắn sát rìa Sảnh Lịch Sử
    const tlTex = makeCanvasPanelTex((ctx, w, h) => {
      ctx.fillStyle = '#0b1528';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 5;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('DÒNG THỜI GIAN LỊCH SỬ PARIS SAINT-GERMAIN', 24, 38);
      PSG_HISTORY_TIMELINE.slice(0, 5).forEach((m, idx) => {
        const y = 74 + idx * 35;
        ctx.fillStyle = '#da291c';
        ctx.fillRect(24, y - 14, 78, 22);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(m.year, 30, y + 2);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '13px sans-serif';
        ctx.fillText(`${m.title} — ${m.generation}`, 114, y + 2);
      });
    }, 640, 256);
    const MatCtor = THREE.MeshBasicMaterial || THREE.MeshStandardMaterial;
    const tlBoard = new THREE.Mesh(
      this._boxGeo(4.4, 2.0, 0.16),
      tlTex ? markShared(new MatCtor({ map: tlTex })) : mats.psgNavy
    );
    tlBoard.position.set(29.8, 2.2, -44.0);
    tlBoard.rotation.y = -Math.PI / 2;
    const tlFrame = new THREE.Mesh(this._boxGeo(0.24, 2.2, 4.6), mats.darkStone);
    tlFrame.position.set(29.95, 2.2, -44.0);
    const tlPed = new THREE.Mesh(this._boxGeo(0.7, 1.1, 4.6), mats.darkStone);
    tlPed.position.set(29.95, 0.55, -44.0);
    this.interiorGroup.add(tlBoard, tlFrame, tlPed);
    this.campus.addCollider(29.95, -44.0, 0.8, 4.6);
    this._registerInteractive(tlBoard, 'museum_timeline_board', 'Xem Dòng Thời Gian & Các Thế Hệ Cầu Thủ PSG', '🕰️', 'open_museum_ui', { tab: 'history' });

    // --- KHU 2 & 3: TỦ DI SẢN CÂU LẠC BỘ (PRE-2026 HERITAGE SHOWCASES) ---
    const domHeritage = this.trophyFactory.createTrophyShowcase({
      trophyId: 'heritage_domestic',
      competitionName: 'Di Sản Quốc Nội (1970–2026)',
      seasonName: '51 Danh Hiệu',
      winningDate: '13 Ligue 1 · 16 Cúp QG',
      winningManagerName: 'Lịch Sử PSG',
      trophyModel: 'ligue_1',
      isNewHighlight: false
    });
    domHeritage.position.set(20.6, 0.18, -54.8);
    this.interiorGroup.add(domHeritage);
    this.campus.addCollider(20.6, -54.8, 1.0, 1.0);
    this._registerInteractive(domHeritage, 'museum_dom_heritage', 'Di Sản Quốc Nội PSG (1970–2026)', '🇫🇷', 'open_museum_ui', { tab: 'domestic' });

    const intlHeritage = this.trophyFactory.createTrophyShowcase({
      trophyId: 'heritage_intl',
      competitionName: 'Di Sản Châu Âu (1996–2026)',
      seasonName: 'UCL 2025 & C2 1996',
      winningDate: 'Vinh Quang Châu Lục',
      winningManagerName: 'Lịch Sử PSG',
      trophyModel: 'ucl',
      isNewHighlight: false
    });
    intlHeritage.position.set(47.4, 0.18, -54.8);
    this.interiorGroup.add(intlHeritage);
    this.campus.addCollider(47.4, -54.8, 1.0, 1.0);
    this._registerInteractive(intlHeritage, 'museum_intl_heritage', 'Di Sản Quốc Tế PSG (UCL & Siêu Cúp)', '🌍', 'open_museum_ui', { tab: 'international' });

    // --- KHU 4: PHÒNG HUYỀN THOẠI (Đông-Nam: x ∈ [36, 49], z ∈ [-43, -32]) ---
    const legendPlacements = [
      { x: 48.9, z: -41.5, ry: -Math.PI / 2 },
      { x: 48.9, z: -38.5, ry: -Math.PI / 2 },
      { x: 48.9, z: -35.5, ry: -Math.PI / 2 },
      { x: 48.9, z: -32.8, ry: -Math.PI / 2 },
      { x: 46.2, z: -31.8, ry: Math.PI },
      { x: 43.2, z: -31.8, ry: Math.PI },
      { x: 40.2, z: -31.8, ry: Math.PI },
      { x: 37.2, z: -31.8, ry: Math.PI }
    ];
    PSG_LEGENDS.slice(0, legendPlacements.length).forEach((leg, idx) => {
      const pos = legendPlacements[idx];
      const legGroup = new THREE.Group();
      legGroup.position.set(pos.x, 0.18, pos.z);
      legGroup.rotation.y = pos.ry;

      const backing = new THREE.Mesh(this._boxGeo(2.05, 2.35, 0.14), mats.darkStone);
      backing.position.y = 2.05;
      const trim = new THREE.Mesh(this._boxGeo(2.14, 2.44, 0.10), mats.bronzeTrim);
      trim.position.y = 2.05;
      const tex = makeCanvasPanelTex((ctx, w, h) => {
        ctx.fillStyle = '#07142a';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#da291c';
        ctx.fillRect(0, 0, w, 12);
        ctx.fillStyle = '#fde68a';
        ctx.font = 'bold 48px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`#${leg.shirtNumber}`, w / 2, 76);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px sans-serif';
        ctx.fillText(leg.name.toUpperCase(), w / 2, 122);
        ctx.fillStyle = '#93c5fd';
        ctx.font = '16px sans-serif';
        ctx.fillText(`${leg.position} · ${leg.era}`, w / 2, 152);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '14px sans-serif';
        ctx.fillText(`${leg.apps} trận · ${leg.goals} bàn`, w / 2, 182);
        ctx.fillStyle = '#fde68a';
        ctx.font = '13px sans-serif';
        ctx.fillText(leg.trophies.slice(0, 38), w / 2, 214);
      }, 320, 256);
      const panel = new THREE.Mesh(
        this._planeGeo(1.88, 2.15),
        tex ? markShared(new MatCtor({ map: tex })) : mats.psgNavy
      );
      panel.position.set(0, 2.05, 0.09);
      const lowPed = new THREE.Mesh(this._boxGeo(1.6, 0.72, 0.45), mats.darkStone);
      lowPed.position.set(0, 0.36, 0.28);
      legGroup.add(trim, backing, panel, lowPed);
      this.interiorGroup.add(legGroup);
      this._registerInteractive(legGroup, `legend_${leg.legendId}`, `Huyền thoại PSG: ${leg.name} (#${leg.shirtNumber})`, '⭐', 'inspect_legend', { legendId: leg.legendId });
    });

    freezeStaticTree(this.interiorGroup);
    // Giữ động 2 nhóm con chứa Cúp mới & Lưu trữ mùa giải
    this.dynamicTrophiesGroup.matrixAutoUpdate = true;
    this.dynamicSeasonsGroup.matrixAutoUpdate = true;
  }

  // ==================== ĐỒNG BỘ TỰ ĐỘNG CÚP 3D & LỊCH SỬ MÙA GIẢI ====================
  syncWithTrophySystem(trophySystem) {
    if (!trophySystem) return;
    if (this._lastSyncedVersion === trophySystem.version) return;
    this._lastSyncedVersion = trophySystem.version;

    this._clearDynamicInteractables();
    // Giải phóng tài nguyên đồ họa động cũ an toàn trước khi dựng lại
    while (this.dynamicTrophiesGroup.children.length > 0) {
      const ch = this.dynamicTrophiesGroup.children.pop();
      safeDisposeObject3D(ch);
    }
    while (this.dynamicSeasonsGroup.children.length > 0) {
      const ch = this.dynamicSeasonsGroup.children.pop();
      safeDisposeObject3D(ch);
    }

    const mats = this._initMats();

    // Tọa độ các bệ trưng bày trong Phòng Quốc Nội (tối đa 10 bệ gọn gàng, khoảng cách thoáng >= 2.2m)
    const domesticSlots = [
      { x: 23.4, z: -54.8 }, { x: 26.0, z: -54.8 }, { x: 28.6, z: -54.8 }, { x: 31.2, z: -54.8 },
      { x: 23.4, z: -51.4 }, { x: 26.0, z: -51.4 }, { x: 28.6, z: -51.4 }, { x: 31.2, z: -51.4 }
    ];
    const intlSlots = [
      { x: 37.6, z: -54.8 }, { x: 40.2, z: -54.8 }, { x: 42.8, z: -54.8 }, { x: 45.2, z: -54.8 },
      { x: 37.6, z: -51.2 }, { x: 40.2, z: -51.2 }, { x: 42.8, z: -51.2 }, { x: 45.2, z: -51.2 }
    ];

    const placeWing = (trophiesList, slots, wingLabel) => {
      for (let i = 0; i < slots.length; i++) {
        const pt = slots[i];
        const t = trophiesList[i];
        if (t) {
          const showcase = this.trophyFactory.createTrophyShowcase(t);
          showcase.position.set(pt.x, 0.18, pt.z);
          this.dynamicTrophiesGroup.add(showcase);
          const col = this.campus.addCollider(pt.x, pt.z, 1.02, 1.02);
          this._dynamicColliders.push(col);
          this._registerInteractive(
            showcase,
            t.trophyId,
            `Chiêm ngưỡng Cúp ${t.competitionName} (${t.seasonName})`,
            '🏆',
            'inspect_trophy',
            { trophyId: t.trophyId },
            true
          );
        } else if (i < 4) {
          // Hiển thị tối đa 4 bệ trống sẵn sàng chờ đón cúp mới (không tạo quá nhiều draw call thừa)
          const emptyPed = new THREE.Mesh(this._boxGeo(0.78, 0.85, 0.78), mats.previewSlot);
          emptyPed.position.set(pt.x, 0.60, pt.z);
          const goldCap = new THREE.Mesh(this._boxGeo(0.84, 0.05, 0.84), mats.bronzeTrim);
          goldCap.position.set(pt.x, 1.04, pt.z);
          this.dynamicTrophiesGroup.add(emptyPed, goldCap);
          const col = this.campus.addCollider(pt.x, pt.z, 0.88, 0.88);
          this._dynamicColliders.push(col);
          this._registerInteractive(
            emptyPed,
            `empty_slot_${wingLabel}_${i}`,
            `Bệ Vinh Danh Trống · ${wingLabel} (Chờ PSG vô địch!)`,
            '✨',
            'open_museum_ui',
            { tab: wingLabel === 'Quốc Nội' ? 'domestic' : 'international' },
            true
          );
        }
      }
    };

    placeWing(trophySystem.getByCategory('domestic'), domesticSlots, 'Quốc Nội');
    placeWing(trophySystem.getByCategory('international'), intlSlots, 'Quốc Tế');

    // --- KHU 5: ĐÀI LƯU TRỮ CÁC MÙA GIẢI (Tây-Nam: z = -33.2, x = 21.5..31.5) ---
    const archives = (trophySystem.seasonArchives || []).slice(0, 6);
    const MatCtor = THREE.MeshBasicMaterial || THREE.MeshStandardMaterial;
    archives.forEach((arc, idx) => {
      const mx = 21.4 + (idx % 3) * 4.2;
      const mz = idx < 3 ? -33.0 : -36.5;
      const mon = new THREE.Group();
      mon.position.set(mx, 0.18, mz);

      const pillar = new THREE.Mesh(this._boxGeo(1.15, 1.25, 0.65), mats.screenFrame);
      pillar.position.y = 0.62;
      const trim = new THREE.Mesh(this._boxGeo(1.20, 0.06, 0.70), mats.bronzeTrim);
      trim.position.y = 1.26;
      const tex = makeCanvasPanelTex((ctx, w, h) => {
        ctx.fillStyle = '#07142b';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 4;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = '#fde68a';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`MÙA GIẢI ${arc.season}`, w / 2, 36);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`${arc.psgRank || 'Hạng 1'} · HLV: ${(arc.coachName || 'PSG').slice(0, 20)}`, w / 2, 68);
        ctx.fillStyle = '#4ade80';
        ctx.font = '15px sans-serif';
        const tTxt = arc.trophyNames?.length ? arc.trophyNames.join(', ') : 'Chưa có danh hiệu';
        ctx.fillText(tTxt.slice(0, 34), w / 2, 98);
      }, 320, 140);
      const scr = new THREE.Mesh(
        this._planeGeo(1.06, 0.56),
        tex ? markShared(new MatCtor({ map: tex })) : mats.psgNavy
      );
      scr.position.set(0, 1.56, 0.04);
      scr.rotation.x = -0.35;
      mon.add(pillar, trim, scr);
      this.dynamicSeasonsGroup.add(mon);

      const col = this.campus.addCollider(mx, mz, 1.25, 0.75);
      this._dynamicColliders.push(col);
      this._registerInteractive(
        mon,
        `season_archive_${arc.seasonId || arc.season}`,
        `Hồ sơ Mùa Giải ${arc.season} (${arc.trophyNames?.length || 0} danh hiệu)`,
        '📚',
        'inspect_season',
        { season: arc.season },
        true
      );
    });
  }

  dispose() {
    if (this._unsubscribeTrophy) {
      this._unsubscribeTrophy();
      this._unsubscribeTrophy = null;
    }
    this._clearDynamicInteractables();
    safeDisposeObject3D(this.group);
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
