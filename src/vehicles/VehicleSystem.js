// src/vehicles/VehicleSystem.js
// Tạo xe Chủ tịch, xe ban lãnh đạo, xe huấn luyện viên và xe buýt đội bóng PSG
// Tối ưu GPU/RAM: chia sẻ toàn bộ geometry & material (userData.sharedAsset = true), thay MeshPhysicalMaterial bằng MeshStandardMaterial nhẹ,
// tắt castShadow trên các chi tiết nhỏ và đóng băng ma trận các bộ phận tĩnh.

function markShared(asset) {
  if (!asset) return asset;
  if (!asset.userData) asset.userData = {};
  asset.userData.sharedAsset = true;
  return asset;
}

function freezeChildParts(group) {
  if (!group || !Array.isArray(group.children)) return;
  for (let i = 0; i < group.children.length; i++) {
    const child = group.children[i];
    if (typeof child.updateMatrix === 'function') child.updateMatrix();
    child.matrixAutoUpdate = false;
  }
}

export class VehicleSystem {
  constructor(texFactory) {
    this.tex = texFactory;
    this._bodyMats = new Map();
    this._shared = null;
    this._busSignMat = null;
  }

  _ensureShared() {
    if (this._shared) return this._shared;
    this._shared = {
      geos: {
        carChassis: markShared(new THREE.BoxGeometry(2.0, 0.56, 4.8)),
        carCabin: markShared(new THREE.BoxGeometry(1.76, 0.52, 2.4)),
        carWindshield: markShared(new THREE.BoxGeometry(1.78, 0.44, 2.46)),
        carHeadlight: markShared(new THREE.BoxGeometry(0.36, 0.14, 0.06)),
        carTaillight: markShared(new THREE.BoxGeometry(0.42, 0.12, 0.06)),
        carTire: markShared(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10)),
        carRim: markShared(new THREE.CylinderGeometry(0.22, 0.22, 0.28, 8)),
        busBody: markShared(new THREE.BoxGeometry(2.75, 2.85, 11.4)),
        busStripe: markShared(new THREE.BoxGeometry(2.79, 0.34, 11.42)),
        busWindows: markShared(new THREE.BoxGeometry(2.78, 1.05, 9.8)),
        busSign: markShared(new THREE.PlaneGeometry(6.8, 0.72)),
        busTire: markShared(new THREE.CylinderGeometry(0.52, 0.52, 0.32, 10))
      },
      mats: {
        carGlass: markShared(new THREE.MeshStandardMaterial({ color: 0x0f172a, transparent: true, opacity: 0.74, roughness: 0.12, metalness: 0.45 })),
        busGlass: markShared(new THREE.MeshStandardMaterial({ color: 0x0f172a, transparent: true, opacity: 0.78, roughness: 0.14, metalness: 0.4 })),
        wheel: markShared(new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.82 })),
        rim: markShared(new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.22, metalness: 0.85 })),
        headlight: markShared(THREE.MeshBasicMaterial ? new THREE.MeshBasicMaterial({ color: 0xfef9c3 }) : new THREE.MeshStandardMaterial({ color: 0xfef9c3, emissive: 0xfef08a, emissiveIntensity: 0.8 })),
        taillight: markShared(THREE.MeshBasicMaterial ? new THREE.MeshBasicMaterial({ color: 0xef4444 }) : new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 0.7 })),
        busNavy: markShared(new THREE.MeshStandardMaterial({ color: 0x00205b, roughness: 0.28, metalness: 0.45 })),
        busRed: markShared(new THREE.MeshStandardMaterial({ color: 0xda291c, roughness: 0.35, metalness: 0.2 }))
      }
    };
    return this._shared;
  }

  _getBodyMat(colorHex) {
    let mat = this._bodyMats.get(colorHex);
    if (!mat) {
      mat = markShared(new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.22, metalness: 0.75 }));
      this._bodyMats.set(colorHex, mat);
    }
    return mat;
  }

  createLuxuryCar(colorHex = 0x11141a, label = 'PSG', opts = {}) {
    const { geos, mats } = this._ensureShared();
    const g = new THREE.Group();
    const bodyMat = this._getBodyMat(colorHex);
    const allowShadow = opts.castShadow !== false;

    const chassis = new THREE.Mesh(geos.carChassis, bodyMat);
    chassis.position.y = 0.58;
    chassis.castShadow = allowShadow;
    g.add(chassis);

    const cabin = new THREE.Mesh(geos.carCabin, bodyMat);
    cabin.position.set(0, 1.06, -0.15);
    cabin.castShadow = false;
    g.add(cabin);

    const windshield = new THREE.Mesh(geos.carWindshield, mats.carGlass);
    windshield.position.set(0, 1.04, -0.15);
    g.add(windshield);

    // Đèn pha & đèn hậu (dùng chung geometry + material)
    const lightXs = [-0.68, 0.68];
    for (let i = 0; i < lightXs.length; i++) {
      const x = lightXs[i];
      const hl = new THREE.Mesh(geos.carHeadlight, mats.headlight);
      hl.position.set(x, 0.64, 2.41);
      g.add(hl);
      const tl = new THREE.Mesh(geos.carTaillight, mats.taillight);
      tl.position.set(x, 0.64, -2.41);
      g.add(tl);
    }

    // 4 bánh xe có vành hợp kim (dùng chung geometry + material, tắt castShadow chi tiết nhỏ)
    const wheelCoords = [[-0.98, 1.48], [0.98, 1.48], [-0.98, -1.48], [0.98, -1.48]];
    for (let i = 0; i < wheelCoords.length; i++) {
      const [x, z] = wheelCoords[i];
      const tire = new THREE.Mesh(geos.carTire, mats.wheel);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(x, 0.36, z);
      g.add(tire);
      const rim = new THREE.Mesh(geos.carRim, mats.rim);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(x, 0.36, z);
      g.add(rim);
    }

    // Đóng băng bộ phận con, giữ nguyên root g.matrixAutoUpdate = true để caller đặt vị trí/góc quay xe
    freezeChildParts(g);
    return g;
  }

  createTeamBus() {
    const { geos, mats } = this._ensureShared();
    const g = new THREE.Group();

    const body = new THREE.Mesh(geos.busBody, mats.busNavy);
    body.position.y = 1.92;
    body.castShadow = true;
    g.add(body);

    // Dải đỏ PSG chạy dọc hai bên thân xe buýt
    const stripe = new THREE.Mesh(geos.busStripe, mats.busRed);
    stripe.position.y = 1.28;
    g.add(stripe);

    // Cửa kính toàn cảnh (MeshStandardMaterial nhẹ thay MeshPhysicalMaterial)
    const windows = new THREE.Mesh(geos.busWindows, mats.busGlass);
    windows.position.set(0, 2.48, 0.2);
    g.add(windows);

    // Biển hiệu PARIS SAINT-GERMAIN bên hông (chia sẻ 1 material duy nhất)
    if (!this._busSignMat) {
      const signTex = this.tex.signTexture('PARIS SAINT-GERMAIN · OFFICIAL TEAM BUS', '#00205b', '#ffffff', '#da291c');
      this._busSignMat = markShared(THREE.MeshBasicMaterial
        ? new THREE.MeshBasicMaterial({ map: signTex })
        : new THREE.MeshStandardMaterial({ map: signTex }));
    }
    const sideXs = [-1.40, 1.40];
    for (let i = 0; i < sideXs.length; i++) {
      const x = sideXs[i];
      const panel = new THREE.Mesh(geos.busSign, this._busSignMat);
      panel.position.set(x, 1.65, 0);
      panel.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(panel);
    }

    // 6 bánh xe buýt (dùng chung geometry + material)
    const busWheels = [[-1.36, 3.6], [1.36, 3.6], [-1.36, -2.5], [1.36, -2.5], [-1.36, -4.0], [1.36, -4.0]];
    for (let i = 0; i < busWheels.length; i++) {
      const [x, z] = busWheels[i];
      const tire = new THREE.Mesh(geos.busTire, mats.wheel);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(x, 0.52, z);
      g.add(tire);
    }

    freezeChildParts(g);
    return g;
  }
}
