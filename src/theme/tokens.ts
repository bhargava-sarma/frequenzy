/**
 * Design tokens — the single source of truth for the visual language.
 *
 * Screens must pull from here rather than hardcoding values, so the web app
 * phase can consume the same tokens.
 *
 * This file is plain data with no React Native imports beyond types, keeping
 * it liftable into a shared package alongside `api/` and `types/`.
 *
 * The direction is Apple Music with liquid glass: a true-black or clean white
 * ground, colour pulled from the artwork into a drifting mesh behind
 * everything, translucent glass chrome floating over it, bold large titles,
 * and springs instead of fixed timings.
 *
 * Every name the previous design exported is still here. Screens that have
 * not been restyled keep compiling and pick up the new values; the legacy
 * palette roles are aliases of the new semantic ones rather than a second set
 * of colours that could drift apart.
 */

// ---------------------------------------------------------------------------
// 1. Color
// ---------------------------------------------------------------------------

export type ThemeName = 'light' | 'dark';

/**
 * Every colour is an opaque #rrggbb so withAlpha() can be applied to any of
 * them. Translucency is expressed at the use site (or through the glass
 * materials below), never baked into a token.
 */
export interface Palette {
  // --- Redesign roles. Prefer these in new and restyled code. -------------

  /** Screen ground. True black on dark so OLED pixels stay off. */
  background: string;
  /** Grouped cards and raised solid surfaces sitting on the ground. */
  backgroundElevated: string;
  /** Placeholder wells, slider tracks, skeleton blocks, inactive controls. */
  fill: string;
  /** A quieter fill for large areas, e.g. a grouped list's inset background. */
  fillSecondary: string;
  /** Hairline separators and quiet outlines. */
  separator: string;
  /** Primary text. */
  label: string;
  /** Secondary text: artist names, counts, metadata. */
  labelSecondary: string;
  /** Tertiary text: disabled labels, placeholder text, faint glyphs. */
  labelTertiary: string;
  /** Base colour of glass surfaces before the material's alpha is applied. */
  glassTint: string;
  /** Specular colour for the glass sheen and the bright top rim. */
  glassHighlight: string;
  /** Colour of the faint lower rim of a glass border. */
  glassEdge: string;
  /** Shadow colour for floating surfaces. */
  shadow: string;
  /** Dimming layer behind sheets and dialogs. Apply with withAlpha. */
  scrim: string;
  /** Text and glyphs placed over the immersive artwork background (dark). */
  onArtwork: string;
  /** Destructive actions: remove, sign out, clear. */
  destructive: string;

  // --- Legacy roles, kept so unrestyled screens still compile. ------------

  /** Alias of `background`. */
  paper: string;
  /** Alias of `fill`. */
  paperDim: string;
  /** Alias of `separator`. */
  paperLine: string;
  /** Alias of `backgroundElevated` — the surface transport used to live on. */
  panel: string;
  /** Raised well on `panel`. */
  panelRaised: string;
  /** Hairline on `panel`. */
  panelLine: string;
  /** Alias of `label`. */
  textPrimary: string;
  /** Alias of `labelSecondary`. */
  textSecondary: string;
  /**
   * Text on `panel`. In the old light palette panel was dark, so this was a
   * light colour; panels now follow the theme, so it matches `label`.
   */
  textInverse: string;
  /** Secondary text on `panel`. Matches `labelSecondary`. */
  textInverseSecondary: string;

  // --- Accent, shared by both eras. ---------------------------------------

  /**
   * Apple Music red when the artwork accent is off; a vibrant, contrast-checked
   * colour from the current cover when it is on. Progress fills, the primary
   * action, the playing row, selection.
   */
  accent: string;
  /** Text/icon colour when placed ON an accent fill. */
  accentInk: string;
}

/** The fixed accent: Apple Music's red-pink. */
export const brandAccent = '#FA2D48';

