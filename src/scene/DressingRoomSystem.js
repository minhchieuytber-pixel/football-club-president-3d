// src/scene/DressingRoomSystem.js
// Tòa nhà Phòng Thay Đồ Cầu Thủ 1 tầng riêng biệt cạnh sân tập & sân vận động PSG
// Gồm: Phòng thay đồ chính (20 tủ cá nhân đồng bộ tên/số áo/áo đấu treo từ DB), Bàn chiến thuật trung tâm, Màn hình sơ đồ đội hình 3D sống động,
// Khu thủ môn, Khu tắm & phục hồi, Phòng HLV, Kho dụng cụ & Sofa nghỉ ngơi
// Tối ưu GPU/RAM: tách shellGroup / interiorGroup để zone culling, pool 3 geometry tủ đồ (60 -> 3), tái sử dụng 20 canvas/texture theo dirty-key,
// không tạo trùng raycastMeshes, cắt PointLight 2 -> 1 và hỗ trợ dispose() an toàn.
import { formatKitName, normalizeKitNumber, resolveKitTheme } from '../characters/PlayerKitSystem.js';

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

export class DressingRoomSystem {
  constructor(campusScene, texFactory, furnFactory, formationSystem) {
    this.campus = campusScene;
    this.tex = texFactory;
    this.furn = furnFactory;
    this.formation = formationSystem;
    this.group = new THREE.Group();
    this.shellGroup = new THREE.Group();
    this.interiorGroup = new THREE.Group();
    this.group.add(this.shellGroup, this.interiorGroup);
    // Cho phép ParcDesPrincesZone.updateStreaming culling chi tiết nội thất riêng mà vẫn giữ vỏ tòa nhà bên ngoài!
    this.group.userData.shellGroup = this.shellGroup;
    this.group.userData.interiorGroup = this.interiorGroup;

    this.lockerMeshes = []; // Lưu 20 tủ + canvas/texture tái sử dụng theo dirty-key
    this.tacticalCanvas = document.createElement('canvas');
    this.tacticalCanvas.width = 512;
    this.tacticalCanvas.height = 360;
    this.tacticalTex = configureFlatCanvasTex(new THREE.CanvasTexture(this.tacticalCanvas));

    // Tọa độ trung tâm tòa nhà 1 tầng cạnh sân tập chính (x ∈ [-48, -26], z ∈ [-56, -32], 22m x 24m)
    this.cx = -37;
    this.cz = -44;
    this.campus.root.add(this.group);
    this.build();
    this._unsubscribeFormation = this.formation.onChange(() => this.refreshDynamicElements());
    this.refreshDynamicElements();
  }

