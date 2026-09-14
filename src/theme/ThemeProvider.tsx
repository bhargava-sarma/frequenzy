import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cancelAnimation,
  interpolateColor,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { fallbackArtworkPalette, palettes, type ArtworkPalette, type Palette } from './tokens';
import type { ArtworkAccent } from './artworkColor';
import { timings } from './motion';

/**
 * Live theme.
 *
 * Two contexts, split by how often they change and who cares:
 *
 *   - The theme context carries the palette and the user's preferences.
 *     Nearly every component reads it, and it changes when the theme flips
 *     or the accent moves to a new track — once, not per frame.
 *   - The artwork context carries the background mesh colours and the shared
 *     values that crossfade them. Only backgrounds read it, so a track change
 *     re-renders a handful of gradient views rather than the whole tree.
 *
 * Colour transitions happen on the UI thread. The accent used to fade by
 * stepping a new palette through React twenty times, re-rendering every
 * themed component four times a second for five seconds; now `color.accent`
 * changes once, and anything that wants the change to be smooth reads
 * useAnimatedAccent() instead.
 *
 * Styles are built per palette and cached, so switching is a re-render rather
 * than a rebuild of every StyleSheet on every render.
 */

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'settings.theme';
const ACCENT_KEY = 'settings.artworkAccent';
const AMBIENT_KEY = 'settings.ambient';
const BLUR_INTENSITY_KEY = 'settings.blurIntensity';
const SURFACE_OPACITY_KEY = 'settings.surfaceOpacity';

interface ThemeContextValue {
  palette: Palette;
  /** What the user chose, which may be "follow the OS". */
  preference: ThemePreference;
  /** What that resolved to right now. */
  resolved: 'light' | 'dark';
  setPreference: (preference: ThemePreference) => void;
  /** Whether the accent and the background follow the current artwork. */
  artworkAccentEnabled: boolean;
  setArtworkAccentEnabled: (enabled: boolean) => void;
  /** Strength of the background mesh. 0 turns it off entirely. */
  ambientIntensity: number;
  setAmbientIntensity: (intensity: number) => void;
  /** How hard glass surfaces blur, 0-100. Zero is the same as off. */
  blurIntensity: number;
  setBlurIntensity: (intensity: number) => void;
  /** How strongly glass is tinted, 0-1. 0.75 is the designed default. */
  surfaceOpacity: number;
  setSurfaceOpacity: (opacity: number) => void;
  /**
   * Pushed in by the bridge that watches what's playing.
   *
   * Lives here rather than in its own context so the accent arrives already
   * folded into the palette. Every component reads `color.accent` already, so
   * nothing had to learn about artwork to follow it.
   */
  setArtworkAccent: (accent: ArtworkAccent | null) => void;
  /** The mesh palette for the current cover, conditioned for `resolved`. */
  setArtworkPalette: (palette: ArtworkPalette | null) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  palette: palettes.dark,
  preference: 'dark',
  resolved: 'dark',
  setPreference: () => {},
  artworkAccentEnabled: true,
  setArtworkAccentEnabled: () => {},
  ambientIntensity: 1,
  setAmbientIntensity: () => {},
  blurIntensity: 40,
  setBlurIntensity: () => {},
  surfaceOpacity: 0.75,
  setSurfaceOpacity: () => {},
  setArtworkAccent: () => {},
  setArtworkPalette: () => {},
});

interface MeshLayers {
  a: ArtworkPalette;
  b: ArtworkPalette;
}

interface ArtworkContextValue {
  /** The palette the mesh is showing or heading to. */
  palette: ArtworkPalette;
  /** False when the fallback palette is in use. */
  fromArtwork: boolean;
  /** Two colour sets the mesh crossfades between. */
  layers: MeshLayers;
  /** 0 shows layer a, 1 shows layer b. */
  mix: SharedValue<number>;
  accentFrom: SharedValue<string>;
  accentTo: SharedValue<string>;
  accentProgress: SharedValue<number>;
}

