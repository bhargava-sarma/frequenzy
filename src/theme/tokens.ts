/**
 * Design tokens — the single source of truth for the visual language.
 *
 * The direction: a piece of portable audio hardware. Teenage Engineering's
 * industrial grid — monospaced labels, numbered sections, keycaps in a few
 * primary colours, one loud orange — on solid panels, with a retro black
 * display (dot-matrix numerals, a tape counter) as the place the music's
 * state is read from. Colour comes from the artwork and sits, still, behind
 * everything.
 *
 * Plain data plus a little colour arithmetic, no React Native imports, so it
 * stays liftable alongside `api/` and `types/`.
 */

import { contrast, ensureContrast, pickInk, rotateHue, withSl } from './color';

// ---------------------------------------------------------------------------
// 1. Colour
// ---------------------------------------------------------------------------

/** The concrete palettes. `black` is dark with a true-black OLED ground. */
export type ThemeName = 'light' | 'dark' | 'black';
/** The luminance family a palette belongs to. Drives materials and inks. */
export type ThemeMode = 'light' | 'dark';

export const modeOf = (name: ThemeName): ThemeMode => (name === 'light' ? 'light' : 'dark');

/**
 * Every colour is an opaque #rrggbb so withAlpha() can be applied to any of
 * them. Translucency is expressed at the use site, never baked into a token.
 */
export interface Palette {
  name: ThemeName;
  mode: ThemeMode;

  /** Screen ground. */
  background: string;
  /** Cards and panels resting on the ground. */
  surface: string;
  /** Keycaps and raised controls — the brightest (light) or lifted (dark) layer. */
  surfaceRaised: string;
  /** Wells, slider tracks, inputs: cut into the surface rather than on it. */
  surfaceSunken: string;
  /** Placeholders and skeleton blocks. */
  fill: string;
  /** Hairline separators. */
  separator: string;
  /** Stronger outlines: keycap edges, panel borders. */
  border: string;

  label: string;
  labelSecondary: string;
  labelTertiary: string;

  /** The black display inset — the same in every theme, like a real screen. */
  display: string;
  displayInk: string;
  /** Unlit segments and secondary readouts on the display. */
  displayDim: string;

  shadow: string;
  scrim: string;
  /** Text over the immersive artwork background. Always light. */
  onArtwork: string;

  destructive: string;
  /** Status LEDs. */
  ledGreen: string;
  ledAmber: string;
  ledRed: string;

  /** The dark grey keycap, TE's second key colour. */
  keyDark: string;
  keyDarkInk: string;

  /**
   * The one loud colour. Legible as text on `background` and as a fill under
   * `accentInk`. Either a preset or conditioned from the current cover.
   */
  accent: string;
  accentInk: string;
}

/** Fields every theme shares; accent is filled in at runtime. */
type Base = Omit<Palette, 'accent' | 'accentInk'>;

const display = {
  display: '#050505',
  displayInk: '#F4F2EC',
  displayDim: '#5C5A55',
};