  drawLockerJerseyCanvas(c, shirtNumber, displayName, isCaptain, isGK, activeKit = 'home') {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const kitType = isGK ? 'gk' : (activeKit || 'home');
    const theme = resolveKitTheme(kitType, 0x00205b);
    const upperName = displayName ? formatKitName(displayName, displayName) : '';
    const numStr = normalizeKitNumber(shirtNumber, '');

    ctx.fillStyle = '#0b1528';
    ctx.fillRect(0, 0, 160, 220);

    // Bảng tên & số trên đỉnh tủ
    ctx.fillStyle = '#00205b';
    ctx.fillRect(8, 8, 144, 34);
    ctx.fillStyle = theme.accentHex || '#da291c';
    ctx.fillRect(8, 8, 6, 34);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(numStr ? `#${numStr} ${upperName}` : 'TỦ TRỐNG', 82, 30);

    if (numStr) {
      // Áo đấu PSG treo trong tủ theo đúng mẫu áo đang chọn (Sân nhà / Sân khách / Áo thứ ba / Thủ môn)
      ctx.fillStyle = theme.baseHex;
      ctx.beginPath();
      ctx.moveTo(42, 56); ctx.lineTo(118, 56); ctx.lineTo(142, 86); ctx.lineTo(126, 102);
      ctx.lineTo(116, 92); ctx.lineTo(116, 198); ctx.lineTo(44, 198); ctx.lineTo(44, 92);
      ctx.lineTo(34, 102); ctx.lineTo(18, 86); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = theme.trimHex;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Họa tiết đặc trưng theo từng bộ áo (Hechter / Away sash / Third / GK)
      if (theme.pattern === 'hechter') {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(67, 94, 26, 104);
        ctx.fillStyle = 'rgba(218,41,28,0.84)';
        ctx.fillRect(69, 94, 22, 104);
      } else if (theme.pattern === 'away_sash') {
        ctx.fillStyle = 'rgba(218,41,28,0.45)';
        ctx.fillRect(74, 168, 12, 30);
      } else if (theme.pattern === 'third_luxury') {
        ctx.fillStyle = theme.trimHex;
        ctx.fillRect(44, 56, 72, 4);
        ctx.fillStyle = 'rgba(159,18,57,0.6)';
        ctx.fillRect(44, 186, 72, 12);
      } else if (theme.pattern === 'gk_diamond') {
        ctx.fillStyle = theme.accentHex;
        ctx.fillRect(44, 56, 6, 142);
        ctx.fillRect(110, 56, 6, 142);
      }

      // Tên cầu thủ in hoa phía trên lưng áo & Số áo cỡ lớn chính giữa lưng áo
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = upperName.length >= 10 ? 'bold 11px sans-serif' : 'bold 13px sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = theme.textStrokeHex;
      ctx.strokeText(upperName, 80, 77);
      ctx.fillStyle = theme.textHex;
      ctx.fillText(upperName, 80, 77);

      ctx.font = numStr.length >= 2 ? '900 40px sans-serif' : '900 44px sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = theme.textStrokeHex;
      ctx.strokeText(numStr, 80, 134);
      ctx.fillStyle = theme.textHex;
      ctx.fillText(numStr, 80, 134);

      if (isCaptain) {
        ctx.fillStyle = '#facc15';
        ctx.fillRect(116, 54, 24, 22);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText('C', 128, 66);
      }
      ctx.textBaseline = 'alphabetic';
    }
  }

  makeLockerJerseyTexture(shirtNumber, displayName, isCaptain, isGK, activeKit = 'home') {
    const c = document.createElement('canvas');
    c.width = 160; c.height = 220;
    this.drawLockerJerseyCanvas(c, shirtNumber, displayName, isCaptain, isGK, activeKit);
    return configureFlatCanvasTex(new THREE.CanvasTexture(c));
  }

  build() {
    const cx = this.cx, cz = this.cz;
    // Đăng ký điểm đi nhanh & tọa độ bàn họp chiến thuật trong Phòng Thay Đồ
    this.campus.roomWaypoints.dressing_room = { x: cx + 2, z: cz + 6 };
    this.campus.dressingRoomTable = { x: cx, z: cz };

    // === VỎ NGOẠI THẤT (shellGroup) ===
    // Sàn chống trượt đá xám cao cấp (22m x 24m, 1 tầng duy nhất!)
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(22, 0.16, 24),
      new THREE.MeshStandardMaterial({ color: 0x2a313d, roughness: 0.48, metalness: 0.12 })
    );
    floor.position.set(cx, 0.06, cz);
    floor.receiveShadow = true;
    this.shellGroup.add(floor);

