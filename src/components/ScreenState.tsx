import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { IconAlertTriangle, type IconComponent } from './icons';
import { Keycap } from './Keycap';
import { Label } from './Label';
import { layout, motion, radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemeControls, useThemedStyles } from '../theme/ThemeProvider';

/**
 * Loading, empty and error states.
 *
 * Typographic rather than a spinner: a centred platform spinner is exactly
 * the generic look this design avoids. Loading is three status lights
 * stepping in sequence above a printed label — a device thinking.
 */

export const LoadingState = memo(function LoadingState({ label = 'Loading' }: { label?: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Animated.View style={styles.root} entering={FadeIn.duration(motion.durationBase).delay(120)}>
      <SteppingLights />
      <Label tone="tertiary" style={styles.loadingLabel}>
        {label}
      </Label>
    </Animated.View>
  );
});

/** Three dots lighting one after another. */
export function SteppingLights({ color: tint }: { color?: string }) {
  const color = useTheme();
  return (
    <View style={stepStyles.row}>
      {[0, 1, 2].map((i) => (
        <StepDot key={i} index={i} color={tint ?? color.accent} />
      ))}
    </View>
  );
}

function StepDot({ index, color }: { index: number; color: string }) {
  const { reduceMotion } = useThemeControls();
  const level = useSharedValue(0.25);

  useEffect(() => {
    if (reduceMotion) {
      level.value = 0.6;
      return;
    }
    level.value = withDelay(
      index * 180,
      withRepeat(
        withSequence(withTiming(1, { duration: 260 }), withTiming(0.25, { duration: 280 }), withTiming(0.25, { duration: 260 })),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(level);
  }, [index, level, reduceMotion]);

  const style = useAnimatedStyle(() => ({ opacity: level.value }));
  return <Animated.View style={[stepStyles.dot, { backgroundColor: color }, style]} />;
}

export interface EmptyStateProps {
  label: string;
  hint?: string;
  icon?: IconComponent;
  action?: { label: string; onPress: () => void };
}

export const EmptyState = memo(function EmptyState({ label, hint, icon: Icon, action }: EmptyStateProps) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Animated.View style={styles.root} entering={FadeIn.duration(motion.durationBase)}>
      {Icon && (
        <View style={styles.iconWell}>
          <Icon size={22} color={color.labelSecondary} strokeWidth={1.75} />
        </View>
      )}
      <Text style={styles.title}>{label}</Text>
      {hint != null && <Text style={styles.hint}>{hint}</Text>}
      {action && (
        <View style={styles.action}>
          <Keycap label={action.label} size="sm" onPress={action.onPress} />
        </View>
      )}
    </Animated.View>
  );
});

export const ErrorState = memo(function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Animated.View style={styles.root} entering={FadeIn.duration(motion.durationBase)}>
      <View style={[styles.iconWell, { borderColor: color.destructive }]}>
        <IconAlertTriangle size={22} color={color.destructive} strokeWidth={1.75} />
      </View>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.hint} numberOfLines={4}>
        {message}
      </Text>
      {onRetry && (
        <View style={styles.action}>
          <Keycap label="Try again" size="sm" onPress={onRetry} />
        </View>
      )}
    </Animated.View>
  );
});

const stepStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
});

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: layout.screenPadding * 2,
      paddingVertical: space[8],
    },
    loadingLabel: { marginTop: space[3] },
    iconWell: {
      width: 52,
      height: 52,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: color.border,
      backgroundColor: color.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space[4],
    },
    title: { ...type.headline, color: color.label, textAlign: 'center' },
    hint: {
      ...type.footnote,
      color: color.labelSecondary,
      marginTop: space[2],
      textAlign: 'center',
      lineHeight: 18,
    },
    action: { marginTop: space[5] },
  });
