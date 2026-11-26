// src/scene/ResidenceInteriorFactory.js
// Bộ dựng Nội thất & Cửa Phòng 3D chân thực (Luxury Modern) cho 30 phòng PSG Player Residence.
// Tối ưu mạnh cho iPhone Safari: gộp hình học đa chi tiết theo vật liệu + InstancedMesh + sharedAsset,
// tuyệt đối không dùng MeshPhysicalMaterial và không dùng khối vuông đơn sơ.

import { RESIDENCE_ROOM_BLUEPRINTS } from '../club/PlayerResidenceSystem.js';

function markShared(asset) {
  if (!asset) return asset;
  if (!asset.userData) asset.userData = {};
  asset.userData.sharedAsset = true;
  return asset;
}

const ACCENT_PALETTES = [
  { duvet: 0x1e3a5f, sofa: 0x3b4454, rug: 0x374151 }, // PSG Navy & Slate
  { duvet: 0x3b4252, sofa: 0x1e293b, rug: 0x4b5563 }, // Charcoal & Midnight
  { duvet: 0x4a3b32, sofa: 0x475569, rug: 0x57534e }, // Espresso & Warm Taupe
  { duvet: 0x26384d, sofa: 0x2d3748, rug: 0x3f4756 }  // Deep Steel & Graphite
];

export class ResidenceInteriorFactory {
  constructor(furnFactory, texFactory, baseMats) {
    this.furn = furnFactory;
    this.tex = texFactory;
    this.baseMats = baseMats;
    this._initMaterials();
  }