export const palettes: Record<ThemeName, Palette> = {
  light: {
    background: '#FFFFFF',
    backgroundElevated: '#F2F2F7',
    fill: '#E5E5EA',
    fillSecondary: '#F2F2F7',
    separator: '#D1D1D6',
    label: '#000000',
    labelSecondary: '#6E6E73',
    labelTertiary: '#AEAEB2',
    glassTint: '#FFFFFF',
    glassHighlight: '#FFFFFF',
    glassEdge: '#000000',
    shadow: '#000000',
    scrim: '#000000',
    onArtwork: '#FFFFFF',
    destructive: '#FF3B30',

    paper: '#FFFFFF',
    paperDim: '#E5E5EA',
    paperLine: '#D1D1D6',
    panel: '#F2F2F7',
    panelRaised: '#E5E5EA',
    panelLine: '#D1D1D6',
    textPrimary: '#000000',
    textSecondary: '#6E6E73',
    textInverse: '#000000',
    textInverseSecondary: '#6E6E73',

    accent: brandAccent,
    accentInk: '#FFFFFF',
  },
  /**
   * True black, for OLED panels.
   *
   * The ground is #000000 so unlit pixels stay unlit. Elevation comes from the
   * iOS dark greys a few percent above it, and colour comes from the artwork
   * mesh rather than from lifting the ground itself.
   */
  dark: {
    background: '#000000',
    backgroundElevated: '#1C1C1E',
    fill: '#2C2C2E',
    fillSecondary: '#1C1C1E',
    separator: '#38383A',
    label: '#FFFFFF',
    labelSecondary: '#9A9AA0',
    labelTertiary: '#636366',
    glassTint: '#1C1C1E',
    glassHighlight: '#FFFFFF',
    glassEdge: '#FFFFFF',
    shadow: '#000000',
    scrim: '#000000',
    onArtwork: '#FFFFFF',
    destructive: '#FF453A',

    paper: '#000000',
    paperDim: '#2C2C2E',
    paperLine: '#38383A',
    panel: '#1C1C1E',
    panelRaised: '#2C2C2E',
    panelLine: '#3A3A3C',
    textPrimary: '#FFFFFF',
    textSecondary: '#9A9AA0',
    textInverse: '#FFFFFF',
    textInverseSecondary: '#9A9AA0',

    accent: brandAccent,
    accentInk: '#FFFFFF',
  },
};

/**
 * Static fallback for the few places that run outside React — the navigation
 * theme's initial value, and any module-scope default. Anything rendered
 * inside the app must read the live palette through useTheme() instead, or it
 * will not follow the toggle.
 */
export const color = palettes.dark;

/**
 * Applies an alpha to a #rrggbb token.
 *
 * React Native accepts #rrggbbaa, so this stays a plain string rather than
 * needing rgba() plumbing through every style. Only pass 6-digit colours —
 * every palette and artwork colour is one.
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
 * Four colours taken from a cover, already conditioned for the active theme,
 * that the background mesh is painted from.
 *
 * Four rather than one because a single hue at several opacities reads as a
 * tinted screen; a few related colours drifting past each other is what makes
 * the background feel like it came out of the artwork.
 */
export interface ArtworkPalette {
  /** The most saturated, eye-catching colour. The mesh's brightest blob. */
  vibrant: string;
  /** The colour covering most of the cover. */
  dominant: string;
  /** A softer, distinct hue that keeps the mesh from being monochrome. */
  muted: string;
  /** A dark anchor. Grounds the mesh and paints the immersive backdrop. */
  deep: string;
}

/**
 * What the mesh uses when nothing is playing, the cover yields nothing, or the
 * artwork accent is switched off: Apple Music's red drifting into magenta and
 * violet.
 */
export const fallbackArtworkPalette: Record<ThemeName, ArtworkPalette> = {
  dark: {
    vibrant: '#FA2D48',
    dominant: '#B8176E',
    muted: '#5E2B8C',
    deep: '#2B0916',
  },
  light: {
    vibrant: '#FF7A8E',
    dominant: '#FFB0BE',
    muted: '#DCC3F5',
    deep: '#E8506A',
  },
};

// ---------------------------------------------------------------------------
// 1c. Glass materials
// ---------------------------------------------------------------------------

export type GlassVariant = 'regular' | 'thin' | 'prominent' | 'clear';

