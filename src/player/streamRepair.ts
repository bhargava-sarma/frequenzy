import TrackPlayer, { Event, type MediaItem } from '@rntp/player';

import { localCopy, onTrackDownloaded } from '../offline/downloads';
import { useServerStore } from '../store/useServerStore';
import { toast } from '../store/useToastStore';
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

function rebaseQueue(base: string, includeActive: boolean) {
  let queue: MediaItem[];
  try {
    queue = TrackPlayer.getQueue();
  } catch {
    return;
  }
  const active = TrackPlayer.getActiveMediaItemIndex();
  queue.forEach((item, index) => {
    if (!includeActive && index === active) return;
    const next = rebasedItem(item, base);
    if (next) TrackPlayer.replaceMediaItem(index, next);
  });
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
  let queue: MediaItem[];
  let active: number | null | undefined;
  try {
    queue = TrackPlayer.getQueue();
    active = TrackPlayer.getActiveMediaItemIndex();
  } catch {
    return;
  }
  queue.forEach((item, index) => {
    if (index === active) return;
    const next = localizedItem(item);
    if (next) TrackPlayer.replaceMediaItem(index, next);
  });
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
    // Gone offline: whatever is downloaded should be what plays next.
    if (!state.connection && previous.connection) localizeQueue();
    const base = state.connection?.url ?? null;
    if (!base || base === lastBase) return;
    lastBase = base;
    rebaseQueue(base, false);
  });

  // Coalesced: an album finishing downloads a track every few seconds, and
  // one pass over the queue covers all of them.
  let localizeTimer: ReturnType<typeof setTimeout> | null = null;
  const stopDownloads = onTrackDownloaded(() => {
    if (localizeTimer) return;
    localizeTimer = setTimeout(() => {
      localizeTimer = null;
      localizeQueue();
    }, 1500);
  });

  const retried = new Map<string, number>();

  const errorSub = TrackPlayer.addEventListener(Event.PlaybackError, (event) => {
    void (async () => {
      const item = TrackPlayer.getActiveMediaItem();
      const index = TrackPlayer.getActiveMediaItemIndex();
      const key = item?.mediaId ?? '';
      const last = retried.get(key) ?? 0;

      // Downloaded: no reason to need the server at all. Swap in the file
      // and carry on from the same place.
      if (item && index != null) {
        const local = localizedItem(item);
        if (local) {
          let at = 0;
          try {
            at = TrackPlayer.getProgress().position;
          } catch {
            at = 0;
          }
          TrackPlayer.replaceMediaItem(index, local);
          if (at > 1) TrackPlayer.seekTo(at);
          TrackPlayer.play();
          return;
        }
      }

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
      let resumeAt = 0;
      try {
        resumeAt = TrackPlayer.getProgress().position;
      } catch {
        resumeAt = 0;
      }

      try {
        client.invalidateConnection();
        const connection = await client.ensureConnection(true);

        // The queue may have moved while the probe ran. Repairing by a stale
        // index would overwrite whatever track is at that position now.
        const now = TrackPlayer.getActiveMediaItem();
        const nowIndex = TrackPlayer.getActiveMediaItemIndex();
        if (!now || nowIndex == null || now.mediaId !== item.mediaId) return;

        const next = rebasedItem(now, connection.url);
        if (next) {
          TrackPlayer.replaceMediaItem(nowIndex, next);
          if (resumeAt > 1) TrackPlayer.seekTo(resumeAt);
        } else {
          // Same address: the failure was transient. Re-prepare in place.
          TrackPlayer.retry();
        }
        TrackPlayer.play();
      } catch {
        // Out of reach. If something further on is downloaded, play that
        // rather than stopping dead at the first track that needs the server.
        const now = TrackPlayer.getActiveMediaItemIndex();
        const skipTo = now == null ? null : nextLocalIndex(now);
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
