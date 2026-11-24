// src/characters/PlayerKitSystem.js
// Hệ thống Trang phục Cầu thủ 3D (PSG Player Kit System):
// - Render trực tiếp TÊN CẦU THỦ (chữ in hoa) và SỐ ÁO cỡ lớn lên bề mặt UV mặt lưng (-Z) của thân áo 3D.
// - Hỗ trợ 6 mẫu áo PSG (home, away, third, training, warmup, gk) + scrimmage (đấu tập) + opponent (CLB đối thủ).
// - Đóng gói 1 texture atlas 512x256 (mặt trước + mặt sau + màu thân) = 1 material / 1 draw call cho mỗi torso.
// - Pooling + Reference Counting + Prune tự động tránh rò rỉ VRAM trên iPhone Safari.

export const KIT_TYPES = ['home', 'away', 'third', 'training', 'warmup', 'gk'];

export const PSG_KIT_THEMES = {
  home: {
    key: 'home',
    label: 'Sân nhà PSG (Hechter)',
    baseHex: '#00205b',
    baseColor: 0x00205b,
    shortsHex: '#00205b',
    shortsColor: 0x00205b,
    socksColor: 0x00205b,
    sleeveColor: 0x00205b,
    longSleeve: false,
    accentHex: '#da291c',
    trimHex: '#ffffff',
    textHex: '#ffffff',
    textStrokeHex: '#001030',
    pattern: 'hechter'
  },
  away: {
    key: 'away',
    label: 'Sân khách PSG',
    baseHex: '#f4f6fa',
    baseColor: 0xf4f6fa,
    shortsHex: '#00205b',
    shortsColor: 0x00205b,
    socksColor: 0xf4f6fa,
    sleeveColor: 0xf4f6fa,
    longSleeve: false,
    accentHex: '#da291c',
    trimHex: '#00205b',
    textHex: '#00205b',
    textStrokeHex: '#dbe4f0',
    pattern: 'away_sash'
  },
  third: {
    key: 'third',
    label: 'Áo thứ ba PSG',
    baseHex: '#181c28',
    baseColor: 0x181c28,
    shortsHex: '#181c28',
    shortsColor: 0x181c28,
    socksColor: 0x181c28,
    sleeveColor: 0x181c28,
    longSleeve: false,
    accentHex: '#9f1239',
    trimHex: '#d4af37',
    textHex: '#fef3c7',
    textStrokeHex: '#090c14',
    pattern: 'third_luxury'
  },
  training: {
    key: 'training',
    label: 'Áo tập luyện PSG',
    baseHex: '#0c4a8a',
    baseColor: 0x0c4a8a,
    shortsHex: '#0b162a',
    shortsColor: 0x0b162a,
    socksColor: 0x0b162a,
    sleeveColor: 0x0c4a8a,
    longSleeve: false,
    accentHex: '#ef4444',
    trimHex: '#38bdf8',
    textHex: '#ffffff',
    textStrokeHex: '#072447',
    pattern: 'training_split'
  },
  warmup: {
    key: 'warmup',
    label: 'Áo khởi động PSG',
    baseHex: '#0a1936',
    baseColor: 0x0a1936,
    shortsHex: '#0a1936',
    shortsColor: 0x0a1936,
    socksColor: 0x0a1936,
    sleeveColor: 0x0a1936,
    longSleeve: false,
    accentHex: '#da291c',
    trimHex: '#38bdf8',
    textHex: '#f8fafc',
    textStrokeHex: '#040b18',
    pattern: 'warmup_chevron'
  },
  gk: {
    key: 'gk',
    label: 'Áo Thủ môn PSG',
    baseHex: '#eab308',
    baseColor: 0xeab308,
    shortsHex: '#0b1528',
    shortsColor: 0x0b1528,
    socksColor: 0xeab308,
    sleeveColor: 0xeab308,
    longSleeve: true,
    accentHex: '#0b1528',
    trimHex: '#fef08a',
    textHex: '#0b1528',
    textStrokeHex: '#fde047',
    pattern: 'gk_diamond'
  },
  gk_away: {
    key: 'gk_away',
    label: 'Áo Thủ môn Đối thủ',
    baseHex: '#10b981',
    baseColor: 0x10b981,
    shortsHex: '#06281e',
    shortsColor: 0x06281e,
    socksColor: 0x10b981,
    sleeveColor: 0x10b981,
    longSleeve: true,
    accentHex: '#06281e',
    trimHex: '#d1fae5',
    textHex: '#ffffff',
    textStrokeHex: '#042017',
    pattern: 'gk_diamond'
  },
  scrimmage: {
    key: 'scrimmage',
    label: 'Áo đấu tập Vàng PSG',
    baseHex: '#facc15',
    baseColor: 0xfacc15,
    shortsHex: '#00205b',
    shortsColor: 0x00205b,
    socksColor: 0x00205b,
    sleeveColor: 0x0c4a8a,
    longSleeve: false,
    accentHex: '#00205b',
    trimHex: '#fef9c3',
    textHex: '#0b1528',
    textStrokeHex: '#fef08a',
    pattern: 'scrimmage_bib'
  }
};