/**
 * How one glass variant is built, per theme. All alphas are 0-1.
 *
 * Two tint strengths exist because the same surface is drawn two ways: over a
 * real blur (where the blur does most of the separating and the tint can be
 * light) and faked without one (where the tint alone has to keep the content
 * behind from fighting the content on top).
 */
export interface GlassMaterial {
  /** Which palette colour tints the surface. */
  tintSource: 'glassTint' | 'glassHighlight';
  /** Tint alpha over a real blur. */
  blurTint: number;
  /** Tint alpha with no blur underneath. */
  fakeTint: number;
  /** Peak alpha of the specular sheen at the top edge. */
  sheen: number;
  /** Alpha of the bright top rim of the border. */
  borderTop: number;
  /** Alpha of the faint bottom rim of the border. */
  borderBottom: number;
  /** Shadow opacity when the surface floats. */
  shadow: number;
  /** Multiplier on the user's blur intensity. */
  blurScale: number;
}

export const glass: Record<ThemeName, Record<GlassVariant, GlassMaterial>> = {
  dark: {
    regular: {
      tintSource: 'glassTint',
      blurTint: 0.58,
      fakeTint: 0.86,
      sheen: 0.1,
      borderTop: 0.24,
      borderBottom: 0.05,
      shadow: 0.5,
      blurScale: 1,
    },
    thin: {
      tintSource: 'glassTint',
      blurTint: 0.4,
      fakeTint: 0.74,
      sheen: 0.08,
      borderTop: 0.2,
      borderBottom: 0.04,
      shadow: 0.35,
      blurScale: 0.75,
    },
    prominent: {
      tintSource: 'glassTint',
      blurTint: 0.76,
      fakeTint: 0.94,
      sheen: 0.12,
      borderTop: 0.28,
      borderBottom: 0.06,
      shadow: 0.55,
      blurScale: 1.25,
    },
    clear: {
      tintSource: 'glassHighlight',
      blurTint: 0.06,
      fakeTint: 0.1,
      sheen: 0.14,
      borderTop: 0.34,
      borderBottom: 0.08,
      shadow: 0.25,
      blurScale: 0.8,
    },
  },
  light: {
    regular: {
      tintSource: 'glassTint',
      blurTint: 0.62,
      fakeTint: 0.88,
      sheen: 0.5,
      borderTop: 0.9,
      borderBottom: 0.06,
      shadow: 0.12,
      blurScale: 1,
    },
    thin: {
      tintSource: 'glassTint',
      blurTint: 0.42,
      fakeTint: 0.76,
      sheen: 0.4,
      borderTop: 0.8,
      borderBottom: 0.05,
      shadow: 0.08,
      blurScale: 0.75,
    },
    prominent: {
      tintSource: 'glassTint',
      blurTint: 0.8,
      fakeTint: 0.95,
      sheen: 0.55,
      borderTop: 1,
      borderBottom: 0.08,
      shadow: 0.16,
      blurScale: 1.25,
    },
    clear: {
      tintSource: 'glassHighlight',
      blurTint: 0.16,
      fakeTint: 0.26,
      sheen: 0.45,
      borderTop: 0.85,
      borderBottom: 0.06,
      shadow: 0.1,
      blurScale: 0.8,
    },
  },
};

/** Stroke width of the luminous glass border. */
export const glassBorderWidth = 1;

// ---------------------------------------------------------------------------
// 2. Typography
// ---------------------------------------------------------------------------

/**
 * Manrope in five weights. Loaded from assets/fonts in App.tsx; these names
 * must match the keys passed to useFonts, or RN silently falls back to the
 * platform face.
 *
 * Android does not synthesise weights from a custom family, so each weight is
 * its own family name and `fontWeight` must never be used alongside these —
 * it would either do nothing or fake-bold an already bold face.
 *
 * Manrope carries true tabular figures, which the running timers depend on.
 */
export const fontFamily = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;

/**
 * Apple-style scale, sentence case throughout.
 *
 * Tracking is absolute points. Large sizes are pulled in because Manrope is
 * set wide, and a 34pt bold line at default tracking reads as loose next to
 * the platform faces this is imitating.
 *
 * No lineHeight: Manrope's natural metrics are generous, and a fixed line
 * height smaller than them clips ascenders on Android. Set one at the use
 * site only for multi-line paragraphs.
 */
