import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useActiveMediaItem, useIsPlaying } from '@rntp/player';

import { stopCollectionDownload } from './DownloadControls';
import {
  IconAlbum,
  IconArrowsShuffle,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerPlayFilled,
  IconPlaylist,
  IconRefresh,
  IconTrash,
} from './icons';
import { Keycap, KeyRow } from './Keycap';
import { Label } from './Label';
import { Led } from './Led';
import { ListRow } from './ListRow';
import { Panel } from './Panel';
import { EmptyState } from './ScreenState';
import { SectionHeader } from './SectionHeader';
import { Sheet, SheetRow } from './Sheet';
import { DOCK_CLEARANCE } from './TabBar';
import { TrackActionsSheet } from './TrackActionsSheet';
import { TrackRow } from './TrackRow';
import { useArtwork } from '../hooks/useArtwork';
import { type LibraryStackParamList } from '../navigation/types';
import { collectionSongs, retryFailed, setPaused, sortSongs, totalsOf } from '../offline/downloads';
import { freeSpace } from '../offline/nativeFs';
import type { OfflineCollection } from '../offline/types';
import { extrasOf } from '../player/trackMapping';
import { useCollectionDownload, useDownloadProgress, useDownloadStore } from '../store/useDownloadStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { toast } from '../store/useToastStore';
import { layout, radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Child } from '../types/subsonic';
import { formatBytes, pluralize } from '../utils/time';

/**
 * Everything kept on the device: what's arriving, the albums and playlists
 * downloaded whole, and every downloaded track — all of it playable with no
 * connection at all.
 */

const SOURCE = { kind: 'downloads' as const, label: 'Downloads' };

