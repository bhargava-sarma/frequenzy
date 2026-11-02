import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { IconAlertTriangle, type IconComponent } from './icons';
import { Keycap } from './Keycap';
import { Label } from './Label';
import { layout, radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemeControls, useThemedStyles } from '../theme/ThemeProvider';

/**
 * Loading, empty and error states.
 *
 * Typographic rather than a spinner: a centred platform spinner is exactly
 * the generic look this design avoids. Loading is three status lights
 * stepping in sequence above a printed label — a device thinking. The
 * lights switch rather than fade, and the states themselves simply appear.
 */

export const LoadingState = memo(function LoadingState({ label = 'Loading' }: { label?: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.root}>
      <SteppingLights />
      <Label tone="tertiary" style={styles.loadingLabel}>
        {label}
      </Label>
    </View>
  );
});

/** How long each light stays lit before the next one takes over. */
const STEP_MS = 320;

/**
 * Three lights, one lit at a time, stepping left to right. Each is simply
 * on or off — the way an LED is — so nothing fades or pulses. Under Reduce
 * motion all three sit half-lit.
 */
export function SteppingLights({ color: tint }: { color?: string }) {
  const color = useTheme();
  const { reduceMotion } = useThemeControls();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = setInterval(() => setStep((current) => (current + 1) % 3), STEP_MS);
    return () => clearInterval(timer);
  }, [reduceMotion]);

  const fill = tint ?? color.accent;
  return (
    <View style={stepStyles.row}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[stepStyles.dot, { backgroundColor: fill, opacity: reduceMotion ? 0.6 : i === step ? 1 : 0.25 }]}
        />
      ))}
    </View>
  );
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
    <View style={styles.root}>
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
    </View>
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
    <View style={styles.root}>
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
    </View>
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
