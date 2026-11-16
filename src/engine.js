(function(TD) {
  'use strict';

  TD.WIDTH = 1280;
  TD.HEIGHT = 720;

  TD.DIFFICULTY_LIST = ['ranger', 'captain', 'steward'];

  TD.DIFFICULTIES = {
    ranger: {
      id: 'ranger',
      name: 'Ranger',
      label: 'Scout of Ithilien',
      startGold: 320,
      lives: 20,
      hpMult: 0.85,
      speedMult: 0.95,
      rewardMult: 1.1,
      desc: 'Generous treasury and weakened Mordor vanguard.'
    },
    captain: {
      id: 'captain',
      name: 'Captain',
      label: 'Captain of the West',
      startGold: 260,
      lives: 20,
      hpMult: 1.0,
      speedMult: 1.0,
      rewardMult: 1.0,
      desc: 'Balanced Middle-earth siege warfare as intended.'
    },
    steward: {
      id: 'steward',
      name: 'Steward',
      label: 'Steward\'s Vigil',
      startGold: 220,
      lives: 20,
      hpMult: 1.25,
      speedMult: 1.08,
      rewardMult: 0.92,
      desc: 'Scarce gold against a relentless, iron-clad host.'
    }
  };

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  /**
   * Uniform 96px spatial hash grid over 1280x720 logical coordinates.
   * Rebuilt each simulation tick without heap allocations.
   */
  class SpatialGrid {
    constructor(width = TD.WIDTH, height = TD.HEIGHT, cellSize = 96) {
      this.width = width;
      this.height = height;
      this.cellSize = cellSize;
      this.invCellSize = 1 / cellSize;
      this.cols = Math.ceil(width / cellSize);
      this.rows = Math.ceil(height / cellSize);
      const total = this.cols * this.rows;
      this.cells = new Array(total);
      for (let i = 0; i < total; i++) {
        this.cells[i] = [];
      }
      // Ring of reusable result buffers so even nested queryCircle calls
      // (e.g., tower target search -> chain lightning bounce search) never allocate.
      this._scratchRing = new Array(16);
      for (let i = 0; i < 16; i++) {
        this._scratchRing[i] = [];
      }
      this._scratchIdx = 0;
    }

    clear() {
      const cells = this.cells;
      for (let i = 0, n = cells.length; i < n; i++) {
        cells[i].length = 0;
      }
    }

    insert(enemy) {
      if (!enemy || enemy.dead || enemy.reachedExit || enemy.hp <= 0) return;
      const col = clamp((enemy.x * this.invCellSize) | 0, 0, this.cols - 1);
      const row = clamp((enemy.y * this.invCellSize) | 0, 0, this.rows - 1);
      this.cells[row * this.cols + col].push(enemy);
    }

    rebuild(enemies) {
      this.clear();
      if (!enemies) return;
      for (let i = 0, n = enemies.length; i < n; i++) {
        const e = enemies[i];
        if (!e || e.dead || e.reachedExit || e.hp <= 0) continue;
        const col = clamp(Math.floor(e.x * this.invCellSize), 0, this.cols - 1);
        const row = clamp(Math.floor(e.y * this.invCellSize), 0, this.rows - 1);
        this.cells[row * this.cols + col].push(e);
      }
    }

    build(enemies) {
      this.rebuild(enemies);
    }

    update(enemies) {
      this.rebuild(enemies);
    }

    _nextScratch() {
      const arr = this._scratchRing[this._scratchIdx];
      this._scratchIdx = (this._scratchIdx + 1) & 15;
      arr.length = 0;
      return arr;
    }

    queryCircle(x, y, radius, out) {
      const res = out || this._nextScratch();
      if (out) res.length = 0;
      if (!(radius > 0)) return res;

      // Pad cell bounds by 1 cell on edges so enemies slightly off-canvas at
      // spawn portals (clamped into border cells) are still checked accurately.
      const minCol = clamp(Math.floor((x - radius) * this.invCellSize), 0, this.cols - 1);
      const maxCol = clamp(Math.floor((x + radius) * this.invCellSize), 0, this.cols - 1);
      const minRow = clamp(Math.floor((y - radius) * this.invCellSize), 0, this.rows - 1);
      const maxRow = clamp(Math.floor((y + radius) * this.invCellSize), 0, this.rows - 1);
      const rSq = radius * radius;
      const cols = this.cols;
      const cells = this.cells;

      for (let r = minRow; r <= maxRow; r++) {
        const rowOffset = r * cols;
        for (let c = minCol; c <= maxCol; c++) {
          const bucket = cells[rowOffset + c];
          for (let i = 0, len = bucket.length; i < len; i++) {
            const e = bucket[i];
            if (e.dead || e.reachedExit || e.hp <= 0) continue;
            const dx = e.x - x;
            const dy = e.y - y;
            if (dx * dx + dy * dy <= rSq) {
              res.push(e);
            }
          }
        }
      }
      return res;
    }
  }

  TD.SpatialGrid = SpatialGrid;

  /**
   * Core Game Controller, Fixed-Substep Simulation Loop, Ring of Power,
   * Player Spellbook, Input & Tactical Canvas Range/Reticle Renderer.
   */
  class Game {
    constructor(options = {}) {
      this.width = TD.WIDTH;
      this.height = TD.HEIGHT;

      this.state = 'title'; // 'title' | 'playing' | 'paused' | 'victory' | 'defeat'
      this.mapId = options.mapId || (TD.MAP_LIST && TD.MAP_LIST[0]) || 'hornburg';
      this.difficultyId = options.difficultyId || 'captain';
      this.difficulty = TD.DIFFICULTIES[this.difficultyId] || TD.DIFFICULTIES.captain;
      this.map = (TD.MAPS && TD.MAPS[this.mapId]) || null;

      this.gold = this.difficulty.startGold;
      this.lives = this.difficulty.lives;
      this.maxLives = this.difficulty.lives;
      this.wave = 0;
      this.maxWaves = 15;
      this.endless = false;
      this.isEndless = false;
      this.endlessMode = false;
      this.speed = 1; // 1 | 2 | 3

      this.time = 0;
      this.simTime = 0;

      // The One Ring & Corruption state
      this.ringActive = false;
      this.corruption = 0; // 0..100
      this.ringOverloadTimer = 0;

      // Player Spellbook
      this.spells = {
        light: {
          id: 'light',
          key: '1',
          name: 'Light of Eärendil',
          cooldown: 45,
          maxCooldown: 45,
          cd: 0,
          remaining: 0,
          timer: 0,
          radius: 150,
          stunSec: 2.5,
          revealSec: 30
        },
        eagles: {
          id: 'eagles',
          key: '2',
          name: 'Great Eagles Strike',
          cooldown: 70,
          maxCooldown: 70,
          cd: 0,
          remaining: 0,
          timer: 0,
          halfWidth: 95,
          length: 520,
          damage: 340
        }
      };

      // Selection & Targeting state
      this.selectedPad = null;
      this.selectedTower = null;
      this.hoveredPad = null;
      this.hoveredTower = null;
      this.previewRange = null; // { range, minRange, mode: 'build'|'upgrade', valid, x, y }
      this.activeSpell = null;  // 'light' | 'eagles' | null
      this.rallyTower = null;   // Garrison tower currently placing rally point

      this.pointerX = TD.WIDTH * 0.5;
      this.pointerY = TD.HEIGHT * 0.5;
      this.pointerOnCanvas = false;

      // Screen feedback
      this.shakeTimer = 0;
      this.shakeDuration = 0;
      this.shakeIntensity = 0;
      this.screenFlash = null;

      // Siege summary statistics
      this.stats = this._createFreshStats();

      // DOM & Canvas handles
      this.appEl = null;
      this.stageEl = null;
      this.webglCanvas = null;
      this.hudCanvas = null;
      this.hudCtx = null;
      this.legacyCanvas = null;
      this.canvas = null;
      this.ctx = null;
      this.uiLayerEl = null;
      this._hudW = 0;
      this._hudH = 0;
      this._hudDpr = 1;

      // Subsystems
      this.spatialGrid = new SpatialGrid(TD.WIDTH, TD.HEIGHT, 96);
      this.sound = null;
      this.scene3d = null;
      this.env3d = null;
      this.environment3d = null;
      this.models3d = null;
      this.vfx3d = null;
      this.vfx = null;
      this.mapRenderer = null;
      this.enemies = null;
      this.towers = null;
      this.ui = null;
      this._loaded3DMapId = null;
      this._lastRenderDt = 1 / 60;
      this._stagedModelRigs = [];

      this._rafId = 0;
      this._lastFrameMs = 0;
      this._initialized = false;
      this._boundRaf = this._onAnimationFrame.bind(this);
    }

    _createFreshStats() {
      return {
        kills: 0,
        goldEarned: 0,
        damageDealt: 0,
        towersBuilt: 0,
        spellsCast: 0,
        ringTime: 0,
        wraithsSummoned: 0,
        wavesCleared: 0
      };
    }

    get kills() {
      return this.stats.kills;
    }

    set kills(v) {
      this.stats.kills = v;
    }

    init() {
      if (this._initialized) return this;
      this._initialized = true;

      this._setupDOM();
      this._initSubsystems();
      this._bindEvents();
      this.fitStage();

      if (this.map && this.mapRenderer && typeof this.mapRenderer.initMap === 'function') {
        this.mapRenderer.initMap(this.mapId);
      }

      // Build live 3D stronghold diorama right away so Title Screen renders over the 3D vista
      this.loadMap3D(this.mapId);
      if (this.scene3d && typeof this.scene3d.prewarmGpuPoolAssets === 'function') {
        this.scene3d.prewarmGpuPoolAssets();
        this._syncDetachedModelPools();
      }

      if (this.ui) {
        if (typeof this.ui.init === 'function') this.ui.init(this);
        if (typeof this.ui.showTitle === 'function') this.ui.showTitle(this);
        if (typeof this.ui.onStateChange === 'function') this.ui.onStateChange(this.state, this);
        if (typeof this.ui.update === 'function') this.ui.update(0, this);
      }

      this.render();
      this.startLoop();
      return this;
    }

    _setupDOM() {
      if (typeof document === 'undefined') return;

      this.appEl = document.getElementById('app') || document.body;
      this.stageEl = document.getElementById('game-stage');
      if (!this.stageEl) {
        this.stageEl = document.createElement('div');
        this.stageEl.id = 'game-stage';
        this.appEl.appendChild(this.stageEl);
      }

      // 1. Primary 3D WebGL2 Canvas (#webgl-canvas)
      this.webglCanvas = document.getElementById('webgl-canvas');
      if (!this.webglCanvas) {
        this.webglCanvas = document.createElement('canvas');
        this.webglCanvas.id = 'webgl-canvas';
        this.stageEl.insertBefore(this.webglCanvas, this.stageEl.firstChild);
      }
      this.webglCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;z-index:1;cursor:crosshair;touch-action:none;';

      // 2. Crisp Transparent 2D Screen-Projected HUD Overlay Canvas (#hud-canvas)
      this.hudCanvas = document.getElementById('hud-canvas');
      if (!this.hudCanvas) {
        this.hudCanvas = document.createElement('canvas');
        this.hudCanvas.id = 'hud-canvas';
        if (this.webglCanvas.nextSibling) {
          this.stageEl.insertBefore(this.hudCanvas, this.webglCanvas.nextSibling);
        } else {
          this.stageEl.appendChild(this.hudCanvas);
        }
      }
      this.hudCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;z-index:2;pointer-events:none;';
      this.hudCtx = this.hudCanvas.getContext('2d');

      // Optional legacy 2D canvas fallback handle if WebGL is unavailable
      this.legacyCanvas = document.getElementById('game-canvas');
      if (this.legacyCanvas) {
        this.legacyCanvas.style.display = 'none';
      }

      this.canvas = this.webglCanvas;
      this.ctx = this.hudCtx;

      this.uiLayerEl = document.getElementById('ui-layer');
      if (!this.uiLayerEl) {
        this.uiLayerEl = document.createElement('div');
        this.uiLayerEl.id = 'ui-layer';
        this.stageEl.appendChild(this.uiLayerEl);
      }
    }

    _initSubsystems() {
      this.sound = TD.SoundEngine ? new TD.SoundEngine() : this._createNoopSound();

      if (TD.MAPS && !this.map) {
        this.map = TD.MAPS[this.mapId] || TD.MAPS[Object.keys(TD.MAPS)[0]] || null;
      }

      // Initialize Three.js 3D Scene, Environment, Models & 3D VFX
      if (TD.Scene3D && typeof window !== 'undefined' && window.THREE) {
        this.scene3d = new TD.Scene3D(this, { canvas: this.webglCanvas });
        if (this.scene3d && this.scene3d.isReady) {
          if (TD.Environment3D) {
            this.env3d = new TD.Environment3D(this.scene3d);
            this.environment3d = this.env3d;
            this.scene3d.env3d = this.env3d;
            this.scene3d.env = this.env3d;
            this.scene3d.environment = this.env3d;
          }
          if (TD.Models3D) {
            this.models3d = new TD.Models3D(this.scene3d);
            this.scene3d.models3d = this.models3d;
            this.scene3d.models = this.models3d;
          }
          if (TD.VFX3D) {
            this.vfx3d = new TD.VFX3D(this.scene3d);
            this.scene3d.vfx3d = this.vfx3d;
            this.scene3d.vfx = this.vfx3d;
          }
        } else {
          this.scene3d = null;
        }
      }

      // Wire 3D VFX with safe fallback methods so all combat hooks work seamlessly
      if (this.vfx3d) {
        const fallback = this._createNoopVfx();
        for (const key of Object.keys(fallback)) {
          if (typeof this.vfx3d[key] !== 'function') {
            this.vfx3d[key] = fallback[key];
          }
        }
        if (typeof this.vfx3d.spawnExplosion !== 'function') {
          this.vfx3d.spawnExplosion = (x, y, radius, color) => {
            this.vfx3d.spawnShockwave(x, y, radius || 48, color || '#ff6d00', 0.42);
            this.vfx3d.spawnBurst(x, y, { color: color || '#ff8f00', count: 16, speed: 120, life: 0.45, size: 3.5, kind: 'fire' });
          };
        }
        this.vfx = this.vfx3d;
      } else {
        this.vfx = TD.VFX ? new TD.VFX() : this._createNoopVfx();
      }

      // Keep 2D MapRenderer available for HUD minimap / map card previews (and non-WebGL fallback)
      if (TD.MapRenderer) {
        this.mapRenderer = typeof TD.MapRenderer === 'function'
          ? new TD.MapRenderer()
          : TD.MapRenderer;
      }

      if (!this.scene3d && this.legacyCanvas) {
        this.webglCanvas.style.display = 'none';
        this.hudCanvas.style.display = 'none';
        this.legacyCanvas.style.display = 'block';
        this.legacyCanvas.width = TD.WIDTH;
        this.legacyCanvas.height = TD.HEIGHT;
        this.canvas = this.legacyCanvas;
        this.ctx = this.legacyCanvas.getContext('2d');
      }

      if (TD.EnemyManager) {
        this.enemies = new TD.EnemyManager(this);
      }

      if (TD.TowerManager) {
        this.towers = new TD.TowerManager(this);
      }

      if (TD.UI) {
        this.ui = new TD.UI(this);
      }
    }

    loadMap3D(mapId) {
      const targetId = (mapId && TD.MAPS && TD.MAPS[mapId]) ? mapId : this.mapId;
      const mapData = (TD.MAPS && TD.MAPS[targetId]) || this.map;
      if (!mapData) return;

      this.mapId = targetId;
      this.map = mapData;

      if (this.models3d && typeof this.models3d.reset === 'function') {
        this.models3d.reset();
        this._syncDetachedModelPools();
      }
      if (this.vfx3d && typeof this.vfx3d.reset === 'function') {
        this.vfx3d.reset();
      }
      if (this.scene3d && typeof this.scene3d.loadMap === 'function') {
        this.scene3d.loadMap(targetId, mapData);
        this._loaded3DMapId = targetId;
      }
    }

    setPreviewMap(mapId) {
      if (mapId && TD.MAPS && TD.MAPS[mapId] && mapId !== this._loaded3DMapId) {
        this.loadMap3D(mapId);
      }
    }

    _createNoopSound() {
      const noop = function() {};
      return {
        muted: false,
        setMuted: noop,
        toggleMute: function() { this.muted = !this.muted; return this.muted; },
        unlock: noop,
        playBow: noop,
        playBallista: noop,
        playCatapultLaunch: noop,
        playExplosion: noop,
        playMagicBolt: noop,
        playLightning: noop,
        playBeamTick: noop,
        playSwordClash: noop,
        playWargLeap: noop,
        playHorn: noop,
        playClick: noop,
        playBuild: noop,
        playUpgrade: noop,
        playSell: noop,
        playSpellLight: noop,
        playSpellEagles: noop,
        playWraithSpawn: noop,
        playBossRoar: noop,
        playCurseBreak: noop,
        playVictory: noop,
        playDefeat: noop,
        setRingHum: noop,
        pauseAll: noop,
        resumeAll: noop
      };
    }

    _createNoopVfx() {
      const noop = function() {};
      return {
        reset: noop,
        update: noop,
        spawnBurst: noop,
        spawnTrail: noop,
        spawnFloatingText: noop,
        spawnLightningArc: noop,
        spawnBeam: noop,
        spawnShockwave: noop,
        spawnLightOfEarendil: noop,
        spawnGreatEagles: noop,
        renderGround: noop,
        renderAir: noop
      };
    }

    /**
     * Resizes WebGL2 Three.js renderer, post-processing composer, and crisp 2D HUD overlay canvas
     * to match #game-stage / full viewport cleanly with zero letterbox bars.
     */
    fitStage() {
      if (typeof window === 'undefined' || !this.stageEl) return;
      const vw = Math.max(320, window.innerWidth || TD.WIDTH);
      const vh = Math.max(240, window.innerHeight || TD.HEIGHT);
      const rect = this.stageEl.getBoundingClientRect ? this.stageEl.getBoundingClientRect() : null;
      const sw = (rect && rect.width > 64) ? rect.width : vw;
      const sh = (rect && rect.height > 64) ? rect.height : vh;

      const scale = Math.min(vw / TD.WIDTH, vh / TD.HEIGHT);
      this.stageScale = scale;
      this.stageEl.style.setProperty('--stage-scale', String(scale));

      if (this.scene3d && this.scene3d.isReady) {
        this.scene3d.resize(sw, sh);
      }
      this._syncHudCanvasSize(sw, sh);
    }

    _syncHudCanvasSize(sw, sh) {
      if (!this.hudCanvas || typeof window === 'undefined') return;
      const w = Math.max(320, Math.round(sw || window.innerWidth || TD.WIDTH));
      const h = Math.max(240, Math.round(sh || window.innerHeight || TD.HEIGHT));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (this._hudW !== w || this._hudH !== h || this._hudDpr !== dpr) {
        this._hudW = w;
        this._hudH = h;
        this._hudDpr = dpr;
        this.hudCanvas.width = Math.round(w * dpr);
        this.hudCanvas.height = Math.round(h * dpr);
        this.hudCanvas.logicalWidth = w;
        this.hudCanvas.logicalHeight = h;
      }
    }

    /**
     * Converts client pointer coordinates to logical 1280x720 game space via 3D raycasting
     * (against 3D tower/pad hit-volumes and the 3D terrain mesh), with 2D fallback.
     */
    clientToCanvas(e) {
      const touch = (e && e.touches && e.touches[0]) || (e && e.changedTouches && e.changedTouches[0]) || null;
      const cx = touch ? touch.clientX : (e ? e.clientX : 0);
      const cy = touch ? touch.clientY : (e ? e.clientY : 0);

      if (this.scene3d && this.scene3d.isReady) {
        return this.scene3d.raycastGamePos(cx, cy, this);
      }

      if (!this.canvas) {
        return { x: cx || 0, y: cy || 0 };
      }
      const rect = this.canvas.getBoundingClientRect();
      const rw = rect.width > 0 ? rect.width : TD.WIDTH;
      const rh = rect.height > 0 ? rect.height : TD.HEIGHT;
      return {
        x: ((cx - rect.left) * TD.WIDTH) / rw,
        y: ((cy - rect.top) * TD.HEIGHT) / rh
      };
    }

    /**
     * Converts logical 1280x720 coordinates into viewport screen percentages / px for #ui-layer markers.
     */
    canvasToPercent(x, y, extraY = 0) {
      if (this.scene3d && this.scene3d.isReady) {
        const p = this.scene3d.projectToScreen(x, y, extraY);
        return {
          leftPct: p.leftPct,
          topPct: p.topPct,
          x: p.x,
          y: p.y,
          visible: p.visible
        };
      }
      return {
        leftPct: (x / TD.WIDTH) * 100,
        topPct: (y / TD.HEIGHT) * 100,
        x: x,
        y: y,
        visible: true
      };
    }

    _bindEvents() {
      if (typeof window === 'undefined' || !this.canvas) return;

      window.addEventListener('resize', () => this.fitStage());
      window.addEventListener('pointerup', () => {
        if (this.scene3d) this.scene3d.onPointerUp();
      });

      this.canvas.addEventListener('wheel', (e) => {
        if (this.scene3d && this.scene3d.isReady) {
          e.preventDefault();
          this.scene3d.onWheel(e);
        }
      }, { passive: false });

      this.canvas.addEventListener('pointermove', (e) => {
        if (this.scene3d) this.scene3d.onPointerMove(e);
        const pt = this.clientToCanvas(e);
        this.pointerX = pt.x;
        this.pointerY = pt.y;
        this.pointerOnCanvas = true;
        this._updateHover(pt.x, pt.y, pt);
      });

      this.canvas.addEventListener('pointerleave', () => {
        this.pointerOnCanvas = false;
        this.hoveredPad = null;
        this.hoveredTower = null;
      });

      this.canvas.addEventListener('pointerdown', (e) => {
        if (this.sound && this.sound.unlock) this.sound.unlock();
        if (this.scene3d) this.scene3d.onPointerDown(e);

        if (e.button === 2) {
          if (this.activeSpell || this.rallyTower) {
            e.preventDefault();
            this.cancelTargeting();
          }
          return;
        }
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        const pt = this.clientToCanvas(e);
        this.pointerX = pt.x;
        this.pointerY = pt.y;
        this.handleCanvasClick(pt.x, pt.y, e, pt);
      });

      this.canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (this.scene3d && this.scene3d.didRightDrag) {
          this.scene3d.didRightDrag = false;
          return;
        }
        if (this.activeSpell || this.rallyTower) {
          this.cancelTargeting();
        } else if (this.selectedPad || this.selectedTower) {
          this.clearSelection();
        }
      });

      window.addEventListener('keydown', (e) => this._handleKeyDown(e));
    }

    _updateHover(x, y, hitInfo) {
      if (this.state !== 'playing' && this.state !== 'paused') {
        this.hoveredPad = null;
        this.hoveredTower = null;
        return;
      }
      this.hoveredTower = (hitInfo && hitInfo.tower)
        ? hitInfo.tower
        : ((this.towers && this.towers.getTowerAt) ? this.towers.getTowerAt(x, y, 32) : null);
      this.hoveredPad = (hitInfo && hitInfo.pad)
        ? hitInfo.pad
        : this.findPadAt(x, y, 30);
    }

    findPadAt(x, y, radius = 30) {
      if (!this.map || !this.map.pads) return null;
      let best = null;
      let bestDistSq = radius * radius;
      for (let i = 0; i < this.map.pads.length; i++) {
        const pad = this.map.pads[i];
        const hitR = Math.max(radius, (pad.radius || 24) + 6);
        const dx = pad.x - x;
        const dy = pad.y - y;
        const dSq = dx * dx + dy * dy;
        if (dSq <= hitR * hitR && dSq <= bestDistSq + 144) {
          if (!best || dSq < bestDistSq) {
            best = pad;
            bestDistSq = dSq;
          }
        }
      }
      return best;
    }

    handleCanvasClick(x, y, _event, hitInfo) {
      if (this.state !== 'playing' && this.state !== 'paused') return false;

      // 1. Highest priority: Rapid-clicking a Boss-cursed tower shatters the curse immediately
      const cursedCandidate = (hitInfo && hitInfo.tower && (hitInfo.tower.curseClicksRemaining > 0 || hitInfo.tower.isCursed))
        ? hitInfo.tower
        : ((this.towers && typeof this.towers.getTowerAt === 'function') ? this.towers.getTowerAt(x, y, 38) : null);
      if (cursedCandidate && (cursedCandidate.curseClicksRemaining > 0 || cursedCandidate.isCursed)) {
        if (typeof cursedCandidate.clickCurseBreak === 'function') {
          cursedCandidate.clickCurseBreak(this);
          this._notifyUI();
          return true;
        }
      }

      // 2. Active Spell Targeting
      if (this.activeSpell) {
        return this.castSpell(this.activeSpell, x, y);
      }

      // 3. Garrison Rally Point Placement
      if (this.rallyTower) {
        return this.confirmRallyPlacement(x, y);
      }

      // 4. Tower or Empty Foundation Pad selection
      const tower = (hitInfo && hitInfo.tower)
        ? hitInfo.tower
        : ((this.towers && this.towers.getTowerAt) ? this.towers.getTowerAt(x, y, 30) : null);
      if (tower) {
        this.selectTower(tower);
        return true;
      }

      const pad = (hitInfo && hitInfo.pad) ? hitInfo.pad : this.findPadAt(x, y, 30);
      if (pad) {
        const occupant = (this.towers && this.towers.getTowerOnPad)
          ? this.towers.getTowerOnPad(pad.id)
          : null;
        if (occupant) {
          this.selectTower(occupant);
        } else {
          this.selectPad(pad);
        }
        return true;
      }

      // 5. Empty ground click closes contextual dock selection
      this.clearSelection();
      return false;
    }

    _handleKeyDown(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (this.sound && this.sound.unlock) this.sound.unlock();

      const key = e.key;
      if (key === ' ' || e.code === 'Space') {
        if (this.state === 'playing' || this.state === 'paused') {
          e.preventDefault();
          if (this._isCodexOpen()) {
            this._closeCodex();
          } else {
            this.togglePause();
          }
        }
        return;
      }

      if (key === 'Escape') {
        if (this.activeSpell || this.rallyTower) {
          e.preventDefault();
          this.cancelTargeting();
          return;
        }
        if (this._isCodexOpen()) {
          e.preventDefault();
          this._closeCodex();
          return;
        }
        if (this.selectedTower || this.selectedPad) {
          e.preventDefault();
          this.clearSelection();
          return;
        }
        if (this.state === 'playing' || this.state === 'paused') {
          e.preventDefault();
          this.togglePause();
        }
        return;
      }

      if (this.state !== 'playing' && this.state !== 'paused') return;

      if (key === '1') {
        e.preventDefault();
        this.selectSpell('light');
      } else if (key === '2') {
        e.preventDefault();
        this.selectSpell('eagles');
      } else if (key === 'r' || key === 'R') {
        if (this.state === 'playing') {
          e.preventDefault();
          this.toggleRing();
        }
      }
    }

    _isCodexOpen() {
      if (!this.ui) return false;
      if (typeof this.ui.isCodexOpen === 'function') return !!this.ui.isCodexOpen();
      if (typeof this.ui.codexOpen === 'boolean') return this.ui.codexOpen;
      const modal = typeof document !== 'undefined' && document.getElementById('codex-modal');
      return !!(modal && !modal.hidden && !modal.classList.contains('hidden'));
    }

    _closeCodex() {
      if (!this.ui) return;
      if (typeof this.ui.closeCodex === 'function') {
        this.ui.closeCodex();
      } else if (typeof this.ui.toggleCodex === 'function' && this._isCodexOpen()) {
        this.ui.toggleCodex(false);
      }
    }

    _notifyUI() {
      if (!this.ui) return;
      if (typeof this.ui.refreshInspector === 'function') {
        this.ui.refreshInspector(this);
      } else if (typeof this.ui.onSelectionChange === 'function') {
        this.ui.onSelectionChange(this);
      }
      if (typeof this.ui.update === 'function') {
        this.ui.update(0, this);
      }
    }

    /* =====================================================================
     * Siege Lifecycle & State Transitions
     * ===================================================================== */

    startGame(mapId, difficultyId) {
      if (mapId && TD.MAPS && TD.MAPS[mapId]) {
        this.mapId = mapId;
      }
      if (difficultyId && TD.DIFFICULTIES[difficultyId]) {
        this.difficultyId = difficultyId;
      }
      this.difficulty = TD.DIFFICULTIES[this.difficultyId] || TD.DIFFICULTIES.captain;
      this.map = (TD.MAPS && TD.MAPS[this.mapId]) || this.map;

      this.gold = this.difficulty.startGold;
      this.lives = this.difficulty.lives;
      this.maxLives = this.difficulty.lives;
      this.wave = 0;
      this.maxWaves = 15;
      this.endless = false;
      this.isEndless = false;
      this.endlessMode = false;
      this.speed = 1;
      this.simTime = 0;

      this.ringActive = false;
      this.corruption = 0;
      this.ringOverloadTimer = 0;

      for (const k of Object.keys(this.spells)) {
        this.spells[k].cd = 0;
        this.spells[k].remaining = 0;
        this.spells[k].timer = 0;
      }

      this.selectedPad = null;
      this.selectedTower = null;
      this.previewRange = null;
      this.activeSpell = null;
      this.rallyTower = null;
      this.shakeTimer = 0;
      this.screenFlash = null;
      this.stats = this._createFreshStats();

      if (this.sound) {
        if (this.sound.unlock) this.sound.unlock();
        if (this.sound.setRingHum) this.sound.setRingHum(false);
        if (this.sound.resumeAll) this.sound.resumeAll();
      }
      if (this.vfx && this.vfx.reset) this.vfx.reset();
      this.spatialGrid.clear();
      if (this.enemies && this.enemies.reset) this.enemies.reset(this);
      if (this.towers && this.towers.reset) this.towers.reset(this);
      if (this.models3d && typeof this.models3d.reset === 'function') {
        this.models3d.reset();
        this._syncDetachedModelPools();
      }
      if (this.mapRenderer && this.mapRenderer.initMap) {
        this.mapRenderer.initMap(this.mapId);
      }
      if (this.scene3d) {
        if (this._loaded3DMapId !== this.mapId) {
          this.loadMap3D(this.mapId);
        }
        if (typeof this.scene3d.resetCameraView === 'function') {
          this.scene3d.resetCameraView();
        }
      }

      this.state = 'playing';
      if (this.ui) {
        if (typeof this.ui.onGameStart === 'function') this.ui.onGameStart(this);
        if (typeof this.ui.onStateChange === 'function') this.ui.onStateChange(this.state, this);
        if (typeof this.ui.refreshInspector === 'function') this.ui.refreshInspector(this);
        if (typeof this.ui.update === 'function') this.ui.update(0, this);
      }
      return this;
    }

    beginSiege(mapId, difficultyId) {
      return this.startGame(mapId, difficultyId);
    }

    startSiege(mapId, difficultyId) {
      return this.startGame(mapId, difficultyId);
    }

    restartSiege() {
      return this.startGame(this.mapId, this.difficultyId);
    }

    restart() {
      return this.restartSiege();
    }

    returnToTitle() {
      this.ringActive = false;
      if (this.sound && this.sound.setRingHum) this.sound.setRingHum(false);
      this.cancelTargeting();
      this.clearSelection();
      if (this.models3d && typeof this.models3d.reset === 'function') {
        this.models3d.reset();
        this._syncDetachedModelPools();
      }
      if (this.vfx && typeof this.vfx.reset === 'function') {
        this.vfx.reset();
      }
      if (this.scene3d) {
        this.scene3d.orbitBlend = 1.0;
        if (typeof this.scene3d.resetCameraView === 'function') {
          this.scene3d.resetCameraView();
        }
      }
      this.state = 'title';
      if (this.ui) {
        if (typeof this.ui.showTitle === 'function') this.ui.showTitle(this);
        if (typeof this.ui.onStateChange === 'function') this.ui.onStateChange(this.state, this);
        if (typeof this.ui.update === 'function') this.ui.update(0, this);
      }
    }

    goToTitle() {
      this.returnToTitle();
    }

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      if (this.sound) {
        if (this.sound.setRingHum) this.sound.setRingHum(false);
        if (this.sound.pauseAll) this.sound.pauseAll();
      }
      if (this.ui && typeof this.ui.onStateChange === 'function') {
        this.ui.onStateChange(this.state, this);
      }
      this._notifyUI();
    }

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'playing';
      if (this.sound) {
        if (this.sound.resumeAll) this.sound.resumeAll();
        if (this.sound.setRingHum) this.sound.setRingHum(this.ringActive);
      }
      if (this.ui && typeof this.ui.onStateChange === 'function') {
        this.ui.onStateChange(this.state, this);
      }
      this._notifyUI();
    }

    setPaused(flag) {
      if (flag) this.pause();
      else this.resume();
    }

    togglePause() {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    }

    setSpeed(mult) {
      this.speed = (mult === 2 || mult === 3) ? mult : 1;
      if (this.sound && this.sound.playClick) this.sound.playClick();
      this._notifyUI();
      return this.speed;
    }

    cycleSpeed() {
      const next = this.speed === 1 ? 2 : (this.speed === 2 ? 3 : 1);
      return this.setSpeed(next);
    }

    startEndless() {
      this.endless = true;
      this.isEndless = true;
      this.endlessMode = true;
      this.state = 'playing';
      if (this.sound) {
        if (this.sound.resumeAll) this.sound.resumeAll();
        if (this.sound.setRingHum) this.sound.setRingHum(this.ringActive);
      }
      if (this.enemies) {
        if (!this.enemies.waveInProgress && !(this.enemies.betweenWavesTimer > 0)) {
          this.enemies.betweenWavesTimer = 10;
        }
      }
      if (this.ui) {
        if (typeof this.ui.onEndlessStart === 'function') this.ui.onEndlessStart(this);
        if (typeof this.ui.onStateChange === 'function') this.ui.onStateChange(this.state, this);
      }
      this._notifyUI();
    }

    continueEndless() {
      this.startEndless();
    }

    getStarRating() {
      if (this.lives >= 18) return 3;
      if (this.lives >= 10) return 2;
      if (this.lives >= 1) return 1;
      return 0;
    }

    onWaveCleared(waveNum) {
      this.stats.wavesCleared++;
      if (typeof waveNum === 'number' && waveNum > this.wave) {
        this.wave = waveNum;
      }
      if (waveNum >= this.maxWaves && !this.endless && this.lives > 0) {
        this.triggerVictory();
      } else {
        this._notifyUI();
      }
    }

    triggerVictory() {
      if (this.state === 'victory') return;
      this.state = 'victory';
      this.ringActive = false;
      this.cancelTargeting();
      if (this.sound) {
        if (this.sound.setRingHum) this.sound.setRingHum(false);
        if (this.sound.playVictory) this.sound.playVictory();
      }
      if (this.ui) {
        if (typeof this.ui.onVictory === 'function') this.ui.onVictory(this);
        if (typeof this.ui.onStateChange === 'function') this.ui.onStateChange(this.state, this);
      }
      this._notifyUI();
    }

    triggerDefeat() {
      if (this.state === 'defeat') return;
      this.lives = 0;
      this.state = 'defeat';
      this.ringActive = false;
      this.cancelTargeting();
      if (this.sound) {
        if (this.sound.setRingHum) this.sound.setRingHum(false);
        if (this.sound.playDefeat) this.sound.playDefeat();
      }
      if (this.ui) {
        if (typeof this.ui.onDefeat === 'function') this.ui.onDefeat(this);
        if (typeof this.ui.onStateChange === 'function') this.ui.onStateChange(this.state, this);
      }
      this._notifyUI();
    }

    /* =====================================================================
     * Economy, Lives & Wave Control
     * ===================================================================== */

    canAfford(cost) {
      return this.gold >= cost;
    }

    spendGold(cost) {
      if (this.gold < cost) return false;
      this.gold -= cost;
      return true;
    }

    addGold(amount, x, y, isKillBonusEligible = false) {
      if (!(amount > 0)) return 0;
      let finalAmount = amount;
      if (isKillBonusEligible && this.ringActive) {
        finalAmount = Math.ceil(amount * 1.25);
      } else {
        finalAmount = Math.round(amount);
      }
      this.gold += finalAmount;
      this.stats.goldEarned += finalAmount;
      if (isKillBonusEligible) {
        this.stats.kills++;
      }
      if (typeof x === 'number' && typeof y === 'number' && this.vfx && this.vfx.spawnFloatingText) {
        const color = (isKillBonusEligible && this.ringActive) ? '#ffe082' : '#ffd54f';
        this.vfx.spawnFloatingText(x, y - 14, '+' + finalAmount + 'g', color, 0.95);
      }
      return finalAmount;
    }

    loseLives(count = 1) {
      if (this.state !== 'playing') return;
      const loss = Math.max(1, count | 0);
      this.lives = Math.max(0, this.lives - loss);
      this.triggerShake(6, 0.3);
      if (this.map && this.map.gatePoint && this.vfx && this.vfx.spawnFloatingText) {
        this.vfx.spawnFloatingText(
          this.map.gatePoint.x,
          this.map.gatePoint.y - 24,
          '-' + loss + (loss === 1 ? ' LIFE' : ' LIVES'),
          '#ff5252',
          1.2
        );
      }
      if (this.lives <= 0) {
        this.triggerDefeat();
      } else {
        this._notifyUI();
      }
    }

    loseLife(count = 1) {
      this.loseLives(count);
    }

    damageFortress(count = 1) {
      this.loseLives(count);
    }

    onEnemyExit(enemy) {
      this.loseLives((enemy && enemy.livesCost) || 1);
    }

    onEnemyReachedExit(enemy) {
      this.loseLives((enemy && enemy.livesCost) || 1);
    }

    callWaveEarly() {
      if (this.state !== 'playing' && this.state !== 'paused') return false;
      if (!this.enemies) return false;
      if (typeof this.enemies.canCallEarly === 'function' && !this.enemies.canCallEarly(this)) {
        return false;
      }
      if (this.state === 'paused') {
        this.resume();
      }
      this.enemies.startNextWave(this, true);
      this._syncWaveNumber();
      this._notifyUI();
      return true;
    }

    startNextWave(isEarly = false) {
      if (!this.enemies) return false;
      this.enemies.startNextWave(this, isEarly);
      this._syncWaveNumber();
      this._notifyUI();
      return true;
    }

    _syncWaveNumber() {
      if (!this.enemies) return;
      const ew = this.enemies.currentWave !== undefined
        ? this.enemies.currentWave
        : (this.enemies.wave !== undefined ? this.enemies.wave : this.enemies.waveNum);
      if (typeof ew === 'number') {
        this.wave = ew;
      }
    }

    /* =====================================================================
     * The Ring of Power Mechanic
     * ===================================================================== */

    toggleRing() {
      if (this.state !== 'playing' && this.state !== 'paused') return this.ringActive;
      if (!this.ringActive && this.corruption >= 99.5) {
        return false;
      }
      this.ringActive = !this.ringActive;
      if (this.sound) {
        if (this.sound.playClick) this.sound.playClick();
        if (this.sound.setRingHum) {
          this.sound.setRingHum(this.ringActive && this.state === 'playing');
        }
      }
      if (this.ringActive) {
        this.screenFlash = { color: 'rgba(255, 190, 64, 0.16)', timer: 0.22, duration: 0.22 };
      }
      this._notifyUI();
      return this.ringActive;
    }

    _triggerCorruptionOverload() {
      this.ringActive = false;
      // Leave high residual corruption that visibly drains while preventing instant 0dt re-trigger
      this.corruption = 92;
      this.ringOverloadTimer = 5.0;
      this.stats.wraithsSummoned++;

      if (this.sound) {
        if (this.sound.setRingHum) this.sound.setRingHum(false);
      }
      this.triggerShake(9, 0.48);
      this.screenFlash = { color: 'rgba(180, 24, 24, 0.30)', timer: 0.4, duration: 0.4 };

      if (this.enemies && typeof this.enemies.spawnRingwraithBoss === 'function') {
        this.enemies.spawnRingwraithBoss(this);
      }
      this._notifyUI();
    }

    /* =====================================================================
     * Player Spellbook
     * ===================================================================== */

    isSpellReady(spellId) {
      const s = this.spells[spellId];
      return !!(s && s.cd <= 0);
    }

    selectSpell(spellId) {
      if (!this.spells[spellId]) return false;
      if (this.activeSpell === spellId) {
        this.cancelTargeting();
        return false;
      }
      if (this.spells[spellId].cd > 0) {
        return false;
      }
      this.activeSpell = spellId;
      this.rallyTower = null;
      this.previewRange = null;
      if (this.sound && this.sound.playClick) this.sound.playClick();
      this._notifyUI();
      return true;
    }

    startSpellTargeting(spellId) {
      return this.selectSpell(spellId);
    }

    castSpell(spellId, x, y) {
      const spell = this.spells[spellId];
      if (!spell || spell.cd > 0) return false;

      spell.cd = spell.cooldown;
      spell.remaining = spell.cooldown;
      spell.timer = spell.cooldown;
      this.activeSpell = null;
      this.stats.spellsCast++;

      const activeEnemies = (this.enemies && this.enemies.active) ? this.enemies.active : [];

      if (spellId === 'light') {
        const radius = spell.radius;
        for (let i = 0; i < activeEnemies.length; i++) {
          const e = activeEnemies[i];
          if (!e || e.dead || e.reachedExit || e.hp <= 0) continue;
          const dx = e.x - x;
          const dy = e.y - y;
          const hitR = radius + (e.radius || 0);
          if (dx * dx + dy * dy <= hitR * hitR) {
            if (typeof e.applyStun === 'function') {
              e.applyStun(spell.stunSec);
            } else {
              e.stunTimer = Math.max(e.stunTimer || 0, spell.stunSec);
            }
            if (typeof e.reveal === 'function') {
              e.reveal(spell.revealSec);
            } else {
              e.revealedTimer = Math.max(e.revealedTimer || 0, spell.revealSec);
            }
          }
        }

        if (this.towers && typeof this.towers.healSoldiersInRadius === 'function') {
          this.towers.healSoldiersInRadius(x, y, radius);
        }
        if (this.vfx && typeof this.vfx.spawnLightOfEarendil === 'function') {
          this.vfx.spawnLightOfEarendil(x, y, radius);
        }
        if (this.sound && typeof this.sound.playSpellLight === 'function') {
          this.sound.playSpellLight();
        }
        this.screenFlash = { color: 'rgba(195, 238, 255, 0.24)', timer: 0.28, duration: 0.28 };
      } else if (spellId === 'eagles') {
        const tangent = this.getNearestPathTangent(x, y);
        const angle = tangent.angle;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const halfLen = spell.length * 0.5;
        const halfWidth = spell.halfWidth;

        // Snapshot array slice in case deaths mutate ordering
        const snapshot = activeEnemies.slice();
        for (let i = 0; i < snapshot.length; i++) {
          const e = snapshot[i];
          if (!e || e.dead || e.reachedExit || e.hp <= 0) continue;
          const dx = e.x - x;
          const dy = e.y - y;
          const localX = dx * cos + dy * sin;
          const localY = -dx * sin + dy * cos;
          const pad = e.radius || 12;
          if (Math.abs(localX) <= halfLen + pad && Math.abs(localY) <= halfWidth + pad) {
            if (typeof e.takeDamage === 'function') {
              const dealt = e.takeDamage(spell.damage, 'hybrid', { pushbackPx: 26 }, this);
              if (dealt > 0) this.stats.damageDealt += dealt;
            }
          }
        }

        if (this.vfx && typeof this.vfx.spawnGreatEagles === 'function') {
          this.vfx.spawnGreatEagles(x, y, angle);
        }
        if (this.sound && typeof this.sound.playSpellEagles === 'function') {
          this.sound.playSpellEagles();
        }
        this.triggerShake(7, 0.36);
      }

      this._notifyUI();
      return true;
    }

    /**
     * Finds the nearest ground path segment and returns its point + tangent angle.
     */
    getNearestPathTangent(x, y) {
      const paths = (this.map && this.map.paths) ? this.map.paths : [];
      let bestDistSq = Infinity;
      let bestAngle = 0;
      let bestX = x;
      let bestY = y;
      let bestLane = 0;
      let bestSeg = 0;

      for (let l = 0; l < paths.length; l++) {
        const pts = Array.isArray(paths[l]) ? paths[l] : (paths[l] && paths[l].points) || [];
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          const abx = b.x - a.x;
          const aby = b.y - a.y;
          const lenSq = abx * abx + aby * aby;
          if (lenSq < 0.001) continue;
          let t = ((x - a.x) * abx + (y - a.y) * aby) / lenSq;
          t = clamp(t, 0, 1);
          const px = a.x + abx * t;
          const py = a.y + aby * t;
          const dx = x - px;
          const dy = y - py;
          const dSq = dx * dx + dy * dy;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestAngle = Math.atan2(aby, abx);
            bestX = px;
            bestY = py;
            bestLane = l;
            bestSeg = i;
          }
        }
      }

      return {
        x: bestX,
        y: bestY,
        dist: bestDistSq === Infinity ? 0 : Math.sqrt(bestDistSq),
        angle: bestAngle,
        laneIndex: bestLane,
        segIndex: bestSeg
      };
    }

    /* =====================================================================
     * Selection, Tower Actions, Rally Placement & Range Preview Hooks
     * ===================================================================== */

    selectPad(pad) {
      this.cancelTargeting(true);
      this.selectedPad = pad;
      this.selectedTower = null;
      this.previewRange = null;
      if (this.sound && this.sound.playClick) this.sound.playClick();
      this._notifyUI();
    }

    selectTower(tower) {
      this.cancelTargeting(true);
      this.selectedTower = tower;
      this.selectedPad = (this.map && this.map.pads && tower)
        ? (this.map.pads.find((p) => p.id === tower.padId) || null)
        : null;
      this.previewRange = null;
      if (this.sound && this.sound.playClick) this.sound.playClick();
      this._notifyUI();
    }

    clearSelection() {
      this.selectedPad = null;
      this.selectedTower = null;
      this.previewRange = null;
      this._notifyUI();
    }

    cancelTargeting(silent = false) {
      const had = !!(this.activeSpell || this.rallyTower);
      this.activeSpell = null;
      this.rallyTower = null;
      if (had && !silent) {
        if (this.sound && this.sound.playClick) this.sound.playClick();
        this._notifyUI();
      }
    }

    startRallyPlacement(tower) {
      const t = tower || this.selectedTower;
      if (!t || t.type !== 'garrison') return false;
      this.selectedTower = t;
      this.rallyTower = t;
      this.activeSpell = null;
      this.previewRange = null;
      if (this.sound && this.sound.playClick) this.sound.playClick();
      this._notifyUI();
      return true;
    }

    confirmRallyPlacement(x, y) {
      const t = this.rallyTower;
      if (!t) return false;
      if (typeof t.setRallyPoint === 'function') {
        t.setRallyPoint(x, y, this.map);
      }
      this.rallyTower = null;
      if (t.rallyPoint && this.vfx && this.vfx.spawnShockwave) {
        this.vfx.spawnShockwave(t.rallyPoint.x, t.rallyPoint.y, 28, '#66bb6a', 0.35);
      }
      if (this.sound && this.sound.playClick) this.sound.playClick();
      this._notifyUI();
      return true;
    }

    /**
     * Called by UI inspector on mouseenter/mouseleave of build cards or upgrade buttons.
     * info: null | { range, minRange, mode: 'build'|'upgrade', valid?: boolean, x?: number, y?: number }
     */
    setPreviewRange(info) {
      if (!info || !(info.range > 0)) {
        this.previewRange = null;
        return;
      }
      const anchor = this.selectedTower || this.selectedPad;
      this.previewRange = {
        range: info.range,
        minRange: info.minRange || 0,
        mode: info.mode || (this.selectedTower ? 'upgrade' : 'build'),
        valid: info.valid !== undefined ? !!info.valid : true,
        x: info.x !== undefined ? info.x : (anchor ? anchor.x : this.pointerX),
        y: info.y !== undefined ? info.y : (anchor ? anchor.y : this.pointerY)
      };
    }

    buildTower(padOrId, typeKey) {
      if (!this.towers || typeof this.towers.buildTower !== 'function') return null;
      let pad = padOrId;
      if (typeof padOrId === 'number' && this.map && this.map.pads) {
        pad = this.map.pads.find((p) => p.id === padOrId) || null;
      }
      if (!pad) pad = this.selectedPad;
      if (!pad) return null;

      const built = this.towers.buildTower(pad, typeKey, this);
      if (built) {
        this.stats.towersBuilt++;
        this.previewRange = null;
        this.selectedPad = pad;
        this.selectedTower = built;
        this._notifyUI();
      }
      return built;
    }

    sellTower(tower) {
      const target = tower || this.selectedTower;
      if (!target || !this.towers || typeof this.towers.sellTower !== 'function') return 0;
      const refund = this.towers.sellTower(target, this);
      if (this.selectedTower === target) {
        this.selectedTower = null;
        this.selectedPad = null;
        this.previewRange = null;
      }
      if (this.rallyTower === target) {
        this.rallyTower = null;
      }
      this._notifyUI();
      return refund;
    }

    triggerShake(intensity = 5, duration = 0.25) {
      this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
      this.shakeDuration = Math.max(this.shakeDuration, duration);
      this.shakeTimer = Math.max(this.shakeTimer, duration);
    }

    /* =====================================================================
     * Main RAF Loop & Fixed-Substep Simulation
     * ===================================================================== */

    startLoop() {
      if (typeof requestAnimationFrame === 'undefined') return;
      if (this._rafId) cancelAnimationFrame(this._rafId);
      this._lastFrameMs = 0;
      this._rafId = requestAnimationFrame(this._boundRaf);
    }

    stopLoop() {
      if (this._rafId && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this._rafId);
        this._rafId = 0;
      }
    }

    _onAnimationFrame(timestampMs) {
      this._rafId = requestAnimationFrame(this._boundRaf);
      const rawDt = this._lastFrameMs > 0 ? (timestampMs - this._lastFrameMs) / 1000 : (1 / 60);
      this._lastFrameMs = timestampMs;
      const dt = clamp(rawDt, 0, 0.05);
      this.frame(dt);
    }

    frame(dt) {
      this._lastRenderDt = dt > 0 ? dt : (1 / 60);
      this._updateScreenFeedback(dt);

      if (this.state === 'playing') {
        this.update(dt);
      } else {
        this.time += dt;
        // Live 3D map preview switch if player clicks a different stage card on Title Screen
        if (this.state === 'title' && this.scene3d && this.mapId && this._loaded3DMapId !== this.mapId) {
          this.loadMap3D(this.mapId);
        }
        if ((this.state === 'title' || this.state === 'victory' || this.state === 'defeat') && this.vfx && this.vfx.update) {
          this.vfx.update(this.state === 'title' ? dt * 0.65 : dt, this);
        }
      }

      if (this.ui && typeof this.ui.update === 'function') {
        this.ui.update(dt, this);
      }

      this.render();
    }

    _updateScreenFeedback(dt) {
      if (this.shakeTimer > 0) {
        this.shakeTimer = Math.max(0, this.shakeTimer - dt);
        if (this.shakeTimer <= 0) {
          this.shakeIntensity = 0;
          this.shakeDuration = 0;
        }
      }
      if (this.screenFlash) {
        this.screenFlash.timer -= dt;
        if (this.screenFlash.timer <= 0) {
          this.screenFlash = null;
        }
      }
    }

    /**
     * Advances game simulation by wall-clock dt scaled by game.speed,
     * subdivided into <= 1/60s steps so 2x/3x speed never tunnels projectiles or waypoints.
     */
    update(dt) {
      if (!(dt > 0)) return;
      this.time += dt;
      if (this.state !== 'playing') return;

      const totalSimDt = dt * this.speed;
      const maxStep = 1 / 60;
      const steps = Math.max(1, Math.ceil(totalSimDt / maxStep));
      const subDt = totalSimDt / steps;

      for (let i = 0; i < steps; i++) {
        this.stepSimulation(subDt);
        if (this.state !== 'playing') break;
      }
    }

    /**
     * Helper for deterministic simulation fast-forwarding in tests.
     */
    advanceTime(simSeconds) {
      if (!(simSeconds > 0)) return;
      const maxStep = 1 / 60;
      const steps = Math.max(1, Math.ceil(simSeconds / maxStep));
      const subDt = simSeconds / steps;
      for (let i = 0; i < steps; i++) {
        this.time += subDt;
        this.stepSimulation(subDt);
        if (this.state !== 'playing') break;
      }
    }

    stepSimulation(subDt) {
      if (this.state !== 'playing') return;
      this.simTime += subDt;

      // 1. Spell cooldowns
      for (const k of Object.keys(this.spells)) {
        const sp = this.spells[k];
        if (sp.cd > 0) {
          sp.cd = Math.max(0, sp.cd - subDt);
          sp.remaining = sp.cd;
          sp.timer = sp.cd;
        }
      }

      // 2. Ring of Power Corruption rise / drain
      if (this.ringOverloadTimer > 0) {
        this.ringOverloadTimer = Math.max(0, this.ringOverloadTimer - subDt);
      }
      if (this.ringActive) {
        this.stats.ringTime += subDt;
        this.corruption += 8.0 * subDt;
        if (this.corruption >= 100) {
          this._triggerCorruptionOverload();
        }
      } else if (this.corruption > 0) {
        this.corruption = Math.max(0, this.corruption - 3.5 * subDt);
      }

      // 3. Enemies update & spatial grid rebuild
      if (this.enemies) {
        this.spatialGrid.rebuild(this.enemies.active);
        this.enemies.update(subDt, this);
        this._syncWaveNumber();
      }

      if (this.lives <= 0 && this.state === 'playing') {
        this.triggerDefeat();
        return;
      }
      if (this.state !== 'playing') return;

      // 4. Rebuild spatial grid with moved enemy positions for tower targeting & projectiles
      if (this.enemies) {
        this.spatialGrid.rebuild(this.enemies.active);
      }

      // 5. Towers, Garrison soldiers, projectiles & burning oil patches
      if (this.towers) {
        this.towers.update(subDt, this);
      }

      if (this.lives <= 0 && this.state === 'playing') {
        this.triggerDefeat();
        return;
      }

      // 6. Visual effects particles, beams, lightning & floating combat text
      if (this.vfx && this.vfx.update) {
        this.vfx.update(subDt, this);
      }
    }

    /* =====================================================================
     * Master 3D Three.js Diorama + Crisp 2D HUD Overlay Render Pipeline
     * ===================================================================== */

    render() {
      if (this.scene3d && this.scene3d.isReady) {
        this._render3DScene();
        this._renderHudOverlay2D();
        return;
      }
      this._renderFallback2D();
    }

    _render3DScene() {
      const renderDt = this._lastRenderDt || (1 / 60);

      if (this.mapId && this._loaded3DMapId !== this.mapId) {
        this.loadMap3D(this.mapId);
      }

      // 1. Update 3D Environment (water/lava shimmer, torches, banner sway, empty pad holograms, Ring lighting)
      if (this.env3d) {
        if (typeof this.env3d.setHoveredPad === 'function') {
          this.env3d.setHoveredPad(this.hoveredPad);
        }
        if (typeof this.env3d.setSelectedPad === 'function') {
          this.env3d.setSelectedPad(this.selectedPad);
        }
        if (typeof this.env3d.syncPads === 'function') {
          this.env3d.syncPads(this);
        }
        if (typeof this.env3d.update === 'function') {
          this.env3d.update(renderDt, this.time, this);
        }
      }

      // 2. Sync 3D Towers, Garrison Squads, Rohirrim Knights, Enemies & Bosses
      if (this.models3d && typeof this.models3d.sync === 'function') {
        const animDt = this.state === 'playing' ? renderDt * this.speed : (this.state === 'paused' ? 0 : renderDt);
        this.models3d.sync(this, animDt, this.time);
        this._syncDetachedModelPools();
      }

      // 3. Optional VFX3D render-sync hook if exposed separately from update()
      if (this.vfx3d && typeof this.vfx3d.sync === 'function') {
        this.vfx3d.sync(this, renderDt, this.time);
      }

      // 4. Update 3D Tactical Range Rings, Deadzones, Spell Reticles & Garrison Rally Flag
      this.scene3d.updateTacticalOverlays(this, this.time);

      // 5. Render Three.js Scene via WebGL2 + ACESFilmic + UnrealBloomPass Composer
      this.scene3d.render(renderDt, this.time, this);
    }

    /**
     * Keeps inactive pooled 3D tower/soldier/enemy rigs off the live scene graph while hidden
     * and re-attaches them immediately upon pool re-acquisition, eliminating hidden-mesh traversal cost.
     */
    _syncDetachedModelPools() {
      const m = this.models3d;
      if (!m) return;
      if (m._disposed) {
        this._stagedModelRigs.length = 0;
        return;
      }

      for (let i = this._stagedModelRigs.length - 1; i >= 0; i--) {
        const item = this._stagedModelRigs[i];
        if (item.child && item.child.visible) {
          if (item.parent) {
            item.parent.add(item.child);
            item.child.updateMatrixWorld(true);
          }
          this._stagedModelRigs.splice(i, 1);
        }
      }

      const groups = [m.towersGroup, m.soldiersGroup, m.enemiesGroup];
      for (let g = 0; g < groups.length; g++) {
        const grp = groups[g];
        if (!grp || !Array.isArray(grp.children)) continue;
        for (let i = grp.children.length - 1; i >= 0; i--) {
          const ch = grp.children[i];
          if (ch && ch.visible === false) {
            grp.remove(ch);
            this._stagedModelRigs.push({ parent: grp, child: ch });
          }
        }
      }
    }

    _renderHudOverlay2D() {
      const ctx = this.hudCtx;
      if (!ctx || !this.hudCanvas) return;

      const sw = (this.scene3d && this.scene3d.viewportWidth) || this._hudW || TD.WIDTH;
      const sh = (this.scene3d && this.scene3d.viewportHeight) || this._hudH || TD.HEIGHT;
      this._syncHudCanvasSize(sw, sh);
      const dpr = this._hudDpr || 1;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, sw, sh);

      // 1. Crisp screen-projected enemy health bars, status badges & floating combat numbers
      if (this.state !== 'title') {
        if (this.vfx && typeof this.vfx.renderOverlay2D === 'function') {
          this.vfx.renderOverlay2D(ctx, this.time, this);
        }
      }

      // 2. Supernatural One Ring shadow-gold edge vignette while Ring of Power is worn
      if (this.ringActive && (this.state === 'playing' || this.state === 'paused')) {
        const pulse = 0.85 + Math.sin(this.time * 4.2) * 0.15;
        const grad = ctx.createRadialGradient(
          sw * 0.5, sh * 0.5, Math.min(sw, sh) * 0.34,
          sw * 0.5, sh * 0.5, Math.max(sw, sh) * 0.72
        );
        grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(0.75, 'rgba(38, 22, 6, ' + (0.22 * pulse).toFixed(3) + ')');
        grad.addColorStop(1, 'rgba(212, 140, 28, ' + (0.26 * pulse).toFixed(3) + ')');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, sw, sh);
      }

      // 3. Brief celestial (Light of Eärendil) or crimson (Corruption Overload) screen flash
      if (this.screenFlash && this.screenFlash.duration > 0) {
        ctx.globalAlpha = clamp(this.screenFlash.timer / this.screenFlash.duration, 0, 1);
        ctx.fillStyle = this.screenFlash.color;
        ctx.fillRect(0, 0, sw, sh);
      }

      ctx.restore();
    }

    _renderFallback2D() {
      const ctx = this.ctx;
      if (!ctx) return;

      ctx.save();

      // Camera shake offset
      if (this.shakeTimer > 0 && this.shakeDuration > 0) {
        const mag = this.shakeIntensity * (this.shakeTimer / this.shakeDuration);
        const ox = Math.sin(this.time * 57.3) * mag;
        const oy = Math.cos(this.time * 43.7) * mag;
        ctx.translate(ox, oy);
      }

      if (this.mapRenderer && typeof this.mapRenderer.renderBackground === 'function') {
        this.mapRenderer.renderBackground(ctx, this.mapId, this.time, this);
      } else {
        ctx.fillStyle = '#171a1f';
        ctx.fillRect(0, 0, TD.WIDTH, TD.HEIGHT);
      }

      if (this.towers && typeof this.towers.renderGround === 'function') {
        this.towers.renderGround(ctx, this.time);
      }
      if (this.vfx && typeof this.vfx.renderGround === 'function') {
        this.vfx.renderGround(ctx, this.time);
      }

      this._renderPadHighlights(ctx);

      if (this.towers && typeof this.towers.render === 'function') {
        this.towers.render(ctx, this.time, this);
      }
      if (this.enemies && typeof this.enemies.render === 'function') {
        this.enemies.render(ctx, this.time, this);
      }

      this._renderTacticalOverlays(ctx);

      if (this.vfx && typeof this.vfx.renderAir === 'function') {
        this.vfx.renderAir(ctx, this.time);
      }

      if (this.mapRenderer && typeof this.mapRenderer.renderForeground === 'function') {
        this.mapRenderer.renderForeground(ctx, this.mapId, this.time, this);
      }

      if (this.screenFlash && this.screenFlash.duration > 0) {
        ctx.save();
        ctx.globalAlpha = clamp(this.screenFlash.timer / this.screenFlash.duration, 0, 1);
        ctx.fillStyle = this.screenFlash.color;
        ctx.fillRect(-16, -16, TD.WIDTH + 32, TD.HEIGHT + 32);
        ctx.restore();
      }

      ctx.restore();
    }

    _renderPadHighlights(ctx) {
      if (this.state !== 'playing' && this.state !== 'paused') return;

      if (this.hoveredPad && this.hoveredPad !== this.selectedPad) {
        const occupied = this.towers && this.towers.getTowerOnPad && this.towers.getTowerOnPad(this.hoveredPad.id);
        if (!occupied) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(this.hoveredPad.x, this.hoveredPad.y, (this.hoveredPad.radius || 24) + 4, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(240, 210, 122, 0.65)';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        }
      }

      if (this.selectedPad && !this.selectedTower) {
        const r = (this.selectedPad.radius || 24) + 5;
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.selectedPad.x, this.selectedPad.y, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200, 162, 75, 0.16)';
        ctx.fill();
        ctx.strokeStyle = '#f0d27a';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([7, 4]);
        ctx.lineDashOffset = -this.time * 18;
        ctx.stroke();
        ctx.restore();
      }
    }

    _renderTacticalOverlays(ctx) {
      if (this.state !== 'playing' && this.state !== 'paused') return;

      // A. Empty Build Pad Hover Range Preview (Green valid / Red unaffordable + minRange deadzone)
      if (this.previewRange && this.previewRange.mode === 'build') {
        const px = this.selectedPad ? this.selectedPad.x : this.previewRange.x;
        const py = this.selectedPad ? this.selectedPad.y : this.previewRange.y;
        if (this.previewRange.valid) {
          this._drawRangeCircle(ctx, px, py, this.previewRange.range, 'rgba(76, 195, 102, 0.22)', '#66bb6a', false);
        } else {
          this._drawRangeCircle(ctx, px, py, this.previewRange.range, 'rgba(229, 83, 75, 0.20)', '#ef5350', false);
        }
        if (this.previewRange.minRange > 0) {
          this._drawDeadzoneCircle(ctx, px, py, this.previewRange.minRange);
        }
      }

      // B. Selected Built Tower Current Range (Blue) + Upgrade Preview Range (Yellow)
      if (this.selectedTower && !this.rallyTower) {
        const tx = this.selectedTower.x;
        const ty = this.selectedTower.y;

        // Current range in crisp rune blue
        this._drawRangeCircle(ctx, tx, ty, this.selectedTower.range, 'rgba(79, 195, 247, 0.16)', '#4fc3f7', false);
        if (this.selectedTower.minRange > 0) {
          this._drawDeadzoneCircle(ctx, tx, ty, this.selectedTower.minRange);
        }

        // Yellow upgrade hover range overlay
        if (this.previewRange && this.previewRange.mode === 'upgrade') {
          this._drawRangeCircle(ctx, tx, ty, this.previewRange.range, 'rgba(255, 213, 79, 0.16)', '#ffd54f', true);
          if (this.previewRange.minRange > 0 && this.previewRange.minRange !== this.selectedTower.minRange) {
            this._drawRangeCircle(ctx, tx, ty, this.previewRange.minRange, 'rgba(255, 179, 0, 0.10)', '#ffb300', true);
          }
        }

        // Selected tower subtle base halo
        ctx.save();
        ctx.beginPath();
        ctx.arc(tx, ty, 27, 0, Math.PI * 2);
        ctx.strokeStyle = '#8be0ff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // C. Garrison Rally Point Placement Mode (Green boundary + clamped cursor reticle)
      if (this.rallyTower) {
        const tx = this.rallyTower.x;
        const ty = this.rallyTower.y;
        const maxR = this.rallyTower.range || 160;
        this._drawRangeCircle(ctx, tx, ty, maxR, 'rgba(76, 195, 102, 0.16)', '#66bb6a', false);

        const dx = this.pointerX - tx;
        const dy = this.pointerY - ty;
        const dist = Math.hypot(dx, dy);
        const rx = dist > maxR && dist > 0 ? tx + (dx / dist) * maxR : this.pointerX;
        const ry = dist > maxR && dist > 0 ? ty + (dy / dist) * maxR : this.pointerY;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(rx, ry);
        ctx.strokeStyle = 'rgba(102, 187, 106, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        const pulse = 1 + Math.sin(this.time * 6) * 0.12;
        ctx.beginPath();
        ctx.arc(rx, ry, 18 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(76, 195, 102, 0.28)';
        ctx.fill();
        ctx.strokeStyle = '#66bb6a';
        ctx.lineWidth = 2.2;
        ctx.stroke();

        // Small banner pennant icon
        ctx.beginPath();
        ctx.moveTo(rx - 3, ry + 8);
        ctx.lineTo(rx - 3, ry - 10);
        ctx.lineTo(rx + 9, ry - 5);
        ctx.lineTo(rx - 3, ry);
        ctx.strokeStyle = '#f0d27a';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // D. Player Spell Targeting Reticles
      if (this.activeSpell && this.pointerOnCanvas) {
        if (this.activeSpell === 'light') {
          this._renderLightReticle(ctx, this.pointerX, this.pointerY, this.spells.light.radius);
        } else if (this.activeSpell === 'eagles') {
          this._renderEaglesReticle(ctx, this.pointerX, this.pointerY);
        }
      }
    }

    _drawRangeCircle(ctx, x, y, radius, fillStyle, strokeStyle, dashed) {
      if (!(radius > 0)) return;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = fillStyle;
      ctx.fill();
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = dashed ? 2.2 : 1.9;
      if (dashed) {
        ctx.setLineDash([9, 6]);
        ctx.lineDashOffset = -this.time * 22;
      }
      ctx.stroke();
      ctx.restore();
    }

    _drawDeadzoneCircle(ctx, x, y, minRange) {
      if (!(minRange > 0)) return;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, minRange, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(239, 83, 80, 0.13)';
      ctx.fill();
      ctx.strokeStyle = '#ff8a65';
      ctx.lineWidth = 1.7;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.restore();
    }

    _renderLightReticle(ctx, x, y, radius) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(139, 224, 255, 0.18)';
      ctx.fill();
      ctx.strokeStyle = '#8be0ff';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, radius * 0.72, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(224, 247, 255, 0.55)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = this.time * 24;
      ctx.stroke();
      ctx.setLineDash([]);

      // Rotating 8-point Star of Eärendil center glyph
      ctx.translate(x, y);
      ctx.rotate(this.time * 0.7);
      ctx.strokeStyle = '#e1f5fe';
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(-16, 0);
        ctx.lineTo(16, 0);
        ctx.stroke();
      }
      ctx.restore();
    }

    _renderEaglesReticle(ctx, x, y) {
      const sp = this.spells.eagles;
      const tangent = this.getNearestPathTangent(x, y);
      const halfLen = sp.length * 0.5;
      const halfW = sp.halfWidth;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tangent.angle);

      // Sweeping golden lane corridor
      ctx.fillStyle = 'rgba(255, 213, 79, 0.16)';
      ctx.fillRect(-halfLen, -halfW, sp.length, halfW * 2);

      ctx.strokeStyle = '#ffd54f';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([12, 7]);
      ctx.lineDashOffset = -this.time * 36;
      ctx.strokeRect(-halfLen, -halfW, sp.length, halfW * 2);
      ctx.setLineDash([]);

      // Directional sweep chevrons & eagle wing preview silhouettes
      const sweepShift = ((this.time * 110) % 120) - 60;
      ctx.strokeStyle = 'rgba(255, 236, 179, 0.65)';
      ctx.lineWidth = 2;
      for (let k = -1; k <= 1; k++) {
        const cx = k * 140 + sweepShift * 0.4;
        const cy = k * 28;
        ctx.beginPath();
        ctx.moveTo(cx - 18, cy - 22);
        ctx.quadraticCurveTo(cx + 4, cy - 6, cx + 16, cy);
        ctx.quadraticCurveTo(cx + 4, cy + 6, cx - 18, cy + 22);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  TD.Game = Game;

  TD.boot = function boot() {
    if (typeof window === 'undefined') return null;
    if (!window.game) {
      window.game = new TD.Game();
      window.game.init();
    }
    return window.game;
  };

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', TD.boot);
    } else {
      TD.boot();
    }
  }
})(window.TD = window.TD || {});
