/**
 * Design tokens — the single source of truth for the visual language.
 *
 * Transcribed from design-spec.md. Screens must pull from here rather than
 * hardcoding values, so the web app phase can consume the same tokens.
 *
 * This file is plain data with no React Native imports beyond types, keeping
 * it liftable into a shared package alongside `api/` and `types/`.
 */

// ---------------------------------------------------------------------------
// 1. Color
// ---------------------------------------------------------------------------

/**
 * Two surfaces, in two palettes.
 *
 * `paper` and `panel` are structural roles — the ground a screen sits on, and
 * the raised surface transport lives on — not descriptions of brightness. That
 * is what lets one set of components serve both palettes: every screen already
 * says "I am paper" or "I am panel", so switching theme only swaps values.
 *
 * The light palette is the design spec's original: library on paper, player on
 * a dark panel. The dark palette re-grounds the same split, with paper as the
 * app floor and panel a step above it. Note that panel is DARKER than paper in
 * light mode and LIGHTER in dark mode; in both cases it reads as a distinct
 * piece of hardware, which is the property that matters.
 *
 * The accent is identical in both. One hue, by design.
 */
export interface Palette {
  /** App floor: library, lists, nav. */
  paper: string;
  /** Artwork placeholders, inactive fills. */
  paperDim: string;
  /** Hairline borders on the floor. */
  paperLine: string;
  /** The other surface: now playing, transport, mini-player. */
  panel: string;
  /** Cards and artwork wells on that surface. */
  panelRaised: string;
  /** Hairline borders on that surface. */
  panelLine: string;
  /** On the floor. */
  textPrimary: string;
  /** On the floor, secondary/meta. */
  textSecondary: string;
  /** On the panel. */
  textInverse: string;
  /** On the panel, secondary/meta. */
  textInverseSecondary: string;
  /**
   * Burnt orange. Progress fill, primary action, active/favorited, selection.
   *
   * Meaning only, never decoration. If more than ~10% of a screen carries it,
   * it's being overused, and never more than one accent-filled control on
   * screen at a time.
   */
  accent: string;
  /** Text/icon color when placed ON an accent fill. */
  accentInk: string;
}

export const palettes: Record<'light' | 'dark', Palette> = {
  light: {
    paper: '#EFECE4',
    paperDim: '#DCD8CB',
    paperLine: '#D8D5C9',
    panel: '#1A1A18',
    panelRaised: '#2C2C29',
    panelLine: '#3A3A36',
    textPrimary: '#1A1A18',
    textSecondary: '#8C8B84',
    textInverse: '#EFECE4',
    textInverseSecondary: '#8C8B84',
    accent: '#E8703A',
    accentInk: '#1A1A18',
  },
  /**
   * True black, for OLED panels.
   *
   * paper is #000000 so unlit pixels stay unlit; panel is only a few percent
   * above it, which is enough to separate the dock and the player from the
   * ground without lighting up a whole surface. The hairlines carry most of
   * the structure at this contrast, so they are proportionally brighter than
   * their light-palette counterparts.
   */
  dark: {
    paper: '#000000',
    paperDim: '#101010',
    paperLine: '#212121',
    panel: '#101010',
    panelRaised: '#1C1C1C',
    panelLine: '#303030',
    textPrimary: '#EFECE4',
    textSecondary: '#8C8B84',
    textInverse: '#EFECE4',
    textInverseSecondary: '#8C8B84',
    accent: '#E8703A',
    accentInk: '#1A1A18',
  },
};

/**
 * Static fallback for the few places that run outside React — the navigation
 * theme's initial value, and any module-scope default. Anything rendered
 * inside the app must read the live palette through useTheme() instead, or it
 * will not follow the toggle.
 */
export const color = palettes.dark;

// ---------------------------------------------------------------------------
// 2. Typography
// ---------------------------------------------------------------------------

/**
 * Inter, two weights only. Loaded via @expo-google-fonts/inter; these names
 * must match the keys passed to useFonts, or RN silently falls back to the
 * platform face and the tracking looks wrong.
 */
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
} as const;

