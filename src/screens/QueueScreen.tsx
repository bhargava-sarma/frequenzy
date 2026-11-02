import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TrackPlayer, { Event, useIsPlaying, type MediaItem } from '@rntp/player';

import { AddToPlaylistSheet } from '../components/AddToPlaylistSheet';
import { AmbientBackground } from '../components/AmbientBackground';
import { Artwork } from '../components/Artwork';
import { Display } from '../components/Display';
import { IconButton } from '../components/IconButton';
import {
  IconAlbum,
  IconArrowDown,
  IconArrowUp,
  IconArrowsShuffle,
  IconChevronDown,
  IconCornerDownRight,
  IconDots,
  IconListDetails,
  IconPlayerPlayFilled,
  IconPlaylistAdd,
  IconTrash,
  IconUser,
  IconX,
} from '../components/icons';
import { Label } from '../components/Label';
import { ListRow } from '../components/ListRow';
import { PanelHandle } from '../components/PanelHandle';
import { PlayingBars } from '../components/PlayingBars';
import { PromptSheet } from '../components/PromptSheet';
import { EmptyState } from '../components/ScreenState';
import { Sheet, SheetRow } from '../components/Sheet';
import { SwipeableRow } from '../components/SwipeableRow';
import { useArtwork } from '../hooks/useArtwork';
import { navigateToAlbum, navigateToArtist } from '../navigation/ref';
import { extrasOf } from '../player/trackMapping';
import { usePlayerStore } from '../store/usePlayerStore';
import { usePlayerUiStore } from '../store/usePlayerUiStore';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { errorMessage, toast } from '../store/useToastStore';
import { layout, radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';
import { formatClock, formatDuration, formatLength, pluralize } from '../utils/time';

/**
 * The queue, as the player holds it.
 *
 * Mirrored rather than stored: subscribing to QueueChanged keeps it right
 * when playback advances on its own or the notification skips. Grouped into
 * what's playing, what you hand-picked, and the rest of the album or
 * playlist behind it — without the grouping the two-tier queue is invisible
 * and a swiped-in track seems to have jumped the line for no reason.
 *
 * Swipe right to bring a track up next, left to drop it; ⋮ for the rest,
 * including nudging it up or down a slot.
 */

type Row =
  | { kind: 'header'; key: string; title: string; detail?: string }
  | { kind: 'track'; key: string; item: MediaItem; index: number; dimmed: boolean; last: boolean }
  | { kind: 'history-toggle'; key: string; count: number };

export function QueueScreen() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const closeQueue = usePlayerUiStore((state) => state.closeQueue);
  const isPlaying = useIsPlaying();

  const removeFromQueue = usePlayerStore((state) => state.removeFromQueue);
  const moveToNext = usePlayerStore((state) => state.moveToNext);
  const nudge = usePlayerStore((state) => state.nudge);
  const clearUpcoming = usePlayerStore((state) => state.clearUpcoming);
  const setShuffled = usePlayerStore((state) => state.setShuffled);
  const shuffled = usePlayerStore((state) => state.shuffled);
  const priorityCount = usePlayerStore((state) => state.priorityCount);
  const source = usePlayerStore((state) => state.source);
  const speed = usePlayerStore((state) => state.speed);
  const createPlaylist = usePlaylistStore((state) => state.create);

  const [queue, setQueue] = useState<MediaItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [showHistory, setShowHistory] = useState(false);
  const [menu, setMenu] = useState<'none' | 'queue' | 'save'>('none');
  const [target, setTarget] = useState<{ item: MediaItem; index: number } | null>(null);
  const [adding, setAdding] = useState<string[] | null>(null);
  const [position, setPosition] = useState(0);

  const sync = useCallback(() => {
    setQueue(TrackPlayer.getQueue());
    setActiveIndex(TrackPlayer.getActiveMediaItemIndex() ?? -1);
    setPosition(TrackPlayer.getProgress().position);
  }, []);

  useEffect(() => {
    sync();
    const queueSub = TrackPlayer.addEventListener(Event.QueueChanged, sync);
    const transitionSub = TrackPlayer.addEventListener(Event.MediaItemTransition, sync);
    return () => {
      queueSub.remove();
      transitionSub.remove();
    };
  }, [sync]);

  const current = activeIndex >= 0 ? queue[activeIndex] : undefined;
  const upcoming = activeIndex >= 0 ? queue.slice(activeIndex + 1) : queue;
  const remainingSeconds =
    Math.max(0, (current?.duration ?? 0) - position) +
    upcoming.reduce((sum, item) => sum + (item.duration ?? 0), 0);
  const endsAt = Date.now() + (remainingSeconds / (speed || 1)) * 1000;

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (queue.length === 0 || activeIndex < 0) return out;

    const priorityEnd = activeIndex + priorityCount;
    const restStart = priorityEnd + 1;

    if (priorityCount > 0) {
      out.push({ kind: 'header', key: 'h-next', title: 'Playing next', detail: pluralize(priorityCount, 'track') });
      for (let i = activeIndex + 1; i <= Math.min(priorityEnd, queue.length - 1); i++) {
        out.push({ kind: 'track', key: `${queue[i].mediaId}-${i}`, item: queue[i], index: i, dimmed: false, last: i === priorityEnd });
      }
    }
    if (restStart < queue.length) {
      out.push({
        kind: 'header',
        key: 'h-rest',
        title: priorityCount > 0 ? 'Then' : 'Up next',
        detail: source ? source.label : pluralize(queue.length - restStart, 'track'),
      });
      for (let i = restStart; i < queue.length; i++) {
        out.push({ kind: 'track', key: `${queue[i].mediaId}-${i}`, item: queue[i], index: i, dimmed: false, last: i === queue.length - 1 });
      }
    }
    if (activeIndex > 0) {
      out.push({ kind: 'history-toggle', key: 'h-history', count: activeIndex });
      if (showHistory) {
        for (let i = activeIndex - 1; i >= 0; i--) {
          out.push({ kind: 'track', key: `${queue[i].mediaId}-${i}`, item: queue[i], index: i, dimmed: true, last: i === 0 });
        }
      }
    }
    return out;
  }, [queue, activeIndex, priorityCount, showHistory, source]);

  const jump = useCallback((index: number) => {
    haptics.press();
    TrackPlayer.skipToIndex(index);
    TrackPlayer.play();
  }, []);

  const remove = useCallback(
    (index: number, title?: string) => {
      removeFromQueue(index);
      toast.show('Removed from queue', { icon: 'queue', detail: title });
    },
    [removeFromQueue],
  );

  const next = useCallback(
    (index: number, title?: string) => {
      moveToNext(index);
      toast.show('Playing next', { icon: 'next', detail: title });
    },
    [moveToNext],
  );

  const openMenu = useCallback((item: MediaItem, index: number) => setTarget({ item, index }), []);

  const targetExtras = extrasOf(target?.item);
  const targetIsUpcoming = target != null && target.index > activeIndex;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AmbientBackground variant="immersive" intensity={0.55} dim={0.2} />

      <PanelHandle>
        <View style={styles.header}>
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            <IconButton icon={IconChevronDown} accessibilityLabel="Close queue" onPress={closeQueue} />
            <View style={styles.headerText}>
              <Text style={styles.title}>Queue</Text>
              <Label tone="secondary" numberOfLines={1}>
                {queue.length > 0
                  ? `${pluralize(queue.length, 'track')} · ${formatLength(remainingSeconds)} left · ends ${formatClock(endsAt)}`
                  : 'Empty'}
              </Label>
            </View>
            <IconButton
              icon={IconDots}
              accessibilityLabel="Queue options"
              disabled={queue.length === 0}
              onPress={() => setMenu('queue')}
            />
          </View>
        </View>
      </PanelHandle>

      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        ListHeaderComponent={
          current ? (
            <Display style={styles.nowCard}>
              <Artwork uri={typeof current.artworkUrl === 'string' ? current.artworkUrl : undefined} size={56} />
              <View style={styles.nowText}>
                <Label tone="displayDim">Now playing</Label>
                <Text style={styles.nowTitle} numberOfLines={1}>
                  {current.title ?? 'Unknown title'}
                </Text>
                <Text style={styles.nowArtist} numberOfLines={1}>
                  {current.artist ?? 'Unknown artist'}
                </Text>
              </View>
              <PlayingBars playing={isPlaying} color={color.accent} size={16} />
            </Display>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon={IconListDetails}
            label="Queue is empty"
            hint="Play an album, or swipe a track right to queue it."
          />
        }
        renderItem={({ item: row }) => {
          if (row.kind === 'header') {
            return (
              <View style={styles.section}>
                <Label tone="primary" bold>
                  {row.title}
                </Label>
                {row.detail ? (
                  <Label tone="tertiary" style={styles.sectionDetail}>
                    {row.detail}
                  </Label>
                ) : null}
              </View>
            );
          }
          if (row.kind === 'history-toggle') {
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  haptics.tick();
                  setShowHistory((value) => !value);
                }}
                style={({ pressed }) => [styles.section, pressed && styles.pressed]}
              >
                <Label tone="secondary" bold>
                  {showHistory ? 'Hide played' : `Played · ${row.count}`}
                </Label>
                <Label tone="accent" bold>
                  {showHistory ? 'Hide' : 'Show'}
                </Label>
              </Pressable>
            );
          }
          return (
            <QueueRow
              item={row.item}
              index={row.index}
              dimmed={row.dimmed}
              last={row.last}
              onJump={jump}
              onNext={next}
              onRemove={remove}
              onMenu={openMenu}
              upcoming={row.index > activeIndex}
            />
          );
        }}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space[8] }]}
        initialNumToRender={14}
        windowSize={9}
      />

      <Sheet
        visible={menu === 'queue'}
        onClose={() => setMenu('none')}
        title="Queue"
        subtitle={pluralize(queue.length, 'track')}
      >
        <SheetRow
          label={shuffled ? 'Unshuffle' : 'Shuffle up next'}
          icon={IconArrowsShuffle}
          onPress={() => {
            setMenu('none');
            void setShuffled(!shuffled);
          }}
        />
        <SheetRow label="Save as playlist…" icon={IconPlaylistAdd} onPress={() => setMenu('save')} />
        <SheetRow
          label="Clear up next"
          icon={IconTrash}
          tone="destructive"
          last
          disabled={upcoming.length === 0}
          onPress={() => {
            setMenu('none');
            clearUpcoming();
            toast.show('Cleared up next', { icon: 'queue' });
          }}
        />
      </Sheet>

      <PromptSheet
        visible={menu === 'save'}
        onClose={() => setMenu('none')}
        title="Save queue"
        placeholder="Playlist name"
        initialValue={source?.label ? `${source.label} — queue` : ''}
        confirmLabel="Save"
        onConfirm={async (name) => {
          const ids = queue.map((item) => extrasOf(item)?.subsonicId).filter((id): id is string => !!id);
          try {
            await createPlaylist(name, ids);
            haptics.success();
            toast.success(`Saved ${name}`, { icon: 'playlist', detail: pluralize(ids.length, 'track') });
          } catch (error) {
            toast.error("Couldn't save", { detail: errorMessage(error) });
            throw error;
          }
        }}
      />

      <Sheet
        visible={target != null && adding == null}
        onClose={() => setTarget(null)}
        title={target?.item.title ?? 'Track'}
        subtitle={target?.item.artist}
        artworkUri={typeof target?.item.artworkUrl === 'string' ? target.item.artworkUrl : null}
      >
        {target && (
          <>
            <SheetRow
              label="Play now"
              icon={IconPlayerPlayFilled}
              onPress={() => {
                setTarget(null);
                jump(target.index);
              }}
            />
            {targetIsUpcoming && target.index > activeIndex + 1 && (
              <SheetRow
                label="Play next"
                icon={IconCornerDownRight}
                onPress={() => {
                  setTarget(null);
                  next(target.index, target.item.title);
                }}
              />
            )}
            {targetIsUpcoming && target.index > activeIndex + 1 && (
              <SheetRow
                label="Move up"
                icon={IconArrowUp}
                onPress={() => {
                  setTarget(null);
                  nudge(target.index, -1);
                }}
              />
            )}
            {targetIsUpcoming && target.index < queue.length - 1 && (
              <SheetRow
                label="Move down"
                icon={IconArrowDown}
                onPress={() => {
                  setTarget(null);
                  nudge(target.index, 1);
                }}
              />
            )}
            <SheetRow
              label="Add to playlist…"
              icon={IconPlaylistAdd}
              onPress={() => setAdding(targetExtras ? [targetExtras.subsonicId] : [])}
            />
            {targetExtras?.albumId && (
              <SheetRow
                label="Go to album"
                icon={IconAlbum}
                onPress={() => {
                  setTarget(null);
                  navigateToAlbum(targetExtras.albumId as string, targetExtras.albumTitle);
                }}
              />
            )}
            {targetExtras?.artistId && (
              <SheetRow
                label="Go to artist"
                icon={IconUser}
                onPress={() => {
                  setTarget(null);
                  navigateToArtist(targetExtras.artistId as string, target.item.artist);
                }}
              />
            )}
            {target.index !== activeIndex && (
              <SheetRow
                label="Remove from queue"
                icon={IconX}
                tone="destructive"
                last
                onPress={() => {
                  setTarget(null);
                  remove(target.index, target.item.title);
                }}
              />
            )}
          </>
        )}
      </Sheet>

      <AddToPlaylistSheet
        visible={adding != null}
        onClose={() => {
          setAdding(null);
          setTarget(null);
        }}
        songIds={adding ?? []}
        subject={target?.item.title}
        coverArt={targetExtras?.coverArt}
      />
    </View>
  );
}

