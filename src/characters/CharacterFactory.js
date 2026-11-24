// src/characters/CharacterFactory.js
// Tạo mô hình nhân vật 3D có khớp nối đầy đủ (đầu, mặt, tóc, cổ, thân vest/đồ tập, tay có khớp, chân có khớp)
// Tối ưu GPU/RAM cho iPhone: chia sẻ toàn bộ BufferGeometry & MeshStandardMaterial (tag userData.sharedAsset = true),
// gom chi tiết mặt vào faceDetailGroup để ẩn ở LOD 2, giảm shadow casters xuống 2 core body meshes/nhân vật,
// và tích hợp PSG Player Kit System (render tên in hoa + số áo trực tiếp lên bề mặt UV mặt lưng áo).
import { createMappedKitChestGeometry, sharedPlayerKitSystem } from './PlayerKitSystem.js';

function tagShared(asset) {
  if (asset) {
    if (!asset.userData) asset.userData = {};
    asset.userData.sharedAsset = true;
  }
  return asset;
}

const FOOTBALL_OUTFITS = new Set([
  'player_home',
  'player_away',
  'kit_home',
  'kit_away',
  'kit_third',
  'kit_training',
  'kit_warmup',
  'kit_gk',
  'kit_scrimmage'
]);

function outfitToKitType(outfit, jerseyColor) {
  if (outfit === 'kit_away') return 'away';
  if (outfit === 'kit_third') return 'third';
  if (outfit === 'kit_training') return 'training';
  if (outfit === 'kit_warmup') return 'warmup';
  if (outfit === 'kit_gk') return 'gk';
  if (outfit === 'kit_scrimmage') return 'scrimmage';
  if (outfit === 'player_away') {
    if (jerseyColor === 0xfacc15 || jerseyColor === 0xeab308) return 'gk';
    if (jerseyColor === 0x22c55e || jerseyColor === 0x10b981) return 'gk_away';
    return 'opponent';
  }
  return 'home';
}

export class CharacterFactory {
  constructor() {
    this.skinTones = [0xf2c6a0, 0xe0ac82, 0xc68652, 0x8d5524, 0xf6d5b8];
    this.hairColors = [0x141414, 0x2c1d11, 0x4a321f, 0x6b4c2e, 0x8a8a8a, 0xb88a44];
    this._geoCache = null;
    this._matCache = new Map();
    this.kitSystem = sharedPlayerKitSystem;
  }

  _getGeometries() {
    if (this._geoCache) return this._geoCache;
    const mappedChest = createMappedKitChestGeometry() || new THREE.BoxGeometry(0.40, 0.48, 0.23);
    this._geoCache = {
      hip: tagShared(new THREE.BoxGeometry(0.34, 0.16, 0.21)),
      chest: tagShared(mappedChest),
      stripe: tagShared(new THREE.BoxGeometry(0.10, 0.46, 0.242)),
      collar: tagShared(new THREE.BoxGeometry(0.16, 0.14, 0.24)),
      tie: tagShared(new THREE.BoxGeometry(0.055, 0.30, 0.025)),
      neck: tagShared(new THREE.CylinderGeometry(0.055, 0.062, 0.10, 8)),
      head: tagShared(new THREE.SphereGeometry(0.132, 14, 12)),
      eye: tagShared(new THREE.SphereGeometry(0.015, 6, 6)),
      brow: tagShared(new THREE.BoxGeometry(0.036, 0.01, 0.012)),
      nose: tagShared(new THREE.ConeGeometry(0.016, 0.042, 6)),
      hairTop: tagShared(new THREE.SphereGeometry(0.136, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.56)),
      backHair: tagShared(new THREE.BoxGeometry(0.22, 0.18, 0.09)),
      crest: tagShared(new THREE.BoxGeometry(0.14, 0.055, 0.16)),
      upperArm: tagShared(new THREE.CylinderGeometry(0.052, 0.046, 0.28, 8)),
      lowerArm: tagShared(new THREE.CylinderGeometry(0.044, 0.036, 0.26, 8)),
      hand: tagShared(new THREE.SphereGeometry(0.042, 7, 6)),
      thigh: tagShared(new THREE.CylinderGeometry(0.074, 0.062, 0.42, 8)),
      shin: tagShared(new THREE.CylinderGeometry(0.058, 0.046, 0.40, 8)),
      shoe: tagShared(new THREE.BoxGeometry(0.10, 0.075, 0.22))
    };
    return this._geoCache;
  }