const bases: Record<ThemeName, Base> = {
  /** Aluminium and paper: a warm light grey body, white keys, ink-black type. */
  light: {
    name: 'light',
    mode: 'light',
    background: '#ECEBE7',
    surface: '#F6F5F2',
    surfaceRaised: '#FFFFFF',
    surfaceSunken: '#E1E0DB',
    fill: '#DAD8D2',
    separator: '#D3D1CB',
    border: '#C4C2BB',
    label: '#141413',
    labelSecondary: '#5F5E59',
    labelTertiary: '#94928C',
    ...display,
    shadow: '#2A2925',
    scrim: '#0C0C0B',
    onArtwork: '#FFFFFF',
    destructive: '#D2261C',
    ledGreen: '#17A34A',
    ledAmber: '#E8930C',
    ledRed: '#E5372B',
    keyDark: '#2B2B2D',
    keyDarkInk: '#F4F2EC',
  },
  /** Graphite: anodised dark grey, lifted surfaces a few percent above it. */
  dark: {
    name: 'dark',
    mode: 'dark',
    background: '#0E0E0F',
    surface: '#18181A',
    surfaceRaised: '#232326',
    surfaceSunken: '#0A0A0B',
    fill: '#2A2A2D',
    separator: '#28282B',
    border: '#38383C',
    label: '#F2F1EC',
    labelSecondary: '#9D9C97',
    labelTertiary: '#64635F',
    ...display,
    shadow: '#000000',
    scrim: '#000000',
    onArtwork: '#FFFFFF',
    destructive: '#FF5247',
    ledGreen: '#38E07B',
    ledAmber: '#FFB020',
    ledRed: '#FF4D42',
    keyDark: '#2E2E32',
    keyDarkInk: '#F2F1EC',
  },
  /** True black so OLED pixels stay off; elevation is a whisper above it. */
  black: {
    name: 'black',
    mode: 'dark',
    background: '#000000',
    surface: '#0F0F10',
    surfaceRaised: '#1B1B1D',
    surfaceSunken: '#000000',
    fill: '#202022',
    separator: '#1F1F22',
    border: '#2E2E32',
    label: '#F2F1EC',
    labelSecondary: '#9A9994',
    labelTertiary: '#5F5E5A',
    ...display,
    shadow: '#000000',
    scrim: '#000000',
    onArtwork: '#FFFFFF',
    destructive: '#FF5247',
    ledGreen: '#38E07B',
    ledAmber: '#FFB020',
    ledRed: '#FF4D42',
    keyDark: '#262629',
    keyDarkInk: '#F2F1EC',
  },
};

// ---------------------------------------------------------------------------
// 1a. Accent presets — the keycap colours
// ---------------------------------------------------------------------------

export type AccentPreset =
  | 'orange'
  | 'red'
  | 'pink'
  | 'violet'
  | 'blue'
  | 'cyan'
  | 'green'
  | 'yellow'
  | 'mono';

/**
 * Two values per preset: the bright one sits on dark grounds, the deeper one
 * on the light ground where the bright one would fail as text. Both were
 * measured against the grounds above (WCAG ≥ 3.9 on light, ≥ 6 on dark).
 */
export const accentPresets: Record<AccentPreset, { label: string; dark: string; light: string }> = {
  orange: { label: 'Orange', dark: '#FF6B2C', light: '#CC4409' },
  red: { label: 'Red', dark: '#FF5247', light: '#D2261C' },
  pink: { label: 'Pink', dark: '#FF5C9E', light: '#C92A6C' },
  violet: { label: 'Violet', dark: '#A08BFF', light: '#6744E0' },
  blue: { label: 'Blue', dark: '#5B9BFF', light: '#1F5ED6' },
  cyan: { label: 'Cyan', dark: '#3CCFE4', light: '#0A7C8E' },
  green: { label: 'Green', dark: '#3ED57F', light: '#13824A' },
  yellow: { label: 'Yellow', dark: '#FFCC33', light: '#8F6200' },
  mono: { label: 'Mono', dark: '#F2F1EC', light: '#141413' },
};

export const ACCENT_PRESET_ORDER: AccentPreset[] = [
  'orange',
  'red',
  'pink',
  'violet',
  'blue',
  'cyan',
  'green',
  'yellow',
  'mono',
];

export interface AccentPair {
  accent: string;
  accentInk: string;
}

export function presetAccent(preset: AccentPreset, mode: ThemeMode): AccentPair {
  const accent = accentPresets[preset][mode];
  return { accent, accentInk: pickInk(accent) };
}

/**
 * Builds a palette for a theme with a given accent.
 *
 * The accent is re-checked against this theme's ground: an artwork accent
 * conditioned for "dark" is also used on the true-black theme, and a
 * colour that was legible on one ground is pulled until it is on this one.
 */
export function buildPalette(name: ThemeName, accent: AccentPair): Palette {
  const base = bases[name];
  const minimum = base.mode === 'light' ? 3.6 : 4.5;
  const legible =
    contrast(accent.accent, base.background) >= minimum
      ? accent.accent
      : ensureContrast(accent.accent, base.background, minimum);
  return {
    ...base,
    accent: legible,
    accentInk: legible === accent.accent ? accent.accentInk : pickInk(legible),
  };
}

/** Static default for the few places that run outside React. */
export const defaultPalette = buildPalette('dark', presetAccent('orange', 'dark'));

/**
 * Applies an alpha to a #rrggbb token.
 *
 * React Native accepts #rrggbbaa, so this stays a plain string. Only pass
 * 6-digit colours — every palette and artwork colour is one.
 */
