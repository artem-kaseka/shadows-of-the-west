#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_VIDEO_PATH = path.join(ROOT_DIR, 'demo_1080p.mp4');
const INDEX_HTML_PATH = path.join(ROOT_DIR, 'index.html');
const SHOTS_DIR = path.join(__dirname, 'shots');

// Exact pre-recording immutable baselines for index.html and src/*
const EXPECTED_INDEX_BYTES = 595194; // 581.2 KB
const EXPECTED_INDEX_KB = '581.2';
const EXPECTED_HASHES = {
  'index.html': 'c213363144925303c967588e31e9c414406368d8d4f0a6329267f017728cde46',
  'src/enemies.js': '79a229a6c237f230204b5e2d95b941e9d4bb8354c38ac42b4c01680ca5bbe5b9',
  'src/engine.js': 'f7ea4b64d1fe82ed4cd5bf0c2235ed97a76e203622cb698f7130f4670b576980',
  'src/fx_audio.js': '74b8902e67fd7c04843156ade0bae9391b56b63176051eab9abfe879239cdf5a',
  'src/maps.js': 'd9b75e940dc3d41b88f8fc7dbf19953357be21a4a9a378b8b19d239de9296a11',
  'src/styles.css': '3a28f4f80fe39087f4889ec145435ae1110e4718d182f3491508ec8e85e778d9',
  'src/towers.js': '661c22cd759b4c23894b40e25716bc205dea6c72ebdc05c7dd7c32907817e922',
  'src/ui.js': 'beb3719734f4d566a2ce1bec68902683f248676b4f7c3f3ad57c98b4c7396d22'
};

