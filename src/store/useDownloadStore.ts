import { create } from 'zustand';

import type {
  DownloadBlock,
  OfflineCollection,
  OfflineTrack,
  TrackState,
} from '../offline/types';

/**
 * What is downloaded, what is waiting, and what is holding things up.
 *
 * State only: the operations that change it — queueing, removing, the
 * worker that fetches — live in offline/downloads.ts, which keeps this file
 * free of the file system and the network.
 */
interface DownloadState {
  /** True once the index has been read and checked against the disk. */
  hydrated: boolean;
  /** Set when this build cannot download at all, with the reason. */
  unsupported: string | null;
  tracks: Record<string, OfflineTrack>;
  collections: Record<string, OfflineCollection>;
  /** Cover art ids saved on the device, mapped to their file's base name. */
  covers: Record<string, string>;
  /** Downloads stopped by hand. Remembered between launches. */
  paused: boolean;
  blocked: DownloadBlock | null;
}

export const EMPTY_DOWNLOADS: DownloadState = {
  hydrated: false,
  unsupported: null,
  tracks: {},
  collections: {},
  covers: {},
  paused: false,
  blocked: null,
};

export const useDownloadStore = create<DownloadState>(() => ({ ...EMPTY_DOWNLOADS }));

/**
 * The transfer in progress.
 *
 * Its own store, so a progress tick — several a second — re-renders only
 * what draws progress, not every row that shows whether it is downloaded.
 */
interface ProgressState {
  id: string | null;
  bytes: number;
  /** 0 when unknown. */
  total: number;
}

export const useDownloadProgress = create<ProgressState>(() => ({ id: null, bytes: 0, total: 0 }));

/** How far along one track is: on the device, waiting, failed, or arriving now. */
export type TrackDownloadStatus = TrackState | 'active' | null;

export function useTrackDownload(id: string | undefined | null): TrackDownloadStatus {
  const state = useDownloadStore((s) => (id ? (s.tracks[id]?.state ?? null) : null));
  const active = useDownloadProgress((p) => id != null && p.id === id);
  return active && state === 'queued' ? 'active' : state;
}

/** Whether a collection is kept for offline, and how much of it has arrived. */
export interface CollectionDownloadStatus {
  pinned: boolean;
  done: number;
  total: number;
  failed: number;
}

const NO_COLLECTION = '0|0|0|0';

/**
 * Reduced to one string inside the selector so the hook re-renders only when
 * a count changes — an object built per call would be new every time.
 */
export function useCollectionDownload(key: string | undefined | null): CollectionDownloadStatus {
  const packed = useDownloadStore((s) => {
    const collection = key ? s.collections[key] : undefined;
    if (!collection) return NO_COLLECTION;
    let done = 0;
    let failed = 0;
    for (const id of collection.songIds) {
      const state = s.tracks[id]?.state;
      if (state === 'done') done += 1;
      else if (state === 'failed') failed += 1;
    }
    return `1|${done}|${collection.songIds.length}|${failed}`;
  });
  const [pinned, done, total, failed] = packed.split('|').map(Number);
  return { pinned: pinned === 1, done, total, failed };
}

/** Number of tracks on the device. */
export function useDownloadedCount(): number {
  return useDownloadStore((s) => {
    let count = 0;
    for (const id in s.tracks) if (s.tracks[id].state === 'done') count += 1;
    return count;
  });
}
