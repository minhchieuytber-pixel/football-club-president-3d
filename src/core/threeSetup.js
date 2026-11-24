// src/core/threeSetup.js
// Đảm bảo Three.js luôn được nạp trực tiếp từ bundle cục bộ (không phụ thuộc CDN ngoài / hoạt động 100% offline)
import * as THREE from 'three';

if (typeof window !== 'undefined') {
  window.THREE = THREE;
}
if (typeof globalThis !== 'undefined') {
  globalThis.THREE = THREE;
}

export default THREE;
