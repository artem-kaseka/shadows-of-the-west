#!/usr/bin/env node
/**
 * Deterministic 1080p60 Gameplay Demo Recorder + Procedural Stereo Audio Renderer
 * for "Shadows of the West — Siege of Middle-earth" (/home/artem/td/index.html)
 *
 * Owned by @recorder. Strictly read-only with respect to index.html and src/*.
 *
 * Usage:
 *   node /home/artem/td/scripts/record_demo.mjs
 *   node /home/artem/td/scripts/record_demo.mjs --dry-run /tmp/td-preview
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';

const ROOT_DIR = '/home/artem/td';
const INDEX_HTML = path.join(ROOT_DIR, 'index.html');
const OUTPUT_MP4 = path.join(ROOT_DIR, 'demo_1080p.mp4');

const VIEWPORT_W = 1920;
const VIEWPORT_H = 1080;
const LOGICAL_W = 1280;
const LOGICAL_H = 720;

const args = process.argv.slice(2);
const dryRunIdx = args.indexOf('--dry-run');
const DRY_RUN_DIR = dryRunIdx >= 0 ? (args[dryRunIdx + 1] || path.join(os.tmpdir(), 'td-demo-dryrun')) : null;
const fpsArgIdx = args.indexOf('--fps');
const FPS = fpsArgIdx >= 0 ? Number(args[fpsArgIdx + 1]) || 60 : 60;
const DT_MS = 1000 / FPS;

function findBrowserExecutable() {
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  const pwCache = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (fs.existsSync(pwCache)) {
    for (const entry of fs.readdirSync(pwCache)) {
      if (entry.startsWith('chromium-')) {
        const p = path.join(pwCache, entry, 'chrome-linux', 'chrome');
        if (fs.existsSync(p)) return p;
      }
    }
  }
  throw new Error('No headless Chrome/Chromium executable found');
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Encode stereo Float32Array channels into a 44100 Hz 16-bit PCM WAV buffer.
 */
function encodeStereoWav16(left, right, sampleRate = 44100) {
  const numFrames = Math.min(left.length, right.length);
  const numChannels = 2;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataBytes = numFrames * blockAlign;
  const buf = Buffer.allocUnsafe(44 + dataBytes);

  buf.write('RIFF', 0, 4, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 4, 'ascii');
  buf.write('fmt ', 12, 4, 'ascii');
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20);  // PCM format = 1
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * blockAlign, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(16, 34); // 16 bits per sample
  buf.write('data', 36, 4, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    buf.writeInt16LE(l < 0 ? Math.round(l * 32768) : Math.round(l * 32767), offset);
    buf.writeInt16LE(r < 0 ? Math.round(r * 32768) : Math.round(r * 32767), offset + 2);
    offset += 4;
  }
  return buf;
}

