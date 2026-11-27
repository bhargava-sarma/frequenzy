import { Platform, Vibration } from 'react-native';

import { systemHaptic, type SystemHaptic } from '../native/materialYou';
import { getSettings } from '../store/useSettingsStore';

/**
 * Tactile feedback, the click of a hardware key.
 *
 * On Android it goes through the system's own haptic effects (the app's
 * native module — see native/materialYou): a segment tick, a key tap, a
 * confirm, a toggle — the same vocabulary the rest of Android 16 speaks, tuned
 * for the phone's motor and following the system's touch-feedback setting.
 * Without the module (an older build running this code) it falls back to a
 * few milliseconds of plain vibration. Everything is gated on the user's
 * setting.
 *
 * iOS ignores vibration durations and always buzzes for ~400ms, which would
 * be the opposite of a tick, so it is skipped there entirely.
 */

function feel(kind: SystemHaptic, fallback: number | number[]) {
  if (Platform.OS === 'ios') return;
  if (!getSettings().haptics) return;
  if (systemHaptic(kind)) return;
  try {
    Vibration.vibrate(fallback);
  } catch {
    // Feedback is never worth failing an action over.
  }
}

export const haptics = {
  /** Selection changes: a segment, a chip, a scrub detent. */
  tick: () => feel('tick', 5),
  /** A key press that does something: play, skip, like. */
  press: () => feel('press', 10),
  /** Committing a swipe action, long-press menus. */
  heavy: () => feel('heavy', 18),
  /** Something completed: added to a playlist, a check passed. */
  success: () => feel('success', [0, 8, 60, 14]),
  /** Something failed. */
  error: () => feel('error', [0, 18, 50, 18]),
  /** A switch turned on, or off. */
  toggle: (on: boolean) => feel(on ? 'toggleOn' : 'toggleOff', 5),
  /** A drag crossing the point where letting go would act. */
  threshold: () => feel('threshold', 8),
};
