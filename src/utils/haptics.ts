import { Platform, Vibration } from 'react-native';

import { getSettings } from '../store/useSettingsStore';

/**
 * Tactile feedback, the click of a hardware key.
 *
 * Built on the core Vibration module rather than a haptics package: a new
 * native dependency would move the project fingerprint and force a rebuild,
 * while this ships over the air. Android's default manifest already carries
 * the VIBRATE permission. Durations are a few milliseconds — a tick, not a
 * buzz — and everything is gated on the user's setting.
 *
 * iOS ignores durations and always buzzes for ~400ms, which would be the
 * opposite of a tick, so it is skipped there entirely.
 */

function vibrate(pattern: number | number[]) {
  if (Platform.OS === 'ios') return;
  if (!getSettings().haptics) return;
  try {
    Vibration.vibrate(pattern);
  } catch {
    // Feedback is never worth failing an action over.
  }
}

export const haptics = {
  /** Selection changes: a segment, a chip, a scrub detent. */
  tick: () => vibrate(5),
  /** A key press that does something: play, skip, like. */
  press: () => vibrate(10),
  /** Committing a swipe action, long-press menus. */
  heavy: () => vibrate(18),
  /** Something completed: added to a playlist, a check passed. */
  success: () => vibrate([0, 8, 60, 14]),
  /** Something failed. */
  error: () => vibrate([0, 18, 50, 18]),
};
