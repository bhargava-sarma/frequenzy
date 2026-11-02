import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import { cancelAnimation, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { create } from 'zustand';

import type { ArtworkColorSet } from './artworkColor';
import { useTimings } from './motion';
import {
  buildPalette,
  fallbackArtworkPalette,
  modeOf,
  presetAccent,
  type AccentPair,
  type ArtworkPalette,
  type Palette,
  type ThemeMode,
  type ThemeName,
} from './tokens';
import { useSettingsStore } from '../store/useSettingsStore';

/** Secondary and tertiary text on the immersive screens' artwork ground. */
const IMMERSIVE_SECONDARY = '#C6C4BD';
const IMMERSIVE_TERTIARY = '#96948E';

/**
 * Live theme.
 *
 * Two contexts, split by how often they change and who cares:
 *
 *   - The theme context carries the palette and the few appearance
 *     settings components draw with (ambient, grid, reduced motion). Nearly
 *     everything reads it; it changes when the theme flips or the accent
 *     moves to a new track — once, not per frame.
 *   - The artwork context carries the ambient mesh colours and the shared
 *     value that crossfades them. Only backgrounds read it, so a track
 *     change re-renders a handful of gradient views rather than the tree.
 *
 * The player is always a dark, immersive face — over artwork colour, white
 * type is the only thing that reads everywhere — so the provider also
 * builds an "immersive" palette with the accent conditioned for a dark
 * ground, and <ImmersiveScope> swaps it in for everything inside it.
 */

// ---------------------------------------------------------------------------
// Live artwork colours
// ---------------------------------------------------------------------------

interface ArtworkColorStore {
  colors: ArtworkColorSet | null;
  /**
   * A cover with no vivid hue keeps the previous accent rather than snapping
   * to the preset: the UI never loses its highlight colour mid-session, and
   * a monochrome cover still contributes its greys to the mesh.
   */
  setColors: (next: ArtworkColorSet | null) => void;
}

export const useArtworkColorStore = create<ArtworkColorStore>((set, get) => ({
  colors: null,
  setColors: (next) => {
    const previous = get().colors;
    if (!next) {
      if (previous) set({ colors: null });
      return;
    }
    const merged: ArtworkColorSet = {
      light: { ...next.light, accent: next.light.accent ?? previous?.light.accent ?? null },
      dark: { ...next.dark, accent: next.dark.accent ?? previous?.dark.accent ?? null },
    };
    set({ colors: merged });
  },
}));

// ---------------------------------------------------------------------------
// Contexts
// ---------------------------------------------------------------------------

interface ThemeContextValue {
  palette: Palette;
  name: ThemeName;
  resolved: ThemeMode;
  /** The always-dark palette the player, queue and lyrics use. */
  immersivePalette: Palette;
  ambientIntensity: number;
  reduceMotion: boolean;
  gridPaper: boolean;
  /** True inside ImmersiveScope. */
  immersive: boolean;
}

const fallbackPalette = buildPalette('dark', presetAccent('orange', 'dark'));

const ThemeContext = createContext<ThemeContextValue>({
  palette: fallbackPalette,
  name: 'dark',
  resolved: 'dark',
  immersivePalette: fallbackPalette,
  ambientIntensity: 0.8,
  reduceMotion: false,
  gridPaper: true,
  immersive: false,
});

export interface MeshLayer {
  /** Conditioned for the app's theme — the wash behind lists. */
  mesh: ArtworkPalette;
  /** Conditioned for dark — the player's immersive background. */
  immersive: ArtworkPalette;
}

interface MeshLayers {
  a: MeshLayer;
  b: MeshLayer;
}

interface ArtworkContextValue {
  current: MeshLayer;
  fromArtwork: boolean;
  layers: MeshLayers;
  /** 0 shows layer a, 1 shows layer b. */
  mix: SharedValue<number>;
}

const ArtworkContext = createContext<ArtworkContextValue | null>(null);

const paletteKey = (p: ArtworkPalette) => `${p.vibrant}${p.dominant}${p.muted}${p.deep}`;
const layerKey = (layer: MeshLayer) => `${paletteKey(layer.mesh)}|${paletteKey(layer.immersive)}`;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const theme = useSettingsStore((s) => s.theme);
  const accentMode = useSettingsStore((s) => s.accentMode);
  const accentPreset = useSettingsStore((s) => s.accentPreset);
  const ambient = useSettingsStore((s) => s.ambient);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const gridPaper = useSettingsStore((s) => s.gridPaper);
  const artworkColors = useArtworkColorStore((s) => s.colors);

  const name: ThemeName =
    theme === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : theme;
  const mode = modeOf(name);
  const art = accentMode === 'artwork' ? artworkColors : null;

  const accentFor = (m: ThemeMode): AccentPair =>
    art?.[m].accent ?? presetAccent(accentPreset, m);

  const light = accentFor('light');
  const dark = accentFor('dark');

  const palette = useMemo(
    () => buildPalette(name, mode === 'light' ? light : dark),
    // The accent pairs are compared by value, so a re-render with the same
    // colours keeps the same palette object — the style cache depends on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, mode, light.accent, light.accentInk, dark.accent, dark.accentInk],
  );

  const immersivePalette = useMemo(
    () => {
      const base = mode === 'dark' ? palette : buildPalette('dark', dark);
      // The immersive screens sit on the artwork's colours, not on near-black,
      // so the quieter text steps are lifted to keep their contrast there.
      return { ...base, labelSecondary: IMMERSIVE_SECONDARY, labelTertiary: IMMERSIVE_TERTIARY };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, palette, dark.accent, dark.accentInk],
  );

  // --- Mesh, crossfaded on the UI thread ----------------------------------

  const { crossfade } = useTimings();

  const target = useMemo<MeshLayer>(
    () => ({
      mesh: art ? art[mode].palette : fallbackArtworkPalette(palette.accent, mode),
      immersive: art ? art.dark.palette : fallbackArtworkPalette(immersivePalette.accent, 'dark'),
    }),
    [art, mode, palette.accent, immersivePalette.accent],
  );

  const [layers, setLayers] = useState<MeshLayers>(() => ({ a: target, b: target }));
  const mix = useSharedValue(0);
  const shownKey = useRef(layerKey(target));
  const shownMode = useRef(mode);
  const pendingMix = useRef<number | null>(null);

  /**
   * Swaps the new colours into whichever layer is less visible, then fades
   * toward it. At rest the hidden layer is fully transparent, so the swap is
   * invisible and the fade does all the work; an interrupted fade bounds the
   * jump to a soft shift in an already soft background.
   */
  useEffect(() => {
    const key = layerKey(target);
    const flipped = shownMode.current !== mode;
    shownMode.current = mode;
    if (key === shownKey.current) return;
    shownKey.current = key;

    if (flipped) {
      // The whole palette just changed; a slow fade of the wash alone would
      // lag visibly behind everything else.
      cancelAnimation(mix);
      mix.value = 0;
      pendingMix.current = null;
      setLayers({ a: target, b: target });
      return;
    }

    if (mix.value >= 0.5) {
      pendingMix.current = 0;
      setLayers((current) => ({ a: target, b: current.b }));
    } else {
      pendingMix.current = 1;
      setLayers((current) => ({ a: current.a, b: target }));
    }
  }, [target, mode, mix]);

  // Started after the new colours have committed, so a layer never begins
  // fading in while still showing the previous track's colours.
  useEffect(() => {
    if (pendingMix.current == null) return;
    mix.value = withTiming(pendingMix.current, crossfade);
    pendingMix.current = null;
  }, [layers, mix, crossfade]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      palette,
      name,
      resolved: mode,
      immersivePalette,
      ambientIntensity: ambient,
      reduceMotion,
      gridPaper,
      immersive: false,
    }),
    [palette, name, mode, immersivePalette, ambient, reduceMotion, gridPaper],
  );

  const artwork = useMemo<ArtworkContextValue>(
    () => ({ current: target, fromArtwork: art != null, layers, mix }),
    [target, art, layers, mix],
  );

  return (
    <ThemeContext.Provider value={value}>
      <ArtworkContext.Provider value={artwork}>{children}</ArtworkContext.Provider>
    </ThemeContext.Provider>
  );
}

