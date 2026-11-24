// src/ai/PathfindingSystem.js
// Hệ thống AI Tìm đường & Né tránh vật thể (Hybrid NavGraph + 2D Obstacle NavGrid A* + Spatial Hash Raycast Steering + ORCA-like Local Avoidance)
// Đảm bảo NPC không đi xuyên tường, bàn ghế, tủ hồ sơ, sofa, cửa đóng, xe cộ, người chơi hay NPC khác; tự tìm đường mới khi bị chặn.

const WHISKER_ANGLES = [0.52, -0.52, 1.05, -1.05, 1.55, -1.55];
const GRID_DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.41421356], [-1, 1, 1.41421356], [1, -1, 1.41421356], [-1, -1, 1.41421356]
];

export class PathfindingSystem {
  constructor(campusScene = null) {
    this.campus = campusScene;
    this.gridStep = 1.0; // Độ phân giải lưới 1m x 1m trên toàn khuôn viên 120m x 116m
    this.minX = -60;
    this.maxX = 60;
    this.minZ = -62;
    this.maxZ = 54;
    this.cols = Math.ceil((this.maxX - this.minX) / this.gridStep);
    this.rows = Math.ceil((this.maxZ - this.minZ) / this.gridStep);
    this.staticGrid = null; // Uint8Array: 0 = đi được, 1 = vật cản cố định

    // 2D Spatial Hash cho toàn bộ colliders (4m x 4m, bao phủ toàn khuôn viên gồm cả SVĐ Parc des Princes z ∈ [-200, 60])
    this.hashStep = 4.0;
    this.hashMinX = -70;
    this.hashMaxX = 78;
    this.hashMinZ = -200;
    this.hashMaxZ = 60;
    this.hashCols = Math.ceil((this.hashMaxX - this.hashMinX) / this.hashStep);
    this.hashRows = Math.ceil((this.hashMaxZ - this.hashMinZ) / this.hashStep);
    this._colliderHash = null;
    this._overflowColliders = [];
    this._doorById = new Map();
    this._doorByCollider = new Map();
    this._bakedColliderCount = -1;
    this._bakedDoorCount = -1;

    // Bộ đệm phẳng tái sử dụng (Zero-GC) cho A* cục bộ trên NavGrid 2D + Binary Min-Heap
    const totalCells = this.cols * this.rows;
    this._aStarG = new Float32Array(totalCells);
    this._aStarCameFrom = new Int32Array(totalCells);
    this._aStarOpenStamp = new Uint32Array(totalCells);
    this._aStarClosedStamp = new Uint32Array(totalCells);
    this._aStarGen = 0;
    this._heapKeys = new Int32Array(4096);
    this._heapF = new Float32Array(4096);
    this._heapSize = 0;

    // Spatial Hash động mỗi frame cho Local Avoidance O(1) (ô 3m x 3m, tái sử dụng mảng tránh GC)
    this._npcCellSize = 3.0;
    this._npcGridBuckets = new Map();
    this._activeNpcBuckets = [];
    this._npcGridBuilt = false;

    // Mạng lưới nút giao thông chính xác đi qua hành lang, khung cửa gỗ và các khu vực sân tập 3D
    this.nodes = {
      // Hành lang chính Đông-Tây (z = 0)
      c_w2: { x: -26.4, z: 0.0 },
      c_w1: { x: -12.8, z: 0.0 },
      c_m1: { x: -10.0, z: 0.0 },
      c_0:  { x: 0.0,   z: 0.0 },
      c_e0: { x: 3.0,   z: 0.0 },
      c_e1: { x: 12.8,  z: 0.0 },
      c_e2: { x: 21.2,  z: 0.0 },
      c_e3: { x: 27.2,  z: 0.0 },
      c_e4: { x: 29.7,  z: 0.0 },
      media_wing_door: { x: 34.0, z: 0.0, doorId: 'door_media_wing' },
      media_corridor:  { x: 42.0, z: 0.0 },
      signing_door:    { x: 42.0, z: -2.0, doorId: 'door_signing_room' },
      signing_in:      { x: 42.0, z: -5.5 },
      signing_area:    { x: 46.5, z: -10.5 },
      press_door:      { x: 42.0, z: 2.0, doorId: 'door_press_hall' },
      press_in:        { x: 42.0, z: 5.5 },
      press_aisle:     { x: 45.0, z: 11.0 },
      press_stage_l:   { x: 51.0, z: 11.0 },
      press_exit_door: { x: 48.0, z: 20.0, doorId: 'door_press_exit' },

      // Khu B (Ban Giám Đốc — phía Bắc)
      pres_foyer: { x: -26.0, z: -3.9, doorId: null },
      pres_door:  { x: -26.0, z: -5.5, doorId: 'door_president_main' },
      pres_in:    { x: -26.0, z: -7.5 },
      pres_meet:  { x: -26.0, z: -13.5 },
      board_door: { x: -10.0, z: -2.4, doorId: 'door_boardroom' },
      board_in:   { x: -10.0, z: -5.2 },
      board_mid:  { x: -10.0, z: -8.6 },
      vip_door:   { x: 3.0,   z: -2.4, doorId: 'door_vip' },
      vip_in:     { x: 3.0,   z: -5.5 },
      vip_north:  { x: 3.0,   z: -19.2 },
      pitch_exit_door: { x: 3.0, z: -22.0, doorId: 'door_pitch_exit' },
      ceo_door:   { x: 12.5,  z: -2.4, doorId: 'door_ceo' },
      ceo_in:     { x: 12.5,  z: -6.0 },
      vp_door:    { x: 21.2,  z: -2.4, doorId: 'door_vp' },
      vp_in:      { x: 21.2,  z: -6.0 },
      sport_door: { x: 29.7,  z: -2.4, doorId: 'door_sporting' },
      sport_in:   { x: 29.7,  z: -6.0 },

      // Khu C & D Hàng 1 (mở ra hành lang chính z = 2.4)
      coach_door: { x: -26.8, z: 2.4, doorId: 'door_coach' },
      coach_in:   { x: -26.8, z: 4.8 },
      scout_door: { x: -12.8, z: 2.4, doorId: 'door_scouting' },
      scout_in:   { x: -12.8, z: 4.8 },
      fin_door:   { x: 13.2,  z: 2.4, doorId: 'door_finance' },
      fin_in:     { x: 13.2,  z: 4.8 },
      media_door: { x: 27.2,  z: 2.4, doorId: 'door_media' },
      media_in:   { x: 27.2,  z: 4.8 },

      // Sảnh chính (Khu A) & Hành lang phụ (z = 12.2)
      lobby_n:   { x: 0.0,   z: 4.8 },
      lobby_w:   { x: -3.6,  z: 12.2 },
      lobby_e:   { x: 3.6,   z: 12.2 },
      lobby_s:   { x: 0.0,   z: 16.5 },
      out_south: { x: 0.0,   z: 25.5 },
      parking_w: { x: -8.0,  z: 27.0 },
      parking_e: { x: 8.0,   z: 27.0 },

      // Hành lang phụ Tây (Khu C Hàng 2) & Đông (Khu D Hàng 2)
      sw_1:       { x: -12.8, z: 12.2 },
      sw_2:       { x: -26.8, z: 12.2 },
      acad_door:  { x: -12.8, z: 13.8, doorId: 'door_academy' },
      acad_in:    { x: -12.8, z: 16.0 },
      trans_door: { x: -26.8, z: 13.8, doorId: 'door_transfers' },
      trans_in:   { x: -26.8, z: 16.0 },

      se_1:       { x: 13.2,  z: 12.2 },
      se_2:       { x: 27.2,  z: 12.2 },
      medic_door: { x: 13.2,  z: 13.8, doorId: 'door_medical' },
      medic_in:   { x: 13.2,  z: 16.0 },
      hr_door:    { x: 27.2,  z: 13.8, doorId: 'door_hr' },
      hr_in:      { x: 27.2,  z: 16.0 },

      // Ngoài trời: Sân tập chính, Khu tập chuyên môn & Tòa nhà Phòng Thay Đồ
      out_north:    { x: 3.0,   z: -25.5 },
      out_nw:       { x: -15.0, z: -28.0 },
      out_ne:       { x: 20.0,  z: -28.0 },
      pitch_n:      { x: 0.0,   z: -33.0 },
      pitch_w:      { x: -14.0, z: -36.0 },
      pitch_e:      { x: 14.0,  z: -36.0 },
      pitch_mid:    { x: 0.0,   z: -44.0 },
      pitch_gk:     { x: -18.5, z: -44.0 },
      pitch_shoot:  { x: 15.0,  z: -44.0 },
      pitch_south:  { x: 0.0,   z: -53.0 },
      pitch_east_side: { x: 42.0, z: -44.0 },
      dr_outside:   { x: -23.2, z: -43.5 },
      dr_door:      { x: -26.0, z: -43.5, doorId: 'door_dressing_main' },
      dr_in:        { x: -28.5, z: -43.5 },
      dr_center:    { x: -35.0, z: -41.0 },
      dr_south:     { x: -34.0, z: -38.0 },

      // Đường nội bộ kết nối Khu Sân Tập -> Khu Hậu Cần / Bãi xe -> Khu SVĐ Parc des Princes (trong cùng khuôn viên)
      parkway_s:      { x: 0.0,   z: -62.0 },
      parkway_mid:    { x: 0.0,   z: -82.0 },
      logistics_hub:  { x: -20.0, z: -82.0 },
      stadium_park:   { x: 32.0,  z: -82.0 },
      east_road_s:    { x: 66.0,  z: 28.0 },
      east_road_mid:  { x: 66.0,  z: -34.0 },
      east_road_n:    { x: 66.0,  z: -96.0 },
      stadium_plaza:  { x: 0.0,   z: -101.0 },
      stadium_pitch:  { x: 0.0,   z: -136.0 },
      stadium_mid:    { x: 0.0,   z: -152.0 },
      stadium_west:   { x: -24.0, z: -152.0 },
      stadium_east:   { x: 24.0,  z: -152.0 }
    };

    this.edges = {};
    const link = (a, b) => {
      if (!this.edges[a]) this.edges[a] = [];
      if (!this.edges[b]) this.edges[b] = [];
      if (!this.edges[a].includes(b)) this.edges[a].push(b);
      if (!this.edges[b].includes(a)) this.edges[b].push(a);
    };

    // Hành lang chính + Khu Sự Kiện Ký Hợp Đồng & Phòng Họp Báo PSG (Đông)
    ['c_w2', 'c_w1', 'c_m1', 'c_0', 'c_e0', 'c_e1', 'c_e2', 'c_e3', 'c_e4', 'media_wing_door', 'media_corridor'].reduce((prev, cur) => {
      if (prev) link(prev, cur);
      return cur;
    }, null);
    link('media_corridor', 'signing_door'); link('signing_door', 'signing_in'); link('signing_in', 'signing_area');
    link('media_corridor', 'press_door'); link('press_door', 'press_in'); link('press_in', 'press_aisle'); link('press_aisle', 'press_stage_l'); link('press_aisle', 'press_exit_door'); link('press_exit_door', 'parking_e');

    // Khu B (qua từng cửa gỗ riêng biệt)
    link('c_w2', 'pres_foyer'); link('pres_foyer', 'pres_door'); link('pres_door', 'pres_in'); link('pres_in', 'pres_meet');
    link('c_m1', 'board_door'); link('board_door', 'board_in'); link('board_in', 'board_mid');
    link('c_e0', 'vip_door'); link('vip_door', 'vip_in'); link('vip_in', 'vip_north'); link('vip_north', 'pitch_exit_door'); link('pitch_exit_door', 'out_north');
    link('c_e1', 'ceo_door'); link('ceo_door', 'ceo_in');
    link('c_e2', 'vp_door'); link('vp_door', 'vp_in');
    link('c_e4', 'sport_door'); link('sport_door', 'sport_in');

    // Khu C & D Hàng 1
    link('c_w2', 'coach_door'); link('coach_door', 'coach_in');
    link('c_w1', 'scout_door'); link('scout_door', 'scout_in');
    link('c_e1', 'fin_door'); link('fin_door', 'fin_in');
    link('c_e3', 'media_door'); link('media_door', 'media_in');

    // Sảnh chính & Hành lang phụ (z = 12.2)
    link('c_0', 'lobby_n'); link('lobby_n', 'lobby_w'); link('lobby_n', 'lobby_e');
    link('lobby_w', 'lobby_e'); link('lobby_w', 'lobby_s'); link('lobby_e', 'lobby_s');
    link('lobby_s', 'out_south'); link('out_south', 'parking_w'); link('out_south', 'parking_e');

    link('lobby_w', 'sw_1'); link('sw_1', 'sw_2');
    link('sw_1', 'acad_door'); link('acad_door', 'acad_in');
    link('sw_2', 'trans_door'); link('trans_door', 'trans_in');

    link('lobby_e', 'se_1'); link('se_1', 'se_2');
    link('se_1', 'medic_door'); link('medic_door', 'medic_in');
    link('se_2', 'hr_door'); link('hr_door', 'hr_in');

    // Ngoài trời & Sân tập & Phòng Thay Đồ (nhiều nhánh phụ giúp tự tìm đường thay thế khi một lối bị chặn!)
    link('out_north', 'pitch_n'); link('out_north', 'out_nw'); link('out_north', 'out_ne');
    link('out_nw', 'pitch_w'); link('out_nw', 'dr_outside');
    link('out_ne', 'pitch_e'); link('out_ne', 'pitch_east_side');
    link('pitch_n', 'pitch_w'); link('pitch_n', 'pitch_e'); link('pitch_n', 'pitch_mid');
    link('pitch_w', 'pitch_mid'); link('pitch_w', 'pitch_gk'); link('pitch_w', 'dr_outside');
    link('pitch_e', 'pitch_mid'); link('pitch_e', 'pitch_shoot'); link('pitch_e', 'pitch_east_side');
    link('pitch_mid', 'pitch_gk'); link('pitch_mid', 'pitch_shoot'); link('pitch_mid', 'pitch_south');
    link('pitch_gk', 'dr_outside'); link('pitch_gk', 'pitch_south');
    link('pitch_shoot', 'pitch_south'); link('pitch_shoot', 'pitch_east_side');
    link('dr_outside', 'dr_door'); link('dr_door', 'dr_in'); link('dr_in', 'dr_center'); link('dr_in', 'dr_south'); link('dr_center', 'dr_south');

    // Kết nối đường nội bộ & đại lộ cảnh quan tới SVĐ Parc des Princes trong cùng khuôn viên PSG
    link('pitch_south', 'parkway_s'); link('parkway_s', 'parkway_mid');
    link('parkway_mid', 'logistics_hub'); link('parkway_mid', 'stadium_park'); link('parkway_mid', 'stadium_plaza');
    link('parking_e', 'east_road_s'); link('east_road_s', 'east_road_mid'); link('east_road_mid', 'east_road_n');
    link('east_road_n', 'stadium_park'); link('east_road_n', 'stadium_plaza');
    link('stadium_plaza', 'stadium_pitch');
    link('stadium_pitch', 'stadium_mid');
    link('stadium_pitch', 'stadium_west');
    link('stadium_pitch', 'stadium_east');
    link('stadium_mid', 'stadium_west');
    link('stadium_mid', 'stadium_east');

    // Precompute các nút nằm trong Nhà điều hành & danh sách nút không phải cửa (tránh Object.keys/entries lặp lại)
    this._hqInteriorNodeKeys = new Set();
    this._nonDoorNodeKeys = [];
    for (const k in this.nodes) {
      const pt = this.nodes[k];
      if (PathfindingSystem.isHqInteriorPoint(pt.x, pt.z)) {
        this._hqInteriorNodeKeys.add(k);
      }
      if (!pt.doorId) {
        this._nonDoorNodeKeys.push(k);
      }
    }

    if (this.campus) this.bakeObstacleGrid();
  }

