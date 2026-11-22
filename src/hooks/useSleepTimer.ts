import { useEffect, useState } from 'react';
import TrackPlayer, { Event } from '@rntp/player';
import { create } from 'zustand';

/**
 * The native sleep timer, as something a component can show.
 *
 * The timer runs in the player itself, so it fires with the JS runtime
 * asleep. It is read when the screen opens and after it is set, and the
 * countdown in between is worked out locally: reading it from the player
 * every second meant a blocking call into the player every second.
 */
export type SleepState = { kind: 'time'; remaining: number } | { kind: 'track' } | null;

/** What the player said, with when the countdown ends. */
type Reading = { kind: 'time'; endsAt: number } | { kind: 'track' } | null;

function read(): Reading {
  try {
    const timer = TrackPlayer.getSleepTimer();
    if (!timer) return null;
    if (timer.type === 'mediaItem') return { kind: 'track' };
    return { kind: 'time', endsAt: Date.now() + Math.max(0, timer.remainingSeconds) * 1000 };
  } catch {
    return null;
  }
}

function stateOf(reading: Reading): SleepState {
  if (!reading) return null;
  if (reading.kind === 'track') return reading;
  return { kind: 'time', remaining: Math.max(0, Math.round((reading.endsAt - Date.now()) / 1000)) };
}

/**
 * One reading for every component that shows the timer: the sheet that sets
 * it and the player that displays it agree without either polling.
 */
const useSleepReading = create<{ reading: Reading }>(() => ({ reading: null }));

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  TrackPlayer.addEventListener(Event.SleepTimerTriggered, () => useSleepReading.setState({ reading: null }));
}

/**
 * Reads now and once more a moment later: setting the timer is a call the
 * player handles on its own thread, so a read straight after it can still
 * see the old timer.
 */
let followUp: ReturnType<typeof setTimeout> | null = null;
const refresh = () => {
  useSleepReading.setState({ reading: read() });
  if (followUp) clearTimeout(followUp);
  followUp = setTimeout(() => {
    followUp = null;
    useSleepReading.setState({ reading: read() });
  }, 400);
};

export function useSleepTimer(): { state: SleepState; refresh: () => void } {
  const reading = useSleepReading((store) => store.reading);
  const [, tick] = useState(0);

  // Read once as the first component showing it mounts.
  useEffect(() => {
    listen();
    refresh();
  }, []);

  // Ticks only while a countdown runs.
  useEffect(() => {
    if (reading?.kind !== 'time') return;
    const timer = setInterval(() => {
      tick((n) => n + 1);
      // Past its end: the player has stopped by now.
      if (reading.endsAt <= Date.now()) useSleepReading.setState({ reading: null });
    }, 1000);
    return () => clearInterval(timer);
  }, [reading]);

  return { state: stateOf(reading), refresh };
}

/** "12:04" for a countdown, "END" for end-of-track. */
export function sleepLabel(state: SleepState): string | null {
  if (!state) return null;
  if (state.kind === 'track') return 'END OF TRACK';
  const m = Math.floor(state.remaining / 60);
  const s = state.remaining % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
