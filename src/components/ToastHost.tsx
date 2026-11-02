import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  IconAlertTriangle,
  IconCheck,
  IconHeartBroken,
  IconHeartFilled,
  IconInfoCircle,
  IconListDetails,
  IconMoon,
  IconPlaylistAdd,
  IconRadio,
  IconCornerDownRight,
  type IconComponent,
} from './icons';
import { useTimings } from '../theme/motion';
import { radius, space, stroke, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { useToastStore, type Toast, type ToastIcon } from '../store/useToastStore';
import { haptics } from '../utils/haptics';

/**
 * Where toasts appear: a solid pill under the status bar.
 *
 * At the top rather than above the dock, so it never collides with the
 * dock, the mini player, a sheet or the keyboard, and it stays visible over
 * the full player. It fades in and out — no drop, no bounce — and a toast
 * arriving while one is up simply replaces its text. Tap or flick it up to
 * dismiss; an action, when there is one, is printed on its right.
 */

const ICONS: Record<ToastIcon, IconComponent> = {
  check: IconCheck,
  queue: IconListDetails,
  next: IconCornerDownRight,
  heart: IconHeartFilled,
  heartOff: IconHeartBroken,
  playlist: IconPlaylistAdd,
  moon: IconMoon,
  radio: IconRadio,
  error: IconAlertTriangle,
  info: IconInfoCircle,
};

export function ToastHost() {
  const current = useToastStore((state) => state.current);
  const dismiss = useToastStore((state) => state.dismiss);
  const insets = useSafeAreaInsets();
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { fast, exit } = useTimings();

  const [shown, setShown] = useState<Toast | null>(null);
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);
  const shownRef = useRef<Toast | null>(null);

  useEffect(() => {
    if (current) {
      shownRef.current = current;
      setShown(current);
      dragY.value = 0;
      progress.value = withTiming(1, fast);
      if (current.tone === 'error') haptics.error();

      const timer = setTimeout(() => dismiss(current.id), current.duration);
      return () => clearTimeout(timer);
    }

    if (shownRef.current) {
      progress.value = withTiming(0, exit, (finished) => {
        if (finished) runOnJS(clear)();
      });
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  function clear() {
    shownRef.current = null;
    setShown(null);
  }

  const pan = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .onUpdate((event) => {
      dragY.value = Math.min(0, event.translationY);
    })
    .onEnd((event) => {
      if (dragY.value < -24 || event.velocityY < -500) runOnJS(dismiss)(undefined);
      else dragY.value = withTiming(0, fast);
    });

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: dragY.value }],
  }));

  if (!shown) return null;

  const Icon = shown.icon ? ICONS[shown.icon] : null;
  const iconColor =
    shown.tone === 'error' ? color.destructive : shown.tone === 'success' ? color.ledGreen : color.accent;

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + space[2] }]}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.toast, style]} accessibilityLiveRegion="polite">
          <Pressable
            style={styles.body}
            onPress={() => dismiss(shown.id)}
            accessibilityRole="alert"
            accessibilityLabel={shown.detail ? `${shown.message}. ${shown.detail}` : shown.message}
          >
            {Icon && (
              <View style={[styles.iconDot, { backgroundColor: `${iconColor}22` }]}>
                <Icon size={15} color={iconColor} strokeWidth={2.25} />
              </View>
            )}
            <View style={styles.text}>
              <Text style={[type.callout, { color: color.label }]} numberOfLines={1}>
                {shown.message}
              </Text>
              {shown.detail ? (
                <Text style={[type.caption, { color: color.labelSecondary }]} numberOfLines={1}>
                  {shown.detail}
                </Text>
              ) : null}
            </View>
          </Pressable>
          {shown.action && (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => {
                haptics.tick();
                shown.action?.onPress();
                dismiss(shown.id);
              }}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <Text style={[type.labelBold, { color: color.accent }]}>{shown.action.label}</Text>
            </Pressable>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 100 },
    toast: {
      flexDirection: 'row',
      alignItems: 'center',
      maxWidth: '92%',
      minHeight: 48,
      borderRadius: radius.full,
      backgroundColor: color.surfaceRaised,
      borderWidth: stroke,
      borderColor: color.border,
      boxShadow: [
        {
          offsetX: 0,
          offsetY: 6,
          blurRadius: 16,
          spreadDistance: -4,
          color: color.mode === 'light' ? '#2A292533' : '#00000099',
        },
      ],
    },
    body: {
      flexShrink: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2] + 2,
      paddingLeft: space[2],
      paddingRight: space[4],
      paddingVertical: space[2],
    },
    iconDot: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: { flexShrink: 1 },
    action: { paddingRight: space[4], paddingLeft: space[1], paddingVertical: space[3] },
    pressed: { opacity: 0.5 },
  });
