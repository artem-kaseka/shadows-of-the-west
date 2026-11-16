#!/usr/bin/env node
/**
 * Epic 2-Minute (121.00s) 1080p Gameplay Trailer Recorder + Symphonic Stereo Score Renderer
 * for "Shadows of the West — Siege of Middle-earth" (/home/artem/td/index.html)
 *
 * Owned by @epic-recorder.
 * Strictly READ-ONLY with respect to /home/artem/td/index.html, /home/artem/td/scripts/serve.mjs, and /home/artem/td/src/*.
 * Writes ONLY:
 *   - /home/artem/td/epic_demo_2min_1080p.mp4
 *   - /home/artem/td/demo_1080p.mp4 (atomic copy)
 *
 * Usage:
 *   node /home/artem/td/scripts/record_epic_2min.mjs
 *   node /home/artem/td/scripts/record_epic_2min.mjs --dry-run /tmp/td-epic-dryrun
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';

const ROOT_DIR = '/home/artem/td';
const INDEX_HTML = path.join(ROOT_DIR, 'index.html');
const EPIC_OUTPUT_MP4 = path.join(ROOT_DIR, 'epic_demo_2min_1080p.mp4');
const DEMO_OUTPUT_MP4 = path.join(ROOT_DIR, 'demo_1080p.mp4');

const VIEWPORT_W = 1920;
const VIEWPORT_H = 1080;

const args = process.argv.slice(2);
const dryRunIdx = args.indexOf('--dry-run');
const DRY_RUN_DIR = dryRunIdx >= 0 ? (args[dryRunIdx + 1] || path.join(os.tmpdir(), 'td-epic-dryrun')) : null;
const fpsArgIdx = args.indexOf('--fps');
const requestedFps = fpsArgIdx >= 0 ? Number(args[fpsArgIdx + 1]) : null;

function sha256File(filePath) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(filePath));
  return h.digest('hex');
}

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
 * Probe hardware GPU (EGL / Vulkan) vs SwiftShader fallback on 1920x1080 WebGL2 + 10-frame JPEG capture.
 */
async function probeGpuBackendAndFps() {
  const chromeBin = findBrowserExecutable();
  const candidates = [
    {
      name: 'hardware-angle-gl-egl',
      isHardware: true,
      flags: [
        '--ignore-gpu-blocklist',
        '--enable-gpu-rasterization',
        '--enable-zero-copy',
        '--enable-webgl',
        '--use-gl=angle',
        '--use-angle=gl-egl',
      ],
    },
    {
      name: 'hardware-angle-vulkan',
      isHardware: true,
      flags: [
        '--ignore-gpu-blocklist',
        '--enable-gpu-rasterization',
        '--enable-webgl',
        '--use-gl=angle',
        '--use-angle=vulkan',
        '--enable-features=Vulkan',
      ],
    },
    {
      name: 'swiftshader-webgl2',
      isHardware: false,
      flags: [
        '--ignore-gpu-blocklist',
        '--enable-webgl',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ],
    },
  ];

  for (const cand of candidates) {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-gpu-probe-'));
    const proc = spawn(
      chromeBin,
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu-vsync',
        '--disable-frame-rate-limit',
        '--disable-dev-shm-usage',
        '--mute-audio',
        '--hide-scrollbars',
        ...cand.flags,
        `--window-size=${VIEWPORT_W},${VIEWPORT_H}`,
        `--user-data-dir=${userDataDir}`,
        '--remote-debugging-port=0',
        'about:blank',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    try {
      const port = await new Promise((resolve, reject) => {
        let stderr = '';
        const timer = setTimeout(() => reject(new Error(`Startup timeout: ${stderr.slice(-400)}`)), 10000);
        proc.stderr.on('data', (c) => {
          stderr += c.toString();
          const m = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
          if (m) {
            clearTimeout(timer);
            resolve(Number(m[1]));
          }
        });
        proc.on('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`Exited (${code})`));
        });
      });

      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      const pageTarget = list.find((t) => t.type === 'page');
      const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
      await new Promise((res, rej) => {
        ws.onopen = res;
        ws.onerror = rej;
      });

      let msgId = 0;
      const pending = new Map();
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) {
          const p = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error.message));
          else p.resolve(msg.result);
        }
      };
      const send = (method, params = {}) =>
        new Promise((resolve, reject) => {
          const id = ++msgId;
          pending.set(id, { resolve, reject });
          ws.send(JSON.stringify({ id, method, params }));
        });

      await send('Page.enable');
      await send('Runtime.enable');
      await send('Emulation.setDeviceMetricsOverride', {
        width: VIEWPORT_W,
        height: VIEWPORT_H,
        deviceScaleFactor: 1,
        mobile: false,
      });

      // Quick WebGL2 renderer check + 10-frame 1920x1080 JPEG screenshot benchmark
      const probeRes = await send('Runtime.evaluate', {
        expression: `(() => {
          const c = document.createElement('canvas');
          c.width = 1920; c.height = 1080;
          document.body.style.margin = '0';
          document.body.appendChild(c);
          const gl = c.getContext('webgl2', { antialias: true });
          if (!gl) return { ok: false };
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
          const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
          gl.clearColor(0.12, 0.16, 0.22, 1.0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          return { ok: true, vendor, renderer, version: gl.getParameter(gl.VERSION) };
        })()`,
        returnByValue: true,
      });

      const info = probeRes.result?.value;
      if (!info || !info.ok) {
        ws.close();
        continue;
      }
      if (cand.isHardware && /swiftshader|llvmpipe|softpipe/i.test(info.renderer || '')) {
        ws.close();
        continue;
      }

      const t0 = performance.now();
      for (let i = 0; i < 10; i++) {
        await send('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true });
      }
      const msPerFrame = (performance.now() - t0) / 10;
      ws.close();

      // Choose 60 FPS only if full 1080p capture is <30ms/frame; otherwise rock-solid 30 FPS (3,630 frames = 121.00s)
      const chosenFps = requestedFps || (msPerFrame < 30 ? 60 : 30);
      return {
        backendName: cand.name,
        flags: cand.flags,
        vendor: info.vendor,
        renderer: info.renderer,
        version: info.version,
        probeMsPerFrame: msPerFrame,
        fps: chosenFps,
      };
    } catch (err) {
      console.warn(`  [GPU probe] ${cand.name} unavailable: ${err.message}`);
    } finally {
      try { proc.kill('SIGKILL'); } catch {}
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    }
  }
  throw new Error('All WebGL2 backends failed to initialize');
}

