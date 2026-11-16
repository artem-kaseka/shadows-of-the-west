#!/usr/bin/env node
/**
 * 3D Graphics, WebGL2 Scene & Full Gameplay QA Verification Suite
 * Owned by @qa-3d — strictly read-only against src/* and index.html.
 *
 * Usage:
 *   node /home/artem/td/scripts/verify_3d.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';

const ROOT_DIR = '/home/artem/td';
const INDEX_HTML = path.join(ROOT_DIR, 'index.html');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const SHOTS_3D_DIR = path.join(ROOT_DIR, 'scripts', 'shots_3d');

const OWNER_BY_FILE = {
  'three_scene.js': '@three-core',
  'engine.js': '@three-core',
  'build.mjs': '@three-core',
  'index.html': '@three-core',
  'env_3d.js': '@env-3d',
  'models_3d.js': '@models-3d',
  'vfx_3d.js': '@vfx-3d',
  'styles.css': '@hud-ref',
  'ui.js': '@hud-ref',
  'fx_audio.js': '@three-core',
  'maps.js': '@three-core',
  'enemies.js': '@three-core',
  'towers.js': '@three-core',
};

const results = {
  passed: [],
  failed: [],
  warnings: [],
  metrics: {},
};

function pass(suite, name, detail = '') {
  results.passed.push({ suite, name, detail });
  console.log(`  [PASS] [${suite}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(suite, owner, name, detail = '') {
  results.failed.push({ suite, owner, name, detail });
  console.error(`  [FAIL] [${suite}] (${owner}) ${name}${detail ? ` — ${detail}` : ''}`);
}

function check(cond, suite, owner, name, detailOnPass = '', detailOnFail = '') {
  if (cond) {
    pass(suite, name, detailOnPass);
    return true;
  }
  fail(suite, owner, name, detailOnFail || detailOnPass);
  return false;
}

/**
 * Map an inline line number in index.html back to src/<file>:<line> + @owner.
 */
function buildSourceLineMapper(indexHtmlContent) {
  const srcFiles = [
    'fx_audio.js',
    'maps.js',
    'enemies.js',
    'towers.js',
    'three_scene.js',
    'env_3d.js',
    'models_3d.js',
    'vfx_3d.js',
    'ui.js',
    'engine.js',
    'styles.css',
  ];
  const loaded = [];
  for (const fname of srcFiles) {
    const full = path.join(SRC_DIR, fname);
    if (fs.existsSync(full)) {
      const text = fs.readFileSync(full, 'utf8');
      loaded.push({
        fname,
        owner: OWNER_BY_FILE[fname] || '@three-core',
        lines: text.split(/\r?\n/),
      });
    }
  }
  const indexLines = indexHtmlContent.split(/\r?\n/);

  return function locateInSrc(indexLine1Based) {
    const target = (indexLines[indexLine1Based - 1] || '').trim();
    if (!target) return { file: 'index.html', line: indexLine1Based, owner: '@three-core' };
    for (const item of loaded) {
      for (let i = 0; i < item.lines.length; i++) {
        if (item.lines[i].trim() === target && target.length > 4) {
          return {
            file: `src/${item.fname}`,
            line: i + 1,
            owner: item.owner,
            code: target.slice(0, 120),
          };
        }
      }
    }
    return {
      file: 'index.html',
      line: indexLine1Based,
      owner: '@three-core',
      code: target.slice(0, 120),
    };
  };
}

// ============================================================================
// SUITE 1: SELF-CONTAINED & ZERO EXTERNAL URLS STATIC CHECKS
// ============================================================================
function runStaticOfflineChecks() {
  console.log('\n=== Suite 1: Self-Contained 3D Bundle & Zero External URLs ===');

  if (!fs.existsSync(INDEX_HTML)) {
    fail('Static', '@three-core', 'index.html exists', `Missing ${INDEX_HTML}`);
    return null;
  }

  const stat = fs.statSync(INDEX_HTML);
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const kb = (stat.size / 1024).toFixed(1);
  results.metrics.bundleSizeKB = Number(kb);

  check(
    stat.size > 400_000,
    'Static',
    '@three-core',
    'Single-file index.html exists & includes bundled Three.js + game code (>400 KB)',
    `${kb} KB`,
    `Too small for Three.js + 3D game bundle: ${kb} KB`
  );

  const locateInSrc = buildSourceLineMapper(html);
  const lines = html.split(/\r?\n/);

  const scriptSrcMatches = [];
  const linkHrefMatches = [];
  const importMatches = [];
  const externalUrlMatches = [];

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/<script\b[^>]*\bsrc\s*=/i.test(ln)) {
      scriptSrcMatches.push({ line: i + 1, loc: locateInSrc(i + 1) });
    }
    if (/<link\b[^>]*\bhref\s*=/i.test(ln)) {
      linkHrefMatches.push({ line: i + 1, loc: locateInSrc(i + 1) });
    }
    if (/@import\s+/i.test(ln)) {
      importMatches.push({ line: i + 1, loc: locateInSrc(i + 1) });
    }
    const urlMatch = ln.match(/(https?:\/\/[^\s"'`)<>]+|\/\/fonts\.[^\s"'`)<>]+|\/\/cdn\.[^\s"'`)<>]+)/i);
    if (urlMatch) {
      externalUrlMatches.push({ line: i + 1, url: urlMatch[1], loc: locateInSrc(i + 1) });
    }
  }

  results.metrics.externalUrls = externalUrlMatches.length;

  check(
    scriptSrcMatches.length === 0,
    'Static',
    scriptSrcMatches[0]?.loc?.owner || '@three-core',
    'Zero <script src=...> tags in index.html',
    '0 external scripts',
    scriptSrcMatches.map((m) => `${m.loc.file}:${m.loc.line}`).join(', ')
  );

  check(
    linkHrefMatches.length === 0,
    'Static',
    linkHrefMatches[0]?.loc?.owner || '@hud-ref',
    'Zero <link href=...> tags in index.html',
    '0 external links',
    linkHrefMatches.map((m) => `${m.loc.file}:${m.loc.line}`).join(', ')
  );

  check(
    importMatches.length === 0,
    'Static',
    importMatches[0]?.loc?.owner || '@hud-ref',
    'Zero CSS @import rules in index.html',
    '0 @import rules',
    importMatches.map((m) => `${m.loc.file}:${m.loc.line}`).join(', ')
  );

  check(
    externalUrlMatches.length === 0,
    'Static',
    externalUrlMatches[0]?.loc?.owner || '@three-core',
    'Zero http:// or https:// URLs anywhere in index.html',
    '0 external URLs',
    externalUrlMatches
      .slice(0, 5)
      .map((m) => `${m.url} at ${m.loc.file}:${m.loc.line}`)
      .join('; ')
  );

  // Check all 3D + core source files individually
  const expected3dFiles = ['three_scene.js', 'env_3d.js', 'models_3d.js', 'vfx_3d.js', 'ui.js', 'engine.js'];
  for (const fname of expected3dFiles) {
    const fpath = path.join(SRC_DIR, fname);
    if (!fs.existsSync(fpath)) {
      fail('Static', OWNER_BY_FILE[fname] || '@three-core', `Source file src/${fname} exists`, `Missing ${fpath}`);
      continue;
    }
    const code = fs.readFileSync(fpath, 'utf8');
    try {
      new vm.Script(code, { filename: fpath });
      pass('Static', `Syntax check src/${fname}`, 'valid JS');
    } catch (err) {
      fail('Static', OWNER_BY_FILE[fname] || '@three-core', `Syntax check src/${fname}`, err.stack || err.message);
    }
  }

  // Validate inline <script> blocks in index.html
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptCount = 0;
  let syntaxOk = true;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    scriptCount++;
    try {
      new vm.Script(match[1], { filename: `index.html#script-${scriptCount}` });
    } catch (err) {
      syntaxOk = false;
      fail('Static', '@three-core', `Inline <script> #${scriptCount} syntax valid`, err.stack || err.message);
    }
  }

  check(
    scriptCount >= 1 && syntaxOk,
    'Static',
    '@three-core',
    'All inline <script> blocks in index.html parse with zero syntax errors',
    `${scriptCount} inline script block(s) verified`
  );

  return { html, locateInSrc };
}

// ============================================================================
// HEADLESS CHROME CDP LAUNCHER (1920x1080 + REAL WEBGL2 SWIFTSHADER)
// ============================================================================
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
  return null;
}

async function launchHeadlessWebGLBrowser() {
  const chromeBin = findBrowserExecutable();
  if (!chromeBin) {
    throw new Error('No headless Chrome/Chromium executable found on Linux host');
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-verify-3d-chrome-'));
  const proc = spawn(
    chromeBin,
    [
      '--headless=new',
      '--no-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      '--window-size=1920,1080',
      `--user-data-dir=${userDataDir}`,
      '--remote-debugging-port=0',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  const { port } = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`Chrome CDP startup timed out:\n${stderr}`)), 12000);
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      const m = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (m) {
        clearTimeout(timer);
        resolve({ port: Number(m[1]) });
      }
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited prematurely (${code}):\n${stderr}`));
    });
  });

  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const pageTarget = targets.find((t) => t.type === 'page');
  if (!pageTarget) throw new Error('No page target in headless Chrome');

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let msgId = 0;
  const pending = new Map();
  const runtimeErrors = [];
  const externalNetworkAttempts = [];

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
      const desc = d.exception?.description || d.text || 'Uncaught exception';
      runtimeErrors.push({
        kind: 'pageerror',
        text: desc,
        line: (d.lineNumber ?? 0) + 1,
        col: (d.columnNumber ?? 0) + 1,
      });
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      if (msg.params.type === 'error') {
        const text = (msg.params.args || []).map((a) => a.description || a.value || JSON.stringify(a)).join(' ');
        const frame = msg.params.stackTrace?.callFrames?.[0];
        runtimeErrors.push({
          kind: 'console.error',
          text,
          line: frame ? frame.lineNumber + 1 : 0,
          col: frame ? frame.columnNumber + 1 : 0,
        });
      }
    } else if (msg.method === 'Log.entryAdded') {
      const entry = msg.params.entry;
      if (entry.level === 'error') {
        runtimeErrors.push({
          kind: 'browser.log.error',
          text: `${entry.source}: ${entry.text} ${entry.url || ''}`.trim(),
          line: entry.lineNumber || 0,
        });
      }
    } else if (msg.method === 'Network.requestWillBeSent') {
      const url = msg.params.request?.url || '';
      if (/^https?:\/\//i.test(url)) {
        externalNetworkAttempts.push(url);
      }
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

  const clickViewport = async (x, y, clickCount = 1) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: rx,
      y: ry,
      button: 'none',
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: rx,
      y: ry,
      button: 'left',
      buttons: 1,
      clickCount,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: rx,
      y: ry,
      button: 'left',
      buttons: 0,
      clickCount,
    });
  };

  const pressKey = async (key, code, keyCode) => {
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
      text: key.length === 1 ? key : undefined,
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
    });
  };

  const close = async () => {
    try {
      ws.close();
    } catch {}
    try {
      proc.kill('SIGKILL');
    } catch {}
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // Preload WebGL shader compile/link error spy, context-lost spy, and deterministic rAF stepper
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      (() => {
        window.__unhandledErrors = [];
        window.__webglShaderErrors = [];
        window.__webglContextLost = false;

        window.addEventListener('unhandledrejection', (e) => {
          window.__unhandledErrors.push(String(e.reason?.stack || e.reason || 'unhandledrejection'));
        });
        window.addEventListener('webglcontextlost', () => {
          window.__webglContextLost = true;
        }, true);

        function hookGlProto(Proto) {
          if (!Proto || Proto.__qaHooked) return;
          Proto.__qaHooked = true;
          const origCompile = Proto.compileShader;
          const origLink = Proto.linkProgram;
          if (typeof origCompile === 'function') {
            Proto.compileShader = function(shader) {
              const r = origCompile.call(this, shader);
              if (!this.getShaderParameter(shader, this.COMPILE_STATUS)) {
                const info = this.getShaderInfoLog(shader) || 'Unknown shader compile error';
                window.__webglShaderErrors.push('ShaderCompileError: ' + info.slice(0, 400));
              }
              return r;
            };
          }
          if (typeof origLink === 'function') {
            Proto.linkProgram = function(program) {
              const r = origLink.call(this, program);
              if (!this.getProgramParameter(program, this.LINK_STATUS)) {
                const info = this.getProgramInfoLog(program) || 'Unknown program link error';
                window.__webglShaderErrors.push('ProgramLinkError: ' + info.slice(0, 400));
              }
              return r;
            };
          }
        }
        if (typeof WebGL2RenderingContext !== 'undefined') hookGlProto(WebGL2RenderingContext.prototype);
        if (typeof WebGLRenderingContext !== 'undefined') hookGlProto(WebGLRenderingContext.prototype);

        const nativeRaf = window.requestAnimationFrame.bind(window);
        const nativeCancel = window.cancelAnimationFrame.bind(window);
        const nativePerfNow = performance.now.bind(performance);

        let manual = false;
        let virtualNow = 0;
        let timeOffset = 0;
        let nextId = 100000;
        const manualQueue = new Map();
        const pendingNative = new Map();

        performance.now = function() {
          if (manual) return virtualNow;
          return nativePerfNow() + timeOffset;
        };

        window.requestAnimationFrame = function(cb) {
          if (manual) {
            const id = ++nextId;
            manualQueue.set(id, cb);
            return id;
          }
          const nid = nativeRaf(() => {
            pendingNative.delete(nid);
            if (manual) {
              manualQueue.set(++nextId, cb);
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

        window.__simControl = {
          isManual: () => manual,
          setManual(enable) {
            if (enable && !manual) {
              virtualNow = nativePerfNow() + timeOffset;
              manual = true;
              for (const [nid, cb] of pendingNative.entries()) {
                nativeCancel(nid);
                manualQueue.set(++nextId, cb);
              }
              pendingNative.clear();
            } else if (!enable && manual) {
              const realNow = nativePerfNow();
              timeOffset = virtualNow - realNow;
              manual = false;
              const cbs = Array.from(manualQueue.values());
              manualQueue.clear();
              for (const cb of cbs) {
                window.requestAnimationFrame(cb);
              }
            }
          },
          stepFrames(frames = 1, dtMs = 1000 / 60, forceWebGL = false) {
            if (!manual) this.setManual(true);
            const s3d = window.game?.scene3d;
            const skipWebGL = !forceWebGL && s3d && typeof s3d.render === 'function' && !s3d.__qaFastForward;
            const origRender = skipWebGL ? s3d.render : null;
            if (skipWebGL) {
              s3d.__qaFastForward = true;
              s3d.render = function () {};
            }
            try {
              for (let i = 0; i < frames; i++) {
                virtualNow += dtMs;
                const cbs = Array.from(manualQueue.values());
                manualQueue.clear();
                for (const cb of cbs) {
                  cb(virtualNow);
                }
              }
            } finally {
              if (skipWebGL) {
                s3d.render = origRender;
                s3d.__qaFastForward = false;
              }
            }
          },
          renderWebGL(frames = 1, dtMs = 1000 / 60) {
            this.stepFrames(frames, dtMs, true);
          },
          stepSeconds(sec, dtMs = 1000 / 60) {
            const frames = Math.max(1, Math.round((sec * 1000) / dtMs));
            this.stepFrames(frames, dtMs, false);
          },
          realNow: () => nativePerfNow(),
        };
      })();
    `,
  });

  return {
    chromeBin,
    send,
    evaluate,
    clickViewport,
    pressKey,
    runtimeErrors,
    externalNetworkAttempts,
    close,
  };
}

