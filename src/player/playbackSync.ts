import { AppState, type AppStateStatus } from 'react-native';
import TrackPlayer, { Event, PlaybackState, type MediaItem } from '@rntp/player';

import { positionNow, usePlaybackStore } from '../store/usePlaybackStore';

/**
 * The one place the app reads the player.
 *
 * Every read here is a synchronous call that waits on Android's main thread,
 * so they are made only when the answer can have changed — after an event —
 * and never in a loop or per component. Events keep the store current while
 * the app is in front. In the background Android routes the player's events
 * to a headless task instead of these listeners, so there the state is read
 * on a slow timer (nothing is being drawn, so the waits cost nothing), and
 * read in full once the app comes back.
 */

let started = false;
let queueTimer: ReturnType<typeof setTimeout> | null = null;
let resyncTimer: ReturnType<typeof setTimeout> | null = null;
let resumeTimer: ReturnType<typeof setTimeout> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;
let backgroundTimer: ReturnType<typeof setInterval> | null = null;
/** Screens showing time to the line — lyrics, the player — ask for tighter syncs. */
let precise = 0;
let clockTicks = 0;

function safely<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

/** Re-reads the position from the player. One call. */
export function resyncPosition(): void {
  const progress = safely(() => TrackPlayer.getProgress(), null);
  if (!progress) return;
  usePlaybackStore.setState({
    position: Math.max(0, progress.position || 0),
    duration: progress.duration > 0 ? progress.duration : 0,
    at: Date.now(),
  });
}

function scheduleResync(delay: number): void {
  if (resyncTimer) clearTimeout(resyncTimer);
  resyncTimer = setTimeout(() => {
    resyncTimer = null;
    resyncPosition();
  }, delay);
}

/**
 * Re-reads the queue and where it stands. Also repairs the current item if
 * an event went missing: a queue with a track at the active index but no
 * item mirrored would hide the mini player until the app restarted.
 */
export function refreshQueue(): void {
  const queue = safely(() => TrackPlayer.getQueue(), null);
  if (!queue) return;
  const index = safely(() => TrackPlayer.getActiveMediaItemIndex(), null) ?? -1;
  const current = usePlaybackStore.getState().item;
  const atIndex = index >= 0 ? queue[index] : undefined;
  // Kept as the same object only while it is the same track from the same
  // source: an item re-pointed in place — at a downloaded file, a new
  // address — must show its new URL to whatever acts on it.
  const item = !atIndex
    ? null
    : current && current.mediaId === atIndex.mediaId && current.url === atIndex.url
      ? current
      : atIndex;
  usePlaybackStore.setState({ queue, index, item });
}

function scheduleQueueRefresh(delay = 250): void {
  if (queueTimer) clearTimeout(queueTimer);
  queueTimer = setTimeout(() => {
    queueTimer = null;
    refreshQueue();
  }, delay);
}

/** The current item and playing state, without the queue. Three calls. */
function syncLight(): void {
  const item = safely<MediaItem | null>(() => TrackPlayer.getActiveMediaItem(), null);
  const index = safely(() => TrackPlayer.getActiveMediaItemIndex(), null);
  const playing = safely(() => TrackPlayer.isPlaying(), false);
  const current = usePlaybackStore.getState();
  usePlaybackStore.setState({
    // Kept as the same object when it is the same track, so subscribers to
    // the item don't redraw for nothing.
    item: item && current.item?.mediaId === item.mediaId && current.item?.url === item.url ? current.item : item,
    index: index ?? -1,
    playing,
  });
  resyncPosition();
}

/** Everything, once: at start and on coming back to the front. */
export function syncAll(): void {
  syncLight();
  const speed = safely(() => TrackPlayer.getPlaybackSpeed(), 1);
  usePlaybackStore.setState({ speed: speed > 0 ? speed : 1 });
  refreshQueue();
}

/** Seeks, and moves the clock with it so nothing waits for a re-read. */
export function seekTo(position: number): void {
  TrackPlayer.seekTo(position);
  usePlaybackStore.setState({ position: Math.max(0, position), at: Date.now() });
  scheduleResync(600);
}

export function noteSpeed(speed: number): void {
  const state = usePlaybackStore.getState();
  usePlaybackStore.setState({ position: positionNow(state), at: Date.now(), speed });
}

/**
 * Asks for the position to be re-read more often while mounted. Returns a
 * release. For lyrics, where a line should change on its word.
 */
export function requestPrecision(): () => void {
  precise += 1;
  return () => {
    precise = Math.max(0, precise - 1);
  };
}

