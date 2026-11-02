/**
 * Colour arithmetic shared by the tokens, the artwork extractor and the
 * fallback palettes.
 *
 * Plain functions over `#rrggbb` strings, with no platform imports, so the
 * same code runs on device and under Node in the check scripts.
 */

export interface Hsl {
  /** 0-1 turns. */
  h: number;
  s: number;
  l: number;
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function rgbToHsl(r: number, g: number, b: number): Hsl {
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

export function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

export function hslToHex({ h, s, l }: Hsl): string {
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
    Math.round(clamp(v, 0, 1) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1-21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const INK_DARK = '#111111';
export const INK_LIGHT = '#FFFFFF';

/**
 * Whichever ink actually contrasts better against `fill`.
 *
 * A fixed luminance cut-off looks right until a fill lands near it, where
 * both inks are poor and the rule still confidently returns one. Comparing
 * the two candidates can't do worse than the better of them by definition.
 */
export function pickInk(fill: string): string {
  return contrast(INK_DARK, fill) >= contrast(INK_LIGHT, fill) ? INK_DARK : INK_LIGHT;
}

/** Rotates a colour's hue by `turns` (0-1), keeping saturation and lightness. */
export function rotateHue(hex: string, turns: number): string {
  const hsl = hexToHsl(hex);
  return hslToHex({ ...hsl, h: (hsl.h + turns + 1) % 1 });
}

/** Linear mix in sRGB. Good enough for UI tints; not for gradients of light. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const lerp = (x: number, y: number) =>
    Math.round(x + (y - x) * clamp(t, 0, 1))
      .toString(16)
      .padStart(2, '0');
  return `#${lerp(ar, br)}${lerp(ag, bg)}${lerp(ab, bb)}`;
}

/** Same hue, pinned saturation and lightness. */
export function withSl(hex: string, s: number, l: number): string {
  const hsl = hexToHsl(hex);
  return hslToHex({ h: hsl.h, s: hsl.s === 0 ? 0 : clamp(s, 0, 1), l: clamp(l, 0, 1) });
}

/**
 * Walks a colour's lightness until it reaches `ratio` against `ground`.
 *
 * Hue survives untouched — a yellow on a light ground ends up a deep ochre
 * rather than an invisible yellow — and the walk stops at a sensible bound
 * so a pathological input can never loop or reach black/white.
 */
export function ensureContrast(hex: string, ground: string, ratio: number): string {
  const hsl = hexToHsl(hex);
  const darken = luminance(ground) > 0.4;
  let l = hsl.l;
  let out = hex;
  for (let i = 0; i < 40 && contrast(out, ground) < ratio; i++) {
    l = darken ? l - 0.02 : l + 0.02;
    if (l <= 0.12 || l >= 0.9) break;
    out = hslToHex({ ...hsl, l });
  }
  return out;
}