const FORBIDDEN_URL_PATTERNS = [
  { name: 'http:// external URL', regex: /http:\/\//i },
  { name: 'https:// external URL', regex: /https:\/\//i },
  { name: 'protocol-relative //fonts URL', regex: /\/\/fonts\./i },
  { name: 'CSS @import rule', regex: /@import\s+/i },
  { name: 'external <script src=...>', regex: /<script\b[^>]*\bsrc\s*=/i },
  { name: 'external <link href=...>', regex: /<link\b[^>]*\bhref\s*=/i }
];

// Default proportional sample positions across Acts 1-5 (~2.6s, ~14.5s, ~28.5s, ~35.3s, ~40.3s, ~47.3s on 48.27s video)
const DEFAULT_FRAME_FRACTIONS = [0.054, 0.300, 0.590, 0.731, 0.835, 0.980];

function parseArgs(argv) {
  const opts = {
    videoPath: DEFAULT_VIDEO_PATH,
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
    } else if (arg === '--video' && argv[i + 1]) {
      opts.videoPath = path.resolve(argv[++i]);
    } else if (arg.startsWith('--video=')) {
      opts.videoPath = path.resolve(arg.slice('--video='.length));
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
  if (vals.length !== 6 || vals.some((n) => !Number.isFinite(n) || n < 0)) {
    throw new Error(`--timestamps requires 6 non-negative numbers (got "${raw}")`);
  }
  return vals;
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
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

  // Check git status if inside a git repository
  let gitInfo = 'no .git repo (verified via cryptographic SHA-256 baselines)';
  try {
    const insideGit = execFileSync('git', ['-C', ROOT_DIR, 'rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    if (insideGit === 'true') {
      const statusOut = execFileSync('git', ['-C', ROOT_DIR, 'status', '--porcelain', '--', 'index.html', 'src'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      }).trim();
      assertCheck('git status clean for index.html and src/*', statusOut === '', statusOut || 'clean');
      gitInfo = 'git worktree clean';
    }
  } catch {
    // Workspace is non-git; SHA-256 checks below enforce byte-for-byte immutability
  }

  assertCheck('index.html exists', fs.existsSync(INDEX_HTML_PATH), INDEX_HTML_PATH);
  const indexStat = fs.statSync(INDEX_HTML_PATH);
  const indexKb = (indexStat.size / 1024).toFixed(1);
  assertCheck(
    'index.html exact byte size untouched (581.2 KB)',
    indexStat.size === EXPECTED_INDEX_BYTES && indexKb === EXPECTED_INDEX_KB,
    `${indexStat.size} bytes (${indexKb} KB)`
  );

  for (const [relPath, expectedHash] of Object.entries(EXPECTED_HASHES)) {
    const absPath = path.join(ROOT_DIR, relPath);
    const exists = fs.existsSync(absPath);
    const actualHash = exists ? sha256File(absPath) : 'MISSING';
    assertCheck(
      `${relPath} SHA-256 matches baseline`,
      actualHash === expectedHash,
      actualHash === expectedHash ? `${actualHash.slice(0, 16)}... (${gitInfo})` : `expected ${expectedHash}, got ${actualHash}`
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

function verifyVideoContainerAndStreams(videoPath, assertCheck) {
  console.log('\n=== 2. MP4 Container, moov Atom & ffprobe Stream Specs ===');

  const exists = fs.existsSync(videoPath) && fs.statSync(videoPath).isFile();
  assertCheck('demo_1080p.mp4 exists', exists, videoPath);
  if (!exists) {
    throw new Error(`Video file does not exist: ${videoPath}`);
  }

  const stat = fs.statSync(videoPath);
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
  assertCheck(
    'demo_1080p.mp4 file size > 2 MB',
    stat.size > 2 * 1024 * 1024,
    `${stat.size} bytes (${sizeMb} MiB)`
  );

  let atoms = [];
  let atomError = null;
  try {
    atoms = parseMp4TopLevelAtoms(videoPath, stat.size);
  } catch (err) {
    atomError = err.message;
  }
  const atomSummary = atoms.map((a) => `${a.type}(${a.size}B)`).join(' -> ');
  const ftypIdx = atoms.findIndex((a) => a.type === 'ftyp');
  const moovIdx = atoms.findIndex((a) => a.type === 'moov');
  const mdatIdx = atoms.findIndex((a) => a.type === 'mdat');
  const faststart = moovIdx !== -1 && mdatIdx !== -1 && moovIdx < mdatIdx;

  assertCheck(
    'Valid ISO BMFF MP4 container with moov & mdat atoms',
    !atomError && ftypIdx === 0 && moovIdx !== -1 && mdatIdx !== -1 && atoms[moovIdx].size > 8,
    atomError ? atomError : `${atomSummary} (faststart=${faststart})`
  );

  const probeJson = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', videoPath],
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
    'Duration within 38s–75s',
    Number.isFinite(duration) && duration >= 38.0 && duration <= 75.0,
    `${duration.toFixed(3)}s`
  );

  const vStream = streams.find((s) => s.codec_type === 'video');
  assertCheck('Video stream present', Boolean(vStream), vStream ? `index=${vStream.index}` : 'MISSING');
  if (!vStream) {
    throw new Error('Missing video stream in demo_1080p.mp4');
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
    'Video frame rate >= 30 fps and constant (r_frame_rate ~= avg_frame_rate)',
    Number.isFinite(rFps) &&
      Number.isFinite(avgFps) &&
      rFps >= 30 &&
      avgFps >= 29.5 &&
      Math.abs(rFps - avgFps) <= 0.5,
    `r_frame_rate=${vStream.r_frame_rate} (${rFps.toFixed(2)} fps), avg_frame_rate=${vStream.avg_frame_rate} (${avgFps.toFixed(2)} fps), nb_frames=${nbFrames}`
  );

  // Packet PTS cadence check to guarantee smooth constant frame pacing without stutters
  const pktJson = execFileSync(
    'ffprobe',
    [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'packet=pts_time,duration_time',
      '-of', 'json',
      videoPath
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
    'Smooth frame PTS cadence (zero dropped/stuttered frame gaps)',
    packets.length >= Math.floor(vDuration * rFps) - 2 && maxDelta <= maxAllowedDt && minDelta > 0,
    `packets=${packets.length}, expectedDt=${(expectedDt * 1000).toFixed(2)}ms, minDt=${(minDelta * 1000).toFixed(2)}ms, maxDt=${(maxDelta * 1000).toFixed(2)}ms`
  );

  const aStream = streams.find((s) => s.codec_type === 'audio');
  assertCheck('Audio stream present', Boolean(aStream), aStream ? `index=${aStream.index}` : 'MISSING');
  if (aStream) {
    const aDuration = Number(aStream.duration || duration);
    assertCheck(
      'Audio codec is aac',
      aStream.codec_name === 'aac',
      `${aStream.codec_name}, ${aStream.sample_rate} Hz, ${aStream.channels} ch (${aStream.channel_layout || 'stereo'})`
    );
    assertCheck(
      'Audio stream spans full video duration',
      Math.abs(aDuration - duration) <= 1.5,
      `audio=${aDuration.toFixed(2)}s vs container=${duration.toFixed(2)}s`
    );
  }

  return { duration, rFps, avgFps, nbFrames, sizeMb, vStream, aStream, faststart };
}

function verifyDecodeAndAudioLevels(videoPath, assertCheck) {
  console.log('\n=== 3. Full Stream Decode, Audio volumedetect & Black/Freeze Scan ===');

  // Run combined info pass capturing stderr for volumedetect, silencedetect, blackdetect, and freezedetect
  const filterOut = execFileSync(
    'bash',
    [
      '-lc',
      `ffmpeg -hide_banner -nostats -i "$1" -af "volumedetect,silencedetect=n=-60dB:d=8" -vf "blackdetect=d=0.6:pix_th=0.02:pic_th=0.99,freezedetect=n=0.0005:d=4.5" -f null - 2>&1`,
      '--',
      videoPath
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );

  const meanMatch = filterOut.match(/mean_volume:\s*([-\d.]+)\s*dB/);
  const maxMatch = filterOut.match(/max_volume:\s*([-\d.]+)\s*dB/);
  const meanVolume = meanMatch ? Number(meanMatch[1]) : NaN;
  const maxVolume = maxMatch ? Number(maxMatch[1]) : NaN;

  assertCheck(
    'Audio mean_volume non-silent (> -55.0 dB)',
    Number.isFinite(meanVolume) && meanVolume > -55.0,
    `mean_volume=${meanVolume} dB`
  );
  assertCheck(
    'Audio max_volume audible (> -35.0 dB)',
    Number.isFinite(maxVolume) && maxVolume > -35.0,
    `max_volume=${maxVolume} dB`
  );

  const longSilences = [...filterOut.matchAll(/silence_duration:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  assertCheck(
    'No dead audio dropouts >= 8s',
    longSilences.length === 0,
    longSilences.length === 0 ? 'continuous audio activity verified' : `silence durations: ${longSilences.join(', ')}s`
  );

  const blackIntervals = [...filterOut.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)].map(
    (m) => `${m[1]}s..${m[2]}s (${m[3]}s)`
  );
  assertCheck(
    'No prolonged blank/black video intervals (>= 0.6s)',
    blackIntervals.length === 0,
    blackIntervals.length === 0 ? '0 blank intervals' : blackIntervals.join('; ')
  );

  const freezeIntervals = [...filterOut.matchAll(/freeze_duration:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  assertCheck(
    'No hung/frozen video stretches (>= 4.5s)',
    freezeIntervals.length === 0,
    freezeIntervals.length === 0 ? '0 frozen stretches' : `freeze durations: ${freezeIntervals.join(', ')}s`
  );

  // Also run strict -v error pass capturing stderr explicitly
  let strictErrOut = '';
  try {
    strictErrOut = execFileSync(
      'bash',
      ['-lc', 'ffmpeg -v error -i "$1" -f null - 2>&1', '--', videoPath],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
    ).trim();
  } catch (err) {
    strictErrOut = String(err.stdout || err.stderr || err.message || 'ffmpeg decode failed').trim();
  }
  assertCheck(
    'Zero H.264 / AAC decode errors across entire file',
    strictErrOut.length === 0,
    strictErrOut.length === 0 ? 'clean decode' : strictErrOut.slice(0, 200)
  );

  return { meanVolume, maxVolume };
}

function extractSampleFrames(videoPath, duration, customTimestamps, assertCheck) {
  console.log('\n=== 4. Sample Frame Extraction (Acts 1–5 -> demo_frame_1..6.png) ===');
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  const timestamps =
    customTimestamps ||
    DEFAULT_FRAME_FRACTIONS.map((frac) => {
      const t = Math.max(0.4, Math.min(duration - 0.5, duration * frac));
      return Number(t.toFixed(2));
    });

  const extracted = [];
  const seenHashes = new Set();

  for (let i = 0; i < 6; i++) {
    const idx = i + 1;
    const ts = timestamps[i];
    const outPath = path.join(SHOTS_DIR, `demo_frame_${idx}.png`);

    if (fs.existsSync(outPath)) {
      fs.unlinkSync(outPath);
    }

    execFileSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel', 'error',
        '-y',
        '-ss', String(ts),
        '-i', videoPath,
        '-frames:v', '1',
        '-update', '1',
        outPath
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    const exists = fs.existsSync(outPath);
    assertCheck(`demo_frame_${idx}.png extracted (@ ${ts.toFixed(2)}s)`, exists, outPath);
    if (exists) {
      const info = readPngDimensions(outPath);
      seenHashes.add(info.sha256);
      assertCheck(
        `demo_frame_${idx}.png is valid 1920x1080 non-blank PNG`,
        info.width === 1920 && info.height === 1080 && info.bytes > 20 * 1024,
        `${info.width}x${info.height}, ${(info.bytes / 1024).toFixed(1)} KB`
      );
      extracted.push({ idx, ts, outPath, ...info });
    }
  }

  assertCheck(
    'All 6 extracted sample frames are visually distinct (unique SHA-256)',
    seenHashes.size === 6,
    `${seenHashes.size}/6 unique frames`
  );

  return extracted;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { checks, assertCheck } = createRunner();

  verifySourceImmutability(assertCheck);

  if (opts.selfCheckOnly) {
    const failed = checks.filter((c) => !c.pass);
    console.log(`\n[SELF-CHECK SUMMARY] ${checks.length - failed.length}/${checks.length} checks passed.`);
    process.exit(failed.length === 0 ? 0 : 1);
  }

  const probeSummary = verifyVideoContainerAndStreams(opts.videoPath, assertCheck);
  const audioSummary = verifyDecodeAndAudioLevels(opts.videoPath, assertCheck);
  const frames = opts.noExtract
    ? []
    : extractSampleFrames(opts.videoPath, probeSummary.duration, opts.timestamps, assertCheck);

  const failed = checks.filter((c) => !c.pass);
  console.log('\n============================================================');
  console.log(
    `[VIDEO QA SUMMARY] ${checks.length - failed.length}/${checks.length} automated checks passed | ` +
      `${probeSummary.vStream.width}x${probeSummary.vStream.height} ${probeSummary.vStream.codec_name}/${probeSummary.vStream.pix_fmt} ` +
      `@ ${probeSummary.rFps.toFixed(2)} fps | ${probeSummary.duration.toFixed(2)}s | ${probeSummary.sizeMb} MiB | ` +
      `audio ${probeSummary.aStream?.codec_name} (mean ${audioSummary.meanVolume} dB, max ${audioSummary.maxVolume} dB)`
  );
  if (frames.length > 0) {
    console.log(
      'Extracted frames: ' +
        frames.map((f) => `demo_frame_${f.idx}.png@${f.ts.toFixed(2)}s`).join(', ')
    );
  }
  console.log('============================================================');

  if (failed.length > 0) {
    console.error('Failed checks:');
    for (const f of failed) {
      console.error(`  - ${f.name}: ${f.detail}`);
    }
    process.exit(1);
  }
}

try {
  main();
} catch (err) {
  console.error(`\n[FATAL QA ERROR] ${err.message || err}`);
  process.exit(1);
}
