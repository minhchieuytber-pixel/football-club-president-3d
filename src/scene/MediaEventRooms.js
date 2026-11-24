// src/scene/MediaEventRooms.js
// Kiến trúc 3D Khu Sự Kiện Ký Hợp Đồng & Phòng Họp Báo Cao Cấp PSG (Modern Luxury: PSG Navy, Dark Wood, Marble, Black Metal, Glass)
// Gắn liền mạch với tường Đông Trụ sở chính (x = 34..58, z = -20..20) để mọi NPC đi bộ qua hành lang chính & cửa gỗ bằng Pathfinding thật!
// Tối ưu GPU/RAM Phase 2: tách shellGroup / interiorGroup để zone culling, giảm 4 PointLights -> 1 đèn fill kiêm flash an toàn,
// sửa rò rỉ tallyMat, chia sẻ geometry/material đạo cụ (userData.sharedAsset = true), tắt mipmap CanvasTexture & hỗ trợ dispose().
import { drawJerseyBackSection, normalizeKitSpec } from '../characters/PlayerKitSystem.js';

function markShared(asset) {
  if (!asset) return asset;
  if (!asset.userData) asset.userData = {};
  asset.userData.sharedAsset = true;
  return asset;
}

function configureFlatCanvasTex(tex) {
  if (!tex) return tex;
  tex.generateMipmaps = false;
  if (typeof THREE.LinearFilter !== 'undefined') tex.minFilter = THREE.LinearFilter;
  return tex;
}

function freezeStaticTree(root) {
  if (!root || typeof root.traverse !== 'function') return;
  root.traverse((obj) => {
    if (typeof obj.updateMatrix === 'function') obj.updateMatrix();
    obj.matrixAutoUpdate = false;
  });
}

export class MediaEventRooms {
  constructor(campusScene, texFactory, furnFactory) {
    this.campus = campusScene;
    this.tex = texFactory;
    this.furn = furnFactory;
    this.group = new THREE.Group();
    this.shellGroup = new THREE.Group();
    this.interiorGroup = new THREE.Group();
    this.group.add(this.shellGroup, this.interiorGroup);
    // Cho phép ParcDesPrincesZone.updateStreaming culling riêng nội thất nặng khi không ở Media Wing / không làm lễ!
    this.group.userData.shellGroup = this.shellGroup;
    this.group.userData.interiorGroup = this.interiorGroup;
    this.campus.root.add(this.group);

    // Canvas động cho Màn hình LED phòng họp báo, Backdrop ký kết & Áo đấu ra mắt (cập nhật theo từng sự kiện thật, không hardcode!)
    this.ledCanvas = document.createElement('canvas');
    this.ledCanvas.width = 768;
    this.ledCanvas.height = 320;
    this.ledTex = configureFlatCanvasTex(new THREE.CanvasTexture(this.ledCanvas));

    this.backdropCanvas = document.createElement('canvas');
    this.backdropCanvas.width = 512;
    this.backdropCanvas.height = 256;
    this.backdropTex = configureFlatCanvasTex(new THREE.CanvasTexture(this.backdropCanvas));

    this.jerseyCanvas = document.createElement('canvas');
    this.jerseyCanvas.width = 256;
    this.jerseyCanvas.height = 256;
    this.jerseyTex = configureFlatCanvasTex(new THREE.CanvasTexture(this.jerseyCanvas));

    this.flashLight = null;
    this._baseLightIntensity = 1.1;
    this._flashTimer = null;
    this.liveIndicatorMat = markShared(new THREE.MeshStandardMaterial({ color: 0x334155, emissive: 0x000000, emissiveIntensity: 1.5 }));
    this.signingJerseyGroup = null;
    this.contractFolderGroup = null;
    this.cameraTargets = {};
    this.seatPositions = {};
    this._sharedProps = null;

    this.build();
    this.updateEventVisuals(null);
  }

