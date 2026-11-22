import { AppState } from 'react-native';
import { md5 } from 'js-md5';

import { ApiError } from '../api/errors';
import { useDownloadProgress, useDownloadStore, EMPTY_DOWNLOADS } from '../store/useDownloadStore';
import { useServerStore } from '../store/useServerStore';
import { getSettings, useSettingsStore } from '../store/useSettingsStore';
import { errorMessage, toast } from '../store/useToastStore';
import { SubsonicErrorCode, type Child } from '../types/subsonic';
import {
  eraseCollection,
  eraseIndex,
  eraseTrack,
  flush,
  loadIndex,
  writeCollection,
  writeSettings,
  writeTrack,
} from './downloadIndex';
import {
  createDownloadTask,
  dirs,
  ensureDirectories,
  exists,
  file,
  freeSpace,
  listNames,
  moveInto,
  readText,
  removeDirectory,
  removeFile,
  sizeOf,
  unsupportedReason,
  type NativeDownloadTask,
} from './nativeFs';
import {
  SINGLE_PIN,
  collectionKey,
  type CollectionKind,
  type DownloadBlock,
  type LocalCopy,
  type OfflineCollection,
  type OfflineTrack,
} from './types';

/**
 * Offline downloads: the queue, the worker that fills it, and the lookups
 * playback uses to play from the device.
 *
 * Files are fetched exactly as they are streamed — through the client's
 * stream URL, `format=raw` and no bitrate cap — so a downloaded track is the
 * original file, byte for byte, never a transcode.
 *
 * One file at a time. These are lossless files of 30–100 MB each, often
 * over a remote link; several at once would finish no sooner and would
 * crowd out whatever is streaming. A transfer that breaks off resumes from
 * where it stopped with a range request rather than starting again.
 *
 * Nothing here can stop playback or the app: every failure is recorded on
 * the track it belongs to and retried, or shown as the reason the queue is
 * waiting.
 */

/** Room always left free on the device, so downloads never fill it. */
const RESERVE_BYTES = 500 * 1024 * 1024;
/** Assumed size of a track whose size the server didn't report. */
const UNKNOWN_SIZE = 80 * 1024 * 1024;
/** Attempts before a track is marked failed. */
const MAX_ATTEMPTS = 4;
/** Wait before each retry, by attempt. */
const BACKOFF_MS = [20_000, 2 * 60_000, 10 * 60_000];
/** How long to wait before looking again while no address answers. */
const OFFLINE_RECHECK_MS = 2 * 60_000;
/** Progress is published at most this often. */
const PROGRESS_EVERY_MS = 250;
/** Downloaded collections are compared with the server at most this often. */
const SYNC_EVERY_MS = 6 * 60 * 60 * 1000;
/** Cover sizes kept: one to look at, one small enough to take colours from. */
const COVER_SIZE = 600;
const THUMB_SIZE = 64;

// ---------------------------------------------------------------------------
// Names on disk
// ---------------------------------------------------------------------------

/**
 * A file-safe name for a server id. Navidrome's ids are already safe; other
 * servers' may hold slashes or worse, which get a hash so two ids that clean
 * up the same way still name different files.
 */
function safeName(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
  return cleaned === id ? cleaned : `${cleaned}_${md5(id).slice(0, 10)}`;
}

