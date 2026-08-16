import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  setArtworkAccent: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');
  const [artworkAccentEnabled, setArtworkAccentEnabledState] = useState(true);
  const [artworkAccent, setArtworkAccent] = useState<ArtworkAccent | null>(null);

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
    if (!enabled) setArtworkAccent(null);
    void AsyncStorage.setItem(ACCENT_KEY, String(enabled));
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
      setArtworkAccent,
    }),
    [palette, preference, resolved, setPreference, artworkAccentEnabled, setArtworkAccentEnabled],
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
