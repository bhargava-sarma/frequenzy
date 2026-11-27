/**
 * Material You colour roles: what the system derives from the wallpaper.
 *
 * Android 14+ publishes the Material 3 roles outright — computed from the
 * wallpaper, the colour style picked in Wallpaper & style, and the contrast
 * setting — and those are used as they are. Android 12 and 13 publish only
 * the five tonal palettes the roles come from, in thirteen steps; the roles
 * are then read off them at the tones the Material 3 spec assigns, blending
 * between neighbouring steps for the surface tones that fall between them.
 *
 * Plain data, no React Native, like the rest of theme/.
 */

import { mix } from './color';
import type { ThemeMode } from './tokens';

export interface MaterialRoles {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  surfaceDim: string;
  surfaceBright: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  outline: string;
  outlineVariant: string;
}

export type TonalPaletteName = 'accent1' | 'accent2' | 'accent3' | 'neutral1' | 'neutral2';
/** Android's palette steps: "0" is white, "1000" black, "500" the mid tone. */
export type TonalPalette = Partial<Record<string, string>>;

export interface SystemColors {
  sdk: number;
  palettes: Partial<Record<TonalPaletteName, TonalPalette>>;
  /** Android 14+. Each role may be missing on a release that doesn't publish it. */
  light: Partial<MaterialRoles> | null;
  dark: Partial<MaterialRoles> | null;
}

