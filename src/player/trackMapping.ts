import type { MediaItem } from '@rntp/player';

import type { SubsonicClient } from '../api/client';
import type { Child } from '../types/subsonic';

/**
 * Converts Subsonic songs into the MediaItems the player queues.
 *
 * The URL is the whole point of this file. It comes from client.getStreamUrl,
 * which forces `format=raw&maxBitRate=0` — building a stream URL by hand
 * anywhere else is how silent transcoding creeps back in, so nothing outside
 * the client is allowed to construct one. A downloaded track is the one
 * exception: it plays from its file on the device, which was fetched through
 * that same raw stream URL (see offline/downloads).
 */

/**
 * Subsonic metadata carried alongside each item.
 *
 * Lives in MediaItem.extras, which the player stores verbatim and hands back
 * from getQueue and getActiveMediaItem — so the player screen can render the
 * format plate, and star/scrobble can find the track id, without a parallel
 * lookup table keyed by queue position.
 */
export interface SubsonicExtras extends Record<string, unknown> {
  subsonicId: string;
  albumId?: string;
  albumTitle?: string;
  artistId?: string;
  /** Cover art id, so history entries survive a change of base URL. */
  coverArt?: string;
  suffix?: string;
  bitDepth?: number;
  samplingRate?: number;
  channelCount?: number;
  bitRate?: number;
  /** Source file size in bytes — lets the app re-verify nothing was re-encoded. */
  sizeBytes?: number;
  track?: number;
  discNumber?: number;
  year?: number;
  genre?: string;
  starred: boolean;
}

function extrasFor(song: Child): SubsonicExtras {
  return {
    subsonicId: song.id,
    albumId: song.albumId,
    albumTitle: song.album,
    artistId: song.artistId,
    coverArt: song.coverArt,
    suffix: song.suffix,
    bitDepth: song.bitDepth,
    samplingRate: song.samplingRate,
    channelCount: song.channelCount,
    bitRate: song.bitRate,
    sizeBytes: song.size,
    track: song.track,
    discNumber: song.discNumber,
    year: song.year,
    genre: song.genre,
    starred: Boolean(song.starred),
  };
}

async function toMediaItem(client: SubsonicClient, song: Child): Promise<MediaItem> {
  const [url, artworkUrl] = await Promise.all([
    client.getStreamUrl(song.id),
    song.coverArt ? client.getCoverArtUrl(song.coverArt, 512) : Promise.resolve(undefined),
  ]);

  return {
    // Stable id independent of the URL, which carries auth params and the
    // base address and so differs between networks.
    mediaId: song.id,
    url,
    artworkUrl,
    title: song.title,
    artist: song.artist,
    albumTitle: song.album,
    duration: song.duration,
    // Stream URLs end in `.view`, not `.flac`, so the path says nothing about
    // the format. Navidrome reports the true type when serving raw.
    mimeType: song.contentType,
    extras: extrasFor(song),
  };
}

/** A downloaded file on this device, and its saved cover if there is one. */
export interface LocalTrackCopy {
  uri: string;
  coverUri?: string;
}

/** Finds the downloaded copy of a track, or null. */
export type LocalLookup = (id: string) => LocalTrackCopy | null;

/**
 * A track played from the device. Needs no connection at all: the file and
 * the cover are both local, so it plays on a plane. Without a saved cover
 * the server's is used when there is an address to build it against.
 */
function toLocalMediaItem(client: SubsonicClient | null, song: Child, copy: LocalTrackCopy): MediaItem {
  const remoteArt = song.coverArt && client ? client.buildCoverArtUrl(song.coverArt, 512) : null;
  return {
    mediaId: song.id,
    url: copy.uri,
    artworkUrl: copy.coverUri ?? remoteArt ?? undefined,
    title: song.title,
    artist: song.artist,
    albumTitle: song.album,
    duration: song.duration,
    mimeType: song.contentType,
    extras: extrasFor(song),
  };
}

/**
 * Maps a list of songs. Downloaded tracks play from the device; the rest
 * stream, with their URLs built in parallel. A client is needed only for
 * the ones that stream.
 */
export async function toMediaItems(
  client: SubsonicClient | null,
  songs: Child[],
  local?: LocalLookup,
): Promise<MediaItem[]> {
  return Promise.all(
    songs.map((song) => {
      const copy = local?.(song.id);
      if (copy) return toLocalMediaItem(client, song, copy);
      if (!client) throw new Error('Not connected to a server');
      return toMediaItem(client, song);
    }),
  );
}

/** Whether a queued item plays from the device rather than the server. */
export function isLocalItem(item: MediaItem | null | undefined): boolean {
  return typeof item?.url === 'string' && item.url.startsWith('file:');
}

/** Reads Subsonic metadata back off a queued item. */
export function extrasOf(item: MediaItem | null | undefined): SubsonicExtras | null {
  const extras = item?.extras as SubsonicExtras | undefined;
  return extras && typeof extras.subsonicId === 'string' ? extras : null;
}

/**
 * The queued item as a library record.
 *
 * The queue holds MediaItems, which carry only what the player needs; the
 * sheets and actions work on Child like every other screen. Everything they
 * need is on the item or in its extras, so this reassembles rather than
 * refetches. `starred` is a timestamp in Child; only its presence is read.
 */
export function songFromMediaItem(item: MediaItem | null | undefined): Child | null {
  const extras = extrasOf(item);
  if (!item || !extras) return null;
  return {
    id: extras.subsonicId,
    isDir: false,
    title: item.title ?? '',
    artist: item.artist,
    album: item.albumTitle ?? extras.albumTitle,
    albumId: extras.albumId,
    artistId: extras.artistId,
    coverArt: extras.coverArt,
    duration: item.duration,
    suffix: extras.suffix,
    bitDepth: extras.bitDepth,
    samplingRate: extras.samplingRate,
    channelCount: extras.channelCount,
    bitRate: extras.bitRate,
    size: extras.sizeBytes,
    track: extras.track,
    discNumber: extras.discNumber,
    year: extras.year,
    genre: extras.genre,
    contentType: item.mimeType,
    starred: extras.starred ? 'starred' : undefined,
  };
}

/**
 * "FLAC · 24/96" — the format plate.
 *
 * Bit depth and rate come from OpenSubsonic fields, so they are omitted
 * rather than guessed when the server doesn't report them. 44100 reads as
 * 44.1, not 44: CD-rate material shouldn't look like a lower rate.
 */
export function formatPlate(
  suffix?: string | null,
  bitDepth?: number | null,
  samplingRate?: number | null,
): string | null {
  const parts: string[] = [];
  if (suffix) parts.push(suffix.toUpperCase());
  if (bitDepth && samplingRate) {
    const khz = samplingRate / 1000;
    parts.push(`${bitDepth}/${Number.isInteger(khz) ? khz : khz.toFixed(1)}`);
  } else if (samplingRate) {
    const khz = samplingRate / 1000;
    parts.push(`${Number.isInteger(khz) ? khz : khz.toFixed(1)}K`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Whether a format is one the app should badge as lossless. */
export function isLossless(suffix?: string | null): boolean {
  if (!suffix) return false;
  return ['flac', 'alac', 'wav', 'aiff', 'aif', 'ape', 'wv', 'dsf', 'dff'].includes(
    suffix.toLowerCase(),
  );
}
