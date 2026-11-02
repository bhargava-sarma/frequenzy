import { useEffect, useState } from 'react';
import TrackPlayer, { Event } from '@rntp/player';

/**
 * Where the current track sits in the queue — "03/12" on the display.
 *
 * Read after the events that can change it rather than on every render:
 * getQueue copies the whole queue across the bridge, which is cheap once
 * and wasteful at 60 renders a minute.
 */
export function useQueuePosition(): { index: number; length: number } {
  const read = () => {
    try {
      return {
        index: TrackPlayer.getActiveMediaItemIndex() ?? -1,
        length: TrackPlayer.getQueue().length,
      };
    } catch {
      return { index: -1, length: 0 };
    }
  };

  const [position, setPosition] = useState(read);

  useEffect(() => {
    const update = () => setPosition(read());
    const queueSub = TrackPlayer.addEventListener(Event.QueueChanged, update);
    const transitionSub = TrackPlayer.addEventListener(Event.MediaItemTransition, update);
    update();
    return () => {
      queueSub.remove();
      transitionSub.remove();
    };
  }, []);

  return position;
}
