(function(TD) {
  'use strict';

  const TWO_PI = Math.PI * 2;
  const HALF_PI = Math.PI * 0.5;

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function hash2(x, y, seed) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function smoothNoise(u, v, freq, seed) {
    const x = u * freq;
    const y = v * freq;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const wx0 = ((ix % freq) + freq) % freq;
    const wx1 = (((ix + 1) % freq) + freq) % freq;
    const wy0 = ((iy % freq) + freq) % freq;
    const wy1 = (((iy + 1) % freq) + freq) % freq;
    const n00 = hash2(wx0, wy0, seed);
    const n10 = hash2(wx1, wy0, seed);
    const n01 = hash2(wx0, wy1, seed);
    const n11 = hash2(wx1, wy1, seed);
    return lerp(lerp(n00, n10, ux), lerp(n01, n11, ux), uy);
  }

  function fbm2(u, v, baseFreq, octaves, seed) {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    let f = baseFreq;
    for (let i = 0; i < octaves; i++) {
      sum += amp * smoothNoise(u, v, f, seed + i * 97);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / (norm || 1);
  }

  function worley2(u, v, cells, seed) {
    const x = u * cells;
    const y = v * cells;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let d1 = 1e9;
    let d2 = 1e9;
    let id = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx;
        const cy = iy + dy;
        const wx = ((cx % cells) + cells) % cells;
        const wy = ((cy % cells) + cells) % cells;
        const px = cx + 0.5 + (hash2(wx, wy, seed + 13) - 0.5) * 0.85;
        const py = cy + 0.5 + (hash2(wx, wy, seed + 59) - 0.5) * 0.85;
        const dsq = (x - px) * (x - px) + (y - py) * (y - py);
        if (dsq < d1) {
          d2 = d1;
          d1 = dsq;
          id = hash2(wx, wy, seed + 101);
        } else if (dsq < d2) {
          d2 = dsq;
        }
      }
    }
    const f1 = Math.sqrt(d1);
    const f2 = Math.sqrt(d2);
    return { f1, f2, edge: f2 - f1, id };
  }

  function meleeArmPitch(atkTimer, duration) {
    if (!(atkTimer > 0)) return 0;
    const u = clamp(1 - atkTimer / (duration || 0.28), 0, 1);
    if (u < 0.30) return lerp(0, -2.15, u / 0.30);
    if (u < 0.65) return lerp(-2.15, -0.52, (u - 0.30) / 0.35);
    return lerp(-0.52, 0, (u - 0.65) / 0.35);
  }

  // ============================================================================
  // 1. COMPLETE ROSTER OF 10 ENEMY & BOSS STUDIO VARIANTS
  // ============================================================================
  const ENEMY_VARIANTS = [
    { key: 'goblin',     type: 'goblin',     id: 'goblin',     phase: 1, name: 'Goblin Scavenger',        label: 'Goblin Scavenger',        role: 'Swarm Runner' },
    { key: 'orc',        type: 'orc',        id: 'orc',        phase: 1, name: 'Orc Infantry',            label: 'Orc Infantry',            role: 'Armored Footman' },
    { key: 'uruk',       type: 'uruk',       id: 'uruk',       phase: 1, name: 'Uruk-hai Berserker',      label: 'Uruk-hai Berserker',      role: 'Shock Infantry' },
    { key: 'warg',       type: 'warg',       id: 'warg',       phase: 1, name: 'Warg Rider',              label: 'Warg Rider',              role: 'Fast Cavalry' },
    { key: 'troll',      type: 'troll',      id: 'troll',      phase: 1, name: 'Olog-hai Siege Troll',    label: 'Olog-hai Siege Troll',    role: 'Living Battering Ram' },
    { key: 'wraith',     type: 'wraith',     id: 'wraith',     phase: 1, name: 'Shadow Wraith',           label: 'Shadow Wraith',           role: 'Spectral Assassin' },
    { key: 'fellbeast',  type: 'fellbeast',  id: 'fellbeast',  phase: 1, name: 'Fell Beast',              label: 'Fell Beast',              role: 'Aerial Predator' },
    { key: 'ringwraith', type: 'ringwraith', id: 'ringwraith', phase: 1, name: 'Ringwraith Boss',         label: 'Ringwraith Boss',         role: 'Corruption Nemesis' },
    { key: 'balrog_p1',  type: 'balrog',     id: 'balrog_p1',  phase: 1, name: 'The Witch-lord of Morgul', label: 'Witch-lord (Phase I)',    role: 'Grand Siege Phase I' },
    { key: 'balrog_p2',  type: 'balrog',     id: 'balrog_p2',  phase: 2, name: 'Balrog of Udûn',          label: 'Balrog of Udûn (Phase II)', role: 'Grand Siege Phase II' }
  ];

  // ============================================================================
  // 2. SHARED SCULPTED GEOMETRY, PROCEDURAL TEXTURE & PBR MATERIAL BANK
  // ============================================================================
  class EnemyAssetBank {
    constructor(THREE, hostCache) {
      this.THREE = THREE;
      this.hostCache = hostCache || null;
      this.isEnemyAssetBank = true;
      this.disposed = false;

      this.ownGeos = [];
      this.ownMats = [];
      this.ownTexs = [];

      this.tex = {};
      this.mats = {};
      this.geos = {};

      this._buildTextures();
      this._buildMaterials();
      this._buildGeometries();
    }

    regGeo(g) {
      if (!g) return g;
      if (this.hostCache && typeof this.hostCache.regGeo === 'function') {
        this.hostCache.regGeo(g);
      } else {
        this.ownGeos.push(g);
      }
      return g;
    }

    regMat(m) {
      if (!m) return m;
      if (this.hostCache && typeof this.hostCache.regMat === 'function') {
        this.hostCache.regMat(m);
      } else {
        this.ownMats.push(m);
      }
      return m;
    }

    regTex(t) {
      if (!t) return t;
      if (this.hostCache && typeof this.hostCache.regTex === 'function') {
        this.hostCache.regTex(t);
      } else {
        this.ownTexs.push(t);
      }
      return t;
    }

    _makeCanvas(w, h) {
      if (typeof document === 'undefined') return null;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }

    _canvasToTex(canvas, rx, ry, isSRGB, clampEdge) {
      const THREE = this.THREE;
      if (!canvas) return null;
      const t = new THREE.CanvasTexture(canvas);
      t.wrapS = clampEdge ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
      t.wrapT = clampEdge ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
      if (!clampEdge && (rx || ry)) {
        t.repeat.set(rx || 1, ry || 1);
      }
      if (isSRGB && THREE.SRGBColorSpace) {
        t.colorSpace = THREE.SRGBColorSpace;
      }
      t.needsUpdate = true;
      return this.regTex(t);
    }

    _buildTextures() {
      // 1. Mordor Red Eye Battered Iron Shield Texture
      const eyeC = this._makeCanvas(128, 128);
      if (eyeC) {
        const ctx = eyeC.getContext('2d');
        const bg = ctx.createRadialGradient(64, 60, 8, 64, 64, 72);
        bg.addColorStop(0, '#2a2322');
        bg.addColorStop(0.65, '#1d1d21');
        bg.addColorStop(1, '#121316');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 128, 128);

        // Battle scratches & iron hammer marks
        for (let i = 0; i < 120; i++) {
          const x = hash2(i, 1, 71) * 128;
          const y = hash2(i, 2, 71) * 128;
          const v = Math.round(32 + hash2(i, 3, 71) * 44);
          ctx.fillStyle = `rgba(${v},${v},${v + 4},0.36)`;
          ctx.fillRect(x, y, 2 + (i % 4), 2);
        }
        ctx.strokeStyle = 'rgba(135,142,152,0.34)';
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 9; i++) {
          ctx.beginPath();
          const sx = 16 + hash2(i, 5, 73) * 96;
          const sy = 16 + hash2(i, 6, 73) * 96;
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + (hash2(i, 7, 73) - 0.5) * 32, sy + (hash2(i, 8, 73) - 0.5) * 32);
          ctx.stroke();
        }

        // Outer riveted iron border
        ctx.strokeStyle = '#4c525c';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, 120, 120);

        // Painted Crimson-Amber Lidless Eye of Mordor
        const halo = ctx.createRadialGradient(64, 58, 4, 64, 58, 42);
        halo.addColorStop(0, 'rgba(255, 195, 45, 0.95)');
        halo.addColorStop(0.38, 'rgba(235, 58, 16, 0.90)');
        halo.addColorStop(0.75, 'rgba(150, 18, 10, 0.45)');
        halo.addColorStop(1, 'rgba(40, 8, 6, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.ellipse(64, 58, 42, 26, 0, 0, TWO_PI);
        ctx.fill();

        // Jagged flame-rays around the Eye
        ctx.strokeStyle = '#ef4418';
        ctx.lineWidth = 2.6;
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * TWO_PI;
          ctx.beginPath();
          ctx.moveTo(64 + Math.cos(a) * 18, 58 + Math.sin(a) * 11);
          ctx.lineTo(64 + Math.cos(a) * 39, 58 + Math.sin(a) * 24);
          ctx.stroke();
        }

        // Almond fiery iris
        ctx.fillStyle = '#ff981a';
        ctx.beginPath();
        ctx.moveTo(28, 58);
        ctx.quadraticCurveTo(64, 34, 100, 58);
        ctx.quadraticCurveTo(64, 82, 28, 58);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#ffe055';
        ctx.beginPath();
        ctx.ellipse(64, 58, 16, 11, 0, 0, TWO_PI);
        ctx.fill();

        // Slit black pupil
        ctx.fillStyle = '#070506';
        ctx.beginPath();
        ctx.moveTo(64, 41);
        ctx.quadraticCurveTo(70, 58, 64, 75);
        ctx.quadraticCurveTo(58, 58, 64, 41);
        ctx.closePath();
        ctx.fill();

        this.tex.redEyeShield = this._canvasToTex(eyeC, 1, 1, true, true);
        this.tex.redEyeShieldBump = this._canvasToTex(eyeC, 1, 1, false, true);
      }

      // 2. Isengard White Hand of Saruman Warpaint on Forged Dark Iron
      const whC = this._makeCanvas(128, 128);
      if (whC) {
        const ctx = whC.getContext('2d');
        ctx.fillStyle = '#252930';
        ctx.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 180; i++) {
          const x = hash2(i, 1, 131) * 128;
          const y = hash2(i, 2, 131) * 128;
          const s = Math.round(28 + hash2(i, 3, 131) * 32);
          ctx.fillStyle = `rgb(${s},${s + 2},${s + 5})`;
          ctx.fillRect(x, y, 4, 3);
        }

        // Stark White Hand warpaint (palm + 5 splayed fingers + paint drips)
        ctx.fillStyle = '#f0ede4';
        ctx.strokeStyle = '#f0ede4';
        ctx.lineCap = 'round';

        // Palm
        ctx.beginPath();
        ctx.ellipse(64, 74, 20, 19, -0.06, 0, TWO_PI);
        ctx.fill();

        // Thumb + 4 splayed fingers
        const fingers = [
          [46, 76, 26, 60, 7.5],  // thumb
          [51, 59, 41, 24, 6.8],  // index
          [60, 56, 59, 16, 7.2],  // middle
          [70, 57, 75, 20, 6.8],  // ring
          [79, 63, 92, 33, 6.0]   // pinky
        ];
        for (let f = 0; f < fingers.length; f++) {
          const fn = fingers[f];
          ctx.lineWidth = fn[4];
          ctx.beginPath();
          ctx.moveTo(fn[0], fn[1]);
          ctx.lineTo(fn[2], fn[3]);
          ctx.stroke();
        }

        // Organic warpaint smears/drips
        ctx.lineWidth = 3.0;
        ctx.strokeStyle = 'rgba(238,234,224,0.82)';
        const drips = [[54, 90, 53, 112], [65, 92, 65, 118], [74, 89, 75, 108]];
        for (let d = 0; d < drips.length; d++) {
          ctx.beginPath();
          ctx.moveTo(drips[d][0], drips[d][1]);
          ctx.lineTo(drips[d][2], drips[d][3]);
          ctx.stroke();
        }

        this.tex.whiteHand = this._canvasToTex(whC, 1, 1, true, true);
      }

      // 3. Dire-Wolf Warg Fur & Guard-Hair Bump Texture
      const furC = this._makeCanvas(128, 128);
      const furB = this._makeCanvas(128, 128);
      if (furC && furB) {
        const cCtx = furC.getContext('2d');
        const bCtx = furB.getContext('2d');
        cCtx.fillStyle = '#3f2f26';
        cCtx.fillRect(0, 0, 128, 128);
        bCtx.fillStyle = '#606060';
        bCtx.fillRect(0, 0, 128, 128);

        for (let i = 0; i < 650; i++) {
          const x = hash2(i, 1, 211) * 128;
          const y = hash2(i, 2, 211) * 128;
          const len = 7 + hash2(i, 3, 211) * 12;
          const jitter = (hash2(i, 4, 211) - 0.5) * 3.5;
          const tone = hash2(i, 5, 211);
          const r = Math.round(40 + tone * 52);
          const g = Math.round(29 + tone * 38);
          const b = Math.round(23 + tone * 28);
          cCtx.strokeStyle = `rgba(${r},${g},${b},0.65)`;
          cCtx.lineWidth = 1.6;
          cCtx.beginPath();
          cCtx.moveTo(x, y);
          cCtx.lineTo(x + jitter, y + len);
          cCtx.stroke();

          const bv = Math.round(65 + tone * 165);
          bCtx.strokeStyle = `rgb(${bv},${bv},${bv})`;
          bCtx.lineWidth = 1.5;
          bCtx.beginPath();
          bCtx.moveTo(x, y);
          bCtx.lineTo(x + jitter, y + len);
          bCtx.stroke();
        }
        this.tex.wargFur = this._canvasToTex(furC, 2, 2, true, false);
        this.tex.wargFurBump = this._canvasToTex(furB, 2, 2, false, false);
      }

      // 4. Olog-hai Craggy Mountain-Stone Hide (modeled on reference image Troll!)
      const trC = this._makeCanvas(192, 192);
      const trB = this._makeCanvas(192, 192);
      if (trC && trB) {
        const cCtx = trC.getContext('2d');
        const bCtx = trB.getContext('2d');
        const cImg = cCtx.createImageData(192, 192);
        const bImg = bCtx.createImageData(192, 192);
        const cd = cImg.data;
        const bd = bImg.data;
        for (let y = 0; y < 192; y++) {
          const v = y / 192;
          for (let x = 0; x < 192; x++) {
            const u = x / 192;
            const idx = (y * 192 + x) * 4;
            const w = worley2(u, v, 9, 307);
            const fine = worley2(u, v, 22, 353);
            const grain = fbm2(u, v, 8, 3, 389);
            const crevice = clamp((0.09 - w.edge) / 0.09, 0, 1);
            const pebble = clamp(1 - fine.f1 * 1.3, 0, 1);
            const base = (142 + (w.id - 0.5) * 26 + (grain - 0.5) * 32 + pebble * 14) * (1 - crevice * 0.42);
            cd[idx] = clamp(Math.round(base * 1.02), 38, 220);
            cd[idx + 1] = clamp(Math.round(base * 0.99), 36, 215);
            cd[idx + 2] = clamp(Math.round(base * 0.94), 34, 208);
            cd[idx + 3] = 255;

            const hVal = clamp((1 - crevice * 0.85) * (0.45 + pebble * 0.35 + grain * 0.25), 0.04, 1);
            const bv = Math.round(hVal * 255);
            bd[idx] = bv;
            bd[idx + 1] = bv;
            bd[idx + 2] = bv;
            bd[idx + 3] = 255;
          }
        }
        cCtx.putImageData(cImg, 0, 0);
        bCtx.putImageData(bImg, 0, 0);
        this.tex.ologStone = this._canvasToTex(trC, 2, 2, true, false);
        this.tex.ologBump = this._canvasToTex(trB, 2, 2, false, false);
      }

      // 5. Reptilian Fell Beast Scales & Wing Membrane Veins
      const drC = this._makeCanvas(128, 128);
      const drB = this._makeCanvas(128, 128);
      if (drC && drB) {
        const cCtx = drC.getContext('2d');
        const bCtx = drB.getContext('2d');
        const cImg = cCtx.createImageData(128, 128);
        const bImg = bCtx.createImageData(128, 128);
        for (let y = 0; y < 128; y++) {
          const v = y / 128;
          for (let x = 0; x < 128; x++) {
            const u = x / 128;
            const idx = (y * 128 + x) * 4;
            const sc = worley2(u, v * 1.35, 14, 433);
            const crown = clamp(1 - sc.f1 * 1.35, 0, 1);
            const rim = clamp((0.08 - sc.edge) / 0.08, 0, 1);
            const lum = (46 + crown * 28 + sc.id * 12) * (1 - rim * 0.45);
            cImg.data[idx] = Math.round(lum * 0.98);
            cImg.data[idx + 1] = Math.round(lum * 0.90);
            cImg.data[idx + 2] = Math.round(lum * 1.18);
            cImg.data[idx + 3] = 255;
            const bv = Math.round(clamp((1 - rim * 0.8) * (0.35 + crown * 0.6), 0, 1) * 255);
            bImg.data[idx] = bv;
            bImg.data[idx + 1] = bv;
            bImg.data[idx + 2] = bv;
            bImg.data[idx + 3] = 255;
          }
        }
        cCtx.putImageData(cImg, 0, 0);
        bCtx.putImageData(bImg, 0, 0);
        this.tex.drakeScale = this._canvasToTex(drC, 2, 2, true, false);
        this.tex.drakeBump = this._canvasToTex(drB, 2, 2, false, false);
      }

      // 6. Forged Chainmail Texture
      const cmC = this._makeCanvas(96, 96);
      if (cmC) {
        const ctx = cmC.getContext('2d');
        ctx.fillStyle = '#1a1d22';
        ctx.fillRect(0, 0, 96, 96);
        ctx.strokeStyle = '#757f8c';
        ctx.lineWidth = 2.0;
        const step = 12;
        for (let r = -1; r <= 9; r++) {
          const y = r * (step * 0.75);
          const off = (r & 1) ? step * 0.5 : 0;
          for (let c = -1; c <= 9; c++) {
            ctx.beginPath();
            ctx.arc(c * step + off, y, 4.6, 0, TWO_PI);
            ctx.stroke();
          }
        }
        this.tex.chainmail = this._canvasToTex(cmC, 3, 3, true, false);
        this.tex.chainmailBump = this._canvasToTex(cmC, 3, 3, false, false);
      }

      // 7. Balrog Charcoal-Obsidian Muscle Fissured with Orange-Gold Magma Cracks!
      //    Carefully controlled emissive coverage (~14% crisp veins, ~86% dark obsidian)
      //    so dark muscles & wings contrast starkly without blooming into a white blob!
      const boC = this._makeCanvas(256, 256);
      const boB = this._makeCanvas(256, 256);
      const boE = this._makeCanvas(256, 256);
      if (boC && boB && boE) {
        const cCtx = boC.getContext('2d');
        const bCtx = boB.getContext('2d');
        const eCtx = boE.getContext('2d');
        const cImg = cCtx.createImageData(256, 256);
        const bImg = bCtx.createImageData(256, 256);
        const eImg = eCtx.createImageData(256, 256);
        for (let y = 0; y < 256; y++) {
          const v = y / 256;
          for (let x = 0; x < 256; x++) {
            const u = x / 256;
            const idx = (y * 256 + x) * 4;
            const cell = worley2(u, v, 7, 709);
            const fine = worley2(u, v, 15, 743);
            const grain = fbm2(u, v, 10, 3, 773);
            const warpEdge = cell.edge + (grain - 0.5) * 0.045;
            const mainCrack = clamp((0.068 - warpEdge) / 0.068, 0, 1);
            const hairCrack = clamp((0.032 - fine.edge) / 0.032, 0, 1) * 0.42;
            const magma = clamp(mainCrack + hairCrack * (1 - mainCrack), 0, 1);

            const obs = 24 + cell.edge * 34 + grain * 14;
            cImg.data[idx] = Math.round(lerp(obs * 1.04, 255, magma));
            cImg.data[idx + 1] = Math.round(lerp(obs * 0.94, 138 + magma * 72, magma));
            cImg.data[idx + 2] = Math.round(lerp(obs * 1.02, 22 + magma * 20, magma));
            cImg.data[idx + 3] = 255;

            const bh = clamp((1 - magma) * (0.42 + cell.edge * 0.48 + grain * 0.14), 0.04, 1);
            const bv = Math.round(bh * 255);
            bImg.data[idx] = bv;
            bImg.data[idx + 1] = bv;
            bImg.data[idx + 2] = bv;
            bImg.data[idx + 3] = 255;

            const glow = magma * magma;
            eImg.data[idx] = Math.round(clamp(glow * 255, 0, 255));
            eImg.data[idx + 1] = Math.round(clamp(glow * 136, 0, 255));
            eImg.data[idx + 2] = Math.round(clamp(glow * 18, 0, 255));
            eImg.data[idx + 3] = 255;
          }
        }
        cCtx.putImageData(cImg, 0, 0);
        bCtx.putImageData(bImg, 0, 0);
        eCtx.putImageData(eImg, 0, 0);
        this.tex.balrogObsidian = this._canvasToTex(boC, 2, 2, true, false);
        this.tex.balrogBump = this._canvasToTex(boB, 2, 2, false, false);
        this.tex.balrogEmissive = this._canvasToTex(boE, 2, 2, true, false);
      }

      // 8. Smoky Charcoal-Umber Balrog Bat-Wing Membrane with Bright Branching Magma Veins!
      const bwC = this._makeCanvas(256, 256);
      const bwE = this._makeCanvas(256, 256);
      if (bwC && bwE) {
        const cCtx = bwC.getContext('2d');
        const eCtx = bwE.getContext('2d');
        cCtx.fillStyle = '#2d1916';
        cCtx.fillRect(0, 0, 256, 256);
        eCtx.fillStyle = '#120400';
        eCtx.fillRect(0, 0, 256, 256);

        // Warm charcoal-umber smoky leather mottling so wings contrast clearly against black backdrops
        for (let i = 0; i < 420; i++) {
          const x = hash2(i, 1, 821) * 256;
          const y = hash2(i, 2, 821) * 256;
          const rad = 6 + hash2(i, 3, 821) * 18;
          const v = Math.round(38 + hash2(i, 4, 821) * 28);
          cCtx.fillStyle = `rgba(${v + 16},${v - 4},${v - 8},0.38)`;
          cCtx.beginPath();
          cCtx.arc(x, y, rad, 0, TWO_PI);
          cCtx.fill();
        }

        // Glowing magma leading-bone & scalloped trailing-edge ember rim
        const edgeGrad = eCtx.createLinearGradient(0, 0, 0, 256);
        edgeGrad.addColorStop(0, 'rgba(255, 118, 24, 0.62)');
        edgeGrad.addColorStop(0.22, 'rgba(110, 28, 4, 0.16)');
        edgeGrad.addColorStop(0.74, 'rgba(95, 22, 4, 0.14)');
        edgeGrad.addColorStop(1, 'rgba(255, 126, 28, 0.78)');
        eCtx.fillStyle = edgeGrad;
        eCtx.fillRect(0, 0, 256, 256);

        const rimColorGrad = cCtx.createLinearGradient(0, 196, 0, 256);
        rimColorGrad.addColorStop(0, 'rgba(255, 110, 20, 0)');
        rimColorGrad.addColorStop(1, 'rgba(255, 128, 32, 0.55)');
        cCtx.fillStyle = rimColorGrad;
        cCtx.fillRect(0, 196, 256, 60);

        // Bright branching #ff7b1a magma veins across the membrane webs
        for (let v = 0; v < 22; v++) {
          let vx = (v + 0.5) * (256 / 22);
          let vy = 0;
          cCtx.strokeStyle = 'rgba(255, 132, 34, 0.78)';
          cCtx.lineWidth = 2.6;
          eCtx.strokeStyle = 'rgba(255, 138, 32, 0.92)';
          eCtx.lineWidth = 2.4;
          cCtx.beginPath();
          eCtx.beginPath();
          cCtx.moveTo(vx, vy);
          eCtx.moveTo(vx, vy);
          for (let s = 1; s <= 6; s++) {
            const bx = vx + (hash2(v, s, 857) - 0.5) * 24;
            const by = (s / 6) * 256;
            cCtx.lineTo(bx, by);
            eCtx.lineTo(bx, by);
            if (s === 3 || s === 5) {
              // Secondary fork capillary
              const fx = bx + (hash2(v + 31, s, 863) - 0.5) * 26;
              const fy = Math.min(256, by + 34);
              cCtx.moveTo(bx, by);
              cCtx.lineTo(fx, fy);
              cCtx.moveTo(bx, by);
              eCtx.moveTo(bx, by);
              eCtx.lineTo(fx, fy);
              eCtx.moveTo(bx, by);
            }
            vx = bx;
            vy = by;
          }
          cCtx.stroke();
          eCtx.stroke();
        }

        this.tex.balrogWing = this._canvasToTex(bwC, 1, 1, true, true);
        this.tex.balrogWingEmissive = this._canvasToTex(bwE, 1, 1, true, true);
      }

      // 9. Fell Beast Slate-Violet Leathery Wing Membrane with Lighter Vein Ridges
      const fwC = this._makeCanvas(128, 128);
      if (fwC) {
        const ctx = fwC.getContext('2d');
        const gBg = ctx.createLinearGradient(0, 0, 0, 128);
        gBg.addColorStop(0, '#685480');
        gBg.addColorStop(0.65, '#4e3d63');
        gBg.addColorStop(1, '#3b2d4d');
        ctx.fillStyle = gBg;
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = 'rgba(168, 148, 198, 0.48)';
        ctx.lineWidth = 1.6;
        for (let v = 0; v < 14; v++) {
          let x = (v + 0.5) * (128 / 14);
          ctx.beginPath();
          ctx.moveTo(x, 0);
          for (let s = 1; s <= 5; s++) {
            x += (hash2(v, s, 911) - 0.5) * 12;
            ctx.lineTo(x, (s / 5) * 128);
          }
          ctx.stroke();
        }
        this.tex.fellWing = this._canvasToTex(fwC, 1, 1, true, true);
      }
    }

    _buildMaterials() {
      const THREE = this.THREE;
      const hc = this.hostCache && this.hostCache.mats ? this.hostCache.mats : null;
      const pt = (TD && TD.ProceduralTextures && typeof TD.ProceduralTextures.get === 'function')
        ? TD.ProceduralTextures
        : null;
      const ironSet = pt ? pt.get('iron', 2, 2) : null;
      const timberSet = pt ? pt.get('timber', 2, 2) : null;

      const std = (opts) => this.regMat(new THREE.MeshStandardMaterial(opts));
      const basic = (opts) => this.regMat(new THREE.MeshBasicMaterial(opts));

      // Balanced metalness (0.38-0.58) so armor catches BOTH directional specular glints AND hemisphere fill!
      this.mats.ironForged = std({
        color: 0x525a66,
        bumpMap: (ironSet && ironSet.bumpMap) || null,
        roughnessMap: (ironSet && ironSet.roughnessMap) || null,
        bumpScale: 0.06,
        roughness: 0.44,
        metalness: 0.56
      });
      this.mats.ironBlackened = std({
        color: 0x2a2f38,
        bumpMap: (ironSet && ironSet.bumpMap) || null,
        bumpScale: 0.05,
        roughness: 0.40,
        metalness: 0.54
      });
      this.mats.steelBlade = std({
        color: 0xcbd6e2,
        bumpMap: (ironSet && ironSet.bumpMap) || null,
        bumpScale: 0.03,
        roughness: 0.28,
        metalness: 0.62
      });
      this.mats.morgulSilver = std({
        color: 0xbac6d6,
        emissive: 0x162234,
        emissiveIntensity: 0.18,
        roughness: 0.26,
        metalness: 0.64
      });
      this.mats.chainmail = std({
        color: 0x6a7380,
        map: this.tex.chainmail || null,
        bumpMap: this.tex.chainmailBump || null,
        bumpScale: 0.08,
        roughness: 0.48,
        metalness: 0.52
      });
      this.mats.tarnishedBronze = std({
        color: 0x9c7440,
        roughness: 0.42,
        metalness: 0.56
      });

      // Leather, Wood, Bone & Horn
      this.mats.leatherDark = std({
        color: 0x3b291e,
        bumpMap: this.tex.wargFurBump || null,
        bumpScale: 0.04,
        roughness: 0.82,
        metalness: 0.06
      });
      this.mats.leatherWorn = std({
        color: 0x5e402b,
        roughness: 0.78,
        metalness: 0.06
      });
      this.mats.ashWood = std({
        color: 0x563b25,
        map: (timberSet && timberSet.map) || null,
        bumpMap: (timberSet && timberSet.bumpMap) || null,
        bumpScale: 0.07,
        roughness: 0.84,
        metalness: 0.05
      });
      this.mats.boneIvory = std({
        color: 0xd8ceb8,
        roughness: 0.52,
        metalness: 0.06
      });
      this.mats.darkHorn = std({
        color: 0x2e2825,
        bumpMap: this.tex.ologBump || null,
        bumpScale: 0.06,
        roughness: 0.54,
        metalness: 0.16
      });

      // Creature Skins & Painted Heraldry
      this.mats.goblinSkin = std({
        color: 0x688c49,
        bumpMap: this.tex.ologBump || null,
        bumpScale: 0.04,
        roughness: 0.72,
        metalness: 0.04
      });
      this.mats.goblinCloth = std({
        color: 0x252b23,
        roughness: 0.90,
        metalness: 0.04,
        side: THREE.DoubleSide
      });
      this.mats.orcSkin = std({
        color: 0x647353,
        bumpMap: this.tex.ologBump || null,
        bumpScale: 0.05,
        roughness: 0.76,
        metalness: 0.04
      });
      this.mats.redEyeShield = std({
        color: 0xffffff,
        map: this.tex.redEyeShield || null,
        bumpMap: this.tex.redEyeShieldBump || null,
        bumpScale: 0.06,
        roughness: 0.52,
        metalness: 0.38
      });

      this.mats.urukSkin = std({
        color: 0x76392c,
        bumpMap: this.tex.ologBump || null,
        bumpScale: 0.05,
        roughness: 0.68,
        metalness: 0.06
      });
      this.mats.urukCloth = std({
        color: 0x4a1714,
        roughness: 0.84,
        metalness: 0.06,
        side: THREE.DoubleSide
      });
      this.mats.whiteHandHelm = std({
        color: 0xffffff,
        map: this.tex.whiteHand || null,
        bumpMap: (ironSet && ironSet.bumpMap) || null,
        bumpScale: 0.05,
        roughness: 0.42,
        metalness: 0.48
      });
      this.mats.urukCrestMetal = std({
        color: 0xc5c2ba,
        roughness: 0.38,
        metalness: 0.52,
        side: THREE.DoubleSide
      });
      this.mats.urukEnragedArmor = (hc && hc.urukEnragedArmor) || std({
        color: 0x681e18,
        emissive: 0xc62014,
        emissiveIntensity: 0.82,
        roughness: 0.38,
        metalness: 0.52
      });
      this.mats.urukRageEmber = std({
        color: 0xff8c42,
        emissive: 0xe62e00,
        emissiveIntensity: 1.05,
        roughness: 0.25
      });
      this.mats.urukRageAura = (hc && hc.urukRageAura) || basic({
        color: 0xff331f,
        transparent: true,
        opacity: 0.52,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      // Warg Wolf Materials
      this.mats.wargCoat = std({
        color: 0x574338,
        map: this.tex.wargFur || null,
        bumpMap: this.tex.wargFurBump || null,
        bumpScale: 0.11,
        roughness: 0.84,
        metalness: 0.04
      });
      this.mats.wargRuff = std({
        color: 0x30231c,
        map: this.tex.wargFur || null,
        bumpMap: this.tex.wargFurBump || null,
        bumpScale: 0.14,
        roughness: 0.88,
        metalness: 0.03
      });
      this.mats.wargMuzzle = std({
        color: 0x241b17,
        roughness: 0.72,
        metalness: 0.06
      });
      this.mats.wargGums = std({
        color: 0x6e2224,
        roughness: 0.58,
        metalness: 0.04
      });

      // Olog-hai Siege Troll Materials
      this.mats.trollStone = std({
        color: 0xa49f96,
        map: this.tex.ologStone || null,
        bumpMap: this.tex.ologBump || null,
        bumpScale: 0.16,
        roughness: 0.82,
        metalness: 0.05
      });
      this.mats.trollCrag = std({
        color: 0x757068,
        map: this.tex.ologStone || null,
        bumpMap: this.tex.ologBump || null,
        bumpScale: 0.18,
        roughness: 0.88,
        metalness: 0.06
      });
      this.mats.regenRing = (hc && hc.regenRing) || basic({
        color: 0x81c784,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      // Shadow Wraith & Nazgul Materials (reuse hostCache wraith materials when present so sync() swaps match!)
      this.mats.voidBlack = basic({ color: 0x030307 });
      this.mats.nazgulCloth = std({
        color: 0x161922,
        emissive: 0x070910,
        emissiveIntensity: 0.25,
        roughness: 0.86,
        metalness: 0.08,
        side: THREE.DoubleSide
      });
      this.mats.nazgulInnerCloth = std({
        color: 0x0e1118,
        roughness: 0.90,
        metalness: 0.05,
        side: THREE.DoubleSide
      });
      this.mats.wraithStealth = (hc && hc.wraithStealth) || std({
        color: 0x224652,
        emissive: 0x1c7588,
        emissiveIntensity: 0.62,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        roughness: 0.46,
        side: THREE.DoubleSide
      });
      this.mats.wraithRevealed = (hc && hc.wraithRevealed) || std({
        color: 0x62daf5,
        emissive: 0x269ec9,
        emissiveIntensity: 0.78,
        transparent: true,
        opacity: 0.86,
        roughness: 0.36,
        side: THREE.DoubleSide
      });
      this.mats.wraithDodge = (hc && hc.wraithDodge) || std({
        color: 0x8ce8fa,
        emissive: 0x4bc5e0,
        emissiveIntensity: 0.65,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      this.mats.wraithCloak = std({
        color: 0x111a24,
        emissive: 0x071a26,
        emissiveIntensity: 0.34,
        transparent: true,
        opacity: 0.90,
        roughness: 0.68,
        metalness: 0.10,
        side: THREE.DoubleSide
      });
      this.mats.wraithDarkStrip = std({
        color: 0x111a24,
        emissive: 0x0a2c38,
        emissiveIntensity: 0.36,
        transparent: true,
        opacity: 0.86,
        roughness: 0.65,
        side: THREE.DoubleSide
      });
      this.mats.morgulCyanBlade = std({
        color: 0x9cf0ff,
        emissive: 0x28bdd9,
        emissiveIntensity: 1.02,
        roughness: 0.20,
        metalness: 0.35
      });
      this.mats.trueSightRing = (hc && hc.trueSightRing) || basic({
        color: 0x6ef4ff,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      // Fell Beast Materials (lifted slate-violet ridge highlights so wings & scales read clearly!)
      this.mats.fellScale = std({
        color: 0x625878,
        map: this.tex.drakeScale || null,
        bumpMap: this.tex.drakeBump || null,
        bumpScale: 0.12,
        emissive: 0x181326,
        emissiveIntensity: 0.24,
        roughness: 0.52,
        metalness: 0.20
      });
      this.mats.fellBelly = std({
        color: 0x7c7092,
        bumpMap: this.tex.drakeBump || null,
        bumpScale: 0.08,
        emissive: 0x181224,
        emissiveIntensity: 0.18,
        roughness: 0.62,
        metalness: 0.12
      });
      this.mats.fellWingBone = std({
        color: 0x8e8496,
        roughness: 0.46,
        metalness: 0.22
      });
      this.mats.fellWingMembrane = std({
        color: 0xffffff,
        map: this.tex.fellWing || null,
        bumpMap: this.tex.wargFurBump || null,
        bumpScale: 0.07,
        emissive: 0x261a3b,
        emissiveIntensity: 0.32,
        roughness: 0.66,
        metalness: 0.10,
        side: THREE.DoubleSide
      });
      this.mats.groundMarker = (hc && hc.groundMarker) || basic({
        color: 0x090a0f,
        transparent: true,
        opacity: 0.34,
        depthWrite: false
      });

      // Ringwraith & Witch-lord Boss Glows
      this.mats.nazgulMist = basic({
        color: 0x6e48d6,
        transparent: true,
        opacity: 0.36,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      this.mats.nazgulRunesword = std({
        color: 0xd4c6f5,
        emissive: 0x7c48e8,
        emissiveIntensity: 0.94,
        roughness: 0.22,
        metalness: 0.45
      });
      this.mats.morgulGreenFlame = std({
        color: 0x9ef5b8,
        emissive: 0x26c468,
        emissiveIntensity: 0.96,
        roughness: 0.25,
        side: THREE.DoubleSide
      });
      this.mats.witchFireBlade = std({
        color: 0xffcf70,
        emissive: 0xe85c0c,
        emissiveIntensity: 1.02,
        roughness: 0.24,
        side: THREE.DoubleSide
      });

      // Balrog Phase 2 Materials — Controlled emissive (0.90 - 1.15) for stark obsidian vs magma contrast!
      this.mats.balrogMuscle = std({
        color: 0xffffff,
        map: this.tex.balrogObsidian || null,
        bumpMap: this.tex.balrogBump || null,
        bumpScale: 0.15,
        emissive: 0xff6d00,
        emissiveMap: this.tex.balrogEmissive || null,
        emissiveIntensity: 0.96,
        roughness: 0.46,
        metalness: 0.30
      });
      this.mats.balrogCharcoal = std({
        color: 0x1d171a,
        bumpMap: this.tex.balrogBump || null,
        bumpScale: 0.12,
        emissive: 0x2b0800,
        emissiveIntensity: 0.20,
        roughness: 0.48,
        metalness: 0.36
      });
      this.mats.balrogHornMat = std({
        color: 0x261d1c,
        bumpMap: this.tex.ologBump || null,
        bumpScale: 0.10,
        emissive: 0x421000,
        emissiveIntensity: 0.24,
        roughness: 0.44,
        metalness: 0.32
      });
      this.mats.balrogWingMem = std({
        color: 0xffffff,
        map: this.tex.balrogWing || null,
        bumpMap: this.tex.balrogBump || null,
        bumpScale: 0.09,
        emissive: 0xff7b1a,
        emissiveMap: this.tex.balrogWingEmissive || null,
        emissiveIntensity: 0.88,
        roughness: 0.66,
        metalness: 0.14,
        side: THREE.DoubleSide
      });
      this.mats.balrogMagmaVein = std({
        color: 0xffad42,
        emissive: 0xe64800,
        emissiveIntensity: 1.02,
        roughness: 0.26
      });
      this.mats.balrogFlameBright = std({
        color: 0xffd66b,
        emissive: 0xf25c00,
        emissiveIntensity: 1.12,
        roughness: 0.20,
        side: THREE.DoubleSide
      });
      this.mats.balrogFireRing = (hc && hc.tetherPhase2) || basic({
        color: 0xff4800,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      // Glowing Eyes
      this.mats.eyeYellow = std({ color: 0xffe052, emissive: 0xffab00, emissiveIntensity: 1.08, roughness: 0.2 });
      this.mats.eyeAmber = std({ color: 0xffb840, emissive: 0xf57c00, emissiveIntensity: 1.05, roughness: 0.2 });
      this.mats.eyeCrimson = std({ color: 0xff5242, emissive: 0xe61919, emissiveIntensity: 1.08, roughness: 0.2 });
      this.mats.eyeCyan = std({ color: 0x9cf6ff, emissive: 0x18d4f2, emissiveIntensity: 1.10, roughness: 0.2 });
      this.mats.eyeFurnace = std({ color: 0xffe885, emissive: 0xff6f00, emissiveIntensity: 1.18, roughness: 0.18 });
    }

    _latheFromPairs(pairs, segs) {
      const THREE = this.THREE;
      const pts = [];
      for (let i = 0; i < pairs.length; i++) {
        pts.push(new THREE.Vector2(pairs[i][0], pairs[i][1]));
      }
      const g = new THREE.LatheGeometry(pts, segs || 12);
      g.computeVertexNormals();
      return this.regGeo(g);
    }

    _extrudeShape(shape, depth, bevelSize, bevelThickness) {
      const THREE = this.THREE;
      const g = new THREE.ExtrudeGeometry(shape, {
        steps: 1,
        curveSegments: 4,
        depth: depth,
        bevelEnabled: bevelSize > 0,
        bevelThickness: bevelThickness || bevelSize,
        bevelSize: bevelSize || 0,
        bevelSegments: 1
      });
      g.translate(0, 0, -depth * 0.5);
      g.computeVertexNormals();
      return this.regGeo(g);
    }

    _taperedTube(pts3, tubularSegs, rStart, rEnd, radialSegs, corrugateFreq, corrugateAmp) {
      const THREE = this.THREE;
      const vecs = pts3.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
      const curve = new THREE.CatmullRomCurve3(vecs);
      const frames = curve.computeFrenetFrames(tubularSegs, false);
      const rSegs = radialSegs || 8;
      const vertCount = (tubularSegs + 1) * (rSegs + 1);
      const pos = new Float32Array(vertCount * 3);
      const uvs = new Float32Array(vertCount * 2);
      const indices = [];

      const P = new THREE.Vector3();
      let vPtr = 0;
      let uPtr = 0;

      for (let i = 0; i <= tubularSegs; i++) {
        const t = i / tubularSegs;
        curve.getPointAt(t, P);
        const N = frames.normals[i];
        const B = frames.binormals[i];
        let rad = lerp(rStart, rEnd, Math.pow(t, 0.85));
        if (corrugateFreq && corrugateAmp) {
          rad *= (1 + corrugateAmp * (1 - t * 0.65) * Math.sin(t * corrugateFreq * TWO_PI));
        }
        // Taper clean tip cap at end if rEnd is very small
        if (i === tubularSegs && rEnd < 0.025) rad = 0.002;
        if (i === 0 && rStart < 0.025) rad = 0.002;

        for (let j = 0; j <= rSegs; j++) {
          const v = j / rSegs;
          const a = v * TWO_PI;
          const sin = -Math.sin(a);
          const cos = Math.cos(a);
          const nx = cos * N.x + sin * B.x;
          const ny = cos * N.y + sin * B.y;
          const nz = cos * N.z + sin * B.z;
          pos[vPtr++] = P.x + rad * nx;
          pos[vPtr++] = P.y + rad * ny;
          pos[vPtr++] = P.z + rad * nz;
          uvs[uPtr++] = t;
          uvs[uPtr++] = v;
        }
      }

      const stride = rSegs + 1;
      for (let i = 0; i < tubularSegs; i++) {
        for (let j = 0; j < rSegs; j++) {
          const a = i * stride + j;
          const b = (i + 1) * stride + j;
          const c = (i + 1) * stride + (j + 1);
          const d = i * stride + (j + 1);
          indices.push(a, b, d, b, c, d);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return this.regGeo(geo);
    }

    _createFlutedRobeGeo(topR, botR, height, radialSegs, rings, flutes, fluteAmp, tatterAmp) {
      const THREE = this.THREE;
      const vertCount = (rings + 1) * (radialSegs + 1);
      const pos = new Float32Array(vertCount * 3);
      const uvs = new Float32Array(vertCount * 2);
      const indices = [];
      let vp = 0;
      let up = 0;

      for (let r = 0; r <= rings; r++) {
        const v = r / rings; // 0 = hem, 1 = waist
        const bell = Math.pow(1 - v, 1.25);
        const baseR = lerp(topR, botR, bell);
        for (let s = 0; s <= radialSegs; s++) {
          const u = s / radialSegs;
          const ang = u * TWO_PI;
          const pleat = Math.sin(ang * flutes) * fluteAmp * (1 - v * 0.72);
          const tatter = (1 - v) * (1 - v) * tatterAmp * (0.6 * Math.sin(ang * flutes + 0.8) + 0.4 * Math.cos(ang * (flutes + 3)));
          const rad = Math.max(0.04, baseR + pleat);
          const y = Math.max(0.01, v * height + tatter);
          pos[vp++] = Math.sin(ang) * rad;
          pos[vp++] = y;
          pos[vp++] = Math.cos(ang) * rad;
          uvs[up++] = u;
          uvs[up++] = v;
        }
      }

      const stride = radialSegs + 1;
      for (let r = 0; r < rings; r++) {
        for (let s = 0; s < radialSegs; s++) {
          const a = r * stride + s;
          const b = a + 1;
          const c = (r + 1) * stride + (s + 1);
          const d = (r + 1) * stride + s;
          indices.push(a, b, c, a, c, d);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return this.regGeo(geo);
    }

    _createOuterBatWingWebGeo(side, fingerTips, camberY, scallopDepth, camberZ) {
      // Builds a smooth, cambered 3D bat-wing membrane stretched from the wrist (0,0,0)
      // across 4 splayed wing-finger tips with scalloped trailing edges between fingers!
      const THREE = this.THREE;
      const webs = fingerTips.length - 1;
      const radialSteps = 7;
      const spanSteps = 5;
      const positions = [];
      const uvs = [];
      const indices = [];
      const cZ = camberZ || 0;

      for (let w = 0; w < webs; w++) {
        const fA = fingerTips[w];
        const fB = fingerTips[w + 1];
        const baseVert = positions.length / 3;

        for (let r = 0; r <= radialSteps; r++) {
          const t = r / radialSteps; // 0 = wrist, 1 = trailing scallop between tips
          // Match exact parabolic arch of finger tubes
          const archCurve = Math.sin(t * Math.PI);
          for (let s = 0; s <= spanSteps; s++) {
            const u = s / spanSteps;
            const scallop = scallopDepth * Math.sin(u * Math.PI) * t * t;
            const tEff = t * (1 - scallop);

            const xA = side * fA[0] * tEff;
            const yA = fA[1] * tEff + archCurve * fA[3];
            const zA = fA[2] * tEff + archCurve * fA[4];

            const xB = side * fB[0] * tEff;
            const yB = fB[1] * tEff + archCurve * fB[3];
            const zB = fB[2] * tEff + archCurve * fB[4];

            const sail = Math.sin(u * Math.PI) * Math.sin(t * Math.PI);
            positions.push(
              lerp(xA, xB, u),
              lerp(yA, yB, u) + camberY * sail,
              lerp(zA, zB, u) + cZ * sail
            );
            uvs.push((w + u) / webs, t);
          }
        }

        const stride = spanSteps + 1;
        for (let r = 0; r < radialSteps; r++) {
          for (let s = 0; s < spanSteps; s++) {
            const i0 = baseVert + r * stride + s;
            const i1 = i0 + 1;
            const i2 = baseVert + (r + 1) * stride + (s + 1);
            const i3 = baseVert + (r + 1) * stride + s;
            if (side > 0) {
              indices.push(i0, i1, i2, i0, i2, i3);
            } else {
              indices.push(i0, i2, i1, i0, i3, i2);
            }
          }
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return this.regGeo(geo);
    }

    _createUprightBatWingInnerWebGeo(side, elbowPt, wristPt, innerFinger, spineBotPt, camberZ) {
      // Builds a towering upright X-Y demon inner bat-wing membrane facing +Z:
      // u = 0..1 from Balrog spine out to wrist/inner-finger; v = 0..1 from top arm-bone down to scalloped bottom edge!
      const THREE = this.THREE;
      const uSteps = 8;
      const vSteps = 6;
      const positions = [];
      const uvs = [];
      const indices = [];

      const endTrailX = side * (wristPt[0] + innerFinger[0]);
      const endTrailY = wristPt[1] + innerFinger[1];
      const endTrailZ = wristPt[2] + innerFinger[2];

      for (let iu = 0; iu <= uSteps; iu++) {
        const u = iu / uSteps;
        // Top leading arm-bone curve (shoulder -> elbow -> wrist)
        let lx, ly, lz;
        if (u < 0.5) {
          const k = u * 2;
          lx = lerp(0, side * elbowPt[0], k);
          ly = lerp(0.08, elbowPt[1], k) + Math.sin(k * Math.PI) * 0.08;
          lz = lerp(-0.06, elbowPt[2], k);
        } else {
          const k = (u - 0.5) * 2;
          lx = lerp(side * elbowPt[0], side * wristPt[0], k);
          ly = lerp(elbowPt[1], wristPt[1], k) + Math.sin(k * Math.PI) * 0.06;
          lz = lerp(elbowPt[2], wristPt[2], k);
        }

        // Bottom scalloped trailing edge in X-Y (arches dramatically upward between spine & inner finger tip!)
        const scallopY = Math.sin(u * Math.PI) * 0.54;
        const tx = lerp(0, endTrailX, u);
        const ty = lerp(spineBotPt[1], endTrailY, u) + scallopY;
        const tz = lerp(spineBotPt[2], endTrailZ, u) - Math.sin(u * Math.PI) * 0.08;

        for (let iv = 0; iv <= vSteps; iv++) {
          const v = iv / vSteps;
          // At u = 1 (outer seam), follow exact Finger 4 arch curve so inner & outer webs join seamlessly!
          const fingerArchY = u * u * Math.sin(v * Math.PI) * innerFinger[3];
          const fingerArchZ = u * u * Math.sin(v * Math.PI) * innerFinger[4];
          const billowZ = (camberZ || -0.18) * Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
          positions.push(
            lerp(lx, tx, v),
            lerp(ly, ty, v) + fingerArchY,
            lerp(lz, tz, v) + fingerArchZ + billowZ
          );
          uvs.push(u, v);
        }
      }

      const stride = vSteps + 1;
      for (let iu = 0; iu < uSteps; iu++) {
        for (let iv = 0; iv < vSteps; iv++) {
          const i0 = iu * stride + iv;
          const i1 = i0 + 1;
          const i2 = (iu + 1) * stride + (iv + 1);
          const i3 = (iu + 1) * stride + iv;
          if (side > 0) {
            indices.push(i0, i1, i2, i0, i2, i3);
          } else {
            indices.push(i0, i2, i1, i0, i3, i2);
          }
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return this.regGeo(geo);
    }

    _createInnerBatWingWebGeo(side, elbowPt, wristPt, wristTrailPt, rootBackPt, camberY) {
      // Smooth curved inner wing membrane connecting shoulder (0,0,0), elbow, wrist, inner finger trail, and back flank
      const THREE = this.THREE;
      const uSteps = 8;
      const vSteps = 6;
      const positions = [];
      const uvs = [];
      const indices = [];

      for (let iu = 0; iu <= uSteps; iu++) {
        const u = iu / uSteps; // 0 = body flank, 1 = wrist
        // Leading edge along humerus -> elbow -> wrist
        let lx, ly, lz;
        if (u < 0.5) {
          const k = u * 2;
          lx = lerp(0, side * elbowPt[0], k);
          ly = lerp(0.04, elbowPt[1], k) + Math.sin(k * Math.PI) * 0.05;
          lz = lerp(0.18, elbowPt[2], k);
        } else {
          const k = (u - 0.5) * 2;
          lx = lerp(side * elbowPt[0], side * wristPt[0], k);
          ly = lerp(elbowPt[1], wristPt[1], k) + Math.sin(k * Math.PI) * 0.05;
          lz = lerp(elbowPt[2], wristPt[2], k);
        }

        // Trailing edge from body back-flank to inner finger tip with bat-wing scallop
        const scallop = Math.sin(u * Math.PI) * 0.34;
        const tx = lerp(0, side * wristTrailPt[0], u);
        const ty = lerp(rootBackPt[1], wristTrailPt[1], u) - scallop * 0.12;
        const tz = lerp(rootBackPt[2], wristTrailPt[2], u) + scallop;

        for (let iv = 0; iv <= vSteps; iv++) {
          const v = iv / vSteps; // 0 = leading bone, 1 = trailing edge
          const billow = camberY * Math.sin(v * Math.PI) * Math.sin(u * Math.PI);
          positions.push(
            lerp(lx, tx, v),
            lerp(ly, ty, v) + billow,
            lerp(lz, tz, v)
          );
          uvs.push(u, v);
        }
      }

      const stride = vSteps + 1;
      for (let iu = 0; iu < uSteps; iu++) {
        for (let iv = 0; iv < vSteps; iv++) {
          const i0 = iu * stride + iv;
          const i1 = i0 + 1;
          const i2 = (iu + 1) * stride + (iv + 1);
          const i3 = (iu + 1) * stride + iv;
          if (side > 0) {
            indices.push(i0, i2, i1, i0, i3, i2);
          } else {
            indices.push(i0, i1, i2, i0, i2, i3);
          }
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return this.regGeo(geo);
    }

    _buildGeometries() {
      const THREE = this.THREE;
      const g = this.geos;

      // Clean low-overhead accent primitives (rivets, eyeballs, rings, joints)
      g.sphere = this.regGeo(new THREE.SphereGeometry(1, 12, 10));
      g.sphereLow = this.regGeo(new THREE.SphereGeometry(1, 8, 7));
      g.cyl = this.regGeo(new THREE.CylinderGeometry(1, 1, 1, 12));
      g.cyl8 = this.regGeo(new THREE.CylinderGeometry(1, 1, 1, 8));
      g.cone8 = this.regGeo(new THREE.ConeGeometry(1, 1, 8));
      g.cone5 = this.regGeo(new THREE.ConeGeometry(1, 1, 5));
      g.octa = this.regGeo(new THREE.OctahedronGeometry(1, 0));
      g.dodeca = this.regGeo(new THREE.DodecahedronGeometry(1, 0));
      g.ring = this.regGeo(new THREE.RingGeometry(0.82, 1.0, 28));
      g.disc = this.regGeo(new THREE.CircleGeometry(1, 20));
      g.torusThin = this.regGeo(new THREE.TorusGeometry(1, 0.05, 7, 24));
      g.torusLink = this.regGeo(new THREE.TorusGeometry(1, 0.24, 6, 12));

      const shaftUp = new THREE.CylinderGeometry(1, 1, 1, 8);
      shaftUp.translate(0, 0.5, 0);
      g.shaftUp = this.regGeo(shaftUp);

      const spikeUp = new THREE.ConeGeometry(1, 1, 6);
      spikeUp.translate(0, 0.5, 0);
      g.spikeUp = this.regGeo(spikeUp);

      // Curved shoulder/tasset armor shell (68-degree cylindrical arc segment)
      const pauldronShell = new THREE.SphereGeometry(1, 10, 7, 0, Math.PI * 0.85, 0.12, Math.PI * 0.52);
      pauldronShell.computeVertexNormals();
      g.pauldronShell = this.regGeo(pauldronShell);

      // Billowing back-cape hanging downward from shoulders (y: 0 -> -1, facing -Z)
      const capeCyl = new THREE.CylinderGeometry(0.54, 1.02, 1.0, 12, 4, true, Math.PI * 0.62, Math.PI * 0.76);
      capeCyl.translate(0, -0.5, -0.06);
      capeCyl.computeVertexNormals();
      g.capeCloak = this.regGeo(capeCyl);

      // ----------------------------------------------------------------------
      // ANATOMICAL LATHE GEOMETRIES (strictly increasing Y for outward normals)
      // ----------------------------------------------------------------------
      // 1. Sculpted limb hanging downward (y: -1.0 ankle/wrist -> 0.0 hip/shoulder joint)
      g.sculptedLimb = this._latheFromPairs([
        [0.0, -1.00], [0.58, -0.98], [0.66, -0.84], [0.76, -0.62],
        [0.68, -0.46], [0.96, -0.26], [0.92, -0.08], [0.62, 0.02], [0.0, 0.04]
      ], 10);

      // 2. Heavy bulging muscular forearm / calf (y: -1.0 wrist -> 0.0 elbow)
      g.muscleForearm = this._latheFromPairs([
        [0.0, -1.00], [0.72, -0.97], [0.78, -0.78], [1.14, -0.44],
        [1.06, -0.18], [0.76, -0.02], [0.0, 0.04]
      ], 11);

      // 3. V-Tapered Warrior Torso (y: 0 pelvis -> 1.0 collar)
      g.warriorTorso = this._latheFromPairs([
        [0.0, 0.0], [0.74, 0.02], [0.68, 0.24], [0.78, 0.48],
        [0.98, 0.74], [1.04, 0.88], [0.72, 0.98], [0.0, 1.0]
      ], 12);

      // 4. Wiry Hunched Goblin Ribcage
      g.goblinTorso = this._latheFromPairs([
        [0.0, 0.0], [0.62, 0.03], [0.56, 0.28], [0.88, 0.62],
        [0.92, 0.82], [0.58, 0.97], [0.0, 1.0]
      ], 10);

      // 5. Hulking Barrel-Chested Olog-hai Stone Torso
      g.trollTorso = this._latheFromPairs([
        [0.0, 0.0], [0.84, 0.03], [0.92, 0.25], [0.86, 0.42],
        [1.10, 0.68], [1.16, 0.84], [0.82, 0.97], [0.0, 1.0]
      ], 14);

      // 6. Heroic V-Tapered Balrog Demon Torso
      g.balrogTorso = this._latheFromPairs([
        [0.0, 0.0], [0.68, 0.03], [0.62, 0.26], [0.84, 0.54],
        [1.14, 0.78], [1.18, 0.90], [0.78, 0.98], [0.0, 1.0]
      ], 14);

      // 7. Mordor Flared Kettle Helm
      g.kettleHelm = this._latheFromPairs([
        [0.82, 0.0], [1.18, 0.04], [0.96, 0.22], [0.92, 0.56],
        [0.74, 0.84], [0.36, 0.96], [0.0, 1.02]
      ], 12);

      // 8. Isengard Rounded Uruk War-Helm Bowl
      g.urukHelm = this._latheFromPairs([
        [0.94, 0.0], [1.02, 0.14], [1.00, 0.58], [0.84, 0.84],
        [0.48, 0.97], [0.0, 1.02]
      ], 12);

      // 9. Warg Deep-Chested Lupine Body (rotated along +Z: tail -Z to chest +Z)
      const wargLathe = this._latheFromPairs([
        [0.0, -0.82], [0.24, -0.76], [0.34, -0.52], [0.30, -0.18],
        [0.39, 0.16], [0.49, 0.48], [0.45, 0.74], [0.28, 0.88], [0.0, 0.92]
      ], 12);
      wargLathe.rotateX(HALF_PI);
      g.wargBody = wargLathe;

      // 10. Aerodynamic Keeled Fell Beast Drake Body (+Z forward)
      const drakeLathe = this._latheFromPairs([
        [0.0, -1.05], [0.16, -0.92], [0.28, -0.52], [0.38, -0.05],
        [0.46, 0.42], [0.41, 0.78], [0.24, 0.98], [0.0, 1.05]
      ], 12);
      drakeLathe.rotateX(HALF_PI);
      g.drakeBody = drakeLathe;

      // 11. Iron-Banded Octagonal Olog-hai Stone Maul Head (along Y, centered)
      g.maulHead = this._latheFromPairs([
        [0.0, -0.62], [0.36, -0.60], [0.44, -0.48], [0.40, -0.36],
        [0.41, -0.12], [0.46, -0.08], [0.46, 0.08], [0.41, 0.12],
        [0.40, 0.36], [0.44, 0.48], [0.36, 0.60], [0.0, 0.62]
      ], 8);

      // 12. Cloven Demon Hoof
      g.demonHoof = this._latheFromPairs([
        [0.0, 0.0], [1.05, 0.02], [0.96, 0.32], [0.74, 0.76], [0.62, 1.0], [0.0, 1.0]
      ], 10);

      // 13. Sculpted Pleated & Tattered Gothic Robes
      g.wraithRobe = this._createFlutedRobeGeo(0.24, 0.66, 1.48, 18, 8, 9, 0.075, 0.16);
      g.nazgulRobe = this._createFlutedRobeGeo(0.36, 1.02, 2.15, 20, 9, 10, 0.085, 0.12);
      g.witchlordSkirt = this._createFlutedRobeGeo(0.46, 1.08, 2.20, 20, 8, 8, 0.075, 0.10);

      // 14. Sculpted Peaked Hood Cowl (open face toward +Z)
      const hoodProfile = this._latheFromPairs([
        [0.34, 0.0], [0.38, 0.22], [0.35, 0.56], [0.22, 0.85], [0.05, 1.06], [0.0, 1.12]
      ], 12);
      g.peakedHood = hoodProfile;

      // ----------------------------------------------------------------------
      // SCULPTED EXTRUDE GEOMETRIES (Blades, Crests, Shields, Crowns, Flames)
      // ----------------------------------------------------------------------
      // 1. Notched Curved Cave-Goblin Dagger (extends +Y from 0..1, sharp edge toward +Z)
      const gobDag = new THREE.Shape();
      gobDag.moveTo(0, -0.03);
      gobDag.lineTo(0.05, 0.0);
      gobDag.quadraticCurveTo(0.11, 0.38, 0.07, 0.72);
      gobDag.quadraticCurveTo(0.04, 0.92, -0.03, 1.0); // hooked point
      gobDag.lineTo(-0.04, 0.74);
      gobDag.lineTo(-0.005, 0.66); // scavenged spine notch!
      gobDag.lineTo(-0.045, 0.60);
      gobDag.lineTo(-0.04, 0.0);
      gobDag.closePath();
      const gobDagGeo = this._extrudeShape(gobDag, 0.022, 0.008, 0.008);
      gobDagGeo.rotateY(-HALF_PI); // blade plane in Y-Z!
      g.goblinDagger = gobDagGeo;

      // 2. Mordor Jagged Broad-Tipped Orc Scimitar (Y: 0 -> 1, cutting edge +Z)
      const scim = new THREE.Shape();
      scim.moveTo(-0.04, 0.0);
      scim.lineTo(0.05, 0.0);
      scim.quadraticCurveTo(0.09, 0.45, 0.16, 0.82);
      scim.lineTo(0.06, 1.02); // broad angled Mordor cleaver tip!
      scim.lineTo(-0.10, 0.86); // wicked dorsal back-spike!
      scim.lineTo(-0.04, 0.76);
      scim.lineTo(-0.05, 0.46);
      scim.lineTo(-0.015, 0.41); // jagged spine notch
      scim.lineTo(-0.05, 0.36);
      scim.closePath();
      const scimGeo = this._extrudeShape(scim, 0.028, 0.010, 0.010);
      scimGeo.rotateY(-HALF_PI);
      g.orcScimitar = scimGeo;

      // 3. Battered Mordor Heater-Shield with Jagged Rim (UV normalized 0..1 for Red Eye!)
      const shShape = new THREE.Shape();
      shShape.moveTo(-0.30, 0.42);
      shShape.lineTo(-0.12, 0.46);
      shShape.lineTo(-0.06, 0.40); // battle notch
      shShape.lineTo(0.04, 0.46);
      shShape.lineTo(0.30, 0.42);
      shShape.quadraticCurveTo(0.33, 0.02, 0.22, -0.28);
      shShape.lineTo(0.0, -0.48);
      shShape.lineTo(-0.22, -0.28);
      shShape.quadraticCurveTo(-0.33, 0.02, -0.30, 0.42);
      const shGeo = new THREE.ExtrudeGeometry(shShape, {
        steps: 1,
        curveSegments: 5,
        depth: 0.055,
        bevelEnabled: true,
        bevelThickness: 0.016,
        bevelSize: 0.016,
        bevelSegments: 1
      });
      // Normalize UVs cleanly across [-0.33..0.33, -0.48..0.46] so Red Eye sits dead-center!
      const shPos = shGeo.attributes.position;
      const shUv = shGeo.attributes.uv;
      for (let i = 0; i < shPos.count; i++) {
        const px = shPos.getX(i);
        const py = shPos.getY(i);
        shUv.setXY(i, clamp((px + 0.33) / 0.66, 0, 1), clamp((py + 0.48) / 0.94, 0, 1));
      }
      shGeo.computeVertexNormals();
      g.orcShield = this.regGeo(shGeo);

      // 4. Massive Two-Handed Isengard Uruk-hai Berserker Pike-Cleaver
      const cleav = new THREE.Shape();
      cleav.moveTo(-0.045, 0.0);
      cleav.lineTo(0.065, 0.0);
      cleav.lineTo(0.115, 0.68);
      cleav.lineTo(0.145, 0.98); // heavy square-angled chopping tip
      cleav.lineTo(-0.035, 1.03);
      cleav.lineTo(-0.18, 0.84); // iconic rear Berserker armor-hook!
      cleav.lineTo(-0.05, 0.74);
      cleav.lineTo(-0.045, 0.0);
      const cleavGeo = this._extrudeShape(cleav, 0.032, 0.012, 0.012);
      cleavGeo.rotateY(-HALF_PI);
      g.urukCleaver = cleavGeo;

      // 5. Tall Sweeping Isengard Berserker Sagittal Helm Crest (in Y-Z plane)
      const crest = new THREE.Shape();
      crest.moveTo(-0.22, -0.06);
      crest.quadraticCurveTo(-0.30, 0.22, -0.18, 0.42);
      crest.quadraticCurveTo(0.06, 0.54, 0.30, 0.34); // sweeping tall brow peak!
      crest.quadraticCurveTo(0.24, 0.10, 0.18, -0.04);
      crest.quadraticCurveTo(0.0, 0.06, -0.22, -0.06);
      const crestGeo = this._extrudeShape(crest, 0.032, 0.008, 0.008);
      crestGeo.rotateY(HALF_PI); // Z = forward!
      g.urukCrest = crestGeo;

      // 6. Barbed Warg-Raider Spearhead
      const spShape = new THREE.Shape();
      spShape.moveTo(0, 1.0);
      spShape.quadraticCurveTo(0.14, 0.55, 0.22, 0.08);
      spShape.lineTo(0.07, 0.22); // right barb
      spShape.lineTo(0.04, 0.0);
      spShape.lineTo(-0.04, 0.0);
      spShape.lineTo(-0.07, 0.22); // left barb
      spShape.lineTo(-0.22, 0.08);
      spShape.quadraticCurveTo(-0.14, 0.55, 0, 1.0);
      g.barbedSpear = this._extrudeShape(spShape, 0.035, 0.012, 0.012);

      // 7. Ornate Morgul / Nazgûl Longsword Blade & Swept Bat-Wing Crossguard
      const mBlade = new THREE.Shape();
      mBlade.moveTo(-0.065, 0.0);
      mBlade.lineTo(0.065, 0.0);
      mBlade.lineTo(0.095, 0.10); // ricasso flare
      mBlade.lineTo(0.055, 0.18);
      mBlade.lineTo(0.038, 0.84);
      mBlade.lineTo(0.0, 1.0);
      mBlade.lineTo(-0.038, 0.84);
      mBlade.lineTo(-0.055, 0.18);
      mBlade.lineTo(-0.095, 0.10);
      mBlade.closePath();
      g.morgulBlade = this._extrudeShape(mBlade, 0.022, 0.009, 0.009);

      const mGuard = new THREE.Shape();
      mGuard.moveTo(0, 0.06);
      mGuard.quadraticCurveTo(0.20, 0.05, 0.36, 0.16);
      mGuard.lineTo(0.30, -0.04);
      mGuard.quadraticCurveTo(0.14, -0.05, 0, -0.06);
      mGuard.quadraticCurveTo(-0.14, -0.05, -0.30, -0.04);
      mGuard.lineTo(-0.36, 0.16);
      mGuard.quadraticCurveTo(-0.20, 0.05, 0, 0.06);
      g.morgulGuard = this._extrudeShape(mGuard, 0.045, 0.012, 0.012);

      // 8. Faceted Gothic Crown Lancet Spike (for Ringwraith 7-spike & Angmar 8-spike crowns!)
      const cSpike = new THREE.Shape();
      cSpike.moveTo(-0.08, 0.0);
      cSpike.lineTo(0.08, 0.0);
      cSpike.lineTo(0.11, 0.26);
      cSpike.lineTo(0.045, 0.34);
      cSpike.lineTo(0.055, 0.64);
      cSpike.lineTo(0.0, 1.0);
      cSpike.lineTo(-0.055, 0.64);
      cSpike.lineTo(-0.045, 0.34);
      cSpike.lineTo(-0.11, 0.26);
      cSpike.closePath();
      g.crownLancet = this._extrudeShape(cSpike, 0.028, 0.010, 0.010);

      // 9. Balrog Colossal Jagged Flaming Greatsword (Y: 0 -> 1)
      const bSword = new THREE.Shape();
      bSword.moveTo(-0.09, 0.0);
      bSword.lineTo(0.09, 0.0);
      bSword.lineTo(0.16, 0.16);
      bSword.lineTo(0.08, 0.24);
      bSword.lineTo(0.15, 0.44);
      bSword.lineTo(0.07, 0.52);
      bSword.lineTo(0.14, 0.72);
      bSword.lineTo(0.06, 0.80);
      bSword.lineTo(0.09, 0.92);
      bSword.lineTo(0.0, 1.02);
      bSword.lineTo(-0.09, 0.90);
      bSword.lineTo(-0.05, 0.76);
      bSword.lineTo(-0.13, 0.66);
      bSword.lineTo(-0.06, 0.50);
      bSword.lineTo(-0.14, 0.38);
      bSword.lineTo(-0.07, 0.22);
      bSword.lineTo(-0.15, 0.12);
      bSword.closePath();
      const bSwordGeo = this._extrudeShape(bSword, 0.042, 0.016, 0.016);
      bSwordGeo.rotateY(-HALF_PI);
      g.balrogFlameSword = bSwordGeo;

      // 10. Curved Licking Flame Tongue (for Balrog dorsal mane & Witch-lord runesword fire)
      const fTongue = new THREE.Shape();
      fTongue.moveTo(-0.12, 0.0);
      fTongue.quadraticCurveTo(0.14, 0.25, 0.08, 0.62);
      fTongue.quadraticCurveTo(0.04, 0.84, -0.08, 1.0);
      fTongue.quadraticCurveTo(-0.04, 0.65, -0.14, 0.42);
      fTongue.quadraticCurveTo(-0.08, 0.20, -0.12, 0.0);
      const ftGeo = this._extrudeShape(fTongue, 0.025, 0.008, 0.008);
      ftGeo.rotateY(HALF_PI);
      g.flameTongue = ftGeo;

      // 11. Fell Beast Tail Spade & Dorsal Scute Fin
      const spade = new THREE.Shape();
      spade.moveTo(0, 0.34);
      spade.lineTo(0.22, -0.06);
      spade.lineTo(0.07, 0.04);
      spade.lineTo(0, -0.36);
      spade.lineTo(-0.07, 0.04);
      spade.lineTo(-0.22, -0.06);
      spade.closePath();
      const spadeGeo = this._extrudeShape(spade, 0.03, 0.01, 0.01);
      spadeGeo.rotateX(HALF_PI);
      g.tailSpade = spadeGeo;

      // 12. Curved Tattered Cloth Strip (for Wraith & Ringwraith floating shrouds)
      g.clothTatter = this._taperedTube([
        [0, 0, 0],
        [0.02, -0.32, -0.08],
        [-0.02, -0.68, -0.20],
        [0.01, -1.02, -0.34]
      ], 10, 0.11, 0.018, 4, 0, 0);

      // ----------------------------------------------------------------------
      // ORGANIC TAPERED TUBE GEOMETRIES (Horns, Tusks, Tails, Necks, Chains, Whips, Wing-Bones)
      // ----------------------------------------------------------------------
      // Goblin swept-back bat ear (+X; mirror for -X)
      g.goblinEarL = this._taperedTube([
        [0, 0, 0], [0.10, 0.04, -0.03], [0.22, 0.10, -0.09], [0.31, 0.14, -0.15]
      ], 8, 0.052, 0.008, 6, 0, 0);
      g.goblinEarR = this._taperedTube([
        [0, 0, 0], [-0.10, 0.04, -0.03], [-0.22, 0.10, -0.09], [-0.31, 0.14, -0.15]
      ], 8, 0.052, 0.008, 6, 0, 0);

      // Upward-curving Orc/Troll Tusk
      g.curvedTusk = this._taperedTube([
        [0, 0, 0], [0.02, 0.03, 0.08], [0.03, 0.11, 0.14], [0.02, 0.21, 0.15]
      ], 8, 0.042, 0.006, 6, 0, 0);

      // Bushy S-curved Warg Wolf Tail
      g.wargTail = this._taperedTube([
        [0, 0, 0], [0, -0.06, -0.26], [0, -0.22, -0.56], [0, -0.28, -0.86], [0, -0.18, -1.06]
      ], 12, 0.11, 0.025, 8, 5, 0.12);

      // Troll Heavy Catenary Belly/Chest Chain
      g.trollBellyChain = this._taperedTube([
        [-0.96, 0.65, 0.18], [-0.62, 0.12, 0.66], [0.0, -0.18, 0.84], [0.62, 0.12, 0.66], [0.96, 0.65, 0.18]
      ], 16, 0.068, 0.068, 7, 14, 0.28);

      // Fell Beast Sinuous S-Curved Armored Neck & Long Whip-Tail
      g.fellNeck = this._taperedTube([
        [0, 0.10, 0.62], [0, 0.34, 1.12], [0, 0.78, 1.56], [0, 0.88, 1.98], [0, 0.74, 2.32]
      ], 16, 0.26, 0.14, 9, 9, 0.08);

      g.fellTail = this._taperedTube([
        [0, 0.02, -0.72], [0.08, -0.14, -1.28], [-0.08, 0.14, -1.78], [0.0, 0.24, -2.28]
      ], 16, 0.19, 0.045, 8, 0, 0);

      // Fell Beast Curved Horn
      g.fellHornL = this._taperedTube([
        [0, 0, 0], [0.08, 0.10, -0.14], [0.16, 0.22, -0.34], [0.19, 0.32, -0.56]
      ], 10, 0.048, 0.006, 6, 6, 0.10);
      g.fellHornR = this._taperedTube([
        [0, 0, 0], [-0.08, 0.10, -0.14], [-0.16, 0.22, -0.34], [-0.19, 0.32, -0.56]
      ], 10, 0.048, 0.006, 6, 6, 0.10);

      // Fell Beast Wing Bones & Curved 4-Finger Bat-Wing Membranes (wingspan ~5.54u!)
      const fbElbow = [0.58, 0.12, 0.36];
      const fbWrist = [1.15, 0.08, 0.56];
      const fbFingers = [
        [1.32,  0.04,  0.18, 0.07, 0.14], // Finger 1 (outer leading)
        [1.18, -0.03, -0.46, 0.06, 0.08], // Finger 2
        [0.82, -0.07, -0.98, 0.05, 0.04], // Finger 3
        [0.32, -0.09, -1.24, 0.03, 0.02]  // Finger 4 (inner trailing, meets inner membrane!)
      ];
      g.fbArmL = this._taperedTube([[0, 0, 0.16], [fbElbow[0], fbElbow[1], fbElbow[2]], [fbWrist[0], fbWrist[1], fbWrist[2]]], 10, 0.075, 0.048, 7, 0, 0);
      g.fbArmR = this._taperedTube([[0, 0, 0.16], [-fbElbow[0], fbElbow[1], fbElbow[2]], [-fbWrist[0], fbWrist[1], fbWrist[2]]], 10, 0.075, 0.048, 7, 0, 0);

      g.fbFingersL = [];
      g.fbFingersR = [];
      for (let f = 0; f < fbFingers.length; f++) {
        const fn = fbFingers[f];
        const midX = fn[0] * 0.5;
        const midY = fn[1] * 0.5 + fn[3];
        const midZ = fn[2] * 0.5 + fn[4];
        g.fbFingersL.push(this._taperedTube([[0, 0, 0], [midX, midY, midZ], [fn[0], fn[1], fn[2]]], 9, 0.038, 0.010, 6, 0, 0));
        g.fbFingersR.push(this._taperedTube([[0, 0, 0], [-midX, midY, midZ], [-fn[0], fn[1], fn[2]]], 9, 0.038, 0.010, 6, 0, 0));
      }
      const fbInnerTrail = [fbWrist[0] + fbFingers[3][0], fbWrist[1] + fbFingers[3][1], fbWrist[2] + fbFingers[3][2]];
      g.fbInnerWebL = this._createInnerBatWingWebGeo(1, fbElbow, fbWrist, fbInnerTrail, [0, -0.08, -0.78], 0.09);
      g.fbInnerWebR = this._createInnerBatWingWebGeo(-1, fbElbow, fbWrist, fbInnerTrail, [0, -0.08, -0.78], 0.09);
      g.fbOuterWebL = this._createOuterBatWingWebGeo(1, fbFingers, 0.07, 0.24);
      g.fbOuterWebR = this._createOuterBatWingWebGeo(-1, fbFingers, 0.07, 0.24);

      // Witch-lord 3-Headed Iron Flail Splayed Chains (hanging from flailChainPivot)
      g.flailChainCenter = this._taperedTube([
        [0, 0, 0], [0.0, -0.45, 0.08], [0.0, -0.92, 0.14]
      ], 10, 0.032, 0.032, 6, 10, 0.30);
      g.flailChainLeft = this._taperedTube([
        [0, 0, 0], [0.16, -0.40, 0.02], [0.28, -0.82, 0.05]
      ], 10, 0.030, 0.030, 6, 10, 0.30);
      g.flailChainRight = this._taperedTube([
        [0, 0, 0], [-0.16, -0.40, -0.04], [-0.26, -0.86, -0.08]
      ], 10, 0.030, 0.030, 6, 10, 0.30);

      // Ringwraith Swirling Dark Mist Ribbon
      const mistPts = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const a = t * TWO_PI * 1.45;
        const r = lerp(1.05, 0.58, t);
        mistPts.push([Math.cos(a) * r, 0.18 + t * 2.35, Math.sin(a) * r]);
      }
      g.mistSpiral = this._taperedTube(mistPts, 24, 0.09, 0.015, 5, 0, 0);

      // ----------------------------------------------------------------------
      // BALROG PHASE 2 SCULPTED RAM HORNS, TAIL, WHIPS & COLOSSAL BAT-WINGS
      // ----------------------------------------------------------------------
      // Swept-back Corrugated Curved Ram/Demon Horns (outward -> back -> down -> forward!)
      g.balrogHornL = this._taperedTube([
        [0.0, 0.0, 0.0],
        [0.34, 0.18, -0.12],
        [0.68, 0.06, -0.34],
        [0.82, -0.24, -0.22],
        [0.74, -0.42, 0.18],
        [0.52, -0.32, 0.58]
      ], 18, 0.165, 0.016, 9, 13, 0.11);

      g.balrogHornR = this._taperedTube([
        [0.0, 0.0, 0.0],
        [-0.34, 0.18, -0.12],
        [-0.68, 0.06, -0.34],
        [-0.82, -0.24, -0.22],
        [-0.74, -0.42, 0.18],
        [-0.52, -0.32, 0.58]
      ], 18, 0.165, 0.016, 9, 13, 0.11);

      // Balrog Muscular Spiked Demon Tail (curled menacingly so studio portrait zooms in closely!)
      g.balrogTail = this._taperedTube([
        [0, 0, 0], [0.10, -0.36, -0.58], [-0.10, -0.52, -1.16], [0.0, -0.18, -1.68]
      ], 16, 0.24, 0.04, 8, 8, 0.08);

      // Balrog Coiling Multi-Thonged Fiery Whip (coiled wide S-curve in X-Y-Z above y = 0!)
      g.balrogWhipMain = this._taperedTube([
        [0.0, 0.0, 0.0],
        [0.48, -0.24, 0.42],
        [0.92, -0.56, 0.96],
        [0.36, -0.74, 1.54],
        [0.86, -0.44, 1.98],
        [0.42, -0.08, 2.28]
      ], 26, 0.084, 0.018, 7, 0, 0);

      g.balrogWhipThongA = this._taperedTube([
        [0.0, 0.0, 0.0],
        [0.32, -0.34, 0.40],
        [0.58, -0.68, 0.92],
        [0.92, -0.78, 1.44],
        [0.48, -0.58, 1.88]
      ], 20, 0.056, 0.014, 6, 0, 0);

      g.balrogWhipThongB = this._taperedTube([
        [0.0, 0.0, 0.0],
        [0.54, -0.16, 0.36],
        [0.98, -0.32, 0.88],
        [0.62, -0.42, 1.42],
        [1.04, -0.16, 1.82]
      ], 20, 0.052, 0.014, 6, 0, 0);

      // Balrog Colossal Upright Arched X-Y Demon Bat-Wings facing +Z (~9.6u world wingspan @ 1.32x!)
      const bwElbow = [1.08, 1.25, -0.14];
      const bwWrist = [1.80, 1.88, -0.05];
      const bwFingers = [
        [1.40,  0.46,  0.08, 0.16, -0.10], // Finger 1 (soaring upper-outer wingtip!)
        [1.44, -0.60, -0.03, 0.10, -0.12], // Finger 2 (wide mid-upper dactyl)
        [1.04, -1.68, -0.14, 0.05, -0.10], // Finger 3 (sweeping lower-mid dactyl)
        [0.36, -2.32, -0.24, 0.02, -0.06]  // Finger 4 (inner trailing dactyl meeting inner web!)
      ];
      g.bwArmL = this._taperedTube([[0, 0.08, -0.06], [bwElbow[0], bwElbow[1], bwElbow[2]], [bwWrist[0], bwWrist[1], bwWrist[2]]], 12, 0.155, 0.095, 8, 0, 0);
      g.bwArmR = this._taperedTube([[0, 0.08, -0.06], [-bwElbow[0], bwElbow[1], bwElbow[2]], [-bwWrist[0], bwWrist[1], bwWrist[2]]], 12, 0.155, 0.095, 8, 0, 0);

      g.bwFingersL = [];
      g.bwFingersR = [];
      for (let f = 0; f < bwFingers.length; f++) {
        const fn = bwFingers[f];
        const midX = fn[0] * 0.5;
        const midY = fn[1] * 0.5 + fn[3];
        const midZ = fn[2] * 0.5 + fn[4];
        g.bwFingersL.push(this._taperedTube([[0, 0, 0], [midX, midY, midZ], [fn[0], fn[1], fn[2]]], 11, 0.072, 0.018, 7, 0, 0));
        g.bwFingersR.push(this._taperedTube([[0, 0, 0], [-midX, midY, midZ], [-fn[0], fn[1], fn[2]]], 11, 0.072, 0.018, 7, 0, 0));
      }
      g.bwInnerWebL = this._createUprightBatWingInnerWebGeo(1, bwElbow, bwWrist, bwFingers[3], [0, -1.92, -0.28], -0.20);
      g.bwInnerWebR = this._createUprightBatWingInnerWebGeo(-1, bwElbow, bwWrist, bwFingers[3], [0, -1.92, -0.28], -0.20);
      g.bwOuterWebL = this._createOuterBatWingWebGeo(1, bwFingers, 0.0, 0.25, -0.18);
      g.bwOuterWebR = this._createOuterBatWingWebGeo(-1, bwFingers, 0.0, 0.25, -0.18);
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      for (let i = 0; i < this.ownGeos.length; i++) {
        if (this.ownGeos[i] && this.ownGeos[i].dispose) this.ownGeos[i].dispose();
      }
      for (let i = 0; i < this.ownMats.length; i++) {
        if (this.ownMats[i] && this.ownMats[i].dispose) this.ownMats[i].dispose();
      }
      for (let i = 0; i < this.ownTexs.length; i++) {
        if (this.ownTexs[i] && this.ownTexs[i].dispose) this.ownTexs[i].dispose();
      }
      this.ownGeos.length = 0;
      this.ownMats.length = 0;
      this.ownTexs.length = 0;
    }
  }

  let defaultBank = null;

  function resolveBankAndOpts(sharedOrOpts, maybeOpts) {
    let hostCache = null;
    let opts = maybeOpts || null;

    if (sharedOrOpts && typeof sharedOrOpts === 'object') {
      if (
        sharedOrOpts.isEnemyAssetBank ||
        sharedOrOpts.THREE ||
        typeof sharedOrOpts.regGeo === 'function' ||
        (sharedOrOpts.geos && sharedOrOpts.mats)
      ) {
        hostCache = sharedOrOpts;
      } else {
        opts = sharedOrOpts;
      }
    } else if (typeof sharedOrOpts === 'number') {
      opts = { phase: sharedOrOpts };
    }

    if (hostCache && hostCache.isEnemyAssetBank && !hostCache.disposed) {
      return { bank: hostCache, opts: opts || {} };
    }

    const THREE = (hostCache && hostCache.THREE) || (typeof window !== 'undefined' ? window.THREE : null);
    if (!THREE) {
      throw new Error('TD.EnemyModels3D requires window.THREE');
    }

    if (hostCache) {
      if (!hostCache._enemyAssetBank || hostCache._enemyAssetBank.disposed) {
        hostCache._enemyAssetBank = new EnemyAssetBank(THREE, hostCache);
      }
      return { bank: hostCache._enemyAssetBank, opts: opts || {} };
    }

    if (!defaultBank || defaultBank.disposed) {
      defaultBank = new EnemyAssetBank(THREE, null);
    }
    return { bank: defaultBank, opts: opts || {} };
  }

  // ============================================================================
  // 3. MESH & SHADOW FINALIZATION HELPERS
  // ============================================================================
  function mesh(THREE, geo, mat, sx, sy, sz) {
    const m = new THREE.Mesh(geo, mat);
    if (sx !== undefined) {
      m.scale.set(sx, sy !== undefined ? sy : sx, sz !== undefined ? sz : sx);
    }
    m.userData.baseMat = mat;
    return m;
  }

  function finalizeRig(root, rig) {
    const flashMeshes = [];
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      if (!obj.userData.baseMat) obj.userData.baseMat = obj.material;
      if (obj.userData.noShadow) {
        obj.castShadow = false;
        obj.receiveShadow = false;
        return;
      }
      const mat = obj.material;
      const isTrans = Boolean(mat && mat.transparent);
      if (!isTrans) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (!obj.userData.noFlash) flashMeshes.push(obj);
      } else {
        obj.castShadow = Boolean(obj.userData.forceShadow);
        obj.receiveShadow = false;
      }
    });
    rig.group = root;
    rig.root = root;
    rig.flashMeshes = flashMeshes;
    rig.animate = function(enemy, dt, time, ctx) {
      return updateEnemyRig(rig, enemy, dt, time, ctx);
    };
    rig.update = rig.animate;
    root.userData.rig = rig;
    return rig;
  }

  // ============================================================================
  // 4. SCULPTED BUILDERS FOR ALL 10 ENEMY & BOSS RIGS
  // ============================================================================

  // 1. GOBLIN SCAVENGER
  function buildGoblinRig(bank) {
    const THREE = bank.THREE;
    const g = bank.geos;
    const m = bank.mats;

    const root = new THREE.Group();
    const bodyRoot = new THREE.Group();
    root.add(bodyRoot);

    // Wiry crouched cave-goblin legs with leather shin-wraps & 3-clawed feet
    const buildGoblinLeg = (side, stridePose) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.145, 0.50, 0);
      hip.rotation.x = stridePose;

      const thigh = mesh(THREE, g.sculptedLimb, m.goblinCloth, 0.085, 0.27, 0.09);
      thigh.rotation.x = -0.22;
      const shin = mesh(THREE, g.sculptedLimb, m.leatherWorn, 0.072, 0.25, 0.078);
      shin.position.set(0, -0.24, 0.05);
      shin.rotation.x = 0.22;
      const foot = mesh(THREE, g.sphereLow, m.goblinSkin, 0.068, 0.042, 0.12);
      foot.position.set(0, -0.48, 0.09);
      hip.add(thigh, shin, foot);
      for (let c = -1; c <= 1; c++) {
        const claw = mesh(THREE, g.spikeUp, m.boneIvory, 0.015, 0.055, 0.015);
        claw.rotation.x = HALF_PI;
        claw.position.set(c * 0.024, -0.49, 0.18);
        hip.add(claw);
      }
      return hip;
    };

    const legL = buildGoblinLeg(-1, 0.20);
    const legR = buildGoblinLeg(1, -0.20);
    bodyRoot.add(legL, legR);

    // Hunched wiry ribcage, ragged loincloth, war-belt & pouch
    const pelvis = mesh(THREE, g.cyl8, m.leatherDark, 0.17, 0.14, 0.15);
    pelvis.position.set(0, 0.52, 0.01);
    const loinFront = mesh(THREE, g.crownLancet, m.goblinCloth, 1.15, -0.32, 0.8);
    loinFront.position.set(0, 0.50, 0.15);
    const pouch = mesh(THREE, g.dodeca, m.leatherWorn, 0.065, 0.075, 0.055);
    pouch.position.set(0.16, 0.52, -0.08);
    bodyRoot.add(pelvis, loinFront, pouch);

    const torso = mesh(THREE, g.goblinTorso, m.goblinSkin, 0.25, 0.44, 0.22);
    torso.position.set(0, 0.55, -0.02);
    torso.rotation.x = 0.42; // hunched predatory cave crouch!
    const tunic = mesh(THREE, g.goblinTorso, m.goblinCloth, 0.265, 0.36, 0.235);
    tunic.position.set(0, 0.55, -0.02);
    tunic.rotation.x = 0.42;
    const strap = mesh(THREE, g.torusThin, m.leatherWorn, 0.23, 0.28, 1.2);
    strap.position.set(0, 0.78, 0.09);
    strap.rotation.set(0.55, 0.42, 0.65);
    bodyRoot.add(torso, tunic, strap);

    // Scavenged stitched leather shoulder pad + iron studs on left shoulder (+X)
    const leatherPad = mesh(THREE, g.pauldronShell, m.leatherWorn, 0.19, 0.17, 0.20);
    leatherPad.position.set(0.24, 0.90, 0.12);
    leatherPad.rotation.set(0.2, -0.45, -0.35);
    const padSpike = mesh(THREE, g.spikeUp, m.ironForged, 0.032, 0.11, 0.032);
    padSpike.position.set(0.32, 0.98, 0.13);
    padSpike.rotation.z = -0.52;
    bodyRoot.add(leatherPad, padSpike);

    // Sculpted Goblin Skull, Hooked Nose, Sharp Jaw, Oversized Pointed Ears, Glowing Yellow Eyes & Tattered Hood!
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.98, 0.24);

    const cranium = mesh(THREE, g.sphere, m.goblinSkin, 0.165, 0.155, 0.185);
    const cheekBones = mesh(THREE, g.dodeca, m.goblinSkin, 0.155, 0.095, 0.14);
    cheekBones.position.set(0, -0.03, 0.05);
    const jaw = mesh(THREE, g.cone5, m.goblinSkin, 0.105, 0.15, 0.13);
    jaw.rotation.x = Math.PI - 0.35;
    jaw.position.set(0, -0.11, 0.09);
    const nose = mesh(THREE, g.spikeUp, m.goblinSkin, 0.048, 0.19, 0.052);
    nose.rotation.x = HALF_PI + 0.24;
    nose.position.set(0, -0.01, 0.15);
    headGroup.add(cranium, cheekBones, jaw, nose);

    // Tiny jutting lower goblin fangs
    for (let s = -1; s <= 1; s += 2) {
      const fang = mesh(THREE, g.spikeUp, m.boneIvory, 0.016, 0.055, 0.016);
      fang.position.set(s * 0.048, -0.09, 0.17);
      fang.rotation.x = 0.22;
      const brow = mesh(THREE, g.cyl8, m.goblinSkin, 0.06, 0.028, 0.04);
      brow.position.set(s * 0.065, 0.055, 0.155);
      brow.rotation.z = -s * 0.32;
      const eye = mesh(THREE, g.sphereLow, m.eyeYellow, 0.034, 0.028, 0.030);
      eye.position.set(s * 0.068, 0.025, 0.162);
      eye.userData.noFlash = true;
      headGroup.add(fang, brow, eye);
    }

    const earL = mesh(THREE, g.goblinEarL, m.goblinSkin, 1, 1, 1);
    earL.position.set(0.13, 0.01, 0.01);
    const earR = mesh(THREE, g.goblinEarR, m.goblinSkin, 1, 1, 1);
    earR.position.set(-0.13, 0.01, 0.01);
    headGroup.add(earL, earR);

    // Tattered dark peaked cave-hood & trailing rag-tail
    const hoodCowl = mesh(THREE, g.peakedHood, m.goblinCloth, 0.56, 0.34, 0.62);
    hoodCowl.position.set(0, -0.06, -0.02);
    hoodCowl.rotation.x = -0.62;
    const hoodBrim = mesh(THREE, g.torusThin, m.goblinCloth, 0.175, 0.165, 1.3);
    hoodBrim.position.set(0, 0.01, 0.09);
    hoodBrim.rotation.x = 0.22;
    const hoodTail = mesh(THREE, g.clothTatter, m.goblinCloth, 0.75, 0.42, 0.75);
    hoodTail.position.set(0, 0.12, -0.22);
    headGroup.add(hoodCowl, hoodBrim, hoodTail);
    bodyRoot.add(headGroup);

    // Left Arm (+X): Wiry forearm + Small Spiked Iron Buckler!
    const armL = new THREE.Group();
    armL.position.set(0.25, 0.86, 0.12);
    armL.rotation.set(-0.34, 0, 0.12);
    const upperL = mesh(THREE, g.sculptedLimb, m.goblinSkin, 0.065, 0.24, 0.065);
    const foreL = mesh(THREE, g.sculptedLimb, m.goblinSkin, 0.058, 0.22, 0.058);
    foreL.position.set(0, -0.22, 0.02);
    foreL.rotation.x = -0.58;
    armL.add(upperL, foreL);

    const buckler = new THREE.Group();
    buckler.position.set(0.06, -0.34, 0.16);
    buckler.rotation.set(0.18, -0.48, 0.15);
    const bucklerPlate = mesh(THREE, g.cyl, m.ironForged, 0.20, 0.032, 0.20);
    bucklerPlate.rotation.z = HALF_PI;
    const bucklerRim = mesh(THREE, g.torusThin, m.ironBlackened, 0.20, 0.20, 1.3);
    bucklerRim.rotation.y = HALF_PI;
    const bucklerSpike = mesh(THREE, g.spikeUp, m.steelBlade, 0.042, 0.14, 0.042);
    bucklerSpike.rotation.z = -HALF_PI;
    bucklerSpike.position.set(0.02, 0, 0);
    buckler.add(bucklerPlate, bucklerRim, bucklerSpike);
    armL.add(buckler);

    // Right Arm (-X): Notched Curved Scavenger Dagger!
    const armR = new THREE.Group();
    armR.position.set(-0.25, 0.86, 0.12);
    armR.rotation.set(-0.28, 0, -0.10);
    const upperR = mesh(THREE, g.sculptedLimb, m.goblinSkin, 0.065, 0.24, 0.065);
    const foreR = mesh(THREE, g.sculptedLimb, m.leatherDark, 0.060, 0.22, 0.060);
    foreR.position.set(0, -0.22, 0.02);
    foreR.rotation.x = -0.45;
    armR.add(upperR, foreR);

    const daggerGrp = new THREE.Group();
    daggerGrp.position.set(0, -0.36, 0.14);
    daggerGrp.rotation.x = 1.18;
    const dGrip = mesh(THREE, g.cyl8, m.boneIvory, 0.024, 0.15, 0.024);
    const dGuard = mesh(THREE, g.cyl8, m.ironBlackened, 0.018, 0.14, 0.022);
    dGuard.rotation.x = HALF_PI;
    dGuard.position.y = 0.07;
    const dBlade = mesh(THREE, g.goblinDagger, m.steelBlade, 1.15, 0.56, 1.15);
    dBlade.position.y = 0.07;
    daggerGrp.add(dGrip, dGuard, dBlade);
    armR.add(daggerGrp);

    bodyRoot.add(armL, armR);
    root.scale.setScalar(1.36);

    return finalizeRig(root, {
      type: 'goblin',
      variantKey: 'goblin',
      bodyRoot,
      headGroup,
      earL,
      earR,
      legL,
      legR,
      armL,
      armR,
      height3D: 2.02
    });
  }

  // 2. ORC INFANTRY
  function buildOrcRig(bank) {
    const THREE = bank.THREE;
    const g = bank.geos;
    const m = bank.mats;

    const root = new THREE.Group();
    const bodyRoot = new THREE.Group();
    root.add(bodyRoot);

    const buildOrcLeg = (side, pose) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.19, 0.68, 0);
      hip.rotation.x = pose;
      const thigh = mesh(THREE, g.sculptedLimb, m.chainmail, 0.125, 0.36, 0.13);
      const kneePlate = mesh(THREE, g.dodeca, m.ironBlackened, 0.085, 0.08, 0.07);
      kneePlate.position.set(0, -0.34, 0.07);
      const greave = mesh(THREE, g.muscleForearm, m.ironForged, 0.115, 0.33, 0.12);
      greave.position.set(0, -0.34, 0);
      const boot = mesh(THREE, g.sphereLow, m.ironBlackened, 0.095, 0.065, 0.16);
      boot.position.set(0, -0.64, 0.06);
      hip.add(thigh, kneePlate, greave, boot);
      return hip;
    };

    const legL = buildOrcLeg(-1, 0.14);
    const legR = buildOrcLeg(1, -0.14);
    bodyRoot.add(legL, legR);

    // Mail tunic hauberk skirt, studded leather war-belt & iron tassets
    const mailSkirt = mesh(THREE, g.cyl, m.chainmail, 0.30, 0.34, 0.25);
    mailSkirt.position.set(0, 0.74, 0.01);
    const belt = mesh(THREE, g.cyl, m.leatherDark, 0.315, 0.11, 0.265);
    belt.position.set(0, 0.84, 0.01);
    const buckle = mesh(THREE, g.octa, m.tarnishedBronze, 0.075, 0.075, 0.04);
    buckle.position.set(0, 0.84, 0.27);
    bodyRoot.add(mailSkirt, belt, buckle);

    for (let s = -1; s <= 1; s += 2) {
      const tasset = mesh(THREE, g.pauldronShell, m.ironBlackened, 0.20, 0.24, 0.18);
      tasset.position.set(s * 0.21, 0.72, 0.04);
      tasset.rotation.set(0.12, -s * 0.9, -0.22);
      bodyRoot.add(tasset);
    }

    // Broad-shouldered Mordor iron breastplate & mail shirt
    const torso = mesh(THREE, g.warriorTorso, m.ironForged, 0.36, 0.62, 0.29);
    torso.position.set(0, 0.82, 0.01);
    torso.rotation.x = 0.12;
    const chestPlate = mesh(THREE, g.pauldronShell, m.ironBlackened, 0.33, 0.42, 0.28);
    chestPlate.position.set(0, 1.12, 0.04);
    chestPlate.rotation.set(-0.25, -Math.PI * 0.42, 0);
    bodyRoot.add(torso, chestPlate);

    // Layered Dark Iron Pauldrons (2 overlapping curved lames + spike per shoulder)
    for (let s = -1; s <= 1; s += 2) {
      const pUpper = mesh(THREE, g.pauldronShell, m.ironBlackened, 0.25, 0.22, 0.25);
      pUpper.position.set(s * 0.36, 1.32, 0.03);
      pUpper.rotation.set(0.15, s > 0 ? -0.35 : Math.PI - 0.35, -s * 0.25);
      const pLower = mesh(THREE, g.pauldronShell, m.ironForged, 0.23, 0.18, 0.23);
      pLower.position.set(s * 0.39, 1.21, 0.03);
      pLower.rotation.set(0.15, s > 0 ? -0.35 : Math.PI - 0.35, -s * 0.32);
      const pSpike = mesh(THREE, g.spikeUp, m.steelBlade, 0.038, 0.16, 0.038);
      pSpike.position.set(s * 0.42, 1.44, 0.03);
      pSpike.rotation.z = -s * 0.38;
      bodyRoot.add(pUpper, pLower, pSpike);
    }

    // Grey-Green Tusked Orc Head + Hammered Iron Kettle/Nasal Helm!
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.54, 0.09);

    const head = mesh(THREE, g.sphere, m.orcSkin, 0.185, 0.19, 0.205);
    const jaw = mesh(THREE, g.dodeca, m.orcSkin, 0.155, 0.115, 0.165);
    jaw.position.set(0, -0.09, 0.06);
    headGroup.add(head, jaw);

    for (let s = -1; s <= 1; s += 2) {
      const tusk = mesh(THREE, g.curvedTusk, m.boneIvory, s * 0.85, 0.85, 0.85);
      tusk.position.set(s * 0.085, -0.13, 0.09);
      const eye = mesh(THREE, g.sphereLow, m.eyeAmber, 0.032, 0.026, 0.028);
      eye.position.set(s * 0.072, 0.025, 0.185);
      eye.userData.noFlash = true;
      const cheekGuard = mesh(THREE, g.crownLancet, m.ironForged, 0.55, -0.22, 0.8);
      cheekGuard.position.set(s * 0.175, 0.04, 0.06);
      cheekGuard.rotation.y = HALF_PI + s * 0.25;
      headGroup.add(tusk, eye, cheekGuard);
    }

    const helm = mesh(THREE, g.kettleHelm, m.ironForged, 0.215, 0.24, 0.235);
    helm.position.set(0, 0.03, -0.01);
    helm.rotation.x = -0.08;
    const nasalBar = mesh(THREE, g.cyl8, m.ironBlackened, 0.022, 0.16, 0.024);
    nasalBar.position.set(0, 0.01, 0.215);
    const helmCrestSpike = mesh(THREE, g.spikeUp, m.ironBlackened, 0.045, 0.16, 0.07);
    helmCrestSpike.position.set(0, 0.26, -0.01);
    headGroup.add(helm, nasalBar, helmCrestSpike);
    bodyRoot.add(headGroup);

    // Left Arm (+X): Battered Iron Shield with Red Eye of Mordor Emblem!
    const armL = new THREE.Group();
    armL.position.set(0.39, 1.26, 0.05);
    armL.rotation.x = -0.22;
    const upperL = mesh(THREE, g.sculptedLimb, m.chainmail, 0.10, 0.28, 0.10);
    const bracerL = mesh(THREE, g.muscleForearm, m.ironBlackened, 0.092, 0.26, 0.092);
    bracerL.position.set(0, -0.26, 0.02);
    bracerL.rotation.x = -0.52;
    armL.add(upperL, bracerL);

    const shieldGrp = new THREE.Group();
    shieldGrp.position.set(0.08, -0.34, 0.22);
    shieldGrp.rotation.set(-0.08, 0.42, 0.08);
    const shieldFace = mesh(THREE, g.orcShield, m.redEyeShield, 0.92, 0.95, 1.0);
    const shieldBoss = mesh(THREE, g.spikeUp, m.ironForged, 0.055, 0.12, 0.055);
    shieldBoss.rotation.x = HALF_PI;
    shieldBoss.position.set(0, -0.26, 0.03);
    shieldGrp.add(shieldFace, shieldBoss);
    armL.add(shieldGrp);

    // Right Arm (-X): Jagged Broad-Tipped Orc Scimitar!
    const armR = new THREE.Group();
    armR.position.set(-0.39, 1.26, 0.05);
    armR.rotation.x = -0.24;
    const upperR = mesh(THREE, g.sculptedLimb, m.orcSkin, 0.105, 0.28, 0.105);
    const bracerR = mesh(THREE, g.muscleForearm, m.ironForged, 0.095, 0.26, 0.095);
    bracerR.position.set(0, -0.26, 0.02);
    bracerR.rotation.x = -0.45;
    armR.add(upperR, bracerR);

    const swordGrp = new THREE.Group();
    swordGrp.position.set(0, -0.42, 0.16);
    swordGrp.rotation.x = 1.15;
    const hilt = mesh(THREE, g.cyl8, m.leatherDark, 0.032, 0.22, 0.032);
    const guard = mesh(THREE, g.cyl8, m.ironBlackened, 0.026, 0.20, 0.035);
    guard.rotation.x = HALF_PI;
    guard.position.y = 0.10;
    const blade = mesh(THREE, g.orcScimitar, m.steelBlade, 1.15, 0.88, 1.12);
    blade.position.y = 0.11;
    swordGrp.add(hilt, guard, blade);
    armR.add(swordGrp);

    bodyRoot.add(armL, armR);
    root.scale.setScalar(1.36);

    return finalizeRig(root, {
      type: 'orc',
      variantKey: 'orc',
      bodyRoot,
      headGroup,
      legL,
      legR,
      armL,
      armR,
      height3D: 2.82
    });
  }

  // 3. URUK-HAI BERSERKER
  function buildUrukRig(bank) {
    const THREE = bank.THREE;
    const g = bank.geos;
    const m = bank.mats;

    const root = new THREE.Group();
    const bodyRoot = new THREE.Group();
    root.add(bodyRoot);

    const armorMeshes = [];
    const rageVeins = [];

    // Heavy fluted Isengard iron greaves & boots
    const buildUrukLeg = (side, pose) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.23, 0.82, 0);
      hip.rotation.x = pose;
      const thigh = mesh(THREE, g.sculptedLimb, m.urukSkin, 0.155, 0.42, 0.16);
      const kneeHorn = mesh(THREE, g.spikeUp, m.ironBlackened, 0.065, 0.18, 0.065);
      kneeHorn.position.set(0, -0.40, 0.11);
      kneeHorn.rotation.x = 0.55;
      const greave = mesh(THREE, g.muscleForearm, m.ironForged, 0.145, 0.42, 0.15);
      greave.position.set(0, -0.40, 0);
      const sabaton = mesh(THREE, g.sphereLow, m.ironBlackened, 0.115, 0.075, 0.19);
      sabaton.position.set(0, -0.78, 0.07);
      armorMeshes.push(greave, sabaton);
      hip.add(thigh, kneeHorn, greave, sabaton);
      return hip;
    };

    const legL = buildUrukLeg(-1, 0.15);
    const legR = buildUrukLeg(1, -0.15);
    bodyRoot.add(legL, legR);

    // Crimson war-kilt, chainmail & studded iron girdle
    const kilt = mesh(THREE, g.cyl, m.urukCloth, 0.36, 0.38, 0.30);
    kilt.position.set(0, 0.86, 0);
    const belt = mesh(THREE, g.cyl, m.ironBlackened, 0.38, 0.14, 0.32);
    belt.position.set(0, 0.98, 0.01);
    armorMeshes.push(belt);
    bodyRoot.add(kilt, belt);

    // Towering muscular dark-crimson Uruk torso + crossed iron Berserker harness
    const chestMuscle = mesh(THREE, g.warriorTorso, m.urukSkin, 0.44, 0.76, 0.35);
    chestMuscle.position.set(0, 0.96, 0.01);
    chestMuscle.rotation.x = 0.10;
    const cuirassLower = mesh(THREE, g.cyl, m.ironForged, 0.37, 0.34, 0.30);
    cuirassLower.position.set(0, 1.16, 0.02);
    armorMeshes.push(cuirassLower);
    bodyRoot.add(chestMuscle, cuirassLower);

    for (let s = -1; s <= 1; s += 2) {
      const strap = mesh(THREE, g.torusThin, m.ironBlackened, 0.36, 0.44, 1.4);
      strap.position.set(0, 1.38, 0.08);
      strap.rotation.set(0.32, s * 0.38, s * 0.62);
      armorMeshes.push(strap);
      bodyRoot.add(strap);

      const pTop = mesh(THREE, g.pauldronShell, m.ironBlackened, 0.29, 0.25, 0.29);
      pTop.position.set(s * 0.45, 1.58, 0.03);
      pTop.rotation.set(0.12, s > 0 ? -0.35 : Math.PI - 0.35, -s * 0.28);
      const pSpike = mesh(THREE, g.spikeUp, m.steelBlade, 0.048, 0.20, 0.048);
      pSpike.position.set(s * 0.52, 1.72, 0.03);
      pSpike.rotation.z = -s * 0.42;
      armorMeshes.push(pTop);
      bodyRoot.add(pTop, pSpike);

      // Recessed Blood-Rage ember veins on chest & shoulders (ignite <40% HP!)
      const vein = mesh(THREE, g.torusThin, m.urukRageEmber, 0.24, 0.30, 1.2);
      vein.position.set(s * 0.16, 1.42, 0.16);
      vein.rotation.set(0.2, s * 0.4, s * 0.5);
      vein.userData.noFlash = true;
      vein.visible = false;
      vein.scale.setScalar(0.0001);
      rageVeins.push(vein);
      bodyRoot.add(vein);
    }

    // Iconic Tall Crested Isengard Berserker War-Helm with White Hand Warpaint Texture!
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.84, 0.07);

    const head = mesh(THREE, g.sphere, m.urukSkin, 0.21, 0.22, 0.22);
    // Helm bowl mapped with White Hand of Saruman warpaint facing +Z!
    const helmBowl = mesh(THREE, g.urukHelm, m.whiteHandHelm, 0.225, 0.28, 0.245);
    helmBowl.position.set(0, -0.02, 0);
    helmBowl.rotation.y = Math.PI; // places U=0.5 White Hand palm & splayed fingers squarely on front brow!

    // Angular iron cheek-plates framing narrow menacing visor slit
    for (let s = -1; s <= 1; s += 2) {
      const cheek = mesh(THREE, g.pauldronShell, m.ironBlackened, 0.17, 0.22, 0.19);
      cheek.position.set(s * 0.11, -0.06, 0.09);
      cheek.rotation.set(0.1, s > 0 ? -0.6 : Math.PI - 0.2, 0);
      armorMeshes.push(cheek);
      const eye = mesh(THREE, g.sphereLow, m.eyeCrimson, 0.034, 0.022, 0.026);
      eye.position.set(s * 0.075, 0.015, 0.205);
      eye.userData.noFlash = true;
      headGroup.add(cheek, eye);
    }

    // Tall sweeping metallic Isengard Berserker sagittal fan-crest!
    const crestMain = mesh(THREE, g.urukCrest, m.urukCrestMetal, 1.0, 0.96, 1.05);
    crestMain.position.set(0, 0.22, 0.02);
    const crestSpine = mesh(THREE, g.urukCrest, m.ironBlackened, 1.35, 0.45, 0.88);
    crestSpine.position.set(0, 0.20, 0.01);
    headGroup.add(head, helmBowl, crestMain, crestSpine);
    bodyRoot.add(headGroup);

    // Muscular Arms + Heavy Spiked Forearm Bracers + Two-Handed Berserker Pike-Cleaver!
    const armL = new THREE.Group();
    armL.position.set(0.47, 1.52, 0.07);
    armL.rotation.set(-0.32, 0.16, 0.12);
    const upL = mesh(THREE, g.sculptedLimb, m.urukSkin, 0.135, 0.34, 0.135);
    const brL = mesh(THREE, g.muscleForearm, m.ironForged, 0.125, 0.32, 0.125);
    brL.position.set(0, -0.32, 0.02);
    brL.rotation.x = -0.58;
    armorMeshes.push(brL);
    armL.add(upL, brL);

    const armR = new THREE.Group();
    armR.position.set(-0.47, 1.52, 0.07);
    armR.rotation.set(-0.34, -0.18, -0.08);
    const upR = mesh(THREE, g.sculptedLimb, m.urukSkin, 0.14, 0.34, 0.14);
    const brR = mesh(THREE, g.muscleForearm, m.ironForged, 0.13, 0.32, 0.13);
    brR.position.set(0, -0.32, 0.02);
    brR.rotation.x = -0.52;
    armorMeshes.push(brR);
    armR.add(upR, brR);

    // Colossal Two-Handed Isengard Pike-Cleaver angled menacingly across chest/front
    const cleaverGrp = new THREE.Group();
    cleaverGrp.position.set(0.14, -0.50, 0.22);
    cleaverGrp.rotation.set(1.08, 0.18, 0.12);
    const haft = mesh(THREE, g.cyl8, m.ashWood, 0.038, 0.62, 0.038);
    haft.position.y = -0.12;
    const pommelSpike = mesh(THREE, g.spikeUp, m.ironBlackened, 0.05, -0.16, 0.05);
    pommelSpike.position.y = -0.42;
    const crossBlock = mesh(THREE, g.cyl8, m.ironBlackened, 0.045, 0.24, 0.06);
    crossBlock.rotation.x = HALF_PI;
    crossBlock.position.y = 0.18;
    const blade = mesh(THREE, g.urukCleaver, m.steelBlade, 1.15, 1.28, 1.20);
    blade.position.y = 0.20;
    cleaverGrp.add(haft, pommelSpike, crossBlock, blade);
    armR.add(cleaverGrp);

    bodyRoot.add(armL, armR);

    // Blood-Rage Ember & Flame Aura (<40% HP; scaled to 0.0001 while hidden so Box3 stays tight!)
    const rageAura = new THREE.Group();
    rageAura.visible = false;
    rageAura.userData.skipStudioBounds = true;
    rageAura.scale.setScalar(0.0001);
    const rageRing = mesh(THREE, g.ring, m.urukRageAura, 1.05, 1.05, 1);
    rageRing.rotation.x = -HALF_PI;
    rageRing.position.y = 0.06;
    rageRing.userData.noShadow = true;
    rageAura.add(rageRing);
    for (let i = 0; i < 6; i++) {
      const ra = (i / 6) * TWO_PI;
      const emberTongue = mesh(THREE, g.flameTongue, m.urukRageAura, 0.85, 0.95, 0.85);
      emberTongue.position.set(Math.sin(ra) * 0.56, 0.35 + (i % 2) * 0.35, Math.cos(ra) * 0.56);
      emberTongue.rotation.y = ra;
      emberTongue.userData.noShadow = true;
      rageAura.add(emberTongue);
    }
    root.add(rageAura);
    root.scale.setScalar(1.36);

    return finalizeRig(root, {
      type: 'uruk',
      variantKey: 'uruk',
      bodyRoot,
      headGroup,
      legL,
      legR,
      armL,
      armR,
      armorMeshes,
      rageVeins,
      rageAura,
      enragedApplied: false,
      height3D: 3.50
    });
  }

  // 4. WARG RIDER (Modeled directly on Warg cavalry in reference image!)
  function buildWargRig(bank) {
    const THREE = bank.THREE;
    const g = bank.geos;
    const m = bank.mats;

    const root = new THREE.Group();
    const jumpGroup = new THREE.Group();
    root.add(jumpGroup);

    // Deep-chested muscular Warg wolf torso + massive bristled shoulder/neck ruff
    const torso = mesh(THREE, g.wargBody, m.wargCoat, 1.04, 1.02, 1.05);
    torso.position.set(0, 0.88, 0.02);
    const shoulderRuff = mesh(THREE, g.sphere, m.wargRuff, 0.50, 0.48, 0.56);
    shoulderRuff.position.set(0, 0.98, 0.48);
    const neckMuscle = mesh(THREE, g.sculptedLimb, m.wargRuff, 0.36, -0.58, 0.38);
    neckMuscle.position.set(0, 0.92, 0.56);
    neckMuscle.rotation.x = 0.78;
    const haunches = mesh(THREE, g.sphere, m.wargCoat, 0.40, 0.40, 0.46);
    haunches.position.set(0, 0.88, -0.52);
    jumpGroup.add(torso, shoulderRuff, neckMuscle, haunches);

    // Thick spiky neck/shoulder fur ruff collars & dorsal bristle ridge!
    for (let i = 0; i < 6; i++) {
      const spineMane = mesh(THREE, g.flameTongue, m.wargRuff, 1.15, 0.44 - i * 0.04, 1.35);
      spineMane.position.set(0, 1.24 - i * 0.05, 0.72 - i * 0.24);
      spineMane.rotation.x = -0.45;
      jumpGroup.add(spineMane);
    }
    for (let k = 0; k < 7; k++) {
      const ang = -1.25 + (k / 6) * 2.5;
      const ruffSpike = mesh(THREE, g.spikeUp, m.wargRuff, 0.11, 0.36, 0.14);
      ruffSpike.position.set(Math.sin(ang) * 0.42, 1.02 + Math.cos(ang) * 0.24, 0.62);
      ruffSpike.rotation.set(-0.55, 0, -ang * 0.75);
      jumpGroup.add(ruffSpike);
    }

    // Sculpted Snarling Lupine Skull, Bared White Fangs & Glowing Amber Eyes!
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.12, 0.98);

    const cranium = mesh(THREE, g.dodeca, m.wargRuff, 0.28, 0.24, 0.28);
    const brow = mesh(THREE, g.sphereLow, m.wargRuff, 0.25, 0.12, 0.20);
    brow.position.set(0, 0.09, 0.12);
    const upperMuzzle = mesh(THREE, g.cone8, m.wargCoat, 0.19, 0.48, 0.16);
    upperMuzzle.rotation.x = HALF_PI + 0.06;
    upperMuzzle.position.set(0, 0.01, 0.30);
    const noseBridge = mesh(THREE, g.cyl8, m.wargMuzzle, 0.08, 0.36, 0.06);
    noseBridge.rotation.x = HALF_PI + 0.08;
    noseBridge.position.set(0, 0.08, 0.32);
    const noseTip = mesh(THREE, g.sphereLow, m.ironBlackened, 0.065, 0.055, 0.055);
    noseTip.position.set(0, 0.03, 0.53);
    const upperGums = mesh(THREE, g.cyl8, m.wargGums, 0.12, 0.28, 0.04);
    upperGums.rotation.x = HALF_PI;
    upperGums.position.set(0, -0.07, 0.34);
    headGroup.add(cranium, brow, upperMuzzle, noseBridge, noseTip, upperGums);

    // Swept wolf ears, amber eyes & bared upper canines + incisors
    for (let s = -1; s <= 1; s += 2) {
      const ear = mesh(THREE, g.spikeUp, m.wargRuff, 0.075, 0.28, 0.085);
      ear.position.set(s * 0.18, 0.16, -0.08);
      ear.rotation.set(-0.48, 0, -s * 0.28);
      const cheekTuft = mesh(THREE, g.spikeUp, m.wargRuff, 0.07, 0.22, 0.09);
      cheekTuft.position.set(s * 0.24, -0.05, -0.02);
      cheekTuft.rotation.set(-0.6, 0, -s * 1.1);
      const eye = mesh(THREE, g.sphereLow, m.eyeAmber, 0.042, 0.034, 0.038);
      eye.position.set(s * 0.145, 0.065, 0.19);
      eye.userData.noFlash = true;
      const canineU = mesh(THREE, g.spikeUp, m.boneIvory, 0.032, -0.14, 0.032);
      canineU.position.set(s * 0.095, -0.06, 0.44);
      const toothU = mesh(THREE, g.spikeUp, m.boneIvory, 0.022, -0.08, 0.022);
      toothU.position.set(s * 0.105, -0.06, 0.34);
      headGroup.add(ear, cheekTuft, eye, canineU, toothU);
    }

    // Articulated Snarling Lower Jaw with Lower Fangs & Tongue
    const jawPivot = new THREE.Group();
    jawPivot.position.set(0, -0.10, 0.08);
    jawPivot.rotation.x = 0.24; // snarling open mouth at rest!
    const lowerJaw = mesh(THREE, g.cone8, m.wargCoat, 0.145, 0.42, 0.10);
    lowerJaw.rotation.x = HALF_PI;
    lowerJaw.position.set(0, -0.02, 0.22);
    const tongue = mesh(THREE, g.cyl8, m.wargGums, 0.065, 0.26, 0.025);
    tongue.rotation.x = HALF_PI;
    tongue.position.set(0, 0.02, 0.24);
    jawPivot.add(lowerJaw, tongue);
    for (let s = -1; s <= 1; s += 2) {
      const canineL = mesh(THREE, g.spikeUp, m.boneIvory, 0.028, 0.12, 0.028);
      canineL.position.set(s * 0.08, 0.01, 0.36);
      jawPivot.add(canineL);
    }
    headGroup.add(jawPivot);
    jumpGroup.add(headGroup);

    // Bushy S-curved Wolf Tail
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.90, -0.82);
    const tailMesh = mesh(THREE, g.wargTail, m.wargRuff, 1.08, 1.05, 1.05);
    tailPivot.add(tailMesh);
    jumpGroup.add(tailPivot);

    // 4 Articulated Galloping Wolf Legs (muscular thighs/shoulders, reverse-hock joints & clawed paws!)
    const buildWargLeg = (x, y, z, isHind, restAngle) => {
      const hip = new THREE.Group();
      hip.position.set(x, y, z);
      hip.rotation.x = restAngle;

      if (isHind) {
        // Lupine digitigrade hindleg: muscular thigh -> backward hock -> lower metatarsal -> clawed paw
        const thigh = mesh(THREE, g.sculptedLimb, m.wargCoat, 0.175, 0.44, 0.20);
        thigh.rotation.x = -0.36;
        const hock = mesh(THREE, g.sculptedLimb, m.wargCoat, 0.105, 0.38, 0.115);
        hock.position.set(0, -0.36, 0.14);
        hock.rotation.x = 0.62;
        const metatarsus = mesh(THREE, g.sculptedLimb, m.wargRuff, 0.085, 0.26, 0.09);
        metatarsus.position.set(0, -0.66, -0.06);
        metatarsus.rotation.x = -0.26;
        const paw = mesh(THREE, g.sphereLow, m.wargRuff, 0.095, 0.055, 0.145);
        paw.position.set(0, -0.86, 0.04);
        hip.add(thigh, hock, metatarsus, paw);
        for (let c = -1; c <= 1; c++) {
          const claw = mesh(THREE, g.spikeUp, m.boneIvory, 0.018, 0.075, 0.018);
          claw.rotation.x = HALF_PI + 0.15;
          claw.position.set(c * 0.032, -0.87, 0.16);
          hip.add(claw);
        }
      } else {
        // Powerful foreleg: muscular scapula/humerus -> forearm -> pastern -> clawed paw
        const upper = mesh(THREE, g.sculptedLimb, m.wargRuff, 0.155, 0.42, 0.165);
        upper.rotation.x = 0.18;
        const fore = mesh(THREE, g.sculptedLimb, m.wargCoat, 0.10, 0.42, 0.105);
        fore.position.set(0, -0.39, -0.07);
        fore.rotation.x = -0.22;
        const paw = mesh(THREE, g.sphereLow, m.wargRuff, 0.098, 0.058, 0.15);
        paw.position.set(0, -0.78, 0.05);
        hip.add(upper, fore, paw);
        for (let c = -1; c <= 1; c++) {
          const claw = mesh(THREE, g.spikeUp, m.boneIvory, 0.018, 0.075, 0.018);
          claw.rotation.x = HALF_PI + 0.15;
          claw.position.set(c * 0.034, -0.79, 0.17);
          hip.add(claw);
        }
      }
      jumpGroup.add(hip);
      return hip;
    };

    const wargLegs = [
      buildWargLeg(-0.28, 0.82,  0.50, false,  0.18), // FL
      buildWargLeg( 0.28, 0.82,  0.50, false, -0.16), // FR
      buildWargLeg(-0.26, 0.88, -0.52, true,  -0.18), // BL
      buildWargLeg( 0.26, 0.88, -0.52, true,   0.16)  // BR
    ];

    // Spiked War-Saddle, Straps & Armored Orc Raider Swinging a Barbed Spear!
    const saddle = mesh(THREE, g.pauldronShell, m.leatherDark, 0.44, 0.36, 0.48);
    saddle.position.set(0, 1.12, 0.04);
    saddle.rotation.set(Math.PI * 0.5, 0, 0);
    const girthStrap = mesh(THREE, g.torusThin, m.leatherWorn, 0.42, 0.46, 1.4);
    girthStrap.position.set(0, 0.88, 0.12);
    jumpGroup.add(saddle, girthStrap);

    const rider = new THREE.Group();
    rider.position.set(0, 1.16, -0.02);
    rider.rotation.x = 0.26; // aggressive cavalry lean!

    // Rider crouched armoured legs gripping Warg flanks
    for (let s = -1; s <= 1; s += 2) {
      const rLeg = mesh(THREE, g.sculptedLimb, m.ironForged, 0.095, 0.42, 0.10);
      rLeg.position.set(s * 0.32, 0.04, 0.06);
      rLeg.rotation.set(-0.35, 0, -s * 0.42);
      const pld = mesh(THREE, g.pauldronShell, m.ironBlackened, 0.18, 0.16, 0.18);
      pld.position.set(s * 0.28, 0.48, 0.04);
      pld.rotation.set(0.1, s > 0 ? -0.3 : Math.PI - 0.3, -s * 0.3);
      rider.add(rLeg, pld);
    }

    const rTorso = mesh(THREE, g.warriorTorso, m.ironForged, 0.26, 0.48, 0.21);
    rTorso.position.y = 0.04;
    const rFurCollar = mesh(THREE, g.torusThin, m.wargRuff, 0.21, 0.22, 2.2);
    rFurCollar.rotation.x = HALF_PI;
    rFurCollar.position.set(0, 0.50, 0.02);
    const rHead = mesh(THREE, g.sphere, m.orcSkin, 0.145, 0.15, 0.155);
    rHead.position.set(0, 0.63, 0.06);
    const rHelm = mesh(THREE, g.kettleHelm, m.ironBlackened, 0.165, 0.22, 0.175);
    rHelm.position.set(0, 0.65, 0.05);
    const rSpike = mesh(THREE, g.spikeUp, m.steelBlade, 0.035, 0.15, 0.035);
    rSpike.position.set(0, 0.86, 0.04);
    rider.add(rTorso, rFurCollar, rHead, rHelm, rSpike);

    for (let s = -1; s <= 1; s += 2) {
      const rTusk = mesh(THREE, g.curvedTusk, m.boneIvory, s * 0.65, 0.65, 0.65);
      rTusk.position.set(s * 0.065, 0.55, 0.14);
      const rEye = mesh(THREE, g.sphereLow, m.eyeAmber, 0.025, 0.022, 0.022);
      rEye.position.set(s * 0.055, 0.64, 0.19);
      rEye.userData.noFlash = true;
      rider.add(rTusk, rEye);
    }

    // Left rider arm gripping leather reins to Warg collar
    const reinArm = mesh(THREE, g.sculptedLimb, m.orcSkin, 0.08, 0.36, 0.08);
    reinArm.position.set(0.26, 0.44, 0.06);
    reinArm.rotation.set(-0.95, -0.25, 0);
    rider.add(reinArm);

    // Right rider arm + Barbed Cavalry Spear (`spearPivot` z = 0.08 matches sync())
    const spearPivot = new THREE.Group();
    spearPivot.position.set(-0.29, 0.42, 0.08);
    const rArmR = mesh(THREE, g.sculptedLimb, m.orcSkin, 0.085, 0.36, 0.085);
    rArmR.rotation.x = -0.65;
    const shaft = mesh(THREE, g.shaftUp, m.ashWood, 0.036, 2.15, 0.036);
    shaft.rotation.x = HALF_PI * 0.93;
    shaft.position.set(0, -0.20, -0.45);
    const tipCollar = mesh(THREE, g.cyl8, m.ironBlackened, 0.048, 0.14, 0.048);
    tipCollar.rotation.x = HALF_PI * 0.93;
    tipCollar.position.set(0, 0.03, 1.54);
    const barbedHead = mesh(THREE, g.barbedSpear, m.steelBlade, 0.62, 0.44, 0.85);
    barbedHead.rotation.x = HALF_PI * 0.93;
    barbedHead.position.set(0, 0.05, 1.58);
    const pennant = mesh(THREE, g.flameTongue, m.urukCloth, 0.65, -0.32, 0.65);
    pennant.position.set(0, 0.02, 1.42);
    spearPivot.add(rArmR, shaft, tipCollar, barbedHead, pennant);
    rider.add(spearPivot);

    jumpGroup.add(rider);
    jumpGroup.scale.setScalar(1.34);

    return finalizeRig(root, {
      type: 'warg',
      variantKey: 'warg',
      jumpGroup,
      headGroup,
      wargLegs,
      jawPivot,
      tailPivot,
      spearPivot,
      rider,
      height3D: 3.38
    });
  }

  // 5. OLOG-HAI SIEGE TROLL (Modeled directly on hulking grey-stone Troll in center of reference image!)
  function buildTrollRig(bank) {
    const THREE = bank.THREE;
    const g = bank.geos;
    const m = bank.mats;

    // ~2.4x Infantry Height (height ~6.7u) Anatomical Grey-Rock Behemoth!
    const root = new THREE.Group();
    const bodyRoot = new THREE.Group();
    bodyRoot.rotation.x = 0.08;
    root.add(bodyRoot);

    // Compact regeneration ring (fits within shoulder span so Box3 never bloats!)
    const regenRing = mesh(THREE, g.ring, m.regenRing, 1.25, 1.25, 1);
    regenRing.rotation.x = -HALF_PI;
    regenRing.position.y = 0.06;
    regenRing.userData.noShadow = true;
    regenRing.userData.skipStudioBounds = true;
    regenRing.visible = false;
    root.add(regenRing);

    // Massive Elephantine Stone Legs, Iron Greaves & 3-Clawed Stone Feet
    const buildTrollLeg = (side, pose) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.54, 1.62, 0);
      hip.rotation.x = pose;

      const thigh = mesh(THREE, g.sculptedLimb, m.trollStone, 0.38, 0.82, 0.40);
      const calf = mesh(THREE, g.muscleForearm, m.trollStone, 0.34, 0.72, 0.36);
      calf.position.set(0, -0.74, 0);
      const greave = mesh(THREE, g.pauldronShell, m.ironBlackened, 0.36, 0.56, 0.38);
      greave.position.set(0, -1.04, 0.06);
      greave.rotation.set(-0.15, -Math.PI * 0.42, 0);
      const greaveSpike = mesh(THREE, g.spikeUp, m.ironForged, 0.075, 0.24, 0.075);
      greaveSpike.position.set(0, -0.82, 0.36);
      greaveSpike.rotation.x = 0.85;
      const foot = mesh(THREE, g.sphere, m.trollStone, 0.34, 0.16, 0.44);
      foot.position.set(0, -1.42, 0.12);
      hip.add(thigh, calf, greave, greaveSpike, foot);

      for (let t = -1; t <= 1; t++) {
        const nail = mesh(THREE, g.spikeUp, m.darkHorn, 0.065, 0.18, 0.065);
        nail.rotation.x = HALF_PI + 0.18;
        nail.position.set(t * 0.12, -1.45, 0.48);
        hip.add(nail);
      }
      return hip;
    };

    const legL = buildTrollLeg(-1, 0.12);
    const legR = buildTrollLeg(1, -0.12);
    bodyRoot.add(legL, legR);

    // Leather war-loincloth, armored girdle & heavy forged iron Belly-Chains!
    const pelvis = mesh(THREE, g.cyl, m.leatherDark, 0.78, 0.52, 0.64);
    pelvis.position.set(0, 1.58, 0.02);
    const loinPlate = mesh(THREE, g.orcShield, m.ironBlackened, 1.25, 0.88, 1.2);
    loinPlate.position.set(0, 1.38, 0.64);
    bodyRoot.add(pelvis, loinPlate);

    // Barrel-chested grey-stone torso, sculpted pectorals, abs & hunched craggy trapezius!
    const torso = mesh(THREE, g.trollTorso, m.trollStone, 0.98, 1.95, 0.80);
    torso.position.set(0, 1.56, 0.04);
    const trapHunch = mesh(THREE, g.sphere, m.trollCrag, 0.88, 0.74, 0.82);
    trapHunch.position.set(0, 3.22, -0.14);
    bodyRoot.add(torso, trapHunch);

    for (let s = -1; s <= 1; s += 2) {
      const pec = mesh(THREE, g.sphere, m.trollStone, 0.48, 0.38, 0.36);
      pec.position.set(s * 0.38, 2.86, 0.48);
      pec.rotation.z = -s * 0.18;
      bodyRoot.add(pec);
    }

    // Craggy dorsal stone osteoderms along hunched back
    for (let k = 0; k < 5; k++) {
      const crag = mesh(THREE, g.dodeca, m.trollCrag, 0.28 - k * 0.03, 0.22, 0.26);
      crag.position.set(0, 3.62 - k * 0.34, -0.34 - Math.sin(k * 0.7) * 0.26);
      bodyRoot.add(crag);
    }

    // Iron Belly-Chains & Medallion!
    const bellyChain1 = mesh(THREE, g.trollBellyChain, m.ironForged, 0.92, 0.85, 0.92);
    bellyChain1.position.set(0, 2.28, -0.02);
    const bellyChain2 = mesh(THREE, g.trollBellyChain, m.ironBlackened, 0.88, -0.65, 0.88);
    bellyChain2.position.set(0, 2.46, -0.02);
    const bellyBoss = mesh(THREE, g.octa, m.ironForged, 0.22, 0.24, 0.12);
    bellyBoss.position.set(0, 2.15, 0.78);
    bodyRoot.add(bellyChain1, bellyChain2, bellyBoss);

    // Riveted Dark-Iron Shoulder Plates + Huge Sculpted Deltoids!
    for (let s = -1; s <= 1; s += 2) {
      const deltoid = mesh(THREE, g.sphere, m.trollStone, 0.48, 0.46, 0.48);
      deltoid.position.set(s * 1.06, 3.16, 0.12);
      const pauldron = mesh(THREE, g.pauldronShell, m.ironBlackened, 0.56, 0.50, 0.58);
      pauldron.position.set(s * 1.12, 3.32, 0.12);
      pauldron.rotation.set(0.14, s > 0 ? -0.35 : Math.PI - 0.35, -s * 0.28);
      const pTrim = mesh(THREE, g.pauldronShell, m.ironForged, 0.58, 0.24, 0.60);
      pTrim.position.set(s * 1.14, 3.16, 0.12);
      pTrim.rotation.set(0.14, s > 0 ? -0.35 : Math.PI - 0.35, -s * 0.32);
      bodyRoot.add(deltoid, pauldron, pTrim);

      for (let sp = -1; sp <= 1; sp++) {
        const spike = mesh(THREE, g.spikeUp, m.steelBlade, 0.085, 0.34, 0.085);
        spike.position.set(s * (1.22 + Math.abs(sp) * 0.04), 3.62 - Math.abs(sp) * 0.08, 0.12 + sp * 0.20);
        spike.rotation.set(sp * 0.28, 0, -s * 0.42);
        bodyRoot.add(spike);
      }
    }

    // Craggy Stone Head, Heavy Brow, Roaring Lower Jaw & Curved Lower Tusks!
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 3.52, 0.64);

    const skull = mesh(THREE, g.sphere, m.trollStone, 0.44, 0.42, 0.46);
    const heavyBrow = mesh(THREE, g.dodeca, m.trollCrag, 0.42, 0.18, 0.28);
    heavyBrow.position.set(0, 0.14, 0.28);
    const nose = mesh(THREE, g.dodeca, m.trollStone, 0.14, 0.13, 0.16);
    nose.position.set(0, 0.02, 0.42);
    headGroup.add(skull, heavyBrow, nose);

    for (let s = -1; s <= 1; s += 2) {
      const ear = mesh(THREE, g.cone5, m.trollStone, 0.08, 0.22, 0.09);
      ear.position.set(s * 0.44, 0.04, -0.02);
      ear.rotation.z = -s * 1.15;
      const eye = mesh(THREE, g.sphereLow, m.eyeAmber, 0.062, 0.046, 0.05);
      eye.position.set(s * 0.17, 0.06, 0.39);
      eye.userData.noFlash = true;
      headGroup.add(ear, eye);
    }

    const jawPivot = new THREE.Group();
    jawPivot.position.set(0, -0.14, 0.08);
    jawPivot.rotation.x = 0.22; // roaring jaw!
    const lowerJaw = mesh(THREE, g.dodeca, m.trollStone, 0.34, 0.20, 0.36);
    lowerJaw.position.set(0, -0.08, 0.20);
    const ironChinStrap = mesh(THREE, g.pauldronShell, m.ironBlackened, 0.37, 0.22, 0.38);
    ironChinStrap.position.set(0, -0.10, 0.22);
    ironChinStrap.rotation.set(HALF_PI, 0, -Math.PI * 0.42);
    jawPivot.add(lowerJaw, ironChinStrap);

    for (let s = -1; s <= 1; s += 2) {
      const tusk = mesh(THREE, g.curvedTusk, m.boneIvory, s * 1.75, 1.65, 1.65);
      tusk.position.set(s * 0.22, -0.06, 0.26);
      const tooth = mesh(THREE, g.spikeUp, m.boneIvory, 0.04, 0.12, 0.04);
      tooth.position.set(s * 0.09, 0.02, 0.42);
      jawPivot.add(tusk, tooth);
    }
    headGroup.add(jawPivot);
    bodyRoot.add(headGroup);

    // Huge Muscular Gorilla-Arms + Spiked Iron Gauntlets!
    const armL = new THREE.Group();
    armL.position.set(1.12, 3.16, 0.16);
    armL.rotation.set(-0.26, 0.18, 0.08);
    const bicepL = mesh(THREE, g.sculptedLimb, m.trollStone, 0.30, 0.86, 0.32);
    const foreL = mesh(THREE, g.muscleForearm, m.trollStone, 0.31, 0.88, 0.33);
    foreL.position.set(0, -0.80, 0.04);
    foreL.rotation.x = -0.52;
    const gauntL = mesh(THREE, g.cyl, m.ironBlackened, 0.29, 0.48, 0.30);
    gauntL.position.set(0, -1.16, 0.25);
    gauntL.rotation.x = -0.52;
    const fistL = mesh(THREE, g.dodeca, m.trollStone, 0.26, 0.24, 0.26);
    fistL.position.set(0, -1.52, 0.44);
    armL.add(bicepL, foreL, gauntL, fistL);
    for (let k = 0; k < 3; k++) {
      const gSp = mesh(THREE, g.spikeUp, m.steelBlade, 0.055, 0.22, 0.055);
      gSp.position.set(0.28, -1.05 - k * 0.14, 0.20 + k * 0.07);
      gSp.rotation.z = -HALF_PI;
      armL.add(gSp);
    }

    // Right Arm (-X) + Colossal Two-Handed Iron-Banded Stone/Spiked War-Maul!
    const armR = new THREE.Group();
    armR.position.set(-1.12, 3.16, 0.16);
    armR.rotation.set(-0.32, -0.18, -0.06);
    const bicepR = mesh(THREE, g.sculptedLimb, m.trollStone, 0.32, 0.86, 0.34);
    const foreR = mesh(THREE, g.muscleForearm, m.trollStone, 0.32, 0.88, 0.34);
    foreR.position.set(0, -0.80, 0.04);
    foreR.rotation.x = -0.56;
    const gauntR = mesh(THREE, g.cyl, m.ironBlackened, 0.30, 0.48, 0.31);
    gauntR.position.set(0, -1.16, 0.26);
    gauntR.rotation.x = -0.56;
    const fistR = mesh(THREE, g.dodeca, m.trollStone, 0.27, 0.25, 0.27);
    fistR.position.set(0, -1.50, 0.46);
    armR.add(bicepR, foreR, gauntR, fistR);

    const maulGroup = new THREE.Group();
    maulGroup.position.set(0.22, -1.42, 0.42);
    maulGroup.rotation.set(0.92, -0.36, -0.38); // gripped two-handed across front so maul head looms centrally!
    const maulHaft = mesh(THREE, g.shaftUp, m.ashWood, 0.125, 2.22, 0.125);
    maulHaft.position.y = -0.45;
    const buttCap = mesh(THREE, g.cyl8, m.ironBlackened, 0.155, 0.24, 0.155);
    buttCap.position.y = -0.45;

    // Massive iron-strapped stone War-Maul head!
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 1.58, 0);
    headPivot.rotation.z = HALF_PI;
    const stoneCore = mesh(THREE, g.maulHead, m.trollCrag, 1.38, 1.25, 1.38);
    const bandMid = mesh(THREE, g.cyl8, m.ironBlackened, 0.60, 0.20, 0.60);
    const bandL = mesh(THREE, g.cyl8, m.ironForged, 0.58, 0.14, 0.58);
    bandL.position.y = 0.52;
    const bandR = mesh(THREE, g.cyl8, m.ironForged, 0.58, 0.14, 0.58);
    bandR.position.y = -0.52;
    headPivot.add(stoneCore, bandMid, bandL, bandR);

    // Forged steel siege spikes on striking faces & radial collar!
    for (let s = -1; s <= 1; s += 2) {
      const faceSpike = mesh(THREE, g.spikeUp, m.steelBlade, 0.14, s * 0.38, 0.14);
      faceSpike.position.y = s * 0.76;
      headPivot.add(faceSpike);
    }
    for (let k = 0; k < 6; k++) {
      const ka = (k / 6) * TWO_PI;
      const rSpike = mesh(THREE, g.spikeUp, m.steelBlade, 0.10, 0.34, 0.10);
      rSpike.position.set(Math.cos(ka) * 0.56, 0, Math.sin(ka) * 0.56);
      rSpike.rotation.z = -Math.cos(ka) * HALF_PI;
      rSpike.rotation.x = Math.sin(ka) * HALF_PI;
      headPivot.add(rSpike);
    }
    maulGroup.add(maulHaft, buttCap, headPivot);
    armR.add(maulGroup);

    bodyRoot.add(armL, armR);
    root.scale.setScalar(1.56);

    return finalizeRig(root, {
      type: 'troll',
      variantKey: 'troll',
      bodyRoot,
      headGroup,
      jawPivot,
      legL,
      legR,
      armL,
      armR,
      regenRing,
      height3D: 6.58
    });
  }

  // 6. SHADOW WRAITH
  function buildWraithRig(bank) {
    const THREE = bank.THREE;
    const g = bank.geos;
    const m = bank.mats;

    const root = new THREE.Group();
    const floatGroup = new THREE.Group();
    floatGroup.position.y = 0.28; // hovers above ground even in static portraits!
    root.add(floatGroup);

    const shroudMeshes = [];

    // Dark tattered Morgul obsidian-indigo primary hooded cloak & mantle (0x111a24, opacity: 0.90)
    // over a translucent spectral-cyan lower phantom under-shroud & trailing hem strips!
    const spectralUnderShroud = mesh(THREE, g.wraithRobe, m.wraithStealth, 0.92, 0.76, 0.88);
    spectralUnderShroud.position.set(0, 0.02, 0.01);
    shroudMeshes.push(spectralUnderShroud);

    const outerRobe = mesh(THREE, g.wraithRobe, m.wraithCloak, 1.0, 0.96, 0.94);
    outerRobe.position.set(0, 0.26, -0.02);
    const upperMantle = mesh(THREE, g.warriorTorso, m.wraithCloak, 0.35, 0.68, 0.27);
    upperMantle.position.set(0, 1.18, 0.02);
    const silverCollar = mesh(THREE, g.kettleHelm, m.morgulSilver, 0.30, -0.22, 0.26);
    silverCollar.position.set(0, 1.80, 0.03);
    floatGroup.add(spectralUnderShroud, outerRobe, upperMantle, silverCollar);

    // Lower floating tattered spectral-cyan & obsidian hem strips/mist!
    const ribbons = [];
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * TWO_PI;
      const isSpectral = (i % 2 === 0);
      const stripMat = isSpectral ? m.wraithStealth : m.wraithDarkStrip;
      const strip = mesh(THREE, g.clothTatter, stripMat, 1.25, 0.88 + (i % 3) * 0.12, 1.15);
      strip.position.set(Math.sin(ang) * 0.34, 0.82, Math.cos(ang) * 0.32 - 0.04);
      strip.rotation.set(0.28, ang, 0);
      floatGroup.add(strip);
      ribbons.push(strip);
      if (isSpectral) shroudMeshes.push(strip);
    }

    // Deep sculpted dark Morgul hood + pitch-black void face + bright piercing cyan eyes!
    const hoodGroup = new THREE.Group();
    hoodGroup.position.set(0, 1.84, 0.06);
    const voidFace = mesh(THREE, g.sphereLow, m.voidBlack, 0.165, 0.21, 0.175);
    voidFace.position.set(0, 0.08, 0.05);
    voidFace.userData.noFlash = true;
    const outerHood = mesh(THREE, g.peakedHood, m.wraithCloak, 0.68, 0.54, 0.78);
    outerHood.position.set(0, -0.06, -0.02);
    outerHood.rotation.x = 0.20;
    const hoodRim = mesh(THREE, g.torusThin, m.morgulCyanBlade, 0.19, 0.22, 0.85);
    hoodRim.position.set(0, 0.07, 0.14);
    hoodRim.rotation.x = 0.18;
    hoodRim.userData.noFlash = true;
    hoodGroup.add(voidFace, outerHood, hoodRim);

    for (let s = -1; s <= 1; s += 2) {
      const eye = mesh(THREE, g.sphereLow, m.eyeCyan, 0.045, 0.032, 0.036);
      eye.position.set(s * 0.072, 0.10, 0.195);
      eye.userData.noFlash = true;
      hoodGroup.add(eye);
    }
    floatGroup.add(hoodGroup);

    // Left Arm (+X): Dark tattered bell-sleeve + Skeletal Silver Gauntlet & Clawed Fingers!
    const leftArm = new THREE.Group();
    leftArm.position.set(0.35, 1.68, 0.10);
    leftArm.rotation.set(-0.56, -0.18, 0.15);
    const sleeveL = mesh(THREE, g.wraithRobe, m.wraithCloak, 0.28, 0.38, 0.30);
    sleeveL.position.set(0, -0.38, 0);
    const gauntletL = mesh(THREE, g.sculptedLimb, m.morgulSilver, 0.065, 0.48, 0.065);
    leftArm.add(sleeveL, gauntletL);
    for (let f = -1; f <= 1; f++) {
      const claw = mesh(THREE, g.spikeUp, m.morgulSilver, 0.018, 0.16, 0.018);
      claw.position.set(f * 0.030, -0.48, 0.05);
      claw.rotation.x = 1.85;
      leftArm.add(claw);
    }
    floatGroup.add(leftArm);

    // Right Arm (-X): Skeletal Silver Gauntlet + Pale Glowing Morgul Longsword (`swordPivot`)!
    const swordPivot = new THREE.Group();
    swordPivot.position.set(-0.36, 1.68, 0.12);
    swordPivot.rotation.x = -0.22;
    const sleeveR = mesh(THREE, g.wraithRobe, m.wraithCloak, 0.28, 0.38, 0.28);
    sleeveR.position.set(0, -0.38, 0);
    const gauntletR = mesh(THREE, g.sculptedLimb, m.morgulSilver, 0.068, 0.48, 0.068);
    swordPivot.add(sleeveR, gauntletR);

    const sword = new THREE.Group();
    sword.position.set(0, -0.46, 0.09);
    sword.rotation.x = 1.16;
    const hilt = mesh(THREE, g.cyl8, m.ironBlackened, 0.028, 0.26, 0.028);
    const guard = mesh(THREE, g.morgulGuard, m.morgulSilver, 0.82, 0.80, 0.80);
    guard.position.y = 0.13;
    const blade = mesh(THREE, g.morgulBlade, m.morgulCyanBlade, 1.04, 1.36, 1.02);
    blade.position.y = 0.13;
    blade.userData.noFlash = true;
    sword.add(hilt, guard, blade);
    swordPivot.add(sword);
    floatGroup.add(swordPivot);

    // True Sight Reveal Indicator
    const revealGroup = new THREE.Group();
    revealGroup.visible = false;
    revealGroup.userData.skipStudioBounds = true;
    const revRing = mesh(THREE, g.ring, m.trueSightRing, 0.85, 0.85, 1);
    revRing.rotation.x = -HALF_PI;
    revRing.position.y = 0.08;
    revRing.userData.noShadow = true;
    const revEye = mesh(THREE, g.octa, m.morgulCyanBlade, 0.14, 0.24, 0.14);
    revEye.position.y = 2.42;
    revEye.userData.noShadow = true;
    revEye.userData.noFlash = true;
    revealGroup.add(revRing, revEye);
    root.add(revealGroup);
    root.scale.setScalar(1.30);

    const rig = finalizeRig(root, {
      type: 'wraith',
      variantKey: 'wraith',
      floatGroup,
      shroudMeshes,
      ribbons,
      swordPivot,
      leftArm,
      revealGroup,
      revRing,
      revEye,
      shroudState: 0,
      height3D: 3.18
    });

    rig.poseStudio = function() {
      for (let i = 0; i < shroudMeshes.length; i++) {
        shroudMeshes[i].material = m.wraithStealth;
      }
      outerRobe.material = m.wraithCloak;
      upperMantle.material = m.wraithCloak;
      outerHood.material = m.wraithCloak;
    };

    return rig;
  }

  // 7. FELL BEAST (Winged Nazgûl Wyvern/Hell-hawk, wingspan ~5.5u, carrying Ringwraith rider!)
  function buildFellBeastRig(bank, opts) {
    const THREE = bank.THREE;
    const g = bank.geos;
    const m = bank.mats;

    const root = new THREE.Group();

    // Ground shadow marker starts collapsed (0.001) & flyer starts centered at y = 1.05
    // so studio Box3 portraits frame the 5.5u winged Wyvern + Nazgul rider tightly!
    // In live gameplay, sync() immediately lifts flyer.position.y = 6.5 and scales groundShadow!
    const groundShadow = mesh(THREE, g.disc, m.groundMarker, 0.001, 0.001, 1);
    groundShadow.rotation.x = -HALF_PI;
    groundShadow.position.y = 0.04;
    groundShadow.userData.noShadow = true;
    groundShadow.userData.skipStudioBounds = true;
    groundShadow.userData.isGroundDecal = true;
    root.add(groundShadow);

    const flyer = new THREE.Group();
    flyer.position.y = 1.05;
    root.add(flyer);

    // Keeled armored reptilian chest, belly & sinuous S-curved neck (`fellNeck`)
    const body = mesh(THREE, g.drakeBody, m.fellScale, 1.08, 1.02, 1.05);
    const chestKeel = mesh(THREE, g.sphere, m.fellBelly, 0.36, 0.34, 0.68);
    chestKeel.position.set(0, -0.14, 0.25);
    const neck = mesh(THREE, g.fellNeck, m.fellScale, 1, 1, 1);
    flyer.add(body, chestKeel, neck);

    // Dorsal spine scutes along neck & back
    const scuteCoords = [
      [0.92, 1.85, 0.20], [0.82, 1.50, 0.22], [0.48, 1.14, 0.22],
      [0.36, 0.56, 0.24], [0.40, 0.05, 0.24], [0.34, -0.45, 0.20]
    ];
    for (let i = 0; i < scuteCoords.length; i++) {
      const sc = scuteCoords[i];
      const fin = mesh(THREE, g.flameTongue, m.darkHorn, 0.85, sc[2], 0.9);
      fin.position.set(0, sc[0], sc[1]);
      fin.rotation.x = -0.35;
      flyer.add(fin);
    }

    // Elongated Horned Reptilian Skull & Snapping Toothed Jaws!
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.74, 2.34);

    const cranium = mesh(THREE, g.dodeca, m.fellScale, 0.22, 0.19, 0.26);
    const upperSnout = mesh(THREE, g.cone8, m.fellScale, 0.145, 0.72, 0.12);
    upperSnout.rotation.x = HALF_PI + 0.08;
    upperSnout.position.set(0, 0.02, 0.42);
    const beakHook = mesh(THREE, g.spikeUp, m.darkHorn, 0.05, -0.16, 0.06);
    beakHook.position.set(0, -0.02, 0.74);
    beakHook.rotation.x = 0.28;
    headGroup.add(cranium, upperSnout, beakHook);

    const hornL = mesh(THREE, g.fellHornL, m.darkHorn, 1, 1, 1);
    hornL.position.set(0.11, 0.08, -0.04);
    const hornR = mesh(THREE, g.fellHornR, m.darkHorn, 1, 1, 1);
    hornR.position.set(-0.11, 0.08, -0.04);
    headGroup.add(hornL, hornR);

    for (let s = -1; s <= 1; s += 2) {
      const eye = mesh(THREE, g.sphereLow, m.eyeCrimson, 0.036, 0.028, 0.032);
      eye.position.set(s * 0.13, 0.05, 0.14);
      eye.userData.noFlash = true;
      headGroup.add(eye);
      for (let t = 0; t < 4; t++) {
        const tooth = mesh(THREE, g.spikeUp, m.boneIvory, 0.018, -0.08, 0.018);
        tooth.position.set(s * (0.08 - t * 0.012), -0.04, 0.24 + t * 0.11);
        headGroup.add(tooth);
      }
    }

    const jawPivot = new THREE.Group();
    jawPivot.position.set(0, -0.08, 0.06);
    jawPivot.rotation.x = 0.28; // snapping open reptilian jaws!
    const lowerJaw = mesh(THREE, g.cone8, m.fellBelly, 0.105, 0.62, 0.08);
    lowerJaw.rotation.x = HALF_PI;
    lowerJaw.position.set(0, -0.01, 0.32);
    const tongue = mesh(THREE, g.spikeUp, m.wargGums, 0.035, 0.38, 0.02);
    tongue.rotation.x = HALF_PI;
    tongue.position.set(0, 0.02, 0.18);
    jawPivot.add(lowerJaw, tongue);
    for (let s = -1; s <= 1; s += 2) {
      for (let t = 0; t < 3; t++) {
        const lTooth = mesh(THREE, g.spikeUp, m.boneIvory, 0.016, 0.07, 0.016);
        lTooth.position.set(s * (0.065 - t * 0.01), 0.01, 0.22 + t * 0.12);
        jawPivot.add(lTooth);
      }
    }
    headGroup.add(jawPivot);
    flyer.add(headGroup);

    // Tucked Raptorial Hind-Legs & Curved Talons
    for (let s = -1; s <= 1; s += 2) {
      const talonLeg = new THREE.Group();
      talonLeg.position.set(s * 0.28, -0.22, -0.35);
      talonLeg.rotation.x = 0.55;
      const thigh = mesh(THREE, g.sculptedLimb, m.fellScale, 0.11, 0.42, 0.12);
      const shin = mesh(THREE, g.sculptedLimb, m.darkHorn, 0.075, 0.38, 0.08);
      shin.position.set(0, -0.38, 0.02);
      shin.rotation.x = -0.85;
      talonLeg.add(thigh, shin);
      for (let c = -1; c <= 1; c++) {
        const claw = mesh(THREE, g.spikeUp, m.darkHorn, 0.025, 0.18, 0.025);
        claw.position.set(c * 0.04, -0.64, 0.26);
        claw.rotation.x = 1.95;
        talonLeg.add(claw);
      }
      flyer.add(talonLeg);
    }

    // Long Sinuous Whip-Tail with Barbed Spade Tip!
    const tailGroup = new THREE.Group();
    const tail = mesh(THREE, g.fellTail, m.fellScale, 1, 1, 1);
    const spade = mesh(THREE, g.tailSpade, m.morgulSilver, 1.22, 1.22, 1.22);
    spade.position.set(0, 0.24, -2.32);
    tailGroup.add(tail, spade);
    flyer.add(tailGroup);

    // Wide Articulated Bat-Wings (wingspan ~5.5u: pitched forward/upward so cambered membranes face 3/4 camera!)
    const buildWyvernWing = (side) => {
      const isLeft = side > 0;
      const innerPivot = new THREE.Group();
      innerPivot.position.set(side * 0.30, 0.18, 0.22);
      innerPivot.rotation.set(0.38, 0, side * 0.46); // pitched forward/upward so full wing membrane faces camera!

      const armBone = mesh(THREE, isLeft ? g.fbArmL : g.fbArmR, m.fellWingBone, 1, 1, 1);
      const innerMem = mesh(THREE, isLeft ? g.fbInnerWebL : g.fbInnerWebR, m.fellWingMembrane, 1, 1, 1);
      innerPivot.add(armBone, innerMem);

      const outerPivot = new THREE.Group();
      outerPivot.position.set(side * 1.15, 0.08, 0.56);
      outerPivot.rotation.set(0.10, 0, -side * 0.16);

      const outerMem = mesh(THREE, isLeft ? g.fbOuterWebL : g.fbOuterWebR, m.fellWingMembrane, 1, 1, 1);
      outerPivot.add(outerMem);

      const fArr = isLeft ? g.fbFingersL : g.fbFingersR;
      for (let f = 0; f < fArr.length; f++) {
        outerPivot.add(mesh(THREE, fArr[f], m.fellWingBone, 1, 1, 1));
      }

      const thumbClaw = mesh(THREE, g.spikeUp, m.boneIvory, 0.052, 0.28, 0.052);
      thumbClaw.rotation.set(HALF_PI - 0.25, 0, -side * 0.25);
      thumbClaw.position.set(0, 0.04, 0.06);
      outerPivot.add(thumbClaw);

      innerPivot.add(outerPivot);
      flyer.add(innerPivot);
      return { innerPivot, outerPivot };
    };

    const wingL = buildWyvernWing(1);
    const wingR = buildWyvernWing(-1);

    // Cloaked Ringwraith Rider in Spiked Wyvern Saddle!
    const rider = new THREE.Group();
    rider.position.set(0, 0.34, 0.24);
    rider.rotation.x = 0.28;

    const saddle = mesh(THREE, g.pauldronShell, m.ironBlackened, 0.38, 0.28, 0.42);
    saddle.rotation.x = HALF_PI;
    const cloak = mesh(THREE, g.wraithRobe, m.nazgulCloth, 0.62, 0.62, 0.65);
    const rTorso = mesh(THREE, g.warriorTorso, m.nazgulCloth, 0.24, 0.48, 0.20);
    rTorso.position.y = 0.28;
    const hood = mesh(THREE, g.peakedHood, m.nazgulCloth, 0.52, 0.40, 0.58);
    hood.position.set(0, 0.72, 0.05);
    hood.rotation.x = 0.24;
    const voidFace = mesh(THREE, g.sphereLow, m.voidBlack, 0.12, 0.14, 0.13);
    voidFace.position.set(0, 0.80, 0.08);
    voidFace.userData.noFlash = true;
    rider.add(saddle, cloak, rTorso, hood, voidFace);

    for (let s = -1; s <= 1; s += 2) {
      const pld = mesh(THREE, g.pauldronShell, m.morgulSilver, 0.18, 0.16, 0.18);
      pld.position.set(s * 0.26, 0.68, 0.04);
      pld.rotation.set(0.1, s > 0 ? -0.35 : Math.PI - 0.35, -s * 0.35);
      rider.add(pld);
    }
    for (let i = 0; i < 5; i++) {
      const ca = ((i / 4) - 0.5) * 2.2;
      const cSp = mesh(THREE, g.crownLancet, m.morgulSilver, 0.45, i === 2 ? 0.26 : 0.18, 0.55);
      cSp.position.set(Math.sin(ca) * 0.14, 0.92, 0.06 + Math.cos(ca) * 0.14);
      cSp.rotation.y = ca;
      rider.add(cSp);
    }
    // Rider Morgul Sword held aloft
    const rBlade = mesh(THREE, g.morgulBlade, m.nazgulRunesword, 0.68, 0.95, 0.72);
    rBlade.position.set(-0.30, 0.62, 0.22);
    rBlade.rotation.set(0.75, 0, -0.35);
    rBlade.userData.noFlash = true;
    rider.add(rBlade);

    flyer.add(rider);

    const fbRig = finalizeRig(root, {
      type: 'fellbeast',
      variantKey: 'fellbeast',
      flyer,
      headGroup,
      jawPivot,
      wingL,
      wingR,
      tailGroup,
      rider,
      groundShadow,
      height3D: 1.92
    });

    fbRig.poseStudio = function() {
      flyer.position.y = 1.15;
      wingL.innerPivot.rotation.set(0.38, 0, 0.46);
      wingL.outerPivot.rotation.set(0.12, 0, -0.16);
      wingR.innerPivot.rotation.set(0.38, 0, -0.46);
      wingR.outerPivot.rotation.set(0.12, 0, 0.16);
      if (groundShadow) groundShadow.visible = false;
    };

    return fbRig;
  }

  // 8. RINGWRAITH BOSS (Lord of the Nazgûl — 7-spiked silver crown, fluted steel, runesword & dark mist!)
  function buildRingwraithRig(bank) {
    const THREE = bank.THREE;
    const g = bank.geos;
    const m = bank.mats;

    const root = new THREE.Group();
    const bodyRoot = new THREE.Group();
    root.add(bodyRoot);

    // Sweeping Layered Pleated Black Robes, Surcoat & Billowing Mantle Cape!
    const lowerRobe = mesh(THREE, g.nazgulRobe, m.nazgulCloth, 0.96, 1.05, 0.92);
    lowerRobe.position.set(0, 0.02, -0.04);
    const innerSurcoat = mesh(THREE, g.wraithRobe, m.nazgulInnerCloth, 0.88, 1.18, 0.82);
    innerSurcoat.position.set(0, 0.45, 0.06);
    const upperTorso = mesh(THREE, g.warriorTorso, m.nazgulCloth, 0.48, 1.18, 0.38);
    upperTorso.position.set(0, 1.78, 0.02);
    const cape = mesh(THREE, g.capeCloak, m.nazgulCloth, 0.88, 2.55, 0.72);
    cape.position.set(0, 2.94, -0.06);
    cape.rotation.x = 0.12;
    bodyRoot.add(lowerRobe, innerSurcoat, upperTorso, cape);

    // Fluted Steel Gorget & Multi-Layered Gothic Pauldrons!
    const gorget = mesh(THREE, g.kettleHelm, m.morgulSilver, 0.44, -0.32, 0.38);
    gorget.position.set(0, 2.98, 0.04);
    const breastRib = mesh(THREE, g.pauldronShell, m.ironBlackened, 0.44, 0.62, 0.36);
    breastRib.position.set(0, 2.48, 0.05);
    breastRib.rotation.set(-0.22, -Math.PI * 0.42, 0);
    bodyRoot.add(gorget, breastRib);

    for (let s = -1; s <= 1; s += 2) {
      for (let l = 0; l < 3; l++) {
        const lame = mesh(THREE, g.pauldronShell, l === 0 ? m.morgulSilver : m.ironForged, 0.35 - l * 0.02, 0.26, 0.35 - l * 0.02);
        lame.position.set(s * (0.50 + l * 0.04), 2.92 - l * 0.13, 0.03);
        lame.rotation.set(0.12, s > 0 ? -0.35 : Math.PI - 0.35, -s * (0.24 + l * 0.08));
        bodyRoot.add(lame);
      }
      const pSpike = mesh(THREE, g.crownLancet, m.morgulSilver, 0.62, 0.34, 0.72);
      pSpike.position.set(s * 0.54, 3.04, 0.03);
      pSpike.rotation.z = -s * 0.36;
      bodyRoot.add(pSpike);
    }

    // Unseen Void Face under Deep Hood + Tall 7-Spiked Silver Morgul Crown + Two Fiery Eyes!
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 3.24, 0.06);

    const voidSkull = mesh(THREE, g.sphere, m.voidBlack, 0.24, 0.30, 0.26);
    voidSkull.userData.noFlash = true;
    const hood = mesh(THREE, g.peakedHood, m.nazgulCloth, 0.88, 0.68, 0.96);
    hood.position.set(0, -0.14, -0.04);
    hood.rotation.x = 0.16;
    const crownBand = mesh(THREE, g.cyl, m.morgulSilver, 0.295, 0.14, 0.305);
    crownBand.position.set(0, 0.18, 0.01);
    const crownRim = mesh(THREE, g.torusThin, m.morgulSilver, 0.305, 0.315, 1.3);
    crownRim.rotation.x = HALF_PI;
    crownRim.position.set(0, 0.12, 0.01);
    headGroup.add(voidSkull, hood, crownBand, crownRim);

    // 7 Faceted Silver Morgul Crown Spikes!
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * TWO_PI;
      const spikeH = i === 0 ? 0.66 : (i === 1 || i === 6 ? 0.50 : 0.38);
      const sp = mesh(THREE, g.crownLancet, m.morgulSilver, 0.82, spikeH, 0.85);
      sp.position.set(Math.sin(ang) * 0.29, 0.23, 0.01 + Math.cos(ang) * 0.30);
      sp.rotation.y = ang;
      headGroup.add(sp);
    }

    for (let s = -1; s <= 1; s += 2) {
      const eye = mesh(THREE, g.sphereLow, m.eyeFurnace, 0.045, 0.032, 0.036);
      eye.position.set(s * 0.092, 0.02, 0.245);
      eye.userData.noFlash = true;
      headGroup.add(eye);
    }
    bodyRoot.add(headGroup);

    // Right Arm (-X): Fluted Steel Gauntlet + Glowing Runesword (`swordArm`)!
    const swordArm = new THREE.Group();
    swordArm.position.set(-0.56, 2.78, 0.10);
    swordArm.rotation.x = -0.24;
    const armUpperR = mesh(THREE, g.sculptedLimb, m.nazgulCloth, 0.14, 0.52, 0.14);
    const gauntletR = mesh(THREE, g.muscleForearm, m.morgulSilver, 0.12, 0.48, 0.12);
    gauntletR.position.set(0, -0.48, 0.02);
    gauntletR.rotation.x = -0.35;
    swordArm.add(armUpperR, gauntletR);

    const swordGrp = new THREE.Group();
    swordGrp.position.set(0, -0.88, 0.20);
    swordGrp.rotation.x = 1.14;
    const grip = mesh(THREE, g.cyl8, m.ironBlackened, 0.036, 0.42, 0.036);
    const pommel = mesh(THREE, g.torusThin, m.morgulSilver, 0.075, 0.075, 2.0);
    pommel.position.y = -0.22;
    const guard = mesh(THREE, g.morgulGuard, m.morgulSilver, 1.18, 1.12, 1.12);
    guard.position.y = 0.20;
    const bladeSteel = mesh(THREE, g.morgulBlade, m.steelBlade, 1.32, 2.05, 0.85);
    bladeSteel.position.y = 0.20;
    const bladeRune = mesh(THREE, g.morgulBlade, m.nazgulRunesword, 0.72, 1.98, 1.15);
    bladeRune.position.y = 0.22;
    bladeRune.userData.noFlash = true;
    swordGrp.add(grip, pommel, guard, bladeSteel, bladeRune);
    swordArm.add(swordGrp);

    // Left Arm (+X): Draped Sleeve + Clawed Steel Gauntlet (`leftArm`)!
    const leftArm = new THREE.Group();
    leftArm.position.set(0.56, 2.78, 0.10);
    leftArm.rotation.set(-0.36, -0.15, 0.12);
    const sleeveBell = mesh(THREE, g.wraithRobe, m.nazgulCloth, 0.36, 0.72, 0.40);
    sleeveBell.position.set(0, -0.76, -0.04);
    const gauntletL = mesh(THREE, g.muscleForearm, m.morgulSilver, 0.11, 0.56, 0.11);
    gauntletL.rotation.x = -0.45;
    leftArm.add(sleeveBell, gauntletL);
    for (let f = -1; f <= 1; f++) {
      const claw = mesh(THREE, g.spikeUp, m.morgulSilver, 0.02, 0.18, 0.02);
      claw.position.set(f * 0.036, -0.50, 0.24);
      claw.rotation.x = 1.55;
      leftArm.add(claw);
    }
    bodyRoot.add(swordArm, leftArm);

    // Swirling Dark Mist & Black Breath Rings (proportioned tightly so Box3 frames heroically!)
    const breathAura = new THREE.Group();
    const ring1 = mesh(THREE, g.ring, m.nazgulMist, 1.18, 1.18, 1);
    ring1.rotation.x = -HALF_PI;
    ring1.position.y = 0.08;
    ring1.userData.noShadow = true;
    const ring2 = mesh(THREE, g.mistSpiral, m.nazgulMist, 0.96, 1.0, 0.96);
    ring2.userData.noShadow = true;
    const mist2 = mesh(THREE, g.mistSpiral, m.nazgulMist, -0.88, 0.92, -0.88);
    mist2.position.y = 0.22;
    mist2.userData.noShadow = true;
    breathAura.add(ring1, ring2, mist2);
    root.add(breathAura);
    root.scale.setScalar(1.34);

    return finalizeRig(root, {
      type: 'ringwraith',
      variantKey: 'ringwraith',
      bodyRoot,
      headGroup,
      swordArm,
      leftArm,
      breathAura,
      ring1,
      ring2,
      height3D: 5.42
    });
  }

  // 9 & 10. DUAL-PHASE GRAND SIEGE BOSS:
  //   PHASE 1: THE WITCH-LORD OF MORGUL (~2.6x human height)
  //   PHASE 2: BALROG OF UDÛN (~3.4x infantry height, wingspan ~9.5u!)
  function buildBalrogBossRig(bank, variantKey, opts) {
    const THREE = bank.THREE;
    const g = bank.geos;
    const m = bank.mats;

    const root = new THREE.Group();

    // ========================================================================
    // PHASE 1: THE WITCH-LORD OF MORGUL
    // ========================================================================
    const phase1Group = new THREE.Group();
    phase1Group.scale.setScalar(1.30);
    root.add(phase1Group);

    const p1Body = new THREE.Group();
    phase1Group.add(p1Body);

    // Armored Sabatons & Greaves beneath Split War-Robes
    for (let s = -1; s <= 1; s += 2) {
      const greave = mesh(THREE, g.muscleForearm, m.ironForged, 0.16, 0.95, 0.17);
      greave.position.set(s * 0.28, 0.96, 0.08);
      const sabaton = mesh(THREE, g.sphereLow, m.morgulSilver, 0.13, 0.08, 0.24);
      sabaton.position.set(s * 0.28, 0.08, 0.18);
      p1Body.add(greave, sabaton);
    }

    const p1Skirt = mesh(THREE, g.witchlordSkirt, m.nazgulCloth, 0.98, 1.04, 0.94);
    p1Skirt.position.y = 0.02;
    const p1Mail = mesh(THREE, g.cyl, m.chainmail, 0.48, 0.72, 0.38);
    p1Mail.position.y = 1.95;
    const p1Torso = mesh(THREE, g.warriorTorso, m.ironBlackened, 0.56, 1.38, 0.44);
    p1Torso.position.y = 1.98;
    const p1Breast = mesh(THREE, g.pauldronShell, m.ironForged, 0.52, 0.85, 0.44);
    p1Breast.position.set(0, 2.75, 0.06);
    p1Breast.rotation.set(-0.20, -Math.PI * 0.42, 0);
    const p1Cape = mesh(THREE, g.capeCloak, m.nazgulCloth, 1.02, 2.95, 0.80);
    p1Cape.position.set(0, 3.30, -0.08);
    p1Cape.rotation.x = 0.12;
    p1Body.add(p1Skirt, p1Mail, p1Torso, p1Breast, p1Cape);

    // Multi-tiered Spiked Angmar Pauldrons & Gorget
    const p1Gorget = mesh(THREE, g.kettleHelm, m.ironForged, 0.50, -0.36, 0.44);
    p1Gorget.position.set(0, 3.36, 0.04);
    p1Body.add(p1Gorget);
    for (let s = -1; s <= 1; s += 2) {
      for (let l = 0; l < 3; l++) {
        const lame = mesh(THREE, g.pauldronShell, l === 0 ? m.morgulSilver : m.ironBlackened, 0.42 - l * 0.02, 0.30, 0.42 - l * 0.02);
        lame.position.set(s * (0.62 + l * 0.04), 3.28 - l * 0.15, 0.04);
        lame.rotation.set(0.12, s > 0 ? -0.35 : Math.PI - 0.35, -s * (0.25 + l * 0.08));
        p1Body.add(lame);
      }
      const shoulderBlade = mesh(THREE, g.crownLancet, m.morgulSilver, 0.85, 0.48, 0.9);
      shoulderBlade.position.set(s * 0.68, 3.45, 0.04);
      shoulderBlade.rotation.z = -s * 0.38;
      p1Body.add(shoulderBlade);
    }

    // Iconic Tall Jagged Iron Crown-Helm of Angmar!
    const angmarHelm = new THREE.Group();
    angmarHelm.position.set(0, 3.68, 0.07);

    const voidMaskCore = mesh(THREE, g.cyl8, m.voidBlack, 0.25, 0.52, 0.26);
    voidMaskCore.userData.noFlash = true;
    angmarHelm.add(voidMaskCore);

    // Forged iron Angmar cheek-fangs & nasal bridge framing T-shaped void visor
    const browPlate = mesh(THREE, g.cyl8, m.morgulSilver, 0.30, 0.14, 0.31);
    browPlate.position.y = 0.20;
    const nasalBridge = mesh(THREE, g.crownLancet, m.morgulSilver, 0.65, -0.44, 0.8);
    nasalBridge.position.set(0, 0.22, 0.31);
    const backHood = mesh(THREE, g.peakedHood, m.nazgulCloth, 0.96, 0.72, 1.02);
    backHood.position.set(0, -0.22, -0.06);
    angmarHelm.add(browPlate, nasalBridge, backHood);

    for (let s = -1; s <= 1; s += 2) {
      const maskCheek = mesh(THREE, g.crownLancet, m.ironForged, 1.05, -0.48, 0.9);
      maskCheek.position.set(s * 0.19, 0.16, 0.23);
      maskCheek.rotation.y = s * 0.52;
      const eye = mesh(THREE, g.sphereLow, m.eyeFurnace, 0.042, 0.028, 0.032);
      eye.position.set(s * 0.095, 0.08, 0.27);
      eye.userData.noFlash = true;
      angmarHelm.add(maskCheek, eye);
    }

    // Towering 8-Spired Jagged Iron Crown of Angmar (tall central spire = ~7.05u world height!)
    const spireHeights = [1.18, 0.78, 0.58, 0.46, 0.52, 0.46, 0.58, 0.78];
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * TWO_PI;
      const sh = spireHeights[i];
      const spire = mesh(THREE, g.crownLancet, i === 0 ? m.morgulSilver : m.ironForged, 1.08, sh, 1.05);
      spire.position.set(Math.sin(ang) * 0.30, 0.24, Math.cos(ang) * 0.31);
      spire.rotation.y = ang;
      angmarHelm.add(spire);
    }
    p1Body.add(angmarHelm);

    // Left Hand (+X, `p1ArmL`): Blazing Flaming Runesword!
    const p1ArmL = new THREE.Group();
    p1ArmL.position.set(0.68, 3.12, 0.12);
    p1ArmL.rotation.x = -0.22;
    const p1UpL = mesh(THREE, g.sculptedLimb, m.ironBlackened, 0.16, 0.58, 0.16);
    const p1ForeL = mesh(THREE, g.muscleForearm, m.morgulSilver, 0.14, 0.54, 0.14);
    p1ForeL.position.set(0, -0.54, 0.02);
    p1ForeL.rotation.x = -0.36;
    p1ArmL.add(p1UpL, p1ForeL);

    const p1SwordGrp = new THREE.Group();
    p1SwordGrp.position.set(0, -0.96, 0.22);
    p1SwordGrp.rotation.x = 1.15;
    const sGrip = mesh(THREE, g.cyl8, m.ironBlackened, 0.04, 0.44, 0.04);
    const sGuard = mesh(THREE, g.morgulGuard, m.morgulSilver, 1.28, 1.22, 1.2);
    sGuard.position.y = 0.22;
    const sBlade = mesh(THREE, g.morgulBlade, m.steelBlade, 1.42, 2.25, 0.9);
    sBlade.position.y = 0.22;
    p1SwordGrp.add(sGrip, sGuard, sBlade);

    // Licking Witch-Fire Tongues wreathing the runesword!
    for (let f = 0; f < 5; f++) {
      const fMat = (f % 2 === 0) ? m.witchFireBlade : m.morgulGreenFlame;
      const flame = mesh(THREE, g.flameTongue, fMat, 0.85, 0.55, 0.85);
      flame.position.set(0, 0.45 + f * 0.36, (f % 2 === 0 ? 1 : -1) * 0.04);
      flame.rotation.y = f * 1.4;
      flame.userData.noFlash = true;
      p1SwordGrp.add(flame);
    }
    p1ArmL.add(p1SwordGrp);

    // Right Hand (-X, `p1ArmR`): Giant Spiked Three-Headed Iron Flail on Swinging Chains!
    const p1ArmR = new THREE.Group();
    p1ArmR.position.set(-0.68, 3.12, 0.12);
    p1ArmR.rotation.x = -0.34;
    const p1UpR = mesh(THREE, g.sculptedLimb, m.ironBlackened, 0.17, 0.58, 0.17);
    const p1ForeR = mesh(THREE, g.muscleForearm, m.morgulSilver, 0.145, 0.54, 0.145);
    p1ForeR.position.set(0, -0.54, 0.02);
    p1ForeR.rotation.x = -0.52;
    p1ArmR.add(p1UpR, p1ForeR);

    const flailHaft = mesh(THREE, g.shaftUp, m.ironForged, 0.058, 1.28, 0.058);
    flailHaft.rotation.x = HALF_PI * 0.88;
    flailHaft.position.set(0, -0.82, 0.12);
    const swivelRing = mesh(THREE, g.torusLink, m.morgulSilver, 0.09, 0.09, 0.09);
    swivelRing.position.set(0, -0.58, 1.38);
    p1ArmR.add(flailHaft, swivelRing);

    const flailChainPivot = new THREE.Group();
    flailChainPivot.position.set(0, -0.58, 1.38);
    flailChainPivot.rotation.x = 0.34; // counter-rotates arm pitch so chains hang vertically above ground!

    const chCenter = mesh(THREE, g.flailChainCenter, m.morgulSilver, 1, 1, 1);
    const chLeft = mesh(THREE, g.flailChainLeft, m.morgulSilver, 1, 1, 1);
    const chRight = mesh(THREE, g.flailChainRight, m.morgulSilver, 1, 1, 1);
    flailChainPivot.add(chCenter, chLeft, chRight);

    // 3 Spiked Iron Morningstar Flail Heads!
    const headPositions = [
      [0.0, -0.98, 0.14, 1.08],
      [0.29, -0.88, 0.05, 0.90],
      [-0.27, -0.92, -0.08, 0.90]
    ];
    for (let h = 0; h < 3; h++) {
      const hp = headPositions[h];
      const fHead = new THREE.Group();
      fHead.position.set(hp[0], hp[1], hp[2]);
      fHead.scale.setScalar(hp[3]);
      const core = mesh(THREE, g.dodeca, m.ironBlackened, 0.24, 0.32, 0.24);
      const collar = mesh(THREE, g.cyl8, m.morgulSilver, 0.12, 0.12, 0.12);
      collar.position.y = 0.28;
      fHead.add(core, collar);
      for (let k = 0; k < 6; k++) {
        const ka = (k / 6) * TWO_PI;
        const sp = mesh(THREE, g.spikeUp, m.steelBlade, 0.055, 0.22, 0.055);
        sp.position.set(Math.cos(ka) * 0.20, 0, Math.sin(ka) * 0.20);
        sp.rotation.z = -Math.cos(ka) * HALF_PI;
        sp.rotation.x = Math.sin(ka) * HALF_PI;
        fHead.add(sp);
      }
      const bottomSpike = mesh(THREE, g.spikeUp, m.steelBlade, 0.065, -0.26, 0.065);
      bottomSpike.position.y = -0.26;
      fHead.add(bottomSpike);
      flailChainPivot.add(fHead);
    }
    p1ArmR.add(flailChainPivot);
    p1Body.add(p1ArmL, p1ArmR);

    const p1Aura = mesh(THREE, g.ring, m.morgulGreenFlame, 1.28, 1.28, 1);
    p1Aura.rotation.x = -HALF_PI;
    p1Aura.position.y = 0.06;
    p1Aura.userData.noShadow = true;
    p1Aura.userData.noFlash = true;
    p1Aura.userData.skipStudioBounds = true;
    phase1Group.add(p1Aura);

    // ========================================================================
    // PHASE 2: COLOSSAL BALROG OF UDÛN (~3.4x infantry height, wingspan ~9.5u!)
    // ========================================================================
    const phase2Group = new THREE.Group();
    phase2Group.visible = false;
    phase2Group.scale.setScalar(0.0001); // collapsed while hidden so Phase 1 Box3 stays tight; sync() sets 1.32!
    root.add(phase2Group);

    const p2Body = new THREE.Group();
    phase2Group.add(p2Body);

    // Digitigrade Cloven Demon Legs fissured with Glowing Magma Cracks!
    const buildBalrogLeg = (side, pose) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.72, 2.26, 0);
      hip.rotation.x = pose;

      const thigh = mesh(THREE, g.sculptedLimb, m.balrogMuscle, 0.46, 1.12, 0.50);
      thigh.rotation.x = -0.28;
      const kneeSpur = mesh(THREE, g.spikeUp, m.balrogHornMat, 0.11, 0.40, 0.12);
      kneeSpur.position.set(0, -0.94, 0.36);
      kneeSpur.rotation.x = 0.72;
      const hock = mesh(THREE, g.muscleForearm, m.balrogMuscle, 0.35, 0.94, 0.37);
      hock.position.set(0, -0.98, 0.26);
      hock.rotation.x = 0.56;
      const pastern = mesh(THREE, g.sculptedLimb, m.balrogCharcoal, 0.25, 0.54, 0.27);
      pastern.position.set(0, -1.72, -0.18);
      pastern.rotation.x = -0.28;

      // Split Cloven Obsidian Hooves + Glowing Magma Cleft!
      const hoofL = mesh(THREE, g.demonHoof, m.balrogCharcoal, 0.17, 0.28, 0.32);
      hoofL.position.set(-0.10, -2.14, 0.04);
      const hoofR = mesh(THREE, g.demonHoof, m.balrogCharcoal, 0.17, 0.28, 0.32);
      hoofR.position.set(0.10, -2.14, 0.04);
      const cleftGlow = mesh(THREE, g.octa, m.balrogMagmaVein, 0.06, 0.14, 0.24);
      cleftGlow.position.set(0, -2.04, 0.08);
      cleftGlow.userData.noFlash = true;

      hip.add(thigh, kneeSpur, hock, pastern, hoofL, hoofR, cleftGlow);
      return hip;
    };

    const bLegL = buildBalrogLeg(-1, 0.12);
    const bLegR = buildBalrogLeg(1, -0.12);
    p2Body.add(bLegL, bLegR);

    // Muscular Spiked Demon Tail (`balrogTail`)
    const bTail = mesh(THREE, g.balrogTail, m.balrogMuscle, 1.12, 1.05, 1.08);
    bTail.position.set(0, 2.28, -0.35);
    p2Body.add(bTail);

    // Charcoal-Obsidian Muscular Torso fissured with Magma Veins + Recessed Furnace Core (`magmaCore`)!
    const pelvis = mesh(THREE, g.cyl, m.balrogCharcoal, 0.84, 0.60, 0.70);
    pelvis.position.set(0, 2.30, 0.02);
    const torsoMuscle = mesh(THREE, g.balrogTorso, m.balrogMuscle, 1.18, 2.62, 0.92);
    torsoMuscle.position.set(0, 2.32, 0.05);
    torsoMuscle.rotation.x = 0.08;
    p2Body.add(pelvis, torsoMuscle);

    // `magmaCore`: authored for scale (0.92, 1.32, 0.78) so sync() corePulse fits snugly inside obsidian ribs!
    const magmaCore = new THREE.Group();
    magmaCore.position.set(0, 3.82, 0.24);
    magmaCore.scale.set(0.92, 1.32, 0.78);
    const furnaceHeart = mesh(THREE, g.dodeca, m.balrogMagmaVein, 0.68, 0.70, 0.64);
    furnaceHeart.userData.noFlash = true;
    magmaCore.add(furnaceHeart);
    p2Body.add(magmaCore);

    // Split Obsidian Pectorals, Ribcage Slabs & Deltoid Magma Horns framing the molten furnace!
    for (let s = -1; s <= 1; s += 2) {
      const pec = mesh(THREE, g.sphere, m.balrogMuscle, 0.60, 0.50, 0.48);
      pec.position.set(s * 0.55, 4.22, 0.48);
      pec.rotation.z = -s * 0.20;
      p2Body.add(pec);

      for (let r = 0; r < 3; r++) {
        const rib = mesh(THREE, g.pauldronShell, m.balrogCharcoal, 0.48 - r * 0.04, 0.17, 0.44);
        rib.position.set(s * 0.42, 3.72 - r * 0.28, 0.42 - r * 0.04);
        rib.rotation.set(-0.2, s > 0 ? -0.5 : Math.PI - 0.3, -s * 0.25);
        p2Body.add(rib);
      }

      const shoulderMuscle = mesh(THREE, g.sphere, m.balrogMuscle, 0.64, 0.58, 0.62);
      shoulderMuscle.position.set(s * 1.38, 4.68, 0.14);
      const shoulderHorn = mesh(THREE, g.spikeUp, m.balrogHornMat, 0.17, 0.74, 0.17);
      shoulderHorn.position.set(s * 1.56, 4.98, 0.06);
      shoulderHorn.rotation.set(-0.22, 0, -s * 0.42);
      const shoulderVein = mesh(THREE, g.spikeUp, m.balrogMagmaVein, 0.09, 0.46, 0.09);
      shoulderVein.position.set(s * 1.40, 5.08, 0.14);
      shoulderVein.rotation.z = -s * 0.30;
      shoulderVein.userData.noFlash = true;
      p2Body.add(shoulderMuscle, shoulderHorn, shoulderVein);
    }

    // Fiery Dorsal Flame-Mane cascading along hunched spine!
    const dorsalFlames = [];
    for (let d = 0; d < 7; d++) {
      const fMat = (d % 2 === 0) ? m.balrogFlameBright : m.balrogMagmaVein;
      const maneTongue = mesh(THREE, g.flameTongue, fMat, 1.45, 1.24 - d * 0.10, 1.35);
      maneTongue.position.set((d % 2 === 0 ? 1 : -1) * 0.06, 5.12 - d * 0.40, -0.14 - Math.sin(d * 0.55) * 0.36);
      maneTongue.rotation.x = -0.52 - d * 0.06;
      maneTongue.userData.noFlash = true;
      p2Body.add(maneTongue);
      dorsalFlames.push(maneTongue);
    }

    // Roaring Demon Skull, Swept-Back Curved Ram Horns, Blazing Furnace Maw & Eyes!
    const bHead = new THREE.Group();
    bHead.position.set(0, 5.18, 0.62);

    const skull = mesh(THREE, g.dodeca, m.balrogCharcoal, 0.52, 0.50, 0.58);
    const browRidge = mesh(THREE, g.pauldronShell, m.balrogMuscle, 0.50, 0.25, 0.44);
    browRidge.position.set(0, 0.16, 0.22);
    browRidge.rotation.set(-0.55, -Math.PI * 0.42, 0);
    const snout = mesh(THREE, g.cone8, m.balrogCharcoal, 0.33, 0.54, 0.29);
    snout.rotation.x = HALF_PI + 0.12;
    snout.position.set(0, 0.02, 0.42);
    const furnaceMaw = mesh(THREE, g.sphereLow, m.balrogFlameBright, 0.23, 0.19, 0.29);
    furnaceMaw.position.set(0, -0.10, 0.38);
    furnaceMaw.userData.noFlash = true;
    const crownMane = mesh(THREE, g.flameTongue, m.balrogFlameBright, 2.05, 1.62, 1.80);
    crownMane.position.set(0, 0.34, -0.18);
    crownMane.rotation.x = -0.40;
    crownMane.userData.noFlash = true;
    bHead.add(skull, browRidge, snout, furnaceMaw, crownMane);
    dorsalFlames.push(crownMane);

    // Swept-back Corrugated Curved Ram/Demon Horns!
    const ramHornL = mesh(THREE, g.balrogHornL, m.balrogHornMat, 1.34, 1.34, 1.34);
    ramHornL.position.set(0.32, 0.24, -0.02);
    const ramHornR = mesh(THREE, g.balrogHornR, m.balrogHornMat, 1.34, 1.34, 1.34);
    ramHornR.position.set(-0.32, 0.24, -0.02);
    bHead.add(ramHornL, ramHornR);

    for (let s = -1; s <= 1; s += 2) {
      const eye = mesh(THREE, g.sphereLow, m.eyeFurnace, 0.085, 0.055, 0.065);
      eye.position.set(s * 0.20, 0.10, 0.48);
      eye.userData.noFlash = true;
      const upperFang = mesh(THREE, g.spikeUp, m.balrogFlameBright, 0.045, -0.20, 0.045);
      upperFang.position.set(s * 0.16, -0.06, 0.58);
      upperFang.userData.noFlash = true;
      bHead.add(eye, upperFang);
    }

    const bJaw = new THREE.Group();
    bJaw.position.set(0, -0.18, 0.12);
    bJaw.rotation.x = 0.36; // wide roaring demon jaw!
    const jawBone = mesh(THREE, g.dodeca, m.balrogCharcoal, 0.30, 0.16, 0.42);
    jawBone.position.set(0, -0.06, 0.26);
    const chinBeard = mesh(THREE, g.spikeUp, m.balrogHornMat, 0.11, -0.28, 0.12);
    chinBeard.position.set(0, -0.14, 0.48);
    chinBeard.rotation.x = -0.35;
    bJaw.add(jawBone, chinBeard);
    for (let s = -1; s <= 1; s += 2) {
      const lowerTusk = mesh(THREE, g.spikeUp, m.balrogFlameBright, 0.048, 0.22, 0.048);
      lowerTusk.position.set(s * 0.15, 0.02, 0.46);
      lowerTusk.userData.noFlash = true;
      bJaw.add(lowerTusk);
    }
    bHead.add(bJaw);
    p2Body.add(bHead);

    // Towering Upright Arched Demon Bat-Wings in X-Y Plane facing +Z (~9.6u world wingspan!)
    const buildBalrogWing = (side) => {
      const isLeft = side > 0;
      const innerPivot = new THREE.Group();
      innerPivot.position.set(side * 0.55, 4.65, -0.28);
      innerPivot.rotation.set(0.05, -side * 0.14, side * 0.04); // upright spread silhouette facing +Z!

      const armBone = mesh(THREE, isLeft ? g.bwArmL : g.bwArmR, m.balrogMuscle, 1, 1, 1);
      const innerMem = mesh(THREE, isLeft ? g.bwInnerWebL : g.bwInnerWebR, m.balrogWingMem, 1, 1, 1);
      innerPivot.add(armBone, innerMem);

      const outerPivot = new THREE.Group();
      outerPivot.position.set(side * 1.80, 1.88, -0.05);
      outerPivot.rotation.set(0, side * 0.06, 0);

      const outerMem = mesh(THREE, isLeft ? g.bwOuterWebL : g.bwOuterWebR, m.balrogWingMem, 1, 1, 1);
      outerPivot.add(outerMem);

      const fArr = isLeft ? g.bwFingersL : g.bwFingersR;
      for (let f = 0; f < fArr.length; f++) {
        const fingerMat = (f <= 1) ? m.balrogMuscle : m.balrogMagmaVein;
        const fMesh = mesh(THREE, fArr[f], fingerMat, 1, 1, 1);
        if (f > 1) fMesh.userData.noFlash = true;
        outerPivot.add(fMesh);
      }

      const wristClaw = mesh(THREE, g.spikeUp, m.balrogFlameBright, 0.13, 0.64, 0.13);
      wristClaw.rotation.set(0.18, 0, -side * 0.35);
      wristClaw.position.set(0, 0.06, 0.04);
      wristClaw.userData.noFlash = true;
      outerPivot.add(wristClaw);

      innerPivot.add(outerPivot);
      p2Body.add(innerPivot);
      return { innerPivot, outerPivot };
    };

    const bWingL = buildBalrogWing(1);
    const bWingR = buildBalrogWing(-1);

    // Right Hand (-X, `bArmR`): Blazing Jagged Flaming Greatsword!
    const bArmR = new THREE.Group();
    bArmR.position.set(-1.44, 4.46, 0.16);
    bArmR.rotation.x = -0.28;
    const bUpR = mesh(THREE, g.sculptedLimb, m.balrogMuscle, 0.34, 0.96, 0.36);
    const bForeR = mesh(THREE, g.muscleForearm, m.balrogMuscle, 0.33, 0.92, 0.35);
    bForeR.position.set(0, -0.88, 0.04);
    bForeR.rotation.x = -0.46;
    const bFistR = mesh(THREE, g.dodeca, m.balrogCharcoal, 0.26, 0.24, 0.26);
    bFistR.position.set(0, -1.66, 0.42);
    bArmR.add(bUpR, bForeR, bFistR);

    const flameSwordGrp = new THREE.Group();
    flameSwordGrp.position.set(0, -1.64, 0.44);
    flameSwordGrp.rotation.x = 1.08;
    const fsGrip = mesh(THREE, g.cyl8, m.balrogCharcoal, 0.08, 0.68, 0.08);
    const fsGuard = mesh(THREE, g.morgulGuard, m.balrogCharcoal, 2.25, 1.95, 1.85);
    fsGuard.position.y = 0.32;
    const fsSpine = mesh(THREE, g.morgulBlade, m.balrogCharcoal, 1.65, 2.85, 1.45);
    fsSpine.position.y = 0.34;
    const fsBlade = mesh(THREE, g.balrogFlameSword, m.balrogFlameBright, 1.48, 3.25, 1.25);
    fsBlade.position.y = 0.32;
    fsBlade.userData.noFlash = true;
    flameSwordGrp.add(fsGrip, fsGuard, fsSpine, fsBlade);
    bArmR.add(flameSwordGrp);

    // Left Hand (+X, `bArmL`): Animated Coiling Multi-Thonged Fiery Whip (`whipPivot`)!
    const bArmL = new THREE.Group();
    bArmL.position.set(1.44, 4.46, 0.16);
    bArmL.rotation.set(-0.24, -0.14, 0.10);
    const bUpL = mesh(THREE, g.sculptedLimb, m.balrogMuscle, 0.32, 0.94, 0.34);
    const bForeL = mesh(THREE, g.muscleForearm, m.balrogMuscle, 0.31, 0.90, 0.33);
    bForeL.position.set(0, -0.86, 0.04);
    bForeL.rotation.x = -0.48;
    const bFistL = mesh(THREE, g.dodeca, m.balrogCharcoal, 0.25, 0.23, 0.25);
    bFistL.position.set(0, -1.62, 0.42);
    bArmL.add(bUpL, bForeL, bFistL);

    const whipPivot = new THREE.Group();
    whipPivot.position.set(0, -1.60, 0.44);
    whipPivot.rotation.x = 0.22;
    const whipHandle = mesh(THREE, g.cyl8, m.balrogCharcoal, 0.075, 0.56, 0.075);
    whipHandle.rotation.x = HALF_PI * 0.7;
    const whipLashMain = mesh(THREE, g.balrogWhipMain, m.balrogFlameBright, 1.0, 1.0, 1.0);
    whipLashMain.userData.noFlash = true;
    const whipThongA = mesh(THREE, g.balrogWhipThongA, m.balrogMagmaVein, 1.0, 1.0, 1.0);
    whipThongA.userData.noFlash = true;
    const whipThongB = mesh(THREE, g.balrogWhipThongB, m.balrogMagmaVein, 1.0, 1.0, 1.0);
    whipThongB.userData.noFlash = true;
    whipPivot.add(whipHandle, whipLashMain, whipThongA, whipThongB);
    bArmL.add(whipPivot);

    p2Body.add(bArmR, bArmL);

    const p2FireRing = mesh(THREE, g.ring, m.balrogFireRing, 1.95, 1.95, 1);
    p2FireRing.rotation.x = -HALF_PI;
    p2FireRing.position.y = 0.08;
    p2FireRing.userData.noShadow = true;
    p2FireRing.userData.noFlash = true;
    p2FireRing.userData.skipStudioBounds = true;
    phase2Group.add(p2FireRing);

    const rig = finalizeRig(root, {
      type: 'balrog',
      variantKey: variantKey || 'balrog',
      baseP2Scale: 1.32,
      phase1Group,
      p1Body,
      p1ArmL,
      p1ArmR,
      flailChainPivot,
      p1Aura,
      phase2Group,
      p2Body,
      bHead,
      bJaw,
      bLegL,
      bLegR,
      bTail,
      bArmR,
      bArmL,
      whipPivot,
      whipLashMain,
      whipThongA,
      whipThongB,
      bWingL,
      bWingR,
      magmaCore,
      dorsalFlames,
      p2FireRing,
      height3D: 6.85
    });

    rig.setPhase = function(phaseNum) {
      const isP2 = phaseNum === 2;
      phase1Group.visible = !isP2;
      phase1Group.scale.setScalar(isP2 ? 0.0001 : 1.30);
      phase2Group.visible = isP2;
      phase2Group.scale.setScalar(isP2 ? 1.32 : 0.0001);
      rig.height3D = isP2 ? 9.35 : 6.85;
    };

    rig.poseStudio = function(studioOpts) {
      const showP2 = !studioOpts || studioOpts.phase !== 1;
      rig.setPhase(showP2 ? 2 : 1);
      if (showP2) {
        bWingL.innerPivot.rotation.set(0.05, -0.14, 0.04);
        bWingL.outerPivot.rotation.set(0, 0.06, 0);
        bWingR.innerPivot.rotation.set(0.05, 0.14, -0.04);
        bWingR.outerPivot.rotation.set(0, -0.06, 0);
      }
    };

    // Configure initial phase if requested via typeKey ('balrog_p2') or opts.phase!
    const reqPhase = (variantKey === 'balrog_p2')
      ? 2
      : ((variantKey === 'balrog_p1') ? 1 : (opts && opts.phase ? opts.phase : null));
    if (reqPhase === 2) {
      rig.setPhase(2);
    } else if (reqPhase === 1) {
      rig.setPhase(1);
    }

    return rig;
  }

  // ============================================================================
  // 5. FULL 60 FPS ARTICULATED ANIMATION DRIVER (`updateEnemyRig`)
  // ============================================================================
  function updateEnemyRig(rig, e, dt, time, context) {
    if (!rig || !e) return false;
    const bank = rig._bank || resolveBankAndOpts(context && context.cache ? context.cache : null).bank;
    const ringActive = Boolean(context && context.ringActive);

    const walk = e.walkPhase || 0;
    const atkRatio = clamp((e.attackAnimTimer || 0) / 0.28, 0, 1);
    const atkPulse = Math.sin(atkRatio * Math.PI);
    const stunned = (e.stunTimer || 0) > 0;
    const now = typeof time === 'number' ? time : 0;

    switch (rig.type) {
      case 'goblin': {
        const scurry = stunned ? 0 : Math.sin(walk * 1.55) * 0.72;
        rig.legL.rotation.x = scurry;
        rig.legR.rotation.x = -scurry;
        rig.armL.rotation.x = -0.28 - scurry * 0.55;
        rig.armR.rotation.x = -0.24 + scurry * 0.55 - atkPulse * 1.25;
        rig.bodyRoot.position.y = stunned ? 0 : Math.abs(Math.sin(walk * 1.55)) * 0.10;
        if (rig.headGroup) {
          rig.headGroup.rotation.y = Math.sin(now * 6.5 + (e.animSeed || 0)) * 0.14;
        }
        break;
      }

      case 'orc': {
        const march = stunned ? 0 : Math.sin(walk) * 0.56;
        const cleave = meleeArmPitch(e.attackAnimTimer, 0.28);
        rig.legL.rotation.x = march;
        rig.legR.rotation.x = -march;
        rig.armL.rotation.x = -0.22 - march * 0.30;
        rig.armR.rotation.x = cleave !== 0 ? cleave * 0.80 : (-0.22 + march * 0.42);
        rig.bodyRoot.position.y = stunned ? 0 : Math.abs(Math.sin(walk)) * 0.085;
        break;
      }

      case 'uruk': {
        const rate = e.enraged ? 1.38 : 1.0;
        const stride = stunned ? 0 : Math.sin(walk * rate) * 0.62;
        const cleave = meleeArmPitch(e.attackAnimTimer, 0.28);
        rig.legL.rotation.x = stride;
        rig.legR.rotation.x = -stride;
        rig.armL.rotation.x = cleave !== 0 ? cleave * 0.72 : (-0.30 + stride * 0.32);
        rig.armR.rotation.x = cleave !== 0 ? cleave * 0.92 : (-0.32 - stride * 0.32);
        rig.bodyRoot.position.y = stunned ? 0 : Math.abs(Math.sin(walk * rate)) * 0.10;

        const enraged = Boolean(e.enraged);
        if (rig.enragedApplied !== enraged) {
          rig.enragedApplied = enraged;
          const targetMat = enraged ? bank.mats.urukEnragedArmor : bank.mats.ironForged;
          for (let k = 0; k < rig.armorMeshes.length; k++) {
            rig.armorMeshes[k].userData.baseMat = targetMat;
            if (!rig._flashed) rig.armorMeshes[k].material = targetMat;
          }
          if (rig.rageVeins) {
            for (let v = 0; v < rig.rageVeins.length; v++) {
              rig.rageVeins[v].visible = enraged;
              rig.rageVeins[v].scale.set(
                enraged ? 0.24 : 0.0001,
                enraged ? 0.30 : 0.0001,
                enraged ? 1.2 : 0.0001
              );
            }
          }
        }
        rig.rageAura.visible = enraged;
        if (enraged) {
          rig.rageAura.rotation.y = now * 4.2;
          const rs = 1.0 + 0.12 * Math.sin(now * 12);
          rig.rageAura.scale.set(rs, rs, rs);
        } else {
          rig.rageAura.scale.setScalar(0.0001);
        }
        break;
      }

      case 'warg': {
        let jumpY = 0;
        let jumpPitch = 0;
        if ((e.leapTimer || 0) > 0) {
          const dur = e.leapDuration || 0.48;
          const u = clamp(1 - e.leapTimer / dur, 0, 1);
          jumpY = Math.sin(u * Math.PI) * 3.45;
          jumpPitch = -Math.cos(u * Math.PI) * 0.52;
        }

        const gallop = walk * 1.25;
        if (jumpY > 0.05) {
          rig.wargLegs[0].rotation.x = -0.82;
          rig.wargLegs[1].rotation.x = -0.70;
          rig.wargLegs[2].rotation.x = 0.82;
          rig.wargLegs[3].rotation.x = 0.72;
          rig.jawPivot.rotation.x = 0.46;
        } else {
          const amp = stunned ? 0 : 0.64;
          rig.wargLegs[0].rotation.x = Math.sin(gallop) * amp;
          rig.wargLegs[1].rotation.x = Math.sin(gallop + 0.6) * amp;
          rig.wargLegs[2].rotation.x = Math.sin(gallop + Math.PI) * amp;
          rig.wargLegs[3].rotation.x = Math.sin(gallop + Math.PI + 0.6) * amp;
          rig.jawPivot.rotation.x = 0.18 + atkPulse * 0.36 + Math.abs(Math.sin(now * 5 + (e.id || 0))) * 0.12;
        }

        rig.jumpGroup.position.y = jumpY + (stunned || jumpY > 0 ? 0 : Math.abs(Math.sin(gallop)) * 0.13);
        rig.jumpGroup.rotation.x = jumpPitch + (jumpY > 0 ? 0 : Math.cos(gallop) * 0.065);
        rig.tailPivot.rotation.y = Math.sin(now * 7 + (e.id || 0)) * 0.28;
        rig.spearPivot.position.z = 0.08 + atkPulse * 0.55;
        break;
      }

      case 'troll': {
        const stomp = stunned ? 0 : Math.sin(walk * 0.72);
        rig.legL.rotation.x = stomp * 0.46;
        rig.legR.rotation.x = -stomp * 0.46;
        rig.bodyRoot.position.y = Math.abs(stomp) * 0.14;
        rig.bodyRoot.rotation.z = stomp * 0.06;

        if (atkRatio > 0) {
          const smash = meleeArmPitch(e.attackAnimTimer, 0.28);
          rig.armR.rotation.x = smash;
          rig.armL.rotation.x = smash * 0.58;
          rig.bodyRoot.rotation.x = 0.08 + atkPulse * 0.22;
          if (rig.jawPivot) rig.jawPivot.rotation.x = 0.22 + atkPulse * 0.35;
        } else {
          rig.armR.rotation.x = -0.30 - stomp * 0.22;
          rig.armL.rotation.x = -0.24 + stomp * 0.25;
          rig.bodyRoot.rotation.x = 0.08;
          if (rig.jawPivot) rig.jawPivot.rotation.x = 0.18 + Math.abs(Math.sin(now * 2.4 + (e.id || 0))) * 0.12;
        }

        const regenerating = e.hp < e.maxHp * 0.99 && (e.fireSuppressTimer || 0) <= 0;
        rig.regenRing.visible = regenerating;
        if (regenerating) {
          rig.regenRing.rotation.z = now * 1.2;
        }
        break;
      }

      case 'wraith': {
        const hover = 0.30 + Math.sin(now * 3.4 + (e.animSeed || 0)) * 0.15;
        rig.floatGroup.position.y = hover;
        rig.floatGroup.rotation.z = Math.sin(now * 2.2 + (e.animSeed || 0)) * 0.07;
        rig.swordPivot.rotation.x = -0.18 - atkPulse * 0.95;

        for (let r = 0; r < rig.ribbons.length; r++) {
          rig.ribbons[r].rotation.x = 0.40 + Math.sin(now * 5.2 + r * 1.2) * 0.20;
        }

        const revealed = ringActive || (e.revealedTimer || 0) > 0;
        const desiredState = (e.dodgeFlashTimer || 0) > 0 ? 2 : (revealed ? 1 : 0);
        if (rig.shroudState !== desiredState) {
          rig.shroudState = desiredState;
          const targetMat = desiredState === 2
            ? bank.mats.wraithDodge
            : (desiredState === 1 ? bank.mats.wraithRevealed : bank.mats.wraithStealth);
          for (let s = 0; s < rig.shroudMeshes.length; s++) {
            rig.shroudMeshes[s].userData.baseMat = targetMat;
            if (!rig._flashed) rig.shroudMeshes[s].material = targetMat;
          }
        }

        rig.revealGroup.visible = revealed;
        if (revealed) {
          rig.revRing.rotation.z = now * 2.2;
          rig.revEye.rotation.y = now * 3.0;
          rig.revEye.position.y = 2.45 + hover * 0.5;
        }
        break;
      }

      case 'fellbeast': {
        const flapSpeed = stunned ? 1.6 : 5.2;
        const flap = Math.sin(now * flapSpeed + (e.animSeed || 0));
        const flyBob = 6.5 + flap * -0.28;
        rig.flyer.position.y = flyBob;
        rig.flyer.rotation.z = Math.sin(now * 1.9 + (e.animSeed || 0)) * 0.12;

        const innerAng = 0.24 + flap * 0.52;
        const outerAng = Math.sin(now * flapSpeed - 0.72 + (e.animSeed || 0)) * 0.42;
        const wingPitch = 0.26 + flap * 0.14;
        rig.wingL.innerPivot.rotation.x = wingPitch;
        rig.wingL.innerPivot.rotation.z = innerAng;
        rig.wingL.outerPivot.rotation.z = outerAng;
        rig.wingR.innerPivot.rotation.x = wingPitch;
        rig.wingR.innerPivot.rotation.z = -innerAng;
        rig.wingR.outerPivot.rotation.z = -outerAng;

        if (rig.jawPivot) {
          rig.jawPivot.rotation.x = 0.18 + Math.abs(Math.sin(now * 3.6 + (e.animSeed || 0))) * 0.24;
        }
        rig.tailGroup.rotation.y = Math.sin(now * 4.2 + (e.animSeed || 0)) * 0.22;
        const shadowScale = 1.35 + flap * 0.22;
        rig.groundShadow.scale.set(shadowScale, shadowScale, 1);
        break;
      }

      case 'ringwraith': {
        const glide = Math.sin(walk * 0.8 + now * 2.0) * 0.08;
        rig.bodyRoot.position.y = 0.06 + Math.abs(glide);
        rig.swordArm.rotation.x = -0.24 - atkPulse * 1.15;
        rig.leftArm.rotation.x = -0.32 + Math.sin(now * 2.5) * 0.12;
        rig.ring1.rotation.z = now * 1.5;
        rig.ring2.rotation.y = -now * 1.8;
        const breathSoon = (e.blackBreathTimer || 8) < 1.2 ? 1.22 : 1.0;
        rig.breathAura.scale.setScalar(breathSoon + 0.05 * Math.sin(now * 6));
        break;
      }

      case 'balrog': {
        const isPhase2 = (e.phase === 2) || Boolean(e.phase2Triggered);
        rig.phase1Group.visible = !isPhase2;
        rig.phase2Group.visible = isPhase2;

        if (!isPhase2) {
          rig.phase1Group.scale.setScalar(1.30);
          rig.phase2Group.scale.setScalar(0.0001);
          const stride = stunned ? 0 : Math.sin(walk * 0.65);
          rig.p1Body.position.y = Math.abs(stride) * 0.11;
          rig.p1ArmL.rotation.x = -0.22 - stride * 0.18;
          rig.p1ArmR.rotation.x = -0.34 - atkPulse * 1.28;
          rig.flailChainPivot.rotation.z = Math.sin(now * 5.0) * 0.44;
          rig.flailChainPivot.rotation.x = 0.34 + Math.cos(now * 5.0) * 0.30 + atkPulse * 0.80;
          rig.p1Aura.rotation.z = now * 1.4;
          rig.height3D = 6.85;
        } else {
          rig.phase1Group.scale.setScalar(0.0001);
          rig.height3D = 9.35;
          const tTrans = clamp((e.transformTimer || 0) / 0.85, 0, 1);
          const eruptScale = (tTrans > 0 ? lerp(1.0, 0.58, tTrans) : 1.0) * 1.32;
          rig.phase2Group.scale.setScalar(eruptScale);

          const stomp = stunned ? 0 : Math.sin(walk * 0.70);
          rig.bLegL.rotation.x = stomp * 0.44;
          rig.bLegR.rotation.x = -stomp * 0.44;
          rig.p2Body.position.y = Math.abs(stomp) * 0.16;
          rig.p2Body.rotation.z = stomp * 0.05;

          // Slow, menacing, awe-inspiring upright X-Y Balrog bat-wing beats!
          const wFlap = Math.sin(now * 2.5);
          const wLag = Math.sin(now * 2.5 - 0.65);
          rig.bWingL.innerPivot.rotation.x = 0.06 + wFlap * 0.10;
          rig.bWingL.innerPivot.rotation.y = -0.14 + wFlap * 0.36;
          rig.bWingL.innerPivot.rotation.z = 0.04 + wFlap * 0.16;
          rig.bWingL.outerPivot.rotation.y = 0.06 + wLag * 0.28;
          rig.bWingL.outerPivot.rotation.z = wLag * 0.12;

          rig.bWingR.innerPivot.rotation.x = 0.06 + wFlap * 0.10;
          rig.bWingR.innerPivot.rotation.y = 0.14 - wFlap * 0.36;
          rig.bWingR.innerPivot.rotation.z = -0.04 - wFlap * 0.16;
          rig.bWingR.outerPivot.rotation.y = -0.06 - wLag * 0.28;
          rig.bWingR.outerPivot.rotation.z = -wLag * 0.12;

          // Flaming Greatsword cleave & Dynamic Coiling Multi-Thonged Fiery Whip!
          rig.bArmR.rotation.x = -0.28 - atkPulse * 1.35;
          rig.bArmL.rotation.x = -0.24 - Math.sin(now * 3.4) * 0.22;
          rig.whipPivot.rotation.y = Math.sin(now * 4.8) * 0.44;
          rig.whipPivot.rotation.x = 0.22 + Math.cos(now * 4.1) * 0.22 - atkPulse * 0.60;
          if (rig.whipThongA) rig.whipThongA.rotation.z = Math.sin(now * 6.5) * 0.16;
          if (rig.whipThongB) rig.whipThongB.rotation.y = Math.cos(now * 5.8) * 0.18;
          if (rig.bTail) rig.bTail.rotation.y = Math.sin(now * 2.8) * 0.18;
          if (rig.bJaw) rig.bJaw.rotation.x = 0.28 + atkPulse * 0.25 + Math.abs(Math.sin(now * 3.5)) * 0.12;

          const corePulse = 1.0 + 0.08 * Math.sin(now * 9.0);
          rig.magmaCore.scale.set(0.92 * corePulse, 1.32 * corePulse, 0.78 * corePulse);
          if (rig.dorsalFlames) {
            for (let d = 0; d < rig.dorsalFlames.length; d++) {
              const fl = 0.90 + 0.16 * Math.sin(now * 13 + d * 1.7);
              rig.dorsalFlames[d].scale.y = (d === rig.dorsalFlames.length - 1 ? 1.62 : (1.24 - d * 0.10)) * fl;
            }
          }
          rig.p2FireRing.rotation.z = -now * 1.6;
        }
        break;
      }
    }
    return true;
  }

  // ============================================================================
  // 6. PUBLIC FACTORY & STANDALONE PORTRAIT HELPERS
  // ============================================================================
  function normalizeEnemyKey(rawKey, opts) {
    const k = String(rawKey || 'orc').toLowerCase().replace(/[\s-]+/g, '_');
    if (k === 'witchlord' || k === 'witch_lord' || k === 'balrog_p1' || k === 'balrog_1' || k === 'balrog1' || k === 'balrog_phase1') {
      return { baseType: 'balrog', variantKey: 'balrog_p1', phase: 1 };
    }
    if (k === 'balrog_udun' || k === 'balrog_p2' || k === 'balrog_2' || k === 'balrog2' || k === 'balrog_phase2') {
      return { baseType: 'balrog', variantKey: 'balrog_p2', phase: 2 };
    }
    if (k === 'balrog') {
      const p = opts && (opts.phase === 1 || opts.phase === 2) ? opts.phase : null;
      return {
        baseType: 'balrog',
        variantKey: p === 2 ? 'balrog_p2' : (p === 1 ? 'balrog_p1' : 'balrog'),
        phase: p
      };
    }
    return { baseType: k, variantKey: k, phase: 1 };
  }

  function createEnemyRig(typeKey, shared, maybeOpts) {
    const resolved = resolveBankAndOpts(shared, maybeOpts);
    const bank = resolved.bank;
    const opts = resolved.opts;
    const spec = normalizeEnemyKey(typeKey, opts);

    let rig;
    switch (spec.baseType) {
      case 'goblin':     rig = buildGoblinRig(bank); break;
      case 'orc':        rig = buildOrcRig(bank); break;
      case 'uruk':       rig = buildUrukRig(bank); break;
      case 'warg':       rig = buildWargRig(bank); break;
      case 'troll':      rig = buildTrollRig(bank); break;
      case 'wraith':     rig = buildWraithRig(bank); break;
      case 'fellbeast':  rig = buildFellBeastRig(bank, opts); break;
      case 'ringwraith': rig = buildRingwraithRig(bank); break;
      case 'balrog':     rig = buildBalrogBossRig(bank, spec.variantKey, {
        ...opts,
        phase: spec.phase !== null ? spec.phase : opts.phase
      }); break;
      default:           rig = buildOrcRig(bank); break;
    }
    rig._bank = bank;
    if (rig.group && rig.group.userData) {
      rig.group.userData.rig = rig;
    }
    return rig;
  }

  function createStandaloneEnemyMesh(typeKey, opts, shared) {
    const o = Object.assign({ portrait: true }, opts || {});
    if (String(typeKey || '').toLowerCase() === 'balrog' && o.phase === undefined) {
      o.phase = 2;
    }
    const rig = createEnemyRig(typeKey, shared || o, o);
    if (rig.type === 'uruk' && o.enraged) {
      updateEnemyRig(rig, { enraged: true, walkPhase: 0.4, attackAnimTimer: 0 }, 0.016, 0.5, { cache: shared });
    }
    return rig.group;
  }

  function dispose() {
    if (defaultBank) {
      defaultBank.dispose();
      defaultBank = null;
    }
  }

  TD.EnemyModels3D = {
    ENEMY_VARIANTS,
    createEnemyRig,
    createStandaloneEnemyMesh,
    updateEnemyRig,
    animateEnemyRig: updateEnemyRig,
    getAssetBank: function(shared) {
      return resolveBankAndOpts(shared).bank;
    },
    dispose
  };
})(window.TD = window.TD || {});
