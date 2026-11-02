import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { StackActions } from '@react-navigation/native';

import { IconHome, IconLibrary, IconSearch, type IconComponent } from './icons';
import { MiniPlayer } from './MiniPlayer';
import { icon, layout, radius, space, stroke, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { emitSearchRequested } from '../utils/tabEvents';
import { haptics } from '../utils/haptics';

/**
 * The dock: navigation and the mini player as one floating panel.
 *
 * Inset from three edges and fully rounded, it reads as one object resting
 * on the content rather than as screen chrome. It is solid — content never
 * shows through it. Tabs carry printed legends under their glyphs, and the
 * selected one sits on a raised key.
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
  const styles = useThemedStyles(makeStyles);

  return (
    <View
      style={[styles.root, { bottom: Math.max(insets.bottom, space[3]) }]}
      // The area beside the dock must stay scrollable.
      pointerEvents="box-none"
    >
      {/* Shadow and clip on separate views: a view that clips its own
          bounds can clip its own shadow too. */}
      <View style={styles.dockShadow}>
        <View style={styles.dock}>
          <MiniPlayer />

          <View style={styles.bar}>
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
                  style={[styles.item, focused && styles.itemFocused]}
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
        </View>
      </View>
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
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.glyph}>
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
    </View>
  );
});

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: { position: 'absolute', left: layout.dockMargin, right: layout.dockMargin },
    dockShadow: {
      borderRadius: layout.dockRadius,
      backgroundColor: color.surface,
      boxShadow: [
        {
          offsetX: 0,
          offsetY: 6,
          blurRadius: 18,
          spreadDistance: -6,
          color: color.mode === 'light' ? '#2A292533' : '#00000099',
        },
      ],
    },
    dock: {
      overflow: 'hidden',
      borderRadius: layout.dockRadius,
      borderWidth: stroke,
      borderColor: color.border,
    },
    bar: {
      flexDirection: 'row',
      marginHorizontal: space[2],
      marginBottom: space[2],
      marginTop: space[2],
      height: 54,
    },
    item: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.lg,
      borderWidth: stroke,
      borderColor: 'transparent',
    },
    itemFocused: { backgroundColor: color.surfaceRaised, borderColor: color.border },
    glyph: { alignItems: 'center', gap: 3 },
    legend: { fontSize: 9, letterSpacing: 1.1 },
  });