// Vùng UV trên Canvas 512x256 (tọa độ pixel -> normalized UV [0..1])
export const KIT_ATLAS_LAYOUT = {
  width: 512,
  height: 256,
  front: { x: 8, y: 8, w: 216, h: 240 },
  back: { x: 248, y: 8, w: 216, h: 240 },
  sides: { x: 478, y: 136, w: 26, h: 108 },
  top: { x: 478, y: 12, w: 26, h: 108 }
};

function hexFromInt(colorInt, fallback = 0x2563eb) {
  const num = typeof colorInt === 'number' && Number.isFinite(colorInt) ? (colorInt & 0xffffff) : fallback;
  return `#${num.toString(16).padStart(6, '0')}`;
}

function getRelativeLuminance(colorInt) {
  const r = ((colorInt >> 16) & 255) / 255;
  const g = ((colorInt >> 8) & 255) / 255;
  const b = (colorInt & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function formatKitName(fullName, explicitDisplayName = null) {
  const src = String(explicitDisplayName || fullName || '').trim();
  if (!src) return 'PSG';
  if (explicitDisplayName) {
    return src.toUpperCase().slice(0, 16);
  }
  const parts = src.split(/\s+/).filter(Boolean);
  const surname = parts[parts.length - 1] || src;
  return surname.toUpperCase().slice(0, 16);
}

export function normalizeKitNumber(shirtNumber, fallback = '') {
  if (shirtNumber === null || shirtNumber === undefined || shirtNumber === '') {
    return fallback ? String(fallback) : '';
  }
  const n = Math.round(Number(shirtNumber));
  if (!Number.isFinite(n) || n <= 0) return fallback ? String(fallback) : '';
  return String(Math.min(99, n));
}

export function resolveKitTheme(kitType = 'home', clubColor = 0x2563eb) {
  if (kitType === 'opponent') {
    const colInt = typeof clubColor === 'number' ? (clubColor & 0xffffff) : 0x2563eb;
    const lum = getRelativeLuminance(colInt);
    const isLight = lum > 0.56;
    const baseHex = hexFromInt(colInt, 0x2563eb);
    return {
      key: `opp_${baseHex}`,
      label: 'Áo CLB Đối thủ',
      baseHex,
      baseColor: colInt,
      shortsHex: isLight ? '#0f172a' : '#f8fafc',
      shortsColor: isLight ? 0x0f172a : 0xf8fafc,
      socksColor: colInt,
      sleeveColor: colInt,
      longSleeve: false,
      accentHex: isLight ? '#0f172a' : '#ffffff',
      trimHex: isLight ? '#334155' : '#e2e8f0',
      textHex: isLight ? '#0f172a' : '#ffffff',
      textStrokeHex: isLight ? '#f8fafc' : '#090d16',
      pattern: 'opponent_clean'
    };
  }
  return PSG_KIT_THEMES[kitType] || PSG_KIT_THEMES.home;
}

export function normalizeKitSpec(kitConfig = {}) {
  const kitType = kitConfig.kitType || (kitConfig.position === 'GK' ? 'gk' : 'home');
  const clubColor = kitConfig.clubColor ?? kitConfig.jerseyColor ?? 0x00205b;
  const theme = resolveKitTheme(kitType, clubColor);
  const displayName = formatKitName(kitConfig.fullName || kitConfig.name, kitConfig.displayName);
  const shirtNumber = normalizeKitNumber(kitConfig.shirtNumber, kitConfig.fallbackNumber || '');
  const isCaptain = !!kitConfig.isCaptain;
  const cacheKey = `${kitType}|${theme.baseHex}|${displayName}|${shirtNumber}|${isCaptain ? 1 : 0}`;
  return {
    kitType,
    clubColor,
    theme,
    displayName,
    shirtNumber,
    isCaptain,
    playerId: kitConfig.playerId || null,
    club: kitConfig.club || 'Paris Saint-Germain',
    cacheKey
  };
}

// Tạo geometry Box(0.40, 0.48, 0.23) với UV ánh xạ chính xác vào Atlas 512x256 (1 draw call duy nhất!)
export function createMappedKitChestGeometry() {
  if (typeof THREE === 'undefined' || typeof THREE.BoxGeometry !== 'function') return null;
  const geo = new THREE.BoxGeometry(0.40, 0.48, 0.23);
  const uv = geo?.attributes?.uv;
  const norm = geo?.attributes?.normal;
  if (!uv || !norm || typeof uv.getX !== 'function') return geo;

  const { width: W, height: H, front, back, sides, top } = KIT_ATLAS_LAYOUT;
  const mapRegion = (u0, v0, rect) => {
    const uMin = rect.x / W;
    const uMax = (rect.x + rect.w) / W;
    const vMax = 1 - rect.y / H;
    const vMin = 1 - (rect.y + rect.h) / H;
    return [uMin + u0 * (uMax - uMin), vMin + v0 * (vMax - vMin)];
  };

  for (let i = 0; i < uv.count; i++) {
    const nx = norm.getX(i);
    const ny = norm.getY(i);
    const nz = norm.getZ(i);
    const u0 = uv.getX(i);
    const v0 = uv.getY(i);

    let mapped;
    if (nz > 0.5) {
      mapped = mapRegion(u0, v0, front);
    } else if (nz < -0.5) {
      mapped = mapRegion(u0, v0, back);
    } else if (ny > 0.5) {
      mapped = mapRegion(u0, v0, top);
    } else if (Math.abs(nx) > 0.5 || ny < -0.5) {
      mapped = mapRegion(u0, v0, sides);
    } else {
      mapped = mapRegion(u0, v0, sides);
    }
    uv.setXY(i, mapped[0], mapped[1]);
  }
  uv.needsUpdate = true;
  return geo;
}

// Vẽ mặt TRƯỚC áo đấu (Huy hiệu PSG, họa tiết Hechter / Khởi động / Tập luyện, cổ áo, băng đội trưởng)
export function drawJerseyFrontSection(ctx, rx, ry, rw, rh, spec) {
  const { theme, isCaptain, club } = spec;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();

  ctx.fillStyle = theme.baseHex;
  ctx.fillRect(rx, ry, rw, rh);

  const cx = rx + rw / 2;

  if (theme.pattern === 'hechter') {
    const bandW = rw * 0.26;
    ctx.fillStyle = theme.trimHex;
    ctx.fillRect(cx - bandW / 2 - 4, ry, bandW + 8, rh);
    ctx.fillStyle = theme.accentHex;
    ctx.fillRect(cx - bandW / 2, ry, bandW, rh);
  } else if (theme.pattern === 'away_sash') {
    const bandW = rw * 0.14;
    ctx.fillStyle = theme.trimHex;
    ctx.fillRect(cx - bandW / 2 - 3, ry, bandW + 6, rh);
    ctx.fillStyle = theme.accentHex;
    ctx.fillRect(cx - bandW / 2, ry, bandW, rh);
  } else if (theme.pattern === 'third_luxury') {
    ctx.fillStyle = theme.accentHex;
    ctx.beginPath();
    ctx.moveTo(rx, ry + rh * 0.22);
    ctx.lineTo(rx + rw, ry + rh * 0.55);
    ctx.lineTo(rx + rw, ry + rh * 0.72);
    ctx.lineTo(rx, ry + rh * 0.39);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = theme.trimHex;
    ctx.fillRect(rx, ry, rw, 6);
  } else if (theme.pattern === 'training_split') {
    ctx.fillStyle = theme.accentHex;
    ctx.fillRect(rx, ry, 10, rh);
    ctx.fillRect(rx + rw - 10, ry, 10, rh);
    ctx.fillStyle = theme.trimHex;
    ctx.fillRect(rx + 10, ry, 3, rh);
    ctx.fillRect(rx + rw - 13, ry, 3, rh);
  } else if (theme.pattern === 'warmup_chevron') {
    ctx.fillStyle = theme.accentHex;
    ctx.beginPath();
    ctx.moveTo(rx, ry + rh * 0.25);
    ctx.lineTo(cx, ry + rh * 0.45);
    ctx.lineTo(rx + rw, ry + rh * 0.25);
    ctx.lineTo(rx + rw, ry + rh * 0.36);
    ctx.lineTo(cx, ry + rh * 0.56);
    ctx.lineTo(rx, ry + rh * 0.36);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = theme.trimHex;
    ctx.fillRect(rx, ry + rh * 0.58, rw, 5);
  } else if (theme.pattern === 'gk_diamond') {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(rx + rw * 0.14, ry + rh * 0.14, rw * 0.72, rh * 0.72);
    ctx.fillStyle = theme.accentHex;
    ctx.fillRect(rx, ry, 8, rh);
    ctx.fillRect(rx + rw - 8, ry, 8, rh);
  } else if (theme.pattern === 'scrimmage_bib') {
    ctx.fillStyle = theme.accentHex;
    ctx.fillRect(rx, ry, 12, rh);
    ctx.fillRect(rx + rw - 12, ry, 12, rh);
  } else {
    ctx.fillStyle = theme.accentHex;
    ctx.fillRect(rx, ry + rh * 0.32, rw, 10);
  }

  // Cổ áo V-neck / Crew neck
  ctx.fillStyle = theme.accentHex;
  ctx.beginPath();
  ctx.moveTo(cx - 26, ry);
  ctx.lineTo(cx + 26, ry);
  ctx.lineTo(cx, ry + 20);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = theme.trimHex;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Huy hiệu CLB bên ngực trái (khi nhìn đối diện là bên phải tâm áo: cx + 34)
  if (club === 'Paris Saint-Germain') {
    const bx = cx + 38;
    const by = ry + 48;
    ctx.beginPath();
    ctx.arc(bx, by, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#00205b';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#da291c';
    ctx.fillRect(bx - 3, by - 8, 6, 16);
  }

  // Dải nhà tài trợ tối giản giữa ngực (đặc trưng áo đấu chuyên nghiệp)
  if (theme.pattern !== 'scrimmage_bib') {
    ctx.fillStyle = theme.textHex;
    ctx.font = 'bold 13px "Arial Narrow", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const sponsor = club === 'Paris Saint-Germain' ? 'PARIS' : 'CLUB';
    ctx.fillText(sponsor, cx, ry + rh * 0.48);
  }

  // Ký hiệu Đội trưởng (C) nhỏ bên ngực phải nếu là đội trưởng
  if (isCaptain) {
    const capX = cx - 42;
    const capY = ry + 48;
    ctx.fillStyle = '#facc15';
    ctx.fillRect(capX - 11, capY - 10, 22, 20);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(capX - 11, capY - 10, 22, 20);
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C', capX, capY + 1);
  }

  ctx.restore();
}

// Vẽ mặt LƯNG áo đấu: Họa tiết đúng bộ áo + TÊN CẦU THỦ IN HOA phía trên + SỐ ÁO CỠ LỚN ở chính giữa!
export function drawJerseyBackSection(ctx, rx, ry, rw, rh, spec) {
  const { theme, displayName, shirtNumber, club } = spec;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();

  // Nền chính mặt lưng
  ctx.fillStyle = theme.baseHex;
  ctx.fillRect(rx, ry, rw, rh);

  const cx = rx + rw / 2;

  // Họa tiết mặt lưng đồng bộ từng loại áo (bố trí vùng lưng trên sạch/tương phản cao cho tên & số)
  if (theme.pattern === 'hechter') {
    const bandW = rw * 0.24;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(cx - bandW / 2 - 2, ry + rh * 0.30, bandW + 4, rh * 0.70);
    ctx.fillStyle = 'rgba(218,41,28,0.82)';
    ctx.fillRect(cx - bandW / 2, ry + rh * 0.30, bandW, rh * 0.70);
  } else if (theme.pattern === 'away_sash') {
    const bandW = rw * 0.12;
    ctx.fillStyle = 'rgba(0,32,91,0.16)';
    ctx.fillRect(cx - bandW / 2 - 2, ry + rh * 0.78, bandW + 4, rh * 0.22);
    ctx.fillStyle = 'rgba(218,41,28,0.35)';
    ctx.fillRect(cx - bandW / 2, ry + rh * 0.78, bandW, rh * 0.22);
  } else if (theme.pattern === 'third_luxury') {
    ctx.fillStyle = theme.trimHex;
    ctx.fillRect(rx, ry, rw, 5);
    ctx.fillStyle = 'rgba(159,18,57,0.55)';
    ctx.fillRect(rx, ry + rh - 14, rw, 14);
  } else if (theme.pattern === 'training_split') {
    ctx.fillStyle = theme.accentHex;
    ctx.fillRect(rx, ry, 10, rh);
    ctx.fillRect(rx + rw - 10, ry, 10, rh);
    ctx.fillStyle = theme.trimHex;
    ctx.fillRect(rx + 10, ry, 2.5, rh);
    ctx.fillRect(rx + rw - 12.5, ry, 2.5, rh);
  } else if (theme.pattern === 'warmup_chevron') {
    ctx.fillStyle = 'rgba(218,41,28,0.38)';
    ctx.fillRect(rx, ry + rh - 18, rw, 10);
    ctx.fillStyle = theme.trimHex;
    ctx.fillRect(rx, ry + rh - 8, rw, 4);
  } else if (theme.pattern === 'gk_diamond') {
    ctx.fillStyle = theme.accentHex;
    ctx.fillRect(rx, ry, 8, rh);
    ctx.fillRect(rx + rw - 8, ry, 8, rh);
  } else if (theme.pattern === 'scrimmage_bib') {
    ctx.fillStyle = theme.accentHex;
    ctx.fillRect(rx, ry, 12, rh);
    ctx.fillRect(rx + rw - 12, ry, 12, rh);
  }

  // Viền cổ áo sau gáy
  ctx.fillStyle = theme.accentHex;
  ctx.fillRect(cx - 32, ry, 64, 11);
  ctx.fillStyle = theme.trimHex;
  ctx.fillRect(cx - 32, ry + 11, 64, 3);

  // 1. TÊN CẦU THỦ IN HOA Ở PHÍA TRÊN LƯNG ÁO
  const nameStr = (displayName || 'PSG').toUpperCase();
  let nameFontPx = 25;
  if (nameStr.length >= 13) nameFontPx = 17;
  else if (nameStr.length >= 10) nameFontPx = 19;
  else if (nameStr.length >= 8) nameFontPx = 22;

  ctx.font = `900 ${nameFontPx}px "Arial Narrow", "Impact", "Segoe UI", sans-serif`;
  if (typeof ctx.measureText === 'function') {
    const maxNameW = rw * 0.84;
    let measured = ctx.measureText(nameStr)?.width || 0;
    while (measured > maxNameW && nameFontPx > 12) {
      nameFontPx -= 1;
      ctx.font = `900 ${nameFontPx}px "Arial Narrow", "Impact", "Segoe UI", sans-serif`;
      measured = ctx.measureText(nameStr)?.width || 0;
    }
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const nameY = ry + rh * 0.22;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = theme.textStrokeHex;
  ctx.strokeText(nameStr, cx, nameY);
  ctx.fillStyle = theme.textHex;
  ctx.fillText(nameStr, cx, nameY);

  // 2. SỐ ÁO CỠ LỚN Ở CHÍNH GIỮA LƯNG ÁO
  const numStr = shirtNumber ? String(shirtNumber) : '';
  if (numStr) {
    const numFontPx = numStr.length >= 2 ? 92 : 104;
    ctx.font = `900 ${numFontPx}px "Impact", "Arial Black", "Segoe UI", sans-serif`;
    const numY = ry + rh * 0.59;
    ctx.lineWidth = 7;
    ctx.strokeStyle = theme.textStrokeHex;
    ctx.strokeText(numStr, cx, numY);
    ctx.fillStyle = theme.textHex;
    ctx.fillText(numStr, cx, numY);
  }

  // Nhãn nhỏ CLB ở gấu áo sau
  if (club === 'Paris Saint-Germain') {
    ctx.fillStyle = theme.trimHex;
    ctx.font = 'bold 10px "Arial Narrow", sans-serif';
    ctx.fillText('PARIS', cx, ry + rh * 0.89);
  }

  ctx.restore();
}

export class PlayerKitSystem {
  constructor() {
    // Pool key -> { key, texture, material, refCount, lastUsed, spec }
    this._pool = new Map();
    this._useSeq = 0;
    this.maxIdleEntries = 24;
  }

  _drawAtlasCanvas(canvas, spec) {
    const { width: W, height: H, front, back } = KIT_ATLAS_LAYOUT;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Tô nền base toàn atlas để các cạnh hông/vai/gấu áo đồng màu hoàn hảo, không rò màu khi lọc mipmap
    ctx.fillStyle = spec.theme.baseHex;
    ctx.fillRect(0, 0, W, H);

    // Mặt trước (+Z) & Mặt lưng (-Z)
    drawJerseyFrontSection(ctx, front.x, front.y, front.w, front.h, spec);
    drawJerseyBackSection(ctx, back.x, back.y, back.w, back.h, spec);
  }

  _acquireEntry(spec) {
    const key = spec.cacheKey;
    let entry = this._pool.get(key);
    if (entry) {
      entry.lastUsed = ++this._useSeq;
      return entry;
    }

    let texture = null;
    let canvas = null;
    if (typeof document !== 'undefined' && typeof THREE !== 'undefined' && typeof THREE.CanvasTexture === 'function') {
      canvas = document.createElement('canvas');
      this._drawAtlasCanvas(canvas, spec);
      texture = new THREE.CanvasTexture(canvas);
      texture.anisotropy = 4;
      texture.needsUpdate = true;
      texture.userData = { ...(texture.userData || {}), sharedAsset: true, kitKey: key };
    }

    let material = null;
    if (typeof THREE !== 'undefined' && typeof THREE.MeshStandardMaterial === 'function') {
      material = new THREE.MeshStandardMaterial({
        color: texture ? 0xffffff : spec.theme.baseColor,
        map: texture || null,
        roughness: 0.56,
        metalness: 0.04
      });
      material.userData = { ...(material.userData || {}), sharedAsset: true, kitKey: key };
    }

    entry = {
      key,
      spec,
      canvas,
      texture,
      material,
      refCount: 0,
      lastUsed: ++this._useSeq
    };
    this._pool.set(key, entry);
    return entry;
  }

  applyKitToMesh(rootMesh, kitConfig = {}, resolveSharedMat = null) {
    if (!rootMesh?.userData?.rig) return null;
    const rig = rootMesh.userData.rig;
    const kitParts = rig.kitParts;
    if (!kitParts || !kitParts.chest) return null;

    const spec = normalizeKitSpec({
      ...(rootMesh.userData.kitData || {}),
      ...kitConfig
    });

    // Lưu dữ liệu nguồn để đổi loại áo (home/away/third/training/warmup/gk) luôn giữ nguyên tên & số áo!
    rootMesh.userData.kitData = {
      playerId: spec.playerId,
      displayName: spec.displayName,
      shirtNumber: spec.shirtNumber,
      isCaptain: spec.isCaptain,
      kitType: spec.kitType,
      club: spec.club,
      clubColor: spec.clubColor
    };

    if (rootMesh.userData.kitKey === spec.cacheKey && kitParts.chest.material) {
      return spec;
    }

    // Nhả refCount bộ cũ nếu đang giữ
    this.releaseMeshKit(rootMesh);

    const entry = this._acquireEntry(spec);
    entry.refCount++;
    entry.lastUsed = ++this._useSeq;
    rootMesh.userData.kitKey = spec.cacheKey;

    if (entry.material) {
      kitParts.chest.material = entry.material;
    }

    // Đồng bộ màu tay áo, tay dài GK & quần đùi từ resolveSharedMat
    if (typeof resolveSharedMat === 'function') {
      const sleeveMat = resolveSharedMat(spec.theme.sleeveColor, 0.58, 0.06);
      const shortsMat = resolveSharedMat(spec.theme.shortsColor, 0.65, 0.05);
      const lowerArmMat = spec.theme.longSleeve ? sleeveMat : kitParts.skinMat;

      if (Array.isArray(kitParts.upperArms)) {
        for (let i = 0; i < kitParts.upperArms.length; i++) {
          if (kitParts.upperArms[i] && sleeveMat) kitParts.upperArms[i].material = sleeveMat;
        }
      }
      if (Array.isArray(kitParts.lowerArms)) {
        for (let i = 0; i < kitParts.lowerArms.length; i++) {
          if (kitParts.lowerArms[i] && lowerArmMat) kitParts.lowerArms[i].material = lowerArmMat;
        }
      }
      if (kitParts.hipMesh && shortsMat) kitParts.hipMesh.material = shortsMat;
      if (Array.isArray(kitParts.thighs)) {
        for (let i = 0; i < kitParts.thighs.length; i++) {
          if (kitParts.thighs[i] && shortsMat) kitParts.thighs[i].material = shortsMat;
        }
      }
    }

    this.pruneUnusedCache();
    return spec;
  }

  releaseMeshKit(rootMesh) {
    if (!rootMesh?.userData) return;
    const oldKey = rootMesh.userData.kitKey;
    if (!oldKey) return;
    const entry = this._pool.get(oldKey);
    if (entry) {
      entry.refCount = Math.max(0, entry.refCount - 1);
      entry.lastUsed = ++this._useSeq;
    }
    rootMesh.userData.kitKey = null;
    this.pruneUnusedCache();
  }

  pruneUnusedCache(maxIdle = this.maxIdleEntries) {
    const unused = [];
    for (const entry of this._pool.values()) {
      if (entry.refCount <= 0) unused.push(entry);
    }
    if (unused.length <= maxIdle) return 0;
    unused.sort((a, b) => a.lastUsed - b.lastUsed);
    const toRemove = unused.length - maxIdle;
    for (let i = 0; i < toRemove; i++) {
      this._disposeEntry(unused[i]);
    }
    return toRemove;
  }

  _disposeEntry(entry) {
    if (!entry) return;
    this._pool.delete(entry.key);
    entry.texture?.dispose?.();
    entry.material?.dispose?.();
    if (entry.canvas) {
      entry.canvas.width = 0;
      entry.canvas.height = 0;
    }
  }

  getCacheStats() {
    let activeCount = 0;
    let totalRefs = 0;
    for (const e of this._pool.values()) {
      if (e.refCount > 0) activeCount++;
      totalRefs += e.refCount;
    }
    return {
      totalEntries: this._pool.size,
      activeEntries: activeCount,
      idleEntries: this._pool.size - activeCount,
      totalRefs
    };
  }

  disposeAll() {
    for (const entry of [...this._pool.values()]) {
      this._disposeEntry(entry);
    }
    this._pool.clear();
  }
}

export const sharedPlayerKitSystem = new PlayerKitSystem();
