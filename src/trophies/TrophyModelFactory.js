// src/trophies/TrophyModelFactory.js
// Tạo mô hình Cúp 3D thủ tục riêng biệt cho từng giải đấu (không dùng 1 mẫu cúp chung cho tất cả!)
// Tối ưu GPU/RAM cho WebGL & iPhone Safari: tái sử dụng geometry & material (sharedAsset = true),
// tránh PointLight runtime trong tủ kính (dùng vật liệu emissive halo + kim loại PBR).

function markShared(asset) {
  if (!asset) return asset;
  if (!asset.userData) asset.userData = {};
  asset.userData.sharedAsset = true;
  return asset;
}

function makePlaqueTexture(trophy, texFactory) {
  if (typeof document === 'undefined' || typeof THREE.CanvasTexture !== 'function') return null;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 256, 128);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(0.5, '#0f172a');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 248, 120);

    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((trophy.competitionName || 'DANH HIỆU PSG').toUpperCase().slice(0, 24), 128, 34);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`MÙA GIẢI ${trophy.seasonName || '2026/27'}`, 128, 60);

    ctx.fillStyle = '#93c5fd';
    ctx.font = '13px sans-serif';
    ctx.fillText(`HLV: ${(trophy.winningManagerName || 'PSG').slice(0, 22)}`, 128, 86);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px sans-serif';
    ctx.fillText(`${trophy.winningDate || 'Paris Saint-Germain'}`, 128, 108);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.generateMipmaps = false;
  if (typeof THREE.LinearFilter !== 'undefined') tex.minFilter = THREE.LinearFilter;
  if (texFactory?.cache && trophy.trophyId) {
    tex.userData = tex.userData || {};
    tex.userData.sharedAsset = false;
  }
  return tex;
}

export class TrophyModelFactory {
  constructor(texFactory = null) {
    this.tex = texFactory;
    this._geos = new Map();
    this._mats = null;
  }

  _initMats() {
    if (this._mats) return this._mats;
    const StdMat = THREE.MeshStandardMaterial;
    const BasicMat = THREE.MeshBasicMaterial || StdMat;
    this._mats = {
      gold: markShared(new StdMat({ color: 0xeab308, metalness: 0.88, roughness: 0.18 })),
      goldWarm: markShared(new StdMat({ color: 0xfacc15, metalness: 0.86, roughness: 0.22 })),
      silver: markShared(new StdMat({ color: 0xe2e8f0, metalness: 0.92, roughness: 0.15 })),
      silverSoft: markShared(new StdMat({ color: 0xcbd5e1, metalness: 0.82, roughness: 0.24 })),
      onyx: markShared(new StdMat({ color: 0x0f172a, metalness: 0.35, roughness: 0.28 })),
      navy: markShared(new StdMat({ color: 0x00205b, metalness: 0.52, roughness: 0.32 })),
      crimson: markShared(new StdMat({ color: 0xda291c, metalness: 0.35, roughness: 0.4 })),
      pedestalMarble: markShared(new StdMat({ color: 0x1a2232, metalness: 0.2, roughness: 0.32 })),
      bronzeTrim: markShared(new StdMat({ color: 0xb48a3e, metalness: 0.8, roughness: 0.25 })),
      glass: markShared(new StdMat({ color: 0xdbeafe, transparent: true, opacity: 0.17, roughness: 0.08, metalness: 0.12, depthWrite: false })),
      haloLed: markShared(new BasicMat({ color: 0xfff3c4 })),
      highlightRing: markShared(new BasicMat({ color: 0xfacc15 }))
    };
    return this._mats;
  }

  _geo(key, creator) {
    if (this._geos.has(key)) return this._geos.get(key);
    const g = markShared(creator());
    this._geos.set(key, g);
    return g;
  }

  _cyl(rTop, rBot, h, seg = 16) {
    const k = `cyl_${rTop}_${rBot}_${h}_${seg}`;
    return this._geo(k, () => new THREE.CylinderGeometry(rTop, rBot, h, seg));
  }

  _box(w, h, d) {
    const k = `box_${w}_${h}_${d}`;
    return this._geo(k, () => new THREE.BoxGeometry(w, h, d));
  }

  _sphere(r, wSeg = 14, hSeg = 10) {
    const k = `sph_${r}_${wSeg}_${hSeg}`;
    const Ctor = THREE.SphereGeometry || THREE.DodecahedronGeometry || THREE.BoxGeometry;
    return this._geo(k, () => new Ctor(r, wSeg, hSeg));
  }

