import { decode } from 'jpeg-js';

/**
 * Pulls a usable accent colour out of album artwork.
 *
 * Done in JavaScript rather than with a native colour-extraction module on
 * purpose: a native module means a new build every time, and this runs on a
 * 64px thumbnail that Navidrome already returns as JPEG at around 1.5 KB.
 * Decoding that costs a few milliseconds and needs no rebuild.
 *
 * The colour is then conditioned rather than used raw. A dominant colour taken
 * straight off a cover is frequently near-black, near-white, or so desaturated
 * it reads as a mistake, and it has to sit legibly on whichever surface the
 * user has chosen — so saturation and lightness are pinned into a band that
 * works on both palettes while the hue, which is the part that actually says
 * "this album", is left alone.
 */

export interface ArtworkAccent {
  /** Conditioned accent, safe as a fill on either surface. */
  accent: string;
  /** Text/icon colour to place on top of `accent`. */
  accentInk: string;
}

/** Cheap in-memory cache. Cover art ids are stable, so this never invalidates. */
const cache = new Map<string, ArtworkAccent>();
const inFlight = new Map<string, Promise<ArtworkAccent | null>>();

// ---------------------------------------------------------------------------
// Colour space
// ---------------------------------------------------------------------------

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;

  return { h, s, l };
}

function hslToHex({ h, s, l }: Hsl): string {
  const hue = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  let r: number;
  let g: number;
  let b: number;

  if (s === 0) {
    r = l;
    g = l;
    b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3);
    g = hue(p, q, h);
    b = hue(p, q, h - 1 / 3);
  }

  const byte = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

const INK_DARK = '#101010';
const INK_LIGHT = '#FFFFFF';

function luminance(hex: string): number {
  const v = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(v(1)) + 0.7152 * channel(v(3)) + 0.0722 * channel(v(5));
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Picks whichever ink actually contrasts better against this fill.
 *
 * A fixed luminance cut looks right until a fill lands near it, where both
 * inks are poor and the rule still confidently returns one — measured against
 * a sample of real covers the worst case came out at 3.0:1. Comparing the two
 * candidates can't do worse than the better of them by definition.
 */
function pickInk(fill: string): string {
  return contrast(INK_DARK, fill) >= contrast(INK_LIGHT, fill) ? INK_DARK : INK_LIGHT;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/** Hue buckets, so near-identical shades vote together rather than splitting. */
const HUE_BUCKETS = 24;

/**
 * Picks the most present vivid hue.
 *
 * Weighted by saturation rather than by raw pixel count: album art is mostly
 * background, and counting alone reliably returns the black or white behind
 * the subject. Pixels too dark, too pale or too grey to carry a hue are
 * skipped entirely rather than dragged toward one.
 */
function dominantHue(pixels: Uint8Array, width: number, height: number): Hsl | null {
  const weights = new Float64Array(HUE_BUCKETS);
  const satSums = new Float64Array(HUE_BUCKETS);
  const lightSums = new Float64Array(HUE_BUCKETS);
  const counts = new Float64Array(HUE_BUCKETS);

  const total = width * height;
  for (let i = 0; i < total; i++) {
    const offset = i * 4;
    const hsl = rgbToHsl(pixels[offset], pixels[offset + 1], pixels[offset + 2]);

    if (hsl.s < 0.18) continue;
    if (hsl.l < 0.12 || hsl.l > 0.92) continue;

    const bucket = Math.min(HUE_BUCKETS - 1, Math.floor(hsl.h * HUE_BUCKETS));
    const weight = hsl.s * hsl.s;

    weights[bucket] += weight;
    satSums[bucket] += hsl.s;
    lightSums[bucket] += hsl.l;
    counts[bucket] += 1;
  }

  let best = -1;
  let bestWeight = 0;
  for (let i = 0; i < HUE_BUCKETS; i++) {
    if (weights[i] > bestWeight) {
      bestWeight = weights[i];
      best = i;
    }
  }

  if (best < 0 || counts[best] === 0) return null;

  return {
    h: (best + 0.5) / HUE_BUCKETS,
    s: satSums[best] / counts[best],
    l: lightSums[best] / counts[best],
  };
}

/**
 * Forces the extracted colour into a band that reads on both surfaces.
 *
 * Only the hue survives untouched. A pastel cover would otherwise give an
 * accent invisible on paper, and a near-black one an accent invisible on
 * panel; clamping both ends means every album gets a colour of its own that
 * still behaves like an accent.
 *
 * The band is deliberately washed out — high lightness, modest saturation.
 * Fully saturated album colours shout: a scarlet cover turns every control on
 * the screen scarlet, which reads as an alert rather than as a highlight. Held
 * near the top of the lightness range the hue is still obvious while the
 * colour behaves like tinted white.
 */
function condition(hsl: Hsl, mode: 'light' | 'dark'): ArtworkAccent {
  const s =
    mode === 'dark'
      ? Math.min(0.45, Math.max(0.22, hsl.s * 0.6))
      : Math.min(0.5, Math.max(0.28, hsl.s * 0.7));

  /**
   * Pale on dark so it reads as light tinted by the cover; deeper on the light
   * palette, where a pale fill would vanish into paper.
   *
   * Both bands deliberately avoid the middle of the lightness range. A fill
   * sitting there contrasts poorly with black and white alike, so there is no
   * ink that reads well on it — the fix is to not produce one.
   */
  const l =
    mode === 'dark'
      ? Math.min(0.86, Math.max(0.74, hsl.l + 0.25))
      : Math.min(0.46, Math.max(0.34, hsl.l - 0.08));

  const accent = hslToHex({ h: hsl.h, s, l });
  return { accent, accentInk: pickInk(accent) };
}

/**
 * Fetches the thumbnail and extracts an accent, or null if anything fails.
 *
 * Failure is always non-fatal: the caller falls back to the fixed accent, and
 * a cover that won't decode is not worth an error anywhere in the UI.
 */
export async function extractAccent(
  url: string,
  cacheKey: string,
  mode: 'light' | 'dark',
): Promise<ArtworkAccent | null> {
  const key = `${cacheKey}:${mode}`;

  const cached = cache.get(key);
  if (cached) return cached;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const work = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;

      const buffer = await response.arrayBuffer();
      // useTArray keeps the output as a Uint8Array rather than a Buffer shim,
      // which React Native does not provide.
      const image = decode(new Uint8Array(buffer), { useTArray: true });

      const hsl = dominantHue(image.data, image.width, image.height);
      if (!hsl) return null;

      const accent = condition(hsl, mode);
      cache.set(key, accent);
      return accent;
    } catch {
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, work);
  return work;
}
