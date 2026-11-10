import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { StackActions } from '@react-navigation/native';

import { IconHome, IconLibrary, IconSearch, type IconComponent } from './icons';
import { MiniPlayer } from './MiniPlayer';
import { useMotion, useSelectionPosition } from '../theme/motion';
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
 * selected one sits on a raised key that slides between them.
 *
 * While the keyboard is up the dock steps out of the way: over a keyboard
 * it would cover the very results being typed for, and nothing on it is
 * wanted mid-word.
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

/** Whether the software keyboard is showing. */
function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // iOS announces the keyboard before it moves, which is when the dock
    // should start leaving; Android only reports once it has.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const { timings } = useMotion();
  const keyboardUp = useKeyboardVisible();
  const [barWidth, setBarWidth] = useState(0);

  const position = useSelectionPosition(state.index);
  const slot = barWidth > 0 ? barWidth / state.routes.length : 0;
  const keyStyle = useAnimatedStyle(() => ({ transform: [{ translateX: position.value * slot }] }));

  // 0 in place, 1 tucked below the screen edge.
  const hidden = useSharedValue(0);
  useEffect(() => {
    hidden.value = withTiming(keyboardUp ? 1 : 0, keyboardUp ? timings.exit : timings.enter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboardUp, hidden]);
  const dockStyle = useAnimatedStyle(() => ({
    opacity: 1 - hidden.value,
    transform: [{ translateY: hidden.value * 40 }],
  }));

  const onBarLayout = useCallback((event: LayoutChangeEvent) => {
    setBarWidth(event.nativeEvent.layout.width);
  }, []);

  return (
    <Animated.View
      style={[styles.root, { bottom: Math.max(insets.bottom, space[3]) }, dockStyle]}
      // The area beside the dock must stay scrollable — and while it is
      // tucked away, so must the area it was covering.
      pointerEvents={keyboardUp ? 'none' : 'box-none'}
    >
      {/* Shadow and clip on separate views: a view that clips its own
          bounds can clip its own shadow too. */}
      <View style={styles.dockShadow}>
        <View style={styles.dock}>
          <MiniPlayer />

          <View style={styles.bar} onLayout={onBarLayout}>
            {slot > 0 && <Animated.View pointerEvents="none" style={[styles.key, { width: slot }, keyStyle]} />}
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
                  // Drawn in place until the bar has been measured and the
                  // sliding key exists.
                  style={[styles.item, focused && slot === 0 && styles.itemFocused]}
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
                    const depth = route.state?.index ?? 0;
                    if (stackKey && depth > 0) {
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
    </Animated.View>
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
  const { timings, springs } = useMotion();

  // The glyph dips and comes back as its tab takes focus: the press landing.
  // Not on mount — the tab the app opens on was not pressed.
  const scale = useSharedValue(1);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!focused) return;
    scale.value = withSequence(withTiming(0.86, timings.press), withSpring(1, springs.press));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, scale]);
  const glyphStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={styles.glyph}>
      <Animated.View style={glyphStyle}>
        <Icon
          size={22}
          strokeWidth={focused ? 2.1 : icon.strokeWidth}
          color={focused ? color.accent : color.labelSecondary}
        />
      </Animated.View>
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
    key: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      borderRadius: radius.lg,
      borderWidth: stroke,
      backgroundColor: color.surfaceRaised,
      borderColor: color.border,
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