function extensionOf(song: Child): string {
  const suffix = (song.suffix ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  return suffix || 'audio';
}

const trackFileName = (song: Child) => `${safeName(song.id)}.${extensionOf(song)}`;
const partialUri = (id: string) => `${dirs.partial()}${safeName(id)}.part`;
const coverBase = (coverId: string) => safeName(coverId);
const coverFileUri = (base: string) => `${dirs.covers()}${base}.jpg`;
const thumbFileUri = (base: string) => `${dirs.covers()}${base}.thumb.jpg`;

/**
 * The fields of a track worth keeping with its download — every one the app
 * reads. OpenSubsonic servers send a good deal more (credits, ReplayGain,
 * MusicBrainz ids), which would double the size of the index for nothing.
 */
const SONG_FIELDS = [
  'id', 'parent', 'isDir', 'title', 'album', 'artist', 'track', 'year', 'genre', 'coverArt', 'size',
  'contentType', 'suffix', 'duration', 'bitRate', 'path', 'albumId', 'artistId', 'type', 'starred',
  'bitDepth', 'samplingRate', 'channelCount', 'discNumber', 'playCount', 'played', 'created',
  'userRating', 'bpm', 'comment', 'genres', 'displayArtist',
] as const satisfies readonly (keyof Child)[];

function slimSong(song: Child): Child {
  const out: Partial<Record<keyof Child, unknown>> = {};
  for (const key of SONG_FIELDS) {
    const value = song[key];
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out as Child;
}

// ---------------------------------------------------------------------------
// Lookups for playback and display
// ---------------------------------------------------------------------------

/** The on-device copy of a track, or null when it isn't downloaded. */
export function localCopy(id: string): LocalCopy | null {
  const state = useDownloadStore.getState();
  const track = state.tracks[id];
  if (!track || track.state !== 'done' || !track.file) return null;
  const coverId = track.song.coverArt;
  const base = coverId ? state.covers[coverId] : undefined;
  return {
    uri: `${dirs.tracks()}${track.file}`,
    coverUri: base ? coverFileUri(base) : undefined,
  };
}

/** A saved cover, for showing without the server. */
export function localCoverUri(coverId: string | undefined | null): string | undefined {
  if (!coverId) return undefined;
  const base = useDownloadStore.getState().covers[coverId];
  return base ? coverFileUri(base) : undefined;
}

/** A saved small cover, for taking colours from without the server. */
export function localThumbUri(coverId: string | undefined | null): string | undefined {
  if (!coverId) return undefined;
  const base = useDownloadStore.getState().covers[coverId];
  if (!base) return undefined;
  const uri = thumbFileUri(base);
  return exists(uri) ? uri : undefined;
}

/** Every downloaded track, in library order: artist, album, disc, track. */
export function downloadedSongs(): Child[] {
  const tracks = Object.values(useDownloadStore.getState().tracks).filter((t) => t.state === 'done');
  return sortSongs(tracks.map((t) => t.song));
}

const collate = (a?: string, b?: string) =>
  (a ?? '').localeCompare(b ?? '', undefined, { sensitivity: 'base', numeric: true });

export function sortSongs(songs: Child[]): Child[] {
  return [...songs].sort(
    (a, b) =>
      collate(a.artist, b.artist) ||
      (a.year ?? 0) - (b.year ?? 0) ||
      collate(a.album, b.album) ||
      (a.discNumber ?? 1) - (b.discNumber ?? 1) ||
      (a.track ?? 0) - (b.track ?? 0) ||
      collate(a.title, b.title),
  );
}

/** A downloaded collection's tracks, in its own order, from the device alone. */
export function collectionSongs(key: string): Child[] | null {
  const state = useDownloadStore.getState();
  const collection = state.collections[key];
  if (!collection) return null;
  return collection.songIds
    .map((id) => state.tracks[id])
    .filter((track): track is OfflineTrack => track?.state === 'done')
    .map((track) => track.song);
}

/**
 * A downloaded collection as last seen: every track in its order, whether or
 * not it has arrived yet — the records hold each track's details either
 * way. For drawing an album or playlist the instant it opens.
 */
export function collectionSnapshot(key: string): { collection: OfflineCollection; songs: Child[] } | null {
  const state = useDownloadStore.getState();
  const collection = state.collections[key];
  if (!collection) return null;
  const songs = collection.songIds
    .map((id) => state.tracks[id]?.song)
    .filter((song): song is Child => song != null);
  return { collection, songs };
}

/** Whether no server address is answering — known, not merely being re-checked. */
export function knownOffline(): boolean {
  const { connection, connecting } = useServerStore.getState();
  return connection == null && !connecting;
}

/**
 * An album's downloaded tracks, whether it was downloaded whole or only some
 * of its tracks were — for showing the album with no server to ask.
 */
export function downloadedAlbum(albumId: string): { songs: Child[]; collection?: OfflineCollection } | null {
  const state = useDownloadStore.getState();
  const songs = Object.values(state.tracks)
    .filter((track) => track.state === 'done' && track.song.albumId === albumId)
    .map((track) => track.song)
    .sort(
      (a, b) => (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.track ?? 0) - (b.track ?? 0) || collate(a.title, b.title),
    );
  if (songs.length === 0) return null;
  return { songs, collection: state.collections[collectionKey('album', albumId)] };
}

// ---------------------------------------------------------------------------
// Store updates
// ---------------------------------------------------------------------------

interface Patch {
  tracks?: Record<string, OfflineTrack | null>;
  collections?: Record<string, OfflineCollection | null>;
  covers?: Record<string, string | null>;
}

/** Applies changes to the store and queues them for storage. */
function commit(patch: Patch): void {
  const state = useDownloadStore.getState();
  const next: Partial<typeof state> = {};

  if (patch.tracks) {
    const tracks = { ...state.tracks };
    for (const [id, track] of Object.entries(patch.tracks)) {
      if (track) {
        tracks[id] = track;
        writeTrack(track);
      } else {
        delete tracks[id];
        eraseTrack(id);
      }
    }
    next.tracks = tracks;
  }

  if (patch.collections) {
    const collections = { ...state.collections };
    for (const [key, collection] of Object.entries(patch.collections)) {
      if (collection) {
        collections[key] = collection;
        writeCollection(collection);
      } else {
        delete collections[key];
        eraseCollection(key);
      }
    }
    next.collections = collections;
  }

  if (patch.covers) {
    const covers = { ...state.covers };
    for (const [id, base] of Object.entries(patch.covers)) {
      if (base) covers[id] = base;
      else delete covers[id];
    }
    next.covers = covers;
  }

  useDownloadStore.setState(next);
}

function setBlocked(blocked: DownloadBlock | null): void {
  if (useDownloadStore.getState().blocked !== blocked) useDownloadStore.setState({ blocked });
}

// ---------------------------------------------------------------------------
// Queueing and removing
// ---------------------------------------------------------------------------

function assertReady(): void {
  const state = useDownloadStore.getState();
  if (state.unsupported) throw new Error(state.unsupported);
  if (!state.hydrated) throw new Error('Downloads are still starting up. Try again in a moment.');
}

/**
 * Pins songs for offline. Songs already on the device just gain the pin; a
 * failed one is given a fresh set of attempts. Returns how many are new.
 */
function pinSongs(songs: Child[], pin: string): number {
  const state = useDownloadStore.getState();
  const updates: Record<string, OfflineTrack> = {};
  const now = Date.now();
  let added = 0;

  songs.forEach((song, index) => {
    if (!song?.id || song.isDir) return;
    const existing = updates[song.id] ?? state.tracks[song.id];
    if (existing) {
      const pins = existing.pins.includes(pin) ? existing.pins : [...existing.pins, pin];
      const revive = existing.state === 'failed';
      // A fuller record replaces an outline kept before — one with no size
      // can't have its download checked.
      const richer = existing.song.size == null && song.size != null && existing.state !== 'done';
      if (pins !== existing.pins || revive || richer) {
        const base = richer ? { ...existing, song: slimSong(song) } : existing;
        updates[song.id] = revive
          ? { ...base, pins, state: 'queued', attempts: 0, error: undefined, retryAt: undefined }
          : { ...base, pins };
      }
      return;
    }
    added += 1;
    updates[song.id] = {
      id: song.id,
      song: slimSong(song),
      state: 'queued',
      pins: [pin],
      // Spaced by index so the queue keeps the collection's order.
      requestedAt: now + index,
      attempts: 0,
    };
  });

  if (Object.keys(updates).length > 0) commit({ tracks: updates });
  return added;
}

/** Takes a pin away; a track nothing pins any more is deleted. */
function unpin(ids: Iterable<string>, pin: string | null): void {
  const state = useDownloadStore.getState();
  const updates: Record<string, OfflineTrack | null> = {};
  for (const id of ids) {
    const track = state.tracks[id];
    if (!track) continue;
    const pins = pin == null ? [] : track.pins.filter((p) => p !== pin);
    if (pins.length === track.pins.length) continue;
    if (pins.length > 0) {
      updates[id] = { ...track, pins };
    } else {
      updates[id] = null;
      discardFiles(track);
    }
  }
  if (Object.keys(updates).length > 0) {
    commit({ tracks: updates });
    pruneCovers();
  }
}

function discardFiles(track: OfflineTrack): void {
  if (active?.id === track.id) {
    active.intent = 'cancel';
    try {
      active.task.cancel();
    } catch {
      // Already finished.
    }
  }
  if (track.file) removeFile(`${dirs.tracks()}${track.file}`);
  removeFile(partialUri(track.id));
}

/** Downloads tracks on their own. Returns how many were newly queued. */
export function downloadSongs(songs: Child[]): number {
  assertReady();
  const added = pinSongs(songs, SINGLE_PIN);
  pump();
  return added;
}

/** Removes tracks downloaded on their own. Tracks kept by a collection stay. */
export function removeSongs(ids: string[]): void {
  unpin(ids, SINGLE_PIN);
}

export interface CollectionInput {
  kind: CollectionKind;
  id: string;
  name: string;
  artist?: string;
  year?: number;
  coverArt?: string;
}

/**
 * Keeps a whole album or playlist on the device. Called again with a newer
 * track list, it brings the download up to date: new tracks are fetched and
 * tracks no longer in it are let go.
 */
export function downloadCollection(input: CollectionInput, songs: Child[]): void {
  assertReady();
  const key = collectionKey(input.kind, input.id);
  const previous = useDownloadStore.getState().collections[key];
  const playable = songs.filter((song) => song?.id && !song.isDir);
  const now = Date.now();

  commit({
    collections: {
      [key]: {
        key,
        kind: input.kind,
        id: input.id,
        name: input.name,
        artist: input.artist,
        year: input.year,
        coverArt: input.coverArt ?? previous?.coverArt ?? playable[0]?.coverArt,
        songIds: playable.map((song) => song.id),
        addedAt: previous?.addedAt ?? now,
        syncedAt: now,
      },
    },
  });
  pinSongs(playable, key);

  if (previous) {
    const kept = new Set(playable.map((song) => song.id));
    unpin(
      previous.songIds.filter((id) => !kept.has(id)),
      key,
    );
  }
  pump();
}

export function removeCollection(key: string): void {
  const collection = useDownloadStore.getState().collections[key];
  if (!collection) return;
  commit({ collections: { [key]: null } });
  unpin(collection.songIds, key);
  pruneCovers();
}

/**
 * Hands a collection's latest track list to the download, when one exists.
 * Screens call this whenever they load an album or playlist, so a download
 * follows changes made on the server without anyone asking it to.
 */
export function noteCollection(input: CollectionInput, songs: Child[]): void {
  const state = useDownloadStore.getState();
  const key = collectionKey(input.kind, input.id);
  const previous = state.collections[key];
  if (!previous || !state.hydrated) return;
  const ids = songs.filter((song) => song?.id && !song.isDir).map((song) => song.id);
  const same = ids.length === previous.songIds.length && ids.every((id, i) => id === previous.songIds[i]);
  if (same && previous.name === input.name) return;
  downloadCollection({ ...input, coverArt: input.coverArt ?? previous.coverArt }, songs);
}

export function retryFailed(): void {
  const state = useDownloadStore.getState();
  const updates: Record<string, OfflineTrack> = {};
  for (const track of Object.values(state.tracks)) {
    if (track.state === 'failed' || (track.state === 'queued' && track.retryAt)) {
      updates[track.id] = { ...track, state: 'queued', attempts: 0, error: undefined, retryAt: undefined };
    }
  }
  if (Object.keys(updates).length > 0) commit({ tracks: updates });
  setBlocked(null);
  pump();
}

export function setPaused(paused: boolean): void {
  useDownloadStore.setState({ paused });
  writeSettings({ paused });
  if (paused && active) {
    active.intent = 'pause';
    try {
      active.task.pause();
    } catch {
      // Finished in the meantime.
    }
  }
  if (!paused) {
    setBlocked(null);
    pump();
  }
}

/** Deletes every download and forgets them. Used by Settings and sign-out. */
export async function removeAllDownloads(): Promise<void> {
  if (active) {
    active.intent = 'cancel';
    try {
      active.task.cancel();
    } catch {
      // Nothing running.
    }
  }
  useDownloadProgress.setState({ id: null, bytes: 0, total: 0 });
  const { hydrated, unsupported } = useDownloadStore.getState();
  useDownloadStore.setState({ ...EMPTY_DOWNLOADS, hydrated, unsupported });
  if (!unsupported) {
    // Each folder by name as well as the root, so nothing survives a root
    // that reports itself missing.
    for (const uri of [dirs.tracks(), dirs.covers(), dirs.partial(), dirs.root()]) removeDirectory(uri);
  }
  await eraseIndex();
  if (!unsupported) {
    try {
      ensureDirectories();
    } catch {
      // Created again by the next download.
    }
  }
}

/** Removes cover files nothing downloaded refers to any more. */
function pruneCovers(): void {
  const state = useDownloadStore.getState();
  const wanted = new Set<string>();
  for (const track of Object.values(state.tracks)) if (track.song.coverArt) wanted.add(track.song.coverArt);
  for (const collection of Object.values(state.collections)) if (collection.coverArt) wanted.add(collection.coverArt);

  const drop: Record<string, null> = {};
  for (const [coverId, base] of Object.entries(state.covers)) {
    if (wanted.has(coverId)) continue;
    removeFile(coverFileUri(base));
    removeFile(thumbFileUri(base));
    drop[coverId] = null;
  }
  if (Object.keys(drop).length > 0) commit({ covers: drop });
}

// ---------------------------------------------------------------------------
// The worker
// ---------------------------------------------------------------------------

interface ActiveTransfer {
  id: string;
  task: NativeDownloadTask;
  /** Why it is being stopped, when it is. */
  intent: 'run' | 'pause' | 'cancel';
}

let active: ActiveTransfer | null = null;
let busy = false;
let started = false;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;

/** Listeners told when a track finishes downloading. */
const downloadedListeners = new Set<(id: string) => void>();

export function onTrackDownloaded(listener: (id: string) => void): () => void {
  downloadedListeners.add(listener);
  return () => downloadedListeners.delete(listener);
}

function wakeIn(ms: number): void {
  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = setTimeout(() => {
    wakeTimer = null;
    pump();
  }, Math.max(1000, ms));
}

type Outcome = 'done' | 'failed' | 'blocked' | 'stopped';

/** Starts the next download if nothing is running and something is waiting. */
export function pump(): void {
  if (!started || busy) return;
  const state = useDownloadStore.getState();
  if (!state.hydrated || state.unsupported || state.paused) return;

  const now = Date.now();
  let next: OfflineTrack | null = null;
  let soonest = Infinity;
  for (const track of Object.values(state.tracks)) {
    if (track.state !== 'queued') continue;
    if (track.retryAt && track.retryAt > now) {
      soonest = Math.min(soonest, track.retryAt);
      continue;
    }
    if (!next || track.requestedAt < next.requestedAt) next = track;
  }

  if (!next) {
    setBlocked(null);
    if (soonest < Infinity) wakeIn(soonest - now);
    else void fetchMissingCovers();
    return;
  }

  busy = true;
  const target = next;
  void transfer(target)
    .catch((error: unknown): Outcome => {
      // Anything unexpected is a failed attempt, never a crash.
      recordFailure(target.id, errorMessage(error), false);
      return 'failed';
    })
    .then((outcome) => {
      busy = false;
      // Blocked waits for something to change — a connection, free space,
      // a setting — rather than spinning on the same track.
      if (outcome !== 'blocked') pump();
    });
}

function recordFailure(id: string, message: string, permanent: boolean): void {
  const track = useDownloadStore.getState().tracks[id];
  if (!track) return;
  const attempts = track.attempts + 1;
  const giveUp = permanent || attempts >= MAX_ATTEMPTS;
  commit({
    tracks: {
      [id]: {
        ...track,
        attempts,
        error: message,
        state: giveUp ? 'failed' : 'queued',
        retryAt: giveUp ? undefined : Date.now() + BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)],
      },
    },
  });
}

