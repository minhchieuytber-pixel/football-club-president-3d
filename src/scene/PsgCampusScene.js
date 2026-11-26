// src/scene/PsgCampusScene.js
// Quy hoạch khoa học Tầng 1 (68m x 44m): Mọi phòng đều tách biệt hoàn toàn với cửa gỗ mở trực tiếp ra hành lang (không đi xuyên phòng nào sang phòng khác)
// Phòng Chủ tịch có sảnh đệm mở sang trọng và chỉ cần mở ĐÚNG 1 cửa gỗ cao cấp để bước vào!
// Tối ưu Phase 2 cho WebGL/iPhone: giảm PointLights 6->2, gộp mesh tĩnh theo vật liệu (batching), đóng băng ma trận tĩnh, chống trùng raycastMeshes.

import { OfficeDeskDocuments3D } from './OfficeDeskDocuments3D.js';

export class PsgCampusScene {
  constructor(scene, texFactory, furnitureFactory, vehicleSystem) {
    this.scene = scene;
    this.tex = texFactory;
    this.furn = furnitureFactory;
    this.vehicles = vehicleSystem;
    this.root = new THREE.Group();
    this.interactables = new Map();
    this.raycastMeshes = [];
    this._raycastMeshSet = new Set();
    this.colliders = [];
    this.doors = [];
    this.seats = [];
    this.chairPositions = [];
    this.roomWaypoints = {};
    this.boardroomSeats = [];
    this.presidentMeetingSeat = { x: -26.0, z: -15.2, rotY: Math.PI };
    this._signMatCache = new Map();
    this._staticShellTarget = null;
    this._initSharedMaterials();
    this.scene.add(this.root);
    this.build();
  }

  _tagShared(obj) {
    if (!obj) return obj;
    obj.userData = obj.userData || {};
    obj.userData.sharedAsset = true;
    return obj;
  }

