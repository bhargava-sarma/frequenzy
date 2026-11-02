import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useActiveMediaItem, useIsPlaying } from '@rntp/player';

import { AlbumActionsSheet } from '../components/AlbumActionsSheet';
import { useCollapsingHeader } from '../components/CollapsingHeader';
import { DetailHero, HeroBackdrop } from '../components/DetailHero';
import { IconButton } from '../components/IconButton';
import {
  IconArrowsShuffle,
  IconDots,
  IconHeart,
  IconHeartFilled,
  IconListDetails,
  IconPlayerPlayFilled,
} from '../components/icons';
import { Keycap, KeyRow } from '../components/Keycap';
import { Label } from '../components/Label';
import { DetailScaffold } from '../components/Scaffold';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { SearchField } from '../components/SearchField';
import { Shelf } from '../components/Shelf';
import { DOCK_CLEARANCE } from '../components/TabBar';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import { useArtwork } from '../hooks/useArtwork';
import { useLibraryData } from '../hooks/useLibraryData';
import type { AnyStackParamList } from '../navigation/types';
import { formatPlate, extrasOf } from '../player/trackMapping';
import { useFavoritesStore, useStarred } from '../store/useFavoritesStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { errorMessage, toast } from '../store/useToastStore';
import { layout, space } from '../theme/tokens';
import type { AlbumSummary, Child } from '../types/subsonic';
import { formatLength, pluralize } from '../utils/time';

/** Below this, a filter field costs more space than the scrolling it saves. */
const MIN_ROWS_FOR_FILTER = 14;

type Row = { kind: 'disc'; key: string; disc: number } | { kind: 'track'; key: string; song: Child; index: number };

