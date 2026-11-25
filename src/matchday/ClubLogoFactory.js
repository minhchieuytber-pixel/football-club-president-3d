// src/matchday/ClubLogoFactory.js
// Tạo huy hiệu (logo) SVG sắc nét theo từng CLB & giải đấu — 100% nội bộ (Data URI), không phụ thuộc ảnh ngoài.

const LOGO_CACHE = new Map();

function toHexColor(colorVal, fallback = '#1e3a8a') {
  if (typeof colorVal === 'string' && colorVal.startsWith('#')) return colorVal;
  if (typeof colorVal === 'number' && Number.isFinite(colorVal)) {
    return '#' + (colorVal >>> 0).toString(16).padStart(6, '0').slice(-6);
  }
  return fallback;
}

function getClubInitials(name = '') {
  const clean = String(name || 'CLB').trim();
  if (clean === 'Paris Saint-Germain') return 'PSG';
  if (clean === 'Olympique de Marseille') return 'OM';
  if (clean === 'Olympique Lyonnais') return 'OL';
  if (clean === 'AS Monaco') return 'ASM';
  if (clean === 'LOSC Lille') return 'LOSC';
  if (clean === 'OGC Nice') return 'OGCN';
  if (clean === 'RC Lens') return 'RCL';
  if (clean === 'Stade Rennais') return 'SRFC';
  if (clean === 'RC Strasbourg Alsace') return 'RCSA';
  if (clean === 'Stade Brestois') return 'SB29';
  if (clean === 'Real Madrid') return 'RMA';
  if (clean === 'FC Barcelona') return 'FCB';
  if (clean === 'Atlético de Madrid') return 'ATM';
  if (clean === 'Bayern Munich') return 'FCB';
  if (clean === 'Manchester City') return 'MCI';
  if (clean === 'Manchester United') return 'MUN';
  if (clean === 'Inter Milan') return 'INT';
  if (clean === 'AC Milan') return 'ACM';
  const words = clean.split(/\s+/).filter((w) => w.length > 1 && !['de', 'fc', 'ac', 'sc', 'rc', 'cf', 'as', 'ogc'].includes(w.toLowerCase()));
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return clean.slice(0, 3).toUpperCase();
}

function adjustContrastText(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.68 ? '#0f172a' : '#ffffff';
}

export function getClubLogoDataUrl(clubOrName, colorOverride = null) {
  const name = typeof clubOrName === 'string' ? clubOrName : (clubOrName?.name || 'Club');
  const hex = toHexColor(colorOverride ?? clubOrName?.color, name === 'Paris Saint-Germain' ? '#00205b' : '#1d4ed8');
  const key = `${name}|${hex}`;
  if (LOGO_CACHE.has(key)) return LOGO_CACHE.get(key);

  let svg = '';
  if (name === 'Paris Saint-Germain') {
    svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
        <defs>
          <linearGradient id="psgBg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#002b75"/>
            <stop offset="100%" stop-color="#00143b"/>
          </linearGradient>
        </defs>
        <circle cx="40" cy="40" r="37" fill="url(#psgBg)" stroke="#d4af37" stroke-width="3.2"/>
        <circle cx="40" cy="40" r="31" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>
        <path d="M40 16 L44 35 L52 52 L28 52 L36 35 Z" fill="#da291c" stroke="#ffffff" stroke-width="1.3"/>
        <path d="M33 45 Q40 41 47 45" fill="none" stroke="#ffffff" stroke-width="2"/>
        <circle cx="40" cy="56" r="3" fill="#d4af37"/>
        <text x="40" y="13" text-anchor="middle" fill="#ffffff" font-size="7.5" font-weight="800" font-family="sans-serif" letter-spacing="1">PARIS</text>
        <text x="40" y="70" text-anchor="middle" fill="#fde68a" font-size="6.5" font-weight="800" font-family="sans-serif" letter-spacing="0.8">SAINT-GERMAIN</text>
      </svg>`;
  } else {
    const initials = getClubInitials(name);
    const fg = adjustContrastText(hex);
    const accent = hex === '#f8fafc' ? '#1e3a8a' : '#facc15';
    svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
        <path d="M12 12 L68 12 L68 42 C68 58 40 72 40 72 C40 72 12 58 12 42 Z" fill="${hex}" stroke="${accent}" stroke-width="3"/>
        <path d="M17 17 L63 17 L63 41 C63 53 40 65 40 65 C40 65 17 53 17 41 Z" fill="none" stroke="rgba(255,255,255,0.32)" stroke-width="1.2"/>
        <rect x="14" y="29" width="52" height="19" fill="rgba(15,23,42,0.52)"/>
        <text x="40" y="43" text-anchor="middle" fill="${fg === '#0f172a' ? '#ffffff' : fg}" font-size="${initials.length >= 4 ? 13 : 16}" font-weight="900" font-family="sans-serif" letter-spacing="0.5">${initials}</text>
      </svg>`;
  }

  const uri = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.trim());
  LOGO_CACHE.set(key, uri);
  return uri;
}
