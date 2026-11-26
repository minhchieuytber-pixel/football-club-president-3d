// src/core/TextureFactory.js
// Tạo vật liệu PBR thủ tục (gỗ trầm, đá cẩm thạch, cỏ sân bóng, huy hiệu PSG, áo đấu, màn hình)
// Tối ưu GPU/VRAM iPhone: kích thước POT, tắt mipmaps trên UI/biển hiệu phẳng, fix cache key & hỗ trợ WebGL context restore.
export class TextureFactory {
  constructor() {
    this.cache = new Map();
    this.maxAnisotropy = 4;
  }

  _configureTexture(tex, { mipmaps = false, repeat = null, anisotropy = 1 } = {}) {
    if (!tex) return tex;
    tex.userData = tex.userData || {};
    tex.userData.sharedAsset = true;

    if (!mipmaps) {
      tex.generateMipmaps = false;
      if (typeof THREE !== 'undefined' && typeof THREE.LinearFilter !== 'undefined') {
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
      }
    }
    if (repeat) {
      if (typeof THREE !== 'undefined' && typeof THREE.RepeatWrapping !== 'undefined') {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      }
      if (Array.isArray(repeat) && tex.repeat && typeof tex.repeat.set === 'function') {
        tex.repeat.set(repeat[0], repeat[1]);
      }
    }
    if (anisotropy > 1) {
      tex.anisotropy = Math.min(anisotropy, this.maxAnisotropy);
    }
    return tex;
  }

  setMaxAnisotropy(maxAniso) {
    this.maxAnisotropy = Math.max(1, Math.min(4, maxAniso || 1));
    for (const tex of this.cache.values()) {
      if (tex && tex.anisotropy && tex.anisotropy > this.maxAnisotropy) {
        tex.anisotropy = this.maxAnisotropy;
        tex.needsUpdate = true;
      }
    }
  }

  get(key, generator) {
    if (this.cache.has(key)) return this.cache.get(key);
    const tex = generator();
    if (tex) {
      tex.userData = tex.userData || {};
      tex.userData.sharedAsset = true;
    }
    this.cache.set(key, tex);
    return tex;
  }

  makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return [c, c.getContext('2d')];
  }

  markAllNeedsUpdate() {
    for (const tex of this.cache.values()) {
      if (tex) tex.needsUpdate = true;
    }
  }

  disposeAll() {
    for (const tex of this.cache.values()) {
      if (!tex) continue;
      if (typeof tex.dispose === 'function') tex.dispose();
      if (tex.image && typeof tex.image.width === 'number' && typeof tex.image.height === 'number') {
        tex.image.width = 0;
        tex.image.height = 0;
      }
    }
    this.cache.clear();
  }

  woodTexture(base = '#4a2f23', grain = '#2f1b13', opts = {}) {
    const rep = opts?.repeat ?? true;
    const repKey = Array.isArray(rep) ? `${rep[0]}x${rep[1]}` : String(rep);
    const aniso = opts?.anisotropy ?? 2;
    return this.get(`wood_${base}_${grain}_${repKey}_${aniso}`, () => {
      const [c, ctx] = this.makeCanvas(256, 256);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = grain;
      for (let i = 0; i < 65; i++) {
        ctx.globalAlpha = 0.12 + (i % 5) * 0.04;
        ctx.lineWidth = 1 + (i % 3);
        ctx.beginPath();
        const y = (i / 65) * 256;
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(85, y + Math.sin(i) * 6, 170, y - Math.cos(i) * 6, 256, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const tex = new THREE.CanvasTexture(c);
      return this._configureTexture(tex, { mipmaps: true, repeat: rep, anisotropy: aniso });
    });
  }

  marbleTexture(base = '#e6e2d8', vein = '#c7c1b5') {
    return this.get(`marble_${base}_${vein}`, () => {
      const [c, ctx] = this.makeCanvas(256, 256);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 256, 256);
      // Tile seams
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, 126, 126);
      ctx.strokeRect(129, 1, 126, 126);
      ctx.strokeRect(1, 129, 126, 126);
      ctx.strokeRect(129, 129, 126, 126);
      // Veins
      ctx.strokeStyle = vein;
      for (let i = 0; i < 18; i++) {
        ctx.globalAlpha = 0.18;
        ctx.lineWidth = 1 + (i % 2);
        ctx.beginPath();
        ctx.moveTo((i * 37) % 256, 0);
        ctx.quadraticCurveTo(((i * 91) % 256), 128, ((i * 53 + 80) % 256), 256);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const tex = new THREE.CanvasTexture(c);
      return this._configureTexture(tex, { mipmaps: true, repeat: [8, 5], anisotropy: 2 });
    });
  }

  grassPitchTexture(withMarkings = true) {
    return this.get(`pitch_${withMarkings}`, () => {
      // POT 1024x512 (tiết kiệm 20% VRAM so với 1024x640, giữ nguyên độ sắc nét vạch sân)
      const W = 1024;
      const H = 512;
      const [c, ctx] = this.makeCanvas(W, H);
      const stripes = 14;
      const sw = W / stripes;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#2b6f38' : '#256130';
        ctx.fillRect(i * sw, 0, sw + 1, H);
      }
      // Subtle grass grain
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      for (let i = 0; i < 1000; i++) {
        ctx.fillRect((i * 73) % W, (i * 41) % H, 2, 2);
      }
      if (withMarkings) {
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.lineWidth = 5;
        ctx.strokeRect(36, 28, 952, 456);
        // Halfway line
        ctx.beginPath();
        ctx.moveTo(512, 28);
        ctx.lineTo(512, 484);
        ctx.stroke();
        // Center circle
        ctx.beginPath();
        ctx.arc(512, 256, 72, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(512, 256, 6, 0, Math.PI * 2);
        ctx.fill();
        // Penalty boxes
        ctx.strokeRect(36, 118, 152, 276);
        ctx.strokeRect(36, 179, 54, 154);
        ctx.strokeRect(836, 118, 152, 276);
        ctx.strokeRect(934, 179, 54, 154);
      }
      const tex = new THREE.CanvasTexture(c);
      return this._configureTexture(tex, { mipmaps: true, anisotropy: 4 });
    });
  }

  psgCrestTexture() {
    return this.get('psg_crest', () => {
      const [c, ctx] = this.makeCanvas(256, 256);
      ctx.clearRect(0, 0, 256, 256);
      // Outer navy circle
      ctx.fillStyle = '#00205b';
      ctx.beginPath();
      ctx.arc(128, 128, 120, 0, Math.PI * 2);
      ctx.fill();
      // White/silver ring
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(128, 128, 112, 0, Math.PI * 2);
      ctx.stroke();
      // Inner blue circle
      ctx.fillStyle = '#003876';
      ctx.beginPath();
      ctx.arc(128, 128, 92, 0, Math.PI * 2);
      ctx.fill();
      // Stylized Eiffel Tower in PSG Red
      ctx.fillStyle = '#da291c';
      ctx.beginPath();
      ctx.moveTo(128, 56);
      ctx.lineTo(148, 134);
      ctx.lineTo(172, 184);
      ctx.lineTo(146, 184);
      ctx.quadraticCurveTo(128, 146, 110, 184);
      ctx.lineTo(84, 184);
      ctx.lineTo(108, 134);
      ctx.closePath();
      ctx.fill();
      // Gold Fleur-de-lis dot
      ctx.fillStyle = '#d4af37';
      ctx.beginPath();
      ctx.arc(128, 168, 10, 0, Math.PI * 2);
      ctx.fill();
      // Text PARIS
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PARIS', 128, 44);
      ctx.font = 'bold 16px Inter, sans-serif';
      ctx.fillText('SAINT-GERMAIN', 128, 224);
      const tex = new THREE.CanvasTexture(c);
      return this._configureTexture(tex, { mipmaps: false });
    });
  }

  screenTexture(title = 'PSG EXECUTIVE OS', subtitle = 'PARC DES PRINCES · LIGUE 1') {
    return this.get(`screen_${title}_${subtitle}`, () => {
      // POT 512x256, tắt mipmaps (tiết kiệm ~41% VRAM so với 512x288 có mipmap)
      const [c, ctx] = this.makeCanvas(512, 256);
      const grad = ctx.createLinearGradient(0, 0, 512, 256);
      grad.addColorStop(0, '#07142b');
      grad.addColorStop(1, '#0f2547');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 256);
      ctx.fillStyle = '#da291c';
      ctx.fillRect(0, 0, 512, 7);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 25px Inter, sans-serif';
      ctx.fillText(title, 28, 48);
      ctx.fillStyle = '#93c5fd';
      ctx.font = '14px Inter, sans-serif';
      ctx.fillText(subtitle, 28, 74);
      // Mini KPI cards
      const stats = [
        ['NGÂN SÁCH', '€245M', '#38bdf8'],
        ['LIGUE 1', 'HẠNG 1', '#4ade80'],
        ['UY TÍN', '88/100', '#fbbf24']
      ];
      stats.forEach((s, idx) => {
        const x = 28 + idx * 156;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x, 96, 142, 68);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '12px Inter, sans-serif';
        ctx.fillText(s[0], x + 12, 118);
        ctx.fillStyle = s[2];
        ctx.font = 'bold 23px Inter, sans-serif';
        ctx.fillText(s[1], x + 12, 150);
      });
      // Mini bar chart
      for (let i = 0; i < 8; i++) {
        const bh = 24 + ((i * 19) % 42);
        ctx.fillStyle = i % 2 === 0 ? '#2563eb' : '#da291c';
        ctx.fillRect(28 + i * 58, 236 - bh, 38, bh);
      }
      const tex = new THREE.CanvasTexture(c);
      return this._configureTexture(tex, { mipmaps: false });
    });
  }

  signTexture(text, bg = '#0f172a', fg = '#f8fafc', accent = '#da291c') {
    return this.get(`sign_${text}_${bg}_${fg}_${accent}`, () => {
      // 512x96 tắt mipmaps (giảm ~43% VRAM, chữ biển hiệu sắc nét)
      const [c, ctx] = this.makeCanvas(512, 96);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 512, 96);
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, 14, 96);
      ctx.fillStyle = fg;
      ctx.font = 'bold 28px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 262, 50);
      const tex = new THREE.CanvasTexture(c);
      return this._configureTexture(tex, { mipmaps: false });
    });
  }

  tacticalBoardTexture() {
    return this.get('tactical_board', () => {
      // POT 512x256 tắt mipmaps
      const [c, ctx] = this.makeCanvas(512, 256);
      ctx.fillStyle = '#1b5e20';
      ctx.fillRect(0, 0, 512, 256);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.strokeRect(18, 16, 476, 224);
      ctx.beginPath();
      ctx.moveTo(256, 16);
      ctx.lineTo(256, 240);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(256, 128, 38, 0, Math.PI * 2);
      ctx.stroke();
      // 4-3-3 PSG magnets
      const pts = [[52,128],[130,54],[125,104],[125,152],[130,202],[225,76],[210,128],[225,180],[340,60],[365,128],[340,196]];
      pts.forEach((p, idx) => {
        ctx.fillStyle = idx === 0 ? '#facc15' : '#00205b';
        ctx.beginPath();
        ctx.arc(p[0], p[1], 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
      const tex = new THREE.CanvasTexture(c);
      return this._configureTexture(tex, { mipmaps: false });
    });
  }

  framedJerseyTexture(num = '10') {
    return this.get(`jersey_${num}`, () => {
      // POT 256x256 tắt mipmaps
      const [c, ctx] = this.makeCanvas(256, 256);
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 9;
      ctx.strokeRect(8, 8, 240, 240);
      // Jersey silhouette
      ctx.fillStyle = '#00205b';
      ctx.beginPath();
      ctx.moveTo(86, 44);
      ctx.lineTo(170, 44);
      ctx.lineTo(212, 88);
      ctx.lineTo(186, 110);
      ctx.lineTo(170, 96);
      ctx.lineTo(170, 212);
      ctx.lineTo(86, 212);
      ctx.lineTo(86, 96);
      ctx.lineTo(70, 110);
      ctx.lineTo(44, 88);
      ctx.closePath();
      ctx.fill();
      // Center Hechter red stripe
      ctx.fillStyle = '#da291c';
      ctx.fillRect(114, 44, 28, 168);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(110, 44, 4, 168);
      ctx.fillRect(142, 44, 4, 168);
      // Number
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 50px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(num, 128, 152);
      const tex = new THREE.CanvasTexture(c);
      return this._configureTexture(tex, { mipmaps: false });
    });
  }

  psgArtworkTexture(variant = 'parc') {
    return this.get(`psg_art_${variant}`, () => {
      const [c, ctx] = this.makeCanvas(256, 256);
      const grad = ctx.createLinearGradient(0, 0, 256, 256);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#00205b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);

      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 4;
      ctx.strokeRect(12, 12, 232, 232);

      if (variant === 'parc') {
        // Minimalist Parc des Princes & Hechter luxury graphic
        ctx.fillStyle = '#da291c';
        ctx.fillRect(114, 24, 28, 208);
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(108, 24, 4, 208);
        ctx.fillRect(144, 24, 4, 208);

        ctx.fillStyle = '#0b1220';
        ctx.beginPath();
        ctx.ellipse(128, 134, 82, 42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.fillStyle = '#1e3a8a';
        ctx.beginPath();
        ctx.ellipse(128, 134, 58, 26, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PARC DES PRINCES', 128, 208);
        ctx.fillStyle = '#fde68a';
        ctx.font = 'bold 13px Inter, sans-serif';
        ctx.fillText('ICI C\'EST PARIS', 128, 52);
      } else {
        // Minimalist Eiffel & PSG crest heritage print
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(128, 118, 66, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#da291c';
        ctx.beginPath();
        ctx.moveTo(128, 62);
        ctx.lineTo(148, 122);
        ctx.lineTo(170, 166);
        ctx.lineTo(142, 166);
        ctx.quadraticCurveTo(128, 134, 114, 166);
        ctx.lineTo(86, 166);
        ctx.lineTo(108, 122);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 17px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PARIS SAINT-GERMAIN', 128, 206);
        ctx.fillStyle = '#93c5fd';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillText('EST. 1970 · RESIDENCE', 128, 224);
      }

      const tex = new THREE.CanvasTexture(c);
      return this._configureTexture(tex, { mipmaps: false });
    });
  }
}