  _getMaterial(color, roughness = 0.6, metalness = 0.05) {
    const key = `${color}_${roughness}_${metalness}`;
    let mat = this._matCache.get(key);
    if (!mat) {
      mat = tagShared(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
      this._matCache.set(key, mat);
    }
    return mat;
  }

  applyPlayerKit(mesh, kitConfig = {}) {
    if (!mesh?.userData?.rig?.kitParts) return null;
    return this.kitSystem.applyKitToMesh(mesh, kitConfig, (col, r, m) => this._getMaterial(col, r, m));
  }

  releaseMeshKit(mesh) {
    if (!mesh) return;
    this.kitSystem.releaseMeshKit(mesh);
  }

  createHumanoid(config = {}) {
    const {
      outfit = 'suit_navy', // suit_president, suit_navy, suit_charcoal, coach_psg, player_home, player_away, kit_*, medical, media, security
      skinTone = 0xf2c6a0,
      hairColor = 0x161616,
      hairStyle = 0,
      heightScale = 1.0,
      tieColor = 0xda291c,
      jerseyColor = 0x00205b,
      kit = null
    } = config;

    const geo = this._getGeometries();
    const root = new THREE.Group();
    const skinMat = this._getMaterial(skinTone, 0.62, 0.02);
    const hairMat = this._getMaterial(hairColor, 0.72, 0.05);
    const shoeMat = this._getMaterial(0x111318, 0.35, 0.2);

    const isFootballKit = !!kit || FOOTBALL_OUTFITS.has(outfit);

    let topColor = 0x14213d;
    let pantsColor = 0x111827;
    let shirtColor = 0xf8fafc;
    let hasTie = false;
    let isShorts = false;

    if (outfit === 'suit_president') {
      topColor = 0x0b1528; pantsColor = 0x0b1528; hasTie = true;
    } else if (outfit === 'suit_charcoal') {
      topColor = 0x2c313c; pantsColor = 0x20242c; hasTie = true;
    } else if (outfit === 'suit_navy') {
      topColor = 0x162b4d; pantsColor = 0x13223b; hasTie = true;
    } else if (outfit === 'coach_psg') {
      topColor = 0x00205b; pantsColor = 0x0f172a; shirtColor = 0xda291c;
    } else if (isFootballKit) {
      topColor = jerseyColor; pantsColor = jerseyColor; isShorts = true;
    } else if (outfit === 'medical') {
      topColor = 0xe2e8f0; pantsColor = 0x334155; shirtColor = 0x0ea5e9;
    } else if (outfit === 'media') {
      topColor = 0x334155; pantsColor = 0x1e293b; shirtColor = 0xf1f5f9;
    } else if (outfit === 'security') {
      topColor = 0x111827; pantsColor = 0x0f172a; shirtColor = 0x38bdf8;
    }

    const topMat = this._getMaterial(topColor, 0.58, 0.08);
    const pantsMat = this._getMaterial(pantsColor, 0.65, 0.05);
    const shirtMat = this._getMaterial(shirtColor, 0.5, 0.02);

    // Hông (pelvis) là tâm khớp thân người
    const pelvis = new THREE.Group();
    pelvis.position.y = 0.92;
    root.add(pelvis);

    const hipMesh = new THREE.Mesh(geo.hip, pantsMat);
    pelvis.add(hipMesh);

    // Thân trên (torso)
    const torso = new THREE.Group();
    torso.position.y = 0.08;
    pelvis.add(torso);

    const chest = new THREE.Mesh(geo.chest, topMat);
    chest.position.y = 0.26;
    chest.castShadow = true; // Core shadow caster #1
    torso.add(chest);

    // Dải đỏ PSG giữa ngực chỉ giữ cho áo HLV tracksuit (cầu thủ dùng UV texture trực tiếp trên chest để không che chữ & số sau lưng!)
    if (outfit === 'coach_psg' && !isFootballKit) {
      const stripeMat = this._getMaterial(0xda291c, 0.5, 0.04);
      const stripe = new THREE.Mesh(geo.stripe, stripeMat);
      stripe.position.y = 0.26;
      torso.add(stripe);
    }

    // Áo sơ mi & cà vạt cho vest
    if (hasTie) {
      const collar = new THREE.Mesh(geo.collar, shirtMat);
      collar.position.set(0, 0.43, 0.005);
      torso.add(collar);
      const tieMat = this._getMaterial(tieColor, 0.35, 0.05);
      const tie = new THREE.Mesh(geo.tie, tieMat);
      tie.position.set(0, 0.28, 0.125);
      torso.add(tie);
    }

    // Cổ và đầu
    const neck = new THREE.Mesh(geo.neck, skinMat);
    neck.position.y = 0.53;
    torso.add(neck);

    const headGroup = new THREE.Group();
    headGroup.position.y = 0.66;
    torso.add(headGroup);

    const head = new THREE.Mesh(geo.head, skinMat);
    head.scale.set(0.92, 1.05, 0.95);
    head.castShadow = true; // Core shadow caster #2
    headGroup.add(head);

    // Mắt, lông mày, mũi gom thành faceDetailGroup để bật/tắt theo LOD 2
    const faceDetailGroup = new THREE.Group();
    headGroup.add(faceDetailGroup);
    const eyeMat = this._getMaterial(0x111111, 0.2, 0.05);
    for (let i = 0; i < 2; i++) {
      const ex = i === 0 ? -0.044 : 0.044;
      const eye = new THREE.Mesh(geo.eye, eyeMat);
      eye.position.set(ex, 0.018, 0.112);
      faceDetailGroup.add(eye);
      const brow = new THREE.Mesh(geo.brow, hairMat);
      brow.position.set(ex, 0.045, 0.115);
      faceDetailGroup.add(brow);
    }
    const nose = new THREE.Mesh(geo.nose, skinMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.006, 0.128);
    faceDetailGroup.add(nose);

    // Kiểu tóc đa dạng
    const hairTop = new THREE.Mesh(geo.hairTop, hairMat);
    hairTop.position.y = 0.016;
    hairTop.scale.set(0.95, 1.02, 0.98);
    headGroup.add(hairTop);
    if (hairStyle % 3 === 1) {
      // Tóc dài / búi sau
      const backHair = new THREE.Mesh(geo.backHair, hairMat);
      backHair.position.set(0, -0.04, -0.09);
      headGroup.add(backHair);
    } else if (hairStyle % 3 === 2) {
      // Kiểu tóc vuốt cao hiện đại
      const crest = new THREE.Mesh(geo.crest, hairMat);
      crest.position.set(0, 0.13, 0.02);
      headGroup.add(crest);
    }

    // Tay trái & tay phải có khớp vai + khuỷu tay (mở rộng vai ±0.255 chống cắt thân áo)
    const makeArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.255, 0.44, 0);
      torso.add(shoulder);
      const upper = new THREE.Mesh(geo.upperArm, topMat);
      upper.position.y = -0.14;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.28;
      shoulder.add(elbow);
      const lower = new THREE.Mesh(geo.lowerArm, isShorts ? skinMat : topMat);
      lower.position.y = -0.13;
      elbow.add(lower);
      const hand = new THREE.Mesh(geo.hand, skinMat);
      hand.position.y = -0.27;
      elbow.add(hand);
      return { shoulder, elbow, upper, lower };
    };
    const leftArm = makeArm(-1);
    const rightArm = makeArm(1);

