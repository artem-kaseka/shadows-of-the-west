(function(TD) {
  'use strict';

  const TWO_PI = Math.PI * 2;
  const HALF_PI = Math.PI * 0.5;
  const WORLD_SCALE = 0.1;

  // Logical 1280x720 <-> 3D World (-64..+64, -36..+36)
  function toWorldX(gx) {
    return (gx - 640) * WORLD_SCALE;
  }

  function toWorldZ(gy) {
    return (gy - 360) * WORLD_SCALE;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function srgbToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  // ============================================================================
  // Deterministic PRNG & Multi-Octave 2D Noise
  // ============================================================================
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2i(ix, iy, seed) {
    let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function valueNoise2D(x, y, seed) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const n00 = hash2i(ix, iy, seed);
    const n10 = hash2i(ix + 1, iy, seed);
    const n01 = hash2i(ix, iy + 1, seed);
    const n11 = hash2i(ix + 1, iy + 1, seed);
    return lerp(lerp(n00, n10, ux), lerp(n01, n11, ux), uy);
  }

  function fbm2D(x, y, seed, octaves) {
    const oct = octaves || 4;
    let val = 0;
    let amp = 0.52;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < oct; i++) {
      val += amp * valueNoise2D(x * freq, y * freq, seed + i * 97);
      norm += amp;
      amp *= 0.5;
      freq *= 2.04;
    }
    return val / (norm || 1);
  }

  function ridgedFbm2D(x, y, seed, octaves) {
    const oct = octaves || 4;
    let val = 0;
    let amp = 0.55;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < oct; i++) {
      const n = valueNoise2D(x * freq, y * freq, seed + i * 131);
      const r = 1 - Math.abs(n * 2 - 1);
      val += amp * r * r;
      norm += amp;
      amp *= 0.5;
      freq *= 2.07;
    }
    return val / (norm || 1);
  }

  // Distance from point (px, pz) to polyline array of {x, z}
  function distToPolylineWorld(px, pz, poly) {
    let bestSq = Infinity;
    for (let i = 0; i < poly.length - 1; i++) {
      const ax = poly[i].x;
      const az = poly[i].z;
      const dx = poly[i + 1].x - ax;
      const dz = poly[i + 1].z - az;
      const lenSq = dx * dx + dz * dz;
      let t = lenSq > 1e-6 ? ((px - ax) * dx + (pz - az) * dz) / lenSq : 0;
      t = clamp(t, 0, 1);
      const cx = ax + dx * t;
      const cz = az + dz * t;
      const dSq = (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
      if (dSq < bestSq) bestSq = dSq;
    }
    return Math.sqrt(bestSq);
  }

  // ============================================================================
  // Stage Stream & Fissure World-Space Polylines (matching src/maps.js)
  // ============================================================================
  const HORNBURG_STREAM_GAME = [
    { x: 576, y: 142 },
    { x: 545, y: 205 },
    { x: 492, y: 268 },
    { x: 446, y: 375 },
    { x: 412, y: 485 },
    { x: 405, y: 550 },
    { x: 382, y: 635 },
    { x: 342, y: 745 }
  ];

  const BLACKGATE_FISSURES_GAME = [
    [
      { x: 95, y: 360 }, { x: 215, y: 352 }, { x: 335, y: 368 },
      { x: 465, y: 354 }, { x: 555, y: 322 }, { x: 675, y: 335 },
      { x: 815, y: 358 }, { x: 935, y: 330 }, { x: 1055, y: 360 }
    ],
    [
      { x: 465, y: 354 }, { x: 560, y: 398 }, { x: 675, y: 388 },
      { x: 815, y: 358 }, { x: 935, y: 392 }, { x: 1035, y: 372 }
    ],
    [
      { x: 295, y: 290 }, { x: 335, y: 368 }, { x: 290, y: 445 }
    ],
    [
      { x: 360, y: 82 }, { x: 445, y: 104 }, { x: 505, y: 88 }
    ],
    [
      { x: 360, y: 642 }, { x: 445, y: 618 }, { x: 505, y: 636 }
    ]
  ];

  const PELENNOR_CRATERS_WORLD = [
    { x: toWorldX(115), z: toWorldZ(345), r: 2.8 },
    { x: toWorldX(465), z: toWorldZ(185), r: 2.2 },
    { x: toWorldX(465), z: toWorldZ(535), r: 2.4 },
    { x: toWorldX(605), z: toWorldZ(295), r: 2.1 },
    { x: toWorldX(605), z: toWorldZ(430), r: 2.2 },
    { x: toWorldX(895), z: toWorldZ(185), r: 2.5 },
    { x: toWorldX(895), z: toWorldZ(545), r: 2.4 }
  ];

  // ============================================================================
  // Geometry Merge Helper (zero external addons needed)
  // ============================================================================
  function mergeGeometriesSimple(THREE, geos) {
    let totalVerts = 0;
    let totalIndices = 0;
    let hasColor = false;
    for (let i = 0; i < geos.length; i++) {
      const g = geos[i];
      const pos = g.attributes.position;
      totalVerts += pos.count;
      if (g.attributes.color) hasColor = true;
      if (g.index) totalIndices += g.index.count;
      else totalIndices += pos.count;
    }

    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);
    const uvs = new Float32Array(totalVerts * 2);
    const colors = hasColor ? new Float32Array(totalVerts * 3) : null;
    const indices = totalVerts > 65535 ? new Uint32Array(totalIndices) : new Uint16Array(totalIndices);

    let vOffset = 0;
    let iOffset = 0;

    for (let i = 0; i < geos.length; i++) {
      const g = geos[i];
      if (!g.attributes.normal) g.computeVertexNormals();
      const pos = g.attributes.position;
      const norm = g.attributes.normal;
      const uv = g.attributes.uv;
      const col = g.attributes.color;
      const count = pos.count;

      for (let k = 0; k < count; k++) {
        const pIdx = (vOffset + k) * 3;
        positions[pIdx] = pos.getX(k);
        positions[pIdx + 1] = pos.getY(k);
        positions[pIdx + 2] = pos.getZ(k);

        normals[pIdx] = norm ? norm.getX(k) : 0;
        normals[pIdx + 1] = norm ? norm.getY(k) : 1;
        normals[pIdx + 2] = norm ? norm.getZ(k) : 0;

        const uIdx = (vOffset + k) * 2;
        uvs[uIdx] = uv ? uv.getX(k) : 0;
        uvs[uIdx + 1] = uv ? uv.getY(k) : 0;

        if (colors) {
          colors[pIdx] = col ? col.getX(k) : 1;
          colors[pIdx + 1] = col ? col.getY(k) : 1;
          colors[pIdx + 2] = col ? col.getZ(k) : 1;
        }
      }

      if (g.index) {
        const idxArr = g.index.array;
        for (let k = 0; k < idxArr.length; k++) {
          indices[iOffset + k] = idxArr[k] + vOffset;
        }
        iOffset += idxArr.length;
      } else {
        for (let k = 0; k < count; k++) {
          indices[iOffset + k] = vOffset + k;
        }
        iOffset += count;
      }

      vOffset += count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    if (colors) merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    merged.setIndex(new THREE.BufferAttribute(indices, 1));
    return merged;
  }

  function paintGeoVertexColor(THREE, geo, hexColor, bottomShadeHex) {
    const cTop = new THREE.Color(hexColor);
    const cBot = bottomShadeHex !== undefined ? new THREE.Color(bottomShadeHex) : cTop;
    const pos = geo.attributes.position;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const span = Math.max(0.001, maxY - minY);
    const arr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = clamp((pos.getY(i) - minY) / span, 0, 1);
      arr[i * 3] = lerp(cBot.r, cTop.r, t);
      arr[i * 3 + 1] = lerp(cBot.g, cTop.g, t);
      arr[i * 3 + 2] = lerp(cBot.b, cTop.b, t);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }

  // ============================================================================
  // Self-Contained Procedural Canvas PBR Texture Generators
  // ============================================================================
  function makeCanvas(w, h) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function finalizeCanvasTex(THREE, canvas, isSRGB, repeatX, repeatY) {
    if (!canvas) return null;
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    if (repeatX || repeatY) {
      tex.repeat.set(repeatX || 1, repeatY || 1);
    }
    if (isSRGB && THREE.SRGBColorSpace) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.needsUpdate = true;
    return tex;
  }

  function generateCobbleSet(THREE, style) {
    const size = 512;
    const colC = makeCanvas(size, size);
    const bmpC = makeCanvas(size, size);
    const rghC = makeCanvas(size, size);
    if (!colC) return {};

    const cctx = colC.getContext('2d');
    const bctx = bmpC.getContext('2d');
    const rctx = rghC.getContext('2d');
    const rand = mulberry32(style === 'hornburg' ? 1103 : (style === 'pelennor' ? 2207 : 3313));

    const mortarCol = style === 'hornburg'
      ? '#1d252e'
      : (style === 'pelennor' ? '#2c261f' : '#18131c');
    cctx.fillStyle = mortarCol;
    cctx.fillRect(0, 0, size, size);

    bctx.fillStyle = '#181818';
    bctx.fillRect(0, 0, size, size);

    rctx.fillStyle = style === 'hornburg' ? '#909090' : '#dcdcdc';
    rctx.fillRect(0, 0, size, size);

    const rows = 9;
    const rowH = size / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      let x = -((r % 2) * 32);
      while (x < size + 32) {
        const w = 44 + rand() * 34;
        const h = rowH - 5;
        const jx = (rand() - 0.5) * 3;
        const jy = (rand() - 0.5) * 2.5;
        const tone = rand();

        let cr, cg, cb;
        if (style === 'hornburg') {
          cr = 82 + tone * 38;
          cg = 94 + tone * 40;
          cb = 108 + tone * 42;
        } else if (style === 'pelennor') {
          cr = 122 + tone * 46;
          cg = 113 + tone * 42;
          cb = 96 + tone * 36;
        } else {
          cr = 68 + tone * 32;
          cg = 60 + tone * 28;
          cb = 74 + tone * 34;
        }

        const drawStone = function(ox) {
          const sx = x + ox + 3 + jx;
          const sy = y + 2.5 + jy;
          const sw = w - 6;
          const sh = h - 1;

          // Albedo stone paver
          const grad = cctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
          grad.addColorStop(0, `rgb(${(cr + 14) | 0},${(cg + 14) | 0},${(cb + 14) | 0})`);
          grad.addColorStop(1, `rgb(${(cr - 14) | 0},${(cg - 14) | 0},${(cb - 14) | 0})`);
          cctx.fillStyle = grad;
          cctx.beginPath();
          if (cctx.roundRect) cctx.roundRect(sx, sy, sw, sh, 6);
          else cctx.rect(sx, sy, sw, sh);
          cctx.fill();

          cctx.strokeStyle = 'rgba(255,255,255,0.12)';
          cctx.lineWidth = 1.2;
          cctx.stroke();

          // Bump stone pillow bevel
          const bGrad = bctx.createRadialGradient(
            sx + sw * 0.5, sy + sh * 0.5, 2,
            sx + sw * 0.5, sy + sh * 0.5, Math.max(sw, sh) * 0.68
          );
          const peak = (195 + tone * 50) | 0;
          bGrad.addColorStop(0, `rgb(${peak},${peak},${peak})`);
          bGrad.addColorStop(0.78, 'rgb(148,148,148)');
          bGrad.addColorStop(1, 'rgb(42,42,42)');
          bctx.fillStyle = bGrad;
          bctx.beginPath();
          if (bctx.roundRect) bctx.roundRect(sx, sy, sw, sh, 6);
          else bctx.rect(sx, sy, sw, sh);
          bctx.fill();

          // Roughness variation
          const rv = style === 'hornburg' ? (125 + tone * 65) | 0 : (175 + tone * 55) | 0;
          rctx.fillStyle = `rgb(${rv},${rv},${rv})`;
          rctx.fillRect(sx + 1, sy + 1, sw - 2, sh - 2);
        };

        drawStone(0);
        if (x + w > size) drawStone(-size);
        if (x < 0) drawStone(size);
        x += w;
      }
    }

    // Subtle moss / ash / magma mortar veins
    for (let i = 0; i < 95; i++) {
      const mx = rand() * size;
      const my = rand() * size;
      const mr = 4 + rand() * 11;
      if (style === 'hornburg') {
        cctx.fillStyle = 'rgba(48, 82, 46, 0.22)';
      } else if (style === 'pelennor') {
        cctx.fillStyle = 'rgba(68, 62, 42, 0.20)';
      } else {
        cctx.fillStyle = i % 5 === 0 ? 'rgba(255, 92, 22, 0.24)' : 'rgba(22, 18, 26, 0.28)';
      }
      cctx.beginPath();
      cctx.arc(mx, my, mr, 0, TWO_PI);
      cctx.fill();
    }

    return {
      map: finalizeCanvasTex(THREE, colC, true, 1, 1),
      bumpMap: finalizeCanvasTex(THREE, bmpC, false, 1, 1),
      roughnessMap: finalizeCanvasTex(THREE, rghC, false, 1, 1)
    };
  }

  function generateAshlarSet(THREE, style) {
    const size = 512;
    const colC = makeCanvas(size, size);
    const bmpC = makeCanvas(size, size);
    if (!colC) return {};
    const cctx = colC.getContext('2d');
    const bctx = bmpC.getContext('2d');
    const rand = mulberry32(style === 'ivory' ? 5501 : (style === 'obsidian' ? 7717 : 4409));

    let baseR = 132, baseG = 148, baseB = 166, mortar = '#2d3742';
    if (style === 'ivory') {
      baseR = 198; baseG = 191; baseB = 176; mortar = '#6f695d';
    } else if (style === 'dark_numenor') {
      baseR = 66; baseG = 73; baseB = 84; mortar = '#1e232a';
    } else if (style === 'obsidian') {
      baseR = 96; baseG = 90; baseB = 110; mortar = '#221d2b';
    }

    cctx.fillStyle = mortar;
    cctx.fillRect(0, 0, size, size);
    bctx.fillStyle = '#202020';
    bctx.fillRect(0, 0, size, size);

    const courses = 10;
    const ch = size / courses;
    for (let r = 0; r < courses; r++) {
      const y = r * ch;
      let x = -((r % 2) * 42);
      while (x < size + 42) {
        const bw = 64 + rand() * 44;
        const v = (rand() - 0.5) * 26;
        const cr = clamp((baseR + v) | 0, 12, 245);
        const cg = clamp((baseG + v) | 0, 12, 245);
        const cb = clamp((baseB + v) | 0, 12, 245);

        const paintBlock = function(ox) {
          cctx.fillStyle = `rgb(${cr},${cg},${cb})`;
          cctx.fillRect(x + ox + 2, y + 2, bw - 4, ch - 4);
          cctx.strokeStyle = 'rgba(255,255,255,0.10)';
          cctx.strokeRect(x + ox + 2.5, y + 2.5, bw - 5, ch - 5);

          const bv = clamp((175 + v * 1.4) | 0, 60, 245);
          bctx.fillStyle = `rgb(${bv},${bv},${bv})`;
          bctx.fillRect(x + ox + 2.5, y + 2.5, bw - 5, ch - 5);
        };

        paintBlock(0);
        if (x + bw > size) paintBlock(-size);
        x += bw;
      }
    }

    // Weathering streaks
    for (let i = 0; i < 48; i++) {
      const sx = rand() * size;
      const sy = rand() * size * 0.6;
      const sh = 45 + rand() * 140;
      const wg = cctx.createLinearGradient(sx, sy, sx, sy + sh);
      wg.addColorStop(0, 'rgba(12, 16, 20, 0.22)');
      wg.addColorStop(1, 'rgba(12, 16, 20, 0)');
      cctx.fillStyle = wg;
      cctx.fillRect(sx, sy, 3 + rand() * 8, sh);
    }

    return {
      map: finalizeCanvasTex(THREE, colC, true, 2, 2),
      bumpMap: finalizeCanvasTex(THREE, bmpC, false, 2, 2)
    };
  }

  function generateTimberRoofSet(THREE) {
    const size = 256;
    const colC = makeCanvas(size, size);
    const bmpC = makeCanvas(size, size);
    if (!colC) return {};
    const cctx = colC.getContext('2d');
    const bctx = bmpC.getContext('2d');
    const rand = mulberry32(8821);

    cctx.fillStyle = '#241c16';
    cctx.fillRect(0, 0, size, size);
    bctx.fillStyle = '#202020';
    bctx.fillRect(0, 0, size, size);

    const rows = 12;
    const rh = size / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      const cols = 10;
      const cw = size / cols;
      const off = (r % 2) * (cw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const x = c * cw + off;
        const v = (rand() - 0.5) * 20;
        cctx.fillStyle = `rgb(${(66 + v) | 0},${(54 + v * 0.8) | 0},${(44 + v * 0.6) | 0})`;
        cctx.fillRect(x + 1, y + 1, cw - 2, rh - 2);
        bctx.fillStyle = `rgb(${(150 + v * 2) | 0},${(150 + v * 2) | 0},${(150 + v * 2) | 0})`;
        bctx.fillRect(x + 1, y + 2, cw - 2, rh - 3);
      }
    }
    return {
      map: finalizeCanvasTex(THREE, colC, true, 2, 2),
      bumpMap: finalizeCanvasTex(THREE, bmpC, false, 2, 2)
    };
  }

  function generateBannerTexture(THREE, faction) {
    const w = 128;
    const h = 256;
    const c = makeCanvas(w, h);
    if (!c) return null;
    const ctx = c.getContext('2d');

    if (faction === 'rohan') {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#183c28');
      g.addColorStop(0.6, '#1f4d33');
      g.addColorStop(1, '#112b1c');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = '#e0b858';
      ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, w - 16, h - 24);

      // Golden Sunburst & White-Gold Horse of Rohan motif
      ctx.fillStyle = '#f2cf70';
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.43, 24, 0, TWO_PI);
      ctx.fill();
      ctx.fillStyle = '#19402a';
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.43, 19, 0, TWO_PI);
      ctx.fill();

      // Stylized leaping steed silhouette
      ctx.strokeStyle = '#fff3c4';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w * 0.36, h * 0.48);
      ctx.quadraticCurveTo(w * 0.48, h * 0.36, w * 0.62, h * 0.39);
      ctx.lineTo(w * 0.66, h * 0.33);
      ctx.moveTo(w * 0.44, h * 0.45);
      ctx.lineTo(w * 0.38, h * 0.54);
      ctx.moveTo(w * 0.58, h * 0.43);
      ctx.lineTo(w * 0.65, h * 0.52);
      ctx.stroke();
    } else if (faction === 'mordor') {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#1c1014');
      g.addColorStop(0.6, '#2e1214');
      g.addColorStop(1, '#12080a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = '#b83b14';
      ctx.lineWidth = 5;
      ctx.strokeRect(8, 8, w - 16, h - 24);

      // Lidless Fiery Eye sigil
      ctx.fillStyle = '#ff5722';
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.42, 28, 16, 0, 0, TWO_PI);
      ctx.fill();
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.42, 16, 11, 0, 0, TWO_PI);
      ctx.fill();
      ctx.fillStyle = '#090507';
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.42, 3.5, 12, 0, 0, TWO_PI);
      ctx.fill();
    } else {
      // Royal Gondor Navy & Silver White Tree + Seven Stars (matching reference image!)
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#182b49');
      g.addColorStop(0.55, '#20385e');
      g.addColorStop(1, '#111f36');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = '#cfd8e6';
      ctx.lineWidth = 5;
      ctx.strokeRect(9, 9, w - 18, h - 24);

      // White Tree of Gondor trunk & canopy branches
      ctx.strokeStyle = '#eef4ff';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.62);
      ctx.lineTo(w * 0.5, h * 0.38);
      for (let s = -1; s <= 1; s += 2) {
        ctx.moveTo(w * 0.5, h * 0.48);
        ctx.quadraticCurveTo(w * 0.5 + s * 18, h * 0.45, w * 0.5 + s * 24, h * 0.36);
        ctx.moveTo(w * 0.5, h * 0.42);
        ctx.quadraticCurveTo(w * 0.5 + s * 12, h * 0.37, w * 0.5 + s * 16, h * 0.30);
        ctx.moveTo(w * 0.5, h * 0.62);
        ctx.quadraticCurveTo(w * 0.5 + s * 8, h * 0.65, w * 0.5 + s * 14, h * 0.66);
      }
      ctx.stroke();

      // Seven Stars arc
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 7; i++) {
        const ang = Math.PI + (i / 6) * Math.PI;
        const sx = w * 0.5 + Math.cos(ang) * 30;
        const sy = h * 0.35 + Math.sin(ang) * 18;
        ctx.beginPath();
        ctx.arc(sx, sy, 2.8, 0, TWO_PI);
        ctx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function generatePadRuneTexture(THREE) {
    const size = 512;
    const c = makeCanvas(size, size);
    if (!c) return null;
    const ctx = c.getContext('2d');
    const r = size * 0.5;

    ctx.clearRect(0, 0, size, size);

    // Soft outer ground halo (keeps central stone plinth completely clear like the reference image!)
    const halo = ctx.createRadialGradient(r, r, r * 0.68, r, r, r * 0.97);
    halo.addColorStop(0, 'rgba(255, 248, 226, 0)');
    halo.addColorStop(0.42, 'rgba(255, 246, 220, 0.14)');
    halo.addColorStop(0.74, 'rgba(255, 252, 240, 0.56)');
    halo.addColorStop(0.88, 'rgba(248, 236, 198, 0.22)');
    halo.addColorStop(1, 'rgba(240, 220, 165, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(r, r, r * 0.97, 0, TWO_PI);
    ctx.fill();

    // Crisp primary outer illuminated ivory-white ring (matching bottom-left of reference image!)
    ctx.strokeStyle = 'rgba(255, 253, 244, 0.98)';
    ctx.lineWidth = 6.2;
    ctx.beginPath();
    ctx.arc(r, r, r * 0.855, 0, TWO_PI);
    ctx.stroke();

    // Crisp concentric secondary inner illuminated ring (double ground ring!)
    ctx.strokeStyle = 'rgba(246, 240, 222, 0.78)';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.arc(r, r, r * 0.742, 0, TWO_PI);
    ctx.stroke();

    // Subtle classical cardinal & intercardinal filigree ticks between the double rings
    ctx.strokeStyle = 'rgba(255, 250, 232, 0.72)';
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * TWO_PI;
      const cA = Math.cos(ang);
      const sA = Math.sin(ang);
      const isMajor = i % 4 === 0;
      ctx.lineWidth = isMajor ? 3.0 : 1.6;
      const r0 = isMajor ? r * 0.705 : r * 0.752;
      const r1 = r * 0.842;
      ctx.beginPath();
      ctx.moveTo(r + cA * r0, r + sA * r0);
      ctx.lineTo(r + cA * r1, r + sA * r1);
      ctx.stroke();

      if (isMajor) {
        ctx.fillStyle = 'rgba(255, 252, 238, 0.90)';
        ctx.beginPath();
        ctx.arc(r + cA * (r * 0.672), r + sA * (r * 0.672), 3.6, 0, TWO_PI);
        ctx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function generateFoliageBarkBump(THREE) {
    const size = 256;
    const c = makeCanvas(size, size);
    if (!c) return null;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / size) * TWO_PI;
        const v = (y / size) * TWO_PI;
        const bark = ridgedFbm2D(Math.cos(u) * 3.8 + 5, Math.sin(v) * 1.4 + 9, 4721, 3);
        const tuft = valueNoise2D(Math.cos(u) * 11 + 3, Math.sin(v) * 11 + 7, 4813);
        const val = clamp((bark * 0.58 + tuft * 0.42) * 255, 0, 255) | 0;
        const idx = (y * size + x) * 4;
        img.data[idx] = img.data[idx + 1] = img.data[idx + 2] = val;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return finalizeCanvasTex(THREE, c, false, 3, 3);
  }

  function generateFluidTexture(THREE, kind) {
    const size = 256;
    const c = makeCanvas(size, size);
    if (!c) return null;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const data = img.data;
    const seed = kind === 'lava' ? 9931 : 6143;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Tileable periodic sampling via sin/cos domain warp
        const nx = Math.cos((x / size) * TWO_PI) * 1.6 + 2.0;
        const ny = (y / size) * 6.0;
        const n1 = fbm2D(nx, ny, seed, 3);
        const n2 = valueNoise2D((x / size) * 8, (y / size) * 14, seed + 71);
        const v = n1 * 0.68 + n2 * 0.32;
        const idx = (y * size + x) * 4;

        if (kind === 'lava') {
          const hot = smoothstep(0.36, 0.82, v);
          data[idx] = clamp((45 + hot * 210) | 0, 0, 255);
          data[idx + 1] = clamp((10 + Math.pow(hot, 1.7) * 195) | 0, 0, 255);
          data[idx + 2] = clamp((8 + Math.pow(hot, 3.2) * 90) | 0, 0, 255);
          data[idx + 3] = 255;
        } else {
          const foam = smoothstep(0.62, 0.88, v);
          data[idx] = clamp((28 + v * 58 + foam * 135) | 0, 0, 255);
          data[idx + 1] = clamp((58 + v * 84 + foam * 115) | 0, 0, 255);
          data[idx + 2] = clamp((78 + v * 96 + foam * 105) | 0, 0, 255);
          data[idx + 3] = 235;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return finalizeCanvasTex(THREE, c, true, 1, 5);
  }

  function generateTerrainMicroDetail(THREE) {
    const size = 512;
    const bmpC = makeCanvas(size, size);
    const rghC = makeCanvas(size, size);
    if (!bmpC) return {};
    const bctx = bmpC.getContext('2d');
    const rctx = rghC.getContext('2d');
    const bImg = bctx.createImageData(size, size);
    const rImg = rctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Tileable multi-frequency rock/turf grain
        const u = (x / size) * TWO_PI;
        const v = (y / size) * TWO_PI;
        const n1 = fbm2D(Math.cos(u) * 2.2 + 4, Math.sin(v) * 2.2 + 4, 3001, 4);
        const n2 = valueNoise2D(Math.cos(u) * 7 + 11, Math.sin(v) * 7 + 11, 3089);
        const h = clamp((n1 * 0.65 + n2 * 0.35) * 255, 0, 255) | 0;
        const r = clamp(185 + (0.5 - n1) * 95, 110, 250) | 0;
        const idx = (y * size + x) * 4;
        bImg.data[idx] = bImg.data[idx + 1] = bImg.data[idx + 2] = h;
        bImg.data[idx + 3] = 255;
        rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = r;
        rImg.data[idx + 3] = 255;
      }
    }
    bctx.putImageData(bImg, 0, 0);
    rctx.putImageData(rImg, 0, 0);

    return {
      bumpMap: finalizeCanvasTex(THREE, bmpC, false, 15, 10),
      roughnessMap: finalizeCanvasTex(THREE, rghC, false, 15, 10)
    };
  }

  function generateGlowSpriteTexture(THREE) {
    const size = 128;
    const c = makeCanvas(size, size);
    if (!c) return null;
    const ctx = c.getContext('2d');
    const r = size * 0.5;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, 'rgba(255, 250, 220, 1)');
    g.addColorStop(0.28, 'rgba(255, 185, 75, 0.72)');
    g.addColorStop(0.65, 'rgba(255, 105, 20, 0.22)');
    g.addColorStop(1, 'rgba(255, 80, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function generateSunbeamTexture(THREE) {
    const w = 128;
    const h = 256;
    const c = makeCanvas(w, h);
    if (!c) return null;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const vt = y / (h - 1);
      const vFade = Math.pow(Math.sin(vt * Math.PI), 1.35) * (1 - vt * 0.38);
      for (let x = 0; x < w; x++) {
        const ut = (x / (w - 1)) * 2 - 1;
        // Pure smooth Gaussian mist falloff — zero periodic sine stripes!
        const hFade = Math.exp(-ut * ut * 4.4);
        const a = clamp(vFade * hFade * 255, 0, 255) | 0;
        const idx = (y * w + x) * 4;
        img.data[idx] = 255;
        img.data[idx + 1] = 238;
        img.data[idx + 2] = 198;
        img.data[idx + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  // ============================================================================
  // Main Class: TD.Environment3D
  // ============================================================================
  class Environment3D {
    constructor(scene3d) {
      const THREE = window.THREE;
      this.THREE = THREE;
      this.scene3d = scene3d || null;
      this.scene = (scene3d && scene3d.isScene)
        ? scene3d
        : (scene3d && scene3d.scene ? scene3d.scene : null);

      this.root = THREE ? new THREE.Group() : null;
      const hostGroup = (scene3d && scene3d.envGroup) ? scene3d.envGroup : this.scene;
      if (this.root) {
        this.root.name = 'Environment3D';
        if (hostGroup) hostGroup.add(this.root);
      }

      this.mapId = null;
      this.mapData = null;

      // Disposables tracked per map build (cleaned on clearMap / dispose)
      this._mapGeos = [];
      this._mapMats = [];
      this._mapTexs = [];

      // Shared cached assets across map switches (cleaned on dispose)
      this._sharedTexs = [];
      this._sharedGeos = [];
      this._sharedCache = {};

      // Heightfield lookup state (-90..+90 x -60..+60 at 0.5 world-unit resolution)
      this._hfMinX = -90;
      this._hfMaxX = 90;
      this._hfMinZ = -60;
      this._hfMaxZ = 60;
      this._hfStep = 0.5;
      this._hfCols = 361;
      this._hfRows = 241;
      this._hfGrid = new Float32Array(this._hfCols * this._hfRows);

      this._roadPolys = [];
      this._padWorldList = [];
      this._streamPoly = null;
      this._fissurePolys = [];
      this._exclusionBoxes = [];

      // Exported raycast & visual hooks
      this.terrainMesh = null;
      this.padEntries = [];
      this.padHitMeshes = [];
      this.padMeshes = [];

      // Animated stage lists
      this._torches = [];
      this._banners = [];
      this._fluidTexs = [];
      this._sunbeams = [];
      this._volcanoPuffs = [];
      this._eyeMeshes = [];

      // Lighting handles & Ring of Power transition state
      this.sunLight = null;
      this.hemiLight = null;
      this.rimLight = null;
      this.ambientLight = null;
      this._ownsLights = false;
      this._baseLighting = null;
      this._ringBlend = 0;
      this._elapsed = 0;
      this._hoveredPadId = -1;
      this._selectedPadId = -1;
      this._manualOccupied = {};

      if (THREE) {
        this._initSharedAssets();
      }
    }

    _trackGeo(g) {
      if (g) this._mapGeos.push(g);
      return g;
    }

    _trackMat(m) {
      if (m) this._mapMats.push(m);
      return m;
    }

    _trackTex(t) {
      if (t) this._mapTexs.push(t);
      return t;
    }

    _initSharedAssets() {
      const THREE = this.THREE;
      const regTex = (t) => {
        if (t) this._sharedTexs.push(t);
        return t;
      };
      const regSet = (s) => {
        if (!s) return s;
        if (s.map) regTex(s.map);
        if (s.bumpMap) regTex(s.bumpMap);
        if (s.roughnessMap) regTex(s.roughnessMap);
        return s;
      };

      // Consult TD.ProceduralTextures if provided while baking rich domain textures
      this._sharedCache.extProcedural = TD.ProceduralTextures || null;
      this._sharedCache.cobble_hornburg = regSet(generateCobbleSet(THREE, 'hornburg'));
      this._sharedCache.cobble_pelennor = regSet(generateCobbleSet(THREE, 'pelennor'));
      this._sharedCache.cobble_blackgate = regSet(generateCobbleSet(THREE, 'blackgate'));

      this._sharedCache.ashlar_slate = regSet(generateAshlarSet(THREE, 'slate'));
      this._sharedCache.ashlar_ivory = regSet(generateAshlarSet(THREE, 'ivory'));
      this._sharedCache.ashlar_dark = regSet(generateAshlarSet(THREE, 'dark_numenor'));
      this._sharedCache.ashlar_obsidian = regSet(generateAshlarSet(THREE, 'obsidian'));
      this._sharedCache.timber_roof = regSet(generateTimberRoofSet(THREE));

      this._sharedCache.banner_gondor = regTex(generateBannerTexture(THREE, 'gondor'));
      this._sharedCache.banner_rohan = regTex(generateBannerTexture(THREE, 'rohan'));
      this._sharedCache.banner_mordor = regTex(generateBannerTexture(THREE, 'mordor'));

      this._sharedCache.pad_rune = regTex(generatePadRuneTexture(THREE));
      this._sharedCache.glow_sprite = regTex(generateGlowSpriteTexture(THREE));
      this._sharedCache.sunbeam = regTex(generateSunbeamTexture(THREE));
      this._sharedCache.terrain_micro = regSet(generateTerrainMicroDetail(THREE));
      this._sharedCache.foliage_bump = regTex(generateFoliageBarkBump(THREE));

      // Reusable Organic Instanced Woodland Geometries (Drooping Conifer Pines + Gnarled Broadleaf Oaks + Scorched Mordor Snags)
      this._sharedCache.pineGeo = this._buildConiferPineGeometry(false);
      this._sharedCache.oakGeo = this._buildGnarledOakGeometry();
      this._sharedCache.deadPineGeo = this._buildConiferPineGeometry(true);
      this._sharedCache.boulderGeo = this._buildBoulderGeometry();
      this._sharedCache.stakeGeo = this._buildSiegeStakeGeometry();
      this._sharedCache.curbGeo = this._buildCurbstoneGeometry();
      this._sharedCache.ghostTurretGeo = this._buildGhostTurretGeometry();
      const ghostEdges = new THREE.EdgesGeometry(this._sharedCache.ghostTurretGeo, 27);
      this._sharedGeos.push(ghostEdges);
      this._sharedCache.ghostTurretEdges = ghostEdges;
    }

    _buildConiferPineGeometry(isDeadCharred) {
      const THREE = this.THREE;
      const parts = [];

      if (!isDeadCharred) {
        // 1. Root-flared gnarled bark trunk with organic taper & slight woodland bend
        const trunk = new THREE.CylinderGeometry(0.08, 0.30, 2.75, 7, 3, true);
        const tPos = trunk.attributes.position;
        for (let i = 0; i < tPos.count; i++) {
          let vx = tPos.getX(i);
          const vy = tPos.getY(i);
          let vz = tPos.getZ(i);
          const hf = clamp((vy + 1.375) / 2.75, 0, 1);
          const ang = Math.atan2(vz, vx);
          // 5 buttress root flares near ground + bark ridges
          const rootFlare = (1 - smoothstep(0.0, 0.28, hf)) * (0.28 + 0.22 * Math.cos(ang * 5 + 0.4));
          const barkNoise = 0.90 + 0.18 * valueNoise2D(vx * 6 + 3, vy * 4 + vz * 6, 1701);
          vx = vx * (1 + rootFlare) * barkNoise + Math.sin(hf * Math.PI) * 0.05;
          vz = vz * (1 + rootFlare) * barkNoise - Math.cos(hf * 2.4) * 0.03;
          tPos.setXYZ(i, vx, vy + 1.34, vz);
        }
        trunk.computeVertexNormals();
        paintGeoVertexColor(THREE, trunk, 0x4d3421, 0x1d120a);
        parts.push(trunk);

        // Exposed lower gnarled deadwood stubs beneath lowest skirt
        for (let s = 0; s < 2; s++) {
          const stub = new THREE.CylinderGeometry(0.02, 0.055, 0.65, 4, 1, true);
          stub.rotateZ(0.95 + s * 0.18);
          stub.rotateY(s * 2.65 + 0.5);
          stub.translate(0, 1.08 + s * 0.28, 0);
          paintGeoVertexColor(THREE, stub, 0x422d1d, 0x20150d);
          parts.push(stub);
        }

        // 2. 6 Irregular Star-Fluted / Scalloped Drooping Conifer Bough Tiers (ZERO smooth plastic cones!)
        const tiers = [
          { r: 1.66, h: 1.52, y: 1.72, lobes: 7, droop: 0.42, top: 0x395424, bot: 0x0f1a0b },
          { r: 1.44, h: 1.46, y: 2.52, lobes: 6, droop: 0.38, top: 0x415e28, bot: 0x12200d },
          { r: 1.20, h: 1.38, y: 3.28, lobes: 7, droop: 0.33, top: 0x49682d, bot: 0x152510 },
          { r: 0.95, h: 1.28, y: 4.00, lobes: 6, droop: 0.27, top: 0x517332, bot: 0x182b12 },
          { r: 0.69, h: 1.18, y: 4.66, lobes: 5, droop: 0.21, top: 0x5a7d37, bot: 0x1c3115 },
          { r: 0.42, h: 1.16, y: 5.30, lobes: 5, droop: 0.14, top: 0x64883d, bot: 0x213819 }
        ];

        const cTop = new THREE.Color();
        const cBot = new THREE.Color();

        for (let ti = 0; ti < tiers.length; ti++) {
          const t = tiers[ti];
          const phase = ti * 2.39996; // Golden-angle offset so bough fronds interleave organically
          const cone = new THREE.ConeGeometry(t.r, t.h, 13, 2, true);
          const pos = cone.attributes.position;
          const cols = new Float32Array(pos.count * 3);
          cTop.setHex(t.top);
          cBot.setHex(t.bot);

          for (let k = 0; k < pos.count; k++) {
            let vx = pos.getX(k);
            let vy = pos.getY(k);
            let vz = pos.getZ(k);
            const hf = clamp((vy + t.h * 0.5) / t.h, 0, 1);
            const radDist = Math.hypot(vx, vz);

            let frondOut = 0.5;
            if (radDist > 1e-4 && hf < 0.98) {
              const ang = Math.atan2(vz, vx);
              const wave1 = Math.cos(ang * t.lobes + phase);
              const wave2 = Math.sin(ang * (t.lobes * 2 - 1) - phase * 1.6);
              const nTuft = valueNoise2D(Math.cos(ang) * 3.2 + ti * 5, Math.sin(ang) * 3.2 + hf * 4, 2309 + ti * 41);
              // Deep scalloped bough fingers + flared spruce bell curve
              const scallop = 0.72 + 0.27 * wave1 + 0.13 * wave2 + 0.14 * (nTuft - 0.5);
              const bellCurve = 1.0 + 0.16 * Math.sin((1 - hf) * Math.PI);
              const scaleR = scallop * bellCurve;
              vx *= scaleR;
              vz *= scaleR;
              frondOut = clamp((scallop - 0.58) / 0.56, 0, 1);

              // Heavy drooping evergreen boughs sagging at outer frond tips, curling slightly at needle ends
              const sag = Math.pow(1 - hf, 1.35) * t.droop * (0.45 + 0.75 * frondOut);
              const tipCurl = Math.pow(1 - hf, 4.0) * 0.08 * frondOut;
              vy = vy - sag + tipCurl + (nTuft - 0.5) * 0.11 * (1 - hf);
            } else if (hf >= 0.98) {
              // Slight natural lean at tier apex
              vx += Math.sin(phase) * 0.04;
              vz += Math.cos(phase) * 0.04;
            }

            pos.setXYZ(k, vx + Math.sin(ti * 1.3) * 0.035, vy + t.y, vz + Math.cos(ti * 1.7) * 0.035);

            // Sunlit outer frond tips vs deep AO inner bough shadow
            const shade = clamp(hf * 0.52 + frondOut * 0.48, 0, 1);
            cols[k * 3] = lerp(cBot.r, cTop.r, shade);
            cols[k * 3 + 1] = lerp(cBot.g, cTop.g, shade);
            cols[k * 3 + 2] = lerp(cBot.b, cTop.b, shade);
          }

          cone.setAttribute('color', new THREE.BufferAttribute(cols, 3));
          cone.computeVertexNormals();
          parts.push(cone);
        }

        // 3. Asymmetric secondary needle-tuft clusters breaking up the silhouette
        const tufts = [
          { x: 0.60, y: 2.08, z: 0.34, rx: 0.54, ry: 0.32, rz: 0.50, col: 0x44622a },
          { x: -0.52, y: 2.95, z: -0.36, rx: 0.46, ry: 0.28, rz: 0.44, col: 0x4b6b2e },
          { x: 0.30, y: 3.92, z: -0.40, rx: 0.38, ry: 0.24, rz: 0.36, col: 0x567835 }
        ];
        for (let i = 0; i < tufts.length; i++) {
          const tf = tufts[i];
          const g = new THREE.IcosahedronGeometry(1.0, 0);
          const gp = g.attributes.position;
          for (let k = 0; k < gp.count; k++) {
            const gx = gp.getX(k);
            const gy = gp.getY(k);
            const gz = gp.getZ(k);
            const n = 0.78 + 0.34 * valueNoise2D(gx * 3.1 + i * 7, gz * 3.1 + gy * 2.5, 3191);
            gp.setXYZ(k, gx * tf.rx * n + tf.x, gy * tf.ry * n + tf.y, gz * tf.rz * n + tf.z);
          }
          g.computeVertexNormals();
          paintGeoVertexColor(THREE, g, tf.col, 0x14220f);
          parts.push(g);
        }
      } else {
        // Twisted, gnarled charred Mordor deadwood snag with crooked forked limbs
        const snag = new THREE.CylinderGeometry(0.04, 0.30, 4.15, 6, 5, true);
        const sPos = snag.attributes.position;
        for (let i = 0; i < sPos.count; i++) {
          let vx = sPos.getX(i);
          const vy = sPos.getY(i);
          let vz = sPos.getZ(i);
          const hf = clamp((vy + 2.075) / 4.15, 0, 1);
          const ang = Math.atan2(vz, vx);
          const flare = (1 - smoothstep(0, 0.24, hf)) * (0.36 + 0.24 * Math.cos(ang * 4));
          const bendX = Math.sin(hf * 3.6) * 0.28 * hf;
          const bendZ = Math.cos(hf * 2.9) * 0.22 * hf;
          const crag = 0.84 + 0.28 * valueNoise2D(vx * 5 + 2, vy * 3 + vz * 5, 6011);
          vx = vx * (1 + flare) * crag + bendX;
          vz = vz * (1 + flare) * crag + bendZ;
          sPos.setXYZ(i, vx, vy + 2.02, vz);
        }
        snag.computeVertexNormals();
        paintGeoVertexColor(THREE, snag, 0x352b29, 0x191212);
        parts.push(snag);

        const limbs = [
          { y: 1.55, len: 1.45, rz: 0.92, ry: 0.3, r0: 0.025, r1: 0.085 },
          { y: 2.15, len: 1.65, rz: -1.04, ry: 2.1, r0: 0.022, r1: 0.08 },
          { y: 2.75, len: 1.35, rz: 0.84, ry: 3.9, r0: 0.02, r1: 0.07 },
          { y: 3.30, len: 1.05, rz: -0.78, ry: 5.2, r0: 0.018, r1: 0.055 },
          { y: 3.65, len: 0.82, rz: 0.62, ry: 1.4, r0: 0.015, r1: 0.045 }
        ];
        for (let b = 0; b < limbs.length; b++) {
          const lb = limbs[b];
          const br = new THREE.CylinderGeometry(lb.r0, lb.r1, lb.len, 4, 2, true);
          const bp = br.attributes.position;
          for (let k = 0; k < bp.count; k++) {
            const by = bp.getY(k);
            const bhf = clamp((by + lb.len * 0.5) / lb.len, 0, 1);
            bp.setX(k, bp.getX(k) + Math.sin(bhf * Math.PI) * 0.12);
          }
          br.translate(0, lb.len * 0.46, 0);
          br.rotateZ(lb.rz);
          br.rotateY(lb.ry);
          br.translate(Math.sin(lb.y * 0.8) * 0.14, lb.y, 0);
          br.computeVertexNormals();
          paintGeoVertexColor(THREE, br, 0x3d302d, 0x1c1414);
          parts.push(br);
        }
      }

      const merged = mergeGeometriesSimple(THREE, parts);
      for (let i = 0; i < parts.length; i++) parts[i].dispose();
      this._sharedGeos.push(merged);
      return merged;
    }

    _buildGnarledOakGeometry() {
      const THREE = this.THREE;
      const parts = [];

      // 1. Thick gnarled broadleaf oak trunk with root buttresses
      const trunk = new THREE.CylinderGeometry(0.18, 0.38, 2.05, 7, 3, true);
      const tp = trunk.attributes.position;
      for (let i = 0; i < tp.count; i++) {
        let vx = tp.getX(i);
        const vy = tp.getY(i);
        let vz = tp.getZ(i);
        const hf = clamp((vy + 1.025) / 2.05, 0, 1);
        const ang = Math.atan2(vz, vx);
        const flare = (1 - smoothstep(0, 0.34, hf)) * (0.34 + 0.20 * Math.cos(ang * 5 + 1.1));
        const gnarl = 0.88 + 0.22 * valueNoise2D(vx * 5 + 9, vy * 3.5 + vz * 5, 7103);
        vx = vx * (1 + flare) * gnarl + Math.sin(hf * 2.6) * 0.11;
        vz = vz * (1 + flare) * gnarl + Math.cos(hf * 2.1) * 0.08;
        tp.setXYZ(i, vx, vy + 0.98, vz);
      }
      trunk.computeVertexNormals();
      paintGeoVertexColor(THREE, trunk, 0x523a26, 0x21160d);
      parts.push(trunk);

      // 3 Spreading primary oak boughs cradling the foliage canopy
      const boughs = [
        { rz: 0.62, ry: 0.2, len: 1.55, ox: 0.08, oz: 0.04 },
        { rz: 0.68, ry: 2.35, len: 1.48, ox: 0.05, oz: -0.04 },
        { rz: 0.58, ry: 4.45, len: 1.42, ox: -0.04, oz: 0.05 }
      ];
      for (let i = 0; i < boughs.length; i++) {
        const bg = boughs[i];
        const limb = new THREE.CylinderGeometry(0.08, 0.17, bg.len, 5, 1, true);
        limb.translate(0, bg.len * 0.45, 0);
        limb.rotateZ(bg.rz);
        limb.rotateY(bg.ry);
        limb.translate(bg.ox, 1.72, bg.oz);
        limb.computeVertexNormals();
        paintGeoVertexColor(THREE, limb, 0x4b3522, 0x241910);
        parts.push(limb);
      }

      // 2. 7 Craggy, Faceted Layered Woodland Bough Clusters (deep muted forest-olive, moss & russet — zero round spheres!)
      const clusters = [
        { x: 0.00, y: 4.02, z: 0.00, rx: 1.26, ry: 0.54, rz: 1.22, top: 0x2e3921, bot: 0x0d150a },
        { x: 0.96, y: 2.90, z: 0.46, rx: 1.18, ry: 0.48, rz: 1.08, top: 0x25341e, bot: 0x0b1208 },
        { x: -0.92, y: 2.84, z: 0.50, rx: 1.14, ry: 0.47, rz: 1.04, top: 0x29361f, bot: 0x0b1309 },
        { x: -0.22, y: 2.96, z: -0.94, rx: 1.16, ry: 0.48, rz: 1.10, top: 0x38351f, bot: 0x11140b },
        { x: 0.68, y: 3.44, z: -0.66, rx: 1.02, ry: 0.46, rz: 0.98, top: 0x2e3921, bot: 0x0d150a },
        { x: -0.70, y: 3.48, z: -0.26, rx: 1.00, ry: 0.46, rz: 0.96, top: 0x25341e, bot: 0x0c1409 },
        { x: 0.28, y: 4.46, z: 0.24, rx: 0.96, ry: 0.44, rz: 0.92, top: 0x353d22, bot: 0x10180b }
      ];

      const cTop = new THREE.Color();
      const cBot = new THREE.Color();

      for (let ci = 0; ci < clusters.length; ci++) {
        const cl = clusters[ci];
        // Detail 1 icosahedron + aggressive ridged/lobed displacement + non-indexed crisp facets!
        const baseLeaf = new THREE.IcosahedronGeometry(1.0, 1);
        const lpBase = baseLeaf.attributes.position;
        for (let k = 0; k < lpBase.count; k++) {
          const lx = lpBase.getX(k);
          const ly = lpBase.getY(k);
          const lz = lpBase.getZ(k);
          const ang = Math.atan2(lz, lx);
          const n1 = ridgedFbm2D(lx * 2.4 + ci * 5.3, lz * 2.4 + ly * 2.1, 8209 + ci * 29, 3);
          const lobe = 0.84 + 0.24 * Math.cos(ang * 5 + ci * 1.7) + 0.14 * Math.sin(ang * 9 - ci);
          const disp = (0.62 + 0.52 * n1) * lobe;
          // Droop outer bough edges slightly like ancient Middle-earth oaks
          const rHoriz = Math.hypot(lx, lz);
          const edgeDroop = -0.16 * rHoriz * rHoriz;
          lpBase.setXYZ(
            k,
            lx * cl.rx * disp + cl.x,
            ly * cl.ry * (0.78 + 0.35 * n1) + edgeDroop + cl.y,
            lz * cl.rz * disp + cl.z
          );
        }
        const leaf = baseLeaf.index ? baseLeaf.toNonIndexed() : baseLeaf;
        if (leaf !== baseLeaf) baseLeaf.dispose();
        leaf.computeVertexNormals();

        const lp = leaf.attributes.position;
        const ln = leaf.attributes.normal;
        const lCols = new Float32Array(lp.count * 3);
        cTop.setHex(cl.top);
        cBot.setHex(cl.bot);

        for (let k = 0; k < lp.count; k++) {
          const wy = lp.getY(k);
          const ny = ln.getY(k);
          const n2 = valueNoise2D(lp.getX(k) * 3.8 - ci, lp.getZ(k) * 3.8, 8419 + ci * 17);
          const sunAmt = clamp((ny * 0.5 + 0.5) * 0.68 + (wy - 2.3) * 0.12 + (n2 - 0.5) * 0.14, 0, 1);
          lCols[k * 3] = lerp(cBot.r, cTop.r, sunAmt);
          lCols[k * 3 + 1] = lerp(cBot.g, cTop.g, sunAmt);
          lCols[k * 3 + 2] = lerp(cBot.b, cTop.b, sunAmt);
        }

        leaf.setAttribute('color', new THREE.BufferAttribute(lCols, 3));
        parts.push(leaf);
      }

      const merged = mergeGeometriesSimple(THREE, parts);
      for (let i = 0; i < parts.length; i++) parts[i].dispose();
      this._sharedGeos.push(merged);
      return merged;
    }

    _buildBoulderGeometry() {
      const THREE = this.THREE;
      const geo = new THREE.IcosahedronGeometry(1.0, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);
        const n = 0.78 + 0.34 * valueNoise2D(vx * 2.3 + 7, vz * 2.3 + vy * 1.7, 907);
        pos.setXYZ(i, vx * n, (vy * 0.76 + 0.22) * n, vz * n);
      }
      geo.computeVertexNormals();
      paintGeoVertexColor(THREE, geo, 0xffffff, 0x7a7e82);
      this._sharedGeos.push(geo);
      return geo;
    }

    _buildSiegeStakeGeometry() {
      const THREE = this.THREE;
      const parts = [];
      const angles = [
        { rz: 0.58, rx: 0.22, ox: -0.35 },
        { rz: -0.58, rx: -0.22, ox: 0.35 },
        { rz: 0.12, rx: 0.62, ox: 0.0 }
      ];
      for (let i = 0; i < angles.length; i++) {
        const a = angles[i];
        const beam = new THREE.ConeGeometry(0.11, 1.85, 5);
        beam.translate(0, 0.72, 0);
        beam.rotateZ(a.rz);
        beam.rotateX(a.rx);
        beam.translate(a.ox, 0.05, 0);
        paintGeoVertexColor(THREE, beam, 0x7c5c3e, 0x38281a);
        parts.push(beam);
      }
      const cross = new THREE.BoxGeometry(1.35, 0.14, 0.16);
      cross.translate(0, 0.48, 0);
      paintGeoVertexColor(THREE, cross, 0x5c432c, 0x3a291a);
      parts.push(cross);

      const merged = mergeGeometriesSimple(THREE, parts);
      for (let i = 0; i < parts.length; i++) parts[i].dispose();
      this._sharedGeos.push(merged);
      return merged;
    }

    _buildCurbstoneGeometry() {
      const THREE = this.THREE;
      // Chamfered 3D curbstone block
      const geo = new THREE.CylinderGeometry(0.46, 0.54, 0.17, 4);
      geo.rotateY(Math.PI * 0.25);
      geo.scale(1.38, 1.0, 0.62);
      geo.translate(0, 0.075, 0);
      geo.computeVertexNormals();
      paintGeoVertexColor(THREE, geo, 0xffffff, 0x8d8d8d);
      this._sharedGeos.push(geo);
      return geo;
    }

    _buildGhostTurretGeometry() {
      const THREE = this.THREE;
      const parts = [];

      // 24 radial segments (15 deg per facet < 27 deg edge threshold -> ZERO vertical wireframe cage lines!)
      // 1. Two-tier moulded classical stone base plinth
      const baseLower = new THREE.CylinderGeometry(1.18, 1.30, 0.18, 24);
      baseLower.translate(0, 0.09, 0);
      parts.push(baseLower);

      const baseUpper = new THREE.CylinderGeometry(0.98, 1.14, 0.20, 24);
      baseUpper.translate(0, 0.28, 0);
      parts.push(baseUpper);

      // 2. Gracefully waisted classical turret drum shaft
      const shaftLower = new THREE.CylinderGeometry(0.78, 0.94, 0.72, 24);
      shaftLower.translate(0, 0.74, 0);
      parts.push(shaftLower);

      const shaftUpper = new THREE.CylinderGeometry(0.80, 0.78, 0.72, 24);
      shaftUpper.translate(0, 1.46, 0);
      parts.push(shaftUpper);

      // 4 Classical arched lancet frames & vertical buttress ribs on N/S/E/W faces
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * TWO_PI + Math.PI * 0.25;
        const rib = new THREE.BoxGeometry(0.14, 1.32, 0.12);
        rib.rotateY(-ang + HALF_PI);
        rib.translate(Math.cos(ang) * 0.82, 1.12, Math.sin(ang) * 0.82);
        parts.push(rib);
      }

      // 3. Flared corbelled machicolation cornice + moulded parapet collar
      const corbel = new THREE.CylinderGeometry(1.04, 0.80, 0.24, 24);
      corbel.translate(0, 1.94, 0);
      parts.push(corbel);

      const parapetWall = new THREE.CylinderGeometry(1.08, 1.04, 0.20, 24, 1, true);
      parapetWall.translate(0, 2.16, 0);
      parts.push(parapetWall);

      const parapetDeck = new THREE.CylinderGeometry(1.02, 1.02, 0.06, 24);
      parapetDeck.translate(0, 2.08, 0);
      parts.push(parapetDeck);

      // 4. 8 Crisp classical crenellation merlons crowning the turret (matching bottom-left of reference image!)
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * TWO_PI;
        const merlon = new THREE.BoxGeometry(0.34, 0.28, 0.18);
        merlon.rotateY(-ang + HALF_PI);
        merlon.translate(Math.cos(ang) * 0.98, 2.38, Math.sin(ang) * 0.98);
        parts.push(merlon);
      }

      const merged = mergeGeometriesSimple(THREE, parts);
      for (let i = 0; i < parts.length; i++) parts[i].dispose();
      this._sharedGeos.push(merged);
      return merged;
    }

    // ==========================================================================
    // Public Map Lifecycle & Heightfield Queries
    // ==========================================================================
    initMap(mapId, mapData) {
      return this.buildMap(mapId, mapData);
    }

    setMap(mapId, mapData) {
      return this.buildMap(mapId, mapData);
    }

    buildMap(mapId, mapData) {
      const THREE = this.THREE;
      if (!THREE) return this;

      const resolvedId = mapId || 'hornburg';
      const resolvedData = mapData || (TD.MAPS && TD.MAPS[resolvedId]) || (TD.MAPS && TD.MAPS.hornburg);
      if (!resolvedData) return this;

      this.clearMap();
      if (!this._sharedCache || !this._sharedCache.pineGeo) {
        this._initSharedAssets();
      }

      this.mapId = resolvedData.id || resolvedId;
      this.mapData = resolvedData;

      const hostGroup = (this.scene3d && this.scene3d.envGroup) ? this.scene3d.envGroup : this.scene;
      if (hostGroup && this.root && !this.root.parent) {
        hostGroup.add(this.root);
      }

      // 1. Precompute World-Space Road & Pad Geometry + Heightfield Grid
      this._prepareFieldMetrics(resolvedData);
      this._bakeHeightGrid();

      // 2. Stage Lighting, Atmospheric Fog, Sky Dome & Volumetric Sunbeams
      this._setupAtmosphereAndLighting(this.mapId);
      this._buildSkyDomeAndSunbeams(this.mapId);

      // 3. Distant 3D Mountain Vista, Winding Valley River & Mount Doom
      this._buildDistantVista(this.mapId);

      // 4. High-Res Displaced Terrain + 3D Multi-Layered Cobblestone Roads & Streams
      this._buildDisplacedTerrain(this.mapId);
      this._buildStreamsAndLava(this.mapId);
      this._buildCobblestoneRoads(this.mapId, resolvedData);

      // 5. Colossal 3D Fortresses, Gothic Ruins & Medieval Watchhouses
      this._buildStageFortressesAndRuins(this.mapId, resolvedData);

      // 6. 3D Holographic Build Pads
      this._buildHolographicPads(this.mapId, resolvedData);

      // 7. Instanced 3D Conifer Pine Forests, Mossy Boulders, Stakes & Torches
      this._buildInstancedProps(this.mapId);
      this._buildFlickeringTorches(this.mapId, resolvedData);

      return this;
    }

    _prepareFieldMetrics(mapData) {
      this._roadPolys = [];
      this._padWorldList = [];
      this._exclusionBoxes = [];

      const paths = mapData.paths || [];
      for (let li = 0; li < paths.length; li++) {
        const lane = paths[li];
        if (!lane || lane.length < 2) continue;
        const poly = [];
        // Extend slightly west of spawn & east through gatehouse so units walk on y=0
        const first = lane[0];
        poly.push({ x: toWorldX(first.x) - 6.0, z: toWorldZ(first.y) });
        for (let i = 0; i < lane.length; i++) {
          poly.push({ x: toWorldX(lane[i].x), z: toWorldZ(lane[i].y) });
        }
        const last = lane[lane.length - 1];
        poly.push({ x: toWorldX(last.x) + 6.5, z: toWorldZ(last.y) });
        this._roadPolys.push(poly);
      }

      const pads = mapData.pads || [];
      for (let i = 0; i < pads.length; i++) {
        this._padWorldList.push({
          id: pads[i].id,
          x: toWorldX(pads[i].x),
          z: toWorldZ(pads[i].y),
          pad: pads[i]
        });
      }

      this._streamPoly = HORNBURG_STREAM_GAME.map(p => ({
        x: toWorldX(p.x),
        z: toWorldZ(p.y)
      }));

      this._fissurePolys = BLACKGATE_FISSURES_GAME.map(branch =>
        branch.map(p => ({ x: toWorldX(p.x), z: toWorldZ(p.y) }))
      );
    }

    _distToRoadsWorld(wx, wz) {
      let best = Infinity;
      for (let i = 0; i < this._roadPolys.length; i++) {
        const d = distToPolylineWorld(wx, wz, this._roadPolys[i]);
        if (d < best) best = d;
      }
      return best;
    }

    _distToPadsWorld(wx, wz) {
      let best = Infinity;
      for (let i = 0; i < this._padWorldList.length; i++) {
        const p = this._padWorldList[i];
        const d = Math.hypot(wx - p.x, wz - p.z);
        if (d < best) best = d;
      }
      return best;
    }

    _computeAnalyticHeightWorld(wx, wz) {
      const dRoad = this._distToRoadsWorld(wx, wz);
      const dPad = this._distToPadsWorld(wx, wz);

      // STRICT PLAYABLE FLAT ZONE: roads (< 4.2) and pads (< 3.2) are exact y = 0!
      if (dRoad <= 4.2 || dPad <= 3.2) {
        return 0;
      }

      const roadMask = smoothstep(4.2, 8.6, dRoad) * smoothstep(3.2, 6.4, dPad);
      const mapId = this.mapId;
      const seed = mapId === 'hornburg' ? 1337 : (mapId === 'pelennor' ? 4209 : 9001);

      // Keep south-central foreground low so nothing obscures camera sightlines
      const southForegroundSuppress = 1 - 0.72 * smoothstep(23, 35, wz) * (1 - smoothstep(34, 56, Math.abs(wx)));

      const nBroad = fbm2D(wx * 0.042 + 11, wz * 0.042 + 7, seed, 4);
      const nRidge = ridgedFbm2D(wx * 0.068 - 5, wz * 0.068 + 13, seed + 311, 3);
      let h = 0;

      if (mapId === 'hornburg') {
        // Gentle gorge knolls
        h += (nBroad * 2.4 + nRidge * 1.6 - 0.85) * 0.85 * southForegroundSuppress;

        // Northern Deeping Wall & mountain cliff shelf (wz < -24.5)
        const northCliff = smoothstep(-24.2, -33.5, wz);
        // Scenic valley notch in center-north (-18..+24) so distant peaks show
        const valleyNotch = 1 - 0.52 * Math.exp(-Math.pow((wx - 4) / 22, 2));
        h += northCliff * (5.8 + nRidge * 6.5) * valleyNotch;

        // Upper-left Westfold rocky spur
        const nwSpur = smoothstep(-32, -56, wx) * smoothstep(-18, -32, wz);
        h += nwSpur * (5.2 + nBroad * 4.5);

        // Eastern Hornburg Citadel rock spur (behind gatePoint wx > 56)
        const eastSpur = smoothstep(55.5, 70, wx) * (1 - 0.5 * smoothstep(12, 28, wz));
        h += eastSpur * (6.0 + nRidge * 6.5);

        // Framing south-west & south-east gorge walls
        const swCrag = smoothstep(-44, -66, wx) * smoothstep(14, 34, wz);
        const seCrag = smoothstep(46, 68, wx) * smoothstep(16, 36, wz);
        h += (swCrag + seCrag) * (4.8 + nRidge * 5.2);

        // Carved Deeping Stream channel dipping to y = -1.25
        if (this._streamPoly) {
          const dStream = distToPolylineWorld(wx, wz, this._streamPoly);
          if (dStream < 3.4) {
            const trench = 1 - smoothstep(1.0, 3.4, dStream);
            h = lerp(h, -1.25, trench);
          }
        }
      } else if (mapId === 'pelennor') {
        // Rolling siege plains & grassy ridges
        h += (nBroad * 2.1 + nRidge * 1.1 - 0.9) * 0.78 * southForegroundSuppress;

        // Upper-left Rammas / Osgiliath cliff plateau (matching reference image upper-left castle!)
        const nwCastlePlateau = smoothstep(-32, -48, wx) * smoothstep(-27.5, -36, wz);
        h += nwCastlePlateau * (7.2 + nBroad * 3.2);

        // Northern foothills with wide open Anduin river valley gap (-16..+32)
        const northRim = smoothstep(-28, -46, wz);
        const anduinGap = 1 - 0.76 * Math.exp(-Math.pow((wx - 10) / 24, 2));
        h += northRim * (4.8 + nRidge * 6.2) * anduinGap;

        // Upper-mid-right Gothic ruin ridge
        const neRidge = Math.exp(-Math.pow((wx - 33) / 13, 2)) * smoothstep(-23.5, -32, wz);
        h += neRidge * (3.6 + nRidge * 2.4);

        // Eastern Mount Mindolluin & Minas Tirith tiers behind First Circle Wall
        const eastCitadel = smoothstep(56.5, 74, wx);
        h += eastCitadel * (6.5 + nRidge * 7.5);

        // Bottom-left & bottom-right wooded hills framing watchhouses
        const blHill = smoothstep(-45, -66, wx) * smoothstep(18, 34, wz);
        const brHill = smoothstep(46, 68, wx) * smoothstep(20, 36, wz);
        h += (blHill + brHill) * (4.2 + nBroad * 3.8);

        // Shallow siege bombardment craters
        for (let i = 0; i < PELENNOR_CRATERS_WORLD.length; i++) {
          const c = PELENNOR_CRATERS_WORLD[i];
          const dc = Math.hypot(wx - c.x, wz - c.z);
          if (dc < c.r * 1.35) {
            const bowl = Math.cos(clamp(dc / c.r, 0, 1) * HALF_PI);
            const rim = Math.exp(-Math.pow((dc - c.r * 0.95) / 0.55, 2)) * 0.28;
            h += -0.52 * bowl + rim;
          }
        }
      } else {
        // Black Gate: Jagged Mordor obsidian crags & volcanic fissures
        h += (nRidge * 2.9 + nBroad * 1.4 - 1.05) * 0.85 * southForegroundSuppress;

        // Northern & southern Ephel Duath obsidian walls
        const northCrag = smoothstep(-25.5, -38, wz) * (1 - 0.65 * Math.exp(-Math.pow((wx - 12) / 24, 2)));
        const southCrag = smoothstep(25.5, 40, wz) * (0.35 + 0.65 * smoothstep(28, 52, Math.abs(wx)));
        h += (northCrag + southCrag) * (6.2 + nRidge * 7.8);

        // Western Morannon rampart spurs & Eastern Vanguard bastion cliffs
        const westCliff = smoothstep(-56.5, -72, wx);
        const eastCliff = smoothstep(56.0, 72, wx);
        h += (westCliff + eastCliff) * (5.8 + nRidge * 6.8);

        // Glowing molten lava fissures dipping to y = -1.25
        let minFissure = Infinity;
        for (let i = 0; i < this._fissurePolys.length; i++) {
          const df = distToPolylineWorld(wx, wz, this._fissurePolys[i]);
          const widthScale = i < 2 ? 1.0 : 0.68;
          const normD = df / widthScale;
          if (normD < minFissure) minFissure = normD;
        }
        if (minFissure < 3.1) {
          const fissureCut = 1 - smoothstep(0.95, 3.1, minFissure);
          h = lerp(h, -1.25, fissureCut);
        }
      }

      return clamp(h * roadMask, -1.35, 16.5);
    }

    _bakeHeightGrid() {
      const cols = this._hfCols;
      const rows = this._hfRows;
      const step = this._hfStep;
      const minX = this._hfMinX;
      const minZ = this._hfMinZ;
      const grid = this._hfGrid;

      for (let r = 0; r < rows; r++) {
        const wz = minZ + r * step;
        const rowOff = r * cols;
        for (let c = 0; c < cols; c++) {
          const wx = minX + c * step;
          grid[rowOff + c] = this._computeAnalyticHeightWorld(wx, wz);
        }
      }
    }

    getTerrainHeightWorld(wx, wz) {
      if (!Number.isFinite(wx) || !Number.isFinite(wz)) return 0;
      if (!this.mapData) return 0;

      // Exact 0 fast-check via grid cell bounds; outside [-90..90, -60..60] fall back cleanly
      if (wx < this._hfMinX || wx > this._hfMaxX || wz < this._hfMinZ || wz > this._hfMaxZ) {
        return this._computeAnalyticHeightWorld(wx, wz);
      }

      const gx = (wx - this._hfMinX) / this._hfStep;
      const gz = (wz - this._hfMinZ) / this._hfStep;
      const c0 = clamp(Math.floor(gx), 0, this._hfCols - 2);
      const r0 = clamp(Math.floor(gz), 0, this._hfRows - 2);
      const tx = clamp(gx - c0, 0, 1);
      const tz = clamp(gz - r0, 0, 1);

      const cols = this._hfCols;
      const grid = this._hfGrid;
      const h00 = grid[r0 * cols + c0];
      const h10 = grid[r0 * cols + c0 + 1];
      const h01 = grid[(r0 + 1) * cols + c0];
      const h11 = grid[(r0 + 1) * cols + c0 + 1];

      if (h00 === 0 && h10 === 0 && h01 === 0 && h11 === 0) return 0;
      const dRoad = this._distToRoadsWorld(wx, wz);
      if (dRoad <= 4.2) return 0;
      const dPad = this._distToPadsWorld(wx, wz);
      if (dPad <= 3.2) return 0;

      return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
    }

    getTerrainHeight(gx, gy) {
      return this.getTerrainHeightWorld(toWorldX(gx), toWorldZ(gy));
    }

    getWorldHeight(wx, wz) {
      return this.getTerrainHeightWorld(wx, wz);
    }

    getRaycastTargets() {
      const list = [];
      if (this.terrainMesh) list.push(this.terrainMesh);
      for (let i = 0; i < this.padHitMeshes.length; i++) {
        list.push(this.padHitMeshes[i]);
      }
      return list;
    }

    getTerrainMesh() {
      return this.terrainMesh;
    }

    getPadMeshes() {
      return this.padHitMeshes;
    }

    setPadOccupied(padId, occupied) {
      this._manualOccupied[padId] = !!occupied;
    }

    setHoveredPad(padOrId) {
      if (padOrId === null || padOrId === undefined) this._hoveredPadId = -1;
      else if (typeof padOrId === 'number') this._hoveredPadId = padOrId;
      else if (typeof padOrId.id === 'number') this._hoveredPadId = padOrId.id;
    }

    setSelectedPad(padOrId) {
      if (padOrId === null || padOrId === undefined) this._selectedPadId = -1;
      else if (typeof padOrId === 'number') this._selectedPadId = padOrId;
      else if (typeof padOrId.id === 'number') this._selectedPadId = padOrId.id;
    }

    // ==========================================================================
    // 1. Displaced Terrain (180x120 PlaneGeometry) + Procedural Splat Texture
    // ==========================================================================
    _bakeTerrainSplatTexture(mapId) {
      const THREE = this.THREE;
      const tw = 1024;
      const th = 682;
      const c = makeCanvas(tw, th);
      if (!c) return null;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(tw, th);
      const data = img.data;
      const seed = mapId === 'hornburg' ? 1337 : (mapId === 'pelennor' ? 4209 : 9001);

      for (let py = 0; py < th; py++) {
        const wz = lerp(-60, 60, py / (th - 1));
        for (let px = 0; px < tw; px++) {
          const wx = lerp(-90, 90, px / (tw - 1));
          const h = this.getTerrainHeightWorld(wx, wz);
          const hx = this.getTerrainHeightWorld(wx + 0.65, wz) - h;
          const hz = this.getTerrainHeightWorld(wx, wz + 0.65) - h;
          const slope = Math.hypot(hx, hz) / 0.65;

          const dRoad = this._distToRoadsWorld(wx, wz);
          const dPad = this._distToPadsWorld(wx, wz);
          const n1 = fbm2D(wx * 0.14 + 9, wz * 0.14 + 3, seed, 3);
          const n2 = valueNoise2D(wx * 0.65, wz * 0.65, seed + 271);
          const n3 = valueNoise2D(wx * 1.9, wz * 1.9, seed + 613);
          const grain = n1 * 0.56 + n2 * 0.28 + n3 * 0.16;

          const shoulderBlend = Math.max(
            1 - smoothstep(2.1, 4.9, dRoad),
            1 - smoothstep(2.4, 4.4, dPad)
          );
          const rockSlope = smoothstep(0.32, 0.88, slope + Math.max(0, h - 5.5) * 0.08);

          let r = 0, g = 0, b = 0;

          if (mapId === 'hornburg') {
            // Wet dark forest moss, storm-soaked slate rock & muddy causeway shoulders
            const moss = smoothstep(0.35, 0.75, fbm2D(wx * 0.11 - 4, wz * 0.11 + 8, seed + 91, 3));
            r = lerp(38, 46, moss) + grain * 34;
            g = lerp(49, 72, moss) + grain * 38;
            b = lerp(52, 42, moss) + grain * 34;

            // Muddy trodden road shoulder
            r = lerp(r, 64 + n2 * 24, shoulderBlend * 0.82);
            g = lerp(g, 58 + n2 * 22, shoulderBlend * 0.82);
            b = lerp(b, 50 + n2 * 18, shoulderBlend * 0.82);

            // Chiseled slate cliff face (organic 2D rock mottling, zero contour banding)
            const strata = 0.88 + 0.18 * fbm2D(wx * 0.22, wz * 0.22, seed + 777, 3);
            r = lerp(r, (74 + grain * 44) * strata, rockSlope);
            g = lerp(g, (86 + grain * 48) * strata, rockSlope);
            b = lerp(b, (102 + grain * 54) * strata, rockSlope);

            // Wet dark stream bed
            if (h < -0.15) {
              const wet = smoothstep(-0.15, -1.0, h);
              r = lerp(r, 22 + n2 * 18, wet);
              g = lerp(g, 38 + n2 * 26, wet);
              b = lerp(b, 52 + n2 * 32, wet);
            }
          } else if (mapId === 'pelennor') {
            // Reference-image lush dark olive turf, trodden golden-umber dirt & limestone cliffs
            const lush = smoothstep(0.28, 0.74, fbm2D(wx * 0.095 + 17, wz * 0.095 - 6, seed + 149, 3));
            const scorch = smoothstep(0.58, 0.84, fbm2D(wx * 0.18 + 31, wz * 0.18, seed + 509, 3));
            r = lerp(68, 46, lush) + grain * 36 - scorch * 26;
            g = lerp(66, 74, lush) + grain * 38 - scorch * 26;
            b = lerp(42, 34, lush) + grain * 22 - scorch * 16;

            // Warm trodden dirt & wagon-rutted shoulder along roads/pads (just like reference image!)
            r = lerp(r, 102 + n2 * 30 - n3 * 14, shoulderBlend * 0.88);
            g = lerp(g, 83 + n2 * 25 - n3 * 12, shoulderBlend * 0.88);
            b = lerp(b, 58 + n2 * 18 - n3 * 10, shoulderBlend * 0.88);

            // Bombardment crater soot
            if (h < -0.08) {
              const soot = smoothstep(-0.08, -0.45, h);
              r = lerp(r, 28 + n2 * 14, soot);
              g = lerp(g, 23 + n2 * 12, soot);
              b = lerp(b, 19 + n2 * 10, soot);
            }

            // Weathered Gondorian grey-warm cliff stone (organic 2D rock mottling)
            const strata = 0.88 + 0.18 * fbm2D(wx * 0.22, wz * 0.22, seed + 777, 3);
            r = lerp(r, (98 + grain * 46) * strata, rockSlope);
            g = lerp(g, (95 + grain * 44) * strata, rockSlope);
            b = lerp(b, (89 + grain * 40) * strata, rockSlope);
          } else {
            // Black Gate: Cracked black basalt, ash wastes & glowing orange magma banks
            const ash = fbm2D(wx * 0.12, wz * 0.12, seed + 331, 3);
            r = 38 + grain * 28 + ash * 16;
            g = 33 + grain * 24 + ash * 13;
            b = 42 + grain * 30 + ash * 18;

            // Trampled dark slag shoulder
            r = lerp(r, 58 + n2 * 18, shoulderBlend * 0.72);
            g = lerp(g, 48 + n2 * 15, shoulderBlend * 0.72);
            b = lerp(b, 52 + n2 * 18, shoulderBlend * 0.72);

            // Obsidian cliff facets (organic 2D rock mottling)
            const strata = 0.88 + 0.18 * fbm2D(wx * 0.22, wz * 0.22, seed + 777, 3);
            r = lerp(r, (58 + grain * 36) * strata, rockSlope);
            g = lerp(g, (52 + grain * 32) * strata, rockSlope);
            b = lerp(b, (68 + grain * 40) * strata, rockSlope);

            // Incandescent magma veins along fissure banks
            if (h < -0.06) {
              const heat = smoothstep(-0.06, -1.05, h);
              const crack = smoothstep(0.56, 0.84, n2 * 0.6 + n3 * 0.4);
              r = lerp(r, 145 + crack * 110, heat);
              g = lerp(g, 36 + crack * 95, heat);
              b = lerp(b, 12 + crack * 24, heat);
            }
          }

          const idx = (py * tw + px) * 4;
          data[idx] = clamp(r | 0, 0, 255);
          data[idx + 1] = clamp(g | 0, 0, 255);
          data[idx + 2] = clamp(b | 0, 0, 255);
          data[idx + 3] = 255;
        }
      }

      ctx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      return this._trackTex(tex);
    }

    _buildDisplacedTerrain(mapId) {
      const THREE = this.THREE;
      // Exact requested PlaneGeometry(180, 120, 180, 120)
      const geo = this._trackGeo(new THREE.PlaneGeometry(180, 120, 180, 120));
      geo.rotateX(-HALF_PI);

      const pos = geo.attributes.position;
      const vertCount = pos.count;
      const vColors = new Float32Array(vertCount * 3);

      for (let i = 0; i < vertCount; i++) {
        const wx = pos.getX(i);
        const wz = pos.getZ(i);
        const wy = this.getTerrainHeightWorld(wx, wz);
        pos.setY(i, wy);

        // Subtle linear-space ambient occlusion in trenches & sunlit ridge boost
        const ao = wy < 0
          ? lerp(1.0, 0.78, clamp(-wy / 1.25, 0, 1))
          : lerp(0.96, 1.12, clamp(wy / 12.0, 0, 1));
        vColors[i * 3] = ao;
        vColors[i * 3 + 1] = ao;
        vColors[i * 3 + 2] = ao;
      }

      geo.setAttribute('color', new THREE.BufferAttribute(vColors, 3));
      geo.computeVertexNormals();

      const splatTex = this._bakeTerrainSplatTexture(mapId);
      const micro = this._sharedCache.terrain_micro || {};

      const mat = this._trackMat(new THREE.MeshStandardMaterial({
        map: splatTex,
        bumpMap: micro.bumpMap || null,
        bumpScale: 0.46,
        roughnessMap: micro.roughnessMap || null,
        roughness: mapId === 'hornburg' ? 0.84 : 0.92,
        metalness: 0.04,
        vertexColors: true
      }));

      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'terrain';
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.userData = { isTerrain: true };
      this.root.add(mesh);
      this.terrainMesh = mesh;
      this.terrain = mesh;
    }

    // ==========================================================================
    // 1b. 3D Multi-Layered Cobblestone Roads, Bevelled Curbstones & Bridges
    // ==========================================================================
    _buildCobblestoneRoads(mapId, mapData) {
      const THREE = this.THREE;
      const cobbleKey = 'cobble_' + (mapId === 'hornburg' || mapId === 'pelennor' ? mapId : 'blackgate');
      const cobbleSet = this._sharedCache[cobbleKey] || {};

      const roadMat = this._trackMat(new THREE.MeshStandardMaterial({
        map: cobbleSet.map || null,
        bumpMap: cobbleSet.bumpMap || null,
        bumpScale: 0.34,
        roughnessMap: cobbleSet.roughnessMap || null,
        roughness: mapId === 'hornburg' ? 0.72 : 0.86,
        metalness: 0.06,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      }));

      const curbTransforms = [];
      const curbColors = [];
      const dummy = new THREE.Object3D();
      const rand = mulberry32(mapId === 'hornburg' ? 701 : (mapId === 'pelennor' ? 709 : 719));

      const paths = mapData.paths || [];
      for (let li = 0; li < paths.length; li++) {
        const lane = paths[li];
        if (!lane || lane.length < 2) continue;

        // Resample densely every ~6.5 game px (0.65 world units) for silky-smooth road curves
        const totalPx = lane.totalLength || (TD.MapUtils ? TD.MapUtils.getPathLength(lane) : 900);
        const stepPx = 6.5;
        const pts = [];
        // Start slightly off-left entrance
        pts.push({ x: toWorldX(lane[0].x) - 3.6, z: toWorldZ(lane[0].y) });

        const sampleOut = { x: 0, y: 0, angle: 0 };
        for (let d = 0; d <= totalPx; d += stepPx) {
          if (TD.MapUtils && TD.MapUtils.samplePathAtDistance) {
            TD.MapUtils.samplePathAtDistance(lane, d, sampleOut);
          } else {
            const idx = Math.min(lane.length - 1, Math.floor((d / totalPx) * lane.length));
            sampleOut.x = lane[idx].x;
            sampleOut.y = lane[idx].y;
          }
          const wx = toWorldX(sampleOut.x);
          const wz = toWorldZ(sampleOut.y);
          const prev = pts[pts.length - 1];
          if (!prev || Math.hypot(wx - prev.x, wz - prev.z) >= 0.25) {
            pts.push({ x: wx, z: wz });
          }
        }
        // Extend cleanly into gatehouse threshold
        const endPt = lane[lane.length - 1];
        pts.push({ x: toWorldX(endPt.x) + 3.8, z: toWorldZ(endPt.y) });

        const ribbonGeo = this._trackGeo(this._createRoadRibbonGeometry(pts, 2.22));
        const ribbonMesh = new THREE.Mesh(ribbonGeo, roadMat);
        ribbonMesh.receiveShadow = true;
        ribbonMesh.name = 'CobbleRoad_' + li;
        ribbonMesh.userData = { isTerrain: true, isRoad: true };
        this.root.add(ribbonMesh);

        // Collect 3D bevelled curbstones along both edges
        let accumDist = 0;
        let nextCurbDist = 0.5;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i];
          const p1 = pts[i + 1];
          const dx = p1.x - p0.x;
          const dz = p1.z - p0.z;
          const segLen = Math.hypot(dx, dz);
          if (segLen < 1e-4) continue;
          const yaw = Math.atan2(dx, dz);
          const nx = dz / segLen;
          const nz = -dx / segLen;

          while (nextCurbDist <= accumDist + segLen) {
            const localT = (nextCurbDist - accumDist) / segLen;
            const cx = p0.x + dx * localT;
            const cz = p0.z + dz * localT;

            for (let side = -1; side <= 1; side += 2) {
              const bx = cx + nx * side * 2.12;
              const bz = cz + nz * side * 2.12;

              // Skip curbstone if another lane's center passes right through this point (e.g. Pelennor junction)
              let insideOtherLane = false;
              for (let oli = 0; oli < this._roadPolys.length; oli++) {
                if (oli === li) continue;
                if (distToPolylineWorld(bx, bz, this._roadPolys[oli]) < 1.88) {
                  insideOtherLane = true;
                  break;
                }
              }
              if (insideOtherLane) continue;

              dummy.position.set(bx, 0.01 + (rand() - 0.5) * 0.015, bz);
              dummy.rotation.set(
                (rand() - 0.5) * 0.05,
                yaw + HALF_PI + (rand() - 0.5) * 0.09,
                (rand() - 0.5) * 0.05
              );
              dummy.scale.set(0.86 + rand() * 0.24, 0.88 + rand() * 0.34, 0.88 + rand() * 0.22);
              dummy.updateMatrix();
              curbTransforms.push(dummy.matrix.clone());

              const shade = 0.78 + rand() * 0.34;
              curbColors.push(shade);
            }
            nextCurbDist += 0.98;
          }
          accumDist += segLen;
        }
      }

      // Single InstancedMesh for all bevelled curbstones!
      if (curbTransforms.length > 0) {
        const baseTint = mapId === 'hornburg'
          ? new THREE.Color(0x6d7d8f)
          : (mapId === 'pelennor' ? new THREE.Color(0x9b9282) : new THREE.Color(0x584f62));
        const curbMat = this._trackMat(new THREE.MeshStandardMaterial({
          roughness: 0.84,
          metalness: 0.06,
          vertexColors: true
        }));
        const inst = new THREE.InstancedMesh(this._sharedCache.curbGeo, curbMat, curbTransforms.length);
        inst.castShadow = true;
        inst.receiveShadow = true;
        const tmpCol = new THREE.Color();
        for (let i = 0; i < curbTransforms.length; i++) {
          inst.setMatrixAt(i, curbTransforms[i]);
          const s = curbColors[i];
          tmpCol.setRGB(baseTint.r * s, baseTint.g * s, baseTint.b * s);
          inst.setColorAt(i, tmpCol);
        }
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        this.root.add(inst);
      }

      // Pelennor Octagonal Mosaic Crossroads Plaza at (815, 365)
      if (mapId === 'pelennor') {
        const plazaX = toWorldX(815);
        const plazaZ = toWorldZ(365);
        const plazaGeo = this._trackGeo(new THREE.CylinderGeometry(4.6, 4.85, 0.09, 8));
        plazaGeo.rotateY(Math.PI / 8);
        const plazaMesh = new THREE.Mesh(plazaGeo, roadMat);
        plazaMesh.position.set(plazaX, 0.025, plazaZ);
        plazaMesh.receiveShadow = true;
        this.root.add(plazaMesh);

        const inlayGeo = this._trackGeo(new THREE.RingGeometry(2.9, 3.35, 16));
        inlayGeo.rotateX(-HALF_PI);
        const inlayMat = this._trackMat(new THREE.MeshStandardMaterial({
          color: 0xcfc8b6,
          roughness: 0.78,
          metalness: 0.08
        }));
        const inlay = new THREE.Mesh(inlayGeo, inlayMat);
        inlay.position.set(plazaX, 0.076, plazaZ);
        inlay.receiveShadow = true;
        this.root.add(inlay);
      }

      // Hornburg Stone Culvert Bridge Parapets where road crosses the stream
      if (mapId === 'hornburg' && this._streamPoly) {
        this._buildStreamBridgeParapets();
      }
    }

    _createRoadRibbonGeometry(pts, halfWidth) {
      const THREE = this.THREE;
      // 5-vertex cross-section: outer-left apron -> left curb -> crowned center -> right curb -> outer-right apron
      const profileX = [-halfWidth * 1.12, -halfWidth * 0.88, 0, halfWidth * 0.88, halfWidth * 1.12];
      const profileY = [-0.02, 0.042, 0.062, 0.042, -0.02];
      const profileU = [0.0, 0.12, 0.5, 0.88, 1.0];

      const n = pts.length;
      const cols = 5;
      const positions = new Float32Array(n * cols * 3);
      const uvs = new Float32Array(n * cols * 2);
      const indices = [];

      let dist = 0;
      for (let i = 0; i < n; i++) {
        if (i > 0) {
          dist += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        }

        // Smooth miter normal
        let tx = 0, tz = 0;
        if (i < n - 1) {
          const dx = pts[i + 1].x - pts[i].x;
          const dz = pts[i + 1].z - pts[i].z;
          const l = Math.hypot(dx, dz) || 1;
          tx += dx / l;
          tz += dz / l;
        }
        if (i > 0) {
          const dx = pts[i].x - pts[i - 1].x;
          const dz = pts[i].z - pts[i - 1].z;
          const l = Math.hypot(dx, dz) || 1;
          tx += dx / l;
          tz += dz / l;
        }
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl;
        tz /= tl;
        const nx = tz;
        const nz = -tx;

        for (let c = 0; c < cols; c++) {
          const idx = (i * cols + c) * 3;
          positions[idx] = pts[i].x + nx * profileX[c];
          positions[idx + 1] = profileY[c];
          positions[idx + 2] = pts[i].z + nz * profileX[c];

          const uIdx = (i * cols + c) * 2;
          uvs[uIdx] = profileU[c];
          uvs[uIdx + 1] = dist * 0.24;
        }

        if (i < n - 1) {
          for (let c = 0; c < cols - 1; c++) {
            const a = i * cols + c;
            const b = a + 1;
            const d = (i + 1) * cols + c;
            const e = d + 1;
            indices.push(a, d, b, b, d, e);
          }
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    }

    _buildStreamBridgeParapets() {
      const THREE = this.THREE;
      const slate = this._sharedCache.ashlar_slate || {};
      const bridgeMat = this._trackMat(new THREE.MeshStandardMaterial({
        map: slate.map || null,
        bumpMap: slate.bumpMap || null,
        bumpScale: 0.28,
        color: 0x8899ab,
        roughness: 0.82
      }));

      // Locate exact points where HORNBURG_STREAM crosses the road
      const crossings = [
        { x: toWorldX(408), z: toWorldZ(550), yaw: 0 },
        { x: toWorldX(545), z: toWorldZ(235), yaw: 0.65 }
      ];

      for (let i = 0; i < crossings.length; i++) {
        const cr = crossings[i];
        const grp = new THREE.Group();
        grp.position.set(cr.x, 0, cr.z);
        grp.rotation.y = cr.yaw;

        for (let side = -1; side <= 1; side += 2) {
          const wallGeo = this._trackGeo(new THREE.BoxGeometry(3.8, 0.68, 0.44));
          const wall = new THREE.Mesh(wallGeo, bridgeMat);
          wall.position.set(0, 0.30, side * 2.42);
          wall.castShadow = true;
          wall.receiveShadow = true;
          grp.add(wall);

          for (let p = -1; p <= 1; p += 2) {
            const postGeo = this._trackGeo(new THREE.BoxGeometry(0.58, 0.92, 0.58));
            const post = new THREE.Mesh(postGeo, bridgeMat);
            post.position.set(p * 1.85, 0.42, side * 2.42);
            post.castShadow = true;
            post.receiveShadow = true;
            grp.add(post);
          }
        }
        this.root.add(grp);
      }
    }

    _buildStreamsAndLava(mapId) {
      const THREE = this.THREE;
      if (mapId === 'hornburg' && this._streamPoly) {
        const waterTex = this._trackTex(generateFluidTexture(THREE, 'water'));
        if (waterTex) this._fluidTexs.push({ tex: waterTex, speedY: -0.65, speedX: 0.06 });

        const streamGeo = this._trackGeo(this._createFlatPolyRibbon(this._streamPoly, 1.55, -0.52));
        const streamMat = this._trackMat(new THREE.MeshStandardMaterial({
          map: waterTex,
          color: 0x7bc8eb,
          emissive: 0x16384c,
          emissiveIntensity: 0.45,
          roughness: 0.18,
          metalness: 0.35,
          transparent: true,
          opacity: 0.88
        }));
        const streamMesh = new THREE.Mesh(streamGeo, streamMat);
        streamMesh.receiveShadow = true;
        this.root.add(streamMesh);
      } else if (mapId === 'blackgate' && this._fissurePolys.length > 0) {
        const lavaTex = this._trackTex(generateFluidTexture(THREE, 'lava'));
        const lavaMat = this._trackMat(new THREE.MeshStandardMaterial({
          map: lavaTex,
          color: 0xff7020,
          emissive: 0xd93800,
          emissiveMap: lavaTex,
          emissiveIntensity: 0.92,
          roughness: 0.48
        }));
        if (lavaTex) {
          this._fluidTexs.push({ tex: lavaTex, speedY: -0.22, speedX: 0.05, mat: lavaMat, isLava: true });
        }

        for (let i = 0; i < this._fissurePolys.length; i++) {
          const halfW = i < 2 ? 1.45 : 0.95;
          const fGeo = this._trackGeo(this._createFlatPolyRibbon(this._fissurePolys[i], halfW, -0.54));
          const fMesh = new THREE.Mesh(fGeo, lavaMat);
          this.root.add(fMesh);
        }
      }
    }

    _createFlatPolyRibbon(poly, halfWidth, yPos) {
      const THREE = this.THREE;
      // Densify polyline so curved stream/lava channels smoothly hug trenches
      const pts = [poly[0]];
      for (let i = 0; i < poly.length - 1; i++) {
        const a = poly[i];
        const b = poly[i + 1];
        const segLen = Math.hypot(b.x - a.x, b.z - a.z);
        const steps = Math.max(1, Math.ceil(segLen / 1.4));
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          pts.push({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) });
        }
      }

      const n = pts.length;
      const positions = new Float32Array(n * 2 * 3);
      const uvs = new Float32Array(n * 2 * 2);
      const indices = [];
      let dist = 0;

      for (let i = 0; i < n; i++) {
        if (i > 0) dist += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        const prev = pts[Math.max(0, i - 1)];
        const next = pts[Math.min(n - 1, i + 1)];
        const dx = next.x - prev.x;
        const dz = next.z - prev.z;
        const l = Math.hypot(dx, dz) || 1;
        const nx = dz / l;
        const nz = -dx / l;

        for (let s = 0; s < 2; s++) {
          const side = s === 0 ? -1 : 1;
          const pIdx = (i * 2 + s) * 3;
          positions[pIdx] = pts[i].x + nx * side * halfWidth;
          positions[pIdx + 1] = yPos;
          positions[pIdx + 2] = pts[i].z + nz * side * halfWidth;

          const uIdx = (i * 2 + s) * 2;
          uvs[uIdx] = s;
          uvs[uIdx + 1] = dist * 0.18;
        }

        if (i < n - 1) {
          const a = i * 2;
          indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    }

    // ==========================================================================
    // 2. Colossal 3D Fortresses, Ruins, Watchhouses & Distant Mountain Vista
    // ==========================================================================
    _addExclusionBox(minX, maxX, minZ, maxZ) {
      this._exclusionBoxes.push({ minX, maxX, minZ, maxZ });
    }

    _isExcluded(wx, wz, padMargin) {
      const m = padMargin || 0;
      for (let i = 0; i < this._exclusionBoxes.length; i++) {
        const b = this._exclusionBoxes[i];
        if (wx >= b.minX - m && wx <= b.maxX + m && wz >= b.minZ - m && wz <= b.maxZ + m) {
          return true;
        }
      }
      return false;
    }

    _makeCastleMaterials(mapId) {
      const THREE = this.THREE;
      const timberCommon = this._trackMat(new THREE.MeshStandardMaterial({
        map: this._sharedCache.timber_roof.map,
        bumpMap: this._sharedCache.foliage_bump || this._sharedCache.timber_roof.bumpMap,
        bumpScale: 0.22,
        color: mapId === 'blackgate' ? 0x362926 : 0x5c422c,
        roughness: 0.84,
        metalness: 0.05
      }));
      const ironCommon = this._trackMat(new THREE.MeshStandardMaterial({
        color: 0x262a32,
        roughness: 0.48,
        metalness: 0.74
      }));

      if (mapId === 'hornburg') {
        const s = this._sharedCache.ashlar_slate || {};
        return {
          wall: this._trackMat(new THREE.MeshStandardMaterial({
            map: s.map, bumpMap: s.bumpMap, bumpScale: 0.34,
            color: 0xcadbee, roughness: 0.74, metalness: 0.08
          })),
          trim: this._trackMat(new THREE.MeshStandardMaterial({
            map: s.map, bumpMap: s.bumpMap, bumpScale: 0.24,
            color: 0xdfecfa, roughness: 0.68, metalness: 0.10
          })),
          dark: this._trackMat(new THREE.MeshStandardMaterial({
            color: 0x161f29, roughness: 0.90, metalness: 0.22
          })),
          roof: this._trackMat(new THREE.MeshStandardMaterial({
            map: this._sharedCache.timber_roof.map,
            bumpMap: this._sharedCache.timber_roof.bumpMap,
            bumpScale: 0.30, color: 0x5c7288, roughness: 0.74
          })),
          plaster: this._trackMat(new THREE.MeshStandardMaterial({
            color: 0xc4beb0, roughness: 0.86, metalness: 0.02
          })),
          windowGlow: this._trackMat(new THREE.MeshStandardMaterial({
            color: 0xffc978, emissive: 0xff9228, emissiveIntensity: 0.86, roughness: 0.32
          })),
          relief: this._trackMat(new THREE.MeshStandardMaterial({
            color: 0xe6c365, emissive: 0x6e4e12, emissiveIntensity: 0.22, roughness: 0.42, metalness: 0.58
          })),
          timber: timberCommon,
          iron: ironCommon,
          bannerTex: this._sharedCache.banner_rohan
        };
      }

      if (mapId === 'pelennor') {
        const iv = this._sharedCache.ashlar_ivory || {};
        const dk = this._sharedCache.ashlar_dark || {};
        return {
          wall: this._trackMat(new THREE.MeshStandardMaterial({
            map: iv.map, bumpMap: iv.bumpMap, bumpScale: 0.30,
            color: 0xdad2c2, roughness: 0.75, metalness: 0.05
          })),
          outerBlackWall: this._trackMat(new THREE.MeshStandardMaterial({
            map: dk.map, bumpMap: dk.bumpMap, bumpScale: 0.32,
            color: 0x67707f, roughness: 0.78, metalness: 0.12
          })),
          trim: this._trackMat(new THREE.MeshStandardMaterial({
            map: iv.map, color: 0xebe4d5, roughness: 0.68, metalness: 0.07
          })),
          dark: this._trackMat(new THREE.MeshStandardMaterial({
            color: 0x181512, roughness: 0.88, metalness: 0.28
          })),
          roof: this._trackMat(new THREE.MeshStandardMaterial({
            map: this._sharedCache.timber_roof.map,
            bumpMap: this._sharedCache.timber_roof.bumpMap,
            bumpScale: 0.30, color: 0x7c6955, roughness: 0.80
          })),
          plaster: this._trackMat(new THREE.MeshStandardMaterial({
            color: 0xd4cab8, roughness: 0.86, metalness: 0.02
          })),
          windowGlow: this._trackMat(new THREE.MeshStandardMaterial({
            color: 0xffcc7a, emissive: 0xff9429, emissiveIntensity: 0.84, roughness: 0.32
          })),
          relief: this._trackMat(new THREE.MeshStandardMaterial({
            color: 0xdde5f0, emissive: 0x3b4a62, emissiveIntensity: 0.18, roughness: 0.38, metalness: 0.52
          })),
          timber: timberCommon,
          iron: ironCommon,
          bannerTex: this._sharedCache.banner_gondor
        };
      }

      const ob = this._sharedCache.ashlar_obsidian || {};
      return {
        wall: this._trackMat(new THREE.MeshStandardMaterial({
          map: ob.map, bumpMap: ob.bumpMap, bumpScale: 0.38,
          color: 0xb2a6c4, roughness: 0.66, metalness: 0.14
        })),
        trim: this._trackMat(new THREE.MeshStandardMaterial({
          map: ob.map, color: 0x9a8fb0, roughness: 0.58, metalness: 0.22
        })),
        dark: this._trackMat(new THREE.MeshStandardMaterial({
          color: 0x0b090e, roughness: 0.85, metalness: 0.48
        })),
        roof: this._trackMat(new THREE.MeshStandardMaterial({
          color: 0x2b2534, roughness: 0.66, metalness: 0.36
        })),
        plaster: this._trackMat(new THREE.MeshStandardMaterial({
          color: 0x453d4a, roughness: 0.86, metalness: 0.12
        })),
        windowGlow: this._trackMat(new THREE.MeshStandardMaterial({
          color: 0xff6e30, emissive: 0xe63900, emissiveIntensity: 0.88, roughness: 0.34
        })),
        relief: this._trackMat(new THREE.MeshStandardMaterial({
          color: 0xff7033, emissive: 0xb82e00, emissiveIntensity: 0.52, roughness: 0.44, metalness: 0.45
        })),
        timber: timberCommon,
        iron: ironCommon,
        bannerTex: this._sharedCache.banner_gondor,
        mordorBannerTex: this._sharedCache.banner_mordor
      };
    }

    _buildDrumTower(parent, x, baseY, z, radius, height, mats, opts) {
      const THREE = this.THREE;
      const cfg = opts || {};
      const grp = new THREE.Group();
      grp.position.set(x, baseY, z);

      // Batch plinth + cylindrical ashlar shaft into 1 single draw call
      const wallParts = [];
      const plinthGeo = new THREE.CylinderGeometry(radius * 1.04, radius * 1.18, height * 0.22, 18);
      plinthGeo.translate(0, height * 0.11, 0);
      wallParts.push(plinthGeo);

      const shaftGeo = new THREE.CylinderGeometry(radius * 0.96, radius * 1.04, height * 0.78, 18);
      shaftGeo.translate(0, height * 0.58, 0);
      wallParts.push(shaftGeo);

      const mergedWall = this._trackGeo(mergeGeometriesSimple(THREE, wallParts));
      for (let i = 0; i < wallParts.length; i++) wallParts[i].dispose();
      const wallMesh = new THREE.Mesh(mergedWall, mats.wall);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      grp.add(wallMesh);

      // Batch corbelled crown + machicolations + merlons + window hood-mouldings into 1 draw call
      const trimParts = [];
      const crownGeo = new THREE.CylinderGeometry(radius * 1.13, radius * 0.96, 0.86, 18);
      crownGeo.translate(0, height + 0.12, 0);
      trimParts.push(crownGeo);

      const beltGeo = new THREE.CylinderGeometry(radius * 1.06, radius * 1.06, 0.26, 18);
      beltGeo.translate(0, height * 0.23, 0);
      trimParts.push(beltGeo);

      const merlonCount = cfg.spikes ? 12 : Math.max(8, Math.round(radius * 3.2));
      for (let i = 0; i < merlonCount; i++) {
        const ang = (i / merlonCount) * TWO_PI;
        if (cfg.spikes) {
          const spGeo = new THREE.ConeGeometry(0.42, 2.1, 4);
          spGeo.rotateZ(-0.38);
          spGeo.rotateY(-ang);
          spGeo.translate(Math.cos(ang) * (radius * 1.05), height + 1.1, Math.sin(ang) * (radius * 1.05));
          trimParts.push(spGeo);
        } else {
          const mGeo = new THREE.BoxGeometry(0.76, 0.92, 0.52);
          mGeo.rotateY(-ang + HALF_PI);
          mGeo.translate(Math.cos(ang) * (radius * 1.02), height + 0.92, Math.sin(ang) * (radius * 1.02));
          trimParts.push(mGeo);
        }
      }

      // Warm amber glowing castle arrow-slits & recessed stone window frames!
      const slitGlowParts = [];
      const slitDarkParts = [];
      const slitCount = Math.max(4, Math.min(8, Math.round(radius * 1.8)));
      const levels = height > 13 ? [height * 0.44, height * 0.74] : [height * 0.64];
      for (let lv = 0; lv < levels.length; lv++) {
        const wy = levels[lv];
        for (let i = 0; i < slitCount; i++) {
          const ang = (i / slitCount) * TWO_PI + lv * 0.39;
          // Skip exact spot behind hanging banner if on mid level
          if (cfg.bannerYaw !== undefined && lv === 0) {
            const bAng = HALF_PI - cfg.bannerYaw;
            if (Math.abs(Math.atan2(Math.sin(ang - bAng), Math.cos(ang - bAng))) < 0.42) continue;
          }
          const rPos = radius * 0.985;
          const cx = Math.cos(ang) * rPos;
          const cz = Math.sin(ang) * rPos;

          const hood = new THREE.BoxGeometry(0.62, 0.22, 0.28);
          hood.rotateY(-ang + HALF_PI);
          hood.translate(cx, wy + 0.78, cz);
          trimParts.push(hood);

          const recess = new THREE.BoxGeometry(0.48, 1.42, 0.22);
          recess.rotateY(-ang + HALF_PI);
          recess.translate(cx, wy, cz);
          slitDarkParts.push(recess);

          const pane = new THREE.BoxGeometry(0.24, 1.18, 0.26);
          pane.rotateY(-ang + HALF_PI);
          pane.translate(cx, wy, cz);
          slitGlowParts.push(pane);
        }
      }

      const mergedTrim = this._trackGeo(mergeGeometriesSimple(THREE, trimParts));
      for (let i = 0; i < trimParts.length; i++) trimParts[i].dispose();
      const trimMesh = new THREE.Mesh(mergedTrim, mats.trim);
      trimMesh.castShadow = true;
      trimMesh.receiveShadow = true;
      grp.add(trimMesh);

      if (slitDarkParts.length > 0) {
        const mergedDark = this._trackGeo(mergeGeometriesSimple(THREE, slitDarkParts));
        for (let i = 0; i < slitDarkParts.length; i++) slitDarkParts[i].dispose();
        grp.add(new THREE.Mesh(mergedDark, mats.dark));
      }
      if (slitGlowParts.length > 0 && mats.windowGlow) {
        const mergedGlow = this._trackGeo(mergeGeometriesSimple(THREE, slitGlowParts));
        for (let i = 0; i < slitGlowParts.length; i++) slitGlowParts[i].dispose();
        grp.add(new THREE.Mesh(mergedGlow, mats.windowGlow));
      }

      // Optional conical roof
      if (cfg.conicalRoof) {
        const roofGeo = this._trackGeo(new THREE.ConeGeometry(radius * 1.18, radius * 1.72, 18));
        const roof = new THREE.Mesh(roofGeo, mats.roof);
        roof.position.y = height + 0.55 + radius * 0.85;
        roof.castShadow = true;
        grp.add(roof);
      }

      // Optional hanging cloth banner on front face
      if (cfg.bannerYaw !== undefined && (cfg.bannerTex || mats.bannerTex)) {
        const bDist = radius * 1.04;
        this._addHangingBanner(
          grp,
          Math.sin(cfg.bannerYaw) * bDist,
          height * 0.68,
          Math.cos(cfg.bannerYaw) * bDist,
          cfg.bannerYaw,
          cfg.bannerScale || 1.0,
          cfg.bannerTex || mats.bannerTex
        );
      }

      parent.add(grp);
      return grp;
    }

    _buildCurtainWall(parent, x1, z1, x2, z2, baseY, height, thickness, wallMat, trimMat, spikes, mats) {
      const THREE = this.THREE;
      const dx = x2 - x1;
      const dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      if (len < 0.5) return null;

      const grp = new THREE.Group();
      grp.position.set((x1 + x2) * 0.5, baseY, (z1 + z2) * 0.5);
      grp.rotation.y = Math.atan2(dx, dz);

      const bodyGeo = this._trackGeo(new THREE.BoxGeometry(thickness, height, len));
      const body = new THREE.Mesh(bodyGeo, wallMat);
      body.position.y = height * 0.5;
      body.castShadow = true;
      body.receiveShadow = true;
      grp.add(body);

      // Batch parapet coping + buttress piers + recessed stone blind-arcade arches + merlons into 1 draw call
      const trimParts = [];
      const walkGeo = new THREE.BoxGeometry(thickness + 0.52, 0.58, len + 0.2);
      walkGeo.translate(0, height + 0.22, 0);
      trimParts.push(walkGeo);

      // Stone buttresses & blind-arcade relief arches along wall faces
      const bayStep = 5.4;
      const bayCount = Math.max(1, Math.floor((len - 1.5) / bayStep));
      const darkBayParts = [];
      const glowSlitParts = [];
      for (let b = 0; b <= bayCount; b++) {
        const bz = -len * 0.5 + (len / (bayCount + 1)) * (b + 0.5);
        const pier = new THREE.BoxGeometry(thickness + 0.68, height * 0.88, 0.82);
        pier.translate(0, height * 0.44, bz);
        trimParts.push(pier);

        if (b < bayCount && len > 6.5) {
          const midZ = bz + (len / (bayCount + 1)) * 0.5;
          if (Math.abs(midZ) < len * 0.45) {
            for (let side = -1; side <= 1; side += 2) {
              // Recessed stone arch hood along wall bay
              const archGeo = new THREE.TorusGeometry(1.15, 0.18, 6, 10, Math.PI);
              archGeo.rotateY(side * HALF_PI);
              archGeo.translate(side * (thickness * 0.5 + 0.05), height * 0.54, midZ);
              trimParts.push(archGeo);

              // Subtle recessed arrow-slit inside every other arcade bay
              if ((b + (side > 0 ? 0 : 1)) % 2 === 0) {
                const slitRec = new THREE.BoxGeometry(0.14, 1.35, 0.30);
                slitRec.translate(side * (thickness * 0.5 + 0.02), height * 0.52, midZ);
                darkBayParts.push(slitRec);

                const slitGlow = new THREE.BoxGeometry(0.16, 1.05, 0.15);
                slitGlow.translate(side * (thickness * 0.5 + 0.03), height * 0.52, midZ);
                glowSlitParts.push(slitGlow);
              }
            }
          }
        }
      }

      const step = 1.85;
      const count = Math.max(1, Math.floor((len - 0.8) / step));
      for (let i = 0; i < count; i++) {
        const lz = -len * 0.5 + 0.9 + i * step;
        for (let side = -1; side <= 1; side += 2) {
          // Machicolation corbel bracket under parapet
          const corb = new THREE.BoxGeometry(0.32, 0.42, 0.38);
          corb.translate(side * (thickness * 0.5 + 0.12), height - 0.18, lz);
          trimParts.push(corb);

          if (spikes) {
            const spGeo = new THREE.ConeGeometry(0.34, 1.55, 4);
            spGeo.translate(side * (thickness * 0.45), height + 1.15, lz);
            trimParts.push(spGeo);
          } else {
            const mGeo = new THREE.BoxGeometry(0.48, 0.86, 1.05);
            mGeo.translate(side * (thickness * 0.46), height + 0.88, lz);
            trimParts.push(mGeo);
          }
        }
      }

      const mergedTrim = this._trackGeo(mergeGeometriesSimple(THREE, trimParts));
      for (let i = 0; i < trimParts.length; i++) trimParts[i].dispose();
      const trimMesh = new THREE.Mesh(mergedTrim, trimMat);
      trimMesh.castShadow = true;
      trimMesh.receiveShadow = true;
      grp.add(trimMesh);

      if (darkBayParts.length > 0 && mats && mats.dark) {
        const md = this._trackGeo(mergeGeometriesSimple(THREE, darkBayParts));
        for (let i = 0; i < darkBayParts.length; i++) darkBayParts[i].dispose();
        grp.add(new THREE.Mesh(md, mats.dark));
      }
      if (glowSlitParts.length > 0 && mats && mats.windowGlow) {
        const mg = this._trackGeo(mergeGeometriesSimple(THREE, glowSlitParts));
        for (let i = 0; i < glowSlitParts.length; i++) glowSlitParts[i].dispose();
        grp.add(new THREE.Mesh(mg, mats.windowGlow));
      }

      parent.add(grp);
      return grp;
    }

    _buildPortcullisGatehouse(parent, wx, baseY, wz, yaw, scale, mats, opts) {
      const THREE = this.THREE;
      const cfg = opts || {};
      const s = scale || 1.0;
      const grp = new THREE.Group();
      grp.position.set(wx, baseY, wz);
      grp.rotation.y = yaw;
      grp.scale.setScalar(s);

      // Gatehouse faces local +Z
      const halfSpan = 5.1;
      const towerR = 3.1;
      const towerH = 12.2;

      // Twin flanking gatehouse drum towers with hanging banners & warm arrow slits
      this._buildDrumTower(grp, -halfSpan, 0, 0, towerR, towerH, mats, {
        spikes: cfg.spikes,
        bannerYaw: 0,
        bannerScale: 1.15,
        bannerTex: cfg.bannerTex || mats.bannerTex
      });
      this._buildDrumTower(grp, halfSpan, 0, 0, towerR, towerH, mats, {
        spikes: cfg.spikes,
        bannerYaw: 0,
        bannerScale: 1.15,
        bannerTex: cfg.bannerTex || mats.bannerTex
      });

      // Upper gatehouse bridge lintel above the 6.2-unit-wide arched gate opening
      const lintelGeo = this._trackGeo(new THREE.BoxGeometry(halfSpan * 2, 5.4, 4.5));
      const lintel = new THREE.Mesh(lintelGeo, mats.wall);
      lintel.position.set(0, 8.2, -0.3);
      lintel.castShadow = true;
      lintel.receiveShadow = true;
      grp.add(lintel);

      // Warm glowing guardroom lancet windows in gatehouse lintel
      if (mats.windowGlow) {
        for (let wxOff = -2.2; wxOff <= 2.2; wxOff += 2.2) {
          const wRec = new THREE.Mesh(this._trackGeo(new THREE.BoxGeometry(0.68, 1.55, 0.25)), mats.dark);
          wRec.position.set(wxOff, 8.55, 1.92);
          grp.add(wRec);
          const wGlow = new THREE.Mesh(this._trackGeo(new THREE.BoxGeometry(0.42, 1.28, 0.28)), mats.windowGlow);
          wGlow.position.set(wxOff, 8.55, 1.94);
          grp.add(wGlow);
        }
      }

      // Gatehouse parapet merlons & machicolation corbels
      for (let mx = -3.4; mx <= 3.4; mx += 1.7) {
        const mGeo = this._trackGeo(new THREE.BoxGeometry(1.05, 0.92, 0.55));
        const m = new THREE.Mesh(mGeo, mats.trim);
        m.position.set(mx, 11.35, 1.72);
        m.castShadow = true;
        grp.add(m);
      }

      // Stepped double stone archivolt rings framing the recessed gate tunnel
      const archOuter = new THREE.Mesh(
        this._trackGeo(new THREE.TorusGeometry(3.25, 0.52, 8, 18, Math.PI)),
        mats.trim
      );
      archOuter.position.set(0, 3.2, 1.85);
      archOuter.castShadow = true;
      grp.add(archOuter);

      const archInner = new THREE.Mesh(
        this._trackGeo(new THREE.TorusGeometry(2.78, 0.36, 8, 16, Math.PI)),
        mats.trim
      );
      archInner.position.set(0, 3.05, 1.48);
      grp.add(archInner);

      // Deep dark shadowed gate interior box so enemies marching inside disappear cleanly
      const voidGeo = this._trackGeo(new THREE.BoxGeometry(6.1, 6.2, 4.2));
      const voidMat = this._trackMat(new THREE.MeshBasicMaterial({ color: 0x050608 }));
      const voidBox = new THREE.Mesh(voidGeo, voidMat);
      voidBox.position.set(0, 3.0, -1.2);
      grp.add(voidBox);

      // Heavy iron-bound oak double gate leaves swung open inside tunnel
      if (mats.timber) {
        for (let side = -1; side <= 1; side += 2) {
          const leaf = new THREE.Mesh(this._trackGeo(new THREE.BoxGeometry(2.5, 5.2, 0.28)), mats.timber);
          leaf.position.set(side * 2.55, 2.6, 0.45);
          leaf.rotation.y = side * 0.92;
          grp.add(leaf);
        }
      }

      // Raised 3D Iron-Bound Portcullis Grille (batched into 1 draw call)
      const portMat = mats.iron || this._trackMat(new THREE.MeshStandardMaterial({
        color: 0x262930,
        roughness: 0.52,
        metalness: 0.72
      }));
      const portParts = [];
      for (let gx = -2.5; gx <= 2.5; gx += 0.84) {
        const barGeo = new THREE.CylinderGeometry(0.09, 0.09, 3.2, 6);
        barGeo.translate(gx, 4.75, 1.25);
        portParts.push(barGeo);

        const tipGeo = new THREE.ConeGeometry(0.14, 0.42, 4);
        tipGeo.rotateX(Math.PI);
        tipGeo.translate(gx, 3.05, 1.25);
        portParts.push(tipGeo);
      }
      for (let gy = 3.5; gy <= 5.8; gy += 0.95) {
        const hBarGeo = new THREE.BoxGeometry(5.6, 0.16, 0.18);
        hBarGeo.translate(0, gy, 1.25);
        portParts.push(hBarGeo);
      }
      const mergedPort = this._trackGeo(mergeGeometriesSimple(THREE, portParts));
      for (let i = 0; i < portParts.length; i++) portParts[i].dispose();
      const portMesh = new THREE.Mesh(mergedPort, portMat);
      portMesh.castShadow = true;
      grp.add(portMesh);

      parent.add(grp);
      return grp;
    }

    _addHangingBanner(parent, x, y, z, yaw, scale, bannerTex) {
      const THREE = this.THREE;
      if (!bannerTex) return;
      const s = scale || 1.0;
      const mount = new THREE.Group();
      mount.position.set(x, y, z);
      mount.rotation.y = yaw;

      // Iron crossbar bracket
      const rodGeo = this._trackGeo(new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 1.75 * s, 6));
      rodGeo.rotateZ(HALF_PI);
      const rodMat = this._trackMat(new THREE.MeshStandardMaterial({
        color: 0x2d3138, roughness: 0.55, metalness: 0.65
      }));
      const rod = new THREE.Mesh(rodGeo, rodMat);
      rod.position.set(0, 0, 0.22 * s);
      mount.add(rod);

      // Cloth banner geometry hanging downward from y=0
      const w = 1.48 * s;
      const h = 3.35 * s;
      const clothGeo = this._trackGeo(new THREE.PlaneGeometry(w, h, 3, 7));
      clothGeo.translate(0, -h * 0.5, 0.24 * s);

      // Taper bottom row into classic heraldic pennant point
      const pos = clothGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const py = pos.getY(i);
        if (py < -h * 0.88) {
          const px = pos.getX(i);
          if (Math.abs(px) < w * 0.18) {
            pos.setY(i, py - 0.42 * s);
          }
        }
      }
      clothGeo.computeVertexNormals();

      const clothMat = this._trackMat(new THREE.MeshStandardMaterial({
        map: bannerTex,
        roughness: 0.82,
        metalness: 0.05,
        side: THREE.DoubleSide
      }));
      const cloth = new THREE.Mesh(clothGeo, clothMat);
      cloth.castShadow = true;
      mount.add(cloth);
      parent.add(mount);

      this._banners.push({
        mesh: cloth,
        phase: this._banners.length * 1.37
      });
    }

    // Grand circular multi-tiered cliff citadel (matching upper-left castle in reference image!)
    _buildUpperLeftCliffCitadel(mapId, mats) {
      const THREE = this.THREE;
      const cx = -53.5;
      const cz = -36.5;
      const baseY = Math.max(4.5, this.getTerrainHeightWorld(cx, cz) - 1.2);
      this._addExclusionBox(-68, -37, -48, -29.5);

      const citadel = new THREE.Group();
      citadel.position.set(cx, baseY, cz);

      const isMordor = mapId === 'blackgate';
      const bTex = isMordor ? (mats.mordorBannerTex || mats.bannerTex) : mats.bannerTex;

      // Curved outer crenellated stone curtain wall with 4 round drum towers
      const drumCoords = [
        { x: -10.5, z: 4.5, r: 2.75, h: 10.0, yaw: 0.35 },
        { x: -3.2, z: 6.2, r: 2.9, h: 10.6, yaw: 0.15 },
        { x: 5.2, z: 6.0, r: 2.9, h: 10.6, yaw: 0.05 },
        { x: 11.8, z: 3.4, r: 2.75, h: 10.0, yaw: -0.25 }
      ];
      for (let i = 0; i < drumCoords.length; i++) {
        const d = drumCoords[i];
        this._buildDrumTower(citadel, d.x, 0, d.z, d.r, d.h, mats, {
          spikes: isMordor,
          bannerYaw: d.yaw,
          bannerScale: 1.08,
          bannerTex: bTex
        });
        if (i < drumCoords.length - 1) {
          const nx = drumCoords[i + 1];
          this._buildCurtainWall(
            citadel, d.x, d.z, nx.x, nx.z,
            0, 8.0, 2.5, mats.wall, mats.trim, isMordor, mats
          );
        }
      }

      // Recessed arched stone barbican gate with iron-studded oak doors & warm lantern (matching upper-left of reference image!)
      const barbicanBox = new THREE.Mesh(
        this._trackGeo(new THREE.BoxGeometry(5.6, 7.6, 2.2)),
        mats.wall
      );
      barbicanBox.position.set(1.0, 3.8, 6.5);
      barbicanBox.castShadow = true;
      barbicanBox.receiveShadow = true;
      citadel.add(barbicanBox);

      const archGeo = this._trackGeo(new THREE.TorusGeometry(2.15, 0.44, 8, 16, Math.PI));
      const arch = new THREE.Mesh(archGeo, mats.trim);
      arch.position.set(1.0, 2.85, 7.62);
      citadel.add(arch);

      const gateDoorGeo = this._trackGeo(new THREE.PlaneGeometry(3.9, 4.9));
      const gateDoor = new THREE.Mesh(gateDoorGeo, mats.timber || mats.dark);
      gateDoor.position.set(1.0, 2.45, 7.46);
      citadel.add(gateDoor);

      // Multi-tiered circular inner keep (2 concentric terraced cylinders + buttress pilasters + warm clerestory windows)
      const keep1Geo = this._trackGeo(new THREE.CylinderGeometry(8.5, 9.3, 11.6, 22));
      const keep1 = new THREE.Mesh(keep1Geo, mats.wall);
      keep1.position.set(0.2, 5.8, -1.8);
      keep1.castShadow = true;
      keep1.receiveShadow = true;
      citadel.add(keep1);

      const keep2Geo = this._trackGeo(new THREE.CylinderGeometry(6.3, 6.9, 7.8, 20));
      const keep2 = new THREE.Mesh(keep2Geo, mats.wall);
      keep2.position.set(0.2, 14.0, -2.2);
      keep2.castShadow = true;
      keep2.receiveShadow = true;
      citadel.add(keep2);

      // Vertical stone buttress pilasters + parapet rims + warm glowing clerestory windows on inner keep
      const pilParts = [];
      const keepGlowParts = [];
      const rim1 = new THREE.CylinderGeometry(8.95, 8.6, 0.72, 22);
      rim1.translate(0.2, 11.75, -1.8);
      pilParts.push(rim1);

      const rim2 = new THREE.CylinderGeometry(6.75, 6.4, 0.68, 20);
      rim2.translate(0.2, 18.0, -2.2);
      pilParts.push(rim2);

      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * TWO_PI;
        const pilGeo = new THREE.BoxGeometry(0.78, 12.0, 0.98);
        pilGeo.rotateY(-ang + HALF_PI);
        pilGeo.translate(0.2 + Math.cos(ang) * 8.75, 6.0, -1.8 + Math.sin(ang) * 8.75);
        pilParts.push(pilGeo);

        // Warm amber clerestory lancet window between pilasters on lower & upper rotunda
        const wAng = ang + Math.PI / 12;
        if (Math.sin(wAng) > -0.25) {
          const w1 = new THREE.BoxGeometry(0.46, 1.85, 0.24);
          w1.rotateY(-wAng + HALF_PI);
          w1.translate(0.2 + Math.cos(wAng) * 8.68, 8.8, -1.8 + Math.sin(wAng) * 8.68);
          keepGlowParts.push(w1);

          const w2 = new THREE.BoxGeometry(0.40, 1.55, 0.24);
          w2.rotateY(-wAng + HALF_PI);
          w2.translate(0.2 + Math.cos(wAng) * 6.48, 15.3, -2.2 + Math.sin(wAng) * 6.48);
          keepGlowParts.push(w2);
        }
      }

      // Soaring tall citadel watch-spire rising on the left of the keep with corner buttresses & glowing windows
      const spireGeo = this._trackGeo(new THREE.BoxGeometry(3.9, 23.2, 3.9));
      const spire = new THREE.Mesh(spireGeo, mats.wall);
      spire.position.set(-4.6, 11.6, -2.6);
      spire.castShadow = true;
      spire.receiveShadow = true;
      citadel.add(spire);

      for (let cxOff = -1; cxOff <= 1; cxOff += 2) {
        for (let czOff = -1; czOff <= 1; czOff += 2) {
          const spBut = new THREE.BoxGeometry(0.68, 23.4, 0.68);
          spBut.translate(-4.6 + cxOff * 1.95, 11.7, -2.6 + czOff * 1.95);
          pilParts.push(spBut);
        }
      }
      for (let sy = 14.5; sy <= 20.5; sy += 3.0) {
        const sw = new THREE.BoxGeometry(0.44, 1.65, 0.26);
        sw.translate(-4.6, sy, -0.58);
        keepGlowParts.push(sw);
        const swEast = new THREE.BoxGeometry(0.26, 1.65, 0.44);
        swEast.translate(-2.58, sy, -2.6);
        keepGlowParts.push(swEast);
      }

      const spireCrown = new THREE.BoxGeometry(4.6, 1.25, 4.6);
      spireCrown.translate(-4.6, 23.4, -2.6);
      pilParts.push(spireCrown);

      const mergedPils = this._trackGeo(mergeGeometriesSimple(THREE, pilParts));
      for (let i = 0; i < pilParts.length; i++) pilParts[i].dispose();
      const pilMesh = new THREE.Mesh(mergedPils, mats.trim);
      pilMesh.castShadow = true;
      citadel.add(pilMesh);

      if (keepGlowParts.length > 0 && mats.windowGlow) {
        const mergedKeepGlow = this._trackGeo(mergeGeometriesSimple(THREE, keepGlowParts));
        for (let i = 0; i < keepGlowParts.length; i++) keepGlowParts[i].dispose();
        citadel.add(new THREE.Mesh(mergedKeepGlow, mats.windowGlow));
      }

      // Warm citadel courtyard PointLight bathing the stone barbican & banners!
      const citLight = new THREE.PointLight(isMordor ? 0xff5518 : 0xffbe6b, isMordor ? 24 : 28, 34, 1.6);
      citLight.position.set(1.0, 9.5, 9.5);
      citadel.add(citLight);

      this.root.add(citadel);
    }

    // Detailed Ruined Gothic Abbey with Window Mullions, Rose Tracery & Recessed Stone Archway (matching right side of reference image!)
    _buildGothicRuins(wx, wz, yaw, scale, mats) {
      const THREE = this.THREE;
      const s = scale || 1.0;
      const baseY = this.getTerrainHeightWorld(wx, wz);
      this._addExclusionBox(wx - 6.5 * s, wx + 6.5 * s, wz - 5.5 * s, wz + 5.5 * s);

      const grp = new THREE.Group();
      grp.position.set(wx, baseY - 0.25, wz);
      grp.rotation.y = yaw;
      grp.scale.setScalar(s);

      const wallParts = [];
      const trimParts = [];

      // 4 Stepped Gothic buttress piers along main ruined nave wall
      const pillarX = [-4.6, -1.55, 1.55, 4.6];
      const pillarH = [7.6, 6.2, 7.1, 4.8];
      for (let i = 0; i < pillarX.length; i++) {
        const px = pillarX[i];
        const h = pillarH[i];
        const colGeo = new THREE.BoxGeometry(0.96, h, 1.05);
        colGeo.translate(px, h * 0.5, 0);
        wallParts.push(colGeo);

        // Stepped stone buttress weatherings on front & back
        const butLow = new THREE.BoxGeometry(0.62, h * 0.55, 1.58);
        butLow.translate(px, h * 0.275, 0);
        trimParts.push(butLow);

        const cap = new THREE.BoxGeometry(1.12, 0.34, 1.18);
        cap.translate(px, h + 0.12, 0);
        trimParts.push(cap);

        if (i < pillarX.length - 1) {
          const midX = (px + pillarX[i + 1]) * 0.5;
          const span = pillarX[i + 1] - px;

          if (i === 1) {
            // Center bay: Recessed Gondorian semicircular stone doorway arch with broken wall above!
            const leftJamb = new THREE.BoxGeometry(0.68, 3.2, 0.82);
            leftJamb.translate(midX - 0.98, 1.6, 0);
            wallParts.push(leftJamb);
            const rightJamb = new THREE.BoxGeometry(0.68, 3.2, 0.82);
            rightJamb.translate(midX + 0.98, 1.6, 0);
            wallParts.push(rightJamb);

            const doorArch = new THREE.TorusGeometry(1.02, 0.28, 8, 14, Math.PI);
            doorArch.translate(midX, 3.1, 0);
            trimParts.push(doorArch);

            // Jagged broken masonry courses above doorway
            const spandrelL = new THREE.BoxGeometry(1.15, 1.45, 0.76);
            spandrelL.translate(midX - 0.72, 4.35, 0);
            wallParts.push(spandrelL);
            const spandrelR = new THREE.BoxGeometry(0.95, 0.95, 0.76);
            spandrelR.translate(midX + 0.78, 4.05, 0);
            wallParts.push(spandrelR);
          } else {
            // Flanking bays: Tall Gothic Pointed Tracery Window Bays (twin mullions + rose tracery ring!)
            const sillWall = new THREE.BoxGeometry(span, 1.75, 0.78);
            sillWall.translate(midX, 0.875, 0);
            wallParts.push(sillWall);

            const sillLedge = new THREE.BoxGeometry(span + 0.1, 0.24, 0.96);
            sillLedge.translate(midX, 1.82, 0);
            trimParts.push(sillLedge);

            const winTop = i === 0 ? 5.35 : 4.55;
            const winH = winTop - 1.88;

            // Twin slender vertical stone window mullions
            for (let m = -1; m <= 1; m += 2) {
              const mul = new THREE.CylinderGeometry(0.085, 0.095, winH, 6);
              mul.translate(midX + m * 0.52, 1.88 + winH * 0.5, 0);
              trimParts.push(mul);
            }

            // Pointed Gothic two-centered arch ribs + circular rose/trefoil tracery ring!
            const archL = new THREE.TorusGeometry(1.18, 0.20, 6, 12, Math.PI * 0.68);
            archL.rotateZ(0.22);
            archL.translate(midX - 0.16, winTop - 0.35, 0);
            trimParts.push(archL);

            const archR = new THREE.TorusGeometry(1.18, 0.20, 6, 12, Math.PI * 0.68);
            archR.rotateY(Math.PI);
            archR.rotateZ(-0.22);
            archR.translate(midX + 0.16, winTop - 0.35, 0);
            trimParts.push(archR);

            // Delicate stone rose-tracery circle nestled in window apex
            const rose = new THREE.TorusGeometry(0.42, 0.085, 6, 14);
            rose.translate(midX, winTop + 0.08, 0);
            trimParts.push(rose);

            if (i === 0) {
              // Stepped broken gable crest above left Gothic window
              const gable1 = new THREE.BoxGeometry(2.1, 0.75, 0.74);
              gable1.translate(midX - 0.2, winTop + 0.95, 0);
              wallParts.push(gable1);
              const gable2 = new THREE.BoxGeometry(1.1, 0.65, 0.72);
              gable2.translate(midX - 0.55, winTop + 1.55, 0);
              wallParts.push(gable2);
            }
          }
        }
      }

      // Perpendicular ruined return wall with lancet opening + fallen carved masonry blocks
      const retL = new THREE.BoxGeometry(0.86, 5.4, 1.65);
      retL.translate(-4.6, 2.7, 1.25);
      wallParts.push(retL);
      const retR = new THREE.BoxGeometry(0.86, 3.6, 1.55);
      retR.translate(-4.6, 1.8, 3.65);
      wallParts.push(retR);
      const retSill = new THREE.BoxGeometry(0.82, 1.4, 1.3);
      retSill.translate(-4.6, 0.7, 2.55);
      wallParts.push(retSill);
      const retArch = new THREE.TorusGeometry(0.68, 0.18, 6, 10, Math.PI);
      retArch.rotateY(HALF_PI);
      retArch.translate(-4.6, 3.25, 2.55);
      trimParts.push(retArch);

      for (let b = 0; b < 7; b++) {
        const blkGeo = new THREE.BoxGeometry(0.88 - (b % 3) * 0.12, 0.52, 0.68);
        blkGeo.rotateZ(0.14 * (b - 3));
        blkGeo.rotateY(0.65 * b);
        blkGeo.translate(-3.1 + b * 1.15, 0.26, 1.15 + (b % 3) * 0.62);
        trimParts.push(blkGeo);
      }

      const mergedWall = this._trackGeo(mergeGeometriesSimple(THREE, wallParts));
      for (let i = 0; i < wallParts.length; i++) wallParts[i].dispose();
      const wallMesh = new THREE.Mesh(mergedWall, mats.wall);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      grp.add(wallMesh);

      const mergedTrim = this._trackGeo(mergeGeometriesSimple(THREE, trimParts));
      for (let i = 0; i < trimParts.length; i++) trimParts[i].dispose();
      const trimMesh = new THREE.Mesh(mergedTrim, mats.trim);
      trimMesh.castShadow = true;
      trimMesh.receiveShadow = true;
      grp.add(trimMesh);

      this.root.add(grp);
    }

    // Octagonal Medieval Watch-Chapel with Arched Stone Colonnade, Timber Roof & Ruined Steps (bottom-left of reference image!)
    _buildMedievalWatchhouse(wx, wz, yaw, scale, mats) {
      const THREE = this.THREE;
      const s = scale || 1.0;
      const baseY = this.getTerrainHeightWorld(wx, wz);
      this._addExclusionBox(wx - 6.8 * s, wx + 6.8 * s, wz - 6.8 * s, wz + 6.8 * s);

      const grp = new THREE.Group();
      grp.position.set(wx, baseY - 0.3, wz);
      grp.rotation.y = yaw;
      grp.scale.setScalar(s);

      // Stepped stone foundation + octagonal ashlar turret body
      const plinth = new THREE.Mesh(this._trackGeo(new THREE.CylinderGeometry(3.35, 3.65, 0.85, 8)), mats.trim);
      plinth.position.y = 0.42;
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      grp.add(plinth);

      const baseGeo = this._trackGeo(new THREE.CylinderGeometry(2.92, 3.22, 5.0, 8));
      const base = new THREE.Mesh(baseGeo, mats.wall);
      base.position.y = 3.15;
      base.castShadow = true;
      base.receiveShadow = true;
      grp.add(base);

      // 8 Stone corner pilasters, cornice ring & arched colonnade window frames
      const trimParts = [];
      const cornice = new THREE.CylinderGeometry(3.38, 2.98, 0.46, 8);
      cornice.translate(0, 5.72, 0);
      trimParts.push(cornice);

      const darkParts = [];
      const glowParts = [];
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * TWO_PI + Math.PI / 8;
        const pil = new THREE.BoxGeometry(0.38, 5.1, 0.42);
        pil.rotateY(-ang + HALF_PI);
        pil.translate(Math.cos(ang) * 3.05, 3.15, Math.sin(ang) * 3.05);
        trimParts.push(pil);

        // Arched lancet windows with warm candlelit glow on alternating faces
        const fAng = (i / 8) * TWO_PI;
        const archFrame = new THREE.TorusGeometry(0.56, 0.12, 6, 10, Math.PI);
        archFrame.rotateY(-fAng + HALF_PI);
        archFrame.translate(Math.cos(fAng) * 2.86, 4.15, Math.sin(fAng) * 2.86);
        trimParts.push(archFrame);

        const winRec = new THREE.BoxGeometry(0.18, 1.55, 0.92);
        winRec.rotateY(-fAng);
        winRec.translate(Math.cos(fAng) * 2.82, 3.42, Math.sin(fAng) * 2.82);
        darkParts.push(winRec);

        if (i % 2 === 0) {
          const winGlow = new THREE.BoxGeometry(0.22, 1.32, 0.62);
          winGlow.rotateY(-fAng);
          winGlow.translate(Math.cos(fAng) * 2.83, 3.42, Math.sin(fAng) * 2.83);
          glowParts.push(winGlow);
        }
      }

      const mergedTrim = this._trackGeo(mergeGeometriesSimple(THREE, trimParts));
      for (let i = 0; i < trimParts.length; i++) trimParts[i].dispose();
      const trimMesh = new THREE.Mesh(mergedTrim, mats.trim);
      trimMesh.castShadow = true;
      grp.add(trimMesh);

      if (darkParts.length > 0) {
        const md = this._trackGeo(mergeGeometriesSimple(THREE, darkParts));
        for (let i = 0; i < darkParts.length; i++) darkParts[i].dispose();
        grp.add(new THREE.Mesh(md, mats.dark));
      }
      if (glowParts.length > 0 && mats.windowGlow) {
        const mg = this._trackGeo(mergeGeometriesSimple(THREE, glowParts));
        for (let i = 0; i < glowParts.length; i++) glowParts[i].dispose();
        grp.add(new THREE.Mesh(mg, mats.windowGlow));
      }

      // Steep octagonal timber-shingled conical roof + stone finial
      const roofGeo = this._trackGeo(new THREE.ConeGeometry(3.72, 4.45, 8));
      const roof = new THREE.Mesh(roofGeo, mats.roof);
      roof.position.y = 8.05;
      roof.castShadow = true;
      grp.add(roof);

      const finial = new THREE.Mesh(this._trackGeo(new THREE.ConeGeometry(0.32, 1.15, 8)), mats.trim);
      finial.position.y = 10.65;
      grp.add(finial);

      // Adjacent carved stone banner-pillar + fallen timber rafters & stone steps (matching bottom-left of reference image!)
      const pilGeo = this._trackGeo(new THREE.BoxGeometry(1.18, 6.2, 1.18));
      const pil = new THREE.Mesh(pilGeo, mats.wall);
      pil.position.set(4.5, 3.1, -1.6);
      pil.castShadow = true;
      pil.receiveShadow = true;
      grp.add(pil);

      const pilCap = new THREE.Mesh(this._trackGeo(new THREE.BoxGeometry(1.42, 0.42, 1.42)), mats.trim);
      pilCap.position.set(4.5, 6.25, -1.6);
      grp.add(pilCap);

      this._addHangingBanner(grp, 4.5, 5.1, -0.95, 0.2, 0.88, mats.bannerTex);

      // Ruined timber beam stack & stone steps beside watchhouse
      if (mats.timber) {
        const timbParts = [];
        for (let r = 0; r < 4; r++) {
          const beam = new THREE.BoxGeometry(2.8, 0.24, 0.28);
          beam.rotateY(0.18 * (r - 1.5));
          beam.rotateZ((r % 2 === 0 ? 1 : -1) * 0.08);
          beam.translate(3.6, 0.32 + r * 0.20, 2.3 + (r % 2) * 0.35);
          timbParts.push(beam);
        }
        const mt = this._trackGeo(mergeGeometriesSimple(THREE, timbParts));
        for (let i = 0; i < timbParts.length; i++) timbParts[i].dispose();
        const tm = new THREE.Mesh(mt, mats.timber);
        tm.castShadow = true;
        grp.add(tm);
      }

      this.root.add(grp);
    }

    // Steeply Gable-Roofed Half-Timber & Stone Medieval Guard-Cottage + Curved Courtyard Ruin Wall (far-right of reference image!)
    _buildGabledGuardCottage(wx, wz, yaw, scale, mats) {
      const THREE = this.THREE;
      const s = scale || 1.0;
      const baseY = this.getTerrainHeightWorld(wx, wz);
      this._addExclusionBox(wx - 7.5 * s, wx + 7.5 * s, wz - 7.5 * s, wz + 7.5 * s);

      const grp = new THREE.Group();
      grp.position.set(wx, baseY - 0.25, wz);
      grp.rotation.y = yaw;
      grp.scale.setScalar(s);

      // 1. Chiseled stone ground story
      const stoneBase = new THREE.Mesh(this._trackGeo(new THREE.BoxGeometry(5.6, 3.1, 6.8)), mats.wall);
      stoneBase.position.y = 1.55;
      stoneBase.castShadow = true;
      stoneBase.receiveShadow = true;
      grp.add(stoneBase);

      // 2. Half-timbered medieval upper story + overhanging oak beams
      const upperStory = new THREE.Mesh(
        this._trackGeo(new THREE.BoxGeometry(6.0, 2.6, 7.2)),
        mats.plaster || mats.wall
      );
      upperStory.position.y = 4.35;
      upperStory.castShadow = true;
      upperStory.receiveShadow = true;
      grp.add(upperStory);

      // Dark oak timber framing posts, horizontal rails & gable bargeboards
      const timberMat = mats.timber || mats.roof;
      const oakParts = [];
      for (let sx = -1; sx <= 1; sx += 2) {
        const rail = new THREE.BoxGeometry(0.24, 0.28, 7.36);
        rail.translate(sx * 2.96, 3.12, 0);
        oakParts.push(rail);
        for (let sz = -3.4; sz <= 3.4; sz += 1.7) {
          const post = new THREE.BoxGeometry(0.22, 2.68, 0.22);
          post.translate(sx * 2.98, 4.35, sz);
          oakParts.push(post);
        }
      }
      for (let sz = -1; sz <= 1; sz += 2) {
        const fRail = new THREE.BoxGeometry(6.14, 0.28, 0.24);
        fRail.translate(0, 3.12, sz * 3.56);
        oakParts.push(fRail);
        // Gable A-frame bargeboards
        for (let side = -1; side <= 1; side += 2) {
          const barge = new THREE.BoxGeometry(4.35, 0.26, 0.28);
          barge.rotateZ(side * -0.74);
          barge.translate(side * 1.58, 7.05, sz * 3.82);
          oakParts.push(barge);
        }
      }
      const ridgeBeam = new THREE.BoxGeometry(0.32, 0.36, 8.1);
      ridgeBeam.translate(0, 8.52, 0);
      oakParts.push(ridgeBeam);

      const mergedOak = this._trackGeo(mergeGeometriesSimple(THREE, oakParts));
      for (let i = 0; i < oakParts.length; i++) oakParts[i].dispose();
      const oakMesh = new THREE.Mesh(mergedOak, timberMat);
      oakMesh.castShadow = true;
      grp.add(oakMesh);

      // 3. Steeply pitched dual-slope timber-shingled A-frame roof + triangular gables
      const gablePrism = this._trackGeo(new THREE.CylinderGeometry(3.0, 3.0, 7.2, 3));
      gablePrism.rotateZ(-HALF_PI * 0.3333);
      // Build crisp two-slope roof planes + gable triangles
      const roofParts = [];
      for (let side = -1; side <= 1; side += 2) {
        const slope = new THREE.BoxGeometry(4.55, 0.28, 7.85);
        slope.rotateZ(side * -0.74);
        slope.translate(side * 1.66, 7.02, 0);
        roofParts.push(slope);
      }
      const mergedRoof = this._trackGeo(mergeGeometriesSimple(THREE, roofParts));
      for (let i = 0; i < roofParts.length; i++) roofParts[i].dispose();
      gablePrism.dispose();
      const roofMesh = new THREE.Mesh(mergedRoof, mats.roof);
      roofMesh.castShadow = true;
      roofMesh.receiveShadow = true;
      grp.add(roofMesh);

      // Stone chimney stack rising through roof slope
      const chimney = new THREE.Mesh(this._trackGeo(new THREE.BoxGeometry(1.05, 5.4, 1.05)), mats.wall);
      chimney.position.set(1.8, 6.9, -1.6);
      chimney.castShadow = true;
      grp.add(chimney);

      // Warm candlelit cottage windows
      if (mats.windowGlow) {
        const winPositions = [
          { x: -3.02, y: 4.35, z: -1.4, ry: HALF_PI },
          { x: -3.02, y: 4.35, z: 1.4, ry: HALF_PI },
          { x: 0, y: 4.35, z: 3.62, ry: 0 },
          { x: -2.82, y: 1.75, z: 0.2, ry: HALF_PI }
        ];
        const wGlowParts = [];
        for (let i = 0; i < winPositions.length; i++) {
          const wp = winPositions[i];
          const wg = new THREE.BoxGeometry(0.92, 1.18, 0.16);
          wg.rotateY(wp.ry);
          wg.translate(wp.x, wp.y, wp.z);
          wGlowParts.push(wg);
        }
        const mwg = this._trackGeo(mergeGeometriesSimple(THREE, wGlowParts));
        for (let i = 0; i < wGlowParts.length; i++) wGlowParts[i].dispose();
        grp.add(new THREE.Mesh(mwg, mats.windowGlow));
      }

      // 4. Curved low ruined stone courtyard wall + banner pillar in front (just like right side of reference image!)
      const yardParts = [];
      for (let sIdx = 0; sIdx < 5; sIdx++) {
        const ang = 0.55 + sIdx * 0.34;
        const r = 6.2;
        const segH = sIdx === 2 ? 4.4 : (2.1 + (sIdx % 2) * 0.85);
        const seg = new THREE.BoxGeometry(0.75, segH, 2.25);
        seg.rotateY(-ang);
        seg.translate(-Math.cos(ang) * r, segH * 0.5, Math.sin(ang) * r - 1.2);
        yardParts.push(seg);
      }
      const mYard = this._trackGeo(mergeGeometriesSimple(THREE, yardParts));
      for (let i = 0; i < yardParts.length; i++) yardParts[i].dispose();
      const yardMesh = new THREE.Mesh(mYard, mats.wall);
      yardMesh.castShadow = true;
      yardMesh.receiveShadow = true;
      grp.add(yardMesh);

      this._addHangingBanner(grp, -Math.cos(1.23) * 6.5, 3.6, Math.sin(1.23) * 6.5 - 1.2, -1.35, 0.86, mats.bannerTex);

      this.root.add(grp);
    }

    // 3D Spoked-Wheel Wooden Siege Supply Cart + Iron-Banded Oak Barrels & Crates
    _buildSupplyCartAndBarrels(wx, wz, yaw, scale, mats) {
      const THREE = this.THREE;
      if (this._distToRoadsWorld(wx, wz) < 3.45 || this._distToPadsWorld(wx, wz) < 3.65) return;
      const wy = this.getTerrainHeightWorld(wx, wz);
      const s = scale || 1.0;

      const grp = new THREE.Group();
      grp.position.set(wx, wy, wz);
      grp.rotation.y = yaw;
      grp.scale.setScalar(s);

      const woodParts = [];
      const ironParts = [];

      // Planked wagon bed, side rails & angled hitch shafts
      const bed = new THREE.BoxGeometry(1.65, 0.16, 2.55);
      bed.translate(0, 0.68, 0);
      woodParts.push(bed);

      for (let side = -1; side <= 1; side += 2) {
        const rail = new THREE.BoxGeometry(0.12, 0.56, 2.55);
        rail.translate(side * 0.78, 0.98, 0);
        woodParts.push(rail);

        const shaft = new THREE.CylinderGeometry(0.055, 0.065, 1.85, 6);
        shaft.rotateX(HALF_PI - 0.24);
        shaft.translate(side * 0.52, 0.48, 2.02);
        woodParts.push(shaft);

        // Spoked 3D wooden cart wheel + iron tire rim
        const rim = new THREE.TorusGeometry(0.62, 0.065, 6, 14);
        rim.rotateY(HALF_PI);
        rim.translate(side * 0.94, 0.62, -0.08);
        ironParts.push(rim);

        const hub = new THREE.CylinderGeometry(0.14, 0.14, 0.22, 8);
        hub.rotateZ(HALF_PI);
        hub.translate(side * 0.94, 0.62, -0.08);
        woodParts.push(hub);

        for (let sp = 0; sp < 4; sp++) {
          const spoke = new THREE.CylinderGeometry(0.032, 0.032, 1.18, 5);
          spoke.rotateX((sp / 4) * Math.PI);
          spoke.translate(side * 0.94, 0.62, -0.08);
          woodParts.push(spoke);
        }
      }

      // Cargo in cart + 3 clustered roadside oak barrels
      const barrelCoords = [
        { x: -0.32, y: 1.16, z: -0.45, r: 0.34, h: 0.78, tilt: 0 },
        { x: 0.34, y: 1.06, z: 0.35, r: 0.34, h: 0.78, tilt: HALF_PI },
        { x: 1.62, y: 0.42, z: -0.65, r: 0.38, h: 0.86, tilt: 0 },
        { x: 2.28, y: 0.40, z: -0.25, r: 0.36, h: 0.82, tilt: 0.06 },
        { x: 1.92, y: 0.38, z: 0.42, r: 0.35, h: 0.80, tilt: -0.05 }
      ];
      for (let i = 0; i < barrelCoords.length; i++) {
        const bc = barrelCoords[i];
        const brl = new THREE.CylinderGeometry(bc.r * 0.88, bc.r * 0.88, bc.h, 10, 2);
        const bp = brl.attributes.position;
        for (let k = 0; k < bp.count; k++) {
          const by = bp.getY(k);
          const bulge = 1 + 0.14 * Math.cos((by / (bc.h * 0.5)) * HALF_PI);
          bp.setX(k, bp.getX(k) * bulge);
          bp.setZ(k, bp.getZ(k) * bulge);
        }
        brl.computeVertexNormals();
        if (bc.tilt) brl.rotateX(bc.tilt);
        brl.translate(bc.x, bc.y, bc.z);
        woodParts.push(brl);

        for (let hOff = -1; hOff <= 1; hOff += 2) {
          const hoop = new THREE.TorusGeometry(bc.r * 0.95, 0.028, 5, 10);
          hoop.rotateX(HALF_PI + bc.tilt);
          hoop.translate(bc.x, bc.y + (bc.tilt === HALF_PI ? 0 : hOff * bc.h * 0.26), bc.z + (bc.tilt === HALF_PI ? hOff * bc.h * 0.26 : 0));
          ironParts.push(hoop);
        }
      }

      const crate = new THREE.BoxGeometry(0.68, 0.58, 0.68);
      crate.rotateY(0.28);
      crate.translate(-0.28, 1.05, 0.55);
      woodParts.push(crate);

      const mWood = this._trackGeo(mergeGeometriesSimple(THREE, woodParts));
      for (let i = 0; i < woodParts.length; i++) woodParts[i].dispose();
      const woodMesh = new THREE.Mesh(mWood, mats.timber || mats.roof);
      woodMesh.castShadow = true;
      woodMesh.receiveShadow = true;
      grp.add(woodMesh);

      const mIron = this._trackGeo(mergeGeometriesSimple(THREE, ironParts));
      for (let i = 0; i < ironParts.length; i++) ironParts[i].dispose();
      const ironMesh = new THREE.Mesh(mIron, mats.iron || mats.dark);
      ironMesh.castShadow = true;
      grp.add(ironMesh);

      this.root.add(grp);
    }

    // Carved Stone Roadside Pillars / Way-Obelisks with Gondor/Rohan/Mordor Heraldic Reliefs
    _buildRoadsideReliefPillar(wx, wz, yaw, scale, mats, withBanner) {
      const THREE = this.THREE;
      if (this._distToRoadsWorld(wx, wz) < 3.05 || this._distToPadsWorld(wx, wz) < 3.45) return;
      const wy = this.getTerrainHeightWorld(wx, wz);
      const s = scale || 1.0;

      const grp = new THREE.Group();
      grp.position.set(wx, wy - 0.08, wz);
      grp.rotation.y = yaw;
      grp.scale.setScalar(s);

      const stoneParts = [];
      const base1 = new THREE.BoxGeometry(1.38, 0.36, 1.38);
      base1.translate(0, 0.18, 0);
      stoneParts.push(base1);

      const base2 = new THREE.BoxGeometry(1.08, 0.32, 1.08);
      base2.translate(0, 0.52, 0);
      stoneParts.push(base2);

      const shaft = new THREE.BoxGeometry(0.82, 3.25, 0.82);
      shaft.translate(0, 2.30, 0);
      stoneParts.push(shaft);

      const cap = new THREE.BoxGeometry(1.16, 0.34, 1.16);
      cap.translate(0, 4.05, 0);
      stoneParts.push(cap);

      const spire = new THREE.ConeGeometry(0.68, 0.95, 4);
      spire.rotateY(Math.PI * 0.25);
      spire.translate(0, 4.68, 0);
      stoneParts.push(spire);

      const mStone = this._trackGeo(mergeGeometriesSimple(THREE, stoneParts));
      for (let i = 0; i < stoneParts.length; i++) stoneParts[i].dispose();
      const stoneMesh = new THREE.Mesh(mStone, mats.trim);
      stoneMesh.castShadow = true;
      stoneMesh.receiveShadow = true;
      grp.add(stoneMesh);

      // Sculpted heraldic relief medallion plaque on front & back faces
      if (mats.relief) {
        const relParts = [];
        for (let side = -1; side <= 1; side += 2) {
          const shield = new THREE.CylinderGeometry(0.28, 0.22, 0.12, 6);
          shield.rotateX(HALF_PI);
          shield.translate(0, 2.65, side * 0.42);
          relParts.push(shield);

          const crest = new THREE.OctahedronGeometry(0.16, 0);
          crest.scale(0.8, 1.4, 0.45);
          crest.translate(0, 2.68, side * 0.47);
          relParts.push(crest);
        }
        const mRel = this._trackGeo(mergeGeometriesSimple(THREE, relParts));
        for (let i = 0; i < relParts.length; i++) relParts[i].dispose();
        grp.add(new THREE.Mesh(mRel, mats.relief));
      }

      if (withBanner && mats.bannerTex) {
        this._addHangingBanner(grp, 0, 3.75, 0.44, 0, 0.62, mats.bannerTex);
      }

      this.root.add(grp);
    }

    _buildStageFortressesAndRuins(mapId, mapData) {
      const THREE = this.THREE;
      const mats = this._makeCastleMaterials(mapId);
      const gateWx = toWorldX(mapData.gatePoint.x);
      const gateWz = toWorldZ(mapData.gatePoint.y);

      // 1. Upper-Left Cliff Citadel on all stages (echoing the grand upper-left silhouette in reference image!)
      this._buildUpperLeftCliffCitadel(mapId, mats);

      if (mapId === 'hornburg') {
        // --- EASTERN HORNBURG CITADEL & GREAT HORN TOWER ---
        this._addExclusionBox(53.5, 82, -36, 12);
        this._buildPortcullisGatehouse(this.root, gateWx + 2.4, 0, gateWz, -HALF_PI, 1.02, mats, {
          bannerTex: mats.bannerTex
        });

        // Hornburg curtain bastions & Keep of Helm's Deep
        this._buildCurtainWall(this.root, 56.5, gateWz - 5.2, 55.0, -25.8, 0, 9.8, 2.8, mats.wall, mats.trim, false, mats);
        this._buildCurtainWall(this.root, 56.5, gateWz + 5.2, 62.5, gateWz + 12.5, 0, 8.8, 2.6, mats.wall, mats.trim, false, mats);
        this._buildDrumTower(this.root, 64.5, 3.0, -16.5, 5.8, 15.5, mats, { bannerYaw: -1.2, bannerScale: 1.2 });
        // Great Horn Tower of Helm Hammerhand soaring above the Keep!
        this._buildDrumTower(this.root, 63.5, 5.0, -23.5, 3.1, 21.5, mats, { conicalRoof: true });

        // --- THE DEEPING WALL & CULVERT GRATE along Northern Gorge ---
        this._addExclusionBox(-31, 55, -29.5, -24.0);
        this._buildCurtainWall(this.root, -29.5, -25.8, 55.0, -25.8, 0, 7.6, 3.0, mats.wall, mats.trim, false, mats);

        // Culvert Arched Iron Grate at (576, 146) -> wx = -6.4, wz = -24.2
        const culvX = toWorldX(576);
        const culvArch = new THREE.Mesh(
          this._trackGeo(new THREE.TorusGeometry(1.85, 0.38, 8, 14, Math.PI)),
          mats.trim
        );
        culvArch.position.set(culvX, 0.2, -24.15);
        this.root.add(culvArch);

        const culvVoid = new THREE.Mesh(
          this._trackGeo(new THREE.CircleGeometry(1.8, 14, 0, Math.PI)),
          this._trackMat(new THREE.MeshBasicMaterial({ color: 0x05090e }))
        );
        culvVoid.position.set(culvX, 0.1, -24.12);
        this.root.add(culvVoid);

        // Gothic tracery ruins, medieval watchhouses, gabled guard-cottage, supply carts & relief pillars
        this._buildMedievalWatchhouse(-57.5, 25.5, 0.45, 0.96, mats);
        this._buildGothicRuins(32.5, -29.5, -0.18, 0.95, mats);
        this._buildGabledGuardCottage(56.2, 23.5, -0.45, 0.92, mats);

        this._buildSupplyCartAndBarrels(-44.5, 19.5, 0.62, 0.92, mats);
        this._buildSupplyCartAndBarrels(47.2, -16.8, -0.85, 0.90, mats);
        this._buildRoadsideReliefPillar(-51.5, -6.5, 0.15, 0.92, mats, true);
        this._buildRoadsideReliefPillar(-15.5, 21.8, -0.25, 0.88, mats, false);
        this._buildRoadsideReliefPillar(46.8, -4.8, -1.35, 0.95, mats, true);

      } else if (mapId === 'pelennor') {
        // --- MINAS TIRITH: GLEAMING WHITE CITY, GREAT GATE & PROW OF THE CITADEL ---
        this._addExclusionBox(53.5, 86, -34, 32);

        // First Circle Outer Black Wall of Numenor with gleaming white marble coping & blind-arcade arches
        const blackMat = mats.outerBlackWall || mats.wall;
        this._buildCurtainWall(this.root, 56.8, -28.0, 56.8, gateWz - 5.4, 0, 9.2, 2.9, blackMat, mats.trim, false, mats);
        this._buildCurtainWall(this.root, 56.8, gateWz + 5.4, 56.8, 28.0, 0, 9.2, 2.9, blackMat, mats.trim, false, mats);

        // Great Gate of Minas Tirith at gatePoint
        this._buildPortcullisGatehouse(this.root, gateWx + 2.4, 0, gateWz, -HALF_PI, 1.06, mats, {
          bannerTex: mats.bannerTex
        });

        // Semicircular gleaming marble bastion drums along First Circle
        const bastionZs = [-22.5, -13.5, 14.5, 23.5];
        for (let i = 0; i < bastionZs.length; i++) {
          this._buildDrumTower(this.root, 56.5, 0, bastionZs[i], 2.55, 10.8, mats, {
            bannerYaw: -HALF_PI,
            bannerScale: 0.95
          });
        }

        // Rising Concentric Ivory Citadel Tiers behind First Circle + warm glowing city windows
        const cityWinParts = [];
        for (let tier = 0; tier < 3; tier++) {
          const tx = 64.0 + tier * 5.8;
          const th = 13.5 + tier * 5.2;
          const tr = 22.0 - tier * 4.2;
          const tierGeo = this._trackGeo(new THREE.CylinderGeometry(tr, tr + 1.2, th, 22, 1, false, Math.PI * 0.95, Math.PI * 1.1));
          const tierMesh = new THREE.Mesh(tierGeo, mats.wall);
          tierMesh.position.set(tx + tr * 0.65, th * 0.5, -2.0);
          tierMesh.castShadow = true;
          tierMesh.receiveShadow = true;
          this.root.add(tierMesh);

          for (let w = 0; w < 5; w++) {
            const ang = Math.PI * (1.18 + w * 0.16);
            const wg = new THREE.BoxGeometry(0.28, 1.45, 0.52);
            wg.translate(tx + tr * 0.65 + Math.sin(ang) * (tr + 0.35), th - 2.4, -2.0 + Math.cos(ang) * (tr + 0.35));
            cityWinParts.push(wg);
          }
        }
        if (cityWinParts.length > 0 && mats.windowGlow) {
          const mcw = this._trackGeo(mergeGeometriesSimple(THREE, cityWinParts));
          for (let i = 0; i < cityWinParts.length; i++) cityWinParts[i].dispose();
          this.root.add(new THREE.Mesh(mcw, mats.windowGlow));
        }

        // Iconic Prow of the Citadel jutting dramatically westward + White Tower of Ecthelion!
        const prowShape = new THREE.ConeGeometry(6.8, 19.5, 4);
        prowShape.rotateZ(HALF_PI);
        prowShape.scale(1.0, 1.35, 0.52);
        const prowGeo = this._trackGeo(prowShape);
        const prow = new THREE.Mesh(prowGeo, mats.trim);
        prow.position.set(66.5, 17.5, -5.5);
        prow.castShadow = true;
        prow.receiveShadow = true;
        this.root.add(prow);

        const ecthelionGeo = this._trackGeo(new THREE.CylinderGeometry(2.1, 2.8, 16.5, 18));
        const ecthelion = new THREE.Mesh(ecthelionGeo, mats.trim);
        ecthelion.position.set(70.5, 25.5, -5.5);
        ecthelion.castShadow = true;
        this.root.add(ecthelion);

        const spirePeak = new THREE.Mesh(
          this._trackGeo(new THREE.ConeGeometry(2.3, 4.8, 18)),
          mats.trim
        );
        spirePeak.position.set(70.5, 35.8, -5.5);
        this.root.add(spirePeak);

        // Reference-image Gothic Tracery Ruined Abbey on upper-right ridge, distant cliff keep ruin,
        // bottom-left octagonal watch-chapel, AND right-side gabled half-timber guard-cottage!
        this._buildGothicRuins(33.5, -26.8, -0.28, 1.06, mats);
        this._buildGothicRuins(56.5, -36.5, -0.52, 0.88, mats);
        this._buildMedievalWatchhouse(-56.8, 26.8, 0.48, 1.02, mats);
        this._buildGabledGuardCottage(54.2, 24.8, -0.35, 0.96, mats);

        // Siege supply carts, barrel clusters & Gondor White-Tree roadside relief pillars!
        this._buildSupplyCartAndBarrels(-42.5, 24.2, 0.52, 0.94, mats);
        this._buildSupplyCartAndBarrels(45.5, 16.2, -0.78, 0.92, mats);
        this._buildRoadsideReliefPillar(-49.2, -21.8, 0.18, 0.95, mats, true);
        this._buildRoadsideReliefPillar(-49.2, 20.8, -0.18, 0.95, mats, true);
        this._buildRoadsideReliefPillar(19.5, -0.4, -HALF_PI, 0.90, mats, false);
        this._buildRoadsideReliefPillar(46.8, -8.5, -1.38, 0.96, mats, true);

      } else {
        // --- BLACK GATE: MORANNON IRON RAMPART, TEETH OF MORDOR & EASTERN BASTION ---
        this._addExclusionBox(-70, -54.5, -34, 34);
        this._addExclusionBox(53.5, 82, -30, 30);

        // Western Black Gate of Mordor (Morannon) framing twin entry lanes (-14.5 & +14.5)
        this._buildCurtainWall(this.root, -58.5, -25.0, -58.5, 25.0, 0, 10.5, 3.4, mats.wall, mats.trim, true, mats);

        // Twin dark siege portals at lane entrances
        const laneZs = [toWorldZ(215), toWorldZ(505)];
        for (let i = 0; i < laneZs.length; i++) {
          const pz = laneZs[i];
          const pArch = new THREE.Mesh(
            this._trackGeo(new THREE.TorusGeometry(2.6, 0.48, 6, 12, Math.PI)),
            mats.trim
          );
          pArch.rotation.y = HALF_PI;
          pArch.position.set(-56.7, 2.6, pz);
          this.root.add(pArch);

          const pVoid = new THREE.Mesh(
            this._trackGeo(new THREE.BoxGeometry(2.2, 5.2, 4.8)),
            this._trackMat(new THREE.MeshBasicMaterial({ color: 0x050307 }))
          );
          pVoid.position.set(-57.6, 2.5, pz);
          this.root.add(pVoid);
        }

        // Twin Spiked Teeth of Mordor Watchtowers (Carchost & Narchost) with glowing Crimson Eye slits!
        const teethZs = [-25.0, 25.0];
        const eyeMat = this._trackMat(new THREE.MeshBasicMaterial({ color: 0xff4500 }));
        for (let i = 0; i < teethZs.length; i++) {
          const tz = teethZs[i];
          this._buildDrumTower(this.root, -58.8, 0, tz, 4.1, 19.5, mats, {
            spikes: true,
            bannerYaw: HALF_PI,
            bannerScale: 1.15,
            bannerTex: mats.mordorBannerTex
          });

          const eyeGeo = this._trackGeo(new THREE.SphereGeometry(0.85, 10, 10));
          eyeGeo.scale(0.35, 1.45, 0.75);
          const eye = new THREE.Mesh(eyeGeo, eyeMat);
          eye.position.set(-54.6, 15.2, tz);
          this.root.add(eye);
          this._eyeMeshes.push(eye);
        }

        // Eastern Defended Vanguard Bastion at gatePoint
        this._buildPortcullisGatehouse(this.root, gateWx + 2.4, 0, gateWz, -HALF_PI, 1.04, mats, {
          spikes: true,
          bannerTex: mats.bannerTex
        });
        this._buildCurtainWall(this.root, 57.0, -24.0, 57.0, gateWz - 5.2, 0, 9.4, 2.8, mats.wall, mats.trim, true, mats);
        this._buildCurtainWall(this.root, 57.0, gateWz + 5.2, 57.0, 24.0, 0, 9.4, 2.8, mats.wall, mats.trim, true, mats);
        this._buildDrumTower(this.root, 64.5, 2.0, -12.0, 4.6, 15.5, mats, { spikes: true });

        // Ruined obsidian gothic tracery arches, watchposts, supply carts & way-pillars
        this._buildGothicRuins(28.5, -28.0, -0.22, 1.0, mats);
        this._buildMedievalWatchhouse(-54.5, 28.5, 0.45, 0.92, mats);
        this._buildGabledGuardCottage(54.8, 25.0, -0.42, 0.90, mats);
        this._buildSupplyCartAndBarrels(45.5, 15.2, -0.72, 0.90, mats);
        this._buildRoadsideReliefPillar(-46.5, -22.2, 0.2, 0.92, mats, false);
        this._buildRoadsideReliefPillar(46.2, -9.2, -1.35, 0.94, mats, true);
      }
    }

    // ==========================================================================
    // 2b. Atmospheric Sky Dome, Volumetric Sunbeams, Distant Mountains & Fog
    // ==========================================================================
    _setupAtmosphereAndLighting(mapId) {
      const THREE = this.THREE;
      if (!this.scene) return;

      const presets = {
        hornburg: {
          fogColor: 0x22364d,
          fogDensity: 0.0025,
          sunColor: 0xcce6ff,
          sunIntensity: 2.48,
          sunPos: [32, 60, -50],
          hemiSky: 0x8fbce8,
          hemiGround: 0x2d3d4f,
          hemiIntensity: 1.38,
          ambientIntensity: 0.62,
          rimColor: 0x9ad0ff,
          rimIntensity: 1.18
        },
        pelennor: {
          fogColor: 0x5e4d3a,
          fogDensity: 0.0023,
          sunColor: 0xffe6b3,
          sunIntensity: 2.58,
          sunPos: [38, 56, -52],
          hemiSky: 0xf4e2c6,
          hemiGround: 0x4a402e,
          hemiIntensity: 1.38,
          ambientIntensity: 0.62,
          rimColor: 0xffcb7a,
          rimIntensity: 1.18
        },
        blackgate: {
          fogColor: 0x2e1518,
          fogDensity: 0.0025,
          sunColor: 0xffb380,
          sunIntensity: 2.38,
          sunPos: [20, 56, -60],
          hemiSky: 0xd67c68,
          hemiGround: 0x46303a,
          hemiIntensity: 1.54,
          ambientIntensity: 0.70,
          rimColor: 0xff8252,
          rimIntensity: 1.36
        }
      };

      const p = presets[mapId] || presets.pelennor;
      this._baseLighting = p;
      this._titleBoost = 0;

      this.scene.fog = new THREE.FogExp2(p.fogColor, p.fogDensity);
      if (!this.scene.background) {
        this.scene.background = new THREE.Color(p.fogColor);
      } else if (this.scene.background.isColor) {
        this.scene.background.setHex(p.fogColor);
      }

      // Stage-owned Directional/Hemisphere/Ambient lighting inside this.root
      // (Scene3D._reconcileLighting automatically hides defaultLightsGroup when it sees our DirectionalLight!)
      this._ownsLights = true;

      this.sunLight = new THREE.DirectionalLight(p.sunColor, p.sunIntensity);
      this.sunLight.position.set(p.sunPos[0], p.sunPos[1], p.sunPos[2]);
      this.sunLight.castShadow = true;
      if (this.sunLight.shadow) {
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        const cam = this.sunLight.shadow.camera;
        cam.left = -74;
        cam.right = 74;
        cam.top = 56;
        cam.bottom = -56;
        cam.near = 8;
        cam.far = 210;
        cam.updateProjectionMatrix();
        this.sunLight.shadow.bias = -0.0004;
        this.sunLight.shadow.normalBias = 0.025;
      }
      this.root.add(this.sunLight);
      this.root.add(this.sunLight.target);

      this.hemiLight = new THREE.HemisphereLight(p.hemiSky, p.hemiGround, p.hemiIntensity);
      this.hemiLight.position.set(0, 60, 0);
      this.root.add(this.hemiLight);

      this.ambientLight = new THREE.AmbientLight(p.hemiSky, p.ambientIntensity || 0.60);
      this.root.add(this.ambientLight);

      // Golden/silver/crimson horizon rim directional light (non-shadow)
      this.rimLight = new THREE.DirectionalLight(p.rimColor, p.rimIntensity);
      this.rimLight.position.set(-48, 34, 46);
      this.root.add(this.rimLight);
    }

    _buildSkyDomeAndSunbeams(mapId) {
      const THREE = this.THREE;
      const w = 2048;
      const h = 1024;
      const c = makeCanvas(w, h);
      if (!c) return;
      const ctx = c.getContext('2d');

      // With dome positioned at (0, -74, 20), the camera's visible upper sky band (y_screen = 0..210px)
      // maps cleanly across v = 0.39..0.495, and u = 0.458 sits over the upper-right-center valley pass!
      const skyGrad = ctx.createLinearGradient(0, h * 0.34, 0, h * 0.55);
      if (mapId === 'hornburg') {
        skyGrad.addColorStop(0.00, '#0a1526');
        skyGrad.addColorStop(0.34, '#182e4a');
        skyGrad.addColorStop(0.62, '#3d668f');
        skyGrad.addColorStop(0.76, '#6290b8');
        skyGrad.addColorStop(0.90, '#2a435d');
        skyGrad.addColorStop(1.00, '#192a3c');
      } else if (mapId === 'pelennor') {
        skyGrad.addColorStop(0.00, '#1c2330');
        skyGrad.addColorStop(0.32, '#383d48');
        skyGrad.addColorStop(0.58, '#8c704e');
        skyGrad.addColorStop(0.75, '#dead6b');
        skyGrad.addColorStop(0.88, '#7c6448');
        skyGrad.addColorStop(1.00, '#46392b');
      } else {
        skyGrad.addColorStop(0.00, '#0d0609');
        skyGrad.addColorStop(0.34, '#290f14');
        skyGrad.addColorStop(0.60, '#752214');
        skyGrad.addColorStop(0.76, '#bd421b');
        skyGrad.addColorStop(0.90, '#4a1b18');
        skyGrad.addColorStop(1.00, '#241012');
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // Keep lower hemisphere (v > 0.55) deep atmospheric fog haze so no bright band can ever peek below!
      ctx.fillStyle = mapId === 'hornburg' ? '#192a3c' : (mapId === 'pelennor' ? '#46392b' : '#241012');
      ctx.fillRect(0, Math.floor(h * 0.548), w, Math.ceil(h * 0.46));

      // Smooth, Wide Atmospheric Sunbreak / Moonlit Mist / Volcanic Glow (ZERO zebra spokes!)
      const sunU = w * 0.458;
      const sunV = h * 0.448;

      // 1. Wide elliptical horizon bloom spreading softly along the mountain pass
      ctx.save();
      ctx.translate(sunU, sunV);
      ctx.scale(1.85, 0.82);
      const wideBloom = ctx.createRadialGradient(0, 0, 6, 0, 0, 290);
      if (mapId === 'hornburg') {
        wideBloom.addColorStop(0.00, 'rgba(226, 244, 255, 0.88)');
        wideBloom.addColorStop(0.24, 'rgba(158, 206, 245, 0.58)');
        wideBloom.addColorStop(0.58, 'rgba(78, 128, 178, 0.24)');
        wideBloom.addColorStop(1.00, 'rgba(22, 38, 58, 0)');
      } else if (mapId === 'pelennor') {
        wideBloom.addColorStop(0.00, 'rgba(255, 251, 230, 0.98)');
        wideBloom.addColorStop(0.22, 'rgba(255, 224, 152, 0.84)');
        wideBloom.addColorStop(0.52, 'rgba(232, 168, 84, 0.44)');
        wideBloom.addColorStop(1.00, 'rgba(68, 52, 38, 0)');
      } else {
        wideBloom.addColorStop(0.00, 'rgba(255, 214, 122, 0.92)');
        wideBloom.addColorStop(0.26, 'rgba(245, 98, 28, 0.68)');
        wideBloom.addColorStop(0.60, 'rgba(165, 34, 14, 0.30)');
        wideBloom.addColorStop(1.00, 'rgba(38, 12, 14, 0)');
      }
      ctx.fillStyle = wideBloom;
      ctx.beginPath();
      ctx.arc(0, 0, 290, 0, TWO_PI);
      ctx.fill();
      ctx.restore();

      // 2. Soft radiant solar core / diffused lunar glow
      const coreGlow = ctx.createRadialGradient(sunU, sunV, 2, sunU, sunV, mapId === 'hornburg' ? 72 : 120);
      if (mapId === 'hornburg') {
        coreGlow.addColorStop(0.00, 'rgba(252, 254, 255, 0.94)');
        coreGlow.addColorStop(0.32, 'rgba(215, 238, 255, 0.70)');
        coreGlow.addColorStop(1.00, 'rgba(140, 190, 235, 0)');
      } else if (mapId === 'pelennor') {
        coreGlow.addColorStop(0.00, 'rgba(255, 254, 242, 1.0)');
        coreGlow.addColorStop(0.38, 'rgba(255, 235, 178, 0.78)');
        coreGlow.addColorStop(1.00, 'rgba(245, 185, 95, 0)');
      } else {
        coreGlow.addColorStop(0.00, 'rgba(255, 232, 155, 0.95)');
        coreGlow.addColorStop(0.42, 'rgba(255, 115, 32, 0.65)');
        coreGlow.addColorStop(1.00, 'rgba(210, 48, 16, 0)');
      }
      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.arc(sunU, sunV, 120, 0, TWO_PI);
      ctx.fill();

      // 3. Billowing multi-layered cumulonimbus storm clouds parting organically around the sunbreak!
      const rand = mulberry32(mapId === 'hornburg' ? 301 : (mapId === 'pelennor' ? 307 : 313));
      for (let i = 0; i < 195; i++) {
        const nearBand = rand() < 0.80;
        const cx = nearBand ? (w * 0.26 + rand() * w * 0.48) : rand() * w;
        const cy = h * (0.350 + Math.pow(rand(), 0.90) * 0.138);
        const rx = 44 + rand() * 145;
        const ry = 10 + rand() * 26;

        const dxS = cx - sunU;
        const dyS = (cy - sunV) * 2.2;
        const distSun = Math.hypot(dxS, dyS);
        if (distSun < 64) continue;

        const rimProx = clamp(1 - (distSun - 64) / 280, 0, 1);

        // Soft warm golden / silver / crimson rim-lit cloud underside facing the sunbreak
        if (rimProx > 0.05) {
          const shiftX = -Math.sign(dxS || 1) * Math.min(15, rx * 0.14);
          const shiftY = (cy < sunV ? 1 : -1) * Math.min(7, ry * 0.30);
          const rimG = ctx.createRadialGradient(cx + shiftX, cy + shiftY, ry * 0.2, cx, cy, rx);
          if (mapId === 'hornburg') {
            rimG.addColorStop(0, `rgba(204, 232, 255, ${(0.34 * rimProx).toFixed(3)})`);
            rimG.addColorStop(1, 'rgba(90, 140, 185, 0)');
          } else if (mapId === 'pelennor') {
            rimG.addColorStop(0, `rgba(255, 226, 156, ${(0.46 * rimProx).toFixed(3)})`);
            rimG.addColorStop(1, 'rgba(210, 145, 72, 0)');
          } else {
            rimG.addColorStop(0, `rgba(255, 128, 44, ${(0.44 * rimProx).toFixed(3)})`);
            rimG.addColorStop(1, 'rgba(150, 32, 14, 0)');
          }
          ctx.fillStyle = rimG;
          ctx.beginPath();
          ctx.ellipse(cx + shiftX * 0.6, cy + shiftY * 0.6, rx * 1.05, ry * 1.08, 0, 0, TWO_PI);
          ctx.fill();
        }

        // Brooding stormy cumulonimbus belly
        const darkAlpha = (0.28 + rand() * 0.28) * (0.62 + 0.38 * (1 - rimProx * 0.48));
        const puffG = ctx.createRadialGradient(cx, cy - ry * 0.2, ry * 0.15, cx, cy, rx);
        if (mapId === 'hornburg') {
          puffG.addColorStop(0, `rgba(16, 28, 46, ${darkAlpha.toFixed(3)})`);
          puffG.addColorStop(0.68, `rgba(26, 44, 66, ${(darkAlpha * 0.64).toFixed(3)})`);
          puffG.addColorStop(1, 'rgba(26, 44, 66, 0)');
        } else if (mapId === 'pelennor') {
          puffG.addColorStop(0, `rgba(32, 35, 44, ${darkAlpha.toFixed(3)})`);
          puffG.addColorStop(0.68, `rgba(54, 50, 50, ${(darkAlpha * 0.60).toFixed(3)})`);
          puffG.addColorStop(1, 'rgba(54, 50, 50, 0)');
        } else {
          puffG.addColorStop(0, `rgba(18, 8, 12, ${(darkAlpha * 1.1).toFixed(3)})`);
          puffG.addColorStop(0.68, `rgba(42, 14, 16, ${(darkAlpha * 0.68).toFixed(3)})`);
          puffG.addColorStop(1, 'rgba(42, 14, 16, 0)');
        }
        ctx.fillStyle = puffG;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, (rand() - 0.5) * 0.12, 0, TWO_PI);
        ctx.fill();
      }

      const skyTex = this._trackTex(new THREE.CanvasTexture(c));
      if (THREE.SRGBColorSpace) skyTex.colorSpace = THREE.SRGBColorSpace;
      skyTex.needsUpdate = true;

      const domeGeo = this._trackGeo(new THREE.SphereGeometry(330, 48, 32));
      const domeMat = this._trackMat(new THREE.MeshBasicMaterial({
        map: skyTex,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false
      }));
      const dome = new THREE.Mesh(domeGeo, domeMat);
      dome.position.set(0, -74, 20);
      dome.rotation.y = HALF_PI;
      dome.renderOrder = -10;
      this.root.add(dome);

      // 3 Ultra-Wide, Ultra-Soft Diffused Atmospheric Valley Mist Veils (zero zebra stripes!)
      const beamColor = mapId === 'hornburg'
        ? 0xaad8ff
        : (mapId === 'pelennor' ? 0xffe4a4 : 0xff7034);
      for (let i = 0; i < 3; i++) {
        const bGeo = this._trackGeo(new THREE.PlaneGeometry(54 + i * 8, 88));
        const bMat = this._trackMat(new THREE.MeshBasicMaterial({
          map: this._sharedCache.sunbeam,
          color: beamColor,
          transparent: true,
          opacity: 0.022,
          blending: THREE.NormalBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: false
        }));
        const beam = new THREE.Mesh(bGeo, bMat);
        const fan = i - 1;
        beam.position.set(18 + fan * 24, 6 - Math.abs(fan) * 2, -112 - i * 8);
        beam.rotation.z = -0.28 - fan * 0.12;
        beam.rotation.y = fan * 0.08;
        this.root.add(beam);
        this._sunbeams.push({
          mesh: beam,
          mat: bMat,
          baseOp: mapId === 'pelennor' ? 0.024 : 0.016,
          phase: i * 1.4
        });
      }
    }

    _distantValleyFloorY(wx, wz, seed) {
      // Smooth diorama forced-perspective valley slope beyond z = -54 so distant mountains & sky frame cleanly
      // with ZERO gap or horizon clipping!
      const distBack = Math.max(0, -54 - wz);
      const baseDrop = 0.25 - Math.pow(distBack, 1.08) * 0.25;
      const riverCenter = 13 + Math.sin(distBack * 0.075) * 4.6 + distBack * 0.07;
      const dRiver = Math.abs(wx - riverCenter);
      const riverCut = -0.85 * Math.exp(-Math.pow(dRiver / 3.8, 2));
      const gentleRoll = (fbm2D(wx * 0.045 + 7, wz * 0.045 - 3, seed + 19, 3) - 0.45) * 3.2 * smoothstep(3.5, 16.0, dRiver);
      return baseDrop + riverCut + gentleRoll;
    }

    _buildDistantVista(mapId) {
      const THREE = this.THREE;
      const seed = mapId === 'hornburg' ? 501 : (mapId === 'pelennor' ? 509 : 521);

      // 1. Seamless Forced-Perspective Distant Valley Floor (z = -52..-176) — completely eliminates any horizon gap!
      const vWidth = 420;
      const vDepth = 124;
      const vZCenter = -114; // spans z = -52 to -176
      const valleyGeo = this._trackGeo(new THREE.PlaneGeometry(vWidth, vDepth, 88, 32));
      valleyGeo.rotateX(-HALF_PI);
      const vPos = valleyGeo.attributes.position;
      const vColors = new Float32Array(vPos.count * 3);

      const cNear = new THREE.Color(mapId === 'hornburg' ? 0x243838 : (mapId === 'pelennor' ? 0x383f26 : 0x24191e));
      const cHaze = new THREE.Color(mapId === 'hornburg' ? 0x3b5c7c : (mapId === 'pelennor' ? 0x8c7352 : 0x52211b));
      const tmpC = new THREE.Color();

      for (let i = 0; i < vPos.count; i++) {
        const vx = vPos.getX(i);
        const vz = vZCenter + vPos.getZ(i);
        const vy = this._distantValleyFloorY(vx, vz, seed);
        vPos.setXYZ(i, vx, vy, vz);

        const distT = smoothstep(-56, -168, vz);
        const mott = 0.86 + 0.28 * fbm2D(vx * 0.07, vz * 0.07, seed + 99, 3);
        tmpC.copy(cNear).lerp(cHaze, distT);
        vColors[i * 3] = tmpC.r * mott;
        vColors[i * 3 + 1] = tmpC.g * mott;
        vColors[i * 3 + 2] = tmpC.b * mott;
      }
      valleyGeo.setAttribute('color', new THREE.BufferAttribute(vColors, 3));
      valleyGeo.computeVertexNormals();

      const valleyMat = this._trackMat(new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.94,
        metalness: 0.02
      }));
      const valleyMesh = new THREE.Mesh(valleyGeo, valleyMat);
      valleyMesh.receiveShadow = true;
      this.root.add(valleyMesh);

      // 2. Three Layered 3D Mountain Vista Ranges with Aerial Perspective & Central-Right Sunlit Valley Pass!
      const layers = [
        {
          zCenter: -66, width: 268, depth: 30, maxH: 29, segX: 92, segZ: 16, passX: 14, passW: 24, dipAmt: 0.86,
          colTop: mapId === 'hornburg' ? 0x5c7590 : (mapId === 'pelennor' ? 0x6c6b5e : 0x3e2d35),
          colBot: mapId === 'hornburg' ? 0x1e2e3e : (mapId === 'pelennor' ? 0x313628 : 0x1a1216)
        },
        {
          zCenter: -96, width: 320, depth: 36, maxH: 45, segX: 96, segZ: 16, passX: 18, passW: 28, dipAmt: 0.78,
          colTop: mapId === 'hornburg' ? 0x7391ae : (mapId === 'pelennor' ? 0x8e7f67 : 0x592e26),
          colBot: mapId === 'hornburg' ? 0x283d52 : (mapId === 'pelennor' ? 0x484236 : 0x241416)
        },
        {
          zCenter: -132, width: 380, depth: 42, maxH: 62, segX: 96, segZ: 14, passX: 22, passW: 32, dipAmt: 0.66,
          colTop: mapId === 'hornburg' ? 0x89abc9 : (mapId === 'pelennor' ? 0xb59b76 : 0x783622),
          colBot: mapId === 'hornburg' ? 0x35506b : (mapId === 'pelennor' ? 0x635542 : 0x2e1616)
        }
      ];

      for (let li = 0; li < layers.length; li++) {
        const L = layers[li];
        const mGeo = this._trackGeo(new THREE.PlaneGeometry(L.width, L.depth, L.segX, L.segZ));
        mGeo.rotateX(-HALF_PI);
        const pos = mGeo.attributes.position;

        for (let i = 0; i < pos.count; i++) {
          const lx = pos.getX(i);
          const lz = pos.getZ(i);
          const wz = L.zCenter + lz;
          const baseFloor = this._distantValleyFloorY(lx, wz, seed) - 4.5;
          const zEnv = Math.sin(clamp((lz + L.depth * 0.5) / L.depth, 0, 1) * Math.PI);
          const valleyDip = 1 - L.dipAmt * Math.exp(-Math.pow((lx - L.passX) / L.passW, 2));
          const rNoise = ridgedFbm2D(lx * 0.030 + li * 19, wz * 0.030, seed + li * 73, 4);
          const detail = 0.88 + 0.24 * fbm2D(lx * 0.09, wz * 0.09, seed + 211 + li * 13, 2);
          const mh = baseFloor + Math.pow(zEnv, 0.72) * L.maxH * (0.26 + 0.94 * rNoise) * detail * valleyDip;
          pos.setXYZ(i, lx, mh, wz);
        }
        mGeo.computeVertexNormals();
        paintGeoVertexColor(THREE, mGeo, L.colTop, L.colBot);

        // Organic 2D rock & sunlit-ridge tinting on mountain crests
        const mCol = mGeo.attributes.color;
        for (let i = 0; i < pos.count; i++) {
          const px = pos.getX(i);
          const pz = pos.getZ(i);
          const nv = 0.86 + 0.28 * fbm2D(px * 0.085, pz * 0.085, seed + 409 + li * 31, 3);
          const sunProximity = 1 + 0.16 * Math.exp(-Math.pow((px - 22) / 38, 2));
          mCol.setXYZ(i, mCol.getX(i) * nv * sunProximity, mCol.getY(i) * nv * sunProximity, mCol.getZ(i) * nv);
        }

        const mMat = this._trackMat(new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.90 - li * 0.04,
          metalness: 0.04,
          flatShading: false
        }));
        const mMesh = new THREE.Mesh(mGeo, mMat);
        mMesh.receiveShadow = true;
        this.root.add(mMesh);
      }

      // 3. Tapered Winding Valley River hugging the sloping valley floor (like the golden river in reference image!)
      const riverSteps = 32;
      const rPositions = new Float32Array((riverSteps + 1) * 2 * 3);
      const rUvs = new Float32Array((riverSteps + 1) * 2 * 2);
      const rIndices = [];
      let rDist = 0;
      let prevRx = 0, prevRz = 0;

      for (let s = 0; s <= riverSteps; s++) {
        const t = s / riverSteps; // 0 = far (-148), 1 = near (-56)
        const rz = lerp(-148, -56, t);
        const distBack = Math.max(0, -54 - rz);
        const rx = 13 + Math.sin(distBack * 0.075) * 4.6 + distBack * 0.07;
        const ry = this._distantValleyFloorY(rx, rz, seed) + 0.22;
        const halfW = lerp(0.22, 0.96, Math.pow(t, 0.85));

        if (s > 0) rDist += Math.hypot(rx - prevRx, rz - prevRz);
        prevRx = rx;
        prevRz = rz;

        const nextDistBack = Math.max(0, -54 - (rz + 1.5));
        const nextRx = 13 + Math.sin(nextDistBack * 0.075) * 4.6 + nextDistBack * 0.07;
        const dx = nextRx - rx;
        const dz = 1.5;
        const dl = Math.hypot(dx, dz) || 1;
        const nx = dz / dl;
        const nz = -dx / dl;

        for (let side = 0; side < 2; side++) {
          const sgn = side === 0 ? -1 : 1;
          const idx = (s * 2 + side) * 3;
          rPositions[idx] = rx + nx * sgn * halfW;
          rPositions[idx + 1] = ry;
          rPositions[idx + 2] = rz + nz * sgn * halfW;

          const uIdx = (s * 2 + side) * 2;
          rUvs[uIdx] = side;
          rUvs[uIdx + 1] = rDist * 0.16;
        }
        if (s < riverSteps) {
          const a = s * 2;
          rIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }

      const riverGeo = this._trackGeo(new THREE.BufferGeometry());
      riverGeo.setAttribute('position', new THREE.BufferAttribute(rPositions, 3));
      riverGeo.setAttribute('uv', new THREE.BufferAttribute(rUvs, 2));
      riverGeo.setIndex(rIndices);
      riverGeo.computeVertexNormals();

      const isLavaVista = mapId === 'blackgate';
      const vistaFluidTex = this._trackTex(generateFluidTexture(THREE, isLavaVista ? 'lava' : 'water'));
      if (vistaFluidTex) this._fluidTexs.push({ tex: vistaFluidTex, speedY: -0.25, speedX: 0.02 });

      const riverMat = this._trackMat(new THREE.MeshStandardMaterial({
        map: vistaFluidTex,
        color: isLavaVista ? 0xff6e1c : (mapId === 'pelennor' ? 0xb59b6d : 0x628fb2),
        emissive: isLavaVista ? 0xd93800 : (mapId === 'pelennor' ? 0x664f2a : 0x213f59),
        emissiveIntensity: isLavaVista ? 0.92 : 0.22,
        roughness: 0.20,
        metalness: 0.48
      }));
      const riverMesh = new THREE.Mesh(riverGeo, riverMat);
      this.root.add(riverMesh);

      // 4. Distant Valley Foothill Pine Groves (continuing the forest into the distant valley!)
      if (this._sharedCache.pineGeo) {
        const vRand = mulberry32(seed + 881);
        const vDummy = new THREE.Object3D();
        const vMats = [];
        let vAtt = 0;
        const vTarget = mapId === 'blackgate' ? 45 : 90;
        while (vMats.length < vTarget && vAtt < 600) {
          vAtt++;
          const vx = -72 + vRand() * 144;
          const vz = -82 + vRand() * 28; // z = -82..-54
          const distBack = Math.max(0, -54 - vz);
          const riverCenter = 13 + Math.sin(distBack * 0.075) * 4.6 + distBack * 0.07;
          if (Math.abs(vx - riverCenter) < 4.5) continue;
          const vy = this._distantValleyFloorY(vx, vz, seed);
          const sc = (0.48 + vRand() * 0.36) * lerp(1.0, 0.65, clamp(distBack / 30, 0, 1));
          vDummy.position.set(vx, vy - 0.15, vz);
          vDummy.rotation.set(0, vRand() * TWO_PI, 0);
          vDummy.scale.setScalar(sc);
          vDummy.updateMatrix();
          vMats.push(vDummy.matrix.clone());
        }
        if (vMats.length > 0) {
          const dGeo = mapId === 'blackgate' ? this._sharedCache.deadPineGeo : this._sharedCache.pineGeo;
          const dMat = this._trackMat(new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.90,
            metalness: 0.02
          }));
          const dInst = new THREE.InstancedMesh(dGeo, dMat, vMats.length);
          for (let i = 0; i < vMats.length; i++) dInst.setMatrixAt(i, vMats[i]);
          dInst.instanceMatrix.needsUpdate = true;
          this.root.add(dInst);
        }
      }

      // 5. Erupting Mount Doom (Orodruin) Volcanic Silhouette on Black Gate!
      if (mapId === 'blackgate') {
        const doomX = 20;
        const doomZ = -104;
        const doomBaseY = this._distantValleyFloorY(doomX, doomZ, seed) - 3.0;

        const coneGeo = this._trackGeo(new THREE.CylinderGeometry(4.6, 28.5, 48, 28, 8));
        const pos = coneGeo.attributes.position;
        const doomCols = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
          const vx = pos.getX(i);
          const vy = pos.getY(i);
          const vz = pos.getZ(i);
          const hf = clamp((vy + 24) / 48, 0, 1);
          const ang = Math.atan2(vz, vx);
          const rWarp = 0.86 + 0.26 * ridgedFbm2D(vx * 0.08, vz * 0.08 + vy * 0.05, 811, 3);
          pos.setXYZ(i, vx * rWarp, vy, vz * rWarp);

          // Glowing molten lava channels fissuring down Mount Doom's upper cone!
          const channel = Math.pow(Math.max(0, Math.cos(ang * 5 + vy * 0.14)), 8.0) * smoothstep(0.35, 0.95, hf);
          doomCols[i * 3] = lerp(0.11, 0.28, hf) + channel * 1.35;
          doomCols[i * 3 + 1] = lerp(0.06, 0.12, hf) + channel * 0.42;
          doomCols[i * 3 + 2] = lerp(0.08, 0.11, hf) + channel * 0.08;
        }
        coneGeo.setAttribute('color', new THREE.BufferAttribute(doomCols, 3));
        coneGeo.computeVertexNormals();

        const coneMesh = new THREE.Mesh(coneGeo, this._trackMat(new THREE.MeshStandardMaterial({
          vertexColors: true, roughness: 0.86, flatShading: false
        })));
        coneMesh.position.set(doomX, doomBaseY + 24, doomZ);
        this.root.add(coneMesh);

        // Blazing molten crater rim & eruption column core
        const craterTopY = doomBaseY + 47.6;
        this._doomCraterPos = { x: doomX, y: craterTopY, z: doomZ };
        const craterGlow = new THREE.Mesh(
          this._trackGeo(new THREE.CylinderGeometry(5.0, 3.8, 2.6, 20)),
          this._trackMat(new THREE.MeshBasicMaterial({ color: 0xff6224 }))
        );
        craterGlow.position.set(doomX, craterTopY, doomZ);
        this.root.add(craterGlow);

        // Rising 3D volcanic ash & incandescent magma puffs
        const puffGeo = this._trackGeo(new THREE.DodecahedronGeometry(3.5, 1));
        for (let p = 0; p < 8; p++) {
          const pMat = this._trackMat(new THREE.MeshStandardMaterial({
            color: 0x24181b,
            emissive: p < 3 ? 0xb8320a : 0x1c0b0c,
            emissiveIntensity: p < 3 ? 0.92 : 0.28,
            roughness: 0.95,
            transparent: true,
            opacity: 0.72
          }));
          const puff = new THREE.Mesh(puffGeo, pMat);
          this.root.add(puff);
          this._volcanoPuffs.push({ mesh: puff, mat: pMat, offset: p / 8 });
        }
      } else {
        this._doomCraterPos = null;
      }
    }

    // ==========================================================================
    // 3. Instanced 3D Mixed Woodland Forests (Conifers + Gnarled Oaks), Boulders & Stakes
    // ==========================================================================
    _buildInstancedProps(mapId) {
      const THREE = this.THREE;
      const rand = mulberry32(mapId === 'hornburg' ? 9101 : (mapId === 'pelennor' ? 9203 : 9307));
      const dummy = new THREE.Object3D();

      // --- A. Mixed Organic 3D Woodland Forests (Drooping Conifer Pines + Gnarled Broadleaf Oaks) ---
      const targetTrees = mapId === 'blackgate' ? 155 : 235;
      const pineMatrices = [];
      const pineTints = [];
      const oakMatrices = [];
      const oakTints = [];

      // Deep woodland species color palettes (~82% dark conifers / ~18% muted forest-olive & russet woodland oaks!)
      const pinePalette = mapId === 'hornburg'
        ? [0xc0d6dc, 0xb0cbd4, 0xa8c4bc, 0xbcd0c4]
        : [0xcad6ba, 0xbccba8, 0xaec2a2, 0xd4d0b2];
      const oakPalette = mapId === 'hornburg'
        ? [0x8b9c8a, 0x7e8f80, 0x94967e]
        : [0x949e82, 0x899478, 0x9e9274, 0x828f76];

      let attempts = 0;
      while ((pineMatrices.length + oakMatrices.length) < targetTrees && attempts < 2900) {
        attempts++;
        const wx = -74 + rand() * 146;
        const wz = -46 + rand() * 82;

        // Never block south-central camera sightlines, roads, pads, water, or fortresses!
        if (wz > 25 && Math.abs(wx) < 42) continue;
        if (this._isExcluded(wx, wz, 1.5)) continue;
        if (this._distToRoadsWorld(wx, wz) < 5.35) continue;
        if (this._distToPadsWorld(wx, wz) < 4.55) continue;

        const wy = this.getTerrainHeightWorld(wx, wz);
        if (wy < -0.12 || wy > 14.2) continue;

        // Prefer forest pockets & foothills
        const grove = fbm2D(wx * 0.08 + 5, wz * 0.08 - 3, 419, 2);
        if (grove < 0.33 && Math.abs(wx) < 48 && wz > -22) continue;

        const isOak = mapId !== 'blackgate' && this._sharedCache.oakGeo && (
          mapId === 'pelennor' ? rand() < 0.19 : rand() < 0.14
        );

        const sc = isOak ? (0.76 + rand() * 0.50) : (0.78 + rand() * 0.68);
        dummy.position.set(wx, wy - 0.14, wz);
        dummy.rotation.set((rand() - 0.5) * 0.08, rand() * TWO_PI, (rand() - 0.5) * 0.08);
        dummy.scale.set(
          sc * (0.90 + rand() * 0.24),
          sc * (0.86 + rand() * 0.34),
          sc * (0.90 + rand() * 0.24)
        );
        dummy.updateMatrix();

        const shade = isOak ? (0.72 + rand() * 0.26) : (0.74 + rand() * 0.32);
        if (isOak) {
          oakMatrices.push(dummy.matrix.clone());
          oakTints.push({ hex: oakPalette[(rand() * oakPalette.length) | 0], shade });
        } else {
          pineMatrices.push(dummy.matrix.clone());
          pineTints.push({ hex: pinePalette[(rand() * pinePalette.length) | 0], shade });
        }
      }

      const foliageMat = this._trackMat(new THREE.MeshStandardMaterial({
        vertexColors: true,
        bumpMap: this._sharedCache.foliage_bump || null,
        bumpScale: 0.16,
        roughness: 0.86,
        metalness: 0.02
      }));

      if (pineMatrices.length > 0) {
        const treeGeo = mapId === 'blackgate' ? this._sharedCache.deadPineGeo : this._sharedCache.pineGeo;
        const treeInst = new THREE.InstancedMesh(treeGeo, foliageMat, pineMatrices.length);
        treeInst.castShadow = true;
        treeInst.receiveShadow = true;
        const tc = new THREE.Color();
        for (let i = 0; i < pineMatrices.length; i++) {
          treeInst.setMatrixAt(i, pineMatrices[i]);
          const pt = pineTints[i];
          tc.setHex(mapId === 'blackgate' ? 0xffffff : pt.hex).multiplyScalar(pt.shade);
          treeInst.setColorAt(i, tc);
        }
        treeInst.instanceMatrix.needsUpdate = true;
        if (treeInst.instanceColor) treeInst.instanceColor.needsUpdate = true;
        this.root.add(treeInst);
      }

      if (oakMatrices.length > 0 && this._sharedCache.oakGeo) {
        const oakInst = new THREE.InstancedMesh(this._sharedCache.oakGeo, foliageMat, oakMatrices.length);
        oakInst.castShadow = true;
        oakInst.receiveShadow = true;
        const oc = new THREE.Color();
        for (let i = 0; i < oakMatrices.length; i++) {
          oakInst.setMatrixAt(i, oakMatrices[i]);
          const ot = oakTints[i];
          oc.setHex(ot.hex).multiplyScalar(ot.shade);
          oakInst.setColorAt(i, oc);
        }
        oakInst.instanceMatrix.needsUpdate = true;
        if (oakInst.instanceColor) oakInst.instanceColor.needsUpdate = true;
        this.root.add(oakInst);
      }

      // --- B. 115 Instanced 3D Mossy / Cragged Boulders ---
      const boulderMatrices = [];
      const boulderShades = [];
      attempts = 0;
      while (boulderMatrices.length < 115 && attempts < 1400) {
        attempts++;
        const wx = -70 + rand() * 140;
        const wz = -40 + rand() * 76;
        if (this._isExcluded(wx, wz, 0.5)) continue;
        if (this._distToRoadsWorld(wx, wz) < 3.65) continue;
        if (this._distToPadsWorld(wx, wz) < 3.55) continue;
        const wy = this.getTerrainHeightWorld(wx, wz);
        if (wy < -0.6) continue;

        const rx = 0.48 + rand() * 1.15;
        dummy.position.set(wx, wy - 0.14, wz);
        dummy.rotation.set(rand() * 0.5, rand() * TWO_PI, rand() * 0.5);
        dummy.scale.set(rx, rx * (0.62 + rand() * 0.45), rx * (0.78 + rand() * 0.42));
        dummy.updateMatrix();
        boulderMatrices.push(dummy.matrix.clone());
        boulderShades.push(0.72 + rand() * 0.45);
      }

      if (boulderMatrices.length > 0) {
        const rockTint = mapId === 'hornburg'
          ? new THREE.Color(0x5d6e80)
          : (mapId === 'pelennor' ? new THREE.Color(0x7c786d) : new THREE.Color(0x433b4d));
        const bMat = this._trackMat(new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.88,
          metalness: 0.05,
          flatShading: true
        }));
        const bInst = new THREE.InstancedMesh(this._sharedCache.boulderGeo, bMat, boulderMatrices.length);
        bInst.castShadow = true;
        bInst.receiveShadow = true;
        const bc = new THREE.Color();
        for (let i = 0; i < boulderMatrices.length; i++) {
          bInst.setMatrixAt(i, boulderMatrices[i]);
          const s = boulderShades[i];
          bc.setRGB(rockTint.r * s, rockTint.g * s, rockTint.b * s);
          bInst.setColorAt(i, bc);
        }
        bInst.instanceMatrix.needsUpdate = true;
        if (bInst.instanceColor) bInst.instanceColor.needsUpdate = true;
        this.root.add(bInst);
      }

      // --- C. 40 Instanced Ruined Timber Siege Stakes & Barricades ---
      const stakeMatrices = [];
      attempts = 0;
      while (stakeMatrices.length < 40 && attempts < 900) {
        attempts++;
        const wx = -52 + rand() * 98;
        const wz = -24 + rand() * 48;
        if (this._isExcluded(wx, wz, 1.0)) continue;
        const dR = this._distToRoadsWorld(wx, wz);
        if (dR < 3.95 || dR > 7.8) continue;
        if (this._distToPadsWorld(wx, wz) < 3.9) continue;
        const wy = this.getTerrainHeightWorld(wx, wz);
        if (wy < -0.1 || wy > 2.2) continue;

        dummy.position.set(wx, wy, wz);
        dummy.rotation.set(0, rand() * TWO_PI, 0);
        dummy.scale.setScalar(0.75 + rand() * 0.35);
        dummy.updateMatrix();
        stakeMatrices.push(dummy.matrix.clone());
      }

      if (stakeMatrices.length > 0) {
        const sMat = this._trackMat(new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.90,
          metalness: 0.05
        }));
        const sInst = new THREE.InstancedMesh(this._sharedCache.stakeGeo, sMat, stakeMatrices.length);
        sInst.castShadow = true;
        sInst.receiveShadow = true;
        for (let i = 0; i < stakeMatrices.length; i++) {
          sInst.setMatrixAt(i, stakeMatrices[i]);
        }
        sInst.instanceMatrix.needsUpdate = true;
        this.root.add(sInst);
      }
    }

    _buildFlickeringTorches(mapId, mapData) {
      const THREE = this.THREE;
      const list = mapData.torches || [];
      if (list.length === 0) return;

      const ironMat = this._trackMat(new THREE.MeshStandardMaterial({
        color: 0x262930, roughness: 0.56, metalness: 0.68
      }));
      const emberMat = this._trackMat(new THREE.MeshBasicMaterial({ color: 0xff6d00 }));
      const outerFlameMat = this._trackMat(new THREE.MeshBasicMaterial({
        color: 0xff7b1c,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      const innerFlameMat = this._trackMat(new THREE.MeshBasicMaterial({
        color: 0xfff3b0,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      const spriteMat = this._trackMat(new THREE.SpriteMaterial({
        map: this._sharedCache.glow_sprite,
        color: 0xff9d3b,
        transparent: true,
        opacity: 0.62,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));

      const pedGeo = this._trackGeo(new THREE.CylinderGeometry(0.18, 0.32, 1.35, 6));
      const bowlGeo = this._trackGeo(new THREE.CylinderGeometry(0.46, 0.22, 0.36, 8));
      const flameOuterGeo = this._trackGeo(new THREE.ConeGeometry(0.32, 0.95, 7));
      flameOuterGeo.translate(0, 0.42, 0);
      const flameInnerGeo = this._trackGeo(new THREE.ConeGeometry(0.18, 0.62, 6));
      flameInnerGeo.translate(0, 0.28, 0);

      // Attach real dynamic PointLights to up to 5 largest/key torches for locked 60 FPS
      const sortedIndices = list.map((t, idx) => ({ idx, size: t.size || 1 }))
        .sort((a, b) => b.size - a.size);
      const lightSet = {};
      for (let i = 0; i < Math.min(5, sortedIndices.length); i++) {
        lightSet[sortedIndices[i].idx] = true;
      }

      for (let i = 0; i < list.length; i++) {
        const td = list[i];
        const wx = toWorldX(td.x);
        const wz = toWorldZ(td.y);
        const wy = Math.max(0, this.getTerrainHeightWorld(wx, wz));
        const s = td.size || 1.0;

        const grp = new THREE.Group();
        grp.position.set(wx, wy, wz);
        grp.scale.setScalar(s);

        const ped = new THREE.Mesh(pedGeo, ironMat);
        ped.position.y = 0.67;
        ped.castShadow = true;
        grp.add(ped);

        const bowl = new THREE.Mesh(bowlGeo, ironMat);
        bowl.position.y = 1.42;
        bowl.castShadow = true;
        grp.add(bowl);

        const ember = new THREE.Mesh(this._trackGeo(new THREE.CircleGeometry(0.38, 8)), emberMat);
        ember.rotation.x = -HALF_PI;
        ember.position.y = 1.61;
        grp.add(ember);

        const fOut = new THREE.Mesh(flameOuterGeo, outerFlameMat);
        fOut.position.y = 1.58;
        grp.add(fOut);

        const fIn = new THREE.Mesh(flameInnerGeo, innerFlameMat);
        fIn.position.y = 1.60;
        grp.add(fIn);

        const halo = new THREE.Sprite(spriteMat);
        halo.position.y = 1.95;
        halo.scale.set(2.3, 2.3, 1);
        grp.add(halo);

        let light = null;
        if (lightSet[i]) {
          light = new THREE.PointLight(0xff8f33, 26 * s, 18, 1.8);
          light.position.set(0, 2.2, 0);
          grp.add(light);
        }

        this.root.add(grp);
        this._torches.push({
          outer: fOut,
          inner: fIn,
          halo: halo,
          light: light,
          baseLightInt: 26 * s,
          phase: i * 2.17
        });
      }
    }

    // ==========================================================================
    // 4. 3D Holographic Build Pads (matching bottom-left of reference image!)
    // ==========================================================================
    _buildHolographicPads(mapId, mapData) {
      const THREE = this.THREE;
      const pads = mapData.pads || [];
      if (pads.length === 0) return;

      const stoneSet = mapId === 'hornburg'
        ? this._sharedCache.ashlar_slate
        : (mapId === 'pelennor' ? this._sharedCache.ashlar_ivory : this._sharedCache.ashlar_obsidian);

      const plinthMat = this._trackMat(new THREE.MeshStandardMaterial({
        map: stoneSet ? stoneSet.map : null,
        bumpMap: stoneSet ? stoneSet.bumpMap : null,
        bumpScale: 0.25,
        color: mapId === 'hornburg' ? 0x748699 : (mapId === 'pelennor' ? 0xaba393 : 0x564c63),
        roughness: 0.80,
        metalness: 0.08
      }));

      const outerPlinthGeo = this._trackGeo(new THREE.CylinderGeometry(2.42, 2.62, 0.16, 20));
      const innerDeckGeo = this._trackGeo(new THREE.CylinderGeometry(2.08, 2.14, 0.08, 20));
      const hitGeo = this._trackGeo(new THREE.CylinderGeometry(2.65, 2.65, 2.6, 12));
      const hitMat = this._trackMat(new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false
      }));

      const runeGeo = this._trackGeo(new THREE.PlaneGeometry(5.25, 5.25));
      runeGeo.rotateX(-HALF_PI);

      const auraGeo = this._trackGeo(new THREE.CylinderGeometry(1.45, 1.85, 2.2, 16, 1, true));
      auraGeo.translate(0, 1.1, 0);

      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        const wx = toWorldX(pad.x);
        const wz = toWorldZ(pad.y);

        const grp = new THREE.Group();
        grp.position.set(wx, 0, wz);
        grp.name = 'BuildPad_' + pad.id;

        // Carved 3D circular stone foundation plinth at y = 0
        const plinth = new THREE.Mesh(outerPlinthGeo, plinthMat);
        plinth.position.y = 0.08;
        plinth.receiveShadow = true;
        plinth.castShadow = true;
        plinth.userData = { isPad: true, pad: pad, padId: pad.id };
        grp.add(plinth);

        const deck = new THREE.Mesh(innerDeckGeo, plinthMat);
        deck.position.y = 0.18;
        deck.receiveShadow = true;
        deck.userData = { isPad: true, pad: pad, padId: pad.id };
        grp.add(deck);

        // Invisible 3D hit-volume cylinder for crisp 3D click/hover raycasting
        const hitMesh = new THREE.Mesh(hitGeo, hitMat);
        hitMesh.position.y = 1.3;
        hitMesh.userData = { isPad: true, pad: pad, padId: pad.id };
        grp.add(hitMesh);

        // Empty-pad Holographic Group (sub-bloom NormalBlending so ghost turret + rune ring stay razor-sharp!)
        const holoGroup = new THREE.Group();
        holoGroup.position.y = 0.21;
        holoGroup.userData = { isGhost: true, padId: pad.id };

        const runeMat = this._trackMat(new THREE.MeshBasicMaterial({
          map: this._sharedCache.pad_rune,
          color: 0xf0e9d8,
          transparent: true,
          opacity: 0.64,
          blending: THREE.NormalBlending,
          depthWrite: false
        }));
        const runeMesh = new THREE.Mesh(runeGeo, runeMat);
        runeMesh.position.y = 0.015;
        holoGroup.add(runeMesh);

        const ghostMat = this._trackMat(new THREE.MeshBasicMaterial({
          color: 0xd0d9e0,
          transparent: true,
          opacity: 0.14,
          blending: THREE.NormalBlending,
          depthWrite: false,
          side: THREE.FrontSide
        }));
        const ghostMesh = new THREE.Mesh(this._sharedCache.ghostTurretGeo, ghostMat);
        holoGroup.add(ghostMesh);

        const edgeMat = this._trackMat(new THREE.LineBasicMaterial({
          color: 0xeaf1f7,
          transparent: true,
          opacity: 0.34,
          blending: THREE.NormalBlending,
          depthWrite: false
        }));
        const ghostEdges = new THREE.LineSegments(this._sharedCache.ghostTurretEdges, edgeMat);
        holoGroup.add(ghostEdges);

        const auraMat = this._trackMat(new THREE.MeshBasicMaterial({
          color: 0xe6decb,
          transparent: true,
          opacity: 0.018,
          blending: THREE.NormalBlending,
          depthWrite: false,
          side: THREE.DoubleSide
        }));
        const auraMesh = new THREE.Mesh(auraGeo, auraMat);
        holoGroup.add(auraMesh);

        grp.add(holoGroup);
        this.root.add(grp);

        this.padHitMeshes.push(hitMesh);
        this.padMeshes.push(plinth);
        this.padEntries.push({
          id: pad.id,
          pad: pad,
          group: grp,
          plinthMesh: plinth,
          hitMesh: hitMesh,
          holoGroup: holoGroup,
          runeMesh: runeMesh,
          runeMat: runeMat,
          ghostMesh: ghostMesh,
          ghostMat: ghostMat,
          ghostEdges: ghostEdges,
          edgeMat: edgeMat,
          auraMat: auraMat
        });
      }
    }

    // ==========================================================================
    // 5. Per-Frame Animation Update & Clean Zero-Leak Disposal
    // ==========================================================================
    update(dt, time, game) {
      // Support both update(dt, time, game) and update(dt, game)
      if (typeof time === 'object' && time !== null && game === undefined) {
        game = time;
        time = typeof game.time === 'number' ? game.time : this._elapsed;
      }

      const safeDt = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0.016;
      this._elapsed += safeDt;
      const t = Number.isFinite(time) ? time : this._elapsed;

      // 1. Scroll water & lava textures + pulse magma emissive glow
      for (let i = 0; i < this._fluidTexs.length; i++) {
        const fl = this._fluidTexs[i];
        fl.tex.offset.y = (fl.tex.offset.y + fl.speedY * safeDt) % 1;
        fl.tex.offset.x = Math.sin(t * 0.7 + i) * 0.03;
        if (fl.isLava && fl.mat) {
          fl.mat.emissiveIntensity = 0.88 + 0.16 * Math.sin(t * 3.1) + this._ringBlend * 0.25;
        }
      }

      // 2. Flicker 3D torches & focal PointLights
      for (let i = 0; i < this._torches.length; i++) {
        const tr = this._torches[i];
        const flk = 0.86 + 0.14 * Math.sin(t * 13.5 + tr.phase) + 0.08 * Math.cos(t * 27.0 + tr.phase * 1.7);
        tr.outer.scale.set(0.95 + (flk - 0.86) * 0.4, flk, 0.95 + (flk - 0.86) * 0.4);
        tr.outer.rotation.z = Math.sin(t * 6.2 + tr.phase) * 0.09;
        tr.inner.scale.setScalar(0.9 + (flk - 0.8) * 0.45);
        tr.halo.scale.setScalar(2.15 + (flk - 0.85) * 1.1);
        if (tr.light) {
          tr.light.intensity = tr.baseLightInt * flk * (1 + this._ringBlend * 0.22);
        }
      }

      // 3. Gentle valley wind sway on castle cloth banners
      for (let i = 0; i < this._banners.length; i++) {
        const b = this._banners[i];
        b.mesh.rotation.x = 0.06 + Math.sin(t * 2.4 + b.phase) * 0.065;
        b.mesh.rotation.z = Math.cos(t * 1.8 + b.phase) * 0.035;
      }

      // 4. Shimmer sky sunbeams, Teeth of Mordor eyes & Mount Doom volcanic smoke
      for (let i = 0; i < this._sunbeams.length; i++) {
        const sb = this._sunbeams[i];
        sb.mat.opacity = sb.baseOp * (0.82 + 0.24 * Math.sin(t * 0.85 + sb.phase));
      }
      for (let i = 0; i < this._eyeMeshes.length; i++) {
        const sc = 0.92 + 0.14 * Math.sin(t * 4.5 + i);
        this._eyeMeshes[i].scale.set(0.35 * sc, 1.45 * sc, 0.75 * sc);
      }
      const doomPos = this._doomCraterPos || { x: 20, y: 26, z: -104 };
      for (let i = 0; i < this._volcanoPuffs.length; i++) {
        const vp = this._volcanoPuffs[i];
        const cycle = (t * 0.085 + vp.offset) % 1;
        vp.mesh.position.set(
          doomPos.x + Math.sin(cycle * 6 + i) * (2.5 + cycle * 9.5),
          doomPos.y + 1.2 + cycle * 30,
          doomPos.z + Math.cos(cycle * 4 + i) * 3.5
        );
        vp.mesh.scale.setScalar(1.0 + cycle * 2.5);
        vp.mesh.rotation.y = t * 0.3 + i;
        vp.mat.opacity = Math.sin(cycle * Math.PI) * 0.68;
      }

      // 5. Sync Empty / Occupied Build Pad Holograms + Hover Brightening
      const towerMgr = game && game.towers;
      const towerArr = towerMgr && Array.isArray(towerMgr.towers) ? towerMgr.towers : null;
      const hoveredId = (game && game.hoveredPad && typeof game.hoveredPad.id === 'number')
        ? game.hoveredPad.id
        : this._hoveredPadId;
      const selectedId = (game && game.selectedPad && typeof game.selectedPad.id === 'number')
        ? game.selectedPad.id
        : this._selectedPadId;

      for (let i = 0; i < this.padEntries.length; i++) {
        const entry = this.padEntries[i];
        let occupied = !!this._manualOccupied[entry.id];
        if (!occupied && towerMgr) {
          if (typeof towerMgr.getTowerOnPad === 'function') {
            occupied = !!towerMgr.getTowerOnPad(entry.id);
          } else if (towerArr) {
            for (let k = 0; k < towerArr.length; k++) {
              if (towerArr[k].padId === entry.id) {
                occupied = true;
                break;
              }
            }
          }
        }

        entry.holoGroup.visible = !occupied;
        if (!occupied) {
          const isFocus = entry.id === hoveredId || entry.id === selectedId;
          const pulse = 0.5 + 0.5 * Math.sin(t * 2.8 + entry.id * 0.85);
          const targetBodyOp = isFocus ? 0.24 : (0.12 + pulse * 0.035);
          const targetEdgeOp = isFocus ? 0.52 : (0.31 + pulse * 0.06);
          const targetRuneOp = isFocus ? 0.82 : (0.60 + pulse * 0.07);
          const targetScale = isFocus ? 1.06 : 1.0;

          entry.ghostMat.opacity = lerp(entry.ghostMat.opacity, targetBodyOp, clamp(safeDt * 10, 0, 1));
          entry.edgeMat.opacity = lerp(entry.edgeMat.opacity, targetEdgeOp, clamp(safeDt * 10, 0, 1));
          entry.runeMat.opacity = lerp(entry.runeMat.opacity, targetRuneOp, clamp(safeDt * 10, 0, 1));
          entry.auraMat.opacity = isFocus ? 0.045 : (0.012 + pulse * 0.008);

          const floatY = Math.sin(t * 2.2 + entry.id) * 0.035;
          entry.ghostMesh.position.y = floatY;
          entry.ghostEdges.position.y = floatY;
          entry.ghostMesh.scale.setScalar(lerp(entry.ghostMesh.scale.x, targetScale, clamp(safeDt * 10, 0, 1)));
          entry.ghostEdges.scale.copy(entry.ghostMesh.scale);
          entry.runeMesh.rotation.z = t * 0.14 * (entry.id % 2 === 0 ? 1 : -1);
        }
      }

      // 6. Ring of Power Dramatic Lighting Shift & Title Screen Luminous Sunrise Lift!
      const ringOn = !!(game && game.ringActive);
      const targetRing = ringOn ? 1 : 0;
      const isTitle = !!(game && game.state === 'title');
      const targetTitle = isTitle ? 1 : 0;
      if (
        Math.abs(this._ringBlend - targetRing) > 0.001 ||
        Math.abs((this._titleBoost || 0) - targetTitle) > 0.001 ||
        ringOn
      ) {
        this._ringBlend = lerp(this._ringBlend, targetRing, clamp(safeDt * 3.4, 0, 1));
        this._titleBoost = lerp(this._titleBoost || 0, targetTitle, clamp(safeDt * 4.0, 0, 1));
        this._applyRingLightingBlend(this._ringBlend, t, this._titleBoost);
      }
    }

    _applyRingLightingBlend(blend, t, titleBoost) {
      const THREE = this.THREE;
      const base = this._baseLighting;
      if (!base || !THREE) return;

      const tb = titleBoost || 0;
      const cTmp = new THREE.Color();
      const cRingSun = new THREE.Color(0xff9e2c);
      const cRingRim = new THREE.Color(0xff4d00);
      const cRingFog = new THREE.Color(0x2b170e);
      const cRingSky = new THREE.Color(0x522a1c);
      const pulse = 1 + 0.08 * Math.sin(t * 6.0) * blend;
      const titleLift = 1 + tb * 0.16;

      if (this.sunLight) {
        cTmp.setHex(base.sunColor).lerp(cRingSun, blend * 0.72);
        this.sunLight.color.copy(cTmp);
        this.sunLight.intensity = lerp(base.sunIntensity, base.sunIntensity * 0.86, blend) * pulse * titleLift;
      }
      if (this.rimLight) {
        cTmp.setHex(base.rimColor).lerp(cRingRim, blend * 0.88);
        this.rimLight.color.copy(cTmp);
        this.rimLight.intensity = lerp(base.rimIntensity, 1.55, blend) * pulse * (1 + tb * 0.12);
      }
      if (this.hemiLight) {
        cTmp.setHex(base.hemiSky).lerp(cRingSky, blend * 0.75);
        this.hemiLight.color.copy(cTmp);
        this.hemiLight.intensity = lerp(base.hemiIntensity, base.hemiIntensity * 0.68, blend) * titleLift;
      }
      if (this.ambientLight) {
        this.ambientLight.intensity = (base.ambientIntensity || 0.60) * (1 + tb * 0.15);
      }
      if (this.scene && this.scene.fog && this.scene.fog.isFogExp2) {
        cTmp.setHex(base.fogColor).lerp(cRingFog, blend * 0.65);
        this.scene.fog.color.copy(cTmp);
        this.scene.fog.density = lerp(base.fogDensity, base.fogDensity * 1.24, blend) * (1 - tb * 0.22);
      }
    }

    clearMap() {
      if (this.root) {
        while (this.root.children.length > 0) {
          this.root.remove(this.root.children[0]);
        }
      }

      for (let i = 0; i < this._mapGeos.length; i++) {
        if (this._mapGeos[i] && this._mapGeos[i].dispose) this._mapGeos[i].dispose();
      }
      for (let i = 0; i < this._mapMats.length; i++) {
        if (this._mapMats[i] && this._mapMats[i].dispose) this._mapMats[i].dispose();
      }
      for (let i = 0; i < this._mapTexs.length; i++) {
        if (this._mapTexs[i] && this._mapTexs[i].dispose) this._mapTexs[i].dispose();
      }

      this._mapGeos.length = 0;
      this._mapMats.length = 0;
      this._mapTexs.length = 0;

      this.terrainMesh = null;
      this.terrain = null;
      this.padEntries.length = 0;
      this.padHitMeshes.length = 0;
      this.padMeshes.length = 0;
      this._torches.length = 0;
      this._banners.length = 0;
      this._fluidTexs.length = 0;
      this._sunbeams.length = 0;
      this._volcanoPuffs.length = 0;
      this._eyeMeshes.length = 0;
      this._exclusionBoxes.length = 0;

      if (this.sunLight && this.sunLight.shadow && this.sunLight.shadow.map) {
        this.sunLight.shadow.map.dispose();
      }
      this.sunLight = null;
      this.hemiLight = null;
      this.ambientLight = null;
      this.rimLight = null;
    }

    dispose() {
      this.clearMap();

      for (let i = 0; i < this._sharedGeos.length; i++) {
        if (this._sharedGeos[i] && this._sharedGeos[i].dispose) this._sharedGeos[i].dispose();
      }
      for (let i = 0; i < this._sharedTexs.length; i++) {
        if (this._sharedTexs[i] && this._sharedTexs[i].dispose) this._sharedTexs[i].dispose();
      }
      this._sharedGeos.length = 0;
      this._sharedTexs.length = 0;
      this._sharedCache = {};

      if (this.root && this.root.parent) {
        this.root.parent.remove(this.root);
      }
    }
  }

  TD.Environment3D = Environment3D;
})(window.TD = window.TD || {});
