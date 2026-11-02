import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AccentPreset } from '../theme/tokens';

/**
 * Every user preference, persisted as one record.
 *
 * Preferences used to be five separate AsyncStorage keys read by the theme
 * provider. One store means one write path, one hydration to wait for, and
 * any component can read a preference without the provider having to thread
 * it through. Values written by the previous version are migrated once, so
 * an update never resets someone's theme.
 */

export type ThemePreference = 'system' | 'light' | 'dark' | 'black';
export type AccentMode = 'artwork' | 'preset';
export type PlayerFace = 'artwork' | 'vinyl' | 'tape';
export type LyricsSize = 'small' | 'medium' | 'large';
export type LibraryMode = 'playlists' | 'albums' | 'artists' | 'genres';
export type AlbumSort = 'name' | 'artist' | 'newest' | 'year' | 'recent' | 'frequent' | 'random';
export type CollectionView = 'grid' | 'list';
export type StartTab = 'Home' | 'Search' | 'Library';

export interface Settings {
  theme: ThemePreference;
  accentMode: AccentMode;
  accentPreset: AccentPreset;
  /** Strength of the ambient artwork wash, 0-1. 0 removes it entirely. */
  ambient: number;
  /** How hard glass blurs, 0-100. */
  blur: number;
  /** How strongly glass is tinted, 0-1. 0.75 is the designed default. */
  tint: number;
  /** A faint engineering-paper dot grid behind every screen. */
  gridPaper: boolean;
  playerFace: PlayerFace;
  /** Stops decorative motion: breathing art, spinning reels, marquees. */
  reduceMotion: boolean;
  haptics: boolean;
  /** Report plays to Navidrome. */
  scrobble: boolean;
  /** Restore the last queue, paused, when the app starts with nothing playing. */
  resumeQueue: boolean;
  /** Seconds a timed sleep fades out over. */
  sleepFade: number;
  lyricsSize: LyricsSize;
  lyricsRomanize: boolean;
  /** Per-track timing correction for synced lyrics, in seconds. */
  lyricsOffsets: Record<string, number>;
  libraryMode: LibraryMode;
  albumSort: AlbumSort;
  albumView: CollectionView;
  startTab: StartTab;
  /** Set once the pre-store keys have been read. */
  migratedLegacy: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accentMode: 'artwork',
  accentPreset: 'orange',
  ambient: 0.8,
  blur: 40,
  tint: 0.75,
  gridPaper: true,
  playerFace: 'artwork',
  reduceMotion: false,
  haptics: true,
  scrobble: true,
  resumeQueue: true,
  sleepFade: 20,
  lyricsSize: 'medium',
  lyricsRomanize: true,
  lyricsOffsets: {},
  libraryMode: 'playlists',
  albumSort: 'name',
  albumView: 'grid',
  startTab: 'Home',
  migratedLegacy: false,
};

/** Offsets kept, oldest dropped first, so the map cannot grow without bound. */
const MAX_LYRICS_OFFSETS = 300;

interface SettingsStore extends Settings {
  /** True once persisted values have loaded (or failed to). */
  hydrated: boolean;
  update: (patch: Partial<Settings>) => void;
  setLyricsOffset: (trackId: string, seconds: number) => void;
  reset: () => void;
}

const LEGACY_KEYS = {
  theme: 'settings.theme',
  artworkAccent: 'settings.artworkAccent',
  ambient: 'settings.ambient',
  blur: 'settings.blurIntensity',
  tint: 'settings.surfaceOpacity',
} as const;

const finite = (raw: string | null | undefined, min: number, max: number): number | undefined => {
  const parsed = raw != null ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : undefined;
};

/** Reads what the previous version stored, then removes it. */
async function readLegacy(): Promise<Partial<Settings>> {
  try {
    const pairs = await AsyncStorage.multiGet(Object.values(LEGACY_KEYS));
    const value = Object.fromEntries(pairs) as Record<string, string | null>;
    const patch: Partial<Settings> = {};

    const theme = value[LEGACY_KEYS.theme];
    if (theme === 'system' || theme === 'light' || theme === 'dark' || theme === 'black') {
      patch.theme = theme;
    }
    const accent = value[LEGACY_KEYS.artworkAccent];
    if (accent === 'true' || accent === 'false') {
      patch.accentMode = accent === 'true' ? 'artwork' : 'preset';
    }
    const ambient = finite(value[LEGACY_KEYS.ambient], 0, 1);
    if (ambient !== undefined) patch.ambient = ambient;
    const blur = finite(value[LEGACY_KEYS.blur], 0, 100);
    if (blur !== undefined) patch.blur = blur;
    const tint = finite(value[LEGACY_KEYS.tint], 0, 1);
    if (tint !== undefined) patch.tint = tint;

    void AsyncStorage.multiRemove(Object.values(LEGACY_KEYS)).catch(() => {});
    return patch;
  } catch {
    return {};
  }
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      hydrated: false,

      update: (patch) => set(patch),

      setLyricsOffset: (trackId, seconds) => {
        const next = { ...get().lyricsOffsets };
        delete next[trackId];
        // Rounded to a tenth: finer than anyone can hear, and it keeps the
        // readout from showing floating-point dust.
        const rounded = Math.round(seconds * 10) / 10;
        if (rounded !== 0) next[trackId] = rounded;

        const keys = Object.keys(next);
        for (let i = 0; i < keys.length - MAX_LYRICS_OFFSETS; i++) delete next[keys[i]];
        set({ lyricsOffsets: next });
      },

      reset: () => set({ ...DEFAULT_SETTINGS, migratedLegacy: true }),
    }),
    {
      name: 'settings.v2',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // Only data is written; actions and the hydration flag are runtime.
      partialize: ({ hydrated: _h, update: _u, setLyricsOffset: _s, reset: _r, ...data }) => data,
      // Values from storage are merged over the defaults rather than
      // replacing them, so a setting added in a later version still has a
      // value for someone whose stored record predates it.
      merge: (persisted, current) => ({
        ...current,
        ...(persisted && typeof persisted === 'object' ? (persisted as Partial<Settings>) : {}),
      }),
      onRehydrateStorage: () => (state) => {
        const finish = (patch: Partial<Settings> = {}) =>
          useSettingsStore.setState({ ...patch, hydrated: true });

        if (state && !state.migratedLegacy) {
          void readLegacy().then((legacy) => finish({ ...legacy, migratedLegacy: true }));
          return;
        }
        finish();
      },
    },
  ),
);

/** Non-React read, for modules like haptics and the scrobbler. */
export const getSettings = (): Settings => useSettingsStore.getState();
