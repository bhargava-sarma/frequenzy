import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
  type WithSpringConfig,
  type WithTimingConfig,
} from 'react-native-reanimated';

import { motion, springs as springTokens } from './tokens';

/**
 * Motion vocabulary for the redesign.
 *
 * Everything that moves because of a finger, or settles into a new place,
 * springs. Timings remain for the things a spring would make worse: colour
 * crossfades (a spring overshooting a colour is a flash), and opacity fades
 * where there is no physical position to overshoot.
 *
 * All of it runs on the UI thread. Nothing here schedules work on the JS
 * thread per frame, so a busy JS thread — a list rendering, a fetch landing —
 * never makes a press or an entrance stutter.
 */

// ---------------------------------------------------------------------------
// Springs and timings
// ---------------------------------------------------------------------------

export type SpringName = keyof typeof springTokens;

/** Reanimated-typed spring presets. Pass straight to withSpring. */
export const springs: Record<SpringName, WithSpringConfig> = springTokens;

const easeOut = Easing.bezier(...motion.easing);

/** Timing presets for fades and colour changes. */
export const timings = {
  fast: { duration: motion.durationFast, easing: easeOut },
  base: { duration: motion.durationBase, easing: easeOut },
  screen: { duration: motion.durationScreen, easing: easeOut },
  /** Symmetric, so a crossfade has no moment where both colours look wrong. */
  crossfade: { duration: motion.durationCrossfade, easing: Easing.inOut(Easing.quad) },
} satisfies Record<string, WithTimingConfig>;

// ---------------------------------------------------------------------------
// Layout animation builders
// ---------------------------------------------------------------------------

/** How far a staggered item rises from, in points. */
const STAGGER_DISTANCE = 14;

/**
 * Builders are mutable (`.delay()` writes to the instance), so one cannot be
 * shared between indexes. They are cached per index instead: a list renders
 * the same first ten indexes every time it mounts, and allocating a fresh
 * builder for each row on every render is garbage for no reason.
 */
const staggerCache: FadeInDown[] = [];

/**
 * Entrance for the item at `index` in a list: a short rise and fade on a
 * spring, delayed by its position.
 *
 * Returns undefined for indexes past motion.staggerMaxItems. Those items are
 * below the fold on any phone, and the delay cap exists so a long list never
 * makes its visible rows wait for rows nobody can see.
 *
 * Prefer useStaggeredEntrance in lists — this builder alone replays for every
 * row FlatList mounts while scrolling.
 */
export function staggeredEntrance(index: number): FadeInDown | undefined {
  if (index < 0 || index >= motion.staggerMaxItems) return undefined;

  let builder = staggerCache[index];
  if (!builder) {
    // Instance methods return `this`; the static shortcuts return the base
    // builder type, which the `entering` prop's typing no longer accepts.
    builder = new FadeInDown()
      .withInitialValues({
      opacity: 0,
      transform: [{ translateY: STAGGER_DISTANCE }],
    })
      .springify()
      .damping(springTokens.layout.damping)
      .stiffness(springTokens.layout.stiffness)
      .mass(springTokens.layout.mass)
      .delay(Math.min(index * motion.staggerStep, motion.staggerMaxDelay));
    staggerCache[index] = builder;
  }
  return builder;
}

/**
 * How long after a list's first row renders that later rows still stagger in.
 *
 * FlatList renders its initial batch over a few frames; anything mounting
 * after this window is a row scrolled into view or added by Load more, and
 * animating those reads as the list stuttering rather than arriving.
 */
const STAGGER_WINDOW_MS = 500;

export interface StaggeredEntrance {
  /** Entering animation for the row at `index`, or undefined if it should just appear. */
  entering: (index: number) => FadeInDown | undefined;
  /** Re-arms the entrance, e.g. when a segmented control swaps the list's contents. */
  reset: () => void;
}

/**
 * A staggered list entrance that plays once, on first appearance.
 *
 * The window opens when the first row asks for its animation rather than when
 * the screen mounts: data usually arrives after the screen, and a window
 * timed from mount would expire before there was anything to animate.
 *
 * Usage — the entering prop goes on a wrapper, never on the memoised row
 * itself, so the row's props stay stable:
 *
 *   const { entering } = useStaggeredEntrance();
 *   renderItem={({ item, index }) => (
 *     <Animated.View entering={entering(index)}>
 *       <TrackRow ... />
 *     </Animated.View>
 *   )}
 */