export function withAlpha(hex: string, alpha: number): string {
  const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex.slice(0, 7)}${byte}`;
}

// ---------------------------------------------------------------------------
// 1b. Artwork palette
// ---------------------------------------------------------------------------

/**
 * Four colours from a cover, conditioned for a theme, that the ambient mesh
 * is painted from. Four rather than one: a single hue at several opacities
 * reads as a tinted screen, while a few related colours side by side read
 * as light coming off the record.
 */
export interface ArtworkPalette {
  /** The most saturated colour. The mesh's brightest blob. */
  vibrant: string;
  /** The colour covering most of the cover. */
  dominant: string;
  /** A softer, distinct hue that keeps the mesh from being monochrome. */
  muted: string;
  /** A dark anchor. Grounds the immersive backdrop. */
  deep: string;
}

/**
 * The mesh when nothing is playing or artwork colour is off: built from the
 * accent, so a blue accent gets a blue room rather than a stray orange one.
 */
export function fallbackArtworkPalette(accent: string, mode: ThemeMode): ArtworkPalette {
  if (mode === 'dark') {
    return {
      vibrant: withSl(accent, 0.85, 0.55),
      dominant: withSl(rotateHue(accent, -0.05), 0.7, 0.36),
      muted: withSl(rotateHue(accent, 0.18), 0.45, 0.34),
      deep: withSl(rotateHue(accent, -0.03), 0.55, 0.12),
    };
  }
  return {
    vibrant: withSl(accent, 0.85, 0.68),
    dominant: withSl(rotateHue(accent, -0.05), 0.7, 0.78),
    muted: withSl(rotateHue(accent, 0.18), 0.5, 0.86),
    deep: withSl(rotateHue(accent, -0.03), 0.6, 0.58),
  };
}

// ---------------------------------------------------------------------------
// 2. Typography
// ---------------------------------------------------------------------------

/**
 * Space Grotesk for words, Space Mono for labels and figures, Doto for the
 * dot-matrix display. Loaded from assets/fonts in App.tsx; these names must
 * match the keys passed to useFonts, or RN silently falls back to the
 * platform face.
 *
 * Android does not synthesise weights from a custom family, so each weight
 * is its own family name and `fontWeight` must never be set alongside these.
 *
 * Space Mono is monospaced, so every figure set in it holds its column
 * while a timer runs — no tabular-nums feature needed.
 */
export const fontFamily = {
  regular: 'SpaceGrotesk_400Regular',
  medium: 'SpaceGrotesk_500Medium',
  semibold: 'SpaceGrotesk_600SemiBold',
  bold: 'SpaceGrotesk_700Bold',
  mono: 'SpaceMono_400Regular',
  monoBold: 'SpaceMono_700Bold',
  dot: 'Doto_900Black',
} as const;

/**
 * The scale. Sentence case for words; mono labels are uppercase and tracked
 * out, the way hardware is labelled. No lineHeight on single-line styles:
 * a fixed line height below the face's natural one clips ascenders on
 * Android. Set one at the use site for paragraphs.
 */
export const type = {
  /** Greeting on Home. */
  hero: { fontFamily: fontFamily.bold, fontSize: 36, letterSpacing: -1.4 },
  /** Screen titles: "Library". */
  largeTitle: { fontFamily: fontFamily.bold, fontSize: 32, letterSpacing: -1.1 },
  /** Hero titles: album and artist names. */
  title1: { fontFamily: fontFamily.bold, fontSize: 26, letterSpacing: -0.8 },
  /** Section titles. */
  title2: { fontFamily: fontFamily.bold, fontSize: 20, letterSpacing: -0.5 },
  /** Player track title, sheet titles. */
  title3: { fontFamily: fontFamily.semibold, fontSize: 18, letterSpacing: -0.3 },
  /** Emphasised row text, nav bar titles. */
  headline: { fontFamily: fontFamily.semibold, fontSize: 16, letterSpacing: -0.2 },
  /** Row titles and standard UI text. */
  body: { fontFamily: fontFamily.medium, fontSize: 15, letterSpacing: -0.1 },
  /** Paragraphs. */
  bodyRegular: { fontFamily: fontFamily.regular, fontSize: 15, letterSpacing: -0.05 },
  /** Quieter emphasis. */
  callout: { fontFamily: fontFamily.medium, fontSize: 14, letterSpacing: -0.05 },
  /** Row subtitles. */
  subhead: { fontFamily: fontFamily.regular, fontSize: 13.5, letterSpacing: 0 },
  /** Hints and explanations. */
  footnote: { fontFamily: fontFamily.regular, fontSize: 12.5, letterSpacing: 0 },
  /** Tile subtitles. */
  caption: { fontFamily: fontFamily.medium, fontSize: 12, letterSpacing: 0 },

  /** Hardware labels: section numbers, spec plates, button legends. */
  label: {
    fontFamily: fontFamily.mono,
    fontSize: 10.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase' as const,
  },
  labelBold: {
    fontFamily: fontFamily.monoBold,
    fontSize: 10.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase' as const,
  },
  /** Keycap legends. */
  key: {
    fontFamily: fontFamily.monoBold,
    fontSize: 11.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  /** Figures: timers, counts, durations. */
  mono: { fontFamily: fontFamily.mono, fontSize: 12, letterSpacing: 0 },
  monoLarge: { fontFamily: fontFamily.monoBold, fontSize: 14, letterSpacing: 0 },
  /** Dot-matrix display readouts. Latin and figures only — never titles. */
  dot: { fontFamily: fontFamily.dot, fontSize: 24, letterSpacing: 1 },
  dotLarge: { fontFamily: fontFamily.dot, fontSize: 40, letterSpacing: 1 },
};

// ---------------------------------------------------------------------------
// 3. Spacing — 4pt base unit
// ---------------------------------------------------------------------------

export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 32,
  8: 40,
  9: 48,
  10: 64,
} as const;

export const layout = {
  /** Screen gutter. TE's grid is tight; 16 keeps a phone's width usable. */
  screenPadding: space[4],
  panelPadding: space[4],
  /**
   * List row height. Every row a list renders with getItemLayout must be
   * exactly this tall, skeletons included.
   */
  rowHeight: 62,
  thumbSize: 46,
  /** Corner radius of the floating dock and the cards that echo it. */
  dockRadius: 30,
  navBarHeight: 52,
  /** How far a list scrolls before the compact bar is fully in. */
  headerCollapseDistance: 64,
  /** Standard control height: keycaps, search field. */
  controlHeight: 48,
  pillHeight: 34,
  minTapTarget: 44,
  dockMargin: space[3],
  sectionGap: space[7],
  tileGap: space[3],
} as const;

// ---------------------------------------------------------------------------
// 4. Corner radius
// ---------------------------------------------------------------------------

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 30,
  full: 999,
} as const;

/** Hairline separators. Strokes that must read as edges use `stroke`. */
export const hairline = 0.5;
export const stroke = 1;

// ---------------------------------------------------------------------------
// 5. Motion
// ---------------------------------------------------------------------------

/**
 * Motion has a job everywhere it appears: it answers a touch, shows where
 * something came from, or carries the eye across a change. Durations are
 * short — nothing here is watched, only felt — and leaving is quicker than
 * arriving. Springs are reserved for things a finger moves or a selection
 * that travels; see theme/motion.ts for the curves.
 */
export const motion = {
  /** A key or tile going down under the finger. */
  durationPress: 70,
  /** Switches, selection changes, small things settling. */
  durationFast: 140,
  /** Content arriving: a list fading in once it has loaded. */
  durationAppear: 260,
  /** Sheets, the player and its panels arriving. */
  durationBase: 320,
  /** The same surfaces leaving. */
  durationExit: 210,
  /** The background following a new cover. */
  durationCrossfade: 420,
  /** Decelerating: fast off the mark, easing into place. */
  easing: [0.2, 0.8, 0.2, 1] as const,
  /** For surfaces that travel: a touch of ease-in so they don't lurch. */
  easingEmphasized: [0.2, 0, 0, 1] as const,
} as const;

// ---------------------------------------------------------------------------
// 6. Iconography
// ---------------------------------------------------------------------------

export const icon = {
  strokeWidth: 1.75,
  size: 22,
  sizeSmall: 18,
  sizeTiny: 15,
  sizeLarge: 28,
  sizeHero: 34,
} as const;