async function launchRecorderBrowser(gpuConfig) {
  const chromeBin = findBrowserExecutable();
  const FPS = gpuConfig.fps;
  const DT_MS = 1000 / FPS;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-epic-chrome-'));

  const proc = spawn(
    chromeBin,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu-vsync',
      '--disable-frame-rate-limit',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      '--hide-scrollbars',
      ...gpuConfig.flags,
      `--window-size=${VIEWPORT_W},${VIEWPORT_H}`,
      `--user-data-dir=${userDataDir}`,
      '--remote-debugging-port=0',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  const port = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`Chrome startup timed out:\n${stderr}`)), 15000);
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
  await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
  await send('Emulation.setDeviceMetricsOverride', {
    width: VIEWPORT_W,
    height: VIEWPORT_H,
    deviceScaleFactor: 1,
    mobile: false,
  });

  if (!DRY_RUN_DIR) {
    await send('Animation.setPlaybackRate', { playbackRate: 0.22 });
  }

  // Runtime-only deterministic stepper + Virtual setTimeout + 3D Camera Choreographer
  // + Engraved Golden Serif Chapter Banners + Tarnished-Gold Fantasy Cursor & Rune Ripples + Audio Logger
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
        const videoFps = ${FPS};
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

        // --- Smooth Eased 3D Camera Choreographer ---
        const camTween = {
          active: false,
          startMs: 0,
          durMs: 1000,
          fromZoom: 1.0,
          toZoom: 1.0,
          fromPanX: 0,
          toPanX: 0,
          fromPanZ: 0,
          toPanZ: 0,
          followEntityType: null // optional live tracking ('ringwraith' | 'balrog')
        };

        function easeCubic(t) {
          return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        }

        function clampVal(v, lo, hi) {
          return v < lo ? lo : (v > hi ? hi : v);
        }

        function stepCameraChoreography(nowMs) {
          const g = window.game;
          const s3d = g && g.scene3d;
          if (!s3d) return;

          if (camTween.followEntityType && g.enemies && Array.isArray(g.enemies.active)) {
            const ent = g.enemies.active.find((e) => e && !e.dead && e.type === camTween.followEntityType);
            if (ent) {
              const wx = (ent.x - 640) * 0.1;
              const wz = (ent.y - 360) * 0.1;
              camTween.toPanX = clampVal(wx * 0.52, -18, 18);
              camTween.toPanZ = clampVal(wz * 0.50, -12, 12);
            }
          }

          if (camTween.active) {
            const p = camTween.durMs > 0 ? clampVal((nowMs - camTween.startMs) / camTween.durMs, 0, 1) : 1;
            const e = easeCubic(p);
            const z = camTween.fromZoom + (camTween.toZoom - camTween.fromZoom) * e;
            const px = camTween.fromPanX + (camTween.toPanX - camTween.fromPanX) * e;
            const pz = camTween.fromPanZ + (camTween.toPanZ - camTween.fromPanZ) * e;
            s3d.targetZoom = z;
            s3d.zoom = z;
            s3d.targetPanX = px;
            s3d.panX = px;
            s3d.targetPanZ = pz;
            s3d.panZ = pz;
            if (p >= 1 && !camTween.followEntityType) {
              camTween.active = false;
            }
          } else if (camTween.followEntityType) {
            s3d.targetPanX += (camTween.toPanX - s3d.targetPanX) * 0.12;
            s3d.targetPanZ += (camTween.toPanZ - s3d.targetPanZ) * 0.12;
            s3d.panX = s3d.targetPanX;
            s3d.panZ = s3d.targetPanZ;
          }
        }

        window.__demoCam = {
          /**
           * opticalZoom: 1.0 = default vista, 1.22 = ~1.22x optical zoom IN (dist = baseDist / opticalZoom)
           */
          easeTo({ opticalZoom = 1.0, gx = 640, gy = 360, panStrength = 0.52, durSec = 1.1, followType = null } = {}) {
            const s3d = window.game && window.game.scene3d;
            if (!s3d) return;
            const targetZ = 1.0 / clampVal(opticalZoom, 0.80, 1.32);
            const wx = (gx - 640) * 0.1;
            const wz = (gy - 360) * 0.1;
            camTween.fromZoom = s3d.zoom;
            camTween.fromPanX = s3d.panX;
            camTween.fromPanZ = s3d.panZ;
            camTween.toZoom = targetZ;
            camTween.toPanX = opticalZoom <= 1.01 && panStrength === 0 ? 0 : clampVal(wx * panStrength, -18, 18);
            camTween.toPanZ = opticalZoom <= 1.01 && panStrength === 0 ? 0 : clampVal(wz * panStrength, -12, 12);
            camTween.startMs = virtualNow;
            camTween.durMs = Math.max(50, durSec * 1000);
            camTween.followEntityType = followType || null;
            camTween.active = true;
          },
          reset(durSec = 0.95) {
            this.easeTo({ opticalZoom: 1.0, gx: 640, gy: 360, panStrength: 0, durSec, followType: null });
          },
          project(gx, gy, extraY = 0) {
            const g = window.game;
            const s3d = g && g.scene3d;
            if (s3d && typeof s3d.projectToScreen === 'function') {
              if (s3d.camera && s3d.camera.updateMatrixWorld) s3d.camera.updateMatrixWorld();
              const p = s3d.projectToScreen(gx, gy, extraY);
              if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
                return {
                  x: clampVal(p.x, 24, ${VIEWPORT_W} - 24),
                  y: clampVal(p.y, 24, ${VIEWPORT_H} - 24)
                };
              }
            }
            return { x: (gx / 1280) * ${VIEWPORT_W}, y: (gy / 720) * ${VIEWPORT_H} };
          }
        };

        // --- Runtime-only Tarnished-Gold Cursor, Golden Rune Ripples & Chapter Banners ---
        const overlayState = {
          x: 960,
          y: 260,
          pressed: false,
          ripples: [],
          banner: null, // { roman, title, subtitle, bornMs, durMs }
          canvas: null,
          ctx: null
        };

        function ensureOverlayCanvas() {
          if (overlayState.canvas && overlayState.canvas.isConnected) return overlayState.ctx;
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
          overlayState.canvas = c;
          overlayState.ctx = c.getContext('2d');
          return overlayState.ctx;
        }

        function drawChapterBanner(ctx, nowMs) {
          const b = overlayState.banner;
          if (!b) return;
          const elapsed = nowMs - b.bornMs;
          if (elapsed < 0 || elapsed >= b.durMs) {
            if (elapsed >= b.durMs) overlayState.banner = null;
            return;
          }
          const fadeIn = 420;
          const fadeOut = 460;
          let alpha = 1.0;
          let slideX = 0;
          if (elapsed < fadeIn) {
            const p = elapsed / fadeIn;
            const e = 1 - Math.pow(1 - p, 3);
            alpha = e;
            slideX = (1 - e) * -18;
          } else if (elapsed > b.durMs - fadeOut) {
            const p = (b.durMs - elapsed) / fadeOut;
            alpha = Math.max(0, Math.min(1, p * p * (3 - 2 * p)));
            slideX = (1 - alpha) * -8;
          }

          // Upper-left cinematic plaque (safely below top-left pause/speed pill, clear of Boss Banner & Minimap)
          const bx = 28 + slideX;
          const by = 64;
          const bw = 468;
          const bh = 68;

          ctx.save();
          ctx.globalAlpha = alpha;

          // Deep obsidian-vellum horizontal fade backdrop
          const bgGrad = ctx.createLinearGradient(bx, by, bx + bw, by);
          bgGrad.addColorStop(0, 'rgba(11, 10, 12, 0.88)');
          bgGrad.addColorStop(0.72, 'rgba(18, 15, 13, 0.72)');
          bgGrad.addColorStop(1, 'rgba(18, 15, 13, 0.0)');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(bx, by, bw, bh);

          // Left vertical cast-gold accent bar + diamond stud
          const barGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
          barGrad.addColorStop(0, '#fff4c2');
          barGrad.addColorStop(0.5, '#d9ae52');
          barGrad.addColorStop(1, '#785416');
          ctx.fillStyle = barGrad;
          ctx.fillRect(bx, by + 4, 3.5, bh - 8);

          ctx.beginPath();
          ctx.moveTo(bx + 1.75, by + bh * 0.5 - 6);
          ctx.lineTo(bx + 7.5, by + bh * 0.5);
          ctx.lineTo(bx + 1.75, by + bh * 0.5 + 6);
          ctx.lineTo(bx - 4, by + bh * 0.5);
          ctx.closePath();
          ctx.fillStyle = '#fff5c8';
          ctx.fill();

          // Top & bottom hairline tarnished-gold filigree rules
          const lineGrad = ctx.createLinearGradient(bx, 0, bx + bw * 0.88, 0);
          lineGrad.addColorStop(0, 'rgba(245, 214, 128, 0.85)');
          lineGrad.addColorStop(0.65, 'rgba(205, 162, 74, 0.40)');
          lineGrad.addColorStop(1, 'rgba(205, 162, 74, 0)');
          ctx.fillStyle = lineGrad;
          ctx.fillRect(bx + 4, by + 3, bw * 0.86, 1.2);
          ctx.fillRect(bx + 4, by + bh - 4.2, bw * 0.86, 1.2);

          // Engraved serif title
          ctx.shadowColor = 'rgba(0, 0, 0, 0.92)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 2;

          const textGrad = ctx.createLinearGradient(0, by + 12, 0, by + 40);
          textGrad.addColorStop(0, '#fff9dc');
          textGrad.addColorStop(0.52, '#ecc66c');
          textGrad.addColorStop(1, '#a97d28');
          ctx.fillStyle = textGrad;
          ctx.font = '700 20px Georgia, "Times New Roman", serif';
          ctx.fillText(b.title, bx + 18, by + 31);

          // Crisp subtitle
          ctx.fillStyle = 'rgba(232, 222, 198, 0.92)';
          ctx.font = '500 12.5px system-ui, -apple-system, Segoe UI, sans-serif';
          ctx.fillText(b.subtitle, bx + 19, by + 51);

          ctx.restore();
        }

        function renderOverlay(nowMs) {
          const ctx = ensureOverlayCanvas();
          if (!ctx) return;
          ctx.clearRect(0, 0, ${VIEWPORT_W}, ${VIEWPORT_H});

          // 1. Engraved Chapter Banner (2.4s fade-in/out)
          drawChapterBanner(ctx, nowMs);

          // 2. Expanding golden rune click-ripples
          for (let i = overlayState.ripples.length - 1; i >= 0; i--) {
            const rp = overlayState.ripples[i];
            const age = (nowMs - rp.bornMs) / 1000;
            if (age >= rp.dur) {
              overlayState.ripples.splice(i, 1);
              continue;
            }
            const p = Math.max(0, Math.min(1, age / rp.dur));
            const ease = 1 - Math.pow(1 - p, 2.5);
            const alpha = (1 - p) * 0.94;
            const rad = 10 + ease * 38;

            ctx.save();
            ctx.translate(rp.x, rp.y);

            // Outer tarnished-gold shockwave ring
            ctx.beginPath();
            ctx.arc(0, 0, rad, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(242, 212, 124, ' + alpha.toFixed(3) + ')';
            ctx.lineWidth = 2.6 * (1 - p * 0.45);
            ctx.stroke();

            // Inner rune-starlight ring
            ctx.beginPath();
            ctx.arc(0, 0, 4 + ease * 21, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 248, 220, ' + (alpha * 0.82).toFixed(3) + ')';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // 8 rotating golden rune ticks around the expanding circle
            ctx.rotate(ease * 0.55);
            ctx.strokeStyle = 'rgba(255, 236, 170, ' + (alpha * 0.85).toFixed(3) + ')';
            ctx.lineWidth = 1.5;
            for (let k = 0; k < 8; k++) {
              const a = (k * Math.PI) / 4;
              const r0 = rad - 4;
              const r1 = rad + 3;
              ctx.beginPath();
              ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
              ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
              ctx.stroke();
            }
            ctx.restore();
          }

          // 3. Tarnished-gold fantasy spearhead cursor pointer
          const x = overlayState.x;
          const y = overlayState.y;
          const scale = overlayState.pressed ? 0.88 : 1.0;

          ctx.save();
          ctx.translate(x, y);
          ctx.scale(scale, scale);

          // Subtle outer gold halo around cursor tip
          ctx.beginPath();
          ctx.arc(0, 0, 14, 0, Math.PI * 2);
          ctx.fillStyle = overlayState.pressed ? 'rgba(242, 212, 124, 0.26)' : 'rgba(242, 212, 124, 0.09)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(242, 212, 124, 0.68)';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.shadowColor = 'rgba(0, 0, 0, 0.88)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetX = 1.5;
          ctx.shadowOffsetY = 2.2;

          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, 23);
          ctx.lineTo(6.4, 17.8);
          ctx.lineTo(10.8, 26.2);
          ctx.lineTo(14.6, 24.2);
          ctx.lineTo(10.2, 15.8);
          ctx.lineTo(17.4, 14.6);
          ctx.closePath();

          const grad = ctx.createLinearGradient(0, 0, 17, 25);
          grad.addColorStop(0, '#fff9db');
          grad.addColorStop(0.48, '#e6bf64');
          grad.addColorStop(1, '#966d1e');
          ctx.fillStyle = grad;
          ctx.fill();

          ctx.shadowColor = 'transparent';
          ctx.strokeStyle = '#181208';
          ctx.lineWidth = 1.8;
          ctx.lineJoin = 'round';
          ctx.stroke();

          // Inner Elven gold bevel highlight
          ctx.beginPath();
          ctx.moveTo(2.0, 3.5);
          ctx.lineTo(2.0, 18.0);
          ctx.strokeStyle = 'rgba(255, 252, 232, 0.65)';
          ctx.lineWidth = 1.0;
          ctx.stroke();

          // Pinpoint starlight tip
          ctx.beginPath();
          ctx.arc(1.2, 1.5, 1.8, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();

          ctx.restore();
        }

        window.__demoCursor = {
          setPos(x, y, pressed = false) {
            overlayState.x = x;
            overlayState.y = y;
            overlayState.pressed = !!pressed;
            renderOverlay(virtualNow);
          },
          ripple(x, y) {
            overlayState.x = x;
            overlayState.y = y;
            overlayState.ripples.push({ x, y, bornMs: virtualNow, dur: 0.46 });
            renderOverlay(virtualNow);
          },
          showBanner(title, subtitle, durSec = 2.4) {
            overlayState.banner = {
              title,
              subtitle,
              bornMs: virtualNow,
              durMs: Math.round(durSec * 1000)
            };
            renderOverlay(virtualNow);
          },
          getPos() {
            return { x: overlayState.x, y: overlayState.y };
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
              renderOverlay(virtualNow);
            }
          },
          stepFrames(frames = 1, dtMs = ${DT_MS}, skipWebGL = false) {
            if (!manual) this.setManual(true);
            const s3d = window.game && window.game.scene3d;
            const origRender = (skipWebGL && s3d && typeof s3d.render === 'function') ? s3d.render : null;
            if (origRender) {
              s3d.render = function(a, b, c) {
                let activeGame = this.game;
                let dt = 0.016;
                let time = activeGame ? (activeGame.time || 0) : 0;
                if (a && typeof a === 'object') { activeGame = a; dt = typeof b === 'number' ? b : 0; time = typeof c === 'number' ? c : (activeGame.time || 0); }
                else { if (typeof a === 'number') dt = a; if (typeof b === 'number') time = b; if (c && typeof c === 'object') activeGame = c; }
                this.updateCamera(dt, time, activeGame);
              };
            }
            try {
              for (let i = 0; i < frames; i++) {
                virtualNow += dtMs;
                videoFrameCount++;

                stepCameraChoreography(virtualNow);

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

                renderOverlay(virtualNow);
              }
            } finally {
              if (origRender) {
                s3d.render = origRender;
              }
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
 * fires with exact deterministic video timestamp + spatial stereo pan.
 */
async function installAudioRecorderHooks(browser) {
  await browser.evaluate(() => {
    const g = window.game;
    if (!g || !g.sound || g.sound.__hookedForEpicDemo) return;
    const s = g.sound;
    s.__hookedForEpicDemo = true;

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
      defeat: 'playDefeat',
    };

    const origCanPlay = s._canPlay.bind(s);
    let lastPausedClickMs = -1e9;
    s._canPlay = function (key, minIntervalMs = 38) {
      if (this.paused && key === 'click' && !this.muted) {
        const now = this._nowMs();
        if (now - lastPausedClickMs >= 35) {
          lastPausedClickMs = now;
          const cur = window.__demoCursor ? window.__demoCursor.getPos() : { x: 960 };
          const pan = Math.max(-0.55, Math.min(0.55, (cur.x / 1920 - 0.5) * 0.7));
          window.__audioLog.push({
            t: window.__getVideoTimeSec(),
            method: 'playClick',
            key: 'click',
            pan,
          });
        }
        return false;
      }

      const ok = origCanPlay(key, minIntervalMs);
      if (ok && KEY_TO_METHOD[key]) {
        const cur = window.__demoCursor ? window.__demoCursor.getPos() : { x: 960 };
        const jitterPan = (((window.__audioLog.length * 0.6180339) % 1) - 0.5) * 0.58;
        const uiPan = (cur.x / 1920 - 0.5) * 0.55;
        const isUi = key === 'click' || key === 'build' || key === 'upgrade' || key === 'sell';
        window.__audioLog.push({
          t: window.__getVideoTimeSec(),
          method: KEY_TO_METHOD[key],
          key,
          pan: Math.max(-0.65, Math.min(0.65, isUi ? uiPan : jitterPan)),
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
    s.setRingHum = function (active) {
      const r = origSetRingHum(active);
      syncRingLog();
      return r;
    };

    const origPauseAll = s.pauseAll.bind(s);
    s.pauseAll = function () {
      const r = origPauseAll();
      syncRingLog();
      return r;
    };

    const origResumeAll = s.resumeAll.bind(s);
    s.resumeAll = function () {
      const r = origResumeAll();
      syncRingLog();
      return r;
    };
  });
}

/**
 * Render the full 2-minute 44.1 kHz stereo soundtrack inside Chrome's OfflineAudioContext:
 *   1. All synchronized TD.SoundEngine combat, UI, spell & boss SFX + One Ring whisper drone
 *   2. Evolving 4-Movement Middle-earth Symphonic Score:
 *      - Mvt I  (0:00–0:42): Rohan Horn & Bowed Strings + Hornburg Storm Rain & Siege Timpani
 *      - Mvt II (0:42–1:18): Pelennor Heroic Gondor Brass & Cavalry Ostinato -> One Ring Tritone Dread
 *      - Mvt III(1:18–1:26): Rivendell / Minas Tirith Silver Lore Harp & Warm Strings
 *      - Mvt IV (1:26–2:01): Mordor Dark Choir, Low Contrabass Brass & Relentless War-Drums -> Triumphant D-Major Victory Finale!
 */
async function renderEpicStereoAudioWav(browser, totalDurationSec, markers) {
  const sampleRate = 44100;
  console.log(`Rendering 44.1 kHz stereo symphonic score + SFX (${totalDurationSec.toFixed(2)}s)...`);

  const meta = await browser.evaluate(
    async ({ durationSec, sr, mk }) => {
      if (window.__activeRingSpanStart !== null) {
        window.__ringHumSpans.push({ start: window.__activeRingSpanStart, end: durationSec });
        window.__activeRingSpanStart = null;
      }

      const totalSamples = Math.max(sr, Math.ceil(durationSec * sr));
      const off = new OfflineAudioContext(2, totalSamples, sr);

      let scheduledTime = 0;
      Object.defineProperty(off, 'currentTime', {
        get: () => scheduledTime,
        configurable: true,
      });

      // Master bus + gentle glue compression
      const masterBus = off.createGain();
      masterBus.gain.setValueAtTime(0.001, 0);
      masterBus.gain.linearRampToValueAtTime(0.86, 0.25);
      masterBus.gain.setValueAtTime(0.86, Math.max(0.5, durationSec - 0.55));
      masterBus.gain.linearRampToValueAtTime(0.015, durationSec);

      const comp = off.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-13, 0);
      comp.knee.setValueAtTime(14, 0);
      comp.ratio.setValueAtTime(4.5, 0);
      comp.attack.setValueAtTime(0.004, 0);
      comp.release.setValueAtTime(0.16, 0);
      masterBus.connect(comp);
      comp.connect(off.destination);

      // Warm concert-hall stereo reverb send (1.65s exponential decay impulse)
      const irLen = Math.floor(sr * 1.65);
      const irBuf = off.createBuffer(2, irLen, sr);
      let seed = 133742;
      const nextRand = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      for (let ch = 0; ch < 2; ch++) {
        const d = irBuf.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < irLen; i++) {
          const t = i / sr;
          const env = Math.exp(-t * 3.1) * (i < 350 ? i / 350 : 1);
          const white = nextRand() * 2 - 1;
          lp = lp * 0.72 + white * 0.28;
          d[i] = lp * env * 0.55;
        }
      }
      const convolver = off.createConvolver();
      convolver.buffer = irBuf;
      const reverbWet = off.createGain();
      reverbWet.gain.setValueAtTime(0.22, 0);
      convolver.connect(reverbWet);
      reverbWet.connect(masterBus);

      const scoreBus = off.createGain();
      scoreBus.gain.setValueAtTime(1.0, 0);
      scoreBus.connect(masterBus);
      scoreBus.connect(convolver);

      // 1. Native TD.SoundEngine Combat, Spell, Boss & UI SFX
      const se = new window.TD.SoundEngine();
      se.muted = false;
      se.paused = false;
      se.ctx = off;
      se._canPlay = () => true;
      se._buildNoiseBuffers(off);

      const events = window.__audioLog || [];
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        if (ev.t < 0 || ev.t >= durationSec - 0.02) continue;
        if (typeof se[ev.method] !== 'function') continue;

        const panNode = off.createStereoPanner();
        panNode.pan.setValueAtTime(ev.pan || 0, ev.t);
        const sfxGain = off.createGain();
        // Keep repetitive bow/beam ticks balanced while heroic horns/spells/roars shine
        const mult = ev.key === 'beamTick' ? 0.52 : ev.key === 'bow' ? 0.68 : 0.78;
        sfxGain.gain.setValueAtTime(mult, ev.t);
        sfxGain.connect(panNode);
        panNode.connect(masterBus);

        se.masterGain = sfxGain;
        scheduledTime = ev.t;
        try {
          se[ev.method]();
        } catch (_) {}
      }

      // 2. Continuous One Ring Whisper & Sub-Drone Spans
      const spans = window.__ringHumSpans || [];
      for (const sp of spans) {
        const t0 = Math.max(0, sp.start);
        const t1 = Math.min(durationSec - 0.05, sp.end);
        if (t1 <= t0 + 0.05) continue;

        const droneGain = off.createGain();
        droneGain.gain.setValueAtTime(0.0002, t0);
        droneGain.gain.linearRampToValueAtTime(0.19, Math.min(t1, t0 + 0.35));
        droneGain.gain.setValueAtTime(0.19, t1);
        droneGain.gain.exponentialRampToValueAtTime(0.0001, Math.min(durationSec, t1 + 0.4));
        droneGain.connect(masterBus);

        const oscSub = off.createOscillator();
        oscSub.type = 'sine';
        oscSub.frequency.setValueAtTime(55.0, t0);

        const oscSaw = off.createOscillator();
        oscSaw.type = 'sawtooth';
        oscSaw.frequency.setValueAtTime(55.55, t0);

        const oscTritone = off.createOscillator();
        oscTritone.type = 'triangle';
        oscTritone.frequency.setValueAtTime(77.78, t0); // Eb2/D#2 ominous tritone color

        const lowFilter = off.createBiquadFilter();
        lowFilter.type = 'lowpass';
        lowFilter.frequency.setValueAtTime(210, t0);
        lowFilter.Q.setValueAtTime(2.5, t0);

        oscSub.connect(lowFilter);
        oscSaw.connect(lowFilter);
        oscTritone.connect(lowFilter);
        lowFilter.connect(droneGain);

        if (se.pinkNoiseBuffer) {
          const whisper = off.createBufferSource();
          whisper.buffer = se.pinkNoiseBuffer;
          whisper.loop = true;
          const bp = off.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(660, t0);
          bp.Q.setValueAtTime(5.5, t0);
          const wGain = off.createGain();
          wGain.gain.setValueAtTime(0.42, t0);
          whisper.connect(bp);
          bp.connect(wGain);
          wGain.connect(droneGain);
          whisper.start(t0);
          whisper.stop(Math.min(durationSec, t1 + 0.42));
        }

        const stopAt = Math.min(durationSec, t1 + 0.42);
        oscSub.start(t0);
        oscSaw.start(t0);
        oscTritone.start(t0);
        oscSub.stop(stopAt);
        oscSaw.stop(stopAt);
        oscTritone.stop(stopAt);
      }

      // --- Musical Synth Primitives for the 2-Minute Middle-earth Score ---
      const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

      const playStringPadChord = (t0, dur, midiNotes, vol = 0.042, cutoff = 520) => {
        if (t0 >= durationSec - 0.1 || dur <= 0.1) return;
        const end = Math.min(durationSec, t0 + dur);
        for (let idx = 0; idx < midiNotes.length; idx++) {
          const freq = midiToHz(midiNotes[idx]);
          const pan = ((idx / Math.max(1, midiNotes.length - 1)) - 0.5) * 0.65;
          for (const det of [-5, 5]) {
            const osc = off.createOscillator();
            osc.type = idx === 0 ? 'sawtooth' : 'triangle';
            osc.frequency.setValueAtTime(freq, t0);
            osc.detune.setValueAtTime(det, t0);

            const flt = off.createBiquadFilter();
            flt.type = 'lowpass';
            flt.frequency.setValueAtTime(cutoff, t0);

            const g = off.createGain();
            const v = vol * (idx === 0 ? 0.65 : 0.5);
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.linearRampToValueAtTime(v, Math.min(end - 0.02, t0 + Math.min(0.65, dur * 0.25)));
            g.gain.setValueAtTime(v, Math.max(t0 + 0.05, end - Math.min(0.65, dur * 0.28)));
            g.gain.linearRampToValueAtTime(0.0001, end);

            const p = off.createStereoPanner();
            p.pan.setValueAtTime(pan, t0);

            osc.connect(flt);
            flt.connect(g);
            g.connect(p);
            p.connect(scoreBus);
            osc.start(t0);
            osc.stop(end + 0.02);
          }
        }
      };

      const playFrenchHorn = (t0, dur, midi, vol = 0.068, pan = 0) => {
        if (t0 >= durationSec - 0.08 || dur <= 0.06) return;
        const end = Math.min(durationSec, t0 + dur);
        const freq = midiToHz(midi);

        const osc1 = off.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(freq, t0);

        const osc2 = off.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq, t0);
        osc2.detune.setValueAtTime(4.5, t0);

        // Gentle expressive vibrato
        const vib = off.createOscillator();
        vib.frequency.setValueAtTime(5.1, t0);
        const vibG = off.createGain();
        vibG.gain.setValueAtTime(freq * 0.0055, t0);
        vib.connect(vibG);
        vibG.connect(osc1.frequency);

        // Warm brass formant filter envelope
        const flt = off.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(280, t0);
        flt.frequency.exponentialRampToValueAtTime(1180, Math.min(end, t0 + Math.min(0.22, dur * 0.35)));
        flt.frequency.exponentialRampToValueAtTime(680, end);
        flt.Q.setValueAtTime(1.8, t0);

        const g = off.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(vol, Math.min(end - 0.02, t0 + Math.min(0.14, dur * 0.25)));
        g.gain.setValueAtTime(vol * 0.88, Math.max(t0 + 0.03, end - Math.min(0.24, dur * 0.3)));
        g.gain.exponentialRampToValueAtTime(0.0001, end);

        const p = off.createStereoPanner();
        p.pan.setValueAtTime(pan, t0);

        osc1.connect(flt);
        osc2.connect(flt);
        flt.connect(g);
        g.connect(p);
        p.connect(scoreBus);

        osc1.start(t0);
        osc2.start(t0);
        vib.start(t0);
        osc1.stop(end + 0.03);
        osc2.stop(end + 0.03);
        vib.stop(end + 0.03);
      };

      const playDarkChoir = (t0, dur, midiNotes, vol = 0.052) => {
        if (t0 >= durationSec - 0.1 || dur <= 0.1) return;
        const end = Math.min(durationSec, t0 + dur);
        for (let i = 0; i < midiNotes.length; i++) {
          const freq = midiToHz(midiNotes[i]);
          const pan = ((i / Math.max(1, midiNotes.length - 1)) - 0.5) * 0.7;
          const oscA = off.createOscillator();
          oscA.type = 'sawtooth';
          oscA.frequency.setValueAtTime(freq, t0);
          oscA.detune.setValueAtTime(-7, t0);

          const oscB = off.createOscillator();
          oscB.type = 'sawtooth';
          oscB.frequency.setValueAtTime(freq, t0);
          oscB.detune.setValueAtTime(7, t0);

          // Dual vowel formant bandpass ("Ah/Oh" Mordor choir)
          const f1 = off.createBiquadFilter();
          f1.type = 'bandpass';
          f1.frequency.setValueAtTime(540, t0);
          f1.Q.setValueAtTime(3.6, t0);

          const f2 = off.createBiquadFilter();
          f2.type = 'bandpass';
          f2.frequency.setValueAtTime(1020, t0);
          f2.Q.setValueAtTime(4.2, t0);

          const g = off.createGain();
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.linearRampToValueAtTime(vol, Math.min(end - 0.02, t0 + 0.28));
          g.gain.setValueAtTime(vol * 0.9, Math.max(t0 + 0.05, end - 0.32));
          g.gain.linearRampToValueAtTime(0.0001, end);

          const p = off.createStereoPanner();
          p.pan.setValueAtTime(pan, t0);

          oscA.connect(f1);
          oscB.connect(f1);
          oscA.connect(f2);
          oscB.connect(f2);
          f1.connect(g);
          f2.connect(g);
          g.connect(p);
          p.connect(scoreBus);

          oscA.start(t0);
          oscB.start(t0);
          oscA.stop(end + 0.03);
          oscB.stop(end + 0.03);
        }
      };

      const playHarpPluck = (t0, midi, vol = 0.052, pan = 0) => {
        if (t0 >= durationSec - 0.1) return;
        const end = Math.min(durationSec, t0 + 1.35);
        const freq = midiToHz(midi);
        const osc = off.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t0);

        const overtone = off.createOscillator();
        overtone.type = 'sine';
        overtone.frequency.setValueAtTime(freq * 2, t0);

        const g = off.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, end);

        const og = off.createGain();
        og.gain.setValueAtTime(vol * 0.35, t0);
        og.gain.exponentialRampToValueAtTime(0.0001, Math.min(end, t0 + 0.35));

        const p = off.createStereoPanner();
        p.pan.setValueAtTime(pan, t0);

        osc.connect(g);
        overtone.connect(og);
        og.connect(g);
        g.connect(p);
        p.connect(scoreBus);

        osc.start(t0);
        overtone.start(t0);
        osc.stop(end + 0.02);
        overtone.stop(end + 0.02);
      };

      const playWarDrum = (t0, accent = 1.0, pan = 0, pitchHz = 82) => {
        if (t0 < 0 || t0 >= durationSec - 0.35) return;
        const osc = off.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(pitchHz * (accent > 1.05 ? 1.06 : 1.0), t0);
        osc.frequency.exponentialRampToValueAtTime(33, t0 + 0.30);

        const g = off.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.115 * accent, t0 + 0.007);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);

        const p = off.createStereoPanner();
        p.pan.setValueAtTime(pan, t0);

        osc.connect(g);
        g.connect(p);
        p.connect(scoreBus);
        osc.start(t0);
        osc.stop(t0 + 0.36);

        // Subtle skin attack transient
        if (se.pinkNoiseBuffer && accent >= 0.85) {
          const src = off.createBufferSource();
          src.buffer = se.pinkNoiseBuffer;
          const bp = off.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(320, t0);
          bp.Q.setValueAtTime(1.5, t0);
          const ng = off.createGain();
          ng.gain.setValueAtTime(0.032 * accent, t0);
          ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.065);
          src.connect(bp);
          bp.connect(ng);
          ng.connect(p);
          src.start(t0);
          src.stop(t0 + 0.08);
        }
      };

      const ch2 = mk.ch2Start || 12.0;
      const ch3 = mk.ch3Start || 42.0;
      const ch3Ring = mk.ringStart || 67.0;
      const ch4 = mk.ch4Start || 78.0;
      const ch5 = mk.ch5Start || 86.0;
      const balrogP2 = mk.balrogPhase2At || 97.0;
      const vic = mk.victoryAt || 116.2;

      // =====================================================================
      // MOVEMENT I (0:00 – 0:42): TITLE & THE HORNBURG CAUSEWAY (Rohan Dorian)
      // =====================================================================
      const mvt1Chords = [
        [38, 45, 50, 53, 57], // Dm (D2 A2 D3 F3 A3)
        [34, 41, 46, 50, 53], // Bb
        [31, 38, 46, 50, 55], // Gm
        [33, 40, 45, 52, 57], // Asus/A
      ];
      for (let t = 0, step = 0; t < ch3 - 0.2; t += 4.2, step++) {
        const dur = Math.min(4.5, ch3 - t);
        playStringPadChord(t, dur, mvt1Chords[step % mvt1Chords.length], 0.045, step < 3 ? 580 : 520);
      }

      // Noble Rohan Horn theme on Title Screen (0:00.6 – 0:11.5)
      const titleHornPhrase = [
        { t: 0.6, d: 1.4, m: 50 }, // D3
        { t: 2.1, d: 1.5, m: 57 }, // A3
        { t: 3.7, d: 1.1, m: 60 }, // C4
        { t: 4.9, d: 1.6, m: 57 }, // A3
        { t: 6.7, d: 1.2, m: 53 }, // F3
        { t: 8.0, d: 1.2, m: 55 }, // G3
        { t: 9.3, d: 2.2, m: 57 }, // A3
      ];
      for (const n of titleHornPhrase) {
        playFrenchHorn(n.t, n.d, n.m, 0.068, -0.08);
      }

      // Driving Hornburg Rain ambience (0:12 – 0:42)
      if (se.pinkNoiseBuffer && ch3 > ch2 + 1) {
        const rain = off.createBufferSource();
        rain.buffer = se.pinkNoiseBuffer;
        rain.loop = true;
        const bp = off.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1380, ch2);
        bp.Q.setValueAtTime(0.85, ch2);
        const rg = off.createGain();
        rg.gain.setValueAtTime(0.0001, ch2);
        rg.gain.linearRampToValueAtTime(0.044, ch2 + 0.8);
        rg.gain.setValueAtTime(0.044, ch3 - 0.6);
        rg.gain.linearRampToValueAtTime(0.0001, ch3);
        rain.connect(bp);
        bp.connect(rg);
        rg.connect(masterBus);
        rain.start(ch2);
        rain.stop(ch3 + 0.05);
      }

      // Hornburg siege drums & heroic horn motif when battle begins (~23s–42s)
      for (let t = ch2 + 0.6, b = 0; t < ch3 - 0.3; t += 1.2, b++) {
        const combatIntensity = t >= 23.0 ? 1.05 : 0.68;
        playWarDrum(t, (b % 2 === 0 ? 1.0 : 0.72) * combatIntensity, b % 2 === 0 ? -0.2 : 0.2, 80);
        if (t >= 23.5 && b % 4 === 3 && t + 0.58 < ch3 - 0.3) {
          playWarDrum(t + 0.58, 0.65, 0, 92);
        }
      }
      const hornburgHorn = [
        { t: 25.0, d: 1.3, m: 50 },
        { t: 26.4, d: 1.3, m: 57 },
        { t: 27.8, d: 1.8, m: 62 }, // D4!
        { t: 34.5, d: 1.4, m: 62 },
        { t: 36.0, d: 1.2, m: 60 },
        { t: 37.3, d: 1.4, m: 58 },
        { t: 38.8, d: 2.2, m: 57 },
      ];
      for (const n of hornburgHorn) {
        playFrenchHorn(n.t, n.d, n.m, 0.066, 0.12);
      }

      // =====================================================================
      // MOVEMENT II (0:42 – 1:18): PELENNOR HEROIC BRASS & ONE RING DREAD
      // =====================================================================
      const pelennorChords = [
        [41, 48, 53, 57, 60], // F major heroic sunbreak!
        [36, 43, 52, 55, 60], // C major
        [38, 45, 50, 53, 57], // Dm
        [34, 41, 46, 50, 58], // Bb
      ];
      for (let t = ch3, step = 0; t < ch3Ring - 0.1; t += 3.8, step++) {
        const dur = Math.min(4.0, ch3Ring - t);
        playStringPadChord(t, dur, pelennorChords[step % pelennorChords.length], 0.048, 720);
      }

      // Gondor White City Brass Fanfare & Rohirrim Charge Theme
      const gondorFanfare = [
        { t: ch3 + 0.5, d: 1.1, m: 53 }, // F3
        { t: ch3 + 1.7, d: 1.1, m: 60 }, // C4
        { t: ch3 + 2.9, d: 1.8, m: 65 }, // F4
        { t: 54.8, d: 0.9, m: 57 },      // Rohirrim Forth Eorlingas call!
        { t: 55.8, d: 0.9, m: 62 },
        { t: 56.8, d: 1.1, m: 64 },
        { t: 58.0, d: 2.0, m: 65 },
        { t: 63.4, d: 1.2, m: 60 },      // Great Eagles soaring brass!
        { t: 64.7, d: 1.8, m: 67 },      // G4
      ];
      for (const n of gondorFanfare) {
        playFrenchHorn(n.t, n.d, n.m, 0.072, -0.1);
        playFrenchHorn(n.t, n.d, n.m - 12, 0.042, 0.15);
      }

      // Galloping 6/8 Pelennor Cavalry Percussion
      for (let t = ch3 + 0.3, b = 0; t < ch3Ring - 0.2; t += 0.92, b++) {
        playWarDrum(t, b % 2 === 0 ? 1.08 : 0.78, b % 2 === 0 ? -0.22 : 0.22, 88);
        if (b % 2 === 1 && t + 0.46 < ch3Ring - 0.2) {
          playWarDrum(t + 0.46, 0.62, 0.05, 98);
        }
      }

      // The One Ring & Nazgûl Dread Section (1:07 – 1:18)
      playDarkChoir(ch3Ring, 5.5, [38, 44, 50, 56], 0.054); // D + Ab tritone choir!
      playDarkChoir(ch3Ring + 5.2, Math.max(1.5, ch4 - (ch3Ring + 5.2)), [37, 44, 49, 56], 0.058);
      for (let t = ch3Ring + 0.2, b = 0; t < ch4 - 0.25; t += 0.85, b++) {
        playWarDrum(t, b % 2 === 0 ? 1.18 : 0.82, b % 2 === 0 ? -0.25 : 0.25, 72);
      }

      // =====================================================================
      // MOVEMENT III (1:18 – 1:26): TOME OF THE WEST (Lore Harp & Strings)
      // =====================================================================
      playStringPadChord(ch4, (ch5 - ch4) * 0.52, [38, 45, 50, 57, 60], 0.048, 620);
      playStringPadChord(ch4 + (ch5 - ch4) * 0.5, (ch5 - ch4) * 0.52, [41, 48, 53, 57, 62], 0.048, 650);
      const harpScale = [62, 65, 69, 72, 74, 72, 69, 65, 64, 67, 72, 76, 74, 69, 65, 62];
      for (let i = 0; i < harpScale.length; i++) {
        const ht = ch4 + 0.25 + i * 0.46;
        if (ht < ch5 - 0.2) {
          playHarpPluck(ht, harpScale[i], 0.055, ((i % 4) - 1.5) * 0.22);
        }
      }

      // =====================================================================
      // MOVEMENT IV (1:26 – 2:01): THE BLACK GATE, WINGED BALROG & VICTORY!
      // =====================================================================
      const mordorChords = [
        [38, 45, 49, 53], // D Phrygian dark choir (D A Db/Eb F)
        [39, 46, 51, 54], // Eb minor dread
        [38, 44, 50, 56], // D diminished / Udûn tritone
        [33, 40, 45, 52], // A dark dominant
      ];
      for (let t = ch5, step = 0; t < vic - 0.15; t += 3.6, step++) {
        const dur = Math.min(3.8, vic - t);
        const isP2 = t >= balrogP2 - 0.5;
        const notes = mordorChords[step % mordorChords.length];
        playDarkChoir(t, dur, notes, isP2 ? 0.064 : 0.052);
        playStringPadChord(t, dur, [notes[0] - 12, notes[0], notes[1]], isP2 ? 0.055 : 0.044, isP2 ? 680 : 480);
      }

      // Low Contrabass Mordor Brass Stabs & Balrog Phase II Fanfare
      for (let t = ch5 + 0.8, k = 0; t < vic - 0.5; t += 3.6, k++) {
        const note = k % 2 === 0 ? 38 : 39; // D2 -> Eb2 Phrygian menace!
        playFrenchHorn(t, 1.4, note, 0.072, k % 2 === 0 ? -0.18 : 0.18);
        playFrenchHorn(t, 1.4, note + 12, 0.056, k % 2 === 0 ? 0.18 : -0.18);
      }
      // Dramatic Balrog Phase II brass eruption!
      playFrenchHorn(balrogP2, 2.2, 50, 0.085, -0.2);
      playFrenchHorn(balrogP2, 2.2, 56, 0.078, 0.2);
      playWarDrum(balrogP2, 1.45, 0, 68);

      // Relentless Double-Time Gorgoroth War-Drums
      for (let t = ch5 + 0.15, b = 0; t < vic - 0.2; t += 0.72, b++) {
        const p2Boost = t >= balrogP2 ? 1.15 : 1.0;
        playWarDrum(t, (b % 2 === 0 ? 1.18 : 0.84) * p2Boost, b % 2 === 0 ? -0.24 : 0.24, 78);
        if ((b % 4 === 2 || t >= balrogP2 + 6) && t + 0.36 < vic - 0.2) {
          playWarDrum(t + 0.36, 0.68 * p2Boost, 0, 92);
        }
      }

      // =====================================================================
      // TRIUMPHANT 3-STAR VICTORY FINALE (vic .. durationSec): D-MAJOR GLORY!
      // =====================================================================
      const vicDur = Math.max(1.5, durationSec - vic);
      // Full D-Major Picardy-Third Orchestra + Choir (D2, A2, D3, F#3, A3, D4)
      playStringPadChord(vic, vicDur, [38, 45, 50, 54, 57, 62], 0.058, 980);
      playDarkChoir(vic + 0.1, vicDur - 0.15, [50, 54, 57, 62], 0.048);
      playFrenchHorn(vic + 0.05, Math.min(1.1, vicDur * 0.35), 57, 0.075, -0.15); // A3 ->
      playFrenchHorn(vic + 0.65, Math.max(1.2, vicDur - 0.8), 62, 0.082, 0.0);    // D4!
      playFrenchHorn(vic + 0.65, Math.max(1.2, vicDur - 0.8), 66, 0.062, 0.2);    // F#4!
      playWarDrum(vic + 0.02, 1.35, 0, 74);

      // 3 Shimmering Star Chimes synced with the 3 Golden Victory Stars (120ms, 300ms, 480ms)
      playHarpPluck(vic + 0.14, 74, 0.068, -0.25); // D5
      playHarpPluck(vic + 0.32, 78, 0.068, 0.0);   // F#5
      playHarpPluck(vic + 0.50, 81, 0.076, 0.25);  // A5

      const rendered = await off.startRendering();
      const ch0 = rendered.getChannelData(0);
      const ch1 = rendered.getChannelData(1);
      const len = ch0.length;

      // Smooth soft-knee ceiling + normalization so true peak <= 0.89 (-1.01 dBFS) and 0 clipped samples
      let rawPeak = 0;
      for (let i = 0; i < len; i++) {
        const a0 = Math.abs(ch0[i]);
        const a1 = Math.abs(ch1[i]);
        if (a0 > rawPeak) rawPeak = a0;
        if (a1 > rawPeak) rawPeak = a1;
      }
      const targetGain = rawPeak > 0.88 ? 0.88 / rawPeak : (rawPeak < 0.45 && rawPeak > 0.01 ? 0.68 / rawPeak : 1.0);

      const pcm = new Int16Array(len * 2);
      let peak = 0;
      let sumSq = 0;
      for (let i = 0; i < len; i++) {
        let l = ch0[i] * targetGain;
        let r = ch1[i] * targetGain;
        // Gentle analog soft-saturator above 0.80 so flat_factor is strictly 0
        if (Math.abs(l) > 0.80) l = Math.sign(l) * (0.80 + 0.12 * Math.tanh((Math.abs(l) - 0.80) / 0.12));
        if (Math.abs(r) > 0.80) r = Math.sign(r) * (0.80 + 0.12 * Math.tanh((Math.abs(r) - 0.80) / 0.12));
        const al = Math.abs(l);
        const ar = Math.abs(r);
        if (al > peak) peak = al;
        if (ar > peak) peak = ar;
        sumSq += 0.5 * (l * l + r * r);
        pcm[i * 2] = Math.round(l * 32767);
        pcm[i * 2 + 1] = Math.round(r * 32767);
      }

      // Store PCM bytes in 4 chunks on window to transfer effortlessly over CDP
      const bytes = new Uint8Array(pcm.buffer);
      const numChunks = 4;
      const chunkLen = Math.ceil(bytes.length / numChunks);
      window.__pcmB64Chunks = [];
      for (let c = 0; c < numChunks; c++) {
        const slice = bytes.subarray(c * chunkLen, Math.min(bytes.length, (c + 1) * chunkLen));
        let bin = '';
        const step = 32768;
        for (let i = 0; i < slice.length; i += step) {
          bin += String.fromCharCode.apply(null, slice.subarray(i, Math.min(slice.length, i + step)));
        }
        window.__pcmB64Chunks.push(btoa(bin));
      }

      return {
        numChunks,
        numFrames: len,
        peak,
        rms: Math.sqrt(sumSq / Math.max(1, len)),
        eventCount: events.length,
        ringSpans: spans.length,
      };
    },
    { durationSec: totalDurationSec, sr: sampleRate, mk: markers }
  );

  const pcmParts = [];
  for (let c = 0; c < meta.numChunks; c++) {
    const b64 = await browser.evaluate((idx) => window.__pcmB64Chunks[idx], c);
    pcmParts.push(Buffer.from(b64, 'base64'));
  }
  await browser.evaluate(() => {
    delete window.__pcmB64Chunks;
  });

  const pcmBuf = Buffer.concat(pcmParts);
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
    ...meta,
  };
}

