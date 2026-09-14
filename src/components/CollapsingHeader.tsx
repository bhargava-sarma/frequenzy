import { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from './Glass';
import { PressScale } from './Pressable';
import { IconChevronRight } from './icons';
import { hairline, icon, layout, space, type } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Apple-style large title that collapses into a compact glass bar.
 *
 * Three pieces sharing one scroll value:
 *
 *   - useCollapsingHeader() owns the scroll handler and derives a 0-1
 *     collapse progress from it, entirely on the UI thread.
 *   - <LargeTitle> sits at the top of the list's content. It stretches a
 *     little when pulled past the top (iOS), and shrinks and fades as it
 *     scrolls up under the bar.
 *   - <GlassNavBar> floats over the list. Its glass background, hairline and
 *     compact title fade and rise in as the large title leaves.
 *
 * No state changes while scrolling: the handler writes a shared value and
 * every style is derived from it, so the JS thread never hears about scroll.
 *
 * For the bar's glass to really blur the list, render the bar as the overlay
 * of a GlassStage whose content holds the list — see BlurTarget.tsx.
 */

type Progress = SharedValue<number> | DerivedValue<number>;

export interface CollapsingHeaderOptions {
  /** Scroll distance over which the bar arrives. Default layout.headerCollapseDistance. */
  distance?: number;
}

export interface CollapsingHeaderState {
  /** Raw vertical content offset. Negative while overscrolled on iOS. */
  scrollY: SharedValue<number>;
  /** Pass to Animated.FlatList / Animated.ScrollView `onScroll`. */
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  /** 0 with the large title showing, 1 with the compact bar fully in. */
  progress: DerivedValue<number>;
  /** The distance in use, for components that interpolate against it. */
  distance: number;
}

export function useCollapsingHeader({
  distance = layout.headerCollapseDistance,
}: CollapsingHeaderOptions = {}): CollapsingHeaderState {
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Starts a little way in, so the bar does not begin to fill the instant a
  // finger touches the list.
  const progress = useDerivedValue(() =>
    interpolate(scrollY.value, [distance * 0.35, distance], [0, 1], Extrapolation.CLAMP),
  );

  return { scrollY, onScroll, progress, distance };
}

/** Height of the floating bar including the status bar inset. */
export function useNavBarHeight(): number {
  const insets = useSafeAreaInsets();
  return insets.top + layout.navBarHeight;
}

// ---------------------------------------------------------------------------
// Large title
// ---------------------------------------------------------------------------

export interface LargeTitleProps {
  title: string;
  scrollY: SharedValue<number>;
  /** Quiet line under the title, e.g. "128 albums". */
  subtitle?: string;
  /** Right-aligned slot level with the title, e.g. an avatar or a button. */
  trailing?: ReactNode;
  /** Must match the distance given to useCollapsingHeader. */
  distance?: number;
  style?: StyleProp<ViewStyle>;
}

/** Stretch cap when pulled down, so a hard pull can't blow the title up. */
const MAX_STRETCH = 1.12;

export function LargeTitle({
  title,
  scrollY,
  subtitle,
  trailing,
  distance = layout.headerCollapseDistance,
  style,
}: LargeTitleProps) {
  const color = useTheme();

  const animated = useAnimatedStyle(() => {
    const y = scrollY.value;
    if (y < 0) {
      return { opacity: 1, transform: [{ scale: Math.min(MAX_STRETCH, 1 - y / 700) }] };
    }
    return {
      opacity: interpolate(y, [0, distance * 0.8], [1, 0], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(y, [0, distance], [1, 0.92], Extrapolation.CLAMP) }],
    };
  });

  return (
    <View style={[styles.largeRow, style]}>
      <Animated.View style={[styles.largeText, animated]}>
        <Text style={[type.largeTitle, { color: color.label }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle != null && (
          <Text style={[type.subheadline, { color: color.labelSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </Animated.View>
      {trailing != null && <View style={styles.largeTrailing}>{trailing}</View>}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Compact glass bar
// ---------------------------------------------------------------------------

export interface GlassNavBarProps {
  /** Compact title, faded in as the bar arrives. Usually the large title's text. */
  title?: string;
  /** Collapse progress from useCollapsingHeader. */
  progress: Progress;
  /** Shows a back chevron in the leading slot. */
  onBack?: () => void;
  /** Leading slot when there is no back button. */
  leading?: ReactNode;
  /** Trailing actions — NavBarButtons, typically. */
  trailing?: ReactNode;
  /** Allow the bar's glass to blur. Default true. */
  blur?: boolean;
  /** Show the bar background from the start, e.g. on screens with no large title. */
  alwaysVisible?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function GlassNavBar({
  title,
  progress,
  onBack,
  leading,
  trailing,
  blur = true,
  alwaysVisible = false,
  style,
}: GlassNavBarProps) {
  const color = useTheme();
  const insets = useSafeAreaInsets();

  const backgroundStyle = useAnimatedStyle(() => ({
    opacity: alwaysVisible ? 1 : progress.value,
  }));

  const titleStyle = useAnimatedStyle(() => {
    const p = alwaysVisible ? 1 : progress.value;
    return { opacity: p, transform: [{ translateY: (1 - p) * 8 }] };
  });

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.bar,
        { height: insets.top + layout.navBarHeight, paddingTop: insets.top },
        style,
      ]}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, backgroundStyle]}>
        <Glass
          variant="regular"
          blur={blur}
          radius={0}
          border={false}
          sheen={false}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.separator, { backgroundColor: color.separator }]} />
      </Animated.View>

      <View style={styles.row} pointerEvents="box-none">
        <View style={styles.side} pointerEvents="box-none">
          {onBack ? (
            <NavBarButton
              accessibilityLabel="Back"
              onPress={onBack}
              backdrop={alwaysVisible ? undefined : progress}
              icon={
                <IconChevronRight
                  size={icon.size}
                  strokeWidth={2}
                  color={color.label}
                  style={styles.backIcon}
                />
              }
            />
          ) : (
            leading
          )}
        </View>

        <Animated.Text
          style={[type.headline, styles.title, { color: color.label }, titleStyle]}
          numberOfLines={1}
        >
          {title}
        </Animated.Text>

        <View style={[styles.side, styles.sideTrailing]} pointerEvents="box-none">
          {trailing}
        </View>
      </View>
    </View>
  );
}

export interface NavBarButtonProps {
  icon: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  /**
   * When given, the button carries its own small glass circle that fades out
   * as this progress reaches 1 — so it stays legible over a hero image before
   * the bar's background has arrived, without doubling up once it has.
   */
  backdrop?: Progress;
}

const BUTTON_SIZE = 36;

export function NavBarButton({ icon: glyph, onPress, accessibilityLabel, backdrop }: NavBarButtonProps) {
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop ? 1 - backdrop.value : 0,
  }));

  return (
    <PressScale
      noOrigin
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={space[2]}
      onPress={onPress}
      scaleTo={0.9}
      style={styles.button}
    >
      {backdrop && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Glass variant="thin" lite radius={BUTTON_SIZE / 2} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
      {glyph}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  largeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: layout.largeTitleHeight,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space[2],
  },
  largeText: {
    flex: 1,
    // Shrinks and stretches from the leading edge, as the platform title does.
    transformOrigin: 'left bottom',
  },
  largeTrailing: { marginLeft: space[3], paddingBottom: space[1] },

  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  separator: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: hairline,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[3],
  },
  side: {
    minWidth: BUTTON_SIZE + space[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  sideTrailing: { justifyContent: 'flex-end' },
  title: { flex: 1, textAlign: 'center', marginHorizontal: space[2] },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { transform: [{ rotate: '180deg' }] },
});