    // Mái 1 tầng hiện đại
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(22.6, 0.42, 24.6),
      new THREE.MeshStandardMaterial({ color: 0x161c27, roughness: 0.42, metalness: 0.35 })
    );
    roof.position.set(cx, 4.55, cz);
    roof.castShadow = true;
    this.shellGroup.add(roof);

    const wallMat = markShared(new THREE.MeshStandardMaterial({ color: 0x1e2532, roughness: 0.55, metalness: 0.12 }));
    const addW = (x, z, w, d) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 4.35, d), wallMat);
      m.position.set(x, 2.28, z);
      m.castShadow = false;
      m.receiveShadow = true;
      this.shellGroup.add(m);
      this.campus.addCollider(x, z, w, d);
    };

    // 4 Tường bao tòa nhà 1 tầng:
    // Tường Bắc (z = cz - 12), Tường Tây (x = cx - 11), Tường Nam (z = cz + 12 có kính lớn), Tường Đông (x = cx + 11 hướng ra sân tập có cửa chính!)
    addW(cx, cz - 12, 22, 0.26);
    addW(cx - 11, cz, 0.26, 24);
    this.campus.addGlassWindow(cx, cz + 12, 22, 0, false);

    // Mặt tiền Đông hướng thẳng ra công viên/sân tập (x = cx + 11): kính + cửa gỗ lớn!
    this.campus.addGlassWindow(cx + 11, cz - 6.5, 11, Math.PI / 2, false);
    this.campus.addWoodenDoor('door_dressing_main', cx + 11, cz + 0.5, Math.PI / 2, 2.4, true);
    this.campus.addGlassWindow(cx + 11, cz + 7.0, 10, Math.PI / 2, false);

    // Biển hiệu mặt tiền (MeshBasicMaterial nhẹ thay vì PBR)
    const facadeMat = THREE.MeshBasicMaterial
      ? new THREE.MeshBasicMaterial({ map: this.tex.signTexture('PHÒNG THAY ĐỒ ĐỘI MỘT · PARIS SAINT-GERMAIN', '#00205b', '#ffffff', '#da291c') })
      : new THREE.MeshStandardMaterial({ map: this.tex.signTexture('PHÒNG THAY ĐỒ ĐỘI MỘT · PARIS SAINT-GERMAIN', '#00205b', '#ffffff', '#da291c') });
    const facade = new THREE.Mesh(new THREE.PlaneGeometry(13, 1.2), facadeMat);
    facade.position.set(cx + 11.2, 3.85, cz);
    facade.rotation.y = Math.PI / 2;
    this.shellGroup.add(facade);

    // === NỘI THẤT CHI TIẾT (interiorGroup — tự động culling khi ở xa!) ===
    // 1 đèn trần trung tâm thay vì 2 PointLight để giảm chi phí shader toàn cảnh
    const mainLight = new THREE.PointLight(0xf6f8ff, 1.15, 30, 1.3);
    mainLight.position.set(cx, 4.0, cz);
    this.interiorGroup.add(mainLight);

    const crestMat = THREE.MeshBasicMaterial
      ? new THREE.MeshBasicMaterial({ map: this.tex.psgCrestTexture(), transparent: true })
      : new THREE.MeshStandardMaterial({ map: this.tex.psgCrestTexture(), transparent: true });
    const crest = new THREE.Mesh(new THREE.CircleGeometry(1.1, 28), crestMat);
    crest.position.set(cx, 2.7, cz - 11.82);
    this.interiorGroup.add(crest);

    // === 20 TỦ ĐỒ CÁ NHÂN CẦU THỦ ĐỘI MỘT (POOL 3 GEOMETRY DÙNG CHUNG: 60 -> 3!) ===
    const lockerMat = this.furn.mats.darkWood;
    const benchMat = this.furn.mats.leatherNavy;
    const lockerBackGeo = markShared(new THREE.BoxGeometry(1.18, 2.2, 0.56));
    const lockerBenchGeo = markShared(new THREE.BoxGeometry(1.16, 0.44, 0.46));
    const lockerDispGeo = markShared(new THREE.PlaneGeometry(1.06, 1.48));
    this._sharedGeos = [lockerBackGeo, lockerBenchGeo, lockerDispGeo];

    const createLockerSlot = (idx, lx, lz, rotY) => {
      const lg = new THREE.Group();
      lg.position.set(lx, 0.14, lz);
      lg.rotation.y = rotY;
      const back = new THREE.Mesh(lockerBackGeo, lockerMat);
      back.position.set(0, 1.1, 0);
      lg.add(back);
      const bench = new THREE.Mesh(lockerBenchGeo, benchMat);
      bench.position.set(0, 0.22, 0.48);
      lg.add(bench);

      // Tạo sẵn canvas + CanvasTexture 1 lần duy nhất (không mipmaps, tái sử dụng theo dirty-key!)
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 220;
      const tex = configureFlatCanvasTex(new THREE.CanvasTexture(canvas));
      const dispMat = THREE.MeshBasicMaterial
        ? new THREE.MeshBasicMaterial({ map: tex })
        : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 });
      const disp = new THREE.Mesh(lockerDispGeo, dispMat);
      disp.position.set(0, 1.38, 0.29);
      lg.add(disp);
      this.interiorGroup.add(lg);
      this.lockerMeshes.push({ idx, canvas, tex, dispMat, lg, lastKey: null, interactTagged: false });
    };

    // 12 tủ dọc tường Tây (x = cx - 10.4, quay mặt +x) + 8 tủ dọc tường Bắc (z = cz - 11.4, quay mặt +z)
    for (let i = 0; i < 12; i++) {
      createLockerSlot(i, cx - 10.35, cz - 8.5 + i * 1.45, Math.PI / 2);
    }
    for (let i = 0; i < 8; i++) {
      createLockerSlot(12 + i, cx - 7.5 + i * 1.6, cz - 11.35, 0);
    }
    this.campus.addCollider(cx - 10.2, cz - 0.5, 1.4, 18.0);
    this.campus.addCollider(cx - 1.9, cz - 11.2, 13.0, 1.4);

    // === BÀN HỌP CHIẾN THUẬT TRUNG TÂM + MÀN HÌNH SƠ ĐỒ ĐỘI HÌNH 3D SỐNG ĐỘNG ===
    const tacTable = this.furn.createConferenceTable(5.2, 1.9);
    tacTable.position.set(cx + 0.5, 0.14, cz - 1.2);
    this.interiorGroup.add(tacTable);
    this.campus.addCollider(cx + 0.5, cz - 1.2, 5.2, 1.9);
    this.campus.tagInteractable(tacTable, 'dr_tactics_table', 'Mở Sơ Đồ Đội Hình & Chiến Thuật PSG', '📋', 'open_formation');

    // Màn hình chiến thuật lớn hiển thị sơ đồ áo đấu thật (cập nhật realtime!)
    const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.55, 0.10), this.furn.mats.matteBlack);
    screenFrame.position.set(cx + 6.5, 2.15, cz - 11.75);
    const screenPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 2.38),
      THREE.MeshBasicMaterial
        ? new THREE.MeshBasicMaterial({ map: this.tacticalTex })
        : new THREE.MeshStandardMaterial({ map: this.tacticalTex, emissive: 0x0c2444, emissiveIntensity: 0.35 })
    );
    screenPlane.position.set(cx + 6.5, 2.15, cz - 11.68);
    this.interiorGroup.add(screenFrame, screenPlane);
    this.campus.tagInteractable(screenFrame, 'dr_tactics_screen', 'Chỉnh Sơ Đồ Đội Hình PSG (Đồng bộ)', '🖥️', 'open_formation');

    // Khu vực nghỉ ngơi Sofa + Tủ lạnh nước uống & khăn tắm (góc Đông Nam)
    const sofa = this.furn.createSofa(3.0);
    sofa.position.set(cx + 6.5, 0.14, cz + 7.5);
    sofa.rotation.y = Math.PI;
    this.interiorGroup.add(sofa);
    this.campus.addCollider(cx + 6.5, cz + 7.5, 3.0, 0.9);
    this.campus.addSeat(sofa, 'seat_dr_sofa', 'Sofa Phòng Thay Đồ PSG', cx + 6.5, cz + 7.2, 0, cx + 6.5, cz + 5.8);

    const fridge = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.0, 0.75), this.furn.mats.chrome);
    fridge.position.set(cx + 9.6, 1.14, cz + 8.5);
    this.interiorGroup.add(fridge);
    this.campus.addCollider(cx + 9.6, cz + 8.5, 1.1, 0.75);

    // Khu chức năng phụ: Khu phục hồi (Giường y tế) & Kho dụng cụ bóng tập (góc Tây Nam)
    const recBed = this.furn.createMedicalBed();
    recBed.position.set(cx - 5.5, 0.14, cz + 9.2);
    this.interiorGroup.add(recBed);
    this.campus.addCollider(cx - 5.5, cz + 9.2, 2.1, 0.95);

    const gearRack = this.furn.createFilingCabinet(2.0, 1.9, 0.5);
    gearRack.position.set(cx - 1.5, 0.14, cz + 11.0);
    gearRack.rotation.y = Math.PI;
    this.interiorGroup.add(gearRack);
    this.campus.addCollider(cx - 1.5, cz + 11.0, 2.0, 0.55);

    // Đóng băng ma trận toàn bộ kiến trúc & nội thất tĩnh Phòng Thay Đồ
    freezeStaticTree(this.group);
  }

  // Cập nhật đồng bộ 20 tủ cầu thủ + Màn hình chiến thuật 3D theo dirty-key (KHÔNG tạo mới canvas/texture, KHÔNG lặp raycastMeshes!)
  refreshDynamicElements() {
    this.formation.syncLockers();
    const activeKit = this.formation?.state?.activeKit || 'home';
    for (let i = 0; i < this.lockerMeshes.length; i++) {
      const slot = this.lockerMeshes[i];
      const l = this.formation.lockers[slot.idx];
      if (!l) continue;

      const key = `${activeKit}|${l.shirtNumber || ''}|${l.displayName || ''}|${l.isCaptain ? 1 : 0}|${l.position === 'GK' ? 1 : 0}|${l.fullName || ''}|${l.position || ''}|${l.isAssigned ? 1 : 0}`;
      if (slot.lastKey !== key) {
        this.drawLockerJerseyCanvas(slot.canvas, l.shirtNumber, l.displayName, l.isCaptain, l.position === 'GK', activeKit);
        slot.tex.needsUpdate = true;
        slot.lastKey = key;

        const id = `locker_int_${slot.idx}`;
        const label = l.isAssigned
          ? `Tủ #${l.shirtNumber} ${l.fullName} (${l.position})`
          : 'Tủ đồ đội một PSG (Trống)';
        if (l.isAssigned && !slot.interactTagged) {
          this.campus.tagInteractable(slot.lg, id, label, '👕', 'open_formation');
          slot.interactTagged = true;
        } else if (slot.interactTagged && this.campus.interactables) {
          this.campus.interactables.set(id, { id, label, icon: '👕', action: 'open_formation', extra: null });
        }
      }
    }
    this.formation.drawTacticalScreenCanvas(this.tacticalCanvas);
    this.tacticalTex.needsUpdate = true;
  }

  markTexturesNeedsUpdate() {
    if (this.tacticalTex) this.tacticalTex.needsUpdate = true;
    for (let i = 0; i < this.lockerMeshes.length; i++) {
      if (this.lockerMeshes[i].tex) this.lockerMeshes[i].tex.needsUpdate = true;
    }
  }

  dispose() {
    if (typeof this._unsubscribeFormation === 'function') {
      this._unsubscribeFormation();
      this._unsubscribeFormation = null;
    }
    if (this.tacticalTex) {
      this.tacticalTex.dispose?.();
      this.tacticalTex = null;
    }
    if (this.tacticalCanvas) {
      this.tacticalCanvas.width = 0;
      this.tacticalCanvas.height = 0;
    }
    for (let i = 0; i < this.lockerMeshes.length; i++) {
      const s = this.lockerMeshes[i];
      if (s.tex) s.tex.dispose?.();
      if (s.dispMat && !s.dispMat.userData?.sharedAsset) s.dispMat.dispose?.();
      if (s.canvas) { s.canvas.width = 0; s.canvas.height = 0; }
    }
    this.lockerMeshes.length = 0;

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
