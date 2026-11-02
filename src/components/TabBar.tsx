import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { StackActions } from '@react-navigation/native';

import { Glass } from './Glass';
import { IconHome, IconLibrary, IconSearch, type IconComponent } from './icons';
import { MiniPlayer } from './MiniPlayer';
import { SlidingPill } from './SlidingPill';
import { useToggleProgress } from '../theme/motion';
import { icon, layout, radius, space, type } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { emitSearchRequested } from '../utils/tabEvents';
import { haptics } from '../utils/haptics';

/**
 * The dock: navigation and the mini player as one floating slab of glass.
 *
 * Inset from three edges and fully rounded, it reads as one object resting
 * on the content rather than as screen chrome, and it is one of the few
 * surfaces that really blurs what passes behind it. Tabs carry printed
 * legends under their glyphs; the selection is a raised key that slides
 * between them.
 *
 * Screens reserve room for it with DOCK_CLEARANCE, sized for the dock with
 * the mini player showing, so a list's last row is always reachable.
 */

const TABS: Record<string, { icon: IconComponent; label: string }> = {
  Home: { icon: IconHome, label: 'Home' },
  Search: { icon: IconSearch, label: 'Search' },
  Library: { icon: IconLibrary, label: 'Library' },
};

export const DOCK_CLEARANCE = 168;

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.root, { bottom: Math.max(insets.bottom, space[3]) }]}
      // The area beside the dock must stay scrollable.
      pointerEvents="box-none"
    >
      <Glass variant="regular" blur shadow radius={layout.dockRadius} style={styles.dock}>
        <MiniPlayer />

        <View style={styles.bar}>
          <SlidingPill index={state.index} count={state.routes.length} inset={0} radius={radius.lg} />

          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const tab = TABS[route.name];
            if (!tab) return null;

            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={tab.label}
                style={styles.item}
                onPress={() => {
                  haptics.tick();
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

                  // Tapping the tab you're on returns to its top level — the
                  // standard way out of a drill-down. Targeted at the tab's own
                  // stack; the tab navigator has nothing to pop.
                  const stackKey = route.state?.key;
                  if (stackKey) {
                    navigation.dispatch({ ...StackActions.popToTop(), target: stackKey });
                  }
                  // Coming back to Search almost always means searching again.
                  if (route.name === 'Search') emitSearchRequested();
                }}
              >
                <TabGlyph Icon={tab.icon} label={tab.label} focused={focused} />
              </Pressable>
            );
          })}
        </View>
      </Glass>
    </View>
  );
}

const TabGlyph = memo(function TabGlyph({
  Icon,
  label,
  focused,
}: {
  Icon: IconComponent;
  label: string;
  focused: boolean;
}) {
  const color = useTheme();
  const on = useToggleProgress(focused);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -on.value * 1 }, { scale: 1 + 0.06 * on.value }],
  }));

  return (
    <Animated.View style={[styles.glyph, style]}>
      <Icon
        size={22}
        strokeWidth={focused ? 2.1 : icon.strokeWidth}
        color={focused ? color.accent : color.labelSecondary}
      />
      <Text
        style={[type.labelBold, styles.legend, { color: focused ? color.label : color.labelTertiary }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  root: { position: 'absolute', left: layout.dockMargin, right: layout.dockMargin },
  dock: { overflow: 'hidden', borderRadius: layout.dockRadius },
  bar: {
    flexDirection: 'row',
    marginHorizontal: space[2],
    marginBottom: space[2],
    marginTop: space[2],
    height: 54,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glyph: { alignItems: 'center', gap: 3 },
  legend: { fontSize: 9, letterSpacing: 1.1 },
});