const ArtworkContext = createContext<ArtworkContextValue | null>(null);

function paletteKey(palette: ArtworkPalette): string {
  return `${palette.vibrant}${palette.dominant}${palette.muted}${palette.deep}`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');
  const [artworkAccentEnabled, setArtworkAccentEnabledState] = useState(true);
  const [ambientIntensity, setAmbientIntensityState] = useState(1);
  const [blurIntensity, setBlurIntensityState] = useState(40);
  const [surfaceOpacity, setSurfaceOpacityState] = useState(0.75);
  const [artworkAccent, setArtworkAccentState] = useState<ArtworkAccent | null>(null);
  const [artworkPalette, setArtworkPaletteState] = useState<ArtworkPalette | null>(null);

  const setArtworkAccent = useCallback((next: ArtworkAccent | null) => {
    setArtworkAccentState((current) =>
      current && next && current.accent === next.accent && current.accentInk === next.accentInk
        ? current
        : next,
    );
  }, []);

  const setArtworkPalette = useCallback((next: ArtworkPalette | null) => {
    setArtworkPaletteState((current) =>
      current && next && paletteKey(current) === paletteKey(next) ? current : next,
    );
  }, []);

  // Read the stored choice once. Until it lands the app renders dark, which
  // is the default anyway, so there is no flash to guard against.
  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (cancelled) return;
      if (stored === 'system' || stored === 'light' || stored === 'dark') {
        setPreferenceState(stored);
      }
    });
    void AsyncStorage.getItem(ACCENT_KEY).then((stored) => {
      if (!cancelled && stored != null) setArtworkAccentEnabledState(stored === 'true');
    });
    void AsyncStorage.getItem(AMBIENT_KEY).then((stored) => {
      const parsed = stored != null ? Number(stored) : NaN;
      if (!cancelled && Number.isFinite(parsed)) setAmbientIntensityState(parsed);
    });
    void AsyncStorage.getItem(BLUR_INTENSITY_KEY).then((stored) => {
      const parsed = stored != null ? Number(stored) : NaN;
      if (!cancelled && Number.isFinite(parsed)) setBlurIntensityState(parsed);
    });
    void AsyncStorage.getItem(SURFACE_OPACITY_KEY).then((stored) => {
      const parsed = stored != null ? Number(stored) : NaN;
      if (!cancelled && Number.isFinite(parsed)) setSurfaceOpacityState(parsed);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    // Fire and forget: the UI has already changed, and a failed write costs
    // the preference on next launch rather than anything the user is doing now.
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const setArtworkAccentEnabled = useCallback((enabled: boolean) => {
    setArtworkAccentEnabledState(enabled);
    if (!enabled) {
      setArtworkAccentState(null);
      setArtworkPaletteState(null);
    }
    void AsyncStorage.setItem(ACCENT_KEY, String(enabled));
  }, []);

  const setAmbientIntensity = useCallback((intensity: number) => {
    setAmbientIntensityState(intensity);
    void AsyncStorage.setItem(AMBIENT_KEY, String(intensity));
  }, []);

  const setBlurIntensity = useCallback((intensity: number) => {
    setBlurIntensityState(intensity);
    void AsyncStorage.setItem(BLUR_INTENSITY_KEY, String(intensity));
  }, []);

  const setSurfaceOpacity = useCallback((opacity: number) => {
    setSurfaceOpacityState(opacity);
    void AsyncStorage.setItem(SURFACE_OPACITY_KEY, String(opacity));
  }, []);

  const resolved: 'light' | 'dark' =
    preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;

  const palette = useMemo<Palette>(() => {
    const base = palettes[resolved];
    if (!artworkAccentEnabled || !artworkAccent) return base;
    return { ...base, accent: artworkAccent.accent, accentInk: artworkAccent.accentInk };
  }, [resolved, artworkAccentEnabled, artworkAccent]);

  // --- Accent, animated on the UI thread ----------------------------------

  const accentFrom = useSharedValue(palette.accent);
  const accentTo = useSharedValue(palette.accent);
  const accentProgress = useSharedValue(1);
  const accentResolved = useRef(resolved);

  useEffect(() => {
    const themeFlipped = accentResolved.current !== resolved;
    accentResolved.current = resolved;

    if (themeFlipped) {
      // The whole palette just changed under it; a slow fade of the accent
      // alone would lag visibly behind everything else.
      cancelAnimation(accentProgress);
      accentFrom.value = palette.accent;
      accentTo.value = palette.accent;
      accentProgress.value = 1;
      return;
    }

    if (accentTo.value === palette.accent) return;

    // Starts from wherever an interrupted fade had got to, so skipping
    // through tracks quickly never snaps the colour back.
    const current = interpolateColor(
      accentProgress.value,
      [0, 1],
      [accentFrom.value, accentTo.value],
    );
    accentFrom.value = String(current);
    accentTo.value = palette.accent;
    accentProgress.value = 0;
    accentProgress.value = withTiming(1, timings.crossfade);
  }, [palette.accent, resolved, accentFrom, accentTo, accentProgress]);

  // --- Mesh palette, crossfaded on the UI thread --------------------------

  const fromArtwork = artworkAccentEnabled && artworkPalette != null;
  const meshPalette =
    artworkAccentEnabled && artworkPalette ? artworkPalette : fallbackArtworkPalette[resolved];

  const [layers, setLayers] = useState<MeshLayers>(() => ({ a: meshPalette, b: meshPalette }));
  const mix = useSharedValue(0);
  const shownKey = useRef(paletteKey(meshPalette));
  const meshResolved = useRef(resolved);
  const pendingMix = useRef<number | null>(null);

  /**
   * Swaps the new colours into whichever layer is less visible, then fades
   * toward it.
   *
   * At rest the hidden layer is fully transparent, so the swap itself is
   * invisible and the fade does all the work. If a fade is interrupted, the
   * less visible layer is at most half showing, which bounds the jump to a
   * soft shift in an already soft background.
   */
  useEffect(() => {
    const key = paletteKey(meshPalette);
    const themeFlipped = meshResolved.current !== resolved;
    meshResolved.current = resolved;
    if (key === shownKey.current) return;
    shownKey.current = key;

    if (themeFlipped) {
      cancelAnimation(mix);
      mix.value = 0;
      pendingMix.current = null;
      setLayers({ a: meshPalette, b: meshPalette });
      return;
    }

    if (mix.value >= 0.5) {
      pendingMix.current = 0;
      setLayers((current) => ({ a: meshPalette, b: current.b }));
    } else {
      pendingMix.current = 1;
      setLayers((current) => ({ a: current.a, b: meshPalette }));
    }
  }, [meshPalette, resolved, mix]);

  // Started after the new colours have committed, so the layer never begins
  // fading in while still showing the previous track's colours.
  useEffect(() => {
    if (pendingMix.current == null) return;
    mix.value = withTiming(pendingMix.current, timings.crossfade);
    pendingMix.current = null;
  }, [layers, mix]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      palette,
      preference,
      resolved,
      setPreference,
      artworkAccentEnabled,
      setArtworkAccentEnabled,
      ambientIntensity,
      setAmbientIntensity,
      blurIntensity,
      setBlurIntensity,
      surfaceOpacity,
      setSurfaceOpacity,
      setArtworkAccent,
      setArtworkPalette,
    }),
    [
      palette,
      preference,
      resolved,
      setPreference,
      artworkAccentEnabled,
      setArtworkAccentEnabled,
      ambientIntensity,
      setAmbientIntensity,
      blurIntensity,
      setBlurIntensity,
      surfaceOpacity,
      setSurfaceOpacity,
      setArtworkAccent,
      setArtworkPalette,
    ],
  );

  const artwork = useMemo<ArtworkContextValue>(
    () => ({
      palette: meshPalette,
      fromArtwork,
      layers,
      mix,
      accentFrom,
      accentTo,
      accentProgress,
    }),
    [meshPalette, fromArtwork, layers, mix, accentFrom, accentTo, accentProgress],
  );

  return (
    <ThemeContext.Provider value={value}>
      <ArtworkContext.Provider value={artwork}>{children}</ArtworkContext.Provider>
    </ThemeContext.Provider>
  );
}

