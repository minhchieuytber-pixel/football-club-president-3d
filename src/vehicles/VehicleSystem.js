// src/vehicles/VehicleSystem.js
// Tạo xe Chủ tịch và xe ban lãnh đạo PSG
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
        carRim: markShared(new THREE.CylinderGeometry(0.22, 0.22, 0.28, 8))
      },
      mats: {
        carGlass: markShared(new THREE.MeshStandardMaterial({ color: 0x0f172a, transparent: true, opacity: 0.74, roughness: 0.12, metalness: 0.45 })),
        wheel: markShared(new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.82 })),
        rim: markShared(new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.22, metalness: 0.85 })),
        headlight: markShared(THREE.MeshBasicMaterial ? new THREE.MeshBasicMaterial({ color: 0xfef9c3 }) : new THREE.MeshStandardMaterial({ color: 0xfef9c3, emissive: 0xfef08a, emissiveIntensity: 0.8 })),
        taillight: markShared(THREE.MeshBasicMaterial ? new THREE.MeshBasicMaterial({ color: 0xef4444 }) : new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 0.7 }))
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
}