  _initMaterials() {
    const fMats = this.furn?.mats || {};
    const t = this.tex;
    const tag = (m) => markShared(m);

    this.mats = {
      walnut: fMats.walnut || tag(new THREE.MeshStandardMaterial({ color: 0x3d2419, roughness: 0.40, metalness: 0.08 })),
      darkWood: fMats.darkWood || tag(new THREE.MeshStandardMaterial({ color: 0x24150e, roughness: 0.46, metalness: 0.06 })),
      oakLight: fMats.oakLight || tag(new THREE.MeshStandardMaterial({ color: 0x7c5e42, roughness: 0.45, metalness: 0.05 })),
      brushedMetal: tag(new THREE.MeshStandardMaterial({ color: 0xb8c2cc, roughness: 0.24, metalness: 0.84 })),
      darkBronze: tag(new THREE.MeshStandardMaterial({ color: 0x292d36, roughness: 0.32, metalness: 0.78 })),
      matteBlack: fMats.matteBlack || tag(new THREE.MeshStandardMaterial({ color: 0x161920, roughness: 0.56, metalness: 0.25 })),
      leatherCharcoal: tag(new THREE.MeshStandardMaterial({ color: 0x202630, roughness: 0.44, metalness: 0.12 })),
      leatherNavy: fMats.leatherNavy || tag(new THREE.MeshStandardMaterial({ color: 0x0f2547, roughness: 0.42, metalness: 0.10 })),
      bedSheet: tag(new THREE.MeshStandardMaterial({ color: 0xf6f7f9, roughness: 0.80, metalness: 0.02 })),
      duvetBase: tag(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84, metalness: 0.02 })),
      sofaBase: tag(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.02 })),
      rugBase: tag(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0.01 })),
      porcelain: tag(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.16, metalness: 0.06 })),
      ceramicTile: tag(new THREE.MeshStandardMaterial({ color: 0xd5dbe3, roughness: 0.30, metalness: 0.05 })),
      bathAccentTile: tag(new THREE.MeshStandardMaterial({ color: 0x454e59, roughness: 0.36, metalness: 0.08 })),
      showerGlass: tag(new THREE.MeshStandardMaterial({
        color: 0xc8e4f8, transparent: true, opacity: 0.32, roughness: 0.10, metalness: 0.30, depthWrite: false
      })),
      mirrorGlass: tag(new THREE.MeshStandardMaterial({ color: 0xdbeafe, roughness: 0.08, metalness: 0.88 })),
      lampShade: tag(new THREE.MeshStandardMaterial({ color: 0xf3eadc, emissive: 0x4a351c, emissiveIntensity: 0.35, roughness: 0.78 })),
      lampBulbOn: tag(new THREE.MeshStandardMaterial({ color: 0xfff5dc, emissive: 0xffd27d, emissiveIntensity: 0.95, roughness: 0.2 })),
      lampBulbOff: tag(new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.45, metalness: 0.2 })),
      tvScreenOff: tag(new THREE.MeshStandardMaterial({ color: 0x090d14, roughness: 0.14, metalness: 0.45 })),
      tvScreenOn: tag(new THREE.MeshStandardMaterial({
        map: typeof t?.screenTexture === 'function' ? t.screenTexture('PSG PLAYER SUITE · MATCH ANALYTICS') : null,
        emissive: 0x1e40af,
        emissiveIntensity: 0.52,
        roughness: 0.18
      })),
      pcScreen: tag(new THREE.MeshStandardMaterial({
        map: typeof t?.screenTexture === 'function' ? t.screenTexture('PSG TACTICS & VIDEO') : null,
        emissive: 0x163566,
        emissiveIntensity: 0.40,
        roughness: 0.22
      })),
      artCanvas: tag(new THREE.MeshStandardMaterial({
        map: typeof t?.psgCrestTexture === 'function' ? t.psgCrestTexture() : null,
        color: 0xdce4f0,
        roughness: 0.65
      })),
      foliage: fMats.foliage || tag(new THREE.MeshStandardMaterial({ color: 0x2d6a3e, roughness: 0.72, metalness: 0.02 })),
      towelNavy: tag(new THREE.MeshStandardMaterial({ color: 0x0f274e, roughness: 0.86 })),
      wallGreyWhite: this.baseMats?.resWallGreyWhite || tag(new THREE.MeshStandardMaterial({ color: 0xe9ecf0, roughness: 0.62 })),
      wallDarkGrey: this.baseMats?.resWallDarkGrey || tag(new THREE.MeshStandardMaterial({ color: 0x343b46, roughness: 0.50 })),
      doorVeneer: tag(new THREE.MeshStandardMaterial({
        map: typeof t?.woodTexture === 'function' ? t.woodTexture('#3b2318', '#24140d', { repeat: [1, 1] }) : null,
        color: 0xffffff,
        roughness: 0.36,
        metalness: 0.06
      })),
      doorTrim: tag(new THREE.MeshStandardMaterial({ color: 0x281811, roughness: 0.42, metalness: 0.08 })),
      switchPlate: tag(new THREE.MeshStandardMaterial({ color: 0xd6dce5, roughness: 0.35, metalness: 0.12 }))
    };
  }

  _box(w, h, d) {
    return this.furn?._boxGeo ? this.furn._boxGeo(w, h, d) : markShared(new THREE.BoxGeometry(w, h, d));
  }

  _cyl(rt, rb, h, seg = 10) {
    return this.furn?._cylGeo ? this.furn._cylGeo(rt, rb, h, seg) : markShared(new THREE.CylinderGeometry(rt, rb, h, seg));
  }

  _sph(r, ws = 10, hs = 8) {
    return this.furn?._sphereGeo ? this.furn._sphereGeo(r, ws, hs) : markShared(new THREE.SphereGeometry(r, ws, hs));
  }

  _pln(w, h) {
    return this.furn?._planeGeo ? this.furn._planeGeo(w, h) : markShared(new THREE.PlaneGeometry(w, h));
  }

  // Tạo nhóm đối tượng con rồi gộp thành các BufferGeometry tĩnh theo từng material
  _compileBuckets(buildFn) {
    const tmp = new THREE.Group();
    buildFn(tmp);
    tmp.updateMatrixWorld(true);
    const buckets = new Map();
    tmp.traverse((child) => {
      if (!child.isMesh || !child.geometry || !child.material) return;
      const mat = child.material;
      const key = mat.uuid || (mat._resBucketId || (mat._resBucketId = `rm_${buckets.size}`));
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          mat,
          castShadow: !!child.castShadow,
          receiveShadow: !!child.receiveShadow,
          entries: []
        };
        buckets.set(key, bucket);
      }
      bucket.entries.push({ geo: child.geometry, matrix: child.matrixWorld.clone() });
    });

    const out = [];
    for (const b of buckets.values()) {
      const merged = this.furn.mergeGeometryEntries(b.entries, { shared: true });
      if (merged) {
        out.push({ geo: merged, mat: b.mat, castShadow: b.castShadow, receiveShadow: b.receiveShadow });
      }
    }
    return out;
  }

  // Thêm mesh chi tiết quy chiếu theo không gian cục bộ phòng (lx, ly trên sàn 0.14m, lz_in tính từ cửa -> cửa sổ)
  _makeRoomPlacer(root, sideSign) {
    const add = (geo, mat, lx, ly, lz_in, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(lx, ly, -sideSign * lz_in);
      m.rotation.set(rx, ry, rz);
      if (sx !== 1 || sy !== 1 || sz !== 1) m.scale.set(sx, sy, sz);
      root.add(m);
      return m;
    };
    return add;
  }

  // Xây dựng mẫu kiến trúc & nội thất đa chi tiết cho 1 phía (North: sideSign=1 hoặc South: sideSign=-1)
  _buildSideStaticBuckets(sideSign) {
    return this._compileBuckets((root) => {
      const add = this._makeRoomPlacer(root, sideSign);

      // A. KHUNG CỬA RA VÀO CAO CẤP (khuôn bao + nẹp chỉ viền 2 mặt + ngưỡng cửa + 3 bản lề + bảng công tắc)
      // Lưu ý: lz_in = 0 chính là mặt phẳng cửa (doorZ)
      add(this._box(0.11, 2.66, 0.24), this.mats.doorTrim, -0.62, 1.33, 0.0);     // Đố trái
      add(this._box(0.11, 2.66, 0.24), this.mats.doorTrim, +0.62, 1.33, 0.0);     // Đố phải
      add(this._box(1.46, 0.14, 0.25), this.mats.doorTrim, 0.0, 2.72, 0.0);       // Khung ngang trên
      add(this._box(1.46, 0.16, 0.21), this.mats.wallDarkGrey, 0.0, 2.86, 0.0);   // Nối kín với dầm trên 2.92m
      // Nẹp chỉ viền cửa (mặt hành lang & mặt trong phòng)
      add(this._box(0.08, 2.74, 0.03), this.mats.doorTrim, -0.68, 1.37, -0.11);
      add(this._box(0.08, 2.74, 0.03), this.mats.doorTrim, +0.68, 1.37, -0.11);
      add(this._box(1.48, 0.08, 0.03), this.mats.doorTrim, 0.0, 2.76, -0.11);
      add(this._box(0.08, 2.74, 0.03), this.mats.doorTrim, -0.68, 1.37, 0.11);
      add(this._box(0.08, 2.74, 0.03), this.mats.doorTrim, +0.68, 1.37, 0.11);
      add(this._box(1.48, 0.08, 0.03), this.mats.doorTrim, 0.0, 2.76, 0.11);
      // Ngưỡng cửa kim loại xước + 3 cối bản lề
      add(this._box(1.16, 0.014, 0.22), this.mats.brushedMetal, 0.0, 0.007, 0.0);
      [0.40, 1.32, 2.24].forEach((hy) => {
        add(this._cyl(0.012, 0.012, 0.09, 8), this.mats.brushedMetal, -0.565, hy, 0.03 * sideSign);
      });
      // Công tắc đèn & ổ cắm cạnh cửa vào (phía trong phòng)
      add(this._box(0.11, 0.14, 0.018), this.mats.switchPlate, +0.92, 1.24, 0.12);
      add(this._box(0.04, 0.05, 0.022), this.mats.brushedMetal, +0.92, 1.24, 0.125);
      add(this._box(0.10, 0.08, 0.018), this.mats.switchPlate, +0.92, 0.34, 0.12);

      // Len chân tường gỗ tối dọc phòng
      add(this._box(0.025, 0.09, 11.15), this.mats.darkWood, +2.01, 0.045, 5.60);
      add(this._box(0.025, 0.09, 8.50), this.mats.darkWood, -2.01, 0.045, 6.90);

      // B. PHÒNG TẮM & WC KHÉP KÍN (Góc Trái Cửa Vào: lx ∈ [-2.03, -0.62], lz_in ∈ [0.15, 2.58])
      // Vách ngăn phòng tắm có cửa mở rộng 0.80m (tại lz_in ∈ [1.22, 2.02])
      add(this._box(0.12, 2.85, 1.07), this.mats.wallGreyWhite, -0.62, 1.425, 0.685); // Vách trước (cánh cửa tựa sát vào đây)
      add(this._box(0.12, 2.85, 0.56), this.mats.wallGreyWhite, -0.62, 1.425, 2.30);  // Vách sau
      add(this._box(0.12, 0.65, 0.80), this.mats.wallGreyWhite, -0.62, 2.525, 1.62);  // Dầm trên cửa WC
      add(this._box(1.48, 2.85, 0.12), this.mats.wallGreyWhite, -1.30, 1.425, 2.58);  // Vách ngang ngăn với khu ngủ
      add(this._box(1.48, 1.05, 0.12), this.mats.wallDarkGrey, -1.30, 3.375, 2.58);   // Khối trên kín trần
      add(this._box(0.12, 1.05, 2.45), this.mats.wallDarkGrey, -0.62, 3.375, 1.36);   // Khối trên kín trần
      // Sàn gạch gốm sáng & ốp tường gạch xám khu tắm
      add(this._box(1.36, 0.012, 2.38), this.mats.ceramicTile, -1.33, 0.006, 1.36);
      add(this._box(0.02, 2.55, 0.72), this.mats.bathAccentTile, -2.00, 1.28, 2.18);
      add(this._box(0.84, 2.55, 0.02), this.mats.bathAccentTile, -1.60, 1.28, 2.51);
      // Vách kính tắm đứng + khay thoát nước + vòi sen đứng & sen trần
      add(this._box(0.82, 2.18, 0.025), this.mats.showerGlass, -1.58, 1.10, 1.86);
      add(this._box(0.84, 0.035, 0.04), this.mats.brushedMetal, -1.58, 2.19, 1.86);
      add(this._box(0.035, 2.18, 0.04), this.mats.brushedMetal, -1.18, 1.10, 1.86);
      add(this._box(0.76, 0.024, 0.62), this.mats.porcelain, -1.60, 0.016, 2.19);
      add(this._cyl(0.016, 0.016, 1.25, 8), this.mats.brushedMetal, -1.96, 1.55, 2.22); // Ống sen đứng
      add(this._cyl(0.11, 0.11, 0.025, 12), this.mats.brushedMetal, -1.80, 2.16, 2.22); // Bát sen mưa
      add(this._box(0.12, 0.05, 0.04), this.mats.brushedMetal, -1.96, 1.10, 2.22);      // Van gật gù
      // Bồn cầu đa chi tiết (đế, thân uốn, két nước, nắp đóng, nút xả)
      add(this._cyl(0.15, 0.12, 0.34, 12), this.mats.porcelain, -1.68, 0.17, 1.44);
      add(this._sph(0.19, 12, 8), this.mats.porcelain, -1.60, 0.34, 1.44, 0, 0, 0, 1.15, 0.45, 0.90);
      add(this._box(0.19, 0.42, 0.36), this.mats.porcelain, -1.86, 0.54, 1.44);
      add(this._cyl(0.022, 0.022, 0.02, 8), this.mats.brushedMetal, -1.86, 0.76, 1.44);
      // Tủ chậu rửa mặt + chậu sứ + vòi nước chrome + gương chiếu sáng + giá treo khăn
      add(this._box(0.44, 0.48, 0.74), this.mats.walnut, -1.78, 0.56, 0.60);
      add(this._box(0.46, 0.035, 0.76), this.mats.ceramicTile, -1.78, 0.81, 0.60);
      add(this._cyl(0.18, 0.14, 0.12, 14), this.mats.porcelain, -1.76, 0.87, 0.60);
      add(this._cyl(0.015, 0.018, 0.16, 8), this.mats.brushedMetal, -1.92, 0.91, 0.60);
      add(this._box(0.10, 0.022, 0.022), this.mats.brushedMetal, -1.87, 0.98, 0.60);
      add(this._box(0.03, 0.82, 0.66), this.mats.mirrorGlass, -2.00, 1.54, 0.60);
      add(this._box(0.04, 0.86, 0.70), this.mats.darkBronze, -2.01, 1.54, 0.60);
      // Giá treo khăn & 2 khăn tắm gấp
      add(this._cyl(0.014, 0.014, 0.54, 8), this.mats.brushedMetal, -0.71, 1.18, 0.62, Math.PI / 2, 0, 0);
      add(this._box(0.05, 0.42, 0.24), this.mats.towelNavy, -0.72, 1.00, 0.52);
      add(this._box(0.05, 0.38, 0.22), this.mats.bedSheet, -0.72, 1.02, 0.76);

      // C. TỦ QUẦN ÁO CAO CẤP (Thân tủ + ngăn kệ + thanh treo + 2 ngăn kéo tay nắm; cánh cửa động làm InstancedMesh riêng)
      add(this._box(0.58, 0.05, 1.52), this.mats.darkWood, +1.68, 0.04, 1.52);         // Đế tủ
      add(this._box(0.58, 0.04, 1.52), this.mats.darkWood, +1.68, 2.26, 1.52);         // Nóc tủ
      add(this._box(0.58, 2.24, 0.04), this.mats.darkWood, +1.68, 1.15, 0.78);         // Thành hông gần cửa
      add(this._box(0.58, 2.24, 0.04), this.mats.darkWood, +1.68, 1.15, 2.26);         // Thành hông xa cửa
      add(this._box(0.03, 2.24, 1.50), this.mats.darkWood, +1.96, 1.15, 1.52);         // Hậu tủ
      add(this._box(0.52, 1.58, 0.035), this.mats.walnut, +1.68, 1.44, 1.52);          // Vách chia 2 khoang
      // Ngăn kệ bên trong + thanh treo đồ chrome + đồ gấp + 2 ngăn kéo dưới
      [1.82, 1.38, 0.96].forEach((sy) => {
        add(this._box(0.48, 0.03, 0.70), this.mats.oakLight, +1.68, sy, 1.88);
      });
      add(this._box(0.28, 0.14, 0.34), this.mats.towelNavy, +1.66, 1.47, 1.86);        // Áo gấp
      add(this._box(0.26, 0.12, 0.32), this.mats.bedSheet, +1.66, 1.04, 1.86);
      add(this._cyl(0.015, 0.015, 0.68, 8), this.mats.brushedMetal, +1.68, 1.96, 1.14, Math.PI / 2, 0, 0); // Thanh treo
      [0.98, 1.14, 1.30].forEach((hz, hi) => {
        add(this._box(0.32, 0.56, 0.04), hi === 1 ? this.mats.towelNavy : this.mats.leatherCharcoal, +1.68, 1.65, hz);
      });
      add(this._box(0.54, 0.62, 1.44), this.mats.walnut, +1.67, 0.36, 1.52);           // Khối 2 ngăn kéo dưới
      add(this._box(0.025, 0.24, 1.36), this.mats.darkWood, +1.39, 0.50, 1.52);        // Mặt ngăn kéo trên
      add(this._box(0.025, 0.24, 1.36), this.mats.darkWood, +1.39, 0.22, 1.52);        // Mặt ngăn kéo dưới
      add(this._box(0.025, 0.02, 0.22), this.mats.brushedMetal, +1.375, 0.50, 1.52);
      add(this._box(0.025, 0.02, 0.22), this.mats.brushedMetal, +1.375, 0.22, 1.52);

      // D. GIƯỜNG NGỦ HẠNG SANG + 2 TỦ ĐẦU GIƯỜNG + ĐÈN NGỦ + VÁCH ỐP
      // Vách nhấn sau đầu giường + ốp lam gỗ
      add(this._box(0.06, 3.25, 2.65), this.mats.wallDarkGrey, -2.00, 1.72, 4.60);
      add(this._box(0.03, 2.20, 0.18), this.mats.walnut, -1.965, 1.88, 3.44);
      add(this._box(0.03, 2.20, 0.18), this.mats.walnut, -1.965, 1.88, 5.76);
      // 4 chân giường vát + khung bệ gỗ óc chó + đầu giường bọc nệm chần
      [[-1.88, 3.92], [-1.88, 5.28], [0.02, 3.92], [0.02, 5.28]].forEach(([lx, lz]) => {
        add(this._cyl(0.032, 0.020, 0.16, 8), this.mats.darkWood, lx, 0.08, lz);
      });
      add(this._box(2.08, 0.16, 1.54), this.mats.walnut, -0.94, 0.22, 4.60);
      add(this._box(0.11, 1.12, 1.66), this.mats.darkWood, -1.95, 0.66, 4.60);
      for (let py = 0; py < 2; py++) {
        for (let pz = 0; pz < 3; pz++) {
          add(this._box(0.06, 0.34, 0.48), this.mats.leatherCharcoal, -1.89, 0.54 + py * 0.37, 4.08 + pz * 0.52);
        }
      }
      // Đệm dày + ga trải giường trắng + 2 gối ngủ & 2 gối tựa có độ phồng tự nhiên (SphereGeometry nén)
      add(this._box(1.98, 0.22, 1.46), this.mats.bedSheet, -0.94, 0.39, 4.60);
      add(this._sph(0.24, 12, 8), this.mats.bedSheet, -1.62, 0.55, 4.24, 0, 0, -0.22, 0.80, 0.36, 1.18);
      add(this._sph(0.24, 12, 8), this.mats.bedSheet, -1.62, 0.55, 4.96, 0, 0, -0.22, 0.80, 0.36, 1.18);
      // 2 tủ đầu giường + ngăn kéo + tay nắm + đèn ngủ để bàn + bóng phát sáng
      [3.44, 5.76].forEach((nz) => {
        [[-1.90, nz - 0.18], [-1.90, nz + 0.18], [-1.56, nz - 0.18], [-1.56, nz + 0.18]].forEach(([lx, lz]) => {
          add(this._cyl(0.018, 0.012, 0.12, 6), this.mats.darkBronze, lx, 0.06, lz);
        });
        add(this._box(0.42, 0.38, 0.44), this.mats.walnut, -1.73, 0.31, nz);
        add(this._box(0.02, 0.14, 0.38), this.mats.darkWood, -1.515, 0.39, nz);
        add(this._box(0.02, 0.016, 0.10), this.mats.brushedMetal, -1.50, 0.39, nz);
        // Đèn ngủ
        add(this._cyl(0.075, 0.095, 0.03, 12), this.mats.darkBronze, -1.73, 0.515, nz);
        add(this._cyl(0.016, 0.020, 0.20, 8), this.mats.brushedMetal, -1.73, 0.62, nz);
        add(this._cyl(0.11, 0.15, 0.19, 14), this.mats.lampShade, -1.73, 0.77, nz);
      });
      // Ổ cắm cạnh giường
      add(this._box(0.018, 0.09, 0.14), this.mats.switchPlate, -2.01, 0.62, 3.44);

      // E. KỆ TV & TIVI TREO TƯỜNG ĐỐI DIỆN GIƯỜNG (Tường Phải lx = +1.72..1.98, lz_in = 4.60)
      [4.00, 5.20].forEach((cz) => {
        add(this._cyl(0.02, 0.015, 0.14, 8), this.mats.darkBronze, +1.50, 0.07, cz);
        add(this._cyl(0.02, 0.015, 0.14, 8), this.mats.darkBronze, +1.92, 0.07, cz);
      });
      add(this._box(0.48, 0.38, 1.72), this.mats.walnut, +1.72, 0.33, 4.60);          // Thân kệ TV
      [-0.54, 0.0, +0.54].forEach((dz) => {
        add(this._box(0.02, 0.32, 0.52), this.mats.darkWood, +1.475, 0.33, 4.60 + dz);
        add(this._box(0.02, 0.09, 0.016), this.mats.brushedMetal, +1.46, 0.34, 4.60 + dz);
      });
      add(this._box(0.24, 0.05, 0.34), this.mats.matteBlack, +1.68, 0.545, 4.60);       // Đầu thu Media Box
      add(this._box(0.03, 0.62, 0.05), this.mats.darkBronze, +1.99, 0.90, 4.60);        // Nẹp giấu dây cáp
      // Khung viền siêu mỏng TV treo tường & giá đỡ (màn hình bật/tắt tách InstancedMesh riêng)
      add(this._box(0.06, 0.24, 0.32), this.mats.darkBronze, +1.98, 1.54, 4.60);        // Giá treo tường
      add(this._box(0.045, 0.84, 1.44), this.mats.matteBlack, +1.94, 1.54, 4.60);       // Khung viền TV

      // F. KHU TIẾP KHÁCH / THƯ GIÃN + ĐÈN CÂY + MINI-BAR (lz_in ∈ [6.6, 8.8])
      // Ghế Sofa băng đơn cao cấp hướng +X (lx = -1.50, lz_in = 7.75)
      [[-1.84, 7.08], [-1.84, 8.42], [-1.18, 7.08], [-1.18, 8.42]].forEach(([lx, lz]) => {
        add(this._cyl(0.022, 0.016, 0.14, 8), this.mats.darkWood, lx, 0.07, lz);
      });
      add(this._box(0.78, 0.12, 1.48), this.mats.walnut, -1.50, 0.20, 7.75);           // Khung đáy gỗ
      // Bàn trà tròn 3 chân chéo + tách cà phê & sách
      add(this._cyl(0.36, 0.36, 0.04, 18), this.mats.walnut, -0.58, 0.42, 7.75);
      [[0, 0.22], [0.19, -0.11], [-0.19, -0.11]].forEach(([ox, oz]) => {
        add(this._cyl(0.016, 0.012, 0.40, 8), this.mats.darkBronze, -0.58 + ox, 0.20, 7.75 + oz);
      });
      add(this._cyl(0.042, 0.034, 0.08, 10), this.mats.porcelain, -0.52, 0.48, 7.66);
      add(this._box(0.20, 0.022, 0.26), this.mats.towelNavy, -0.64, 0.45, 7.84, 0, 0.25, 0);
      // Đèn cây đứng cạnh sofa
      add(this._cyl(0.16, 0.18, 0.03, 14), this.mats.darkBronze, -1.76, 0.015, 6.72);
      add(this._cyl(0.016, 0.018, 1.46, 8), this.mats.brushedMetal, -1.76, 0.74, 6.72);
      add(this._cyl(0.18, 0.24, 0.30, 14), this.mats.lampShade, -1.76, 1.56, 6.72);
      // Tranh PSG đóng khung treo tường phía trên Sofa
      add(this._box(0.035, 0.86, 1.18), this.mats.darkWood, -2.005, 1.84, 7.75);
      add(this._box(0.040, 0.76, 1.08), this.mats.bedSheet, -2.00, 1.84, 7.75);
      add(this._box(0.044, 0.58, 0.86), this.mats.artCanvas, -1.996, 1.84, 7.75);

      // Tủ Mini-Bar & Máy pha Espresso (tường phải lx = +1.68, lz_in = 7.15)
      add(this._box(0.52, 0.86, 0.58), this.mats.darkBronze, +1.68, 0.43, 7.15);
      add(this._box(0.025, 0.76, 0.52), this.mats.matteBlack, +1.41, 0.44, 7.15);
      add(this._box(0.025, 0.26, 0.02), this.mats.brushedMetal, +1.39, 0.56, 6.94);
      add(this._box(0.26, 0.32, 0.24), this.mats.matteBlack, +1.68, 1.02, 7.15);       // Máy cà phê
      add(this._cyl(0.035, 0.030, 0.07, 8), this.mats.porcelain, +1.58, 0.93, 7.15);

      // G. BÀN LÀM VIỆC + PC + ĐÈN BÀN + GHẾ CÔNG THÁI HỌC ĐA CHI TIẾT (tường phải gần cửa kính lx = +1.64, lz_in = 9.95)
      // Mặt bàn gỗ óc chó + khung chân thép + hộc 3 ngăn kéo
      add(this._box(0.64, 0.042, 1.38), this.mats.walnut, +1.64, 0.74, 9.95);
      add(this._box(0.03, 0.72, 0.03), this.mats.darkBronze, +1.36, 0.36, 9.32);
      add(this._box(0.03, 0.72, 0.03), this.mats.darkBronze, +1.92, 0.36, 9.32);
      add(this._box(0.58, 0.68, 0.42), this.mats.darkWood, +1.64, 0.36, 10.40);         // Hộc tủ
      [0.20, 0.40, 0.58].forEach((dy) => {
        add(this._box(0.02, 0.15, 0.38), this.mats.walnut, +1.345, dy, 10.40);
        add(this._box(0.02, 0.015, 0.12), this.mats.brushedMetal, +1.33, dy, 10.40);
      });
      // Màn hình 27", bàn phím, chuột, đèn bàn, chồng sách
      add(this._cyl(0.10, 0.12, 0.02, 10), this.mats.brushedMetal, +1.78, 0.77, 9.92);
      add(this._box(0.03, 0.18, 0.05), this.mats.brushedMetal, +1.80, 0.86, 9.92);
      add(this._box(0.032, 0.42, 0.70), this.mats.matteBlack, +1.76, 1.04, 9.92);
      add(this._box(0.036, 0.38, 0.66), this.mats.pcScreen, +1.755, 1.04, 9.92);
      add(this._box(0.14, 0.018, 0.40), this.mats.matteBlack, +1.50, 0.77, 9.90);
      add(this._sph(0.04, 8, 6), this.mats.matteBlack, +1.50, 0.77, 9.60, 0, 0, 0, 1.3, 0.55, 0.85);
      add(this._cyl(0.065, 0.075, 0.025, 10), this.mats.darkBronze, +1.74, 0.77, 9.42);
      add(this._cyl(0.012, 0.012, 0.36, 8), this.mats.brushedMetal, +1.74, 0.94, 9.42, 0, 0, 0.22);
      add(this._cyl(0.06, 0.09, 0.12, 10), this.mats.lampShade, +1.64, 1.08, 9.42);
      add(this._box(0.20, 0.04, 0.26), this.mats.towelNavy, +1.66, 0.78, 10.42);
      add(this._box(0.18, 0.035, 0.24), this.mats.bedSheet, +1.66, 0.82, 10.42, 0, 0.15, 0);

      // Ghế xoay công thái học (5 chân sao + trụ ben + đệm ngồi + lưng tựa cong + 2 tay vịn)
      const cx = +1.05, cz = 9.95;
      add(this._cyl(0.026, 0.032, 0.34, 8), this.mats.brushedMetal, cx, 0.24, cz);
      for (let a = 0; a < 5; a++) {
        const ang = (a / 5) * Math.PI * 2;
        add(
          this._box(0.28, 0.028, 0.04),
          this.mats.brushedMetal,
          cx + Math.cos(ang) * 0.14,
          0.075,
          cz + Math.sin(ang) * 0.14,
          0,
          -ang,
          0
        );
        add(
          this._cyl(0.022, 0.022, 0.04, 8),
          this.mats.matteBlack,
          cx + Math.cos(ang) * 0.26,
          0.025,
          cz + Math.sin(ang) * 0.26
        );
      }
      add(this._box(0.46, 0.08, 0.48), this.mats.leatherCharcoal, cx, 0.45, cz);       // Đệm ngồi
      add(this._box(0.05, 0.48, 0.07), this.mats.brushedMetal, cx - 0.23, 0.64, cz);    // Thanh sống lưng
      add(this._box(0.07, 0.52, 0.44), this.mats.leatherCharcoal, cx - 0.20, 0.78, cz, 0, 0, 0.10); // Tựa lưng
      add(this._box(0.28, 0.04, 0.05), this.mats.matteBlack, cx, 0.62, cz - 0.25);      // Tay vịn trái
      add(this._box(0.28, 0.04, 0.05), this.mats.matteBlack, cx, 0.62, cz + 0.25);      // Tay vịn phải

      // H. CHẬU CÂY CẢNH PHONG CÁCH CHÂU ÂU (Góc Trái gần cửa kính: lx = -1.68, lz_in = 10.45)
      add(this._cyl(0.18, 0.14, 0.36, 12), this.mats.darkBronze, -1.68, 0.18, 10.45);
      add(this._cyl(0.032, 0.04, 0.56, 8), this.mats.darkWood, -1.68, 0.58, 10.45);
      [
        [0.14, 0.76, 0.08, 0.45, 0.2],
        [-0.14, 0.82, -0.06, -0.45, 1.4],
        [0.06, 0.94, -0.14, 0.35, 2.5],
        [-0.08, 1.02, 0.12, -0.35, 4.1],
        [0.0, 1.12, 0.0, 0.15, 5.2]
      ].forEach(([ox, ly, oz, rx, ry]) => {
        add(this._sph(0.14, 8, 6), this.mats.foliage, -1.68 + ox, ly, 10.45 + oz, rx, ry, 0, 1.25, 0.35, 0.85);
      });

      // I. VIỀN ĐÈN ÂM TRẦN PHÒNG NGỦ (2 bóng mỗi phòng; đĩa phát sáng quản lý bật/tắt riêng qua room.lightOn)
      add(this._cyl(0.09, 0.09, 0.02, 12), this.mats.darkBronze, 0.0, 3.885, 3.80);
      add(this._cyl(0.09, 0.09, 0.02, 12), this.mats.darkBronze, 0.0, 3.885, 7.80);
    });
  }

  // Các chi tiết đổi màu theo biến thể từng phòng (Chăn ga + Nệm sofa + Thảm trải sàn) -> dùng InstancedMesh.setColorAt
  _buildSideVariantBuckets(sideSign) {
    const duvetBuckets = this._compileBuckets((root) => {
      const add = this._makeRoomPlacer(root, sideSign);
      // Chăn phủ gấp nếp tự nhiên trên giường + dải runner cuối giường
      add(this._box(1.42, 0.25, 1.50), this.mats.duvetBase, -0.65, 0.40, 4.60);
      add(this._box(0.28, 0.26, 1.52), this.mats.duvetBase, -0.08, 0.405, 4.60);
      add(this._sph(0.16, 10, 8), this.mats.duvetBase, -1.36, 0.51, 4.30, 0, 0, -0.25, 0.55, 0.34, 0.88);
      add(this._sph(0.16, 10, 8), this.mats.duvetBase, -1.36, 0.51, 4.90, 0, 0, -0.25, 0.55, 0.34, 0.88);
    });

    const sofaBuckets = this._compileBuckets((root) => {
      const add = this._makeRoomPlacer(root, sideSign);
      // Đệm ngồi, lưng tựa nghiêng, 2 tay vịn sofa phòng nghỉ
      add(this._box(0.66, 0.14, 0.66), this.mats.sofaBase, -1.46, 0.33, 7.40);
      add(this._box(0.66, 0.14, 0.66), this.mats.sofaBase, -1.46, 0.33, 8.10);
      add(this._box(0.18, 0.44, 1.36), this.mats.sofaBase, -1.78, 0.56, 7.75, 0, 0, -0.14);
      add(this._box(0.74, 0.28, 0.12), this.mats.sofaBase, -1.50, 0.40, 7.04);
      add(this._box(0.74, 0.28, 0.12), this.mats.sofaBase, -1.50, 0.40, 8.46);
    });

    const rugBuckets = this._compileBuckets((root) => {
      const add = this._makeRoomPlacer(root, sideSign);
      // Thảm dệt khu vực tiếp khách (độ dày 12mm nằm nổi sạch trên sàn gỗ 0.14m)
      add(this._box(1.75, 0.012, 1.92), this.mats.rugBase, -0.96, 0.006, 7.75);
    });

    return {
      duvetGeo: duvetBuckets[0]?.geo || null,
      sofaGeo: sofaBuckets[0]?.geo || null,
      rugGeo: rugBuckets[0]?.geo || null
    };
  }

  // Cụm cánh cửa động đa chi tiết (gốc xoay tại bản lề x=0, lá cửa chạy dọc +X từ 0 -> 1.14m)
  _buildDoorLeafGeos() {
    const wood = this._compileBuckets((root) => {
      // Cánh cửa gỗ veneer (1.14m x 2.58m x 0.052m), cách sàn 1.4cm
      const leaf = new THREE.Mesh(this._box(1.14, 2.58, 0.050), this.mats.doorVeneer);
      leaf.position.set(0.57, 1.304, 0);
      root.add(leaf);
      // Khung chỉ âm / nổi trang trí 2 mặt cửa phong cách Luxury Hotel
      const outerMold = new THREE.Mesh(this._box(0.84, 2.18, 0.062), this.mats.doorTrim);
      outerMold.position.set(0.57, 1.30, 0);
      root.add(outerMold);
      const innerPanel = new THREE.Mesh(this._box(0.72, 2.04, 0.068), this.mats.doorVeneer);
      innerPanel.position.set(0.57, 1.30, 0);
      root.add(innerPanel);
    });

    const metal = this._compileBuckets((root) => {
      // Nẹp khóa dọc, 2 ốp khóa 2 mặt, lõi khóa + 2 tay nắm gạt ngang kim loại + 3 bản lề
      const escutcheon = new THREE.Mesh(this._box(0.055, 0.22, 0.072), this.mats.brushedMetal);
      escutcheon.position.set(1.01, 1.04, 0);
      root.add(escutcheon);

      const spindle = new THREE.Mesh(this._cyl(0.015, 0.015, 0.13, 8), this.mats.brushedMetal);
      spindle.rotation.x = Math.PI / 2;
      spindle.position.set(1.01, 1.07, 0);
      root.add(spindle);

      // Tay nắm gạt 2 phía
      [-0.068, 0.068].forEach((zOff) => {
        const lever = new THREE.Mesh(this._box(0.145, 0.022, 0.022), this.mats.brushedMetal);
        lever.position.set(0.955, 1.07, zOff);
        root.add(lever);
      });

      // Chốt khóa mặt cạnh cửa
      const latch = new THREE.Mesh(this._box(0.014, 0.14, 0.026), this.mats.brushedMetal);
      latch.position.set(1.14, 1.04, 0);
      root.add(latch);

      // 3 lá bản lề gắn mép cửa
      [0.40, 1.32, 2.24].forEach((hy) => {
        const hinge = new THREE.Mesh(this._box(0.04, 0.09, 0.056), this.mats.brushedMetal);
        hinge.position.set(0.015, hy, 0);
        root.add(hinge);
      });
    });

    return {
      woodGeo: wood[0]?.geo || null,
      metalGeo: metal[0]?.geo || null
    };
  }

  // Cánh cửa tủ quần áo tương tác (gốc xoay tại bản lề (0,0,0), lá cửa chạy theo +Z từ 0..0.72m)
  _buildWardrobeDoorGeos() {
    const wood = this._compileBuckets((root) => {
      const leaf = new THREE.Mesh(this._box(0.032, 1.56, 0.72), this.mats.walnut);
      leaf.position.set(0, 1.44, 0.36);
      root.add(leaf);
      const bevel = new THREE.Mesh(this._box(0.040, 1.42, 0.58), this.mats.darkWood);
      bevel.position.set(0, 1.44, 0.36);
      root.add(bevel);
    });
    const metal = this._compileBuckets((root) => {
      const handle = new THREE.Mesh(this._box(0.028, 0.34, 0.024), this.mats.brushedMetal);
      handle.position.set(-0.025, 1.36, 0.64);
      root.add(handle);
    });
    return {
      woodGeo: wood[0]?.geo || null,
      metalGeo: metal[0]?.geo || null
    };
  }

  buildAllSuites(targetGroup, campus, signDirHelper = null) {
    const rooms = RESIDENCE_ROOM_BLUEPRINTS;
    const northRooms = [];
    const southRooms = [];
    for (let i = 0; i < rooms.length; i++) {
      if (rooms[i].side === 'north') northRooms.push(rooms[i]);
      else southRooms.push(rooms[i]);
    }

    const dummy = new THREE.Object3D();
    const colorTmp = new THREE.Color();

    // 1. Tạo & đặt InstancedMesh tĩnh cho 16 phòng Bắc và 14 phòng Nam
    const spawnSideStatic = (sideRooms, sideSign) => {
      const buckets = this._buildSideStaticBuckets(sideSign);
      for (let b = 0; b < buckets.length; b++) {
        const bk = buckets[b];
        const inst = new THREE.InstancedMesh(bk.geo, bk.mat, sideRooms.length);
        inst.castShadow = bk.castShadow;
        inst.receiveShadow = bk.receiveShadow;
        for (let i = 0; i < sideRooms.length; i++) {
          const bp = sideRooms[i];
          dummy.position.set(bp.cx, 0.14, bp.doorZ);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
        }
        inst.computeBoundingSphere?.();
        targetGroup.add(inst);
      }

      const vGeo = this._buildSideVariantBuckets(sideSign);
      const createVarInst = (geo, mat, colorKey) => {
        if (!geo) return;
        const inst = new THREE.InstancedMesh(geo, mat, sideRooms.length);
        for (let i = 0; i < sideRooms.length; i++) {
          const bp = sideRooms[i];
          const pal = ACCENT_PALETTES[(bp.roomNumber - 1) % ACCENT_PALETTES.length];
          dummy.position.set(bp.cx, 0.14, bp.doorZ);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
          colorTmp.setHex(pal[colorKey]);
          inst.setColorAt(i, colorTmp);
        }
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        inst.computeBoundingSphere?.();
        targetGroup.add(inst);
      };
      createVarInst(vGeo.duvetGeo, this.mats.duvetBase, 'duvet');
      createVarInst(vGeo.sofaGeo, this.mats.sofaBase, 'sofa');
      createVarInst(vGeo.rugGeo, this.mats.rugBase, 'rug');
    };

    spawnSideStatic(northRooms, 1);
    spawnSideStatic(southRooms, -1);

    // 2. Tạo hệ thống 30 cánh cửa phòng động + 30 cánh cửa tủ quần áo + 30 màn hình TV (Bật/Tắt) + 30 đèn phòng (Bật/Tắt)
    const total = rooms.length;
    const doorGeos = this._buildDoorLeafGeos();
    const wardDoorGeos = this._buildWardrobeDoorGeos();

    const doorWoodInst = new THREE.InstancedMesh(doorGeos.woodGeo, this.mats.doorVeneer, total);
    const doorMetalInst = new THREE.InstancedMesh(doorGeos.metalGeo, this.mats.brushedMetal, total);
    doorWoodInst.userData.dynamicObject = true;
    doorMetalInst.userData.dynamicObject = true;
    doorWoodInst.frustumCulled = false;
    doorMetalInst.frustumCulled = false;

    const wardWoodInst = new THREE.InstancedMesh(wardDoorGeos.woodGeo, this.mats.walnut, total);
    const wardMetalInst = new THREE.InstancedMesh(wardDoorGeos.metalGeo, this.mats.brushedMetal, total);
    wardWoodInst.userData.dynamicObject = true;
    wardMetalInst.userData.dynamicObject = true;
    wardWoodInst.frustumCulled = false;
    wardMetalInst.frustumCulled = false;

    const tvOffInst = new THREE.InstancedMesh(this._box(0.015, 0.76, 1.36), this.mats.tvScreenOff, total);
    const tvOnInst = new THREE.InstancedMesh(this._box(0.015, 0.76, 1.36), this.mats.tvScreenOn, total);
    tvOffInst.userData.dynamicObject = true;
    tvOnInst.userData.dynamicObject = true;
    tvOffInst.frustumCulled = false;
    tvOnInst.frustumCulled = false;

    const lightDiscOnInst = new THREE.InstancedMesh(this._cyl(0.072, 0.072, 0.014, 10), this.mats.lampBulbOn, total * 3);
    const lightDiscOffInst = new THREE.InstancedMesh(this._cyl(0.072, 0.072, 0.014, 10), this.mats.lampBulbOff, total * 3);
    lightDiscOnInst.userData.dynamicObject = true;
    lightDiscOffInst.userData.dynamicObject = true;
    lightDiscOnInst.frustumCulled = false;
    lightDiscOffInst.frustumCulled = false;

    targetGroup.add(
      doorWoodInst, doorMetalInst,
      wardWoodInst, wardMetalInst,
      tvOffInst, tvOnInst,
      lightDiscOnInst, lightDiscOffInst
    );

    const hitMat = campus._hitProxyMat || this.mats.darkBronze;
    const doorProxyGeo = this._box(1.18, 2.55, 0.24);
    const wardProxyGeo = this._box(0.62, 2.15, 1.50);
    const tvProxyGeo = this._box(0.24, 0.90, 1.48);
    const switchProxyGeo = this._box(0.28, 0.34, 0.22);

    const roomControllers = [];

    for (let i = 0; i < total; i++) {
      const bp = rooms[i];
      const sSign = bp.side === 'north' ? 1 : -1;
      const toZ = (lz) => bp.doorZ - sSign * lz;

      // Đăng ký toàn bộ collider vật lý chính xác bên trong phòng (chừa lối đi rộng > 0.85m dọc x = cx + 0.55)
      campus.addCollider(bp.cx - 0.62, toZ(0.685), 0.16, 1.08, -0.5, 4.2); // Vách WC trước
      campus.addCollider(bp.cx - 0.62, toZ(2.30), 0.16, 0.56, -0.5, 4.2);  // Vách WC sau
      campus.addCollider(bp.cx - 1.30, toZ(2.58), 1.48, 0.16, -0.5, 4.2);  // Vách WC ngang
      campus.addCollider(bp.cx - 1.78, toZ(0.60), 0.48, 0.76, -0.5, 4.2);  // Tủ lavabo
      campus.addCollider(bp.cx - 1.68, toZ(1.44), 0.58, 0.44, -0.5, 4.2);  // Bồn cầu
      campus.addCollider(bp.cx - 1.58, toZ(1.86), 0.84, 0.08, -0.5, 4.2);  // Vách kính tắm
      campus.addCollider(bp.cx + 1.68, toZ(1.52), 0.62, 1.54, -0.5, 4.2);  // Tủ quần áo
      campus.addCollider(bp.cx - 0.94, toZ(4.60), 2.10, 1.56, -0.5, 4.2);  // Giường ngủ
      campus.addCollider(bp.cx - 1.73, toZ(3.44), 0.46, 0.46, -0.5, 4.2);  // Tab đầu giường 1
      campus.addCollider(bp.cx - 1.73, toZ(5.76), 0.46, 0.46, -0.5, 4.2);  // Tab đầu giường 2
      campus.addCollider(bp.cx + 1.72, toZ(4.60), 0.50, 1.74, -0.5, 4.2);  // Kệ TV
      campus.addCollider(bp.cx - 1.50, toZ(7.75), 0.84, 1.50, -0.5, 4.2);  // Sofa mini
      campus.addCollider(bp.cx - 0.58, toZ(7.75), 0.74, 0.74, -0.5, 4.2);  // Bàn trà tròn
      campus.addCollider(bp.cx + 1.68, toZ(7.15), 0.54, 0.60, -0.5, 4.2);  // Mini-bar
      campus.addCollider(bp.cx + 1.64, toZ(9.95), 0.68, 1.40, -0.5, 4.2);  // Bàn làm việc
      campus.addCollider(bp.cx + 1.05, toZ(9.95), 0.54, 0.54, -0.5, 4.2);  // Ghế xoay
      campus.addCollider(bp.cx - 1.68, toZ(10.45), 0.42, 0.42, -0.5, 4.2); // Chậu cây

      // Door collider & đăng ký vào campus.doors (với isResidenceDoor=true để không bị PsgCampusScene tự động mở cho người qua hành lang!)
      const doorCol = campus.addCollider(bp.cx, bp.doorZ, 1.38, 0.24, -0.5, 4.2);
      const doorPivotDummy = { rotation: { y: 0 } };
      const doorObj = {
        id: `res_door_${bp.roomNumber}`,
        roomNumber: bp.roomNumber,
        x: bp.cx,
        z: bp.doorZ,
        pivot: doorPivotDummy,
        open: false,
        locked: false,
        targetAngle: 0,
        collider: doorCol,
        isResidenceDoor: true
      };
      campus.doors.push(doorObj);

      // Hit-proxy cho Cửa phòng (xoay theo cánh cửa để bấm được cả khi đang mở lẫn đang đóng)
      const doorProxyPivot = new THREE.Group();
      doorProxyPivot.position.set(bp.cx - 0.57, 0.14, bp.doorZ);
      doorProxyPivot.userData.dynamicObject = true;
      const doorProxy = new THREE.Mesh(doorProxyGeo, hitMat);
      doorProxy.position.set(0.57, 1.28, 0);
      if (hitMat === this.mats.darkBronze) doorProxy.visible = false;
      doorProxyPivot.add(doorProxy);
      targetGroup.add(doorProxyPivot);
      campus.tagInteractable(
        doorProxy,
        `res_door_hit_${bp.roomNumber}`,
        `Mở / Đóng cửa ${bp.code}`,
        '🚪',
        'toggle_residence_door',
        { roomNumber: bp.roomNumber }
      );

      // Hit-proxy cho Tủ quần áo
      const wardProxy = new THREE.Mesh(wardProxyGeo, hitMat);
      wardProxy.position.set(bp.cx + 1.66, 1.20, toZ(1.52));
      if (hitMat === this.mats.darkBronze) wardProxy.visible = false;
      targetGroup.add(wardProxy);
      campus.tagInteractable(
        wardProxy,
        `res_ward_${bp.roomNumber}`,
        `Mở / Đóng tủ quần áo ${bp.code}`,
        '🧥',
        'toggle_residence_wardrobe',
        { roomNumber: bp.roomNumber }
      );

      // Hit-proxy cho TV phòng
      const tvProxy = new THREE.Mesh(tvProxyGeo, hitMat);
      tvProxy.position.set(bp.cx + 1.88, 1.68, toZ(4.60));
      if (hitMat === this.mats.darkBronze) tvProxy.visible = false;
      targetGroup.add(tvProxy);
      campus.tagInteractable(
        tvProxy,
        `res_tv_${bp.roomNumber}`,
        `Bật / Tắt TV ${bp.code}`,
        '📺',
        'toggle_residence_tv',
        { roomNumber: bp.roomNumber }
      );

      // Hit-proxy cho Công tắc đèn phòng (cạnh cửa)
      const swProxy = new THREE.Mesh(switchProxyGeo, hitMat);
      swProxy.position.set(bp.cx + 0.92, 1.38, toZ(0.18));
      if (hitMat === this.mats.darkBronze) swProxy.visible = false;
      targetGroup.add(swProxy);
      campus.tagInteractable(
        swProxy,
        `res_light_${bp.roomNumber}`,
        `Bật / Tắt đèn phòng ${bp.code}`,
        '💡',
        'toggle_residence_light',
        { roomNumber: bp.roomNumber }
      );

      roomControllers.push({
        index: i,
        roomNumber: bp.roomNumber,
        code: bp.code,
        side: bp.side,
        sideSign: sSign,
        cx: bp.cx,
        doorZ: bp.doorZ,
        doorObj,
        doorProxyPivot,
        doorProgress: 0,
        doorTarget: 0,
        wardProgress: 0,
        wardTarget: 0,
        tvOn: false,
        lightOn: true,
        tvPos: { x: bp.cx + 1.915, y: 1.68, z: toZ(4.60) },
        lightSpots: [
          { x: bp.cx, y: 4.012, z: toZ(3.80) },
          { x: bp.cx, y: 4.012, z: toZ(7.80) },
          { x: bp.cx - 1.73, y: 0.91, z: toZ(3.44) }
        ]
      });
    }

    const syncControllerMatrices = (ctrl, updateDoor = true, updateWard = true, updateTv = true, updateLight = true) => {
      const i = ctrl.index;
      const sSign = ctrl.sideSign;

      if (updateDoor) {
        // Cánh cửa xoay mở VÀO TRONG phòng: North (+angle), South (-angle)
        const maxDoorAngle = sSign * 1.48;
        const angle = ctrl.doorProgress * maxDoorAngle;
        dummy.position.set(ctrl.cx - 0.57, 0.14, ctrl.doorZ);
        dummy.rotation.set(0, angle, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        doorWoodInst.setMatrixAt(i, dummy.matrix);
        doorMetalInst.setMatrixAt(i, dummy.matrix);
        ctrl.doorProxyPivot.rotation.y = angle;
        ctrl.doorObj.pivot.rotation.y = angle;
        ctrl.doorObj.targetAngle = ctrl.doorTarget * maxDoorAngle;
        ctrl.doorObj.open = ctrl.doorTarget > 0.5;
        // Chỉ tắt collider khi cửa đã xoay mở >= 62% (ngăn NPC bước xuyên cánh cửa đang đóng/hé)
        ctrl.doorObj.collider.active = ctrl.doorProgress < 0.62;
      }

      if (updateWard) {
        // Cánh tủ mở ra phía giữa phòng (dùng scale dương (1,1,1) ở cả hai phía Bắc/Nam để giữ nguyên winding mặt)
        const wardPivotZ = sSign > 0 ? (ctrl.doorZ - 1.50) : (ctrl.doorZ + 0.78);
        const wAngle = -ctrl.wardProgress * 1.42;
        dummy.position.set(ctrl.cx + 1.39, 0.14, wardPivotZ);
        dummy.rotation.set(0, wAngle, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        wardWoodInst.setMatrixAt(i, dummy.matrix);
        wardMetalInst.setMatrixAt(i, dummy.matrix);
      }

      if (updateTv) {
        dummy.position.set(ctrl.tvPos.x, ctrl.tvPos.y, ctrl.tvPos.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(ctrl.tvOn ? 0.0001 : 1, ctrl.tvOn ? 0.0001 : 1, ctrl.tvOn ? 0.0001 : 1);
        dummy.updateMatrix();
        tvOffInst.setMatrixAt(i, dummy.matrix);
        dummy.scale.set(ctrl.tvOn ? 1 : 0.0001, ctrl.tvOn ? 1 : 0.0001, ctrl.tvOn ? 1 : 0.0001);
        dummy.updateMatrix();
        tvOnInst.setMatrixAt(i, dummy.matrix);
      }

      if (updateLight) {
        for (let l = 0; l < ctrl.lightSpots.length; l++) {
          const sp = ctrl.lightSpots[l];
          const idx = i * 3 + l;
          dummy.position.set(sp.x, sp.y, sp.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(ctrl.lightOn ? 1 : 0.0001, ctrl.lightOn ? 1 : 0.0001, ctrl.lightOn ? 1 : 0.0001);
          dummy.updateMatrix();
          lightDiscOnInst.setMatrixAt(idx, dummy.matrix);
          dummy.scale.set(ctrl.lightOn ? 0.0001 : 1, ctrl.lightOn ? 0.0001 : 1, ctrl.lightOn ? 0.0001 : 1);
          dummy.updateMatrix();
          lightDiscOffInst.setMatrixAt(idx, dummy.matrix);
        }
      }
    };

    for (let i = 0; i < roomControllers.length; i++) {
      syncControllerMatrices(roomControllers[i], true, true, true, true);
    }
    doorWoodInst.instanceMatrix.needsUpdate = true;
    doorMetalInst.instanceMatrix.needsUpdate = true;
    wardWoodInst.instanceMatrix.needsUpdate = true;
    wardMetalInst.instanceMatrix.needsUpdate = true;
    tvOffInst.instanceMatrix.needsUpdate = true;
    tvOnInst.instanceMatrix.needsUpdate = true;
    lightDiscOnInst.instanceMatrix.needsUpdate = true;
    lightDiscOffInst.instanceMatrix.needsUpdate = true;

    return {
      roomControllers,
      doorWoodInst,
      doorMetalInst,
      wardWoodInst,
      wardMetalInst,
      tvOffInst,
      tvOnInst,
      lightDiscOnInst,
      lightDiscOffInst,
      syncControllerMatrices
    };
  }
}
