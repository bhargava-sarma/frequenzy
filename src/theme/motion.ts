import { useEffect, useRef } from 'react';
import {
  Easing,
  ReduceMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
  type WithSpringConfig,
  type WithTimingConfig,
} from 'react-native-reanimated';

import { useSettingsStore } from '../store/useSettingsStore';
import { motion } from './tokens';

/**
 * Motion vocabulary.
 *
 * Three kinds of movement, each with a reason to exist:
 *
 *   - Answering a touch. Keys travel down onto their lip, tiles give a
 *     little under the finger, a like lands with a small pop. Fast in,
 *     sprung out — the control responds before the action does.
 *   - Showing where things come from. Sheets and the player rise from the
 *     edge they can be dragged back to; a selection slides to its new
 *     segment rather than blinking there; content fades up once it has
 *     loaded instead of snapping over a spinner.
 *   - Saying the music is running. The level bars beside the playing row
 *     move, the record turns, the tape winds.
 *
 * Everything runs on the UI thread as a transform or an opacity, so none of
 * it waits on JavaScript and none of it lays anything out. Nothing drifts,
 * nothing loops for decoration.
 *
 * Reanimated already skips animations when the system asks for reduced
 * motion. The app's own Reduce motion setting does the same through
 * useMotion, for people who want it here but not everywhere.
 */

const easeOut = Easing.bezier(...motion.easing);
const easeIn = Easing.bezier(0.4, 0, 1, 1);
const emphasized = Easing.bezier(...motion.easingEmphasized);

export type TimingName = 'press' | 'fast' | 'appear' | 'enter' | 'exit' | 'crossfade';

/** Timing presets. Pass straight to withTiming. */
export const timings: Record<TimingName, WithTimingConfig> = {
  press: { duration: motion.durationPress, easing: easeOut },
  fast: { duration: motion.durationFast, easing: easeOut },
  appear: { duration: motion.durationAppear, easing: easeOut },
  enter: { duration: motion.durationBase, easing: emphasized },
  exit: { duration: motion.durationExit, easing: easeIn },
  /** Symmetric, so a crossfade has no moment where both colours look wrong. */
  crossfade: { duration: motion.durationCrossfade, easing: Easing.inOut(Easing.quad) },
};

export type SpringName = 'press' | 'select' | 'settle' | 'pop';

/**
 * Spring presets. Pass straight to withSpring.
 *
 * Described by duration and damping ratio rather than stiffness and mass:
 * the ratio is the thing being chosen. 1 settles without crossing its
 * target; just under 1 arrives with the faintest give, which is what makes a
 * moved thing feel moved rather than repositioned. Only `pop` is loose
 * enough to bounce, and it is used for exactly one thing.
 */
export const springs: Record<SpringName, WithSpringConfig> = {
  /** A control coming back up after a press. */
  press: { duration: 180, dampingRatio: 0.82 },
  /** A selection travelling to a new segment or tab. */
  select: { duration: 260, dampingRatio: 0.88 },
  /** Something dragged and let go: back to rest, no overshoot. */
  settle: { duration: 300, dampingRatio: 1, overshootClamping: true },
  /** A like landing. */
  pop: { duration: 320, dampingRatio: 0.5 },
};

const always = { reduceMotion: ReduceMotion.Always } as const;

/** The same presets, finishing on the next frame. */
const instantTimings: Record<TimingName, WithTimingConfig> = {
  press: { ...timings.press, ...always },
  fast: { ...timings.fast, ...always },
  appear: { ...timings.appear, ...always },
  enter: { ...timings.enter, ...always },
  exit: { ...timings.exit, ...always },
  crossfade: { ...timings.crossfade, ...always },
};

const instantSprings: Record<SpringName, WithSpringConfig> = {
  press: { ...springs.press, ...always },
  select: { ...springs.select, ...always },
  settle: { ...springs.settle, ...always },
  pop: { ...springs.pop, ...always },
};

export interface Motion {
  /** The Reduce motion setting. Check it before starting anything that loops. */
  reduce: boolean;
  timings: Record<TimingName, WithTimingConfig>;
  springs: Record<SpringName, WithSpringConfig>;
}

const full: Motion = { reduce: false, timings, springs };
const reduced: Motion = { reduce: true, timings: instantTimings, springs: instantSprings };

/**
 * The presets, honouring the Reduce motion setting. Read in a component and
 * capture in worklets — the objects are plain data, and stable, so they are
 * safe in dependency lists.
 */
export function useMotion(): Motion {
  const reduce = useSettingsStore((state) => state.reduceMotion);
  return reduce ? reduced : full;
}

/** Just the timing presets. */
export function useTimings(): Record<TimingName, WithTimingConfig> {
  return useMotion().timings;
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

/**
 * A position that springs to `index` when it changes — the travelling key
 * under a segmented control or the tab bar. Mounts already in place.
 */
export function useSelectionPosition(index: number): SharedValue<number> {
  const { springs: spring } = useMotion();
  const position = useSharedValue(index);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    position.value = withSpring(index, spring.select);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, position]);

  return position;
}

/**
 * 0 → 1 → 0 pulses for a press: `down()` on touch, `up()` on release.
 * Returns the shared value to drive a transform from.
 */
export function usePressProgress(): {
  pressed: SharedValue<number>;
  down: () => void;
  up: () => void;
} {
  const { timings: timing, springs: spring } = useMotion();
  const pressed = useSharedValue(0);
  // Stable across renders so a pressable holding them never re-subscribes.
  const handlers = useRef({
    down: () => {},
    up: () => {},
  });
  handlers.current.down = () => {
    pressed.value = withTiming(1, timing.press);
  };
  handlers.current.up = () => {
    pressed.value = withSpring(0, spring.press);
  };
  const stable = useRef({
    down: () => handlers.current.down(),
    up: () => handlers.current.up(),
  });
  return { pressed, down: stable.current.down, up: stable.current.up };
}
