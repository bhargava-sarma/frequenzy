import { useEffect, useRef } from 'react';
import {
  Easing,
  ReduceMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
  type WithTimingConfig,
} from 'react-native-reanimated';

import { useSettingsStore } from '../store/useSettingsStore';
import { motion } from './tokens';

/**
 * Motion vocabulary.
 *
 * Only a handful of things move, and each for a reason: a sheet or the player
 * arrives from the edge it can be dragged back to, a switch changes sides,
 * the background follows a new cover. Everything is a short eased timing. No
 * springs anywhere — nothing overshoots, bounces or settles — and nothing
 * enters with a flourish, staggers in, scales under a finger or drifts on
 * its own.
 *
 * Reanimated already skips animations when the system asks for reduced
 * motion. The app's own Reduce motion setting does the same through
 * useTimings, for people who want it here but not everywhere.
 */

const easeOut = Easing.bezier(...motion.easing);
const easeIn = Easing.bezier(0.4, 0, 1, 1);

export type TimingName = 'fast' | 'enter' | 'exit' | 'crossfade';

/** Timing presets. Pass straight to withTiming. */
export const timings: Record<TimingName, WithTimingConfig> = {
  fast: { duration: motion.durationFast, easing: easeOut },
  enter: { duration: motion.durationBase, easing: easeOut },
  exit: { duration: motion.durationExit, easing: easeIn },
  /** Symmetric, so a crossfade has no moment where both colours look wrong. */
  crossfade: { duration: motion.durationCrossfade, easing: Easing.inOut(Easing.quad) },
};

/** The same presets, finishing on the next frame. */
const instant: Record<TimingName, WithTimingConfig> = {
  fast: { ...timings.fast, reduceMotion: ReduceMotion.Always },
  enter: { ...timings.enter, reduceMotion: ReduceMotion.Always },
  exit: { ...timings.exit, reduceMotion: ReduceMotion.Always },
  crossfade: { ...timings.crossfade, reduceMotion: ReduceMotion.Always },
};

/**
 * Timing presets that honour the Reduce motion setting. Read in a component
 * and capture in worklets — the objects are plain data.
 */
export function useTimings(): Record<TimingName, WithTimingConfig> {
  const reduce = useSettingsStore((state) => state.reduceMotion);
  return reduce ? instant : timings;
}

/**
 * 0 → 1 for a switch: eases across in the fast timing when `on` changes.
 * The first render takes the value directly — a switch mounting in its "on"
 * state appears on rather than sliding there.
 */
export function useSwitchProgress(on: boolean): SharedValue<number> {
  const { fast } = useTimings();
  const progress = useSharedValue(on ? 1 : 0);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    progress.value = withTiming(on ? 1 : 0, fast);
    // The timing is read when the switch flips, not tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, progress]);

  return progress;
}
