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

  // Deterministic integer hash -> [0, 1) for procedural PBR maps
  function hash2(x, y, seed) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // ============================================================================
  // 1. CANONICAL VARIANT MANIFESTS (FOR 3D PORTRAIT STUDIO & QA INSPECTOR)
  // ============================================================================
  const TOWER_VARIANTS = [
    { key: 'elven_1_0', variantKey: 'elven_1_0', type: 'elven', typeKey: 'elven', tier: 1, branch: null, variant: '1_0', name: 'Elven Watchtower', label: 'Elven T1' },
    { key: 'elven_2_0', variantKey: 'elven_2_0', type: 'elven', typeKey: 'elven', tier: 2, branch: null, variant: '2_0', name: 'Noldorin Watchtower', label: 'Elven T2' },
    { key: 'elven_3_A', variantKey: 'elven_3_A', type: 'elven', typeKey: 'elven', tier: 3, branch: 'A', variant: '3_A', name: 'Galadhrim Longbows', label: 'Elven 3A: Galadhrim' },
    { key: 'elven_3_B', variantKey: 'elven_3_B', type: 'elven', typeKey: 'elven', tier: 3, branch: 'B', variant: '3_B', name: 'Mirkwood Wardens', label: 'Elven 3B: Mirkwood' },

    { key: 'garrison_1_0', variantKey: 'garrison_1_0', type: 'garrison', typeKey: 'garrison', tier: 1, branch: null, variant: '1_0', name: 'Garrison of Men', label: 'Garrison T1' },
    { key: 'garrison_2_0', variantKey: 'garrison_2_0', type: 'garrison', typeKey: 'garrison', tier: 2, branch: null, variant: '2_0', name: 'Bastion of the West', label: 'Garrison T2' },
    { key: 'garrison_3_A', variantKey: 'garrison_3_A', type: 'garrison', typeKey: 'garrison', tier: 3, branch: 'A', variant: '3_A', name: 'Tower Guard Phalanx', label: 'Garrison 3A: Phalanx' },
    { key: 'garrison_3_B', variantKey: 'garrison_3_B', type: 'garrison', typeKey: 'garrison', tier: 3, branch: 'B', variant: '3_B', name: 'Knights of the Riddermark', label: 'Garrison 3B: Riddermark' },

    { key: 'dwarven_1_0', variantKey: 'dwarven_1_0', type: 'dwarven', typeKey: 'dwarven', tier: 1, branch: null, variant: '1_0', name: 'Dwarven Siege Foundry', label: 'Dwarven T1' },
    { key: 'dwarven_2_0', variantKey: 'dwarven_2_0', type: 'dwarven', typeKey: 'dwarven', tier: 2, branch: null, variant: '2_0', name: 'Khazad Great Catapult', label: 'Dwarven T2' },
    { key: 'dwarven_3_A', variantKey: 'dwarven_3_A', type: 'dwarven', typeKey: 'dwarven', tier: 3, branch: 'A', variant: '3_A', name: 'Iron Hills Mortar', label: 'Dwarven 3A: Mortar' },
    { key: 'dwarven_3_B', variantKey: 'dwarven_3_B', type: 'dwarven', typeKey: 'dwarven', tier: 3, branch: 'B', variant: '3_B', name: 'Khazad Ballista', label: 'Dwarven 3B: Ballista' },

    { key: 'istari_1_0', variantKey: 'istari_1_0', type: 'istari', typeKey: 'istari', tier: 1, branch: null, variant: '1_0', name: 'Istari Spire', label: 'Istari T1' },
    { key: 'istari_2_0', variantKey: 'istari_2_0', type: 'istari', typeKey: 'istari', tier: 2, branch: null, variant: '2_0', name: 'White Council Conclave', label: 'Istari T2' },
    { key: 'istari_3_A', variantKey: 'istari_3_A', type: 'istari', typeKey: 'istari', tier: 3, branch: 'A', variant: '3_A', name: 'Flame of Anor', label: 'Istari 3A: Flame of Anor' },
    { key: 'istari_3_B', variantKey: 'istari_3_B', type: 'istari', typeKey: 'istari', tier: 3, branch: 'B', variant: '3_B', name: 'Stormcaller Council', label: 'Istari 3B: Stormcaller' }
  ];

  const SOLDIER_VARIANTS = [
    { key: 'guard', variantKey: 'guard_1', name: 'Citadel Guard', label: 'Citadel Guard' },
    { key: 'phalanx', variantKey: 'phalanx_3A', name: 'Tower Guard Phalanx', label: 'Tower Guard Phalanx' },
    { key: 'knight', variantKey: 'knight_3B', name: 'Knights of the Riddermark', label: 'Rohirrim Knight' }
  ];

  // ============================================================================
  // 2. SCULPTURAL GEOMETRY GENERATORS (VARIABLE-RADIUS TUBES, DRAPED BANNERS,
  //    CURVED SHIELDS, FEATHERED WINGS, ROOF SHINGLES & ANATOMICAL ARMOR)
  // ============================================================================
  function createTaperedTubeGeo(THREE, points, tubularSegs, radialSegs, radiusFn, closedCaps) {
    const curve = (points && points.isCurve) ? points : new THREE.CatmullRomCurve3(points);
    const frames = curve.computeFrenetFrames(tubularSegs, false);
    const ringVerts = radialSegs + 1;
    const positions = [];
    const uvs = [];
    const indices = [];

    const p = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    const bin = new THREE.Vector3();
    const vtx = new THREE.Vector3();

    for (let i = 0; i <= tubularSegs; i++) {
      const t = i / tubularSegs;
      curve.getPointAt(t, p);
      nrm.copy(frames.normals[i]);
      bin.copy(frames.binormals[i]);

      const rSpec = radiusFn(t);
      const rx = typeof rSpec === 'number' ? rSpec : rSpec.rx;
      const ry = typeof rSpec === 'number' ? rSpec : rSpec.ry;

      for (let j = 0; j <= radialSegs; j++) {
        const v = j / radialSegs;
        const ang = v * TWO_PI;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);

        vtx.copy(p)
          .addScaledVector(nrm, ca * rx)
          .addScaledVector(bin, sa * ry);
        positions.push(vtx.x, vtx.y, vtx.z);
        uvs.push(v, t);
      }
    }

    for (let i = 0; i < tubularSegs; i++) {
      for (let j = 0; j < radialSegs; j++) {
        const a = i * ringVerts + j;
        const b = (i + 1) * ringVerts + j;
        const c = (i + 1) * ringVerts + (j + 1);
        const d = i * ringVerts + (j + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    if (closedCaps !== false) {
      const pStart = curve.getPointAt(0);
      const startCenterIdx = positions.length / 3;
      positions.push(pStart.x, pStart.y, pStart.z);
      uvs.push(0.5, 0);
      for (let j = 0; j < radialSegs; j++) {
        indices.push(startCenterIdx, j + 1, j);
      }

      const pEnd = curve.getPointAt(1);
      const endCenterIdx = positions.length / 3;
      const ringOffset = tubularSegs * ringVerts;
      positions.push(pEnd.x, pEnd.y, pEnd.z);
      uvs.push(0.5, 1);
      for (let j = 0; j < radialSegs; j++) {
        indices.push(endCenterIdx, ringOffset + j, ringOffset + j + 1);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  // Draped heraldic banner hanging downward from y = 0 to y = -1 with pointed tail & cloth pleats
  function createDrapedBannerGeo(THREE, swallowtail) {
    const segX = 8;
    const segY = 14;
    const geo = new THREE.PlaneGeometry(1, 1, segX, segY);
    geo.translate(0, -0.5, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);       // -0.5 .. +0.5
      let y = pos.getY(i);         //  0.0 .. -1.0
      const down = -y;             //  0.0 ..  1.0
      const ax = Math.abs(x) * 2;  //  0.0 ..  1.0

      // Pointed V-tip or swallowtail notch along the bottom edge
      if (down > 0.72) {
        const f = (down - 0.72) / 0.28;
        if (swallowtail) {
          y -= f * ax * 0.14 - f * (1 - ax) * 0.10;
        } else {
          y -= f * (1 - ax) * 0.18;
        }
      }

      // Vertical fabric folds + gentle breeze billow along +Z
      const pleat = Math.sin(x * Math.PI * 3.0) * 0.032 * Math.pow(down, 0.7);
      const billow = Math.sin(down * Math.PI * 1.15) * 0.065 + down * down * 0.035;
      pos.setXYZ(i, x * (1 - down * 0.04), y, pleat + billow);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // Flowing pleated shoulder cloak hanging from neck/shoulders (y = 0) down to hem (y = -1)
  function createFlowingCloakGeo(THREE) {
    const segX = 8;
    const segY = 10;
    const geo = new THREE.PlaneGeometry(1, 1, segX, segY);
    geo.translate(0, -0.5, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) * 2;   // -1 .. +1
      const down = -pos.getY(i);   //  0 .. +1
      const width = lerp(0.56, 1.08, Math.pow(down, 0.75));
      const x = u * 0.5 * width;
      const archZ = -Math.cos(u * 1.15) * lerp(0.11, 0.16, down) - down * down * 0.14;
      const pleat = Math.cos(u * Math.PI * 2.5) * 0.025 * down;
      const hemDrop = -Math.cos(u * HALF_PI) * 0.06 * down;
      pos.setXYZ(i, x, -down + hemDrop, archZ + pleat);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // Sculpted curved Gondor Heater / Kite Shield (+Z outward face)
  function createHeaterShieldGeo(THREE) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.24, 0.36);
    shape.quadraticCurveTo(0, 0.40, 0.24, 0.36);
    shape.lineTo(0.23, 0.05);
    shape.quadraticCurveTo(0.19, -0.22, 0.0, -0.40);
    shape.quadraticCurveTo(-0.19, -0.22, -0.23, 0.05);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.042,
      bevelEnabled: true,
      bevelThickness: 0.016,
      bevelSize: 0.016,
      bevelSegments: 2,
      curveSegments: 10
    });
    geo.translate(0, 0, -0.021);

    // Curve shield cylindrically around vertical axis so front face bulges toward +Z
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const bend = (0.065 - x * x * 1.15);
      pos.setZ(i, z + bend);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // Massive curved rectangular Gondor Tower Shield / Pavise (+Z outward face)
  function createTowerPaviseGeo(THREE) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.28, 0.56);
    shape.quadraticCurveTo(0, 0.63, 0.28, 0.56);
    shape.lineTo(0.28, -0.46);
    shape.quadraticCurveTo(0.18, -0.58, 0.0, -0.62);
    shape.quadraticCurveTo(-0.18, -0.58, -0.28, -0.46);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.018,
      bevelSegments: 2,
      curveSegments: 10
    });
    geo.translate(0, 0, -0.025);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const bend = (0.095 - x * x * 1.25);
      pos.setZ(i, z + bend);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // Sculpted Mallorn Leaf Blade (sprouts upward along +Y and arches outward along +Z)
  function createMallornLeafGeo(THREE) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.15, 0.18, 0.19, 0.58, 0, 1.0);
    shape.bezierCurveTo(-0.19, 0.58, -0.15, 0.18, 0, 0);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.028,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 1,
      curveSegments: 8
    });
    geo.translate(0, 0, -0.014);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const arch = Math.sin(y * Math.PI * 0.72) * 0.14 - y * y * 0.08;
      const cup = Math.abs(x) * 0.16;
      pos.setZ(i, z + arch - cup);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // Feathered Gondorian Gull-Wing / Fountain Swan-Wing Crest (sweeps up +Y and back -Z)
  function createHelmWingGeo(THREE) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.02, 0.22, -0.08, 0.44);
    shape.quadraticCurveTo(-0.20, 0.64, -0.34, 0.78);
    // 4 scalloped primary feather tips along trailing edge
    shape.quadraticCurveTo(-0.26, 0.58, -0.36, 0.50);
    shape.quadraticCurveTo(-0.22, 0.40, -0.31, 0.31);
    shape.quadraticCurveTo(-0.17, 0.23, -0.24, 0.14);
    shape.quadraticCurveTo(-0.10, 0.06, 0, 0);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.022,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: 1,
      curveSegments: 6
    });
    geo.translate(0, 0, -0.011);
    // Rotate so Y stays up and negative shape-X sweeps backward along -Z
    geo.rotateY(-HALF_PI);
    geo.computeVertexNormals();
    return geo;
  }

  // Stylized Anglo-Saxon / Rohirrim Horse-Head Gable Finial (+Z facing profile)
  function createRohanHorseCrestGeo(THREE) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.12, 0.0);
    shape.lineTo(0.10, 0.0);
    shape.quadraticCurveTo(0.16, 0.24, 0.10, 0.46);
    shape.lineTo(0.32, 0.40);      // lower jaw
    shape.lineTo(0.36, 0.49);      // muzzle tip
    shape.lineTo(0.14, 0.62);      // nasal bridge
    shape.lineTo(0.18, 0.76);      // pointed ear tip
    shape.lineTo(0.06, 0.68);      // poll
    shape.quadraticCurveTo(-0.14, 0.58, -0.18, 0.30); // arched mane scroll
    shape.quadraticCurveTo(-0.16, 0.14, -0.12, 0.0);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 1,
      curveSegments: 8
    });
    geo.translate(0, 0, -0.03);
    geo.rotateY(-HALF_PI); // face +Z
    geo.computeVertexNormals();
    return geo;
  }

  // Stepped Dwarven Siege Bombard Carriage Cheek (+Z forward)
  function createCarriageCheekGeo(THREE) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.98, 0.0);
    shape.lineTo(0.86, 0.0);
    shape.lineTo(0.92, 0.56);
    shape.quadraticCurveTo(0.68, 0.96, 0.34, 1.06);
    // Trunnion saddle notch
    shape.absarc(0.06, 1.04, 0.20, 0, Math.PI, true);
    shape.lineTo(-0.34, 0.96);
    shape.lineTo(-0.56, 0.68);
    shape.lineTo(-0.82, 0.48);
    shape.lineTo(-0.98, 0.24);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.24,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 1,
      curveSegments: 8
    });
    geo.translate(0, 0, -0.12);
    geo.rotateY(-HALF_PI); // +shapeX -> +Z forward!
    geo.computeVertexNormals();
    return geo;
  }

  // Gothic Flying Buttress Pier + Arch Rib (local +Z points outward from tower center)
  function createFlyingButtressGeo(THREE) {
    const shape = new THREE.Shape();
    shape.moveTo(0.0, 0.95);
    shape.quadraticCurveTo(0.45, 0.92, 0.66, 0.0);
    shape.lineTo(0.96, 0.0);
    shape.lineTo(0.92, 2.35);
    shape.lineTo(0.68, 2.52);
    shape.quadraticCurveTo(0.36, 2.75, 0.0, 2.95);
    shape.lineTo(0.0, 2.42);
    shape.quadraticCurveTo(0.38, 2.24, 0.60, 1.65);
    shape.quadraticCurveTo(0.44, 1.32, 0.0, 1.38);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.22,
      bevelEnabled: true,
      bevelThickness: 0.022,
      bevelSize: 0.022,
      bevelSegments: 1,
      curveSegments: 8
    });
    geo.translate(0, 0, -0.11);
    geo.rotateY(-HALF_PI); // +shapeX -> +Z outward!
    geo.computeVertexNormals();
    return geo;
  }

  // Pointed Gothic Lancet Window / Arch Panel (+Z facing)
  function createLancetArchGeo(THREE, width, height, depth) {
    const hw = width * 0.5;
    const springY = height * 0.60;
    const shape = new THREE.Shape();
    shape.moveTo(-hw, 0);
    shape.lineTo(hw, 0);
    shape.lineTo(hw, springY);
    shape.quadraticCurveTo(hw * 0.88, height * 0.86, 0, height);
    shape.quadraticCurveTo(-hw * 0.88, height * 0.86, -hw, springY);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: depth,
      bevelEnabled: true,
      bevelThickness: Math.min(0.02, depth * 0.25),
      bevelSize: Math.min(0.02, width * 0.06),
      bevelSegments: 1,
      curveSegments: 8
    });
    geo.translate(0, 0, -depth * 0.5);
    geo.computeVertexNormals();
    return geo;
  }

  // Pitched Mead-Hall Gable Roof Prism (ridge runs along Z from -halfLen to +halfLen, eaves at y=0, peak at y=height)
  function createPitchedGableRoofGeo(THREE, halfWidth, height, halfLen) {
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth, 0);
    shape.lineTo(-halfWidth + 0.14, -0.12);
    shape.lineTo(0, height - 0.14);
    shape.lineTo(halfWidth - 0.14, -0.12);
    shape.lineTo(halfWidth, 0);
    shape.quadraticCurveTo(halfWidth * 0.48, height * 0.56, 0, height + 0.08);
    shape.quadraticCurveTo(-halfWidth * 0.48, height * 0.56, -halfWidth, 0);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: halfLen * 2,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.03,
      bevelSegments: 1,
      curveSegments: 8
    });
    geo.translate(0, 0, -halfLen);
    geo.computeVertexNormals();
    return geo;
  }

  // Toothed Mechanical Dwarven Gear Wheel (in XY plane, thickness along Z)
  function createToothedGearGeo(THREE, outerR, innerR, teeth, thickness) {
    const shape = new THREE.Shape();
    const step = TWO_PI / teeth;
    for (let i = 0; i < teeth; i++) {
      const a0 = i * step;
      const a1 = a0 + step * 0.22;
      const a2 = a0 + step * 0.52;
      const a3 = a0 + step * 0.74;
      if (i === 0) {
        shape.moveTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
      } else {
        shape.lineTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
      }
      shape.lineTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
      shape.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
      shape.lineTo(Math.cos(a3) * innerR, Math.sin(a3) * innerR);
    }
    shape.closePath();

    const hole = new THREE.Path();
    hole.absarc(0, 0, innerR * 0.42, 0, TWO_PI, true);
    shape.holes.push(hole);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: thickness * 0.14,
      bevelSize: outerR * 0.03,
      bevelSegments: 1,
      curveSegments: 2
    });
    geo.translate(0, 0, -thickness * 0.5);
    geo.computeVertexNormals();
    return geo;
  }

  // Mirrors a BufferGeometry across X = 0 with reversed triangle winding so normals & shadows stay positive-scale
  function mirrorGeometryX(srcGeo) {
    const geo = srcGeo.clone();
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setX(i, -pos.getX(i));
    }
    if (geo.index) {
      const idx = geo.index.array;
      for (let i = 0; i < idx.length; i += 3) {
        const tmp = idx[i + 1];
        idx[i + 1] = idx[i + 2];
        idx[i + 2] = tmp;
      }
      geo.index.needsUpdate = true;
    } else {
      const arr = pos.array;
      for (let i = 0; i < arr.length; i += 9) {
        for (let k = 0; k < 3; k++) {
          const tmp = arr[i + 3 + k];
          arr[i + 3 + k] = arr[i + 6 + k];
          arr[i + 6 + k] = tmp;
        }
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  // ============================================================================
  // 3. SHARED PROCEDURAL PBR TEXTURE, MATERIAL & GEOMETRY ASSET CACHE
  // ============================================================================
  class TowerAssetCache {
    constructor(THREE, hostCache) {
      this.THREE = THREE;
      this.hostCache = hostCache || null;
      this.geometries = [];
      this.materials = [];
      this.textures = [];

      this.tex = {};
      this.mats = {};
      this.geos = {};

      this._buildTextures();
      this._buildMaterials();
      this._buildGeometries();
    }

    regGeo(g) {
      if (g) {
        this.geometries.push(g);
        if (this.hostCache && typeof this.hostCache.regGeo === 'function') {
          this.hostCache.regGeo(g);
        }
      }
      return g;
    }

    regMat(m) {
      if (m) {
        this.materials.push(m);
        if (this.hostCache && typeof this.hostCache.regMat === 'function') {
          this.hostCache.regMat(m);
        }
      }
      return m;
    }

    regTex(t) {
      if (t) {
        this.textures.push(t);
        if (this.hostCache && typeof this.hostCache.regTex === 'function') {
          this.hostCache.regTex(t);
        }
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

    _canvasToTexture(canvas, repeatX, repeatY, isSRGB, clampEdges) {
      const THREE = this.THREE;
      if (!canvas) return null;
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = clampEdges ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
      tex.wrapT = clampEdges ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
      if (!clampEdges && (repeatX || repeatY)) {
        tex.repeat.set(repeatX || 1, repeatY || 1);
      }
      if (isSRGB && THREE.SRGBColorSpace) {
        tex.colorSpace = THREE.SRGBColorSpace;
      }
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      return this.regTex(tex);
    }

    _buildTextures() {
      // 1. Dressed Ashlar Masonry (256x256 diffuse + mortar bump)
      const ashC = this._makeCanvas(256, 256);
      const ashBumpC = this._makeCanvas(256, 256);
      if (ashC && ashBumpC) {
        const ctx = ashC.getContext('2d');
        const bctx = ashBumpC.getContext('2d');
        ctx.fillStyle = '#8b8f96';
        ctx.fillRect(0, 0, 256, 256);
        bctx.fillStyle = '#262626';
        bctx.fillRect(0, 0, 256, 256);

        const rows = 8;
        const rowH = 256 / rows;
        for (let r = 0; r < rows; r++) {
          const y = r * rowH;
          const cols = (r % 2 === 0) ? 4 : 5;
          const off = (r % 2) * 26;
          const colW = 256 / cols;
          for (let c = -1; c <= cols; c++) {
            const x = c * colW + off;
            const n = hash2(c + 17, r + 9, 101);
            const warm = (hash2(c + 3, r + 31, 107) - 0.5) * 14;
            const v = Math.round(142 + n * 44);
            ctx.fillStyle = `rgb(${clamp(Math.round(v + warm), 90, 225)},${clamp(Math.round(v + warm * 0.4), 90, 222)},${clamp(Math.round(v - 4), 86, 218)})`;
            ctx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);

            // Top-left stone bevel highlight & bottom shadow
            ctx.fillStyle = 'rgba(255,255,255,0.14)';
            ctx.fillRect(x + 2, y + 2, colW - 4, 2);
            ctx.fillStyle = 'rgba(24,26,32,0.22)';
            ctx.fillRect(x + 2, y + rowH - 4, colW - 4, 2);

            const bv = Math.round(168 + n * 65);
            bctx.fillStyle = `rgb(${bv},${bv},${bv})`;
            bctx.fillRect(x + 3, y + 3, colW - 6, rowH - 6);
          }
        }
        // Chisel pockmarks & lichen speckle
        for (let i = 0; i < 900; i++) {
          const px = Math.floor(hash2(i, 3, 211) * 256);
          const py = Math.floor(hash2(i, 9, 211) * 256);
          const dark = hash2(i, 15, 211) > 0.48;
          ctx.fillStyle = dark ? 'rgba(30,33,38,0.20)' : 'rgba(240,244,248,0.16)';
          ctx.fillRect(px, py, 2, 2);
          bctx.fillStyle = dark ? 'rgba(60,60,60,0.35)' : 'rgba(245,245,245,0.25)';
          bctx.fillRect(px, py, 2, 2);
        }
        this.tex.ashlar = this._canvasToTexture(ashC, 2, 2, true, false);
        this.tex.ashlarBump = this._canvasToTexture(ashBumpC, 2, 2, false, false);
      }

      // 2. Carved Golden Mallorn Fluted Wood + Leaf Filigree Bump
      const malC = this._makeCanvas(256, 256);
      const malBumpC = this._makeCanvas(256, 256);
      if (malC && malBumpC) {
        const ctx = malC.getContext('2d');
        const bctx = malBumpC.getContext('2d');
        for (let x = 0; x < 256; x += 2) {
          const flute = Math.sin((x / 256) * TWO_PI * 8) * 0.5 + 0.5;
          const fine = Math.sin(x * 0.35) * 0.5 + 0.5;
          const n = hash2(x, 7, 307);
          const r = Math.round(162 + flute * 48 + fine * 14 + n * 14);
          const g = Math.round(126 + flute * 40 + fine * 12 + n * 10);
          const b = Math.round(62 + flute * 26 + fine * 8 + n * 8);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, 0, 2, 256);

          const bh = Math.round(95 + flute * 125 + fine * 28);
          bctx.fillStyle = `rgb(${bh},${bh},${bh})`;
          bctx.fillRect(x, 0, 2, 256);
        }
        // Subtle diagonal carved leaf-vein chevrons
        ctx.strokeStyle = 'rgba(255,236,178,0.22)';
        bctx.strokeStyle = 'rgba(245,245,245,0.42)';
        ctx.lineWidth = 2.2;
        bctx.lineWidth = 2.5;
        for (let y = 16; y < 256; y += 32) {
          for (let c = 0; c < 4; c++) {
            const cx = c * 64 + 32;
            ctx.beginPath();
            ctx.moveTo(cx, y + 14);
            ctx.lineTo(cx - 18, y - 6);
            ctx.moveTo(cx, y + 14);
            ctx.lineTo(cx + 18, y - 6);
            ctx.stroke();

            bctx.beginPath();
            bctx.moveTo(cx, y + 14);
            bctx.lineTo(cx - 18, y - 6);
            bctx.moveTo(cx, y + 14);
            bctx.lineTo(cx + 18, y - 6);
            bctx.stroke();
          }
        }
        this.tex.mallorn = this._canvasToTexture(malC, 1, 3, true, false);
        this.tex.mallornBump = this._canvasToTexture(malBumpC, 1, 3, false, false);
      }

      // 3. Hammered Bronze & Riveted Forged Iron Bump Map
      const metalBumpC = this._makeCanvas(256, 256);
      if (metalBumpC) {
        const bctx = metalBumpC.getContext('2d');
        bctx.fillStyle = '#888888';
        bctx.fillRect(0, 0, 256, 256);
        // Hammered planishing dimples
        for (let i = 0; i < 620; i++) {
          const x = hash2(i, 1, 409) * 256;
          const y = hash2(i, 2, 409) * 256;
          const rad = 3 + hash2(i, 3, 409) * 6;
          const v = Math.round(108 + hash2(i, 4, 409) * 68);
          bctx.fillStyle = `rgba(${v},${v},${v},0.36)`;
          bctx.beginPath();
          bctx.arc(x, y, rad, 0, TWO_PI);
          bctx.fill();
        }
        // Rivet seam strips
        bctx.fillStyle = '#484848';
        bctx.fillRect(0, 4, 256, 3);
        bctx.fillRect(0, 126, 256, 3);
        bctx.fillStyle = '#f2f2f2';
        for (let rx = 12; rx < 256; rx += 24) {
          bctx.beginPath();
          bctx.arc(rx, 16, 3.5, 0, TWO_PI);
          bctx.arc(rx, 138, 3.5, 0, TWO_PI);
          bctx.fill();
        }
        this.tex.hammeredBump = this._canvasToTexture(metalBumpC, 2, 2, false, false);
      }

      // 4. Scalloped Slate & Mead-Hall Roof Shingles (diffuse + strong underlap bump)
      const slateC = this._makeCanvas(256, 256);
      const rohanShingleC = this._makeCanvas(256, 256);
      const shingleBumpC = this._makeCanvas(256, 256);
      if (slateC && rohanShingleC && shingleBumpC) {
        const sctx = slateC.getContext('2d');
        const rctx = rohanShingleC.getContext('2d');
        const bctx = shingleBumpC.getContext('2d');

        sctx.fillStyle = '#1e2531';
        sctx.fillRect(0, 0, 256, 256);
        rctx.fillStyle = '#183b26';
        rctx.fillRect(0, 0, 256, 256);
        bctx.fillStyle = '#202020';
        bctx.fillRect(0, 0, 256, 256);

        const rows = 10;
        const rowH = 256 / rows;
        const cols = 8;
        const colW = 256 / cols;
        for (let r = 0; r < rows; r++) {
          const y = r * rowH;
          const off = (r % 2) * (colW * 0.5);
          for (let c = -1; c <= cols; c++) {
            const cx = c * colW + off + colW * 0.5;
            const n = hash2(c + 5, r + 13, 511);

            const sv = Math.round(44 + n * 28);
            sctx.fillStyle = `rgb(${sv},${sv + 8},${sv + 20})`;
            sctx.beginPath();
            sctx.rect(cx - colW * 0.46, y, colW * 0.92, rowH * 0.72);
            sctx.arc(cx, y + rowH * 0.72, colW * 0.46, 0, Math.PI);
            sctx.fill();
            sctx.strokeStyle = 'rgba(12,15,22,0.65)';
            sctx.lineWidth = 1.6;
            sctx.stroke();

            const rv = Math.round(34 + n * 26);
            rctx.fillStyle = `rgb(${rv},${rv + 44},${rv + 18})`;
            rctx.beginPath();
            rctx.rect(cx - colW * 0.46, y, colW * 0.92, rowH * 0.72);
            rctx.arc(cx, y + rowH * 0.72, colW * 0.46, 0, Math.PI);
            rctx.fill();
            rctx.strokeStyle = 'rgba(218,180,82,0.28)';
            rctx.lineWidth = 1.4;
            rctx.stroke();

            const bv = Math.round(135 + n * 95);
            bctx.fillStyle = `rgb(${bv},${bv},${bv})`;
            bctx.beginPath();
            bctx.rect(cx - colW * 0.44, y + 2, colW * 0.88, rowH * 0.68);
            bctx.arc(cx, y + rowH * 0.70, colW * 0.44, 0, Math.PI);
            bctx.fill();
          }
        }
        this.tex.slateShingles = this._canvasToTexture(slateC, 3, 4, true, false);
        this.tex.rohanShingles = this._canvasToTexture(rohanShingleC, 3, 3, true, false);
        this.tex.shingleBump = this._canvasToTexture(shingleBumpC, 3, 4, false, false);
      }

      // 5. Interlocking Steel Chainmail Texture & Bump
      const mailC = this._makeCanvas(128, 128);
      if (mailC) {
        const ctx = mailC.getContext('2d');
        ctx.fillStyle = '#383e47';
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = '#c4ced9';
        ctx.lineWidth = 2.2;
        for (let r = 0; r < 16; r++) {
          const y = r * 8 + 4;
          const off = (r % 2) * 6;
          for (let c = -1; c < 12; c++) {
            ctx.beginPath();
            ctx.arc(c * 12 + off, y, 4.8, 0, TWO_PI);
            ctx.stroke();
          }
        }
        this.tex.chainmail = this._canvasToTexture(mailC, 2, 2, true, false);
        this.tex.chainmailBump = this._canvasToTexture(mailC, 2, 2, false, false);
      }

      // 6. Dwarven Khazad Geometric Rune Relief Bump
      const runeBumpC = this._makeCanvas(256, 128);
      if (runeBumpC) {
        const bctx = runeBumpC.getContext('2d');
        bctx.fillStyle = '#707070';
        bctx.fillRect(0, 0, 256, 128);
        bctx.strokeStyle = '#ececec';
        bctx.lineWidth = 5;
        bctx.strokeRect(4, 10, 248, 108);
        for (let x = 16; x < 248; x += 48) {
          bctx.beginPath();
          bctx.moveTo(x + 20, 22);
          bctx.lineTo(x + 38, 64);
          bctx.lineTo(x + 20, 106);
          bctx.lineTo(x + 2, 64);
          bctx.closePath();
          bctx.stroke();
          bctx.strokeRect(x + 14, 52, 12, 24);
        }
        this.tex.dwarfRuneBump = this._canvasToTexture(runeBumpC, 3, 1, false, false);
      }

      // 7. Heraldic Banner 1: Gondor Royal Blue White Tree & Seven Stars (256x512)
      this.tex.gondorBanner = this._paintGondorBanner('#163360', '#0c1d38', '#dce6f2', '#f4f8ff');
      // 8. Heraldic Banner 2: Minas Tirith Citadel Raven-Black & Mithril Silver (Branch A)
      this.tex.citadelBanner = this._paintGondorBanner('#1a202b', '#0d1017', '#e3edf7', '#ffffff');
      // 9. Heraldic Banner 3: Rohirrim Emerald & Golden Sun-Horse (Branch B)
      this.tex.rohanBanner = this._paintRohanBanner();
      // 10. Heraldic Banner 4: Khazad Crimson & Gold Hammer-Anvil Banner (Dwarven)
      this.tex.dwarvenBanner = this._paintDwarvenBanner();

      // 11. Leaded Gothic Stained-Glass Lancet Window Map
      const glassC = this._makeCanvas(128, 256);
      if (glassC) {
        const ctx = glassC.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, '#fff4cc');
        grad.addColorStop(0.5, '#f2ba5c');
        grad.addColorStop(1, '#bd6a19');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 256);
        ctx.strokeStyle = '#252830';
        ctx.lineWidth = 4;
        for (let y = -128; y < 384; y += 32) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(128, y + 128);
          ctx.moveTo(128, y);
          ctx.lineTo(0, y + 128);
          ctx.stroke();
        }
        ctx.lineWidth = 7;
        ctx.strokeRect(4, 4, 120, 248);
        this.tex.stainedGlass = this._canvasToTexture(glassC, 1, 1, true, true);
      }
    }

    _paintGondorBanner(topHex, botHex, trimHex, treeHex) {
      const c = this._makeCanvas(256, 512);
      if (!c) return null;
      const ctx = c.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0, topHex);
      grad.addColorStop(0.65, botHex);
      grad.addColorStop(1, '#081121');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 512);

      // Woven linen micro-grain
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      for (let y = 0; y < 512; y += 4) ctx.fillRect(0, y, 256, 1);

      // Double silver filigree border
      ctx.strokeStyle = trimHex;
      ctx.lineWidth = 10;
      ctx.strokeRect(16, 16, 224, 468);
      ctx.lineWidth = 3;
      ctx.strokeRect(30, 30, 196, 440);

      // White Tree Trunk & Roots
      ctx.strokeStyle = treeHex;
      ctx.lineCap = 'round';
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(128, 380);
      ctx.lineTo(128, 214);
      ctx.stroke();

      ctx.lineWidth = 6.5;
      const roots = [[-54, 418], [-28, 430], [28, 430], [54, 418]];
      for (let i = 0; i < roots.length; i++) {
        ctx.beginPath();
        ctx.moveTo(128, 374);
        ctx.quadraticCurveTo(128 + roots[i][0] * 0.45, 408, 128 + roots[i][0], roots[i][1]);
        ctx.stroke();
      }

      // Graceful White Tree Crown Branches
      const boughs = [
        [128, 294, 56, 244], [128, 294, 200, 244],
        [128, 264, 46, 198], [128, 264, 210, 198],
        [128, 236, 72, 166], [128, 236, 184, 166],
        [128, 216, 128, 146]
      ];
      ctx.lineWidth = 7;
      for (let i = 0; i < boughs.length; i++) {
        const b = boughs[i];
        ctx.beginPath();
        ctx.moveTo(b[0], b[1]);
        ctx.quadraticCurveTo((b[0] + b[2]) * 0.5, b[3] + 28, b[2], b[3]);
        ctx.stroke();
      }

      // Seven Silver Stars in arch above the Tree
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 7; i++) {
        const ang = Math.PI + (i / 6) * Math.PI;
        const sx = 128 + Math.cos(ang) * 76;
        const sy = 152 + Math.sin(ang) * 56;
        ctx.beginPath();
        ctx.arc(sx, sy, 6.5, 0, TWO_PI);
        ctx.fill();
      }

      return this._canvasToTexture(c, 1, 1, true, true);
    }

    _paintRohanBanner() {
      const c = this._makeCanvas(256, 512);
      if (!c) return null;
      const ctx = c.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0, '#1f5734');
      grad.addColorStop(0.7, '#143b23');
      grad.addColorStop(1, '#0c2616');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 512);

      ctx.strokeStyle = '#ebd475';
      ctx.lineWidth = 10;
      ctx.strokeRect(16, 16, 224, 468);
      ctx.lineWidth = 3.5;
      ctx.strokeRect(30, 30, 196, 440);

      // 16-Ray Golden Sunburst
      ctx.save();
      ctx.translate(128, 236);
      ctx.fillStyle = '#f5cf64';
      for (let i = 0; i < 16; i++) {
        ctx.rotate(TWO_PI / 16);
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(0, -86);
        ctx.lineTo(8, 0);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 54, 0, TWO_PI);
      ctx.fill();
      ctx.fillStyle = '#18472b';
      ctx.beginPath();
      ctx.arc(0, 0, 42, 0, TWO_PI);
      ctx.fill();

      // White-Gold Coursing Stallion Silhouette
      ctx.fillStyle = '#fff0b3';
      ctx.beginPath();
      ctx.ellipse(-4, 6, 28, 14, -0.22, 0, TWO_PI);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(32, -28);
      ctx.lineTo(48, -18);
      ctx.lineTo(26, 10);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fff0b3';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-26, 4);
      ctx.quadraticCurveTo(-48, -10, -52, 16);
      ctx.moveTo(16, 14);
      ctx.lineTo(38, 34);
      ctx.moveTo(-18, 16);
      ctx.lineTo(-38, 36);
      ctx.stroke();
      ctx.restore();

      return this._canvasToTexture(c, 1, 1, true, true);
    }

    _paintDwarvenBanner() {
      const c = this._makeCanvas(256, 512);
      if (!c) return null;
      const ctx = c.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0, '#5e1d18');
      grad.addColorStop(1, '#2b0d0b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 512);

      ctx.strokeStyle = '#d9a84e';
      ctx.lineWidth = 10;
      ctx.strokeRect(16, 16, 224, 468);

      // Golden Warhammer & Anvil of Durin
      ctx.fillStyle = '#ebbf65';
      ctx.fillRect(76, 268, 104, 28);
      ctx.fillRect(96, 296, 64, 34);
      ctx.fillRect(72, 330, 112, 18);
      ctx.fillRect(120, 164, 16, 92);
      ctx.fillRect(88, 152, 80, 32);

      return this._canvasToTexture(c, 1, 1, true, true);
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

      // 1. Dressed Ashlar Masonry & Architectural Stones
      this.mats.ashlarStone = std({
        color: 0x9aa0a8,
        map: this.tex.ashlar || (ashlarSet && ashlarSet.map) || null,
        bumpMap: this.tex.ashlarBump || (ashlarSet && ashlarSet.bumpMap) || null,
        roughnessMap: (ashlarSet && ashlarSet.roughnessMap) || null,
        bumpScale: 0.12,
        roughness: 0.84,
        metalness: 0.06
      });
      this.mats.ashlarDark = std({
        color: 0x585e68,
        map: this.tex.ashlar || null,
        bumpMap: this.tex.ashlarBump || null,
        bumpScale: 0.10,
        roughness: 0.86,
        metalness: 0.10
      });
      this.mats.whiteMarble = std({
        color: 0xd5dbe3,
        map: this.tex.ashlar || (ashlarSet && ashlarSet.map) || null,
        bumpMap: this.tex.ashlarBump || null,
        bumpScale: 0.07,
        roughness: 0.62,
        metalness: 0.08
      });
      this.mats.dwarfRuneStone = std({
        color: 0x7b8088,
        map: this.tex.ashlar || null,
        bumpMap: this.tex.dwarfRuneBump || this.tex.ashlarBump || null,
        bumpScale: 0.14,
        roughness: 0.78,
        metalness: 0.14
      });
      this.mats.orthancObsidian = std({
        color: 0x1d222b,
        bumpMap: this.tex.ashlarBump || null,
        bumpScale: 0.06,
        roughness: 0.28,
        metalness: 0.56
      });

      // 2. Shingled Slate & Mead-Hall Roofs
      this.mats.slateShingles = std({
        color: 0x8ea0b8,
        map: this.tex.slateShingles || null,
        bumpMap: this.tex.shingleBump || null,
        bumpScale: 0.14,
        roughness: 0.62,
        metalness: 0.22
      });
      this.mats.rohanShingles = std({
        color: 0x9ed4ae,
        map: this.tex.rohanShingles || null,
        bumpMap: this.tex.shingleBump || null,
        bumpScale: 0.14,
        roughness: 0.68,
        metalness: 0.12
      });

      // 3. Carved Mallorn Woods & Oak Timbers
      this.mats.mallornBronze = std({
        color: 0xc9a055,
        map: this.tex.mallorn || null,
        bumpMap: this.tex.mallornBump || null,
        bumpScale: 0.09,
        roughness: 0.40,
        metalness: 0.46
      });
      this.mats.mallornGold = std({
        color: 0xe3bf70,
        map: this.tex.mallorn || null,
        bumpMap: this.tex.mallornBump || null,
        bumpScale: 0.09,
        roughness: 0.34,
        metalness: 0.58
      });
      this.mats.mallornSilver = std({
        color: 0xe4edf7,
        bumpMap: this.tex.mallornBump || null,
        bumpScale: 0.08,
        roughness: 0.28,
        metalness: 0.66
      });
      this.mats.mirkwoodBark = std({
        color: 0x6e5638,
        map: this.tex.mallorn || null,
        bumpMap: this.tex.mallornBump || null,
        bumpScale: 0.12,
        roughness: 0.72,
        metalness: 0.18
      });
      this.mats.timberOak = std({
        color: 0x8a613d,
        map: (timberSet && timberSet.map) || null,
        bumpMap: (timberSet && timberSet.bumpMap) || this.tex.mallornBump || null,
        bumpScale: 0.10,
        roughness: 0.80,
        metalness: 0.06
      });
      this.mats.darkLeather = std({
        color: 0x3b2618,
        roughness: 0.76,
        metalness: 0.08
      });

      // 4. Forged Metals, Hammered Bronze, Brass, Steel, Chainmail & Mithril
      this.mats.goldBurnished = std({
        color: 0xe6c163,
        bumpMap: this.tex.hammeredBump || (goldSet && goldSet.bumpMap) || null,
        roughnessMap: (goldSet && goldSet.roughnessMap) || null,
        bumpScale: 0.05,
        roughness: 0.28,
        metalness: 0.84
      });
      this.mats.goldRadiant = std({
        color: 0xf0cc70,
        emissive: 0x5c3b08,
        emissiveIntensity: 0.15,
        bumpMap: this.tex.hammeredBump || null,
        bumpScale: 0.04,
        roughness: 0.26,
        metalness: 0.84
      });
      this.mats.hammeredBronze = std({
        color: 0xb58142,
        bumpMap: this.tex.hammeredBump || null,
        bumpScale: 0.08,
        roughness: 0.35,
        metalness: 0.80
      });
      this.mats.copperCoil = std({
        color: 0xc97444,
        bumpMap: this.tex.hammeredBump || null,
        bumpScale: 0.06,
        roughness: 0.30,
        metalness: 0.85
      });
      this.mats.forgedDarkIron = std({
        color: 0x434a54,
        bumpMap: this.tex.hammeredBump || (ironSet && ironSet.bumpMap) || null,
        roughnessMap: (ironSet && ironSet.roughnessMap) || null,
        bumpScale: 0.08,
        roughness: 0.46,
        metalness: 0.78
      });
      this.mats.ironBlack = std({
        color: 0x20242b,
        bumpMap: this.tex.hammeredBump || null,
        bumpScale: 0.06,
        roughness: 0.44,
        metalness: 0.80
      });
      this.mats.steelBright = std({
        color: 0xcdd7e2,
        bumpMap: (ironSet && ironSet.bumpMap) || null,
        bumpScale: 0.04,
        roughness: 0.25,
        metalness: 0.86
      });
      this.mats.chainmail = std({
        color: 0xaab4bf,
        map: this.tex.chainmail || null,
        bumpMap: this.tex.chainmailBump || null,
        bumpScale: 0.10,
        roughness: 0.42,
        metalness: 0.78
      });
      this.mats.mithrilSilver = std({
        color: 0xeaf4ff,
        emissive: 0x1e3f63,
        emissiveIntensity: 0.24,
        roughness: 0.18,
        metalness: 0.90
      });

      // 5. Heraldic Cloths, Foliage & Mount Materials
      this.mats.elvenEmerald = std({
        color: 0x245e3f,
        roughness: 0.70,
        metalness: 0.08,
        side: THREE.DoubleSide
      });
      this.mats.lorienRoyalCloak = std({
        color: 0x1e3f66,
        roughness: 0.66,
        metalness: 0.14,
        side: THREE.DoubleSide
      });
      this.mats.mallornLeafGold = std({
        color: 0xd9b359,
        roughness: 0.36,
        metalness: 0.56,
        side: THREE.DoubleSide
      });
      this.mats.mallornLeafEmerald = std({
        color: 0x2d7349,
        roughness: 0.62,
        metalness: 0.12,
        side: THREE.DoubleSide
      });
      this.mats.gondorBlue = std({
        color: 0x1a3968,
        roughness: 0.74,
        metalness: 0.08,
        side: THREE.DoubleSide
      });
      this.mats.phalanxBlack = std({
        color: 0x171e29,
        roughness: 0.62,
        metalness: 0.24,
        side: THREE.DoubleSide
      });
      this.mats.rohanGreen = std({
        color: 0x245c36,
        roughness: 0.74,
        metalness: 0.08,
        side: THREE.DoubleSide
      });
      this.mats.wingFeatherWhite = std({
        color: 0xf2f6fa,
        roughness: 0.48,
        metalness: 0.16,
        side: THREE.DoubleSide
      });
      this.mats.ropeHemp = std({
        color: 0xb39562,
        roughness: 0.88,
        metalness: 0.02
      });

      this.mats.gondorBanner = std({
        color: 0xffffff,
        map: this.tex.gondorBanner || null,
        roughness: 0.76,
        metalness: 0.06,
        side: THREE.DoubleSide
      });
      this.mats.citadelBanner = std({
        color: 0xffffff,
        map: this.tex.citadelBanner || null,
        roughness: 0.72,
        metalness: 0.10,
        side: THREE.DoubleSide
      });
      this.mats.rohanBanner = std({
        color: 0xffffff,
        map: this.tex.rohanBanner || null,
        roughness: 0.76,
        metalness: 0.06,
        side: THREE.DoubleSide
      });
      this.mats.dwarvenBanner = std({
        color: 0xffffff,
        map: this.tex.dwarvenBanner || null,
        roughness: 0.76,
        metalness: 0.08,
        side: THREE.DoubleSide
      });

      // Skins, Horse Coats & Hooves
      this.mats.elvenSkin = std({ color: 0xf2d8bc, roughness: 0.62, metalness: 0.02 });
      this.mats.humanSkin = std({ color: 0xe0b996, roughness: 0.68, metalness: 0.02 });
      this.mats.horseCoats = [
        std({ color: 0x8c522d, roughness: 0.70, metalness: 0.05 }),
        std({ color: 0x543728, roughness: 0.72, metalness: 0.05 }),
        std({ color: 0xd4cfc8, roughness: 0.66, metalness: 0.06 })
      ];
      this.mats.horseMane = std({ color: 0xedd285, roughness: 0.64, metalness: 0.08 });
      this.mats.horseHoof = std({ color: 0x1c1917, roughness: 0.52, metalness: 0.18 });

      // 6. Controlled Emissive Materials (crisp silhouette glow without bloom white-out!)
      this.mats.cyanBowGlow = std({
        color: 0x84f0ff,
        emissive: 0x22c4e8,
        emissiveIntensity: 1.05,
        roughness: 0.20,
        metalness: 0.22
      });
      this.mats.emeraldBowGlow = std({
        color: 0x98f5b5,
        emissive: 0x29c96c,
        emissiveIntensity: 0.98,
        roughness: 0.22,
        metalness: 0.20
      });
      this.mats.starlightCrystal = std({
        color: 0xc8f6ff,
        emissive: 0x4fd4f7,
        emissiveIntensity: 1.10,
        roughness: 0.14,
        metalness: 0.32
      });
      this.mats.istariCrystal = std({
        color: 0xa2e8ff,
        emissive: 0x2ab2eb,
        emissiveIntensity: 1.02,
        roughness: 0.16,
        metalness: 0.28
      });
      this.mats.windowAmber = std({
        color: 0xffffff,
        map: this.tex.stainedGlass || null,
        emissive: 0xe3881e,
        emissiveMap: this.tex.stainedGlass || null,
        emissiveIntensity: 0.85,
        roughness: 0.32
      });
      this.mats.windowStorm = std({
        color: 0x92e0ff,
        map: this.tex.stainedGlass || null,
        emissive: 0x1d9fe0,
        emissiveIntensity: 0.88,
        roughness: 0.28
      });
      this.mats.forgeFire = std({
        color: 0xffa642,
        emissive: 0xe64b10,
        emissiveIntensity: 0.96,
        roughness: 0.28
      });
      this.mats.moltenBoulder = std({
        color: 0x5c473e,
        bumpMap: this.tex.hammeredBump || null,
        bumpScale: 0.14,
        emissive: 0xd93d07,
        emissiveIntensity: 0.78,
        roughness: 0.74,
        metalness: 0.10
      });
      this.mats.anorFlame = std({
        color: 0xffcf70,
        emissive: 0xd9600b,
        emissiveIntensity: 0.78,
        roughness: 0.22,
        metalness: 0.25
      });
      this.mats.stormRune = std({
        color: 0xa6ecff,
        emissive: 0x1eb4f0,
        emissiveIntensity: 1.06,
        roughness: 0.18,
        metalness: 0.22
      });

      // 7. Tactical Rings, Status Overlays & Invisible Hit Volume
      this.mats.rallyGoldRing = basic({
        color: 0xebd078,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      this.mats.rallyGoldFill = basic({
        color: 0xf4dc8c,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      this.mats.tauntAuraRing = basic({
        color: 0xffd54f,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      this.mats.shieldWallDome = basic({
        color: 0xf5cf62,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      this.mats.ringPowerHalo = basic({
        color: 0xffca28,
        transparent: true,
        opacity: 0.48,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      this.mats.stunShadowRing = basic({
        color: 0x7c4dff,
        transparent: true,
        opacity: 0.56,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      this.mats.stunShadowMist = basic({
        color: 0x1a102b,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      this.mats.curseChain = std({
        color: 0xff8a55,
        emissive: 0xe62900,
        emissiveIntensity: 1.12,
        roughness: 0.28,
        metalness: 0.40
      });
      this.mats.curseBeacon = basic({
        color: 0xe63500,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        side: THREE.DoubleSide
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

      // Crisp shared primitives
      g.box = this.regGeo(new THREE.BoxGeometry(1, 1, 1));
      g.sphere = this.regGeo(new THREE.SphereGeometry(1, 14, 10));
      g.sphereLow = this.regGeo(new THREE.SphereGeometry(1, 9, 7));
      g.cyl = this.regGeo(new THREE.CylinderGeometry(1, 1, 1, 16));
      g.cyl12 = this.regGeo(new THREE.CylinderGeometry(1, 1, 1, 12));
      g.cyl8 = this.regGeo(new THREE.CylinderGeometry(1, 1, 1, 8));
      g.cyl6 = this.regGeo(new THREE.CylinderGeometry(1, 1, 1, 6));
      g.cone = this.regGeo(new THREE.ConeGeometry(1, 1, 14));
      g.cone8 = this.regGeo(new THREE.ConeGeometry(1, 1, 8));
      g.cone4 = this.regGeo(new THREE.ConeGeometry(1, 1, 4));
      const cone4Aligned = new THREE.ConeGeometry(1, 1, 4);
      cone4Aligned.rotateY(Math.PI * 0.25);
      g.cone4Aligned = this.regGeo(cone4Aligned);
      g.octa = this.regGeo(new THREE.OctahedronGeometry(1, 0));
      g.icosa = this.regGeo(new THREE.IcosahedronGeometry(1, 0));
      g.dodeca = this.regGeo(new THREE.DodecahedronGeometry(1, 0));
      g.plane = this.regGeo(new THREE.PlaneGeometry(1, 1));
      g.ring = this.regGeo(new THREE.RingGeometry(0.84, 1.0, 28));
      g.ringDash = this.regGeo(new THREE.RingGeometry(0.90, 1.0, 18));
      g.disc = this.regGeo(new THREE.CircleGeometry(1, 24));
      g.torusThin = this.regGeo(new THREE.TorusGeometry(1, 0.048, 8, 28));
      g.torusMed = this.regGeo(new THREE.TorusGeometry(1, 0.085, 8, 24));
      g.torusThick = this.regGeo(new THREE.TorusGeometry(1, 0.125, 8, 22));
      g.hemiDome = this.regGeo(new THREE.SphereGeometry(1, 14, 8, 0, TWO_PI, 0, HALF_PI));

      // Unit-scaled Tower Hit Cylinder (y: 0 -> 1 so each tower scales to its exact visual height & radius!)
      const unitHitCyl = new THREE.CylinderGeometry(1, 1.04, 1, 12);
      unitHitCyl.translate(0, 0.5, 0);
      g.unitHitCyl = this.regGeo(unitHitCyl);

      // Articulated limbs & shafts
      const limbDown = new THREE.CylinderGeometry(0.95, 0.72, 1.0, 10);
      limbDown.translate(0, -0.5, 0);
      g.limbDown = this.regGeo(limbDown);

      const bladeUp = new THREE.ConeGeometry(1, 1, 4);
      bladeUp.translate(0, 0.5, 0);
      g.bladeUp = this.regGeo(bladeUp);

      const shaftUp = new THREE.CylinderGeometry(1, 1, 1, 10);
      shaftUp.translate(0, 0.5, 0);
      g.shaftUp = this.regGeo(shaftUp);

      // Banners, Cloaks, Shields, Leaves & Wings
      g.bannerPointed = this.regGeo(createDrapedBannerGeo(THREE, false));
      g.bannerSwallow = this.regGeo(createDrapedBannerGeo(THREE, true));
      g.flowingCloak = this.regGeo(createFlowingCloakGeo(THREE));
      g.heaterShield = this.regGeo(createHeaterShieldGeo(THREE));
      g.towerPavise = this.regGeo(createTowerPaviseGeo(THREE));
      g.mallornLeaf = this.regGeo(createMallornLeafGeo(THREE));
      g.helmWing = this.regGeo(createHelmWingGeo(THREE));
      g.rohanHorseCrest = this.regGeo(createRohanHorseCrestGeo(THREE));
      g.carriageCheek = this.regGeo(createCarriageCheekGeo(THREE));
      g.flyingButtress = this.regGeo(createFlyingButtressGeo(THREE));
      g.lancetWindow = this.regGeo(createLancetArchGeo(THREE, 0.42, 1.18, 0.10));
      g.gateArchFrame = this.regGeo(createLancetArchGeo(THREE, 1.48, 2.22, 0.34));
      g.meadHallRoof = this.regGeo(createPitchedGableRoofGeo(THREE, 2.22, 2.28, 2.05));
      g.gearLarge = this.regGeo(createToothedGearGeo(THREE, 0.44, 0.35, 14, 0.11));
      g.gearTurntable = this.regGeo(createToothedGearGeo(THREE, 1.72, 1.56, 28, 0.22));

      // Molded Circular Elven Stone & Lotus Plinth (Lathe)
      const elvenPlinthPts = [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(2.16, 0.0),
        new THREE.Vector2(2.12, 0.16),
        new THREE.Vector2(1.94, 0.22),
        new THREE.Vector2(1.88, 0.38),
        new THREE.Vector2(1.68, 0.46),
        new THREE.Vector2(1.62, 0.56),
        new THREE.Vector2(0.0, 0.56)
      ];
      g.elvenPlinth = this.regGeo(new THREE.LatheGeometry(elvenPlinthPts, 24));

      // Tapered Intertwining Mallorn Arch Ribs (thick organic root -> graceful arch -> needle spire tip!)
      g.elvenRibT1 = this.regGeo(this._buildMallornRibGeo(7.15, 1.56, 1.38, 0.31, 0.17));
      g.elvenRibT2 = this.regGeo(this._buildMallornRibGeo(8.25, 1.66, 1.62, 0.27, 0.15));
      g.elvenRib3A = this.regGeo(this._buildMallornRibGeo(9.25, 1.74, 1.78, 0.26, 0.15));
      g.elvenRib3B = this.regGeo(this._buildMallornRibGeo(7.55, 1.62, 1.08, 0.32, 0.18));
      g.elvenRibT1Mir = this.regGeo(mirrorGeometryX(g.elvenRibT1));
      g.elvenRibT2Mir = this.regGeo(mirrorGeometryX(g.elvenRibT2));
      g.elvenRib3AMir = this.regGeo(mirrorGeometryX(g.elvenRib3A));
      g.elvenRib3BMir = this.regGeo(mirrorGeometryX(g.elvenRib3B));

      // Galadhrim Cathedral Swan-Wing Arch (sweeping outward and high above the archer!)
      const cathPts = [
        new THREE.Vector3(1.45, 0.35, 0.15),
        new THREE.Vector3(1.88, 2.45, 0.22),
        new THREE.Vector3(1.96, 5.20, 0.10),
        new THREE.Vector3(1.38, 7.65, -0.05),
        new THREE.Vector3(0.18, 9.48, -0.10)
      ];
      g.galadhrimWingArch = this.regGeo(createTaperedTubeGeo(THREE, cathPts, 24, 8, (t) => ({
        rx: lerp(0.24, 0.035, Math.pow(t, 0.85)),
        ry: lerp(0.14, 0.025, Math.pow(t, 0.85))
      }), true));
      g.galadhrimWingArchL = this.regGeo(mirrorGeometryX(g.galadhrimWingArch));

      // Double-Recurve Elven Longbow (with sculpted riser grip & recurved tips!)
      const bowPts = [
        new THREE.Vector3(0, -0.88, -0.22),
        new THREE.Vector3(0, -0.68, -0.04),
        new THREE.Vector3(0, -0.36, 0.20),
        new THREE.Vector3(0, 0.0, 0.26),
        new THREE.Vector3(0, 0.36, 0.20),
        new THREE.Vector3(0, 0.68, -0.04),
        new THREE.Vector3(0, 0.88, -0.22)
      ];
      g.recurveBow = this.regGeo(createTaperedTubeGeo(THREE, bowPts, 22, 7, (t) => {
        const mid = 1 - Math.abs(t - 0.5) * 2;
        return lerp(0.018, 0.052, Math.pow(mid, 0.7));
      }, true));

      // Battered Gondorian Watch-Keep Masonry Shell (with flared talus base & corbeled cornice)
      const keepProfile = [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(2.24, 0.0),
        new THREE.Vector2(2.18, 0.26),
        new THREE.Vector2(1.94, 0.88),
        new THREE.Vector2(1.74, 1.52),
        new THREE.Vector2(1.70, 4.28),
        new THREE.Vector2(1.82, 4.48),
        new THREE.Vector2(1.94, 4.66),
        new THREE.Vector2(1.94, 5.02),
        new THREE.Vector2(1.52, 5.02),
        new THREE.Vector2(1.52, 4.62),
        new THREE.Vector2(0.0, 4.62)
      ];
      g.garrisonKeepOct = this.regGeo(new THREE.LatheGeometry(keepProfile, 16));

      // Polygonal Dwarven Siege Bastion Plinth
      const dwarfProfile = [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(2.30, 0.0),
        new THREE.Vector2(2.24, 0.34),
        new THREE.Vector2(1.98, 1.12),
        new THREE.Vector2(1.88, 2.72),
        new THREE.Vector2(2.04, 2.94),
        new THREE.Vector2(2.04, 3.28),
        new THREE.Vector2(0.0, 3.28)
      ];
      g.dwarvenBastion = this.regGeo(new THREE.LatheGeometry(dwarfProfile, 8));

      // Stepped Dwarven Siege Bombard Barrel (+Z muzzle with deep hollow bore!)
      const cannonProfile = [
        new THREE.Vector2(0.0, -1.18),
        new THREE.Vector2(0.24, -1.18),
        new THREE.Vector2(0.36, -1.02),
        new THREE.Vector2(0.64, -0.82),
        new THREE.Vector2(0.68, -0.10),
        new THREE.Vector2(0.58, -0.04),
        new THREE.Vector2(0.56, 0.86),
        new THREE.Vector2(0.63, 0.92),
        new THREE.Vector2(0.50, 1.68),
        new THREE.Vector2(0.66, 1.86),
        new THREE.Vector2(0.66, 2.08),
        new THREE.Vector2(0.38, 2.08),
        new THREE.Vector2(0.36, 0.52),
        new THREE.Vector2(0.0, 0.52)
      ];
      const cannonLathe = new THREE.LatheGeometry(cannonProfile, 18);
      cannonLathe.rotateX(HALF_PI); // +Y lathe -> +Z forward barrel!
      g.bombardBarrel = this.regGeo(cannonLathe);

      // Sweeping Spring-Steel Ballista Prod (+X outward & swept -Z)
      const prodPts = [
        new THREE.Vector3(0.0, 0.0, 0.0),
        new THREE.Vector3(0.42, 0.02, 0.06),
        new THREE.Vector3(0.88, 0.03, -0.14),
        new THREE.Vector3(1.32, 0.04, -0.46)
      ];
      g.ballistaProd = this.regGeo(createTaperedTubeGeo(THREE, prodPts, 14, 6, (t) => ({
        rx: lerp(0.11, 0.035, t),
        ry: lerp(0.16, 0.075, t)
      }), true));
      g.ballistaProdL = this.regGeo(mirrorGeometryX(g.ballistaProd));

      // Concave-Flared Gothic Wizard Conical Roof
      const spireProfile = [
        new THREE.Vector2(1.72, 0.0),
        new THREE.Vector2(1.42, 0.30),
        new THREE.Vector2(1.06, 0.85),
        new THREE.Vector2(0.68, 1.65),
        new THREE.Vector2(0.34, 2.55),
        new THREE.Vector2(0.10, 3.25),
        new THREE.Vector2(0.0, 3.60)
      ];
      g.istariRoof = this.regGeo(new THREE.LatheGeometry(spireProfile, 12));

      // Curved Orthanc Pinnacle Horn (sweeps upward and subtly inward like Orthanc's 4 peaks)
      const orthancHornPts = [
        new THREE.Vector3(0.0, 0.0, 0.0),
        new THREE.Vector3(0.0, 0.72, 0.10),
        new THREE.Vector3(0.0, 1.48, 0.06),
        new THREE.Vector3(0.0, 2.22, -0.12)
      ];
      g.orthancHorn = this.regGeo(createTaperedTubeGeo(THREE, orthancHornPts, 14, 4, (t) => lerp(0.28, 0.02, Math.pow(t, 0.85)), true));

      // Helical Copper Lightning-Conductor Coil
      const coilPts = [];
      const coilTurns = 4.5;
      const coilSteps = 36;
      for (let i = 0; i <= coilSteps; i++) {
        const t = i / coilSteps;
        const a = t * TWO_PI * coilTurns;
        coilPts.push(new THREE.Vector3(Math.cos(a) * 1.30, t * 1.15, Math.sin(a) * 1.30));
      }
      g.copperHelix = this.regGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts), 44, 0.045, 6, false));

      // Anatomical Humanoid Cuirass / Breastplate (contoured waist, broad chest, flared tasset skirt)
      const cuirassPts = [
        new THREE.Vector2(0.24, 0.0),
        new THREE.Vector2(0.22, 0.14),
        new THREE.Vector2(0.185, 0.26),
        new THREE.Vector2(0.255, 0.48),
        new THREE.Vector2(0.235, 0.62),
        new THREE.Vector2(0.13, 0.66),
        new THREE.Vector2(0.0, 0.66)
      ];
      const cuirassGeo = new THREE.LatheGeometry(cuirassPts, 12);
      cuirassGeo.scale(1.08, 1.0, 0.82);
      g.cuirass = this.regGeo(cuirassGeo);

      // Conical Gondorian / Noldorin Steel Helm Bell (flared neck-guard rim + ogive dome)
      const helmPts = [
        new THREE.Vector2(0.205, 0.0),
        new THREE.Vector2(0.185, 0.08),
        new THREE.Vector2(0.182, 0.22),
        new THREE.Vector2(0.135, 0.34),
        new THREE.Vector2(0.055, 0.44),
        new THREE.Vector2(0.0, 0.50)
      ];
      g.conicalHelm = this.regGeo(new THREE.LatheGeometry(helmPts, 12));

      // Deep Woodland / Ranger Pointed Hood
      const hoodPts = [
        new THREE.Vector3(0, 0.0, 0.02),
        new THREE.Vector3(0, 0.18, 0.01),
        new THREE.Vector3(0, 0.32, -0.06),
        new THREE.Vector3(0, 0.38, -0.22)
      ];
      g.rangerHood = this.regGeo(createTaperedTubeGeo(THREE, hoodPts, 10, 8, (t) => lerp(0.195, 0.025, Math.pow(t, 0.85)), true));

      // Anatomical 3D Warhorse Torso (broad chest + contoured flank + muscular croup along Z!)
      const horseTorsoPts = [
        new THREE.Vector2(0.0, -0.78),
        new THREE.Vector2(0.24, -0.74),
        new THREE.Vector2(0.38, -0.52), // muscular hindquarters / croup
        new THREE.Vector2(0.34, -0.12), // waist / loin
        new THREE.Vector2(0.37, 0.28),  // ribcage barrel
        new THREE.Vector2(0.39, 0.56),  // deep equine chest
        new THREE.Vector2(0.25, 0.74),
        new THREE.Vector2(0.0, 0.78)
      ];
      const horseTorsoGeo = new THREE.LatheGeometry(horseTorsoPts, 16);
      horseTorsoGeo.rotateX(HALF_PI); // align along Z
      horseTorsoGeo.scale(0.88, 1.04, 1.0);
      g.horseTorso = this.regGeo(horseTorsoGeo);

      // Sculpted Equine Arched Neck (broad shoulder base -> graceful poll)
      const hNeckPts = [
        new THREE.Vector3(0, 0.0, 0.0),
        new THREE.Vector3(0, 0.24, 0.14),
        new THREE.Vector3(0, 0.48, 0.26),
        new THREE.Vector3(0, 0.66, 0.34)
      ];
      g.horseNeck = this.regGeo(createTaperedTubeGeo(THREE, hNeckPts, 12, 10, (t) => ({
        rx: lerp(0.21, 0.125, t),
        ry: lerp(0.28, 0.155, t)
      }), true));

      // Sculpted Equine Head & Tapered Snout/Muzzle (oriented along +Z)
      const hHeadPts = [
        new THREE.Vector3(0, 0.06, -0.08),
        new THREE.Vector3(0, 0.04, 0.10),
        new THREE.Vector3(0, -0.04, 0.30),
        new THREE.Vector3(0, -0.10, 0.48)
      ];
      g.horseSkull = this.regGeo(createTaperedTubeGeo(THREE, hHeadPts, 12, 10, (t) => ({
        rx: lerp(0.145, 0.082, Math.pow(t, 0.75)),
        ry: lerp(0.165, 0.092, Math.pow(t, 0.75))
      }), true));

      // Flowing S-Curved Warhorse Tail (-Z backward & downward)
      const hTailPts = [
        new THREE.Vector3(0, 0.0, 0.0),
        new THREE.Vector3(0, -0.08, -0.18),
        new THREE.Vector3(0, -0.36, -0.28),
        new THREE.Vector3(0, -0.68, -0.22),
        new THREE.Vector3(0, -0.92, -0.32)
      ];
      g.horseTail = this.regGeo(createTaperedTubeGeo(THREE, hTailPts, 14, 8, (t) => {
        const swell = Math.sin(t * Math.PI);
        return lerp(0.055, 0.02, t) + swell * 0.065;
      }, true));
    }

    _buildMallornRibGeo(height, baseRadius, twistRad, rootRad, midRad) {
      const THREE = this.THREE;
      const pts = [];
      const steps = 22;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const y = t * height;
        let r;
        if (t < 0.60) {
          const u = t / 0.60;
          r = baseRadius * (1.02 - 0.34 * Math.sin(u * Math.PI * 0.82) + 0.11 * Math.sin(u * TWO_PI));
        } else {
          const u = (t - 0.60) / 0.40;
          r = baseRadius * 0.80 * (1 - Math.pow(u, 1.75) * 0.96);
        }
        const ang = t * twistRad;
        pts.push(new THREE.Vector3(Math.cos(ang) * r, y, Math.sin(ang) * r));
      }
      return createTaperedTubeGeo(THREE, pts, 26, 8, (t) => {
        const rad = t < 0.25
          ? lerp(rootRad, midRad, t / 0.25)
          : lerp(midRad, 0.026, Math.pow((t - 0.25) / 0.75, 1.15));
        return { rx: rad * 1.12, ry: rad * 0.82 };
      }, true);
    }

    dispose() {
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
    }
  }

  let _singletonCache = null;

  function resolveSharedCache(shared) {
    if (shared && shared.isTowerAssetCache) return shared;
    if (shared && shared.towerAssetCache && shared.towerAssetCache.isTowerAssetCache && shared.towerAssetCache.geometries.length > 0) {
      return shared.towerAssetCache;
    }
    const THREE = (shared && shared.THREE) || (typeof window !== 'undefined' ? window.THREE : null);
    if (!THREE) {
      throw new Error('TD.TowerModels3D requires window.THREE or shared.THREE');
    }
    // When backed by a host ModelAssetCache (with regGeo/dispose), scope lifetime to that host cache for leak-free map switches
    if (shared && typeof shared === 'object' && typeof shared.regGeo === 'function') {
      const scoped = new TowerAssetCache(THREE, shared);
      scoped.isTowerAssetCache = true;
      shared.towerAssetCache = scoped;
      return scoped;
    }
    if (!_singletonCache || _singletonCache.THREE !== THREE || _singletonCache.geometries.length === 0) {
      _singletonCache = new TowerAssetCache(THREE, null);
      _singletonCache.isTowerAssetCache = true;
    }
    if (shared && typeof shared === 'object') {
      shared.towerAssetCache = _singletonCache;
    }
    return _singletonCache;
  }

  // ============================================================================
  // 4. SCENE GRAPH & STATUS / RAYCAST HELPERS
  // ============================================================================
  function makeMesh(THREE, geo, mat, sx, sy, sz) {
    const m = new THREE.Mesh(geo, mat);
    if (sx !== undefined) {
      m.scale.set(sx, sy !== undefined ? sy : sx, sz !== undefined ? sz : sx);
    }
    m.userData.baseMat = mat;
    return m;
  }

  function finalizeShadowAndBaseMats(root) {
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
        obj.castShadow = false;
        obj.receiveShadow = false;
      }
    });
    return flashMeshes;
  }

  // Compact tower status overlay sized cleanly inside tower silhouette so Box3 portrait framing stays exact!
  function buildTowerStatusOverlay(cache, towerHeight, baseRadius) {
    const THREE = cache.THREE;
    const g = cache.geos;
    const m = cache.mats;

    const root = new THREE.Group();
    root.userData.skipStudioBounds = true;
    const r = baseRadius || 2.0;
    const h = Math.max(4.4, towerHeight || 6.5);

    const ringHalo = makeMesh(THREE, g.ring, m.ringPowerHalo, r * 1.02, r * 1.02, 1);
    ringHalo.rotation.x = -HALF_PI;
    ringHalo.position.y = 0.06;
    ringHalo.userData.noShadow = true;
    ringHalo.userData.skipStudioBounds = true;
    ringHalo.visible = false;
    root.add(ringHalo);

    const stunGroup = new THREE.Group();
    stunGroup.visible = false;
    stunGroup.userData.skipStudioBounds = true;
    const mistH = Math.min(4.2, h * 0.65);
    const stunMist = makeMesh(THREE, g.cyl, m.stunShadowMist, r * 0.88, mistH, r * 0.88);
    stunMist.position.y = mistH * 0.5 + 0.3;
    stunMist.userData.noShadow = true;
    stunGroup.add(stunMist);

    const stunRings = [];
    for (let i = 0; i < 3; i++) {
      const sr = makeMesh(THREE, g.torusThin, m.stunShadowRing, r * (0.86 - i * 0.08), r * (0.86 - i * 0.08), 1.3);
      sr.position.y = 1.2 + i * (mistH * 0.32);
      sr.rotation.x = HALF_PI + (i - 1) * 0.28;
      sr.userData.noShadow = true;
      stunGroup.add(sr);
      stunRings.push(sr);
    }
    root.add(stunGroup);

    const curseGroup = new THREE.Group();
    curseGroup.visible = false;
    curseGroup.userData.skipStudioBounds = true;
    const chains = [];
    const chainTilts = [0.34, -0.36, 0.30];
    const chainTop = Math.min(3.6, h * 0.62);
    for (let i = 0; i < 3; i++) {
      const ch = makeMesh(THREE, g.torusThick, m.curseChain, r * (0.85 - i * 0.05), r * (0.85 - i * 0.05), 1.1);
      ch.position.y = lerp(1.15, chainTop, i / 2);
      ch.rotation.order = 'YXZ';
      ch.rotation.y = i * 1.05;
      ch.rotation.x = HALF_PI + chainTilts[i];
      ch.userData.noShadow = true;
      ch.userData.noFlash = true;
      curseGroup.add(ch);
      chains.push(ch);
    }

    const beaconH = Math.min(4.2, h * 0.55);
    const beacon = makeMesh(THREE, g.cyl, m.curseBeacon, 0.45, beaconH, 0.45);
    beacon.position.y = h * 0.48;
    beacon.userData.noShadow = true;
    curseGroup.add(beacon);

    const topSigil = makeMesh(THREE, g.octa, m.curseChain, 0.44, 0.72, 0.44);
    topSigil.position.y = Math.min(h - 0.80, 6.8);
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

  function buildFittedHitMesh(cache, radius, height) {
    const m = makeMesh(cache.THREE, cache.geos.unitHitCyl, cache.mats.hitVolumeInvisible, radius, height, radius);
    m.userData.noShadow = true;
    m.userData.noFlash = true;
    m.userData.isTowerHitVolume = true;
    m.userData.skipStudioBounds = true;
    return m;
  }

  // ============================================================================
  // 5. HEROIC ELVEN ARCHER SCULPTURE & ALL 4 ELVEN WATCHTOWER VARIANTS
  // ============================================================================
  function buildSculptedElvenArcher(cache, variant) {
    const THREE = cache.THREE;
    const g = cache.geos;
    const m = cache.mats;

    const isT2 = variant === '2_0';
    const isGaladhrim = variant === '3_A';
    const isMirkwood = variant === '3_B';

    const archer = new THREE.Group();
    const armorMat = isGaladhrim ? m.mithrilSilver : (isMirkwood ? m.hammeredBronze : m.goldRadiant);
    const trimMat = isGaladhrim ? m.goldRadiant : m.goldBurnished;
    const cloakMat = isMirkwood ? m.elvenEmerald : (isGaladhrim ? m.lorienRoyalCloak : m.elvenEmerald);
    const bowWoodMat = isGaladhrim ? m.mallornSilver : m.mallornGold;
    const bowGlowMat = isMirkwood ? m.emeraldBowGlow : (isGaladhrim ? m.starlightCrystal : m.cyanBowGlow);

    // Dynamic Archer Stance: Greaves, Knee Poleyns & Sabatons
    for (let s = -1; s <= 1; s += 2) {
      const zOff = s < 0 ? 0.08 : -0.09;
      const shin = makeMesh(THREE, g.cyl12, armorMat, 0.075, 0.48, 0.085);
      shin.position.set(s * 0.13, 0.27, zOff);
      shin.rotation.x = s < 0 ? -0.08 : 0.10;
      const thigh = makeMesh(THREE, g.cyl12, cloakMat, 0.09, 0.34, 0.095);
      thigh.position.set(s * 0.12, 0.58, zOff * 0.6);
      const boot = makeMesh(THREE, g.box, trimMat, 0.12, 0.09, 0.22);
      boot.position.set(s * 0.13, 0.045, zOff + 0.04);
      const knee = makeMesh(THREE, g.octa, trimMat, 0.065, 0.09, 0.065);
      knee.position.set(s * 0.13, 0.48, zOff + 0.07);
      archer.add(shin, thigh, boot, knee);
    }

    // Layered Lórien Fauld Skirt & Sculpted Anatomical Cuirass
    const skirt = makeMesh(THREE, g.cone, cloakMat, 0.27, 0.52, 0.23);
    skirt.position.set(0, 0.64, 0);
    const belt = makeMesh(THREE, g.torusMed, trimMat, 0.19, 0.16, 0.9);
    belt.rotation.x = HALF_PI;
    belt.position.set(0, 0.74, 0);
    const cuirass = makeMesh(THREE, g.cuirass, armorMat, 0.92, 0.88, 0.90);
    cuirass.position.set(0, 0.68, 0);
    archer.add(skirt, belt, cuirass);

    // Leaf-Shaped Layered Elven Pauldrons
    for (let s = -1; s <= 1; s += 2) {
      const pauldron = makeMesh(THREE, g.mallornLeaf, trimMat, 0.62, 0.30, 0.8);
      pauldron.position.set(s * 0.23, 1.24, 0);
      pauldron.rotation.z = s * 1.22;
      pauldron.rotation.y = s * HALF_PI;
      archer.add(pauldron);
    }

    // Flowing Pleated Hooded Cloak & Leather-and-Gold Arrow Quiver
    const cloak = makeMesh(THREE, g.flowingCloak, cloakMat, 0.56, isGaladhrim ? 1.24 : 1.05, 1.0);
    cloak.position.set(0, 1.24, -0.06);
    archer.add(cloak);

    const quiver = new THREE.Group();
    quiver.position.set(-0.14, 1.02, -0.19);
    quiver.rotation.z = -0.34;
    quiver.rotation.x = -0.14;
    const qTube = makeMesh(THREE, g.cyl12, m.darkLeather, 0.075, 0.56, 0.065);
    const qRim = makeMesh(THREE, g.cyl12, trimMat, 0.084, 0.07, 0.074);
    qRim.position.y = 0.26;
    quiver.add(qTube, qRim);
    for (let a = -1; a <= 1; a++) {
      const fletch = makeMesh(THREE, g.cone4, bowGlowMat, 0.032, 0.18, 0.015);
      fletch.position.set(a * 0.025, 0.36, 0);
      fletch.userData.noFlash = true;
      quiver.add(fletch);
    }
    archer.add(quiver);

    // Sculpted Elven Head, Pointed Ears & Variant Headgear
    const head = makeMesh(THREE, g.sphere, m.elvenSkin, 0.135, 0.155, 0.14);
    head.position.set(0, 1.41, 0.02);
    archer.add(head);

    if (isMirkwood) {
      // Deep Mirkwood Woodland Ranger Hood + Bronze Brow Circlet
      const hood = makeMesh(THREE, g.rangerHood, m.elvenEmerald, 1.02, 1.05, 1.05);
      hood.position.set(0, 1.33, 0.02);
      const brow = makeMesh(THREE, g.torusThin, m.goldBurnished, 0.138, 0.142, 1.0);
      brow.rotation.x = HALF_PI - 0.15;
      brow.position.set(0, 1.46, 0.03);
      archer.add(hood, brow);
    } else if (isGaladhrim) {
      // High-Elven Master Crown + Cascading Golden Hair & Starlight Diadem
      const hair = makeMesh(THREE, g.flowingCloak, m.horseMane, 0.28, 0.48, 0.55);
      hair.position.set(0, 1.44, -0.02);
      const crownBase = makeMesh(THREE, g.cyl12, m.goldRadiant, 0.148, 0.08, 0.152);
      crownBase.position.set(0, 1.50, 0.02);
      archer.add(hair, crownBase);
      for (let p = -2; p <= 2; p++) {
        const spire = makeMesh(THREE, g.cone4, p === 0 ? m.starlightCrystal : m.goldRadiant, 0.032, 0.22 - Math.abs(p) * 0.04, 0.025);
        spire.position.set(p * 0.048, 1.61 - Math.abs(p) * 0.02, 0.13 - Math.abs(p) * 0.02);
        archer.add(spire);
      }
    } else {
      // Pointed Noldorin Golden Helm with Cheekguards & Swept Crest
      const helm = makeMesh(THREE, g.conicalHelm, armorMat, 0.80, isT2 ? 0.96 : 0.84, 0.86);
      helm.position.set(0, 1.39, 0.01);
      helm.rotation.x = -0.14;
      archer.add(helm);
      if (isT2) {
        for (let s = -1; s <= 1; s += 2) {
          const wing = makeMesh(THREE, g.helmWing, m.mallornSilver, 0.45, 0.42, 0.45);
          wing.position.set(s * 0.14, 1.46, 0.02);
          wing.rotation.z = -s * 0.22;
          archer.add(wing);
        }
      }
    }

    // Extended Bow Arm (+X/+Z) & Drawn String Arm (-X)
    const bowArm = makeMesh(THREE, g.cyl12, armorMat, 0.058, 0.48, 0.058);
    bowArm.rotation.x = HALF_PI - 0.06;
    bowArm.rotation.z = -0.12;
    bowArm.position.set(0.18, 1.14, 0.18);

    const drawArm = makeMesh(THREE, g.cyl12, armorMat, 0.058, 0.40, 0.058);
    drawArm.rotation.x = HALF_PI * 0.72;
    drawArm.rotation.z = 0.36;
    drawArm.position.set(-0.20, 1.15, 0.04);
    archer.add(bowArm, drawArm);

    // Sculpted Recurve Longbow + Taut Bowstring + Glowing Energy Arrow (+Z forward!)
    const bowGroup = new THREE.Group();
    bowGroup.position.set(0.14, 1.14, 0.32);

    const bowScale = isGaladhrim ? 1.34 : (isT2 ? 1.08 : 1.0);
    const bowBody = makeMesh(THREE, g.recurveBow, bowWoodMat, bowScale, bowScale, bowScale);
    bowGroup.add(bowBody);

    // Sculpted golden leaf-blades on upper & lower bow limbs + luminous trim core
    for (let s = -1; s <= 1; s += 2) {
      const limbLeaf = makeMesh(THREE, g.mallornLeaf, bowGlowMat, 0.32 * bowScale, 0.36 * bowScale, 0.5);
      limbLeaf.position.set(0, s * 0.32 * bowScale, 0.18 * bowScale);
      limbLeaf.rotation.x = s > 0 ? -0.35 : (Math.PI + 0.35);
      limbLeaf.userData.noFlash = true;
      bowGroup.add(limbLeaf);

      // Taut energy bowstring from nock tips back to drawn hand
      const str = makeMesh(THREE, g.cyl6, bowGlowMat, 0.011, 0.88 * bowScale, 0.011);
      str.position.set(0, s * 0.42 * bowScale, -0.22 * bowScale);
      str.rotation.x = s * 0.12;
      str.userData.noFlash = true;
      bowGroup.add(str);
    }

    // Nocked Radiant Energy Arrow (matches models_3d.js arrowShaft z = -0.16 rest offset!)
    const arrowShaft = new THREE.Group();
    arrowShaft.position.set(0, 0, -0.16);
    const shaftMesh = makeMesh(THREE, g.shaftUp, bowGlowMat, 0.024, 1.08 * bowScale, 0.024);
    shaftMesh.rotation.x = HALF_PI;
    shaftMesh.position.z = -0.18 * bowScale;
    shaftMesh.userData.noFlash = true;
    const arrowHead = makeMesh(THREE, g.octa, bowGlowMat, 0.058 * bowScale, 0.22 * bowScale, 0.036 * bowScale);
    arrowHead.rotation.x = HALF_PI;
    arrowHead.position.z = 0.94 * bowScale;
    arrowHead.userData.noFlash = true;
    const fletchL = makeMesh(THREE, g.cone4, trimMat, 0.048, 0.16, 0.014);
    fletchL.rotation.x = -HALF_PI;
    fletchL.position.z = -0.12 * bowScale;
    arrowShaft.add(shaftMesh, arrowHead, fletchL);
    bowGroup.add(arrowShaft);

    archer.add(bowGroup);

    return { group: archer, bowGroup, arrowShaft, drawArm, cloak };
  }

  function buildElvenTowerRig(variant, cache) {
    const THREE = cache.THREE;
    const g = cache.geos;
    const m = cache.mats;

    const root = new THREE.Group();
    const isT2 = variant === '2_0';
    const is3A = variant === '3_A'; // Galadhrim Longbows
    const is3B = variant === '3_B'; // Mirkwood Wardens

    const woodMat = is3A ? m.mallornSilver : (isT2 ? m.mallornGold : (is3B ? m.mirkwoodBark : m.mallornBronze));
    const trimMat = is3A ? m.goldRadiant : m.goldBurnished;
    const leafMat = is3B ? m.mallornLeafEmerald : m.mallornLeafGold;

    // 1. Carved Circular White-Marble & Gold-Inlaid Lotus Plinth
    const plinth = makeMesh(THREE, g.elvenPlinth, m.whiteMarble, 1.0, 1.0, 1.0);
    const goldInlayRing = makeMesh(THREE, g.torusMed, trimMat, 1.92, 1.92, 0.85);
    goldInlayRing.rotation.x = HALF_PI;
    goldInlayRing.position.y = 0.24;
    const upperCollar = makeMesh(THREE, g.torusThin, is3A ? m.mithrilSilver : trimMat, 1.64, 1.64, 1.0);
    upperCollar.rotation.x = HALF_PI;
    upperCollar.position.y = 0.56;
    root.add(plinth, goldInlayRing, upperCollar);

    // Sculpted base lotus leaves hugging the plinth
    const baseLeafCount = is3A ? 8 : 6;
    for (let i = 0; i < baseLeafCount; i++) {
      const ang = (i / baseLeafCount) * TWO_PI;
      const petal = makeMesh(THREE, g.mallornLeaf, trimMat, 0.85, 0.78, 0.9);
      petal.position.set(Math.sin(ang) * 1.72, 0.18, Math.cos(ang) * 1.72);
      petal.rotation.y = ang;
      petal.rotation.x = 0.52;
      root.add(petal);
    }

    // 2. Intertwining Organic Mallorn Wood Ribs + Unfurling Sculpted Leaf Blades!
    // T1 = 3 thick ribs; T2 = 5 taller ribs + filigree vines; 3A = 4 ribs + twin cathedral arches; 3B = 4 gnarled woodland trunks
    const ribCount = isT2 ? 5 : (is3A ? 4 : (is3B ? 4 : 3));
    const ribGeo = is3A ? g.elvenRib3A : (isT2 ? g.elvenRibT2 : (is3B ? g.elvenRib3B : g.elvenRibT1));
    const ribMirGeo = is3A ? g.elvenRib3AMir : (isT2 ? g.elvenRibT2Mir : (is3B ? g.elvenRib3BMir : g.elvenRibT1Mir));
    const ribTopY = is3A ? 9.25 : (isT2 ? 8.25 : (is3B ? 7.55 : 7.15));

    for (let i = 0; i < ribCount; i++) {
      const ang = (i / ribCount) * TWO_PI + (ribCount === 3 ? 0.52 : 0.38);
      const rib = makeMesh(THREE, ribGeo, woodMat, 1, 1, 1);
      rib.position.y = 0.32;
      rib.rotation.y = ang;
      root.add(rib);

      // Counter-twisting slender golden/silver filigree vine for organic braided silhouette
      const braidMat = is3A ? m.goldRadiant : (isT2 ? m.mallornSilver : trimMat);
      const counterRib = makeMesh(THREE, ribMirGeo, braidMat, 0.92, 0.98, 0.92);
      counterRib.position.y = 0.32;
      counterRib.rotation.y = ang + Math.PI / ribCount;
      if (isT2 || is3A || i === 0) {
        root.add(counterRib);
      }

      // Sculpted Mallorn leaf blades unfurling along the ribs at 2 tiers
      const leafHeights = [2.15, 3.85];
      for (let lh = 0; lh < leafHeights.length; lh++) {
        const ly = leafHeights[lh];
        const lAng = ang + (ly / ribTopY) * 1.4;
        const lr = 1.38 - lh * 0.16;
        const leaf = makeMesh(THREE, g.mallornLeaf, lh === 0 ? leafMat : trimMat, 0.95, 1.05, 1.0);
        leaf.position.set(Math.sin(lAng) * lr, ly, Math.cos(lAng) * lr);
        leaf.rotation.y = lAng;
        leaf.rotation.x = 0.48;
        root.add(leaf);
      }
    }

    // Fluted Spiral Heartwood Core Column supporting the Archer's Cradle
    const platY = is3A ? 4.95 : (isT2 ? 4.55 : (is3B ? 4.42 : 4.10));
    const coreCol = makeMesh(THREE, g.cyl12, woodMat, 0.38, platY - 0.3, 0.38);
    coreCol.position.y = (platY + 0.2) * 0.5;
    root.add(coreCol);

    // 3. Sculpted Elevated Elven Gallery Cradle Platform & Leaf Balustrade
    const platDisc = makeMesh(THREE, g.cyl, m.whiteMarble, 1.22, 0.22, 1.22);
    platDisc.position.y = platY;
    const platUnder = makeMesh(THREE, g.cone, woodMat, 1.20, 0.68, 1.20);
    platUnder.rotation.x = Math.PI;
    platUnder.position.y = platY - 0.42;
    const platRim = makeMesh(THREE, g.torusMed, trimMat, 1.24, 1.24, 0.9);
    platRim.rotation.x = HALF_PI;
    platRim.position.y = platY + 0.10;
    root.add(platDisc, platUnder, platRim);

    // Open-front Elven leaf balustrade around rear/sides of gallery
    for (let b = 0; b < 5; b++) {
      const bang = Math.PI * 0.45 + (b / 4) * Math.PI * 1.1;
      const bLeaf = makeMesh(THREE, g.mallornLeaf, trimMat, 0.68, 0.64, 0.8);
      bLeaf.position.set(Math.sin(bang) * 1.18, platY + 0.06, Math.cos(bang) * 1.18);
      bLeaf.rotation.y = bang;
      bLeaf.rotation.x = 0.22;
      root.add(bLeaf);
    }

    // 4. Variant-Specific Architectural Signatures!
    let starlightCrystal = null;
    let starlightRing1 = null;
    let starlightRing2 = null;
    const lanternCrystals = [];

    if (isT2) {
      // Noldorin T2: Carved Silver-Gold Filigree Canopy Arch + 3 Hanging Crystal Lanterns!
      const canopyRing = makeMesh(THREE, g.torusMed, m.mallornSilver, 1.05, 1.05, 0.9);
      canopyRing.rotation.x = HALF_PI + 0.18;
      canopyRing.position.y = 6.65;
      root.add(canopyRing);

      for (let k = 0; k < 3; k++) {
        const lang = (k / 3) * TWO_PI + 0.52;
        const lx = Math.sin(lang) * 1.48;
        const lz = Math.cos(lang) * 1.48;
        const arm = makeMesh(THREE, g.cyl8, m.goldBurnished, 0.035, 0.46, 0.035);
        arm.position.set(lx * 0.85, 6.22, lz * 0.85);
        arm.rotation.z = -Math.sin(lang) * 0.95;
        arm.rotation.x = Math.cos(lang) * 0.95;

        const chain = makeMesh(THREE, g.cyl6, m.goldBurnished, 0.018, 0.36, 0.018);
        chain.position.set(lx, 5.98, lz);
        const lantern = makeMesh(THREE, g.octa, m.cyanBowGlow, 0.15, 0.30, 0.15);
        lantern.position.set(lx, 5.68, lz);
        lantern.userData.noFlash = true;
        const cap = makeMesh(THREE, g.cone8, m.mallornSilver, 0.18, 0.16, 0.18);
        cap.position.set(lx, 5.84, lz);
        root.add(arm, chain, lantern, cap);
        lanternCrystals.push(lantern);
      }
    } else if (is3A) {
      // Galadhrim 3A: Majestic Twin-Arched Lothlórien Silver-and-Gold Cathedral Spire + Silmaril Star!
      for (let s = -1; s <= 1; s += 2) {
        const archGeo = s < 0 ? g.galadhrimWingArchL : g.galadhrimWingArch;
        const wingArch = makeMesh(THREE, archGeo, m.mallornSilver, 1.0, 1.0, 1.0);
        root.add(wingArch);
        const goldSpine = makeMesh(THREE, archGeo, m.goldRadiant, 0.94, 0.98, 0.94);
        goldSpine.position.y = 0.08;
        root.add(goldSpine);

        // Sweeping golden cathedral plumage leaves along outer swan-arches
        for (let f = 0; f < 4; f++) {
          const fy = 2.6 + f * 1.45;
          const fx = s * (1.92 - Math.abs(f - 1.5) * 0.24);
          const featherLeaf = makeMesh(THREE, g.mallornLeaf, f % 2 === 0 ? m.goldRadiant : m.mithrilSilver, 0.88, 1.15, 0.9);
          featherLeaf.position.set(fx, fy, 0.12);
          featherLeaf.rotation.z = -s * 0.62;
          featherLeaf.rotation.y = s * HALF_PI;
          root.add(featherLeaf);
        }
      }

      // Levitating Starlight Silmaril Crystal at y = 7.75 (exact match for models_3d.js sync!)
      starlightCrystal = makeMesh(THREE, g.octa, m.starlightCrystal, 0.38, 0.74, 0.38);
      starlightCrystal.position.y = 7.75;
      starlightCrystal.userData.noFlash = true;

      starlightRing1 = makeMesh(THREE, g.torusThin, m.mithrilSilver, 0.78, 0.78, 1.1);
      starlightRing1.position.y = 7.75;
      starlightRing1.rotation.x = 0.55;
      starlightRing1.rotation.z = 0.32;

      starlightRing2 = makeMesh(THREE, g.torusThin, m.cyanBowGlow, 0.58, 0.58, 1.1);
      starlightRing2.position.y = 7.75;
      starlightRing2.rotation.x = -0.62;
      starlightRing2.rotation.y = 0.48;
      starlightRing2.userData.noFlash = true;

      root.add(starlightCrystal, starlightRing1, starlightRing2);
    } else if (is3B) {
      // Mirkwood 3B: Multi-Tiered Emerald-and-Bronze Woodland Bough Canopy!
      const boughSpecs = [
        { x: 0, y: 3.15, z: 0, r: 1.98, h: 0.78 },
        { x: -0.68, y: 6.05, z: -0.25, r: 1.45, h: 0.72 },
        { x: 0.68, y: 6.35, z: -0.20, r: 1.38, h: 0.70 },
        { x: 0, y: 7.25, z: -0.05, r: 1.15, h: 0.85 }
      ];
      for (let c = 0; c < boughSpecs.length; c++) {
        const bs = boughSpecs[c];
        const foliage = makeMesh(THREE, g.cone, m.mallornLeafEmerald, bs.r, bs.h, bs.r);
        foliage.position.set(bs.x, bs.y, bs.z);
        const rim = makeMesh(THREE, g.torusThin, m.hammeredBronze, bs.r * 0.94, bs.r * 0.94, 1.0);
        rim.rotation.x = HALF_PI;
        rim.position.set(bs.x, bs.y - bs.h * 0.44, bs.z);
        root.add(foliage, rim);
      }
    }

    // Spire Leaf-Spear Finial
    const finialY = is3A ? 9.52 : (isT2 ? 8.55 : (is3B ? 7.85 : 7.45));
    const finial = makeMesh(THREE, g.octa, is3A ? m.starlightCrystal : trimMat, 0.18, 0.68, 0.18);
    finial.position.y = finialY;
    root.add(finial);

    // 5. Rotating Archer Aim Pivot (+Z forward!)
    const aimPivot = new THREE.Group();
    aimPivot.position.y = platY + 0.11;
    const archers = [];

    const mainArcher = buildSculptedElvenArcher(cache, variant);
    const mainScale = is3A ? 1.16 : (is3B ? 0.96 : 1.04);
    mainArcher.group.scale.setScalar(mainScale);
    if (is3B) mainArcher.group.position.set(0, 0.12, 0.10);
    aimPivot.add(mainArcher.group);
    archers.push(mainArcher);

    if (is3B) {
      // 2 Flanking Hooded Mirkwood Wardens on Cantilevered Bronze-and-Oak Bough Decks!
      for (let s = -1; s <= 1; s += 2) {
        const branchArm = makeMesh(THREE, g.cyl8, woodMat, 0.14, 1.25, 0.14);
        branchArm.position.set(s * 0.58, -0.78, -0.04);
        branchArm.rotation.z = -s * 0.96;

        const podDeck = makeMesh(THREE, g.cyl12, m.mirkwoodBark, 0.62, 0.18, 0.62);
        podDeck.position.set(s * 1.08, -0.56, -0.06);
        const podRim = makeMesh(THREE, g.torusThin, m.hammeredBronze, 0.63, 0.63, 1.0);
        podRim.rotation.x = HALF_PI;
        podRim.position.set(s * 1.08, -0.47, -0.06);

        const leafShield = makeMesh(THREE, g.mallornLeaf, m.mallornLeafGold, 0.72, 0.62, 0.8);
        leafShield.position.set(s * 1.38, -0.48, 0.34);
        leafShield.rotation.y = s * 0.35;
        leafShield.rotation.x = 0.25;
        aimPivot.add(branchArm, podDeck, podRim, leafShield);

        const warden = buildSculptedElvenArcher(cache, variant);
        warden.group.scale.setScalar(0.90);
        warden.group.position.set(s * 1.08, -0.47, -0.06);
        warden.group.rotation.y = s * 0.22; // fanned volley formation!
        aimPivot.add(warden.group);
        archers.push(warden);
      }
    }
    root.add(aimPivot);

    const totalH = finialY + 0.35;
    const status = buildTowerStatusOverlay(cache, totalH, 2.08);
    root.add(status.group);

    const hitMesh = buildFittedHitMesh(cache, 2.15, Math.min(7.8, totalH));
    root.add(hitMesh);

    const flashMeshes = finalizeShadowAndBaseMats(root);

    return {
      group: root,
      root,
      type: 'elven',
      tier: is3A || is3B ? 3 : (isT2 ? 2 : 1),
      branch: is3A ? 'A' : (is3B ? 'B' : null),
      variantKey: 'elven_' + variant,
      aimPivot,
      archers,
      starlightCrystal,
      starlightRing1,
      starlightRing2,
      lanternCrystals,
      status,
      hitMesh,
      flashMeshes,
      muzzleHeight: platY + 1.25
    };
  }

  // ============================================================================
  // 6. ALL 4 GARRISON OF MEN WATCH-KEEPS (T1, T2, CITADEL PHALANX, ROHAN MEAD-HALL)
  // ============================================================================
  function buildGarrisonTowerRig(variant, cache) {
    const THREE = cache.THREE;
    const g = cache.geos;
    const m = cache.mats;

    const root = new THREE.Group();
    const isT2 = variant === '2_0';
    const is3A = variant === '3_A'; // Tower Guard Phalanx (Minas Tirith Citadel Bastion)
    const is3B = variant === '3_B'; // Knights of the Riddermark (Rohan Mead-Hall Stable Keep)

    const wallMat = is3A ? m.whiteMarble : m.ashlarStone;
    const trimMat = is3A ? m.ironBlack : (is3B ? m.timberOak : m.ashlarDark);
    const accentMetal = is3A ? m.mithrilSilver : m.goldBurnished;
    const keepScaleY = is3A ? 1.16 : (isT2 ? 1.09 : (is3B ? 0.92 : 1.0));
    const parapetY = 5.02 * keepScaleY;

    // 1. Battered Octagonal/Cylindrical Gondorian Ashlar Masonry Keep
    const keepBody = makeMesh(THREE, g.garrisonKeepOct, wallMat, 1.0, keepScaleY, 1.0);
    root.add(keepBody);

    // Stepped stone foundation curb & forged iron/stone binding bands
    const curb = makeMesh(THREE, g.cyl12, trimMat, 2.30, 0.22, 2.30);
    curb.position.y = 0.11;
    const midBand = makeMesh(THREE, g.cyl16 || g.cyl, is3A ? m.ironBlack : trimMat, 1.76, 0.18, 1.76);
    midBand.position.y = 2.65 * keepScaleY;
    root.add(curb, midBand);

    // Projecting Stone Buttresses & Corbeled Machicolations
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * TWO_PI;
      const isFrontGate = Math.cos(ang) > 0.85;
      if (!isFrontGate) {
        const bx = Math.sin(ang) * 1.82;
        const bz = Math.cos(ang) * 1.82;
        const buttress = makeMesh(THREE, g.box, trimMat, 0.36, 2.55 * keepScaleY, 0.46);
        buttress.position.set(bx, 1.28 * keepScaleY, bz);
        buttress.rotation.y = ang;
        const slopeCap = makeMesh(THREE, g.cone4, wallMat, 0.30, 0.42, 0.38);
        slopeCap.position.set(bx, 2.72 * keepScaleY, bz);
        slopeCap.rotation.y = ang + Math.PI * 0.25;
        root.add(buttress, slopeCap);
      }

      // Corbel brackets under overhanging parapet
      for (let c = -1; c <= 1; c += 2) {
        const cAng = ang + c * 0.14;
        const corbel = makeMesh(THREE, g.box, trimMat, 0.16, 0.42, 0.28);
        corbel.position.set(Math.sin(cAng) * 1.78, 4.46 * keepScaleY, Math.cos(cAng) * 1.78);
        corbel.rotation.y = cAng;
        root.add(corbel);
      }
    }

    // Lit Amber Arrow-Slit Embrasures around mid-keep
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * TWO_PI + Math.PI * 0.25;
      const wx = Math.sin(ang) * 1.72;
      const wz = Math.cos(ang) * 1.72;
      const frame = makeMesh(THREE, g.box, trimMat, 0.36, 0.96, 0.14);
      frame.position.set(wx, 3.45 * keepScaleY, wz);
      frame.rotation.y = ang;
      const slit = makeMesh(THREE, g.box, m.windowAmber, 0.12, 0.74, 0.18);
      slit.position.set(wx, 3.45 * keepScaleY, wz);
      slit.rotation.y = ang;
      slit.userData.noFlash = true;
      root.add(frame, slit);
    }

    // 2. Recessed Gatehouse (+Z) with Iron-Studded Oak Double Doors + Spiked Portcullis Grate!
    const gateFrame = new THREE.Group();
    gateFrame.position.set(0, 0, 1.74);

    const archSurround = makeMesh(THREE, g.gateArchFrame, trimMat, 1, 1, 1);
    const gateRecess = makeMesh(THREE, g.box, m.ironBlack, 1.12, 1.92, 0.24);
    gateRecess.position.set(0, 0.96, -0.08);
    gateFrame.add(archSurround, gateRecess);

    // Hinged Iron-Studded Oak Double Doors (exact doorPivotL / doorPivotR hooks!)
    const doorPivotL = new THREE.Group();
    doorPivotL.position.set(-0.52, 0.86, 0.04);
    doorPivotL.rotation.y = -0.18; // slightly ajar so depth & portcullis read crisply!
    const doorMeshL = makeMesh(THREE, g.box, m.timberOak, 0.50, 1.70, 0.09);
    doorMeshL.position.set(0.25, 0, 0);
    doorPivotL.add(doorMeshL);

    const doorPivotR = new THREE.Group();
    doorPivotR.position.set(0.52, 0.86, 0.04);
    doorPivotR.rotation.y = 0.18;
    const doorMeshR = makeMesh(THREE, g.box, m.timberOak, 0.50, 1.70, 0.09);
    doorMeshR.position.set(-0.25, 0, 0);
    doorPivotR.add(doorMeshR);

    for (let h = -1; h <= 1; h++) {
      const strapL = makeMesh(THREE, g.box, m.forgedDarkIron, 0.46, 0.07, 0.11);
      strapL.position.set(0.25, h * 0.50, 0.01);
      const strapR = makeMesh(THREE, g.box, m.forgedDarkIron, 0.46, 0.07, 0.11);
      strapR.position.set(-0.25, h * 0.50, 0.01);
      doorPivotL.add(strapL);
      doorPivotR.add(strapR);
    }

    // Raised Spiked Black-Iron Portcullis Grate in Upper Archway!
    const portcullis = new THREE.Group();
    portcullis.position.set(0, 1.56, 0.10);
    for (let b = -2; b <= 2; b++) {
      const bar = makeMesh(THREE, g.cyl6, m.ironBlack, 0.028, 0.68, 0.028);
      bar.position.set(b * 0.21, 0, 0);
      const spike = makeMesh(THREE, g.cone4, m.steelBright, 0.048, 0.16, 0.048);
      spike.rotation.x = Math.PI;
      spike.position.set(b * 0.21, -0.38, 0);
      portcullis.add(bar, spike);
    }
    const crossGrate = makeMesh(THREE, g.box, m.ironBlack, 1.02, 0.055, 0.06);
    crossGrate.position.y = -0.10;
    portcullis.add(crossGrate);

    gateFrame.add(doorPivotL, doorPivotR, portcullis);
    root.add(gateFrame);

    // 3. Fluttering Draped Heraldic Banner(s)
    const bannerMat = is3B ? m.rohanBanner : (is3A ? m.citadelBanner : m.gondorBanner);
    const bannerPivot = new THREE.Group();
    bannerPivot.position.set(0, 4.30 * keepScaleY, 1.98);
    const crossBar = makeMesh(THREE, g.cyl8, accentMetal, 0.045, 1.12, 0.045);
    crossBar.rotation.z = HALF_PI;
    const bannerCloth = makeMesh(THREE, is3B ? g.bannerSwallow : g.bannerPointed, bannerMat, 0.92, 1.78, 1.0);
    bannerPivot.add(crossBar, bannerCloth);
    root.add(bannerPivot);

    // Side flanking banners on T2, 3A & 3B
    const banners = [bannerPivot];
    if (isT2 || is3A || is3B) {
      for (let s = -1; s <= 1; s += 2) {
        const sAng = s * 0.92;
        const sideB = new THREE.Group();
        sideB.position.set(Math.sin(sAng) * 1.92, 4.15 * keepScaleY, Math.cos(sAng) * 1.92);
        sideB.rotation.y = sAng;
        const sBar = makeMesh(THREE, g.cyl8, accentMetal, 0.038, 0.82, 0.038);
        sBar.rotation.z = HALF_PI;
        const sCloth = makeMesh(THREE, g.bannerPointed, bannerMat, 0.68, 1.38, 1.0);
        sideB.add(sBar, sCloth);
        root.add(sideB);
        banners.push(sideB);
      }
    }

    // 4. Variant-Specific Battlements, Timber Hoardings, Citadel Spire or Rohan Mead-Hall!
    let brazierFlame = null;
    let totalH = parapetY + 1.25;

    if (!is3B) {
      // Crenellated Stone Merlons with Beveled Coping Caps
      const merlonCount = 12;
      for (let i = 0; i < merlonCount; i++) {
        const ang = (i / merlonCount) * TWO_PI;
        const merlon = makeMesh(THREE, g.box, wallMat, 0.48, 0.54, 0.32);
        merlon.position.set(Math.sin(ang) * 1.72, parapetY + 0.25, Math.cos(ang) * 1.72);
        merlon.rotation.y = ang;
        const cap = makeMesh(THREE, g.box, trimMat, 0.54, 0.09, 0.38);
        cap.position.set(Math.sin(ang) * 1.72, parapetY + 0.54, Math.cos(ang) * 1.72);
        cap.rotation.y = ang;
        root.add(merlon, cap);

        // Mounted Heraldic Shields along battlements on T2 & 3A
        if ((isT2 || is3A) && i % 2 === 0) {
          const sh = makeMesh(THREE, is3A ? g.towerPavise : g.heaterShield, is3A ? m.mithrilSilver : m.gondorBlue, 0.68, 0.68, 0.8);
          sh.position.set(Math.sin(ang) * 1.92, parapetY - 0.06, Math.cos(ang) * 1.92);
          sh.rotation.y = ang;
          root.add(sh);
        }
      }
    }

    if (is3A) {
      // === BRANCH A: TOWER GUARD PHALANX (White-Marble & Black-Iron Citadel Bastion + Winged Helm Reliefs!) ===
      // Silver Winged-Helm & Crown Relief above the Portcullis Gate
      const helmRelief = makeMesh(THREE, g.conicalHelm, m.mithrilSilver, 1.15, 1.15, 0.7);
      helmRelief.position.set(0, 2.48, 1.92);
      root.add(helmRelief);
      for (let s = -1; s <= 1; s += 2) {
        const rWing = makeMesh(THREE, g.helmWing, m.wingFeatherWhite, 0.95, 0.95, 0.95);
        rWing.position.set(s * 0.24, 2.55, 1.96);
        rWing.rotation.y = -s * 1.18;
        root.add(rWing);
      }

      // 4 Black-Iron Corner Pedestals with Blazing Beacon Braziers
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * TWO_PI + Math.PI * 0.25;
        const bx = Math.sin(ang) * 1.62;
        const bz = Math.cos(ang) * 1.62;
        const ped = makeMesh(THREE, g.cyl8, m.ironBlack, 0.28, 0.52, 0.28);
        ped.position.set(bx, parapetY + 0.26, bz);
        const bowl = makeMesh(THREE, g.cone8, m.goldBurnished, 0.38, 0.26, 0.38);
        bowl.rotation.x = Math.PI;
        bowl.position.set(bx, parapetY + 0.56, bz);
        const flmGroup = new THREE.Group();
        flmGroup.position.set(bx, parapetY + 0.68, bz);
        const flm = makeMesh(THREE, g.cone8, m.forgeFire, 0.30, 0.64, 0.30);
        flm.position.y = 0.22;
        flm.userData.noFlash = true;
        flmGroup.add(flm);
        root.add(ped, bowl, flmGroup);
        if (i === 0) brazierFlame = flmGroup;
      }

      // Soaring Minas Tirith Citadel Tower Turret + Spear-Prow Silver Spire!
      const turret = makeMesh(THREE, g.cyl12, m.whiteMarble, 1.06, 1.65, 1.06);
      turret.position.y = parapetY + 0.65;
      const ironCollar = makeMesh(THREE, g.cyl12, m.ironBlack, 1.14, 0.22, 1.14);
      ironCollar.position.y = parapetY + 1.48;
      const spire = makeMesh(THREE, g.cone, m.mithrilSilver, 1.12, 1.85, 1.12);
      spire.position.y = parapetY + 2.48;
      const prowFinial = makeMesh(THREE, g.octa, m.goldRadiant, 0.18, 0.72, 0.18);
      prowFinial.position.y = parapetY + 3.55;
      root.add(turret, ironCollar, spire, prowFinial);
      totalH = parapetY + 3.92;
    } else if (is3B) {
      // === BRANCH B: KNIGHTS OF THE RIDDERMARK (Timber-and-Stone Rohan Mead-Hall / Cavalry Stable Keep!) ===
      // Iron horse-tether rings & mounted round Rohan sun-shields flanking the stable gate
      for (let s = -1; s <= 1; s += 2) {
        const shield = makeMesh(THREE, g.cyl, m.rohanGreen, 0.36, 0.06, 0.36);
        shield.rotation.x = HALF_PI;
        shield.position.set(s * 1.12, 1.65, 1.68);
        const boss = makeMesh(THREE, g.sphereLow, m.goldBurnished, 0.11, 0.11, 0.08);
        boss.position.set(s * 1.12, 1.65, 1.72);
        const tether = makeMesh(THREE, g.torusThin, m.forgedDarkIron, 0.14, 0.14, 1.2);
        tether.position.set(s * 0.92, 0.95, 1.86);
        root.add(shield, boss, tether);
      }

      // Golden-Oak Timber-Framed Upper Mead-Hall Gallery
      const hallBaseY = parapetY - 0.35;
      const hallBox = makeMesh(THREE, g.box, m.timberOak, 3.10, 1.45, 3.30);
      hallBox.position.y = hallBaseY + 0.72;
      root.add(hallBox);

      // Carved Gold-Trimmed Corner Timber Posts & Warm Mead-Hall Dormer Windows
      for (let sx = -1; sx <= 1; sx += 2) {
        for (let sz = -1; sz <= 1; sz += 2) {
          const post = makeMesh(THREE, g.cyl8, m.goldBurnished, 0.14, 1.55, 0.14);
          post.position.set(sx * 1.56, hallBaseY + 0.74, sz * 1.66);
          root.add(post);
        }
        const hallWin = makeMesh(THREE, g.lancetWindow, m.windowAmber, 0.85, 0.75, 1.0);
        hallWin.position.set(sx * 1.58, hallBaseY + 0.34, 0);
        hallWin.rotation.y = sx * HALF_PI;
        hallWin.userData.noFlash = true;
        root.add(hallWin);
      }

      // Steep Pitched Emerald-Green Shingled Mead-Hall Gable Roof!
      const roofY = hallBaseY + 1.42;
      const gableRoof = makeMesh(THREE, g.meadHallRoof, m.rohanShingles, 1.0, 1.0, 1.0);
      gableRoof.position.y = roofY;
      const ridgeBeam = makeMesh(THREE, g.box, m.goldBurnished, 0.16, 0.18, 4.32);
      ridgeBeam.position.set(0, roofY + 2.30, 0);
      root.add(gableRoof, ridgeBeam);

      // Golden Bargeboards & Crossed Sculpted Horse-Head Finials at Front (+Z) & Rear (-Z) Gables!
      for (let gz = -1; gz <= 1; gz += 2) {
        const zPos = gz * 2.08;
        const sunDisc = makeMesh(THREE, g.cyl, m.goldRadiant, 0.38, 0.08, 0.38);
        sunDisc.rotation.x = HALF_PI;
        sunDisc.position.set(0, roofY + 1.15, zPos);
        root.add(sunDisc);

        for (let s = -1; s <= 1; s += 2) {
          const barge = makeMesh(THREE, g.box, m.goldBurnished, 0.12, 2.95, 0.10);
          barge.position.set(s * 1.08, roofY + 1.12, zPos);
          barge.rotation.z = s * 0.76;

          const horseCrest = makeMesh(THREE, g.rohanHorseCrest, m.goldRadiant, 0.95, 0.95, 0.95);
          horseCrest.position.set(s * 0.08, roofY + 2.22, zPos);
          horseCrest.rotation.y = s > 0 ? HALF_PI : -HALF_PI;
          horseCrest.rotation.x = 0.22;
          root.add(barge, horseCrest);
        }
      }
      totalH = roofY + 3.05;
    } else {
      // === T1 & T2 GONDORIAN WATCH-KEEP: Timber Hoardings, Bartizans, Watch-Braziers & Spear Rack! ===
      // Overhanging Timber Hoardings on Left & Right Flanks
      for (let s = -1; s <= 1; s += 2) {
        const hoardBox = makeMesh(THREE, g.box, m.timberOak, 0.46, 0.76, 1.36);
        hoardBox.position.set(s * 1.84, parapetY - 0.16, 0);
        const hoardRoof = makeMesh(THREE, g.cone4Aligned, m.slateShingles, 0.42, 0.48, 1.06);
        hoardRoof.position.set(s * 1.84, parapetY + 0.44, 0);
        root.add(hoardBox, hoardRoof);
      }

      // T2 Bastion of the West: 2 Rear-Flank Octagonal Stone Bartizan Turrets + Winged Keystone!
      if (isT2) {
        const wingCrest = makeMesh(THREE, g.octa, m.mithrilSilver, 0.28, 0.46, 0.16);
        wingCrest.position.set(0, 2.52, 1.94);
        root.add(wingCrest);
        for (let s = -1; s <= 1; s += 2) {
          const w = makeMesh(THREE, g.helmWing, m.wingFeatherWhite, 0.72, 0.72, 0.72);
          w.position.set(s * 0.20, 2.52, 1.96);
          w.rotation.y = -s * 1.15;
          root.add(w);

          const bartizan = makeMesh(THREE, g.cyl8, wallMat, 0.62, 1.42, 0.62);
          bartizan.position.set(s * 1.15, parapetY + 0.38, -1.05);
          const bRoof = makeMesh(THREE, g.cone8, m.slateShingles, 0.74, 0.96, 0.74);
          bRoof.position.set(s * 1.15, parapetY + 1.54, -1.05);
          root.add(bartizan, bRoof);
        }
        totalH = parapetY + 2.08;
      }

      // Parapet Iron Watch-Brazier (wrapped in unit-scale Group so setScalar(flick) scales cleanly!)
      const bowl = makeMesh(THREE, g.cone8, m.forgedDarkIron, 0.44, 0.32, 0.44);
      bowl.rotation.x = Math.PI;
      bowl.position.set(-0.78, parapetY - 0.08, 0.56);
      brazierFlame = new THREE.Group();
      brazierFlame.position.set(-0.78, parapetY + 0.08, 0.56);
      const flameOuter = makeMesh(THREE, g.cone8, m.forgeFire, 0.32, 0.66, 0.32);
      flameOuter.position.y = 0.28;
      flameOuter.userData.noFlash = true;
      const flameInner = makeMesh(THREE, g.cone8, m.anorFlame, 0.18, 0.44, 0.18);
      flameInner.position.y = 0.24;
      flameInner.userData.noFlash = true;
      brazierFlame.add(flameOuter, flameInner);
      root.add(bowl, brazierFlame);

      // Parapet Weapon Rack (3 gleaming Gondorian spears & shield ready for deployment)
      for (let sp = -1; sp <= 1; sp++) {
        const spear = makeMesh(THREE, g.shaftUp, m.timberOak, 0.032, 1.45, 0.032);
        spear.position.set(0.68 + sp * 0.16, parapetY - 0.35, -0.35);
        spear.rotation.z = -0.10;
        const tip = makeMesh(THREE, g.cone4, m.steelBright, 0.065, 0.28, 0.04);
        tip.position.set(0.82 + sp * 0.16, parapetY + 1.12, -0.35);
        root.add(spear, tip);
      }
    }

    // 5. Road Rally Formation Ring + Faction Standard (separate group — NEVER inside root!)
    const rallyGroup = new THREE.Group();
    const formR = is3B ? 2.05 : 1.65;
    const formRing = makeMesh(THREE, g.ring, m.rallyGoldRing, formR, formR, 1);
    formRing.rotation.x = -HALF_PI;
    formRing.userData.noShadow = true;
    const formFill = makeMesh(THREE, g.disc, m.rallyGoldFill, formR * 0.94, formR * 0.94, 1);
    formFill.rotation.x = -HALF_PI;
    formFill.position.y = -0.01;
    formFill.userData.noShadow = true;
    rallyGroup.add(formRing, formFill);

    const pole = makeMesh(THREE, g.shaftUp, m.goldBurnished, 0.042, 1.45, 0.042);
    const poleFinial = makeMesh(THREE, g.octa, accentMetal, 0.09, 0.18, 0.09);
    poleFinial.position.y = 1.52;
    const pennant = makeMesh(THREE, g.bannerSwallow, bannerMat, 0.38, 0.62, 1);
    pennant.position.set(0.20, 1.38, 0);
    pennant.rotation.z = HALF_PI * 0.18;
    rallyGroup.add(pole, poleFinial, pennant);

    let tauntRing = null;
    if (is3A) {
      tauntRing = makeMesh(THREE, g.ringDash, m.tauntAuraRing, 8.5, 8.5, 1);
      tauntRing.rotation.x = -HALF_PI;
      tauntRing.position.y = 0.02;
      tauntRing.userData.noShadow = true;
      rallyGroup.add(tauntRing);
    }

    const status = buildTowerStatusOverlay(cache, totalH, 2.12);
    root.add(status.group);

    const hitMesh = buildFittedHitMesh(cache, 2.22, Math.min(7.8, totalH));
    root.add(hitMesh);

    const flashMeshes = finalizeShadowAndBaseMats(root);
    finalizeShadowAndBaseMats(rallyGroup);

    return {
      group: root,
      root,
      rallyGroup,
      tauntRing,
      type: 'garrison',
      tier: is3A || is3B ? 3 : (isT2 ? 2 : 1),
      branch: is3A ? 'A' : (is3B ? 'B' : null),
      variantKey: 'garrison_' + variant,
      doorPivotL,
      doorPivotR,
      portcullis,
      bannerPivot,
      banners,
      brazierFlame,
      status,
      hitMesh,
      flashMeshes,
      muzzleHeight: parapetY + 0.55
    };
  }

  // ============================================================================
  // 7. ALL 4 DWARVEN SIEGE FOUNDRY TOWERS (TREBUCHET T1/T2, BOMBARD 3A, BALLISTA 3B)
  // ============================================================================
  function buildDwarvenTowerRig(variant, cache) {
    const THREE = cache.THREE;
    const g = cache.geos;
    const m = cache.mats;

    const root = new THREE.Group();
    const isT2 = variant === '2_0';
    const is3A = variant === '3_A'; // Iron Hills Mortar (Geared Bronze Siege Bombard)
    const is3B = variant === '3_B'; // Khazad Ballista (Armored Twin-Arm Torsion Ballista)

    const bastionScaleY = (is3A || is3B) ? 0.88 : (isT2 ? 1.16 : 1.04);
    const bastionTopY = 3.28 * bastionScaleY;
    const baseStoneMat = isT2 ? m.dwarfRuneStone : m.ashlarStone;
    const bandMat = (isT2 || is3B) ? m.hammeredBronze : m.forgedDarkIron;

    // 1. Heavy Polygonal Iron-Banded Dwarven Stone Siege Bastion
    const bastion = makeMesh(THREE, g.dwarvenBastion, baseStoneMat, 1.0, bastionScaleY, 1.0);
    root.add(bastion);

    // Riveted Iron & Hammered Bronze Horizontal Bands + Dwarf-Rune Buttress Piers
    const bandLow = makeMesh(THREE, g.cyl8, m.forgedDarkIron, 2.12, 0.24, 2.12);
    bandLow.position.y = 0.88 * bastionScaleY;
    const bandHigh = makeMesh(THREE, g.cyl8, bandMat, 1.98, 0.26, 1.98);
    bandHigh.position.y = 2.42 * bastionScaleY;
    root.add(bandLow, bandHigh);

    for (let i = 0; i < 8; i++) {
      const cornerAng = (i / 8) * TWO_PI + Math.PI / 8;
      const pier = makeMesh(THREE, g.box, m.forgedDarkIron, 0.32, 2.86 * bastionScaleY, 0.34);
      pier.position.set(Math.sin(cornerAng) * 1.96, 1.43 * bastionScaleY, Math.cos(cornerAng) * 1.96);
      pier.rotation.y = cornerAng;
      const runeCap = makeMesh(THREE, g.octa, m.goldBurnished, 0.18, 0.26, 0.18);
      runeCap.position.set(Math.sin(cornerAng) * 2.02, 2.92 * bastionScaleY, Math.cos(cornerAng) * 2.02);
      root.add(pier, runeCap);

      // Glowing Orange Furnace Grate Vents on Iron Hills Mortar (3A) & Khazad T2
      const faceAng = (i / 8) * TWO_PI;
      if ((is3A || isT2) && i % 2 === 0) {
        const grateFrame = makeMesh(THREE, g.box, m.ironBlack, 0.62, 0.56, 0.16);
        grateFrame.position.set(Math.sin(faceAng) * 1.96, 0.72, Math.cos(faceAng) * 1.96);
        grateFrame.rotation.y = faceAng;
        const ventGlow = makeMesh(THREE, g.box, m.forgeFire, 0.46, 0.40, 0.18);
        ventGlow.position.set(Math.sin(faceAng) * 1.98, 0.72, Math.cos(faceAng) * 1.98);
        ventGlow.rotation.y = faceAng;
        ventGlow.userData.noFlash = true;
        root.add(grateFrame, ventGlow);
      } else if (is3B && i % 2 === 0) {
        // Angular Khazad Gold-and-Bronze Rune Shields on Ballista Bastion
        const runeShield = makeMesh(THREE, g.heaterShield, m.hammeredBronze, 0.78, 0.78, 0.9);
        runeShield.position.set(Math.sin(faceAng) * 1.98, 1.55 * bastionScaleY, Math.cos(faceAng) * 1.98);
        runeShield.rotation.y = faceAng;
        root.add(runeShield);
      }
    }

    // 2. Toothed Bronze Turntable Ring
    const gearRing = makeMesh(THREE, g.gearTurntable, m.hammeredBronze, 1.0, 1.0, 1.0);
    gearRing.rotation.x = HALF_PI;
    gearRing.position.y = bastionTopY + 0.11;
    root.add(gearRing);

    // 3. Rotating Siege Engine Turret (+Z forward!)
    const aimPivot = new THREE.Group();
    aimPivot.position.y = bastionTopY + 0.22;
    root.add(aimPivot);

    let armPivot = null;
    let windlass = null;
    let counterweight = null;
    let payloadBoulder = null;
    let barrelRecoilGroup = null;
    let muzzleFlashMesh = null;
    let prodL = null;
    let prodR = null;
    let loadedBolts = null;
    let totalH = bastionTopY + 2.85;
    let muzzleHeight = bastionTopY + 1.65;

    if (is3A) {
      // === BRANCH A: IRON HILLS MORTAR (Massive Geared Bronze & Iron Bombard Cannon — Ref Bottom-Center!) ===
      const deck = makeMesh(THREE, g.cyl8, m.forgedDarkIron, 1.64, 0.24, 1.64);
      deck.position.y = 0.12;
      aimPivot.add(deck);

      // Heavy Recoil Sled Rails
      for (let s = -1; s <= 1; s += 2) {
        const sledRail = makeMesh(THREE, g.box, m.ironBlack, 0.18, 0.14, 2.05);
        sledRail.position.set(s * 0.72, 0.28, -0.05);
        aimPivot.add(sledRail);

        // Sculpted Stepped Iron & Hammered-Bronze Trunnion Carriage Cheeks
        const cheek = makeMesh(THREE, g.carriageCheek, m.forgedDarkIron, 1.0, 1.05, 1.0);
        cheek.position.set(s * 0.72, 0.30, 0.02);
        const bronzeInlay = makeMesh(THREE, g.carriageCheek, m.hammeredBronze, 1.08, 0.74, 0.76);
        bronzeInlay.position.set(s * 0.72, 0.32, 0.04);

        // Exposed Toothed Brass Elevation Gear + Spoked Handwheel
        const elevGear = makeMesh(THREE, g.gearLarge, m.goldBurnished, 1.0, 1.0, 1.0);
        elevGear.rotation.y = HALF_PI;
        elevGear.position.set(s * 0.90, 0.84, -0.14);
        const wheelRim = makeMesh(THREE, g.torusThin, m.steelBright, 0.26, 0.26, 1.2);
        wheelRim.rotation.y = HALF_PI;
        wheelRim.position.set(s * 0.98, 0.62, -0.52);
        aimPivot.add(cheek, bronzeInlay, elevGear, wheelRim);
      }

      // Ammunition Rack of Fiery Incendiary Mortar Shells + Iron Powder Keg
      const rackTray = makeMesh(THREE, g.box, m.forgedDarkIron, 0.56, 0.14, 1.02);
      rackTray.position.set(-1.18, 0.28, 0.08);
      aimPivot.add(rackTray);
      const shellCoords = [
        [-1.18, 0.46, 0.34], [-1.18, 0.46, -0.16],
        [-1.18, 0.46, 0.09], [-1.18, 0.78, 0.12]
      ];
      for (let k = 0; k < shellCoords.length; k++) {
        const sc = shellCoords[k];
        const shell = makeMesh(THREE, g.sphere, m.moltenBoulder, 0.21, 0.21, 0.21);
        shell.position.set(sc[0], sc[1], sc[2]);
        aimPivot.add(shell);
      }
      const keg = makeMesh(THREE, g.cyl12, m.timberOak, 0.24, 0.52, 0.24);
      keg.position.set(1.18, 0.48, -0.32);
      const kegBand = makeMesh(THREE, g.torusThin, m.ironBlack, 0.245, 0.245, 1.2);
      kegBand.rotation.x = HALF_PI;
      kegBand.position.set(1.18, 0.58, -0.32);
      aimPivot.add(keg, kegBand);

      // Bombard Barrel Pitch Mount (~28° upward elevation) + Recoil Slide Group
      const barrelPitch = new THREE.Group();
      barrelPitch.position.set(0, 1.24, 0.08);
      barrelPitch.rotation.x = -0.48;
      aimPivot.add(barrelPitch);

      barrelRecoilGroup = new THREE.Group();
      barrelPitch.add(barrelRecoilGroup);

      // Massive Stepped Hammered-Bronze Barrel + Riveted Dark-Iron Reinforcing Hoops
      const barrel = makeMesh(THREE, g.bombardBarrel, m.hammeredBronze, 1.06, 1.06, 1.10);
      const trunnionBar = makeMesh(THREE, g.cyl12, m.ironBlack, 0.18, 1.88, 0.18);
      trunnionBar.rotation.z = HALF_PI;
      trunnionBar.position.z = 0.06;
      const cascabelKnob = makeMesh(THREE, g.sphere, m.goldBurnished, 0.24, 0.24, 0.28);
      cascabelKnob.position.z = -1.32;

      const hoopZ = [-0.55, 0.22, 1.02];
      const hoopR = [0.68, 0.61, 0.59];
      for (let h = 0; h < hoopZ.length; h++) {
        const hoop = makeMesh(THREE, g.torusThick, m.forgedDarkIron, hoopR[h], hoopR[h], 0.95);
        hoop.position.z = hoopZ[h];
        barrelRecoilGroup.add(hoop);
      }
      const muzzleCrown = makeMesh(THREE, g.torusThick, m.goldBurnished, 0.66, 0.66, 1.05);
      muzzleCrown.position.z = 2.02;

      // Glowing orange molten furnace ember deep inside the bore
      const boreGlow = makeMesh(THREE, g.sphereLow, m.forgeFire, 0.36, 0.36, 0.22);
      boreGlow.position.z = 1.96;
      boreGlow.userData.noFlash = true;

      muzzleFlashMesh = makeMesh(THREE, g.sphereLow, m.anorFlame, 0.001, 0.001, 0.001);
      muzzleFlashMesh.position.z = 2.42;
      muzzleFlashMesh.visible = false;
      muzzleFlashMesh.userData.noShadow = true;
      muzzleFlashMesh.userData.noFlash = true;

      barrelRecoilGroup.add(barrel, trunnionBar, cascabelKnob, muzzleCrown, boreGlow, muzzleFlashMesh);
      totalH = bastionTopY + 2.85;
      muzzleHeight = bastionTopY + 2.15;
    } else if (is3B) {
      // === BRANCH B: KHAZAD BALLISTA (Heavy Armored Twin-Arm / Twin-Rail Siege Ballista — Ref Upper-Right!) ===
      const casemate = makeMesh(THREE, g.box, m.hammeredBronze, 1.62, 0.88, 1.96);
      casemate.position.set(0, 0.52, -0.06);
      aimPivot.add(casemate);

      // Sloped Armored Notched Steel Frontal Mantlet Shield
      for (let s = -1; s <= 1; s += 2) {
        const wingPlate = makeMesh(THREE, g.box, m.forgedDarkIron, 0.82, 1.02, 0.24);
        wingPlate.position.set(s * 0.58, 0.68, 0.96);
        wingPlate.rotation.x = -0.28;
        wingPlate.rotation.y = -s * 0.20;
        const goldTrim = makeMesh(THREE, g.box, m.goldBurnished, 0.84, 0.12, 0.26);
        goldTrim.position.set(s * 0.58, 1.14, 0.84);
        goldTrim.rotation.x = -0.28;
        goldTrim.rotation.y = -s * 0.20;
        aimPivot.add(wingPlate, goldTrim);
      }

      // Twin Vertical Hammered-Bronze Torsion Housings + Sweeping Spring-Steel Prods!
      for (let s = -1; s <= 1; s += 2) {
        const housing = makeMesh(THREE, g.cyl12, m.hammeredBronze, 0.30, 1.22, 0.30);
        housing.position.set(s * 0.96, 0.82, 0.72);
        const capTop = makeMesh(THREE, g.gearLarge, m.goldBurnished, 0.78, 0.78, 1.1);
        capTop.rotation.x = HALF_PI;
        capTop.position.set(s * 0.96, 1.44, 0.72);
        const sinewCoil = makeMesh(THREE, g.cyl12, m.ropeHemp, 0.32, 0.52, 0.32);
        sinewCoil.position.set(s * 0.96, 0.82, 0.72);
        aimPivot.add(housing, capTop, sinewCoil);

        const prodPivot = new THREE.Group();
        prodPivot.position.set(s * 0.96, 0.98, 0.72);
        // Flexed initial tension pose (+0.14 / -0.14 matches models_3d.js rest!)
        prodPivot.rotation.y = s * 0.14;

        // Upper & lower laminated spring-steel prods
        const prodGeo = s < 0 ? g.ballistaProdL : g.ballistaProd;
        const armMain = makeMesh(THREE, prodGeo, m.steelBright, 1.0, 1.0, 1.0);
        const armLower = makeMesh(THREE, prodGeo, m.forgedDarkIron, 0.82, 0.85, 0.85);
        armLower.position.y = -0.22;
        const tipCap = makeMesh(THREE, g.octa, m.goldBurnished, 0.09, 0.14, 0.09);
        tipCap.position.set(s * 1.32, 0.04, -0.46);
        prodPivot.add(armMain, armLower, tipCap);
        aimPivot.add(prodPivot);

        if (s < 0) prodL = prodPivot;
        else prodR = prodPivot;

        // Taut Braided Bowstring from Prod Tip back to Rear Trigger Claw!
        const str = makeMesh(THREE, g.cyl6, m.ropeHemp, 0.022, 1.56, 0.022);
        str.position.set(s * 1.12, 1.02, -0.34);
        str.rotation.x = HALF_PI;
        str.rotation.z = s * 0.92;
        aimPivot.add(str);

        // Rear Ratcheting Bronze Winch Gear & Crank
        const winch = makeMesh(THREE, g.gearLarge, m.goldBurnished, 0.85, 0.85, 1.0);
        winch.rotation.y = HALF_PI;
        winch.position.set(s * 0.86, 0.88, -0.88);
        aimPivot.add(winch);
      }

      // Twin Parallel Grooved Steel Flight Rails + Trigger Latch
      for (let s = -1; s <= 1; s += 2) {
        const rail = makeMesh(THREE, g.box, m.ironBlack, 0.22, 0.18, 2.68);
        rail.position.set(s * 0.36, 1.02, 0.32);
        aimPivot.add(rail);
      }
      const claw = makeMesh(THREE, g.box, m.goldBurnished, 0.96, 0.16, 0.22);
      claw.position.set(0, 1.12, -0.68);
      aimPivot.add(claw);

      // Twin Loaded Glowing Mithril Siege Bolts!
      loadedBolts = new THREE.Group();
      for (let s = -1; s <= 1; s += 2) {
        const shaft = makeMesh(THREE, g.cyl8, m.forgedDarkIron, 0.055, 2.15, 0.055);
        shaft.rotation.x = HALF_PI;
        shaft.position.set(s * 0.36, 1.16, 0.52);
        const mithrilHead = makeMesh(THREE, g.cone4, m.mithrilSilver, 0.145, 0.56, 0.145);
        mithrilHead.rotation.x = HALF_PI;
        mithrilHead.position.set(s * 0.36, 1.16, 1.78);
        mithrilHead.userData.noFlash = true;
        const glowCore = makeMesh(THREE, g.octa, m.cyanBowGlow, 0.08, 0.32, 0.08);
        glowCore.rotation.x = HALF_PI;
        glowCore.position.set(s * 0.36, 1.16, 1.62);
        glowCore.userData.noFlash = true;
        const vanes = makeMesh(THREE, g.box, m.goldBurnished, 0.22, 0.04, 0.32);
        vanes.position.set(s * 0.36, 1.16, -0.36);
        loadedBolts.add(shaft, mithrilHead, glowCore, vanes);
      }
      aimPivot.add(loadedBolts);
      totalH = bastionTopY + 1.72;
      muzzleHeight = bastionTopY + 1.40;
    } else {
      // === T1 & T2: COUNTERWEIGHT TREBUCHET / CATAPULT ON DWARVEN SIEGE TOWER (Ref Center-Left!) ===
      // Arched Dwarven Foundry Gate & Khazad Banner on Front (+Z) of Stone Bastion
      const forgeBanner = makeMesh(THREE, g.bannerPointed, m.dwarvenBanner, 0.76, 1.38, 1.0);
      forgeBanner.position.set(0, 2.48 * bastionScaleY, 2.02);
      root.add(forgeBanner);

      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * TWO_PI;
        const merlon = makeMesh(THREE, g.box, baseStoneMat, 0.58, 0.46, 0.34);
        merlon.position.set(Math.sin(ang) * 1.78, bastionTopY + 0.20, Math.cos(ang) * 1.78);
        merlon.rotation.y = ang;
        root.add(merlon);
      }

      if (isT2) {
        // T2 Khazad Great Catapult: Twin Hammered-Bronze Forge Braziers flanking front!
        for (let s = -1; s <= 1; s += 2) {
          const bBowl = makeMesh(THREE, g.cyl8, m.hammeredBronze, 0.32, 0.28, 0.32);
          bBowl.position.set(s * 1.48, bastionTopY + 0.38, 1.12);
          const bFire = makeMesh(THREE, g.cone8, m.forgeFire, 0.26, 0.52, 0.26);
          bFire.position.set(s * 1.48, bastionTopY + 0.72, 1.12);
          bFire.userData.noFlash = true;
          root.add(bBowl, bFire);
        }
      }

      // Heavy Timber-and-Iron A-Frame Trestle Uprights + Geared Bronze Windlass
      const frameMat = isT2 ? m.forgedDarkIron : m.timberOak;
      const gussetMat = isT2 ? m.hammeredBronze : m.forgedDarkIron;
      const trestleH = isT2 ? 1.82 : 1.62;

      for (let s = -1; s <= 1; s += 2) {
        const sill = makeMesh(THREE, g.box, frameMat, 0.26, 0.24, 2.52);
        sill.position.set(s * 0.66, 0.12, 0);
        const legFront = makeMesh(THREE, g.box, frameMat, 0.22, trestleH, 0.24);
        legFront.position.set(s * 0.66, trestleH * 0.52, 0.48);
        legFront.rotation.x = -0.28;
        const legBack = makeMesh(THREE, g.box, frameMat, 0.22, trestleH, 0.24);
        legBack.position.set(s * 0.66, trestleH * 0.52, -0.48);
        legBack.rotation.x = 0.28;
        const bearing = makeMesh(THREE, g.cyl12, gussetMat, 0.26, 0.22, 0.26);
        bearing.rotation.z = HALF_PI;
        bearing.position.set(s * 0.74, trestleH - 0.04, 0);

        // Geared Bronze Windlass Wheel at Rear
        const winchGear = makeMesh(THREE, g.gearLarge, m.hammeredBronze, isT2 ? 0.96 : 0.76, isT2 ? 0.96 : 0.76, 1.0);
        winchGear.rotation.y = HALF_PI;
        winchGear.position.set(s * 0.84, 0.56, -0.88);
        aimPivot.add(sill, legFront, legBack, bearing, winchGear);
      }

      const mainAxle = makeMesh(THREE, g.cyl12, m.ironBlack, 0.13, 1.66, 0.13);
      mainAxle.rotation.z = HALF_PI;
      mainAxle.position.set(0, trestleH - 0.04, 0);
      windlass = new THREE.Group();
      windlass.position.set(0, 0.56, -0.88);
      const winchDrum = makeMesh(THREE, g.cyl12, m.ropeHemp, 0.18, 1.18, 0.18);
      winchDrum.rotation.z = HALF_PI;
      windlass.add(winchDrum);
      aimPivot.add(mainAxle, windlass);

      // Swinging Counterweight Throwing Arm!
      // Posed at -0.42 rad right out of creation so static portraits show the dramatic cocked trebuchet!
      armPivot = new THREE.Group();
      armPivot.position.set(0, trestleH - 0.04, 0);
      armPivot.rotation.x = -0.42;
      aimPivot.add(armPivot);

      const armLen = isT2 ? 3.68 : 3.24;
      const beam = makeMesh(THREE, g.box, m.timberOak, isT2 ? 0.26 : 0.22, 0.24, armLen);
      beam.position.set(0, 0, -0.58);
      armPivot.add(beam);

      // Iron Reinforcing Bands along Throwing Beam
      for (let b = -2; b <= 1; b++) {
        const strap = makeMesh(THREE, g.box, gussetMat, 0.29, 0.28, 0.12);
        strap.position.set(0, 0, -0.58 + b * 0.72);
        armPivot.add(strap);
      }

      // Hanging Faceted Stone & Iron Counterweight Chest at Front (+Z) End of Arm!
      const cwHanger = new THREE.Group();
      cwHanger.position.set(0, 0, 0.92);
      cwHanger.rotation.x = 0.42; // hangs plumb under gravity in default cocked pose!
      const hangerStrutL = makeMesh(THREE, g.box, m.ironBlack, 0.06, 0.62, 0.10);
      hangerStrutL.position.set(-0.24, -0.28, 0);
      const hangerStrutR = makeMesh(THREE, g.box, m.ironBlack, 0.06, 0.62, 0.10);
      hangerStrutR.position.set(0.24, -0.28, 0);
      const cwChest = makeMesh(THREE, g.cyl6, isT2 ? m.hammeredBronze : m.forgedDarkIron, 0.52, 0.72, 0.48);
      cwChest.position.set(0, -0.68, 0);
      const cwRocks = makeMesh(THREE, g.dodeca, m.ashlarDark, 0.40, 0.28, 0.38);
      cwRocks.position.set(0, -0.32, 0);
      cwHanger.add(hangerStrutL, hangerStrutR, cwChest, cwRocks);
      counterweight = cwHanger;
      armPivot.add(cwHanger);

      // Rear Forged-Iron Throwing Cup + Glowing Molten Magma Boulder (-Z end)!
      const cupZ = -0.58 - armLen * 0.47;
      const cup = makeMesh(THREE, g.hemiDome, m.ironBlack, 0.52, 0.36, 0.52);
      cup.rotation.x = Math.PI;
      cup.position.set(0, 0.18, cupZ);
      armPivot.add(cup);

      payloadBoulder = makeMesh(THREE, g.dodeca, m.moltenBoulder, isT2 ? 0.48 : 0.42, isT2 ? 0.44 : 0.39, isT2 ? 0.48 : 0.42);
      payloadBoulder.position.set(0, 0.44, cupZ);
      payloadBoulder.userData.noFlash = true;
      armPivot.add(payloadBoulder);

      totalH = bastionTopY + trestleH + 0.72;
      muzzleHeight = bastionTopY + trestleH + 0.35;
    }

    const status = buildTowerStatusOverlay(cache, totalH, 2.18);
    root.add(status.group);

    const hitMesh = buildFittedHitMesh(cache, 2.28, Math.min(7.6, totalH));
    root.add(hitMesh);

    const flashMeshes = finalizeShadowAndBaseMats(root);

    return {
      group: root,
      root,
      type: 'dwarven',
      tier: is3A || is3B ? 3 : (isT2 ? 2 : 1),
      branch: is3A ? 'A' : (is3B ? 'B' : null),
      variantKey: 'dwarven_' + variant,
      aimPivot,
      armPivot,
      windlass,
      counterweight,
      payloadBoulder,
      barrelRecoilGroup,
      muzzleFlashMesh,
      prodL,
      prodR,
      loadedBolts,
      status,
      hitMesh,
      flashMeshes,
      muzzleHeight
    };
  }

  // ============================================================================
  // 8. ALL 4 ISTARI SPIRES (GOTHIC WIZARD SPIRE T1/T2, FLAME OF ANOR 3A, STORMCALLER 3B)
  // ============================================================================
  function buildIstariTowerRig(variant, cache) {
    const THREE = cache.THREE;
    const g = cache.geos;
    const m = cache.mats;

    const root = new THREE.Group();
    const isT2 = variant === '2_0';
    const is3A = variant === '3_A'; // Flame of Anor (White-Marble & 3 Brass Astrolabe Sun-Rings)
    const is3B = variant === '3_B'; // Stormcaller Council (Orthanc Obsidian & Copper Lightning Coils)

    const stoneMat = is3A ? m.whiteMarble : (is3B ? m.orthancObsidian : (isT2 ? m.whiteMarble : m.ashlarStone));
    const trimMat = is3A ? m.goldBurnished : (is3B ? m.copperCoil : m.goldBurnished);
    const winMat = is3A ? m.anorFlame : (is3B ? m.windowStorm : m.windowAmber);

    // 1. Stepped Octagonal Stone Plinth + Gothic Entry Portal (+Z)
    const plinth1 = makeMesh(THREE, g.cyl12, stoneMat, 2.14, 0.34, 2.14);
    plinth1.position.y = 0.17;
    const plinth2 = makeMesh(THREE, g.cyl8, trimMat, 1.78, 0.24, 1.78);
    plinth2.position.y = 0.44;
    root.add(plinth1, plinth2);

    const portalArch = makeMesh(THREE, g.lancetWindow, trimMat, 1.35, 1.15, 1.4);
    portalArch.position.set(0, 0.35, 1.24);
    const portalDoor = makeMesh(THREE, g.lancetWindow, is3B ? m.windowStorm : m.darkLeather, 0.95, 0.95, 1.5);
    portalDoor.position.set(0, 0.35, 1.27);
    root.add(portalArch, portalDoor);

    // 2. Tall Slender Gothic Wizard Shaft + Molded String Courses
    const shaftH = (is3A || is3B) ? 4.95 : (isT2 ? 4.65 : 4.25);
    const shaft = makeMesh(THREE, g.cyl12, stoneMat, 1.18, shaftH, 1.18);
    shaft.position.y = 0.52 + shaftH * 0.5;
    root.add(shaft);

    // Fluted Vertical Pilasters on 3A (Gold) &Glowing Cyan Rune-Pillars on 3B (Stormcaller)!
    if (is3A || is3B) {
      const pilasterCount = 8;
      for (let i = 0; i < pilasterCount; i++) {
        const ang = (i / pilasterCount) * TWO_PI + Math.PI / 8;
        const pMat = is3A ? m.goldBurnished : (i % 2 === 0 ? m.stormRune : m.orthancObsidian);
        const pil = makeMesh(THREE, g.box, pMat, 0.12, shaftH * 0.94, 0.14);
        pil.position.set(Math.sin(ang) * 1.19, 0.52 + shaftH * 0.5, Math.cos(ang) * 1.19);
        pil.rotation.y = ang;
        if (is3B && i % 2 === 0) pil.userData.noFlash = true;
        root.add(pil);
      }
    }

    for (let k = 1; k <= 2; k++) {
      const course = makeMesh(THREE, g.torusMed, trimMat, 1.22, 1.22, 0.85);
      course.rotation.x = HALF_PI;
      course.position.y = 0.52 + (shaftH * k) / 2.65;
      root.add(course);
    }

    // 3. Sculpted Gothic Flying Buttresses + Pointed Finials!
    const buttressCount = (isT2 || is3A || is3B) ? 6 : 4;
    for (let i = 0; i < buttressCount; i++) {
      const ang = (i / buttressCount) * TWO_PI + (buttressCount === 4 ? Math.PI * 0.25 : Math.PI / 6);
      const fb = makeMesh(THREE, g.flyingButtress, stoneMat, 0.96, 0.98, 0.96);
      fb.position.set(Math.sin(ang) * 1.06, 0.34, Math.cos(ang) * 1.06);
      fb.rotation.y = ang;
      const pinnacle = makeMesh(THREE, g.cone4, trimMat, 0.18, 0.62, 0.18);
      pinnacle.position.set(Math.sin(ang) * 1.86, 2.98, Math.cos(ang) * 1.86);
      root.add(fb, pinnacle);
    }

    // 4. Glowing Arched Stained-Glass Lancet Windows
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * TWO_PI;
      const winFrame = makeMesh(THREE, g.lancetWindow, trimMat, 1.08, 1.04, 1.0);
      winFrame.position.set(Math.sin(ang) * 1.16, 0.52 + shaftH * 0.54, Math.cos(ang) * 1.16);
      winFrame.rotation.y = ang;
      const winGlass = makeMesh(THREE, g.lancetWindow, winMat, 0.86, 0.94, 1.25);
      winGlass.position.set(Math.sin(ang) * 1.17, 0.52 + shaftH * 0.55, Math.cos(ang) * 1.17);
      winGlass.rotation.y = ang;
      winGlass.userData.noFlash = true;
      root.add(winFrame, winGlass);
    }

    // Stormcaller 3B: Helical Copper Lightning-Conductor Coils around Upper Shaft!
    if (is3B) {
      const copperHelix = makeMesh(THREE, g.copperHelix, m.copperCoil, 1.0, 1.0, 1.0);
      copperHelix.position.y = 0.52 + shaftH * 0.68;
      root.add(copperHelix);
    }

    // 5. Corbeled Stone Balcony Parapet + Open Colonnaded Arcane Lantern Belfry!
    const lanternY = 0.52 + shaftH;
    const corbelCone = makeMesh(THREE, g.cone12 || g.cone, stoneMat, 1.56, 0.46, 1.56);
    corbelCone.rotation.x = Math.PI;
    corbelCone.position.y = lanternY - 0.12;
    const balconyFloor = makeMesh(THREE, g.cyl12, trimMat, 1.58, 0.20, 1.58);
    balconyFloor.position.y = lanternY + 0.14;
    const parapetRing = makeMesh(THREE, g.torusMed, stoneMat, 1.54, 1.54, 1.15);
    parapetRing.rotation.x = HALF_PI;
    parapetRing.position.y = lanternY + 0.34;
    root.add(corbelCone, balconyFloor, parapetRing);

    const belfryH = 1.42;
    const coreMat = is3A ? m.anorFlame : (is3B ? m.stormRune : m.istariCrystal);
    const lanternCore = makeMesh(THREE, g.cyl12, coreMat, 0.36, belfryH - 0.12, 0.36);
    lanternCore.position.y = lanternY + 0.22 + belfryH * 0.5;
    lanternCore.userData.noFlash = true;
    const belfryGem = makeMesh(THREE, g.octa, coreMat, 0.48, 0.72, 0.48);
    belfryGem.position.y = lanternY + 0.22 + belfryH * 0.5;
    belfryGem.userData.noFlash = true;
    root.add(lanternCore, belfryGem);

    const colCount = is3A ? 8 : 6;
    for (let i = 0; i < colCount; i++) {
      const ang = (i / colCount) * TWO_PI;
      const col = makeMesh(THREE, g.cyl8, stoneMat, 0.12, belfryH, 0.12);
      col.position.set(Math.sin(ang) * 1.18, lanternY + 0.22 + belfryH * 0.5, Math.cos(ang) * 1.18);
      const cap = makeMesh(THREE, g.box, trimMat, 0.28, 0.14, 0.28);
      cap.position.set(Math.sin(ang) * 1.18, lanternY + 0.22 + belfryH, Math.cos(ang) * 1.18);
      cap.rotation.y = ang;
      root.add(col, cap);

      if (isT2) {
        // Hovering White Council Crystal Sconces around the Balcony
        const sconce = makeMesh(THREE, g.octa, m.istariCrystal, 0.12, 0.26, 0.12);
        sconce.position.set(Math.sin(ang + 0.52) * 1.62, lanternY + 0.62, Math.cos(ang + 0.52) * 1.62);
        sconce.userData.noFlash = true;
        root.add(sconce);
      }
    }

    // 6. Variant Crowns: Steep Shingled Wizard Roof (T1/T2), 3 Brass Astrolabe Rings (3A), or Orthanc Storm Crown (3B)!
    const aimPivot = new THREE.Group();
    root.add(aimPivot);

    let apexCrystal = null;
    let orbitGroup1 = null;
    let orbitGroup2 = null;
    let orbitGroup3 = null;
    let totalH = 9.4;
    let muzzleHeight = 8.8;
    const crownBaseY = lanternY + 0.22 + belfryH;

    if (is3A) {
      // === BRANCH A: FLAME OF ANOR (Open Golden Sun-Crown + 3 Rotating Brass Astrolabe Sun-Rings!) ===
      aimPivot.position.y = crownBaseY;

      const sunCornice = makeMesh(THREE, g.cyl12, m.goldBurnished, 1.44, 0.26, 1.44);
      sunCornice.position.y = crownBaseY + 0.12;
      root.add(sunCornice);

      // 8 Sculpted Golden Sun-Ray Spires cradling the Solar Sanctuary
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * TWO_PI;
        const ray = makeMesh(THREE, g.cone4, m.goldRadiant, 0.18, 1.08, 0.14);
        ray.position.set(Math.sin(ang) * 1.30, crownBaseY + 0.68, Math.cos(ang) * 1.30);
        ray.rotation.z = -Math.sin(ang) * 0.26;
        ray.rotation.x = Math.cos(ang) * 0.26;
        root.add(ray);
      }

      // Blazing Multi-Faceted Golden Anor Sun-Core (geometry radius 1.0 -> scale ~0.48 matches models_3d.js!)
      apexCrystal = makeMesh(THREE, g.icosa, m.anorFlame, 0.48, 0.56, 0.48);
      apexCrystal.position.y = 1.12;
      apexCrystal.userData.noFlash = true;
      aimPivot.add(apexCrystal);

      // Astrolabe Ring 1 (Outer Engraved Brass Ring + Cardinal Sun Pips) + Nested Astrolabe Ring 3!
      orbitGroup1 = new THREE.Group();
      orbitGroup1.position.y = 1.12;
      orbitGroup1.rotation.z = 0.28;
      const astroRing1 = makeMesh(THREE, g.torusMed, m.goldBurnished, 1.34, 1.34, 0.72);
      astroRing1.rotation.x = 0.62;
      orbitGroup1.add(astroRing1);
      for (let p = 0; p < 4; p++) {
        const pa = (p / 4) * TWO_PI;
        const pip = makeMesh(THREE, g.octa, m.goldRadiant, 0.11, 0.18, 0.11);
        pip.position.set(Math.cos(pa) * 1.34, Math.sin(pa) * 1.34 * Math.cos(0.62), Math.sin(pa) * 1.34 * Math.sin(0.62));
        orbitGroup1.add(pip);
      }
      // Astrolabe Ring 3 (Inner Tilted Brass Meridian Ring — independent 3rd axis rotation!)
      orbitGroup3 = new THREE.Group();
      orbitGroup3.position.y = 1.12;
      const astroRing3 = makeMesh(THREE, g.torusThin, m.hammeredBronze, 0.78, 0.78, 1.1);
      astroRing3.rotation.x = -0.75;
      astroRing3.rotation.y = 0.52;
      orbitGroup3.add(astroRing3);
      aimPivot.add(orbitGroup1, orbitGroup3);

      // Astrolabe Ring 2 (Middle Counter-Rotating Burnished Brass Equator Ring)
      orbitGroup2 = new THREE.Group();
      orbitGroup2.position.y = 1.12;
      orbitGroup2.rotation.x = -0.44;
      const astroRing2 = makeMesh(THREE, g.torusMed, m.goldRadiant, 1.06, 1.06, 0.68);
      astroRing2.rotation.y = 0.82;
      orbitGroup2.add(astroRing2);
      aimPivot.add(orbitGroup2);

      muzzleHeight = crownBaseY + 1.12;
      totalH = crownBaseY + 2.55;
    } else if (is3B) {
      // === BRANCH B: STORMCALLER COUNCIL (Dark Orthanc Horns, Copper Coils & Orbiting Storm Crystals!) ===
      aimPivot.position.y = crownBaseY;

      const obsCrown = makeMesh(THREE, g.cyl8, m.orthancObsidian, 1.42, 0.32, 1.42);
      obsCrown.position.y = crownBaseY + 0.14;
      root.add(obsCrown);

      // 4 Iconic Curved Orthanc Obsidian Pinnacle Horns + 4 Copper Insulator Lightning Rods!
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * TWO_PI;
        const horn = makeMesh(THREE, g.orthancHorn, m.orthancObsidian, 1.0, 1.0, 1.0);
        horn.position.set(Math.sin(ang) * 1.14, crownBaseY + 0.24, Math.cos(ang) * 1.14);
        horn.rotation.y = ang + Math.PI;
        root.add(horn);

        const rodAng = ang + Math.PI * 0.25;
        const rx = Math.sin(rodAng) * 1.28;
        const rz = Math.cos(rodAng) * 1.28;
        const rod = makeMesh(THREE, g.shaftUp, m.copperCoil, 0.055, 1.65, 0.055);
        rod.position.set(rx, crownBaseY + 0.22, rz);
        for (let d = 0; d < 3; d++) {
          const disc = makeMesh(THREE, g.torusThin, m.copperCoil, 0.14, 0.14, 1.4);
          disc.rotation.x = HALF_PI;
          disc.position.set(rx, crownBaseY + 0.58 + d * 0.34, rz);
          root.add(disc);
        }
        const spark = makeMesh(THREE, g.octa, m.stormRune, 0.14, 0.22, 0.14);
        spark.position.set(rx, crownBaseY + 1.94, rz);
        spark.userData.noFlash = true;
        root.add(rod, spark);
      }

      // Central Levitating Crackling Storm-Crystal (position.y = 1.08 matches models_3d.js!)
      apexCrystal = makeMesh(THREE, g.octa, m.stormRune, 0.46, 0.94, 0.46);
      apexCrystal.position.y = 1.08;
      apexCrystal.userData.noFlash = true;
      aimPivot.add(apexCrystal);

      orbitGroup1 = new THREE.Group();
      orbitGroup1.position.y = 1.08;
      const copperArc = makeMesh(THREE, g.torusThin, m.copperCoil, 1.42, 1.42, 1.1);
      copperArc.rotation.x = HALF_PI;
      orbitGroup1.add(copperArc);
      for (let r = 0; r < 6; r++) {
        const ra = (r / 6) * TWO_PI;
        const shard = makeMesh(THREE, g.octa, m.stormRune, 0.17, 0.34, 0.13);
        shard.position.set(Math.sin(ra) * 1.42, (r % 2 === 0 ? 0.18 : -0.18), Math.cos(ra) * 1.42);
        shard.userData.noFlash = true;
        orbitGroup1.add(shard);
      }
      aimPivot.add(orbitGroup1);

      orbitGroup2 = new THREE.Group();
      orbitGroup2.position.y = 1.08;
      const stormHalo = makeMesh(THREE, g.torusThin, m.stormRune, 0.92, 0.92, 1.0);
      stormHalo.rotation.x = 0.68;
      stormHalo.userData.noFlash = true;
      orbitGroup2.add(stormHalo);
      aimPivot.add(orbitGroup2);

      muzzleHeight = crownBaseY + 1.08;
      totalH = crownBaseY + 2.52;
    } else {
      // === T1 & T2: STEEP SHINGLED DARK-SLATE & GOLD CONICAL WIZARD ROOF + CRYSTAL APEX (Ref Far-Right!) ===
      const roofScaleY = isT2 ? 1.06 : 0.94;
      const roof = makeMesh(THREE, g.istariRoof, m.slateShingles, 1.0, roofScaleY, 1.0);
      roof.position.y = crownBaseY;
      const eavesRing = makeMesh(THREE, g.torusMed, trimMat, 1.70, 1.70, 0.85);
      eavesRing.rotation.x = HALF_PI;
      eavesRing.position.y = crownBaseY + 0.04;
      root.add(roof, eavesRing);

      // Golden Roof Ribs + Pointed Gothic Dormer Lucarnes / Corner Spirelets
      const dormerCount = 4;
      for (let i = 0; i < dormerCount; i++) {
        const ang = (i / dormerCount) * TWO_PI;
        const dormer = makeMesh(THREE, g.cone4, trimMat, 0.26, isT2 ? 1.25 : 0.78, 0.26);
        dormer.position.set(Math.sin(ang) * 1.34, crownBaseY + (isT2 ? 0.62 : 0.42), Math.cos(ang) * 1.34);
        const dormerWin = makeMesh(THREE, g.box, winMat, 0.16, 0.34, 0.12);
        dormerWin.position.set(Math.sin(ang) * 1.44, crownBaseY + 0.32, Math.cos(ang) * 1.44);
        dormerWin.rotation.y = ang;
        dormerWin.userData.noFlash = true;
        root.add(dormer, dormerWin);
      }

      const roofPeakY = crownBaseY + 3.60 * roofScaleY;
      const finialRod = makeMesh(THREE, g.shaftUp, trimMat, 0.045, 0.38, 0.045);
      finialRod.position.y = roofPeakY - 0.12;
      root.add(finialRod);

      // aimPivot at crystal center so apexCrystal.position.y = 0 matches models_3d.js!
      aimPivot.position.y = roofPeakY + 0.56;

      apexCrystal = makeMesh(THREE, g.octa, m.istariCrystal, isT2 ? 0.38 : 0.30, isT2 ? 0.72 : 0.58, isT2 ? 0.38 : 0.30);
      apexCrystal.position.y = 0;
      apexCrystal.userData.noFlash = true;
      aimPivot.add(apexCrystal);

      orbitGroup1 = new THREE.Group();
      const halo = makeMesh(THREE, g.torusThin, trimMat, isT2 ? 0.76 : 0.56, isT2 ? 0.76 : 0.56, 1.1);
      halo.rotation.x = 0.65;
      orbitGroup1.add(halo);

      if (isT2) {
        for (let c = 0; c < 3; c++) {
          const ca = (c / 3) * TWO_PI;
          const shard = makeMesh(THREE, g.octa, m.istariCrystal, 0.14, 0.28, 0.14);
          shard.position.set(Math.sin(ca) * 0.88, 0, Math.cos(ca) * 0.88);
          shard.userData.noFlash = true;
          orbitGroup1.add(shard);
        }
      }
      aimPivot.add(orbitGroup1);

      muzzleHeight = roofPeakY + 0.56;
      totalH = roofPeakY + 1.05;
    }

    const status = buildTowerStatusOverlay(cache, totalH, 2.04);
    root.add(status.group);

    const hitMesh = buildFittedHitMesh(cache, 2.12, Math.min(8.2, totalH));
    root.add(hitMesh);

    const flashMeshes = finalizeShadowAndBaseMats(root);

    return {
      group: root,
      root,
      type: 'istari',
      tier: is3A || is3B ? 3 : (isT2 ? 2 : 1),
      branch: is3A ? 'A' : (is3B ? 'B' : null),
      variantKey: 'istari_' + variant,
      aimPivot,
      lanternCore,
      apexCrystal,
      orbitGroup1,
      orbitGroup2,
      orbitGroup3,
      status,
      hitMesh,
      flashMeshes,
      muzzleHeight
    };
  }

  // ============================================================================
  // 9. THE 3 SCULPTED SOLDIER & CAVALRY RIGS (CITADEL GUARD, PHALANX, ROHIRRIM KNIGHT)
  // ============================================================================
  function buildSculptedSoldierRig(variantKey, cache) {
    const THREE = cache.THREE;
    const g = cache.geos;
    const m = cache.mats;

    const root = new THREE.Group();
    const isT2 = variantKey === 'guard_2';
    const isPhalanx = variantKey === 'phalanx_3A';
    const isKnight = variantKey === 'knight_3B';

    const bodyRoot = new THREE.Group();
    root.add(bodyRoot);

    // Shield Wall golden protection aura (scaled to 0.001 when hidden so Box3 studio framing stays exact!)
    const shieldDome = makeMesh(THREE, g.hemiDome, m.shieldWallDome, 0.001, 0.001, 0.001);
    shieldDome.userData.noShadow = true;
    shieldDome.userData.skipStudioBounds = true;
    shieldDome.visible = false;
    root.add(shieldDome);

    if (isKnight) {
      // ========================================================================
      // MOUNTED ROHIRRIM KNIGHT ON ANATOMICAL 3D WARHORSE ('knight' / 'knight_3B')
      // ========================================================================
      const horseMeshes = [];
      const baseCoat = m.horseCoats[0];

      // 1. Sculpted Anatomical Warhorse Barrel, Chest & Muscular Haunches
      const horseBody = makeMesh(THREE, g.horseTorso, baseCoat, 1.0, 1.0, 1.0);
      horseBody.position.set(0, 1.02, 0);
      bodyRoot.add(horseBody);
      horseMeshes.push(horseBody);

      // Draped Emerald-Green & Burnished-Gold Rohirrim Cloth Caparison + Saddle
      const caparisonFront = makeMesh(THREE, g.cone, m.rohanGreen, 0.44, 0.56, 0.46);
      caparisonFront.position.set(0, 0.80, 0.42);
      const caparisonRear = makeMesh(THREE, g.cyl12, m.rohanGreen, 0.41, 0.96, 0.43);
      caparisonRear.rotation.x = HALF_PI;
      caparisonRear.position.set(0, 0.94, -0.14);
      const capSkirtL = makeMesh(THREE, g.bannerPointed, m.rohanBanner, 0.86, 0.62, 1.0);
      capSkirtL.position.set(0.35, 1.08, -0.06);
      capSkirtL.rotation.y = HALF_PI;
      const capSkirtR = makeMesh(THREE, g.bannerPointed, m.rohanBanner, 0.86, 0.62, 1.0);
      capSkirtR.position.set(-0.35, 1.08, -0.06);
      capSkirtR.rotation.y = -HALF_PI;

      const saddle = makeMesh(THREE, g.box, m.darkLeather, 0.46, 0.16, 0.52);
      saddle.position.set(0, 1.36, -0.04);
      const pommel = makeMesh(THREE, g.box, m.goldBurnished, 0.30, 0.18, 0.08);
      pommel.position.set(0, 1.46, 0.18);
      const cantle = makeMesh(THREE, g.box, m.goldBurnished, 0.34, 0.20, 0.09);
      cantle.position.set(0, 1.47, -0.26);
      bodyRoot.add(caparisonFront, caparisonRear, capSkirtL, capSkirtR, saddle, pommel, cantle);

      // 2. Articulated Muscular Neck, Equine Head/Snout, Ears, Golden Chamfron & Flowing Mane!
      const neckGroup = new THREE.Group();
      neckGroup.position.set(0, 1.14, 0.48);

      const neckMesh = makeMesh(THREE, g.horseNeck, baseCoat, 1.0, 1.0, 1.0);
      const headGroup = new THREE.Group();
      headGroup.position.set(0, 0.64, 0.32);
      headGroup.rotation.x = 0.26;

      const skullMesh = makeMesh(THREE, g.horseSkull, baseCoat, 1.0, 1.0, 1.0);
      const lowerJaw = makeMesh(THREE, g.cyl8, baseCoat, 0.068, 0.36, 0.072);
      lowerJaw.rotation.x = HALF_PI + 0.18;
      lowerJaw.position.set(0, -0.09, 0.18);
      horseMeshes.push(neckMesh, skullMesh, lowerJaw);

      // Alert Pointed Horse Ears, Dark Eyes, Nostrils & Golden Rohirrim Chamfron Faceplate
      for (let s = -1; s <= 1; s += 2) {
        const ear = makeMesh(THREE, g.cone4, baseCoat, 0.042, 0.18, 0.052);
        ear.position.set(s * 0.085, 0.21, -0.04);
        ear.rotation.z = -s * 0.22;
        ear.rotation.x = 0.16;
        horseMeshes.push(ear);

        const eye = makeMesh(THREE, g.sphereLow, m.ironBlack, 0.028, 0.028, 0.028);
        eye.position.set(s * 0.125, 0.06, 0.08);
        const nostril = makeMesh(THREE, g.sphereLow, m.ironBlack, 0.024, 0.024, 0.024);
        nostril.position.set(s * 0.055, -0.07, 0.45);
        headGroup.add(ear, eye, nostril);
      }

      const chamfron = makeMesh(THREE, g.heaterShield, m.goldBurnished, 0.46, 0.56, 0.6);
      chamfron.rotation.x = -HALF_PI + 0.28;
      chamfron.position.set(0, 0.09, 0.18);
      const bitStrap = makeMesh(THREE, g.torusThin, m.darkLeather, 0.095, 0.105, 1.2);
      bitStrap.position.set(0, -0.06, 0.36);
      headGroup.add(skullMesh, lowerJaw, chamfron, bitStrap);

      // Cascading Golden-Flaxen Sculpted Mane Locks along Neck Crest
      for (let mIdx = 0; mIdx < 5; mIdx++) {
        const mt = mIdx / 4;
        const lock = makeMesh(THREE, g.mallornLeaf, m.horseMane, 0.42, 0.34, 0.9);
        lock.position.set(0.03, lerp(0.12, 0.62, mt), lerp(-0.08, 0.18, mt));
        lock.rotation.x = -2.25;
        lock.rotation.z = 0.18;
        neckGroup.add(lock);
      }

      // Leather Reins connecting Bridle to Rider
      for (let s = -1; s <= 1; s += 2) {
        const rein = makeMesh(THREE, g.cyl6, m.darkLeather, 0.012, 0.78, 0.012);
        rein.rotation.x = HALF_PI - 0.36;
        rein.position.set(s * 0.12, 0.42, 0.26);
        neckGroup.add(rein);
      }

      neckGroup.add(neckMesh, headGroup);
      bodyRoot.add(neckGroup);

      // 3. Flowing S-Curved Sculpted Horse Tail
      const tail = makeMesh(THREE, g.horseTail, m.horseMane, 1.0, 1.0, 1.0);
      tail.position.set(0, 1.12, -0.72);
      bodyRoot.add(tail);

      // 4. Four Multi-Jointed Articulated Galloping Legs + Dark Iron-Shod Hooves!
      const legSpecs = [
        [-0.22, 0.88,  0.48,  0.14, -0.22], // FL (dynamic stride pose right out of creation!)
        [ 0.22, 0.88,  0.48, -0.10,  0.08], // FR
        [-0.23, 0.90, -0.50, -0.14,  0.18], // BL
        [ 0.23, 0.90, -0.50,  0.12, -0.06]  // BR
      ];
      const horseLegs = [];
      for (let i = 0; i < 4; i++) {
        const sp = legSpecs[i];
        const hipPivot = new THREE.Group();
        hipPivot.position.set(sp[0], sp[1], sp[2]);
        hipPivot.rotation.x = sp[3];

        const upperLeg = makeMesh(THREE, g.limbDown, baseCoat, 0.115, 0.46, 0.135);
        const kneeJoint = makeMesh(THREE, g.sphereLow, baseCoat, 0.085, 0.085, 0.09);
        kneeJoint.position.set(0, -0.45, 0);

        const lowerGroup = new THREE.Group();
        lowerGroup.position.set(0, -0.45, 0);
        lowerGroup.rotation.x = sp[4];
        const cannonBone = makeMesh(THREE, g.limbDown, baseCoat, 0.072, 0.36, 0.076);
        const hoof = makeMesh(THREE, g.cyl8, m.horseHoof, 0.082, 0.11, 0.095);
        hoof.position.set(0, -0.39, 0.025);
        lowerGroup.add(cannonBone, hoof);

        hipPivot.add(upperLeg, kneeJoint, lowerGroup);
        bodyRoot.add(hipPivot);
        horseLegs.push(hipPivot);
        horseMeshes.push(upperLeg, kneeJoint, cannonBone);
      }

      // 5. Golden-Helmed Rohirrim Lancer in the Saddle!
      const rider = new THREE.Group();
      rider.position.set(0, 1.34, -0.06);

      // Rider Armored Legs in Stirrups
      for (let s = -1; s <= 1; s += 2) {
        const rThigh = makeMesh(THREE, g.cyl12, m.chainmail, 0.095, 0.42, 0.10);
        rThigh.position.set(s * 0.26, -0.10, 0.10);
        rThigh.rotation.x = -0.68;
        rThigh.rotation.z = s * 0.24;
        const rBoot = makeMesh(THREE, g.cyl12, m.darkLeather, 0.078, 0.38, 0.082);
        rBoot.position.set(s * 0.31, -0.36, 0.16);
        rider.add(rThigh, rBoot);
      }

      const mailSkirt = makeMesh(THREE, g.cone, m.chainmail, 0.28, 0.38, 0.25);
      mailSkirt.position.y = 0.12;
      const cuirass = makeMesh(THREE, g.cuirass, m.hammeredBronze, 1.0, 0.94, 0.96);
      cuirass.position.y = 0.08;
      const sunChest = makeMesh(THREE, g.sphereLow, m.goldBurnished, 0.08, 0.08, 0.04);
      sunChest.position.set(0, 0.46, 0.21);
      const cloak = makeMesh(THREE, g.flowingCloak, m.rohanGreen, 0.62, 0.96, 1.0);
      cloak.position.set(0, 0.64, -0.08);
      cloak.rotation.x = 0.28;
      rider.add(mailSkirt, cuirass, sunChest, cloak);

      for (let s = -1; s <= 1; s += 2) {
        const pauldron = makeMesh(THREE, g.sphereLow, m.goldBurnished, 0.13, 0.11, 0.14);
        pauldron.position.set(s * 0.26, 0.64, 0);
        rider.add(pauldron);
      }

      // Sculpted Head + Ornate Golden Rohirrim Ridge-Helm & Flowing Horsehair Plume!
      const rHead = makeMesh(THREE, g.sphere, m.humanSkin, 0.145, 0.16, 0.15);
      rHead.position.set(0, 0.84, 0.02);
      const rHelm = makeMesh(THREE, g.conicalHelm, m.goldBurnished, 0.88, 0.78, 0.94);
      rHelm.position.set(0, 0.82, 0.01);
      const nasal = makeMesh(THREE, g.box, m.goldBurnished, 0.032, 0.16, 0.04);
      nasal.position.set(0, 0.84, 0.17);
      const comb = makeMesh(THREE, g.rohanHorseCrest, m.goldRadiant, 0.42, 0.42, 0.55);
      comb.position.set(0, 1.06, 0.04);
      const plume = makeMesh(THREE, g.horseTail, m.horseMane, 0.65, 0.68, 0.68);
      plume.position.set(0, 1.18, -0.06);
      rider.add(rHead, rHelm, nasal, comb, plume);

      // Left Arm (+X): Round Painted Emerald-and-Gold Rohan Shield!
      const shieldArm = makeMesh(THREE, g.cyl12, m.chainmail, 0.068, 0.42, 0.068);
      shieldArm.position.set(0.28, 0.48, 0.08);
      shieldArm.rotation.x = 0.55;
      const buckler = makeMesh(THREE, g.cyl, m.rohanGreen, 0.34, 0.05, 0.34);
      buckler.rotation.z = HALF_PI - 0.18;
      buckler.rotation.y = 0.24;
      buckler.position.set(0.36, 0.44, 0.16);
      const shieldRim = makeMesh(THREE, g.torusThin, m.goldBurnished, 0.34, 0.34, 1.1);
      shieldRim.rotation.y = HALF_PI + 0.24;
      shieldRim.position.copy(buckler.position);
      const shieldBoss = makeMesh(THREE, g.sphereLow, m.goldRadiant, 0.095, 0.095, 0.095);
      shieldBoss.position.set(0.40, 0.44, 0.17);
      rider.add(shieldArm, buckler, shieldRim, shieldBoss);

      // Right Arm (-X): Couched Rohirrim War-Lance + Vamplate + Eorlingas Pennant!
      const weaponPivot = new THREE.Group();
      weaponPivot.position.set(-0.30, 0.44, 0.10);
      const lanceArm = makeMesh(THREE, g.cyl12, m.chainmail, 0.068, 0.42, 0.068);
      lanceArm.rotation.x = HALF_PI * 0.85;
      lanceArm.position.set(0, 0.06, -0.04);
      const lanceShaft = makeMesh(THREE, g.shaftUp, m.timberOak, 0.042, 2.55, 0.042);
      lanceShaft.rotation.x = HALF_PI * 0.95;
      lanceShaft.position.z = -0.48;
      const vamplate = makeMesh(THREE, g.cone, m.goldBurnished, 0.14, 0.22, 0.14);
      vamplate.rotation.x = -HALF_PI * 0.95;
      vamplate.position.set(0, 0.02, 0.18);
      const lanceTip = makeMesh(THREE, g.cone4, m.steelBright, 0.095, 0.44, 0.065);
      lanceTip.rotation.x = HALF_PI * 0.95;
      lanceTip.position.set(0, 0.12, 2.12);
      const lancePennant = makeMesh(THREE, g.bannerSwallow, m.rohanBanner, 0.26, 0.56, 1.0);
      lancePennant.position.set(0, 0.08, 1.62);
      lancePennant.rotation.y = HALF_PI;
      weaponPivot.add(lanceArm, lanceShaft, vamplate, lanceTip, lancePennant);
      rider.add(weaponPivot);

      bodyRoot.add(rider);
      root.scale.setScalar(1.22);
      const flashMeshes = finalizeShadowAndBaseMats(root);

      return {
        group: root,
        root,
        variant: 'knight',
        variantKey,
        isKnight: true,
        height3D: 3.02,
        bodyRoot,
        horseLegs,
        horseMeshes,
        neckGroup,
        tail,
        weaponPivot,
        shieldDome,
        flashMeshes
      };
    }

    // ========================================================================
    // INFANTRY: CITADEL GUARD ('guard'/'guard_1'/'guard_2') & PHALANX ('phalanx'/'phalanx_3A')
    // ========================================================================
    const scale = (isPhalanx ? 1.12 : (isT2 ? 1.05 : 1.0)) * 1.28;
    bodyRoot.scale.setScalar(scale);

    const plateMat = isPhalanx ? m.mithrilSilver : m.steelBright;
    const accentMat = isPhalanx ? m.ironBlack : (isT2 ? m.goldBurnished : m.forgedDarkIron);
    const surcoatMat = isPhalanx ? m.phalanxBlack : m.gondorBlue;
    const tabardBannerMat = isPhalanx ? m.citadelBanner : m.gondorBanner;

    // 1. Articulated Armored Legs (Thighs, Knee Poleyns, Steel Greaves & Sabatons)
    const buildLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.15, 0.68, 0);
      const thigh = makeMesh(THREE, g.limbDown, m.chainmail, 0.105, 0.34, 0.11);
      const poleyn = makeMesh(THREE, g.octa, plateMat, 0.08, 0.10, 0.08);
      poleyn.position.set(0, -0.34, 0.06);
      const greave = makeMesh(THREE, g.limbDown, plateMat, 0.092, 0.34, 0.098);
      greave.position.y = -0.32;
      const boot = makeMesh(THREE, g.box, accentMat, 0.13, 0.09, 0.24);
      boot.position.set(0, -0.635, 0.05);
      hip.add(thigh, poleyn, greave, boot);
      return hip;
    };
    const legL = buildLeg(-1);
    const legR = buildLeg(1);
    legL.rotation.x = 0.08;
    legR.rotation.x = -0.08;
    bodyRoot.add(legL, legR);

    // 2. Chainmail Hauberk Skirt, Heraldic Gondor Tabard, Contoured Breastplate & Cloak!
    const mailSkirt = makeMesh(THREE, g.cone, m.chainmail, 0.31, 0.48, 0.26);
    mailSkirt.position.set(0, 0.72, 0);
    const surcoat = makeMesh(THREE, g.cone, surcoatMat, 0.33, 0.54, 0.27);
    surcoat.position.set(0, 0.76, 0);
    const frontTabard = makeMesh(THREE, g.bannerPointed, tabardBannerMat, 0.28, 0.54, 0.5);
    frontTabard.position.set(0, 0.92, 0.19);

    const breastplate = makeMesh(THREE, g.cuirass, plateMat, 1.06, 0.96, 1.02);
    breastplate.position.set(0, 0.74, 0);
    const belt = makeMesh(THREE, g.torusMed, m.goldBurnished, 0.22, 0.19, 1.0);
    belt.rotation.x = HALF_PI;
    belt.position.set(0, 0.84, 0);

    // White Tree Chest Relief + Belted Sword Scabbard on Left Hip
    const treeBoss = makeMesh(THREE, g.octa, isPhalanx ? m.goldRadiant : m.mithrilSilver, 0.075, 0.16, 0.035);
    treeBoss.position.set(0, 1.14, 0.22);
    const scabbard = makeMesh(THREE, g.box, m.darkLeather, 0.05, 0.68, 0.09);
    scabbard.position.set(0.25, 0.64, -0.06);
    scabbard.rotation.x = 0.52;

    const cloak = makeMesh(THREE, g.flowingCloak, surcoatMat, 0.60, 1.06, 1.0);
    cloak.position.set(0, 1.32, -0.08);
    bodyRoot.add(mailSkirt, surcoat, frontTabard, breastplate, belt, treeBoss, scabbard, cloak);

    // Layered Articulated Pauldrons
    for (let s = -1; s <= 1; s += 2) {
      const p1 = makeMesh(THREE, g.sphereLow, plateMat, 0.145, 0.125, 0.155);
      p1.position.set(s * 0.30, 1.30, 0);
      const pRim = makeMesh(THREE, g.torusThin, m.goldBurnished, 0.14, 0.14, 1.2);
      pRim.rotation.x = HALF_PI;
      pRim.rotation.y = s * 0.45;
      pRim.position.set(s * 0.30, 1.26, 0);
      bodyRoot.add(p1, pRim);
    }

    // 3. Sculpted Gondorian Conical Steel Helm + Feathered Gull-Wings / Tall Fountain Swan-Wings!
    const head = makeMesh(THREE, g.sphere, m.humanSkin, 0.145, 0.16, 0.15);
    head.position.set(0, 1.50, 0.02);
    const helm = makeMesh(THREE, g.conicalHelm, plateMat, 0.92, isPhalanx ? 1.14 : 0.94, 0.96);
    helm.position.set(0, 1.47, 0);
    bodyRoot.add(head, helm);

    // Cheekguards / Fountain Guard Face-Mask + Iconic Swept Feathered Wings on ALL Gondor Soldiers!
    for (let s = -1; s <= 1; s += 2) {
      const cheek = makeMesh(THREE, g.box, isPhalanx ? m.ironBlack : plateMat, 0.035, 0.15, 0.11);
      cheek.position.set(s * 0.135, 1.48, 0.06);
      const wingScale = isPhalanx ? 0.88 : (isT2 ? 0.68 : 0.56);
      const wing = makeMesh(THREE, g.helmWing, m.wingFeatherWhite, wingScale, wingScale * (isPhalanx ? 1.18 : 1.0), wingScale);
      wing.position.set(s * 0.16, 1.54, 0.02);
      wing.rotation.z = -s * (isPhalanx ? 0.14 : 0.24);
      wing.rotation.y = s * 0.14;
      bodyRoot.add(cheek, wing);
    }
    if (isPhalanx) {
      // Fountain Guard Visor Plate & Tall Silver Crest Spine
      const visor = makeMesh(THREE, g.box, m.mithrilSilver, 0.22, 0.12, 0.08);
      visor.position.set(0, 1.47, 0.14);
      const crestSpine = makeMesh(THREE, g.octa, m.goldRadiant, 0.045, 0.26, 0.12);
      crestSpine.position.set(0, 1.98, -0.02);
      bodyRoot.add(visor, crestSpine);
    }

    // 4. Left Arm (+X): Curved Gondor Heater Shield vs Massive Rectangular Gondor Tower Shield!
    const shieldPivot = new THREE.Group();
    shieldPivot.position.set(0.30, 1.14, 0.12);

    const leftArm = makeMesh(THREE, g.cyl12, plateMat, 0.068, 0.42, 0.068);
    leftArm.rotation.x = HALF_PI * 0.65;
    leftArm.position.set(0.02, -0.02, 0.04);
    shieldPivot.add(leftArm);

    if (isPhalanx) {
      // Massive Curved Rectangular Gondor Tower Shield (Pavise) in Ebony & Mithril-Silver!
      const pavise = makeMesh(THREE, g.towerPavise, m.phalanxBlack, 1.04, 1.02, 1.05);
      pavise.position.set(0.08, -0.16, 0.20);
      pavise.rotation.y = 0.42;
      const silverBorder = makeMesh(THREE, g.towerPavise, m.mithrilSilver, 1.11, 1.07, 0.72);
      silverBorder.position.set(0.07, -0.16, 0.19);
      silverBorder.rotation.y = 0.42;
      const whiteTree = makeMesh(THREE, g.mallornLeaf, m.mithrilSilver, 0.72, 0.62, 0.9);
      whiteTree.position.set(0.11, -0.34, 0.27);
      whiteTree.rotation.y = 0.42;
      const crownStar = makeMesh(THREE, g.octa, m.goldRadiant, 0.08, 0.14, 0.05);
      crownStar.position.set(0.11, 0.16, 0.27);
      crownStar.rotation.y = 0.42;
      shieldPivot.add(silverBorder, pavise, whiteTree, crownStar);
    } else {
      // Sculpted Curved Gondor Kite / Heater Shield with Silver Rim & White Tree Boss!
      const kiteRim = makeMesh(THREE, g.heaterShield, plateMat, 1.10, 1.08, 0.76);
      kiteRim.position.set(0.07, -0.10, 0.17);
      kiteRim.rotation.y = 0.38;
      const kiteBody = makeMesh(THREE, g.heaterShield, m.gondorBlue, 1.0, 1.0, 1.02);
      kiteBody.position.set(0.08, -0.10, 0.18);
      kiteBody.rotation.y = 0.38;
      const kiteTree = makeMesh(THREE, g.octa, m.mithrilSilver, 0.08, 0.24, 0.05);
      kiteTree.position.set(0.11, -0.06, 0.25);
      kiteTree.rotation.y = 0.38;
      shieldPivot.add(kiteRim, kiteBody, kiteTree);
    }
    bodyRoot.add(shieldPivot);

    // 5. Right Arm (-X): Gondorian War-Spear / Sword vs Long Heavy Citadel Phalanx Pike!
    const weaponPivot = new THREE.Group();
    weaponPivot.position.set(-0.32, 1.16, 0.05);

    const rightArm = makeMesh(THREE, g.cyl12, plateMat, 0.068, 0.44, 0.068);
    rightArm.rotation.x = HALF_PI * 0.75;
    rightArm.position.set(0, -0.04, 0.06);
    weaponPivot.add(rightArm);

    if (isPhalanx) {
      // Long Heavy Two-Meter Citadel Phalanx Pike with Cross-Lugs & Pennant!
      const pikeShaft = makeMesh(THREE, g.shaftUp, m.timberOak, 0.038, 2.58, 0.038);
      pikeShaft.rotation.x = 1.12;
      pikeShaft.position.z = -0.52;
      const crossLug = makeMesh(THREE, g.box, m.goldBurnished, 0.24, 0.045, 0.055);
      crossLug.position.set(0, 0.78, 1.56);
      const pikeHead = makeMesh(THREE, g.cone4, m.mithrilSilver, 0.095, 0.46, 0.055);
      pikeHead.rotation.x = 1.12;
      pikeHead.position.set(0, 0.90, 1.80);
      weaponPivot.add(pikeShaft, crossLug, pikeHead);
    } else {
      // Gondorian Ash-Shafted Spear / Broadsword Thrusting Forward (+Z)
      const spearShaft = makeMesh(THREE, g.shaftUp, m.timberOak, 0.034, 1.86, 0.034);
      spearShaft.rotation.x = 1.08;
      spearShaft.position.z = -0.36;
      const collar = makeMesh(THREE, g.cyl8, m.goldBurnished, 0.052, 0.12, 0.052);
      collar.rotation.x = 1.08;
      collar.position.set(0, 0.60, 1.16);
      const spearBlade = makeMesh(THREE, g.bladeUp, m.steelBright, 0.082, 0.44, 0.038);
      spearBlade.rotation.x = 1.08;
      spearBlade.position.set(0, 0.62, 1.20);
      weaponPivot.add(spearShaft, collar, spearBlade);
    }
    bodyRoot.add(weaponPivot);

    const flashMeshes = finalizeShadowAndBaseMats(root);

    return {
      group: root,
      root,
      variant: isPhalanx ? 'phalanx' : 'guard',
      variantKey,
      isKnight: false,
      height3D: isPhalanx ? 2.75 : 2.54,
      bodyRoot,
      legL,
      legR,
      shieldPivot,
      weaponPivot,
      shieldDome,
      flashMeshes
    };
  }

  // ============================================================================
  // 10. FLEXIBLE PUBLIC FACTORY & NORMALIZATION API (TD.TowerModels3D)
  // ============================================================================
  function parseTowerArgs(typeKeyOrVariant, tier, branch, shared) {
    // Pattern 1: createTowerRig({ type, tier, branch }, shared)
    if (typeKeyOrVariant && typeof typeKeyOrVariant === 'object' && !typeKeyOrVariant.THREE) {
      const o = typeKeyOrVariant;
      return {
        type: String(o.typeKey || o.type || o.key || 'elven').split('_')[0].toLowerCase(),
        tier: Number(o.tier) || 1,
        branch: o.branch ? String(o.branch).toUpperCase() : null,
        shared: tier
      };
    }

    const raw = String(typeKeyOrVariant || 'elven').trim();

    // Pattern 2: createTowerRig('elven_3_A', shared)
    if (raw.indexOf('_') !== -1 && (tier === undefined || typeof tier === 'object')) {
      const parts = raw.split('_');
      const tType = parts[0].toLowerCase();
      const tTier = Number(parts[1]) || 1;
      const tBranch = (parts[2] && parts[2] !== '0') ? parts[2].toUpperCase() : null;
      return { type: tType, tier: tTier, branch: tBranch, shared: tier };
    }

    // Pattern 3: createTowerRig(typeKey, tier, branch, shared)
    let resolvedTier = Number(tier) || 1;
    let resolvedBranch = null;
    let resolvedShared = shared;

    if (branch && typeof branch === 'object') {
      resolvedShared = branch;
    } else if (typeof branch === 'string' && branch !== '0') {
      resolvedBranch = branch.toUpperCase();
      if (resolvedTier < 3) resolvedTier = 3;
    }

    return {
      type: raw.toLowerCase(),
      tier: clamp(resolvedTier, 1, 3),
      branch: resolvedTier === 3 ? (resolvedBranch || 'A') : null,
      shared: resolvedShared
    };
  }

  function normalizeSoldierVariantKey(variant) {
    const v = String(variant || 'guard').toLowerCase().trim();
    if (v === 'knight' || v === 'knight_3b' || v === 'rohirrim' || v === 'cavalry' || v === 'riddermark' || v === '3_b' || v === 'garrison_3_b') {
      return 'knight_3B';
    }
    if (v === 'phalanx' || v === 'phalanx_3a' || v === 'tower_guard' || v === 'fountain' || v === '3_a' || v === 'garrison_3_a') {
      return 'phalanx_3A';
    }
    if (v === 'guard_2' || v === 'bastion_guard' || v === '2' || v === '2_0') {
      return 'guard_2';
    }
    return 'guard_1';
  }

  function createTowerRig(typeKey, tier, branch, shared) {
    const spec = parseTowerArgs(typeKey, tier, branch, shared);
    const cache = resolveSharedCache(spec.shared);
    const sub = spec.tier === 3 ? ('3_' + (spec.branch || 'A')) : (spec.tier + '_0');

    if (spec.type === 'elven') return buildElvenTowerRig(sub, cache);
    if (spec.type === 'garrison') return buildGarrisonTowerRig(sub, cache);
    if (spec.type === 'dwarven') return buildDwarvenTowerRig(sub, cache);
    return buildIstariTowerRig(sub, cache);
  }

  function createTowerRigByVariant(variantKey, shared) {
    return createTowerRig(variantKey, shared);
  }

  function createSoldierRig(variant, shared, opts) {
    const cache = resolveSharedCache(shared);
    const chosen = (opts && opts.variantKey) ? opts.variantKey : variant;
    const vKey = normalizeSoldierVariantKey(chosen);
    return buildSculptedSoldierRig(vKey, cache);
  }

  // Standalone Studio Helpers for 3D Portrait Renderer & QA Inspection Sheet
  // Strips invisible raycast hitMesh & hidden status overlays so Box3.setFromObject frames 100% of the sculpture!
  function createStandaloneTowerMesh(typeKey, tier, branch, shared) {
    const rig = createTowerRig(typeKey, tier, branch, shared);
    if (rig.hitMesh && rig.hitMesh.parent) {
      rig.hitMesh.parent.remove(rig.hitMesh);
    }
    if (rig.status && rig.status.group && rig.status.group.parent) {
      rig.status.group.parent.remove(rig.status.group);
    }
    rig.group.userData.rig = rig;
    return rig.group;
  }

  function createStandaloneSoldierMesh(variant, shared) {
    const rig = createSoldierRig(variant, shared);
    if (rig.shieldDome && rig.shieldDome.parent) {
      rig.shieldDome.parent.remove(rig.shieldDome);
    }
    rig.group.userData.rig = rig;
    return rig.group;
  }

  function disposeShared() {
    if (_singletonCache) {
      _singletonCache.dispose();
      _singletonCache = null;
    }
  }

  TD.TowerModels3D = {
    TOWER_VARIANTS,
    SOLDIER_VARIANTS,
    TowerAssetCache,
    getSharedAssets: resolveSharedCache,
    disposeShared,
    createTowerRig,
    createTowerRigByVariant,
    createSoldierRig,
    createStandaloneTowerMesh,
    createStandaloneSoldierMesh
  };
})(window.TD = window.TD || {});