/** Pulls a readable message out of a Subsonic error body saved in place of audio. */
function serverErrorIn(text: string): string | null {
  return (
    /"message"\s*:\s*"([^"]+)"/.exec(text)?.[1] ??
    /message="([^"]+)"/.exec(text)?.[1] ??
    null
  );
}

async function transfer(track: OfflineTrack): Promise<Outcome> {
  const client = useServerStore.getState().client;
  if (!client) {
    setBlocked('offline');
    return 'blocked';
  }

  let connection;
  try {
    connection = await client.ensureConnection();
  } catch {
    setBlocked('offline');
    wakeIn(OFFLINE_RECHECK_MS);
    return 'blocked';
  }
  if (getSettings().downloadsHomeOnly && connection.kind !== 'local') {
    setBlocked('homeOnly');
    return 'blocked';
  }

  let url: string;
  try {
    url = await client.getStreamUrl(track.id);
  } catch {
    // Lost again between the probe and now: wait like any other outage.
    setBlocked('offline');
    wakeIn(OFFLINE_RECHECK_MS);
    return 'blocked';
  }

  // Removed, paused or finished while the connection was being proven. The
  // last look before the transfer starts: nothing below awaits until then.
  const current = useDownloadStore.getState();
  if (current.paused || current.tracks[track.id]?.state !== 'queued') return 'stopped';

  const partial = partialUri(track.id);
  const already = sizeOf(partial);
  const expected = track.song.size && track.song.size > 0 ? track.song.size : 0;
  const free = freeSpace();
  if (free != null && free < (expected || UNKNOWN_SIZE) - already + RESERVE_BYTES) {
    setBlocked('storage');
    return 'blocked';
  }
  setBlocked(null);

  const task = createDownloadTask();
  const job: ActiveTransfer = { id: track.id, task, intent: 'run' };
  active = job;

  let lastPublished = 0;
  useDownloadProgress.setState({ id: track.id, bytes: already, total: expected });
  const subscription = task.addListener('progress', ({ bytesWritten, totalBytes }) => {
    const now = Date.now();
    if (now - lastPublished < PROGRESS_EVERY_MS) return;
    lastPublished = now;
    useDownloadProgress.setState({
      id: track.id,
      bytes: bytesWritten,
      total: totalBytes > 0 ? totalBytes : expected,
    });
  });

  let result: string | null = null;
  let failure: unknown = null;
  try {
    const destination = file(partial);
    result =
      already > 0
        ? await task.resume(url, destination, String(already))
        : await task.start(url, destination);
  } catch (error) {
    failure = error;
  } finally {
    subscription.remove();
    active = null;
    useDownloadProgress.setState({ id: null, bytes: 0, total: 0 });
    try {
      task.release();
    } catch {
      // Released with the task.
    }
  }

  if (job.intent === 'cancel') {
    removeFile(partial);
    return 'stopped';
  }
  if (job.intent === 'pause') {
    // The partial file stays; the next run picks up where this one stopped.
    return 'stopped';
  }
  if (failure == null && result == null) {
    // Stopped without being asked to. Counted, so it can't spin.
    recordFailure(track.id, 'The download stopped unexpectedly', false);
    return 'failed';
  }

  if (failure != null) {
    const message = errorMessage(failure);
    if (/ENOSPC|No space left/i.test(message)) {
      setBlocked('storage');
      return 'blocked';
    }
    const status = Number(/HTTP (\d{3})/.exec(message)?.[1] ?? 0);
    // A range the server would not serve: start that file again from zero.
    if (status === 416) removeFile(partial);
    const permanent = status === 400 || status === 403 || status === 404 || status === 410;
    recordFailure(track.id, status ? `Server answered ${status}` : message, permanent);
    return 'failed';
  }

  return finish(track, partial, expected);
}

