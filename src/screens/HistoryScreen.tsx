import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useActiveMediaItem, useIsPlaying } from '@rntp/player';

import { useCollapsingHeader, useNavBarHeight } from '../components/CollapsingHeader';
import { IconButton } from '../components/IconButton';
import { IconHistory, IconTrash } from '../components/icons';
import { Label } from '../components/Label';
import { ListRow } from '../components/ListRow';
import { DetailScaffold } from '../components/Scaffold';
import { EmptyState, LoadingState } from '../components/ScreenState';
import { Sheet, SheetRow } from '../components/Sheet';
import { DOCK_CLEARANCE } from '../components/TabBar';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { clearPlayHistory, getRecentPlays, onPlayHistoryChanged, type PlayEntry } from '../data/playHistory';
import { useArtwork } from '../hooks/useArtwork';
import type { AnyStackParamList } from '../navigation/types';
import { playOutline } from '../player/mixes';
import { extrasOf } from '../player/trackMapping';
import { toast } from '../store/useToastStore';
import { layout, space, type } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import type { Child } from '../types/subsonic';
import { formatClock, formatDayHeading, pluralize } from '../utils/time';

/**
 * What played, newest first, grouped by day — a log you can act on: tap a
 * line to hear it again, hold it for everything else.
 *
 * This device's own listening, written as each play scrobbles. Navidrome's
 * play counts are untouched by clearing it.
 */
const LIMIT = 500;

type Row =
  | { kind: 'day'; key: string; label: string; count: number }
  | { kind: 'play'; key: string; entry: PlayEntry; last: boolean };

const toSong = (entry: PlayEntry): Child => ({
  id: entry.songId,
  isDir: false,
  title: entry.title,
  artist: entry.artist,
  artistId: entry.artistId,
  album: entry.album,
  albumId: entry.albumId,
  coverArt: entry.coverArt,
  duration: entry.duration,
});

export function HistoryScreen() {
  const color = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<AnyStackParamList>>();
  const artworkUrl = useArtwork();
  const navHeight = useNavBarHeight();
  const { onScroll, progress } = useCollapsingHeader(30, 80);
  const activeItem = useActiveMediaItem();
  const isPlaying = useIsPlaying();
  const activeId = extrasOf(activeItem)?.subsonicId;

  const [entries, setEntries] = useState<PlayEntry[] | null>(null);
  const [target, setTarget] = useState<Child | null>(null);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(() => {
    void getRecentPlays(LIMIT).then(setEntries);
  }, []);

  useEffect(() => {
    load();
    return onPlayHistoryChanged(load);
  }, [load]);

  const rows = useMemo<Row[]>(() => {
    if (!entries) return [];
    const out: Row[] = [];
    let current = '';
    let header: Extract<Row, { kind: 'day' }> | null = null;
    entries.forEach((entry, index) => {
      const label = formatDayHeading(entry.playedAt);
      if (label !== current) {
        current = label;
        header = { kind: 'day', key: `day-${label}-${index}`, label, count: 0 };
        out.push(header);
      }
      if (header) header.count += 1;
      const next = entries[index + 1];
      out.push({
        kind: 'play',
        key: `${entry.songId}-${entry.playedAt}`,
        entry,
        last: !next || formatDayHeading(next.playedAt) !== label,
      });
    });
    return out;
  }, [entries]);

  // The log keeps an outline of each track; the rest is fetched as it plays,
  // so the player has a format to show and the queue a length to count.
  const play = useCallback((entry: PlayEntry) => toast.guard(playOutline(toSong(entry))), []);

  const header = (
    <View style={[styles.header, { paddingTop: navHeight + space[3] }]}>
      <Label tone="tertiary">{entries ? `${pluralize(entries.length, 'play').toUpperCase()} LOGGED` : 'LOG'}</Label>
      <Text style={[type.largeTitle, { color: color.label }]}>History</Text>
    </View>
  );

  return (
    <DetailScaffold
      title="History"
      progress={progress}
      onBack={() => navigation.goBack()}
      trailing={
        entries && entries.length > 0 ? (
          <IconButton icon={IconTrash} accessibilityLabel="Clear history" size={38} iconSize={19} onPress={() => setConfirm(true)} />
        ) : undefined
      }
    >
      <Animated.FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        onScroll={onScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={header}
        ListEmptyComponent={
          entries == null ? (
            <LoadingState />
          ) : (
            <EmptyState
              icon={IconHistory}
              label="Nothing played yet"
              hint="Tracks appear here once they've played past halfway, or four minutes."
            />
          )
        }
        renderItem={({ item }) =>
          item.kind === 'day' ? (
            <View style={styles.day}>
              <Label tone="secondary" bold>
                {item.label}
              </Label>
              <Label tone="tertiary">{pluralize(item.count, 'play').toUpperCase()}</Label>
            </View>
          ) : (
            <ListRow
              title={item.entry.title}
              subtitle={[item.entry.artist, item.entry.album].filter(Boolean).join(' · ')}
              artworkUri={artworkUrl(item.entry.coverArt)}
              active={item.entry.songId === activeId}
              playing={isPlaying}
              trailingText={formatClock(item.entry.playedAt)}
              last={item.last}
              onPress={() => play(item.entry)}
              onLongPress={() => setTarget(toSong(item.entry))}
              onMore={() => setTarget(toSong(item.entry))}
            />
          )
        }
        contentContainerStyle={styles.list}
        initialNumToRender={16}
        windowSize={9}
      />

      <TrackActionsSheet visible={target != null} onClose={() => setTarget(null)} song={target} />

      <Sheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Clear history?"
        subtitle="Charts and stats start over. Navidrome's play counts are not touched."
      >
        <SheetRow
          label="Clear history"
          icon={IconTrash}
          tone="destructive"
          onPress={() => {
            setConfirm(false);
            toast.guard(
              clearPlayHistory().then(() => toast.show('History cleared', { icon: 'check' })),
              "Couldn't clear history",
            );
          }}
        />
        <SheetRow label="Keep it" last onPress={() => setConfirm(false)} />
      </Sheet>
    </DetailScaffold>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: DOCK_CLEARANCE, flexGrow: 1 },
  header: { paddingHorizontal: layout.screenPadding, paddingBottom: space[2], gap: space[1] },
  day: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingTop: space[5],
    paddingBottom: space[2],
  },
});