/** Android's steps, as Material tones: step s is tone 100 - s / 10. */
const STEPS = [0, 10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

/** A Material tone (0-100) from an Android palette, blended between steps. */
export function toneOf(palette: TonalPalette | undefined, tone: number): string | null {
  if (!palette) return null;
  const step = (100 - tone) * 10;
  for (let i = 0; i < STEPS.length - 1; i++) {
    const a = STEPS[i];
    const b = STEPS[i + 1];
    if (step < a || step > b) continue;
    const ca = palette[String(a)];
    const cb = palette[String(b)];
    if (!ca || !cb) return ca ?? cb ?? null;
    return mix(ca, cb, (step - a) / (b - a));
  }
  return null;
}

/** Material 3's baseline error colours: no Android release publishes an error palette. */
const BASELINE_ERROR: Record<ThemeMode, Pick<MaterialRoles, 'error' | 'onError' | 'errorContainer' | 'onErrorContainer'>> = {
  light: { error: '#B3261E', onError: '#FFFFFF', errorContainer: '#F9DEDC', onErrorContainer: '#410E0B' },
  dark: { error: '#F2B8B5', onError: '#601410', errorContainer: '#8C1D18', onErrorContainer: '#F9DEDC' },
};

/** The roles at the Material 3 spec's tones, read off the tonal palettes. */
function rolesFromPalettes(colors: SystemColors, mode: ThemeMode): Partial<MaterialRoles> {
  const p = colors.palettes;
  const a1 = (t: number) => toneOf(p.accent1, t);
  const a2 = (t: number) => toneOf(p.accent2, t);
  const a3 = (t: number) => toneOf(p.accent3, t);
  const n1 = (t: number) => toneOf(p.neutral1, t);
  const n2 = (t: number) => toneOf(p.neutral2, t);
  const light = mode === 'light';
  const entries: [keyof MaterialRoles, string | null][] = light
    ? [
        ['primary', a1(40)], ['onPrimary', a1(100)], ['primaryContainer', a1(90)], ['onPrimaryContainer', a1(10)],
        ['secondary', a2(40)], ['onSecondary', a2(100)], ['secondaryContainer', a2(90)], ['onSecondaryContainer', a2(10)],
        ['tertiary', a3(40)], ['onTertiary', a3(100)], ['tertiaryContainer', a3(90)], ['onTertiaryContainer', a3(10)],
        ['background', n1(98)], ['onBackground', n1(10)], ['surface', n1(98)], ['onSurface', n1(10)],
        ['surfaceVariant', n2(90)], ['onSurfaceVariant', n2(30)], ['surfaceDim', n1(87)], ['surfaceBright', n1(98)],
        ['surfaceContainerLowest', n1(100)], ['surfaceContainerLow', n1(96)], ['surfaceContainer', n1(94)],
        ['surfaceContainerHigh', n1(92)], ['surfaceContainerHighest', n1(90)],
        ['outline', n2(50)], ['outlineVariant', n2(80)],
      ]
    : [
        ['primary', a1(80)], ['onPrimary', a1(20)], ['primaryContainer', a1(30)], ['onPrimaryContainer', a1(90)],
        ['secondary', a2(80)], ['onSecondary', a2(20)], ['secondaryContainer', a2(30)], ['onSecondaryContainer', a2(90)],
        ['tertiary', a3(80)], ['onTertiary', a3(20)], ['tertiaryContainer', a3(30)], ['onTertiaryContainer', a3(90)],
        ['background', n1(6)], ['onBackground', n1(90)], ['surface', n1(6)], ['onSurface', n1(90)],
        ['surfaceVariant', n2(30)], ['onSurfaceVariant', n2(80)], ['surfaceDim', n1(6)], ['surfaceBright', n1(24)],
        ['surfaceContainerLowest', n1(4)], ['surfaceContainerLow', n1(10)], ['surfaceContainer', n1(12)],
        ['surfaceContainerHigh', n1(17)], ['surfaceContainerHighest', n1(22)],
        ['outline', n2(60)], ['outlineVariant', n2(30)],
      ];
  const out: Partial<MaterialRoles> = { ...BASELINE_ERROR[mode] };
  for (const [role, value] of entries) if (value) out[role] = value;
  return out;
}

/** The roles every mapping needs; without them there is no usable scheme. */
const REQUIRED: (keyof MaterialRoles)[] = [
  'primary',
  'onPrimary',
  'surface',
  'onSurface',
  'surfaceContainer',
];

/**
 * The complete role set for a mode, or null when the system gave too little
 * to build one. Published roles win over palette-derived ones; any role still
 * missing is filled from its neighbours.
 */
export function materialRoles(colors: SystemColors | null, mode: ThemeMode): MaterialRoles | null {
  if (!colors) return null;
  const published = mode === 'light' ? colors.light : colors.dark;
  const r: Partial<MaterialRoles> = { ...rolesFromPalettes(colors, mode), ...(published ?? {}) };
  if (REQUIRED.some((role) => !r[role])) return null;

  const surface = r.surface!;
  const onSurface = r.onSurface!;
  const container = r.surfaceContainer!;
  const toward = mode === 'light' ? '#FFFFFF' : '#000000';
  const away = mode === 'light' ? '#000000' : '#FFFFFF';
  const filled: MaterialRoles = {
    primary: r.primary!,
    onPrimary: r.onPrimary!,
    primaryContainer: r.primaryContainer ?? mix(r.primary!, surface, 0.6),
    onPrimaryContainer: r.onPrimaryContainer ?? onSurface,
    secondary: r.secondary ?? r.primary!,
    onSecondary: r.onSecondary ?? r.onPrimary!,
    secondaryContainer: r.secondaryContainer ?? mix(r.secondary ?? r.primary!, surface, 0.7),
    onSecondaryContainer: r.onSecondaryContainer ?? onSurface,
    tertiary: r.tertiary ?? r.primary!,
    onTertiary: r.onTertiary ?? r.onPrimary!,
    tertiaryContainer: r.tertiaryContainer ?? mix(r.tertiary ?? r.primary!, surface, 0.6),
    onTertiaryContainer: r.onTertiaryContainer ?? onSurface,
    error: r.error ?? BASELINE_ERROR[mode].error,
    onError: r.onError ?? BASELINE_ERROR[mode].onError,
    errorContainer: r.errorContainer ?? BASELINE_ERROR[mode].errorContainer,
    onErrorContainer: r.onErrorContainer ?? BASELINE_ERROR[mode].onErrorContainer,
    background: r.background ?? surface,
    onBackground: r.onBackground ?? onSurface,
    surface,
    onSurface,
    surfaceVariant: r.surfaceVariant ?? container,
    onSurfaceVariant: r.onSurfaceVariant ?? mix(onSurface, surface, 0.3),
    surfaceDim: r.surfaceDim ?? surface,
    surfaceBright: r.surfaceBright ?? mix(container, away, 0.08),
    surfaceContainerLowest: r.surfaceContainerLowest ?? mix(surface, toward, 0.5),
    surfaceContainerLow: r.surfaceContainerLow ?? mix(surface, container, 0.5),
    surfaceContainer: container,
    surfaceContainerHigh: r.surfaceContainerHigh ?? mix(container, away, 0.05),
    surfaceContainerHighest: r.surfaceContainerHighest ?? mix(container, away, 0.1),
    outline: r.outline ?? mix(onSurface, surface, 0.45),
    outlineVariant: r.outlineVariant ?? mix(onSurface, surface, 0.75),
  };
  return filled;
}

/** A stable key for a role set, for memoising palettes built from it. */
export function rolesKey(roles: MaterialRoles | null): string {
  if (!roles) return '';
  return Object.values(roles).join('');
}
