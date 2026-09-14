import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { StackActions } from '@react-navigation/native';

import { Glass } from './Glass';
import { MiniPlayer } from './MiniPlayer';
import { SlidingPill } from './SlidingPill';
import { useToggleProgress } from '../theme/motion';
import { icon, layout, radius, space } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { emitSearchRequested } from '../utils/tabEvents';
import { IconHome, IconLibrary, IconSearch } from './icons';

/**
 * Floating liquid-glass dock — navigation and the mini-player as one object.
 *
 * Inset from all three edges and fully rounded, it reads as a single piece of
 * glass resting on the library rather than as screen chrome. It is one of the
 * few surfaces allowed a real blur: it floats over everything, and the
 * blurred list moving behind it is what makes it read as glass at all.
 *
 * The active tab sits on a sliding pill that springs between icons, stretching
 * as it travels, and the active icon swells slightly — so switching tabs is a
 * movement you can follow rather than a colour that changes.
 *
 * Because it floats over the list, screens have to reserve room for it — that
 * height is exported as DOCK_CLEARANCE rather than each screen guessing.
 */

const ICONS = {
  Home: IconHome,
  Search: IconSearch,
  Library: IconLibrary,
} as const;

/**
 * Bottom padding a scrolling screen needs so its last row clears the dock.
 *
 * Deliberately generous: it covers the dock with the mini-player showing, so
 * the final row stays reachable whether or not something is playing.
 */
export const DOCK_CLEARANCE = 164;

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.root, { bottom: Math.max(insets.bottom, space[3]) }]}
      // The dock is drawn over the list, so the area beside it must stay
      // scrollable rather than being swallowed by a full-width container.
      pointerEvents="box-none"
    >
      <Glass variant="regular" blur shadow radius={layout.dockRadius} style={styles.dock}>
        <MiniPlayer />

        <View style={styles.bar}>
          <SlidingPill index={state.index} count={state.routes.length} inset={4} />

          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const Icon = ICONS[route.name as keyof typeof ICONS];
            if (!Icon) return null;

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={route.name}
                style={styles.item}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (event.defaultPrevented) return;

                  if (!focused) {
                    navigation.navigate(route.name);
                    return;
                  }

                  /**
                   * Tapping the tab you are already on returns you to its top
                   * level — the standard shortcut out of a drill-down. The
                   * dispatch is targeted at the tab's own stack, since the tab
                   * navigator itself has nothing to pop.
                   */
                  const stackKey = route.state?.key;
                  if (stackKey) {
                    navigation.dispatch({ ...StackActions.popToTop(), target: stackKey });
                  }

                  // Search additionally raises the keyboard: coming back to a
                  // search screen almost always means searching for something
                  // else, and the field is what you came for.
                  if (route.name === 'Search') emitSearchRequested();
                }}
              >
                <TabIcon Icon={Icon} focused={focused} />
              </Pressable>
            );
          })}
        </View>
      </Glass>
    </View>
  );
}

/** Swells a little and brightens when its tab is chosen, on a spring. */
const TabIcon = memo(function TabIcon({
  Icon,
  focused,
}: {
  Icon: (typeof ICONS)[keyof typeof ICONS];
  focused: boolean;
}) {
  const color = useTheme();
  const on = useToggleProgress(focused);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.12 * on.value }],
    opacity: 0.62 + 0.38 * on.value,
  }));

  return (
    <Animated.View style={style}>
      <Icon
        size={24}
        strokeWidth={focused ? 2 : icon.strokeWidth}
        color={focused ? color.label : color.labelSecondary}
      />
    </Animated.View>
  );
});

const makeStyles = (_color: Palette) =>
  StyleSheet.create({
    root: {
      position: 'absolute',
      left: layout.dockMargin,
      right: layout.dockMargin,
    },
    dock: {
      // Clips the mini-player's artwork and progress line to the radius, so
      // the dock stays one shape rather than a stack of rectangles.
      overflow: 'hidden',
      borderRadius: layout.dockRadius,
    },
    bar: {
      flexDirection: 'row',
      marginHorizontal: space[2],
      marginBottom: space[2],
      marginTop: space[1],
      height: 50,
      borderRadius: radius.full,
    },
    item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  });
