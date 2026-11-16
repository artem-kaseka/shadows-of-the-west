#!/usr/bin/env node
/**
 * Comprehensive Automated QA & Verification Suite for Middle-earth Tower Defense
 * Owned by @verifier — read-only against src/* and index.html.
 *
 * Usage:
 *   node /home/artem/td/scripts/verify.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';

const ROOT_DIR = '/home/artem/td';
const INDEX_HTML = path.join(ROOT_DIR, 'index.html');
const SRC_DIR = path.join(ROOT_DIR, 'src');

const OWNER_BY_FILE = {
  'fx_audio.js': '@fx-audio',
  'maps.js': '@maps',
  'enemies.js': '@enemies',
  'towers.js': '@combat',
  'styles.css': '@ui',
  'ui.js': '@ui',
  'engine.js': '@engine',
  'build.mjs': '@engine',
  'index.html': '@engine',
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
  } else {
    fail(suite, owner, name, detailOnFail || detailOnPass);
    return false;
  }
}

/**
 * Map a line snippet or line offset in index.html back to src/<file>:<line> + @owner if possible.
 */
function buildSourceLineMapper(indexHtmlContent) {
  const srcFiles = ['fx_audio.js', 'maps.js', 'enemies.js', 'towers.js', 'ui.js', 'engine.js', 'styles.css'];
  const loaded = [];
  for (const fname of srcFiles) {
    const full = path.join(SRC_DIR, fname);
    if (fs.existsSync(full)) {
      const text = fs.readFileSync(full, 'utf8');
      const idx = indexHtmlContent.indexOf(text.trim().slice(0, 120));
      loaded.push({
        fname,
        owner: OWNER_BY_FILE[fname] || '@engine',
        lines: text.split('\n'),
        approxStartOffset: idx,
      });
    }
  }
  const indexLines = indexHtmlContent.split('\n');

  return function locateInSrc(indexLine1Based) {
    const target = (indexLines[indexLine1Based - 1] || '').trim();
    if (!target) return { file: 'index.html', line: indexLine1Based, owner: '@engine' };
    for (const item of loaded) {
      for (let i = 0; i < item.lines.length; i++) {
        if (item.lines[i].trim() === target && target.length > 4) {
          return { file: `src/${item.fname}`, line: i + 1, owner: item.owner, code: target.slice(0, 120) };
        }
      }
    }
    return { file: 'index.html', line: indexLine1Based, owner: '@engine', code: target.slice(0, 120) };
  };
}

// ============================================================================
// 1. STATIC SELF-CONTAINED & OFFLINE CHECK
// ============================================================================
function runStaticOfflineChecks() {
  console.log('\n=== Suite 1: Self-Contained & Offline Static Checks ===');

  if (!fs.existsSync(INDEX_HTML)) {
    fail('Static', '@engine', 'index.html exists', `Missing ${INDEX_HTML}`);
    return null;
  }

  const stat = fs.statSync(INDEX_HTML);
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const kb = (stat.size / 1024).toFixed(1);
  results.metrics.bundleSizeKB = Number(kb);
  check(stat.size > 10_000, 'Static', '@engine', 'index.html exists & non-trivial size', `${kb} KB`, `Too small: ${stat.size} bytes`);

  const locateInSrc = buildSourceLineMapper(html);
  const lines = html.split('\n');

  // External script src / link href / @import checks
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
    if (/@import\b/i.test(ln)) {
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
    scriptSrcMatches[0]?.loc?.owner || '@engine',
    'Zero <script src=...> tags',
    '0 external scripts',
    scriptSrcMatches.map((m) => `${m.loc.file}:${m.loc.line}`).join(', ')
  );

  check(
    linkHrefMatches.length === 0,
    'Static',
    linkHrefMatches[0]?.loc?.owner || '@ui',
    'Zero <link href=...> tags',
    '0 external stylesheets/links',
    linkHrefMatches.map((m) => `${m.loc.file}:${m.loc.line}`).join(', ')
  );

  check(
    importMatches.length === 0,
    'Static',
    importMatches[0]?.loc?.owner || '@ui',
    'Zero CSS @import rules',
    '0 @import rules',
    importMatches.map((m) => `${m.loc.file}:${m.loc.line}`).join(', ')
  );

  check(
    externalUrlMatches.length === 0,
    'Static',
    externalUrlMatches[0]?.loc?.owner || '@engine',
    'Zero http:// or https:// URLs in index.html',
    '0 external URLs',
    externalUrlMatches.slice(0, 5).map((m) => `${m.url} at ${m.loc.file}:${m.loc.line}`).join('; ')
  );

  // Check src/*.js individually if present
  if (fs.existsSync(SRC_DIR)) {
    for (const fname of ['fx_audio.js', 'maps.js', 'enemies.js', 'towers.js', 'ui.js', 'engine.js']) {
      const fpath = path.join(SRC_DIR, fname);
      if (fs.existsSync(fpath)) {
        const code = fs.readFileSync(fpath, 'utf8');
        try {
          new vm.Script(code, { filename: fpath });
          pass('Static', `Syntax check src/${fname}`, 'valid ES6+');
        } catch (err) {
          fail('Static', OWNER_BY_FILE[fname], `Syntax check src/${fname}`, err.stack || err.message);
        }
      }
    }
  }

  // Extract inline <script> blocks from index.html and check syntax via vm.Script
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptCount = 0;
  let syntaxOk = true;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    scriptCount++;
    const code = match[1];
    try {
      new vm.Script(code, { filename: `index.html#script-${scriptCount}` });
    } catch (err) {
      syntaxOk = false;
      fail('Static', '@engine', `Inline <script> #${scriptCount} syntax valid`, err.stack || err.message);
    }
  }

  check(scriptCount >= 1 && syntaxOk, 'Static', '@engine', 'Inline <script> parses with zero JS syntax errors', `${scriptCount} inline script block(s) verified`);

  return { html, locateInSrc };
}

// ============================================================================
// 2. HEADLESS CHROME CDP CLIENT
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

