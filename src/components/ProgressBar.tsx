import { StyleSheet, Text, View } from 'react-native';

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
 */
export interface ProgressBarProps {
  /** Elapsed seconds. */
  position: number;
  /** Total seconds. Undefined while a track's duration is still unknown. */
  duration?: number | null;
  /** Hide the time row to use this as a bare meter. */
  showTimes?: boolean;
  surface?: 'paper' | 'panel';
}

export function ProgressBar({
  position,
  duration,
  showTimes = true,
  surface = 'panel',
}: ProgressBarProps) {
  const onPanel = surface === 'panel';

  const total = duration && duration > 0 ? duration : 0;
  // Clamped because a stream can report a position slightly past its duration
  // near the end of a track, which would otherwise overflow the track fill.
  const ratio = total > 0 ? Math.min(1, Math.max(0, position / total)) : 0;

  return (
    <View>
      <View
        style={[
          styles.track,
          { backgroundColor: onPanel ? color.panelLine : color.paperLine },
        ]}
      >
        <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
      </View>

      {showTimes && (
        <View style={styles.times}>
          <Text
            style={[
              styles.time,
              { color: onPanel ? color.textInverseSecondary : color.textSecondary },
            ]}
          >
            {formatDuration(position)}
          </Text>
          <Text
            style={[
              styles.time,
              { color: onPanel ? color.textInverseSecondary : color.textSecondary },
            ]}
          >
            {formatRemaining(position, total)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
