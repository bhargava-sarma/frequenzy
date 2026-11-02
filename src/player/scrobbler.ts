import TrackPlayer, { Event } from '@rntp/player';

import type { SubsonicClient } from '../api/client';
import { recordPlay } from '../data/playHistory';
import { getSettings } from '../store/useSettingsStore';
import { extrasOf } from './trackMapping';

/**
 * Reports plays to Navidrome and to the local history.
 *
 * Without this the server records nothing, which costs more than a missing
 * feature: its recently-played and most-played lists stay permanently empty,
 * and the listening history is simply lost as it happens.
 *
 * Two things get sent per track. A "now playing" ping when it starts, which
 * Navidrome displays live and does not store, and a submission once enough of
 * the track has played, which is the one that counts.
 *
 * The thresholds are Last.fm's, which every Subsonic server expects: half the
 * track or four minutes, whichever comes first, and nothing under 30 seconds
 * is scrobbled at all. Sticking to the convention matters because these plays
 * land in the same counters as the ones from any other client.
 *
 * Progress is polled from JS rather than driven by Event.PlaybackProgressUpdated.
 * That event only fires when progressSync.intervalSeconds is configured, and it
 * is emitted by the playback *service*, which reads its config from stored
 * preferences — so whether it arrives depends on service lifecycle rather than
 * on anything this file controls. Since the JS runtime has to be alive for the
 * scrobble request to be sent at all, polling here costs nothing extra and
 * removes that dependency entirely.
 */

/** Tracks shorter than this are never scrobbled. */
const MIN_DURATION_SECONDS = 30;
/** Submit once this fraction of the track has played... */
const SUBMIT_RATIO = 0.5;
/** ...or this many seconds in, whichever comes first. */
const SUBMIT_AFTER_SECONDS = 4 * 60;
/** How often to check progress. Far finer than scrobbling needs. */
const POLL_INTERVAL_MS = 5000;

interface PlayState {
  mediaId: string;
  /** Epoch ms the track started, sent as the play's timestamp. */
  startedAt: number;
  submitted: boolean;
  /**
   * Whether the "now playing" ping went out. Deferred until audio actually
   * runs: a queue restored paused on launch would otherwise announce a
   * track nobody is listening to.
   */
  announced: boolean;
}

/**
 * Starts watching. Returns a cleanup that stops polling and unsubscribes.
 *
 * The client is read through a getter rather than captured, so a failover to
 * the other base URL is picked up without restarting the scrobbler.
 */
export function startScrobbler(getClient: () => SubsonicClient | null): () => void {
  let current: PlayState | null = null;

  /**
   * Scrobbles are advisory: a play that fails to report is not worth
   * surfacing to someone who is listening to music, and the server may simply
   * be unreachable at that moment.
   */
  function report(work: Promise<unknown>) {
    work.catch((error: unknown) => {
      if (__DEV__) console.warn('[scrobble] failed', error);
    });
  }

  function beginTrack(mediaId: string) {
    // Repeat-one re-enters the same track; treating it as a fresh play means a
    // track on loop scrobbles each time round rather than once.
    current = { mediaId, startedAt: Date.now(), submitted: false, announced: false };
    if (TrackPlayer.isPlaying()) announce();
  }

  function announce() {
    if (!current || current.announced) return;
    current.announced = true;
    const client = getClient();
    if (client && getSettings().scrobble) {
      report(client.scrobble(current.mediaId, { submission: false }));
    }
  }

  const transition = TrackPlayer.addEventListener(Event.MediaItemTransition, ({ item }) => {
    const mediaId = item?.mediaId;
    if (!mediaId) {
      current = null;
      return;
    }
    beginTrack(mediaId);
  });

  const timer = setInterval(() => {
    const item = TrackPlayer.getActiveMediaItem();
    const mediaId = item?.mediaId;
    if (!mediaId) {
      current = null;
      return;
    }

    // The queue can move without a transition event reaching us — a cold start
    // into an existing queue, for instance — so trust what is actually playing
    // over what is being held.
    if (!current || current.mediaId !== mediaId) {
      beginTrack(mediaId);
      return;
    }

    if (!TrackPlayer.isPlaying()) return;
    announce();
    if (current.submitted) return;

    const { position, duration } = TrackPlayer.getProgress();
    if (!duration || duration < MIN_DURATION_SECONDS) return;

    const threshold = Math.min(duration * SUBMIT_RATIO, SUBMIT_AFTER_SECONDS);
    if (position < threshold) return;

    const client = getClient();
    if (!client) return;

    // Set before awaiting: a failed submission is not retried, and leaving the
    // flag clear would re-fire on every tick for the rest of the track.
    current.submitted = true;
    if (getSettings().scrobble) {
      report(client.scrobble(mediaId, { submission: true, time: current.startedAt }));
    }

    // Logged locally either way: it is this device's own history, and the
    // charts and stats are built from it whether or not the server hears.
    const extras = extrasOf(item);
    report(
      recordPlay({
        songId: mediaId,
        title: item?.title ?? 'Unknown title',
        artist: item?.artist,
        artistId: extras?.artistId,
        album: item?.albumTitle ?? extras?.albumTitle,
        albumId: extras?.albumId,
        coverArt: extras?.coverArt,
        duration: duration,
        playedAt: current.startedAt,
      }),
    );
  }, POLL_INTERVAL_MS);

  return () => {
    transition.remove();
    clearInterval(timer);
  };
}
