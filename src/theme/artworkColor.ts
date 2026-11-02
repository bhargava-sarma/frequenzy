import { decode } from 'jpeg-js';

import { clamp, contrast, hslToHex, pickInk, rgbToHsl, type Hsl } from './color';
import type { ArtworkPalette, ThemeMode } from './tokens';

/**
 * Pulls usable colour out of album artwork: one accent, plus a four-colour
 * palette the background mesh is painted from.
 *
 * Done in JavaScript rather than with a native colour-extraction module on
 * purpose: a native module means a new build every time, and this runs on a
 * 64px thumbnail that Navidrome already returns as JPEG at around 1.5 KB.
 * Decoding that costs a few milliseconds and needs no rebuild.
 *
 * Colours are conditioned rather than used raw. A colour taken straight off a
 * cover is frequently near-black, near-white, or so desaturated it reads as a
 * mistake, and it has to sit well on whichever theme the user has chosen — so
 * saturation and lightness are pinned into bands per role while the hue,
 * which is the part that actually says "this album", is left alone.
 *
 * The cover is decoded and analysed once per cover art id. Conditioning for a
 * theme is cheap and cached separately, so switching theme never refetches.
 */

export type { ArtworkPalette };

export interface ArtworkAccent {
  /** Conditioned accent, legible as text on the theme's ground and as a fill. */
  accent: string;
  /** Text/icon colour to place on top of `accent`. */
  accentInk: string;
}

export interface ArtworkColors {
  /** Null when the cover has no usable hue — the fixed accent stays. */
  accent: ArtworkAccent | null;
  /** Always present: a monochrome cover yields a neutral palette. */
  palette: ArtworkPalette;
}

// ---------------------------------------------------------------------------
// Analysis (theme-independent, once per cover)
// ---------------------------------------------------------------------------

/** Hue buckets, so near-identical shades vote together rather than splitting. */
const HUE_BUCKETS = 24;

/** Buckets two hues must be apart to count as different colours (≈45°). */
const DISTINCT_BUCKETS = 3;

interface Analysis {
  /** Most present vivid hue, weighted by saturation. */
  vibrant: Hsl | null;
  /** Hue covering the most pixels. */
  dominant: Hsl | null;
  /** Most present hue distinct from both of the above. */
  secondary: Hsl | null;
  /** Hue of the cover's dark regions. */
  dark: Hsl | null;
  /** Mean lightness, used to shape a neutral palette for monochrome covers. */
  meanLightness: number;
}

function bucketOf(h: number): number {
  return Math.min(HUE_BUCKETS - 1, Math.floor(h * HUE_BUCKETS));
}

function bucketDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, HUE_BUCKETS - d);
}

function averaged(bucket: number, sats: Float64Array, lights: Float64Array, counts: Float64Array): Hsl {
  return {
    h: (bucket + 0.5) / HUE_BUCKETS,
    s: sats[bucket] / counts[bucket],
    l: lights[bucket] / counts[bucket],
  };
}

/**
 * One pass over the pixels, several votes.
 *
 * The vivid vote is weighted by saturation squared, as the accent always was:
 * album art is mostly background, and counting alone reliably returns the
 * black or white behind the subject. The dominant vote counts pixels, because
 * the mesh should also carry the colour the cover is mostly made of. Pixels
 * too dark, too pale or too grey to carry a hue are skipped rather than
 * dragged toward one.
 */