export const type = {
  /** Screen titles: "Library", "Home". */
  largeTitle: {
    fontFamily: fontFamily.extrabold,
    fontSize: 34,
    letterSpacing: -0.8,
  },
  /** Hero titles: album name on the album screen, artist name. */
  title1: {
    fontFamily: fontFamily.extrabold,
    fontSize: 28,
    letterSpacing: -0.6,
  },
  /** Section headers: "Recently Played", "Top Songs". */
  title2: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    letterSpacing: -0.4,
  },
  /** Now Playing track title, sheet titles. */
  title3: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  /** Compact navigation bar title, emphasised row text, buttons. */
  headline: {
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    letterSpacing: -0.2,
  },
  /**
   * List row titles and standard UI text.
   *
   * Also the legacy `body` token, now larger: rows grew to fit it.
   */
  body: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    letterSpacing: -0.1,
  },
  /** Button labels and slightly quieter emphasis. */
  callout: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    letterSpacing: -0.1,
  },
  /** Row subtitles: artist, album · year. */
  subheadline: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    letterSpacing: 0,
  },
  /** Hints, footers, explanatory text. */
  footnote: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    letterSpacing: 0,
  },
  /** Tile subtitles, small metadata. */
  caption: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    letterSpacing: 0.1,
  },
  /** Badges and the tiniest labels. */
  caption2: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  /** Alias of `title2` under the name screens reach for. */
  sectionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    letterSpacing: -0.4,
  },
  /** Timestamps and counters. Tabular figures so running timers don't jitter. */
  numeral: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    letterSpacing: 0,
    // Mutable tuple, not `as const`: React Native's TextStyle declares
    // fontVariant as a mutable array and rejects a readonly one.
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  /** Larger tabular figures, e.g. Now Playing elapsed/remaining. */
  numeralLarge: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
    letterSpacing: 0,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },

  // --- Legacy names, remapped onto the new scale. -------------------------

  /** Legacy: track title on Now Playing. Now `title3`. */
  display: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  /** Legacy: album/playlist titles. Now `headline`. */
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    letterSpacing: -0.2,
  },
  /**
   * Legacy: section headers and small labels.
   *
   * No longer uppercase — the redesign sets headers in bold sentence case —
   * so callers passing sentence-case text now render it as written.
   */
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
    letterSpacing: 0,
  },
  /** Legacy: artist name, secondary row text. Now `subheadline`. */
  meta: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    letterSpacing: 0,
  },
};

// ---------------------------------------------------------------------------
// 3. Spacing — 4px base unit
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
  /** Screen padding, horizontal. */
  screenPadding: space[5],
  /** Card/panel/sheet internal padding. */
  panelPadding: space[4],
  /**
   * List row height. trackItemLayout reads this, so every row a list renders
   * with getItemLayout must be exactly this tall — including skeleton rows.
   */
  rowHeight: 64,
  /** Square thumbnail in a list row. */
  thumbSize: 48,
  /** Progress bar thickness. */
  progressHeight: 5,
  /** Fraction of screen width the Now Playing artwork occupies. */
  artworkWidthRatio: 0.84,
  /** Corner radius of the floating dock and the cards that echo it. */
  dockRadius: 28,
  /**
   * Legacy default opacity of floating surfaces. Glass now reads the user's
   * Tint setting instead; kept for the one screen that still uses it.
   */
  floatingOpacity: 0.75,

  /** Compact navigation bar height, below the status bar inset. */
  navBarHeight: 52,
  /** Vertical space the large title block occupies in a list header. */
  largeTitleHeight: 56,
  /** How far a list scrolls before the compact bar is fully in. */
  headerCollapseDistance: 56,
  /** Square hero artwork on album/playlist screens. */
  heroArtworkSize: 248,
  /** Height of the parallax hero area on detail screens. */
  heroHeight: 340,
  /** Width of a square tile in a horizontal shelf. */
  shelfTileSize: 156,
  /** Gap between tiles in a shelf or grid. */
  tileGap: space[3],
  /** Standard control height: buttons, search field, segmented control. */
  controlHeight: 44,
  /** Compact pill control height. */
  pillHeight: 36,
  /** Minimum tap target. */
  minTapTarget: 44,
  /** Inset of the floating dock from the screen edges. */
  dockMargin: space[3],
  /** Vertical rhythm between major sections on a feed screen. */
  sectionGap: space[7],
} as const;

