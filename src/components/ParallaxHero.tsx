import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { layout } from '../theme/tokens';

/**
 * A detail screen's hero — artwork, title block — that reacts to the scroll
 * of the list it heads.
 *
 * Scrolling up, it drifts at a fraction of the scroll speed, shrinks a touch
 * and fades, so the list appears to slide over it rather than pushing it off.
 * Pulled down past the top, it grows to fill the gap from its top edge, the
 * way a stretchy header does.
 *
 * The pull only exists where the scroll offset can go negative, which is iOS.
 * Android lists don't bounce: on Android 12+ the platform's own stretch
 * overscroll already stretches the whole list, hero included, and faking a
 * second stretch on top of it would need a gesture competing with the list's
 * own scrolling — exactly the kind of thing that makes a list feel wrong.
 *
 * Placed as (or inside) ListHeaderComponent, driven by the scrollY from
 * useCollapsingHeader. Transforms only, so it touches no layout per frame.
 */

export interface HeroMotionOptions {
  /** Fraction of scroll distance the hero moves with. 0.5 = half speed. */
  parallax?: number;
  /** Fade out as it scrolls away. Default true. */
  fade?: boolean;
  /** Shrink slightly as it scrolls away. Default true. */
  shrink?: boolean;
}

/**
 * The hero's animated style on its own, for layouts where the hero is not a
 * simple block — e.g. only the artwork should parallax while the title below
 * it scrolls normally.
 */
export function useParallaxHeroStyle(
  scrollY: SharedValue<number>,
  height: number,
  { parallax = 0.5, fade = true, shrink = true }: HeroMotionOptions = {},
) {
  return useAnimatedStyle(() => {
    const y = scrollY.value;

    if (y < 0) {
      // Grow by exactly the overscroll, anchored to the top of the screen:
      // scaling about the centre adds half the growth above and half below,
      // so shifting up by half the pull keeps the top edge pinned.
      return {
        opacity: 1,
        transform: [{ translateY: y / 2 }, { scale: 1 + -y / height }],
      };
    }

    return {
      opacity: fade ? interpolate(y, [0, height * 0.85], [1, 0], Extrapolation.CLAMP) : 1,
      transform: [
        { translateY: y * parallax },
        { scale: shrink ? interpolate(y, [0, height], [1, 0.92], Extrapolation.CLAMP) : 1 },
      ],
    };
  });
}

export interface ParallaxHeroProps extends HeroMotionOptions {
  scrollY: SharedValue<number>;
  children: ReactNode;
  /** Height reserved in the list. Default layout.heroHeight. */
  height?: number;
  /** Style of the reserved block. */
  style?: StyleProp<ViewStyle>;
  /** Style of the moving content — alignment, padding. */
  contentStyle?: StyleProp<ViewStyle>;
}

export function ParallaxHero({
  scrollY,
  children,
  height = layout.heroHeight,
  style,
  contentStyle,
  parallax,
  fade,
  shrink,
}: ParallaxHeroProps) {
  const animated = useParallaxHeroStyle(scrollY, height, { parallax, fade, shrink });

  return (
    <View style={[{ height }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.content, contentStyle, animated]}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', justifyContent: 'flex-end' },
});