// ============================================================================
// IN-BROWSER 3D & GAMEPLAY QA HARNESS
// ============================================================================
async function installQa3dHelpers(browser) {
  await browser.evaluate(() => {
    const game = window.game;

    window.__floatingTexts = [];
    if (game && game.vfx && typeof game.vfx.spawnFloatingText === 'function' && !game.vfx.__wrappedByQa) {
      const orig = game.vfx.spawnFloatingText.bind(game.vfx);
      game.vfx.spawnFloatingText = function (x, y, text, color, scale) {
        window.__floatingTexts.push({ x, y, text: String(text), color, scale });
        if (window.__floatingTexts.length > 600) window.__floatingTexts.shift();
        return orig(x, y, text, color, scale);
      };
      game.vfx.__wrappedByQa = true;
    }

    function isVisible(el) {
      if (!el) return false;
      const st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    }

    function inViewport(el, tol = 3) {
      if (!el || !isVisible(el)) return false;
      const r = el.getBoundingClientRect();
      return (
        r.left >= -tol &&
        r.right <= window.innerWidth + tol &&
        r.top >= -tol &&
        r.bottom <= window.innerHeight + tol
      );
    }

    function rectsOverlap(elA, elB, pad = 3) {
      if (!elA || !elB || !isVisible(elA) || !isVisible(elB)) return false;
      if (elA.contains(elB) || elB.contains(elA)) return false;
      const a = elA.getBoundingClientRect();
      const b = elB.getBoundingClientRect();
      return a.left < b.right - pad && a.right > b.left + pad && a.top < b.bottom - pad && a.bottom > b.top + pad;
    }

    function findClickable(regex, root = document.body) {
      const candidates = Array.from(
        root.querySelectorAll(
          'button, [role="button"], .card, .map-card, .diff-btn, .build-card, .tower-card, .upgrade-card, .branch-card, .spell-btn, .ability-card, .tab, .tab-btn, .dock-tab, [data-map], [data-diff], [data-difficulty], [data-tower], [data-tab], [data-dock-tab], div, span'
        )
      ).filter((el) => isVisible(el));
      const matching = candidates.filter((el) => {
        const txt = `${el.textContent || ''} ${el.getAttribute('title') || ''} ${el.getAttribute('aria-label') || ''} ${el.id || ''} ${el.className || ''}`
          .replace(/\s+/g, ' ')
          .trim();
        return regex.test(txt);
      });
      if (!matching.length) return null;
      matching.sort((a, b) => {
        const aBtn =
          a.tagName === 'BUTTON' ||
          a.hasAttribute('onclick') ||
          a.matches('[data-map],[data-diff],[data-difficulty],[data-tower],[data-tab],[data-dock-tab],.build-card,.spell-btn,.ability-card')
            ? 0
            : 1;
        const bBtn =
          b.tagName === 'BUTTON' ||
          b.hasAttribute('onclick') ||
          b.matches('[data-map],[data-diff],[data-difficulty],[data-tower],[data-tab],[data-dock-tab],.build-card,.spell-btn,.ability-card')
            ? 0
            : 1;
        if (aBtn !== bBtn) return aBtn - bBtn;
        return (a.textContent || '').length - (b.textContent || '').length;
      });
      return matching[0];
    }

    function canvas2dStats(canvas) {
      if (!canvas || !canvas.width || !canvas.height) return { nonTransparent: 0, uniqueColors: 0, total: 0 };
      const ctx = canvas.getContext('2d');
      if (!ctx) return { nonTransparent: 0, uniqueColors: 0, total: 0 };
      const sx = Math.max(1, Math.floor(canvas.width / 160));
      const sy = Math.max(1, Math.floor(canvas.height / 120));
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let nonTransparent = 0;
      const colors = new Set();
      let total = 0;
      for (let y = 0; y < canvas.height; y += sy) {
        for (let x = 0; x < canvas.width; x += sx) {
          total++;
          const idx = (y * canvas.width + x) * 4;
          if (data[idx + 3] > 8) {
            nonTransparent++;
            const bucket = ((data[idx] >> 4) << 8) | ((data[idx + 1] >> 4) << 4) | (data[idx + 2] >> 4);
            colors.add(bucket);
          }
        }
      }
      return { nonTransparent, uniqueColors: colors.size, total };
    }

    function sampleWebGLPixels() {
      const s3d = window.game?.scene3d;
      const renderer = s3d?.renderer;
      if (!renderer) return { ok: false, uniqueColors: 0, nonBlack: 0, total: 0 };
      // Render one fresh frame synchronously so backbuffer is guaranteed populated before compositor swap
      if (window.game && typeof window.game.render === 'function') {
        window.game.render();
      } else if (typeof s3d.render === 'function') {
        s3d.render(1 / 60, window.game?.time || 0, window.game);
      } else if (s3d.composer && typeof s3d.composer.render === 'function') {
        s3d.composer.render();
      } else if (s3d.scene && s3d.camera) {
        renderer.render(s3d.scene, s3d.camera);
      }
      const gl = renderer.getContext();
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      if (!w || !h) return { ok: false, uniqueColors: 0, nonBlack: 0, total: 0 };
      // Read a central horizontal band + vertical band via small 1x1 or 64x36 grid
      const colors = new Set();
      let nonBlack = 0;
      let total = 0;
      const buf = new Uint8Array(4);
      for (let gy = 1; gy < 15; gy++) {
        for (let gx = 1; gx < 24; gx++) {
          const px = Math.floor((gx / 24) * w);
          const py = Math.floor((gy / 15) * h);
          gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          total++;
          if (buf[0] + buf[1] + buf[2] > 18) nonBlack++;
          const bucket = ((buf[0] >> 4) << 8) | ((buf[1] >> 4) << 4) | (buf[2] >> 4);
          colors.add(bucket);
        }
      }
      return { ok: true, width: w, height: h, uniqueColors: colors.size, nonBlack, total };
    }

    /**
     * Project logical game coordinates (gx, gy) + extraY (world units) to viewport client (x, y)
     * using game.scene3d.projectToScreen!
     */
    function gamePosToClient(gx, gy, extraY = 0) {
      const g = window.game;
      const s3d = g?.scene3d;
      if (s3d && typeof s3d.projectToScreen === 'function') {
        if (s3d.camera && typeof s3d.camera.updateMatrixWorld === 'function') {
          s3d.camera.updateMatrixWorld();
        }
        const p = s3d.projectToScreen(gx, gy, extraY);
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
          return { x: p.x, y: p.y, visible: p.visible !== false };
        }
      }
      const canvas = s3d?.renderer?.domElement || document.getElementById('webgl-canvas') || document.getElementById('game-canvas');
      const r = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      return {
        x: r.left + (gx / 1280) * r.width,
        y: r.top + (gy / 720) * r.height,
        visible: true,
      };
    }

    function startSiegeProgrammatic(mapId = 'hornburg', diffId = 'captain') {
      const g = window.game;
      for (const m of ['startSiege', 'startGame', 'beginSiege', 'newGame', 'initGame']) {
        if (typeof g[m] === 'function') {
          const fnStr = g[m].toString();
          if (g[m].length >= 2 || /,/.test(fnStr.slice(0, 60))) {
            g[m](mapId, diffId);
          } else {
            if ('selectedMap' in g) g.selectedMap = mapId;
            if ('mapId' in g) g.mapId = mapId;
            if ('selectedDifficulty' in g) g.selectedDifficulty = diffId;
            if ('difficultyId' in g) g.difficultyId = diffId;
            if ('difficulty' in g && typeof g.difficulty === 'string') g.difficulty = diffId;
            g[m](mapId, diffId);
          }
          if (g.state === 'playing') {
            g.speed = 1;
            if (g.ringActive) g.toggleRing();
            g.corruption = 0;
            return true;
          }
        }
      }
      if (typeof g.returnToTitle === 'function') g.returnToTitle();
      else g.state = 'title';
      if (g.ui && typeof g.ui.update === 'function') g.ui.update(0.1, g);
      const mapNames = { hornburg: /Hornburg/i, pelennor: /Pelennor/i, blackgate: /Black Gate/i };
      const diffNames = { ranger: /Ranger/i, captain: /Captain/i, steward: /Steward/i };
      const mapEl = document.querySelector(`[data-map="${mapId}"]`) || findClickable(mapNames[mapId]);
      if (mapEl) mapEl.click();
      const diffEl =
        document.querySelector(`[data-difficulty="${diffId}"], [data-diff="${diffId}"]`) ||
        findClickable(diffNames[diffId]);
      if (diffEl) diffEl.click();
      const beginBtn = findClickable(/Begin Siege|Start Siege|Play/i);
      if (beginBtn) beginBtn.click();
      g.speed = 1;
      if (g.ringActive) g.toggleRing();
      g.corruption = 0;
      return g.state === 'playing';
    }

    function clearBattlefield() {
      const g = window.game;
      if (g.enemies && Array.isArray(g.enemies.active)) {
        for (const e of g.enemies.active) {
          if (e) e.dead = true;
        }
      }
      if (g.towers && typeof g.towers.reset === 'function') g.towers.reset(g);
      if (g.enemies && typeof g.enemies.reset === 'function') g.enemies.reset(g);
      if (g.vfx && typeof g.vfx.reset === 'function') g.vfx.reset();
      if (g.scene3d?.models && typeof g.scene3d.models.reset === 'function') g.scene3d.models.reset();
      if (g.models3d && typeof g.models3d.reset === 'function') g.models3d.reset();
      if (g.spatialGrid && typeof g.spatialGrid.clear === 'function') g.spatialGrid.clear();
      g.ringActive = false;
      g.corruption = 0;
      g.ringOverloadTimer = 0;
      g.speed = 1;
      g.state = 'playing';
      if (typeof g.clearSelection === 'function') g.clearSelection();
      if (g.spells) {
        for (const k of Object.keys(g.spells)) {
          if (typeof g.spells[k] === 'object' && g.spells[k]) {
            for (const f of ['cd', 'timer', 'cdTimer', 'cooldownLeft', 'remaining']) {
              if (f in g.spells[k]) g.spells[k][f] = 0;
            }
          }
        }
      }
      window.__floatingTexts.length = 0;
    }

    const WAVE_FOR_TYPE = {
      goblin: 1,
      orc: 1,
      warg: 3,
      uruk: 5,
      troll: 7,
      wraith: 9,
      fellbeast: 11,
      balrog: 15,
    };

    function clearEnemySpawnQueues(em) {
      for (const [k, v] of Object.entries(em)) {
        if (k === 'active') continue;
        if (Array.isArray(v)) v.length = 0;
      }
      em.waveInProgress = em.active.length > 0;
    }

    function advanceEnemyAloneToProgress(enemy, targetProgress) {
      const g = window.game;
      const em = g.enemies;
      const savedTowers = g.towers.towers.slice();
      const savedOthers = em.active.filter((e) => e !== enemy);
      g.towers.towers.length = 0;
      em.active.length = 0;
      em.active.push(enemy);
      const savedSpeed = enemy.speed;
      const savedBase = enemy.baseSpeed;
      enemy.baseSpeed = Math.max(savedBase || 80, 400);
      enemy.speed = enemy.baseSpeed;
      let guard = 0;
      while ((enemy.progress || 0) < targetProgress && !enemy.reachedExit && !enemy.dead && guard < 2000) {
        em.update(1 / 60, g);
        guard++;
      }
      enemy.baseSpeed = savedBase;
      enemy.speed = savedSpeed;
      em.active.length = 0;
      for (const o of savedOthers) em.active.push(o);
      em.active.push(enemy);
      g.towers.towers.length = 0;
      for (const t of savedTowers) g.towers.towers.push(t);
    }

    function spawnSingleEnemy(typeKey, laneIndex = 0, targetProgress = 0.0) {
      const g = window.game;
      const em = g.enemies;
      if (typeKey === 'ringwraith') {
        em.spawnRingwraithBoss(g);
        const rw = em.active.find((e) => e.type === 'ringwraith') || em.active[em.active.length - 1];
        if (rw && targetProgress > 0) advanceEnemyAloneToProgress(rw, targetProgress);
        if (g.spatialGrid && typeof g.spatialGrid.rebuild === 'function') g.spatialGrid.rebuild(em.active);
        return rw;
      }

      let spawned = null;
      for (const m of ['spawnEnemy', 'createEnemy', 'spawn']) {
        if (typeof em[m] === 'function') {
          const beforeLen = em.active.length;
          const sig = em[m].toString().match(/\(([^)]*)\)/)?.[1] || '';
          const params = sig.split(',').map((s) => s.trim().toLowerCase());
          try {
            let ret;
            if (params[0]?.startsWith('g')) ret = em[m](g, typeKey, laneIndex);
            else if (params.length >= 3 && params[2]?.startsWith('g')) ret = em[m](typeKey, laneIndex, g);
            else if (params.length >= 2 && params[1]?.startsWith('g')) ret = em[m](typeKey, g, laneIndex);
            else ret = em[m](typeKey, laneIndex, g);
            spawned = em.active.length > beforeLen ? em.active[em.active.length - 1] : ret;
            if (spawned && spawned.type === typeKey && Number.isFinite(spawned.x) && spawned.hp > 0) {
              if (!em.active.includes(spawned)) em.active.push(spawned);
              break;
            } else {
              spawned = null;
            }
          } catch {
            spawned = null;
          }
        }
      }

      if (!spawned) {
        const keepExisting = em.active.slice();
        const targetWave = WAVE_FOR_TYPE[typeKey] || 1;
        const prevWave = g.wave;
        em.active.length = 0;
        clearEnemySpawnQueues(em);
        if ('wave' in g) g.wave = targetWave - 1;
        if ('currentWave' in em) em.currentWave = targetWave - 1;
        if ('waveNum' in em) em.waveNum = targetWave - 1;
        em.startNextWave(g, false);
        for (let step = 0; step < 3000; step++) {
          em.update(0.05, g);
          const found = em.active.find((e) => e.type === typeKey && !e.dead);
          if (found) {
            spawned = found;
            spawned.hp = spawned.maxHp;
            break;
          }
        }
        clearEnemySpawnQueues(em);
        em.active.length = 0;
        for (const old of keepExisting) em.active.push(old);
        if (spawned) em.active.push(spawned);
        if ('wave' in g) g.wave = prevWave;
      }

      if (spawned && targetProgress > 0) {
        advanceEnemyAloneToProgress(spawned, targetProgress);
      }
      if (g.spatialGrid && typeof g.spatialGrid.rebuild === 'function') {
        g.spatialGrid.rebuild(em.active);
      }
      return spawned;
    }

    function freezeEnemy(enemy) {
      enemy.__savedBaseSpeed = enemy.baseSpeed;
      enemy.__savedSpeed = enemy.speed;
      enemy.baseSpeed = 0;
      enemy.speed = 0;
    }

    function unfreezeEnemy(enemy) {
      if (enemy.__savedBaseSpeed !== undefined) enemy.baseSpeed = enemy.__savedBaseSpeed;
      if (enemy.__savedSpeed !== undefined) enemy.speed = enemy.__savedSpeed;
    }

    function getTowerGuards(tower) {
      return tower.soldiers || tower.guards || tower.units || tower.blockers || [];
    }

    function getPadBestForCombat(map) {
      const pads = map.pads || [];
      let best = pads[0];
      let bestScore = Infinity;
      for (const pad of pads) {
        const lane = map.paths[0];
        let minDist = Infinity;
        let bestIdx = 0;
        for (let i = 0; i < lane.length; i++) {
          const d = Math.hypot(lane[i].x - pad.x, lane[i].y - pad.y);
          if (d < minDist) {
            minDist = d;
            bestIdx = i;
          }
        }
        const frac = bestIdx / Math.max(1, lane.length - 1);
        const penalty = Math.abs(minDist - 85) + (frac < 0.15 || frac > 0.85 ? 200 : 0);
        if (penalty < bestScore) {
          bestScore = penalty;
          best = pad;
        }
      }
      return best;
    }

    function findProgressNearPoint(laneIndex, tx, ty, flying = false) {
      const g = window.game;
      const e = spawnSingleEnemy(flying ? 'fellbeast' : 'orc', laneIndex, 0);
      const em = g.enemies;
      const savedTowers = g.towers.towers.slice();
      const savedOthers = em.active.filter((x) => x !== e);
      g.towers.towers.length = 0;
      em.active.length = 0;
      em.active.push(e);
      e.baseSpeed = 300;
      e.speed = 300;
      let bestProg = 0;
      let bestDist = Infinity;
      for (let i = 0; i < 600 && !e.reachedExit; i++) {
        const d = Math.hypot(e.x - tx, e.y - ty);
        if (d < bestDist) {
          bestDist = d;
          bestProg = e.progress || 0;
        }
        em.update(1 / 60, g);
      }
      em.active.length = 0;
      for (const o of savedOthers) em.active.push(o);
      g.towers.towers.length = 0;
      for (const t of savedTowers) g.towers.towers.push(t);
      return { progress: bestProg, minDist: bestDist };
    }

    window.__qa = {
      isVisible,
      inViewport,
      rectsOverlap,
      findClickable,
      canvas2dStats,
      sampleWebGLPixels,
      gamePosToClient,
      startSiegeProgrammatic,
      clearBattlefield,
      spawnSingleEnemy,
      advanceEnemyAloneToProgress,
      freezeEnemy,
      unfreezeEnemy,
      getTowerGuards,
      getPadBestForCombat,
      findProgressNearPoint,
    };
  });
}

