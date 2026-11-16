(function(TD) {
  'use strict';

  const TWO_PI = Math.PI * 2;
  const HALF_PI = Math.PI * 0.5;

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  // ============================================================================
  // 1. TD.ENEMY_TYPES — Complete Middle-earth Bestiary Roster & Base Stats
  // ============================================================================
  const ENEMY_TYPES = {
    goblin: {
      id: 'goblin',
      key: 'goblin',
      type: 'goblin',
      name: 'Goblin Scavenger',
      role: 'Swarm Runner',
      hp: 48,
      maxHp: 48,
      speed: 96,
      physArmor: 0,
      magicResist: 0,
      bounty: 6,
      reward: 6,
      livesCost: 1,
      flying: false,
      isBoss: false,
      radius: 10,
      meleeDamage: 7,
      meleeInterval: 0.95,
      accentColor: '#7cb342',
      special: 'Swarms in tight packs of 15–20 at high speed.',
      traits: ['Swarm Pack (15–20)', 'Fast Scavenger'],
      desc: 'Wretched cave-runners from the Misty Mountains who skitter forth in frenzied packs, wielding jagged iron daggers beneath tattered hoods.',
      lore: 'Driven from sunless chasms by the whip-crack of captains, Goblin Scavengers overwhelm lone archers through sheer numbers.'
    },
    orc: {
      id: 'orc',
      key: 'orc',
      type: 'orc',
      name: 'Orc Infantry',
      role: 'Armored Footman',
      hp: 115,
      maxHp: 115,
      speed: 64,
      physArmor: 0.20,
      magicResist: 0,
      bounty: 11,
      reward: 11,
      livesCost: 1,
      flying: false,
      isBoss: false,
      radius: 13,
      meleeDamage: 13,
      meleeInterval: 1.15,
      accentColor: '#8d99ae',
      special: 'Light iron armor (20% physical reduction) with notched scimitar & crude shield.',
      traits: ['20% Physical Armor', 'Shielded Infantry'],
      desc: 'Rank-and-file Mordor foot soldiers clad in hammered iron helms, bearing notched scimitars and blackened wooden shields.',
      lore: 'Forged in the furnaces of Gorgoroth, endless columns of Orc Infantry form the grinding anvil of every dark siege.'
    },
    uruk: {
      id: 'uruk',
      key: 'uruk',
      type: 'uruk',
      name: 'Uruk-hai Berserker',
      role: 'Shock Infantry',
      hp: 260,
      maxHp: 260,
      speed: 60,
      physArmor: 0.35,
      magicResist: 0.10,
      bounty: 20,
      reward: 20,
      livesCost: 2,
      flying: false,
      isBoss: false,
      radius: 15,
      meleeDamage: 24,
      meleeInterval: 1.05,
      enrageThreshold: 0.40,
      enrageSpeedMult: 1.50,
      enrageAttackMult: 1.50,
      accentColor: '#ef5350',
      special: 'Blood Rage (<40% HP): Gains +50% movement speed and +50% melee attack speed against blockers.',
      traits: ['Blood Rage (<40% HP: +50% Spd & Atk)', '35% Physical Armor', '10% Magic Resist'],
      desc: 'Heavy shock warriors bearing the White Hand helm. When wounded below 40% health, they fly into a fiery berserk frenzy.',
      lore: 'Bred for relentless war under open sun, Uruk-hai Berserkers feel neither fear nor fatigue once battle-blood is spilled.'
    },
    warg: {
      id: 'warg',
      key: 'warg',
      type: 'warg',
      name: 'Warg Rider',
      role: 'Fast Cavalry',
      hp: 155,
      maxHp: 155,
      speed: 112,
      physArmor: 0.15,
      magicResist: 0,
      bounty: 16,
      reward: 16,
      livesCost: 1,
      flying: false,
      isBoss: false,
      radius: 15,
      meleeDamage: 18,
      meleeInterval: 0.95,
      leapCooldown: 10.0,
      accentColor: '#ffb74d',
      special: 'Predator Leap (10s CD): Vaults straight past the first Garrison soldier attempting to block it.',
      traits: ['Predator Leap (Vaults Blockers, 10s CD)', 'Very Fast Cavalry'],
      desc: 'Feral giant wolves ridden by scout raiders, bounding effortlessly over front-line shield walls to tear toward the fortress gate.',
      lore: 'Swifter than wild horses on broken stone, Warg packs strike gaps before defenders can brace spears.'
    },
    troll: {
      id: 'troll',
      key: 'troll',
      type: 'troll',
      name: 'Olog-hai Siege Troll',
      role: 'Living Battering Ram',
      hp: 850,
      maxHp: 850,
      speed: 36,
      physArmor: 0.60,
      magicResist: 0.10,
      bounty: 48,
      reward: 48,
      livesCost: 3,
      flying: false,
      isBoss: false,
      radius: 22,
      meleeDamage: 45,
      meleeInterval: 1.80,
      aoeSmashRadius: 55,
      regenPerSec: 18,
      fireSuppressDuration: 4.0,
      accentColor: '#a1887f',
      special: 'AoE club smash (45 dmg in 55px radius) & regenerates 18 HP/s unless hit by Fire or Magic within 4.0s.',
      traits: ['60% Physical Armor', 'AoE Smash (45 dmg / 55px)', 'Regens 18 HP/s (Stopped by Fire/Magic)'],
      desc: 'Colossal armored war-troll whose sweeping war-club crushes entire Garrison squads and whose stony flesh knits rapidly unless seared by flame or sorcery.',
      lore: 'Cunning and sun-hardened giants of the Dark Tower, Olog-hai stride through arrow-storms to shatter fortress gates.'
    },
    wraith: {
      id: 'wraith',
      key: 'wraith',
      type: 'wraith',
      name: 'Shadow Wraith',
      role: 'Spectral Assassin',
      hp: 170,
      maxHp: 170,
      speed: 74,
      physArmor: 0.10,
      magicResist: 0.30,
      bounty: 24,
      reward: 24,
      livesCost: 2,
      flying: false,
      isBoss: false,
      radius: 13,
      meleeDamage: 20,
      meleeInterval: 1.10,
      dodgeChance: 0.80,
      accentColor: '#4dd0e1',
      special: '80% physical dodge chance unless revealed by Istari Spire, Light of Eärendil, or Ring True Sight.',
      traits: ['80% Physical Dodge (Stealth)', '30% Magic Resist', 'Countered by Reveal / True Sight'],
      desc: 'Semi-transparent phantom drifting half in the Unseen World, evading 80% of physical attacks unless illuminated by arcane light or the One Ring.',
      lore: 'Bound to ancient Morgul curses, mortal steel passes harmlessly through their spectral shrouds.'
    },
    fellbeast: {
      id: 'fellbeast',
      key: 'fellbeast',
      type: 'fellbeast',
      name: 'Fell Beast',
      role: 'Aerial Predator',
      hp: 240,
      maxHp: 240,
      speed: 70,
      physArmor: 0.15,
      magicResist: 0.20,
      bounty: 28,
      reward: 28,
      livesCost: 2,
      flying: true,
      isBoss: false,
      radius: 17,
      meleeDamage: 0,
      meleeInterval: 1.0,
      accentColor: '#9575cd',
      special: 'Flying: Follows aerial routes, ignores Garrison blockers, and can only be targeted by anti-air towers & spells.',
      traits: ['Flying (Ignores Ground & Blockers)', 'Only Hit by Elven, Istari & Spells'],
      desc: 'Winged carrion-drake soaring high above walls and ground fortifications along direct aerial approaches to the citadel.',
      lore: 'Reared on foul meats in dark eyries beyond the Great River, their leathery wings blot out the stars.'
    },
    ringwraith: {
      id: 'ringwraith',
      key: 'ringwraith',
      type: 'ringwraith',
      name: 'Ringwraith Boss',
      role: 'Corruption Nemesis Boss',
      hp: 1800,
      maxHp: 1800,
      speed: 50,
      physArmor: 0.40,
      magicResist: 0.40,
      bounty: 90,
      reward: 90,
      livesCost: 5,
      flying: false,
      isBoss: true,
      radius: 20,
      meleeDamage: 55,
      meleeInterval: 1.30,
      blackBreathRadius: 165,
      blackBreathInterval: 8.0,
      blackBreathStun: 4.0,
      accentColor: '#b388ff',
      special: 'Spawned immediately at 100% Ring Corruption! Black Breath pulses on spawn and every 8s, stunning towers in 165px for 4.0s.',
      traits: ['Boss (100% Ring Corruption)', 'Black Breath (165px 4s Tower Stun / 8s)', '40% Phys & Magic Resist'],
      desc: 'Undying servant of the Nine drawn immediately to the battlefield when Ring Corruption reaches 100%, freezing nearby towers in terror.',
      lore: 'Those who wear the Great Ring too long draw the gaze of the Lidless Eye and its deadliest hunters.'
    },
    balrog: {
      id: 'balrog',
      key: 'balrog',
      type: 'balrog',
      name: 'The Witch-lord / Balrog of Udûn',
      role: 'Grand Siege Overlord Boss',
      hp: 4600,
      maxHp: 4600,
      speed: 34,
      physArmor: 0.45,
      magicResist: 0.35,
      phase2Speed: 40,
      phase2PhysArmor: 0.35,
      phase2MagicResist: 0.45,
      phase2HealPct: 0.15,
      bounty: 250,
      reward: 250,
      livesCost: 20,
      flying: false,
      isBoss: true,
      radius: 26,
      meleeDamage: 95,
      meleeInterval: 1.50,
      aoeSmashRadius: 65,
      curseInterval: 6.5,
      curseRange: 320,
      curseDuration: 3.0,
      curseClicks: 3,
      accentColor: '#ff6d00',
      special: '2-Phase Boss: Witch-lord (100%–50% HP) transforms into Balrog of Udûn (<50% HP, +15% maxHP). Casts Dark Spell Lock every 6.5s within 320px (click tower 3x to break!).',
      traits: ['Phase 1: Witch-lord (45% Armor / 35% MR)', 'Phase 2 (<50% HP): Balrog (+15% HP, 40 Spd, 45% MR)', 'Spell Lock (320px: Click Tower 3x)'],
      desc: 'Supreme commander of the Wave 15 Grand Siege. Marches first as the crowned Witch-lord of Morgul before erupting into a Demon of Shadow and Flame.',
      lore: 'Beneath shattered iron armor slumbers the secret fire of Udûn — a terror of the Elder Days armed with flaming blade and many-thonged whip.'
    }
  };

  const ENEMY_ORDER = [
    'goblin', 'orc', 'uruk', 'warg', 'troll', 'wraith', 'fellbeast', 'ringwraith', 'balrog'
  ];

  // ============================================================================
  // 2. TD.WAVES — 15 Structured Siege Waves + Procedural Endless Generator
  // ============================================================================
  const WAVES = [
    {
      wave: 1,
      title: 'Scouts of the Misty Mountains',
      hpMult: 1.0,
      groups: [
        { type: 'goblin', count: 16, interval: 0.22, delay: 0.2, lane: 0 },
        { type: 'orc', count: 5, interval: 1.05, delay: 5.2, lane: 'alternate' }
      ]
    },
    {
      wave: 2,
      title: 'Mordor Vanguard',
      hpMult: 1.0,
      groups: [
        { type: 'goblin', count: 18, interval: 0.22, delay: 0.2, lane: 1 },
        { type: 'orc', count: 8, interval: 0.90, delay: 4.8, lane: 'alternate' },
        { type: 'goblin', count: 15, interval: 0.22, delay: 11.2, lane: 0 }
      ]
    },
    {
      wave: 3,
      title: 'Howls on the Causeway',
      hpMult: 1.0,
      groups: [
        { type: 'orc', count: 8, interval: 0.85, delay: 0.2, lane: 'alternate' },
        { type: 'warg', count: 5, interval: 0.95, delay: 5.2, lane: 'alternate' },
        { type: 'goblin', count: 16, interval: 0.22, delay: 10.2, lane: 0 }
      ]
    },
    {
      wave: 4,
      title: 'Outrider Fang Pack',
      hpMult: 1.04,
      groups: [
        { type: 'goblin', count: 18, interval: 0.22, delay: 0.2, lane: 0 },
        { type: 'warg', count: 7, interval: 0.80, delay: 4.2, lane: 1 },
        { type: 'orc', count: 10, interval: 0.78, delay: 9.0, lane: 'alternate' }
      ]
    },
    {
      wave: 5,
      title: 'March of the White Hand',
      hpMult: 1.06,
      groups: [
        { type: 'orc', count: 10, interval: 0.75, delay: 0.2, lane: 'alternate' },
        { type: 'uruk', count: 4, interval: 1.45, delay: 5.5, lane: 'alternate' },
        { type: 'goblin', count: 18, interval: 0.22, delay: 10.5, lane: 1 },
        { type: 'warg', count: 4, interval: 0.85, delay: 13.5, lane: 0 }
      ]
    },
    {
      wave: 6,
      title: 'Isengard Shock Column',
      hpMult: 1.08,
      groups: [
        { type: 'uruk', count: 6, interval: 1.25, delay: 0.2, lane: 'alternate' },
        { type: 'warg', count: 8, interval: 0.72, delay: 5.0, lane: 'alternate' },
        { type: 'goblin', count: 20, interval: 0.22, delay: 10.2, lane: 0 }
      ]
    },
    {
      wave: 7,
      title: 'Drums in the Deep',
      hpMult: 1.10,
      groups: [
        { type: 'goblin', count: 18, interval: 0.22, delay: 0.2, lane: 0 },
        { type: 'troll', count: 1, interval: 2.0, delay: 4.2, lane: 0 },
        { type: 'orc', count: 9, interval: 0.75, delay: 5.8, lane: 1 },
        { type: 'uruk', count: 4, interval: 1.35, delay: 11.2, lane: 'alternate' }
      ]
    },
    {
      wave: 8,
      title: 'Breaching Ram Assault',
      hpMult: 1.12,
      groups: [
        { type: 'uruk', count: 6, interval: 1.15, delay: 0.2, lane: 'alternate' },
        { type: 'troll', count: 2, interval: 3.4, delay: 4.8, lane: 'alternate' },
        { type: 'warg', count: 8, interval: 0.70, delay: 8.0, lane: 'alternate' },
        { type: 'goblin', count: 20, interval: 0.22, delay: 12.8, lane: 1 }
      ]
    },
    {
      wave: 9,
      title: 'Shades of Minas Morgul',
      hpMult: 1.14,
      groups: [
        { type: 'wraith', count: 8, interval: 0.95, delay: 0.2, lane: 'alternate' },
        { type: 'uruk', count: 6, interval: 1.20, delay: 6.2, lane: 'alternate' },
        { type: 'wraith', count: 6, interval: 0.85, delay: 11.0, lane: 0 },
        { type: 'goblin', count: 18, interval: 0.22, delay: 13.8, lane: 1 }
      ]
    },
    {
      wave: 10,
      title: 'Anvil of Gorgoroth',
      hpMult: 1.16,
      groups: [
        { type: 'troll', count: 2, interval: 3.2, delay: 0.2, lane: 'alternate' },
        { type: 'uruk', count: 8, interval: 1.05, delay: 3.5, lane: 'alternate' },
        { type: 'wraith', count: 8, interval: 0.80, delay: 9.2, lane: 'alternate' },
        { type: 'warg', count: 10, interval: 0.65, delay: 13.5, lane: 'alternate' }
      ]
    },
    {
      wave: 11,
      title: 'Wings Over the Parapet',
      hpMult: 1.18,
      groups: [
        { type: 'fellbeast', count: 6, interval: 1.30, delay: 0.2, lane: 'alternate' },
        { type: 'orc', count: 12, interval: 0.62, delay: 4.2, lane: 'alternate' },
        { type: 'fellbeast', count: 4, interval: 1.15, delay: 9.2, lane: 'alternate' },
        { type: 'uruk', count: 6, interval: 1.10, delay: 11.0, lane: 'alternate' }
      ]
    },
    {
      wave: 12,
      title: 'Shadow and Talon',
      hpMult: 1.20,
      groups: [
        { type: 'goblin', count: 20, interval: 0.22, delay: 0.2, lane: 0 },
        { type: 'troll', count: 2, interval: 3.0, delay: 2.5, lane: 'alternate' },
        { type: 'fellbeast', count: 7, interval: 1.10, delay: 5.5, lane: 'alternate' },
        { type: 'wraith', count: 10, interval: 0.75, delay: 10.0, lane: 'alternate' },
        { type: 'warg', count: 8, interval: 0.62, delay: 14.2, lane: 'alternate' }
      ]
    },
    {
      wave: 13,
      title: 'Legions of the Lidless Eye',
      hpMult: 1.24,
      groups: [
        { type: 'troll', count: 3, interval: 2.8, delay: 0.2, lane: 'alternate' },
        { type: 'uruk', count: 10, interval: 0.92, delay: 3.0, lane: 'alternate' },
        { type: 'fellbeast', count: 8, interval: 1.05, delay: 7.8, lane: 'alternate' },
        { type: 'goblin', count: 20, interval: 0.22, delay: 11.8, lane: 0 },
        { type: 'goblin', count: 18, interval: 0.22, delay: 12.2, lane: 1 }
      ]
    },
    {
      wave: 14,
      title: 'Vanguard of the Black Gate',
      hpMult: 1.28,
      groups: [
        { type: 'warg', count: 12, interval: 0.58, delay: 0.2, lane: 'alternate' },
        { type: 'troll', count: 3, interval: 2.6, delay: 3.8, lane: 'alternate' },
        { type: 'wraith', count: 12, interval: 0.68, delay: 6.5, lane: 'alternate' },
        { type: 'fellbeast', count: 10, interval: 0.92, delay: 10.2, lane: 'alternate' },
        { type: 'uruk', count: 10, interval: 0.85, delay: 13.8, lane: 'alternate' }
      ]
    },
    {
      wave: 15,
      title: 'Doom of Udûn — The Grand Siege',
      hpMult: 1.0,
      groups: [
        { type: 'goblin', count: 20, interval: 0.22, delay: 0.2, lane: 0, hpScale: 1.3 },
        { type: 'troll', count: 2, interval: 3.0, delay: 2.6, lane: 'alternate', hpScale: 1.2 },
        { type: 'balrog', count: 1, interval: 1.0, delay: 5.0, lane: 0, hpScale: 1.0 },
        { type: 'uruk', count: 8, interval: 0.95, delay: 7.5, lane: 'alternate', hpScale: 1.25 },
        { type: 'wraith', count: 8, interval: 0.80, delay: 11.5, lane: 'alternate', hpScale: 1.25 },
        { type: 'fellbeast', count: 8, interval: 1.05, delay: 14.5, lane: 'alternate', hpScale: 1.25 }
      ]
    }
  ];

  function getWaveConfig(waveNum) {
    const n = Math.max(1, Math.floor(waveNum || 1));
    if (n <= WAVES.length) {
      return WAVES[n - 1];
    }

    // Endless Mode Wave Generator (waveNum > 15)
    const over = n - 15;
    const hpMult = 1.30 * Math.pow(1.135, over);
    const speedMult = Math.min(1.30, 1 + over * 0.014);
    const isBossWave = (n % 5 === 0);
    const goblinPack = 16 + (n % 5); // 16..20 tight swarm packs
    const trollCount = Math.min(8, 2 + Math.floor(over * 0.45));
    const fellCount = Math.min(16, 6 + Math.floor(over * 0.65));
    const urukCount = Math.min(18, 8 + Math.floor(over * 0.6));
    const wraithCount = Math.min(16, 7 + Math.floor(over * 0.55));
    const wargCount = Math.min(16, 8 + Math.floor(over * 0.5));

    const groups = [
      { type: 'goblin', count: goblinPack, interval: 0.22, delay: 0.2, lane: 0 },
      { type: 'goblin', count: goblinPack, interval: 0.22, delay: 0.8, lane: 1 },
      { type: 'warg', count: wargCount, interval: 0.52, delay: 3.2, lane: 'alternate' },
      { type: 'troll', count: trollCount, interval: 2.3, delay: 5.5, lane: 'alternate' },
      { type: 'uruk', count: urukCount, interval: 0.78, delay: 7.5, lane: 'alternate' },
      { type: 'fellbeast', count: fellCount, interval: 0.85, delay: 10.2, lane: 'alternate' },
      { type: 'wraith', count: wraithCount, interval: 0.65, delay: 13.0, lane: 'alternate' }
    ];

    if (isBossWave) {
      groups.push({ type: 'balrog', count: 1, interval: 1.0, delay: 6.2, lane: 0, hpScale: 1.0 });
      groups.push({ type: 'ringwraith', count: over >= 10 ? 2 : 1, interval: 3.5, delay: 9.0, lane: 'alternate', hpScale: 1.0 });
    } else if (over % 3 === 0) {
      // Extra heavy siege squadron wave
      groups.push({ type: 'troll', count: 2, interval: 2.0, delay: 15.0, lane: 'alternate' });
      groups.push({ type: 'fellbeast', count: 5, interval: 0.75, delay: 15.5, lane: 'alternate' });
    }

    return {
      wave: n,
      title: isBossWave ? 'Endless Dread Overlord (Wave ' + n + ')' : 'Endless Siege Assault (Wave ' + n + ')',
      hpMult: hpMult,
      speedMult: speedMult,
      endless: true,
      groups: groups
    };
  }

  WAVES.getWaveConfig = getWaveConfig;

  // ============================================================================
  // 3. Fast Cached Path Metric Helper (Zero Allocation in Simulation Loop)
  // ============================================================================
  const pathMetricCache = new WeakMap();
  const sampleScratch = { x: 0, y: 0, angle: 0, progress: 0 };

  function extractWaypoints(rawLane) {
    if (Array.isArray(rawLane)) return rawLane;
    if (rawLane && Array.isArray(rawLane.waypoints)) return rawLane.waypoints;
    if (rawLane && Array.isArray(rawLane.points)) return rawLane.points;
    return null;
  }

  function getPathMetric(rawLane) {
    const pts = extractWaypoints(rawLane);
    if (!pts || pts.length === 0) {
      return {
        pts: [{ x: 40, y: 360 }, { x: 1220, y: 360 }],
        cumDist: new Float64Array([0, 1180]),
        segLen: new Float64Array([1180]),
        segAngle: new Float64Array([0]),
        totalLength: 1180
      };
    }
    let cached = pathMetricCache.get(pts);
    if (cached && cached.count === pts.length) {
      return cached;
    }

    const n = pts.length;
    const cumDist = new Float64Array(n);
    const segLen = new Float64Array(Math.max(1, n - 1));
    const segAngle = new Float64Array(Math.max(1, n - 1));
    let total = 0;
    cumDist[0] = 0;
    for (let i = 0; i < n - 1; i++) {
      const dx = pts[i + 1].x - pts[i].x;
      const dy = pts[i + 1].y - pts[i].y;
      const len = Math.hypot(dx, dy) || 0.0001;
      segLen[i] = len;
      segAngle[i] = Math.atan2(dy, dx);
      total += len;
      cumDist[i + 1] = total;
    }
    cached = {
      pts: pts,
      count: n,
      cumDist: cumDist,
      segLen: segLen,
      segAngle: segAngle,
      totalLength: Math.max(1, total)
    };
    pathMetricCache.set(pts, cached);
    return cached;
  }

  function samplePathAtDist(metric, dist, lateralOffset, out) {
    const pts = metric.pts;
    const n = pts.length;
    if (n === 1) {
      out.x = pts[0].x;
      out.y = pts[0].y;
      out.angle = 0;
      out.progress = 1;
      return out;
    }
    const total = metric.totalLength;
    const d = clamp(dist, 0, total);
    const cum = metric.cumDist;

    // Binary search segment
    let lo = 0;
    let hi = n - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cum[mid] <= d) lo = mid;
      else hi = mid - 1;
    }

    const segStart = cum[lo];
    const len = metric.segLen[lo];
    const t = len > 0 ? clamp((d - segStart) / len, 0, 1) : 0;
    const p0 = pts[lo];
    const p1 = pts[lo + 1];
    const angle = metric.segAngle[lo];

    // Taper lateral swarm offset near spawn & gate so units enter/exit cleanly
    const edgeTaper = Math.min(1, d / 45, (total - d) / 45);
    const lat = (lateralOffset || 0) * Math.max(0, edgeTaper);

    out.x = p0.x + (p1.x - p0.x) * t + Math.cos(angle + HALF_PI) * lat;
    out.y = p0.y + (p1.y - p0.y) * t + Math.sin(angle + HALF_PI) * lat;
    out.angle = angle;
    out.progress = d / total;
    return out;
  }

  // ============================================================================
  // 4. Garrison Soldier & Tower Helpers
  // ============================================================================
  function isSoldierAlive(s) {
    if (!s) return false;
    if (s.dead === true || s.alive === false || s.active === false) return false;
    if (typeof s.respawnTimer === 'number' && s.respawnTimer > 0) return false;
    if (typeof s.hp === 'number' && s.hp <= 0) return false;
    if (s.state === 'dead' || s.state === 'respawning') return false;
    return true;
  }

  function releaseSoldierRef(enemy, isLeapEscape) {
    const blocker = enemy.blockedBy;
    if (!blocker) return;
    enemy.blockedBy = null;
    if (isLeapEscape) {
      blocker._ignoreEnemy = enemy;
      blocker._ignoreTimer = Math.max(blocker._ignoreTimer || 0, 1.1);
    }
    if (blocker.engagedEnemy === enemy) blocker.engagedEnemy = null;
    if (blocker.blockedEnemy === enemy) blocker.blockedEnemy = null;
    if (blocker.blocking === enemy) blocker.blocking = null;
    if (blocker.target === enemy) blocker.target = null;
  }

  function forEachLivingSoldier(game, fn) {
    if (!game || !game.towers) return;
    const tm = game.towers;
    if (Array.isArray(tm.soldiers) && tm.soldiers.length > 0) {
      for (let i = 0; i < tm.soldiers.length; i++) {
        const s = tm.soldiers[i];
        if (isSoldierAlive(s)) fn(s, s.tower || null);
      }
      return;
    }
    if (!Array.isArray(tm.towers)) return;
    for (let i = 0; i < tm.towers.length; i++) {
      const t = tm.towers[i];
      if (!t) continue;
      const list = t.soldiers || t.guards || t.units;
      if (!Array.isArray(list)) continue;
      for (let j = 0; j < list.length; j++) {
        const s = list[j];
        if (isSoldierAlive(s)) fn(s, t);
      }
    }
  }

  function isInPhalanxTauntAura(enemy, game) {
    let found = false;
    forEachLivingSoldier(game, function(s, tower) {
      if (found) return;
      const isPhalanx = (tower && tower.tier === 3 && tower.branch === 'A') ||
        s.isPhalanx || s.tauntAura || (typeof s.tauntRadius === 'number' && s.tauntRadius > 0);
      if (!isPhalanx) return;
      const r = s.tauntRadius || 85;
      const dx = s.x - enemy.x;
      const dy = s.y - enemy.y;
      if (dx * dx + dy * dy <= r * r) {
        found = true;
      }
    });
    return found;
  }

  function damageSoldier(soldier, rawDmg, attacker, game) {
    if (!isSoldierAlive(soldier)) return;
    if (typeof soldier.takeDamage === 'function') {
      soldier.takeDamage(rawDmg, attacker, game);
      return;
    }
    let dmg = rawDmg;
    if (attacker && typeof attacker.meleeDamageMult === 'number') {
      dmg *= attacker.meleeDamageMult;
    } else if (attacker && isInPhalanxTauntAura(attacker, game)) {
      dmg *= 0.80; // Tower Guard Phalanx Taunt Aura: -20% enemy melee damage
    }
    if (typeof soldier.applyDamage === 'function') {
      soldier.applyDamage(dmg, attacker, game);
      return;
    }
    if (typeof soldier.hurt === 'function') {
      soldier.hurt(dmg, attacker, game);
      return;
    }

    // Fallback direct HP mitigation if soldier is a plain state object
    const armor = typeof soldier.physArmor === 'number' ? soldier.physArmor
      : (typeof soldier.armor === 'number' ? soldier.armor : 0);
    dmg *= Math.max(0.05, 1 - armor);
    if ((soldier.shieldWallTimer && soldier.shieldWallTimer > 0) || soldier.shieldWallActive) {
      dmg *= 0.10;
    } else if (typeof soldier.damageReduction === 'number' && soldier.damageReduction > 0) {
      dmg *= Math.max(0.05, 1 - soldier.damageReduction);
    }

    soldier.hp = Math.max(0, soldier.hp - dmg);
    soldier.combatTimer = 3.0;
    soldier.outOfCombatTimer = 0;
    if (soldier.hp <= 0) {
      soldier.hp = 0;
      soldier.dead = true;
      if (typeof soldier.alive === 'boolean') soldier.alive = false;
      soldier.respawnTimer = soldier.respawnDelay || 10.0;
      if (soldier.engagedEnemy) {
        soldier.engagedEnemy.blockedBy = null;
        soldier.engagedEnemy = null;
      }
    }
  }

  function isTowerActivelyCursed(tower, game) {
    if (!tower) return false;
    if (game && game.towers && Array.isArray(game.towers.towers)) {
      if (game.towers.towers.indexOf(tower) === -1) return false;
    }
    if (typeof tower.curseClicksRemaining === 'number') {
      return tower.curseClicksRemaining > 0 && (tower.stunTimer === undefined || tower.stunTimer > 0);
    }
    return Boolean(tower.stunTimer && tower.stunTimer > 0);
  }

  // ============================================================================
  // 5. TD.Enemy — Individual Enemy Instance
  // ============================================================================
  let nextEnemyId = 1;

  class Enemy {
    constructor(typeKey, laneIndex, metric, game, hpMult, speedMult, startDist) {
      const cfg = ENEMY_TYPES[typeKey] || ENEMY_TYPES.goblin;
      const diff = (game && game.difficulty) || null;
      const diffHp = (diff && typeof diff.hpMult === 'number') ? diff.hpMult : 1.0;
      const diffSpd = (diff && typeof diff.speedMult === 'number') ? diff.speedMult : 1.0;
      const diffReward = (diff && typeof diff.rewardMult === 'number') ? diff.rewardMult : 1.0;

      this.id = nextEnemyId++;
      this.type = cfg.id;
      this.name = cfg.id === 'balrog' ? 'The Witch-lord of Morgul' : cfg.name;
      this.isBoss = Boolean(cfg.isBoss);
      this.phase = 1;
      this.phaseName = cfg.id === 'balrog' ? 'Witch-lord of Morgul'
        : (cfg.id === 'ringwraith' ? 'Black Breath' : '');

      this.flying = Boolean(cfg.flying);
      this.radius = cfg.radius;
      this.maxHp = Math.max(1, Math.round(cfg.maxHp * (hpMult || 1) * diffHp));
      this.hp = this.maxHp;

      this.baseSpeed = cfg.speed * (speedMult || 1) * diffSpd;
      this.speed = this.baseSpeed;

      this.basePhysArmor = cfg.physArmor;
      this.armorShred = 0;
      this.physArmor = this.basePhysArmor;
      this.magicResist = cfg.magicResist;

      this.bounty = Math.max(1, Math.round(cfg.bounty * diffReward));
      this.livesCost = cfg.livesCost;
      this.meleeDamage = cfg.meleeDamage || 10;
      this.meleeInterval = cfg.meleeInterval || 1.1;
      this.meleeCooldown = 0.25;

      this.laneIndex = laneIndex || 0;
      this._metric = metric;
      this.distTraveled = startDist || 0;
      this.lateralOffset = (this.isBoss || this.type === 'troll' || this.flying)
        ? 0
        : ((Math.random() - 0.5) * (this.type === 'goblin' ? 14 : 9));

      samplePathAtDist(metric, this.distTraveled, this.lateralOffset, sampleScratch);
      this.x = sampleScratch.x;
      this.y = sampleScratch.y;
      this.angle = sampleScratch.angle;
      this.progress = sampleScratch.progress;

      this.pullOffsetX = 0;
      this.pullOffsetY = 0;

      // Blocker & lifecycle state
      this.blockedBy = null;
      this.dead = false;
      this.reachedExit = false;

      // Status timers
      this.slowTimer = 0;
      this.slowFactor = 0;
      this.stunTimer = 0;
      this.bleedTimer = 0;
      this.bleedDps = 0;
      this.fireSuppressTimer = 0;
      this.revealedTimer = 0;

      // Special ability state
      this.enraged = false;
      this.leapCooldownTimer = 0;
      this.leapTimer = 0;
      this.leapDuration = 0.48;
      this.unblockableTimer = 0;
      this.leaping = false;

      this.blackBreathTimer = cfg.blackBreathInterval || 8.0;
      this.curseCooldown = 3.2;
      this.cursedTower = null;
      this.phase2Triggered = false;
      this.transformTimer = 0;

      // Visual animation & pooled floating text throttle state
      this.animSeed = (this.id * 1.6180339) % TWO_PI;
      this.walkPhase = this.animSeed;
      this.attackAnimTimer = 0;
      this.hitFlashTimer = 0;
      this.dodgeFlashTimer = 0;
      this._dmgTextAccum = 0;
      this._dmgTextTimer = 0;
      this._dmgTextColor = '#ffffff';
      this._lastBurstTime = 0;
      this._game = game || null;

      this.recalcSpeed(game);
    }

    canBeBlocked() {
      if (this.flying || this.dead || this.reachedExit) return false;
      if (this.leapTimer > 0 || this.unblockableTimer > 0) return false;
      return true;
    }

    tryBlock(soldier, game) {
      if (!this.canBeBlocked()) return false;
      if (this.type === 'warg' && this.leapCooldownTimer <= 0) {
        this.triggerWargLeap(game || this._game);
        return false;
      }
      return true;
    }

    recalcArmor() {
      this.physArmor = clamp(this.basePhysArmor * (1 - this.armorShred), 0, 0.85);
    }

    recalcSpeed(game) {
      let spd = this.baseSpeed;
      if (this.type === 'uruk' && this.enraged) {
        spd *= 1.50;
      }
      if (game && game.ringActive) {
        spd *= 1.15;
      }
      if (this.slowTimer > 0 && this.slowFactor > 0) {
        spd *= Math.max(0.15, 1 - this.slowFactor);
      }
      this.speed = spd;
      return spd;
    }

    applyStun(sec) {
      if (this.dead || this.reachedExit || !(sec > 0)) return;
      this.stunTimer = Math.max(this.stunTimer, sec);
    }

    applySlow(factor, sec) {
      if (this.dead || this.reachedExit || !(sec > 0) || !(factor > 0)) return;
      // Normalize: standard slow reduction fraction is 0..0.50 (e.g. 0.20 = 20% slow, 0.45 = 45% slow).
      // If a caller passes a multiplier > 0.50 (e.g. 0.80 for 20% slow), normalize cleanly if > 0.50 and <= 0.95.
      const reduction = (factor > 0.50 && factor < 0.96) ? (1 - factor) : factor;
      const clamped = clamp(reduction, 0, 0.85);
      if (clamped >= this.slowFactor || this.slowTimer <= 0) {
        this.slowFactor = clamped;
        this.slowTimer = Math.max(this.slowTimer, sec);
      } else {
        this.slowTimer = Math.max(this.slowTimer, sec * 0.75);
      }
      this.recalcSpeed(this._game);
    }

    reveal(sec) {
      if (this.dead || this.reachedExit || !(sec > 0)) return;
      this.revealedTimer = Math.max(this.revealedTimer, sec);
    }

    triggerEnrage(game) {
      if (this.enraged) return;
      this.enraged = true;
      this.recalcSpeed(game);
      if (game && game.vfx) {
        if (game.vfx.spawnFloatingText) {
          game.vfx.spawnFloatingText(this.x, this.y - this.radius - 10, 'RAGE!', '#ff5252', 1.0);
        }
        if (game.vfx.spawnBurst) {
          game.vfx.spawnBurst(this.x, this.y, {
            color: '#ff3d00', count: 10, speed: 75, spread: TWO_PI, life: 0.4, size: 3, kind: 'fire'
          });
        }
      }
    }

    triggerWargLeap(game) {
      releaseSoldierRef(this, true);
      this.leapCooldownTimer = 10.0;
      this.leapTimer = this.leapDuration;
      this.unblockableTimer = 0.72;
      this.leaping = true;
      if (game && game.sound && typeof game.sound.playWargLeap === 'function') {
        game.sound.playWargLeap();
      }
      if (game && game.vfx) {
        if (game.vfx.spawnFloatingText) {
          game.vfx.spawnFloatingText(this.x, this.y - this.radius - 10, 'LEAP!', '#ffd54f', 0.95);
        }
        if (game.vfx.spawnBurst) {
          game.vfx.spawnBurst(this.x, this.y, {
            color: '#a1887f', count: 8, speed: 60, angle: this.angle + Math.PI, spread: 1.1, life: 0.35, size: 3, kind: 'smoke'
          });
        }
      }
    }

    pulseBlackBreath(game) {
      const radius = 165;
      const stunDur = 4.0;
      if (game && game.towers && typeof game.towers.stunTowersInRadius === 'function') {
        game.towers.stunTowersInRadius(this.x, this.y, radius, stunDur);
      }
      if (game && game.vfx) {
        if (game.vfx.spawnShockwave) {
          game.vfx.spawnShockwave(this.x, this.y, radius, '#7e57c2', 0.65);
        }
        if (game.vfx.spawnBurst) {
          game.vfx.spawnBurst(this.x, this.y, {
            color: '#9575cd', count: 18, speed: 110, spread: TWO_PI, life: 0.55, size: 4, kind: 'magic'
          });
        }
        if (game.vfx.spawnFloatingText) {
          game.vfx.spawnFloatingText(this.x, this.y - this.radius - 14, 'BLACK BREATH!', '#b388ff', 1.1);
        }
      }
    }

    triggerPhase2(game) {
      if (this.phase2Triggered) return;
      this.phase2Triggered = true;
      this.phase = 2;
      this.name = 'Balrog of Udûn';
      this.phaseName = 'Balrog of Udûn';
      this.transformTimer = 0.85;
      this.radius = 28;

      const diffSpd = (game && game.difficulty && typeof game.difficulty.speedMult === 'number')
        ? game.difficulty.speedMult : 1.0;
      this.basePhysArmor = 0.35;
      this.recalcArmor();
      this.magicResist = 0.45;
      this.baseSpeed = 40 * diffSpd;
      this.recalcSpeed(game);

      const heal = Math.round(this.maxHp * 0.15);
      this.hp = Math.min(this.maxHp, Math.max(1, this.hp) + heal);

      if (game && game.sound && typeof game.sound.playBossRoar === 'function') {
        game.sound.playBossRoar();
      }
      if (game && game.vfx) {
        if (game.vfx.spawnShockwave) {
          game.vfx.spawnShockwave(this.x, this.y, 185, '#ff5722', 0.75);
        }
        if (game.vfx.spawnBurst) {
          game.vfx.spawnBurst(this.x, this.y, {
            color: '#ff6d00', count: 32, speed: 150, spread: TWO_PI, life: 0.75, size: 5, kind: 'fire'
          });
          game.vfx.spawnBurst(this.x, this.y, {
            color: '#262022', count: 20, speed: 95, spread: TWO_PI, life: 0.85, size: 6, kind: 'smoke'
          });
        }
        if (game.vfx.spawnFloatingText) {
          game.vfx.spawnFloatingText(this.x, this.y - this.radius - 18, 'BALROG OF UDÛN!', '#ff6d00', 1.35);
        }
      }
    }

    tryCastBossCurse(game) {
      if (!game || !game.towers || !Array.isArray(game.towers.towers)) return false;
      const towers = game.towers.towers;
      let nearest = null;
      let bestDistSq = 320 * 320;

      for (let i = 0; i < towers.length; i++) {
        const t = towers[i];
        if (!t) continue;
        if (isTowerActivelyCursed(t, game)) continue;
        const dx = t.x - this.x;
        const dy = t.y - this.y;
        const dSq = dx * dx + dy * dy;
        if (dSq <= bestDistSq) {
          bestDistSq = dSq;
          nearest = t;
        }
      }

      if (!nearest) return false;

      if (typeof nearest.applyBossCurse === 'function') {
        nearest.applyBossCurse(3.0, 3);
      } else {
        nearest.stunTimer = Math.max(nearest.stunTimer || 0, 3.0);
        nearest.curseClicksRemaining = 3;
      }
      this.cursedTower = nearest;

      const curseColor = this.phase === 2 ? '#ff5722' : '#69f0ae';
      if (game.vfx) {
        if (game.vfx.spawnShockwave) {
          game.vfx.spawnShockwave(nearest.x, nearest.y, 44, curseColor, 0.45);
        }
        if (game.vfx.spawnBurst) {
          game.vfx.spawnBurst(nearest.x, nearest.y, {
            color: curseColor, count: 14, speed: 80, spread: TWO_PI, life: 0.45, size: 3.5,
            kind: this.phase === 2 ? 'fire' : 'magic'
          });
        }
        if (game.vfx.spawnFloatingText) {
          game.vfx.spawnFloatingText(nearest.x, nearest.y - 30, 'CURSED! CLICK x3!', '#ff8a65', 1.05);
        }
      }
      return true;
    }

    takeDamage(amount, dmgType, opts, game) {
      if (this.dead || this.reachedExit) return 0;

      // Support flexible argument order if game was passed as 3rd arg
      if (opts && (opts.enemies || opts.towers || typeof opts.addGold === 'function') && !game) {
        game = opts;
        opts = null;
      }
      const o = opts || {};
      const g = game || o.game || this._game || (typeof window !== 'undefined' ? window.game : null);
      if (g) this._game = g;

      const type = dmgType || 'physical';

      // Shadow Wraith 80% physical dodge unless revealed or Ring True Sight is active
      const ringTrueSight = Boolean(g && g.ringActive);
      if (
        this.type === 'wraith' &&
        type === 'physical' &&
        !ringTrueSight &&
        this.revealedTimer <= 0 &&
        !o.trueSight
      ) {
        if (Math.random() < 0.80) {
          this.dodgeFlashTimer = 0.25;
          if (g && g.vfx && g.vfx.spawnFloatingText) {
            g.vfx.spawnFloatingText(this.x, this.y - this.radius - 6, 'DODGE', '#b2ebf2', 0.95);
          }
          return 0;
        }
      }

      // Reveal effect (e.g. Istari Spire hit or Light of Eärendil)
      if (o.revealSec > 0) {
        this.reveal(o.revealSec);
      }

      // Permanent Physical Armor Shred (e.g. Khazad Ballista 50% shred)
      if (o.shredArmorPct > 0) {
        const prev = this.armorShred;
        this.armorShred = clamp(Math.max(this.armorShred, o.shredArmorPct), 0, 0.90);
        this.recalcArmor();
        if (o.showShredText && this.armorShred > prev && this.basePhysArmor > 0 && g && g.vfx && g.vfx.spawnFloatingText) {
          g.vfx.spawnFloatingText(this.x, this.y - this.radius - 14, 'ARMOR SHRED!', '#ffb74d', 0.9);
        }
      }

      // Suppress Troll regeneration for 4.0s when hit by Magic or Fire
      if (type === 'magic' || o.isFire) {
        this.fireSuppressTimer = Math.max(this.fireSuppressTimer, 4.0);
      }

      // Bleed DoT application
      if (o.bleedDps > 0 && o.bleedSec > 0) {
        this.bleedDps = Math.max(this.bleedDps, o.bleedDps);
        this.bleedTimer = Math.max(this.bleedTimer, o.bleedSec);
      }

      // Optional stun/slow convenience hooks
      if (o.stunSec > 0) {
        this.applyStun(o.stunSec);
      }
      if (o.slowFactor > 0 && o.slowSec > 0) {
        this.applySlow(o.slowFactor, o.slowSec);
      }

      // Pushback backward along path (reduced by 80% on bosses)
      if (o.pushbackPx > 0 && this._metric) {
        const push = this.isBoss ? o.pushbackPx * 0.20 : o.pushbackPx;
        this.distTraveled = Math.max(0, this.distTraveled - push);
        if (push >= 10 && this.blockedBy) {
          releaseSoldierRef(this);
        }
        samplePathAtDist(this._metric, this.distTraveled, this.lateralOffset, sampleScratch);
        this.x = sampleScratch.x + this.pullOffsetX;
        this.y = sampleScratch.y + this.pullOffsetY;
        this.angle = sampleScratch.angle;
        this.progress = sampleScratch.progress;
      }

      const raw = Math.max(0, Number(amount) || 0);
      if (raw <= 0) return 0;

      const ignoreArmor = clamp(o.ignoreArmorPct || 0, 0, 1);
      const effPhys = this.physArmor * (1 - ignoreArmor);
      const effMagic = clamp(this.magicResist || 0, 0, 0.85);

      let dealt = raw;
      if (type === 'physical') {
        dealt = raw * (1 - effPhys);
      } else if (type === 'magic') {
        dealt = raw * (1 - effMagic);
      } else if (type === 'hybrid') {
        dealt = raw * 0.5 * (1 - effPhys) + raw * 0.5 * (1 - effMagic);
      } else {
        // 'true' damage bypasses armor & resist
        dealt = raw;
      }

      dealt = Math.max(0, dealt);
      this.hitFlashTimer = 0.11;

      // Balrog Phase 1 -> Phase 2 safeguard so single massive hits never skip Phase 2
      if (this.type === 'balrog' && this.phase === 1 && !this.phase2Triggered) {
        const nextHp = this.hp - dealt;
        if (nextHp < this.maxHp * 0.50) {
          this.hp = Math.max(1, nextHp);
          this.triggerPhase2(g);
          this._emitHitFeedback(dealt, type, o, g);
          return dealt;
        }
      }

      this.hp -= dealt;

      // Uruk-hai Blood Rage below 40% HP
      if (this.type === 'uruk' && !this.enraged && this.hp > 0 && (this.hp / this.maxHp) < 0.40) {
        this.triggerEnrage(g);
      }

      this._emitHitFeedback(dealt, type, o, g);

      if (this.hp <= 0) {
        this.hp = 0;
        this.dead = true;
        releaseSoldierRef(this);

        // Release boss curse lock cleanly when boss falls
        if (this.cursedTower) {
          if (this.cursedTower.curseClicksRemaining > 0) {
            this.cursedTower.curseClicksRemaining = 0;
            this.cursedTower.stunTimer = 0;
          }
          this.cursedTower = null;
        }

        if (g && typeof g.addGold === 'function') {
          g.addGold(this.bounty, this.x, this.y, true);
        }

        if (g && g.vfx && g.vfx.spawnBurst) {
          if (this.type === 'balrog') {
            if (g.vfx.spawnShockwave) g.vfx.spawnShockwave(this.x, this.y, 160, '#ff6d00', 0.75);
            g.vfx.spawnBurst(this.x, this.y, {
              color: '#ff5722', count: 36, speed: 165, spread: TWO_PI, life: 0.85, size: 5.5, kind: 'fire'
            });
            g.vfx.spawnBurst(this.x, this.y, {
              color: '#212121', count: 24, speed: 110, spread: TWO_PI, life: 0.9, size: 6, kind: 'smoke'
            });
          } else if (this.type === 'wraith' || this.type === 'ringwraith') {
            g.vfx.spawnBurst(this.x, this.y, {
              color: '#80deea', count: 16, speed: 95, spread: TWO_PI, life: 0.55, size: 3.8, kind: 'magic'
            });
          } else {
            g.vfx.spawnBurst(this.x, this.y, {
              color: '#b71c1c', count: this.isBoss || this.type === 'troll' ? 20 : 10,
              speed: 85, spread: TWO_PI, life: 0.42, size: 3.4, kind: 'blood'
            });
          }
        }
      }

      return dealt;
    }

    _emitHitFeedback(dealt, type, o, g) {
      if (!g || !g.vfx || o.silent) return;
      const vfx = g.vfx;

      // Floating numbers: batch continuous micro-ticks (beams, oil patches, bleed) cleanly
      const textColor = o.isCrit ? '#ffd54f'
        : (o.isFire ? '#ff8a65' : (type === 'magic' ? '#8be0ff' : (type === 'true' ? '#fff59d' : '#f5f5f5')));

      if (o.isCrit && vfx.spawnFloatingText) {
        vfx.spawnFloatingText(
          this.x + (Math.random() - 0.5) * 10,
          this.y - this.radius - 8,
          'CRIT! ' + Math.max(1, Math.round(dealt)),
          '#ffd54f',
          1.22
        );
      } else if (dealt >= 4 && !o.isDot && !o.isBeam) {
        if (vfx.spawnFloatingText) {
          vfx.spawnFloatingText(
            this.x + (Math.random() - 0.5) * 10,
            this.y - this.radius - 6,
            String(Math.round(dealt)),
            textColor,
            dealt >= 90 ? 1.12 : 0.92
          );
        }
      } else {
        this._dmgTextAccum += dealt;
        this._dmgTextColor = textColor;
      }

      // Throttled directional hit burst
      if (vfx.spawnBurst && this._lastBurstTime <= 0 && !o.isDot) {
        this._lastBurstTime = 0.09;
        const kind = o.isFire ? 'fire'
          : (type === 'magic' ? 'magic' : (this.physArmor >= 0.35 && type === 'physical' ? 'spark' : 'blood'));
        const col = kind === 'fire' ? '#ff7043'
          : (kind === 'magic' ? '#80d8ff' : (kind === 'spark' ? '#cfd8dc' : '#c62828'));
        vfx.spawnBurst(this.x, this.y, {
          color: col,
          count: o.isCrit ? 8 : 4,
          speed: 65,
          angle: this.angle + Math.PI,
          spread: 1.3,
          life: 0.26,
          size: 2.5,
          kind: kind
        });
      }
    }

    update(dt, game) {
      if (this.dead || this.reachedExit) return;
      this._game = game;

      if (this._lastBurstTime > 0) this._lastBurstTime = Math.max(0, this._lastBurstTime - dt);
      if (this.hitFlashTimer > 0) this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      if (this.dodgeFlashTimer > 0) this.dodgeFlashTimer = Math.max(0, this.dodgeFlashTimer - dt);
      if (this.attackAnimTimer > 0) this.attackAnimTimer = Math.max(0, this.attackAnimTimer - dt);

      // Flush accumulated continuous tick damage text ~3.5x/sec
      if (this._dmgTextAccum > 0) {
        this._dmgTextTimer += dt;
        if (this._dmgTextTimer >= 0.28) {
          const shown = Math.round(this._dmgTextAccum);
          if (shown >= 1 && game && game.vfx && game.vfx.spawnFloatingText) {
            game.vfx.spawnFloatingText(
              this.x + (Math.random() - 0.5) * 8,
              this.y - this.radius - 6,
              String(shown),
              this._dmgTextColor,
              0.9
            );
          }
          this._dmgTextAccum = 0;
          this._dmgTextTimer = 0;
        }
      }

      // Status timers
      if (this.slowTimer > 0) {
        this.slowTimer -= dt;
        if (this.slowTimer <= 0) {
          this.slowTimer = 0;
          this.slowFactor = 0;
        }
      }
      if (this.stunTimer > 0) {
        this.stunTimer = Math.max(0, this.stunTimer - dt);
      }
      if (this.fireSuppressTimer > 0) {
        this.fireSuppressTimer = Math.max(0, this.fireSuppressTimer - dt);
      }
      if (this.revealedTimer > 0) {
        this.revealedTimer = Math.max(0, this.revealedTimer - dt);
      }
      if (this.leapCooldownTimer > 0) {
        this.leapCooldownTimer = Math.max(0, this.leapCooldownTimer - dt);
      }
      if (this.unblockableTimer > 0) {
        this.unblockableTimer = Math.max(0, this.unblockableTimer - dt);
      }
      if (this.leapTimer > 0) {
        this.leapTimer = Math.max(0, this.leapTimer - dt);
        if (this.leapTimer <= 0) this.leaping = false;
      }
      if (this.transformTimer > 0) {
        this.transformTimer = Math.max(0, this.transformTimer - dt);
      }
      if (this.tauntDebuffTimer > 0) {
        this.tauntDebuffTimer -= dt;
        if (this.tauntDebuffTimer <= 0) {
          this.tauntDebuffTimer = 0;
          this.meleeDamageMult = 1.0;
        }
      }

      // Passive Istari Spire reveal aura check for Shadow Wraiths
      if (this.type === 'wraith' && game && game.towers && Array.isArray(game.towers.towers)) {
        const tws = game.towers.towers;
        for (let i = 0; i < tws.length; i++) {
          const t = tws[i];
          if (!t || t.type !== 'istari' || (t.stunTimer && t.stunTimer > 0)) continue;
          const dx = t.x - this.x;
          const dy = t.y - this.y;
          const r = t.range || 175;
          if (dx * dx + dy * dy <= r * r) {
            this.revealedTimer = Math.max(this.revealedTimer, 0.35);
            break;
          }
        }
      }

      // Bleed DoT ticks (physical bleed bypasses dodge via isDot/true)
      if (this.bleedTimer > 0 && this.bleedDps > 0) {
        this.bleedTimer = Math.max(0, this.bleedTimer - dt);
        this.takeDamage(this.bleedDps * dt, 'true', { isDot: true, trueSight: true }, game);
        if (this.dead) return;
        if (this.bleedTimer <= 0) this.bleedDps = 0;
      }

      // Olog-hai Siege Troll Regeneration (18 HP/s unless suppressed by Fire/Magic within 4s)
      if (this.type === 'troll' && this.hp > 0 && this.hp < this.maxHp && this.fireSuppressTimer <= 0) {
        this.hp = Math.min(this.maxHp, this.hp + 18 * dt);
      }

      // Uruk-hai rage check
      if (this.type === 'uruk' && !this.enraged && (this.hp / this.maxHp) < 0.40) {
        this.triggerEnrage(game);
      }

      // Balrog Phase 2 check
      if (this.type === 'balrog' && this.phase === 1 && !this.phase2Triggered && (this.hp / this.maxHp) < 0.50) {
        this.triggerPhase2(game);
      }

      // Ringwraith Black Breath Aura every 8s
      if (this.type === 'ringwraith' && this.stunTimer <= 0) {
        this.blackBreathTimer -= dt;
        if (this.blackBreathTimer <= 0) {
          this.blackBreathTimer = 8.0;
          this.pulseBlackBreath(game);
        }
      }

      // Witch-lord / Balrog Dark Spell Aura every 6.5s (320px range)
      if (this.type === 'balrog') {
        if (this.cursedTower && !isTowerActivelyCursed(this.cursedTower, game)) {
          this.cursedTower = null;
        }
        if (this.stunTimer <= 0 && this.transformTimer <= 0) {
          this.curseCooldown -= dt;
          if (this.curseCooldown <= 0) {
            if (this.tryCastBossCurse(game)) {
              this.curseCooldown = 6.5;
            } else {
              // Retry promptly once a tower enters 320px range
              this.curseCooldown = 0.35;
            }
          }
        }
      }

      // Validate Garrison blocker
      if (this.flying) {
        if (this.blockedBy) releaseSoldierRef(this);
      } else if (this.blockedBy) {
        if (!isSoldierAlive(this.blockedBy)) {
          releaseSoldierRef(this);
        } else if (this.type === 'warg') {
          if (this.leapTimer > 0 || this.unblockableTimer > 0) {
            releaseSoldierRef(this);
          } else if (this.leapCooldownTimer <= 0) {
            this.triggerWargLeap(game);
          }
        }
      }

      // Update effective speed
      const spd = this.recalcSpeed(game);

      // Stunned or in dramatic Phase 2 transformation pause
      if (this.stunTimer > 0 || this.transformTimer > 0) {
        return;
      }

      // Engaged in melee combat with a Garrison soldier
      if (this.blockedBy && this.leapTimer <= 0) {
        const guard = this.blockedBy;
        const gdx = guard.x - this.x;
        const gdy = guard.y - this.y;
        const gDist = Math.hypot(gdx, gdy);
        this.angle = Math.atan2(gdy, gdx);

        // Smoothly close to melee standoff distance around the engaged soldier
        const desiredDist = this.radius + (guard.radius || 9) + 3;
        if (gDist > desiredDist + 2) {
          const step = Math.min(gDist - desiredDist, spd * dt);
          this.x += (gdx / gDist) * step;
          this.y += (gdy / gDist) * step;
          samplePathAtDist(this._metric, this.distTraveled, this.lateralOffset, sampleScratch);
          this.pullOffsetX = this.x - sampleScratch.x;
          this.pullOffsetY = this.y - sampleScratch.y;
        }

        // Melee attack timer (+50% melee attack speed when Uruk is enraged!)
        const atkMult = (this.type === 'uruk' && this.enraged) ? 1.50 : 1.0;
        this.meleeCooldown -= dt * atkMult;
        if (this.meleeCooldown <= 0) {
          this.meleeCooldown = this.meleeInterval;
          this.attackAnimTimer = 0.28;

          if (game && game.sound && typeof game.sound.playSwordClash === 'function') {
            game.sound.playSwordClash();
          }

          if (this.type === 'troll') {
            // Olog-hai heavy AoE club smash: 45 dmg in 55px radius around engaged soldier
            const sx = guard.x;
            const sy = guard.y;
            const aoeR = 55;
            const aoeRSq = aoeR * aoeR;
            let hitAny = false;
            forEachLivingSoldier(game, (s) => {
              const dx = s.x - sx;
              const dy = s.y - sy;
              if (dx * dx + dy * dy <= aoeRSq) {
                hitAny = true;
                damageSoldier(s, 45, this, game);
              }
            });
            if (!hitAny) {
              damageSoldier(guard, 45, this, game);
            }
            if (game && game.vfx) {
              if (game.vfx.spawnShockwave) {
                game.vfx.spawnShockwave(sx, sy, aoeR, '#bcaaa4', 0.32);
              }
              if (game.vfx.spawnBurst) {
                game.vfx.spawnBurst(sx, sy, {
                  color: '#a1887f', count: 10, speed: 75, spread: TWO_PI, life: 0.35, size: 3.5, kind: 'stone'
                });
              }
            }
          } else if (this.type === 'balrog') {
            const sx = guard.x;
            const sy = guard.y;
            const aoeRSq = 65 * 65;
            let hitAny = false;
            forEachLivingSoldier(game, (s) => {
              const dx = s.x - sx;
              const dy = s.y - sy;
              if (dx * dx + dy * dy <= aoeRSq) {
                hitAny = true;
                damageSoldier(s, this.meleeDamage, this, game);
              }
            });
            if (!hitAny) damageSoldier(guard, this.meleeDamage, this, game);
            if (game && game.vfx && game.vfx.spawnShockwave) {
              game.vfx.spawnShockwave(sx, sy, 65, this.phase === 2 ? '#ff5722' : '#69f0ae', 0.32);
            }
          } else {
            damageSoldier(guard, this.meleeDamage, this, game);
          }

          if (!isSoldierAlive(guard)) {
            releaseSoldierRef(this);
          }
        }
        return;
      }

      // Advance along lane path
      const leapBoost = this.leapTimer > 0 ? 1.55 : 1.0;
      const moveDist = spd * leapBoost * dt;
      this.distTraveled += moveDist;
      this.walkPhase += moveDist * 0.16;

      // Smoothly decay any off-center pull offset after disengaging a soldier
      if (this.pullOffsetX !== 0 || this.pullOffsetY !== 0) {
        const decay = Math.exp(-6.5 * dt);
        this.pullOffsetX *= decay;
        this.pullOffsetY *= decay;
        if (Math.abs(this.pullOffsetX) < 0.15) this.pullOffsetX = 0;
        if (Math.abs(this.pullOffsetY) < 0.15) this.pullOffsetY = 0;
      }

      samplePathAtDist(this._metric, this.distTraveled, this.lateralOffset, sampleScratch);
      this.x = sampleScratch.x + this.pullOffsetX;
      this.y = sampleScratch.y + this.pullOffsetY;
      this.angle = sampleScratch.angle;
      this.progress = sampleScratch.progress;

      if (this.distTraveled >= this._metric.totalLength) {
        this.reachedExit = true;
        this.progress = 1;
      }
    }
  }

  // ============================================================================
  // 6. Procedural Silhouette & Portrait Renderer (Enemy + Bestiary Codex)
  // ============================================================================
  function drawEnemyBody(ctx, type, phase, time, state) {
    const walk = state.walk || 0;
    const atk = state.atk || 0;
    const enraged = Boolean(state.enraged);
    const hitFlash = Boolean(state.hitFlash);
    const facingLeft = Boolean(state.facingLeft);

    ctx.save();
    if (facingLeft && type !== 'fellbeast') {
      ctx.scale(-1, 1);
    }

    const bob = Math.abs(Math.sin(walk)) * 2.2;
    const swing = Math.sin(walk) * 3.5 + (atk > 0 ? Math.sin(atk * Math.PI) * 7 : 0);

    switch (type) {
      case 'goblin': {
        // Legs
        ctx.strokeStyle = '#3d4a35';
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-2, 2);
        ctx.lineTo(-4 + Math.sin(walk) * 3.5, 9);
        ctx.moveTo(2, 2);
        ctx.lineTo(4 - Math.sin(walk) * 3.5, 9);
        ctx.stroke();

        // Hunched ragged cloak & torso
        ctx.fillStyle = hitFlash ? '#ffffff' : '#2e352d';
        ctx.beginPath();
        ctx.ellipse(-1, -1 - bob * 0.6, 7.5, 6.2, -0.25, 0, TWO_PI);
        ctx.fill();

        // Tattered peaked hood + bat ear
        ctx.fillStyle = hitFlash ? '#ffffff' : '#58704a';
        ctx.beginPath();
        ctx.arc(3.5, -5 - bob * 0.7, 4.5, 0, TWO_PI);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -7 - bob * 0.7);
        ctx.lineTo(-6, -11 - bob * 0.7);
        ctx.lineTo(1, -4 - bob * 0.7);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#232922';
        ctx.beginPath();
        ctx.moveTo(-4, -5 - bob * 0.7);
        ctx.lineTo(2, -12 - bob * 0.7);
        ctx.lineTo(6, -6 - bob * 0.7);
        ctx.closePath();
        ctx.fill();

        // Glowing amber eye
        ctx.fillStyle = '#ffd54f';
        ctx.beginPath();
        ctx.arc(5.5, -5.2 - bob * 0.7, 1.3, 0, TWO_PI);
        ctx.fill();

        // Jagged rusty dagger
        ctx.strokeStyle = '#cfd8dc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(5, -1 - bob * 0.5);
        ctx.lineTo(12 + swing * 0.5, -3 + swing * 0.4);
        ctx.stroke();
        break;
      }

      case 'orc': {
        // Boots
        ctx.strokeStyle = '#26292e';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-3, 4);
        ctx.lineTo(-4 + Math.sin(walk) * 3, 11);
        ctx.moveTo(3, 4);
        ctx.lineTo(4 - Math.sin(walk) * 3, 11);
        ctx.stroke();

        // Iron-plated torso
        ctx.fillStyle = hitFlash ? '#ffffff' : '#3a4048';
        ctx.beginPath();
        ctx.ellipse(0, -1 - bob * 0.5, 8.8, 8.2, 0, 0, TWO_PI);
        ctx.fill();

        // Head + Spiked Iron Helm
        ctx.fillStyle = hitFlash ? '#ffffff' : '#5f6b4d';
        ctx.beginPath();
        ctx.arc(1, -9 - bob * 0.6, 5.2, 0, TWO_PI);
        ctx.fill();

        ctx.fillStyle = '#252a30';
        ctx.beginPath();
        ctx.arc(1, -10.5 - bob * 0.6, 5.6, Math.PI, TWO_PI);
        ctx.lineTo(3, -15.5 - bob * 0.6);
        ctx.lineTo(-1, -10.5 - bob * 0.6);
        ctx.fill();

        // Notched Scimitar
        ctx.strokeStyle = '#b0bec5';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(6, -2 - bob * 0.4);
        ctx.quadraticCurveTo(13, -7 + swing * 0.6, 14, -12 + swing * 0.7);
        ctx.stroke();

        // Crude Black Iron Shield with Red Eye Slash
        ctx.fillStyle = '#1d2024';
        ctx.strokeStyle = '#606975';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-10, -7 - bob * 0.5, 8, 12, 2) : ctx.rect(-10, -7 - bob * 0.5, 8, 12);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#e53935';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-8, -4 - bob * 0.5);
        ctx.lineTo(-4, 2 - bob * 0.5);
        ctx.stroke();
        break;
      }

      case 'uruk': {
        if (enraged) {
          const pulse = 0.28 + 0.14 * Math.sin(time * 12);
          ctx.fillStyle = 'rgba(255, 61, 0, ' + pulse.toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(0, -3, 20, 0, TWO_PI);
          ctx.fill();
        }

        // Armored greaves
        ctx.strokeStyle = '#2d3138';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-4, 4);
        ctx.lineTo(-5 + Math.sin(walk) * 4, 13);
        ctx.moveTo(4, 4);
        ctx.lineTo(5 - Math.sin(walk) * 4, 13);
        ctx.stroke();

        // Broad muscular crimson-brown chest + angular dark steel plate
        ctx.fillStyle = hitFlash ? '#ffffff' : (enraged ? '#8e2a22' : '#6d392e');
        ctx.beginPath();
        ctx.ellipse(0, -2 - bob * 0.5, 10.5, 9.5, 0, 0, TWO_PI);
        ctx.fill();

        ctx.fillStyle = '#323842';
        ctx.beginPath();
        ctx.moveTo(-9, -6 - bob * 0.5);
        ctx.lineTo(9, -6 - bob * 0.5);
        ctx.lineTo(6, 5 - bob * 0.5);
        ctx.lineTo(-6, 5 - bob * 0.5);
        ctx.closePath();
        ctx.fill();

        // Iconic Square-Crested Uruk Helm + White Hand Emblem
        ctx.fillStyle = '#262b33';
        ctx.beginPath();
        ctx.moveTo(-6, -8 - bob * 0.6);
        ctx.lineTo(-6, -16 - bob * 0.6);
        ctx.lineTo(0, -19 - bob * 0.6);
        ctx.lineTo(6, -16 - bob * 0.6);
        ctx.lineTo(6, -8 - bob * 0.6);
        ctx.closePath();
        ctx.fill();

        // White Hand motif on helm brow
        ctx.fillStyle = '#f5f5f5';
        ctx.beginPath();
        ctx.arc(0.5, -13 - bob * 0.6, 2.1, 0, TWO_PI);
        ctx.fill();
        ctx.strokeStyle = '#f5f5f5';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-1, -14 - bob * 0.6);
        ctx.lineTo(-1.5, -16.8 - bob * 0.6);
        ctx.moveTo(0.5, -14.5 - bob * 0.6);
        ctx.lineTo(0.5, -17.2 - bob * 0.6);
        ctx.moveTo(2, -14 - bob * 0.6);
        ctx.lineTo(2.5, -16.6 - bob * 0.6);
        ctx.stroke();

        // Glowing eyes
        ctx.fillStyle = enraged ? '#ff1744' : '#ffb300';
        ctx.fillRect(1.5, -10.5 - bob * 0.6, 3.2, 1.5);

        // Heavy Uruk Cleaver Sword
        ctx.fillStyle = '#cfd8dc';
        ctx.save();
        ctx.translate(7, -3 - bob * 0.5);
        ctx.rotate(-0.45 + swing * 0.08);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(14, -6);
        ctx.lineTo(15, -1);
        ctx.lineTo(11, 1);
        ctx.lineTo(0, 2.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }

      case 'warg': {
        const stride = Math.sin(walk * 1.35) * 5.5;
        // Bounding wolf legs
        ctx.strokeStyle = '#3a2d25';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-8, 3);
        ctx.lineTo(-13 - stride, 11);
        ctx.moveTo(-5, 4);
        ctx.lineTo(-7 + stride * 0.6, 11);
        ctx.moveTo(7, 3);
        ctx.lineTo(12 + stride, 11);
        ctx.moveTo(4, 4);
        ctx.lineTo(7 - stride * 0.6, 11);
        ctx.stroke();

        // Bushy tail
        ctx.strokeStyle = '#4e3d32';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(-11, 0);
        ctx.quadraticCurveTo(-17, -2, -19, 3);
        ctx.stroke();

        // Muscular Warg body & shaggy mane
        ctx.fillStyle = hitFlash ? '#ffffff' : '#4e3d32';
        ctx.beginPath();
        ctx.ellipse(-1, 0 - bob * 0.4, 13, 7, 0, 0, TWO_PI);
        ctx.fill();

        ctx.fillStyle = hitFlash ? '#ffffff' : '#655042';
        ctx.beginPath();
        ctx.ellipse(7, -2 - bob * 0.4, 7.5, 6.8, -0.2, 0, TWO_PI);
        ctx.fill();

        // Snarling wolf snout & fangs
        ctx.fillStyle = '#3b2e26';
        ctx.beginPath();
        ctx.moveTo(9, -6 - bob * 0.4);
        ctx.lineTo(18, -3 - bob * 0.4);
        ctx.lineTo(16, 1 - bob * 0.4);
        ctx.lineTo(9, 1 - bob * 0.4);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#ffca28';
        ctx.beginPath();
        ctx.arc(12.5, -4.2 - bob * 0.4, 1.3, 0, TWO_PI);
        ctx.fill();

        // Hunched Orc Rider + Spear
        ctx.fillStyle = '#2d333b';
        ctx.beginPath();
        ctx.ellipse(-1, -8 - bob * 0.5, 5.5, 6, 0.2, 0, TWO_PI);
        ctx.fill();
        ctx.fillStyle = '#566347';
        ctx.beginPath();
        ctx.arc(1, -14 - bob * 0.5, 3.8, 0, TWO_PI);
        ctx.fill();

        ctx.strokeStyle = '#d7ccc8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-6, -8 - bob * 0.5);
        ctx.lineTo(17 + swing * 0.4, -10 - bob * 0.5);
        ctx.stroke();
        break;
      }

      case 'troll': {
        // Massive pillar legs
        ctx.strokeStyle = '#43494d';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-7, 6);
        ctx.lineTo(-8 + Math.sin(walk) * 3.5, 18);
        ctx.moveTo(7, 6);
        ctx.lineTo(8 - Math.sin(walk) * 3.5, 18);
        ctx.stroke();

        // Colossal hunched granite torso
        ctx.fillStyle = hitFlash ? '#ffffff' : '#586066';
        ctx.beginPath();
        ctx.ellipse(0, -3 - bob * 0.4, 17, 15, 0, 0, TWO_PI);
        ctx.fill();

        // Riveted Gorgoroth Siege Pauldrons & Chestplate
        ctx.fillStyle = '#282d33';
        ctx.strokeStyle = '#78909c';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(-11, -8 - bob * 0.4, 7.5, 5.5, -0.4, 0, TWO_PI);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(11, -8 - bob * 0.4, 7.5, 5.5, 0.4, 0, TWO_PI);
        ctx.fill();
        ctx.stroke();

        // Troll head + iron jaw-guard
        ctx.fillStyle = hitFlash ? '#ffffff' : '#697278';
        ctx.beginPath();
        ctx.arc(2, -16 - bob * 0.4, 7, 0, TWO_PI);
        ctx.fill();
        ctx.fillStyle = '#22262b';
        ctx.fillRect(-3, -15 - bob * 0.4, 11, 5);
        ctx.fillStyle = '#ff7043';
        ctx.fillRect(3.5, -18 - bob * 0.4, 2.2, 1.8);

        // Colossal Iron-Banded War Club
        ctx.save();
        ctx.translate(13, -5 - bob * 0.4);
        const clubRot = atk > 0 ? Math.sin(atk * Math.PI) * 1.15 : -0.35 + Math.sin(walk) * 0.12;
        ctx.rotate(clubRot);
        ctx.fillStyle = '#4e342e';
        ctx.fillRect(-2.5, -20, 5, 22);
        ctx.fillStyle = '#37474f';
        ctx.beginPath();
        ctx.ellipse(0, -17, 6.5, 8.5, 0, 0, TWO_PI);
        ctx.fill();
        ctx.restore();
        break;
      }

      case 'wraith': {
        const hover = Math.sin(time * 4.5 + walk) * 2.5;
        // Spectral outer glow
        ctx.fillStyle = 'rgba(77, 208, 225, 0.20)';
        ctx.beginPath();
        ctx.ellipse(0, -4 + hover, 13, 16, 0, 0, TWO_PI);
        ctx.fill();

        // Tattered spectral shroud tendrils
        ctx.fillStyle = hitFlash ? '#ffffff' : '#182b36';
        ctx.strokeStyle = '#4dd0e1';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, -17 + hover);
        ctx.quadraticCurveTo(10, -10 + hover, 9, 8 + hover);
        ctx.lineTo(4, 4 + hover);
        ctx.lineTo(0, 11 + hover);
        ctx.lineTo(-5, 5 + hover);
        ctx.lineTo(-10, 9 + hover);
        ctx.quadraticCurveTo(-10, -10 + hover, 0, -17 + hover);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Hollow hood + icy cyan eyes
        ctx.fillStyle = '#091014';
        ctx.beginPath();
        ctx.arc(2, -10 + hover, 4.2, 0, TWO_PI);
        ctx.fill();
        ctx.fillStyle = '#84ffff';
        ctx.fillRect(1, -11 + hover, 1.8, 1.6);
        ctx.fillRect(4, -11 + hover, 1.8, 1.6);

        // Pale Morgul Blade
        ctx.strokeStyle = '#b2ebf2';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(6, -3 + hover);
        ctx.lineTo(16, -9 + hover + swing * 0.4);
        ctx.stroke();
        break;
      }

      case 'fellbeast': {
        // Drawn oriented along +X so caller rotates by enemy.angle
        const flap = Math.sin(time * 8.2 + walk * 0.5);
        const wingSpan = 24 + flap * 7;
        const wingSweep = -4 - flap * 5;

        // Sweeping leathery bat-wings
        ctx.fillStyle = hitFlash ? '#ffffff' : '#2d253b';
        ctx.strokeStyle = '#5e4b7a';
        ctx.lineWidth = 1.4;

        // Left & right wings
        for (let side = -1; side <= 1; side += 2) {
          ctx.beginPath();
          ctx.moveTo(2, side * 3);
          ctx.quadraticCurveTo(6, side * (wingSpan * 0.65), wingSweep, side * wingSpan);
          ctx.quadraticCurveTo(-8, side * (wingSpan * 0.7), -5, side * 12);
          ctx.quadraticCurveTo(-10, side * 6, -8, side * 2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        // Barbed sinuous tail
        ctx.strokeStyle = '#231d30';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.quadraticCurveTo(-17, Math.sin(time * 6) * 3, -24, -Math.sin(time * 6) * 2.5);
        ctx.stroke();

        // Torso + dark rider silhouette
        ctx.fillStyle = '#1e1929';
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 5.2, 0, 0, TWO_PI);
        ctx.fill();
        ctx.fillStyle = '#0d0b12';
        ctx.beginPath();
        ctx.arc(-1, -1, 4.2, 0, TWO_PI);
        ctx.fill();

        // Long serpentine neck + horned drake skull
        ctx.strokeStyle = '#2a2238';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(7, 0);
        ctx.lineTo(15, 0);
        ctx.stroke();

        ctx.fillStyle = '#382e4a';
        ctx.beginPath();
        ctx.moveTo(13, -3.5);
        ctx.lineTo(22, -1.2);
        ctx.lineTo(22, 1.2);
        ctx.lineTo(13, 3.5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ff5252';
        ctx.fillRect(16, -2, 2, 1.3);
        ctx.fillRect(16, 0.7, 2, 1.3);
        break;
      }

      case 'ringwraith': {
        const hover = Math.sin(time * 3.6) * 2;
        // Swirling Black Breath mist aura
        ctx.fillStyle = 'rgba(126, 87, 194, 0.24)';
        ctx.beginPath();
        ctx.arc(0, -4 + hover, 22, 0, TWO_PI);
        ctx.fill();

        // Towering velvet-black robes
        ctx.fillStyle = hitFlash ? '#ffffff' : '#10121c';
        ctx.strokeStyle = '#7e57c2';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(0, -24 + hover);
        ctx.lineTo(12, -8 + hover);
        ctx.lineTo(14, 13 + hover);
        ctx.lineTo(5, 9 + hover);
        ctx.lineTo(0, 14 + hover);
        ctx.lineTo(-6, 9 + hover);
        ctx.lineTo(-14, 13 + hover);
        ctx.lineTo(-12, -8 + hover);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Silver-iron Morgul crown spikes
        ctx.fillStyle = '#b0bec5';
        ctx.beginPath();
        ctx.moveTo(-6, -20 + hover);
        ctx.lineTo(-5, -27 + hover);
        ctx.lineTo(-2, -21 + hover);
        ctx.lineTo(0, -29 + hover);
        ctx.lineTo(2, -21 + hover);
        ctx.lineTo(5, -27 + hover);
        ctx.lineTo(6, -20 + hover);
        ctx.closePath();
        ctx.fill();

        // Void visage + violet dread eyes
        ctx.fillStyle = '#050508';
        ctx.beginPath();
        ctx.arc(1, -16 + hover, 5, 0, TWO_PI);
        ctx.fill();
        ctx.fillStyle = '#ea80fc';
        ctx.fillRect(-1, -17 + hover, 2.2, 1.8);
        ctx.fillRect(2.5, -17 + hover, 2.2, 1.8);

        // Long Dark Greatsword
        ctx.strokeStyle = '#d1c4e9';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.moveTo(9, -6 + hover);
        ctx.lineTo(22, -18 + hover + swing * 0.5);
        ctx.stroke();
        break;
      }

      case 'balrog': {
        if (phase < 2) {
          // PHASE 1: The Witch-lord of Morgul
          const hover = Math.sin(time * 3.2) * 2;
          ctx.fillStyle = 'rgba(105, 240, 174, 0.18)';
          ctx.beginPath();
          ctx.arc(0, -6 + hover, 27, 0, TWO_PI);
          ctx.fill();

          // Armored dark robes & spiked pauldrons
          ctx.fillStyle = hitFlash ? '#ffffff' : '#161d24';
          ctx.strokeStyle = '#69f0ae';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(0, -26 + hover);
          ctx.lineTo(15, -10 + hover);
          ctx.lineTo(17, 15 + hover);
          ctx.lineTo(0, 12 + hover);
          ctx.lineTo(-17, 15 + hover);
          ctx.lineTo(-15, -10 + hover);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Tall 5-spiked Iron Crown of Angmar
          ctx.fillStyle = '#cfd8dc';
          ctx.beginPath();
          ctx.moveTo(-8, -21 + hover);
          ctx.lineTo(-8, -30 + hover);
          ctx.lineTo(-4, -23 + hover);
          ctx.lineTo(-2, -33 + hover);
          ctx.lineTo(0, -24 + hover);
          ctx.lineTo(2, -35 + hover);
          ctx.lineTo(4, -23 + hover);
          ctx.lineTo(8, -30 + hover);
          ctx.lineTo(8, -21 + hover);
          ctx.closePath();
          ctx.fill();

          // Morgul eyes
          ctx.fillStyle = '#69f0ae';
          ctx.fillRect(-1.5, -18 + hover, 2.5, 2);
          ctx.fillRect(3, -18 + hover, 2.5, 2);

          // Great Spiked Flail on Chain
          const flailSwing = Math.sin(time * 4.8) * 5;
          ctx.strokeStyle = '#90a4ae';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(12, -10 + hover);
          ctx.quadraticCurveTo(21, -4 + hover, 22 + flailSwing * 0.5, 8 + hover);
          ctx.stroke();

          ctx.fillStyle = '#37474f';
          ctx.strokeStyle = '#b0bec5';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(22 + flailSwing * 0.5, 10 + hover, 6.5, 0, TWO_PI);
          ctx.fill();
          ctx.stroke();
        } else {
          // PHASE 2: Balrog of Udûn — Shadow and Flame!
          const pulse = Math.sin(time * 8) * 2.5;
          const wingSpread = 31 + pulse;

          // Billowing shadow-and-hellfire aura
          ctx.fillStyle = 'rgba(255, 87, 34, 0.28)';
          ctx.beginPath();
          ctx.arc(0, -6, 32 + pulse * 0.6, 0, TWO_PI);
          ctx.fill();

          // Massive Shadow Wings edged in molten embers
          ctx.fillStyle = '#140e10';
          ctx.strokeStyle = '#ff6d00';
          ctx.lineWidth = 1.8;
          for (let side = -1; side <= 1; side += 2) {
            ctx.beginPath();
            ctx.moveTo(side * 6, -12);
            ctx.quadraticCurveTo(side * 22, -28, side * wingSpread, -16);
            ctx.lineTo(side * (wingSpread - 5), -2);
            ctx.lineTo(side * 16, 6);
            ctx.lineTo(side * 8, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }

          // Horned Obsidian Demon Torso + Magma Core Cracks
          ctx.fillStyle = hitFlash ? '#ffffff' : '#1f1414';
          ctx.beginPath();
          ctx.ellipse(0, -3 - bob * 0.3, 15, 16, 0, 0, TWO_PI);
          ctx.fill();

          ctx.strokeStyle = '#ff9100';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(-6, -8);
          ctx.lineTo(0, -2);
          ctx.lineTo(6, -8);
          ctx.moveTo(0, -2);
          ctx.lineTo(0, 7);
          ctx.stroke();

          // Curved Bull Horns + Blazing Eyes
          ctx.strokeStyle = '#2d1e1b';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(-5, -18);
          ctx.quadraticCurveTo(-16, -24, -14, -12);
          ctx.moveTo(5, -18);
          ctx.quadraticCurveTo(16, -24, 14, -12);
          ctx.stroke();

          ctx.fillStyle = '#ffea00';
          ctx.fillRect(-4, -16, 3, 2.4);
          ctx.fillRect(2, -16, 3, 2.4);

          // Flaming Broadsword (right hand)
          ctx.strokeStyle = '#ffab00';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(12, -4);
          ctx.lineTo(27, -20 + swing * 0.5);
          ctx.stroke();
          ctx.strokeStyle = '#fff59d';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(12, -4);
          ctx.lineTo(27, -20 + swing * 0.5);
          ctx.stroke();

          // Coiling Multi-Thonged Fiery Whip (left hand)
          ctx.strokeStyle = '#ff3d00';
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.moveTo(-12, -3);
          ctx.bezierCurveTo(
            -24, -14 + Math.sin(time * 9) * 6,
            -28, 8 - Math.cos(time * 9) * 6,
            -20, 17 + Math.sin(time * 11) * 4
          );
          ctx.stroke();
        }
        break;
      }
    }

    ctx.restore();
  }

  // ============================================================================
  // 7. TD.EnemyManager — Wave Spawning, Combat Loop, Bosses & Rendering
  // ============================================================================
  class EnemyManager {
    constructor() {
      this.active = [];
      this.waveInProgress = false;
      this.betweenWavesDuration = 14.0;
      this.betweenWavesTimer = 0;
      this.currentWave = 0;
      this.spawnQueue = [];
      this.waveElapsed = 0;
      this._laneAltCounter = 0;
    }

    reset() {
      this.active.length = 0;
      this.spawnQueue.length = 0;
      this.waveInProgress = false;
      this.betweenWavesTimer = 0;
      this.currentWave = 0;
      this.waveElapsed = 0;
      this._laneAltCounter = 0;
    }

    getWaveConfig(waveNum) {
      return getWaveConfig(waveNum);
    }

    canCallEarly(game) {
      if (this.waveInProgress) return false;
      if (game && game.state && game.state !== 'playing' && game.state !== 'paused') return false;
      const w = (game && typeof game.wave === 'number') ? Math.max(this.currentWave, game.wave) : this.currentWave;
      const endless = Boolean(game && (game.endlessMode || game.endless || game.isEndless || w > 15));
      if (w >= 15 && !endless) return false;
      return true;
    }

    getEarlyCallBonus(game) {
      if (!this.canCallEarly(game)) return 0;
      if (this.betweenWavesTimer > 0) {
        return Math.max(5, Math.ceil(this.betweenWavesTimer * 3.5));
      }
      return 15;
    }

    _resolveGroundMetric(map, laneIndex) {
      const paths = (map && Array.isArray(map.paths) && map.paths.length > 0) ? map.paths : null;
      if (!paths) return getPathMetric(null);
      const idx = ((laneIndex % paths.length) + paths.length) % paths.length;
      return getPathMetric(paths[idx]);
    }

    _resolveFlyMetric(map, laneIndex) {
      const flyPaths = (map && Array.isArray(map.flyPaths) && map.flyPaths.length > 0)
        ? map.flyPaths
        : ((map && Array.isArray(map.paths) && map.paths.length > 0) ? map.paths : null);
      if (!flyPaths) return getPathMetric(null);
      const idx = ((laneIndex % flyPaths.length) + flyPaths.length) % flyPaths.length;
      return getPathMetric(flyPaths[idx]);
    }

    spawnEnemy(typeKey, laneIndex, game, hpMult, speedMult, startDist) {
      const cfg = ENEMY_TYPES[typeKey] || ENEMY_TYPES.goblin;
      const map = game ? game.map : null;
      const laneCount = cfg.flying
        ? ((map && Array.isArray(map.flyPaths) && map.flyPaths.length) || (map && Array.isArray(map.paths) && map.paths.length) || 1)
        : ((map && Array.isArray(map.paths) && map.paths.length) || 1);
      const resolvedLane = ((laneIndex || 0) % laneCount + laneCount) % laneCount;
      const metric = cfg.flying
        ? this._resolveFlyMetric(map, resolvedLane)
        : this._resolveGroundMetric(map, resolvedLane);

      const enemy = new Enemy(typeKey, resolvedLane, metric, game, hpMult || 1, speedMult || 1, startDist || 0);
      this.active.push(enemy);
      return enemy;
    }

    startNextWave(game, isEarlyCall = false) {
      if (this.waveInProgress) return false;

      if (isEarlyCall && this.canCallEarly(game)) {
        const bonus = this.getEarlyCallBonus(game);
        if (bonus > 0 && game && typeof game.addGold === 'function') {
          const ep = (game.map && Array.isArray(game.map.entryPoints) && game.map.entryPoints[0]) || { x: 110, y: 140 };
          game.addGold(bonus, ep.x, ep.y, false);
        }
      }

      // Sync wave index cleanly whether engine pre-incremented game.wave or delegates to startNextWave
      if (game && typeof game.wave === 'number' && game.wave === this.currentWave + 1) {
        this.currentWave = game.wave;
      } else if (game && typeof game.wave === 'number' && game.wave > this.currentWave + 1) {
        this.currentWave = game.wave + 1;
        game.wave = this.currentWave;
      } else {
        this.currentWave += 1;
        if (game && typeof game.wave === 'number') {
          game.wave = this.currentWave;
        }
      }

      const waveNum = this.currentWave;
      const waveCfg = this.getWaveConfig(waveNum);
      const map = game ? game.map : null;
      const groundLanes = Math.max(1, (map && Array.isArray(map.paths) && map.paths.length) || 1);
      const flyLanes = Math.max(1, (map && Array.isArray(map.flyPaths) && map.flyPaths.length) || groundLanes);

      this.spawnQueue.length = 0;
      this.waveElapsed = 0;
      this.betweenWavesTimer = 0;
      this.waveInProgress = true;

      const baseHpMult = waveCfg.hpMult || 1.0;
      const baseSpdMult = waveCfg.speedMult || 1.0;

      for (let gIdx = 0; gIdx < waveCfg.groups.length; gIdx++) {
        const grp = waveCfg.groups[gIdx];
        const eCfg = ENEMY_TYPES[grp.type] || ENEMY_TYPES.goblin;
        const numLanes = eCfg.flying ? flyLanes : groundLanes;
        const count = Math.max(1, grp.count || 1);
        const interval = typeof grp.interval === 'number' ? grp.interval : 0.75;
        const startDelay = typeof grp.delay === 'number' ? grp.delay : 0;
        const grpHp = baseHpMult * (grp.hpScale || 1.0);

        for (let i = 0; i < count; i++) {
          let laneIdx = 0;
          if (grp.lane === 'alternate') {
            laneIdx = (this._laneAltCounter++) % numLanes;
          } else if (typeof grp.lane === 'number') {
            laneIdx = grp.lane % numLanes;
          }
          this.spawnQueue.push({
            spawnAt: startDelay + i * interval,
            type: grp.type,
            laneIndex: laneIdx,
            hpMult: grpHp,
            speedMult: baseSpdMult
          });
        }
      }

      // Sort ascending by spawnAt so update() pops from front/index cleanly
      this.spawnQueue.sort((a, b) => a.spawnAt - b.spawnAt);

      if (game && game.sound && typeof game.sound.playHorn === 'function') {
        game.sound.playHorn();
      }
      return true;
    }

    spawnRingwraithBoss(game) {
      const waveNum = Math.max(1, (game && game.wave) || this.currentWave || 1);
      const waveScale = waveNum <= 15
        ? (1 + (waveNum - 1) * 0.07)
        : (1.98 * Math.pow(1.12, waveNum - 15));

      const metric = this._resolveGroundMetric(game ? game.map : null, 0);
      // Emerge slightly onto the causeway so it's immediately visible onscreen and near front pads
      const startDist = Math.min(60, metric.totalLength * 0.08);
      const boss = new Enemy('ringwraith', 0, metric, game, waveScale, 1.0, startDist);
      this.active.push(boss);

      if (game && game.sound && typeof game.sound.playWraithSpawn === 'function') {
        game.sound.playWraithSpawn();
      }

      // Immediate Black Breath pulse on spawn stunning nearby towers for 4.0s!
      boss.pulseBlackBreath(game);
      boss.blackBreathTimer = 8.0;

      return boss;
    }

    getActiveBoss() {
      let ringwraith = null;
      for (let i = 0; i < this.active.length; i++) {
        const e = this.active[i];
        if (!e || e.dead || e.reachedExit || !e.isBoss) continue;
        if (e.type === 'balrog') return e;
        if (!ringwraith) ringwraith = e;
      }
      return ringwraith;
    }

    update(dt, game) {
      if (!(dt > 0)) return;

      // Inter-wave countdown after Wave 1 has begun
      if (!this.waveInProgress && this.betweenWavesTimer > 0) {
        if (!game || !game.state || game.state === 'playing') {
          this.betweenWavesTimer -= dt;
          if (this.betweenWavesTimer <= 0) {
            this.betweenWavesTimer = 0;
            this.startNextWave(game, false);
          }
        }
      }

      // Process queued wave spawns
      if (this.waveInProgress && this.spawnQueue.length > 0) {
        this.waveElapsed += dt;
        while (this.spawnQueue.length > 0 && this.spawnQueue[0].spawnAt <= this.waveElapsed) {
          const item = this.spawnQueue.shift();
          const spawned = this.spawnEnemy(item.type, item.laneIndex, game, item.hpMult, item.speedMult, 0);
          if (item.type === 'balrog' && game && game.sound && typeof game.sound.playBossRoar === 'function') {
            game.sound.playBossRoar();
          }
          if (item.type === 'ringwraith') {
            spawned.pulseBlackBreath(game);
          }
        }
      }

      // Update active enemies
      for (let i = this.active.length - 1; i >= 0; i--) {
        const enemy = this.active[i];
        enemy.update(dt, game);

        if (enemy.reachedExit) {
          releaseSoldierRef(enemy);
          this.active.splice(i, 1);
          this._handleEnemyExit(enemy, game);
        } else if (enemy.dead) {
          releaseSoldierRef(enemy);
          this.active.splice(i, 1);
        }
      }

      // Check wave clear completion
      if (this.waveInProgress && this.spawnQueue.length === 0 && this.active.length === 0) {
        this.waveInProgress = false;
        const clearedWave = this.currentWave;
        const stillAlive = !game || ((typeof game.lives !== 'number' || game.lives > 0) && game.state !== 'defeat');

        if (stillAlive) {
          const endless = Boolean(game && (game.endlessMode || game.endless || clearedWave > 15));
          if (clearedWave < 15 || endless) {
            this.betweenWavesTimer = this.betweenWavesDuration;
          } else {
            this.betweenWavesTimer = 0;
          }
          if (game && typeof game.onWaveCleared === 'function') {
            game.onWaveCleared(clearedWave);
          }
        }
      }
    }

    _handleEnemyExit(enemy, game) {
      if (!game) return;
      if (typeof game.onEnemyReachedExit === 'function') {
        game.onEnemyReachedExit(enemy);
      } else if (typeof game.loseLives === 'function') {
        game.loseLives(enemy.livesCost, enemy);
      } else if (typeof game.loseLife === 'function') {
        game.loseLife(enemy.livesCost, enemy);
      } else if (typeof game.lives === 'number') {
        game.lives = Math.max(0, game.lives - enemy.livesCost);
        if (game.vfx && game.vfx.spawnFloatingText) {
          game.vfx.spawnFloatingText(enemy.x, enemy.y - 16, '-' + enemy.livesCost + ' LIFE', '#ff5252', 1.15);
        }
        if (game.lives <= 0) {
          if (typeof game.triggerDefeat === 'function') {
            game.triggerDefeat();
          } else {
            game.state = 'defeat';
            if (game.sound && typeof game.sound.playDefeat === 'function') {
              game.sound.playDefeat();
            }
          }
        }
      }
    }

    render(ctx, time, game) {
      if (!ctx || this.active.length === 0) return;
      const t = typeof time === 'number' ? time : 0;

      // Sort ground enemies by y for clean depth overlap without per-frame array allocation
      // (copy references into reusable buffer)
      if (!this._renderOrder) this._renderOrder = [];
      const order = this._renderOrder;
      order.length = 0;
      for (let i = 0; i < this.active.length; i++) {
        const e = this.active[i];
        if (!e.dead && !e.reachedExit && !e.flying) {
          order.push(e);
        }
      }
      order.sort((a, b) => a.y - b.y);

      // Pass 1: Ground shadows (including Fell Beast aerial drop-shadows) & Ground Units
      for (let i = 0; i < this.active.length; i++) {
        const e = this.active[i];
        if (e.flying && !e.dead && !e.reachedExit) {
          ctx.save();
          ctx.translate(e.x + 20, e.y + 34);
          ctx.rotate(e.angle);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
          ctx.beginPath();
          ctx.ellipse(0, 0, 18, 9, 0, 0, TWO_PI);
          ctx.fill();
          ctx.restore();
        }
      }

      for (let i = 0; i < order.length; i++) {
        this._renderSingleEnemy(ctx, order[i], t, game);
      }

      // Pass 2: Boss Curse Tether Beams & Flying Units
      for (let i = 0; i < this.active.length; i++) {
        const e = this.active[i];
        if (e.type === 'balrog' && e.cursedTower && isTowerActivelyCursed(e.cursedTower, game)) {
          this._renderCurseTether(ctx, e, e.cursedTower, t);
        }
      }

      for (let i = 0; i < this.active.length; i++) {
        const e = this.active[i];
        if (e.flying && !e.dead && !e.reachedExit) {
          this._renderSingleEnemy(ctx, e, t, game);
        }
      }

      // Pass 3: Crisp Health Bars & Status Icons on top
      for (let i = 0; i < this.active.length; i++) {
        const e = this.active[i];
        if (!e.dead && !e.reachedExit) {
          this._renderHealthAndBadges(ctx, e, t, game);
        }
      }
    }

    _renderSingleEnemy(ctx, e, time, game) {
      ctx.save();

      // Ground contact shadow
      if (!e.flying) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
        ctx.beginPath();
        ctx.ellipse(e.x, e.y + e.radius * 0.65, e.radius * 0.92, e.radius * 0.42, 0, 0, TWO_PI);
        ctx.fill();
      }

      // Parabolic Warg Leap vertical arc offset
      let jumpOffsetY = 0;
      if (e.leapTimer > 0 && e.leapDuration > 0) {
        const p = 1 - (e.leapTimer / e.leapDuration);
        jumpOffsetY = -Math.sin(p * Math.PI) * 28;
      }

      ctx.translate(e.x, e.y + jumpOffsetY);

      // Status ground/body rings: Slow frost ring
      if (e.slowTimer > 0) {
        ctx.strokeStyle = 'rgba(79, 195, 247, 0.78)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, e.flying ? 0 : 5, e.radius + 4, (e.radius + 4) * (e.flying ? 0.85 : 0.5), 0, 0, TWO_PI);
        ctx.stroke();
      }

      // Shadow Wraith spectral translucency + Reveal starlight ring
      const isRevealed = e.revealedTimer > 0 || Boolean(game && game.ringActive && e.type === 'wraith');
      if (e.type === 'wraith') {
        ctx.globalAlpha = isRevealed ? 0.92 : (0.42 + 0.10 * Math.sin(time * 5 + e.animSeed));
      }
      if (e.dodgeFlashTimer > 0) {
        ctx.globalAlpha *= 0.35;
      }

      if (e.flying) {
        ctx.rotate(e.angle);
        drawEnemyBody(ctx, e.type, e.phase, time, {
          walk: e.walkPhase,
          atk: 0,
          enraged: false,
          hitFlash: e.hitFlashTimer > 0,
          facingLeft: false
        });
      } else {
        const facingLeft = Math.cos(e.angle) < -0.15;
        drawEnemyBody(ctx, e.type, e.phase, time, {
          walk: e.walkPhase,
          atk: e.attackAnimTimer / 0.28,
          enraged: e.enraged,
          hitFlash: e.hitFlashTimer > 0,
          facingLeft: facingLeft
        });
      }

      ctx.globalAlpha = 1;

      // Bleed crimson droplets
      if (e.bleedTimer > 0) {
        const dropPhase = (time * 3.5 + e.animSeed) % 1;
        ctx.fillStyle = '#ef5350';
        ctx.beginPath();
        ctx.arc(-4, -4 + dropPhase * 12, 2.1, 0, TWO_PI);
        ctx.arc(5, -7 + ((dropPhase + 0.5) % 1) * 12, 1.8, 0, TWO_PI);
        ctx.fill();
      }

      // Revealed Starlight / True Sight Halo
      if (isRevealed) {
        ctx.strokeStyle = (game && game.ringActive) ? '#ffd54f' : '#8be0ff';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(0, -4, e.radius + 5, 0, TWO_PI);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Stunned orbiting stars above head
      if (e.stunTimer > 0) {
        const topY = -e.radius - 11;
        ctx.fillStyle = '#fff176';
        for (let k = 0; k < 3; k++) {
          const a = time * 6.5 + (k * TWO_PI / 3);
          ctx.beginPath();
          ctx.arc(Math.cos(a) * 8, topY + Math.sin(a) * 3, 2.2, 0, TWO_PI);
          ctx.fill();
        }
      }

      ctx.restore();
    }

    _renderCurseTether(ctx, boss, tower, time) {
      const x1 = boss.x;
      const y1 = boss.y - 16;
      const x2 = tower.x;
      const y2 = tower.y - 12;
      const isBalrog = boss.phase === 2;

      ctx.save();
      ctx.lineCap = 'round';

      // Outer pulsing aura tether
      ctx.strokeStyle = isBalrog ? 'rgba(255, 87, 34, 0.42)' : 'rgba(105, 240, 174, 0.36)';
      ctx.lineWidth = 7 + Math.sin(time * 12) * 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      const mx = (x1 + x2) * 0.5 + Math.sin(time * 9) * 10;
      const my = (y1 + y2) * 0.5 + Math.cos(time * 9) * 10;
      ctx.quadraticCurveTo(mx, my, x2, y2);
      ctx.stroke();

      // Inner bright spell-lock core
      ctx.strokeStyle = isBalrog ? '#ffab00' : '#b9f6ca';
      ctx.lineWidth = 2.4;
      ctx.setLineDash([8, 5]);
      ctx.lineDashOffset = -time * 48;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(mx, my, x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Cursed rune ring around locked tower
      ctx.strokeStyle = isBalrog ? '#ff3d00' : '#69f0ae';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, 26 + Math.sin(time * 10) * 2.5, 0, TWO_PI);
      ctx.stroke();

      ctx.restore();
    }

    _renderHealthAndBadges(ctx, e, time, game) {
      const showBar = e.isBoss || e.hp < e.maxHp || e.armorShred > 0 || e.enraged;
      if (!showBar) return;

      const jumpOffsetY = (e.leapTimer > 0 && e.leapDuration > 0)
        ? -Math.sin((1 - e.leapTimer / e.leapDuration) * Math.PI) * 28
        : 0;

      const bw = e.isBoss ? 52 : (e.type === 'troll' ? 36 : 24);
      const bh = e.isBoss ? 5.5 : 3.8;
      const bx = e.x - bw * 0.5;
      const by = e.y + jumpOffsetY - e.radius - (e.isBoss ? 22 : 12);
      const ratio = clamp(e.hp / e.maxHp, 0, 1);

      ctx.fillStyle = 'rgba(10, 12, 16, 0.85)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);

      let barColor = '#66bb6a';
      if (e.isBoss) {
        barColor = e.type === 'balrog' ? (e.phase === 2 ? '#ff5722' : '#26a69a') : '#ab47bc';
      } else if (ratio < 0.35) {
        barColor = '#ef5350';
      } else if (ratio < 0.68) {
        barColor = '#ffa726';
      }
      ctx.fillStyle = barColor;
      ctx.fillRect(bx, by, bw * ratio, bh);

      // Troll active regeneration vitality indicator vs suppressed fire spark
      if (e.type === 'troll' && e.hp < e.maxHp) {
        ctx.fillStyle = e.fireSuppressTimer > 0 ? '#ff7043' : '#69f0ae';
        ctx.beginPath();
        ctx.arc(bx + bw + 5, by + bh * 0.5, 2.5, 0, TWO_PI);
        ctx.fill();
      }

      // Permanent Armor-Shred Broken Shield Icon
      if (e.armorShred > 0) {
        const sx = bx - 7;
        const sy = by + bh * 0.5;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.fillStyle = '#ffb74d';
        ctx.strokeStyle = '#3e2723';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-4, -4);
        ctx.lineTo(4, -4);
        ctx.lineTo(3.5, 1);
        ctx.lineTo(0, 4.5);
        ctx.lineTo(-3.5, 1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Jagged crack down the shield
        ctx.strokeStyle = '#b71c1c';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-1, -4);
        ctx.lineTo(1.2, 0);
        ctx.lineTo(-1, 4.2);
        ctx.stroke();
        ctx.restore();
      }
    }

    renderPortrait(ctx, typeKey, w, h) {
      if (!ctx) return;
      const width = w || (ctx.canvas && ctx.canvas.width) || 64;
      const height = h || (ctx.canvas && ctx.canvas.height) || 64;
      const cfg = ENEMY_TYPES[typeKey] || ENEMY_TYPES.goblin;

      ctx.save();
      ctx.clearRect(0, 0, width, height);

      // Atmospheric dark stone & faction glow medallion background
      const cx = width * 0.5;
      const cy = height * 0.54;
      const grad = ctx.createRadialGradient(cx, cy, width * 0.06, cx, height * 0.5, width * 0.62);
      grad.addColorStop(0, cfg.accentColor || '#607d8b');
      grad.addColorStop(0.45, '#252a32');
      grad.addColorStop(1, '#12151a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Subtle tarnished gold inner border
      ctx.strokeStyle = 'rgba(200, 162, 75, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(1.5, 1.5, width - 3, height - 3);

      const minDim = Math.min(width, height);
      let scale = minDim / 52;
      let offsetY = height * 0.58;

      if (typeKey === 'balrog') {
        scale = minDim / 72;
        offsetY = height * 0.60;
      } else if (typeKey === 'ringwraith') {
        scale = minDim / 64;
        offsetY = height * 0.62;
      } else if (typeKey === 'troll') {
        scale = minDim / 60;
        offsetY = height * 0.60;
      } else if (typeKey === 'fellbeast') {
        scale = minDim / 62;
        offsetY = height * 0.52;
      } else if (typeKey === 'goblin') {
        scale = minDim / 42;
        offsetY = height * 0.60;
      }

      ctx.translate(cx, offsetY);
      ctx.scale(scale, scale);

      if (typeKey === 'fellbeast') {
        ctx.rotate(-0.35);
      }

      drawEnemyBody(ctx, cfg.id, cfg.id === 'balrog' ? 2 : 1, 1.2, {
        walk: 0.6,
        atk: 0,
        enraged: cfg.id === 'uruk',
        hitFlash: false,
        facingLeft: false
      });

      ctx.restore();
    }
  }

  // Export on TD namespace
  TD.ENEMY_TYPES = ENEMY_TYPES;
  TD.ENEMY_ORDER = ENEMY_ORDER;
  TD.WAVES = WAVES;
  TD.getWaveConfig = getWaveConfig;
  TD.Enemy = Enemy;
  TD.EnemyManager = EnemyManager;

})((typeof window !== 'undefined' ? window : globalThis).TD = (typeof window !== 'undefined' ? window : globalThis).TD || {});
