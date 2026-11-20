import type { Child } from '../types/subsonic';

/**
 * What the downloads feature keeps about each track and collection.
 *
 * A track is on the device once and can be wanted by several things at once
 * — downloaded by itself, and as part of an album and a playlist. `pins`
 * records who wants it, so taking one of those away leaves the file for the
 * others, and the file goes only when nothing wants it any more.
 */

export type CollectionKind = 'album' | 'playlist' | 'liked';

/** A pin held by a single track downloaded on its own. */
export const SINGLE_PIN = 'single';

export const collectionKey = (kind: CollectionKind, id: string): string =>
  kind === 'liked' ? 'liked' : `${kind}:${id}`;

export interface OfflineCollection {
  /** "album:<id>", "playlist:<id>" or "liked". */
  key: string;
  kind: CollectionKind;
  id: string;
  name: string;
  artist?: string;
  year?: number;
  coverArt?: string;
  /** In the collection's own order, as last seen on the server. */
  songIds: string[];
  addedAt: number;
  /** When the track list was last brought up to date with the server. */
  syncedAt: number;
}

export type TrackState = 'queued' | 'done' | 'failed';

export interface OfflineTrack {
  id: string;
  /** The full record, so the track plays and lists with no server at all. */
  song: Child;
  state: TrackState;
  /** File name under offline/tracks, once downloaded. */
  file?: string;
  /** Bytes on disk, once downloaded. */
  bytes?: number;
  /** Who wants this track: SINGLE_PIN and/or collection keys. */
  pins: string[];
  requestedAt: number;
  doneAt?: number;
  attempts: number;
  /** Why the last attempt failed, for the downloads list. */
  error?: string;
  /** Not retried before this time (epoch ms). */
  retryAt?: number;
}

/** What is holding the queue up, when something is. */
export type DownloadBlock =
  /** No address answers. Picks up again when one does. */
  | 'offline'
  /** Set to download at home only, and away from home. */
  | 'homeOnly'
  /** Not enough free space to take the next file safely. */
  | 'storage';

/** The playable copy of a downloaded track. */
export interface LocalCopy {
  uri: string;
  coverUri?: string;
}
