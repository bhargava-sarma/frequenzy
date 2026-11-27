import TrackPlayer, { DEFAULT_CAST_RECEIVER_APP_ID, PlayerCommand } from '@rntp/player';

/**
 * One-time player initialization.
 *
 * v5 is a TurboModule, so these calls are synchronous JSI rather than async
 * bridge round trips — no promise to await, and no setup race to guard beyond
 * not running twice.
 */

let initialized = false;

export function setupPlayer(): void {
  if (initialized) return;

  TrackPlayer.setupPlayer({
    contentType: 'music',
    // Pause when headphones are unplugged rather than blasting the room.
    handleAudioBecomingNoisy: true,
    android: {
      // Music should survive swiping the app out of recents — stopping there
      // is the behaviour that makes other Subsonic clients frustrating.
      taskRemovedBehavior: 'continue',
      // Google Cast, to the Default Media Receiver: what Nest and Google Home
      // speakers play. Media3 hands the queue to the speaker when a session
      // starts and takes it back when it ends; the receiver comes from the
      // options provider the app declares (plugins/withCast.js).
      cast: DEFAULT_CAST_RECEIVER_APP_ID,
    },
    // Disk cache is deliberately left off. It defaults to 500 MB, and this
    // library is lossless FLAC where a single album runs to hundreds of MB;
    // filling a phone silently is worse than re-streaming over Tailscale.
  });

  TrackPlayer.setCommands({
    capabilities: [
      PlayerCommand.PlayPause,
      PlayerCommand.Previous,
      PlayerCommand.Next,
      PlayerCommand.Seek,
      PlayerCommand.Stop,
    ],
    // Native handling means the lock screen, notification and Android Auto
    // respond without the JS runtime being alive. With 'js' these controls
    // would be dead whenever Android had reclaimed the runtime — and in-car
    // surfaces never run JS at all.
    handling: 'native',
  });

  initialized = true;
}