function analyse(pixels: Uint8Array, width: number, height: number): Analysis {
  const vivid = new Float64Array(HUE_BUCKETS);
  const population = new Float64Array(HUE_BUCKETS);
  const sats = new Float64Array(HUE_BUCKETS);
  const lights = new Float64Array(HUE_BUCKETS);
  const counts = new Float64Array(HUE_BUCKETS);

  const darkWeights = new Float64Array(HUE_BUCKETS);
  const darkSats = new Float64Array(HUE_BUCKETS);
  const darkLights = new Float64Array(HUE_BUCKETS);
  const darkCounts = new Float64Array(HUE_BUCKETS);

  let lightnessSum = 0;
  const total = width * height;

  for (let i = 0; i < total; i++) {
    const offset = i * 4;
    const hsl = rgbToHsl(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    lightnessSum += hsl.l;

    if (hsl.s < 0.12) continue;
    const bucket = bucketOf(hsl.h);

    if (hsl.l >= 0.06 && hsl.l < 0.38 && hsl.s >= 0.15) {
      darkWeights[bucket] += hsl.s;
      darkSats[bucket] += hsl.s;
      darkLights[bucket] += hsl.l;
      darkCounts[bucket] += 1;
    }

    if (hsl.l < 0.1 || hsl.l > 0.94) continue;

    population[bucket] += 1;
    if (hsl.s >= 0.18 && hsl.l >= 0.12 && hsl.l <= 0.92) vivid[bucket] += hsl.s * hsl.s;
    sats[bucket] += hsl.s;
    lights[bucket] += hsl.l;
    counts[bucket] += 1;
  }

  const argmax = (weights: Float64Array, skip?: (bucket: number) => boolean) => {
    let best = -1;
    let bestWeight = 0;
    for (let b = 0; b < HUE_BUCKETS; b++) {
      if (skip?.(b)) continue;
      if (weights[b] > bestWeight) {
        bestWeight = weights[b];
        best = b;
      }
    }
    return best;
  };

  // A bucket with only a handful of pixels is a highlight or noise, not a
  // colour the cover is made of.
  const minPopulation = total * 0.01;

  const vibrantBucket = argmax(vivid);
  const dominantBucket = argmax(population);
  const secondaryBucket = argmax(
    population,
    (b) =>
      population[b] < minPopulation ||
      (vibrantBucket >= 0 && bucketDistance(b, vibrantBucket) < DISTINCT_BUCKETS) ||
      (dominantBucket >= 0 && bucketDistance(b, dominantBucket) < DISTINCT_BUCKETS),
  );
  const darkBucket = argmax(darkWeights);

  return {
    vibrant: vibrantBucket >= 0 ? averaged(vibrantBucket, sats, lights, counts) : null,
    dominant:
      dominantBucket >= 0 && population[dominantBucket] >= minPopulation
        ? averaged(dominantBucket, sats, lights, counts)
        : null,
    secondary: secondaryBucket >= 0 ? averaged(secondaryBucket, sats, lights, counts) : null,
    dark: darkBucket >= 0 ? averaged(darkBucket, darkSats, darkLights, darkCounts) : null,
    meanLightness: total > 0 ? lightnessSum / total : 0.5,
  };
}

// ---------------------------------------------------------------------------
// Conditioning (per theme)
// ---------------------------------------------------------------------------

/**
 * Forces the vivid hue into an accent that is still vivid but legible.
 *
 * The accent is used as text (the playing row's title) on the theme's ground
 * as well as a fill, so lightness is walked until it clears a contrast floor
 * against that ground. Hue survives untouched; a yellow cover on the light
 * theme ends up as a deep ochre rather than an invisible yellow.
 */
function conditionAccent(hsl: Hsl, mode: ThemeMode): ArtworkAccent {
  const s = clamp(hsl.s * 1.1, 0.55, 0.9);

  if (mode === 'dark') {
    let l = clamp(hsl.l, 0.56, 0.68);
    let hex = hslToHex({ h: hsl.h, s, l });
    while (contrast(hex, '#000000') < 5.5 && l < 0.82) {
      l += 0.02;
      hex = hslToHex({ h: hsl.h, s, l });
    }
    return { accent: hex, accentInk: pickInk(hex) };
  }

  let l = clamp(hsl.l, 0.36, 0.5);
  let hex = hslToHex({ h: hsl.h, s, l });
  // Measured against the light theme's ground, not pure white: it is a few
  // percent darker, and a colour that clears white can miss on it.
  while (contrast(hex, '#ECEBE7') < 3.8 && l > 0.22) {
    l -= 0.02;
    hex = hslToHex({ h: hsl.h, s, l });
  }
  return { accent: hex, accentInk: pickInk(hex) };
}

interface Band {
  s: [number, number];
  l: [number, number];
}

/**
 * Saturation and lightness bands per mesh role.
 *
 * On black the mesh is rich and mid-dark, so white text over it stays
 * readable and the blobs glow rather than glare. On white it is pastel, so
 * black text stays readable and the ground still reads as white.
 */
const MESH_BANDS: Record<ThemeMode, Record<keyof ArtworkPalette, Band>> = {
  dark: {
    vibrant: { s: [0.55, 0.9], l: [0.45, 0.6] },
    dominant: { s: [0.4, 0.8], l: [0.34, 0.5] },
    muted: { s: [0.25, 0.6], l: [0.3, 0.46] },
    deep: { s: [0.35, 0.7], l: [0.14, 0.24] },
  },
  light: {
    vibrant: { s: [0.55, 0.9], l: [0.62, 0.72] },
    dominant: { s: [0.45, 0.8], l: [0.7, 0.8] },
    muted: { s: [0.3, 0.65], l: [0.78, 0.87] },
    deep: { s: [0.4, 0.75], l: [0.5, 0.6] },
  },
};

function inBand(hsl: Hsl, band: Band): string {
  return hslToHex({
    h: hsl.h,
    s: hsl.s === 0 ? 0 : clamp(hsl.s, band.s[0], band.s[1]),
    l: clamp(hsl.l, band.l[0], band.l[1]),
  });
}

function rotate(hsl: Hsl, turns: number): Hsl {
  return { ...hsl, h: (hsl.h + turns + 1) % 1 };
}

/**
 * Builds the four mesh colours, filling gaps from what the cover did have.
 *
 * A cover with one hue still gets a mesh that moves: the missing roles are
 * neighbouring hues of the one it has, which reads as a single colour with
 * depth rather than as unrelated colours invented for it. A cover with no hue
 * at all gets greys — a black-and-white cover should not glow pink.
 */
function conditionPalette(analysis: Analysis, mode: ThemeMode): ArtworkPalette {
  const bands = MESH_BANDS[mode];
  const anchor = analysis.vibrant ?? analysis.dominant ?? analysis.secondary ?? analysis.dark;

  if (!anchor) {
    const grey = (l: number): Hsl => ({ h: 0, s: 0, l });
    const base = analysis.meanLightness;
    return {
      vibrant: inBand(grey(base), bands.vibrant),
      dominant: inBand(grey(base - 0.05), bands.dominant),
      muted: inBand(grey(base + 0.05), bands.muted),
      deep: inBand(grey(0), bands.deep),
    };
  }

  const vibrant = analysis.vibrant ?? anchor;
  const dominant = analysis.dominant ?? rotate(anchor, -1 / 24);
  const muted = analysis.secondary ?? rotate(dominant, 1 / 12);
  const deep = analysis.dark ?? dominant;

  return {
    vibrant: inBand(vibrant, bands.vibrant),
    dominant: inBand(dominant, bands.dominant),
    muted: inBand(muted, bands.muted),
    deep: inBand(deep, bands.deep),
  };
}

// ---------------------------------------------------------------------------
// Caches and entry points
// ---------------------------------------------------------------------------

/**
 * Bounded so a long session through a big library can't grow these without
 * limit. Map iterates in insertion order, so the first key is the oldest.
 */
const MAX_CACHED_COVERS = 400;

function remember<V>(map: Map<string, V>, key: string, value: V) {
  map.set(key, value);
  while (map.size > MAX_CACHED_COVERS) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

/** Theme-independent analysis per cover art id. Null means the cover failed. */
const analysisCache = new Map<string, Analysis | null>();
const inFlight = new Map<string, Promise<Analysis | null>>();
/** Conditioned results per cover art id. */
const colorsCache = new Map<string, ArtworkColorSet>();

async function analysisFor(url: string, cacheKey: string): Promise<Analysis | null> {
  if (analysisCache.has(cacheKey)) return analysisCache.get(cacheKey) ?? null;

  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const work = (async () => {
    try {
      const response = await fetch(url);
      // Not cached: a network failure is worth retrying on the next play.
      if (!response.ok) return null;

      const buffer = await response.arrayBuffer();
      // useTArray keeps the output as a Uint8Array rather than a Buffer shim,
      // which React Native does not provide.
      const image = decode(new Uint8Array(buffer), { useTArray: true });
      const result = analyse(image.data, image.width, image.height);
      remember(analysisCache, cacheKey, result);
      return result;
    } catch {
      return null;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, work);
  return work;
}

/** Conditioned colours for both luminance families, from one analysis. */
export type ArtworkColorSet = Record<ThemeMode, ArtworkColors>;

/**
 * Fetches the thumbnail and returns the accent and mesh palette conditioned
 * for both light and dark grounds, or null if the cover could not be
 * fetched or decoded.
 *
 * Both are produced every time because both are used at once: the app may
 * be light while the player — always a dark, immersive face — needs the
 * dark conditioning of the same cover. Conditioning is a few arithmetic
 * passes over four colours; the decode is what costs, and it is cached.
 *
 * Failure is always non-fatal: the caller falls back to the preset accent
 * and a palette built from it.
 */
export async function extractArtworkColors(
  url: string,
  cacheKey: string,
): Promise<ArtworkColorSet | null> {
  const cached = colorsCache.get(cacheKey);
  if (cached) return cached;

  const analysis = await analysisFor(url, cacheKey);
  if (!analysis) return null;

  const build = (mode: ThemeMode): ArtworkColors => ({
    accent: analysis.vibrant ? conditionAccent(analysis.vibrant, mode) : null,
    palette: conditionPalette(analysis, mode),
  });
  const colors: ArtworkColorSet = { light: build('light'), dark: build('dark') };
  remember(colorsCache, cacheKey, colors);
  return colors;
}