  _initSharedMaterials() {
    this._doorTransomMat = this._tagShared(new THREE.MeshStandardMaterial({ color: 0xe6e0d5, roughness: 0.65 }));
    this._solidWallMat = this._tagShared(new THREE.MeshStandardMaterial({ color: 0xe8e3da, roughness: 0.62, metalness: 0.03 }));
    this._darkTrimMat = this._tagShared(new THREE.MeshStandardMaterial({ color: 0x222834, roughness: 0.55, metalness: 0.15 }));
    this._walkwayMat = this._tagShared(new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.68 }));
    this._crestMat = this._tagShared(new THREE.MeshStandardMaterial({ map: this.tex.psgCrestTexture(), transparent: true }));
    this._hitProxyMat = this._tagShared(new THREE.MeshBasicMaterial({
      visible: false,
      side: typeof THREE !== 'undefined' && typeof THREE.DoubleSide !== 'undefined' ? THREE.DoubleSide : 2
    }));
  }

  _boxGeo(w, h, d) {
    if (this.furn && typeof this.furn._boxGeo === 'function') return this.furn._boxGeo(w, h, d);
    return new THREE.BoxGeometry(w, h, d);
  }

  _planeGeo(w, h) {
    if (this.furn && typeof this.furn._planeGeo === 'function') return this.furn._planeGeo(w, h);
    return new THREE.PlaneGeometry(w, h);
  }

  _getSignMaterial(text, bg = '#0f172a', fg = '#f8fafc', accent = '#da291c') {
    const key = `${text}|${bg}|${fg}|${accent}`;
    if (this._signMatCache.has(key)) return this._signMatCache.get(key);
    const MatCtor = typeof THREE.MeshBasicMaterial === 'function' ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
    const mat = this._tagShared(new MatCtor({ map: this.tex.signTexture(text, bg, fg, accent) }));
    this._signMatCache.set(key, mat);
    return mat;
  }

  _freezeStaticSubtree(node, excludeSet = null) {
    if (!node || typeof node.traverse !== 'function') return;
    node.traverse((obj) => {
      if (excludeSet && excludeSet.has(obj)) return;
      if (obj.isLight) return;
      if (obj.userData && obj.userData.dynamicObject) return;
      if (typeof obj.updateMatrix === 'function') obj.updateMatrix();
      obj.matrixAutoUpdate = false;
    });
  }

  // Gộp các mesh tĩnh cùng (material, castShadow, receiveShadow) trong 1 group để giảm mạnh draw calls trên WebGL/iPhone
  _batchStaticGroup(group, { replaceInteractables = false } = {}) {
    if (!group || !this.furn || typeof this.furn.canMergeGeometries !== 'function' || !this.furn.canMergeGeometries()) {
      return;
    }

    group.updateMatrixWorld(true);
    const invRoot = new THREE.Matrix4().copy(group.matrixWorld);
    if (typeof invRoot.determinant === 'function' && Math.abs(invRoot.determinant()) > 1e-10) {
      invRoot.invert();
    } else {
      invRoot.identity();
    }
    const buckets = new Map();
    const interactBoxes = new Map();
    const oldInteractMeshes = new Set();
    const keepDirectChildren = [];

    group.traverse((child) => {
      if (child === group) return;
      if (child.isLight || child.isInstancedMesh || (child.userData && child.userData.dynamicObject)) {
        if (child.parent === group) keepDirectChildren.push(child);
        return;
      }
      if (!child.isMesh || !child.geometry || !child.material) return;

      // Lưu bounding box thế giới cho các đối tượng tương tác để thay bằng 1 hit-proxy nhẹ (0 draw call!)
      if (replaceInteractables && child.userData && child.userData.interactId) {
        const id = child.userData.interactId;
        oldInteractMeshes.add(child);
        if (typeof THREE.Box3 === 'function') {
          let b = interactBoxes.get(id);
          if (!b) {
            b = new THREE.Box3();
            interactBoxes.set(id, b);
          }
          b.expandByObject(child);
        }
      }

      const mat = child.material;
      const cs = child.castShadow ? 1 : 0;
      const rs = child.receiveShadow ? 1 : 0;
      const useVC = !!(mat.vertexColors || child.geometry.attributes?.color);
      const matId = mat.uuid || (mat._batchId || (mat._batchId = `b_${buckets.size}_${Math.random()}`));
      const bKey = `${matId}|${cs}|${rs}|${useVC ? 1 : 0}`;

      let bucket = buckets.get(bKey);
      if (!bucket) {
        bucket = { mat, castShadow: !!cs, receiveShadow: !!rs, useVertexColors: useVC, entries: [] };
        buckets.set(bKey, bucket);
      }

      const relMatrix = new THREE.Matrix4().multiplyMatrices(invRoot, child.matrixWorld);
      bucket.entries.push({ geo: child.geometry, matrix: relMatrix });
    });

    if (buckets.size === 0) return;

    const mergedMeshes = [];
    for (const bucket of buckets.values()) {
      const mergedGeo = this.furn.mergeGeometryEntries(bucket.entries, {
        useVertexColors: bucket.useVertexColors,
        shared: false
      });
      if (!mergedGeo) return; // Fallback an toàn nếu gặp geometry không tương thích
      const m = new THREE.Mesh(mergedGeo, bucket.mat);
      m.castShadow = bucket.castShadow;
      m.receiveShadow = bucket.receiveShadow;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      mergedMeshes.push(m);
    }

    // Xóa cây con chi tiết cũ và gắn các mesh đã gộp
    while (group.children.length > 0) {
      group.remove(group.children[group.children.length - 1]);
    }
    for (let i = 0; i < keepDirectChildren.length; i++) group.add(keepDirectChildren[i]);
    for (let i = 0; i < mergedMeshes.length; i++) group.add(mergedMeshes[i]);

    // Thay thế hàng chục sub-mesh raycast cũ bằng đúng 1 bounding-box hit proxy không tốn draw call cho mỗi vật tương tác
    if (replaceInteractables && oldInteractMeshes.size > 0) {
      this.raycastMeshes = this.raycastMeshes.filter((m) => !oldInteractMeshes.has(m));
      for (const m of oldInteractMeshes) this._raycastMeshSet.delete(m);

      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      for (const [id, box] of interactBoxes.entries()) {
        if (box.isEmpty()) continue;
        box.getSize(size);
        box.getCenter(center);
        if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || !Number.isFinite(size.z)) continue;
        if (!Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(center.z)) continue;
        // Chuyển tâm về không gian cục bộ của group
        center.applyMatrix4(invRoot);
        const proxy = new THREE.Mesh(
          this._boxGeo(Math.max(0.18, size.x), Math.max(0.18, size.y), Math.max(0.18, size.z)),
          this._hitProxyMat
        );
        proxy.position.copy(center);
        proxy.userData.interactId = id;
        proxy.matrixAutoUpdate = false;
        proxy.updateMatrix();
        group.add(proxy);
        this._raycastMeshSet.add(proxy);
        this.raycastMeshes.push(proxy);
      }
      group.updateMatrixWorld(true);
    }
  }

  addCollider(cx, cz, w, d, minY = null, maxY = null) {
    const c = { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, minY, maxY, active: true };
    this.colliders.push(c);
    return c;
  }

  tagInteractable(object3D, id, label, icon, action, extra = null) {
    this.interactables.set(id, { id, label, icon, action, extra });
    object3D.traverse((child) => {
      if (child.isMesh) {
        child.userData.interactId = id;
        if (!this._raycastMeshSet.has(child)) {
          this._raycastMeshSet.add(child);
          this.raycastMeshes.push(child);
        }
      }
    });
  }

  registerChairPosition(x, z, y = 0.14) {
    this.chairPositions.push({ x, z, y });
  }

  hasChairAt(x, z, maxDist = 0.78) {
    const r2 = maxDist * maxDist;
    for (const c of this.chairPositions) {
      const dx = c.x - x;
      const dz = c.z - z;
      if (dx * dx + dz * dz <= r2) return true;
    }
    return false;
  }

  getChairElevationAt(x, z, maxDist = 0.78) {
    const r2 = maxDist * maxDist;
    for (const c of this.chairPositions) {
      const dx = c.x - x;
      const dz = c.z - z;
      if (dx * dx + dz * dz <= r2) return c.y ?? 0.14;
    }
    return 0.14;
  }

  addSeat(object3D, id, label, x, z, lookYaw, standX, standZ) {
    const seat = { id, label, x, z, lookYaw, standX, standZ };
    this.seats.push(seat);
    this.registerChairPosition(x, z, 0.14);
    this.tagInteractable(object3D, id, `Ngồi ${label}`, '🪑', 'sit_seat', seat);
  }

  addGlassWindow(x, z, w, rotY = 0, hasBlinds = false) {
    const win = this.furn.createGlassWindowWall(w, 4.4, hasBlinds);
    win.position.set(x, 0.14, z);
    win.rotation.y = rotY;
    (this._staticShellTarget || this.root).add(win);
    const rot = Math.abs(Math.sin(rotY)) > 0.5;
    this.addCollider(x, z, rot ? 0.24 : w, rot ? w : 0.24);
  }

  addWoodenDoor(id, x, z, rotY = 0, width = 1.9, isLuxury = false, opts = {}) {
    const frameMat = isLuxury ? this.furn.mats.darkWood : this.furn.mats.walnut;
    const leafMat = isLuxury ? this.furn.mats.walnut : this.furn.mats.oakLight;
    const handleMat = isLuxury ? this.furn.mats.gold : this.furn.mats.chrome;
    const compactCeiling = !!(opts && opts.compactCeiling);

    // Khung cửa tĩnh (tách riêng để gộp tĩnh trong HQ shell mà không ảnh hưởng pivot mở cửa!)
    const frameGroup = new THREE.Group();
    frameGroup.position.set(x, 0.14, z);
    frameGroup.rotation.y = rotY;
    (this._staticShellTarget || this.root).add(frameGroup);

    const postGeo = this._boxGeo(0.12, 2.6, 0.26);
    const postL = new THREE.Mesh(postGeo, frameMat);
    postL.position.set(-width / 2, 1.3, 0);
    const postR = new THREE.Mesh(postGeo, frameMat);
    postR.position.set(width / 2, 1.3, 0);
    const lintel = new THREE.Mesh(this._boxGeo(width + 0.14, 0.16, 0.26), frameMat);
    lintel.position.set(0, 2.62, 0);
    const transomH = compactCeiling ? 1.22 : 1.82;
    const transomY = compactCeiling ? 3.31 : 3.58;
    const transom = new THREE.Mesh(this._boxGeo(width + 0.18, transomH, 0.22), this._doorTransomMat);
    transom.position.set(0, transomY, 0);
    frameGroup.add(postL, postR, lintel, transom);

    // Nhóm cánh cửa động (KHÔNG bao giờ đóng băng matrixAutoUpdate của pivot!)
    const doorGroup = new THREE.Group();
    doorGroup.position.set(x, 0.14, z);
    doorGroup.rotation.y = rotY;
    doorGroup.userData.dynamicObject = true;
    this.root.add(doorGroup);

    const pivot = new THREE.Group();
    pivot.position.set(-width / 2 + 0.06, 0, 0);
    pivot.userData.dynamicObject = true;
    doorGroup.add(pivot);

    const leafW = width - 0.12;
    const leaf = new THREE.Mesh(this._boxGeo(leafW, 2.52, 0.075), leafMat);
    leaf.position.set(leafW / 2, 1.26, 0);
    leaf.castShadow = false;
    leaf.userData.dynamicObject = true;
    pivot.add(leaf);

    const panel = new THREE.Mesh(this._boxGeo(leafW - 0.28, 1.88, 0.09), frameMat);
    panel.position.set(leafW / 2, 1.28, 0);
    panel.userData.dynamicObject = true;
    pivot.add(panel);

    // 1 tay nắm xuyên 2 mặt thay cho 2 mesh rời (giảm 1 draw call mỗi cánh cửa)
    const handle = new THREE.Mesh(this._boxGeo(0.15, 0.032, 0.18), handleMat);
    handle.position.set(leafW - 0.18, 1.08, 0);
    handle.userData.dynamicObject = true;
    pivot.add(handle);

    const isRot = Math.abs(Math.sin(rotY)) > 0.5;
    const col = this.addCollider(x, z, isRot ? 0.26 : width, isRot ? width : 0.26);
    const doorObj = { id, x, z, pivot, open: false, locked: false, targetAngle: 0, collider: col };
    this.doors.push(doorObj);
    // Chỉ gắn raycast lên mặt cánh cửa chính (thay vì toàn bộ 4 sub-mesh)
    this.tagInteractable(leaf, id, isLuxury ? 'Mở / Đóng cửa gỗ Cao cấp' : 'Mở / Đóng cửa gỗ', '🚪', 'toggle_door', doorObj);
    return doorObj;
  }

  toggleDoor(doorObj) {
    if (doorObj.locked) return false;
    doorObj.open = !doorObj.open;
    doorObj.targetAngle = doorObj.open ? Math.PI * 0.48 : 0;
    doorObj.collider.active = !doorObj.open;
    return doorObj.open;
  }

  updateDoors(dt, playerPos = null, npcs = []) {
    for (let i = 0; i < this.doors.length; i++) {
      const d = this.doors[i];
      if (d.isResidenceDoor) continue;
      let npcNear = false;
      for (let j = 0; j < npcs.length; j++) {
        const n = npcs[j];
        if (!n.mesh || !n.mesh.visible) continue;
        const dx = n.mesh.position.x - d.x;
        const dz = n.mesh.position.z - d.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 9.0) {
          npcNear = true;
          // NPC đang di chuyển đến gần cửa không bị khóa -> mở cửa trước khi đi qua (không bao giờ đi xuyên cửa đóng!)
          if (d2 < 6.5025 && !d.open && !d.locked) {
            const moving = Math.hypot(n.target.x - n.mesh.position.x, n.target.z - n.mesh.position.z) > 0.35 || (n.path && n.path.length > 0);
            if (moving) {
              d.open = true;
              d.targetAngle = Math.PI * 0.48;
              d.collider.active = false;
            }
          }
        }
      }
      let playerAutoNear = false;
      if (playerPos) {
        const pdx = playerPos.x - d.x;
        const pdz = playerPos.z - d.z;
        const pd2 = pdx * pdx + pdz * pdz;
        if (d.autoOpenNearPlayer && !d.locked && pd2 <= 12.25) {
          playerAutoNear = true;
          if (!d.open) {
            d.open = true;
            d.targetAngle = Math.PI * 0.48;
            d.collider.active = false;
          }
        }
        const closeDist2 = d.autoOpenNearPlayer ? 18.5 : 12.96;
        if (d.open && !npcNear && !playerAutoNear && pd2 > closeDist2) {
          d.open = false;
          d.targetAngle = 0;
          d.collider.active = true;
        }
      }
      const diff = d.targetAngle - d.pivot.rotation.y;
      if (Math.abs(diff) > 0.0005) {
        d.pivot.rotation.y += diff * Math.min(1, dt * 8);
      }
    }
  }

  resolveCollision(x, z, radius = 0.42, entityY = 0.14) {
    let px = Math.max(-130, Math.min(310, x));
    let pz = Math.max(-220, Math.min(90, z));
    const r2 = radius * radius;
    const cols = this.colliders;
    const len = cols.length;
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < len; i++) {
        const b = cols[i];
        if (!b.active) continue;
        if (b.minY != null && entityY < b.minY - 0.1) continue;
        if (b.maxY != null && entityY > b.maxY + 0.1) continue;
        const cx = Math.max(b.minX, Math.min(px, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pz, b.maxZ));
        const dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
        if (d2 < r2) {
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            px += (dx / d) * (radius - d);
            pz += (dz / d) * (radius - d);
          } else {
            const penL = Math.abs(px - b.minX), penR = Math.abs(b.maxX - px);
            const penT = Math.abs(pz - b.minZ), penB = Math.abs(b.maxZ - pz);
            const m = Math.min(penL, penR, penT, penB);
            if (m === penL) px = b.minX - radius;
            else if (m === penR) px = b.maxX + radius;
            else if (m === penT) pz = b.minZ - radius;
            else pz = b.maxZ + radius;
          }
        }
      }
    }
    return { x: px, z: pz };
  }

  build() {
    this.buildLighting();
    this.buildGroundAndRoads();
    this.buildHeadquarters();
    this.buildNorthParkway();
    this.buildParkingAndVehicles();
    this.buildLandscapingInstanced();

    // Đóng băng ma trận các mesh tĩnh ngoài cửa động / ánh sáng mặt trời / root chính
    const dynamicExcludes = new Set([this.root, this.hqInteriorGroup, this.sunLight, this.hemiLight]);
    for (const l of this.interiorLights) dynamicExcludes.add(l);
    this._freezeStaticSubtree(this.root, dynamicExcludes);
    this.root.matrixAutoUpdate = true;
    if (this.hqInteriorGroup) this.hqInteriorGroup.matrixAutoUpdate = true;
    if (typeof this.root.updateMatrixWorld === 'function') this.root.updateMatrixWorld(true);
  }

  buildLighting() {
    // Tăng nhẹ HemisphereLight (0.96 -> 1.18) để không gian văn phòng châu Âu sáng sang trọng khi giảm từ 6 -> 2 PointLights!
    const hemi = new THREE.HemisphereLight(0xf3f7ff, 0x3b4252, 1.18);
    hemi.position.set(0, 50, 0);
    this.hemiLight = hemi;
    this.root.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff7e8, 1.08);
    sun.position.set(42, 58, 32);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 160;
    const d = 56;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0005;
    this.sunLight = sun;
    this.root.add(sun);

    // Giảm từ 6 PointLights xuống ĐÚNG 2 PointLights chiến lược cố định (bỏ pitchFloodlight dư thừa -> giảm nặng fragment shader iPhone, không recompile shader!)
    this.pitchFloodlight = null;
    this.interiorLights = [];
    [
      [-18, 4.2, -12, 0xfff0d4, 1.12, 46], // Đèn ấm cao cấp Khu Ban Giám Đốc & Phòng Chủ tịch
      [10, 4.2, 10, 0xf2f7ff, 1.05, 48]    // Đèn sáng sang trọng Sảnh Chính & Các Phòng Ban
    ].forEach(([x, y, z, col, int, dist]) => {
      const l = new THREE.PointLight(col, int, dist, 1.3);
      l.position.set(x, y, z);
      this.root.add(l);
      this.interiorLights.push(l);
    });
  }

  updateDayNightCycle(clockHour, weather = 'Quang đãng') {
    if (!this.sunLight || !this.hemiLight || !this.scene) return;
    const h = ((clockHour % 24) + 24) % 24;
    // Tính góc mặt trời theo giờ trong ngày (6h mọc -> 13h đỉnh -> 20h lặn)
    const sunProgress = Math.max(0, Math.min(1, (h - 6) / 14));
    const elevation = Math.sin(sunProgress * Math.PI);
    const isNight = h < 6 || h >= 20;
    const isTwilight = (h >= 6 && h < 7.5) || (h >= 18.2 && h < 20);
    const weatherDim = weather === 'Mưa nhẹ' ? 0.78 : weather === 'Nhiều mây' ? 0.88 : 1.0;

    this.sunLight.position.set(Math.cos(sunProgress * Math.PI) * 58, Math.max(10, elevation * 64), 30);
    if (isNight) {
      this.sunLight.intensity = 0.25;
      this.sunLight.color.setHex(0x88a8e8);
      this.hemiLight.intensity = 0.58;
      this.scene.background.setHex(0x0b152b);
      if (this.scene.fog) this.scene.fog.color.setHex(0x0b152b);
      for (const l of this.interiorLights) l.intensity = 1.32;
    } else if (isTwilight) {
      this.sunLight.intensity = 0.70 * weatherDim;
      this.sunLight.color.setHex(0xffb870);
      this.hemiLight.intensity = 0.90 * weatherDim;
      this.scene.background.setHex(0xd98a5b);
      if (this.scene.fog) this.scene.fog.color.setHex(0xd98a5b);
      for (const l of this.interiorLights) l.intensity = 1.20;
    } else {
      this.sunLight.intensity = (0.88 + elevation * 0.3) * weatherDim;
      this.sunLight.color.setHex(0xfff7e8);
      this.hemiLight.intensity = 1.18 * weatherDim;
      const skyHex = weather === 'Mưa nhẹ' ? 0x64748b : weather === 'Nhiều mây' ? 0x7da2c8 : 0x8bb8e8;
      this.scene.background.setHex(skyHex);
      if (this.scene.fog) this.scene.fog.color.setHex(skyHex);
      for (const l of this.interiorLights) l.intensity = 1.08;
    }
  }

  buildGroundAndRoads() {
    const ground = new THREE.Mesh(
      this._planeGeo(640, 540),
      this._tagShared(new THREE.MeshStandardMaterial({ color: 0x2a5734, roughness: 0.92 }))
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(80, -0.02, -75);
    ground.receiveShadow = true;
    this.root.add(ground);

    const plaza = new THREE.Mesh(
      this._boxGeo(84, 0.05, 68),
      this._tagShared(new THREE.MeshStandardMaterial({ color: 0x262a33, roughness: 0.82 }))
    );
    plaza.position.set(0, 0.0, 18);
    plaza.receiveShadow = true;
    this.root.add(plaza);

    const walkway = new THREE.Mesh(this._boxGeo(12, 0.07, 16), this._walkwayMat);
    walkway.position.set(0, 0.01, 30);
    this.root.add(walkway);

    const gateHouse = new THREE.Mesh(
      this._boxGeo(4.2, 3.1, 3.2),
      this._tagShared(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 }))
    );
    gateHouse.position.set(-14, 1.55, 47);
    this.root.add(gateHouse);
    this.addCollider(-14, 47, 4.2, 3.2);

    const gateArch = new THREE.Mesh(
      this._boxGeo(16, 0.9, 1.1),
      this._tagShared(new THREE.MeshStandardMaterial({ color: 0x00205b, roughness: 0.35, metalness: 0.3 }))
    );
    gateArch.position.set(0, 4.5, 47);
    this.root.add(gateArch);
    const gateSign = new THREE.Mesh(
      this._planeGeo(12, 0.76),
      this._getSignMaterial('CAMPUS PARIS SAINT-GERMAIN · HEADQUARTERS', '#00205b', '#ffffff', '#da291c')
    );
    gateSign.position.set(0, 4.5, 47.58);
    this.root.add(gateSign);
  }

  buildHeadquarters() {
    const floor1 = new THREE.Mesh(
      this._boxGeo(68, 0.14, 44),
      this._tagShared(new THREE.MeshStandardMaterial({ map: this.tex.marbleTexture('#e8e3d9', '#ccc5b8'), roughness: 0.35, metalness: 0.08 }))
    );
    floor1.position.set(0, 0.05, 0);
    floor1.receiveShadow = true;
    this.root.add(floor1);

    const execFloor = new THREE.Mesh(
      this._boxGeo(67.4, 0.04, 19.4),
      this._tagShared(new THREE.MeshStandardMaterial({ map: this.tex.woodTexture('#4a2f21', '#2c1910'), roughness: 0.38, metalness: 0.08 }))
    );
    execFloor.position.set(0, 0.13, -12.2);
    execFloor.receiveShadow = true;
    this.root.add(execFloor);

    // Nhóm vỏ kiến trúc tĩnh Trụ sở (tường, vách kính, khung cửa, viền tầng) để gộp batch thành ~8 draw calls!
    const shellGroup = new THREE.Group();
    this.root.add(shellGroup);
    this._hqShellGroup = shellGroup;
    this._staticShellTarget = shellGroup;

    const solidWallMat = this._solidWallMat;
    const darkTrimMat = this._darkTrimMat;

    // Tường vách ngăn bên trong nằm dưới mái kín -> tắt castShadow để tiết kiệm shadow map trên iPhone!
    const addWall = (x, z, w, d, h = 4.45, mat = solidWallMat) => {
      const m = new THREE.Mesh(this._boxGeo(w, h, d), mat);
      m.position.set(x, h / 2 + 0.1, z);
      m.castShadow = false;
      m.receiveShadow = true;
      shellGroup.add(m);
      this.addCollider(x, z, w, d);
      return m;
    };

    // === 1. NGOẠI THẤT KÍNH CƯỜNG LỰC TRONG SUỐT KHUNG NHÔM ===
    this.addGlassWindow(-26, -22, 16, 0, false);
    this.addGlassWindow(-10, -22, 16, 0, true);
    this.addGlassWindow(0, -22, 4, 0, false);
    this.addWoodenDoor('door_pitch_exit', 3.0, -22, 0, 2.0, true);
    this.addGlassWindow(6, -22, 4, 0, false);
    this.addGlassWindow(21, -22, 26, 0, false);

    this.addGlassWindow(-20, 22, 28, 0, false);
    this.addGlassWindow(-5, 22, 2, 0, false);
    this.addGlassWindow(5, 22, 2, 0, false);
    this.addGlassWindow(20, 22, 28, 0, false);

    this.addGlassWindow(-34, -12, 20, Math.PI / 2, false);
    this.addGlassWindow(-34, 12, 20, Math.PI / 2, false);
    this.addGlassWindow(34, -12, 20, Math.PI / 2, false);
    this.addGlassWindow(34, 12, 20, Math.PI / 2, false);

    // === 2. KHU B: BAN GIÁM ĐỐC (CHỈ 1 CỬA GỖ VÀO PHÒNG CHỦ TỊCH, SẢNH ĐỆM MỞ SANG TRỌNG) ===
    [-18, -2, 8, 17, 25.5].forEach((px) => addWall(px, -12.2, 0.24, 19.6, 4.45, solidWallMat));

    // Cổng vòm sảnh đệm Chủ tịch mở rộng 3.8m tại z = -2.4 (KHÔNG có cửa thứ 2 chắn lối!)
    addWall(-30.9, -2.4, 6.2, 0.24, 4.45, darkTrimMat);
    addWall(-21.1, -2.4, 6.2, 0.24, 4.45, darkTrimMat);
    const archTop = new THREE.Mesh(this._boxGeo(3.8, 1.35, 0.26), darkTrimMat);
    archTop.position.set(-26.0, 3.85, -2.4);
    shellGroup.add(archTop);

    // ĐÚNG 1 CỬA GỖ CAO CẤP duy nhất tại z = -5.5 bước thẳng vào Phòng Chủ tịch!
    addWall(-30.5, -5.5, 7.0, 0.24, 4.45, solidWallMat);
    this.addWoodenDoor('door_president_main', -26.0, -5.5, 0, 2.0, true);
    addWall(-21.5, -5.5, 7.0, 0.24, 4.45, solidWallMat);

    // Phòng Họp, VIP, CEO, VP, GĐ Thể thao (mỗi phòng 1 cửa gỗ riêng mở thẳng ra hành lang chính z = -2.4)
    this.addGlassWindow(-14.5, -2.4, 7.0, 0, true);
    this.addWoodenDoor('door_boardroom', -10.0, -2.4, 0, 2.0, true);
    this.addGlassWindow(-5.5, -2.4, 7.0, 0, true);

    this.addGlassWindow(0, -2.4, 4.0, 0, false);
    this.addWoodenDoor('door_vip', 3.0, -2.4, 0, 1.9, true);
    this.addGlassWindow(6.0, -2.4, 4.0, 0, false);

    this.addGlassWindow(9.8, -2.4, 3.6, 0, false);
    this.addWoodenDoor('door_ceo', 12.5, -2.4, 0, 1.9, true);
    this.addGlassWindow(15.2, -2.4, 3.6, 0, false);

    this.addGlassWindow(18.6, -2.4, 3.2, 0, false);
    this.addWoodenDoor('door_vp', 21.2, -2.4, 0, 1.9, true);
    this.addGlassWindow(23.8, -2.4, 3.2, 0, false);

    this.addGlassWindow(27.1, -2.4, 3.2, 0, false);
    this.addWoodenDoor('door_sporting', 29.7, -2.4, 0, 1.9, true);
    this.addGlassWindow(32.3, -2.4, 3.2, 0, false);

    // === 3. KHU C & KHU D: TÁCH BIỆT HOÀN TOÀN BẰNG HÀNH LANG PHỤ RỘNG 3.2m (z = 10.6..13.8) NỐI THẲNG TỪ SẢNH CHÍNH ===
    addWall(-6, 6.5, 0.24, 8.2, 4.45, solidWallMat);
    addWall(-6, 17.9, 0.24, 8.2, 4.45, solidWallMat);
    addWall(6, 6.5, 0.24, 8.2, 4.45, solidWallMat);
    addWall(6, 17.9, 0.24, 8.2, 4.45, solidWallMat);

    addWall(-20, 6.5, 0.24, 8.2, 4.45, solidWallMat);
    addWall(-20, 17.9, 0.24, 8.2, 4.45, solidWallMat);
    addWall(20, 6.5, 0.24, 8.2, 4.45, solidWallMat);
    addWall(20, 17.9, 0.24, 8.2, 4.45, solidWallMat);

    addWall(-20, 10.6, 28, 0.22, 4.45, solidWallMat);
    addWall(20, 10.6, 28, 0.22, 4.45, solidWallMat);

    // Mặt hành lang chính (z = 2.4) cho 4 phòng Hàng 1
    this.addGlassWindow(-30.9, 2.4, 6.2, 0, false);
    this.addWoodenDoor('door_coach', -26.8, 2.4, 0, 2.0, false);
    this.addGlassWindow(-22.9, 2.4, 5.8, 0, false);

    this.addGlassWindow(-16.9, 2.4, 6.2, 0, false);
    this.addWoodenDoor('door_scouting', -12.8, 2.4, 0, 2.0, false);
    this.addGlassWindow(-8.9, 2.4, 5.8, 0, false);

    this.addGlassWindow(9.1, 2.4, 6.2, 0, true);
    this.addWoodenDoor('door_finance', 13.2, 2.4, 0, 2.0, false);
    this.addGlassWindow(17.1, 2.4, 5.8, 0, true);

    this.addGlassWindow(23.1, 2.4, 6.2, 0, false);
    this.addWoodenDoor('door_media', 27.2, 2.4, 0, 2.0, false);
    this.addGlassWindow(31.1, 2.4, 5.8, 0, false);

    // Mặt hành lang phụ (z = 13.8) cho 4 phòng Hàng 2
    this.addGlassWindow(-30.9, 13.8, 6.2, 0, false);
    this.addWoodenDoor('door_transfers', -26.8, 13.8, 0, 2.0, false);
    this.addGlassWindow(-22.9, 13.8, 5.8, 0, false);

    this.addGlassWindow(-16.9, 13.8, 6.2, 0, false);
    this.addWoodenDoor('door_academy', -12.8, 13.8, 0, 2.0, false);
    this.addGlassWindow(-8.9, 13.8, 5.8, 0, false);

    this.addGlassWindow(9.1, 13.8, 6.2, 0, false);
    this.addWoodenDoor('door_medical', 13.2, 13.8, 0, 2.0, false);
    this.addGlassWindow(17.1, 13.8, 5.8, 0, false);

    this.addGlassWindow(23.1, 13.8, 6.2, 0, false);
    this.addWoodenDoor('door_hr', 27.2, 13.8, 0, 2.0, false);
    this.addGlassWindow(31.1, 13.8, 5.8, 0, false);

    // === 4. NGOẠI THẤT TẦNG 2 ĐẾN TẦNG 8 ===
    const ceiling1 = new THREE.Mesh(this._boxGeo(68.4, 0.35, 44.4), darkTrimMat);
    ceiling1.position.set(0, 4.65, 0);
    shellGroup.add(ceiling1);

    const upperTower = new THREE.Mesh(
      this._boxGeo(68.2, 27.2, 44.2),
      this._tagShared(new THREE.MeshStandardMaterial({ color: 0x0f2544, roughness: 0.16, metalness: 0.72 }))
    );
    upperTower.position.set(0, 18.4, 0);
    upperTower.castShadow = true;
    shellGroup.add(upperTower);

    const bandGeo = this._boxGeo(68.8, 0.32, 44.8);
    for (let fl = 2; fl <= 8; fl++) {
      const band = new THREE.Mesh(bandGeo, this.furn.mats.aluminum);
      band.position.set(0, 4.65 + (fl - 1) * 3.88, 0);
      shellGroup.add(band);
    }

    const facadeSign = new THREE.Mesh(
      this._planeGeo(30, 3.6),
      this._getSignMaterial('PARIS SAINT-GERMAIN · EUROPEAN HEADQUARTERS', '#00205b', '#ffffff', '#da291c')
    );
    facadeSign.position.set(0, 29.6, 22.25);
    shellGroup.add(facadeSign);

    // Kết thúc xây vỏ kiến trúc HQ -> gộp toàn bộ mesh tĩnh của shellGroup
    this._staticShellTarget = null;
    this._batchStaticGroup(shellGroup, { replaceInteractables: false });

    const ledGeo = this._tagShared(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 10));
    const ledMat = this._tagShared(new THREE.MeshBasicMaterial({ color: 0xfff8e7 }));
    const ledInst = new THREE.InstancedMesh(ledGeo, ledMat, 48);
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let gx = -28; gx <= 28; gx += 8) {
      for (let gz = -16; gz <= 16; gz += 6.4) {
        if (idx >= 48) break;
        dummy.position.set(gx, 4.44, gz);
        dummy.updateMatrix();
        ledInst.setMatrixAt(idx++, dummy.matrix);
      }
    }
    this.root.add(ledInst);

    this.addRoomLabel('← KHU B: BAN GIÁM ĐỐC · PHÒNG CHỦ TỊCH', -14, 0, Math.PI / 2, true);
    this.addRoomLabel('KHU D: HÀNH CHÍNH & KỸ THUẬT →', 14, 0, -Math.PI / 2, true);
    this.addRoomLabel('← HÀNH LANG CHUYỂN NHƯỢNG & HỌC VIỆN', -6.3, 12.2, Math.PI / 2, true);
    this.addRoomLabel('HÀNH LANG KỸ THUẬT & NHÂN SỰ →', 6.3, 12.2, -Math.PI / 2, true);

    // Gom toàn bộ nội thất chi tiết bên trong Trụ sở vào 1 nhóm riêng để tự động culling khi Chủ tịch sang SVĐ Parc des Princes!
    this.hqInteriorGroup = new THREE.Group();
    this.root.add(this.hqInteriorGroup);
    const savedRoot = this.root;
    this.root = this.hqInteriorGroup;
    this.furnishZoneA_Lobby();
    this.furnishZoneB_ExecutiveSuite();
    this.furnishZoneC_FootballOps();
    this.furnishZoneD_Corporate();
    this.root = savedRoot;

    // Gộp tĩnh toàn bộ nội thất HQ theo vật liệu (giảm ~2,800+ draw calls -> ~25 draw calls, giữ nguyên raycast tương tác qua hit proxy 0-draw-call!)
    this._batchStaticGroup(this.hqInteriorGroup, { replaceInteractables: true });
  }

  addRoomLabel(text, x, z, rotY = 0, isCorridorBanner = false) {
    const w = isCorridorBanner ? 3.4 : 1.55;
    const h = isCorridorBanner ? 0.56 : 0.38;
    const y = isCorridorBanner ? 3.45 : 1.68;
    const sign = new THREE.Mesh(
      this._planeGeo(w, h),
      this._getSignMaterial(text, '#0f172a', '#f8fafc', '#da291c')
    );
    sign.position.set(x, y, z);
    sign.rotation.y = rotY;
    this.root.add(sign);
  }

  furnishZoneA_Lobby() {
    this.roomWaypoints.lobby = { x: 0, z: 16.0 };
    this.addRoomLabel('SẢNH CHÍNH · PARIS SAINT-GERMAIN', 0, 21.6, Math.PI, true);

    const counter = new THREE.Mesh(this._boxGeo(5.2, 1.12, 1.1), this.furn.mats.walnut);
    counter.position.set(0, 0.68, 8.2);
    counter.receiveShadow = true;
    this.root.add(counter);
    this.addCollider(0, 8.2, 5.2, 1.1);

    const pc1 = this.furn.createComputerSet('LỄ TÂN PSG');
    pc1.position.set(-1.1, 1.24, 8.1);
    this.root.add(pc1);
    const pc2 = this.furn.createComputerSet('ĐÓN TIẾP VIP');
    pc2.position.set(1.1, 1.24, 8.1);
    this.root.add(pc2);

    const recChair = this.furn.createSwivelChair(false);
    recChair.position.set(0, 0.14, 7.0);
    recChair.rotation.y = Math.PI;
    this.root.add(recChair);
    this.registerChairPosition(0, 7.0, 0.14);

    const bigCrest = new THREE.Mesh(
      this._tagShared(new THREE.CircleGeometry(1.45, 28)),
      this._crestMat
    );
    bigCrest.position.set(5.84, 2.45, 6.5);
    bigCrest.rotation.y = -Math.PI / 2;
    this.root.add(bigCrest);

    const infoScr = this.furn.createWallScreen(3.4, 1.75, 'PARC DES PRINCES · WELCOME');
    infoScr.position.set(-5.78, 2.35, 6.5);
    infoScr.rotation.y = Math.PI / 2;
    this.root.add(infoScr);

    const LobbyMatCtor = typeof THREE.MeshBasicMaterial === 'function' ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
    this.lobbyTvOverlay = new THREE.Mesh(
      this._planeGeo(3.2, 1.55),
      new LobbyMatCtor({ map: this.tex.signTexture('PARC DES PRINCES · WELCOME', '#00205b', '#fde68a', '#da291c') })
    );
    this.lobbyTvOverlay.position.set(-5.70, 2.35, 6.5);
    this.lobbyTvOverlay.rotation.y = Math.PI / 2;
    this.lobbyTvOverlay.userData.dynamicObject = true;
    this.root.add(this.lobbyTvOverlay);

    const trophy = this.furn.createTrophyCabinet();
    trophy.position.set(-5.2, 0.14, 17.5);
    trophy.rotation.y = Math.PI / 2;
    this.root.add(trophy);
    this.addCollider(-5.2, 17.5, 0.6, 2.25);
    this.tagInteractable(trophy, 'lobby_trophy', 'Mở Bảo Tàng Danh Hiệu & Lịch Sử PSG', '🏆', 'open_museum_ui');

    const sofa = this.furn.createSofa(3.0);
    sofa.position.set(4.9, 0.14, 17.5);
    sofa.rotation.y = -Math.PI / 2;
    this.root.add(sofa);
    this.addCollider(4.9, 17.5, 0.9, 3.0);
    this.addSeat(sofa, 'seat_lobby_vip', 'Sofa Sảnh Chính', 4.6, 17.5, Math.PI / 2, 3.3, 17.5);

    const coffee = this.furn.createCoffeeTable(1.6, 0.8);
    coffee.position.set(3.2, 0.14, 17.5);
    coffee.rotation.y = Math.PI / 2;
    this.root.add(coffee);
    this.addCollider(3.2, 17.5, 0.85, 1.6);

    [[-5.0, 20.8], [5.0, 20.8]].forEach(([px, pz]) => {
      const p = this.furn.createPottedPlant(1.2);
      p.position.set(px, 0.14, pz);
      this.root.add(p);
      this.addCollider(px, pz, 0.7, 0.7);
    });
  }

  furnishZoneB_ExecutiveSuite() {
    this.roomWaypoints.president = { x: -26.0, z: -11.5 };
    this.addRoomLabel('SẢNH ĐỆM CHỦ TỊCH', -23.1, -2.24, 0);
    this.addRoomLabel('PHÒNG CHỦ TỊCH · PHẠM MINH CHIÊU', -24.15, -5.34, 0);

    const presDesk = this.furn.createExecutiveDesk(3.4, 1.32, true);
    presDesk.position.set(-26.0, 0.14, -16.8);
    presDesk.rotation.y = Math.PI;
    this.root.add(presDesk);
    this.addCollider(-26.0, -16.8, 3.4, 1.32);

    // Gắn hit-proxy riêng cho Máy tính Mac ở trung tâm bàn Chủ tịch (không bao trùm 2 cánh bàn nơi đặt 6 chồng hồ sơ & Khay Đỏ URGENT)
    const presPcProxy = new THREE.Mesh(this._boxGeo(0.78, 0.58, 0.52), this._hitProxyMat);
    presPcProxy.position.set(-26.0, 1.21, -16.75);
    presPcProxy.userData.dynamicObject = true;
    this.root.add(presPcProxy);
    this.tagInteractable(presPcProxy, 'pres_pc', 'Mở Máy tính macOS Chủ tịch', '💻', 'open_computer');

    this.deskDocuments = new OfficeDeskDocuments3D(this);
    this.root.add(this.deskDocuments.group);

    const presChair = this.furn.createSwivelChair(true);
    presChair.position.set(-26.0, 0.14, -18.0);
    presChair.rotation.y = Math.PI;
    this.root.add(presChair);
    this.addSeat(presChair, 'seat_president', 'Ghế Da Chủ tịch', -26.0, -18.0, Math.PI, -26.0, -19.2);

    [-27.1, -24.9].forEach((gx, i) => {
      const gc = this.furn.createSwivelChair(false);
      gc.position.set(gx, 0.14, -15.2);
      this.root.add(gc);
      this.addSeat(gc, `seat_pres_guest_${i}`, 'Ghế đối diện bàn Chủ tịch', gx, -15.2, 0, gx, -14.0);
    });

    const presSofa = this.furn.createSofa(3.2);
    presSofa.position.set(-19.5, 0.14, -10.5);
    presSofa.rotation.y = -Math.PI / 2;
    this.root.add(presSofa);
    this.addCollider(-19.5, -10.5, 0.9, 3.2);
    this.addSeat(presSofa, 'seat_pres_sofa', 'Sofa Phòng Chủ tịch', -19.8, -10.5, Math.PI / 2, -21.2, -10.5);

    const presCoffee = this.furn.createCoffeeTable(1.7, 0.85);
    presCoffee.position.set(-21.6, 0.14, -10.5);
    presCoffee.rotation.y = Math.PI / 2;
    this.root.add(presCoffee);
    this.addCollider(-21.6, -10.5, 0.9, 1.7);

    const cab = this.furn.createFilingCabinet(2.0, 2.2, 0.50);
    cab.position.set(-18.5, 0.14, -17.5);
    cab.rotation.y = -Math.PI / 2;
    this.root.add(cab);
    this.addCollider(-18.5, -17.5, 0.55, 2.05);
    this.tagInteractable(cab, 'pres_cabinet', 'Tủ Hồ Sơ & Báo Cáo Chủ tịch', '📂', 'open_reports');

    const pTrophy = this.furn.createTrophyCabinet();
    pTrophy.position.set(-18.5, 0.14, -14.2);
    pTrophy.rotation.y = -Math.PI / 2;
    this.root.add(pTrophy);
    this.addCollider(-18.5, -14.2, 0.6, 2.25);
    this.tagInteractable(pTrophy, 'pres_trophy', 'Kệ Danh Hiệu Phòng Chủ tịch · Bảo Tàng PSG', '🏆', 'open_museum_ui');

    // TV Truyền thông màn hình lớn 3D thực tế trong Phòng Chủ tịch (bật/tắt độc lập, chuyển 9 kênh + PSG Morning News)
    const tvGroup = new THREE.Group();
    tvGroup.position.set(-18.22, 2.38, -10.5);
    tvGroup.rotation.y = -Math.PI / 2;
    tvGroup.userData.dynamicObject = true;

    const bezelMat = this._tagShared(new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.28, metalness: 0.65 }));
    const trimGoldMat = this._tagShared(new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 }));
    const tvFrame = new THREE.Mesh(this._boxGeo(3.68, 2.02, 0.11), bezelMat);
    const tvGoldTrim = new THREE.Mesh(this._boxGeo(3.72, 0.04, 0.12), trimGoldMat);
    tvGoldTrim.position.set(0, -1.03, 0);
    const soundBar = new THREE.Mesh(this._boxGeo(2.5, 0.14, 0.16), bezelMat);
    soundBar.position.set(0, -1.24, 0.06);

    this.presidentTvLedMat = new (typeof THREE.MeshBasicMaterial === 'function' ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial)({
      color: 0x22c55e
    });
    const ledDot = new THREE.Mesh(this._boxGeo(0.08, 0.04, 0.03), this.presidentTvLedMat);
    ledDot.position.set(1.56, -0.96, 0.06);

    const TvMatCtor = typeof THREE.MeshBasicMaterial === 'function' ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
    let tvCanvas = null;
    let tvTex = null;
    if (typeof document !== 'undefined' && typeof THREE.CanvasTexture === 'function') {
      tvCanvas = document.createElement('canvas');
      tvCanvas.width = 512;
      tvCanvas.height = 256;
      const ctx = tvCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#04060a';
        ctx.fillRect(0, 0, 512, 256);
      }
      tvTex = new THREE.CanvasTexture(tvCanvas);
      tvTex.generateMipmaps = false;
      if (typeof THREE.LinearFilter !== 'undefined') tvTex.minFilter = THREE.LinearFilter;
    }
    this._presidentTvCanvas = tvCanvas;
    this._presidentTvCtx = tvCanvas ? tvCanvas.getContext('2d') : null;
    this._presidentTvTex = tvTex;
    this._presidentTvTimer = 0;
    this._presidentTvLastSig = '';

    this.presidentTvOverlay = new THREE.Mesh(
      this._planeGeo(3.46, 1.80),
      new TvMatCtor(tvTex ? { map: tvTex } : { color: 0x04060a })
    );
    this.presidentTvOverlay.position.set(0, 0, 0.065);
    this.presidentTvOverlay.userData.dynamicObject = true;

    tvGroup.add(tvFrame, tvGoldTrim, soundBar, ledDot, this.presidentTvOverlay);
    this.root.add(tvGroup);
    this.tagInteractable(tvGroup, 'pres_media_tv', 'Bật / Xem TV Truyền Thông PSG (9 Kênh)', '📺', 'open_president_tv');

    const pCrest = new THREE.Mesh(
      this._tagShared(new THREE.CircleGeometry(0.85, 28)),
      this._crestMat
    );
    pCrest.position.set(-18.22, 2.55, -7.2);
    pCrest.rotation.y = -Math.PI / 2;
    this.root.add(pCrest);

    const jersey = this.furn.createFramedJersey('10');
    jersey.position.set(-22.2, 2.3, -5.66);
    jersey.rotation.y = Math.PI;
    this.root.add(jersey);

    const clock = this.furn.createWallClock();
    clock.position.set(-29.8, 2.8, -5.66);
    clock.rotation.y = Math.PI;
    this.root.add(clock);

    [[-32.5, -20.5], [-19.2, -20.5], [-29.0, -3.9], [-23.0, -3.9]].forEach(([px, pz]) => {
      const pl = this.furn.createPottedPlant(1.1);
      pl.position.set(px, 0.14, pz);
      this.root.add(pl);
      this.addCollider(px, pz, 0.7, 0.7);
    });

    // B2. Phòng Họp Ban Giám Đốc
    this.roomWaypoints.boardroom = { x: -10.0, z: -6.5 };
    this.addRoomLabel('PHÒNG HỌP BAN GIÁM ĐỐC', -8.15, -2.24, 0);

    const bTable = this.furn.createConferenceTable(8.0, 2.25);
    bTable.position.set(-10.0, 0.14, -12.5);
    this.root.add(bTable);
    this.addCollider(-10.0, -12.5, 8.0, 2.25);
    this.tagInteractable(bTable, 'boardroom_meeting', 'Triệu tập Họp Ban Lãnh Đạo', '🏛️', 'open_board_meeting');

    const headChair = this.furn.createSwivelChair(true);
    headChair.position.set(-14.9, 0.14, -12.5);
    headChair.rotation.y = Math.PI / 2;
    this.root.add(headChair);
    this.addSeat(headChair, 'seat_board_head', 'Ghế Chủ tọa Phòng Họp', -14.9, -12.5, -Math.PI / 2, -16.1, -12.5);

    for (let i = 0; i < 5; i++) {
      const sx = -13.0 + i * 1.55;
      const cN = this.furn.createSwivelChair(false);
      cN.position.set(sx, 0.14, -14.25);
      cN.rotation.y = Math.PI;
      this.root.add(cN);
      this.registerChairPosition(sx, -14.25, 0.14);
      this.boardroomSeats.push({ x: sx, z: -14.25, rotY: 0 });

      const cS = this.furn.createSwivelChair(false);
      cS.position.set(sx, 0.14, -10.75);
      this.root.add(cS);
      this.registerChairPosition(sx, -10.75, 0.14);
      this.boardroomSeats.push({ x: sx, z: -10.75, rotY: Math.PI });
      if (i === 2) this.addSeat(cS, 'seat_board_mid', 'Ghế Phòng Họp', sx, -10.75, 0, sx, -9.4);
    }

    const bScr = this.furn.createWallScreen(4.4, 2.1, 'HỌP BAN GIÁM ĐỐC PSG');
    bScr.position.set(-2.22, 2.35, -12.5);
    bScr.rotation.y = -Math.PI / 2;
    this.root.add(bScr);

    // B3. Phòng Tiếp Khách VIP
    this.roomWaypoints.vip = { x: 3.0, z: -7.5 };
    this.addRoomLabel('PHÒNG TIẾP KHÁCH VIP', 4.85, -2.24, 0);
    const vipSofa1 = this.furn.createSofa(3.0);
    vipSofa1.position.set(0.2, 0.14, -12.5);
    vipSofa1.rotation.y = Math.PI / 2;
    this.root.add(vipSofa1);
    this.addCollider(0.2, -12.5, 0.9, 3.0);
    this.addSeat(vipSofa1, 'seat_vip_lounge', 'Sofa Phòng Khách VIP', 0.5, -12.5, -Math.PI / 2, 1.8, -12.5);

    const vipSofa2 = this.furn.createSofa(3.0);
    vipSofa2.position.set(5.8, 0.14, -12.5);
    vipSofa2.rotation.y = -Math.PI / 2;
    this.root.add(vipSofa2);
    this.addCollider(5.8, -12.5, 0.9, 3.0);
    const vipCoffee = this.furn.createCoffeeTable(1.8, 0.95);
    vipCoffee.position.set(3.0, 0.14, -12.5);
    this.root.add(vipCoffee);
    this.addCollider(3.0, -12.5, 1.8, 0.95);

    // B4-B6. CEO, VP, GĐ Thể thao
    const execs = [
      { id: 'ceo', label: 'PHÒNG TỔNG GIÁM ĐỐC (CEO)', x: 12.5, deskZ: -15.5, hasRound: false },
      { id: 'vp', label: 'PHÒNG PHÓ CHỦ TỊCH', x: 21.2, deskZ: -14.8, hasRound: false },
      { id: 'sporting', label: 'PHÒNG GIÁM ĐỐC THỂ THAO', x: 29.7, deskZ: -15.5, hasRound: true }
    ];
    execs.forEach((e) => {
      this.roomWaypoints[e.id] = { x: e.x, z: -7.5 };
      this.addRoomLabel(e.label, e.x + 1.85, -2.24, 0);

      const dsk = this.furn.createExecutiveDesk(2.5, 1.12, false);
      dsk.position.set(e.x, 0.14, e.deskZ);
      dsk.rotation.y = Math.PI;
      this.root.add(dsk);
      this.addCollider(e.x, e.deskZ, 2.5, 1.12);
      this.tagInteractable(dsk, `desk_${e.id}`, `Máy tính (${e.label})`, '💻', 'open_computer');

      const ch = this.furn.createSwivelChair(true);
      ch.position.set(e.x, 0.14, e.deskZ - 1.1);
      ch.rotation.y = Math.PI;
      this.root.add(ch);
      this.addSeat(ch, `seat_${e.id}`, `Ghế ${e.label}`, e.x, e.deskZ - 1.1, Math.PI, e.x, e.deskZ - 2.1);

      if (e.hasRound) {
        const rt = this.furn.createRoundMeetingTable(1.0);
        rt.position.set(e.x, 0.14, -9.2);
        this.root.add(rt);
        this.addCollider(e.x, -9.2, 2.0, 2.0);
      } else {
        const sf = this.furn.createSofa(2.2);
        sf.position.set(e.x + 1.8, 0.14, -9.2);
        sf.rotation.y = -Math.PI / 2;
        this.root.add(sf);
        this.addCollider(e.x + 1.8, -9.2, 0.9, 2.2);
      }

      const cabE = this.furn.createFilingCabinet(1.5, 2.0, 0.44);
      cabE.position.set(e.x - 3.6, 0.14, -12.5);
      cabE.rotation.y = Math.PI / 2;
      this.root.add(cabE);
      this.addCollider(e.x - 3.6, -12.5, 0.5, 1.55);
    });
  }

  // Phòng ban độc lập rộng 14m x 8.2m (cửa gỗ mở trực tiếp ra hành lang, không đi xuyên phòng nào!)
  furnishLargeDepartment(cfg) {
    const { id, label, cx, cz, signZ, screenTitle, hasTactical = false, hasPrinter = false } = cfg;
    this.roomWaypoints[id] = { x: cx, z: cz - 2.5 };
    this.addRoomLabel(label, cx - 1.85, signZ - 0.30, Math.PI);

    // 1. Bàn Trưởng phòng
    const headDesk = this.furn.createExecutiveDesk(2.2, 1.0, false);
    headDesk.position.set(cx + 3.8, 0.14, cz - 0.8);
    this.root.add(headDesk);
    this.addCollider(cx + 3.8, cz - 0.8, 2.2, 1.0);
    this.tagInteractable(headDesk, `desk_${id}`, `Máy tính (${label})`, '💻', 'open_computer');

    const headChair = this.furn.createSwivelChair(true);
    headChair.position.set(cx + 3.8, 0.14, cz + 0.15);
    this.root.add(headChair);
    this.addSeat(headChair, `seat_${id}_head`, `Ghế Trưởng ${label}`, cx + 3.8, cz + 0.15, 0, cx + 3.8, cz + 1.15);

    // 2. Cụm 4 bàn làm việc nhân viên rộng thoáng
    const offsets = [[-3.8, -1.2], [-1.2, -1.2], [-3.8, 1.7], [-1.2, 1.7]];
    offsets.forEach(([ox, oz], idx) => {
      const sd = this.furn.createStaffDesk(screenTitle);
      sd.position.set(cx + ox, 0.14, cz + oz);
      this.root.add(sd);
      this.addCollider(cx + ox, cz + oz, 1.65, 0.82);

      const sc = this.furn.createSwivelChair(false);
      sc.position.set(cx + ox, 0.14, cz + oz + 0.85);
      this.root.add(sc);
      this.registerChairPosition(cx + ox, cz + oz + 0.85, 0.14);
      if (idx === 0) this.addSeat(sc, `seat_${id}_staff`, `Ghế nhân viên ${label}`, cx + ox, cz + oz + 0.85, 0, cx + ox, cz + oz + 1.65);
    });

    // 3. Bàn họp nhóm tròn
    const huddle = this.furn.createRoundMeetingTable(0.85);
    huddle.position.set(cx + 3.8, 0.14, cz + 2.35);
    this.root.add(huddle);
    this.addCollider(cx + 3.8, cz + 2.35, 1.7, 1.7);

    // 4. Tủ hồ sơ + Màn hình / Bảng chiến thuật / Máy in
    const cab = this.furn.createFilingCabinet(1.5, 1.9, 0.44);
    cab.position.set(cx + 6.4, 0.14, cz);
    cab.rotation.y = -Math.PI / 2;
    this.root.add(cab);
    this.addCollider(cx + 6.4, cz, 0.5, 1.55);

    if (hasTactical) {
      const tb = this.furn.createTacticalBoard();
      tb.position.set(cx + 6.65, 2.05, cz - 2.1);
      tb.rotation.y = -Math.PI / 2;
      this.root.add(tb);
      this.tagInteractable(tb, 'tactical_board', 'Xem Bảng Chiến Thuật Đội Hình', '📋', 'open_tactics');
    } else {
      const scr = this.furn.createWallScreen(2.5, 1.4, screenTitle);
      scr.position.set(cx + 6.65, 2.15, cz - 2.0);
      scr.rotation.y = -Math.PI / 2;
      this.root.add(scr);
    }

    if (hasPrinter) {
      const pr = this.furn.createPrinterStation();
      pr.position.set(cx + 6.3, 0.14, cz + 2.2);
      pr.rotation.y = -Math.PI / 2;
      this.root.add(pr);
      this.addCollider(cx + 6.3, cz + 2.2, 0.65, 0.95);
    }
  }

  furnishZoneC_FootballOps() {
    this.furnishLargeDepartment({ id: 'coach', label: 'BAN HUẤN LUYỆN & HLV TRƯỞNG', cx: -27, cz: 6.5, signZ: 2.56, screenTitle: 'PSG TACTICAL ROOM', hasTactical: true });
    this.furnishLargeDepartment({ id: 'scouting', label: 'PHÒNG TUYỂN TRẠCH & VIDEO', cx: -13, cz: 6.5, signZ: 2.56, screenTitle: 'SCOUTING VIDEO LAB' });
    this.furnishLargeDepartment({ id: 'transfers', label: 'PHÒNG CHUYỂN NHƯỢNG', cx: -27, cz: 17.9, signZ: 13.96, screenTitle: 'GLOBAL TRANSFER DESK' });
    this.furnishLargeDepartment({ id: 'academy', label: 'QUẢN LÝ CẦU THỦ & HỌC VIỆN', cx: -13, cz: 17.9, signZ: 13.96, screenTitle: 'PSG ACADEMY & CARE' });
  }

  furnishZoneD_Corporate() {
    this.furnishLargeDepartment({ id: 'finance', label: 'PHÒNG TÀI CHÍNH & PHÁP CHẾ', cx: 13, cz: 6.5, signZ: 2.56, screenTitle: 'FINANCE & FFP MONITOR', hasPrinter: true });
    this.furnishLargeDepartment({ id: 'media', label: 'TRUYỀN THÔNG & MARKETING', cx: 27, cz: 6.5, signZ: 2.56, screenTitle: 'PSG MEDIA & BRAND' });
    this.furnishLargeDepartment({ id: 'hr', label: 'NHÂN SỰ & QUẢN LÝ CSVC', cx: 27, cz: 17.9, signZ: 13.96, screenTitle: 'HR & STADIUM OPS', hasPrinter: true });

    // Phòng Kỹ Thuật PSG (cải tạo từ phòng Y tế cũ, cửa mở ra hành lang phụ z = 13.8 — Trung tâm Y tế đã chuyển sang Training Center!)
    this.roomWaypoints.technical = { x: 13.0, z: 16.5 };
    this.addRoomLabel('PHÒNG KỸ THUẬT PSG · TECHNICAL DEPT', 11.35, 13.66, Math.PI);

    const techTable = this.furn.createConferenceTable(3.8, 1.5);
    techTable.position.set(13.0, 0.14, 18.2);
    this.root.add(techTable);
    this.addCollider(13.0, 18.2, 3.8, 1.5);
    this.tagInteractable(techTable, 'tech_dept_table', 'Mở Phòng Kỹ Thuật PSG (Phân tích · Định giá · Chiến thuật)', '📊', 'open_technical');

    // 2 Bàn Phân tích Chiến thuật & Hiệu suất (khớp chair cho tactical_analyst / npc_scout2 & performance_analyst)
    const anDeskE = this.furn.createStaffDesk('SCOUTING & TACTICS');
    anDeskE.position.set(17.5, 0.14, 16.4);
    this.root.add(anDeskE);
    this.addCollider(17.5, 16.4, 1.65, 0.82);
    this.tagInteractable(anDeskE, 'tech_desk_east', 'Phân tích Tuyển trạch & Định giá Cầu thủ', '🔍', 'open_technical');
    const anChairE = this.furn.createSwivelChair(false);
    anChairE.position.set(17.5, 0.14, 18.0);
    this.root.add(anChairE);
    this.registerChairPosition(17.5, 18.0, 0.14);

    const anDeskW = this.furn.createStaffDesk('PERFORMANCE ANALYTICS');
    anDeskW.position.set(8.5, 0.14, 16.4);
    this.root.add(anDeskW);
    this.addCollider(8.5, 16.4, 1.65, 0.82);
    this.tagInteractable(anDeskW, 'tech_desk_west', 'Phân tích Dữ liệu & Chiến thuật Đội hình', '💻', 'open_technical');
    const anChairW = this.furn.createSwivelChair(false);
    anChairW.position.set(8.5, 0.14, 18.0);
    this.root.add(anChairW);
    this.registerChairPosition(8.5, 18.0, 0.14);

    // Màn hình phân tích sơ đồ đội hình & tủ hồ sơ kỹ thuật
    const techScreen = this.furn.createWallScreen(4.0, 1.9, 'PSG TECHNICAL · TACTICS & VALUATION');
    techScreen.position.set(13.0, 2.25, 21.75);
    techScreen.rotation.y = Math.PI;
    this.root.add(techScreen);
    this.tagInteractable(techScreen, 'tech_dept_screen', 'Mở Sơ Đồ Chiến Thuật & Phòng Kỹ Thuật', '🖥️', 'open_technical');

    const techCab = this.furn.createFilingCabinet(1.6, 2.0, 0.48);
    techCab.position.set(19.2, 0.14, 20.0);
    techCab.rotation.y = -Math.PI / 2;
    this.root.add(techCab);
    this.addCollider(19.2, 20.0, 0.55, 1.65);
    this.tagInteractable(techCab, 'tech_dept_cabinet', 'Hồ sơ Kỹ thuật & Tuyển trạch PSG', '📂', 'open_technical');
  }

  // Trục công viên cảnh quan xanh kết nối Trụ sở & Bảo tàng thẳng tới SVĐ Parc des Princes!
  buildNorthParkway() {
    const mainPath = new THREE.Mesh(this._boxGeo(9.0, 0.07, 42), this._walkwayMat);
    mainPath.position.set(0, 0.015, -42);
    mainPath.receiveShadow = true;
    this.root.add(mainPath);
  }

  buildParkingAndVehicles() {
    const presCar = this.vehicles.createLuxuryCar(0x0b0e14);
    presCar.position.set(-10.5, 0.03, 31.5);
    presCar.rotation.y = Math.PI / 2;
    this.root.add(presCar);
    this.addCollider(-10.5, 31.5, 4.9, 2.1);
    this.tagInteractable(presCar, 'pres_car', 'Di chuyển nhanh trong khuôn viên PSG', '🚘', 'open_fast_travel');

    const dirCar = this.vehicles.createLuxuryCar(0x1e293b);
    dirCar.position.set(-20.5, 0.03, 36.5);
    dirCar.rotation.y = Math.PI;
    this.root.add(dirCar);
    this.addCollider(-20.5, 36.5, 2.1, 4.9);

    this.roomWaypoints.parking = { x: 0, z: 29 };
  }

  buildLandscapingInstanced() {
    const positions = [
      [-40, 26], [-40, 36], [40, 26], [40, 36],
      [-38, -26], [38, -26], [-32, -60], [0, -61], [32, -60]
    ];
    const trunks = new THREE.InstancedMesh(
      this._tagShared(new THREE.CylinderGeometry(0.22, 0.34, 2.8, 8)),
      this._tagShared(new THREE.MeshStandardMaterial({ color: 0x4d3423, roughness: 0.9 })),
      positions.length
    );
    const crowns = new THREE.InstancedMesh(
      this._tagShared(new THREE.DodecahedronGeometry(1.9, 1)),
      this._tagShared(new THREE.MeshStandardMaterial({ color: 0x265c34, roughness: 0.8 })),
      positions.length
    );
    const dummy = new THREE.Object3D();
    positions.forEach(([x, z], i) => {
      dummy.position.set(x, 1.4, z); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      this.addCollider(x, z, 0.8, 0.8);
      dummy.position.set(x, 3.6, z); dummy.scale.set(1.08, 1.05, 1.08); dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
    });
    this.root.add(trunks, crowns);
  }

  isNearPresidentOffice(pos) {
    if (!pos || this.hqInteriorGroup?.visible === false) return false;
    return pos.x >= -36.5 && pos.x <= -15.0 && pos.z >= -24.5 && pos.z <= -2.0;
  }

  updatePresidentTvVisual(tvSystem, dt = 0, animTime = 0, playerPos = null) {
    if (!tvSystem || !this._presidentTvCtx || !this._presidentTvTex) return;

    const isOn = !!tvSystem.isOn;
    if (this.presidentTvLedMat) {
      this.presidentTvLedMat.color.setHex(isOn ? 0x22c55e : 0xef4444);
    }

    const sig = `${isOn ? 1 : 0}_${tvSystem.activeChannelId}_${tvSystem.programMode}_${tvSystem.channelSwitchPulse > 0 ? 1 : 0}`;
    const stateChanged = sig !== this._presidentTvLastSig;

    // Khi tắt, vẽ đúng 1 lần màu đen rồi ngưng toàn bộ render canvas!
    if (!isOn) {
      if (stateChanged) {
        this._presidentTvLastSig = sig;
        tvSystem.renderScreenCanvas(this._presidentTvCtx, 512, 256, animTime);
        this._presidentTvTex.needsUpdate = true;
      }
      return;
    }

    // Chỉ cập nhật texture động khi Chủ tịch đang ở trong / gần Phòng Chủ tịch!
    if (playerPos && !this.isNearPresidentOffice(playerPos) && !stateChanged) {
      return;
    }

    this._presidentTvTimer += dt;
    if (stateChanged || this._presidentTvTimer >= 0.14) {
      this._presidentTvTimer = 0;
      this._presidentTvLastSig = sig;
      tvSystem.renderScreenCanvas(this._presidentTvCtx, 512, 256, animTime);
      this._presidentTvTex.needsUpdate = true;
    }
  }

  updateBroadcastTv(broadcast = null) {
    const title = broadcast?.title || 'PSG PRESIDENT COMMAND CENTER · PARIS SAINT-GERMAIN';
    const sub = broadcast?.subtitle || 'PARC DES PRINCES · WELCOME';
    if (this.lobbyTvOverlay && this.lobbyTvOverlay.material && this.tex?.signTexture) {
      const oldMap = this.lobbyTvOverlay.material.map;
      const nextMap = this.tex.signTexture(broadcast ? `${title} · ${sub}` : sub, '#00205b', '#fde68a', '#da291c');
      if (oldMap && oldMap !== nextMap && typeof oldMap.dispose === 'function' && !oldMap.userData?.sharedAsset) {
        oldMap.dispose();
      }
      this.lobbyTvOverlay.material.map = nextMap;
      this.lobbyTvOverlay.material.needsUpdate = true;
    }
    this._presidentTvLastSig = '';
  }
}
