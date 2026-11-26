// src/scene/TrainingComplexScene.js
// Khuôn viên Huấn Luyện & Nghỉ Dưỡng Cầu Thủ PSG (PARIS SAINT-GERMAIN TRAINING CENTER)
// Nằm tách biệt về phía Đông (x ∈ [104, 236], z ∈ [-146, 28]), kết nối bằng Đại lộ nội bộ qua Cổng An Ninh (x=104, z=-24)
// Gồm:
// 1. Sân tập bóng đá chính (PSG TRAINING PITCH) + Sân tập phụ hồi phục (REHAB & WARM-UP PITCH)
// 2. Kho dụng cụ & thiết bị tập luyện (EQUIPMENT & BALL STORAGE)
// 3. Trung tâm Y tế PSG duy nhất với 6 khu chức năng (PSG MEDICAL & PERFORMANCE CENTER)
// 4. Trung tâm Thể lực & Gym (FITNESS & PERFORMANCE CENTER)
// 5. Tòa nhà Nghỉ Dưỡng Cầu Thủ 2 Tầng 30 Phòng riêng (PSG PLAYER RESIDENCE - ROOM 01..30) đồng bộ PlayerResidenceSystem
// 6. Bãi đỗ xe, cây xanh, ghế nghỉ & lối đi bộ nội bộ (tối ưu InstancedMesh & sharedAsset cho iPhone WebGL)

import { RESIDENCE_ROOM_BLUEPRINTS, CURTAIN_PROGRESS_MAP, CURTAIN_LABELS_VI } from '../club/PlayerResidenceSystem.js';
import { ResidenceInteriorFactory } from './ResidenceInteriorFactory.js';

function markShared(asset) {
  if (!asset) return asset;
  if (!asset.userData) asset.userData = {};
  asset.userData.sharedAsset = true;
  return asset;
}

function configureFlatCanvasTex(tex) {
  if (!tex) return tex;
  tex.generateMipmaps = false;
  if (typeof THREE !== 'undefined' && typeof THREE.LinearFilter !== 'undefined') {
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
  }
  return tex;
}

function freezeStaticTree(root) {
  if (!root || typeof root.traverse !== 'function') return;
  root.traverse((obj) => {
    if (obj.isLight || (obj.userData && obj.userData.dynamicObject)) return;
    if (typeof obj.updateMatrix === 'function') obj.updateMatrix();
    obj.matrixAutoUpdate = false;
  });
}

export class TrainingComplexScene {
  constructor(campusScene, texFactory, furnFactory, vehicleSystem, residenceSystem) {
    this.campus = campusScene;
    this.tex = texFactory;
    this.furn = furnFactory;
    this.vehicles = vehicleSystem;
    this.residence = residenceSystem;

    this.group = new THREE.Group();
    this.shellGroup = new THREE.Group();
    this.pitchGroup = new THREE.Group();
    this.medicalGymGroup = new THREE.Group();
    this.residenceFloor1Group = new THREE.Group();
    this.residenceSuitesGroup = new THREE.Group();
    this.residenceFloor2Group = new THREE.Group();
    this.residenceFloor1Group.add(this.residenceSuitesGroup);

    this.group.add(
      this.shellGroup,
      this.pitchGroup,
      this.medicalGymGroup,
      this.residenceFloor1Group,
      this.residenceFloor2Group
    );
    this.group.userData.shellGroup = this.shellGroup;
    this.group.userData.pitchGroup = this.pitchGroup;
    this.group.userData.medicalGymGroup = this.medicalGymGroup;
    this.group.userData.residenceFloor1Group = this.residenceFloor1Group;
    this.group.userData.residenceSuitesGroup = this.residenceSuitesGroup;
    this.group.userData.residenceFloor2Group = this.residenceFloor2Group;

    this.nameplates = []; // 30 bảng tên phòng tại PSG PLAYER RESIDENCE (dirty-key cached)
    this.roomCurtains = []; // 30 bộ rèm cửa hai cánh tại các phòng Tầng 1
    this._curtainWingMesh = null;
    this._curtainsDirty = false;
    this._doorsDirty = false;
    this._wardsDirty = false;
    this._suiteSystem = null;
    this._curtainDummy = typeof THREE !== 'undefined' && typeof THREE.Object3D === 'function' ? new THREE.Object3D() : null;
    this._signMats = new Map();

    this.campus.root.add(this.group);
    this.build();

    if (this.residence && typeof this.residence.onChange === 'function') {
      this._unsubscribeResidence = this.residence.onChange((_, meta) => {
        this.refreshNameplates();
        this.syncCurtainsFromState(!!meta?.immediateCurtains);
        this.syncRoomPropsFromState(!!meta?.immediateDoors);
      });
    }
    this.refreshNameplates();
    this.syncCurtainsFromState(true);
    this.syncRoomPropsFromState(true);
  }

  _getSignMat(text, bg = '#00205b', fg = '#ffffff', accent = '#da291c') {
    const key = `${text}|${bg}|${fg}|${accent}`;
    if (this._signMats.has(key)) return this._signMats.get(key);
    const MatCtor = typeof THREE.MeshBasicMaterial === 'function' ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
    const mat = markShared(new MatCtor({ map: this.tex.signTexture(text, bg, fg, accent) }));
    this._signMats.set(key, mat);
    return mat;
  }

  _boxGeo(w, h, d) {
    return this.furn && typeof this.furn._boxGeo === 'function'
      ? this.furn._boxGeo(w, h, d)
      : markShared(new THREE.BoxGeometry(w, h, d));
  }

  _planeGeo(w, h) {
    return this.furn && typeof this.furn._planeGeo === 'function'
      ? this.furn._planeGeo(w, h)
      : markShared(new THREE.PlaneGeometry(w, h));
  }

  _cylGeo(rt, rb, h, seg = 10) {
    return this.furn && typeof this.furn._cylGeo === 'function'
      ? this.furn._cylGeo(rt, rb, h, seg)
      : markShared(new THREE.CylinderGeometry(rt, rb, h, seg));
  }

  build() {
    this._initMaterials();
    this.buildRoadsGateAndLandscaping();
    this.buildTrainingPitchesAndStorage();
    this.buildMedicalCenter();
    this.buildFitnessCenter();
    this.buildPlayerResidence();

    freezeStaticTree(this.shellGroup);
    freezeStaticTree(this.pitchGroup);
    freezeStaticTree(this.medicalGymGroup);
    freezeStaticTree(this.residenceFloor1Group);
    freezeStaticTree(this.residenceFloor2Group);
  }