/** Checks a completed transfer and moves it into place. */
async function finish(track: OfflineTrack, partial: string, expected: number): Promise<Outcome> {
  const bytes = sizeOf(partial);

  // A Subsonic error arrives as a small JSON or XML body with a 200, and
  // would otherwise be saved as the "song".
  if (bytes < 64 * 1024 && (expected === 0 || bytes * 4 < expected)) {
    const message = serverErrorIn(readText(partial) ?? '');
    if (message || bytes === 0 || expected > 0) {
      removeFile(partial);
      recordFailure(track.id, message ?? 'The server sent no audio', /not found/i.test(message ?? ''));
      return 'failed';
    }
  }
  if (expected > 0 && bytes < expected) {
    // Ended early but cleanly. The next attempt resumes from here.
    recordFailure(track.id, 'The download ended early', false);
    return 'failed';
  }

  const latest = useDownloadStore.getState().tracks[track.id];
  if (!latest || latest.state !== 'queued') {
    // Removed in the last moments of the transfer.
    removeFile(partial);
    return 'stopped';
  }

  const name = trackFileName(latest.song);
  try {
    moveInto(partial, `${dirs.tracks()}${name}`);
  } catch (error) {
    recordFailure(track.id, errorMessage(error), false);
    return 'failed';
  }

  commit({
    tracks: {
      [track.id]: {
        ...latest,
        state: 'done',
        file: name,
        bytes,
        doneAt: Date.now(),
        attempts: 0,
        error: undefined,
        retryAt: undefined,
      },
    },
  });

  if (latest.song.coverArt) await saveCover(latest.song.coverArt);
  for (const listener of downloadedListeners) {
    try {
      listener(track.id);
    } catch {
      // A listener's failure is its own.
    }
  }
  announceCompleted(track.id);
  return 'done';
}