    // Chân trái & chân phải có khớp hông + đầu gối + giày
    const makeLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.105, -0.04, 0);
      pelvis.add(hip);
      const thigh = new THREE.Mesh(geo.thigh, pantsMat);
      thigh.position.y = -0.21;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);
      const shinMat = isShorts ? skinMat : pantsMat;
      const shin = new THREE.Mesh(geo.shin, shinMat);
      shin.position.y = -0.20;
      knee.add(shin);
      const shoe = new THREE.Mesh(geo.shoe, shoeMat);
      shoe.position.set(0, -0.42, 0.05);
      knee.add(shoe);
      return { hip, knee, thigh, shin };
    };
    const leftLeg = makeLeg(-1);
    const rightLeg = makeLeg(1);

    root.scale.setScalar(heightScale);
    root.userData.rig = {
      pelvis,
      torso,
      headGroup,
      faceDetailGroup,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      basePelvisY: 0.92,
      animPhase: Math.random() * Math.PI * 2,
      state: 'idle',
      kitParts: {
        chest,
        hipMesh,
        upperArms: [leftArm.upper, rightArm.upper],
        lowerArms: [leftArm.lower, rightArm.lower],
        thighs: [leftLeg.thigh, rightLeg.thigh],
        shins: [leftLeg.shin, rightLeg.shin],
        skinMat,
        isFootballKit
      }
    };

    if (isFootballKit) {
      const initialKit = {
        kitType: outfitToKitType(outfit, jerseyColor),
        clubColor: jerseyColor,
        ...(kit || {})
      };
      this.applyPlayerKit(root, initialKit);
    }

    return root;
  }
}
