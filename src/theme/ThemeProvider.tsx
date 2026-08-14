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

interface ThemeContextValue {
  palette: Palette;
  /** What the user chose, which may be "follow the OS". */
  preference: ThemePreference;
  /** What that resolved to right now. */
  resolved: 'light' | 'dark';
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  palette: palettes.dark,
  preference: 'dark',
  resolved: 'dark',
  setPreference: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');

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

  const resolved: 'light' | 'dark' =
    preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({ palette: palettes[resolved], preference, resolved, setPreference }),
    [resolved, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The live palette. Use this instead of importing `color` from tokens. */
export function useTheme(): Palette {
  return useContext(ThemeContext).palette;
}

/** Preference plumbing, for the settings screen. */
export function useThemeControls(): Omit<ThemeContextValue, 'palette'> {
  const { preference, resolved, setPreference } = useContext(ThemeContext);
  return { preference, resolved, setPreference };
}

/**
 * Per-palette style cache.
 *
 * Keyed on the factory function identity, which is why factories must live at
 * module scope — one declared inside a component would be a new function every
 * render and would never hit.
 */
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
    if (cached) return cached as T;

    const built = factory(palette);
    byPalette.set(palette, built);
    return built;
  }, [factory, palette]);
}
