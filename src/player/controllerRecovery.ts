import TrackPlayer, { Event } from '@rntp/player';

import { restoreQueue } from './queuePersistence';
import { recoverPlayer } from './setup';

/**
 * Brings the player back when its controller loses the playback service.
 *
 * Every command is sent through a controller bound to the service. When that
 * binding fails or drops, the player says so with a PlaybackError coded
 * 'controller-connection-failed', throws away what was waiting, and does
 * nothing more until it is set up again. Left alone, every button in the app
 * would silently do nothing. So: set it up again, and put back the queue that
 * was saved, paused where it was — the same thing a fresh launch does.
 */
export function startControllerRecovery(onGaveUp: (message: string) => void): () => void {
  const subscription = TrackPlayer.addEventListener(Event.PlaybackError, (event) => {
    if (event.code !== 'controller-connection-failed') return;
    if (!recoverPlayer()) {
      onGaveUp('The player could not reach its service. Close and reopen the app.');
      return;
    }
    void restoreQueue().catch(() => {});
  });
  return () => subscription.remove();
}
