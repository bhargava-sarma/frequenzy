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
 * Two fixed surfaces, not a light/dark toggle.
 *
 * The player is ALWAYS the dark panel and the library is ALWAYS light paper.
 * These are roles, not themes — deliberately not wired to the OS color
 * scheme. `userInterfaceStyle` stays "light" in app.json for the same reason.
 */
export const color = {
  /** Light surface: library, lists, nav. */
  paper: '#EFECE4',
  /** Artwork placeholders, inactive fills. */
  paperDim: '#DCD8CB',
  /** Hairline borders on the light surface. */
  paperLine: '#D8D5C9',

  /** Dark surface: now playing, transport. */
  panel: '#1A1A18',
  /** Cards and artwork wells on the dark surface. */
  panelRaised: '#2C2C29',
  /** Hairline borders on the dark surface. */
  panelLine: '#3A3A36',

  /** On paper. */
  textPrimary: '#1A1A18',
  /** On paper, secondary/meta. */
  textSecondary: '#8C8B84',
  /** On panel. */
  textInverse: '#EFECE4',
  /** On panel, secondary/meta — same value reads correctly on both surfaces. */
  textInverseSecondary: '#8C8B84',

  /**
   * Burnt orange. Progress fill, primary action, active/favorited, selection.
   *
   * Meaning only, never decoration. If more than ~10% of a screen carries it,
   * it's being overused, and never more than one accent-filled control on
   * screen at a time.
   */
  accent: '#E8703A',
  /** Text/icon color when placed ON an accent fill. */
  accentInk: '#1A1A18',
} as const;

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
    textTransform: 'uppercase',
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
    fontVariant: ['tabular-nums'],
  },
} as const;

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
  /** Progress bar thickness. */
  progressHeight: 3,
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
  durationFast: 100,
  durationBase: 180,
  /** Snappy ease-out with no overshoot. Feed to Easing.bezier(...easing). */
  easing: [0.2, 0, 0.2, 1] as const,
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
