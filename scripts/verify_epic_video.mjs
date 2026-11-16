#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const EPIC_VIDEO_PATH = path.join(ROOT_DIR, 'epic_demo_2min_1080p.mp4');
const DEMO_VIDEO_PATH = path.join(ROOT_DIR, 'demo_1080p.mp4');
const INDEX_HTML_PATH = path.join(ROOT_DIR, 'index.html');
const SHOTS_DIR = path.join(__dirname, 'shots_epic_video');
const DEMO_HTTP_URL = 'http://127.0.0.1:8000/demo';

// Immutable pre-recording baselines for /home/artem/td/index.html and /home/artem/td/src/*
const EXPECTED_INDEX_BYTES = 2443766;
const EXPECTED_HASHES = {
  'index.html': '1363d4583d747300b79de7b476dc4d58b176f79bf3a14e12687096950d033bf4',
  'src/enemies.js': '79a229a6c237f230204b5e2d95b941e9d4bb8354c38ac42b4c01680ca5bbe5b9',
  'src/engine.js': 'bb9b583098fba58748a886319827bbdaaf12696c203df278f5c1b16d1ca95707',
  'src/env_3d.js': '4d28094bf9375f30177e9f813b73fafeea4b7733c0f2f3cef41e7ae750b74838',
  'src/fx_audio.js': '74b8902e67fd7c04843156ade0bae9391b56b63176051eab9abfe879239cdf5a',
  'src/maps.js': 'd9b75e940dc3d41b88f8fc7dbf19953357be21a4a9a378b8b19d239de9296a11',
  'src/models_3d.js': '9d614755247443d5ae5d8bf47b37d3d4293e89997d1bb167d6a3e21b59a32d40',
  'src/models_enemies_3d.js': '48d0f850e3b0adcd30b09b4b68f28399a3d92fff77f0611db7ce1252383f9a9e',
  'src/models_towers_3d.js': '199d27ca240bcb4288b6678af27539a629b49d610eb279b2ee24f9ec560064b4',
  'src/styles.css': '2a29d7021575f7fe43836b72f0235a801b48edb81f028317a8f00e580ed3de8e',
  'src/three_scene.js': 'cdf44e278817f9f839725281c35bdcc0faba12cc6b1e6e8e7e01fce6ff836a35',
  'src/towers.js': '661c22cd759b4c23894b40e25716bc205dea6c72ebdc05c7dd7c32907817e922',
  'src/ui.js': 'b3b0994fd26a603aab12ca748309afdd62b64541d9cfa35084c72d6755580058',
  'src/vfx_3d.js': 'da2159269871da603ac9c9735353b40713808e4f9b00069c4a2c4d9621578ff0'
};

