import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { StackActions } from '@react-navigation/native';

import { MiniPlayer } from './MiniPlayer';
import { hairline, icon, layout, space } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { emitSearchRequested } from '../utils/tabEvents';
import { IconHome, IconLibrary, IconSearch } from './icons';

/**
 * Floating dock — navigation and the mini-player as one object.
 *
 * The bar used to be a full-width strip pinned to the bottom edge, which made
 * it read as screen chrome. Inset from all three edges with a large radius, it
 * reads instead as a single piece of hardware resting on top of the library —
 * which is what the mini-player was already trying to be on its own.
 *
 * Icon-only, three items, no labels. Active state is carried by icon color
 * alone: no background pill and no underline, so the dock stays flat rather
 * than reading like stock Material.
 *
 * Because it floats over the list, screens have to reserve room for it — that
 * height is exported as DOCK_CLEARANCE rather than each screen guessing.
 */

const ICONS = {
  Home: IconHome,
  Search: IconSearch,
  Library: IconLibrary,
} as const;

/** Inset from the screen edges on all three sides. */
const DOCK_MARGIN = space[3];

/**
 * Bottom padding a scrolling screen needs so its last row clears the dock.
 *
 * Deliberately generous: it covers the dock with the mini-player showing, so
 * the final row stays reachable whether or not something is playing.
 */
export const DOCK_CLEARANCE = 140;

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.root, { bottom: Math.max(insets.bottom, space[3]) }]}
      // The dock is drawn over the list, so the area beside it must stay
      // scrollable rather than being swallowed by a full-width container.
      pointerEvents="box-none"
    >
      <View style={styles.dock}>
        <MiniPlayer />

        <View style={styles.bar}>
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
                <Icon
                  size={22}
                  strokeWidth={icon.strokeWidth}
                  color={focused ? color.textInverse : color.textInverseSecondary}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: {
      position: 'absolute',
      left: DOCK_MARGIN,
      right: DOCK_MARGIN,
    },
    dock: {
      backgroundColor: color.panel,
      borderRadius: layout.dockRadius,
      borderWidth: hairline,
      borderColor: color.panelLine,
      // Clips the mini-player's artwork and progress line to the radius, so
      // the dock stays one shape rather than a stack of rectangles.
      overflow: 'hidden',
    },
    bar: {
      flexDirection: 'row',
      paddingVertical: space[3],
    },
    item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  });
