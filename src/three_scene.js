(function(TD) {
  'use strict';

  const LOGICAL_WIDTH = 1280;
  const LOGICAL_HEIGHT = 720;
  const CENTER_X = 640;
  const CENTER_Y = 360;
  const SCALE = 0.1;
  const INV_SCALE = 10.0;
  const TWO_PI = Math.PI * 2;

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /* =========================================================================
   * 1. Coordinate System & World/Screen Projections (TD.WorldCoords)
   * ========================================================================= */

  const WorldCoords = {
    SCALE: SCALE,
    INV_SCALE: INV_SCALE,
    CENTER_X: CENTER_X,
    CENTER_Y: CENTER_Y,
    WORLD_WIDTH: LOGICAL_WIDTH * SCALE,
    WORLD_DEPTH: LOGICAL_HEIGHT * SCALE,

    toWorldX: function(gx) {
      return ((gx || 0) - CENTER_X) * SCALE;
    },

    toWorldZ: function(gy) {
      return ((gy || 0) - CENTER_Y) * SCALE;
    },

    toGameX: function(wx) {
      return (wx || 0) * INV_SCALE + CENTER_X;
    },

    toGameY: function(wz) {
      return (wz || 0) * INV_SCALE + CENTER_Y;
    },

    yawFromAngle2D: function(angle) {
      return Math.PI * 0.5 - (angle || 0);
    },

    angle2DFromYaw: function(yaw) {
      return Math.PI * 0.5 - (yaw || 0);
    },

    getTerrainHeight: function(gx, gy) {
      if (TD.activeScene3D && typeof TD.activeScene3D.getTerrainHeight === 'function') {
        return TD.activeScene3D.getTerrainHeight(gx, gy);
      }
      return 0;
    },

    toWorld: function(gx, gy, extraY, out) {
      const wx = ((gx || 0) - CENTER_X) * SCALE;
      const wz = ((gy || 0) - CENTER_Y) * SCALE;
      const wy = WorldCoords.getTerrainHeight(gx, gy) + (extraY || 0);
      if (out) {
        out.x = wx;
        out.y = wy;
        out.z = wz;
        return out;
      }
      const THREE = typeof window !== 'undefined' ? window.THREE : null;
      return THREE ? new THREE.Vector3(wx, wy, wz) : { x: wx, y: wy, z: wz };
    },

    toGame: function(wx, wz, out) {
      const gx = (wx || 0) * INV_SCALE + CENTER_X;
      const gy = (wz || 0) * INV_SCALE + CENTER_Y;
      if (out) {
        out.x = gx;
        out.y = gy;
        return out;
      }
      return { x: gx, y: gy };
    }
  };

  TD.WorldCoords = WorldCoords;

  /* =========================================================================
   * 2. Seamless Periodic Noise & Shared Procedural PBR Textures
   * ========================================================================= */

  function hashPeriodic2i(ix, iy, px, py, seed) {
    const wx = ((ix % px) + px) % px;
    const wy = ((iy % py) + py) % py;
    let h = Math.imul(wx, 374761393) + Math.imul(wy, 668265263) + Math.imul(seed | 0, 1442695041);
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function periodicNoise2D(u, v, periodX, periodY, seed) {
    const x = u * periodX;
    const y = v * periodY;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const n00 = hashPeriodic2i(ix, iy, periodX, periodY, seed);
    const n10 = hashPeriodic2i(ix + 1, iy, periodX, periodY, seed);
    const n01 = hashPeriodic2i(ix, iy + 1, periodX, periodY, seed);
    const n11 = hashPeriodic2i(ix + 1, iy + 1, periodX, periodY, seed);
    const nx0 = n00 + (n10 - n00) * ux;
    const nx1 = n01 + (n11 - n01) * ux;
    return nx0 + (nx1 - nx0) * uy;
  }

  function periodicFbm(u, v, basePeriod, octaves, seed) {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    let p = basePeriod;
    for (let i = 0; i < octaves; i++) {
      sum += amp * periodicNoise2D(u, v, p, p, seed + i * 131);
      norm += amp;
      amp *= 0.5;
      p *= 2;
    }
    return sum / (norm || 1);
  }

  /**
   * Tileable Worley cellular distance (F1 & F2-F1 edge metric) for cobblestones & fractured obsidian.
   */
  function periodicWorley(u, v, cells, jitter, seed) {
    const x = u * cells;
    const y = v * cells;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let d1 = 1e9;
    let d2 = 1e9;
    let cellHash = 0;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx;
        const cy = iy + dy;
        const jx = hashPeriodic2i(cx, cy, cells, cells, seed + 17);
        const jy = hashPeriodic2i(cx, cy, cells, cells, seed + 53);
        const px = cx + 0.5 + (jx - 0.5) * jitter;
        const py = cy + 0.5 + (jy - 0.5) * jitter;
        const distSq = (x - px) * (x - px) + (y - py) * (y - py);
        if (distSq < d1) {
          d2 = d1;
          d1 = distSq;
          cellHash = hashPeriodic2i(cx, cy, cells, cells, seed + 99);
        } else if (distSq < d2) {
          d2 = distSq;
        }
      }
    }
    const f1 = Math.sqrt(d1);
    const f2 = Math.sqrt(d2);
    return { f1: f1, f2: f2, edge: f2 - f1, id: cellHash };
  }

  const TEXTURE_ALIASES = {
    cobblestone: 'cobblestone',
    weatheredcobblestone: 'cobblestone',
    road: 'cobblestone',
    flagstone: 'cobblestone',
    paving: 'cobblestone',

    ashlar: 'ashlar',
    castlestone: 'ashlar',
    castleashlarstone: 'ashlar',
    stone: 'ashlar',
    ivorystone: 'ashlar',
    masonry: 'ashlar',
    wall: 'ashlar',

    cliff: 'cliff',
    mossycliffrock: 'cliff',
    rock: 'cliff',
    crag: 'cliff',
    slate: 'cliff',

    forestturf: 'forestTurf',
    darkforestturf: 'forestTurf',
    grass: 'forestTurf',
    turf: 'forestTurf',
    moss: 'forestTurf',

    pelennorearth: 'pelennorEarth',
    scorchedearth: 'pelennorEarth',
    scorchedpelennorearth: 'pelennorEarth',
    mud: 'pelennorEarth',
    dirt: 'pelennorEarth',
    earth: 'pelennorEarth',

    volcanic: 'volcanic',
    obsidian: 'volcanic',
    volcanicobsidian: 'volcanic',
    magma: 'volcanic',
    lava: 'volcanic',
    basalt: 'volcanic',

    timber: 'timber',
    wood: 'timber',
    oak: 'timber',
    planks: 'timber',

    iron: 'iron',
    brushediron: 'iron',
    steel: 'iron',
    darkiron: 'iron',
    metal: 'iron',

    gold: 'gold',
    tarnishedgold: 'gold',
    bronze: 'gold',
    brass: 'gold'
  };

  function resolveTextureKey(name) {
    if (!name) return 'ashlar';
    const clean = String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
    return TEXTURE_ALIASES[clean] || 'ashlar';
  }

  function makeCanvas(size) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    return c;
  }

  function wrapCanvasTexture(canvas, isSRGB, repeatX, repeatY) {
    const THREE = typeof window !== 'undefined' ? window.THREE : null;
    if (!THREE || !canvas) return null;
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    if (isSRGB && THREE.SRGBColorSpace) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.anisotropy = 4;
    if (repeatX || repeatY) {
      tex.repeat.set(repeatX || 1, repeatY || repeatX || 1);
    }
    tex.needsUpdate = true;
    return tex;
  }

  function buildPBRCanvases(kind, size) {
    const colorCanvas = makeCanvas(size);
    const bumpCanvas = makeCanvas(size);
    const roughCanvas = makeCanvas(size);
    const emissiveCanvas = kind === 'volcanic' ? makeCanvas(size) : null;
    if (!colorCanvas) return null;

    const cCtx = colorCanvas.getContext('2d');
    const bCtx = bumpCanvas.getContext('2d');
    const rCtx = roughCanvas.getContext('2d');
    const eCtx = emissiveCanvas ? emissiveCanvas.getContext('2d') : null;

    const cImg = cCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const eImg = eCtx ? eCtx.createImageData(size, size) : null;

    const cd = cImg.data;
    const bd = bImg.data;
    const rd = rImg.data;
    const ed = eImg ? eImg.data : null;

    const inv = 1 / size;

    for (let y = 0; y < size; y++) {
      const v = y * inv;
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        const idx = (y * size + x) * 4;

        let cr = 128, cg = 128, cb = 128;
        let height = 0.5;
        let rough = 0.78;
        let er = 0, eg = 0, eb = 0;

        const grain = periodicFbm(u, v, 16, 4, 701);
        const micro = periodicNoise2D(u, v, 64, 64, 919);

        if (kind === 'cobblestone') {
          const cell = periodicWorley(u, v, 10, 0.82, 101);
          const mortarMask = clamp((0.11 - cell.edge) / 0.11, 0, 1);
          const crown = clamp(1.0 - cell.f1 * 1.45, 0, 1);
          const tone = 0.82 + (cell.id - 0.5) * 0.28 + (grain - 0.5) * 0.22;
          const warm = (cell.id - 0.5) * 18;
          if (mortarMask > 0.45) {
            const m = 0.46 + grain * 0.2;
            cr = 62 * m;
            cg = 60 * m + 4;
            cb = 54 * m;
            height = 0.14 + grain * 0.12;
            rough = 0.95;
          } else {
            const bevel = 1.0 - mortarMask * 1.6;
            cr = (126 + warm) * tone * (0.86 + crown * 0.22);
            cg = (121 + warm * 0.6) * tone * (0.86 + crown * 0.21);
            cb = (112 - warm * 0.3) * tone * (0.86 + crown * 0.19);
            height = clamp(0.32 + crown * 0.52 * bevel + (micro - 0.5) * 0.12, 0, 1);
            rough = clamp(0.84 - crown * 0.24 + (grain - 0.5) * 0.14, 0.42, 0.96);
          }
        } else if (kind === 'ashlar') {
          const rows = 8;
          const cols = 4;
          const rowF = v * rows;
          const rowIdx = Math.floor(rowF);
          const rowFrac = rowF - rowIdx;
          const stagger = (rowIdx & 1) ? 0.5 : 0.0;
          const colF = (u + stagger / cols) * cols;
          const colIdx = Math.floor(colF);
          const colFrac = colF - colIdx;

          const blockId = hashPeriodic2i(colIdx, rowIdx, cols, rows, 313);
          const warp = (grain - 0.5) * 0.028;
          const edgeV = Math.min(rowFrac, 1 - rowFrac) + warp;
          const edgeU = Math.min(colFrac, 1 - colFrac) * 2.1 + warp;
          const joint = clamp((0.055 - Math.min(edgeU, edgeV)) / 0.055, 0, 1);
          const chisel = periodicNoise2D(u, v, 48, 16, 409) * 0.1;
          const soot = clamp(periodicFbm(u, v, 6, 3, 521) - 0.52, 0, 0.48);

          const base = (150 + (blockId - 0.5) * 32) * (0.88 + grain * 0.24) * (1 - soot * 0.38);
          cr = base * (1 - joint * 0.48) + chisel * 18;
          cg = (base - 3) * (1 - joint * 0.48) + chisel * 16;
          cb = (base - 9) * (1 - joint * 0.45) + chisel * 14;
          height = clamp((1 - joint * 0.78) * (0.62 + grain * 0.26 + chisel * 0.6), 0.06, 1);
          rough = clamp(0.76 + joint * 0.2 + (grain - 0.5) * 0.16, 0.52, 0.98);
        } else if (kind === 'cliff') {
          const strata = periodicFbm(u * 0.8 + v * 0.35, v * 1.4, 8, 4, 211);
          const cell = periodicWorley(u, v, 7, 0.9, 277);
          const mossMask = clamp((periodicFbm(u, v, 6, 3, 293) - 0.54) * 3.1, 0, 1) * (1 - cell.edge * 0.4);
          const rockVal = 66 + strata * 68 + cell.edge * 34 + (micro - 0.5) * 16;

          cr = lerp(rockVal * 0.96, 46 + grain * 26, mossMask);
          cg = lerp(rockVal * 0.99, 76 + grain * 38, mossMask);
          cb = lerp(rockVal * 1.03, 40 + grain * 18, mossMask);
          height = clamp(0.2 + strata * 0.52 + cell.edge * 0.34 + (micro - 0.5) * 0.08, 0, 1);
          rough = clamp(0.88 - cell.edge * 0.16 + mossMask * 0.08, 0.58, 0.98);
        } else if (kind === 'forestTurf') {
          const patch = periodicFbm(u, v, 6, 4, 607);
          const blades = periodicNoise2D(u, v, 48, 48, 641);
          const loamMask = clamp((0.42 - patch) * 2.8, 0, 1);
          const clover = clamp((blades - 0.65) * 2.4, 0, 1);

          cr = lerp(42 + patch * 34 + clover * 16, 62 + grain * 24, loamMask);
          cg = lerp(68 + patch * 52 + clover * 26, 52 + grain * 20, loamMask);
          cb = lerp(34 + patch * 22 + clover * 10, 36 + grain * 14, loamMask);
          height = clamp(0.35 + blades * 0.38 + (grain - 0.5) * 0.24, 0, 1);
          rough = clamp(0.88 + (grain - 0.5) * 0.1, 0.72, 0.98);
        } else if (kind === 'pelennorEarth') {
          const turf = periodicFbm(u, v, 7, 4, 733);
          const scorch = clamp((periodicFbm(u, v, 5, 3, 761) - 0.58) * 3.2, 0, 1);
          const grassDry = clamp((turf - 0.44) * 2.4, 0, 1) * (1 - scorch);

          cr = lerp(94 + grain * 34, 98 + micro * 28, grassDry) * (1 - scorch * 0.55);
          cg = lerp(78 + grain * 28, 96 + micro * 30, grassDry) * (1 - scorch * 0.58);
          cb = lerp(56 + grain * 20, 52 + micro * 16, grassDry) * (1 - scorch * 0.52);
          height = clamp(0.32 + turf * 0.42 + (micro - 0.5) * 0.2, 0, 1);
          rough = clamp(0.86 + scorch * 0.1 - (1 - grassDry) * 0.08, 0.65, 0.98);
        } else if (kind === 'volcanic') {
          const cell = periodicWorley(u, v, 6, 0.92, 809);
          const crack = clamp((0.085 - cell.edge) / 0.085, 0, 1);
          const subCrack = clamp((0.04 - Math.abs(grain - 0.5)) / 0.04, 0, 1) * 0.45;
          const magma = clamp(crack + subCrack * (1 - crack), 0, 1);
          const obsidian = 26 + cell.edge * 34 + (micro - 0.5) * 12;

          cr = lerp(obsidian, 255, magma);
          cg = lerp(obsidian * 0.98, 118 + magma * 85, magma);
          cb = lerp(obsidian * 1.08, 18 + magma * 24, magma);
          height = clamp((1 - magma) * (0.45 + cell.edge * 0.45 + (micro - 0.5) * 0.1), 0.04, 1);
          rough = clamp(lerp(0.36 + grain * 0.22, 0.65, magma), 0.24, 0.88);
          if (ed) {
            const glow = magma * magma;
            er = clamp(glow * 255 * 1.15, 0, 255);
            eg = clamp(glow * 132, 0, 255);
            eb = clamp(glow * 22, 0, 255);
          }
        } else if (kind === 'timber') {
          const planks = 6;
          const pF = v * planks;
          const pIdx = Math.floor(pF);
          const pFrac = pF - pIdx;
          const pHash = hashPeriodic2i(0, pIdx, 1, planks, 907);
          const seam = clamp((0.035 - Math.min(pFrac, 1 - pFrac)) / 0.035, 0, 1);
          const rings = Math.sin((v * 26 + periodicFbm(u, v, 4, 3, 929) * 3.4) * Math.PI * 2) * 0.5 + 0.5;
          const streak = periodicNoise2D(u, v, 8, 64, 947);
          const woodTone = (0.76 + pHash * 0.3) * (0.82 + rings * 0.22 + streak * 0.14) * (1 - seam * 0.62);

          cr = 116 * woodTone;
          cg = 78 * woodTone;
          cb = 46 * woodTone;
          height = clamp((1 - seam * 0.8) * (0.48 + rings * 0.26 + streak * 0.22), 0.05, 1);
          rough = clamp(0.74 + (1 - rings) * 0.16 + seam * 0.15, 0.55, 0.95);
        } else if (kind === 'iron') {
          const brush = periodicNoise2D(u, v, 12, 96, 971);
          const hammer = periodicWorley(u, v, 12, 0.75, 983);
          const scratch = clamp((0.025 - Math.abs(periodicFbm(u, v, 10, 2, 991) - 0.5)) / 0.025, 0, 1);
          const val = (68 + brush * 26 + hammer.f1 * 22 + scratch * 28) * (0.9 + grain * 0.2);

          cr = val * 0.96;
          cg = val * 0.99;
          cb = val * 1.06;
          height = clamp(0.45 + brush * 0.25 + hammer.f1 * 0.2 + scratch * 0.18, 0, 1);
          rough = clamp(0.42 + (1 - brush) * 0.22 - scratch * 0.12, 0.25, 0.72);
        } else if (kind === 'gold') {
          const patina = periodicFbm(u, v, 8, 4, 1013);
          const filigree = periodicWorley(u, v, 14, 0.65, 1031);
          const tarnish = clamp((0.46 - patina) * 2.2, 0, 1);
          const sheen = 0.84 + patina * 0.28 + (1 - filigree.f1) * 0.14;

          cr = lerp(218 * sheen, 118, tarnish * 0.55);
          cg = lerp(176 * sheen, 92, tarnish * 0.58);
          cb = lerp(84 * sheen, 44, tarnish * 0.6);
          height = clamp(0.5 + (1 - filigree.f1) * 0.3 + (micro - 0.5) * 0.16, 0, 1);
          rough = clamp(0.28 + tarnish * 0.36 + (micro - 0.5) * 0.1, 0.18, 0.72);
        }

        cd[idx] = clamp(cr | 0, 0, 255);
        cd[idx + 1] = clamp(cg | 0, 0, 255);
        cd[idx + 2] = clamp(cb | 0, 0, 255);
        cd[idx + 3] = 255;

        const bv = clamp((height * 255) | 0, 0, 255);
        bd[idx] = bv;
        bd[idx + 1] = bv;
        bd[idx + 2] = bv;
        bd[idx + 3] = 255;

        const rv = clamp((rough * 255) | 0, 0, 255);
        rd[idx] = rv;
        rd[idx + 1] = rv;
        rd[idx + 2] = rv;
        rd[idx + 3] = 255;

        if (ed) {
          ed[idx] = er | 0;
          ed[idx + 1] = eg | 0;
          ed[idx + 2] = eb | 0;
          ed[idx + 3] = 255;
        }
      }
    }

    cCtx.putImageData(cImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    if (eCtx && eImg) eCtx.putImageData(eImg, 0, 0);

    return {
      colorCanvas: colorCanvas,
      bumpCanvas: bumpCanvas,
      roughCanvas: roughCanvas,
      emissiveCanvas: emissiveCanvas
    };
  }

  const _canvasCache = {};
  const _baseSetCache = {};
  const _repeatSetCache = {};

  const MATERIAL_DEFAULTS = {
    cobblestone: { bumpScale: 0.22, roughness: 0.88, metalness: 0.04 },
    ashlar: { bumpScale: 0.18, roughness: 0.82, metalness: 0.05 },
    cliff: { bumpScale: 0.32, roughness: 0.9, metalness: 0.03 },
    forestTurf: { bumpScale: 0.16, roughness: 0.92, metalness: 0.02 },
    pelennorEarth: { bumpScale: 0.18, roughness: 0.9, metalness: 0.02 },
    volcanic: { bumpScale: 0.28, roughness: 0.58, metalness: 0.16, emissive: 0xff5a00, emissiveIntensity: 0.95 },
    timber: { bumpScale: 0.14, roughness: 0.8, metalness: 0.04 },
    iron: { bumpScale: 0.1, roughness: 0.44, metalness: 0.82 },
    gold: { bumpScale: 0.1, roughness: 0.34, metalness: 0.88 }
  };

  const ProceduralTextures = {
    SIZE: 512,

    getCanvases: function(name) {
      const key = resolveTextureKey(name);
      if (!_canvasCache[key]) {
        _canvasCache[key] = buildPBRCanvases(key, ProceduralTextures.SIZE);
      }
      return _canvasCache[key];
    },

    get: function(name, repeatX, repeatY) {
      const key = resolveTextureKey(name);
      const rx = (typeof repeatX === 'object' && repeatX !== null) ? (repeatX.repeatX || repeatX.rx || 1) : (repeatX || 1);
      const ry = (typeof repeatX === 'object' && repeatX !== null) ? (repeatX.repeatY || repeatX.ry || rx) : (repeatY || rx);

      if (rx === 1 && ry === 1 && _baseSetCache[key]) {
        return _baseSetCache[key];
      }

      const rKey = key + ':' + rx.toFixed(3) + 'x' + ry.toFixed(3);
      if (_repeatSetCache[rKey]) {
        return _repeatSetCache[rKey];
      }

      const raw = ProceduralTextures.getCanvases(key);
      if (!raw) return { map: null, bumpMap: null, roughnessMap: null, emissiveMap: null };

      const set = {
        key: key,
        map: wrapCanvasTexture(raw.colorCanvas, true, rx, ry),
        bumpMap: wrapCanvasTexture(raw.bumpCanvas, false, rx, ry),
        roughnessMap: wrapCanvasTexture(raw.roughCanvas, false, rx, ry),
        emissiveMap: raw.emissiveCanvas ? wrapCanvasTexture(raw.emissiveCanvas, true, rx, ry) : null
      };

      if (rx === 1 && ry === 1) {
        _baseSetCache[key] = set;
      }
      _repeatSetCache[rKey] = set;
      return set;
    },

    getSet: function(name, repeatX, repeatY) {
      return ProceduralTextures.get(name, repeatX, repeatY);
    },

    createMaterial: function(name, overrides) {
      const THREE = typeof window !== 'undefined' ? window.THREE : null;
      if (!THREE) return null;
      const key = resolveTextureKey(name);
      const opts = overrides || {};
      const rx = opts.repeatX || (opts.repeat && opts.repeat[0]) || 1;
      const ry = opts.repeatY || (opts.repeat && opts.repeat[1]) || rx;
      const set = ProceduralTextures.get(key, rx, ry);
      const defs = MATERIAL_DEFAULTS[key] || MATERIAL_DEFAULTS.ashlar;

      const params = {
        map: set.map,
        bumpMap: set.bumpMap,
        bumpScale: opts.bumpScale !== undefined ? opts.bumpScale : defs.bumpScale,
        roughnessMap: set.roughnessMap,
        roughness: opts.roughness !== undefined ? opts.roughness : defs.roughness,
        metalness: opts.metalness !== undefined ? opts.metalness : defs.metalness
      };
      if (set.emissiveMap && opts.useEmissive !== false) {
        params.emissiveMap = set.emissiveMap;
        params.emissive = new THREE.Color(opts.emissive !== undefined ? opts.emissive : defs.emissive);
        params.emissiveIntensity = opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : defs.emissiveIntensity;
      }
      for (const k of Object.keys(opts)) {
        if (k === 'repeat' || k === 'repeatX' || k === 'repeatY' || k === 'useEmissive') continue;
        params[k] = opts[k];
      }
      return new THREE.MeshStandardMaterial(params);
    },

    cobblestone: function(rx, ry) { return ProceduralTextures.get('cobblestone', rx, ry); },
    ashlar: function(rx, ry) { return ProceduralTextures.get('ashlar', rx, ry); },
    cliff: function(rx, ry) { return ProceduralTextures.get('cliff', rx, ry); },
    forestTurf: function(rx, ry) { return ProceduralTextures.get('forestTurf', rx, ry); },
    pelennorEarth: function(rx, ry) { return ProceduralTextures.get('pelennorEarth', rx, ry); },
    volcanic: function(rx, ry) { return ProceduralTextures.get('volcanic', rx, ry); },
    timber: function(rx, ry) { return ProceduralTextures.get('timber', rx, ry); },
    iron: function(rx, ry) { return ProceduralTextures.get('iron', rx, ry); },
    gold: function(rx, ry) { return ProceduralTextures.get('gold', rx, ry); },

    prewarmAll: function() {
      const keys = ['cobblestone', 'ashlar', 'cliff', 'forestTurf', 'pelennorEarth', 'volcanic', 'timber', 'iron', 'gold'];
      for (let i = 0; i < keys.length; i++) {
        ProceduralTextures.get(keys[i], 1, 1);
      }
    }
  };

  TD.ProceduralTextures = ProceduralTextures;

  /* =========================================================================
   * 3. Terrain-Hugging 3D Tactical Disc / Ring Builder Helpers
   * ========================================================================= */

  function createConformingDiscMesh(THREE, radialSegments, radialRings, fillColor, fillOpacity) {
    const segs = radialSegments || 64;
    const rings = radialRings || 5;
    // True annular polar ring grid (rings + 1 concentric loops, zero center fan over innerR deadzones!)
    const vertCount = (rings + 1) * segs;
    const positions = new Float32Array(vertCount * 3);
    const indices = [];

    for (let r = 0; r < rings; r++) {
      const base0 = r * segs;
      const base1 = (r + 1) * segs;
      for (let s = 0; s < segs; s++) {
        const next = (s + 1) % segs;
        indices.push(base0 + s, base0 + next, base1 + s);
        indices.push(base0 + next, base1 + next, base1 + s);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setIndex(indices);

    const mat = new THREE.MeshBasicMaterial({
      color: fillColor,
      transparent: true,
      opacity: fillOpacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 14;
    mesh.frustumCulled = false;
    mesh.userData._segs = segs;
    mesh.userData._rings = rings;
    return mesh;
  }

  function updateConformingDiscGeometry(mesh, scene3d, cx, cz, innerR, outerR, liftY) {
    const pos = mesh.geometry.attributes.position;
    const arr = pos.array;
    const segs = mesh.userData._segs;
    const rings = mesh.userData._rings;

    let ptr = 0;
    for (let r = 0; r <= rings; r++) {
      const frac = r / rings;
      const rad = lerp(innerR, outerR, frac);
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * TWO_PI;
        const wx = cx + Math.cos(a) * rad;
        const wz = cz + Math.sin(a) * rad;
        const wy = Math.max(0, scene3d.getTerrainHeightWorld(wx, wz)) + liftY;
        arr[ptr++] = wx;
        arr[ptr++] = wy;
        arr[ptr++] = wz;
      }
    }
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
  }

  function createConformingRibbonRing(THREE, radialSegments, color, opacity, additive) {
    const segs = radialSegments || 80;
    const vertCount = (segs + 1) * 2;
    const positions = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const indices = [];

    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      uvs[s * 4] = u;
      uvs[s * 4 + 1] = 0;
      uvs[s * 4 + 2] = u;
      uvs[s * 4 + 3] = 1;
    }
    for (let s = 0; s < segs; s++) {
      const i0 = s * 2;
      const i1 = i0 + 1;
      const i2 = i0 + 2;
      const i3 = i0 + 3;
      indices.push(i0, i2, i1, i2, i3, i1);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geom.setIndex(indices);

    const mat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 16;
    mesh.frustumCulled = false;
    mesh.userData._segs = segs;
    return mesh;
  }

  function updateConformingRibbonGeometry(mesh, scene3d, cx, cz, radius, thickness, liftY, dashCount, phase) {
    const pos = mesh.geometry.attributes.position;
    const arr = pos.array;
    const segs = mesh.userData._segs;
    const rIn = Math.max(0.05, radius - thickness * 0.5);
    const rOut = radius + thickness * 0.5;

    let ptr = 0;
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * TWO_PI;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      let pinch = 1;
      if (dashCount > 0) {
        const w = Math.sin(a * dashCount + (phase || 0));
        pinch = w > -0.15 ? 1 : 0.04;
      }
      const midR = radius;
      const ri = midR - (midR - rIn) * pinch;
      const ro = midR + (rOut - midR) * pinch;

      const x0 = cx + cos * ri;
      const z0 = cz + sin * ri;
      const y0 = Math.max(0, scene3d.getTerrainHeightWorld(x0, z0)) + liftY;

      const x1 = cx + cos * ro;
      const z1 = cz + sin * ro;
      const y1 = Math.max(0, scene3d.getTerrainHeightWorld(x1, z1)) + liftY;

      arr[ptr++] = x0;
      arr[ptr++] = y0;
      arr[ptr++] = z0;
      arr[ptr++] = x1;
      arr[ptr++] = y1;
      arr[ptr++] = z1;
    }
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
  }

  /* =========================================================================
   * 4. TD.Scene3D — WebGL2 Renderer, Bloom Post-Processing, Diorama Camera,
   *    3D Raycasting & Tactical Overlays
   * ========================================================================= */

  class Scene3D {
    constructor(game, options) {
      this.game = game || null;
      this.options = options || {};
      this.isReady = false;
      this.contextLost = false;
      this.usePostProcessing = false;

      this.viewportWidth = LOGICAL_WIDTH;
      this.viewportHeight = LOGICAL_HEIGHT;
      this.pixelRatio = 1;

      this.textures = ProceduralTextures;

      // Linked peer 3D subsystems
      this.env3d = null;
      this.models3d = null;
      this.vfx3d = null;
      this.terrainMesh = null;

      // Camera spherical rig state (matching the reference image diorama framing & top sky/fortress horizon)
      this.baseFov = 38;
      this.baseDistance = 109;
      this.basePitch = (34.2 * Math.PI) / 180;
      this.baseYaw = (-6.8 * Math.PI) / 180;
      this.baseTarget = { x: 0, y: 2.3, z: -3.7 };

      this.zoom = 1.0;
      this.targetZoom = 1.0;
      this.minZoom = 0.82;
      this.maxZoom = 1.25;

      this.panX = 0;
      this.panZ = 0;
      this.targetPanX = 0;
      this.targetPanZ = 0;
      this.orbitBlend = 1.0; // 1 on title screen, smoothly eases to 0 in siege

      // Pan drag tracking
      this._panDragging = false;
      this._panButton = -1;
      this._panStartX = 0;
      this._panStartY = 0;
      this._panOriginX = 0;
      this._panOriginZ = 0;
      this.didRightDrag = false;

      const THREE = typeof window !== 'undefined' ? window.THREE : null;
      if (!THREE || typeof document === 'undefined') {
        return;
      }

      TD.activeScene3D = this;
      this._initSceneGraph(THREE);
      this._initRendererAndComposer(THREE);
      this._initDefaultLighting(THREE);
      this._initHitVolumes(THREE);
      this._initTacticalMeshes(THREE);
    }

    _initSceneGraph(THREE) {
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x11161e);
      this.scene.fog = new THREE.FogExp2(0x1b232e, 0.0042);

      this.camera = new THREE.PerspectiveCamera(this.baseFov, 16 / 9, 1.0, 950);

      // Clean layered scene groups so peers can attach either to named groups or directly to scene
      this.worldGroup = new THREE.Group();
      this.worldGroup.name = 'worldGroup';
      this.rootGroup = this.worldGroup;

      this.envGroup = new THREE.Group();
      this.envGroup.name = 'envGroup';
      this.mapGroup = this.envGroup;
      this.terrainGroup = this.envGroup;

      this.padsGroup = new THREE.Group();
      this.padsGroup.name = 'padsGroup';

      this.modelsGroup = new THREE.Group();
      this.modelsGroup.name = 'modelsGroup';
      this.unitsGroup = this.modelsGroup;
      this.entitiesGroup = this.modelsGroup;
      this.towersGroup = this.modelsGroup;
      this.enemiesGroup = this.modelsGroup;

      this.vfxGroup = new THREE.Group();
      this.vfxGroup.name = 'vfxGroup';
      this.effectsGroup = this.vfxGroup;
      this.particlesGroup = this.vfxGroup;

      this.tacticalGroup = new THREE.Group();
      this.tacticalGroup.name = 'tacticalGroup';

      this.hitVolumeGroup = new THREE.Group();
      this.hitVolumeGroup.name = 'hitVolumeGroup';

      this.defaultLightsGroup = new THREE.Group();
      this.defaultLightsGroup.name = 'defaultLightsGroup';

      this.scene.add(this.envGroup);
      this.scene.add(this.padsGroup);
      this.scene.add(this.modelsGroup);
      this.scene.add(this.tacticalGroup);
      this.scene.add(this.vfxGroup);
      this.scene.add(this.worldGroup);
      this.scene.add(this.defaultLightsGroup);
      // Note: hitVolumeGroup stays off-scene (updated directly for Raycaster) so it adds zero render traversal overhead

      // Reusable raycasting & math scratch objects (zero per-event allocation)
      this.raycaster = new THREE.Raycaster();
      this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      this._ndc = new THREE.Vector2();
      this._projVec = new THREE.Vector3();
      this._hitVec = new THREE.Vector3();
      this._camTargetVec = new THREE.Vector3();
      this.cameraTarget = this._camTargetVec;
      this.panTarget = this._camTargetVec;

      this._applyCameraTransform(0, 0, 0);
    }

    _initRendererAndComposer(THREE) {
      let canvas = this.options.canvas || document.getElementById('webgl-canvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'webgl-canvas';
        const stage = document.getElementById('game-stage') || document.body;
        stage.insertBefore(canvas, stage.firstChild);
      }
      this.domElement = canvas;
      this.canvas = canvas;

      try {
        this.renderer = new THREE.WebGLRenderer({
          canvas: canvas,
          antialias: true,
          alpha: false,
          stencil: false,
          powerPreference: 'high-performance'
        });
      } catch (err) {
        console.warn('[Scene3D] WebGLRenderer creation failed:', err);
        this.isReady = false;
        return;
      }

      const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
      this.pixelRatio = dpr;
      this.renderer.setPixelRatio(dpr);
      if (THREE.SRGBColorSpace) {
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      }
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      // Preserve full-frame 3D scene triangle/drawcall stats across multi-pass EffectComposer!
      if (this.renderer.info) {
        this.renderer.info.autoReset = false;
      }

      const stage = document.getElementById('game-stage');
      const initW = Math.max(320, (stage && stage.clientWidth) || (typeof window !== 'undefined' && window.innerWidth) || LOGICAL_WIDTH);
      const initH = Math.max(240, (stage && stage.clientHeight) || (typeof window !== 'undefined' && window.innerHeight) || LOGICAL_HEIGHT);
      this.viewportWidth = initW;
      this.viewportHeight = initH;
      this.renderer.setSize(initW, initH, false);

      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.contextLost = true;
      });
      canvas.addEventListener('webglcontextrestored', () => {
        this.contextLost = false;
      });

      // Post-processing: EffectComposer + RenderPass + UnrealBloomPass + OutputPass
      this.composer = null;
      this.renderPass = null;
      this.bloomPass = null;
      this.outputPass = null;

      if (THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass && THREE.OutputPass) {
        try {
          const caps = this.renderer.capabilities || {};
          const maxSamples = caps.isWebGL2 ? Math.min(4, caps.maxSamples || 0) : 0;
          const rt = new THREE.WebGLRenderTarget(
            Math.max(1, Math.floor(initW * dpr)),
            Math.max(1, Math.floor(initH * dpr)),
            {
              type: THREE.HalfFloatType,
              samples: maxSamples
            }
          );
          const composer = new THREE.EffectComposer(this.renderer, rt);
          const renderPass = new THREE.RenderPass(this.scene, this.camera);
          const bloomPass = new THREE.UnrealBloomPass(
            new THREE.Vector2(initW, initH),
            0.36, // strength
            0.32, // radius
            0.95  // threshold: blooms high-HDR projectiles/lightning/lava without blowing out stone/pads
          );
          const outputPass = new THREE.OutputPass();

          composer.addPass(renderPass);
          composer.addPass(bloomPass);
          composer.addPass(outputPass);

          this.composer = composer;
          this.renderPass = renderPass;
          this.bloomPass = bloomPass;
          this.outputPass = outputPass;
          this.usePostProcessing = true;
        } catch (err) {
          console.warn('[Scene3D] Post-processing unavailable, using direct WebGL render fallback:', err);
          this.usePostProcessing = false;
        }
      }

      this.isReady = true;
      this.resize(initW, initH);
    }

    _initDefaultLighting(THREE) {
      this.hemiLight = new THREE.HemisphereLight(0x9dc4e8, 0x342c22, 0.95);
      this.hemiLight.position.set(0, 60, 0);
      this.defaultLightsGroup.add(this.hemiLight);

      this.ambientLight = new THREE.AmbientLight(0x3a4354, 0.45);
      this.defaultLightsGroup.add(this.ambientLight);

      // Dramatic golden-storm key light from upper back-right horizon (matching reference image!)
      this.sunLight = new THREE.DirectionalLight(0xffe1ad, 2.35);
      this.sunLight.position.set(36, 58, -44);
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.set(2048, 2048);
      this.sunLight.shadow.camera.near = 8;
      this.sunLight.shadow.camera.far = 210;
      this.sunLight.shadow.camera.left = -76;
      this.sunLight.shadow.camera.right = 76;
      this.sunLight.shadow.camera.top = 58;
      this.sunLight.shadow.camera.bottom = -58;
      this.sunLight.shadow.bias = -0.00045;
      this.sunLight.shadow.normalBias = 0.025;
      this.defaultLightsGroup.add(this.sunLight);
      this.defaultLightsGroup.add(this.sunLight.target);
      this.sunLight.target.position.set(0, 0, 0);

      // Cool slate valley rim light from foreground-left to sculpt stone relief
      this.rimLight = new THREE.DirectionalLight(0x7ca9d9, 0.65);
      this.rimLight.position.set(-52, 34, 48);
      this.defaultLightsGroup.add(this.rimLight);
    }

    /**
     * Automatically yields to Environment3D's stage-specific DirectionalLight if Environment3D
     * adds its own sun light, preventing double-exposure while guaranteeing rich default lighting.
     */
    _reconcileLighting() {
      if (!this.scene || !this.defaultLightsGroup) return;
      let externalDirLights = 0;
      this.scene.traverse((obj) => {
        if (obj.isDirectionalLight && obj !== this.sunLight && obj !== this.rimLight) {
          externalDirLights++;
        }
      });
      this.defaultLightsGroup.visible = externalDirLights === 0;
    }

    _initHitVolumes(THREE) {
      // Invisible zero-fragment-cost 3D hit-volumes for pixel-accurate pad & tower picking
      this._hitMat = new THREE.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
        depthTest: false,
        transparent: true,
        opacity: 0
      });
      this._padHitGeom = new THREE.CylinderGeometry(2.75, 2.9, 1.8, 16);
      this._towerHitGeom = new THREE.CylinderGeometry(2.45, 2.85, 5.6, 16);
      this._cursedTowerHitGeom = new THREE.CylinderGeometry(3.2, 3.35, 6.2, 16);

      this._padHitMeshes = [];
      this._towerHitMeshes = [];
    }

    _syncHitVolumes(game) {
      const THREE = window.THREE;
      if (!THREE || !game) return;

      const pads = (game.map && game.map.pads) ? game.map.pads : [];
      while (this._padHitMeshes.length < pads.length) {
        const m = new THREE.Mesh(this._padHitGeom, this._hitMat);
        this.hitVolumeGroup.add(m);
        this._padHitMeshes.push(m);
      }
      for (let i = 0; i < this._padHitMeshes.length; i++) {
        const m = this._padHitMeshes[i];
        if (i < pads.length) {
          const p = pads[i];
          const wy = this.getTerrainHeight(p.x, p.y);
          m.visible = true;
          m.position.set(WorldCoords.toWorldX(p.x), wy + 0.75, WorldCoords.toWorldZ(p.y));
          m.userData.pad = p;
          m.userData.padId = p.id;
        } else {
          m.visible = false;
          m.userData.pad = null;
        }
      }

      const towers = (game.towers && Array.isArray(game.towers.towers)) ? game.towers.towers : [];
      while (this._towerHitMeshes.length < towers.length) {
        const m = new THREE.Mesh(this._towerHitGeom, this._hitMat);
        this.hitVolumeGroup.add(m);
        this._towerHitMeshes.push(m);
      }
      for (let i = 0; i < this._towerHitMeshes.length; i++) {
        const m = this._towerHitMeshes[i];
        if (i < towers.length) {
          const t = towers[i];
          const isCursed = !!(t.curseClicksRemaining > 0 || t.isCursed);
          if (m.geometry !== (isCursed ? this._cursedTowerHitGeom : this._towerHitGeom)) {
            m.geometry = isCursed ? this._cursedTowerHitGeom : this._towerHitGeom;
          }
          const wy = this.getTerrainHeight(t.x, t.y);
          m.visible = true;
          m.position.set(WorldCoords.toWorldX(t.x), wy + 2.6, WorldCoords.toWorldZ(t.y));
          m.userData.tower = t;
          m.userData.towerId = t.id;
        } else {
          m.visible = false;
          m.userData.tower = null;
        }
      }
      this.hitVolumeGroup.updateMatrixWorld(true);
    }

    _initTacticalMeshes(THREE) {
      // 1. Primary range disc & outer rim (delicate linear-space fill + crisp non-blooming rim)
      this._mainRangeDisc = createConformingDiscMesh(THREE, 72, 5, 0x4fc3f7, 0.026);
      this._mainRangeRim = createConformingRibbonRing(THREE, 88, 0x6be0ff, 0.72, false);
      this._mainRangeDisc.visible = false;
      this._mainRangeRim.visible = false;
      this.tacticalGroup.add(this._mainRangeDisc, this._mainRangeRim);

      // 2. Deadzone inner minRange ring (dashed amber-crimson)
      this._deadzoneDisc = createConformingDiscMesh(THREE, 56, 3, 0xef5350, 0.018);
      this._deadzoneRim = createConformingRibbonRing(THREE, 72, 0xff8a65, 0.68, false);
      this._deadzoneDisc.visible = false;
      this._deadzoneRim.visible = false;
      this.tacticalGroup.add(this._deadzoneDisc, this._deadzoneRim);

      // 3. Upgrade yellow preview range ring (dashed gold)
      this._upgradeDisc = createConformingDiscMesh(THREE, 72, 4, 0xffd54f, 0.022);
      this._upgradeRim = createConformingRibbonRing(THREE, 88, 0xffe082, 0.75, false);
      this._upgradeDisc.visible = false;
      this._upgradeRim.visible = false;
      this.tacticalGroup.add(this._upgradeDisc, this._upgradeRim);

      // 4. Pad hover & Selected pad/tower base halos
      this._hoverPadRing = createConformingRibbonRing(THREE, 48, 0xe8d595, 0.62, false);
      this._selectBaseRing = createConformingRibbonRing(THREE, 56, 0x8be0ff, 0.76, false);
      this._hoverPadRing.visible = false;
      this._selectBaseRing.visible = false;
      this.tacticalGroup.add(this._hoverPadRing, this._selectBaseRing);

      // 5. Garrison Rally Flag, Ground Ring & Tether Line
      this._rallyGroup = new THREE.Group();
      this._rallyGroup.visible = false;
      this._rallySpotRing = createConformingRibbonRing(THREE, 40, 0x66bb6a, 0.75, false);
      this.tacticalGroup.add(this._rallySpotRing);

      const poleMat = new THREE.MeshStandardMaterial({ color: 0xd4af5a, roughness: 0.35, metalness: 0.82 });
      const bannerMat = new THREE.MeshStandardMaterial({
        color: 0x2e7d32,
        emissive: 0x4caf50,
        emissiveIntensity: 0.55,
        roughness: 0.5,
        side: THREE.DoubleSide
      });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.5, 8), poleMat);
      pole.position.y = 1.25;
      const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), poleMat);
      finial.position.y = 2.6;
      const pennant = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.72, 6, 2), bannerMat);
      pennant.position.set(0.62, 2.1, 0);
      this._rallyPennant = pennant;
      this._rallyPennantBasePos = pennant.geometry.attributes.position.array.slice();
      this._rallyGroup.add(pole, finial, pennant);
      this.tacticalGroup.add(this._rallyGroup);

      const tetherPositions = new Float32Array(24 * 3);
      const tetherGeom = new THREE.BufferGeometry();
      tetherGeom.setAttribute('position', new THREE.BufferAttribute(tetherPositions, 3));
      this._rallyTether = new THREE.LineSegments(
        tetherGeom,
        new THREE.LineBasicMaterial({ color: 0x81c784, transparent: true, opacity: 0.85 })
      );
      this._rallyTether.visible = false;
      this._rallyTether.frustumCulled = false;
      this.tacticalGroup.add(this._rallyTether);

      // 6. Light of Eärendil 3D Celestial Star Reticle
      this._lightReticleGroup = new THREE.Group();
      this._lightReticleGroup.visible = false;
      this._lightOuterDisc = createConformingDiscMesh(THREE, 64, 4, 0x8be0ff, 0.032);
      this._lightOuterRim = createConformingRibbonRing(THREE, 80, 0xb3f0ff, 0.78, false);
      this._lightInnerRim = createConformingRibbonRing(THREE, 64, 0xe1f8ff, 0.65, false);
      this.tacticalGroup.add(this._lightOuterDisc, this._lightOuterRim, this._lightInnerRim);

      const starMat = new THREE.MeshBasicMaterial({
        color: 0xdff8ff,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      this._lightStarGlyph = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const ray = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.24), starMat);
        ray.rotation.x = -Math.PI * 0.5;
        ray.rotation.z = (i * Math.PI) / 4;
        this._lightStarGlyph.add(ray);
      }
      const pillarMat = new THREE.MeshBasicMaterial({
        color: 0x9be7ff,
        transparent: true,
        opacity: 0.045,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      this._lightPreviewShaft = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.6, 16, 20, 1, true), pillarMat);
      this._lightPreviewShaft.position.y = 8;
      this._lightReticleGroup.add(this._lightStarGlyph, this._lightPreviewShaft);
      this.tacticalGroup.add(this._lightReticleGroup);

      // 7. Great Eagles 3D Sweeping Golden Lane Corridor
      this._eaglesReticleGroup = new THREE.Group();
      this._eaglesReticleGroup.visible = false;
      const eagleFillMat = new THREE.MeshBasicMaterial({
        color: 0xffd54f,
        transparent: true,
        opacity: 0.03,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const eagleEdgeMat = new THREE.MeshBasicMaterial({
        color: 0xffe082,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      this._eaglesCorridorMesh = new THREE.Mesh(new THREE.PlaneGeometry(52, 19, 26, 8), eagleFillMat);
      this._eaglesCorridorMesh.rotation.x = -Math.PI * 0.5;
      this._eaglesBorderLines = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-26, 0.16, -9.5),
          new THREE.Vector3(26, 0.16, -9.5),
          new THREE.Vector3(26, 0.16, 9.5),
          new THREE.Vector3(-26, 0.16, 9.5)
        ]),
        new THREE.LineBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.92 })
      );
      this._eagleChevrons = [];
      for (let i = 0; i < 3; i++) {
        const chev = new THREE.Group();
        const wingL = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.42), eagleEdgeMat);
        wingL.rotation.x = -Math.PI * 0.5;
        wingL.rotation.z = 0.52;
        wingL.position.set(0, 0.22, -1.25);
        const wingR = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.42), eagleEdgeMat);
        wingR.rotation.x = -Math.PI * 0.5;
        wingR.rotation.z = -0.52;
        wingR.position.set(0, 0.22, 1.25);
        chev.add(wingL, wingR);
        this._eagleChevrons.push(chev);
        this._eaglesReticleGroup.add(chev);
      }
      this._eaglesReticleGroup.add(this._eaglesCorridorMesh, this._eaglesBorderLines);
      this.tacticalGroup.add(this._eaglesReticleGroup);
    }

    /* =====================================================================
     * Coordinate & Terrain Height Helpers
     * ===================================================================== */

    getTerrainHeight(gx, gy) {
      if (this.env3d && typeof this.env3d.getTerrainHeight === 'function') {
        const h = this.env3d.getTerrainHeight(gx, gy);
        return Number.isFinite(h) ? h : 0;
      }
      return 0;
    }

    getTerrainHeightWorld(wx, wz) {
      if (this.env3d) {
        if (typeof this.env3d.getWorldHeight === 'function') {
          const h = this.env3d.getWorldHeight(wx, wz);
          if (Number.isFinite(h)) return h;
        }
        if (typeof this.env3d.getTerrainHeight === 'function') {
          const h = this.env3d.getTerrainHeight(wx * INV_SCALE + CENTER_X, wz * INV_SCALE + CENTER_Y);
          if (Number.isFinite(h)) return h;
        }
      }
      return 0;
    }

    yawFromAngle2D(angle) {
      return Math.PI * 0.5 - (angle || 0);
    }

    toWorld(gx, gy, extraY, out) {
      const wx = ((gx || 0) - CENTER_X) * SCALE;
      const wz = ((gy || 0) - CENTER_Y) * SCALE;
      const wy = this.getTerrainHeight(gx, gy) + (extraY || 0);
      if (out) {
        out.x = wx;
        out.y = wy;
        out.z = wz;
        return out;
      }
      const THREE = window.THREE;
      return THREE ? new THREE.Vector3(wx, wy, wz) : { x: wx, y: wy, z: wz };
    }

    toGame(wx, wz, out) {
      return WorldCoords.toGame(wx, wz, out);
    }

    /**
     * Projects logical game (gx, gy) + extraY world height into stage viewport pixels.
     */
    projectToScreen(gx, gy, extraY) {
      if (!this.camera) {
        const fx = ((gx || 0) / LOGICAL_WIDTH) * this.viewportWidth;
        const fy = ((gy || 0) / LOGICAL_HEIGHT) * this.viewportHeight;
        return {
          x: fx,
          y: fy,
          z: 0,
          visible: true,
          leftPct: ((gx || 0) / LOGICAL_WIDTH) * 100,
          topPct: ((gy || 0) / LOGICAL_HEIGHT) * 100
        };
      }
      const wx = ((gx || 0) - CENTER_X) * SCALE;
      const wz = ((gy || 0) - CENTER_Y) * SCALE;
      const wy = this.getTerrainHeight(gx, gy) + (extraY || 0);
      return this.projectWorldToScreen(wx, wy, wz);
    }

    projectWorldToScreen(wx, wy, wz) {
      const w = Math.max(1, this.viewportWidth);
      const h = Math.max(1, this.viewportHeight);
      if (!this.camera) {
        return { x: w * 0.5, y: h * 0.5, z: 0, visible: false, leftPct: 50, topPct: 50 };
      }
      this._projVec.set(wx, wy, wz).project(this.camera);
      const visible = this._projVec.z >= -1.0 && this._projVec.z <= 1.02;
      const x = (this._projVec.x * 0.5 + 0.5) * w;
      const y = (-this._projVec.y * 0.5 + 0.5) * h;
      return {
        x: x,
        y: y,
        z: this._projVec.z,
        visible: visible,
        leftPct: (x / w) * 100,
        topPct: (y / h) * 100
      };
    }

    /**
     * Raycasts client pointer coordinates against 3D tower/pad hit volumes AND the 3D terrain/ground plane.
     * Returns { x, y, pad, tower, worldPoint }.
     */
    raycastGamePos(clientX, clientY, game) {
      const activeGame = game || this.game;
      if (!this.camera || !this.domElement || !this.raycaster) {
        return { x: CENTER_X, y: CENTER_Y, pad: null, tower: null, worldPoint: null };
      }

      const rect = this.domElement.getBoundingClientRect();
      const rw = rect.width > 0 ? rect.width : this.viewportWidth;
      const rh = rect.height > 0 ? rect.height : this.viewportHeight;

      this._ndc.set(
        ((clientX - rect.left) / rw) * 2 - 1,
        -((clientY - rect.top) / rh) * 2 + 1
      );
      this.raycaster.setFromCamera(this._ndc, this.camera);

      // Sync hit volumes to latest pad/tower positions
      if (activeGame) {
        this._syncHitVolumes(activeGame);
      }

      // 1. Ground / Terrain raycast for accurate (gx, gy) world surface coordinates
      let groundWX = 0;
      let groundWY = 0;
      let groundWZ = 0;
      let hasGroundHit = false;

      const terrainMesh = this.terrainMesh || (this.env3d && (this.env3d.terrainMesh || this.env3d.terrain));
      if (terrainMesh && terrainMesh.visible !== false) {
        const tHits = this.raycaster.intersectObject(terrainMesh, false);
        if (tHits.length > 0) {
          groundWX = tHits[0].point.x;
          groundWY = tHits[0].point.y;
          groundWZ = tHits[0].point.z;
          hasGroundHit = true;
        }
      }

      if (!hasGroundHit) {
        const planeHit = this.raycaster.ray.intersectPlane(this.groundPlane, this._hitVec);
        if (planeHit) {
          groundWX = planeHit.x;
          groundWY = planeHit.y;
          groundWZ = planeHit.z;
          hasGroundHit = true;
        }
      }

      let gx = clamp(groundWX * INV_SCALE + CENTER_X, -80, LOGICAL_WIDTH + 80);
      let gy = clamp(groundWZ * INV_SCALE + CENTER_Y, -80, LOGICAL_HEIGHT + 80);

      // 2. Check 3D Tower & Pad hit volumes (plus any tagged meshes in modelsGroup/padsGroup)
      let hitTower = null;
      let hitPad = null;

      if (activeGame && (activeGame.state === 'playing' || activeGame.state === 'paused')) {
        const towerHits = this.raycaster.intersectObjects(this._towerHitMeshes, false);
        for (let i = 0; i < towerHits.length; i++) {
          const t = towerHits[i].object.userData.tower;
          if (t) {
            hitTower = t;
            break;
          }
        }

        // Also check tagged model meshes if models3d attached userData.tower / userData.towerId / userData.isTower
        if (!hitTower && this.modelsGroup.children.length > 0) {
          const mHits = this.raycaster.intersectObjects(this.modelsGroup.children, true);
          for (let i = 0; i < mHits.length; i++) {
            let cur = mHits[i].object;
            while (cur && cur !== this.scene) {
              if (cur.userData) {
                if (cur.userData.tower) {
                  hitTower = cur.userData.tower;
                  break;
                }
                if ((cur.userData.isTower || cur.userData.towerId !== undefined) && cur.userData.towerId !== null && activeGame.towers && Array.isArray(activeGame.towers.towers)) {
                  hitTower = activeGame.towers.towers.find((tw) => tw.id === cur.userData.towerId) || null;
                  if (hitTower) break;
                }
              }
              cur = cur.parent;
            }
            if (hitTower) break;
          }
        }

        const padHits = this.raycaster.intersectObjects(this._padHitMeshes, false);
        for (let i = 0; i < padHits.length; i++) {
          const p = padHits[i].object.userData.pad;
          if (p) {
            hitPad = p;
            break;
          }
        }

        if (!hitPad && activeGame.findPadAt) {
          hitPad = activeGame.findPadAt(gx, gy, 30);
        }

        // If a tower is on hitPad, resolve occupant seamlessly
        if (!hitTower && hitPad && activeGame.towers && activeGame.towers.getTowerOnPad) {
          hitTower = activeGame.towers.getTowerOnPad(hitPad.id) || null;
        }

        // When NOT placing a ground-targeted spell or rally point (or if tower is Boss-cursed!),
        // snap logical (x, y) to the hit 3D tower/pad center so clicking upper tower spires works 100%!
        const isCursedTower = !!(hitTower && (hitTower.curseClicksRemaining > 0 || hitTower.isCursed));
        const groundTargeting = !!(activeGame.activeSpell || activeGame.rallyTower);
        if (isCursedTower || (!groundTargeting && hitTower)) {
          gx = hitTower.x;
          gy = hitTower.y;
        } else if (!groundTargeting && hitPad) {
          gx = hitPad.x;
          gy = hitPad.y;
        }
      }

      return {
        x: gx,
        y: gy,
        pad: hitPad,
        tower: hitTower,
        worldPoint: { x: groundWX, y: groundWY, z: groundWZ }
      };
    }

    /* =====================================================================
     * Map Loading & Leak-Free Disposal Glue
     * ===================================================================== */

    loadMap(mapId, mapData) {
      if (!this.env3d) return;
      if (typeof this.env3d.dispose === 'function') {
        this.env3d.dispose();
      }
      this.terrainMesh = null;
      if (typeof this.env3d.buildMap === 'function') {
        this.env3d.buildMap(mapId, mapData);
      }
      if (this.env3d.terrainMesh || this.env3d.terrain) {
        this.terrainMesh = this.env3d.terrainMesh || this.env3d.terrain;
      } else {
        // Auto-discover terrain mesh if tagged in envGroup/scene
        this.scene.traverse((obj) => {
          if (!this.terrainMesh && obj.isMesh && (obj.name === 'terrain' || (obj.userData && obj.userData.isTerrain))) {
            this.terrainMesh = obj;
          }
        });
      }
      this._reconcileLighting();
      // Reset camera pan on fresh map load
      this.panX = 0;
      this.panZ = 0;
      this.targetPanX = 0;
      this.targetPanZ = 0;
    }

    /* =====================================================================
     * Camera Controls (Zoom, Gentle Pan, Title Cinematic Orbit, Shake)
     * ===================================================================== */

    onWheel(e) {
      if (!e) return;
      const delta = clamp(e.deltaY || 0, -160, 160);
      this.targetZoom = clamp(this.targetZoom * (1 + delta * 0.00085), this.minZoom, this.maxZoom);
    }

    onPointerDown(e) {
      if (!e) return;
      if (e.button === 1 || e.button === 2) {
        this._panDragging = true;
        this._panButton = e.button;
        this._panStartX = e.clientX;
        this._panStartY = e.clientY;
        this._panOriginX = this.targetPanX;
        this._panOriginZ = this.targetPanZ;
        if (e.button === 2) {
          this.didRightDrag = false;
        }
      }
    }

    onPointerMove(e) {
      if (!this._panDragging || !e) return;
      const dx = e.clientX - this._panStartX;
      const dy = e.clientY - this._panStartY;
      if (this._panButton === 2 && Math.hypot(dx, dy) > 5) {
        this.didRightDrag = true;
      }
      if (this._panButton === 1 || this.didRightDrag) {
        const panScale = 0.065 * this.zoom;
        this.targetPanX = clamp(this._panOriginX - dx * panScale, -20, 20);
        this.targetPanZ = clamp(this._panOriginZ - dy * panScale, -14, 14);
      }
    }

    onPointerUp() {
      this._panDragging = false;
      this._panButton = -1;
    }

    resetCameraView() {
      this.targetZoom = 1.0;
      this.targetPanX = 0;
      this.targetPanZ = 0;
    }

    panToGamePos(gx, gy) {
      const wx = WorldCoords.toWorldX(gx);
      const wz = WorldCoords.toWorldZ(gy);
      this.targetPanX = clamp(wx * 0.42, -20, 20);
      this.targetPanZ = clamp(wz * 0.42, -14, 14);
    }

    _applyCameraTransform(time, shakeX, shakeY) {
      if (!this.camera) return;

      const aspect = Math.max(0.5, this.viewportWidth / Math.max(1, this.viewportHeight));
      const baseAspect = 16 / 9;
      // Automatically pull back on narrower aspect ratios (e.g. 16:10 MacBooks) so [-64..+64] never clips
      const aspectScale = aspect < baseAspect ? (baseAspect / aspect) * 0.95 + 0.05 : 1.0;

      const orbit = this.orbitBlend;
      const siegeDist = this.baseDistance * this.zoom * aspectScale;
      const titleDist = 101 * aspectScale;
      const dist = lerp(siegeDist, titleDist, orbit);

      const titleYaw = this.baseYaw + Math.sin(time * 0.17) * 0.15;
      const titlePitch = ((30.8 + Math.cos(time * 0.13) * 2.0) * Math.PI) / 180;

      const yaw = lerp(this.baseYaw, titleYaw, orbit);
      const pitch = lerp(this.basePitch, titlePitch, orbit);

      const tx = lerp(this.baseTarget.x + this.panX, 2.6, orbit) + shakeX;
      const ty = lerp(this.baseTarget.y, 3.8, orbit) + shakeY * 0.6;
      const tz = lerp(this.baseTarget.z + this.panZ, -4.8, orbit);

      const horiz = Math.cos(pitch) * dist;
      const cx = tx + Math.sin(yaw) * horiz;
      const cy = ty + Math.sin(pitch) * dist;
      const cz = tz + Math.cos(yaw) * horiz;

      this.camera.position.set(cx, cy, cz);
      this._camTargetVec.set(tx, ty, tz);
      this.camera.lookAt(this._camTargetVec);
      this.camera.updateMatrixWorld();
    }

    updateCamera(dt, time, game) {
      const safeDt = clamp(dt || 0.016, 0, 0.1);
      const smooth = 1 - Math.exp(-safeDt * 10);
      this.zoom = lerp(this.zoom, this.targetZoom, smooth);
      this.panX = lerp(this.panX, this.targetPanX, smooth);
      this.panZ = lerp(this.panZ, this.targetPanZ, smooth);

      const isTitle = !!(game && game.state === 'title');
      const targetOrbit = isTitle ? 1.0 : 0.0;
      this.orbitBlend = lerp(this.orbitBlend, targetOrbit, 1 - Math.exp(-safeDt * 3.2));

      let shakeX = 0;
      let shakeY = 0;
      if (game && game.shakeTimer > 0 && game.shakeDuration > 0) {
        const mag = game.shakeIntensity * (game.shakeTimer / game.shakeDuration) * 0.085;
        shakeX = Math.sin(time * 57.3) * mag;
        shakeY = Math.cos(time * 43.7) * mag;
      }

      this._applyCameraTransform(time, shakeX, shakeY);
    }

    /* =====================================================================
     * 3D Tactical Overlays (Range Rings, Deadzone, Reticles, Rally Flag)
     * ===================================================================== */

    updateTacticalOverlays(game, time) {
      if (!this._mainRangeDisc || !game) return;

      const active = game.state === 'playing' || game.state === 'paused';
      this._mainRangeDisc.visible = false;
      this._mainRangeRim.visible = false;
      this._deadzoneDisc.visible = false;
      this._deadzoneRim.visible = false;
      this._upgradeDisc.visible = false;
      this._upgradeRim.visible = false;
      this._hoverPadRing.visible = false;
      this._selectBaseRing.visible = false;
      this._rallyGroup.visible = false;
      this._rallySpotRing.visible = false;
      this._rallyTether.visible = false;
      this._lightReticleGroup.visible = false;
      this._lightOuterDisc.visible = false;
      this._lightOuterRim.visible = false;
      this._lightInnerRim.visible = false;
      this._eaglesReticleGroup.visible = false;

      if (!active) return;

      // 1. Pad Hover Highlight (empty pad)
      if (game.hoveredPad && game.hoveredPad !== game.selectedPad) {
        const occupied = game.towers && game.towers.getTowerOnPad && game.towers.getTowerOnPad(game.hoveredPad.id);
        if (!occupied) {
          const hx = WorldCoords.toWorldX(game.hoveredPad.x);
          const hz = WorldCoords.toWorldZ(game.hoveredPad.y);
          const hr = ((game.hoveredPad.radius || 24) + 4) * SCALE;
          this._hoverPadRing.visible = true;
          updateConformingRibbonGeometry(this._hoverPadRing, this, hx, hz, hr, 0.22, 0.11, 0, 0);
        }
      }

      // 2. Selected Empty Pad Halo
      if (game.selectedPad && !game.selectedTower) {
        const sx = WorldCoords.toWorldX(game.selectedPad.x);
        const sz = WorldCoords.toWorldZ(game.selectedPad.y);
        const sr = ((game.selectedPad.radius || 24) + 5) * SCALE;
        this._selectBaseRing.visible = true;
        this._selectBaseRing.material.color.setHex(0xf5d77f);
        updateConformingRibbonGeometry(this._selectBaseRing, this, sx, sz, sr, 0.26, 0.12, 10, -time * 3.0);
      }

      // 3. Build Range Preview (Green valid / Red unaffordable + inner minRange deadzone)
      if (game.previewRange && game.previewRange.mode === 'build') {
        const px = game.selectedPad ? game.selectedPad.x : game.previewRange.x;
        const py = game.selectedPad ? game.selectedPad.y : game.previewRange.y;
        const wx = WorldCoords.toWorldX(px);
        const wz = WorldCoords.toWorldZ(py);
        const rWorld = game.previewRange.range * SCALE;
        const minRWorld = (game.previewRange.minRange || 0) * SCALE;
        const valid = !!game.previewRange.valid;

        this._mainRangeDisc.visible = true;
        this._mainRangeRim.visible = true;
        this._mainRangeDisc.material.color.setHex(valid ? 0x4cc366 : 0xef5350);
        this._mainRangeDisc.material.opacity = 0.028;
        this._mainRangeRim.material.color.setHex(valid ? 0x6ae887 : 0xf06565);
        updateConformingDiscGeometry(this._mainRangeDisc, this, wx, wz, minRWorld, rWorld, 0.09);
        updateConformingRibbonGeometry(this._mainRangeRim, this, wx, wz, rWorld, 0.25, 0.12, 0, 0);

        if (minRWorld > 0.1) {
          this._deadzoneDisc.visible = true;
          this._deadzoneRim.visible = true;
          updateConformingDiscGeometry(this._deadzoneDisc, this, wx, wz, 0, minRWorld, 0.095);
          updateConformingRibbonGeometry(this._deadzoneRim, this, wx, wz, minRWorld, 0.2, 0.13, 14, time * 2.2);
        }
      }

      // 4. Selected Built Tower Range (Blue) + Upgrade Hover Preview (Yellow)
      if (game.selectedTower && !game.rallyTower) {
        const tw = game.selectedTower;
        const wx = WorldCoords.toWorldX(tw.x);
        const wz = WorldCoords.toWorldZ(tw.y);
        const rWorld = (tw.range || 0) * SCALE;
        const minRWorld = (tw.minRange || 0) * SCALE;

        this._selectBaseRing.visible = true;
        this._selectBaseRing.material.color.setHex(0x8be0ff);
        updateConformingRibbonGeometry(this._selectBaseRing, this, wx, wz, 2.75, 0.24, 0.12, 8, -time * 2.4);

        if (rWorld > 0.1) {
          this._mainRangeDisc.visible = true;
          this._mainRangeRim.visible = true;
          this._mainRangeDisc.material.color.setHex(0x4fc3f7);
          this._mainRangeDisc.material.opacity = 0.024;
          this._mainRangeRim.material.color.setHex(0x63d6f5);
          updateConformingDiscGeometry(this._mainRangeDisc, this, wx, wz, minRWorld, rWorld, 0.085);
          updateConformingRibbonGeometry(this._mainRangeRim, this, wx, wz, rWorld, 0.24, 0.115, 0, 0);
        }

        if (minRWorld > 0.1) {
          this._deadzoneDisc.visible = true;
          this._deadzoneRim.visible = true;
          updateConformingDiscGeometry(this._deadzoneDisc, this, wx, wz, 0, minRWorld, 0.09);
          updateConformingRibbonGeometry(this._deadzoneRim, this, wx, wz, minRWorld, 0.2, 0.125, 14, time * 2.0);
        }

        if (game.previewRange && game.previewRange.mode === 'upgrade' && game.previewRange.range > 0) {
          const upR = game.previewRange.range * SCALE;
          this._upgradeDisc.visible = true;
          this._upgradeRim.visible = true;
          updateConformingDiscGeometry(this._upgradeDisc, this, wx, wz, Math.min(rWorld, upR), upR, 0.10);
          updateConformingRibbonGeometry(this._upgradeRim, this, wx, wz, upR, 0.26, 0.14, 18, -time * 3.2);
        }

        // Subtle rally banner display when a Garrison keep is selected
        if (tw.type === 'garrison' && tw.rallyPoint) {
          this._showRallyIndicator(tw.x, tw.y, tw.rallyPoint.x, tw.rallyPoint.y, time, false);
        }
      }

      // 5. Active Garrison Rally Placement Mode (Green boundary + clamped cursor banner)
      if (game.rallyTower) {
        const rt = game.rallyTower;
        const tx = rt.x;
        const ty = rt.y;
        const maxR = rt.range || 160;
        const wx = WorldCoords.toWorldX(tx);
        const wz = WorldCoords.toWorldZ(ty);

        this._mainRangeDisc.visible = true;
        this._mainRangeRim.visible = true;
        this._mainRangeDisc.material.color.setHex(0x4cc366);
        this._mainRangeDisc.material.opacity = 0.026;
        this._mainRangeRim.material.color.setHex(0x6ae887);
        updateConformingDiscGeometry(this._mainRangeDisc, this, wx, wz, 0, maxR * SCALE, 0.09);
        updateConformingRibbonGeometry(this._mainRangeRim, this, wx, wz, maxR * SCALE, 0.28, 0.12, 16, -time * 2.5);

        const dx = game.pointerX - tx;
        const dy = game.pointerY - ty;
        const dist = Math.hypot(dx, dy);
        const rx = dist > maxR && dist > 0 ? tx + (dx / dist) * maxR : game.pointerX;
        const ry = dist > maxR && dist > 0 ? ty + (dy / dist) * maxR : game.pointerY;
        this._showRallyIndicator(tx, ty, rx, ry, time, true);
      }

      // 6. Player Spell 3D Targeting Reticles
      if (game.activeSpell && game.pointerOnCanvas) {
        const px = WorldCoords.toWorldX(game.pointerX);
        const pz = WorldCoords.toWorldZ(game.pointerY);
        const py = Math.max(0, this.getTerrainHeight(game.pointerX, game.pointerY));

        if (game.activeSpell === 'light' && game.spells && game.spells.light) {
          const rad = (game.spells.light.radius || 150) * SCALE;
          this._lightOuterDisc.visible = true;
          this._lightOuterRim.visible = true;
          this._lightInnerRim.visible = true;
          this._lightReticleGroup.visible = true;

          updateConformingDiscGeometry(this._lightOuterDisc, this, px, pz, 0, rad, 0.10);
          updateConformingRibbonGeometry(this._lightOuterRim, this, px, pz, rad, 0.3, 0.14, 0, 0);
          updateConformingRibbonGeometry(this._lightInnerRim, this, px, pz, rad * 0.72, 0.22, 0.15, 12, time * 2.8);

          this._lightReticleGroup.position.set(px, py + 0.16, pz);
          this._lightStarGlyph.rotation.y = time * 0.85;
        } else if (game.activeSpell === 'eagles' && game.spells && game.spells.eagles) {
          const tangent = game.getNearestPathTangent
            ? game.getNearestPathTangent(game.pointerX, game.pointerY)
            : { angle: 0 };
          this._eaglesReticleGroup.visible = true;
          this._eaglesReticleGroup.position.set(px, py + 0.14, pz);
          // Local +X of corridor aligns with 2D path tangent angle
          this._eaglesReticleGroup.rotation.y = -tangent.angle;

          const sweep = ((time * 18) % 36) - 18;
          for (let i = 0; i < this._eagleChevrons.length; i++) {
            const k = i - 1;
            const ch = this._eagleChevrons[i];
            let cx = k * 14 + sweep;
            if (cx > 23) cx -= 46;
            if (cx < -23) cx += 46;
            ch.position.set(cx, 0.08, k * 2.8);
          }
        }
      }
    }

    _showRallyIndicator(tx, ty, rx, ry, time, pulsing) {
      const twx = WorldCoords.toWorldX(tx);
      const twz = WorldCoords.toWorldZ(ty);
      const rwx = WorldCoords.toWorldX(rx);
      const rwz = WorldCoords.toWorldZ(ry);
      const rwy = Math.max(0, this.getTerrainHeight(rx, ry));

      const pulse = pulsing ? (1 + Math.sin(time * 6.0) * 0.14) : 1.0;
      this._rallySpotRing.visible = true;
      updateConformingRibbonGeometry(this._rallySpotRing, this, rwx, rwz, 1.85 * pulse, 0.24, 0.13, 0, 0);

      this._rallyGroup.visible = true;
      this._rallyGroup.position.set(rwx, rwy, rwz);

      // Animate waving pennant cloth vertices
      const posAttr = this._rallyPennant.geometry.attributes.position;
      const base = this._rallyPennantBasePos;
      const arr = posAttr.array;
      for (let i = 0; i < arr.length; i += 3) {
        const lx = base[i] + 0.625;
        arr[i] = base[i];
        arr[i + 1] = base[i + 1];
        arr[i + 2] = Math.sin(time * 7.5 - lx * 3.4) * 0.14 * lx;
      }
      posAttr.needsUpdate = true;

      // Dashed 3D ground-conforming tether line
      this._rallyTether.visible = true;
      const tPos = this._rallyTether.geometry.attributes.position;
      const tArr = tPos.array;
      const dashSegs = 12;
      for (let s = 0; s < dashSegs; s++) {
        const f0 = (s + 0.12) / dashSegs;
        const f1 = (s + 0.68) / dashSegs;
        const x0 = lerp(twx, rwx, f0);
        const z0 = lerp(twz, rwz, f0);
        const y0 = Math.max(0, this.getTerrainHeightWorld(x0, z0)) + 0.2;
        const x1 = lerp(twx, rwx, f1);
        const z1 = lerp(twz, rwz, f1);
        const y1 = Math.max(0, this.getTerrainHeightWorld(x1, z1)) + 0.2;
        const idx = s * 6;
        tArr[idx] = x0;
        tArr[idx + 1] = y0;
        tArr[idx + 2] = z0;
        tArr[idx + 3] = x1;
        tArr[idx + 4] = y1;
        tArr[idx + 5] = z1;
      }
      tPos.needsUpdate = true;
    }

    /* =====================================================================
     * Resize, Render & Disposal
     * ===================================================================== */

    resize(width, height) {
      if (!this.isReady || !this.renderer || !this.camera) return;
      const w = Math.max(320, Math.floor(width || LOGICAL_WIDTH));
      const h = Math.max(240, Math.floor(height || LOGICAL_HEIGHT));
      const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);

      this.viewportWidth = w;
      this.viewportHeight = h;
      this.pixelRatio = dpr;

      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();

      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(w, h, false);

      if (this.composer && this.usePostProcessing) {
        this.composer.setPixelRatio(dpr);
        this.composer.setSize(w, h);
        if (this.bloomPass && this.bloomPass.resolution) {
          this.bloomPass.resolution.set(w, h);
        }
      }
    }

    render(a, b, c) {
      if (!this.isReady || this.contextLost || !this.renderer || !this.scene || !this.camera) return;

      let activeGame = this.game;
      let dt = 0.016;
      let time = activeGame ? (activeGame.time || 0) : 0;

      // Support both render(dt, time, game) and render(game, dt, time)
      if (a && typeof a === 'object') {
        activeGame = a;
        dt = typeof b === 'number' && Number.isFinite(b) ? b : 0;
        time = typeof c === 'number' && Number.isFinite(c) ? c : (activeGame.time || 0);
      } else {
        if (typeof a === 'number' && Number.isFinite(a)) dt = a;
        if (typeof b === 'number' && Number.isFinite(b)) time = b;
        if (c && typeof c === 'object') activeGame = c;
      }

      this._reconcileLighting();
      this.updateCamera(dt, time, activeGame);

      // Subtle golden exposure boost while The One Ring is worn, and luminous vista lift on Title Screen
      const baseExposure = 1.08;
      const ringBoost = (activeGame && activeGame.ringActive) ? 0.07 : 0;
      const titleBoost = (activeGame && activeGame.state === 'title') ? 0.10 : 0;
      this.renderer.toneMappingExposure = baseExposure + ringBoost + titleBoost;

      if (this.renderer.info) {
        this.renderer.info.reset();
      }

      if (this.usePostProcessing && this.composer) {
        try {
          this.composer.render();
          this.renderer.setRenderTarget(null);
          return;
        } catch (err) {
          console.warn('[Scene3D] EffectComposer render failed, switching to direct WebGL render:', err);
          this.usePostProcessing = false;
        }
      }
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    }

    /* =====================================================================
     * 5. Zero-Extra-Context 3D Portrait, Map Vista & Minimap Relief Studio
     *    Renders into reusable WebGLRenderTargets -> OutputPass (ACES + sRGB)
     *    -> readRenderTargetPixels -> cached 2D canvas (<4ms once, <0.05ms blit)
     * ===================================================================== */

    _ensureStudio() {
      if (this._studio) return this._studio;
      const THREE = typeof window !== 'undefined' ? window.THREE : null;
      if (!THREE || !this.renderer || !this.isReady) return null;

      const studioScene = new THREE.Scene();
      const studioCamera = new THREE.PerspectiveCamera(29, 1, 0.1, 200);
      const studioRoot = new THREE.Group();
      studioRoot.name = 'StudioModelRoot';
      studioScene.add(studioRoot);

      // Heroic 3-point + rim dark-fantasy miniature studio lighting
      const hemi = new THREE.HemisphereLight(0xd8ecff, 0x463524, 1.22);
      hemi.position.set(0, 24, 0);
      studioScene.add(hemi);

      const keyLight = new THREE.DirectionalLight(0xffe1a8, 2.90);
      keyLight.position.set(6.5, 9.8, 7.2);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(512, 512);
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 48;
      keyLight.shadow.camera.left = -8;
      keyLight.shadow.camera.right = 8;
      keyLight.shadow.camera.top = 8;
      keyLight.shadow.camera.bottom = -8;
      keyLight.shadow.bias = -0.0008;
      keyLight.shadow.normalBias = 0.02;
      studioScene.add(keyLight);
      studioScene.add(keyLight.target);

      // Cool Elven starlight/cyan rim light from upper-back-left to carve silhouettes
      const rimLight = new THREE.DirectionalLight(0x7ce4ff, 2.05);
      rimLight.position.set(-7.2, 6.4, -6.8);
      studioScene.add(rimLight);
      studioScene.add(rimLight.target);

      // Warm tarnished-bronze front-left fill light for shadow-side armor/stone relief
      const fillLight = new THREE.DirectionalLight(0xffb978, 0.96);
      fillLight.position.set(-5.8, 2.8, 6.4);
      studioScene.add(fillLight);

      // Crown / spire-tip specular highlight
      const topLight = new THREE.DirectionalLight(0xfff4dc, 0.58);
      topLight.position.set(0.4, 14.0, -1.8);
      studioScene.add(topLight);

      // Carved dark-slate & tarnished-bronze figurine plinth for grounded units/enemies
      const pedGroup = new THREE.Group();
      pedGroup.visible = false;
      pedGroup.userData.skipStudioBounds = true;
      const ashlarSet = ProceduralTextures.get('ashlar', 1, 1);
      const goldSet = ProceduralTextures.get('gold', 1, 1);
      const pedStoneGeo = new THREE.CylinderGeometry(1.0, 1.08, 0.11, 32);
      pedStoneGeo.translate(0, -0.055, 0);
      const pedStoneMat = new THREE.MeshStandardMaterial({
        color: 0x3f4652,
        map: ashlarSet ? ashlarSet.map : null,
        bumpMap: ashlarSet ? ashlarSet.bumpMap : null,
        bumpScale: 0.06,
        roughness: 0.78,
        metalness: 0.14
      });
      const pedStoneMesh = new THREE.Mesh(pedStoneGeo, pedStoneMat);
      pedStoneMesh.receiveShadow = true;
      pedStoneMesh.userData.skipStudioBounds = true;

      const pedRimGeo = new THREE.TorusGeometry(1.01, 0.028, 8, 36);
      pedRimGeo.rotateX(Math.PI * 0.5);
      const pedRimMat = new THREE.MeshStandardMaterial({
        color: 0xc89e4c,
        bumpMap: goldSet ? goldSet.bumpMap : null,
        bumpScale: 0.04,
        roughness: 0.34,
        metalness: 0.84
      });
      const pedRimMesh = new THREE.Mesh(pedRimGeo, pedRimMat);
      pedRimMesh.position.y = -0.015;
      pedRimMesh.userData.skipStudioBounds = true;
      pedGroup.add(pedStoneMesh, pedRimMesh);
      studioScene.add(pedGroup);

      let outputPass = null;
      if (THREE.OutputPass) {
        try {
          outputPass = new THREE.OutputPass();
          outputPass.renderToScreen = false;
        } catch (_err) {
          outputPass = null;
        }
      }

      const vistaCamera = new THREE.PerspectiveCamera(40, 440 / 248, 0.8, 950);
      const orthoCamera = new THREE.OrthographicCamera(-64, 64, 36, -36, 1, 280);

      this._studio = {
        scene: studioScene,
        camera: studioCamera,
        vistaCamera: vistaCamera,
        orthoCamera: orthoCamera,
        root: studioRoot,
        hemi: hemi,
        keyLight: keyLight,
        rimLight: rimLight,
        fillLight: fillLight,
        topLight: topLight,
        pedestal: pedGroup,
        pedGeos: [pedStoneGeo, pedRimGeo],
        pedMats: [pedStoneMat, pedRimMat],
        outputPass: outputPass,
        targetPool: new Map(),    // 'WxH' -> { rtHDR, rtRead, pixelBuf, imgData }
        backdropTexs: new Map(),  // themeKey -> THREE.CanvasTexture
        portraitCache: new Map(), // cacheKey -> HTMLCanvasElement
        mapPreviewCache: new Map(), // mapId -> HTMLCanvasElement
        minimapCache: new Map(),  // cacheKey -> HTMLCanvasElement
        savedClearColor: new THREE.Color(),
        cornerVec: new THREE.Vector3(),
        camRight: new THREE.Vector3(),
        camUp: new THREE.Vector3(),
        camDir: new THREE.Vector3(),
        targetVec: new THREE.Vector3()
      };

      // Pre-warm all studio render targets & backdrop textures once at Studio init
      // so runtime portrait/map renders NEVER increment renderer.info.memory.textures mid-session!
      const allThemes = ['elven', 'garrison', 'dwarven', 'istari', 'mordor', 'morgul', 'udun'];
      for (let i = 0; i < allThemes.length; i++) {
        this._getStudioBackdrop(allThemes[i]);
      }
      this._getStudioTargets(256, 256);
      this._getStudioTargets(384, 256);
      this._getStudioTargets(440, 248);

      return this._studio;
    }

    _getStudioTargets(width, height) {
      const studio = this._ensureStudio();
      if (!studio) return null;
      const THREE = window.THREE;
      const w = Math.max(16, width | 0);
      const h = Math.max(16, height | 0);
      const key = w + 'x' + h;
      let entry = studio.targetPool.get(key);
      if (entry) return entry;

      const caps = this.renderer.capabilities || {};
      const maxSamples = caps.isWebGL2 ? Math.min(4, caps.maxSamples || 0) : 0;
      const useOP = Boolean(studio.outputPass);

      let rtHDR = null;
      if (useOP) {
        rtHDR = new THREE.WebGLRenderTarget(w, h, {
          type: THREE.HalfFloatType,
          format: THREE.RGBAFormat,
          depthBuffer: true,
          stencilBuffer: false,
          samples: maxSamples
        });
      }

      const rtRead = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        depthBuffer: !useOP,
        stencilBuffer: false,
        samples: 0
      });
      if (!useOP && THREE.SRGBColorSpace) {
        rtRead.texture.colorSpace = THREE.SRGBColorSpace;
      }

      const scratchCanvas = document.createElement('canvas');
      scratchCanvas.width = w;
      scratchCanvas.height = h;
      const scratchCtx = scratchCanvas.getContext('2d');
      const imgData = scratchCtx.createImageData(w, h);

      entry = {
        width: w,
        height: h,
        rtHDR: rtHDR,
        rtRead: rtRead,
        pixelBuf: new Uint8Array(w * h * 4),
        imgData: imgData
      };
      studio.targetPool.set(key, entry);
      return entry;
    }

    _getStudioBackdrop(theme) {
      const studio = this._ensureStudio();
      if (!studio) return null;
      const key = theme || 'garrison';
      if (studio.backdropTexs.has(key)) {
        return studio.backdropTexs.get(key);
      }

      const THREE = window.THREE;
      const size = 256;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');

      const palettes = {
        elven:    { inner: '#345849', mid: '#1a2f2b', outer: '#081012', halo: 'rgba(255, 218, 130, 0.28)', glowA: 'rgba(245, 206, 118, 0.26)', glowB: 'rgba(92, 226, 235, 0.22)' },
        garrison: { inner: '#314969', mid: '#18263d', outer: '#080d16', halo: 'rgba(255, 214, 140, 0.24)', glowA: 'rgba(255, 210, 132, 0.24)', glowB: 'rgba(124, 185, 242, 0.20)' },
        dwarven:  { inner: '#563521', mid: '#2b1911', outer: '#0d0807', halo: 'rgba(255, 178, 84, 0.30)',  glowA: 'rgba(255, 164, 72, 0.28)',  glowB: 'rgba(224, 190, 118, 0.18)' },
        istari:   { inner: '#2c4975', mid: '#162744', outer: '#070c18', halo: 'rgba(132, 224, 255, 0.30)', glowA: 'rgba(110, 216, 255, 0.28)', glowB: 'rgba(255, 206, 112, 0.22)' },
        mordor:   { inner: '#42342f', mid: '#221c1d', outer: '#0a090c', halo: 'rgba(255, 166, 96, 0.24)',  glowA: 'rgba(255, 146, 82, 0.22)',  glowB: 'rgba(130, 172, 214, 0.18)' },
        morgul:   { inner: '#294c49', mid: '#15292d', outer: '#070d11', halo: 'rgba(112, 240, 190, 0.25)', glowA: 'rgba(96, 235, 175, 0.24)',  glowB: 'rgba(148, 132, 235, 0.18)' },
        udun:     { inner: '#59291b', mid: '#2c140e', outer: '#0b0607', halo: 'rgba(255, 146, 52, 0.32)',  glowA: 'rgba(255, 132, 42, 0.30)',  glowB: 'rgba(255, 214, 128, 0.18)' }
      };
      const pal = palettes[key] || palettes.garrison;

      // Base painterly radial atmospheric glow
      const baseGrad = ctx.createRadialGradient(size * 0.5, size * 0.46, size * 0.05, size * 0.5, size * 0.5, size * 0.74);
      baseGrad.addColorStop(0.0, pal.inner);
      baseGrad.addColorStop(0.56, pal.mid);
      baseGrad.addColorStop(1.0, pal.outer);
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, size, size);

      // Focused warm amber / arcane center silhouette halo behind the miniature
      const centerHalo = ctx.createRadialGradient(size * 0.5, size * 0.48, 2, size * 0.5, size * 0.48, size * 0.40);
      centerHalo.addColorStop(0.0, pal.halo);
      centerHalo.addColorStop(0.55, 'rgba(255, 220, 160, 0.06)');
      centerHalo.addColorStop(1.0, 'rgba(0,0,0,0)');
      ctx.fillStyle = centerHalo;
      ctx.fillRect(0, 0, size, size);

      // Upper-right warm key-light sunshaft bloom
      const keyGlow = ctx.createRadialGradient(size * 0.76, size * 0.22, 4, size * 0.72, size * 0.26, size * 0.58);
      keyGlow.addColorStop(0.0, pal.glowA);
      keyGlow.addColorStop(1.0, 'rgba(0,0,0,0)');
      ctx.fillStyle = keyGlow;
      ctx.fillRect(0, 0, size, size);

      // Upper-left cool rim-light mist
      const rimGlow = ctx.createRadialGradient(size * 0.20, size * 0.28, 4, size * 0.24, size * 0.30, size * 0.52);
      rimGlow.addColorStop(0.0, pal.glowB);
      rimGlow.addColorStop(1.0, 'rgba(0,0,0,0)');
      ctx.fillStyle = rimGlow;
      ctx.fillRect(0, 0, size, size);

      // Subtle painterly canvas grain & floating dust motes (deterministic)
      for (let i = 0; i < 240; i++) {
        const hx = hashPeriodic2i(i, 3, 256, 256, 401);
        const hy = hashPeriodic2i(i, 11, 256, 256, 401);
        const hr = 0.6 + hashPeriodic2i(i, 19, 256, 256, 401) * 1.4;
        const bright = hashPeriodic2i(i, 29, 256, 256, 401) > 0.45;
        ctx.fillStyle = bright ? 'rgba(255, 236, 196, 0.045)' : 'rgba(6, 8, 12, 0.08)';
        ctx.beginPath();
        ctx.arc(hx * size, hy * size, hr, 0, TWO_PI);
        ctx.fill();
      }

      // Deep dark-fantasy outer corner vignette
      const vig = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.36, size * 0.5, size * 0.5, size * 0.73);
      vig.addColorStop(0.0, 'rgba(0,0,0,0)');
      vig.addColorStop(1.0, 'rgba(3,4,7,0.62)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, size, size);

      const tex = new THREE.CanvasTexture(c);
      if (THREE.SRGBColorSpace) {
        tex.colorSpace = THREE.SRGBColorSpace;
      }
      tex.needsUpdate = true;
      studio.backdropTexs.set(key, tex);
      return tex;
    }

    _renderOffscreenToCanvas(scene, camera, width, height, exposure) {
      const studio = this._ensureStudio();
      if (!studio || !this.renderer || this.contextLost) return null;
      const targets = this._getStudioTargets(width, height);
      if (!targets) return null;

      const THREE = window.THREE;
      const renderer = this.renderer;
      const prevTarget = renderer.getRenderTarget();
      renderer.getClearColor(studio.savedClearColor);
      const prevClearAlpha = renderer.getClearAlpha();
      const prevToneMapping = renderer.toneMapping;
      const prevExposure = renderer.toneMappingExposure;
      const prevAutoClear = renderer.autoClear;
      const prevShadowAuto = renderer.shadowMap.autoUpdate;

      try {
        renderer.autoClear = true;
        renderer.shadowMap.autoUpdate = true;
        renderer.shadowMap.needsUpdate = true;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = exposure !== undefined ? exposure : 1.16;
        renderer.setClearColor(0x0b0e14, 1.0);

        if (studio.outputPass && targets.rtHDR) {
          renderer.setRenderTarget(targets.rtHDR);
          renderer.clear(true, true, false);
          renderer.render(scene, camera);
          studio.outputPass.render(renderer, targets.rtRead, targets.rtHDR);
        } else {
          renderer.setRenderTarget(targets.rtRead);
          renderer.clear(true, true, false);
          renderer.render(scene, camera);
        }

        renderer.readRenderTargetPixels(targets.rtRead, 0, 0, targets.width, targets.height, targets.pixelBuf);
      } catch (err) {
        console.warn('[Scene3D Studio] Offscreen render failed:', err);
        return null;
      } finally {
        renderer.setRenderTarget(prevTarget);
        renderer.setClearColor(studio.savedClearColor, prevClearAlpha);
        renderer.toneMapping = prevToneMapping;
        renderer.toneMappingExposure = prevExposure;
        renderer.autoClear = prevAutoClear;
        renderer.shadowMap.autoUpdate = prevShadowAuto;
      }

      // Flip WebGL bottom-up rows into top-down Canvas2D ImageData
      const w = targets.width;
      const h = targets.height;
      const src = targets.pixelBuf;
      const dst = targets.imgData.data;
      const rowBytes = w * 4;
      for (let y = 0; y < h; y++) {
        const srcOff = (h - 1 - y) * rowBytes;
        const dstOff = y * rowBytes;
        dst.set(src.subarray(srcOff, srcOff + rowBytes), dstOff);
      }

      const outCanvas = document.createElement('canvas');
      outCanvas.width = w;
      outCanvas.height = h;
      const outCtx = outCanvas.getContext('2d');
      outCtx.putImageData(targets.imgData, 0, 0);
      return outCanvas;
    }

    _blitCachedToTarget(cachedCanvas, targetCanvas) {
      if (!cachedCanvas) return false;
      if (!targetCanvas || typeof targetCanvas.getContext !== 'function') {
        return cachedCanvas;
      }
      const tw = Math.max(1, targetCanvas.width || 128);
      const th = Math.max(1, targetCanvas.height || 128);
      const ctx = targetCanvas.getContext('2d');
      if (!ctx) return cachedCanvas;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, tw, th);
      ctx.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in ctx) {
        ctx.imageSmoothingQuality = 'high';
      }
      ctx.drawImage(cachedCanvas, 0, 0, tw, th);
      ctx.restore();
      return cachedCanvas;
    }

    _frameStudioModel(studio, rootObj, kind, key, pitchDeg, azimDeg, aspect, fillFrac) {
      rootObj.updateMatrixWorld(true);

      const cornersWorld = [];
      const localCorners = [
        [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
        [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]
      ];
      const v = studio.cornerVec;
      let worldMinX = Infinity, worldMaxX = -Infinity;
      let worldMinY = Infinity, worldMaxY = -Infinity;
      let worldMinZ = Infinity, worldMaxZ = -Infinity;

      const walk = (node) => {
        if (!node || node.visible === false) return;
        if (node.userData && (node.userData.isTowerHitVolume || node.userData.isHitVolume || node.userData.skipStudioBounds)) {
          return;
        }
        if (node.isMesh && node.geometry) {
          const mat = Array.isArray(node.material) ? node.material[0] : node.material;
          if (mat && mat.visible !== false && mat.colorWrite !== false && !(mat.transparent && mat.opacity <= 0.05)) {
            if (!node.geometry.boundingBox) {
              node.geometry.computeBoundingBox();
            }
            const bb = node.geometry.boundingBox;
            if (bb && !bb.isEmpty()) {
              let mMinY = Infinity;
              let mMaxY = -Infinity;
              const meshPts = [];
              for (let c = 0; c < 8; c++) {
                const lc = localCorners[c];
                v.set(
                  lc[0] ? bb.max.x : bb.min.x,
                  lc[1] ? bb.max.y : bb.min.y,
                  lc[2] ? bb.max.z : bb.min.z
                ).applyMatrix4(node.matrixWorld);
                if (v.y < mMinY) mMinY = v.y;
                if (v.y > mMaxY) mMaxY = v.y;
                meshPts.push(v.x, v.y, v.z);
              }

              // Hide detached road drop-shadow on soaring Fell Beast; skip flat translucent ground aura rings from unit framing
              const isFlatGroundDecal = (kind !== 'tower') &&
                (mMaxY - mMinY) < 0.22 &&
                mMaxY < 0.40 &&
                Boolean(mat.transparent && (!mat.depthWrite || mat.opacity < 0.55));
              if (key === 'fellbeast' && mMaxY < 0.65 && (mMaxY - mMinY) < 0.25) {
                node.visible = false;
              } else if (!isFlatGroundDecal) {
                for (let p = 0; p < meshPts.length; p += 3) {
                  const px = meshPts[p];
                  const py = meshPts[p + 1];
                  const pz = meshPts[p + 2];
                  cornersWorld.push(px, py, pz);
                  if (px < worldMinX) worldMinX = px;
                  if (px > worldMaxX) worldMaxX = px;
                  if (py < worldMinY) worldMinY = py;
                  if (py > worldMaxY) worldMaxY = py;
                  if (pz < worldMinZ) worldMinZ = pz;
                  if (pz > worldMaxZ) worldMaxZ = pz;
                }
              }
            }
          }
        }
        const children = node.children;
        if (children && children.length > 0) {
          for (let i = 0; i < children.length; i++) {
            walk(children[i]);
          }
        }
      };

      walk(rootObj);

      if (cornersWorld.length === 0) {
        cornersWorld.push(-1, 0, -1, 1, 3, 1);
        worldMinX = -1; worldMaxX = 1;
        worldMinY = 0; worldMaxY = 3;
        worldMinZ = -1; worldMaxZ = 1;
      }

      // Position carved stone figurine pedestal under grounded units & enemies
      const showPedestal = (kind !== 'tower') && (key !== 'fellbeast') && worldMinY > -0.8 && worldMinY < 1.2;
      studio.pedestal.visible = showPedestal;
      if (showPedestal) {
        const horizSpan = Math.max(1.1, Math.max(worldMaxX - worldMinX, worldMaxZ - worldMinZ));
        const pedRadius = clamp(horizSpan * 0.46, 0.72, 3.6);
        studio.pedestal.position.set((worldMinX + worldMaxX) * 0.5, Math.min(0, worldMinY), (worldMinZ + worldMaxZ) * 0.5);
        studio.pedestal.scale.set(pedRadius, 1, pedRadius);
        studio.pedestal.updateMatrixWorld(true);
      }

      const pitch = (pitchDeg * Math.PI) / 180;
      const azim = (azimDeg * Math.PI) / 180;
      const cosP = Math.cos(pitch);

      const uCam = studio.camDir.set(Math.sin(azim) * cosP, Math.sin(pitch), Math.cos(azim) * cosP).normalize();
      const R = studio.camRight.set(Math.cos(azim), 0, -Math.sin(azim)).normalize();
      const U = studio.camUp.crossVectors(uCam, R).normalize();

      const count = cornersWorld.length / 3;
      const projR = new Float32Array(count);
      const projU = new Float32Array(count);
      const projW = new Float32Array(count);

      let minR = Infinity, maxR = -Infinity;
      let minU = Infinity, maxU = -Infinity;
      let minW = Infinity, maxW = -Infinity;

      for (let i = 0; i < count; i++) {
        const px = cornersWorld[i * 3];
        const py = cornersWorld[i * 3 + 1];
        const pz = cornersWorld[i * 3 + 2];
        const r = px * R.x + py * R.y + pz * R.z;
        const u = px * U.x + py * U.y + pz * U.z;
        const w = px * uCam.x + py * uCam.y + pz * uCam.z;
        projR[i] = r;
        projU[i] = u;
        projW[i] = w;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (w < minW) minW = w;
        if (w > maxW) maxW = w;
      }

      let midR = 0.5 * (minR + maxR);
      let midU = 0.5 * (minU + maxU);
      const midW = 0.5 * (minW + maxW);

      const cam = studio.camera;
      const tallRatio = (maxU - minU) / Math.max(0.4, maxR - minR);
      const isTallModel = tallRatio > 1.6;
      cam.fov = isTallModel ? 25 : 29;
      cam.aspect = aspect;
      const tanY = Math.tan((cam.fov * Math.PI) / 360);
      const tanX = tanY * aspect;
      const baseFill = clamp(fillFrac || 0.84, 0.55, 0.95);
      const fill = (isTallModel && aspect < 1.22)
        ? Math.max(baseFill, 0.93)
        : baseFill;

      const solveDistance = (cR, cU) => {
        let bestD = 1.5;
        for (let i = 0; i < count; i++) {
          const dr = Math.abs(projR[i] - cR);
          const du = Math.abs(projU[i] - cU);
          const dw = projW[i] - midW;
          const need = dw + Math.max(du / (fill * tanY), dr / (fill * tanX));
          if (need > bestD) bestD = need;
        }
        return bestD;
      };

      let D = solveDistance(midR, midU);

      // Perspective re-centering pass so foreshortened foreground limbs/weapons center symmetrically
      let minNdcX = Infinity, maxNdcX = -Infinity;
      let minNdcY = Infinity, maxNdcY = -Infinity;
      for (let i = 0; i < count; i++) {
        const depth = Math.max(0.25, D - (projW[i] - midW));
        const nx = (projR[i] - midR) / (depth * tanX);
        const ny = (projU[i] - midU) / (depth * tanY);
        if (nx < minNdcX) minNdcX = nx;
        if (nx > maxNdcX) maxNdcX = nx;
        if (ny < minNdcY) minNdcY = ny;
        if (ny > maxNdcY) maxNdcY = ny;
      }
      midR += 0.5 * (minNdcX + maxNdcX) * D * tanX * 0.85;
      midU += 0.5 * (minNdcY + maxNdcY) * D * tanY * 0.85;
      D = solveDistance(midR, midU);

      const target = studio.targetVec.set(
        R.x * midR + U.x * midU + uCam.x * midW,
        R.y * midR + U.y * midU + uCam.y * midW,
        R.z * midR + U.z * midU + uCam.z * midW
      );

      cam.position.set(
        target.x + uCam.x * D,
        target.y + uCam.y * D,
        target.z + uCam.z * D
      );
      cam.near = Math.max(0.08, D - (maxW - midW) - 3.0);
      cam.far = D + (midW - minW) + 32.0;
      cam.updateProjectionMatrix();
      cam.lookAt(target);
      cam.updateMatrixWorld(true);

      // Scale key-light shadow frustum tightly around the framed model
      const span = Math.max(1.8, Math.max(maxR - minR, maxU - minU, maxW - minW) * 0.82);
      studio.keyLight.target.position.copy(target);
      studio.keyLight.position.set(target.x + span * 1.45, target.y + span * 2.15, target.z + span * 1.55);
      studio.keyLight.shadow.camera.left = -span * 1.35;
      studio.keyLight.shadow.camera.right = span * 1.35;
      studio.keyLight.shadow.camera.top = span * 1.35;
      studio.keyLight.shadow.camera.bottom = -span * 1.35;
      studio.keyLight.shadow.camera.near = Math.max(0.2, span * 0.4);
      studio.keyLight.shadow.camera.far = span * 6.0;
      studio.keyLight.shadow.camera.updateProjectionMatrix();
      studio.keyLight.target.updateMatrixWorld(true);

      studio.rimLight.target.position.copy(target);
      studio.rimLight.position.set(target.x - span * 1.6, target.y + span * 1.35, target.z - span * 1.5);
      studio.rimLight.target.updateMatrixWorld(true);
    }

    /**
     * Renders (and caches) a close-up 3D studio portrait onto `targetCanvas`.
     * Supports kind: 'tower' | 'enemy' | 'soldier' | 'unit'.
     */
    renderModelPortrait(targetCanvas, kind, key, opts = {}) {
      const studio = this._ensureStudio();
      if (!studio) return false;

      const options = opts || {};
      const rawKind = String(kind || 'tower').toLowerCase().trim();
      let rawKey = String(key || 'elven').toLowerCase().trim();

      const SOLDIER_KEYS = {
        guard: 'guard_1',
        citadel: 'guard_1',
        citadelguard: 'guard_1',
        guard_1: 'guard_1',
        guard1: 'guard_1',
        guard_2: 'guard_2',
        guard2: 'guard_2',
        phalanx: 'phalanx_3A',
        towerguard: 'phalanx_3A',
        phalanx_3a: 'phalanx_3A',
        knight: 'knight_3B',
        rohirrim: 'knight_3B',
        riddermark: 'knight_3B',
        cavalry: 'knight_3B',
        knight_3b: 'knight_3B'
      };

      let normKind = rawKind;
      if (normKind === 'unit') {
        normKind = SOLDIER_KEYS[rawKey] ? 'soldier' : 'enemy';
      }
      if (normKind === 'tower' && (options.soldier || options.soldierVariant || options.unitPreview)) {
        normKind = 'soldier';
        rawKey = String(options.soldierVariant || options.soldier || (
          options.tier === 3 && options.branch === 'B' ? 'knight' : (options.tier === 3 && options.branch === 'A' ? 'phalanx' : 'guard')
        )).toLowerCase();
      }

      let tier = Number(options.tier) || 1;
      let branch = options.branch ? String(options.branch).toUpperCase() : null;
      let phase = options.phase !== undefined ? Number(options.phase) : (rawKey === 'balrog' ? 2 : 1);

      if (normKind === 'tower') {
        // Support shorthand keys like 'elven_3_A', 'galadhrim', 'mortar', 'ballista', 'anor', 'stormcaller'
        const TOWER_SHORTHANDS = {
          galadhrim: ['elven', 3, 'A'],
          mirkwood: ['elven', 3, 'B'],
          phalanx: ['garrison', 3, 'A'],
          riddermark: ['garrison', 3, 'B'],
          mortar: ['dwarven', 3, 'A'],
          ironhills: ['dwarven', 3, 'A'],
          bombard: ['dwarven', 3, 'A'],
          ballista: ['dwarven', 3, 'B'],
          khazad: ['dwarven', 3, 'B'],
          anor: ['istari', 3, 'A'],
          flameofanor: ['istari', 3, 'A'],
          stormcaller: ['istari', 3, 'B']
        };
        if (TOWER_SHORTHANDS[rawKey]) {
          const sh = TOWER_SHORTHANDS[rawKey];
          rawKey = sh[0];
          tier = sh[1];
          branch = sh[2];
        } else if (rawKey.indexOf('_') !== -1) {
          const parts = rawKey.split('_');
          rawKey = parts[0];
          if (parts[1]) tier = Number(parts[1]) || tier;
          if (parts[2] && parts[2] !== '0') branch = parts[2].toUpperCase();
        }
        if (tier < 3) branch = null;
        else if (!branch) branch = 'A';
      } else if (normKind === 'soldier') {
        rawKey = SOLDIER_KEYS[rawKey] || rawKey;
      } else {
        normKind = 'enemy';
        if (rawKey === 'witchlord' || rawKey === 'witch_lord' || rawKey === 'witch-lord' || rawKey === 'balrog_p1' || rawKey === 'balrog_1' || rawKey === 'balrog_phase1') {
          rawKey = 'balrog';
          phase = 1;
        } else if (rawKey === 'balrog_p2' || rawKey === 'balrog_2' || rawKey === 'balrog_phase2') {
          rawKey = 'balrog';
          phase = 2;
        }
      }

      const tw = (targetCanvas && targetCanvas.width) ? targetCanvas.width : 256;
      const th = (targetCanvas && targetCanvas.height) ? targetCanvas.height : 256;
      const wideAspect = (tw / Math.max(1, th)) > 1.22;
      const rtW = wideAspect ? 384 : 256;
      const rtH = 256;

      const cacheKey = [
        normKind,
        rawKey,
        normKind === 'tower' ? tier : 0,
        normKind === 'tower' ? (branch || '0') : '0',
        normKind === 'enemy' ? phase : 0,
        wideAspect ? 'w' : 's'
      ].join(':');

      if (!options.force && studio.portraitCache.has(cacheKey)) {
        return this._blitCachedToTarget(studio.portraitCache.get(cacheKey), targetCanvas);
      }

      const modelsProvider = this.models3d || TD.Models3D;
      if (!modelsProvider) return false;

      let modelObj = null;
      try {
        if (normKind === 'tower' && typeof modelsProvider.createStandaloneTowerMesh === 'function') {
          modelObj = modelsProvider.createStandaloneTowerMesh(rawKey, tier, branch, options);
        } else if (normKind === 'soldier' && typeof modelsProvider.createStandaloneSoldierMesh === 'function') {
          modelObj = modelsProvider.createStandaloneSoldierMesh(rawKey, options);
        } else if (normKind === 'enemy' && typeof modelsProvider.createStandaloneEnemyMesh === 'function') {
          modelObj = modelsProvider.createStandaloneEnemyMesh(rawKey, Object.assign({}, options, { phase: phase }));
        }
      } catch (err) {
        console.warn('[Scene3D Studio] Failed to build standalone mesh for', cacheKey, err);
        return false;
      }

      if (!modelObj) return false;

      // Select faction-appropriate painterly radial vignette backdrop
      let theme = 'garrison';
      if (normKind === 'tower') {
        theme = (rawKey === 'elven' || rawKey === 'dwarven' || rawKey === 'istari' || rawKey === 'garrison') ? rawKey : 'garrison';
      } else if (normKind === 'soldier') {
        theme = rawKey === 'knight_3B' ? 'elven' : 'garrison';
      } else {
        if (rawKey === 'wraith' || rawKey === 'ringwraith' || (rawKey === 'balrog' && phase === 1)) {
          theme = 'morgul';
        } else if (rawKey === 'balrog' && phase === 2) {
          theme = 'udun';
        } else {
          theme = 'mordor';
        }
      }

      studio.scene.background = this._getStudioBackdrop(theme);
      studio.root.clear();
      studio.root.add(modelObj);

      const isTallSpire = normKind === 'tower' && (rawKey === 'elven' || rawKey === 'istari');
      const defaultPitch = normKind === 'tower' ? (isTallSpire ? 23 : 28) : (rawKey === 'fellbeast' ? 33 : 25);
      const defaultAzim = normKind === 'tower' ? 30 : (rawKey === 'warg' || rawKey === 'knight_3B' ? 38 : (rawKey === 'fellbeast' ? 32 : 28));
      const pitchDeg = options.pitch !== undefined ? options.pitch : defaultPitch;
      const azimDeg = options.azimuth !== undefined ? options.azimuth : defaultAzim;
      const fillFrac = options.fill !== undefined ? options.fill : 0.84;

      this._frameStudioModel(studio, modelObj, normKind, rawKey, pitchDeg, azimDeg, rtW / rtH, fillFrac);

      const exposure = (rawKey === 'balrog' && phase === 2) ? 1.12 : (normKind === 'enemy' ? 1.22 : 1.18);
      const rendered = this._renderOffscreenToCanvas(studio.scene, studio.camera, rtW, rtH, exposure);

      studio.root.remove(modelObj);
      studio.pedestal.visible = false;

      if (!rendered) return false;
      studio.portraitCache.set(cacheKey, rendered);
      return this._blitCachedToTarget(rendered, targetCanvas);
    }

    _captureVistaCanvasFromScene(targetScene, mapId) {
      const studio = this._ensureStudio();
      if (!studio) return null;
      const cam = studio.vistaCamera;
      cam.aspect = 440 / 248;
      cam.fov = 40;
      cam.updateProjectionMatrix();

      if (mapId === 'hornburg') {
        cam.position.set(-28, 35, 45);
        cam.lookAt(14, 5.2, -12);
      } else if (mapId === 'pelennor') {
        cam.position.set(-22, 37, 47);
        cam.lookAt(8, 4.8, -10);
      } else {
        cam.position.set(-28, 36, 44);
        cam.lookAt(14, 5.2, -11);
      }
      cam.updateMatrixWorld(true);

      const exp = mapId === 'hornburg' ? 1.30 : (mapId === 'blackgate' ? 1.22 : 1.16);
      return this._renderOffscreenToCanvas(targetScene, cam, 440, 248, exp);
    }

    _captureMinimapCanvasFromScene(targetScene, mapId, marginScale) {
      const studio = this._ensureStudio();
      if (!studio) return null;
      const THREE = window.THREE;
      const ortho = studio.orthoCamera;
      const scale = marginScale && marginScale > 1 ? marginScale : 1.0;

      ortho.left = -64 * scale;
      ortho.right = 64 * scale;
      ortho.top = 36 * scale;
      ortho.bottom = -36 * scale;
      ortho.near = 1;
      ortho.far = 280;
      ortho.position.set(0, 145, 0);
      ortho.up.set(0, 0, -1); // -Z (gy=0) at top of minimap, +X (gx=1280) at right
      ortho.lookAt(0, 0, 0);
      ortho.updateProjectionMatrix();
      ortho.updateMatrixWorld(true);

      const savedFog = targetScene.fog;
      const reliefSun = new THREE.DirectionalLight(0xfff0d4, mapId === 'hornburg' ? 1.55 : 0.90);
      reliefSun.position.set(-46, 115, -52);
      const reliefAmb = new THREE.AmbientLight(0xdce8fa, mapId === 'hornburg' ? 0.85 : 0.45);

      targetScene.fog = null;
      targetScene.add(reliefSun, reliefAmb);

      let out = null;
      try {
        const exp = mapId === 'hornburg' ? 1.26 : (mapId === 'blackgate' ? 1.20 : 1.12);
        out = this._renderOffscreenToCanvas(targetScene, ortho, 256, 256, exp);
      } finally {
        targetScene.remove(reliefSun, reliefAmb);
        targetScene.fog = savedFog;
      }
      return out;
    }

    _ensureEnvironmentSnapshots(mapId, marginScale) {
      const studio = this._ensureStudio();
      if (!studio) return;
      const targetMapId = (mapId && TD.MAPS && TD.MAPS[mapId]) ? mapId : ((this.game && this.game.mapId) || 'hornburg');
      const mScale = marginScale && marginScale > 1 ? marginScale : 1.0;
      const miniKey = targetMapId + ':' + mScale.toFixed(4);

      if (studio.mapPreviewCache.has(targetMapId) && studio.minimapCache.has(miniKey)) {
        return;
      }

      // Case A: Requested map is ALREADY live on this.env3d -> capture directly from this.scene with zero rebuild!
      if (this.env3d && this.env3d.mapId === targetMapId && this.scene) {
        const savedModels = this.modelsGroup ? this.modelsGroup.visible : false;
        const savedTactical = this.tacticalGroup ? this.tacticalGroup.visible : false;
        const savedVfx = this.vfxGroup ? this.vfxGroup.visible : false;
        const savedPads = this.padsGroup ? this.padsGroup.visible : false;
        const padEntries = Array.isArray(this.env3d.padEntries) ? this.env3d.padEntries : [];
        const savedHolos = padEntries.map((pe) => (pe && pe.holoGroup ? pe.holoGroup.visible : false));

        try {
          if (this.modelsGroup) this.modelsGroup.visible = false;
          if (this.tacticalGroup) this.tacticalGroup.visible = false;
          if (this.vfxGroup) this.vfxGroup.visible = false;
          if (this.padsGroup) this.padsGroup.visible = false;
          for (let i = 0; i < padEntries.length; i++) {
            if (padEntries[i] && padEntries[i].holoGroup) {
              padEntries[i].holoGroup.visible = false;
            }
          }
          this._reconcileLighting();

          if (!studio.mapPreviewCache.has(targetMapId)) {
            const vista = this._captureVistaCanvasFromScene(this.scene, targetMapId);
            if (vista) studio.mapPreviewCache.set(targetMapId, vista);
          }
          if (!studio.minimapCache.has(miniKey)) {
            const mini = this._captureMinimapCanvasFromScene(this.scene, targetMapId, mScale);
            if (mini) studio.minimapCache.set(miniKey, mini);
          }
        } finally {
          if (this.modelsGroup) this.modelsGroup.visible = savedModels;
          if (this.tacticalGroup) this.tacticalGroup.visible = savedTactical;
          if (this.vfxGroup) this.vfxGroup.visible = savedVfx;
          if (this.padsGroup) this.padsGroup.visible = savedPads;
          for (let i = 0; i < padEntries.length; i++) {
            if (padEntries[i] && padEntries[i].holoGroup) {
              padEntries[i].holoGroup.visible = savedHolos[i];
            }
          }
        }
        return;
      }

      // Case B: Build isolated temporary Environment3D in an offscreen Scene, capture BOTH vista & minimap, and dispose cleanly!
      if (!TD.Environment3D || !TD.MAPS || !TD.MAPS[targetMapId]) return;
      const THREE = window.THREE;
      const tempScene = new THREE.Scene();
      tempScene.background = new THREE.Color(0x141b24);
      const tempEnvGroup = new THREE.Group();
      tempScene.add(tempEnvGroup);

      let tempEnv = null;
      try {
        tempEnv = new TD.Environment3D({
          scene: tempScene,
          envGroup: tempEnvGroup,
          textures: this.textures
        });
        if (typeof tempEnv.buildMap === 'function') {
          tempEnv.buildMap(targetMapId, TD.MAPS[targetMapId]);
        }
        if (typeof tempEnv.update === 'function') {
          tempEnv.update(0.016, 1.25, null);
        }
        const padEntries = Array.isArray(tempEnv.padEntries) ? tempEnv.padEntries : [];
        for (let i = 0; i < padEntries.length; i++) {
          if (padEntries[i] && padEntries[i].holoGroup) {
            padEntries[i].holoGroup.visible = false;
          }
        }

        if (!studio.mapPreviewCache.has(targetMapId)) {
          const vista = this._captureVistaCanvasFromScene(tempScene, targetMapId);
          if (vista) studio.mapPreviewCache.set(targetMapId, vista);
        }
        if (!studio.minimapCache.has(miniKey)) {
          const mini = this._captureMinimapCanvasFromScene(tempScene, targetMapId, mScale);
          if (mini) studio.minimapCache.set(miniKey, mini);
        }
        const defaultMiniKey = targetMapId + ':1.0000';
        if (!studio.minimapCache.has(defaultMiniKey)) {
          const defMini = this._captureMinimapCanvasFromScene(tempScene, targetMapId, 1.0);
          if (defMini) studio.minimapCache.set(defaultMiniKey, defMini);
        }
      } catch (err) {
        console.warn('[Scene3D Studio] Map snapshot build failed for', targetMapId, err);
      } finally {
        if (tempEnv && typeof tempEnv.dispose === 'function') {
          tempEnv.dispose();
        }
      }
    }

    /**
     * Renders (and caches) a 440x248 elevated 3D scenic stronghold vista onto `targetCanvas`.
     */
    renderMapPreview3D(targetCanvas, mapId, opts = {}) {
      const studio = this._ensureStudio();
      if (!studio) return false;
      const targetMapId = (mapId && TD.MAPS && TD.MAPS[mapId]) ? mapId : ((this.game && this.game.mapId) || 'hornburg');
      if (opts && opts.force) {
        studio.mapPreviewCache.delete(targetMapId);
      }
      if (!studio.mapPreviewCache.has(targetMapId)) {
        this._ensureEnvironmentSnapshots(targetMapId, 1.0);
      }
      const cached = studio.mapPreviewCache.get(targetMapId);
      return cached ? this._blitCachedToTarget(cached, targetCanvas) : false;
    }

    /**
     * Renders (and caches) a crisp top-down orthographic 3D shaded relief terrain map
     * over [-64..64, -36..36] onto `targetCanvas` for #hud-minimap.
     */
    renderMinimapTerrain3D(targetCanvas, mapId, opts = {}) {
      const studio = this._ensureStudio();
      if (!studio) return false;
      const targetMapId = (mapId && TD.MAPS && TD.MAPS[mapId]) ? mapId : ((this.game && this.game.mapId) || 'hornburg');

      let marginScale = 1.0;
      if (opts && typeof opts.margin === 'number' && opts.margin > 0) {
        const size = (opts.size || (targetCanvas && targetCanvas.width) || 136);
        const inner = Math.max(32, size - opts.margin * 2);
        marginScale = size / inner;
      }
      const miniKey = targetMapId + ':' + marginScale.toFixed(4);
      if (opts && opts.force) {
        studio.minimapCache.delete(miniKey);
      }
      if (!studio.minimapCache.has(miniKey)) {
        this._ensureEnvironmentSnapshots(targetMapId, marginScale);
      }
      const cached = studio.minimapCache.get(miniKey);
      return cached ? this._blitCachedToTarget(cached, targetCanvas) : false;
    }

    /**
     * Pre-uploads shared pooled ModelAssetCache, Tower/Enemy, and VFX3D geometries & textures
     * onto the GPU once at boot so first-wave combat & multi-map disposal cycles see 0 delta.
     */
    prewarmGpuPoolAssets() {
      const studio = this._ensureStudio();
      if (!studio || !this.renderer || !this.scene || !this.camera) return;

      const m3d = this.models3d;
      const tempRigs = [];
      if (m3d && !m3d._disposed) {
        const tVariants = ['elven_1_0', 'elven_2_0', 'elven_3_A', 'elven_3_B', 'garrison_1_0', 'garrison_2_0', 'garrison_3_A', 'garrison_3_B', 'dwarven_1_0', 'dwarven_2_0', 'dwarven_3_A', 'dwarven_3_B', 'istari_1_0', 'istari_2_0', 'istari_3_A', 'istari_3_B'];
        for (let i = 0; i < tVariants.length; i++) {
          tempRigs.push(['tower', m3d._acquireTowerRig(tVariants[i])]);
        }
        const sVariants = ['guard_1', 'guard_2', 'phalanx_3A', 'knight_3B'];
        for (let i = 0; i < sVariants.length; i++) {
          tempRigs.push(['soldier', m3d._acquireSoldierRig(sVariants[i])]);
        }
        const eTypes = ['goblin', 'orc', 'uruk', 'warg', 'troll', 'wraith', 'fellbeast', 'ringwraith', 'balrog'];
        for (let i = 0; i < eTypes.length; i++) {
          tempRigs.push(['enemy', m3d._acquireEnemyRig(eTypes[i])]);
        }
        if (m3d.cache && Array.isArray(m3d.cache.textures) && typeof this.renderer.initTexture === 'function') {
          for (let i = 0; i < m3d.cache.textures.length; i++) {
            if (m3d.cache.textures[i]) this.renderer.initTexture(m3d.cache.textures[i]);
          }
        }
      }

      const savedState = [];
      const forceShow = (root) => {
        if (!root) return;
        root.traverse((obj) => {
          savedState.push({
            obj,
            vis: obj.visible,
            fc: obj.frustumCulled,
            cnt: obj.isInstancedMesh ? obj.count : -1
          });
          obj.visible = true;
          obj.frustumCulled = false;
          if (obj.isInstancedMesh && obj.count === 0 && obj.instanceMatrix && obj.instanceMatrix.count > 0) {
            obj.count = 1;
          }
          if (obj.isMesh && obj.material && typeof this.renderer.initTexture === 'function') {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (let m = 0; m < mats.length; m++) {
              const mat = mats[m];
              if (!mat) continue;
              if (mat.map) this.renderer.initTexture(mat.map);
              if (mat.bumpMap) this.renderer.initTexture(mat.bumpMap);
              if (mat.roughnessMap) this.renderer.initTexture(mat.roughnessMap);
              if (mat.emissiveMap) this.renderer.initTexture(mat.emissiveMap);
              if (mat.alphaMap) this.renderer.initTexture(mat.alphaMap);
            }
          }
        });
      };

      try {
        if (this.vfx3d) {
          if (typeof this.vfx3d.spawnShockwave === 'function') {
            this.vfx3d.spawnShockwave(640, 360, 24, '#ffd54f', 0.2);
            this.vfx3d.spawnShockwave(640, 360, 32, '#8be0ff', 0.2);
          }
          if (typeof this.vfx3d.spawnBurst === 'function') {
            this.vfx3d.spawnBurst(640, 360, { count: 4, color: '#ffd54f' });
          }
        }
        forceShow(this.modelsGroup);
        forceShow(this.vfxGroup);
        forceShow(this.tacticalGroup);
        const targets = this._getStudioTargets(256, 256);
        if (targets) {
          const prevTarget = this.renderer.getRenderTarget();
          this.renderer.setRenderTarget(targets.rtRead);
          this.renderer.render(this.scene, this.camera);
          this.renderer.setRenderTarget(prevTarget);
        }
      } catch (_err) {
        // Ignore non-critical prewarm errors
      } finally {
        for (let i = savedState.length - 1; i >= 0; i--) {
          const st = savedState[i];
          st.obj.visible = st.vis;
          st.obj.frustumCulled = st.fc;
          if (st.cnt >= 0) st.obj.count = st.cnt;
        }
        if (m3d) {
          for (let i = 0; i < tempRigs.length; i++) {
            const [kind, rig] = tempRigs[i];
            if (kind === 'tower') m3d._releaseTowerRig(rig);
            else if (kind === 'soldier') m3d._releaseSoldierRig(rig);
            else m3d._releaseEnemyRig(rig);
          }
        }
        if (this.vfx3d && typeof this.vfx3d.reset === 'function') {
          this.vfx3d.reset();
        }
      }
    }

    clearStudioCaches() {
      if (!this._studio) return;
      this._studio.portraitCache.clear();
      this._studio.mapPreviewCache.clear();
      this._studio.minimapCache.clear();
    }

    dispose() {
      if (this._studio) {
        const st = this._studio;
        if (st.outputPass && typeof st.outputPass.dispose === 'function') st.outputPass.dispose();
        for (const [, t] of st.targetPool.entries()) {
          if (t.rtHDR) t.rtHDR.dispose();
          if (t.rtRead) t.rtRead.dispose();
        }
        st.targetPool.clear();
        for (const [, tex] of st.backdropTexs.entries()) {
          if (tex && tex.dispose) tex.dispose();
        }
        st.backdropTexs.clear();
        for (let i = 0; i < st.pedGeos.length; i++) st.pedGeos[i].dispose();
        for (let i = 0; i < st.pedMats.length; i++) st.pedMats[i].dispose();
        st.portraitCache.clear();
        st.mapPreviewCache.clear();
        st.minimapCache.clear();
        this._studio = null;
      }
      if (this.env3d && typeof this.env3d.dispose === 'function') this.env3d.dispose();
      if (this.models3d && typeof this.models3d.dispose === 'function') this.models3d.dispose();
      if (this.vfx3d && typeof this.vfx3d.dispose === 'function') this.vfx3d.dispose();
      if (this.composer && typeof this.composer.dispose === 'function') this.composer.dispose();
      if (this.renderer) this.renderer.dispose();
    }
  }

  TD.Scene3D = Scene3D;
})(window.TD = window.TD || {});