  attachCampus(campusScene) {
    this.campus = campusScene;
    this.bakeObstacleGrid();
  }

  _ensureColliderIndex() {
    if (!this.campus) return;
    const colCount = this.campus.colliders ? this.campus.colliders.length : 0;
    const doorCount = this.campus.doors ? this.campus.doors.length : 0;
    if (!this._colliderHash || colCount !== this._bakedColliderCount || doorCount !== this._bakedDoorCount) {
      this.bakeObstacleGrid();
    }
  }

  // Nướng bản đồ vật cản 2D + Spatial Hash 4m x 4m + bảng tra cứu cửa O(1)
  bakeObstacleGrid() {
    if (!this.campus) return;
    const colliders = this.campus.colliders || [];
    const doors = this.campus.doors || [];
    this._bakedColliderCount = colliders.length;
    this._bakedDoorCount = doors.length;

    // 1. Bảng tra cứu cửa trực tiếp tới đối tượng live (đọc door.locked theo thời gian thực!)
    this._doorById.clear();
    this._doorByCollider.clear();
    for (let i = 0; i < doors.length; i++) {
      const d = doors[i];
      if (!d) continue;
      if (d.id) this._doorById.set(d.id, d);
      if (d.collider) this._doorByCollider.set(d.collider, d);
    }

    // 2. Xây dựng 2D Collider Spatial Hash (ô 4m x 4m, bao phủ cả HQ lẫn SVĐ Parc des Princes)
    const hashTotal = this.hashCols * this.hashRows;
    const hash = new Array(hashTotal);
    const overflow = [];
    const invHashStep = 1 / this.hashStep;

    for (let i = 0; i < colliders.length; i++) {
      const col = colliders[i];
      if (!col) continue;
      if (col.maxX < this.hashMinX || col.minX > this.hashMaxX || col.maxZ < this.hashMinZ || col.minZ > this.hashMaxZ) {
        overflow.push(col);
        continue;
      }
      const c0 = Math.max(0, Math.floor((col.minX - this.hashMinX) * invHashStep));
      const c1 = Math.min(this.hashCols - 1, Math.floor((col.maxX - this.hashMinX) * invHashStep));
      const r0 = Math.max(0, Math.floor((col.minZ - this.hashMinZ) * invHashStep));
      const r1 = Math.min(this.hashRows - 1, Math.floor((col.maxZ - this.hashMinZ) * invHashStep));
      for (let r = r0; r <= r1; r++) {
        const rowOff = r * this.hashCols;
        for (let c = c0; c <= c1; c++) {
          const idx = rowOff + c;
          let bucket = hash[idx];
          if (!bucket) {
            bucket = [];
            hash[idx] = bucket;
          }
          bucket.push(col);
        }
      }
    }
    this._colliderHash = hash;
    this._overflowColliders = overflow;

    // 3. Nướng lưới tĩnh 1m x 1m cho A* cục bộ tránh đồ nội thất (nhanh nhờ đánh dấu trực tiếp theo AABB từng collider)
    if (!this.staticGrid || this.staticGrid.length !== this.cols * this.rows) {
      this.staticGrid = new Uint8Array(this.cols * this.rows);
    } else {
      this.staticGrid.fill(0);
    }
    const margin = 0.42;
    const invStep = 1 / this.gridStep;
    for (let i = 0; i < colliders.length; i++) {
      const col = colliders[i];
      if (!col || this._doorByCollider.has(col)) continue; // Cửa được kiểm tra động (đóng/khóa)
      const c0 = Math.max(0, Math.floor((col.minX - margin - this.minX) * invStep));
      const c1 = Math.min(this.cols - 1, Math.floor((col.maxX + margin - this.minX) * invStep));
      const r0 = Math.max(0, Math.floor((col.minZ - margin - this.minZ) * invStep));
      const r1 = Math.min(this.rows - 1, Math.floor((col.maxZ + margin - this.minZ) * invStep));
      if (c0 > c1 || r0 > r1) continue;
      for (let r = r0; r <= r1; r++) {
        const wz = this.minZ + (r + 0.5) * this.gridStep;
        if (wz < col.minZ - margin || wz > col.maxZ + margin) continue;
        const rowOff = r * this.cols;
        for (let c = c0; c <= c1; c++) {
          const wx = this.minX + (c + 0.5) * this.gridStep;
          if (wx >= col.minX - margin && wx <= col.maxX + margin) {
            this.staticGrid[rowOff + c] = 1;
          }
        }
      }
    }
  }

