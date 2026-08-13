import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { color, layout, radius, space, type } from '../theme/tokens';
import { formatDuration, formatRemaining } from '../utils/time';

/**
 * Playback progress, per spec 5.1.
 *
 * 3px track in `panel-line`, accent fill, `radius.sm`. Times sit below in the
 * numeral style — elapsed on the left, REMAINING on the right as a `-M:SS`
 * countdown rather than the total duration.
 *
 * Both readouts use tabular figures (carried by the `numeral` token). With
 * proportional digits the elapsed time shifts horizontally every second as
 * glyph widths change, which is exactly the sort of wobble a panel shouldn't
 * have.
 *
 * Passing `onSeek` makes the bar scrubbable. The visible bar stays 3px, but
 * the touch target grows to a usable height around it — 3px is far below the
 * 44px minimum and would be nearly impossible to grab.
 */
export interface ProgressBarProps {
  /** Elapsed seconds. */
  position: number;
  /** Total seconds. Undefined while a track's duration is still unknown. */
  duration?: number | null;
  /** Hide the time row to use this as a bare meter. */
  showTimes?: boolean;
  surface?: 'paper' | 'panel';
  /** Enables scrubbing. Receives the target position in seconds. */
  onSeek?: (positionSeconds: number) => void;
}

export function ProgressBar({
  position,
  duration,
  showTimes = true,
  surface = 'panel',
  onSeek,
}: ProgressBarProps) {
  const onPanel = surface === 'panel';
  const total = duration && duration > 0 ? duration : 0;

  const [trackWidth, setTrackWidth] = useState(0);
  // Non-null only while a drag is in progress, so the bar follows the finger
  // instead of snapping back to the last reported playback position.
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);
  const dragRatio = useSharedValue(0);
  const dragging = useSharedValue(false);

  // Clamped because a stream can report a position slightly past its duration
  // near the end of a track, which would otherwise overflow the track fill.
  const playbackRatio = total > 0 ? Math.min(1, Math.max(0, position / total)) : 0;
  const displayRatio = scrubRatio ?? playbackRatio;
  const displayPosition = scrubRatio != null ? scrubRatio * total : position;

  const pan = Gesture.Pan()
    .enabled(Boolean(onSeek) && total > 0 && trackWidth > 0)
    // Respond immediately on touch so a tap seeks, rather than requiring a drag.
    .minDistance(0)
    .onBegin((event) => {
      dragging.value = true;
      dragRatio.value = Math.min(1, Math.max(0, event.x / trackWidth));
      runOnJS(setScrubRatio)(dragRatio.value);
    })
    .onUpdate((event) => {
      dragRatio.value = Math.min(1, Math.max(0, event.x / trackWidth));
      runOnJS(setScrubRatio)(dragRatio.value);
    })
    .onEnd(() => {
      dragging.value = false;
      if (onSeek) runOnJS(onSeek)(dragRatio.value * total);
      // Clearing here would briefly show the old playback position before the
      // player reports the new one, so the seeked value is held until the next
      // progress tick replaces it.
      runOnJS(setScrubRatio)(null);
    });

  const bar = (
    <View
      style={[styles.track, { backgroundColor: onPanel ? color.panelLine : color.paperLine }]}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
    >
      {/* Width is driven by React state rather than an animated style. The
          fill only needs to track a finger or a once-per-second tick, and
          keeping it off the animated path leaves the gesture callbacks as the
          only worklet code here. */}
      <View style={[styles.fill, { width: `${displayRatio * 100}%` }]} />
    </View>
  );

  return (
    <View>
      {onSeek ? (
        <GestureDetector gesture={pan}>
          {/* Padding is the hit area; the bar itself stays 3px. */}
          <View style={styles.hitArea}>{bar}</View>
        </GestureDetector>
      ) : (
        bar
      )}

      {showTimes && (
        <View style={styles.times}>
          <Text
            style={[
              styles.time,
              { color: onPanel ? color.textInverseSecondary : color.textSecondary },
            ]}
          >
            {formatDuration(displayPosition)}
          </Text>
          <Text
            style={[
              styles.time,
              { color: onPanel ? color.textInverseSecondary : color.textSecondary },
            ]}
          >
            {formatRemaining(displayPosition, total)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hitArea: { paddingVertical: space[5] - layout.progressHeight, justifyContent: 'center' },
  track: {
    height: layout.progressHeight,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: color.accent,
    borderRadius: radius.sm,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space[2],
  },
  time: { ...type.numeral },
});
