import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { MiniPlayer } from './MiniPlayer';
import { color, hairline, icon, space } from '../theme/tokens';
import { IconHome, IconLibrary, IconPlaylist, IconSearch } from './icons';

/**
 * Bottom navigation, per spec 5.4.
 *
 * Icon-only, four items, no labels. Active state is carried by icon color
 * alone — no background pill and no underline, which is what keeps the bar
 * flat rather than reading like stock Material.
 *
 * The mini-player sits above the bar inside the same component so the two
 * move as one unit and share the safe-area inset, rather than each guessing
 * at the other's height.
 */

const ICONS = {
  Home: IconHome,
  Search: IconSearch,
  Library: IconLibrary,
  Queue: IconPlaylist,
} as const;

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <MiniPlayer />

      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space[2]) }]}>
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
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
            >
              <Icon
                size={22}
                strokeWidth={icon.strokeWidth}
                color={focused ? color.textPrimary : color.textSecondary}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: color.paper },
  bar: {
    flexDirection: 'row',
    borderTopWidth: hairline,
    borderTopColor: color.paperLine,
    paddingTop: space[3],
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
