#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = fs.realpathSync(path.resolve(__dirname, '..'));

const DEFAULT_PORT = 8000;
const HOST = process.env.HOST || '0.0.0.0';
const PORT = (() => {
  const cliArg = process.argv.slice(2).find((arg) => arg.startsWith('--port='));
  const raw = cliArg ? cliArg.split('=')[1] : process.env.PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_PORT;
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : DEFAULT_PORT;
})();

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.htm', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg']
]);

const ROUTE_ALIASES = new Map([
  ['/', '/index.html'],
  ['/demo', '/demo_1080p.mp4'],
  ['/demo/', '/demo_1080p.mp4']
]);

function makeETag(stat) {
  return `"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
}

function isWithinRoot(candidatePath) {
  return candidatePath === ROOT_DIR || candidatePath.startsWith(ROOT_DIR + path.sep);
}

function parseSingleByteRange(rangeHeader, totalSize) {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
    return { type: 'none' };
  }

  const spec = rangeHeader.slice('bytes='.length).trim();
  if (!spec) {
    return { type: 'unsatisfiable' };
  }

  // RFC 9110: if multiple byte-ranges are requested, fall back to full 200 response.
  if (spec.includes(',')) {
    return { type: 'multi' };
  }

  const dashIndex = spec.indexOf('-');
  if (dashIndex === -1) {
    return { type: 'unsatisfiable' };
  }

  const startStr = spec.slice(0, dashIndex).trim();
  const endStr = spec.slice(dashIndex + 1).trim();

  if (totalSize === 0) {
    return { type: 'unsatisfiable' };
  }

  // Suffix byte-range-spec: bytes=-N (last N bytes)
  if (startStr === '') {
    if (!/^\d+$/.test(endStr)) {
      return { type: 'unsatisfiable' };
    }
    const suffixLength = Number.parseInt(endStr, 10);
    if (suffixLength <= 0) {
      return { type: 'unsatisfiable' };
    }
    const start = Math.max(0, totalSize - suffixLength);
    const end = totalSize - 1;
    return { type: 'partial', start, end };
  }

  if (!/^\d+$/.test(startStr)) {
    return { type: 'unsatisfiable' };
  }
  const start = Number.parseInt(startStr, 10);
  if (start >= totalSize) {
    return { type: 'unsatisfiable' };
  }

  if (endStr === '') {
    return { type: 'partial', start, end: totalSize - 1 };
  }

  if (!/^\d+$/.test(endStr)) {
    return { type: 'unsatisfiable' };
  }
  const requestedEnd = Number.parseInt(endStr, 10);
  if (requestedEnd < start) {
    return { type: 'unsatisfiable' };
  }

  const end = Math.min(requestedEnd, totalSize - 1);
  return { type: 'partial', start, end };
}

function sendPlain(res, statusCode, message, extraHeaders = {}) {
  const body = `${statusCode} ${message}\n`;
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  res.end(body);
}

async function handleRequest(req, res) {
  const method = req.method || 'GET';
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      Allow: 'GET, HEAD, OPTIONS',
      'Accept-Ranges': 'bytes'
    });
    res.end();
    return;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    sendPlain(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD, OPTIONS' });
    return;
  }

  const rawUrl = req.url || '/';
  if (rawUrl.includes('\0')) {
    sendPlain(res, 400, 'Bad Request');
    return;
  }

  const rawPathOnly = rawUrl.split('?')[0].split('#')[0];
  let decodedRawPath = rawPathOnly;
  try {
    decodedRawPath = decodeURIComponent(rawPathOnly);
  } catch {
    sendPlain(res, 400, 'Bad Request');
    return;
  }

  if (
    decodedRawPath.includes('\0') ||
    decodedRawPath.includes('\\') ||
    rawPathOnly.split('/').some((seg) => seg === '..') ||
    decodedRawPath.split('/').some((seg) => seg === '..' || (seg.startsWith('.') && seg.length > 1))
  ) {
    sendPlain(res, 403, 'Forbidden');
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl, 'http://localhost');
  } catch {
    sendPlain(res, 400, 'Bad Request');
    return;
  }

  let decodedPathname;
  try {
    decodedPathname = decodeURIComponent(parsedUrl.pathname);
  } catch {
    sendPlain(res, 400, 'Bad Request');
    return;
  }

  const mappedRoute = ROUTE_ALIASES.get(decodedPathname) || decodedPathname;
  const candidatePath = path.resolve(ROOT_DIR, '.' + mappedRoute);

  if (!isWithinRoot(candidatePath)) {
    sendPlain(res, 403, 'Forbidden');
    return;
  }

  let stat;
  try {
    stat = await fsp.stat(candidatePath);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      if (decodedPathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      sendPlain(res, 404, 'Not Found');
      return;
    }
    sendPlain(res, 500, 'Internal Server Error');
    return;
  }

  let realFilePath;
  try {
    realFilePath = await fsp.realpath(candidatePath);
  } catch {
    sendPlain(res, 404, 'Not Found');
    return;
  }

  if (!isWithinRoot(realFilePath)) {
    sendPlain(res, 403, 'Forbidden');
    return;
  }

  if (!stat.isFile()) {
    sendPlain(res, 404, 'Not Found');
    return;
  }

  const ext = path.extname(realFilePath).toLowerCase();
  const contentType = MIME_TYPES.get(ext) || 'application/octet-stream';
  const etag = makeETag(stat);
  const lastModified = stat.mtime.toUTCString();
  const isVideo = contentType.startsWith('video/');

  const baseHeaders = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    ETag: etag,
    'Last-Modified': lastModified,
    'Cache-Control': isVideo ? 'public, max-age=0, must-revalidate' : 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  };

  let rangeHeader = req.headers.range;
  const ifRange = req.headers['if-range'];
  if (rangeHeader && ifRange) {
    const matchesETag = ifRange.trim() === etag;
    const matchesDate = ifRange.trim() === lastModified;
    if (!matchesETag && !matchesDate) {
      rangeHeader = undefined;
    }
  }

  if (!rangeHeader) {
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch.split(',').map((s) => s.trim()).includes(etag)) {
      res.writeHead(304, {
        ETag: etag,
        'Last-Modified': lastModified,
        'Accept-Ranges': 'bytes',
        'Cache-Control': baseHeaders['Cache-Control']
      });
      res.end();
      return;
    }

    res.writeHead(200, {
      ...baseHeaders,
      'Content-Length': stat.size
    });

    if (method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(realFilePath);
    res.on('close', () => {
      stream.destroy();
    });
    stream.on('error', () => {
      if (!res.headersSent) {
        sendPlain(res, 500, 'Internal Server Error');
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
    return;
  }

  const parsedRange = parseSingleByteRange(rangeHeader, stat.size);

  if (parsedRange.type === 'unsatisfiable') {
    res.writeHead(416, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Range': `bytes */${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': 0,
      'X-Content-Type-Options': 'nosniff'
    });
    res.end();
    return;
  }

  if (parsedRange.type !== 'partial') {
    res.writeHead(200, {
      ...baseHeaders,
      'Content-Length': stat.size
    });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    const stream = fs.createReadStream(realFilePath);
    res.on('close', () => {
      stream.destroy();
    });
    stream.on('error', () => {
      res.destroy();
    });
    stream.pipe(res);
    return;
  }

  const { start, end } = parsedRange;
  const chunkLength = end - start + 1;

  res.writeHead(206, {
    ...baseHeaders,
    'Content-Range': `bytes ${start}-${end}/${stat.size}`,
    'Content-Length': chunkLength
  });

  if (method === 'HEAD') {
    res.end();
    return;
  }

  const stream = fs.createReadStream(realFilePath, { start, end });
  res.on('close', () => {
    stream.destroy();
  });
  stream.on('error', () => {
    res.destroy();
  });
  stream.pipe(res);
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error('[serve] request error:', err);
    if (!res.headersSent) {
      sendPlain(res, 500, 'Internal Server Error');
    } else {
      res.destroy();
    }
  });
});

server.on('clientError', (err, socket) => {
  if (err.code === 'ECONNRESET' || !socket.writable) {
    return;
  }
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

server.on('error', (err) => {
  console.error(`[serve] fatal server error on ${HOST}:${PORT}:`, err.message);
  process.exit(1);
});

function collectIPv4Addresses() {
  const nets = os.networkInterfaces();
  const list = [];
  for (const [name, addrs] of Object.entries(nets)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4') {
        list.push({ name, address: addr.address, internal: addr.internal });
      }
    }
  }
  return list;
}

server.listen(PORT, HOST, () => {
  const ipv4s = collectIPv4Addresses();
  console.log(`[Shadows of the West] Static HTTP server listening on ${HOST}:${PORT} (PID ${process.pid})`);
  console.log(`  Root directory: ${ROOT_DIR}`);
  for (const iface of ipv4s) {
    if (iface.name === 'docker0') continue;
    console.log(`  [${iface.name}] Game: http://${iface.address}:${PORT}/  |  Demo Video: http://${iface.address}:${PORT}/demo`);
  }
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[serve] received ${sig}, shutting down cleanly...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