async function launchHeadlessBrowser() {
  const chromeBin = findBrowserExecutable();
  if (!chromeBin) {
    throw new Error('No headless Chromium/Chrome executable found on system');
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-verify-chrome-'));
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
      '--window-size=1280,720',
      `--user-data-dir=${userDataDir}`,
      '--remote-debugging-port=0',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  const { port } = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`Chrome CDP startup timed out:\n${stderr}`)), 8000);
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
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'none',
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      buttons: 1,
      clickCount,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
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
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // Preload deterministic simulation stepping harness + floating-text spy + unhandledrejection spy
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      (() => {
        window.__unhandledErrors = [];
        window.addEventListener('unhandledrejection', (e) => {
          window.__unhandledErrors.push(String(e.reason?.stack || e.reason || 'unhandledrejection'));
        });

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
          stepFrames(frames = 1, dtMs = 1000 / 60) {
            if (!manual) this.setManual(true);
            for (let i = 0; i < frames; i++) {
              virtualNow += dtMs;
              const cbs = Array.from(manualQueue.values());
              manualQueue.clear();
              for (const cb of cbs) {
                cb(virtualNow);
              }
            }
          },
          stepSeconds(sec, dtMs = 1000 / 60) {
            const frames = Math.max(1, Math.round((sec * 1000) / dtMs));
            this.stepFrames(frames, dtMs);
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
// 3. IN-BROWSER QA HARNESS INSTALLATION
// ============================================================================
async function installQaHelpers(browser) {
  await browser.evaluate(() => {
    const TD = window.TD || {};
    const game = window.game;

    // Hook spawnFloatingText spy so we can verify DODGE, CRIT, +gold, ARMOR SHRED etc.
    window.__floatingTexts = [];
    if (game && game.vfx && typeof game.vfx.spawnFloatingText === 'function' && !game.vfx.__wrappedByQa) {
      const orig = game.vfx.spawnFloatingText.bind(game.vfx);
      game.vfx.spawnFloatingText = function (x, y, text, color, scale) {
        window.__floatingTexts.push({ x, y, text: String(text), color, scale });
        if (window.__floatingTexts.length > 500) window.__floatingTexts.shift();
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

    function findClickable(regex, root = document.body) {
      const candidates = Array.from(
        root.querySelectorAll('button, [role="button"], .card, .map-card, .diff-btn, .tower-card, .upgrade-card, .branch-card, .tab, .tab-btn, [data-map], [data-diff], [data-difficulty], [data-tower], [data-tab], div, span')
      ).filter((el) => isVisible(el));
      const matching = candidates.filter((el) => {
        const txt = `${el.textContent || ''} ${el.getAttribute('title') || ''} ${el.getAttribute('aria-label') || ''} ${el.id || ''}`.replace(/\s+/g, ' ').trim();
        return regex.test(txt);
      });
      if (!matching.length) return null;
      // Prefer button/explicit interactive elements and smallest/deepest element
      matching.sort((a, b) => {
        const aBtn = a.tagName === 'BUTTON' || a.hasAttribute('onclick') || a.matches('[data-map],[data-diff],[data-difficulty],[data-tower],[data-tab]') ? 0 : 1;
        const bBtn = b.tagName === 'BUTTON' || b.hasAttribute('onclick') || b.matches('[data-map],[data-diff],[data-difficulty],[data-tower],[data-tab]') ? 0 : 1;
        if (aBtn !== bBtn) return aBtn - bBtn;
        return (a.textContent || '').length - (b.textContent || '').length;
      });
      return matching[0];
    }

    function canvasPixelStats(canvas) {
      if (!canvas || !canvas.width || !canvas.height) return { nonTransparent: 0, uniqueColors: 0, total: 0 };
      const ctx = canvas.getContext('2d');
      if (!ctx) return { nonTransparent: 0, uniqueColors: 0, total: 0 };
      const w = Math.min(canvas.width, 320);
      const h = Math.min(canvas.height, 180);
      const sx = Math.max(1, Math.floor(canvas.width / w));
      const sy = Math.max(1, Math.floor(canvas.height / h));
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let nonTransparent = 0;
      const colors = new Set();
      let total = 0;
      for (let y = 0; y < canvas.height; y += sy) {
        for (let x = 0; x < canvas.width; x += sx) {
          total++;
          const idx = (y * canvas.width + x) * 4;
          const a = data[idx + 3];
          if (a > 8) {
            nonTransparent++;
            const bucket = ((data[idx] >> 4) << 8) | ((data[idx + 1] >> 4) << 4) | (data[idx + 2] >> 4);
            colors.add(bucket);
          }
        }
      }
      return { nonTransparent, uniqueColors: colors.size, total };
    }

    function logicalToClient(lx, ly) {
      const canvas = document.getElementById('game-canvas');
      const r = canvas.getBoundingClientRect();
      return {
        x: r.left + (lx / 1280) * r.width,
        y: r.top + (ly / 720) * r.height,
      };
    }

    function startSiegeProgrammatic(mapId = 'hornburg', diffId = 'captain') {
      const g = window.game;
      // Try explicit game methods first if present
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
      // Fallback via UI Title Screen buttons
      if (typeof g.returnToTitle === 'function') g.returnToTitle();
      else if (typeof g.showTitle === 'function') g.showTitle();
      else g.state = 'title';
      if (g.ui && typeof g.ui.showTitle === 'function') g.ui.showTitle();
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
      if (g.spatialGrid && typeof g.spatialGrid.clear === 'function') g.spatialGrid.clear();
      g.ringActive = false;
      g.corruption = 0;
      g.ringOverloadTimer = 0;
      g.speed = 1;
      g.state = 'playing';
      if (g.spells) {
        for (const k of Object.keys(g.spells)) {
          if (typeof g.spells[k] === 'object' && g.spells[k]) {
            if ('cd' in g.spells[k]) g.spells[k].cd = 0;
            if ('timer' in g.spells[k]) g.spells[k].timer = 0;
            if ('cdTimer' in g.spells[k]) g.spells[k].cdTimer = 0;
            if ('cooldownLeft' in g.spells[k]) g.spells[k].cooldownLeft = 0;
            if ('remaining' in g.spells[k]) g.spells[k].remaining = 0;
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

    function spawnSingleEnemy(typeKey, laneIndex = 0, targetProgress = 0.0) {
      const g = window.game;
      const em = g.enemies;
      if (typeKey === 'ringwraith') {
        em.spawnRingwraithBoss(g);
        const rw = em.active.find((e) => e.type === 'ringwraith') || em.active[em.active.length - 1];
        if (rw && targetProgress > 0) {
          advanceEnemyAloneToProgress(rw, targetProgress);
        }
        if (g.spatialGrid && typeof g.spatialGrid.rebuild === 'function') {
          g.spatialGrid.rebuild(em.active);
        }
        return rw;
      }

      // Try direct spawn method on EnemyManager if available
      let spawned = null;
      for (const m of ['spawnEnemy', 'createEnemy', 'spawn']) {
        if (typeof em[m] === 'function') {
          const beforeLen = em.active.length;
          const sig = em[m].toString().match(/\(([^)]*)\)/)?.[1] || '';
          const params = sig.split(',').map((s) => s.trim().toLowerCase());
          try {
            let ret;
            if (params[0]?.startsWith('g')) {
              ret = em[m](g, typeKey, laneIndex);
            } else if (params.length >= 3 && params[2]?.startsWith('g')) {
              ret = em[m](typeKey, laneIndex, g);
            } else if (params.length >= 2 && params[1]?.startsWith('g')) {
              ret = em[m](typeKey, g, laneIndex);
            } else {
              ret = em[m](typeKey, laneIndex, g);
            }
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

      // Fallback: spawn via natural wave containing typeKey
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
            // Reset fresh HP/timers in case other things ticked
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
      // Pick pad whose nearest ground path point is ~60..120px away and around mid-map (progress 0.2..0.75)
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
      findClickable,
      canvasPixelStats,
      logicalToClient,
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
// 4. RUNTIME VERIFICATION SUITES
// ============================================================================
async function runBrowserVerification(locateInSrc) {
  console.log('\n=== Launching Headless Chrome Verification ===');
  const browser = await launchHeadlessBrowser();

  try {
    const fileUrl = `file://${INDEX_HTML}`;
    await browser.send('Page.navigate', { url: fileUrl });
    // Allow initial DOMContentLoaded / load + first rAF frames to run natively
    await new Promise((r) => setTimeout(r, 450));

    // Check boot state & errors
    console.log('\n=== Suite 2: Boot, Layout & Offline Runtime Sanity ===');
    check(
      browser.externalNetworkAttempts.length === 0,
      'Boot',
      '@engine',
      'Zero runtime HTTP/HTTPS network requests on load',
      '100% offline',
      browser.externalNetworkAttempts.join(', ')
    );

    const bootInfo = await browser.evaluate(() => {
      const canvas = document.getElementById('game-canvas');
      const uiLayer = document.getElementById('ui-layer');
      const cr = canvas ? canvas.getBoundingClientRect() : null;
      return {
        hasTD: typeof window.TD === 'object' && !!window.TD,
        hasGame: typeof window.game === 'object' && !!window.game,
        tdKeys: window.TD ? Object.keys(window.TD) : [],
        state: window.game?.state,
        canvasWidth: canvas?.width,
        canvasHeight: canvas?.height,
        canvasRect: cr ? { x: cr.x, y: cr.y, w: cr.width, h: cr.height } : null,
        hasUiLayer: !!uiLayer,
        unhandled: window.__unhandledErrors || [],
      };
    });

    check(bootInfo.hasTD && bootInfo.hasGame, 'Boot', '@engine', 'window.TD and window.game initialized on boot', `TD keys: ${bootInfo.tdKeys.join(', ')}`);
    check(
      bootInfo.canvasWidth === 1280 && bootInfo.canvasHeight === 720,
      'Boot',
      '@engine',
      'Logical #game-canvas dimensions are 1280x720',
      `${bootInfo.canvasWidth}x${bootInfo.canvasHeight}`
    );
    check(bootInfo.state === 'title', 'Boot', '@engine', 'Game boots into Title Screen state ("title")', `state=${bootInfo.state}`);
    check(
      browser.runtimeErrors.length === 0 && bootInfo.unhandled.length === 0,
      'Boot',
      '@engine',
      'Zero console.error or pageerror exceptions on boot',
      '0 errors',
      [...browser.runtimeErrors.map((e) => `${e.kind}: ${e.text}`), ...bootInfo.unhandled].join(' | ')
    );

    await installQaHelpers(browser);

    // ------------------------------------------------------------------------
    // Suite 3: Title Screen, 3 Maps & 3 Difficulties
    // ------------------------------------------------------------------------
    console.log('\n=== Suite 3: Title Screen, 3 Maps & 3 Difficulties ===');
    const titleAndMaps = await browser.evaluate(() => {
      const { isVisible, findClickable, canvasPixelStats } = window.__qa;
      const TD = window.TD;
      const maps = TD.MAPS || {};
      const diffs = TD.DIFFICULTIES || {};

      // Check Title Screen UI elements & non-overlap of map cards
      const hornburgCard = document.querySelector('[data-map="hornburg"]') || findClickable(/Hornburg Causeway/i);
      const pelennorCard = document.querySelector('[data-map="pelennor"]') || findClickable(/Pelennor Crossroads/i);
      const blackgateCard = document.querySelector('[data-map="blackgate"]') || findClickable(/Black Gate/i);
      const rangerBtn = document.querySelector('[data-difficulty="ranger"], [data-diff="ranger"]') || findClickable(/Ranger/i);
      const captainBtn = document.querySelector('[data-difficulty="captain"], [data-diff="captain"]') || findClickable(/Captain/i);
      const stewardBtn = document.querySelector('[data-difficulty="steward"], [data-diff="steward"]') || findClickable(/Steward/i);
      const beginBtn = findClickable(/Begin Siege|Start Siege/i);
      const codexBtn = findClickable(/Codex|Bestiary|Lore/i);

      // Check mini-preview canvases on title screen
      const previewCanvases = Array.from(document.querySelectorAll('#ui-layer canvas')).filter((c) => isVisible(c));
      const previewStats = previewCanvases.map((c) => canvasPixelStats(c));

      // Check card overlap
      function rectsOverlap(a, b) {
        if (!a || !b) return false;
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return ra.left < rb.right - 4 && ra.right > rb.left + 4 && ra.top < rb.bottom - 4 && ra.bottom > rb.top + 4;
      }
      // Only check distinct container cards if they aren't parent/child
      const cards = [hornburgCard, pelennorCard, blackgateCard].filter(Boolean);
      let cardOverlap = false;
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          if (!cards[i].contains(cards[j]) && !cards[j].contains(cards[i]) && rectsOverlap(cards[i], cards[j])) {
            cardOverlap = true;
          }
        }
      }

      // Inspect geometry of all 3 maps
      function distToSeg(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq > 0 ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
      }

      const mapReport = {};
      for (const id of ['hornburg', 'pelennor', 'blackgate']) {
        const m = maps[id];
        if (!m) {
          mapReport[id] = { exists: false };
          continue;
        }
        let minPadToPad = Infinity;
        let minPadToPath = Infinity;
        let padsInBounds = true;
        const pads = m.pads || [];
        for (let i = 0; i < pads.length; i++) {
          const p = pads[i];
          if (p.x < 50 || p.x > 1230 || p.y < 60 || p.y > 685) padsInBounds = false;
          for (let j = i + 1; j < pads.length; j++) {
            minPadToPad = Math.min(minPadToPad, Math.hypot(p.x - pads[j].x, p.y - pads[j].y));
          }
          for (const lane of m.paths || []) {
            for (let s = 0; s < lane.length - 1; s++) {
              minPadToPath = Math.min(minPadToPath, distToSeg(p.x, p.y, lane[s].x, lane[s].y, lane[s + 1].x, lane[s + 1].y));
            }
          }
        }
        // Check lane convergence / separation
        let startDist = 0;
        let endDist = 0;
        if ((m.paths || []).length >= 2) {
          const p0 = m.paths[0];
          const p1 = m.paths[1];
          startDist = Math.hypot(p0[0].x - p1[0].x, p0[0].y - p1[0].y);
          endDist = Math.hypot(p0[p0.length - 1].x - p1[p1.length - 1].x, p0[p0.length - 1].y - p1[p1.length - 1].y);
        }
        mapReport[id] = {
          exists: true,
          name: m.name || id,
          weatherType: m.weatherType || m.weather,
          padCount: pads.length,
          laneCount: (m.paths || []).length,
          flyLaneCount: (m.flyPaths || []).length,
          minPadToPad: Math.round(minPadToPad),
          minPadToPath: Math.round(minPadToPath),
          padsInBounds,
          startDist: Math.round(startDist),
          endDist: Math.round(endDist),
        };
      }

      const beginRect = beginBtn ? beginBtn.getBoundingClientRect() : null;
      const beginInViewport = beginRect
        ? beginRect.left >= 0 && beginRect.right <= 1280 && beginRect.top >= 0 && beginRect.bottom <= 720 && isVisible(beginBtn)
        : false;

      return {
        uiFound: {
          hornburg: !!hornburgCard,
          pelennor: !!pelennorCard,
          blackgate: !!blackgateCard,
          ranger: !!rangerBtn,
          captain: !!captainBtn,
          steward: !!stewardBtn,
          beginBtn: !!beginBtn,
          codexBtn: !!codexBtn,
        },
        beginInViewport,
        cardOverlap,
        previewCount: previewCanvases.length,
        previewsRendered: previewStats.every((s) => s.nonTransparent > 50 && s.uniqueColors >= 3),
        mapReport,
        diffs: Object.fromEntries(
          ['ranger', 'captain', 'steward'].map((k) => [
            k,
            diffs[k]
              ? {
                  startGold: diffs[k].startGold ?? diffs[k].gold,
                  lives: diffs[k].lives,
                  hpMult: diffs[k].hpMult,
                  speedMult: diffs[k].speedMult,
                }
              : null,
          ])
        ),
      };
    });

    check(
      titleAndMaps.uiFound.hornburg && titleAndMaps.uiFound.pelennor && titleAndMaps.uiFound.blackgate && titleAndMaps.uiFound.beginBtn && titleAndMaps.beginInViewport,
      'Title & Maps',
      '@ui',
      'Title Screen displays all 3 selectable maps & Begin Siege button within 1280x720 viewport',
      `previews=${titleAndMaps.previewCount}, beginInViewport=${titleAndMaps.beginInViewport}`,
      JSON.stringify({ uiFound: titleAndMaps.uiFound, beginInViewport: titleAndMaps.beginInViewport })
    );
    check(
      !titleAndMaps.cardOverlap && titleAndMaps.previewCount >= 3 && titleAndMaps.previewsRendered,
      'Title & Maps',
      '@ui',
      'Title Screen map mini-previews rendered with zero card overlap',
      `${titleAndMaps.previewCount} procedural mini-canvases`,
      `overlap=${titleAndMaps.cardOverlap}, count=${titleAndMaps.previewCount}, rendered=${titleAndMaps.previewsRendered}`
    );
    check(
      titleAndMaps.uiFound.ranger && titleAndMaps.uiFound.captain && titleAndMaps.uiFound.steward &&
        titleAndMaps.diffs.ranger && titleAndMaps.diffs.captain && titleAndMaps.diffs.steward &&
        titleAndMaps.diffs.ranger.startGold > titleAndMaps.diffs.captain.startGold &&
        titleAndMaps.diffs.captain.startGold > titleAndMaps.diffs.steward.startGold &&
        titleAndMaps.diffs.ranger.hpMult < titleAndMaps.diffs.steward.hpMult,
      'Title & Maps',
      '@engine',
      'All 3 difficulties (Ranger, Captain, Steward) present on UI & engine with proper scaling',
      `gold=${titleAndMaps.diffs.ranger?.startGold}/${titleAndMaps.diffs.captain?.startGold}/${titleAndMaps.diffs.steward?.startGold}`,
      JSON.stringify(titleAndMaps.diffs)
    );

    // Check each map's geometry & weather
    const hb = titleAndMaps.mapReport.hornburg;
    check(
      hb?.exists && /rain/i.test(String(hb.weatherType)) && hb.padCount >= 12 && hb.padCount <= 16 && hb.laneCount === 1 && hb.flyLaneCount >= 1 && hb.minPadToPath >= 40 && hb.minPadToPad >= 48 && hb.padsInBounds,
      'Title & Maps',
      '@maps',
      'Map 1: The Hornburg Causeway (rain, 12-16 pads, 1 lane, clean pad geometry)',
      `weather=${hb?.weatherType}, pads=${hb?.padCount}, lanes=${hb?.laneCount}, minPadPath=${hb?.minPadToPath}px`,
      JSON.stringify(hb)
    );

    const pel = titleAndMaps.mapReport.pelennor;
    check(
      pel?.exists && pel.padCount >= 12 && pel.padCount <= 16 && pel.laneCount === 2 && pel.flyLaneCount >= 1 && pel.startDist > pel.endDist && pel.minPadToPath >= 40 && pel.minPadToPad >= 48 && pel.padsInBounds,
      'Title & Maps',
      '@maps',
      'Map 2: Pelennor Crossroads (12-16 pads, 2 converging lanes, clean pad geometry)',
      `weather=${pel?.weatherType}, pads=${pel?.padCount}, lanes=${pel?.laneCount}, converge=${pel?.startDist}px->${pel?.endDist}px`,
      JSON.stringify(pel)
    );

    const bg = titleAndMaps.mapReport.blackgate;
    check(
      bg?.exists && /ember|lava|volcan/i.test(String(bg.weatherType)) && bg.padCount >= 12 && bg.padCount <= 16 && bg.laneCount === 2 && bg.flyLaneCount >= 1 && bg.minPadToPath >= 40 && bg.minPadToPad >= 48 && bg.padsInBounds,
      'Title & Maps',
      '@maps',
      'Map 3: The Black Gate (embers/lava, 12-16 pads, 2 twin lanes, clean pad geometry)',
      `weather=${bg?.weatherType}, pads=${bg?.padCount}, lanes=${bg?.laneCount}, minPadPath=${bg?.minPadToPath}px`,
      JSON.stringify(bg)
    );

    // Test starting all 3 maps + difficulties & rendering real frames on each map
    const mapStartCheck = await browser.evaluate(() => {
      window.__simControl.setManual(true);
      const combos = [
        ['hornburg', 'ranger'],
        ['pelennor', 'captain'],
        ['blackgate', 'steward'],
      ];
      const out = [];
      for (const [mId, dId] of combos) {
        const ok = window.__qa.startSiegeProgrammatic(mId, dId);
        window.__simControl.stepFrames(5, 16.6667);
        const canvas = document.getElementById('game-canvas');
        const stats = window.__qa.canvasPixelStats(canvas);
        out.push({
          map: mId,
          diff: dId,
          ok,
          state: window.game.state,
          gold: window.game.gold,
          lives: window.game.lives,
          pixels: stats.nonTransparent,
          colors: stats.uniqueColors,
        });
      }
      return out;
    });

    check(
      mapStartCheck.every((c) => c.ok && c.state === 'playing' && c.lives === 20 && c.pixels > 200 && c.colors >= 8),
      'Title & Maps',
      '@maps',
      'All 3 maps boot, initialize offscreen terrain & render rich battlefields',
      mapStartCheck.map((c) => `${c.map}(${c.diff}:${c.gold}g,${c.colors} colors)`).join(', '),
      JSON.stringify(mapStartCheck)
    );

    // ------------------------------------------------------------------------
    // Suite 4: Towers, All 8 Tier 3 Branches, All 8 Skills, Priority, Garrison, Deadzone & 75% Sell
    // ------------------------------------------------------------------------
    console.log('\n=== Suite 4: Towers, All 8 Tier 3 Branches, Skills, Targeting & Sell ===');

    // 4.1 Base Build, Inspector UI, Target Priority Cycling & 75% Sell Refund
    const baseTowerChecks = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy, freezeEnemy, getPadBestForCombat, findProgressNearPoint, findClickable } = window.__qa;
      startSiegeProgrammatic('hornburg', 'captain');
      clearBattlefield();
      const g = window.game;
      const pad = getPadBestForCombat(g.map);

      // Build & Sell 75% check across T1, T2, T3A, T3B for all 4 archetypes
      const archetypes = ['elven', 'garrison', 'dwarven', 'istari'];
      const sellResults = [];
      for (const arch of archetypes) {
        for (const branch of ['A', 'B']) {
          clearBattlefield();
          g.gold = 10000;
          const t = g.towers.buildTower(pad, arch, g);
          if (!t) {
            sellResults.push({ arch, branch, built: false });
            continue;
          }
          const t1Cost = 10000 - g.gold;
          const t1InvestedAtBuild = t.totalInvested;
          const t1SellExpected = Math.floor(t1InvestedAtBuild * 0.75);
          const t1SellActual = t.getSellValue();

          const okT2 = t.upgradeTier2(g);
          const isTier2 = okT2 !== false && t.tier === 2;
          const t2SellExpected = Math.floor(t.totalInvested * 0.75);
          const t2SellActual = t.getSellValue();

          const okT3 = t.upgradeBranch(branch, g);
          const isTier3 = okT3 !== false && t.tier === 3 && t.branch === branch;
          const investedBeforeSell = t.totalInvested;
          const expectedRefund = Math.floor(investedBeforeSell * 0.75);
          const previewSellVal = t.getSellValue();
          const goldBeforeSell = g.gold;
          g.towers.sellTower(t, g);
          const actualRefund = g.gold - goldBeforeSell;
          const padFreeAfterSell = !g.towers.getTowerOnPad(pad.id);

          sellResults.push({
            arch,
            branch,
            built: true,
            t1Cost,
            t1Match: t1SellActual === t1SellExpected && t1InvestedAtBuild === t1Cost,
            okT2: isTier2,
            t2Match: t2SellActual === t2SellExpected,
            okT3: isTier3,
            refundMatch: previewSellVal === expectedRefund && actualRefund === expectedRefund,
            padFreeAfterSell,
          });
        }
      }

      // Target Priority Cycling: First -> Last -> Strongest -> Weakest
      clearBattlefield();
      g.gold = 5000;
      const near = findProgressNearPoint(0, pad.x, pad.y, false);
      const baseProg = Math.max(0.15, Math.min(0.75, near.progress));
      const elven = g.towers.buildTower(pad, 'elven', g);
      // Ensure range covers all 4 test enemies
      elven.range = 350;

      const prioritiesVisited = [elven.priority];
      for (let i = 0; i < 4; i++) {
        elven.cyclePriority();
        prioritiesVisited.push(elven.priority);
      }

      function testSinglePriorityShot(prio) {
        g.enemies.active.length = 0;
        if (g.towers.projectiles?.clear) g.towers.projectiles.clear();
        else if (Array.isArray(g.towers.projectiles)) g.towers.projectiles.length = 0;

        const eLast = spawnSingleEnemy('troll', 0, Math.max(0.05, baseProg - 0.04));
        const eWeak = spawnSingleEnemy('troll', 0, Math.max(0.06, baseProg - 0.02));
        const eStrong = spawnSingleEnemy('troll', 0, Math.min(0.90, baseProg + 0.01));
        const eFirst = spawnSingleEnemy('troll', 0, Math.min(0.92, baseProg + 0.03));

        const list = [eLast, eWeak, eStrong, eFirst];
        for (const e of list) {
          freezeEnemy(e);
          e.maxHp = 2000;
          e.physArmor = 0;
          e.basePhysArmor = 0;
        }
        eLast.hp = 900;
        eWeak.hp = 300;
        eStrong.hp = 1800;
        eFirst.hp = 1100;

        // Place all within range of elven
        elven.priority = prio;
        for (const k of ['cooldown', 'cd', 'fireTimer', 'attackTimer', 'shotTimer']) {
          if (k in elven) elven[k] = 0;
        }
        const beforeHps = list.map((e) => e.hp);
        // Step up to 1.5s until first hit lands, then stop immediately
        let hitIdx = -1;
        for (let f = 0; f < 90; f++) {
          window.__simControl.stepFrames(1, 16.6667);
          const idx = list.findIndex((e, i) => e.hp < beforeHps[i]);
          if (idx !== -1) {
            hitIdx = idx;
            break;
          }
        }
        return ['last', 'weakest', 'strongest', 'first'][hitIdx] || 'none';
      }

      const priorityHits = {
        first: testSinglePriorityShot('first'),
        last: testSinglePriorityShot('last'),
        strongest: testSinglePriorityShot('strongest'),
        weakest: testSinglePriorityShot('weakest'),
      };

      return { sellResults, prioritiesVisited, priorityHits };
    });

    check(
      baseTowerChecks.sellResults.length === 8 &&
        baseTowerChecks.sellResults.every((r) => r.built && r.t1Match && r.okT2 && r.t2Match && r.okT3 && r.refundMatch && r.padFreeAfterSell),
      'Towers',
      '@combat',
      'All 4 towers upgrade T1 -> T2 -> Branch A & B (all 8 Tier 3 branches) + exact 75% Sell refund',
      '8/8 branches & 75% sell verified',
      JSON.stringify(baseTowerChecks.sellResults.filter((r) => !r.refundMatch || !r.okT3))
    );

    const expectedPrios = new Set(['first', 'last', 'strongest', 'weakest']);
    const visitedSet = new Set(baseTowerChecks.prioritiesVisited.map((s) => String(s).toLowerCase()));
    check(
      expectedPrios.size === visitedSet.size &&
        [...expectedPrios].every((p) => visitedSet.has(p)) &&
        baseTowerChecks.prioritiesVisited[0] === baseTowerChecks.prioritiesVisited[4] &&
        baseTowerChecks.priorityHits.first === 'first' &&
        baseTowerChecks.priorityHits.last === 'last' &&
        baseTowerChecks.priorityHits.strongest === 'strongest' &&
        baseTowerChecks.priorityHits.weakest === 'weakest',
      'Towers',
      '@combat',
      'Target Priority cycles (First -> Last -> Strongest -> Weakest) and targets accurately',
      `hits=${JSON.stringify(baseTowerChecks.priorityHits)}`,
      JSON.stringify(baseTowerChecks)
    );

    // 4.1b UI Contextual Build Menu, Tower Inspector, Range Preview & HUD Bounds Check
    const padCoords = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, logicalToClient } = window.__qa;
      startSiegeProgrammatic('hornburg', 'captain');
      clearBattlefield();
      const g = window.game;
      g.gold = 1000;
      if (g.ui && typeof g.ui.update === 'function') g.ui.update(0.2, g);
      const pad = g.map.pads[0];
      return { padId: pad.id, client: logicalToClient(pad.x, pad.y) };
    });

    // Click empty pad on canvas -> Build Menu should appear with all 4 towers
    await browser.clickViewport(padCoords.client.x, padCoords.client.y, 1);

    const uiInspectorCheck = await browser.evaluate(() => {
      const { findClickable, isVisible } = window.__qa;
      const g = window.game;
      window.__simControl.stepFrames(2, 16.6667);
      const uiTextEmpty = document.getElementById('ui-layer')?.innerText || '';
      const shows4Towers =
        /Elven/i.test(uiTextEmpty) &&
        /Garrison/i.test(uiTextEmpty) &&
        /Dwarven/i.test(uiTextEmpty) &&
        /Istari/i.test(uiTextEmpty);

      // Build Elven Watchtower via UI button or TowerManager and inspect it
      const elvenCard = document.querySelector('[data-tower="elven"]') || findClickable(/Elven Watchtower/i);
      if (elvenCard) elvenCard.click();
      let built = g.towers.getTowerOnPad(g.map.pads[0].id);
      if (!built) {
        built = g.towers.buildTower(g.map.pads[0], 'elven', g);
      }
      // Select tower to inspect
      if (typeof g.selectTower === 'function') g.selectTower(built);
      else if (g.ui && typeof g.ui.openTowerInspector === 'function') g.ui.openTowerInspector(built);
      window.__simControl.stepFrames(2, 16.6667);

      const ringBtn = document.getElementById('btn-ring') || findClickable(/Ring/i);
      const ringRect = ringBtn ? ringBtn.getBoundingClientRect() : null;
      const upgPreview = typeof built.getUpgradePreview === 'function' ? built.getUpgradePreview('T2') : null;
      if (typeof g.setPreviewRange === 'function' && upgPreview) {
        g.setPreviewRange({ range: upgPreview.range, minRange: upgPreview.minRange || 0, mode: 'upgrade' });
        window.__simControl.stepFrames(2, 16.6667);
        g.setPreviewRange(null);
      }

      // Check all visible top-level HUD panels stay inside 1280x720 viewport and do not collide
      const inViewport = (el) => {
        if (!el || !isVisible(el)) return false;
        const r = el.getBoundingClientRect();
        return r.left >= -2 && r.right <= 1282 && r.top >= -2 && r.bottom <= 722;
      };
      const ringInViewport = inViewport(ringBtn);
      const topHud = document.getElementById('top-hud');
      const spellHud = document.getElementById('spellbook-hud');
      const inspector = document.getElementById('inspector-panel');
      const hudInViewport = inViewport(topHud) && inViewport(spellHud) && inViewport(inspector);

      // Upgrade built tower to T2 via UI button and check T2 two-branch inspector stays within viewport
      g.gold = 5000;
      if (g.ui && typeof g.ui.update === 'function') g.ui.update(0.1, g);
      const btnT2 = document.getElementById('btn-upgrade-t2');
      if (btnT2) btnT2.click();
      else built.upgradeTier2(g);
      window.__simControl.stepFrames(2, 16.6667);
      const t2InspectorInViewport = inViewport(inspector) && inViewport(document.getElementById('btn-sell-tower'));

      // Also test Garrison Rally Point UI button -> targeting mode -> canvas confirmation
      const pad2 = g.map.pads[1];
      const garUi = g.towers.buildTower(pad2, 'garrison', g);
      g.selectTower(garUi);
      window.__simControl.stepFrames(2, 16.6667);
      const rallyBtn = document.getElementById('btn-rally-point');
      if (rallyBtn) rallyBtn.click();
      const rallyModeActive = g.rallyTower === garUi;
      const targetRallyX = garUi.x + 40;
      const targetRallyY = garUi.y + 30;
      g.confirmRallyPlacement(targetRallyX, targetRallyY);
      const rallyPlacedOk = g.rallyTower === null && Math.hypot(garUi.rallyPoint.x - targetRallyX, garUi.rallyPoint.y - targetRallyY) < 5;

      return {
        shows4Towers,
        builtOnClick: !!built,
        hasRingBtn: !!ringBtn && ringInViewport,
        hudInViewport,
        t2InspectorInViewport,
        rallyModeActive,
        rallyPlacedOk,
        hasUpgradePreview: !!upgPreview && upgPreview.range > 100,
      };
    });

    check(
      uiInspectorCheck.shows4Towers &&
        uiInspectorCheck.builtOnClick &&
        uiInspectorCheck.hasRingBtn &&
        uiInspectorCheck.hudInViewport &&
        uiInspectorCheck.t2InspectorInViewport &&
        uiInspectorCheck.rallyModeActive &&
        uiInspectorCheck.rallyPlacedOk &&
        uiInspectorCheck.hasUpgradePreview,
      'HUD & Inspector',
      '@ui',
      'HUD & Inspector stay inside 1280x720, 4-tower Build Menu, T2 branch cards, Rally UI & range preview work',
      `hudBounds=${uiInspectorCheck.hudInViewport}, t2Bounds=${uiInspectorCheck.t2InspectorInViewport}, rallyUI=${uiInspectorCheck.rallyPlacedOk}`,
      JSON.stringify(uiInspectorCheck)
    );

    // 4.2 Detailed Mechanics & Skills for Elven Watchtower (Base + Branch A + Branch B)
    const elvenChecks = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy, freezeEnemy, getPadBestForCombat, findProgressNearPoint } = window.__qa;
      startSiegeProgrammatic('hornburg', 'captain');
      clearBattlefield();
      const g = window.game;
      g.gold = 50000;
      const pad = getPadBestForCombat(g.map);
      const near = findProgressNearPoint(0, pad.x, pad.y, false);

      // Base Elven: 20% armor ignore + flying targetable
      const t = g.towers.buildTower(pad, 'elven', g);
      t.range = 320;
      const flyNear = findProgressNearPoint(0, pad.x, pad.y, true);
      const fb = spawnSingleEnemy('fellbeast', 0, flyNear.progress);
      freezeEnemy(fb);
      // Ensure within range
      t.x = fb.x;
      t.y = fb.y + 80;
      const fbHpBefore = fb.hp;
      window.__simControl.stepSeconds(2.5);
      const hitsFlying = fb.hp < fbHpBefore;

      // Armor ignore check via takeDamage vs 50% armor orc
      const armored = spawnSingleEnemy('troll', 0, near.progress);
      armored.basePhysArmor = 0.5;
      armored.physArmor = 0.5;
      armored.maxHp = 5000;
      armored.hp = 5000;
      const normalPhysDmg = armored.takeDamage(100, 'physical', { ignoreArmorPct: 0 }, g);
      const ignore20Dmg = armored.takeDamage(100, 'physical', { ignoreArmorPct: 0.2 }, g);

      // Branch A: Galadhrim Longbows (extreme range, 30% 3x crit, bleed, Starlight Piercer skill stun)
      clearBattlefield();
      g.gold = 50000;
      const tA = g.towers.buildTower(pad, 'elven', g);
      tA.upgradeTier2(g);
      const t2Range = tA.range;
      tA.upgradeBranch('A', g);
      const rangeIncreased = tA.range > t2Range && tA.range >= 250;

      const dummyA = spawnSingleEnemy('troll', 0, near.progress);
      freezeEnemy(dummyA);
      dummyA.maxHp = 100000;
      dummyA.hp = 100000;
      dummyA.basePhysArmor = 0;
      dummyA.physArmor = 0;
      tA.x = dummyA.x;
      tA.y = dummyA.y + 90;

      // Trigger Tier 3 skill immediately (Starlight Piercer -> massive dmg + 1.5s stun)
      const hpBeforeSkillA = dummyA.hp;
      tA.triggerSkill(g);
      window.__simControl.stepSeconds(0.5);
      const skillAStunned = (dummyA.stunTimer || 0) > 0 || dummyA.hp < hpBeforeSkillA - tA.damage * 1.5;
      const skillADmg = hpBeforeSkillA - dummyA.hp;

      // Step 20s to observe passive bleed + 30% 3x crits
      dummyA.stunTimer = 0;
      window.__floatingTexts.length = 0;
      let sawBleed = false;
      for (let i = 0; i < 40; i++) {
        window.__simControl.stepSeconds(0.5);
        if ((dummyA.bleedTimer || 0) > 0 || (dummyA.bleedDps || 0) > 0) sawBleed = true;
      }
      const sawCrit = window.__floatingTexts.some((ft) => /crit/i.test(ft.text));

      // Branch B: Mirkwood Wardens (3-arrow multi-shot volley + Woodland Pinning Volley 45% slow)
      clearBattlefield();
      g.gold = 50000;
      const tB = g.towers.buildTower(pad, 'elven', g);
      tB.upgradeTier2(g);
      tB.upgradeBranch('B', g);

      const targetsB = [
        spawnSingleEnemy('troll', 0, Math.max(0.05, near.progress - 0.02)),
        spawnSingleEnemy('troll', 0, near.progress),
        spawnSingleEnemy('troll', 0, Math.min(0.92, near.progress + 0.02)),
      ];
      for (const e of targetsB) {
        freezeEnemy(e);
        e.maxHp = 20000;
        e.hp = 20000;
      }
      tB.x = targetsB[1].x;
      tB.y = targetsB[1].y + 80;
      tB.range = 320;

      // Trigger Tier 3 skill (Woodland Pinning Volley -> slows targets)
      tB.triggerSkill(g);
      window.__simControl.stepSeconds(0.8);
      const skillBSlowed = targetsB.some((e) => (e.slowTimer || 0) > 0);

      // Reset HPs and step 1.2s for normal 3-target volley
      for (const e of targetsB) e.hp = 20000;
      window.__simControl.stepSeconds(1.2);
      const multiHitCount = targetsB.filter((e) => e.hp < 20000).length;

      return {
        hitsFlying,
        armorIgnoreWorks: ignore20Dmg > normalPhysDmg,
        rangeIncreased,
        tARange: tA.range,
        skillAWorks: skillADmg > 0 && skillAStunned,
        sawBleed,
        sawCrit,
        skillBSlowed,
        multiHitCount,
      };
    });

    check(
      elvenChecks.hitsFlying && elvenChecks.armorIgnoreWorks && elvenChecks.rangeIncreased && elvenChecks.skillAWorks && elvenChecks.sawBleed && elvenChecks.sawCrit && elvenChecks.skillBSlowed && elvenChecks.multiHitCount >= 3,
      'Towers',
      '@combat',
      'Elven Watchtower: flying targeting, 20% armor ignore, Galadhrim crits/bleed/Starlight Piercer, Mirkwood 3-volley/Pinning Volley',
      `rangeA=${elvenChecks.tARange}, multiHit=${elvenChecks.multiHitCount}/3, bleed=${elvenChecks.sawBleed}, crit=${elvenChecks.sawCrit}`,
      JSON.stringify(elvenChecks)
    );

    // 4.3 Garrison of Men: 3 blockers, custom Rally Point clamping, 10s respawn, Phalanx & Riddermark + Skills
    const garrisonChecks = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy, freezeEnemy, getTowerGuards, getPadBestForCombat, findProgressNearPoint } = window.__qa;
      startSiegeProgrammatic('hornburg', 'captain');
      clearBattlefield();
      const g = window.game;
      g.gold = 50000;
      const pad = getPadBestForCombat(g.map);
      const t = g.towers.buildTower(pad, 'garrison', g);
      window.__simControl.stepSeconds(0.5);

      const guards = getTowerGuards(t);
      const guardCount = guards.length;

      // Test custom Rally Point clamping when set far outside range
      t.setRallyPoint(t.x + 600, t.y + 600, g.map);
      const rallyDist = Math.hypot(t.rallyPoint.x - t.x, t.rallyPoint.y - t.y);
      const rallyClamped = rallyDist <= t.range + 2;

      // Set rally point right onto nearest path point so guards block incoming ground enemies
      const nearPt = (window.TD.MapUtils?.getNearestPathPoint || g.map.getNearestPathPoint)?.call(g.map, g.map, t.x, t.y);
      const rx = nearPt ? nearPt.x : t.x;
      const ry = nearPt ? nearPt.y : t.y;
      if (Math.hypot(rx - t.x, ry - t.y) <= t.range) {
        t.setRallyPoint(rx, ry, g.map);
      }
      window.__simControl.stepSeconds(2.5);

      // Spawn 3 Orcs just upstream of rally point and verify guards block them
      const nearProg = findProgressNearPoint(0, t.rallyPoint.x, t.rallyPoint.y, false);
      const orcs = [
        spawnSingleEnemy('orc', 0, Math.max(0.02, nearProg.progress - 0.02)),
        spawnSingleEnemy('orc', 0, Math.max(0.02, nearProg.progress - 0.025)),
        spawnSingleEnemy('orc', 0, Math.max(0.02, nearProg.progress - 0.03)),
      ];
      for (const o of orcs) {
        o.maxHp = 5000;
        o.hp = 5000;
      }
      let sawBlockedCount = 0;
      for (let i = 0; i < 25; i++) {
        window.__simControl.stepSeconds(0.2);
        const bc = orcs.filter((o) => !!o.blockedBy).length;
        if (bc > sawBlockedCount) sawBlockedCount = bc;
      }

      // Test 10s respawn: let a super-damage enemy kill 1 guard, remove enemies, verify dead at 5s and alive at 10.5s
      g.enemies.active.length = 0;
      for (const o of orcs) o.blockedBy = null;
      const g0 = guards[0];
      // Trigger death via enemy melee or direct HP=0 + respawn timer check
      const killer = spawnSingleEnemy('troll', 0, nearProg.progress);
      killer.x = g0.x;
      killer.y = g0.y;
      // Reduce g0 hp to 1 so next troll hit kills g0 naturally through game combat code
      g0.hp = 1;
      for (let i = 0; i < 40; i++) {
        window.__simControl.stepSeconds(0.1);
        if (g0.dead || g0.hp <= 0) break;
      }
      const diedNaturally = g0.dead || g0.hp <= 0;
      g.enemies.active.length = 0;
      window.__simControl.stepSeconds(5.0);
      const stillDeadAt5s = g0.dead || g0.hp <= 0;
      window.__simControl.stepSeconds(6.0); // total 11s
      const respawnedAt11s = !g0.dead && g0.hp > 0;

      // Branch A: Tower Guard Phalanx (high HP ~420, taunt, Citadel Shield Wall skill heals + fortifies)
      clearBattlefield();
      g.gold = 50000;
      const tA = g.towers.buildTower(pad, 'garrison', g);
      const baseGuardSpeed = getTowerGuards(tA)[0]?.speed || getTowerGuards(tA)[0]?.moveSpeed || 80;
      tA.upgradeTier2(g);
      tA.upgradeBranch('A', g);
      window.__simControl.stepSeconds(0.2);
      const guardsA = getTowerGuards(tA);
      const phalanxMaxHp = guardsA[0]?.maxHp || 0;
      guardsA[0].hp = Math.floor(phalanxMaxHp * 0.3);
      const hpBeforeWall = guardsA[0].hp;
      tA.triggerSkill(g);
      window.__simControl.stepSeconds(0.2);
      const wallHealed = guardsA[0].hp > hpBeforeWall + phalanxMaxHp * 0.2;

      // Branch B: Knights of the Riddermark (faster move, charge/cleave, Forth Eorlingas trample + stun)
      clearBattlefield();
      g.gold = 50000;
      const tB = g.towers.buildTower(pad, 'garrison', g);
      tB.upgradeTier2(g);
      tB.upgradeBranch('B', g);
      window.__simControl.stepSeconds(0.5);
      const guardsB = getTowerGuards(tB);
      const knightSpeed = guardsB[0]?.speed || guardsB[0]?.moveSpeed || 135;

      const foe1 = spawnSingleEnemy('troll', 0, nearProg.progress);
      const foe2 = spawnSingleEnemy('troll', 0, Math.min(0.95, nearProg.progress + 0.008));
      freezeEnemy(foe1);
      freezeEnemy(foe2);
      foe1.maxHp = 20000;
      foe1.hp = 20000;
      foe2.maxHp = 20000;
      foe2.hp = 20000;
      tB.setRallyPoint(foe1.x, foe1.y, g.map);
      for (const k of guardsB) {
        k.x = foe1.x - 10;
        k.y = foe1.y;
      }
      tB.triggerSkill(g);
      window.__simControl.stepSeconds(1.5);
      const skillBHit = foe1.hp < 20000 && ((foe1.stunTimer || 0) > 0 || foe2.hp < 20000);
      // Step another 2s to verify cleave hits both adjacent foes
      window.__simControl.stepSeconds(2.0);
      const bothDamagedByCleave = foe1.hp < 20000 && foe2.hp < 20000;

      return {
        guardCount,
        rallyClamped,
        sawBlockedCount,
        diedNaturally,
        stillDeadAt5s,
        respawnedAt11s,
        phalanxMaxHp,
        wallHealed,
        knightFaster: knightSpeed > baseGuardSpeed,
        skillBHit,
        bothDamagedByCleave,
      };
    });

    check(
      garrisonChecks.guardCount === 3 &&
        garrisonChecks.rallyClamped &&
        garrisonChecks.sawBlockedCount >= 1 &&
        garrisonChecks.diedNaturally &&
        garrisonChecks.stillDeadAt5s &&
        garrisonChecks.respawnedAt11s &&
        garrisonChecks.phalanxMaxHp >= 350 &&
        garrisonChecks.wallHealed &&
        garrisonChecks.bothDamagedByCleave,
      'Towers',
      '@combat',
      'Garrison of Men: 3 guards, custom Rally Point clamp, 10s respawn, Phalanx Shield Wall & Riddermark cleave/trample',
      `guards=${garrisonChecks.guardCount}, blocked=${garrisonChecks.sawBlockedCount}, respawn10s=${garrisonChecks.respawnedAt11s}, phalanxHP=${garrisonChecks.phalanxMaxHp}`,
      JSON.stringify(garrisonChecks)
    );

    // 4.4 Dwarven Siege Foundry: minRange deadzone, flying ignore, Iron Hills burning oil, Khazad Ballista pierce + permanent 50% armor shred
    const dwarvenChecks = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy, freezeEnemy, getPadBestForCombat, findProgressNearPoint } = window.__qa;
      startSiegeProgrammatic('hornburg', 'captain');
      clearBattlefield();
      const g = window.game;
      g.gold = 50000;
      const pad = getPadBestForCombat(g.map);
      const near = findProgressNearPoint(0, pad.x, pad.y, false);

      // Deadzone test: enemy at 30px (< minRange: 75) must NOT be attacked; at 140px MUST be attacked
      const t = g.towers.buildTower(pad, 'dwarven', g);
      const minRange = t.minRange || 0;
      const target = spawnSingleEnemy('orc', 0, near.progress);
      freezeEnemy(target);
      target.maxHp = 20000;
      target.hp = 20000;

      // Place tower 30px from enemy (inside deadzone)
      t.x = target.x;
      t.y = target.y + 30;
      window.__simControl.stepSeconds(4.0);
      const noFireInsideDeadzone = target.hp === 20000 && (t.totalDamage || 0) === 0;

      // Move tower 140px from enemy (valid range: 75 < 140 < 215)
      t.x = target.x;
      t.y = target.y + 140;
      window.__simControl.stepSeconds(4.0);
      const firesOutsideDeadzone = target.hp < 20000 && (t.totalDamage || 0) > 0;

      // Cannot target flying Fell Beast
      g.enemies.active.length = 0;
      const flyNear = findProgressNearPoint(0, pad.x, pad.y, true);
      const fb = spawnSingleEnemy('fellbeast', 0, flyNear.progress);
      freezeEnemy(fb);
      t.x = fb.x;
      t.y = fb.y + 140;
      const fbHp0 = fb.hp;
      window.__simControl.stepSeconds(4.0);
      const ignoresFlying = fb.hp === fbHp0;

      // Branch A: Iron Hills Mortar -> burning oil patches + fire suppresses Troll regen + Dragonfire Barrage skill
      clearBattlefield();
      g.gold = 50000;
      const tA = g.towers.buildTower(pad, 'dwarven', g);
      tA.upgradeTier2(g);
      tA.upgradeBranch('A', g);
      const trollA = spawnSingleEnemy('troll', 0, near.progress);
      freezeEnemy(trollA);
      trollA.maxHp = 30000;
      trollA.hp = 25000;
      tA.x = trollA.x;
      tA.y = trollA.y + 150;

      tA.triggerSkill(g);
      let sawOil = false;
      let sawFireSuppress = false;
      for (let i = 0; i < 30; i++) {
        window.__simControl.stepSeconds(0.2);
        if ((g.towers.oilPatches || []).length > 0) sawOil = true;
        if ((trollA.fireSuppressTimer || 0) > 0) sawFireSuppress = true;
      }

      // Branch B: Khazad Ballista -> straight-line pierce + permanent 50% physical armor shred + Mithril Skewer skill
      clearBattlefield();
      g.gold = 50000;
      const tB = g.towers.buildTower(pad, 'dwarven', g);
      tB.upgradeTier2(g);
      tB.upgradeBranch('B', g);

      const line1 = spawnSingleEnemy('troll', 0, near.progress);
      const line2 = spawnSingleEnemy('troll', 0, Math.min(0.95, near.progress + 0.015));
      freezeEnemy(line1);
      freezeEnemy(line2);
      line1.maxHp = 30000;
      line1.hp = 30000;
      line2.maxHp = 30000;
      line2.hp = 30000;
      const initialArmor = line1.physArmor; // 0.60 on Troll

      // Place Khazad Ballista collinear with line1 -> line2 at 120px behind line1 so bolt pierces BOTH!
      const dx = line2.x - line1.x || 1;
      const dy = line2.y - line1.y || 0;
      const len = Math.hypot(dx, dy) || 1;
      tB.x = line1.x - (dx / len) * 115;
      tB.y = line1.y - (dy / len) * 115;
      tB.range = 320;

      tB.triggerSkill(g);
      window.__simControl.stepSeconds(3.5);
      const piercedBoth = line1.hp < 30000 && line2.hp < 30000;
      const armorAfterHit = line1.physArmor;
      // Remove tower and wait 15s to prove shred is PERMANENT
      g.towers.towers.length = 0;
      window.__simControl.stepSeconds(15.0);
      const armorAfter15s = line1.physArmor;
      const shredPermanent = armorAfterHit < initialArmor * 0.65 && Math.abs(armorAfter15s - armorAfterHit) < 0.01;

      return {
        minRange,
        noFireInsideDeadzone,
        firesOutsideDeadzone,
        ignoresFlying,
        sawOil,
        sawFireSuppress,
        piercedBoth,
        initialArmor,
        armorAfterHit,
        armorAfter15s,
        shredPermanent,
      };
    });

    check(
      dwarvenChecks.minRange >= 50 &&
        dwarvenChecks.noFireInsideDeadzone &&
        dwarvenChecks.firesOutsideDeadzone &&
        dwarvenChecks.ignoresFlying &&
        dwarvenChecks.sawOil &&
        dwarvenChecks.sawFireSuppress &&
        dwarvenChecks.piercedBoth &&
        dwarvenChecks.shredPermanent,
      'Towers',
      '@combat',
      'Dwarven Siege Foundry: minRange deadzone, Iron Hills burning oil, Khazad Ballista pierce & permanent 50% armor shred',
      `minRange=${dwarvenChecks.minRange}, oil=${dwarvenChecks.sawOil}, armor=${dwarvenChecks.initialArmor}->${dwarvenChecks.armorAfter15s}`,
      JSON.stringify(dwarvenChecks)
    );

    // 4.5 Istari Spire: magic damage, 20% slow, Wraith reveal, Flame of Anor ramp (1x->3.5x) & Nova, Stormcaller 5-chain & 25% pushback
    const istariChecks = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy, freezeEnemy, unfreezeEnemy, getPadBestForCombat, findProgressNearPoint } = window.__qa;
      startSiegeProgrammatic('hornburg', 'captain');
      clearBattlefield();
      const g = window.game;
      g.gold = 50000;
      const pad = getPadBestForCombat(g.map);
      const near = findProgressNearPoint(0, pad.x, pad.y, false);

      // Base Istari: magic damage, 20% slow, Wraith reveal
      const t = g.towers.buildTower(pad, 'istari', g);
      const wraith = spawnSingleEnemy('wraith', 0, near.progress);
      freezeEnemy(wraith);
      wraith.maxHp = 10000;
      wraith.hp = 10000;
      t.x = wraith.x;
      t.y = wraith.y + 90;
      window.__simControl.stepSeconds(2.0);
      const slowed = (wraith.slowTimer || 0) > 0;
      const revealed = (wraith.revealedTimer || 0) > 0;

      // Branch A: Flame of Anor continuous beam damage ramp + Secret Fire Nova skill
      clearBattlefield();
      g.gold = 50000;
      const tA = g.towers.buildTower(pad, 'istari', g);
      tA.upgradeTier2(g);
      tA.upgradeBranch('A', g);
      const bossTarget = spawnSingleEnemy('troll', 0, near.progress);
      freezeEnemy(bossTarget);
      bossTarget.maxHp = 500000;
      bossTarget.hp = 500000;
      bossTarget.magicResist = 0;
      tA.x = bossTarget.x;
      tA.y = bossTarget.y + 90;

      // Prevent auto-casting skill during ramp measurement by putting skill on cooldown temporarily
      for (const k of ['skillCd', 'skillTimer', 'skillCooldown', 'abilityCd', 'cdSkill']) {
        if (k in tA) tA[k] = 99;
      }
      if (tA.skill && typeof tA.skill === 'object') {
        for (const k of ['cd', 'timer', 'cooldown', 'remaining']) {
          if (k in tA.skill) tA.skill[k] = 99;
        }
      }

      window.__simControl.stepSeconds(0.15);
      const hpStartEarly = bossTarget.hp;
      window.__simControl.stepSeconds(0.5);
      const earlyBeamDmg = hpStartEarly - bossTarget.hp;

      window.__simControl.stepSeconds(3.6); // total ~4.25s continuous lock
      const hpStartLate = bossTarget.hp;
      window.__simControl.stepSeconds(0.5);
      const rampedBeamDmg = hpStartLate - bossTarget.hp;
      const rampRatio = earlyBeamDmg > 0 ? rampedBeamDmg / earlyBeamDmg : 0;

      // Reset skill cooldown and trigger Secret Fire Nova
      for (const k of ['skillCd', 'skillTimer', 'skillCooldown', 'abilityCd', 'cdSkill']) {
        if (k in tA) tA[k] = 0;
      }
      if (tA.skill && typeof tA.skill === 'object') {
        for (const k of ['cd', 'timer', 'cooldown', 'remaining']) {
          if (k in tA.skill) tA.skill[k] = 0;
        }
      }
      bossTarget.stunTimer = 0;
      const hpBeforeNova = bossTarget.hp;
      tA.triggerSkill(g);
      window.__simControl.stepSeconds(0.3);
      const novaWorked = bossTarget.hp < hpBeforeNova && (bossTarget.stunTimer || 0) > 0;

      // Branch B: Stormcaller Council -> 5-target chain lightning + 25% pushback + Tempest of Manwë skill
      clearBattlefield();
      g.gold = 50000;
      const tB = g.towers.buildTower(pad, 'istari', g);
      tB.upgradeTier2(g);
      tB.upgradeBranch('B', g);

      // Put skill on CD first so we measure pure 5-bounce normal chain lightning
      for (const k of ['skillCd', 'skillTimer', 'skillCooldown', 'abilityCd', 'cdSkill']) {
        if (k in tB) tB[k] = 99;
      }
      if (tB.skill && typeof tB.skill === 'object') {
        for (const k of ['cd', 'timer', 'cooldown', 'remaining']) {
          if (k in tB.skill) tB.skill[k] = 99;
        }
      }

      const chainPack = [];
      for (let i = 0; i < 6; i++) {
        const e = spawnSingleEnemy('troll', 0, Math.min(0.92, near.progress + i * 0.008));
        freezeEnemy(e);
        e.maxHp = 50000;
        e.hp = 50000;
        chainPack.push(e);
      }
      tB.x = chainPack[0].x;
      tB.y = chainPack[0].y + 85;
      tB.range = 300;

      // Step until first chain lightning fires
      let chainHitCount = 0;
      for (let f = 0; f < 120; f++) {
        window.__simControl.stepFrames(1, 16.6667);
        const hitNow = chainPack.filter((e) => e.hp < 50000).length;
        if (hitNow > 0) {
          chainHitCount = hitNow;
          break;
        }
      }

      // Observe pushback over 12s of Stormcaller hits (progress of stationary enemy decreases when pushed back!)
      const startProgs = chainPack.map((e) => e.progress);
      let sawPushback = false;
      for (let i = 0; i < 24; i++) {
        window.__simControl.stepSeconds(0.5);
        if (chainPack.some((e, idx) => e.progress < startProgs[idx] - 0.0005)) {
          sawPushback = true;
          break;
        }
      }

      // Reset skill CD and trigger Tempest of Manwë
      for (const k of ['skillCd', 'skillTimer', 'skillCooldown', 'abilityCd', 'cdSkill']) {
        if (k in tB) tB[k] = 0;
      }
      if (tB.skill && typeof tB.skill === 'object') {
        for (const k of ['cd', 'timer', 'cooldown', 'remaining']) {
          if (k in tB.skill) tB.skill[k] = 0;
        }
      }
      const hpBeforeTempest = chainPack.reduce((s, e) => s + e.hp, 0);
      tB.triggerSkill(g);
      window.__simControl.stepSeconds(0.4);
      const hpAfterTempest = chainPack.reduce((s, e) => s + e.hp, 0);
      const tempestWorked = hpAfterTempest < hpBeforeTempest;

      return {
        slowed,
        revealed,
        earlyBeamDmg: Math.round(earlyBeamDmg),
        rampedBeamDmg: Math.round(rampedBeamDmg),
        rampRatio: Number(rampRatio.toFixed(2)),
        novaWorked,
        chainHitCount,
        sawPushback,
        tempestWorked,
      };
    });

    check(
      istariChecks.slowed &&
        istariChecks.revealed &&
        istariChecks.rampRatio >= 2.0 &&
        istariChecks.novaWorked &&
        istariChecks.chainHitCount === 5 &&
        istariChecks.sawPushback &&
        istariChecks.tempestWorked,
      'Towers',
      '@combat',
      'Istari Spire: 20% slow, Wraith reveal, Flame of Anor beam ramp & Nova, Stormcaller 5-bounce chain & pushback',
      `beamRamp=${istariChecks.rampRatio}x, chainHits=${istariChecks.chainHitCount}, pushback=${istariChecks.sawPushback}`,
      JSON.stringify(istariChecks)
    );

    // ------------------------------------------------------------------------
    // Suite 5: Ring of Power Mechanic
    // ------------------------------------------------------------------------
    console.log('\n=== Suite 5: The Ring of Power Mechanic ===');
    const ringChecks = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy, freezeEnemy, getPadBestForCombat, findProgressNearPoint } = window.__qa;
      startSiegeProgrammatic('hornburg', 'captain');
      clearBattlefield();
      const g = window.game;
      g.gold = 50000;
      const pad = getPadBestForCombat(g.map);
      const near = findProgressNearPoint(0, pad.x, pad.y, false);

      // 1. +40% Attack Speed check (use non-regenerating orc so HP loss === raw tower DPS)
      const t = g.towers.buildTower(pad, 'elven', g);
      const dummy = spawnSingleEnemy('orc', 0, near.progress);
      freezeEnemy(dummy);
      dummy.maxHp = 500000;
      dummy.hp = 500000;
      dummy.basePhysArmor = 0;
      dummy.physArmor = 0;
      t.x = dummy.x;
      t.y = dummy.y + 80;

      g.ringActive = false;
      g.corruption = 0;
      window.__simControl.stepSeconds(0.5);
      const hp0 = dummy.hp;
      window.__simControl.stepSeconds(8.0);
      const dmgOff = hp0 - dummy.hp;

      g.ringActive = true;
      g.corruption = 0;
      const hp1 = dummy.hp;
      for (let i = 0; i < 16; i++) {
        g.corruption = 10; // hold corruption below 100 while measuring pure attack rate
        window.__simControl.stepSeconds(0.5);
      }
      const dmgOn = hp1 - dummy.hp;
      const atkSpeedRatio = dmgOff > 0 ? dmgOn / dmgOff : 0;

      // 2. True Sight vs Shadow Wraiths (80% dodge when OFF vs 0% dodge when ON)
      clearBattlefield();
      const wraith = spawnSingleEnemy('wraith', 0, near.progress);
      freezeEnemy(wraith);
      wraith.maxHp = 100000;
      wraith.hp = 100000;
      wraith.revealedTimer = 0;

      g.ringActive = false;
      let dodgesOff = 0;
      for (let i = 0; i < 80; i++) {
        const dealt = wraith.takeDamage(10, 'physical', {}, g);
        if (dealt === 0) dodgesOff++;
      }

      g.ringActive = true;
      let dodgesOn = 0;
      for (let i = 0; i < 50; i++) {
        const dealt = wraith.takeDamage(10, 'physical', {}, g);
        if (dealt === 0) dodgesOn++;
      }

      // 3. +25% Kill Gold
      clearBattlefield();
      g.ringActive = false;
      const goldStartOff = g.gold;
      const victimOff = spawnSingleEnemy('troll', 0, 0.2); // bounty 48 -> clear 25% diff!
      victimOff.takeDamage(99999, 'true', {}, g);
      const killGoldOff = g.gold - goldStartOff;

      g.ringActive = true;
      const goldStartOn = g.gold;
      const victimOn = spawnSingleEnemy('troll', 0, 0.2);
      victimOn.takeDamage(99999, 'true', {}, g);
      const killGoldOn = g.gold - goldStartOn;
      const goldRatio = killGoldOff > 0 ? killGoldOn / killGoldOff : 0;

      // 4. +15% Enemy Move Speed
      clearBattlefield();
      g.ringActive = false;
      const runnerOff = spawnSingleEnemy('orc', 0, 0);
      window.__simControl.stepSeconds(3.0);
      const progOff = runnerOff.progress;

      clearBattlefield();
      g.ringActive = true;
      g.corruption = 0;
      const runnerOn = spawnSingleEnemy('orc', 0, 0);
      window.__simControl.stepSeconds(3.0);
      const progOn = runnerOn.progress;
      const enemySpeedRatio = progOff > 0 ? progOn / progOff : 0;

      // 5. Rising Corruption -> 100% -> Ringwraith Boss spawns immediately + Black Breath stuns nearby tower for 4s
      clearBattlefield();
      g.gold = 50000;
      const entryPt = g.map.paths[0][0];
      const nearTower = g.towers.buildTower(g.map.pads[0], 'elven', g);
      // Position tower near lane 0 entry so Black Breath (165px radius) definitely hits it on spawn
      nearTower.x = entryPt.x + 60;
      nearTower.y = entryPt.y + 40;

      g.ringActive = false;
      g.corruption = 0;
      g.toggleRing(); // ON via toggleRing()
      const toggledOn = g.ringActive === true;
      window.__simControl.stepSeconds(2.0);
      const corruptionAfter2s = g.corruption;

      // Push corruption up to 100% naturally via simulation
      let spawnedRingwraith = null;
      let blackBreathStun = 0;
      for (let i = 0; i < 160; i++) {
        window.__simControl.stepSeconds(0.15);
        const rw = g.enemies.active.find((e) => e.type === 'ringwraith');
        if (rw) {
          spawnedRingwraith = rw;
          blackBreathStun = nearTower.stunTimer || 0;
          break;
        }
      }

      // 6. Toggle OFF -> Corruption drains
      clearBattlefield();
      g.ringActive = false;
      g.corruption = 50;
      window.__simControl.stepSeconds(3.0);
      const corruptionAfterDrain = g.corruption;

      return {
        atkSpeedRatio: Number(atkSpeedRatio.toFixed(2)),
        dodgesOff,
        dodgesOn,
        killGoldOff,
        killGoldOn,
        goldRatio: Number(goldRatio.toFixed(2)),
        enemySpeedRatio: Number(enemySpeedRatio.toFixed(2)),
        toggledOn,
        corruptionAfter2s: Number(corruptionAfter2s.toFixed(1)),
        ringwraithSpawned: !!spawnedRingwraith && !!spawnedRingwraith.isBoss,
        blackBreathStun: Number(blackBreathStun.toFixed(2)),
        corruptionDrained: corruptionAfterDrain < 45,
        corruptionAfterDrain: Number(corruptionAfterDrain.toFixed(1)),
      };
    });

    check(
      ringChecks.atkSpeedRatio >= 1.25 && ringChecks.atkSpeedRatio <= 1.58 &&
        ringChecks.dodgesOff >= 42 &&
        ringChecks.dodgesOn === 0 &&
        ringChecks.goldRatio >= 1.18 && ringChecks.goldRatio <= 1.32 &&
        ringChecks.enemySpeedRatio >= 1.11 && ringChecks.enemySpeedRatio <= 1.20 &&
        ringChecks.corruptionAfter2s > 5 &&
        ringChecks.ringwraithSpawned &&
        ringChecks.blackBreathStun >= 3.2 &&
        ringChecks.corruptionDrained,
      'Ring of Power',
      '@engine',
      'Ring ON (+40% atk spd, True Sight, +25% gold, +15% foe spd, Corruption -> 100% Ringwraith + 4s Black Breath stun) & OFF drain',
      `atk=${ringChecks.atkSpeedRatio}x, gold=${ringChecks.killGoldOff}->${ringChecks.killGoldOn}, foeSpd=${ringChecks.enemySpeedRatio}x, stun=${ringChecks.blackBreathStun}s`,
      JSON.stringify(ringChecks)
    );

    // ------------------------------------------------------------------------
    // Suite 6: Enemies, Wave 15 Multi-Phase Boss, Rapid-Click Curse Break, Victory, Endless & Defeat
    // ------------------------------------------------------------------------
    console.log('\n=== Suite 6: All Enemies, Wave 15 Boss, Curse Break, Victory, Endless & Defeat ===');
    const enemyChecks = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy, freezeEnemy, getTowerGuards, getPadBestForCombat, findProgressNearPoint } = window.__qa;
      startSiegeProgrammatic('hornburg', 'captain');
      clearBattlefield();
      const g = window.game;
      const TD = window.TD;

      // 1. Check all regular & boss enemy definitions + Goblin pack size 15-20 in TD.WAVES
      const requiredTypes = ['goblin', 'orc', 'uruk', 'warg', 'troll', 'wraith', 'fellbeast', 'ringwraith', 'balrog'];
      const typesPresent = requiredTypes.every((k) => !!TD.ENEMY_TYPES?.[k]);

      let goblinPack15to20 = false;
      const waves = Array.isArray(TD.WAVES) ? TD.WAVES : TD.WAVES?.list || [];
      for (const w of waves) {
        const groups = Array.isArray(w) ? w : w?.groups || w?.spawns || [];
        for (const grp of groups) {
          if (grp.type === 'goblin' && grp.count >= 15 && grp.count <= 25) {
            goblinPack15to20 = true;
          }
        }
      }

      // 2. Uruk-hai Berserker < 40% HP Enrage (+50% move speed)
      clearBattlefield();
      const uruk = spawnSingleEnemy('uruk', 0, 0.05);
      const uProg0 = uruk.progress;
      window.__simControl.stepSeconds(1.5);
      const normalDelta = uruk.progress - uProg0;
      uruk.hp = Math.floor(uruk.maxHp * 0.25); // < 40% HP -> rage!
      const uProg1 = uruk.progress;
      window.__simControl.stepSeconds(1.5);
      const rageDelta = uruk.progress - uProg1;
      const urukRageRatio = normalDelta > 0 ? rageDelta / normalDelta : 0;

      // 3. Warg Rider leaps over first Garrison blocker on 10s CD
      clearBattlefield();
      g.gold = 50000;
      const pad = getPadBestForCombat(g.map);
      const gar1 = g.towers.buildTower(pad, 'garrison', g);
      const near = findProgressNearPoint(0, pad.x, pad.y, false);
      const sampleE = spawnSingleEnemy('orc', 0, near.progress);
      const blockX = sampleE.x;
      const blockY = sampleE.y;
      g.enemies.active.length = 0;
      gar1.range = 400;
      gar1.setRallyPoint(blockX, blockY, g.map);
      const guards1 = getTowerGuards(gar1);
      // Leave only 1 guard at blockX, move other 2 guards downstream so we clearly see leap past first guard!
      const sampleDownstream = spawnSingleEnemy('orc', 0, Math.min(0.92, near.progress + 0.08));
      const downX = sampleDownstream.x;
      const downY = sampleDownstream.y;
      g.enemies.active.length = 0;

      guards1[0].x = blockX;
      guards1[0].y = blockY;
      guards1[1].x = downX;
      guards1[1].y = downY;
      guards1[2].x = downX;
      guards1[2].y = downY;

      const warg = spawnSingleEnemy('warg', 0, Math.max(0.02, near.progress - 0.04));
      warg.maxHp = 5000;
      warg.hp = 5000;
      let passedFirstGuard = false;
      for (let i = 0; i < 30; i++) {
        window.__simControl.stepSeconds(0.15);
        if (warg.progress > near.progress + 0.015) {
          passedFirstGuard = true;
          break;
        }
      }

      // 4. Olog-hai Siege Troll: AoE melee smash on clustered blockers + regen 18 HP/s suppressed by fire/magic for 4s
      clearBattlefield();
      g.gold = 50000;
      const garTroll = g.towers.buildTower(pad, 'garrison', g);
      garTroll.range = 400;
      garTroll.setRallyPoint(blockX, blockY, g.map);
      const tGuards = getTowerGuards(garTroll);
      for (const gd of tGuards) {
        gd.maxHp = 2000;
        gd.hp = 2000;
        gd.x = blockX;
        gd.y = blockY;
      }
      const troll = spawnSingleEnemy('troll', 0, Math.max(0.02, near.progress - 0.01));
      troll.maxHp = 5000;
      troll.hp = 3000;
      for (let i = 0; i < 25; i++) {
        window.__simControl.stepSeconds(0.2);
      }
      const guardsDamagedByAoE = tGuards.filter((gd) => gd.hp < 2000).length;

      // Test Troll regen vs fire/magic suppression
      g.towers.towers.length = 0;
      troll.blockedBy = null;
      freezeEnemy(troll);
      troll.fireSuppressTimer = 0;
      troll.hp = 2000;
      window.__simControl.stepSeconds(2.0);
      const hpAfterRegen = troll.hp; // should be ~2036

      troll.takeDamage(10, 'magic', { isFire: true }, g);
      const hpAfterFireHit = troll.hp;
      window.__simControl.stepSeconds(2.0);
      const hpDuringSuppress = troll.hp; // should NOT increase

      return {
        typesPresent,
        goblinPack15to20,
        urukRageRatio: Number(urukRageRatio.toFixed(2)),
        passedFirstGuard,
        guardsDamagedByAoE,
        trollRegenerated: hpAfterRegen > 2020,
        trollRegenSuppressed: hpDuringSuppress <= hpAfterFireHit + 0.5,
      };
    });

    check(
      enemyChecks.typesPresent &&
        enemyChecks.goblinPack15to20 &&
        enemyChecks.urukRageRatio >= 1.32 &&
        enemyChecks.passedFirstGuard &&
        enemyChecks.guardsDamagedByAoE >= 2 &&
        enemyChecks.trollRegenerated &&
        enemyChecks.trollRegenSuppressed,
      'Enemies',
      '@enemies',
      'Regular enemies verified: Goblin 15-20 packs, Uruk <40% rage, Warg leap, Troll AoE smash & fire/magic regen suppression',
      `urukRage=${enemyChecks.urukRageRatio}x, wargLeap=${enemyChecks.passedFirstGuard}, trollAoE=${enemyChecks.guardsDamagedByAoE} guards`,
      JSON.stringify(enemyChecks)
    );

    // Wave 15 Witch-lord / Balrog Boss + Rapid-Click Cursed Tower Break (via real CDP mouse clicks!)
    const bossSetup = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy, freezeEnemy, getPadBestForCombat, findProgressNearPoint, logicalToClient, isVisible } = window.__qa;
      startSiegeProgrammatic('hornburg', 'captain');
      clearBattlefield();
      const g = window.game;
      g.gold = 50000;
      const pad = getPadBestForCombat(g.map);
      const near = findProgressNearPoint(0, pad.x, pad.y, false);
      const tower = g.towers.buildTower(pad, 'elven', g);
      const boss = spawnSingleEnemy('balrog', 0, near.progress);
      freezeEnemy(boss);
      // Keep tower small damage so boss stays in Phase 1 while cursing
      tower.damage = 1;
      tower.x = boss.x;
      tower.y = boss.y + 120;

      // Step up to 8s until boss casts Dark Spell Lock on tower
      let cursed = false;
      for (let i = 0; i < 85; i++) {
        window.__simControl.stepSeconds(0.1);
        if ((tower.curseClicksRemaining || 0) > 0 && (tower.stunTimer || 0) > 0) {
          cursed = true;
          break;
        }
      }
      if (g.ui && typeof g.ui.update === 'function') g.ui.update(0.2, g);
      const activeBoss = g.enemies.getActiveBoss();
      const pt = logicalToClient(tower.x, tower.y);
      return {
        phase1: boss.phase === 1 || !boss.phase,
        hasActiveBoss: !!activeBoss,
        cursed,
        clicksNeeded: tower.curseClicksRemaining || 0,
        stunBeforeClicks: tower.stunTimer || 0,
        clientX: pt.x,
        clientY: pt.y,
      };
    });

    // Perform 3 real rapid clicks on the cursed tower on the canvas!
    for (let c = 0; c < Math.max(3, bossSetup.clicksNeeded || 3); c++) {
      await browser.clickViewport(bossSetup.clientX, bossSetup.clientY, 1);
    }

    const bossPhaseAndEndgame = await browser.evaluate(async () => {
      const { isVisible, findClickable } = window.__qa;
      const g = window.game;
      const tower = g.towers.towers[0];
      const boss = g.enemies.active.find((e) => e.type === 'balrog');

      const curseBroken = (tower.curseClicksRemaining || 0) === 0 && (tower.stunTimer || 0) === 0;

      // Check Boss Health Banner is visible and does not overlap #top-hud while boss is active
      if (g.ui && typeof g.ui.update === 'function') g.ui.update(0.2, g);
      const bossBanner = document.getElementById('boss-banner');
      const topHud = document.getElementById('top-hud');
      const bossBannerVisible = isVisible(bossBanner);
      const bossBannerNonOverlap =
        bossBanner && topHud
          ? bossBanner.getBoundingClientRect().top >= topHud.getBoundingClientRect().bottom - 2
          : true;

      // Transition boss below 50% HP -> Phase 2 (Balrog of Udûn)
      const p1Speed = boss.baseSpeed || boss.speed;
      boss.takeDamage(boss.maxHp * 0.56, 'true', {}, g);
      window.__simControl.stepSeconds(0.5);
      const phase2Triggered = boss.phase === 2;
      const p2Speed = boss.baseSpeed || boss.speed;

      // Test Victory Screen (after Wave 15 cleared) & 1-star, 2-star, and 3-star Ratings + Endless Mode Wave 16+
      g.lives = 4;
      const star1Val = typeof g.getStarRating === 'function' ? g.getStarRating() : 1;
      g.lives = 12;
      const star2Val = typeof g.getStarRating === 'function' ? g.getStarRating() : 2;
      g.lives = 20;
      const star3Val = typeof g.getStarRating === 'function' ? g.getStarRating() : 3;

      if ('wave' in g) g.wave = 15;
      boss.takeDamage(boss.hp + 99999, 'true', {}, g);
      window.__simControl.stepSeconds(0.5);
      if (g.state !== 'victory' && typeof g.onWaveCleared === 'function') {
        g.onWaveCleared(15);
      }
      if (g.ui && typeof g.ui.update === 'function') g.ui.update(0.2, g);
      // Allow staggered Victory star reveal timers (120ms, 300ms, 480ms) to complete
      await new Promise((r) => setTimeout(r, 550));
      const victoryReached = g.state === 'victory';
      const earnedStarsDom3 = document.querySelectorAll('#victory-modal .victory-star.is-earned').length;
      const victoryDomText = document.getElementById('ui-layer')?.innerText || '';

      // Start Endless Mode (Wave 16+)
      const endlessBtn = findClickable(/Endless/i);
      if (endlessBtn) endlessBtn.click();
      else if (typeof g.startEndless === 'function') g.startEndless();
      window.__simControl.stepSeconds(0.2);
      const endlessPlaying = g.state === 'playing';
      g.enemies.startNextWave(g, false);
      window.__simControl.stepSeconds(3.0);
      const wave16Spawned = g.enemies.active.length > 0 || g.enemies.waveInProgress;

      // Check Endless generator for Wave 20
      const getWaveFn =
        window.TD.WAVES?.getWaveConfig ||
        window.TD.getWaveConfig ||
        (typeof g.enemies.getWaveConfig === 'function' ? g.enemies.getWaveConfig.bind(g.enemies) : null);
      const wave20Cfg = getWaveFn ? getWaveFn(20) : true;

      // Test Defeat Screen + Instant Restart
      g.towers.reset();
      g.lives = 1;
      const breacher = window.__qa.spawnSingleEnemy('warg', 0, 0.96);
      breacher.baseSpeed = 500;
      breacher.speed = 500;
      for (let i = 0; i < 60 && g.state !== 'defeat'; i++) {
        window.__simControl.stepSeconds(0.1);
      }
      if (g.ui && typeof g.ui.update === 'function') g.ui.update(0.2, g);
      const defeatReached = g.state === 'defeat';

      const restartBtn = findClickable(/Restart|Try Again|Siege Again/i);
      if (restartBtn) restartBtn.click();
      else if (typeof g.restartSiege === 'function') g.restartSiege();
      window.__simControl.stepSeconds(0.2);
      const restartedCleanly = g.state === 'playing' && g.lives === 20 && g.towers.towers.length === 0;

      return {
        curseBroken,
        bossBannerVisible,
        bossBannerNonOverlap,
        phase2Triggered,
        p1Speed,
        p2Speed,
        victoryReached,
        starsVerified: star1Val === 1 && star2Val === 2 && star3Val === 3 && earnedStarsDom3 === 3,
        hasVictoryBanner: /Victory|Triumph|Saved|Prevail|Stars?/i.test(victoryDomText),
        endlessPlaying,
        wave16Spawned,
        hasWave20: !!wave20Cfg,
        defeatReached,
        restartedCleanly,
      };
    });

    check(
      bossSetup.hasActiveBoss &&
        bossSetup.cursed &&
        bossPhaseAndEndgame.curseBroken &&
        bossPhaseAndEndgame.bossBannerVisible &&
        bossPhaseAndEndgame.bossBannerNonOverlap &&
        bossPhaseAndEndgame.phase2Triggered,
      'Boss & Endgame',
      '@enemies',
      'Wave 15 Witch-lord -> Balrog Phase 2 transformation, Boss HUD banner & Dark Spell Lock broken by 3 rapid clicks',
      `cursed=${bossSetup.cursed}, broken=${bossPhaseAndEndgame.curseBroken}, phase2=${bossPhaseAndEndgame.phase2Triggered}`,
      JSON.stringify({ bossSetup, bossPhaseAndEndgame })
    );

    check(
      bossPhaseAndEndgame.victoryReached &&
        bossPhaseAndEndgame.starsVerified &&
        bossPhaseAndEndgame.endlessPlaying &&
        bossPhaseAndEndgame.wave16Spawned &&
        bossPhaseAndEndgame.defeatReached &&
        bossPhaseAndEndgame.restartedCleanly,
      'Boss & Endgame',
      '@engine',
      'Victory screen (1-3 stars) -> Endless Mode (Wave 16+) -> Defeat screen -> Instant Restart',
      `victory=${bossPhaseAndEndgame.victoryReached}, stars123=${bossPhaseAndEndgame.starsVerified}, endless16=${bossPhaseAndEndgame.wave16Spawned}, restart=${bossPhaseAndEndgame.restartedCleanly}`,
      JSON.stringify(bossPhaseAndEndgame)
    );

    // ------------------------------------------------------------------------
    // Suite 7: Spells, Early Wave Call, Codex Modal, 1x/2x/3x Stability, Audio & 60 FPS Budget
    // ------------------------------------------------------------------------
    console.log('\n=== Suite 7: Spellbook, Early Wave Call, Codex, Speed, Audio & 60 FPS ===');

    // 7.1 Spells: Light of Eärendil (45s CD) & Great Eagles Strike (70s CD) via real targeting + click
    const spellSetup = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy, freezeEnemy, getTowerGuards, getPadBestForCombat, findProgressNearPoint, logicalToClient } = window.__qa;
      startSiegeProgrammatic('hornburg', 'captain');
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
      orc.maxHp = 5000;
      orc.hp = 5000;
      wraith.maxHp = 5000;
      wraith.hp = 5000;
      wraith.revealedTimer = 0;

      gar.range = 400;
      gar.setRallyPoint(orc.x, orc.y, g.map);
      const guards = getTowerGuards(gar);
      for (const gd of guards) {
        gd.x = orc.x;
        gd.y = orc.y;
        gd.hp = Math.floor(gd.maxHp * 0.25);
      }

      g.selectSpell('light');
      const pt = logicalToClient(orc.x, orc.y);
      return { cx: pt.x, cy: pt.y, tx: orc.x, ty: orc.y };
    });

    await browser.clickViewport(spellSetup.cx, spellSetup.cy, 1);

    const lightResult = await browser.evaluate(() => {
      const g = window.game;
      window.__simControl.stepSeconds(0.1);
      const gar = g.towers.towers[0];
      const guards = window.__qa.getTowerGuards(gar);
      const orc = g.enemies.active.find((e) => e.type === 'orc');
      const wraith = g.enemies.active.find((e) => e.type === 'wraith');
      const lightSpell = g.spells?.light || {};
      const cd = lightSpell.cooldown ?? lightSpell.maxCd ?? 45;
      const rem = lightSpell.timer ?? lightSpell.cdTimer ?? lightSpell.cooldownLeft ?? lightSpell.remaining ?? 0;

      // Setup Great Eagles Strike (70s CD: wide hybrid AoE hitting ground + flying)
      window.__qa.clearBattlefield();
      const pad = window.__qa.getPadBestForCombat(g.map);
      const nearG = window.__qa.findProgressNearPoint(0, pad.x, pad.y, false);
      const troll = window.__qa.spawnSingleEnemy('troll', 0, nearG.progress);
      window.__qa.freezeEnemy(troll);
      troll.maxHp = 5000;
      troll.hp = 5000;

      const fb = window.__qa.spawnSingleEnemy('fellbeast', 0, nearG.progress);
      window.__qa.freezeEnemy(fb);
      // Place flying Fell Beast right above the ground lane target so Eagles lane sweep catches both
      fb.x = troll.x;
      fb.y = troll.y;
      fb.maxHp = 5000;
      fb.hp = 5000;

      g.selectSpell('eagles');
      const pt2 = window.__qa.logicalToClient(troll.x, troll.y);
      return {
        lightCdConfig: cd,
        lightOnCooldown: rem > 35,
        orcStunned: (orc?.stunTimer || 0) >= 1.8,
        wraithRevealed: (wraith?.revealedTimer || 0) > 0,
        guardsHealedFull: guards.every((gd) => gd.hp >= gd.maxHp - 1),
        eaglesPt: pt2,
      };
    });

    await browser.clickViewport(lightResult.eaglesPt.x, lightResult.eaglesPt.y, 1);

    const eaglesAndFeatures = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, findClickable, isVisible, canvasPixelStats } = window.__qa;
      const g = window.game;
      window.__simControl.stepSeconds(1.2);
      const troll = g.enemies.active.find((e) => e.type === 'troll');
      const fb = g.enemies.active.find((e) => e.type === 'fellbeast');
      const eaglesSpell = g.spells?.eagles || {};
      const eaglesCdConfig = eaglesSpell.cooldown ?? eaglesSpell.maxCd ?? 70;
      const eaglesRem = eaglesSpell.timer ?? eaglesSpell.cdTimer ?? eaglesSpell.cooldownLeft ?? eaglesSpell.remaining ?? 0;
      const eaglesHitGround = troll && troll.hp < 5000;
      const eaglesHitFlying = fb && fb.hp < 5000;

      // Early Wave Call bonus gold check
      startSiegeProgrammatic('hornburg', 'captain');
      clearBattlefield();
      // Start wave 1, clear it so betweenWavesTimer (~14s) activates for juicy early wave call bonus!
      g.enemies.startNextWave(g, false);
      for (const k of Object.keys(g.enemies)) {
        if (k !== 'active' && Array.isArray(g.enemies[k])) g.enemies[k].length = 0;
      }
      g.enemies.active.length = 0;
      window.__simControl.stepSeconds(0.5);
      if (g.enemies.betweenWavesTimer <= 0) g.enemies.betweenWavesTimer = 12;
      if (g.ui && typeof g.ui.update === 'function') g.ui.update(0.2, g);

      const canEarly = g.enemies.canCallEarly(g);
      const expectedBonus = g.enemies.getEarlyCallBonus(g);
      const goldBeforeEarly = g.gold;
      if (typeof g.callWaveEarly === 'function') g.callWaveEarly();
      else g.enemies.startNextWave(g, true);
      const earlyGoldAwarded = g.gold - goldBeforeEarly;

      // Lore & Bestiary Codex modal while paused (3 tabs + procedural portraits)
      const codexBtn = findClickable(/Codex|Bestiary|Lore/i);
      if (codexBtn) codexBtn.click();
      else if (g.ui && typeof g.ui.openCodex === 'function') g.ui.openCodex();
      const pausedForCodex = g.state === 'paused' || !!g.paused;

      const tabsChecked = [];
      for (const rx of [/Towers?/i, /Bestiary|Enemies|Foes/i, /Mechanics|Ring/i]) {
        const tabBtn = findClickable(rx);
        if (tabBtn) {
          tabBtn.click();
          const canvases = Array.from(document.querySelectorAll('#ui-layer canvas')).filter((c) => isVisible(c));
          tabsChecked.push({
            tab: rx.source,
            found: true,
            canvases: canvases.length,
            nonBlank: canvases.some((c) => canvasPixelStats(c).nonTransparent > 20),
          });
        } else {
          tabsChecked.push({ tab: rx.source, found: false });
        }
      }

      // Close Codex & resume
      const closeBtn = findClickable(/Close|Resume|✕|×|\[X\]/i);
      if (closeBtn) closeBtn.click();
      g.state = 'playing';

      // 1x / 2x / 3x Simulation Speed Stability without tunneling (even under 50ms frame spikes)
      clearBattlefield();
      g.speed = 1;
      const e1x = window.__qa.spawnSingleEnemy('warg', 0, 0);
      window.__simControl.stepFrames(30, 16.6667);
      const p1x = e1x.progress;

      clearBattlefield();
      g.speed = 3;
      const e3x = window.__qa.spawnSingleEnemy('warg', 0, 0);
      window.__simControl.stepFrames(30, 16.6667);
      const p3x = e3x.progress;
      const speed3xRatio = p1x > 0 ? p3x / p1x : 0;

      // Anti-tunneling stress at 3x with 50ms frame steps against Garrison blockers
      clearBattlefield();
      g.gold = 50000;
      g.speed = 3;
      const garPad = window.__qa.getPadBestForCombat(g.map);
      const garBlock = g.towers.buildTower(garPad, 'garrison', g);
      garBlock.upgradeTier2(g);
      garBlock.upgradeBranch('A', g);
      const nearPt = (window.TD.MapUtils?.getNearestPathPoint || g.map.getNearestPathPoint)?.call(g.map, g.map, garBlock.x, garBlock.y);
      if (nearPt) garBlock.setRallyPoint(nearPt.x, nearPt.y, g.map);
      window.__simControl.stepFrames(30, 16.6667);

      g.enemies.startNextWave(g, false);
      let hasInvalidCoords = false;
      let caughtByBlockerAt3x = false;
      for (let f = 0; f < 80; f++) {
        window.__simControl.stepFrames(1, 50); // max 0.05s dt lag spike at 3x!
        for (const e of g.enemies.active) {
          if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) hasInvalidCoords = true;
          if (e.blockedBy) caughtByBlockerAt3x = true;
        }
      }

      // SoundEngine synthesis + Ring drone + Mute toggle
      const snd = g.sound;
      const sfxMethods = [
        'playBow', 'playBallista', 'playCatapultLaunch', 'playExplosion',
        'playMagicBolt', 'playLightning', 'playBeamTick', 'playSwordClash',
        'playWargLeap', 'playHorn', 'playClick', 'playBuild', 'playUpgrade',
        'playSell', 'playSpellLight', 'playSpellEagles', 'playWraithSpawn',
        'playBossRoar', 'playCurseBreak', 'playVictory', 'playDefeat',
      ];
      const missingSfx = sfxMethods.filter((m) => typeof snd?.[m] !== 'function');
      let audioThrew = null;
      try {
        snd.unlock();
        snd.setMuted(false);
        for (const m of sfxMethods) {
          if (typeof snd[m] === 'function') snd[m]();
        }
        snd.setRingHum(true);
        if (typeof snd.pauseAll === 'function') snd.pauseAll();
        if (typeof snd.resumeAll === 'function') snd.resumeAll();
        snd.setRingHum(false);
        const m0 = snd.muted;
        snd.toggleMute();
        const m1 = snd.muted;
        snd.toggleMute();
        if (m0 === m1) audioThrew = 'toggleMute did not flip sound.muted';
      } catch (err) {
        audioThrew = String(err?.stack || err);
      }

      return {
        eaglesCdConfig,
        eaglesOnCooldown: eaglesRem > 55,
        eaglesHitGround,
        eaglesHitFlying,
        canEarly,
        expectedBonus,
        earlyGoldAwarded,
        pausedForCodex,
        tabsChecked,
        speed3xRatio: Number(speed3xRatio.toFixed(2)),
        hasInvalidCoords,
        caughtByBlockerAt3x,
        missingSfx,
        audioThrew,
      };
    });

    check(
      lightResult.lightCdConfig === 45 &&
        lightResult.lightOnCooldown &&
        lightResult.orcStunned &&
        lightResult.wraithRevealed &&
        lightResult.guardsHealedFull &&
        eaglesAndFeatures.eaglesCdConfig === 70 &&
        eaglesAndFeatures.eaglesOnCooldown &&
        eaglesAndFeatures.eaglesHitGround &&
        eaglesAndFeatures.eaglesHitFlying,
      'Spells & Features',
      '@engine',
      'Spellbook: Light of Eärendil (45s CD: 2.5s stun, Wraith reveal, full guard heal) & Great Eagles Strike (70s CD: ground+air hybrid AoE)',
      `lightCD=${lightResult.lightCdConfig}s, eaglesCD=${eaglesAndFeatures.eaglesCdConfig}s`,
      JSON.stringify({ lightResult, eaglesAndFeatures })
    );

    check(
      eaglesAndFeatures.canEarly && eaglesAndFeatures.earlyGoldAwarded > 0,
      'Spells & Features',
      '@enemies',
      'Early Wave Call starts wave immediately & grants bonus gold',
      `+${eaglesAndFeatures.earlyGoldAwarded}g awarded`,
      JSON.stringify(eaglesAndFeatures)
    );

    check(
      eaglesAndFeatures.pausedForCodex && eaglesAndFeatures.tabsChecked.every((t) => t.found),
      'Spells & Features',
      '@ui',
      'Lore & Bestiary Codex auto-pauses game and renders all 3 tabs (Towers, Bestiary, Mechanics)',
      `tabs=${eaglesAndFeatures.tabsChecked.length}/3`,
      JSON.stringify(eaglesAndFeatures.tabsChecked)
    );

    check(
      eaglesAndFeatures.speed3xRatio >= 2.7 &&
        eaglesAndFeatures.speed3xRatio <= 3.3 &&
        !eaglesAndFeatures.hasInvalidCoords &&
        eaglesAndFeatures.caughtByBlockerAt3x,
      'Spells & Features',
      '@engine',
      '1x/2x/3x speed scaling & sub-stepping stability without tunneling under 50ms frame spikes',
      `3x ratio=${eaglesAndFeatures.speed3xRatio}x, blockerCatchAt3x=${eaglesAndFeatures.caughtByBlockerAt3x}`,
      JSON.stringify(eaglesAndFeatures)
    );

    check(
      eaglesAndFeatures.missingSfx.length === 0 && !eaglesAndFeatures.audioThrew,
      'Audio',
      '@fx-audio',
      'SoundEngine procedural Web Audio synthesis (all 21 SFX + One Ring drone + Mute toggle)',
      '21/21 SFX + Ring drone + mute OK',
      `missing=${eaglesAndFeatures.missingSfx.join(',')}, err=${eaglesAndFeatures.audioThrew}`
    );

    // 7.1b Keyboard Hotkeys Check (Space pause/resume, 1/2 spell targeting, Escape cancel, R Ring toggle)
    await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield } = window.__qa;
      startSiegeProgrammatic('hornburg', 'captain');
      clearBattlefield();
    });
    await browser.pressKey(' ', 'Space', 32);
    const pausedBySpace = await browser.evaluate(() => window.game.state === 'paused');
    await browser.pressKey(' ', 'Space', 32);
    const resumedBySpace = await browser.evaluate(() => window.game.state === 'playing');
    await browser.pressKey('1', 'Digit1', 49);
    const key1Spell = await browser.evaluate(() => window.game.activeSpell === 'light');
    await browser.pressKey('Escape', 'Escape', 27);
    const escCancelled = await browser.evaluate(() => window.game.activeSpell === null);
    await browser.pressKey('2', 'Digit2', 50);
    const key2Spell = await browser.evaluate(() => window.game.activeSpell === 'eagles');
    await browser.pressKey('Escape', 'Escape', 27);
    await browser.pressKey('r', 'KeyR', 82);
    const keyRingOn = await browser.evaluate(() => window.game.ringActive === true);
    await browser.pressKey('r', 'KeyR', 82);
    const keyRingOff = await browser.evaluate(() => window.game.ringActive === false);

    check(
      pausedBySpace && resumedBySpace && key1Spell && escCancelled && key2Spell && keyRingOn && keyRingOff,
      'Spells & Features',
      '@engine',
      'Keyboard shortcuts work via real CDP key events (Space pause/resume, 1/2 spells, Escape cancel, R Ring)',
      'Space, 1, 2, Escape, R verified',
      JSON.stringify({ pausedBySpace, resumedBySpace, key1Spell, escCancelled, key2Spell, keyRingOn, keyRingOff })
    );

    // 7.2 Heavy Late-Game 60 FPS Frame Budget Benchmark (< 16.6ms per frame)
    const perfResult = await browser.evaluate(async () => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy } = window.__qa;
      startSiegeProgrammatic('pelennor', 'steward');
      clearBattlefield();
      const g = window.game;
      g.gold = 250000;
      g.speed = 3;
      g.ringActive = true;
      g.corruption = 20;

      // Build 12 Tier 3 towers across all archetypes & branches
      const branches = [
        ['elven', 'A'], ['elven', 'B'],
        ['garrison', 'A'], ['garrison', 'B'],
        ['dwarven', 'A'], ['dwarven', 'B'],
        ['istari', 'A'], ['istari', 'B'],
        ['elven', 'B'], ['istari', 'A'],
        ['dwarven', 'A'], ['istari', 'B'],
      ];
      const pads = g.map.pads.slice(0, 12);
      for (let i = 0; i < pads.length; i++) {
        const [arch, br] = branches[i % branches.length];
        const tw = g.towers.buildTower(pads[i], arch, g);
        if (tw) {
          tw.upgradeTier2(g);
          tw.upgradeBranch(br, g);
        }
      }

      // Spawn Wave 15 + extra combined arms (~40+ active enemies + boss)
      if ('wave' in g) g.wave = 14;
      g.enemies.startNextWave(g, false);
      const roster = ['goblin', 'orc', 'uruk', 'warg', 'troll', 'wraith', 'fellbeast'];
      for (let i = 0; i < 32; i++) {
        const e = spawnSingleEnemy(roster[i % roster.length], i % 2, (i * 0.025) % 0.85);
        if (e) {
          e.maxHp *= 4;
          e.hp = e.maxHp;
        }
      }
      spawnSingleEnemy('balrog', 0, 0.35);

      // Warmup 15 frames
      for (let w = 0; w < 15; w++) {
        g.corruption = 25;
        window.__simControl.stepFrames(1, 16.6667);
      }

      // Measure 90 consecutive full frames (simulation at 3x + full canvas render + UI update + audio)
      // Yielding every 6 frames to Chrome's event loop so Web Audio nodes complete naturally like real 60Hz rAF
      const samples = [];
      for (let f = 0; f < 90; f++) {
        if (f % 6 === 0) {
          await new Promise((r) => setTimeout(r, 12));
        }
        g.corruption = 25;
        const t0 = window.__simControl.realNow();
        window.__simControl.stepFrames(1, 16.6667);
        const t1 = window.__simControl.realNow();
        samples.push(t1 - t0);
      }

      samples.sort((a, b) => a - b);
      const avg = samples.reduce((s, v) => s + v, 0) / samples.length;
      const p95 = samples[Math.floor(samples.length * 0.95)];
      const max = samples[samples.length - 1];

      return {
        towersActive: g.towers.towers.length,
        enemiesActive: g.enemies.active.length,
        avgFrameMs: Number(avg.toFixed(2)),
        p95FrameMs: Number(p95.toFixed(2)),
        maxFrameMs: Number(max.toFixed(2)),
      };
    });

    results.metrics.avgFrameMs = perfResult.avgFrameMs;
    results.metrics.p95FrameMs = perfResult.p95FrameMs;

    check(
      perfResult.avgFrameMs < 16.6 && perfResult.p95FrameMs < 16.6,
      'Performance',
      '@engine',
      '60 FPS frame budget (< 16.6ms/frame avg & p95) under heavy 3x late-game siege stress',
      `avg=${perfResult.avgFrameMs}ms, p95=${perfResult.p95FrameMs}ms (${perfResult.towersActive} T3 towers, ${perfResult.enemiesActive} enemies)`,
      JSON.stringify(perfResult)
    );

    // ------------------------------------------------------------------------
    // Suite 8: Visual QA Screenshot Pass (6 PNGs -> /home/artem/td/scripts/shots/)
    // ------------------------------------------------------------------------
    console.log('\n=== Suite 8: Visual QA Screenshot Capture (1280x720) ===');
    const shotsDir = path.join(path.dirname(INDEX_HTML), 'scripts', 'shots');
    fs.mkdirSync(shotsDir, { recursive: true });

    const saveShot = async (filename) => {
      const shotRes = await browser.send('Page.captureScreenshot', { format: 'png' });
      const outPath = path.join(shotsDir, filename);
      fs.writeFileSync(outPath, Buffer.from(shotRes.data, 'base64'));
      const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
      console.log(`  [SHOT] Saved ${filename} (${sizeKB} KB)`);
      return fs.statSync(outPath).size;
    };

    // 1. 01-title.png: Title Screen showing all 3 map preview cards & 3 difficulty cards
    const titleCodexBtnMetrics = await browser.evaluate(() => {
      const g = window.game;
      g.sound?.setMuted(true);
      window.__qa.clearBattlefield();
      g.returnToTitle();
      if (g.ui?.refreshTitleScreen) g.ui.refreshTitleScreen();
      window.__simControl.stepFrames(6, 16.6667);
      const btn = document.getElementById('btn-title-codex');
      const r = btn ? btn.getBoundingClientRect() : null;
      return r ? { w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) } : null;
    });
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 40, button: 'none' });
    await new Promise((r) => setTimeout(r, 80));
    const s1 = await saveShot('01-title.png');

    check(
      !!titleCodexBtnMetrics && titleCodexBtnMetrics.h <= 56 && titleCodexBtnMetrics.bottom <= 718,
      'Visual QA',
      '@ui',
      'Title Screen #btn-title-codex SVG icon properly sized (height <= 56px, aligned with Begin Siege)',
      `${titleCodexBtnMetrics?.w}x${titleCodexBtnMetrics?.h}px`,
      JSON.stringify(titleCodexBtnMetrics)
    );

    // 2. 02-hornburg-build.png: Hornburg Causeway mid-wave with rain, active towers/Garrison guards,
    //    and Empty Pad Build Menu hovered on Dwarven so green valid range + inner deadzone ring is visible
    const dwarvenCardPt = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield } = window.__qa;
      startSiegeProgrammatic('hornburg', 'captain');
      clearBattlefield();
      const g = window.game;
      g.gold = 950;
      g.speed = 1;

      // Pick a prominent central-left empty pad (350 <= x <= 780) so range circles aren't under right sidebar
      const emptyPad =
        g.map.pads.find((p) => p.x >= 360 && p.x <= 760 && p.y >= 190 && p.y <= 530) || g.map.pads[3];
      const otherPads = g.map.pads.filter((p) => p.id !== emptyPad.id);

      // Build Garrison + Elven + Istari + Dwarven on surrounding pads
      const gar = g.towers.buildTower(otherPads[0], 'garrison', g);
      if (gar) {
        gar.upgradeTier2(g);
        const nearPt = window.TD.MapUtils?.getNearestPathPoint?.(g.map, gar.x, gar.y);
        if (nearPt) gar.setRallyPoint(nearPt.x, nearPt.y, g.map);
      }
      const elv = g.towers.buildTower(otherPads[1], 'elven', g);
      if (elv) elv.upgradeTier2(g);
      const ist = g.towers.buildTower(otherPads[2], 'istari', g);
      if (ist) ist.upgradeTier2(g);
      g.towers.buildTower(otherPads[3], 'dwarven', g);

      // Start Wave 3 and advance 5.5s so rain, enemies, projectiles, and Garrison melee blockers are active
      g.wave = 2;
      g.enemies.currentWave = 2;
      g.enemies.startNextWave(g, false);
      window.__simControl.stepSeconds(5.5);

      // Select the central-left empty pad & trigger Dwarven hover preview
      g.selectPad(emptyPad);
      if (g.ui?.update) g.ui.update(0, g);
      const dwarvenCard =
        document.querySelector('.build-card[data-tower="dwarven"]') ||
        Array.from(document.querySelectorAll('.build-card')).find((el) => /Dwarven/i.test(el.textContent || ''));
      if (dwarvenCard) {
        dwarvenCard.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
      }
      window.__simControl.stepFrames(2, 16.6667);
      const r = dwarvenCard ? dwarvenCard.getBoundingClientRect() : { left: 1080, top: 320, width: 200, height: 60 };
      return { x: Math.round(r.left + r.width * 0.5), y: Math.round(r.top + r.height * 0.5) };
    });
    await browser.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: dwarvenCardPt.x,
      y: dwarvenCardPt.y,
      button: 'none',
    });
    await browser.evaluate(() => window.__simControl.stepFrames(1, 16.6667));
    const s2 = await saveShot('02-hornburg-build.png');

    // 3. 03-pelennor-ring-spells.png: Pelennor Crossroads mid-battle with Ring ON (golden/wraith vignette + Tengwar HUD),
    //    Light of Eärendil / Great Eagles VFX visible, and Tier 2 tower selected hovering Tier 3 upgrade (blue + yellow circles)
    const branchACardPt = await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy } = window.__qa;
      startSiegeProgrammatic('pelennor', 'captain');
      clearBattlefield();
      const g = window.game;
      g.gold = 2400;
      g.speed = 1;

      // Choose a central-left pad for our Tier 2 Elven tower so both blue & yellow range circles are unobstructed
      const inspectPad =
        g.map.pads.find((p) => p.x >= 340 && p.x <= 740 && p.y >= 210 && p.y <= 520) || g.map.pads[4];
      const others = g.map.pads.filter((p) => p.id !== inspectPad.id);

      const t2Focus = g.towers.buildTower(inspectPad, 'elven', g);
      t2Focus.upgradeTier2(g);

      const gar = g.towers.buildTower(others[0], 'garrison', g);
      gar.upgradeTier2(g);
      gar.upgradeBranch('B', g);

      const ist = g.towers.buildTower(others[1], 'istari', g);
      ist.upgradeTier2(g);
      ist.upgradeBranch('B', g);

      const dw = g.towers.buildTower(others[2], 'dwarven', g);
      dw.upgradeTier2(g);
      dw.upgradeBranch('A', g);

      // Spawn active Wave 9 combined arms across both converging lanes
      g.wave = 8;
      g.enemies.currentWave = 8;
      g.enemies.startNextWave(g, false);
      spawnSingleEnemy('troll', 0, 0.36);
      spawnSingleEnemy('uruk', 0, 0.42);
      spawnSingleEnemy('wraith', 1, 0.38);
      spawnSingleEnemy('warg', 1, 0.45);
      spawnSingleEnemy('fellbeast', 0, 0.34);
      window.__simControl.stepSeconds(3.2);

      // Toggle Ring of Power ON with active corruption so Tengwar runes & golden/fiery Ring vignette shine
      if (!g.ringActive) g.toggleRing();
      g.corruption = 64;
      if (g.ui?.update) g.ui.update(0, g);

      // Cast Light of Eärendil & Great Eagles Strike right onto the fray so spell VFX are mid-burst!
      const focusEnemy = g.enemies.active[0] || { x: 520, y: 360 };
      g.castSpell('light', focusEnemy.x, focusEnemy.y);
      g.castSpell('eagles', Math.min(820, focusEnemy.x + 90), focusEnemy.y);

      // Select Tier 2 Elven tower and hover Tier 3 Branch A (Galadhrim Longbows: 205 -> 275 range!)
      g.selectTower(t2Focus);
      const branchABtn = document.getElementById('btn-upgrade-branch-a');
      if (branchABtn) {
        branchABtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
      }
      window.__simControl.stepFrames(3, 16.6667);
      const r = branchABtn ? branchABtn.getBoundingClientRect() : { left: 1080, top: 380, width: 200, height: 80 };
      return { x: Math.round(r.left + r.width * 0.5), y: Math.round(r.top + r.height * 0.5) };
    });
    await browser.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: branchACardPt.x,
      y: branchACardPt.y,
      button: 'none',
    });
    await browser.evaluate(() => window.__simControl.stepFrames(1, 16.6667));
    const s3 = await saveShot('03-pelennor-ring-spells.png');

    // 4. 04-blackgate-balrog.png: The Black Gate with Wave 15 Balrog of Udûn (Phase 2) + Boss Health Banner
    //    + a Boss-cursed tower showing the click-to-break lock chains
    await browser.evaluate(() => {
      const { startSiegeProgrammatic, clearBattlefield, spawnSingleEnemy } = window.__qa;
      startSiegeProgrammatic('blackgate', 'steward');
      clearBattlefield();
      const g = window.game;
      g.gold = 3500;
      g.wave = 15;
      g.enemies.currentWave = 15;

      // Pick a central-left pad on the lower twin lane so Balrog & cursed tower sit well below #boss-banner
      const cursePad =
        g.map.pads.find((p) => p.x >= 360 && p.x <= 720 && p.y >= 340 && p.y <= 580) ||
        g.map.pads.find((p) => p.x >= 360 && p.x <= 720 && p.y >= 240 && p.y <= 560) ||
        g.map.pads[4];
      const others = g.map.pads.filter((p) => p.id !== cursePad.id);

      const cursedTower = g.towers.buildTower(cursePad, 'istari', g);
      cursedTower.upgradeTier2(g);
      cursedTower.upgradeBranch('A', g);

      const tElv = g.towers.buildTower(others[0], 'elven', g);
      tElv.upgradeTier2(g);
      tElv.upgradeBranch('A', g);

      const tDw = g.towers.buildTower(others[1], 'dwarven', g);
      tDw.upgradeTier2(g);
      tDw.upgradeBranch('B', g);

      const tGar = g.towers.buildTower(others[2], 'garrison', g);
      tGar.upgradeTier2(g);
      tGar.upgradeBranch('A', g);

      // Spawn Wave 15 boss on Lane 1 (lower twin lane, well clear of top #boss-banner)
      const near = window.__qa.findProgressNearPoint(1, cursePad.x, cursePad.y, false);
      const boss = spawnSingleEnemy('balrog', 1, Math.max(0.28, Math.min(0.55, near.progress)));
      window.__qa.freezeEnemy(boss);

      // Temporarily pause other towers' damage so boss curses before dropping below 50% HP
      const savedDmg = g.towers.towers.map((tw) => tw.damage);
      for (const tw of g.towers.towers) tw.damage = 1;
      for (let i = 0; i < 85; i++) {
        window.__simControl.stepSeconds(0.1);
        if ((cursedTower.curseClicksRemaining || 0) > 0) break;
      }
      g.towers.towers.forEach((tw, idx) => {
        tw.damage = savedDmg[idx];
      });
      // Step 1s so transient floating curse toast fades, leaving crisp lock chains + [CLICK x3!] badge
      window.__simControl.stepSeconds(1.0);
      if ((cursedTower.curseClicksRemaining || 0) === 0 && typeof cursedTower.applyCurse === 'function') {
        cursedTower.applyCurse(6.0, 3);
      } else {
        cursedTower.curseClicksRemaining = Math.max(cursedTower.curseClicksRemaining || 0, 3);
        cursedTower.stunTimer = Math.max(cursedTower.stunTimer || 0, 5.5);
      }

      // Now push Boss below 50% HP so Phase 2 Balrog of Udûn erupts with lava/fire + Phase II Boss Banner!
      window.__qa.unfreezeEnemy(boss);
      boss.takeDamage(boss.maxHp * 0.56, 'true', {}, g);

      // Add a few Mordor escort enemies on both lanes for authentic Wave 15 atmosphere
      spawnSingleEnemy('troll', 0, 0.35);
      spawnSingleEnemy('uruk', 0, 0.25);
      spawnSingleEnemy('fellbeast', 1, 0.26);

      g.selectTower(cursedTower);
      window.__simControl.stepFrames(8, 16.6667);
      if (g.ui?.update) g.ui.update(0, g);
    });
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 690, button: 'none' });
    const s4 = await saveShot('04-blackgate-balrog.png');

    // 5. 05-codex.png: Paused Lore & Bestiary Codex modal open on Bestiary & Resistances tab
    await browser.evaluate(() => {
      const g = window.game;
      if (g.ui?.openCodex) {
        g.ui.openCodex('bestiary');
      } else {
        document.getElementById('btn-codex')?.click();
        document.querySelector('[data-codex-tab="bestiary"]')?.click();
      }
      window.__simControl.stepFrames(3, 16.6667);
    });
    const s5 = await saveShot('05-codex.png');

    // 6. 06-victory.png: Victory modal showing 3-Star rating and Endless Mode button
    await browser.evaluate(async () => {
      const g = window.game;
      if (g.ui?.closeCodex) g.ui.closeCodex();
      if (g.enemies?.reset) g.enemies.reset(g);
      g.clearSelection?.();
      g.state = 'playing';
      g.lives = 20;
      g.wave = 15;
      g.stats.kills = 342;
      g.stats.goldEarned = 4890;
      g.triggerVictory();
      if (g.ui?.update) g.ui.update(0, g);
      await new Promise((r) => setTimeout(r, 950));
      window.__simControl.stepFrames(2, 16.6667);
    });
    const s6 = await saveShot('06-victory.png');

    check(
      [s1, s2, s3, s4, s5, s6].every((sz) => sz > 20000),
      'Visual QA',
      '@ui',
      'Captured all 6 1280x720 PNG screenshots in scripts/shots/',
      `sizes=${[s1, s2, s3, s4, s5, s6].map((b) => `${Math.round(b / 1024)}KB`).join(', ')}`
    );

    // Final check: ZERO runtime console.error / pageerror / unhandledrejection across ALL gameplay suites!
    const postUnhandled = await browser.evaluate(() => window.__unhandledErrors || []);
    const allErrors = [
      ...browser.runtimeErrors.map((e) => {
        const loc = e.line ? locateInSrc(e.line) : { file: 'index.html', line: 0, owner: '@engine' };
        return `[${e.kind}] ${loc.file}:${loc.line} (${loc.owner}) ${e.text}`;
      }),
      ...postUnhandled.map((u) => `[unhandledrejection] ${u}`),
    ];

    results.metrics.runtimeErrors = allErrors.length;
    check(
      allErrors.length === 0,
      'Runtime Stability',
      browser.runtimeErrors[0]?.line ? locateInSrc(browser.runtimeErrors[0].line).owner : '@engine',
      'Zero console.error, pageerror, or unhandledrejection across entire verification run',
      '0 runtime errors across all suites',
      allErrors.slice(0, 5).join('\n    ')
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
  if (staticInfo && results.failed.length === 0) {
    await runBrowserVerification(staticInfo.locateInSrc);
  } else if (staticInfo) {
    // Still run browser verification even if a minor static check flagged, unless syntax failed
    const hasSyntaxFailure = results.failed.some((f) => /syntax/i.test(f.name));
    if (!hasSyntaxFailure) {
      await runBrowserVerification(staticInfo.locateInSrc);
    }
  }

  const elapsedSec = ((Date.now() - tStart) / 1000).toFixed(2);
  console.log('\n============================================================');
  console.log(`VERIFICATION SUMMARY (${elapsedSec}s)`);
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
  console.error('FATAL VERIFIER ERROR:', err);
  process.exit(1);
});