  _torus(r, tube, rSeg = 8, tSeg = 20, arc = Math.PI * 2) {
    const k = `tor_${r}_${tube}_${rSeg}_${tSeg}_${arc.toFixed(2)}`;
    const Ctor = THREE.TorusGeometry || THREE.CylinderGeometry;
    return this._geo(k, () => (THREE.TorusGeometry ? new Ctor(r, tube, rSeg, tSeg, arc) : new Ctor(r, r, tube * 2, 12)));
  }

  // Tạo riêng mô hình 3D theo từng loại giải đấu (6+ hình dáng khác biệt rõ rệt)
  buildTrophyMesh(trophyModel = 'ligue_1') {
    const m = this._initMats();
    const g = new THREE.Group();
    g.userData.trophyModel = trophyModel;

    if (trophyModel === 'ucl') {
      // 1. UEFA CHAMPIONS LEAGUE ("Big Ears" — cúp Tai Voi cỡ lớn đặc trưng)
      const plinth = new THREE.Mesh(this._cyl(0.15, 0.17, 0.14, 18), m.navy);
      plinth.position.y = 0.07;
      const collar = new THREE.Mesh(this._cyl(0.12, 0.15, 0.06, 18), m.gold);
      collar.position.y = 0.17;
      const stem = new THREE.Mesh(this._cyl(0.065, 0.105, 0.22, 16), m.silver);
      stem.position.y = 0.31;
      const body = new THREE.Mesh(this._cyl(0.19, 0.075, 0.38, 20), m.silver);
      body.position.y = 0.59;
      const rim = new THREE.Mesh(this._torus(0.19, 0.018, 8, 24), m.silverSoft);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.78;
      const band = new THREE.Mesh(this._cyl(0.145, 0.138, 0.035, 20), m.gold);
      band.position.y = 0.62;

      // Hai quai "Tai Voi" vươn rộng hai bên
      const earGeo = this._torus(0.16, 0.019, 8, 18, Math.PI * 1.15);
      const earL = new THREE.Mesh(earGeo, m.silver);
      earL.position.set(-0.18, 0.59, 0);
      earL.rotation.z = Math.PI * 0.42;
      const earR = new THREE.Mesh(earGeo, m.silver);
      earR.position.set(0.18, 0.59, 0);
      earR.rotation.y = Math.PI;
      earR.rotation.z = Math.PI * 0.42;

      g.add(plinth, collar, stem, body, rim, band, earL, earR);
      return g;
    }

    if (trophyModel === 'ligue_1') {
      // 2. LIGUE 1 (Hexagol — Tháp lục giác hiện đại & vòng vương miện vàng)
      const base = new THREE.Mesh(this._cyl(0.16, 0.18, 0.12, 6), m.onyx);
      base.position.y = 0.06;
      const goldTrim = new THREE.Mesh(this._cyl(0.14, 0.16, 0.04, 6), m.gold);
      goldTrim.position.y = 0.14;
      const innerCore = new THREE.Mesh(this._cyl(0.08, 0.11, 0.42, 6), m.silver);
      innerCore.position.y = 0.37;
      // Vòng lục giác bao quanh tâm + đỉnh vương miện vàng
      const hexRing = new THREE.Mesh(this._cyl(0.20, 0.20, 0.24, 6), m.goldWarm);
      hexRing.position.y = 0.52;
      hexRing.rotation.y = Math.PI / 6;
      const innerCut = new THREE.Mesh(this._cyl(0.13, 0.13, 0.26, 6), m.navy);
      innerCut.position.y = 0.52;
      innerCut.rotation.y = Math.PI / 6;
      const crownOrb = new THREE.Mesh(this._sphere(0.075, 14, 10), m.gold);
      crownOrb.position.y = 0.68;

      g.add(base, goldTrim, innerCore, hexRing, innerCut, crownOrb);
      return g;
    }

    if (trophyModel === 'coupe_de_france') {
      // 3. COUPE DE FRANCE (Cúp Charles Simon dáng cao thanh mảnh cổ điển)
      const base = new THREE.Mesh(this._cyl(0.12, 0.14, 0.15, 16), m.navy);
      base.position.y = 0.075;
      const stem = new THREE.Mesh(this._cyl(0.036, 0.07, 0.28, 14), m.silver);
      stem.position.y = 0.29;
      const bulb = new THREE.Mesh(this._sphere(0.065, 12, 10), m.gold);
      bulb.position.y = 0.30;
      const cup = new THREE.Mesh(this._cyl(0.135, 0.045, 0.26, 18), m.silver);
      cup.position.y = 0.56;
      const lid = new THREE.Mesh(this._cyl(0.025, 0.135, 0.12, 18), m.silverSoft);
      lid.position.y = 0.75;
      const finial = new THREE.Mesh(this._sphere(0.035, 10, 8), m.gold);
      finial.position.y = 0.83;
      const handleGeo = this._torus(0.085, 0.012, 6, 14, Math.PI * 1.1);
      const hL = new THREE.Mesh(handleGeo, m.gold);
      hL.position.set(-0.11, 0.57, 0);
      hL.rotation.z = Math.PI * 0.45;
      const hR = new THREE.Mesh(handleGeo, m.gold);
      hR.position.set(0.11, 0.57, 0);
      hR.rotation.y = Math.PI;
      hR.rotation.z = Math.PI * 0.45;

      g.add(base, stem, bulb, cup, lid, finial, hL, hR);
      return g;
    }

    if (trophyModel === 'trophee_des_champions') {
      // 4. TROPHÉE DES CHAMPIONS (Biểu tượng cánh vươn đôi ôm quả cầu vàng)
      const base = new THREE.Mesh(this._cyl(0.13, 0.15, 0.11, 8), m.onyx);
      base.position.y = 0.055;
      const neck = new THREE.Mesh(this._cyl(0.06, 0.10, 0.18, 8), m.gold);
      neck.position.y = 0.20;
      const wingGeo = this._box(0.045, 0.36, 0.11);
      const wingL = new THREE.Mesh(wingGeo, m.silver);
      wingL.position.set(-0.09, 0.45, 0);
      wingL.rotation.z = 0.24;
      const wingR = new THREE.Mesh(wingGeo, m.silver);
      wingR.position.set(0.09, 0.45, 0);
      wingR.rotation.z = -0.24;
      const ribbon = new THREE.Mesh(this._torus(0.11, 0.015, 8, 18), m.crimson);
      ribbon.position.y = 0.43;
      ribbon.rotation.x = Math.PI * 0.32;
      const ball = new THREE.Mesh(this._sphere(0.082, 14, 10), m.goldWarm);
      ball.position.y = 0.52;

      g.add(base, neck, wingL, wingR, ribbon, ball);
      return g;
    }

    if (trophyModel === 'uefa_super_cup') {
      // 5. UEFA SUPER CUP (Bình cúp cổ cao thanh lịch viền vàng)
      const base = new THREE.Mesh(this._cyl(0.13, 0.15, 0.13, 12), m.onyx);
      base.position.y = 0.065;
      const lower = new THREE.Mesh(this._cyl(0.11, 0.065, 0.28, 16), m.silver);
      lower.position.y = 0.27;
      const midBand = new THREE.Mesh(this._cyl(0.118, 0.118, 0.045, 16), m.gold);
      midBand.position.y = 0.42;
      const upper = new THREE.Mesh(this._cyl(0.15, 0.095, 0.24, 16), m.silver);
      upper.position.y = 0.56;
      const crownRim = new THREE.Mesh(this._torus(0.15, 0.016, 8, 22), m.goldWarm);
      crownRim.rotation.x = Math.PI / 2;
      crownRim.position.y = 0.68;

      g.add(base, lower, midBand, upper, crownRim);
      return g;
    }

    if (trophyModel === 'fifa_club_world_cup') {
      // 6. FIFA CLUB WORLD CUP (Quả địa cầu vàng với 3 vòng quỹ đạo đan xen)
      const base = new THREE.Mesh(this._cyl(0.14, 0.17, 0.13, 20), m.onyx);
      base.position.y = 0.065;
      const pillar = new THREE.Mesh(this._cyl(0.06, 0.11, 0.22, 16), m.gold);
      pillar.position.y = 0.24;
      const globe = new THREE.Mesh(this._sphere(0.115, 16, 12), m.goldWarm);
      globe.position.y = 0.50;
      const orbitGeo = this._torus(0.175, 0.014, 8, 24);
      const orb1 = new THREE.Mesh(orbitGeo, m.gold);
      orb1.position.y = 0.50;
      orb1.rotation.set(0.55, 0.3, 0);
      const orb2 = new THREE.Mesh(orbitGeo, m.silver);
      orb2.position.y = 0.50;
      orb2.rotation.set(-0.55, 0.9, 0.35);
      const orb3 = new THREE.Mesh(orbitGeo, m.goldWarm);
      orb3.position.y = 0.50;
      orb3.rotation.set(Math.PI / 2, 0, 0.45);

      g.add(base, pillar, globe, orb1, orb2, orb3);
      return g;
    }

    // 7. Fallback / Coupe de la Ligue & Danh hiệu phụ
    const base = new THREE.Mesh(this._cyl(0.13, 0.15, 0.12, 16), m.onyx);
    base.position.y = 0.06;
    const stem = new THREE.Mesh(this._cyl(0.055, 0.085, 0.24, 14), m.silver);
    stem.position.y = 0.24;
    const spiral = new THREE.Mesh(this._torus(0.11, 0.022, 8, 20), m.gold);
    spiral.position.y = 0.48;
    spiral.rotation.x = 0.45;
    const cup = new THREE.Mesh(this._cyl(0.12, 0.06, 0.24, 16), m.silverSoft);
    cup.position.y = 0.50;
    g.add(base, stem, spiral, cup);
    return g;
  }

