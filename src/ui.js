(function(TD) {
  'use strict';

  /* ==========================================================================
   * 1. PROCEDURAL TACTILE STONE, HAMMERED-BRONZE & LEATHER DATA-URI TEXTURES
   *    100% offline canvas synthesis injected into CSS custom properties.
   * ========================================================================== */

  const SurfaceTextures = {
    _injected: false,

    _hash2(ix, iy, period, seed) {
      const x = ((ix % period) + period) % period;
      const y = ((iy % period) + period) % period;
      let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed | 0, 1442695041);
      h = (h ^ (h >>> 13)) | 0;
      h = Math.imul(h, 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    },

    _noiseTile(u, v, period, seed) {
      const x = u * period;
      const y = v * period;
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const fx = x - ix;
      const fy = y - iy;
      const ux = fx * fx * (3 - 2 * fx);
      const uy = fy * fy * (3 - 2 * fy);
      const n00 = this._hash2(ix, iy, period, seed);
      const n10 = this._hash2(ix + 1, iy, period, seed);
      const n01 = this._hash2(ix, iy + 1, period, seed);
      const n11 = this._hash2(ix + 1, iy + 1, period, seed);
      return (n00 + (n10 - n00) * ux) * (1 - uy) + (n01 + (n11 - n01) * ux) * uy;
    },

    _fbm(u, v, basePeriod, octaves, seed) {
      let sum = 0;
      let amp = 0.5;
      let norm = 0;
      let p = basePeriod;
      for (let i = 0; i < octaves; i++) {
        sum += amp * this._noiseTile(u, v, p, seed + i * 97);
        norm += amp;
        amp *= 0.5;
        p *= 2;
      }
      return sum / (norm || 1);
    },

    inject() {
      if (this._injected || typeof document === 'undefined') return;
      const rootStyle = document.documentElement && document.documentElement.style;
      if (!rootStyle) return;

      try {
        const S = 96;
        const canvas = document.createElement('canvas');
        canvas.width = S;
        canvas.height = S;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // A. Chiseled Dark-Stone Grain (--tex-stone)
        const stoneImg = ctx.createImageData(S, S);
        const sd = stoneImg.data;
        for (let y = 0; y < S; y++) {
          const v = y / S;
          for (let x = 0; x < S; x++) {
            const u = x / S;
            const idx = (y * S + x) * 4;
            const coarse = this._fbm(u, v, 6, 3, 101);
            const fine = this._noiseTile(u, v, 32, 313);
            const crack = Math.abs(this._fbm(u + 0.17, v - 0.11, 10, 2, 509) - 0.5);
            const mica = this._hash2(x, y, S, 773);

            if (crack < 0.022) {
              // Subtle dark chiseled stone fissure
              sd[idx] = 4;
              sd[idx + 1] = 6;
              sd[idx + 2] = 9;
              sd[idx + 3] = 46;
            } else if (mica > 0.985) {
              // Tiny warm mineral quartz glint
              sd[idx] = 245;
              sd[idx + 1] = 224;
              sd[idx + 2] = 172;
              sd[idx + 3] = 26;
            } else {
              const val = coarse * 0.68 + fine * 0.32;
              if (val > 0.52) {
                sd[idx] = 228;
                sd[idx + 1] = 218;
                sd[idx + 2] = 198;
                sd[idx + 3] = Math.round((val - 0.52) * 58);
              } else {
                sd[idx] = 5;
                sd[idx + 1] = 7;
                sd[idx + 2] = 11;
                sd[idx + 3] = Math.round((0.52 - val) * 74);
              }
            }
          }
        }
        ctx.putImageData(stoneImg, 0, 0);
        const stoneUri = canvas.toDataURL('image/png');
        rootStyle.setProperty('--tex-stone', 'url("' + stoneUri + '")');

        // B. Hammered & Brushed Tarnished Bronze (--tex-bronze)
        const bronzeImg = ctx.createImageData(S, S);
        const bd = bronzeImg.data;
        for (let y = 0; y < S; y++) {
          const v = y / S;
          for (let x = 0; x < S; x++) {
            const u = x / S;
            const idx = (y * S + x) * 4;
            const hammer = this._fbm(u, v, 8, 3, 907);
            const brush = this._noiseTile(u * 0.5, v * 2.5, 24, 1217);
            const pit = this._hash2(x, y, S, 1553);

            if (pit < 0.018) {
              bd[idx] = 18;
              bd[idx + 1] = 11;
              bd[idx + 2] = 4;
              bd[idx + 3] = 48;
            } else {
              const m = hammer * 0.62 + brush * 0.38;
              if (m > 0.51) {
                bd[idx] = 255;
                bd[idx + 1] = 236;
                bd[idx + 2] = 175;
                bd[idx + 3] = Math.round((m - 0.51) * 56);
              } else {
                bd[idx] = 26;
                bd[idx + 1] = 16;
                bd[idx + 2] = 5;
                bd[idx + 3] = Math.round((0.51 - m) * 68);
              }
            }
          }
        }
        ctx.putImageData(bronzeImg, 0, 0);
        const bronzeUri = canvas.toDataURL('image/png');
        rootStyle.setProperty('--tex-bronze', 'url("' + bronzeUri + '")');

        // C. Blind-Tooled Dark Pebble Leather (--tex-leather)
        const leatherImg = ctx.createImageData(S, S);
        const ld = leatherImg.data;
        for (let y = 0; y < S; y++) {
          const v = y / S;
          for (let x = 0; x < S; x++) {
            const u = x / S;
            const idx = (y * S + x) * 4;
            const peb = this._noiseTile(u, v, 24, 2029);
            const macro = this._fbm(u, v, 6, 2, 2311);
            const comb = peb * 0.65 + macro * 0.35;
            if (comb > 0.54) {
              ld[idx] = 240;
              ld[idx + 1] = 208;
              ld[idx + 2] = 152;
              ld[idx + 3] = Math.round((comb - 0.54) * 48);
            } else {
              ld[idx] = 8;
              ld[idx + 1] = 5;
              ld[idx + 2] = 3;
              ld[idx + 3] = Math.round((0.54 - comb) * 66);
            }
          }
        }
        ctx.putImageData(leatherImg, 0, 0);
        const leatherUri = canvas.toDataURL('image/png');
        rootStyle.setProperty('--tex-leather', 'url("' + leatherUri + '")');

        this._injected = true;
      } catch (_err) {
        // Safe no-op in non-canvas environments
      }
    }
  };

  /* ==========================================================================
   * 2. SCULPTED INLINE SVG FILIGREE, CRESTS & HERALDIC SHIELDS (Zero URLs!)
   * ========================================================================== */

  const ICONS = {
    crest:
      '<svg viewBox="0 0 116 36" width="104" height="32" aria-hidden="true">' +
      '<defs>' +
      '<linearGradient id="tdCrestGold" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#fff9db"/>' +
      '<stop offset="45%" stop-color="#e5be62"/>' +
      '<stop offset="100%" stop-color="#7c5616"/>' +
      '</linearGradient>' +
      '</defs>' +
      '<path d="M4 18 H32 L40 12 L46 18 L40 24 L32 18 M112 18 H84 L76 12 L70 18 L76 24 L84 18" fill="none" stroke="url(#tdCrestGold)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M22 14 C28 8 36 8 43 13 M94 14 C88 8 80 8 73 13" fill="none" stroke="#c89e46" stroke-width="1.2" opacity="0.8"/>' +
      '<polygon points="58,2 62.2,12.2 73,9.5 66,18 73,26.5 62.2,23.8 58,34 53.8,23.8 43,26.5 50,18 43,9.5 53.8,12.2" fill="rgba(235,204,112,0.22)" stroke="url(#tdCrestGold)" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<polygon points="58,6 60.5,15.5 70,18 60.5,20.5 58,30 55.5,20.5 46,18 55.5,15.5" fill="url(#tdCrestGold)"/>' +
      '<circle cx="58" cy="18" r="3.4" fill="#ffffff"/>' +
      '<circle cx="28" cy="18" r="2" fill="#f3d888"/>' +
      '<circle cx="88" cy="18" r="2" fill="#f3d888"/>' +
      '</svg>',

    cornerBracket:
      '<svg viewBox="0 0 22 22" aria-hidden="true">' +
      '<path d="M1 21 V4 C1 2.2 2.2 1 4 1 H21 L17 4.5 H6.5 C5.2 4.5 4.5 5.2 4.5 6.5 V17 Z" fill="#d9b259" stroke="#3c2808" stroke-width="0.9"/>' +
      '<path d="M2 18 V4.2 C2 2.8 2.8 2 4.2 2 H18" fill="none" stroke="#fff5c8" stroke-width="0.8" opacity="0.75"/>' +
      '<circle cx="5.2" cy="5.2" r="1.7" fill="#fff2be" stroke="#4c330b" stroke-width="0.7"/>' +
      '</svg>',

    filigreeLeft:
      '<svg class="dock-filigree-wing" viewBox="0 0 64 22" aria-hidden="true">' +
      '<defs><linearGradient id="tdFilL" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fae49c"/><stop offset="55%" stop-color="#b98e39"/><stop offset="100%" stop-color="#614412"/></linearGradient></defs>' +
      '<path d="M63 19 H12 C5 19 2 14.5 3.5 10 C5 6 9.5 5.5 11.5 8.5 C13 10.8 11 14 8.2 13.2 M63 14.5 H26 C19 14.5 16 10.5 17 6.5 C17.8 3.5 21.5 3 23 5.5 M63 9.5 H41 C35 9.5 31 6.5 29 3" fill="none" stroke="url(#tdFilL)" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M62 19 L52 19 L57 12 Z" fill="url(#tdFilL)" opacity="0.85"/>' +
      '<circle cx="59" cy="7" r="2" fill="#fae49c"/>' +
      '<circle cx="45" cy="14.5" r="1.6" fill="#fae49c"/>' +
      '</svg>',

    filigreeRight:
      '<svg class="dock-filigree-wing" viewBox="0 0 64 22" aria-hidden="true">' +
      '<defs><linearGradient id="tdFilR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fae49c"/><stop offset="55%" stop-color="#b98e39"/><stop offset="100%" stop-color="#614412"/></linearGradient></defs>' +
      '<path d="M1 19 H52 C59 19 62 14.5 60.5 10 C59 6 54.5 5.5 52.5 8.5 C51 10.8 53 14 55.8 13.2 M1 14.5 H38 C45 14.5 48 10.5 47 6.5 C46.2 3.5 42.5 3 41 5.5 M1 9.5 H23 C29 9.5 33 6.5 35 3" fill="none" stroke="url(#tdFilR)" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M2 19 L12 19 L7 12 Z" fill="url(#tdFilR)" opacity="0.85"/>' +
      '<circle cx="5" cy="7" r="2" fill="#fae49c"/>' +
      '<circle cx="19" cy="14.5" r="1.6" fill="#fae49c"/>' +
      '</svg>',

    dividerBaluster:
      '<svg viewBox="0 0 12 104" preserveAspectRatio="none" aria-hidden="true">' +
      '<defs><linearGradient id="tdDivBronze" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#583d10"/><stop offset="45%" stop-color="#f0d27a"/><stop offset="100%" stop-color="#4c340d"/></linearGradient></defs>' +
      '<rect x="4.5" y="4" width="3" height="96" fill="url(#tdDivBronze)"/>' +
      '<polygon points="1,2 11,2 9,9 3,9" fill="url(#tdDivBronze)" stroke="#1b1205" stroke-width="0.8"/>' +
      '<polygon points="3,95 9,95 11,102 1,102" fill="url(#tdDivBronze)" stroke="#1b1205" stroke-width="0.8"/>' +
      '<polygon points="6,43 11,52 6,61 1,52" fill="url(#tdDivBronze)" stroke="#1b1205" stroke-width="0.9"/>' +
      '<circle cx="6" cy="52" r="1.7" fill="#fff7d4"/>' +
      '</svg>',

    medallionRing:
      '<svg class="medallion-bezel-svg" viewBox="0 0 156 156" aria-hidden="true">' +
      '<circle cx="78" cy="78" r="73.5" fill="none" stroke="rgba(255,244,200,0.42)" stroke-width="1"/>' +
      '<circle cx="78" cy="78" r="70.5" fill="none" stroke="rgba(32,20,5,0.72)" stroke-width="1.2" stroke-dasharray="3 5"/>' +
      '<circle cx="78" cy="5.5" r="2" fill="#fff2be" stroke="#3d2908" stroke-width="0.8"/>' +
      '<circle cx="78" cy="150.5" r="2" fill="#fff2be" stroke="#3d2908" stroke-width="0.8"/>' +
      '<circle cx="5.5" cy="78" r="2" fill="#fff2be" stroke="#3d2908" stroke-width="0.8"/>' +
      '<circle cx="150.5" cy="78" r="2" fill="#fff2be" stroke="#3d2908" stroke-width="0.8"/>' +
      '</svg>',

    wavePlaqueBg:
      '<svg class="wave-plaque-svg" viewBox="0 0 292 50" preserveAspectRatio="none" aria-hidden="true">' +
      '<defs>' +
      '<linearGradient id="tdWaveStone" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#36322d"/>' +
      '<stop offset="50%" stop-color="#1e1c1b"/>' +
      '<stop offset="100%" stop-color="#101013"/>' +
      '</linearGradient>' +
      '<linearGradient id="tdWaveBronze" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#fff2bc"/>' +
      '<stop offset="38%" stop-color="#cfa349"/>' +
      '<stop offset="78%" stop-color="#876220"/>' +
      '<stop offset="100%" stop-color="#4d350c"/>' +
      '</linearGradient>' +
      '</defs>' +
      '<path d="M2,1 L22,1 L34,23 L22,19 L12,11 Z M290,1 L270,1 L258,23 L270,19 L280,11 Z" fill="url(#tdWaveBronze)" stroke="#1b1205" stroke-width="1"/>' +
      '<polygon points="14,1 278,1 252,46 40,46" fill="url(#tdWaveStone)" stroke="url(#tdWaveBronze)" stroke-width="2.6" stroke-linejoin="round"/>' +
      '<polygon points="21,4.5 271,4.5 248,41.5 44,41.5" fill="none" stroke="rgba(255,241,192,0.3)" stroke-width="1"/>' +
      '<line x1="56" y1="42" x2="236" y2="42" stroke="rgba(0,0,0,0.65)" stroke-width="1.4"/>' +
      '<circle cx="24" cy="7" r="2.1" fill="#fff2be" stroke="#3c2808" stroke-width="0.7"/>' +
      '<circle cx="268" cy="7" r="2.1" fill="#fff2be" stroke="#3c2808" stroke-width="0.7"/>' +
      '<circle cx="44" cy="41" r="2.1" fill="#fff2be" stroke="#3c2808" stroke-width="0.7"/>' +
      '<circle cx="248" cy="41" r="2.1" fill="#fff2be" stroke="#3c2808" stroke-width="0.7"/>' +
      '</svg>',

    padSocketTurret:
      '<svg viewBox="0 0 32 32" aria-hidden="true">' +
      '<circle cx="16" cy="24" r="10.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2.2" opacity="0.75"/>' +
      '<path d="M10 24 L11.5 11 H20.5 L22 24 Z" fill="rgba(255,240,195,0.12)" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M9 7 H12.5 V10 H14.5 V7 H17.5 V10 H19.5 V7 H23 V11 H9 Z" fill="currentColor" opacity="0.9"/>' +
      '<path d="M14.5 24 V18.5 C14.5 17.5 17.5 17.5 17.5 18.5 V24" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
      '</svg>',

    diffRanger:
      '<svg viewBox="0 0 40 44" aria-hidden="true">' +
      '<defs><linearGradient id="tdShR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2e6b48"/><stop offset="100%" stop-color="#11291c"/></linearGradient></defs>' +
      '<path d="M4 5 L20 2 L36 5 V21 C36 31.5 20 41 20 41 C20 41 4 31.5 4 21 Z" fill="url(#tdShR)" stroke="#e4c26b" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<path d="M7.5 8 L20 5.6 L32.5 8 V20.5 C32.5 28.8 20 37 20 37 C20 37 7.5 28.8 7.5 20.5 Z" fill="none" stroke="rgba(255,244,200,0.32)" stroke-width="1"/>' +
      '<path d="M12 29 L28 13 M28 13 H22.5 M28 13 V18.5" fill="none" stroke="#fff3c4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M13 15 C18 12 25 19 22 26" fill="none" stroke="#8df0c8" stroke-width="1.6" stroke-linecap="round"/>' +
      '</svg>',

    diffCaptain:
      '<svg viewBox="0 0 40 44" aria-hidden="true">' +
      '<defs><linearGradient id="tdShC" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#28496e"/><stop offset="100%" stop-color="#101d2e"/></linearGradient></defs>' +
      '<path d="M4 5 L20 2 L36 5 V21 C36 31.5 20 41 20 41 C20 41 4 31.5 4 21 Z" fill="url(#tdShC)" stroke="#f0d27a" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<path d="M7.5 8 L20 5.6 L32.5 8 V20.5 C32.5 28.8 20 37 20 37 C20 37 7.5 28.8 7.5 20.5 Z" fill="none" stroke="rgba(255,244,200,0.35)" stroke-width="1"/>' +
      '<path d="M20 10 L23.5 16 V26 H16.5 V16 Z" fill="#e6eef8" stroke="#fff3c4" stroke-width="1.1"/>' +
      '<path d="M16 18 L10 13 L12 21 Z M24 18 L30 13 L28 21 Z" fill="#fff3c4"/>' +
      '<line x1="20" y1="16" x2="20" y2="25" stroke="#101d2e" stroke-width="1.5"/>' +
      '</svg>',

    diffSteward:
      '<svg viewBox="0 0 40 44" aria-hidden="true">' +
      '<defs><linearGradient id="tdShS" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6e231c"/><stop offset="100%" stop-color="#260b09"/></linearGradient></defs>' +
      '<path d="M4 5 L20 2 L36 5 V21 C36 31.5 20 41 20 41 C20 41 4 31.5 4 21 Z" fill="url(#tdShS)" stroke="#f2c464" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<path d="M7.5 8 L20 5.6 L32.5 8 V20.5 C32.5 28.8 20 37 20 37 C20 37 7.5 28.8 7.5 20.5 Z" fill="none" stroke="rgba(255,220,175,0.35)" stroke-width="1"/>' +
      '<path d="M20 9 L22 27 M15 23 H25 M13 13 L16.5 16 L20 11.5 L23.5 16 L27 13" fill="none" stroke="#ffe082" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="20" cy="31" r="2.2" fill="#ff9800"/>' +
      '</svg>',

    lives:
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<defs><radialGradient id="tdRubyHeart" cx="38%" cy="32%" r="65%"><stop offset="0%" stop-color="#ff8a80"/><stop offset="45%" stop-color="#d51b24"/><stop offset="100%" stop-color="#68090f"/></radialGradient></defs>' +
      '<path d="M12 21 C12 21 3.2 15.4 3.2 9.1 C3.2 5.9 5.7 3.6 8.6 3.6 C10.4 3.6 11.5 4.5 12 5.7 C12.5 4.5 13.6 3.6 15.4 3.6 C18.3 3.6 20.8 5.9 20.8 9.1 C20.8 15.4 12 21 12 21 Z" fill="url(#tdRubyHeart)" stroke="#f3d27a" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M6.8 7.2 C7.9 5.8 9.7 5.7 10.6 6.7" fill="none" stroke="#ffe4e6" stroke-width="1.5" stroke-linecap="round"/>' +
      '</svg>',

    gold:
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<defs><radialGradient id="tdCoinFace" cx="36%" cy="30%" r="68%"><stop offset="0%" stop-color="#fff8cf"/><stop offset="48%" stop-color="#eab949"/><stop offset="100%" stop-color="#875c12"/></radialGradient></defs>' +
      '<circle cx="12" cy="12" r="9.5" fill="url(#tdCoinFace)" stroke="#fff3c0" stroke-width="1.4"/>' +
      '<circle cx="12" cy="12" r="6.8" fill="none" stroke="#78510d" stroke-width="1.1"/>' +
      '<path d="M12 6.8 L13.5 10.5 L17.2 12 L13.5 13.5 L12 17.2 L10.5 13.5 L6.8 12 L10.5 10.5 Z" fill="#6b460a"/>' +
      '<circle cx="12" cy="12" r="1.5" fill="#fff7d4"/>' +
      '</svg>',

    corruptionGem:
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<polygon points="12,2 19.8,9 12,22 4.2,9" fill="#17986e" stroke="#d4ffea" stroke-width="1.3" stroke-linejoin="round"/>' +
      '<polygon points="12,2 16,9 12,22 8,9" fill="#4bf0b5" opacity="0.78"/>' +
      '<polygon points="12,2 15.8,9 8.2,9" fill="#b8ffdf" opacity="0.65"/>' +
      '<line x1="4.6" y1="9" x2="19.4" y2="9" stroke="#e2fff2" stroke-width="1"/>' +
      '</svg>',

    corruptionGemFire:
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<polygon points="12,2 19.8,9 12,22 4.2,9" fill="#d84315" stroke="#ffe596" stroke-width="1.3" stroke-linejoin="round"/>' +
      '<polygon points="12,2 16,9 12,22 8,9" fill="#ffb340" opacity="0.86"/>' +
      '<ellipse cx="12" cy="10.4" rx="1.7" ry="4" fill="#1a0602"/>' +
      '</svg>',

    horn:
      '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
      '<path d="M4 15.5 C8.5 15.5 13.5 12.2 18.5 6.5 L20.8 9.6 C15.6 15.2 10.5 18.2 5 18.8 Z" fill="currentColor" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>' +
      '<path d="M17.8 5.8 L21.2 10.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>',

    towerStud:
      '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">' +
      '<path d="M6 20 L7.2 9 H16.8 L18 20 Z M5.5 5 H8.5 V7.5 H10.5 V5 H13.5 V7.5 H15.5 V5 H18.5 V9 H5.5 Z" fill="currentColor"/>' +
      '</svg>',

    pause:
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
      '<rect x="6.2" y="4.8" width="4.2" height="14.4" rx="1.1" fill="currentColor"/>' +
      '<rect x="13.6" y="4.8" width="4.2" height="14.4" rx="1.1" fill="currentColor"/>' +
      '</svg>',

    play:
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
      '<path d="M7.5 4.8 L19.2 12 L7.5 19.2 Z" fill="currentColor"/>' +
      '</svg>',

    soundOn:
      '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
      '<path d="M4 9 H8.5 L14 4.5 V19.5 L8.5 15 H4 Z" fill="currentColor"/>' +
      '<path d="M17 8.5 C18.8 10.2 18.8 13.8 17 15.5 M19.5 6 C22.5 9.2 22.5 14.8 19.5 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '</svg>',

    soundOff:
      '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
      '<path d="M4 9 H8.5 L14 4.5 V19.5 L8.5 15 H4 Z" fill="currentColor"/>' +
      '<path d="M17 9 L22 15 M22 9 L17 15" fill="none" stroke="#ff7043" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>',

    codex:
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
      '<path d="M4 5.5 C4 4.7 4.7 4 5.5 4 H11 C12 4 12 5 12 5.5 V19.5 C12 18.8 11.2 18.5 10.5 18.5 H5.5 C4.7 18.5 4 18 4 17 Z" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
      '<path d="M20 5.5 C20 4.7 19.3 4 18.5 4 H13 C12 4 12 5 12 5.5 V19.5 C12 18.8 12.8 18.5 13.5 18.5 H18.5 C19.3 18.5 20 18 20 17 Z" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
      '</svg>',

    restart:
      '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
      '<path d="M19 8 A8 8 0 1 0 20 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M19 3.8 V8.5 H14.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>',

    menu:
      '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
      '<path d="M4 7 H20 M4 12 H20 M4 17 H20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>',

    bossSkull:
      '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">' +
      '<path d="M12 2 L14.5 7 L19 5 L17.5 10.5 L21 13 L17 15.5 L16 21 H8 L7 15.5 L3 13 L6.5 10.5 L5 5 L9.5 7 Z" fill="#ff7043" stroke="#ffd54f" stroke-width="1.2"/>' +
      '</svg>',

    star:
      '<svg class="victory-star" viewBox="0 0 48 48" aria-hidden="true">' +
      '<defs><linearGradient id="tdVicStar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fffbe0"/><stop offset="50%" stop-color="#f0c85a"/><stop offset="100%" stop-color="#9c6e18"/></linearGradient></defs>' +
      '<path d="M24 4 L29.9 16.4 L43.6 18.2 L33.6 27.7 L36.1 41.3 L24 34.8 L11.9 41.3 L14.4 27.7 L4.4 18.2 L18.1 16.4 Z" fill="url(#tdVicStar)" stroke="#fff7d4" stroke-width="2" stroke-linejoin="round"/>' +
      '</svg>'
  };

  function fourCornersHtml() {
    return (
      '<span class="bronze-corner bronze-corner-tl" aria-hidden="true">' + ICONS.cornerBracket + '</span>' +
      '<span class="bronze-corner bronze-corner-tr" aria-hidden="true">' + ICONS.cornerBracket + '</span>' +
      '<span class="bronze-corner bronze-corner-bl" aria-hidden="true">' + ICONS.cornerBracket + '</span>' +
      '<span class="bronze-corner bronze-corner-br" aria-hidden="true">' + ICONS.cornerBracket + '</span>'
    );
  }

  /* ==========================================================================
   * 3. CANONICAL FALLBACK METADATA
   * ========================================================================== */

  const MAP_META_FALLBACK = {
    hornburg: {
      name: 'The Hornburg Causeway',
      desc: 'A single rain-swept stone causeway beneath the Deeping Wall leading to the Hornburg gate.',
      lanesLabel: '1 Winding Lane',
      padsCount: 14,
      weatherType: 'rain',
      weatherLabel: 'Driving Rain'
    },
    pelennor: {
      name: 'Pelennor Crossroads',
      desc: 'Dual converging siege roads across scorched plains before the Great Gate of the White City.',
      lanesLabel: '2 Converging Lanes',
      padsCount: 15,
      weatherType: 'ash',
      weatherLabel: 'Battle Ash'
    },
    blackgate: {
      name: 'The Black Gate',
      desc: 'Short, relentless twin volcanic tracks across obsidian wastes between the Teeth of Mordor.',
      lanesLabel: '2 Twin Lanes',
      padsCount: 14,
      weatherType: 'embers',
      weatherLabel: 'Mordor Embers'
    }
  };

  const TOWER_ORDER = ['elven', 'garrison', 'dwarven', 'istari'];

  const TOWER_SHORT_LABELS = {
    elven: 'Elven Archer',
    garrison: 'Garrison',
    dwarven: 'Dwarven Siege',
    istari: 'Istari Spire'
  };

  const TOWER_META_FALLBACK = {
    elven: {
      name: 'Elven Watchtower',
      cost: 90,
      range: 185,
      minRange: 0,
      damage: 20,
      fireRate: 1.35,
      dmgType: 'physical',
      canTargetFlying: true,
      role: 'Fast silver arrows • Ground & Air • Ignores 20% armor',
      t2: {
        name: 'Lothlórien Sentinel',
        cost: 110,
        range: 205,
        minRange: 0,
        desc: 'Sharpened Mallorn bows with extended sight and faster draw.'
      },
      A: {
        name: 'Galadhrim Longbows',
        cost: 210,
        range: 275,
        minRange: 0,
        desc: 'Extreme range sniper; 30% crit for 3x dmg + 18 DPS bleed (3s).',
        skillName: 'Starlight Piercer',
        skillCd: 14,
        skillDesc: 'Fires a radiant arrow at the strongest foe for massive true/crit damage and 1.5s stun.'
      },
      B: {
        name: 'Mirkwood Wardens',
        cost: 200,
        range: 215,
        minRange: 0,
        desc: 'Rapid volley firing 3 silver arrows at up to 3 targets simultaneously.',
        skillName: 'Woodland Pinning Volley',
        skillCd: 12,
        skillDesc: 'Unleashes a 6-arrow hail that slows struck enemies by 45% for 2.5s.'
      }
    },
    garrison: {
      name: 'Garrison of Men',
      cost: 100,
      range: 155,
      minRange: 0,
      damage: 16,
      fireRate: 1.0,
      dmgType: 'physical',
      canTargetFlying: false,
      role: '3 Citadel Guards • Blocks ground foes • 10s respawn',
      t2: {
        name: 'Gondorian Barracks',
        cost: 115,
        range: 170,
        minRange: 0,
        desc: 'Tempered steel mail, higher guard health, and wider rally reach.'
      },
      A: {
        name: 'Tower Guard Phalanx',
        cost: 210,
        range: 175,
        minRange: 0,
        desc: '420 HP heavy shields (60% armor) + Taunt Aura reducing foe melee dmg by 20%.',
        skillName: 'Citadel Shield Wall',
        skillCd: 16,
        skillDesc: 'Restores 40% HP to living guards and grants 90% damage reduction for 3.5s.'
      },
      B: {
        name: 'Knights of the Riddermark',
        cost: 220,
        range: 190,
        minRange: 0,
        desc: 'Swift mounted Rohirrim with 2.5x charge impact and 48px cleave strikes.',
        skillName: 'Forth Eorlingas!',
        skillCd: 15,
        skillDesc: 'Lancers surge across nearby enemies dealing heavy trample damage and 0.8s stun.'
      }
    },
    dwarven: {
      name: 'Dwarven Siege Foundry',
      cost: 125,
      range: 215,
      minRange: 75,
      damage: 54,
      fireRate: 0.55,
      dmgType: 'physical',
      canTargetFlying: false,
      role: 'Ballistic AoE boulders • 65px splash • 75px deadzone',
      t2: {
        name: 'Erebor Heavy Battery',
        cost: 140,
        range: 240,
        minRange: 75,
        desc: 'Reinforced torsion arms hurling heavier explosive stone charges.'
      },
      A: {
        name: 'Iron Hills Mortar',
        cost: 240,
        range: 250,
        minRange: 75,
        desc: '105px blast leaving burning oil (4.5s fire DoT; halts Troll regen).',
        skillName: 'Dragonfire Barrage',
        skillCd: 18,
        skillDesc: 'Launches 3 incendiary mortar shells across enemies in range, igniting the road.'
      },
      B: {
        name: 'Khazad Ballista',
        cost: 230,
        range: 265,
        minRange: 55,
        desc: 'Line-piercing iron bolts that permanently shred 50% physical armor.',
        skillName: 'Mithril Skewer',
        skillCd: 15,
        skillDesc: 'Fires an overcharged rune bolt piercing the entire line for 2x damage + pushback.'
      }
    },
    istari: {
      name: 'Istari Spire',
      cost: 115,
      range: 175,
      minRange: 0,
      damage: 28,
      fireRate: 0.95,
      dmgType: 'magic',
      canTargetFlying: true,
      role: 'Pure Magic • Ground & Air • 20% Slow & Reveals Wraiths',
      t2: {
        name: 'White Council Sanctum',
        cost: 135,
        range: 195,
        minRange: 0,
        desc: 'Amplified arcane focus increasing spell potency and reveal radius.'
      },
      A: {
        name: 'Flame of Anor',
        cost: 245,
        range: 210,
        minRange: 0,
        desc: 'Continuous fiery-arcane beam ramping from 1.0x up to 3.5x DPS over 4s.',
        skillName: 'Secret Fire Nova',
        skillCd: 16,
        skillDesc: 'Erupts a white-gold shockwave (95px) at the target for heavy fire/magic dmg + 1.5s stun.'
      },
      B: {
        name: 'Stormcaller Council',
        cost: 235,
        range: 215,
        minRange: 0,
        desc: 'Chain lightning arcing up to 5 foes with 25% chance to push enemies back.',
        skillName: 'Tempest of Manwë',
        skillCd: 16,
        skillDesc: 'Strikes up to 4 strongest foes in range with sky lightning bolts and knockback.'
      }
    }
  };

  const ENEMY_ORDER = [
    'goblin',
    'orc',
    'uruk',
    'warg',
    'troll',
    'wraith',
    'fellbeast',
    'ringwraith',
    'balrog'
  ];

  const ENEMY_META_FALLBACK = {
    goblin: {
      name: 'Goblin Scavenger',
      hp: 48,
      speed: 96,
      physArmor: 0,
      magicResist: 0,
      bounty: 6,
      livesCost: 1,
      flying: false,
      isBoss: false,
      trait: 'Swarms in tight packs of 15–20. Vulnerable to Dwarven splash, Knights cleave, and chain lightning.'
    },
    orc: {
      name: 'Orc Infantry',
      hp: 115,
      speed: 64,
      physArmor: 0.20,
      magicResist: 0,
      bounty: 11,
      livesCost: 1,
      flying: false,
      isBoss: false,
      trait: 'Disciplined iron-clad footmen forming the backbone of Mordor assaults.'
    },
    uruk: {
      name: 'Uruk-hai Berserker',
      hp: 260,
      speed: 60,
      physArmor: 0.35,
      magicResist: 0.10,
      bounty: 20,
      livesCost: 2,
      flying: false,
      isBoss: false,
      trait: 'Blood Rage below 40% HP: gains +50% move & melee attack speed. Burst down quickly!'
    },
    warg: {
      name: 'Warg Rider',
      hp: 155,
      speed: 112,
      physArmor: 0.15,
      magicResist: 0,
      bounty: 16,
      livesCost: 1,
      flying: false,
      isBoss: false,
      trait: 'Swift cavalry that leaps right past the first Garrison soldier attempting to block it (10s CD).'
    },
    troll: {
      name: 'Olog-hai Siege Troll',
      hp: 850,
      speed: 36,
      physArmor: 0.60,
      magicResist: 0.10,
      bounty: 48,
      livesCost: 3,
      flying: false,
      isBoss: false,
      trait: 'Heavy 60% armor, AoE club smash vs guards, and regenerates 18 HP/s unless hit by Fire or Magic!'
    },
    wraith: {
      name: 'Shadow Wraith',
      hp: 170,
      speed: 74,
      physArmor: 0.10,
      magicResist: 0.30,
      bounty: 24,
      livesCost: 2,
      flying: false,
      isBoss: false,
      trait: '80% physical dodge while veiled! Reveal with Istari Spire, Light of Eärendil, or The One Ring.'
    },
    fellbeast: {
      name: 'Fell Beast',
      hp: 240,
      speed: 70,
      physArmor: 0.15,
      magicResist: 0.20,
      bounty: 28,
      livesCost: 2,
      flying: true,
      isBoss: false,
      trait: 'Flying terror bypassing ground paths & blockers. Only Elven Watchtowers, Istari Spires & Eagles can strike it.'
    },
    ringwraith: {
      name: 'Ringwraith Boss',
      hp: 1800,
      speed: 50,
      physArmor: 0.40,
      magicResist: 0.40,
      bounty: 90,
      livesCost: 5,
      flying: false,
      isBoss: true,
      trait: 'Summoned immediately when Ring Corruption reaches 100%! Black Breath stuns nearby towers for 4s.'
    },
    balrog: {
      name: 'Witch-lord / Balrog of Udûn',
      hp: 4600,
      speed: 34,
      physArmor: 0.45,
      magicResist: 0.35,
      bounty: 250,
      livesCost: 20,
      flying: false,
      isBoss: true,
      trait: 'Wave 15 Two-Phase Boss! Periodically locks a tower in dark chains—click cursed tower 3x rapidly to shatter!'
    }
  };

  const SPELL_CIRCUMFERENCE = 2 * Math.PI * 28;
  const MINIMAP_SIZE = 180;
  const MINIMAP_MARGIN = 13;

  function formatCompact(n) {
    const val = Math.round(n || 0);
    if (val >= 100000) return (val / 1000).toFixed(0) + 'k';
    if (val >= 10000) return (val / 1000).toFixed(1) + 'k';
    return String(val);
  }

  function formatGoldComma(n) {
    const val = Math.max(0, Math.floor(n || 0));
    return String(val).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function capitalize(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ==========================================================================
   * 4. MASTER-LEVEL PAINTERLY FANTASY ILLUSTRATOR (128x128 / 160x160 HiDPI)
   *    Oil-painted Abilities, Embossed Grimoire Tome & Rich Fallbacks.
   * ========================================================================== */

  const CardPainter = {
    _frameVignette(ctx, w, h, rimColor) {
      const vg = ctx.createRadialGradient(w * 0.5, h * 0.45, w * 0.25, w * 0.5, h * 0.5, w * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(3,5,9,0.64)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = rimColor || 'rgba(245,216,135,0.34)';
      ctx.lineWidth = Math.max(1, w * 0.01);
      ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    },

    /**
     * Master-level 128x128 painterly Ability Illustrations:
     * - 'light': Elven Silver Crystal Phial of Galadriel held aloft radiating volumetric starbeams & 8-point Silmaril flare
     * - 'eagles': Fierce Golden Eagle head & layered spread flight feathers diving through sunlit storm clouds
     * - 'ring': Thick 3D-shaded specular Gold Band of The One Ring over Mount Doom embers with glowing Elvish Tengwar script
     */
    paintAbilityCard(canvas, kind, isRingActive) {
      if (!canvas || !canvas.getContext) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.save();

      if (kind === 'light') {
        // 1. Deep Night-Blue Cosmic Sky & Nebula Mist
        const sky = ctx.createLinearGradient(0, 0, w * 0.3, h);
        sky.addColorStop(0, '#040b18');
        sky.addColorStop(0.42, '#0c2342');
        sky.addColorStop(0.76, '#14385c');
        sky.addColorStop(1, '#050b14');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        // Soft swirling starlight nebula clouds
        const neb1 = ctx.createRadialGradient(w * 0.52, h * 0.36, 2, w * 0.5, h * 0.4, w * 0.62);
        neb1.addColorStop(0, 'rgba(215,250,255,0.85)');
        neb1.addColorStop(0.28, 'rgba(92,216,255,0.48)');
        neb1.addColorStop(0.62, 'rgba(26,98,168,0.22)');
        neb1.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = neb1;
        ctx.fillRect(0, 0, w, h);

        // Distant starfield
        for (let i = 0; i < 32; i++) {
          const sx = ((i * 47 + 13) % 97) / 97 * w;
          const sy = ((i * 71 + 29) % 89) / 89 * h * 0.85;
          const sr = (i % 3 === 0) ? 1.3 : 0.75;
          ctx.fillStyle = i % 4 === 0 ? 'rgba(255,244,195,0.82)' : 'rgba(195,240,255,0.68)';
          ctx.beginPath();
          ctx.arc(sx, sy, sr, 0, Math.PI * 2);
          ctx.fill();
        }

        // 2. Volumetric God-Rays & Celestial Starbeams radiating from Phial Core
        const cx = w * 0.50;
        const cy = h * 0.40;
        ctx.save();
        ctx.translate(cx, cy);
        for (let r = 0; r < 14; r++) {
          const ang = (r / 14) * Math.PI * 2 + 0.18;
          const spread = (r % 2 === 0) ? 0.085 : 0.045;
          const len = (r % 2 === 0) ? w * 0.78 : w * 0.54;
          const rayGrad = ctx.createLinearGradient(0, 0, Math.cos(ang) * len, Math.sin(ang) * len);
          rayGrad.addColorStop(0, 'rgba(255,255,255,0.46)');
          rayGrad.addColorStop(0.35, 'rgba(130,232,255,0.22)');
          rayGrad.addColorStop(1, 'rgba(64,180,255,0)');
          ctx.fillStyle = rayGrad;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(ang - spread) * len, Math.sin(ang - spread) * len);
          ctx.lineTo(Math.cos(ang + spread) * len, Math.sin(ang + spread) * len);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        // 3. Cloaked Elven Hand & Silver Vambrace Holding the Phial Aloft
        const cuffGrad = ctx.createLinearGradient(w * 0.34, h * 0.78, w * 0.66, h);
        cuffGrad.addColorStop(0, '#8ba8c4');
        cuffGrad.addColorStop(0.5, '#3b516b');
        cuffGrad.addColorStop(1, '#141e2b');
        ctx.fillStyle = cuffGrad;
        ctx.beginPath();
        ctx.moveTo(w * 0.30, h * 1.02);
        ctx.quadraticCurveTo(w * 0.37, h * 0.80, w * 0.44, h * 0.77);
        ctx.lineTo(w * 0.56, h * 0.77);
        ctx.quadraticCurveTo(w * 0.63, h * 0.80, w * 0.70, h * 1.02);
        ctx.closePath();
        ctx.fill();

        // Gold-trimmed Elven gauntlet fingers cradling pedestal
        ctx.strokeStyle = '#d9c48c';
        ctx.lineWidth = w * 0.016;
        ctx.beginPath();
        ctx.moveTo(w * 0.39, h * 0.84);
        ctx.quadraticCurveTo(w * 0.50, h * 0.79, w * 0.61, h * 0.84);
        ctx.stroke();

        // 4. Ornate Elven Silver & Crystal Phial of Galadriel
        // Silver pedestal foot
        const silver = ctx.createLinearGradient(w * 0.36, 0, w * 0.64, 0);
        silver.addColorStop(0, '#6c87a3');
        silver.addColorStop(0.45, '#ffffff');
        silver.addColorStop(0.75, '#a8c6df');
        silver.addColorStop(1, '#485e78');
        ctx.fillStyle = silver;
        ctx.beginPath();
        ctx.moveTo(w * 0.40, h * 0.78);
        ctx.lineTo(w * 0.60, h * 0.78);
        ctx.lineTo(w * 0.54, h * 0.70);
        ctx.lineTo(w * 0.46, h * 0.70);
        ctx.closePath();
        ctx.fill();

        // Twin Art-Nouveau Silver Filigree Swan Handles
        ctx.strokeStyle = '#d9f2ff';
        ctx.lineWidth = w * 0.018;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(w * 0.46, h * 0.34);
        ctx.bezierCurveTo(w * 0.28, h * 0.30, w * 0.28, h * 0.58, w * 0.42, h * 0.64);
        ctx.moveTo(w * 0.54, h * 0.34);
        ctx.bezierCurveTo(w * 0.72, h * 0.30, w * 0.72, h * 0.58, w * 0.58, h * 0.64);
        ctx.stroke();

        // Faceted Crystal Amphora Vessel Body filled with Liquid Starlight
        const phialGlow = ctx.createRadialGradient(cx, h * 0.50, w * 0.02, cx, h * 0.52, w * 0.19);
        phialGlow.addColorStop(0, '#ffffff');
        phialGlow.addColorStop(0.45, '#bdf6ff');
        phialGlow.addColorStop(0.82, '#3ec4ff');
        phialGlow.addColorStop(1, '#1b5f9c');
        ctx.fillStyle = phialGlow;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = w * 0.015;
        ctx.beginPath();
        ctx.moveTo(w * 0.46, h * 0.31);
        ctx.quadraticCurveTo(w * 0.46, h * 0.39, w * 0.38, h * 0.48);
        ctx.quadraticCurveTo(w * 0.36, h * 0.63, w * 0.47, h * 0.71);
        ctx.lineTo(w * 0.53, h * 0.71);
        ctx.quadraticCurveTo(w * 0.64, h * 0.63, w * 0.62, h * 0.48);
        ctx.quadraticCurveTo(w * 0.54, h * 0.39, w * 0.54, h * 0.31);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Crystal facet lines & stopper finial
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(w * 0.50, h * 0.31);
        ctx.lineTo(w * 0.50, h * 0.70);
        ctx.moveTo(w * 0.42, h * 0.50);
        ctx.lineTo(w * 0.58, h * 0.50);
        ctx.stroke();

        // Diamond stopper crown
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(cx, h * 0.17);
        ctx.lineTo(w * 0.545, h * 0.25);
        ctx.lineTo(cx, h * 0.31);
        ctx.lineTo(w * 0.455, h * 0.25);
        ctx.closePath();
        ctx.fill();

        // 5. Blazing 8-Pointed Star of Eärendil Flare Over Phial Heart
        ctx.save();
        ctx.translate(cx, h * 0.43);
        ctx.shadowColor = '#70e8ff';
        ctx.shadowBlur = w * 0.10;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        for (let k = 0; k < 16; k++) {
          const a = (k * Math.PI) / 8;
          const rad = (k % 4 === 0) ? w * 0.30 : ((k % 2 === 0) ? w * 0.15 : w * 0.032);
          const px = Math.cos(a) * rad;
          const py = Math.sin(a) * rad;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (kind === 'eagles') {
        // 1. Storm-Swept Mountain Sky + Sunbreak Glow
        const sky = ctx.createLinearGradient(0, 0, w * 0.4, h);
        sky.addColorStop(0, '#12271e');
        sky.addColorStop(0.38, '#284a32');
        sky.addColorStop(0.72, '#544320');
        sky.addColorStop(1, '#151914');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        // Golden sunbreak piercing top-right storm clouds
        const sun = ctx.createRadialGradient(w * 0.78, h * 0.18, 2, w * 0.70, h * 0.25, w * 0.75);
        sun.addColorStop(0, '#fffbe0');
        sun.addColorStop(0.28, 'rgba(255,216,112,0.72)');
        sun.addColorStop(0.65, 'rgba(132,175,92,0.24)');
        sun.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sun;
        ctx.fillRect(0, 0, w, h);

        // Distant Misty Mountain crags at bottom
        ctx.fillStyle = '#111a16';
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(0, h * 0.82);
        ctx.lineTo(w * 0.22, h * 0.69);
        ctx.lineTo(w * 0.42, h * 0.83);
        ctx.lineTo(w * 0.72, h * 0.67);
        ctx.lineTo(w * 0.90, h * 0.78);
        ctx.lineTo(w, h * 0.72);
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();

        // Diagonal golden wind/sun shafts
        ctx.strokeStyle = 'rgba(255,242,186,0.22)';
        ctx.lineWidth = w * 0.04;
        ctx.beginPath();
        ctx.moveTo(w * 0.92, h * 0.05);
        ctx.lineTo(w * 0.12, h * 0.88);
        ctx.moveTo(w * 0.68, h * 0.02);
        ctx.lineTo(w * 0.02, h * 0.66);
        ctx.stroke();

        // 2. Spread Layered Primary Flight Feathers (Left & Right Wings)
        const drawFeather = (x0, y0, x1, y1, widthPx, lit) => {
          const ang = Math.atan2(y1 - y0, x1 - x0);
          const len = Math.hypot(x1 - x0, y1 - y0);
          ctx.save();
          ctx.translate(x0, y0);
          ctx.rotate(ang);
          const fg = ctx.createLinearGradient(0, -widthPx * 0.5, len, widthPx * 0.5);
          fg.addColorStop(0, '#3a220c');
          fg.addColorStop(0.55, lit ? '#c98f32' : '#8a591c');
          fg.addColorStop(1, lit ? '#fff2bc' : '#dfb056');
          ctx.fillStyle = fg;
          ctx.strokeStyle = 'rgba(255,244,196,0.55)';
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.moveTo(0, -widthPx * 0.35);
          ctx.quadraticCurveTo(len * 0.65, -widthPx * 0.62, len, 0);
          ctx.quadraticCurveTo(len * 0.65, widthPx * 0.52, 0, widthPx * 0.35);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        };

        // Upper-left wing primary fan
        const leftTips = [
          [0.03, 0.12], [0.02, 0.24], [0.04, 0.36], [0.08, 0.48], [0.16, 0.58], [0.26, 0.66]
        ];
        for (let i = 0; i < leftTips.length; i++) {
          drawFeather(w * 0.44, h * 0.46, w * leftTips[i][0], h * leftTips[i][1], w * 0.068, i < 3);
        }

        // Upper-right sunlit wing primary fan
        const rightTips = [
          [0.97, 0.10], [0.98, 0.22], [0.96, 0.34], [0.92, 0.46], [0.84, 0.57], [0.74, 0.66]
        ];
        for (let i = 0; i < rightTips.length; i++) {
          drawFeather(w * 0.56, h * 0.46, w * rightTips[i][0], h * rightTips[i][1], w * 0.068, true);
        }

        // Tail fan feathers
        for (let t = -2; t <= 2; t++) {
          drawFeather(w * 0.50, h * 0.62, w * (0.50 + t * 0.085), h * 0.92, w * 0.055, false);
        }

        // 3. Muscular Golden-Bronze Eagle Torso & Mantle Coverts
        const bodyGrad = ctx.createRadialGradient(w * 0.52, h * 0.46, 3, w * 0.50, h * 0.54, w * 0.24);
        bodyGrad.addColorStop(0, '#f0c462');
        bodyGrad.addColorStop(0.55, '#8f5d20');
        bodyGrad.addColorStop(1, '#362009');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.ellipse(w * 0.50, h * 0.55, w * 0.17, h * 0.19, -0.08, 0, Math.PI * 2);
        ctx.fill();

        // 4. Fierce Detailed Golden Eagle Head & Hooked Raptor Beak (Center-Foreground!)
        const headGrad = ctx.createLinearGradient(w * 0.40, h * 0.26, w * 0.64, h * 0.52);
        headGrad.addColorStop(0, '#fff9de');
        headGrad.addColorStop(0.45, '#ebd07e');
        headGrad.addColorStop(1, '#8c5d1c');
        ctx.fillStyle = headGrad;
        ctx.strokeStyle = '#3d2508';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(w * 0.40, h * 0.48);
        ctx.quadraticCurveTo(w * 0.39, h * 0.28, w * 0.53, h * 0.27);
        ctx.quadraticCurveTo(w * 0.65, h * 0.28, w * 0.63, h * 0.43);
        ctx.quadraticCurveTo(w * 0.58, h * 0.53, w * 0.44, h * 0.52);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Curved Hooked Golden-Ivory Raptor Beak (pointing right-downward)
        const beakGrad = ctx.createLinearGradient(w * 0.56, h * 0.37, w * 0.72, h * 0.50);
        beakGrad.addColorStop(0, '#fff4b8');
        beakGrad.addColorStop(0.55, '#f0a818');
        beakGrad.addColorStop(1, '#261808');
        ctx.fillStyle = beakGrad;
        ctx.beginPath();
        ctx.moveTo(w * 0.57, h * 0.36);
        ctx.quadraticCurveTo(w * 0.71, h * 0.37, w * 0.70, h * 0.49);
        ctx.quadraticCurveTo(w * 0.64, h * 0.45, w * 0.56, h * 0.45);
        ctx.closePath();
        ctx.fill();

        // Fierce brow ridge & glowing amber raptor eye
        ctx.strokeStyle = '#321d06';
        ctx.lineWidth = w * 0.018;
        ctx.beginPath();
        ctx.moveTo(w * 0.48, h * 0.35);
        ctx.lineTo(w * 0.59, h * 0.37);
        ctx.stroke();

        ctx.fillStyle = '#ffb300';
        ctx.beginPath();
        ctx.arc(w * 0.54, h * 0.385, w * 0.024, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#120b03';
        ctx.beginPath();
        ctx.arc(w * 0.545, h * 0.385, w * 0.011, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(w * 0.538, h * 0.378, w * 0.006, 0, Math.PI * 2);
        ctx.fill();

        // Gleaming outstretched golden talons
        ctx.strokeStyle = '#ffe58f';
        ctx.lineWidth = w * 0.018;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(w * 0.43, h * 0.70);
        ctx.quadraticCurveTo(w * 0.38, h * 0.78, w * 0.42, h * 0.83);
        ctx.moveTo(w * 0.57, h * 0.70);
        ctx.quadraticCurveTo(w * 0.62, h * 0.78, w * 0.58, h * 0.83);
        ctx.stroke();
      } else {
        // THE ONE RING: 3D Specular Gold Torus Band over Volcanic Mount Doom Embers + Glowing Tengwar Script!
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, isRingActive ? '#3d1204' : '#1b0b06');
        bg.addColorStop(0.55, isRingActive ? '#7d2606' : '#3d1709');
        bg.addColorStop(1, '#120603');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        // Molten Mount Doom furnace core glow
        const magma = ctx.createRadialGradient(w * 0.50, h * 0.52, 4, w * 0.50, h * 0.52, w * 0.66);
        magma.addColorStop(0, isRingActive ? '#fff8d4' : 'rgba(255,214,120,0.78)');
        magma.addColorStop(0.36, isRingActive ? 'rgba(255,118,12,0.86)' : 'rgba(235,88,12,0.48)');
        magma.addColorStop(0.75, 'rgba(128,26,4,0.34)');
        magma.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = magma;
        ctx.fillRect(0, 0, w, h);

        // Jagged obsidian crags & glowing lava fissures at bottom
        ctx.fillStyle = '#140806';
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(0, h * 0.78);
        ctx.lineTo(w * 0.24, h * 0.71);
        ctx.lineTo(w * 0.48, h * 0.81);
        ctx.lineTo(w * 0.76, h * 0.69);
        ctx.lineTo(w, h * 0.79);
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = isRingActive ? '#ffcc40' : '#ff6d00';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(w * 0.14, h * 0.88);
        ctx.lineTo(w * 0.38, h * 0.79);
        ctx.lineTo(w * 0.62, h * 0.86);
        ctx.lineTo(w * 0.86, h * 0.77);
        ctx.stroke();

        // Rising volcanic ember sparks
        for (let e = 0; e < 22; e++) {
          const ex = ((e * 53 + 17) % 91) / 91 * w;
          const ey = ((e * 67 + 11) % 83) / 83 * h * 0.85;
          ctx.fillStyle = e % 2 === 0 ? 'rgba(255,224,130,0.85)' : 'rgba(255,109,0,0.72)';
          ctx.beginPath();
          ctx.arc(ex, ey, (e % 3 === 0) ? 1.5 : 0.9, 0, Math.PI * 2);
          ctx.fill();
        }

        // True 2-Pass 3D-Shaded Gold Ring Band in Perspective
        ctx.save();
        ctx.translate(w * 0.50, h * 0.43);
        ctx.rotate(-0.26);

        const rxOut = w * 0.325;
        const ryOut = h * 0.195;
        const rxIn = w * 0.228;
        const ryIn = h * 0.122;
        const bandDrop = h * 0.115;

        // Pass 1: Back Inner Wall of the Gold Band (top half of ring)
        const innerGrad = ctx.createLinearGradient(-rxIn, 0, rxIn, 0);
        innerGrad.addColorStop(0, '#462605');
        innerGrad.addColorStop(0.28, '#b8821e');
        innerGrad.addColorStop(0.55, '#ffe89c');
        innerGrad.addColorStop(0.82, '#9e6b14');
        innerGrad.addColorStop(1, '#3b1f04');
        ctx.fillStyle = innerGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, rxOut, ryOut, 0, Math.PI, Math.PI * 2);
        ctx.ellipse(0, bandDrop * 0.85, rxIn, ryIn, 0, 0, Math.PI, true);
        ctx.closePath();
        ctx.fill();

        // Faint fiery Tengwar glow along inner rear wall
        ctx.save();
        ctx.strokeStyle = isRingActive ? 'rgba(255,238,165,0.85)' : 'rgba(255,136,24,0.62)';
        ctx.shadowColor = '#ff6d00';
        ctx.shadowBlur = 5;
        ctx.lineWidth = 1.3;
        ctx.setLineDash([3.5, 2.2, 1.5, 2.5]);
        ctx.beginPath();
        ctx.ellipse(0, bandDrop * 0.36, rxIn * 0.98, ryIn * 0.92, 0, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        ctx.restore();

        // Pass 2: Thick Convex Front Outer Gold Band
        const outerGrad = ctx.createLinearGradient(-rxOut, -ryOut, rxOut, ryOut + bandDrop);
        outerGrad.addColorStop(0, '#fff9d6');
        outerGrad.addColorStop(0.18, '#f5cc64');
        outerGrad.addColorStop(0.38, '#9e6c16');
        outerGrad.addColorStop(0.52, '#4a2905');
        outerGrad.addColorStop(0.72, '#eab642');
        outerGrad.addColorStop(0.88, '#fff4be');
        outerGrad.addColorStop(1, '#8c580e');

        ctx.save();
        ctx.shadowColor = isRingActive ? 'rgba(255,120,0,0.85)' : 'rgba(0,0,0,0.88)';
        ctx.shadowBlur = isRingActive ? 14 : 9;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = outerGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, rxOut, ryOut, 0, -0.06, Math.PI + 0.06);
        ctx.ellipse(0, bandDrop, rxOut * 0.985, ryOut * 1.04, 0, Math.PI + 0.06, -0.06, true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Top annular rim bevel & specular gold catchlight
        const rimGrad = ctx.createLinearGradient(-rxOut, -ryOut, rxOut, ryOut);
        rimGrad.addColorStop(0, '#fffdf0');
        rimGrad.addColorStop(0.45, '#d4a038');
        rimGrad.addColorStop(0.75, '#6e490c');
        rimGrad.addColorStop(1, '#ffe699');
        ctx.strokeStyle = rimGrad;
        ctx.lineWidth = w * 0.028;
        ctx.beginPath();
        ctx.ellipse(0, 0, (rxOut + rxIn) * 0.5, (ryOut + ryIn) * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Specular hot-spot arc on front-left shoulder
        ctx.strokeStyle = 'rgba(255,253,235,0.86)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(0, bandDrop * 0.22, rxOut * 0.96, ryOut * 0.98, 0, Math.PI * 0.58, Math.PI * 0.92);
        ctx.stroke();

        // Glowing Fiery Orange-Gold Elvish Tengwar Script around the Front Band!
        ctx.save();
        ctx.strokeStyle = isRingActive ? '#fff7c2' : '#ffab38';
        ctx.shadowColor = '#ff5500';
        ctx.shadowBlur = isRingActive ? 9 : 6;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        for (let g = 0; g < 15; g++) {
          const t = 0.14 + (g / 14) * (Math.PI - 0.28);
          const gx = Math.cos(t) * rxOut * 0.92;
          const gy = Math.sin(t) * ryOut * 0.96 + bandDrop * 0.52;
          const slant = -0.24;
          const hStem = (g % 3 === 0) ? w * 0.046 : w * 0.028;
          ctx.beginPath();
          ctx.moveTo(gx, gy - hStem * 0.5);
          ctx.lineTo(gx + slant * hStem, gy + hStem * 0.5);
          ctx.arc(gx + w * 0.012, gy, w * 0.013, -0.8, 1.9);
          ctx.stroke();

          if (g % 2 === 1) {
            ctx.fillStyle = '#ffe596';
            ctx.beginPath();
            ctx.arc(gx + w * 0.008, gy - hStem * 0.62, 0.9, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();

        ctx.restore();
      }

      this._frameVignette(ctx, w, h, 'rgba(248,220,138,0.42)');
      ctx.restore();
    },

    /**
     * Master-level 160x160 3D-Angled Embossed Leather & Tarnished-Gold Grimoire Tome
     * matching the bottom-right medallion of the reference image.
     */
    paintGrimoireTome(canvas) {
      if (!canvas || !canvas.getContext) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.save();

      // 1. Warm Golden Candlelight Halo Behind Standing Grimoire
      const halo = ctx.createRadialGradient(w * 0.52, h * 0.45, 6, w * 0.50, h * 0.48, w * 0.50);
      halo.addColorStop(0, 'rgba(255,216,124,0.48)');
      halo.addColorStop(0.55, 'rgba(150,100,34,0.22)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      // Ground contact shadow
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.beginPath();
      ctx.ellipse(w * 0.50, h * 0.84, w * 0.31, h * 0.075, -0.14, 0, Math.PI * 2);
      ctx.fill();

      // 2. Back Leather Board Edge
      ctx.fillStyle = '#1b140f';
      ctx.strokeStyle = '#9c7732';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(w * 0.25, h * 0.21);
      ctx.lineTo(w * 0.63, h * 0.125);
      ctx.lineTo(w * 0.77, h * 0.175);
      ctx.lineTo(w * 0.77, h * 0.745);
      ctx.lineTo(w * 0.41, h * 0.845);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 3. Gilded Cream-Gold Page Block (Top Edge + Right Fore-Edge!)
      const topPages = ctx.createLinearGradient(w * 0.27, h * 0.14, w * 0.75, h * 0.24);
      topPages.addColorStop(0, '#cbb27c');
      topPages.addColorStop(0.5, '#fcf3d7');
      topPages.addColorStop(1, '#b89652');
      ctx.fillStyle = topPages;
      ctx.beginPath();
      ctx.moveTo(w * 0.28, h * 0.22);
      ctx.lineTo(w * 0.635, h * 0.14);
      ctx.lineTo(w * 0.755, h * 0.185);
      ctx.lineTo(w * 0.395, h * 0.27);
      ctx.closePath();
      ctx.fill();

      const rightPages = ctx.createLinearGradient(w * 0.71, h * 0.18, w * 0.77, h * 0.75);
      rightPages.addColorStop(0, '#f0e2b8');
      rightPages.addColorStop(0.5, '#d6b978');
      rightPages.addColorStop(1, '#8c6d34');
      ctx.fillStyle = rightPages;
      ctx.beginPath();
      ctx.moveTo(w * 0.725, h * 0.19);
      ctx.lineTo(w * 0.76, h * 0.18);
      ctx.lineTo(w * 0.76, h * 0.74);
      ctx.lineTo(w * 0.725, h * 0.755);
      ctx.closePath();
      ctx.fill();

      // Fine individual page striations
      ctx.strokeStyle = 'rgba(88,64,26,0.45)';
      ctx.lineWidth = 0.85;
      for (let p = 1; p <= 4; p++) {
        const f = p / 5;
        ctx.beginPath();
        ctx.moveTo(w * (0.28 + f * 0.11), h * (0.22 + f * 0.05));
        ctx.lineTo(w * (0.635 + f * 0.115), h * (0.14 + f * 0.045));
        ctx.stroke();
      }

      // 4. Heavy Rounded 5-Ribbed Brown-Leather Spine
      const spine = ctx.createLinearGradient(w * 0.22, 0, w * 0.40, 0);
      spine.addColorStop(0, '#16100c');
      spine.addColorStop(0.38, '#4a3525');
      spine.addColorStop(0.68, '#2d2016');
      spine.addColorStop(1, '#120c08');
      ctx.fillStyle = spine;
      ctx.beginPath();
      ctx.moveTo(w * 0.24, h * 0.22);
      ctx.quadraticCurveTo(w * 0.32, h * 0.205, w * 0.395, h * 0.27);
      ctx.lineTo(w * 0.395, h * 0.855);
      ctx.quadraticCurveTo(w * 0.31, h * 0.855, w * 0.24, h * 0.79);
      ctx.closePath();
      ctx.fill();

      // Raised brass & stitched leather spine hubs
      for (let sy = 0.31; sy <= 0.77; sy += 0.112) {
        ctx.strokeStyle = '#140d07';
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(w * 0.245, h * (sy + 0.008));
        ctx.quadraticCurveTo(w * 0.32, h * (sy - 0.004), w * 0.392, h * (sy + 0.038));
        ctx.stroke();

        ctx.strokeStyle = '#dfb55a';
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.moveTo(w * 0.245, h * sy);
        ctx.quadraticCurveTo(w * 0.32, h * (sy - 0.012), w * 0.392, h * (sy + 0.03));
        ctx.stroke();
      }

      // 5. Deep Pebble-Leather Front Board
      const cover = ctx.createLinearGradient(w * 0.38, h * 0.18, w * 0.75, h * 0.85);
      cover.addColorStop(0, '#523c2a');
      cover.addColorStop(0.45, '#312318');
      cover.addColorStop(1, '#17100b');
      ctx.fillStyle = cover;
      ctx.strokeStyle = '#d8ae52';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(w * 0.395, h * 0.27);
      ctx.lineTo(w * 0.73, h * 0.185);
      ctx.lineTo(w * 0.73, h * 0.76);
      ctx.lineTo(w * 0.395, h * 0.855);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Subtle pebble leather highlights
      for (let gx = 0; gx < 42; gx++) {
        const px = w * (0.42 + ((gx * 37) % 28) * 0.01);
        const py = h * (0.27 + ((gx * 53) % 50) * 0.01);
        ctx.fillStyle = gx % 2 === 0 ? 'rgba(255,232,185,0.06)' : 'rgba(0,0,0,0.18)';
        ctx.fillRect(px, py, 1.6, 1.6);
      }

      // Recessed blind-tooled gold-leaf inner border
      ctx.strokeStyle = 'rgba(245,212,122,0.68)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(w * 0.435, h * 0.31);
      ctx.lineTo(w * 0.692, h * 0.242);
      ctx.lineTo(w * 0.692, h * 0.722);
      ctx.lineTo(w * 0.435, h * 0.798);
      ctx.closePath();
      ctx.stroke();

      // 6. Cast-Gold Corner Bosses & Brass Fore-Edge Clasps
      const bossGrad = ctx.createLinearGradient(w * 0.40, h * 0.18, w * 0.74, h * 0.85);
      bossGrad.addColorStop(0, '#fff4c2');
      bossGrad.addColorStop(0.5, '#cfa042');
      bossGrad.addColorStop(1, '#755012');
      ctx.fillStyle = bossGrad;
      const drawBoss = (x0, y0, dx1, dy1, dx2, dy2) => {
        ctx.beginPath();
        ctx.moveTo(w * x0, h * y0);
        ctx.lineTo(w * (x0 + dx1), h * (y0 + dy1));
        ctx.lineTo(w * (x0 + dx2), h * (y0 + dy2));
        ctx.closePath();
        ctx.fill();
      };
      drawBoss(0.398, 0.272, 0.082, -0.021, 0, 0.088);
      drawBoss(0.727, 0.188, -0.082, 0.021, 0, 0.088);
      drawBoss(0.727, 0.757, -0.082, 0.022, 0, -0.088);
      drawBoss(0.398, 0.851, 0.082, -0.022, 0, -0.088);

      // Two brass clasps gripping right fore-edge
      for (const cy of [0.36, 0.62]) {
        ctx.fillStyle = '#e5be62';
        ctx.strokeStyle = '#3b2607';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w * 0.68, h * cy);
        ctx.lineTo(w * 0.762, h * (cy - 0.02));
        ctx.lineTo(w * 0.762, h * (cy + 0.032));
        ctx.lineTo(w * 0.68, h * (cy + 0.052));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // 7. Raised 3D Gondor White-Tree & Seven-Stars Gold Medallion Clasp on Cover
      ctx.save();
      ctx.translate(w * 0.568, h * 0.515);
      ctx.transform(1, -0.24, 0, 1, 0, 0);

      // Drop shadow under medallion
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.beginPath();
      ctx.arc(1.5, 2.5, w * 0.122, 0, Math.PI * 2);
      ctx.fill();

      const sealGrad = ctx.createRadialGradient(-w * 0.03, -w * 0.04, 1, 0, 0, w * 0.125);
      sealGrad.addColorStop(0, '#fffbe0');
      sealGrad.addColorStop(0.45, '#e2b653');
      sealGrad.addColorStop(0.85, '#8c6218');
      sealGrad.addColorStop(1, '#4a3108');
      ctx.fillStyle = sealGrad;
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.12, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#52360a';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.092, 0, Math.PI * 2);
      ctx.stroke();

      // Embossed White Tree of Gondor & Crown Star
      ctx.strokeStyle = '#fff9d9';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, w * 0.068);
      ctx.lineTo(0, -w * 0.038);
      ctx.moveTo(0, -w * 0.008);
      ctx.quadraticCurveTo(-w * 0.03, -w * 0.015, -w * 0.054, -w * 0.042);
      ctx.moveTo(0, -w * 0.008);
      ctx.quadraticCurveTo(w * 0.03, -w * 0.015, w * 0.054, -w * 0.042);
      ctx.moveTo(0, w * 0.022);
      ctx.quadraticCurveTo(-w * 0.028, w * 0.015, -w * 0.046, -w * 0.006);
      ctx.moveTo(0, w * 0.022);
      ctx.quadraticCurveTo(w * 0.028, w * 0.015, w * 0.046, -w * 0.006);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -w * 0.062, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.restore();
    },

    /**
     * Scenic 3D-like painterly fallback for Title Map Cards ONLY when WebGL is unavailable.
     */
    paintMapVistaFallback(canvas, mapId) {
      if (!canvas || !canvas.getContext) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.save();

      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.65);
      if (mapId === 'blackgate') {
        sky.addColorStop(0, '#180906');
        sky.addColorStop(0.55, '#4c180a');
        sky.addColorStop(1, '#8c3310');
      } else if (mapId === 'pelennor') {
        sky.addColorStop(0, '#2a333d');
        sky.addColorStop(0.55, '#6e5b3b');
        sky.addColorStop(1, '#cfa45e');
      } else {
        sky.addColorStop(0, '#0d1b2c');
        sky.addColorStop(0.55, '#1e3a56');
        sky.addColorStop(1, '#3b5d78');
      }
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // Sun / volcanic glow
      const glow = ctx.createRadialGradient(w * 0.7, h * 0.25, 4, w * 0.7, h * 0.28, w * 0.45);
      glow.addColorStop(0, mapId === 'blackgate' ? '#ffab40' : '#fff6cf');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // Mountain range
      ctx.fillStyle = mapId === 'blackgate' ? '#1c0e0b' : (mapId === 'pelennor' ? '#2d2a22' : '#162636');
      ctx.beginPath();
      ctx.moveTo(0, h * 0.62);
      ctx.lineTo(w * 0.18, h * 0.28);
      ctx.lineTo(w * 0.36, h * 0.48);
      ctx.lineTo(w * 0.58, h * 0.22);
      ctx.lineTo(w * 0.80, h * 0.44);
      ctx.lineTo(w, h * 0.26);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();

      // Ground valley & citadel silhouette
      const ground = ctx.createLinearGradient(0, h * 0.5, 0, h);
      ground.addColorStop(0, mapId === 'blackgate' ? '#2c1712' : (mapId === 'pelennor' ? '#49452c' : '#24382c'));
      ground.addColorStop(1, '#0d1014');
      ctx.fillStyle = ground;
      ctx.fillRect(0, h * 0.54, w, h * 0.46);

      // Citadel keep silhouette on right
      ctx.fillStyle = mapId === 'blackgate' ? '#140c0a' : '#4a525e';
      ctx.fillRect(w * 0.72, h * 0.30, w * 0.20, h * 0.36);
      ctx.fillRect(w * 0.78, h * 0.18, w * 0.08, h * 0.16);

      // Winding perspective siege road
      ctx.strokeStyle = mapId === 'blackgate' ? '#ff5722' : '#9c8e73';
      ctx.lineWidth = h * 0.075;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w * 0.06, h * 0.82);
      ctx.bezierCurveTo(w * 0.32, h * 0.56, w * 0.52, h * 0.90, w * 0.80, h * 0.62);
      ctx.stroke();

      this._frameVignette(ctx, w, h, 'rgba(235,208,122,0.34)');
      ctx.restore();
    },

    /**
     * Painterly Tower fallback (used ONLY before WebGL Scene3D Studio initializes).
     */
    paintTowerPortrait(canvas, typeKey, tier, branch) {
      if (!canvas || !canvas.getContext) return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.save();

      const pals = {
        elven: ['#133329', '#245944', '#091712', '#7ef4ff', '#f3d888'],
        garrison: ['#18293d', '#2b4766', '#0d131c', '#dce8f5', '#eab954'],
        dwarven: ['#2c1810', '#542a16', '#140a07', '#ff9800', '#dfb056'],
        istari: ['#122240', '#234578', '#090e1c', '#8be4ff', '#f3d888']
      };
      const pal = pals[typeKey] || pals.elven;

      const bg = ctx.createRadialGradient(w * 0.5, h * 0.42, w * 0.06, w * 0.5, h * 0.5, w * 0.72);
      bg.addColorStop(0, pal[1]);
      bg.addColorStop(0.6, pal[0]);
      bg.addColorStop(1, pal[2]);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Tower plinth & architectural silhouette
      const stone = ctx.createLinearGradient(w * 0.28, h * 0.2, w * 0.72, h * 0.9);
      stone.addColorStop(0, pal[4]);
      stone.addColorStop(0.5, '#7e8896');
      stone.addColorStop(1, '#232830');
      ctx.fillStyle = stone;
      ctx.beginPath();
      ctx.moveTo(w * 0.26, h * 0.90);
      ctx.lineTo(w * 0.35, h * 0.34);
      ctx.lineTo(w * 0.65, h * 0.34);
      ctx.lineTo(w * 0.74, h * 0.90);
      ctx.closePath();
      ctx.fill();

      // Spire crown / weapon accent
      ctx.fillStyle = (tier === 3 && branch === 'A') ? '#ffd54f' : pal[3];
      ctx.beginPath();
      ctx.moveTo(w * 0.50, h * 0.14);
      ctx.lineTo(w * 0.66, h * 0.36);
      ctx.lineTo(w * 0.34, h * 0.36);
      ctx.closePath();
      ctx.fill();

      this._frameVignette(ctx, w, h, 'rgba(240,210,122,0.36)');
      ctx.restore();
      return true;
    },

    /**
     * Painterly Enemy fallback (used ONLY before WebGL Scene3D Studio initializes).
     */
    paintEnemyFallback(canvas, eKey) {
      if (!canvas || !canvas.getContext) return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.save();

      const fiery = eKey === 'balrog' || eKey === 'ringwraith';
      const ghostly = eKey === 'wraith' || eKey === 'fellbeast';
      const bg = ctx.createRadialGradient(w * 0.5, h * 0.44, 4, w * 0.5, h * 0.5, w * 0.72);
      bg.addColorStop(0, fiery ? '#5c2212' : (ghostly ? '#1f3d3e' : '#3a2f2b'));
      bg.addColorStop(0.65, fiery ? '#290f0a' : (ghostly ? '#112228' : '#1e191a'));
      bg.addColorStop(1, '#09090c');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Armored / monstrous bust silhouette
      const sil = ctx.createLinearGradient(0, h * 0.18, 0, h * 0.92);
      sil.addColorStop(0, fiery ? '#ffb74d' : (ghostly ? '#8be8d8' : '#9aa5b4'));
      sil.addColorStop(0.55, fiery ? '#bf360c' : '#454e59');
      sil.addColorStop(1, '#14171c');
      ctx.fillStyle = sil;
      ctx.beginPath();
      ctx.moveTo(w * 0.20, h * 0.92);
      ctx.quadraticCurveTo(w * 0.24, h * 0.48, w * 0.50, h * 0.22);
      ctx.quadraticCurveTo(w * 0.76, h * 0.48, w * 0.80, h * 0.92);
      ctx.closePath();
      ctx.fill();

      // Glowing eyes
      ctx.fillStyle = fiery ? '#fff59d' : '#ff5722';
      ctx.beginPath();
      ctx.arc(w * 0.43, h * 0.40, w * 0.03, 0, Math.PI * 2);
      ctx.arc(w * 0.57, h * 0.40, w * 0.03, 0, Math.PI * 2);
      ctx.fill();

      this._frameVignette(ctx, w, h, 'rgba(240,210,122,0.34)');
      ctx.restore();
      return true;
    }
  };

  /* ==========================================================================
   * 5. TD.UI CONTROLLER — 3D STUDIO PORTRAITS, 3D MINIMAP & MIDDLE-EARTH HUD
   * ========================================================================== */

  class UI {
    constructor(game, rootEl) {
      SurfaceTextures.inject();

      this.game = game || null;
      this.root = rootEl || (typeof document !== 'undefined' ? document.getElementById('ui-layer') : null);

      this.selectedMapId = (game && game.mapId) || (TD.MAP_LIST && TD.MAP_LIST[0]) || 'hornburg';
      this.selectedDifficultyId = (game && game.difficultyId) || 'captain';

      this.codexOpen = false;
      this.activeCodexTab = 'towers';
      this.activeDockTab = 'build';

      this._hoveredBuildType = null;
      this._hoveredUpgradeTarget = null;

      // Throttle & dirty-checking caches so 60 FPS WebGL never stalls on DOM layout
      this._hudAccumDt = 0;
      this._dirty = {};
      this._lastInspectedPadId = null;
      this._lastInspectedTowerId = null;
      this._lastInspectedTier = 0;
      this._lastInspectedBranch = null;
      this._lastBossAnnouncedId = null;
      this._lastRingArtState = null;
      this._toastTimer = 0;

      // 3D Studio lazy/reactive completion flags
      this._allTitlePreviews3D = false;
      this._allBuildCards3D = false;
      this._allCodexPortraits3D = false;
      this._titleCardCanvases = [];
      this._codexPortraitJobs = [];

      // Cached offscreen 3D terrain layer for #hud-minimap
      this._minimapBgCanvas = null;
      this._minimapBgMapId = '';
      this._minimapBgIs3D = false;

      this._starTimers = [];
      this._earlyMarkers = [];
      this._els = {};

      if (this.root) {
        this._buildDOM();
      }
    }

    init(game) {
      SurfaceTextures.inject();
      if (game) this.game = game;
      if (!this.root && typeof document !== 'undefined') {
        this.root = document.getElementById('ui-layer');
        if (this.root) this._buildDOM();
      }
      if (this.game) {
        this.selectedMapId = this.game.mapId || this.selectedMapId;
        this.selectedDifficultyId = this.game.difficultyId || this.selectedDifficultyId;
      }
      this.refreshTitleScreen();
      this._upgradeBuildCardPortraitsTo3D();
      this._syncScreenVisibility(true);
      this.update(0, this.game);
      return this;
    }

    /* ========================================================================
     * 3D STUDIO PORTRAIT & PIXEL VERIFICATION HELPERS
     * ======================================================================== */

    _hasStudio3D() {
      const s3d = this.game && this.game.scene3d;
      return !!(s3d && s3d.isReady !== false && typeof s3d.renderModelPortrait === 'function');
    }

    _hasMapPreview3D() {
      const s3d = this.game && this.game.scene3d;
      return !!(s3d && s3d.isReady !== false && typeof s3d.renderMapPreview3D === 'function');
    }

    _hasMinimap3D() {
      const s3d = this.game && this.game.scene3d;
      return !!(s3d && s3d.isReady !== false && typeof s3d.renderMinimapTerrain3D === 'function');
    }

    _verifyCanvasRich(canvas, minUnique) {
      if (!canvas || !canvas.getContext) return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      const w = canvas.width;
      const h = canvas.height;
      if (w < 4 || h < 4) return false;
      try {
        const data = ctx.getImageData(0, 0, w, h).data;
        const seen = new Set();
        let nonTrans = 0;
        const stepX = Math.max(1, Math.floor(w / 12));
        const stepY = Math.max(1, Math.floor(h / 12));
        for (let y = 2; y < h - 2; y += stepY) {
          for (let x = 2; x < w - 2; x += stepX) {
            const idx = (y * w + x) * 4;
            if (data[idx + 3] > 20) {
              nonTrans++;
              const q = ((data[idx] >> 3) << 10) | ((data[idx + 1] >> 3) << 5) | (data[idx + 2] >> 3);
              seen.add(q);
            }
          }
        }
        return nonTrans >= 16 && seen.size >= (minUnique || 14);
      } catch (_err) {
        return false;
      }
    }

    _compositePortraitRim(canvas) {
      if (!canvas || !canvas.getContext) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.save();
      const vig = ctx.createRadialGradient(w * 0.5, h * 0.46, w * 0.34, w * 0.5, h * 0.5, w * 0.76);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(4,6,10,0.42)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(255, 236, 178, 0.24)';
      ctx.lineWidth = Math.max(1, w * 0.008);
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.restore();
    }

    _renderTowerPortrait(canvas, typeKey, tier, branch) {
      if (!canvas) return false;
      const t = Number(tier) || 1;
      const b = t >= 3 ? String(branch || 'A').toUpperCase() : null;
      const want3dKey = '3d:tower:' + typeKey + ':' + t + ':' + (b || '0');
      if (canvas.__renderedKey === want3dKey) return true;

      if (this._hasStudio3D()) {
        try {
          const ok = this.game.scene3d.renderModelPortrait(canvas, 'tower', typeKey, {
            tier: t,
            branch: b,
            fill: 0.88
          });
          if (ok && this._verifyCanvasRich(canvas, 14)) {
            this._compositePortraitRim(canvas);
            canvas.__renderedKey = want3dKey;
            return true;
          }
        } catch (_err) {
          // Fall back cleanly below until models3d is ready
        }
      }

      const fbKey = 'fb:tower:' + typeKey + ':' + t + ':' + (b || '0');
      if (canvas.__renderedKey !== fbKey) {
        CardPainter.paintTowerPortrait(canvas, typeKey, t, b);
        canvas.__renderedKey = fbKey;
      }
      return false;
    }

    _renderEnemyPortrait(canvas, eKey, phaseOverride) {
      if (!canvas) return false;
      const phase = phaseOverride !== undefined ? phaseOverride : (eKey === 'balrog' ? 2 : 1);
      const want3dKey = '3d:enemy:' + eKey + ':' + phase;
      if (canvas.__renderedKey === want3dKey) return true;

      if (this._hasStudio3D()) {
        try {
          const ok = this.game.scene3d.renderModelPortrait(canvas, 'enemy', eKey, {
            phase: phase,
            fill: 0.86
          });
          if (ok && this._verifyCanvasRich(canvas, 14)) {
            this._compositePortraitRim(canvas);
            canvas.__renderedKey = want3dKey;
            return true;
          }
        } catch (_err) {
          // Fall back below
        }
      }

      const fbKey = 'fb:enemy:' + eKey + ':' + phase;
      if (canvas.__renderedKey !== fbKey) {
        if (!this._drawLegacyEnemyPortrait(canvas, eKey)) {
          CardPainter.paintEnemyFallback(canvas, eKey);
        } else if (!this._verifyCanvasRich(canvas, 10)) {
          CardPainter.paintEnemyFallback(canvas, eKey);
        }
        canvas.__renderedKey = fbKey;
      }
      return false;
    }

    _upgradeTitleMapPreviewsTo3D() {
      if (!this._hasMapPreview3D() || !this._titleCardCanvases.length) return;
      let allOk = true;
      for (let i = 0; i < this._titleCardCanvases.length; i++) {
        const item = this._titleCardCanvases[i];
        if (!this._drawMapMiniPreview(item.canvas, item.mapId)) {
          allOk = false;
        }
      }
      this._allTitlePreviews3D = allOk;
    }

    _upgradeBuildCardPortraitsTo3D() {
      if (!this._hasStudio3D()) return;
      let allOk = true;
      for (let i = 0; i < TOWER_ORDER.length; i++) {
        const tk = TOWER_ORDER[i];
        const ref = this._buildCardRefs && this._buildCardRefs[tk];
        if (ref && ref.iconCanvas) {
          if (!this._renderTowerPortrait(ref.iconCanvas, tk, 1, null)) {
            allOk = false;
          }
        }
      }
      this._allBuildCards3D = allOk;
    }

    _upgradeCodexPortraitsTo3D() {
      if (!this._hasStudio3D() || !this._codexPortraitJobs.length) return;
      let allOk = true;
      for (let i = 0; i < this._codexPortraitJobs.length; i++) {
        const job = this._codexPortraitJobs[i];
        const ok = job.kind === 'tower'
          ? this._renderTowerPortrait(job.canvas, job.key, job.tier, job.branch)
          : this._renderEnemyPortrait(job.canvas, job.key, job.phase);
        if (!ok) allOk = false;
      }
      this._allCodexPortraits3D = allOk;
    }

    /* ========================================================================
     * DOM CONSTRUCTION (Executed once on boot — 100% DOM ID preservation)
     * ======================================================================== */

    _buildDOM() {
      if (!this.root || this._els.built) return;
      this.root.innerHTML = '';

      const stopCanvasLeak = (e) => {
        e.stopPropagation();
      };

      // 1. Cinematic Title Screen (over live 3D Stronghold diorama!)
      const titleScreen = document.createElement('section');
      titleScreen.id = 'title-screen';
      titleScreen.className = 'ui-interactive td-scroll';
      titleScreen.innerHTML =
        '<div class="title-inner">' +
          '<header class="title-banner">' +
            '<div class="title-crest-row">' +
              '<span class="title-rule"></span>' +
              ICONS.crest +
              '<span class="title-rule"></span>' +
            '</div>' +
            '<div class="title-kicker">Chronicles of the Third Age</div>' +
            '<h1 class="title-main">Shadows of the West</h1>' +
            '<p class="title-sub">Siege of Middle-earth</p>' +
          '</header>' +
          '<div>' +
            '<div class="title-section-label">Choose Stronghold</div>' +
            '<div class="map-cards-grid" id="title-map-grid"></div>' +
          '</div>' +
          '<div>' +
            '<div class="title-section-label">Siege Difficulty</div>' +
            '<div class="diff-cards-grid" id="title-diff-grid"></div>' +
          '</div>' +
          '<footer class="title-actions">' +
            '<button type="button" id="btn-begin-siege" class="td-btn td-btn-gold">Begin Siege</button>' +
            '<button type="button" id="btn-title-codex" class="td-btn td-btn-rune">' + ICONS.codex + '<span>Lore &amp; Bestiary Codex</span></button>' +
          '</footer>' +
        '</div>';
      titleScreen.addEventListener('pointerdown', stopCanvasLeak);
      this.root.appendChild(titleScreen);

      // 2. Top Edge Sculpted HUD Plaques
      const topHud = document.createElement('header');
      topHud.id = 'top-hud';
      topHud.className = 'is-hidden';
      topHud.innerHTML =
        // 2A. Top-Left Cast-Bronze Pause Medallion + Attached Dark-Iron Bar
        '<div class="hud-top-left" id="hud-top-left">' +
          '<button type="button" class="pause-medallion" id="btn-pause" title="Pause / Resume Siege [Space]">' +
            '<span id="btn-pause-icon">' + ICONS.pause + '</span>' +
            '<span id="btn-pause-label" class="sr-only">Pause</span>' +
          '</button>' +
          '<div class="top-left-pills">' +
            '<div class="speed-group" id="speed-controls" role="group" aria-label="Game Speed">' +
              '<button type="button" class="speed-btn is-active" data-speed="1" title="1x Normal Speed">1x</button>' +
              '<button type="button" class="speed-btn" data-speed="2" title="2x Battle Speed">2x</button>' +
              '<button type="button" class="speed-btn" data-speed="3" title="3x Fast Siege Speed">3x</button>' +
            '</div>' +
            '<button type="button" class="hud-ctrl-btn" id="btn-mute" title="Mute / Unmute Audio">' +
              ICONS.soundOn +
            '</button>' +
            '<button type="button" class="hud-ctrl-btn" id="btn-hud-restart" title="Restart Siege">' +
              ICONS.restart +
            '</button>' +
            '<button type="button" class="hud-ctrl-btn" id="btn-hud-menu" title="Return to Title Screen">' +
              ICONS.menu +
            '</button>' +
          '</div>' +
        '</div>' +

        // 2B. Top-Center Ornate Trapezoidal Wave Banner
        '<div class="hud-wave-plaque wave-plaque tabular" id="hud-wave-pill" title="Siege Wave Progress">' +
          ICONS.wavePlaqueBg +
          '<span id="hud-wave-text">WAVE 0/15</span>' +
          '<span id="hud-wave-sub">Ready</span>' +
        '</div>' +

        // 2C. Top-Right Sculpted Bronze-and-Stone Treasury & Citadel Plaque
        '<div class="hud-top-right tabular" id="hud-top-right">' +
          '<div class="res-item" id="hud-gold-pill" title="Gold Treasury">' +
            ICONS.gold +
            '<span id="hud-gold-val">260</span>' +
          '</div>' +
          '<span class="res-divider"></span>' +
          '<div class="res-item" id="hud-corruption-pill" title="The One Ring Corruption [R] — Click to Toggle Ring">' +
            '<span id="hud-corr-gem-icon">' + ICONS.corruptionGem + '</span>' +
            '<div class="corr-mini-wrap">' +
              '<span id="corruption-pct-top">0%</span>' +
              '<div class="corr-mini-bar"><div id="corruption-fill-top"></div></div>' +
            '</div>' +
          '</div>' +
          '<span class="res-divider"></span>' +
          '<div class="res-item" id="hud-lives-pill" title="Citadel Fortress Lives">' +
            ICONS.lives +
            '<span><span id="hud-lives-val">20</span><span class="hud-lives-max" id="hud-lives-max">/20</span></span>' +
          '</div>' +
        '</div>';
      topHud.addEventListener('pointerdown', stopCanvasLeak);
      this.root.appendChild(topHud);

      // Boss Health Bar Banner
      const bossBanner = document.createElement('div');
      bossBanner.id = 'boss-banner';
      bossBanner.className = 'is-hidden';
      bossBanner.innerHTML =
        '<div class="boss-banner-top">' +
          '<div class="boss-title-wrap">' +
            ICONS.bossSkull +
            '<span id="boss-name">The Witch-lord of Morgul</span>' +
          '</div>' +
          '<span id="boss-phase-badge">Phase 1</span>' +
        '</div>' +
        '<div class="boss-hp-track">' +
          '<div id="boss-hp-fill"></div>' +
          '<div id="boss-hp-text" class="tabular">4600 / 4600</div>' +
        '</div>';
      this.root.appendChild(bossBanner);

      // Pause Indicator Pill
      const pauseBanner = document.createElement('div');
      pauseBanner.id = 'pause-banner';
      pauseBanner.className = 'is-hidden';
      pauseBanner.innerHTML =
        '<span class="pause-banner-label">SIEGE PAUSED</span>' +
        '<button type="button" id="btn-resume-pill" class="td-btn td-btn-gold" style="padding:4px 10px;font-size:10.5px;">Resume [Space]</button>';
      pauseBanner.addEventListener('pointerdown', stopCanvasLeak);
      this.root.appendChild(pauseBanner);

      // Herald Toast Banner
      const heraldToast = document.createElement('div');
      heraldToast.id = 'herald-toast';
      heraldToast.className = 'is-hidden';
      this.root.appendChild(heraldToast);

      // 3. 3D Screen-Projected Early Wave Call Floating Markers Layer
      const earlyLayer = document.createElement('div');
      earlyLayer.id = 'early-wave-layer';
      this.root.appendChild(earlyLayer);

      // 4. Bottom-Left Cast-Bronze 3D Terrain Minimap Medallion
      const minimapMedallion = document.createElement('aside');
      minimapMedallion.id = 'minimap-medallion';
      minimapMedallion.className = 'is-hidden';
      minimapMedallion.innerHTML =
        ICONS.medallionRing +
        '<button type="button" class="bezel-stud bezel-stud-tl" id="btn-minimap-horn" title="Sound War Horn / Call Wave Early">' +
          ICONS.horn +
        '</button>' +
        '<div class="minimap-inner-well">' +
          '<canvas id="hud-minimap" width="' + MINIMAP_SIZE + '" height="' + MINIMAP_SIZE + '"></canvas>' +
        '</div>' +
        '<div class="bezel-stud bezel-stud-br tabular" id="minimap-tower-count" title="Active Defenses">' +
          '0' +
        '</div>';
      minimapMedallion.addEventListener('pointerdown', stopCanvasLeak);
      this.root.appendChild(minimapMedallion);

      // 5. Bottom-Center Sculpted Stone-and-Bronze Command Dock
      const commandDock = document.createElement('section');
      commandDock.id = 'command-dock';
      commandDock.className = 'is-hidden';
      commandDock.innerHTML =
        '<div id="dock-card-tooltip" class="is-hidden"></div>' +
        '<div class="dock-tabs-row" id="dock-tabs">' +
          ICONS.filigreeLeft +
          '<button type="button" class="dock-tab-btn tab-btn is-active" data-dock-tab="build" data-tab="build">Build</button>' +
          '<button type="button" class="dock-tab-btn tab-btn" data-dock-tab="stats" data-tab="stats">Tower</button>' +
          '<button type="button" class="dock-tab-btn tab-btn" data-dock-tab="upgrades" data-tab="upgrades">Upgrade</button>' +
          ICONS.filigreeRight +
        '</div>' +
        '<div class="dock-frame">' +
          fourCornersHtml() +
          // Left/Main Contextual Inspector & Build Tray
          '<div id="inspector-panel">' +
            // Mode A / Idle: 4 Large Square 3D Tower Portrait Cards + Sculpted Pad Socket
            '<div id="inspector-build-root" class="dock-build-wrap">' +
              '<div id="inspector-build-view" class="build-list"></div>' +
              '<div class="build-pad-status" id="build-pad-status">' +
                '<div class="pad-socket-well">' +
                  '<div class="pad-status-top">' +
                    '<span class="pad-status-kicker" id="build-pad-kicker">14 Open</span>' +
                  '</div>' +
                  '<div class="pad-socket-emblem" aria-hidden="true">' + ICONS.padSocketTurret + '</div>' +
                  '<div id="build-pad-title">Open Pad</div>' +
                  '<p id="build-pad-hint">Click any glowing pad or card to build.</p>' +
                '</div>' +
                '<button type="button" class="btn-quick-pad" id="btn-quick-select-pad" title="Select Nearest Open Foundation Pad">Next Pad</button>' +
                '<button type="button" class="pad-socket-action is-hidden" id="btn-close-build-pad" title="Deselect Pad [ESC]">Clear &times;</button>' +
              '</div>' +
            '</div>' +

            // Mode B: Built Tower Selected AAA War-Council Strip
            '<div id="inspector-tower-view" class="dock-tower-wrap is-hidden">' +
              // Col 1: Large 78x78 3D Studio Portrait + Title + Status + Curse Shatter
              '<div class="tower-id-col" id="inspector-id-col">' +
                '<div class="inspector-portrait-wrap" id="inspector-portrait-wrap">' +
                  '<canvas id="inspector-portrait" width="160" height="160"></canvas>' +
                '</div>' +
                '<div class="tower-id-meta">' +
                  '<div class="tower-id-top">' +
                    '<div class="inspector-title-group">' +
                      '<h3 class="inspector-title" id="inspector-title">Elven Watchtower</h3>' +
                      '<p class="inspector-subtitle" id="inspector-subtitle">Tier 1</p>' +
                    '</div>' +
                    '<button type="button" class="btn-close-x" id="btn-close-inspector" title="Close [ESC]">&times;</button>' +
                  '</div>' +
                  '<button type="button" id="btn-curse-shatter" class="curse-alert-btn is-hidden">Shatter Curse (3x)!</button>' +
                  '<div class="tower-status-strip" id="inspector-status-strip"></div>' +
                '</div>' +
              '</div>' +

              // Col 2: Engraved Chiseled Stats + Priority/Rally + Gilded Crimson Sell
              '<div class="tower-stats-col">' +
                '<div class="stats-grid tabular">' +
                  '<div class="stat-cell">' +
                    '<span class="stat-cell-label">DMG</span>' +
                    '<span class="stat-cell-val"><span id="stat-damage">20</span><span class="td-badge" id="stat-dmg-badge">Phys</span></span>' +
                  '</div>' +
                  '<div class="stat-cell">' +
                    '<span class="stat-cell-label">SPD</span>' +
                    '<span class="stat-cell-val" id="stat-rate">1.35/s</span>' +
                  '</div>' +
                  '<div class="stat-cell">' +
                    '<span class="stat-cell-label">RNG</span>' +
                    '<span class="stat-cell-val" id="stat-range">185</span>' +
                  '</div>' +
                  '<div class="stat-cell">' +
                    '<span class="stat-cell-label">DPS</span>' +
                    '<span class="stat-cell-val" id="stat-dps" style="color:#ffd54f;">27.0</span>' +
                  '</div>' +
                  '<div class="stat-cell stat-cell-extra">' +
                    '<span class="stat-cell-label">Kills</span>' +
                    '<span class="stat-cell-val" id="stat-kills">0</span>' +
                  '</div>' +
                  '<div class="stat-cell stat-cell-extra">' +
                    '<span class="stat-cell-label">Total</span>' +
                    '<span class="stat-cell-val" id="stat-total-dmg">0</span>' +
                  '</div>' +
                '</div>' +
                '<div class="tactical-sell-row" id="inspector-footer">' +
                  '<button type="button" id="btn-target-priority" class="td-btn tactical-btn" title="Cycle Target Priority">' +
                    '<span>Prio:</span>' +
                    '<strong id="target-priority-val" style="color:#f0d27a;">First</strong>' +
                  '</button>' +
                  '<button type="button" id="btn-rally-point" class="td-btn td-btn-forest tactical-btn is-hidden" title="Place Garrison Rally Point">' +
                    '<span>Rally</span>' +
                    '<strong id="rally-guards-val">3/3</strong>' +
                  '</button>' +
                  '<button type="button" id="btn-sell-tower" class="td-btn td-btn-crimson tabular" title="Dismantle for 75% Gold Refund">Sell (+67g)</button>' +
                '</div>' +
              '</div>' +

              // Col 3: Tier-2 3D Portrait Upgrade / Dual Tier-3 Branch 3D Cards / Mastery Skill Plaque
              '<div class="tower-upg-col">' +
                '<span class="sr-only" id="inspector-upg-heading">Upgrades</span>' +
                '<div id="upgrade-t1-wrap">' +
                  '<div class="upgrade-card" id="btn-upgrade-t2" role="button" tabindex="0">' +
                    '<div class="upg-t2-canvas-wrap"><canvas id="upg-t2-icon" width="148" height="148"></canvas></div>' +
                    '<div class="upg-t2-info">' +
                      '<div>' +
                        '<div class="upgrade-card-kicker">Tier II Upgrade</div>' +
                        '<div class="upgrade-card-title" id="upg-t2-name">Tier 2</div>' +
                      '</div>' +
                      '<p class="upgrade-card-desc sr-only" id="upg-t2-desc"></p>' +
                      '<div class="upgrade-deltas" id="upg-t2-deltas"></div>' +
                      '<div class="build-cost-bar">' +
                        ICONS.gold +
                        '<span class="cost-pill tabular" id="upg-t2-cost">110g</span>' +
                      '</div>' +
                    '</div>' +
                  '</div>' +
                '</div>' +

                '<div id="upgrade-t2-wrap" class="upgrade-t2-row is-hidden">' +
                  '<div class="upgrade-card branch-card" id="btn-upgrade-branch-a" data-branch="A" role="button" tabindex="0">' +
                    '<div class="branch-art-wrap">' +
                      '<canvas id="branch-a-icon" width="160" height="148"></canvas>' +
                      '<span class="branch-tag-pill">Path A</span>' +
                      '<span class="branch-name-ribbon" id="upg-a-name">Branch A</span>' +
                    '</div>' +
                    '<div class="build-cost-bar">' +
                      ICONS.gold +
                      '<span class="cost-pill tabular" id="upg-a-cost">210g</span>' +
                    '</div>' +
                    '<span class="sr-only" id="upg-a-desc"></span>' +
                    '<span class="sr-only" id="upg-a-skill"></span>' +
                  '</div>' +
                  '<div class="upgrade-card branch-card" id="btn-upgrade-branch-b" data-branch="B" role="button" tabindex="0">' +
                    '<div class="branch-art-wrap">' +
                      '<canvas id="branch-b-icon" width="160" height="148"></canvas>' +
                      '<span class="branch-tag-pill">Path B</span>' +
                      '<span class="branch-name-ribbon" id="upg-b-name">Branch B</span>' +
                    '</div>' +
                    '<div class="build-cost-bar">' +
                      ICONS.gold +
                      '<span class="cost-pill tabular" id="upg-b-cost">200g</span>' +
                    '</div>' +
                    '<span class="sr-only" id="upg-b-desc"></span>' +
                    '<span class="sr-only" id="upg-b-skill"></span>' +
                  '</div>' +
                '</div>' +

                '<div id="tier3-skill-card" class="skill-card is-hidden">' +
                  '<div class="skill-card-top">' +
                    '<span class="skill-card-name" id="inspector-skill-name">Mastery Skill</span>' +
                    '<span class="td-badge td-badge-magic tabular" id="inspector-skill-cd-badge">Ready</span>' +
                  '</div>' +
                  '<p class="upgrade-card-desc" id="inspector-skill-desc"></p>' +
                  '<div class="skill-cd-track"><div id="inspector-skill-bar"></div></div>' +
                  '<button type="button" id="btn-trigger-skill" class="td-btn td-btn-rune">Activate Skill</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="dock-divider" aria-hidden="true">' + ICONS.dividerBaluster + '</div>' +

          // Right-Side 128x128 Painterly Square Ability Cards (Light of Eärendil [1], Great Eagles [2], The One Ring [R])
          '<div id="spellbook-hud">' +
            '<div class="spell-slot">' +
              '<button type="button" class="spell-btn" id="btn-spell-light" data-spell="light">' +
                '<span class="spell-hotkey">1</span>' +
                '<canvas class="ability-art-canvas" id="spell-light-canvas" width="128" height="128"></canvas>' +
                '<span class="ability-corner-val tabular" id="spell-light-corner">RDY</span>' +
                '<svg class="spell-cd-svg is-hidden" id="spell-light-svg" viewBox="0 0 76 76">' +
                  '<circle class="spell-cd-ring-bg" cx="38" cy="38" r="32"/>' +
                  '<circle class="spell-cd-arc" id="spell-light-arc" cx="38" cy="38" r="28" stroke-dasharray="' + SPELL_CIRCUMFERENCE.toFixed(2) + '" stroke-dashoffset="0"/>' +
                '</svg>' +
                '<span class="spell-cd-label tabular is-hidden" id="spell-light-cd"></span>' +
              '</button>' +
              '<span class="ability-caption">Eärendil</span>' +
              '<div class="spell-tooltip">' +
                '<div class="spell-tt-head">' +
                  '<span class="spell-tt-title">Light of Eärendil</span>' +
                  '<span class="spell-tt-cd">45s CD • [1]</span>' +
                '</div>' +
                '<p class="spell-tt-desc">Starlight burst (150px): stuns enemies for 2.5s, strips Shadow Wraith stealth, and heals Garrison guards to full HP.</p>' +
              '</div>' +
            '</div>' +

            '<div class="spell-slot">' +
              '<button type="button" class="spell-btn" id="btn-spell-eagles" data-spell="eagles">' +
                '<span class="spell-hotkey">2</span>' +
                '<canvas class="ability-art-canvas" id="spell-eagles-canvas" width="128" height="128"></canvas>' +
                '<span class="ability-corner-val tabular" id="spell-eagles-corner">RDY</span>' +
                '<svg class="spell-cd-svg is-hidden" id="spell-eagles-svg" viewBox="0 0 76 76">' +
                  '<circle class="spell-cd-ring-bg" cx="38" cy="38" r="32"/>' +
                  '<circle class="spell-cd-arc" id="spell-eagles-arc" cx="38" cy="38" r="28" stroke-dasharray="' + SPELL_CIRCUMFERENCE.toFixed(2) + '" stroke-dashoffset="0"/>' +
                '</svg>' +
                '<span class="spell-cd-label tabular is-hidden" id="spell-eagles-cd"></span>' +
              '</button>' +
              '<span class="ability-caption">Great Eagles</span>' +
              '<div class="spell-tooltip">' +
                '<div class="spell-tt-head">' +
                  '<span class="spell-tt-title">Great Eagles Strike</span>' +
                  '<span class="spell-tt-cd">70s CD • [2]</span>' +
                '</div>' +
                '<p class="spell-tt-desc">Summons the Great Eagles to sweep a wide lane corridor for 340 hybrid AoE damage against both ground and flying foes.</p>' +
              '</div>' +
            '</div>' +

            '<div class="spell-slot hud-ring-cluster" id="hud-ring-cluster">' +
              '<button type="button" class="ring-ability-btn" id="btn-ring">' +
                '<span class="ring-hotkey">R</span>' +
                '<canvas class="ability-art-canvas" id="spell-ring-canvas" width="128" height="128"></canvas>' +
                '<div class="ring-card-corr-wrap" id="corruption-box">' +
                  '<div style="display:flex;justify-content:space-between;font-size:8.4px;font-weight:800;color:#ffe494;text-shadow:0 1px 2px #000;margin-bottom:1px;" class="tabular">' +
                    '<span id="corruption-status-label">RING</span>' +
                    '<span id="corruption-pct">0%</span>' +
                  '</div>' +
                  '<div class="corruption-track"><div id="corruption-fill"></div></div>' +
                '</div>' +
              '</button>' +
              '<span class="ability-caption" id="ring-caption-label">The One Ring</span>' +
              '<div class="spell-tooltip">' +
                '<div class="spell-tt-head">' +
                  '<span class="spell-tt-title">The One Ring</span>' +
                  '<span class="spell-tt-cd">Toggle • [R]</span>' +
                '</div>' +
                '<p class="spell-tt-desc">+40% SPD • TRUE SIGHT • +25% GOLD. While worn, foes march +15% faster &amp; Corruption climbs (+8%/s). At 100%, summons a Ringwraith Boss!</p>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      commandDock.addEventListener('pointerdown', stopCanvasLeak);
      this.root.appendChild(commandDock);

      // Targeting Banner
      const targetingBanner = document.createElement('div');
      targetingBanner.id = 'targeting-banner';
      targetingBanner.className = 'is-hidden';
      targetingBanner.innerHTML =
        '<span id="targeting-banner-text">Click battlefield to cast — Right-Click or ESC to cancel</span>' +
        '<button type="button" id="btn-cancel-targeting" class="td-btn" style="padding:3px 10px;font-size:10.5px;">Cancel [ESC]</button>';
      targetingBanner.addEventListener('pointerdown', stopCanvasLeak);
      this.root.appendChild(targetingBanner);

      // 6. Bottom-Right Cast-Bronze Embossed Grimoire Tome Medallion
      const codexMedallion = document.createElement('aside');
      codexMedallion.id = 'codex-medallion';
      codexMedallion.className = 'is-hidden';
      codexMedallion.innerHTML =
        ICONS.medallionRing +
        '<div class="bezel-stud bezel-stud-tr" aria-hidden="true">' + ICONS.towerStud + '</div>' +
        '<button type="button" class="tome-medallion-btn" id="btn-codex" title="Open Lore &amp; Bestiary Codex (Auto-Pauses)">' +
          '<canvas id="hud-tome-canvas" width="160" height="160"></canvas>' +
          '<span class="tome-nameplate">Codex</span>' +
        '</button>' +
        '<div class="bezel-stud bezel-stud-bl" aria-hidden="true">' + ICONS.codex + '</div>';
      codexMedallion.addEventListener('pointerdown', stopCanvasLeak);
      this.root.appendChild(codexMedallion);

      // 7. Lore & Bestiary Codex Grimoire Modal
      const codexModal = document.createElement('div');
      codexModal.id = 'codex-modal';
      codexModal.className = 'modal-backdrop is-hidden';
      codexModal.hidden = true;
      codexModal.innerHTML =
        '<div class="codex-window" role="dialog" aria-modal="true" aria-labelledby="codex-heading">' +
          fourCornersHtml() +
          '<div class="codex-header">' +
            '<h2 class="codex-title" id="codex-heading">Lore &amp; Bestiary Codex of the West</h2>' +
            '<button type="button" class="btn-close-x" id="btn-close-codex" title="Close Codex [ESC]">&times;</button>' +
          '</div>' +
          '<div class="codex-tabs">' +
            '<button type="button" class="codex-tab-btn is-active" data-codex-tab="towers">Towers &amp; Upgrades</button>' +
            '<button type="button" class="codex-tab-btn" data-codex-tab="bestiary">Bestiary &amp; Resistances</button>' +
            '<button type="button" class="codex-tab-btn" data-codex-tab="mechanics">Mechanics &amp; The Ring</button>' +
          '</div>' +
          '<div class="codex-content td-scroll">' +
            '<div id="codex-tab-towers"></div>' +
            '<div id="codex-tab-bestiary" class="is-hidden"></div>' +
            '<div id="codex-tab-mechanics" class="is-hidden"></div>' +
          '</div>' +
          '<div class="codex-footer">' +
            '<button type="button" id="btn-codex-done" class="td-btn td-btn-gold">Return to Siege</button>' +
          '</div>' +
        '</div>';
      codexModal.addEventListener('pointerdown', stopCanvasLeak);
      this.root.appendChild(codexModal);

      // 8. Victory Modal
      const victoryModal = document.createElement('div');
      victoryModal.id = 'victory-modal';
      victoryModal.className = 'modal-backdrop is-hidden';
      victoryModal.innerHTML =
        '<div class="outcome-card">' +
          fourCornersHtml() +
          '<h2 class="outcome-title">Victory for the West</h2>' +
          '<p class="outcome-sub" id="victory-subtitle">The hosts of Shadow break before the walls!</p>' +
          '<div class="stars-row" id="victory-stars-row">' +
            ICONS.star + ICONS.star + ICONS.star +
          '</div>' +
          '<div class="outcome-stats-grid tabular">' +
            '<div class="outcome-stat-box"><div class="outcome-stat-label">Fortress Lives</div><div class="outcome-stat-val" id="vic-lives">20 / 20</div></div>' +
            '<div class="outcome-stat-box"><div class="outcome-stat-label">Foes Vanquished</div><div class="outcome-stat-val" id="vic-kills">0</div></div>' +
            '<div class="outcome-stat-box"><div class="outcome-stat-label">Gold Earned</div><div class="outcome-stat-val" id="vic-gold">0g</div></div>' +
          '</div>' +
          '<div class="outcome-actions">' +
            '<button type="button" id="btn-endless" class="td-btn td-btn-gold">Continue in Endless Mode</button>' +
            '<button type="button" id="btn-victory-replay" class="td-btn td-btn-rune">Play Again</button>' +
            '<button type="button" id="btn-victory-title" class="td-btn">Return to Title</button>' +
          '</div>' +
        '</div>';
      victoryModal.addEventListener('pointerdown', stopCanvasLeak);
      this.root.appendChild(victoryModal);

      // 9. Defeat Modal
      const defeatModal = document.createElement('div');
      defeatModal.id = 'defeat-modal';
      defeatModal.className = 'modal-backdrop is-hidden';
      defeatModal.innerHTML =
        '<div class="outcome-card is-defeat">' +
          fourCornersHtml() +
          '<h2 class="outcome-title">The Fortress Has Fallen</h2>' +
          '<p class="outcome-sub">The gates are breached and darkness sweeps across the realm.</p>' +
          '<div class="outcome-stats-grid tabular">' +
            '<div class="outcome-stat-box"><div class="outcome-stat-label">Wave Reached</div><div class="outcome-stat-val" id="def-wave">Wave 1</div></div>' +
            '<div class="outcome-stat-box"><div class="outcome-stat-label">Foes Vanquished</div><div class="outcome-stat-val" id="def-kills">0</div></div>' +
            '<div class="outcome-stat-box"><div class="outcome-stat-label">Difficulty</div><div class="outcome-stat-val" id="def-diff">Captain</div></div>' +
          '</div>' +
          '<div class="outcome-actions">' +
            '<button type="button" id="btn-defeat-restart" class="td-btn td-btn-gold">Instant Restart</button>' +
            '<button type="button" id="btn-defeat-title" class="td-btn">Choose Another Map</button>' +
          '</div>' +
        '</div>';
      defeatModal.addEventListener('pointerdown', stopCanvasLeak);
      this.root.appendChild(defeatModal);

      this._cacheElements();
      this._paintStaticArtwork();
      this._buildEmptyPadCards();
      this._bindUIEvents();
      this._els.built = true;
    }

    _cacheElements() {
      const byId = (id) => this.root.querySelector('#' + id);
      this._els = {
        titleScreen: byId('title-screen'),
        mapGrid: byId('title-map-grid'),
        diffGrid: byId('title-diff-grid'),
        btnBeginSiege: byId('btn-begin-siege'),
        btnTitleCodex: byId('btn-title-codex'),

        topHud: byId('top-hud'),
        livesPill: byId('hud-lives-pill'),
        livesVal: byId('hud-lives-val'),
        livesMax: byId('hud-lives-max'),
        goldVal: byId('hud-gold-val'),
        waveText: byId('hud-wave-text'),
        waveSub: byId('hud-wave-sub'),

        corrPillTop: byId('hud-corruption-pill'),
        corrGemIcon: byId('hud-corr-gem-icon'),
        corrPctTop: byId('corruption-pct-top'),
        corrFillTop: byId('corruption-fill-top'),

        btnPause: byId('btn-pause'),
        btnPauseIcon: byId('btn-pause-icon'),
        btnPauseLabel: byId('btn-pause-label'),
        speedControls: byId('speed-controls'),
        speedBtns: Array.from(this.root.querySelectorAll('.speed-btn')),
        btnMute: byId('btn-mute'),
        btnHudRestart: byId('btn-hud-restart'),
        btnHudMenu: byId('btn-hud-menu'),

        bossBanner: byId('boss-banner'),
        bossName: byId('boss-name'),
        bossPhaseBadge: byId('boss-phase-badge'),
        bossHpFill: byId('boss-hp-fill'),
        bossHpText: byId('boss-hp-text'),

        pauseBanner: byId('pause-banner'),
        btnResumePill: byId('btn-resume-pill'),
        heraldToast: byId('herald-toast'),
        earlyLayer: byId('early-wave-layer'),

        minimapMedallion: byId('minimap-medallion'),
        minimapCanvas: byId('hud-minimap'),
        btnMinimapHorn: byId('btn-minimap-horn'),
        minimapTowerCount: byId('minimap-tower-count'),

        commandDock: byId('command-dock'),
        dockCardTooltip: byId('dock-card-tooltip'),
        dockTabBtns: Array.from(this.root.querySelectorAll('.dock-tab-btn')),

        inspector: byId('inspector-panel'),
        inspectorBuildRoot: byId('inspector-build-root'),
        buildPadStatus: byId('build-pad-status'),
        buildPadKicker: byId('build-pad-kicker'),
        buildPadTitle: byId('build-pad-title'),
        buildPadHint: byId('build-pad-hint'),
        btnCloseBuildPad: byId('btn-close-build-pad'),
        btnQuickSelectPad: byId('btn-quick-select-pad'),
        inspectorBuildView: byId('inspector-build-view'),

        inspectorTowerView: byId('inspector-tower-view'),
        inspectorIdCol: byId('inspector-id-col'),
        inspectorPortraitWrap: byId('inspector-portrait-wrap'),
        inspectorPortrait: byId('inspector-portrait'),
        inspectorTitle: byId('inspector-title'),
        inspectorSubtitle: byId('inspector-subtitle'),
        btnCloseInspector: byId('btn-close-inspector'),
        inspectorFooter: byId('inspector-footer'),

        btnCurseShatter: byId('btn-curse-shatter'),
        statusStrip: byId('inspector-status-strip'),
        statDamage: byId('stat-damage'),
        statDmgBadge: byId('stat-dmg-badge'),
        statRate: byId('stat-rate'),
        statRange: byId('stat-range'),
        statDps: byId('stat-dps'),
        statKills: byId('stat-kills'),
        statTotalDmg: byId('stat-total-dmg'),

        btnTargetPriority: byId('btn-target-priority'),
        targetPriorityVal: byId('target-priority-val'),
        btnRallyPoint: byId('btn-rally-point'),
        rallyGuardsVal: byId('rally-guards-val'),

        upgHeading: byId('inspector-upg-heading'),
        upgradeT1Wrap: byId('upgrade-t1-wrap'),
        btnUpgradeT2: byId('btn-upgrade-t2'),
        upgT2Icon: byId('upg-t2-icon'),
        upgT2Name: byId('upg-t2-name'),
        upgT2Cost: byId('upg-t2-cost'),
        upgT2Desc: byId('upg-t2-desc'),
        upgT2Deltas: byId('upg-t2-deltas'),

        upgradeT2Wrap: byId('upgrade-t2-wrap'),
        btnUpgradeBranchA: byId('btn-upgrade-branch-a'),
        branchAIcon: byId('branch-a-icon'),
        upgAName: byId('upg-a-name'),
        upgACost: byId('upg-a-cost'),
        upgADesc: byId('upg-a-desc'),
        upgASkill: byId('upg-a-skill'),

        btnUpgradeBranchB: byId('btn-upgrade-branch-b'),
        branchBIcon: byId('branch-b-icon'),
        upgBName: byId('upg-b-name'),
        upgBCost: byId('upg-b-cost'),
        upgBDesc: byId('upg-b-desc'),
        upgBSkill: byId('upg-b-skill'),

        tier3SkillCard: byId('tier3-skill-card'),
        inspectorSkillName: byId('inspector-skill-name'),
        inspectorSkillCdBadge: byId('inspector-skill-cd-badge'),
        inspectorSkillDesc: byId('inspector-skill-desc'),
        inspectorSkillBar: byId('inspector-skill-bar'),
        btnTriggerSkill: byId('btn-trigger-skill'),

        btnSellTower: byId('btn-sell-tower'),

        spellbook: byId('spellbook-hud'),
        btnSpellLight: byId('btn-spell-light'),
        spellLightCanvas: byId('spell-light-canvas'),
        spellLightCorner: byId('spell-light-corner'),
        spellLightSvg: byId('spell-light-svg'),
        spellLightArc: byId('spell-light-arc'),
        spellLightCd: byId('spell-light-cd'),

        btnSpellEagles: byId('btn-spell-eagles'),
        spellEaglesCanvas: byId('spell-eagles-canvas'),
        spellEaglesCorner: byId('spell-eagles-corner'),
        spellEaglesSvg: byId('spell-eagles-svg'),
        spellEaglesArc: byId('spell-eagles-arc'),
        spellEaglesCd: byId('spell-eagles-cd'),

        ringCluster: byId('hud-ring-cluster'),
        btnRing: byId('btn-ring'),
        spellRingCanvas: byId('spell-ring-canvas'),
        ringCaptionLabel: byId('ring-caption-label'),
        corruptionBox: byId('corruption-box'),
        corruptionStatusLabel: byId('corruption-status-label'),
        corruptionPct: byId('corruption-pct'),
        corruptionFill: byId('corruption-fill'),

        targetingBanner: byId('targeting-banner'),
        targetingBannerText: byId('targeting-banner-text'),
        btnCancelTargeting: byId('btn-cancel-targeting'),

        codexMedallion: byId('codex-medallion'),
        btnCodex: byId('btn-codex'),
        tomeCanvas: byId('hud-tome-canvas'),

        codexModal: byId('codex-modal'),
        btnCloseCodex: byId('btn-close-codex'),
        btnCodexDone: byId('btn-codex-done'),
        codexTabBtns: Array.from(this.root.querySelectorAll('.codex-tab-btn')),
        codexTabTowers: byId('codex-tab-towers'),
        codexTabBestiary: byId('codex-tab-bestiary'),
        codexTabMechanics: byId('codex-tab-mechanics'),

        victoryModal: byId('victory-modal'),
        victorySubtitle: byId('victory-subtitle'),
        victoryStars: Array.from(this.root.querySelectorAll('#victory-stars-row .victory-star')),
        vicLives: byId('vic-lives'),
        vicKills: byId('vic-kills'),
        vicGold: byId('vic-gold'),
        btnEndless: byId('btn-endless'),
        btnVictoryReplay: byId('btn-victory-replay'),
        btnVictoryTitle: byId('btn-victory-title'),

        defeatModal: byId('defeat-modal'),
        defWave: byId('def-wave'),
        defKills: byId('def-kills'),
        defDiff: byId('def-diff'),
        btnDefeatRestart: byId('btn-defeat-restart'),
        btnDefeatTitle: byId('btn-defeat-title')
      };
      this._buildCardRefs = {};
    }

    _paintStaticArtwork() {
      const els = this._els;
      CardPainter.paintAbilityCard(els.spellLightCanvas, 'light', false);
      CardPainter.paintAbilityCard(els.spellEaglesCanvas, 'eagles', false);
      CardPainter.paintAbilityCard(els.spellRingCanvas, 'ring', false);
      this._lastRingArtState = false;
      CardPainter.paintGrimoireTome(els.tomeCanvas);
    }

    _buildEmptyPadCards() {
      const container = this._els.inspectorBuildView;
      if (!container) return;
      container.innerHTML = '';
      this._allBuildCards3D = false;

      let all3d = true;
      for (let i = 0; i < TOWER_ORDER.length; i++) {
        const typeKey = TOWER_ORDER[i];
        const info = this._getTowerBaseInfo(typeKey);
        const shortLabel = TOWER_SHORT_LABELS[typeKey] || info.name;

        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'build-card tower-card';
        card.setAttribute('data-tower-type', typeKey);
        card.setAttribute('data-tower', typeKey);
        card.innerHTML =
          '<div class="build-icon-wrap">' +
            '<canvas width="160" height="156" class="tower-icon-canvas"></canvas>' +
            '<span class="build-card-ribbon">' + escapeHtml(shortLabel) + '</span>' +
          '</div>' +
          '<div class="build-cost-bar">' +
            ICONS.gold +
            '<span class="cost-pill tabular">' + info.cost + '</span>' +
          '</div>' +
          '<span class="sr-only build-card-name">' + escapeHtml(info.name) + '</span>' +
          '<span class="sr-only build-card-role">' + escapeHtml(info.role) + '</span>';

        const iconCanvas = card.querySelector('canvas');
        const costEl = card.querySelector('.cost-pill');
        const nameEl = card.querySelector('.build-card-name');
        const roleEl = card.querySelector('.build-card-role');

        if (!this._renderTowerPortrait(iconCanvas, typeKey, 1, null)) {
          all3d = false;
        }

        card.addEventListener('mouseenter', () => {
          this._hoveredBuildType = typeKey;
          this._applyBuildHoverPreview(typeKey);
          this._showBuildCardTooltip(typeKey);
        });

        card.addEventListener('mouseleave', () => {
          if (this._hoveredBuildType === typeKey) {
            this._hoveredBuildType = null;
            if (this.game && typeof this.game.setPreviewRange === 'function') {
              this.game.setPreviewRange(null);
            }
          }
          this._hideDockTooltip();
        });

        card.addEventListener('click', () => {
          if (!this.game) return;

          if (!this.game.selectedPad) {
            const openPad = this._findNextOpenPad();
            if (openPad) {
              if (typeof this.game.selectPad === 'function') {
                this.game.selectPad(openPad);
              } else {
                this.game.selectedPad = openPad;
                this.refreshInspector();
              }
              this._applyBuildHoverPreview(typeKey);
              this.notify('Pad #' + ((openPad.id | 0) + 1) + ' selected — click ' + shortLabel + ' again to build!', 'gold', 2.2);
            } else {
              this.notify('All Foundation Pads are occupied!', 'danger', 2.0);
            }
            return;
          }

          const pad = this.game.selectedPad;
          const latest = this._getTowerBaseInfo(typeKey);
          if (this.game.gold < latest.cost) {
            this.notify('Need ' + latest.cost + 'g to construct ' + latest.name + '!', 'danger', 1.8);
            return;
          }

          this._hoveredBuildType = null;
          this._hideDockTooltip();
          let built = null;
          if (typeof this.game.buildTower === 'function') {
            built = this.game.buildTower(pad, typeKey);
          } else if (this.game.towers && typeof this.game.towers.buildTower === 'function') {
            built = this.game.towers.buildTower(pad, typeKey, this.game);
            if (built) {
              this.game.selectedTower = built;
              this.game.previewRange = null;
            }
          }
          if (built) {
            this.refreshInspector();
            this.update(0, this.game);
          }
        });

        container.appendChild(card);
        this._buildCardRefs[typeKey] = {
          card,
          iconCanvas,
          costEl,
          nameEl,
          roleEl
        };
      }
      this._allBuildCards3D = all3d;
    }

    _showBuildCardTooltip(typeKey) {
      const tt = this._els.dockCardTooltip;
      if (!tt) return;
      const info = this._getTowerBaseInfo(typeKey);
      tt.innerHTML =
        '<div class="dock-tt-head">' +
          '<span class="dock-tt-title">' + escapeHtml(info.name) + '</span>' +
          '<span class="dock-tt-cost tabular">' + info.cost + 'g</span>' +
        '</div>' +
        '<div class="dock-tt-badges tabular">' +
          '<span class="td-badge ' + (info.dmgType === 'magic' ? 'td-badge-magic' : 'td-badge-phys') + '">' +
            (info.dmgType === 'magic' ? 'Magic' : 'Physical') +
          '</span>' +
          '<span class="td-badge">DMG ' + info.damage + '</span>' +
          '<span class="td-badge">RNG ' + (info.minRange > 0 ? info.minRange + '–' : '') + info.range + '</span>' +
          (info.canTargetFlying ? '<span class="td-badge td-badge-air">Hits Air</span>' : '') +
        '</div>' +
        '<p class="dock-tt-desc">' + escapeHtml(info.role) + '</p>';
      tt.classList.remove('is-hidden');
    }

    _showUpgradeCardTooltip(tower, targetKey) {
      const tt = this._els.dockCardTooltip;
      if (!tt || !tower) return;
      const upg = this._getTowerUpgradePreview(tower, targetKey);
      if (!upg) return;
      tt.innerHTML =
        '<div class="dock-tt-head">' +
          '<span class="dock-tt-title">' + escapeHtml(upg.name) + '</span>' +
          '<span class="dock-tt-cost tabular">' + upg.cost + 'g</span>' +
        '</div>' +
        '<p class="dock-tt-desc">' + escapeHtml(upg.desc) + '</p>' +
        (upg.skillName
          ? '<div class="dock-tt-skill"><strong>' + escapeHtml(upg.skillName) + ' (' + upg.skillCd + 's):</strong> ' + escapeHtml(upg.skillDesc) + '</div>'
          : '');
      tt.classList.remove('is-hidden');
    }

    _showSkillTooltip(tower) {
      const tt = this._els.dockCardTooltip;
      if (!tt || !tower || (tower.tier || 1) < 3) return;
      const meta = TOWER_META_FALLBACK[tower.type] || TOWER_META_FALLBACK.elven;
      const brMeta = (tower.branch && meta[tower.branch]) ? meta[tower.branch] : meta.A;
      const skillName = tower.skillName || (tower.skill && tower.skill.name) || brMeta.skillName;
      const skillDesc = tower.skillDesc || (tower.skill && tower.skill.desc) || brMeta.skillDesc;
      const sk = this._getTowerSkillState(tower);
      tt.innerHTML =
        '<div class="dock-tt-head">' +
          '<span class="dock-tt-title">' + escapeHtml(skillName) + '</span>' +
          '<span class="dock-tt-cost tabular">' + sk.maxCd + 's CD</span>' +
        '</div>' +
        '<p class="dock-tt-desc">' + escapeHtml(skillDesc) + '</p>';
      tt.classList.remove('is-hidden');
    }

    _hideDockTooltip() {
      if (this._els.dockCardTooltip) {
        this._els.dockCardTooltip.classList.add('is-hidden');
      }
    }

    _findNextOpenPad() {
      const g = this.game;
      if (!g || !g.map || !Array.isArray(g.map.pads)) return null;
      const pads = g.map.pads;
      let best = null;
      let bestScore = Infinity;
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        const occ = (g.towers && typeof g.towers.getTowerOnPad === 'function')
          ? g.towers.getTowerOnPad(p.id)
          : null;
        if (occ) continue;
        const d = Math.hypot(p.x - 640, p.y - 380);
        if (d < bestScore) {
          bestScore = d;
          best = p;
        }
      }
      return best;
    }

    _bindUIEvents() {
      const els = this._els;

      // Title Screen actions
      els.btnBeginSiege.addEventListener('click', () => {
        if (!this.game) return;
        if (this.game.sound && this.game.sound.unlock) this.game.sound.unlock();
        if (this.game.sound && this.game.sound.playClick) this.game.sound.playClick();
        if (typeof this.game.startSiege === 'function') {
          this.game.startSiege(this.selectedMapId, this.selectedDifficultyId);
        } else if (typeof this.game.startGame === 'function') {
          this.game.startGame(this.selectedMapId, this.selectedDifficultyId);
        }
      });

      els.btnTitleCodex.addEventListener('click', () => {
        if (this.game && this.game.sound && this.game.sound.playClick) this.game.sound.playClick();
        this.openCodex('towers');
      });

      // Top HUD & Ring Controls
      const triggerRingToggle = () => {
        if (this.game && typeof this.game.toggleRing === 'function') {
          this.game.toggleRing();
        }
      };
      els.btnRing.addEventListener('click', triggerRingToggle);
      els.corrPillTop.addEventListener('click', triggerRingToggle);

      els.btnPause.addEventListener('click', () => {
        if (!this.game) return;
        if (this.game.sound && this.game.sound.playClick) this.game.sound.playClick();
        if (typeof this.game.togglePause === 'function') {
          this.game.togglePause();
        }
      });

      els.btnResumePill.addEventListener('click', () => {
        if (this.game && typeof this.game.resume === 'function') {
          if (this.game.sound && this.game.sound.playClick) this.game.sound.playClick();
          this.game.resume();
        }
      });

      for (let i = 0; i < els.speedBtns.length; i++) {
        const btn = els.speedBtns[i];
        btn.addEventListener('click', () => {
          const spd = Number(btn.getAttribute('data-speed')) || 1;
          if (this.game && typeof this.game.setSpeed === 'function') {
            this.game.setSpeed(spd);
          } else if (this.game) {
            this.game.speed = spd;
            this.update(0, this.game);
          }
        });
      }

      els.btnMute.addEventListener('click', () => {
        if (!this.game || !this.game.sound) return;
        this.game.sound.unlock && this.game.sound.unlock();
        if (typeof this.game.sound.toggleMute === 'function') {
          this.game.sound.toggleMute();
        } else if (typeof this.game.sound.setMuted === 'function') {
          this.game.sound.setMuted(!this.game.sound.muted);
        }
        this._dirty.muted = null;
        this.update(0, this.game);
      });

      els.btnCodex.addEventListener('click', () => {
        if (this.game && this.game.sound && this.game.sound.playClick) this.game.sound.playClick();
        this.openCodex(this.activeCodexTab || 'towers');
      });

      els.btnHudRestart.addEventListener('click', () => {
        if (!this.game) return;
        if (this.game.sound && this.game.sound.playClick) this.game.sound.playClick();
        this.closeCodex();
        if (typeof this.game.restartSiege === 'function') this.game.restartSiege();
      });

      els.btnHudMenu.addEventListener('click', () => {
        if (!this.game) return;
        if (this.game.sound && this.game.sound.playClick) this.game.sound.playClick();
        this.closeCodex();
        if (typeof this.game.returnToTitle === 'function') this.game.returnToTitle();
      });

      // Minimap interactive click & horn bezel button
      els.btnMinimapHorn.addEventListener('click', () => {
        if (this.game && typeof this.game.callWaveEarly === 'function') {
          const called = this.game.callWaveEarly();
          if (!called) {
            this.notify('Wave already in battle — hold the line!', 'gold', 1.6);
          }
        }
      });

      els.minimapCanvas.addEventListener('click', (e) => {
        if (!this.game || !this.game.map) return;
        const rect = els.minimapCanvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = (e.clientY - rect.top) / rect.height;
        const margin = MINIMAP_MARGIN / MINIMAP_SIZE;
        const span = 1 - margin * 2;
        const gx = Math.max(0, Math.min(1280, ((nx - margin) / span) * 1280));
        const gy = Math.max(0, Math.min(720, ((ny - margin) / span) * 720));

        if (this.game.scene3d && typeof this.game.scene3d.panToGamePos === 'function') {
          try {
            this.game.scene3d.panToGamePos(gx, gy);
          } catch (_err) {
            // Optional camera pan hook
          }
        }

        const tower = (this.game.towers && typeof this.game.towers.getTowerAt === 'function')
          ? this.game.towers.getTowerAt(gx, gy, 48)
          : null;
        if (tower && typeof this.game.selectTower === 'function') {
          this.game.selectTower(tower);
          return;
        }
        const pad = typeof this.game.findPadAt === 'function' ? this.game.findPadAt(gx, gy, 46) : null;
        if (pad && typeof this.game.selectPad === 'function') {
          this.game.selectPad(pad);
        }
      });

      // Command Dock Top Tabs (`Build` | `Tower` | `Upgrade`)
      for (let i = 0; i < els.dockTabBtns.length; i++) {
        const tBtn = els.dockTabBtns[i];
        tBtn.addEventListener('click', () => {
          const tabId = tBtn.getAttribute('data-dock-tab') || 'build';
          if (this.game && this.game.sound && this.game.sound.playClick) {
            this.game.sound.playClick();
          }
          this.switchDockTab(tabId);
        });
      }

      els.btnQuickSelectPad.addEventListener('click', () => {
        const openPad = this._findNextOpenPad();
        if (openPad && this.game) {
          if (typeof this.game.selectPad === 'function') this.game.selectPad(openPad);
          else {
            this.game.selectedPad = openPad;
            this.refreshInspector();
          }
        } else {
          this.notify('All Foundation Pads are occupied!', 'gold', 1.8);
        }
      });

      els.btnCloseBuildPad.addEventListener('click', () => {
        if (this.game && this.game.sound && this.game.sound.playClick) this.game.sound.playClick();
        this.closeInspector();
      });

      // Spells & Targeting
      els.btnSpellLight.addEventListener('click', () => {
        if (this.game && typeof this.game.selectSpell === 'function') {
          this.game.selectSpell('light');
        }
      });

      els.btnSpellEagles.addEventListener('click', () => {
        if (this.game && typeof this.game.selectSpell === 'function') {
          this.game.selectSpell('eagles');
        }
      });

      els.btnCancelTargeting.addEventListener('click', () => {
        if (this.game && typeof this.game.cancelTargeting === 'function') {
          this.game.cancelTargeting();
        }
      });

      // Inspector Controls
      els.btnCloseInspector.addEventListener('click', () => {
        if (this.game && this.game.sound && this.game.sound.playClick) this.game.sound.playClick();
        this.closeInspector();
      });

      els.btnCurseShatter.addEventListener('click', () => {
        const t = this.game && this.game.selectedTower;
        if (t && typeof t.clickCurseBreak === 'function') {
          t.clickCurseBreak(this.game);
          this.refreshInspector();
          this.update(0, this.game);
        }
      });

      els.btnTargetPriority.addEventListener('click', () => {
        const t = this.game && this.game.selectedTower;
        if (!t) return;
        if (typeof t.cyclePriority === 'function') {
          t.cyclePriority();
        } else {
          const order = ['first', 'last', 'strongest', 'weakest'];
          const idx = order.indexOf(t.priority || 'first');
          t.priority = order[(idx + 1) % order.length];
        }
        if (this.game.sound && this.game.sound.playClick) this.game.sound.playClick();
        this._dirty.towerPriority = null;
        this.update(0, this.game);
      });

      els.btnRallyPoint.addEventListener('click', () => {
        const t = this.game && this.game.selectedTower;
        if (t && this.game && typeof this.game.startRallyPlacement === 'function') {
          this.game.startRallyPlacement(t);
        }
      });

      // Upgrade Hover & Click Hooks (T2, Branch A, Branch B)
      const bindUpgradeCard = (el, targetKey) => {
        el.addEventListener('mouseenter', () => {
          this._hoveredUpgradeTarget = targetKey;
          this._applyUpgradeHoverPreview(targetKey);
          if (this.game && this.game.selectedTower) {
            this._showUpgradeCardTooltip(this.game.selectedTower, targetKey);
          }
        });
        el.addEventListener('mouseleave', () => {
          if (this._hoveredUpgradeTarget === targetKey) {
            this._hoveredUpgradeTarget = null;
            if (this.game && typeof this.game.setPreviewRange === 'function') {
              this.game.setPreviewRange(null);
            }
          }
          this._hideDockTooltip();
        });
        el.addEventListener('click', () => {
          const t = this.game && this.game.selectedTower;
          if (!t) return;
          const upg = this._getTowerUpgradePreview(t, targetKey);
          if (!upg || this.game.gold < upg.cost) return;

          let ok = false;
          if (targetKey === 'T2') {
            if (typeof t.upgradeTier2 === 'function') {
              ok = t.upgradeTier2(this.game) !== false;
            }
          } else {
            if (typeof t.upgradeBranch === 'function') {
              ok = t.upgradeBranch(targetKey, this.game) !== false;
            }
          }
          if (ok) {
            this._hoveredUpgradeTarget = null;
            this._hideDockTooltip();
            if (typeof this.game.setPreviewRange === 'function') {
              this.game.setPreviewRange(null);
            }
            this.refreshInspector();
            this.update(0, this.game);
          }
        });
      };

      bindUpgradeCard(els.btnUpgradeT2, 'T2');
      bindUpgradeCard(els.btnUpgradeBranchA, 'A');
      bindUpgradeCard(els.btnUpgradeBranchB, 'B');

      els.tier3SkillCard.addEventListener('mouseenter', () => {
        if (this.game && this.game.selectedTower) {
          this._showSkillTooltip(this.game.selectedTower);
        }
      });
      els.tier3SkillCard.addEventListener('mouseleave', () => {
        this._hideDockTooltip();
      });

      els.btnTriggerSkill.addEventListener('click', () => {
        const t = this.game && this.game.selectedTower;
        if (!t || typeof t.triggerSkill !== 'function') return;
        t.triggerSkill(this.game);
        this.update(0, this.game);
      });

      els.btnSellTower.addEventListener('click', () => {
        const t = this.game && this.game.selectedTower;
        if (!t || !this.game) return;
        this._hideDockTooltip();
        if (typeof this.game.sellTower === 'function') {
          this.game.sellTower(t);
        } else if (this.game.towers && typeof this.game.towers.sellTower === 'function') {
          this.game.towers.sellTower(t, this.game);
          this.game.clearSelection && this.game.clearSelection();
        }
        this.refreshInspector();
        this.update(0, this.game);
      });

      // Codex Modal Events
      els.btnCloseCodex.addEventListener('click', () => this.closeCodex());
      els.btnCodexDone.addEventListener('click', () => this.closeCodex());
      els.codexModal.addEventListener('click', (e) => {
        if (e.target === els.codexModal) this.closeCodex();
      });

      for (let i = 0; i < els.codexTabBtns.length; i++) {
        const tabBtn = els.codexTabBtns[i];
        tabBtn.addEventListener('click', () => {
          const tab = tabBtn.getAttribute('data-codex-tab') || 'towers';
          if (this.game && this.game.sound && this.game.sound.playClick) this.game.sound.playClick();
          this.switchCodexTab(tab);
        });
      }

      // Victory & Defeat Buttons
      els.btnEndless.addEventListener('click', () => {
        if (!this.game) return;
        if (this.game.sound && this.game.sound.playClick) this.game.sound.playClick();
        if (typeof this.game.startEndless === 'function') this.game.startEndless();
      });

      els.btnVictoryReplay.addEventListener('click', () => {
        if (!this.game) return;
        if (this.game.sound && this.game.sound.playClick) this.game.sound.playClick();
        if (typeof this.game.restartSiege === 'function') this.game.restartSiege();
      });

      els.btnVictoryTitle.addEventListener('click', () => {
        if (!this.game) return;
        if (this.game.sound && this.game.sound.playClick) this.game.sound.playClick();
        if (typeof this.game.returnToTitle === 'function') this.game.returnToTitle();
      });

      els.btnDefeatRestart.addEventListener('click', () => {
        if (!this.game) return;
        if (this.game.sound && this.game.sound.playClick) this.game.sound.playClick();
        if (typeof this.game.restartSiege === 'function') this.game.restartSiege();
      });

      els.btnDefeatTitle.addEventListener('click', () => {
        if (!this.game) return;
        if (this.game.sound && this.game.sound.playClick) this.game.sound.playClick();
        if (typeof this.game.returnToTitle === 'function') this.game.returnToTitle();
      });
    }

    switchDockTab(tabId) {
      this.activeDockTab = tabId;
      const g = this.game;
      if (g) {
        if (tabId === 'build') {
          if (g.selectedTower) {
            const openPad = this._findNextOpenPad();
            if (openPad && typeof g.selectPad === 'function') {
              g.selectPad(openPad);
            } else {
              this.closeInspector();
            }
          }
        } else if ((tabId === 'stats' || tabId === 'upgrades') && !g.selectedTower) {
          const list = (g.towers && Array.isArray(g.towers.towers)) ? g.towers.towers : [];
          if (list.length > 0) {
            let pick = list[0];
            if (tabId === 'upgrades') {
              for (let i = 0; i < list.length; i++) {
                if ((list[i].tier || 1) < 3) {
                  pick = list[i];
                  break;
                }
              }
            }
            if (typeof g.selectTower === 'function') g.selectTower(pick);
            else {
              g.selectedTower = pick;
              this.refreshInspector();
            }
          } else {
            this.notify('Construct a tower on any glowing pad first!', 'gold', 1.8);
            this.activeDockTab = 'build';
          }
        }
      }
      this._syncDockTabVisuals();
    }

    _syncDockTabVisuals() {
      const els = this._els;
      if (!els.dockTabBtns) return;
      for (let i = 0; i < els.dockTabBtns.length; i++) {
        const b = els.dockTabBtns[i];
        b.classList.toggle('is-active', b.getAttribute('data-dock-tab') === this.activeDockTab);
      }
      if (els.inspector) {
        els.inspector.classList.toggle('dock-focus-stats', this.activeDockTab === 'stats');
      }
    }

    /* ========================================================================
     * TITLE SCREEN POPULATION & REAL 3D STRONGHOLD PREVIEWS
     * ======================================================================== */

    refreshTitleScreen() {
      if (!this._els.built) return;
      this._renderMapCards();
      this._renderDifficultyCards();
    }

    _renderMapCards() {
      const grid = this._els.mapGrid;
      if (!grid) return;
      grid.innerHTML = '';
      this._titleCardCanvases = [];

      const mapIds = (Array.isArray(TD.MAP_LIST) && TD.MAP_LIST.length > 0)
        ? TD.MAP_LIST
        : ['hornburg', 'pelennor', 'blackgate'];

      let all3d = true;
      for (let i = 0; i < mapIds.length; i++) {
        const mapId = mapIds[i];
        const raw = (TD.MAPS && TD.MAPS[mapId]) || {};
        const fb = MAP_META_FALLBACK[mapId] || MAP_META_FALLBACK.hornburg;

        const name = raw.name || raw.title || fb.name;
        const desc = raw.description || raw.desc || raw.lore || fb.desc;
        const laneCount = Array.isArray(raw.paths) ? raw.paths.length : null;
        const lanesLabel = laneCount
          ? (laneCount === 1 ? '1 Winding Lane' : laneCount + (mapId === 'blackgate' ? ' Twin Lanes' : ' Converging Lanes'))
          : fb.lanesLabel;
        const padsCount = Array.isArray(raw.pads) ? raw.pads.length : fb.padsCount;
        const weatherType = raw.weatherType || raw.weather || fb.weatherType;
        const weatherLabel = weatherType === 'rain'
          ? 'Driving Rain'
          : (weatherType === 'embers' ? 'Mordor Embers' : 'Battle Ash');

        const card = document.createElement('div');
        card.className = 'map-card' + (this.selectedMapId === mapId ? ' is-selected' : '');
        card.setAttribute('data-map-id', mapId);
        card.setAttribute('data-map', mapId);
        card.innerHTML =
          fourCornersHtml() +
          '<div class="map-preview-wrap">' +
            '<canvas class="map-preview-canvas" width="440" height="248"></canvas>' +
            '<span class="map-selected-pill">Selected</span>' +
          '</div>' +
          '<div class="map-card-header">' +
            '<h3 class="map-card-title">' + escapeHtml(name) + '</h3>' +
          '</div>' +
          '<div class="map-card-badges">' +
            '<span class="td-badge">' + escapeHtml(lanesLabel) + '</span>' +
            '<span class="td-badge td-badge-phys">' + padsCount + ' Pads</span>' +
            '<span class="td-badge weather-' + escapeHtml(weatherType) + '">' + escapeHtml(weatherLabel) + '</span>' +
          '</div>' +
          '<p class="map-card-desc">' + escapeHtml(desc) + '</p>';

        const previewCanvas = card.querySelector('canvas');
        this._titleCardCanvases.push({ canvas: previewCanvas, mapId: mapId });
        if (!this._drawMapMiniPreview(previewCanvas, mapId)) {
          all3d = false;
        }

        card.addEventListener('click', () => {
          this.selectedMapId = mapId;
          if (this.game) {
            this.game.mapId = mapId;
            if (TD.MAPS && TD.MAPS[mapId]) {
              this.game.map = TD.MAPS[mapId];
            }
            try {
              if (typeof this.game.loadMap3D === 'function') {
                this.game.loadMap3D(mapId);
              } else if (typeof this.game.setTitlePreviewMap === 'function') {
                this.game.setTitlePreviewMap(mapId);
              } else if (this.game.scene3d && typeof this.game.scene3d.buildMap === 'function') {
                this.game.scene3d.buildMap(mapId, TD.MAPS && TD.MAPS[mapId]);
              }
            } catch (_err) {
              // Safe optional 3D preview hook
            }
          }
          if (this.game && this.game.sound && this.game.sound.playClick) {
            this.game.sound.playClick();
          }
          const all = grid.querySelectorAll('.map-card');
          for (let k = 0; k < all.length; k++) {
            all[k].classList.toggle('is-selected', all[k].getAttribute('data-map-id') === mapId);
          }
        });

        grid.appendChild(card);
      }
      this._allTitlePreviews3D = all3d;
    }

    _drawMapMiniPreview(canvas, mapId) {
      if (!canvas) return false;
      const want3dKey = '3d:map:' + mapId;
      if (canvas.__renderedKey === want3dKey) return true;

      // Primary: Real Three.js 3D Scenic Stronghold Snapshot!
      if (this._hasMapPreview3D()) {
        try {
          const ok = this.game.scene3d.renderMapPreview3D(canvas, mapId);
          if (ok && this._verifyCanvasRich(canvas, 18)) {
            canvas.__renderedKey = want3dKey;
            return true;
          }
        } catch (_err) {
          // Fall back below until env3d is ready
        }
      }

      const fbKey = 'fb:map:' + mapId;
      if (canvas.__renderedKey !== fbKey) {
        CardPainter.paintMapVistaFallback(canvas, mapId);
        canvas.__renderedKey = fbKey;
      }
      return false;
    }

    _renderDifficultyCards() {
      const grid = this._els.diffGrid;
      if (!grid) return;
      grid.innerHTML = '';

      const diffIds = TD.DIFFICULTY_LIST || ['ranger', 'captain', 'steward'];
      const flavorFallback = {
        ranger: 'Generous treasury and weakened Mordor vanguard.',
        captain: 'Balanced Middle-earth siege warfare as intended.',
        steward: 'Scarce gold against a relentless, iron-clad host.'
      };
      const shieldIcons = {
        ranger: ICONS.diffRanger,
        captain: ICONS.diffCaptain,
        steward: ICONS.diffSteward
      };

      for (let i = 0; i < diffIds.length; i++) {
        const diffId = diffIds[i];
        const d = (TD.DIFFICULTIES && TD.DIFFICULTIES[diffId]) || {
          id: diffId,
          name: capitalize(diffId),
          startGold: diffId === 'ranger' ? 320 : (diffId === 'steward' ? 220 : 260),
          hpMult: diffId === 'ranger' ? 0.85 : (diffId === 'steward' ? 1.25 : 1.0),
          speedMult: diffId === 'ranger' ? 0.95 : (diffId === 'steward' ? 1.08 : 1.0)
        };

        const hpPct = Math.round((d.hpMult || 1) * 100);
        const foeLabel = hpPct === 100 ? '100% Foe Str' : hpPct + '% Foe HP';
        const lore = d.desc || flavorFallback[diffId] || '';
        const shieldSvg = shieldIcons[diffId] || ICONS.diffCaptain;

        const card = document.createElement('div');
        card.className = 'diff-card diff-btn' + (this.selectedDifficultyId === diffId ? ' is-selected' : '');
        card.setAttribute('data-difficulty', diffId);
        card.setAttribute('data-diff', diffId);
        card.innerHTML =
          '<div class="diff-shield-wrap" aria-hidden="true">' + shieldSvg + '</div>' +
          '<div class="diff-body">' +
            '<div class="diff-card-top">' +
              '<span class="diff-card-name">' + escapeHtml(d.name || capitalize(diffId)) + '</span>' +
              '<div class="diff-card-stats tabular">' +
                '<span class="diff-stat-gold">' + d.startGold + 'g Gold</span>' +
                '<span>•</span>' +
                '<span class="diff-stat-foe">' + escapeHtml(foeLabel) + '</span>' +
              '</div>' +
            '</div>' +
            '<p class="diff-card-lore">' + escapeHtml(lore) + '</p>' +
          '</div>';

        card.addEventListener('click', () => {
          this.selectedDifficultyId = diffId;
          if (this.game) this.game.difficultyId = diffId;
          if (this.game && this.game.sound && this.game.sound.playClick) {
            this.game.sound.playClick();
          }
          const all = grid.querySelectorAll('.diff-card');
          for (let k = 0; k < all.length; k++) {
            all[k].classList.toggle('is-selected', all[k].getAttribute('data-difficulty') === diffId);
          }
        });

        grid.appendChild(card);
      }
    }

    /* ========================================================================
     * LIFECYCLE & STATE HOOKS (Called by engine.js + synced in update)
     * ======================================================================== */

    showTitle(game) {
      if (game) this.game = game;
      this.closeCodex();
      this.refreshTitleScreen();
      this._syncScreenVisibility(true);
    }

    onGameStart(game) {
      if (game) this.game = game;
      this.closeCodex();
      this._lastBossAnnouncedId = null;
      this._minimapBgMapId = '';
      this._minimapBgIs3D = false;
      this.activeDockTab = 'build';
      this._upgradeBuildCardPortraitsTo3D();
      this._syncScreenVisibility(true);
      this.refreshInspector();
      this.notify('Man the walls! Sound the War Horn when ready.', 'gold', 3.0);
    }

    onEndlessStart(game) {
      if (game) this.game = game;
      this._syncScreenVisibility(true);
      this.notify('Endless Siege Engaged — Hold Until the Last Light!', 'gold', 3.4);
    }

    onVictory(game) {
      if (game) this.game = game;
      this._populateVictoryModal();
      this._syncScreenVisibility(true);
    }

    onDefeat(game) {
      if (game) this.game = game;
      this._populateDefeatModal();
      this._syncScreenVisibility(true);
    }

    onStateChange(_state, game) {
      if (game) this.game = game;
      if (this.game && this.game.state === 'victory') {
        this._populateVictoryModal();
      } else if (this.game && this.game.state === 'defeat') {
        this._populateDefeatModal();
      }
      this._syncScreenVisibility(true);
    }

    onSelectionChange(game) {
      if (game) this.game = game;
      this.refreshInspector();
    }

    notify(message, tone = 'gold', duration = 2.6) {
      const toast = this._els.heraldToast;
      if (!toast || !message) return;
      toast.textContent = message;
      toast.classList.toggle('tone-danger', tone === 'danger');
      toast.classList.remove('is-hidden');
      this._toastTimer = duration;
    }

    /* ========================================================================
     * CONTEXTUAL BOTTOM COMMAND DOCK (IDLE / BUILD PAD / BUILT TOWER)
     * ======================================================================== */

    openBuildMenu(pad) {
      if (this.game) {
        this.game.selectedPad = pad;
        this.game.selectedTower = null;
      }
      this.refreshInspector();
    }

    openTowerInspector(tower) {
      if (this.game) {
        this.game.selectedTower = tower;
      }
      this.refreshInspector();
    }

    closeInspector() {
      this._hoveredBuildType = null;
      this._hoveredUpgradeTarget = null;
      this._hideDockTooltip();
      if (this.game) {
        if (typeof this.game.clearSelection === 'function') {
          this.game.clearSelection();
        } else {
          this.game.selectedPad = null;
          this.game.selectedTower = null;
          if (typeof this.game.setPreviewRange === 'function') {
            this.game.setPreviewRange(null);
          }
        }
      }
      this.refreshInspector();
    }

    isInspectorOpen() {
      return !!(this.game && (this.game.selectedPad || this.game.selectedTower));
    }

    refreshInspector() {
      if (!this._els.built || !this.game) return;
      const g = this.game;
      const els = this._els;

      if (g.state !== 'playing' && g.state !== 'paused') {
        this._hideDockTooltip();
        return;
      }

      if (!this._allBuildCards3D) {
        this._upgradeBuildCardPortraitsTo3D();
      }

      const tower = g.selectedTower && !g.selectedTower.sold ? g.selectedTower : null;
      const pad = !tower ? g.selectedPad : null;

      if (!tower) {
        // Build / Idle Dock View (4 Large 3D Tower Portrait Cards + Sculpted Pad Socket)
        this.activeDockTab = 'build';
        this._syncDockTabVisuals();
        els.inspectorBuildRoot.classList.remove('is-hidden');
        els.inspectorTowerView.classList.add('is-hidden');

        this._lastInspectedTowerId = null;
        this._lastInspectedPadId = pad ? pad.id : null;

        if (pad) {
          els.buildPadStatus.classList.add('has-pad');
          els.buildPadKicker.textContent = 'Pad #' + ((pad.id !== undefined ? pad.id : 0) + 1);
          els.buildPadTitle.textContent = 'Ready';
          els.buildPadHint.textContent = 'Click any portrait card to build on this pad.';
          els.btnCloseBuildPad.classList.remove('is-hidden');
          els.btnQuickSelectPad.classList.add('is-hidden');
        } else {
          const totalPads = (g.map && Array.isArray(g.map.pads)) ? g.map.pads.length : 14;
          const builtCount = (g.towers && Array.isArray(g.towers.towers)) ? g.towers.towers.length : 0;
          const openCount = Math.max(0, totalPads - builtCount);
          els.buildPadStatus.classList.remove('has-pad');
          els.buildPadKicker.textContent = openCount + '/' + totalPads + ' Open';
          els.buildPadTitle.textContent = 'Pads';
          els.buildPadHint.textContent = 'Click a glowing pad on the road or pick a card.';
          els.btnCloseBuildPad.classList.add('is-hidden');
          els.btnQuickSelectPad.classList.remove('is-hidden');
        }

        for (let i = 0; i < TOWER_ORDER.length; i++) {
          const typeKey = TOWER_ORDER[i];
          const ref = this._buildCardRefs[typeKey];
          if (!ref) continue;
          const info = this._getTowerBaseInfo(typeKey);
          ref.nameEl.textContent = info.name;
          ref.costEl.textContent = String(info.cost);
          ref.roleEl.textContent = info.role;
          ref.card.classList.toggle('is-unaffordable', g.gold < info.cost);
          ref.card.classList.toggle('is-idle-mode', !pad);
        }

        if (pad && this._hoveredBuildType) {
          this._applyBuildHoverPreview(this._hoveredBuildType);
        }
        return;
      }

      // Built Tower Selected View
      if (this.activeDockTab === 'build') {
        this.activeDockTab = 'upgrades';
      }
      this._syncDockTabVisuals();
      els.inspectorBuildRoot.classList.add('is-hidden');
      els.inspectorTowerView.classList.remove('is-hidden');

      const meta = TOWER_META_FALLBACK[tower.type] || TOWER_META_FALLBACK.elven;
      const tier = tower.tier || 1;
      const branch = tower.branch || null;

      let displayTitle = tower.name || meta.name;
      let tierSubtitle = 'Tier ' + tier + ' • ' + meta.name;
      if (tier === 2) {
        displayTitle = tower.name || meta.t2.name;
        tierSubtitle = 'Tier II • ' + meta.name;
      } else if (tier === 3 && branch && meta[branch]) {
        displayTitle = tower.name || meta[branch].name;
        tierSubtitle = 'Tier III • Path ' + branch;
      }

      els.inspectorTitle.textContent = displayTitle;
      els.inspectorSubtitle.textContent = tierSubtitle;

      // Render exact 3D Studio Portrait of the selected tower!
      this._renderTowerPortrait(els.inspectorPortrait, tower.type, tier, branch);

      // Target Priority vs Garrison Rally Point
      if (tower.type === 'garrison') {
        els.btnTargetPriority.classList.add('is-hidden');
        els.btnRallyPoint.classList.remove('is-hidden');
      } else {
        els.btnTargetPriority.classList.remove('is-hidden');
        els.btnRallyPoint.classList.add('is-hidden');
      }

      // Upgrades Section by Tier
      if (tier === 1) {
        els.upgHeading.textContent = 'Tier 2 Fortification';
        els.upgradeT1Wrap.classList.remove('is-hidden');
        els.upgradeT2Wrap.classList.add('is-hidden');
        els.tier3SkillCard.classList.add('is-hidden');

        const upg = this._getTowerUpgradePreview(tower, 'T2');
        els.upgT2Name.textContent = upg.name;
        els.upgT2Cost.textContent = upg.cost + 'g';
        els.upgT2Desc.textContent = upg.desc;
        els.btnUpgradeT2.classList.toggle('is-unaffordable', g.gold < upg.cost);

        this._renderTowerPortrait(els.upgT2Icon, tower.type, 2, null);

        const deltas = [];
        if (upg.damage && tower.damage && upg.damage > tower.damage) {
          deltas.push('<span class="delta-pill">DMG +' + Math.round(upg.damage - tower.damage) + '</span>');
        }
        if (upg.range && tower.range && upg.range > tower.range) {
          deltas.push('<span class="delta-pill">RNG +' + Math.round(upg.range - tower.range) + '</span>');
        }
        if (upg.fireRate && tower.fireRate && upg.fireRate > tower.fireRate + 0.01) {
          deltas.push('<span class="delta-pill">SPD +' + Math.round(((upg.fireRate / tower.fireRate) - 1) * 100) + '%</span>');
        }
        if (deltas.length === 0) {
          deltas.push('<span class="delta-pill">+Power</span>');
        }
        els.upgT2Deltas.innerHTML = deltas.join('');
      } else if (tier === 2) {
        els.upgHeading.textContent = 'Choose Tier 3 Specialization';
        els.upgradeT1Wrap.classList.add('is-hidden');
        els.upgradeT2Wrap.classList.remove('is-hidden');
        els.tier3SkillCard.classList.add('is-hidden');

        const upgA = this._getTowerUpgradePreview(tower, 'A');
        const upgB = this._getTowerUpgradePreview(tower, 'B');

        els.upgAName.textContent = upgA.name;
        els.upgACost.textContent = upgA.cost + 'g';
        els.upgADesc.textContent = upgA.desc;
        els.upgASkill.textContent = 'Skill (' + upgA.skillCd + 's): ' + upgA.skillName + ' — ' + upgA.skillDesc;
        els.btnUpgradeBranchA.classList.toggle('is-unaffordable', g.gold < upgA.cost);

        els.upgBName.textContent = upgB.name;
        els.upgBCost.textContent = upgB.cost + 'g';
        els.upgBDesc.textContent = upgB.desc;
        els.upgBSkill.textContent = 'Skill (' + upgB.skillCd + 's): ' + upgB.skillName + ' — ' + upgB.skillDesc;
        els.btnUpgradeBranchB.classList.toggle('is-unaffordable', g.gold < upgB.cost);

        this._renderTowerPortrait(els.branchAIcon, tower.type, 3, 'A');
        this._renderTowerPortrait(els.branchBIcon, tower.type, 3, 'B');
      } else {
        els.upgHeading.textContent = 'Mastery Skill';
        els.upgradeT1Wrap.classList.add('is-hidden');
        els.upgradeT2Wrap.classList.add('is-hidden');
        els.tier3SkillCard.classList.remove('is-hidden');

        const brMeta = (branch && meta[branch]) ? meta[branch] : meta.A;
        const skillName = tower.skillName || (tower.skill && tower.skill.name) || brMeta.skillName;
        const skillDesc = tower.skillDesc || (tower.skill && tower.skill.desc) || brMeta.skillDesc;
        els.inspectorSkillName.textContent = skillName;
        els.inspectorSkillDesc.textContent = skillDesc;
      }

      this._lastInspectedTowerId = tower.id;
      this._lastInspectedTier = tier;
      this._lastInspectedBranch = branch;

      this._updateInspectorLiveStats(tower, g);

      if (this._hoveredUpgradeTarget) {
        this._applyUpgradeHoverPreview(this._hoveredUpgradeTarget);
      }
    }

    _updateInspectorLiveStats(tower, g) {
      const els = this._els;
      const meta = TOWER_META_FALLBACK[tower.type] || TOWER_META_FALLBACK.elven;

      // Upgrade inspector portraits to 3D if scene3d warmed up mid-frame
      this._renderTowerPortrait(els.inspectorPortrait, tower.type, tower.tier || 1, tower.branch || null);
      if ((tower.tier || 1) === 1) {
        this._renderTowerPortrait(els.upgT2Icon, tower.type, 2, null);
      } else if (tower.tier === 2) {
        this._renderTowerPortrait(els.branchAIcon, tower.type, 3, 'A');
        this._renderTowerPortrait(els.branchBIcon, tower.type, 3, 'B');
      }

      const curseClicks = tower.curseClicksRemaining || 0;
      if (els.inspectorIdCol) {
        els.inspectorIdCol.classList.toggle('is-cursed', curseClicks > 0);
      }
      if (curseClicks > 0) {
        els.btnCurseShatter.classList.remove('is-hidden');
        els.btnCurseShatter.textContent = 'Shatter Curse (' + curseClicks + 'x)!';
      } else {
        els.btnCurseShatter.classList.add('is-hidden');
      }

      let statusHtml = '';
      if (g.ringActive) {
        statusHtml += '<span class="td-badge" style="border-color:#ffb300;color:#ffe082;">Ring +40%</span>';
      }
      if (tower.stunTimer > 0) {
        statusHtml += '<span class="td-badge td-badge-fire">Stun ' + tower.stunTimer.toFixed(1) + 's</span>';
      }
      if (this._dirty.towerStatus !== statusHtml) {
        els.statusStrip.innerHTML = statusHtml;
        this._dirty.towerStatus = statusHtml;
      }

      const dmgVal = Math.round(tower.damage !== undefined ? tower.damage : meta.damage);
      const dmgType = tower.dmgType || tower.damageType || meta.dmgType;
      els.statDamage.textContent = String(dmgVal);
      const isFire = !!(tower.isFire || (tower.type === 'dwarven' && tower.branch === 'A') || (tower.type === 'istari' && tower.branch === 'A'));
      const badgeLabel = isFire ? 'Fire' : (dmgType === 'magic' ? 'Mag' : 'Phys');
      els.statDmgBadge.textContent = badgeLabel;
      els.statDmgBadge.className = 'td-badge ' + (isFire ? 'td-badge-fire' : (dmgType === 'magic' ? 'td-badge-magic' : 'td-badge-phys'));

      let effRate = tower.effectiveFireRate;
      if (!(effRate > 0)) {
        const baseRate = tower.fireRate || meta.fireRate || 1.0;
        effRate = g.ringActive ? baseRate * 1.4 : baseRate;
      }
      els.statRate.textContent = effRate.toFixed(2) + '/s';
      els.statRate.classList.toggle('is-boosted', !!g.ringActive);

      const minR = tower.minRange || 0;
      const maxR = Math.round(tower.range || meta.range);
      els.statRange.textContent = minR > 0 ? (minR + '–' + maxR) : String(maxR);

      const liveDps = tower.liveDps !== undefined
        ? tower.liveDps
        : (tower.dps !== undefined ? tower.dps : dmgVal * effRate);
      els.statDps.textContent = Number(liveDps || 0).toFixed(1);
      els.statKills.textContent = String(tower.kills || 0);
      els.statTotalDmg.textContent = formatCompact(tower.totalDamage || 0);

      if (tower.type === 'garrison') {
        const guards = tower.soldiers || tower.guards || [];
        if (Array.isArray(guards) && guards.length > 0) {
          let alive = 0;
          for (let i = 0; i < guards.length; i++) {
            if (guards[i] && !guards[i].dead && guards[i].hp > 0) alive++;
          }
          els.rallyGuardsVal.textContent = alive + '/' + guards.length;
        } else {
          els.rallyGuardsVal.textContent = 'Set';
        }
      } else {
        const prio = capitalize(tower.priority || 'first');
        if (this._dirty.towerPriority !== prio) {
          els.targetPriorityVal.textContent = prio;
          this._dirty.towerPriority = prio;
        }
      }

      if ((tower.tier || 1) === 1) {
        const upgT2 = this._getTowerUpgradePreview(tower, 'T2');
        els.btnUpgradeT2.classList.toggle('is-unaffordable', g.gold < upgT2.cost);
      } else if (tower.tier === 2) {
        const upgA = this._getTowerUpgradePreview(tower, 'A');
        const upgB = this._getTowerUpgradePreview(tower, 'B');
        els.btnUpgradeBranchA.classList.toggle('is-unaffordable', g.gold < upgA.cost);
        els.btnUpgradeBranchB.classList.toggle('is-unaffordable', g.gold < upgB.cost);
      } else if (tower.tier === 3) {
        const sk = this._getTowerSkillState(tower);
        const pct = sk.maxCd > 0 ? Math.max(0, Math.min(100, (1 - sk.cd / sk.maxCd) * 100)) : 100;
        els.inspectorSkillBar.style.width = pct.toFixed(1) + '%';
        if (sk.cd > 0.05) {
          els.inspectorSkillCdBadge.textContent = sk.cd.toFixed(1) + 's';
          els.btnTriggerSkill.disabled = true;
          els.btnTriggerSkill.textContent = 'Recharging (' + sk.cd.toFixed(1) + 's)';
        } else if (tower.stunTimer > 0) {
          els.inspectorSkillCdBadge.textContent = 'Stunned';
          els.btnTriggerSkill.disabled = true;
          els.btnTriggerSkill.textContent = 'Tower Stunned';
        } else {
          els.inspectorSkillCdBadge.textContent = 'Ready';
          els.btnTriggerSkill.disabled = false;
          els.btnTriggerSkill.textContent = 'Activate Skill';
        }
      }

      const refund = typeof tower.getSellValue === 'function'
        ? tower.getSellValue()
        : Math.floor((tower.totalInvested || meta.cost) * 0.75);
      els.btnSellTower.textContent = 'Sell (+' + refund + 'g)';
    }

    _applyBuildHoverPreview(typeKey) {
      if (!this.game || typeof this.game.setPreviewRange !== 'function' || !this.game.selectedPad) return;
      const pad = this.game.selectedPad;
      const info = this._getTowerBaseInfo(typeKey);
      const valid = (this.game.towers && typeof this.game.towers.canBuild === 'function')
        ? !!this.game.towers.canBuild(pad, typeKey, this.game)
        : (this.game.gold >= info.cost);
      this.game.setPreviewRange({
        x: pad.x,
        y: pad.y,
        range: info.range,
        minRange: info.minRange || 0,
        mode: 'build',
        valid
      });
    }

    _applyUpgradeHoverPreview(targetKey) {
      if (!this.game || typeof this.game.setPreviewRange !== 'function' || !this.game.selectedTower) return;
      const t = this.game.selectedTower;
      const upg = this._getTowerUpgradePreview(t, targetKey);
      if (!upg) return;
      this.game.setPreviewRange({
        x: t.x,
        y: t.y,
        range: upg.range || t.range,
        minRange: upg.minRange !== undefined ? upg.minRange : (t.minRange || 0),
        mode: 'upgrade',
        valid: this.game.gold >= upg.cost
      });
    }

    /* ========================================================================
     * LIVE 3D OVERHEAD SATELLITE TERRAIN MINIMAP (`#hud-minimap`, 180x180)
     * ======================================================================== */

    _ensureMinimapBackdrop(mapId, mapData) {
      if (this._minimapBgCanvas && this._minimapBgMapId === mapId && (this._minimapBgIs3D || !this._hasMinimap3D())) {
        return this._minimapBgCanvas;
      }
      if (typeof document === 'undefined') return null;

      if (!this._minimapBgCanvas) {
        this._minimapBgCanvas = document.createElement('canvas');
        this._minimapBgCanvas.width = MINIMAP_SIZE;
        this._minimapBgCanvas.height = MINIMAP_SIZE;
      }
      const bg = this._minimapBgCanvas;
      const ctx = bg.getContext('2d');
      if (!ctx) return bg;

      const S = MINIMAP_SIZE;
      const margin = MINIMAP_MARGIN;
      const span = S - margin * 2;
      const mx = (gx) => margin + (gx / 1280) * span;
      const my = (gy) => margin + (gy / 720) * span;

      this._minimapBgMapId = mapId;
      this._minimapBgIs3D = false;

      // 1. Primary: Real 3D Overhead Shaded Satellite Terrain from Scene3D!
      if (this._hasMinimap3D()) {
        try {
          const ok = this.game.scene3d.renderMinimapTerrain3D(bg, mapId, {
            margin: margin,
            size: S
          });
          if (ok && this._verifyCanvasRich(bg, 14)) {
            this._minimapBgIs3D = true;
            // Subtle warm road highlight & Citadel Gate shield marker on top of 3D relief
            const paths = (mapData && Array.isArray(mapData.paths)) ? mapData.paths : [];
            ctx.save();
            ctx.strokeStyle = 'rgba(235, 214, 162, 0.22)';
            ctx.lineWidth = 3.2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (let l = 0; l < paths.length; l++) {
              const pts = Array.isArray(paths[l]) ? paths[l] : (paths[l] && paths[l].points) || [];
              if (pts.length < 2) continue;
              ctx.beginPath();
              ctx.moveTo(mx(pts[0].x), my(pts[0].y));
              for (let k = 1; k < pts.length; k++) {
                ctx.lineTo(mx(pts[k].x), my(pts[k].y));
              }
              ctx.stroke();
            }
            if (mapData && mapData.gatePoint) {
              const gx = mx(mapData.gatePoint.x);
              const gy = my(mapData.gatePoint.y);
              ctx.fillStyle = '#4fc3f7';
              ctx.strokeStyle = '#fff2be';
              ctx.lineWidth = 1.4;
              ctx.beginPath();
              ctx.arc(gx, gy, 4.6, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            }
            ctx.restore();
            return bg;
          }
        } catch (_err) {
          // Fall back below if 3D snapshot unavailable
        }
      }

      // 2. Shaded Procedural Topographic Relief Fallback
      ctx.clearRect(0, 0, S, S);
      const radial = ctx.createRadialGradient(S * 0.5, S * 0.48, 8, S * 0.5, S * 0.5, S * 0.54);
      if (mapId === 'blackgate') {
        radial.addColorStop(0, '#36241d');
        radial.addColorStop(0.68, '#1e1512');
        radial.addColorStop(1, '#0c0908');
      } else if (mapId === 'pelennor') {
        radial.addColorStop(0, '#383d28');
        radial.addColorStop(0.68, '#222619');
        radial.addColorStop(1, '#0e100b');
      } else {
        radial.addColorStop(0, '#2a3c2e');
        radial.addColorStop(0.68, '#18241c');
        radial.addColorStop(1, '#0b100d');
      }
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, S, S);

      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const r = S * 0.34 + (i % 3) * 10;
        ctx.fillStyle = mapId === 'blackgate' ? 'rgba(235,88,20,0.14)' : 'rgba(16,28,18,0.48)';
        ctx.beginPath();
        ctx.arc(S * 0.5 + Math.cos(a) * r, S * 0.5 + Math.sin(a) * r, 9 + (i % 4) * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      const paths = (mapData && Array.isArray(mapData.paths)) ? mapData.paths : [];
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass === 0 ? 'rgba(12,11,10,0.88)' : '#867a60';
        ctx.lineWidth = pass === 0 ? 8.5 : 5.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let l = 0; l < paths.length; l++) {
          const pts = Array.isArray(paths[l]) ? paths[l] : (paths[l] && paths[l].points) || [];
          if (pts.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(mx(pts[0].x), my(pts[0].y));
          for (let k = 1; k < pts.length; k++) {
            ctx.lineTo(mx(pts[k].x), my(pts[k].y));
          }
          ctx.stroke();
        }
      }

      if (mapData && mapData.gatePoint) {
        const gx = mx(mapData.gatePoint.x);
        const gy = my(mapData.gatePoint.y);
        ctx.fillStyle = '#4fc3f7';
        ctx.strokeStyle = '#fff2be';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(gx, gy, 4.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      return bg;
    }

    _renderMinimap(g) {
      const canvas = this._els.minimapCanvas;
      if (!canvas || !canvas.getContext || !g) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const S = canvas.width;
      const margin = MINIMAP_MARGIN;
      const span = S - margin * 2;
      const mx = (gx) => margin + (gx / 1280) * span;
      const my = (gy) => margin + (gy / 720) * span;

      const mapId = g.mapId || this.selectedMapId || 'hornburg';
      const mapData = g.map || (TD.MAPS && TD.MAPS[mapId]) || null;
      const bg = this._ensureMinimapBackdrop(mapId, mapData);

      ctx.save();
      ctx.clearRect(0, 0, S, S);
      ctx.beginPath();
      ctx.arc(S * 0.5, S * 0.5, S * 0.5 - 1, 0, Math.PI * 2);
      ctx.clip();

      if (bg) {
        ctx.drawImage(bg, 0, 0, S, S);
      }

      // 1. Perspective 3D Camera Frustum Trapezoid
      let camCx = S * 0.5;
      let camCy = S * 0.5;
      let zoomScale = 1.0;
      if (g.scene3d) {
        if (typeof g.scene3d.zoom === 'number' && g.scene3d.zoom > 0) {
          zoomScale = 1 / g.scene3d.zoom;
        }
        const tgt = g.scene3d.panTarget || g.scene3d.cameraTarget || g.scene3d.target;
        if (tgt && typeof tgt.x === 'number' && typeof tgt.z === 'number') {
          camCx = mx(tgt.x * 10 + 640);
          camCy = my(tgt.z * 10 + 360);
        }
      }
      const fwTop = 66 * zoomScale;
      const fwBot = 48 * zoomScale;
      const fh = 37 * zoomScale;
      ctx.strokeStyle = 'rgba(255, 232, 162, 0.30)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(camCx - fwTop, camCy - fh);
      ctx.lineTo(camCx + fwTop, camCy - fh);
      ctx.lineTo(camCx + fwBot, camCy + fh);
      ctx.lineTo(camCx - fwBot, camCy + fh);
      ctx.closePath();
      ctx.stroke();

      // 2. Empty Foundation Pads
      const pads = (mapData && Array.isArray(mapData.pads)) ? mapData.pads : [];
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        const px = mx(p.x);
        const py = my(p.y);
        const isSel = !!(g.selectedPad && !g.selectedTower && g.selectedPad.id === p.id);
        ctx.strokeStyle = isSel ? '#87f0de' : 'rgba(235, 206, 132, 0.42)';
        ctx.lineWidth = isSel ? 2.1 : 1.1;
        ctx.beginPath();
        ctx.arc(px, py, isSel ? 4.8 : 2.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 3. Built Towers & Garrison Squads
      const builtTowers = (g.towers && Array.isArray(g.towers.towers)) ? g.towers.towers : [];
      for (let i = 0; i < builtTowers.length; i++) {
        const t = builtTowers[i];
        if (!t || t.sold) continue;
        const tx = mx(t.x);
        const ty = my(t.y);

        const guards = t.soldiers || t.guards;
        if (Array.isArray(guards)) {
          ctx.fillStyle = '#f6f9ff';
          for (let s = 0; s < guards.length; s++) {
            const u = guards[s];
            if (!u || u.dead || u.hp <= 0) continue;
            ctx.beginPath();
            ctx.arc(mx(u.x), my(u.y), 1.9, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        const isCursed = (t.curseClicksRemaining || 0) > 0;
        ctx.fillStyle = isCursed
          ? '#ff1744'
          : (t.type === 'istari' ? '#64d8ff' : (t.type === 'garrison' ? '#82baff' : '#4ef09a'));
        ctx.strokeStyle = 'rgba(8, 12, 10, 0.9)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(tx, ty, 3.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (g.selectedTower && g.selectedTower.id === t.id) {
          ctx.strokeStyle = '#fff5c8';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(tx, ty, 6.4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // 4. Live Enemies & Bosses
      const activeEnemies = (g.enemies && Array.isArray(g.enemies.active)) ? g.enemies.active : [];
      for (let i = 0; i < activeEnemies.length; i++) {
        const e = activeEnemies[i];
        if (!e || e.dead || e.reachedExit || e.hp <= 0) continue;
        const ex = mx(e.x);
        const ey = my(e.y);
        if (e.isBoss) {
          ctx.fillStyle = '#e51c23';
          ctx.strokeStyle = '#ffe596';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(ex, ey + 6.6);
          ctx.lineTo(ex - 5.8, ey - 4.5);
          ctx.lineTo(ex + 5.8, ey - 4.5);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = e.flying ? '#ffd54f' : '#ff4d1a';
          ctx.strokeStyle = 'rgba(15, 6, 4, 0.8)';
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.arc(ex, ey, e.type === 'troll' ? 3.4 : 2.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      // 5. Spherical Dark-Glass Rim Vignette
      const rim = ctx.createRadialGradient(S * 0.5, S * 0.5, S * 0.35, S * 0.5, S * 0.5, S * 0.5);
      rim.addColorStop(0, 'rgba(0,0,0,0)');
      rim.addColorStop(1, 'rgba(0,0,0,0.62)');
      ctx.fillStyle = rim;
      ctx.fillRect(0, 0, S, S);
      ctx.restore();

      // Update bezel studs
      if (this._dirty.towerCountStud !== builtTowers.length) {
        this._dirty.towerCountStud = builtTowers.length;
        this._els.minimapTowerCount.textContent = String(builtTowers.length);
      }
      const canCall = !!(g.enemies && typeof g.enemies.canCallEarly === 'function' && g.enemies.canCallEarly(g));
      if (this._dirty.hornStudActive !== canCall) {
        this._dirty.hornStudActive = canCall;
        this._els.btnMinimapHorn.classList.toggle('can-call-early', canCall);
      }
    }

    /* ========================================================================
     * LORE & BESTIARY CODEX MODAL (WITH 80x80 3D STUDIO PORTRAITS!)
     * ======================================================================== */

    isCodexOpen() {
      return !!this.codexOpen;
    }

    openCodex(tabId) {
      if (!this._els.built) return;
      if (this.game && this.game.state === 'playing' && typeof this.game.pause === 'function') {
        this.game.pause();
      }
      this.codexOpen = true;
      this._els.codexModal.hidden = false;
      this._els.codexModal.classList.remove('is-hidden');
      this._populateCodexContent();
      this.switchCodexTab(tabId || this.activeCodexTab || 'towers');
    }

    closeCodex() {
      if (!this._els.built || !this.codexOpen) return;
      this.codexOpen = false;
      this._els.codexModal.hidden = true;
      this._els.codexModal.classList.add('is-hidden');
      if (this.game && this.game.sound && this.game.sound.playClick) {
        this.game.sound.playClick();
      }
      this.update(0, this.game);
    }

    toggleCodex(forceFlag) {
      const next = typeof forceFlag === 'boolean' ? forceFlag : !this.codexOpen;
      if (next) this.openCodex();
      else this.closeCodex();
    }

    switchCodexTab(tabId) {
      this.activeCodexTab = tabId;
      const els = this._els;
      for (let i = 0; i < els.codexTabBtns.length; i++) {
        const b = els.codexTabBtns[i];
        b.classList.toggle('is-active', b.getAttribute('data-codex-tab') === tabId);
      }
      els.codexTabTowers.classList.toggle('is-hidden', tabId !== 'towers');
      els.codexTabBestiary.classList.toggle('is-hidden', tabId !== 'bestiary');
      els.codexTabMechanics.classList.toggle('is-hidden', tabId !== 'mechanics');
    }

    _populateCodexContent() {
      const els = this._els;
      this._codexPortraitJobs = [];
      let all3d = true;

      // 1. Towers & Upgrades Tab (Large 80x80 3D Base Portrait + T2 3D Inset + 52x52 3D Branch A/B Portraits!)
      els.codexTabTowers.innerHTML = '<div class="codex-towers-grid" id="codex-towers-inner"></div>';
      const tGrid = els.codexTabTowers.firstChild;

      for (let i = 0; i < TOWER_ORDER.length; i++) {
        const typeKey = TOWER_ORDER[i];
        const info = this._getTowerBaseInfo(typeKey);
        const rawT = (TD.TOWER_TYPES && TD.TOWER_TYPES[typeKey]) || {};
        const fb = TOWER_META_FALLBACK[typeKey];
        const t2Data = rawT.tier2 || fb.t2;
        const rawA = (rawT.branches && rawT.branches.A) || {};
        const rawB = (rawT.branches && rawT.branches.B) || {};
        const brA = {
          name: rawA.name || fb.A.name,
          cost: rawA.cost || fb.A.cost,
          desc: rawA.desc || fb.A.desc,
          skillName: (rawA.skill && rawA.skill.name) || fb.A.skillName,
          skillCd: (rawA.skill && rawA.skill.cooldown) || fb.A.skillCd,
          skillDesc: (rawA.skill && rawA.skill.desc) || fb.A.skillDesc
        };
        const brB = {
          name: rawB.name || fb.B.name,
          cost: rawB.cost || fb.B.cost,
          desc: rawB.desc || fb.B.desc,
          skillName: (rawB.skill && rawB.skill.name) || fb.B.skillName,
          skillCd: (rawB.skill && rawB.skill.cooldown) || fb.B.skillCd,
          skillDesc: (rawB.skill && rawB.skill.desc) || fb.B.skillDesc
        };

        const card = document.createElement('div');
        card.className = 'codex-tower-card';
        card.innerHTML =
          '<div class="codex-tower-head">' +
            '<div class="codex-portrait-box"><canvas width="160" height="160" data-icon="base"></canvas></div>' +
            '<div style="min-width:0;flex:1;">' +
              '<h4 style="margin:0 0 4px;font-family:var(--font-serif);font-size:15px;color:var(--gold-300);">' + escapeHtml(info.name) + ' (' + info.cost + 'g)</h4>' +
              '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:4px;">' +
                '<span class="td-badge ' + (info.dmgType === 'magic' ? 'td-badge-magic' : 'td-badge-phys') + '">' + capitalize(info.dmgType) + '</span>' +
                '<span class="td-badge">' + (info.canTargetFlying ? 'Ground &amp; Air' : 'Ground Only') + '</span>' +
                '<span class="td-badge">Range ' + (info.minRange > 0 ? info.minRange + '–' : '') + info.range + '</span>' +
              '</div>' +
              '<div style="font-size:11.2px;color:var(--text-muted);line-height:1.3;">' + escapeHtml(info.role) + ' • <strong style="color:var(--gold-400);">T2 (' + t2Data.cost + 'g):</strong> ' + escapeHtml(t2Data.name) + '</div>' +
            '</div>' +
            '<div class="codex-t2-mini" title="Tier II: ' + escapeHtml(t2Data.name) + '"><canvas width="112" height="112" data-icon="t2"></canvas></div>' +
          '</div>' +
          '<div class="codex-branches-row">' +
            '<div class="codex-branch-box">' +
              '<div class="codex-branch-head"><canvas width="112" height="112" data-icon="A"></canvas><span>' + escapeHtml(brA.name) + ' (' + brA.cost + 'g)</span></div>' +
              '<div style="color:var(--text-muted);margin-bottom:3px;">' + escapeHtml(brA.desc) + '</div>' +
              '<div style="color:var(--rune-300);"><strong>' + escapeHtml(brA.skillName) + ' (' + brA.skillCd + 's):</strong> ' + escapeHtml(brA.skillDesc) + '</div>' +
            '</div>' +
            '<div class="codex-branch-box">' +
              '<div class="codex-branch-head"><canvas width="112" height="112" data-icon="B"></canvas><span>' + escapeHtml(brB.name) + ' (' + brB.cost + 'g)</span></div>' +
              '<div style="color:var(--text-muted);margin-bottom:3px;">' + escapeHtml(brB.desc) + '</div>' +
              '<div style="color:var(--rune-300);"><strong>' + escapeHtml(brB.skillName) + ' (' + brB.skillCd + 's):</strong> ' + escapeHtml(brB.skillDesc) + '</div>' +
            '</div>' +
          '</div>';

        const cBase = card.querySelector('canvas[data-icon="base"]');
        const cT2 = card.querySelector('canvas[data-icon="t2"]');
        const cA = card.querySelector('canvas[data-icon="A"]');
        const cB = card.querySelector('canvas[data-icon="B"]');

        this._codexPortraitJobs.push(
          { kind: 'tower', canvas: cBase, key: typeKey, tier: 1, branch: null },
          { kind: 'tower', canvas: cT2, key: typeKey, tier: 2, branch: null },
          { kind: 'tower', canvas: cA, key: typeKey, tier: 3, branch: 'A' },
          { kind: 'tower', canvas: cB, key: typeKey, tier: 3, branch: 'B' }
        );
        if (!this._renderTowerPortrait(cBase, typeKey, 1, null)) all3d = false;
        if (!this._renderTowerPortrait(cT2, typeKey, 2, null)) all3d = false;
        if (!this._renderTowerPortrait(cA, typeKey, 3, 'A')) all3d = false;
        if (!this._renderTowerPortrait(cB, typeKey, 3, 'B')) all3d = false;

        tGrid.appendChild(card);
      }

      // 2. Bestiary & Resistances Tab (Large 80x80 3D Studio Portraits on All 9 Enemies & Bosses!)
      els.codexTabBestiary.innerHTML = '<div class="codex-bestiary-grid" id="codex-bestiary-inner"></div>';
      const bGrid = els.codexTabBestiary.firstChild;

      for (let i = 0; i < ENEMY_ORDER.length; i++) {
        const eKey = ENEMY_ORDER[i];
        const raw = (TD.ENEMY_TYPES && TD.ENEMY_TYPES[eKey]) || {};
        const fb = ENEMY_META_FALLBACK[eKey];

        const name = raw.name || fb.name;
        const hp = raw.maxHp || raw.hp || fb.hp;
        const speed = raw.speed || fb.speed;
        const physPct = Math.round(((raw.physArmor !== undefined ? raw.physArmor : fb.physArmor) || 0) * 100);
        const magPct = Math.round(((raw.magicResist !== undefined ? raw.magicResist : fb.magicResist) || 0) * 100);
        const isBoss = !!(raw.isBoss || fb.isBoss);
        const flying = !!(raw.flying || fb.flying);
        const trait = raw.desc || raw.description || raw.special || fb.trait;

        const card = document.createElement('div');
        card.className = 'codex-enemy-card' + (isBoss ? ' is-boss-card' : '');
        card.setAttribute('data-enemy', eKey);
        card.innerHTML =
          '<div class="codex-enemy-top">' +
            '<div class="codex-portrait-box"><canvas width="160" height="160"></canvas></div>' +
            '<div class="codex-enemy-meta">' +
              '<h4 style="margin:0;font-family:var(--font-serif);font-size:13.5px;color:' + (isBoss ? '#ffca74' : 'var(--gold-300)') + ';">' + escapeHtml(name) + '</h4>' +
              '<div class="tabular" style="display:flex;gap:4px;flex-wrap:wrap;">' +
                '<span class="td-badge">HP ' + hp + '</span>' +
                '<span class="td-badge td-badge-phys">Spd ' + speed + '</span>' +
                (flying ? '<span class="td-badge td-badge-air">Flying</span>' : '') +
                (isBoss ? '<span class="td-badge td-badge-fire">Boss</span>' : '') +
              '</div>' +
              '<div class="resist-bars tabular">' +
                '<div class="resist-pill"><span>Phys</span><span style="color:#e4ebf5;">' + physPct + '%</span></div>' +
                '<div class="resist-pill"><span>Magic</span><span style="color:#99e6ff;">' + magPct + '%</span></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<p style="margin:0;font-size:10.5px;line-height:1.3;color:var(--text-muted);">' + escapeHtml(trait) + '</p>';

        const eCanvas = card.querySelector('canvas');
        const phase = eKey === 'balrog' ? 2 : 1;
        this._codexPortraitJobs.push({ kind: 'enemy', canvas: eCanvas, key: eKey, phase: phase });
        if (!this._renderEnemyPortrait(eCanvas, eKey, phase)) {
          all3d = false;
        }
        bGrid.appendChild(card);
      }

      this._allCodexPortraits3D = all3d;

      // 3. Mechanics & The Ring Tab
      els.codexTabMechanics.innerHTML =
        '<div class="codex-mech-grid">' +
          '<div class="codex-mech-card">' +
            '<h4>The One Ring &amp; Corruption</h4>' +
            '<p>Wielding the Ring of Power [R] empowers every defender on the field, but draws the Eye of Mordor:</p>' +
            '<ul>' +
              '<li><strong>Blessings:</strong> +40% Tower &amp; Garrison Attack Speed, <strong>True Sight</strong> (0% Shadow Wraith dodge), and +25% Bonus Gold from kills.</li>' +
              '<li><strong>Peril:</strong> Enemies march +15% faster while Corruption climbs (+8%/sec). Toggle OFF to let Corruption drain (-3.5%/sec).</li>' +
              '<li><strong>100% Corruption Overload:</strong> Forces the Ring off and immediately summons a terrifying <strong>Ringwraith Boss</strong> whose <em>Black Breath</em> stuns nearby towers for 4 seconds!</li>' +
            '</ul>' +
          '</div>' +
          '<div class="codex-mech-card">' +
            '<h4>Armor, Magic, Stealth &amp; Flight</h4>' +
            '<ul>' +
              '<li><strong>Physical vs Magic:</strong> Heavy foes like Olog-hai Siege Trolls mitigate 60% of Physical hits. Counter with <em>Istari Spires</em> (Pure Magic) or shred 50% armor permanently with <em>Khazad Ballistae</em>.</li>' +
              '<li><strong>Troll Regeneration:</strong> Siege Trolls regenerate 18 HP/s unless struck by <strong>Fire</strong> (Iron Hills Mortar, Flame of Anor) or <strong>Magic</strong> within the last 4s.</li>' +
              '<li><strong>Shadow Wraiths &amp; Fell Beasts:</strong> Wraiths dodge 80% of physical strikes until revealed. Flying Fell Beasts ignore ground blockers—station Elven &amp; Istari towers!</li>' +
            '</ul>' +
          '</div>' +
          '<div class="codex-mech-card">' +
            '<h4>Player Spellbook &amp; War Horns</h4>' +
            '<ul>' +
              '<li><strong>Light of Eärendil [1] (45s CD):</strong> Stuns foes in a 150px starlight circle for 2.5s, strips Wraith stealth for 30s, and heals/revives Garrison guards.</li>' +
              '<li><strong>Great Eagles Strike [2] (70s CD):</strong> Sweeps an entire path corridor for 340 hybrid damage against both ground and aerial enemies.</li>' +
              '<li><strong>Early Wave Horns:</strong> Click pulsing golden War Horns at enemy entry gates between waves to earn bonus treasury gold!</li>' +
            '</ul>' +
          '</div>' +
          '<div class="codex-mech-card">' +
            '<h4>Boss Dark Curses &amp; Counter-Play</h4>' +
            '<ul>' +
              '<li><strong>Wave 15 Multi-Phase Siege:</strong> <em>The Witch-lord of Morgul</em> transforms below 50% HP into the fiery <em>Balrog of Udûn</em>.</li>' +
              '<li><strong>Shattering Dark Chains:</strong> Every 6.5s the Boss locks a nearby tower in shadow-flame chains for 3s. <strong>Rapidly click the cursed tower 3 times</strong> to shatter the curse immediately!</li>' +
              '<li><strong>Selling Defenses:</strong> Any tower may be dismantled for a <strong>75% gold refund</strong> of total gold invested.</li>' +
            '</ul>' +
          '</div>' +
        '</div>';
    }

    /* ========================================================================
     * VICTORY & DEFEAT MODALS
     * ======================================================================== */

    _populateVictoryModal() {
      const g = this.game;
      if (!g || !this._els.built) return;
      const els = this._els;

      const stars = typeof g.getStarRating === 'function'
        ? g.getStarRating()
        : (g.lives >= 18 ? 3 : (g.lives >= 10 ? 2 : 1));

      const ratingTitles = {
        3: 'Three Stars — Unbroken Citadel of the West!',
        2: 'Two Stars — Valiant Defense of the Realm!',
        1: 'One Star — Hard-Won Survival Against the Shadow!'
      };
      els.victorySubtitle.textContent = ratingTitles[stars] || ratingTitles[1];
      els.vicLives.textContent = g.lives + ' / ' + (g.maxLives || 20);
      els.vicKills.textContent = String((g.stats && g.stats.kills) || 0);
      els.vicGold.textContent = ((g.stats && g.stats.goldEarned) || 0) + 'g';

      for (let i = 0; i < this._starTimers.length; i++) {
        clearTimeout(this._starTimers[i]);
      }
      this._starTimers.length = 0;

      for (let i = 0; i < els.victoryStars.length; i++) {
        const starEl = els.victoryStars[i];
        starEl.classList.remove('is-earned');
        if (i < stars) {
          const timer = setTimeout(() => {
            starEl.classList.add('is-earned');
          }, 120 + i * 180);
          this._starTimers.push(timer);
        }
      }
    }

    _populateDefeatModal() {
      const g = this.game;
      if (!g || !this._els.built) return;
      const els = this._els;
      els.defWave.textContent = 'Wave ' + Math.max(1, g.wave || 1);
      els.defKills.textContent = String((g.stats && g.stats.kills) || 0);
      els.defDiff.textContent = (g.difficulty && g.difficulty.name) || capitalize(g.difficultyId || 'captain');
    }

    /* ========================================================================
     * LIVE FRAME UPDATE (~12.5Hz throttled + 60 FPS 3D War Horn Projection)
     * ======================================================================== */

    update(dt, game) {
      if (game) this.game = game;
      const g = this.game;
      if (!g || !this._els.built) return;

      if (this._toastTimer > 0 && dt > 0) {
        this._toastTimer -= dt;
        if (this._toastTimer <= 0) {
          this._els.heraldToast.classList.add('is-hidden');
        }
      }

      this._syncScreenVisibility(false);

      if (this.codexOpen && !this._allCodexPortraits3D) {
        this._upgradeCodexPortraitsTo3D();
      }

      if (g.state === 'title') {
        if (!this._allTitlePreviews3D) {
          this._upgradeTitleMapPreviewsTo3D();
        }
        return;
      }

      if (!this._allBuildCards3D) {
        this._upgradeBuildCardPortraitsTo3D();
      }

      if (dt > 0 && g.scene3d && this._earlyMarkers.length > 0) {
        this._reprojectVisibleEarlyMarkers(g);
      }

      if (dt > 0) {
        this._hudAccumDt += dt;
        if (this._hudAccumDt < 0.08) {
          return;
        }
        this._hudAccumDt = 0;
      } else {
        this._hudAccumDt = 0;
      }

      this._syncTopHud(g);
      this._syncBossBanner(g);
      this._syncSpellbookAndTargeting(g);
      this._syncEarlyWaveMarkers(g);
      this._renderMinimap(g);

      const curTowerId = g.selectedTower ? g.selectedTower.id : null;
      const curPadId = (!g.selectedTower && g.selectedPad) ? g.selectedPad.id : null;
      if (curTowerId !== this._lastInspectedTowerId || curPadId !== this._lastInspectedPadId) {
        this._lastInspectedPadId = curPadId;
        this.refreshInspector();
      } else if (g.selectedTower) {
        if ((g.selectedTower.tier || 1) !== this._lastInspectedTier || g.selectedTower.branch !== this._lastInspectedBranch) {
          this.refreshInspector();
        } else {
          this._updateInspectorLiveStats(g.selectedTower, g);
        }
      } else {
        for (let i = 0; i < TOWER_ORDER.length; i++) {
          const tk = TOWER_ORDER[i];
          const ref = this._buildCardRefs[tk];
          if (ref) {
            const cost = this._getTowerBaseInfo(tk).cost;
            ref.card.classList.toggle('is-unaffordable', g.gold < cost);
          }
        }
        if (!g.selectedPad && g.map && Array.isArray(g.map.pads)) {
          const totalPads = g.map.pads.length;
          const builtCount = (g.towers && Array.isArray(g.towers.towers)) ? g.towers.towers.length : 0;
          const openStr = Math.max(0, totalPads - builtCount) + '/' + totalPads + ' Open';
          if (this._dirty.openPadKicker !== openStr) {
            this._dirty.openPadKicker = openStr;
            this._els.buildPadKicker.textContent = openStr;
          }
        } else if (g.selectedPad && this._hoveredBuildType) {
          this._applyBuildHoverPreview(this._hoveredBuildType);
        }
      }
    }

    _syncScreenVisibility(force) {
      const g = this.game;
      if (!g || !this._els.built) return;
      const st = g.state || 'title';
      if (!force && this._dirty.screenState === st && this._dirty.codexVis === this.codexOpen) {
        return;
      }
      this._dirty.screenState = st;
      this._dirty.codexVis = this.codexOpen;

      const els = this._els;
      const inMatch = st !== 'title';
      const showBattleHud = inMatch && st !== 'victory' && st !== 'defeat';

      els.titleScreen.classList.toggle('is-hidden', st !== 'title');
      els.topHud.classList.toggle('is-hidden', !inMatch);
      els.minimapMedallion.classList.toggle('is-hidden', !showBattleHud);
      els.commandDock.classList.toggle('is-hidden', !showBattleHud);
      els.codexMedallion.classList.toggle('is-hidden', !showBattleHud);
      els.victoryModal.classList.toggle('is-hidden', st !== 'victory');
      els.defeatModal.classList.toggle('is-hidden', st !== 'defeat');
      els.pauseBanner.classList.toggle('is-hidden', !(st === 'paused' && !this.codexOpen));

      if (!showBattleHud) {
        this._hideDockTooltip();
        els.bossBanner.classList.add('is-hidden');
        this._dirty.bossVisible = false;
        els.targetingBanner.classList.add('is-hidden');
        els.heraldToast.classList.add('is-hidden');
        this._hideAllEarlyMarkers();
      }
    }

    _syncTopHud(g) {
      const els = this._els;
      const d = this._dirty;

      // Lives (`20/20`)
      const lives = Math.max(0, g.lives | 0);
      const maxLives = Math.max(1, (g.maxLives | 0) || 20);
      if (d.lives !== lives || d.maxLives !== maxLives) {
        d.lives = lives;
        d.maxLives = maxLives;
        els.livesVal.textContent = String(lives);
        els.livesMax.textContent = '/' + maxLives;
        els.livesPill.classList.toggle('is-low', lives <= 10 && lives > 5);
        els.livesPill.classList.toggle('is-critical', lives <= 5);
      }

      // Gold (`3,653`)
      const gold = Math.floor(g.gold || 0);
      if (d.gold !== gold) {
        d.gold = gold;
        els.goldVal.textContent = formatGoldComma(gold);
      }

      // Wave Counter (`WAVE X/15` or `WAVE X • ENDLESS`)
      const wave = g.wave || 0;
      const endless = !!(g.endless || g.isEndless || wave > 15);
      const waveLabel = endless
        ? ('WAVE ' + wave + ' • ENDLESS')
        : ('WAVE ' + wave + '/' + (g.maxWaves || 15));
      if (d.waveLabel !== waveLabel) {
        d.waveLabel = waveLabel;
        els.waveText.textContent = waveLabel;
      }

      let waveSub = 'Ready';
      if (g.enemies) {
        if (g.enemies.waveInProgress) {
          waveSub = 'In Battle';
        } else if (g.enemies.betweenWavesTimer > 0) {
          waveSub = 'Next ' + Math.ceil(g.enemies.betweenWavesTimer) + 's';
        }
      }
      if (d.waveSub !== waveSub) {
        d.waveSub = waveSub;
        els.waveSub.textContent = waveSub;
      }

      // Ring of Power & Corruption
      const ringOn = !!g.ringActive;
      const ringLocked = g.corruption >= 99.5 || (g.ringOverloadTimer > 0 && !ringOn && g.corruption > 90);
      if (d.ringOn !== ringOn || d.ringLocked !== ringLocked) {
        d.ringOn = ringOn;
        d.ringLocked = ringLocked;
        els.btnRing.classList.toggle('is-active', ringOn);
        els.btnRing.classList.toggle('is-locked', ringLocked);
        els.ringCluster.classList.toggle('is-ring-active', ringOn);
        els.corrPillTop.classList.toggle('is-ring-on', ringOn);
        els.corrGemIcon.innerHTML = ringOn ? ICONS.corruptionGemFire : ICONS.corruptionGem;
        els.corruptionStatusLabel.textContent = ringOn ? 'ON' : 'RING';
        els.ringCaptionLabel.textContent = ringOn ? 'Ring Active' : 'The One Ring';
        if (this._lastRingArtState !== ringOn) {
          CardPainter.paintAbilityCard(els.spellRingCanvas, 'ring', ringOn);
          this._lastRingArtState = ringOn;
        }
      }

      const corrInt = Math.max(0, Math.min(100, Math.round(g.corruption || 0)));
      if (d.corrInt !== corrInt) {
        d.corrInt = corrInt;
        const pctStr = corrInt + '%';
        els.corruptionPct.textContent = pctStr;
        els.corruptionFill.style.width = pctStr;
        els.corrPctTop.textContent = pctStr;
        els.corrFillTop.style.width = pctStr;
        const isCrit = corrInt >= 75;
        els.corruptionBox.classList.toggle('is-critical', isCrit);
        els.corrPillTop.classList.toggle('is-critical', isCrit);
      }

      // Pause / Speed / Mute buttons
      const isPaused = g.state === 'paused';
      if (d.isPaused !== isPaused) {
        d.isPaused = isPaused;
        els.btnPause.classList.toggle('is-active', isPaused);
        els.btnPauseIcon.innerHTML = isPaused ? ICONS.play : ICONS.pause;
        els.btnPauseLabel.textContent = isPaused ? 'Resume' : 'Pause';
      }

      const speed = g.speed || 1;
      if (d.speed !== speed) {
        d.speed = speed;
        for (let i = 0; i < els.speedBtns.length; i++) {
          const b = els.speedBtns[i];
          b.classList.toggle('is-active', Number(b.getAttribute('data-speed')) === speed);
        }
      }

      const muted = !!(g.sound && g.sound.muted);
      if (d.muted !== muted) {
        d.muted = muted;
        els.btnMute.classList.toggle('is-active', muted);
        els.btnMute.innerHTML = muted ? ICONS.soundOff : ICONS.soundOn;
      }
    }

    _syncBossBanner(g) {
      const els = this._els;
      const boss = ((g.state === 'playing' || g.state === 'paused') && g.enemies && typeof g.enemies.getActiveBoss === 'function')
        ? g.enemies.getActiveBoss()
        : null;

      if (!boss || boss.dead || boss.hp <= 0) {
        if (this._dirty.bossVisible !== false) {
          this._dirty.bossVisible = false;
          els.bossBanner.classList.add('is-hidden');
        }
        return;
      }

      if (this._dirty.bossVisible !== true) {
        this._dirty.bossVisible = true;
        els.bossBanner.classList.remove('is-hidden');
      }

      if (boss.id && this._lastBossAnnouncedId !== boss.id) {
        this._lastBossAnnouncedId = boss.id;
        if (boss.type === 'ringwraith') {
          this.notify('THE RING BETRAYS! A Ringwraith of Mordor Enters the Field!', 'danger', 3.5);
        } else {
          this.notify('DREAD FOE APPROACHES — ' + (boss.name || 'Lord of Morgul') + '!', 'danger', 3.5);
        }
      }

      let phaseLabel = 'Boss';
      if (boss.type === 'ringwraith') {
        phaseLabel = 'Ringwraith • Black Breath';
      } else if (boss.phase === 2 || /balrog/i.test(boss.name || '')) {
        phaseLabel = 'Phase II • Balrog of Udûn';
      } else {
        phaseLabel = 'Phase I • Witch-lord';
      }

      const bName = boss.name || (boss.type === 'ringwraith' ? 'Ringwraith Boss' : 'The Witch-lord of Morgul');
      if (this._dirty.bossName !== bName) {
        this._dirty.bossName = bName;
        els.bossName.textContent = bName;
      }
      if (this._dirty.bossPhase !== phaseLabel) {
        this._dirty.bossPhase = phaseLabel;
        els.bossPhaseBadge.textContent = phaseLabel;
      }

      const hp = Math.max(0, Math.ceil(boss.hp));
      const maxHp = Math.max(1, Math.ceil(boss.maxHp || 1));
      const pct = Math.max(0, Math.min(100, (boss.hp / maxHp) * 100));
      els.bossHpFill.style.width = pct.toFixed(1) + '%';
      els.bossHpText.textContent = hp + ' / ' + maxHp;
    }

    _syncSpellbookAndTargeting(g) {
      const els = this._els;

      const updateSlot = (key, btn, svg, arc, label, cornerEl, defaultMax) => {
        const sp = g.spells && g.spells[key];
        const cd = sp ? Math.max(0, sp.cd || sp.remaining || 0) : 0;
        const maxCd = sp ? (sp.cooldown || sp.maxCooldown || defaultMax) : defaultMax;
        const isTargeting = g.activeSpell === key;

        btn.classList.toggle('is-targeting', isTargeting);
        if (cd > 0.05) {
          btn.classList.add('is-cooling');
          svg.classList.remove('is-hidden');
          label.classList.remove('is-hidden');
          if (cornerEl) cornerEl.classList.add('is-hidden');
          const ratio = Math.max(0, Math.min(1, cd / maxCd));
          const offset = SPELL_CIRCUMFERENCE * (1 - ratio);
          arc.setAttribute('stroke-dashoffset', offset.toFixed(2));
          label.textContent = Math.ceil(cd) + 's';
        } else {
          btn.classList.remove('is-cooling');
          svg.classList.add('is-hidden');
          label.classList.add('is-hidden');
          if (cornerEl) {
            cornerEl.classList.remove('is-hidden');
            cornerEl.textContent = 'RDY';
          }
        }
      };

      updateSlot('light', els.btnSpellLight, els.spellLightSvg, els.spellLightArc, els.spellLightCd, els.spellLightCorner, 45);
      updateSlot('eagles', els.btnSpellEagles, els.spellEaglesSvg, els.spellEaglesArc, els.spellEaglesCd, els.spellEaglesCorner, 70);

      if (g.activeSpell) {
        const spName = g.activeSpell === 'light' ? 'Light of Eärendil' : 'Great Eagles Strike';
        els.targetingBanner.classList.remove('is-hidden');
        els.targetingBannerText.textContent = 'Aiming ' + spName + ' — Click battlefield to cast — Right-Click or ESC to cancel';
      } else if (g.rallyTower) {
        els.targetingBanner.classList.remove('is-hidden');
        els.targetingBannerText.textContent = 'Setting Garrison Rally Point — Click within range — Right-Click or ESC to cancel';
      } else {
        els.targetingBanner.classList.add('is-hidden');
      }
    }

    _computeEarlyMarkerPos(g, pt) {
      const vw = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : (TD.WIDTH || 1280);
      const vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : (TD.HEIGHT || 720);

      if (g.scene3d && typeof g.scene3d.projectToScreen === 'function') {
        try {
          const proj = g.scene3d.projectToScreen(pt.x, pt.y, 1.8);
          if (proj && Number.isFinite(proj.x) && Number.isFinite(proj.y) && proj.visible !== false) {
            const sx = Math.max(96, Math.min(vw - 96, proj.x));
            const sy = Math.max(66, Math.min(vh - 166, proj.y));
            return { leftStr: sx.toFixed(1) + 'px', topStr: sy.toFixed(1) + 'px' };
          }
        } catch (_err) {
          // Fall back cleanly to percentage coordinates
        }
      }

      const w = TD.WIDTH || 1280;
      const h = TD.HEIGHT || 720;
      const cx = Math.max(96, Math.min(w - 96, pt.x));
      const cy = Math.max(76, Math.min(h - 140, pt.y));
      return {
        leftStr: ((cx / w) * 100).toFixed(2) + '%',
        topStr: ((cy / h) * 100).toFixed(2) + '%'
      };
    }

    _reprojectVisibleEarlyMarkers(g) {
      if (!g.map || !Array.isArray(g.map.entryPoints)) return;
      const entries = g.map.entryPoints;
      for (let i = 0; i < this._earlyMarkers.length && i < entries.length; i++) {
        const m = this._earlyMarkers[i];
        if (m.btn.classList.contains('is-hidden')) continue;
        const pos = this._computeEarlyMarkerPos(g, entries[i]);
        if (m.left !== pos.leftStr || m.top !== pos.topStr) {
          m.left = pos.leftStr;
          m.top = pos.topStr;
          m.btn.style.left = pos.leftStr;
          m.btn.style.top = pos.topStr;
        }
      }
    }

    _syncEarlyWaveMarkers(g) {
      const canCall = !!(
        (g.state === 'playing' || g.state === 'paused') &&
        g.enemies &&
        typeof g.enemies.canCallEarly === 'function' &&
        g.enemies.canCallEarly(g) &&
        g.map &&
        Array.isArray(g.map.entryPoints) &&
        g.map.entryPoints.length > 0
      );

      if (!canCall) {
        this._hideAllEarlyMarkers();
        return;
      }

      const bonus = typeof g.enemies.getEarlyCallBonus === 'function'
        ? (g.enemies.getEarlyCallBonus(g) | 0)
        : 0;
      const nextWaveNum = (g.wave || 0) + 1;
      const labelText = bonus > 0
        ? ('Call Wave ' + nextWaveNum + ' (+' + bonus + 'g)')
        : ('Start Wave ' + nextWaveNum);

      const entries = g.map.entryPoints;

      while (this._earlyMarkers.length < entries.length) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'early-wave-marker';
        btn.innerHTML =
          '<span class="early-horn-icon">' + ICONS.horn + '</span>' +
          '<span class="early-wave-label tabular">Call Wave</span>';
        btn.addEventListener('pointerdown', (e) => e.stopPropagation());
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.game && typeof this.game.callWaveEarly === 'function') {
            this.game.callWaveEarly();
          }
        });
        this._els.earlyLayer.appendChild(btn);
        this._earlyMarkers.push({
          btn,
          labelEl: btn.querySelector('.early-wave-label'),
          left: '',
          top: '',
          text: ''
        });
      }

      for (let i = 0; i < this._earlyMarkers.length; i++) {
        const m = this._earlyMarkers[i];
        if (i >= entries.length) {
          m.btn.classList.add('is-hidden');
          continue;
        }
        const pos = this._computeEarlyMarkerPos(g, entries[i]);

        m.btn.classList.remove('is-hidden');
        if (m.left !== pos.leftStr || m.top !== pos.topStr) {
          m.left = pos.leftStr;
          m.top = pos.topStr;
          m.btn.style.left = pos.leftStr;
          m.btn.style.top = pos.topStr;
        }
        if (m.text !== labelText) {
          m.text = labelText;
          m.labelEl.textContent = labelText;
          m.btn.title = labelText;
        }
      }
    }

    _hideAllEarlyMarkers() {
      for (let i = 0; i < this._earlyMarkers.length; i++) {
        this._earlyMarkers[i].btn.classList.add('is-hidden');
      }
    }

    /* ========================================================================
     * DATA RESOLVERS & LEGACY FALLBACK HELPERS
     * ======================================================================== */

    _getTowerBaseInfo(typeKey) {
      const raw = (TD.TOWER_TYPES && TD.TOWER_TYPES[typeKey]) || {};
      const fb = TOWER_META_FALLBACK[typeKey] || TOWER_META_FALLBACK.elven;
      const t1 = raw.tier1 || (raw.tiers && raw.tiers[1]) || raw.t1 || {};
      return {
        name: raw.name || fb.name,
        cost: raw.cost || raw.baseCost || t1.cost || fb.cost,
        range: raw.range || t1.range || fb.range,
        minRange: raw.minRange !== undefined ? raw.minRange : (t1.minRange !== undefined ? t1.minRange : fb.minRange),
        damage: raw.damage || t1.damage || fb.damage,
        fireRate: raw.fireRate || t1.fireRate || fb.fireRate,
        dmgType: raw.dmgType || raw.damageType || fb.dmgType,
        canTargetFlying: raw.canTargetFlying !== undefined ? !!raw.canTargetFlying : fb.canTargetFlying,
        role: t1.desc || raw.summary || raw.desc || fb.role
      };
    }

    _getTowerUpgradePreview(tower, targetKey) {
      const fb = TOWER_META_FALLBACK[tower.type] || TOWER_META_FALLBACK.elven;
      const fbBranch = targetKey === 'T2' ? fb.t2 : (fb[targetKey] || fb.A);

      let raw = null;
      if (tower && typeof tower.getUpgradePreview === 'function') {
        try {
          raw = tower.getUpgradePreview(targetKey);
        } catch (_err) {
          raw = null;
        }
      }

      if (!raw) {
        return {
          name: fbBranch.name,
          cost: fbBranch.cost,
          range: fbBranch.range,
          minRange: fbBranch.minRange,
          desc: fbBranch.desc,
          skillName: fbBranch.skillName || '',
          skillCd: fbBranch.skillCd || 15,
          skillDesc: fbBranch.skillDesc || ''
        };
      }

      return {
        name: raw.name || fbBranch.name,
        cost: raw.cost !== undefined ? raw.cost : fbBranch.cost,
        range: raw.range || fbBranch.range,
        minRange: raw.minRange !== undefined ? raw.minRange : fbBranch.minRange,
        damage: raw.damage,
        fireRate: raw.fireRate,
        desc: raw.desc || raw.description || fbBranch.desc,
        skillName: raw.skillName || (raw.skill && raw.skill.name) || fbBranch.skillName || '',
        skillCd: raw.skillCooldown || raw.skillCd || (raw.skill && raw.skill.cooldown) || fbBranch.skillCd || 15,
        skillDesc: raw.skillDesc || (raw.skill && raw.skill.desc) || fbBranch.skillDesc || ''
      };
    }

    _getTowerSkillState(tower) {
      const fb = TOWER_META_FALLBACK[tower.type] || TOWER_META_FALLBACK.elven;
      const br = (tower.branch && fb[tower.branch]) ? fb[tower.branch] : fb.A;
      const cd = tower.skillCooldown !== undefined
        ? tower.skillCooldown
        : (tower.skillCd !== undefined
          ? tower.skillCd
          : (tower.skillTimer !== undefined ? tower.skillTimer : 0));
      const maxCd = tower.skillMaxCooldown || tower.skillMaxCd || (tower.skill && tower.skill.cooldown) || br.skillCd || 15;
      return { cd: Math.max(0, cd || 0), maxCd };
    }

    _drawTowerIcon(canvas, typeKey, tier, branch) {
      return this._renderTowerPortrait(canvas, typeKey, tier, branch);
    }

    _drawEnemyPortrait(canvas, typeKey) {
      return this._renderEnemyPortrait(canvas, typeKey);
    }

    _drawLegacyEnemyPortrait(canvas, typeKey) {
      if (!canvas || !canvas.getContext) return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      try {
        if (this.game && this.game.enemies && typeof this.game.enemies.renderPortrait === 'function') {
          this.game.enemies.renderPortrait(ctx, typeKey, w, h);
          return true;
        }
        if (TD.EnemyManager && typeof TD.EnemyManager.renderPortrait === 'function') {
          TD.EnemyManager.renderPortrait(ctx, typeKey, w, h);
          return true;
        }
      } catch (_err) {
        // Fallback handled by caller
      }
      return false;
    }
  }

  TD.UI = UI;
})(window.TD = window.TD || {});
