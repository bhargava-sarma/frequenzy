import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Display, DotText } from './Display';
import { Label } from './Label';
import { useMotion } from '../theme/motion';
import { radius, space, type } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * Figures shown the way a device shows them: dot-matrix numbers on the
 * black display, labelled in print beneath.
 */

export const StatTile = memo(function StatTile({
  label,
  value,
  unit,
  style,
  accent = false,
}: {
  label: string;
  value: string;
  unit?: string;
  style?: StyleProp<ViewStyle>;
  accent?: boolean;
}) {
  const color = useTheme();
  return (
    <Display style={[styles.tile, style]} radius={radius.md}>
      <Label tone="displayDim" size={9.5}>
        {label}
      </Label>
      <View style={styles.valueRow}>
        <DotText size={28} color={accent ? color.accent : undefined}>
          {value}
        </DotText>
        {unit ? (
          <Label tone="displayDim" size={9.5} style={styles.unit}>
            {unit}
          </Label>
        ) : null}
      </View>
    </Display>
  );
});

/**
 * Vertical level bars — a histogram as a row of meters. The tallest bar
 * lights in the accent; the rest sit in the display's dim ink.
 *
 * The bars rise from the baseline when the chart appears and again whenever
 * its figures change, the way a meter comes up to a new level: switching
 * the window from a week to a year is then visibly a new reading, not the
 * same picture redrawn. The whole row is one scaled view, anchored at its
 * foot, so two dozen bars cost one animation.
 */
export const BarChart = memo(function BarChart({
  values,
  labels,
  height = 84,
  highlight,
}: {
  values: number[];
  /** Printed under specific bars, by index. Sparse is fine. */
  labels?: Record<number, string>;
  height?: number;
  /** Index to light; defaults to the maximum. */
  highlight?: number;
}) {
  const color = useTheme();
  const { reduce, timings } = useMotion();
  const max = Math.max(1, ...values);
  const lit = highlight ?? values.indexOf(Math.max(...values));

  const rise = useSharedValue(reduce ? 1 : 0);
  const reading = values.join(',');
  useEffect(() => {
    if (reduce) {
      rise.value = 1;
      return;
    }
    rise.value = 0.15;
    rise.value = withTiming(1, { ...timings.appear, duration: 420 });
    // Replays for a new set of figures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading, reduce, rise]);
  const riseStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: rise.value }] }));

  return (
    <View>
      <Animated.View style={[styles.bars, { height }, riseStyle]}>
        {values.map((value, index) => {
          const level = value / max;
          return (
            <View key={index} style={styles.barSlot}>
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max(2, Math.round(level * height)),
                    backgroundColor:
                      value > 0 && index === lit ? color.accent : value > 0 ? color.displayInk : color.displayDim,
                    opacity: value > 0 && index !== lit ? 0.55 : 1,
                  },
                ]}
              />
            </View>
          );
        })}
      </Animated.View>
      {labels && (
        <View style={styles.labels}>
          {values.map((_, index) => (
            <View key={index} style={styles.barSlot}>
              {labels[index] != null && (
                <Text style={[type.label, styles.barLabel, { color: color.displayDim }]} numberOfLines={1}>
                  {labels[index]}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
});

/** Five square pips; tap one to rate, tap the lit end again to clear. */
export const RatingPips = memo(function RatingPips({
  value,
  onChange,
  size = 18,
}: {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
}) {
  const color = useTheme();
  return (
    <View style={styles.pips} accessibilityRole="adjustable" accessibilityValue={{ min: 0, max: 5, now: value }}>
      {[1, 2, 3, 4, 5].map((pip) => {
        const on = pip <= value;
        return (
          <Pressable
            key={pip}
            accessibilityRole="button"
            accessibilityLabel={`Rate ${pip}`}
            disabled={!onChange}
            hitSlop={6}
            onPress={() => {
              haptics.tick();
              onChange?.(pip === value ? 0 : pip);
            }}
            style={[
              {
                width: size,
                height: size,
                borderRadius: 4,
                borderWidth: 1.5,
                borderColor: on ? color.accent : color.border,
                backgroundColor: on ? color.accent : 'transparent',
              },
            ]}
          />
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  tile: { flex: 1, paddingHorizontal: space[3], paddingVertical: space[3] - 2, minHeight: 74 },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 4 },
  unit: { marginBottom: 6 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, transformOrigin: 'bottom' },
  barSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 2 },
  labels: { flexDirection: 'row', gap: 3, marginTop: 6 },
  barLabel: { fontSize: 8.5, letterSpacing: 0.4 },
  pips: { flexDirection: 'row', gap: 6 },
});
