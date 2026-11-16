#!/usr/bin/env node
/**
 * Lead 3D Art Director & UI QA Studio Inspector + Functional Verifier
 * Owned by @model-ui-qa — strictly read-only against src/* and index.html.
 *Writes ONLY to /home/artem/td/scripts/shots_audit/.
 *
 * Usage:
 *   node /home/artem/td/scripts/inspect_all_models_and_ui.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';

const ROOT_DIR = '/home/artem/td';
const INDEX_HTML = path.join(ROOT_DIR, 'index.html');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const SHOTS_AUDIT_DIR = path.join(ROOT_DIR, 'scripts', 'shots_audit');

const OWNER_BY_FILE = {
  'models_towers_3d.js': '@towers-3d',
  'models_enemies_3d.js': '@enemies-3d',
  'env_3d.js': '@world-vfx-3d',
  'vfx_3d.js': '@world-vfx-3d',
  'styles.css': '@ui-overhaul',
  'ui.js': '@ui-overhaul',
  'models_3d.js': '@integrator-3d',
  'three_scene.js': '@integrator-3d',
  'engine.js': '@integrator-3d',
  'build.mjs': '@integrator-3d',
  'index.html': '@integrator-3d',
  'fx_audio.js': '@integrator-3d',
  'maps.js': '@integrator-3d',
  'enemies.js': '@integrator-3d',
  'towers.js': '@integrator-3d',
};

const results = {
  passed: [],
  failed: [],
  warnings: [],
  metrics: {},
  towerModels: [],
  unitModels: [],
  uiPortraits: {},
};

function pass(suite, name, detail = '') {
  results.passed.push({ suite, name, detail });
  console.log(`  [PASS] [${suite}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(suite, owner, name, detail = '') {
  results.failed.push({ suite, owner, name, detail });
  console.error(`  [FAIL] [${suite}] (${owner}) ${name}${detail ? ` — ${detail}` : ''}`);
}

function warn(suite, owner, name, detail = '') {
  results.warnings.push({ suite, owner, name, detail });
  console.warn(`  [WARN] [${suite}] (${owner}) ${name}${detail ? ` — ${detail}` : ''}`);
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
    'models_towers_3d.js',
    'models_enemies_3d.js',
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
        owner: OWNER_BY_FILE[fname] || '@integrator-3d',
        lines: text.split(/\r?\n/),
      });
    }
  }
  const indexLines = indexHtmlContent.split(/\r?\n/);

  return function locateInSrc(indexLine1Based) {
    const target = (indexLines[indexLine1Based - 1] || '').trim();
    if (!target) return { file: 'index.html', line: indexLine1Based, owner: '@integrator-3d' };
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
      owner: '@integrator-3d',
      code: target.slice(0, 120),
    };
  };
}

// ============================================================================
// SUITE 1: STATIC SYNTAX & ZERO-EXTERNAL-URL AUDIT
// ============================================================================
function runStaticOfflineChecks() {
  console.log('\n=== Suite 1: Static Bundle, Overhauled Modules & Zero-External-URL Audit ===');

  if (!fs.existsSync(INDEX_HTML)) {
    fail('Static', '@integrator-3d', 'index.html exists', `Missing ${INDEX_HTML}`);
    return null;
  }

  const stat = fs.statSync(INDEX_HTML);
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const kb = (stat.size / 1024).toFixed(1);
  results.metrics.bundleSizeKB = Number(kb);

  check(
    stat.size > 400_000,
    'Static',
    '@integrator-3d',
    'Single-file index.html exists & includes bundled Three.js + overhauled 3D/UI code (>400 KB)',
    `${kb} KB`,
    `Bundle too small: ${kb} KB`
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

  results.metrics.externalUrlsInBundle = externalUrlMatches.length;

  check(
    scriptSrcMatches.length === 0 && linkHrefMatches.length === 0 && importMatches.length === 0 && externalUrlMatches.length === 0,
    'Static',
    externalUrlMatches[0]?.loc?.owner || scriptSrcMatches[0]?.loc?.owner || linkHrefMatches[0]?.loc?.owner || '@integrator-3d',
    'Zero external URLs, <script src>, <link href>, or @import in index.html',
    '0 external URLs / tags',
    [
      ...scriptSrcMatches.map((m) => `<script src> at ${m.loc.file}:${m.loc.line}`),
      ...linkHrefMatches.map((m) => `<link href> at ${m.loc.file}:${m.loc.line}`),
      ...importMatches.map((m) => `@import at ${m.loc.file}:${m.loc.line}`),
      ...externalUrlMatches.map((m) => `${m.url} at ${m.loc.file}:${m.loc.line}`),
    ]
      .slice(0, 6)
      .join('; ')
  );

  // Check all required source files (including new models_towers_3d.js & models_enemies_3d.js)
  const expectedJsFiles = [
    'three_scene.js',
    'env_3d.js',
    'models_towers_3d.js',
    'models_enemies_3d.js',
    'models_3d.js',
    'vfx_3d.js',
    'ui.js',
    'engine.js',
  ];

  for (const fname of expectedJsFiles) {
    const fpath = path.join(SRC_DIR, fname);
    const owner = OWNER_BY_FILE[fname] || '@integrator-3d';
    if (!fs.existsSync(fpath)) {
      fail('Static', owner, `Source file src/${fname} exists`, `Missing ${fpath}`);
      continue;
    }
    const code = fs.readFileSync(fpath, 'utf8');
    const extUrl = code.match(/(https?:\/\/[^\s"'`)<>]+|\/\/fonts\.[^\s"'`)<>]+)/i);
    if (extUrl) {
      fail('Static', owner, `Zero external URLs in src/${fname}`, `Found ${extUrl[1]}`);
    }
    try {
      new vm.Script(code, { filename: fpath });
      pass('Static', `Syntax & offline check src/${fname}`, `${(code.length / 1024).toFixed(1)} KB valid JS`);
    } catch (err) {
      fail('Static', owner, `Syntax check src/${fname}`, err.stack || err.message);
    }
  }

  const cssPath = path.join(SRC_DIR, 'styles.css');
  if (fs.existsSync(cssPath)) {
    const css = fs.readFileSync(cssPath, 'utf8');
    const cssUrl = css.match(/(https?:\/\/[^\s"'`)<>]+|\/\/fonts\.[^\s"'`)<>]+|@import\s+)/i);
    check(
      !cssUrl,
      'Static',
      '@ui-overhaul',
      'Zero external URLs or @import in src/styles.css',
      `${(css.length / 1024).toFixed(1)} KB valid CSS`,
      cssUrl ? `Found ${cssUrl[1]}` : ''
    );
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
      fail('Static', '@integrator-3d', `Inline <script> #${scriptCount} syntax valid`, err.stack || err.message);
    }
  }

  check(
    scriptCount >= 1 && syntaxOk,
    'Static',
    '@integrator-3d',
    'All inline <script> blocks in index.html parse cleanly',
    `${scriptCount} inline script block(s)`
  );

  return { html, locateInSrc };
}

// ============================================================================
// HEADLESS CHROME CDP LAUNCHER (1920x1080 + ANGLE SWIFTSHADER WEBGL2)
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

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-model-ui-qa-chrome-'));
  const proc = spawn(
    chromeBin,
    [
      '--headless=new',
      '--no-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--window-size=1920,1080',
      '--enable-webgl',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      `--user-data-dir=${userDataDir}`,
      '--remote-debugging-port=0',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  const { port } = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`Chrome CDP startup timed out:\n${stderr}`)), 15000);
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

  // Preload WebGL shader compile/link spy, context-lost spy, and deterministic rAF controller
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
    runtimeErrors,
    externalNetworkAttempts,
    close,
  };
}

// ============================================================================
// IN-BROWSER 3D MODEL STUDIO & UI QA HARNESS
// ============================================================================
async function installStudioAndQaHelpers(browser) {
  await browser.evaluate(() => {
    function isVisible(el) {
      if (!el) return false;
      const st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    }

    function inViewport(el, tol = 4) {
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
          'button, [role="button"], .card, .map-card, .diff-btn, .build-card, .tower-card, .upgrade-card, .branch-card, .spell-btn, .ability-card, .tab, .tab-btn, .dock-tab, [data-map], [data-diff], [data-difficulty], [data-tower], [data-tab], [data-dock-tab], [data-codex-tab], div, span'
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
          a.matches('[data-map],[data-diff],[data-difficulty],[data-tower],[data-tab],[data-dock-tab],[data-codex-tab],.build-card,.spell-btn,.ability-card,.upgrade-card')
            ? 0
            : 1;
        const bBtn =
          b.tagName === 'BUTTON' ||
          b.hasAttribute('onclick') ||
          b.matches('[data-map],[data-diff],[data-difficulty],[data-tower],[data-tab],[data-dock-tab],[data-codex-tab],.build-card,.spell-btn,.ability-card,.upgrade-card')
            ? 0
            : 1;
        if (aBtn !== bBtn) return aBtn - bBtn;
        return (a.textContent || '').length - (b.textContent || '').length;
      });
      return matching[0];
    }

    /**
     * Inspect pixel diversity of any 2D <canvas> (or <img> fallback).
     * Uses 12-bit quantized RGB buckets (`>> 4`) so `uniqueColors > 25` strictly proves rich shaded/3D art.
     */
    function inspectCanvasStats(el) {
      if (!el) return { exists: false, width: 0, height: 0, nonTransparent: 0, nonBlack: 0, uniqueColors: 0, uniqueColors24: 0 };
      let canvas = el;
      if (el.tagName === 'IMG') {
        const w = el.naturalWidth || el.width || 0;
        const h = el.naturalHeight || el.height || 0;
        if (!w || !h) return { exists: true, width: w, height: h, nonTransparent: 0, nonBlack: 0, uniqueColors: 0, uniqueColors24: 0 };
        canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const c2 = canvas.getContext('2d');
        c2.drawImage(el, 0, 0);
      }
      const w = canvas.width || 0;
      const h = canvas.height || 0;
      if (!w || !h) return { exists: true, width: w, height: h, nonTransparent: 0, nonBlack: 0, uniqueColors: 0, uniqueColors24: 0 };
      const ctx = canvas.getContext('2d');
      if (!ctx) return { exists: true, width: w, height: h, nonTransparent: 0, nonBlack: 0, uniqueColors: 0, uniqueColors24: 0 };

      const sx = Math.max(1, Math.floor(w / 160));
      const sy = Math.max(1, Math.floor(h / 160));
      const data = ctx.getImageData(0, 0, w, h).data;
      let nonTransparent = 0;
      let nonBlack = 0;
      let total = 0;
      const colors12 = new Set();
      const colors24 = new Set();

      for (let y = 0; y < h; y += sy) {
        for (let x = 0; x < w; x += sx) {
          total++;
          const idx = (y * w + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];
          if (a > 8) {
            nonTransparent++;
            if (r + g + b > 20) nonBlack++;
            colors12.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
            colors24.add((r << 16) | (g << 8) | b);
          }
        }
      }
      return {
        exists: true,
        width: w,
        height: h,
        total,
        nonTransparent,
        nonBlack,
        uniqueColors: colors12.size,
        uniqueColors24: colors24.size,
      };
    }

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
      const canvas = s3d?.renderer?.domElement || document.getElementById('webgl-canvas');
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
      if (g.ui?.update) g.ui.update(0.1, g);
      const mapEl = document.querySelector(`[data-map="${mapId}"]`);
      if (mapEl) mapEl.click();
      const diffEl = document.querySelector(`[data-difficulty="${diffId}"], [data-diff="${diffId}"]`);
      if (diffEl) diffEl.click();
      const beginBtn = document.getElementById('btn-begin-siege') || findClickable(/Begin Siege/i);
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
      if (g.towers?.reset) g.towers.reset(g);
      if (g.enemies?.reset) g.enemies.reset(g);
      if (g.vfx?.reset) g.vfx.reset();
      if (g.scene3d?.models?.reset) g.scene3d.models.reset();
      if (g.models3d?.reset) g.models3d.reset();
      if (g.spatialGrid?.clear) g.spatialGrid.clear();
      g.ringActive = false;
      g.corruption = 0;
      g.ringOverloadTimer = 0;
      g.speed = 1;
      g.state = 'playing';
      g.clearSelection?.();
      if (g.spells) {
        for (const k of Object.keys(g.spells)) {
          if (typeof g.spells[k] === 'object' && g.spells[k]) {
            for (const f of ['cd', 'timer', 'cdTimer', 'cooldownLeft', 'remaining']) {
              if (f in g.spells[k]) g.spells[k][f] = 0;
            }
          }
        }
      }
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
        g.spatialGrid?.rebuild?.(em.active);
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
        g.wave = targetWave - 1;
        em.currentWave = targetWave - 1;
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
        g.wave = prevWave;
      }

      if (spawned && targetProgress > 0) {
        advanceEnemyAloneToProgress(spawned, targetProgress);
      }
      g.spatialGrid?.rebuild?.(em.active);
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

    function hideHeraldToast() {
      const g = window.game;
      if (g?.ui) g.ui._toastTimer = 0;
      const ht = document.getElementById('herald-toast');
      if (ht) {
        ht.classList.add('is-hidden');
        ht.style.display = 'none';
      }
      const tb = document.getElementById('dock-card-tooltip');
      if (tb) {
        tb.classList.add('is-hidden');
        tb.style.display = 'none';
      }
    }

    // ========================================================================
    // STANDALONE 3D RIG RESOLVERS & VISIBLE-ONLY BOUNDING BOX / MESH METRICS
    // ========================================================================
    function unwrapObject3D(candidate) {
      if (!candidate) return { obj: null, rig: null };
      if (candidate.isObject3D) return { obj: candidate, rig: candidate.userData?.rig || candidate };
      for (const k of ['root', 'group', 'mesh', 'object3d', 'model']) {
        if (candidate[k] && candidate[k].isObject3D) {
          return { obj: candidate[k], rig: candidate };
        }
      }
      return { obj: null, rig: candidate };
    }

    function getSharedCache() {
      const g = window.game;
      const m3d = g?.models3d || g?.scene3d?.models;
      return (
        m3d?.cache ||
        m3d?._cache ||
        m3d?.assetCache ||
        m3d?.modelCache ||
        m3d?.shared ||
        m3d?.assets ||
        m3d?._shared ||
        null
      );
    }

    function applyBossPhase(obj, rig, phase) {
      const p = phase === 1 ? 1 : 2;
      let toggled = false;
      for (const target of [rig, obj, obj?.userData, obj?.userData?.rig]) {
        if (!target) continue;
        if (typeof target.setPhase === 'function') {
          try {
            target.setPhase(p);
            toggled = true;
          } catch {}
        }
        const p1 = target.phase1Group || target.phase1 || target.witchLord || target.witchlord || target.p1Group;
        const p2 = target.phase2Group || target.phase2 || target.balrogGroup || target.balrog || target.p2Group;
        if (p1 && p2 && p1.isObject3D && p2.isObject3D) {
          p1.visible = p === 1;
          p2.visible = p === 2;
          toggled = true;
        }
      }
      if (!toggled && obj) {
        let namedP1 = null;
        let namedP2 = null;
        obj.traverse((ch) => {
          if (ch === obj) return;
          const nm = (ch.name || '').toLowerCase();
          if (!namedP1 && /phase1|witch/.test(nm)) namedP1 = ch;
          if (!namedP2 && /phase2|balrog/.test(nm)) namedP2 = ch;
        });
        if (namedP1 && namedP2) {
          namedP1.visible = p === 1;
          namedP2.visible = p === 2;
        }
      }
    }

    function computeVisibleMeshStatsAndBox(root) {
      const THREE = window.THREE;
      const fullBox = new THREE.Box3();
      const coreBox = new THREE.Box3();
      const scratchBox = new THREE.Box3();
      const v = new THREE.Vector3();

      let visibleMeshes = 0;
      let triangles = 0;
      let hasNaN = false;
      const materials = new Set();

      root.updateMatrixWorld(true);

      function walk(node) {
        if (!node || node.visible === false) return;
        if (node.isMesh && node.geometry) {
          const geo = node.geometry;
          const pos = geo.attributes?.position;
          if (pos && pos.count > 0) {
            visibleMeshes++;
            const tri = geo.index ? Math.floor(geo.index.count / 3) : Math.floor(pos.count / 3);
            const instCount = node.isInstancedMesh ? (node.count || 1) : 1;
            triangles += tri * instCount;

            if (Array.isArray(node.material)) {
              for (const m of node.material) if (m) materials.add(m.uuid);
            } else if (node.material) {
              materials.add(node.material.uuid);
            }

            if (!geo.boundingBox) geo.computeBoundingBox();
            if (geo.boundingBox && !geo.boundingBox.isEmpty()) {
              scratchBox.copy(geo.boundingBox);
              const localH = scratchBox.max.y - scratchBox.min.y;
              scratchBox.applyMatrix4(node.matrixWorld);
              if (
                !Number.isFinite(scratchBox.min.x) ||
                !Number.isFinite(scratchBox.min.y) ||
                !Number.isFinite(scratchBox.min.z) ||
                !Number.isFinite(scratchBox.max.x) ||
                !Number.isFinite(scratchBox.max.y) ||
                !Number.isFinite(scratchBox.max.z)
              ) {
                hasNaN = true;
              } else {
                fullBox.union(scratchBox);
                const mat = Array.isArray(node.material) ? node.material[0] : node.material;
                const isFaintFlatGroundAura =
                  !!(mat && mat.transparent && (mat.opacity ?? 1) < 0.36 && localH < 0.24);
                if (!isFaintFlatGroundAura) {
                  coreBox.union(scratchBox);
                }
              }
            }
          }
          node.getWorldPosition(v);
          if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) {
            hasNaN = true;
          }
        }
        const children = node.children;
        if (children && children.length) {
          for (let i = 0; i < children.length; i++) {
            walk(children[i]);
          }
        }
      }

      walk(root);

      const useBox = !coreBox.isEmpty() ? coreBox : fullBox;
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      if (!useBox.isEmpty()) {
        useBox.getSize(size);
        useBox.getCenter(center);
      }

      return {
        visibleMeshes,
        triangles,
        materialCount: materials.size,
        hasNaN,
        box: useBox,
        fullBox,
        size: {
          x: Number(size.x.toFixed(2)),
          y: Number(size.y.toFixed(2)),
          z: Number(size.z.toFixed(2)),
        },
        center,
      };
    }

    function acquireStandaloneTower(key, tier, branch) {
      const g = window.game;
      const TD = window.TD || {};
      const m3d = g?.models3d || g?.scene3d?.models;
      const shared = getSharedCache();
      let source = 'none';

      const tryFns = [
        ['models3d.createStandaloneTowerMesh', () => m3d?.createStandaloneTowerMesh?.(key, tier, branch)],
        ['TD.Models3D.createStandaloneTowerMesh', () => TD.Models3D?.createStandaloneTowerMesh?.(key, tier, branch)],
        ['models3d.createStandaloneTowerMesh(opts)', () => m3d?.createStandaloneTowerMesh?.(key, { tier, branch })],
        ['TD.TowerModels3D.createTowerRig', () => TD.TowerModels3D?.createTowerRig?.(key, tier, branch, shared)],
      ];

      for (const [label, fn] of tryFns) {
        try {
          const raw = fn();
          const { obj } = unwrapObject3D(raw);
          if (obj) {
            obj.position.set(0, 0, 0);
            obj.rotation.set(0, 0, 0);
            obj.visible = true;
            const st = computeVisibleMeshStatsAndBox(obj);
            if (st.visibleMeshes > 0) {
              return { obj, source: label };
            }
          }
        } catch {}
      }

      // Live build fallback
      try {
        startSiegeProgrammatic('pelennor', 'captain');
        clearBattlefield();
        g.gold = 99999;
        const pad = g.map.pads[0];
        const tw = g.towers.buildTower(pad, key, g);
        if (tier >= 2) tw.upgradeTier2(g);
        if (tier >= 3 && branch) tw.upgradeBranch(branch, g);
        window.__simControl.stepFrames(2, 16.6667, false);

        let foundObj = null;
        g.scene3d.modelsGroup.traverse((o) => {
          if (!foundObj && o.userData && o.userData.isTower && o.userData.towerId === tw.id) {
            // Walk up to direct child of modelsGroup / tower root
            let cur = o;
            while (cur.parent && cur.parent !== g.scene3d.modelsGroup && cur.parent !== m3d?.rootGroup) {
              cur = cur.parent;
            }
            foundObj = cur.clone(true);
          }
        });
        clearBattlefield();
        if (foundObj) {
          foundObj.position.set(0, 0, 0);
          foundObj.rotation.set(0, 0, 0);
          foundObj.visible = true;
          source = 'live-build-fallback';
          return { obj: foundObj, source };
        }
      } catch {}

      return { obj: null, source };
    }

    function acquireStandaloneSoldier(variant) {
      const g = window.game;
      const TD = window.TD || {};
      const m3d = g?.models3d || g?.scene3d?.models;
      const shared = getSharedCache();

      const tryFns = [
        ['models3d.createStandaloneSoldierMesh', () => m3d?.createStandaloneSoldierMesh?.(variant)],
        ['TD.Models3D.createStandaloneSoldierMesh', () => TD.Models3D?.createStandaloneSoldierMesh?.(variant)],
        ['TD.TowerModels3D.createSoldierRig', () => TD.TowerModels3D?.createSoldierRig?.(variant, shared)],
      ];

      for (const [label, fn] of tryFns) {
        try {
          const raw = fn();
          const { obj } = unwrapObject3D(raw);
          if (obj) {
            obj.position.set(0, 0, 0);
            obj.rotation.set(0, 0, 0);
            obj.visible = true;
            const st = computeVisibleMeshStatsAndBox(obj);
            if (st.visibleMeshes > 0) {
              return { obj, source: label };
            }
          }
        } catch {}
      }

      // Fallback: build matching Garrison keep and extract one soldier rig
      try {
        startSiegeProgrammatic('pelennor', 'captain');
        clearBattlefield();
        g.gold = 99999;
        const pad = g.map.pads[0];
        const tw = g.towers.buildTower(pad, 'garrison', g);
        if (variant === 'phalanx') {
          tw.upgradeTier2(g);
          tw.upgradeBranch('A', g);
        } else if (variant === 'knight') {
          tw.upgradeTier2(g);
          tw.upgradeBranch('B', g);
        }
        window.__simControl.stepFrames(3, 16.6667, false);

        let foundSoldier = null;
        for (const mapCand of [m3d?.activeSoldiers, m3d?.soldierRigs, m3d?._soldiers]) {
          if (mapCand && typeof mapCand.values === 'function') {
            for (const entry of mapCand.values()) {
              const { obj } = unwrapObject3D(entry);
              if (obj && obj.visible) {
                foundSoldier = obj.clone(true);
                break;
              }
            }
          }
          if (foundSoldier) break;
        }
        clearBattlefield();
        if (foundSoldier) {
          foundSoldier.position.set(0, 0, 0);
          foundSoldier.rotation.set(0, 0, 0);
          foundSoldier.visible = true;
          return { obj: foundSoldier, source: 'live-soldier-fallback' };
        }
      } catch {}

      return { obj: null, source: 'none' };
    }

    function acquireStandaloneEnemy(key, phase = 1) {
      const g = window.game;
      const TD = window.TD || {};
      const m3d = g?.models3d || g?.scene3d?.models;
      const shared = getSharedCache();
      const opts = { phase };

      const tryFns = [
        ['models3d.createStandaloneEnemyMesh', () => m3d?.createStandaloneEnemyMesh?.(key, opts)],
        ['TD.Models3D.createStandaloneEnemyMesh', () => TD.Models3D?.createStandaloneEnemyMesh?.(key, opts)],
        ['TD.EnemyModels3D.createEnemyRig', () => TD.EnemyModels3D?.createEnemyRig?.(key, shared, opts)],
      ];

      for (const [label, fn] of tryFns) {
        try {
          const raw = fn();
          const { obj, rig } = unwrapObject3D(raw);
          if (obj) {
            if (key === 'balrog') applyBossPhase(obj, rig, phase);
            obj.position.set(0, 0, 0);
            obj.rotation.set(0, 0, 0);
            obj.visible = true;
            const st = computeVisibleMeshStatsAndBox(obj);
            if (st.visibleMeshes > 0) {
              return { obj, source: label };
            }
          }
        } catch {}
      }

      // Live spawn fallback
      try {
        startSiegeProgrammatic('pelennor', 'captain');
        clearBattlefield();
        const e = spawnSingleEnemy(key, 0, 0.35);
        if (e && key === 'balrog' && phase === 2) {
          e.maxHp = Math.max(e.maxHp, 10000);
          e.hp = e.maxHp;
          e.takeDamage(e.maxHp * 0.56, 'true', {}, g);
          e.transformTimer = 0;
        }
        if (e) freezeEnemy(e);
        window.__simControl.stepFrames(4, 16.6667, false);

        let foundEnemy = null;
        for (const mapCand of [m3d?.activeEnemies, m3d?.enemyRigs, m3d?._enemies]) {
          if (mapCand && typeof mapCand.values === 'function') {
            for (const entry of mapCand.values()) {
              const { obj, rig } = unwrapObject3D(entry);
              if (obj && obj.visible) {
                if (key === 'balrog') applyBossPhase(obj, rig, phase);
                foundEnemy = obj.clone(true);
                break;
              }
            }
          }
          if (foundEnemy) break;
        }
        clearBattlefield();
        if (foundEnemy) {
          foundEnemy.position.set(0, 0, 0);
          foundEnemy.rotation.set(0, 0, 0);
          foundEnemy.visible = true;
          return { obj: foundEnemy, source: 'live-enemy-fallback' };
        }
      } catch {}

      return { obj: null, source: 'none' };
    }

    // ========================================================================
    // NATIVE WEBGL2 MULTI-VIEWPORT STUDIO SHEET RENDERER (1920x1080)
    // ========================================================================
    function renderStudioSheet({ title, subtitle, rowsSpec }) {
      const THREE = window.THREE;
      const g = window.game;
      const s3d = g?.scene3d;
      const renderer = s3d?.renderer;
      if (!THREE || !renderer) {
        throw new Error('Three.js WebGLRenderer unavailable for studio sheet');
      }

      window.__simControl.setManual(true);

      const W = 1920;
      const H = 1080;
      const headerH = 42;
      const padX = 12;
      const padBottom = 10;
      const gapX = 8;
      const gapY = 8;
      const labelH = 30;

      const numRows = rowsSpec.length;
      const availH = H - headerH - padBottom - gapY * (numRows - 1);
      const cellH = Math.floor(availH / numRows);

      // Prepare cell layout + acquire all 3D models & precompute metrics FIRST
      const preparedCells = [];
      for (let rIdx = 0; rIdx < numRows; rIdx++) {
        const rowItems = rowsSpec[rIdx];
        const numCols = rowItems.length;
        const availW = W - padX * 2 - gapX * (numCols - 1);
        const cellW = Math.floor(availW / numCols);
        const top = headerH + rIdx * (cellH + gapY);

        for (let cIdx = 0; cIdx < numCols; cIdx++) {
          const spec = rowItems[cIdx];
          const left = padX + cIdx * (cellW + gapX);
          let acquired;
          if (spec.kind === 'tower') {
            acquired = acquireStandaloneTower(spec.key, spec.tier, spec.branch);
          } else if (spec.kind === 'soldier') {
            acquired = acquireStandaloneSoldier(spec.variant);
          } else {
            acquired = acquireStandaloneEnemy(spec.key, spec.phase || 1);
          }
          const stats = acquired.obj
            ? computeVisibleMeshStatsAndBox(acquired.obj)
            : {
                visibleMeshes: 0,
                triangles: 0,
                materialCount: 0,
                hasNaN: false,
                box: new THREE.Box3(),
                size: { x: 0, y: 0, z: 0 },
                center: new THREE.Vector3(),
              };

          preparedCells.push({
            spec,
            left,
            top,
            width: cellW,
            height: cellH,
            vpLeft: left + 2,
            vpTop: top + 2,
            vpWidth: cellW - 4,
            vpHeight: cellH - labelH - 3,
            obj: acquired.obj,
            source: acquired.source,
            stats,
          });
        }
      }

      // Build crisp HTML overlay for labels & cell borders BEFORE WebGL render
      const uiLayer = document.getElementById('ui-layer');
      const hudCanvas = g.hudCanvas;
      if (uiLayer) uiLayer.style.display = 'none';
      if (hudCanvas) hudCanvas.style.display = 'none';

      let overlay = document.getElementById('qa-studio-overlay');
      if (overlay) overlay.remove();
      overlay = document.createElement('div');
      overlay.id = 'qa-studio-overlay';
      overlay.style.cssText =
        'position:fixed;inset:0;width:1920px;height:1080px;z-index:9999;pointer-events:none;font-family:Georgia,serif;color:#f5e6c4;';

      const snapCanvas = document.createElement('canvas');
      snapCanvas.id = 'qa-studio-snapshot';
      snapCanvas.width = W;
      snapCanvas.height = H;
      snapCanvas.style.cssText = 'position:absolute;inset:0;width:1920px;height:1080px;display:block;z-index:0;';
      overlay.appendChild(snapCanvas);

      const headerBar = document.createElement('div');
      headerBar.style.cssText =
        `position:absolute;left:0;top:0;width:1920px;height:${headerH}px;z-index:1;` +
        'background:linear-gradient(180deg,#1a1714 0%,#0e0d0c 100%);' +
        'border-bottom:2px solid #b58c3c;display:flex;align-items:center;justify-content:space-between;padding:0 18px;box-sizing:border-box;';
      headerBar.innerHTML =
        `<div style="font-size:16px;font-weight:700;letter-spacing:1.2px;color:#f4d88a;">${title}</div>` +
        `<div style="font-family:monospace;font-size:12px;color:#bfb6a2;">${subtitle}</div>`;
      overlay.appendChild(headerBar);

      for (const cell of preparedCells) {
        const frame = document.createElement('div');
        frame.style.cssText =
          `position:absolute;left:${cell.left}px;top:${cell.top}px;width:${cell.width}px;height:${cell.height}px;z-index:1;` +
          'box-sizing:border-box;border:1.5px solid #8a6b2f;border-radius:4px;' +
          'box-shadow:inset 0 0 0 1px rgba(255,228,158,0.14);overflow:hidden;';

        const badge = document.createElement('div');
        badge.style.cssText =
          'position:absolute;left:6px;top:5px;padding:1px 6px;border-radius:3px;' +
          'background:rgba(12,14,19,0.82);border:1px solid rgba(212,170,80,0.65);' +
          'font-family:monospace;font-size:11px;font-weight:700;color:#f6dc8f;';
        badge.textContent = `#${cell.spec.index} ${cell.spec.badge || ''}`.trim();
        frame.appendChild(badge);

        const bottomBar = document.createElement('div');
        bottomBar.style.cssText =
          `position:absolute;left:0;bottom:0;width:100%;height:${labelH}px;` +
          'background:linear-gradient(180deg,#1c1916 0%,#100e0d 100%);' +
          'border-top:1px solid rgba(190,148,68,0.6);display:flex;align-items:center;justify-content:space-between;' +
          'padding:0 8px;box-sizing:border-box;';

        const sz = cell.stats.size;
        bottomBar.innerHTML =
          `<span style="font-size:12.5px;font-weight:700;color:#f5e4b3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${cell.spec.label}</span>` +
          `<span style="font-family:monospace;font-size:10.5px;color:#9fc5e8;white-space:nowrap;margin-left:6px;">${cell.stats.visibleMeshes}m • ${cell.stats.triangles}t • ${sz.x}×${sz.y}×${sz.z}</span>`;
        frame.appendChild(bottomBar);
        overlay.appendChild(frame);
      }
      document.body.appendChild(overlay);

      // Setup dedicated Studio THREE.Scene + 3-point PBR lighting + shadow-receiving plinth
      const studioScene = new THREE.Scene();
      const hemi = new THREE.HemisphereLight(0xdceeff, 0x2c231b, 1.25);
      studioScene.add(hemi);

      const keyLight = new THREE.DirectionalLight(0xfff0d0, 2.65);
      keyLight.position.set(9, 15, 11);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 45;
      keyLight.shadow.camera.left = -10;
      keyLight.shadow.camera.right = 10;
      keyLight.shadow.camera.top = 10;
      keyLight.shadow.camera.bottom = -10;
      keyLight.shadow.bias = -0.0008;
      studioScene.add(keyLight);

      const rimLight = new THREE.DirectionalLight(0x7fd0ff, 1.45);
      rimLight.position.set(-10, 9, -9);
      studioScene.add(rimLight);

      const fillLight = new THREE.DirectionalLight(0xffb878, 1.05);
      fillLight.position.set(-8, 5, 10);
      studioScene.add(fillLight);

      const plinthGeo = new THREE.CylinderGeometry(1.0, 1.08, 0.10, 40);
      const plinthMat = new THREE.MeshStandardMaterial({
        color: 0x242a35,
        roughness: 0.86,
        metalness: 0.15,
      });
      const plinth = new THREE.Mesh(plinthGeo, plinthMat);
      plinth.receiveShadow = true;
      studioScene.add(plinth);

      const holder = new THREE.Group();
      studioScene.add(holder);

      const studioCam = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 200);

      // Save renderer state & clear full 1920x1080 backbuffer
      const prevAutoClear = renderer.autoClear;
      const prevExposure = renderer.toneMappingExposure;
      renderer.setRenderTarget(null);
      renderer.setPixelRatio(1);
      renderer.setSize(W, H, false);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, W, H);
      renderer.setClearColor(0x0c0e13, 1.0);
      renderer.clear(true, true, true);
      renderer.autoClear = false;
      renderer.toneMappingExposure = 1.18;

      const gl = renderer.getContext();
      const pxBuf = new Uint8Array(4);
      const cellReports = [];

      // Render each cell via exact 8-corner perspective bounding-box framing
      for (const cell of preparedCells) {
        const vx = cell.vpLeft;
        const vw = cell.vpWidth;
        const vh = cell.vpHeight;
        const vyWebGL = H - (cell.vpTop + vh);

        renderer.setViewport(vx, vyWebGL, vw, vh);
        renderer.setScissor(vx, vyWebGL, vw, vh);
        renderer.setScissorTest(true);

        const bgHex = cell.spec.bgHex || 0x171d27;
        studioScene.background = new THREE.Color(bgHex);
        renderer.setClearColor(bgHex, 1.0);
        renderer.clear(true, true, true);

        holder.clear();

        if (cell.obj && !cell.stats.box.isEmpty()) {
          holder.add(cell.obj);
          const box = cell.stats.box;
          const cx = cell.stats.center.x;
          const cy = cell.stats.center.y;
          const cz = cell.stats.center.z;

          const maxHoriz = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 0.8);
          plinth.visible = cell.spec.showPlinth !== false;
          plinth.scale.set(maxHoriz * 0.44, 1, maxHoriz * 0.44);
          plinth.position.set(cx, box.min.y - 0.055, cz);

          const fovDeg = 26;
          const aspect = vw / Math.max(1, vh);
          studioCam.fov = fovDeg;
          studioCam.aspect = aspect;
          studioCam.updateProjectionMatrix();

          const az = ((cell.spec.azimuthDeg ?? ( cell.spec.kind === 'tower' ? 34 : 30 )) * Math.PI) / 180;
          const pitch = ((cell.spec.pitchDeg ?? ( cell.spec.kind === 'tower' ? 25 : 19 )) * Math.PI) / 180;

          // Unit camera direction from target -> camera
          const dirX = Math.sin(az) * Math.cos(pitch);
          const dirY = Math.sin(pitch);
          const dirZ = Math.cos(az) * Math.cos(pitch);

          // Orthonormal camera right & up vectors
          const rightX = Math.cos(az);
          const rightY = 0;
          const rightZ = -Math.sin(az);

          const upX = dirY * rightZ - dirZ * rightY;
          const upY = dirZ * rightX - dirX * rightZ;
          const upZ = dirX * rightY - dirY * rightX;

          const tanHalfV = Math.tan((fovDeg * Math.PI) / 360);
          const tanHalfH = tanHalfV * aspect;
          const fill = cell.spec.fill ?? 0.91;

          let reqDist = 1.2;
          const xs = [box.min.x, box.max.x];
          const ys = [box.min.y - 0.06, box.max.y];
          const zs = [box.min.z, box.max.z];
          for (const px of xs) {
            for (const py of ys) {
              for (const pz of zs) {
                const qx = px - cx;
                const qy = py - cy;
                const qz = pz - cz;
                const u = qx * rightX + qy * rightY + qz * rightZ;
                const v = qx * upX + qy * upY + qz * upZ;
                const w = qx * dirX + qy * dirY + qz * dirZ;
                const dH = w + Math.abs(u) / (tanHalfH * fill);
                const dV = w + Math.abs(v) / (tanHalfV * fill);
                if (dH > reqDist) reqDist = dH;
                if (dV > reqDist) reqDist = dV;
              }
            }
          }

          studioCam.position.set(cx + dirX * reqDist, cy + dirY * reqDist, cz + dirZ * reqDist);
          studioCam.lookAt(cx, cy, cz);
          studioCam.updateMatrixWorld();

          keyLight.target.position.set(cx, cy, cz);
          keyLight.target.updateMatrixWorld();

          renderer.render(studioScene, studioCam);
        }

        // Dense backbuffer readback across entire cell viewport so narrow spires & wide bosses are sampled accurately
        const colors12 = new Set();
        let nonBg = 0;
        let samples = 0;
        const bgR = (bgHex >> 16) & 255;
        const bgG = (bgHex >> 8) & 255;
        const bgB = bgHex & 255;
        const cellPixels = new Uint8Array(vw * vh * 4);
        gl.readPixels(vx, vyWebGL, vw, vh, gl.RGBA, gl.UNSIGNED_BYTE, cellPixels);
        const stepX = Math.max(1, Math.floor(vw / 96));
        const stepY = Math.max(1, Math.floor(vh / 64));
        for (let py = 2; py < vh - 2; py += stepY) {
          for (let px = 2; px < vw - 2; px += stepX) {
            const off = (py * vw + px) * 4;
            const r = cellPixels[off];
            const gCh = cellPixels[off + 1];
            const b = cellPixels[off + 2];
            samples++;
            const diff = Math.abs(r - bgR) + Math.abs(gCh - bgG) + Math.abs(b - bgB);
            if (diff > 12) nonBg++;
            colors12.add(((r >> 4) << 8) | ((gCh >> 4) << 4) | (b >> 4));
          }
        }

        cellReports.push({
          index: cell.spec.index,
          label: cell.spec.label,
          kind: cell.spec.kind,
          key: cell.spec.key || cell.spec.variant,
          tier: cell.spec.tier || null,
          branch: cell.spec.branch || null,
          phase: cell.spec.phase || null,
          owner: cell.spec.owner,
          source: cell.source,
          found: !!cell.obj && cell.stats.visibleMeshes > 0,
          visibleMeshes: cell.stats.visibleMeshes,
          triangles: cell.stats.triangles,
          materialCount: cell.stats.materialCount,
          hasNaN: cell.stats.hasNaN,
          size: cell.stats.size,
          uniqueColors: colors12.size,
          nonBgPct: Number(((nonBg / Math.max(1, samples)) * 100).toFixed(1)),
          viewport: { width: vw, height: vh },
        });
      }

      // Persist exact rendered WebGL2 backbuffer onto 2D snapshot canvas so compositor swaps never blank it!
      const snapCtx = snapCanvas.getContext('2d');
      if (snapCtx && renderer.domElement) {
        snapCtx.drawImage(renderer.domElement, 0, 0, W, H);
      }

      // Dispose ONLY studio-owned temporary plinth (never shared game model geometries!)
      holder.clear();
      plinthGeo.dispose();
      plinthMat.dispose();

      // Store restore state for cleanupStudioSheet() AFTER Page.captureScreenshot completes!
      window.__studioRestore = () => {
        const ov = document.getElementById('qa-studio-overlay');
        if (ov) ov.remove();
        if (uiLayer) uiLayer.style.display = '';
        if (hudCanvas) hudCanvas.style.display = 'block';
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, W, H);
        renderer.autoClear = prevAutoClear;
        renderer.toneMappingExposure = prevExposure;
        g.fitStage?.();
        window.__simControl.renderWebGL(1);
      };

      return cellReports;
    }

    function cleanupStudioSheet() {
      if (typeof window.__studioRestore === 'function') {
        window.__studioRestore();
        window.__studioRestore = null;
      }
    }

    window.__qa = {
      isVisible,
      inViewport,
      rectsOverlap,
      findClickable,
      inspectCanvasStats,
      gamePosToClient,
      startSiegeProgrammatic,
      clearBattlefield,
      spawnSingleEnemy,
      freezeEnemy,
      unfreezeEnemy,
      findProgressNearPoint,
      getPadBestForCombat,
      hideHeraldToast,
      renderStudioSheet,
      cleanupStudioSheet,
    };
  });
}