export function useStaggeredEntrance(): StaggeredEntrance {
  const openedAt = useRef<number | null>(null);

  const entering = useCallback((index: number) => {
    if (index >= motion.staggerMaxItems) return undefined;
    const now = Date.now();
    if (openedAt.current == null) openedAt.current = now;
    if (now - openedAt.current > STAGGER_WINDOW_MS) return undefined;
    return staggeredEntrance(index);
  }, []);

  const reset = useCallback(() => {
    openedAt.current = null;
  }, []);

  return useMemo(() => ({ entering, reset }), [entering, reset]);
}

/** Ready-made entering animations. Each call returns a fresh builder. */
export const enter = {
  /** Plain fade, for content replacing a placeholder in place. */
  fade: (delay = 0) => FadeIn.duration(motion.durationBase).delay(delay),
  /** Rise and fade on a spring — cards, sections, a hero arriving. */
  rise: (delay = 0) =>
    new FadeInDown()
      .withInitialValues({ opacity: 0, transform: [{ translateY: STAGGER_DISTANCE }] })
      .springify()
      .damping(springTokens.layout.damping)
      .stiffness(springTokens.layout.stiffness)
      .mass(springTokens.layout.mass)
      .delay(delay),
  /**
   * Scale up from slightly small. Starts at 0.9 rather than ZoomIn's zero,
   * which reads as a cartoon pop rather than as something settling.
   */
  pop: (delay = 0) =>
    new ZoomIn()
      .withInitialValues({ transform: [{ scale: 0.9 }] })
      .springify()
      .damping(springTokens.snappy.damping)
      .stiffness(springTokens.snappy.stiffness)
      .mass(springTokens.snappy.mass)
      .delay(delay),
};

/** Ready-made exiting animations. */
export const exit = {
  fade: () => FadeOut.duration(motion.durationFast),
};

/**
 * Layout transition for items that move when their neighbours change —
 * reordering, a row removed from the queue, a chip appearing.
 */
export const layoutTransition = () =>
  LinearTransition.springify()
    .damping(springTokens.layout.damping)
    .stiffness(springTokens.layout.stiffness)
    .mass(springTokens.layout.mass);

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface PressSpring {
  /** Apply to an Animated.View / animated pressable. */
  animatedStyle: ReturnType<typeof useAnimatedStyle>;
  onPressIn: () => void;
  onPressOut: () => void;
  /** 0 at rest, 1 fully pressed — for dimming or highlight layers. */
  pressed: SharedValue<number>;
}

/**
 * Spring press feedback for anything that isn't a PressScale.
 *
 * Presses in on a stiff spring so the response lands under the finger, and
 * releases on a looser one so it comes back with a little life.
 */
export function usePressSpring(scaleTo: number = motion.pressScale): PressSpring {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (scaleTo - 1) * pressed.value }],
  }));

  const onPressIn = useCallback(() => {
    pressed.value = withSpring(1, springs.press);
  }, [pressed]);

  const onPressOut = useCallback(() => {
    pressed.value = withSpring(0, springs.release);
  }, [pressed]);

  return { animatedStyle, onPressIn, onPressOut, pressed };
}

/**
 * A shared value that springs to `target` whenever it changes.
 *
 * The first render takes the target directly — a control mounting in its
 * "on" state should appear on, not animate there.
 */
export function useSpringValue(
  target: number,
  config: WithSpringConfig = springs.snappy,
): SharedValue<number> {
  const value = useSharedValue(target);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    value.value = withSpring(target, config);
    // config is expected to be one of the module-level presets; a literal
    // passed here would restart the spring on every render.
  }, [target, config, value]);

  return value;
}

/** 0 → 1 spring for a boolean: toggles, selected states, morphing icons. */
export function useToggleProgress(
  on: boolean,
  config: WithSpringConfig = springs.snappy,
): SharedValue<number> {
  return useSpringValue(on ? 1 : 0, config);
}

/**
 * 0 → 1 once on mount, after an optional delay. For a single element's
 * entrance where a layout animation builder is awkward — e.g. driving several
 * derived styles from one progress.
 */
export function useMountProgress(
  delay = 0,
  config: WithSpringConfig = springs.gentle,
): SharedValue<number> {
  const progress = useSharedValue(0);

  useEffect(() => {
    const start = () => {
      progress.value = withSpring(1, config);
    };
    if (delay <= 0) {
      start();
      return;
    }
    // A one-shot delay before a UI-thread animation starts, not an animation
    // loop — the spring itself still runs entirely on the UI thread.
    const handle = setTimeout(start, delay);
    return () => clearTimeout(handle);
  }, [delay, config, progress]);

  return progress;
}

/** Fade helper for places that genuinely want a timing, not a spring. */
export function fadeTo(value: number, preset: keyof typeof timings = 'base') {
  'worklet';
  return withTiming(value, timings[preset]);
}