export function DownloadsView({ filter }: { filter: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParamList>>();
  const tracks = useDownloadStore((state) => state.tracks);
  const collections = useDownloadStore((state) => state.collections);
  const hydrated = useDownloadStore((state) => state.hydrated);
  const unsupported = useDownloadStore((state) => state.unsupported);
  const playNow = usePlayerStore((state) => state.playNow);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const activeItem = useActiveMediaItem();
  const isPlaying = useIsPlaying();
  const activeId = extrasOf(activeItem)?.subsonicId;

  const [trackTarget, setTrackTarget] = useState<Child | null>(null);
  const [collectionTarget, setCollectionTarget] = useState<OfflineCollection | null>(null);

  const songs = useMemo(
    () =>
      sortSongs(
        Object.values(tracks)
          .filter((track) => track.state === 'done')
          .map((track) => track.song),
      ),
    [tracks],
  );
  const shown = useMemo(() => {
    if (!filter) return songs;
    return songs.filter(
      (song) =>
        song.title.toLowerCase().includes(filter) ||
        (song.artist ?? '').toLowerCase().includes(filter) ||
        (song.album ?? '').toLowerCase().includes(filter),
    );
  }, [songs, filter]);
  const shelf = useMemo(
    () =>
      Object.values(collections)
        .filter(
          (collection) =>
            !filter ||
            collection.name.toLowerCase().includes(filter) ||
            (collection.artist ?? '').toLowerCase().includes(filter),
        )
        .sort((a, b) => b.addedAt - a.addedAt),
    [collections, filter],
  );

  const handlePlay = useCallback((index: number) => toast.guard(playNow(shown, index, SOURCE)), [playNow, shown]);
  const handleQueue = useCallback(
    (song: Child) =>
      toast.guard(
        addToQueue([song]).then(() => toast.show('Added to queue', { icon: 'queue', detail: song.title })),
        "Couldn't queue",
      ),
    [addToQueue],
  );

  const openCollection = useCallback(
    (collection: OfflineCollection) => {
      if (collection.kind === 'album') {
        navigation.navigate('Album', { albumId: collection.id, albumName: collection.name });
      } else {
        navigation.navigate('Playlist', { playlistId: collection.id, playlistName: collection.name });
      }
    },
    [navigation],
  );

  function playCollection(collection: OfflineCollection, shuffled: boolean) {
    setCollectionTarget(null);
    const list = collectionSongs(collection.key) ?? [];
    if (list.length === 0) {
      toast.show('Nothing from this has downloaded yet', { icon: 'info' });
      return;
    }
    const source = { kind: collection.kind, label: collection.name };
    const player = usePlayerStore.getState();
    toast.guard(shuffled ? player.shufflePlay(list, source) : player.playNow(list, 0, source));
  }

  const header = (
    <View>
      <DownloadSummary songs={songs} />
      {shelf.length > 0 && (
        <SectionHeader title="Albums & playlists" detail={String(shelf.length)} compact />
      )}
      {shelf.map((collection, index) => (
        <CollectionRow
          key={collection.key}
          collection={collection}
          last={index === shelf.length - 1}
          onOpen={openCollection}
          onMore={setCollectionTarget}
        />
      ))}
      {shown.length > 0 && <SectionHeader title="Tracks" detail={String(shown.length)} />}
    </View>
  );

  const empty =
    !hydrated ? null : unsupported ? (
      <EmptyState label="Downloads unavailable" hint={unsupported} />
    ) : filter ? (
      <EmptyState label="No matches" hint="Nothing downloaded matched that." />
    ) : songs.length === 0 && shelf.length === 0 ? (
      <EmptyState
        label="Nothing downloaded yet"
        hint="Use the download key on an album or playlist, or Download in a track's menu. Downloads play with no connection."
      />
    ) : null;

  return (
    <>
      <FlatList
        data={shown}
        keyExtractor={(song) => song.id}
        // No getItemLayout: the header above the rows varies in height, and
        // offsets that ignored it would put the render window in the wrong place.
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        renderItem={({ item, index }) => (
          <TrackRow
            song={item}
            index={index}
            active={item.id === activeId}
            playing={isPlaying}
            last={index === shown.length - 1}
            subtitle="artistAlbum"
            onPlay={handlePlay}
            onMore={setTrackTarget}
            onQueue={handleQueue}
          />
        )}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={14}
        windowSize={9}
      />

      <TrackActionsSheet visible={trackTarget != null} onClose={() => setTrackTarget(null)} song={trackTarget} />

      <Sheet
        visible={collectionTarget != null}
        onClose={() => setCollectionTarget(null)}
        title={collectionTarget?.name}
        subtitle={collectionTarget ? kindLabel(collectionTarget) : undefined}
      >
        {collectionTarget && (
          <>
            <SheetRow label="Play" icon={IconPlayerPlayFilled} onPress={() => playCollection(collectionTarget, false)} />
            <SheetRow label="Shuffle" icon={IconArrowsShuffle} onPress={() => playCollection(collectionTarget, true)} />
            <SheetRow
              label={collectionTarget.kind === 'album' ? 'Open album' : 'Open playlist'}
              icon={collectionTarget.kind === 'album' ? IconAlbum : IconPlaylist}
              onPress={() => {
                const target = collectionTarget;
                setCollectionTarget(null);
                openCollection(target);
              }}
            />
            <SheetRow
              label="Remove download"
              icon={IconTrash}
              tone="destructive"
              last
              onPress={() => {
                const target = collectionTarget;
                setCollectionTarget(null);
                stopCollectionDownload({ kind: target.kind, id: target.id, name: target.name });
              }}
            />
          </>
        )}
      </Sheet>
    </>
  );
}

function kindLabel(collection: OfflineCollection): string {
  if (collection.kind === 'album') return ['Album', collection.artist].filter(Boolean).join(' · ');
  return collection.kind === 'liked' ? 'Liked songs' : 'Playlist';
}

const CollectionRow = memo(function CollectionRow({
  collection,
  last,
  onOpen,
  onMore,
}: {
  collection: OfflineCollection;
  last: boolean;
  onOpen: (collection: OfflineCollection) => void;
  onMore: (collection: OfflineCollection) => void;
}) {
  const artworkUrl = useArtwork();
  const { done, total, failed } = useCollectionDownload(collection.key);
  const complete = done >= total;
  return (
    <ListRow
      title={collection.name}
      subtitle={kindLabel(collection)}
      artworkUri={artworkUrl(collection.coverArt)}
      download={complete ? 'done' : failed > 0 && done + failed >= total ? 'failed' : 'queued'}
      trailingText={complete ? pluralize(total, 'TRK', 'TRK') : `${done}/${total}`}
      last={last}
      onPress={() => onOpen(collection)}
      onLongPress={() => onMore(collection)}
      onMore={() => onMore(collection)}
    />
  );
});

/** The head of the view: what's happening, how much is here, and the keys. */
function DownloadSummary({ songs }: { songs: Child[] }) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tracks = useDownloadStore((state) => state.tracks);
  const paused = useDownloadStore((state) => state.paused);
  const blocked = useDownloadStore((state) => state.blocked);
  const unsupported = useDownloadStore((state) => state.unsupported);
  const progress = useDownloadProgress();
  const playNow = usePlayerStore((state) => state.playNow);
  const shufflePlay = usePlayerStore((state) => state.shufflePlay);

  const totals = useMemo(() => totalsOf(tracks), [tracks]);
  const free = freeSpace();
  if (unsupported || (totals.done === 0 && totals.queued === 0 && totals.failed === 0)) return null;

  const waiting = totals.queued > 0;
  let state: string;
  let led = color.ledAmber;
  let busy = false;
  if (!waiting) {
    state = totals.failed > 0 ? `${pluralize(totals.failed, 'track')} couldn't download` : 'All downloaded';
    led = totals.failed > 0 ? color.ledRed : color.ledGreen;
  } else if (paused) {
    state = `Paused · ${totals.queued} waiting`;
  } else if (blocked === 'offline') {
    state = `Waiting for a connection · ${totals.queued} waiting`;
  } else if (blocked === 'homeOnly') {
    state = `Waiting for the home network · ${totals.queued} waiting`;
  } else if (blocked === 'storage') {
    state = `Storage full · ${totals.queued} waiting`;
    led = color.ledRed;
  } else {
    state = `Downloading · ${totals.queued} to go`;
    busy = true;
  }

  const current = progress.id ? tracks[progress.id]?.song : undefined;
  const fraction = progress.total > 0 ? Math.min(1, progress.bytes / progress.total) : 0;

  return (
    <Panel label="Offline" style={styles.panel}>
      <View style={styles.stateRow}>
        <Led color={led} size={9} busy={busy} />
        <Text style={styles.state} numberOfLines={2}>
          {state}
        </Text>
      </View>
      <Label tone="tertiary" style={styles.figures}>
        {[
          pluralize(totals.done, 'track'),
          formatBytes(totals.bytes),
          free != null ? `${formatBytes(free)} free` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Label>

      {current && (
        <View style={styles.current}>
          <View style={styles.currentText}>
            <Text style={styles.currentTitle} numberOfLines={1}>
              {current.title}
            </Text>
            <Label tone="secondary">
              {progress.total > 0
                ? `${formatBytes(progress.bytes)} of ${formatBytes(progress.total)}`
                : formatBytes(progress.bytes)}
            </Label>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(fraction * 100)}%` }]} />
          </View>
        </View>
      )}

      <KeyRow style={styles.keys}>
        <Keycap
          icon={IconPlayerPlayFilled}
          iconFilled
          label="Play"
          size="sm"
          variant="primary"
          flex
          disabled={songs.length === 0}
          onPress={() => toast.guard(playNow(songs, 0, SOURCE))}
        />
        <Keycap
          icon={IconArrowsShuffle}
          label="Shuffle"
          size="sm"
          flex
          disabled={songs.length === 0}
          onPress={() => toast.guard(shufflePlay(songs, SOURCE))}
        />
        {(waiting || paused) && (
          <Keycap
            icon={paused ? IconPlayerPlay : IconPlayerPause}
            size="sm"
            square
            active={paused}
            accessibilityLabel={paused ? 'Resume downloads' : 'Pause downloads'}
            onPress={() => setPaused(!paused)}
          />
        )}
        {totals.failed > 0 && (
          <Keycap
            icon={IconRefresh}
            size="sm"
            square
            accessibilityLabel={`Retry ${pluralize(totals.failed, 'failed download')}`}
            onPress={() => {
              retryFailed();
              toast.show('Retrying failed downloads', { icon: 'download' });
            }}
          />
        )}
      </KeyRow>
    </Panel>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: DOCK_CLEARANCE, flexGrow: 1 },
});

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    panel: { marginHorizontal: layout.screenPadding, marginTop: space[1], marginBottom: space[2] },
    stateRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    state: { ...type.headline, color: color.label, flex: 1 },
    figures: { marginTop: space[2] },
    current: { marginTop: space[4], gap: space[2] },
    currentText: { gap: 2 },
    currentTitle: { ...type.callout, color: color.label },
    track: { height: 4, borderRadius: radius.sm, backgroundColor: color.fill, overflow: 'hidden' },
    fill: { height: 4, backgroundColor: color.accent },
    keys: { marginTop: space[4] },
  });