/** The live palette. Use this instead of importing `color` from tokens. */
export function useTheme(): Palette {
  return useContext(ThemeContext).palette;
}

/** Preference plumbing, for the settings screen and the accent bridge. */
export function useThemeControls(): Omit<ThemeContextValue, 'palette'> {
  const { palette: _palette, ...controls } = useContext(ThemeContext);
  return controls;
}

function useArtworkContext(): ArtworkContextValue {
  const context = useContext(ArtworkContext);
  if (!context) throw new Error('Artwork colour hooks must be used inside ThemeProvider.');
  return context;
}

/**
 * The current mesh palette as plain colours — artwork-derived when available
 * and enabled, otherwise the fallback. For static gradients (a hero backdrop,
 * a tile glow). Changes once per track; for a smooth background use
 * AmbientBackground, which crossfades.
 */
export function useArtworkPalette(): ArtworkPalette & { fromArtwork: boolean } {
  const { palette, fromArtwork } = useArtworkContext();
  return useMemo(() => ({ ...palette, fromArtwork }), [palette, fromArtwork]);
}

/** The two crossfading colour layers behind AmbientBackground. */
export function useMeshLayers(): { layers: MeshLayers; mix: SharedValue<number> } {
  const { layers, mix } = useArtworkContext();
  return { layers, mix };
}

