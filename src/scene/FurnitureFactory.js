// src/scene/FurnitureFactory.js
// Nội thất 3D chuẩn European Executive Office: tối ưu cho iPhone WebGL với shared geometry/material pool,
// kính MeshStandardMaterial hiệu năng cao, gộp mesh tĩnh theo vật liệu (prototype merging) và giữ trọn độ sang trọng.

export class FurnitureFactory {
  constructor(texFactory) {
    this.tex = texFactory;
    this._geoCache = new Map();
    this._matCache = new Map();
    this._protoCache = new Map();

    const tag = (obj) => this._tagShared(obj);

    this.mats = {
      walnut: tag(new THREE.MeshStandardMaterial({ map: texFactory.woodTexture('#4a2d20', '#2b1810'), roughness: 0.42, metalness: 0.08 })),
      darkWood: tag(new THREE.MeshStandardMaterial({ map: texFactory.woodTexture('#2e1c14', '#1a0f0a'), roughness: 0.48, metalness: 0.06 })),
      oakLight: tag(new THREE.MeshStandardMaterial({ map: texFactory.woodTexture('#8c6b4f', '#6b4e35'), roughness: 0.46, metalness: 0.04 })),
      leatherDark: tag(new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.36, metalness: 0.12 })),
      leatherNavy: tag(new THREE.MeshStandardMaterial({ color: 0x0d2142, roughness: 0.4, metalness: 0.1 })),
      fabricGrey: tag(new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.72, metalness: 0.04 })),
      curtainGrey: tag(new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85, metalness: 0.02 })),
      fabricCream: tag(new THREE.MeshStandardMaterial({ color: 0xe8e2d5, roughness: 0.85, metalness: 0.02 })),
      chrome: tag(new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.2, metalness: 0.88 })),
      aluminum: tag(new THREE.MeshStandardMaterial({ color: 0x262f3d, roughness: 0.32, metalness: 0.78 })),
      gold: tag(new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.22, metalness: 0.92 })),
      matteBlack: tag(new THREE.MeshStandardMaterial({ color: 0x161920, roughness: 0.65, metalness: 0.25 })),
      // Kính cường lực trong suốt tối ưu GPU mobile (MeshStandardMaterial thay cho MeshPhysicalMaterial)
      glass: tag(new THREE.MeshStandardMaterial({
        color: 0xbfe0ff, transparent: true, opacity: 0.24, roughness: 0.12, metalness: 0.25, depthWrite: false
      })),
      blindMat: tag(new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.6, metalness: 0.1 })),
      ceramic: tag(new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3, metalness: 0.05 })),
      foliage: tag(new THREE.MeshStandardMaterial({ color: 0x2d6a3e, roughness: 0.72, metalness: 0.02 })),
      bark: tag(new THREE.MeshStandardMaterial({ color: 0x5c3d28, roughness: 0.88 })),
      whiteMatte: tag(new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.55 })),
      // Vật liệu phụ dùng chung (tránh cấp phát lặp trên điện thoại, đèn bàn, gáy tài liệu)
      phoneScreen: tag(new THREE.MeshStandardMaterial({ color: 0x1e3a8a, emissive: 0x1d4ed8, emissiveIntensity: 0.4 })),
      lampBulb: tag(new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffd27d, emissiveIntensity: 1.2 })),
      binderVertex: tag(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5 }))
    };
  }

  _tagShared(obj) {
    if (!obj) return obj;
    obj.userData = obj.userData || {};
    obj.userData.sharedAsset = true;
    return obj;
  }

  _k(n) {
    return typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10000) / 10000 : String(n);
  }

  _num(v, fallback = 1, min = 0.001) {
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, v) : fallback;
  }

  _getGeo(key, creator) {
    if (this._geoCache.has(key)) return this._geoCache.get(key);
    const geo = this._tagShared(creator());
    this._geoCache.set(key, geo);
    return geo;
  }

  _boxGeo(w, h, d) {
    const sw = this._num(w, 1), sh = this._num(h, 1), sd = this._num(d, 1);
    return this._getGeo(`box_${this._k(sw)}_${this._k(sh)}_${this._k(sd)}`, () => new THREE.BoxGeometry(sw, sh, sd));
  }

  _cylGeo(rt, rb, h, seg = 10) {
    const srt = this._num(rt, 0.1, 0), srb = this._num(rb, 0.1, 0), sh = this._num(h, 1);
    const sseg = Math.max(3, Math.round(this._num(seg, 10, 3)));
    return this._getGeo(`cyl_${this._k(srt)}_${this._k(srb)}_${this._k(sh)}_${sseg}`, () => new THREE.CylinderGeometry(srt, srb, sh, sseg));
  }

  _planeGeo(w, h) {
    const sw = this._num(w, 1), sh = this._num(h, 1);
    return this._getGeo(`pln_${this._k(sw)}_${this._k(sh)}`, () => new THREE.PlaneGeometry(sw, sh));
  }

  _sphereGeo(r, ws = 10, hs = 8) {
    const sr = this._num(r, 0.1);
    const sws = Math.max(4, Math.round(this._num(ws, 10, 4)));
    const shs = Math.max(4, Math.round(this._num(hs, 8, 4)));
    return this._getGeo(`sph_${this._k(sr)}_${sws}_${shs}`, () => new THREE.SphereGeometry(sr, sws, shs));
  }

  _coneGeo(r, h, seg = 14, hseg = 1, open = false) {
    const sr = this._num(r, 0.1), sh = this._num(h, 0.2);
    const sseg = Math.max(3, Math.round(this._num(seg, 14, 3)));
    const shseg = Math.max(1, Math.round(this._num(hseg, 1, 1)));
    return this._getGeo(`con_${this._k(sr)}_${this._k(sh)}_${sseg}_${shseg}_${open ? 1 : 0}`, () => new THREE.ConeGeometry(sr, sh, sseg, shseg, open));
  }

  _dodecGeo(r, det = 1) {
    const sr = this._num(r, 0.2);
    const sdet = Math.max(0, Math.round(this._num(det, 1, 0)));
    return this._getGeo(`dod_${this._k(sr)}_${sdet}`, () => new THREE.DodecahedronGeometry(sr, sdet));
  }

  _getMat(key, creator) {
    if (this._matCache.has(key)) return this._matCache.get(key);
    const mat = this._tagShared(creator());
    this._matCache.set(key, mat);
    return mat;
  }

  _getScreenMat(title, emissive = 0x163566, emissiveIntensity = 0.42, roughness = 0.2) {
    const key = `scr_${title}_${emissive}_${emissiveIntensity}_${roughness}`;
    return this._getMat(key, () => new THREE.MeshStandardMaterial({
      map: this.tex.screenTexture(title),
      emissive,
      emissiveIntensity,
      roughness
    }));
  }

  _getTacticalBoardMat() {
    return this._getMat('tactical_board_mat', () => new THREE.MeshStandardMaterial({
      map: this.tex.tacticalBoardTexture(),
      roughness: 0.4
    }));
  }

  _getFramedJerseyMat(num) {
    return this._getMat(`framed_jersey_${num}`, () => new THREE.MeshStandardMaterial({
      map: this.tex.framedJerseyTexture(num),
      roughness: 0.35
    }));
  }

  _getFramedArtMat(variant) {
    return this._getMat(`framed_art_${variant}`, () => new THREE.MeshStandardMaterial({
      map: typeof this.tex.psgArtworkTexture === 'function'
        ? this.tex.psgArtworkTexture(variant)
        : this.tex.framedJerseyTexture('10'),
      roughness: 0.34
    }));
  }

  _getBinderMat(colorHex) {
    return this._getMat(`binder_${colorHex}`, () => new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.5
    }));
  }

  canMergeGeometries() {
    return (
      typeof THREE !== 'undefined' &&
      typeof THREE.BufferGeometry === 'function' &&
      typeof THREE.Float32BufferAttribute === 'function' &&
      typeof THREE.Matrix3 === 'function' &&
      typeof THREE.Matrix4 === 'function'
    );
  }

  // Gộp danh sách { geo, matrix, colorHex? } thành 1 BufferGeometry duy nhất (không lệ thuộc addons ngoài, an toàn trong Node mock)
  mergeGeometryEntries(entries, { useVertexColors = false, shared = true } = {}) {
    if (!entries || entries.length === 0 || !this.canMergeGeometries()) return null;

    const prepared = [];
    let totalVerts = 0;
    let hasUV = false;

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const baseGeo = e.geo;
      if (!baseGeo || !baseGeo.attributes || !baseGeo.attributes.position) {
        for (let k = 0; k < prepared.length; k++) {
          if (prepared[k].ownedClone) prepared[k].src.dispose();
        }
        return null;
      }
      if (!e.matrix || !e.matrix.elements) continue;
      const mCheck = e.matrix.elements;
      let mOk = true;
      for (let mi = 0; mi < 16; mi++) {
        if (!Number.isFinite(mCheck[mi])) { mOk = false; break; }
      }
      if (!mOk) continue;
      const ownedClone = !!baseGeo.index && typeof baseGeo.toNonIndexed === 'function';
      const src = ownedClone ? baseGeo.toNonIndexed() : baseGeo;
      const posAttr = src.attributes.position;
      if (!posAttr || !posAttr.count) {
        if (ownedClone) src.dispose();
        continue;
      }
      if (src.attributes.uv) hasUV = true;
      totalVerts += posAttr.count;
      prepared.push({ src, ownedClone, matrix: e.matrix, colorHex: e.colorHex });
    }

    if (totalVerts === 0 || prepared.length === 0) return null;

    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);
    const uvs = hasUV ? new Float32Array(totalVerts * 2) : null;
    const colors = useVertexColors ? new Float32Array(totalVerts * 3) : null;
    const normalMat = new THREE.Matrix3();
    const tmpColor = useVertexColors && typeof THREE.Color === 'function' ? new THREE.Color() : null;

    let vCursor = 0;
    for (let i = 0; i < prepared.length; i++) {
      const { src, ownedClone, matrix, colorHex } = prepared[i];
      const posAttr = src.attributes.position;
      const normAttr = src.attributes.normal;
      const uvAttr = src.attributes.uv;
      const colAttr = src.attributes.color;
      const count = posAttr.count;
      const posArr = posAttr.array;
      const normArr = normAttr ? normAttr.array : null;
      const uvArr = uvAttr ? uvAttr.array : null;
      const colArr = colAttr ? colAttr.array : null;

      const m = matrix.elements;
      normalMat.getNormalMatrix(matrix);
      const n = normalMat.elements;
      const normalMatValid = Number.isFinite(n[0]) && Number.isFinite(n[4]) && Number.isFinite(n[8]);

      let cr = 1, cg = 1, cb = 1;
      if (useVertexColors && !colArr && tmpColor && colorHex !== undefined) {
        tmpColor.setHex(colorHex);
        cr = tmpColor.r; cg = tmpColor.g; cb = tmpColor.b;
      }

      for (let v = 0; v < count; v++) {
        const i3 = v * 3;
        const o3 = (vCursor + v) * 3;
        const x = Number.isFinite(posArr[i3]) ? posArr[i3] : 0;
        const y = Number.isFinite(posArr[i3 + 1]) ? posArr[i3 + 1] : 0;
        const z = Number.isFinite(posArr[i3 + 2]) ? posArr[i3 + 2] : 0;

        positions[o3]     = m[0] * x + m[4] * y + m[8]  * z + m[12];
        positions[o3 + 1] = m[1] * x + m[5] * y + m[9]  * z + m[13];
        positions[o3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];

        if (normArr && normalMatValid) {
          const nx = Number.isFinite(normArr[i3]) ? normArr[i3] : 0;
          const ny = Number.isFinite(normArr[i3 + 1]) ? normArr[i3 + 1] : 1;
          const nz = Number.isFinite(normArr[i3 + 2]) ? normArr[i3 + 2] : 0;
          const tx = n[0] * nx + n[3] * ny + n[6] * nz;
          const ty = n[1] * nx + n[4] * ny + n[7] * nz;
          const tz = n[2] * nx + n[5] * ny + n[8] * nz;
          const len = Math.hypot(tx, ty, tz);
          if (len > 1e-8 && Number.isFinite(len)) {
            const inv = 1 / len;
            normals[o3]     = tx * inv;
            normals[o3 + 1] = ty * inv;
            normals[o3 + 2] = tz * inv;
          } else {
            normals[o3] = 0; normals[o3 + 1] = 1; normals[o3 + 2] = 0;
          }
        } else {
          normals[o3] = 0; normals[o3 + 1] = 1; normals[o3 + 2] = 0;
        }

        if (uvs) {
          const o2 = (vCursor + v) * 2;
          if (uvArr) {
            const i2 = v * 2;
            uvs[o2] = Number.isFinite(uvArr[i2]) ? uvArr[i2] : 0;
            uvs[o2 + 1] = Number.isFinite(uvArr[i2 + 1]) ? uvArr[i2 + 1] : 0;
          } else {
            uvs[o2] = 0;
            uvs[o2 + 1] = 0;
          }
        }

        if (colors) {
          if (colArr) {
            colors[o3] = colArr[i3];
            colors[o3 + 1] = colArr[i3 + 1];
            colors[o3 + 2] = colArr[i3 + 2];
          } else {
            colors[o3] = cr;
            colors[o3 + 1] = cg;
            colors[o3 + 2] = cb;
          }
        }
      }

      vCursor += count;
      if (ownedClone) src.dispose();
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    if (uvs) merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (colors) merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    if (typeof merged.computeBoundingBox === 'function') merged.computeBoundingBox();
    if (typeof merged.computeBoundingSphere === 'function') merged.computeBoundingSphere();
    if (shared) this._tagShared(merged);
    return merged;
  }

  // Xây dựng và cache bản mẫu (prototype) đã gộp theo vật liệu để mỗi đồ nội thất chỉ tốn 2–6 draw calls và dùng chung GPU buffer
  _buildCachedPrototype(protoKey, buildFn) {
    if (!this.canMergeGeometries()) {
      const g = new THREE.Group();
      buildFn(g);
      return g;
    }

    let specs = this._protoCache.get(protoKey);
    if (!specs) {
      const tmp = new THREE.Group();
      buildFn(tmp);
      tmp.updateMatrixWorld(true);
      const invRoot = new THREE.Matrix4().copy(tmp.matrixWorld);
      if (typeof invRoot.determinant === 'function' && Math.abs(invRoot.determinant()) > 1e-10) {
        invRoot.invert();
      } else {
        invRoot.identity();
      }
      const buckets = new Map();

      tmp.traverse((child) => {
        if (!child.isMesh || !child.geometry || !child.material) return;
        if (child.isInstancedMesh) return;
        const mat = child.material;
        const cs = child.castShadow ? 1 : 0;
        const rs = child.receiveShadow ? 1 : 0;
        const useVC = !!(mat.vertexColors || child.userData._vertexColorHex !== undefined);
        const targetMat = child.userData._vertexColorHex !== undefined ? this.mats.binderVertex : mat;
        const matId = targetMat.uuid || (targetMat._mergeId || (targetMat._mergeId = `m_${buckets.size}_${Math.random()}`));
        const bKey = `${matId}|${cs}|${rs}|${useVC ? 1 : 0}`;
        let bucket = buckets.get(bKey);
        if (!bucket) {
          bucket = { mat: targetMat, castShadow: !!cs, receiveShadow: !!rs, useVertexColors: useVC, entries: [] };
          buckets.set(bKey, bucket);
        }
        const relMatrix = new THREE.Matrix4().multiplyMatrices(invRoot, child.matrixWorld);
        bucket.entries.push({ geo: child.geometry, matrix: relMatrix, colorHex: child.userData._vertexColorHex });
      });

      specs = [];
      for (const bucket of buckets.values()) {
        const mergedGeo = this.mergeGeometryEntries(bucket.entries, { useVertexColors: bucket.useVertexColors, shared: true });
        if (mergedGeo) {
          specs.push({
            geo: mergedGeo,
            mat: bucket.mat,
            castShadow: bucket.castShadow,
            receiveShadow: bucket.receiveShadow
          });
        }
      }
      this._protoCache.set(protoKey, specs);
    }

    const out = new THREE.Group();
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      const mesh = new THREE.Mesh(s.geo, s.mat);
      mesh.castShadow = s.castShadow;
      mesh.receiveShadow = s.receiveShadow;
      out.add(mesh);
    }
    return out;
  }

  // Hệ cửa sổ kính cường lực trong suốt khung nhôm cao cấp (gộp khung nhôm & đố dọc thành 1 mesh, kính 1 mesh)
  createGlassWindowWall(width = 4, height = 4.4, hasBlinds = false) {
    width = this._num(width, 4, 0.5);
    height = this._num(height, 4.4, 1.0);
    const key = `glass_win_${this._k(width)}_${this._k(height)}_${hasBlinds ? 1 : 0}`;
    return this._buildCachedPrototype(key, (g) => {
      const sillH = 0.22;
      const headH = 0.24;
      const glassH = Math.max(0.2, height - sillH - headH);

      // Bệ dưới & thanh đà trên bằng nhôm
      const sill = new THREE.Mesh(this._boxGeo(width, sillH, 0.20), this.mats.aluminum);
      sill.position.y = sillH / 2;
      const head = new THREE.Mesh(this._boxGeo(width, headH, 0.20), this.mats.aluminum);
      head.position.y = height - headH / 2;
      g.add(sill, head);

      // Tấm kính cường lực trong suốt dày 0.04m
      const pane = new THREE.Mesh(this._boxGeo(width - 0.12, glassH, 0.04), this.mats.glass);
      pane.position.y = sillH + glassH / 2;
      g.add(pane);

      // Đố nhôm đứng chia ô kính hiện đại mỗi 2.2m
      const panels = Math.max(1, Math.round(width / 2.2));
      const mullionGeo = this._boxGeo(0.08, height, 0.18);
      for (let i = 0; i <= panels; i++) {
        const mx = -width / 2 + (i / panels) * width;
        const mullion = new THREE.Mesh(mullionGeo, this.mats.aluminum);
        mullion.position.set(mx, height / 2, 0);
        g.add(mullion);
      }

      // Thanh ngang gia cường ở độ cao 3.1m
      const transom = new THREE.Mesh(this._boxGeo(width, 0.07, 0.14), this.mats.aluminum);
      transom.position.y = 3.1;
      g.add(transom);

      // Rèm cuốn điều chỉnh ánh sáng phía trên (cho Phòng Họp & Pháp Chế)
      if (hasBlinds) {
        const roller = new THREE.Mesh(this._cylGeo(0.06, 0.06, width - 0.2, 8), this.mats.chrome);
        roller.rotation.z = Math.PI / 2;
        roller.position.set(0, height - 0.34, 0.10);
        g.add(roller);
        const slatGeo = this._boxGeo(width - 0.28, 0.04, 0.015);
        for (let s = 0; s < 5; s++) {
          const slat = new THREE.Mesh(slatGeo, this.mats.blindMat);
          slat.position.set(0, height - 0.48 - s * 0.11, 0.10);
          slat.rotation.x = 0.28;
          g.add(slat);
        }
      }
    });
  }

  createExecutiveDesk(width = 2.6, depth = 1.15, isPresident = false, options = {}) {
    // Hỗ trợ cả chữ ký vị trí (width, depth, isPresident, options) lẫn object-style ({ width, depth, isPresident, ... })
    if (width && typeof width === 'object') {
      const cfg = width;
      options = cfg;
      width = this._num(cfg.width, 2.6, 1.0);
      depth = this._num(cfg.depth, 1.15, 0.5);
      isPresident = !!cfg.isPresident;
    } else {
      width = this._num(width, 2.6, 1.0);
      depth = this._num(depth, 1.15, 0.5);
      isPresident = !!isPresident;
      options = options && typeof options === 'object' ? options : {};
    }
    const { includeComputer = true, includePhone = true, includeLamp = isPresident } = options;
    const key = `exec_desk_${this._k(width)}_${this._k(depth)}_${isPresident ? 1 : 0}_${includeComputer ? 1 : 0}_${includePhone ? 1 : 0}_${includeLamp ? 1 : 0}`;
    return this._buildCachedPrototype(key, (g) => {
      const wood = isPresident ? this.mats.walnut : this.mats.darkWood;
      const trimMat = isPresident ? this.mats.gold : this.mats.chrome;

      const top = new THREE.Mesh(this._boxGeo(width, 0.08, depth), wood);
      top.position.y = 0.76;
      top.castShadow = isPresident;
      top.receiveShadow = true;
      g.add(top);

      const blotter = new THREE.Mesh(this._boxGeo(width * 0.45, 0.012, depth * 0.54), this.mats.leatherDark);
      blotter.position.set(0, 0.805, 0.06);
      g.add(blotter);

      // Lỗ luồn dây điện kim loại trên mặt bàn
      const grommet = new THREE.Mesh(this._cylGeo(0.04, 0.04, 0.015, 8), this.mats.chrome);
      grommet.position.set(width * 0.24, 0.802, -depth * 0.26);
      g.add(grommet);

      const modesty = new THREE.Mesh(this._boxGeo(width - 0.18, 0.64, 0.06), wood);
      modesty.position.set(0, 0.40, -depth / 2 + 0.1);
      g.add(modesty);

      const trim = new THREE.Mesh(this._boxGeo(width - 0.16, 0.03, 0.07), trimMat);
      trim.position.set(0, 0.68, -depth / 2 + 0.1);
      g.add(trim);

      const pedGeo = this._boxGeo(0.56, 0.68, depth - 0.16);
      const legBarGeo = this._boxGeo(0.58, 0.05, depth - 0.14);
      const drawerGeo = this._boxGeo(0.50, 0.18, 0.025);
      const handleGeo = this._boxGeo(0.16, 0.02, 0.03);

      [-1, 1].forEach((side) => {
        const px = side * (width / 2 - 0.34);
        const ped = new THREE.Mesh(pedGeo, wood);
        ped.position.set(px, 0.38, 0.02);
        g.add(ped);
        const legBar = new THREE.Mesh(legBarGeo, this.mats.chrome);
        legBar.position.set(px, 0.025, 0.02);
        g.add(legBar);
        for (let d = 0; d < 3; d++) {
          const drawer = new THREE.Mesh(drawerGeo, wood);
          drawer.position.set(px, 0.18 + d * 0.21, depth / 2 - 0.055);
          g.add(drawer);
          const handle = new THREE.Mesh(handleGeo, trimMat);
          handle.position.set(px, 0.21 + d * 0.21, depth / 2 - 0.03);
          g.add(handle);
        }
      });

      if (includeComputer) {
        const pc = this.createComputerSet(isPresident ? 'PSG PRESIDENT macOS' : 'PSG DEPT WORKSTATION');
        pc.position.set(0, 0.80, -0.14);
        g.add(pc);
      }

      if (includePhone) {
        const phone = this.createDeskPhone();
        phone.position.set(width / 2 - 0.42, 0.80, 0.12);
        g.add(phone);
      }

      if (includeLamp) {
        const lamp = this.createDeskLamp();
        lamp.position.set(-width / 2 + 0.40, 0.80, -0.22);
        g.add(lamp);
      }
    });
  }

  // Bàn làm việc nhân viên chuẩn văn phòng châu Âu (mặt gỗ sồi sáng, chân thép, hộc tủ, máy tính quay đúng hướng ghế)
  createStaffDesk(screenTitle = 'PSG STAFF OS') {
    const body = this._buildCachedPrototype('staff_desk_body', (g) => {
      const top = new THREE.Mesh(this._boxGeo(1.65, 0.055, 0.82), this.mats.oakLight);
      top.position.y = 0.74;
      top.receiveShadow = true;
      g.add(top);

      // 4 chân khung thép + hộc tủ ngăn kéo bên phải
      const legGeo = this._boxGeo(0.045, 0.72, 0.045);
      [[-0.76, -0.34], [0.76, -0.34], [-0.76, 0.34], [0.76, 0.34]].forEach(([x, z]) => {
        const leg = new THREE.Mesh(legGeo, this.mats.aluminum);
        leg.position.set(x, 0.36, z);
        g.add(leg);
      });
      const ped = new THREE.Mesh(this._boxGeo(0.42, 0.62, 0.62), this.mats.whiteMatte);
      ped.position.set(0.54, 0.34, 0.02);
      g.add(ped);
      const hdlGeo = this._boxGeo(0.14, 0.018, 0.025);
      for (let d = 0; d < 3; d++) {
        const hdl = new THREE.Mesh(hdlGeo, this.mats.chrome);
        hdl.position.set(0.54, 0.18 + d * 0.19, 0.34);
        g.add(hdl);
      }
      // Lỗ đi dây điện
      const grom = new THREE.Mesh(this._cylGeo(0.03, 0.03, 0.01, 8), this.mats.matteBlack);
      grom.position.set(-0.35, 0.77, -0.22);
      g.add(grom);

      // Thân máy tính (đế, cổ, viền, bàn phím, chuột) gộp chung vào prototype bàn nhân viên
      const pcFrame = this._createComputerFrameRaw();
      pcFrame.position.set(-0.10, 0.77, -0.10);
      g.add(pcFrame);
    });

    // Tấm màn hình riêng theo phòng ban (dùng chung material theo screenTitle)
    const screen = new THREE.Mesh(this._planeGeo(0.62, 0.35), this._getScreenMat(screenTitle));
    screen.position.set(-0.10, 1.08, -0.136);
    body.add(screen);
    return body;
  }

  // Bàn họp nhóm tròn cho các phòng ban đông nhân viên
  createRoundMeetingTable(radius = 0.95) {
    return this._buildCachedPrototype(`round_tbl_${this._k(radius)}`, (g) => {
      const top = new THREE.Mesh(this._cylGeo(radius, radius, 0.06, 18), this.mats.walnut);
      top.position.y = 0.74;
      top.receiveShadow = true;
      g.add(top);
      const col = new THREE.Mesh(this._cylGeo(0.08, 0.12, 0.72, 10), this.mats.chrome);
      col.position.y = 0.36;
      g.add(col);
      const base = new THREE.Mesh(this._cylGeo(0.42, 0.45, 0.04, 14), this.mats.matteBlack);
      base.position.y = 0.02;
      g.add(base);
    });
  }

  // Trạm máy in / photocopy công sở cho phòng Tài chính & Hành chính
  createPrinterStation() {
    return this._buildCachedPrototype('printer_station', (g) => {
      const cab = new THREE.Mesh(this._boxGeo(0.92, 0.76, 0.58), this.mats.whiteMatte);
      cab.position.y = 0.38;
      g.add(cab);
      const body = new THREE.Mesh(this._boxGeo(0.76, 0.42, 0.52), this.mats.matteBlack);
      body.position.y = 0.97;
      g.add(body);
      const tray = new THREE.Mesh(this._boxGeo(0.46, 0.04, 0.30), this.mats.chrome);
      tray.position.set(0, 0.90, 0.32);
      g.add(tray);
    });
  }

  _createComputerFrameRaw() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(this._boxGeo(0.24, 0.015, 0.18), this.mats.chrome);
    base.position.set(0, 0.008, -0.04);
    g.add(base);
    const neck = new THREE.Mesh(this._boxGeo(0.06, 0.22, 0.025), this.mats.chrome);
    neck.position.set(0, 0.11, -0.08);
    neck.rotation.x = -0.12;
    g.add(neck);
    const bezel = new THREE.Mesh(this._boxGeo(0.66, 0.39, 0.026), this.mats.matteBlack);
    bezel.position.set(0, 0.31, -0.05);
    g.add(bezel);
    const kb = new THREE.Mesh(this._boxGeo(0.42, 0.014, 0.14), this.mats.matteBlack);
    kb.position.set(-0.04, 0.008, 0.24);
    g.add(kb);
    const mouse = new THREE.Mesh(this._boxGeo(0.065, 0.024, 0.105), this.mats.matteBlack);
    mouse.position.set(0.26, 0.012, 0.25);
    g.add(mouse);
    return g;
  }

  createComputerSet(screenTitle = 'PSG SYSTEM') {
    const g = this._buildCachedPrototype('pc_frame', (tmp) => {
      tmp.add(this._createComputerFrameRaw());
    });
    const screen = new THREE.Mesh(this._planeGeo(0.62, 0.35), this._getScreenMat(screenTitle));
    screen.position.set(0, 0.31, -0.036);
    g.add(screen);
    return g;
  }

  createDeskPhone() {
    return this._buildCachedPrototype('desk_phone', (g) => {
      const base = new THREE.Mesh(this._boxGeo(0.20, 0.05, 0.18), this.mats.matteBlack);
      base.position.y = 0.025;
      g.add(base);
      const handset = new THREE.Mesh(this._boxGeo(0.05, 0.04, 0.19), this.mats.matteBlack);
      handset.position.set(-0.06, 0.065, 0);
      g.add(handset);
      const screen = new THREE.Mesh(this._boxGeo(0.09, 0.01, 0.07), this.mats.phoneScreen);
      screen.position.set(0.04, 0.052, -0.02);
      g.add(screen);
    });
  }

  createDeskLamp() {
    return this._buildCachedPrototype('desk_lamp', (g) => {
      const base = new THREE.Mesh(this._cylGeo(0.10, 0.12, 0.03, 12), this.mats.gold);
      base.position.y = 0.015;
      g.add(base);
      const stem = new THREE.Mesh(this._cylGeo(0.016, 0.016, 0.42, 8), this.mats.gold);
      stem.position.y = 0.22;
      g.add(stem);
      const shade = new THREE.Mesh(this._coneGeo(0.15, 0.16, 12, 1, true), this.mats.matteBlack);
      shade.position.y = 0.44;
      g.add(shade);
      const bulb = new THREE.Mesh(this._sphereGeo(0.04, 8, 6), this.mats.lampBulb);
      bulb.position.y = 0.40;
      g.add(bulb);
    });
  }

  // Ghế xoay cao cấp: giảm từ 17 mesh xuống 3 mesh đã gộp theo vật liệu (chrome, matteBlack, leather) & bỏ castShadow thừa
  createSwivelChair(isLuxury = true) {
    const key = isLuxury ? 'swivel_chair_lux' : 'swivel_chair_std';
    return this._buildCachedPrototype(key, (g) => {
      const mat = isLuxury ? this.mats.leatherDark : this.mats.leatherNavy;
      const pole = new THREE.Mesh(this._cylGeo(0.032, 0.036, 0.36, 8), this.mats.chrome);
      pole.position.y = 0.24;
      g.add(pole);

      // Chân sao 5 chấu + bánh xe gọn nhẹ (gộp thành 1 mesh chrome & 1 mesh matteBlack trong WebGL)
      if (this.canMergeGeometries()) {
        const spokeGeo = this._boxGeo(0.03, 0.025, 0.28);
        const wheelGeo = this._cylGeo(0.026, 0.026, 0.022, 6);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const spoke = new THREE.Mesh(spokeGeo, this.mats.chrome);
          spoke.position.set(Math.sin(a) * 0.14, 0.06, Math.cos(a) * 0.14);
          spoke.rotation.y = a;
          g.add(spoke);
          const wheel = new THREE.Mesh(wheelGeo, this.mats.matteBlack);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(Math.sin(a) * 0.26, 0.026, Math.cos(a) * 0.26);
          g.add(wheel);
        }
      } else {
        const starBase = new THREE.Mesh(this._cylGeo(0.24, 0.27, 0.03, 5), this.mats.chrome);
        starBase.position.y = 0.06;
        g.add(starBase);
        const wheelRing = new THREE.Mesh(this._cylGeo(0.26, 0.26, 0.035, 6), this.mats.matteBlack);
        wheelRing.position.y = 0.025;
        g.add(wheelRing);
      }

      const seat = new THREE.Mesh(this._boxGeo(0.56, 0.10, 0.54), mat);
      seat.position.y = 0.46;
      seat.receiveShadow = true;
      g.add(seat);

      const backH = isLuxury ? 0.72 : 0.56;
      const back = new THREE.Mesh(this._boxGeo(0.54, backH, 0.10), mat);
      back.position.set(0, 0.46 + backH / 2, 0.24);
      back.rotation.x = 0.08;
      g.add(back);

      const armPostGeo = this._boxGeo(0.04, 0.20, 0.05);
      const armPadGeo = this._boxGeo(0.07, 0.04, 0.34);
      [-0.29, 0.29].forEach((x) => {
        const armPost = new THREE.Mesh(armPostGeo, this.mats.chrome);
        armPost.position.set(x, 0.56, 0.02);
        g.add(armPost);
        const armPad = new THREE.Mesh(armPadGeo, mat);
        armPad.position.set(x, 0.67, 0.02);
        g.add(armPad);
      });
    });
  }

  createSofa(width = 2.4, variant = 'navy') {
    const safeVar = variant === 'grey' ? 'grey' : 'navy';
    return this._buildCachedPrototype(`sofa_${this._k(width)}_${safeVar}`, (g) => {
      const mat = safeVar === 'grey' ? this.mats.fabricGrey : this.mats.leatherNavy;
      const base = new THREE.Mesh(this._boxGeo(width, 0.24, 0.88), mat);
      base.position.y = 0.20;
      base.receiveShadow = true;
      g.add(base);

      const legGeo = this._cylGeo(0.025, 0.02, 0.09, 6);
      [[-width / 2 + 0.12, -0.34], [width / 2 - 0.12, -0.34], [-width / 2 + 0.12, 0.34], [width / 2 - 0.12, 0.34]].forEach(([x, z]) => {
        const leg = new THREE.Mesh(legGeo, this.mats.chrome);
        leg.position.set(x, 0.045, z);
        g.add(leg);
      });

      const nCush = Math.max(2, Math.round(width / 0.78));
      const cw = (width - 0.32) / nCush;
      const cushGeo = this._boxGeo(cw - 0.03, 0.14, 0.74);
      const backGeo = this._boxGeo(cw - 0.03, 0.46, 0.18);
      for (let i = 0; i < nCush; i++) {
        const cx = -((width - 0.32) / 2) + cw * (i + 0.5);
        const cush = new THREE.Mesh(cushGeo, mat);
        cush.position.set(cx, 0.39, 0.04);
        g.add(cush);
        const back = new THREE.Mesh(backGeo, mat);
        back.position.set(cx, 0.64, -0.32);
        g.add(back);
      }

      const armGeo = this._boxGeo(0.16, 0.44, 0.88);
      [-width / 2 + 0.08, width / 2 - 0.08].forEach((x) => {
        const arm = new THREE.Mesh(armGeo, mat);
        arm.position.set(x, 0.48, 0);
        g.add(arm);
      });
    });
  }

  createCoffeeTable(w = 1.4, d = 0.75) {
    return this._buildCachedPrototype(`coffee_${this._k(w)}_${this._k(d)}`, (g) => {
      const frame = new THREE.Mesh(this._boxGeo(w, 0.04, d), this.mats.darkWood);
      frame.position.y = 0.38;
      g.add(frame);
      const glassTop = new THREE.Mesh(this._boxGeo(w - 0.08, 0.02, d - 0.08), this.mats.glass);
      glassTop.position.y = 0.41;
      g.add(glassTop);
      const legGeo = this._boxGeo(0.045, 0.38, 0.045);
      [[-w / 2 + 0.08, -d / 2 + 0.08], [w / 2 - 0.08, -d / 2 + 0.08], [-w / 2 + 0.08, d / 2 - 0.08], [w / 2 - 0.08, d / 2 - 0.08]].forEach(([x, z]) => {
        const leg = new THREE.Mesh(legGeo, this.mats.chrome);
        leg.position.set(x, 0.19, z);
        g.add(leg);
      });
    });
  }

  // Tủ hồ sơ: xóa bỏ 231 duplicate binder materials (gộp toàn bộ 21 quyển tài liệu thành 1 vertex-color mesh!)
  createFilingCabinet(w = 1.6, h = 2.0, d = 0.46) {
    return this._buildCachedPrototype(`cabinet_${this._k(w)}_${this._k(h)}_${this._k(d)}`, (g) => {
      const body = new THREE.Mesh(this._boxGeo(w, h, d), this.mats.walnut);
      body.position.y = h / 2;
      g.add(body);

      const colors = [0x00205b, 0xda291c, 0x1e293b, 0xd4af37, 0xf8fafc];
      for (let row = 0; row < 3; row++) {
        const shelfY = 0.9 + row * 0.34;
        for (let b = 0; b < 7; b++) {
          const bh = 0.20 + ((row * 3 + b) % 3) * 0.03;
          const colorHex = colors[(row + b) % colors.length];
          const binder = new THREE.Mesh(this._boxGeo(0.08, bh, 0.28), this._getBinderMat(colorHex));
          binder.userData._vertexColorHex = colorHex;
          binder.position.set(-w / 2 + 0.22 + b * 0.19, shelfY, 0.07);
          g.add(binder);
        }
      }

      const doorGeo = this._boxGeo(w / 2 - 0.06, 0.72, 0.03);
      const handleGeo = this._boxGeo(0.02, 0.14, 0.03);
      [-w / 4, w / 4].forEach((x) => {
        const door = new THREE.Mesh(doorGeo, this.mats.darkWood);
        door.position.set(x, 0.40, d / 2 + 0.01);
        g.add(door);
        const handle = new THREE.Mesh(handleGeo, this.mats.gold);
        handle.position.set(x + (x < 0 ? 0.24 : -0.24), 0.52, d / 2 + 0.03);
        g.add(handle);
      });
    });
  }

  createTrophyCabinet() {
    return this._buildCachedPrototype('trophy_cabinet', (g) => {
      const plinth = new THREE.Mesh(this._boxGeo(2.2, 0.75, 0.55), this.mats.darkWood);
      plinth.position.y = 0.375;
      g.add(plinth);
      const glassBox = new THREE.Mesh(this._boxGeo(2.14, 1.35, 0.50), this.mats.glass);
      glassBox.position.y = 1.425;
      g.add(glassBox);
      const cap = new THREE.Mesh(this._boxGeo(2.2, 0.08, 0.55), this.mats.matteBlack);
      cap.position.y = 2.14;
      g.add(cap);

      const standGeo = this._cylGeo(0.11, 0.14, 0.10, 10);
      const stemGeo = this._cylGeo(0.035, 0.06, 0.24, 10);
      const bowlGeo = this._cylGeo(0.15, 0.06, 0.28, 12);
      [-0.68, 0, 0.68].forEach((x, idx) => {
        const cupMat = idx === 1 ? this.mats.gold : this.mats.chrome;
        const stand = new THREE.Mesh(standGeo, this.mats.matteBlack);
        stand.position.set(x, 0.80, 0);
        g.add(stand);
        const stem = new THREE.Mesh(stemGeo, cupMat);
        stem.position.set(x, 0.97, 0);
        g.add(stem);
        const bowl = new THREE.Mesh(bowlGeo, cupMat);
        bowl.position.set(x, 1.22, 0);
        g.add(bowl);
      });
    });
  }

  createPottedPlant(scale = 1) {
    const g = this._buildCachedPrototype('potted_plant', (tmp) => {
      const pot = new THREE.Mesh(this._cylGeo(0.24, 0.18, 0.42, 10), this.mats.ceramic);
      pot.position.y = 0.21;
      tmp.add(pot);
      const soil = new THREE.Mesh(this._cylGeo(0.22, 0.22, 0.04, 10), this.mats.bark);
      soil.position.y = 0.41;
      tmp.add(soil);
      const trunk = new THREE.Mesh(this._cylGeo(0.03, 0.045, 0.65, 6), this.mats.bark);
      trunk.position.y = 0.72;
      tmp.add(trunk);
      [[0, 1.15, 0, 0.34], [0.18, 1.0, 0.14, 0.24], [-0.18, 1.04, -0.1, 0.25], [0.05, 1.38, -0.06, 0.24]].forEach(([x, y, z, r]) => {
        const leaf = new THREE.Mesh(this._dodecGeo(r, 1), this.mats.foliage);
        leaf.position.set(x, y, z);
        tmp.add(leaf);
      });
    });
    if (g.scale && typeof g.scale.setScalar === 'function') g.scale.setScalar(scale);
    else if (g.scale) { g.scale.x = g.scale.y = g.scale.z = scale; }
    return g;
  }

  createConferenceTable(len = 7.6, wid = 2.2) {
    return this._buildCachedPrototype(`conf_tbl_${this._k(len)}_${this._k(wid)}`, (g) => {
      const top = new THREE.Mesh(this._boxGeo(len, 0.09, wid), this.mats.walnut);
      top.position.y = 0.76;
      top.receiveShadow = true;
      g.add(top);
      const inlay = new THREE.Mesh(this._boxGeo(len - 0.6, 0.015, wid - 0.7), this.mats.leatherDark);
      inlay.position.y = 0.81;
      g.add(inlay);
      const legGeo = this._boxGeo(0.22, 0.72, wid * 0.55);
      [-len / 3, 0, len / 3].forEach((x) => {
        const leg = new THREE.Mesh(legGeo, this.mats.matteBlack);
        leg.position.set(x, 0.36, 0);
        g.add(leg);
      });
      const hub = new THREE.Mesh(this._cylGeo(0.18, 0.22, 0.05, 10), this.mats.chrome);
      hub.position.set(0, 0.835, 0);
      g.add(hub);
      const folderGeo = this._boxGeo(0.28, 0.015, 0.22);
      const bottleGeo = this._cylGeo(0.03, 0.03, 0.18, 6);
      for (let i = -2; i <= 2; i++) {
        [-0.72, 0.72].forEach((z) => {
          const folder = new THREE.Mesh(folderGeo, this.mats.leatherNavy);
          folder.position.set(i * 1.25, 0.82, z);
          g.add(folder);
          const bottle = new THREE.Mesh(bottleGeo, this.mats.glass);
          bottle.position.set(i * 1.25 + 0.22, 0.90, z);
          g.add(bottle);
        });
      }
    });
  }

  createMedicalBed() {
    return this._buildCachedPrototype('medical_bed', (g) => {
      const frame = new THREE.Mesh(this._boxGeo(2.1, 0.14, 0.92), this.mats.chrome);
      frame.position.y = 0.66;
      g.add(frame);
      const mattress = new THREE.Mesh(this._boxGeo(2.04, 0.14, 0.86), this.mats.whiteMatte);
      mattress.position.y = 0.78;
      g.add(mattress);
      const pillow = new THREE.Mesh(this._boxGeo(0.36, 0.10, 0.64), this.mats.fabricCream);
      pillow.position.set(-0.78, 0.88, 0);
      g.add(pillow);
      const legGeo = this._cylGeo(0.03, 0.03, 0.66, 6);
      [[-0.92, -0.38], [0.92, -0.38], [-0.92, 0.38], [0.92, 0.38]].forEach(([x, z]) => {
        const leg = new THREE.Mesh(legGeo, this.mats.chrome);
        leg.position.set(x, 0.33, z);
        g.add(leg);
      });
    });
  }

  createWallScreen(w = 3.2, h = 1.75, title = 'PSG EXECUTIVE DISPLAY') {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(this._boxGeo(w + 0.12, h + 0.12, 0.07), this.mats.matteBlack);
    g.add(frame);
    const disp = new THREE.Mesh(
      this._planeGeo(w, h),
      this._getScreenMat(title, 0x102a52, 0.35, 0.25)
    );
    disp.position.z = 0.038;
    g.add(disp);
    return g;
  }

  createTacticalBoard() {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(this._boxGeo(2.2, 1.38, 0.06), this.mats.chrome);
    g.add(frame);
    const board = new THREE.Mesh(
      this._planeGeo(2.08, 1.26),
      this._getTacticalBoardMat()
    );
    board.position.z = 0.034;
    g.add(board);
    return g;
  }

  createFramedJersey(num = '10') {
    const g = new THREE.Group();
    const box = new THREE.Mesh(this._boxGeo(0.95, 1.18, 0.07), this.mats.matteBlack);
    g.add(box);
    const art = new THREE.Mesh(
      this._planeGeo(0.86, 1.08),
      this._getFramedJerseyMat(num)
    );
    art.position.z = 0.038;
    g.add(art);
    return g;
  }

  createFramedArtwork(w = 1.4, h = 1.15, variant = 'parc') {
    const g = new THREE.Group();
    const box = new THREE.Mesh(this._boxGeo(w + 0.10, h + 0.10, 0.06), this.mats.darkWood);
    g.add(box);
    const art = new THREE.Mesh(
      this._planeGeo(w, h),
      this._getFramedArtMat(variant)
    );
    art.position.z = 0.034;
    g.add(art);
    return g;
  }

  createWallClock() {
    return this._buildCachedPrototype('wall_clock', (g) => {
      const rim = new THREE.Mesh(this._cylGeo(0.26, 0.26, 0.045, 18), this.mats.gold);
      rim.rotation.x = Math.PI / 2;
      g.add(rim);
      const face = new THREE.Mesh(this._cylGeo(0.23, 0.23, 0.05, 18), this.mats.whiteMatte);
      face.rotation.x = Math.PI / 2;
      g.add(face);
      const hHand = new THREE.Mesh(this._boxGeo(0.02, 0.12, 0.01), this.mats.matteBlack);
      hHand.position.set(0, 0.04, 0.03);
      g.add(hHand);
      const mHand = new THREE.Mesh(this._boxGeo(0.015, 0.16, 0.01), this.mats.matteBlack);
      mHand.position.set(0.06, 0, 0.032);
      mHand.rotation.z = -Math.PI / 2;
      g.add(mHand);
    });
  }
}