// ============================================================================
// SCREENSHOT HELPER
// ============================================================================
async function saveAuditShot(browser, filename, renderGameFrameFirst = true) {
  if (renderGameFrameFirst) {
    await browser.evaluate(() => window.__simControl.renderWebGL(1));
  }
  const shotRes = await browser.send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shotRes.data, 'base64');
  const outPath = path.join(SHOTS_AUDIT_DIR, filename);
  fs.writeFileSync(outPath, buf);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const kb = (buf.length / 1024).toFixed(1);
  console.log(`  [AUDIT SHOT] Saved shots_audit/${filename} (${w}x${h}, ${kb} KB)`);
  return { filename, path: outPath, size: buf.length, width: w, height: h };
}

// ============================================================================
// RUNTIME STUDIO & UI QA SUITES
// ============================================================================
async function runBrowserInspection(locateInSrc) {
  console.log('\n=== Launching Headless Chrome 1920x1080 (ANGLE SwiftShader WebGL2) ===');
  fs.mkdirSync(SHOTS_AUDIT_DIR, { recursive: true });
  const browser = await launchHeadlessWebGLBrowser();

  try {
    const fileUrl = `file://${INDEX_HTML}`;
    await browser.send('Page.navigate', { url: fileUrl });
    await new Promise((r) => setTimeout(r, 800));

    await installStudioAndQaHelpers(browser);

    // ------------------------------------------------------------------------
    // Capture 1 (Out-of-the-Box Boot): ui_01_title.png + Title Screen Portrait Audit
    // ------------------------------------------------------------------------
    console.log('\n=== Suite 2: Title Screen (`ui_01_title.png`) & 3D Stronghold Map Cards ===');
    const titleAudit = await browser.evaluate(() => {
      const { inspectCanvasStats, inViewport, isVisible } = window.__qa;
      const g = window.game;
      g.sound?.setMuted(true);
      window.__simControl.stepSeconds(0.5);
      window.__simControl.renderWebGL(2);

      const s3d = g.scene3d;
      const gl = s3d?.renderer?.getContext?.();
      const webgl2Active = !!(s3d?.renderer?.capabilities?.isWebGL2 && gl && !gl.isContextLost());

      const titleEl = document.getElementById('title-screen');
      const beginBtn = document.getElementById('btn-begin-siege');
      const mapCards = Array.from(document.querySelectorAll('#title-map-grid [data-map], #title-map-grid .map-card'));
      const mapPreviews = mapCards.map((card, idx) => {
        const mapId = card.getAttribute('data-map') || `map-${idx}`;
        const mediaEl = card.querySelector('canvas, img');
        return {
          mapId,
          cardInViewport: inViewport(card),
          stats: inspectCanvasStats(mediaEl),
        };
      });

      return {
        webgl2Active,
        titleVisible: isVisible(titleEl),
        beginBtnInViewport: inViewport(beginBtn),
        mapCardCount: mapCards.length,
        mapPreviews,
        hooks: {
          renderModelPortrait: typeof s3d?.renderModelPortrait === 'function',
          renderMapPreview3D: typeof s3d?.renderMapPreview3D === 'function',
          renderMinimapTerrain3D: typeof s3d?.renderMinimapTerrain3D === 'function',
        },
      };
    });

    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 960, y: 36, button: 'none' });
    const shotTitle = await saveAuditShot(browser, 'ui_01_title.png', true);

    results.uiPortraits.titleMapPreviews = titleAudit.mapPreviews;

    check(
      titleAudit.webgl2Active &&
        titleAudit.hooks.renderModelPortrait &&
        titleAudit.hooks.renderMapPreview3D &&
        titleAudit.hooks.renderMinimapTerrain3D,
      '3D Studio Hooks',
      '@integrator-3d',
      'WebGL2 active & scene3d exposes renderModelPortrait, renderMapPreview3D, and renderMinimapTerrain3D',
      JSON.stringify(titleAudit.hooks),
      JSON.stringify(titleAudit)
    );

    check(
      titleAudit.titleVisible &&
        titleAudit.beginBtnInViewport &&
        titleAudit.mapCardCount === 3 &&
        titleAudit.mapPreviews.every((m) => m.cardInViewport && m.stats.uniqueColors > 25),
      'Title UI & Previews',
      '@ui-overhaul',
      'Title screen fits 1920x1080 & all 3 Stronghold Map Cards render rich 3D previews (uniqueColors > 25)',
      titleAudit.mapPreviews.map((m) => `${m.mapId}:${m.stats.uniqueColors}c(${m.stats.width}x${m.stats.height})`).join(', '),
      JSON.stringify(titleAudit.mapPreviews)
    );

    // ------------------------------------------------------------------------
    // Suite 3: Close-Up Studio Inspection Sheet 1 — All 16 Tower Models
    // ------------------------------------------------------------------------
    console.log('\n=== Suite 3: Studio Inspection Sheet 1 — All 16 Tower Models (`sheet_towers_all_16.png`) ===');

    const towerRowsSpec = [
      [
        { index: 1, kind: 'tower', key: 'elven', tier: 1, branch: null, badge: 'ELVEN T1', label: 'Elven Watchtower (T1)', owner: '@towers-3d' },
        { index: 2, kind: 'tower', key: 'elven', tier: 2, branch: null, badge: 'ELVEN T2', label: 'Noldorin Watchtower (T2)', owner: '@towers-3d' },
        { index: 3, kind: 'tower', key: 'elven', tier: 3, branch: 'A', badge: 'ELVEN T3-A', label: 'Galadhrim Longbows (A)', owner: '@towers-3d' },
        { index: 4, kind: 'tower', key: 'elven', tier: 3, branch: 'B', badge: 'ELVEN T3-B', label: 'Mirkwood Wardens (B)', owner: '@towers-3d' },
      ],
      [
        { index: 5, kind: 'tower', key: 'garrison', tier: 1, branch: null, badge: 'GARRISON T1', label: 'Garrison of Men (T1)', owner: '@towers-3d' },
        { index: 6, kind: 'tower', key: 'garrison', tier: 2, branch: null, badge: 'GARRISON T2', label: 'Bastion of the West (T2)', owner: '@towers-3d' },
        { index: 7, kind: 'tower', key: 'garrison', tier: 3, branch: 'A', badge: 'GARRISON T3-A', label: 'Tower Guard Phalanx Keep (A)', owner: '@towers-3d' },
        { index: 8, kind: 'tower', key: 'garrison', tier: 3, branch: 'B', badge: 'GARRISON T3-B', label: 'Knights of Riddermark Keep (B)', owner: '@towers-3d' },
      ],
      [
        { index: 9, kind: 'tower', key: 'dwarven', tier: 1, branch: null, badge: 'DWARVEN T1', label: 'Dwarven Siege Foundry (T1)', owner: '@towers-3d' },
        { index: 10, kind: 'tower', key: 'dwarven', tier: 2, branch: null, badge: 'DWARVEN T2', label: 'Khazad Great Catapult (T2)', owner: '@towers-3d' },
        { index: 11, kind: 'tower', key: 'dwarven', tier: 3, branch: 'A', badge: 'DWARVEN T3-A', label: 'Iron Hills Mortar (A)', owner: '@towers-3d' },
        { index: 12, kind: 'tower', key: 'dwarven', tier: 3, branch: 'B', badge: 'DWARVEN T3-B', label: 'Khazad Ballista (B)', owner: '@towers-3d' },
      ],
      [
        { index: 13, kind: 'tower', key: 'istari', tier: 1, branch: null, badge: 'ISTARI T1', label: 'Istari Spire (T1)', owner: '@towers-3d' },
        { index: 14, kind: 'tower', key: 'istari', tier: 2, branch: null, badge: 'ISTARI T2', label: 'White Council Spire (T2)', owner: '@towers-3d' },
        { index: 15, kind: 'tower', key: 'istari', tier: 3, branch: 'A', badge: 'ISTARI T3-A', label: 'Flame of Anor (A)', owner: '@towers-3d' },
        { index: 16, kind: 'tower', key: 'istari', tier: 3, branch: 'B', badge: 'ISTARI T3-B', label: 'Stormcaller Council (B)', owner: '@towers-3d' },
      ],
    ];

    const towerReports = await browser.evaluate(
      (spec) =>
        window.__qa.renderStudioSheet({
          title: 'SHADOWS OF THE WEST — 3D TOWER ARCHITECTURE STUDIO SHEET (ALL 16 VARIANTS)',
          subtitle: '4x4 Close-Up WebGL2 Studio Grid • Key + Rim + Fill PBR Lighting • Bounding-Box Auto-Framed',
          rowsSpec: spec,
        }),
      towerRowsSpec
    );
    const shotTowerSheet = await saveAuditShot(browser, 'sheet_towers_all_16.png', false);
    await browser.evaluate(() => window.__qa.cleanupStudioSheet());

    results.towerModels = towerReports;
    for (const r of towerReports) {
      console.log(
        `    [Tower #${String(r.index).padStart(2, '0')}] ${r.label.padEnd(30)} | meshes=${String(r.visibleMeshes).padStart(3)} | tris=${String(r.triangles).padStart(5)} | colors=${String(r.uniqueColors).padStart(3)} | fill=${r.nonBgPct}% | src=${r.source}`
      );
    }

    const badTowers = towerReports.filter(
      (r) => !r.found || r.hasNaN || r.visibleMeshes < 6 || r.triangles < 180 || r.uniqueColors <= 25 || r.nonBgPct < 6
    );
    check(
      towerReports.length === 16 && badTowers.length === 0 && shotTowerSheet.width === 1920 && shotTowerSheet.height === 1080,
      '16 Tower Models',
      '@towers-3d',
      'All 16 Tower Models instantiate cleanly with sculptural mesh/triangle counts & rich studio shading',
      `minTris=${Math.min(...towerReports.map((r) => r.triangles))}, maxTris=${Math.max(...towerReports.map((r) => r.triangles))}`,
      badTowers.map((b) => `#${b.index} ${b.label}(meshes=${b.visibleMeshes},tris=${b.triangles},colors=${b.uniqueColors})`).join('; ')
    );

    // ------------------------------------------------------------------------
    // Suite 4: Close-Up Studio Inspection Sheet 2 — All 13 Soldier, Cavalry, Enemy & Boss Models
    // ------------------------------------------------------------------------
    console.log('\n=== Suite 4: Studio Inspection Sheet 2 — All 13 Units, Enemies & Bosses (`sheet_units_all_13.png`) ===');

    const unitRowsSpec = [
      [
        { index: 1, kind: 'soldier', variant: 'guard', badge: 'GARRISON T1-T2', label: 'Citadel Guard', owner: '@towers-3d' },
        { index: 2, kind: 'soldier', variant: 'phalanx', badge: 'GARRISON T3-A', label: 'Tower Guard Phalanx', owner: '@towers-3d' },
        { index: 3, kind: 'soldier', variant: 'knight', badge: 'GARRISON T3-B', label: 'Rohirrim Knight on Warhorse', owner: '@towers-3d', azimuthDeg: 38, pitchDeg: 18 },
        { index: 4, kind: 'enemy', key: 'goblin', badge: 'SWARM', label: 'Goblin Scavenger', owner: '@enemies-3d' },
      ],
      [
        { index: 5, kind: 'enemy', key: 'orc', badge: 'INFANTRY', label: 'Orc Infantry', owner: '@enemies-3d' },
        { index: 6, kind: 'enemy', key: 'uruk', badge: 'SHOCK', label: 'Uruk-hai Berserker', owner: '@enemies-3d' },
        { index: 7, kind: 'enemy', key: 'warg', badge: 'CAVALRY', label: 'Warg Rider', owner: '@enemies-3d', azimuthDeg: 36, pitchDeg: 18 },
        { index: 8, kind: 'enemy', key: 'troll', badge: 'SIEGE GIANT', label: 'Olog-hai Siege Troll', owner: '@enemies-3d', azimuthDeg: 28, pitchDeg: 17 },
      ],
      [
        { index: 9, kind: 'enemy', key: 'wraith', badge: 'STEALTH', label: 'Shadow Wraith', owner: '@enemies-3d' },
        { index: 10, kind: 'enemy', key: 'fellbeast', badge: 'FLYING WYVERN', label: 'Fell Beast (Nazgûl Mount)', owner: '@enemies-3d', azimuthDeg: 28, pitchDeg: 20, showPlinth: false },
        { index: 11, kind: 'enemy', key: 'ringwraith', badge: 'CORRUPTION BOSS', label: 'Ringwraith Boss', owner: '@enemies-3d' },
      ],
      [
        { index: 12, kind: 'enemy', key: 'balrog', phase: 1, badge: 'WAVE 15 BOSS — PHASE I', label: 'Witch-lord of Morgul (Phase 1)', owner: '@enemies-3d', azimuthDeg: 26, pitchDeg: 16, bgHex: 0x191c28 },
        { index: 13, kind: 'enemy', key: 'balrog', phase: 2, badge: 'WAVE 15 BOSS — PHASE II', label: 'Balrog of Udûn (Phase 2 — Winged)', owner: '@enemies-3d', azimuthDeg: 24, pitchDeg: 16, bgHex: 0x1e1618 },
      ],
    ];

    const unitReports = await browser.evaluate(
      (spec) =>
        window.__qa.renderStudioSheet({
          title: 'SHADOWS OF THE WEST — 3D SOLDIERS, CAVALRY, ENEMIES & BOSSES STUDIO SHEET (ALL 13 MODELS)',
          subtitle: '3 Friendly Garrison Rigs + 10 Mordor Creature, Cavalry, Flying & Multi-Phase Boss Rigs',
          rowsSpec: spec,
        }),
      unitRowsSpec
    );
    const shotUnitSheet = await saveAuditShot(browser, 'sheet_units_all_13.png', false);
    await browser.evaluate(() => window.__qa.cleanupStudioSheet());

    results.unitModels = unitReports;
    for (const r of unitReports) {
      console.log(
        `    [Unit  #${String(r.index).padStart(2, '0')}] ${r.label.padEnd(32)} | meshes=${String(r.visibleMeshes).padStart(3)} | tris=${String(r.triangles).padStart(5)} | colors=${String(r.uniqueColors).padStart(3)} | fill=${r.nonBgPct}% | src=${r.source}`
      );
    }

    const badSoldiers = unitReports
      .filter((r) => r.kind === 'soldier')
      .filter((r) => !r.found || r.hasNaN || r.visibleMeshes < 6 || r.triangles < 140 || r.uniqueColors <= 25);
    const badEnemies = unitReports
      .filter((r) => r.kind === 'enemy')
      .filter((r) => !r.found || r.hasNaN || r.visibleMeshes < 6 || r.triangles < 140 || r.uniqueColors <= 25);

    const p1Report = unitReports.find((r) => r.index === 12);
    const p2Report = unitReports.find((r) => r.index === 13);
    const distinctBossPhases =
      !!(p1Report && p2Report && (p1Report.triangles !== p2Report.triangles || Math.abs(p2Report.size.x - p1Report.size.x) > 0.8));

    check(
      badSoldiers.length === 0,
      '3 Soldier/Cavalry Rigs',
      '@towers-3d',
      'Citadel Guard, Tower Guard Phalanx, and Rohirrim Knight on Warhorse instantiate cleanly with rich detail',
      unitReports
        .filter((r) => r.kind === 'soldier')
        .map((r) => `${r.key}(${r.triangles}t,${r.uniqueColors}c)`)
        .join(', '),
      badSoldiers.map((b) => `${b.label}(meshes=${b.visibleMeshes},tris=${b.triangles},colors=${b.uniqueColors})`).join('; ')
    );

    check(
      badEnemies.length === 0 && distinctBossPhases && shotUnitSheet.width === 1920 && shotUnitSheet.height === 1080,
      '10 Enemy/Boss Rigs',
      '@enemies-3d',
      'All 10 Enemy & Boss Models (incl. distinct Witch-lord Phase 1 & Winged Balrog Phase 2) render cleanly',
      `P1=${p1Report?.triangles}t(${p1Report?.size?.x}w), P2=${p2Report?.triangles}t(${p2Report?.size?.x}w)`,
      badEnemies
        .map((b) => `${b.label}(meshes=${b.visibleMeshes},tris=${b.triangles},colors=${b.uniqueColors})`)
        .concat(distinctBossPhases ? [] : ['Witch-lord P1 and Balrog P2 have identical geometry/bounds!'])
        .join('; ')
    );

    // ------------------------------------------------------------------------
    // Suite 5: Multi-Map Disposal Leak Check & Accurate 3D Raycast Picking
    // ------------------------------------------------------------------------
    console.log('\n=== Suite 5: Clean Multi-Map Disposal & 3D Raycast Picking ===');

    const disposalAndRaycast = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy, gamePosToClient } = window.__qa;
      const g = window.game;
      const s3d = g.scene3d;
      const renderer = s3d.renderer;

      // Warm up all 3 maps once so cached 3D map/minimap/portrait textures settle
      for (const mid of ['hornburg', 'pelennor', 'blackgate', 'hornburg']) {
        startSiegeProgrammatic(mid, 'captain');
        window.__simControl.renderWebGL(2);
      }
      clearBattlefield();
      window.__simControl.renderWebGL(2);

      const baseGeoms = renderer.info.memory.geometries;
      const baseTex = renderer.info.memory.textures;

      // Second full multi-map cycle with active towers & enemies built and disposed
      for (const mid of ['pelennor', 'blackgate', 'hornburg']) {
        startSiegeProgrammatic(mid, 'captain');
        g.gold = 9999;
        const tw = g.towers.buildTower(g.map.pads[0], 'elven', g);
        tw?.upgradeTier2(g);
        spawnSingleEnemy('orc', 0, 0.25);
        spawnSingleEnemy('warg', 0, 0.35);
        window.__simControl.renderWebGL(2);
        clearBattlefield();
      }
      window.__simControl.renderWebGL(2);

      const endGeoms = renderer.info.memory.geometries;
      const endTex = renderer.info.memory.textures;

      // 3D Raycast round-trip across all pads on Hornburg
      startSiegeProgrammatic('hornburg', 'captain');
      clearBattlefield();
      window.__simControl.renderWebGL(2);

      let maxPadErr = 0;
      let hitCount = 0;
      for (const pad of g.map.pads) {
        const scr = s3d.projectToScreen(pad.x, pad.y, 0);
        const worldHit = s3d.raycastGamePos(scr.x, scr.y);
        if (worldHit && Number.isFinite(worldHit.x) && Number.isFinite(worldHit.y)) {
          const err = Math.hypot(worldHit.x - pad.x, worldHit.y - pad.y);
          if (err < 18) hitCount++;
          if (err > maxPadErr) maxPadErr = err;
        }
      }

      const testPad = g.map.pads[4];
      const padScreen = gamePosToClient(testPad.x, testPad.y, 0.15);
      return {
        baseGeoms,
        endGeoms,
        geomDelta: endGeoms - baseGeoms,
        baseTex,
        endTex,
        texDelta: endTex - baseTex,
        totalPads: g.map.pads.length,
        hitCount,
        maxPadErr: Number(maxPadErr.toFixed(2)),
        testPadId: testPad.id,
        padScreen,
      };
    });

    results.metrics.geomDelta = disposalAndRaycast.geomDelta;
    results.metrics.texDelta = disposalAndRaycast.texDelta;

    check(
      disposalAndRaycast.geomDelta <= 0 && disposalAndRaycast.texDelta <= 0,
      'Memory Disposal',
      '@world-vfx-3d',
      'Clean multi-map 3D rebuild disposal (zero geometry or texture leaks across Hornburg -> Pelennor -> Black Gate)',
      `geoms=${disposalAndRaycast.baseGeoms}->${disposalAndRaycast.endGeoms}, tex=${disposalAndRaycast.baseTex}->${disposalAndRaycast.endTex}`,
      JSON.stringify(disposalAndRaycast)
    );

    // Real CDP click on projected 3D empty pad -> build -> real CDP click on 3D tower!
    await browser.clickViewport(disposalAndRaycast.padScreen.x, disposalAndRaycast.padScreen.y, 1);
    const afterPadClick = await browser.evaluate((expectedPadId) => {
      const g = window.game;
      const padSelected = g.selectedPad && g.selectedPad.id === expectedPadId;
      g.gold = 2000;
      g.ui?.update?.(0, g);
      const card = document.querySelector('#inspector-build-view [data-tower="elven"], #inspector-build-view .build-card');
      if (card) card.click();
      window.__simControl.renderWebGL(2);
      const tw = g.towers.getTowerOnPad ? g.towers.getTowerOnPad(expectedPadId) : g.towers.towers[0];
      g.clearSelection?.();
      window.__simControl.renderWebGL(1);
      const towerScreen = tw ? window.__qa.gamePosToClient(tw.x, tw.y, 1.2) : null;
      return { padSelected, builtTowerId: tw?.id ?? null, towerScreen };
    }, disposalAndRaycast.testPadId);

    if (afterPadClick.towerScreen) {
      await browser.clickViewport(afterPadClick.towerScreen.x, afterPadClick.towerScreen.y, 1);
    }
    const afterTowerClick = await browser.evaluate((expectedTowerId) => {
      const g = window.game;
      return !!(g.selectedTower && g.selectedTower.id === expectedTowerId);
    }, afterPadClick.builtTowerId);

    check(
      disposalAndRaycast.hitCount === disposalAndRaycast.totalPads &&
        afterPadClick.padSelected &&
        afterPadClick.builtTowerId !== null &&
        afterTowerClick,
      '3D Raycast Picking',
      '@integrator-3d',
      '100% 3D pad raycast accuracy + real viewport clicks select 3D empty pad & built 3D tower mesh',
      `${disposalAndRaycast.hitCount}/${disposalAndRaycast.totalPads} pads (maxErr=${disposalAndRaycast.maxPadErr}px), padClick=${afterPadClick.padSelected}, towerClick=${afterTowerClick}`,
      JSON.stringify({ disposalAndRaycast, afterPadClick, afterTowerClick })
    );

    // ------------------------------------------------------------------------
    // Suite 6: Live UI & Battlefield Screenshots (`ui_02` .. `ui_05`) + Portrait Checks
    // ------------------------------------------------------------------------
    console.log('\n=== Suite 6: Live 1920x1080 UI & Battlefield Screenshots (`ui_02` .. `ui_05`) ===');

    // --- Shot 2: ui_02_hornburg_build_dock.png ---
    const hornburgAudit = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy, inspectCanvasStats, inViewport, rectsOverlap, hideHeraldToast } = window.__qa;
      startSiegeProgrammatic('hornburg', 'captain');
      clearBattlefield();
      const g = window.game;
      g.gold = 2500;
      g.speed = 1;

      const tElv = g.towers.buildTower(g.map.pads[3], 'elven', g);
      tElv.upgradeTier2(g);

      const tGar = g.towers.buildTower(g.map.pads[5], 'garrison', g);
      tGar.upgradeTier2(g);
      const nearPt = window.TD.MapUtils?.getNearestPathPoint?.(g.map, tGar.x, tGar.y);
      if (nearPt) tGar.setRallyPoint(nearPt.x, nearPt.y, g.map);

      const tDw = g.towers.buildTower(g.map.pads[8], 'dwarven', g);
      tDw.upgradeTier2(g);

      const tIst = g.towers.buildTower(g.map.pads[11], 'istari', g);
      tIst.upgradeTier2(g);

      const tBal = g.towers.buildTower(g.map.pads[13], 'dwarven', g);
      tBal.upgradeTier2(g);
      tBal.upgradeBranch('B', g);

      g.gold = 950;
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

      const emptyPad = g.map.pads[4];
      g.selectPad(emptyPad);
      g.setPreviewRange?.({
        range: 215,
        minRange: 75,
        mode: 'build',
        valid: true,
        x: emptyPad.x,
        y: emptyPad.y,
      });
      hideHeraldToast();
      g.ui?.update?.(0, g);
      window.__simControl.renderWebGL(2);

      const buildPortraits = Array.from(document.querySelectorAll('#inspector-build-view canvas')).map((c, idx) => ({
        slot: idx,
        stats: inspectCanvasStats(c),
      }));
      const abilityPortraits = ['spell-light-canvas', 'spell-eagles-canvas', 'spell-ring-canvas', 'hud-tome-canvas'].map((id) => ({
        id,
        stats: inspectCanvasStats(document.getElementById(id)),
      }));
      const minimapStats = inspectCanvasStats(document.getElementById('hud-minimap'));

      const dock = document.getElementById('command-dock');
      const minimap = document.getElementById('minimap-medallion');
      const codexMed = document.getElementById('codex-medallion');
      const topHud = document.getElementById('top-hud');

      return {
        buildPortraits,
        abilityPortraits,
        minimapStats,
        layoutClean:
          inViewport(dock) &&
          inViewport(minimap) &&
          inViewport(codexMed) &&
          inViewport(topHud) &&
          !rectsOverlap(dock, minimap, 2) &&
          !rectsOverlap(dock, codexMed, 2),
      };
    });

    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 30, y: 500, button: 'none' });
    const shotHornburg = await saveAuditShot(browser, 'ui_02_hornburg_build_dock.png', true);

    results.uiPortraits.hornburgBuildDock = hornburgAudit;

    check(
      hornburgAudit.layoutClean &&
        hornburgAudit.minimapStats.uniqueColors > 25 &&
        hornburgAudit.buildPortraits.length === 4 &&
        hornburgAudit.buildPortraits.every((p) => p.stats.uniqueColors > 25) &&
        hornburgAudit.abilityPortraits.every((p) => p.stats.uniqueColors > 25),
      'Hornburg Build Dock & Minimap',
      '@ui-overhaul',
      'Hornburg 3D Minimap, 4 Build Dock 3D Tower Portraits, 3 Painted Ability Cards & Tome all pass (uniqueColors > 25)',
      `minimap=${hornburgAudit.minimapStats.uniqueColors}c, build=[${hornburgAudit.buildPortraits.map((p) => p.stats.uniqueColors).join(',')}], abilities=[${hornburgAudit.abilityPortraits.map((p) => p.stats.uniqueColors).join(',')}]`,
      JSON.stringify(hornburgAudit)
    );

    // --- Shot 3: ui_03_pelennor_upgrade_dock.png ---
    const pelennorAudit = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy, inspectCanvasStats, hideHeraldToast } = window.__qa;
      startSiegeProgrammatic('pelennor', 'captain');
      clearBattlefield();
      const g = window.game;
      g.gold = 9999;
      g.lives = 20;
      g.wave = 11;
      g.enemies.currentWave = 11;
      g.speed = 1;

      // Quick check of T1 upgrade portrait (#upg-t2-icon) before upgrading to T2
      const elvLeft = g.towers.buildTower(g.map.pads[4], 'elven', g);
      g.selectTower(elvLeft);
      g.ui?.switchDockTab?.('upgrades');
      g.ui?.refreshInspector?.();
      g.ui?.update?.(0, g);
      window.__simControl.renderWebGL(1);
      const t1UpgIconStats = inspectCanvasStats(document.getElementById('upg-t2-icon'));

      // Upgrade battle towers matching the reference Pelennor composition
      elvLeft.upgradeTier2(g);
      elvLeft.upgradeBranch('A', g);

      const catCenter = g.towers.buildTower(g.map.pads[5], 'dwarven', g);
      catCenter.upgradeTier2(g);

      const catUpper = g.towers.buildTower(g.map.pads[7], 'dwarven', g);
      catUpper.upgradeTier2(g);

      const mortar = g.towers.buildTower(g.map.pads[9], 'dwarven', g);
      mortar.upgradeTier2(g);
      mortar.upgradeBranch('A', g);

      const ballista = g.towers.buildTower(g.map.pads[10], 'dwarven', g);
      ballista.upgradeTier2(g);
      ballista.upgradeBranch('B', g);

      const istariRight = g.towers.buildTower(g.map.pads[11], 'istari', g);
      istariRight.upgradeTier2(g);
      istariRight.upgradeBranch('B', g);

      const garMid = g.towers.buildTower(g.map.pads[8], 'garrison', g);
      garMid.upgradeTier2(g);
      garMid.upgradeBranch('A', g);
      const nearMid = window.TD.MapUtils?.getNearestPathPoint?.(g.map, 760, 365);
      if (nearMid) garMid.setRallyPoint(nearMid.x, nearMid.y, g.map);

      const garBot = g.towers.buildTower(g.map.pads[14], 'garrison', g);
      garBot.upgradeTier2(g);
      const nearBot = window.TD.MapUtils?.getNearestPathPoint?.(g.map, 990, 430);
      if (nearBot) garBot.setRallyPoint(nearBot.x, nearBot.y, g.map);

      // Populate Mordor assault column (Olog-hai Trolls, Warg Riders, Uruks, Orcs, Goblins)
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

      g.enemies.waveInProgress = true;
      g.enemies.betweenWavesTimer = 0;
      window.__simControl.stepSeconds(2.4);
      g.enemies.waveInProgress = true;
      g.enemies.betweenWavesTimer = 0;
      g.gold = 3653;

      const readyTower = (tw) => {
        for (const k of ['cooldown', 'cd', 'fireTimer', 'attackTimer', 'shotTimer']) {
          if (k in tw) tw[k] = 0;
        }
      };
      for (const k of ['skillCd', 'skillTimer', 'skillCooldown', 'abilityCd', 'cdSkill']) {
        if (k in istariRight) istariRight[k] = 99;
      }
      readyTower(catCenter);
      readyTower(catUpper);
      readyTower(mortar);
      window.__simControl.stepSeconds(14 / 60);

      readyTower(elvLeft);
      readyTower(ballista);
      window.__simControl.stepSeconds(4 / 60);

      readyTower(istariRight);
      window.__simControl.stepFrames(2, 16.6667);

      // Select T2 tower (catCenter -> shows 3D T2 Catapult portrait + 3D Branch A Mortar & Branch B Ballista portraits!)
      g.selectTower(catCenter);
      g.ui?.switchDockTab?.('upgrades');
      g.ui?.refreshInspector?.();
      hideHeraldToast();
      g.ui?.update?.(0, g);
      window.__simControl.renderWebGL(2);

      return {
        t1UpgIconStats,
        inspectorPortrait: inspectCanvasStats(document.getElementById('inspector-portrait')),
        branchAIcon: inspectCanvasStats(document.getElementById('branch-a-icon')),
        branchBIcon: inspectCanvasStats(document.getElementById('branch-b-icon')),
        minimapStats: inspectCanvasStats(document.getElementById('hud-minimap')),
        branchWrapVisible: window.__qa.isVisible(document.getElementById('upgrade-t2-wrap')),
      };
    });

    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 30, y: 500, button: 'none' });
    const shotPelennor = await saveAuditShot(browser, 'ui_03_pelennor_upgrade_dock.png', true);

    results.uiPortraits.pelennorUpgradeDock = pelennorAudit;

    check(
      pelennorAudit.branchWrapVisible &&
        pelennorAudit.t1UpgIconStats.uniqueColors > 25 &&
        pelennorAudit.inspectorPortrait.uniqueColors > 25 &&
        pelennorAudit.branchAIcon.uniqueColors > 25 &&
        pelennorAudit.branchBIcon.uniqueColors > 25 &&
        pelennorAudit.minimapStats.uniqueColors > 25,
      'Pelennor Upgrade Dock',
      '@ui-overhaul',
      'Selected T2 Tower displays rich 3D Inspector Portrait + 3D Branch A & Branch B Portraits + Pelennor 3D Minimap (uniqueColors > 25)',
      `inspector=${pelennorAudit.inspectorPortrait.uniqueColors}c, branchA=${pelennorAudit.branchAIcon.uniqueColors}c, branchB=${pelennorAudit.branchBIcon.uniqueColors}c, t2Icon=${pelennorAudit.t1UpgIconStats.uniqueColors}c, minimap=${pelennorAudit.minimapStats.uniqueColors}c`,
      JSON.stringify(pelennorAudit)
    );

    // --- Shot 4: ui_04_codex_3d_portraits.png ---
    const codexAudit = await browser.evaluate(() => {
      const { inspectCanvasStats, inViewport, isVisible, hideHeraldToast } = window.__qa;
      const g = window.game;
      hideHeraldToast();

      const codexBtn = document.getElementById('btn-codex');
      if (codexBtn) codexBtn.click();
      else g.ui?.openCodex?.('towers');

      // 1. Check Towers & Upgrades tab 3D portraits
      g.ui?.switchCodexTab?.('towers');
      g.ui?.update?.(0, g);
      window.__simControl.renderWebGL(1);

      const towerTabPortraits = Array.from(document.querySelectorAll('#codex-tab-towers canvas, #codex-tab-towers img')).map((el, idx) => ({
        idx,
        stats: inspectCanvasStats(el),
      }));

      // 2. Switch to Bestiary & Resistances tab for screenshot & 9+ enemy portrait check
      const bestiaryBtn = document.querySelector('[data-codex-tab="bestiary"]');
      if (bestiaryBtn) bestiaryBtn.click();
      else g.ui?.switchCodexTab?.('bestiary');
      g.ui?.update?.(0, g);
      window.__simControl.renderWebGL(2);

      const enemyCardEls = Array.from(
        document.querySelectorAll('#codex-tab-bestiary .codex-enemy-card, #codex-tab-bestiary [data-enemy], #codex-tab-bestiary .bestiary-card')
      );
      const bestiaryPortraits =
        enemyCardEls.length > 0
          ? enemyCardEls.map((card, idx) => {
              const title = (card.querySelector('h4, h3, .codex-enemy-name')?.textContent || `enemy-${idx}`).trim();
              const mediaEl = card.querySelector('canvas, img');
              return { title, stats: inspectCanvasStats(mediaEl) };
            })
          : Array.from(document.querySelectorAll('#codex-tab-bestiary canvas, #codex-tab-bestiary img')).map((mediaEl, idx) => ({
              title: `enemy-${idx}`,
              stats: inspectCanvasStats(mediaEl),
            }));

      const codexWin = document.querySelector('#codex-modal .codex-window') || document.getElementById('codex-modal');
      return {
        codexOpen: isVisible(codexWin),
        codexInViewport: inViewport(codexWin),
        towerPortraitCount: towerTabPortraits.length,
        minTowerPortraitColors: towerTabPortraits.length ? Math.min(...towerTabPortraits.map((p) => p.stats.uniqueColors)) : 0,
        bestiaryCount: bestiaryPortraits.length,
        bestiaryPortraits,
      };
    });

    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 30, y: 40, button: 'none' });
    const shotCodex = await saveAuditShot(browser, 'ui_04_codex_3d_portraits.png', true);

    await browser.evaluate(() => {
      window.game?.ui?.closeCodex?.();
      if (window.game) window.game.state = 'playing';
    });

    results.uiPortraits.codex = codexAudit;

    check(
      codexAudit.codexOpen &&
        codexAudit.codexInViewport &&
        codexAudit.towerPortraitCount >= 4 &&
        codexAudit.minTowerPortraitColors > 25 &&
        codexAudit.bestiaryCount >= 9 &&
        codexAudit.bestiaryPortraits.every((p) => p.stats.uniqueColors > 25),
      'Codex 3D Portraits',
      '@ui-overhaul',
      'Bestiary Codex fits 1920x1080 & renders rich 3D studio portraits across all Enemy/Boss cards and Tower cards (uniqueColors > 25)',
      `bestiary=${codexAudit.bestiaryCount} cards [${codexAudit.bestiaryPortraits.map((p) => `${p.title.split(' ')[0]}:${p.stats.uniqueColors}c`).join(', ')}], towerMinColors=${codexAudit.minTowerPortraitColors}c`,
      JSON.stringify(codexAudit)
    );

    // --- Shot 5: ui_05_blackgate_balrog.png ---
    const blackgateAudit = await browser.evaluate(() => {
      const {
        startSiegeProgrammatic,
        clearBattlefield,
        spawnSingleEnemy,
        freezeEnemy,
        unfreezeEnemy,
        findProgressNearPoint,
        inspectCanvasStats,
        isVisible,
        rectsOverlap,
        hideHeraldToast,
      } = window.__qa;

      startSiegeProgrammatic('blackgate', 'steward');
      clearBattlefield();
      const g = window.game;
      g.gold = 4200;
      g.wave = 15;
      g.enemies.currentWave = 15;
      g.speed = 1;

      // Place Balrog on the SE-angled segment (770,465)->(840,550) at ~(805,508) so it faces 3/4 toward the camera completely unobstructed!
      const nearCenter = findProgressNearPoint(1, 805, 508, false);
      const boss = spawnSingleEnemy('balrog', 1, nearCenter.progress);
      boss.maxHp = Math.max(boss.maxHp, 18000);
      boss.hp = boss.maxHp;
      boss.takeDamage(boss.maxHp * 0.56, 'true', {}, g);
      boss.transformTimer = 0;
      g.vfx?.reset?.();
      freezeEnemy(boss);

      // Flame of Anor on pad (605, 360) -> long diagonal solar beam across the lava fissure; Cursed Tower on (915, 472) -> clean right flank!
      const beamPad = g.map.pads[6] || g.map.pads[4];
      const cursedPad = g.map.pads[11] || g.map.pads[10];
      const otherPads = [g.map.pads[4], g.map.pads[7]].filter(Boolean);

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

      const escorts = [
        spawnSingleEnemy('troll', 0, 0.68),
        spawnSingleEnemy('uruk', 0, 0.74),
        spawnSingleEnemy('warg', 1, 0.24),
        spawnSingleEnemy('fellbeast', 0, 0.62),
      ];
      for (const e of escorts) {
        if (e) {
          e.maxHp *= 5;
          e.hp = e.maxHp * 0.85;
        }
      }

      anorBeamTower.priority = 'strongest';
      for (const k of ['skillCd', 'skillTimer', 'skillCooldown', 'abilityCd', 'cdSkill']) {
        if (k in anorBeamTower) anorBeamTower[k] = 99;
      }
      g.enemies.waveInProgress = true;
      g.enemies.betweenWavesTimer = 0;
      window.__simControl.stepSeconds(2.0);
      boss.transformTimer = 0;

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
      hideHeraldToast();
      window.__simControl.stepFrames(3, 16.6667);
      g.ui?.update?.(0, g);
      window.__simControl.renderWebGL(2);

      const bossBanner = document.getElementById('boss-banner');
      const wavePill = document.getElementById('hud-wave-pill');
      const curseBtn = document.getElementById('btn-curse-shatter');
      const cursedTowerScreen = window.__qa.gamePosToClient(cursedTower.x, cursedTower.y, 1.2);

      return {
        phase: boss.phase,
        bossBannerVisible: isVisible(bossBanner),
        bossBannerNoOverlap: !rectsOverlap(bossBanner, wavePill, 2),
        curseBtnVisible: isVisible(curseBtn),
        inspectorPortrait: inspectCanvasStats(document.getElementById('inspector-portrait')),
        minimapStats: inspectCanvasStats(document.getElementById('hud-minimap')),
        cursedTowerScreen,
      };
    });

    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 30, y: 500, button: 'none' });
    const shotBlackgate = await saveAuditShot(browser, 'ui_05_blackgate_balrog.png', true);

    // Also verify 3-click 3D curse shatter right after capturing ui_05_blackgate_balrog.png!
    for (let c = 0; c < 3; c++) {
      await browser.clickViewport(blackgateAudit.cursedTowerScreen.x, blackgateAudit.cursedTowerScreen.y, 1);
    }
    const curseShattered = await browser.evaluate(() => {
      window.__simControl.stepFrames(2, 16.6667);
      const tw = window.game.selectedTower || window.game.towers.towers.find((t) => t.type === 'elven');
      return (tw?.curseClicksRemaining || 0) === 0;
    });

    results.uiPortraits.blackgateBalrog = { ...blackgateAudit, curseShattered };

    check(
      blackgateAudit.phase === 2 &&
        blackgateAudit.bossBannerVisible &&
        blackgateAudit.bossBannerNoOverlap &&
        blackgateAudit.curseBtnVisible &&
        blackgateAudit.inspectorPortrait.uniqueColors > 25 &&
        blackgateAudit.minimapStats.uniqueColors > 25 &&
        curseShattered,
      'Black Gate Balrog & Curse UI',
      '@enemies-3d',
      'Phase II Winged Balrog of Udûn, Boss Banner, Cursed Tower Dock, Black Gate 3D Minimap & 3-click Curse Shatter verified',
      `phase=${blackgateAudit.phase}, inspector=${blackgateAudit.inspectorPortrait.uniqueColors}c, minimap=${blackgateAudit.minimapStats.uniqueColors}c, curseShattered=${curseShattered}`,
      JSON.stringify({ blackgateAudit, curseShattered })
    );

    const allShots = [shotTitle, shotTowerSheet, shotUnitSheet, shotHornburg, shotPelennor, shotCodex, shotBlackgate];
    check(
      allShots.every((s) => s.width === 1920 && s.height === 1080 && s.size > 120_000),
      '7 Audit PNGs',
      '@integrator-3d',
      'Generated all 7 required 1920x1080 PNGs in scripts/shots_audit/',
      allShots.map((s) => `${s.filename}(${Math.round(s.size / 1024)}KB)`).join(', '),
      JSON.stringify(allShots)
    );

    // ------------------------------------------------------------------------
    // Suite 7: Global Zero-Error & Zero-Network Audit
    // ------------------------------------------------------------------------
    console.log('\n=== Suite 7: Global Console, Page, WebGL & Network Error Audit ===');
    const finalDiag = await browser.evaluate(() => {
      const gl = window.game?.scene3d?.renderer?.getContext?.();
      const glErr = gl ? gl.getError() : 0;
      return {
        unhandled: window.__unhandledErrors || [],
        shaderErrors: window.__webglShaderErrors || [],
        contextLost: !!window.__webglContextLost || !!gl?.isContextLost?.(),
        glError: glErr,
      };
    });

    const allErrors = [
      ...browser.runtimeErrors.map((e) => {
        const loc = e.line ? locateInSrc(e.line) : { file: 'index.html', line: 0, owner: '@integrator-3d' };
        return `[${e.kind}] ${loc.file}:${loc.line} (${loc.owner}) ${e.text}`;
      }),
      ...finalDiag.unhandled.map((u) => `[unhandledrejection] ${u}`),
      ...finalDiag.shaderErrors.map((s) => `[webgl-shader] ${s}`),
      ...(finalDiag.contextLost ? ['[webgl] context lost during inspection'] : []),
      ...(finalDiag.glError !== 0 ? [`[webgl] gl.getError() === ${finalDiag.glError}`] : []),
    ];

    results.metrics.runtimeErrors = allErrors.length;
    results.metrics.externalNetworkRequests = browser.externalNetworkAttempts.length;

    check(
      allErrors.length === 0 && browser.externalNetworkAttempts.length === 0,
      'Zero Errors & Zero Network',
      browser.runtimeErrors[0]?.line ? locateInSrc(browser.runtimeErrors[0].line).owner : '@integrator-3d',
      '0 console/page/unhandled/WebGL errors & 0 external network requests across entire audit',
      '0 errors, 0 network requests',
      [...allErrors, ...browser.externalNetworkAttempts.map((u) => `[net] ${u}`)].slice(0, 8).join('\n    ')
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
  fs.mkdirSync(SHOTS_AUDIT_DIR, { recursive: true });

  const staticInfo = runStaticOfflineChecks();
  if (staticInfo) {
    const hasSyntaxFailure = results.failed.some((f) => /syntax/i.test(f.name));
    if (!hasSyntaxFailure) {
      await runBrowserInspection(staticInfo.locateInSrc);
    }
  }

  const elapsedSec = ((Date.now() - tStart) / 1000).toFixed(2);
  const reportPath = path.join(SHOTS_AUDIT_DIR, 'audit_report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ elapsedSec: Number(elapsedSec), ...results }, null, 2));

  console.log('\n============================================================');
  console.log(`MODEL & UI QA INSPECTION SUMMARY (${elapsedSec}s)`);
  console.log(`  Passed : ${results.passed.length}`);
  console.log(`  Failed : ${results.failed.length}`);
  console.log(`  Report : ${reportPath}`);
  if (results.failed.length > 0) {
    console.log('\nFAILURES BY OWNER:');
    for (const f of results.failed) {
      console.log(`  - ${f.owner} [${f.suite}] ${f.name}: ${f.detail}`);
    }
    console.log('============================================================');
    process.exit(1);
  }
  console.log('============================================================');
}

main().catch((err) => {
  console.error('\n[FATAL] inspect_all_models_and_ui.mjs crashed:', err?.stack || err);
  process.exit(1);
});