/**
 * The accent as a UI-thread value that fades between tracks.
 *
 * Use in useAnimatedStyle for large accent fills that are on screen during a
 * track change — the play button, a progress fill — where the single-step
 * change of `color.accent` would read as a cut:
 *
 *   const accent = useAnimatedAccent();
 *   const fill = useAnimatedStyle(() => ({ backgroundColor: accent.value }));
 */
export function useAnimatedAccent(): DerivedValue<string> {
  const { accentFrom, accentTo, accentProgress } = useArtworkContext();
  return useDerivedValue(() =>
    String(interpolateColor(accentProgress.value, [0, 1], [accentFrom.value, accentTo.value])),
  );
}

/**
 * Per-palette style cache.
 *
 * Keyed on the factory function identity, which is why factories must live at
 * module scope — one declared inside a component would be a new function every
 * render and would never hit.
 *
 * The inner map is bounded. The accent changes with every track, so each play
 * produces a fresh palette object — and a Map keyed on those holds them alive
 * forever. Two entries is enough for the case that actually repeats: the
 * palette in use and the one just replaced.
 */
const MAX_CACHED_PALETTES = 2;

const styleCache = new WeakMap<object, Map<Palette, unknown>>();

export function useThemedStyles<T>(factory: (color: Palette) => T): T {
  const palette = useTheme();

  return useMemo(() => {
    let byPalette = styleCache.get(factory);
    if (!byPalette) {
      byPalette = new Map();
      styleCache.set(factory, byPalette);
    }

    const cached = byPalette.get(palette);
    if (cached) {
      // Re-inserting marks it as most recent, so the eviction below always
      // drops the least recently used rather than an arbitrary entry.
      byPalette.delete(palette);
      byPalette.set(palette, cached);
      return cached as T;
    }

    const built = factory(palette);
    byPalette.set(palette, built);

    while (byPalette.size > MAX_CACHED_PALETTES) {
      // Map iterates in insertion order, so the first key is the oldest.
      const oldest = byPalette.keys().next();
      if (oldest.done) break;
      byPalette.delete(oldest.value);
    }

    return built;
  }, [factory, palette]);
}
