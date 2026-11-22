import { useMemo, useRef, type ReactNode } from 'react';
import {
  Animated,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from './IconButton';
import { IconChevronLeft } from './icons';
import { hairline, layout, space, type } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

/**
 * A detail screen's bar: transparent over the hero, a solid bar once the
 * hero has scrolled away.
 *
 *   - useCollapsingHeader() owns the scroll handler and derives a 0-1
 *     progress from it on the UI thread.
 *   - <NavBar> floats over the list. Its ground, hairline and compact title
 *     follow the scroll in — tied to your finger, never playing on their
 *     own — and its buttons are solid discs, legible over any artwork.
 *
 * Driven by React Native's own Animated with the native driver: the scroll
 * offset goes straight from the list to these views on the UI thread. The
 * Reanimated version it replaces committed a fresh shadow tree on every
 * scrolled frame on Android, and those commits queued against the rows the
 * list was mounting at the same moment — that was the stutter scrolling an
 * album or playlist. Nothing here reaches JavaScript while you scroll.
 */

type Progress = Animated.AnimatedInterpolation<number> | Animated.Value;

export interface CollapsingHeaderState {
  scrollY: Animated.Value;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** 0 with the hero showing, 1 with the bar fully in. */
  progress: Animated.AnimatedInterpolation<number>;
}

/**
 * `start`/`end`: scroll offsets over which the bar arrives. Attach
 * `onScroll` to one of React Native's Animated lists (Animated.FlatList
 * from 'react-native'), with scrollEventThrottle={16}.
 */
export function useCollapsingHeader(start = 140, end = 220): CollapsingHeaderState {
  const scrollY = useRef(new Animated.Value(0)).current;
  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      }) as (event: NativeSyntheticEvent<NativeScrollEvent>) => void,
    [scrollY],
  );
  const progress = useMemo(
    () => scrollY.interpolate({ inputRange: [start, end], outputRange: [0, 1], extrapolate: 'clamp' }),
    [scrollY, start, end],
  );
  return { scrollY, onScroll, progress };
}

export function useNavBarHeight(): number {
  const insets = useSafeAreaInsets();
  return insets.top + layout.navBarHeight;
}

export interface NavBarProps {
  title?: string;
  progress: Progress;
  onBack?: () => void;
  /** Actions on the right — IconButtons. */
  trailing?: ReactNode;
  /** Show the bar's ground from the start. */
  alwaysVisible?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function NavBar({
  title,
  progress,
  onBack,
  trailing,
  alwaysVisible = false,
  style,
}: NavBarProps) {
  const color = useTheme();
  const insets = useSafeAreaInsets();

  // The bar's ground and its compact title arrive together.
  const revealStyle = { opacity: alwaysVisible ? 1 : progress };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.bar, { height: insets.top + layout.navBarHeight, paddingTop: insets.top }, style]}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, revealStyle]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: color.background }]} />
        <View style={[styles.separator, { backgroundColor: color.separator }]} />
      </Animated.View>

      <View style={styles.row} pointerEvents="box-none">
        <View style={styles.side} pointerEvents="box-none">
          {onBack && (
            <IconButton
              icon={IconChevronLeft}
              accessibilityLabel="Back"
              onPress={onBack}
              size={38}
              iconSize={22}
            />
          )}
        </View>

        <Animated.Text
          style={[type.headline, styles.title, { color: color.label }, revealStyle]}
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

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  separator: { position: 'absolute', left: 0, right: 0, bottom: 0, height: hairline },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[3],
  },
  side: { minWidth: 84, flexDirection: 'row', alignItems: 'center', gap: space[2] },
  sideTrailing: { justifyContent: 'flex-end' },
  title: { flex: 1, textAlign: 'center', marginHorizontal: space[2] },
});
