import { useEffect, useReducer } from 'react';
import type { MediaItem } from '@rntp/player';
import { create } from 'zustand';

/**
 * What the player is doing, mirrored in JavaScript.
 *
 * Every read from @rntp/player on Android — getQueue, getProgress,
 * getActiveMediaItem, isPlaying — is synchronous and blocks the JS thread,
 * with no timeout, until Android's main thread gets round to it. The main
 * thread is the one drawing the screen, so the busier the UI was, the
 * longer each read froze the app: the player's own hooks made those reads
 * on every mount, every second for progress, and again in every mounted
 * screen whenever the app came back to the front.
 *
 * So the player is read in one place (player/playbackSync.ts), driven by its
 * events, and everything else reads this store. Components subscribe to
 * exactly what they draw: a row to whether it is the one playing, the mini
 * player to the item — not the whole app to every change.
 *
 * Position is a clock rather than a stream of reads: where the track was at
 * a known moment, and whether it is advancing. That gives the position at
 * any instant without asking the player, and it is re-read from the player
 * only when something could have moved it.
 */
export interface PlaybackState {
  item: MediaItem | null;
  /** Active index in the queue, -1 when nothing is loaded. */
  index: number;
  playing: boolean;
  /** The queue as last read: refreshed once per burst of queue changes. */
  queue: MediaItem[];
  /** Bumped on every queue change, before the snapshot is re-read. */
  queueVersion: number;
  /**
   * Bumped on every track transition — including repeat-one coming round
   * to the same track, which the item alone can't show.
   */
  transition: number;
  /** Seconds into the track at `at`. */
  position: number;
  /** Epoch ms when `position` was true. */
  at: number;
  /** Seconds; 0 when unknown. */
  duration: number;
  speed: number;
}

export const usePlaybackStore = create<PlaybackState>(() => ({
  item: null,
  index: -1,
  playing: false,
  queue: [],
  queueVersion: 0,
  transition: 0,
  position: 0,
  at: 0,
  duration: 0,
  speed: 1,
}));

/** The position right now, from the clock. Never calls into native code. */
export function positionNow(state: PlaybackState = usePlaybackStore.getState()): number {
  if (!state.playing || state.at === 0) return state.position;
  const advanced = state.position + ((Date.now() - state.at) / 1000) * state.speed;
  return state.duration > 0 ? Math.min(state.duration, advanced) : advanced;
}

/** The length of the active track: the player's figure, else the tag's. */
export function durationOf(state: PlaybackState = usePlaybackStore.getState()): number {
  return state.duration > 0 ? state.duration : (state.item?.duration ?? 0);
}

/** The id of the track playing (or paused), or null. */
export function useActiveTrackId(): string | null {
  return usePlaybackStore((state) => state.item?.mediaId ?? null);
}

/** Whether this track is the current one. Re-renders only when that changes. */
export function useIsTrackActive(id: string | null | undefined): boolean {
  return usePlaybackStore((state) => id != null && state.item?.mediaId === id);
}

export function useIsPlaying(): boolean {
  return usePlaybackStore((state) => state.playing);
}

export function useActiveItem(): MediaItem | null {
  return usePlaybackStore((state) => state.item);
}

/**
 * The position, re-rendering every `intervalMs` while playing — computed
 * from the clock, so ticking costs no native call. Paused, it renders only
 * when the position is re-read (a seek, a new track).
 */
export function usePlaybackPosition(intervalMs = 1000): { position: number; duration: number } {
  const playing = usePlaybackStore((state) => state.playing);
  // Any re-read moves `at`; subscribing to it re-renders on seeks and syncs.
  usePlaybackStore((state) => state.at);
  const duration = usePlaybackStore((state) => durationOf(state));
  const [, tick] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [playing, intervalMs]);

  return { position: positionNow(), duration };
}

/** Where the current track sits in the queue — "03/12" on the display. */
export function useQueuePosition(): { index: number; length: number } {
  const index = usePlaybackStore((state) => state.index);
  const length = usePlaybackStore((state) => state.queue.length);
  return { index, length };
}