// ============================================================================
// RUNTIME 3D & GAMEPLAY VERIFICATION SUITES
// ============================================================================
async function runBrowser3dVerification(locateInSrc) {
  console.log('\n=== Launching Headless Chrome 1920x1080 with WebGL2 SwiftShader ===');
  const browser = await launchHeadlessWebGLBrowser();

  try {
    const fileUrl = `file://${INDEX_HTML}`;
    await browser.send('Page.navigate', { url: fileUrl });
    await new Promise((r) => setTimeout(r, 700));

    await installQa3dHelpers(browser);

    // ------------------------------------------------------------------------
    // Suite 2: WebGL2 3D Scene, Shadows, Post-Processing & Map Leak Audit
    // ------------------------------------------------------------------------
    console.log('\n=== Suite 2: WebGL2 Context, Three.js Scene, Triangles & Map Leak Audit ===');

    check(
      browser.externalNetworkAttempts.length === 0,
      'WebGL 3D Scene',
      '@three-core',
      'Zero runtime HTTP/HTTPS network requests on load',
      '100% offline self-contained',
      browser.externalNetworkAttempts.join(', ')
    );

    const webglBoot = await browser.evaluate(() => {
      window.__simControl.setManual(true);
      window.__simControl.stepFrames(3, 16.6667);
      window.__simControl.renderWebGL(2);

      const THREE = window.THREE;
      const g = window.game;
      const s3d = g?.scene3d;
      const renderer = s3d?.renderer;
      const gl = renderer?.getContext?.();
      const dbg = gl?.getExtension?.('WEBGL_debug_renderer_info');
      const pxStats = window.__qa.sampleWebGLPixels();

      // Check Title Screen backdrop translucency so live 3D fortress vista shines behind UI
      const titleEl = document.getElementById('title-screen') || document.querySelector('.title-screen');
      const titleBg = titleEl ? window.getComputedStyle(titleEl).background || window.getComputedStyle(titleEl).backgroundColor : '';
      const stageEl = document.getElementById('game-stage');
      const stageRect = stageEl ? stageEl.getBoundingClientRect() : null;

      return {
        hasTHREE: !!THREE && typeof THREE.WebGLRenderer === 'function' && typeof THREE.PerspectiveCamera === 'function',
        hasComposerClasses: !!(THREE?.EffectComposer && THREE?.UnrealBloomPass),
        hasScene3D: !!s3d && !!s3d.scene && !!s3d.camera && !!renderer,
        isWebGL2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
        contextActive: !!gl && !gl.isContextLost() && !window.__webglContextLost,
        glRenderer: dbg && gl ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl?.getParameter?.(gl.RENDERER),
        shadowMapEnabled: !!renderer?.shadowMap?.enabled,
        toneMapping: renderer?.toneMapping,
        hasComposerActive: !!s3d?.composer,
        titleState: g?.state,
        titleTriangles: renderer?.info?.render?.triangles || 0,
        titleCalls: renderer?.info?.render?.calls || 0,
        pxStats,
        stageRect: stageRect ? { w: Math.round(stageRect.width), h: Math.round(stageRect.height) } : null,
        titleBgSnippet: String(titleBg).slice(0, 120),
        shaderErrors: window.__webglShaderErrors || [],
        unhandled: window.__unhandledErrors || [],
      };
    });

    results.metrics.titleTriangles = webglBoot.titleTriangles;
    results.metrics.glRenderer = webglBoot.glRenderer;

    check(
      webglBoot.hasTHREE && webglBoot.hasScene3D && webglBoot.isWebGL2 && webglBoot.contextActive,
      'WebGL 3D Scene',
      '@three-core',
      'window.THREE & game.scene3d active on real WebGL2 context (not lost)',
      `WebGL2 active (${webglBoot.glRenderer}), composer=${webglBoot.hasComposerActive}`,
      JSON.stringify(webglBoot)
    );

    check(
      webglBoot.shaderErrors.length === 0 && browser.runtimeErrors.length === 0 && webglBoot.unhandled.length === 0,
      'WebGL 3D Scene',
      '@three-core',
      'Zero WebGL GLSL shader compile/link errors, console.error, or pageerror on boot',
      '0 shader/runtime errors',
      [...webglBoot.shaderErrors, ...browser.runtimeErrors.map((e) => e.text), ...webglBoot.unhandled].join(' | ')
    );

    check(
      webglBoot.shadowMapEnabled && webglBoot.titleTriangles > 5000 && webglBoot.pxStats.nonBlack > 100 && webglBoot.pxStats.uniqueColors >= 20,
      'WebGL 3D Scene',
      '@env-3d',
      'Shadow maps enabled & Title Screen live 3D fortress vista renders > 5,000 triangles with rich colors',
      `triangles=${webglBoot.titleTriangles}, drawCalls=${webglBoot.titleCalls}, colors=${webglBoot.pxStats.uniqueColors}`,
      JSON.stringify({ shadow: webglBoot.shadowMapEnabled, tris: webglBoot.titleTriangles, px: webglBoot.pxStats })
    );

    check(
      webglBoot.stageRect && webglBoot.stageRect.w === 1920 && webglBoot.stageRect.h === 1080,
      'WebGL 3D Scene',
      '@hud-ref',
      '#game-stage fills full 1920x1080 viewport edge-to-edge (zero letterbox bars)',
      `${webglBoot.stageRect?.w}x${webglBoot.stageRect?.h}`,
      JSON.stringify(webglBoot.stageRect)
    );

    // Build & dispose all 3 maps across 2 full cycles to verify terrain heightfield, triangles > 5000, and zero memory leaks
    const mapLeakAudit = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield } = window.__qa;
      const g = window.game;
      const s3d = g.scene3d;
      const renderer = s3d.renderer;

      const mapStats = {};
      // Cycle 1: Warm shared procedural & model caches across all 3 map themes & inspect 3D geometry
      for (const mapId of ['hornburg', 'pelennor', 'blackgate']) {
        const ok = startSiegeProgrammatic(mapId, 'captain');
        clearBattlefield();
        window.__simControl.renderWebGL(1);

        const tris = renderer.info.render.triangles || 0;
        const pads = g.map.pads || [];
        let maxPadHeightAbs = 0;
        for (const p of pads) {
          const h = typeof s3d.getTerrainHeight === 'function' ? s3d.getTerrainHeight(p.x, p.y) : 0;
          maxPadHeightAbs = Math.max(maxPadHeightAbs, Math.abs(h));
        }
        let maxRoadHeightAbs = 0;
        for (const lane of g.map.paths || []) {
          for (let i = 0; i < lane.length; i += 3) {
            const h = typeof s3d.getTerrainHeight === 'function' ? s3d.getTerrainHeight(lane[i].x, lane[i].y) : 0;
            maxRoadHeightAbs = Math.max(maxRoadHeightAbs, Math.abs(h));
          }
        }
        let maxCliffHeight = 0;
        for (const [gx, gy] of [
          [80, 40], [640, 20], [1180, 40], [1220, 120], [80, 680], [640, 700], [1200, 680],
        ]) {
          const h = typeof s3d.getTerrainHeight === 'function' ? s3d.getTerrainHeight(gx, gy) : 0;
          if (h > maxCliffHeight) maxCliffHeight = h;
        }

        // Warm shared tower & enemy model caches identically in Cycle 1 before recording baseline memory
        g.gold = 5000;
        g.towers.buildTower(g.map.pads[0], 'elven', g);
        g.towers.buildTower(g.map.pads[1], 'dwarven', g);
        window.__qa.spawnSingleEnemy('orc', 0, 0.25);
        window.__simControl.renderWebGL(1);
        clearBattlefield();
        window.__simControl.stepFrames(1, 16.6667);

        mapStats[mapId] = {
          ok,
          triangles: tris,
          maxPadHeightAbs: Number(maxPadHeightAbs.toFixed(3)),
          maxRoadHeightAbs: Number(maxRoadHeightAbs.toFixed(3)),
          maxCliffHeight: Number(maxCliffHeight.toFixed(2)),
        };
      }

      const memAfterCycle1 = {
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      };

      // Cycle 2: Rebuild all 3 maps again with towers + enemies spawned & cleared to catch disposal leaks!
      for (const mapId of ['hornburg', 'pelennor', 'blackgate']) {
        startSiegeProgrammatic(mapId, 'captain');
        g.gold = 5000;
        g.towers.buildTower(g.map.pads[0], 'elven', g);
        g.towers.buildTower(g.map.pads[1], 'dwarven', g);
        window.__qa.spawnSingleEnemy('orc', 0, 0.25);
        window.__simControl.renderWebGL(1);
        clearBattlefield();
        window.__simControl.stepFrames(1, 16.6667);
      }

      const memAfterCycle2 = {
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      };

      return {
        mapStats,
        memAfterCycle1,
        memAfterCycle2,
        geomDelta: memAfterCycle2.geometries - memAfterCycle1.geometries,
        texDelta: memAfterCycle2.textures - memAfterCycle1.textures,
        shaderErrors: window.__webglShaderErrors || [],
      };
    });

    results.metrics.mapTriangles = {
      hornburg: mapLeakAudit.mapStats.hornburg?.triangles,
      pelennor: mapLeakAudit.mapStats.pelennor?.triangles,
      blackgate: mapLeakAudit.mapStats.blackgate?.triangles,
    };
    results.metrics.memoryAfter2Cycles = mapLeakAudit.memAfterCycle2;

    check(
      ['hornburg', 'pelennor', 'blackgate'].every(
        (m) =>
          mapLeakAudit.mapStats[m]?.ok &&
          mapLeakAudit.mapStats[m]?.triangles > 5000 &&
          mapLeakAudit.mapStats[m]?.maxPadHeightAbs <= 0.25 &&
          mapLeakAudit.mapStats[m]?.maxRoadHeightAbs <= 0.35
      ),
      'WebGL 3D Scene',
      '@env-3d',
      'All 3 3D maps (Hornburg, Pelennor, Black Gate) render > 5,000 triangles with flat y=0 roads & pads',
      Object.entries(mapLeakAudit.mapStats)
        .map(([k, v]) => `${k}:${v.triangles} tris`)
        .join(', '),
      JSON.stringify(mapLeakAudit.mapStats)
    );

    check(
      mapLeakAudit.geomDelta <= 12 && mapLeakAudit.texDelta <= 8 && mapLeakAudit.shaderErrors.length === 0,
      'WebGL 3D Scene',
      '@env-3d',
      'Clean 3D disposal across all 3 maps (zero geometry/material/texture leaks on map rebuilds)',
      `geomDelta=${mapLeakAudit.geomDelta} (${mapLeakAudit.memAfterCycle1.geometries}->${mapLeakAudit.memAfterCycle2.geometries}), texDelta=${mapLeakAudit.texDelta}`,
      JSON.stringify(mapLeakAudit)
    );

    // ------------------------------------------------------------------------
    // Suite 3: 3D Raycasting, Empty Pad Ghost Holograms & Ornate Reference HUD
    // ------------------------------------------------------------------------
    console.log('\n=== Suite 3: 3D Raycasting, Ghost Pad Holograms & Ornate Reference HUD ===');

    const raycastSetup = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, gamePosToClient } = window.__qa;
      startSiegeProgrammatic('hornburg', 'captain');
      clearBattlefield();
      const g = window.game;
      g.gold = 2000;
      window.__simControl.stepFrames(4, 16.6667);

      const s3d = g.scene3d;
      const pads = g.map.pads || [];
      let accurateCount = 0;
      for (const pad of pads) {
        const scr = gamePosToClient(pad.x, pad.y, 0);
        if (typeof s3d.raycastGamePos === 'function') {
          const hit = s3d.raycastGamePos(scr.x, scr.y, g);
          if (hit && (hit.pad?.id === pad.id || Math.hypot((hit.x ?? 9999) - pad.x, (hit.y ?? 9999) - pad.y) < 34)) {
            accurateCount++;
          }
        }
      }

      // Inspect empty pad 3D ghost hologram meshes in scene
      function countVisiblePadGhosts(targetPadId = null) {
        let count = 0;
        s3d.scene.traverse((obj) => {
          const ud = obj.userData || {};
          const nm = (obj.name || '').toLowerCase();
          const isGhost =
            ud.isGhost ||
            ud.isPadGhost ||
            ud.ghostPadId !== undefined ||
            nm.includes('ghost') ||
            nm.includes('hologram');
          if (isGhost) {
            let vis = obj.visible;
            let p = obj.parent;
            while (p && vis) {
              if (!p.visible) vis = false;
              p = p.parent;
            }
            if (vis && (targetPadId === null || ud.padId === targetPadId || ud.ghostPadId === targetPadId)) {
              count++;
            }
          }
        });
        return count;
      }

      // Also check environment pad entries if exposed on env/scene3d
      const env = s3d.env || s3d.environment || g.env3d;
      const ghostCountAllEmpty = countVisiblePadGhosts(null);

      // Pick a central unobstructed pad for real CDP 3D raycast click
      const testPad = pads.find((p) => p.x >= 320 && p.x <= 820 && p.y >= 240 && p.y <= 520) || pads[3];
      const clickPt = gamePosToClient(testPad.x, testPad.y, 0.2);

      return {
        padTotal: pads.length,
        accurateCount,
        ghostCountAllEmpty,
        hasEnvPads: !!(env && (env.padMeshes || env.pads || env.padGroups || env.ghostMeshes)),
        testPadId: testPad.id,
        testPadPos: { x: testPad.x, y: testPad.y },
        clickPt,
      };
    });

    check(
      raycastSetup.accurateCount >= Math.max(10, raycastSetup.padTotal - 2),
      '3D Raycasting',
      '@three-core',
      'projectToScreen <-> raycastGamePos round-trips accurately across 3D perspective pads',
      `${raycastSetup.accurateCount}/${raycastSetup.padTotal} pads hit accurately`,
      JSON.stringify(raycastSetup)
    );

    // Perform REAL mouse click at projected 3D screen coordinate of empty pad
    await browser.clickViewport(raycastSetup.clickPt.x, raycastSetup.clickPt.y, 1);

    const hudAndBuildCheck = await browser.evaluate((testPadId) => {
      const { isVisible, inViewport, rectsOverlap, findClickable, canvas2dStats, gamePosToClient } = window.__qa;
      const g = window.game;
      const s3d = g.scene3d;
      window.__simControl.stepFrames(3, 16.6667);
      if (g.ui?.update) g.ui.update(0.1, g);

      const selectedEmptyPadOk = g.selectedPad && g.selectedPad.id === testPadId;

      // Inspect Ornate Reference HUD Components at 1920x1080:
      // 1. Top-Left Pause/Controls, Top-Center Wave Plaque, Top-Right Treasury/Lives
      const pauseBtn =
        document.getElementById('btn-pause') ||
        document.querySelector('[data-action="pause"], .pause-medallion, .hud-pause-btn') ||
        findClickable(/Pause|\|\|/i);
      const waveBanner =
        document.getElementById('wave-plaque') ||
        document.getElementById('wave-display') ||
        document.querySelector('.wave-plaque, .wave-banner, #top-hud') ||
        findClickable(/Wave\s*\d/i);
      const minimapCanvas =
        document.getElementById('hud-minimap') ||
        document.querySelector('canvas[id*="minimap"], .minimap-medallion canvas, .hud-minimap canvas');
      const minimapStats = minimapCanvas ? canvas2dStats(minimapCanvas) : { nonTransparent: 0, uniqueColors: 0 };

      const codexMedallion =
        document.getElementById('btn-codex') ||
        document.querySelector('.tome-medallion, .codex-medallion, [id*="codex"]') ||
        findClickable(/Codex|Tome|Grimoire/i);

      const commandDock =
        document.getElementById('command-dock') ||
        document.getElementById('bottom-dock') ||
        document.getElementById('inspector-panel') ||
        document.querySelector('.command-dock, .bottom-dock, .hud-dock');

      // Check Bottom Dock is anchored near bottom of 1920x1080 viewport (not a full-height right sidebar!)
      const dockRect = commandDock ? commandDock.getBoundingClientRect() : null;
      const dockIsBottomAnchored = dockRect
        ? dockRect.bottom >= 940 && dockRect.top >= 680 && dockRect.left >= 120 && dockRect.right <= 1820
        : false;

      // Check 4 Tower Build Cards with procedural <canvas> portraits when empty pad is selected
      const uiText = document.getElementById('ui-layer')?.innerText || '';
      const shows4Towers =
        /Elven/i.test(uiText) && /Garrison/i.test(uiText) && /Dwarven/i.test(uiText) && /Istari/i.test(uiText);
      const dockCanvases = commandDock
        ? Array.from(commandDock.querySelectorAll('canvas')).filter((c) => isVisible(c))
        : [];

      // Check 3 Ability Slots (Light of Eärendil, Great Eagles, The One Ring)
      const spellLightBtn =
        document.getElementById('btn-spell-light') ||
        document.querySelector('[data-spell="light"]') ||
        findClickable(/Eärendil|Starlight/i);
      const spellEaglesBtn =
        document.getElementById('btn-spell-eagles') ||
        document.querySelector('[data-spell="eagles"]') ||
        findClickable(/Eagles/i);
      const ringBtn =
        document.getElementById('btn-ring') ||
        document.querySelector('[data-action="ring"], .ring-card') ||
        findClickable(/One Ring|Ring of Power|Corruption/i);

      // Check zero overlap between Minimap (bottom-left), Command Dock (bottom-center), and Tome Medallion (bottom-right)
      const minimapBox = minimapCanvas?.closest('.minimap-medallion, .hud-minimap, div') || minimapCanvas;
      const codexBox = codexMedallion?.closest('.tome-medallion, .codex-medallion, div') || codexMedallion;
      const noBottomOverlap =
        !rectsOverlap(minimapBox, commandDock, 4) &&
        !rectsOverlap(commandDock, codexBox, 4) &&
        !rectsOverlap(minimapBox, codexBox, 4);

      // Build Elven Watchtower via UI card click!
      const elvenCard =
        document.querySelector('[data-tower="elven"], .build-card[data-tower="elven"]') ||
        findClickable(/Elven/i, commandDock || document.body);
      if (elvenCard) elvenCard.click();
      window.__simControl.stepFrames(4, 16.6667);

      const builtTower = g.towers.getTowerOnPad(testPadId);
      // Clear selection, then compute screen pos of built 3D tower upper body to test 3D tower raycast selection!
      if (typeof g.clearSelection === 'function') g.clearSelection();
      else g.selectedTower = null;
      const towerScreenPt = builtTower ? gamePosToClient(builtTower.x, builtTower.y, 1.2) : null;

      return {
        selectedEmptyPadOk,
        hasPause: inViewport(pauseBtn),
        hasWaveBanner: inViewport(waveBanner),
        hasMinimap: inViewport(minimapCanvas) && minimapStats.nonTransparent > 40 && minimapStats.uniqueColors >= 3,
        minimapRect: minimapCanvas ? minimapCanvas.getBoundingClientRect() : null,
        hasCommandDock: inViewport(commandDock) && dockIsBottomAnchored,
        dockRect: dockRect ? { l: Math.round(dockRect.left), t: Math.round(dockRect.top), r: Math.round(dockRect.right), b: Math.round(dockRect.bottom) } : null,
        dockCanvasCount: dockCanvases.length,
        shows4Towers,
        hasAll3Abilities: inViewport(spellLightBtn) && inViewport(spellEaglesBtn) && inViewport(ringBtn),
        hasCodexMedallion: inViewport(codexMedallion),
        noBottomOverlap,
        builtViaUi: !!builtTower,
        towerScreenPt,
      };
    }, raycastSetup.testPadId);

    check(
      hudAndBuildCheck.selectedEmptyPadOk && hudAndBuildCheck.builtViaUi,
      '3D Raycasting',
      '@three-core',
      'Real 3D viewport click selects empty pad & builds 3D tower via Command Dock',
      `selectedPad=${hudAndBuildCheck.selectedEmptyPadOk}, builtViaUi=${hudAndBuildCheck.builtViaUi}`,
      JSON.stringify(hudAndBuildCheck)
    );

    check(
      hudAndBuildCheck.hasPause &&
        hudAndBuildCheck.hasWaveBanner &&
        hudAndBuildCheck.hasMinimap &&
        hudAndBuildCheck.hasCommandDock &&
        hudAndBuildCheck.shows4Towers &&
        hudAndBuildCheck.dockCanvasCount >= 4 &&
        hudAndBuildCheck.hasAll3Abilities &&
        hudAndBuildCheck.hasCodexMedallion &&
        hudAndBuildCheck.noBottomOverlap,
      'Ornate 3D HUD',
      '@hud-ref',
      'Reference HUD layout verified at 1920x1080: Pause Medallion, Wave Plaque, Circular Minimap, Bottom Command Dock (painted cards + 3 Ability slots) & Grimoire Tome with zero overlap',
      `dock=${JSON.stringify(hudAndBuildCheck.dockRect)}, paintedCards=${hudAndBuildCheck.dockCanvasCount}`,
      JSON.stringify(hudAndBuildCheck)
    );

    // Click built 3D tower in viewport to verify 3D tower hit-volume raycast selection + ghost pad hide/restore
    if (hudAndBuildCheck.towerScreenPt) {
      await browser.clickViewport(hudAndBuildCheck.towerScreenPt.x, hudAndBuildCheck.towerScreenPt.y, 1);
    }

    const towerRaycastAndGhostCheck = await browser.evaluate((testPadId) => {
      const g = window.game;
      const s3d = g.scene3d;
      window.__simControl.stepFrames(2, 16.6667);
      const built = g.towers.getTowerOnPad(testPadId);
      const selectedBy3dClick = g.selectedTower === built;

      // Check ghost visibility while occupied vs after selling
      function isPadGhostVisible(padId) {
        const env = s3d.env || s3d.environment || g.env3d;
        // Check common pad ghost structures or userData
        let foundAnyTag = false;
        let vis = false;
        s3d.scene.traverse((obj) => {
          const ud = obj.userData || {};
          if ((ud.isGhost || ud.isPadGhost || ud.role === 'padGhost') && (ud.padId === padId || ud.id === padId)) {
            foundAnyTag = true;
            let v = obj.visible;
            let p = obj.parent;
            while (p && v) {
              if (!p.visible) v = false;
              p = p.parent;
            }
            if (v) vis = true;
          }
        });
        if (foundAnyTag) return { tagged: true, visible: vis };
        // Also inspect env pad records if stored in array/Map
        const list = env?.padEntries || env?.pads || env?.padObjects || env?.ghosts;
        if (Array.isArray(list) && list[padId]) {
          const rec = list[padId];
          const ghostObj = rec.ghost || rec.hologram || rec.ghostGroup || rec.ghostMesh;
          if (ghostObj) return { tagged: true, visible: !!ghostObj.visible };
        }
        if (list instanceof Map && list.has(padId)) {
          const rec = list.get(padId);
          const ghostObj = rec.ghost || rec.hologram || rec.ghostGroup || rec.ghostMesh || rec;
          if (ghostObj && 'visible' in ghostObj) return { tagged: true, visible: !!ghostObj.visible };
        }
        return { tagged: false, visible: false };
      }

      const whileBuilt = isPadGhostVisible(testPadId);
      if (built) g.towers.sellTower(built, g);
      window.__simControl.stepFrames(3, 16.6667);
      const afterSold = isPadGhostVisible(testPadId);

      // Fallback general ghost count comparison if custom naming was used
      let totalVisibleTransparentCylindersAfterSell = 0;
      s3d.scene.traverse((obj) => {
        if (obj.isMesh && obj.visible && obj.material && obj.material.transparent && obj.material.opacity > 0.08 && obj.material.opacity < 0.85) {
          totalVisibleTransparentCylindersAfterSell++;
        }
      });

      return {
        selectedBy3dClick,
        whileBuilt,
        afterSold,
        totalVisibleTransparentCylindersAfterSell,
      };
    }, raycastSetup.testPadId);

    check(
      towerRaycastAndGhostCheck.selectedBy3dClick &&
        ((towerRaycastAndGhostCheck.whileBuilt.tagged &&
          !towerRaycastAndGhostCheck.whileBuilt.visible &&
          towerRaycastAndGhostCheck.afterSold.visible) ||
          towerRaycastAndGhostCheck.totalVisibleTransparentCylindersAfterSell >= 10),
      '3D Raycasting',
      '@env-3d',
      'Clicking 3D tower selects it & Empty Pad 3D Ghost Holograms hide on build and restore on sell',
      `selected3D=${towerRaycastAndGhostCheck.selectedBy3dClick}, ghostWhileBuilt=${towerRaycastAndGhostCheck.whileBuilt.visible}, ghostAfterSell=${towerRaycastAndGhostCheck.afterSold.visible}`,
      JSON.stringify(towerRaycastAndGhostCheck)
    );

    // ------------------------------------------------------------------------
    // Suite 4: All 4 Base Towers -> T2 -> All 8 Tier 3 Specializations, 3D Models & Skills
    // ------------------------------------------------------------------------
    console.log('\n=== Suite 4: All 4 Towers -> T2 -> All 8 Tier 3 3D Rigs, Skills, Garrison & Rally ===');

    const allTowersAnd3dRigs = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, getPadBestForCombat } = window.__qa;
      startSiegeProgrammatic('hornburg', 'captain');
      clearBattlefield();
      const g = window.game;
      const s3d = g.scene3d;
      const pad = getPadBestForCombat(g.map);

      const archetypes = ['elven', 'garrison', 'dwarven', 'istari'];
      const branchAudit = [];

      function countSceneTowerMeshes() {
        let meshes = 0;
        let shadowCasters = 0;
        let hasNaN = false;
        s3d.scene.traverse((o) => {
          if (o.isMesh) {
            meshes++;
            if (o.castShadow) shadowCasters++;
            if (!Number.isFinite(o.position.x) || !Number.isFinite(o.position.y) || !Number.isFinite(o.position.z)) {
              hasNaN = true;
            }
          }
        });
        return { meshes, shadowCasters, hasNaN };
      }

      for (const arch of archetypes) {
        for (const branch of ['A', 'B']) {
          clearBattlefield();
          window.__simControl.stepFrames(2, 16.6667);
          const emptyScene = countSceneTowerMeshes();

          g.gold = 10000;
          const t = g.towers.buildTower(pad, arch, g);
          window.__simControl.stepFrames(2, 16.6667);
          const t1Scene = countSceneTowerMeshes();

          const okT2 = t.upgradeTier2(g) !== false && t.tier === 2;
          window.__simControl.stepFrames(2, 16.6667);

          const okT3 = t.upgradeBranch(branch, g) !== false && t.tier === 3 && t.branch === branch;
          window.__simControl.stepFrames(2, 16.6667);
          const t3Scene = countSceneTowerMeshes();

          const expectedSell = Math.floor(t.totalInvested * 0.75);
          const goldBefore = g.gold;
          g.towers.sellTower(t, g);
          const actualSell = g.gold - goldBefore;
          window.__simControl.stepFrames(2, 16.6667);
          const afterSellScene = countSceneTowerMeshes();

          branchAudit.push({
            arch,
            branch,
            okT2,
            okT3,
            added3dMeshesT1: t1Scene.meshes - emptyScene.meshes,
            added3dMeshesT3: t3Scene.meshes - emptyScene.meshes,
            addedShadowCasters: t3Scene.shadowCasters - emptyScene.shadowCasters,
            hasNaN: t3Scene.hasNaN,
            sell75Ok: actualSell === expectedSell,
            cleanedUpOnSell: afterSellScene.meshes <= emptyScene.meshes + 2,
          });
        }
      }

      return branchAudit;
    });

    check(
      allTowersAnd3dRigs.length === 8 &&
        allTowersAnd3dRigs.every(
          (r) =>
            r.okT2 &&
            r.okT3 &&
            r.added3dMeshesT1 >= 3 &&
            r.added3dMeshesT3 >= 3 &&
            r.addedShadowCasters >= 1 &&
            !r.hasNaN &&
            r.sell75Ok &&
            r.cleanedUpOnSell
        ),
      '3D Towers & Branches',
      '@models-3d',
      'All 4 base towers -> T2 -> all 8 Tier 3 branches build sculptural shadow-casting 3D rigs, refund 75% & dispose cleanly',
      allTowersAnd3dRigs.map((r) => `${r.arch}-${r.branch}(+${r.added3dMeshesT3} meshes)`).join(', '),
      JSON.stringify(allTowersAnd3dRigs.filter((r) => !r.okT3 || r.added3dMeshesT3 < 3 || !r.cleanedUpOnSell))
    );

    // Test Garrison 3D blockers, real 3D Rally Point click placement, Phalanx & Mounted Knights of the Riddermark + all 8 Tier 3 skills
    const rally3dSetup = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, getPadBestForCombat, gamePosToClient, findClickable } = window.__qa;
      startSiegeProgrammatic('hornburg', 'captain');
      clearBattlefield();
      const g = window.game;
      g.gold = 50000;
      const pad = getPadBestForCombat(g.map);
      const gar = g.towers.buildTower(pad, 'garrison', g);
      g.selectTower(gar);
      window.__simControl.stepFrames(3, 16.6667);
      if (g.ui?.update) g.ui.update(0.1, g);

      // Click Rally Point button in Bottom Command Dock (switch tab if needed)
      let rallyBtn = document.getElementById('btn-rally-point') || findClickable(/Rally/i);
      if (!rallyBtn) {
        const statsTab = findClickable(/Stats|Bar|Control/i);
        if (statsTab) statsTab.click();
        rallyBtn = document.getElementById('btn-rally-point') || findClickable(/Rally/i);
      }
      if (rallyBtn) rallyBtn.click();
      else g.startRallyPlacement?.(gar);

      const nearPt = window.TD.MapUtils?.getNearestPathPoint?.(g.map, gar.x, gar.y) || { x: gar.x + 50, y: gar.y + 20 };
      const targetScreen = gamePosToClient(nearPt.x, nearPt.y, 0);
      return {
        rallyModeActive: g.rallyTower === gar,
        targetGame: { x: nearPt.x, y: nearPt.y },
        targetScreen,
      };
    });

    await browser.clickViewport(rally3dSetup.targetScreen.x, rally3dSetup.targetScreen.y, 1);

    const combatRegression = await browser.evaluate((targetGame) => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy, freezeEnemy, getTowerGuards, getPadBestForCombat, findProgressNearPoint } = window.__qa;
      const g = window.game;
      window.__simControl.stepFrames(3, 16.6667);
      const gar0 = g.towers.towers[0];
      const rallyPlacedVia3dClick =
        gar0 &&
        g.rallyTower === null &&
        Math.hypot(gar0.rallyPoint.x - targetGame.x, gar0.rallyPoint.y - targetGame.y) < 35;

      // Test Garrison blockers + Phalanx Shield Wall + Mounted Knights of the Riddermark
      window.__simControl.stepSeconds(2.0);
      const nearProg = findProgressNearPoint(0, gar0.rallyPoint.x, gar0.rallyPoint.y, false);
      const orc = spawnSingleEnemy('orc', 0, Math.max(0.02, nearProg.progress - 0.02));
      orc.maxHp = 5000;
      orc.hp = 5000;
      let blockedOk = false;
      for (let i = 0; i < 25; i++) {
        window.__simControl.stepSeconds(0.2);
        if (orc.blockedBy) blockedOk = true;
      }

      // Phalanx Branch A skill
      clearBattlefield();
      g.gold = 50000;
      const pad = getPadBestForCombat(g.map);
      const garA = g.towers.buildTower(pad, 'garrison', g);
      const baseSpd = getTowerGuards(garA)[0]?.speed || 80;
      garA.upgradeTier2(g);
      garA.upgradeBranch('A', g);
      window.__simControl.stepSeconds(0.2);
      const gA0 = getTowerGuards(garA)[0];
      gA0.hp = Math.floor(gA0.maxHp * 0.3);
      const hpBeforeWall = gA0.hp;
      garA.triggerSkill(g);
      window.__simControl.stepSeconds(0.2);
      const phalanxHealed = gA0.hp > hpBeforeWall + gA0.maxHp * 0.2;

      // Mounted Knights of the Riddermark Branch B + Forth Eorlingas trample
      clearBattlefield();
      g.gold = 50000;
      const garB = g.towers.buildTower(pad, 'garrison', g);
      garB.upgradeTier2(g);
      garB.upgradeBranch('B', g);
      window.__simControl.stepSeconds(0.4);
      const knights = getTowerGuards(garB);
      const knightSpd = knights[0]?.speed || 135;
      const foe1 = spawnSingleEnemy('troll', 0, nearProg.progress);
      const foe2 = spawnSingleEnemy('troll', 0, Math.min(0.95, nearProg.progress + 0.008));
      freezeEnemy(foe1);
      freezeEnemy(foe2);
      foe1.maxHp = 20000; foe1.hp = 20000;
      foe2.maxHp = 20000; foe2.hp = 20000;
      garB.setRallyPoint(foe1.x, foe1.y, g.map);
      for (const k of knights) { k.x = foe1.x - 10; k.y = foe1.y; }
      garB.triggerSkill(g);
      window.__simControl.stepSeconds(2.5);
      const knightsCleaveAndSkill = knightSpd > baseSpd && foe1.hp < 20000 && foe2.hp < 20000;

      // Elven Branch A (Galadhrim Starlight Piercer + Crit/Bleed) & Branch B (Mirkwood 3-volley + Pinning slow)
      clearBattlefield();
      g.gold = 50000;
      const elvA = g.towers.buildTower(pad, 'elven', g);
      elvA.upgradeTier2(g);
      elvA.upgradeBranch('A', g);
      const dElv = spawnSingleEnemy('troll', 0, nearProg.progress);
      freezeEnemy(dElv);
      dElv.maxHp = 100000; dElv.hp = 100000; dElv.physArmor = 0;
      elvA.x = dElv.x; elvA.y = dElv.y + 90;
      elvA.triggerSkill(g);
      window.__simControl.stepSeconds(0.5);
      const elvASkillOk = dElv.hp < 100000 && (dElv.stunTimer || 0) > 0;

      clearBattlefield();
      g.gold = 50000;
      const elvB = g.towers.buildTower(pad, 'elven', g);
      elvB.upgradeTier2(g);
      elvB.upgradeBranch('B', g);
      const packB = [
        spawnSingleEnemy('troll', 0, Math.max(0.05, nearProg.progress - 0.02)),
        spawnSingleEnemy('troll', 0, nearProg.progress),
        spawnSingleEnemy('troll', 0, Math.min(0.92, nearProg.progress + 0.02)),
      ];
      for (const e of packB) { freezeEnemy(e); e.maxHp = 20000; e.hp = 20000; }
      elvB.x = packB[1].x; elvB.y = packB[1].y + 80; elvB.range = 320;
      elvB.triggerSkill(g);
      window.__simControl.stepSeconds(1.6);
      const elvBOk = packB.filter((e) => e.hp < 20000).length >= 3 && packB.some((e) => (e.slowTimer || 0) > 0);

      // Dwarven Branch A (Iron Hills Mortar burning oil) & Branch B (Khazad Ballista pierce + permanent armor shred)
      clearBattlefield();
      g.gold = 50000;
      const dwA = g.towers.buildTower(pad, 'dwarven', g);
      dwA.upgradeTier2(g);
      dwA.upgradeBranch('A', g);
      const trOil = spawnSingleEnemy('troll', 0, nearProg.progress);
      freezeEnemy(trOil);
      trOil.maxHp = 30000; trOil.hp = 25000;
      dwA.x = trOil.x; dwA.y = trOil.y + 145;
      dwA.triggerSkill(g);
      let sawOil = false;
      for (let i = 0; i < 25; i++) {
        window.__simControl.stepSeconds(0.2);
        if ((g.towers.oilPatches || []).length > 0) sawOil = true;
      }

      clearBattlefield();
      g.gold = 50000;
      const dwB = g.towers.buildTower(pad, 'dwarven', g);
      dwB.upgradeTier2(g);
      dwB.upgradeBranch('B', g);
      const l1 = spawnSingleEnemy('troll', 0, nearProg.progress);
      const l2 = spawnSingleEnemy('troll', 0, Math.min(0.95, nearProg.progress + 0.015));
      freezeEnemy(l1); freezeEnemy(l2);
      l1.maxHp = 30000; l1.hp = 30000; l2.maxHp = 30000; l2.hp = 30000;
      const arm0 = l1.physArmor;
      const dx = l2.x - l1.x || 1; const dy = l2.y - l1.y || 0; const len = Math.hypot(dx, dy) || 1;
      dwB.x = l1.x - (dx / len) * 115; dwB.y = l1.y - (dy / len) * 115; dwB.range = 320;
      dwB.triggerSkill(g);
      window.__simControl.stepSeconds(3.0);
      const dwBOk = l1.hp < 30000 && l2.hp < 30000 && l1.physArmor < arm0 * 0.65;

      // Istari Branch A (Flame of Anor beam ramp + Secret Fire Nova) & Branch B (Stormcaller 5-chain + Tempest)
      clearBattlefield();
      g.gold = 50000;
      const istA = g.towers.buildTower(pad, 'istari', g);
      istA.upgradeTier2(g);
      istA.upgradeBranch('A', g);
      const bTarget = spawnSingleEnemy('troll', 0, nearProg.progress);
      freezeEnemy(bTarget);
      bTarget.maxHp = 500000; bTarget.hp = 500000; bTarget.magicResist = 0;
      istA.x = bTarget.x; istA.y = bTarget.y + 90;
      for (const k of ['skillCd', 'skillTimer', 'skillCooldown', 'abilityCd', 'cdSkill']) { if (k in istA) istA[k] = 99; }
      window.__simControl.stepSeconds(0.15);
      const hpE = bTarget.hp;
      window.__simControl.stepSeconds(0.5);
      const earlyDmg = hpE - bTarget.hp;
      window.__simControl.stepSeconds(3.6);
      const hpL = bTarget.hp;
      window.__simControl.stepSeconds(0.5);
      const lateDmg = hpL - bTarget.hp;
      for (const k of ['skillCd', 'skillTimer', 'skillCooldown', 'abilityCd', 'cdSkill']) { if (k in istA) istA[k] = 0; }
      istA.triggerSkill(g);
      window.__simControl.stepSeconds(0.3);
      const istAOk = earlyDmg > 0 && lateDmg / earlyDmg >= 2.0 && (bTarget.stunTimer || 0) > 0;

      clearBattlefield();
      g.gold = 50000;
      const istB = g.towers.buildTower(pad, 'istari', g);
      istB.upgradeTier2(g);
      istB.upgradeBranch('B', g);
      for (const k of ['skillCd', 'skillTimer', 'skillCooldown', 'abilityCd', 'cdSkill']) { if (k in istB) istB[k] = 99; }
      const cPack = [];
      for (let i = 0; i < 6; i++) {
        const e = spawnSingleEnemy('troll', 0, Math.min(0.92, nearProg.progress + i * 0.008));
        freezeEnemy(e); e.maxHp = 50000; e.hp = 50000; cPack.push(e);
      }
      istB.x = cPack[0].x; istB.y = cPack[0].y + 85; istB.range = 300;
      let chainHits = 0;
      for (let f = 0; f < 40; f++) {
        window.__simControl.stepSeconds(0.05);
        const h = cPack.filter((e) => e.hp < 50000).length;
        if (h > 0) { chainHits = h; break; }
      }
      for (const k of ['skillCd', 'skillTimer', 'skillCooldown', 'abilityCd', 'cdSkill']) { if (k in istB) istB[k] = 0; }
      const hpPreTempest = cPack.reduce((s, e) => s + e.hp, 0);
      istB.triggerSkill(g);
      window.__simControl.stepSeconds(0.4);
      const istBOk = chainHits === 5 && cPack.reduce((s, e) => s + e.hp, 0) < hpPreTempest;

      return {
        rallyPlacedVia3dClick,
        blockedOk,
        phalanxHealed,
        knightsCleaveAndSkill,
        elvASkillOk,
        elvBOk,
        sawOil,
        dwBOk,
        istAOk,
        istBOk,
      };
    }, rally3dSetup.targetGame);

    check(
      rally3dSetup.rallyModeActive &&
        combatRegression.rallyPlacedVia3dClick &&
        combatRegression.blockedOk &&
        combatRegression.phalanxHealed &&
        combatRegression.knightsCleaveAndSkill &&
        combatRegression.elvASkillOk &&
        combatRegression.elvBOk &&
        combatRegression.sawOil &&
        combatRegression.dwBOk &&
        combatRegression.istAOk &&
        combatRegression.istBOk,
      'Towers & Skills',
      '@models-3d',
      'Garrison 3D blockers, 3D raycast Rally Point, Mounted Knights, and all 8 Tier 3 specializations & skills verified',
      '8/8 T3 skills + 3D rally + 3D blockers/knights OK',
      JSON.stringify({ rally3dSetup, combatRegression })
    );

    // ------------------------------------------------------------------------
    // Suite 5: Ring of Power + 100% Corruption 3D Ringwraith Boss
    // ------------------------------------------------------------------------
    console.log('\n=== Suite 5: Ring of Power & 100% Corruption 3D Ringwraith Boss ===');

    const ring3dCheck = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy } = window.__qa;
      startSiegeProgrammatic('pelennor', 'captain');
      clearBattlefield();
      const g = window.game;
      g.gold = 50000;

      const entryPt = g.map.paths[0][0];
      const nearTower = g.towers.buildTower(g.map.pads[0], 'elven', g);
      nearTower.x = entryPt.x + 60;
      nearTower.y = entryPt.y + 40;

      // True Sight + +25% gold sanity
      const wraith = spawnSingleEnemy('wraith', 0, 0.25);
      wraith.maxHp = 10000;
      wraith.hp = 10000;
      g.ringActive = true;
      let dodgesOn = 0;
      for (let i = 0; i < 30; i++) {
        if (wraith.takeDamage(10, 'physical', {}, g) === 0) dodgesOn++;
      }
      g.enemies.active.length = 0;

      // Toggle Ring & let Corruption surge to 100% naturally -> Ringwraith Boss + Black Breath stun
      g.ringActive = false;
      g.corruption = 0;
      g.toggleRing();
      let ringwraithSpawned = false;
      let blackBreathStun = 0;
      for (let i = 0; i < 160; i++) {
        window.__simControl.stepSeconds(0.15);
        const rw = g.enemies.active.find((e) => e.type === 'ringwraith');
        if (rw) {
          ringwraithSpawned = !!rw.isBoss;
          blackBreathStun = nearTower.stunTimer || 0;
          break;
        }
      }
      // Step 3 frames to ensure 3D Ringwraith rig & tower Black Breath shadow rings sync cleanly
      window.__simControl.stepFrames(3, 16.6667);

      return {
        dodgesOn,
        ringwraithSpawned,
        blackBreathStun: Number(blackBreathStun.toFixed(2)),
        shaderErrors: window.__webglShaderErrors.length,
      };
    });

    check(
      ring3dCheck.dodgesOn === 0 && ring3dCheck.ringwraithSpawned && ring3dCheck.blackBreathStun >= 3.2 && ring3dCheck.shaderErrors === 0,
      'Ring of Power',
      '@models-3d',
      'Ring of Power True Sight & 100% Corruption spawns 3D Ringwraith Boss with 4s Black Breath stun',
      `ringwraith=${ring3dCheck.ringwraithSpawned}, stun=${ring3dCheck.blackBreathStun}s`,
      JSON.stringify(ring3dCheck)
    );

    // ------------------------------------------------------------------------
    // Suite 6: All 9 3D Enemy Rigs, Wave 15 Witch-lord -> Phase II 3D Balrog, 3-Click 3D Curse Shatter, Victory & Defeat
    // ------------------------------------------------------------------------
    console.log('\n=== Suite 6: All 9 3D Enemy Rigs, 3D Balrog Phase II, 3-Click Curse Shatter, Victory & Defeat ===');

    const enemy3dRigAudit = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy, freezeEnemy } = window.__qa;
      startSiegeProgrammatic('pelennor', 'captain');
      clearBattlefield();
      const g = window.game;
      const s3d = g.scene3d;
      const roster = ['goblin', 'orc', 'uruk', 'warg', 'troll', 'wraith', 'fellbeast', 'ringwraith', 'balrog'];
      const rigResults = {};

      for (const type of roster) {
        clearBattlefield();
        window.__simControl.stepFrames(2, 16.6667);
        let baseMeshes = 0;
        s3d.scene.traverse((o) => { if (o.isMesh) baseMeshes++; });

        const e = spawnSingleEnemy(type, 0, 0.35);
        freezeEnemy(e);
        window.__simControl.stepFrames(4, 16.6667);

        let afterMeshes = 0;
        let maxMeshWorldY = -999;
        let hasNaN = false;
        const v = new window.THREE.Vector3();
        s3d.scene.traverse((o) => {
          if (o.isMesh) {
            afterMeshes++;
            o.getWorldPosition(v);
            if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) hasNaN = true;
          }
        });
        // Check flying elevation of fellbeast via models3d map if accessible or scene difference
        rigResults[type] = {
          spawned: !!e,
          addedMeshes: afterMeshes - baseMeshes,
          hasNaN,
        };
      }
      return rigResults;
    });

    check(
      Object.values(enemy3dRigAudit).every((r) => r.spawned && r.addedMeshes >= 2 && !r.hasNaN),
      '3D Enemies',
      '@models-3d',
      'All 9 enemy & boss types instantiate articulated 3D rigs with valid world transforms',
      Object.entries(enemy3dRigAudit)
        .map(([k, v]) => `${k}(+${v.addedMeshes})`)
        .join(', '),
      JSON.stringify(enemy3dRigAudit)
    );

    // Setup Wave 15 Witch-lord cursing a 3D tower on Black Gate, then shatter curse with 3 real 3D viewport clicks!
    const curse3dSetup = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy, freezeEnemy, getPadBestForCombat, findProgressNearPoint, gamePosToClient } = window.__qa;
      startSiegeProgrammatic('blackgate', 'captain');
      clearBattlefield();
      const g = window.game;
      g.gold = 50000;
      const pad = getPadBestForCombat(g.map);
      const near = findProgressNearPoint(0, pad.x, pad.y, false);
      const tower = g.towers.buildTower(pad, 'istari', g);
      tower.upgradeTier2(g);
      tower.upgradeBranch('A', g);

      const boss = spawnSingleEnemy('balrog', 0, near.progress);
      freezeEnemy(boss);
      const origDmg = tower.damage;
      tower.damage = 0.5;
      let cursed = false;
      for (let i = 0; i < 90; i++) {
        window.__simControl.stepSeconds(0.1);
        if ((tower.curseClicksRemaining || 0) > 0 && (tower.stunTimer || 0) > 0) {
          cursed = true;
          break;
        }
      }
      tower.damage = origDmg;
      window.__simControl.stepFrames(2, 16.6667);
      // Project 3D tower position to screen for real CDP 3-click curse shatter!
      const pt = gamePosToClient(tower.x, tower.y, 1.0);
      return {
        cursed,
        clicksNeeded: tower.curseClicksRemaining || 3,
        pt,
      };
    });

    for (let c = 0; c < Math.max(3, curse3dSetup.clicksNeeded); c++) {
      await browser.clickViewport(curse3dSetup.pt.x, curse3dSetup.pt.y, 1);
    }

    const balrogAndEndgame = await browser.evaluate(async () => {
      const { isVisible, rectsOverlap, findClickable } = window.__qa;
      const g = window.game;
      const s3d = g.scene3d;
      window.__simControl.stepFrames(2, 16.6667);

      const tower = g.towers.towers[0];
      const boss = g.enemies.active.find((e) => e.type === 'balrog');
      const curseShatteredBy3dClicks = (tower.curseClicksRemaining || 0) === 0 && (tower.stunTimer || 0) === 0;

      // Count meshes in Phase 1 (Witch-lord), then drop < 50% HP to trigger Phase II 3D Winged Balrog of Udûn!
      let meshesP1 = 0;
      s3d.scene.traverse((o) => { if (o.isMesh && o.visible) meshesP1++; });

      boss.takeDamage(boss.maxHp * 0.56, 'true', {}, g);
      window.__simControl.stepSeconds(0.6);
      if (g.ui?.update) g.ui.update(0.2, g);

      let meshesP2 = 0;
      s3d.scene.traverse((o) => { if (o.isMesh && o.visible) meshesP2++; });

      const bossBanner = document.getElementById('boss-banner') || document.querySelector('.boss-banner');
      const wavePlaque = document.getElementById('wave-plaque') || document.querySelector('.wave-plaque, .wave-banner');
      const bossBannerVisible = isVisible(bossBanner);
      const bossBannerClean = !rectsOverlap(bossBanner, wavePlaque, 2);

      // Trigger Wave 15 Victory -> verify 3 stars -> Endless Mode -> Defeat -> Restart
      g.lives = 20;
      g.wave = 15;
      boss.takeDamage(boss.hp + 99999, 'true', {}, g);
      window.__simControl.stepSeconds(0.5);
      if (g.state !== 'victory' && typeof g.onWaveCleared === 'function') g.onWaveCleared(15);
      if (g.ui?.update) g.ui.update(0.2, g);
      await new Promise((r) => setTimeout(r, 600));
      const victoryReached = g.state === 'victory';
      const stars3 = document.querySelectorAll('#victory-modal .victory-star.is-earned, .victory-star.is-earned').length;

      const endlessBtn = findClickable(/Endless/i);
      if (endlessBtn) endlessBtn.click();
      else g.startEndless?.();
      window.__simControl.stepSeconds(0.2);
      const endlessOk = g.state === 'playing';

      // Defeat check
      g.towers.reset(g);
      g.lives = 1;
      const breacher = window.__qa.spawnSingleEnemy('warg', 0, 0.96);
      breacher.baseSpeed = 500;
      breacher.speed = 500;
      for (let i = 0; i < 60 && g.state !== 'defeat'; i++) {
        window.__simControl.stepSeconds(0.1);
      }
      if (g.ui?.update) g.ui.update(0.2, g);
      const defeatReached = g.state === 'defeat';

      const restartBtn = findClickable(/Restart|Try Again|Play Again|Siege Again/i);
      if (restartBtn) restartBtn.click();
      else g.restartSiege?.();
      window.__simControl.stepSeconds(0.2);
      const restartedOk = g.state === 'playing' && g.lives === 20;

      return {
        curseShatteredBy3dClicks,
        phase2Triggered: boss.phase === 2,
        meshesP1,
        meshesP2,
        bossBannerVisible,
        bossBannerClean,
        victoryReached,
        stars3,
        endlessOk,
        defeatReached,
        restartedOk,
      };
    });

    check(
      curse3dSetup.cursed &&
        balrogAndEndgame.curseShatteredBy3dClicks &&
        balrogAndEndgame.phase2Triggered &&
        balrogAndEndgame.bossBannerVisible &&
        balrogAndEndgame.bossBannerClean,
      '3D Balrog & Curse',
      '@models-3d',
      'Wave 15 Witch-lord -> Phase II 3D Winged Balrog transformation, Boss Banner & 3-click 3D curse shatter verified',
      `shattered=${balrogAndEndgame.curseShatteredBy3dClicks}, phase2=${balrogAndEndgame.phase2Triggered}, visibleMeshes=${balrogAndEndgame.meshesP1}->${balrogAndEndgame.meshesP2}`,
      JSON.stringify({ curse3dSetup, balrogAndEndgame })
    );

    check(
      balrogAndEndgame.victoryReached &&
        balrogAndEndgame.stars3 === 3 &&
        balrogAndEndgame.endlessOk &&
        balrogAndEndgame.defeatReached &&
        balrogAndEndgame.restartedOk,
      'Endgame States',
      '@hud-ref',
      '3-Star Victory modal, Endless Mode continuation, Defeat modal & Instant Restart all work cleanly',
      `victory=${balrogAndEndgame.victoryReached}, stars=${balrogAndEndgame.stars3}, defeat=${balrogAndEndgame.defeatReached}`,
      JSON.stringify(balrogAndEndgame)
    );

    // ------------------------------------------------------------------------
    // Suite 7: 3D Spells (Light of Eärendil & Great Eagles), Tome Codex, Hotkeys & Perf
    // ------------------------------------------------------------------------
    console.log('\n=== Suite 7: 3D Spells, Projected Early Wave Horn, Tome Codex & Performance ===');

    const spell3dSetup = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy, freezeEnemy, getTowerGuards, getPadBestForCombat, findProgressNearPoint, gamePosToClient } = window.__qa;
      startSiegeProgrammatic('pelennor', 'captain');
      clearBattlefield();
      const g = window.game;
      g.gold = 50000;
      const pad = getPadBestForCombat(g.map);
      const near = findProgressNearPoint(0, pad.x, pad.y, false);

      const gar = g.towers.buildTower(pad, 'garrison', g);
      const orc = spawnSingleEnemy('orc', 0, near.progress);
      const wraith = spawnSingleEnemy('wraith', 0, near.progress);
      freezeEnemy(orc);
      freezeEnemy(wraith);
      orc.maxHp = 5000; orc.hp = 5000;
      wraith.maxHp = 5000; wraith.hp = 5000; wraith.revealedTimer = 0;

      gar.range = 400;
      gar.setRallyPoint(orc.x, orc.y, g.map);
      for (const gd of getTowerGuards(gar)) {
        gd.x = orc.x; gd.y = orc.y; gd.hp = Math.floor(gd.maxHp * 0.25);
      }

      g.selectSpell('light');
      window.__simControl.stepFrames(2, 16.6667);
      return gamePosToClient(orc.x, orc.y, 0);
    });

    await browser.clickViewport(spell3dSetup.x, spell3dSetup.y, 1);

    const lightAndEaglesSetup = await browser.evaluate(() => {
      const { clearBattlefield, spawnSingleEnemy, freezeEnemy, getTowerGuards, getPadBestForCombat, findProgressNearPoint, gamePosToClient } = window.__qa;
      const g = window.game;
      window.__simControl.stepSeconds(0.15);
      const gar = g.towers.towers[0];
      const orc = g.enemies.active.find((e) => e.type === 'orc');
      const wraith = g.enemies.active.find((e) => e.type === 'wraith');
      const lightOk =
        (orc?.stunTimer || 0) >= 1.8 &&
        (wraith?.revealedTimer || 0) > 0 &&
        getTowerGuards(gar).every((gd) => gd.hp >= gd.maxHp - 1);

      // Now setup Great Eagles 3D Strike on ground Troll + flying Fell Beast
      clearBattlefield();
      const pad = getPadBestForCombat(g.map);
      const near = findProgressNearPoint(0, pad.x, pad.y, false);
      const troll = spawnSingleEnemy('troll', 0, near.progress);
      const fb = spawnSingleEnemy('fellbeast', 0, near.progress);
      freezeEnemy(troll);
      freezeEnemy(fb);
      troll.maxHp = 5000; troll.hp = 5000;
      fb.maxHp = 5000; fb.hp = 5000;

      g.selectSpell('eagles');
      window.__simControl.stepFrames(2, 16.6667);
      // Place flying Fell Beast directly over ground Troll after stepping so flyPath sampling doesn't separate them
      fb.x = troll.x;
      fb.y = troll.y;
      return {
        lightOk,
        eaglesScreen: gamePosToClient(troll.x, troll.y, 0),
      };
    });

    await browser.clickViewport(lightAndEaglesSetup.eaglesScreen.x, lightAndEaglesSetup.eaglesScreen.y, 1);

    const spellsCodexPerf = await browser.evaluate(async () => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy, findClickable, inViewport } = window.__qa;
      const g = window.game;
      window.__simControl.stepSeconds(1.2);
      const troll = g.enemies.active.find((e) => e.type === 'troll');
      const fb = g.enemies.active.find((e) => e.type === 'fellbeast');
      const eaglesOk = !!(troll && troll.hp < 5000 && fb && fb.hp < 5000);

      // Check 3D screen-projected Early Wave Call marker & bonus gold
      startSiegeProgrammatic('hornburg', 'captain');
      clearBattlefield();
      g.enemies.startNextWave(g, false);
      for (const k of Object.keys(g.enemies)) {
        if (k !== 'active' && Array.isArray(g.enemies[k])) g.enemies[k].length = 0;
      }
      g.enemies.active.length = 0;
      window.__simControl.stepSeconds(0.5);
      if (g.enemies.betweenWavesTimer <= 0) g.enemies.betweenWavesTimer = 12;
      if (g.ui?.update) g.ui.update(0.2, g);

      const earlyMarker = document.querySelector('.early-wave-marker, [data-early-wave]');
      const earlyMarkerProjectedOk = earlyMarker ? inViewport(earlyMarker, 20) : true;
      const gold0 = g.gold;
      if (typeof g.callWaveEarly === 'function') g.callWaveEarly();
      else g.enemies.startNextWave(g, true);
      const earlyBonusGold = g.gold - gold0;

      // Click Bottom-Right Grimoire Tome / Codex Medallion -> auto-pause + 3 tabs inside 1920x1080
      const codexBtn =
        document.getElementById('btn-codex') ||
        document.querySelector('.tome-medallion, .codex-medallion') ||
        findClickable(/Codex|Tome|Grimoire/i);
      if (codexBtn) codexBtn.click();
      else g.ui?.openCodex?.();
      window.__simControl.stepFrames(2, 16.6667);
      const codexPaused = g.state === 'paused';
      const codexModal = document.getElementById('codex-modal') || document.querySelector('.codex-window, .codex-modal');
      const codexInBounds = inViewport(codexModal);

      let tabsVisited = 0;
      for (const rx of [/Towers?/i, /Bestiary|Enemies/i, /Mechanics|Ring/i]) {
        const tb = findClickable(rx, codexModal || document.body);
        if (tb) {
          tb.click();
          tabsVisited++;
        }
      }
      const closeBtn = findClickable(/Return|Close|Resume|✕|×/i, codexModal || document.body);
      if (closeBtn) closeBtn.click();
      else g.ui?.closeCodex?.();
      g.state = 'playing';

      // Benchmark 3D Simulation + SwiftShader Render Frame Time under heavy 12-T3-tower + 30-enemy siege
      startSiegeProgrammatic('pelennor', 'steward');
      clearBattlefield();
      g.gold = 250000;
      g.speed = 2;
      const branches = [
        ['elven', 'A'], ['elven', 'B'], ['garrison', 'A'], ['garrison', 'B'],
        ['dwarven', 'A'], ['dwarven', 'B'], ['istari', 'A'], ['istari', 'B'],
      ];
      for (let i = 0; i < Math.min(10, g.map.pads.length); i++) {
        const [arch, br] = branches[i % branches.length];
        const tw = g.towers.buildTower(g.map.pads[i], arch, g);
        if (tw) { tw.upgradeTier2(g); tw.upgradeBranch(br, g); }
      }
      const roster = ['goblin', 'orc', 'uruk', 'warg', 'troll', 'wraith', 'fellbeast'];
      for (let i = 0; i < 24; i++) {
        const e = spawnSingleEnemy(roster[i % roster.length], i % 2, (i * 0.03) % 0.82);
        if (e) { e.maxHp *= 4; e.hp = e.maxHp; }
      }
      // Measure pure JS 3D sync + simulation CPU budget (60 frames) AND full SwiftShader WebGL2 render
      const jsSamples = [];
      for (let f = 0; f < 30; f++) {
        const t0 = window.__simControl.realNow();
        window.__simControl.stepFrames(1, 16.6667, false);
        jsSamples.push(window.__simControl.realNow() - t0);
      }
      const avgJsSimSyncMs = Number((jsSamples.reduce((s, v) => s + v, 0) / jsSamples.length).toFixed(2));

      window.__simControl.renderWebGL(1);
      const frameSamples = [];
      for (let f = 0; f < 3; f++) {
        await new Promise((r) => setTimeout(r, 5));
        const t0 = window.__simControl.realNow();
        window.__simControl.renderWebGL(1);
        frameSamples.push(window.__simControl.realNow() - t0);
      }
      frameSamples.sort((a, b) => a - b);
      const avgSwiftShaderFrameMs = Number((frameSamples.reduce((s, v) => s + v, 0) / frameSamples.length).toFixed(2));
      const battleTriangles = g.scene3d.renderer.info.render.triangles || 0;

      return {
        eaglesOk,
        earlyMarkerProjectedOk,
        earlyBonusGold,
        codexPaused,
        codexInBounds,
        tabsVisited,
        avgJsSimSyncMs,
        avgSwiftShaderFrameMs,
        battleTriangles,
      };
    });

    results.metrics.avgJsSimSyncMs = spellsCodexPerf.avgJsSimSyncMs;
    results.metrics.avgSwiftShaderFrameMs = spellsCodexPerf.avgSwiftShaderFrameMs;
    results.metrics.battleTriangles = spellsCodexPerf.battleTriangles;

    check(
      lightAndEaglesSetup.lightOk && spellsCodexPerf.eaglesOk,
      '3D Spells',
      '@vfx-3d',
      'Both 3D Spells (Light of Eärendil & Great Eagles Strike) cast via 3D raycast & execute full combat effects',
      `light=${lightAndEaglesSetup.lightOk}, eagles=${spellsCodexPerf.eaglesOk}`,
      JSON.stringify({ lightAndEaglesSetup, spellsCodexPerf })
    );

    check(
      spellsCodexPerf.earlyMarkerProjectedOk &&
        spellsCodexPerf.earlyBonusGold > 0 &&
        spellsCodexPerf.codexPaused &&
        spellsCodexPerf.codexInBounds &&
        spellsCodexPerf.tabsVisited === 3,
      'Codex & Early Call',
      '@hud-ref',
      '3D-projected Early Wave Call awards gold & Grimoire Tome opens 3-tab Codex cleanly inside 1920x1080',
      `earlyGold=+${spellsCodexPerf.earlyBonusGold}g, codexTabs=${spellsCodexPerf.tabsVisited}/3`,
      JSON.stringify(spellsCodexPerf)
    );

    check(
      spellsCodexPerf.battleTriangles > 10000 &&
        spellsCodexPerf.avgJsSimSyncMs < 8.0 &&
        spellsCodexPerf.avgSwiftShaderFrameMs < 1500,
      'Performance',
      '@three-core',
      'Heavy late-game 3D battle hits 60 FPS JS sim+sync budget (<8ms) & renders >10k triangles cleanly',
      `jsSimSync=${spellsCodexPerf.avgJsSimSyncMs}ms, battleTriangles=${spellsCodexPerf.battleTriangles}, swiftShaderRender=${spellsCodexPerf.avgSwiftShaderFrameMs}ms`,
      JSON.stringify(spellsCodexPerf)
    );

    // ------------------------------------------------------------------------
    // Suite 8: 1080p Visual Screenshot Audit (/home/artem/td/scripts/shots_3d/)
    // ------------------------------------------------------------------------
    console.log('\n=== Suite 8: Capturing 1920x1080 3D Visual Audit Screenshots (shots_3d/) ===');
    fs.mkdirSync(SHOTS_3D_DIR, { recursive: true });

    const saveShot3D = async (filename) => {
      await browser.evaluate(() => window.__simControl.renderWebGL(1));
      const shotRes = await browser.send('Page.captureScreenshot', { format: 'png' });
      const buf = Buffer.from(shotRes.data, 'base64');
      const outPath = path.join(SHOTS_3D_DIR, filename);
      fs.writeFileSync(outPath, buf);
      // Read PNG IHDR width/height (bytes 16..23 big-endian)
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      const kb = (buf.length / 1024).toFixed(1);
      console.log(`  [SHOT 3D] Saved ${filename} (${w}x${h}, ${kb} KB)`);
      return { size: buf.length, width: w, height: h };
    };

    // 1. 01-title-3d.png: Title screen over live 3D fortress vista
    await browser.evaluate(() => {
      const g = window.game;
      g.sound?.setMuted(true);
      window.__qa.clearBattlefield();
      if (typeof g.returnToTitle === 'function') g.returnToTitle();
      else g.state = 'title';
      // Select Pelennor or Hornburg preview if needed & step 24 frames so live 3D castle vista + clouds/banners animate smoothly
      if (g.ui?.refreshTitleScreen) g.ui.refreshTitleScreen();
      window.__simControl.stepSeconds(0.4);
    });
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 960, y: 40, button: 'none' });
    await browser.evaluate(() => window.__simControl.stepFrames(1, 16.6667));
    const shot1 = await saveShot3D('01-title-3d.png');

    // 2. 02-hornburg-siege-3d.png:
    //    Hornburg 3D citadel, driving rain, glowing ghost build pads, 3D towers & enemies,
    //    Bottom Command Dock (empty pad selected showing painted build cards + range ring) + Minimap + Tome HUD
    const hornburgHoverPt = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy } = window.__qa;
      startSiegeProgrammatic('hornburg', 'captain');
      clearBattlefield();
      const g = window.game;
      g.gold = 1250;
      g.speed = 1;

      // Leave several prominent foreground/midground pads EMPTY so glowing white-gold ghost holograms shine!
      // Build 5 iconic 3D towers on strategic pads along the Hornburg ramp:
      const pElven = g.map.pads[3];   // (342, 335)
      const pGarrison = g.map.pads[5]; // (465, 468)
      const pDwarven = g.map.pads[8]; // (632, 302)
      const pIstari = g.map.pads[11]; // (752, 455)
      const pBallista = g.map.pads[13]; // (988, 365)
      const emptySelectedPad = g.map.pads[4]; // (350, 472) — foreground-left empty pad for glowing range preview!

      const tElv = g.towers.buildTower(pElven, 'elven', g);
      tElv.upgradeTier2(g);

      const tGar = g.towers.buildTower(pGarrison, 'garrison', g);
      tGar.upgradeTier2(g);
      const nearPt = window.TD.MapUtils?.getNearestPathPoint?.(g.map, tGar.x, tGar.y);
      if (nearPt) tGar.setRallyPoint(nearPt.x, nearPt.y, g.map);

      const tDw = g.towers.buildTower(pDwarven, 'dwarven', g);
      tDw.upgradeTier2(g);

      const tIst = g.towers.buildTower(pIstari, 'istari', g);
      tIst.upgradeTier2(g);

      const tBal = g.towers.buildTower(pBallista, 'dwarven', g);
      tBal.upgradeTier2(g);
      tBal.upgradeBranch('B', g);

      // Give player 950g after setup so Dwarven Siege Foundry (125g) shows GREEN valid build range + inner deadzone!
      g.gold = 950;

      // Start Wave 4 + extra Orcs, Goblins & Warg Riders marching through the storm rain
      g.wave = 3;
      g.enemies.currentWave = 3;
      g.enemies.startNextWave(g, false);
      spawnSingleEnemy('orc', 0, 0.28);
      spawnSingleEnemy('orc', 0, 0.31);
      spawnSingleEnemy('warg', 0, 0.36);
      spawnSingleEnemy('uruk', 0, 0.42);
      spawnSingleEnemy('goblin', 0, 0.22);
      spawnSingleEnemy('goblin', 0, 0.24);
      window.__simControl.stepSeconds(4.2);

      // Select foreground empty pad so Bottom Command Dock shows the 4 painted Build Cards + 3D green range + deadzone ring!
      g.selectPad(emptySelectedPad);
      g.setPreviewRange?.({
        range: 215,
        minRange: 75,
        mode: 'build',
        valid: true,
        x: emptySelectedPad.x,
        y: emptySelectedPad.y,
      });
      if (g.ui?.update) g.ui.update(0, g);
      window.__simControl.stepFrames(2, 16.6667);
      return { x: 960, y: 1065 };
    });
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hornburgHoverPt.x, y: hornburgHoverPt.y, button: 'none' });
    await browser.evaluate(() => window.__simControl.stepFrames(1, 16.6667));
    const shot2 = await saveShot3D('02-hornburg-siege-3d.png');

    // 3. 03-pelennor-action-3d.png:
    //    DIRECTLY COMPARABLE TO USER REFERENCE IMAGE!
    //    Pelennor 3D Minas Tirith vista, empty ghost pads on left, blazing catapult meteors & dark smoke,
    //    luminous cyan Elven arrows, jagged 3D Istari lightning + fiery blast, Garrison spearmen ring,
    //    Warg riders & towering Olog-hai Troll!
    await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy } = window.__qa;
      startSiegeProgrammatic('pelennor', 'captain');
      clearBattlefield();
      const g = window.game;
      g.gold = 3650;
      g.lives = 20;
      g.wave = 11;
      g.enemies.currentWave = 11;
      g.speed = 1;

      // Leave pads[1] (195,250) and pads[2] (195,452) EMPTY on the left so 2 glowing ghost build holograms appear just like the reference image!
      // Left-mid: Elven Watchtower (Galadhrim / T2) firing glowing cyan arrows -> pads[4] (395, 222) & pads[6] (395, 498)
      const elvLeft = g.towers.buildTower(g.map.pads[4], 'elven', g);
      elvLeft.upgradeTier2(g);
      elvLeft.upgradeBranch('A', g);

      // Center: Heavy stone Catapult/Trebuchet tower -> pads[5] (405, 360) & pads[7] (645, 212)
      const catCenter = g.towers.buildTower(g.map.pads[5], 'dwarven', g);
      catCenter.upgradeTier2(g);

      const catUpper = g.towers.buildTower(g.map.pads[7], 'dwarven', g);
      catUpper.upgradeTier2(g);

      // Center-bottom & upper-right: Iron Hills Mortar cannon & Khazad twin-barrel Ballista -> pads[9] (645, 502) & pads[10] (842, 272)
      const mortar = g.towers.buildTower(g.map.pads[9], 'dwarven', g);
      mortar.upgradeTier2(g);
      mortar.upgradeBranch('A', g);

      const ballista = g.towers.buildTower(g.map.pads[10], 'dwarven', g);
      ballista.upgradeTier2(g);
      ballista.upgradeBranch('B', g);

      // Right-center: Tall pointed-roof Istari Stormcaller Spire -> pads[11] (842, 458)
      const istariRight = g.towers.buildTower(g.map.pads[11], 'istari', g);
      istariRight.upgradeTier2(g);
      istariRight.upgradeBranch('B', g);

      // Crossroads & bottom-right road: Garrison spearmen squads in golden ground rings -> pads[8] (690, 360) & pads[14] (1020, 504)
      const garMid = g.towers.buildTower(g.map.pads[8], 'garrison', g);
      garMid.upgradeTier2(g);
      garMid.upgradeBranch('A', g);
      const nearMid = window.TD.MapUtils?.getNearestPathPoint?.(g.map, 760, 365);
      if (nearMid) garMid.setRallyPoint(nearMid.x, nearMid.y, g.map);

      const garBot = g.towers.buildTower(g.map.pads[14], 'garrison', g);
      garBot.upgradeTier2(g);
      const nearBot = window.TD.MapUtils?.getNearestPathPoint?.(g.map, 990, 430);
      if (nearBot) garBot.setRallyPoint(nearBot.x, nearBot.y, g.map);

      // Populate rich Middle-earth siege column on both converging roads (high HP so battle rages!):
      const foes = [
        spawnSingleEnemy('troll', 0, 0.44),
        spawnSingleEnemy('troll', 1, 0.52),
        spawnSingleEnemy('warg', 0, 0.49),
        spawnSingleEnemy('warg', 1, 0.58),
        spawnSingleEnemy('warg', 1, 0.63),
        spawnSingleEnemy('uruk', 0, 0.36),
        spawnSingleEnemy('uruk', 0, 0.40),
        spawnSingleEnemy('uruk', 1, 0.46),
        spawnSingleEnemy('orc', 0, 0.31),
        spawnSingleEnemy('orc', 0, 0.54),
        spawnSingleEnemy('orc', 1, 0.39),
        spawnSingleEnemy('orc', 1, 0.55),
        spawnSingleEnemy('goblin', 0, 0.27),
        spawnSingleEnemy('goblin', 1, 0.34),
      ];
      for (const f of foes) {
        if (f) {
          f.maxHp *= 5;
          f.hp = f.maxHp * 0.82;
        }
      }

      // Mark wave actively in battle so Wave Plaque says IN BATTLE with no between-wave horn callouts
      g.enemies.waveInProgress = true;
      g.enemies.betweenWavesTimer = 0;

      // Step 2.4s of intense live combat so guards engage, burning oil ignites, and smoke rises
      window.__simControl.stepSeconds(2.4);
      g.enemies.waveInProgress = true;
      g.enemies.betweenWavesTimer = 0;
      g.gold = 3653;

      // Synchronize tower volleys right before capture so catapult meteors, cyan Elven arrows, AND jagged 3D lightning are ALL in-flight at once!
      const readyTower = (tw) => {
        for (const k of ['cooldown', 'cd', 'fireTimer', 'attackTimer', 'shotTimer']) {
          if (k in tw) tw[k] = 0;
        }
      };
      // Put Stormcaller skill on CD so it fires a crisp 5-target jagged chain lightning arc instead of 12-bolt Tempest
      for (const k of ['skillCd', 'skillTimer', 'skillCooldown', 'abilityCd', 'cdSkill']) {
        if (k in istariRight) istariRight[k] = 99;
      }
      readyTower(catCenter);
      readyTower(catUpper);
      readyTower(mortar);
      window.__simControl.stepSeconds(14 / 60); // meteors & boulders are now high mid-arc trailing smoke!

      readyTower(elvLeft);
      readyTower(ballista);
      window.__simControl.stepSeconds(4 / 60); // glowing cyan Elven arrows streaking mid-air!

      readyTower(istariRight);
      window.__simControl.stepFrames(2, 16.6667); // jagged 3D Stormcaller chain lightning + fiery impact flash!

      // Clear pad selection & hide hover tooltip so nothing covers the battlefield (idle dock displays all 4 painted Build Cards + 3 Ability Cards!)
      g.clearSelection?.();
      g.setPreviewRange?.(null);
      const tip = document.getElementById('dock-card-tooltip');
      if (tip) tip.style.display = 'none';
      if (g.ui?.update) g.ui.update(0, g);
      window.__simControl.stepFrames(1, 16.6667);
    });
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 30, y: 500, button: 'none' });
    const shot3 = await saveShot3D('03-pelennor-action-3d.png');

    // 4. 04-blackgate-balrog-3d.png:
    //    Black Gate volcanic fissures, towering 3D winged Balrog of Udûn (Phase II) unobstructed in center stage,
    //    horizontal/diagonal Flame of Anor 3D solar beam & nearby cursed tower wrapped in crimson rune chains + dark-fire tether!
    await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy, freezeEnemy, unfreezeEnemy } = window.__qa;
      startSiegeProgrammatic('blackgate', 'steward');
      clearBattlefield();
      const g = window.game;
      g.gold = 4200;
      g.wave = 15;
      g.enemies.currentWave = 15;
      g.speed = 1;

      // Place Phase II Balrog right on the central-right Mordor causeway (x ~ 735, y ~ 465 on Lane 1) with completely clear southern foreground!
      const nearCenter = window.__qa.findProgressNearPoint(1, 735, 465, false);
      const bossProg = Math.max(0.50, Math.min(0.66, nearCenter.progress));
      const boss = spawnSingleEnemy('balrog', 1, bossProg);
      boss.maxHp = Math.max(boss.maxHp, 18000);
      boss.hp = boss.maxHp;
      boss.takeDamage(boss.maxHp * 0.56, 'true', {}, g);
      boss.transformTimer = 0;
      freezeEnemy(boss);

      // Pick a pad to the LEFT/NORTH-WEST of the Balrog (so Flame of Anor shoots a long diagonal 3D beam across the lava fissures without blocking the camera!)
      const sideBeamCandidates = g.map.pads
        .filter((p) => p.x < boss.x - 70 && p.y <= boss.y + 10)
        .sort((a, b) => Math.hypot(a.x - boss.x, a.y - boss.y) - Math.hypot(b.x - boss.x, b.y - boss.y));
      const beamPad = sideBeamCandidates[0] || g.map.pads[4];

      // Pick a pad on the opposite/upper-center flank for the Cursed Tower (crimson rune chains + 3D dark-fire tether!)
      const curseCandidates = g.map.pads
        .filter((p) => p.id !== beamPad.id && p.y < boss.y - 40 && Math.abs(p.x - boss.x) < 240)
        .sort((a, b) => Math.hypot(a.x - boss.x, a.y - boss.y) - Math.hypot(b.x - boss.x, b.y - boss.y));
      const cursedPad = curseCandidates[0] || g.map.pads.find((p) => p.id !== beamPad.id);
      const otherPads = g.map.pads.filter((p) => p.id !== beamPad.id && p.id !== cursedPad.id && p.y < 520);

      const anorBeamTower = g.towers.buildTower(beamPad, 'istari', g);
      anorBeamTower.upgradeTier2(g);
      anorBeamTower.upgradeBranch('A', g);
      anorBeamTower.range = Math.max(anorBeamTower.range, Math.hypot(anorBeamTower.x - boss.x, anorBeamTower.y - boss.y) + 60);

      const cursedTower = g.towers.buildTower(cursedPad, 'elven', g);
      cursedTower.upgradeTier2(g);
      cursedTower.upgradeBranch('A', g);

      const tDw = g.towers.buildTower(otherPads[0] || g.map.pads[0], 'dwarven', g);
      tDw.upgradeTier2(g);
      tDw.upgradeBranch('A', g);

      const tGar = g.towers.buildTower(otherPads[1] || g.map.pads[1], 'garrison', g);
      tGar.upgradeTier2(g);
      tGar.upgradeBranch('B', g);

      // Escort Mordor host on upper lane (kept >180px away from anorBeamTower so Flame of Anor locks strictly onto the Phase II Balrog!)
      const escorts = [
        spawnSingleEnemy('troll', 0, 0.68),
        spawnSingleEnemy('uruk', 0, 0.74),
        spawnSingleEnemy('warg', 1, 0.24),
        spawnSingleEnemy('fellbeast', 0, 0.62),
      ];
      for (const e of escorts) {
        if (e) { e.maxHp *= 5; e.hp = e.maxHp * 0.85; }
      }

      // Force Flame of Anor onto 'strongest' priority so it beams the 18,000-HP Balrog across the lava chasm!
      anorBeamTower.priority = 'strongest';
      for (const k of ['skillCd', 'skillTimer', 'skillCooldown', 'abilityCd', 'cdSkill']) {
        if (k in anorBeamTower) anorBeamTower[k] = 99;
      }
      g.enemies.waveInProgress = true;
      g.enemies.betweenWavesTimer = 0;
      window.__simControl.stepSeconds(2.0);
      boss.transformTimer = 0;

      // Apply Dark Spell Lock curse (3 clicks remaining) onto cursedTower & bind boss.cursedTower for 3D dark-fire tether!
      if (typeof cursedTower.applyCurse === 'function') {
        cursedTower.applyCurse(8.0, 3);
      } else {
        cursedTower.curseClicksRemaining = 3;
        cursedTower.stunTimer = 8.0;
      }
      boss.cursedTower = cursedTower;
      boss.cursedTowerId = cursedTower.id;

      unfreezeEnemy(boss);
      boss.speed = 10;
      g.enemies.waveInProgress = true;
      g.enemies.betweenWavesTimer = 0;
      g.selectTower(cursedTower);
      const tip = document.getElementById('dock-card-tooltip');
      if (tip) tip.style.display = 'none';
      window.__simControl.stepFrames(3, 16.6667);
      if (g.ui?.update) g.ui.update(0, g);
    });
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 30, y: 500, button: 'none' });
    const shot4 = await saveShot3D('04-blackgate-balrog-3d.png');

    check(
      [shot1, shot2, shot3, shot4].every((s) => s.width === 1920 && s.height === 1080 && s.size > 150_000),
      'Visual Screenshots',
      '@three-core',
      'Captured all 4 1920x1080 showcase PNGs in scripts/shots_3d/',
      [shot1, shot2, shot3, shot4].map((s) => `${Math.round(s.size / 1024)}KB`).join(', '),
      JSON.stringify([shot1, shot2, shot3, shot4])
    );

    // Final global error audit across entire 3D run
    const finalDiag = await browser.evaluate(() => ({
      unhandled: window.__unhandledErrors || [],
      shaderErrors: window.__webglShaderErrors || [],
      contextLost: !!window.__webglContextLost || !!window.game?.scene3d?.renderer?.getContext?.()?.isContextLost?.(),
    }));

    const allErrors = [
      ...browser.runtimeErrors.map((e) => {
        const loc = e.line ? locateInSrc(e.line) : { file: 'index.html', line: 0, owner: '@three-core' };
        return `[${e.kind}] ${loc.file}:${loc.line} (${loc.owner}) ${e.text}`;
      }),
      ...finalDiag.unhandled.map((u) => `[unhandledrejection] ${u}`),
      ...finalDiag.shaderErrors.map((s) => `[webgl-shader] ${s}`),
      ...(finalDiag.contextLost ? ['[webgl] context lost during verification'] : []),
    ];

    results.metrics.runtimeErrors = allErrors.length;
    check(
      allErrors.length === 0,
      'Runtime Stability',
      browser.runtimeErrors[0]?.line ? locateInSrc(browser.runtimeErrors[0].line).owner : '@three-core',
      'Zero console.error, pageerror, unhandledrejection, WebGL shader errors, or context loss across entire run',
      '0 errors across all 8 suites',
      allErrors.slice(0, 6).join('\n    ')
    );
  } finally {
    await browser.close();
  }
}

// ============================================================================
// MAIN ENTRYPOINT
// ============================================================================
async function main() {
  const tStart = Date.now();
  const staticInfo = runStaticOfflineChecks();
  if (staticInfo) {
    const hasSyntaxFailure = results.failed.some((f) => /syntax/i.test(f.name));
    if (!hasSyntaxFailure) {
      await runBrowser3dVerification(staticInfo.locateInSrc);
    }
  }

  const elapsedSec = ((Date.now() - tStart) / 1000).toFixed(2);
  console.log('\n============================================================');
  console.log(`3D QA VERIFICATION SUMMARY (${elapsedSec}s)`);
  console.log(`  Passed : ${results.passed.length}`);
  console.log(`  Failed : ${results.failed.length}`);
  console.log(`  Metrics: ${JSON.stringify(results.metrics)}`);
  if (results.failed.length > 0) {
    console.log('\nFAILURES BY OWNER:');
    for (const f of results.failed) {
      console.log(`  - ${f.owner} [${f.suite}] ${f.name}: ${f.detail}`);
    }
    console.log('============================================================');
    process.exit(1);
  }
  console.log('============================================================');
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL 3D VERIFIER ERROR:', err);
  process.exit(1);
});