// ---------------------------------------------------------------------------
// 4. Corner radius — generous and continuous-looking
// ---------------------------------------------------------------------------

export const radius = {
  /** Tiny chips, badges. */
  xs: 4,
  /** List-row thumbnails, small buttons. */
  sm: 8,
  /** Artwork wells, text fields. */
  md: 12,
  /** Cards, tiles, grouped sections. */
  lg: 20,
  /** Floating bars, the dock, the mini player. */
  xl: 28,
  /** Sheets. */
  xxl: 32,
  /** Genuinely circular or pill-shaped controls. */
  full: 999,
} as const;

// ---------------------------------------------------------------------------
// 5. Motion — springs first
// ---------------------------------------------------------------------------

/**
 * Durations and easing for the few things that should not spring: crossfades,
 * colour changes, native navigator transitions that only accept a duration.
 *
 * Anything that moves under the finger or settles into place uses the spring
 * presets below — see src/theme/motion.ts for the ready-made configs.
 */
export const motion = {
  /** Icon swaps and image fades — should read as near-instant. */
  durationFast: 120,
  /** Reveals, small fades, settling. */
  durationBase: 220,
  /** Screen transitions. */
  durationScreen: 300,
  /** Colour crossfades between tracks. */
  durationCrossfade: 1100,
  /** Strong ease-out. Feed to Easing.bezier(...easing). */
  easing: [0.2, 0.8, 0.2, 1] as const,
  /** How far a pressable sinks. */
  pressScale: 0.96,
  /** Delay between consecutive items in a staggered list entrance. */
  staggerStep: 36,
  /** No item in a staggered entrance waits longer than this. */
  staggerMaxDelay: 300,
  /** Items at or past this index never play an entrance. */
  staggerMaxItems: 10,
} as const;

/**
 * Spring presets as plain physics numbers (damping ratio in the comments).
 *
 * Kept here as data so they stay liftable; motion.ts re-exports them typed
 * for Reanimated.
 */
export const springs = {
  /** Press-in: fast with almost no overshoot. ζ≈0.69 */
  press: { damping: 22, stiffness: 420, mass: 0.6 },
  /** Release: a touch of life on the way back up. ζ≈0.59 */
  release: { damping: 16, stiffness: 260, mass: 0.7 },
  /** Controls morphing, pills sliding, toggles. ζ≈0.75 */
  snappy: { damping: 26, stiffness: 380, mass: 0.8 },
  /** Large surfaces settling, headers, sheets. Critically damped. ζ≈1.0 */
  gentle: { damping: 24, stiffness: 140, mass: 1 },
  /** Playful emphasis — a like, a pop-in. Lively, not cartoonish. ζ≈0.5 */
  bouncy: { damping: 13, stiffness: 190, mass: 0.9 },
  /** Layout transitions and list entrances. ζ≈0.78 */
  layout: { damping: 24, stiffness: 240, mass: 0.9 },
  /** Screen-sized expansions. Clamped so content never overshoots its bounds. */
  screen: { damping: 30, stiffness: 260, mass: 1, overshootClamping: true },
} as const;

// ---------------------------------------------------------------------------
// 6. Iconography
// ---------------------------------------------------------------------------

/** Line-based, consistent stroke weight. Filled only for genuine filled states. */
export const icon = {
  /** Slightly heavier than before, to sit with the bold type. */
  strokeWidth: 1.75,
  /** Standard glyph: nav bar actions, prev/next. */
  size: 22,
  /** Secondary glyphs: shuffle/repeat, row actions. */
  sizeSmall: 18,
  /** Large transport glyphs. */
  sizeLarge: 28,
  /** Now Playing play/pause. */
  sizeHero: 44,
} as const;

/** Hairline borders — 0.5px, not the platform default. */
export const hairline = 0.5;
