import { useEffect, useState } from 'react';
import TrackPlayer, { Event } from '@rntp/player';

/**
 * The native sleep timer, as something a component can show.
 *
 * The timer runs in the player itself, so it fires with the JS runtime
 * asleep; this only reads it, once a second while mounted.
 */
export type SleepState = { kind: 'time'; remaining: number } | { kind: 'track' } | null;

function read(): SleepState {
  try {
    const timer = TrackPlayer.getSleepTimer();
    if (!timer) return null;
    if (timer.type === 'mediaItem') return { kind: 'track' };
    return { kind: 'time', remaining: Math.max(0, Math.round(timer.remainingSeconds)) };
  } catch {
    return null;
  }
}

export function useSleepTimer(): { state: SleepState; refresh: () => void } {
  const [state, setState] = useState<SleepState>(read);

  useEffect(() => {
    const timer = setInterval(() => setState(read()), 1000);
    const sub = TrackPlayer.addEventListener(Event.SleepTimerTriggered, () => setState(null));
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  return { state, refresh: () => setState(read()) };
}

/** "12:04" for a countdown, "END" for end-of-track. */
export function sleepLabel(state: SleepState): string | null {
  if (!state) return null;
  if (state.kind === 'track') return 'END OF TRACK';
  const m = Math.floor(state.remaining / 60);
  const s = state.remaining % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
