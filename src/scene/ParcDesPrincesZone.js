// src/scene/ParcDesPrincesZone.js
// Quy hoạch tổng thể Khuôn viên PSG (6 khu vực trong cùng 1 thế giới 3D):
// 1. Khu nhà điều hành PSG (z ∈ [-22, 22])
// 2. Khu sân vận động Parc des Princes (tách biệt phía Bắc tại tâm (0, -152), cách Trụ sở > 80m, không che khuất nhà điều hành)
// 3. Khu công viên cảnh quan & Phòng Thay Đồ (z ∈ [-58, -30])
// 4. Khu bãi đỗ xe (Bãi xe HQ + Bãi xe VIP & CĐV SVĐ tại (41, -78))
// 5. Khu cảnh quan, cây xanh & hệ thống đường nội bộ kết nối liền mạch từ Trụ sở -> Công viên -> Hậu cần -> SVĐ
// 6. Khu dịch vụ, hậu cần & cổng kiểm soát an ninh SVĐ tại (-32, -82)
//
// Tối ưu hiệu năng Phase 2:
// - LOD Thấp (Exterior Shell nhẹ) luôn hiển thị từ xa để nhìn thấy đường chân trời Parc des Princes & Camera giám sát hoạt động nhẹ nhàng
// - LOD Cao (Nội thất sân cỏ chi tiết, khán đài đa tầng, bảng LED, khu VIP, cabin kỹ thuật) CHỈ tạo & render theo dạng Lazy Streaming khi người chơi đến gần SVĐ (< 88m)
// - Đã loại bỏ PointLight runtime trong LOD Cao để KHÔNG gây giật biên dịch shader khi đi tới SVĐ!
// - Chia sẻ toàn bộ geometry/material lặp (userData.sharedAsset = true), gộp vạch kẻ đường bằng InstancedMesh, đóng băng ma trận mesh tĩnh
// - Zone-based culling cho HQ, Media Wing, Phòng Thay Đồ, Bãi xe SVĐ & Đạo cụ tập luyện (tương thích 100% với CAMPUS-1..6!)

function markShared(asset) {
  if (!asset) return asset;
  if (!asset.userData) asset.userData = {};
  asset.userData.sharedAsset = true;
  return asset;
}

function freezeStaticTree(root) {
  if (!root || typeof root.traverse !== 'function') return;
  root.traverse((obj) => {
    if (typeof obj.updateMatrix === 'function') obj.updateMatrix();
    obj.matrixAutoUpdate = false;
  });
}

export class ParcDesPrincesZone {
  constructor(campusScene, texFactory, furnFactory, vehicleSystem) {
    this.campus = campusScene;
    this.tex = texFactory;
    this.furn = furnFactory;
    this.vehicles = vehicleSystem;

    this.stadiumCenter = { x: 0, z: -152 };
    this.hqCenter = { x: 0, z: 0 };
    this.streamDistance = 88; // Khoảng cách kích hoạt tải LOD Cao cho SVĐ

    this.root = new THREE.Group();
    this.connectorGroup = new THREE.Group(); // Đường nội bộ, cảnh quan, bãi đỗ xe SVĐ & khu dịch vụ hậu cần
    this.stadiumParkingGroup = new THREE.Group(); // 4 xe VIP bãi SVĐ (cull khi ở trong HQ không bật CCTV)
    this.lodLowGroup = new THREE.Group();    // Vỏ ngoại thất Parc des Princes nhẹ (luôn thấy từ xa & CCTV)
    this.lodHighGroup = new THREE.Group();   // Nội thất chi tiết SVĐ (lazy-streamed khi đến gần!)
    this.lodHighGroup.visible = false;
    this.lodHighBuilt = false;
    this.lowPitch = null;

    this.currentStreamMode = 'hq_detail'; // 'hq_detail' | 'transition' | 'stadium_detail'
    this.cctvModeActive = false;
    this._hqCulled = false;

    this.connectorGroup.add(this.stadiumParkingGroup);
    this.root.add(this.connectorGroup, this.lodLowGroup, this.lodHighGroup);
    this.campus.root.add(this.root);

    // Các góc Camera Giám Sát SVĐ Parc des Princes từ xa (hoạt động nhẹ bằng LOD Low mà không cần tải full LOD High!)
    this.cctvCameras = {
      overview_gate: {
        label: '📹 Cam 1 · Toàn cảnh Parc des Princes & Quảng trường',
        pos: { x: 46, y: 24, z: -88 },
        look: { x: 0, y: 8, z: -152 }
      },
      aerial_bowl: {
        label: '🏟️ Cam 2 · Giám sát mái vòm & mặt sân từ trên cao',
        pos: { x: -58, y: 42, z: -110 },
        look: { x: 0, y: 2, z: -154 }
      },
      boulevard_security: {
        label: '🛣️ Cam 3 · Tuyến đường nội bộ, Bãi xe & Cổng kiểm soát',
        pos: { x: 64, y: 18, z: -48 },
        look: { x: -12, y: 2, z: -86 }
      }
    };

    this.buildConnectorAndServices();
    this.buildStadiumLodLow();
  }

