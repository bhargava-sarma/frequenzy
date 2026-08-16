import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { hairline, layout, radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

/**
 * A continuous control, for settings that are a degree rather than a choice.
 *
 * Written rather than pulled in: the community slider is a native module, so
 * adding it would mean another build, and this needs a track, a fill and a
 * knob — all of which this app already draws on the progress bar.
 *
 * The fill is driven by React state rather than an animated style. A settings
 * slider is dragged for a second at a time and its value has to reach the
 * theme provider anyway, so there is nothing to gain from keeping it off the
 * JS thread and a worklet's worth of complexity to lose.
 */
export interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Rendered on the right, e.g. "40%". */
  readout?: string;
  min?: number;
  max?: number;
  /** Values snap to this. Keeps the readout from jittering. */
  step?: number;
  disabled?: boolean;
}

const KNOB_SIZE = 18;

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

  const [trackWidth, setTrackWidth] = useState(0);
  const width = useSharedValue(0);
  width.value = trackWidth;

  function commit(x: number) {
    if (trackWidth <= 0) return;
    const ratio = Math.min(1, Math.max(0, x / trackWidth));
    const raw = min + ratio * (max - min);
    const snapped = Math.round(raw / step) * step;
    // Rounded to kill floating-point dust like 0.30000000000000004.
    onChange(Number(Math.min(max, Math.max(min, snapped)).toFixed(4)));
  }

  const pan = Gesture.Pan()
    .enabled(!disabled && trackWidth > 0)
    // Responds on touch so a tap sets the value rather than needing a drag.
    .minDistance(0)
    .onBegin((event) => runOnJS(commit)(event.x))
    .onUpdate((event) => runOnJS(commit)(event.x));

  const ratio = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;

  return (
    <View style={[styles.root, disabled && styles.disabled]}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {readout != null && <Text style={styles.readout}>{readout}</Text>}
      </View>

      <GestureDetector gesture={pan}>
        {/* Padding is the hit area; the track itself stays thin. */}
        <View style={styles.hitArea}>
          <View
            style={styles.track}
            onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
          >
            <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
            {trackWidth > 0 && (
              <View
                style={[
                  styles.knob,
                  {
                    left: Math.min(
                      trackWidth - KNOB_SIZE,
                      Math.max(0, ratio * trackWidth - KNOB_SIZE / 2),
                    ),
                    backgroundColor: color.accent,
                  },
                ]}
              />
            )}
          </View>
        </View>
      </GestureDetector>
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
      marginBottom: space[2],
    },
    label: { ...type.label, color: color.textSecondary },
    readout: { ...type.numeral, color: color.textSecondary },

    hitArea: { paddingVertical: space[3], justifyContent: 'center' },
    track: {
      height: layout.progressHeight,
      borderRadius: radius.sm,
      backgroundColor: color.paperLine,
      justifyContent: 'center',
    },
    fill: { height: '100%', backgroundColor: color.accent, borderRadius: radius.sm },
    knob: {
      position: 'absolute',
      width: KNOB_SIZE,
      height: KNOB_SIZE,
      borderRadius: KNOB_SIZE / 2,
      borderWidth: hairline,
      borderColor: color.paperLine,
    },
  });