/**
 * The spec expresses tracking in em; React Native's letterSpacing is absolute
 * points. Values below are already multiplied out against their font size —
 * e.g. label is 0.08em at 11px = 0.88.
 */
export const type = {
  /** Track title on Now Playing. */
  display: {
    fontFamily: fontFamily.medium,
    fontSize: 20,
    letterSpacing: 0,
  },
  /** Album/playlist titles, list primary text. */
  title: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    letterSpacing: 0,
  },
  /** List rows, standard UI text. */
  body: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    letterSpacing: 0,
  },
  /**
   * Section headers: "NOW PLAYING", "LIBRARY".
   * ALWAYS uppercase — this is the strongest "panel" signal in the design.
   * Titles and body stay sentence case; uppercasing everything reads as
   * shouting rather than as hardware.
   */
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.88,
    // Pinned to the literal so it satisfies TextStyle's union rather than
    // widening to string.
    textTransform: 'uppercase' as const,
  },
  /** Artist name, secondary row text. */
  meta: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    letterSpacing: 0.36,
  },
  /** Timestamps and counters. Always paired with tabular figures. */
  numeral: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    letterSpacing: 0.55,
    // Mutable tuple, not `as const`: React Native's TextStyle declares
    // fontVariant as a mutable array and rejects a readonly one.
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
};

// ---------------------------------------------------------------------------
// 3. Spacing — 8px base unit, everything snaps to it
// ---------------------------------------------------------------------------

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
} as const;

export const layout = {
  /** Screen padding, horizontal. */
  screenPadding: space[4],
  /** Card/panel internal padding. */
  panelPadding: space[4],
  /** List row height — 44px min tap target plus padding. */
  rowHeight: 56,
  /** Standard gap between stacked elements. */
  stackGap: space[3],
  /** Square thumbnail in a library row. */
  thumbSize: 40,
  /** Progress bar thickness. Nudged up from 3px so it is easier to grab. */
  progressHeight: 5,
  /** Fraction of screen width the Now Playing artwork occupies. */
  artworkWidthRatio: 0.8,
  /** Corner radius of the floating dock and the cards that echo it. */
  dockRadius: 16,
} as const;

// ---------------------------------------------------------------------------
// 4. Corner radius — tight, hardware faceplate rather than "app"
// ---------------------------------------------------------------------------

export const radius = {
  /** Buttons, pills, small chips. */
  sm: 4,
  /** Cards, artwork wells, the main panel container. */
  md: 6,
  /**
   * Genuinely circular controls only — play button, avatar, favorite toggle.
   * Never for rectangular cards or buttons.
   */
  full: 999,
} as const;

// ---------------------------------------------------------------------------
// 5. Motion — mechanical, toggle-switch feel
// ---------------------------------------------------------------------------

/**
 * No spring physics, no elastic or bounce easing anywhere. Play/pause icon
 * swaps are instant or a 100ms crossfade — never a scale bounce.
 */
export const motion = {
  /** Icon swaps, press feedback — should read as instant. */
  durationFast: 70,
  /** Row entrances, reveals, settling. */
  durationBase: 120,
  /** Screen transitions. */
  durationScreen: 180,
  /** Snappy ease-out with no overshoot. Feed to Easing.bezier(...easing). */
  easing: [0.2, 0, 0.2, 1] as const,
  /** How far a pressable sinks. Small enough to feel mechanical, not springy. */
  pressScale: 0.97,
} as const;

// ---------------------------------------------------------------------------
// 6. Iconography
// ---------------------------------------------------------------------------

/** Line-based, consistent stroke weight. Filled only for genuine filled states. */
export const icon = {
  strokeWidth: 1.5,
  /** Prev/next/play. */
  size: 20,
  /** Shuffle/repeat — smaller and dimmed when inactive. */
  sizeSmall: 18,
} as const;

/** Hairline borders — 0.5px per spec, not the platform default. */
export const hairline = 0.5;
