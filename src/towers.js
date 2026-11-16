(function(TD) {
  'use strict';

  const TWO_PI = Math.PI * 2;
  const DPS_BUCKETS = 12;
  const DPS_BUCKET_SEC = 0.25;
  const DPS_WINDOW_SEC = DPS_BUCKETS * DPS_BUCKET_SEC; // 3.0s rolling window

  TD.PRIORITIES = ['first', 'last', 'strongest', 'weakest'];
  TD.TOWER_ORDER = ['elven', 'garrison', 'dwarven', 'istari'];

  // ============================================================================
  // 1. TOWER ARCHETYPES, TIERS, BRANCHES & SKILLS METADATA
  // ============================================================================
  const TOWER_TYPES = {
    elven: {
      id: 'elven',
      key: 'elven',
      name: 'Elven Watchtower',
      role: 'Ranged Physical',
      dmgType: 'physical',
      canTargetFlying: true,
      cost: 90,
      range: 185,
      minRange: 0,
      damage: 22,
      fireRate: 1.45,
      ignoreArmorPct: 0.20,
      desc: 'Graceful silver-wood spire firing swift arrows at ground and air foes. Ignores 20% physical armor.',
      lore: 'Wrought after the fashion of Lothlorien and Rivendell, keen-eyed Firstborn archers loose silver-fletched shafts that slip between iron plates.',
      tier1: {
        tier: 1,
        name: 'Elven Watchtower',
        cost: 90,
        range: 185,
        minRange: 0,
        damage: 22,
        fireRate: 1.45,
        ignoreArmorPct: 0.20,
        desc: 'Fast single-target silver arrows. Targets ground & flying foes; ignores 20% physical armor.'
      },
      tier2: {
        tier: 2,
        name: 'Noldorin Watchtower',
        cost: 110,
        range: 205,
        minRange: 0,
        damage: 34,
        fireRate: 1.65,
        ignoreArmorPct: 0.20,
        desc: 'Reinforced star-wood gallery with longer reach (205), swifter draw, and heavier silver bodkins.'
      },
      branches: {
        A: {
          branch: 'A',
          key: 'A',
          id: 'A',
          tier: 3,
          name: 'Galadhrim Longbows',
          cost: 210,
          range: 275,
          minRange: 0,
          damage: 62,
          fireRate: 1.55,
          dmgType: 'physical',
          ignoreArmorPct: 0.20,
          critChance: 0.30,
          critMult: 3.0,
          bleedDps: 18,
          bleedSec: 3.0,
          desc: 'Extreme range (275), 30% critical chance for 3x damage, and passive bleed (18 DPS for 3s).',
          passiveDesc: '30% Crit (3x DMG) + Bleed (18 DPS / 3s)',
          skill: {
            id: 'starlight_piercer',
            name: 'Starlight Piercer',
            cooldown: 14,
            cd: 14,
            desc: 'Fires a radiant silver shaft at the strongest foe in range, dealing massive true/crit damage and stunning for 1.5s.'
          }
        },
        B: {
          branch: 'B',
          key: 'B',
          id: 'B',
          tier: 3,
          name: 'Mirkwood Wardens',
          cost: 200,
          range: 215,
          minRange: 0,
          damage: 38,
          fireRate: 2.20,
          dmgType: 'physical',
          ignoreArmorPct: 0.20,
          volleyCount: 3,
          desc: 'Rapid-fire woodland marksmen loosing a 3-arrow volley at up to 3 targets simultaneously.',
          passiveDesc: '3-Arrow Multi-Target Volley',
          skill: {
            id: 'woodland_pinning_volley',
            name: 'Woodland Pinning Volley',
            cooldown: 12,
            cd: 12,
            desc: 'Unleashes a 6-arrow hail across enemies in range, dealing heavy damage and slowing hit targets by 45% for 2.5s.'
          }
        }
      }
    },

    garrison: {
      id: 'garrison',
      key: 'garrison',
      name: 'Garrison of Men',
      role: 'Melee Blocker Barracks',
      dmgType: 'physical',
      canTargetFlying: false,
      cost: 100,
      range: 155,
      minRange: 0,
      damage: 14,
      fireRate: 1.0,
      soldierCount: 3,
      respawnSec: 10,
      desc: 'Spawns 3 Citadel Guards to rally on the road, physically blocking ground enemies. Respawns in 10s.',
      lore: 'Stalwart defenders of Gondor and Rohan who hold the breach with shield and spear against the tide of shadow.',
      tier1: {
        tier: 1,
        name: 'Garrison of Men',
        cost: 100,
        range: 155,
        minRange: 0,
        damage: 14,
        fireRate: 1.0,
        soldierHp: 190,
        soldierArmor: 0.15,
        soldierSpeed: 80,
        desc: 'Deploys 3 Citadel Guards (190 HP, 15% armor) that block ground foes and regenerate out of combat.'
      },
      tier2: {
        tier: 2,
        name: 'Bastion of the West',
        cost: 115,
        range: 170,
        minRange: 0,
        damage: 22,
        fireRate: 1.15,
        soldierHp: 275,
        soldierArmor: 0.28,
        soldierSpeed: 88,
        desc: 'Tempered Gondorian steel raises guard vitality (275 HP, 28% armor), melee strength, and rally radius (170).'
      },
      branches: {
        A: {
          branch: 'A',
          key: 'A',
          id: 'A',
          tier: 3,
          name: 'Tower Guard Phalanx',
          cost: 210,
          range: 175,
          minRange: 0,
          damage: 28,
          fireRate: 1.15,
          dmgType: 'physical',
          soldierHp: 420,
          soldierArmor: 0.60,
          soldierSpeed: 86,
          tauntRadius: 85,
          meleeReductPct: 0.20,
          desc: '420 HP Citadel elites with 60% physical armor and an 85px Taunt Aura pulling foes & cutting enemy melee damage by 20%.',
          passiveDesc: '420 HP, 60% Armor & 85px Taunt Aura (-20% Foe Melee DMG)',
          skill: {
            id: 'citadel_shield_wall',
            name: 'Citadel Shield Wall',
            cooldown: 16,
            cd: 16,
            desc: 'Fortifies all living guards, restoring 40% max HP and granting 90% damage reduction for 3.5s.'
          }
        },
        B: {
          branch: 'B',
          key: 'B',
          id: 'B',
          tier: 3,
          name: 'Knights of the Riddermark',
          cost: 220,
          range: 190,
          minRange: 0,
          damage: 35,
          fireRate: 1.25,
          dmgType: 'physical',
          soldierHp: 315,
          soldierArmor: 0.32,
          soldierSpeed: 135,
          chargeMult: 2.5,
          cleaveRadius: 48,
          desc: 'Mounted Rohirrim lancers with swift movement (135), 2.5x charge strike on new foes, and 48px cleave splash.',
          passiveDesc: '2.5x Lance Charge Bonus + 48px Cleave Attacks',
          skill: {
            id: 'forth_eorlingas',
            name: 'Forth Eorlingas!',
            cooldown: 15,
            cd: 15,
            desc: 'Lancers surge through nearby ground enemies, dealing heavy trample damage and stunning for 0.8s.'
          }
        }
      }
    },

    dwarven: {
      id: 'dwarven',
      key: 'dwarven',
      name: 'Dwarven Siege Foundry',
      role: 'AoE Artillery',
      dmgType: 'physical',
      canTargetFlying: false,
      cost: 125,
      range: 215,
      minRange: 75,
      damage: 58,
      fireRate: 0.52,
      splashRadius: 65,
      desc: 'Heavy Khazad catapult hurling explosive boulders (65px splash). Cannot fire inside 75px deadzone.',
      lore: 'Forged in the deep halls of Erebor and the Iron Hills, Dwarven engines shatter packed formations from afar.',
      tier1: {
        tier: 1,
        name: 'Dwarven Siege Foundry',
        cost: 125,
        range: 215,
        minRange: 75,
        damage: 58,
        fireRate: 0.52,
        splashRadius: 65,
        desc: 'Ballistic boulders dealing 65px splash physical damage to ground packs. Minimum range: 75.'
      },
      tier2: {
        tier: 2,
        name: 'Khazad Great Catapult',
        cost: 140,
        range: 240,
        minRange: 75,
        damage: 88,
        fireRate: 0.60,
        splashRadius: 78,
        desc: 'Counterweighted iron arm extends range (240) and blast radius (78px) with heavier explosive payloads.'
      },
      branches: {
        A: {
          branch: 'A',
          key: 'A',
          id: 'A',
          tier: 3,
          name: 'Iron Hills Mortar',
          cost: 240,
          range: 255,
          minRange: 75,
          damage: 118,
          fireRate: 0.62,
          dmgType: 'physical',
          splashRadius: 105,
          isFire: true,
          oilDuration: 4.5,
          oilDps: 36,
          desc: 'Massive 105px blast leaving burning oil patches for 4.5s (fire DoT that suppresses Olog-hai Troll regen).',
          passiveDesc: '105px Blast + 4.5s Burning Oil (Suppresses Troll Regen)',
          skill: {
            id: 'dragonfire_barrage',
            name: 'Dragonfire Barrage',
            cooldown: 18,
            cd: 18,
            desc: 'Launches 3 incendiary mortar shells across enemies in range, igniting burning oil zones for 4.5s.'
          }
        },
        B: {
          branch: 'B',
          key: 'B',
          id: 'B',
          tier: 3,
          name: 'Khazad Ballista',
          cost: 230,
          range: 265,
          minRange: 55,
          damage: 112,
          fireRate: 0.85,
          dmgType: 'physical',
          shredArmorPct: 0.50,
          pierce: true,
          desc: 'High-velocity iron siege bolt piercing straight through ground lines and permanently shredding 50% physical armor.',
          passiveDesc: 'Linear Pierce + Permanent 50% Physical Armor Shred',
          skill: {
            id: 'mithril_skewer',
            name: 'Mithril Skewer',
            cooldown: 15,
            cd: 15,
            desc: 'Fires an overcharged rune-forged bolt piercing the entire line for guaranteed 2x damage and heavy pushback.'
          }
        }
      }
    },

    istari: {
      id: 'istari',
      key: 'istari',
      name: 'Istari Spire',
      role: 'Arcane Magic',
      dmgType: 'magic',
      canTargetFlying: true,
      cost: 115,
      range: 175,
      minRange: 0,
      damage: 30,
      fireRate: 1.05,
      slowPct: 0.20,
      slowSec: 2.5,
      revealSec: 4.0,
      desc: 'Pure magic bolts bypassing armor, slowing by 20% (2.5s), and revealing Shadow Wraiths in range & for 4s on hit.',
      lore: 'Sanctums of ancient lore channeling the White Council light to pierce Morgul-veil and heavy plate alike.',
      tier1: {
        tier: 1,
        name: 'Istari Spire',
        cost: 115,
        range: 175,
        minRange: 0,
        damage: 30,
        fireRate: 1.05,
        slowPct: 0.20,
        slowSec: 2.5,
        revealSec: 4.0,
        desc: 'Arcane bolts deal pure Magic damage, apply 20% slow for 2.5s, and reveal Shadow Wraiths.'
      },
      tier2: {
        tier: 2,
        name: 'White Council Conclave',
        cost: 135,
        range: 195,
        minRange: 0,
        damage: 46,
        fireRate: 1.20,
        slowPct: 0.20,
        slowSec: 2.5,
        revealSec: 4.0,
        desc: 'Amplified crystal focus boosts magic output, cast rate, and True Sight aura radius (195).'
      },
      branches: {
        A: {
          branch: 'A',
          key: 'A',
          id: 'A',
          tier: 3,
          name: 'Flame of Anor',
          cost: 245,
          range: 215,
          minRange: 0,
          damage: 16,
          fireRate: 5.0,
          dmgType: 'magic',
          isFire: true,
          isBeam: true,
          rampMaxMult: 3.5,
          rampDuration: 4.0,
          desc: 'Continuous fiery-arcane beam that ramps smoothly from 1.0x up to 3.5x DPS over 4s on heavy targets & bosses.',
          passiveDesc: 'Continuous Fire/Magic Beam (1.0x -> 3.5x DPS Ramp over 4s)',
          skill: {
            id: 'secret_fire_nova',
            name: 'Secret Fire Nova',
            cooldown: 16,
            cd: 16,
            desc: 'Erupts a blinding 95px white-gold shockwave at the beam target, dealing heavy magic/fire damage and stunning for 1.5s.'
          }
        },
        B: {
          branch: 'B',
          key: 'B',
          id: 'B',
          tier: 3,
          name: 'Stormcaller Council',
          cost: 235,
          range: 210,
          minRange: 0,
          damage: 58,
          fireRate: 1.15,
          dmgType: 'magic',
          chainCount: 5,
          chainRange: 115,
          chainFalloff: 0.15,
          pushbackChance: 0.25,
          pushbackPx: 32,
          desc: 'Chain lightning bouncing up to 5 foes (115px hop, 15% falloff) with a 25% chance per hit to push enemies back 32px.',
          passiveDesc: '5-Target Chain Lightning + 25% Knockback Chance',
          skill: {
            id: 'tempest_of_manwe',
            name: 'Tempest of Manw\u00eb',
            cooldown: 16,
            cd: 16,
            desc: 'Strikes up to 4 strongest enemies in range with sky lightning bolts and guaranteed path knockback.'
          }
        }
      }
    }
  };

  // Populate convenience aliases on TD.TOWER_TYPES so UI/Codex/Verifier access works regardless of property alias
  for (let i = 0; i < TD.TOWER_ORDER.length; i++) {
    const k = TD.TOWER_ORDER[i];
    const def = TOWER_TYPES[k];
    def.description = def.desc;
    def.summary = def.desc;
    def.t1 = def.tier1;
    def.t2 = def.tier2;
    def.tier1.description = def.tier1.desc;
    def.tier2.description = def.tier2.desc;
    def.tiers = { 1: def.tier1, 2: def.tier2 };
    def.branches.A.description = def.branches.A.desc;
    def.branches.A.skill.description = def.branches.A.skill.desc;
    def.branches.B.description = def.branches.B.desc;
    def.branches.B.skill.description = def.branches.B.skill.desc;
  }

  TD.TOWER_TYPES = TOWER_TYPES;

  // ============================================================================
  // 2. INTERNAL HELPERS & SAFE CROSS-MODULE BRIDGES
  // ============================================================================
  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function makeFallbackPool(createFn, resetFn, initialSize) {
    if (typeof TD.Pool === 'function') {
      return new TD.Pool(createFn, resetFn, initialSize);
    }
    const free = [];
    for (let i = 0; i < (initialSize || 32); i++) free.push(createFn());
    return {
      acquire() {
        const obj = free.length > 0 ? free.pop() : createFn();
        if (resetFn) resetFn(obj);
        return obj;
      },
      release(obj) {
        if (resetFn) resetFn(obj);
        free.push(obj);
      },
      clear() {
        free.length = 0;
      }
    };
  }

  // Scratch buffers for zero-GC spatial queries without shared-buffer aliasing
  const _queryBufPrimary = [];
  const _queryBufSecondary = [];
  const _queryBufSkill = [];

  function queryEnemiesInCircle(game, x, y, radius, outBuf) {
    const out = outBuf || _queryBufPrimary;
    out.length = 0;
    if (!game) return out;
    const r2 = radius * radius;

    if (game.spatialGrid && typeof game.spatialGrid.queryCircle === 'function') {
      const raw = game.spatialGrid.queryCircle(x, y, radius);
      if (raw && raw.length) {
        for (let i = 0; i < raw.length; i++) {
          const e = raw[i];
          if (!e || e.dead || e.reachedExit || e.hp <= 0) continue;
          const dx = e.x - x;
          const dy = e.y - y;
          if (dx * dx + dy * dy <= r2) out.push(e);
        }
        return out;
      }
    }

    const list = game.enemies && game.enemies.active;
    if (list && list.length) {
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e || e.dead || e.reachedExit || e.hp <= 0) continue;
        const dx = e.x - x;
        const dy = e.y - y;
        if (dx * dx + dy * dy <= r2) out.push(e);
      }
    }
    return out;
  }

  // Auto-detects whether enemy.applySlow expects reduction fraction (0.20 = 20% slow)
  // or speed multiplier (0.80 = 20% slow), caching result for zero runtime overhead.
  let _slowConventionMode = 0; // 0 = unknown, 1 = reduction (0.20), 2 = multiplier (0.80)
  function applyEnemySlow(enemy, slowReductionPct, sec) {
    if (!enemy || enemy.dead || typeof enemy.applySlow !== 'function') return;
    if (_slowConventionMode === 0) {
      const src = Function.prototype.toString.call(enemy.applySlow);
      if (src.indexOf('Math.min') !== -1 || (enemy.slowTimer <= 0 && enemy.slowFactor === 1)) {
        _slowConventionMode = 2;
      } else {
        _slowConventionMode = 1;
      }
    }
    const arg = _slowConventionMode === 2 ? clamp(1 - slowReductionPct, 0.1, 1) : slowReductionPct;
    enemy.applySlow(arg, sec);
  }

  function revealEnemy(enemy, sec) {
    if (!enemy || enemy.dead) return;
    if (typeof enemy.reveal === 'function') {
      enemy.reveal(sec);
    } else if (typeof enemy.revealedTimer === 'number') {
      enemy.revealedTimer = Math.max(enemy.revealedTimer, sec);
    }
  }

  function stunEnemy(enemy, sec) {
    if (!enemy || enemy.dead) return;
    if (typeof enemy.applyStun === 'function') {
      enemy.applyStun(sec);
    } else if (typeof enemy.stunTimer === 'number') {
      enemy.stunTimer = Math.max(enemy.stunTimer, sec);
    }
  }

  function dealEnemyDamage(tower, enemy, amount, dmgType, opts, game) {
    if (!enemy || enemy.dead || enemy.reachedExit || enemy.hp <= 0) return 0;
    const wasAlive = !enemy.dead && enemy.hp > 0;
    const hpBefore = enemy.hp;

    let dealt = 0;
    if (typeof enemy.takeDamage === 'function') {
      const res = enemy.takeDamage(amount, dmgType, opts || {}, game);
      dealt = (typeof res === 'number' && !Number.isNaN(res))
        ? res
        : Math.max(0, hpBefore - Math.max(0, enemy.hp));
    } else {
      enemy.hp = Math.max(0, enemy.hp - amount);
      dealt = hpBefore - enemy.hp;
      if (enemy.hp <= 0) enemy.dead = true;
    }

    if (dealt > 0 && game && game.stats && typeof game.stats.damageDealt === 'number') {
      game.stats.damageDealt += dealt;
    }

    if (tower && dealt > 0) {
      tower.recordDamage(dealt);
    }
    if (tower && wasAlive && (enemy.dead || enemy.hp <= 0)) {
      tower.kills += 1;
    }
    return dealt;
  }

  function trySpendGold(game, cost) {
    if (!game) return true;
    if (typeof game.spendGold === 'function') {
      return game.spendGold(cost) !== false;
    }
    if (typeof game.gold === 'number') {
      if (game.gold < cost) return false;
      game.gold -= cost;
      return true;
    }
    return true;
  }

  function refundGold(game, amount, x, y) {
    if (!game || amount <= 0) return;
    if (typeof game.addGold === 'function') {
      game.addGold(amount, x, y, false);
    } else if (typeof game.gold === 'number') {
      game.gold += amount;
    }
  }

  function extractLaneWaypoints(lane) {
    if (Array.isArray(lane)) return lane;
    if (lane && Array.isArray(lane.waypoints)) return lane.waypoints;
    if (lane && Array.isArray(lane.points)) return lane.points;
    return null;
  }

  function findNearestGroundPathPoint(map, x, y, maxRange) {
    let bestX = x;
    let bestY = y + 52;
    let bestD2 = Infinity;
    let foundInRange = false;
    const rangeSq = maxRange * maxRange;

    const paths = map && map.paths;
    if (Array.isArray(paths) && paths.length > 0) {
      // Pass 1: find closest point on ground path that lies within maxRange
      for (let li = 0; li < paths.length; li++) {
        const pts = extractLaneWaypoints(paths[li]);
        if (!pts || pts.length < 2) continue;
        for (let si = 0; si < pts.length - 1; si++) {
          const ax = pts[si].x, ay = pts[si].y;
          const bx = pts[si + 1].x, by = pts[si + 1].y;
          const abx = bx - ax, aby = by - ay;
          const len2 = abx * abx + aby * aby;
          const t = len2 > 0 ? clamp(((x - ax) * abx + (y - ay) * aby) / len2, 0, 1) : 0;
          const px = ax + abx * t;
          const py = ay + aby * t;
          const dx = px - x;
          const dy = py - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) {
            bestD2 = d2;
            bestX = px;
            bestY = py;
            if (d2 <= rangeSq) foundInRange = true;
          }
        }
      }
    } else if (TD.MapUtils && typeof TD.MapUtils.getNearestPathPoint === 'function' && map) {
      const np = TD.MapUtils.getNearestPathPoint(map, x, y);
      if (np && typeof np.x === 'number') {
        bestX = np.x;
        bestY = np.y;
        foundInRange = true;
      }
    } else if (map && typeof map.getNearestPathPoint === 'function') {
      const np = map.getNearestPathPoint(x, y);
      if (np && typeof np.x === 'number') {
        bestX = np.x;
        bestY = np.y;
        foundInRange = true;
      }
    }

    // Clamp to maxRange circle around (x, y)
    const dx = bestX - x;
    const dy = bestY - y;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRange && dist > 0.001) {
      const s = (maxRange - 4) / dist;
      bestX = x + dx * s;
      bestY = y + dy * s;
    } else if (!foundInRange && bestD2 === Infinity) {
      bestX = x;
      bestY = clamp(y + Math.min(60, maxRange * 0.5), 72, 665);
    }

    return {
      x: clamp(bestX, 36, 1244),
      y: clamp(bestY, 68, 684)
    };
  }

  function findPathPointInBand(map, x, y, minRange, maxRange) {
    const paths = map && map.paths;
    const midR = (minRange + maxRange) * 0.5;
    let bestX = clamp(x + midR * 0.7, 50, 1230);
    let bestY = clamp(y, 75, 665);
    let bestScore = Infinity;

    if (Array.isArray(paths)) {
      for (let li = 0; li < paths.length; li++) {
        const pts = extractLaneWaypoints(paths[li]);
        if (!pts || pts.length < 2) continue;
        for (let si = 0; si < pts.length - 1; si++) {
          const ax = pts[si].x, ay = pts[si].y;
          const bx = pts[si + 1].x, by = pts[si + 1].y;
          for (let step = 0; step <= 4; step++) {
            const t = step / 4;
            const px = ax + (bx - ax) * t;
            const py = ay + (by - ay) * t;
            const d = Math.hypot(px - x, py - y);
            if (d >= minRange && d <= maxRange) {
              const score = Math.abs(d - midR);
              if (score < bestScore) {
                bestScore = score;
                bestX = px;
                bestY = py;
              }
            }
          }
        }
      }
    }
    return { x: bestX, y: bestY };
  }

  function compareByPriority(a, b, priority) {
    if (priority === 'last') {
      return (a.progress || 0) - (b.progress || 0);
    }
    if (priority === 'strongest') {
      if (b.hp !== a.hp) return b.hp - a.hp;
      return (b.progress || 0) - (a.progress || 0);
    }
    if (priority === 'weakest') {
      if (a.hp !== b.hp) return a.hp - b.hp;
      return (b.progress || 0) - (a.progress || 0);
    }
    // 'first' (default)
    return (b.progress || 0) - (a.progress || 0);
  }

  // ============================================================================
  // 3. GARRISON SOLDIER (CITADEL GUARDS / PHALANX / RIDDERMARK KNIGHTS)
  // ============================================================================
  const FORMATION_ANGLES = [-Math.PI * 0.5, Math.PI * 0.17, Math.PI * 0.83];

  class Soldier {
    constructor(tower, slotIndex) {
      this.id = tower.id * 10 + slotIndex;
      this.tower = tower;
      this.towerId = tower.id;
      this.slotIndex = slotIndex;
      this.radius = 10;

      this.maxHp = 190;
      this._hp = 190;
      this.physArmor = 0.15;
      this.armor = 0.15;
      this.moveSpeed = 80;
      this.damage = 14;
      this.fireRate = 1.0;

      const home = this.getSlotPosition();
      this.x = home.x;
      this.y = home.y;
      this.facing = 1;

      this.dead = false;
      this.respawnTimer = 0;
      this.engagedEnemy = null;
      this.attackCooldown = slotIndex * 0.2;
      this.attackAnim = 0;
      this.walkPhase = slotIndex * 2.1;
      this.outOfCombatTimer = 0;

      // Branch A (Phalanx) state
      this.shieldWallTimer = 0;
      this.tauntPulseTimer = slotIndex * 0.8;

      // Branch B (Knights) state
      this.chargeReady = true;
      this.distMovedSinceHit = 30;
      this.surgeAnimTimer = 0;

      // Warg leap grace so a guard doesn't re-grab a leaping Warg mid-air
      this._ignoreEnemy = null;
      this._ignoreTimer = 0;

      this.syncStatsFromTower(false);
      this._hp = this.maxHp;
    }

    get alive() {
      return !this.dead && this._hp > 0;
    }

    get hp() {
      return this._hp;
    }

    // Smart setter so if external enemies.js writes `soldier.hp -= dmg` directly,
    // Shield Wall 90% DR, Phalanx Taunt -20% melee DR, and 10s death/respawn still trigger cleanly!
    set hp(val) {
      if (this.dead) {
        this._hp = 0;
        return;
      }
      if (val >= this._hp) {
        this._hp = Math.min(this.maxHp, val);
        return;
      }
      let incoming = this._hp - val;
      if (this.tower.tier === 3 && this.tower.branch === 'A') {
        incoming *= 0.80; // Phalanx Taunt Aura reduces enemy melee damage by 20%
      }
      if (this.shieldWallTimer > 0) {
        incoming *= 0.10; // Citadel Shield Wall 90% damage reduction
      }
      this.outOfCombatTimer = 0;
      this._hp = Math.max(0, this._hp - incoming);
      if (this._hp <= 0) {
        this.die(null);
      }
    }

    takeDamage(rawAmount, attacker, game) {
      if (this.dead || rawAmount <= 0) return 0;
      let dmg = rawAmount * (1 - clamp(this.physArmor, 0, 0.85));
      if (!attacker && this.tower.tier === 3 && this.tower.branch === 'A') {
        dmg *= 0.80; // -20% enemy melee damage when called without pre-mitigated attacker
      }
      if (this.shieldWallTimer > 0) {
        dmg *= 0.10; // 90% DR during Citadel Shield Wall
      }
      dmg = Math.max(0.5, dmg);
      this.outOfCombatTimer = 0;
      this._hp = Math.max(0, this._hp - dmg);
      if (game && game.vfx && game.vfx.spawnBurst && Math.random() < 0.45) {
        game.vfx.spawnBurst(this.x, this.y - 4, {
          color: this.shieldWallTimer > 0 ? '#ffd54f' : '#cfd8dc',
          count: 3,
          speed: 45,
          spread: Math.PI,
          life: 0.22,
          size: 2,
          kind: 'spark'
        });
      }
      if (this._hp <= 0) {
        this.die(game);
      }
      return dmg;
    }

    die(game) {
      if (this.dead) return;
      this.dead = true;
      this._hp = 0;
      this.respawnTimer = 10.0;
      this.shieldWallTimer = 0;
      if (this.engagedEnemy) {
        if (this.engagedEnemy.blockedBy === this) {
          this.engagedEnemy.blockedBy = null;
        }
        this.engagedEnemy = null;
      }
      if (game && game.vfx && game.vfx.spawnBurst) {
        game.vfx.spawnBurst(this.x, this.y, {
          color: '#90a4ae',
          count: 6,
          speed: 55,
          spread: TWO_PI,
          life: 0.35,
          size: 2.5,
          kind: 'smoke'
        });
      }
    }

    respawnInstant() {
      this.dead = false;
      this.respawnTimer = 0;
      this._hp = this.maxHp;
      this.outOfCombatTimer = 0;
      this.chargeReady = true;
      this.distMovedSinceHit = 30;
      const slot = this.getSlotPosition();
      this.x = slot.x;
      this.y = slot.y;
      this.tower.gateOpenTimer = Math.max(this.tower.gateOpenTimer, 1.0);
    }

    syncStatsFromTower(healDelta) {
      const prevMax = this.maxHp;
      const def = TOWER_TYPES.garrison;
      let src = def.tier1;
      if (this.tower.tier === 2) src = def.tier2;
      else if (this.tower.tier === 3 && this.tower.branch) src = def.branches[this.tower.branch];

      this.maxHp = src.soldierHp || 190;
      this.physArmor = src.soldierArmor || 0.15;
      this.armor = this.physArmor;
      this.moveSpeed = src.soldierSpeed || 80;
      this.damage = this.tower.damage;
      this.fireRate = this.tower.fireRate;

      if (!this.dead && healDelta) {
        const gain = Math.max(0, this.maxHp - prevMax);
        this._hp = Math.min(this.maxHp, this._hp + gain + this.maxHp * 0.35);
      }
    }

    getSlotPosition() {
      const rp = this.tower.rallyPoint || { x: this.tower.x, y: this.tower.y + 52 };
      const ang = FORMATION_ANGLES[this.slotIndex % 3];
      const spread = (this.tower.tier === 3 && this.tower.branch === 'B') ? 17 : 13;
      return {
        x: rp.x + Math.cos(ang) * spread,
        y: rp.y + Math.sin(ang) * (spread * 0.72)
      };
    }

    releaseEngagement() {
      if (this.engagedEnemy) {
        if (this.engagedEnemy.blockedBy === this) {
          this.engagedEnemy.blockedBy = null;
        }
        this.engagedEnemy = null;
      }
      this.chargeReady = true;
    }

    update(dt, game, candidates) {
      if (this._ignoreTimer > 0) {
        this._ignoreTimer = Math.max(0, this._ignoreTimer - dt);
        if (this._ignoreTimer <= 0) this._ignoreEnemy = null;
      }
      if (this.shieldWallTimer > 0) {
        this.shieldWallTimer = Math.max(0, this.shieldWallTimer - dt);
      }
      if (this.attackAnim > 0) {
        this.attackAnim = Math.max(0, this.attackAnim - dt * 3.5);
      }
      if (this.surgeAnimTimer > 0) {
        this.surgeAnimTimer = Math.max(0, this.surgeAnimTimer - dt);
      }

      // Respawn timer (10s after death)
      if (this.dead) {
        if (this.tower.stunTimer <= 0) {
          this.respawnTimer -= dt;
        }
        if (this.respawnTimer <= 0) {
          this.dead = false;
          this.respawnTimer = 0;
          this._hp = this.maxHp;
          this.x = this.tower.x;
          this.y = this.tower.y + 14;
          this.chargeReady = true;
          this.distMovedSinceHit = 30;
          this.tower.gateOpenTimer = Math.max(this.tower.gateOpenTimer, 1.1);
        }
        return;
      }

      const isPhalanx = this.tower.tier === 3 && this.tower.branch === 'A';
      const isKnight = this.tower.tier === 3 && this.tower.branch === 'B';
      const rp = this.tower.rallyPoint;
      const interceptRadius = isPhalanx ? 85 : (isKnight ? 68 : 54);

      // Validate current engaged enemy
      if (this.engagedEnemy) {
        const e = this.engagedEnemy;
        if (e.dead || e.reachedExit || e.hp <= 0 || e.flying) {
          if (e.blockedBy === this) e.blockedBy = null;
          this.engagedEnemy = null;
          this.chargeReady = true;
        } else if (e.blockedBy !== this) {
          // Enemy broke block (e.g., Warg Rider leap!) -> give grace window so Warg clears cleanly
          this.engagedEnemy = null;
          this._ignoreEnemy = e;
          this._ignoreTimer = 1.1;
          this.chargeReady = true;
        } else {
          // Check leash from rallyPoint so enemies far outside rally are released if rally moved
          const distFromRally = Math.hypot(e.x - rp.x, e.y - rp.y);
          if (distFromRally > interceptRadius + 46) {
            e.blockedBy = null;
            this.engagedEnemy = null;
            this.chargeReady = true;
          }
        }
      }

      // Phalanx 85px Taunt Aura: debuff nearby ground enemies (-20% melee dmg) & pull unblocked foes
      if (isPhalanx && candidates && candidates.length) {
        this.tauntPulseTimer -= dt;
        let pulsed = false;
        for (let i = 0; i < candidates.length; i++) {
          const ce = candidates[i];
          if (ce.flying || ce.dead || ce.reachedExit) continue;
          const d = Math.hypot(ce.x - this.x, ce.y - this.y);
          if (d <= 85) {
            ce.tauntDebuffTimer = 0.5;
            ce.meleeDamageMult = 0.80;
            pulsed = true;
          }
        }
        if (pulsed && this.tauntPulseTimer <= 0) {
          this.tauntPulseTimer = 2.4;
          if (game && game.vfx && game.vfx.spawnShockwave) {
            game.vfx.spawnShockwave(this.x, this.y, 85, 'rgba(240, 210, 122, 0.45)', 0.38);
          }
        }
      }

      // Acquire unblocked ground enemy near rallyPoint (or within Phalanx 85px taunt radius)
      if (!this.engagedEnemy && candidates && candidates.length) {
        let best = null;
        let bestProg = -1;
        for (let i = 0; i < candidates.length; i++) {
          const e = candidates[i];
          if (e.flying || e.dead || e.reachedExit || e.hp <= 0) continue;
          if (typeof e.canBeBlocked === 'function' && !e.canBeBlocked()) continue;
          if (e.unblockable || e.leaping || e.isLeaping || (e.leapTimer && e.leapTimer > 0) || (e.unblockableTimer && e.unblockableTimer > 0)) continue;
          if (e === this._ignoreEnemy && this._ignoreTimer > 0) continue;
          if (e.blockedBy && !e.blockedBy.dead && e.blockedBy !== this) continue;

          const dRally = Math.hypot(e.x - rp.x, e.y - rp.y);
          const dSelf = Math.hypot(e.x - this.x, e.y - this.y);
          if (dRally <= interceptRadius || (isPhalanx && dSelf <= 85)) {
            const p = e.progress || 0;
            if (p > bestProg) {
              bestProg = p;
              best = e;
            }
          }
        }

        if (best) {
          if (typeof best.tryBlock === 'function') {
            const ok = best.tryBlock(this, game);
            if (ok === false) {
              this._ignoreEnemy = best;
              this._ignoreTimer = 1.1;
              best = null;
            }
          }
          if (best) {
            best.blockedBy = this;
            this.engagedEnemy = best;
            this.outOfCombatTimer = 0;
          }
        }
      }

      this.attackCooldown = Math.max(0, this.attackCooldown - dt);

      // Movement & Melee Combat
      if (this.engagedEnemy) {
        const target = this.engagedEnemy;
        const standX = target.x + (this.x >= target.x ? 14 : -14);
        const standY = target.y + (this.slotIndex - 1) * 4;
        const dx = standX - this.x;
        const dy = standY - this.y;
        const distToStand = Math.hypot(dx, dy);
        this.facing = target.x >= this.x ? 1 : -1;

        const distToEnemy = Math.hypot(target.x - this.x, target.y - this.y);
        if (distToStand > 3 && distToEnemy > 20) {
          const step = Math.min(distToStand, this.moveSpeed * dt);
          this.x += (dx / distToStand) * step;
          this.y += (dy / distToStand) * step;
          this.distMovedSinceHit += step;
          this.walkPhase += dt * (isKnight ? 12 : 8);
          if (this.distMovedSinceHit >= 18) this.chargeReady = true;
        }

        // Strike when within melee reach
        if (distToEnemy <= 30 && this.attackCooldown <= 0 && this.tower.stunTimer <= 0) {
          const effRate = this.fireRate * (game && game.ringActive ? 1.4 : 1.0);
          this.attackCooldown = 1 / Math.max(0.25, effRate);
          this.attackAnim = 1.0;
          this.outOfCombatTimer = 0;

          let strikeDmg = this.damage;
          let isChargeHit = false;
          if (isKnight && (this.chargeReady || this.distMovedSinceHit >= 18)) {
            strikeDmg = Math.round(this.damage * 2.5);
            isChargeHit = true;
            this.chargeReady = false;
            this.distMovedSinceHit = 0;
          }

          dealEnemyDamage(this.tower, target, strikeDmg, 'physical', {
            isCrit: isChargeHit
          }, game);

          if (isChargeHit && game && game.vfx) {
            if (game.vfx.spawnFloatingText) {
              game.vfx.spawnFloatingText(target.x, target.y - 20, 'CHARGE!', '#ffd54f', 0.95);
            }
            if (game.vfx.spawnBurst) {
              game.vfx.spawnBurst(target.x, target.y, {
                color: '#ffe082',
                count: 8,
                speed: 95,
                spread: 1.4,
                angle: this.facing > 0 ? 0 : Math.PI,
                life: 0.3,
                size: 3,
                kind: 'spark'
              });
            }
          }

          // Knights of the Riddermark 48px Cleave Splash
          if (isKnight) {
            const nearby = queryEnemiesInCircle(game, target.x, target.y, 48, _queryBufSecondary);
            const cleaveDmg = Math.round(this.damage * 0.60);
            for (let k = 0; k < nearby.length; k++) {
              const other = nearby[k];
              if (other === target || other.flying) continue;
              dealEnemyDamage(this.tower, other, cleaveDmg, 'physical', {}, game);
            }
          }

          if (game && game.sound && game.sound.playSwordClash) {
            game.sound.playSwordClash();
          }
        }
      } else {
        // Walk back to rally formation slot & regenerate HP out of combat
        const slot = this.getSlotPosition();
        const dx = slot.x - this.x;
        const dy = slot.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d > 2) {
          this.facing = dx >= 0 ? 1 : -1;
          const step = Math.min(d, this.moveSpeed * dt);
          this.x += (dx / d) * step;
          this.y += (dy / d) * step;
          this.distMovedSinceHit += step;
          this.walkPhase += dt * (isKnight ? 11 : 7.5);
          if (this.distMovedSinceHit >= 18) this.chargeReady = true;
        }

        this.outOfCombatTimer += dt;
        if (this.outOfCombatTimer >= 2.2 && this._hp < this.maxHp) {
          this._hp = Math.min(this.maxHp, this._hp + this.maxHp * 0.085 * dt);
        }
      }
    }

    render(ctx, time) {
      if (this.dead) return;
      const isPhalanx = this.tower.tier === 3 && this.tower.branch === 'A';
      const isKnight = this.tower.tier === 3 && this.tower.branch === 'B';
      const bob = Math.sin(this.walkPhase) * 1.3;
      const swing = Math.sin(this.attackAnim * Math.PI) * 5 * this.facing;

      ctx.save();
      ctx.translate(this.x, this.y);

      // Ground shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 5, isKnight ? 11 : 7.5, isKnight ? 4.5 : 3.2, 0, 0, TWO_PI);
      ctx.fill();

      // Citadel Shield Wall golden protection ring
      if (this.shieldWallTimer > 0) {
        const pulse = 0.75 + 0.25 * Math.sin(time * 10);
        ctx.strokeStyle = `rgba(255, 215, 90, ${0.85 * pulse})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, -3, 13, 0, TWO_PI);
        ctx.stroke();
        ctx.fillStyle = `rgba(255, 224, 130, ${0.18 * pulse})`;
        ctx.fill();
      }

      ctx.save();
      ctx.scale(this.facing, 1);

      if (isKnight) {
        // Mounted Rohirrim Lancer
        // Warhorse body
        ctx.fillStyle = this.slotIndex === 0 ? '#8d5531' : (this.slotIndex === 1 ? '#6d4c41' : '#d7ccc8');
        ctx.beginPath();
        ctx.ellipse(-1, -2 + bob * 0.6, 9.5, 5, 0, 0, TWO_PI);
        ctx.fill();
        // Horse head & neck
        ctx.beginPath();
        ctx.moveTo(5, -4 + bob * 0.6);
        ctx.lineTo(10, -10 + bob * 0.6);
        ctx.lineTo(13, -7 + bob * 0.6);
        ctx.lineTo(8, -1 + bob * 0.6);
        ctx.closePath();
        ctx.fill();
        // Flowing golden/flaxen mane
        ctx.strokeStyle = '#f0d27a';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(5, -5 + bob * 0.6);
        ctx.lineTo(9.5, -10 + bob * 0.6);
        ctx.stroke();
        // Green Rohan cloak & rider torso
        ctx.fillStyle = '#2e6b3e';
        ctx.fillRect(-4, -12 + bob, 6.5, 8);
        // Golden Rohirrim helm
        ctx.fillStyle = '#e6c15a';
        ctx.beginPath();
        ctx.arc(-0.5, -14 + bob, 3.6, 0, TWO_PI);
        ctx.fill();
        // Couched lance + pennant
        const thrust = Math.sin(this.attackAnim * Math.PI) * 7;
        ctx.strokeStyle = '#cfd8dc';
        ctx.lineWidth = 1.9;
        ctx.beginPath();
        ctx.moveTo(-3 + thrust, -9 + bob);
        ctx.lineTo(16 + thrust, -10 + bob);
        ctx.stroke();
        ctx.fillStyle = '#2e6b3e';
        ctx.beginPath();
        ctx.moveTo(10 + thrust, -10 + bob);
        ctx.lineTo(6 + thrust, -6.5 + bob);
        ctx.lineTo(6 + thrust, -10 + bob);
        ctx.closePath();
        ctx.fill();
      } else {
        // Gondorian Citadel Guard / Tower Guard Phalanx
        // Cloak
        ctx.fillStyle = isPhalanx ? '#1c2636' : '#2f3846';
        ctx.fillRect(-4.5, -9 + bob, 5, 10);
        // Silver-steel breastplate
        ctx.fillStyle = isPhalanx ? '#dce6f0' : '#b0bec5';
        ctx.fillRect(-3, -10 + bob, 6.5, 8.5);
        // Gondorian helm + wings on T2/Phalanx
        ctx.fillStyle = '#cfd8dc';
        ctx.beginPath();
        ctx.arc(0, -12.5 + bob, 3.6, 0, TWO_PI);
        ctx.fill();
        if (this.tower.tier >= 2) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(-3.5, -13 + bob);
          ctx.lineTo(-5.5, -16 + bob);
          ctx.moveTo(3.5, -13 + bob);
          ctx.lineTo(5.5, -16 + bob);
          ctx.stroke();
        }
        // Weapon (spear for Phalanx, longsword for Guards)
        ctx.strokeStyle = '#eceff1';
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        if (isPhalanx) {
          const jab = Math.sin(this.attackAnim * Math.PI) * 6;
          ctx.moveTo(-2 + jab, -7 + bob);
          ctx.lineTo(13 + jab, -9 + bob);
        } else {
          ctx.moveTo(2, -7 + bob);
          ctx.lineTo(9 + swing * 0.5, -13 + bob + Math.abs(swing) * 0.4);
        }
        ctx.stroke();

        // Shield (tall Gondorian tower shield for Phalanx, heater shield for T1/T2)
        if (isPhalanx) {
          ctx.fillStyle = '#1d2733';
          ctx.strokeStyle = '#f0d27a';
          ctx.lineWidth = 1.3;
          ctx.fillRect(1.5, -11 + bob, 5.5, 12);
          ctx.strokeRect(1.5, -11 + bob, 5.5, 12);
        } else {
          ctx.fillStyle = '#37474f';
          ctx.strokeStyle = '#cfd8dc';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(1.5, -9.5 + bob, 4.8, 8.5, 1.5) : ctx.rect(1.5, -9.5 + bob, 4.8, 8.5);
          ctx.fill();
          ctx.stroke();
        }
      }

      ctx.restore();

      // Crisp mini health bar when damaged or shielded
      if (this._hp < this.maxHp * 0.99 || this.shieldWallTimer > 0) {
        const bw = 16;
        const ratio = clamp(this._hp / this.maxHp, 0, 1);
        ctx.fillStyle = 'rgba(12, 15, 20, 0.85)';
        ctx.fillRect(-bw * 0.5, -21, bw, 3);
        ctx.fillStyle = this.shieldWallTimer > 0 ? '#ffd54f' : (ratio > 0.45 ? '#66bb6a' : '#ef5350');
        ctx.fillRect(-bw * 0.5 + 0.5, -20.5, (bw - 1) * ratio, 2);
      }

      ctx.restore();
    }
  }

  // ============================================================================
  // 4. TOWER INSTANCE
  // ============================================================================
  let _nextTowerId = 1;

  class Tower {
    constructor(pad, typeKey, manager, map) {
      const def = TOWER_TYPES[typeKey];
      this.id = _nextTowerId++;
      this.padId = pad.id;
      this.type = typeKey;
      this.tier = 1;
      this.branch = null;
      this.manager = manager;

      this.x = pad.x;
      this.y = pad.y;

      this.baseName = def.name;
      this.name = def.tier1.name;
      this.dmgType = def.dmgType;
      this.canTargetFlying = def.canTargetFlying;

      this.range = def.tier1.range;
      this.minRange = def.tier1.minRange || 0;
      this.damage = def.tier1.damage;
      this.fireRate = def.tier1.fireRate;
      this.splashRadius = def.tier1.splashRadius || 0;
      this.ignoreArmorPct = def.tier1.ignoreArmorPct || 0;

      this.priority = 'first';
      this.totalInvested = def.tier1.cost;
      this.kills = 0;
      this.totalDamage = 0;

      // O(1) 3-second rolling DPS ring buffer
      this._dpsBuckets = new Float64Array(DPS_BUCKETS);
      this._dpsIdx = 0;
      this._dpsTimer = 0;
      this._activeCombatSec = 0;
      this.rollingDps = 0;
      this.liveDps = Math.round(this.damage * this.fireRate * 10) / 10;

      // Cooldowns & status
      this.cooldown = 0.15;
      this.stunTimer = 0;
      this.stunSource = null;
      this.curseClicksRemaining = 0;
      this.curseMaxClicks = 3;

      // Tier 3 Skill state
      this.skill = null;
      this.skillCooldown = 0;
      this.skillMaxCooldown = 0;

      // Animation & Beam lock state
      this.turretAngle = Math.PI * 0.5;
      this.recoilTimer = 0;
      this.muzzleFlashTimer = 0;
      this.gateOpenTimer = 0.9;
      this.beamTarget = null;
      this.beamLockTime = 0;
      this.beamRampMult = 1.0;

      // Garrison Rally Point & Soldiers
      this.rallyPoint = null;
      this.soldiers = [];
      this.guards = this.soldiers;
      if (this.type === 'garrison') {
        this.rallyPoint = findNearestGroundPathPoint(map, this.x, this.y, this.range);
        for (let i = 0; i < 3; i++) {
          this.soldiers.push(new Soldier(this, i));
        }
      }
    }

    get skillCd() {
      return this.skillCooldown;
    }

    get skillMaxCd() {
      return this.skillMaxCooldown;
    }

    get skillReady() {
      return this.tier === 3 && !!this.skill && this.skillCooldown <= 0 && this.stunTimer <= 0;
    }

    get isCursed() {
      return this.curseClicksRemaining > 0 && this.stunTimer > 0;
    }

    getEffectiveFireRate(game) {
      return this.fireRate * (game && game.ringActive ? 1.4 : 1.0);
    }

    getTheoreticalDps(game) {
      const rate = this.getEffectiveFireRate(game);
      if (this.type === 'garrison') {
        // 3 guards fighting
        return Math.round(this.damage * rate * 3 * 10) / 10;
      }
      if (this.type === 'elven' && this.tier === 3) {
        if (this.branch === 'A') {
          // Factor 30% 3x crit (= 1.6x expected) + bleed
          return Math.round((this.damage * rate * 1.6 + 18) * 10) / 10;
        }
        if (this.branch === 'B') {
          return Math.round(this.damage * rate * 3 * 10) / 10;
        }
      }
      return Math.round(this.damage * rate * 10) / 10;
    }

    recordDamage(amount) {
      if (amount <= 0) return;
      this.totalDamage += amount;
      this._dpsBuckets[this._dpsIdx] += amount;
      if (this._activeCombatSec < 0.5) this._activeCombatSec = 0.5;
    }

    getSellValue() {
      return Math.floor(this.totalInvested * 0.75);
    }

    cyclePriority() {
      const idx = TD.PRIORITIES.indexOf(this.priority);
      this.priority = TD.PRIORITIES[(idx + 1) % TD.PRIORITIES.length];
      return this.priority;
    }

    setPriority(p) {
      if (TD.PRIORITIES.indexOf(p) !== -1) {
        this.priority = p;
      }
      return this.priority;
    }

    setRallyPoint(x, y, map) {
      if (this.type !== 'garrison') return null;
      let tx = x;
      let ty = y;
      const dx = tx - this.x;
      const dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      if (d > this.range && d > 0.001) {
        tx = this.x + (dx / d) * this.range;
        ty = this.y + (dy / d) * this.range;
      }
      this.rallyPoint = {
        x: clamp(tx, 32, 1248),
        y: clamp(ty, 66, 688)
      };
      this.gateOpenTimer = Math.max(this.gateOpenTimer, 0.9);
      for (let i = 0; i < this.soldiers.length; i++) {
        const s = this.soldiers[i];
        if (!s.dead && s.engagedEnemy) {
          const ed = Math.hypot(s.engagedEnemy.x - this.rallyPoint.x, s.engagedEnemy.y - this.rallyPoint.y);
          if (ed > 72) s.releaseEngagement();
        }
      }
      return this.rallyPoint;
    }

    applyBossCurse(duration = 3.0, clicksRequired = 3) {
      this.stunTimer = Math.max(this.stunTimer, duration);
      this.curseClicksRemaining = clicksRequired;
      this.curseMaxClicks = clicksRequired;
      this.stunSource = 'boss';
      this.beamTarget = null;
      this.beamLockTime = 0;
      this.beamRampMult = 1.0;
    }

    clickCurseBreak(game) {
      if (this.curseClicksRemaining <= 0) return false;
      this.curseClicksRemaining -= 1;

      if (game && game.vfx && game.vfx.spawnBurst) {
        game.vfx.spawnBurst(this.x, this.y - 12, {
          color: '#ffd54f',
          count: 10,
          speed: 105,
          spread: TWO_PI,
          life: 0.35,
          size: 3.2,
          kind: 'spark'
        });
      }

      if (this.curseClicksRemaining <= 0) {
        this.curseClicksRemaining = 0;
        this.stunTimer = 0;
        this.stunSource = null;
        if (game && game.sound && game.sound.playCurseBreak) {
          game.sound.playCurseBreak();
        }
        if (game && game.vfx) {
          if (game.vfx.spawnShockwave) {
            game.vfx.spawnShockwave(this.x, this.y, 58, '#8be0ff', 0.4);
          }
          if (game.vfx.spawnFloatingText) {
            game.vfx.spawnFloatingText(this.x, this.y - 28, 'CURSE BROKEN!', '#8be0ff', 1.05);
          }
        }
        return true;
      }

      if (game && game.sound && game.sound.playClick) {
        game.sound.playClick();
      }
      return false;
    }

    getUpgradePreview(target) {
      const def = TOWER_TYPES[this.type];
      if (!def) return null;
      const key = String(target || '').toUpperCase();

      if (key === 'T2' || key === '2' || key === 'TIER2') {
        if (this.tier !== 1) return null;
        const u = def.tier2;
        return {
          target: 'T2',
          cost: u.cost,
          range: u.range,
          minRange: u.minRange || 0,
          damage: u.damage,
          fireRate: u.fireRate,
          name: u.name,
          desc: u.desc,
          skill: null,
          deltaRange: u.range - this.range,
          deltaDamage: u.damage - this.damage,
          deltaFireRate: +(u.fireRate - this.fireRate).toFixed(2)
        };
      }

      if (key === 'A' || key === 'B') {
        if (this.tier !== 2) return null;
        const b = def.branches[key];
        if (!b) return null;
        return {
          target: key,
          branch: key,
          cost: b.cost,
          range: b.range,
          minRange: b.minRange || 0,
          damage: b.damage,
          fireRate: b.fireRate,
          name: b.name,
          desc: b.desc,
          passiveDesc: b.passiveDesc,
          skill: b.skill,
          deltaRange: b.range - this.range,
          deltaDamage: b.damage - this.damage,
          deltaFireRate: +(b.fireRate - this.fireRate).toFixed(2)
        };
      }

      return null;
    }

    upgradeTier2(game) {
      if (this.tier !== 1) return false;
      const def = TOWER_TYPES[this.type];
      const u = def.tier2;
      if (!trySpendGold(game, u.cost)) return false;

      this.tier = 2;
      this.totalInvested += u.cost;
      this.name = u.name;
      this.range = u.range;
      this.minRange = u.minRange || 0;
      this.damage = u.damage;
      this.fireRate = u.fireRate;
      if (typeof u.splashRadius === 'number') this.splashRadius = u.splashRadius;
      if (typeof u.ignoreArmorPct === 'number') this.ignoreArmorPct = u.ignoreArmorPct;

      if (this.type === 'garrison') {
        for (let i = 0; i < this.soldiers.length; i++) {
          this.soldiers[i].syncStatsFromTower(true);
        }
      }
      this.liveDps = this.rollingDps > 0 ? this.rollingDps : this.getTheoreticalDps(game);

      if (game && game.sound && game.sound.playUpgrade) game.sound.playUpgrade();
      if (game && game.vfx) {
        if (game.vfx.spawnShockwave) game.vfx.spawnShockwave(this.x, this.y, 46, '#f0d27a', 0.4);
        if (game.vfx.spawnBurst) {
          game.vfx.spawnBurst(this.x, this.y - 8, {
            color: '#f0d27a',
            count: 12,
            speed: 80,
            spread: TWO_PI,
            life: 0.45,
            size: 3,
            kind: 'spark'
          });
        }
      }
      return true;
    }

    upgradeBranch(branchKey, game) {
      if (this.tier !== 2) return false;
      const key = String(branchKey || '').toUpperCase();
      if (key !== 'A' && key !== 'B') return false;

      const def = TOWER_TYPES[this.type];
      const b = def.branches[key];
      if (!b || !trySpendGold(game, b.cost)) return false;

      this.tier = 3;
      this.branch = key;
      this.totalInvested += b.cost;
      this.name = b.name;
      this.dmgType = b.dmgType || this.dmgType;
      this.range = b.range;
      this.minRange = typeof b.minRange === 'number' ? b.minRange : 0;
      this.damage = b.damage;
      this.fireRate = b.fireRate;
      if (typeof b.splashRadius === 'number') this.splashRadius = b.splashRadius;
      if (typeof b.ignoreArmorPct === 'number') this.ignoreArmorPct = b.ignoreArmorPct;

      this.skill = b.skill ? {
        id: b.skill.id,
        name: b.skill.name,
        cooldown: b.skill.cooldown,
        desc: b.skill.desc
      } : null;
      this.skillMaxCooldown = b.skill ? b.skill.cooldown : 0;
      this.skillCooldown = 0;

      if (this.type === 'garrison') {
        for (let i = 0; i < this.soldiers.length; i++) {
          this.soldiers[i].syncStatsFromTower(true);
        }
      }
      this.liveDps = this.rollingDps > 0 ? this.rollingDps : this.getTheoreticalDps(game);

      if (game && game.sound && game.sound.playUpgrade) game.sound.playUpgrade();
      if (game && game.vfx) {
        if (game.vfx.spawnShockwave) game.vfx.spawnShockwave(this.x, this.y, 58, '#ffd54f', 0.48);
        if (game.vfx.spawnBurst) {
          game.vfx.spawnBurst(this.x, this.y - 10, {
            color: '#ffe082',
            count: 16,
            speed: 95,
            spread: TWO_PI,
            life: 0.5,
            size: 3.5,
            kind: 'magic'
          });
        }
      }
      return true;
    }

    acquireTargets(game, maxCount, overridePriority, outBuf) {
      const raw = queryEnemiesInCircle(game, this.x, this.y, this.range, outBuf || _queryBufPrimary);
      const minR2 = this.minRange * this.minRange;
      const filtered = [];

      for (let i = 0; i < raw.length; i++) {
        const e = raw[i];
        if (!this.canTargetFlying && e.flying) continue;
        if (minR2 > 0) {
          const dx = e.x - this.x;
          const dy = e.y - this.y;
          if (dx * dx + dy * dy < minR2) continue;
        }
        filtered.push(e);
      }

      if (filtered.length > 1) {
        const prio = overridePriority || this.priority;
        filtered.sort((a, b) => compareByPriority(a, b, prio));
      }
      if (maxCount && filtered.length > maxCount) {
        filtered.length = maxCount;
      }
      return filtered;
    }

    // ========================================================================
    // TIER 3 SKILLS (Auto-cast in combat AND manually clickable in UI)
    // ========================================================================
    triggerSkill(game, isAuto = false) {
      if (this.tier !== 3 || !this.branch || !this.skill) return false;
      if (this.skillCooldown > 0 || this.stunTimer > 0) return false;

      const map = game && game.map;

      // 1. ELVEN A: Starlight Piercer (14s CD)
      if (this.type === 'elven' && this.branch === 'A') {
        const targets = this.acquireTargets(game, 1, 'strongest', _queryBufSkill);
        if (targets.length === 0 && isAuto) return false;

        this.skillCooldown = this.skillMaxCooldown;
        this.recoilTimer = 0.35;
        this.muzzleFlashTimer = 0.28;

        const tgt = targets[0] || null;
        const aimPt = tgt || findPathPointInBand(map, this.x, this.y, 0, this.range);
        this.turretAngle = Math.atan2(aimPt.y - (this.y - 20), aimPt.x - this.x);

        this.manager.spawnProjectile({
          kind: 'starlight_arrow',
          tower: this,
          x: this.x,
          y: this.y - 22,
          tx: aimPt.x,
          ty: aimPt.y,
          target: tgt,
          speed: 780,
          damage: 265,
          dmgType: 'true',
          isCrit: true,
          stunSec: 1.5,
          revealSec: 6.0,
          bleedDps: 24,
          bleedSec: 3.5,
          color: '#e0f7fa'
        });

        if (game && game.sound && game.sound.playBow) game.sound.playBow();
        if (game && game.vfx && game.vfx.spawnShockwave) {
          game.vfx.spawnShockwave(this.x, this.y - 18, 42, '#b3e5fc', 0.32);
        }
        return true;
      }

      // 2. ELVEN B: Woodland Pinning Volley (12s CD)
      if (this.type === 'elven' && this.branch === 'B') {
        const targets = this.acquireTargets(game, 6, this.priority, _queryBufSkill);
        if (targets.length === 0 && isAuto) return false;

        this.skillCooldown = this.skillMaxCooldown;
        this.recoilTimer = 0.32;
        const fallback = findPathPointInBand(map, this.x, this.y, 0, this.range);
        if (targets[0]) {
          this.turretAngle = Math.atan2(targets[0].y - (this.y - 20), targets[0].x - this.x);
        }

        for (let i = 0; i < 6; i++) {
          const tgt = targets.length > 0 ? targets[i % targets.length] : null;
          const spreadX = (i - 2.5) * 9;
          const spreadY = ((i % 2) - 0.5) * 8;
          this.manager.spawnProjectile({
            kind: 'arrow',
            tower: this,
            x: this.x + (i - 2.5) * 3,
            y: this.y - 20,
            tx: (tgt ? tgt.x : fallback.x) + (tgt ? 0 : spreadX),
            ty: (tgt ? tgt.y : fallback.y) + (tgt ? 0 : spreadY),
            target: tgt,
            speed: 580,
            damage: Math.round(this.damage * 1.45),
            dmgType: 'physical',
            ignoreArmorPct: 0.25,
            slowPct: 0.45,
            slowSec: 2.5,
            color: '#a5d6a7'
          });
        }

        if (game && game.sound && game.sound.playBow) game.sound.playBow();
        if (game && game.vfx && game.vfx.spawnFloatingText) {
          game.vfx.spawnFloatingText(this.x, this.y - 30, 'PINNING VOLLEY!', '#a5d6a7', 0.9);
        }
        return true;
      }

      // 3. GARRISON A: Citadel Shield Wall (16s CD)
      if (this.type === 'garrison' && this.branch === 'A') {
        let living = 0;
        let engagedOrHurt = 0;
        for (let i = 0; i < this.soldiers.length; i++) {
          const s = this.soldiers[i];
          if (!s.dead) {
            living++;
            if (s.engagedEnemy || s._hp < s.maxHp * 0.88) engagedOrHurt++;
          }
        }
        if (living === 0) return false;
        if (isAuto && engagedOrHurt === 0) return false;

        this.skillCooldown = this.skillMaxCooldown;
        for (let i = 0; i < this.soldiers.length; i++) {
          const s = this.soldiers[i];
          if (!s.dead) {
            s._hp = Math.min(s.maxHp, s._hp + s.maxHp * 0.40);
            s.shieldWallTimer = 3.5;
            if (game && game.vfx && game.vfx.spawnShockwave) {
              game.vfx.spawnShockwave(s.x, s.y, 36, '#ffd54f', 0.45);
            }
          }
        }
        if (game && game.sound && game.sound.playSwordClash) game.sound.playSwordClash();
        if (game && game.vfx && game.vfx.spawnFloatingText) {
          const rp = this.rallyPoint || this;
          game.vfx.spawnFloatingText(rp.x, rp.y - 26, 'SHIELD WALL!', '#ffd54f', 1.0);
        }
        return true;
      }

      // 4. GARRISON B: Forth Eorlingas! (15s CD)
      if (this.type === 'garrison' && this.branch === 'B') {
        let living = 0;
        for (let i = 0; i < this.soldiers.length; i++) {
          if (!this.soldiers[i].dead) living++;
        }
        if (living === 0 && isAuto) return false;

        const rp = this.rallyPoint || this;
        const enemiesNear = queryEnemiesInCircle(game, rp.x, rp.y, 118, _queryBufSkill);
        let groundCount = 0;
        for (let i = 0; i < enemiesNear.length; i++) {
          if (!enemiesNear[i].flying) groundCount++;
        }
        if (isAuto && groundCount === 0) return false;

        this.skillCooldown = this.skillMaxCooldown;
        for (let i = 0; i < this.soldiers.length; i++) {
          const s = this.soldiers[i];
          if (!s.dead) {
            s.surgeAnimTimer = 0.65;
            s.chargeReady = true;
            s._hp = Math.min(s.maxHp, s._hp + s.maxHp * 0.20);
          } else {
            s.respawnTimer = Math.max(0, s.respawnTimer - 3.5);
          }
        }

        for (let i = 0; i < enemiesNear.length; i++) {
          const e = enemiesNear[i];
          if (e.flying) continue;
          dealEnemyDamage(this, e, 155, 'physical', { isCrit: true, pushbackPx: 22 }, game);
          stunEnemy(e, 0.8);
        }

        if (game && game.sound) {
          if (game.sound.playSwordClash) game.sound.playSwordClash();
        }
        if (game && game.vfx) {
          if (game.vfx.spawnShockwave) game.vfx.spawnShockwave(rp.x, rp.y, 110, '#f0d27a', 0.45);
          if (game.vfx.spawnBurst) {
            game.vfx.spawnBurst(rp.x, rp.y, {
              color: '#ffe082',
              count: 18,
              speed: 130,
              spread: TWO_PI,
              life: 0.42,
              size: 3.5,
              kind: 'spark'
            });
          }
          if (game.vfx.spawnFloatingText) {
            game.vfx.spawnFloatingText(rp.x, rp.y - 28, 'FORTH EORLINGAS!', '#ffd54f', 1.02);
          }
        }
        return true;
      }

      // 5. DWARVEN A: Dragonfire Barrage (18s CD)
      if (this.type === 'dwarven' && this.branch === 'A') {
        const targets = this.acquireTargets(game, 3, this.priority, _queryBufSkill);
        if (targets.length === 0 && isAuto) return false;

        this.skillCooldown = this.skillMaxCooldown;
        this.recoilTimer = 0.45;
        this.muzzleFlashTimer = 0.35;
        const basePt = targets[0] || findPathPointInBand(map, this.x, this.y, this.minRange, this.range);
        this.turretAngle = Math.atan2(basePt.y - this.y, basePt.x - this.x);

        for (let i = 0; i < 3; i++) {
          let tx, ty;
          if (targets.length > 0) {
            const t = targets[i % targets.length];
            const jitter = i >= targets.length ? (i - 1) * 26 : 0;
            tx = t.x + jitter;
            ty = t.y + (i - 1) * 12;
          } else {
            tx = basePt.x + (i - 1) * 38;
            ty = basePt.y + (i - 1) * 16;
          }
          // Ensure impact respects minRange..range band
          const dx = tx - this.x;
          const dy = ty - this.y;
          const d = Math.hypot(dx, dy) || 1;
          const clampedD = clamp(d, this.minRange + 4, this.range);
          tx = this.x + (dx / d) * clampedD;
          ty = this.y + (dy / d) * clampedD;

          this.manager.spawnProjectile({
            kind: 'mortar',
            tower: this,
            x: this.x,
            y: this.y - 14,
            sx: this.x,
            sy: this.y - 14,
            tx: tx,
            ty: ty,
            speed: 300 - i * 18,
            arcHeight: 88 + i * 12,
            damage: 135,
            dmgType: 'physical',
            splashRadius: 96,
            isFire: true,
            spawnsOil: true,
            oilRadius: 80,
            oilDuration: 4.5,
            oilDps: 40,
            color: '#ff6d00'
          });
        }

        if (game && game.sound && game.sound.playCatapultLaunch) game.sound.playCatapultLaunch();
        if (game && game.vfx && game.vfx.spawnFloatingText) {
          game.vfx.spawnFloatingText(this.x, this.y - 30, 'DRAGONFIRE BARRAGE!', '#ff8f00', 0.95);
        }
        return true;
      }

      // 6. DWARVEN B: Mithril Skewer (15s CD)
      if (this.type === 'dwarven' && this.branch === 'B') {
        const targets = this.acquireTargets(game, 1, this.priority, _queryBufSkill);
        if (targets.length === 0 && isAuto) return false;

        this.skillCooldown = this.skillMaxCooldown;
        this.recoilTimer = 0.38;
        this.muzzleFlashTimer = 0.28;

        const aimPt = targets[0] || findPathPointInBand(map, this.x, this.y, this.minRange, this.range);
        const ang = Math.atan2(aimPt.y - this.y, aimPt.x - this.x);
        this.turretAngle = ang;

        this.manager.spawnProjectile({
          kind: 'mithril_bolt',
          tower: this,
          x: this.x + Math.cos(ang) * 16,
          y: this.y - 10 + Math.sin(ang) * 16,
          vx: Math.cos(ang) * 860,
          vy: Math.sin(ang) * 860,
          angle: ang,
          maxDist: this.range + 65,
          maxPierce: 99,
          hitRadius: 20,
          damage: this.damage * 2,
          dmgType: 'physical',
          isCrit: true,
          shredArmorPct: 0.50,
          pushbackPx: 64,
          color: '#80deea'
        });

        if (game && game.sound && game.sound.playBallista) game.sound.playBallista();
        if (game && game.vfx && game.vfx.spawnFloatingText) {
          game.vfx.spawnFloatingText(this.x, this.y - 30, 'MITHRIL SKEWER!', '#80deea', 0.95);
        }
        return true;
      }

      // 7. ISTARI A: Secret Fire Nova (16s CD)
      if (this.type === 'istari' && this.branch === 'A') {
        let center = (this.beamTarget && !this.beamTarget.dead && !this.beamTarget.reachedExit)
          ? this.beamTarget
          : null;
        if (!center) {
          const targets = this.acquireTargets(game, 1, 'strongest', _queryBufSkill);
          center = targets[0] || null;
        }
        if (!center && isAuto) return false;

        this.skillCooldown = this.skillMaxCooldown;
        this.muzzleFlashTimer = 0.4;
        const cx = center ? center.x : findPathPointInBand(map, this.x, this.y, 0, this.range).x;
        const cy = center ? center.y : findPathPointInBand(map, this.x, this.y, 0, this.range).y;

        const victims = queryEnemiesInCircle(game, cx, cy, 95, _queryBufSecondary);
        for (let i = 0; i < victims.length; i++) {
          const e = victims[i];
          revealEnemy(e, 6.0);
          dealEnemyDamage(this, e, 215, 'magic', { isFire: true, revealSec: 6.0 }, game);
          stunEnemy(e, 1.5);
        }

        if (game && game.sound && game.sound.playExplosion) game.sound.playExplosion();
        if (game && game.vfx) {
          if (game.vfx.spawnShockwave) {
            game.vfx.spawnShockwave(cx, cy, 95, '#fff8e1', 0.48);
            game.vfx.spawnShockwave(cx, cy, 72, '#ff8f00', 0.36);
          }
          if (game.vfx.spawnBurst) {
            game.vfx.spawnBurst(cx, cy, {
              color: '#ffe082',
              count: 22,
              speed: 145,
              spread: TWO_PI,
              life: 0.45,
              size: 4,
              kind: 'fire'
            });
          }
          if (game.vfx.spawnFloatingText) {
            game.vfx.spawnFloatingText(cx, cy - 26, 'SECRET FIRE!', '#fff8e1', 1.02);
          }
        }
        return true;
      }

      // 8. ISTARI B: Tempest of Manwe (16s CD)
      if (this.type === 'istari' && this.branch === 'B') {
        const targets = this.acquireTargets(game, 4, 'strongest', _queryBufSkill);
        if (targets.length === 0 && isAuto) return false;

        this.skillCooldown = this.skillMaxCooldown;
        this.muzzleFlashTimer = 0.4;

        if (targets.length > 0) {
          for (let i = 0; i < targets.length; i++) {
            const e = targets[i];
            revealEnemy(e, 6.0);
            dealEnemyDamage(this, e, 168, 'magic', {
              revealSec: 6.0,
              pushbackPx: 52
            }, game);
            stunEnemy(e, 0.55);
            if (game && game.vfx) {
              if (game.vfx.spawnLightningArc) {
                game.vfx.spawnLightningArc(e.x + (i - 1.5) * 14, Math.max(10, e.y - 250), e.x, e.y, '#dff8ff');
                game.vfx.spawnLightningArc(this.x, this.y - 28, e.x, e.y, '#8be0ff');
              }
              if (game.vfx.spawnShockwave) {
                game.vfx.spawnShockwave(e.x, e.y, 36, '#8be0ff', 0.3);
              }
            }
          }
        } else if (game && game.vfx && game.vfx.spawnLightningArc) {
          const fb = findPathPointInBand(map, this.x, this.y, 0, this.range);
          game.vfx.spawnLightningArc(fb.x, Math.max(10, fb.y - 250), fb.x, fb.y, '#dff8ff');
        }

        if (game && game.sound && game.sound.playLightning) game.sound.playLightning();
        if (game && game.vfx && game.vfx.spawnFloatingText) {
          game.vfx.spawnFloatingText(this.x, this.y - 30, 'TEMPEST OF MANW\u00cb!', '#8be0ff', 0.95);
        }
        return true;
      }

      return false;
    }

    // ========================================================================
    // PER-TICK COMBAT UPDATE
    // ========================================================================
    update(dt, game) {
      // Rolling 3s DPS window maintenance
      this._dpsTimer += dt;
      if (this._activeCombatSec > 0) {
        this._activeCombatSec = Math.min(DPS_WINDOW_SEC, this._activeCombatSec + dt);
      }
      while (this._dpsTimer >= DPS_BUCKET_SEC) {
        this._dpsTimer -= DPS_BUCKET_SEC;
        this._dpsIdx = (this._dpsIdx + 1) % DPS_BUCKETS;
        this._dpsBuckets[this._dpsIdx] = 0;
      }
      let sum3s = 0;
      for (let i = 0; i < DPS_BUCKETS; i++) sum3s += this._dpsBuckets[i];
      if (sum3s > 0) {
        const denom = Math.max(0.75, this._activeCombatSec);
        this.rollingDps = Math.round((sum3s / denom) * 10) / 10;
        this.liveDps = this.rollingDps;
      } else {
        this._activeCombatSec = 0;
        this.rollingDps = 0;
        this.liveDps = this.getTheoreticalDps(game);
      }

      // Animation timers
      if (this.recoilTimer > 0) this.recoilTimer = Math.max(0, this.recoilTimer - dt);
      if (this.muzzleFlashTimer > 0) this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - dt);
      if (this.gateOpenTimer > 0) this.gateOpenTimer = Math.max(0, this.gateOpenTimer - dt);

      // Skill cooldown ticks down (paused if stunned)
      if (this.skillCooldown > 0 && this.stunTimer <= 0) {
        this.skillCooldown = Math.max(0, this.skillCooldown - dt);
      }

      // Stun / Boss Curse countdown
      if (this.stunTimer > 0) {
        this.stunTimer = Math.max(0, this.stunTimer - dt);
        if (this.stunTimer <= 0) {
          this.curseClicksRemaining = 0;
          this.stunSource = null;
        }
      }

      // Istari passive Wraith reveal aura inside tower range (active when not stunned)
      if (this.type === 'istari' && this.stunTimer <= 0) {
        const auraList = queryEnemiesInCircle(game, this.x, this.y, this.range, _queryBufPrimary);
        for (let i = 0; i < auraList.length; i++) {
          const e = auraList[i];
          if (e.type === 'wraith' || typeof e.revealedTimer === 'number') {
            revealEnemy(e, 0.45);
          }
        }
      }

      // Garrison barracks update
      if (this.type === 'garrison') {
        const rp = this.rallyPoint || this;
        const guardCandidates = queryEnemiesInCircle(game, rp.x, rp.y, 130, _queryBufPrimary);
        for (let i = 0; i < this.soldiers.length; i++) {
          this.soldiers[i].update(dt, game, guardCandidates);
        }
        if (this.tier === 3 && this.skillCooldown <= 0 && this.stunTimer <= 0) {
          this.triggerSkill(game, true);
        }
        return;
      }

      // Stunned ranged/artillery/magic towers cannot fire!
      if (this.stunTimer > 0) {
        this.beamTarget = null;
        this.beamLockTime = 0;
        this.beamRampMult = 1.0;
        return;
      }

      // Auto-cast Tier 3 skill in combat when ready
      if (this.tier === 3 && this.skillCooldown <= 0) {
        this.triggerSkill(game, true);
      }

      const effRate = this.getEffectiveFireRate(game);

      // Special continuous beam weapon: Istari Branch A — Flame of Anor
      if (this.type === 'istari' && this.tier === 3 && this.branch === 'A') {
        this.updateFlameOfAnor(dt, effRate, game);
        return;
      }

      this.cooldown -= dt;
      if (this.cooldown > 0) return;

      // Standard / Branch attacks
      if (this.type === 'elven') {
        this.fireElven(effRate, game);
      } else if (this.type === 'dwarven') {
        this.fireDwarven(effRate, game);
      } else if (this.type === 'istari') {
        this.fireIstari(effRate, game);
      }
    }

    fireElven(effRate, game) {
      if (this.tier === 3 && this.branch === 'B') {
        // Mirkwood Wardens: 3-arrow volley at up to 3 targets simultaneously
        const targets = this.acquireTargets(game, 3, this.priority, _queryBufPrimary);
        if (targets.length === 0) {
          this.cooldown = 0.06;
          return;
        }
        this.cooldown = 1 / effRate;
        this.recoilTimer = 0.22;
        this.turretAngle = Math.atan2(targets[0].y - (this.y - 20), targets[0].x - this.x);

        for (let i = 0; i < 3; i++) {
          const tgt = targets[i % targets.length];
          const isRepeatSameTarget = i >= targets.length;
          this.manager.spawnProjectile({
            kind: 'arrow',
            tower: this,
            x: this.x + (i - 1) * 4,
            y: this.y - 20,
            tx: tgt.x,
            ty: tgt.y,
            target: tgt,
            speed: 590,
            damage: isRepeatSameTarget ? Math.round(this.damage * 0.45) : this.damage,
            dmgType: 'physical',
            ignoreArmorPct: this.ignoreArmorPct,
            color: '#c8e6c9'
          });
        }
        if (game && game.sound && game.sound.playBow) game.sound.playBow();
        return;
      }

      // Base Elven T1/T2 or Branch A (Galadhrim Longbows)
      const targets = this.acquireTargets(game, 1, this.priority, _queryBufPrimary);
      if (targets.length === 0) {
        this.cooldown = 0.06;
        return;
      }
      const tgt = targets[0];
      this.cooldown = 1 / effRate;
      this.recoilTimer = 0.24;
      this.turretAngle = Math.atan2(tgt.y - (this.y - 20), tgt.x - this.x);

      const isGaladhrim = this.tier === 3 && this.branch === 'A';
      const isCrit = isGaladhrim && (Math.random() < 0.30);
      const shotDmg = isCrit ? this.damage * 3 : this.damage;

      this.manager.spawnProjectile({
        kind: 'arrow',
        tower: this,
        x: this.x,
        y: this.y - 21,
        tx: tgt.x,
        ty: tgt.y,
        target: tgt,
        speed: isGaladhrim ? 690 : 560,
        damage: shotDmg,
        dmgType: 'physical',
        ignoreArmorPct: this.ignoreArmorPct,
        isCrit: isCrit,
        bleedDps: isGaladhrim ? 18 : 0,
        bleedSec: isGaladhrim ? 3.0 : 0,
        color: isGaladhrim ? '#e1f5fe' : '#eceff1'
      });

      if (game && game.sound && game.sound.playBow) game.sound.playBow();
    }

    fireDwarven(effRate, game) {
      const targets = this.acquireTargets(game, 1, this.priority, _queryBufPrimary);
      if (targets.length === 0) {
        this.cooldown = 0.08;
        return;
      }
      const tgt = targets[0];
      this.cooldown = 1 / effRate;
      this.recoilTimer = 0.38;
      this.muzzleFlashTimer = 0.22;

      // Branch B: Khazad Ballista (linear piercing bolt + permanent 50% armor shred)
      if (this.tier === 3 && this.branch === 'B') {
        const ang = Math.atan2(tgt.y - this.y, tgt.x - this.x);
        this.turretAngle = ang;
        this.manager.spawnProjectile({
          kind: 'ballista_bolt',
          tower: this,
          x: this.x + Math.cos(ang) * 15,
          y: this.y - 9 + Math.sin(ang) * 15,
          vx: Math.cos(ang) * 740,
          vy: Math.sin(ang) * 740,
          angle: ang,
          maxDist: this.range + 45,
          maxPierce: 10,
          hitRadius: 17,
          damage: this.damage,
          dmgType: 'physical',
          shredArmorPct: 0.50,
          color: '#cfd8dc'
        });
        if (game && game.sound && game.sound.playBallista) game.sound.playBallista();
        return;
      }

      // T1/T2 Catapult or Branch A Iron Hills Mortar
      const isMortar = this.tier === 3 && this.branch === 'A';
      const projSpeed = isMortar ? 305 : 290;
      const rawDist = Math.hypot(tgt.x - this.x, tgt.y - this.y);
      const flightSec = rawDist / projSpeed;

      // Slight lead prediction on moving unblocked ground targets, clamped to [minRange, range]
      let tx = tgt.x;
      let ty = tgt.y;
      if (!tgt.blockedBy && typeof tgt.angle === 'number' && tgt.speed > 0) {
        const lead = tgt.speed * flightSec * 0.42;
        tx += Math.cos(tgt.angle) * lead;
        ty += Math.sin(tgt.angle) * lead;
        const dx = tx - this.x;
        const dy = ty - this.y;
        const d = Math.hypot(dx, dy) || 1;
        const cd = clamp(d, this.minRange, this.range);
        tx = this.x + (dx / d) * cd;
        ty = this.y + (dy / d) * cd;
      }

      this.turretAngle = Math.atan2(ty - this.y, tx - this.x);
      this.manager.spawnProjectile({
        kind: isMortar ? 'mortar' : 'boulder',
        tower: this,
        x: this.x,
        y: this.y - 14,
        sx: this.x,
        sy: this.y - 14,
        tx: tx,
        ty: ty,
        speed: projSpeed,
        arcHeight: isMortar ? 92 : 66,
        damage: this.damage,
        dmgType: 'physical',
        splashRadius: this.splashRadius,
        isFire: isMortar,
        spawnsOil: isMortar,
        oilRadius: 80,
        oilDuration: 4.5,
        oilDps: 36,
        color: isMortar ? '#ff6d00' : '#8d6e63'
      });

      if (game && game.sound && game.sound.playCatapultLaunch) game.sound.playCatapultLaunch();
    }

    updateFlameOfAnor(dt, effRate, game) {
      // Validate existing beam lock target
      if (this.beamTarget) {
        const bt = this.beamTarget;
        const d = Math.hypot(bt.x - this.x, bt.y - this.y);
        if (bt.dead || bt.reachedExit || bt.hp <= 0 || d > this.range + 8) {
          this.beamTarget = null;
          this.beamLockTime = 0;
          this.beamRampMult = 1.0;
        }
      }

      if (!this.beamTarget) {
        const targets = this.acquireTargets(game, 1, this.priority, _queryBufPrimary);
        if (targets.length === 0) {
          this.beamLockTime = 0;
          this.beamRampMult = 1.0;
          this.cooldown = Math.min(this.cooldown, 0.05);
          return;
        }
        this.beamTarget = targets[0];
        this.beamLockTime = 0;
        this.beamRampMult = 1.0;
      }

      // Smooth ramp from 1.0x up to 3.5x DPS over 4.0 seconds
      this.beamLockTime += dt;
      this.beamRampMult = 1.0 + 2.5 * clamp(this.beamLockTime / 4.0, 0, 1);
      this.turretAngle = Math.atan2(this.beamTarget.y - (this.y - 26), this.beamTarget.x - this.x);
      this.muzzleFlashTimer = 0.08;

      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        this.cooldown = 1 / effRate;
        const tickDmg = this.damage * this.beamRampMult;
        revealEnemy(this.beamTarget, 4.0);
        applyEnemySlow(this.beamTarget, 0.20, 2.5);
        dealEnemyDamage(this, this.beamTarget, tickDmg, 'magic', {
          isFire: true,
          revealSec: 4.0
        }, game);

        if (game && game.vfx && game.vfx.spawnBeam) {
          const intensity = 0.8 + (this.beamRampMult - 1.0) * 0.55;
          game.vfx.spawnBeam(this.x, this.y - 28, this.beamTarget.x, this.beamTarget.y, intensity, '#ff9800');
        }
        if (game && game.sound && game.sound.playBeamTick) {
          game.sound.playBeamTick();
        }
      }
    }

    fireIstari(effRate, game) {
      const targets = this.acquireTargets(game, 1, this.priority, _queryBufPrimary);
      if (targets.length === 0) {
        this.cooldown = 0.06;
        return;
      }
      const first = targets[0];
      this.cooldown = 1 / effRate;
      this.muzzleFlashTimer = 0.26;
      this.turretAngle = Math.atan2(first.y - (this.y - 26), first.x - this.x);

      // Branch B: Stormcaller Council (5-enemy chain lightning, 115px hop, 15% falloff, 25% 32px pushback)
      if (this.tier === 3 && this.branch === 'B') {
        const hitChain = [first];
        let prevX = this.x;
        let prevY = this.y - 28;
        let curr = first;

        for (let hop = 0; hop < 5 && curr; hop++) {
          const hopDmg = this.damage * Math.pow(0.85, hop);
          const push = Math.random() < 0.25 ? 32 : 0;
          revealEnemy(curr, 4.0);
          applyEnemySlow(curr, 0.20, 2.5);
          dealEnemyDamage(this, curr, hopDmg, 'magic', {
            revealSec: 4.0,
            pushbackPx: push
          }, game);

          if (game && game.vfx && game.vfx.spawnLightningArc) {
            game.vfx.spawnLightningArc(prevX, prevY, curr.x, curr.y, hop === 0 ? '#b3e5fc' : '#7fd4ff');
          }

          prevX = curr.x;
          prevY = curr.y;

          // Find next nearest unhit enemy within 115px bounce range
          if (hop < 4) {
            const neighbors = queryEnemiesInCircle(game, curr.x, curr.y, 115, _queryBufSecondary);
            let nextBest = null;
            let nextD2 = Infinity;
            for (let n = 0; n < neighbors.length; n++) {
              const cand = neighbors[n];
              if (hitChain.indexOf(cand) !== -1) continue;
              const dx = cand.x - curr.x;
              const dy = cand.y - curr.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < nextD2) {
                nextD2 = d2;
                nextBest = cand;
              }
            }
            curr = nextBest;
            if (curr) hitChain.push(curr);
          }
        }

        if (game && game.sound && game.sound.playLightning) game.sound.playLightning();
        return;
      }

      // Base Istari T1/T2 homing arcane bolt
      this.manager.spawnProjectile({
        kind: 'arcane_bolt',
        tower: this,
        x: this.x,
        y: this.y - 27,
        tx: first.x,
        ty: first.y,
        target: first,
        speed: 440,
        damage: this.damage,
        dmgType: 'magic',
        slowPct: 0.20,
        slowSec: 2.5,
        revealSec: 4.0,
        color: '#8be0ff'
      });

      if (game && game.sound && game.sound.playMagicBolt) game.sound.playMagicBolt();
    }

    // ========================================================================
    // PROCEDURAL TOWER RENDERING
    // ========================================================================
    render(ctx, time, game) {
      ctx.save();
      ctx.translate(this.x, this.y);

      // Foundation shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
      ctx.beginPath();
      ctx.ellipse(0, 6, 25, 13, 0, 0, TWO_PI);
      ctx.fill();

      // Ring of Power subtle golden empower aura under active towers
      if (game && game.ringActive && this.stunTimer <= 0) {
        const pulse = 0.55 + 0.35 * Math.sin(time * 7 + this.id);
        ctx.strokeStyle = `rgba(255, 196, 61, ${0.55 * pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 3, 24, 13, 0, 0, TWO_PI);
        ctx.stroke();
      }

      drawTowerVisual(
        ctx,
        this.type,
        this.tier,
        this.branch,
        time,
        this.turretAngle,
        this.recoilTimer,
        this.muzzleFlashTimer,
        this.gateOpenTimer,
        this.beamRampMult
      );

      // Tier indicator gems on front plinth
      for (let t = 0; t < this.tier; t++) {
        const gx = (t - (this.tier - 1) * 0.5) * 7;
        ctx.fillStyle = this.tier === 3
          ? (this.branch === 'A' ? '#ffd54f' : '#8be0ff')
          : '#c8a24b';
        ctx.beginPath();
        ctx.arc(gx, 14, 2.2, 0, TWO_PI);
        ctx.fill();
      }

      // Tier 3 Skill ready / cooldown subtle halo arc at tower base
      if (this.tier === 3 && this.skillMaxCooldown > 0) {
        const frac = 1 - clamp(this.skillCooldown / this.skillMaxCooldown, 0, 1);
        ctx.strokeStyle = frac >= 1 ? 'rgba(255, 224, 130, 0.78)' : 'rgba(139, 224, 255, 0.35)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 2, 22, -Math.PI * 0.5, -Math.PI * 0.5 + TWO_PI * frac);
        ctx.stroke();
      }

      ctx.restore();
    }

    renderStatusOverlay(ctx, time) {
      if (this.stunTimer <= 0) return;
      ctx.save();
      ctx.translate(this.x, this.y);

      if (this.curseClicksRemaining > 0) {
        // Wave 15 Boss Curse Lock: dark-fire iron chains + pulsing "CLICK xN!" alert!
        const pulse = 0.8 + 0.2 * Math.sin(time * 12);
        ctx.strokeStyle = `rgba(255, 61, 0, ${0.9 * pulse})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-20, -24);
        ctx.lineTo(20, 8);
        ctx.moveTo(20, -24);
        ctx.lineTo(-20, 8);
        ctx.stroke();

        ctx.strokeStyle = '#260e0b';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(0, -8, 22, 0, TWO_PI);
        ctx.stroke();
        ctx.setLineDash([]);

        // Pulsing lock emblem
        ctx.fillStyle = '#ff3d00';
        ctx.beginPath();
        ctx.arc(0, -8, 6.5 * pulse, 0, TWO_PI);
        ctx.fill();

        // High-contrast "CLICK x3!" callout pill
        const label = `CLICK x${this.curseClicksRemaining}!`;
        const scale = 1 + 0.08 * Math.sin(time * 14);
        ctx.save();
        ctx.translate(0, -39);
        ctx.scale(scale, scale);
        ctx.fillStyle = 'rgba(24, 8, 8, 0.92)';
        ctx.strokeStyle = '#ff6d00';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-36, -10, 72, 19, 5) : ctx.rect(-36, -10, 72, 19);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffd54f';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 0, 0);
        ctx.restore();
      } else {
        // Ringwraith Black Breath 4s Stun Fog
        for (let i = 0; i < 3; i++) {
          const ang = time * 2.2 + i * 2.1;
          const rx = Math.cos(ang) * 14;
          const ry = Math.sin(ang) * 7 - 10;
          ctx.fillStyle = 'rgba(30, 18, 48, 0.52)';
          ctx.beginPath();
          ctx.ellipse(rx, ry, 14, 8, 0, 0, TWO_PI);
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(159, 134, 192, 0.72)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -12, 19, -Math.PI * 0.5, -Math.PI * 0.5 + TWO_PI * clamp(this.stunTimer / 4.0, 0, 1));
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // ============================================================================
  // 5. SHARED PROCEDURAL ARTWORK (FOR IN-GAME TOWERS & UI/CODEX PORTRAITS)
  // ============================================================================
  function drawTowerVisual(ctx, type, tier, branch, time, turretAngle, recoil, muzzleFlash, gateOpen, beamRamp) {
    if (type === 'elven') {
      // Carved stone & star-silver plinth
      ctx.fillStyle = '#90a4ae';
      ctx.beginPath();
      ctx.ellipse(0, 4, 20, 11, 0, 0, TWO_PI);
      ctx.fill();

      // Mallorn / silver-birch curved spire ribs
      const woodColor = (tier === 3 && branch === 'A') ? '#e3edf7'
        : (tier === 3 && branch === 'B') ? '#4e3b2c' : '#d7ccc8';
      const canopyColor = (tier === 3 && branch === 'A') ? '#2c4f6b'
        : (tier === 3 && branch === 'B') ? '#1e462b' : '#2e5941';
      const trimColor = (tier >= 2) ? '#f0d27a' : '#b0bec5';

      ctx.fillStyle = woodColor;
      ctx.beginPath();
      ctx.moveTo(-13, 4);
      ctx.quadraticCurveTo(-8, -14, -9, -24);
      ctx.lineTo(9, -24);
      ctx.quadraticCurveTo(8, -14, 13, 4);
      ctx.closePath();
      ctx.fill();

      // Graceful Elven archways
      ctx.strokeStyle = trimColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-11, 3);
      ctx.quadraticCurveTo(0, -16, 11, 3);
      ctx.stroke();

      // Upper leaf-canopy gallery
      ctx.fillStyle = canopyColor;
      ctx.beginPath();
      ctx.ellipse(0, -22, tier >= 2 ? 15 : 13, 7.5, 0, 0, TWO_PI);
      ctx.fill();
      ctx.strokeStyle = trimColor;
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Perched Elven archer(s) + bow recoil
      const pull = recoil > 0 ? -3.5 : 0;
      const archerCount = (tier === 3 && branch === 'B') ? 2 : 1;
      for (let a = 0; a < archerCount; a++) {
        const ox = archerCount === 2 ? (a === 0 ? -5 : 5) : 0;
        ctx.save();
        ctx.translate(ox, -24);
        // Cloak & head
        ctx.fillStyle = (tier === 3 && branch === 'A') ? '#cfd8dc' : '#2f523d';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, TWO_PI);
        ctx.fill();
        ctx.fillStyle = '#f5d97e';
        ctx.beginPath();
        ctx.arc(0, -2, 2.5, 0, TWO_PI);
        ctx.fill();

        // Aimed Elven bow
        ctx.rotate(turretAngle);
        ctx.strokeStyle = (tier === 3 && branch === 'A') ? '#fff8e1' : '#e6c670';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(5 + pull * 0.4, 0, 6.5, -1.05, 1.05);
        ctx.stroke();
        // Bowstring
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(5 + Math.cos(-1.05) * 6.5, Math.sin(-1.05) * 6.5);
        ctx.lineTo(2 + pull, 0);
        ctx.lineTo(5 + Math.cos(1.05) * 6.5, Math.sin(1.05) * 6.5);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }

    if (type === 'garrison') {
      const isPhalanx = tier === 3 && branch === 'A';
      const isRohan = tier === 3 && branch === 'B';

      // Stone bastion walls
      ctx.fillStyle = isRohan ? '#6d5c4d' : (isPhalanx ? '#cfd8dc' : '#90a4ae');
      ctx.strokeStyle = '#37474f';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(-18, -18, 36, 23);
      ctx.fill();
      ctx.stroke();

      // Roof / Crenellations
      if (isRohan) {
        // Steep golden-timbered Rohan Mead-hall gable
        ctx.fillStyle = '#8d6e3f';
        ctx.beginPath();
        ctx.moveTo(-21, -17);
        ctx.lineTo(0, -31);
        ctx.lineTo(21, -17);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#f0d27a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        // Gondorian crenellated parapet + citadel dome on Phalanx
        ctx.fillStyle = isPhalanx ? '#eceff1' : '#b0bec5';
        for (let c = -18; c <= 12; c += 10) {
          ctx.fillRect(c, -24, 6, 6);
        }
        if (isPhalanx) {
          ctx.fillStyle = '#f0d27a';
          ctx.beginPath();
          ctx.arc(0, -24, 7, Math.PI, 0);
          ctx.fill();
        }
      }

      // Opening gate arch (warm torchlight when open, iron portcullis bars when closed)
      const openAmt = clamp(gateOpen, 0, 1);
      ctx.fillStyle = openAmt > 0.1 ? '#ffb300' : '#1b2028';
      ctx.beginPath();
      ctx.arc(0, -3, 7, Math.PI, 0);
      ctx.lineTo(7, 5);
      ctx.lineTo(-7, 5);
      ctx.closePath();
      ctx.fill();

      if (openAmt < 0.85) {
        const barBottom = 5 - openAmt * 9;
        ctx.strokeStyle = '#546e7a';
        ctx.lineWidth = 1.3;
        for (let gx = -4; gx <= 4; gx += 4) {
          ctx.beginPath();
          ctx.moveTo(gx, -9);
          ctx.lineTo(gx, barBottom);
          ctx.stroke();
        }
      }

      // Banner standard
      const wave = Math.sin(time * 4.5) * 2.5;
      ctx.strokeStyle = '#cfd8dc';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(14, -22);
      ctx.lineTo(14, -36);
      ctx.stroke();
      ctx.fillStyle = isRohan ? '#2e6b3e' : (isPhalanx ? '#17202a' : '#283593');
      ctx.beginPath();
      ctx.moveTo(14, -36);
      ctx.lineTo(25, -33 + wave);
      ctx.lineTo(14, -28);
      ctx.closePath();
      ctx.fill();
      return;
    }

    if (type === 'dwarven') {
      const isMortar = tier === 3 && branch === 'A';
      const isBallista = tier === 3 && branch === 'B';

      // Octagonal iron-bound granite bastion
      ctx.fillStyle = '#454d59';
      ctx.strokeStyle = '#c88a3e';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TWO_PI + Math.PI * 0.125;
        const px = Math.cos(a) * 20;
        const py = Math.sin(a) * 12 - 2;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Glowing Dwarven forge grate at front
      ctx.fillStyle = `rgba(255, 109, 0, ${0.65 + 0.25 * Math.sin(time * 6)})`;
      ctx.fillRect(-6, 3, 12, 4);

      // Rotating turret platform
      ctx.save();
      ctx.translate(0, -10);
      ctx.rotate(turretAngle);
      const kick = recoil * 14;

      if (isMortar) {
        // Iron Hills heavy dragon-mouth mortar
        ctx.fillStyle = '#262b33';
        ctx.strokeStyle = '#d4943a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-10 - kick * 0.4, -8, 22, 16, 4) : ctx.rect(-10 - kick * 0.4, -8, 22, 16);
        ctx.fill();
        ctx.stroke();
        // Glowing bore
        ctx.fillStyle = muzzleFlash > 0 ? '#fff59d' : '#ff6d00';
        ctx.beginPath();
        ctx.arc(11 - kick * 0.4, 0, 5, 0, TWO_PI);
        ctx.fill();
      } else if (isBallista) {
        // Khazad heavy steel torsion ballista
        ctx.strokeStyle = '#b0bec5';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(4, -13);
        ctx.quadraticCurveTo(9, 0, 4, 13);
        ctx.stroke();
        // Rail
        ctx.fillStyle = '#5d4037';
        ctx.fillRect(-12, -2.5, 24, 5);
        // Loaded iron/mithril bolt (when not in recoil)
        if (recoil < 0.15) {
          ctx.strokeStyle = '#80deea';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-6, 0);
          ctx.lineTo(16, 0);
          ctx.stroke();
        }
      } else {
        // Timber & iron catapult frame + snapping throwing arm
        ctx.fillStyle = '#5d4037';
        ctx.fillRect(-11, -7, 20, 4);
        ctx.fillRect(-11, 3, 20, 4);
        // Throwing arm + boulder sling
        const armOffset = -8 + kick * 1.4;
        ctx.strokeStyle = '#8d6e63';
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(armOffset, 0);
        ctx.lineTo(10, 0);
        ctx.stroke();
        if (recoil < 0.12) {
          ctx.fillStyle = '#78909c';
          ctx.beginPath();
          ctx.arc(armOffset, 0, 4.5, 0, TWO_PI);
          ctx.fill();
        }
      }

      ctx.restore();
      return;
    }

    if (type === 'istari') {
      const isAnor = tier === 3 && branch === 'A';
      const isStorm = tier === 3 && branch === 'B';

      // Fluted obsidian / white-marble arcane spire
      const spireGrad = ctx.createLinearGradient(0, 6, 0, -34);
      if (isAnor) {
        spireGrad.addColorStop(0, '#3e2723');
        spireGrad.addColorStop(1, '#fff3e0');
      } else if (isStorm) {
        spireGrad.addColorStop(0, '#162238');
        spireGrad.addColorStop(1, '#4f83b8');
      } else {
        spireGrad.addColorStop(0, '#1e2633');
        spireGrad.addColorStop(1, tier >= 2 ? '#dce7f2' : '#546e7a');
      }

      ctx.fillStyle = spireGrad;
      ctx.beginPath();
      ctx.moveTo(-14, 6);
      ctx.lineTo(-7, -25);
      ctx.lineTo(7, -25);
      ctx.lineTo(14, 6);
      ctx.closePath();
      ctx.fill();

      // Spire prongs
      ctx.strokeStyle = isAnor ? '#ffd54f' : '#90caf9';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-7, -23);
      ctx.lineTo(-10, -33);
      ctx.moveTo(7, -23);
      ctx.lineTo(10, -33);
      ctx.stroke();

      // Levitating crystal core + orbiting arcane rune
      const bob = Math.sin(time * 3.6) * 2.2;
      const coreColor = isAnor ? '#ffb300' : (isStorm ? '#4fc3f7' : '#8be0ff');
      const glowR = (muzzleFlash > 0 ? 11 : 7.5) + (isAnor ? (beamRamp - 1) * 2.5 : 0);

      ctx.fillStyle = isAnor ? 'rgba(255, 193, 7, 0.34)' : 'rgba(79, 195, 247, 0.32)';
      ctx.beginPath();
      ctx.arc(0, -30 + bob, glowR, 0, TWO_PI);
      ctx.fill();

      ctx.fillStyle = muzzleFlash > 0 ? '#ffffff' : coreColor;
      ctx.beginPath();
      ctx.moveTo(0, -36 + bob);
      ctx.lineTo(5, -30 + bob);
      ctx.lineTo(0, -24 + bob);
      ctx.lineTo(-5, -30 + bob);
      ctx.closePath();
      ctx.fill();

      // Orbiting rune motes
      const moteCount = tier >= 3 ? 3 : (tier === 2 ? 2 : 1);
      for (let m = 0; m < moteCount; m++) {
        const ang = time * 3.2 + (m / moteCount) * TWO_PI;
        const mx = Math.cos(ang) * 11;
        const my = -30 + bob + Math.sin(ang) * 4;
        ctx.fillStyle = isAnor ? '#ffe082' : '#b3e5fc';
        ctx.beginPath();
        ctx.arc(mx, my, 2, 0, TWO_PI);
        ctx.fill();
      }
    }
  }

  // ============================================================================
  // 6. TOWER MANAGER (POOLED PROJECTILES, OIL PATCHES, TOWERS & PORTRAIT ICONS)
  // ============================================================================
  class TowerManager {
    constructor() {
      this.towers = [];
      this.projectiles = [];
      this.oilPatches = [];
      this._sortedRenderList = [];
      this._groundRenderedTime = -1;

      this.projectilePool = makeFallbackPool(
        () => ({
          kind: 'arrow',
          tower: null,
          x: 0,
          y: 0,
          sx: 0,
          sy: 0,
          tx: 0,
          ty: 0,
          vx: 0,
          vy: 0,
          angle: 0,
          target: null,
          speed: 500,
          progress: 0,
          flightDuration: 0.4,
          arcHeight: 0,
          traveled: 0,
          maxDist: 300,
          maxPierce: 1,
          hitRadius: 16,
          hitIds: [],
          damage: 10,
          dmgType: 'physical',
          ignoreArmorPct: 0,
          shredArmorPct: 0,
          isCrit: false,
          isFire: false,
          slowPct: 0,
          slowSec: 0,
          stunSec: 0,
          revealSec: 0,
          bleedDps: 0,
          bleedSec: 0,
          pushbackPx: 0,
          splashRadius: 0,
          spawnsOil: false,
          oilRadius: 78,
          oilDuration: 4.5,
          oilDps: 36,
          trailTimer: 0,
          color: '#ffffff'
        }),
        (p) => {
          p.tower = null;
          p.target = null;
          p.hitIds.length = 0;
          p.progress = 0;
          p.traveled = 0;
          p.arcHeight = 0;
          p.ignoreArmorPct = 0;
          p.shredArmorPct = 0;
          p.isCrit = false;
          p.isFire = false;
          p.slowPct = 0;
          p.slowSec = 0;
          p.stunSec = 0;
          p.revealSec = 0;
          p.bleedDps = 0;
          p.bleedSec = 0;
          p.pushbackPx = 0;
          p.splashRadius = 0;
          p.spawnsOil = false;
          p.trailTimer = 0;
        },
        96
      );

      this.oilPatchPool = makeFallbackPool(
        () => ({
          tower: null,
          x: 0,
          y: 0,
          radius: 78,
          life: 4.5,
          maxLife: 4.5,
          dps: 36,
          tickTimer: 0.1,
          seed: 0
        }),
        (o) => {
          o.tower = null;
          o.life = 0;
          o.tickTimer = 0.1;
        },
        24
      );
    }

    reset() {
      for (let i = 0; i < this.towers.length; i++) {
        const t = this.towers[i];
        for (let j = 0; j < t.soldiers.length; j++) {
          t.soldiers[j].releaseEngagement();
        }
      }
      this.towers.length = 0;
      this._sortedRenderList.length = 0;

      for (let i = 0; i < this.projectiles.length; i++) {
        this.projectilePool.release(this.projectiles[i]);
      }
      this.projectiles.length = 0;

      for (let i = 0; i < this.oilPatches.length; i++) {
        this.oilPatchPool.release(this.oilPatches[i]);
      }
      this.oilPatches.length = 0;
      this._groundRenderedTime = -1;
    }

    resolvePad(padOrId, game) {
      if (padOrId && typeof padOrId === 'object' && typeof padOrId.x === 'number') {
        return padOrId;
      }
      const id = (padOrId && typeof padOrId === 'object') ? padOrId.id : padOrId;
      const pads = game && game.map && game.map.pads;
      if (Array.isArray(pads)) {
        for (let i = 0; i < pads.length; i++) {
          if (pads[i].id === id) return pads[i];
        }
      }
      return null;
    }

    getTowerOnPad(padId) {
      const id = (padId && typeof padId === 'object') ? padId.id : padId;
      for (let i = 0; i < this.towers.length; i++) {
        if (this.towers[i].padId === id) return this.towers[i];
      }
      return null;
    }

    getTowerAt(x, y, radius = 28) {
      let best = null;
      let bestD2 = radius * radius;
      for (let i = 0; i < this.towers.length; i++) {
        const t = this.towers[i];
        const dx = t.x - x;
        const dy = t.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= bestD2) {
          bestD2 = d2;
          best = t;
        }
      }
      return best;
    }

    canBuild(pad, typeKey, game) {
      const def = TOWER_TYPES[typeKey];
      if (!def) return false;
      const padObj = this.resolvePad(pad, game);
      if (!padObj) return false;
      if (this.getTowerOnPad(padObj.id)) return false;
      if (game && typeof game.gold === 'number' && game.gold < def.cost) return false;
      return true;
    }

    buildTower(pad, typeKey, game) {
      const def = TOWER_TYPES[typeKey];
      const padObj = this.resolvePad(pad, game);
      if (!def || !padObj || this.getTowerOnPad(padObj.id)) return null;
      if (!trySpendGold(game, def.cost)) return null;

      const tower = new Tower(padObj, typeKey, this, game && game.map);
      this.towers.push(tower);

      if (game && game.sound && game.sound.playBuild) game.sound.playBuild();
      if (game && game.vfx && game.vfx.spawnBurst) {
        game.vfx.spawnBurst(tower.x, tower.y, {
          color: '#cfd8dc',
          count: 10,
          speed: 70,
          spread: TWO_PI,
          life: 0.35,
          size: 3,
          kind: 'stone'
        });
      }
      return tower;
    }

    sellTower(towerOrPadId, game) {
      let idx = -1;
      for (let i = 0; i < this.towers.length; i++) {
        const t = this.towers[i];
        if (t === towerOrPadId || t.id === towerOrPadId || t.padId === towerOrPadId) {
          idx = i;
          break;
        }
      }
      if (idx === -1) return 0;

      const tower = this.towers[idx];
      for (let i = 0; i < tower.soldiers.length; i++) {
        tower.soldiers[i].releaseEngagement();
        tower.soldiers[i].dead = true;
      }

      const refund = tower.getSellValue();
      this.towers.splice(idx, 1);
      refundGold(game, refund, tower.x, tower.y);

      if (game && game.sound && game.sound.playSell) game.sound.playSell();
      if (game && game.vfx && game.vfx.spawnBurst) {
        game.vfx.spawnBurst(tower.x, tower.y, {
          color: '#f0d27a',
          count: 12,
          speed: 75,
          spread: TWO_PI,
          life: 0.38,
          size: 3,
          kind: 'stone'
        });
      }
      return refund;
    }

    stunTowersInRadius(x, y, radius, duration) {
      const r2 = radius * radius;
      let count = 0;
      for (let i = 0; i < this.towers.length; i++) {
        const t = this.towers[i];
        const dx = t.x - x;
        const dy = t.y - y;
        if (dx * dx + dy * dy <= r2) {
          t.stunTimer = Math.max(t.stunTimer, duration);
          if (t.curseClicksRemaining <= 0) t.stunSource = 'wraith';
          t.beamTarget = null;
          t.beamLockTime = 0;
          t.beamRampMult = 1.0;
          count++;
        }
      }
      return count;
    }

    getSoldiersInRadius(x, y, radius) {
      const r2 = radius * radius;
      const out = [];
      for (let i = 0; i < this.towers.length; i++) {
        const t = this.towers[i];
        if (t.type !== 'garrison') continue;
        for (let j = 0; j < t.soldiers.length; j++) {
          const s = t.soldiers[j];
          if (s.dead) continue;
          const dx = s.x - x;
          const dy = s.y - y;
          if (dx * dx + dy * dy <= r2) out.push(s);
        }
      }
      return out;
    }

    healSoldiersInRadius(x, y, radius) {
      const r2 = radius * radius;
      let healed = 0;
      for (let i = 0; i < this.towers.length; i++) {
        const t = this.towers[i];
        if (t.type !== 'garrison') continue;
        const rp = t.rallyPoint || t;
        const towerInR = (t.x - x) * (t.x - x) + (t.y - y) * (t.y - y) <= r2;
        const rallyInR = (rp.x - x) * (rp.x - x) + (rp.y - y) * (rp.y - y) <= r2;

        for (let j = 0; j < t.soldiers.length; j++) {
          const s = t.soldiers[j];
          if (s.dead) {
            if (towerInR || rallyInR) {
              s.respawnInstant();
              healed++;
            }
          } else {
            const soldierInR = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y) <= r2;
            if (soldierInR || towerInR || rallyInR) {
              s._hp = s.maxHp;
              healed++;
            }
          }
        }
      }
      return healed;
    }

    spawnProjectile(cfg) {
      const p = this.projectilePool.acquire();
      p.kind = cfg.kind || 'arrow';
      p.tower = cfg.tower || null;
      p.x = cfg.x;
      p.y = cfg.y;
      p.sx = cfg.sx !== undefined ? cfg.sx : cfg.x;
      p.sy = cfg.sy !== undefined ? cfg.sy : cfg.y;
      p.tx = cfg.tx !== undefined ? cfg.tx : cfg.x;
      p.ty = cfg.ty !== undefined ? cfg.ty : cfg.y;
      p.vx = cfg.vx || 0;
      p.vy = cfg.vy || 0;
      p.target = cfg.target || null;
      p.speed = cfg.speed || 520;
      p.angle = cfg.angle !== undefined ? cfg.angle : Math.atan2(p.ty - p.y, p.tx - p.x);

      const totalDist = Math.hypot(p.tx - p.sx, p.ty - p.sy);
      p.flightDuration = Math.max(0.08, totalDist / p.speed);
      p.progress = 0;
      p.arcHeight = cfg.arcHeight || 0;
      p.traveled = 0;
      p.maxDist = cfg.maxDist || 300;
      p.maxPierce = cfg.maxPierce || 1;
      p.hitRadius = cfg.hitRadius || 16;

      p.damage = cfg.damage || 10;
      p.dmgType = cfg.dmgType || 'physical';
      p.ignoreArmorPct = cfg.ignoreArmorPct || 0;
      p.shredArmorPct = cfg.shredArmorPct || 0;
      p.isCrit = !!cfg.isCrit;
      p.isFire = !!cfg.isFire;
      p.slowPct = cfg.slowPct || 0;
      p.slowSec = cfg.slowSec || 0;
      p.stunSec = cfg.stunSec || 0;
      p.revealSec = cfg.revealSec || 0;
      p.bleedDps = cfg.bleedDps || 0;
      p.bleedSec = cfg.bleedSec || 0;
      p.pushbackPx = cfg.pushbackPx || 0;
      p.splashRadius = cfg.splashRadius || 0;
      p.spawnsOil = !!cfg.spawnsOil;
      p.oilRadius = cfg.oilRadius || 78;
      p.oilDuration = cfg.oilDuration || 4.5;
      p.oilDps = cfg.oilDps || 36;
      p.color = cfg.color || '#ffffff';

      this.projectiles.push(p);
      return p;
    }

    spawnOilPatch(tower, x, y, radius, duration, dps) {
      const o = this.oilPatchPool.acquire();
      o.tower = tower;
      o.x = x;
      o.y = y;
      o.radius = radius || 78;
      o.life = duration || 4.5;
      o.maxLife = o.life;
      o.dps = dps || 36;
      o.tickTimer = 0.08;
      o.seed = Math.random() * 10;
      this.oilPatches.push(o);
      return o;
    }

    update(dt, game) {
      // 1. Update towers & Garrison soldiers
      for (let i = 0; i < this.towers.length; i++) {
        this.towers[i].update(dt, game);
      }

      // 2. Update pooled projectiles
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        let finished = false;

        if (p.kind === 'ballista_bolt' || p.kind === 'mithril_bolt') {
          // Linear piercing projectile with swept segment collision
          const prevX = p.x;
          const prevY = p.y;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          const stepDist = Math.hypot(p.x - prevX, p.y - prevY);
          p.traveled += stepDist;

          p.trailTimer -= dt;
          if (p.trailTimer <= 0 && game && game.vfx && game.vfx.spawnTrail) {
            p.trailTimer = 0.025;
            game.vfx.spawnTrail(p.x, p.y, p.color, p.kind === 'mithril_bolt' ? 4 : 2.6, 0.2);
          }

          const midX = (prevX + p.x) * 0.5;
          const midY = (prevY + p.y) * 0.5;
          const enemies = queryEnemiesInCircle(game, midX, midY, stepDist * 0.5 + p.hitRadius + 24, _queryBufSecondary);
          const segDx = p.x - prevX;
          const segDy = p.y - prevY;
          const segLen2 = segDx * segDx + segDy * segDy;

          for (let k = 0; k < enemies.length; k++) {
            const e = enemies[k];
            if (e.flying || p.hitIds.indexOf(e.id) !== -1) continue;
            const t = segLen2 > 0 ? clamp(((e.x - prevX) * segDx + (e.y - prevY) * segDy) / segLen2, 0, 1) : 0;
            const cx = prevX + segDx * t;
            const cy = prevY + segDy * t;
            const hitR = p.hitRadius + (e.radius || 12);
            if ((e.x - cx) * (e.x - cx) + (e.y - cy) * (e.y - cy) <= hitR * hitR) {
              p.hitIds.push(e.id);
              dealEnemyDamage(p.tower, e, p.damage, p.dmgType, {
                isCrit: p.isCrit,
                shredArmorPct: p.shredArmorPct,
                pushbackPx: p.pushbackPx
              }, game);

              if (game && game.vfx && game.vfx.spawnBurst) {
                game.vfx.spawnBurst(e.x, e.y, {
                  color: p.color,
                  count: 5,
                  speed: 90,
                  angle: p.angle,
                  spread: 0.9,
                  life: 0.25,
                  size: 2.6,
                  kind: 'spark'
                });
              }

              if (p.hitIds.length >= p.maxPierce) {
                finished = true;
                break;
              }
            }
          }

          if (p.traveled >= p.maxDist || p.x < -40 || p.x > 1320 || p.y < -40 || p.y > 760) {
            finished = true;
          }
        } else if (p.kind === 'boulder' || p.kind === 'mortar') {
          // Ballistic parabolic artillery shell
          p.progress += dt / p.flightDuration;
          const t = clamp(p.progress, 0, 1);
          p.x = p.sx + (p.tx - p.sx) * t;
          p.y = p.sy + (p.ty - p.sy) * t;

          p.trailTimer -= dt;
          if (p.trailTimer <= 0 && game && game.vfx && game.vfx.spawnTrail) {
            p.trailTimer = 0.035;
            const elevY = p.y - p.arcHeight * 4 * t * (1 - t);
            game.vfx.spawnTrail(p.x, elevY, p.isFire ? '#ff8f00' : '#90a4ae', 3.2, 0.26);
          }

          if (p.progress >= 1.0) {
            // Detonate splash at ground impact (tx, ty)
            const victims = queryEnemiesInCircle(game, p.tx, p.ty, p.splashRadius, _queryBufSecondary);
            for (let k = 0; k < victims.length; k++) {
              const e = victims[k];
              if (e.flying) continue;
              const d = Math.hypot(e.x - p.tx, e.y - p.ty);
              const falloff = d <= p.splashRadius * 0.45 ? 1.0 : (1.0 - 0.35 * ((d - p.splashRadius * 0.45) / (p.splashRadius * 0.55)));
              dealEnemyDamage(p.tower, e, p.damage * clamp(falloff, 0.6, 1.0), p.dmgType, {
                isFire: p.isFire
              }, game);
            }

            if (p.spawnsOil) {
              this.spawnOilPatch(p.tower, p.tx, p.ty, p.oilRadius, p.oilDuration, p.oilDps);
            }

            if (game && game.sound && game.sound.playExplosion) game.sound.playExplosion();
            if (game && game.vfx) {
              if (game.vfx.spawnShockwave) {
                game.vfx.spawnShockwave(p.tx, p.ty, p.splashRadius, p.isFire ? '#ff6d00' : '#bcaaa4', 0.4);
              }
              if (game.vfx.spawnBurst) {
                game.vfx.spawnBurst(p.tx, p.ty, {
                  color: p.isFire ? '#ff8f00' : '#a1887f',
                  count: p.isFire ? 16 : 12,
                  speed: 115,
                  spread: TWO_PI,
                  life: 0.4,
                  size: 3.5,
                  kind: p.isFire ? 'fire' : 'stone'
                });
              }
            }
            finished = true;
          }
        } else {
          // Guided homing arrow / Starlight Piercer / Istari Arcane Bolt
          if (p.target && !p.target.dead && !p.target.reachedExit && p.target.hp > 0) {
            p.tx = p.target.x;
            p.ty = p.target.y;
          }
          const dx = p.tx - p.x;
          const dy = p.ty - p.y;
          const d = Math.hypot(dx, dy);
          p.angle = Math.atan2(dy, dx);

          p.trailTimer -= dt;
          if (p.trailTimer <= 0 && game && game.vfx && game.vfx.spawnTrail) {
            p.trailTimer = 0.025;
            game.vfx.spawnTrail(p.x, p.y, p.color, p.kind === 'starlight_arrow' ? 3.8 : 2.2, 0.18);
          }

          const step = p.speed * dt;
          if (d <= step + 8) {
            let hitEnemy = (p.target && !p.target.dead && !p.target.reachedExit && p.target.hp > 0)
              ? p.target
              : null;

            if (!hitEnemy) {
              // Retarget any enemy right at impact spot if original died mid-flight
              const near = queryEnemiesInCircle(game, p.tx, p.ty, 22, _queryBufSecondary);
              for (let n = 0; n < near.length; n++) {
                if (!near[n].flying || (p.tower && p.tower.canTargetFlying)) {
                  hitEnemy = near[n];
                  break;
                }
              }
            }

            if (hitEnemy) {
              if (p.revealSec > 0) revealEnemy(hitEnemy, p.revealSec);
              if (p.slowPct > 0 && p.slowSec > 0) applyEnemySlow(hitEnemy, p.slowPct, p.slowSec);
              if (p.stunSec > 0) stunEnemy(hitEnemy, p.stunSec);

              dealEnemyDamage(p.tower, hitEnemy, p.damage, p.dmgType, {
                ignoreArmorPct: p.ignoreArmorPct,
                isCrit: p.isCrit,
                revealSec: p.revealSec,
                bleedDps: p.bleedDps,
                bleedSec: p.bleedSec
              }, game);

              if (p.kind === 'starlight_arrow' && game && game.vfx && game.vfx.spawnShockwave) {
                game.vfx.spawnShockwave(hitEnemy.x, hitEnemy.y, 44, '#e0f7fa', 0.35);
              }
            }
            finished = true;
          } else {
            p.x += (dx / d) * step;
            p.y += (dy / d) * step;
          }
        }

        if (finished) {
          const last = this.projectiles.length - 1;
          if (i !== last) this.projectiles[i] = this.projectiles[last];
          this.projectiles.pop();
          this.projectilePool.release(p);
        }
      }

      // 3. Update burning oil patches (Iron Hills Mortar & Dragonfire Barrage)
      for (let i = this.oilPatches.length - 1; i >= 0; i--) {
        const o = this.oilPatches[i];
        o.life -= dt;
        if (o.life <= 0) {
          const last = this.oilPatches.length - 1;
          if (i !== last) this.oilPatches[i] = this.oilPatches[last];
          this.oilPatches.pop();
          this.oilPatchPool.release(o);
          continue;
        }

        o.tickTimer -= dt;
        if (o.tickTimer <= 0) {
          const tickInterval = 0.45;
          o.tickTimer += tickInterval;
          const victims = queryEnemiesInCircle(game, o.x, o.y, o.radius, _queryBufSecondary);
          const tickDmg = o.dps * tickInterval;
          for (let k = 0; k < victims.length; k++) {
            const e = victims[k];
            if (e.flying) continue;
            dealEnemyDamage(o.tower, e, tickDmg, 'physical', {
              isFire: true,
              isDot: true
            }, game);
          }
        }
      }
    }

    renderGround(ctx, time) {
      this._groundRenderedTime = time;
      if (this.oilPatches.length === 0) return;

      ctx.save();
      for (let i = 0; i < this.oilPatches.length; i++) {
        const o = this.oilPatches[i];
        const alpha = clamp(o.life / 0.7, 0, 1);

        // Scorched oil pool
        ctx.fillStyle = `rgba(28, 16, 10, ${0.58 * alpha})`;
        ctx.beginPath();
        ctx.ellipse(o.x, o.y, o.radius, o.radius * 0.68, 0, 0, TWO_PI);
        ctx.fill();

        // Molten ember rim
        ctx.strokeStyle = `rgba(255, 111, 0, ${0.62 * alpha})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Dancing flame tongues inside oil zone
        for (let f = 0; f < 6; f++) {
          const ang = o.seed + f * 1.05 + time * 1.4;
          const r = (0.25 + 0.55 * ((f * 37) % 10) / 10) * o.radius;
          const fx = o.x + Math.cos(ang) * r;
          const fy = o.y + Math.sin(ang) * r * 0.65;
          const fh = 7 + 4 * Math.sin(time * 11 + f * 1.9);

          ctx.fillStyle = `rgba(255, 160, 0, ${0.72 * alpha})`;
          ctx.beginPath();
          ctx.moveTo(fx - 4, fy);
          ctx.quadraticCurveTo(fx, fy - fh * 1.4, fx + 4, fy);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    }

    render(ctx, time, game) {
      // 1. Burning oil zones on the ground (unless engine called renderGround separately this frame)
      if (this._groundRenderedTime !== time) {
        this.renderGround(ctx, time);
      }

      // 2. Garrison Rally Flags & faint tether when selected
      for (let i = 0; i < this.towers.length; i++) {
        const t = this.towers[i];
        if (t.type !== 'garrison' || !t.rallyPoint) continue;
        const rp = t.rallyPoint;
        const isSelected = game && game.selectedTower === t;
        const isRohan = t.tier === 3 && t.branch === 'B';

        if (isSelected) {
          ctx.save();
          ctx.strokeStyle = 'rgba(129, 199, 132, 0.55)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.moveTo(t.x, t.y);
          ctx.lineTo(rp.x, rp.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

        // Planted Rally Flag
        ctx.save();
        ctx.translate(rp.x, rp.y);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 2, 6, 2.5, 0, 0, TWO_PI);
        ctx.fill();

        ctx.strokeStyle = '#eceff1';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 2);
        ctx.lineTo(0, -16);
        ctx.stroke();

        const flutter = Math.sin(time * 6 + t.id) * 2;
        ctx.fillStyle = isRohan ? '#2e7d32' : '#1e88e5';
        ctx.beginPath();
        ctx.moveTo(0, -16);
        ctx.lineTo(11, -12.5 + flutter);
        ctx.lineTo(0, -9);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // 3. Y-sorted towers for clean depth layering
      this._sortedRenderList.length = 0;
      for (let i = 0; i < this.towers.length; i++) {
        this._sortedRenderList.push(this.towers[i]);
      }
      this._sortedRenderList.sort((a, b) => a.y - b.y);

      for (let i = 0; i < this._sortedRenderList.length; i++) {
        this._sortedRenderList[i].render(ctx, time, game);
      }

      // 4. Garrison Soldiers
      for (let i = 0; i < this.towers.length; i++) {
        const t = this.towers[i];
        if (t.type !== 'garrison') continue;
        for (let j = 0; j < t.soldiers.length; j++) {
          t.soldiers[j].render(ctx, time);
        }
      }

      // 5. Continuous Flame of Anor beams (rendered smoothly every frame!)
      for (let i = 0; i < this.towers.length; i++) {
        const t = this.towers[i];
        if (t.type === 'istari' && t.tier === 3 && t.branch === 'A' && t.beamTarget && t.stunTimer <= 0) {
          const bt = t.beamTarget;
          if (!bt.dead && !bt.reachedExit) {
            const rampFrac = clamp((t.beamRampMult - 1.0) / 2.5, 0, 1);
            const sx = t.x;
            const sy = t.y - 30 + Math.sin(time * 3.6) * 2.2;

            ctx.save();
            ctx.lineCap = 'round';
            // Outer fiery corona
            ctx.strokeStyle = `rgba(255, 111, 0, ${0.42 + 0.35 * rampFrac})`;
            ctx.lineWidth = 6 + rampFrac * 8 + Math.sin(time * 24) * 1.2;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(bt.x, bt.y);
            ctx.stroke();

            // Inner white-gold Anor core
            ctx.strokeStyle = '#fff8e1';
            ctx.lineWidth = 2.2 + rampFrac * 3.2;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(bt.x, bt.y);
            ctx.stroke();

            // Impact sunflare on target
            ctx.fillStyle = 'rgba(255, 224, 130, 0.78)';
            ctx.beginPath();
            ctx.arc(bt.x, bt.y, 6 + rampFrac * 6, 0, TWO_PI);
            ctx.fill();
            ctx.restore();
          }
        }
      }

      // 6. Active Projectiles
      for (let i = 0; i < this.projectiles.length; i++) {
        const p = this.projectiles[i];
        ctx.save();

        if (p.kind === 'boulder' || p.kind === 'mortar') {
          const t = clamp(p.progress, 0, 1);
          const elevY = p.y - p.arcHeight * 4 * t * (1 - t);

          // Ground shadow along trajectory
          ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, 6 * (1 - 0.35 * Math.sin(t * Math.PI)), 3.2, 0, 0, TWO_PI);
          ctx.fill();

          // Elevated shell / boulder
          ctx.translate(p.x, elevY);
          ctx.rotate(t * 9);
          ctx.fillStyle = p.isFire ? '#3e2723' : '#78909c';
          ctx.beginPath();
          ctx.arc(0, 0, p.isFire ? 6.5 : 5.8, 0, TWO_PI);
          ctx.fill();
          if (p.isFire) {
            ctx.fillStyle = '#ff9800';
            ctx.beginPath();
            ctx.arc(1.5, -1.5, 3.2, 0, TWO_PI);
            ctx.fill();
          }
        } else if (p.kind === 'ballista_bolt' || p.kind === 'mithril_bolt') {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          const isMithril = p.kind === 'mithril_bolt';
          ctx.strokeStyle = isMithril ? '#80deea' : '#cfd8dc';
          ctx.lineWidth = isMithril ? 3.4 : 2.5;
          ctx.beginPath();
          ctx.moveTo(-12, 0);
          ctx.lineTo(10, 0);
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(13, 0);
          ctx.lineTo(7, -3.5);
          ctx.lineTo(7, 3.5);
          ctx.closePath();
          ctx.fill();
        } else if (p.kind === 'arcane_bolt') {
          ctx.translate(p.x, p.y);
          ctx.fillStyle = 'rgba(79, 195, 247, 0.42)';
          ctx.beginPath();
          ctx.arc(0, 0, 7.5, 0, TWO_PI);
          ctx.fill();
          ctx.fillStyle = '#e1f5fe';
          ctx.beginPath();
          ctx.arc(0, 0, 3.8, 0, TWO_PI);
          ctx.fill();
        } else {
          // Elven silver arrow / Starlight Piercer
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          const isStar = p.kind === 'starlight_arrow';
          ctx.strokeStyle = p.color;
          ctx.lineWidth = isStar ? 2.8 : 1.7;
          ctx.beginPath();
          ctx.moveTo(-9, 0);
          ctx.lineTo(8, 0);
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(10, 0);
          ctx.lineTo(5.5, -2.5);
          ctx.lineTo(5.5, 2.5);
          ctx.closePath();
          ctx.fill();
        }

        ctx.restore();
      }

      // 7. Black Breath Stun Fog & Boss Curse "CLICK x3!" Chains on top
      for (let i = 0; i < this._sortedRenderList.length; i++) {
        this._sortedRenderList[i].renderStatusOverlay(ctx, time);
      }
    }

    // Flexible icon portrait renderer supporting both (ctx, typeKey, tier, branch, w, h)
    // and (<canvas>, typeKey, ...) or 4-arg (ctx, typeKey, w, h) overloads!
    renderIcon(ctxOrCanvas, typeKey, tierOrW, branchOrH, maybeW, maybeH) {
      if (!ctxOrCanvas) return;
      let ctx = ctxOrCanvas;
      if (typeof ctxOrCanvas.getContext === 'function') {
        ctx = ctxOrCanvas.getContext('2d');
      }
      if (!ctx) return;

      let tier = 1;
      let branch = null;
      let w = 56;
      let h = 56;

      if (maybeW === undefined && typeof tierOrW === 'number' && typeof branchOrH === 'number' && tierOrW >= 16) {
        w = tierOrW;
        h = branchOrH;
      } else {
        tier = tierOrW || 1;
        branch = branchOrH || null;
        w = maybeW || (ctx.canvas ? ctx.canvas.width : 56);
        h = maybeH || (ctx.canvas ? ctx.canvas.height : 56);
      }

      ctx.save();
      ctx.clearRect(0, 0, w, h);

      // Atmospheric medallion backdrop
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.45, 4, w * 0.5, h * 0.5, Math.max(w, h) * 0.55);
      grad.addColorStop(0, '#2c3542');
      grad.addColorStop(1, '#14181f');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(1, 1, w - 2, h - 2, 8) : ctx.rect(1, 1, w - 2, h - 2);
      ctx.fill();

      ctx.strokeStyle = tier === 3 ? (branch === 'A' ? '#ffd54f' : '#8be0ff') : '#8c6b28';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      const scale = Math.min(w, h) / 62;
      ctx.translate(w * 0.5, h * 0.66);
      ctx.scale(scale, scale);

      drawTowerVisual(ctx, typeKey, tier, branch, 1.2, -0.35, 0, 0, 0.35, 2.2);
      ctx.restore();
    }
  }

  TowerManager.renderIcon = TowerManager.prototype.renderIcon;
  TD.Tower = Tower;
  TD.Soldier = Soldier;
  TD.TowerManager = TowerManager;
})(window.TD = window.TD || {});