  _ensureSharedProps() {
    if (this._sharedProps) return this._sharedProps;
    this._sharedProps = {
      geos: {
        tripodLeg: markShared(new THREE.CylinderGeometry(0.018, 0.015, 1.38, 6)),
        tripodHead: markShared(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 8)),
        broadcastBody: markShared(new THREE.BoxGeometry(0.24, 0.24, 0.48)),
        broadcastLens: markShared(new THREE.CylinderGeometry(0.085, 0.072, 0.26, 10)),
        tallySphere: markShared(new THREE.SphereGeometry(0.032, 8, 8)),
        dslrBody: markShared(new THREE.BoxGeometry(0.16, 0.13, 0.14)),
        dslrLens: markShared(new THREE.CylinderGeometry(0.048, 0.045, 0.22, 8)),
        studioStand: markShared(new THREE.CylinderGeometry(0.025, 0.035, 2.35, 8)),
        studioBase: markShared(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 10)),
        studioBox: markShared(new THREE.BoxGeometry(0.68, 0.52, 0.22)),
        studioDiffuser: markShared(new THREE.PlaneGeometry(0.60, 0.44)),
        micBase: markShared(new THREE.CylinderGeometry(0.06, 0.07, 0.025, 8)),
        micStem: markShared(new THREE.CylinderGeometry(0.009, 0.011, 0.28, 6)),
        micHead: markShared(new THREE.SphereGeometry(0.028, 8, 8)),
        speakerPole: markShared(new THREE.CylinderGeometry(0.03, 0.04, 1.4, 8)),
        speakerBox: markShared(new THREE.BoxGeometry(0.46, 0.72, 0.36)),
        speakerGrille: markShared(new THREE.BoxGeometry(0.40, 0.64, 0.04)),
        waterBottle: markShared(new THREE.CylinderGeometry(0.035, 0.038, 0.21, 8))
      },
      mats: {
        darkCase: markShared(new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.45 })),
        grille: markShared(new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.7 })),
        diffuser: markShared(new THREE.MeshBasicMaterial({ color: 0xfff8e7 })),
        micHead: markShared(new THREE.MeshStandardMaterial({ color: 0x00205b, roughness: 0.5 })),
        waterBottle: markShared(new THREE.MeshStandardMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.72, roughness: 0.18 }))
      }
    };
    return this._sharedProps;
  }

  // Cập nhật động màn hình LED, backdrop tài trợ và áo đấu trưng bày theo dữ liệu sự kiện/cầu thủ thật
  updateEventVisuals(eventData = null) {
    const isLive = eventData && eventData.phase === 'press_conference';
    const title = eventData ? (eventData.headline || 'OFFICIAL SIGNING CEREMONY') : 'PARIS SAINT-GERMAIN · MEDIA CENTER';
    const subjectName = eventData ? (eventData.subjectName || 'NEW SIGNING') : 'ICI C\'EST PARIS';
    const shirtNum = eventData?.shirtNumber ? `#${eventData.shirtNumber}` : '';
    const position = eventData?.position || '';
    const subLine = eventData
      ? `${shirtNum ? `${shirtNum} · ` : ''}${position ? `${position} · ` : ''}${eventData.eventTypeLabel || 'OFFICIAL PRESENTATION'}`
      : 'PARC DES PRINCES · OFFICIAL PRESS & BROADCAST HALL';

    // 1. Màn hình LED lớn tại Phòng Họp Báo
    const lCtx = this.ledCanvas.getContext('2d');
    const lw = this.ledCanvas.width, lh = this.ledCanvas.height;
    const grad = lCtx.createLinearGradient(0, 0, lw, lh);
    grad.addColorStop(0, '#001640');
    grad.addColorStop(0.5, '#00205b');
    grad.addColorStop(1, '#091124');
    lCtx.fillStyle = grad;
    lCtx.fillRect(0, 0, lw, lh);

    // Dải đỏ PSG sang trọng hai bên
    lCtx.fillStyle = '#da291c';
    lCtx.fillRect(0, 0, lw, 10);
    lCtx.fillRect(0, lh - 10, lw, 10);
    lCtx.fillStyle = 'rgba(212,175,55,0.28)';
    lCtx.fillRect(28, 22, lw - 56, 2);

    // Huy hiệu PSG tròn trái
    lCtx.beginPath();
    lCtx.arc(104, 160, 62, 0, Math.PI * 2);
    lCtx.fillStyle = '#00205b';
    lCtx.fill();
    lCtx.lineWidth = 4;
    lCtx.strokeStyle = '#d4af37';
    lCtx.stroke();
    lCtx.fillStyle = '#ffffff';
    lCtx.font = 'bold 26px sans-serif';
    lCtx.textAlign = 'center';
    lCtx.fillText('PSG', 104, 155);
    lCtx.fillStyle = '#da291c';
    lCtx.font = 'bold 14px sans-serif';
    lCtx.fillText('PARIS', 104, 180);

    // Huy hiệu / Khung số áo bên phải
    if (shirtNum) {
      lCtx.fillStyle = 'rgba(218,41,28,0.92)';
      lCtx.fillRect(lw - 165, 92, 120, 136);
      lCtx.strokeStyle = '#ffffff';
      lCtx.lineWidth = 3;
      lCtx.strokeRect(lw - 165, 92, 120, 136);
      lCtx.fillStyle = '#ffffff';
      lCtx.font = 'bold 54px sans-serif';
      lCtx.fillText(shirtNum, lw - 105, 174);
      lCtx.font = 'bold 14px sans-serif';
      lCtx.fillStyle = '#fde68a';
      lCtx.fillText(position || 'PSG', lw - 105, 210);
    }

    // Nhãn LIVE PSG TV nếu đang họp báo
    if (isLive) {
      lCtx.fillStyle = '#dc2626';
      lCtx.fillRect(lw / 2 - 96, 30, 192, 30);
      lCtx.fillStyle = '#ffffff';
      lCtx.font = 'bold 15px sans-serif';
      lCtx.fillText('● LIVE · PSG TV', lw / 2, 50);
    } else {
      lCtx.fillStyle = '#d4af37';
      lCtx.font = 'bold 15px sans-serif';
      lCtx.fillText('PARIS SAINT-GERMAIN · OFFICIAL', lw / 2, 52);
    }

    // Tên cầu thủ / nhân vật chính
    lCtx.fillStyle = '#ffffff';
    lCtx.font = 'bold 42px sans-serif';
    lCtx.fillText(subjectName.toUpperCase().slice(0, 24), lw / 2, 148);

    // Dòng phụ & Chào mừng
    lCtx.fillStyle = '#93c5fd';
    lCtx.font = 'bold 20px sans-serif';
    lCtx.fillText(subLine.slice(0, 44), lw / 2, 195);

    lCtx.fillStyle = '#e2e8f0';
    lCtx.font = 'bold 15px sans-serif';
    lCtx.fillText(title.toUpperCase().slice(0, 56), lw / 2, 238);

    // Dải nhà tài trợ đáy màn hình
    lCtx.fillStyle = 'rgba(255,255,255,0.68)';
    lCtx.font = 'bold 13px sans-serif';
    lCtx.fillText('QATAR AIRWAYS   ·   NIKE   ·   ACCOR ALL   ·   PSG TV   ·   PARC DES PRINCES', lw / 2, 286);
    this.ledTex.needsUpdate = true;

    // 2. Backdrop tài trợ & ký hợp đồng
    const bCtx = this.backdropCanvas.getContext('2d');
    const bw = this.backdropCanvas.width, bh = this.backdropCanvas.height;
    bCtx.fillStyle = '#071734';
    bCtx.fillRect(0, 0, bw, bh);
    bCtx.strokeStyle = '#d4af37';
    bCtx.lineWidth = 4;
    bCtx.strokeRect(8, 8, bw - 16, bh - 16);
    bCtx.fillStyle = 'rgba(255,255,255,0.12)';
    bCtx.font = 'bold 13px sans-serif';
    bCtx.textAlign = 'center';
    const sponsors = ['PARIS SAINT-GERMAIN', 'QATAR AIRWAYS', 'NIKE', 'ACCOR', 'PSG TV'];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        bCtx.fillText(sponsors[(r + c) % sponsors.length], 85 + c * 170, 38 + r * 48);
      }
    }
    bCtx.fillStyle = 'rgba(0, 32, 91, 0.88)';
    bCtx.fillRect(46, 78, bw - 92, 96);
    bCtx.strokeStyle = '#da291c';
    bCtx.lineWidth = 3;
    bCtx.strokeRect(46, 78, bw - 92, 96);
    bCtx.fillStyle = '#fde68a';
    bCtx.font = 'bold 14px sans-serif';
    bCtx.fillText('OFFICIAL CONTRACT SIGNING', bw / 2, 108);
    bCtx.fillStyle = '#ffffff';
    bCtx.font = 'bold 26px sans-serif';
    bCtx.fillText(subjectName.toUpperCase().slice(0, 22), bw / 2, 142);
    bCtx.fillStyle = '#cbd5e1';
    bCtx.font = 'bold 13px sans-serif';
    bCtx.fillText(eventData ? `${shirtNum} ${position} · Chủ tịch Phạm Minh Chiêu` : 'CHỦ TỊCH PHẠM MINH CHIÊU · PSG', bw / 2, 164);
    this.backdropTex.needsUpdate = true;

    // 3. Áo đấu PSG trưng bày tại bàn ký kết (dùng chung drawJerseyBackSection & theme PSG chuẩn)
    const jCtx = this.jerseyCanvas.getContext('2d');
    const jerseySpec = normalizeKitSpec({
      kitType: eventData?.kitType || (position === 'GK' ? 'gk' : 'home'),
      fullName: eventData?.subjectName || 'PARIS',
      shirtNumber: eventData?.shirtNumber || '26',
      club: 'Paris Saint-Germain'
    });
    drawJerseyBackSection(jCtx, 0, 0, 256, 256, jerseySpec);
    this.jerseyTex.needsUpdate = true;

    if (this.liveIndicatorMat) {
      this.liveIndicatorMat.color.setHex(isLive ? 0xef4444 : 0x334155);
      this.liveIndicatorMat.emissive.setHex(isLive ? 0xdc2626 : 0x000000);
    }
  }

  triggerCameraFlash() {
    if (!this.flashLight) return;
    if (this._flashTimer) clearTimeout(this._flashTimer);
    this.flashLight.intensity = 3.8;
    this._flashTimer = setTimeout(() => {
      this._flashTimer = null;
      if (this.flashLight) this.flashLight.intensity = this._baseLightIntensity;
    }, 110);
  }

  createCameraOnTripod(isBroadcast = true) {
    const { geos } = this._ensureSharedProps();
    const g = new THREE.Group();
    const metal = this.furn.mats.matteBlack;
    const chrome = this.furn.mats.chrome;
    // 3 chân tripod góc mở thực tế (chia sẻ 1 geometry duy nhất)
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(geos.tripodLeg, metal);
      leg.position.set(Math.cos(ang) * 0.22, 0.66, Math.sin(ang) * 0.22);
      leg.rotation.z = -Math.cos(ang) * 0.28;
      leg.rotation.x = Math.sin(ang) * 0.28;
      g.add(leg);
    }
    const head = new THREE.Mesh(geos.tripodHead, chrome);
    head.position.y = 1.34;
    g.add(head);

    if (isBroadcast) {
      const body = new THREE.Mesh(geos.broadcastBody, metal);
      body.position.set(0, 1.50, 0);
      body.castShadow = false;
      const lens = new THREE.Mesh(geos.broadcastLens, chrome);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 1.50, 0.34);
      // Dùng chung 1 this.liveIndicatorMat duy nhất (không tạo & bỏ rơi tallyMat trên cam 2+)
      const tally = new THREE.Mesh(geos.tallySphere, this.liveIndicatorMat);
      tally.position.set(0, 1.66, 0.16);
      g.add(body, lens, tally);
    } else {
      const dslr = new THREE.Mesh(geos.dslrBody, metal);
      dslr.position.set(0, 1.44, 0);
      const lens = new THREE.Mesh(geos.dslrLens, metal);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 1.44, 0.16);
      g.add(dslr, lens);
    }
    return g;
  }

  createStudioLight() {
    const { geos, mats } = this._ensureSharedProps();
    const g = new THREE.Group();
    const stand = new THREE.Mesh(geos.studioStand, this.furn.mats.matteBlack);
    stand.position.y = 1.18;
    const base = new THREE.Mesh(geos.studioBase, this.furn.mats.matteBlack);
    base.position.y = 0.02;
    const softbox = new THREE.Mesh(geos.studioBox, mats.darkCase);
    softbox.position.set(0, 2.42, 0);
    const diffuser = new THREE.Mesh(geos.studioDiffuser, mats.diffuser);
    diffuser.position.set(0, 2.42, 0.115);
    g.add(stand, base, softbox, diffuser);
    return g;
  }

  createMicrophone() {
    const { geos, mats } = this._ensureSharedProps();
    const g = new THREE.Group();
    const base = new THREE.Mesh(geos.micBase, this.furn.mats.matteBlack);
    const stem = new THREE.Mesh(geos.micStem, this.furn.mats.chrome);
    stem.position.set(0, 0.14, 0.04);
    stem.rotation.x = 0.35;
    const head = new THREE.Mesh(geos.micHead, mats.micHead);
    head.position.set(0, 0.27, 0.09);
    g.add(base, stem, head);
    return g;
  }

  createSpeakerStand() {
    const { geos, mats } = this._ensureSharedProps();
    const g = new THREE.Group();
    const pole = new THREE.Mesh(geos.speakerPole, this.furn.mats.matteBlack);
    pole.position.y = 0.7;
    const box = new THREE.Mesh(geos.speakerBox, mats.darkCase);
    box.position.y = 1.75;
    const grille = new THREE.Mesh(geos.speakerGrille, mats.grille);
    grille.position.set(0, 1.75, 0.18);
    g.add(pole, box, grille);
    return g;
  }

  build() {
    const { geos, mats } = this._ensureSharedProps();

    // Mở cánh cửa kết nối trực tiếp hành lang Đông Trụ sở PSG (x = 34, z = 0) vào Khu Sự Kiện Truyền Thông (x ∈ [34, 58], z ∈ [-20, 20])
    this.campus.addWoodenDoor('door_media_wing', 34.0, 0.0, Math.PI / 2, 2.2, true);

    // === VỎ NGOẠI THẤT (shellGroup) ===
    // Sàn đá cẩm thạch cao cấp + mái phẳng Modern Luxury (24m x 40m)
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(24, 0.14, 40),
      new THREE.MeshStandardMaterial({ map: this.tex.marbleTexture('#e5e0d6', '#c8c1b4'), roughness: 0.3, metalness: 0.1 })
    );
    floor.position.set(46, 0.05, 0);
    floor.receiveShadow = true;
    this.shellGroup.add(floor);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(24.6, 0.42, 40.6),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.35 })
    );
    roof.position.set(46, 4.65, 0);
    roof.castShadow = true;
    this.shellGroup.add(roof);

    const wallNavyMat = markShared(new THREE.MeshStandardMaterial({ color: 0x0f2140, roughness: 0.48, metalness: 0.14 }));
    const wallLightMat = markShared(new THREE.MeshStandardMaterial({ color: 0xe8e3da, roughness: 0.55, metalness: 0.04 }));
    const addW = (x, z, w, d, mat = wallLightMat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 4.45, d), mat);
      m.position.set(x, 2.32, z);
      m.castShadow = false;
      m.receiveShadow = true;
      this.shellGroup.add(m);
      this.campus.addCollider(x, z, w, d);
    };

    // Tường bao Khu Sự Kiện (Bắc z=-20, Nam z=20 có cửa thoát riêng, Đông x=58 có kính sang trọng)
    addW(46, -20, 24, 0.26, wallNavyMat);
    addW(58, -10, 0.26, 20, wallNavyMat);
    this.campus.addGlassWindow(58, 10, 20, Math.PI / 2, false);
    addW(40.5, 20, 13, 0.26, wallNavyMat);
    this.campus.addWoodenDoor('door_press_exit', 48.0, 20, 0, 2.0, true);
    addW(53.5, 20, 9, 0.26, wallNavyMat);

    // Hành lang đệm giữa Phòng Ký Hợp Đồng (Bắc: z < -2) và Phòng Họp Báo (Nam: z > 2)
    // Tường ngăn Bắc hành lang (z = -2) có cửa gỗ cao cấp vào Phòng Ký Hợp Đồng tại x = 42
    addW(37.5, -2, 7.0, 0.24, wallNavyMat);
    this.campus.addWoodenDoor('door_signing_room', 42.0, -2, 0, 2.0, true);
    this.campus.addGlassWindow(50.5, -2, 15.0, 0, false);

    // Tường ngăn Nam hành lang (z = 2) có cửa đôi vào Phòng Họp Báo tại x = 42
    addW(37.5, 2, 7.0, 0.24, wallNavyMat);
    this.campus.addWoodenDoor('door_press_hall', 42.0, 2, 0, 2.2, true);
    this.campus.addGlassWindow(50.5, 2, 15.0, 0, false);

    // Biển chỉ dẫn hành lang Khu Truyền Thông
    this.campus.addRoomLabel('PHÒNG KÝ HỢP ĐỒNG CAO CẤP PSG ↑', 42.0, -1.82, 0);
    this.campus.addRoomLabel('PHÒNG HỌP BÁO & PSG TV LIVE ↓', 42.0, 1.82, Math.PI);

    // === NỘI THẤT CHI TIẾT (interiorGroup — tự động culling khi không ở gần Media Wing / không làm lễ!) ===
    // Giảm từ 4 PointLights xuống 1 đèn chiếu sáng trung tâm kiêm hiệu ứng flash an toàn (không thêm light runtime!)
    this.flashLight = new THREE.PointLight(0xfffaf0, this._baseLightIntensity, 42, 1.2);
    this.flashLight.position.set(46, 4.1, 0);
    this.interiorGroup.add(this.flashLight);

    // =========================================================================
    // III. PHÒNG KÝ HỢP ĐỒNG 3D (x ∈ [34, 58], z ∈ [-20, -2])
    // =========================================================================
    this.campus.roomWaypoints.signing_room = { x: 42.0, z: -5.5 };

    // Sàn gỗ tối màu sang trọng khu vực bàn ký
    const signWood = new THREE.Mesh(
      new THREE.BoxGeometry(16, 0.04, 12),
      new THREE.MeshStandardMaterial({ map: this.tex.woodTexture('#3d2518', '#22130c'), roughness: 0.35, metalness: 0.1 })
    );
    signWood.position.set(46.5, 0.13, -11.5);
    signWood.receiveShadow = true;
    this.interiorGroup.add(signWood);

    // Backdrop tài trợ & sự kiện lớn sau bàn ký (z = -18.5)
    const bdFrame = new THREE.Mesh(new THREE.BoxGeometry(8.2, 3.2, 0.16), this.furn.mats.darkWood);
    bdFrame.position.set(46.5, 1.85, -18.5);
    const bdFace = new THREE.Mesh(
      new THREE.PlaneGeometry(7.8, 2.95),
      THREE.MeshBasicMaterial
        ? new THREE.MeshBasicMaterial({ map: this.backdropTex })
        : new THREE.MeshStandardMaterial({ map: this.backdropTex, roughness: 0.4 })
    );
    bdFace.position.set(46.5, 1.85, -18.4);
    this.interiorGroup.add(bdFrame, bdFace);
    this.campus.addCollider(46.5, -18.5, 8.2, 0.3);

    // Logo PSG phát sáng treo tường Đông phòng ký kết
    const signCrest = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 28),
      THREE.MeshBasicMaterial
        ? new THREE.MeshBasicMaterial({ map: this.tex.psgCrestTexture(), transparent: true })
        : new THREE.MeshStandardMaterial({ map: this.tex.psgCrestTexture(), transparent: true })
    );
    signCrest.position.set(57.75, 2.55, -11.5);
    signCrest.rotation.y = -Math.PI / 2;
    this.interiorGroup.add(signCrest);

    // Bàn ký hợp đồng lớn Modern Luxury (Dark Wood + Gold Trim — KHÔNG đặt máy tính văn phòng!)
    const signDesk = this.furn.createExecutiveDesk(4.6, 1.35, true, { includeComputer: false, includePhone: false, includeLamp: false });
    signDesk.position.set(46.5, 0.14, -13.2);
    signDesk.rotation.y = Math.PI;
    this.interiorGroup.add(signDesk);
    this.campus.addCollider(46.5, -13.2, 4.6, 1.35);
    this.campus.tagInteractable(signDesk, 'signing_ceremony_desk', 'Bàn Lễ Ký Hợp Đồng Chính Thức PSG', '✍️', 'open_signing_event');

    // Hồ sơ hợp đồng + Bút ký mạ vàng + Chai nước lễ tân đặt gọn gàng trên bàn ký (không có máy tính)
    const folderGroup = new THREE.Group();
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.03, 0.34), mats.micHead);
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.034, 0.28), markShared(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 })));
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 8), this.furn.mats.gold);
    pen.rotation.z = Math.PI / 2;
    pen.position.set(0.28, 0.025, 0.06);
    folderGroup.add(cover, paper, pen);
    folderGroup.position.set(46.5, 0.96, -13.15);
    this.interiorGroup.add(folderGroup);
    this.contractFolderGroup = folderGroup;

    // 2 chai nước khoáng đặt 2 bên bàn ký kết (dùng chung geometry + material!)
    [-1.4, 1.4].forEach((bx) => {
      const bottle = new THREE.Mesh(geos.waterBottle, mats.waterBottle);
      bottle.position.set(46.5 + bx, 1.05, -13.0);
      this.interiorGroup.add(bottle);
    });

    // Áo đấu PSG trưng bày trên giá gỗ cạnh bàn ký (tự động đổi tên & số áo cầu thủ!)
    const jGroup = new THREE.Group();
    const jPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.6, 8), this.furn.mats.gold);
    jPole.position.y = 0.8;
    const jPlane = new THREE.Mesh(
      new THREE.BoxGeometry(0.76, 0.86, 0.05),
      THREE.MeshBasicMaterial
        ? new THREE.MeshBasicMaterial({ map: this.jerseyTex })
        : new THREE.MeshStandardMaterial({ map: this.jerseyTex, roughness: 0.5 })
    );
    jPlane.position.set(0, 1.42, 0);
    jGroup.add(jPole, jPlane);
    jGroup.position.set(49.8, 0.14, -14.8);
    jGroup.rotation.y = -0.35;
    this.interiorGroup.add(jGroup);
    this.signingJerseyGroup = jGroup;

    // 3 Ghế cao cấp phía sau bàn ký (Chủ tịch Phạm Minh Chiêu ở giữa, Cầu thủ bên phải, GĐ Thể thao bên trái)
    const signChairs = [
      { id: 'seat_sign_pres', label: 'Ghế Chủ tịch · Phòng Ký Hợp Đồng', x: 46.5, z: -14.55 },
      { id: 'seat_sign_player', label: 'Ghế Tân binh · Phòng Ký Hợp Đồng', x: 48.0, z: -14.55 },
      { id: 'seat_sign_sd', label: 'Ghế Đại diện CLB · Phòng Ký Hợp Đồng', x: 45.0, z: -14.55 }
    ];
    signChairs.forEach((sc, idx) => {
      const ch = this.furn.createSwivelChair(idx === 0);
      ch.position.set(sc.x, 0.14, sc.z);
      ch.rotation.y = Math.PI;
      this.interiorGroup.add(ch);
      this.campus.registerChairPosition(sc.x, sc.z, 0.14);
      if (idx === 0) this.campus.addSeat(ch, sc.id, sc.label, sc.x, sc.z, Math.PI, sc.x, sc.z - 1.2);
    });
    this.seatPositions.signing = {
      president: { x: 46.5, z: -14.55, rotY: 0 },
      player: { x: 48.0, z: -14.55, rotY: 0 },
      sporting: { x: 45.0, z: -14.55, rotY: 0 },
      mediaDir: { x: 43.2, z: -11.5, rotY: -0.5 },
      photographer: { x: 46.5, z: -8.6, rotY: Math.PI },
      cameraman: { x: 49.4, z: -8.8, rotY: Math.PI + 0.25 }
    };

    // Tủ trưng bày danh hiệu PSG hai bên tường Tây phòng ký
    const trophy1 = this.furn.createTrophyCabinet();
    trophy1.position.set(35.2, 0.14, -13.5);
    trophy1.rotation.y = Math.PI / 2;
    this.interiorGroup.add(trophy1);
    this.campus.addCollider(35.2, -13.5, 0.65, 2.25);

    // Đèn studio + Máy ảnh DSLR + Camera truyền thông hướng về bàn ký
    const sl1 = this.createStudioLight(); sl1.position.set(42.2, 0.14, -9.8); sl1.rotation.y = 0.65;
    const sl2 = this.createStudioLight(); sl2.position.set(50.8, 0.14, -9.8); sl2.rotation.y = -0.65;
    const dslr1 = this.createCameraOnTripod(false); dslr1.position.set(46.5, 0.14, -9.2); dslr1.rotation.y = Math.PI;
    const tvCam1 = this.createCameraOnTripod(true); tvCam1.position.set(49.4, 0.14, -9.4); tvCam1.rotation.y = Math.PI + 0.25;
    this.interiorGroup.add(sl1, sl2, dslr1, tvCam1);

    // =========================================================================
    // IV. PHÒNG HỌP BÁO CAO CẤP PSG (x ∈ [34, 58], z ∈ [2, 20])
    // =========================================================================
    this.campus.roomWaypoints.press_hall = { x: 42.0, z: 5.2 };

    // 1. Sân khấu chính nâng cao 0.42m dọc tường Đông (x = 52.5..57.5, z = 4..18)
    const stage = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.42, 13.6),
      new THREE.MeshStandardMaterial({ color: 0x0b162c, roughness: 0.35, metalness: 0.2 })
    );
    stage.position.set(54.8, 0.27, 11.0);
    stage.receiveShadow = true;
    this.interiorGroup.add(stage);
    this.campus.addCollider(56.5, 11.0, 2.0, 13.6);

    // 2. Màn hình LED lớn động trên sân khấu (x = 57.55, z = 11.0)
    const ledFrame = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.2, 9.6), this.furn.mats.matteBlack);
    ledFrame.position.set(57.55, 2.42, 11.0);
    const ledPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(9.2, 3.0),
      THREE.MeshBasicMaterial
        ? new THREE.MeshBasicMaterial({ map: this.ledTex })
        : new THREE.MeshStandardMaterial({ map: this.ledTex, emissive: 0x0a1c3d, emissiveIntensity: 0.45 })
    );
    ledPlane.position.set(57.44, 2.42, 11.0);
    ledPlane.rotation.y = -Math.PI / 2;
    this.interiorGroup.add(ledFrame, ledPlane);
    this.campus.tagInteractable(ledFrame, 'press_led_stage', 'Mở Họp Báo & Truyền Hình Trực Tiếp PSG TV', '📺', 'open_signing_event');

    // 3. Bàn họp báo trên sân khấu (CHỈ có Micro & Nước uống, KHÔNG đặt máy tính!) + 3 Ghế Chủ tịch, Cầu thủ, GĐ Thể thao
    const pressDesk = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.86, 5.6),
      new THREE.MeshStandardMaterial({ color: 0x00205b, roughness: 0.38, metalness: 0.18 })
    );
    pressDesk.position.set(53.4, 0.91, 11.0);
    pressDesk.castShadow = false;
    const pressDeskTop = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.06, 5.7), this.furn.mats.darkWood);
    pressDeskTop.position.set(53.4, 1.35, 11.0);
    const pressGoldTrim = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 5.5), this.furn.mats.gold);
    pressGoldTrim.position.set(52.81, 1.22, 11.0);
    this.interiorGroup.add(pressDesk, pressDeskTop, pressGoldTrim);
    this.campus.addCollider(53.4, 11.0, 1.15, 5.6);
    this.campus.tagInteractable(pressDesk, 'press_stage_desk', 'Bàn Họp Báo Chính Thức PSG', '🎙️', 'open_signing_event');

    // 3 Micro + 3 Chai nước đặt dọc bàn họp báo (dùng chung geometry + material!)
    [9.3, 11.0, 12.7].forEach((mz) => {
      const mic = this.createMicrophone();
      mic.position.set(53.15, 1.38, mz);
      mic.rotation.y = -Math.PI / 2;
      this.interiorGroup.add(mic);
      const wb = new THREE.Mesh(geos.waterBottle, mats.waterBottle);
      wb.position.set(53.55, 1.48, mz + 0.34);
      this.interiorGroup.add(wb);
    });

    // 3 Ghế sân khấu (Chủ tịch, Tân binh, GĐ Thể thao) quay mặt về phía khán phòng (-x)
    [9.3, 11.0, 12.7].forEach((cz, idx) => {
      const ch = this.furn.createSwivelChair(idx === 1);
      ch.position.set(54.5, 0.48, cz);
      ch.rotation.y = Math.PI / 2;
      this.interiorGroup.add(ch);
      this.campus.registerChairPosition(54.5, cz, 0.48);
      if (idx === 1) this.campus.addSeat(ch, 'seat_press_pres', 'Ghế Chủ tịch · Sân khấu Họp báo', 54.5, cz, Math.PI / 2, 51.8, cz);
    });

    // Loa âm thanh hai bên sân khấu + Đèn sân khấu
    const spL = this.createSpeakerStand(); spL.position.set(55.0, 0.48, 4.9); spL.rotation.y = -Math.PI / 2;
    const spR = this.createSpeakerStand(); spR.position.set(55.0, 0.48, 17.1); spR.rotation.y = -Math.PI / 2;
    const slP1 = this.createStudioLight(); slP1.position.set(50.5, 0.14, 5.2); slP1.rotation.y = 2.2;
    const slP2 = this.createStudioLight(); slP2.position.set(50.5, 0.14, 16.8); slP2.rotation.y = 0.9;
    this.interiorGroup.add(spL, spR, slP1, slP2);

    // 4. Khu vực phóng viên (3 hàng x 4 ghế hướng về sân khấu +x)
    const journalistSeats = [];
    for (let row = 0; row < 3; row++) {
      const rx = 47.6 - row * 2.5;
      for (let col = 0; col < 4; col++) {
        const rz = 7.4 + col * 2.4;
        const jc = this.furn.createSwivelChair(false);
        jc.position.set(rx, 0.14, rz);
        jc.rotation.y = -Math.PI / 2;
        this.interiorGroup.add(jc);
        this.campus.registerChairPosition(rx, rz, 0.14);
        journalistSeats.push({ x: rx, z: rz, rotY: Math.PI / 2 });
      }
    }

    // 5. Khu vực Camera truyền hình PSG TV & Nhiếp ảnh gia (hàng sau & bên cánh)
    const tvCamPress1 = this.createCameraOnTripod(true);
    tvCamPress1.position.set(40.2, 0.14, 11.0);
    tvCamPress1.rotation.y = Math.PI / 2;
    const tvCamPress2 = this.createCameraOnTripod(true);
    tvCamPress2.position.set(49.2, 0.14, 17.2);
    tvCamPress2.rotation.y = 2.35;
    const photoCamPress = this.createCameraOnTripod(false);
    photoCamPress.position.set(49.2, 0.14, 4.8);
    photoCamPress.rotation.y = 0.78;
    this.interiorGroup.add(tvCamPress1, tvCamPress2, photoCamPress);

    // 6. Bàn điều khiển Âm thanh & Ánh sáng (góc Tây Nam — bàn mixer chuyên dụng không màn hình PC + 2 ghế thật cho kỹ thuật viên!)
    const mixerTable = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.78, 2.6), this.furn.mats.matteBlack);
    mixerTable.position.set(36.7, 0.53, 15.6);
    const mixerConsole = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.08, 1.8), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.4 }));
    mixerConsole.position.set(36.7, 0.96, 15.6);
    this.interiorGroup.add(mixerTable, mixerConsole);
    this.campus.addCollider(36.7, 15.6, 0.9, 2.6);

    [15.0, 16.2].forEach((tz) => {
      const tc = this.furn.createSwivelChair(false);
      tc.position.set(37.8, 0.14, tz);
      tc.rotation.y = Math.PI / 2;
      this.interiorGroup.add(tc);
      this.campus.registerChairPosition(37.8, tz, 0.14);
    });

    // Lưu toàn bộ tọa độ sân khấu & vị trí camera để CameraDirectionSystem & SigningEventSystem dùng trực tiếp!
    this.seatPositions.press = {
      president: { x: 54.5, z: 11.0, rotY: -Math.PI / 2, y: 0.48 },
      player: { x: 54.5, z: 12.7, rotY: -Math.PI / 2, y: 0.48 },
      sporting: { x: 54.5, z: 9.3, rotY: -Math.PI / 2, y: 0.48 },
      host: { x: 53.5, z: 6.2, rotY: -Math.PI / 2, y: 0.48 },
      mediaDir: { x: 51.8, z: 5.5, rotY: -0.7, y: 0.14 },
      photographer: { x: 49.0, z: 5.3, rotY: 0.9, y: 0.14 },
      cameraman: { x: 39.6, z: 11.0, rotY: Math.PI / 2, y: 0.14 },
      audioTech: { x: 37.8, z: 15.0, rotY: -Math.PI / 2, y: 0.14 },
      lightTech: { x: 37.8, z: 16.2, rotY: -Math.PI / 2, y: 0.14 },
      journalists: journalistSeats
    };

    // Các góc máy truyền hình PSG TV thật trong không gian 3D
    this.cameraTargets = {
      wide_stage:        { pos: { x: 43.2, y: 2.35, z: 11.0 }, look: { x: 54.5, y: 1.55, z: 11.0 }, label: '🎥 Toàn cảnh Sân khấu' },
      president_closeup: { pos: { x: 50.6, y: 1.75, z: 10.6 }, look: { x: 54.5, y: 1.55, z: 11.0 }, label: '👔 Cận cảnh Chủ tịch' },
      player_closeup:    { pos: { x: 50.6, y: 1.75, z: 13.1 }, look: { x: 54.5, y: 1.55, z: 12.7 }, label: '⚽ Cận cảnh Tân binh' },
      journalist_cam:    { pos: { x: 52.0, y: 2.15, z: 15.5 }, look: { x: 46.5, y: 1.30, z: 10.5 }, label: '📰 Góc Phóng viên' },
      signing_desk:      { pos: { x: 46.5, y: 1.95, z: -8.6 }, look: { x: 46.5, y: 1.25, z: -13.8 }, label: '✍️ Bàn Ký Hợp Đồng' }
    };

    // Đóng băng ma trận toàn bộ kiến trúc & nội thất tĩnh Media Wing
    freezeStaticTree(this.group);
  }

  markTexturesNeedsUpdate() {
    if (this.ledTex) this.ledTex.needsUpdate = true;
    if (this.backdropTex) this.backdropTex.needsUpdate = true;
    if (this.jerseyTex) this.jerseyTex.needsUpdate = true;
  }

  dispose() {
    if (this._flashTimer) {
      clearTimeout(this._flashTimer);
      this._flashTimer = null;
    }
    const dynTex = [this.ledTex, this.backdropTex, this.jerseyTex];
    for (const t of dynTex) t?.dispose?.();
    this.ledTex = null;
    this.backdropTex = null;
    this.jerseyTex = null;

    const canvases = [this.ledCanvas, this.backdropCanvas, this.jerseyCanvas];
    for (const c of canvases) {
      if (c) { c.width = 0; c.height = 0; }
    }

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
