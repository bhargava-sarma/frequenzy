import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * A fader: a recessed slot with a scale printed under it and a gripped cap
 * riding in it.
 *
 * Values snap to `step` and the phone ticks on each detent, so a setting can
 * be dialled by feel. The fill is plain React state: a settings fader is
 * dragged for a second at a time and its value has to reach the store
 * anyway, so there's nothing to gain from keeping it off the JS thread.
 */
export interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Rendered on the right, e.g. "40%". */
  readout?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

const CAP_WIDTH = 14;
const CAP_HEIGHT = 24;
const SCALE_MARKS = 11;

export function Slider({
  label,
  value,
  onChange,
  readout,
  min = 0,
  max = 1,
  step = 0.05,
  disabled = false,
}: SliderProps) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [width, setWidth] = useState(0);
  const last = useRef(value);

  const commit = useCallback(
    (x: number) => {
      if (width <= 0) return;
      const ratio = Math.min(1, Math.max(0, x / width));
      const raw = min + ratio * (max - min);
      const snapped = Math.round(raw / step) * step;
      // Rounded to kill floating-point dust like 0.30000000000000004.
      const next = Number(Math.min(max, Math.max(min, snapped)).toFixed(4));
      if (next !== last.current) {
        last.current = next;
        haptics.tick();
        onChange(next);
      }
    },
    [width, min, max, step, onChange],
  );

  const pan = Gesture.Pan()
    .enabled(!disabled && width > 0)
    .minDistance(0)
    .hitSlop({ top: 10, bottom: 10 })
    .onBegin((event) => runOnJS(commit)(event.x))
    .onUpdate((event) => runOnJS(commit)(event.x));

  const ratio = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  last.current = value;

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);

  return (
    <View style={[styles.root, disabled && styles.disabled]}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {readout != null && <Text style={styles.readout}>{readout}</Text>}
      </View>

      <GestureDetector gesture={pan}>
        <View style={styles.hitArea} onLayout={onLayout}>
          <View style={styles.slot}>
            <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: color.accent }]} />
          </View>
          {width > 0 && (
            <View
              style={[
                styles.cap,
                { left: Math.min(width - CAP_WIDTH, Math.max(0, ratio * width - CAP_WIDTH / 2)) },
              ]}
            >
              <View style={styles.capLine} />
            </View>
          )}
        </View>
      </GestureDetector>

      <View style={styles.scale}>
        {Array.from({ length: SCALE_MARKS }, (_, i) => (
          <View
            key={i}
            style={[styles.mark, (i === 0 || i === SCALE_MARKS - 1 || i === (SCALE_MARKS - 1) / 2) && styles.markMajor]}
          />
        ))}
      </View>
    </View>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: { paddingVertical: space[2] },
    disabled: { opacity: 0.4 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: space[1],
    },
    label: { ...type.callout, color: color.label },
    readout: { ...type.labelBold, color: color.accent },
    hitArea: { height: CAP_HEIGHT + 8, justifyContent: 'center' },
    slot: {
      height: 6,
      borderRadius: 3,
      backgroundColor: color.surfaceSunken,
      borderWidth: 1,
      borderColor: color.separator,
      overflow: 'hidden',
    },
    fill: { height: '100%' },
    cap: {
      position: 'absolute',
      width: CAP_WIDTH,
      height: CAP_HEIGHT,
      borderRadius: 4,
      backgroundColor: color.surfaceRaised,
      borderWidth: 1,
      borderColor: color.border,
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: '#00000033' }],
    },
    capLine: { width: 6, height: 1.5, borderRadius: 1, backgroundColor: color.accent },
    scale: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: CAP_WIDTH / 2 - 0.5,
      marginTop: 2,
    },
    mark: { width: 1, height: 4, backgroundColor: color.border },
    markMajor: { height: 7, backgroundColor: color.labelTertiary },
  });