/** Says so when the track just finished was the last one a collection needed. */
function announceCompleted(id: string): void {
  const state = useDownloadStore.getState();
  for (const collection of Object.values(state.collections)) {
    if (!collection.songIds.includes(id)) continue;
    const complete = collection.songIds.every((songId) => state.tracks[songId]?.state === 'done');
    if (complete) toast.show(`Downloaded ${collection.name}`, { icon: 'download' });
  }
}

/** Saves a cover in both sizes. Best effort: a track plays without one. */
async function saveCover(coverId: string): Promise<void> {
  if (useDownloadStore.getState().covers[coverId]) return;
  const client = useServerStore.getState().client;
  if (!client) return;
  const base = coverBase(coverId);
  try {
    await fetchSmall(await client.getCoverArtUrl(coverId, COVER_SIZE), coverFileUri(base));
    commit({ covers: { [coverId]: base } });
    await fetchSmall(await client.getCoverArtUrl(coverId, THUMB_SIZE), thumbFileUri(base)).catch(() => {});
  } catch {
    removeFile(coverFileUri(base));
  }
}

/** Downloads a small file whole: a cover, never audio. */
async function fetchSmall(url: string, to: string): Promise<void> {
  const task = createDownloadTask();
  try {
    await task.start(url, file(to));
    if (sizeOf(to) === 0) throw new Error('Empty file');
  } finally {
    try {
      task.release();
    } catch {
      // Released with the task.
    }
  }
}

