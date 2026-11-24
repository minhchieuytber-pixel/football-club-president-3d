// src/core/AssetCache.js
// Central shared-asset registry, safe GPU/RAM disposal (never disposes shared buffers),
// and WebGL memory telemetry for iPhone Safari / PWA stability.

const _sharedAssets = new WeakSet();

const MATERIAL_TEXTURE_KEYS = [
  'map',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'emissiveMap',
  'envMap',
  'lightMap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
  'specularMap'
];

export function markSharedAsset(asset) {
  if (!asset || typeof asset !== 'object') return asset;
  _sharedAssets.add(asset);
  try {
    if (!asset.userData || typeof asset.userData !== 'object') {
      asset.userData = {};
    }
    asset.userData.sharedAsset = true;
  } catch {
    // Ignore frozen/read-only mock objects; WeakSet still tracks them.
  }
  return asset;
}

export function isSharedAsset(asset) {
  if (!asset || typeof asset !== 'object') return false;
  return _sharedAssets.has(asset) || Boolean(asset.userData && asset.userData.sharedAsset === true);
}

function disposeTextureIfOwned(tex, disposedTextures) {
  if (!tex || typeof tex !== 'object') return;
  if (isSharedAsset(tex) || disposedTextures.has(tex)) return;
  disposedTextures.add(tex);
  // Zero owned offscreen canvas dimensions so iOS WebKit releases backing-store RAM immediately
  const img = tex.image;
  if (img && typeof img.getContext === 'function' && 'width' in img && 'height' in img) {
    try {
      img.width = 0;
      img.height = 0;
    } catch {
      // Ignore read-only image objects
    }
  }
  if (typeof tex.dispose === 'function') {
    tex.dispose();
  }
}

function disposeMaterialIfOwned(mat, disposedMaterials, disposedTextures) {
  if (!mat || typeof mat !== 'object') return;
  if (isSharedAsset(mat) || disposedMaterials.has(mat)) return;
  disposedMaterials.add(mat);
  for (let i = 0; i < MATERIAL_TEXTURE_KEYS.length; i++) {
    const tex = mat[MATERIAL_TEXTURE_KEYS[i]];
    if (tex) disposeTextureIfOwned(tex, disposedTextures);
  }
  if (typeof mat.dispose === 'function') {
    mat.dispose();
  }
}

function visitObject3D(node, fn) {
  if (!node) return;
  if (typeof node.traverse === 'function') {
    node.traverse(fn);
    return;
  }
  fn(node);
  if (Array.isArray(node.children)) {
    for (let i = 0; i < node.children.length; i++) {
      visitObject3D(node.children[i], fn);
    }
  }
}

export function safeDisposeObject3D(root) {
  const disposedGeometries = new Set();
  const disposedMaterials = new Set();
  const disposedTextures = new Set();
  if (!root || typeof root !== 'object') {
    return { geometries: 0, materials: 0, textures: 0 };
  }

  visitObject3D(root, (node) => {
    const geo = node.geometry;
    if (geo && !isSharedAsset(geo) && !disposedGeometries.has(geo)) {
      disposedGeometries.add(geo);
      if (typeof geo.dispose === 'function') {
        geo.dispose();
      }
    }

    const mat = node.material;
    if (Array.isArray(mat)) {
      for (let i = 0; i < mat.length; i++) {
        disposeMaterialIfOwned(mat[i], disposedMaterials, disposedTextures);
      }
    } else if (mat) {
      disposeMaterialIfOwned(mat, disposedMaterials, disposedTextures);
    }
  });

  return {
    geometries: disposedGeometries.size,
    materials: disposedMaterials.size,
    textures: disposedTextures.size
  };
}

export function getMemorySnapshot(renderer) {
  const infoMem = renderer?.info?.memory || {};
  const infoRender = renderer?.info?.render || {};
  const programs = Array.isArray(renderer?.info?.programs) ? renderer.info.programs.length : 0;

  let usedHeapMB = null;
  let totalHeapMB = null;
  let heapLimitMB = null;
  const perfMem = typeof performance !== 'undefined' ? performance.memory : null;
  if (perfMem && typeof perfMem.usedJSHeapSize === 'number') {
    usedHeapMB = Math.round((perfMem.usedJSHeapSize / 1048576) * 100) / 100;
    totalHeapMB = typeof perfMem.totalJSHeapSize === 'number'
      ? Math.round((perfMem.totalJSHeapSize / 1048576) * 100) / 100
      : null;
    heapLimitMB = typeof perfMem.jsHeapSizeLimit === 'number'
      ? Math.round((perfMem.jsHeapSizeLimit / 1048576) * 100) / 100
      : null;
  }

  return {
    geometries: infoMem.geometries ?? 0,
    textures: infoMem.textures ?? 0,
    programs,
    calls: infoRender.calls ?? 0,
    triangles: infoRender.triangles ?? 0,
    usedHeapMB,
    totalHeapMB,
    heapLimitMB,
    timestamp: Date.now()
  };
}