  // ==================== KHU 4, 5, 6: ĐƯỜNG NỘI BỘ, BÃI ĐỖ XE SVĐ, CẢNH QUAN & HẬU CẦN ====================
  buildConnectorAndServices() {
    const roadMat = markShared(new THREE.MeshStandardMaterial({ color: 0x252b36, roughness: 0.84 }));
    const walkwayMat = markShared(new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.68 }));
    const laneMat = markShared(THREE.MeshBasicMaterial
      ? new THREE.MeshBasicMaterial({ color: 0xf8fafc })
      : new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 }));

    // 1. Đại lộ nội bộ phía Đông nối Quảng trường Trụ sở (z = 26) -> chạy dọc phía Đông Khu Sự Kiện (x = 66) -> rẽ Tây vào Quảng trường SVĐ (z = -96)
    const eastRoad = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.06, 134), roadMat);
    eastRoad.position.set(66, 0.01, -34);
    eastRoad.receiveShadow = true;
    const southLink = new THREE.Mesh(new THREE.BoxGeometry(58, 0.06, 8.5), roadMat);
    southLink.position.set(37, 0.01, 30);
    const northLink = new THREE.Mesh(new THREE.BoxGeometry(108, 0.06, 9.0), roadMat);
    northLink.position.set(16, 0.01, -96);
    this.connectorGroup.add(eastRoad, southLink, northLink);

    // Vạch kẻ đường nội bộ sắc nét -> gộp thành 1 InstancedMesh duy nhất (15 draw calls -> 1!)
    const dashZs = [];
    for (let z = 22; z >= -90; z -= 8) dashZs.push(z);
    const dashGeo = markShared(new THREE.BoxGeometry(0.22, 0.07, 3.4));
    const dashInst = new THREE.InstancedMesh(dashGeo, laneMat, dashZs.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < dashZs.length; i++) {
      dummy.position.set(66, 0.015, dashZs[i]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      dashInst.setMatrixAt(i, dummy.matrix);
    }
    this.connectorGroup.add(dashInst);

    // 2. Đường dạo bộ cảnh quan trung tâm nối thẳng Sân Tập (z = -58) -> Quảng trường Parc des Princes (z = -102)
    const parkWalkway = new THREE.Mesh(new THREE.BoxGeometry(9.0, 0.07, 46), walkwayMat);
    parkWalkway.position.set(0, 0.015, -80);
    parkWalkway.receiveShadow = true;
    this.connectorGroup.add(parkWalkway);

    // Quảng trường đón tiếp phía Nam Sân vận động Parc des Princes
    const esplanade = new THREE.Mesh(
      new THREE.BoxGeometry(74, 0.07, 18),
      markShared(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.72 }))
    );
    esplanade.position.set(0, 0.015, -101);
    esplanade.receiveShadow = true;
    this.connectorGroup.add(esplanade);

    // Đăng ký điểm đi nhanh trong cùng khuôn viên!
    this.campus.roomWaypoints.stadium_plaza = { x: 0, z: -102 };
    this.campus.roomWaypoints.stadium_pitch = { x: 0, z: -136 };
    this.campus.roomWaypoints.logistics_gate = { x: -22, z: -82 };

    // Biển chỉ dẫn tuyến nội bộ -> Parc des Princes (tập luyện & thi đấu)
    const dirSignMat = new THREE.MeshBasicMaterial({
      map: this.tex.signTexture('← HẬU CẦN & AN NINH  |  SVĐ PARC DES PRINCES (TẬP LUYỆN & THI ĐẤU) ↑  |  BÃI XE VIP →', '#00205b', '#ffffff', '#da291c')
    });
    const dirSign = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 1.15), dirSignMat);
    dirSign.position.set(0, 3.2, -64);
    const poleGeo = markShared(new THREE.CylinderGeometry(0.08, 0.09, 3.5, 8));
    const poleL = new THREE.Mesh(poleGeo, this.furn.mats.aluminum); poleL.position.set(-3.3, 1.75, -64);
    const poleR = new THREE.Mesh(poleGeo, this.furn.mats.aluminum); poleR.position.set(3.3, 1.75, -64);
    this.connectorGroup.add(dirSign, poleL, poleR);

    // 3. Khu Bãi đỗ xe SVĐ & VIP (phía Đông giữa Khu Sân Tập & SVĐ: x ∈ [24, 58], z ∈ [-90, -68])
    const stParking = new THREE.Mesh(new THREE.BoxGeometry(34, 0.06, 20), roadMat);
    stParking.position.set(41, 0.01, -78);
    stParking.receiveShadow = true;
    this.connectorGroup.add(stParking);

    if (this.vehicles) {
      const carXs = [29, 36, 43, 50];
      const carColors = [0x0f172a, 0x1e293b, 0x00205b, 0x334155];
      for (let i = 0; i < carXs.length; i++) {
        const cx = carXs[i];
        const car = this.vehicles.createLuxuryCar(carColors[i % carColors.length], 'PSG', { castShadow: false });
        car.position.set(cx, 0.03, -76);
        car.rotation.y = Math.PI;
        this.stadiumParkingGroup.add(car);
        this.campus.addCollider(cx, -76, 2.2, 4.9);
      }
    }

    // 4. Khu Dịch Vụ, Hậu Cần & Trạm Kiểm Soát An Ninh SVĐ (phía Tây giữa Sân tập & SVĐ: x = -32, z = -82)
    const serviceHub = new THREE.Mesh(
      new THREE.BoxGeometry(16, 4.2, 10),
      markShared(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.2 }))
    );
    serviceHub.position.set(-32, 2.1, -82);
    serviceHub.castShadow = false;
    const serviceSign = new THREE.Mesh(
      new THREE.PlaneGeometry(11.5, 1.0),
      new THREE.MeshBasicMaterial({ map: this.tex.signTexture('DỊCH VỤ · HẬU CẦN & PSG MEGASTORE', '#00205b', '#ffffff', '#da291c') })
    );
    serviceSign.position.set(-32, 3.4, -76.9);
    this.connectorGroup.add(serviceHub, serviceSign);
    this.campus.addCollider(-32, -82, 16, 10);
    this.campus.tagInteractable(serviceHub, 'stadium_service_hub', 'Mở Camera Giám Sát SVĐ Parc des Princes', '📹', 'open_stadium_cctv');

    // Trạm kiểm soát an ninh & thanh chắn trên đường vào SVĐ
    const guardPost = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 2.9, 2.8),
      markShared(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 }))
    );
    guardPost.position.set(-8.5, 1.45, -88);
    const barrier = new THREE.Mesh(
      new THREE.BoxGeometry(5.5, 0.12, 0.12),
      markShared(new THREE.MeshStandardMaterial({ color: 0xda291c, roughness: 0.4 }))
    );
    barrier.position.set(-5.2, 1.15, -88);
    barrier.rotation.z = 0.65; // Đang mở cho Chủ tịch đi qua
    this.connectorGroup.add(guardPost, barrier);
    this.campus.addCollider(-8.5, -88, 3.4, 2.8);

    // 5. Cảnh quan cây xanh & đèn đường dọc tuyến nối (InstancedMesh tối ưu hiệu năng!)
    const treeCoords = [
      [-14, -66], [14, -66], [-14, -76], [14, -76], [-14, -86], [14, -86],
      [60, -18], [60, -34], [60, -50], [60, -66], [60, -82],
      [-52, -74], [-52, -92], [58, -104], [-58, -104],
      [-42, -102], [42, -102]
    ];
    const trunks = new THREE.InstancedMesh(
      markShared(new THREE.CylinderGeometry(0.22, 0.34, 2.8, 7)),
      markShared(new THREE.MeshStandardMaterial({ color: 0x4d3423, roughness: 0.9 })),
      treeCoords.length
    );
    const crowns = new THREE.InstancedMesh(
      markShared(new THREE.DodecahedronGeometry(2.1, 1)),
      markShared(new THREE.MeshStandardMaterial({ color: 0x265c34, roughness: 0.82 })),
      treeCoords.length
    );
    treeCoords.forEach(([x, z], i) => {
      dummy.position.set(x, 1.4, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 3.7, z); dummy.scale.set(1.12, 1.05, 1.12); dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
    });
    this.connectorGroup.add(trunks, crowns);

    freezeStaticTree(this.connectorGroup);
  }

  // ==================== KHU 2 (LOD THẤP): VỎ NGOẠI THẤT PARC DES PRINCES NHẸ (LUÔN TỒN TẠI TRONG CÙNG KHUÔN VIÊN) ====================
  buildStadiumLodLow() {
    const cx = this.stadiumCenter.x;
    const cz = this.stadiumCenter.z;

    const concreteMat = markShared(new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.72, metalness: 0.08 }));
    const psgNavyMat = markShared(new THREE.MeshStandardMaterial({ color: 0x00205b, roughness: 0.45, metalness: 0.25 }));
    const psgRedMat = markShared(new THREE.MeshStandardMaterial({ color: 0xda291c, roughness: 0.42, metalness: 0.2 }));
    const roofMat = markShared(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5, metalness: 0.15 }));

    // Bệ móng & tường bao hình oval biểu tượng Parc des Princes (kích thước ~116m x 88m)
    const outerShell = new THREE.Mesh(new THREE.CylinderGeometry(54, 58, 22, 28, 1, true), concreteMat);
    outerShell.position.set(cx, 11, cz);
    outerShell.scale.set(1.06, 1, 0.82);
    this.lodLowGroup.add(outerShell);

    // Dải kiến trúc PSG Navy + Đỏ chạy quanh thân sân vận động
    const bandNavy = new THREE.Mesh(new THREE.CylinderGeometry(55.4, 55.4, 4.2, 28, 1, true), psgNavyMat);
    bandNavy.position.set(cx, 17.5, cz);
    bandNavy.scale.set(1.06, 1, 0.82);
    const bandRed = new THREE.Mesh(new THREE.CylinderGeometry(55.7, 55.7, 1.1, 28, 1, true), psgRedMat);
    bandRed.position.set(cx, 15.0, cz);
    bandRed.scale.set(1.06, 1, 0.82);
    this.lodLowGroup.add(bandNavy, bandRed);

    // 28 sườn bê tông đặc trưng của Parc des Princes dùng InstancedMesh (CHỈ 1 draw call!)
    const ribCount = 28;
    const ribMesh = new THREE.InstancedMesh(markShared(new THREE.BoxGeometry(1.1, 24.5, 4.2)), concreteMat, ribCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < ribCount; i++) {
      const a = (i / ribCount) * Math.PI * 2;
      const rx = cx + Math.cos(a) * 58.2;
      const rz = cz + Math.sin(a) * 45.2;
      dummy.position.set(rx, 12.2, rz);
      dummy.rotation.set(0, -a + Math.PI / 2, 0);
      dummy.updateMatrix();
      ribMesh.setMatrixAt(i, dummy.matrix);
    }
    this.lodLowGroup.add(ribMesh);

    // Mái vòm oval mở giữa sân đặc trưng của Parc des Princes (dùng chung RingGeometry)
    const roofRingGeo = markShared(new THREE.RingGeometry(33, 56, 32));
    const roofRing = new THREE.Mesh(roofRingGeo, roofMat);
    roofRing.rotation.x = -Math.PI / 2;
    roofRing.position.set(cx, 23.2, cz);
    roofRing.scale.set(1.06, 0.82, 1);
    const roofBottom = new THREE.Mesh(roofRingGeo, psgNavyMat);
    roofBottom.rotation.x = Math.PI / 2;
    roofBottom.position.set(cx, 22.8, cz);
    roofBottom.scale.set(1.06, 0.82, 1);
    this.lodLowGroup.add(roofRing, roofBottom);

    // Mặt cỏ nền LOD thấp (1 mesh phẳng duy nhất để Camera giám sát từ xa nhìn thấy mặt cỏ xanh; tự ẩn khi LOD Cao bật!)
    const lowPitch = new THREE.Mesh(
      new THREE.PlaneGeometry(74, 48),
      markShared(new THREE.MeshStandardMaterial({ color: 0x1f6e33, roughness: 0.9 }))
    );
    lowPitch.rotation.x = -Math.PI / 2;
    lowPitch.position.set(cx, 0.04, cz);
    this.lowPitch = lowPitch;
    this.lodLowGroup.add(lowPitch);

    // 4 dàn đèn pha sân vận động tỏa sáng trên mái (dùng chung geometry & material)
    const pylonGeo = markShared(new THREE.CylinderGeometry(0.45, 0.65, 11, 8));
    const headGeo = markShared(new THREE.BoxGeometry(5.6, 2.2, 0.9));
    const headMat = markShared(new THREE.MeshBasicMaterial({ color: 0xfff8e1 }));
    [[-36, -28], [36, -28], [-36, 28], [36, 28]].forEach(([ox, oz]) => {
      const pylon = new THREE.Mesh(pylonGeo, this.furn.mats.aluminum);
      pylon.position.set(cx + ox, 27.5, cz + oz);
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.set(cx + ox, 33.2, cz + oz);
      head.lookAt(cx, 0, cz);
      this.lodLowGroup.add(pylon, head);
    });

    // Biển hiệu lớn phát sáng mặt tiền phía Nam hướng về phía Trụ sở PSG
    const facadeSign = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 4.4),
      new THREE.MeshBasicMaterial({
        map: this.tex.signTexture('PARC DES PRINCES · PARIS SAINT-GERMAIN', '#00205b', '#ffffff', '#da291c')
      })
    );
    facadeSign.position.set(cx, 20.5, cz + 46.8);
    this.lodLowGroup.add(facadeSign);

    // Cổng vòm đón tiếp phía Nam SVĐ (cho phép Chủ tịch đi thẳng vào lòng sân!)
    const gateFrame = new THREE.Mesh(new THREE.BoxGeometry(16, 6.2, 3.2), psgNavyMat);
    gateFrame.position.set(cx, 6.8, cz + 45.2);
    this.lodLowGroup.add(gateFrame);
    this.campus.tagInteractable(facadeSign, 'parc_des_princes_entry', 'Mở Trung tâm Matchday · Parc des Princes', '🏟️', 'open_matchday');

    // Collider tường bao ngoài SVĐ (chừa lối vào rộng 12m tại phía Nam x ∈ [-6, 6], z = cz + 45!)
    this.campus.addCollider(cx - 34, cz + 45, 44, 3.0);
    this.campus.addCollider(cx + 34, cz + 45, 44, 3.0);
    this.campus.addCollider(cx, cz - 46, 112, 3.0);
    this.campus.addCollider(cx - 58, cz, 3.0, 90);
    this.campus.addCollider(cx + 58, cz, 3.0, 90);

    freezeStaticTree(this.lodLowGroup);
  }

  // ==================== KHU 2 (LOD CAO): TẢI LƯỜI (LAZY STREAMING) KHI NGƯỜI CHƠI ĐẾN GẦN SVĐ ====================
  ensureLodHighBuilt() {
    if (this.lodHighBuilt) return;
    this.lodHighBuilt = true;
    const cx = this.stadiumCenter.x;
    const cz = this.stadiumCenter.z;

    // 1. Mặt cỏ chi tiết chuẩn FIFA + vạch kẻ sân từ TextureFactory (emissive nhẹ thay PointLight runtime!)
    const detailedPitch = new THREE.Mesh(
      new THREE.PlaneGeometry(76, 50),
      new THREE.MeshStandardMaterial({
        map: this.tex.grassPitchTexture(true),
        roughness: 0.78,
        emissive: 0x0b2a14,
        emissiveIntensity: 0.22
      })
    );
    detailedPitch.rotation.x = -Math.PI / 2;
    detailedPitch.position.set(cx, 0.08, cz);
    detailedPitch.receiveShadow = true;
    this.lodHighGroup.add(detailedPitch);

    // 2. Hai khung thành 3D chi tiết + lưới (chia sẻ geometry & material)
    const postMat = markShared(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.4 }));
    const netMat = markShared(new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.35 }));
    const goalPostGeo = markShared(new THREE.CylinderGeometry(0.07, 0.07, 2.55, 8));
    const goalBarGeo = markShared(new THREE.CylinderGeometry(0.07, 0.07, 7.5, 8));
    const goalNetGeo = markShared(new THREE.BoxGeometry(1.7, 2.5, 7.3));

    [-35.5, 35.5].forEach((gx) => {
      const g = new THREE.Group();
      const pL = new THREE.Mesh(goalPostGeo, postMat); pL.position.set(0, 1.28, -3.7);
      const pR = new THREE.Mesh(goalPostGeo, postMat); pR.position.set(0, 1.28, 3.7);
      const bar = new THREE.Mesh(goalBarGeo, postMat); bar.rotation.x = Math.PI / 2; bar.position.set(0, 2.55, 0);
      const net = new THREE.Mesh(goalNetGeo, netMat); net.position.set(gx < 0 ? -0.85 : 0.85, 1.25, 0);
      g.add(pL, pR, bar, net);
      g.position.set(cx + gx, 0.08, cz);
      this.lodHighGroup.add(g);
    });

    // 3. Khán đài 4 mặt đa tầng (Bắc, Nam, Đông, Tây) dùng 1 BoxGeometry đơn vị chia sẻ (20 geos -> 1!)
    const tierNavy = markShared(new THREE.MeshStandardMaterial({ color: 0x102e63, roughness: 0.62, emissive: 0x040d20, emissiveIntensity: 0.25 }));
    const tierRed = markShared(new THREE.MeshStandardMaterial({ color: 0xc92424, roughness: 0.6, emissive: 0x1f0505, emissiveIntensity: 0.22 }));
    const standUnitGeo = markShared(new THREE.BoxGeometry(1, 2.6, 1));
    const buildStand = (x, z, w, d, rotY) => {
      const sg = new THREE.Group();
      const tierDepth = d / 4;
      for (let t = 0; t < 4; t++) {
        const step = new THREE.Mesh(standUnitGeo, t === 1 ? tierRed : tierNavy);
        step.scale.set(w, 1, tierDepth);
        step.position.set(0, 1.3 + t * 2.5, -d / 2 + (t + 0.5) * tierDepth);
        sg.add(step);
      }
      sg.position.set(x, 0.1, z);
      sg.rotation.y = rotY;
      this.lodHighGroup.add(sg);
    };
    buildStand(cx, cz - 35, 82, 16, 0);          // Khán đài Bắc
    buildStand(cx - 24, cz + 35, 34, 14, Math.PI); // Khán đài Nam trái (chừa lối vào trung tâm)
    buildStand(cx + 24, cz + 35, 34, 14, Math.PI); // Khán đài Nam phải
    buildStand(cx - 47, cz, 56, 15, Math.PI / 2);  // Khán đài Tây
    buildStand(cx + 47, cz, 56, 15, -Math.PI / 2); // Khán đài Đông

    // 4. Khán đài VIP Chủ tịch Phạm Minh Chiêu & Biển LED chạy quanh sân
    const vipBox = new THREE.Mesh(
      new THREE.BoxGeometry(16, 3.6, 5.2),
      markShared(new THREE.MeshStandardMaterial({ color: 0x172540, roughness: 0.3, metalness: 0.45 }))
    );
    vipBox.position.set(cx, 12.2, cz - 39);
    const vipSign = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 1.2),
      new THREE.MeshBasicMaterial({ map: this.tex.signTexture('KHÁN ĐÀI VIP CHỦ TỊCH PHẠM MINH CHIÊU · PARC DES PRINCES', '#00205b', '#fde68a', '#da291c') })
    );
    vipSign.position.set(cx, 14.3, cz - 36.3);
    this.lodHighGroup.add(vipBox, vipSign);

    const adMat = markShared(new THREE.MeshBasicMaterial({
      map: this.tex.signTexture('QATAR AIRWAYS  ·  NIKE  ·  PARC DES PRINCES  ·  ICI C\'EST PARIS', '#00205b', '#ffffff', '#da291c')
    }));
    const adNorth = new THREE.Mesh(new THREE.BoxGeometry(74, 1.05, 0.16), adMat);
    adNorth.position.set(cx, 0.62, cz - 26.2);
    const adSouthGeo = markShared(new THREE.BoxGeometry(28, 1.05, 0.16));
    const adSouthL = new THREE.Mesh(adSouthGeo, adMat);
    adSouthL.position.set(cx - 22, 0.62, cz + 26.2);
    const adSouthR = new THREE.Mesh(adSouthGeo, adMat);
    adSouthR.position.set(cx + 22, 0.62, cz + 26.2);
    this.lodHighGroup.add(adNorth, adSouthL, adSouthR);

    // 5. Cabin kỹ thuật (Dugouts) 2 đội bên đường biên Bắc (không thêm PointLight runtime -> 0 giật biên dịch shader!)
    const dugoutGeo = markShared(new THREE.BoxGeometry(7.2, 2.2, 1.9));
    const dugoutMat = markShared(new THREE.MeshStandardMaterial({ color: 0x1e293b, transparent: true, opacity: 0.82 }));
    [-11, 11].forEach((ox) => {
      const dugout = new THREE.Mesh(dugoutGeo, dugoutMat);
      dugout.position.set(cx + ox, 1.2, cz - 24.5);
      this.lodHighGroup.add(dugout);
      this.campus.tagInteractable(dugout, `stadium_dugout_${ox}`, 'Mở Trung tâm Matchday PSG', '⚽', 'open_matchday');
    });

    freezeStaticTree(this.lodHighGroup);
  }

  // ==================== STREAMING & CULLING THEO KHOẢNG CÁCH & KHU VỰC ====================
  updateStreaming(playerPos, hqDetailRoot = null, npcs = [], extraZones = {}) {
    if (!playerPos) return this.currentStreamMode;
    const distToStadium = Math.hypot(playerPos.x - this.stadiumCenter.x, playerPos.z - this.stadiumCenter.z);
    const distToHq = Math.hypot(playerPos.x - this.hqCenter.x, playerPos.z - this.hqCenter.z);

    // Hysteresis nhẹ (vào <= 88m, thoát > 94m) tránh nhấp nháy ở ranh giới; CCTV từ Trụ sở KHÔNG kích hoạt tải LOD Cao!
    const wantLodHigh = this.lodHighGroup.visible
      ? distToStadium <= this.streamDistance + 6
      : distToStadium <= this.streamDistance;

    if (wantLodHigh) {
      this.ensureLodHighBuilt();
      this.lodHighGroup.visible = true;
      this.currentStreamMode = 'stadium_detail';
    } else {
      this.lodHighGroup.visible = false;
      this.currentStreamMode = distToHq <= 74 ? 'hq_detail' : 'transition';
    }

    // Ẩn mặt cỏ LOD thấp khi LOD Cao đang hiển thị để tránh z-overlap / overdraw
    if (this.lowPitch) {
      this.lowPitch.visible = !this.lodHighGroup.visible;
    }

    // Mutual Culling (có hysteresis 86m..92m): Khi người chơi sang sâu khu SVĐ (> 92m), tạm ẩn nội thất nặng trong Trụ sở!
    if (this._hqCulled) {
      if (distToHq <= 86) this._hqCulled = false;
    } else if (distToHq > 92) {
      this._hqCulled = true;
    }

    if (hqDetailRoot) {
      hqDetailRoot.visible = !this._hqCulled;
    }

    // Bãi đỗ xe VIP SVĐ: ẩn khi người chơi đang ở trong/nam Trụ sở và không bật CCTV
    if (this.stadiumParkingGroup) {
      this.stadiumParkingGroup.visible = this.cctvModeActive || playerPos.z < -20;
    }

    // Zone-based culling cho các khu phụ (Media Wing, Phòng Thay Đồ, Đạo cụ tập luyện) — hoàn toàn tương thích cuộc gọi 3 tham số!
    if (extraZones) {
      if (extraZones.mediaRoomsGroup) {
        const isCeremony = Boolean(extraZones.eventCameraActive || extraZones.eventActive);
        const mediaShellVisible = isCeremony || (!this.cctvModeActive && !this._hqCulled);
        extraZones.mediaRoomsGroup.visible = mediaShellVisible;
        const mediaInterior = extraZones.mediaRoomsGroup.userData?.interiorGroup;
        if (mediaInterior) {
          // Chỉ render nội thất nặng Media Wing (20 ghế, máy quay, đèn, sân khấu) khi ở gần cánh Đông hoặc đang làm lễ!
          mediaInterior.visible = isCeremony || (mediaShellVisible && playerPos.x >= 16 && playerPos.z >= -26 && playerPos.z <= 26);
        }
      }

      if (extraZones.dressingRoomGroup) {
        const drDx = playerPos.x + 37;
        const drDz = playerPos.z + 44;
        const drDist2 = drDx * drDx + drDz * drDz;
        const drShellVisible = !this.cctvModeActive && drDist2 <= 88 * 88;
        extraZones.dressingRoomGroup.visible = drShellVisible;
        const drInterior = extraZones.dressingRoomGroup.userData?.interiorGroup;
        if (drInterior) {
          // Ẩn 20 tủ đồ & nội thất Phòng Thay Đồ khi người chơi đang ở bên trong Trụ sở HQ (z > -21.5) hoặc ở xa > 46m
          drInterior.visible = drShellVisible && playerPos.z <= -21.5 && drDist2 <= 46 * 46;
        }
      }

      if (extraZones.museumGroup) {
        const mDx = playerPos.x - 34;
        const mDz = playerPos.z + 44;
        const mDist2 = mDx * mDx + mDz * mDz;
        const mShellVisible = !this.cctvModeActive && mDist2 <= 105 * 105;
        extraZones.museumGroup.visible = mShellVisible;
        const mInterior = extraZones.museumGroup.userData?.interiorGroup;
        if (mInterior) {
          // Ẩn nội thất chi tiết & tủ kính cúp 3D khi người chơi ở sâu trong Trụ sở HQ hoặc xa > 42m
          mInterior.visible = mShellVisible && playerPos.z <= -21.5 && mDist2 <= 42 * 42;
        }
      }

      if (extraZones.trainingEquipGroup) {
        extraZones.trainingEquipGroup.visible = this.lodHighGroup.visible || this.cctvModeActive;
      }
    }

    if (Array.isArray(npcs)) {
      const maxNpcDist2 = 96 * 96;
      for (let i = 0; i < npcs.length; i++) {
        const n = npcs[i];
        if (!n.mesh) continue;
        const dx = n.mesh.position.x - playerPos.x;
        const dz = n.mesh.position.z - playerPos.z;
        const visibleOnCctv = this.cctvModeActive && n.mesh.position.z < -105;
        n.mesh.visible = (dx * dx + dz * dz) < maxNpcDist2 || visibleOnCctv;
      }
    }

    return this.currentStreamMode;
  }

  getPlayerZoneLabel(playerPos) {
    if (!playerPos) return 'Khu Nhà Điều Hành PSG';
    const dSt = Math.hypot(playerPos.x - this.stadiumCenter.x, playerPos.z - this.stadiumCenter.z);
    if (dSt <= 66) return '🏟️ SVĐ Parc des Princes (Tập luyện & Thi đấu · LOD Cao)';
    if (playerPos.x >= 16 && playerPos.x <= 51 && playerPos.z >= -58 && playerPos.z <= -30) {
      return '🏛️ PARIS SAINT-GERMAIN CLUB MUSEUM (Bảo tàng Danh hiệu)';
    }
    if (playerPos.z < -62) return '🛣️ Khu Hậu Cần, Bãi Xe & Đại Lộ SVĐ';
    if (playerPos.z < -25) return '🌳 Công Viên Nội Bộ, Bảo Tàng & Phòng Thay Đồ PSG';
    if (playerPos.z > 23) return '🚘 Bãi Đỗ Xe & Cổng Chính PSG';
    return '🏢 Khu Nhà Điều Hành PSG';
  }
}