const FORBIDDEN_URL_PATTERNS = [
  { name: 'http:// external URL', regex: /http:\/\/[^\s"'`)<>]+/i },
  { name: 'https:// external URL', regex: /https:\/\/[^\s"'`)<>]+/i },
  { name: 'protocol-relative //fonts URL', regex: /\/\/fonts\.[^\s"'`)<>]+/i },
  { name: 'CSS @import rule', regex: /@import\s+/i },
  { name: 'external <script src=...>', regex: /<script\b[^>]*\bsrc\s*=/i },
  { name: 'external <link href=...>', regex: /<link\b[^>]*\bhref\s*=/i }
];

// Default 8 keyframe targets across Chapters 1–5 (~4s, ~20s, ~35s, ~52s, ~72s, ~82s, ~105s, ~119s)
const DEFAULT_KEYFRAME_SPECS = [
  { idx: 1, ts: 4.0, slug: 'ch1_title_strongholds' },
  { idx: 2, ts: 20.0, slug: 'ch2_hornburg_build_dock' },
  { idx: 3, ts: 35.0, slug: 'ch2_hornburg_rain_combat' },
  { idx: 4, ts: 52.0, slug: 'ch3_pelennor_sunbreak_siege' },
  { idx: 5, ts: 72.0, slug: 'ch3_one_ring_ringwraith' },
  { idx: 6, ts: 82.0, slug: 'ch4_codex_3d_portraits' },
  { idx: 7, ts: 105.0, slug: 'ch5_black_gate_balrog' },
  { idx: 8, ts: 119.0, slug: 'ch5_victory_3_star_modal' }
];

function parseArgs(argv) {
  const opts = {
    epicVideoPath: EPIC_VIDEO_PATH,
    demoVideoPath: DEMO_VIDEO_PATH,
    demoUrl: DEMO_HTTP_URL,
    timestamps: null,
    noExtract: false,
    selfCheckOnly: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--self-check') {
      opts.selfCheckOnly = true;
    } else if (arg === '--no-extract') {
      opts.noExtract = true;
    } else if (arg === '--epic-video' && argv[i + 1]) {
      opts.epicVideoPath = path.resolve(argv[++i]);
    } else if (arg.startsWith('--epic-video=')) {
      opts.epicVideoPath = path.resolve(arg.slice('--epic-video='.length));
    } else if (arg === '--demo-video' && argv[i + 1]) {
      opts.demoVideoPath = path.resolve(argv[++i]);
    } else if (arg.startsWith('--demo-video=')) {
      opts.demoVideoPath = path.resolve(arg.slice('--demo-video='.length));
    } else if (arg === '--url' && argv[i + 1]) {
      opts.demoUrl = argv[++i];
    } else if (arg.startsWith('--url=')) {
      opts.demoUrl = arg.slice('--url='.length);
    } else if (arg === '--timestamps' && argv[i + 1]) {
      opts.timestamps = parseTimestampList(argv[++i]);
    } else if (arg.startsWith('--timestamps=')) {
      opts.timestamps = parseTimestampList(arg.slice('--timestamps='.length));
    } else {
      throw new Error(`Unknown CLI option: ${arg}`);
    }
  }
  return opts;
}

function parseTimestampList(raw) {
  const vals = raw.split(',').map((s) => Number(s.trim()));
  if (vals.length !== 8 || vals.some((n) => !Number.isFinite(n) || n < 0)) {
    throw new Error(`--timestamps requires 8 non-negative numbers (got "${raw}")`);
  }
  return vals;
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function parseFraction(rateStr) {
  if (!rateStr || typeof rateStr !== 'string') return NaN;
  const parts = rateStr.split('/');
  if (parts.length === 1) return Number(parts[0]);
  const num = Number(parts[0]);
  const den = Number(parts[1]);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return NaN;
  return num / den;
}

function parseMp4TopLevelAtoms(filePath, fileSize) {
  const fd = fs.openSync(filePath, 'r');
  const atoms = [];
  const headerBuf = Buffer.alloc(16);
  let offset = 0;

  try {
    while (offset < fileSize) {
      if (offset + 8 > fileSize) {
        throw new Error(`Truncated MP4 atom header at offset ${offset} (fileSize=${fileSize})`);
      }
      const bytesRead = fs.readSync(fd, headerBuf, 0, Math.min(16, fileSize - offset), offset);
      if (bytesRead < 8) {
        throw new Error(`Short read (${bytesRead}B) reading MP4 atom at offset ${offset}`);
      }
      const size32 = headerBuf.readUInt32BE(0);
      const type = headerBuf.subarray(4, 8).toString('ascii');
      let boxSize = size32;
      let headerSize = 8;

      if (size32 === 1) {
        if (bytesRead < 16) {
          throw new Error(`Truncated 64-bit largesize MP4 atom "${type}" at offset ${offset}`);
        }
        const bigSize = headerBuf.readBigUInt64BE(8);
        boxSize = Number(bigSize);
        headerSize = 16;
      } else if (size32 === 0) {
        boxSize = fileSize - offset;
      }

      if (boxSize < headerSize) {
        throw new Error(`Invalid MP4 atom "${type}" size ${boxSize} (< ${headerSize}) at offset ${offset}`);
      }
      if (offset + boxSize > fileSize) {
        throw new Error(
          `Truncated MP4 atom "${type}" at offset ${offset}: boxSize=${boxSize} exceeds fileSize=${fileSize}`
        );
      }

      atoms.push({ type, offset, size: boxSize });
      offset += boxSize;
    }
  } finally {
    fs.closeSync(fd);
  }

  return atoms;
}

function readPngDimensions(pngPath) {
  const buf = fs.readFileSync(pngPath);
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(pngSig)) {
    throw new Error(`${pngPath} is not a valid PNG file`);
  }
  const chunkType = buf.subarray(12, 16).toString('ascii');
  if (chunkType !== 'IHDR') {
    throw new Error(`${pngPath} first chunk is "${chunkType}", expected IHDR`);
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  return { width, height, bytes: buf.length, sha256 };
}

function inspectPngBorderBars(pngPath, width, height) {
  const rawRgb = execFileSync(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-i', pngPath, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { maxBuffer: width * height * 3 + 1024 * 1024 }
  );
  if (rawRgb.length !== width * height * 3) {
    throw new Error(`Unexpected raw RGB24 buffer size ${rawRgb.length} for ${pngPath}`);
  }

  const band = 8;
  let topMax = 0;
  let bottomMax = 0;
  let leftMax = 0;
  let rightMax = 0;
  let lumaSum = 0;

  // Top and bottom 8-pixel bands
  for (let y = 0; y < band; y++) {
    const rowOff = y * width * 3;
    for (let i = 0; i < width * 3; i++) {
      if (rawRgb[rowOff + i] > topMax) topMax = rawRgb[rowOff + i];
    }
  }
  for (let y = height - band; y < height; y++) {
    const rowOff = y * width * 3;
    for (let i = 0; i < width * 3; i++) {
      if (rawRgb[rowOff + i] > bottomMax) bottomMax = rawRgb[rowOff + i];
    }
  }

  // Left and right 8-pixel bands + overall mean luma
  for (let y = 0; y < height; y++) {
    const rowOff = y * width * 3;
    for (let x = 0; x < band; x++) {
      const p = rowOff + x * 3;
      const m = Math.max(rawRgb[p], rawRgb[p + 1], rawRgb[p + 2]);
      if (m > leftMax) leftMax = m;
    }
    for (let x = width - band; x < width; x++) {
      const p = rowOff + x * 3;
      const m = Math.max(rawRgb[p], rawRgb[p + 1], rawRgb[p + 2]);
      if (m > rightMax) rightMax = m;
    }
    for (let x = 0; x < width; x += 4) {
      const p = rowOff + x * 3;
      lumaSum += 0.2126 * rawRgb[p] + 0.7152 * rawRgb[p + 1] + 0.0722 * rawRgb[p + 2];
    }
  }

  const sampledPixels = height * Math.ceil(width / 4);
  const meanLuma = lumaSum / sampledPixels;
  const hasBlackBars = topMax === 0 || bottomMax === 0 || leftMax === 0 || rightMax === 0;

  return {
    hasBlackBars,
    topMax,
    bottomMax,
    leftMax,
    rightMax,
    meanLuma
  };
}

function createRunner() {
  const checks = [];
  function assertCheck(name, condition, detail = '') {
    checks.push({ name, pass: Boolean(condition), detail });
    if (condition) {
      console.log(`  [PASS] ${name}${detail ? ` — ${detail}` : ''}`);
    } else {
      console.error(`  [FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
    }
  }
  return { checks, assertCheck };
}

function verifySourceImmutability(assertCheck) {
  console.log('\n=== 1. Source & index.html Immutability Checks ===');

  assertCheck('index.html exists', fs.existsSync(INDEX_HTML_PATH), INDEX_HTML_PATH);
  const indexStat = fs.statSync(INDEX_HTML_PATH);
  const indexKb = (indexStat.size / 1024).toFixed(1);
  assertCheck(
    `index.html exact byte size untouched (${EXPECTED_INDEX_BYTES} bytes)`,
    indexStat.size === EXPECTED_INDEX_BYTES,
    `${indexStat.size} bytes (${indexKb} KiB)`
  );

  for (const [relPath, expectedHash] of Object.entries(EXPECTED_HASHES)) {
    const absPath = path.join(ROOT_DIR, relPath);
    const exists = fs.existsSync(absPath);
    const actualHash = exists ? sha256File(absPath) : 'MISSING';
    assertCheck(
      `${relPath} SHA-256 matches pre-recording baseline`,
      actualHash === expectedHash,
      actualHash === expectedHash
        ? `${actualHash.slice(0, 16)}...`
        : `expected ${expectedHash}, got ${actualHash}`
    );
  }

  const htmlContent = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  const violations = [];
  for (const rule of FORBIDDEN_URL_PATTERNS) {
    if (rule.regex.test(htmlContent)) {
      violations.push(rule.name);
    }
  }
  assertCheck(
    'index.html contains zero external URLs/assets',
    violations.length === 0,
    violations.length === 0 ? '0 external URLs' : `Violations: ${violations.join(', ')}`
  );
}

function verifyDualFilesAndContainer(epicVideoPath, demoVideoPath, assertCheck) {
  console.log('\n=== 2. Dual MP4 Identity, +faststart moov Atom & Stream Specs ===');

  const epicExists = fs.existsSync(epicVideoPath) && fs.statSync(epicVideoPath).isFile();
  const demoExists = fs.existsSync(demoVideoPath) && fs.statSync(demoVideoPath).isFile();

  assertCheck('epic_demo_2min_1080p.mp4 exists', epicExists, epicVideoPath);
  assertCheck('demo_1080p.mp4 exists', demoExists, demoVideoPath);
  if (!epicExists || !demoExists) {
    throw new Error(
      `Missing required video file(s): epic=${epicExists} (${epicVideoPath}), demo=${demoExists} (${demoVideoPath})`
    );
  }

  const epicStat = fs.statSync(epicVideoPath);
  const demoStat = fs.statSync(demoVideoPath);
  const sizeMb = (epicStat.size / (1024 * 1024)).toFixed(2);

  assertCheck(
    'epic_demo_2min_1080p.mp4 file size > 5 MiB',
    epicStat.size > 5 * 1024 * 1024,
    `${epicStat.size} bytes (${sizeMb} MiB)`
  );

  const epicSha256 = sha256File(epicVideoPath);
  const demoSha256 = sha256File(demoVideoPath);

  assertCheck(
    'epic_demo_2min_1080p.mp4 and demo_1080p.mp4 match identically (size + SHA-256)',
    epicStat.size === demoStat.size && epicSha256 === demoSha256,
    epicStat.size === demoStat.size && epicSha256 === demoSha256
      ? `${epicStat.size} bytes, sha256=${epicSha256.slice(0, 20)}...`
      : `epic=${epicStat.size}B (${epicSha256.slice(0, 16)}...) vs demo=${demoStat.size}B (${demoSha256.slice(0, 16)}...)`
  );

  for (const [label, vPath, vSize] of [
    ['epic_demo_2min_1080p.mp4', epicVideoPath, epicStat.size],
    ['demo_1080p.mp4', demoVideoPath, demoStat.size]
  ]) {
    let atoms = [];
    let atomError = null;
    try {
      atoms = parseMp4TopLevelAtoms(vPath, vSize);
    } catch (err) {
      atomError = err.message;
    }
    const atomSummary = atoms.map((a) => `${a.type}@${a.offset}(${a.size}B)`).join(' -> ');
    const ftypIdx = atoms.findIndex((a) => a.type === 'ftyp');
    const moovIdx = atoms.findIndex((a) => a.type === 'moov');
    const mdatIdx = atoms.findIndex((a) => a.type === 'mdat');
    const faststart = moovIdx !== -1 && mdatIdx !== -1 && moovIdx < mdatIdx;

    assertCheck(
      `${label} valid ISO BMFF MP4 with +faststart (moov before mdat)`,
      !atomError && ftypIdx === 0 && moovIdx !== -1 && mdatIdx !== -1 && atoms[moovIdx].size > 8 && faststart,
      atomError ? atomError : `${atomSummary} (faststart=${faststart})`
    );
  }

  const probeJson = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', epicVideoPath],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  );
  const probe = JSON.parse(probeJson);
  const format = probe.format || {};
  const streams = probe.streams || [];

  const formatName = String(format.format_name || '');
  const duration = Number(format.duration);

  assertCheck(
    'ffprobe container format is MP4',
    formatName.includes('mp4'),
    `format_name="${formatName}", probe_score=${format.probe_score}`
  );
  assertCheck(
    'Container duration between 118.0s and 128.0s (~2 minutes)',
    Number.isFinite(duration) && duration >= 118.0 && duration <= 128.0,
    `${duration.toFixed(3)}s`
  );

  const vStream = streams.find((s) => s.codec_type === 'video');
  assertCheck('Video stream present', Boolean(vStream), vStream ? `index=${vStream.index}` : 'MISSING');
  if (!vStream) {
    throw new Error('Missing video stream in epic_demo_2min_1080p.mp4');
  }

  assertCheck(
    'Video resolution exact 1920x1080',
    vStream.width === 1920 && vStream.height === 1080,
    `${vStream.width}x${vStream.height} (SAR=${vStream.sample_aspect_ratio || '1:1'})`
  );
  assertCheck(
    'Video codec is h264',
    vStream.codec_name === 'h264',
    `${vStream.codec_name} (${vStream.profile || 'unknown profile'}, level ${vStream.level || '?'})`
  );
  assertCheck(
    'Video pixel format is yuv420p',
    vStream.pix_fmt === 'yuv420p',
    String(vStream.pix_fmt)
  );

  const rFps = parseFraction(vStream.r_frame_rate);
  const avgFps = parseFraction(vStream.avg_frame_rate);
  const nbFrames = Number(vStream.nb_frames || 0);
  const vDuration = Number(vStream.duration || duration);

  assertCheck(
    'Video duration between 118.0s and 128.0s',
    Number.isFinite(vDuration) && vDuration >= 118.0 && vDuration <= 128.0,
    `video_duration=${vDuration.toFixed(3)}s (nb_frames=${nbFrames})`
  );

  assertCheck(
    'Video framerate >= 30 fps and constant (r_frame_rate ~= avg_frame_rate)',
    Number.isFinite(rFps) &&
      Number.isFinite(avgFps) &&
      rFps >= 30 &&
      avgFps >= 29.8 &&
      Math.abs(rFps - avgFps) <= 0.5,
    `r_frame_rate=${vStream.r_frame_rate} (${rFps.toFixed(2)} fps), avg_frame_rate=${vStream.avg_frame_rate} (${avgFps.toFixed(2)} fps), nb_frames=${nbFrames}`
  );

  // Packet PTS cadence check across all ~3,600–7,500 frames
  const pktJson = execFileSync(
    'ffprobe',
    [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'packet=pts_time,duration_time',
      '-of', 'json',
      epicVideoPath
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  const packets = (JSON.parse(pktJson).packets || [])
    .map((p) => Number(p.pts_time))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  let maxDelta = 0;
  let minDelta = Infinity;
  for (let i = 1; i < packets.length; i++) {
    const dt = packets[i] - packets[i - 1];
    if (dt > maxDelta) maxDelta = dt;
    if (dt < minDelta) minDelta = dt;
  }
  const expectedDt = 1 / rFps;
  const maxAllowedDt = expectedDt * 1.5 + 0.002;
  assertCheck(
    'Constant frame PTS cadence (0 dropped/stuttered frame gaps)',
    packets.length >= Math.floor(vDuration * rFps) - 2 && maxDelta <= maxAllowedDt && minDelta > 0,
    `packets=${packets.length}, expectedDt=${(expectedDt * 1000).toFixed(2)}ms, minDt=${(minDelta * 1000).toFixed(2)}ms, maxDt=${(maxDelta * 1000).toFixed(2)}ms`
  );

  const aStream = streams.find((s) => s.codec_type === 'audio');
  assertCheck('Audio stream present', Boolean(aStream), aStream ? `index=${aStream.index}` : 'MISSING');
  if (!aStream) {
    throw new Error('Missing audio stream in epic_demo_2min_1080p.mp4');
  }

  const aDuration = Number(aStream.duration || duration);
  const sampleRate = Number(aStream.sample_rate);
  const channels = Number(aStream.channels);
  const chLayout = String(aStream.channel_layout || '').toLowerCase();

  assertCheck(
    'Audio codec is aac',
    aStream.codec_name === 'aac',
    `${aStream.codec_name} (${aStream.profile || 'LC'})`
  );
  assertCheck(
    'Audio sample rate is 44100 Hz stereo (2 channels)',
    sampleRate === 44100 && channels === 2 && (!chLayout || chLayout.includes('stereo')),
    `${sampleRate} Hz, ${channels} ch (${aStream.channel_layout || 'stereo'})`
  );
  assertCheck(
    'Audio stream spans full 2-minute duration',
    aDuration >= 118.0 && aDuration <= 128.5 && Math.abs(aDuration - duration) <= 1.0,
    `audio=${aDuration.toFixed(3)}s vs container=${duration.toFixed(3)}s`
  );

  return {
    fileSize: epicStat.size,
    sizeMb,
    sha256: epicSha256,
    duration,
    rFps,
    avgFps,
    nbFrames,
    vStream,
    aStream
  };
}

function parseAstatsOverall(astatsOutput) {
  const overallIdx = astatsOutput.lastIndexOf('Overall');
  const tail = overallIdx !== -1 ? astatsOutput.slice(overallIdx) : astatsOutput;

  const numField = (label) => {
    const m = tail.match(new RegExp(`${label}:\\s*([-\\d.]+)`));
    return m ? Number(m[1]) : NaN;
  };

  return {
    minLevel: numField('Min level'),
    maxLevel: numField('Max level'),
    peakDb: numField('Peak level dB'),
    rmsDb: numField('RMS level dB'),
    flatFactor: numField('Flat factor'),
    nans: numField('Number of NaNs'),
    infs: numField('Number of Infs'),
    samples: numField('Number of samples')
  };
}

function parseVolumeDetect(volOutput) {
  const meanMatches = [...volOutput.matchAll(/mean_volume:\s*([-\d.]+)\s*dB/g)];
  const maxMatches = [...volOutput.matchAll(/max_volume:\s*([-\d.]+)\s*dB/g)];
  const meanVolume = meanMatches.length > 0 ? Number(meanMatches[meanMatches.length - 1][1]) : NaN;
  const maxVolume = maxMatches.length > 0 ? Number(maxMatches[maxMatches.length - 1][1]) : NaN;
  return { meanVolume, maxVolume };
}

function verifyDecodeVideoAndQuartersAudio(epicVideoPath, demoVideoPath, duration, assertCheck) {
  console.log('\n=== 3. Full Decode, Black/Freeze Scan & 4-Quarter Audio QA ===');

  // Strict -v error decode on BOTH files
  for (const [label, vPath] of [
    ['epic_demo_2min_1080p.mp4', epicVideoPath],
    ['demo_1080p.mp4', demoVideoPath]
  ]) {
    let strictErrOut = '';
    try {
      strictErrOut = execFileSync(
        'bash',
        ['-lc', 'ffmpeg -v error -i "$1" -f null - 2>&1', '--', vPath],
        { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
      ).trim();
    } catch (err) {
      strictErrOut = String(err.stdout || err.stderr || err.message || 'ffmpeg decode failed').trim();
    }
    assertCheck(
      `${label} decodes cleanly with 0 ffmpeg errors`,
      strictErrOut.length === 0,
      strictErrOut.length === 0 ? '0 decode errors' : strictErrOut.slice(0, 240)
    );
  }

  // Video blackdetect & freezedetect + full-track volumedetect & silencedetect
  const scanOut = execFileSync(
    'bash',
    [
      '-lc',
      'ffmpeg -hide_banner -nostats -i "$1" ' +
        '-af "volumedetect,silencedetect=n=-58dB:d=5.0" ' +
        '-vf "blackdetect=d=0.5:pix_th=0.02:pic_th=0.98,freezedetect=n=0.0002:d=5.5" ' +
        '-f null - 2>&1',
      '--',
      epicVideoPath
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );

  const blackIntervals = [
    ...scanOut.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)
  ].map((m) => `${m[1]}s..${m[2]}s (${m[3]}s)`);
  assertCheck(
    'Zero black video stretches (>= 0.5s)',
    blackIntervals.length === 0,
    blackIntervals.length === 0 ? '0 black stretches' : blackIntervals.join('; ')
  );

  const freezeIntervals = [
    ...scanOut.matchAll(/freeze_start:\s*([\d.]+)[\s\S]*?freeze_duration:\s*([\d.]+)/g)
  ].map((m) => `${m[1]}s (${m[2]}s)`);
  const freezeDurationsOnly = [...scanOut.matchAll(/freeze_duration:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  assertCheck(
    'Zero frozen/hung video stretches (>= 5.5s)',
    freezeDurationsOnly.length === 0,
    freezeDurationsOnly.length === 0
      ? '0 frozen stretches'
      : freezeIntervals.join('; ') || `durations: ${freezeDurationsOnly.join(', ')}s`
  );

  const longSilences = [...scanOut.matchAll(/silence_duration:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  assertCheck(
    'Zero dead audio dropouts (>= 5.0s below -58 dB)',
    longSilences.length === 0,
    longSilences.length === 0 ? 'continuous 2-minute soundtrack & SFX' : `silences: ${longSilences.join(', ')}s`
  );

  const fullVol = parseVolumeDetect(scanOut);
  const fullAstatsOut = execFileSync(
    'bash',
    ['-lc', 'ffmpeg -hide_banner -nostats -vn -i "$1" -af "astats=metadata=0:reset=0" -f null - 2>&1', '--', epicVideoPath],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  );
  const fullAstats = parseAstatsOverall(fullAstatsOut);

  assertCheck(
    'Full-track audio healthy non-silent levels & zero clipping',
    Number.isFinite(fullVol.meanVolume) &&
      fullVol.meanVolume > -42.0 &&
      fullVol.meanVolume < -6.0 &&
      Number.isFinite(fullAstats.peakDb) &&
      fullAstats.peakDb > -25.0 &&
      fullAstats.peakDb <= 0.0 &&
      fullAstats.flatFactor === 0 &&
      (Number.isNaN(fullAstats.nans) || fullAstats.nans === 0) &&
      (Number.isNaN(fullAstats.infs) || fullAstats.infs === 0),
    `mean=${fullVol.meanVolume} dB, rms=${fullAstats.rmsDb.toFixed(2)} dB, peak=${fullAstats.peakDb.toFixed(2)} dB, flat_factor=${fullAstats.flatFactor}`
  );

  // Quarter-by-quarter audio verification: Q1 (0-30s), Q2 (30-60s), Q3 (60-90s), Q4 (90s-end)
  const quarters = [
    { label: 'Q1 (0–30s)', start: 0, len: 30 },
    { label: 'Q2 (30–60s)', start: 30, len: 30 },
    { label: 'Q3 (60–90s)', start: 60, len: 30 },
    { label: `Q4 (90–${duration.toFixed(1)}s)`, start: 90, len: Math.max(25, duration - 90) }
  ];

  const quarterReports = [];
  for (const q of quarters) {
    const qOut = execFileSync(
      'bash',
      [
        '-lc',
        'ffmpeg -hide_banner -nostats -vn -ss "$1" -t "$2" -i "$3" -af "astats=metadata=0:reset=0" -f null - 2>&1',
        '--',
        String(q.start),
        String(q.len),
        epicVideoPath
      ],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
    );
    const qStats = parseAstatsOverall(qOut);
    const qHealthy =
      Number.isFinite(qStats.rmsDb) &&
      qStats.rmsDb > -45.0 &&
      qStats.rmsDb < -5.0 &&
      Number.isFinite(qStats.peakDb) &&
      qStats.peakDb > -28.0 &&
      qStats.peakDb <= 0.0 &&
      qStats.flatFactor === 0;

    assertCheck(
      `Audio ${q.label} healthy non-silent & unclipped`,
      qHealthy,
      `rms=${qStats.rmsDb.toFixed(2)} dB, peak=${qStats.peakDb.toFixed(2)} dB, max_amp=${Math.max(
        Math.abs(qStats.minLevel),
        Math.abs(qStats.maxLevel)
      ).toFixed(4)}, flat=${qStats.flatFactor}`
    );
    quarterReports.push({ ...q, ...qStats });
  }

  return { fullVol, fullAstats, quarterReports };
}

function httpGetRange(urlStr, rangeHeader) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      urlStr,
      {
        method: 'GET',
        headers: { Range: rangeHeader },
        timeout: 5000
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            headers: res.headers,
            body: Buffer.concat(chunks)
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error(`HTTP timeout requesting ${urlStr}`));
    });
    req.on('error', reject);
    req.end();
  });
}

async function verifyHttpRangeEndpoint(demoUrl, expectedFileSize, epicVideoPath, assertCheck) {
  console.log('\n=== 4. Live HTTP 206 Partial Content Range Check (/demo) ===');

  const curlHeaders = execFileSync(
    'curl',
    ['-sI', '-H', 'Range: bytes=0-1023', demoUrl],
    { encoding: 'utf8', timeout: 5000 }
  );

  const firstLine = (curlHeaders.split(/\r?\n/)[0] || '').trim();
  const contentRangeMatch = curlHeaders.match(/^Content-Range:\s*([^\r\n]+)/im);
  const contentLengthMatch = curlHeaders.match(/^Content-Length:\s*(\d+)/im);
  const contentTypeMatch = curlHeaders.match(/^Content-Type:\s*([^\r\n]+)/im);
  const acceptRangesMatch = curlHeaders.match(/^Accept-Ranges:\s*([^\r\n]+)/im);

  const expectedRange = `bytes 0-1023/${expectedFileSize}`;
  const actualRange = contentRangeMatch ? contentRangeMatch[1].trim() : 'MISSING';
  const actualLength = contentLengthMatch ? Number(contentLengthMatch[1]) : NaN;
  const actualType = contentTypeMatch ? contentTypeMatch[1].trim() : 'MISSING';
  const acceptRanges = acceptRangesMatch ? acceptRangesMatch[1].trim() : 'MISSING';

  assertCheck(
    'curl -sI -H "Range: bytes=0-1023" /demo returns HTTP 206 Partial Content',
    /^HTTP\/1\.[01]\s+206\s+Partial Content/i.test(firstLine),
    firstLine
  );
  assertCheck(
    'HTTP /demo Content-Range matches exact new MP4 byte size',
    actualRange === expectedRange && actualLength === 1024 && actualType === 'video/mp4' && acceptRanges === 'bytes',
    `Content-Range="${actualRange}", Content-Length=${actualLength}, Content-Type="${actualType}", Accept-Ranges="${acceptRanges}"`
  );

  // Verify actual streamed bytes 0..1023 match epic_demo_2min_1080p.mp4 byte-for-byte
  const res = await httpGetRange(demoUrl, 'bytes=0-1023');
  const fd = fs.openSync(epicVideoPath, 'r');
  const expectedPrefix = Buffer.alloc(1024);
  try {
    fs.readSync(fd, expectedPrefix, 0, 1024, 0);
  } finally {
    fs.closeSync(fd);
  }
  assertCheck(
    'HTTP GET Range bytes=0-1023 payload matches epic_demo_2min_1080p.mp4 header bytes',
    res.statusCode === 206 && res.body.length === 1024 && res.body.equals(expectedPrefix),
    `status=${res.statusCode}, bytes=${res.body.length}`
  );
}

function extractEightKeyframes(epicVideoPath, duration, customTimestamps, assertCheck) {
  console.log('\n=== 5. Extract 8 PNG Keyframes Across Chapters 1–5 ===');
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  // Clean prior PNGs in shots_epic_video so there are never stale frames
  for (const entry of fs.readdirSync(SHOTS_DIR)) {
    if (entry.endsWith('.png')) {
      fs.unlinkSync(path.join(SHOTS_DIR, entry));
    }
  }

  const specs = DEFAULT_KEYFRAME_SPECS.map((spec, idx) => {
    const rawTs = customTimestamps ? customTimestamps[idx] : spec.ts;
    const clampedTs = Math.max(0.5, Math.min(Number((duration - 1.0).toFixed(2)), rawTs));
    return {
      ...spec,
      ts: clampedTs
    };
  });

  const extracted = [];
  const seenHashes = new Set();

  for (const spec of specs) {
    const tsTag = String(Math.round(spec.ts)).padStart(3, '0');
    const filename = `frame_0${spec.idx}_${spec.slug}_${tsTag}s.png`;
    const outPath = path.join(SHOTS_DIR, filename);

    execFileSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel', 'error',
        '-y',
        '-ss', String(spec.ts),
        '-i', epicVideoPath,
        '-frames:v', '1',
        '-update', '1',
        outPath
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    const exists = fs.existsSync(outPath);
    assertCheck(`${filename} extracted (@ ${spec.ts.toFixed(2)}s)`, exists, outPath);
    if (exists) {
      const info = readPngDimensions(outPath);
      const border = inspectPngBorderBars(outPath, info.width, info.height);
      seenHashes.add(info.sha256);

      assertCheck(
        `${filename} is valid 1920x1080 PNG with zero black bars`,
        info.width === 1920 &&
          info.height === 1080 &&
          info.bytes > 80 * 1024 &&
          !border.hasBlackBars &&
          border.meanLuma > 4.0,
        `${info.width}x${info.height}, ${(info.bytes / 1024).toFixed(1)} KiB, meanLuma=${border.meanLuma.toFixed(1)}, edgeMax=[T:${border.topMax},B:${border.bottomMax},L:${border.leftMax},R:${border.rightMax}]`
      );
      extracted.push({ ...spec, filename, outPath, ...info, ...border });
    }
  }

  assertCheck(
    'All 8 extracted keyframes are visually distinct (8/8 unique SHA-256)',
    seenHashes.size === 8,
    `${seenHashes.size}/8 unique frames`
  );

  return extracted;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { checks, assertCheck } = createRunner();

  verifySourceImmutability(assertCheck);

  if (opts.selfCheckOnly) {
    const failed = checks.filter((c) => !c.pass);
    console.log(`\n[SELF-CHECK SUMMARY] ${checks.length - failed.length}/${checks.length} baseline checks passed.`);
    process.exit(failed.length === 0 ? 0 : 1);
  }

  const probeSummary = verifyDualFilesAndContainer(opts.epicVideoPath, opts.demoVideoPath, assertCheck);
  const audioSummary = verifyDecodeVideoAndQuartersAudio(
    opts.epicVideoPath,
    opts.demoVideoPath,
    probeSummary.duration,
    assertCheck
  );
  await verifyHttpRangeEndpoint(opts.demoUrl, probeSummary.fileSize, opts.epicVideoPath, assertCheck);

  const frames = opts.noExtract
    ? []
    : extractEightKeyframes(opts.epicVideoPath, probeSummary.duration, opts.timestamps, assertCheck);

  const failed = checks.filter((c) => !c.pass);
  console.log('\n====================================================================');
  console.log(
    `[EPIC 2-MIN VIDEO QA SUMMARY] ${checks.length - failed.length}/${checks.length} automated checks passed\n` +
      `  Video: ${probeSummary.vStream.width}x${probeSummary.vStream.height} ${probeSummary.vStream.codec_name}/${probeSummary.vStream.pix_fmt} ` +
      `@ ${probeSummary.rFps.toFixed(2)} fps (${probeSummary.nbFrames} frames) | ${probeSummary.duration.toFixed(2)}s | ${probeSummary.sizeMb} MiB\n` +
      `  Audio: ${probeSummary.aStream.codec_name} ${probeSummary.aStream.sample_rate} Hz ${probeSummary.aStream.channels}ch | ` +
      `mean=${audioSummary.fullVol.meanVolume} dB, rms=${audioSummary.fullAstats.rmsDb.toFixed(2)} dB, peak=${audioSummary.fullAstats.peakDb.toFixed(2)} dB`
  );
  if (frames.length > 0) {
    console.log(
      '  Keyframes:\n' +
        frames.map((f) => `    - ${f.filename} (@ ${f.ts.toFixed(2)}s, ${(f.bytes / 1024).toFixed(1)} KiB)`).join('\n')
    );
  }
  console.log('====================================================================');

  if (failed.length > 0) {
    console.error('Failed checks:');
    for (const f of failed) {
      console.error(`  - ${f.name}: ${f.detail}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n[FATAL QA ERROR] ${err.message || err}`);
  process.exit(1);
});