  // Tạo trọn bộ Tủ trưng bày 3D gồm: Bệ đá cẩm thạch + Tủ kính bảo vệ + Đèn hắt đỉnh + Bảng tên + Cúp 3D + Tương tác
  createTrophyShowcase(trophyRecord, opts = {}) {
    const m = this._initMats();
    const root = new THREE.Group();
    root.userData.trophyId = trophyRecord.trophyId;

    // 1. Bệ trưng bày sang trọng (cao 1.02m)
    const pedBase = new THREE.Mesh(this._box(0.96, 0.10, 0.96), m.onyx);
    pedBase.position.y = 0.05;
    const pedBody = new THREE.Mesh(this._box(0.84, 0.86, 0.84), m.pedestalMarble);
    pedBody.position.y = 0.53;
    const pedCap = new THREE.Mesh(this._box(0.92, 0.06, 0.92), m.bronzeTrim);
    pedCap.position.y = 0.99;
    root.add(pedBase, pedBody, pedCap);

    // 2. Mô hình cúp 3D riêng biệt đặt trên bệ
    const trophyMesh = this.buildTrophyMesh(trophyRecord.trophyModel);
    trophyMesh.position.y = 1.02;
    const scale = opts.scale || 1.05;
    trophyMesh.scale.set(scale, scale, scale);
    root.add(trophyMesh);

    // 3. Tủ kính bảo vệ & khung đồng tinh tế + Đèn trần hắt sáng (không dùng PointLight để mượt trên iPhone)
    const glassBox = new THREE.Mesh(this._box(0.76, 1.04, 0.76), m.glass);
    glassBox.position.y = 1.54;
    const topCap = new THREE.Mesh(this._box(0.80, 0.06, 0.80), m.onyx);
    topCap.position.y = 2.09;
    const ledHalo = new THREE.Mesh(this._box(0.56, 0.02, 0.56), m.haloLed);
    ledHalo.position.y = 2.05;
    root.add(glassBox, topCap, ledHalo);

    const postGeo = this._box(0.028, 1.06, 0.028);
    [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]].forEach(([px, pz]) => {
      const post = new THREE.Mesh(postGeo, m.bronzeTrim);
      post.position.set(px, 1.55, pz);
      root.add(post);
    });

    // 4. Bảng thông tin danh hiệu gắn mặt trước bệ
    const plaqueTex = makePlaqueTexture(trophyRecord, this.tex);
    const MatCtor = THREE.MeshBasicMaterial || THREE.MeshStandardMaterial;
    const plaqueMat = plaqueTex
      ? new MatCtor({ map: plaqueTex })
      : m.bronzeTrim;
    const plaque = new THREE.Mesh(this._box(0.68, 0.32, 0.02), plaqueMat);
    plaque.position.set(0, 0.64, 0.43);
    root.add(plaque);

    // 5. Vòng phát sáng dưới chân nếu là Cúp mới giành được
    if (trophyRecord.isNewHighlight) {
      const RingGeo = THREE.RingGeometry || THREE.CylinderGeometry;
      const ring = new THREE.Mesh(
        THREE.RingGeometry ? new RingGeo(0.58, 0.72, 24) : this._cyl(0.68, 0.68, 0.02, 20),
        m.highlightRing
      );
      if (THREE.RingGeometry) ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      root.add(ring);
    }

    return root;
  }
}