/**
 * Renders its children against the immersive (dark) palette.
 *
 * Context flows through portals, so sheets opened from inside — track
 * actions from the player — come up dark too, matching what they rose from.
 */
export function ImmersiveScope({ children }: { children: ReactNode }) {
  const parent = useContext(ThemeContext);
  const value = useMemo<ThemeContextValue>(
    () => ({
      ...parent,
      palette: parent.immersivePalette,
      name: parent.immersivePalette.name,
      resolved: 'dark',
      immersive: true,
    }),
    [parent],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** The live palette. Use this instead of importing a palette from tokens. */
export function useTheme(): Palette {
  return useContext(ThemeContext).palette;
}

/** Appearance values components draw with. Respects ImmersiveScope. */
export function useThemeControls(): Omit<ThemeContextValue, 'palette' | 'immersivePalette'> {
  const { palette: _p, immersivePalette: _i, ...controls } = useContext(ThemeContext);
  return controls;
}

function useArtworkContext(): ArtworkContextValue {
  const context = useContext(ArtworkContext);
  if (!context) throw new Error('Artwork colour hooks must be used inside ThemeProvider.');
  return context;
}

/**
 * The current mesh colours as plain values — for static gradients like a
 * hero backdrop. Changes once per track; for a smooth background use
 * AmbientBackground, which crossfades.
 */
export function useArtworkPalette(): ArtworkPalette & { fromArtwork: boolean } {
  const { current, fromArtwork } = useArtworkContext();
  const { immersive } = useThemeControls();
  return useMemo(
    () => ({ ...(immersive ? current.immersive : current.mesh), fromArtwork }),
    [current, fromArtwork, immersive],
  );
}

/** The two crossfading colour layers behind AmbientBackground. */
export function useMeshLayers(): { layers: MeshLayers; mix: SharedValue<number> } {
  const { layers, mix } = useArtworkContext();
  return { layers, mix };
}

/**
 * Per-palette style cache.
 *
 * Keyed on the factory function identity, so factories must live at module
 * scope. The inner map is bounded: the accent changes with every track, so
 * each play produces a fresh palette, and two live at once (the app's and
 * the player's) plus the two they replaced is all that ever repeats.
 */
const MAX_CACHED_PALETTES = 4;

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
      byPalette.delete(palette);
      byPalette.set(palette, cached);
      return cached as T;
    }

    const built = factory(palette);
    byPalette.set(palette, built);

    while (byPalette.size > MAX_CACHED_PALETTES) {
      const oldest = byPalette.keys().next();
      if (oldest.done) break;
      byPalette.delete(oldest.value);
    }

    return built;
  }, [factory, palette]);
}
