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

import { palettes, type Palette } from './tokens';
import type { ArtworkAccent } from './artworkColor';

/**
 * Live theme.
 *
 * The design spec rules out a light/dark toggle on the grounds that the
 * two-zone paper/panel split is the design. That reasoning still holds for the
 * *structure* — panel is still where transport lives in both palettes — so
 * what the toggle swaps is which values those roles resolve to, not which
 * surface anything sits on. No component gained a branch on theme.
 *
 * Styles are built per palette and cached, so switching is a re-render rather
 * than a rebuild of every StyleSheet on every render.
 */

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'settings.theme';
const ACCENT_KEY = 'settings.artworkAccent';
const AMBIENT_KEY = 'settings.ambient';
const BLUR_KEY = 'settings.blur';
const BLUR_INTENSITY_KEY = 'settings.blurIntensity';
const SURFACE_OPACITY_KEY = 'settings.surfaceOpacity';

/**
 * How long the accent takes to travel from one track's colour to the next.
 *
 * Long on purpose. A cut reads as the UI glitching on every track change; over
 * five seconds the colour arrives without ever drawing attention to the moment
 * it moved.
 */
const ACCENT_FADE_MS = 5000;

/**
 * Steps in that fade.
 *
 * Each step is a new palette object, which re-renders every themed component,
 * so this is not free — but twenty steps over five seconds is one every 250ms,
 * which is imperceptible as stepping at this rate of change and costs four
 * re-renders a second for five seconds.
 */
const ACCENT_FADE_STEPS = 20;

function parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex([r, g, b]: [number, number, number]): string {
  const byte = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/** Straight RGB interpolation. Between two washed-out tints it stays clean. */
function mixHex(from: string, to: string, t: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  return toHex([
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]);
}

interface ThemeContextValue {
  palette: Palette;
  /** What the user chose, which may be "follow the OS". */
  preference: ThemePreference;
  /** What that resolved to right now. */
  resolved: 'light' | 'dark';
  setPreference: (preference: ThemePreference) => void;
  /** Whether the accent follows the current artwork. */
  artworkAccentEnabled: boolean;
  setArtworkAccentEnabled: (enabled: boolean) => void;
  /** Strength of the drifting background wash. 0 turns it off entirely. */
  ambientIntensity: number;
  setAmbientIntensity: (intensity: number) => void;
  /** How hard floating surfaces blur, 0-100. Zero is the same as off. */
  blurIntensity: number;
  setBlurIntensity: (intensity: number) => void;
  /** How opaque the tint over them is, 0-1. */
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
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');
  const [artworkAccentEnabled, setArtworkAccentEnabledState] = useState(true);
  const [ambientIntensity, setAmbientIntensityState] = useState(1);
  const [blurIntensity, setBlurIntensityState] = useState(40);
  const [surfaceOpacity, setSurfaceOpacityState] = useState(0.75);
  /** What is on screen right now, mid-fade included. */
  const [artworkAccent, setArtworkAccentState] = useState<ArtworkAccent | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Eases to a new accent instead of cutting to it.
   *
   * The ink colour swaps at the halfway point rather than being interpolated:
   * it is only ever near-black or near-white, and a blend of the two is grey,
   * which is unreadable on both.
   */
  const setArtworkAccent = useCallback((next: ArtworkAccent | null) => {
    if (fadeTimer.current) {
      clearInterval(fadeTimer.current);
      fadeTimer.current = null;
    }

    if (!next) {
      setArtworkAccentState(null);
      return;
    }

    setArtworkAccentState((current) => {
      if (!current) return next;
      if (current.accent === next.accent) return current;

      const from = current.accent;
      let step = 0;

      fadeTimer.current = setInterval(() => {
        step += 1;
        const t = step / ACCENT_FADE_STEPS;

        if (t >= 1) {
          if (fadeTimer.current) clearInterval(fadeTimer.current);
          fadeTimer.current = null;
          setArtworkAccentState(next);
          return;
        }

        setArtworkAccentState({
          accent: mixHex(from, next.accent, t),
          accentInk: t < 0.5 ? current.accentInk : next.accentInk,
        });
      }, ACCENT_FADE_MS / ACCENT_FADE_STEPS);

      return current;
    });
  }, []);

  useEffect(
    () => () => {
      if (fadeTimer.current) clearInterval(fadeTimer.current);
    },
    [],
  );

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
    if (!enabled) setArtworkAccentState(null);
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
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
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

/**
 * Per-palette style cache.
 *
 * Keyed on the factory function identity, which is why factories must live at
 * module scope — one declared inside a component would be a new function every
 * render and would never hit.
 *
 * The inner map is bounded. Palettes were effectively permanent when only two
 * existed, but the accent now changes with every track, so each play produces
 * a fresh palette object — and a Map keyed on those holds them alive forever.
 * Two entries is enough for the case that actually repeats: the palette in use
 * and the one just replaced.
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