  _initMaterials() {
    this.mats = {
      whiteFacade: markShared(new THREE.MeshStandardMaterial({ color: 0xe8eaed, roughness: 0.45, metalness: 0.06 })),
      concrete: markShared(new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.7, metalness: 0.06 })),
      psgNavy: markShared(new THREE.MeshStandardMaterial({ color: 0x00205b, roughness: 0.36, metalness: 0.22 })),
      psgRed: markShared(new THREE.MeshStandardMaterial({ color: 0xda291c, roughness: 0.42, metalness: 0.16 })),
      darkSlate: markShared(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55, metalness: 0.18 })),
      roadAsphalt: markShared(new THREE.MeshStandardMaterial({ color: 0x252b36, roughness: 0.84 })),
      walkway: markShared(new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.68 })),
      medFloor: markShared(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.32, metalness: 0.06 })),
      gymFloor: markShared(new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.78, metalness: 0.05 })),
      // Sàn gỗ tối màu (nâu óc chó / espresso) bề mặt satin cao cấp cho toàn bộ Tầng 1 Player Residence
      resFloor: markShared(new THREE.MeshStandardMaterial({
        map: this.tex.woodTexture('#3d2419', '#22130c', { repeat: [16, 6], anisotropy: 4 }),
        roughness: 0.30,
        metalness: 0.08
      })),
      resWallGreyWhite: markShared(new THREE.MeshStandardMaterial({ color: 0xe9ecf0, roughness: 0.62, metalness: 0.04 })),
      resWallDarkGrey: markShared(new THREE.MeshStandardMaterial({ color: 0x343b46, roughness: 0.50, metalness: 0.08 })),
      resCeilingWhite: markShared(new THREE.MeshStandardMaterial({ color: 0xe2e6eb, roughness: 0.72, metalness: 0.02 })),
      resCurtainFabric: markShared(new THREE.MeshStandardMaterial({
        color: 0x4f5866,
        roughness: 0.88,
        metalness: 0.03,
        side: typeof THREE !== 'undefined' && typeof THREE.DoubleSide !== 'undefined' ? THREE.DoubleSide : 2
      })),
      resCurtainRod: markShared(new THREE.MeshStandardMaterial({ color: 0x1a1f28, roughness: 0.34, metalness: 0.74 })),
      resLedWarm: markShared(new THREE.MeshStandardMaterial({
        color: 0xfff3d6, emissive: 0xffd799, emissiveIntensity: 0.72, roughness: 0.25
      })),
      resLogoLed: markShared(new THREE.MeshStandardMaterial({
        color: 0xbfdbfe, emissive: 0x3b82f6, emissiveIntensity: 0.70, roughness: 0.25
      })),
      resExteriorGlass: markShared(new THREE.MeshStandardMaterial({
        color: 0x1c2838, roughness: 0.16, metalness: 0.55
      })),
      resLogoCrest: markShared(new THREE.MeshBasicMaterial({
        map: typeof this.tex.psgCrestTexture === 'function' ? this.tex.psgCrestTexture() : null,
        transparent: true
      })),
      cryoCyan: markShared(new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.35, roughness: 0.2 })),
      bedWhite: markShared(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.65 })),
      netWire: markShared(new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.35 })),
      floodGlow: markShared(new THREE.MeshBasicMaterial({ color: 0xfff8e1 }))
    };
    this._curtainWingGeo = this._createPleatedCurtainWingGeo(1.91, 3.68, 5);
  }

  // Tạo hình học cánh rèm vải dày có nếp gấp sóng tự nhiên (tái sử dụng 1 BufferGeometry duy nhất cho mọi rèm Tầng 1)
  _createPleatedCurtainWingGeo(width = 1.91, height = 3.68, pleats = 5) {
    const segs = pleats * 4;
    const cols = segs + 1;
    const halfThick = 0.017;
    const amp = 0.036;
    const positions = [];
    const uvs = [];
    const indices = [];

    // Mặt trước (0..cols*2-1) & Mặt sau (cols*2..cols*4-1)
    for (let side = 0; side < 2; side++) {
      const zOff = side === 0 ? halfThick : -halfThick;
      for (let i = 0; i < cols; i++) {
        const u = i / segs;
        const x = u * width;
        const wave = Math.sin(u * Math.PI * 2 * pleats) * amp;
        const z = wave + zOff;
        positions.push(x, 0, z);
        uvs.push(u, 0);
        positions.push(x, height, z);
        uvs.push(u, 1);
      }
    }

    const backOffset = cols * 2;
    for (let i = 0; i < segs; i++) {
      const f0 = i * 2;
      const f1 = f0 + 1;
      const f2 = (i + 1) * 2;
      const f3 = f2 + 1;
      // Mặt trước (+Z)
      indices.push(f0, f2, f1, f1, f2, f3);

      const b0 = backOffset + f0;
      const b1 = backOffset + f1;
      const b2 = backOffset + f2;
      const b3 = backOffset + f3;
      // Mặt sau (-Z)
      indices.push(b0, b1, b2, b1, b3, b2);
    }

    // Đóng mép hai bên (i=0 và i=segs) để tạo độ dày vải rèm thực tế
    const lF0 = 0, lF1 = 1, lB0 = backOffset, lB1 = backOffset + 1;
    indices.push(lF0, lF1, lB0, lF1, lB1, lB0);
    const rF0 = segs * 2, rF1 = segs * 2 + 1, rB0 = backOffset + segs * 2, rB1 = backOffset + segs * 2 + 1;
    indices.push(rF0, rB0, rF1, rF1, rB0, rB1);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals?.();
    geo.computeBoundingSphere?.();
    return markShared(geo);
  }

  // ==================== 1. ĐƯỜNG NỘI BỘ, CỔNG AN NINH, BÃI ĐỖ XE & CÂY XANH ====================
  buildRoadsGateAndLandscaping() {
    // Đại lộ nối từ Đường Đông (x=66, z=-24) -> Cổng An Ninh (x=104) -> Trục chính Khu Huấn luyện (x=114)
    const linkRoad = new THREE.Mesh(this._boxGeo(52, 0.06, 8.6), this.mats.roadAsphalt);
    linkRoad.position.set(92, 0.01, -24);
    linkRoad.receiveShadow = true;
    this.shellGroup.add(linkRoad);

    // Trục đường nội bộ Bắc-Nam dọc phía Tây Khu Huấn Luyện (x=114, z ∈ [-130, 22])
    const avenue = new THREE.Mesh(this._boxGeo(8.0, 0.06, 152), this.mats.roadAsphalt);
    avenue.position.set(114, 0.01, -54);
    avenue.receiveShadow = true;
    this.shellGroup.add(avenue);

    // Quảng trường đi bộ trung tâm kết nối Locker Room, Medical, Fitness, Player Residence
    const centralPlaza = new THREE.Mesh(this._boxGeo(108, 0.07, 22), this.mats.walkway);
    centralPlaza.position.set(170, 0.015, -17);
    centralPlaza.receiveShadow = true;
    this.shellGroup.add(centralPlaza);

    // Đường đi bộ nối Phòng Thay Đồ (143, -47.5) <-> Kho dụng cụ <-> Sân Tập Chính (192, -86) <-> Y tế & Gym
    const pitchWalkNS = new THREE.Mesh(this._boxGeo(5.8, 0.07, 78), this.mats.walkway);
    pitchWalkNS.position.set(149, 0.015, -63);
    const sidelineWalkEW = new THREE.Mesh(this._boxGeo(84, 0.07, 7.5), this.mats.walkway);
    sidelineWalkEW.position.set(186, 0.015, -56);
    const lockerJoin = new THREE.Mesh(this._boxGeo(10, 0.07, 5.4), this.mats.walkway);
    lockerJoin.position.set(145, 0.015, -47.5);
    this.shellGroup.add(pitchWalkNS, sidelineWalkEW, lockerJoin);

    // Cổng vòm An Ninh: PARIS SAINT-GERMAIN TRAINING CENTER tại x=104, z=-24
    const pillarL = new THREE.Mesh(this._boxGeo(1.4, 5.0, 1.4), this.mats.psgNavy);
    pillarL.position.set(104, 2.5, -29.2);
    const pillarR = new THREE.Mesh(this._boxGeo(1.4, 5.0, 1.4), this.mats.psgNavy);
    pillarR.position.set(104, 2.5, -18.8);
    const archBeam = new THREE.Mesh(this._boxGeo(1.8, 1.25, 12.2), this.mats.psgNavy);
    archBeam.position.set(104, 5.2, -24);
    const archTrim = new THREE.Mesh(this._boxGeo(1.85, 0.25, 12.2), this.mats.psgRed);
    archTrim.position.set(104, 4.48, -24);
    const gateSignW = new THREE.Mesh(
      this._planeGeo(10.8, 0.96),
      this._getSignMat('PARIS SAINT-GERMAIN TRAINING CENTER', '#00205b', '#ffffff', '#da291c')
    );
    gateSignW.position.set(103.05, 5.2, -24);
    gateSignW.rotation.y = -Math.PI / 2;
    const gateSignE = new THREE.Mesh(
      this._planeGeo(10.8, 0.96),
      this._getSignMat('PARIS SAINT-GERMAIN TRAINING CENTER', '#00205b', '#ffffff', '#da291c')
    );
    gateSignE.position.set(104.95, 5.2, -24);
    gateSignE.rotation.y = Math.PI / 2;

    // Trạm bảo vệ cổng Khu Huấn luyện
    const guardBox = new THREE.Mesh(this._boxGeo(3.2, 2.9, 3.0), this.mats.darkSlate);
    guardBox.position.set(104, 1.45, -31.8);
    this.shellGroup.add(pillarL, pillarR, archBeam, archTrim, gateSignW, gateSignE, guardBox);
    this.campus.addCollider(104, -29.2, 1.4, 1.4);
    this.campus.addCollider(104, -18.8, 1.4, 1.4);
    this.campus.addCollider(104, -31.8, 3.2, 3.0);

    // Bãi đỗ xe Khu Huấn luyện (x ∈ [119, 139], z ∈ [-12, 12])
    const parkingPad = new THREE.Mesh(this._boxGeo(20, 0.06, 26), this.mats.roadAsphalt);
    parkingPad.position.set(129, 0.01, 0);
    parkingPad.receiveShadow = true;
    this.shellGroup.add(parkingPad);
    this.campus.roomWaypoints.training_parking = { x: 118, z: -4 };

    if (this.vehicles) {
      const carZs = [-9, -3, 3, 9];
      const colors = [0x0f172a, 0x00205b, 0x334155, 0x1e293b];
      for (let i = 0; i < carZs.length; i++) {
        const car = this.vehicles.createLuxuryCar(colors[i % colors.length], 'PSG', { castShadow: false });
        car.position.set(130, 0.03, carZs[i]);
        car.rotation.y = -Math.PI / 2;
        this.shellGroup.add(car);
        this.campus.addCollider(130, carZs[i], 4.9, 2.2);
      }
    }

    // Vạch kẻ đường & Cây xanh cảnh quan + Ghế công viên (InstancedMesh)
    const treeCoords = [
      [108, -14], [108, 6], [108, -36], [108, -56], [108, -80],
      [124, 18], [134, 18], [124, -16], [134, -16],
      [152, -20], [184, -20], [216, -20],
      [230, -32], [230, -52], [230, 6], [230, 20]
    ];
    const trunks = new THREE.InstancedMesh(
      this._cylGeo(0.22, 0.34, 2.8, 7),
      this.furn.mats.bark,
      treeCoords.length
    );
    const crowns = new THREE.InstancedMesh(
      markShared(new THREE.DodecahedronGeometry(1.9, 1)),
      this.furn.mats.foliage,
      treeCoords.length
    );
    const dummy = new THREE.Object3D();
    for (let i = 0; i < treeCoords.length; i++) {
      const [tx, tz] = treeCoords[i];
      dummy.position.set(tx, 1.4, tz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      this.campus.addCollider(tx, tz, 0.9, 0.9);
      dummy.position.set(tx, 3.6, tz);
      dummy.scale.set(1.1, 1.05, 1.1);
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
    }
    this.shellGroup.add(trunks, crowns);

    // Ghế nghỉ công viên dọc quảng trường xanh
    const benchCoords = [
      [129, 17.5, 0], [137, 17.5, 0], [157, -14, Math.PI], [212, -14, Math.PI]
    ];
    const benchInst = new THREE.InstancedMesh(this._boxGeo(2.4, 0.48, 0.65), this.furn.mats.walnut, benchCoords.length);
    for (let i = 0; i < benchCoords.length; i++) {
      const [bx, bz, rotY] = benchCoords[i];
      dummy.position.set(bx, 0.28, bz);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      benchInst.setMatrixAt(i, dummy.matrix);
      this.campus.addCollider(bx, bz, rotY === 0 ? 2.4 : 0.65, rotY === 0 ? 0.65 : 2.4);
    }
    this.shellGroup.add(benchInst);
  }

  // ==================== 2. SÂN TẬP CHÍNH, SÂN TẬP PHỤ & KHO DỤNG CỤ ====================
  buildTrainingPitchesAndStorage() {
    const cx = 192;
    const cz = -86;
    this.campus.roomWaypoints.pitch = { x: cx, z: -60 };
    this.campus.roomWaypoints.training_pitch = { x: cx, z: -60 };

    // Mặt cỏ sân tập chính 78m x 50m (x ∈ [153, 231], z ∈ [-111, -61])
    const mainTurf = new THREE.Mesh(
      this._planeGeo(78, 50),
      markShared(new THREE.MeshStandardMaterial({
        map: this.tex.grassPitchTexture(true),
        roughness: 0.8
      }))
    );
    mainTurf.rotation.x = -Math.PI / 2;
    mainTurf.position.set(cx, 0.04, cz);
    mainTurf.receiveShadow = true;
    this.pitchGroup.add(mainTurf);

    // Hai khung thành + lưới cầu môn
    const postMat = markShared(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.4 }));
    const postGeo = this._cylGeo(0.07, 0.07, 2.5, 8);
    const barGeo = this._cylGeo(0.07, 0.07, 7.4, 8);
    const netGeo = this._boxGeo(1.6, 2.45, 7.2);
    [-36.2, 36.2].forEach((ox) => {
      const g = new THREE.Group();
      const pL = new THREE.Mesh(postGeo, postMat); pL.position.set(0, 1.25, -3.65);
      const pR = new THREE.Mesh(postGeo, postMat); pR.position.set(0, 1.25, 3.65);
      const bar = new THREE.Mesh(barGeo, postMat); bar.rotation.x = Math.PI / 2; bar.position.set(0, 2.5, 0);
      const net = new THREE.Mesh(netGeo, this.mats.netWire); net.position.set(ox < 0 ? -0.82 : 0.82, 1.22, 0);
      g.add(pL, pR, bar, net);
      g.position.set(cx + ox, 0.04, cz);
      this.pitchGroup.add(g);
    });

    // 4 cột cờ góc sân tập
    const flagPoleGeo = this._cylGeo(0.03, 0.03, 1.5, 6);
    const flagClothGeo = this._planeGeo(0.45, 0.32);
    [[-36.5, -22.5], [36.5, -22.5], [-36.5, 22.5], [36.5, 22.5]].forEach(([fx, fz]) => {
      const pole = new THREE.Mesh(flagPoleGeo, postMat);
      pole.position.set(cx + fx, 0.78, cz + fz);
      const flag = new THREE.Mesh(flagClothGeo, this.mats.psgRed);
      flag.position.set(cx + fx + 0.22, 1.38, cz + fz);
      this.pitchGroup.add(pole, flag);
    });

    // 4 trụ đèn pha chiếu sáng sân tập (Instanced / shared)
    const pylonGeo = this._cylGeo(0.28, 0.42, 13, 8);
    const lampHeadGeo = this._boxGeo(2.8, 1.1, 0.5);
    [[-41, -27], [41, -27], [-41, 27], [41, 27]].forEach(([lx, lz]) => {
      const pylon = new THREE.Mesh(pylonGeo, this.furn.mats.aluminum);
      pylon.position.set(cx + lx, 6.5, cz + lz);
      const head = new THREE.Mesh(lampHeadGeo, this.mats.floodGlow);
      head.position.set(cx + lx, 13.1, cz + lz);
      head.lookAt(cx, 0, cz);
      this.pitchGroup.add(pylon, head);
      this.campus.addCollider(cx + lx, cz + lz, 0.9, 0.9);
    });

    // Hàng rào bảo vệ sân tập (chừa lối vào rộng ở phía Nam & phía Tây cho cầu thủ/BHL)
    const fenceMat = this.furn.mats.aluminum;
    const addFence = (x, z, w, d) => {
      const m = new THREE.Mesh(this._boxGeo(w, 1.35, d), fenceMat);
      m.position.set(x, 0.7, z);
      this.pitchGroup.add(m);
      this.campus.addCollider(x, z, w, d);
    };
    addFence(cx, -112.2, 80, 0.25);        // Rào Bắc
    addFence(232.2, cz, 0.25, 52);         // Rào Đông
    addFence(151.8, -102, 0.25, 19);       // Rào Tây Bắc (chừa lối mở z ∈ [-92.5, -79.5])
    addFence(151.8, -69.5, 0.25, 19);      // Rào Tây Nam
    addFence(166.5, -60.0, 29, 0.25);      // Rào Nam Tây (chừa lối vào chính x ∈ [181, 203])
    addFence(217.5, -60.0, 29, 0.25);      // Rào Nam Đông

    // Biển quảng cáo PSG dọc đường biên Bắc sân tập
    const adBoard = new THREE.Mesh(
      this._boxGeo(56, 1.05, 0.22),
      this._getSignMat('PSG TRAINING PITCH  ·  ICI C\'EST PARIS  ·  PARIS SAINT-GERMAIN', '#00205b', '#ffffff', '#da291c')
    );
    adBoard.position.set(cx, 0.58, -111.5);
    this.pitchGroup.add(adBoard);

    // Biển hiệu cổng vào sân tập & Khu vực BHL quan sát bên đường biên Nam (z = -55.5)
    const pitchEntrySign = new THREE.Mesh(
      this._planeGeo(11.5, 1.15),
      this._getSignMat('PSG TRAINING PITCH · SÂN TẬP CHÍNH ĐỘI MỘT', '#00205b', '#ffffff', '#da291c')
    );
    pitchEntrySign.position.set(cx, 3.6, -59.5);
    const signPoleL = new THREE.Mesh(this._cylGeo(0.08, 0.08, 3.8, 6), this.furn.mats.aluminum);
    signPoleL.position.set(cx - 5.2, 1.9, -59.5);
    const signPoleR = new THREE.Mesh(this._cylGeo(0.08, 0.08, 3.8, 6), this.furn.mats.aluminum);
    signPoleR.position.set(cx + 5.2, 1.9, -59.5);
    this.pitchGroup.add(pitchEntrySign, signPoleL, signPoleR);

    // Ghế ngồi quan sát & BHL bên đường biên Nam sân tập
    [-11, 0, 11].forEach((ox, idx) => {
      const bench = new THREE.Mesh(this._boxGeo(4.8, 0.55, 0.9), this.mats.psgNavy);
      bench.position.set(cx + ox, 0.3, -55.5);
      const canopy = new THREE.Mesh(this._boxGeo(5.0, 0.14, 1.4), this.furn.mats.glass);
      canopy.position.set(cx + ox, 2.25, -55.3);
      this.pitchGroup.add(bench, canopy);
      this.campus.addCollider(cx + ox, -55.5, 4.8, 0.9);
      this.campus.tagInteractable(bench, `tc_pitch_bench_${idx}`, 'Mở Trung Tâm Huấn Luyện 3D PSG', '📋', 'open_training');
    });

    // Sân tập phụ / Tập hồi phục phía Bắc sân tập chính (cx=192, cz=-131, 48m x 26m)
    const rehabTurf = new THREE.Mesh(
      this._planeGeo(48, 26),
      markShared(new THREE.MeshStandardMaterial({ map: this.tex.grassPitchTexture(false), roughness: 0.82 }))
    );
    rehabTurf.rotation.x = -Math.PI / 2;
    rehabTurf.position.set(cx, 0.035, -131);
    rehabTurf.receiveShadow = true;
    const rehabSign = new THREE.Mesh(
      this._planeGeo(10.5, 1.0),
      this._getSignMat('REHAB & WARM-UP PITCH · SÂN TẬP PHỤ & HỒI PHỤC', '#0f2c59', '#ffffff', '#22c55e')
    );
    rehabSign.position.set(cx, 2.2, -117.6);
    this.pitchGroup.add(rehabTurf, rehabSign);

    // Kho dụng cụ & thiết bị tập luyện: (136, -74), 10m x 7m (x ∈ [131, 141], z ∈ [-77.5, -70.5])
    const sx = 136, sz = -74;
    const stFloor = new THREE.Mesh(this._boxGeo(10, 0.14, 7), this.mats.concrete);
    stFloor.position.set(sx, 0.07, sz);
    const stRoof = new THREE.Mesh(this._boxGeo(10.4, 0.32, 7.4), this.mats.darkSlate);
    stRoof.position.set(sx, 3.35, sz);
    const addStWall = (wx, wz, w, d) => {
      const m = new THREE.Mesh(this._boxGeo(w, 3.2, d), this.mats.whiteFacade);
      m.position.set(wx, 1.68, wz);
      this.pitchGroup.add(m);
      this.campus.addCollider(wx, wz, w, d);
    };
    addStWall(sx, sz - 3.4, 10, 0.24);
    addStWall(sx, sz + 3.4, 10, 0.24);
    addStWall(sx - 4.9, sz, 0.24, 7);
    addStWall(sx + 4.9, sz - 2.35, 0.24, 2.3);
    addStWall(sx + 4.9, sz + 2.35, 0.24, 2.3);

    const stSign = new THREE.Mesh(
      this._planeGeo(6.4, 0.78),
      this._getSignMat('EQUIPMENT STORAGE · KHO DỤNG CỤ TẬP LUYỆN', '#00205b', '#ffffff', '#da291c')
    );
    stSign.position.set(sx + 5.1, 2.85, sz);
    stSign.rotation.y = Math.PI / 2;
    const rack = this.furn.createFilingCabinet(1.8, 2.0, 0.55);
    rack.position.set(sx - 3.6, 0.14, sz);
    rack.rotation.y = Math.PI / 2;
    const ballCart = new THREE.Mesh(this._boxGeo(1.4, 0.95, 1.0), this.mats.psgNavy);
    ballCart.position.set(sx - 0.5, 0.6, sz + 1.4);
    this.pitchGroup.add(stFloor, stRoof, stSign, rack, ballCart);
    this.campus.addCollider(sx - 0.5, sz + 1.4, 1.4, 1.0);
    this.campus.tagInteractable(ballCart, 'tc_equip_cart', 'Kiểm tra Thiết bị & Lịch Tập luyện PSG', '⚽', 'open_training');
  }

  // ==================== 3. TRUNG TÂM Y TẾ PSG DUY NHẤT (6 KHU CHỨC NĂNG) ====================
  buildMedicalCenter() {
    const cx = 168, cz = -38;
    // Kích thước 26m x 20m (x ∈ [155, 181], z ∈ [-48, -28])
    this.campus.roomWaypoints.medical = { x: cx, z: cz + 4.0 };

    const floor = new THREE.Mesh(this._boxGeo(26, 0.16, 20), this.mats.medFloor);
    floor.position.set(cx, 0.06, cz);
    floor.receiveShadow = true;
    const roof = new THREE.Mesh(this._boxGeo(26.8, 0.38, 20.8), this.mats.whiteFacade);
    roof.position.set(cx, 4.55, cz);
    const navyFascia = new THREE.Mesh(this._boxGeo(26.9, 0.45, 20.9), this.mats.psgNavy);
    navyFascia.position.set(cx, 4.2, cz);
    this.shellGroup.add(floor, roof, navyFascia);

    const addMedWall = (x, z, w, d, target = this.shellGroup) => {
      const m = new THREE.Mesh(this._boxGeo(w, 4.25, d), this.mats.whiteFacade);
      m.position.set(x, 2.22, z);
      target.add(m);
      this.campus.addCollider(x, z, w, d);
    };
    // Tường Tây & Tường Đông
    addMedWall(cx - 13, cz, 0.26, 20);
    addMedWall(cx + 13, cz, 0.26, 20);

    // Mặt tiền Nam (z = -28): Kính cường lực + Cửa chính `door_tc_medical`
    this.campus.addGlassWindow(cx - 7.0, cz + 10, 12, 0, false);
    this.campus.addWoodenDoor('door_tc_medical', cx, cz + 10, 0, 2.2, true);
    this.campus.addGlassWindow(cx + 7.0, cz + 10, 12, 0, false);

    // Mặt Bắc hướng sân tập (z = -48): Kính + Cửa tự động đi thẳng ra đường sân tập
    this.campus.addGlassWindow(cx - 7.0, cz - 10, 12, 0, false);
    const northDoor = this.campus.addWoodenDoor('door_tc_medical_north', cx, cz - 10, 0, 2.2, false);
    if (northDoor) northDoor.autoOpenNearPlayer = true;
    this.campus.addGlassWindow(cx + 7.0, cz - 10, 12, 0, false);

    const medFacadeSign = new THREE.Mesh(
      this._planeGeo(15.5, 1.3),
      this._getSignMat('PSG MEDICAL CENTER · TRUNG TÂM Y TẾ & PHỤC HỒI', '#00205b', '#ffffff', '#da291c')
    );
    medFacadeSign.position.set(cx, 3.85, cz + 10.22);
    this.shellGroup.add(medFacadeSign);

    const medNorthSign = new THREE.Mesh(
      this._planeGeo(12.5, 1.1),
      this._getSignMat('PSG MEDICAL & PERFORMANCE CENTER', '#00205b', '#ffffff', '#22c55e')
    );
    medNorthSign.position.set(cx, 3.85, cz - 10.22);
    medNorthSign.rotation.y = Math.PI;
    this.shellGroup.add(medNorthSign);

    // === 6 KHU CHỨC NĂNG BÊN TRONG TRUNG TÂM Y TẾ ===
    // 1. Khu Khám Tổng Quát (Tây Nam)
    const examLabel = new THREE.Mesh(this._planeGeo(3.6, 0.48), this._getSignMat('1. KHÁM TỔNG QUÁT', '#0f172a', '#e2e8f0', '#38bdf8'));
    examLabel.position.set(160.2, 2.6, -28.25);
    examLabel.rotation.y = Math.PI;
    this.medicalGymGroup.add(examLabel);
    [158.0, 161.2].forEach((bx, idx) => {
      const bed = this.furn.createMedicalBed();
      bed.position.set(bx, 0.14, -31.5);
      this.medicalGymGroup.add(bed);
      this.campus.addCollider(bx, -31.5, 2.1, 0.95);
      this.campus.tagInteractable(bed, `tc_med_exam_${idx}`, 'Khám Tổng Quát & Kiểm tra Chấn thương', '🩺', 'open_medical');
    });

    // 2. Khu Vật Lý Trị Liệu (Tây Bắc)
    const physLabel = new THREE.Mesh(this._planeGeo(3.6, 0.48), this._getSignMat('2. VẬT LÝ TRỊ LIỆU', '#0f172a', '#e2e8f0', '#22c55e'));
    physLabel.position.set(160.2, 2.6, -47.75);
    this.medicalGymGroup.add(physLabel);
    [157.8, 161.2].forEach((px, idx) => {
      const table = this.furn.createMedicalBed();
      table.position.set(px, 0.14, -44.2);
      this.medicalGymGroup.add(table);
      this.campus.addCollider(px, -44.2, 2.1, 0.95);
      this.campus.tagInteractable(table, `tc_med_physio_${idx}`, 'Phục hồi Vật lý Trị liệu PSG', '🏥', 'open_medical');
    });

    // 3. Khu Liệu Pháp Lạnh & Phục Hồi (Cryo/Hydro — Đông Bắc)
    const cryoLabel = new THREE.Mesh(this._planeGeo(4.0, 0.48), this._getSignMat('3. LIỆU PHÁP LẠNH CRYO', '#0f172a', '#bae6fd', '#38bdf8'));
    cryoLabel.position.set(175.5, 2.6, -47.75);
    this.medicalGymGroup.add(cryoLabel);
    const cryoPod = new THREE.Mesh(this._cylGeo(0.95, 0.95, 2.35, 16), this.mats.cryoCyan);
    cryoPod.position.set(174.5, 1.32, -44.5);
    const cryoRing = new THREE.Mesh(this._cylGeo(1.12, 1.12, 0.35, 16), this.mats.psgNavy);
    cryoRing.position.set(174.5, 0.3, -44.5);
    const iceTub = new THREE.Mesh(this._boxGeo(2.4, 0.78, 1.35), this.mats.cryoCyan);
    iceTub.position.set(178.2, 0.52, -44.2);
    this.medicalGymGroup.add(cryoPod, cryoRing, iceTub);
    this.campus.addCollider(174.5, -44.5, 2.2, 2.2);
    this.campus.addCollider(178.2, -44.2, 2.4, 1.35);
    this.campus.tagInteractable(cryoPod, 'tc_med_cryo', 'Buồng Liệu pháp Lạnh & Hồi phục Nhanh', '❄️', 'open_medical');

    // 4. Khu Kiểm Tra Thể Lực & Y Sinh (Trung tâm Bắc)
    const testMachine = this.furn.createWallScreen(2.4, 1.3, 'BIOMECHANICS & VO2 LAB');
    testMachine.position.set(168, 2.3, -47.7);
    const diagDesk = this.furn.createStaffDesk('BIOMETRIC SCAN');
    diagDesk.position.set(168, 0.14, -42.5);
    this.medicalGymGroup.add(testMachine, diagDesk);
    this.campus.addCollider(168, -42.5, 1.7, 0.85);
    this.campus.tagInteractable(diagDesk, 'tc_med_biometrics', 'Đo Sinh trắc học & Thể lực Cầu thủ', '📊', 'open_medical');

    // 5. Văn Phòng Trưởng Bộ Phận Y Tế & Chuyên Gia Phục Hồi (Đông Nam — khớp vị trí chair cho npc_med & rehab_coach!)
    const medHeadSign = new THREE.Mesh(
      this._planeGeo(4.8, 0.52),
      this._getSignMat('VĂN PHÒNG TRƯỞNG BỘ PHẬN Y TẾ · HEAD OF MEDICAL', '#0f172a', '#fde68a', '#22c55e')
    );
    medHeadSign.position.set(174.5, 2.95, -28.25);
    medHeadSign.rotation.y = Math.PI;
    this.medicalGymGroup.add(medHeadSign);

    const docDesk = this.furn.createExecutiveDesk(2.2, 1.0, false);
    docDesk.position.set(174.5, 0.14, -33.2);
    docDesk.rotation.y = Math.PI;
    const docChair = this.furn.createSwivelChair(true);
    docChair.position.set(174.5, 0.14, -35.5);
    docChair.rotation.y = Math.PI;
    this.medicalGymGroup.add(docDesk, docChair);
    this.campus.addCollider(174.5, -33.2, 2.2, 1.0);
    this.campus.registerChairPosition(174.5, -35.5, 0.14);
    this.campus.tagInteractable(docDesk, 'tc_med_doctor_desk', 'Văn phòng Trưởng Bộ phận Y tế PSG', '🩺', 'open_medical');

    // Khu vực tiếp nhận báo cáo Y tế
    const reportsDesk = this.furn.createStaffDesk('TIẾP NHẬN BÁO CÁO Y TẾ');
    reportsDesk.position.set(170.5, 0.14, -31.8);
    reportsDesk.rotation.y = Math.PI;
    this.medicalGymGroup.add(reportsDesk);
    this.campus.addCollider(170.5, -31.8, 1.65, 0.82);
    this.campus.tagInteractable(reportsDesk, 'tc_med_reports', 'Khu vực Tiếp nhận Báo cáo & Hồ sơ Y tế', '📋', 'open_medical');

    // Tủ hồ sơ y tế (tường Đông)
    [-31.6, -33.5].forEach((czCab, idx) => {
      const cab = this.furn.createFilingCabinet(1.5, 2.0, 0.44);
      cab.position.set(180.4, 0.14, czCab);
      cab.rotation.y = -Math.PI / 2;
      this.medicalGymGroup.add(cab);
      this.campus.addCollider(180.4, czCab, 0.48, 1.52);
      this.campus.tagInteractable(cab, `tc_med_records_${idx}`, 'Tủ Hồ sơ Y tế & Bệnh án Cầu thủ PSG', '📁', 'open_medical');
    });

    // Màn hình theo dõi sức khỏe & Bảng lịch khám phục hồi
    const vitalsMonitor = this.furn.createWallScreen(2.8, 1.45, 'PLAYER VITALS & INJURY MONITOR');
    vitalsMonitor.position.set(180.7, 2.25, -36.5);
    vitalsMonitor.rotation.y = -Math.PI / 2;
    this.medicalGymGroup.add(vitalsMonitor);
    this.campus.tagInteractable(vitalsMonitor, 'tc_med_monitor', 'Màn hình Theo dõi Sức khỏe & Nhịp sinh học', '💓', 'open_medical');

    const scheduleBoard = this.furn.createWallScreen(2.5, 1.32, 'LỊCH KHÁM & PHỤC HỒI HÔM NAY');
    scheduleBoard.position.set(174.5, 2.02, -28.25);
    scheduleBoard.rotation.y = Math.PI;
    this.medicalGymGroup.add(scheduleBoard);
    this.campus.tagInteractable(scheduleBoard, 'tc_med_schedule_board', 'Bảng Lịch Khám & Phục Hồi Y Tế', '📅', 'open_medical');

    // Bàn & ghế Chuyên gia phục hồi (rehab_coach tại 162.5, -36.5)
    const rehabDesk = this.furn.createStaffDesk('REHAB & RECOVERY');
    rehabDesk.position.set(162.5, 0.14, -38.0);
    const rehabChair = this.furn.createSwivelChair(false);
    rehabChair.position.set(162.5, 0.14, -36.5);
    this.medicalGymGroup.add(rehabDesk, rehabChair);
    this.campus.addCollider(162.5, -38.0, 1.65, 0.82);
    this.campus.registerChairPosition(162.5, -36.5, 0.14);

    // 6. Khu Giường Nghỉ Phục Hồi Yên Tĩnh (Đông Giữa)
    [173.5, 177.2].forEach((rx, idx) => {
      const qBed = this.furn.createMedicalBed();
      qBed.position.set(rx, 0.14, -38.8);
      this.medicalGymGroup.add(qBed);
      this.campus.addCollider(rx, -38.8, 2.1, 0.95);
      this.campus.tagInteractable(qBed, `tc_med_quiet_${idx}`, 'Khu Giường Nghỉ Phục Hồi Yên Tĩnh', '🛏️', 'open_medical');
    });
  }

  // ==================== 4. KHU TẬP GYM & THỂ LỰC (FITNESS & PERFORMANCE CENTER) ====================
  buildFitnessCenter() {
    const cx = 200, cz = -38;
    // Kích thước 28m x 20m (x ∈ [186, 214], z ∈ [-48, -28])
    this.campus.roomWaypoints.fitness = { x: cx, z: cz + 4.0 };

    const floor = new THREE.Mesh(this._boxGeo(28, 0.16, 20), this.mats.gymFloor);
    floor.position.set(cx, 0.06, cz);
    floor.receiveShadow = true;
    const roof = new THREE.Mesh(this._boxGeo(28.8, 0.38, 20.8), this.mats.darkSlate);
    roof.position.set(cx, 4.55, cz);
    const redStripe = new THREE.Mesh(this._boxGeo(28.9, 0.32, 20.9), this.mats.psgRed);
    redStripe.position.set(cx, 4.2, cz);
    this.shellGroup.add(floor, roof, redStripe);

    const addGymWall = (x, z, w, d) => {
      const m = new THREE.Mesh(this._boxGeo(w, 4.25, d), this.mats.whiteFacade);
      m.position.set(x, 2.22, z);
      this.shellGroup.add(m);
      this.campus.addCollider(x, z, w, d);
    };
    addGymWall(cx - 14, cz, 0.26, 20);
    addGymWall(cx + 14, cz, 0.26, 20);
    this.campus.addGlassWindow(cx, cz - 10, 28, 0, false);

    // Mặt tiền Nam (z = -28): Kính + Cửa chính `door_fitness`
    this.campus.addGlassWindow(cx - 8.0, cz + 10, 12, 0, false);
    this.campus.addWoodenDoor('door_fitness', cx, cz + 10, 0, 2.2, true);
    this.campus.addGlassWindow(cx + 8.0, cz + 10, 12, 0, false);

    const fitSign = new THREE.Mesh(
      this._planeGeo(15.5, 1.3),
      this._getSignMat('FITNESS & PERFORMANCE CENTER · GYM & THỂ LỰC PSG', '#00205b', '#ffffff', '#da291c')
    );
    fitSign.position.set(cx, 3.85, cz + 10.22);
    this.shellGroup.add(fitSign);

    // Dàn máy chạy bộ (Treadmills) góc Tây Bắc Gym
    for (let i = 0; i < 4; i++) {
      const tx = 188.8 + i * 2.1;
      const tz = -44.2;
      const base = new THREE.Mesh(this._boxGeo(1.0, 0.22, 2.1), this.furn.mats.matteBlack);
      base.position.set(tx, 0.25, tz);
      const consolePost = new THREE.Mesh(this._boxGeo(0.85, 1.3, 0.35), this.furn.mats.aluminum);
      consolePost.position.set(tx, 0.9, tz - 0.8);
      this.medicalGymGroup.add(base, consolePost);
      this.campus.addCollider(tx, tz, 1.0, 2.1);
      if (i === 0) this.campus.tagInteractable(base, 'tc_gym_treadmill', 'Kiểm tra Thể lực & Gym Cầu thủ PSG', '🏃', 'open_fitness');
    }

    // Dàn xe đạp thể lực (Exercise Bikes) góc Đông Bắc Gym
    for (let i = 0; i < 3; i++) {
      const bx = 204.5 + i * 2.4;
      const bz = -44.0;
      const frame = new THREE.Mesh(this._boxGeo(0.75, 0.85, 1.35), this.mats.psgNavy);
      frame.position.set(bx, 0.56, bz);
      this.medicalGymGroup.add(frame);
      this.campus.addCollider(bx, bz, 0.8, 1.4);
    }

    // Khu Tạ & Squat Racks góc Tây Nam Gym
    [190.5, 194.2].forEach((rx, idx) => {
      const rack = new THREE.Mesh(this._boxGeo(1.75, 2.2, 1.4), this.furn.mats.aluminum);
      rack.position.set(rx, 1.24, -34.2);
      const barbell = new THREE.Mesh(this._cylGeo(0.04, 0.04, 2.1, 8), this.furn.mats.chrome);
      barbell.rotation.z = Math.PI / 2;
      barbell.position.set(rx, 1.45, -34.2);
      this.medicalGymGroup.add(rack, barbell);
      this.campus.addCollider(rx, -34.2, 1.85, 1.5);
      if (idx === 0) this.campus.tagInteractable(rack, 'tc_gym_weights', 'Trung tâm Thể lực & Sức mạnh PSG', '🏋️', 'open_fitness');
    });

    // Thảm giãn cơ (Stretching Mats) & Màn hình phân tích thể lực
    const matPanel = new THREE.Mesh(this._boxGeo(6.0, 0.06, 4.0), this.mats.psgNavy);
    matPanel.position.set(207.5, 0.17, -34.5);
    const gymScreen = this.furn.createWallScreen(3.8, 1.8, 'PSG PERFORMANCE & FITNESS LAB');
    gymScreen.position.set(cx, 2.4, -47.65);
    this.medicalGymGroup.add(matPanel, gymScreen);
    this.campus.tagInteractable(gymScreen, 'tc_gym_screen', 'Mở Trung Tâm Thể Lực & Hiệu Suất PSG', '💪', 'open_fitness');
  }

  // ==================== 5. TÒA NHÀ NGHỈ DƯỠNG CẦU THỦ PSG — KIẾN TRÚC 8 TẦNG (NỘI THẤT HOÀN CHỈNH TẦNG 1 · 30 PHÒNG) ====================
  buildPlayerResidence() {
    const cx = 184, cz = 9;
    // Giữ nguyên vị trí & kích thước 80m x 30m (x ∈ [144, 224], z ∈ [-6, 24])
    // Tầng 1: Toàn bộ sảnh, hành lang, khu sinh hoạt chung & 30 phòng nghỉ riêng.
    // Tầng 2 đến Tầng 8: Chỉ là kiến trúc vỏ ngoại thất 8 tầng sang trọng (không có nội thất/NPC/hoạt động).
    this.campus.roomWaypoints.residence = { x: cx, z: -2.2, y: 0.14 };
    this.campus.roomWaypoints.residence_floor2 = { x: cx, z: 13.5, y: 0.14 };

    // === A. SÀN GỖ TỐI MÀU TOÀN TẦNG 1 & TRẦN PHẲNG DUY NHẤT (KHÔNG TRÙNG LẶP / KHÔNG Z-FIGHTING) ===
    const floor1 = new THREE.Mesh(this._boxGeo(80, 0.16, 30), this.mats.resFloor);
    floor1.position.set(cx, 0.06, cz); // [-0.02, 0.14]
    floor1.receiveShadow = true;

    // Trần Tầng 1 duy nhất: nằm gọn bên trong tường bao [x:144.16..223.84, z:-5.88..23.88], y ∈ [4.04, 4.18]
    // Cách ly hoàn toàn với lõi tầng trên (bắt đầu từ y=4.22) & gờ chỉ ngoại thất (bắt đầu từ y=4.20)
    const ceiling1 = new THREE.Mesh(this._boxGeo(79.68, 0.14, 29.76), this.mats.resCeilingWhite);
    ceiling1.position.set(cx, 4.11, cz);
    ceiling1.castShadow = false;
    ceiling1.receiveShadow = false;
    this.shellGroup.add(floor1, ceiling1);

    // === B. KIẾN TRÚC NGOẠI THẤT 8 TẦNG (TẦNG 1 KÍNH LỚN + TẦNG 2..8 CHỈ VỎ NGOÀI) ===
    const f1Height = 4.20;
    const upperFloorH = 3.60;
    const upperTotalH = upperFloorH * 7; // 25.2m (Tầng 2..8)
    const upperCenterY = f1Height + 0.02 + upperTotalH / 2; // bắt đầu từ y = 4.22m (>= 4cm trên trần Tầng 1)
    const roofBaseY = f1Height + upperTotalH; // 29.4m

    // Lõi kính tối & khối kiến trúc Tầng 2..8 (nằm hoàn toàn trên y=4.22m, rỗng bên trong, không nội thất)
    const upperGlassCore = new THREE.Mesh(
      this._boxGeo(79.2, upperTotalH - 0.1, 29.2),
      this.mats.resExteriorGlass
    );
    upperGlassCore.position.set(cx, upperCenterY, cz);

    // Mái & vương miện PSG trên đỉnh tầng 8
    const roofSlab = new THREE.Mesh(this._boxGeo(81.0, 0.55, 31.0), this.mats.darkSlate);
    roofSlab.position.set(cx, roofBaseY + 0.95, cz);
    const roofCrownNavy = new THREE.Mesh(this._boxGeo(81.2, 0.68, 31.2), this.mats.psgNavy);
    roofCrownNavy.position.set(cx, roofBaseY + 0.36, cz);
    const roofCrownRed = new THREE.Mesh(this._boxGeo(81.3, 0.18, 31.3), this.mats.psgRed);
    roofCrownRed.position.set(cx, roofBaseY - 0.04, cz);
    this.shellGroup.add(upperGlassCore, roofSlab, roofCrownNavy, roofCrownRed);

    // 7 tầng gờ chỉ ngoại thất dạng vành chu vi (4 thanh viền ngoài mỗi tầng, KHÔNG xuyên qua trần Tầng 1!)
    const ledgeNS = new THREE.InstancedMesh(this._boxGeo(80.8, 0.34, 0.52), this.mats.resWallGreyWhite, 14);
    const ledgeEW = new THREE.InstancedMesh(this._boxGeo(0.52, 0.34, 29.6), this.mats.resWallGreyWhite, 14);
    const trimNS = new THREE.InstancedMesh(this._boxGeo(80.6, 0.14, 0.44), this.furn.mats.darkWood, 14);
    const trimEW = new THREE.InstancedMesh(this._boxGeo(0.44, 0.14, 29.68), this.furn.mats.darkWood, 14);
    const dummy = new THREE.Object3D();
    for (let fl = 0; fl < 7; fl++) {
      const ly = f1Height + fl * upperFloorH; // fl=0: trim [4.20..4.34], ledge [4.35..4.69]
      const trimY = ly + 0.07;
      const ledgeY = ly + 0.52;

      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);

      dummy.position.set(cx, trimY, -6.04); dummy.updateMatrix(); trimNS.setMatrixAt(fl * 2, dummy.matrix);
      dummy.position.set(cx, trimY, 24.04); dummy.updateMatrix(); trimNS.setMatrixAt(fl * 2 + 1, dummy.matrix);
      dummy.position.set(143.96, trimY, cz); dummy.updateMatrix(); trimEW.setMatrixAt(fl * 2, dummy.matrix);
      dummy.position.set(224.04, trimY, cz); dummy.updateMatrix(); trimEW.setMatrixAt(fl * 2 + 1, dummy.matrix);

      dummy.position.set(cx, ledgeY, -6.04); dummy.updateMatrix(); ledgeNS.setMatrixAt(fl * 2, dummy.matrix);
      dummy.position.set(cx, ledgeY, 24.04); dummy.updateMatrix(); ledgeNS.setMatrixAt(fl * 2 + 1, dummy.matrix);
      dummy.position.set(143.94, ledgeY, cz); dummy.updateMatrix(); ledgeEW.setMatrixAt(fl * 2, dummy.matrix);
      dummy.position.set(224.06, ledgeY, cz); dummy.updateMatrix(); ledgeEW.setMatrixAt(fl * 2 + 1, dummy.matrix);
    }
    ledgeNS.computeBoundingSphere?.();
    ledgeEW.computeBoundingSphere?.();
    trimNS.computeBoundingSphere?.();
    trimEW.computeBoundingSphere?.();
    this.shellGroup.add(ledgeNS, ledgeEW, trimNS, trimEW);

    // Hệ lam đứng kiến trúc mặt tiền Bắc/Nam (34 lam) & Đông/Tây (12 lam) cho Tầng 2..8
    const finNS = new THREE.InstancedMesh(this._boxGeo(0.28, upperTotalH, 0.36), this.mats.resWallGreyWhite, 34);
    let fIdx = 0;
    for (let i = 0; i < 17; i++) {
      const fx = 145.5 + i * 4.8125;
      dummy.position.set(fx, upperCenterY, -6.05);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      finNS.setMatrixAt(fIdx++, dummy.matrix);

      dummy.position.set(fx, upperCenterY, 24.05);
      dummy.updateMatrix();
      finNS.setMatrixAt(fIdx++, dummy.matrix);
    }
    finNS.computeBoundingSphere?.();

    const finEW = new THREE.InstancedMesh(this._boxGeo(0.36, upperTotalH, 0.28), this.mats.resWallGreyWhite, 12);
    let eIdx = 0;
    for (let i = 0; i < 6; i++) {
      const fz = -3.0 + i * 4.8;
      dummy.position.set(143.95, upperCenterY, fz);
      dummy.updateMatrix();
      finEW.setMatrixAt(eIdx++, dummy.matrix);

      dummy.position.set(224.05, upperCenterY, fz);
      dummy.updateMatrix();
      finEW.setMatrixAt(eIdx++, dummy.matrix);
    }
    finEW.computeBoundingSphere?.();
    this.shellGroup.add(finNS, finEW);

    // Tường bao Tầng 1 (chỉ cho phép sử dụng Tầng 1): Tây, Đông, mặt kính lớn Bắc & Nam + cửa chính
    const addExtWall = (x, z, w, d, h = 4.20, y = 2.09, addCol = true) => {
      const m = new THREE.Mesh(this._boxGeo(w, h, d), this.mats.resWallGreyWhite);
      m.position.set(x, y, z);
      this.shellGroup.add(m);
      if (addCol) this.campus.addCollider(x, z, w, d, -0.5, 9.0);
    };
    addExtWall(144, cz, 0.3, 30);      // Tường Tây Tầng 1
    addExtWall(224, cz, 0.3, 30);      // Tường Đông Tầng 1

    const addCurtainGlass = (x, z, w) => {
      const win = this.furn.createGlassWindowWall(w, 3.92, false); // [0.14 .. 4.06], khít mép trần 4.04m
      win.position.set(x, 0.14, z);
      this.shellGroup.add(win);
      this.campus.addCollider(x, z, w, 0.26, -0.5, 9.0);
    };

    // Mặt tiền Bắc (z = -6): Kính lớn toàn cánh Tây, Đông & Sảnh + Cửa chính `door_residence`
    addCurtainGlass(161.0, -6, 34.0);
    addCurtainGlass(207.0, -6, 34.0);
    addCurtainGlass(180.4, -6, 4.8);
    addCurtainGlass(187.6, -6, 4.8);
    this.campus.addWoodenDoor('door_residence', cx, -6, 0, 2.4, true, { compactCeiling: true });

    // Mặt hậu Nam (z = 24): Kính lớn toàn cánh Tây, Đông & Khu Sinh Hoạt Chung
    addCurtainGlass(161.0, 24, 34.0);
    addCurtainGlass(207.0, 24, 34.0);
    addCurtainGlass(184.0, 24, 12.0);

    // Biển tên tòa nhà hiện đại ở mặt tiền cổng vào & đỉnh tầng 8
    const resSign = new THREE.Mesh(
      this._planeGeo(22, 1.75),
      this._getSignMat('PLAYER RESIDENCE · PARIS SAINT-GERMAIN (30 PRIVATE SUITES)', '#00205b', '#ffffff', '#da291c')
    );
    resSign.position.set(cx, 5.25, -6.32);
    resSign.rotation.y = Math.PI;
    const crownSignN = new THREE.Mesh(
      this._planeGeo(26, 1.85),
      this._getSignMat('PARIS SAINT-GERMAIN · PLAYER RESIDENCE', '#00205b', '#ffffff', '#da291c')
    );
    crownSignN.position.set(cx, roofBaseY + 0.36, -6.45);
    crownSignN.rotation.y = Math.PI;
    this.shellGroup.add(resSign, crownSignN);

    // === C. NỘI THẤT HOÀN CHỈNH TẦNG 1 (LUXURY MODERN · SÀN GỖ TỐI · TƯỜNG XÁM TRẮNG · LOGO PSG 3D) ===

    // 1. Hệ thống đèn trần âm & đèn LED hắt trần ấm áp (không trùng mặt phẳng y=4.04m)
    const ceilingLightSpots = [];
    for (let x = 148; x <= 220; x += 9) {
      ceilingLightSpots.push([x, 9.0]); // Hành lang chính Đông-Tây
    }
    [-2.5, 2.0, 15.8, 20.5].forEach((lz) => {
      ceilingLightSpots.push([181.2, lz], [186.8, lz]); // Sảnh Atrium & Lounge
    });
    for (let i = 0; i < RESIDENCE_ROOM_BLUEPRINTS.length; i++) {
      ceilingLightSpots.push([RESIDENCE_ROOM_BLUEPRINTS[i].cx, RESIDENCE_ROOM_BLUEPRINTS[i].cz]);
    }
    const downlightTrim = new THREE.InstancedMesh(
      this._cylGeo(0.24, 0.24, 0.04, 12),
      this.furn.mats.darkWood,
      ceilingLightSpots.length
    );
    const downlightGlow = new THREE.InstancedMesh(
      this._cylGeo(0.18, 0.18, 0.04, 12),
      this.mats.resLedWarm,
      ceilingLightSpots.length
    );
    for (let i = 0; i < ceilingLightSpots.length; i++) {
      dummy.position.set(ceilingLightSpots[i][0], 4.025, ceilingLightSpots[i][1]); // [4.005..4.045] bám âm sạch vào trần 4.04m
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      downlightTrim.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 4.012; // [3.992..4.032] nổi rõ dưới viền gỗ 4.005m, không đồng phẳng
      dummy.updateMatrix();
      downlightGlow.setMatrixAt(i, dummy.matrix);
    }
    downlightTrim.computeBoundingSphere?.();
    downlightGlow.computeBoundingSphere?.();
    this.residenceFloor1Group.add(downlightTrim, downlightGlow);

    // Dải đèn LED hắt trần dọc Sảnh Atrium & Hành lang Đông-Tây (bám âm sát trần 4.04m)
    const coveCoords = [
      [184, 4.01, 5.5, 10.5, 0.08, 0.08],
      [184, 4.01, 12.5, 10.5, 0.08, 0.08],
      [161, 4.01, 6.1, 32.0, 0.08, 0.08],
      [161, 4.01, 11.9, 32.0, 0.08, 0.08],
      [207, 4.01, 6.1, 32.0, 0.08, 0.08],
      [207, 4.01, 11.9, 32.0, 0.08, 0.08]
    ];
    for (let i = 0; i < coveCoords.length; i++) {
      const [lx, ly, lz, lw, lh, ld] = coveCoords[i];
      const cove = new THREE.Mesh(this._boxGeo(lw, lh, ld), this.mats.resLedWarm);
      cove.position.set(lx, ly, lz);
      this.residenceFloor1Group.add(cove);
    }

    // 4 Nguồn sáng ấm áp dịu nhẹ cho Tầng 1 (castShadow=false, tự tắt khi rời xa khu Residence)
    const addWarmLight = (x, y, z, intensity, distance) => {
      const pt = new THREE.PointLight(0xffedd5, intensity, distance);
      pt.position.set(x, y, z);
      pt.castShadow = false;
      this.residenceFloor1Group.add(pt);
    };
    addWarmLight(184, 3.45, 1.8, 0.92, 18);   // Chiếu nhấn Sảnh & Logo PSG 3D
    addWarmLight(184, 3.45, 17.8, 0.80, 18);  // Chiếu ấm Khu Sinh Hoạt Chung
    addWarmLight(162, 3.45, 9.0, 0.55, 28);   // Ánh sáng ấm Hành lang Tây
    addWarmLight(206, 3.45, 9.0, 0.55, 28);   // Ánh sáng ấm Hành lang Đông

    // 2. BỨC TƯỜNG CHÍNH SẢNH TẦNG 1 & LOGO PSG 3D CÓ ĐÈN LED HẮT SAU (x=184, z=7.2)
    // Hai bên mở lối đi rộng 3.5m (x ∈ [178, 181.7] và [186.3, 190]) nối liền Sảnh đón & Lounge
    const heroWall = new THREE.Mesh(this._boxGeo(4.5, 3.94, 0.44), this.mats.resWallDarkGrey);
    heroWall.position.set(184, 2.09, 7.2); // [0.12 .. 4.06] cắm khít vào sàn & trần
    const heroFrameTop = new THREE.Mesh(this._boxGeo(4.74, 0.14, 0.52), this.furn.mats.darkWood);
    heroFrameTop.position.set(184, 3.98, 7.2);
    const heroFrameL = new THREE.Mesh(this._boxGeo(0.14, 3.94, 0.52), this.furn.mats.darkWood);
    heroFrameL.position.set(181.68, 2.09, 7.2);
    const heroFrameR = new THREE.Mesh(this._boxGeo(0.14, 3.94, 0.52), this.furn.mats.darkWood);
    heroFrameR.position.set(186.32, 2.09, 7.2);
    this.residenceFloor1Group.add(heroWall, heroFrameTop, heroFrameL, heroFrameR);
    this.campus.addCollider(184, 7.2, 4.7, 0.56, -0.5, 4.2);

    // Logo PSG 3D mặt Bắc (hướng thẳng ra cửa kính chính z = -6 khi bước vào sảnh)
    const psgLogoGroup = new THREE.Group();
    psgLogoGroup.position.set(184, 2.38, 6.94);
    psgLogoGroup.rotation.y = Math.PI; // Facing North (-Z)

    const haloGeo = markShared(new THREE.RingGeometry(1.06, 1.24, 36));
    const haloDisc = new THREE.Mesh(haloGeo, this.mats.resLogoLed);
    haloDisc.position.z = 0.01;
    psgLogoGroup.add(haloDisc);

    const medBack = new THREE.Mesh(this._cylGeo(1.08, 1.12, 0.10, 36), this.mats.psgNavy);
    medBack.rotation.x = Math.PI / 2;
    medBack.position.z = 0.07;
    psgLogoGroup.add(medBack);

    const medRing = new THREE.Mesh(this._cylGeo(1.03, 1.03, 0.12, 36), this.furn.mats.chrome);
    medRing.rotation.x = Math.PI / 2;
    medRing.position.z = 0.075;
    psgLogoGroup.add(medRing);

    const crestPlane = new THREE.Mesh(
      markShared(new THREE.CircleGeometry(1.00, 36)),
      this.mats.resLogoCrest
    );
    crestPlane.position.z = 0.145;
    psgLogoGroup.add(crestPlane);
    this.residenceFloor1Group.add(psgLogoGroup);

    // Chữ PARIS SAINT-GERMAIN bên dưới Logo 3D
    const logoTextPlaque = new THREE.Mesh(
      this._planeGeo(3.6, 0.62),
      this._getSignMat('PARIS SAINT-GERMAIN', '#1f2530', '#f8fafc', '#da291c')
    );
    logoTextPlaque.position.set(184, 0.84, 6.95);
    logoTextPlaque.rotation.y = Math.PI;
    this.residenceFloor1Group.add(logoTextPlaque);

    // Mặt Nam bức tường chính hướng ra Lounge: Màn hình PSG Lounge
    const loungeScreen = this.furn.createWallScreen(3.5, 1.85, 'PSG PLAYER RESIDENCE · LOUNGE');
    loungeScreen.position.set(184, 2.25, 7.46);
    this.residenceFloor1Group.add(loungeScreen);
    this.campus.tagInteractable(loungeScreen, 'res_lounge_screen', 'Quản lý Khu Nghỉ Dưỡng Cầu Thủ (30 Phòng)', '📺', 'open_residence');

    // 3. KHU SẢNH LỄ TÂN & PHÒNG CHỜ (Bắc Atrium z ∈ [-5, 4.5])
    const recDesk = this.furn.createExecutiveDesk(2.8, 0.98, false);
    recDesk.position.set(187.2, 0.14, -1.6);
    recDesk.rotation.y = -Math.PI / 2;
    this.residenceFloor1Group.add(recDesk);
    this.campus.addCollider(187.2, -1.6, 1.0, 2.8, -0.5, 4.2);
    this.campus.tagInteractable(recDesk, 'res_reception', 'Quản lý Tòa Nhà Nghỉ Dưỡng Cầu Thủ (30 Phòng)', '🏨', 'open_residence');

    const recCab = this.furn.createFilingCabinet(1.6, 2.0, 0.46);
    recCab.position.set(189.4, 0.14, -1.6);
    recCab.rotation.y = -Math.PI / 2;
    this.residenceFloor1Group.add(recCab);
    this.campus.addCollider(189.4, -1.6, 0.52, 1.65, -0.5, 4.2);

    const recSign = new THREE.Mesh(
      this._planeGeo(2.6, 0.48),
      this._getSignMat('RECEPTION · SẢNH LỄ TÂN', '#282f3a', '#f8fafc', '#d4af37')
    );
    recSign.position.set(189.88, 2.55, -1.6);
    recSign.rotation.y = -Math.PI / 2;
    this.residenceFloor1Group.add(recSign);

    // Khu sofa chờ màu xám & bàn trà gỗ tối bên Tây sảnh đón
    const lobbySofa = this.furn.createSofa(2.8, 'grey');
    lobbySofa.position.set(179.6, 0.14, 0.4);
    lobbySofa.rotation.y = Math.PI / 2;
    const lobbyCoffee = this.furn.createCoffeeTable(1.3, 0.72);
    lobbyCoffee.position.set(181.2, 0.14, 0.4);
    lobbyCoffee.rotation.y = Math.PI / 2;
    this.residenceFloor1Group.add(lobbySofa, lobbyCoffee);
    this.campus.addCollider(179.6, 0.4, 0.95, 2.8, -0.5, 4.2);
    this.campus.addCollider(181.2, 0.4, 0.75, 1.35, -0.5, 4.2);
    this.campus.addSeat(lobbySofa, 'seat_res_lobby', 'Sofa Sảnh Lễ Tân PSG', 180.0, 0.4, Math.PI / 2, 180.9, -1.5);

    const board1 = this.furn.createWallScreen(2.6, 1.45, 'ROOM DIRECTORY · 30 SUITES');
    board1.position.set(178.12, 2.25, 0.4);
    board1.rotation.y = Math.PI / 2;
    this.residenceFloor1Group.add(board1);
    this.campus.tagInteractable(board1, 'res_dir_f1', 'Xem Sơ đồ 30 Phòng Cầu Thủ PSG (Tầng 1)', '🏢', 'open_residence');

    // 4. KHU SINH HOẠT CHUNG CẦU THỦ (Nam Atrium z ∈ [14, 23.5]) + SẢNH PHỤ 2 CÁNH
    const loungeSofaN = this.furn.createSofa(3.4, 'navy');
    loungeSofaN.position.set(184.0, 0.14, 21.4);
    loungeSofaN.rotation.y = Math.PI;
    const loungeSofaS = this.furn.createSofa(3.4, 'grey');
    loungeSofaS.position.set(184.0, 0.14, 15.6);
    const loungeCoffee = this.furn.createCoffeeTable(2.0, 0.95);
    loungeCoffee.position.set(184.0, 0.14, 18.5);
    this.residenceFloor1Group.add(loungeSofaN, loungeSofaS, loungeCoffee);
    this.campus.addCollider(184.0, 21.4, 3.4, 0.95, -0.5, 4.2);
    this.campus.addCollider(184.0, 15.6, 3.4, 0.95, -0.5, 4.2);
    this.campus.addCollider(184.0, 18.5, 2.0, 0.95, -0.5, 4.2);
    this.campus.addSeat(loungeSofaN, 'seat_res_lounge', 'Sofa Khu Sinh Hoạt PSG', 184.0, 21.0, 0, 184.0, 19.9);
    this.campus.addSeat(loungeSofaS, 'seat_res_lounge_grey', 'Sofa Xám Lounge Cầu Thủ', 184.0, 16.0, Math.PI, 184.0, 17.1);

    // Sảnh phụ Cánh Tây (x = 175.875, z = 18.25) & Cánh Đông (x = 192.125, z = 18.25)
    const alcoveSofaW = this.furn.createSofa(2.3, 'grey');
    alcoveSofaW.position.set(175.875, 0.14, 20.6);
    alcoveSofaW.rotation.y = Math.PI;
    const alcoveTableW = this.furn.createCoffeeTable(1.2, 0.68);
    alcoveTableW.position.set(175.875, 0.14, 18.4);
    const alcoveArtW = typeof this.furn.createFramedArtwork === 'function'
      ? this.furn.createFramedArtwork(1.6, 1.25, 'parc')
      : this.furn.createFramedJersey('10');
    alcoveArtW.position.set(173.88, 2.15, 18.25);
    alcoveArtW.rotation.y = Math.PI / 2;
    const westWingSign = new THREE.Mesh(
      this._planeGeo(2.8, 0.50),
      this._getSignMat('WEST WING · ROOM 01–15', '#282f3a', '#f8fafc', '#d4af37')
    );
    westWingSign.position.set(175.875, 3.25, 12.68);
    westWingSign.rotation.y = Math.PI;
    this.residenceFloor1Group.add(alcoveSofaW, alcoveTableW, alcoveArtW, westWingSign);
    this.campus.addCollider(175.875, 20.6, 2.3, 0.9, -0.5, 4.2);
    this.campus.addCollider(175.875, 18.4, 1.2, 0.7, -0.5, 4.2);

    const alcoveSofaE = this.furn.createSofa(2.3, 'navy');
    alcoveSofaE.position.set(192.125, 0.14, 20.6);
    alcoveSofaE.rotation.y = Math.PI;
    const alcoveTableE = this.furn.createCoffeeTable(1.2, 0.68);
    alcoveTableE.position.set(192.125, 0.14, 18.4);
    const alcoveArtE = typeof this.furn.createFramedArtwork === 'function'
      ? this.furn.createFramedArtwork(1.6, 1.25, 'eiffel')
      : this.furn.createFramedJersey('7');
    alcoveArtE.position.set(194.12, 2.15, 18.25);
    alcoveArtE.rotation.y = -Math.PI / 2;
    const eastWingSign = new THREE.Mesh(
      this._planeGeo(2.8, 0.50),
      this._getSignMat('EAST WING · ROOM 16–30', '#282f3a', '#f8fafc', '#d4af37')
    );
    eastWingSign.position.set(192.125, 3.25, 12.68);
    eastWingSign.rotation.y = Math.PI;
    this.residenceFloor1Group.add(alcoveSofaE, alcoveTableE, alcoveArtE, eastWingSign);
    this.campus.addCollider(192.125, 20.6, 2.3, 0.9, -0.5, 4.2);
    this.campus.addCollider(192.125, 18.4, 1.2, 0.7, -0.5, 4.2);

    // Biển khu vực Player Lounge + Tranh áo đấu PSG treo hai bên vách sảnh
    const loungeAreaSign = new THREE.Mesh(
      this._planeGeo(3.2, 0.52),
      this._getSignMat('PLAYER LOUNGE · SINH HOẠT CHUNG', '#00205b', '#f8fafc', '#d4af37')
    );
    loungeAreaSign.position.set(184, 3.45, 7.46);
    const jArt1 = this.furn.createFramedJersey('10');
    jArt1.position.set(178.12, 2.15, 3.2);
    jArt1.rotation.y = Math.PI / 2;
    const jArt2 = this.furn.createFramedJersey('7');
    jArt2.position.set(189.88, 2.15, 3.2);
    jArt2.rotation.y = -Math.PI / 2;
    const artN1 = typeof this.furn.createFramedArtwork === 'function'
      ? this.furn.createFramedArtwork(1.4, 1.1, 'parc')
      : this.furn.createFramedJersey('9');
    artN1.position.set(178.12, 2.15, -2.5);
    artN1.rotation.y = Math.PI / 2;
    const artN2 = typeof this.furn.createFramedArtwork === 'function'
      ? this.furn.createFramedArtwork(1.4, 1.1, 'eiffel')
      : this.furn.createFramedJersey('2');
    artN2.position.set(189.88, 2.15, -2.5);
    artN2.rotation.y = -Math.PI / 2;
    this.residenceFloor1Group.add(loungeAreaSign, jArt1, jArt2, artN1, artN2);

    // Rèm cửa hai cánh có nếp gấp + thanh treo kim loại tối tại toàn bộ ô kính Sảnh Bắc & Lounge Nam
    const atriumCurtainBays = [
      { cx: 180.4, z: -5.72, halfW: 2.25, rodW: 4.6 },
      { cx: 187.6, z: -5.72, halfW: 2.25, rodW: 4.6 },
      { cx: 175.875, z: 23.72, halfW: 1.90, rodW: 3.92 },
      { cx: 181.8, z: 23.72, halfW: 1.95, rodW: 4.0 },
      { cx: 186.2, z: 23.72, halfW: 1.95, rodW: 4.0 },
      { cx: 192.125, z: 23.72, halfW: 1.90, rodW: 3.92 }
    ];
    const atriumCurtains = new THREE.InstancedMesh(
      this._curtainWingGeo,
      this.mats.resCurtainFabric,
      atriumCurtainBays.length * 2
    );
    const atriumRods = new THREE.InstancedMesh(
      this._cylGeo(0.024, 0.024, 1.0, 8),
      this.mats.resCurtainRod,
      atriumCurtainBays.length
    );
    const atriumRodFinials = new THREE.InstancedMesh(
      this._cylGeo(0.042, 0.042, 0.05, 8),
      this.mats.resCurtainRod,
      atriumCurtainBays.length * 2
    );
    for (let i = 0; i < atriumCurtainBays.length; i++) {
      const bay = atriumCurtainBays[i];
      // Thanh treo kim loại tối sát trần
      dummy.position.set(bay.cx, 3.94, bay.z);
      dummy.rotation.set(0, 0, Math.PI / 2);
      dummy.scale.set(1, bay.rodW, 1);
      dummy.updateMatrix();
      atriumRods.setMatrixAt(i, dummy.matrix);

      dummy.position.set(bay.cx - bay.rodW / 2, 3.94, bay.z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      atriumRodFinials.setMatrixAt(i * 2, dummy.matrix);
      dummy.position.set(bay.cx + bay.rodW / 2, 3.94, bay.z);
      dummy.updateMatrix();
      atriumRodFinials.setMatrixAt(i * 2 + 1, dummy.matrix);

      // Hai cánh rèm gom gọn 2 bên khung kính Sảnh/Lounge (scaleX=0.25)
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.25, 1, 1);
      dummy.position.set(bay.cx - bay.halfW, 0.22, bay.z);
      dummy.updateMatrix();
      atriumCurtains.setMatrixAt(i * 2, dummy.matrix);

      dummy.rotation.set(0, Math.PI, 0);
      dummy.position.set(bay.cx + bay.halfW, 0.22, bay.z + 0.005);
      dummy.updateMatrix();
      atriumCurtains.setMatrixAt(i * 2 + 1, dummy.matrix);
    }
    atriumCurtains.computeBoundingSphere?.();
    atriumRods.computeBoundingSphere?.();
    atriumRodFinials.computeBoundingSphere?.();
    this.residenceFloor1Group.add(atriumCurtains, atriumRods, atriumRodFinials);

    // 5. VÁCH NGĂN, CỬA PHÒNG ĐÓNG/MỞ & NỘI THẤT 3D ĐA CHI TIẾT CHO ĐÚNG 30 PHÒNG RIÊNG TRÊN TẦNG 1 (ROOM 01..30)
    const totalRooms = RESIDENCE_ROOM_BLUEPRINTS.length; // === 30

    // Hệ rèm hai cánh có nếp gấp + thanh kim loại tối riêng cho 30 phòng nghỉ (tối ưu InstancedMesh cho iPhone Safari)
    const suiteCurtainRods = new THREE.InstancedMesh(
      this._cylGeo(0.022, 0.022, 3.92, 8),
      this.mats.resCurtainRod,
      totalRooms
    );
    const suiteCurtainFinials = new THREE.InstancedMesh(
      this._cylGeo(0.038, 0.038, 0.05, 8),
      this.mats.resCurtainRod,
      totalRooms * 2
    );
    const suiteCurtainWings = new THREE.InstancedMesh(
      this._curtainWingGeo,
      this.mats.resCurtainFabric,
      totalRooms * 2
    );
    suiteCurtainWings.userData.dynamicObject = true;
    suiteCurtainWings.frustumCulled = false;
    this._curtainWingMesh = suiteCurtainWings;
    this.roomCurtains = [];

    this.residenceFloor1Group.add(
      suiteCurtainRods, suiteCurtainFinials, suiteCurtainWings
    );

    // Dựng nội thất Luxury Modern 3D chân thực (Phòng tắm khép kín, Giường, Tủ áo, Bàn làm việc + PC + Ghế công thái học, Sofa, TV, Cửa mở)
    const suiteFactory = new ResidenceInteriorFactory(this.furn, this.tex, this.mats);
    this._suiteSystem = suiteFactory.buildAllSuites(this.residenceSuitesGroup, this.campus);
    this.roomDoors = this._suiteSystem?.roomControllers || [];

    const wallGeoEW = this._boxGeo(0.18, 3.94, 11.5);
    const corSegGeo = this._boxGeo(1.40, 3.94, 0.20);
    const transomGeo = this._boxGeo(1.45, 1.14, 0.20);
    const plaqueGeo = this._planeGeo(1.18, 0.44);
    const curtainHitGeo = this._boxGeo(3.84, 3.55, 0.34);

    // Vách biên giữa Sảnh Atrium & 2 phòng Bắc giáp Atrium (ROOM 08 x=178.0, ROOM 16 x=190.0)
    // và vách đầu cánh ROOM 24 (x=194.25)
    [
      [178.0, -0.25], [190.0, -0.25], [194.25, 18.25]
    ].forEach(([wx, wz]) => {
      const bWall = new THREE.Mesh(wallGeoEW, this.mats.resWallGreyWhite);
      bWall.position.set(wx, 2.09, wz);
      this.residenceFloor1Group.add(bWall);
      this.campus.addCollider(wx, wz, 0.20, 11.5, -0.5, 4.2);
    });

    for (let i = 0; i < totalRooms; i++) {
      const bp = RESIDENCE_ROOM_BLUEPRINTS[i];

      // Vách ngăn bên phải phòng (x + 2.125) — phòng #8 (x=175.875) & #16 (x=192.125) đã có vách biên
      if (bp.roomNumber !== 8 && bp.roomNumber !== 23 && bp.roomNumber !== 30) {
        const sideWall = new THREE.Mesh(wallGeoEW, this.mats.resWallGreyWhite);
        sideWall.position.set(bp.cx + 2.125, 2.09, bp.cz);
        this.residenceFloor1Group.add(sideWall);
        this.campus.addCollider(bp.cx + 2.125, bp.cz, 0.20, 11.5, -0.5, 4.2);
      }

      // Vách hành lang với cửa ra vào rộng 1.45m ở giữa (bp.cx, bp.doorZ)
      const cWallL = new THREE.Mesh(corSegGeo, this.mats.resWallGreyWhite);
      cWallL.position.set(bp.cx - 1.425, 2.09, bp.doorZ);
      const cWallR = new THREE.Mesh(corSegGeo, this.mats.resWallGreyWhite);
      cWallR.position.set(bp.cx + 1.425, 2.09, bp.doorZ);
      const transom = new THREE.Mesh(transomGeo, this.mats.resWallDarkGrey);
      transom.position.set(bp.cx, 3.49, bp.doorZ);
      this.residenceFloor1Group.add(cWallL, cWallR, transom);
      this.campus.addCollider(bp.cx - 1.425, bp.doorZ, 1.42, 0.22, -0.5, 4.2);
      this.campus.addCollider(bp.cx + 1.425, bp.doorZ, 1.42, 0.22, -0.5, 4.2);

      // Thanh treo rèm kim loại tối + 2 đầu chụp & hit-proxy tương tác rèm hai cánh cho từng phòng
      const winZ = bp.windowZ || (bp.side === 'north' ? -5.72 : 23.72);
      dummy.position.set(bp.cx, 3.94, winZ);
      dummy.rotation.set(0, 0, Math.PI / 2);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      suiteCurtainRods.setMatrixAt(i, dummy.matrix);

      dummy.position.set(bp.cx - 1.96, 3.94, winZ);
      dummy.updateMatrix();
      suiteCurtainFinials.setMatrixAt(i * 2, dummy.matrix);
      dummy.position.set(bp.cx + 1.96, 3.94, winZ);
      dummy.updateMatrix();
      suiteCurtainFinials.setMatrixAt(i * 2 + 1, dummy.matrix);

      this.roomCurtains.push({
        roomNumber: bp.roomNumber,
        cx: bp.cx,
        winZ,
        progress: 0.0,
        targetProgress: 0.0,
        leftIdx: i * 2,
        rightIdx: i * 2 + 1
      });

      const hitMat = this.campus._hitProxyMat || this.mats.resCurtainRod;
      const curtainProxy = new THREE.Mesh(curtainHitGeo, hitMat);
      curtainProxy.position.set(bp.cx, 1.95, winZ);
      if (hitMat === this.mats.resCurtainRod) curtainProxy.visible = false;
      this.residenceFloor1Group.add(curtainProxy);
      this.campus.tagInteractable(
        curtainProxy,
        `res_curtain_${bp.roomNumber}`,
        `🪟 Điều chỉnh rèm cửa ${bp.code}`,
        '🪟',
        'interact_residence_curtain',
        { roomNumber: bp.roomNumber }
      );

      // Bảng tên cửa phòng (CanvasTexture 256x96 không mipmaps, dirty-key cache)
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 96;
      const tex = configureFlatCanvasTex(new THREE.CanvasTexture(canvas));
      const MatCtor = typeof THREE.MeshBasicMaterial === 'function' ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
      const mat = new MatCtor({ map: tex });
      const plaque = new THREE.Mesh(plaqueGeo, mat);
      plaque.position.set(bp.plaqueX, bp.plaqueY, bp.plaqueZ);
      plaque.rotation.y = bp.plaqueRotY;
      this.residenceFloor1Group.add(plaque);
      this.campus.tagInteractable(
        plaque,
        `res_room_${bp.roomNumber}`,
        `${bp.code} · Kiểm tra phòng nghỉ cầu thủ`,
        '🚪',
        'open_residence_room',
        { roomNumber: bp.roomNumber }
      );
      this.nameplates.push({
        roomNumber: bp.roomNumber,
        code: bp.code,
        canvas,
        tex,
        mat,
        mesh: plaque,
        lastKey: null
      });
    }

    suiteCurtainRods.computeBoundingSphere?.();
    suiteCurtainFinials.computeBoundingSphere?.();
    this._applyAllCurtainMatrices();
  }

  _drawNameplateCanvas(canvas, room) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const isOccupied = room.status === 'OCCUPIED' && room.occupantName;
    ctx.fillStyle = isOccupied ? '#00205b' : '#252b36';
    ctx.fillRect(0, 0, 256, 96);
    ctx.fillStyle = isOccupied ? '#d4af37' : '#94a3b8';
    ctx.fillRect(0, 0, 10, 96);
    ctx.strokeStyle = isOccupied ? '#d4af37' : '#64748b';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 252, 92);

    ctx.fillStyle = isOccupied ? '#fde68a' : '#cbd5e1';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(room.code, 22, 34);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 21px sans-serif';
    const label = isOccupied
      ? `${room.shirtNumber ? `#${room.shirtNumber} ` : ''}${String(room.occupantName).toUpperCase()}`
      : 'AVAILABLE';
    ctx.fillText(label.slice(0, 19), 22, 70);
  }

  refreshNameplates() {
    if (!this.residence) return;
    const rooms = this.residence.getRooms();
    for (let i = 0; i < this.nameplates.length; i++) {
      const np = this.nameplates[i];
      const room = rooms[i];
      if (!room) continue;
      const key = `${room.status}|${room.occupantId || ''}|${room.occupantName || ''}|${room.shirtNumber || ''}`;
      if (np.lastKey !== key) {
        this._drawNameplateCanvas(np.canvas, room);
        np.tex.needsUpdate = true;
        np.lastKey = key;

        const id = `res_room_${room.roomNumber}`;
        const label = room.status === 'OCCUPIED' && room.occupantName
          ? `${room.code}: ${room.occupantName}${room.shirtNumber ? ` (#${room.shirtNumber})` : ''}`
          : `${room.code}: AVAILABLE (Phòng trống)`;
        if (this.campus.interactables) {
          this.campus.interactables.set(id, {
            id,
            label,
            icon: '🚪',
            action: 'open_residence_room',
            extra: { roomNumber: room.roomNumber }
          });
        }
      }
    }
  }

  _writeRoomCurtainMatrices(rc) {
    if (!this._curtainWingMesh || !this._curtainDummy) return;
    const d = this._curtainDummy;
    const scaleX = 0.18 + 0.82 * Math.max(0, Math.min(1, rc.progress));

    d.scale.set(scaleX, 1, 1);
    d.rotation.set(0, 0, 0);
    d.position.set(rc.cx - 1.90, 0.22, rc.winZ);
    d.updateMatrix();
    this._curtainWingMesh.setMatrixAt(rc.leftIdx, d.matrix);

    d.rotation.set(0, Math.PI, 0);
    d.position.set(rc.cx + 1.90, 0.22, rc.winZ + 0.005);
    d.updateMatrix();
    this._curtainWingMesh.setMatrixAt(rc.rightIdx, d.matrix);
  }

  _applyAllCurtainMatrices() {
    if (!this._curtainWingMesh) return;
    for (let i = 0; i < this.roomCurtains.length; i++) {
      this._writeRoomCurtainMatrices(this.roomCurtains[i]);
    }
    this._curtainWingMesh.instanceMatrix.needsUpdate = true;
    this._curtainsDirty = false;
  }

  syncCurtainsFromState(immediate = false) {
    if (!this.residence || this.roomCurtains.length === 0) return;
    const rooms = this.residence.getRooms();
    let anyChanged = false;
    for (let i = 0; i < this.roomCurtains.length; i++) {
      const rc = this.roomCurtains[i];
      const r = rooms[i];
      if (!r) continue;
      const target = CURTAIN_PROGRESS_MAP[r.curtainState] ?? 0.0;
      if (rc.targetProgress !== target) {
        rc.targetProgress = target;
        anyChanged = true;
      }
      if (immediate && rc.progress !== target) {
        rc.progress = target;
        anyChanged = true;
      }
      const curtainMeta = this.campus?.interactables?.get?.(`res_curtain_${r.roomNumber}`);
      if (curtainMeta) {
        const stateLabel = CURTAIN_LABELS_VI[r.curtainState] || r.curtainState;
        curtainMeta.label = `Rèm cửa ${r.code} (${stateLabel}) · Bấm để điều chỉnh`;
      }
    }
    if (immediate) {
      this._applyAllCurtainMatrices();
    } else if (anyChanged) {
      this._curtainsDirty = true;
    }
  }

  getDoorController(roomNumber) {
    if (!this.roomDoors) return null;
    return this.roomDoors[Number(roomNumber) - 1] || null;
  }

  getNearbyRoomInfo(pos) {
    if (!this.residence || !pos) return null;
    if (pos.x < 142 || pos.x > 226 || pos.z < -7 || pos.z > 25) return null;
    const inside = this.residence.getRoomAtPosition(pos.x, pos.z);
    if (inside) return { room: inside, isInside: true };
    const nearDoor = this.residence.getNearestDoorRoom(pos.x, pos.z, 2.35);
    if (nearDoor) return { room: nearDoor, isInside: false };
    return null;
  }

  syncRoomPropsFromState(immediate = false) {
    if (!this.residence || !this._suiteSystem) return;
    const rooms = this.residence.getRooms();
    const ctrls = this._suiteSystem.roomControllers;
    let tvUpdated = false;
    let lightUpdated = false;
    let doorChanged = false;
    let wardChanged = false;

    for (let i = 0; i < ctrls.length; i++) {
      const c = ctrls[i];
      const r = rooms[i];
      if (!r) continue;

      const dTarget = r.doorOpen ? 1.0 : 0.0;
      if (c.doorTarget !== dTarget) {
        c.doorTarget = dTarget;
        doorChanged = true;
      }
      if (immediate && c.doorProgress !== dTarget) {
        c.doorProgress = dTarget;
        doorChanged = true;
      }

      const wTarget = r.wardrobeOpen ? 1.0 : 0.0;
      if (c.wardTarget !== wTarget) {
        c.wardTarget = wTarget;
        wardChanged = true;
      }
      if (immediate && c.wardProgress !== wTarget) {
        c.wardProgress = wTarget;
        wardChanged = true;
      }

      const nextTv = !!r.tvOn;
      const nextLight = r.lightOn !== false;
      const tvFlip = c.tvOn !== nextTv;
      const lightFlip = c.lightOn !== nextLight;
      if (tvFlip) {
        c.tvOn = nextTv;
        tvUpdated = true;
      }
      if (lightFlip) {
        c.lightOn = nextLight;
        lightUpdated = true;
      }
      if (immediate || tvFlip || lightFlip) {
        this._suiteSystem.syncControllerMatrices(c, immediate, immediate, tvFlip || immediate, lightFlip || immediate);
      }

      const doorMeta = this.campus?.interactables?.get?.(`res_door_hit_${r.roomNumber}`);
      if (doorMeta) {
        const occTxt = r.status === 'OCCUPIED' && r.occupantName ? ` · ${r.occupantName}` : ' · AVAILABLE';
        doorMeta.label = `${r.doorOpen ? 'Đóng cửa' : 'Mở cửa'} ${r.code}${occTxt}`;
      }
      const wardMeta = this.campus?.interactables?.get?.(`res_ward_${r.roomNumber}`);
      if (wardMeta) wardMeta.label = `${r.wardrobeOpen ? 'Đóng' : 'Mở'} tủ quần áo ${r.code}`;
      const tvMeta = this.campus?.interactables?.get?.(`res_tv_${r.roomNumber}`);
      if (tvMeta) tvMeta.label = `${r.tvOn ? 'Tắt' : 'Bật'} TV ${r.code}`;
      const lightMeta = this.campus?.interactables?.get?.(`res_light_${r.roomNumber}`);
      if (lightMeta) lightMeta.label = `${r.lightOn !== false ? 'Tắt' : 'Bật'} đèn phòng ${r.code}`;
    }

    if (immediate) {
      this._suiteSystem.doorWoodInst.instanceMatrix.needsUpdate = true;
      this._suiteSystem.doorMetalInst.instanceMatrix.needsUpdate = true;
      this._suiteSystem.wardWoodInst.instanceMatrix.needsUpdate = true;
      this._suiteSystem.wardMetalInst.instanceMatrix.needsUpdate = true;
      this._suiteSystem.tvOffInst.instanceMatrix.needsUpdate = true;
      this._suiteSystem.tvOnInst.instanceMatrix.needsUpdate = true;
      this._suiteSystem.lightDiscOnInst.instanceMatrix.needsUpdate = true;
      this._suiteSystem.lightDiscOffInst.instanceMatrix.needsUpdate = true;
      this._doorsDirty = false;
      this._wardsDirty = false;
    } else {
      if (doorChanged) this._doorsDirty = true;
      if (wardChanged) this._wardsDirty = true;
      if (tvUpdated) {
        this._suiteSystem.tvOffInst.instanceMatrix.needsUpdate = true;
        this._suiteSystem.tvOnInst.instanceMatrix.needsUpdate = true;
      }
      if (lightUpdated) {
        this._suiteSystem.lightDiscOnInst.instanceMatrix.needsUpdate = true;
        this._suiteSystem.lightDiscOffInst.instanceMatrix.needsUpdate = true;
      }
    }
  }

  update(dt) {
    const safeDt = dt > 0 ? Math.min(dt, 0.1) : 0;
    const f1Visible = !!this.residenceFloor1Group?.visible;

    // 1. Cập nhật hoạt ảnh rèm cửa 30 phòng
    if (this._curtainWingMesh && this._curtainsDirty && f1Visible) {
      const step = 1 - Math.exp(-3.6 * safeDt);
      let stillMoving = false;
      let matrixUpdated = false;
      for (let i = 0; i < this.roomCurtains.length; i++) {
        const rc = this.roomCurtains[i];
        const diff = rc.targetProgress - rc.progress;
        if (Math.abs(diff) <= 0.002) {
          if (rc.progress !== rc.targetProgress) {
            rc.progress = rc.targetProgress;
            this._writeRoomCurtainMatrices(rc);
            matrixUpdated = true;
          }
          continue;
        }
        rc.progress += diff * step;
        this._writeRoomCurtainMatrices(rc);
        matrixUpdated = true;
        stillMoving = true;
      }
      if (matrixUpdated) this._curtainWingMesh.instanceMatrix.needsUpdate = true;
      this._curtainsDirty = stillMoving;
    }

    // 2. Cập nhật đóng/mở 30 cửa phòng + đồng bộ collider (vẫn cập nhật logic dù đang ở LOD gần/trung bình)
    if (this._suiteSystem && this._doorsDirty) {
      const step = 1 - Math.exp(-7.2 * safeDt);
      const ctrls = this._suiteSystem.roomControllers;
      let stillMoving = false;
      let anyUpdated = false;
      for (let i = 0; i < ctrls.length; i++) {
        const c = ctrls[i];
        const diff = c.doorTarget - c.doorProgress;
        if (Math.abs(diff) <= 0.003) {
          if (c.doorProgress !== c.doorTarget) {
            c.doorProgress = c.doorTarget;
            this._suiteSystem.syncControllerMatrices(c, true, false, false, false);
            anyUpdated = true;
          }
          continue;
        }
        c.doorProgress += diff * step;
        this._suiteSystem.syncControllerMatrices(c, true, false, false, false);
        anyUpdated = true;
        stillMoving = true;
      }
      if (anyUpdated) {
        this._suiteSystem.doorWoodInst.instanceMatrix.needsUpdate = true;
        this._suiteSystem.doorMetalInst.instanceMatrix.needsUpdate = true;
      }
      this._doorsDirty = stillMoving;
    }

    // 3. Cập nhật đóng/mở cánh tủ quần áo 30 phòng
    if (this._suiteSystem && this._wardsDirty && f1Visible) {
      const step = 1 - Math.exp(-6.2 * safeDt);
      const ctrls = this._suiteSystem.roomControllers;
      let stillMoving = false;
      let anyUpdated = false;
      for (let i = 0; i < ctrls.length; i++) {
        const c = ctrls[i];
        const diff = c.wardTarget - c.wardProgress;
        if (Math.abs(diff) <= 0.003) {
          if (c.wardProgress !== c.wardTarget) {
            c.wardProgress = c.wardTarget;
            this._suiteSystem.syncControllerMatrices(c, false, true, false, false);
            anyUpdated = true;
          }
          continue;
        }
        c.wardProgress += diff * step;
        this._suiteSystem.syncControllerMatrices(c, false, true, false, false);
        anyUpdated = true;
        stillMoving = true;
      }
      if (anyUpdated) {
        this._suiteSystem.wardWoodInst.instanceMatrix.needsUpdate = true;
        this._suiteSystem.wardMetalInst.instanceMatrix.needsUpdate = true;
      }
      this._wardsDirty = stillMoving;
    }
  }

  // Cao độ mặt sàn (chỉ Tầng 1 được phép sử dụng tại PSG Player Residence; Tầng 2–8 chỉ là vỏ kiến trúc ngoài)
  getElevationAt(x, z, currentY = 0.14) {
    return 0.14;
  }

  markTexturesNeedsUpdate() {
    for (let i = 0; i < this.nameplates.length; i++) {
      if (this.nameplates[i].tex) this.nameplates[i].tex.needsUpdate = true;
    }
  }

  dispose() {
    if (typeof this._unsubscribeResidence === 'function') {
      this._unsubscribeResidence();
      this._unsubscribeResidence = null;
    }
    for (let i = 0; i < this.nameplates.length; i++) {
      const np = this.nameplates[i];
      if (np.tex) np.tex.dispose?.();
      if (np.mat && !np.mat.userData?.sharedAsset) np.mat.dispose?.();
      if (np.canvas) { np.canvas.width = 0; np.canvas.height = 0; }
    }
    this.nameplates.length = 0;

    this.group.traverse((obj) => {
      if (!obj.isMesh) return;
      if (obj.geometry && !obj.geometry.userData?.sharedAsset) obj.geometry.dispose?.();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m && !m.userData?.sharedAsset) m.dispose?.();
      }
    });
    if (this.campus?.root) this.campus.root.remove(this.group);
  }
}