/**
 * One queued track. Memoised: a queue is long, every row carries a pan
 * gesture, and without this each queue change re-rendered all of them.
 */
const QueueRow = memo(function QueueRow({
  item,
  index,
  dimmed,
  last,
  upcoming,
  onJump,
  onNext,
  onRemove,
  onMenu,
}: {
  item: MediaItem;
  index: number;
  dimmed: boolean;
  last: boolean;
  upcoming: boolean;
  onJump: (index: number) => void;
  onNext: (index: number, title?: string) => void;
  onRemove: (index: number, title?: string) => void;
  onMenu: (item: MediaItem, index: number) => void;
}) {
  const color = useTheme();
  const artworkUrl = useArtwork();
  const row = (
    <ListRow
      title={item.title ?? 'Unknown title'}
      subtitle={item.artist}
      // A thumbnail-sized request, not the player's 512px cover.
      artworkUri={artworkUrl(extrasOf(item)?.coverArt)}
      trailingText={item.duration ? formatDuration(item.duration) : undefined}
      dimmed={dimmed}
      last={last}
      onPress={() => onJump(index)}
      onLongPress={() => onMenu(item, index)}
      onMore={() => onMenu(item, index)}
    />
  );

  return (
    <SwipeableRow
      rightSwipe={
        upcoming
          ? {
              icon: <IconCornerDownRight size={20} color={color.accentInk} strokeWidth={2} />,
              label: 'Next',
              tone: 'accent',
              onAction: () => onNext(index, item.title),
            }
          : undefined
      }
      leftSwipe={{
        icon: <IconTrash size={20} color="#FFFFFF" strokeWidth={2} />,
        label: 'Remove',
        tone: 'danger',
        onAction: () => onRemove(index, item.title),
      }}
    >
      {row}
    </SwipeableRow>
  );
});

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.background },
    header: { paddingHorizontal: layout.screenPadding, paddingBottom: space[2] },
    grabber: {
      alignSelf: 'center',
      width: 38,
      height: 5,
      borderRadius: 3,
      backgroundColor: color.labelTertiary,
      marginTop: space[1],
      marginBottom: space[2],
      opacity: 0.6,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    headerText: { flex: 1, alignItems: 'center', gap: 2 },
    title: { ...type.title3, color: color.label },
    list: { flexGrow: 1 },
    nowCard: {
      marginHorizontal: layout.screenPadding,
      marginTop: space[2],
      marginBottom: space[2],
      padding: space[3],
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      borderRadius: radius.lg,
    },
    nowText: { flex: 1, gap: 2 },
    nowTitle: { ...type.headline, color: color.displayInk },
    nowArtist: { ...type.subhead, color: color.accent },
    section: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.screenPadding,
      paddingTop: space[5],
      paddingBottom: space[2],
      gap: space[3],
    },
    sectionDetail: { flexShrink: 1, textAlign: 'right' },
    pressed: { opacity: 0.6 },
  });
