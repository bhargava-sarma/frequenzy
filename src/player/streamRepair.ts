import TrackPlayer, { Event, type MediaItem } from '@rntp/player';

import { localCopy, onTrackDownloaded } from '../offline/downloads';
import { positionNow, usePlaybackStore } from '../store/usePlaybackStore';
import { useServerStore } from '../store/useServerStore';
import { toast } from '../store/useToastStore';
import { seekTo } from './playbackSync';
import { isLocalItem } from './trackMapping';

/**
 * Keeps queued stream URLs pointing at the address that currently answers.
 *
 * A stream URL embeds the base address of the connection that built it. Queue
 * an album at home, walk out of the door, and every track after the current
 * one still points at the LAN address — which is now unreachable, so playback
 * dies at the next track boundary with a source error.
 *
 * Two repairs, both cheap:
 *
 *   - When the client settles on a different address, every queued item
 *     except the playing one is re-pointed at it. The playing one is left
 *     alone: it is usually buffered well ahead, and replacing it would
 *     restart it.
 *   - When playback does fail, the connection is re-probed and the failing
 *     item is re-pointed and resumed — once, so a genuinely dead server
 *     cannot loop.
 *
 * Re-pointing swaps the prefix before `/rest/` and keeps the rest of the URL
 * byte-for-byte: the auth params and the `format=raw&maxBitRate=0` that make
 * the stream lossless are never rebuilt here, only carried.
 */

const REST = '/rest/';

function rebase(url: string, base: string): string {
  const at = url.lastIndexOf(REST);
  return at < 0 ? url : `${base}${url.slice(at)}`;
}

function rebasedItem(item: MediaItem, base: string): MediaItem | null {
  if (typeof item.url !== 'string') return null;
  const url = rebase(item.url, base);
  const artworkUrl =
    typeof item.artworkUrl === 'string' ? rebase(item.artworkUrl, base) : item.artworkUrl;
  if (url === item.url && artworkUrl === item.artworkUrl) return null;
  return { ...item, url, artworkUrl };
}

/**
 * Replaces queued items with `transform`'s result, all but the playing one.
 *
 * The mirrored queue is checked first, so the common case — nothing to
 * change — costs no call into the player. Only when something does need
 * replacing is the queue read fresh, and each replacement is checked
 * against that fresh copy by id, so a queue that moved since the mirror
 * was taken is never written at the wrong index.
 */
function replaceQueued(transform: (item: MediaItem) => MediaItem | null): void {
  const mirror = usePlaybackStore.getState();
  if (!mirror.queue.some((item, index) => index !== mirror.index && transform(item) != null)) return;

  let queue: MediaItem[];
  let active: number | null;
  try {
    queue = TrackPlayer.getQueue();
    active = TrackPlayer.getActiveMediaItemIndex();
  } catch {
    return;
  }
  queue.forEach((item, index) => {
    if (index === active) return;
    const next = transform(item);
    if (next && next.mediaId === item.mediaId) TrackPlayer.replaceMediaItem(index, next);
  });
}

function rebaseQueue(base: string) {
  replaceQueued((item) => rebasedItem(item, base));
}

/** The same item pointed at its downloaded file, or null if there is none. */
function localizedItem(item: MediaItem): MediaItem | null {
  if (isLocalItem(item) || !item.mediaId) return null;
  const copy = localCopy(item.mediaId);
  if (!copy) return null;
  return { ...item, url: copy.uri, artworkUrl: copy.coverUri ?? item.artworkUrl };
}

/**
 * Points queued items at their downloaded files.
 *
 * A track queued while streaming keeps its stream URL even after it has
 * been downloaded, and that URL is useless the moment the connection goes.
 * So when a download lands, and when the connection drops, every queued
 * item with a copy on the device is switched to it — all but the playing
 * one, which is already buffered and would restart if replaced.
 */
export function localizeQueue(): void {
  replaceQueued(localizedItem);
}

/**
 * The same item streamed from the server at `base`, or null if it already
 * is. For downloaded items queued as files: at home they stream instead, so
 * a Cast speaker — which can reach the server but not the phone's storage —
 * can play them.
 */
function streamedItem(item: MediaItem, base: string): MediaItem | null {
  const client = useServerStore.getState().client;
  const id = item.mediaId;
  if (!client || !id) return null;
  if (!isLocalItem(item)) return rebasedItem(item, base);
  const coverArt = (item.extras as { coverArt?: string } | undefined)?.coverArt;
  return {
    ...item,
    url: client.buildStreamUrl(id, base),
    artworkUrl: coverArt ? (client.buildCoverArtUrl(coverArt, 512) ?? item.artworkUrl) : item.artworkUrl,
  };
}

/** Points the queue at the home server: every item streams from it. */
export function streamQueueFrom(base: string): void {
  replaceQueued((item) => streamedItem(item, base));
}

/** Whether the phone is on the home network right now. */
function atHome(): boolean {
  return useServerStore.getState().connection?.kind === 'local';
}

/** The next queued item after `from` that plays from the device. */
function nextLocalIndex(from: number): number | null {
  let queue: MediaItem[];
  try {
    queue = TrackPlayer.getQueue();
  } catch {
    return null;
  }
  for (let index = from + 1; index < queue.length; index++) {
    const item = queue[index];
    if (isLocalItem(item)) return index;
    const next = localizedItem(item);
    if (next) {
      TrackPlayer.replaceMediaItem(index, next);
      return index;
    }
  }
  return null;
}