async function main() {
  const indexStatBefore = fs.statSync(INDEX_HTML);
  const indexHashBefore = sha256File(INDEX_HTML);
  console.log(`Target: ${INDEX_HTML} (${(indexStatBefore.size / 1024).toFixed(1)} KB, sha256=${indexHashBefore.slice(0, 16)}...)`);

  const gpuConfig = await probeGpuBackendAndFps();
  const FPS = gpuConfig.fps;
  const DT_MS = 1000 / FPS;

  console.log(
    `GPU Backend: ${gpuConfig.backendName} | Renderer: ${gpuConfig.renderer} | ` +
      `Probe: ${gpuConfig.probeMsPerFrame.toFixed(1)}ms/frame -> Recording @ ${FPS} FPS`
  );
  console.log(`Mode: ${DRY_RUN_DIR ? `DRY-RUN -> ${DRY_RUN_DIR}` : `FULL 1080p@${FPS}fps -> ${EPIC_OUTPUT_MP4} + ${DEMO_OUTPUT_MP4}`}`);

  if (DRY_RUN_DIR) {
    fs.mkdirSync(DRY_RUN_DIR, { recursive: true });
  }

  const tmpVideoOnlyMp4 = path.join(os.tmpdir(), `td-epic-video-${process.pid}.mp4`);
  const tmpWavPath = path.join(os.tmpdir(), `td-epic-audio-${process.pid}.wav`);
  const tmpEpicMuxMp4 = path.join(ROOT_DIR, `.epic_demo_2min_1080p.${process.pid}.tmp.mp4`);
  const tmpDemoCopyMp4 = path.join(ROOT_DIR, `.demo_1080p.${process.pid}.tmp.mp4`);

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
        tmpVideoOnlyMp4,
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

  // Dry-run keyframe auto-capture schedule matching QA verifier's 8 canonical timestamps!
  const dryRunAutoShots = [
    { ts: 4.0, name: 'frame_01_ch1_title_strongholds_004s.png', done: false },
    { ts: 20.0, name: 'frame_02_ch2_hornburg_build_dock_020s.png', done: false },
    { ts: 35.0, name: 'frame_03_ch2_hornburg_rain_combat_035s.png', done: false },
    { ts: 52.0, name: 'frame_04_ch3_pelennor_sunbreak_siege_052s.png', done: false },
    { ts: 72.0, name: 'frame_05_ch3_one_ring_ringwraith_072s.png', done: false },
    { ts: 82.0, name: 'frame_06_ch4_codex_3d_portraits_082s.png', done: false },
    { ts: 105.0, name: 'frame_07_ch5_black_gate_balrog_105s.png', done: false },
    { ts: 119.0, name: 'frame_08_ch5_victory_3_star_modal_119s.png', done: false },
  ];

  const browser = await launchRecorderBrowser(gpuConfig);
  const markers = {};
  let capturedFrames = 0;
  let cursorX = 960;
  let cursorY = 260;
  const startWallMs = Date.now();

  try {
    await browser.send('Page.navigate', { url: `file://${INDEX_HTML}` });
    for (let i = 0; i < 80; i++) {
      const ready = await browser.evaluate(() => !!(window.game && window.game._initialized && window.game.scene3d && window.game.scene3d.isReady));
      if (ready) break;
      await new Promise((r) => setTimeout(r, 75));
    }

    // Warm up 3D Title map previews & verify WebGL renderer info on live game context
    const liveGlInfo = await browser.evaluate(() => {
      window.__simControl.setManual(true);
      const g = window.game;
      g.fitStage();
      if (g.ui && typeof g.ui._upgradeTitleMapPreviewsTo3D === 'function') {
        g.ui._upgradeTitleMapPreviewsTo3D();
      }
      g.render();
      window.__demoCursor.setPos(960, 260, false);
      const gl = g.scene3d?.renderer?.getContext();
      const ext = gl ? gl.getExtension('WEBGL_debug_renderer_info') : null;
      return {
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : (gl ? gl.getParameter(gl.RENDERER) : 'unknown'),
        glError: gl ? gl.getError() : -1,
      };
    });
    console.log(`Live Scene3D WebGL2 ready: ${liveGlInfo.renderer} (gl.getError()=${liveGlInfo.glError})`);

    // Benchmark 10 live 3D frames at 1920x1080 JPEG q=92
    const bench0 = Date.now();
    for (let b = 0; b < 10; b++) {
      await browser.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true });
    }
    const benchMs = Date.now() - bench0;
    console.log(`10-frame live 3D 1920x1080 JPEG benchmark: ${benchMs}ms (${(benchMs / 10).toFixed(1)}ms/frame)`);

    await installAudioRecorderHooks(browser);

    const getVideoSec = () => capturedFrames / FPS;

    const recordOneSteppedFrame = async () => {
      capturedFrames++;
      const nowSec = capturedFrames / FPS;

      if (!DRY_RUN_DIR) {
        const shot = await browser.send('Page.captureScreenshot', {
          format: 'jpeg',
          quality: 92,
          optimizeForSpeed: true,
        });
        const buf = Buffer.from(shot.data, 'base64');
        if (!ffmpegProc.stdin.write(buf)) {
          await once(ffmpegProc.stdin, 'drain');
        }
        if (capturedFrames % 300 === 0) {
          const elapsed = ((Date.now() - startWallMs) / 1000).toFixed(1);
          const rate = (capturedFrames / Math.max(0.1, (Date.now() - startWallMs) / 1000)).toFixed(1);
          console.log(`  Captured ${capturedFrames}/3630 frames (${nowSec.toFixed(1)}s / 121.0s video, ${elapsed}s wall, ${rate} enc-fps)...`);
        }
      } else {
        for (const k of dryRunAutoShots) {
          if (!k.done && nowSec >= k.ts) {
            k.done = true;
            await browser.evaluate(() => window.game.render());
            const shot = await browser.send('Page.captureScreenshot', { format: 'png' });
            fs.writeFileSync(path.join(DRY_RUN_DIR, k.name), Buffer.from(shot.data, 'base64'));
            console.log(`  [dry-run keyframe] ${k.name} @ ${nowSec.toFixed(2)}s`);
          }
        }
      }
    };

    const stepOneFrame = async () => {
      const skipGl = Boolean(DRY_RUN_DIR);
      await browser.evaluate(({ dt, skip }) => window.__simControl.stepFrames(1, dt, skip), {
        dt: DT_MS,
        skip: skipGl,
      });
      await recordOneSteppedFrame();
    };

    const hold = async (seconds) => {
      const n = Math.max(1, Math.round(seconds * FPS));
      for (let i = 0; i < n; i++) {
        await stepOneFrame();
      }
    };

    const holdUntilSec = async (targetSec) => {
      const targetFrames = Math.round(targetSec * FPS);
      while (capturedFrames < targetFrames) {
        await stepOneFrame();
      }
    };

    const showBanner = async (title, subtitle, durSec = 2.4) => {
      await browser.evaluate(
        ({ t, s, d }) => window.__demoCursor.showBanner(t, s, d),
        { t: title, s: subtitle, d: durSec }
      );
    };

    const easeCamera = async (opts) => {
      await browser.evaluate((o) => window.__demoCam.easeTo(o), opts);
    };

    const resetCamera = async (durSec = 0.95) => {
      await browser.evaluate((d) => window.__demoCam.reset(d), durSec);
    };

    const moveTo = async (tx, ty, durationSec = 0.34) => {
      const steps = Math.max(2, Math.round(durationSec * FPS));
      const sx = cursorX;
      const sy = cursorY;
      const skipGl = Boolean(DRY_RUN_DIR);
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
        await browser.evaluate(
          ({ x, y, dt, skip }) => {
            window.__demoCursor.setPos(x, y, false);
            window.__simControl.stepFrames(1, dt, skip);
          },
          { x: nx, y: ny, dt: DT_MS, skip: skipGl }
        );
        await recordOneSteppedFrame();
      }
    };

    /**
     * Smoothly glides cursor to a 3D world coordinate (gx, gy, extraY), re-projecting
     * every frame through Scene3D's live PerspectiveCamera so zoom/pan motion never drifts!
     */
    const moveToWorld3D = async (gx, gy, durationSec = 0.34, extraY = 0.4) => {
      const steps = Math.max(2, Math.round(durationSec * FPS));
      const sx = cursorX;
      const sy = cursorY;
      const skipGl = Boolean(DRY_RUN_DIR);
      for (let i = 1; i <= steps; i++) {
        const p = easeInOutCubic(i / steps);
        const targetPt = await browser.evaluate(
          ({ x, y, ey }) => window.__demoCam.project(x, y, ey),
          { x: gx, y: gy, ey: extraY }
        );
        const nx = sx + (targetPt.x - sx) * p;
        const ny = sy + (targetPt.y - sy) * p;
        cursorX = nx;
        cursorY = ny;
        await browser.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: Math.round(nx),
          y: Math.round(ny),
          button: 'none',
        });
        await browser.evaluate(
          ({ x, y, dt, skip }) => {
            window.__demoCursor.setPos(x, y, false);
            window.__simControl.stepFrames(1, dt, skip);
          },
          { x: nx, y: ny, dt: DT_MS, skip: skipGl }
        );
        await recordOneSteppedFrame();
      }
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

    const moveToElement = async (selector, durationSec = 0.34) => {
      const pt = await getElementCenter(selector);
      await moveTo(pt.x, pt.y, durationSec);
      return pt;
    };

    const clickHere = async (holdAfterSec = 0.10, clickCount = 1) => {
      const rx = Math.round(cursorX);
      const ry = Math.round(cursorY);
      const skipGl = Boolean(DRY_RUN_DIR);
      await browser.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: rx,
        y: ry,
        button: 'left',
        buttons: 1,
        clickCount,
      });
      await browser.evaluate(
        ({ x, y, dt, skip }) => {
          window.__demoCursor.ripple(x, y);
          window.__demoCursor.setPos(x, y, true);
          window.__simControl.stepFrames(1, dt, skip);
        },
        { x: cursorX, y: cursorY, dt: DT_MS, skip: skipGl }
      );
      await recordOneSteppedFrame();

      await browser.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: rx,
        y: ry,
        button: 'left',
        buttons: 0,
        clickCount,
      });
      await browser.evaluate(
        ({ x, y, dt, skip }) => {
          window.__demoCursor.setPos(x, y, false);
          window.__simControl.stepFrames(1, dt, skip);
        },
        { x: cursorX, y: cursorY, dt: DT_MS, skip: skipGl }
      );
      await recordOneSteppedFrame();

      if (holdAfterSec > 0) {
        await hold(holdAfterSec);
      }
    };

    // =========================================================================
    // CHAPTER 1 (0:00.0 – 0:12.0, 12.0s): TITLE SCREEN & 3D STRONGHOLDS
    // =========================================================================
    console.log('\n=== Chapter 1 (0:00 – 0:12): Title Screen & 3D Strongholds ===');
    markers.ch1Start = getVideoSec();

    // Admire live storm-lit 3D Hornburg fortress orbiting behind Shadows of the West crest
    await hold(1.80);

    // Hover Hornburg card & hold smoothly across t = 4.0s (Keyframe #1!)
    await moveToElement('[data-map-id="hornburg"]', 0.55);
    await holdUntilSec(4.35);

    // Showcase live 3D background switching across Pelennor Crossroads & The Black Gate!
    await moveToElement('[data-map-id="pelennor"]', 0.48);
    await clickHere(0.95);

    await moveToElement('[data-map-id="blackgate"]', 0.48);
    await clickHere(0.95);

    // Smoothly hover all 3 heraldic Difficulty Shields & select Captain
    await moveToElement('[data-difficulty="ranger"]', 0.46);
    await hold(0.32);
    await moveToElement('[data-difficulty="steward"]', 0.48);
    await hold(0.32);
    await moveToElement('[data-difficulty="captain"]', 0.42);
    await clickHere(0.28);

    // Return to The Hornburg Causeway & click BEGIN SIEGE right at 12.0s!
    await moveToElement('[data-map-id="hornburg"]', 0.46);
    await clickHere(0.32);
    await holdUntilSec(11.42);
    await moveToElement('#btn-begin-siege', 0.44);
    await clickHere(0.0);
    await holdUntilSec(12.0);

    // =========================================================================
    // CHAPTER 2 (0:12.0 – 0:42.0, 30.0s): THE HORNBURG CAUSEWAY
    // Rain, 3D Build Dock, Range + Deadzone Rings, Rally, War Horn & Upgrades!
    // =========================================================================
    console.log('=== Chapter 2 (0:12 – 0:42): The Hornburg Causeway ===');
    markers.ch2Start = getVideoSec();
    await showBanner('I. THE HORNBURG CAUSEWAY', "Helm's Deep • Driving Rain & Citadel Foundations", 2.4);

    await browser.evaluate(() => {
      const g = window.game;
      g.gold = 2650;
      if (g.ui) g.ui._toastTimer = 1.4;
      g._notifyUI();
    });

    await hold(0.55);

    // 1. Hover empty ghost Pad 0 briefly, then build Elven Watchtower on Pad 4 (350, 472)
    await moveToWorld3D(155, 160, 0.42, 0.5);
    await hold(0.28);
    await moveToWorld3D(350, 472, 0.44, 0.5);
    await clickHere(0.14);
    await moveToElement('[data-tower-type="elven"]', 0.36);
    await clickHere(0.18);

    // 2. Build Garrison of Men on front Pad 1 (185, 308) & place custom Rally Point on wet ramp!
    await moveToWorld3D(185, 308, 0.42, 0.5);
    await clickHere(0.12);
    await moveToElement('[data-tower-type="garrison"]', 0.34);
    await clickHere(0.14);
    await moveToElement('#btn-rally-point', 0.32);
    await clickHere(0.12);
    await moveToWorld3D(248, 268, 0.42, 0.2);
    await hold(0.38); // Show 3D green rally boundary, waving banner & tether!
    await clickHere(0.16);

    // 3. Build Istari Spire on Pad 5 (465, 468)
    await moveToWorld3D(465, 468, 0.38, 0.5);
    await clickHere(0.12);
    await moveToElement('[data-tower-type="istari"]', 0.34);
    await clickHere(0.16);

    // 4. Select central Pad 3 (342, 335) & hover Dwarven Siege across t = 20.0s (Keyframe #2!)
    // Shows 3D Studio Portrait Build Dock + Green Range Disc + Orange Dashed Min 75 Deadzone Ring!
    await moveToWorld3D(342, 335, 0.40, 0.5);
    await clickHere(0.14);
    await moveToElement('[data-tower-type="dwarven"]', 0.38);
    await holdUntilSec(20.65); // Spans t = 20.0s cleanly!
    await clickHere(0.16); // Builds Dwarven Siege Foundry!

    // 5. Build 2nd Elven Watchtower on Pad 7 (470, 295) so we showcase Mirkwood Wardens too!
    await moveToWorld3D(470, 295, 0.36, 0.5);
    await clickHere(0.10);
    await moveToElement('[data-tower-type="elven"]', 0.32);
    await clickHere(0.14);

    // 6. Click War Horn (.early-wave-marker) for Early Wave Gold!
    await browser.evaluate(() => {
      if (window.game.ui) window.game.ui.update(0, window.game);
    });
    await moveToElement('.early-wave-marker', 0.42);
    await hold(0.28);
    await clickHere(0.16);

    // Spawn rainy Hornburg assault: tight Goblin pack, armored Orcs, and leaping 4-legged Warg Riders!
    await browser.evaluate(() => {
      const g = window.game;
      const em = g.enemies;
      for (let i = 0; i < 16; i++) {
        em.spawnEnemy('goblin', 0, g, 1.45, 1.0, 90 + i * 13);
      }
      for (let i = 0; i < 8; i++) {
        em.spawnEnemy('orc', 0, g, 1.55, 1.0, 120 + i * 24);
      }
      for (let i = 0; i < 6; i++) {
        em.spawnEnemy('warg', 0, g, 1.55, 1.0, 138 + i * 32);
      }
      // Staggered stream so Hornburg road stays action-packed through 0:42!
      em.spawnQueue.push(
        { spawnAt: 3.5, type: 'warg', laneIndex: 0, hpMult: 1.5, speedMult: 1.0 },
        { spawnAt: 4.2, type: 'orc', laneIndex: 0, hpMult: 1.5, speedMult: 1.0 },
        { spawnAt: 5.0, type: 'goblin', laneIndex: 0, hpMult: 1.5, speedMult: 1.0 },
        { spawnAt: 5.4, type: 'goblin', laneIndex: 0, hpMult: 1.5, speedMult: 1.0 },
        { spawnAt: 6.2, type: 'warg', laneIndex: 0, hpMult: 1.5, speedMult: 1.0 },
        { spawnAt: 7.5, type: 'orc', laneIndex: 0, hpMult: 1.5, speedMult: 1.0 }
      );
      g.spatialGrid.rebuild(em.active);
      g.clearSelection();
    });

    // 7. Smoothly ZOOM IN (~1.23x) on winged-helm Citadel Guards clashing with Goblins, Orcs & Leaping Wargs!
    await easeCamera({ opticalZoom: 1.23, gx: 265, gy: 345, panStrength: 0.56, durSec: 1.05 });
    await moveToWorld3D(275, 335, 0.55, 0.8);
    await holdUntilSec(28.6);

    // 8. Ease camera to mid-causeway & upgrade towers through T2 into Galadhrim Longbows, Mirkwood Wardens & Khazad Ballista!
    await easeCamera({ opticalZoom: 1.06, gx: 410, gy: 395, panStrength: 0.42, durSec: 0.85 });
    await hold(0.35);

    // Pad 4 (350, 472): Elven -> T2 -> Galadhrim Longbows (Starlight Piercer crits!)
    await moveToWorld3D(350, 472, 0.36, 1.5);
    await clickHere(0.10);
    await moveToElement('#btn-upgrade-t2', 0.30);
    await clickHere(0.10);
    await moveToElement('#btn-upgrade-branch-a', 0.28);
    await clickHere(0.12);
    await moveToElement('#btn-trigger-skill', 0.26);
    await clickHere(0.10);

    // Pad 7 (470, 295): Elven -> T2 -> Mirkwood Wardens (3-tier canopy 3-arrow volleys!)
    await moveToWorld3D(470, 295, 0.36, 1.5);
    await clickHere(0.10);
    await moveToElement('#btn-upgrade-t2', 0.28);
    await clickHere(0.10);
    await moveToElement('#btn-upgrade-branch-b', 0.28);
    await clickHere(0.12);
    await moveToElement('#btn-trigger-skill', 0.26);
    await clickHere(0.10);

    // Pad 3 (342, 335): Dwarven -> T2 -> Khazad Ballista (Mithril Skewer piercing lines & shredding armor!)
    await moveToWorld3D(342, 335, 0.36, 1.4);
    await clickHere(0.10);
    await moveToElement('#btn-upgrade-t2', 0.28);
    await clickHere(0.10);
    await moveToElement('#btn-upgrade-branch-b', 0.28);
    await clickHere(0.12);
    await moveToElement('#btn-trigger-skill', 0.26);
    await clickHere(0.10);

    // Reinforce central Hornburg causeway & zoom in (~1.21x) across t = 35.0s (Keyframe #3!)
    await browser.evaluate(() => {
      const g = window.game;
      const em = g.enemies;
      for (let i = 0; i < 14; i++) {
        em.spawnEnemy('goblin', 0, g, 1.55, 1.0, 290 + i * 16);
      }
      for (let i = 0; i < 7; i++) {
        em.spawnEnemy('orc', 0, g, 1.65, 1.0, 310 + i * 28);
      }
      for (let i = 0; i < 5; i++) {
        em.spawnEnemy('warg', 0, g, 1.65, 1.0, 260 + i * 38);
      }
      g.spatialGrid.rebuild(em.active);
      g.clearSelection();
    });

    await easeCamera({ opticalZoom: 1.21, gx: 415, gy: 395, panStrength: 0.54, durSec: 0.95 });
    await moveToWorld3D(495, 365, 0.55, 1.0);
    await holdUntilSec(38.4);

    // Trigger another round of Starlight Piercer + Mithril Skewer volleys in the rain, then ease back to 1.0x!
    await browser.evaluate(() => {
      const g = window.game;
      for (const t of g.towers.towers) {
        if (t && t.tier === 3 && t.triggerSkill) {
          t.skillCd = 0;
          t.triggerSkill(g);
        }
      }
    });
    await holdUntilSec(40.8);
    await resetCamera(0.95);
    await holdUntilSec(42.0);

    // =========================================================================
    // CHAPTER 3 (0:42.0 – 1:18.0, 36.0s): PELENNOR CROSSROADS
    // Sunbreak Vista, Trolls/Uruks/Wraiths/Fell Beasts, Upgrade Dock,
    // Rohirrim Charge, Light of Eärendil, Great Eagles & The One Ring -> Ringwraith!
    // =========================================================================
    console.log('=== Chapter 3 (0:42 – 1:18): Siege of Pelennor Fields & The One Ring ===');
    markers.ch3Start = getVideoSec();

    await browser.evaluate(() => {
      const g = window.game;
      g.startSiege('pelennor', 'captain');
      if (g.ui && g.ui._els && g.ui._els.heraldToast) {
        g.ui._toastTimer = 0;
        g.ui._els.heraldToast.classList.add('is-hidden');
      }
      g.gold = 12000;
      g.lives = 20;
      g.wave = 11;
      g.enemies.currentWave = 11;
      g.enemies.waveInProgress = true;
      g.enemies.waveElapsed = 0;
      g.screenFlash = { color: 'rgba(245, 214, 128, 0.20)', timer: 0.25, duration: 0.25 };

      const buildStaged = (padId, type, tier, branch, rallyPt) => {
        const pad = g.map.pads[padId];
        const t = g.towers.buildTower(pad, type, g);
        if (tier >= 2 && t.upgradeTier2) t.upgradeTier2(g);
        if (tier >= 3 && branch && t.upgradeBranch) t.upgradeBranch(branch, g);
        if (rallyPt && t.setRallyPoint) t.setRallyPoint(rallyPt.x, rallyPt.y, g.map);
        return t;
      };

      // Front Lane-0 towers within 165px of Ringwraith entry so Black Breath stuns them!
      buildStaged(0, 'elven', 2, null);                        // (165, 105)
      buildStaged(1, 'garrison', 2, null, { x: 205, y: 180 }); // (195, 250)

      // T2 towers poised for live on-camera T3 upgrades!
      buildStaged(4, 'dwarven', 2, null);                      // (395, 222) -> Iron Hills Mortar!
      buildStaged(5, 'garrison', 2, null, { x: 345, y: 295 }); // (405, 360) -> Tower Guard Phalanx!
      buildStaged(7, 'istari', 2, null);                       // (645, 212) -> Stormcaller Council!
      buildStaged(8, 'garrison', 2, null, { x: 785, y: 365 }); // (690, 360) -> Knights of the Riddermark!

      // Supporting defenders + rear White City gate anti-air backstop (keeps 20/20 lives!)
      buildStaged(6, 'elven', 3, 'B');                         // (395, 498) Mirkwood Wardens
      buildStaged(9, 'elven', 3, 'A');                         // (645, 502) Galadhrim Longbows
      buildStaged(10, 'dwarven', 3, 'B');                      // (842, 272) Khazad Ballista
      buildStaged(11, 'elven', 3, 'A');                        // (842, 458) Galadhrim Longbows
      buildStaged(13, 'istari', 3, 'A');                       // (1020, 356) Flame of Anor

      g.gold = 2450;
      g.clearSelection();

      const em = g.enemies;
      // Dual-lane Wave 11–12 army: Olog-hai Siege Trolls, Uruk-hai Berserkers, Shadow Wraiths & Fell Beasts!
      em.spawnEnemy('troll', 0, g, 1.65, 1.0, 240);
      em.spawnEnemy('troll', 0, g, 1.65, 1.0, 410);
      em.spawnEnemy('troll', 1, g, 1.65, 1.0, 285);
      for (let i = 0; i < 6; i++) {
        const u = em.spawnEnemy('uruk', i % 2, g, 1.55, 1.0, 210 + i * 48);
        if (i < 4) u.hp = u.maxHp * 0.44; // Poised to ignite crimson Blood-Rage (<40% HP)!
      }
      for (let i = 0; i < 8; i++) {
        em.spawnEnemy('wraith', 1, g, 1.55, 1.0, 180 + i * 42);
      }
      for (let i = 0; i < 4; i++) {
        em.spawnEnemy('fellbeast', 0, g, 1.65, 1.0, 130 + i * 110);
        em.spawnEnemy('fellbeast', 1, g, 1.65, 1.0, 175 + i * 115);
      }

      // Continuous Pelennor reinforcements across the entire 36s chapter
      for (let k = 0; k < 14; k++) {
        const types = ['uruk', 'wraith', 'troll', 'fellbeast', 'warg', 'orc'];
        em.spawnQueue.push({
          spawnAt: 2.5 + k * 2.2,
          type: types[k % types.length],
          laneIndex: k % 2,
          hpMult: 1.55,
          speedMult: 1.0,
        });
      }

      g.sound.muted = true;
      g.advanceTime(0.45);
      g.sound.muted = false;
      g._notifyUI();
      g.render();
    });

    await showBanner('II. SIEGE OF PELENNOR FIELDS', 'Minas Tirith • Dual-Lane Clash & Rohirrim Charge', 2.4);
    await hold(1.10);

    // 1. Upgrade Pad 5 (405, 360) -> Tower Guard Phalanx + Citadel Shield Wall!
    await moveToWorld3D(405, 360, 0.40, 1.4);
    await clickHere(0.14);
    await moveToElement('#btn-upgrade-branch-a', 0.34);
    await hold(0.28);
    await clickHere(0.14);
    await moveToElement('#btn-trigger-skill', 0.28);
    await clickHere(0.16);

    // 2. Upgrade Pad 7 (645, 212) -> Stormcaller Council + Tempest of Manwë 3D Chain Lightning!
    await moveToWorld3D(645, 212, 0.42, 1.6);
    await clickHere(0.14);
    await moveToElement('#btn-upgrade-branch-b', 0.34);
    await hold(0.28);
    await clickHere(0.14);
    await moveToElement('#btn-trigger-skill', 0.28);
    await clickHere(0.16);

    // 3. Select T2 Khazad Great Catapult on Pad 4 (395, 222) & hover Iron Hills Mortar across t = 52.0s (Keyframe #4!)
    // Shows 3D Branch A/B studio portraits + cyan current range + yellow dashed upgrade range + deadzone ring!
    await moveToWorld3D(395, 222, 0.42, 1.4);
    await clickHere(0.16);
    await moveToElement('#btn-upgrade-branch-a', 0.38);
    await holdUntilSec(52.65); // Spans t = 52.0s cleanly!
    await clickHere(0.14);     // Upgrades into Iron Hills Mortar!
    await moveToElement('#btn-trigger-skill', 0.28);
    await clickHere(0.16);     // Dragonfire Barrage — blazing meteors, volumetric smoke & burning oil pools!

    // 4. Upgrade Pad 8 (690, 360) -> Knights of the Riddermark + Forth Eorlingas! 3D Rohirrim Warhorse Charge!
    await moveToWorld3D(690, 360, 0.42, 1.4);
    await clickHere(0.14);
    await moveToElement('#btn-upgrade-branch-b', 0.34);
    await clickHere(0.14);
    await moveToElement('#btn-trigger-skill', 0.28);
    await clickHere(0.12);

    // Clear selection & ZOOM IN (~1.23x) on 3D Rohirrim Warhorses charging Olog-hai Siege Trolls & Uruks!
    await browser.evaluate(() => {
      const g = window.game;
      g.enemies.spawnEnemy('troll', 0, g, 1.6, 1.0, 620);
      for (let i = 0; i < 5; i++) g.enemies.spawnEnemy('uruk', i % 2, g, 1.5, 1.0, 560 + i * 28);
      g.spatialGrid.rebuild(g.enemies.active);
      g.clearSelection();
    });
    await easeCamera({ opticalZoom: 1.23, gx: 660, gy: 355, panStrength: 0.56, durSec: 0.95 });
    await moveToWorld3D(745, 365, 0.50, 1.0);
    await holdUntilSec(58.8);
    await resetCamera(0.85);
    await holdUntilSec(59.6);

    // 5. Cast Light of Eärendil (28-unit celestial starlight shaft stunning foes & revealing Shadow Wraiths!)
    await browser.evaluate(() => {
      const g = window.game;
      for (let i = 0; i < 6; i++) g.enemies.spawnEnemy('wraith', 1, g, 1.5, 1.0, 290 + i * 28);
      g.spatialGrid.rebuild(g.enemies.active);
    });
    await moveToElement('#btn-spell-light', 0.36);
    await clickHere(0.10);
    const lightPt = await browser.evaluate(() => {
      const wraiths = window.game.enemies.active.filter((e) => !e.dead && e.type === 'wraith');
      if (wraiths.length > 0) {
        const pick = wraiths[Math.floor(wraiths.length / 2)];
        return { x: pick.x, y: pick.y };
      }
      return { x: 430, y: 435 };
    });
    await moveToWorld3D(lightPt.x, lightPt.y, 0.40, 0.2);
    await hold(0.45); // Show 3D Star of Eärendil reticle!
    await clickHere(0.12);
    await hold(1.25);

    // 6. Cast Great Eagles Strike (3 feathered 3D Great Eagles banking & sweeping across Pelennor!)
    await moveToElement('#btn-spell-eagles', 0.36);
    await clickHere(0.10);
    const eaglePt = await browser.evaluate(() => {
      const foes = window.game.enemies.active.filter((e) => !e.dead && (e.type === 'troll' || e.type === 'uruk' || e.type === 'fellbeast'));
      if (foes.length > 0) {
        const f = foes[0];
        return { x: Math.max(330, Math.min(820, f.x)), y: Math.max(170, Math.min(520, f.y)) };
      }
      return { x: 520, y: 270 };
    });
    await moveToWorld3D(eaglePt.x, eaglePt.y, 0.40, 0.2);
    await hold(0.45); // Show 3D golden corridor & eagle chevrons!
    await clickHere(0.10);
    await easeCamera({ opticalZoom: 1.15, gx: eaglePt.x, gy: eaglePt.y, panStrength: 0.42, durSec: 0.75 });
    await holdUntilSec(66.2);
    await resetCamera(0.75);
    await holdUntilSec(67.0);

    // 7. THE ONE RING & THE NINE (1:07.0 – 1:18.0, Keyframe #5 at t = 72.0s!)
    markers.ringStart = getVideoSec();
    await showBanner('III. THE ONE RING & THE NINE', "Corruption Frenzy & The Nazgûl's Black Breath", 2.4);

    await moveToElement('#btn-ring', 0.40);
    await browser.evaluate(() => {
      // Set corruption = 76% so ~3.0s of +8%/s Ring frenzy hits 100% right at ~70.6s!
      window.game.corruption = 76;
      window.game._notifyUI();
    });
    await clickHere(0.14); // Toggle THE ONE RING ON!

    // Glide cursor over crossroads while towers fire +40% faster under golden-crimson Ring aura!
    await moveToWorld3D(360, 260, 0.55, 1.0);

    // Step until 100% Corruption Overload summons the 3D Ringwraith Boss!
    for (let w = 0; w < Math.round(4.2 * FPS); w++) {
      await stepOneFrame();
      const spawned = await browser.evaluate(() =>
        window.game.enemies.active.some((e) => e && !e.dead && e.type === 'ringwraith')
      );
      if (spawned) break;
    }

    // Zoom 3D camera in (~1.22x) following the 3D Ringwraith Boss & pulse Black Breath right across t = 72.0s!
    await easeCamera({ opticalZoom: 1.22, gx: 175, gy: 185, panStrength: 0.56, durSec: 0.85, followType: 'ringwraith' });
    await holdUntilSec(71.65);
    await browser.evaluate(() => {
      const g = window.game;
      const rw = g.enemies.active.find((e) => e && !e.dead && e.type === 'ringwraith');
      if (rw && typeof rw.pulseBlackBreath === 'function') {
        rw.pulseBlackBreath(g); // Fresh Black Breath shockwave + stunned front towers across t = 72.0s!
      }
      g._notifyUI();
    });
    await holdUntilSec(76.8);
    await resetCamera(0.95);
    await holdUntilSec(78.0);

    // =========================================================================
    // CHAPTER 4 (1:18.0 – 1:26.0, 8.0s): THE GRIMOIRE TOME CODEX
    // Click 3D Leather Grimoire Tome -> Towers Tab -> 9-Unit 3D Bestiary -> Return!
    // =========================================================================
    console.log('=== Chapter 4 (1:18 – 1:26): Tome of the West Codex ===');
    markers.ch4Start = getVideoSec();
    await showBanner('IV. TOME OF THE WEST', '3D Bestiary & Tower Specialization Grimoire', 2.3);

    await moveToElement('#btn-codex', 0.42);
    await clickHere(0.15);

    // Showcase Towers & Upgrades tab (all 16 3D studio tower portraits!)
    await moveTo(1485, 210, 0.35);
    await holdUntilSec(80.65);

    // Switch to Bestiary & Resistances tab & hold across t = 82.0s (Keyframe #6!)
    await moveToElement('[data-codex-tab="bestiary"]', 0.38);
    await clickHere(0.12);
    await moveTo(1495, 205, 0.32); // Keep cursor neatly off the 9 3D portrait cards!
    await holdUntilSec(84.85);

    // Click RETURN TO SIEGE right before 1:26.0!
    await moveToElement('#btn-codex-done', 0.40);
    await clickHere(0.10);
    await holdUntilSec(86.0);

    // =========================================================================
    // CHAPTER 5 (1:26.0 – 2:01.0, 35.0s): THE BLACK GATE OF MORDOR
    // Wave 15 Grand Siege: Witch-lord -> 10,060-tri Winged Balrog of Udûn,
    // Crimson Dark Spell Lock (3x Click Shatter!), Final Barrage & 3-Star Victory!
    // =========================================================================
    console.log('=== Chapter 5 (1:26 – 2:01): The Black Gate & Winged Balrog Finale ===');
    markers.ch5Start = getVideoSec();

    await browser.evaluate(() => {
      const g = window.game;
      g.startSiege('blackgate', 'captain');
      if (g.ui && g.ui._els && g.ui._els.heraldToast) {
        g.ui._toastTimer = 0;
        g.ui._els.heraldToast.classList.add('is-hidden');
      }
      g.gold = 20000;
      g.lives = 20;
      g.maxLives = 20;
      g.wave = 15;
      g.stats.kills = 312;
      g.stats.goldEarned = 4680;
      g.enemies.currentWave = 15;
      g.enemies.waveInProgress = true;
      g.enemies.spawnQueue.length = 0;
      g.screenFlash = { color: 'rgba(255, 111, 0, 0.20)', timer: 0.26, duration: 0.26 };

      const buildT3 = (padId, type, branch, rallyPt) => {
        const pad = g.map.pads[padId];
        const t = g.towers.buildTower(pad, type, g);
        t.upgradeTier2(g);
        t.upgradeBranch(branch, g);
        if (rallyPt && t.setRallyPoint) t.setRallyPoint(rallyPt.x, rallyPt.y, g.map);
        return t;
      };

      // Elite Tier 3 Citadel Defense across the obsidian & magma wastes:
      buildT3(0, 'garrison', 'B', { x: 385, y: 145 });   // (175, 142) Forward Knights engage Witch-lord flail on ridge!
      buildT3(4, 'istari', 'A');                         // (418, 222) Flame of Anor (continuous 3D solar lance!)
      buildT3(6, 'istari', 'A');                         // (605, 360) Flame of Anor (twin continuous 3D solar lance!)
      buildT3(5, 'dwarven', 'A');                        // (418, 498) Iron Hills Mortar (meteors & burning oil!)
      buildT3(7, 'elven', 'A');                          // (675, 180) Galadhrim Longbows
      buildT3(8, 'garrison', 'A', { x: 685, y: 255 });   // (745, 360) Tower Guard Phalanx holds central obsidian plaza!
      buildT3(9, 'istari', 'B');                         // (675, 540) Stormcaller Council
      buildT3(10, 'garrison', 'B', { x: 755, y: 255 });  // (915, 248) Knights of the Riddermark (Rohirrim cavalry!)
      buildT3(11, 'dwarven', 'B');                       // (915, 472) Khazad Ballista
      buildT3(12, 'elven', 'B');                         // (995, 360) Mirkwood Wardens

      g.gold = 1280;
      g.clearSelection();

      const em = g.enemies;
      // Spawn Phase I Witch-lord of Morgul on upper causeway so he clashes on ridge then erupts into Winged Balrog on central plaza!
      const boss = em.spawnEnemy('balrog', 0, g, 1.0, 1.0, 325);
      boss.maxHp = 26000;
      boss.hp = 21500;
      boss.curseCooldown = 99; // Triggered right on cue after Phase II Balrog eruption!

      // Escort host across both volcanic tracks (all cleared before Wave 15 victory!)
      for (let i = 0; i < 14; i++) {
        em.spawnEnemy('goblin', i % 2, g, 0.9, 1.0, 110 + i * 24);
      }
      em.spawnEnemy('troll', 1, g, 0.95, 1.0, 210);
      for (let i = 0; i < 6; i++) {
        em.spawnEnemy('uruk', i % 2, g, 0.85, 1.0, 175 + i * 48);
      }
      for (let i = 0; i < 5; i++) {
        em.spawnEnemy('wraith', i % 2, g, 0.85, 1.0, 240 + i * 45);
      }
      for (let i = 0; i < 4; i++) {
        em.spawnEnemy('fellbeast', i % 2, g, 0.85, 1.0, 160 + i * 85);
      }

      g.sound.muted = true;
      g.advanceTime(0.35);
      g.sound.muted = false;
      g.sound.playBossRoar();
      g._notifyUI();
      g.render();
    });

    await showBanner('V. THE BLACK GATE OF MORDOR', 'Morannon • Witch-lord & Winged Balrog of Udûn', 2.4);

    // 1. Wide 3D panorama (86.0s – 89.8s) of Mount Doom, magma fissures & Flame of Anor solar lances!
    await moveToWorld3D(510, 290, 0.55, 1.2);
    await holdUntilSec(89.8);

    // 2. Smoothly ZOOM IN (~1.24x) on Phase I Witch-lord of Morgul swinging his 3-headed chain flail!
    await easeCamera({ opticalZoom: 1.24, gx: 310, gy: 195, panStrength: 0.58, durSec: 1.05, followType: 'balrog' });
    await holdUntilSec(95.6);

    // 3. Drive Witch-lord below 50% HP around ~96.8s -> DRAMATIC PHASE II WINGED BALROG OF UDÛN ERUPTION!
    for (let f = 0; f < Math.round(3.5 * FPS); f++) {
      const phase = await browser.evaluate(() => {
        const g = window.game;
        g.lives = 20;
        const boss = g.enemies.active.find((e) => e && !e.dead && e.type === 'balrog');
        if (boss && boss.phase === 1) {
          boss.curseCooldown = 99;
          if (boss.hp > boss.maxHp * 0.505) {
            boss.takeDamage(boss.maxHp * 0.022, 'true', { isFire: true }, g);
          } else {
            boss.takeDamage(boss.maxHp * 0.03, 'true', { isFire: true }, g);
          }
        }
        return boss ? boss.phase : 2;
      });
      await stepOneFrame();
      if (phase === 2) {
        markers.balrogPhase2At = getVideoSec();
        break;
      }
    }
    if (!markers.balrogPhase2At) markers.balrogPhase2At = getVideoSec();

    // Ensure Winged Balrog stays heroic through Dark Spell Lock + Final Barrage until the ~117.2s killing blow!
    await browser.evaluate(() => {
      const g = window.game;
      const boss = g.enemies.active.find((e) => e && !e.dead && e.type === 'balrog');
      if (boss) {
        boss.hp = Math.max(boss.hp, boss.maxHp * 0.72);
        boss.curseCooldown = 99;
        if (!boss.__origTakeDamage) {
          boss.__origTakeDamage = boss.takeDamage.bind(boss);
          boss.__holdAlive = true;
          boss.takeDamage = function (amt, type, opts, gm) {
            if (this.__holdAlive && this.hp - amt < this.maxHp * 0.28) {
              const allowed = Math.max(0, this.hp - this.maxHp * 0.28);
              return this.__origTakeDamage(allowed, type, opts, gm);
            }
            return this.__origTakeDamage(amt, type, opts, gm);
          };
        }
      }
    });

    // Admire the colossal 10,060-triangle Winged Balrog of Udûn marching onto the central obsidian plaza (~1.23x zoom)!
    await holdUntilSec(103.0);

    // 4. Ease slightly to frame Balrog + central Tier 3 spires, cast Crimson Dark Spell Lock across t = 105.0s (Keyframe #7!),
    //    then smoothly move cursor & shatter the curse with 3 rapid clicks!
    await easeCamera({ opticalZoom: 1.15, gx: 610, gy: 255, panStrength: 0.48, durSec: 0.90, followType: 'balrog' });
    await holdUntilSec(104.1);

    const cursedTowerInfo = await browser.evaluate(() => {
      const g = window.game;
      g.lives = 20;
      const boss = g.enemies.active.find((e) => e && !e.dead && e.type === 'balrog');
      if (!boss) return null;
      boss.hp = Math.max(boss.hp, boss.maxHp * 0.56);
      boss.transformTimer = 0;
      boss.tryCastBossCurse(g);
      if (boss.cursedTower) {
        boss.cursedTower.stunTimer = 7.5;
        boss.cursedTower.curseClicksRemaining = 3;
        boss.curseCooldown = 99;
        g._notifyUI();
        g.render();
        return { x: boss.cursedTower.x, y: boss.cursedTower.y, id: boss.cursedTower.id };
      }
      return null;
    });

    // Hold across t = 105.0s so Keyframe #7 captures Winged Balrog + Flame of Anor lance + Dark Spell Lock chains (CLICK x3!)
    await holdUntilSec(106.0);

    if (cursedTowerInfo) {
      await moveToWorld3D(cursedTowerInfo.x, cursedTowerInfo.y, 0.38, 2.2);
      await clickHere(0.14, 1);
      await clickHere(0.14, 2);
      await clickHere(0.24, 3); // Shatters Dark Spell Lock chains!
    }

    // 5. Unleash ALL-OUT Final Spell + Mastery Skill Barrage & Slay the Winged Balrog!
    await resetCamera(0.85);
    await browser.evaluate(() => {
      const g = window.game;
      g.lives = 20;
      g.spells.light.cd = 0;
      g.spells.light.remaining = 0;
      g.spells.eagles.cd = 0;
      g.spells.eagles.remaining = 0;
      for (const t of g.towers.towers) {
        if (t) t.skillCd = 0;
      }
      g._notifyUI();
    });

    // Activate Flame of Anor's Secret Fire Nova!
    await moveToWorld3D(605, 360, 0.36, 1.8);
    await clickHere(0.10);
    await moveToElement('#btn-trigger-skill', 0.28);
    await clickHere(0.12);

    // Activate Knights of the Riddermark's Forth Eorlingas!
    await moveToWorld3D(915, 248, 0.36, 1.5);
    await clickHere(0.10);
    await moveToElement('#btn-trigger-skill', 0.28);
    await clickHere(0.12);
    await browser.evaluate(() => window.game.clearSelection());

    // Cast Light of Eärendil & Great Eagles Strike directly on the Winged Balrog!
    const balrogPos1 = await browser.evaluate(() => {
      const b = window.game.enemies.active.find((e) => e && !e.dead && e.type === 'balrog');
      return b ? { x: b.x, y: b.y } : { x: 650, y: 255 };
    });
    await moveToElement('#btn-spell-light', 0.32);
    await clickHere(0.08);
    await moveToWorld3D(balrogPos1.x, balrogPos1.y, 0.34, 0.5);
    await clickHere(0.12);

    const balrogPos2 = await browser.evaluate(() => {
      const b = window.game.enemies.active.find((e) => e && !e.dead && e.type === 'balrog');
      return b ? { x: b.x, y: b.y } : { x: 675, y: 255 };
    });
    await moveToElement('#btn-spell-eagles', 0.32);
    await clickHere(0.08);
    await moveToWorld3D(balrogPos2.x, balrogPos2.y, 0.34, 0.5);
    await clickHere(0.12);

    // Zoom in (~1.20x) for the killing blow on the Winged Balrog, landing Victory right around ~117.2s (~3.8s modal hold)!
    await easeCamera({ opticalZoom: 1.20, gx: balrogPos2.x, gy: balrogPos2.y, panStrength: 0.50, durSec: 0.75, followType: 'balrog' });
    await holdUntilSec(114.8);

    await browser.evaluate(() => {
      const b = window.game.enemies.active.find((e) => e && !e.dead && e.type === 'balrog');
      if (b) b.__holdAlive = false;
    });

    const targetKillEndSec = 117.25;
    const stepsLeftToKill = Math.max(10, Math.round((targetKillEndSec - getVideoSec()) * FPS));
    for (let s = 0; s < stepsLeftToKill; s++) {
      const stateNow = await browser.evaluate(
        ({ stepIdx, totalSteps }) => {
          const g = window.game;
          g.lives = 20;
          const active = g.enemies.active;
          const frac = stepIdx / Math.max(1, totalSteps);
          for (let i = active.length - 1; i >= 0; i--) {
            const e = active[i];
            if (!e || e.dead) continue;
            if (e.type !== 'balrog') {
              e.takeDamage(e.maxHp * 0.12, 'true', { isFire: true }, g);
            } else if (frac > 0.15) {
              const remSteps = Math.max(1, totalSteps - stepIdx);
              const chunk = Math.max(e.maxHp * 0.015, e.hp / Math.max(2, remSteps - 2));
              e.takeDamage(chunk, 'true', { isFire: true }, g);
            }
          }
          return g.state;
        },
        { stepIdx: s, totalSteps: stepsLeftToKill }
      );
      await stepOneFrame();
      if (stateNow === 'victory') {
        markers.victoryAt = getVideoSec();
        break;
      }
    }

    // Guarantee Wave 15 3-Star Victory (20/20 lives) if a sliver of HP remained
    await browser.evaluate(() => {
      const g = window.game;
      g.lives = 20;
      if (g.state !== 'victory') {
        for (const e of g.enemies.active.slice()) {
          if (e && !e.dead) {
            e.__holdAlive = false;
            e.takeDamage(999999, 'true', { isFire: true }, g);
          }
        }
        g.enemies.active.length = 0;
        g.enemies.spawnQueue.length = 0;
        g.enemies.waveInProgress = false;
        g.onWaveCleared(15);
      }
    });
    if (!markers.victoryAt) markers.victoryAt = getVideoSec();
    console.log(`  Wave 15 3-Star Victory triggered @ ${markers.victoryAt.toFixed(2)}s!`);

    // 6. Hold ~3.75s on 3-Star VICTORY FOR THE WEST modal (spanning Keyframe #8 at t = 119.0s -> 121.00s exact!)
    await resetCamera(0.80);
    await hold(0.85); // All 3 Golden Stars pop in!
    await moveToElement('#btn-endless', 0.55);
    await holdUntilSec(119.45); // Keyframe #8 @ 119.0s captures cursor on CONTINUE IN ENDLESS MODE!
    await moveToElement('#btn-victory-replay', 0.65);
    await moveToElement('#btn-endless', 0.65);
    await holdUntilSec(121.0);

    const totalDurationSec = capturedFrames / FPS;
    console.log(`\nSimulation complete: ${capturedFrames} frames (${totalDurationSec.toFixed(2)}s @ ${FPS}fps)`);
    console.log('Chapter timestamps:', JSON.stringify(markers));

    if (browser.runtimeErrors.length > 0) {
      console.warn('Runtime page warnings/errors:', browser.runtimeErrors);
    }

    // Render full 2-minute 44.1 kHz stereo WAV soundtrack + SFX
    const audio = await renderEpicStereoAudioWav(browser, totalDurationSec, markers);
    fs.writeFileSync(tmpWavPath, audio.wavBuffer);
    console.log(
      `Audio rendered: ${(audio.wavBuffer.length / 1024 / 1024).toFixed(2)} MB WAV, ` +
        `${audio.eventCount} SFX events, ${audio.ringSpans} Ring hum spans, ` +
        `peak=${audio.peak.toFixed(3)} (${(20 * Math.log10(Math.max(1e-6, audio.peak))).toFixed(2)} dBFS), ` +
        `rms=${audio.rms.toFixed(4)} (${(20 * Math.log10(Math.max(1e-6, audio.rms))).toFixed(2)} dBFS)`
    );

    if (DRY_RUN_DIR) {
      const dryWav = path.join(DRY_RUN_DIR, 'epic_soundtrack_2min.wav');
      fs.copyFileSync(tmpWavPath, dryWav);
      console.log(`Dry-run complete! 8 PNG keyframes + 2-min WAV written to ${DRY_RUN_DIR}`);
      return;
    }

    // Finish piping JPEG frames & wait for FFmpeg libx264 video encode
    ffmpegProc.stdin.end();
    await ffmpegExitPromise;
    console.log('Video stream encoded cleanly. Muxing 44.1 kHz stereo AAC + faststart moov atomically...');

    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-i', tmpVideoOnlyMp4,
        '-i', tmpWavPath,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2',
        '-shortest',
        '-movflags', '+faststart',
        tmpEpicMuxMp4,
      ],
      { stdio: 'pipe' }
    );

    // Atomic installation onto BOTH /home/artem/td/epic_demo_2min_1080p.mp4 AND /home/artem/td/demo_1080p.mp4
    fs.copyFileSync(tmpEpicMuxMp4, tmpDemoCopyMp4);
    fs.renameSync(tmpEpicMuxMp4, EPIC_OUTPUT_MP4);
    fs.renameSync(tmpDemoCopyMp4, DEMO_OUTPUT_MP4);

    // Strict post-recording verification of streams & untouched index.html
    const probeJson = JSON.parse(
      execFileSync(
        'ffprobe',
        ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', EPIC_OUTPUT_MP4],
        { encoding: 'utf8' }
      )
    );
    const vStream = probeJson.streams.find((s) => s.codec_type === 'video');
    const aStream = probeJson.streams.find((s) => s.codec_type === 'audio');
    const outStat = fs.statSync(EPIC_OUTPUT_MP4);
    const demoStat = fs.statSync(DEMO_OUTPUT_MP4);
    const indexHashAfter = sha256File(INDEX_HTML);

    if (indexHashAfter !== indexHashBefore) {
      throw new Error(`CRITICAL: index.html hash changed!`);
    }
    if (outStat.size !== demoStat.size) {
      throw new Error(`CRITICAL: epic_demo_2min_1080p.mp4 and demo_1080p.mp4 sizes differ!`);
    }

    console.log('\n=== EPIC 2-MINUTE 1080p DEMO READY ===');
    console.log(`Primary:    ${EPIC_OUTPUT_MP4}`);
    console.log(`Live /demo: ${DEMO_OUTPUT_MP4}`);
    console.log(`Size:       ${(outStat.size / 1024 / 1024).toFixed(2)} MB (${outStat.size} bytes)`);
    console.log(`Renderer:   ${liveGlInfo.renderer}`);
    console.log(`Video:      ${vStream.codec_name} ${vStream.width}x${vStream.height} ${vStream.pix_fmt} @ ${vStream.r_frame_rate} fps (nb_frames=${vStream.nb_frames})`);
    console.log(`Audio:      ${aStream.codec_name} ${aStream.sample_rate}Hz ${aStream.channels}ch`);
    console.log(`Duration:   ${Number(probeJson.format.duration).toFixed(2)}s`);
  } finally {
    await browser.close();
    for (const p of [tmpVideoOnlyMp4, tmpWavPath, tmpEpicMuxMp4, tmpDemoCopyMp4]) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {}
    }
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
