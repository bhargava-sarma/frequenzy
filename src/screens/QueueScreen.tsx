import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import TrackPlayer, { Event, useActiveMediaItem, type MediaItem } from '@rntp/player';

import { AmbientBackground } from '../components/AmbientBackground';
import { DismissibleSheet } from '../components/DismissibleSheet';
import { Button } from '../components/Button';
import { IconTrash } from '../components/icons';
import { ListRow } from '../components/ListRow';
import { ScreenHeader } from '../components/ScreenHeader';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState } from '../components/ScreenState';
import { SwipeableRow } from '../components/SwipeableRow';
import { extrasOf } from '../player/trackMapping';
import { usePlayerStore } from '../store/usePlayerStore';
import { icon, space } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { formatDuration, pluralize } from '../utils/time';

/**
 * The current queue.
 *
 * The player owns the queue, so this mirrors it rather than storing its own
 * copy — subscribing to QueueChanged keeps it correct when playback advances
 * on its own, or when the notification's skip buttons reorder what's next.
 *
 * Rows are grouped into what's playing, what you hand-picked, and the rest of
 * the album or playlist behind it. Without the grouping the two-tier queue is
 * invisible: a track added by swipe would appear to have jumped the line for
 * no stated reason.
 */

type Row =
  | { kind: 'header'; key: string; title: string; count?: string }
  | { kind: 'track'; key: string; item: MediaItem; index: number; removable: boolean };

export function QueueScreen() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const activeItem = useActiveMediaItem();
  const removeFromQueue = usePlayerStore((state) => state.removeFromQueue);
  const clearQueue = usePlayerStore((state) => state.clearQueue);
  const priorityCount = usePlayerStore((state) => state.priorityCount);

  const [queue, setQueue] = useState<MediaItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const syncQueue = useCallback(() => {
    setQueue(TrackPlayer.getQueue());
    setActiveIndex(TrackPlayer.getActiveMediaItemIndex() ?? -1);
  }, []);

  useEffect(() => {
    syncQueue();
    const subscription = TrackPlayer.addEventListener(Event.QueueChanged, syncQueue);
    return () => subscription.remove();
  }, [syncQueue]);

  // Also resync when the active track changes: the queue contents may be
  // unchanged while which item is current has moved.
  useEffect(syncQueue, [activeItem, syncQueue]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (queue.length === 0) return out;

    const priorityEnd = activeIndex + priorityCount;

    queue.forEach((item, index) => {
      if (index === activeIndex) {
        out.push({ kind: 'header', key: 'h-now', title: 'Now playing' });
      } else if (index === activeIndex + 1 && priorityCount > 0) {
        out.push({ kind: 'header', key: 'h-next', title: 'Playing next' });
      } else if (index === priorityEnd + 1) {
        out.push({ kind: 'header', key: 'h-rest', title: 'Then' });
      }

      out.push({
        kind: 'track',
        key: `${item.mediaId ?? 'item'}-${index}`,
        item,
        index,
        // Removing the track that is currently playing would stop playback
        // mid-song, which is a surprising outcome for a swipe.
        removable: index !== activeIndex,
      });
    });

    return out;
  }, [queue, activeIndex, priorityCount]);

  const activeId = extrasOf(activeItem)?.subsonicId;
  const totalDuration = queue.reduce((sum, item) => sum + (item.duration ?? 0), 0);

  return (
    <DismissibleSheet
      onDismiss={() => navigation.goBack()}
      style={[styles.root, { paddingTop: insets.top }]}
    >
      <AmbientBackground intensity={0.5} />

      <ScreenHeader
        title="Queue"
        onBack={() => navigation.goBack()}
        action={queue.length > 0 ? <Button label="Clear" onPress={clearQueue} /> : undefined}
      />

      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        ListEmptyComponent={
          <EmptyState
            label="Queue is empty"
            hint="Play an album or add tracks from the library."
          />
        }
        contentContainerStyle={rows.length ? styles.listContent : styles.emptyContainer}
        renderItem={({ item: row }) => {
          if (row.kind === 'header') {
            return <SectionHeader title={row.title} />;
          }

          const track = (
            <ListRow
              title={row.item.title ?? 'Unknown title'}
              meta={[row.item.artist, row.item.duration ? formatDuration(row.item.duration) : null]
                .filter(Boolean)
                .join(' · ')}
              artworkUri={
                typeof row.item.artworkUrl === 'string' ? row.item.artworkUrl : undefined
              }
              active={extrasOf(row.item)?.subsonicId === activeId && row.index === activeIndex}
              last={row.index === queue.length - 1}
              onPress={() => TrackPlayer.skipToIndex(row.index)}
            />
          );

          if (!row.removable) return track;

          return (
            <SwipeableRow
              leftSwipe={{
                icon: <IconTrash size={icon.size} color={color.accentInk} strokeWidth={2} />,
                label: 'Remove',
                // No manual resync: reading the queue straight after a write
                // returns the pre-write state, since the write is dispatched to
                // the native queue while the read runs inline. QueueChanged
                // arrives once the change has actually landed.
                onAction: () => removeFromQueue(row.index),
              }}
            >
              {track}
            </SwipeableRow>
          );
        }}
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
    </DismissibleSheet>
  );
}

const makeStyles = (color: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  listContent: { paddingBottom: space[6] },
  emptyContainer: { flexGrow: 1 },
  footer: { height: 80 },
});