let coversRunning = false;

/** Collections' own covers — a playlist's mosaic — fetched once tracks are done. */
async function fetchMissingCovers(): Promise<void> {
  if (coversRunning) return;
  const state = useDownloadStore.getState();
  if (!useServerStore.getState().connection) return;
  const missing = Object.values(state.collections)
    .map((collection) => collection.coverArt)
    .filter((coverId): coverId is string => !!coverId && !state.covers[coverId]);
  if (missing.length === 0) return;
  coversRunning = true;
  try {
    for (const coverId of missing) await saveCover(coverId);
  } finally {
    coversRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Keeping collections in step with the server
// ---------------------------------------------------------------------------

let lastSync = 0;
let syncing = false;

/** Re-reads every downloaded album and playlist and applies any changes. */
export async function syncCollections(force = false): Promise<void> {
  if (syncing || (!force && Date.now() - lastSync < SYNC_EVERY_MS)) return;
  const client = useServerStore.getState().client;
  if (!client || !useServerStore.getState().connection) return;
  syncing = true;
  lastSync = Date.now();
  try {
    for (const collection of Object.values(useDownloadStore.getState().collections)) {
      try {
        if (collection.kind === 'album') {
          const { song, ...album } = (await client.getAlbum(collection.id)).album;
          noteCollection(
            { kind: 'album', id: album.id, name: album.name, artist: album.artist, year: album.year, coverArt: album.coverArt },
            song ?? [],
          );
        } else if (collection.kind === 'playlist') {
          const playlist = (await client.getPlaylist(collection.id)).playlist;
          noteCollection(
            { kind: 'playlist', id: playlist.id, name: playlist.name, coverArt: playlist.coverArt },
            playlist.entry ?? [],
          );
        } else {
          const songs = (await client.getStarred2()).starred2.song ?? [];
          noteCollection({ kind: 'liked', id: collection.id, name: collection.name, coverArt: songs[0]?.coverArt }, songs);
        }
      } catch (error) {
        // A playlist deleted on the server keeps its download: the files are
        // still the listener's, and Settings can remove them.
        if (error instanceof ApiError && error.code === SubsonicErrorCode.NotFound) continue;
        // Anything else — out of reach mid-way — waits for the next sync.
        lastSync = 0;
        return;
      }
    }
  } finally {
    syncing = false;
  }
}

// ---------------------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------------------

/**
 * Loads the index, squares it with what is actually on disk, and starts the
 * worker. Returns a cleanup that stops it.
 */
export function startDownloads(): () => void {
  started = true;
  let disposed = false;

  void (async () => {
    const unsupported = unsupportedReason();
    if (unsupported) {
      useDownloadStore.setState({ hydrated: true, unsupported });
      return;
    }
    try {
      const index = await loadIndex();
      if (disposed) return;
      ensureDirectories();
      const reconciled = reconcile(index.tracks, index.collections);
      useDownloadStore.setState({
        hydrated: true,
        unsupported: null,
        tracks: reconciled.tracks,
        collections: index.collections,
        covers: reconciled.covers,
        paused: index.settings.paused,
        blocked: null,
      });
      for (const track of reconciled.changed) writeTrack(track);
      pump();
      void syncCollections();
    } catch (error) {
      useDownloadStore.setState({ hydrated: true, unsupported: `Downloads couldn't start: ${errorMessage(error)}` });
    }
  })();

  // A connection arriving, or moving between home and away, can unblock the
  // queue — and is the moment to look for changes to downloaded playlists.
  const unsubscribeServer = useServerStore.subscribe((state, previous) => {
    const kind = state.connection?.kind ?? null;
    const before = previous.connection?.kind ?? null;
    if (kind === before) return;
    if (kind) {
      pump();
      void syncCollections();
    }
  });
  const unsubscribeSettings = useSettingsStore.subscribe((state, previous) => {
    if (state.downloadsHomeOnly !== previous.downloadsHomeOnly) pump();
  });
  const appState = AppState.addEventListener('change', (next) => {
    if (next === 'active') pump();
    else void flush();
  });

  return () => {
    disposed = true;
    started = false;
    unsubscribeServer();
    unsubscribeSettings();
    appState.remove();
    if (wakeTimer) clearTimeout(wakeTimer);
    wakeTimer = null;
    void flush();
  };
}

/**
 * Brings the index into line with the files.
 *
 *   - A "done" track whose file has gone is queued again.
 *   - A queued track whose finished file is already there — the app was
 *     closed between moving it into place and writing that down — is done.
 *   - Files no record accounts for are deleted: they can only be leftovers.
 */
function reconcile(
  tracks: Record<string, OfflineTrack>,
  collections: Record<string, OfflineCollection>,
): { tracks: Record<string, OfflineTrack>; covers: Record<string, string>; changed: OfflineTrack[] } {
  const onDisk = new Set(listNames(dirs.tracks()));
  const result: Record<string, OfflineTrack> = {};
  const changed: OfflineTrack[] = [];
  const keepFiles = new Set<string>();
  const keepPartials = new Set<string>();

  for (const track of Object.values(tracks)) {
    let next = track;
    if (track.state === 'done') {
      if (!track.file || !onDisk.has(track.file)) {
        next = { ...track, state: 'queued', file: undefined, bytes: undefined, attempts: 0, retryAt: undefined };
      }
    } else {
      const name = trackFileName(track.song);
      const expected = track.song.size ?? 0;
      if (onDisk.has(name) && (expected === 0 || sizeOf(`${dirs.tracks()}${name}`) === expected)) {
        next = {
          ...track,
          state: 'done',
          file: name,
          bytes: sizeOf(`${dirs.tracks()}${name}`),
          doneAt: Date.now(),
          error: undefined,
          retryAt: undefined,
        };
      }
    }
    // Pins naming collections that no longer exist are dropped; a track
    // left with none was orphaned and goes.
    const pins = next.pins.filter((pin) => pin === SINGLE_PIN || collections[pin]);
    if (pins.length === 0) {
      changed.push({ ...next, pins: [] });
      continue;
    }
    if (pins.length !== next.pins.length) next = { ...next, pins };
    if (next !== track) changed.push(next);
    result[next.id] = next;
    if (next.state === 'done' && next.file) keepFiles.add(next.file);
    if (next.state !== 'done') keepPartials.add(`${safeName(next.id)}.part`);
  }

  for (const name of onDisk) if (!keepFiles.has(name)) removeFile(`${dirs.tracks()}${name}`);
  for (const name of listNames(dirs.partial())) {
    if (!keepPartials.has(name)) removeFile(`${dirs.partial()}${name}`);
  }

  // Covers: keep those something still refers to, and know which exist.
  const coverNames = new Set(listNames(dirs.covers()));
  const covers: Record<string, string> = {};
  const keepCovers = new Set<string>();
  const wanted = new Set<string>();
  for (const track of Object.values(result)) if (track.song.coverArt) wanted.add(track.song.coverArt);
  for (const collection of Object.values(collections)) if (collection.coverArt) wanted.add(collection.coverArt);
  for (const coverId of wanted) {
    const base = coverBase(coverId);
    if (coverNames.has(`${base}.jpg`)) {
      covers[coverId] = base;
      keepCovers.add(`${base}.jpg`);
      keepCovers.add(`${base}.thumb.jpg`);
    }
  }
  for (const name of coverNames) if (!keepCovers.has(name)) removeFile(`${dirs.covers()}${name}`);

  // Orphans are written as deletions.
  for (const track of changed) {
    if (track.pins.length === 0) eraseTrack(track.id);
  }

  return { tracks: result, covers, changed: changed.filter((track) => track.pins.length > 0) };
}

// ---------------------------------------------------------------------------
// Figures for the downloads panel
// ---------------------------------------------------------------------------

export interface DownloadTotals {
  done: number;
  queued: number;
  failed: number;
  bytes: number;
}

export function totalsOf(tracks: Record<string, OfflineTrack>): DownloadTotals {
  let done = 0;
  let queued = 0;
  let failed = 0;
  let bytes = 0;
  for (const id in tracks) {
    const track = tracks[id];
    if (track.state === 'done') {
      done += 1;
      bytes += track.bytes ?? 0;
    } else if (track.state === 'queued') queued += 1;
    else failed += 1;
  }
  return { done, queued, failed, bytes };
}