  worldToCell(x, z) {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.minX) / this.gridStep)));
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.minZ) / this.gridStep)));
    return { c, r };
  }

  cellToWorld(c, r) {
    return {
      x: this.minX + (c + 0.5) * this.gridStep,
      z: this.minZ + (r + 0.5) * this.gridStep
    };
  }

  _checkColliderListBlocked(list, x, z, rSq, respectClosedDoors) {
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.active) continue;
      if (!respectClosedDoors) {
        const door = this._doorByCollider.get(b);
        if (door && !door.locked) continue;
      }
      const cx = x < b.minX ? b.minX : (x > b.maxX ? b.maxX : x);
      const cz = z < b.minZ ? b.minZ : (z > b.maxZ ? b.maxZ : z);
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < rSq) return true;
    }
    return false;
  }

  isPointBlocked(x, z, radius = 0.34, respectClosedDoors = true) {
    if (!this.campus) return false;
    this._ensureColliderIndex();
    const rSq = radius * radius;
    const invHashStep = 1 / this.hashStep;
    const c0 = Math.floor((x - radius - this.hashMinX) * invHashStep);
    const c1 = Math.floor((x + radius - this.hashMinX) * invHashStep);
    const r0 = Math.floor((z - radius - this.hashMinZ) * invHashStep);
    const r1 = Math.floor((z + radius - this.hashMinZ) * invHashStep);

    const clampC0 = c0 < 0 ? 0 : c0;
    const clampC1 = c1 >= this.hashCols ? this.hashCols - 1 : c1;
    const clampR0 = r0 < 0 ? 0 : r0;
    const clampR1 = r1 >= this.hashRows ? this.hashRows - 1 : r1;

    if (clampC0 <= clampC1 && clampR0 <= clampR1) {
      const hash = this._colliderHash;
      for (let r = clampR0; r <= clampR1; r++) {
        const rowOff = r * this.hashCols;
        for (let c = clampC0; c <= clampC1; c++) {
          const bucket = hash[rowOff + c];
          if (bucket && this._checkColliderListBlocked(bucket, x, z, rSq, respectClosedDoors)) {
            return true;
          }
        }
      }
    }

    if (this._overflowColliders.length > 0) {
      return this._checkColliderListBlocked(this._overflowColliders, x, z, rSq, respectClosedDoors);
    }
    return false;
  }

  // Kiểm tra đường thẳng từ (x1,z1) -> (x2,z2) có sạch vật cản hay không (Raycast 2D)
  hasLineOfSight(x1, z1, x2, z2, radius = 0.32, respectClosedDoors = false) {
    if (!this.campus) return true;
    const dx = x2 - x1;
    const dz = z2 - z1;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.2) return true;
    const steps = Math.max(2, Math.ceil(dist / 0.38));
    const invSteps = 1 / steps;
    for (let i = 1; i < steps; i++) {
      const t = i * invSteps;
      if (this.isPointBlocked(x1 + dx * t, z1 + dz * t, radius, respectClosedDoors)) return false;
    }
    return true;
  }

  // Kiểm tra tọa độ có nằm bên trong Khu Nhà Điều Hành / Văn phòng làm việc PSG (gồm cả cánh Truyền thông Đông) hay không
  static isHqInteriorPoint(x, z) {
    return x >= -34.2 && x <= 58.2 && z >= -22.2 && z <= 22.2;
  }

  isHqInteriorNode(nodeKey) {
    return this._hqInteriorNodeKeys ? this._hqInteriorNodeKeys.has(nodeKey) : false;
  }

  // Kiểm tra nút cửa có bị khóa không (O(1) tra cứu đối tượng cửa live -> đọc door.locked chính xác 100%)
  isNodeBlocked(nodeKey, blockedNodes = null) {
    if (blockedNodes && blockedNodes.has(nodeKey)) return true;
    const node = this.nodes[nodeKey];
    if (!node) return true;
    if (node.doorId && this.campus) {
      this._ensureColliderIndex();
      const door = this._doorById.get(node.doorId);
      if (door && door.locked) return true;
    }
    return false;
  }

  // Xác định nút NavGraph gần nhất trong cùng phòng/khu vực (ưu tiên không nhảy qua tường)
  nearestNode(x, z) {
    if (z < -112) return 'stadium_pitch';
    if (z < -92) return x > 42 ? 'east_road_n' : 'stadium_plaza';
    if (z < -60) return x < -12 ? 'logistics_hub' : (x > 18 ? 'stadium_park' : (z < -72 ? 'parkway_mid' : 'parkway_s'));
    if (x > 60) return z > 0 ? 'east_road_s' : 'east_road_mid';
    if (x > 34.2 && z > -20 && z < 20) {
      if (z < -2.2) return z < -8 ? 'signing_area' : 'signing_in';
      if (z > 2.2) return x > 49 ? 'press_stage_l' : (z > 8 ? 'press_aisle' : 'press_in');
      return 'media_corridor';
    }
    if (x < -25.2 && z < -31.5 && z > -56.5) return x < -31 ? 'dr_center' : 'dr_in';
    if (x > 34 && z < -30) return 'pitch_east_side';
    if (z < -23) {
      if (x < -12 && z < -38) return 'pitch_gk';
      if (x > 10 && z < -38) return 'pitch_shoot';
      if (z < -49) return 'pitch_south';
      if (z < -39) return 'pitch_mid';
      if (z < -30) return x < -8 ? 'pitch_w' : (x > 8 ? 'pitch_e' : 'pitch_n');
      return 'out_north';
    }
    if (z > 22.5) return x < -5 ? 'parking_w' : (x > 5 ? 'parking_e' : 'out_south');
    if (z < -2.4) {
      if (x < -18) return z < -10 ? 'pres_meet' : (z < -5.6 ? 'pres_in' : 'pres_foyer');
      if (x < -2) return z < -7 ? 'board_mid' : 'board_in';
      if (x < 8) return z < -13 ? 'vip_north' : 'vip_in';
      if (x < 17) return 'ceo_in';
      if (x < 25.5) return 'vp_in';
      return 'sport_in';
    }
    if (z > 2.4 && z < 10.6) {
      if (x < -20) return 'coach_in';
      if (x < -6) return 'scout_in';
      if (x <= 6) return 'lobby_n';
      if (x < 20) return 'fin_in';
      return 'media_in';
    }
    if (z >= 13.8) {
      if (x < -20) return 'trans_in';
      if (x < -6) return 'acad_in';
      if (x <= 6) return 'lobby_s';
      if (x < 20) return 'medic_in';
      return 'hr_in';
    }
    let best = 'c_0', bestDSq = 1e18;
    const keys = this._nonDoorNodeKeys;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const pt = this.nodes[k];
      const dx = pt.x - x;
      const dz = pt.z - z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDSq) { bestDSq = dSq; best = k; }
    }
    return best;
  }

  _heapPush(key, f) {
    let idx = this._heapSize;
    if (idx >= this._heapKeys.length) {
      const nextCap = this._heapKeys.length * 2;
      const nk = new Int32Array(nextCap);
      const nf = new Float32Array(nextCap);
      nk.set(this._heapKeys);
      nf.set(this._heapF);
      this._heapKeys = nk;
      this._heapF = nf;
    }
    const keys = this._heapKeys;
    const fs = this._heapF;
    keys[idx] = key;
    fs[idx] = f;
    this._heapSize = idx + 1;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (fs[parent] <= f) break;
      keys[idx] = keys[parent];
      fs[idx] = fs[parent];
      idx = parent;
    }
    keys[idx] = key;
    fs[idx] = f;
  }

  _heapPop() {
    const keys = this._heapKeys;
    const fs = this._heapF;
    const topKey = keys[0];
    const lastIdx = --this._heapSize;
    if (lastIdx > 0) {
      const lastKey = keys[lastIdx];
      const lastF = fs[lastIdx];
      let idx = 0;
      const half = lastIdx >> 1;
      while (idx < half) {
        let child = (idx << 1) + 1;
        const right = child + 1;
        if (right < lastIdx && fs[right] < fs[child]) child = right;
        if (lastF <= fs[child]) break;
        keys[idx] = keys[child];
        fs[idx] = fs[child];
        idx = child;
      }
      keys[idx] = lastKey;
      fs[idx] = lastF;
    }
    return topKey;
  }

  // A* cục bộ trên NavGrid 2D dùng mảng typed phẳng (Zero-GC) + Binary Min-Heap để đi vòng quanh bàn, ghế, tủ, sofa
  findLocalGridPath(startX, startZ, endX, endZ, maxExpansions = 260) {
    if (!this.staticGrid) return [{ x: endX, z: endZ }];
    if (this.hasLineOfSight(startX, startZ, endX, endZ, 0.32, false)) {
      return [{ x: endX, z: endZ }];
    }
    // Ngoài vùng nướng lưới tĩnh (ví dụ mặt cỏ mở SVĐ Parc des Princes z < -62) -> đi thẳng tới đích
    if (startZ < this.minZ - 0.5 && endZ < this.minZ - 0.5) {
      return [{ x: endX, z: endZ }];
    }

    const cols = this.cols;
    const rows = this.rows;
    const sc = Math.max(0, Math.min(cols - 1, Math.floor((startX - this.minX) / this.gridStep)));
    const sr = Math.max(0, Math.min(rows - 1, Math.floor((startZ - this.minZ) / this.gridStep)));
    const gc = Math.max(0, Math.min(cols - 1, Math.floor((endX - this.minX) / this.gridStep)));
    const gr = Math.max(0, Math.min(rows - 1, Math.floor((endZ - this.minZ) / this.gridStep)));
    const sKey = sr * cols + sc;
    const gKey = gr * cols + gc;
    if (sKey === gKey) return [{ x: endX, z: endZ }];

    // Generation stamp O(1) reset không cấp phát lại bộ nhớ
    if (++this._aStarGen >= 0x7fffffff) {
      this._aStarOpenStamp.fill(0);
      this._aStarClosedStamp.fill(0);
      this._aStarGen = 1;
    }
    const gen = this._aStarGen;
    const gArr = this._aStarG;
    const cameFrom = this._aStarCameFrom;
    const openStamp = this._aStarOpenStamp;
    const closedStamp = this._aStarClosedStamp;
    const grid = this.staticGrid;

    this._heapSize = 0;
    const startH = Math.hypot(gc - sc, gr - sr);
    gArr[sKey] = 0;
    cameFrom[sKey] = -1;
    openStamp[sKey] = gen;
    this._heapPush(sKey, startH);

    let expansions = 0;
    let bestClosestKey = sKey;
    let bestClosestH = startH;

    while (this._heapSize > 0 && expansions < maxExpansions) {
      const curKey = this._heapPop();
      if (closedStamp[curKey] === gen) continue;
      expansions++;
      if (curKey === gKey) {
        bestClosestKey = gKey;
        break;
      }
      closedStamp[curKey] = gen;

      const cr = (curKey / cols) | 0;
      const cc = curKey - cr * cols;
      const curH = Math.hypot(gc - cc, gr - cr);
      if (curH < bestClosestH) {
        bestClosestH = curH;
        bestClosestKey = curKey;
      }

      const curG = gArr[curKey];
      for (let d = 0; d < 8; d++) {
        const dir = GRID_DIRS[d];
        const dc = dir[0];
        const dr = dir[1];
        const nc = cc + dc;
        const nr = cr + dr;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        const nKey = nr * cols + nc;
        if (closedStamp[nKey] === gen) continue;
        if (nKey !== gKey && grid[nKey] === 1) continue;
        // Chống cắt góc xuyên vật cản khi đi chéo
        if (dc !== 0 && dr !== 0) {
          if (grid[cr * cols + nc] === 1 || grid[nr * cols + cc] === 1) continue;
        }
        const tentG = curG + dir[2];
        if (openStamp[nKey] !== gen || tentG < gArr[nKey]) {
          cameFrom[nKey] = curKey;
          gArr[nKey] = tentG;
          openStamp[nKey] = gen;
          this._heapPush(nKey, tentG + Math.hypot(gc - nc, gr - nr));
        }
      }
    }

    const rawPts = [];
    let trace = bestClosestKey;
    while (trace >= 0 && trace !== sKey) {
      const r = (trace / cols) | 0;
      const c = trace - r * cols;
      rawPts.push({
        x: this.minX + (c + 0.5) * this.gridStep,
        z: this.minZ + (r + 0.5) * this.gridStep
      });
      trace = cameFrom[trace];
    }
    rawPts.reverse();
    rawPts.push({ x: endX, z: endZ });
    return this.smoothPath(startX, startZ, rawPts);
  }

  // Làm mượt lộ trình (String Pulling) loại bỏ điểm thừa nhưng tuyệt đối không cắt vào vật cản
  smoothPath(startX, startZ, waypoints) {
    if (!waypoints || waypoints.length <= 1) return waypoints || [];
    const out = [];
    let anchorX = startX, anchorZ = startZ;
    let i = 0;
    while (i < waypoints.length) {
      let furthest = i;
      for (let j = waypoints.length - 1; j > i; j--) {
        if (this.hasLineOfSight(anchorX, anchorZ, waypoints[j].x, waypoints[j].z, 0.34, false)) {
          furthest = j;
          break;
        }
      }
      out.push(waypoints[furthest]);
      anchorX = waypoints[furthest].x;
      anchorZ = waypoints[furthest].z;
      i = furthest + 1;
    }
    return out;
  }

  // Thuật toán A* tổng thể (NavGraph qua các phòng/cửa + NavGrid tránh đồ nội thất)
  findPath(startX, startZ, endX, endZ, options = {}) {
    let blockedNodes = null;
    if (options.forbidHqInterior && !options.blockedNodes) {
      blockedNodes = this._hqInteriorNodeKeys;
    } else if (options.forbidHqInterior && options.blockedNodes) {
      blockedNodes = new Set(options.blockedNodes);
      for (const k of this._hqInteriorNodeKeys) blockedNodes.add(k);
    } else if (options.blockedNodes) {
      blockedNodes = options.blockedNodes instanceof Set ? options.blockedNodes : new Set(options.blockedNodes);
    }
    const startKey = this.nearestNode(startX, startZ);
    const endKey = this.nearestNode(endX, endZ);

    // Nếu đích nằm trong vật cản, đẩy nhẹ ra điểm hợp lệ gần nhất
    let safeEndX = endX, safeEndZ = endZ;
    if (this.campus && this.isPointBlocked(safeEndX, safeEndZ, 0.32, false)) {
      const resolved = this.campus.resolveCollision(safeEndX, safeEndZ, 0.42);
      safeEndX = resolved.x;
      safeEndZ = resolved.z;
    }

    // Nếu cùng 1 phòng / khu vực → dùng A* cục bộ tránh bàn ghế/tủ (bỏ qua nếu skipLocalGrid cho LOD 2 xa)
    if (startKey === endKey) {
      if (options.skipLocalGrid) return [{ x: safeEndX, z: safeEndZ }];
      return this.findLocalGridPath(startX, startZ, safeEndX, safeEndZ);
    }

    const nodes = this.nodes;
    const h = (a, b) => Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
    const open = new Set([startKey]);
    const cameFrom = {};
    const gScore = { [startKey]: 0 };
    const fScore = { [startKey]: h(startKey, endKey) };

    while (open.size > 0) {
      let current = null, bestF = Infinity;
      for (const k of open) {
        const f = fScore[k] ?? Infinity;
        if (f < bestF) { bestF = f; current = k; }
      }
      if (current === endKey) {
        const graphPath = [];
        let cur = current;
        while (cur) {
          const nd = nodes[cur];
          graphPath.push({ x: nd.x, z: nd.z, doorId: nd.doorId || null });
          cur = cameFrom[cur];
        }
        graphPath.reverse();

        if (options.skipLocalGrid) {
          graphPath.push({ x: safeEndX, z: safeEndZ });
          return graphPath;
        }

        // Chèn A* cục bộ từ vị trí hiện tại → nút đầu, và từ nút cuối → đích cuối (tránh bàn ghế trong phòng!)
        const full = [];
        const legStart = this.findLocalGridPath(startX, startZ, graphPath[0].x, graphPath[0].z, 120);
        for (let i = 0; i < legStart.length; i++) full.push(legStart[i]);
        for (let i = 1; i < graphPath.length; i++) full.push(graphPath[i]);
        const lastNode = graphPath[graphPath.length - 1];
        const legEnd = this.findLocalGridPath(lastNode.x, lastNode.z, safeEndX, safeEndZ, 120);
        for (let i = 0; i < legEnd.length; i++) full.push(legEnd[i]);
        return full;
      }
      open.delete(current);
      const nbs = this.edges[current];
      if (!nbs) continue;
      const curG = gScore[current] ?? Infinity;
      for (let i = 0; i < nbs.length; i++) {
        const nb = nbs[i];
        if (this.isNodeBlocked(nb, blockedNodes)) continue;
        const tentativeG = curG + h(current, nb);
        if (tentativeG < (gScore[nb] ?? Infinity)) {
          cameFrom[nb] = current;
          gScore[nb] = tentativeG;
          fScore[nb] = tentativeG + h(nb, endKey);
          open.add(nb);
        }
      }
    }

    // Nếu không có đường qua NavGraph (ví dụ cửa bị khóa), thử tìm đường vòng bằng NavGrid 2D
    if (options.skipLocalGrid) return [{ x: safeEndX, z: safeEndZ }];
    return this.findLocalGridPath(startX, startZ, safeEndX, safeEndZ, 380);
  }

  // Xây dựng Spatial Hash động cho tất cả NPC hiển thị 1 lần/frame (ô 3m x 3m, Zero-GC tái sử dụng bucket)
  rebuildNpcSpatialGrid(allNpcs) {
    const active = this._activeNpcBuckets;
    for (let i = 0; i < active.length; i++) {
      active[i].length = 0;
    }
    active.length = 0;

    if (!allNpcs || allNpcs.length === 0) {
      this._npcGridBuilt = false;
      return;
    }

    const invCell = 1 / this._npcCellSize;
    const buckets = this._npcGridBuckets;
    for (let i = 0; i < allNpcs.length; i++) {
      const n = allNpcs[i];
      if (!n || !n.mesh || !n.mesh.visible) continue;
      const cx = Math.floor(n.mesh.position.x * invCell) + 512;
      const cz = Math.floor(n.mesh.position.z * invCell) + 512;
      const key = (cx << 10) | (cz & 1023);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = [];
        buckets.set(key, bucket);
      }
      if (bucket.length === 0) active.push(bucket);
      bucket.push(n);
    }
    this._npcGridBuilt = true;
  }

  // Steering + Local Avoidance: Raycast 5 tia tránh đồ nội thất + Spatial Hash né NPC khác O(1) + né người chơi + nhường lối hẹp
  // Tương thích ngược 100%: khi không truyền options.out, trả về object mới { vx, vz, waiting } (đảm bảo AI-3 pass tuyệt đối!)
  computeAvoidanceVelocity(npc, desiredDirX, desiredDirZ, baseSpeed, allNpcs, playerPos, options = null) {
    const posX = npc.mesh.position.x;
    const posZ = npc.mesh.position.z;
    let steerX = desiredDirX;
    let steerZ = desiredDirZ;
    let speedMult = 1.0;
    let shouldWait = false;
    const skipWhiskers = !!(options && options.skipWhiskers);

    // 1. Raycast 5 tia (whiskers) phát hiện vật cản tĩnh & cửa đóng trước mặt (bỏ qua ở LOD 1 khi không bị kẹt)
    if (this.campus && !skipWhiskers) {
      const forwardBlocked = this.isPointBlocked(posX + desiredDirX * 0.72, posZ + desiredDirZ * 0.72, 0.32, true);
      if (forwardBlocked) {
        speedMult *= 0.65;
        const baseAngle = Math.atan2(desiredDirX, desiredDirZ);
        const probeDist = 1.15;
        let foundSide = false;
        for (let i = 0; i < WHISKER_ANGLES.length; i++) {
          const ang = baseAngle + WHISKER_ANGLES[i];
          const tx = Math.sin(ang);
          const tz = Math.cos(ang);
          if (!this.isPointBlocked(posX + tx * probeDist, posZ + tz * probeDist, 0.34, true)) {
            steerX += tx * 1.45;
            steerZ += tz * 1.45;
            foundSide = true;
            break;
          }
        }
        if (!foundSide) {
          speedMult *= 0.35;
        }
      }
    }

    // 2. Né người chơi (Chủ tịch Phạm Minh Chiêu)
    if (playerPos) {
      const pdx = posX - playerPos.x;
      const pdz = posZ - playerPos.z;
      const pDistSq = pdx * pdx + pdz * pdz;
      const safePlayerRadius = 1.15;
      if (pDistSq > 0.0001 && pDistSq < safePlayerRadius * safePlayerRadius) {
        const pDist = Math.sqrt(pDistSq);
        const push = (safePlayerRadius - pDist) / safePlayerRadius;
        const rx = pdx / pDist;
        const rz = pdz / pDist;
        steerX += (rx * 1.35 + rz * 0.65) * push * 1.8;
        steerZ += (rz * 1.35 - rx * 0.65) * push * 1.8;
        speedMult *= Math.max(0.42, 1 - push * 0.55);
      }
    }

    // 3. Né các NPC khác (Spatial Hash 3x3 ô 3m -> O(1) thay vì O(N²); Zero-GC không tạo closure)
    const personalRadius = 0.92;
    const maxAvoidRadius = personalRadius * 1.55;
    const maxAvoidSq = maxAvoidRadius * maxAvoidRadius;
    const invMaxAvoid = 1 / maxAvoidRadius;
    const npcIdStr = npc.id || '';
    const useSpatialGrid = !!(options && options.useSpatialGrid && this._npcGridBuilt);

    if (useSpatialGrid) {
      const invCell = 1 / this._npcCellSize;
      const baseCx = Math.floor(posX * invCell) + 512;
      const baseCz = Math.floor(posZ * invCell) + 512;
      const buckets = this._npcGridBuckets;
      for (let dx = -1; dx <= 1; dx++) {
        const cxShift = (baseCx + dx) << 10;
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = buckets.get(cxShift | ((baseCz + dz) & 1023));
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i++) {
            const other = bucket[i];
            if (other === npc || !other.mesh || !other.mesh.visible) continue;
            const odx = posX - other.mesh.position.x;
            const odz = posZ - other.mesh.position.z;
            const distSq = odx * odx + odz * odz;
            if (distSq >= maxAvoidSq || distSq < 0.0001) continue;
            const dist = Math.sqrt(distSq);
            const nx = odx / dist;
            const nz = odz / dist;
            const weight = (maxAvoidRadius - dist) * invMaxAvoid;
            const dotDir = desiredDirX * (other._velX || 0) + desiredDirZ * (other._velZ || 0);
            if (dotDir < -0.15) {
              const rightX = -desiredDirZ;
              const rightZ = desiredDirX;
              steerX += (nx * 0.8 + rightX * 1.25) * weight * 1.65;
              steerZ += (nz * 0.8 + rightZ * 1.25) * weight * 1.65;
              speedMult *= Math.max(0.5, 1 - weight * 0.4);
              if (dist < 0.85 && this.campus && !skipWhiskers) {
                const rightBlocked = this.isPointBlocked(posX + rightX * 0.75, posZ + rightZ * 0.75, 0.32, true);
                const leftBlocked = this.isPointBlocked(posX - rightX * 0.75, posZ - rightZ * 0.75, 0.32, true);
                if (rightBlocked && leftBlocked && npcIdStr > (other.id || '')) {
                  shouldWait = true;
                }
              }
            } else {
              steerX += nx * weight * 1.4;
              steerZ += nz * weight * 1.4;
              if (dist < 0.75) speedMult *= 0.65;
            }
          }
        }
      }
    } else if (allNpcs) {
      for (let i = 0; i < allNpcs.length; i++) {
        const other = allNpcs[i];
        if (other === npc || !other.mesh || !other.mesh.visible) continue;
        const odx = posX - other.mesh.position.x;
        const odz = posZ - other.mesh.position.z;
        const distSq = odx * odx + odz * odz;
        if (distSq >= maxAvoidSq || distSq < 0.0001) continue;
        const dist = Math.sqrt(distSq);
        const nx = odx / dist;
        const nz = odz / dist;
        const weight = (maxAvoidRadius - dist) * invMaxAvoid;
        const dotDir = desiredDirX * (other._velX || 0) + desiredDirZ * (other._velZ || 0);
        if (dotDir < -0.15) {
          const rightX = -desiredDirZ;
          const rightZ = desiredDirX;
          steerX += (nx * 0.8 + rightX * 1.25) * weight * 1.65;
          steerZ += (nz * 0.8 + rightZ * 1.25) * weight * 1.65;
          speedMult *= Math.max(0.5, 1 - weight * 0.4);
          if (dist < 0.85 && this.campus && !skipWhiskers) {
            const rightBlocked = this.isPointBlocked(posX + rightX * 0.75, posZ + rightZ * 0.75, 0.32, true);
            const leftBlocked = this.isPointBlocked(posX - rightX * 0.75, posZ - rightZ * 0.75, 0.32, true);
            if (rightBlocked && leftBlocked && npcIdStr > (other.id || '')) {
              shouldWait = true;
            }
          }
        } else {
          steerX += nx * weight * 1.4;
          steerZ += nz * weight * 1.4;
          if (dist < 0.75) speedMult *= 0.65;
        }
      }
    }

    const out = (options && options.out) ? options.out : { vx: 0, vz: 0, waiting: false };
    if (shouldWait) {
      out.vx = 0;
      out.vz = 0;
      out.waiting = true;
      return out;
    }

    const mag = Math.hypot(steerX, steerZ);
    if (mag < 0.001) {
      out.vx = 0;
      out.vz = 0;
      out.waiting = false;
      return out;
    }
    const finalSpeed = baseSpeed * Math.max(0.32, Math.min(1.15, speedMult));
    out.vx = (steerX / mag) * finalSpeed;
    out.vz = (steerZ / mag) * finalSpeed;
    out.waiting = false;
    return out;
  }

  // Trả về tọa độ phòng đích tương ứng với loại nhiệm vụ Chủ tịch giao
  static getTaskTargetRoom(resultKey) {
    const map = {
      scout_strikers: { x: -13.0, z: 6.0, label: 'Phòng Tuyển Trạch' },
      scout_midfielders: { x: -13.0, z: 6.0, label: 'Phòng Tuyển Trạch' },
      scout_cb: { x: -13.0, z: 6.0, label: 'Phòng Tuyển Trạch' },
      scout_u21: { x: -27.0, z: 16.5, label: 'Phòng Chuyển Nhượng' },
      rev_growth: { x: 27.0, z: 6.0, label: 'Phòng Marketing' },
      mkt_sponsor: { x: 13.0, z: 6.0, label: 'Phòng Tài Chính' },
      cost_audit: { x: 12.5, z: -7.5, label: 'Phòng Tổng Giám Đốc' },
      match_prep: { x: -27.0, z: 6.0, label: 'Phòng Ban Huấn Luyện' },
      def_drill: { x: 0.0, z: -136.0, label: 'SVĐ Parc des Princes (Khu Tập Luyện)' },
      youth_chance: { x: -13.0, z: 16.5, label: 'Phòng Học Viện' },
      acad_eval: { x: -27.0, z: 6.0, label: 'Phòng HLV Trưởng' },
      med_check: { x: -35.0, z: -41.0, label: 'Phòng Thay Đồ Cầu Thủ' },
      cap_rally: { x: -35.0, z: -41.0, label: 'Phòng Thay Đồ Cầu Thủ' },
      player_morale: { x: -35.0, z: -41.0, label: 'Phòng Thay Đồ Cầu Thủ' },
      dept_audit: { x: 0.0, z: 6.5, label: 'Sảnh & Các Phòng Ban' },
      season_plan: { x: -10.0, z: -8.0, label: 'Phòng Họp Ban Giám Đốc' },
      media_pr: { x: -27.0, z: 6.0, label: 'Phòng HLV Trưởng' },
      legal_review: { x: 13.0, z: 6.0, label: 'Phòng Tài Chính & Pháp Chế' },
      fac_maint: { x: 0.0, z: -136.0, label: 'SVĐ Parc des Princes' }
    };
    return map[resultKey] || { x: -10.0, z: -8.0, label: 'Phòng Họp Ban Giám Đốc' };
  }
}
