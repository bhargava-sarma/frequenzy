import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

import type { MaterialRoles, SystemColors, TonalPalette } from '../theme/material';

export type { MaterialRoles, SystemColors } from '../theme/material';

/**
 * The system's Material You colours and haptics, from the app's own native
 * module (modules/material-you).
 *
 * Optional throughout: a build without the module (an older install still
 * running this code over the air), web, and Android before 12 all answer
 * null, and the app keeps its preset colours and simple vibration.
 */

export type SystemHaptic =
  | 'tick'
  | 'press'
  | 'heavy'
  | 'success'
  | 'error'
  | 'toggleOn'
  | 'toggleOff'
  | 'threshold';

interface MaterialYouModule {
  getColors(): SystemColors | null;
  performHaptic(kind: SystemHaptic): boolean;
}

let cached: MaterialYouModule | null | undefined;

function native(): MaterialYouModule | null {
  if (cached !== undefined) return cached;
  // iOS never has the module; on web a preview can supply one, as it does
  // the file system. Absent, every caller falls back.
  if (Platform.OS === 'ios') {
    cached = null;
    return cached;
  }
  try {
    const module = requireOptionalNativeModule<MaterialYouModule>('MaterialYou');
    cached =
      module && typeof module.getColors === 'function' && typeof module.performHaptic === 'function'
        ? module
        : null;
  } catch {
    cached = null;
  }
  return cached;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

function cleanRoles(roles: unknown): Partial<MaterialRoles> | null {
  if (!roles || typeof roles !== 'object') return null;
  const out: Partial<MaterialRoles> = {};
  for (const [key, value] of Object.entries(roles as Record<string, unknown>)) {
    if (typeof value === 'string' && HEX.test(value)) (out as Record<string, string>)[key] = value.toUpperCase();
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * The wallpaper colours, read fresh. Null where there are none to read.
 * Cheap enough to call when the app comes back to the front, which is when
 * a new wallpaper would show.
 */
export function readSystemColors(): SystemColors | null {
  const module = native();
  if (!module) return null;
  try {
    const raw = module.getColors();
    if (!raw || typeof raw !== 'object') return null;
    const palettes: SystemColors['palettes'] = {};
    for (const name of ['accent1', 'accent2', 'accent3', 'neutral1', 'neutral2'] as const) {
      const tones = raw.palettes?.[name];
      if (tones && typeof tones === 'object') {
        const clean: TonalPalette = {};
        for (const [tone, value] of Object.entries(tones)) {
          if (typeof value === 'string' && HEX.test(value)) clean[tone] = value.toUpperCase();
        }
        palettes[name] = clean;
      }
    }
    return {
      sdk: typeof raw.sdk === 'number' ? raw.sdk : 0,
      palettes,
      light: cleanRoles(raw.light),
      dark: cleanRoles(raw.dark),
    };
  } catch {
    return null;
  }
}

/** Whether this build can read wallpaper colours on this device. */
export function hasSystemColors(): boolean {
  const colors = readSystemColors();
  return colors != null && (colors.dark != null || colors.palettes.accent1 != null);
}

/**
 * Plays a system haptic effect — the same ones the rest of Android uses, so
 * a tick here feels like a tick in Settings. Returns false when unavailable,
 * for the caller to fall back.
 */
export function systemHaptic(kind: SystemHaptic): boolean {
  const module = native();
  if (!module) return false;
  try {
    return module.performHaptic(kind);
  } catch {
    return false;
  }
}
