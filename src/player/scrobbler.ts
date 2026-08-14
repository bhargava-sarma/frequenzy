import TrackPlayer, { Event } from '@rntp/player';

import type { SubsonicClient } from '../api/client';

/**
 * Reports plays back to Navidrome.
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
 */

/** Tracks shorter than this are never scrobbled. */
const MIN_DURATION_SECONDS = 30;
/** Submit once this fraction of the track has played... */
const SUBMIT_RATIO = 0.5;
/** ...or this many seconds in, whichever comes first. */
const SUBMIT_AFTER_SECONDS = 4 * 60;

interface PlayState {
  mediaId: string;
  /** Epoch ms the track started, sent as the play's timestamp. */
  startedAt: number;
  submitted: boolean;
}

/**
 * Starts listening. Returns a cleanup that removes the subscriptions.
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
  function report(work: Promise<void>) {
    work.catch((error: unknown) => {
      if (__DEV__) console.warn('[scrobble] failed', error);
    });
  }

  const transition = TrackPlayer.addEventListener(Event.MediaItemTransition, ({ item }) => {
    const mediaId = item?.mediaId;
    if (!mediaId) {
      current = null;
      return;
    }

    // Repeat-one re-fires this event for the same track; treat it as a fresh
    // play so a track on loop scrobbles each time round rather than once.
    current = { mediaId, startedAt: Date.now(), submitted: false };

    const client = getClient();
    if (client) report(client.scrobble(mediaId, { submission: false }));
  });

  const progress = TrackPlayer.addEventListener(
    Event.PlaybackProgressUpdated,
    ({ mediaId, position, duration }) => {
      // The queue can move without a transition event reaching us — a cold
      // start into an existing queue, for instance — so trust the id on the
      // tick over the one being held.
      if (!current || current.mediaId !== mediaId) {
        current = { mediaId, startedAt: Date.now(), submitted: false };
        return;
      }

      if (current.submitted) return;
      if (!duration || duration < MIN_DURATION_SECONDS) return;

      const threshold = Math.min(duration * SUBMIT_RATIO, SUBMIT_AFTER_SECONDS);
      if (position < threshold) return;

      const client = getClient();
      if (!client) return;

      // Set before awaiting: a failed submission is not retried, and leaving
      // the flag clear would re-fire on every tick for the rest of the track.
      current.submitted = true;
      report(client.scrobble(mediaId, { submission: true, time: current.startedAt }));
    },
  );

  return () => {
    transition.remove();
    progress.remove();
  };
}
