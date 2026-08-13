import type { MediaItem } from '@rntp/player';

import type { SubsonicClient } from '../api/client';
import type { Child } from '../types/subsonic';

/**
 * Converts Subsonic songs into the MediaItems the player queues.
 *
 * The URL is the whole point of this file. It comes from client.getStreamUrl,
 * which forces `format=raw&maxBitRate=0` — building a stream URL by hand
 * anywhere else is how silent transcoding creeps back in, so nothing outside
 * the client is allowed to construct one.
 */

/**
 * Subsonic metadata carried alongside each item.
 *
 * Lives in MediaItem.extras, which the player stores verbatim and hands back
 * from getQueue and getActiveMediaItem — so the Now Playing screen can render
 * the format badge, and star/scrobble can find the track id, without a
 * parallel lookup table keyed by queue position.
 */
export interface SubsonicExtras extends Record<string, unknown> {
  subsonicId: string;
  albumId?: string;
  artistId?: string;
  suffix?: string;
  bitDepth?: number;
  samplingRate?: number;
  /** Source file size in bytes — lets the app re-verify nothing was re-encoded. */
  sizeBytes?: number;
  starred: boolean;
}

export async function toMediaItem(
  client: SubsonicClient,
  song: Child,
): Promise<MediaItem> {
  const [url, artworkUrl] = await Promise.all([
    client.getStreamUrl(song.id),
    song.coverArt ? client.getCoverArtUrl(song.coverArt, 512) : Promise.resolve(undefined),
  ]);

  const extras: SubsonicExtras = {
    subsonicId: song.id,
    albumId: song.albumId,
    artistId: song.artistId,
    suffix: song.suffix,
    bitDepth: song.bitDepth,
    samplingRate: song.samplingRate,
    sizeBytes: song.size,
    starred: Boolean(song.starred),
  };

  return {
    // Stable id independent of the URL, which carries per-request auth params
    // and therefore differs every time the same track is queued.
    mediaId: song.id,
    url,
    artworkUrl,
    title: song.title,
    artist: song.artist,
    albumTitle: song.album,
    duration: song.duration,
    // Stream URLs end in `.view`, not `.flac`, so ExoPlayer can't infer the
    // format from the path. Navidrome reports the true type when serving raw.
    mimeType: song.contentType,
    extras,
  };
}

/**
 * Maps a list of songs.
 *
 * Each URL needs its own auth params, so they're built in parallel — an album
 * of 13 tracks would otherwise serialize 13 passes through the connection
 * check.
 */
export async function toMediaItems(
  client: SubsonicClient,
  songs: Child[],
): Promise<MediaItem[]> {
  return Promise.all(songs.map((song) => toMediaItem(client, song)));
}

/** Reads Subsonic metadata back off a queued item. */
export function extrasOf(item: MediaItem | null | undefined): SubsonicExtras | null {
  const extras = item?.extras as SubsonicExtras | undefined;
  return extras && typeof extras.subsonicId === 'string' ? extras : null;
}
