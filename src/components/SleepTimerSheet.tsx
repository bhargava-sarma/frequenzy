import TrackPlayer from '@rntp/player';

import { Sheet, SheetOption } from './Sheet';

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
  function choose(action: () => void) {
    action();
    onChanged();
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Sleep timer"
      detail={remainingSeconds != null ? formatRemaining(remainingSeconds) : undefined}
    >
      {OPTIONS.map((option) => (
        <SheetOption
          key={option.minutes}
          label={option.label}
          onPress={() =>
            choose(() =>
              TrackPlayer.sleepAfterTime(option.minutes * 60, { fadeOutSeconds: FADE_SECONDS }),
            )
          }
        />
      ))}

      <SheetOption
        label="End of this track"
        last={remainingSeconds == null}
        onPress={() => choose(() => TrackPlayer.sleepAfterMediaItemAtIndex())}
      />

      {remainingSeconds != null && (
        <SheetOption
          label="Cancel timer"
          emphasis
          last
          onPress={() => choose(() => TrackPlayer.cancelSleepTimer())}
        />
      )}
    </Sheet>
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
