(function (TD) {
  'use strict';

  const LOGICAL_W = 1280;
  const LOGICAL_H = 720;
  const WORLD_SCALE = 0.1;
  const HALF_W = 640;
  const HALF_H = 360;
  const TAU = Math.PI * 2;
  const HALF_PI = Math.PI * 0.5;

  const KIND_COLORS = {
    blood: '#b71c1c',
    spark: '#ffd54f',
    magic: '#7fd4ff',
    fire: '#ff7b29',
    smoke: '#484e58',
    stone: '#8b929e',
    trail: '#ffe082'
  };

  const MAX_PARTICLES = 1400;
  const MAX_SPARK_INST = 700;
  const MAX_MAGIC_INST = 240;
  const MAX_SMOKE_INST = 460;
  const MAX_DEBRIS_INST = 320;
  const MAX_TEXTS = 120;
  const MAX_SHOCKWAVES = 40;
  const MAX_EXPLOSIONS = 24;
  const MAX_LIGHTNINGS = 36;
  const MAX_BEAMS = 24;
  const MAX_EARENDILS = 6;
  const MAX_EAGLES = 4;
  const MAX_RAIN_DROPS = 600;
  const MAX_RAIN_SPLASHES = 90;
  const MAX_ASH_FLAKES = 260;
  const MAX_ASH_WISPS = 26;
  const MAX_EMBERS = 320;
  const DYNAMIC_LIGHT_SLOTS = 4;
  const RIBBON_SEGS = 7; // 8 spine points per projectile ribbon

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function getTHREE() {
    if (typeof window !== 'undefined' && window.THREE) return window.THREE;
    if (typeof globalThis !== 'undefined' && globalThis.THREE) return globalThis.THREE;
    return null;
  }

  function createPool(createFn, resetFn, initialSize) {
    if (TD && typeof TD.Pool === 'function') {
      return new TD.Pool(createFn, resetFn, initialSize);
    }
    const free = [];
    const inUse = [];
    const count = initialSize || 32;
    for (let i = 0; i < count; i++) {
      const item = createFn();
      item._inPool = true;
      item._poolIdx = -1;
      free.push(item);
    }
    return {
      inUse,
      acquire() {
        const obj = free.length > 0 ? free.pop() : createFn();
        obj._inPool = false;
        obj._poolIdx = inUse.length;
        inUse.push(obj);
        if (resetFn) resetFn(obj);
        return obj;
      },
      release(obj) {
        if (!obj || obj._inPool) return;
        const idx = obj._poolIdx;
        if (idx >= 0 && idx < inUse.length && inUse[idx] === obj) {
          const last = inUse.pop();
          if (idx < inUse.length && last) {
            inUse[idx] = last;
            last._poolIdx = idx;
          }
        }
        obj._poolIdx = -1;
        obj._inPool = true;
        if (resetFn) resetFn(obj);
        free.push(obj);
      },
      clear() {
        free.length = 0;
        inUse.length = 0;
      }
    };
  }

  // Fast CSS color parser (#rgb, #rrggbb, rgb/rgba) -> { r, g, b } in 0..1 with cache
  const _colorCache = Object.create(null);
  function parseColorRGB(str) {
    if (!str || typeof str !== 'string') return { r: 1, g: 0.85, b: 0.4 };
    const cached = _colorCache[str];
    if (cached) return cached;

    let r = 1;
    let g = 1;
    let b = 1;
    const s = str.trim();
    if (s.charCodeAt(0) === 35) {
      if (s.length === 4) {
        r = parseInt(s[1] + s[1], 16) / 255;
        g = parseInt(s[2] + s[2], 16) / 255;
        b = parseInt(s[3] + s[3], 16) / 255;
      } else if (s.length >= 7) {
        r = parseInt(s.slice(1, 3), 16) / 255;
        g = parseInt(s.slice(3, 5), 16) / 255;
        b = parseInt(s.slice(5, 7), 16) / 255;
      }
    } else if (s.indexOf('rgb') === 0) {
      const m = s.match(/[\d.]+/g);
      if (m && m.length >= 3) {
        r = clamp(parseFloat(m[0]) / 255, 0, 1);
        g = clamp(parseFloat(m[1]) / 255, 0, 1);
        b = clamp(parseFloat(m[2]) / 255, 0, 1);
      }
    }
    if (Number.isNaN(r)) r = 1;
    if (Number.isNaN(g)) g = 1;
    if (Number.isNaN(b)) b = 1;
    const out = { r, g, b };
    _colorCache[str] = out;
    return out;
  }

  // ============================================================================
  // Procedural Zero-Asset Canvas Textures for 3D VFX
  // ============================================================================
  function makeCanvas(size) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    return c;
  }

  function buildProceduralTextures(THREE) {
    const textures = {};

    // 1. Soft radial glow sprite
    const glowCanvas = makeCanvas(64);
    if (glowCanvas) {
      const ctx = glowCanvas.getContext('2d');
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0.0, 'rgba(255,255,255,1)');
      g.addColorStop(0.22, 'rgba(255,255,255,0.86)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.28)');
      g.addColorStop(1.0, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      textures.glow = new THREE.CanvasTexture(glowCanvas);
    }

    // 2. Multi-lobed volumetric smoke puff texture (billowing cloud look)
    const smokeCanvas = makeCanvas(96);
    if (smokeCanvas) {
      const ctx = smokeCanvas.getContext('2d');
      ctx.clearRect(0, 0, 96, 96);
      const lobes = [
        { x: 48, y: 48, r: 38, a: 0.62 },
        { x: 35, y: 41, r: 27, a: 0.48 },
        { x: 61, y: 42, r: 26, a: 0.45 },
        { x: 44, y: 60, r: 25, a: 0.42 },
        { x: 56, y: 34, r: 22, a: 0.40 }
      ];
      for (let i = 0; i < lobes.length; i++) {
        const l = lobes[i];
        const gr = ctx.createRadialGradient(l.x - 3, l.y - 4, 1, l.x, l.y, l.r);
        gr.addColorStop(0.0, `rgba(235, 238, 244, ${l.a})`);
        gr.addColorStop(0.5, `rgba(175, 180, 190, ${l.a * 0.55})`);
        gr.addColorStop(1.0, 'rgba(110, 115, 124, 0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(l.x, l.y, l.r, 0, TAU);
        ctx.fill();
      }
      textures.smoke = new THREE.CanvasTexture(smokeCanvas);
    }

    // 3. Scorched burning oil tar decal texture
    const oilCanvas = makeCanvas(128);
    if (oilCanvas) {
      const ctx = oilCanvas.getContext('2d');
      ctx.clearRect(0, 0, 128, 128);
      // Irregular scorched tar puddle
      const baseG = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
      baseG.addColorStop(0.0, 'rgba(14, 9, 7, 0.92)');
      baseG.addColorStop(0.62, 'rgba(26, 14, 9, 0.86)');
      baseG.addColorStop(0.84, 'rgba(180, 68, 8, 0.65)');
      baseG.addColorStop(0.94, 'rgba(255, 136, 18, 0.35)');
      baseG.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = baseG;
      ctx.beginPath();
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * TAU;
        const wobble = 1 + 0.08 * Math.sin(a * 5) + 0.05 * Math.cos(a * 9);
        const rad = 57 * wobble;
        const px = 64 + Math.cos(a) * rad;
        const py = 64 + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // Glowing magma/ember cracks across the burning oil surface
      ctx.strokeStyle = 'rgba(255, 148, 24, 0.58)';
      ctx.lineWidth = 2.0;
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU + 0.3;
        ctx.beginPath();
        ctx.moveTo(64 + Math.cos(a) * 10, 64 + Math.sin(a) * 10);
        ctx.quadraticCurveTo(
          64 + Math.cos(a + 0.35) * 28,
          64 + Math.sin(a + 0.35) * 28,
          64 + Math.cos(a - 0.12) * 48,
          64 + Math.sin(a - 0.12) * 48
        );
        ctx.stroke();
      }
      textures.oil = new THREE.CanvasTexture(oilCanvas);
      if (THREE.SRGBColorSpace) textures.oil.colorSpace = THREE.SRGBColorSpace;
    }

    // 4. Ornate Elven Star-Rune Decal for Light of Eärendil
    const runeCanvas = makeCanvas(256);
    if (runeCanvas) {
      const ctx = runeCanvas.getContext('2d');
      ctx.clearRect(0, 0, 256, 256);
      ctx.translate(128, 128);

      const wash = ctx.createRadialGradient(0, 0, 8, 0, 0, 122);
      wash.addColorStop(0.0, 'rgba(224, 250, 255, 0.55)');
      wash.addColorStop(0.55, 'rgba(130, 220, 255, 0.22)');
      wash.addColorStop(0.88, 'rgba(160, 238, 255, 0.32)');
      wash.addColorStop(1.0, 'rgba(127, 212, 255, 0)');
      ctx.fillStyle = wash;
      ctx.beginPath();
      ctx.arc(0, 0, 122, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = 'rgba(230, 252, 255, 0.96)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, 0, 114, 0, TAU);
      ctx.stroke();

      ctx.lineWidth = 2.2;
      ctx.strokeStyle = 'rgba(179, 238, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(0, 0, 90, 0, TAU);
      ctx.stroke();

      // 8-point Star of Eärendil
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = 'rgba(240, 254, 255, 0.82)';
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a1 = (k * TAU) / 8;
        const a2 = a1 + (TAU * 3) / 8;
        ctx.moveTo(Math.cos(a1) * 88, Math.sin(a1) * 88);
        ctx.lineTo(Math.cos(a2) * 88, Math.sin(a2) * 88);
      }
      ctx.stroke();

      // 12 Elven rune glyphs along outer band
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = '#ffffff';
      for (let k = 0; k < 12; k++) {
        const a = (k * TAU) / 12;
        const c = Math.cos(a);
        const s = Math.sin(a);
        ctx.beginPath();
        ctx.moveTo(c * 94, s * 94);
        ctx.lineTo(c * 110, s * 110);
        ctx.moveTo(c * 102 - s * 7, s * 102 + c * 7);
        ctx.lineTo(c * 102 + s * 7, s * 102 - c * 7);
        ctx.arc(c * 102, s * 102, 3.2, 0, TAU);
        ctx.stroke();
      }
      textures.earendil = new THREE.CanvasTexture(runeCanvas);
      if (THREE.SRGBColorSpace) textures.earendil.colorSpace = THREE.SRGBColorSpace;
    }

    // 5. Shockwave crisp leading-edge ring texture
    const shockCanvas = makeCanvas(128);
    if (shockCanvas) {
      const ctx = shockCanvas.getContext('2d');
      const g = ctx.createRadialGradient(64, 64, 18, 64, 64, 62);
      g.addColorStop(0.0, 'rgba(255,255,255,0)');
      g.addColorStop(0.62, 'rgba(255,255,255,0.08)');
      g.addColorStop(0.86, 'rgba(255,255,255,0.88)');
      g.addColorStop(0.95, 'rgba(255,255,255,1.0)');
      g.addColorStop(1.0, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      textures.shock = new THREE.CanvasTexture(shockCanvas);
    }

    return textures;
  }

  // ============================================================================
  // Dynamic Camera-Billboarded 3D Ribbon Helper (Arrows, Bolts & Jagged Lightning)
  // ============================================================================
  function createRibbonMesh(THREE, pointCount, material) {
    const vertCount = pointCount * 2;
    const segCount = pointCount - 1;
    const positions = new Float32Array(vertCount * 3);
    const colors = new Float32Array(vertCount * 3);
    const indices = new Uint16Array(segCount * 6);

    for (let i = 0; i < segCount; i++) {
      const base = i * 2;
      const idx = i * 6;
      indices[idx] = base;
      indices[idx + 1] = base + 1;
      indices[idx + 2] = base + 2;
      indices[idx + 3] = base + 1;
      indices[idx + 4] = base + 3;
      indices[idx + 5] = base + 2;
    }

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    const colAttr = new THREE.BufferAttribute(colors, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    colAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('color', colAttr);
    geo.setIndex(new THREE.BufferAttribute(indices, 1));

    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 14;
    return {
      mesh,
      geo,
      positions,
      colors,
      posAttr,
      colAttr,
      pointCount
    };
  }

  function updateRibbonStrip(ribbon, spineX, spineY, spineZ, count, camX, camY, camZ, halfWidthStart, halfWidthEnd, r, g, b, fadeTail) {
    const n = Math.min(count, ribbon.pointCount);
    const pos = ribbon.positions;
    const col = ribbon.colors;

    for (let i = 0; i < ribbon.pointCount; i++) {
      const idx = i < n ? i : n - 1;
      const px = spineX[idx];
      const py = spineY[idx];
      const pz = spineZ[idx];

      // Tangent vector along spine
      let tx, ty, tz;
      if (idx === 0 && n > 1) {
        tx = spineX[1] - px;
        ty = spineY[1] - py;
        tz = spineZ[1] - pz;
      } else if (idx < n - 1) {
        tx = spineX[idx + 1] - spineX[idx - 1];
        ty = spineY[idx + 1] - spineY[idx - 1];
        tz = spineZ[idx + 1] - spineZ[idx - 1];
      } else if (n > 1) {
        tx = px - spineX[n - 2];
        ty = py - spineY[n - 2];
        tz = pz - spineZ[n - 2];
      } else {
        tx = 1;
        ty = 0;
        tz = 0;
      }

      // View vector to camera
      const vx = camX - px;
      const vy = camY - py;
      const vz = camZ - pz;

      // Cross product S = T x V for screen-facing ribbon width
      let sx = ty * vz - tz * vy;
      let sy = tz * vx - tx * vz;
      let sz = tx * vy - ty * vx;
      const sLen = Math.hypot(sx, sy, sz);
      if (sLen > 1e-5) {
        const inv = 1 / sLen;
        sx *= inv;
        sy *= inv;
        sz *= inv;
      } else {
        sx = 0;
        sy = 1;
        sz = 0;
      }

      const frac = n > 1 ? idx / (n - 1) : 0;
      const hw = i >= n ? 0 : (halfWidthStart + (halfWidthEnd - halfWidthStart) * frac);
      const lum = i >= n ? 0 : (fadeTail ? (1 - frac) * (1 - frac * 0.55) : 1.0);

      const v0 = i * 6;
      pos[v0] = px - sx * hw;
      pos[v0 + 1] = py - sy * hw;
      pos[v0 + 2] = pz - sz * hw;
      pos[v0 + 3] = px + sx * hw;
      pos[v0 + 4] = py + sy * hw;
      pos[v0 + 5] = pz + sz * hw;

      const cr = r * lum;
      const cg = g * lum;
      const cb = b * lum;
      col[v0] = cr;
      col[v0 + 1] = cg;
      col[v0 + 2] = cb;
      col[v0 + 3] = cr;
      col[v0 + 4] = cg;
      col[v0 + 5] = cb;
    }

    ribbon.posAttr.needsUpdate = true;
    ribbon.colAttr.needsUpdate = true;
  }

  // ============================================================================
  // Sculpted 3D Great Eagle Builder (Regal Multi-Part Articulated Lord of Eagles)
  // ============================================================================
  function buildGreatEagleRig(THREE, shared) {
    const root = new THREE.Group();

    // 1. Sculpted aerodynamic dark-mahogany feathered torso & keeled sternum breast
    const bodyMesh = new THREE.Mesh(shared.eagleBodyGeo, shared.eagleBrownMat);
    bodyMesh.scale.set(0.58, 0.52, 1.62);
    bodyMesh.castShadow = true;
    root.add(bodyMesh);

    // Sunlit golden-amber breast, shoulder scapulars & nape mantle
    const mantleMesh = new THREE.Mesh(shared.eagleBodyGeo, shared.eagleGoldFeatherMat);
    mantleMesh.position.set(0, 0.13, 0.46);
    mantleMesh.scale.set(0.49, 0.40, 0.96);
    mantleMesh.castShadow = true;
    root.add(mantleMesh);

    // 2. Proud arched feathered neck, crested raptor skull, fierce amber eyes & hooked golden beak
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.16, 1.18);
    root.add(headGroup);

    const neckMesh = new THREE.Mesh(shared.eagleNeckGeo, shared.eagleGoldFeatherMat);
    neckMesh.position.set(0, 0.06, 0.16);
    neckMesh.rotation.x = 1.18;
    neckMesh.castShadow = true;
    headGroup.add(neckMesh);

    const headMesh = new THREE.Mesh(shared.eagleHeadGeo, shared.eagleGoldFeatherMat);
    headMesh.position.set(0, 0.16, 0.42);
    headMesh.scale.set(0.30, 0.28, 0.40);
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    // Swept-back golden crown hackle feathers on nape
    for (let c = -1; c <= 1; c++) {
      const crest = new THREE.Mesh(shared.eagleBladeFeatherGeo, shared.eagleGoldFeatherMat);
      crest.scale.set(0.28, 0.85, 0.52);
      crest.position.set(c * 0.08, 0.28 - Math.abs(c) * 0.03, 0.26);
      crest.rotation.set(-0.22, HALF_PI + c * 0.18, 0);
      headGroup.add(crest);
    }

    // Fierce raptor brow ridges & gleaming amber eyes
    for (let s = -1; s <= 1; s += 2) {
      const eye = new THREE.Mesh(shared.eagleEyeGeo, shared.eagleEyeMat);
      eye.position.set(s * 0.19, 0.19, 0.54);
      headGroup.add(eye);
    }

    // Sculpted hooked golden upper raptor beak + lower mandible
    const beakUpper = new THREE.Mesh(shared.eagleBeakUpperGeo, shared.eagleBeakMat);
    beakUpper.position.set(0, 0.14, 0.72);
    headGroup.add(beakUpper);

    const beakLower = new THREE.Mesh(shared.eagleBeakLowerGeo, shared.eagleBeakMat);
    beakLower.position.set(0, 0.07, 0.68);
    beakLower.rotation.x = 0.12;
    headGroup.add(beakLower);

    // 3. Tucked feathered thighs & curved golden raptor talons under belly
    for (let s = -1; s <= 1; s += 2) {
      const thigh = new THREE.Mesh(shared.eagleHeadGeo, shared.eagleBrownMat);
      thigh.scale.set(0.16, 0.15, 0.34);
      thigh.position.set(s * 0.22, -0.32, -0.38);
      root.add(thigh);

      const talon = new THREE.Mesh(shared.eagleTalonGeo, shared.eagleBeakMat);
      talon.position.set(s * 0.22, -0.40, -0.58);
      talon.rotation.x = -0.35;
      root.add(talon);
    }

    // 4. Regal Fanned Tail of 9 Individual Rectrix Feathers + Golden Upper Tail Coverts
    const tailGroup = new THREE.Group();
    tailGroup.position.set(0, 0.04, -1.28);
    root.add(tailGroup);

    for (let t = 0; t < 9; t++) {
      const frac = (t - 4) / 4; // -1..+1
      const fanAng = frac * 0.46;
      const theta = HALF_PI - fanAng;
      const rectrix = new THREE.Mesh(
        shared.eagleBladeFeatherGeo,
        Math.abs(t - 4) <= 1 ? shared.eagleBrownMat : shared.eagleDarkPrimaryMat
      );
      const len = 1.32 - Math.abs(frac) * 0.22;
      rectrix.scale.set(len, 1.1, 0.96);
      rectrix.rotation.y = theta;
      rectrix.rotation.z = -frac * 0.05;
      rectrix.position.set(
        Math.cos(theta) * (len * 0.44),
        Math.abs(frac) * -0.015,
        -Math.sin(theta) * (len * 0.44)
      );
      rectrix.castShadow = true;
      tailGroup.add(rectrix);
    }
    for (let t = 0; t < 5; t++) {
      const frac = (t - 2) / 2;
      const theta = HALF_PI - frac * 0.34;
      const cov = new THREE.Mesh(shared.eagleBladeFeatherGeo, shared.eagleGoldFeatherMat);
      cov.scale.set(0.66, 1.15, 0.88);
      cov.rotation.y = theta;
      cov.position.set(Math.cos(theta) * 0.28, 0.038, -Math.sin(theta) * 0.28);
      tailGroup.add(cov);
    }

    // 5. Left & Right 3-Stage Articulated Layered Feathered Wings (Wingspan ~7.6 world units!)
    function makeWing(side) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.36, 0.14, 0.22);

      // Cambered inner wing spar & dorsal surface
      const innerMain = new THREE.Mesh(shared.eagleInnerWingGeo, shared.eagleBrownMat);
      innerMain.position.set(side * 0.86, 0.02, -0.02);
      innerMain.rotation.y = side * 0.06;
      innerMain.castShadow = true;
      shoulder.add(innerMain);

      // Layered golden leading-edge & median wing coverts
      const innerGold = new THREE.Mesh(shared.eagleInnerCovertGeo, shared.eagleGoldFeatherMat);
      innerGold.position.set(side * 0.84, 0.065, 0.20);
      innerGold.rotation.y = side * 0.06;
      shoulder.add(innerGold);

      // 7 Overlapping sculpted Secondary Flight Feathers trailing along inner wing!
      for (let sIdx = 0; sIdx < 7; sIdx++) {
        const u = sIdx / 6;
        const theta = HALF_PI - side * (0.10 + u * 0.18);
        const sec = new THREE.Mesh(
          shared.eagleBladeFeatherGeo,
          sIdx % 3 === 0 ? shared.eagleBrownMat : shared.eagleDarkPrimaryMat
        );
        const fLen = 1.02 + Math.sin(u * Math.PI) * 0.16;
        sec.scale.set(fLen, 1.0, 1.12);
        sec.rotation.y = theta;
        sec.position.set(
          side * (0.22 + u * 1.34) + Math.cos(theta) * (fLen * 0.38),
          -0.01 + sIdx * 0.003,
          -0.16 - Math.sin(theta) * (fLen * 0.38)
        );
        sec.castShadow = true;
        shoulder.add(sec);

        if (sIdx < 6) {
          const cov = new THREE.Mesh(shared.eagleBladeFeatherGeo, shared.eagleGoldFeatherMat);
          cov.scale.set(0.56, 1.05, 0.96);
          cov.rotation.y = theta;
          cov.position.set(
            side * (0.28 + u * 1.22) + Math.cos(theta) * 0.20,
            0.046,
            -0.06 - Math.sin(theta) * 0.20
          );
          shoulder.add(cov);
        }
      }

      // Outer carpal/elbow joint
      const elbow = new THREE.Group();
      elbow.position.set(side * 1.68, 0.02, -0.02);
      shoulder.add(elbow);

      const outerMain = new THREE.Mesh(shared.eagleOuterWingGeo, shared.eagleBrownMat);
      outerMain.position.set(side * 0.70, 0.01, -0.10);
      outerMain.rotation.y = side * 0.18;
      outerMain.castShadow = true;
      elbow.add(outerMain);

      const outerGold = new THREE.Mesh(shared.eagleOuterCovertGeo, shared.eagleGoldFeatherMat);
      outerGold.position.set(side * 0.64, 0.048, 0.08);
      outerGold.rotation.y = side * 0.18;
      elbow.add(outerGold);

      // Wrist joint with 8 long, splayed, cambered Primary Flight Feathers!
      const wrist = new THREE.Group();
      wrist.position.set(side * 1.18, 0.0, -0.12);
      elbow.add(wrist);

      for (let pIdx = 0; pIdx < 8; pIdx++) {
        const u = pIdx / 7; // 0 = leading outer primary finger, 1 = inner primary
        const sweep = 0.12 + u * 1.08;
        const theta = side === 1 ? sweep : (Math.PI - sweep);
        const prim = new THREE.Mesh(
          shared.eagleBladeFeatherGeo,
          pIdx === 0 ? shared.eagleGoldFeatherMat : shared.eagleDarkPrimaryMat
        );
        const pLen = 1.34 - Math.pow(u - 0.22, 2) * 0.42;
        prim.scale.set(pLen, 1.0, 0.92 - (1 - u) * 0.18);
        prim.rotation.y = theta;
        prim.rotation.z = side * (1 - u) * 0.07;
        const rootX = side * (0.14 - u * 0.42);
        const rootZ = 0.02 - u * 0.18;
        prim.position.set(
          rootX + Math.cos(theta) * (pLen * 0.44),
          (1 - u) * 0.02,
          rootZ - Math.sin(theta) * (pLen * 0.44)
        );
        prim.castShadow = true;
        wrist.add(prim);
      }

      return { shoulder, elbow, wrist };
    }

    const leftWing = makeWing(-1);
    const rightWing = makeWing(1);
    root.add(leftWing.shoulder);
    root.add(rightWing.shoulder);

    // Projected ground drop-shadow silhouette mesh
    const shadowGroup = new THREE.Group();
    const shadowBody = new THREE.Mesh(shared.shadowDiscGeo, shared.eagleShadowMat);
    shadowBody.scale.set(0.82, 1, 2.35);
    shadowGroup.add(shadowBody);
    const shadowWings = new THREE.Mesh(shared.shadowDiscGeo, shared.eagleShadowMat);
    shadowWings.scale.set(3.55, 1, 1.02);
    shadowWings.position.set(0, 0, 0.16);
    shadowGroup.add(shadowWings);

    return {
      root,
      headGroup,
      tailGroup,
      leftWing,
      rightWing,
      shadowGroup
    };
  }

  // ============================================================================
  // TD.VFX3D — Full 3D WebGL Combat Effects + Crisp 2D Screen-Projected Overlay
  // ============================================================================
  class VFX3D {
    constructor(scene3d) {
      this.time = 0;
      this.disposed = false;
      this._lastGame = null;
      this._lastSyncTime = -1;
      this._currentWeather = '';

      this.scene3d = null;
      this.threeScene = null;
      this.THREE = getTHREE();

      this._ownedGeometries = [];
      this._ownedMaterials = [];
      this._ownedTextures = [];

      // Pooled CPU-side simulation lists
      this.particles = [];
      this.floatingTexts = [];
      this.shockwaves = [];
      this.explosions = [];
      this.lightnings = [];
      this.beams = [];
      this.earendils = [];
      this.eagles = [];

      // Sync maps for live game.towers.projectiles & game.towers.oilPatches
      this._projVisMap = new Map();
      this._oilVisMap = new Map();
      this._anorBeamMap = new Map();
      this._nextTextSpawnId = 1;
      this._overlayBoxes = [];
      this._textSortBuf = [];

      this._initPoolsBase();

      if (this.THREE) {
        this._initThreeResources();
      }
      if (scene3d) {
        this.attachScene(scene3d);
      }
    }

    attachScene(scene3d) {
      if (!scene3d) return;
      let targetParent = null;
      if (scene3d.isScene) {
        this.threeScene = scene3d;
        targetParent = scene3d;
      } else {
        this.scene3d = scene3d;
        this.threeScene = scene3d.scene || null;
        targetParent = scene3d.vfxGroup || scene3d.scene || null;
      }
      if (targetParent && this.rootGroup && this.rootGroup.parent !== targetParent) {
        targetParent.add(this.rootGroup);
      }
    }

    setScene(scene3d) {
      this.attachScene(scene3d);
    }

    _trackGeo(g) {
      if (g) this._ownedGeometries.push(g);
      return g;
    }

    _trackMat(m) {
      if (m) this._ownedMaterials.push(m);
      return m;
    }

    _toWorldX(gx) {
      return (gx - HALF_W) * WORLD_SCALE;
    }

    _toWorldZ(gy) {
      return (gy - HALF_H) * WORLD_SCALE;
    }

    _terrainY(gx, gy) {
      const s3d = this.scene3d || (this._lastGame && this._lastGame.scene3d);
      if (s3d && typeof s3d.getTerrainHeight === 'function') {
        const h = s3d.getTerrainHeight(gx, gy);
        if (typeof h === 'number' && !Number.isNaN(h)) return h;
      }
      return 0;
    }

    _enemyHitHeight(e) {
      if (!e) return 1.45;
      if (e.flying || e.type === 'fellbeast') return 6.5;
      if (typeof e._height3D === 'number' && e._height3D > 0.5) {
        let jump = 0;
        if (e.type === 'warg' && e.leapTimer > 0 && e.leapDuration > 0) {
          jump = Math.sin((1 - e.leapTimer / e.leapDuration) * Math.PI) * 2.8;
        }
        return e._height3D * 0.58 + jump;
      }
      if (e.type === 'balrog') return e.phase === 2 ? 4.4 : 3.3;
      if (e.type === 'troll') return 2.95;
      if (e.type === 'ringwraith') return 2.45;
      if (e.type === 'warg') {
        let jump = 0;
        if (e.leapTimer > 0 && e.leapDuration > 0) {
          jump = Math.sin((1 - e.leapTimer / e.leapDuration) * Math.PI) * 2.8;
        }
        return 1.55 + jump;
      }
      return 1.5;
    }

    _enemyBarHeight(e) {
      if (!e) return 2.9;
      if (e.flying || e.type === 'fellbeast') return 8.35;
      if (typeof e._height3D === 'number' && e._height3D > 0.5) {
        let jump = 0;
        if (e.type === 'warg' && e.leapTimer > 0 && e.leapDuration > 0) {
          jump = Math.sin((1 - e.leapTimer / e.leapDuration) * Math.PI) * 2.8;
        }
        return e._height3D + 0.55 + jump;
      }
      if (e.type === 'balrog') return e.phase === 2 ? 7.9 : 5.4;
      if (e.type === 'troll') return 5.75;
      if (e.type === 'ringwraith') return 4.6;
      if (e.type === 'uruk') return 3.35;
      if (e.type === 'warg') {
        let jump = 0;
        if (e.leapTimer > 0 && e.leapDuration > 0) {
          jump = Math.sin((1 - e.leapTimer / e.leapDuration) * Math.PI) * 2.8;
        }
        return 3.15 + jump;
      }
      if (e.type === 'goblin') return 2.35;
      return 2.95;
    }

    _towerMuzzleHeight(tower) {
      if (!tower) return 3.2;
      if (typeof tower.muzzleHeight3D === 'number' && tower.muzzleHeight3D > 0.5) {
        return tower.muzzleHeight3D;
      }
      if (tower.type === 'istari') return 5.5;
      if (tower.type === 'elven') return 4.0;
      if (tower.type === 'dwarven') {
        if (tower.tier === 3 && tower.branch === 'B') return 1.95;
        if (tower.tier === 3 && tower.branch === 'A') return 2.55;
        return 2.95;
      }
      return 2.5;
    }

    _initPoolsBase() {
      // 1. 3D Particle Pool
      this.particlePool = createPool(
        () => ({
          wx: 0, wy: 0, wz: 0,
          vx: 0, vy: 0, vz: 0,
          gravity: 0, drag: 0, floorY: 0, bounce: 0,
          age: 0, life: 0.4,
          size: 0.3, endSize: 0.05,
          r: 1, g: 1, b: 1,
          kind: 'spark',
          rot: 0, vrot: 0
        }),
        (p) => {
          p.wx = 0; p.wy = 0; p.wz = 0;
          p.vx = 0; p.vy = 0; p.vz = 0;
          p.gravity = 0; p.drag = 0; p.floorY = 0; p.bounce = 0;
          p.age = 0; p.life = 0.4;
          p.size = 0.3; p.endSize = 0.05;
          p.r = 1; p.g = 1; p.b = 1;
          p.kind = 'spark';
          p.rot = 0; p.vrot = 0;
        },
        380
      );

      // 2. Crisp Screen-Projected Floating Combat Text Pool (with tick coalescing & anti-overlap metadata)
      this.textPool = createPool(
        () => ({
          gx: 0, gy: 0, wy: 2.0,
          vx: 0, vyWorld: 2.8,
          age: 0, life: 0.9,
          text: '', color: '#ffffff', scale: 1,
          kind: 'damage',
          numVal: 0,
          hitCount: 1,
          targetRef: null,
          spawnId: 0,
          staggerX: 0,
          isBuff: false
        }),
        (t) => {
          t.gx = 0; t.gy = 0; t.wy = 2.0;
          t.vx = 0; t.vyWorld = 2.8;
          t.age = 0; t.life = 0.9;
          t.text = ''; t.color = '#ffffff'; t.scale = 1;
          t.kind = 'damage';
          t.numVal = 0;
          t.hitCount = 1;
          t.targetRef = null;
          t.spawnId = 0;
          t.staggerX = 0;
          t.isBuff = false;
        },
        72
      );
    }

    _initThreeResources() {
      const THREE = this.THREE;
      this.rootGroup = new THREE.Group();
      this.rootGroup.name = 'TD_VFX3D_Root';

      this._tmpMat4 = new THREE.Matrix4();
      this._tmpPos = new THREE.Vector3();
      this._tmpPos2 = new THREE.Vector3();
      this._tmpQuat = new THREE.Quaternion();
      this._tmpScale = new THREE.Vector3();
      this._tmpUp = new THREE.Vector3(0, 1, 0);
      this._tmpDir = new THREE.Vector3(0, 0, 1);
      this._tmpEuler = new THREE.Euler();
      this._tmpColor = new THREE.Color();

      const tex = buildProceduralTextures(THREE);
      this.textures = tex;
      for (const k of Object.keys(tex)) {
        if (tex[k]) this._ownedTextures.push(tex[k]);
      }

      // ----------------------------------------------------------------------
      // Fixed Dynamic PointLight Pool (4 constant lights -> ZERO shader recompile!)
      // ----------------------------------------------------------------------
      this._lightSlots = [];
      for (let i = 0; i < DYNAMIC_LIGHT_SLOTS; i++) {
        const light = new THREE.PointLight(0xffffff, 0, 16, 1.8);
        light.position.set(0, -50, 0);
        light.castShadow = false;
        this.rootGroup.add(light);
        this._lightSlots.push({
          light,
          age: 1,
          life: 1,
          peakIntensity: 0
        });
      }

      // ----------------------------------------------------------------------
      // 4 Zero-GC InstancedMesh Batches for 3D Particles
      // ----------------------------------------------------------------------
      const sparkGeo = this._trackGeo(new THREE.OctahedronGeometry(0.5, 0));
      sparkGeo.scale(0.38, 1.35, 0.38);
      const sparkMat = this._trackMat(new THREE.MeshBasicMaterial({
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        toneMapped: false
      }));
      this.sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, MAX_SPARK_INST);
      this.sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.sparkMesh.setColorAt(0, this._tmpColor.setRGB(1, 1, 1));
      this.sparkMesh.frustumCulled = false;
      this.sparkMesh.count = 0;
      this.sparkMesh.visible = false;
      this.sparkMesh.renderOrder = 15;
      this.rootGroup.add(this.sparkMesh);

      const magicGeo = this._trackGeo(new THREE.OctahedronGeometry(0.55, 0));
      const magicMat = this._trackMat(new THREE.MeshBasicMaterial({
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        toneMapped: false
      }));
      this.magicMesh = new THREE.InstancedMesh(magicGeo, magicMat, MAX_MAGIC_INST);
      this.magicMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.magicMesh.setColorAt(0, this._tmpColor.setRGB(1, 1, 1));
      this.magicMesh.frustumCulled = false;
      this.magicMesh.count = 0;
      this.magicMesh.visible = false;
      this.magicMesh.renderOrder = 15;
      this.rootGroup.add(this.magicMesh);

      const smokeGeo = this._trackGeo(new THREE.PlaneGeometry(1, 1));
      const smokeMat = this._trackMat(new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: tex.smoke || null,
        transparent: true,
        opacity: 0.56,
        depthWrite: false,
        side: THREE.DoubleSide
      }));
      this.smokeMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, MAX_SMOKE_INST);
      this.smokeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.smokeMesh.setColorAt(0, this._tmpColor.setRGB(0.3, 0.32, 0.35));
      this.smokeMesh.frustumCulled = false;
      this.smokeMesh.count = 0;
      this.smokeMesh.visible = false;
      this.smokeMesh.renderOrder = 12;
      this.rootGroup.add(this.smokeMesh);

      const debrisGeo = this._trackGeo(new THREE.DodecahedronGeometry(0.5, 0));
      const debrisMat = this._trackMat(new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.78,
        metalness: 0.12
      }));
      this.debrisMesh = new THREE.InstancedMesh(debrisGeo, debrisMat, MAX_DEBRIS_INST);
      this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.debrisMesh.setColorAt(0, this._tmpColor.setRGB(0.5, 0.5, 0.5));
      this.debrisMesh.frustumCulled = false;
      this.debrisMesh.count = 0;
      this.debrisMesh.visible = false;
      this.rootGroup.add(this.debrisMesh);

      // ----------------------------------------------------------------------
      // Shared Geometries & Materials for Projectiles, Spells, Beams & Oil
      // ----------------------------------------------------------------------
      const ribbonAddMat = this._trackMat(new THREE.MeshBasicMaterial({
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
      }));

      // Arrow geometries (aligned along +Z)
      const arrowShaftGeo = this._trackGeo(new THREE.CylinderGeometry(0.055, 0.025, 1.55, 6));
      arrowShaftGeo.rotateX(HALF_PI);
      const arrowGlowGeo = this._trackGeo(new THREE.CylinderGeometry(0.14, 0.04, 1.75, 6));
      arrowGlowGeo.rotateX(HALF_PI);
      const arrowTipGeo = this._trackGeo(new THREE.ConeGeometry(0.14, 0.52, 6));
      arrowTipGeo.rotateX(HALF_PI);
      arrowTipGeo.translate(0, 0, 0.95);

      const arrowCoreMat = this._trackMat(new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.5, 2.15, 2.5),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        toneMapped: false
      }));
      const arrowHaloMat = this._trackMat(new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.25, 1.25, 1.95),
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        toneMapped: false
      }));

      // Dwarven Meteor / Boulder geometries & molten materials
      const boulderRockGeo = this._trackGeo(new THREE.DodecahedronGeometry(0.54, 1));
      const posB = boulderRockGeo.attributes.position;
      for (let i = 0; i < posB.count; i++) {
        const vx = posB.getX(i);
        const vy = posB.getY(i);
        const vz = posB.getZ(i);
        const crag = 0.84 + 0.28 * Math.abs(Math.sin(vx * 7.3 + vy * 5.1 + vz * 6.7));
        posB.setXYZ(i, vx * crag, vy * crag, vz * crag);
      }
      boulderRockGeo.computeVertexNormals();

      const boulderCoreGeo = this._trackGeo(new THREE.IcosahedronGeometry(0.49, 1));
      const boulderFlameConeGeo = this._trackGeo(new THREE.ConeGeometry(0.62, 1.95, 8, 1, true));
      boulderFlameConeGeo.rotateX(-HALF_PI); // points tail along -Z!
      boulderFlameConeGeo.translate(0, 0, -0.75);

      const boulderRockMat = this._trackMat(new THREE.MeshStandardMaterial({
        color: 0x2c221e,
        roughness: 0.86,
        metalness: 0.15,
        emissive: 0xff5500,
        emissiveIntensity: 0.72
      }));
      const boulderMagmaMat = this._trackMat(new THREE.MeshBasicMaterial({
        color: new THREE.Color(2.2, 1.05, 0.2),
        toneMapped: false
      }));
      const boulderFireAuraMat = this._trackMat(new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.9, 0.72, 0.12),
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false
      }));

      // Khazad Ballista & Mithril Bolt geometries (+Z forward)
      const ballistaShaftGeo = this._trackGeo(new THREE.CylinderGeometry(0.08, 0.065, 2.05, 6));
      ballistaShaftGeo.rotateX(HALF_PI);
      const ballistaHeadGeo = this._trackGeo(new THREE.ConeGeometry(0.20, 0.68, 6));
      ballistaHeadGeo.rotateX(HALF_PI);
      ballistaHeadGeo.translate(0, 0, 1.22);
      const shockConeGeo = this._trackGeo(new THREE.ConeGeometry(0.48, 1.35, 10, 1, true));
      shockConeGeo.rotateX(HALF_PI);
      shockConeGeo.translate(0, 0, 0.62);

      const forgedIronMat = this._trackMat(new THREE.MeshStandardMaterial({
        color: 0xcfd8dc,
        metalness: 0.82,
        roughness: 0.25,
        emissive: 0xffab40,
        emissiveIntensity: 0.45
      }));
      const shockConeGoldMat = this._trackMat(new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.65, 1.25, 0.42),
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.52,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false
      }));
      const shockConeMithrilMat = this._trackMat(new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.55, 1.85, 2.2),
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.62,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false
      }));

      // Istari Arcane Bolt geometries & materials
      const arcaneCrystalGeo = this._trackGeo(new THREE.OctahedronGeometry(0.36, 0));
      const arcaneRingGeo = this._trackGeo(new THREE.TorusGeometry(0.52, 0.055, 6, 16));
      const arcaneCoreMat = this._trackMat(new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.2, 1.85, 2.5),
        toneMapped: false
      }));
      const arcaneVioletMat = this._trackMat(new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.72, 0.95, 2.25),
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        toneMapped: false
      }));

      // Shared Sprite Glow Material for flares
      const flareSpriteGeo = this._trackGeo(new THREE.PlaneGeometry(1, 1));

      // ----------------------------------------------------------------------
      // Pooled 3D Projectile Visual Rigs
      // ----------------------------------------------------------------------
      this.projectileVisPool = createPool(
        () => {
          const root = new THREE.Group();
          root.visible = false;
          this.rootGroup.add(root);

          // Mode 1: Elven Arrow
          const arrowGrp = new THREE.Group();
          const aShaft = new THREE.Mesh(arrowShaftGeo, arrowCoreMat);
          const aHalo = new THREE.Mesh(arrowGlowGeo, arrowHaloMat);
          const aTip = new THREE.Mesh(arrowTipGeo, arrowCoreMat);
          arrowGrp.add(aShaft, aHalo, aTip);
          root.add(arrowGrp);

          // Mode 2: Blazing Dwarven Boulder / Mortar Meteor
          const boulderGrp = new THREE.Group();
          const bRock = new THREE.Mesh(boulderRockGeo, boulderRockMat);
          bRock.castShadow = true;
          const bCore = new THREE.Mesh(boulderCoreGeo, boulderMagmaMat);
          const bFlame = new THREE.Mesh(boulderFlameConeGeo, boulderFireAuraMat);
          boulderGrp.add(bRock, bCore, bFlame);
          root.add(boulderGrp);

          // Mode 3: Khazad Ballista / Mithril Bolt
          const boltGrp = new THREE.Group();
          const kShaft = new THREE.Mesh(ballistaShaftGeo, forgedIronMat);
          const kHead = new THREE.Mesh(ballistaHeadGeo, arrowCoreMat);
          const kCone = new THREE.Mesh(shockConeGeo, shockConeGoldMat);
          boltGrp.add(kShaft, kHead, kCone);
          root.add(boltGrp);

          // Mode 4: Istari Arcane Bolt
          const arcaneGrp = new THREE.Group();
          const iCore = new THREE.Mesh(arcaneCrystalGeo, arcaneCoreMat);
          const iRing1 = new THREE.Mesh(arcaneRingGeo, arcaneVioletMat);
          const iRing2 = new THREE.Mesh(arcaneRingGeo, arcaneVioletMat);
          iRing2.rotation.x = HALF_PI;
          arcaneGrp.add(iCore, iRing1, iRing2);
          root.add(arcaneGrp);

          // World-space Ribbon Trail (for Elven Arrows, Ballista Bolts & Arcane Streaks)
          const ribbon = createRibbonMesh(THREE, RIBBON_SEGS + 1, ribbonAddMat);
          this._trackGeo(ribbon.geo);
          ribbon.mesh.visible = false;
          this.rootGroup.add(ribbon.mesh);

          return {
            root,
            arrowGrp,
            boulderGrp,
            bRock,
            bFlame,
            boltGrp,
            kCone,
            arcaneGrp,
            iCore,
            iRing1,
            iRing2,
            ribbon,
            shockConeGoldMat,
            shockConeMithrilMat,
            hx: new Float32Array(RIBBON_SEGS + 1),
            hy: new Float32Array(RIBBON_SEGS + 1),
            hz: new Float32Array(RIBBON_SEGS + 1),
            initialized: false,
            prevWx: 0,
            prevWy: 0,
            prevWz: 0,
            smokeAcc: 0
          };
        },
        (v) => {
          v.root.visible = false;
          v.ribbon.mesh.visible = false;
          v.initialized = false;
          v.smokeAcc = 0;
        },
        40
      );

      // ----------------------------------------------------------------------
      // Pooled 3D Shockwave Rings
      // ----------------------------------------------------------------------
      const shockTorusGeo = this._trackGeo(new THREE.TorusGeometry(1, 0.045, 8, 36));
      shockTorusGeo.rotateX(HALF_PI);
      const shockDiscGeo = this._trackGeo(new THREE.PlaneGeometry(2, 2));
      shockDiscGeo.rotateX(-HALF_PI);

      this.shockwavePool = createPool(
        () => {
          const group = new THREE.Group();
          group.visible = false;
          const ringMat = this._trackMat(new THREE.MeshBasicMaterial({
            color: 0xff9e40,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            toneMapped: false
          }));
          const discMat = this._trackMat(new THREE.MeshBasicMaterial({
            color: 0xff9e40,
            map: tex.shock || null,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false
          }));
          const torus = new THREE.Mesh(shockTorusGeo, ringMat);
          const disc = new THREE.Mesh(shockDiscGeo, discMat);
          group.add(torus, disc);
          group.renderOrder = 8;
          this.rootGroup.add(group);
          return {
            group,
            ringMat,
            discMat,
            wx: 0, wy: 0, wz: 0,
            maxRadiusWorld: 8,
            age: 0,
            life: 0.45
          };
        },
        (s) => {
          s.group.visible = false;
          s.age = 0;
          s.life = 0.45;
        },
        24
      );

      // ----------------------------------------------------------------------
      // Pooled 3D Fireball Flash Explosions
      // ----------------------------------------------------------------------
      const expSphereGeo = this._trackGeo(new THREE.IcosahedronGeometry(1, 2));
      this.explosionPool = createPool(
        () => {
          const group = new THREE.Group();
          group.visible = false;
          const coreMat = this._trackMat(new THREE.MeshBasicMaterial({
            color: new THREE.Color(1.35, 0.92, 0.42),
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.58,
            depthWrite: false,
            toneMapped: false
          }));
          const shellMat = this._trackMat(new THREE.MeshBasicMaterial({
            color: new THREE.Color(1.15, 0.38, 0.08),
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.44,
            depthWrite: false,
            toneMapped: false
          }));
          const core = new THREE.Mesh(expSphereGeo, coreMat);
          const shell = new THREE.Mesh(expSphereGeo, shellMat);
          group.add(core, shell);
          group.renderOrder = 14;
          this.rootGroup.add(group);
          return {
            group,
            core,
            shell,
            coreMat,
            shellMat,
            maxR: 2.0,
            age: 0,
            life: 0.32
          };
        },
        (ex) => {
          ex.group.visible = false;
          ex.age = 0;
          ex.life = 0.32;
        },
        16
      );

      // ----------------------------------------------------------------------
      // Pooled 3D Multi-Strand Jagged Branching Lightning Bolts
      // ----------------------------------------------------------------------
      this.lightningPool = createPool(
        () => {
          const group = new THREE.Group();
          group.visible = false;
          const outerRibbon = createRibbonMesh(THREE, 11, ribbonAddMat);
          const coreRibbon = createRibbonMesh(THREE, 11, ribbonAddMat);
          const strand2Ribbon = createRibbonMesh(THREE, 9, ribbonAddMat);
          const fork1Ribbon = createRibbonMesh(THREE, 4, ribbonAddMat);
          const fork2Ribbon = createRibbonMesh(THREE, 4, ribbonAddMat);
          this._trackGeo(outerRibbon.geo);
          this._trackGeo(coreRibbon.geo);
          this._trackGeo(strand2Ribbon.geo);
          this._trackGeo(fork1Ribbon.geo);
          this._trackGeo(fork2Ribbon.geo);

          const flareMat = this._trackMat(new THREE.MeshBasicMaterial({
            color: new THREE.Color(0.75, 1.08, 1.35),
            map: tex.glow || null,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.48,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false
          }));
          const srcFlare = new THREE.Mesh(flareSpriteGeo, flareMat);
          const hitFlare = new THREE.Mesh(flareSpriteGeo, flareMat);

          group.add(
            outerRibbon.mesh,
            coreRibbon.mesh,
            strand2Ribbon.mesh,
            fork1Ribbon.mesh,
            fork2Ribbon.mesh,
            srcFlare,
            hitFlare
          );
          this.rootGroup.add(group);

          return {
            group,
            outerRibbon,
            coreRibbon,
            strand2Ribbon,
            fork1Ribbon,
            fork2Ribbon,
            srcFlare,
            hitFlare,
            flareMat,
            mainX: new Float32Array(11),
            mainY: new Float32Array(11),
            mainZ: new Float32Array(11),
            altX: new Float32Array(9),
            altY: new Float32Array(9),
            altZ: new Float32Array(9),
            f1X: new Float32Array(4),
            f1Y: new Float32Array(4),
            f1Z: new Float32Array(4),
            f2X: new Float32Array(4),
            f2Y: new Float32Array(4),
            f2Z: new Float32Array(4),
            r: 0.45, g: 0.85, b: 1.0,
            age: 0,
            life: 0.24
          };
        },
        (l) => {
          l.group.visible = false;
          l.age = 0;
          l.life = 0.24;
        },
        24
      );

      // ----------------------------------------------------------------------
      // Pooled 3D Flame of Anor Solar Beams
      // ----------------------------------------------------------------------
      const beamCylGeo = this._trackGeo(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true));
      beamCylGeo.rotateX(HALF_PI); // length 1 along Z (-0.5..+0.5)
      const beamRingGeo = this._trackGeo(new THREE.TorusGeometry(1, 0.12, 6, 18));

      this.beamPool = createPool(
        () => {
          const group = new THREE.Group();
          group.visible = false;

          const sheathMat = this._trackMat(new THREE.MeshBasicMaterial({
            color: new THREE.Color(0.95, 0.38, 0.08),
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.40,
            side: THREE.DoubleSide,
            depthWrite: false,
            toneMapped: false
          }));
          const coreMat = this._trackMat(new THREE.MeshBasicMaterial({
            color: new THREE.Color(1.18, 0.88, 0.42),
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.78,
            side: THREE.DoubleSide,
            depthWrite: false,
            toneMapped: false
          }));
          const ringMat = this._trackMat(new THREE.MeshBasicMaterial({
            color: new THREE.Color(1.12, 0.65, 0.16),
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
            toneMapped: false
          }));

          const sheath = new THREE.Mesh(beamCylGeo, sheathMat);
          const core = new THREE.Mesh(beamCylGeo, coreMat);
          const impactRing1 = new THREE.Mesh(beamRingGeo, ringMat);
          const impactRing2 = new THREE.Mesh(beamRingGeo, ringMat);
          const srcOrb = new THREE.Mesh(expSphereGeo, coreMat);
          const hitOrb = new THREE.Mesh(expSphereGeo, coreMat);

          group.add(sheath, core, impactRing1, impactRing2, srcOrb, hitOrb);
          group.renderOrder = 14;
          this.rootGroup.add(group);

          return {
            group,
            sheath,
            core,
            sheathMat,
            coreMat,
            ringMat,
            impactRing1,
            impactRing2,
            srcOrb,
            hitOrb,
            wx1: 0, wy1: 5.5, wz1: 0,
            wx2: 0, wy2: 1.2, wz2: 0,
            x1: 0, y1: 0, x2: 0, y2: 0,
            intensity: 1,
            color: '#ff9800',
            age: 0,
            life: 0.18
          };
        },
        (b) => {
          b.group.visible = false;
          b.age = 0;
          b.life = 0.18;
        },
        16
      );

      // ----------------------------------------------------------------------
      // Pooled 3D Burning Oil Patches (Scorched Decal + 7 Dancing Flame Cones)
      // ----------------------------------------------------------------------
      const oilPlaneGeo = this._trackGeo(new THREE.PlaneGeometry(1.65, 1.65));
      oilPlaneGeo.rotateX(-HALF_PI);
      const oilFlameGeo = this._trackGeo(new THREE.ConeGeometry(0.18, 0.68, 6));
      oilFlameGeo.translate(0, 0.32, 0);

      const oilDecalBaseMat = this._trackMat(new THREE.MeshBasicMaterial({
        map: tex.oil || null,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      }));
      const oilFlameMat = this._trackMat(new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.18, 0.46, 0.08),
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.60,
        depthWrite: false,
        toneMapped: false
      }));

      this.oilVisPool = createPool(
        () => {
          const group = new THREE.Group();
          group.visible = false;
          const decal = new THREE.Mesh(oilPlaneGeo, oilDecalBaseMat);
          decal.renderOrder = 3;
          group.add(decal);

          const flames = [];
          for (let i = 0; i < 7; i++) {
            const fm = new THREE.Mesh(oilFlameGeo, oilFlameMat);
            fm.renderOrder = 13;
            group.add(fm);
            flames.push(fm);
          }
          this.rootGroup.add(group);
          return {
            group,
            decal,
            flames,
            smokeAcc: 0
          };
        },
        (ov) => {
          ov.group.visible = false;
          ov.smokeAcc = 0;
        },
        16
      );

      // ----------------------------------------------------------------------
      // Pooled 3D Light of Eärendil Celestial Pillars
      // ----------------------------------------------------------------------
      const pillarGeo = this._trackGeo(new THREE.CylinderGeometry(0.72, 1.0, 28, 24, 1, true));
      pillarGeo.translate(0, 14, 0);
      const runePlaneGeo = this._trackGeo(new THREE.PlaneGeometry(2, 2));
      runePlaneGeo.rotateX(-HALF_PI);
      const starTorusGeo = this._trackGeo(new THREE.TorusGeometry(0.76, 0.025, 6, 36));
      starTorusGeo.rotateX(HALF_PI);

      this.earendilPool = createPool(
        () => {
          const group = new THREE.Group();
          group.visible = false;

          const outerMat = this._trackMat(new THREE.MeshBasicMaterial({
            color: new THREE.Color(0.55, 1.35, 1.95),
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.34,
            side: THREE.DoubleSide,
            depthWrite: false,
            toneMapped: false
          }));
          const innerMat = this._trackMat(new THREE.MeshBasicMaterial({
            color: new THREE.Color(1.55, 2.15, 2.45),
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.62,
            side: THREE.DoubleSide,
            depthWrite: false,
            toneMapped: false
          }));
          const runeMat = this._trackMat(new THREE.MeshBasicMaterial({
            map: tex.earendil || null,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false
          }));

          const outerShaft = new THREE.Mesh(pillarGeo, outerMat);
          const innerShaft = new THREE.Mesh(pillarGeo, innerMat);
          const runeDisc = new THREE.Mesh(runePlaneGeo, runeMat);
          const ringMesh = new THREE.Mesh(starTorusGeo, innerMat);
          runeDisc.position.y = 0.14;
          ringMesh.position.y = 0.22;

          group.add(outerShaft, innerShaft, runeDisc, ringMesh);
          group.renderOrder = 11;
          this.rootGroup.add(group);

          return {
            group,
            outerShaft,
            innerShaft,
            runeDisc,
            ringMesh,
            outerMat,
            innerMat,
            runeMat,
            gx: 640, gy: 360,
            wx: 0, wy: 0, wz: 0,
            radiusWorld: 15,
            moteAcc: 0,
            age: 0,
            life: 1.45
          };
        },
        (e) => {
          e.group.visible = false;
          e.age = 0;
          e.life = 1.45;
          e.moteAcc = 0;
        },
        4
      );

      // ----------------------------------------------------------------------
      // Pooled 3D Great Eagles Squadron (3 Giant Sculpted Flapping Eagles!)
      // ----------------------------------------------------------------------
      const eagleShared = {
        eagleBodyGeo: this._trackGeo(
          (() => {
            const g = new THREE.SphereGeometry(1, 14, 10);
            const p = g.attributes.position;
            for (let i = 0; i < p.count; i++) {
              const x = p.getX(i);
              let y = p.getY(i);
              const z = p.getZ(i);
              // Keeled sternum breast in front (+z), sleek tapered tail-cone in rear (-z)
              const taper = z < 0 ? (1 + z * 0.28) : (1 - z * 0.08);
              if (y < 0 && z > -0.2) y *= 1.18;
              p.setXYZ(i, x * taper, y * (z < 0 ? 1 + z * 0.22 : 1), z);
            }
            g.computeVertexNormals();
            return g;
          })()
        ),
        eagleNeckGeo: this._trackGeo(new THREE.CylinderGeometry(0.22, 0.34, 0.56, 10)),
        eagleHeadGeo: this._trackGeo(new THREE.SphereGeometry(1, 12, 9)),
        eagleBeakUpperGeo: this._trackGeo(
          (() => {
            // Sculpted hooked golden raptor upper beak curving downward at razor tip (+Z forward)
            const g = new THREE.ConeGeometry(0.135, 0.62, 8, 5);
            g.rotateX(HALF_PI);
            const p = g.attributes.position;
            for (let i = 0; i < p.count; i++) {
              const x = p.getX(i);
              const y = p.getY(i);
              const z = p.getZ(i);
              const f = clamp((z + 0.31) / 0.62, 0, 1);
              const hookDrop = -0.19 * Math.pow(f, 2.25);
              p.setXYZ(i, x * (0.85 + 0.15 * (1 - f)), y * 1.12 + hookDrop, z);
            }
            g.computeVertexNormals();
            return g;
          })()
        ),
        eagleBeakLowerGeo: this._trackGeo(
          (() => {
            const g = new THREE.ConeGeometry(0.085, 0.36, 7);
            g.rotateX(HALF_PI);
            return g;
          })()
        ),
        eagleEyeGeo: this._trackGeo(new THREE.SphereGeometry(0.055, 8, 6)),
        eagleTalonGeo: this._trackGeo(
          (() => {
            const g = new THREE.ConeGeometry(0.075, 0.34, 6);
            g.rotateX(-HALF_PI);
            return g;
          })()
        ),
        eagleInnerWingGeo: this._trackGeo(
          (() => {
            const g = new THREE.BoxGeometry(1.76, 0.11, 0.72, 6, 2, 4);
            const p = g.attributes.position;
            for (let i = 0; i < p.count; i++) {
              const x = p.getX(i);
              let y = p.getY(i);
              const z = p.getZ(i);
              // Cambered airfoil: thicker rounded leading edge (+z), razor trailing edge (-z)
              const chordT = clamp((0.36 - z) / 0.72, 0, 1);
              y = y * (1.25 - chordT * 0.78) + Math.sin(chordT * Math.PI) * 0.042;
              p.setXYZ(i, x, y, z);
            }
            g.computeVertexNormals();
            return g;
          })()
        ),
        eagleInnerCovertGeo: this._trackGeo(new THREE.BoxGeometry(1.70, 0.075, 0.34)),
        eagleOuterWingGeo: this._trackGeo(
          (() => {
            const g = new THREE.BoxGeometry(1.48, 0.085, 0.56, 5, 2, 3);
            const p = g.attributes.position;
            for (let i = 0; i < p.count; i++) {
              const x = p.getX(i);
              let y = p.getY(i);
              const z = p.getZ(i);
              const chordT = clamp((0.28 - z) / 0.56, 0, 1);
              y = y * (1.20 - chordT * 0.78) + Math.sin(chordT * Math.PI) * 0.03;
              p.setXYZ(i, x, y, z);
            }
            g.computeVertexNormals();
            return g;
          })()
        ),
        eagleOuterCovertGeo: this._trackGeo(new THREE.BoxGeometry(1.36, 0.058, 0.26)),
        eagleBladeFeatherGeo: this._trackGeo(
          (() => {
            // Sculpted lanceolate flight feather blade (-0.5..+0.5 along X, pointed tip at +0.5, cambered vane)
            const g = new THREE.BoxGeometry(1.0, 0.032, 0.24, 6, 1, 2);
            const p = g.attributes.position;
            for (let i = 0; i < p.count; i++) {
              const x = p.getX(i); // -0.5 (quill root) .. +0.5 (feather tip)
              let y = p.getY(i);
              let z = p.getZ(i);
              const u = clamp(x + 0.5, 0, 1);
              const vaneWidth = Math.sin(Math.pow(u, 0.68) * Math.PI) * (1.15 - u * 0.25);
              const camber = Math.sin(u * Math.PI) * 0.018 - Math.pow(u, 2.2) * 0.015;
              z *= Math.max(0.08, vaneWidth);
              y = y * (1.1 - u * 0.55) + camber;
              p.setXYZ(i, x, y, z);
            }
            g.computeVertexNormals();
            return g;
          })()
        ),
        shadowDiscGeo: this._trackGeo(
          (() => {
            const g = new THREE.CircleGeometry(1, 16);
            g.rotateX(-HALF_PI);
            return g;
          })()
        ),
        eagleBrownMat: this._trackMat(new THREE.MeshStandardMaterial({
          color: 0x593822,
          roughness: 0.64,
          metalness: 0.14,
          emissive: 0x211108,
          emissiveIntensity: 0.20
        })),
        eagleDarkPrimaryMat: this._trackMat(new THREE.MeshStandardMaterial({
          color: 0x362013,
          roughness: 0.58,
          metalness: 0.18,
          emissive: 0x140a05,
          emissiveIntensity: 0.15
        })),
        eagleGoldFeatherMat: this._trackMat(new THREE.MeshStandardMaterial({
          color: 0xdda83e,
          roughness: 0.42,
          metalness: 0.34,
          emissive: 0x70480c,
          emissiveIntensity: 0.26
        })),
        eagleBeakMat: this._trackMat(new THREE.MeshStandardMaterial({
          color: 0xffe07d,
          roughness: 0.28,
          metalness: 0.46,
          emissive: 0xa66d00,
          emissiveIntensity: 0.30
        })),
        eagleEyeMat: this._trackMat(new THREE.MeshStandardMaterial({
          color: 0xffec80,
          roughness: 0.2,
          metalness: 0.3,
          emissive: 0xffa000,
          emissiveIntensity: 0.68
        })),
        eagleShadowMat: this._trackMat(new THREE.MeshBasicMaterial({
          color: 0x06080c,
          transparent: true,
          opacity: 0.34,
          depthWrite: false
        }))
      };

      const windStreakGeo = this._trackGeo(new THREE.PlaneGeometry(1, 0.16));
      windStreakGeo.rotateX(-HALF_PI);
      const windStreakMat = this._trackMat(new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.75, 1.42, 0.62),
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.52,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false
      }));

      this.eaglePool = createPool(
        () => {
          const group = new THREE.Group();
          group.visible = false;

          const birds = [];
          for (let i = 0; i < 3; i++) {
            const rig = buildGreatEagleRig(THREE, eagleShared);
            const s = i === 0 ? 1.06 : 0.88;
            rig.root.scale.set(s, s, s);
            rig.shadowGroup.scale.set(s, 1, s);
            rig.shadowGroup.renderOrder = 4;
            group.add(rig.root);
            group.add(rig.shadowGroup);
            birds.push(rig);
          }

          const streaks = [];
          const streakAlong = new Float32Array(12);
          const streakPerp = new Float32Array(12);
          const streakAlt = new Float32Array(12);
          const streakLen = new Float32Array(12);
          for (let k = 0; k < 12; k++) {
            const sm = new THREE.Mesh(windStreakGeo, windStreakMat);
            sm.renderOrder = 14;
            group.add(sm);
            streaks.push(sm);
          }

          this.rootGroup.add(group);
          return {
            group,
            birds,
            streaks,
            streakAlong,
            streakPerp,
            streakAlt,
            streakLen,
            wx: 0, wz: 0,
            dirAngle: 0,
            yaw: 0,
            cos: 1,
            sin: 0,
            age: 0,
            life: 1.65
          };
        },
        (eg) => {
          eg.group.visible = false;
          eg.age = 0;
          eg.life = 1.65;
        },
        3
      );

      // ----------------------------------------------------------------------
      // 3D Atmospheric Weather Buffers (Rain / Ash / Volcanic Embers)
      // ----------------------------------------------------------------------
      this._initWeatherSystem();
    }

    _initWeatherSystem() {
      const THREE = this.THREE;
      this.weatherGroup = new THREE.Group();
      this.weatherGroup.name = 'TD_Weather3D';
      this.rootGroup.add(this.weatherGroup);

      // 1. Hornburg Storm Rain: 600 slanted 3D rain streaks + 90 ground splash rings
      const rainPositions = new Float32Array(MAX_RAIN_DROPS * 6);
      this._rainMeta = new Float32Array(MAX_RAIN_DROPS * 4); // x, y, z, speed
      for (let i = 0; i < MAX_RAIN_DROPS; i++) {
        const b = i * 4;
        this._rainMeta[b] = (Math.random() - 0.5) * 144;
        this._rainMeta[b + 1] = Math.random() * 34;
        this._rainMeta[b + 2] = (Math.random() - 0.5) * 88;
        this._rainMeta[b + 3] = 36 + Math.random() * 14;
      }
      const rainGeo = this._trackGeo(new THREE.BufferGeometry());
      this._rainPosAttr = new THREE.BufferAttribute(rainPositions, 3);
      this._rainPosAttr.setUsage(THREE.DynamicDrawUsage);
      rainGeo.setAttribute('position', this._rainPosAttr);
      const rainMat = this._trackMat(new THREE.LineBasicMaterial({
        color: 0x9ec8ed,
        transparent: true,
        opacity: 0.42,
        depthWrite: false
      }));
      this.rainLines = new THREE.LineSegments(rainGeo, rainMat);
      this.rainLines.frustumCulled = false;
      this.rainLines.visible = false;
      this.weatherGroup.add(this.rainLines);

      const splashGeo = this._trackGeo(new THREE.RingGeometry(0.18, 0.32, 12));
      splashGeo.rotateX(-HALF_PI);
      const splashMat = this._trackMat(new THREE.MeshBasicMaterial({
        color: 0xbfe2ff,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        side: THREE.DoubleSide
      }));
      this.rainSplashMesh = new THREE.InstancedMesh(splashGeo, splashMat, MAX_RAIN_SPLASHES);
      this.rainSplashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.rainSplashMesh.frustumCulled = false;
      this.rainSplashMesh.visible = false;
      this.rainSplashMesh.renderOrder = 6;
      this.weatherGroup.add(this.rainSplashMesh);

      this._rainSplashes = new Float32Array(MAX_RAIN_SPLASHES * 4); // x, z, age, life
      for (let i = 0; i < MAX_RAIN_SPLASHES; i++) {
        const b = i * 4;
        this._rainSplashes[b] = (Math.random() - 0.5) * 124;
        this._rainSplashes[b + 1] = (Math.random() - 0.5) * 68;
        this._rainSplashes[b + 2] = Math.random() * 0.35;
        this._rainSplashes[b + 3] = 0.32 + Math.random() * 0.16;
      }

      // 2. Pelennor Siege Ash & Battlefield Smoke Wisps
      const ashGeo = this._trackGeo(new THREE.OctahedronGeometry(0.11, 0));
      const ashMat = this._trackMat(new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        toneMapped: false
      }));
      this.ashFlakeMesh = new THREE.InstancedMesh(ashGeo, ashMat, MAX_ASH_FLAKES);
      this.ashFlakeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.ashFlakeMesh.setColorAt(0, this._tmpColor.setRGB(0.65, 0.62, 0.58));
      this.ashFlakeMesh.frustumCulled = false;
      this.ashFlakeMesh.visible = false;
      this.weatherGroup.add(this.ashFlakeMesh);

      this._ashMeta = new Float32Array(MAX_ASH_FLAKES * 5); // x, y, z, phase, isCinder
      for (let i = 0; i < MAX_ASH_FLAKES; i++) {
        const b = i * 5;
        this._ashMeta[b] = (Math.random() - 0.5) * 140;
        this._ashMeta[b + 1] = 0.4 + Math.random() * 19;
        this._ashMeta[b + 2] = (Math.random() - 0.5) * 84;
        this._ashMeta[b + 3] = Math.random() * TAU;
        const isCinder = Math.random() < 0.34 ? 1 : 0;
        this._ashMeta[b + 4] = isCinder;
        if (isCinder) {
          this.ashFlakeMesh.setColorAt(i, this._tmpColor.setRGB(1.65, 0.72, 0.22));
        } else {
          const g = 0.52 + Math.random() * 0.22;
          this.ashFlakeMesh.setColorAt(i, this._tmpColor.setRGB(g, g * 0.96, g * 0.9));
        }
      }
      if (this.ashFlakeMesh.instanceColor) this.ashFlakeMesh.instanceColor.needsUpdate = true;

      const wispGeo = this._trackGeo(new THREE.PlaneGeometry(9.5, 5.2));
      const wispMat = this._trackMat(new THREE.MeshBasicMaterial({
        color: 0x8d8278,
        map: this.textures.smoke || null,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
        side: THREE.DoubleSide
      }));
      this.ashWispMesh = new THREE.InstancedMesh(wispGeo, wispMat, MAX_ASH_WISPS);
      this.ashWispMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.ashWispMesh.frustumCulled = false;
      this.ashWispMesh.visible = false;
      this.ashWispMesh.renderOrder = 10;
      this.weatherGroup.add(this.ashWispMesh);

      this._wispMeta = new Float32Array(MAX_ASH_WISPS * 4); // x, y, z, spd
      for (let i = 0; i < MAX_ASH_WISPS; i++) {
        const b = i * 4;
        this._wispMeta[b] = (Math.random() - 0.5) * 140;
        this._wispMeta[b + 1] = 1.6 + Math.random() * 5.5;
        this._wispMeta[b + 2] = (Math.random() - 0.5) * 80;
        this._wispMeta[b + 3] = 1.8 + Math.random() * 1.6;
      }

      // 3. Black Gate Rising Volcanic Mordor Embers
      const emberGeo = this._trackGeo(new THREE.OctahedronGeometry(0.13, 0));
      const emberMat = this._trackMat(new THREE.MeshBasicMaterial({
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        toneMapped: false
      }));
      this.emberMesh = new THREE.InstancedMesh(emberGeo, emberMat, MAX_EMBERS);
      this.emberMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.emberMesh.setColorAt(0, this._tmpColor.setRGB(1.9, 0.65, 0.15));
      this.emberMesh.frustumCulled = false;
      this.emberMesh.visible = false;
      this.emberMesh.renderOrder = 15;
      this.weatherGroup.add(this.emberMesh);

      this._emberMeta = new Float32Array(MAX_EMBERS * 5); // x, y, z, spd, phase
      for (let i = 0; i < MAX_EMBERS; i++) {
        const b = i * 5;
        this._emberMeta[b] = (Math.random() - 0.5) * 142;
        this._emberMeta[b + 1] = Math.random() * 22;
        this._emberMeta[b + 2] = (Math.random() - 0.5) * 86;
        this._emberMeta[b + 3] = 2.6 + Math.random() * 3.4;
        this._emberMeta[b + 4] = Math.random() * TAU;
        const hot = Math.random();
        if (hot > 0.7) {
          this.emberMesh.setColorAt(i, this._tmpColor.setRGB(2.2, 1.45, 0.38));
        } else {
          this.emberMesh.setColorAt(i, this._tmpColor.setRGB(2.0, 0.58, 0.12));
        }
      }
      if (this.emberMesh.instanceColor) this.emberMesh.instanceColor.needsUpdate = true;
    }

    // ==========================================================================
    // Dynamic Flash PointLight Trigger
    // ==========================================================================
    _triggerLightFlash(wx, wy, wz, hexOrRgb, intensity, distance, duration) {
      if (!this._lightSlots || this._lightSlots.length === 0) return;
      let chosen = this._lightSlots[0];
      for (let i = 0; i < this._lightSlots.length; i++) {
        const slot = this._lightSlots[i];
        if (slot.age >= slot.life) {
          chosen = slot;
          break;
        }
        if (slot.age / slot.life > chosen.age / chosen.life) {
          chosen = slot;
        }
      }

      if (typeof hexOrRgb === 'string') {
        const c = parseColorRGB(hexOrRgb);
        chosen.light.color.setRGB(c.r, c.g, c.b);
      } else if (typeof hexOrRgb === 'number') {
        chosen.light.color.setHex(hexOrRgb);
      }
      chosen.light.position.set(wx, wy, wz);
      chosen.light.distance = distance || 18;
      chosen.light.intensity = intensity || 3.2;
      chosen.peakIntensity = intensity || 3.2;
      chosen.age = 0;
      chosen.life = duration || 0.25;
    }

    // ==========================================================================
    // Lifecycle: reset() & dispose()
    // ==========================================================================
    reset() {
      this._releaseList(this.particles, this.particlePool);
      this._releaseList(this.floatingTexts, this.textPool);
      if (this.shockwavePool) this._releaseList(this.shockwaves, this.shockwavePool);
      if (this.explosionPool) this._releaseList(this.explosions, this.explosionPool);
      if (this.lightningPool) this._releaseList(this.lightnings, this.lightningPool);
      if (this.beamPool) this._releaseList(this.beams, this.beamPool);
      if (this.earendilPool) this._releaseList(this.earendils, this.earendilPool);
      if (this.eaglePool) this._releaseList(this.eagles, this.eaglePool);

      if (this.projectileVisPool) {
        for (const vis of this._projVisMap.values()) {
          this.projectileVisPool.release(vis);
        }
        this._projVisMap.clear();
      }

      if (this.oilVisPool) {
        for (const ov of this._oilVisMap.values()) {
          this.oilVisPool.release(ov);
        }
        this._oilVisMap.clear();
      }

      if (this.beamPool) {
        for (const ab of this._anorBeamMap.values()) {
          this.beamPool.release(ab);
        }
        this._anorBeamMap.clear();
      }

      if (this._lightSlots) {
        for (let i = 0; i < this._lightSlots.length; i++) {
          this._lightSlots[i].light.intensity = 0;
          this._lightSlots[i].age = 1;
          this._lightSlots[i].life = 1;
        }
      }

      if (this.sparkMesh) { this.sparkMesh.count = 0; this.sparkMesh.visible = false; }
      if (this.magicMesh) { this.magicMesh.count = 0; this.magicMesh.visible = false; }
      if (this.smokeMesh) { this.smokeMesh.count = 0; this.smokeMesh.visible = false; }
      if (this.debrisMesh) { this.debrisMesh.count = 0; this.debrisMesh.visible = false; }
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.reset();

      if (this.rootGroup && this.rootGroup.parent) {
        this.rootGroup.parent.remove(this.rootGroup);
      }

      for (let i = 0; i < this._ownedGeometries.length; i++) {
        try { this._ownedGeometries[i].dispose(); } catch (_) {}
      }
      for (let i = 0; i < this._ownedMaterials.length; i++) {
        try { this._ownedMaterials[i].dispose(); } catch (_) {}
      }
      for (let i = 0; i < this._ownedTextures.length; i++) {
        try { this._ownedTextures[i].dispose(); } catch (_) {}
      }
      this._ownedGeometries.length = 0;
      this._ownedMaterials.length = 0;
      this._ownedTextures.length = 0;
    }

    _releaseList(arr, pool) {
      if (!pool) {
        arr.length = 0;
        return;
      }
      for (let i = 0; i < arr.length; i++) {
        pool.release(arr[i]);
      }
      arr.length = 0;
    }

    _evictOldestIfFull(arr, pool, cap) {
      if (arr.length < cap) return;
      const victim = arr[0];
      arr[0] = arr[arr.length - 1];
      arr.pop();
      pool.release(victim);
    }

    // ==========================================================================
    // Core Update & Live 3D Sync
    // ==========================================================================
    update(dt, game) {
      if (this.disposed) return;
      if (game) {
        this._lastGame = game;
        if (!this.threeScene && game.scene3d) {
          this.attachScene(game.scene3d);
        }
      }
      if (!(dt > 0)) return;
      const step = dt > 0.1 ? 0.1 : dt;
      this.time += step;
      this._lastSyncTime = this.time;

      // 1. Update 3D Particles with gravity, drag & road bounce
      const parts = this.particles;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += step;
        if (p.age >= p.life) {
          parts[i] = parts[parts.length - 1];
          parts.pop();
          this.particlePool.release(p);
          continue;
        }
        if (p.drag > 0) {
          const damp = Math.max(0, 1 - p.drag * step);
          p.vx *= damp;
          p.vy *= damp;
          p.vz *= damp;
        }
        p.vy += p.gravity * step;
        p.wx += p.vx * step;
        p.wy += p.vy * step;
        p.wz += p.vz * step;
        if (p.bounce > 0 && p.wy < p.floorY) {
          p.wy = p.floorY;
          p.vy = Math.abs(p.vy) * p.bounce;
          p.vx *= 0.68;
          p.vz *= 0.68;
        }
        p.rot += p.vrot * step;
      }

      // 2. Update Floating Combat Texts in 3D Anchor Space
      const texts = this.floatingTexts;
      for (let i = texts.length - 1; i >= 0; i--) {
        const t = texts[i];
        t.age += step;
        if (t.age >= t.life) {
          texts[i] = texts[texts.length - 1];
          texts.pop();
          this.textPool.release(t);
          continue;
        }
        t.gx += t.vx * step;
        t.wy += t.vyWorld * step;
        t.vyWorld *= Math.max(0, 1 - 1.85 * step);
      }

      if (!this.THREE) return;

      // 3. Step Dynamic PointLight Flashes
      for (let i = 0; i < this._lightSlots.length; i++) {
        const slot = this._lightSlots[i];
        if (slot.age < slot.life) {
          slot.age += step;
          if (slot.age >= slot.life) {
            slot.light.intensity = 0;
          } else {
            const u = slot.age / slot.life;
            slot.light.intensity = slot.peakIntensity * (1 - u) * (1 - u);
          }
        }
      }

      // 4. Step Shockwaves, Explosions, Lightning, Beams, Eärendil & Great Eagles
      this._updateShockwaves(step);
      this._updateExplosions(step);
      this._updateLightnings(step);
      this._updateBeams(step);
      this._updateEarendils(step);
      this._updateEagles(step);

      // 5. Sync Active Projectiles, Burning Oil & Continuous Flame of Anor Beams
      const activeGame = game || this._lastGame;
      if (activeGame) {
        this._syncProjectiles(activeGame, step);
        this._syncOilPatches(activeGame, step);
        this._syncContinuousAnorBeams(activeGame, step);
      }

      // 6. Update Instanced Particle Buffers & Atmospheric 3D Weather
      this._flushParticleInstances();
      this._updateWeather(step, activeGame);
    }

    // Optional per-render-frame hook if Scene3D calls vfx.sync(game, dt, time)
    sync(game, dt) {
      if (this.disposed) return;
      if (game) {
        this._lastGame = game;
        if (!this.threeScene && game.scene3d) {
          this.attachScene(game.scene3d);
        }
      }
      if (!this.THREE) return;

      // On pause (or if update() didn't run this frame), keep weather & synced meshes crisp
      if (this._lastSyncTime !== this.time) {
        if (!game || game.state !== 'playing') {
          const step = dt > 0 ? Math.min(dt, 0.05) : 0.016;
          this.time += step;
          this._updateWeather(step, game);
        }
        if (this.particles.length > 0) {
          this._flushParticleInstances();
        }
        if (game) {
          this._syncProjectiles(game, 0);
          this._syncOilPatches(game, 0);
          this._syncContinuousAnorBeams(game, 0);
        }
        this._lastSyncTime = this.time;
      } else if (game && game.state === 'paused') {
        if (this.particles.length > 0) {
          this._flushParticleInstances();
        }
        this._syncProjectiles(game, 0);
        this._syncOilPatches(game, 0);
        this._syncContinuousAnorBeams(game, 0);
      }
    }

    _getCameraWorldPos() {
      const s3d = this.scene3d || (this._lastGame && this._lastGame.scene3d);
      const cam = s3d && s3d.camera;
      if (cam && cam.position) {
        return cam.position;
      }
      this._tmpPos2.set(0, 48, 56);
      return this._tmpPos2;
    }

    // ==========================================================================
    // 1. Sync 3D Projectiles & Volumetric Smoke / Cyan Ribbon Trails
    // ==========================================================================
    _syncProjectiles(game, step) {
      const list = game && game.towers && game.towers.projectiles;
      const seen = this._seenProjSet || (this._seenProjSet = new Set());
      seen.clear();

      const camPos = this._getCameraWorldPos();

      if (Array.isArray(list)) {
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          if (!p) continue;
          seen.add(p);

          let vis = this._projVisMap.get(p);
          if (!vis) {
            vis = this.projectileVisPool.acquire();
            this._projVisMap.set(p, vis);
          }

          vis.root.visible = true;
          const kind = p.kind || 'arrow';

          // Reset sub-group visibility
          vis.arrowGrp.visible = false;
          vis.boulderGrp.visible = false;
          vis.boltGrp.visible = false;
          vis.arcaneGrp.visible = false;

          let wx = 0;
          let wy = 1.5;
          let wz = 0;

          if (kind === 'boulder' || kind === 'mortar') {
            // High 3D Ballistic Meteor Arc + Volumetric Dark Smoke & Fire Plume!
            vis.boulderGrp.visible = true;
            vis.ribbon.mesh.visible = false;

            const t = clamp(p.progress || 0, 0, 1);
            const startGx = p.tower ? p.tower.x : p.sx;
            const startGy = p.tower ? p.tower.y : (p.sy + 14);
            const gx = startGx + (p.tx - startGx) * t;
            const gy = startGy + (p.ty - startGy) * t;

            const startWy = this._terrainY(startGx, startGy) + (kind === 'mortar' ? 2.65 : 3.05);
            const endWy = this._terrainY(p.tx, p.ty) + 0.28;
            const arcWorld = Math.max(6.2, (p.arcHeight || 68) * 0.115);

            wx = this._toWorldX(gx);
            wz = this._toWorldZ(gy);
            wy = startWy * (1 - t) + endWy * t + arcWorld * 4 * t * (1 - t);

            const mScale = kind === 'mortar' ? 1.26 : 1.02;
            vis.boulderGrp.scale.set(mScale, mScale, mScale);
            vis.root.position.set(wx, wy, wz);

            if (!vis.initialized) {
              vis.prevWx = wx - (p.tx - startGx) * 0.01;
              vis.prevWy = wy - 0.15;
              vis.prevWz = wz - (p.ty - startGy) * 0.01;
              vis.initialized = true;
            }

            const dx = wx - vis.prevWx;
            const dy = wy - vis.prevWy;
            const dz = wz - vis.prevWz;
            if (dx * dx + dy * dy + dz * dz > 1e-6) {
              vis.root.lookAt(wx + dx, wy + dy, wz + dz);
            }
            vis.bRock.rotation.x = this.time * 7.5;
            vis.bRock.rotation.y = this.time * 5.2;
            vis.bFlame.scale.set(
              0.92 + 0.16 * Math.sin(this.time * 28 + i),
              0.92 + 0.16 * Math.cos(this.time * 26 + i),
              1.05 + 0.22 * Math.sin(this.time * 32 + i)
            );

            // Emit billowing dark-grey 3D smoke puffs & bright trailing embers along the meteor arc!
            if (step > 0) {
              vis.smokeAcc += step;
              while (vis.smokeAcc >= 0.022) {
                vis.smokeAcc -= 0.022;
                // Volumetric dark-grey smoke puff right behind the blazing boulder
                this._spawnParticle3D(
                  wx + (Math.random() - 0.5) * 0.36,
                  wy + (Math.random() - 0.5) * 0.32,
                  wz + (Math.random() - 0.5) * 0.36,
                  (Math.random() - 0.5) * 0.9,
                  0.65 + Math.random() * 0.85,
                  (Math.random() - 0.5) * 0.9,
                  0.78 + Math.random() * 0.42,
                  mScale * (0.95 + Math.random() * 0.35),
                  mScale * (2.35 + Math.random() * 0.65),
                  0.22, 0.23, 0.26,
                  'smoke',
                  0,
                  1.5
                );
                // Bright fiery orange-yellow ember spark
                this._spawnParticle3D(
                  wx + (Math.random() - 0.5) * 0.28,
                  wy + (Math.random() - 0.5) * 0.28,
                  wz + (Math.random() - 0.5) * 0.28,
                  -dx * 8 + (Math.random() - 0.5) * 2.8,
                  -dy * 6 + (Math.random() - 0.5) * 2.4,
                  -dz * 8 + (Math.random() - 0.5) * 2.8,
                  0.26 + Math.random() * 0.18,
                  0.24 * mScale,
                  0.03,
                  2.1, 1.05 + Math.random() * 0.55, 0.22,
                  'spark',
                  -4.5,
                  2.2
                );
              }
            }

            vis.prevWx = wx;
            vis.prevWy = wy;
            vis.prevWz = wz;
          } else if (kind === 'ballista_bolt' || kind === 'mithril_bolt') {
            // Heavy Forged-Iron / Mithril Siege Javelin + Golden/Cyan Mach Shock-Cone
            vis.boltGrp.visible = true;
            vis.ribbon.mesh.visible = true;

            const isMithril = kind === 'mithril_bolt';
            vis.kCone.material = isMithril ? vis.shockConeMithrilMat : vis.shockConeGoldMat;
            const gx = p.x;
            const gy = p.y + 9;
            wx = this._toWorldX(gx);
            wz = this._toWorldZ(gy);
            wy = this._terrainY(gx, gy) + 1.38;

            const dirX = Math.cos(p.angle || 0);
            const dirZ = Math.sin(p.angle || 0);
            vis.root.position.set(wx, wy, wz);
            vis.root.lookAt(wx + dirX, wy, wz + dirZ);
            vis.boltGrp.scale.setScalar(isMithril ? 1.24 : 1.04);

            this._pushProjectileRibbon(
              vis,
              wx, wy, wz,
              dirX, 0, dirZ,
              2.6,
              camPos,
              isMithril ? 0.28 : 0.20,
              isMithril ? 0.65 : 1.75,
              isMithril ? 1.95 : 1.35,
              isMithril ? 2.35 : 0.52
            );
          } else if (kind === 'arcane_bolt') {
            // Swirling Crystalline Blue-Violet 3D Arcane Orb + Rune Sparkles
            vis.arcaneGrp.visible = true;
            vis.ribbon.mesh.visible = true;

            const startGx = p.tower ? p.tower.x : p.sx;
            const startGy = p.tower ? p.tower.y : (p.sy + 27);
            const totalD = Math.hypot(p.tx - p.sx, p.ty - p.sy) || 1;
            const remD = Math.hypot(p.tx - p.x, p.ty - p.y);
            const u = clamp(1 - remD / totalD, 0, 1);

            const yOff = p.tower ? (p.tower.y - p.sy) : 27;
            const gx = p.x;
            const gy = p.y + (1 - u) * yOff;

            const startWy = this._terrainY(startGx, startGy) + 5.45;
            const endWy = this._terrainY(p.tx, p.ty) + this._enemyHitHeight(p.target);
            wx = this._toWorldX(gx);
            wz = this._toWorldZ(gy);
            wy = startWy + (endWy - startWy) * u + Math.sin(u * Math.PI) * 0.45;

            vis.root.position.set(wx, wy, wz);
            vis.iCore.rotation.y = this.time * 6.5;
            vis.iCore.rotation.x = this.time * 4.2;
            vis.iRing1.rotation.z = this.time * 7.8;
            vis.iRing2.rotation.y = -this.time * 6.4;

            const dx = this._toWorldX(p.tx) - wx;
            const dy = endWy - wy;
            const dz = this._toWorldZ(p.ty) - wz;
            const dl = Math.hypot(dx, dy, dz) || 1;

            this._pushProjectileRibbon(
              vis,
              wx, wy, wz,
              dx / dl, dy / dl, dz / dl,
              1.9,
              camPos,
              0.22,
              0.72, 1.38, 2.35
            );

            if (step > 0) {
              vis.smokeAcc += step;
              if (vis.smokeAcc >= 0.036) {
                vis.smokeAcc = 0;
                this._spawnParticle3D(
                  wx + (Math.random() - 0.5) * 0.25,
                  wy + (Math.random() - 0.5) * 0.25,
                  wz + (Math.random() - 0.5) * 0.25,
                  (Math.random() - 0.5) * 1.4,
                  0.6 + Math.random() * 0.8,
                  (Math.random() - 0.5) * 1.4,
                  0.32,
                  0.18,
                  0.02,
                  0.78, 1.55, 2.4,
                  'magic',
                  0,
                  1.8
                );
              }
            }
          } else {
            // Luminous Cyan-Blue / Silver 3D Elven Energy Shafts + Glowing Ribbon Streaks!
            vis.arrowGrp.visible = true;
            vis.ribbon.mesh.visible = true;

            const isStar = kind === 'starlight_arrow';
            const totalD = Math.hypot(p.tx - p.sx, p.ty - p.sy) || 1;
            const remD = Math.hypot(p.tx - p.x, p.ty - p.y);
            const u = clamp(1 - remD / totalD, 0, 1);

            const yOff = p.tower ? (p.tower.y - p.sy) : 21;
            const gx = p.x;
            const gy = p.y + (1 - u) * yOff;

            const startGx = p.tower ? p.tower.x : p.sx;
            const startGy = p.tower ? p.tower.y : (p.sy + 21);
            const startWy = this._terrainY(startGx, startGy) + 4.05;
            const endWy = this._terrainY(p.tx, p.ty) + this._enemyHitHeight(p.target);

            wx = this._toWorldX(gx);
            wz = this._toWorldZ(gy);
            wy = startWy + (endWy - startWy) * u + Math.sin(u * Math.PI) * 0.42;

            // Compute exact 3D tangent along sloped archery trajectory
            const tgtWx = this._toWorldX(p.tx);
            const tgtWz = this._toWorldZ(p.ty);
            let dirX = tgtWx - wx;
            let dirY = endWy - wy;
            let dirZ = tgtWz - wz;
            const dLen = Math.hypot(dirX, dirY, dirZ);
            if (dLen > 1e-4) {
              dirX /= dLen;
              dirY /= dLen;
              dirZ /= dLen;
            } else {
              dirX = Math.cos(p.angle || 0);
              dirY = -0.25;
              dirZ = Math.sin(p.angle || 0);
            }

            vis.root.position.set(wx, wy, wz);
            vis.root.lookAt(wx + dirX, wy + dirY, wz + dirZ);
            vis.arrowGrp.scale.setScalar(isStar ? 1.38 : 1.05);

            // Radiant cyan-blue / starlight ribbon streak (matches left tower in reference image!)
            const rr = isStar ? 1.45 : 0.42;
            const rg = isStar ? 2.25 : 1.85;
            const rb = isStar ? 2.55 : 2.45;
            this._pushProjectileRibbon(
              vis,
              wx - dirX * 0.35, wy - dirY * 0.35, wz - dirZ * 0.35,
              dirX, dirY, dirZ,
              isStar ? 3.8 : 2.9,
              camPos,
              isStar ? 0.30 : 0.21,
              rr, rg, rb
            );
          }
        }
      }

      // Release pooled projectile visuals for finished projectiles
      for (const [proj, vis] of this._projVisMap.entries()) {
        if (!seen.has(proj)) {
          this.projectileVisPool.release(vis);
          this._projVisMap.delete(proj);
        }
      }
    }

    _pushProjectileRibbon(vis, wx, wy, wz, dirX, dirY, dirZ, initTailLen, camPos, halfWidth, r, g, b) {
      const n = RIBBON_SEGS + 1;
      const hx = vis.hx;
      const hy = vis.hy;
      const hz = vis.hz;

      if (!vis.initialized) {
        for (let k = 0; k < n; k++) {
          const back = (k / (n - 1)) * initTailLen;
          hx[k] = wx - dirX * back;
          hy[k] = wy - dirY * back;
          hz[k] = wz - dirZ * back;
        }
        vis.initialized = true;
      } else {
        const movedSq = (wx - hx[0]) * (wx - hx[0]) + (wy - hy[0]) * (wy - hy[0]) + (wz - hz[0]) * (wz - hz[0]);
        if (movedSq > 0.025) {
          for (let k = n - 1; k >= 1; k--) {
            hx[k] = hx[k - 1];
            hy[k] = hy[k - 1];
            hz[k] = hz[k - 1];
          }
        }
        hx[0] = wx;
        hy[0] = wy;
        hz[0] = wz;
      }

      updateRibbonStrip(
        vis.ribbon,
        hx, hy, hz,
        n,
        camPos.x, camPos.y, camPos.z,
        halfWidth,
        0.012,
        r, g, b,
        true
      );
    }

    // ==========================================================================
    // 2. Sync 3D Burning Oil Patches (Scorched Tar Decal + Dancing Fire & Smoke)
    // ==========================================================================
    _syncOilPatches(game, step) {
      const list = game && game.towers && game.towers.oilPatches;
      const seen = this._seenOilSet || (this._seenOilSet = new Set());
      seen.clear();

      if (Array.isArray(list)) {
        for (let i = 0; i < list.length; i++) {
          const o = list[i];
          if (!o || o.life <= 0) continue;
          seen.add(o);

          let ov = this._oilVisMap.get(o);
          if (!ov) {
            ov = this.oilVisPool.acquire();
            this._oilVisMap.set(o, ov);
          }

          const wx = this._toWorldX(o.x);
          const wz = this._toWorldZ(o.y);
          const wy = this._terrainY(o.x, o.y) + 0.11;
          const fade = clamp(o.life / 0.75, 0, 1);
          const radWorld = Math.min(3.1, (o.radius || 65) * 0.042);

          ov.group.visible = true;
          ov.group.position.set(wx, wy, wz);
          ov.decal.scale.set(radWorld, 1, radWorld * 0.90);

          for (let f = 0; f < ov.flames.length; f++) {
            const fm = ov.flames[f];
            const ang = (o.seed || 0) + f * 0.92 + this.time * 1.15;
            const rr = radWorld * (0.16 + 0.52 * (((f * 37) % 11) / 11));
            fm.position.set(Math.cos(ang) * rr, 0.02, Math.sin(ang) * rr * 0.88);
            const flicker = (0.68 + 0.36 * Math.sin(this.time * 13 + f * 2.1)) * fade;
            fm.scale.set(0.45 * fade, Math.max(0.04, 0.45 * flicker), 0.45 * fade);
            fm.rotation.z = Math.sin(this.time * 9 + f) * 0.18;
          }

          if (step > 0) {
            ov.smokeAcc += step;
            if (ov.smokeAcc >= 0.085) {
              ov.smokeAcc = 0;
              const a = Math.random() * TAU;
              const d = Math.random() * radWorld * 0.75;
              this._spawnParticle3D(
                wx + Math.cos(a) * d,
                wy + 0.45,
                wz + Math.sin(a) * d,
                (Math.random() - 0.5) * 0.8,
                1.9 + Math.random() * 1.2,
                (Math.random() - 0.5) * 0.8,
                0.85,
                0.55,
                1.65,
                0.18, 0.17, 0.17,
                'smoke',
                0,
                1.1
              );
            }
          }
        }
      }

      for (const [oil, ov] of this._oilVisMap.entries()) {
        if (!seen.has(oil)) {
          this.oilVisPool.release(ov);
          this._oilVisMap.delete(oil);
        }
      }
    }

    // ==========================================================================
    // 3. Continuous Smooth 60-FPS Flame of Anor Solar Beams
    // ==========================================================================
    _syncContinuousAnorBeams(game, step) {
      const towers = game && game.towers && game.towers.towers;
      const seen = this._seenAnorSet || (this._seenAnorSet = new Set());
      seen.clear();

      if (Array.isArray(towers)) {
        for (let i = 0; i < towers.length; i++) {
          const t = towers[i];
          if (
            t &&
            t.type === 'istari' &&
            t.tier === 3 &&
            t.branch === 'A' &&
            t.stunTimer <= 0 &&
            t.beamTarget &&
            !t.beamTarget.dead &&
            !t.beamTarget.reachedExit &&
            t.beamTarget.hp > 0
          ) {
            seen.add(t);
            let beam = this._anorBeamMap.get(t);
            if (!beam) {
              beam = this.beamPool.acquire();
              this._anorBeamMap.set(t, beam);
            }

            const bt = t.beamTarget;
            beam.wx1 = this._toWorldX(t.x);
            beam.wz1 = this._toWorldZ(t.y);
            beam.wy1 = this._terrainY(t.x, t.y) + 5.55;

            beam.wx2 = this._toWorldX(bt.x);
            beam.wz2 = this._toWorldZ(bt.y);
            beam.wy2 = this._terrainY(bt.x, bt.y) + this._enemyHitHeight(bt);

            beam.intensity = 0.9 + ((t.beamRampMult || 1) - 1) * 0.68;
            beam.color = '#ff9800';
            beam.age = 0;
            beam.life = 1.0;
            this._positionBeamMesh(beam, 1.0);

            if (step > 0 && Math.random() < step * 5.8) {
              this._spawnParticle3D(
                beam.wx2 + (Math.random() - 0.5) * 0.35,
                beam.wy2 + (Math.random() - 0.5) * 0.25,
                beam.wz2 + (Math.random() - 0.5) * 0.35,
                (Math.random() - 0.5) * 4.2,
                1.8 + Math.random() * 2.6,
                (Math.random() - 0.5) * 4.2,
                0.24,
                0.15,
                0.02,
                1.05, 0.58, 0.14,
                'spark',
                -8,
                2.0
              );
            }
          }
        }
      }

      for (const [tower, beam] of this._anorBeamMap.entries()) {
        if (!seen.has(tower)) {
          this.beamPool.release(beam);
          this._anorBeamMap.delete(tower);
        }
      }
    }

    // ==========================================================================
    // Step 3D Shockwaves, Explosions, Lightning, Beams, Eärendil & Great Eagles
    // ==========================================================================
    _updateShockwaves(step) {
      const list = this.shockwaves;
      for (let i = list.length - 1; i >= 0; i--) {
        const s = list[i];
        s.age += step;
        if (s.age >= s.life) {
          list[i] = list[list.length - 1];
          list.pop();
          this.shockwavePool.release(s);
          continue;
        }
        const p = s.age / s.life;
        const ease = 1 - Math.pow(1 - p, 2.4);
        const r = Math.max(0.25, s.maxRadiusWorld * ease);
        const alpha = (1 - p);

        s.group.visible = true;
        s.group.position.set(s.wx, s.wy, s.wz);
        s.group.scale.set(r, 1, r);
        s.ringMat.opacity = alpha * 0.72;
        s.discMat.opacity = alpha * 0.14;
      }
    }

    _updateExplosions(step) {
      const list = this.explosions;
      for (let i = list.length - 1; i >= 0; i--) {
        const ex = list[i];
        ex.age += step;
        if (ex.age >= ex.life) {
          list[i] = list[list.length - 1];
          list.pop();
          this.explosionPool.release(ex);
          continue;
        }
        const p = ex.age / ex.life;
        const expand = Math.pow(p, 0.42);
        const fade = 1 - p;
        const clampedR = Math.min(2.3, ex.maxR);
        ex.group.visible = true;
        ex.core.scale.setScalar(Math.max(0.08, clampedR * 0.42 * (1 - p * 0.48)));
        ex.shell.scale.setScalar(Math.max(0.15, clampedR * (0.32 + expand * 0.62)));
        ex.coreMat.opacity = fade * 0.58;
        ex.shellMat.opacity = fade * fade * 0.44;
      }
    }

    _refreshLightningGeometry(l, idxSeed) {
      const camPos = this._getCameraWorldPos();
      const camQuat = (this.scene3d && this.scene3d.camera) ? this.scene3d.camera.quaternion : null;
      const u = clamp(l.age / Math.max(0.001, l.life), 0, 1);
      const flicker = (1 - u) * (0.85 + 0.20 * Math.sin(this.time * 75 + (idxSeed || 0) * 3.1));
      l.group.visible = true;

      updateRibbonStrip(
        l.outerRibbon, l.mainX, l.mainY, l.mainZ, 11,
        camPos.x, camPos.y, camPos.z,
        0.22, 0.15,
        l.r * 0.62 * flicker, l.g * 0.85 * flicker, l.b * 1.12 * flicker,
        false
      );
      updateRibbonStrip(
        l.coreRibbon, l.mainX, l.mainY, l.mainZ, 11,
        camPos.x, camPos.y, camPos.z,
        0.068, 0.052,
        1.18 * flicker, 1.26 * flicker, 1.32 * flicker,
        false
      );
      updateRibbonStrip(
        l.strand2Ribbon, l.altX, l.altY, l.altZ, 9,
        camPos.x, camPos.y, camPos.z,
        0.08, 0.05,
        l.r * 0.78 * flicker, l.g * 0.95 * flicker, l.b * 1.20 * flicker,
        false
      );
      updateRibbonStrip(
        l.fork1Ribbon, l.f1X, l.f1Y, l.f1Z, 4,
        camPos.x, camPos.y, camPos.z,
        0.085, 0.012,
        l.r * 0.88 * flicker, l.g * 1.02 * flicker, l.b * 1.24 * flicker,
        true
      );
      updateRibbonStrip(
        l.fork2Ribbon, l.f2X, l.f2Y, l.f2Z, 4,
        camPos.x, camPos.y, camPos.z,
        0.08, 0.012,
        1.18 * flicker, 0.88 * flicker, 0.42 * flicker,
        true
      );

      l.flareMat.opacity = Math.min(0.48, flicker * 0.52);
      const fScale = 0.55 + (1 - u) * 0.40;
      l.srcFlare.scale.setScalar(fScale * 0.65);
      l.hitFlare.scale.setScalar(fScale * 0.90);
      if (camQuat) {
        l.srcFlare.quaternion.copy(camQuat);
        l.hitFlare.quaternion.copy(camQuat);
      }
    }

    _updateLightnings(step) {
      const list = this.lightnings;
      if (list.length === 0) return;

      for (let i = list.length - 1; i >= 0; i--) {
        const l = list[i];
        l.age += step;
        if (l.age >= l.life) {
          list[i] = list[list.length - 1];
          list.pop();
          this.lightningPool.release(l);
          continue;
        }
        this._refreshLightningGeometry(l, i);
      }
    }

    _positionBeamMesh(b, alpha) {
      const dx = b.wx2 - b.wx1;
      const dy = b.wy2 - b.wy1;
      const dz = b.wz2 - b.wz1;
      const len = Math.max(0.1, Math.hypot(dx, dy, dz));
      const pulse = 0.94 + 0.10 * Math.sin(this.time * 34);
      const inten = clamp(b.intensity, 0.5, 2.6) * pulse;

      const c = parseColorRGB(b.color);
      b.sheathMat.color.setRGB(c.r * 0.94, c.g * 0.56, c.b * 0.22);
      b.ringMat.color.setRGB(Math.min(1.18, c.r * 1.02 + 0.10), Math.min(0.95, c.g * 0.78 + 0.08), c.b * 0.45 + 0.05);
      b.sheathMat.opacity = alpha * 0.40;
      b.coreMat.opacity = alpha * 0.78;
      b.ringMat.opacity = alpha * 0.45;

      b.group.visible = true;
      b.group.position.set(0, 0, 0);

      const mx = (b.wx1 + b.wx2) * 0.5;
      const my = (b.wy1 + b.wy2) * 0.5;
      const mz = (b.wz1 + b.wz2) * 0.5;

      const outerR = 0.10 + inten * 0.052;
      const innerR = 0.042 + inten * 0.022;

      b.sheath.position.set(mx, my, mz);
      b.sheath.lookAt(b.wx2, b.wy2, b.wz2);
      b.sheath.scale.set(outerR, outerR, len);

      b.core.position.set(mx, my, mz);
      b.core.lookAt(b.wx2, b.wy2, b.wz2);
      b.core.scale.set(innerR, innerR, len);

      b.srcOrb.position.set(b.wx1, b.wy1, b.wz1);
      b.srcOrb.scale.setScalar(Math.min(0.15, 0.09 + inten * 0.025));

      b.hitOrb.position.set(b.wx2, b.wy2, b.wz2);
      b.hitOrb.scale.setScalar(Math.min(0.20, 0.11 + inten * 0.035));

      // Swirling ember rings at impact point
      b.impactRing1.position.set(b.wx2, b.wy2, b.wz2);
      b.impactRing1.rotation.set(HALF_PI + Math.sin(this.time * 8) * 0.35, this.time * 7, 0);
      b.impactRing1.scale.setScalar(0.20 + inten * 0.08);

      b.impactRing2.position.set(b.wx2, b.wy2, b.wz2);
      b.impactRing2.rotation.set(Math.cos(this.time * 9) * 0.65, -this.time * 8.5, HALF_PI * 0.5);
      b.impactRing2.scale.setScalar(0.15 + inten * 0.06);
    }

    _updateBeams(step) {
      const list = this.beams;
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        b.age += step;
        if (b.age >= b.life) {
          list[i] = list[list.length - 1];
          list.pop();
          this.beamPool.release(b);
          continue;
        }
        const alpha = 1 - (b.age / b.life) * 0.85;
        this._positionBeamMesh(b, alpha);
      }
    }

    _refreshEarendilTransform(e) {
      const p = clamp(e.age / Math.max(0.001, e.life), 0, 1);
      const swell = p < 0.14 ? Math.max(0.15, p / 0.14) : (1 - (p - 0.14) / 0.86);
      const groundFade = (p < 0.1 ? Math.max(0.25, p / 0.1) : 1) * (p > 0.58 ? (1 - p) / 0.42 : 1);
      const r = e.radiusWorld;

      e.group.visible = true;
      e.group.position.set(e.wx, e.wy, e.wz);

      const shaftR = Math.max(0.3, r * 0.44 * swell);
      e.outerShaft.scale.set(shaftR, 1, shaftR);
      e.innerShaft.scale.set(shaftR * 0.45, 1, shaftR * 0.45);
      e.outerMat.opacity = swell * 0.36;
      e.innerMat.opacity = swell * 0.68;

      const discR = r * (0.92 + 0.08 * Math.min(1, p * 4));
      e.runeDisc.scale.set(discR, 1, discR);
      e.runeDisc.rotation.y = this.time * 0.85;
      e.runeMat.opacity = groundFade * 0.96;

      e.ringMesh.scale.set(discR, 1, discR);
      e.ringMesh.rotation.z = -this.time * 1.2;
    }

    _updateEarendils(step) {
      const list = this.earendils;
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        e.age += step;
        if (e.age >= e.life) {
          list[i] = list[list.length - 1];
          list.pop();
          this.earendilPool.release(e);
          continue;
        }

        this._refreshEarendilTransform(e);
        const r = e.radiusWorld;

        // Rising silver-cyan starlight motes inside the celestial column
        e.moteAcc += step;
        while (e.moteAcc >= 0.04) {
          e.moteAcc -= 0.04;
          const a = Math.random() * TAU;
          const rr = Math.random() * r * 0.78;
          this._spawnParticle3D(
            e.wx + Math.cos(a) * rr,
            e.wy + 0.3 + Math.random() * 2.5,
            e.wz + Math.sin(a) * rr,
            -Math.sin(a) * 1.6,
            6.5 + Math.random() * 5.5,
            Math.cos(a) * 1.6,
            0.72,
            0.26,
            0.04,
            1.35, 2.05, 2.45,
            'magic',
            0,
            0.6
          );
        }
      }
    }

    _refreshEagleTransform(g) {
      const p = clamp(g.age / Math.max(0.001, g.life), 0, 1);
      const env = Math.max(0.15, Math.sin(p * Math.PI));
      const travel = (p - 0.5) * 78.0; // 78 world units sweep across valley!
      const perpX = -g.sin;
      const perpZ = g.cos;

      g.group.visible = true;

      for (let idx = 0; idx < 3; idx++) {
        const rig = g.birds[idx];
        const backOff = idx === 0 ? 3.5 : -4.8;
        const sideOff = idx === 0 ? 0 : (idx === 1 ? -6.4 : 6.4);
        const altBase = idx === 0 ? 9.4 : 8.8;
        const swoop = altBase - Math.sin(p * Math.PI) * 1.05;

        const bx = g.wx + g.cos * (travel + backOff) + perpX * sideOff;
        const bz = g.wz + g.sin * (travel + backOff) + perpZ * sideOff;

        const phase = g.age * 8.2 + idx * 1.35;
        const innerFlap = Math.sin(phase) * 0.42;
        const outerFlap = Math.sin(phase - 0.55) * 0.34;
        const wristFlex = Math.sin(phase - 1.05) * 0.26;
        const wingPitch = Math.cos(phase) * 0.10;
        const bodyBob = -Math.sin(phase) * 0.16;
        const bank = (idx === 1 ? -0.14 : (idx === 2 ? 0.14 : 0.05 * Math.sin(g.age * 3)));

        rig.root.position.set(bx, swoop + bodyBob, bz);
        rig.root.rotation.set(0.06 * Math.cos(p * Math.PI), g.yaw, bank);

        rig.leftWing.shoulder.rotation.set(wingPitch, 0, -innerFlap);
        rig.leftWing.elbow.rotation.z = -outerFlap;
        if (rig.leftWing.wrist) rig.leftWing.wrist.rotation.z = -wristFlex;

        rig.rightWing.shoulder.rotation.set(wingPitch, 0, innerFlap);
        rig.rightWing.elbow.rotation.z = outerFlap;
        if (rig.rightWing.wrist) rig.rightWing.wrist.rotation.z = wristFlex;

        if (rig.tailGroup) {
          rig.tailGroup.rotation.x = -0.06 + Math.cos(phase) * 0.08;
        }
        if (rig.headGroup) {
          rig.headGroup.rotation.x = -0.04 * Math.cos(phase);
        }

        // Ground drop-shadow gliding along cobble road / hills below
        const gx = bx / WORLD_SCALE + HALF_W;
        const gy = bz / WORLD_SCALE + HALF_H;
        const groundY = this._terrainY(gx, gy) + 0.12;
        rig.shadowGroup.position.set(bx + 1.8, groundY, bz + 2.4);
        rig.shadowGroup.rotation.y = g.yaw;
      }

      // Shimmering golden 3D wind-ribbons sweeping behind the eagles
      for (let k = 0; k < g.streaks.length; k++) {
        const sm = g.streaks[k];
        const along = g.streakAlong[k] + (p - 0.5) * 48.0;
        const perp = g.streakPerp[k];
        const sx = g.wx + g.cos * along + perpX * perp;
        const sz = g.wz + g.sin * along + perpZ * perp;
        sm.position.set(sx, g.streakAlt[k], sz);
        sm.rotation.set(0, -g.dirAngle, 0);
        sm.scale.set(g.streakLen[k] * (0.4 + 0.6 * env), 1, 1);
      }
    }

    _updateEagles(step) {
      const list = this.eagles;
      for (let i = list.length - 1; i >= 0; i--) {
        const g = list[i];
        g.age += step;
        if (g.age >= g.life) {
          list[i] = list[list.length - 1];
          list.pop();
          this.eaglePool.release(g);
          continue;
        }
        this._refreshEagleTransform(g);
      }
    }

    // ==========================================================================
    // Flush Active 3D Particles into 4 Zero-GC InstancedMeshes
    // ==========================================================================
    _flushParticleInstances() {
      const parts = this.particles;
      let sparkCount = 0;
      let magicCount = 0;
      let smokeCount = 0;
      let debrisCount = 0;

      const cam = this.scene3d && this.scene3d.camera;
      const camQuat = cam ? cam.quaternion : null;

      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const u = p.age / p.life;
        if (u < 0 || u >= 1) continue;

        const fade = 1 - u;
        const curSize = Math.max(0.03, p.size + (p.endSize - p.size) * u);

        if (p.kind === 'smoke') {
          if (smokeCount >= MAX_SMOKE_INST) continue;
          this._tmpPos.set(p.wx, p.wy, p.wz);
          if (camQuat) {
            this._tmpQuat.copy(camQuat);
          } else {
            this._tmpQuat.identity();
          }
          this._tmpScale.set(curSize, curSize, curSize);
          this._tmpMat4.compose(this._tmpPos, this._tmpQuat, this._tmpScale);
          this.smokeMesh.setMatrixAt(smokeCount, this._tmpMat4);

          const shade = 0.55 + 0.45 * fade;
          this._tmpColor.setRGB(p.r * shade, p.g * shade, p.b * shade);
          this.smokeMesh.setColorAt(smokeCount, this._tmpColor);
          smokeCount++;
        } else if (p.kind === 'stone' || p.kind === 'blood') {
          if (debrisCount >= MAX_DEBRIS_INST) continue;
          this._tmpPos.set(p.wx, p.wy, p.wz);
          this._tmpEuler.set(p.rot, p.rot * 0.7, p.rot * 1.3);
          this._tmpQuat.setFromEuler(this._tmpEuler);
          this._tmpScale.set(curSize, curSize * (p.kind === 'blood' ? 0.7 : 0.85), curSize);
          this._tmpMat4.compose(this._tmpPos, this._tmpQuat, this._tmpScale);
          this.debrisMesh.setMatrixAt(debrisCount, this._tmpMat4);

          this._tmpColor.setRGB(p.r, p.g, p.b);
          this.debrisMesh.setColorAt(debrisCount, this._tmpColor);
          debrisCount++;
        } else if (p.kind === 'magic') {
          if (magicCount >= MAX_MAGIC_INST) continue;
          this._tmpPos.set(p.wx, p.wy, p.wz);
          this._tmpEuler.set(p.rot * 0.8, p.rot, 0.35);
          this._tmpQuat.setFromEuler(this._tmpEuler);
          this._tmpScale.setScalar(curSize);
          this._tmpMat4.compose(this._tmpPos, this._tmpQuat, this._tmpScale);
          this.magicMesh.setMatrixAt(magicCount, this._tmpMat4);

          this._tmpColor.setRGB(p.r * fade, p.g * fade, p.b * fade);
          this.magicMesh.setColorAt(magicCount, this._tmpColor);
          magicCount++;
        } else {
          // 'spark' | 'fire' | 'trail' -> velocity-aligned HDR additive streak
          if (sparkCount >= MAX_SPARK_INST) continue;
          this._tmpPos.set(p.wx, p.wy, p.wz);
          const spd = Math.hypot(p.vx, p.vy, p.vz);
          if (spd > 0.25) {
            this._tmpDir.set(p.vx / spd, p.vy / spd, p.vz / spd);
            this._tmpQuat.setFromUnitVectors(this._tmpUp, this._tmpDir);
          } else {
            this._tmpQuat.identity();
          }
          const stretch = p.kind === 'spark' ? clamp(1 + spd * 0.08, 1, 3.2) : 1.15;
          this._tmpScale.set(curSize, curSize * stretch, curSize);
          this._tmpMat4.compose(this._tmpPos, this._tmpQuat, this._tmpScale);
          this.sparkMesh.setMatrixAt(sparkCount, this._tmpMat4);

          this._tmpColor.setRGB(p.r * fade, p.g * fade, p.b * fade);
          this.sparkMesh.setColorAt(sparkCount, this._tmpColor);
          sparkCount++;
        }
      }

      this._commitInstanced(this.sparkMesh, sparkCount);
      this._commitInstanced(this.magicMesh, magicCount);
      this._commitInstanced(this.smokeMesh, smokeCount);
      this._commitInstanced(this.debrisMesh, debrisCount);
    }

    _commitInstanced(mesh, count) {
      mesh.count = count;
      mesh.visible = count > 0;
      if (count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }

    // ==========================================================================
    // 3D Atmospheric Weather System (Rain / Ash / Volcanic Embers)
    // ==========================================================================
    _updateWeather(step, game) {
      const wType = (game && game.map && game.map.weatherType) || 'rain';
      if (this._currentWeather !== wType) {
        this._currentWeather = wType;
        this.rainLines.visible = wType === 'rain';
        this.rainSplashMesh.visible = wType === 'rain';
        this.ashFlakeMesh.visible = wType === 'ash';
        this.ashWispMesh.visible = wType === 'ash';
        this.emberMesh.visible = wType === 'embers';
      }

      if (wType === 'rain') {
        const pos = this._rainPosAttr.array;
        const meta = this._rainMeta;
        const windX = -5.2;
        const windZ = 3.4;

        for (let i = 0; i < MAX_RAIN_DROPS; i++) {
          const b = i * 4;
          const spd = meta[b + 3];
          meta[b] += windX * step;
          meta[b + 1] -= spd * step;
          meta[b + 2] += windZ * step;

          if (meta[b + 1] <= 0) {
            meta[b] = (Math.random() - 0.5) * 144;
            meta[b + 1] = 30 + Math.random() * 6;
            meta[b + 2] = (Math.random() - 0.5) * 88;
          }

          const x = meta[b];
          const y = meta[b + 1];
          const z = meta[b + 2];
          const streak = 0.042 * spd;

          const pIdx = i * 6;
          pos[pIdx] = x;
          pos[pIdx + 1] = y;
          pos[pIdx + 2] = z;
          pos[pIdx + 3] = x - windX * 0.042;
          pos[pIdx + 4] = y + streak;
          pos[pIdx + 5] = z - windZ * 0.042;
        }
        this._rainPosAttr.needsUpdate = true;

        // Ground rain splash rings across causeway & cliffs
        this._tmpQuat.identity();
        for (let i = 0; i < MAX_RAIN_SPLASHES; i++) {
          const b = i * 4;
          this._rainSplashes[b + 2] += step;
          if (this._rainSplashes[b + 2] >= this._rainSplashes[b + 3]) {
            this._rainSplashes[b] = (Math.random() - 0.5) * 124;
            this._rainSplashes[b + 1] = (Math.random() - 0.5) * 68;
            this._rainSplashes[b + 2] = 0;
            this._rainSplashes[b + 3] = 0.28 + Math.random() * 0.18;
          }
          const sx = this._rainSplashes[b];
          const sz = this._rainSplashes[b + 1];
          const u = this._rainSplashes[b + 2] / this._rainSplashes[b + 3];
          const gy = this._terrainY(sx / WORLD_SCALE + HALF_W, sz / WORLD_SCALE + HALF_H) + 0.12;
          const sc = (0.35 + u * 1.45) * (1 - u * 0.65);

          this._tmpPos.set(sx, gy, sz);
          this._tmpScale.set(sc, 1, sc);
          this._tmpMat4.compose(this._tmpPos, this._tmpQuat, this._tmpScale);
          this.rainSplashMesh.setMatrixAt(i, this._tmpMat4);
        }
        this.rainSplashMesh.count = MAX_RAIN_SPLASHES;
        this.rainSplashMesh.instanceMatrix.needsUpdate = true;
      } else if (wType === 'ash') {
        const cam = this.scene3d && this.scene3d.camera;
        const camQuat = cam ? cam.quaternion : null;

        // Drifting siege ash & warm cinders
        for (let i = 0; i < MAX_ASH_FLAKES; i++) {
          const b = i * 5;
          const ph = this._ashMeta[b + 3];
          const isCinder = this._ashMeta[b + 4] > 0.5;
          this._ashMeta[b] += (2.8 + Math.sin(this.time * 1.4 + ph) * 1.1) * step;
          this._ashMeta[b + 1] += (isCinder ? 0.85 : -1.15) * step + Math.cos(this.time * 2.1 + ph) * 0.35 * step;
          this._ashMeta[b + 2] += (0.9 + Math.cos(this.time * 1.2 + ph) * 0.8) * step;

          if (this._ashMeta[b] > 72) this._ashMeta[b] = -72;
          if (this._ashMeta[b + 2] > 44) this._ashMeta[b + 2] = -44;
          if (this._ashMeta[b + 1] < 0.2) this._ashMeta[b + 1] = 19;
          if (this._ashMeta[b + 1] > 20) this._ashMeta[b + 1] = 0.4;

          this._tmpPos.set(this._ashMeta[b], this._ashMeta[b + 1], this._ashMeta[b + 2]);
          this._tmpEuler.set(this.time * 1.8 + ph, this.time * 1.3, ph);
          this._tmpQuat.setFromEuler(this._tmpEuler);
          this._tmpScale.setScalar(isCinder ? 0.95 : 1.15);
          this._tmpMat4.compose(this._tmpPos, this._tmpQuat, this._tmpScale);
          this.ashFlakeMesh.setMatrixAt(i, this._tmpMat4);
        }
        this.ashFlakeMesh.count = MAX_ASH_FLAKES;
        this.ashFlakeMesh.instanceMatrix.needsUpdate = true;

        // Drifting battlefield smoke wisps
        for (let i = 0; i < MAX_ASH_WISPS; i++) {
          const b = i * 4;
          this._wispMeta[b] += this._wispMeta[b + 3] * step;
          if (this._wispMeta[b] > 76) this._wispMeta[b] = -76;

          this._tmpPos.set(
            this._wispMeta[b],
            this._wispMeta[b + 1] + Math.sin(this.time * 0.6 + i) * 0.35,
            this._wispMeta[b + 2]
          );
          if (camQuat) this._tmpQuat.copy(camQuat);
          else this._tmpQuat.identity();
          const sc = 0.9 + 0.25 * Math.sin(i * 1.7);
          this._tmpScale.set(sc * 1.4, sc * 0.75, 1);
          this._tmpMat4.compose(this._tmpPos, this._tmpQuat, this._tmpScale);
          this.ashWispMesh.setMatrixAt(i, this._tmpMat4);
        }
        this.ashWispMesh.count = MAX_ASH_WISPS;
        this.ashWispMesh.instanceMatrix.needsUpdate = true;
      } else if (wType === 'embers') {
        // Black Gate: Rising glowing volcanic Mordor embers across the whole valley
        for (let i = 0; i < MAX_EMBERS; i++) {
          const b = i * 5;
          const spd = this._emberMeta[b + 3];
          const ph = this._emberMeta[b + 4];
          this._emberMeta[b] += Math.sin(this.time * 2.2 + ph) * 1.6 * step + 0.8 * step;
          this._emberMeta[b + 1] += spd * step;
          this._emberMeta[b + 2] += Math.cos(this.time * 1.9 + ph) * 1.4 * step;

          if (this._emberMeta[b + 1] > 23) {
            this._emberMeta[b] = (Math.random() - 0.5) * 142;
            this._emberMeta[b + 1] = -0.6;
            this._emberMeta[b + 2] = (Math.random() - 0.5) * 86;
          }

          const flicker = 0.65 + 0.5 * Math.sin(this.time * 11 + ph * 3);
          this._tmpPos.set(this._emberMeta[b], this._emberMeta[b + 1], this._emberMeta[b + 2]);
          this._tmpEuler.set(this.time * 3 + ph, ph, this.time * 2);
          this._tmpQuat.setFromEuler(this._tmpEuler);
          this._tmpScale.setScalar(Math.max(0.25, flicker));
          this._tmpMat4.compose(this._tmpPos, this._tmpQuat, this._tmpScale);
          this.emberMesh.setMatrixAt(i, this._tmpMat4);
        }
        this.emberMesh.count = MAX_EMBERS;
        this.emberMesh.instanceMatrix.needsUpdate = true;
      }
    }

    // ==========================================================================
    // TD.VFX Spawning Interface (100% Compatible + Rich 3D Upgrades)
    // ==========================================================================
    _spawnParticle3D(wx, wy, wz, vx, vy, vz, life, size, endSize, r, g, b, kind, gravity, drag, floorY = 0.08, bounce = 0) {
      this._evictOldestIfFull(this.particles, this.particlePool, MAX_PARTICLES);
      const p = this.particlePool.acquire();
      p.wx = wx; p.wy = wy; p.wz = wz;
      p.vx = vx; p.vy = vy; p.vz = vz;
      p.age = 0;
      p.life = life;
      p.size = size;
      p.endSize = endSize;
      p.r = r; p.g = g; p.b = b;
      p.kind = kind;
      p.gravity = gravity;
      p.drag = drag;
      p.floorY = floorY;
      p.bounce = bounce;
      p.rot = Math.random() * TAU;
      p.vrot = (Math.random() - 0.5) * 9;
      this.particles.push(p);
      return p;
    }

    spawnBurst(x, y, opts) {
      let kind = 'spark';
      let color = null;
      let count = 0;
      let speed = 0;
      let hasAngle = false;
      let angle = 0;
      let spread = TAU;
      let life = 0;
      let size = 0;

      if (typeof opts === 'string') {
        if (KIND_COLORS[opts]) kind = opts;
        else color = opts;
      } else if (opts && typeof opts === 'object') {
        if (opts.kind && KIND_COLORS[opts.kind]) kind = opts.kind;
        if (opts.color) color = opts.color;
        if (opts.count > 0) count = opts.count | 0;
        if (opts.speed > 0) speed = opts.speed;
        if (typeof opts.angle === 'number') {
          hasAngle = true;
          angle = opts.angle;
        }
        if (typeof opts.spread === 'number') {
          spread = opts.spread;
        } else if (hasAngle) {
          spread = 1.05;
        }
        if (opts.life > 0) life = opts.life;
        if (opts.size > 0) size = opts.size;
      }

      if (!color) color = KIND_COLORS[kind] || '#ffd54f';
      if (count <= 0) count = kind === 'smoke' ? 7 : kind === 'fire' ? 12 : 9;
      if (speed <= 0) speed = kind === 'spark' ? 140 : kind === 'stone' ? 115 : kind === 'smoke' ? 42 : 90;
      if (life <= 0) life = kind === 'smoke' ? 0.78 : kind === 'spark' ? 0.36 : kind === 'magic' ? 0.56 : 0.46;
      if (size <= 0) size = kind === 'smoke' ? 6.0 : kind === 'spark' ? 2.5 : 3.3;

      const baseFloor = this._terrainY(x, y) + 0.08;
      const startWy = baseFloor + (kind === 'smoke' || kind === 'fire' ? 0.55 : 0.95);
      const wx = this._toWorldX(x);
      const wz = this._toWorldZ(y);

      const col = parseColorRGB(color);
      const hdrBoost = (kind === 'spark' || kind === 'fire' || kind === 'magic') ? 1.18 : 1.0;

      // Trigger subtle fireball flash when large fire bursts detonate (e.g., mortar impacts & bosses!)
      if (kind === 'fire' && count >= 14 && this.explosionPool) {
        this._spawnFireballFlash(wx, baseFloor + 0.65, wz, Math.min(2.1, 1.15 + count * 0.05), 0.26);
        this._triggerLightFlash(wx, baseFloor + 2.0, wz, '#ff7b29', 2.4, 15, 0.24);
      }

      for (let i = 0; i < count; i++) {
        const a = (hasAngle ? angle : 0) + (Math.random() - 0.5) * spread;
        const spdWorld = speed * WORLD_SCALE * (0.45 + Math.random() * 0.78);
        const vx = Math.cos(a) * spdWorld;
        const vz = Math.sin(a) * spdWorld;

        let vy = 0;
        let gravity = 0;
        let drag = 2.2;
        let bounce = 0;
        let pSize = size * 0.105 * (0.78 + Math.random() * 0.44);
        let endSize = pSize * 0.2;

        if (kind === 'blood') {
          vy = 3.2 + Math.random() * 5.2;
          gravity = -24.0;
          drag = 1.6;
          bounce = 0.22;
          pSize *= 0.85;
          endSize = pSize * 0.35;
        } else if (kind === 'stone') {
          vy = 4.8 + Math.random() * 7.5;
          gravity = -26.0;
          drag = 0.9;
          bounce = 0.42;
          pSize *= 1.05;
          endSize = pSize * 0.75;
        } else if (kind === 'fire') {
          vy = 2.8 + Math.random() * 5.5;
          gravity = 3.5;
          drag = 2.4;
          pSize *= 1.25;
          endSize = 0.04;
        } else if (kind === 'smoke') {
          vy = 1.8 + Math.random() * 2.6;
          gravity = 1.2;
          drag = 2.2;
          pSize = Math.max(0.65, size * 0.16);
          endSize = pSize * 2.35;
        } else if (kind === 'magic') {
          vy = 1.4 + Math.random() * 3.8;
          gravity = 1.5;
          drag = 2.2;
          endSize = 0.03;
        } else {
          // spark
          vy = 2.5 + Math.random() * 6.2;
          gravity = -16.5;
          drag = 2.2;
          bounce = 0.35;
          endSize = 0.03;
        }

        this._spawnParticle3D(
          wx + (Math.random() - 0.5) * 0.35,
          startWy + (Math.random() - 0.5) * 0.25,
          wz + (Math.random() - 0.5) * 0.35,
          vx, vy, vz,
          life * (0.78 + Math.random() * 0.42),
          pSize,
          endSize,
          col.r * hdrBoost,
          col.g * hdrBoost,
          col.b * hdrBoost,
          kind,
          gravity,
          drag,
          baseFloor,
          bounce
        );
      }
    }

    spawnTrail(x, y, color = '#ffd54f', size = 3, life = 0.24) {
      let colStr = '#ffd54f';
      let sz = 3;
      let lf = 0.24;
      if (color && typeof color === 'object') {
        colStr = color.color || '#ffd54f';
        sz = color.size || 3;
        lf = color.life || 0.24;
      } else {
        colStr = color || '#ffd54f';
        sz = size > 0 ? size : 3;
        lf = life > 0 ? life : 0.24;
      }

      // Resolve true 3D height if this trail call comes from an active projectile
      // (prevents 2D `elevY = p.y - arcHeight` from spawning ground dots north of flying boulders!)
      let wx = this._toWorldX(x);
      let wz = this._toWorldZ(y);
      let wy = this._terrainY(x, y) + 1.15;

      const projs = this._lastGame && this._lastGame.towers && this._lastGame.towers.projectiles;
      if (Array.isArray(projs)) {
        for (let i = 0; i < projs.length; i++) {
          const pr = projs[i];
          if (!pr) continue;
          if (Math.abs(pr.x - x) < 1.5) {
            if (pr.kind === 'boulder' || pr.kind === 'mortar') {
              const t = clamp(pr.progress || 0, 0, 1);
              const elev2D = pr.y - (pr.arcHeight || 0) * 4 * t * (1 - t);
              if (Math.abs(elev2D - y) < 2.5) {
                // Dedicated 3D meteor emitter in _syncProjectiles already emits rich smoke & embers;
                // place a subtle crisp spark right on the true 3D boulder arc!
                const sGx = pr.tower ? pr.tower.x : pr.sx;
                const sGy = pr.tower ? pr.tower.y : (pr.sy + 14);
                const gx = sGx + (pr.tx - sGx) * t;
                const gy = sGy + (pr.ty - sGy) * t;
                const sWy = this._terrainY(sGx, sGy) + 2.85;
                const eWy = this._terrainY(pr.tx, pr.ty) + 0.28;
                wx = this._toWorldX(gx);
                wz = this._toWorldZ(gy);
                wy = sWy * (1 - t) + eWy * t + Math.max(6.2, (pr.arcHeight || 68) * 0.115) * 4 * t * (1 - t);
                break;
              }
            } else if (Math.abs(pr.y - y) < 1.5) {
              const vis = this._projVisMap.get(pr);
              if (vis && vis.root.visible) {
                wx = vis.root.position.x;
                wy = vis.root.position.y;
                wz = vis.root.position.z;
              }
              break;
            }
          }
        }
      }

      const c = parseColorRGB(colStr);
      this._spawnParticle3D(
        wx + (Math.random() - 0.5) * 0.16,
        wy + (Math.random() - 0.5) * 0.16,
        wz + (Math.random() - 0.5) * 0.16,
        (Math.random() - 0.5) * 1.1,
        0.3 + (Math.random() - 0.5) * 0.9,
        (Math.random() - 0.5) * 1.1,
        lf,
        Math.max(0.08, sz * 0.065),
        0.02,
        c.r * 1.7,
        c.g * 1.7,
        c.b * 1.7,
        'trail',
        0,
        2.0
      );
    }

    spawnFloatingText(x, y, text, color = '#ffffff', scale = 1) {
      if (text === undefined || text === null || text === '') return;
      const rawStr = String(text).trim();
      if (!rawStr) return;

      let colStr = '#ffffff';
      let effScale = 1;
      let customLife = 0;
      if (color && typeof color === 'object') {
        colStr = color.color || '#ffffff';
        effScale = color.scale || 1;
        customLife = color.life || 0;
      } else {
        colStr = color || '#ffffff';
        effScale = typeof scale === 'number' && scale > 0 ? scale : 1;
      }

      // Infer 3D anchor height & matched entity when callers pass 2D `y - offset`
      let gx = x;
      let gy = y + 14;
      let wy = 2.35;
      let matchedEnemy = null;

      const g = this._lastGame;
      if (g) {
        let matched = false;
        const enemies = g.enemies && g.enemies.active;
        if (Array.isArray(enemies)) {
          let bestD2 = 36 * 36;
          for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (!e) continue;
            const dx = e.x - x;
            const dy = (e.y - (e.radius || 12) - 8) - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
              bestD2 = d2;
              matchedEnemy = e;
              gx = e.x;
              gy = e.y;
              wy = this._enemyBarHeight(e) + 0.42;
              matched = true;
            }
          }
        }
        if (!matched && g.towers && Array.isArray(g.towers.towers)) {
          for (let i = 0; i < g.towers.towers.length; i++) {
            const tw = g.towers.towers[i];
            if (Math.abs(tw.x - x) < 18 && Math.abs((tw.y - 28) - y) < 22) {
              gx = tw.x;
              gy = tw.y;
              wy = this._towerMuzzleHeight(tw) + 0.85;
              matched = true;
              break;
            }
          }
        }
      }

      // Classify floating combat text for tick coalescing & AAA badge styling
      let kind = 'callout';
      let numVal = 0;
      let isBuff = false;

      const goldMatch = rawStr.match(/^\+\s*(\d+(?:\.\d+)?)\s*g$/i);
      const numMatch = !goldMatch ? rawStr.match(/^[+-]?\s*(\d+(?:\.\d+)?)\s*(!?)$/) : null;

      if (goldMatch) {
        kind = 'gold';
        numVal = parseFloat(goldMatch[1]) || 0;
      } else if (numMatch) {
        numVal = parseFloat(numMatch[1]) || 0;
        const isCrit = numMatch[2] === '!' || effScale >= 1.14 || numVal >= 85;
        kind = isCrit ? 'crit' : 'damage';
      } else {
        kind = 'callout';
        isBuff = /shield|star|anor|mithril|charge|horn|pierce|heal|ward|light/i.test(rawStr);
      }

      // 1. Coalesce rapid minor beam / oil / volley DoT ticks per enemy (0.26s window) into ONE clean number!
      if (kind === 'damage' || kind === 'crit') {
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
          const ex = this.floatingTexts[i];
          if ((ex.kind !== 'damage' && ex.kind !== 'crit') || ex.age > 0.26) continue;
          const sameTarget = matchedEnemy && ex.targetRef === matchedEnemy;
          const closeSpot = Math.hypot(ex.gx - gx, ex.gy - gy) <= 24;
          if (sameTarget || closeSpot) {
            ex.numVal += numVal;
            ex.hitCount += 1;
            if (kind === 'crit' || ex.numVal >= 95) {
              ex.kind = 'crit';
            }
            const rounded = Math.max(1, Math.round(ex.numVal));
            ex.text = ex.kind === 'crit' ? `${rounded}!` : String(rounded);
            if (matchedEnemy) {
              ex.gx = matchedEnemy.x;
              ex.gy = clamp(matchedEnemy.y, 10, LOGICAL_H - 10);
            }
            ex.age = Math.min(ex.age, 0.05);
            ex.life = Math.max(ex.life, ex.kind === 'crit' ? 0.96 : 0.82);
            ex.scale = clamp(Math.max(ex.scale, effScale), 0.85, 1.28);
            return;
          }
        }
      } else if (kind === 'gold') {
        // Coalesce rapid cluster kill-gold popups (+8g + +8g -> +16g) within 0.32s
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
          const ex = this.floatingTexts[i];
          if (ex.kind === 'gold' && ex.age <= 0.32 && Math.hypot(ex.gx - gx, ex.gy - gy) <= 38) {
            ex.numVal += numVal;
            ex.text = `+${Math.round(ex.numVal)}g`;
            ex.age = Math.min(ex.age, 0.05);
            return;
          }
        }
      } else {
        // Deduplicate simultaneous identical pack callouts (e.g. multiple Wargs shouting LEAP! together)
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
          const ex = this.floatingTexts[i];
          if (ex.kind === 'callout' && ex.text === rawStr && ex.age <= 0.48 && Math.hypot(ex.gx - gx, ex.gy - gy) <= 56) {
            ex.age = Math.min(ex.age, 0.06);
            return;
          }
        }
      }

      // Keep total simultaneous floating labels clean & readable (evict oldest minor damage tick first)
      if (this.floatingTexts.length >= 28) {
        let evictIdx = -1;
        for (let i = 0; i < this.floatingTexts.length; i++) {
          if (this.floatingTexts[i].kind === 'damage') {
            evictIdx = i;
            break;
          }
        }
        if (evictIdx < 0) evictIdx = 0;
        const victim = this.floatingTexts[evictIdx];
        this.floatingTexts.splice(evictIdx, 1);
        this.textPool.release(victim);
      }

      // 2. Spatial anti-overlap stagger at spawn (check existing active floating texts within 28-32px)
      let nearbyCount = 0;
      for (let i = 0; i < this.floatingTexts.length; i++) {
        const ex = this.floatingTexts[i];
        if (Math.hypot(ex.gx - gx, ex.gy - gy) < 32) {
          nearbyCount++;
        }
      }
      const staggerPattern = [0, -15, 15, -25, 25, -9, 9];
      const slotOffset = staggerPattern[nearbyCount % staggerPattern.length];

      this._evictOldestIfFull(this.floatingTexts, this.textPool, MAX_TEXTS);
      const t = this.textPool.acquire();
      t.spawnId = this._nextTextSpawnId++;
      t.targetRef = matchedEnemy;
      t.kind = kind;
      t.numVal = numVal;
      t.hitCount = 1;
      t.isBuff = isBuff;
      t.staggerX = slotOffset;

      t.gx = gx + slotOffset * 0.35;
      t.gy = clamp(gy, 10, LOGICAL_H - 10);
      t.wy = wy + (kind === 'callout' ? 0.58 : 0) + Math.min(3, nearbyCount) * 0.36;
      t.vx = slotOffset * 0.18;
      t.vyWorld = kind === 'callout' ? 2.15 : 2.55;
      t.age = 0;
      t.color = colStr;
      t.scale = clamp(effScale, 0.85, 1.32);
      t.life = customLife > 0 ? customLife : (kind === 'callout' ? 1.02 : (kind === 'crit' ? 0.94 : 0.78));
      t.text = kind === 'damage' ? String(Math.max(1, Math.round(numVal))) : (kind === 'crit' && numMatch ? `${Math.max(1, Math.round(numVal))}!` : rawStr);
      this.floatingTexts.push(t);
    }

    _resolve3DEndpoint(x, y, otherX, otherY, isSource) {
      const g = this._lastGame;
      if (g) {
        // 1. Check sky strike (e.g. Tempest of Manwë `y1 = Math.max(10, e.y - 250)`)
        if (isSource && otherY - y > 165 && Math.abs(otherX - x) < 42) {
          return {
            wx: this._toWorldX(x),
            wy: 24.5,
            wz: this._toWorldZ(otherY - 12),
            isTowerOrSky: true
          };
        }

        // 2. Check Istari Spire / Tower crystal peak (`y = tower.y - 28`)
        if (isSource && g.towers && Array.isArray(g.towers.towers)) {
          for (let i = 0; i < g.towers.towers.length; i++) {
            const tw = g.towers.towers[i];
            if (Math.abs(tw.x - x) < 8 && Math.abs((tw.y - 28) - y) < 12) {
              return {
                wx: this._toWorldX(tw.x),
                wy: this._terrainY(tw.x, tw.y) + this._towerMuzzleHeight(tw),
                wz: this._toWorldZ(tw.y),
                isTowerOrSky: true
              };
            }
          }
        }

        // 3. Check live enemy target (ground or flying Fell Beast at y = 6.5!)
        if (g.enemies && Array.isArray(g.enemies.active)) {
          let best = null;
          let bestD2 = 18 * 18;
          for (let i = 0; i < g.enemies.active.length; i++) {
            const e = g.enemies.active[i];
            if (!e) continue;
            const dx = e.x - x;
            const dy = e.y - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
              bestD2 = d2;
              best = e;
            }
          }
          if (best) {
            return {
              wx: this._toWorldX(best.x),
              wy: this._terrainY(best.x, best.y) + this._enemyHitHeight(best),
              wz: this._toWorldZ(best.y),
              isTowerOrSky: false
            };
          }
        }
      }

      return {
        wx: this._toWorldX(x),
        wy: this._terrainY(x, y) + (isSource ? 2.4 : 1.15),
        wz: this._toWorldZ(y),
        isTowerOrSky: false
      };
    }

    spawnLightningArc(x1, y1, x2, y2, color = '#7fd4ff') {
      if (!this.THREE || !this.lightningPool) return;
      this._evictOldestIfFull(this.lightnings, this.lightningPool, MAX_LIGHTNINGS);
      const l = this.lightningPool.acquire();

      const p1 = this._resolve3DEndpoint(x1, y1, x2, y2, true);
      const p2 = this._resolve3DEndpoint(x2, y2, x1, y1, false);

      const c = parseColorRGB(color || '#7fd4ff');
      l.r = c.r;
      l.g = c.g;
      l.b = c.b;
      l.age = 0;
      l.life = 0.24;

      const dx = p2.wx - p1.wx;
      const dy = p2.wy - p1.wy;
      const dz = p2.wz - p1.wz;
      const dist = Math.hypot(dx, dy, dz) || 1;
      const jitter = clamp(dist * 0.12, 0.45, 2.2);

      // Orthonormal basis perpendicular to chord
      let ux = -dz;
      let uy = 0;
      let uz = dx;
      const uLen = Math.hypot(ux, uz);
      if (uLen > 1e-4) {
        ux /= uLen;
        uz /= uLen;
      } else {
        ux = 1;
        uz = 0;
      }
      // Second perpendicular vector V = normalize(D x U)
      let vx = dy * uz - dz * uy;
      let vy = dz * ux - dx * uz;
      let vz = dx * uy - dy * ux;
      const vLen = Math.hypot(vx, vy, vz) || 1;
      vx /= vLen; vy /= vLen; vz /= vLen;

      // Strand 1: Primary 10-segment 3D jagged lightning bolt
      for (let i = 0; i <= 10; i++) {
        const f = i / 10;
        const env = Math.sin(f * Math.PI);
        const j1 = (i === 0 || i === 10) ? 0 : (Math.random() * 2 - 1) * jitter * env;
        const j2 = (i === 0 || i === 10) ? 0 : (Math.random() * 2 - 1) * jitter * 0.75 * env;
        l.mainX[i] = p1.wx + dx * f + ux * j1 + vx * j2;
        l.mainY[i] = p1.wy + dy * f + uy * j1 + vy * j2;
        l.mainZ[i] = p1.wz + dz * f + uz * j1 + vz * j2;
      }

      // Strand 2: Secondary intertwined jagged arc
      for (let i = 0; i <= 8; i++) {
        const f = i / 8;
        const env = Math.sin(f * Math.PI);
        const j1 = (i === 0 || i === 8) ? 0 : (Math.random() * 2 - 1) * jitter * 1.15 * env;
        const j2 = (i === 0 || i === 8) ? 0 : (Math.random() * 2 - 1) * jitter * 0.85 * env;
        l.altX[i] = p1.wx + dx * f + ux * j1 + vx * j2;
        l.altY[i] = p1.wy + dy * f + uy * j1 + vy * j2;
        l.altZ[i] = p1.wz + dz * f + uz * j1 + vz * j2;
      }

      // Branching 3D forks 1 & 2
      const buildFork = (fx, fy, fz, startIdx, side) => {
        fx[0] = l.mainX[startIdx];
        fy[0] = l.mainY[startIdx];
        fz[0] = l.mainZ[startIdx];
        for (let k = 1; k < 4; k++) {
          const stepF = 0.11;
          fx[k] = fx[k - 1] + dx * stepF + ux * side * jitter * (0.48 + Math.random() * 0.35);
          fy[k] = Math.max(0.25, fy[k - 1] + dy * stepF - 0.35 * k);
          fz[k] = fz[k - 1] + dz * stepF + uz * side * jitter * (0.48 + Math.random() * 0.35);
        }
      };
      const s1 = Math.random() < 0.5 ? -1 : 1;
      buildFork(l.f1X, l.f1Y, l.f1Z, 4, s1);
      buildFork(l.f2X, l.f2Y, l.f2Z, 6, -s1);

      l.srcFlare.position.set(p1.wx, p1.wy, p1.wz);
      l.hitFlare.position.set(p2.wx, p2.wy, p2.wz);
      this._refreshLightningGeometry(l, this.lightnings.length);
      this.lightnings.push(l);

      // Ground plasma burst & PointLight flash on primary lightning strikes (matching reference image!)
      if (p1.isTowerOrSky) {
        this._triggerLightFlash(p2.wx, p2.wy + 1.4, p2.wz, '#8be0ff', 4.2, 20, 0.22);
        this.spawnBurst(x2, y2, {
          kind: 'fire',
          color: '#ffab40',
          count: 8,
          speed: 95,
          size: 3.4,
          life: 0.32
        });
        this.spawnBurst(x2, y2, {
          kind: 'spark',
          color: '#b3ecff',
          count: 7,
          speed: 130,
          size: 2.6,
          life: 0.28
        });
      }
    }

    spawnBeam(x1, y1, x2, y2, intensity = 1, color = '#ff7b29') {
      if (!this.THREE || !this.beamPool) return;
      const col = color || '#ff7b29';
      const inten = typeof intensity === 'number' && intensity > 0 ? intensity : 1;

      // If this tower is already rendered continuously by _syncContinuousAnorBeams, just trigger impact light & sparks!
      if (this._lastGame && this._lastGame.towers && Array.isArray(this._lastGame.towers.towers)) {
        for (let i = 0; i < this._lastGame.towers.towers.length; i++) {
          const tw = this._lastGame.towers.towers[i];
          if (
            tw &&
            tw.type === 'istari' &&
            tw.tier === 3 &&
            tw.branch === 'A' &&
            Math.abs(tw.x - x1) < 4 &&
            Math.abs((tw.y - 28) - y1) < 8
          ) {
            const p2 = this._resolve3DEndpoint(x2, y2, x1, y1, false);
            this._triggerLightFlash(p2.wx, p2.wy + 1.0, p2.wz, col, Math.min(0.68, 0.35 + inten * 0.12), 8.5, 0.09);
            return;
          }
        }
      }

      // Deduplicate rapid-tick beams from same source
      for (let i = 0; i < this.beams.length; i++) {
        const existing = this.beams[i];
        if (
          existing.age < 0.06 &&
          existing.color === col &&
          Math.abs(existing.x1 - x1) < 3 &&
          Math.abs(existing.y1 - y1) < 3
        ) {
          const p2 = this._resolve3DEndpoint(x2, y2, x1, y1, false);
          existing.x2 = x2;
          existing.y2 = y2;
          existing.wx2 = p2.wx;
          existing.wy2 = p2.wy;
          existing.wz2 = p2.wz;
          existing.intensity = inten;
          existing.age = 0;
          return;
        }
      }

      this._evictOldestIfFull(this.beams, this.beamPool, MAX_BEAMS);
      const b = this.beamPool.acquire();
      const p1 = this._resolve3DEndpoint(x1, y1, x2, y2, true);
      const p2 = this._resolve3DEndpoint(x2, y2, x1, y1, false);

      b.x1 = x1; b.y1 = y1; b.x2 = x2; b.y2 = y2;
      b.wx1 = p1.wx; b.wy1 = p1.wy; b.wz1 = p1.wz;
      b.wx2 = p2.wx; b.wy2 = p2.wy; b.wz2 = p2.wz;
      b.intensity = inten;
      b.color = col;
      b.age = 0;
      b.life = 0.22;
      this._positionBeamMesh(b, 1.0);
      this.beams.push(b);

      this._triggerLightFlash(p2.wx, p2.wy + 1.0, p2.wz, col, Math.min(0.72, 0.38 + inten * 0.12), 8.5, 0.09);
    }

    spawnShockwave(x, y, maxRadius = 80, color = '#ff9e40', duration = 0.45) {
      if (!this.THREE || !this.shockwavePool) return;
      this._evictOldestIfFull(this.shockwaves, this.shockwavePool, MAX_SHOCKWAVES);
      const s = this.shockwavePool.acquire();

      s.wx = this._toWorldX(x);
      s.wz = this._toWorldZ(y);
      s.wy = this._terrainY(x, y) + 0.13;
      s.maxRadiusWorld = Math.max(1.2, (maxRadius > 0 ? maxRadius : 80) * WORLD_SCALE);
      s.age = 0;
      s.life = duration > 0 ? duration : 0.45;

      const c = parseColorRGB(color || '#ff9e40');
      s.ringMat.color.setRGB(c.r * 1.08, c.g * 1.08, c.b * 1.08);
      s.discMat.color.setRGB(c.r * 0.85, c.g * 0.85, c.b * 0.85);
      s.group.visible = true;
      s.group.position.set(s.wx, s.wy, s.wz);
      s.group.scale.set(0.25, 1, 0.25);

      this.shockwaves.push(s);
    }

    _spawnFireballFlash(wx, wy, wz, maxR, life) {
      if (!this.explosionPool) return;
      this._evictOldestIfFull(this.explosions, this.explosionPool, MAX_EXPLOSIONS);
      const ex = this.explosionPool.acquire();
      const clampedR = Math.min(2.3, maxR);
      ex.group.position.set(wx, wy, wz);
      ex.maxR = clampedR;
      ex.age = 0;
      ex.life = life || 0.30;
      ex.core.scale.setScalar(Math.max(0.08, clampedR * 0.42));
      ex.shell.scale.setScalar(Math.max(0.15, clampedR * 0.32));
      ex.coreMat.opacity = 0.58;
      ex.shellMat.opacity = 0.44;
      ex.group.visible = true;
      this.explosions.push(ex);
    }

    spawnExplosion(x, y, radius = 65, color = '#ff7b29') {
      const rPx = radius > 0 ? radius : 65;
      const wx = this._toWorldX(x);
      const wz = this._toWorldZ(y);
      const wy = this._terrainY(x, y);

      if (this.THREE) {
        this._spawnFireballFlash(wx, wy + 0.72, wz, Math.min(2.3, Math.max(1.3, rPx * WORLD_SCALE * 0.32)), 0.30);
        this._triggerLightFlash(wx, wy + 2.2, wz, color || '#ff7b29', 2.8, 18, 0.28);
      }

      this.spawnShockwave(x, y, rPx, color, 0.44);
      this.spawnBurst(x, y, { kind: 'fire', color, count: 14, speed: rPx * 1.55, size: 4.2, life: 0.48 });
      this.spawnBurst(x, y, { kind: 'smoke', count: 10, speed: rPx * 0.72, size: 7.2, life: 0.85 });
      this.spawnBurst(x, y, { kind: 'stone', count: 8, speed: rPx * 1.45, size: 3.2, life: 0.52 });
      this.spawnBurst(x, y, { kind: 'spark', color: '#ffe082', count: 10, speed: rPx * 1.85, size: 2.6, life: 0.36 });
    }

    spawnLightOfEarendil(x, y, radius = 150) {
      const rPx = radius > 0 ? radius : 150;
      if (this.THREE && this.earendilPool) {
        this._evictOldestIfFull(this.earendils, this.earendilPool, MAX_EARENDILS);
        const e = this.earendilPool.acquire();
        e.gx = x;
        e.gy = y;
        e.wx = this._toWorldX(x);
        e.wz = this._toWorldZ(y);
        e.wy = this._terrainY(x, y);
        e.radiusWorld = rPx * WORLD_SCALE;
        e.age = 0;
        e.life = 1.48;
        this._refreshEarendilTransform(e);
        this.earendils.push(e);

        this._triggerLightFlash(e.wx, e.wy + 5.5, e.wz, '#b3ecff', 5.2, e.radiusWorld * 2.1, 1.35);
      }

      this.spawnShockwave(x, y, rPx, '#9be7ff', 0.68);
      this.spawnBurst(x, y, {
        kind: 'magic',
        color: '#e0f7fa',
        count: 26,
        speed: 145,
        size: 4.0,
        life: 0.92
      });
    }

    spawnGreatEagles(x, y, dirAngle = 0) {
      if (!this.THREE || !this.eaglePool) return;
      this._evictOldestIfFull(this.eagles, this.eaglePool, MAX_EAGLES);
      const eg = this.eaglePool.acquire();
      eg.wx = this._toWorldX(x);
      eg.wz = this._toWorldZ(y);
      eg.dirAngle = typeof dirAngle === 'number' ? dirAngle : 0;
      eg.cos = Math.cos(eg.dirAngle);
      eg.sin = Math.sin(eg.dirAngle);
      eg.yaw = HALF_PI - eg.dirAngle; // Local +Z faces along (cos, 0, sin)
      eg.age = 0;
      eg.life = 1.68;

      for (let k = 0; k < eg.streaks.length; k++) {
        eg.streakAlong[k] = (Math.random() - 0.5) * 46;
        eg.streakPerp[k] = (Math.random() - 0.5) * 16;
        eg.streakAlt[k] = 7.4 + Math.random() * 2.8;
        eg.streakLen[k] = 5.5 + Math.random() * 7.5;
      }

      this._refreshEagleTransform(eg);
      this.eagles.push(eg);
    }

    // Legacy 2D Canvas hooks kept as safe no-ops in 3D mode (all world effects render in WebGL,
    // while crisp screen-projected combat numbers & health bars render via renderOverlay2D!)
    renderGround() {}
    renderAir() {}

    // ==========================================================================
    // 4. Crisp Screen-Projected 2D Combat Numbers, Health Bars & Status Badges
    // ==========================================================================
    _projectPoint(scene3d, gx, gy, extraY, scaleX, scaleY, effW, effH) {
      if (scene3d && typeof scene3d.projectToScreen === 'function') {
        const pt = scene3d.projectToScreen(gx, gy, extraY || 0);
        if (!pt || pt.visible === false) return null;
        const sx = pt.x * scaleX;
        const sy = pt.y * scaleY;
        if (sx < -80 || sx > effW + 80 || sy < -80 || sy > effH + 80) return null;
        return { x: sx, y: sy };
      }
      return {
        x: (gx / LOGICAL_W) * effW,
        y: ((gy - (extraY || 0) * 10) / LOGICAL_H) * effH
      };
    }

    renderOverlay2D(ctx, time, game) {
      if (!ctx) return;
      const g = game || this._lastGame;
      const tNow = typeof time === 'number' ? time : this.time;
      const s3d = (g && g.scene3d) || this.scene3d;

      const canvas = ctx.canvas;
      const clientW = (s3d && s3d.viewportWidth) || (canvas && canvas.clientWidth) || (typeof window !== 'undefined' && window.innerWidth) || (canvas && canvas.width) || LOGICAL_W;
      const clientH = (s3d && s3d.viewportHeight) || (canvas && canvas.clientHeight) || (typeof window !== 'undefined' && window.innerHeight) || (canvas && canvas.height) || LOGICAL_H;

      let tfA = 1;
      let tfD = 1;
      if (typeof ctx.getTransform === 'function') {
        const tf = ctx.getTransform();
        if (tf && tf.a > 0) tfA = tf.a;
        if (tf && tf.d > 0) tfD = tf.d;
      }
      const effW = ((canvas && canvas.width) || clientW) / tfA;
      const effH = ((canvas && canvas.height) || clientH) / tfD;
      const scaleX = effW / Math.max(1, clientW);
      const scaleY = effH / Math.max(1, clientH);
      // Calibrated so 1080p renders exact 32x4px infantry & 48x5px Troll/elite miniature bars!
      const barScale = clamp(effH / 1080, 0.85, 1.15);

      const placedBoxes = this._overlayBoxes || (this._overlayBoxes = []);
      placedBoxes.length = 0;

      const drawRoundedPill = (cx, cy, w, h, r) => {
        const x0 = cx - w * 0.5;
        const y0 = cy - h * 0.5;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x0, y0, w, h, r);
        } else {
          ctx.rect(x0, y0, w, h);
        }
      };

      ctx.save();

      // 1. Garrison Soldier Sleek Miniature Health Bars (only when hurt or Shield Wall active) + Cursed Tower Badges
      if (g && g.towers && Array.isArray(g.towers.towers) && (g.state === 'playing' || g.state === 'paused')) {
        const towers = g.towers.towers;
        for (let i = 0; i < towers.length; i++) {
          const tw = towers[i];
          if (!tw) continue;

          if (tw.type === 'garrison' && Array.isArray(tw.soldiers)) {
            const isKnight = tw.tier === 3 && tw.branch === 'B';
            for (let j = 0; j < tw.soldiers.length; j++) {
              const s = tw.soldiers[j];
              if (!s || s.dead) continue;
              if (s.hp >= s.maxHp * 0.995 && !(s.shieldWallTimer > 0)) continue;

              const sp = this._projectPoint(s3d, s.x, s.y, isKnight ? 2.55 : 2.15, scaleX, scaleY, effW, effH);
              if (!sp) continue;

              const bw = Math.round(24 * barScale);
              const bh = Math.max(3, Math.round(3.2 * barScale));
              const bx = Math.round(sp.x - bw * 0.5);
              const by = Math.round(sp.y);
              const ratio = clamp(s.hp / Math.max(1, s.maxHp), 0, 1);

              ctx.fillStyle = 'rgba(10, 10, 12, 0.92)';
              ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
              ctx.strokeStyle = 'rgba(72, 66, 56, 0.78)';
              ctx.lineWidth = 0.8;
              ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);

              ctx.fillStyle = 'rgba(22, 30, 22, 0.85)';
              ctx.fillRect(bx, by, bw, bh);

              ctx.fillStyle = s.shieldWallTimer > 0 ? '#e6c15c' : (ratio > 0.45 ? '#5cb860' : '#eb9834');
              ctx.fillRect(bx, by, Math.round(bw * ratio), bh);
            }
          }

          // Boss-cursed tower "CLICK x3!" high-contrast serif plaque (registered in placedBoxes so numbers never collide!)
          if (tw.curseClicksRemaining > 0 && tw.stunTimer > 0) {
            const tp = this._projectPoint(s3d, tw.x, tw.y, this._towerMuzzleHeight(tw) + 0.95, scaleX, scaleY, effW, effH);
            if (tp) {
              const pulse = 1 + 0.06 * Math.sin(tNow * 12);
              const pw = Math.round(88 * barScale * pulse);
              const ph = Math.round(22 * barScale * pulse);
              ctx.save();
              ctx.translate(tp.x, tp.y);
              ctx.fillStyle = 'rgba(20, 8, 8, 0.92)';
              ctx.strokeStyle = '#e67e22';
              ctx.lineWidth = 1.6;
              drawRoundedPill(0, 0, pw, ph, 5);
              ctx.fill();
              ctx.stroke();

              ctx.fillStyle = '#ffe082';
              ctx.font = `700 ${Math.round(11.5 * barScale * pulse)}px "Cinzel", "Palatino Linotype", Georgia, serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(`CLICK x${tw.curseClicksRemaining}!`, 0, 0.5);
              ctx.restore();

              placedBoxes.push({
                x: tp.x,
                y: tp.y,
                hw: pw * 0.5 + 8,
                hh: ph * 0.5 + 6
              });
            }
          }
        }
      }

      // 2. Sleek Miniature Dark-Iron & Crimson Enemy Health Bars (32x4px infantry, 48x5px Trolls/elites, hidden at 100% HP!)
      if (g && g.enemies && Array.isArray(g.enemies.active) && g.state !== 'title') {
        const active = g.enemies.active;
        for (let i = 0; i < active.length; i++) {
          const e = active[i];
          if (!e || e.dead || e.reachedExit || e.hp <= 0) continue;

          // Hide health bars on 100%-HP unhurt non-boss mobs so freshly spawned columns look cinematic!
          const isDamaged = e.hp < e.maxHp * 0.999;
          const showBar = (
            e.isBoss ||
            isDamaged ||
            e.armorShred > 0 ||
            e.stunTimer > 0
          );
          if (!showBar) continue;

          const ep = this._projectPoint(s3d, e.x, e.y, this._enemyBarHeight(e), scaleX, scaleY, effW, effH);
          if (!ep) continue;

          const isElite = e.type === 'troll' || e.type === 'ringwraith' || e.type === 'fellbeast' || e.type === 'uruk';
          const bw = Math.round((e.isBoss ? 62 : (isElite ? 48 : 32)) * barScale);
          const bh = Math.max(4, Math.round((e.isBoss ? 6 : (isElite ? 5 : 4)) * barScale));
          const bx = Math.round(ep.x - bw * 0.5);
          const by = Math.round(ep.y - bh * 0.5);
          const ratio = clamp(e.hp / Math.max(1, e.maxHp), 0, 1);

          // Forged dark-iron outer frame + deep blood-obsidian depleted track (matching reference image!)
          ctx.fillStyle = 'rgba(10, 8, 8, 0.94)';
          ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
          ctx.strokeStyle = e.isBoss ? 'rgba(214, 172, 82, 0.88)' : 'rgba(64, 52, 42, 0.85)';
          ctx.lineWidth = 1;
          ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);

          ctx.fillStyle = 'rgba(42, 10, 10, 0.90)';
          ctx.fillRect(bx, by, bw, bh);

          // Rich crimson enamel HP fill + crisp 1px specular top edge
          let fillCol = '#cc241d';
          let hiCol = '#ff7668';
          if (e.isBoss) {
            if (e.type === 'balrog') {
              fillCol = e.phase === 2 ? '#e64a19' : '#26a69a';
              hiCol = e.phase === 2 ? '#ffab66' : '#80cbc4';
            } else {
              fillCol = '#8e24aa';
              hiCol = '#ce93d8';
            }
          }
          const fillW = Math.max(0, Math.round(bw * ratio));
          if (fillW > 0) {
            ctx.fillStyle = fillCol;
            ctx.fillRect(bx, by, fillW, bh);
            ctx.fillStyle = hiCol;
            ctx.globalAlpha = 0.45;
            ctx.fillRect(bx, by, fillW, 1);
            ctx.globalAlpha = 1;
          }

          // Sleek miniature status micro-badges beside health bar
          if (e.armorShred > 0) {
            const sx = bx - 5.5 * barScale;
            const sy = by + bh * 0.5;
            ctx.save();
            ctx.translate(sx, sy);
            ctx.scale(barScale * 0.88, barScale * 0.88);
            ctx.fillStyle = '#e8aa48';
            ctx.strokeStyle = '#2b1b16';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-3.5, -3.5);
            ctx.lineTo(3.5, -3.5);
            ctx.lineTo(3.0, 0.8);
            ctx.lineTo(0, 3.8);
            ctx.lineTo(-3.0, 0.8);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }

          let rightX = bx + bw + 4.5 * barScale;
          const midY = by + bh * 0.5;

          if (e.type === 'troll' && isDamaged) {
            ctx.fillStyle = e.fireSuppressTimer > 0 ? '#ff7043' : '#66bb6a';
            ctx.beginPath();
            ctx.arc(rightX, midY, 2.2 * barScale, 0, TAU);
            ctx.fill();
            rightX += 5.5 * barScale;
          }
          if (e.stunTimer > 0) {
            ctx.fillStyle = '#ffe082';
            ctx.beginPath();
            ctx.arc(rightX, midY, 2.2 * barScale, 0, TAU);
            ctx.fill();
            rightX += 5.5 * barScale;
          }
          if (e.slowTimer > 0) {
            ctx.fillStyle = '#64b5f6';
            ctx.beginPath();
            ctx.moveTo(rightX, midY - 2.6 * barScale);
            ctx.lineTo(rightX + 2.2 * barScale, midY);
            ctx.lineTo(rightX, midY + 2.6 * barScale);
            ctx.lineTo(rightX - 2.2 * barScale, midY);
            ctx.closePath();
            ctx.fill();
            rightX += 5.5 * barScale;
          }
          if (e.bleedTimer > 0) {
            ctx.fillStyle = '#ef5350';
            ctx.beginPath();
            ctx.arc(rightX, midY, 2.0 * barScale, 0, TAU);
            ctx.fill();
          }
        }
      }

      // 3. Anti-Overlap Spatial-Bucketed Floating Combat Numbers & Serif Callout Badges
      if (this.floatingTexts.length > 0) {
        const order = this._textSortBuf || (this._textSortBuf = []);
        order.length = 0;
        for (let i = 0; i < this.floatingTexts.length; i++) {
          const t = this.floatingTexts[i];
          const u = t.age / t.life;
          if (u >= 0 && u < 1) order.push(t);
        }

        // Deterministic priority order: callouts -> gold -> crits -> damage, tie-broken by spawnId (zero frame-to-frame slot swap!)
        const rankOf = (k) => (k === 'callout' ? 0 : (k === 'gold' ? 1 : (k === 'crit' ? 2 : 3)));
        order.sort((a, b) => {
          const dr = rankOf(a.kind) - rankOf(b.kind);
          return dr !== 0 ? dr : (a.spawnId - b.spawnId);
        });

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';

        const minSepPx = 28 * barScale;

        for (let i = 0; i < order.length; i++) {
          const t = order[i];
          const u = t.age / t.life;
          const pt = this._projectPoint(s3d, t.gx, t.gy, t.wy, scaleX, scaleY, effW, effH);
          if (!pt) continue;

          const pop = u < 0.12
            ? 0.88 + (u / 0.12) * 0.22
            : 1.10 - Math.min(0.10, (u - 0.12) * 0.25);
          const alpha = u > 0.68 ? (1 - u) / 0.32 : 1;

          let fontPx = 12;
          if (t.kind === 'callout') {
            fontPx = Math.max(10, Math.round(11.0 * pop * barScale));
          } else if (t.kind === 'crit') {
            fontPx = Math.max(12, Math.round(13.5 * Math.min(1.22, t.scale) * pop * barScale));
          } else if (t.kind === 'gold') {
            fontPx = Math.max(11, Math.round(12.0 * pop * barScale));
          } else {
            fontPx = Math.max(11, Math.round(11.8 * Math.min(1.15, t.scale) * pop * barScale));
          }

          ctx.font = `700 ${fontPx}px "Cinzel", "Palatino Linotype", Georgia, serif`;
          const metricsW = ctx.measureText(t.text).width;
          const padX = (t.kind === 'callout' ? 8 : (t.kind === 'gold' ? 7 : 5.5)) * barScale;
          const pillW = Math.max(22 * barScale, metricsW + padX * 2);
          const pillH = (fontPx + (t.kind === 'callout' ? 7 : 5) * barScale);
          const halfW = pillW * 0.5;
          const halfH = pillH * 0.5;

          let sx = pt.x + (t.staggerX || 0) * 0.45 * barScale;
          let sy = pt.y;

          // Enforce >= 28px spatial bucketing & non-overlapping pill boxes cleanly!
          const staggerDir = (t.spawnId & 1) === 0 ? -1 : 1;
          for (let pass = 0; pass < 7; pass++) {
            let hit = null;
            for (let bIdx = 0; bIdx < placedBoxes.length; bIdx++) {
              const b = placedBoxes[bIdx];
              const dx = sx - b.x;
              const dy = sy - b.y;
              if (
                (Math.abs(dx) < halfW + b.hw + 3 && Math.abs(dy) < halfH + b.hh + 2) ||
                (dx * dx + dy * dy < minSepPx * minSepPx && Math.abs(dy) < minSepPx * 0.78)
              ) {
                hit = b;
                break;
              }
            }
            if (!hit) break;
            sy = hit.y - hit.hh - halfH - 3 * barScale;
            sx += staggerDir * 7 * barScale;
          }

          placedBoxes.push({ x: sx, y: sy, hw: halfW, hh: halfH });
          ctx.globalAlpha = alpha;

          if (t.kind === 'callout') {
            // Crisp dark-iron & gold/crimson serif callout plaque (e.g. SHIELD WALL!, RAGE!, LEAP!)
            drawRoundedPill(sx, sy, pillW, pillH, 4 * barScale);
            ctx.fillStyle = t.isBuff ? 'rgba(12, 15, 18, 0.86)' : 'rgba(22, 10, 10, 0.86)';
            ctx.fill();
            ctx.lineWidth = 1.1;
            ctx.strokeStyle = t.isBuff ? 'rgba(222, 184, 96, 0.88)' : 'rgba(214, 92, 58, 0.88)';
            ctx.stroke();

            ctx.fillStyle = t.isBuff ? '#fff0c2' : '#ffd2ba';
            ctx.fillText(t.text, sx, sy + 0.5);
          } else if (t.kind === 'crit') {
            // Subtle dark pill with burnished gold rim & radiant gold serif numeral
            drawRoundedPill(sx, sy, pillW, pillH, 4 * barScale);
            ctx.fillStyle = 'rgba(14, 10, 8, 0.78)';
            ctx.fill();
            ctx.lineWidth = 1.0;
            ctx.strokeStyle = 'rgba(232, 190, 92, 0.76)';
            ctx.stroke();

            ctx.fillStyle = '#ffe28a';
            ctx.fillText(t.text, sx, sy + 0.5);
          } else if (t.kind === 'gold') {
            // Subtle dark coin pill + golden bounty numeral
            drawRoundedPill(sx, sy, pillW, pillH, 4 * barScale);
            ctx.fillStyle = 'rgba(16, 12, 7, 0.78)';
            ctx.fill();
            ctx.lineWidth = 0.9;
            ctx.strokeStyle = 'rgba(218, 175, 72, 0.62)';
            ctx.stroke();

            ctx.fillStyle = '#ffd54f';
            ctx.fillText(t.text, sx, sy + 0.5);
          } else {
            // Standard hit number: subtle smoky dark pill backing + crisp serif numeral
            drawRoundedPill(sx, sy, pillW, pillH, 3.5 * barScale);
            ctx.fillStyle = 'rgba(10, 10, 13, 0.62)';
            ctx.fill();

            ctx.lineWidth = 2.0;
            ctx.strokeStyle = 'rgba(6, 8, 11, 0.92)';
            ctx.strokeText(t.text, sx, sy + 0.5);
            ctx.fillStyle = (!t.color || t.color === '#ffffff') ? '#f2ead9' : t.color;
            ctx.fillText(t.text, sx, sy + 0.5);
          }
        }
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  TD.VFX3D = VFX3D;
})(window.TD = window.TD || {});
