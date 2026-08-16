import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import TrackPlayer from '@rntp/player';

import { SectionHeader } from './SectionHeader';
import { hairline, layout, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

/**
 * Sleep timer options.
 *
 * The player handles the countdown natively, so it keeps running with the JS
 * runtime asleep — which is the only way a sleep timer is any use. The last
 * option ends after the current track rather than at a wall-clock time, since
 * "let this finish" is what you usually mean when a track is already playing.
 *
 * A short fade is applied to the timed options. Music cutting to silence mid-
 * bar is startling in a way that defeats the point of a sleep timer.
 */

const FADE_SECONDS = 20;

const OPTIONS = [
  { label: '15 minutes', minutes: 15 },
  { label: '30 minutes', minutes: 30 },
  { label: '45 minutes', minutes: 45 },
  { label: '1 hour', minutes: 60 },
];

export interface SleepTimerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Remaining seconds, or null when no timer is set. */
  remainingSeconds: number | null;
  /** Called after any change so the caller can re-read the timer state. */
  onChanged: () => void;
}

export function SleepTimerSheet({
  visible,
  onClose,
  remainingSeconds,
  onChanged,
}: SleepTimerSheetProps) {
  const styles = useThemedStyles(makeStyles);

  function choose(action: () => void) {
    action();
    onChanged();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Tapping the scrim dismisses; the sheet itself swallows the press. */}
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <SectionHeader
            title="Sleep timer"
            count={remainingSeconds != null ? formatRemaining(remainingSeconds) : undefined}
            surface="panel"
          />

          {OPTIONS.map((option) => (
            <Option
              key={option.minutes}
              label={option.label}
              onPress={() =>
                choose(() =>
                  TrackPlayer.sleepAfterTime(option.minutes * 60, {
                    fadeOutSeconds: FADE_SECONDS,
                  }),
                )
              }
            />
          ))}

          <Option
            label="End of this track"
            onPress={() => choose(() => TrackPlayer.sleepAfterMediaItemAtIndex())}
          />

          {remainingSeconds != null && (
            <Option
              label="Cancel timer"
              emphasis
              last
              onPress={() => choose(() => TrackPlayer.cancelSleepTimer())}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Option({
  label,
  onPress,
  emphasis = false,
  last = false,
}: {
  label: string;
  onPress: () => void;
  emphasis?: boolean;
  last?: boolean;
}) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.option, !last && styles.optionLine, pressed && styles.pressed]}
    >
      <Text style={[styles.optionLabel, emphasis && { color: color.accent }]}>{label}</Text>
    </Pressable>
  );
}

/** `M:SS` for anything under an hour, `H:MM` above it. */
function formatRemaining(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')} left`
    : `${minutes}:${String(secs).padStart(2, '0')} left`;
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    scrim: {
      flex: 1,
      backgroundColor: '#000000AA',
      justifyContent: 'flex-end',
      padding: space[3],
    },
    sheet: {
      backgroundColor: color.panel,
      borderRadius: layout.dockRadius,
      borderWidth: hairline,
      borderColor: color.panelLine,
      overflow: 'hidden',
      paddingBottom: space[3],
    },
    option: {
      paddingHorizontal: layout.panelPadding,
      paddingVertical: space[4],
    },
    optionLine: { borderBottomWidth: hairline, borderBottomColor: color.panelLine },
    optionLabel: { ...type.body, color: color.textInverse },
    pressed: { opacity: 0.6 },
  });
