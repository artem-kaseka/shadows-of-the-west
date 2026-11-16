(function (TD) {
  'use strict';

  // ============================================================================
  // 1. TD.Pool — Zero-GC Object Pool
  // ============================================================================
  class Pool {
    constructor(createFn, resetFn, initialSize = 64) {
      if (typeof createFn !== 'function') {
        throw new Error('TD.Pool requires a createFn function');
      }
      this.createFn = createFn;
      this.resetFn = typeof resetFn === 'function' ? resetFn : null;
      this.initialSize = typeof initialSize === 'number' && initialSize >= 0 ? (initialSize | 0) : 64;
      this.free = [];
      this.inUse = [];

      for (let i = 0; i < this.initialSize; i++) {
        const obj = this.createFn();
        if (obj && typeof obj === 'object') {
          obj._inPool = true;
          obj._poolIdx = -1;
        }
        this.free.push(obj);
      }
    }

    acquire() {
      let obj;
      if (this.free.length > 0) {
        obj = this.free.pop();
      } else {
        obj = this.createFn();
      }

      if (obj && typeof obj === 'object') {
        obj._inPool = false;
        obj._poolIdx = this.inUse.length;
        this.inUse.push(obj);
      }

      if (this.resetFn) {
        if (arguments.length > 0) {
          this.resetFn(obj, ...arguments);
        } else {
          this.resetFn(obj);
        }
      }
      return obj;
    }

    release(obj) {
      if (!obj || typeof obj !== 'object' || obj._inPool) {
        return;
      }
      const idx = obj._poolIdx;
      if (typeof idx === 'number' && idx >= 0 && idx < this.inUse.length && this.inUse[idx] === obj) {
        const last = this.inUse.pop();
        if (idx < this.inUse.length && last) {
          this.inUse[idx] = last;
          last._poolIdx = idx;
        }
      }
      obj._poolIdx = -1;
      obj._inPool = true;

      if (this.resetFn) {
        this.resetFn(obj);
      }
      this.free.push(obj);
    }

    releaseAll() {
      for (let i = this.inUse.length - 1; i >= 0; i--) {
        const obj = this.inUse[i];
        if (obj && typeof obj === 'object') {
          obj._poolIdx = -1;
          obj._inPool = true;
          if (this.resetFn) {
            this.resetFn(obj);
          }
          this.free.push(obj);
        }
      }
      this.inUse.length = 0;
    }

    clear() {
      for (let i = 0; i < this.inUse.length; i++) {
        const obj = this.inUse[i];
        if (obj && typeof obj === 'object') {
          obj._poolIdx = -1;
          obj._inPool = false;
        }
      }
      for (let i = 0; i < this.free.length; i++) {
        const obj = this.free[i];
        if (obj && typeof obj === 'object') {
          obj._poolIdx = -1;
          obj._inPool = false;
        }
      }
      this.inUse.length = 0;
      this.free.length = 0;
    }

    get size() {
      return this.free.length;
    }

    get activeCount() {
      return this.inUse.length;
    }
  }

  // ============================================================================
  // 2. TD.SoundEngine — Procedural Middle-earth Web Audio Synthesizer
  // ============================================================================
  function safeParamSet(param, val, t) {
    if (!param) return;
    if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(val, t);
    } else {
      param.value = val;
    }
  }

  function safeLinRamp(param, val, t) {
    if (!param) return;
    if (typeof param.linearRampToValueAtTime === 'function') {
      param.linearRampToValueAtTime(val, t);
    } else {
      param.value = val;
    }
  }

  function safeExpRamp(param, val, t) {
    if (!param) return;
    const clamped = val < 0.0001 ? 0.0001 : val;
    if (typeof param.exponentialRampToValueAtTime === 'function') {
      param.exponentialRampToValueAtTime(clamped, t);
    } else if (typeof param.linearRampToValueAtTime === 'function') {
      param.linearRampToValueAtTime(clamped, t);
    } else {
      param.value = clamped;
    }
  }

  function safeCancel(param, t) {
    if (!param) return;
    if (typeof param.cancelScheduledValues === 'function') {
      param.cancelScheduledValues(t);
    }
  }

  class SoundEngine {
    constructor() {
      this.muted = false;
      this.paused = false;
      this.ctx = null;
      this.masterGain = null;
      this.compressor = null;
      this.whiteNoiseBuffer = null;
      this.pinkNoiseBuffer = null;

      this._lastPlayed = Object.create(null);
      this.playCounts = Object.create(null);
      this._ringHumDesired = false;
      this.ringHumActive = false;
      this._ringNodes = null;
      this._ringStopTimer = null;

      this._bindAutoUnlock();
    }

    _bindAutoUnlock() {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      const onGesture = () => {
        this.unlock();
      };
      try {
        window.addEventListener('pointerdown', onGesture, { passive: true, once: true });
        window.addEventListener('keydown', onGesture, { passive: true, once: true });
      } catch (_) {
        // Ignore environment listener restrictions
      }
    }

    _nowMs() {
      if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
      }
      return Date.now();
    }

    _canPlay(key, minIntervalMs = 38) {
      if (this.muted || this.paused) return false;
      const now = this._nowMs();
      const prev = this._lastPlayed[key] || -1e9;
      if (now - prev < minIntervalMs) {
        return false;
      }
      this._lastPlayed[key] = now;
      this.playCounts[key] = (this.playCounts[key] || 0) + 1;
      return true;
    }

    _ensureContext() {
      if (this.ctx) {
        if (!this.paused && this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
          try {
            const p = this.ctx.resume();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } catch (_) {}
        }
        return this.ctx;
      }

      try {
        const AudioCtx = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) ||
          (typeof globalThis !== 'undefined' && (globalThis.AudioContext || globalThis.webkitAudioContext));
        if (!AudioCtx) return null;

        const ctx = new AudioCtx();
        this.ctx = ctx;

        const master = ctx.createGain();
        master.gain.value = (this.muted || this.paused) ? 0.0001 : 0.78;
        this.masterGain = master;

        if (typeof ctx.createDynamicsCompressor === 'function') {
          const comp = ctx.createDynamicsCompressor();
          safeParamSet(comp.threshold, -14, ctx.currentTime || 0);
          safeParamSet(comp.knee, 18, ctx.currentTime || 0);
          safeParamSet(comp.ratio, 6, ctx.currentTime || 0);
          safeParamSet(comp.attack, 0.003, ctx.currentTime || 0);
          safeParamSet(comp.release, 0.16, ctx.currentTime || 0);
          master.connect(comp);
          comp.connect(ctx.destination);
          this.compressor = comp;
        } else {
          master.connect(ctx.destination);
        }

        this._buildNoiseBuffers(ctx);

        if (!this.paused && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
          const p = ctx.resume();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
        return ctx;
      } catch (_) {
        this.ctx = null;
        return null;
      }
    }

    _buildNoiseBuffers(ctx) {
      if (!ctx || typeof ctx.createBuffer !== 'function') return;
      try {
        const sr = ctx.sampleRate || 44100;
        const len = Math.floor(sr * 1.5);

        const whiteBuf = ctx.createBuffer(1, len, sr);
        const whiteData = whiteBuf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          whiteData[i] = Math.random() * 2 - 1;
        }
        this.whiteNoiseBuffer = whiteBuf;

        const pinkBuf = ctx.createBuffer(1, len, sr);
        const pinkData = pinkBuf.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.96900 * b2 + w * 0.1538520;
          b3 = 0.86650 * b3 + w * 0.3104856;
          b4 = 0.55000 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.0168980;
          pinkData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        }
        this.pinkNoiseBuffer = pinkBuf;
      } catch (_) {}
    }

    unlock() {
      const ctx = this._ensureContext();
      if (!ctx) return false;
      try {
        if (!this.paused && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
          const p = ctx.resume();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
        if (this._ringHumDesired && !this.muted && !this.paused) {
          this._syncRingHum();
        }
        return true;
      } catch (_) {
        return false;
      }
    }

    setMuted(bool) {
      this.muted = !!bool;
      try {
        if (this.ctx && this.masterGain) {
          const t = this.ctx.currentTime || 0;
          safeCancel(this.masterGain.gain, t);
          safeParamSet(this.masterGain.gain, this.masterGain.gain.value || 0.0001, t);
          safeLinRamp(this.masterGain.gain, (this.muted || this.paused) ? 0.0001 : 0.78, t + 0.03);
        }
        this._syncRingHum();
      } catch (_) {}
      return this.muted;
    }

    toggleMute() {
      return this.setMuted(!this.muted);
    }

    pauseAll() {
      if (this.paused) return;
      this.paused = true;
      try {
        if (this.ctx && this.masterGain) {
          const t = this.ctx.currentTime || 0;
          safeCancel(this.masterGain.gain, t);
          safeLinRamp(this.masterGain.gain, 0.0001, t + 0.025);
        }
        this._syncRingHum();
        if (this.ctx && this.ctx.state === 'running' && typeof this.ctx.suspend === 'function') {
          const p = this.ctx.suspend();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
      } catch (_) {}
    }

    resumeAll() {
      if (!this.paused) return;
      this.paused = false;
      try {
        if (this.ctx) {
          if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
            const p = this.ctx.resume();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          }
          if (this.masterGain) {
            const t = this.ctx.currentTime || 0;
            safeCancel(this.masterGain.gain, t);
            safeLinRamp(this.masterGain.gain, this.muted ? 0.0001 : 0.78, t + 0.035);
          }
        }
        this._syncRingHum();
      } catch (_) {}
    }

    _jitter(range = 0.05) {
      return 1 + (Math.random() * 2 - 1) * range;
    }

    _gainJitter(base, range = 0.08) {
      return base * (1 + (Math.random() * 2 - 1) * range);
    }

    _tone(ctx, opts) {
      const t0 = opts.start !== undefined ? opts.start : (ctx.currentTime || 0);
      const dur = opts.dur || 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = opts.type || 'sine';
      safeParamSet(osc.frequency, opts.f0 || 440, t0);
      if (opts.f1 !== undefined) {
        if (opts.linearFreq) {
          safeLinRamp(osc.frequency, opts.f1, t0 + (opts.freqDur || dur));
        } else {
          safeExpRamp(osc.frequency, Math.max(12, opts.f1), t0 + (opts.freqDur || dur));
        }
      }
      if (opts.f2 !== undefined) {
        safeExpRamp(osc.frequency, Math.max(12, opts.f2), t0 + dur);
      }

      const peak = Math.max(0.0002, opts.vol || 0.18);
      const attack = opts.attack !== undefined ? opts.attack : 0.005;
      safeParamSet(gain.gain, 0.0001, t0);
      safeLinRamp(gain.gain, peak, t0 + attack);
      if (opts.sustain !== undefined && opts.sustainTime !== undefined) {
        safeLinRamp(gain.gain, Math.max(0.0002, peak * opts.sustain), t0 + opts.sustainTime);
      }
      safeExpRamp(gain.gain, 0.0001, t0 + dur);

      if (opts.filterType && typeof ctx.createBiquadFilter === 'function') {
        const filter = ctx.createBiquadFilter();
        filter.type = opts.filterType;
        safeParamSet(filter.frequency, opts.cutoff0 || 1200, t0);
        if (opts.cutoff1 !== undefined) {
          safeExpRamp(filter.frequency, Math.max(30, opts.cutoff1), t0 + dur);
        }
        if (opts.q !== undefined) {
          safeParamSet(filter.Q, opts.q, t0);
        }
        osc.connect(filter);
        filter.connect(gain);
      } else {
        osc.connect(gain);
      }

      gain.connect(this.masterGain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    _noise(ctx, opts) {
      const buf = opts.pink ? (this.pinkNoiseBuffer || this.whiteNoiseBuffer) : (this.whiteNoiseBuffer || this.pinkNoiseBuffer);
      if (!buf || typeof ctx.createBufferSource !== 'function') return;

      const t0 = opts.start !== undefined ? opts.start : (ctx.currentTime || 0);
      const dur = opts.dur || 0.12;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;

      const gain = ctx.createGain();
      const peak = Math.max(0.0002, opts.vol || 0.15);
      const attack = opts.attack !== undefined ? opts.attack : 0.004;
      safeParamSet(gain.gain, 0.0001, t0);
      safeLinRamp(gain.gain, peak, t0 + attack);
      safeExpRamp(gain.gain, 0.0001, t0 + dur);

      if (typeof ctx.createBiquadFilter === 'function') {
        const filter = ctx.createBiquadFilter();
        filter.type = opts.filterType || 'bandpass';
        safeParamSet(filter.frequency, opts.cutoff0 || 1200, t0);
        if (opts.cutoff1 !== undefined) {
          safeExpRamp(filter.frequency, Math.max(40, opts.cutoff1), t0 + dur);
        }
        if (opts.q !== undefined) {
          safeParamSet(filter.Q, opts.q, t0);
        }
        src.connect(filter);
        filter.connect(gain);
      } else {
        src.connect(gain);
      }

      gain.connect(this.masterGain);
      const maxOffset = Math.max(0, (buf.duration || 1.5) - Math.min(dur, 1.2) - 0.05);
      const offset = maxOffset > 0 ? Math.random() * maxOffset : 0;
      try {
        src.start(t0, offset);
      } catch (_) {
        src.start(t0);
      }
      src.stop(t0 + dur + 0.02);
    }

    // --- Weapon & Combat SFX ---

    playBow() {
      if (!this._canPlay('bow', 36)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const p = this._jitter(0.07);
        const t = ctx.currentTime || 0;
        // Crisp bowstring pluck
        this._tone(ctx, {
          start: t, dur: 0.075, type: 'triangle',
          f0: 310 * p, f1: 138 * p,
          vol: this._gainJitter(0.16), attack: 0.002,
          filterType: 'lowpass', cutoff0: 1800, cutoff1: 650
        });
        // Fletching air whoosh
        this._noise(ctx, {
          start: t + 0.006, dur: 0.07, pink: false,
          vol: this._gainJitter(0.11), attack: 0.008,
          filterType: 'bandpass', cutoff0: 1900 * p, cutoff1: 4200 * p, q: 2.2
        });
      } catch (_) {}
    }

    playBallista() {
      if (!this._canPlay('ballista', 45)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const p = this._jitter(0.05);
        const t = ctx.currentTime || 0;
        // Heavy torsion sinew/wood snap
        this._tone(ctx, {
          start: t, dur: 0.13, type: 'sawtooth',
          f0: 210 * p, f1: 54 * p,
          vol: this._gainJitter(0.24), attack: 0.002,
          filterType: 'lowpass', cutoff0: 1400, cutoff1: 220
        });
        // Iron bolt release crack + supersonic rip
        this._noise(ctx, {
          start: t, dur: 0.095, pink: false,
          vol: this._gainJitter(0.18), attack: 0.002,
          filterType: 'bandpass', cutoff0: 2600 * p, cutoff1: 950 * p, q: 1.8
        });
      } catch (_) {}
    }

    playCatapultLaunch() {
      if (!this._canPlay('catapult', 55)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const p = this._jitter(0.06);
        const t = ctx.currentTime || 0;
        // Timber arm creak
        this._tone(ctx, {
          start: t, dur: 0.14, type: 'sawtooth',
          f0: 82 * p, f1: 132 * p, freqDur: 0.06, f2: 68 * p,
          vol: this._gainJitter(0.16), attack: 0.015,
          filterType: 'bandpass', cutoff0: 340 * p, cutoff1: 240 * p, q: 4.0
        });
        // Deep counterweight thud
        this._tone(ctx, {
          start: t + 0.035, dur: 0.19, type: 'sine',
          f0: 118 * p, f1: 36 * p,
          vol: this._gainJitter(0.28), attack: 0.004
        });
        // Heavy boulder whoosh
        this._noise(ctx, {
          start: t + 0.04, dur: 0.18, pink: true,
          vol: this._gainJitter(0.15), attack: 0.02,
          filterType: 'lowpass', cutoff0: 520, cutoff1: 180
        });
      } catch (_) {}
    }

    playExplosion() {
      if (!this._canPlay('explosion', 45)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const p = this._jitter(0.07);
        const t = ctx.currentTime || 0;
        // Concussive sub boom
        this._tone(ctx, {
          start: t, dur: 0.42, type: 'sine',
          f0: 102 * p, f1: 25 * p,
          vol: this._gainJitter(0.34), attack: 0.004
        });
        this._tone(ctx, {
          start: t, dur: 0.24, type: 'triangle',
          f0: 145 * p, f1: 38 * p,
          vol: this._gainJitter(0.20), attack: 0.003
        });
        // Filtered stone & fire debris
        this._noise(ctx, {
          start: t, dur: 0.44, pink: true,
          vol: this._gainJitter(0.28), attack: 0.005,
          filterType: 'lowpass', cutoff0: 1650 * p, cutoff1: 130, q: 1.4
        });
      } catch (_) {}
    }

    playMagicBolt() {
      if (!this._canPlay('magicBolt', 38)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const p = this._jitter(0.06);
        const t = ctx.currentTime || 0;
        // Crystalline Istari shimmer
        this._tone(ctx, {
          start: t, dur: 0.16, type: 'sine',
          f0: 660 * p, f1: 1040 * p,
          vol: this._gainJitter(0.14), attack: 0.006
        });
        this._tone(ctx, {
          start: t + 0.015, dur: 0.15, type: 'triangle',
          f0: 1320 * p, f1: 1980 * p,
          vol: this._gainJitter(0.09), attack: 0.008,
          filterType: 'highpass', cutoff0: 900
        });
      } catch (_) {}
    }

    playLightning() {
      if (!this._canPlay('lightning', 42)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const p = this._jitter(0.08);
        const t = ctx.currentTime || 0;
        // Sharp electric zap
        this._tone(ctx, {
          start: t, dur: 0.14, type: 'sawtooth',
          f0: 1580 * p, f1: 175 * p,
          vol: this._gainJitter(0.19), attack: 0.002,
          filterType: 'bandpass', cutoff0: 2200 * p, cutoff1: 420, q: 2.0
        });
        // High-voltage crackle burst
        this._noise(ctx, {
          start: t, dur: 0.16, pink: false,
          vol: this._gainJitter(0.22), attack: 0.002,
          filterType: 'bandpass', cutoff0: 3800 * p, cutoff1: 950, q: 3.0
        });
      } catch (_) {}
    }

    playBeamTick() {
      // Throttled so per-frame / per-tick Flame of Anor hums smoothly without clipping
      if (!this._canPlay('beamTick', 95)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const p = this._jitter(0.03);
        const t = ctx.currentTime || 0;
        this._tone(ctx, {
          start: t, dur: 0.13, type: 'sawtooth',
          f0: 146.8 * p, f1: 154 * p,
          vol: this._gainJitter(0.095, 0.05), attack: 0.03,
          filterType: 'lowpass', cutoff0: 540, cutoff1: 380
        });
        this._tone(ctx, {
          start: t, dur: 0.12, type: 'triangle',
          f0: 293.6 * p, f1: 302 * p,
          vol: this._gainJitter(0.065, 0.05), attack: 0.025
        });
        this._noise(ctx, {
          start: t, dur: 0.12, pink: true,
          vol: 0.07, attack: 0.025,
          filterType: 'bandpass', cutoff0: 620 * p, cutoff1: 480, q: 2.2
        });
      } catch (_) {}
    }

    playSwordClash() {
      // Throttled for dense Garrison melee swarms
      if (!this._canPlay('swordClash', 85)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const p = this._jitter(0.11);
        const t = ctx.currentTime || 0;
        // Inharmonic steel partials
        this._tone(ctx, {
          start: t, dur: 0.11, type: 'triangle',
          f0: 1520 * p, f1: 1460 * p,
          vol: this._gainJitter(0.13), attack: 0.002,
          filterType: 'highpass', cutoff0: 1100
        });
        this._tone(ctx, {
          start: t, dur: 0.095, type: 'square',
          f0: 2390 * p, f1: 2260 * p,
          vol: this._gainJitter(0.075), attack: 0.002,
          filterType: 'bandpass', cutoff0: 2400 * p, q: 4.5
        });
        // Blade scrape transient
        this._noise(ctx, {
          start: t, dur: 0.045, pink: false,
          vol: this._gainJitter(0.11), attack: 0.001,
          filterType: 'highpass', cutoff0: 3200
        });
      } catch (_) {}
    }

    playWargLeap() {
      if (!this._canPlay('wargLeap', 90)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const p = this._jitter(0.07);
        const t = ctx.currentTime || 0;
        // Beastly snarl
        this._tone(ctx, {
          start: t, dur: 0.21, type: 'sawtooth',
          f0: 135 * p, f1: 215 * p, freqDur: 0.07, f2: 88 * p,
          vol: this._gainJitter(0.18), attack: 0.01,
          filterType: 'bandpass', cutoff0: 420 * p, cutoff1: 260 * p, q: 3.4
        });
        // Leap rush
        this._noise(ctx, {
          start: t + 0.02, dur: 0.16, pink: true,
          vol: this._gainJitter(0.13), attack: 0.015,
          filterType: 'bandpass', cutoff0: 600, cutoff1: 1400, q: 1.8
        });
      } catch (_) {}
    }

    playHorn() {
      if (!this._canPlay('horn', 240)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const p = this._jitter(0.015);
        const t = ctx.currentTime || 0;
        // Rich Gondor/Rohan War Horn fifth & octave chord (D3, A3, D4)
        const notes = [
          { f: 146.83 * p, v: 0.20, d: 0.95, delay: 0.0 },
          { f: 147.45 * p, v: 0.14, d: 0.95, delay: 0.01 },
          { f: 220.00 * p, v: 0.17, d: 0.92, delay: 0.04 },
          { f: 293.66 * p, v: 0.16, d: 0.98, delay: 0.08 }
        ];
        for (let i = 0; i < notes.length; i++) {
          const n = notes[i];
          this._tone(ctx, {
            start: t + n.delay, dur: n.d, type: 'sawtooth',
            f0: n.f * 0.97, f1: n.f, freqDur: 0.09,
            vol: n.v, attack: 0.085, sustain: 0.72, sustainTime: 0.55,
            filterType: 'lowpass', cutoff0: 1350, cutoff1: 520, q: 1.8
          });
        }
      } catch (_) {}
    }

    // --- UI & Economy SFX ---

    playClick() {
      if (!this._canPlay('click', 25)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const p = this._jitter(0.04);
        const t = ctx.currentTime || 0;
        this._tone(ctx, {
          start: t, dur: 0.036, type: 'triangle',
          f0: 560 * p, f1: 240 * p,
          vol: 0.12, attack: 0.002
        });
        this._tone(ctx, {
          start: t, dur: 0.022, type: 'sine',
          f0: 1180 * p, f1: 880 * p,
          vol: 0.06, attack: 0.001
        });
      } catch (_) {}
    }

    playBuild() {
      if (!this._canPlay('build', 50)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const p = this._jitter(0.04);
        const t = ctx.currentTime || 0;
        // Masonry stone set
        this._tone(ctx, {
          start: t, dur: 0.14, type: 'sine',
          f0: 112 * p, f1: 42 * p,
          vol: 0.24, attack: 0.004
        });
        this._noise(ctx, {
          start: t, dur: 0.08, pink: true,
          vol: 0.12, attack: 0.003,
          filterType: 'lowpass', cutoff0: 700, cutoff1: 220
        });
        // Forge anvil chime
        this._tone(ctx, {
          start: t + 0.045, dur: 0.20, type: 'triangle',
          f0: 587.33 * p, f1: 587.33 * p,
          vol: 0.13, attack: 0.004
        });
        this._tone(ctx, {
          start: t + 0.075, dur: 0.22, type: 'sine',
          f0: 880.0 * p, f1: 880.0 * p,
          vol: 0.11, attack: 0.004
        });
      } catch (_) {}
    }

    playUpgrade() {
      if (!this._canPlay('upgrade', 60)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const t = ctx.currentTime || 0;
        const freqs = [587.33, 739.99, 880.0, 1174.66];
        for (let i = 0; i < freqs.length; i++) {
          this._tone(ctx, {
            start: t + i * 0.048, dur: 0.24, type: i === 3 ? 'triangle' : 'sine',
            f0: freqs[i], f1: freqs[i],
            vol: i === 3 ? 0.16 : 0.12, attack: 0.006
          });
        }
        this._tone(ctx, {
          start: t, dur: 0.30, type: 'triangle',
          f0: 146.83, f1: 293.66,
          vol: 0.13, attack: 0.02
        });
      } catch (_) {}
    }

    playSell() {
      if (!this._canPlay('sell', 60)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const t = ctx.currentTime || 0;
        const coins = [1975.5, 2489.0, 2960.0];
        for (let i = 0; i < coins.length; i++) {
          const p = this._jitter(0.03);
          this._tone(ctx, {
            start: t + i * 0.042, dur: 0.16, type: 'sine',
            f0: coins[i] * p, f1: coins[i] * p,
            vol: 0.11, attack: 0.002
          });
        }
      } catch (_) {}
    }

    // --- Spells, Bosses & Dramatic Events ---

    playSpellLight() {
      if (!this._canPlay('spellLight', 140)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const t = ctx.currentTime || 0;
        // Celestial Eärendil starlight chime chord
        const chord = [659.25, 987.77, 1318.51, 1661.22, 1975.53];
        for (let i = 0; i < chord.length; i++) {
          this._tone(ctx, {
            start: t + i * 0.035, dur: 0.95 - i * 0.06, type: i % 2 === 0 ? 'sine' : 'triangle',
            f0: chord[i], f1: chord[i] * 1.003,
            vol: 0.12 - i * 0.012, attack: 0.02
          });
        }
        this._noise(ctx, {
          start: t, dur: 0.65, pink: false,
          vol: 0.07, attack: 0.04,
          filterType: 'bandpass', cutoff0: 3400, cutoff1: 5200, q: 3.2
        });
      } catch (_) {}
    }

    playSpellEagles() {
      if (!this._canPlay('spellEagles', 140)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const t = ctx.currentTime || 0;
        // Soaring Great Eagle cry
        this._tone(ctx, {
          start: t + 0.02, dur: 0.46, type: 'sawtooth',
          f0: 1920, f1: 2380, freqDur: 0.11, f2: 1320,
          vol: 0.16, attack: 0.025,
          filterType: 'bandpass', cutoff0: 2200, cutoff1: 1500, q: 4.5
        });
        this._tone(ctx, {
          start: t + 0.22, dur: 0.38, type: 'triangle',
          f0: 1760, f1: 2120, freqDur: 0.09, f2: 1240,
          vol: 0.11, attack: 0.02,
          filterType: 'bandpass', cutoff0: 2000, cutoff1: 1400, q: 4.0
        });
        // Mighty golden wind sweep
        this._noise(ctx, {
          start: t, dur: 1.05, pink: true,
          vol: 0.24, attack: 0.12,
          filterType: 'bandpass', cutoff0: 320, cutoff1: 1150, q: 1.4
        });
      } catch (_) {}
    }

    playWraithSpawn() {
      if (!this._canPlay('wraithSpawn', 180)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const t = ctx.currentTime || 0;
        // Chilling high Nazgûl shriek
        this._tone(ctx, {
          start: t, dur: 0.92, type: 'sawtooth',
          f0: 1580, f1: 2460, freqDur: 0.28, f2: 1180,
          vol: 0.18, attack: 0.04,
          filterType: 'bandpass', cutoff0: 2300, cutoff1: 1400, q: 5.0
        });
        this._tone(ctx, {
          start: t + 0.02, dur: 0.88, type: 'square',
          f0: 1665, f1: 2590, freqDur: 0.30, f2: 1230,
          vol: 0.09, attack: 0.05,
          filterType: 'bandpass', cutoff0: 2500, cutoff1: 1500, q: 5.5
        });
        this._noise(ctx, {
          start: t, dur: 0.85, pink: false,
          vol: 0.14, attack: 0.04,
          filterType: 'bandpass', cutoff0: 2800, cutoff1: 1600, q: 3.5
        });
        // Abyssal 100% Corruption sub drop
        this._tone(ctx, {
          start: t, dur: 0.95, type: 'sine',
          f0: 96, f1: 24,
          vol: 0.34, attack: 0.01
        });
      } catch (_) {}
    }

    playBossRoar() {
      if (!this._canPlay('bossRoar', 180)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const t = ctx.currentTime || 0;
        // Deep Balrog of Udûn / Witch-lord roar
        this._tone(ctx, {
          start: t, dur: 1.05, type: 'sawtooth',
          f0: 74, f1: 41,
          vol: 0.28, attack: 0.06, sustain: 0.7, sustainTime: 0.55,
          filterType: 'lowpass', cutoff0: 420, cutoff1: 160, q: 2.5
        });
        this._tone(ctx, {
          start: t + 0.02, dur: 1.0, type: 'sawtooth',
          f0: 109, f1: 58,
          vol: 0.20, attack: 0.07,
          filterType: 'bandpass', cutoff0: 290, cutoff1: 150, q: 3.2
        });
        this._noise(ctx, {
          start: t, dur: 1.05, pink: true,
          vol: 0.26, attack: 0.08,
          filterType: 'lowpass', cutoff0: 780, cutoff1: 210, q: 1.8
        });
      } catch (_) {}
    }

    playCurseBreak() {
      if (!this._canPlay('curseBreak', 45)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const t = ctx.currentTime || 0;
        // Shattering dark crystal + bright rune liberation chord
        this._noise(ctx, {
          start: t, dur: 0.065, pink: false,
          vol: 0.16, attack: 0.002,
          filterType: 'highpass', cutoff0: 3600
        });
        const runes = [880.0, 1318.5, 1760.0, 2217.46];
        for (let i = 0; i < runes.length; i++) {
          this._tone(ctx, {
            start: t + i * 0.022, dur: 0.30, type: 'triangle',
            f0: runes[i], f1: runes[i] * 1.01,
            vol: 0.13 - i * 0.015, attack: 0.003
          });
        }
      } catch (_) {}
    }

    playVictory() {
      if (!this._canPlay('victory', 300)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const t = ctx.currentTime || 0;
        // Triumphant Gondorian fanfare: D -> G -> A -> D major
        const steps = [
          { at: 0.00, dur: 0.24, freqs: [293.66, 440.00] },
          { at: 0.22, dur: 0.24, freqs: [392.00, 493.88] },
          { at: 0.44, dur: 0.28, freqs: [440.00, 554.37, 659.25] },
          { at: 0.72, dur: 1.05, freqs: [293.66, 440.00, 587.33, 739.99] }
        ];
        for (let s = 0; s < steps.length; s++) {
          const st = steps[s];
          for (let i = 0; i < st.freqs.length; i++) {
            this._tone(ctx, {
              start: t + st.at, dur: st.dur, type: 'sawtooth',
              f0: st.freqs[i], f1: st.freqs[i],
              vol: 0.13, attack: 0.03, sustain: 0.75, sustainTime: st.dur * 0.65,
              filterType: 'lowpass', cutoff0: 1800, cutoff1: 900
            });
          }
        }
      } catch (_) {}
    }

    playDefeat() {
      if (!this._canPlay('defeat', 300)) return;
      try {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const t = ctx.currentTime || 0;
        // Solemn fallen-fortress minor dirge + tolling bell
        const steps = [
          { at: 0.00, dur: 0.42, freqs: [293.66, 349.23, 440.00] },
          { at: 0.40, dur: 0.42, freqs: [233.08, 293.66, 349.23] },
          { at: 0.80, dur: 0.85, freqs: [146.83, 220.00, 293.66] }
        ];
        for (let s = 0; s < steps.length; s++) {
          const st = steps[s];
          for (let i = 0; i < st.freqs.length; i++) {
            this._tone(ctx, {
              start: t + st.at, dur: st.dur, type: 'sawtooth',
              f0: st.freqs[i], f1: st.freqs[i] * 0.985,
              vol: 0.14, attack: 0.045,
              filterType: 'lowpass', cutoff0: 950, cutoff1: 360
            });
          }
        }
        this._tone(ctx, {
          start: t + 0.80, dur: 1.1, type: 'sine',
          f0: 73.42, f1: 72.0,
          vol: 0.25, attack: 0.02
        });
      } catch (_) {}
    }

    // --- Continuous One Ring Ominous Drone ---

    setRingHum(active) {
      this._ringHumDesired = !!active;
      this._syncRingHum();
    }

    _syncRingHum() {
      const shouldPlay = this._ringHumDesired && !this.muted && !this.paused;
      this.ringHumActive = shouldPlay;

      if (this._ringStopTimer) {
        clearTimeout(this._ringStopTimer);
        this._ringStopTimer = null;
      }

      if (shouldPlay) {
        const ctx = this._ensureContext();
        if (!ctx) return;
        const t = ctx.currentTime || 0;

        if (this._ringNodes) {
          try {
            const g = this._ringNodes.droneGain.gain;
            safeCancel(g, t);
            safeParamSet(g, Math.max(0.0002, g.value || 0.001), t);
            safeLinRamp(g, 0.16, t + 0.32);
            return;
          } catch (_) {
            this._teardownRingNodes();
          }
        }

        try {
          const droneGain = ctx.createGain();
          safeParamSet(droneGain.gain, 0.0001, t);
          safeLinRamp(droneGain.gain, 0.16, t + 0.38);
          droneGain.connect(this.masterGain);

          // Sub fundamental + detuned dark fifth oscillators
          const oscSub = ctx.createOscillator();
          oscSub.type = 'sine';
          safeParamSet(oscSub.frequency, 55.0, t);

          const oscSaw = ctx.createOscillator();
          oscSaw.type = 'sawtooth';
          safeParamSet(oscSaw.frequency, 55.55, t);

          const oscFifth = ctx.createOscillator();
          oscFifth.type = 'triangle';
          safeParamSet(oscFifth.frequency, 82.1, t);

          let lowFilter = null;
          if (typeof ctx.createBiquadFilter === 'function') {
            lowFilter = ctx.createBiquadFilter();
            lowFilter.type = 'lowpass';
            safeParamSet(lowFilter.frequency, 185, t);
            safeParamSet(lowFilter.Q, 2.4, t);
            oscSub.connect(lowFilter);
            oscSaw.connect(lowFilter);
            oscFifth.connect(lowFilter);
            lowFilter.connect(droneGain);
          } else {
            oscSub.connect(droneGain);
            oscSaw.connect(droneGain);
            oscFifth.connect(droneGain);
          }

          // Modulated bandpass Black Speech whisper layer
          let whisperSrc = null;
          let lfo = null;
          let lfoGain = null;
          const buf = this.pinkNoiseBuffer || this.whiteNoiseBuffer;
          if (buf && typeof ctx.createBufferSource === 'function' && typeof ctx.createBiquadFilter === 'function') {
            whisperSrc = ctx.createBufferSource();
            whisperSrc.buffer = buf;
            whisperSrc.loop = true;

            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            safeParamSet(bp.frequency, 640, t);
            safeParamSet(bp.Q, 6.5, t);

            const whisperGain = ctx.createGain();
            safeParamSet(whisperGain.gain, 0.42, t);

            lfo = ctx.createOscillator();
            lfo.type = 'sine';
            safeParamSet(lfo.frequency, 0.58, t);

            lfoGain = ctx.createGain();
            safeParamSet(lfoGain.gain, 260, t);

            lfo.connect(lfoGain);
            if (bp.frequency) {
              try { lfoGain.connect(bp.frequency); } catch (_) {}
            }
            if (lowFilter && lowFilter.frequency) {
              try { lfoGain.connect(lowFilter.frequency); } catch (_) {}
            }

            whisperSrc.connect(bp);
            bp.connect(whisperGain);
            whisperGain.connect(droneGain);

            whisperSrc.start(t);
            lfo.start(t);
          }

          oscSub.start(t);
          oscSaw.start(t);
          oscFifth.start(t);

          this._ringNodes = {
            droneGain,
            oscSub,
            oscSaw,
            oscFifth,
            whisperSrc,
            lfo
          };
        } catch (_) {
          this._ringNodes = null;
        }
      } else if (this._ringNodes && this.ctx) {
        try {
          const t = this.ctx.currentTime || 0;
          const g = this._ringNodes.droneGain.gain;
          safeCancel(g, t);
          safeParamSet(g, Math.max(0.0002, g.value || 0.08), t);
          safeExpRamp(g, 0.0001, t + 0.35);
          this._ringStopTimer = setTimeout(() => {
            this._ringStopTimer = null;
            if (!this.ringHumActive) {
              this._teardownRingNodes();
            }
          }, 390);
        } catch (_) {
          this._teardownRingNodes();
        }
      }
    }

    _teardownRingNodes() {
      const n = this._ringNodes;
      if (!n) return;
      this._ringNodes = null;
      const list = [n.oscSub, n.oscSaw, n.oscFifth, n.whisperSrc, n.lfo];
      for (let i = 0; i < list.length; i++) {
        const node = list[i];
        if (node) {
          try { node.stop(); } catch (_) {}
          try { node.disconnect(); } catch (_) {}
        }
      }
      if (n.droneGain) {
        try { n.droneGain.disconnect(); } catch (_) {}
      }
    }
  }

  // ============================================================================
  // 3. TD.VFX — Pooled Zero-Allocation Visual Effects System
  // ============================================================================
  const KIND_COLORS = {
    blood: '#a31818',
    spark: '#ffd54f',
    magic: '#7fd4ff',
    fire: '#ff7b29',
    smoke: '#505662',
    stone: '#8b929e',
    trail: '#ffe082'
  };

  const MAX_PARTICLES = 900;
  const MAX_TEXTS = 120;
  const MAX_SHOCKWAVES = 64;
  const MAX_LIGHTNINGS = 48;
  const MAX_BEAMS = 48;
  const TAU = Math.PI * 2;

  class VFX {
    constructor() {
      this.time = 0;

      // 1. Particle & Trail Pool
      this.particlePool = new Pool(
        () => ({
          x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, drag: 0,
          age: 0, life: 0.4, size: 3, endSize: 0.5,
          color: '#ffffff', kind: 'spark', rot: 0, vrot: 0
        }),
        (p) => {
          p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.ax = 0; p.ay = 0; p.drag = 0;
          p.age = 0; p.life = 0.4; p.size = 3; p.endSize = 0.5;
          p.color = '#ffffff'; p.kind = 'spark'; p.rot = 0; p.vrot = 0;
        },
        320
      );

      // 2. Floating Combat Text Pool
      this.textPool = new Pool(
        () => ({
          x: 0, y: 0, vx: 0, vy: -42, age: 0, life: 0.85,
          text: '', color: '#ffffff', scale: 1
        }),
        (t) => {
          t.x = 0; t.y = 0; t.vx = 0; t.vy = -42; t.age = 0; t.life = 0.85;
          t.text = ''; t.color = '#ffffff'; t.scale = 1;
        },
        64
      );

      // 3. Ground Shockwave Pool
      this.shockwavePool = new Pool(
        () => ({
          x: 0, y: 0, maxRadius: 80, color: '#ff9e40', age: 0, life: 0.45
        }),
        (s) => {
          s.x = 0; s.y = 0; s.maxRadius = 80; s.color = '#ff9e40'; s.age = 0; s.life = 0.45;
        },
        32
      );

      // 4. Chain Lightning Arc Pool (pre-allocated typed arrays -> zero GC!)
      this.lightningPool = new Pool(
        () => ({
          ptsX: new Float32Array(10),
          ptsY: new Float32Array(10),
          count: 9,
          forkIdx: 4,
          forkX1: 0, forkY1: 0, forkX2: 0, forkY2: 0,
          color: '#7fd4ff',
          age: 0,
          life: 0.22
        }),
        (l) => {
          l.count = 9;
          l.color = '#7fd4ff';
          l.age = 0;
          l.life = 0.22;
        },
        32
      );

      // 5. Flame of Anor / Tether Beam Pool
      this.beamPool = new Pool(
        () => ({
          x1: 0, y1: 0, x2: 0, y2: 0,
          intensity: 1, color: '#ff7b29',
          age: 0, life: 0.085
        }),
        (b) => {
          b.x1 = 0; b.y1 = 0; b.x2 = 0; b.y2 = 0;
          b.intensity = 1; b.color = '#ff7b29';
          b.age = 0; b.life = 0.085;
        },
        24
      );

      // 6. Light of Eärendil Spell Pool
      this.earendilPool = new Pool(
        () => ({
          x: 0, y: 0, radius: 150, age: 0, life: 1.42
        }),
        (e) => {
          e.x = 0; e.y = 0; e.radius = 150; e.age = 0; e.life = 1.42;
        },
        6
      );

      // 7. Great Eagles Sweep Pool (with pre-allocated wind streak buffers)
      this.eaglePool = new Pool(
        () => ({
          x: 0, y: 0, dirAngle: 0, cos: 1, sin: 0,
          age: 0, life: 1.62,
          streakOffAlong: new Float32Array(14),
          streakOffPerp: new Float32Array(14),
          streakLen: new Float32Array(14)
        }),
        (g) => {
          g.x = 0; g.y = 0; g.dirAngle = 0; g.cos = 1; g.sin = 0;
          g.age = 0; g.life = 1.62;
        },
        6
      );

      this.particles = [];
      this.floatingTexts = [];
      this.shockwaves = [];
      this.lightnings = [];
      this.beams = [];
      this.earendils = [];
      this.eagles = [];
    }

    reset() {
      this._releaseList(this.particles, this.particlePool);
      this._releaseList(this.floatingTexts, this.textPool);
      this._releaseList(this.shockwaves, this.shockwavePool);
      this._releaseList(this.lightnings, this.lightningPool);
      this._releaseList(this.beams, this.beamPool);
      this._releaseList(this.earendils, this.earendilPool);
      this._releaseList(this.eagles, this.eaglePool);
    }

    _releaseList(arr, pool) {
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

    update(dt) {
      if (!(dt > 0)) return;
      const step = dt > 0.1 ? 0.1 : dt;
      this.time += step;

      // Update Particles
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
        }
        p.vx += p.ax * step;
        p.vy += p.ay * step;
        p.x += p.vx * step;
        p.y += p.vy * step;
        p.rot += p.vrot * step;
      }

      // Update Floating Texts
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
        t.x += t.vx * step;
        t.y += t.vy * step;
        t.vy *= Math.max(0, 1 - 1.8 * step);
      }

      // Update Shockwaves
      this._stepSimpleList(this.shockwaves, this.shockwavePool, step);

      // Update Lightning Arcs
      this._stepSimpleList(this.lightnings, this.lightningPool, step);

      // Update Beams
      this._stepSimpleList(this.beams, this.beamPool, step);

      // Update Light of Eärendil
      this._stepSimpleList(this.earendils, this.earendilPool, step);

      // Update Great Eagles
      this._stepSimpleList(this.eagles, this.eaglePool, step);
    }

    _stepSimpleList(arr, pool, step) {
      for (let i = arr.length - 1; i >= 0; i--) {
        const item = arr[i];
        item.age += step;
        if (item.age >= item.life) {
          arr[i] = arr[arr.length - 1];
          arr.pop();
          pool.release(item);
        }
      }
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
        if (KIND_COLORS[opts]) {
          kind = opts;
        } else {
          color = opts;
        }
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

      if (count <= 0) {
        count = kind === 'smoke' ? 7 : kind === 'fire' ? 11 : 9;
      }
      if (speed <= 0) {
        speed = kind === 'spark' ? 140 : kind === 'stone' ? 115 : kind === 'smoke' ? 42 : 90;
      }
      if (life <= 0) {
        life = kind === 'smoke' ? 0.72 : kind === 'spark' ? 0.32 : kind === 'magic' ? 0.54 : 0.44;
      }
      if (size <= 0) {
        size = kind === 'smoke' ? 6.0 : kind === 'spark' ? 2.5 : 3.3;
      }

      for (let i = 0; i < count; i++) {
        this._evictOldestIfFull(this.particles, this.particlePool, MAX_PARTICLES);
        const p = this.particlePool.acquire();
        const a = (hasAngle ? angle : 0) + (Math.random() - 0.5) * spread;
        const spd = speed * (0.45 + Math.random() * 0.75);

        p.x = x + (Math.random() - 0.5) * 4;
        p.y = y + (Math.random() - 0.5) * 4;
        p.vx = Math.cos(a) * spd;
        p.vy = Math.sin(a) * spd;
        p.age = 0;
        p.life = life * (0.75 + Math.random() * 0.45);
        p.size = size * (0.75 + Math.random() * 0.45);
        p.color = color;
        p.kind = kind;
        p.rot = Math.random() * TAU;
        p.vrot = (Math.random() - 0.5) * 9;

        if (kind === 'blood') {
          p.ay = 180;
          p.drag = 3.2;
          p.endSize = p.size * 0.35;
        } else if (kind === 'stone') {
          p.ay = 240;
          p.drag = 1.6;
          p.endSize = p.size * 0.7;
        } else if (kind === 'fire') {
          p.ay = -95;
          p.drag = 2.2;
          p.endSize = 0.4;
        } else if (kind === 'smoke') {
          p.ay = -36;
          p.drag = 2.6;
          p.endSize = p.size * 2.1;
        } else if (kind === 'magic') {
          p.ay = -28;
          p.drag = 2.4;
          p.endSize = 0.3;
        } else {
          // spark
          p.ay = 65;
          p.drag = 3.0;
          p.endSize = 0.3;
        }

        this.particles.push(p);
      }
    }

    spawnTrail(x, y, color = '#ffd54f', size = 3, life = 0.24) {
      this._evictOldestIfFull(this.particles, this.particlePool, MAX_PARTICLES);
      const p = this.particlePool.acquire();
      if (color && typeof color === 'object') {
        const o = color;
        p.color = o.color || '#ffd54f';
        p.size = o.size || 3;
        p.life = o.life || 0.24;
      } else {
        p.color = color || '#ffd54f';
        p.size = size > 0 ? size : 3;
        p.life = life > 0 ? life : 0.24;
      }
      p.x = x + (Math.random() - 0.5) * 2;
      p.y = y + (Math.random() - 0.5) * 2;
      p.vx = (Math.random() - 0.5) * 14;
      p.vy = (Math.random() - 0.5) * 14 - 6;
      p.ax = 0;
      p.ay = 0;
      p.drag = 2.0;
      p.age = 0;
      p.endSize = 0.25;
      p.kind = 'trail';
      this.particles.push(p);
    }

    spawnFloatingText(x, y, text, color = '#ffffff', scale = 1) {
      if (text === undefined || text === null || text === '') return;
      this._evictOldestIfFull(this.floatingTexts, this.textPool, MAX_TEXTS);
      const t = this.textPool.acquire();
      t.x = x + (Math.random() - 0.5) * 14;
      t.y = y - 6 + (Math.random() - 0.5) * 6;
      t.vx = (Math.random() - 0.5) * 16;
      t.vy = -46 - Math.random() * 14;
      t.age = 0;

      if (color && typeof color === 'object') {
        t.color = color.color || '#ffffff';
        t.scale = color.scale || 1;
        t.life = color.life || 0.9;
      } else {
        t.color = color || '#ffffff';
        t.scale = typeof scale === 'number' && scale > 0 ? scale : 1;
        t.life = t.scale > 1.15 ? 1.05 : 0.85;
      }
      t.text = String(text);
      this.floatingTexts.push(t);
    }

    spawnLightningArc(x1, y1, x2, y2, color = '#7fd4ff') {
      this._evictOldestIfFull(this.lightnings, this.lightningPool, MAX_LIGHTNINGS);
      const arc = this.lightningPool.acquire();
      const segs = 8;
      arc.count = segs + 1;
      arc.color = color || '#7fd4ff';
      arc.age = 0;
      arc.life = 0.22;

      const dx = x2 - x1;
      const dy = y2 - y1;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = -dy / dist;
      const ny = dx / dist;
      const jitterAmp = Math.min(26, Math.max(7, dist * 0.14));

      const px = arc.ptsX;
      const py = arc.ptsY;
      px[0] = x1;
      py[0] = y1;
      for (let i = 1; i < segs; i++) {
        const f = i / segs;
        const env = Math.sin(f * Math.PI);
        const offset = (Math.random() * 2 - 1) * jitterAmp * env;
        px[i] = x1 + dx * f + nx * offset;
        py[i] = y1 + dy * f + ny * offset;
      }
      px[segs] = x2;
      py[segs] = y2;

      // Secondary side fork from midpoint
      const fi = 4;
      arc.forkIdx = fi;
      const forkSide = Math.random() < 0.5 ? -1 : 1;
      arc.forkX1 = px[fi] + (dx / segs) * 1.1 + nx * forkSide * jitterAmp * 0.85;
      arc.forkY1 = py[fi] + (dy / segs) * 1.1 + ny * forkSide * jitterAmp * 0.85;
      arc.forkX2 = arc.forkX1 + (dx / segs) * 0.9 + nx * forkSide * jitterAmp * 0.55;
      arc.forkY2 = arc.forkY1 + (dy / segs) * 0.9 + ny * forkSide * jitterAmp * 0.55;

      this.lightnings.push(arc);
    }

    spawnBeam(x1, y1, x2, y2, intensity = 1, color = '#ff7b29') {
      const col = color || '#ff7b29';
      const inten = typeof intensity === 'number' && intensity > 0 ? intensity : 1;

      // Deduplicate same-source beam within a multi-substep frame so 3x speed stays smooth
      for (let i = 0; i < this.beams.length; i++) {
        const existing = this.beams[i];
        if (
          existing.age < 0.045 &&
          existing.color === col &&
          Math.abs(existing.x1 - x1) < 2 &&
          Math.abs(existing.y1 - y1) < 2 &&
          Math.abs(existing.x2 - x2) < 28 &&
          Math.abs(existing.y2 - y2) < 28
        ) {
          existing.x2 = x2;
          existing.y2 = y2;
          existing.intensity = inten;
          existing.age = 0;
          return;
        }
      }

      this._evictOldestIfFull(this.beams, this.beamPool, MAX_BEAMS);
      const b = this.beamPool.acquire();
      b.x1 = x1;
      b.y1 = y1;
      b.x2 = x2;
      b.y2 = y2;
      b.intensity = inten;
      b.color = col;
      b.age = 0;
      b.life = 0.085;
      this.beams.push(b);
    }

    spawnShockwave(x, y, maxRadius = 80, color = '#ff9e40', duration = 0.45) {
      this._evictOldestIfFull(this.shockwaves, this.shockwavePool, MAX_SHOCKWAVES);
      const s = this.shockwavePool.acquire();
      s.x = x;
      s.y = y;
      s.maxRadius = maxRadius > 0 ? maxRadius : 80;
      s.color = color || '#ff9e40';
      s.age = 0;
      s.life = duration > 0 ? duration : 0.45;
      this.shockwaves.push(s);
    }

    spawnExplosion(x, y, radius = 65, color = '#ff7b29') {
      this.spawnShockwave(x, y, radius, color, 0.42);
      this.spawnBurst(x, y, { kind: 'fire', color, count: 12, speed: radius * 1.5, size: 4.0, life: 0.46 });
      this.spawnBurst(x, y, { kind: 'smoke', count: 7, speed: radius * 0.7, size: 6.5, life: 0.72 });
      this.spawnBurst(x, y, { kind: 'stone', count: 6, speed: radius * 1.4, size: 3.0, life: 0.45 });
    }

    spawnLightOfEarendil(x, y, radius = 150) {
      this._evictOldestIfFull(this.earendils, this.earendilPool, 6);
      const e = this.earendilPool.acquire();
      e.x = x;
      e.y = y;
      e.radius = radius > 0 ? radius : 150;
      e.age = 0;
      e.life = 1.42;
      this.earendils.push(e);

      this.spawnShockwave(x, y, e.radius, '#9be7ff', 0.65);
      this.spawnBurst(x, y, {
        kind: 'magic',
        color: '#e0f7fa',
        count: 22,
        speed: 135,
        size: 3.8,
        life: 0.85
      });
    }

    spawnGreatEagles(x, y, dirAngle = 0) {
      this._evictOldestIfFull(this.eagles, this.eaglePool, 4);
      const g = this.eaglePool.acquire();
      g.x = x;
      g.y = y;
      g.dirAngle = typeof dirAngle === 'number' ? dirAngle : 0;
      g.cos = Math.cos(g.dirAngle);
      g.sin = Math.sin(g.dirAngle);
      g.age = 0;
      g.life = 1.62;

      for (let i = 0; i < 14; i++) {
        g.streakOffAlong[i] = (Math.random() - 0.5) * 520;
        g.streakOffPerp[i] = (Math.random() - 0.5) * 170;
        g.streakLen[i] = 48 + Math.random() * 68;
      }

      this.eagles.push(g);
    }

    // ==========================================================================
    // Ground-Layer Rendering (Shockwaves, Elven Rune Rings, Eagle Drop-Shadows)
    // ==========================================================================
    renderGround(ctx, time) {
      if (!ctx) return;
      const tNow = typeof time === 'number' ? time : this.time;

      ctx.save();

      // 1. Shockwaves
      for (let i = 0; i < this.shockwaves.length; i++) {
        const s = this.shockwaves[i];
        const p = s.age / s.life;
        if (p < 0 || p >= 1) continue;
        const ease = 1 - Math.pow(1 - p, 2.5);
        const r = Math.max(1, s.maxRadius * ease);
        const alpha = (1 - p) * 0.85;

        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, TAU);
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = Math.max(1.2, (1 - p) * 5.5);
        ctx.stroke();

        ctx.globalAlpha = alpha * 0.16;
        ctx.fillStyle = s.color;
        ctx.fill();
      }

      // 2. Light of Eärendil — Ornate Elven Rune Circle on Ground
      for (let i = 0; i < this.earendils.length; i++) {
        const e = this.earendils[i];
        const p = e.age / e.life;
        if (p < 0 || p >= 1) continue;
        const fadeIn = p < 0.12 ? p / 0.12 : 1;
        const fadeOut = p > 0.55 ? (1 - p) / 0.45 : 1;
        const alpha = fadeIn * fadeOut;
        const r = e.radius * (0.92 + 0.08 * Math.min(1, p * 4));

        ctx.save();
        ctx.translate(e.x, e.y);

        if (typeof ctx.createRadialGradient === 'function') {
          const grad = ctx.createRadialGradient(0, 0, r * 0.05, 0, 0, r);
          grad.addColorStop(0, 'rgba(224, 247, 250, 0.42)');
          grad.addColorStop(0.65, 'rgba(127, 212, 255, 0.18)');
          grad.addColorStop(1, 'rgba(127, 212, 255, 0)');
          ctx.globalAlpha = alpha;
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, TAU);
          ctx.fill();
        }

        // Outer & Inner Elven Rings
        ctx.globalAlpha = alpha * 0.9;
        ctx.strokeStyle = '#b3ecff';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.stroke();

        ctx.lineWidth = 1.4;
        ctx.strokeStyle = '#e0f7fa';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.78, 0, TAU);
        ctx.stroke();

        // Rotating 8-point Star of Eärendil & 12 Rune glyphs
        ctx.rotate(tNow * 0.65 + p * 0.9);
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const a1 = (k * TAU) / 8;
          const a2 = a1 + (TAU * 3) / 8;
          ctx.moveTo(Math.cos(a1) * r * 0.76, Math.sin(a1) * r * 0.76);
          ctx.lineTo(Math.cos(a2) * r * 0.76, Math.sin(a2) * r * 0.76);
        }
        ctx.globalAlpha = alpha * 0.55;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // 12 Elven rune marks between inner & outer rings
        ctx.globalAlpha = alpha * 0.85;
        ctx.lineWidth = 1.6;
        for (let k = 0; k < 12; k++) {
          const a = (k * TAU) / 12;
          const c = Math.cos(a);
          const s = Math.sin(a);
          ctx.beginPath();
          ctx.moveTo(c * r * 0.82, s * r * 0.82);
          ctx.lineTo(c * r * 0.95, s * r * 0.95);
          ctx.moveTo(c * r * 0.88 - s * 4.5, s * r * 0.88 + c * 4.5);
          ctx.lineTo(c * r * 0.88 + s * 4.5, s * r * 0.88 - c * 4.5);
          ctx.stroke();
        }

        ctx.restore();
      }

      // 3. Great Eagles — Corridor Golden Wash & 3 Sweeping Drop-Shadows
      for (let i = 0; i < this.eagles.length; i++) {
        const g = this.eagles[i];
        const p = g.age / g.life;
        if (p < 0 || p >= 1) continue;
        const env = Math.sin(p * Math.PI);

        // Subtle sunlit corridor sweep on ground
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(g.dirAngle);
        ctx.globalAlpha = env * 0.16;
        ctx.fillStyle = '#ffd54f';
        ctx.fillRect(-260, -92, 520, 184);
        ctx.restore();

        // 3 Eagle ground drop-shadows
        const travel = (p - 0.5) * 760;
        this._drawEagleFormation(ctx, g, travel, env * 0.34, true);
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // ==========================================================================
    // Air-Layer Rendering (Particles, Arcs, Beams, Pillar, Eagles, Combat Text)
    // ==========================================================================
    renderAir(ctx, time) {
      if (!ctx) return;
      const tNow = typeof time === 'number' ? time : this.time;

      ctx.save();

      // 1. Particles & Projectile Trails
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const u = p.age / p.life;
        if (u < 0 || u >= 1) continue;
        const alpha = 1 - u;
        const r = Math.max(0.4, p.size + (p.endSize - p.size) * u);

        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.color;

        if (p.kind === 'spark') {
          ctx.globalAlpha = alpha;
          ctx.lineWidth = Math.max(1, r * 0.85);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.032, p.y - p.vy * 0.032);
          ctx.stroke();
        } else if (p.kind === 'stone') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = alpha;
          ctx.fillRect(-r, -r * 0.75, r * 2, r * 1.5);
          ctx.restore();
        } else if (p.kind === 'magic') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = alpha * 0.92;
          ctx.beginPath();
          ctx.moveTo(0, -r * 1.3);
          ctx.lineTo(r * 0.9, 0);
          ctx.lineTo(0, r * 1.3);
          ctx.lineTo(-r * 0.9, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else {
          ctx.globalAlpha = p.kind === 'smoke' ? alpha * 0.42 : alpha * 0.9;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, TAU);
          ctx.fill();
        }
      }

      // 2. Flame of Anor / Boss Tether Beams
      for (let i = 0; i < this.beams.length; i++) {
        const b = this.beams[i];
        const u = b.age / b.life;
        if (u < 0 || u >= 1) continue;
        const alpha = 1 - u * 0.85;
        const pulse = 0.9 + 0.15 * Math.sin(tNow * 34 + i);
        const inten = Math.min(4, Math.max(0.5, b.intensity)) * pulse;

        ctx.lineCap = 'round';

        // Outer fiery glow
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = alpha * 0.32;
        ctx.lineWidth = 7 + inten * 3.8;
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        ctx.lineTo(b.x2, b.y2);
        ctx.stroke();

        // Mid molten core
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = alpha * 0.78;
        ctx.lineWidth = 3.0 + inten * 1.7;
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        ctx.lineTo(b.x2, b.y2);
        ctx.stroke();

        // White-hot Secret Fire filament
        ctx.strokeStyle = '#fff9e6';
        ctx.globalAlpha = alpha * 0.95;
        ctx.lineWidth = 1.2 + inten * 0.75;
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        ctx.lineTo(b.x2, b.y2);
        ctx.stroke();

        // Source & impact flares
        ctx.fillStyle = '#fff3cd';
        ctx.globalAlpha = alpha * 0.85;
        ctx.beginPath();
        ctx.arc(b.x1, b.y1, 2.5 + inten * 1.2, 0, TAU);
        ctx.arc(b.x2, b.y2, 3.5 + inten * 1.8, 0, TAU);
        ctx.fill();
      }

      // 3. Chain Lightning Arcs
      for (let i = 0; i < this.lightnings.length; i++) {
        const l = this.lightnings[i];
        const u = l.age / l.life;
        if (u < 0 || u >= 1) continue;
        const alpha = 1 - u;
        const px = l.ptsX;
        const py = l.ptsY;
        const n = l.count;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Outer electric halo
        ctx.strokeStyle = l.color;
        ctx.globalAlpha = alpha * 0.45;
        ctx.lineWidth = 5.5;
        ctx.beginPath();
        ctx.moveTo(px[0], py[0]);
        for (let k = 1; k < n; k++) ctx.lineTo(px[k], py[k]);
        ctx.moveTo(px[l.forkIdx], py[l.forkIdx]);
        ctx.lineTo(l.forkX1, l.forkY1);
        ctx.lineTo(l.forkX2, l.forkY2);
        ctx.stroke();

        // Inner white-hot bolt
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = alpha * 0.95;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(px[0], py[0]);
        for (let k = 1; k < n; k++) ctx.lineTo(px[k], py[k]);
        ctx.moveTo(px[l.forkIdx], py[l.forkIdx]);
        ctx.lineTo(l.forkX1, l.forkY1);
        ctx.lineTo(l.forkX2, l.forkY2);
        ctx.stroke();
      }

      // 4. Light of Eärendil — Radiant Starlight Pillar from Sky
      for (let i = 0; i < this.earendils.length; i++) {
        const e = this.earendils[i];
        const p = e.age / e.life;
        if (p < 0 || p >= 1) continue;
        const swell = p < 0.14 ? p / 0.14 : 1 - (p - 0.14) / 0.86;
        const halfW = Math.max(8, e.radius * 0.48 * swell);
        const topY = -30;

        if (typeof ctx.createLinearGradient === 'function') {
          const grad = ctx.createLinearGradient(e.x - halfW, 0, e.x + halfW, 0);
          grad.addColorStop(0, 'rgba(127, 212, 255, 0)');
          grad.addColorStop(0.28, 'rgba(179, 236, 255, 0.35)');
          grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.78)');
          grad.addColorStop(0.72, 'rgba(179, 236, 255, 0.35)');
          grad.addColorStop(1, 'rgba(127, 212, 255, 0)');

          ctx.globalAlpha = swell * 0.92;
          ctx.fillStyle = grad;
          ctx.fillRect(e.x - halfW, topY, halfW * 2, e.y - topY);
        } else {
          ctx.globalAlpha = swell * 0.45;
          ctx.fillStyle = '#e0f7fa';
          ctx.fillRect(e.x - halfW * 0.5, topY, halfW, e.y - topY);
        }

        // Blazing Star of Eärendil flare at impact center
        ctx.save();
        ctx.translate(e.x, e.y - 8);
        ctx.globalAlpha = swell * 0.95;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.4;
        const starR = 28 + 26 * swell;
        ctx.beginPath();
        ctx.moveTo(-starR, 0);
        ctx.lineTo(starR, 0);
        ctx.moveTo(0, -starR * 1.25);
        ctx.lineTo(0, starR * 1.25);
        ctx.moveTo(-starR * 0.55, -starR * 0.55);
        ctx.lineTo(starR * 0.55, starR * 0.55);
        ctx.moveTo(-starR * 0.55, starR * 0.55);
        ctx.lineTo(starR * 0.55, -starR * 0.55);
        ctx.stroke();
        ctx.restore();
      }

      // 5. Great Eagles — Golden Wind Streaks & 3 Sweeping Majestic Eagles
      for (let i = 0; i < this.eagles.length; i++) {
        const g = this.eagles[i];
        const p = g.age / g.life;
        if (p < 0 || p >= 1) continue;
        const env = Math.sin(p * Math.PI);
        const travel = (p - 0.5) * 760;

        // Golden wind streaks sweeping down the lane
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(g.dirAngle);
        ctx.lineCap = 'round';
        for (let k = 0; k < 14; k++) {
          const sx = g.streakOffAlong[k] + (p - 0.5) * 440;
          const sy = g.streakOffPerp[k];
          const sl = g.streakLen[k];
          ctx.strokeStyle = k % 3 === 0 ? '#fff8e1' : '#ffd54f';
          ctx.globalAlpha = env * 0.55;
          ctx.lineWidth = k % 3 === 0 ? 2.2 : 1.5;
          ctx.beginPath();
          ctx.moveTo(sx - sl * 0.5, sy);
          ctx.lineTo(sx + sl * 0.5, sy);
          ctx.stroke();
        }
        ctx.restore();

        // 3 Majestic Great Eagle silhouettes
        this._drawEagleFormation(ctx, g, travel, Math.min(1, env * 1.45), false);
      }

      // 6. Floating Combat Numbers & Callouts
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (let i = 0; i < this.floatingTexts.length; i++) {
        const t = this.floatingTexts[i];
        const u = t.age / t.life;
        if (u < 0 || u >= 1) continue;

        const pop = u < 0.14 ? 0.85 + (u / 0.14) * 0.35 : 1.2 - Math.min(0.2, (u - 0.14) * 0.35);
        const alpha = u > 0.65 ? (1 - u) / 0.35 : 1;
        const fontPx = Math.round(14 * t.scale * pop);

        ctx.font = '700 ' + fontPx + 'px "Segoe UI", system-ui, sans-serif';
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = '#0c0f14';
        ctx.strokeText(t.text, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    }

    _drawEagleFormation(ctx, g, travel, alpha, isShadow) {
      // V-formation: 1 giant lead eagle + 2 flanking wingman eagles
      const perpX = -g.sin;
      const perpY = g.cos;

      for (let idx = 0; idx < 3; idx++) {
        const backOffset = idx === 0 ? 34 : -48;
        const sideOffset = idx === 0 ? 0 : idx === 1 ? -68 : 68;
        const scale = idx === 0 ? 1.18 : 0.94;
        const flap = Math.sin(g.age * 8.5 + idx * 1.35) * 0.14;

        let ex = g.x + g.cos * (travel + backOffset) + perpX * sideOffset;
        let ey = g.y + g.sin * (travel + backOffset) + perpY * sideOffset;

        if (isShadow) {
          ex += 26;
          ey += 44;
        } else {
          ey -= 18;
        }

        this._drawSingleEagle(ctx, ex, ey, g.dirAngle, scale * (isShadow ? 0.88 : 1), flap, alpha, isShadow);
      }
    }

    _drawSingleEagle(ctx, x, y, angle, scale, flap, alpha, isShadow) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;

      const wingSpan = 54 * (1 - Math.abs(flap) * 0.35);
      const wingSweep = -12 + flap * 18;

      // Swept Great Eagle silhouette (facing +X)
      ctx.beginPath();
      // Beak & head
      ctx.moveTo(28, 0);
      ctx.lineTo(19, -4.5);
      ctx.lineTo(11, -5);
      // Left leading wing edge -> feathered wingtip
      ctx.quadraticCurveTo(4, -26, wingSweep, -wingSpan);
      ctx.lineTo(wingSweep - 9, -wingSpan + 5);
      ctx.lineTo(wingSweep - 5, -wingSpan + 13);
      ctx.lineTo(wingSweep - 12, -wingSpan + 18);
      // Left trailing wing edge -> body
      ctx.quadraticCurveTo(-10, -18, -14, -6);
      // Fanned tail feathers
      ctx.lineTo(-30, -11);
      ctx.lineTo(-34, 0);
      ctx.lineTo(-30, 11);
      ctx.lineTo(-14, 6);
      // Right trailing wing edge -> wingtip
      ctx.quadraticCurveTo(-10, 18, wingSweep - 12, wingSpan - 18);
      ctx.lineTo(wingSweep - 5, wingSpan - 13);
      ctx.lineTo(wingSweep - 9, wingSpan - 5);
      ctx.lineTo(wingSweep, wingSpan);
      // Right leading wing edge -> head
      ctx.quadraticCurveTo(4, 26, 11, 5);
      ctx.lineTo(19, 4.5);
      ctx.closePath();

      if (isShadow) {
        ctx.fillStyle = '#090b0f';
        ctx.fill();
      } else {
        ctx.fillStyle = '#5d4037';
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = '#ffd54f';
        ctx.stroke();

        // Sunlit golden mantle, crown & beak highlight
        ctx.beginPath();
        ctx.moveTo(27, 0);
        ctx.lineTo(17, -3.5);
        ctx.quadraticCurveTo(3, -18, wingSweep * 0.55, -wingSpan * 0.62);
        ctx.quadraticCurveTo(-2, -10, -8, 0);
        ctx.quadraticCurveTo(-2, 10, wingSweep * 0.55, wingSpan * 0.62);
        ctx.quadraticCurveTo(3, 18, 17, 3.5);
        ctx.closePath();
        ctx.fillStyle = '#c89b3c';
        ctx.fill();

        // Golden hooked raptor beak
        ctx.beginPath();
        ctx.moveTo(30, 0);
        ctx.lineTo(22, -2.6);
        ctx.lineTo(22, 2.6);
        ctx.closePath();
        ctx.fillStyle = '#ffe082';
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // Export on window.TD
  TD.Pool = Pool;
  TD.SoundEngine = SoundEngine;
  TD.VFX = VFX;
})(window.TD = window.TD || {});