export function AlbumScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AnyStackParamList>>();
  const route = useRoute<RouteProp<AnyStackParamList, 'Album'>>();
  const { albumId, albumName } = route.params;
  const artworkUrl = useArtwork();
  const { width } = useWindowDimensions();
  const { scrollY, onScroll, progress } = useCollapsingHeader();

  const playNow = usePlayerStore((state) => state.playNow);
  const shufflePlay = usePlayerStore((state) => state.shufflePlay);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const setStarred = useFavoritesStore((state) => state.setStarred);
  const activeItem = useActiveMediaItem();
  const isPlaying = useIsPlaying();
  const activeId = extrasOf(activeItem)?.subsonicId;

  const { data, loading, error, refresh } = useLibraryData(
    (library, forceRefresh) => library.getAlbum(albumId, { forceRefresh }),
    [albumId],
  );
  const album = data?.album;
  const songs = useMemo(() => data?.songs ?? [], [data]);
  const starred = useStarred(albumId, Boolean(album?.starred));

  const artistId = album?.artistId;
  const more = useLibraryData(
    (library) => (artistId ? library.getArtist(artistId).then((detail) => detail.albums) : Promise.resolve([])),
    [artistId],
  );
  const moreAlbums = useMemo(
    () => (more.data ?? []).filter((other) => other.id !== albumId),
    [more.data, albumId],
  );

  const [filter, setFilter] = useState('');
  const deferredFilter = useDeferredValue(filter.trim().toLowerCase());
  const [trackTarget, setTrackTarget] = useState<Child | null>(null);
  const [albumTarget, setAlbumTarget] = useState<AlbumSummary | null>(null);

  const visible = useMemo(() => {
    if (!deferredFilter) return songs;
    return songs.filter(
      (song) =>
        song.title.toLowerCase().includes(deferredFilter) ||
        (song.artist ?? '').toLowerCase().includes(deferredFilter),
    );
  }, [songs, deferredFilter]);

  // Disc headings only when the album actually has more than one disc.
  const multiDisc = useMemo(() => new Set(songs.map((s) => s.discNumber ?? 1)).size > 1, [songs]);
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let disc = -1;
    visible.forEach((song, index) => {
      const d = song.discNumber ?? 1;
      if (multiDisc && d !== disc) {
        disc = d;
        out.push({ kind: 'disc', key: `disc-${d}`, disc: d });
      }
      out.push({ kind: 'track', key: `${song.id}-${index}`, song, index });
    });
    return out;
  }, [visible, multiDisc]);

  const source = album ? { kind: 'album' as const, label: album.name } : undefined;

  const handlePlay = useCallback(
    (index: number) =>
      void playNow(visible, index, source).catch((e) => toast.error("Couldn't play", { detail: errorMessage(e) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playNow, visible, album?.name],
  );
  const handleQueue = useCallback(
    (song: Child) =>
      void addToQueue([song])
        .then(() => toast.show('Added to queue', { icon: 'queue', detail: song.title }))
        .catch((e) => toast.error("Couldn't queue", { detail: errorMessage(e) })),
    [addToQueue],
  );

  const total = songs.reduce((sum, song) => sum + (song.duration ?? 0), 0);
  const plate = songs[0] ? formatPlate(songs[0].suffix, songs[0].bitDepth, songs[0].samplingRate) : null;
  const genre = album?.genres?.[0]?.name ?? album?.genre;
  const title = album?.name ?? albumName ?? 'Album';
  const tileSize = Math.round((width - layout.screenPadding * 2 - space[3] * 2) / 2.35);

  const hero = (
    <View>
      <DetailHero
        artworkUri={artworkUrl(album?.coverArt, 600)}
        eyebrow={[album?.isCompilation ? 'Compilation' : 'Album', album?.year].filter(Boolean).join(' · ')}
        title={title}
        subtitle={album?.artist}
        onSubtitlePress={
          album?.artistId
            ? () => navigation.navigate('Artist', { artistId: album.artistId as string, artistName: album.artist })
            : undefined
        }
        meta={
          songs.length > 0
            ? [pluralize(songs.length, 'track'), formatLength(total), plate, genre].filter(Boolean).join('  ·  ')
            : undefined
        }
        actions={
          songs.length > 0 ? (
            <KeyRow>
              <Keycap
                icon={IconPlayerPlayFilled}
                iconFilled
                label="Play"
                variant="primary"
                flex
                onPress={() => void playNow(songs, 0, source)}
              />
              <Keycap icon={IconArrowsShuffle} label="Shuffle" flex onPress={() => void shufflePlay(songs, source)} />
              <Keycap
                icon={IconListDetails}
                square
                accessibilityLabel="Add album to queue"
                onPress={() =>
                  void addToQueue(songs).then(() =>
                    toast.show('Added to queue', { icon: 'queue', detail: `${title} · ${pluralize(songs.length, 'track')}` }),
                  )
                }
              />
            </KeyRow>
          ) : undefined
        }
      />
      {songs.length > MIN_ROWS_FOR_FILTER && (
        <View style={styles.filter}>
          <SearchField value={filter} onChangeText={setFilter} placeholder="Find in album" />
        </View>
      )}
    </View>
  );

  const footer =
    moreAlbums.length > 0 ? (
      <Shelf
        title={`More by ${album?.artist ?? 'this artist'}`}
        albums={moreAlbums}
        tileSize={tileSize}
        artworkUri={artworkUrl}
        showYear
        onSelect={(other) => navigation.push('Album', { albumId: other.id, albumName: other.name })}
        onLongPress={setAlbumTarget}
      />
    ) : null;

  return (
    <DetailScaffold
      title={title}
      progress={progress}
      onBack={() => navigation.goBack()}
      backdrop={<HeroBackdrop uri={artworkUrl(album?.coverArt, 200)} scrollY={scrollY} />}
      trailing={
        <>
          <IconButton
            icon={starred ? IconHeartFilled : IconHeart}
            accessibilityLabel={starred ? 'Unlike album' : 'Like album'}
            active={starred}
            size={38}
            iconSize={19}
            onPress={() => void setStarred({ id: albumId, kind: 'album', title }, !starred)}
          />
          <IconButton
            icon={IconDots}
            accessibilityLabel="Album options"
            size={38}
            iconSize={20}
            disabled={!album}
            onPress={() => album && setAlbumTarget(album)}
          />
        </>
      }
    >
      <Animated.FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        onScroll={onScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={hero}
        ListFooterComponent={footer}
        ListEmptyComponent={
          loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : (
            <EmptyState label={deferredFilter ? 'No matches' : 'No tracks'} />
          )
        }
        renderItem={({ item }) =>
          item.kind === 'disc' ? (
            <View style={styles.disc}>
              <Label tone="tertiary" bold>{`Disc ${item.disc}`}</Label>
            </View>
          ) : (
            <TrackRow
              song={item.song}
              index={item.index}
              active={item.song.id === activeId}
              playing={isPlaying}
              last={item.index === visible.length - 1}
              leading="index"
              // The album's own artist on every row is noise; only a guest
              // or a compilation's artist is worth a second line.
              subtitle={item.song.artist && item.song.artist !== album?.artist ? 'artist' : 'none'}
              onPlay={handlePlay}
              onMore={setTrackTarget}
              onQueue={handleQueue}
            />
          )
        }
        contentContainerStyle={styles.list}
        initialNumToRender={16}
        windowSize={11}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />

      <TrackActionsSheet
        visible={trackTarget != null}
        onClose={() => setTrackTarget(null)}
        song={trackTarget}
        hide={['album']}
      />
      <AlbumActionsSheet visible={albumTarget != null} onClose={() => setAlbumTarget(null)} album={albumTarget} />
    </DetailScaffold>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: DOCK_CLEARANCE, flexGrow: 1 },
  filter: { marginTop: space[2] },
  disc: { paddingHorizontal: layout.screenPadding, paddingTop: space[5], paddingBottom: space[2] },
});
