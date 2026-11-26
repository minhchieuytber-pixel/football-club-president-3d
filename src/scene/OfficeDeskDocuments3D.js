// src/scene/OfficeDeskDocuments3D.js
// 6 Chồng Văn Bản Giấy Chuyên Biệt + 1 Khay Đỏ URGENT / PRESIDENTIAL PRIORITY đặt trực tiếp trên Bàn Chủ Tịch 3D
import THREE from '../core/threeSetup.js';
import { DOC_STACK_META, URGENT_TRAY_META } from '../executive/DocumentTypes.js';

export class OfficeDeskDocuments3D {
  constructor(campusScene) {
    this.campus = campusScene;
    this.group = new THREE.Group();
    this.group.name = 'PresidentialDeskDocuments3D';
    // Đặt trùng hệ quy chiếu tâm & góc xoay của bàn Chủ tịch (-26.0, 0.14, -16.8), rotation.y = Math.PI
    this.group.position.set(-26.0, 0.14, -16.8);
    this.group.rotation.y = Math.PI;
    this.group.userData.dynamicObject = true;

    this.stackNodes = new Map();
    this.urgentNode = null;
    this._lastSig = '';
    this._animElapsed = 0;
    this._hoveredInteractId = null;

    // Tài nguyên dùng chung (Zero-allocation update loop)
    this._sharedGeos = {
      trayBase: new THREE.BoxGeometry(0.24, 0.014, 0.30),
      paperBlock: new THREE.BoxGeometry(0.21, 1.0, 0.27), // scaleY theo số lượng hồ sơ
      topCover: new THREE.BoxGeometry(0.216, 0.008, 0.276),
      plaque: new THREE.PlaneGeometry(0.20, 0.12),
      stackHitProxy: new THREE.BoxGeometry(0.24, 0.09, 0.30),
      urgentBase: new THREE.BoxGeometry(0.28, 0.018, 0.34),
      urgentSideX: new THREE.BoxGeometry(0.28, 0.036, 0.014),
      urgentSideZ: new THREE.BoxGeometry(0.014, 0.036, 0.34),
      urgentTrim: new THREE.BoxGeometry(0.284, 0.006, 0.016),
      urgentBadgeFront: new THREE.PlaneGeometry(0.24, 0.055),
      urgentTopPlaque: new THREE.PlaneGeometry(0.23, 0.14),
      urgentHitProxy: new THREE.BoxGeometry(0.28, 0.10, 0.34)
    };

    this._sharedMats = {
      leatherBase: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.2 }),
      paperCream: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.85, metalness: 0.02 }),
      goldTrim: new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.28, metalness: 0.82 }),
      hitProxy: new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false
      }),
      urgentTray: new THREE.MeshStandardMaterial({
        color: 0x991b1b,
        roughness: 0.32,
        metalness: 0.18,
        emissive: 0x7f1d1d,
        emissiveIntensity: 0.08
      })
    };

    this._buildAll();
  }

  _createLabelCanvas(w = 256, h = 154) {
    if (typeof document === 'undefined' || typeof THREE.CanvasTexture !== 'function') {
      return { canvas: null, ctx: null, tex: null };
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = false;
    if (typeof THREE.LinearFilter !== 'undefined') tex.minFilter = THREE.LinearFilter;
    return { canvas, ctx, tex };
  }

  _drawStackPlaque(node, pendingCount) {
    const { ctx, tex, meta } = node;
    if (!ctx || !tex) return;
    const w = 256;
    const h = 154;

    // Nền bìa hồ sơ
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, w, h);

    // Dải màu nhận diện trên đầu bìa
    ctx.fillStyle = meta.colorHex;
    ctx.fillRect(0, 0, w, 46);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${meta.shortCode} · ${meta.label.toUpperCase()}`, 12, 30);

    // Đường kẻ tài liệu giả lập dòng chữ in
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(14, 62, 160, 7);
    ctx.fillRect(14, 76, 132, 7);
    ctx.fillRect(14, 90, 146, 7);

    // Badge số lượng hồ sơ chờ xử lý
    ctx.fillStyle = pendingCount > 0 ? meta.colorHex : '#64748b';
    ctx.fillRect(14, 108, 228, 34);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 19px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pendingCount > 0 ? `CHỜ DUYỆT: ${pendingCount} HỒ SƠ` : 'ĐÃ XỬ LÝ HẾT (0)', w / 2, 131);

    tex.needsUpdate = true;
  }

  _drawUrgentPlaque(urgentCount, hasPulse) {
    if (!this.urgentNode) return;
    const { topCtx, topTex, frontCtx, frontTex } = this.urgentNode;

    if (topCtx && topTex) {
      const w = 256;
      const h = 154;
      topCtx.fillStyle = urgentCount > 0 ? '#fffbeb' : '#1e293b';
      topCtx.fillRect(0, 0, w, h);

      topCtx.fillStyle = '#b91c1c';
      topCtx.fillRect(0, 0, w, 44);
      topCtx.fillStyle = '#fef08a';
      topCtx.font = 'bold 17px sans-serif';
      topCtx.textAlign = 'center';
      topCtx.fillText('PRESIDENTIAL PRIORITY', w / 2, 28);

      topCtx.fillStyle = urgentCount > 0 ? '#991b1b' : '#94a3b8';
      topCtx.font = 'bold 34px sans-serif';
      topCtx.fillText(urgentCount > 0 ? `URGENT: ${String(urgentCount).padStart(2, '0')}` : 'EMPTY', w / 2, 102);

      topCtx.fillStyle = urgentCount > 0 ? '#7f1d1d' : '#64748b';
      topCtx.font = 'bold 14px sans-serif';
      topCtx.fillText(urgentCount > 0 ? (hasPulse ? '● HỒ SƠ KHẨN MỚI' : 'CẦN CHỦ TỊCH XỬ LÝ') : 'KHAY KHẨN ĐANG TRỐNG', w / 2, 134);
      topTex.needsUpdate = true;
    }

    if (frontCtx && frontTex) {
      const w = 256;
      const h = 64;
      frontCtx.fillStyle = '#7f1d1d';
      frontCtx.fillRect(0, 0, w, h);
      frontCtx.strokeStyle = '#d4af37';
      frontCtx.lineWidth = 4;
      frontCtx.strokeRect(2, 2, w - 4, h - 4);
      frontCtx.fillStyle = urgentCount > 0 ? '#fef08a' : '#cbd5e1';
      frontCtx.font = 'bold 24px sans-serif';
      frontCtx.textAlign = 'center';
      frontCtx.fillText(urgentCount > 0 ? `URGENT: ${String(urgentCount).padStart(2, '0')}` : 'URGENT: EMPTY', w / 2, 41);
      frontTex.needsUpdate = true;
    }
  }

  _buildAll() {
    const BasicMatCtor = typeof THREE.MeshBasicMaterial === 'function' ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;

    // 1. Tạo 6 chồng hồ sơ văn bản giấy chuyên biệt
    for (const meta of DOC_STACK_META) {
      const stackGroup = new THREE.Group();
      stackGroup.position.set(meta.deskOffset.x, 0.80, meta.deskOffset.z);
      stackGroup.rotation.y = meta.deskOffset.rotY || 0;
      stackGroup.userData.dynamicObject = true;

      const base = new THREE.Mesh(this._sharedGeos.trayBase, this._sharedMats.leatherBase);
      base.position.y = 0.007;

      const paperBlock = new THREE.Mesh(this._sharedGeos.paperBlock, this._sharedMats.paperCream);
      paperBlock.position.y = 0.014 + 0.012;
      paperBlock.scale.y = 0.024;

      const coverGroup = new THREE.Group();
      coverGroup.position.y = 0.014 + 0.024;
      const coverMat = new THREE.MeshStandardMaterial({
        color: meta.colorInt,
        emissive: meta.colorInt,
        emissiveIntensity: 0.04,
        roughness: 0.42,
        metalness: 0.12
      });
      const coverMesh = new THREE.Mesh(this._sharedGeos.topCover, coverMat);
      coverMesh.position.y = 0.004;

      const { ctx, tex } = this._createLabelCanvas(256, 154);
      const plaqueMat = new BasicMatCtor(tex ? { map: tex } : { color: meta.colorInt });
      const plaque = new THREE.Mesh(this._sharedGeos.plaque, plaqueMat);
      plaque.rotation.x = -Math.PI / 2;
      plaque.rotation.z = Math.PI; // Hướng chữ đọc thuận mắt Chủ tịch ngồi sau bàn
      plaque.position.y = 0.009;
      coverGroup.add(coverMesh, plaque);

      const hitProxy = new THREE.Mesh(this._sharedGeos.stackHitProxy, this._sharedMats.hitProxy);
      hitProxy.position.y = 0.046;
      hitProxy.userData.dynamicObject = true;

      stackGroup.add(base, paperBlock, coverGroup, hitProxy);
      this.group.add(stackGroup);

      // Đăng ký hit-proxy rộng hơn vùng giấy mỏng để dễ trỏ từ góc nhìn đứng hoặc ngồi
      this.campus?.tagInteractable?.(
        hitProxy,
        meta.interactId,
        `${meta.label} (0 chờ duyệt)`,
        meta.icon,
        'open_doc_stack',
        { category: meta.category }
      );

      const node = {
        meta,
        group: stackGroup,
        paperBlock,
        coverGroup,
        coverMat,
        hitProxy,
        ctx,
        tex,
        count: 0,
        liftAnim: 0,
        hoverLerp: 0
      };
      this._drawStackPlaque(node, 0);
      this.stackNodes.set(meta.category, node);
    }

    // 2. Tạo 1 Khay Đỏ URGENT / PRESIDENTIAL PRIORITY nổi bật trên bàn Chủ tịch
    const uMeta = URGENT_TRAY_META;
    const uGroup = new THREE.Group();
    uGroup.position.set(uMeta.deskOffset.x, 0.80, uMeta.deskOffset.z);
    uGroup.rotation.y = uMeta.deskOffset.rotY || 0;
    uGroup.userData.dynamicObject = true;

    const uBase = new THREE.Mesh(this._sharedGeos.urgentBase, this._sharedMats.urgentTray);
    uBase.position.y = 0.009;

    const sideBack = new THREE.Mesh(this._sharedGeos.urgentSideX, this._sharedMats.urgentTray);
    sideBack.position.set(0, 0.018, 0.163);
    const sideLeft = new THREE.Mesh(this._sharedGeos.urgentSideZ, this._sharedMats.urgentTray);
    sideLeft.position.set(-0.133, 0.018, 0);
    const sideRight = new THREE.Mesh(this._sharedGeos.urgentSideZ, this._sharedMats.urgentTray);
    sideRight.position.set(0.133, 0.018, 0);
    const frontTrim = new THREE.Mesh(this._sharedGeos.urgentTrim, this._sharedMats.goldTrim);
    frontTrim.position.set(0, 0.022, -0.165);

    const { ctx: frontCtx, tex: frontTex } = this._createLabelCanvas(256, 64);
    const frontPlaque = new THREE.Mesh(
      this._sharedGeos.urgentBadgeFront,
      new BasicMatCtor(frontTex ? { map: frontTex } : { color: 0xb91c1c })
    );
    // Mặt hướng về ghế Chủ tịch (rotation.y = Math.PI trên group -> local -Z hướng về ghế Chủ tịch)
    frontPlaque.position.set(0, 0.022, -0.174);
    frontPlaque.rotation.y = Math.PI;

    const uPaperBlock = new THREE.Mesh(this._sharedGeos.paperBlock, this._sharedMats.paperCream);
    uPaperBlock.position.y = 0.018 + 0.01;
    uPaperBlock.scale.y = 0.018;

    const uCoverGroup = new THREE.Group();
    uCoverGroup.position.y = 0.018 + 0.018;
    const uCover = new THREE.Mesh(this._sharedGeos.topCover, this._sharedMats.urgentTray);
    uCover.position.y = 0.004;

    const { ctx: topCtx, tex: topTex } = this._createLabelCanvas(256, 154);
    const topPlaque = new THREE.Mesh(
      this._sharedGeos.urgentTopPlaque,
      new BasicMatCtor(topTex ? { map: topTex } : { color: 0x991b1b })
    );
    topPlaque.rotation.x = -Math.PI / 2;
    topPlaque.rotation.z = Math.PI;
    topPlaque.position.y = 0.009;
    uCoverGroup.add(uCover, topPlaque);

    const uHitProxy = new THREE.Mesh(this._sharedGeos.urgentHitProxy, this._sharedMats.hitProxy);
    uHitProxy.position.y = 0.05;
    uHitProxy.userData.dynamicObject = true;

    uGroup.add(uBase, sideBack, sideLeft, sideRight, frontTrim, frontPlaque, uPaperBlock, uCoverGroup, uHitProxy);
    this.group.add(uGroup);

    this.campus?.tagInteractable?.(
      uHitProxy,
      uMeta.interactId,
      'KHAY KHẨN CẤP (URGENT: 00)',
      uMeta.icon,
      'open_urgent_tray',
      {}
    );

    this.urgentNode = {
      group: uGroup,
      paperBlock: uPaperBlock,
      coverGroup: uCoverGroup,
      hitProxy: uHitProxy,
      topCtx,
      topTex,
      frontCtx,
      frontTex,
      count: 0,
      hasPulse: false,
      liftAnim: 0,
      hoverLerp: 0
    };
    this._drawUrgentPlaque(0, false);
  }

  setHoveredInteractId(interactId) {
    this._hoveredInteractId = interactId || null;
  }

  triggerStackAnimation(interactId) {
    if (interactId === URGENT_TRAY_META.interactId && this.urgentNode) {
      this.urgentNode.liftAnim = 1.0;
      return;
    }
    for (const node of this.stackNodes.values()) {
      if (node.meta.interactId === interactId) {
        node.liftAnim = 1.0;
        return;
      }
    }
  }

  syncFromDocumentSystem(docSys) {
    if (!docSys) return;
    const counts = docSys.getStackCounts();
    const urgentCount = docSys.getUrgentCount();
    const hasPulse = docSys.hasNewUrgentPulse();
    const sig = `${DOC_STACK_META.map((m) => counts[m.category] || 0).join(',')}|u:${urgentCount}|p:${hasPulse ? 1 : 0}`;
    if (sig === this._lastSig) return;
    this._lastSig = sig;

    for (const meta of DOC_STACK_META) {
      const node = this.stackNodes.get(meta.category);
      if (!node) continue;
      const cnt = counts[meta.category] || 0;
      node.count = cnt;
      const h = cnt === 0 ? 0.006 : Math.min(0.082, 0.014 + cnt * 0.0085);
      node.paperBlock.visible = cnt > 0;
      node.paperBlock.scale.y = h;
      node.paperBlock.position.y = 0.014 + h * 0.5;
      node.coverGroup.position.y = 0.014 + (cnt > 0 ? h : 0.002);
      this._drawStackPlaque(node, cnt);

      const interactMeta = this.campus?.interactables?.get(meta.interactId);
      if (interactMeta) {
        interactMeta.label = `${meta.label} (${cnt} chờ duyệt)`;
      }
    }

    if (this.urgentNode) {
      this.urgentNode.count = urgentCount;
      this.urgentNode.hasPulse = hasPulse;
      const uh = urgentCount === 0 ? 0.005 : Math.min(0.088, 0.016 + urgentCount * 0.009);
      this.urgentNode.paperBlock.visible = urgentCount > 0;
      this.urgentNode.paperBlock.scale.y = uh;
      this.urgentNode.paperBlock.position.y = 0.018 + uh * 0.5;
      this.urgentNode.coverGroup.position.y = 0.018 + (urgentCount > 0 ? uh : 0.002);
      this._drawUrgentPlaque(urgentCount, hasPulse);

      const uMeta = this.campus?.interactables?.get(URGENT_TRAY_META.interactId);
      if (uMeta) {
        uMeta.label = urgentCount > 0
          ? `KHAY KHẨN CẤP · URGENT: ${String(urgentCount).padStart(2, '0')}`
          : 'KHAY KHẨN CẤP · EMPTY';
      }
    }
  }

  update(dt) {
    const hoverStep = Math.min(1, dt * 10);
    // Hoạt ảnh nhẹ khi trỏ chuột/tâm ngắm, khi nhấc hồ sơ & hiệu ứng báo khay đỏ URGENT
    if (this.urgentNode) {
      const isHovered = this._hoveredInteractId === URGENT_TRAY_META.interactId;
      this.urgentNode.hoverLerp += ((isHovered ? 1 : 0) - this.urgentNode.hoverLerp) * hoverStep;

      if (isHovered) {
        this._sharedMats.urgentTray.emissiveIntensity = 0.28;
      } else if (this.urgentNode.hasPulse && this.urgentNode.count > 0) {
        this._animElapsed += dt;
        const pulse = 0.14 + Math.sin(this._animElapsed * 4.2) * 0.12;
        this._sharedMats.urgentTray.emissiveIntensity = Math.max(0.05, pulse);
      } else if (this._sharedMats.urgentTray.emissiveIntensity !== 0.08) {
        this._sharedMats.urgentTray.emissiveIntensity = 0.08;
      }

      const baseY = 0.018 + (this.urgentNode.count > 0 ? this.urgentNode.paperBlock.scale.y : 0.002);
      let liftOffset = this.urgentNode.hoverLerp * 0.014;
      let liftRot = -this.urgentNode.hoverLerp * 0.04;
      if (this.urgentNode.liftAnim > 0) {
        this.urgentNode.liftAnim = Math.max(0, this.urgentNode.liftAnim - dt * 2.4);
        const s = Math.sin(this.urgentNode.liftAnim * Math.PI);
        liftOffset += s * 0.055;
        liftRot -= s * 0.18;
      }
      this.urgentNode.coverGroup.position.y = baseY + liftOffset;
      this.urgentNode.coverGroup.rotation.x = liftRot;
    }

    for (const node of this.stackNodes.values()) {
      const isHovered = this._hoveredInteractId === node.meta.interactId;
      node.hoverLerp += ((isHovered ? 1 : 0) - node.hoverLerp) * hoverStep;
      if (node.coverMat) {
        node.coverMat.emissiveIntensity = 0.04 + node.hoverLerp * 0.28;
      }
      const baseY = 0.014 + (node.count > 0 ? node.paperBlock.scale.y : 0.002);
      let liftOffset = node.hoverLerp * 0.014;
      let liftRot = -node.hoverLerp * 0.04;
      if (node.liftAnim > 0) {
        node.liftAnim = Math.max(0, node.liftAnim - dt * 2.4);
        const s = Math.sin(node.liftAnim * Math.PI);
        liftOffset += s * 0.05;
        liftRot -= s * 0.16;
      }
      node.coverGroup.position.y = baseY + liftOffset;
      node.coverGroup.rotation.x = liftRot;
    }
  }

  markTexturesNeedsUpdate() {
    for (const node of this.stackNodes.values()) {
      if (node.tex) node.tex.needsUpdate = true;
    }
    if (this.urgentNode?.topTex) this.urgentNode.topTex.needsUpdate = true;
    if (this.urgentNode?.frontTex) this.urgentNode.frontTex.needsUpdate = true;
  }
}