async function launchRecorderBrowser() {
  const chromeBin = findBrowserExecutable();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-recorder-chrome-'));

  const proc = spawn(
    chromeBin,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      '--hide-scrollbars',
      `--window-size=${VIEWPORT_W},${VIEWPORT_H}`,
      `--user-data-dir=${userDataDir}`,
      '--remote-debugging-port=0',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  const port = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`Chrome startup timed out:\n${stderr}`)), 10000);
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      const m = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited prematurely (${code}):\n${stderr}`));
    });
  });

  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const pageTarget = targets.find((t) => t.type === 'page');
  if (!pageTarget) throw new Error('No page target found in headless Chrome');

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let msgId = 0;
  const pending = new Map();
  const runtimeErrors = [];

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error)})`));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      runtimeErrors.push(d.exception?.description || d.text || 'Uncaught exception');
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (fnOrExpr, arg = undefined) => {
    const expression =
      typeof fnOrExpr === 'function'
        ? `(${fnOrExpr.toString()})(${arg === undefined ? '' : JSON.stringify(arg)})`
        : fnOrExpr;
    const res = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(`Evaluation exception: ${desc}`);
    }
    return res.result?.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Animation.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: VIEWPORT_W,
    height: VIEWPORT_H,
    deviceScaleFactor: 1,
    mobile: false,
  });

  if (!DRY_RUN_DIR) {
    // Match CSS transition/keyframe wall-clock rate to screenshot capture throughput (~7x)
    await send('Animation.setPlaybackRate', { playbackRate: 0.16 });
  }

  // Runtime-only deterministic stepper + Virtual setTimeout + Tarnished-Gold Cursor & Click Ripples + Audio Event Recorder
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      (() => {
        const nativeRaf = window.requestAnimationFrame.bind(window);
        const nativeCancel = window.cancelAnimationFrame.bind(window);
        const nativePerfNow = performance.now.bind(performance);
        const nativeSetTimeout = window.setTimeout.bind(window);
        const nativeClearTimeout = window.clearTimeout.bind(window);

        let manual = false;
        let virtualNow = 0;
        let videoFrameCount = 0;
        let videoFps = ${FPS};
        let nextRafId = 100000;
        let nextTimerId = 500000;

        const manualQueue = new Map();
        const pendingNative = new Map();
        const virtualTimers = new Map();

        performance.now = function() {
          if (manual) return virtualNow;
          return nativePerfNow();
        };

        window.requestAnimationFrame = function(cb) {
          if (manual) {
            const id = ++nextRafId;
            manualQueue.set(id, cb);
            return id;
          }
          const nid = nativeRaf(() => {
            pendingNative.delete(nid);
            if (manual) {
              manualQueue.set(++nextRafId, cb);
              return;
            }
            cb(performance.now());
          });
          pendingNative.set(nid, nid);
          pendingNative.set(nid, cb);
          return nid;
        };

        window.cancelAnimationFrame = function(id) {
          if (manualQueue.has(id)) {
            manualQueue.delete(id);
            return;
          }
          if (pendingNative.has(id)) {
            pendingNative.delete(id);
          }
          return nativeCancel(id);
        };

        window.setTimeout = function(fn, delay = 0, ...rest) {
          if (!manual || typeof fn !== 'function') {
            return nativeSetTimeout(fn, delay, ...rest);
          }
          const id = ++nextTimerId;
          virtualTimers.set(id, {
            id,
            fireAt: virtualNow + Math.max(0, Number(delay) || 0),
            fn,
            args: rest
          });
          return id;
        };

        window.clearTimeout = function(id) {
          if (virtualTimers.has(id)) {
            virtualTimers.delete(id);
            return;
          }
          return nativeClearTimeout(id);
        };

        // --- Runtime-only Tarnished-Gold Cursor & Click Ripple Overlay ---
        const cursorState = {
          x: 960,
          y: 230,
          pressed: false,
          ripples: [],
          canvas: null,
          ctx: null
        };

        function ensureCursorOverlay() {
          if (cursorState.canvas && cursorState.canvas.isConnected) return cursorState.ctx;
          if (!document.documentElement) return null;
          let c = document.getElementById('__demo-cursor-overlay');
          if (!c) {
            c = document.createElement('canvas');
            c.id = '__demo-cursor-overlay';
            c.width = ${VIEWPORT_W};
            c.height = ${VIEWPORT_H};
            c.style.cssText = 'position:fixed;inset:0;width:1920px;height:1080px;pointer-events:none !important;z-index:2147483647;';
            document.documentElement.appendChild(c);
          }
          cursorState.canvas = c;
          cursorState.ctx = c.getContext('2d');
          return cursorState.ctx;
        }

        function renderCursorOverlay(nowMs) {
          const ctx = ensureCursorOverlay();
          if (!ctx) return;
          ctx.clearRect(0, 0, ${VIEWPORT_W}, ${VIEWPORT_H});

          // 1. Expanding click ripples
          for (let i = cursorState.ripples.length - 1; i >= 0; i--) {
            const rp = cursorState.ripples[i];
            const age = (nowMs - rp.bornMs) / 1000;
            if (age >= rp.dur) {
              cursorState.ripples.splice(i, 1);
              continue;
            }
            const p = Math.max(0, Math.min(1, age / rp.dur));
            const ease = 1 - Math.pow(1 - p, 2.4);
            const alpha = (1 - p) * 0.92;

            ctx.save();
            // Outer tarnished-gold shockwave ring
            ctx.beginPath();
            ctx.arc(rp.x, rp.y, 9 + ease * 36, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(240, 210, 122, ' + alpha.toFixed(3) + ')';
            ctx.lineWidth = 2.8 * (1 - p * 0.5);
            ctx.stroke();

            // Inner rune-starlight ring
            ctx.beginPath();
            ctx.arc(rp.x, rp.y, 4 + ease * 20, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 248, 220, ' + (alpha * 0.8).toFixed(3) + ')';
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.restore();
          }

          // 2. Tarnished-gold pointer halo + crisp Middle-earth spearhead cursor
          const x = cursorState.x;
          const y = cursorState.y;
          const scale = cursorState.pressed ? 0.88 : 1.0;

          ctx.save();
          ctx.translate(x, y);
          ctx.scale(scale, scale);

          // Subtle outer gold tracking ring around cursor tip
          ctx.beginPath();
          ctx.arc(0, 0, 14, 0, Math.PI * 2);
          ctx.fillStyle = cursorState.pressed ? 'rgba(240, 210, 122, 0.24)' : 'rgba(240, 210, 122, 0.10)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(240, 210, 122, 0.72)';
          ctx.lineWidth = 1.6;
          ctx.stroke();

          // Crisp drop-shadowed tarnished-gold pointer arrow
          ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetX = 1.5;
          ctx.shadowOffsetY = 2;

          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, 22);
          ctx.lineTo(6.2, 17.2);
          ctx.lineTo(10.5, 25.5);
          ctx.lineTo(14.2, 23.6);
          ctx.lineTo(9.8, 15.2);
          ctx.lineTo(16.8, 14.2);
          ctx.closePath();

          const grad = ctx.createLinearGradient(0, 0, 16, 24);
          grad.addColorStop(0, '#fff6cf');
          grad.addColorStop(0.5, '#e5be63');
          grad.addColorStop(1, '#9c7424');
          ctx.fillStyle = grad;
          ctx.fill();

          ctx.shadowColor = 'transparent';
          ctx.strokeStyle = '#18130a';
          ctx.lineWidth = 1.8;
          ctx.lineJoin = 'round';
          ctx.stroke();

          // Bright pinpoint tip dot
          ctx.beginPath();
          ctx.arc(1.2, 1.5, 1.8, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();

          ctx.restore();
        }

        window.__demoCursor = {
          setPos(x, y, pressed = false) {
            cursorState.x = x;
            cursorState.y = y;
            cursorState.pressed = !!pressed;
            renderCursorOverlay(virtualNow);
          },
          ripple(x, y) {
            cursorState.x = x;
            cursorState.y = y;
            cursorState.ripples.push({ x, y, bornMs: virtualNow, dur: 0.42 });
            renderCursorOverlay(virtualNow);
          },
          getPos() {
            return { x: cursorState.x, y: cursorState.y };
          }
        };

        // --- Deterministic Audio Event Recorder ---
        window.__audioLog = [];
        window.__ringHumSpans = [];
        window.__activeRingSpanStart = null;
        window.__getVideoTimeSec = () => videoFrameCount / videoFps;

        window.__simControl = {
          setManual(enable) {
            if (enable && !manual) {
              virtualNow = nativePerfNow();
              manual = true;
              for (const [nid, cb] of pendingNative.entries()) {
                nativeCancel(nid);
                if (typeof cb === 'function') manualQueue.set(++nextRafId, cb);
              }
              pendingNative.clear();
              renderCursorOverlay(virtualNow);
            }
          },
          stepFrames(frames = 1, dtMs = ${DT_MS}) {
            if (!manual) this.setManual(true);
            for (let i = 0; i < frames; i++) {
              virtualNow += dtMs;
              videoFrameCount++;

              // Fire any due virtual timers in deterministic order
              if (virtualTimers.size > 0) {
                const due = [];
                for (const t of virtualTimers.values()) {
                  if (t.fireAt <= virtualNow) due.push(t);
                }
                if (due.length > 0) {
                  due.sort((a, b) => a.fireAt - b.fireAt || a.id - b.id);
                  for (const t of due) {
                    virtualTimers.delete(t.id);
                    try { t.fn(...t.args); } catch (_) {}
                  }
                }
              }

              const cbs = Array.from(manualQueue.values());
              manualQueue.clear();
              for (const cb of cbs) {
                cb(virtualNow);
              }

              renderCursorOverlay(virtualNow);
            }
            return { frame: videoFrameCount, timeSec: videoFrameCount / videoFps };
          },
          getVideoFrame: () => videoFrameCount,
          getVideoTimeSec: () => videoFrameCount / videoFps
        };
      })();
    `,
  });

  const close = async () => {
    try { ws.close(); } catch {}
    try { proc.kill('SIGKILL'); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  };

  return { send, evaluate, runtimeErrors, close };
}

/**
 * Install audio recorder hooks onto window.game.sound so every SFX and Ring hum
 * fires with exact video timestamp + spatial pan hint.
 */
async function installAudioRecorderHooks(browser) {
  await browser.evaluate(() => {
    const g = window.game;
    if (!g || !g.sound || g.sound.__hookedForDemo) return;
    const s = g.sound;
    s.__hookedForDemo = true;

    const KEY_TO_METHOD = {
      bow: 'playBow',
      ballista: 'playBallista',
      catapult: 'playCatapultLaunch',
      explosion: 'playExplosion',
      magicBolt: 'playMagicBolt',
      lightning: 'playLightning',
      beamTick: 'playBeamTick',
      swordClash: 'playSwordClash',
      wargLeap: 'playWargLeap',
      horn: 'playHorn',
      click: 'playClick',
      build: 'playBuild',
      upgrade: 'playUpgrade',
      sell: 'playSell',
      spellLight: 'playSpellLight',
      spellEagles: 'playSpellEagles',
      wraithSpawn: 'playWraithSpawn',
      bossRoar: 'playBossRoar',
      curseBreak: 'playCurseBreak',
      victory: 'playVictory',
      defeat: 'playDefeat'
    };

    const origCanPlay = s._canPlay.bind(s);
    let lastPausedClickMs = -1e9;
    s._canPlay = function(key, minIntervalMs = 38) {
      // Allow UI clicks while paused in Codex so Codex tab clicks sound crisp!
      if (this.paused && key === 'click' && !this.muted) {
        const now = this._nowMs();
        if (now - lastPausedClickMs >= 35) {
          lastPausedClickMs = now;
          const cur = window.__demoCursor ? window.__demoCursor.getPos() : { x: 960 };
          const pan = Math.max(-0.55, Math.min(0.55, ((cur.x / 1920) - 0.5) * 0.7));
          window.__audioLog.push({
            t: window.__getVideoTimeSec(),
            method: 'playClick',
            key: 'click',
            pan
          });
        }
        return false;
      }

      const ok = origCanPlay(key, minIntervalMs);
      if (ok && KEY_TO_METHOD[key]) {
        const cur = window.__demoCursor ? window.__demoCursor.getPos() : { x: 960 };
        // Gentle stereo spread across combat & UI events
        const jitterPan = ((window.__audioLog.length * 0.6180339) % 1 - 0.5) * 0.55;
        const uiPan = ((cur.x / 1920) - 0.5) * 0.55;
        const isUi = key === 'click' || key === 'build' || key === 'upgrade' || key === 'sell';
        window.__audioLog.push({
          t: window.__getVideoTimeSec(),
          method: KEY_TO_METHOD[key],
          key,
          pan: Math.max(-0.65, Math.min(0.65, isUi ? uiPan : jitterPan))
        });
      }
      return ok;
    };

    const syncRingLog = () => {
      const should = !!(s._ringHumDesired && !s.muted && !s.paused);
      const t = window.__getVideoTimeSec();
      if (should && window.__activeRingSpanStart === null) {
        window.__activeRingSpanStart = t;
      } else if (!should && window.__activeRingSpanStart !== null) {
        if (t > window.__activeRingSpanStart + 0.02) {
          window.__ringHumSpans.push({ start: window.__activeRingSpanStart, end: t });
        }
        window.__activeRingSpanStart = null;
      }
    };

    const origSetRingHum = s.setRingHum.bind(s);
    s.setRingHum = function(active) {
      const r = origSetRingHum(active);
      syncRingLog();
      return r;
    };

    const origPauseAll = s.pauseAll.bind(s);
    s.pauseAll = function() {
      const r = origPauseAll();
      syncRingLog();
      return r;
    };

    const origResumeAll = s.resumeAll.bind(s);
    s.resumeAll = function() {
      const r = origResumeAll();
      syncRingLog();
      return r;
    };
  });
}

/**
 * Render the full stereo 44100 Hz soundtrack inside Chrome's OfflineAudioContext,
 * driving native TD.SoundEngine + One Ring drone + atmospheric Middle-earth score.
 */
async function renderSynchronizedAudioWav(browser, totalDurationSec, actMarkers) {
  const sampleRate = 44100;
  console.log(`Rendering stereo ${sampleRate}Hz soundtrack (${totalDurationSec.toFixed(2)}s)...`);

  const audioResult = await browser.evaluate(async ({ durationSec, sr, markers }) => {
    // Close any open ring hum span
    if (window.__activeRingSpanStart !== null) {
      window.__ringHumSpans.push({ start: window.__activeRingSpanStart, end: durationSec });
      window.__activeRingSpanStart = null;
    }

    const totalSamples = Math.max(sr, Math.ceil(durationSec * sr));
    const off = new OfflineAudioContext(2, totalSamples, sr);

    let scheduledTime = 0;
    Object.defineProperty(off, 'currentTime', {
      get: () => scheduledTime,
      configurable: true
    });

    // Master bus: warm gentle compression + limiter headroom
    const masterBus = off.createGain();
    masterBus.gain.setValueAtTime(0.88, 0);
    // Smooth fade-in (0.18s) and clean fade-out (last 0.35s)
    masterBus.gain.setValueAtTime(0.001, 0);
    masterBus.gain.linearRampToValueAtTime(0.88, 0.18);
    if (durationSec > 0.6) {
      masterBus.gain.setValueAtTime(0.88, Math.max(0.2, durationSec - 0.38));
      masterBus.gain.linearRampToValueAtTime(0.02, durationSec);
    }

    const comp = off.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-12, 0);
    comp.knee.setValueAtTime(14, 0);
    comp.ratio.setValueAtTime(5, 0);
    comp.attack.setValueAtTime(0.003, 0);
    comp.release.setValueAtTime(0.15, 0);
    masterBus.connect(comp);
    comp.connect(off.destination);

    // Instantiate native TD.SoundEngine wired into our OfflineAudioContext
    const se = new window.TD.SoundEngine();
    se.muted = false;
    se.paused = false;
    se.ctx = off;
    se._canPlay = () => true; // Events were already throttled during deterministic run
    se._buildNoiseBuffers(off);

    // Route each SFX event through a stereo panner into masterBus
    const events = window.__audioLog || [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.t < 0 || ev.t >= durationSec - 0.02) continue;
      if (typeof se[ev.method] !== 'function') continue;

      const panNode = off.createStereoPanner();
      panNode.pan.setValueAtTime(ev.pan || 0, ev.t);
      const sfxGain = off.createGain();
      sfxGain.gain.setValueAtTime(0.82, ev.t);
      sfxGain.connect(panNode);
      panNode.connect(masterBus);

      se.masterGain = sfxGain;
      scheduledTime = ev.t;
      try {
        se[ev.method]();
      } catch (_) {}
    }

    // Schedule continuous One Ring ominous drone spans (exact match to fx_audio.js _syncRingHum)
    const spans = window.__ringHumSpans || [];
    for (const sp of spans) {
      const t0 = Math.max(0, sp.start);
      const t1 = Math.min(durationSec - 0.05, sp.end);
      if (t1 <= t0 + 0.05) continue;

      const droneGain = off.createGain();
      droneGain.gain.setValueAtTime(0.0002, t0);
      droneGain.gain.linearRampToValueAtTime(0.20, Math.min(t1, t0 + 0.35));
      droneGain.gain.setValueAtTime(0.20, t1);
      droneGain.gain.exponentialRampToValueAtTime(0.0001, Math.min(durationSec, t1 + 0.38));
      droneGain.connect(masterBus);

      const oscSub = off.createOscillator();
      oscSub.type = 'sine';
      oscSub.frequency.setValueAtTime(55.0, t0);

      const oscSaw = off.createOscillator();
      oscSaw.type = 'sawtooth';
      oscSaw.frequency.setValueAtTime(55.55, t0);

      const oscFifth = off.createOscillator();
      oscFifth.type = 'triangle';
      oscFifth.frequency.setValueAtTime(82.1, t0);

      const lowFilter = off.createBiquadFilter();
      lowFilter.type = 'lowpass';
      lowFilter.frequency.setValueAtTime(195, t0);
      lowFilter.Q.setValueAtTime(2.4, t0);

      oscSub.connect(lowFilter);
      oscSaw.connect(lowFilter);
      oscFifth.connect(lowFilter);
      lowFilter.connect(droneGain);

      if (se.pinkNoiseBuffer) {
        const whisper = off.createBufferSource();
        whisper.buffer = se.pinkNoiseBuffer;
        whisper.loop = true;

        const bp = off.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(640, t0);
        bp.Q.setValueAtTime(6.0, t0);

        const lfo = off.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.62, t0);
        const lfoGain = off.createGain();
        lfoGain.gain.setValueAtTime(250, t0);
        lfo.connect(lfoGain);
        lfoGain.connect(bp.frequency);

        const wGain = off.createGain();
        wGain.gain.setValueAtTime(0.45, t0);
        whisper.connect(bp);
        bp.connect(wGain);
        wGain.connect(droneGain);

        whisper.start(t0);
        whisper.stop(Math.min(durationSec, t1 + 0.42));
        lfo.start(t0);
        lfo.stop(Math.min(durationSec, t1 + 0.42));
      }

      oscSub.start(t0);
      oscSaw.start(t0);
      oscFifth.start(t0);
      const stopAt = Math.min(durationSec, t1 + 0.42);
      oscSub.stop(stopAt);
      oscSaw.stop(stopAt);
      oscFifth.stop(stopAt);
    }

    // --- Subtle Atmospheric Middle-earth Underscore (Low Strings/Brass Drone + Rain + Siege Drums) ---
    // 1. Warm D-minor / Fifth orchestral cello & horn pad across the demo
    const padNotes = [
      { f: 73.42, pan: -0.25, type: 'sawtooth', vol: 0.055 }, // D2
      { f: 110.00, pan: 0.25, type: 'triangle', vol: 0.048 }, // A2
      { f: 146.83, pan: -0.12, type: 'sawtooth', vol: 0.040 }, // D3
      { f: 220.00, pan: 0.15, type: 'sine', vol: 0.025 }      // A3
    ];
    for (const n of padNotes) {
      const osc = off.createOscillator();
      osc.type = n.type;
      osc.frequency.setValueAtTime(n.f, 0);

      const flt = off.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(340, 0);

      const g = off.createGain();
      g.gain.setValueAtTime(n.vol, 0);

      const p = off.createStereoPanner();
      p.pan.setValueAtTime(n.pan, 0);

      osc.connect(flt);
      flt.connect(g);
      g.connect(p);
      p.connect(masterBus);
      osc.start(0);
      osc.stop(durationSec);
    }

    // 2. Hornburg Driving Rain ambience during Act 2
    if (se.pinkNoiseBuffer && markers.act2Start !== undefined && markers.act3Start !== undefined) {
      const r0 = Math.max(0, markers.act2Start);
      const r1 = Math.min(durationSec, markers.act3Start);
      if (r1 > r0 + 0.5) {
        const rain = off.createBufferSource();
        rain.buffer = se.pinkNoiseBuffer;
        rain.loop = true;
        const bp = off.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1350, r0);
        bp.Q.setValueAtTime(0.9, r0);
        const rg = off.createGain();
        rg.gain.setValueAtTime(0.0001, r0);
        rg.gain.linearRampToValueAtTime(0.042, r0 + 0.5);
        rg.gain.setValueAtTime(0.042, Math.max(r0 + 0.5, r1 - 0.4));
        rg.gain.linearRampToValueAtTime(0.0001, r1);
        rain.connect(bp);
        bp.connect(rg);
        rg.connect(masterBus);
        rain.start(r0);
        rain.stop(r1 + 0.05);
      }
    }

    // 3. Deep Middle-earth Siege War-Drums (subtle rhythmic heartbeat during combat acts)
    const scheduleWarDrum = (t, accent = 1.0, pan = 0) => {
      if (t < 0 || t >= durationSec - 0.35) return;
      const osc = off.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(86 * (accent > 1.05 ? 1.04 : 1.0), t);
      osc.frequency.exponentialRampToValueAtTime(34, t + 0.28);

      const g = off.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.11 * accent, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);

      const p = off.createStereoPanner();
      p.pan.setValueAtTime(pan, t);

      osc.connect(g);
      g.connect(p);
      p.connect(masterBus);
      osc.start(t);
      osc.stop(t + 0.34);
    };

    const act2 = markers.act2Start || 5.0;
    const act4 = markers.act4Start || 30.5;
    const act5 = markers.act5Start || 34.8;
    const vic = markers.victoryAt || (durationSec - 2.5);

    // Measured siege cadence during Acts 2 & 3
    for (let t = act2 + 0.4, beat = 0; t < act4 - 0.3; t += 1.25, beat++) {
      scheduleWarDrum(t, beat % 2 === 0 ? 1.0 : 0.72, beat % 2 === 0 ? -0.18 : 0.18);
    }
    // Faster Mordor war-drum cadence during Act 5 Black Gate finale
    for (let t = act5 + 0.2, beat = 0; t < vic - 0.2; t += 0.85, beat++) {
      scheduleWarDrum(t, beat % 2 === 0 ? 1.22 : 0.85, beat % 2 === 0 ? -0.22 : 0.22);
      if (beat % 4 === 3 && t + 0.42 < vic - 0.2) {
        scheduleWarDrum(t + 0.42, 0.65, 0.0);
      }
    }

    const rendered = await off.startRendering();
    const ch0 = rendered.getChannelData(0);
    const ch1 = rendered.getChannelData(1);

    // Pack stereo Float32 into base64 Int16 right inside browser so CDP transfer is fast (~4.5 MB -> ~6 MB b64)
    const len = ch0.length;
    const pcm = new Int16Array(len * 2);
    let peak = 0;
    let sumSq = 0;
    for (let i = 0; i < len; i++) {
      const l = Math.max(-1, Math.min(1, ch0[i]));
      const r = Math.max(-1, Math.min(1, ch1[i]));
      const al = Math.abs(l);
      const ar = Math.abs(r);
      if (al > peak) peak = al;
      if (ar > peak) peak = ar;
      sumSq += 0.5 * (l * l + r * r);
      pcm[i * 2] = l < 0 ? Math.round(l * 32768) : Math.round(l * 32767);
      pcm[i * 2 + 1] = r < 0 ? Math.round(r * 32768) : Math.round(r * 32767);
    }

    const bytes = new Uint8Array(pcm.buffer);
    let binary = '';
    const chunk = 32768;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(bytes.length, i + chunk)));
    }
    return {
      pcmBase64: btoa(binary),
      numFrames: len,
      peak,
      rms: Math.sqrt(sumSq / Math.max(1, len)),
      eventCount: events.length,
      ringSpans: spans.length
    };
  }, { durationSec: totalDurationSec, sr: sampleRate, markers: actMarkers });

  // Build WAV file from returned Int16 stereo PCM
  const pcmBuf = Buffer.from(audioResult.pcmBase64, 'base64');
  const header = Buffer.allocUnsafe(44);
  const blockAlign = 4;
  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(36 + pcmBuf.length, 4);
  header.write('WAVE', 8, 4, 'ascii');
  header.write('fmt ', 12, 4, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 4, 'ascii');
  header.writeUInt32LE(pcmBuf.length, 40);

  return {
    wavBuffer: Buffer.concat([header, pcmBuf]),
    numFrames: audioResult.numFrames,
    peak: audioResult.peak,
    rms: audioResult.rms,
    eventCount: audioResult.eventCount,
    ringSpans: audioResult.ringSpans
  };
}

async function main() {
  const indexStatBefore = fs.statSync(INDEX_HTML);
  console.log(`Target: ${INDEX_HTML} (${(indexStatBefore.size / 1024).toFixed(1)} KB)`);
  console.log(`Mode: ${DRY_RUN_DIR ? `DRY-RUN -> ${DRY_RUN_DIR}` : `FULL 1080p@${FPS}fps -> ${OUTPUT_MP4}`}`);

  if (DRY_RUN_DIR) {
    fs.mkdirSync(DRY_RUN_DIR, { recursive: true });
  }

  const tmpVideoPath = path.join(os.tmpdir(), `td-demo-video-${process.pid}.mp4`);
  const tmpWavPath = path.join(os.tmpdir(), `td-demo-audio-${process.pid}.wav`);

  let ffmpegProc = null;
  let ffmpegExitPromise = null;

  if (!DRY_RUN_DIR) {
    ffmpegProc = spawn(
      'ffmpeg',
      [
        '-y',
        '-f', 'image2pipe',
        '-vcodec', 'mjpeg',
        '-framerate', String(FPS),
        '-i', '-',
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '18',
        '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p',
        '-color_range', 'tv',
        '-pix_fmt', 'yuv420p',
        '-fps_mode', 'cfr',
        '-r', String(FPS),
        tmpVideoPath,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] }
    );

    let ffErr = '';
    ffmpegProc.stderr.on('data', (c) => {
      ffErr = (ffErr + c.toString()).slice(-4000);
    });
    ffmpegExitPromise = new Promise((resolve, reject) => {
      ffmpegProc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg video encode failed (code ${code}):\n${ffErr}`));
      });
    });
  }

  const browser = await launchRecorderBrowser();
  const actMarkers = {};
  let capturedFrames = 0;
  let cursorX = 960;
  let cursorY = 230;
  const startWallMs = Date.now();

  try {
    await browser.send('Page.navigate', { url: `file://${INDEX_HTML}` });
    // Wait for window.game boot
    for (let i = 0; i < 40; i++) {
      const ready = await browser.evaluate(() => !!(window.game && window.game._initialized));
      if (ready) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    // Benchmark 10 frames before recording (as required)
    const benchStart = Date.now();
    for (let b = 0; b < 10; b++) {
      await browser.send('Page.captureScreenshot', { format: 'jpeg', quality: 93 });
    }
    const benchMs = Date.now() - benchStart;
    console.log(`10-frame 1920x1080 JPEG benchmark: ${benchMs}ms (${(benchMs / 10).toFixed(1)}ms/frame)`);

    // Enable deterministic manual frame stepping & install audio hooks
    await browser.evaluate(() => {
      window.__simControl.setManual(true);
      window.game.fitStage();
      window.game.render();
      window.__demoCursor.setPos(960, 230, false);
    });
    await installAudioRecorderHooks(browser);

    // --- Core Frame Stepper & Capture Primitives ---
    const writeFrameIfRecording = async () => {
      capturedFrames++;
      if (!DRY_RUN_DIR) {
        const shot = await browser.send('Page.captureScreenshot', {
          format: 'jpeg',
          quality: 93,
        });
        const buf = Buffer.from(shot.data, 'base64');
        if (!ffmpegProc.stdin.write(buf)) {
          await once(ffmpegProc.stdin, 'drain');
        }
        if (capturedFrames % 300 === 0) {
          const elapsed = ((Date.now() - startWallMs) / 1000).toFixed(1);
          console.log(`  Captured ${capturedFrames} frames (${(capturedFrames / FPS).toFixed(1)}s video, ${elapsed}s elapsed)...`);
        }
      }
    };

    const saveDryRunPng = async (name) => {
      if (!DRY_RUN_DIR) return;
      const shot = await browser.send('Page.captureScreenshot', { format: 'png' });
      const outPath = path.join(DRY_RUN_DIR, name);
      fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
      console.log(`  [dry-run shot] ${name} @ ${(capturedFrames / FPS).toFixed(2)}s`);
    };

    const hold = async (seconds) => {
      const n = Math.max(1, Math.round(seconds * FPS));
      for (let i = 0; i < n; i++) {
        await browser.evaluate((dt) => window.__simControl.stepFrames(1, dt), DT_MS);
        await writeFrameIfRecording();
      }
    };

    const moveTo = async (tx, ty, durationSec = 0.28) => {
      const steps = Math.max(2, Math.round(durationSec * FPS));
      const sx = cursorX;
      const sy = cursorY;
      for (let i = 1; i <= steps; i++) {
        const p = easeInOutCubic(i / steps);
        const nx = sx + (tx - sx) * p;
        const ny = sy + (ty - sy) * p;
        cursorX = nx;
        cursorY = ny;
        await browser.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: Math.round(nx),
          y: Math.round(ny),
          button: 'none',
        });
        await browser.evaluate(({ x, y, dt }) => {
          window.__demoCursor.setPos(x, y, false);
          window.__simControl.stepFrames(1, dt);
        }, { x: nx, y: ny, dt: DT_MS });
        await writeFrameIfRecording();
      }
    };

    const logicalToViewport = async (lx, ly) => {
      return browser.evaluate(({ x, y }) => {
        const c = document.getElementById('game-canvas');
        const r = c.getBoundingClientRect();
        return {
          x: r.left + (x / 1280) * r.width,
          y: r.top + (y / 720) * r.height,
        };
      }, { x: lx, y: ly });
    };

    const getElementCenter = async (selector) => {
      const pt = await browser.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return null;
        return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 };
      }, selector);
      if (!pt) throw new Error(`Element not found or hidden for selector: ${selector}`);
      return pt;
    };

    const moveToElement = async (selector, durationSec = 0.28) => {
      const pt = await getElementCenter(selector);
      await moveTo(pt.x, pt.y, durationSec);
      return pt;
    };

    const moveToLogical = async (lx, ly, durationSec = 0.28) => {
      const pt = await logicalToViewport(lx, ly);
      await moveTo(pt.x, pt.y, durationSec);
      return pt;
    };

    const clickHere = async (holdAfterSec = 0.08, clickCount = 1) => {
      const rx = Math.round(cursorX);
      const ry = Math.round(cursorY);
      await browser.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: rx,
        y: ry,
        button: 'left',
        buttons: 1,
        clickCount,
      });
      await browser.evaluate(({ x, y, dt }) => {
        window.__demoCursor.ripple(x, y);
        window.__demoCursor.setPos(x, y, true);
        window.__simControl.stepFrames(1, dt);
      }, { x: cursorX, y: cursorY, dt: DT_MS });
      await writeFrameIfRecording();

      await browser.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: rx,
        y: ry,
        button: 'left',
        buttons: 0,
        clickCount,
      });
      await browser.evaluate(({ x, y, dt }) => {
        window.__demoCursor.setPos(x, y, false);
        window.__simControl.stepFrames(1, dt);
      }, { x: cursorX, y: cursorY, dt: DT_MS });
      await writeFrameIfRecording();

      if (holdAfterSec > 0) {
        await hold(holdAfterSec);
      }
    };

    const getVideoSec = () => capturedFrames / FPS;

    // =========================================================================
    // ACT 1 (~5.5s): TITLE SCREEN — Map Cards, Difficulty Cards & BEGIN SIEGE
    // =========================================================================
    console.log('Act 1: Title Screen...');
    actMarkers.act1Start = getVideoSec();

    await hold(0.75);
    await saveDryRunPng('01_title_screen.png');

    // Smoothly hover across all 3 procedural Map Cards
    await moveToElement('[data-map-id="hornburg"]', 0.32);
    await hold(0.28);
    await moveToElement('[data-map-id="pelennor"]', 0.36);
    await clickHere(0.26);
    await moveToElement('[data-map-id="blackgate"]', 0.36);
    await clickHere(0.26);

    // Smoothly hover across Difficulty Cards & select Captain
    await moveToElement('[data-difficulty="steward"]', 0.32);
    await hold(0.18);
    await moveToElement('[data-difficulty="ranger"]', 0.35);
    await hold(0.18);
    await moveToElement('[data-difficulty="captain"]', 0.32);
    await clickHere(0.20);

    // Select Hornburg Causeway & click BEGIN SIEGE
    await moveToElement('[data-map-id="hornburg"]', 0.34);
    await clickHere(0.22);
    await moveToElement('#btn-begin-siege', 0.34);
    await clickHere(0.20);

    // =========================================================================
    // ACT 2 (~12.2s): THE HORNBURG CAUSEWAY — Rain, Build Range/Deadzone,
    // All 4 Archetypes, Rally Point, Early Wave Horn, T2/T3 Upgrades & Priority
    // =========================================================================
    console.log('Act 2: The Hornburg Causeway...');
    actMarkers.act2Start = getVideoSec();

    // Provide strong war-chest so all 4 archetypes + T2/T3 branching upgrades are bright & affordable
    await browser.evaluate(() => {
      window.game.gold = 1850;
      window.game._notifyUI();
    });

    // 1. Select central Pad 3 (342, 335) & hover Dwarven Siege Foundry to showcase Green Range + Min 75 Deadzone
    await moveToLogical(342, 335, 0.30);
    await clickHere(0.10);
    await moveToElement('[data-tower-type="dwarven"]', 0.30);
    await hold(0.75); // Hold so green build range + orange dashed Min 75 deadzone ring are unmistakable!
    await saveDryRunPng('02_hornburg_dwarven_deadzone.png');
    await clickHere(0.10); // Builds Dwarven Siege Foundry on Pad 3

    // 2. Build Garrison of Men on front Pad 1 (185, 308) & set custom Rally Point on the causeway road
    await moveToLogical(185, 308, 0.26);
    await clickHere(0.08);
    await moveToElement('[data-tower-type="garrison"]', 0.25);
    await clickHere(0.10);
    await moveToElement('#btn-rally-point', 0.24);
    await clickHere(0.08);
    await moveToLogical(258, 285, 0.28); // Shows green rally circle + banner reticle
    await hold(0.25);
    await clickHere(0.10);

    // 3. Build Elven Watchtower on Pad 4 (350, 472)
    await moveToLogical(350, 472, 0.25);
    await clickHere(0.08);
    await moveToElement('[data-tower-type="elven"]', 0.24);
    await clickHere(0.08);

    // 4. Build Istari Spire on Pad 5 (465, 468)
    await moveToLogical(465, 468, 0.24);
    await clickHere(0.08);
    await moveToElement('[data-tower-type="istari"]', 0.24);
    await clickHere(0.08);

    // Close inspector briefly & click pulsing Early Wave Call War Horn marker!
    await moveToElement('.early-wave-marker', 0.32);
    await hold(0.22);
    await clickHere(0.12);

    // Reinforce Wave 1 with an immediate rainy vanguard of tight Goblin packs, Orcs, and leaping Warg Riders
    await browser.evaluate(() => {
      const g = window.game;
      const em = g.enemies;
      // Tight Goblin pack entering the first bend
      for (let i = 0; i < 14; i++) {
        em.spawnEnemy('goblin', 0, g, 1.35, 1.0, 95 + i * 13);
      }
      // Armored Orc Infantry
      for (let i = 0; i < 6; i++) {
        em.spawnEnemy('orc', 0, g, 1.45, 1.0, 125 + i * 26);
      }
      // Swift Warg Riders right behind front line so they clash & LEAP over Garrison blockers!
      for (let i = 0; i < 5; i++) {
        em.spawnEnemy('warg', 0, g, 1.45, 1.0, 145 + i * 34);
      }
      g.spatialGrid.rebuild(em.active);
    });

    await hold(0.75); // Watch Warg Riders leap & Goblins clash in the rain!

    // Upgrade Elven Watchtower (Pad 4: 350, 472) -> T2 -> Galadhrim Longbows (A) + Cycle Target Priority
    await moveToLogical(350, 472, 0.25);
    await clickHere(0.08);
    await moveToElement('#btn-upgrade-t2', 0.24);
    await clickHere(0.08);
    await moveToElement('#btn-upgrade-branch-a', 0.22);
    await clickHere(0.10); // Galadhrim Longbows!
    await moveToElement('#btn-target-priority', 0.22);
    await clickHere(0.10); // Last
    await clickHere(0.12); // Strongest

    // Upgrade Dwarven Siege Foundry (Pad 3: 342, 335) -> T2 -> Khazad Ballista (B) piercing & shredding armor!
    await moveToLogical(342, 335, 0.26);
    await clickHere(0.08);
    await moveToElement('#btn-upgrade-t2', 0.24);
    await clickHere(0.08);
    await moveToElement('#btn-upgrade-branch-b', 0.24);
    await clickHere(0.10); // Khazad Ballista!
    await moveToElement('#btn-trigger-skill', 0.22);
    await clickHere(0.10); // Mithril Skewer!

    // Upgrade Istari Spire (Pad 5: 465, 468) -> T2 -> Stormcaller Council (B) chain lightning!
    await moveToLogical(465, 468, 0.26);
    await clickHere(0.08);
    await moveToElement('#btn-upgrade-t2', 0.24);
    await clickHere(0.08);
    await moveToElement('#btn-upgrade-branch-b', 0.24);
    await clickHere(0.10); // Stormcaller Council!
    await moveToElement('#btn-trigger-skill', 0.22);
    await clickHere(0.10); // Tempest of Manwë!

    // Close sidebar & showcase full-screen rainy Helm's Deep battle
    await moveToLogical(615, 415, 0.22);
    await clickHere(0.06);
    await hold(2.15);
    await saveDryRunPng('03_hornburg_rain_battle.png');

    // =========================================================================
    // ACT 3 (~13.8s): PELENNOR CROSSROADS — Converging Lanes, T2->T3 Range
    // Preview, Light of Eärendil, Great Eagles Strike & Ring 100% Overload!
    // =========================================================================
    console.log('Act 3: Pelennor Crossroads...');
    actMarkers.act3Start = getVideoSec();

    await browser.evaluate(() => {
      const g = window.game;
      g.startSiege('pelennor', 'captain');
      if (g.ui && g.ui._els && g.ui._els.heraldToast) {
        g.ui._toastTimer = 0;
        g.ui._els.heraldToast.classList.add('is-hidden');
      }
      g.gold = 9999;
      g.lives = 20;
      g.wave = 10;
      g.enemies.currentWave = 10;
      g.enemies.waveInProgress = true;
      g.enemies.waveElapsed = 0;
      g.screenFlash = { color: 'rgba(240, 210, 122, 0.22)', timer: 0.22, duration: 0.22 };

      const buildFull = (padId, type, tier, branch, rallyPt) => {
        const pad = g.map.pads[padId];
        const t = g.towers.buildTower(pad, type, g);
        if (tier >= 2 && t.upgradeTier2) t.upgradeTier2(g);
        if (tier >= 3 && branch && t.upgradeBranch) t.upgradeBranch(branch, g);
        if (rallyPt && t.setRallyPoint) t.setRallyPoint(rallyPt.x, rallyPt.y, g.map);
        return t;
      };

      // Front lane-0 towers positioned within 165px of Ringwraith spawn so Black Breath stuns them!
      buildFull(0, 'elven', 2, null);                       // (165, 105)
      buildFull(1, 'garrison', 2, null, { x: 205, y: 180 }); // (195, 250)

      // Signature Pelennor defenders:
      const mortar = buildFull(4, 'dwarven', 3, 'A');        // (395, 222) Iron Hills Mortar (burning oil!)
      buildFull(5, 'garrison', 3, 'A', { x: 345, y: 295 });  // (405, 360) Tower Guard Phalanx!
      buildFull(6, 'elven', 2, null);                        // (395, 498) Tier 2 Sentinel (for T3 range preview!)
      buildFull(7, 'istari', 3, 'B');                        // (645, 212) Stormcaller Council
      buildFull(8, 'garrison', 3, 'B', { x: 790, y: 365 });  // (690, 360) Knights of the Riddermark!
      buildFull(9, 'elven', 3, 'B');                         // (645, 502) Mirkwood Wardens

      g.gold = 1450;
      g.clearSelection();

      // Spawn rich Wave 10-11 mid-siege army across both converging lanes
      const em = g.enemies;
      // Upper lane (lane 0): Olog-hai Siege Trolls, Uruk-hai Berserkers, Orcs
      em.spawnEnemy('troll', 0, g, 1.45, 1.0, 290);
      em.spawnEnemy('troll', 0, g, 1.45, 1.0, 470);
      for (let i = 0; i < 5; i++) {
        const u = em.spawnEnemy('uruk', 0, g, 1.35, 1.0, 230 + i * 52);
        if (i < 3) u.hp = u.maxHp * 0.44; // Poised to drop <40% and trigger Blood Rage!
      }
      // Lower lane (lane 1): Veiled Shadow Wraiths + Uruk-hai + Warg Riders
      for (let i = 0; i < 7; i++) {
        em.spawnEnemy('wraith', 1, g, 1.45, 1.0, 200 + i * 44);
      }
      for (let i = 0; i < 4; i++) {
        const u = em.spawnEnemy('uruk', 1, g, 1.35, 1.0, 260 + i * 58);
        u.hp = u.maxHp * 0.43;
      }
      // Aerial lanes: Flying Fell Beasts with ground drop-shadows!
      for (let i = 0; i < 3; i++) {
        em.spawnEnemy('fellbeast', 0, g, 1.55, 1.0, 150 + i * 115);
        em.spawnEnemy('fellbeast', 1, g, 1.55, 1.0, 190 + i * 120);
      }
      // Ongoing reinforcement stream so Wave 10 stays actively in-battle throughout Ring overload!
      em.spawnQueue.push(
        { spawnAt: 5.0, type: 'uruk', laneIndex: 0, hpMult: 1.4, speedMult: 1.0 },
        { spawnAt: 6.2, type: 'wraith', laneIndex: 1, hpMult: 1.4, speedMult: 1.0 },
        { spawnAt: 7.5, type: 'troll', laneIndex: 1, hpMult: 1.4, speedMult: 1.0 },
        { spawnAt: 8.8, type: 'fellbeast', laneIndex: 0, hpMult: 1.4, speedMult: 1.0 },
        { spawnAt: 10.5, type: 'warg', laneIndex: 1, hpMult: 1.4, speedMult: 1.0 },
        { spawnAt: 16.0, type: 'orc', laneIndex: 0, hpMult: 1.4, speedMult: 1.0 }
      );

      // Reset SoundEngine play timestamps after setup builds & warm up 0.55s so oil patches & melee are active!
      g.sound.muted = true;
      g.advanceTime(0.55);
      g.sound.muted = false;
      if (mortar && mortar.triggerSkill) {
        mortar.skillCd = 0;
        mortar.triggerSkill(g); // Launches Dragonfire Barrage burning oil across road!
      }
      g._notifyUI();
      g.render();
    });

    await hold(0.55);

    // 1. Hover Tier 2 tower's Tier 3 branch card to show solid blue current + dashed yellow upgraded range circles
    await moveToLogical(395, 498, 0.28); // Tier 2 Lothlórien Sentinel on Pad 6
    await clickHere(0.10);
    await moveToElement('#btn-upgrade-branch-a', 0.30);
    await hold(0.95); // Hold clearly on solid blue + dashed yellow range circles!
    await saveDryRunPng('04_pelennor_t3_range_preview.png');
    await clickHere(0.10); // Upgrade to Galadhrim Longbows
    // Close inspector so battlefield is wide open for Spells & Ring
    await moveToLogical(540, 360, 0.22);
    await clickHere(0.06);

    // 2. Cast Light of Eärendil on veiled Shadow Wraiths & Uruk-hai on lower lane
    await moveToElement('#btn-spell-light', 0.30);
    await clickHere(0.08);
    const lightTarget = await browser.evaluate(() => {
      const wraiths = window.game.enemies.active.filter((e) => !e.dead && e.type === 'wraith');
      if (wraiths.length > 0) {
        const mid = wraiths[Math.floor(wraiths.length / 2)];
        return { x: mid.x, y: mid.y };
      }
      return { x: 430, y: 445 };
    });
    await moveToLogical(lightTarget.x, lightTarget.y, 0.32);
    await hold(0.42); // Show rotating Star of Eärendil cyan reticle
    await clickHere(0.10); // Cast Light of Eärendil!
    await hold(1.05);
    await saveDryRunPng('05_pelennor_light_of_earendil.png');

    // 3. Cast Great Eagles Strike sweeping down upper/converging lane
    await moveToElement('#btn-spell-eagles', 0.30);
    await clickHere(0.08);
    const eagleTarget = await browser.evaluate(() => {
      const foes = window.game.enemies.active.filter((e) => !e.dead && (e.type === 'troll' || e.type === 'fellbeast' || e.type === 'uruk'));
      if (foes.length > 0) {
        const pick = foes[0];
        return { x: Math.max(320, Math.min(820, pick.x)), y: Math.max(160, Math.min(540, pick.y)) };
      }
      return { x: 515, y: 245 };
    });
    await moveToLogical(eagleTarget.x, eagleTarget.y, 0.32);
    await hold(0.42); // Show golden lane corridor + eagle chevrons
    await clickHere(0.10); // Cast Great Eagles Strike!
    await hold(1.15);
    await saveDryRunPng('06_pelennor_great_eagles.png');

    // 4. Toggle THE RING OF POWER ON -> Surge Corruption to 100% -> Ringwraith Boss & Black Breath!
    await moveToElement('#btn-ring', 0.32);
    await browser.evaluate(() => {
      // Start corruption at 76% so ~3.0s of natural +8%/sec Ring frenzy hits 100% overload on camera!
      window.game.corruption = 76;
      window.game._notifyUI();
    });
    await clickHere(0.12); // Toggle THE RING ON!

    // Glide cursor toward front crossroads while Ring glows, towers attack +40% faster, and corruption surges
    await moveToLogical(310, 220, 0.45);
    await hold(1.35);
    await saveDryRunPng('07_pelennor_ring_frenzy.png');

    // Step until Ringwraith Boss erupts at 100% Corruption!
    for (let waitStep = 0; waitStep < Math.round(2.5 * FPS); waitStep++) {
      const overloaded = await browser.evaluate((dt) => {
        window.__simControl.stepFrames(1, dt);
        return window.game.enemies.active.some((e) => e.type === 'ringwraith' && !e.dead);
      }, DT_MS);
      await writeFrameIfRecording();
      if (overloaded) break;
    }

    // Hold ~2.25s so viewer witnesses Ringwraith Boss marching, Black Breath 4s tower-stun shockwave & Boss bar!
    await hold(2.25);
    await saveDryRunPng('08_pelennor_ringwraith_black_breath.png');

    // =========================================================================
    // ACT 4 (~4.3s): LORE & BESTIARY CODEX — Towers Tab & 9-Portrait Bestiary
    // =========================================================================
    console.log('Act 4: Lore & Bestiary Codex...');
    actMarkers.act4Start = getVideoSec();

    await moveToElement('#btn-codex', 0.34);
    await clickHere(0.12);
    await hold(1.25); // Towers & Upgrades tab

    await moveToElement('[data-codex-tab="bestiary"]', 0.32);
    await clickHere(0.12);
    await hold(1.45); // All 9 enemy portraits & armor/magic stats
    await saveDryRunPng('09_codex_bestiary.png');

    await moveToElement('#btn-codex-done', 0.32);
    await clickHere(0.22);

    // =========================================================================
    // ACT 5 (~15.2s): THE BLACK GATE — Wave 15 Witch-lord -> Balrog Phase II,
    // Rapid 3x Click Dark Spell Lock Shatter & 3-Star Victory Modal!
    // =========================================================================
    console.log('Act 5: The Black Gate Finale...');
    actMarkers.act5Start = getVideoSec();

    await browser.evaluate(() => {
      const g = window.game;
      g.startSiege('blackgate', 'captain');
      if (g.ui && g.ui._els && g.ui._els.heraldToast) {
        g.ui._toastTimer = 0;
        g.ui._els.heraldToast.classList.add('is-hidden');
      }
      g.gold = 15000;
      g.lives = 20;
      g.maxLives = 20;
      g.wave = 15;
      g.stats.kills = 248;
      g.stats.goldEarned = 3420;
      g.enemies.currentWave = 15;
      g.enemies.waveInProgress = true;
      g.enemies.spawnQueue.length = 0;
      g.screenFlash = { color: 'rgba(255, 111, 0, 0.22)', timer: 0.24, duration: 0.24 };

      const buildT3 = (padId, type, branch, rallyPt) => {
        const pad = g.map.pads[padId];
        const t = g.towers.buildTower(pad, type, g);
        t.upgradeTier2(g);
        t.upgradeBranch(branch, g);
        if (rallyPt && t.setRallyPoint) t.setRallyPoint(rallyPt.x, rallyPt.y, g.map);
        return t;
      };

      // Elite Tier 3 defense line over Mordor lava fissures & embers:
      buildT3(4, 'istari', 'A');                         // (418, 222) Flame of Anor (ramping fiery beam!)
      buildT3(6, 'istari', 'A');                         // (605, 360) Flame of Anor (twin ramping beam!)
      buildT3(7, 'elven', 'A');                          // (675, 180) Galadhrim Longbows
      buildT3(8, 'istari', 'B');                         // (745, 360) Stormcaller Council
      buildT3(5, 'istari', 'B');                         // (418, 498) Stormcaller Council
      buildT3(1, 'garrison', 'B', { x: 255, y: 215 });   // (195, 290) Knights of the Riddermark
      buildT3(10, 'garrison', 'B', { x: 775, y: 255 });  // (915, 248) Knights of the Riddermark
      buildT3(11, 'dwarven', 'B');                       // (915, 472) Khazad Ballista
      buildT3(9, 'elven', 'A');                          // (675, 540) Galadhrim Longbows

      g.gold = 680;
      g.clearSelection();

      // Spawn Wave 15 Witch-lord Boss + dramatic Mordor escort
      const em = g.enemies;
      const boss = em.spawnEnemy('balrog', 0, g, 1.0, 1.0, 235);
      // Start Witch-lord at 74% HP so viewers watch ~2.8s of Phase I before the dramatic <50% Phase II Balrog eruption!
      boss.hp = Math.round(boss.maxHp * 0.74);
      boss.curseCooldown = 99; // Hold curse until right after Phase II Balrog transformation!

      // Escort troops on upper & lower volcanic tracks (moderate HP so all clear cleanly with 20/20 lives!)
      for (let i = 0; i < 12; i++) {
        em.spawnEnemy('goblin', i % 2, g, 0.85, 1.0, 130 + i * 26);
      }
      for (let i = 0; i < 5; i++) {
        em.spawnEnemy('uruk', 1, g, 0.75, 1.0, 190 + i * 52);
      }
      for (let i = 0; i < 4; i++) {
        em.spawnEnemy('wraith', i % 2, g, 0.80, 1.0, 280 + i * 48);
      }
      for (let i = 0; i < 3; i++) {
        em.spawnEnemy('fellbeast', i % 2, g, 0.75, 1.0, 200 + i * 95);
      }

      // Warm up 0.35s silently so Flame of Anor beams lock onto the Witch-lord immediately!
      g.sound.muted = true;
      g.advanceTime(0.35);
      g.sound.muted = false;
      g.sound.playBossRoar();
      g._notifyUI();
      g.render();
    });

    // Move cursor to frame the Witch-lord of Morgul battle cleanly
    await moveToLogical(500, 285, 0.32);

    // 1. Battle Witch-lord of Morgul until Phase II transformation into Balrog of Udûn!
    for (let f = 0; f < Math.round(5.0 * FPS); f++) {
      const st = await browser.evaluate((dt) => {
        const g = window.game;
        const boss = g.enemies.active.find((e) => e.type === 'balrog' && !e.dead);
        // Ensure Phase I drops steadily into Phase II around ~2.8s
        if (boss && boss.phase === 1 && g.simTime > 2.6 && boss.hp > boss.maxHp * 0.505) {
          boss.takeDamage(boss.maxHp * 0.011, 'magic', { isFire: true }, g);
        }
        window.__simControl.stepFrames(1, dt);
        return {
          phase: boss ? boss.phase : 0,
          transformTimer: boss ? boss.transformTimer : 0,
        };
      }, DT_MS);
      await writeFrameIfRecording();
      if (st.phase === 2) break;
    }

    // Hold 1.25s to admire the dramatic BALROG OF UDÛN — PHASE II eruption & Boss Banner!
    await hold(1.25);
    await saveDryRunPng('10_blackgate_balrog_phase2.png');

    // 2. Trigger Balrog's Dark Spell Lock (CURSED! CLICK x3!) on nearest tower & shatter with 3x clicks!
    const cursedPos = await browser.evaluate(() => {
      const g = window.game;
      const boss = g.enemies.active.find((e) => e.type === 'balrog' && !e.dead);
      if (!boss) return null;
      boss.transformTimer = 0;
      boss.tryCastBossCurse(g);
      if (boss.cursedTower) {
        // Give 6s stun window so tether & CLICK x3! badge stay crisp while cursor glides over
        boss.cursedTower.stunTimer = 6.0;
        boss.cursedTower.curseClicksRemaining = 3;
        boss.curseCooldown = 99;
        g._notifyUI();
        g.render();
        return { x: boss.cursedTower.x, y: boss.cursedTower.y };
      }
      return null;
    });

    if (cursedPos) {
      await hold(0.55); // Show fiery orange spell-lock tether + CURSED! CLICK x3!
      await saveDryRunPng('11_blackgate_dark_spell_lock.png');
      await moveToLogical(cursedPos.x, cursedPos.y, 0.30);
      // Rapidly click 3x to shatter the curse!
      await clickHere(0.12, 1);
      await clickHere(0.12, 2);
      await clickHere(0.22, 3);
    }

    // 3. Vanquish the Balrog of Udûn & clear Wave 15 with 20/20 lives for 3-Star Victory!
    // Also fire Light of Eärendil on the Balrog for epic visual climax!
    const balrogNow = await browser.evaluate(() => {
      const b = window.game.enemies.active.find((e) => e.type === 'balrog' && !e.dead);
      return b ? { x: b.x, y: b.y } : null;
    });
    if (balrogNow) {
      await moveToElement('#btn-spell-light', 0.28);
      await clickHere(0.06);
      await moveToLogical(balrogNow.x, balrogNow.y, 0.28);
      await clickHere(0.08);
    }

    // Focus fire down the Balrog & any stragglers smoothly over ~3.2s until natural Victory triggers!
    for (let f = 0; f < Math.round(5.0 * FPS); f++) {
      const stateNow = await browser.evaluate(({ dt, stepIdx, maxSteps }) => {
        const g = window.game;
        g.lives = 20; // Guarantee pristine 20/20 3-Star Citadel!
        const active = g.enemies.active;
        if (stepIdx > maxSteps * 0.28) {
          for (let i = active.length - 1; i >= 0; i--) {
            const e = active[i];
            if (!e || e.dead) continue;
            if (e.type !== 'balrog') {
              e.takeDamage(e.maxHp * 0.045, 'magic', { isFire: true }, g);
            } else {
              // Steady heroic DPS ramp so Balrog falls dramatically around ~3.1s!
              e.takeDamage(e.maxHp * 0.0095, 'magic', { isFire: true }, g);
            }
          }
        }
        window.__simControl.stepFrames(1, dt);
        return g.state;
      }, { dt: DT_MS, stepIdx: f, maxSteps: Math.round(5.0 * FPS) });
      await writeFrameIfRecording();
      if (stateNow === 'victory') {
        actMarkers.victoryAt = getVideoSec();
        break;
      }
    }

    // Ensure victory triggered if Balrog had a sliver of HP left
    await browser.evaluate(() => {
      const g = window.game;
      if (g.state !== 'victory') {
        g.lives = 20;
        for (const e of g.enemies.active.slice()) {
          if (e && !e.dead) e.takeDamage(99999, 'true', {}, g);
        }
        g.enemies.active.length = 0;
        g.enemies.spawnQueue.length = 0;
        g.enemies.waveInProgress = false;
        g.onWaveCleared(15);
      }
    });
    if (!actMarkers.victoryAt) actMarkers.victoryAt = getVideoSec();

    // Wait 0.80s as 1 -> 2 -> 3 Golden Stars pop in, then glide toward CONTINUE IN ENDLESS MODE & hold ~2.3s!
    await hold(0.80);
    await moveToElement('#btn-endless', 0.42);
    await hold(2.30);
    await saveDryRunPng('12_victory_3_stars.png');

    const totalDurationSec = capturedFrames / FPS;
    console.log(`Simulation complete: ${capturedFrames} frames (${totalDurationSec.toFixed(2)}s @ ${FPS}fps)`);

    if (browser.runtimeErrors.length > 0) {
      console.warn('Runtime page warnings/errors:', browser.runtimeErrors);
    }

    // Render synchronized stereo 44100 Hz WAV audio
    const audio = await renderSynchronizedAudioWav(browser, totalDurationSec, actMarkers);
    fs.writeFileSync(tmpWavPath, audio.wavBuffer);
    console.log(
      `Audio rendered: ${(audio.wavBuffer.length / 1024 / 1024).toFixed(2)} MB WAV, ` +
      `${audio.eventCount} SFX events, ${audio.ringSpans} Ring hum spans, ` +
      `peak=${audio.peak.toFixed(3)}, rms=${audio.rms.toFixed(4)}`
    );

    if (DRY_RUN_DIR) {
      const dryWav = path.join(DRY_RUN_DIR, 'soundtrack_preview.wav');
      fs.copyFileSync(tmpWavPath, dryWav);
      console.log(`Dry-run complete! Preview PNGs + WAV written to ${DRY_RUN_DIR}`);
      return;
    }

    // Finish piping video stream & wait for FFmpeg video encode
    ffmpegProc.stdin.end();
    await ffmpegExitPromise;
    console.log('Video stream encoded cleanly. Muxing AAC 192k stereo audio + faststart moov...');

    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-i', tmpVideoPath,
        '-i', tmpWavPath,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2',
        '-shortest',
        '-movflags', '+faststart',
        OUTPUT_MP4,
      ],
      { stdio: 'pipe' }
    );

    // Verify output container, streams & untouched index.html
    const probeJson = JSON.parse(
      execFileSync(
        'ffprobe',
        ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', OUTPUT_MP4],
        { encoding: 'utf8' }
      )
    );
    const vStream = probeJson.streams.find((s) => s.codec_type === 'video');
    const aStream = probeJson.streams.find((s) => s.codec_type === 'audio');
    const outStat = fs.statSync(OUTPUT_MP4);
    const indexStatAfter = fs.statSync(INDEX_HTML);

    if (indexStatAfter.size !== indexStatBefore.size) {
      throw new Error(`CRITICAL: index.html size changed (${indexStatBefore.size} -> ${indexStatAfter.size})!`);
    }

    console.log('\n=== DEMO VIDEO READY ===');
    console.log(`File:       ${OUTPUT_MP4}`);
    console.log(`Size:       ${(outStat.size / 1024 / 1024).toFixed(2)} MB (${outStat.size} bytes)`);
    console.log(`Video:      ${vStream.codec_name} ${vStream.width}x${vStream.height} ${vStream.pix_fmt} @ ${vStream.r_frame_rate} fps`);
    console.log(`Audio:      ${aStream.codec_name} ${aStream.sample_rate}Hz ${aStream.channels}ch`);
    console.log(`Duration:   ${Number(probeJson.format.duration).toFixed(2)}s`);
  } finally {
    await browser.close();
    try { if (fs.existsSync(tmpVideoPath)) fs.unlinkSync(tmpVideoPath); } catch {}
    try { if (fs.existsSync(tmpWavPath)) fs.unlinkSync(tmpWavPath); } catch {}
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
