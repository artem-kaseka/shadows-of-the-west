(function(TD) {
  'use strict';

  const TWO_PI = Math.PI * 2;
  const HALF_PI = Math.PI * 0.5;
  const WORLD_SCALE = 0.1;
  const HALF_GAME_W = 640;
  const HALF_GAME_H = 360;

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpAngle(a, b, t) {
    let diff = (b - a) % TWO_PI;
    if (diff > Math.PI) diff -= TWO_PI;
    if (diff < -Math.PI) diff += TWO_PI;
    return a + diff * clamp(t, 0, 1);
  }

  function gxToWx(gx) {
    return (gx - HALF_GAME_W) * WORLD_SCALE;
  }

  function gyToWz(gy) {
    return (gy - HALF_GAME_H) * WORLD_SCALE;
  }

  // Forward axis for all 3D models is local +Z:
  // angle2D = 0 (+gx -> +X) => yaw = +PI/2 (rotates +Z to +X)
  // angle2D = +PI/2 (+gy -> +Z) => yaw = 0 (keeps +Z at +Z)
  function yawFromAngle2D(angle2D) {
    return HALF_PI - (angle2D || 0);
  }

  // Visceral 3-stage melee cleave curve (windup overhead -> fast forward slam -> recovery)
  function meleeArmPitch(atkTimer, duration) {
    if (!(atkTimer > 0)) return 0;
    const u = clamp(1 - atkTimer / (duration || 0.28), 0, 1);
    if (u < 0.30) {
      return lerp(0, -2.15, u / 0.30);
    }
    if (u < 0.65) {
      return lerp(-2.15, -0.52, (u - 0.30) / 0.35);
    }
    return lerp(-0.52, 0, (u - 0.65) / 0.35);
  }

  function hash2(x, y, seed) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // ============================================================================
  // 1. SHARED PROCEDURAL TEXTURE, GEOMETRY & MATERIAL CACHE
  //    Passed as `shared` context to TD.TowerModels3D & TD.EnemyModels3D
  // ============================================================================
  class ModelAssetCache {
    constructor(THREE) {
      this.THREE = THREE;
      this.geometries = [];
      this.materials = [];
      this.textures = [];

      this.tex = {};
      this.mats = {};
      this.geos = {};
      this.procedural = (TD && TD.ProceduralTextures) ? TD.ProceduralTextures : null;

      this._towerProvider = null;
      this._enemyProvider = null;

      this._buildTextures();
      this._buildMaterials();
      this._buildGeometries();
    }

    regGeo(g) {
      if (g) this.geometries.push(g);
      return g;
    }

    regMat(m) {
      if (m) this.materials.push(m);
      return m;
    }

    regTex(t) {
      if (t) this.textures.push(t);
      return t;
    }

    makeMesh(geo, mat, sx, sy, sz) {
      return makeMesh(this.THREE, geo, mat, sx, sy, sz);
    }

    _makeCanvas(w, h) {
      if (typeof document === 'undefined') return null;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }

    _canvasToTexture(canvas, repeatX, repeatY, isSRGB) {
      const THREE = this.THREE;
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
      return this.regTex(tex);
    }

    _buildTextures() {
      // 1. Weathered Ashlar Stone Masonry
      const stoneC = this._makeCanvas(128, 128);
      if (stoneC) {
        const ctx = stoneC.getContext('2d');
        ctx.fillStyle = '#8d9094';
        ctx.fillRect(0, 0, 128, 128);
        const rows = 8;
        const rowH = 128 / rows;
        for (let r = 0; r < rows; r++) {
          const y = r * rowH;
          const cols = (r % 2 === 0) ? 4 : 5;
          const off = (r % 2) * 14;
          const colW = 128 / cols;
          for (let c = -1; c <= cols; c++) {
            const x = c * colW + off;
            const n = hash2(c + 11, r + 7, 101);
            const v = Math.round(126 + n * 42);
            ctx.fillStyle = `rgb(${v},${v - 2},${v - 5})`;
            ctx.fillRect(x + 1, y + 1, colW - 2, rowH - 2);
          }
          ctx.fillStyle = '#4c4f54';
          ctx.fillRect(0, y, 128, 1.5);
        }
        for (let i = 0; i < 420; i++) {
          const px = Math.floor(hash2(i, 3, 211) * 128);
          const py = Math.floor(hash2(i, 9, 211) * 128);
          const dark = hash2(i, 15, 211) > 0.5;
          ctx.fillStyle = dark ? 'rgba(35,38,42,0.22)' : 'rgba(235,238,242,0.16)';
          ctx.fillRect(px, py, 2, 2);
        }
        this.tex.stone = this._canvasToTexture(stoneC, 2, 2, true);
        this.tex.stoneBump = this._canvasToTexture(stoneC, 2, 2, false);
      }

      // 2. Mallorn Fluted Bronze-Gold Wood Grain
      const woodC = this._makeCanvas(128, 128);
      if (woodC) {
        const ctx = woodC.getContext('2d');
        ctx.fillStyle = '#b9934c';
        ctx.fillRect(0, 0, 128, 128);
        for (let x = 0; x < 128; x += 2) {
          const wave = Math.sin(x * 0.24) * 0.5 + 0.5;
          const n = hash2(x, 4, 307);
          const r = Math.round(162 + wave * 38 + n * 18);
          const g = Math.round(126 + wave * 32 + n * 14);
          const b = Math.round(64 + wave * 20 + n * 10);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, 0, 2, 128);
        }
        this.tex.mallorn = this._canvasToTexture(woodC, 1, 3, true);
      }

      // 3. Olog-hai Craggy Stone Hide
      const trollC = this._makeCanvas(128, 128);
      if (trollC) {
        const ctx = trollC.getContext('2d');
        ctx.fillStyle = '#949088';
        ctx.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 360; i++) {
          const x = hash2(i, 1, 509) * 128;
          const y = hash2(i, 2, 509) * 128;
          const rad = 2 + hash2(i, 3, 509) * 6;
          const shade = Math.round(116 + hash2(i, 4, 509) * 60);
          ctx.fillStyle = `rgba(${shade},${shade - 2},${shade - 5},0.48)`;
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, TWO_PI);
          ctx.fill();
        }
        this.tex.trollHide = this._canvasToTexture(trollC, 1, 1, true);
        this.tex.trollBump = this._canvasToTexture(trollC, 1, 1, false);
      }

      // 4. Gondor White Tree Royal Blue Banner
      const gonC = this._makeCanvas(128, 256);
      if (gonC) {
        const ctx = gonC.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, '#183461');
        grad.addColorStop(0.6, '#13284c');
        grad.addColorStop(1, '#0d1c36');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 256);

        ctx.strokeStyle = '#d4dee8';
        ctx.lineWidth = 6;
        ctx.strokeRect(8, 8, 112, 240);

        ctx.strokeStyle = '#eef5fc';
        ctx.lineCap = 'round';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(64, 196);
        ctx.lineTo(64, 112);
        ctx.stroke();

        ctx.lineWidth = 3.5;
        for (let s = -1; s <= 1; s += 2) {
          ctx.beginPath();
          ctx.moveTo(64, 192);
          ctx.quadraticCurveTo(64 + s * 14, 206, 64 + s * 28, 212);
          ctx.stroke();
        }

        const boughs = [
          [64, 146, 32, 122], [64, 146, 96, 122],
          [64, 130, 26, 96],  [64, 130, 102, 96],
          [64, 116, 42, 82],  [64, 116, 86, 82],
          [64, 112, 64, 74]
        ];
        ctx.lineWidth = 3.6;
        for (let i = 0; i < boughs.length; i++) {
          const b = boughs[i];
          ctx.beginPath();
          ctx.moveTo(b[0], b[1]);
          ctx.quadraticCurveTo((b[0] + b[2]) * 0.5, b[3] + 16, b[2], b[3]);
          ctx.stroke();
        }

        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 7; i++) {
          const ang = Math.PI + (i / 6) * Math.PI;
          const sx = 64 + Math.cos(ang) * 38;
          const sy = 76 + Math.sin(ang) * 28;
          ctx.beginPath();
          ctx.arc(sx, sy, 3.3, 0, TWO_PI);
          ctx.fill();
        }

        const bTex = this._canvasToTexture(gonC, 1, 1, true);
        if (bTex) {
          bTex.wrapS = this.THREE.ClampToEdgeWrapping;
          bTex.wrapT = this.THREE.ClampToEdgeWrapping;
        }
        this.tex.gondorBanner = bTex;
      }

      // 5. Rohan Golden Sun-Horse Emerald Banner
      const rohC = this._makeCanvas(128, 256);
      if (rohC) {
        const ctx = rohC.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, '#1f5433');
        grad.addColorStop(1, '#12331f');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 256);

        ctx.strokeStyle = '#e5be5c';
        ctx.lineWidth = 6;
        ctx.strokeRect(8, 8, 112, 240);

        ctx.fillStyle = '#f2cf6d';
        ctx.beginPath();
        ctx.arc(64, 118, 28, 0, TWO_PI);
        ctx.fill();
        ctx.fillStyle = '#1a472b';
        ctx.beginPath();
        ctx.arc(64, 118, 21, 0, TWO_PI);
        ctx.fill();
        ctx.fillStyle = '#ffe082';
        ctx.beginPath();
        ctx.ellipse(64, 120, 16, 9, -0.25, 0, TWO_PI);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(74, 115);
        ctx.lineTo(86, 98);
        ctx.lineTo(94, 104);
        ctx.lineTo(80, 121);
        ctx.closePath();
        ctx.fill();

        const rTex = this._canvasToTexture(rohC, 1, 1, true);
        if (rTex) {
          rTex.wrapS = this.THREE.ClampToEdgeWrapping;
          rTex.wrapT = this.THREE.ClampToEdgeWrapping;
        }
        this.tex.rohanBanner = rTex;
      }
    }

    _buildMaterials() {
      const THREE = this.THREE;
      const std = (opts) => this.regMat(new THREE.MeshStandardMaterial(opts));
      const basic = (opts) => this.regMat(new THREE.MeshBasicMaterial(opts));
      const pt = (TD && TD.ProceduralTextures && typeof TD.ProceduralTextures.get === 'function')
        ? TD.ProceduralTextures
        : null;
      const ashlarSet = pt ? pt.get('ashlar', 2, 2) : null;
      const timberSet = pt ? pt.get('timber', 2, 2) : null;
      const ironSet = pt ? pt.get('iron', 2, 2) : null;
      const goldSet = pt ? pt.get('gold', 2, 2) : null;

      // Architecture & Stone
      this.mats.stoneGrey = std({
        color: 0x92969c,
        map: (ashlarSet && ashlarSet.map) || this.tex.stone || null,
        bumpMap: (ashlarSet && ashlarSet.bumpMap) || this.tex.stoneBump || null,
        roughnessMap: (ashlarSet && ashlarSet.roughnessMap) || null,
        bumpScale: 0.10,
        roughness: 0.86,
        metalness: 0.06
      });
      this.mats.stoneDark = std({
        color: 0x525760,
        map: this.tex.stone || null,
        bumpMap: this.tex.stoneBump || null,
        bumpScale: 0.07,
        roughness: 0.88,
        metalness: 0.10
      });
      this.mats.stoneWhite = std({
        color: 0xbec2ca,
        map: (ashlarSet && ashlarSet.map) || this.tex.stone || null,
        bumpMap: (ashlarSet && ashlarSet.bumpMap) || this.tex.stoneBump || null,
        roughnessMap: (ashlarSet && ashlarSet.roughnessMap) || null,
        bumpScale: 0.08,
        roughness: 0.76,
        metalness: 0.06
      });
      this.mats.stoneObsidian = std({
        color: 0x22262e,
        bumpMap: this.tex.stoneBump || null,
        bumpScale: 0.06,
        roughness: 0.38,
        metalness: 0.45
      });
      this.mats.slateRoof = std({ color: 0x2c3442, roughness: 0.65, metalness: 0.22 });
      this.mats.rohanRoof = std({ color: 0x234d32, roughness: 0.75, metalness: 0.12 });

      // Woods & Mallorn Arches
      this.mats.mallornBronze = std({ color: 0xc29b52, map: this.tex.mallorn || null, roughness: 0.44, metalness: 0.42 });
      this.mats.mallornGold = std({ color: 0xd9b86c, map: this.tex.mallorn || null, roughness: 0.36, metalness: 0.56 });
      this.mats.mallornSilver = std({ color: 0xdde5ef, roughness: 0.32, metalness: 0.62 });
      this.mats.timberOak = std({
        color: 0x805a39,
        map: (timberSet && timberSet.map) || null,
        bumpMap: (timberSet && timberSet.bumpMap) || null,
        bumpScale: 0.08,
        roughness: 0.84,
        metalness: 0.06
      });
      this.mats.darkWood = std({ color: 0x422d1d, roughness: 0.88, metalness: 0.05 });
      this.mats.boulderRock = std({
        color: 0x5c534c,
        bumpMap: this.tex.trollBump || null,
        bumpScale: 0.1,
        roughness: 0.9,
        metalness: 0.05,
        emissive: 0x4a1800,
        emissiveIntensity: 0.35
      });

      // Metals & Armor
      this.mats.goldBurnished = std({
        color: 0xe3bd60,
        bumpMap: (goldSet && goldSet.bumpMap) || null,
        roughnessMap: (goldSet && goldSet.roughnessMap) || null,
        bumpScale: 0.05,
        roughness: 0.30,
        metalness: 0.82
      });
      this.mats.goldRadiant = std({ color: 0xe6c365, emissive: 0x6b470c, emissiveIntensity: 0.14, roughness: 0.30, metalness: 0.82 });
      this.mats.bronzeDwarven = std({
        color: 0xa8793e,
        bumpMap: (goldSet && goldSet.bumpMap) || null,
        bumpScale: 0.06,
        roughness: 0.38,
        metalness: 0.78
      });
      this.mats.ironDark = std({
        color: 0x454c57,
        bumpMap: (ironSet && ironSet.bumpMap) || null,
        roughnessMap: (ironSet && ironSet.roughnessMap) || null,
        bumpScale: 0.06,
        roughness: 0.50,
        metalness: 0.76
      });
      this.mats.ironBlack = std({ color: 0x1e2126, roughness: 0.48, metalness: 0.78 });
      this.mats.steelBright = std({ color: 0xc5d0db, roughness: 0.28, metalness: 0.84 });
      this.mats.mithrilSilver = std({ color: 0xe6f2ff, emissive: 0x224466, emissiveIntensity: 0.28, roughness: 0.20, metalness: 0.90 });

      // Cloths, Foliage & Banners
      this.mats.elvenEmerald = std({ color: 0x265c3e, roughness: 0.72, metalness: 0.08, side: THREE.DoubleSide });
      this.mats.canopyFoliage = std({ color: 0x245838, roughness: 0.78, metalness: 0.06 });
      this.mats.gondorBlue = std({ color: 0x1c3a69, roughness: 0.78, metalness: 0.08, side: THREE.DoubleSide });
      this.mats.phalanxBlack = std({ color: 0x18202c, roughness: 0.66, metalness: 0.22, side: THREE.DoubleSide });
      this.mats.rohanGreen = std({ color: 0x275e37, roughness: 0.76, metalness: 0.08, side: THREE.DoubleSide });
      this.mats.gondorBanner = std({ color: 0xffffff, map: this.tex.gondorBanner || null, roughness: 0.80, metalness: 0.06, side: THREE.DoubleSide });
      this.mats.rohanBanner = std({ color: 0xffffff, map: this.tex.rohanBanner || null, roughness: 0.80, metalness: 0.06, side: THREE.DoubleSide });

      // Creature Skins, Fur & Mounts
      this.mats.elvenSkin = std({ color: 0xf0d5b8, roughness: 0.65, metalness: 0.02 });
      this.mats.humanSkin = std({ color: 0xdfb895, roughness: 0.70, metalness: 0.02 });
      this.mats.goblinSkin = std({ color: 0x5c7c44, roughness: 0.78, metalness: 0.04 });
      this.mats.goblinHood = std({ color: 0x292e27, roughness: 0.90, metalness: 0.04 });
      this.mats.orcSkin = std({ color: 0x5b674c, roughness: 0.80, metalness: 0.04 });
      this.mats.urukSkin = std({ color: 0x6e3a2e, roughness: 0.74, metalness: 0.06 });
      this.mats.urukEnragedArmor = std({ color: 0x5a1c18, emissive: 0xb81818, emissiveIntensity: 0.72, roughness: 0.42, metalness: 0.68 });
      this.mats.whiteHandCrest = std({ color: 0xedeae4, emissive: 0x38342e, emissiveIntensity: 0.12, roughness: 0.60, metalness: 0.05 });
      this.mats.wargFur = std({ color: 0x45352c, roughness: 0.86, metalness: 0.04 });
      this.mats.wargMane = std({ color: 0x261c17, roughness: 0.90, metalness: 0.03 });
      this.mats.trollSkin = std({
        color: 0x98938a,
        map: this.tex.trollHide || null,
        bumpMap: this.tex.trollBump || null,
        bumpScale: 0.14,
        roughness: 0.84,
        metalness: 0.05
      });
      this.mats.fellHide = std({ color: 0x2f2938, roughness: 0.72, metalness: 0.14 });
      this.mats.fellMembrane = std({ color: 0x3d3048, roughness: 0.78, metalness: 0.08, side: THREE.DoubleSide });
      this.mats.nazgulRobe = std({ color: 0x14161e, roughness: 0.88, metalness: 0.08, side: THREE.DoubleSide });
      this.mats.boneHorn = std({ color: 0xcbc0aa, roughness: 0.62, metalness: 0.08 });
      this.mats.balrogObsidian = std({
        color: 0x181416,
        bumpMap: this.tex.trollBump || null,
        bumpScale: 0.14,
        emissive: 0x2e0800,
        emissiveIntensity: 0.18,
        roughness: 0.48,
        metalness: 0.36
      });
      this.mats.balrogWingMembrane = std({
        color: 0x1a0b09,
        emissive: 0x4d1000,
        emissiveIntensity: 0.28,
        roughness: 0.72,
        metalness: 0.14,
        side: THREE.DoubleSide
      });

      this.mats.horseCoats = [
        std({ color: 0x8a522e, roughness: 0.74, metalness: 0.04 }),
        std({ color: 0x5c3e2e, roughness: 0.76, metalness: 0.04 }),
        std({ color: 0xcfc9c2, roughness: 0.70, metalness: 0.05 })
      ];
      this.mats.horseMane = std({ color: 0xebd083, roughness: 0.68, metalness: 0.08 });

      // Spectral Shadow Wraith States
      this.mats.wraithStealth = std({
        color: 0x1c3842,
        emissive: 0x1a6b7c,
        emissiveIntensity: 0.55,
        transparent: true,
        opacity: 0.46,
        depthWrite: false,
        roughness: 0.5,
        side: THREE.DoubleSide
      });
      this.mats.wraithRevealed = std({
        color: 0x62daf5,
        emissive: 0x269ec9,
        emissiveIntensity: 0.78,
        transparent: true,
        opacity: 0.86,
        roughness: 0.36,
        side: THREE.DoubleSide
      });
      this.mats.wraithDodge = std({
        color: 0x8ce8fa,
        emissive: 0x4bc5e0,
        emissiveIntensity: 0.65,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      // Selective Emissive Materials
      this.mats.cyanBowGlow = std({ color: 0x76e8fa, emissive: 0x28c8e8, emissiveIntensity: 1.05, roughness: 0.22, metalness: 0.2 });
      this.mats.emeraldBowGlow = std({ color: 0x92ebae, emissive: 0x2fc96e, emissiveIntensity: 0.95, roughness: 0.22, metalness: 0.2 });
      this.mats.starlightCrystal = std({ color: 0xbaf2ff, emissive: 0x4ad4f5, emissiveIntensity: 1.12, roughness: 0.16, metalness: 0.3 });
      this.mats.istariCrystal = std({ color: 0x9ce6ff, emissive: 0x2eb2eb, emissiveIntensity: 1.05, roughness: 0.18, metalness: 0.25 });
      this.mats.windowAmber = std({ color: 0xf5cc7a, emissive: 0xe68a1e, emissiveIntensity: 0.80, roughness: 0.35 });
      this.mats.windowStorm = std({ color: 0x84d8f7, emissive: 0x1e9bd8, emissiveIntensity: 0.85, roughness: 0.30 });
      this.mats.forgeFire = std({ color: 0xf59d3d, emissive: 0xe64a10, emissiveIntensity: 0.95, roughness: 0.32 });
      this.mats.anorFlame = std({ color: 0xf2b552, emissive: 0xd95808, emissiveIntensity: 0.76, roughness: 0.28 });
      this.mats.stormRune = std({ color: 0x96e6ff, emissive: 0x1eb0ed, emissiveIntensity: 1.08, roughness: 0.20 });
      this.mats.morgulGreen = std({ color: 0x8eebaa, emissive: 0x27c96b, emissiveIntensity: 0.95, roughness: 0.26 });
      this.mats.nazgulViolet = std({ color: 0xbea9e6, emissive: 0x7642eb, emissiveIntensity: 0.95, roughness: 0.28 });
      this.mats.balrogMagma = std({ color: 0xffab40, emissive: 0xe64500, emissiveIntensity: 1.08, roughness: 0.26 });
      this.mats.balrogBlade = std({ color: 0xffd572, emissive: 0xf56200, emissiveIntensity: 1.22, roughness: 0.20 });
      this.mats.eyeEvil = basic({ color: 0xffab2e });
      this.mats.eyeCrimson = basic({ color: 0xff2e2e });

      // Translucent Tactical / Status Rings & Overlays
      this.mats.rallyGoldRing = basic({ color: 0xebd078, transparent: true, opacity: 0.68, depthWrite: false, side: THREE.DoubleSide });
      this.mats.rallyGoldFill = basic({ color: 0xf4dc8c, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
      this.mats.tauntAuraRing = basic({ color: 0xffd54f, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
      this.mats.shieldWallDome = basic({ color: 0xf5cf62, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
      this.mats.urukRageAura = basic({ color: 0xff2e1f, transparent: true, opacity: 0.52, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      this.mats.trueSightRing = basic({ color: 0x6ef4ff, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      this.mats.stunShadowRing = basic({ color: 0x7c4dff, transparent: true, opacity: 0.56, depthWrite: false, side: THREE.DoubleSide });
      this.mats.stunShadowMist = basic({ color: 0x1a102b, transparent: true, opacity: 0.36, depthWrite: false, side: THREE.DoubleSide });
      this.mats.curseChain = std({ color: 0xff8a55, emissive: 0xe62900, emissiveIntensity: 1.15, roughness: 0.28, metalness: 0.4 });
      this.mats.curseBeacon = basic({ color: 0xe63500, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
      this.mats.tetherPhase1 = basic({ color: 0x55f29b, transparent: true, opacity: 0.76, blending: THREE.AdditiveBlending, depthWrite: false });
      this.mats.tetherPhase2 = basic({ color: 0xff4800, transparent: true, opacity: 0.84, blending: THREE.AdditiveBlending, depthWrite: false });
      this.mats.ringPowerHalo = basic({ color: 0xffca28, transparent: true, opacity: 0.48, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      this.mats.groundMarker = basic({ color: 0x090a0f, transparent: true, opacity: 0.34, depthWrite: false });
      this.mats.regenRing = basic({ color: 0x81c784, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide });

      // Crisp warm metallic impact glint (capped duty-cycle so forms stay sharp!) & invisible Raycast Hit Volume
      this.mats.hitFlash = std({
        color: 0xe8ded0,
        emissive: 0x9e5e24,
        emissiveIntensity: 0.45,
        roughness: 0.45,
        metalness: 0.35
      });
      this.mats.hitVolumeInvisible = basic({
        color: 0xffffff,
        transparent: true,
        opacity: 0.0,
        colorWrite: false,
        depthWrite: false
      });
    }

    _buildGeometries() {
      const THREE = this.THREE;
      const g = this.geos;

      g.box = this.regGeo(new THREE.BoxGeometry(1, 1, 1));
      g.sphere = this.regGeo(new THREE.SphereGeometry(1, 12, 10));
      g.sphereLow = this.regGeo(new THREE.SphereGeometry(1, 8, 6));
      g.cyl = this.regGeo(new THREE.CylinderGeometry(1, 1, 1, 12));
      g.cyl8 = this.regGeo(new THREE.CylinderGeometry(1, 1, 1, 8));
      g.cyl6 = this.regGeo(new THREE.CylinderGeometry(1, 1, 1, 6));
      g.cone = this.regGeo(new THREE.ConeGeometry(1, 1, 12));
      g.cone8 = this.regGeo(new THREE.ConeGeometry(1, 1, 8));
      g.cone4 = this.regGeo(new THREE.ConeGeometry(1, 1, 4));
      g.octa = this.regGeo(new THREE.OctahedronGeometry(1, 0));
      g.icosa = this.regGeo(new THREE.IcosahedronGeometry(1, 0));
      g.dodeca = this.regGeo(new THREE.DodecahedronGeometry(1, 0));
      g.plane = this.regGeo(new THREE.PlaneGeometry(1, 1));
      g.ring = this.regGeo(new THREE.RingGeometry(0.84, 1.0, 28));
      g.ringDash = this.regGeo(new THREE.RingGeometry(0.90, 1.0, 18));
      g.disc = this.regGeo(new THREE.CircleGeometry(1, 24));
      g.torusThin = this.regGeo(new THREE.TorusGeometry(1, 0.055, 6, 24));
      g.torusThick = this.regGeo(new THREE.TorusGeometry(1, 0.11, 8, 22));
      g.hemiDome = this.regGeo(new THREE.SphereGeometry(1, 12, 8, 0, TWO_PI, 0, HALF_PI));

      const hitCyl = new THREE.CylinderGeometry(2.45, 2.55, 7.6, 12);
      hitCyl.translate(0, 3.8, 0);
      g.towerHitCyl = this.regGeo(hitCyl);

      const tetherCyl = new THREE.CylinderGeometry(0.11, 0.16, 1.0, 8, 1, true);
      tetherCyl.translate(0, 0.5, 0);
      g.tetherBeam = this.regGeo(tetherCyl);

      const limbDown = new THREE.CylinderGeometry(0.9, 0.72, 1.0, 8);
      limbDown.translate(0, -0.5, 0);
      g.limbDown = this.regGeo(limbDown);

      const bladeUp = new THREE.ConeGeometry(1, 1, 4);
      bladeUp.translate(0, 0.5, 0);
      g.bladeUp = this.regGeo(bladeUp);

      const shaftUp = new THREE.CylinderGeometry(1, 1, 1, 8);
      shaftUp.translate(0, 0.5, 0);
      g.shaftUp = this.regGeo(shaftUp);
    }

    getTowerProvider() {
      if (this._towerProvider) return this._towerProvider;
      const TM = TD && TD.TowerModels3D;
      if (!TM) return null;
      if (typeof TM === 'function' && typeof TM.createTowerRig !== 'function') {
        this._towerProvider = new TM(this);
      } else {
        this._towerProvider = TM;
      }
      return this._towerProvider;
    }

    getEnemyProvider() {
      if (this._enemyProvider) return this._enemyProvider;
      const EM = TD && TD.EnemyModels3D;
      if (!EM) return null;
      if (typeof EM === 'function' && typeof EM.createEnemyRig !== 'function') {
        this._enemyProvider = new EM(this);
      } else {
        this._enemyProvider = EM;
      }
      return this._enemyProvider;
    }

    dispose() {
      if (this._towerProvider && typeof this._towerProvider.dispose === 'function' && this._towerProvider !== TD.TowerModels3D) {
        this._towerProvider.dispose();
      }
      if (this._enemyProvider && typeof this._enemyProvider.dispose === 'function' && this._enemyProvider !== TD.EnemyModels3D) {
        this._enemyProvider.dispose();
      }
      for (let i = 0; i < this.geometries.length; i++) {
        if (this.geometries[i] && this.geometries[i].dispose) this.geometries[i].dispose();
      }
      for (let i = 0; i < this.materials.length; i++) {
        if (this.materials[i] && this.materials[i].dispose) this.materials[i].dispose();
      }
      for (let i = 0; i < this.textures.length; i++) {
        if (this.textures[i] && this.textures[i].dispose) this.textures[i].dispose();
      }
      this.geometries.length = 0;
      this.materials.length = 0;
      this.textures.length = 0;
      this._towerProvider = null;
      this._enemyProvider = null;
    }
  }

  let _staticAssetCache = null;
  function getStaticAssetCache() {
    if (TD.activeScene3D && TD.activeScene3D.models3d && TD.activeScene3D.models3d.cache && !TD.activeScene3D.models3d._disposed) {
      return TD.activeScene3D.models3d.cache;
    }
    const THREE = (typeof window !== 'undefined' && window.THREE) ? window.THREE : null;
    if (!THREE) return null;
    if (!_staticAssetCache) {
      _staticAssetCache = new ModelAssetCache(THREE);
    }
    return _staticAssetCache;
  }

  // ============================================================================
  // 2. RIG GRAPH, SHADOW, HIT-FLASH & STATUS OVERLAY HELPERS
  // ============================================================================
  function makeMesh(THREE, geo, mat, sx, sy, sz) {
    const m = new THREE.Mesh(geo, mat);
    if (sx !== undefined) {
      m.scale.set(sx, sy !== undefined ? sy : sx, sz !== undefined ? sz : sx);
    }
    m.userData.baseMat = mat;
    return m;
  }

  function finalizeShadowAndBaseMats(root, skipTransparentShadow) {
    const flashMeshes = [];
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (!obj.userData.baseMat) obj.userData.baseMat = obj.material;
      if (obj.userData.noShadow || obj.userData.isTowerHitVolume || obj.userData.isHitVolume) {
        obj.castShadow = false;
        obj.receiveShadow = false;
        return;
      }
      const isTrans = Boolean(mat && mat.transparent);
      if (!isTrans && mat && mat.colorWrite !== false) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        const hasStrongEmissive = Boolean(mat.emissiveIntensity && mat.emissiveIntensity > 0.65);
        if (!obj.userData.noFlash && !hasStrongEmissive && !Array.isArray(obj.material)) {
          flashMeshes.push(obj);
        }
      } else {
        obj.castShadow = !skipTransparentShadow && Boolean(obj.userData.forceShadow);
        obj.receiveShadow = false;
      }
    });
    return flashMeshes;
  }

  function setRigHitFlash(rig, active, flashMat) {
    if (!rig || !rig.flashMeshes || rig.flashMeshes.length === 0) return;
    const want = Boolean(active && flashMat);
    if (Boolean(rig._flashed) === want) return;
    rig._flashed = want;
    const list = rig.flashMeshes;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      m.material = want ? flashMat : (m.userData.baseMat || m.material);
    }
  }

  function tagTowerHierarchy(root, tower) {
    const isActive = Boolean(tower);
    root.traverse((obj) => {
      obj.userData.isTower = isActive;
      obj.userData.kind = 'tower';
      obj.userData.type = 'tower';
      obj.userData.tower = tower || null;
      obj.userData.towerId = tower ? tower.id : null;
      obj.userData.padId = tower ? tower.padId : null;
    });
  }

  function buildTowerStatusOverlay(cache) {
    const THREE = cache.THREE;
    const g = cache.geos;
    const m = cache.mats;

    const root = new THREE.Group();
    root.name = 'TD_TowerStatusOverlay';

    // 1. Ring of Power golden base halo
    const ringHalo = makeMesh(THREE, g.ring, m.ringPowerHalo, 2.35, 2.35, 1);
    ringHalo.rotation.x = -HALF_PI;
    ringHalo.position.y = 0.08;
    ringHalo.userData.noShadow = true;
    ringHalo.userData.skipStudioBounds = true;
    ringHalo.visible = false;
    root.add(ringHalo);

    // 2. Black Breath Stun Shroud (swirling dark shadow rings + mist)
    const stunGroup = new THREE.Group();
    stunGroup.visible = false;
    stunGroup.userData.skipStudioBounds = true;
    const stunMist = makeMesh(THREE, g.cyl, m.stunShadowMist, 2.05, 4.4, 2.05);
    stunMist.position.y = 2.4;
    stunMist.userData.noShadow = true;
    stunGroup.add(stunMist);

    const stunRings = [];
    for (let i = 0; i < 3; i++) {
      const sr = makeMesh(THREE, g.torusThin, m.stunShadowRing, 1.95 - i * 0.16, 1.95 - i * 0.16, 1.4);
      sr.position.y = 1.6 + i * 1.35;
      sr.rotation.x = HALF_PI + (i - 1) * 0.28;
      sr.userData.noShadow = true;
      stunGroup.add(sr);
      stunRings.push(sr);
    }
    root.add(stunGroup);

    // 3. Wave 15 Boss Curse Overlay (3 glowing crimson-orange rune chains + beacon + sigil)
    const curseGroup = new THREE.Group();
    curseGroup.visible = false;
    curseGroup.userData.skipStudioBounds = true;
    const chains = [];
    const chainHeights = [1.75, 2.95, 4.15];
    const chainTilts = [0.42, -0.45, 0.36];
    for (let i = 0; i < 3; i++) {
      const ch = makeMesh(THREE, g.torusThick, m.curseChain, 1.92 - i * 0.1, 1.92 - i * 0.1, 1.15);
      ch.position.y = chainHeights[i];
      ch.rotation.x = HALF_PI + chainTilts[i];
      ch.rotation.y = i * 1.05;
      ch.userData.noShadow = true;
      ch.userData.noFlash = true;
      curseGroup.add(ch);
      chains.push(ch);
    }

    const beacon = makeMesh(THREE, g.cyl, m.curseBeacon, 0.55, 5.2, 0.55);
    beacon.position.y = 6.2;
    beacon.userData.noShadow = true;
    curseGroup.add(beacon);

    const topSigil = makeMesh(THREE, g.octa, m.curseChain, 0.52, 0.85, 0.52);
    topSigil.position.y = 7.6;
    topSigil.userData.noShadow = true;
    topSigil.userData.noFlash = true;
    curseGroup.add(topSigil);

    root.add(curseGroup);

    return {
      group: root,
      ringHalo,
      stunGroup,
      stunRings,
      curseGroup,
      chains,
      beacon,
      topSigil
    };
  }

  function buildGarrisonRallyOverlay(cache, tier, branch) {
    const THREE = cache.THREE;
    const g = cache.geos;
    const m = cache.mats;
    const isPhalanx = tier === 3 && branch === 'A';

    const rallyGroup = new THREE.Group();
    rallyGroup.name = 'TD_GarrisonRallyOverlay';

    const ring = makeMesh(THREE, g.ring, m.rallyGoldRing, 2.15, 2.15, 1);
    ring.rotation.x = -HALF_PI;
    ring.userData.noShadow = true;
    const fill = makeMesh(THREE, g.disc, m.rallyGoldFill, 2.0, 2.0, 1);
    fill.rotation.x = -HALF_PI;
    fill.userData.noShadow = true;
    rallyGroup.add(fill, ring);

    let tauntRing = null;
    if (isPhalanx) {
      tauntRing = makeMesh(THREE, g.ringDash, m.tauntAuraRing, 5.4, 5.4, 1);
      tauntRing.rotation.x = -HALF_PI;
      tauntRing.position.y = 0.02;
      tauntRing.userData.noShadow = true;
      rallyGroup.add(tauntRing);
    }

    return { rallyGroup, tauntRing };
  }

  function buildTrueSightRevealOverlay(cache) {
    const THREE = cache.THREE;
    const g = cache.geos;
    const m = cache.mats;

    const revealGroup = new THREE.Group();
    revealGroup.visible = false;
    revealGroup.userData.skipStudioBounds = true;

    const revRing = makeMesh(THREE, g.ringDash, m.trueSightRing, 1.35, 1.35, 1);
    revRing.rotation.x = -HALF_PI;
    revRing.position.y = 0.08;
    revRing.userData.noShadow = true;

    const revEye = makeMesh(THREE, g.octa, m.starlightCrystal, 0.20, 0.30, 0.20);
    revEye.position.y = 2.75;
    revEye.userData.noShadow = true;
    revEye.userData.noFlash = true;

    revealGroup.add(revRing, revEye);
    return { revealGroup, revRing, revEye };
  }

  // ============================================================================
  // 3. DELEGATED RIG BUILDERS & NORMALIZERS (TowerModels3D & EnemyModels3D)
  // ============================================================================
  function defaultMuzzleHeight(typeKey, tier, branch) {
    if (typeKey === 'elven') return tier === 3 && branch === 'A' ? 6.1 : (tier >= 2 ? 5.6 : 5.2);
    if (typeKey === 'garrison') return 3.2;
    if (typeKey === 'dwarven') return tier === 3 && branch === 'A' ? 3.8 : (tier === 3 && branch === 'B' ? 4.2 : 4.6);
    if (typeKey === 'istari') return tier === 3 ? 6.5 : (tier === 2 ? 6.0 : 5.5);
    return 4.5;
  }

  function parseTowerVariantKey(variantKey) {
    const parts = String(variantKey || 'elven_1_0').split('_');
    const type = parts[0] || 'elven';
    const tier = Number(parts[1]) || 1;
    const rawBranch = parts[2] && parts[2] !== '0' ? parts[2].toUpperCase() : null;
    const branch = tier === 3 ? (rawBranch || 'A') : null;
    return { type, tier, branch };
  }

  function createTowerRigByVariant(variantKey, cache) {
    const THREE = cache.THREE;
    const { type, tier, branch } = parseTowerVariantKey(variantKey);
    const provider = cache.getTowerProvider();

    let raw = null;
    if (provider && typeof provider.createTowerRig === 'function') {
      raw = provider.createTowerRig(type, tier, branch, cache);
    }

    const group = (raw && raw.isObject3D)
      ? raw
      : ((raw && (raw.group || raw.root || raw.mesh)) || new THREE.Group());
    const meta = Object.assign({}, group.userData || {}, (raw && !raw.isObject3D) ? raw : {});

    // Attach invisible raycast hit-cylinder if not provided by TowerModels3D
    let hitMesh = meta.hitMesh || null;
    if (!hitMesh) {
      hitMesh = makeMesh(THREE, cache.geos.towerHitCyl, cache.mats.hitVolumeInvisible, 1, 1, 1);
      hitMesh.userData.noShadow = true;
      group.add(hitMesh);
    }
    hitMesh.userData.isTowerHitVolume = true;
    hitMesh.userData.isTower = true;

    // Attach Ring / Black Breath Stun / Boss Curse 3D chains overlay if not provided
    let status = meta.status || null;
    if (!status || !status.curseGroup || !status.stunGroup || !status.ringHalo) {
      status = buildTowerStatusOverlay(cache);
      group.add(status.group);
    }

    // Attach Garrison road formation ring if not provided
    let rallyGroup = meta.rallyGroup || null;
    let tauntRing = meta.tauntRing || null;
    if (type === 'garrison' && !rallyGroup) {
      const ro = buildGarrisonRallyOverlay(cache, tier, branch);
      rallyGroup = ro.rallyGroup;
      tauntRing = ro.tauntRing;
    }

    const flashMeshes = finalizeShadowAndBaseMats(group, false);

    const rig = Object.assign({}, meta, {
      group,
      type,
      tier,
      branch,
      variantKey: `${type}_${tier}_${tier === 3 && branch ? branch : '0'}`,
      muzzleHeight: Number(meta.muzzleHeight || meta.muzzleY) || defaultMuzzleHeight(type, tier, branch),
      hitMesh,
      status,
      rallyGroup,
      tauntRing,
      flashMeshes,
      aimPivot: meta.aimPivot || meta.turretPivot || meta.turret || meta.rotator || meta.headPivot || null,
      archers: Array.isArray(meta.archers) ? meta.archers : (meta.archer ? [meta.archer] : []),
      starlightCrystal: meta.starlightCrystal || meta.silmaril || null,
      starlightRing1: meta.starlightRing1 || null,
      starlightRing2: meta.starlightRing2 || null,
      doorPivotL: meta.doorPivotL || meta.doorL || meta.leftDoor || null,
      doorPivotR: meta.doorPivotR || meta.doorR || meta.rightDoor || null,
      portcullis: meta.portcullis || meta.grate || null,
      bannerPivot: meta.bannerPivot || meta.banner || (Array.isArray(meta.banners) ? meta.banners[0] : null),
      banners: Array.isArray(meta.banners) ? meta.banners : [],
      brazierFlame: meta.brazierFlame || meta.brazier || null,
      armPivot: meta.armPivot || meta.throwingArm || meta.catapultArm || meta.trebuchetArm || null,
      windlass: meta.windlass || meta.winch || meta.gearWheel || null,
      counterweight: meta.counterweight || meta.weightBox || null,
      payloadBoulder: meta.payloadBoulder || meta.boulder || meta.projectileMesh || null,
      barrelRecoilGroup: meta.barrelRecoilGroup || meta.barrelGroup || meta.recoilGroup || meta.cannonBarrel || null,
      muzzleFlashMesh: meta.muzzleFlashMesh || meta.muzzleFlash || null,
      prodL: meta.prodL || meta.limbL || meta.bowArmL || null,
      prodR: meta.prodR || meta.limbR || meta.bowArmR || null,
      loadedBolts: meta.loadedBolts || meta.boltMesh || meta.bolt || meta.javelin || null,
      apexCrystal: meta.apexCrystal || meta.crystal || meta.sunCore || meta.orb || null,
      orbitGroup1: meta.orbitGroup1 || meta.ring1 || meta.astrolabe1 || (Array.isArray(meta.rings) ? meta.rings[0] : null),
      orbitGroup2: meta.orbitGroup2 || meta.ring2 || meta.astrolabe2 || (Array.isArray(meta.rings) ? meta.rings[1] : null),
      orbitGroup3: meta.orbitGroup3 || meta.ring3 || meta.astrolabe3 || (Array.isArray(meta.rings) ? meta.rings[2] : null)
    });
    return rig;
  }

  function mapSoldierVariantToProviderKey(variantKey) {
    const v = String(variantKey || 'guard_1').toLowerCase();
    if (v.indexOf('knight') !== -1 || v.indexOf('rohirrim') !== -1 || v.indexOf('riddermark') !== -1 || v === '3b') {
      return { base: 'knight', full: 'knight_3B', tier: 3, isKnight: true };
    }
    if (v.indexOf('phalanx') !== -1 || v.indexOf('towerguard') !== -1 || v === '3a') {
      return { base: 'phalanx', full: 'phalanx_3A', tier: 3, isKnight: false };
    }
    if (v === 'guard_2' || v === 'guard2' || v === '2') {
      return { base: 'guard', full: 'guard_2', tier: 2, isKnight: false };
    }
    return { base: 'guard', full: 'guard_1', tier: 1, isKnight: false };
  }

  function createSoldierRigByVariant(variantKey, cache) {
    const THREE = cache.THREE;
    const info = mapSoldierVariantToProviderKey(variantKey);
    const provider = cache.getTowerProvider();

    let raw = null;
    if (provider && typeof provider.createSoldierRig === 'function') {
      // Pass canonical 'guard' | 'phalanx' | 'knight' unless provider explicitly supports 'guard_2'
      const supported = Array.isArray(provider.SOLDIER_VARIANTS) ? provider.SOLDIER_VARIANTS : null;
      const argKey = (supported && supported.indexOf(info.full) !== -1) ? info.full : info.base;
      raw = provider.createSoldierRig(argKey, cache, { tier: info.tier, variantKey: info.full });
    }

    const group = (raw && raw.isObject3D)
      ? raw
      : ((raw && (raw.group || raw.root || raw.mesh)) || new THREE.Group());
    const meta = Object.assign({}, group.userData || {}, (raw && !raw.isObject3D) ? raw : {});

    // Subtle veteran stature boost on Tier 2 Citadel Guards when sharing the 'guard' base rig
    if (info.full === 'guard_2' && group.scale.x === 1) {
      group.scale.setScalar(1.06);
    }

    // Ensure Citadel Shield Wall protection dome exists
    let shieldDome = meta.shieldDome || null;
    if (!shieldDome) {
      shieldDome = makeMesh(THREE, cache.geos.hemiDome, cache.mats.shieldWallDome, 1.05, 1.35, 1.05);
      shieldDome.position.y = 0.05;
      shieldDome.userData.noShadow = true;
      shieldDome.userData.skipStudioBounds = true;
      shieldDome.visible = false;
      group.add(shieldDome);
    } else {
      shieldDome.visible = false;
      shieldDome.userData.skipStudioBounds = true;
    }

    const flashMeshes = finalizeShadowAndBaseMats(group, false);

    return Object.assign({}, meta, {
      group,
      variantKey: info.full,
      isKnight: Boolean(meta.isKnight !== undefined ? meta.isKnight : info.isKnight),
      bodyRoot: meta.bodyRoot || meta.torsoGroup || meta.riderGroup || meta.body || null,
      legL: meta.legL || meta.leftLeg || null,
      legR: meta.legR || meta.rightLeg || null,
      armL: meta.armL || meta.leftArm || null,
      armR: meta.armR || meta.rightArm || null,
      shieldPivot: meta.shieldPivot || meta.shieldArm || meta.shieldGroup || meta.armL || null,
      weaponPivot: meta.weaponPivot || meta.weaponArm || meta.lancePivot || meta.spearPivot || meta.pikePivot || meta.armR || null,
      horseLegs: Array.isArray(meta.horseLegs) ? meta.horseLegs : (Array.isArray(meta.legs) ? meta.legs : []),
      horseMeshes: Array.isArray(meta.horseMeshes) ? meta.horseMeshes : [],
      neckGroup: meta.neckGroup || meta.horseNeck || null,
      tailPivot: meta.tailPivot || meta.horseTail || null,
      shieldDome,
      flashMeshes
    });
  }

  function defaultEnemyHeight(typeKey) {
    switch (typeKey) {
      case 'goblin': return 1.65;
      case 'orc': return 2.15;
      case 'uruk': return 2.55;
      case 'warg': return 2.45;
      case 'troll': return 4.65;
      case 'wraith': return 2.50;
      case 'fellbeast': return 1.60;
      case 'ringwraith': return 3.35;
      case 'balrog': return 8.20;
      default: return 2.15;
    }
  }

  function createEnemyRigByType(typeKey, cache, opts) {
    const THREE = cache.THREE;
    const provider = cache.getEnemyProvider();

    let raw = null;
    if (provider && typeof provider.createEnemyRig === 'function') {
      raw = provider.createEnemyRig(typeKey, cache, opts);
    }

    let group = (raw && raw.isObject3D)
      ? raw
      : ((raw && (raw.group || raw.root || raw.mesh)) || new THREE.Group());
    let meta = Object.assign({}, group.userData || {}, (raw && !raw.isObject3D) ? raw : {});

    // Dual-phase Balrog check: if EnemyModels3D exposes Phase 1 ('witchlord') separately from Phase 2 ('balrog'),
    // combine them under one group with phase1Group & phase2Group so live Wave 15 phase transition is seamless!
    if (typeKey === 'balrog') {
      let p1 = meta.phase1Group || meta.witchLordGroup || meta.p1Group || null;
      let p2 = meta.phase2Group || meta.balrogGroup || meta.p2Group || null;
      if (!p1 && !p2 && provider && typeof provider.createEnemyRig === 'function') {
        const rawP1 = provider.createEnemyRig('witchlord', cache, { phase: 1 });
        if (rawP1) {
          const g1 = rawP1.isObject3D ? rawP1 : (rawP1.group || rawP1.root || rawP1.mesh);
          const m1 = Object.assign({}, g1 ? g1.userData : {}, rawP1.isObject3D ? {} : rawP1);
          if (g1 && g1 !== group) {
            const combined = new THREE.Group();
            combined.add(g1, group);
            p1 = g1;
            p2 = group;
            group = combined;
            meta = Object.assign({}, m1, meta, { phase1Group: p1, phase2Group: p2 });
          }
        }
      }
      meta.phase1Group = p1 || meta.phase1Group || null;
      meta.phase2Group = p2 || meta.phase2Group || null;
      if (meta.phase2Group && !meta.baseP2Scale) {
        meta.baseP2Scale = meta.phase2Group.scale.x || 1.0;
      }
    }

    // Ensure Warg has a jumpGroup wrapper for 3D parabolic leaps over Garrison blockers
    if (typeKey === 'warg' && !meta.jumpGroup) {
      const jumpGroup = new THREE.Group();
      while (group.children.length > 0) {
        jumpGroup.add(group.children[0]);
      }
      group.add(jumpGroup);
      meta.jumpGroup = jumpGroup;
    }

    // Ensure Shadow Wraith has floatGroup + True Sight reveal ring
    if (typeKey === 'wraith') {
      if (!meta.floatGroup) {
        const floatGroup = new THREE.Group();
        while (group.children.length > 0) {
          floatGroup.add(group.children[0]);
        }
        group.add(floatGroup);
        meta.floatGroup = floatGroup;
      }
      if (!meta.revealGroup) {
        const rev = buildTrueSightRevealOverlay(cache);
        group.add(rev.revealGroup);
        meta.revealGroup = rev.revealGroup;
        meta.revRing = rev.revRing;
        meta.revEye = rev.revEye;
      }
    }

    // Ensure Fell Beast has flyer wrapper at aerial altitude + road drop-shadow
    if (typeKey === 'fellbeast') {
      if (!meta.flyer) {
        const flyer = new THREE.Group();
        while (group.children.length > 0) {
          flyer.add(group.children[0]);
        }
        flyer.position.y = 6.5;
        group.add(flyer);
        meta.flyer = flyer;
      }
      if (!meta.groundShadow) {
        const gs = makeMesh(THREE, cache.geos.disc, cache.mats.groundMarker, 1.5, 1.5, 1);
        gs.rotation.x = -HALF_PI;
        gs.position.y = 0.04;
        gs.userData.noShadow = true;
        gs.userData.isGroundDecal = true;
        group.add(gs);
        meta.groundShadow = gs;
      }
    }

    // Ensure Uruk-hai Berserker has rageAura mesh
    if (typeKey === 'uruk' && !meta.rageAura) {
      const rageAura = makeMesh(THREE, cache.geos.ringDash, cache.mats.urukRageAura, 1.15, 1.15, 1);
      rageAura.rotation.x = -HALF_PI;
      rageAura.position.y = 0.08;
      rageAura.userData.noShadow = true;
      rageAura.userData.skipStudioBounds = true;
      rageAura.visible = false;
      group.add(rageAura);
      meta.rageAura = rageAura;
    }

    // Ensure Olog-hai Troll has stony regeneration ring
    if (typeKey === 'troll' && !meta.regenRing) {
      const regenRing = makeMesh(THREE, cache.geos.ringDash, cache.mats.regenRing, 1.55, 1.55, 1);
      regenRing.rotation.x = -HALF_PI;
      regenRing.position.y = 0.06;
      regenRing.userData.noShadow = true;
      regenRing.userData.skipStudioBounds = true;
      regenRing.visible = false;
      group.add(regenRing);
      meta.regenRing = regenRing;
    }

    const flashMeshes = finalizeShadowAndBaseMats(group, false);

    return Object.assign({}, meta, {
      group,
      type: typeKey,
      height3D: Number(meta.height3D) || defaultEnemyHeight(typeKey),
      flashMeshes,
      bodyRoot: meta.bodyRoot || meta.torsoGroup || meta.body || null,
      legL: meta.legL || meta.leftLeg || null,
      legR: meta.legR || meta.rightLeg || null,
      armL: meta.armL || meta.leftArm || null,
      armR: meta.armR || meta.rightArm || meta.swordArm || meta.weaponArm || null,
      swordArm: meta.swordArm || meta.armR || meta.rightArm || null,
      leftArm: meta.leftArm || meta.armL || null,
      armorMeshes: Array.isArray(meta.armorMeshes) ? meta.armorMeshes : [],
      wargLegs: Array.isArray(meta.wargLegs) ? meta.wargLegs : (Array.isArray(meta.legs) ? meta.legs : []),
      jawPivot: meta.jawPivot || meta.jaw || null,
      tailPivot: meta.tailPivot || meta.tailGroup || meta.tail || null,
      spearPivot: meta.spearPivot || meta.riderWeapon || meta.riderArmR || null,
      ribbons: Array.isArray(meta.ribbons) ? meta.ribbons : (Array.isArray(meta.clothStrips) ? meta.clothStrips : []),
      shroudMeshes: Array.isArray(meta.shroudMeshes) ? meta.shroudMeshes : []
    });
  }

  // Normalize wing sub-pivots whether exposed as { innerPivot, outerPivot } or THREE.Object3D directly
  function animateWingPair(wingL, wingR, innerZ, outerZ, innerY, outerY) {
    if (wingL) {
      const inL = wingL.innerPivot || wingL.inner || wingL;
      const outL = wingL.outerPivot || wingL.outer || null;
      if (inL && inL.rotation) {
        if (innerZ !== undefined) inL.rotation.z = innerZ;
        if (innerY !== undefined) inL.rotation.y = innerY;
      }
      if (outL && outL.rotation) {
        if (outerZ !== undefined) outL.rotation.z = outerZ;
        if (outerY !== undefined) outL.rotation.y = outerY;
      }
    }
    if (wingR) {
      const inR = wingR.innerPivot || wingR.inner || wingR;
      const outR = wingR.outerPivot || wingR.outer || null;
      if (inR && inR.rotation) {
        if (innerZ !== undefined) inR.rotation.z = -innerZ;
        if (innerY !== undefined) inR.rotation.y = -innerY;
      }
      if (outR && outR.rotation) {
        if (outerZ !== undefined) outR.rotation.z = -outerZ;
        if (outerY !== undefined) outR.rotation.y = -outerY;
      }
    }
  }

  // ============================================================================
  // 4. STANDALONE STUDIO MESH BUILDERS (Used by Scene3D.renderModelPortrait & QA)
  // ============================================================================
  function buildStandaloneTowerMeshInternal(cache, key, tier, branch, opts) {
    if (!cache) return null;
    let typeKey = String(key || 'elven').toLowerCase().trim();
    let t = tier;
    let b = branch;
    if (typeof tier === 'object' && tier !== null) {
      opts = tier;
      t = opts.tier || 1;
      b = opts.branch || null;
    }
    if (typeKey.indexOf('_') !== -1) {
      const parsed = parseTowerVariantKey(typeKey);
      typeKey = parsed.type;
      t = parsed.tier;
      b = parsed.branch;
    }
    const finalTier = Number(t) || 1;
    const finalBranch = finalTier === 3 ? String(b || 'A').toUpperCase() : '0';
    const variantKey = `${typeKey}_${finalTier}_${finalBranch}`;

    const rig = createTowerRigByVariant(variantKey, cache);
    if (!rig || !rig.group) return null;

    if (rig.hitMesh) rig.hitMesh.visible = false;
    if (rig.status && rig.status.group) {
      const showCurse = Boolean(opts && opts.cursed);
      rig.status.group.visible = showCurse;
      if (showCurse && rig.status.curseGroup) {
        rig.status.curseGroup.visible = true;
      }
    }
    if (rig.aimPivot) {
      rig.aimPivot.rotation.y = (opts && opts.aimYaw !== undefined) ? opts.aimYaw : 0.24;
    }
    if (rig.armPivot && rig.type === 'dwarven') {
      rig.armPivot.rotation.x = -0.36;
    }
    if (rig.muzzleFlashMesh) {
      rig.muzzleFlashMesh.visible = false;
    }

    rig.group.userData.standaloneRig = rig;
    rig.group.userData.rig = rig;
    if (!cache._standaloneTowers) cache._standaloneTowers = [];
    cache._standaloneTowers.push(rig);
    return rig.group;
  }

  function buildStandaloneSoldierMeshInternal(cache, variant, opts) {
    if (!cache) return null;
    const rig = createSoldierRigByVariant(variant || 'guard_1', cache);
    if (!rig || !rig.group) return null;

    if (rig.shieldDome) {
      rig.shieldDome.visible = Boolean(opts && opts.shieldWall);
    }

    // Heroic action-ready miniature stance for studio portraits & QA inspection sheet
    if (rig.isKnight) {
      if (rig.horseMeshes && rig.horseMeshes.length > 0) {
        const coatIdx = (opts && typeof opts.coatIndex === 'number') ? opts.coatIndex : 0;
        const coatMat = cache.mats.horseCoats[coatIdx % cache.mats.horseCoats.length];
        for (let i = 0; i < rig.horseMeshes.length; i++) {
          rig.horseMeshes[i].material = coatMat;
        }
      }
      if (rig.horseLegs.length >= 4) {
        rig.horseLegs[0].rotation.x = -0.34;
        rig.horseLegs[1].rotation.x = 0.28;
        rig.horseLegs[2].rotation.x = 0.32;
        rig.horseLegs[3].rotation.x = -0.26;
      }
      if (rig.neckGroup) rig.neckGroup.rotation.x = 0.08;
    } else {
      if (rig.legL) rig.legL.rotation.x = -0.18;
      if (rig.legR) rig.legR.rotation.x = 0.18;
    }

    rig.group.userData.standaloneRig = rig;
    rig.group.userData.rig = rig;
    if (!cache._standaloneSoldiers) cache._standaloneSoldiers = [];
    cache._standaloneSoldiers.push(rig);
    return rig.group;
  }

  function buildStandaloneEnemyMeshInternal(cache, key, opts) {
    if (!cache) return null;
    const options = opts || {};
    let typeKey = String(key || 'orc').toLowerCase().trim();
    let phase = options.phase !== undefined ? Number(options.phase) : (typeKey === 'balrog' ? 2 : 1);

    if (typeKey === 'witchlord' || typeKey === 'witch_lord' || typeKey === 'witch-lord' || typeKey === 'balrog_p1' || typeKey === 'balrog_1' || typeKey === 'balrog_phase1') {
      typeKey = 'balrog';
      phase = 1;
    } else if (typeKey === 'balrog_p2' || typeKey === 'balrog_2' || typeKey === 'balrog_phase2') {
      typeKey = 'balrog';
      phase = 2;
    }

    const rig = createEnemyRigByType(typeKey, cache, Object.assign({ portrait: true }, options, { phase }));
    if (!rig || !rig.group) return null;

    if (rig.rageAura) rig.rageAura.visible = Boolean(options.enraged);
    if (rig.revealGroup) rig.revealGroup.visible = false;
    if (rig.regenRing) rig.regenRing.visible = false;

    // Heroic studio pose per creature / boss (preserving @enemies-3d's custom wraith materials & upright/pitched wings!)
    if (typeKey === 'wraith') {
      rig.shroudState = -1;
    } else if (typeKey === 'fellbeast') {
      if (rig.flyer) rig.flyer.position.y = 1.65;
      const inL = rig.wingL && (rig.wingL.innerPivot || rig.wingL.inner || rig.wingL);
      const inR = rig.wingR && (rig.wingR.innerPivot || rig.wingR.inner || rig.wingR);
      if (inL && inL.rotation && Math.abs(inL.rotation.x) < 0.05 && Math.abs(inL.rotation.z) < 0.05) {
        inL.rotation.x = 0.38;
        inL.rotation.z = 0.46;
      }
      if (inR && inR.rotation && Math.abs(inR.rotation.x) < 0.05 && Math.abs(inR.rotation.z) < 0.05) {
        inR.rotation.x = 0.38;
        inR.rotation.z = -0.46;
      }
      if (rig.groundShadow) rig.groundShadow.visible = false;
    } else if (typeKey === 'warg') {
      if (rig.wargLegs.length >= 4) {
        rig.wargLegs[0].rotation.x = -0.35;
        rig.wargLegs[1].rotation.x = 0.26;
        rig.wargLegs[2].rotation.x = 0.30;
        rig.wargLegs[3].rotation.x = -0.28;
      }
      if (rig.jawPivot) rig.jawPivot.rotation.x = 0.24;
    } else if (typeKey === 'troll') {
      if (rig.legL) rig.legL.rotation.x = -0.16;
      if (rig.legR) rig.legR.rotation.x = 0.16;
      if (rig.armR) rig.armR.rotation.x = -0.42;
    } else if (typeKey === 'balrog') {
      const showP2 = phase !== 1;
      if (rig.phase1Group) rig.phase1Group.visible = !showP2;
      if (rig.phase2Group) rig.phase2Group.visible = showP2;
      if (typeof rig.setPhase === 'function') {
        rig.setPhase(showP2 ? 2 : 1);
      }
    } else {
      if (rig.legL) rig.legL.rotation.x = -0.20;
      if (rig.legR) rig.legR.rotation.x = 0.20;
    }

    if (typeof rig.poseStudio === 'function') {
      rig.poseStudio(options);
    }

    rig.group.userData.standaloneRig = rig;
    rig.group.userData.rig = rig;
    if (!cache._standaloneEnemies) cache._standaloneEnemies = [];
    cache._standaloneEnemies.push(rig);
    return rig.group;
  }

  // ============================================================================
  // 5. TD.Models3D — MAIN COORDINATOR, POOLING & 60 FPS SYNC ENGINE
  // ============================================================================
  class Models3D {
    constructor(scene3d) {
      const THREE = (typeof window !== 'undefined' && window.THREE) ? window.THREE : null;
      if (!THREE) {
        throw new Error('TD.Models3D requires global window.THREE');
      }
      this.THREE = THREE;
      this.scene3d = scene3d || null;
      this.parentContainer = (scene3d && scene3d.modelsGroup)
        ? scene3d.modelsGroup
        : ((scene3d && scene3d.isScene) ? scene3d : (scene3d && scene3d.scene ? scene3d.scene : null));
      this.threeScene = (scene3d && scene3d.isScene)
        ? scene3d
        : (scene3d && scene3d.scene ? scene3d.scene : null);

      this.cache = new ModelAssetCache(THREE);

      this.rootGroup = new THREE.Group();
      this.rootGroup.name = 'TD_Models3D_Root';
      this.group = this.rootGroup;

      this.towersGroup = new THREE.Group();
      this.towersGroup.name = 'TD_Towers3D';
      this.soldiersGroup = new THREE.Group();
      this.soldiersGroup.name = 'TD_Soldiers3D';
      this.enemiesGroup = new THREE.Group();
      this.enemiesGroup.name = 'TD_Enemies3D';
      this.fxLinksGroup = new THREE.Group();
      this.fxLinksGroup.name = 'TD_BossLinks3D';

      this.rootGroup.add(this.towersGroup, this.soldiersGroup, this.enemiesGroup, this.fxLinksGroup);
      if (this.parentContainer) {
        this.parentContainer.add(this.rootGroup);
      }

      // Constant-slot Balrog dynamic PointLight (intensity=0 when inactive -> zero shader recompiles!)
      this.balrogLight = new THREE.PointLight(0xff5200, 0, 28, 1.5);
      this.balrogLight.castShadow = false;
      this.balrogLight.position.set(0, -50, 0);
      this.rootGroup.add(this.balrogLight);

      // Reusable 3D Dark-Fire Curse Tether Beam (Boss -> Cursed Tower)
      this.curseTetherMesh = new THREE.Mesh(this.cache.geos.tetherBeam, this.cache.mats.tetherPhase2);
      this.curseTetherMesh.visible = false;
      this.curseTetherMesh.frustumCulled = false;
      this.fxLinksGroup.add(this.curseTetherMesh);

      this.curseTetherCore = new THREE.Mesh(this.cache.geos.tetherBeam, this.cache.mats.anorFlame);
      this.curseTetherCore.visible = false;
      this.curseTetherCore.frustumCulled = false;
      this.curseTetherCore.userData.noShadow = true;
      this.fxLinksGroup.add(this.curseTetherCore);

      // Active Instance Maps & Reusable Pools
      this.activeTowers = new Map();
      this.activeSoldiers = new Map();
      this.activeEnemies = new Map();

      this.towerPools = new Map();
      this.soldierPools = new Map();
      this.enemyPools = new Map();

      this.hitVolumes = [];

      this._seenTowers = new Set();
      this._seenSoldiers = new Set();
      this._seenEnemies = new Set();
      this._vecA = new THREE.Vector3();
      this._vecB = new THREE.Vector3();
      this._vecDir = new THREE.Vector3();
      this._upAxis = new THREE.Vector3(0, 1, 0);
      this._quat = new THREE.Quaternion();
      this._disposed = false;
    }

    // Standalone Studio Mesh Methods (instance)
    createStandaloneTowerMesh(key, tier = 1, branch = null, opts = {}) {
      if (this._disposed) this._reinitAfterDispose();
      return buildStandaloneTowerMeshInternal(this.cache, key, tier, branch, opts);
    }

    createStandaloneSoldierMesh(variant = 'guard', opts = {}) {
      if (this._disposed) this._reinitAfterDispose();
      return buildStandaloneSoldierMeshInternal(this.cache, variant, opts);
    }

    createStandaloneEnemyMesh(key, opts = {}) {
      if (this._disposed) this._reinitAfterDispose();
      return buildStandaloneEnemyMeshInternal(this.cache, key, opts);
    }

    getGroundY(gx, gy) {
      if (this.scene3d && typeof this.scene3d.getTerrainHeight === 'function') {
        const y = this.scene3d.getTerrainHeight(gx, gy);
        if (typeof y === 'number' && !Number.isNaN(y)) return y;
      }
      return 0;
    }

    getHitObjects() {
      return this.hitVolumes;
    }

    getRaycastTargets() {
      return this.hitVolumes;
    }

    getTowerMuzzleWorld(tower, outVec) {
      const out = outVec || new this.THREE.Vector3();
      if (!tower) return out.set(0, 2.5, 0);
      const wx = gxToWx(tower.x);
      const wz = gyToWz(tower.y);
      const wy = this.getGroundY(tower.x, tower.y);
      const entry = this.activeTowers.get(tower.id);
      const mh = entry && entry.rig ? entry.rig.muzzleHeight : 4.5;
      return out.set(wx, wy + mh, wz);
    }

    update(a, b, c) {
      if (a && typeof a === 'object' && (a.towers || a.enemies)) {
        this.sync(a, typeof b === 'number' ? b : 0.016, typeof c === 'number' ? c : 0);
      } else {
        const dt = typeof a === 'number' ? a : 0.016;
        const time = typeof b === 'number' ? b : 0;
        const game = (c && typeof c === 'object') ? c : (b && typeof b === 'object' ? b : null);
        this.sync(game, dt, time);
      }
    }

    _reinitAfterDispose() {
      const THREE = this.THREE;
      this.cache = new ModelAssetCache(THREE);
      this.towersGroup.clear();
      this.soldiersGroup.clear();
      this.enemiesGroup.clear();
      this.fxLinksGroup.clear();

      this.curseTetherMesh = new THREE.Mesh(this.cache.geos.tetherBeam, this.cache.mats.tetherPhase2);
      this.curseTetherMesh.visible = false;
      this.curseTetherMesh.frustumCulled = false;
      this.fxLinksGroup.add(this.curseTetherMesh);

      this.curseTetherCore = new THREE.Mesh(this.cache.geos.tetherBeam, this.cache.mats.anorFlame);
      this.curseTetherCore.visible = false;
      this.curseTetherCore.frustumCulled = false;
      this.curseTetherCore.userData.noShadow = true;
      this.fxLinksGroup.add(this.curseTetherCore);

      if (this.parentContainer && !this.rootGroup.parent) {
        this.parentContainer.add(this.rootGroup);
      }
      this._disposed = false;
    }

    sync(game, dt, time) {
      if (this._disposed) {
        this._reinitAfterDispose();
      }
      const safeDt = clamp(typeof dt === 'number' ? dt : 0.016, 0, 0.1);
      const now = typeof time === 'number' ? time : (performance.now() * 0.001);

      this._syncTowersAndSoldiers(game, safeDt, now);
      this._syncEnemies(game, safeDt, now);
    }

    _acquireTowerRig(variantKey) {
      let pool = this.towerPools.get(variantKey);
      if (pool && pool.length > 0) {
        const rig = pool.pop();
        rig.group.visible = true;
        if (rig.rallyGroup) rig.rallyGroup.visible = true;
        return rig;
      }
      if (this.cache._standaloneTowers) {
        for (let i = 0; i < this.cache._standaloneTowers.length; i++) {
          const cand = this.cache._standaloneTowers[i];
          if (cand && cand.variantKey === variantKey && cand.group && !cand.group.parent) {
            this.cache._standaloneTowers.splice(i, 1);
            cand.group.visible = true;
            cand.group.position.set(0, 0, 0);
            cand.group.rotation.set(0, 0, 0);
            cand.group.scale.setScalar(1);
            if (cand.hitMesh) cand.hitMesh.visible = true;
            if (cand.status && cand.status.group) {
              cand.status.group.visible = true;
              if (cand.status.curseGroup) cand.status.curseGroup.visible = false;
              if (cand.status.stunGroup) cand.status.stunGroup.visible = false;
              if (cand.status.ringHalo) cand.status.ringHalo.visible = false;
            }
            this.towersGroup.add(cand.group);
            if (cand.rallyGroup) {
              cand.rallyGroup.visible = true;
              this.towersGroup.add(cand.rallyGroup);
            }
            return cand;
          }
        }
      }
      const rig = createTowerRigByVariant(variantKey, this.cache);
      this.towersGroup.add(rig.group);
      if (rig.rallyGroup) {
        this.towersGroup.add(rig.rallyGroup);
      }
      return rig;
    }

    _releaseTowerRig(rig) {
      if (!rig) return;
      rig.group.visible = false;
      if (rig.rallyGroup) rig.rallyGroup.visible = false;
      tagTowerHierarchy(rig.group, null);
      let pool = this.towerPools.get(rig.variantKey);
      if (!pool) {
        pool = [];
        this.towerPools.set(rig.variantKey, pool);
      }
      pool.push(rig);
    }

    _acquireSoldierRig(variantKey) {
      let pool = this.soldierPools.get(variantKey);
      if (pool && pool.length > 0) {
        const rig = pool.pop();
        rig.group.visible = true;
        return rig;
      }
      if (this.cache._standaloneSoldiers) {
        for (let i = 0; i < this.cache._standaloneSoldiers.length; i++) {
          const cand = this.cache._standaloneSoldiers[i];
          if (cand && cand.variantKey === variantKey && cand.group && !cand.group.parent) {
            this.cache._standaloneSoldiers.splice(i, 1);
            cand.group.visible = true;
            cand.group.position.set(0, 0, 0);
            cand.group.rotation.set(0, 0, 0);
            if (cand.shieldDome) cand.shieldDome.visible = false;
            this.soldiersGroup.add(cand.group);
            return cand;
          }
        }
      }
      const rig = createSoldierRigByVariant(variantKey, this.cache);
      this.soldiersGroup.add(rig.group);
      return rig;
    }

    _releaseSoldierRig(rig) {
      if (!rig) return;
      setRigHitFlash(rig, false, this.cache.mats.hitFlash);
      rig.group.visible = false;
      let pool = this.soldierPools.get(rig.variantKey);
      if (!pool) {
        pool = [];
        this.soldierPools.set(rig.variantKey, pool);
      }
      pool.push(rig);
    }

    _acquireEnemyRig(type) {
      let pool = this.enemyPools.get(type);
      if (pool && pool.length > 0) {
        const rig = pool.pop();
        rig.group.visible = true;
        return rig;
      }
      if (this.cache._standaloneEnemies) {
        for (let i = 0; i < this.cache._standaloneEnemies.length; i++) {
          const cand = this.cache._standaloneEnemies[i];
          if (cand && cand.type === type && cand.group && !cand.group.parent) {
            this.cache._standaloneEnemies.splice(i, 1);
            cand.group.visible = true;
            cand.group.position.set(0, 0, 0);
            cand.group.rotation.set(0, 0, 0);
            cand.shroudState = -1;
            if (cand.groundShadow) cand.groundShadow.visible = true;
            this.enemiesGroup.add(cand.group);
            return cand;
          }
        }
      }
      const rig = createEnemyRigByType(type, this.cache);
      this.enemiesGroup.add(rig.group);
      return rig;
    }

    _releaseEnemyRig(rig) {
      if (!rig) return;
      setRigHitFlash(rig, false, this.cache.mats.hitFlash);
      rig.group.visible = false;
      let pool = this.enemyPools.get(rig.type);
      if (!pool) {
        pool = [];
        this.enemyPools.set(rig.type, pool);
      }
      pool.push(rig);
    }

    _getTowerVariantKey(tower) {
      const tier = tower.tier || 1;
      const branch = (tier === 3 && tower.branch) ? tower.branch : '0';
      return `${tower.type}_${tier}_${branch}`;
    }

    _getSoldierVariantKey(tower) {
      if (tower.tier === 3 && tower.branch === 'A') return 'phalanx_3A';
      if (tower.tier === 3 && tower.branch === 'B') return 'knight_3B';
      if (tower.tier === 2) return 'guard_2';
      return 'guard_1';
    }

    _syncTowersAndSoldiers(game, dt, time) {
      this._seenTowers.clear();
      this._seenSoldiers.clear();
      this.hitVolumes.length = 0;

      const ringActive = Boolean(game && game.ringActive);
      const towerProvider = this.cache.getTowerProvider();
      const list = (game && game.towers && Array.isArray(game.towers.towers))
        ? game.towers.towers
        : [];

      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        if (!t) continue;
        this._seenTowers.add(t.id);

        const variantKey = this._getTowerVariantKey(t);
        let entry = this.activeTowers.get(t.id);
        if (entry && entry.variantKey !== variantKey) {
          this._releaseTowerRig(entry.rig);
          entry = null;
        }
        if (!entry) {
          const rig = this._acquireTowerRig(variantKey);
          tagTowerHierarchy(rig.group, t);
          rig.hitMesh.userData.isTowerHitVolume = true;
          rig.hitMesh.userData.isTower = true;
          entry = {
            id: t.id,
            variantKey,
            rig,
            yaw: yawFromAngle2D(t.turretAngle || HALF_PI),
            upgradePop: 0.22
          };
          this.activeTowers.set(t.id, entry);
        } else {
          entry.rig.group.userData.isTower = true;
          entry.rig.group.userData.tower = t;
          entry.rig.group.userData.towerId = t.id;
          entry.rig.group.userData.padId = t.padId;
          entry.rig.hitMesh.userData.isTower = true;
          entry.rig.hitMesh.userData.tower = t;
          entry.rig.hitMesh.userData.towerId = t.id;
          entry.rig.hitMesh.userData.padId = t.padId;
        }

        this.hitVolumes.push(entry.rig.hitMesh);

        const rig = entry.rig;
        const wx = gxToWx(t.x);
        const wz = gyToWz(t.y);
        const wy = this.getGroundY(t.x, t.y);
        rig.group.position.set(wx, wy, wz);

        if (entry.upgradePop > 0) {
          entry.upgradePop = Math.max(0, entry.upgradePop - dt);
          const popScale = 1 + Math.sin((entry.upgradePop / 0.22) * Math.PI) * 0.08;
          rig.group.scale.setScalar(popScale);
        } else {
          rig.group.scale.setScalar(1);
        }
        rig.hitMesh.updateWorldMatrix(true, false);

        t.muzzleHeight3D = rig.muzzleHeight;
        t._muzzleWorldY = wy + rig.muzzleHeight;

        let aimAngle2D = t.turretAngle || HALF_PI;
        if (t.beamTarget && !t.beamTarget.dead) {
          aimAngle2D = Math.atan2(t.beamTarget.y - t.y, t.beamTarget.x - t.x);
        }
        const targetYaw = yawFromAngle2D(aimAngle2D);
        entry.yaw = lerpAngle(entry.yaw, targetYaw, Math.min(1, dt * 14));

        const recoil = clamp((t.recoilTimer || 0) / 0.35, 0, 1);

        // Allow custom TowerModels3D animation hook if provided, PLUS standard pivot animations
        if (typeof rig.update === 'function') {
          rig.update(t, dt, time, { yaw: entry.yaw, recoil, ringActive });
        } else if (towerProvider && typeof towerProvider.updateTowerRig === 'function') {
          towerProvider.updateTowerRig(rig, t, dt, time, { yaw: entry.yaw, recoil, ringActive });
        } else {
          this._animateStandardTowerRig(rig, t, entry.yaw, recoil, time);
        }

        // Garrison soldiers & road rally formation ring
        if (rig.type === 'garrison') {
          const rp = t.rallyPoint || { x: t.x, y: t.y + 52 };
          if (rig.rallyGroup) {
            const rwx = gxToWx(rp.x);
            const rwz = gyToWz(rp.y);
            const rwy = this.getGroundY(rp.x, rp.y);
            rig.rallyGroup.position.set(rwx, rwy + 0.04, rwz);
            if (rig.tauntRing) {
              rig.tauntRing.rotation.z = time * 0.25;
            }
          }

          const sList = t.soldiers || t.guards || [];
          const sVariant = this._getSoldierVariantKey(t);
          for (let j = 0; j < sList.length; j++) {
            const s = sList[j];
            if (!s) continue;
            this._syncSingleSoldier(s, t, sVariant, dt, time, towerProvider);
          }
        }

        // 3D Tower Status Overlays (Ring Buff Halo, Black Breath Stun Shroud, Wave 15 Boss Curse 3-Chains)
        const st = rig.status;
        if (st) {
          const isCursed = (t.curseClicksRemaining || 0) > 0 && (t.stunTimer === undefined || t.stunTimer > 0);
          const isStunned = !isCursed && (t.stunTimer || 0) > 0;

          if (st.group) st.group.visible = true;
          if (st.ringHalo) {
            st.ringHalo.visible = ringActive && !isCursed && !isStunned;
            if (st.ringHalo.visible) {
              st.ringHalo.rotation.z = time * 0.9;
            }
          }

          if (st.stunGroup) {
            st.stunGroup.visible = isStunned;
            if (isStunned && st.stunRings) {
              for (let r = 0; r < st.stunRings.length; r++) {
                st.stunRings[r].rotation.z = time * (r % 2 === 0 ? 2.2 : -2.2);
              }
            }
          }

          if (st.curseGroup) {
            st.curseGroup.visible = isCursed;
            if (isCursed) {
              const clicksLeft = clamp(t.curseClicksRemaining || 1, 1, 3);
              if (st.chains) {
                for (let c = 0; c < st.chains.length; c++) {
                  const chain = st.chains[c];
                  chain.visible = c < clicksLeft;
                  chain.rotation.z = time * (c % 2 === 0 ? 2.6 : -2.6);
                }
              }
              if (st.beacon) {
                const pulse = 0.85 + 0.30 * Math.sin(time * 11);
                st.beacon.scale.set(0.52 * pulse, 5.2, 0.52 * pulse);
              }
              if (st.topSigil) {
                st.topSigil.rotation.y = time * 3.5;
                st.topSigil.position.y = 7.5 + Math.sin(time * 6) * 0.22;
              }
            }
          }
        }
      }

      for (const [id, entry] of this.activeTowers.entries()) {
        if (!this._seenTowers.has(id)) {
          this._releaseTowerRig(entry.rig);
          this.activeTowers.delete(id);
        }
      }

      for (const [sid, sEntry] of this.activeSoldiers.entries()) {
        if (!this._seenSoldiers.has(sid)) {
          this._releaseSoldierRig(sEntry.rig);
          this.activeSoldiers.delete(sid);
        }
      }
    }

    _animateStandardTowerRig(rig, t, yaw, recoil, time) {
      if (rig.type === 'elven') {
        if (rig.aimPivot) rig.aimPivot.rotation.y = yaw;
        const pullZ = recoil > 0 ? (0.14 * Math.sin(recoil * Math.PI)) : (-0.10 - 0.04 * Math.sin(time * 3.2 + t.id));
        if (rig.archers) {
          for (let a = 0; a < rig.archers.length; a++) {
            const ar = rig.archers[a];
            if (!ar) continue;
            if (ar.bowGroup) ar.bowGroup.position.z = (ar.baseBowZ !== undefined ? ar.baseBowZ : 0.32) - recoil * 0.10;
            if (ar.arrowShaft) {
              ar.arrowShaft.position.z = (ar.baseArrowZ !== undefined ? ar.baseArrowZ : -0.16) + pullZ;
              ar.arrowShaft.visible = recoil < 0.72;
            }
          }
        }
        if (rig.starlightCrystal) {
          rig.starlightCrystal.rotation.y = time * 1.6;
          if (rig.starlightCrystalBaseY === undefined) rig.starlightCrystalBaseY = rig.starlightCrystal.position.y;
          rig.starlightCrystal.position.y = rig.starlightCrystalBaseY + Math.sin(time * 2.4 + t.id) * 0.14;
        }
        if (rig.starlightRing1) {
          rig.starlightRing1.rotation.x = time * 1.1;
          rig.starlightRing1.rotation.y = time * 0.8;
        }
        if (rig.starlightRing2) {
          rig.starlightRing2.rotation.z = -time * 1.4;
        }
      } else if (rig.type === 'garrison') {
        const rp = t.rallyPoint || { x: t.x, y: t.y + 52 };
        const gateAng = Math.atan2(rp.y - t.y, rp.x - t.x);
        rig.group.rotation.y = yawFromAngle2D(gateAng);

        const openAmt = clamp(t.gateOpenTimer || 0, 0, 1);
        if (rig.doorPivotL) rig.doorPivotL.rotation.y = -openAmt * 1.25;
        if (rig.doorPivotR) rig.doorPivotR.rotation.y = openAmt * 1.25;
        if (rig.portcullis) {
          if (rig.portcullisBaseY === undefined) rig.portcullisBaseY = rig.portcullis.position.y;
          rig.portcullis.position.y = rig.portcullisBaseY + openAmt * 0.85;
        }
        if (rig.bannerPivot) {
          rig.bannerPivot.rotation.x = Math.sin(time * 2.6 + t.id) * 0.07;
        }
        if (rig.banners && rig.banners.length > 0) {
          for (let b = 0; b < rig.banners.length; b++) {
            if (rig.banners[b]) rig.banners[b].rotation.x = Math.sin(time * 2.6 + t.id + b) * 0.07;
          }
        }
        if (rig.brazierFlame) {
          const flick = 0.92 + 0.16 * Math.sin(time * 13 + t.id * 2.1);
          rig.brazierFlame.scale.setScalar(flick);
        }
      } else if (rig.type === 'dwarven') {
        if (rig.aimPivot) rig.aimPivot.rotation.y = yaw;
        if (rig.armPivot) {
          let armAngle = -0.48;
          if (recoil > 0) {
            const u = 1 - recoil;
            armAngle = u < 0.25 ? lerp(-0.48, 1.34, u / 0.25) : lerp(1.34, -0.48, (u - 0.25) / 0.75);
          }
          rig.armPivot.rotation.x = armAngle;
          if (rig.windlass) rig.windlass.rotation.x = -armAngle * 1.8;
          if (rig.payloadBoulder) {
            rig.payloadBoulder.visible = recoil < 0.14 && (t.stunTimer || 0) <= 0;
          }
        } else if (rig.barrelRecoilGroup) {
          if (rig.baseBarrelZ === undefined) rig.baseBarrelZ = rig.barrelRecoilGroup.position.z;
          rig.barrelRecoilGroup.position.z = rig.baseBarrelZ - recoil * 0.58;
          if (rig.muzzleFlashMesh) {
            const showFlash = (t.muzzleFlashTimer || 0) > 0.05;
            rig.muzzleFlashMesh.visible = showFlash;
            if (showFlash) {
              const fs = 0.55 + (t.muzzleFlashTimer || 0) * 1.4;
              rig.muzzleFlashMesh.scale.set(fs, fs, fs * 1.3);
            }
          }
        } else if (rig.prodL && rig.prodR) {
          const snap = recoil > 0 ? (-0.30 * recoil) : 0.12;
          rig.prodL.rotation.y = -snap;
          rig.prodR.rotation.y = snap;
          if (rig.loadedBolts) {
            if (rig.baseBoltZ === undefined) rig.baseBoltZ = rig.loadedBolts.position.z;
            rig.loadedBolts.visible = recoil < 0.45;
            rig.loadedBolts.position.z = rig.baseBoltZ - recoil * 0.45;
          }
        }
      } else if (rig.type === 'istari') {
        if (rig.aimPivot) rig.aimPivot.rotation.y = yaw;
        const ramp = t.beamRampMult || 1.0;
        if (rig.apexCrystal) {
          rig.apexCrystal.rotation.y = time * 1.8;
          if (rig.baseApexY === undefined) rig.baseApexY = rig.apexCrystal.position.y;
          if (rig.baseApexScale === undefined) rig.baseApexScale = rig.apexCrystal.scale.x || 1.0;
          if (t.tier === 3 && t.branch === 'A') {
            const pulse = rig.baseApexScale * (1.0 + (ramp - 1.0) * 0.12 + Math.sin(time * 9) * 0.05);
            rig.apexCrystal.scale.setScalar(pulse);
          } else {
            rig.apexCrystal.position.y = rig.baseApexY + Math.sin(time * 2.6 + t.id) * 0.12;
          }
        }
        if (rig.orbitGroup1) {
          rig.orbitGroup1.rotation.y = time * (t.branch === 'B' ? 2.6 : 1.35);
          rig.orbitGroup1.rotation.z = Math.sin(time * 1.4 + t.id) * 0.25;
        }
        if (rig.orbitGroup2) {
          rig.orbitGroup2.rotation.x = -time * 1.9;
          rig.orbitGroup2.rotation.y = time * 1.1;
        }
        if (rig.orbitGroup3) {
          rig.orbitGroup3.rotation.z = time * 1.65;
          rig.orbitGroup3.rotation.x = Math.cos(time * 1.2 + t.id) * 0.30;
        }
      }
    }

    _syncSingleSoldier(s, tower, variantKey, dt, time, towerProvider) {
      if (s.dead || (s.hp !== undefined && s.hp <= 0)) {
        return;
      }
      this._seenSoldiers.add(s.id);

      let entry = this.activeSoldiers.get(s.id);
      if (entry && entry.variantKey !== variantKey) {
        this._releaseSoldierRig(entry.rig);
        entry = null;
      }
      if (!entry) {
        const rig = this._acquireSoldierRig(variantKey);
        if (rig.isKnight && rig.horseMeshes && rig.horseMeshes.length > 0) {
          const coatMat = this.cache.mats.horseCoats[(s.slotIndex || 0) % this.cache.mats.horseCoats.length];
          for (let h = 0; h < rig.horseMeshes.length; h++) {
            rig.horseMeshes[h].material = coatMat;
            rig.horseMeshes[h].userData.baseMat = coatMat;
          }
        }
        entry = {
          id: s.id,
          variantKey,
          rig,
          prevX: s.x,
          prevY: s.y,
          yaw: s.facing >= 0 ? HALF_PI : -HALF_PI
        };
        this.activeSoldiers.set(s.id, entry);
      }

      const rig = entry.rig;
      const wx = gxToWx(s.x);
      const wz = gyToWz(s.y);
      const wy = this.getGroundY(s.x, s.y);
      rig.group.position.set(wx, wy, wz);

      s._worldY = wy;
      s._height3D = rig.isKnight ? 2.95 : 2.60;

      const dxMove = s.x - entry.prevX;
      const dyMove = s.y - entry.prevY;
      const moveDist = Math.hypot(dxMove, dyMove);
      entry.prevX = s.x;
      entry.prevY = s.y;

      let targetYaw = entry.yaw;
      if (s.engagedEnemy && !s.engagedEnemy.dead) {
        const ea = Math.atan2(s.engagedEnemy.y - s.y, s.engagedEnemy.x - s.x);
        targetYaw = yawFromAngle2D(ea);
      } else if (moveDist > 0.06) {
        targetYaw = yawFromAngle2D(Math.atan2(dyMove, dxMove));
      } else {
        targetYaw = (s.facing >= 0) ? HALF_PI : -HALF_PI;
      }
      entry.yaw = lerpAngle(entry.yaw, targetYaw, Math.min(1, dt * 14));
      rig.group.rotation.y = entry.yaw;

      const phase = s.walkPhase || 0;
      const isMoving = moveDist > 0.04;
      const atk = clamp(s.attackAnim || 0, 0, 1);
      const atkSwing = Math.sin(atk * Math.PI);

      if (rig.shieldDome) {
        rig.shieldDome.visible = (s.shieldWallTimer || 0) > 0;
        if (rig.shieldDome.visible) {
          const sp = 1.0 + 0.07 * Math.sin(time * 12);
          rig.shieldDome.scale.set(1.05 * sp, 1.35 * sp, 1.05 * sp);
        }
      }

      if (typeof rig.update === 'function') {
        rig.update(s, dt, time, { isMoving, phase, atkSwing });
      } else if (towerProvider && typeof towerProvider.updateSoldierRig === 'function') {
        towerProvider.updateSoldierRig(rig, s, dt, time, { isMoving, phase, atkSwing });
      } else if (rig.isKnight) {
        const amp = isMoving ? 0.62 : 0.06;
        if (rig.horseLegs.length >= 4) {
          rig.horseLegs[0].rotation.x = Math.sin(phase) * amp;
          rig.horseLegs[1].rotation.x = Math.sin(phase + 0.7) * amp;
          rig.horseLegs[2].rotation.x = Math.sin(phase + Math.PI) * amp;
          rig.horseLegs[3].rotation.x = Math.sin(phase + Math.PI + 0.7) * amp;
        }
        const surge = (s.surgeAnimTimer || 0) > 0 ? Math.sin(s.surgeAnimTimer * 9) * 0.22 : 0;
        if (rig.bodyRoot) {
          if (rig.baseBodyY === undefined) rig.baseBodyY = rig.bodyRoot.position.y;
          rig.bodyRoot.position.y = rig.baseBodyY + (isMoving ? Math.abs(Math.sin(phase)) * 0.14 : 0) + Math.max(0, surge * 0.4);
          rig.bodyRoot.rotation.x = -surge + (isMoving ? Math.cos(phase) * 0.07 : 0);
        }
        if (rig.neckGroup) rig.neckGroup.rotation.x = Math.sin(phase) * 0.10;
        if (rig.weaponPivot) {
          if (rig.baseWeaponZ === undefined) rig.baseWeaponZ = rig.weaponPivot.position.z;
          rig.weaponPivot.position.z = rig.baseWeaponZ + atkSwing * 0.58;
        }
      } else {
        const stride = isMoving ? Math.sin(phase) * 0.56 : 0;
        if (rig.legL) rig.legL.rotation.x = stride;
        if (rig.legR) rig.legR.rotation.x = -stride;
        if (rig.bodyRoot) {
          if (rig.baseBodyY === undefined) rig.baseBodyY = rig.bodyRoot.position.y;
          rig.bodyRoot.position.y = rig.baseBodyY + (isMoving ? Math.abs(Math.sin(phase)) * 0.09 : 0);
        }
        const shieldBrace = (s.shieldWallTimer || 0) > 0 ? 0.12 : 0;
        if (rig.shieldPivot && rig.shieldPivot !== rig.armL) {
          if (rig.baseShieldZ === undefined) rig.baseShieldZ = rig.shieldPivot.position.z;
          rig.shieldPivot.position.z = rig.baseShieldZ + shieldBrace + atkSwing * 0.10;
        }
        if (rig.weaponPivot) {
          if (rig.baseWeaponRotX === undefined) rig.baseWeaponRotX = rig.weaponPivot.rotation.x;
          if (rig.baseWeaponZ === undefined) rig.baseWeaponZ = rig.weaponPivot.position.z;
          rig.weaponPivot.rotation.x = rig.baseWeaponRotX + atkSwing * 0.62;
          rig.weaponPivot.position.z = rig.baseWeaponZ + atkSwing * 0.28;
        }
      }
    }

    _syncEnemies(game, dt, time) {
      this._seenEnemies.clear();
      const ringActive = Boolean(game && game.ringActive);
      const flashMat = this.cache.mats.hitFlash;
      const enemyProvider = this.cache.getEnemyProvider();

      let activeBalrogLightSet = false;
      let activeTetherSet = false;

      const list = (game && game.enemies && Array.isArray(game.enemies.active))
        ? game.enemies.active
        : [];

      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e || e.dead || e.reachedExit || e.hp <= 0) continue;
        this._seenEnemies.add(e.id);

        let entry = this.activeEnemies.get(e.id);
        if (entry && entry.type !== e.type) {
          this._releaseEnemyRig(entry.rig);
          entry = null;
        }
        if (!entry) {
          const rig = this._acquireEnemyRig(e.type);
          entry = {
            id: e.id,
            type: e.type,
            rig,
            yaw: yawFromAngle2D(e.angle || 0),
            prevHitTimer: 0,
            flashTimer: 0,
            flashCooldown: 0
          };
          this.activeEnemies.set(e.id, entry);
        }

        const rig = entry.rig;
        const wx = gxToWx(e.x);
        const wz = gyToWz(e.y);
        const groundY = this.getGroundY(e.x, e.y);

        const targetYaw = yawFromAngle2D(e.angle || 0);
        entry.yaw = lerpAngle(entry.yaw, targetYaw, Math.min(1, dt * 15));

        rig.group.position.set(wx, groundY, wz);
        rig.group.rotation.y = entry.yaw;

        // Crisp, cooldown-gated impact hit-flash (40ms metallic glint on fresh hits, never white-washing under beams!)
        if (entry.flashCooldown > 0) entry.flashCooldown = Math.max(0, entry.flashCooldown - dt);
        if (entry.flashTimer > 0) entry.flashTimer = Math.max(0, entry.flashTimer - dt);
        const rawHit = e.hitFlashTimer || 0;
        if (rawHit > entry.prevHitTimer + 0.015 && entry.flashCooldown <= 0 && rig.type !== 'balrog') {
          entry.flashTimer = 0.042;
          entry.flashCooldown = 0.30;
        }
        entry.prevHitTimer = rawHit;
        setRigHitFlash(rig, entry.flashTimer > 0, flashMat);

        const walk = e.walkPhase || 0;
        const atkRatio = clamp((e.attackAnimTimer || 0) / 0.28, 0, 1);
        const atkPulse = Math.sin(atkRatio * Math.PI);
        const stunned = (e.stunTimer || 0) > 0;

        let unitWorldY = groundY;
        let unitHeight3D = rig.height3D || 2.1;

        const handledCustom = (typeof rig.update === 'function')
          ? (rig.update(e, dt, time, { walk, atkRatio, atkPulse, stunned, ringActive }) === true)
          : ((enemyProvider && typeof enemyProvider.updateEnemyRig === 'function')
            ? (enemyProvider.updateEnemyRig(rig, e, dt, time, { walk, atkRatio, atkPulse, stunned, ringActive }) === true)
            : false);

        switch (rig.type) {
          case 'goblin': {
            if (!handledCustom) {
              const scurry = stunned ? 0 : Math.sin(walk * 1.55) * 0.72;
              if (rig.legL) rig.legL.rotation.x = scurry;
              if (rig.legR) rig.legR.rotation.x = -scurry;
              if (rig.armL) rig.armL.rotation.x = -scurry * 0.7;
              if (rig.armR) rig.armR.rotation.x = scurry * 0.7 - atkPulse * 1.15;
              if (rig.bodyRoot) {
                if (rig.baseBodyY === undefined) rig.baseBodyY = rig.bodyRoot.position.y;
                rig.bodyRoot.position.y = rig.baseBodyY + (stunned ? 0 : Math.abs(Math.sin(walk * 1.55)) * 0.10);
              }
            }
            break;
          }

          case 'orc': {
            if (!handledCustom) {
              const march = stunned ? 0 : Math.sin(walk) * 0.58;
              const cleave = meleeArmPitch(e.attackAnimTimer, 0.28);
              if (rig.legL) rig.legL.rotation.x = march;
              if (rig.legR) rig.legR.rotation.x = -march;
              if (rig.armL) rig.armL.rotation.x = -march * 0.35;
              if (rig.armR) rig.armR.rotation.x = cleave !== 0 ? cleave * 0.78 : (march * 0.45);
              if (rig.bodyRoot) {
                if (rig.baseBodyY === undefined) rig.baseBodyY = rig.bodyRoot.position.y;
                rig.bodyRoot.position.y = rig.baseBodyY + (stunned ? 0 : Math.abs(Math.sin(walk)) * 0.09);
              }
            }
            break;
          }

          case 'uruk': {
            const rate = e.enraged ? 1.35 : 1.0;
            if (!handledCustom) {
              const stride = stunned ? 0 : Math.sin(walk * rate) * 0.64;
              const cleave = meleeArmPitch(e.attackAnimTimer, 0.28);
              if (rig.legL) rig.legL.rotation.x = stride;
              if (rig.legR) rig.legR.rotation.x = -stride;
              if (rig.armL) rig.armL.rotation.x = cleave !== 0 ? cleave * 0.72 : (stride * 0.35);
              if (rig.armR) rig.armR.rotation.x = cleave !== 0 ? cleave * 0.92 : (-stride * 0.35);
              if (rig.bodyRoot) {
                if (rig.baseBodyY === undefined) rig.baseBodyY = rig.bodyRoot.position.y;
                rig.bodyRoot.position.y = rig.baseBodyY + (stunned ? 0 : Math.abs(Math.sin(walk * rate)) * 0.11);
              }
            }

            const enraged = Boolean(e.enraged);
            if (rig.enragedApplied !== enraged && rig.armorMeshes && rig.armorMeshes.length > 0) {
              rig.enragedApplied = enraged;
              const targetArmorMat = enraged ? this.cache.mats.urukEnragedArmor : (rig.baseArmorMat || this.cache.mats.ironDark);
              for (let k = 0; k < rig.armorMeshes.length; k++) {
                if (!rig.baseArmorMat && rig.armorMeshes[k].userData.baseMat) {
                  rig.baseArmorMat = rig.armorMeshes[k].userData.baseMat;
                }
                rig.armorMeshes[k].userData.baseMat = targetArmorMat;
                if (!rig._flashed) rig.armorMeshes[k].material = targetArmorMat;
              }
            }
            if (rig.rageAura) {
              rig.rageAura.visible = enraged;
              if (enraged) {
                rig.rageAura.rotation.y = time * 4.2;
                const rs = 1.0 + 0.12 * Math.sin(time * 12);
                rig.rageAura.scale.setScalar(rs);
              }
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

            if (!handledCustom) {
              const gallop = walk * 1.25;
              if (rig.wargLegs.length >= 4) {
                if (jumpY > 0.05) {
                  rig.wargLegs[0].rotation.x = -0.85;
                  rig.wargLegs[1].rotation.x = -0.72;
                  rig.wargLegs[2].rotation.x = 0.85;
                  rig.wargLegs[3].rotation.x = 0.75;
                } else {
                  const amp = stunned ? 0 : 0.68;
                  rig.wargLegs[0].rotation.x = Math.sin(gallop) * amp;
                  rig.wargLegs[1].rotation.x = Math.sin(gallop + 0.6) * amp;
                  rig.wargLegs[2].rotation.x = Math.sin(gallop + Math.PI) * amp;
                  rig.wargLegs[3].rotation.x = Math.sin(gallop + Math.PI + 0.6) * amp;
                }
              }
              if (rig.jawPivot) {
                rig.jawPivot.rotation.x = jumpY > 0.05 ? 0.42 : (0.10 + atkPulse * 0.38 + Math.abs(Math.sin(time * 5 + e.id)) * 0.12);
              }
              if (rig.jumpGroup) {
                rig.jumpGroup.position.y = jumpY + (stunned || jumpY > 0 ? 0 : Math.abs(Math.sin(gallop)) * 0.14);
                rig.jumpGroup.rotation.x = jumpPitch + (jumpY > 0 ? 0 : Math.cos(gallop) * 0.07);
              }
              if (rig.tailPivot) rig.tailPivot.rotation.y = Math.sin(time * 7 + e.id) * 0.28;
              if (rig.spearPivot) {
                if (rig.baseSpearZ === undefined) rig.baseSpearZ = rig.spearPivot.position.z;
                rig.spearPivot.position.z = rig.baseSpearZ + atkPulse * 0.52;
              }
            }
            unitWorldY = groundY + jumpY;
            break;
          }

          case 'troll': {
            if (!handledCustom) {
              const stomp = stunned ? 0 : Math.sin(walk * 0.72);
              if (rig.legL) rig.legL.rotation.x = stomp * 0.48;
              if (rig.legR) rig.legR.rotation.x = -stomp * 0.48;
              if (rig.bodyRoot) {
                if (rig.baseBodyY === undefined) rig.baseBodyY = rig.bodyRoot.position.y;
                rig.bodyRoot.position.y = rig.baseBodyY + Math.abs(stomp) * 0.14;
                rig.bodyRoot.rotation.z = stomp * 0.06;
                rig.bodyRoot.rotation.x = 0.06 + (atkRatio > 0 ? atkPulse * 0.20 : 0);
              }
              if (atkRatio > 0) {
                const smash = meleeArmPitch(e.attackAnimTimer, 0.28);
                if (rig.armR) rig.armR.rotation.x = smash;
                if (rig.armL) rig.armL.rotation.x = smash * 0.55;
              } else {
                if (rig.armR) rig.armR.rotation.x = -stomp * 0.25;
                if (rig.armL) rig.armL.rotation.x = stomp * 0.28;
              }
            }
            const regenerating = e.hp < e.maxHp * 0.99 && (e.fireSuppressTimer || 0) <= 0;
            if (rig.regenRing) {
              rig.regenRing.visible = regenerating;
              if (regenerating) rig.regenRing.rotation.z = time * 1.2;
            }
            break;
          }

          case 'wraith': {
            const hover = 0.30 + Math.sin(time * 3.4 + (e.animSeed || 0)) * 0.16;
            if (!handledCustom) {
              if (rig.floatGroup) {
                rig.floatGroup.position.y = hover;
                rig.floatGroup.rotation.z = Math.sin(time * 2.2 + (e.animSeed || 0)) * 0.08;
              }
              if (rig.swordPivot) rig.swordPivot.rotation.x = -atkPulse * 0.95;
              if (rig.ribbons) {
                for (let r = 0; r < rig.ribbons.length; r++) {
                  if (rig.ribbons[r]) rig.ribbons[r].rotation.x = 0.42 + Math.sin(time * 5.5 + r * 1.3) * 0.22;
                }
              }
            }

            const revealed = ringActive || (e.revealedTimer || 0) > 0;
            const desiredState = (e.dodgeFlashTimer || 0) > 0 ? 2 : (revealed ? 1 : 0);
            if (!handledCustom && rig.shroudState !== desiredState && rig.shroudMeshes && rig.shroudMeshes.length > 0) {
              rig.shroudState = desiredState;
              for (let s = 0; s < rig.shroudMeshes.length; s++) {
                const sm = rig.shroudMeshes[s];
                if (!sm.userData.origShroudMat) {
                  sm.userData.origShroudMat = sm.material;
                }
                const targetMat = desiredState === 2
                  ? this.cache.mats.wraithDodge
                  : (desiredState === 1 ? this.cache.mats.wraithRevealed : sm.userData.origShroudMat);
                sm.userData.baseMat = targetMat;
                if (!rig._flashed) sm.material = targetMat;
              }
            }
            if (rig.revealGroup) {
              rig.revealGroup.visible = revealed;
              if (revealed) {
                if (rig.revRing) rig.revRing.rotation.z = time * 2.2;
                if (rig.revEye) {
                  rig.revEye.rotation.y = time * 3.0;
                  rig.revEye.position.y = 2.68 + hover * 0.6;
                }
              }
            }
            unitWorldY = groundY + hover;
            break;
          }

          case 'fellbeast': {
            const flapSpeed = stunned ? 1.5 : 5.4;
            const flap = Math.sin(time * flapSpeed + (e.animSeed || 0));
            const flyBob = 6.5 + flap * -0.28;
            if (!handledCustom) {
              if (rig.flyer) {
                rig.flyer.position.y = flyBob;
                rig.flyer.rotation.z = Math.sin(time * 1.9 + (e.animSeed || 0)) * 0.12;
              }
              const innerAng = flap * 0.54;
              const outerAng = Math.sin(time * flapSpeed - 0.65 + (e.animSeed || 0)) * 0.46;
              animateWingPair(rig.wingL, rig.wingR, innerAng, outerAng, undefined, undefined);
              if (rig.tailPivot) rig.tailPivot.rotation.y = Math.sin(time * 4.2 + (e.animSeed || 0)) * 0.20;
            }
            if (rig.groundShadow) {
              rig.groundShadow.visible = true;
              const shadowScale = 1.35 + flap * 0.22;
              rig.groundShadow.scale.set(shadowScale, shadowScale, 1);
            }
            unitWorldY = groundY + flyBob;
            unitHeight3D = 1.45;
            break;
          }

          case 'ringwraith': {
            if (!handledCustom) {
              const glide = Math.sin(walk * 0.8 + time * 2.0) * 0.08;
              if (rig.bodyRoot) {
                if (rig.baseBodyY === undefined) rig.baseBodyY = rig.bodyRoot.position.y;
                rig.bodyRoot.position.y = rig.baseBodyY + 0.06 + Math.abs(glide);
              }
              if (rig.swordArm) rig.swordArm.rotation.x = -0.22 - atkPulse * 1.15;
              if (rig.leftArm) rig.leftArm.rotation.x = 0.15 + Math.sin(time * 2.5) * 0.12;
              if (rig.ring1) rig.ring1.rotation.z = time * 1.5;
              if (rig.ring2) rig.ring2.rotation.y = -time * 2.1;
              if (rig.breathAura) {
                const breathSoon = (e.blackBreathTimer || 8) < 1.2 ? 1.25 : 1.0;
                rig.breathAura.scale.setScalar(breathSoon + 0.06 * Math.sin(time * 6));
              }
            }
            break;
          }

          case 'balrog': {
            const isPhase2 = (e.phase === 2) || Boolean(e.phase2Triggered);
            if (rig.phase1Group) rig.phase1Group.visible = !isPhase2;
            if (rig.phase2Group) rig.phase2Group.visible = isPhase2;
            if (typeof rig.setPhase === 'function') rig.setPhase(isPhase2 ? 2 : 1);

            if (!isPhase2) {
              unitHeight3D = 6.15;
              if (!handledCustom) {
                const stride = stunned ? 0 : Math.sin(walk * 0.65);
                if (rig.p1Body) rig.p1Body.position.y = Math.abs(stride) * 0.12;
                if (rig.p1ArmL) rig.p1ArmL.rotation.x = -0.18 - stride * 0.2;
                if (rig.p1ArmR) rig.p1ArmR.rotation.x = -0.25 - atkPulse * 1.35;
                if (rig.flailChainPivot) {
                  rig.flailChainPivot.rotation.z = Math.sin(time * 5.2) * 0.48;
                  rig.flailChainPivot.rotation.x = Math.cos(time * 5.2) * 0.35 + atkPulse * 0.85;
                }
                if (rig.p1Aura) rig.p1Aura.rotation.z = time * 1.4;
              }
            } else {
              unitHeight3D = 8.65;
              const tTrans = clamp((e.transformTimer || 0) / 0.85, 0, 1);
              if (rig.phase2Group) {
                const baseS = rig.baseP2Scale || 1.0;
                const eruptScale = (tTrans > 0 ? lerp(1.0, 0.58, tTrans) : 1.0) * baseS;
                rig.phase2Group.scale.setScalar(eruptScale);
              }

              if (!handledCustom) {
                const stomp = stunned ? 0 : Math.sin(walk * 0.70);
                if (rig.bLegL) rig.bLegL.rotation.x = stomp * 0.46;
                if (rig.bLegR) rig.bLegR.rotation.x = -stomp * 0.46;
                if (rig.p2Body) {
                  rig.p2Body.position.y = Math.abs(stomp) * 0.18;
                  rig.p2Body.rotation.z = stomp * 0.05;
                }

                const wFlap = Math.sin(time * 3.2);
                animateWingPair(
                  rig.bWingL || rig.wingL,
                  rig.bWingR || rig.wingR,
                  0.28 + wFlap * 0.22,
                  undefined,
                  -0.16 + wFlap * 0.34,
                  wFlap * 0.28
                );

                if (rig.bArmR) rig.bArmR.rotation.x = -0.28 - atkPulse * 1.38;
                if (rig.bArmL) rig.bArmL.rotation.x = -0.22 - Math.sin(time * 3.8) * 0.25;
                if (rig.whipPivot) {
                  rig.whipPivot.rotation.y = Math.sin(time * 5.4) * 0.42;
                  rig.whipPivot.rotation.x = Math.cos(time * 4.6) * 0.24 - atkPulse * 0.65;
                }
                if (rig.magmaCore) {
                  if (rig.baseMagmaScale === undefined) rig.baseMagmaScale = rig.magmaCore.scale.clone();
                  const corePulse = 1.0 + 0.08 * Math.sin(time * 9.5);
                  rig.magmaCore.scale.copy(rig.baseMagmaScale).multiplyScalar(corePulse);
                }
                if (rig.p2FireRing) rig.p2FireRing.rotation.z = -time * 1.6;
              }

              if (!activeBalrogLightSet) {
                activeBalrogLightSet = true;
                this.balrogLight.position.set(wx, groundY + 5.2, wz);
                this.balrogLight.intensity = 1.65 + Math.sin(time * 9.5) * 0.28 + (tTrans > 0 ? 0.85 : 0);
              }
            }

            // 3D Dark-Fire / Morgul Tether Beam to actively cursed tower
            const ct = e.cursedTower;
            if (
              !activeTetherSet &&
              ct &&
              (ct.curseClicksRemaining || 0) > 0 &&
              (ct.stunTimer === undefined || ct.stunTimer > 0)
            ) {
              activeTetherSet = true;
              const startY = groundY + (isPhase2 ? 3.8 : 2.9);
              const endWx = gxToWx(ct.x);
              const endWz = gyToWz(ct.y);
              const endWy = this.getGroundY(ct.x, ct.y) + 3.6;

              this._vecA.set(wx, startY, wz);
              this._vecB.set(endWx, endWy, endWz);
              this._vecDir.subVectors(this._vecB, this._vecA);
              const dist = this._vecDir.length();

              if (dist > 0.1) {
                this._vecDir.divideScalar(dist);
                this._quat.setFromUnitVectors(this._upAxis, this._vecDir);

                this.curseTetherMesh.visible = true;
                this.curseTetherMesh.material = isPhase2
                  ? this.cache.mats.tetherPhase2
                  : this.cache.mats.tetherPhase1;
                this.curseTetherMesh.position.copy(this._vecA);
                this.curseTetherMesh.quaternion.copy(this._quat);
                const beamW = 1.0 + 0.32 * Math.sin(time * 16);
                this.curseTetherMesh.scale.set(beamW, dist, beamW);

                this.curseTetherCore.visible = true;
                this.curseTetherCore.position.copy(this._vecA);
                this.curseTetherCore.quaternion.copy(this._quat);
                this.curseTetherCore.scale.set(0.45 * beamW, dist, 0.45 * beamW);
              }
            }
            break;
          }
        }

        e._worldY = unitWorldY;
        e._height3D = unitHeight3D;
      }

      if (!activeBalrogLightSet) {
        this.balrogLight.intensity = 0;
        this.balrogLight.position.set(0, -50, 0);
      }
      if (!activeTetherSet) {
        this.curseTetherMesh.visible = false;
        this.curseTetherCore.visible = false;
      }

      for (const [id, entry] of this.activeEnemies.entries()) {
        if (!this._seenEnemies.has(id)) {
          this._releaseEnemyRig(entry.rig);
          this.activeEnemies.delete(id);
        }
      }
    }

    reset() {
      for (const [, entry] of this.activeTowers.entries()) {
        this._releaseTowerRig(entry.rig);
      }
      this.activeTowers.clear();

      for (const [, entry] of this.activeSoldiers.entries()) {
        this._releaseSoldierRig(entry.rig);
      }
      this.activeSoldiers.clear();

      for (const [, entry] of this.activeEnemies.entries()) {
        this._releaseEnemyRig(entry.rig);
      }
      this.activeEnemies.clear();

      this.hitVolumes.length = 0;
      this.balrogLight.intensity = 0;
      this.balrogLight.position.set(0, -50, 0);
      this.curseTetherMesh.visible = false;
      this.curseTetherCore.visible = false;
    }

    clear() {
      this.reset();
    }

    dispose() {
      if (this._disposed) return;
      this.reset();
      this._disposed = true;

      if (this.rootGroup.parent) {
        this.rootGroup.parent.remove(this.rootGroup);
      }
      this.towerPools.clear();
      this.soldierPools.clear();
      this.enemyPools.clear();

      this.cache.dispose();
    }
  }

  // Static Studio Helper Methods on TD.Models3D (mirrors instance API!)
  Models3D.createStandaloneTowerMesh = function(key, tier = 1, branch = null, opts = {}) {
    return buildStandaloneTowerMeshInternal(getStaticAssetCache(), key, tier, branch, opts);
  };

  Models3D.createStandaloneSoldierMesh = function(variant = 'guard', opts = {}) {
    return buildStandaloneSoldierMeshInternal(getStaticAssetCache(), variant, opts);
  };

  Models3D.createStandaloneEnemyMesh = function(key, opts = {}) {
    return buildStandaloneEnemyMeshInternal(getStaticAssetCache(), key, opts);
  };

  Models3D.ModelAssetCache = ModelAssetCache;
  TD.Models3D = Models3D;
})(window.TD = window.TD || {});
