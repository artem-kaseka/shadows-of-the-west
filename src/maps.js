(function(TD) {
  'use strict';

  const WIDTH = 1280;
  const HEIGHT = 720;
  const TWO_PI = Math.PI * 2;

  // ============================================================================
  // Deterministic PRNG & 2D Procedural Noise
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
    const nx0 = n00 + (n10 - n00) * ux;
    const nx1 = n01 + (n11 - n01) * ux;
    return nx0 + (nx1 - nx0) * uy;
  }

  function fbm2D(x, y, seed) {
    let val = 0;
    let amp = 0.52;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < 4; i++) {
      val += amp * valueNoise2D(x * freq, y * freq, seed + i * 97);
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return val / norm;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  // ============================================================================
  // Path Smoothing, Precomputed Arc-Length Metrics & TD.MapUtils
  // ============================================================================
  function roundCorners(pts, radius, steps) {
    if (!pts || pts.length <= 2) return pts ? pts.map(p => ({ x: p.x, y: p.y })) : [];
    const raw = [{ x: pts[0].x, y: pts[0].y }];
    for (let i = 1; i < pts.length - 1; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const v1x = p0.x - p1.x;
      const v1y = p0.y - p1.y;
      const v2x = p2.x - p1.x;
      const v2y = p2.y - p1.y;
      const l1 = Math.hypot(v1x, v1y);
      const l2 = Math.hypot(v2x, v2y);
      const r = Math.min(radius, l1 * 0.42, l2 * 0.42);
      if (r < 2) {
        raw.push({ x: p1.x, y: p1.y });
        continue;
      }
      const ax = p1.x + (v1x / l1) * r;
      const ay = p1.y + (v1y / l1) * r;
      const bx = p1.x + (v2x / l2) * r;
      const by = p1.y + (v2y / l2) * r;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const mt = 1 - t;
        raw.push({
          x: Math.round((mt * mt * ax + 2 * mt * t * p1.x + t * t * bx) * 100) / 100,
          y: Math.round((mt * mt * ay + 2 * mt * t * p1.y + t * t * by) * 100) / 100
        });
      }
    }
    raw.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });

    // Deduplicate near-coincident points so every segment has strictly positive length
    const clean = [raw[0]];
    for (let i = 1; i < raw.length; i++) {
      const prev = clean[clean.length - 1];
      if (Math.hypot(raw[i].x - prev.x, raw[i].y - prev.y) >= 1.0 || i === raw.length - 1) {
        if (i === raw.length - 1 && Math.hypot(raw[i].x - prev.x, raw[i].y - prev.y) < 1.0 && clean.length > 1) {
          clean[clean.length - 1] = raw[i];
        } else {
          clean.push(raw[i]);
        }
      }
    }
    return clean;
  }

  function computePathMetrics(waypoints) {
    if (!Array.isArray(waypoints) || waypoints.length === 0) {
      return { pathLengths: [0], segLengths: [], segAngles: [], totalLength: 0 };
    }
    if (waypoints.pathLengths && typeof waypoints.totalLength === 'number' && waypoints.pathLengths.length === waypoints.length) {
      return {
        pathLengths: waypoints.pathLengths,
        segLengths: waypoints.segLengths,
        segAngles: waypoints.segAngles,
        totalLength: waypoints.totalLength
      };
    }
    const n = waypoints.length;
    const pathLengths = new Array(n);
    const segLengths = new Array(Math.max(0, n - 1));
    const segAngles = new Array(Math.max(0, n - 1));
    pathLengths[0] = 0;
    let total = 0;
    for (let i = 0; i < n - 1; i++) {
      const dx = waypoints[i + 1].x - waypoints[i].x;
      const dy = waypoints[i + 1].y - waypoints[i].y;
      const len = Math.hypot(dx, dy);
      segLengths[i] = len;
      segAngles[i] = Math.atan2(dy, dx);
      total += len;
      pathLengths[i + 1] = total;
    }
    pathLengths.totalLength = total;
    pathLengths.segLengths = segLengths;

    Object.defineProperties(waypoints, {
      pathLengths: { value: pathLengths, enumerable: false, configurable: true, writable: true },
      segLengths: { value: segLengths, enumerable: false, configurable: true, writable: true },
      segAngles: { value: segAngles, enumerable: false, configurable: true, writable: true },
      totalLength: { value: total, enumerable: false, configurable: true, writable: true }
    });

    return { pathLengths, segLengths, segAngles, totalLength: total };
  }

  function samplePathAtDistance(waypoints, distancePx, out) {
    const res = out || { x: 0, y: 0, angle: 0, progress: 0, distance: 0, totalLength: 0, segIndex: 0, reachedEnd: false };
    if (!Array.isArray(waypoints) || waypoints.length === 0) {
      res.x = 0; res.y = 0; res.angle = 0; res.progress = 0;
      res.distance = 0; res.totalLength = 0; res.segIndex = 0; res.reachedEnd = true;
      return res;
    }
    if (waypoints.length === 1) {
      res.x = waypoints[0].x; res.y = waypoints[0].y; res.angle = 0; res.progress = 1;
      res.distance = 0; res.totalLength = 0; res.segIndex = 0; res.reachedEnd = true;
      return res;
    }

    const metrics = waypoints.pathLengths ? waypoints : computePathMetrics(waypoints);
    const cum = metrics.pathLengths;
    const segLens = metrics.segLengths;
    const segAngs = metrics.segAngles;
    const total = metrics.totalLength;

    if (total <= 0) {
      res.x = waypoints[0].x; res.y = waypoints[0].y; res.angle = 0; res.progress = 1;
      res.distance = 0; res.totalLength = 0; res.segIndex = 0; res.reachedEnd = true;
      return res;
    }

    const rawDist = Number.isFinite(distancePx) ? distancePx : 0;
    const d = clamp(rawDist, 0, total);

    // Binary search for segment index
    let lo = 0;
    let hi = waypoints.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cum[mid] <= d) lo = mid;
      else hi = mid - 1;
    }

    const segIdx = lo;
    const segLen = segLens[segIdx] || 1e-6;
    const localT = clamp((d - cum[segIdx]) / segLen, 0, 1);
    const p0 = waypoints[segIdx];
    const p1 = waypoints[segIdx + 1];

    res.x = p0.x + (p1.x - p0.x) * localT;
    res.y = p0.y + (p1.y - p0.y) * localT;
    res.angle = segAngs[segIdx];
    res.distance = d;
    res.totalLength = total;
    res.progress = d / total;
    res.segIndex = segIdx;
    res.reachedEnd = rawDist >= total;
    return res;
  }

  function samplePath(waypoints, t, out) {
    if (!Array.isArray(waypoints) || waypoints.length === 0) {
      return samplePathAtDistance(waypoints, 0, out);
    }
    const metrics = waypoints.pathLengths ? waypoints : computePathMetrics(waypoints);
    const normT = clamp(Number.isFinite(t) ? t : 0, 0, 1);
    return samplePathAtDistance(waypoints, normT * metrics.totalLength, out);
  }

  function getPathLength(waypoints) {
    if (!Array.isArray(waypoints) || waypoints.length < 2) return 0;
    return (waypoints.pathLengths ? waypoints : computePathMetrics(waypoints)).totalLength;
  }

  function getNearestPathPoint(mapOrPaths, x, y) {
    let lanes = null;
    if (mapOrPaths && Array.isArray(mapOrPaths.paths)) {
      lanes = mapOrPaths.paths;
    } else if (Array.isArray(mapOrPaths)) {
      lanes = Array.isArray(mapOrPaths[0]) ? mapOrPaths : [mapOrPaths];
    }
    if (!lanes || lanes.length === 0) {
      return { x: x || 0, y: y || 0, dist: Infinity, laneIndex: 0, segIndex: 0, angle: 0, t: 0, distanceAlongPath: 0, progress: 0 };
    }

    let bestX = lanes[0][0] ? lanes[0][0].x : 0;
    let bestY = lanes[0][0] ? lanes[0][0].y : 0;
    let bestDistSq = Infinity;
    let bestLane = 0;
    let bestSeg = 0;
    let bestLocalT = 0;

    for (let li = 0; li < lanes.length; li++) {
      const lane = lanes[li];
      if (!lane || lane.length < 2) continue;
      if (!lane.pathLengths) computePathMetrics(lane);
      for (let si = 0; si < lane.length - 1; si++) {
        const x1 = lane[si].x;
        const y1 = lane[si].y;
        const dx = lane[si + 1].x - x1;
        const dy = lane[si + 1].y - y1;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq > 0 ? ((x - x1) * dx + (y - y1) * dy) / lenSq : 0;
        t = clamp(t, 0, 1);
        const px = x1 + t * dx;
        const py = y1 + t * dy;
        const dSq = (x - px) * (x - px) + (y - py) * (y - py);
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestX = px;
          bestY = py;
          bestLane = li;
          bestSeg = si;
          bestLocalT = t;
        }
      }
    }

    const chosen = lanes[bestLane];
    const metrics = chosen.pathLengths ? chosen : computePathMetrics(chosen);
    const distAlong = metrics.pathLengths[bestSeg] + bestLocalT * (metrics.segLengths[bestSeg] || 0);
    const total = metrics.totalLength || 1;
    const angle = metrics.segAngles[bestSeg] || 0;

    return {
      x: bestX,
      y: bestY,
      dist: Math.sqrt(bestDistSq),
      laneIndex: bestLane,
      segIndex: bestSeg,
      angle: angle,
      t: bestLocalT,
      distanceAlongPath: distAlong,
      progress: clamp(distAlong / total, 0, 1)
    };
  }

  function getPadAt(map, x, y, extraRadius) {
    if (!map || !Array.isArray(map.pads)) return null;
    const bonus = Number.isFinite(extraRadius) ? extraRadius : 4;
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < map.pads.length; i++) {
      const pad = map.pads[i];
      const d = Math.hypot(x - pad.x, y - pad.y);
      if (d <= (pad.radius || 24) + bonus && d < bestDist) {
        best = pad;
        bestDist = d;
      }
    }
    return best;
  }

  function clampRallyPoint(map, originX, originY, targetX, targetY, maxRange) {
    const dx = targetX - originX;
    const dy = targetY - originY;
    const d = Math.hypot(dx, dy);
    let cx = targetX;
    let cy = targetY;
    if (d > maxRange && d > 0) {
      cx = originX + (dx / d) * maxRange;
      cy = originY + (dy / d) * maxRange;
    }
    cx = clamp(cx, 36, WIDTH - 36);
    cy = clamp(cy, 74, HEIGHT - 32);
    return { x: cx, y: cy };
  }

  const MapUtils = {
    roundCorners: roundCorners,
    computePathMetrics: computePathMetrics,
    samplePath: samplePath,
    samplePathAtDistance: samplePathAtDistance,
    getPointAtDistance: samplePathAtDistance,
    getPathLength: getPathLength,
    getNearestPathPoint: getNearestPathPoint,
    getPadAt: getPadAt,
    clampRallyPoint: clampRallyPoint
  };

  // ============================================================================
  // Stage Definitions: TD.MAP_LIST & TD.MAPS
  // ============================================================================
  function buildPads(coords) {
    return coords.map(function(pt, idx) {
      return { id: idx, x: pt.x, y: pt.y, radius: 24 };
    });
  }

  function finalizeMap(def) {
    def.paths = def.rawPaths.map(function(pts) {
      const smoothed = roundCorners(pts, 22, 3);
      computePathMetrics(smoothed);
      return smoothed;
    });
    def.flyPaths = def.rawFlyPaths.map(function(pts) {
      const smoothed = roundCorners(pts, 48, 4);
      computePathMetrics(smoothed);
      return smoothed;
    });

    def.pathLengths = def.paths.map(function(lane) { return lane.pathLengths; });
    def.pathTotalLengths = def.paths.map(function(lane) { return lane.totalLength; });
    def.flyPathLengths = def.flyPaths.map(function(lane) { return lane.pathLengths; });
    def.flyPathTotalLengths = def.flyPaths.map(function(lane) { return lane.totalLength; });
    def.laneCount = def.paths.length;
    def.desc = def.description;

    // Bind ergonomic instance methods directly onto each map object as well
    def.getNearestPathPoint = function(arg1, arg2, arg3) {
      if (arg1 && typeof arg1 === 'object') {
        return getNearestPathPoint(def, arg2, arg3);
      }
      return getNearestPathPoint(def, arg1, arg2);
    };
    def.samplePath = function(laneOrIndex, t, isFlyingOrOut, maybeOut) {
      if (Array.isArray(laneOrIndex)) {
        return samplePath(laneOrIndex, t, isFlyingOrOut);
      }
      const pool = isFlyingOrOut === true ? def.flyPaths : def.paths;
      const lane = pool[clamp(laneOrIndex | 0, 0, pool.length - 1)];
      const outObj = (isFlyingOrOut && typeof isFlyingOrOut === 'object') ? isFlyingOrOut : maybeOut;
      return samplePath(lane, t, outObj);
    };
    def.sampleFlyPath = function(laneIndex, t, out) {
      const lane = def.flyPaths[clamp(laneIndex | 0, 0, def.flyPaths.length - 1)];
      return samplePath(lane, t, out);
    };
    def.samplePathAtDistance = function(laneOrIndex, distPx, isFlyingOrOut, maybeOut) {
      if (Array.isArray(laneOrIndex)) {
        return samplePathAtDistance(laneOrIndex, distPx, isFlyingOrOut);
      }
      const pool = isFlyingOrOut === true ? def.flyPaths : def.paths;
      const lane = pool[clamp(laneOrIndex | 0, 0, pool.length - 1)];
      const outObj = (isFlyingOrOut && typeof isFlyingOrOut === 'object') ? isFlyingOrOut : maybeOut;
      return samplePathAtDistance(lane, distPx, outObj);
    };
    def.getPadAt = function(x, y, extraRadius) {
      return getPadAt(def, x, y, extraRadius);
    };
    def.getPadById = function(padId) {
      return def.pads[padId] || null;
    };

    delete def.rawPaths;
    delete def.rawFlyPaths;
    return def;
  }

  const MAP_LIST = ['hornburg', 'pelennor', 'blackgate'];

  const MAPS = {
    hornburg: finalizeMap({
      id: 'hornburg',
      name: 'The Hornburg Causeway',
      subtitle: "Helm's Deep • Rohan",
      description: 'A single winding stone ramp cutting through dark rainy cliffs, past the Deeping Wall and culvert stream into the Hornburg gate.',
      weatherType: 'rain',
      weatherLabel: 'Storm Rain',
      difficultyLabel: '1 Lane • Winding Gorge',
      rawPaths: [[
        { x: -24, y: 230 }, { x: 80, y: 230 }, { x: 205, y: 230 },
        { x: 265, y: 285 }, { x: 265, y: 490 }, { x: 325, y: 550 },
        { x: 485, y: 550 }, { x: 545, y: 490 }, { x: 545, y: 280 },
        { x: 605, y: 225 }, { x: 770, y: 225 }, { x: 830, y: 285 },
        { x: 830, y: 525 }, { x: 890, y: 585 }, { x: 1005, y: 585 },
        { x: 1065, y: 525 }, { x: 1065, y: 310 }, { x: 1120, y: 255 },
        { x: 1190, y: 255 }
      ]],
      rawFlyPaths: [[
        { x: -30, y: 150 },
        { x: 210, y: 180 },
        { x: 470, y: 325 },
        { x: 735, y: 375 },
        { x: 975, y: 320 },
        { x: 1190, y: 255 }
      ]],
      pads: buildPads([
        { x: 155, y: 160 },
        { x: 185, y: 308 },
        { x: 192, y: 435 },
        { x: 342, y: 335 },
        { x: 350, y: 472 },
        { x: 465, y: 468 },
        { x: 408, y: 622 },
        { x: 470, y: 295 },
        { x: 632, y: 302 },
        { x: 748, y: 302 },
        { x: 688, y: 152 },
        { x: 752, y: 455 },
        { x: 915, y: 505 },
        { x: 988, y: 365 }
      ]),
      entryPoints: [
        { laneIndex: 0, x: 72, y: 230, angle: 0 }
      ],
      gatePoint: { x: 1190, y: 255 },
      torches: [
        { x: 392, y: 122, size: 0.95 },
        { x: 525, y: 122, size: 0.95 },
        { x: 625, y: 122, size: 0.95 },
        { x: 815, y: 122, size: 0.95 },
        { x: 965, y: 122, size: 0.95 },
        { x: 382, y: 522, size: 0.85 },
        { x: 432, y: 578, size: 0.85 },
        { x: 1036, y: 482, size: 0.9 },
        { x: 1094, y: 418, size: 0.9 },
        { x: 1036, y: 332, size: 0.95 },
        { x: 1152, y: 213, size: 1.25 },
        { x: 1152, y: 297, size: 1.25 },
        { x: 1218, y: 180, size: 1.05 },
        { x: 1218, y: 330, size: 1.05 }
      ]
    }),

    pelennor: finalizeMap({
      id: 'pelennor',
      name: 'Pelennor Crossroads',
      subtitle: 'Minas Tirith • Gondor',
      description: 'Dual converging siege roads across scorched plains and ruined barricades leading to the gleaming White City walls and Great Gate.',
      weatherType: 'ash',
      weatherLabel: 'Siege Ash',
      difficultyLabel: '2 Converging Lanes • Crossroads',
      rawPaths: [
        [
          { x: -24, y: 175 }, { x: 80, y: 175 }, { x: 230, y: 175 },
          { x: 290, y: 230 }, { x: 290, y: 265 }, { x: 340, y: 295 },
          { x: 470, y: 295 }, { x: 525, y: 245 }, { x: 525, y: 170 },
          { x: 585, y: 135 }, { x: 710, y: 135 }, { x: 765, y: 190 },
          { x: 765, y: 320 }, { x: 815, y: 365 }, { x: 925, y: 365 },
          { x: 975, y: 430 }, { x: 1065, y: 430 }, { x: 1115, y: 365 },
          { x: 1190, y: 365 }
        ],
        [
          { x: -24, y: 530 }, { x: 80, y: 530 }, { x: 230, y: 530 },
          { x: 290, y: 475 }, { x: 290, y: 455 }, { x: 340, y: 425 },
          { x: 470, y: 425 }, { x: 525, y: 475 }, { x: 525, y: 545 },
          { x: 585, y: 580 }, { x: 710, y: 580 }, { x: 765, y: 525 },
          { x: 765, y: 410 }, { x: 815, y: 365 }, { x: 925, y: 365 },
          { x: 975, y: 430 }, { x: 1065, y: 430 }, { x: 1115, y: 365 },
          { x: 1190, y: 365 }
        ]
      ],
      rawFlyPaths: [
        [
          { x: -30, y: 135 },
          { x: 360, y: 215 },
          { x: 775, y: 285 },
          { x: 1190, y: 365 }
        ],
        [
          { x: -30, y: 565 },
          { x: 360, y: 495 },
          { x: 775, y: 435 },
          { x: 1190, y: 365 }
        ]
      ],
      pads: buildPads([
        { x: 165, y: 105 },
        { x: 195, y: 250 },
        { x: 195, y: 452 },
        { x: 245, y: 602 },
        { x: 395, y: 222 },
        { x: 405, y: 360 },
        { x: 395, y: 498 },
        { x: 645, y: 212 },
        { x: 690, y: 360 },
        { x: 645, y: 502 },
        { x: 842, y: 272 },
        { x: 842, y: 458 },
        { x: 945, y: 292 },
        { x: 1020, y: 356 },
        { x: 1020, y: 504 }
      ]),
      entryPoints: [
        { laneIndex: 0, x: 72, y: 175, angle: 0 },
        { laneIndex: 1, x: 72, y: 530, angle: 0 }
      ],
      gatePoint: { x: 1190, y: 365 },
      torches: [
        { x: 1148, y: 320, size: 1.3 },
        { x: 1148, y: 410, size: 1.3 },
        { x: 1146, y: 145, size: 1.05 },
        { x: 1146, y: 235, size: 1.05 },
        { x: 1146, y: 495, size: 1.05 },
        { x: 1146, y: 585, size: 1.05 },
        { x: 798, y: 324, size: 0.95 },
        { x: 798, y: 406, size: 0.95 },
        { x: 525, y: 360, size: 0.9 },
        { x: 282, y: 360, size: 0.9 }
      ]
    }),

    blackgate: finalizeMap({
      id: 'blackgate',
      name: 'The Black Gate',
      subtitle: 'Morannon • Mordor',
      description: 'Short, relentless twin causeways over dark Mordor ash wastes, obsidian crags, and glowing lava fissures between the Teeth of Mordor.',
      weatherType: 'embers',
      weatherLabel: 'Volcanic Embers',
      difficultyLabel: '2 Short Twin Lanes • High Pressure',
      rawPaths: [
        [
          { x: -24, y: 215 }, { x: 85, y: 215 }, { x: 255, y: 215 },
          { x: 325, y: 145 }, { x: 510, y: 145 }, { x: 580, y: 255 },
          { x: 770, y: 255 }, { x: 840, y: 170 }, { x: 1000, y: 170 },
          { x: 1085, y: 320 }, { x: 1185, y: 360 }
        ],
        [
          { x: -24, y: 505 }, { x: 85, y: 505 }, { x: 255, y: 505 },
          { x: 325, y: 575 }, { x: 510, y: 575 }, { x: 580, y: 465 },
          { x: 770, y: 465 }, { x: 840, y: 550 }, { x: 1000, y: 550 },
          { x: 1085, y: 400 }, { x: 1185, y: 360 }
        ]
      ],
      rawFlyPaths: [
        [
          { x: -30, y: 165 },
          { x: 350, y: 235 },
          { x: 750, y: 295 },
          { x: 1185, y: 360 }
        ],
        [
          { x: -30, y: 555 },
          { x: 350, y: 485 },
          { x: 750, y: 425 },
          { x: 1185, y: 360 }
        ]
      ],
      pads: buildPads([
        { x: 175, y: 142 },
        { x: 195, y: 290 },
        { x: 195, y: 430 },
        { x: 245, y: 580 },
        { x: 418, y: 222 },
        { x: 418, y: 498 },
        { x: 605, y: 360 },
        { x: 675, y: 180 },
        { x: 745, y: 360 },
        { x: 675, y: 540 },
        { x: 915, y: 248 },
        { x: 915, y: 472 },
        { x: 995, y: 360 },
        { x: 1112, y: 235 }
      ]),
      entryPoints: [
        { laneIndex: 0, x: 74, y: 215, angle: 0 },
        { laneIndex: 1, x: 74, y: 505, angle: 0 }
      ],
      gatePoint: { x: 1185, y: 360 },
      torches: [
        { x: 52, y: 110, size: 1.35 },
        { x: 88, y: 172, size: 1.0 },
        { x: 88, y: 258, size: 1.0 },
        { x: 88, y: 462, size: 1.0 },
        { x: 88, y: 548, size: 1.0 },
        { x: 52, y: 610, size: 1.35 },
        { x: 520, y: 96, size: 0.9 },
        { x: 520, y: 624, size: 0.9 },
        { x: 855, y: 120, size: 0.9 },
        { x: 855, y: 600, size: 0.9 },
        { x: 1144, y: 314, size: 1.25 },
        { x: 1144, y: 406, size: 1.25 },
        { x: 1168, y: 205, size: 1.0 },
        { x: 1168, y: 515, size: 1.0 }
      ]
    })
  };

  // ============================================================================
  // Offscreen Procedural Artwork Helpers
  // ============================================================================
  function createOffscreenCanvas(w, h) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function makeRadialSprite(size, stops) {
    const c = createOffscreenCanvas(size, size);
    if (!c) return null;
    const gctx = c.getContext('2d');
    const r = size * 0.5;
    const grad = gctx.createRadialGradient(r, r, 0, r, r, r);
    for (let i = 0; i < stops.length; i++) {
      grad.addColorStop(stops[i][0], stops[i][1]);
    }
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, size, size);
    return c;
  }

  function tracePolyline(ctx, pts) {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
  }

  function drawPolygon(ctx, pts) {
    if (!pts || pts.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i][0], pts[i][1]);
    }
    ctx.closePath();
  }

  // Bake smooth 320x180 multi-octave procedural terrain grain upscaled to 1280x720
  function bakeBaseNoise(ctx, mapId) {
    const nw = 320;
    const nh = 180;
    const tmp = createOffscreenCanvas(nw, nh);
    if (!tmp) return;
    const tctx = tmp.getContext('2d');
    const img = tctx.createImageData(nw, nh);
    const data = img.data;
    const seed = mapId === 'hornburg' ? 1337 : (mapId === 'pelennor' ? 4209 : 9001);

    for (let py = 0; py < nh; py++) {
      const wy = (py / nh) * HEIGHT;
      for (let px = 0; px < nw; px++) {
        const wx = (px / nw) * WIDTH;
        const n1 = fbm2D(px * 0.055, py * 0.055, seed);
        const n2 = valueNoise2D(px * 0.24, py * 0.24, seed + 511);
        const n3 = valueNoise2D(px * 0.65, py * 0.65, seed + 887);
        const grain = n1 * 0.62 + n2 * 0.25 + n3 * 0.13;

        let r = 0, g = 0, b = 0;
        if (mapId === 'hornburg') {
          // Stormy wet slate & mossy Rohan gorge
          const moss = clamp(fbm2D(px * 0.08 + 12, py * 0.08 + 7, seed + 303) - 0.35, 0, 0.55);
          const edgeShade = 1 - 0.24 * Math.pow(Math.abs(wy - 360) / 360, 1.5);
          r = (21 + grain * 26 + moss * 14) * edgeShade;
          g = (29 + grain * 34 + moss * 32) * edgeShade;
          b = (38 + grain * 42 + moss * 10) * edgeShade;
        } else if (mapId === 'pelennor') {
          // Scorched siege plains, trampled turf & ash near Minas Tirith
          const turf = clamp(fbm2D(px * 0.07 + 4, py * 0.07 + 19, seed + 211) - 0.32, 0, 0.6);
          const scorch = clamp(fbm2D(px * 0.11 + 31, py * 0.11, seed + 619) - 0.52, 0, 0.45);
          const eastLight = 0.92 + 0.16 * (wx / WIDTH);
          r = (38 + grain * 38 + turf * 22 - scorch * 34) * eastLight;
          g = (34 + grain * 34 + turf * 28 - scorch * 30) * eastLight;
          b = (25 + grain * 24 + turf * 8 - scorch * 18) * eastLight;
        } else {
          // Dark Mordor obsidian ash wastes & central volcanic heat
          const centerHeat = Math.exp(-Math.pow((wy - 360) / 95, 2)) * (wx > 120 && wx < 1080 ? 1 : 0.25);
          const slag = fbm2D(px * 0.09, py * 0.09, seed + 733);
          r = 18 + grain * 24 + slag * 10 + centerHeat * 22;
          g = 15 + grain * 19 + slag * 7 + centerHeat * 7;
          b = 20 + grain * 25 + slag * 11;
        }

        const idx = (py * nw + px) * 4;
        data[idx] = clamp(r | 0, 0, 255);
        data[idx + 1] = clamp(g | 0, 0, 255);
        data[idx + 2] = clamp(b | 0, 0, 255);
        data[idx + 3] = 255;
      }
    }
    tctx.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, 0, 0, WIDTH, HEIGHT);
    ctx.restore();
  }

  function drawCliffEscarpment(ctx, poly, topColor, faceColor, shadowColor, rand) {
    ctx.save();
    drawPolygon(ctx, poly);
    ctx.fillStyle = faceColor;
    ctx.fill();

    // Chiseled rock strata lines
    ctx.strokeStyle = shadowColor;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Faceted inner ledge highlight
    const inner = poly.map(function(p) {
      return [p[0] + (rand() - 0.5) * 8, p[1] - 5 + (rand() - 0.5) * 5];
    });
    drawPolygon(ctx, inner);
    ctx.fillStyle = topColor;
    ctx.globalAlpha = 0.65;
    ctx.fill();

    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = 'rgba(200, 220, 240, 0.25)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < poly.length - 1; i += 2) {
      ctx.beginPath();
      ctx.moveTo(poly[i][0], poly[i][1]);
      ctx.lineTo(poly[i][0] + (rand() - 0.5) * 18, poly[i][1] + 14 + rand() * 14);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Hornburg Deeping Stream channel coordinates (static bed + dynamic water)
  const HORNBURG_STREAM = [
    { x: 576, y: 150 },
    { x: 545, y: 205 },
    { x: 492, y: 268 },
    { x: 446, y: 375 },
    { x: 412, y: 485 },
    { x: 405, y: 550 },
    { x: 382, y: 635 },
    { x: 345, y: 730 }
  ];

  // Black Gate volcanic lava fissure branches (static crust + dynamic magma)
  const BLACKGATE_FISSURES = [
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

  function bakeHornburgFeatures(ctx, map, rand) {
    // Northern & southern mountain cliffs of Helm's Gorge
    drawCliffEscarpment(ctx, [
      [0, 0], [1280, 0], [1280, 96], [1080, 108], [890, 96],
      [690, 92], [460, 104], [295, 118], [120, 115], [0, 138]
    ], '#2a3746', '#17202b', '#0b1017', rand);

    drawCliffEscarpment(ctx, [
      [0, 505], [95, 525], [155, 585], [235, 625], [315, 670],
      [330, 720], [0, 720]
    ], '#263340', '#151d27', '#0a0f15', rand);

    drawCliffEscarpment(ctx, [
      [510, 668], [670, 646], [830, 654], [1045, 648],
      [1155, 590], [1280, 540], [1280, 720], [490, 720]
    ], '#273442', '#161e28', '#0b1017', rand);

    // Scattered gorge boulders (avoiding pads & roads)
    const rocks = [
      [78, 365, 16], [92, 445, 20], [608, 415, 15], [642, 495, 18],
      [660, 585, 22], [935, 210, 16], [945, 265, 13], [1140, 485, 19]
    ];
    for (let i = 0; i < rocks.length; i++) {
      const rx = rocks[i][0], ry = rocks[i][1], rr = rocks[i][2];
      ctx.save();
      ctx.translate(rx, ry);
      ctx.fillStyle = 'rgba(6, 10, 15, 0.5)';
      ctx.beginPath();
      ctx.ellipse(3, 5, rr * 1.1, rr * 0.8, 0.2, 0, TWO_PI);
      ctx.fill();
      ctx.fillStyle = '#2d3b49';
      ctx.beginPath();
      for (let a = 0; a < 7; a++) {
        const ang = (a / 7) * TWO_PI;
        const rad = rr * (0.78 + rand() * 0.32);
        const px = Math.cos(ang) * rad;
        const py = Math.sin(ang) * rad * 0.82;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(175, 205, 230, 0.2)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }

    // Deeping Stream carved stone channel & wet banks (under the road bridge)
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    tracePolyline(ctx, HORNBURG_STREAM);
    ctx.strokeStyle = '#101820';
    ctx.lineWidth = 34;
    ctx.stroke();

    tracePolyline(ctx, HORNBURG_STREAM);
    ctx.strokeStyle = '#182b3a';
    ctx.lineWidth = 24;
    ctx.stroke();

    tracePolyline(ctx, HORNBURG_STREAM);
    ctx.strokeStyle = '#23445c';
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.restore();

    // The Deeping Wall along northern ridge (x: 345..1125, y: 92..152)
    ctx.save();
    // Wall drop shadow onto valley floor
    ctx.fillStyle = 'rgba(5, 8, 13, 0.55)';
    ctx.fillRect(345, 142, 785, 18);

    // Main battered ashlar stone curtain wall
    const wallGrad = ctx.createLinearGradient(0, 92, 0, 148);
    wallGrad.addColorStop(0, '#4a5868');
    wallGrad.addColorStop(0.55, '#374452');
    wallGrad.addColorStop(1, '#232d38');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(345, 96, 785, 50);

    // Individual ashlar stone courses on Deeping Wall
    ctx.strokeStyle = 'rgba(12, 17, 24, 0.48)';
    ctx.lineWidth = 1;
    for (let row = 0; row < 4; row++) {
      const wy = 104 + row * 11;
      ctx.beginPath();
      ctx.moveTo(345, wy);
      ctx.lineTo(1130, wy);
      ctx.stroke();
      const offset = (row % 2) * 14;
      for (let wx = 355 + offset; wx < 1125; wx += 28) {
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx, wy + 11);
        ctx.stroke();
      }
    }

    // Culvert arched iron grate at base of Deeping Wall (x: 576, y: 146)
    ctx.fillStyle = '#090e14';
    ctx.beginPath();
    ctx.arc(576, 146, 15, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5c6c7d';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = '#2d3742';
    ctx.lineWidth = 1.6;
    for (let gx = -10; gx <= 10; gx += 5) {
      ctx.beginPath();
      ctx.moveTo(576 + gx, 133);
      ctx.lineTo(576 + gx, 146);
      ctx.stroke();
    }

    // Battlement walkway & crenellated merlons along Deeping Wall
    ctx.fillStyle = '#566678';
    ctx.fillRect(345, 92, 785, 6);
    for (let mx = 350; mx < 1120; mx += 26) {
      ctx.fillStyle = '#4f5f70';
      ctx.fillRect(mx, 83, 16, 10);
      ctx.strokeStyle = 'rgba(205, 225, 245, 0.25)';
      ctx.strokeRect(mx + 0.5, 83.5, 15, 9);
    }
    ctx.restore();

    // Eastern Hornburg Fortress Keep & Horn Tower (x: 1135..1280)
    ctx.save();
    ctx.fillStyle = 'rgba(5, 8, 14, 0.6)';
    ctx.beginPath();
    ctx.ellipse(1210, 260, 88, 165, 0, 0, TWO_PI);
    ctx.fill();

    // Fortress outer curtain bastion
    const keepGrad = ctx.createLinearGradient(1135, 100, 1280, 400);
    keepGrad.addColorStop(0, '#506072');
    keepGrad.addColorStop(0.5, '#394655');
    keepGrad.addColorStop(1, '#242e39');
    ctx.fillStyle = keepGrad;
    drawPolygon(ctx, [
      [1135, 95], [1280, 80], [1280, 435], [1155, 395],
      [1142, 325], [1142, 185]
    ]);
    ctx.fill();
    ctx.strokeStyle = '#6c7f94';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Twin gatehouse drum towers flanking gatePoint (1190, 255)
    const towerCenters = [[1178, 196, 30], [1178, 314, 30], [1235, 142, 38]];
    for (let i = 0; i < towerCenters.length; i++) {
      const tx = towerCenters[i][0], ty = towerCenters[i][1], tr = towerCenters[i][2];
      ctx.fillStyle = 'rgba(8, 12, 18, 0.55)';
      ctx.beginPath();
      ctx.arc(tx + 4, ty + 6, tr + 2, 0, TWO_PI);
      ctx.fill();

      const tGrad = ctx.createRadialGradient(tx - tr * 0.3, ty - tr * 0.3, 4, tx, ty, tr);
      tGrad.addColorStop(0, '#6a7c90');
      tGrad.addColorStop(0.7, '#3f4d5e');
      tGrad.addColorStop(1, '#252f3b');
      ctx.fillStyle = tGrad;
      ctx.beginPath();
      ctx.arc(tx, ty, tr, 0, TWO_PI);
      ctx.fill();
      ctx.strokeStyle = '#7f93a8';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Crenellation teeth around circular drum tower
      for (let a = 0; a < 10; a++) {
        const ang = (a / 10) * TWO_PI;
        ctx.save();
        ctx.translate(tx + Math.cos(ang) * (tr - 3), ty + Math.sin(ang) * (tr - 3));
        ctx.rotate(ang);
        ctx.fillStyle = '#5c6e82';
        ctx.fillRect(-3, -4, 6, 8);
        ctx.restore();
      }
    }

    // Golden Horn of Helm Hammerhand emblem on the Great Horn Tower (1235, 142)
    ctx.fillStyle = '#c8a24b';
    ctx.beginPath();
    ctx.arc(1235, 142, 12, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = '#243528';
    ctx.beginPath();
    ctx.arc(1235, 142, 9, 0, TWO_PI);
    ctx.fill();
    ctx.strokeStyle = '#f0d27a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(1235, 142, 5, 0.2, 2.6);
    ctx.stroke();
    ctx.restore();
  }

  function bakePelennorFeatures(ctx, map, rand) {
    // Bombardment scorch craters across Pelennor siege fields
    const craters = [
      [115, 345, 26], [465, 185, 20], [465, 535, 22],
      [605, 295, 19], [605, 430, 21], [895, 185, 24], [895, 545, 23]
    ];
    for (let i = 0; i < craters.length; i++) {
      const cx = craters[i][0], cy = craters[i][1], cr = craters[i][2];
      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, cr);
      grad.addColorStop(0, '#14110e');
      grad.addColorStop(0.55, '#241d16');
      grad.addColorStop(0.85, 'rgba(58, 46, 33, 0.65)');
      grad.addColorStop(1, 'rgba(58, 46, 33, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cr * 1.15, cr * 0.88, 0.15 * i, 0, TWO_PI);
      ctx.fill();
    }

    // Trampled Gondorian grass tufts & wheel tracks
    ctx.save();
    ctx.strokeStyle = 'rgba(96, 92, 54, 0.28)';
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 180; i++) {
      const gx = 40 + rand() * 1060;
      const gy = 78 + rand() * 580;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx - 3 + rand() * 6, gy - 5 - rand() * 5);
      ctx.moveTo(gx + 3, gy + 1);
      ctx.lineTo(gx + 5 + rand() * 3, gy - 4 - rand() * 4);
      ctx.stroke();
    }
    ctx.restore();

    // Ruined Rammas Echor stone barricades & timber chevaux-de-frise stakes
    const ruins = [
      { x: 282, y: 360, angle: 0.12, len: 42 },
      { x: 525, y: 360, angle: -0.1, len: 46 },
      { x: 745, y: 88, angle: 0.05, len: 52 },
      { x: 745, y: 632, angle: -0.06, len: 52 }
    ];
    for (let i = 0; i < ruins.length; i++) {
      const r = ruins[i];
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.angle);
      ctx.fillStyle = 'rgba(10, 9, 8, 0.45)';
      ctx.fillRect(-r.len * 0.5 + 3, -7, r.len, 18);
      for (let bx = -r.len * 0.5; bx < r.len * 0.5; bx += 11) {
        ctx.fillStyle = rand() > 0.4 ? '#6e6a61' : '#57534b';
        ctx.fillRect(bx, -8 + (rand() - 0.5) * 3, 9.5, 12);
        ctx.strokeStyle = 'rgba(225, 220, 205, 0.28)';
        ctx.lineWidth = 0.9;
        ctx.strokeRect(bx, -8, 9.5, 12);
      }
      ctx.restore();
    }

    // Broken wooden siege stakes in no-man's-land
    const stakes = [[120, 280], [135, 420], [565, 290], [565, 430], [915, 225], [920, 505]];
    for (let i = 0; i < stakes.length; i++) {
      const sx = stakes[i][0], sy = stakes[i][1];
      ctx.save();
      ctx.translate(sx, sy);
      ctx.strokeStyle = '#4a3522';
      ctx.lineWidth = 2.6;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(k * 7 - 5, 6);
        ctx.lineTo(k * 7 + 6, -7);
        ctx.moveTo(k * 7 - 5, -5);
        ctx.lineTo(k * 7 + 5, 6);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Grand Gondorian Octagonal Mosaic Plaza at the Crossroads (815, 365) (drawn under paths or blended!)
    ctx.save();
    ctx.translate(815, 365);
    ctx.fillStyle = 'rgba(15, 13, 10, 0.45)';
    ctx.beginPath();
    ctx.arc(2, 3, 52, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = '#5c5850';
    ctx.beginPath();
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * TWO_PI + Math.PI / 8;
      const px = Math.cos(ang) * 49;
      const py = Math.sin(ang) * 49;
      if (a === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#9e9788';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Minas Tirith — Gleaming White City Tiered Walls & First Circle Black Wall (x: 1142..1280)
    ctx.save();
    // Shadow cast westward onto Pelennor plain
    const wallShadow = ctx.createLinearGradient(1118, 0, 1152, 0);
    wallShadow.addColorStop(0, 'rgba(10, 9, 8, 0)');
    wallShadow.addColorStop(1, 'rgba(10, 9, 8, 0.65)');
    ctx.fillStyle = wallShadow;
    ctx.fillRect(1118, 45, 36, 640);

    // Outer First Circle Wall (dark Numenorean stone with silver-white marble coping)
    const outerGrad = ctx.createLinearGradient(1144, 0, 1192, 0);
    outerGrad.addColorStop(0, '#2a3038');
    outerGrad.addColorStop(0.5, '#1e232a');
    outerGrad.addColorStop(1, '#15191f');
    ctx.fillStyle = outerGrad;
    ctx.fillRect(1146, 52, 48, 626);

    // White marble parapet & crenellations on First Circle Wall
    ctx.fillStyle = '#d8d4c8';
    ctx.fillRect(1144, 52, 7, 626);
    ctx.fillStyle = '#9c9688';
    for (let my = 60; my < 670; my += 24) {
      if (Math.abs(my - 365) < 52) continue;
      ctx.fillRect(1139, my, 7, 14);
    }

    // Upper gleaming White City tiers rising behind the First Circle (x: 1192..1280)
    const whiteGrad = ctx.createLinearGradient(1190, 0, 1280, 0);
    whiteGrad.addColorStop(0, '#b8b3a6');
    whiteGrad.addColorStop(0.45, '#dedad0');
    whiteGrad.addColorStop(1, '#f2efe6');
    ctx.fillStyle = whiteGrad;
    ctx.fillRect(1192, 40, 88, 648);

    // Tiered white arches, colonnades & citadel buttresses
    ctx.strokeStyle = '#8b8578';
    ctx.lineWidth = 1.5;
    for (let tx = 1205; tx <= 1265; tx += 28) {
      ctx.beginPath();
      ctx.moveTo(tx, 45);
      ctx.lineTo(tx, 680);
      ctx.stroke();
      for (let ty = 75; ty < 660; ty += 42) {
        ctx.fillStyle = '#6c685f';
        ctx.beginPath();
        ctx.arc(tx + 12, ty, 6, Math.PI, 0);
        ctx.lineTo(tx + 18, ty + 14);
        ctx.lineTo(tx + 6, ty + 14);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Semicircular White Marble Bastion Turrets along wall + flanking Great Gate (1190, 365)
    const bastions = [
      [1156, 145, 20], [1156, 235, 20],
      [1168, 314, 29], [1168, 416, 29],
      [1156, 495, 20], [1156, 585, 20]
    ];
    for (let i = 0; i < bastions.length; i++) {
      const bx = bastions[i][0], by = bastions[i][1], br = bastions[i][2];
      const bGrad = ctx.createRadialGradient(bx - br * 0.25, by - br * 0.25, 3, bx, by, br);
      bGrad.addColorStop(0, '#f3efe4');
      bGrad.addColorStop(0.65, '#c7c1b2');
      bGrad.addColorStop(1, '#7c776b');
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, TWO_PI);
      ctx.fill();
      ctx.strokeStyle = '#524e46';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(bx, by, br - 5, 0, TWO_PI);
      ctx.strokeStyle = '#e8dfc8';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  function bakeBlackGateFeatures(ctx, map, rand) {
    // Jagged obsidian crags along upper & lower chasm borders
    drawCliffEscarpment(ctx, [
      [0, 0], [1280, 0], [1280, 88], [1050, 96], [850, 82],
      [620, 94], [380, 78], [160, 95], [0, 108]
    ], '#29222d', '#161219', '#09070b', rand);

    drawCliffEscarpment(ctx, [
      [0, 618], [175, 632], [385, 644], [640, 628],
      [885, 640], [1085, 626], [1280, 636], [1280, 720], [0, 720]
    ], '#28212c', '#151118', '#09070b', rand);

    // Glowing volcanic lava fissure trenches (dark magma crust + ambient red rim)
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < BLACKGATE_FISSURES.length; i++) {
      const f = BLACKGATE_FISSURES[i];
      const w = i < 2 ? 26 : 14;
      tracePolyline(ctx, f);
      ctx.strokeStyle = 'rgba(220, 55, 10, 0.18)';
      ctx.lineWidth = w + 18;
      ctx.stroke();

      tracePolyline(ctx, f);
      ctx.strokeStyle = '#120b0d';
      ctx.lineWidth = w;
      ctx.stroke();

      tracePolyline(ctx, f);
      ctx.strokeStyle = '#4d1408';
      ctx.lineWidth = w * 0.58;
      ctx.stroke();
    }
    ctx.restore();

    // Raised hexagonal basalt outcrops under central chasm pads
    const centralIslands = [[605, 360, 38], [745, 360, 38], [995, 360, 36]];
    for (let i = 0; i < centralIslands.length; i++) {
      const ix = centralIslands[i][0], iy = centralIslands[i][1], ir = centralIslands[i][2];
      ctx.save();
      ctx.translate(ix, iy);
      ctx.fillStyle = '#0b080d';
      ctx.beginPath();
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * TWO_PI + 0.2;
        const rad = ir * (0.94 + (a % 2) * 0.12);
        const px = Math.cos(ang) * rad;
        const py = Math.sin(ang) * rad * 0.88 + 4;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#2d2633';
      ctx.beginPath();
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * TWO_PI + 0.2;
        const rad = (ir - 4) * (0.94 + (a % 2) * 0.1);
        const px = Math.cos(ang) * rad;
        const py = Math.sin(ang) * rad * 0.86;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 110, 40, 0.28)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
    }

    // Western Black Gate (Morannon) Iron Battlements & Teeth of Mordor Towers (x: 0..84)
    ctx.save();
    const ironGrad = ctx.createLinearGradient(0, 0, 86, 0);
    ironGrad.addColorStop(0, '#0d0c10');
    ironGrad.addColorStop(0.65, '#1f1d24');
    ironGrad.addColorStop(1, '#302c36');
    ctx.fillStyle = ironGrad;
    ctx.fillRect(0, 70, 68, 580);

    // Cruel spiked iron merlons along the Black Gate rampart
    ctx.fillStyle = '#18161c';
    for (let sy = 82; sy < 638; sy += 22) {
      if (Math.abs(sy - 215) < 34 || Math.abs(sy - 505) < 34) continue;
      ctx.beginPath();
      ctx.moveTo(66, sy - 7);
      ctx.lineTo(84, sy);
      ctx.lineTo(66, sy + 7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 95, 30, 0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Twin Teeth of Mordor Watchtowers (Towers of the Teeth at y=110 & y=610)
    const teeth = [[48, 110, 38], [48, 610, 38]];
    for (let i = 0; i < teeth.length; i++) {
      const tx = teeth[i][0], ty = teeth[i][1], tr = teeth[i][2];
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.beginPath();
      ctx.arc(tx + 5, ty + 6, tr + 3, 0, TWO_PI);
      ctx.fill();

      const tGrad = ctx.createRadialGradient(tx - 8, ty - 8, 4, tx, ty, tr);
      tGrad.addColorStop(0, '#3d3745');
      tGrad.addColorStop(0.65, '#1e1b24');
      tGrad.addColorStop(1, '#0c0a0f');
      ctx.fillStyle = tGrad;
      ctx.beginPath();
      ctx.arc(tx, ty, tr, 0, TWO_PI);
      ctx.fill();
      ctx.strokeStyle = '#52495c';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Iron crown spikes radiating from Teeth of Mordor
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * TWO_PI;
        ctx.beginPath();
        ctx.moveTo(tx + Math.cos(ang - 0.12) * (tr - 4), ty + Math.sin(ang - 0.12) * (tr - 4));
        ctx.lineTo(tx + Math.cos(ang) * (tr + 8), ty + Math.sin(ang) * (tr + 8));
        ctx.lineTo(tx + Math.cos(ang + 0.12) * (tr - 4), ty + Math.sin(ang + 0.12) * (tr - 4));
        ctx.closePath();
        ctx.fillStyle = '#25212b';
        ctx.fill();
      }

      // Glowing Crimson Eye slit on tower
      ctx.fillStyle = '#ff3d00';
      ctx.beginPath();
      ctx.ellipse(tx + 12, ty, 5, 11, 0, 0, TWO_PI);
      ctx.fill();
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath();
      ctx.ellipse(tx + 13, ty, 1.8, 7, 0, 0, TWO_PI);
      ctx.fill();
    }

    // Eastern Vanguard Bastion Iron-Bound Fortress Wall at gatePoint (1185, 360)
    const eastGrad = ctx.createLinearGradient(1148, 0, 1280, 0);
    eastGrad.addColorStop(0, '#2b2833');
    eastGrad.addColorStop(0.5, '#1d1b22');
    eastGrad.addColorStop(1, '#111015');
    ctx.fillStyle = eastGrad;
    drawPolygon(ctx, [
      [1156, 155], [1280, 115], [1280, 605], [1156, 565],
      [1146, 435], [1146, 285]
    ]);
    ctx.fill();
    ctx.strokeStyle = '#4f495c';
    ctx.lineWidth = 2;
    ctx.stroke();

    const eastTowers = [[1168, 298, 28], [1168, 422, 28]];
    for (let i = 0; i < eastTowers.length; i++) {
      const ex = eastTowers[i][0], ey = eastTowers[i][1], er = eastTowers[i][2];
      const eg = ctx.createRadialGradient(ex - 6, ey - 6, 3, ex, ey, er);
      eg.addColorStop(0, '#4d4859');
      eg.addColorStop(0.7, '#292630');
      eg.addColorStop(1, '#15131a');
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, TWO_PI);
      ctx.fill();
      ctx.strokeStyle = '#6c657d';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Multi-layered weathered stone road renderer
  function bakeStonePaths(ctx, map, rand) {
    const mapId = map.id;
    const pal = mapId === 'hornburg'
      ? { curb: '#4c5b6b', mortar: '#222b35', paverA: [64, 77, 92], paverB: [48, 59, 71], rut: 'rgba(14, 19, 26, 0.42)' }
      : (mapId === 'pelennor'
        ? { curb: '#7d7565', mortar: '#363027', paverA: [112, 104, 89], paverB: [88, 81, 68], rut: 'rgba(32, 26, 18, 0.38)' }
        : { curb: '#433c4a', mortar: '#1b171f', paverA: [62, 55, 68], paverB: [44, 38, 49], rut: 'rgba(255, 85, 20, 0.14)' });

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Layer 1: Road embankment contact shadow
    for (let li = 0; li < map.paths.length; li++) {
      tracePolyline(ctx, map.paths[li]);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.46)';
      ctx.lineWidth = 54;
      ctx.stroke();
    }

    // Layer 2: Outer stone curb base
    for (let li = 0; li < map.paths.length; li++) {
      tracePolyline(ctx, map.paths[li]);
      ctx.strokeStyle = pal.curb;
      ctx.lineWidth = 45;
      ctx.stroke();
    }

    // Layer 3: Inner mortar bed
    for (let li = 0; li < map.paths.length; li++) {
      tracePolyline(ctx, map.paths[li]);
      ctx.strokeStyle = pal.mortar;
      ctx.lineWidth = 37;
      ctx.stroke();
    }

    // Layer 4: Individual chiseled curbstones + weathered road pavers along arc length
    const pt = { x: 0, y: 0, angle: 0 };
    for (let li = 0; li < map.paths.length; li++) {
      const lane = map.paths[li];
      const total = lane.totalLength;

      // Curbstone blocks along both edges
      for (let d = 6; d < total - 6; d += 14) {
        samplePathAtDistance(lane, d, pt);
        const nx = -Math.sin(pt.angle);
        const ny = Math.cos(pt.angle);
        for (let side = -1; side <= 1; side += 2) {
          const cx = pt.x + nx * side * 20.2;
          const cy = pt.y + ny * side * 20.2;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(pt.angle);
          const shade = (rand() - 0.5) * 18;
          ctx.fillStyle = shade > 0 ? pal.curb : pal.mortar;
          ctx.globalAlpha = 0.45;
          ctx.fillRect(-5.5, -2.6, 11, 5.2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.lineWidth = 0.7;
          ctx.strokeRect(-5.5, -2.6, 11, 5.2);
          ctx.restore();
        }
      }

      // Staggered weathered stone flagstones across roadbed
      let row = 0;
      for (let d = 4; d < total - 4; d += 12.5, row++) {
        samplePathAtDistance(lane, d, pt);
        const nx = -Math.sin(pt.angle);
        const ny = Math.cos(pt.angle);
        const offsets = (row % 2 === 0) ? [-11, 0, 11] : [-5.5, 5.5];
        for (let k = 0; k < offsets.length; k++) {
          const lat = offsets[k] + (rand() - 0.5) * 1.6;
          const px = pt.x + nx * lat;
          const py = pt.y + ny * lat;
          const mix = rand();
          const r = (pal.paverA[0] * mix + pal.paverB[0] * (1 - mix) + (rand() - 0.5) * 10) | 0;
          const g = (pal.paverA[1] * mix + pal.paverB[1] * (1 - mix) + (rand() - 0.5) * 10) | 0;
          const b = (pal.paverA[2] * mix + pal.paverB[2] * (1 - mix) + (rand() - 0.5) * 10) | 0;

          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(pt.angle + (rand() - 0.5) * 0.08);
          ctx.fillStyle = 'rgb(' + clamp(r, 0, 255) + ',' + clamp(g, 0, 255) + ',' + clamp(b, 0, 255) + ')';
          const pw = 9.8 + rand() * 2.2;
          const ph = 7.4 + rand() * 2.0;
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(-pw * 0.5, -ph * 0.5, pw, ph, 1.8) : ctx.rect(-pw * 0.5, -ph * 0.5, pw, ph);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
          ctx.lineWidth = 0.6;
          ctx.stroke();
          ctx.restore();
        }
      }

      // Wheel ruts / battle-worn tracks
      for (let side = -1; side <= 1; side += 2) {
        ctx.beginPath();
        for (let d = 0; d <= total; d += 14) {
          samplePathAtDistance(lane, d, pt);
          const wx = pt.x - Math.sin(pt.angle) * side * 7.5;
          const wy = pt.y + Math.cos(pt.angle) * side * 7.5;
          if (d === 0) ctx.moveTo(wx, wy);
          else ctx.lineTo(wx, wy);
        }
        ctx.strokeStyle = pal.rut;
        ctx.lineWidth = 3.2;
        ctx.stroke();
      }
    }

    // Hornburg stone bridge parapets over Deeping Stream at (405, 550)
    if (mapId === 'hornburg') {
      ctx.fillStyle = '#5a6b7d';
      ctx.fillRect(380, 522, 54, 6);
      ctx.fillRect(380, 572, 54, 6);
      ctx.strokeStyle = '#222b36';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(380, 522, 54, 6);
      ctx.strokeRect(380, 572, 54, 6);
    }

    // Pelennor Crossroads central compass rose inlay over road junction (815, 365)
    if (mapId === 'pelennor') {
      ctx.save();
      ctx.translate(815, 365);
      ctx.strokeStyle = 'rgba(235, 225, 198, 0.34)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, TWO_PI);
      ctx.stroke();
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * TWO_PI;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * 5, Math.sin(ang) * 5);
        ctx.lineTo(Math.cos(ang) * 15, Math.sin(ang) * 15);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Subtle inlaid entry chevrons near lane entrances
    for (let i = 0; i < map.entryPoints.length; i++) {
      const ep = map.entryPoints[i];
      for (let c = 0; c < 3; c++) {
        const cx = ep.x + 26 + c * 18;
        const cy = ep.y;
        ctx.strokeStyle = mapId === 'blackgate' ? 'rgba(255, 120, 50, 0.28)' : 'rgba(240, 210, 122, 0.24)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy - 6);
        ctx.lineTo(cx + 3, cy);
        ctx.lineTo(cx - 5, cy + 6);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // Carved circular Gondorian / Dwarven stone foundation pads (radius = 24)
  function bakeFoundationPads(ctx, map) {
    const mapId = map.id;
    const rimLight = mapId === 'pelennor' ? '#b8b09c' : (mapId === 'hornburg' ? '#7b8fa3' : '#70667d');
    const stoneMid = mapId === 'pelennor' ? '#6e6859' : (mapId === 'hornburg' ? '#435262' : '#3a3442');
    const stoneDark = mapId === 'pelennor' ? '#3d3930' : (mapId === 'hornburg' ? '#25303b' : '#211c27');
    const runeCol = mapId === 'blackgate' ? 'rgba(240, 165, 90, 0.28)' : 'rgba(180, 215, 240, 0.26)';

    for (let i = 0; i < map.pads.length; i++) {
      const pad = map.pads[i];
      const x = pad.x;
      const y = pad.y;
      const r = pad.radius || 24;

      ctx.save();
      ctx.translate(x, y);

      // Ground contact drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
      ctx.beginPath();
      ctx.arc(1.5, 3, r + 3.5, 0, TWO_PI);
      ctx.fill();

      // Outer beveled stone curb
      const outerGrad = ctx.createLinearGradient(-r, -r, r, r);
      outerGrad.addColorStop(0, rimLight);
      outerGrad.addColorStop(0.5, stoneMid);
      outerGrad.addColorStop(1, stoneDark);
      ctx.fillStyle = outerGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r + 1.5, 0, TWO_PI);
      ctx.fill();

      // Radial masonry block joints on outer ring
      ctx.strokeStyle = 'rgba(10, 12, 16, 0.55)';
      ctx.lineWidth = 1.1;
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * TWO_PI + 0.2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * (r - 5.5), Math.sin(ang) * (r - 5.5));
        ctx.lineTo(Math.cos(ang) * (r + 1.5), Math.sin(ang) * (r + 1.5));
        ctx.stroke();
      }

      // Recessed inner foundation disk
      const innerGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, r - 5);
      innerGrad.addColorStop(0, stoneMid);
      innerGrad.addColorStop(1, stoneDark);
      ctx.fillStyle = innerGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r - 5.2, 0, TWO_PI);
      ctx.fill();

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 1.3;
      ctx.stroke();

      // Subtle carved Gondorian / Dwarven rune star engraving
      ctx.strokeStyle = runeCol;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(0, 0, r - 10.5, 0, TWO_PI);
      ctx.stroke();

      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * TWO_PI;
        const rIn = (k % 2 === 0) ? (r - 11) : 4.5;
        const px = Math.cos(ang) * rIn;
        const py = Math.sin(ang) * rIn;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, TWO_PI);
      ctx.stroke();

      ctx.restore();
    }
  }

  function bakeMapTerrain(map) {
    const canvas = createOffscreenCanvas(WIDTH, HEIGHT);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const rand = mulberry32(map.id === 'hornburg' ? 7717 : (map.id === 'pelennor' ? 3391 : 5503));

    // 1. Multi-octave procedural pixel terrain base
    bakeBaseNoise(ctx, map.id);

    // 2. Stage-specific cliffs, walls, ruins, water/lava channels & fortresses
    if (map.id === 'hornburg') {
      bakeHornburgFeatures(ctx, map, rand);
    } else if (map.id === 'pelennor') {
      bakePelennorFeatures(ctx, map, rand);
    } else {
      bakeBlackGateFeatures(ctx, map, rand);
    }

    // 3. Multi-layered stone paths, curbstones, pavers & wheel ruts
    bakeStonePaths(ctx, map, rand);

    // 4. Carved circular stone foundation pads
    bakeFoundationPads(ctx, map);

    // 5. Subtle atmospheric edge vignette baked into terrain
    const vig = ctx.createRadialGradient(WIDTH * 0.5, HEIGHT * 0.5, HEIGHT * 0.36, WIDTH * 0.5, HEIGHT * 0.5, WIDTH * 0.62);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(5, 7, 11, 0.42)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    return canvas;
  }

  function bakeRingVignetteCanvas() {
    const c = createOffscreenCanvas(WIDTH, HEIGHT);
    if (!c) return null;
    const gctx = c.getContext('2d');
    const grad = gctx.createRadialGradient(WIDTH * 0.5, HEIGHT * 0.5, HEIGHT * 0.25, WIDTH * 0.5, HEIGHT * 0.5, WIDTH * 0.6);
    grad.addColorStop(0, 'rgba(20, 14, 6, 0)');
    grad.addColorStop(0.58, 'rgba(24, 15, 6, 0.16)');
    grad.addColorStop(0.84, 'rgba(18, 11, 5, 0.56)');
    grad.addColorStop(1, 'rgba(8, 5, 3, 0.85)');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Golden-amber wraith rim glow
    const rim = gctx.createRadialGradient(WIDTH * 0.5, HEIGHT * 0.5, HEIGHT * 0.42, WIDTH * 0.5, HEIGHT * 0.5, WIDTH * 0.58);
    rim.addColorStop(0, 'rgba(255, 175, 45, 0)');
    rim.addColorStop(0.75, 'rgba(245, 165, 40, 0.08)');
    rim.addColorStop(1, 'rgba(255, 130, 20, 0.26)');
    gctx.fillStyle = rim;
    gctx.fillRect(0, 0, WIDTH, HEIGHT);
    return c;
  }

  // ============================================================================
  // Pad State Inspection Helpers (Compatible with Engine & TowerManager)
  // ============================================================================
  function isPadOccupied(pad, game) {
    if (!game) return false;
    if (game.towers) {
      if (typeof game.towers.getTowerOnPad === 'function') {
        return !!game.towers.getTowerOnPad(pad.id);
      }
      if (Array.isArray(game.towers.towers)) {
        const list = game.towers.towers;
        for (let i = 0; i < list.length; i++) {
          if (list[i] && list[i].padId === pad.id) return true;
        }
      }
    }
    return false;
  }

  function isPadSelected(pad, game) {
    if (!game) return false;
    if (game.selectedPad) {
      if (typeof game.selectedPad === 'object' && game.selectedPad.id === pad.id) return true;
      if (game.selectedPad === pad.id) return true;
    }
    if (game.selectedPadId === pad.id || game.activePadId === pad.id) return true;
    if (game.selectedTower && game.selectedTower.padId === pad.id) return true;
    return false;
  }

  function isPadHovered(pad, game) {
    if (!game) return false;
    if (game.hoveredPad) {
      if (typeof game.hoveredPad === 'object' && game.hoveredPad.id === pad.id) return true;
      if (game.hoveredPad === pad.id) return true;
    }
    if (game.hoverPad) {
      if (typeof game.hoverPad === 'object' && game.hoverPad.id === pad.id) return true;
      if (game.hoverPad === pad.id) return true;
    }
    if (game.hoveredPadId === pad.id || game.hoverPadId === pad.id) return true;
    const mx = Number.isFinite(game.mouseX) ? game.mouseX : (game.pointer && Number.isFinite(game.pointer.x) ? game.pointer.x : NaN);
    const my = Number.isFinite(game.mouseY) ? game.mouseY : (game.pointer && Number.isFinite(game.pointer.y) ? game.pointer.y : NaN);
    if (Number.isFinite(mx) && Number.isFinite(my)) {
      return Math.hypot(mx - pad.x, my - pad.y) <= (pad.radius || 24) + 3;
    }
    return false;
  }

  // ============================================================================
  // TD.MapRenderer — Offscreen Cached Terrain + Pooled Weather + Dynamic FX
  // Works seamlessly BOTH as `new TD.MapRenderer()` AND singleton `TD.MapRenderer.*`
  // ============================================================================
  const PARTICLE_POOL_SIZE = 124;

  function MapRenderer() {
    if (!(this instanceof MapRenderer)) {
      return new MapRenderer();
    }
    this.currentMapId = null;
    this._terrainCache = {};
    this._torchGlowSprite = null;
    this._lavaGlowSprite = null;
    this._smokeSprite = null;
    this._ringVignetteCanvas = null;
    this._lastTime = null;

    // Pre-allocate pooled weather particle array once (zero GC churn per frame)
    this._particles = new Array(PARTICLE_POOL_SIZE);
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this._particles[i] = {
        x: 0, y: 0, vx: 0, vy: 0,
        size: 1, alpha: 0.5, phase: 0,
        kind: 0, life: 0, maxLife: 1
      };
    }
  }

  MapRenderer.prototype._ensureSprites = function() {
    if (!this._torchGlowSprite) {
      this._torchGlowSprite = makeRadialSprite(72, [
        [0, 'rgba(255, 200, 95, 0.55)'],
        [0.35, 'rgba(255, 130, 35, 0.25)'],
        [0.7, 'rgba(220, 75, 15, 0.08)'],
        [1, 'rgba(200, 50, 10, 0)']
      ]);
    }
    if (!this._lavaGlowSprite) {
      this._lavaGlowSprite = makeRadialSprite(72, [
        [0, 'rgba(255, 120, 30, 0.58)'],
        [0.45, 'rgba(230, 55, 12, 0.24)'],
        [1, 'rgba(160, 20, 5, 0)']
      ]);
    }
    if (!this._smokeSprite) {
      this._smokeSprite = makeRadialSprite(64, [
        [0, 'rgba(135, 128, 118, 0.24)'],
        [0.5, 'rgba(95, 90, 84, 0.11)'],
        [1, 'rgba(70, 66, 62, 0)']
      ]);
    }
    if (!this._ringVignetteCanvas) {
      this._ringVignetteCanvas = bakeRingVignetteCanvas();
    }
  };

  MapRenderer.prototype._resetParticle = function(p, index, weatherType, initialSpread) {
    const r1 = hash2i(index * 13 + 7, (p.phase * 1000) | 0, 919);
    const r2 = hash2i(index * 29 + 3, ((p.phase + 1.7) * 1000) | 0, 353);
    p.phase += 0.37;

    if (weatherType === 'rain') {
      if (index < 94) {
        // Slanted wind-driven raindrop streak
        p.kind = 0;
        p.x = initialSpread ? r1 * (WIDTH + 220) - 60 : (r1 * (WIDTH + 260) - 40);
        p.y = initialSpread ? r2 * HEIGHT : -20 - r2 * 90;
        p.vx = -230 - r1 * 70;
        p.vy = 690 + r2 * 210;
        p.size = 13 + r1 * 11;
        p.alpha = 0.20 + r2 * 0.24;
        p.life = 0;
        p.maxLife = 2;
      } else {
        // Stone water splash / ripple
        p.kind = 1;
        p.x = 60 + r1 * (WIDTH - 140);
        p.y = 85 + r2 * (HEIGHT - 125);
        p.vx = 0;
        p.vy = 0;
        p.size = 3.5 + r1 * 5.5;
        p.alpha = 0.35 + r2 * 0.25;
        p.life = initialSpread ? r2 * 0.45 : 0;
        p.maxLife = 0.38 + r1 * 0.25;
      }
    } else if (weatherType === 'ash') {
      if (index < 32) {
        // Drifting battle smoke wisp
        p.kind = 0;
        p.x = initialSpread ? r1 * WIDTH : -60;
        p.y = 75 + r2 * (HEIGHT - 120);
        p.vx = 28 + r1 * 24;
        p.vy = -6 + (r2 - 0.5) * 12;
        p.size = 46 + r1 * 54;
        p.alpha = 0.16 + r2 * 0.16;
        p.life = 0;
        p.maxLife = 10;
      } else if (index < 92) {
        // Floating grey siege ash flake
        p.kind = 1;
        p.x = initialSpread ? r1 * WIDTH : -15;
        p.y = initialSpread ? r2 * HEIGHT : r2 * HEIGHT;
        p.vx = 42 + r1 * 42;
        p.vy = 10 + (r2 - 0.35) * 26;
        p.size = 1.6 + r1 * 2.4;
        p.alpha = 0.28 + r2 * 0.34;
        p.life = r1 * 6;
        p.maxLife = 10;
      } else {
        // Warm glowing battle cinder
        p.kind = 2;
        p.x = initialSpread ? r1 * WIDTH : (r1 < 0.3 ? -10 : r1 * WIDTH);
        p.y = initialSpread ? r2 * HEIGHT : HEIGHT + 10;
        p.vx = 48 + r1 * 45;
        p.vy = -26 - r2 * 34;
        p.size = 1.4 + r1 * 2.0;
        p.alpha = 0.55 + r2 * 0.38;
        p.life = r2 * 5;
        p.maxLife = 8;
      }
    } else {
      // 'embers' — Mordor rising glowing embers + volcanic fissure sparks
      if (index < 96) {
        p.kind = 0;
        p.x = initialSpread ? r1 * WIDTH : r1 * WIDTH;
        p.y = initialSpread ? r2 * HEIGHT : HEIGHT + 12 + r2 * 40;
        p.vx = 16 + (r1 - 0.35) * 36;
        p.vy = -42 - r2 * 64;
        p.size = 1.4 + r1 * 2.6;
        p.alpha = 0.55 + r2 * 0.42;
        p.life = r1 * 6;
        p.maxLife = 8;
      } else {
        // Intense fissure heat pulse mote rising from central lava chasm
        p.kind = 1;
        p.x = 120 + r1 * 940;
        p.y = 330 + (r2 - 0.5) * 70;
        p.vx = (r1 - 0.5) * 22;
        p.vy = -28 - r2 * 38;
        p.size = 2.0 + r1 * 2.8;
        p.alpha = 0.72 + r2 * 0.25;
        p.life = initialSpread ? r2 * 1.4 : 0;
        p.maxLife = 1.1 + r1 * 0.9;
      }
    }
  };

  MapRenderer.prototype.initMap = function(mapId) {
    const id = MAPS[mapId] ? mapId : 'hornburg';
    const map = MAPS[id];
    this._ensureSprites();

    if (!this._terrainCache[id]) {
      this._terrainCache[id] = bakeMapTerrain(map);
    }

    this.currentMapId = id;
    this._lastTime = null;

    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this._particles[i].phase = i * 0.6180339;
      this._resetParticle(this._particles[i], i, map.weatherType, true);
    }
    return map;
  };

  MapRenderer.prototype._drawDynamicTerrainFX = function(ctx, map, time) {
    if (map.id === 'hornburg') {
      // Animated rainy culvert stream currents & ripples (masked clear of the road bridge y: 520..580)
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 146, WIDTH, 374);
      ctx.rect(0, 580, WIDTH, 140);
      ctx.clip();

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      tracePolyline(ctx, HORNBURG_STREAM);
      ctx.strokeStyle = 'rgba(120, 185, 235, 0.24)';
      ctx.lineWidth = 8;
      ctx.setLineDash([14, 18]);
      ctx.lineDashOffset = -time * 68;
      ctx.stroke();

      tracePolyline(ctx, HORNBURG_STREAM);
      ctx.strokeStyle = 'rgba(200, 235, 255, 0.28)';
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 22]);
      ctx.lineDashOffset = -time * 92 + 9;
      ctx.stroke();
      ctx.setLineDash([]);

      // Frothy culvert outflow splash at (576, 150)
      const foam = 0.45 + 0.2 * Math.sin(time * 7.5);
      ctx.fillStyle = 'rgba(195, 230, 255, ' + foam.toFixed(2) + ')';
      ctx.beginPath();
      ctx.ellipse(572, 154, 9 + Math.sin(time * 9) * 2, 5, -0.3, 0, TWO_PI);
      ctx.fill();
      ctx.restore();
    } else if (map.id === 'pelennor') {
      // Subtle smoldering crater glow & fluttering Minas Tirith silver-blue pennants
      const pulse = 0.22 + 0.12 * Math.sin(time * 3.4);
      if (this._lavaGlowSprite) {
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.drawImage(this._lavaGlowSprite, 115 - 24, 345 - 24, 48, 48);
        ctx.drawImage(this._lavaGlowSprite, 895 - 22, 185 - 22, 44, 44);
        ctx.drawImage(this._lavaGlowSprite, 895 - 22, 545 - 22, 44, 44);
        ctx.restore();
      }
      // Silver-blue Gondor pennants fluttering in the east wind
      const pennants = [[1156, 145], [1168, 314], [1168, 416], [1156, 585]];
      ctx.save();
      for (let i = 0; i < pennants.length; i++) {
        const px = pennants[i][0], py = pennants[i][1];
        const wave = Math.sin(time * 5.2 + i * 1.4) * 3.5;
        ctx.fillStyle = '#dce6f2';
        ctx.beginPath();
        ctx.moveTo(px, py - 3);
        ctx.quadraticCurveTo(px - 11, py - 1 + wave * 0.5, px - 22, py + wave);
        ctx.lineTo(px, py + 3);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    } else if (map.id === 'blackgate') {
      // Shimmering molten lava fissures & pulsing magma veins
      const pulse = 0.68 + 0.26 * Math.sin(time * 2.8);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 0; i < BLACKGATE_FISSURES.length; i++) {
        const f = BLACKGATE_FISSURES[i];
        const baseW = i < 2 ? 9.5 : 4.5;
        tracePolyline(ctx, f);
        ctx.strokeStyle = 'rgba(255, 82, 14, ' + (0.55 * pulse).toFixed(2) + ')';
        ctx.lineWidth = baseW;
        ctx.stroke();

        tracePolyline(ctx, f);
        ctx.strokeStyle = 'rgba(255, 205, 70, ' + (0.75 * pulse).toFixed(2) + ')';
        ctx.lineWidth = baseW * 0.38;
        ctx.setLineDash([18, 12]);
        ctx.lineDashOffset = -time * 16 + i * 7;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
  };

  MapRenderer.prototype._drawPadHighlights = function(ctx, map, time, game) {
    const isMordor = map.id === 'blackgate';
    for (let i = 0; i < map.pads.length; i++) {
      const pad = map.pads[i];
      const occupied = isPadOccupied(pad, game);
      const selected = isPadSelected(pad, game);
      const hovered = isPadHovered(pad, game);
      const r = pad.radius || 24;

      if (!occupied) {
        const breath = 0.14 + 0.08 * Math.sin(time * 2.3 + pad.id * 0.85);
        ctx.save();
        ctx.strokeStyle = isMordor
          ? 'rgba(255, 165, 75, ' + breath.toFixed(3) + ')'
          : 'rgba(135, 210, 255, ' + breath.toFixed(3) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pad.x, pad.y, r - 6.5, 0, TWO_PI);
        ctx.stroke();
        ctx.restore();
      }

      if (hovered || selected) {
        ctx.save();
        ctx.translate(pad.x, pad.y);
        ctx.fillStyle = selected ? 'rgba(240, 210, 122, 0.18)' : 'rgba(240, 210, 122, 0.11)';
        ctx.beginPath();
        ctx.arc(0, 0, r + 3, 0, TWO_PI);
        ctx.fill();

        ctx.strokeStyle = selected ? '#ffd54f' : '#f0d27a';
        ctx.lineWidth = selected ? 2.4 : 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, r + 2.5, 0, TWO_PI);
        ctx.stroke();

        if (selected) {
          ctx.rotate(time * 0.7);
          ctx.strokeStyle = 'rgba(255, 235, 160, 0.75)';
          ctx.lineWidth = 1.4;
          ctx.setLineDash([7, 9]);
          ctx.beginPath();
          ctx.arc(0, 0, r + 6.5, 0, TWO_PI);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
      }
    }
  };

  MapRenderer.prototype._drawGateBase = function(ctx, map, time) {
    const gp = map.gatePoint;
    ctx.save();
    ctx.translate(gp.x, gp.y);

    // Warm defender threshold glow + recessed fortress gate portal interior
    const glowAlpha = 0.22 + 0.06 * Math.sin(time * 5.1);
    ctx.fillStyle = map.id === 'blackgate'
      ? 'rgba(255, 120, 40, ' + glowAlpha.toFixed(2) + ')'
      : 'rgba(255, 190, 95, ' + glowAlpha.toFixed(2) + ')';
    ctx.beginPath();
    ctx.ellipse(-8, 0, 26, 30, 0, 0, TWO_PI);
    ctx.fill();

    // Dark recessed interior arch where enemies breach into the keep
    ctx.fillStyle = '#07090d';
    ctx.beginPath();
    ctx.ellipse(6, 0, 16, 26, 0, 0, TWO_PI);
    ctx.fill();

    // Stone threshold jambs
    const jambCol = map.id === 'pelennor' ? '#d8d2c3' : (map.id === 'hornburg' ? '#58697c' : '#433d4f');
    ctx.fillStyle = jambCol;
    ctx.fillRect(-10, -32, 24, 8);
    ctx.fillRect(-10, 24, 24, 8);
    ctx.restore();
  };

  MapRenderer.prototype._drawTorches = function(ctx, map, time) {
    const glowSprite = map.id === 'blackgate' ? (this._lavaGlowSprite || this._torchGlowSprite) : this._torchGlowSprite;
    for (let i = 0; i < map.torches.length; i++) {
      const t = map.torches[i];
      const s = t.size || 1;
      const flick1 = Math.sin(time * 11.3 + i * 2.17);
      const flick2 = Math.cos(time * 17.9 + i * 1.41);
      const rad = (28 + flick1 * 3.5) * s;

      if (glowSprite) {
        ctx.drawImage(glowSprite, t.x - rad, t.y - rad, rad * 2, rad * 2);
      }

      // Iron brazier cup
      ctx.fillStyle = '#1b1d22';
      ctx.beginPath();
      ctx.arc(t.x, t.y + 1.5 * s, 4.2 * s, 0, TWO_PI);
      ctx.fill();
      ctx.strokeStyle = '#5a5246';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Outer orange-red dancing flame tongue
      const tipX = t.x + flick2 * 2.4 * s;
      const tipY = t.y - (10.5 + flick1 * 2.6) * s;
      ctx.fillStyle = map.id === 'blackgate' ? '#ff4d00' : '#ff6d00';
      ctx.beginPath();
      ctx.moveTo(t.x - 3.6 * s, t.y + 1 * s);
      ctx.quadraticCurveTo(t.x - 4.2 * s, t.y - 5 * s, tipX, tipY);
      ctx.quadraticCurveTo(t.x + 4.2 * s, t.y - 5 * s, t.x + 3.6 * s, t.y + 1 * s);
      ctx.closePath();
      ctx.fill();

      // Inner bright gold-white core
      ctx.fillStyle = '#ffe57f';
      ctx.beginPath();
      ctx.moveTo(t.x - 1.9 * s, t.y + 0.5 * s);
      ctx.quadraticCurveTo(t.x - 1.8 * s, t.y - 3.5 * s, t.x + flick2 * 1.1 * s, t.y - (6.4 + flick1 * 1.5) * s);
      ctx.quadraticCurveTo(t.x + 1.8 * s, t.y - 3.5 * s, t.x + 1.9 * s, t.y + 0.5 * s);
      ctx.closePath();
      ctx.fill();
    }
  };

  MapRenderer.prototype.renderBackground = function(ctx, mapId, time, game) {
    const id = MAPS[mapId] ? mapId : (this.currentMapId || 'hornburg');
    if (!this._terrainCache[id] || this.currentMapId !== id) {
      this.initMap(id);
    }
    const map = MAPS[id];
    const t = Number.isFinite(time) ? time : 0;

    // 1. Single fast blit of pre-rendered 1280x720 offscreen terrain
    const cached = this._terrainCache[id];
    if (cached) {
      ctx.drawImage(cached, 0, 0);
    }

    // 2. Dynamic animated map features (culvert water / siege embers / lava cracks)
    this._drawDynamicTerrainFX(ctx, map, t);

    // 3. Subtle rune pulse on empty pads & crisp hover/selection highlights
    this._drawPadHighlights(ctx, map, t, game);

    // 4. Fortress gate threshold & recessed arch base
    this._drawGateBase(ctx, map, t);

    // 5. Animated flickering wall & gate torches
    this._drawTorches(ctx, map, t);
  };

  MapRenderer.prototype._drawGateOverhang = function(ctx, map) {
    const gp = map.gatePoint;
    ctx.save();
    ctx.translate(gp.x, gp.y);

    // Overhanging upper stone lintel & iron portcullis teeth so enemies walk UNDER the arch
    if (map.id === 'hornburg') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.fillRect(-4, -30, 26, 60);

      const archGrad = ctx.createLinearGradient(-4, -34, 24, 34);
      archGrad.addColorStop(0, '#627488');
      archGrad.addColorStop(1, '#364352');
      ctx.fillStyle = archGrad;
      ctx.fillRect(2, -34, 22, 68);

      // Portcullis iron spikes along arch lintel
      ctx.fillStyle = '#1d242c';
      for (let py = -22; py <= 22; py += 9) {
        ctx.beginPath();
        ctx.moveTo(2, py - 2.5);
        ctx.lineTo(-5, py);
        ctx.lineTo(2, py + 2.5);
        ctx.closePath();
        ctx.fill();
      }

      // Crenellations & Rohan sun crest on upper gatehouse parapet
      ctx.fillStyle = '#76899e';
      for (let py = -32; py <= 24; py += 14) {
        ctx.fillRect(0, py, 7, 9);
      }
      ctx.fillStyle = '#c8a24b';
      ctx.beginPath();
      ctx.arc(13, 0, 6.5, 0, TWO_PI);
      ctx.fill();
    } else if (map.id === 'pelennor') {
      // Gleaming White Marble Great Gate Arch & Seven-Star Crown
      const archGrad = ctx.createLinearGradient(0, -36, 26, 36);
      archGrad.addColorStop(0, '#f0ece1');
      archGrad.addColorStop(0.6, '#c5bfb0');
      archGrad.addColorStop(1, '#827d70');
      ctx.fillStyle = archGrad;
      ctx.fillRect(2, -36, 24, 72);

      // Mithril & steel gate arch trim + portcullis spikes
      ctx.strokeStyle = '#f0d27a';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(2.5, -35.5, 23, 71);

      ctx.fillStyle = '#2d333b';
      for (let py = -22; py <= 22; py += 9) {
        ctx.beginPath();
        ctx.moveTo(2, py - 2.2);
        ctx.lineTo(-5, py);
        ctx.lineTo(2, py + 2.2);
        ctx.closePath();
        ctx.fill();
      }

      // White Tree / Star emblem on lintel
      ctx.fillStyle = '#252a32';
      ctx.beginPath();
      ctx.arc(14, 0, 7.5, 0, TWO_PI);
      ctx.fill();
      ctx.strokeStyle = '#e8eef5';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(14, 5);
      ctx.lineTo(14, -4);
      ctx.moveTo(10, -1);
      ctx.quadraticCurveTo(14, -5, 18, -1);
      ctx.stroke();
    } else {
      // Iron-clad Vanguard Bastion Arch
      const archGrad = ctx.createLinearGradient(0, -34, 24, 34);
      archGrad.addColorStop(0, '#4a4458');
      archGrad.addColorStop(1, '#201d28');
      ctx.fillStyle = archGrad;
      ctx.fillRect(2, -34, 22, 68);

      ctx.fillStyle = '#121017';
      for (let py = -22; py <= 22; py += 9) {
        ctx.beginPath();
        ctx.moveTo(2, py - 2.5);
        ctx.lineTo(-6, py);
        ctx.lineTo(2, py + 2.5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = '#c8a24b';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(3, -33, 20, 66);
    }

    ctx.restore();
  };

  MapRenderer.prototype._updateAndDrawWeather = function(ctx, map, time, game) {
    let dt = 0.016;
    if (this._lastTime !== null && Number.isFinite(time)) {
      dt = clamp(time - this._lastTime, 0, 0.05);
    }
    this._lastTime = Number.isFinite(time) ? time : 0;
    if (game && game.state === 'paused') {
      dt = 0;
    }

    const wType = map.weatherType;
    const pool = this._particles;

    ctx.save();
    if (wType === 'rain') {
      // Batch rain streaks in one single path for ultra-fast 60fps stroke
      ctx.strokeStyle = 'rgba(185, 218, 248, 0.28)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      for (let i = 0; i < 94; i++) {
        const p = pool[i];
        if (dt > 0) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.y > HEIGHT + 20 || p.x < -40) {
            this._resetParticle(p, i, wType, false);
          }
        }
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.size * 0.33, p.y - p.size);
      }
      ctx.stroke();

      // Stone water splash ripples
      for (let i = 94; i < PARTICLE_POOL_SIZE; i++) {
        const p = pool[i];
        if (dt > 0) {
          p.life += dt;
          if (p.life >= p.maxLife) {
            this._resetParticle(p, i, wType, false);
          }
        }
        const prog = clamp(p.life / p.maxLife, 0, 1);
        const alpha = (1 - prog) * p.alpha;
        ctx.strokeStyle = 'rgba(195, 228, 255, ' + alpha.toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size * (0.4 + prog * 1.1), p.size * (0.2 + prog * 0.55), 0, 0, TWO_PI);
        ctx.stroke();
      }
    } else if (wType === 'ash') {
      // Drifting battle smoke wisps
      for (let i = 0; i < 32; i++) {
        const p = pool[i];
        if (dt > 0) {
          p.x += p.vx * dt;
          p.y += p.vy * dt + Math.sin(time * 0.8 + p.phase) * 4 * dt;
          if (p.x > WIDTH + 70 || p.y < -60 || p.y > HEIGHT + 60) {
            this._resetParticle(p, i, wType, false);
          }
        }
        if (this._smokeSprite) {
          ctx.globalAlpha = p.alpha;
          ctx.drawImage(this._smokeSprite, p.x - p.size, p.y - p.size * 0.65, p.size * 2, p.size * 1.3);
        }
      }
      ctx.globalAlpha = 1;

      // Drifting ash flakes
      ctx.fillStyle = 'rgba(205, 198, 186, 0.42)';
      for (let i = 32; i < 92; i++) {
        const p = pool[i];
        if (dt > 0) {
          p.x += p.vx * dt;
          p.y += p.vy * dt + Math.sin(time * 2.1 + p.phase) * 14 * dt;
          if (p.x > WIDTH + 16 || p.y > HEIGHT + 16 || p.y < -16) {
            this._resetParticle(p, i, wType, false);
          }
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TWO_PI);
        ctx.fill();
      }

      // Warm glowing siege cinders
      for (let i = 92; i < PARTICLE_POOL_SIZE; i++) {
        const p = pool[i];
        if (dt > 0) {
          p.x += p.vx * dt;
          p.y += p.vy * dt + Math.cos(time * 3.0 + p.phase) * 16 * dt;
          if (p.x > WIDTH + 16 || p.y < -16) {
            this._resetParticle(p, i, wType, false);
          }
        }
        const tw = 0.55 + 0.45 * Math.sin(time * 9 + p.phase * 4);
        ctx.fillStyle = tw > 0.75 ? '#ffd54f' : '#ff7043';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TWO_PI);
        ctx.fill();
      }
    } else {
      // 'embers' — Rising glowing Mordor orange embers & volcanic fissure sparks
      for (let i = 0; i < 96; i++) {
        const p = pool[i];
        if (dt > 0) {
          p.x += (p.vx + Math.sin(time * 2.6 + p.phase * 3) * 24) * dt;
          p.y += p.vy * dt;
          if (p.y < -16 || p.x < -20 || p.x > WIDTH + 20) {
            this._resetParticle(p, i, wType, false);
          }
        }
        const glow = 0.5 + 0.5 * Math.sin(time * 10 + p.phase * 5);
        ctx.fillStyle = glow > 0.7 ? 'rgba(255, 224, 110, 0.88)' : 'rgba(255, 98, 24, 0.78)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TWO_PI);
        ctx.fill();
      }

      // Fissure heat sparks rising from molten cracks
      for (let i = 96; i < PARTICLE_POOL_SIZE; i++) {
        const p = pool[i];
        if (dt > 0) {
          p.life += dt;
          p.x += (p.vx + Math.cos(time * 4 + p.phase * 2) * 15) * dt;
          p.y += p.vy * dt;
          if (p.life >= p.maxLife) {
            this._resetParticle(p, i, wType, false);
          }
        }
        const fade = 1 - clamp(p.life / p.maxLife, 0, 1);
        ctx.fillStyle = 'rgba(255, 175, 55, ' + (fade * p.alpha).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + fade * 0.6), 0, TWO_PI);
        ctx.fill();
      }
    }
    ctx.restore();
  };

  MapRenderer.prototype._drawRingWorldOverlay = function(ctx, time, game) {
    const corruption = clamp((game && Number.isFinite(game.corruption)) ? game.corruption : 0, 0, 100) / 100;
    const pulse = 0.76 + 0.16 * Math.sin(time * 3.8);

    ctx.save();
    // 1. Cached golden-shadow wraith vignette
    if (this._ringVignetteCanvas) {
      ctx.globalAlpha = clamp(pulse + corruption * 0.18, 0, 1);
      ctx.drawImage(this._ringVignetteCanvas, 0, 0);
    }

    // 2. Crimson-gold border aura intensifying with Corruption
    ctx.globalAlpha = 1;
    const borderAlpha = 0.22 + 0.12 * Math.sin(time * 5.2) + corruption * 0.28;
    ctx.strokeStyle = corruption > 0.7
      ? 'rgba(255, 78, 25, ' + borderAlpha.toFixed(3) + ')'
      : 'rgba(255, 190, 64, ' + borderAlpha.toFixed(3) + ')';
    ctx.lineWidth = 3 + corruption * 3;
    ctx.strokeRect(6, 6, WIDTH - 12, HEIGHT - 12);

    // 3. Faint glowing procedural Tengwar-inspired Ring script arcs pulsing along screen edges
    const scriptAlpha = 0.20 + 0.14 * Math.sin(time * 3.2) + corruption * 0.22;
    ctx.strokeStyle = corruption > 0.75
      ? 'rgba(255, 120, 45, ' + scriptAlpha.toFixed(3) + ')'
      : 'rgba(255, 212, 98, ' + scriptAlpha.toFixed(3) + ')';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';

    // Top & bottom flowing Tengwar-like calligraphic arcs
    for (let edge = 0; edge < 2; edge++) {
      const baseY = edge === 0 ? 18 : HEIGHT - 18;
      for (let gx = 120; gx <= WIDTH - 120; gx += 44) {
        const localWave = Math.sin(time * 2.4 + gx * 0.025 + edge * 2.1);
        if (localWave < -0.35) continue;
        ctx.save();
        ctx.translate(gx, baseY);
        ctx.globalAlpha = clamp(scriptAlpha * (0.55 + 0.45 * localWave), 0.04, 0.65);
        ctx.beginPath();
        ctx.moveTo(-12, 2);
        ctx.bezierCurveTo(-6, -7, 4, -7, 8, 1);
        ctx.bezierCurveTo(12, 6, 16, -4, 19, -6);
        if ((gx / 44) % 2 === 0) {
          ctx.moveTo(-2, -8);
          ctx.lineTo(-5, 9);
        } else {
          ctx.moveTo(5, -9);
          ctx.lineTo(3, -12);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    // Left & right vertical wraith-mist wisps
    for (let side = 0; side < 2; side++) {
      const baseX = side === 0 ? 18 : WIDTH - 18;
      const dir = side === 0 ? 1 : -1;
      for (let gy = 110; gy <= HEIGHT - 110; gy += 64) {
        const drift = Math.sin(time * 2.1 + gy * 0.03 + side * 1.7);
        ctx.globalAlpha = clamp(scriptAlpha * (0.45 + 0.35 * drift), 0.04, 0.5);
        ctx.beginPath();
        ctx.moveTo(baseX, gy - 14);
        ctx.quadraticCurveTo(baseX + dir * (10 + drift * 5), gy, baseX, gy + 14);
        ctx.stroke();
      }
    }

    ctx.restore();
  };

  MapRenderer.prototype.renderForeground = function(ctx, mapId, time, game) {
    const id = MAPS[mapId] ? mapId : (this.currentMapId || 'hornburg');
    if (!this._terrainCache[id]) {
      this.initMap(id);
    }
    const map = MAPS[id];
    const t = Number.isFinite(time) ? time : 0;

    // 1. Upper fortress gatehouse parapet overhang (depth layer over exiting enemies)
    this._drawGateOverhang(ctx, map);

    // 2. Pooled stage weather particles (rain / ash / embers)
    this._updateAndDrawWeather(ctx, map, t, game);

    // 3. The One Ring shadow-wraith vignette & glowing ring-script border when active
    if (game && game.ringActive) {
      this._drawRingWorldOverlay(ctx, t, game);
    }
  };

  MapRenderer.prototype.renderMiniPreview = function(canvasEl, mapId) {
    if (!canvasEl || typeof canvasEl.getContext !== 'function') return;
    const id = MAPS[mapId] ? mapId : 'hornburg';
    const map = MAPS[id];
    this._ensureSprites();
    if (!this._terrainCache[id]) {
      this._terrainCache[id] = bakeMapTerrain(map);
    }

    const w = canvasEl.width || 220;
    const h = canvasEl.height || 124;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // 1. Scaled high-detail baked terrain
    if (this._terrainCache[id]) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this._terrainCache[id], 0, 0, w, h);
    }

    const sx = w / WIDTH;
    const sy = h / HEIGHT;
    ctx.scale(sx, sy);

    // 2. Crisp thumbnail-scale path accent so lane topology reads immediately on cards
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let li = 0; li < map.paths.length; li++) {
      tracePolyline(ctx, map.paths[li]);
      ctx.strokeStyle = id === 'blackgate' ? 'rgba(255, 145, 70, 0.34)' : 'rgba(245, 224, 168, 0.32)';
      ctx.lineWidth = 14;
      ctx.stroke();
    }

    // Dynamic highlight accent for lava / culvert stream on thumbnail
    if (id === 'blackgate') {
      for (let i = 0; i < 2; i++) {
        tracePolyline(ctx, BLACKGATE_FISSURES[i]);
        ctx.strokeStyle = 'rgba(255, 115, 25, 0.72)';
        ctx.lineWidth = 10;
        ctx.stroke();
      }
    } else if (id === 'hornburg') {
      tracePolyline(ctx, HORNBURG_STREAM);
      ctx.strokeStyle = 'rgba(110, 190, 245, 0.45)';
      ctx.lineWidth = 10;
      ctx.stroke();
    }

    // 3. Build pad foundation glints
    for (let i = 0; i < map.pads.length; i++) {
      const p = map.pads[i];
      ctx.fillStyle = 'rgba(240, 210, 122, 0.25)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 17, 0, TWO_PI);
      ctx.fill();
      ctx.strokeStyle = 'rgba(240, 210, 122, 0.72)';
      ctx.lineWidth = 4.5;
      ctx.stroke();
    }

    // 4. Entry markers & Fortress Gate crest
    for (let i = 0; i < map.entryPoints.length; i++) {
      const ep = map.entryPoints[i];
      ctx.fillStyle = '#ff8f00';
      ctx.beginPath();
      ctx.arc(ep.x, ep.y, 18, 0, TWO_PI);
      ctx.fill();
    }

    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    ctx.arc(map.gatePoint.x - 6, map.gatePoint.y, 22, 0, TWO_PI);
    ctx.fill();
    ctx.strokeStyle = '#171a1f';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.restore();

    // Subtle tarnished-gold inner frame vignette
    ctx.strokeStyle = 'rgba(200, 162, 75, 0.38)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  };

  // Shared singleton methods attached directly on MapRenderer so BOTH
  // `TD.MapRenderer.initMap(...)` AND `new TD.MapRenderer()` work identically!
  const sharedRenderer = new MapRenderer();
  MapRenderer.instance = sharedRenderer;
  MapRenderer.initMap = function(mapId) {
    return sharedRenderer.initMap(mapId);
  };
  MapRenderer.renderBackground = function(ctx, mapId, time, game) {
    return sharedRenderer.renderBackground(ctx, mapId, time, game);
  };
  MapRenderer.renderForeground = function(ctx, mapId, time, game) {
    return sharedRenderer.renderForeground(ctx, mapId, time, game);
  };
  MapRenderer.renderMiniPreview = function(canvasEl, mapId) {
    return sharedRenderer.renderMiniPreview(canvasEl, mapId);
  };

  // ============================================================================
  // Exports on window.TD
  // ============================================================================
  TD.MAP_LIST = MAP_LIST;
  TD.MAPS = MAPS;
  TD.MapUtils = MapUtils;
  TD.MapRenderer = MapRenderer;
  TD.getNearestPathPoint = getNearestPathPoint;
  TD.samplePath = samplePath;

})(window.TD = window.TD || {});