function onAppState(next: AppStateStatus): void {
  if (next === 'active') {
    stopBackgroundPoll();
    // A beat after the app is back, so the reads don't queue behind the
    // frames that redraw it.
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      resumeTimer = null;
      syncAll();
    }, 350);
  } else {
    startBackgroundPoll();
  }
}

function startBackgroundPoll(): void {
  if (backgroundTimer) return;
  backgroundTimer = setInterval(syncLight, 5000);
}

function stopBackgroundPoll(): void {
  if (backgroundTimer) clearInterval(backgroundTimer);
  backgroundTimer = null;
}

/**
 * Starts mirroring. Idempotent; returns a cleanup. Call once the player has
 * been set up.
 */
export function startPlaybackSync(): () => void {
  if (started) return () => {};
  started = true;
  syncAll();

  const subscriptions = [
    TrackPlayer.addEventListener(Event.MediaItemTransition, ({ item, index }) => {
      const current = usePlaybackStore.getState();
      usePlaybackStore.setState({
        item: item ?? null,
        index: item ? index : -1,
        transition: current.transition + 1,
        // A new track starts at the top; the re-read below corrects a track
        // restored part-way through.
        position: item && item.mediaId === current.item?.mediaId ? current.position : 0,
        at: Date.now(),
        duration: 0,
      });
      scheduleResync(400);
    }),
    TrackPlayer.addEventListener(Event.IsPlayingChanged, ({ playing }) => {
      const current = usePlaybackStore.getState();
      // Freeze or restart the clock where it stands, then confirm.
      usePlaybackStore.setState({ playing, position: positionNow(current), at: Date.now() });
      scheduleResync(250);
    }),
    TrackPlayer.addEventListener(Event.MediaMetadataChanged, (metadata) => {
      const current = usePlaybackStore.getState().item;
      if (!current) return;
      usePlaybackStore.setState({
        item: {
          ...current,
          title: metadata.title ?? current.title,
          artist: metadata.artist ?? current.artist,
          albumTitle: metadata.albumTitle ?? current.albumTitle,
          artworkUrl: metadata.artworkUrl ?? current.artworkUrl,
        },
      });
    }),
    TrackPlayer.addEventListener(Event.QueueChanged, () => {
      usePlaybackStore.setState({ queueVersion: usePlaybackStore.getState().queueVersion + 1 });
      scheduleQueueRefresh();
    }),
    TrackPlayer.addEventListener(Event.PlaybackStateChanged, ({ state }) => {
      // Buffering and ready bracket a seek made from the notification or a
      // headset, which no other event announces.
      if (state === PlaybackState.Ready || state === PlaybackState.Buffering || state === PlaybackState.Ended) {
        scheduleResync(200);
      }
    }),
  ];

  const appState = AppState.addEventListener('change', onAppState);
  if (AppState.currentState && AppState.currentState !== 'active') startBackgroundPoll();

  // Drift: the clock is exact while nothing interrupts it, but a stall or a
  // seek from outside the app moves the player without telling JS. Every
  // 12s it is re-read; with a precise screen open, every 3s.
  clockTimer = setInterval(() => {
    clockTicks += 1;
    const state = usePlaybackStore.getState();
    if (!state.playing || AppState.currentState !== 'active') return;
    if (precise > 0 || clockTicks % 4 === 0) resyncPosition();
  }, 3000);

  return () => {
    started = false;
    for (const subscription of subscriptions) subscription.remove();
    appState.remove();
    stopBackgroundPoll();
    for (const timer of [queueTimer, resyncTimer, resumeTimer]) if (timer) clearTimeout(timer);
    if (clockTimer) clearInterval(clockTimer);
    queueTimer = resyncTimer = resumeTimer = null;
    clockTimer = null;
  };
}

/**
 * Waits for the player to report `events` changes to its queue, after
 * `mutate` has sent them. The event arrives once a change has been handed
 * to the player's thread, so a read made after it sees the result.
 */
export function afterQueueChange(mutate: () => void, timeoutMs = 3000, events = 1): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let remaining = events;
    let done = false;
    const subscription = TrackPlayer.addEventListener(Event.QueueChanged, () => {
      remaining -= 1;
      if (remaining <= 0) finish(true);
    });
    const timer = setTimeout(() => finish(false), timeoutMs);
    function finish(ok: boolean) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      subscription.remove();
      if (ok) resolve();
      else reject(new Error('The player did not accept the change in time.'));
    }
    try {
      mutate();
    } catch (error) {
      done = true;
      clearTimeout(timer);
      subscription.remove();
      reject(error);
      return;
    }
    if (remaining <= 0) finish(true);
  });
}
