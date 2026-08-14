import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TrackPlayer, {
  Event,
  useActiveMediaItem,
  type MediaItem,
} from '@rntp/player';

import { Button } from '../components/Button';
import { IconTrash } from '../components/icons';
import { ListRow } from '../components/ListRow';
import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState } from '../components/ScreenState';
import { SwipeableRow } from '../components/SwipeableRow';
import { extrasOf } from '../player/trackMapping';
import { usePlayerStore } from '../store/usePlayerStore';
import { color, icon, space } from '../theme/tokens';
import { formatDuration, pluralize } from '../utils/time';

/**
 * The current queue.
 *
 * The player owns the queue, so this mirrors it rather than storing its own
 * copy — subscribing to QueueChanged keeps it correct when playback advances
 * on its own, or when the notification's skip buttons reorder what's next.
 */
export function QueueScreen() {
  const insets = useSafeAreaInsets();
  const activeItem = useActiveMediaItem();
  const removeFromQueue = usePlayerStore((state) => state.removeFromQueue);
  const clearQueue = usePlayerStore((state) => state.clearQueue);

  const [queue, setQueue] = useState<MediaItem[]>([]);

  const syncQueue = useCallback(() => {
    setQueue(TrackPlayer.getQueue());
  }, []);

  useEffect(() => {
    syncQueue();
    const subscription = TrackPlayer.addEventListener(Event.QueueChanged, syncQueue);
    return () => subscription.remove();
  }, [syncQueue]);

  // Also resync when the active track changes: the queue contents may be
  // unchanged while which item is current has moved.
  useEffect(syncQueue, [activeItem, syncQueue]);

  const activeId = extrasOf(activeItem)?.subsonicId;
  const totalDuration = queue.reduce((sum, item) => sum + (item.duration ?? 0), 0);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Queue"
        action={
          queue.length > 0 ? (
            // No manual resync: reading the queue straight after a write
            // returns the pre-write state, since the write is dispatched to
            // the native queue while the read runs inline. QueueChanged
            // arrives once the change has actually landed.
            <Button label="Clear" onPress={clearQueue} />
          ) : undefined
        }
      />

      <FlatList
        data={queue}
        keyExtractor={(item, index) => `${item.mediaId ?? index}-${index}`}
        ListEmptyComponent={
          <EmptyState
            label="Queue is empty"
            hint="Play an album or add tracks from the library."
          />
        }
        contentContainerStyle={queue.length ? styles.listContent : styles.emptyContainer}
        renderItem={({ item, index }) => (
          <SwipeableRow
            leftSwipe={{
              icon: <IconTrash size={icon.size} color={color.accentInk} strokeWidth={2} />,
              label: 'Remove',
              onAction: () => removeFromQueue(index),
            }}
          >
            <ListRow
              title={item.title ?? 'Unknown title'}
              meta={[item.artist, item.duration ? formatDuration(item.duration) : null]
                .filter(Boolean)
                .join(' · ')}
              artworkUri={typeof item.artworkUrl === 'string' ? item.artworkUrl : undefined}
              active={extrasOf(item)?.subsonicId === activeId}
              last={index === queue.length - 1}
              onPress={() => TrackPlayer.skipToIndex(index)}
            />
          </SwipeableRow>
        )}
        ListFooterComponent={
          queue.length > 0 ? (
            <View style={styles.footer}>
              <EmptyState
                label={`${pluralize(queue.length, 'track')} · ${formatDuration(totalDuration)}`}
              />
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  listContent: { paddingBottom: space[6] },
  emptyContainer: { flexGrow: 1 },
  footer: { height: 80 },
});