/** Retries per item id, so one dead track cannot loop the handler. */
const RETRY_WINDOW_MS = 60_000;

export function startStreamRepair(onUnrecoverable: (message: string) => void): () => void {
  let lastBase = useServerStore.getState().connection?.url ?? null;

  const unsubscribe = useServerStore.subscribe((state, previous) => {
    const kind = state.connection?.kind ?? null;
    const before = previous.connection?.kind ?? null;
    const base = state.connection?.url ?? null;
    const moved = base != null && base !== lastBase;
    if (base) lastBase = base;

    if (kind !== before) {
      // Home: stream everything from the server, downloads included, so it
      // can all be cast. Away or offline: downloaded tracks play from the
      // device again — no mobile data, no connection needed.
      if (kind === 'local' && base) {
        streamQueueFrom(base);
        return;
      }
      localizeQueue();
    }
    if (moved && base) rebaseQueue(base);
  });

  // Coalesced: an album finishing downloads a track every few seconds, and
  // one pass over the queue covers all of them. At home queued tracks keep
  // streaming, so there is nothing to swap.
  let localizeTimer: ReturnType<typeof setTimeout> | null = null;
  const stopDownloads = onTrackDownloaded(() => {
    if (localizeTimer || atHome()) return;
    localizeTimer = setTimeout(() => {
      localizeTimer = null;
      if (!atHome()) localizeQueue();
    }, 1500);
  });

  const retried = new Map<string, number>();

  const errorSub = TrackPlayer.addEventListener(Event.PlaybackError, (event) => {
    // The player itself is unreachable, not a track: nothing here can fix
    // that (see controllerRecovery).
    if (event.code === 'controller-connection-failed') return;
    void (async () => {
      // From the mirror: an error is no moment to wait on the main thread.
      const mirror = usePlaybackStore.getState();
      const item = mirror.item;
      const index = mirror.index >= 0 ? mirror.index : null;
      const key = item?.mediaId ?? '';
      const last = retried.get(key) ?? 0;

      const client = useServerStore.getState().client;
      if (!client || !item || index == null || Date.now() - last < RETRY_WINDOW_MS) {
        onUnrecoverable(event.message || 'Playback failed');
        return;
      }
      retried.set(key, Date.now());
      // Entries only matter inside the retry window; without this the map
      // would keep one for every track that ever stumbled.
      for (const [id, at] of retried) {
        if (Date.now() - at > RETRY_WINDOW_MS) retried.delete(id);
      }

      // Where it broke off. A re-pointed item is a new source and starts
      // from the top, so the place has to be carried over by hand.
      const resumeAt = positionNow(mirror);
      const resume = (next: MediaItem) => {
        TrackPlayer.replaceMediaItem(index, next);
        if (resumeAt > 1) seekTo(resumeAt);
        TrackPlayer.play();
      };

      // A file that won't play: corrupt, or — the usual case — sent to a
      // Cast speaker, which can't reach the phone's storage. Stream it.
      const connection = useServerStore.getState().connection;
      if (isLocalItem(item)) {
        const streamed = connection ? streamedItem(item, connection.url) : null;
        if (streamed) resume(streamed);
        else onUnrecoverable(event.message || 'Playback failed');
        return;
      }

      // A stream that won't play away from home, for a track that is
      // downloaded: no reason to need the server at all.
      if (connection?.kind !== 'local') {
        const local = localizedItem(item);
        if (local) {
          resume(local);
          return;
        }
      }

      try {
        client.invalidateConnection();
        const reached = await client.ensureConnection(true);

        // The queue may have moved while the probe ran. Repairing by a stale
        // index would overwrite whatever track is at that position now, so
        // this one look is a direct read.
        const now = TrackPlayer.getActiveMediaItem();
        const nowIndex = TrackPlayer.getActiveMediaItemIndex();
        if (!now || nowIndex == null || now.mediaId !== item.mediaId) return;

        const next = rebasedItem(now, reached.url);
        if (next) {
          TrackPlayer.replaceMediaItem(nowIndex, next);
          if (resumeAt > 1) seekTo(resumeAt);
        } else {
          // Same address: the failure was transient. Re-prepare in place.
          TrackPlayer.retry();
        }
        TrackPlayer.play();
      } catch {
        // Out of reach. If something further on is downloaded, play that
        // rather than stopping dead at the first track that needs the server.
        let current: number | null = null;
        try {
          current = TrackPlayer.getActiveMediaItemIndex();
        } catch {
          current = null;
        }
        const skipTo = current == null ? null : nextLocalIndex(current);
        if (skipTo != null) {
          TrackPlayer.skipToIndex(skipTo);
          TrackPlayer.play();
          toast.show('Offline · skipped to downloaded tracks', { icon: 'offline' });
          return;
        }
        onUnrecoverable('Server unreachable');
      }
    })();
  });

  return () => {
    unsubscribe();
    errorSub.remove();
    stopDownloads();
    if (localizeTimer) clearTimeout(localizeTimer);
  };
}
