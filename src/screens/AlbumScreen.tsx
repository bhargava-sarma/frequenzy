import { useCallback, useMemo, useState } from 'react';
import { Animated, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AlbumActionsSheet } from '../components/AlbumActionsSheet';
import { useCollapsingHeader, useNavBarHeight } from '../components/CollapsingHeader';
import { DetailHero, HeroBackdrop } from '../components/DetailHero';
import { CollectionDownloadKey, CollectionDownloadStatus } from '../components/DownloadControls';
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
import { FilterField } from '../components/SearchField';
import { Shelf } from '../components/Shelf';
import { DOCK_CLEARANCE } from '../components/TabBar';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import { HEAVY_LIST_PROPS } from '../hooks/usePagedList';
import { useArtwork } from '../hooks/useArtwork';
import { useLibraryData } from '../hooks/useLibraryData';
import { usePullRefresh } from '../hooks/usePullRefresh';
import type { AlbumDetail } from '../data/libraryRepository';
import type { AnyStackParamList } from '../navigation/types';
import { downloadedAlbum, knownOffline } from '../offline/downloads';
import { formatPlate } from '../player/trackMapping';
import { useFavoritesStore, useStarred } from '../store/useFavoritesStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { toast } from '../store/useToastStore';
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
  const navHeight = useNavBarHeight();
  const { scrollY, onScroll, progress } = useCollapsingHeader();

  const playNow = usePlayerStore((state) => state.playNow);
  const shufflePlay = usePlayerStore((state) => state.shufflePlay);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const setStarred = useFavoritesStore((state) => state.setStarred);

  /**
   * Out of reach of the server, an album that is downloaded — whole or in
   * part — still opens, built from what is on the device. Known to be
   * offline, that copy is used straight away rather than after a probe of
   * every address. Marked offline so its partial track list is never
   * mistaken for the album's real one.
   */
  const { data, loading, error, refresh } = useLibraryData(
    (library, forceRefresh): Promise<AlbumDetail & { offline?: boolean }> => {
      const fromDevice = (): (AlbumDetail & { offline: true }) | null => {
        const saved = downloadedAlbum(albumId);
        if (!saved) return null;
        const first = saved.songs[0];
        return {
          offline: true,
          album: {
            id: albumId,
            name: saved.collection?.name ?? first.album ?? albumName ?? 'Album',
            artist: saved.collection?.artist ?? first.artist,
            artistId: first.artistId,
            coverArt: saved.collection?.coverArt ?? first.coverArt,
            year: saved.collection?.year ?? first.year,
            songCount: saved.songs.length,
          },
          songs: saved.songs,
        };
      };
      if (!forceRefresh && knownOffline()) {
        const saved = fromDevice();
        if (saved) return Promise.resolve(saved);
      }
      return library.getAlbum(albumId, { forceRefresh }).catch((cause: unknown) => {
        const saved = fromDevice();
        if (!saved) throw cause;
        return saved;
      });
    },
    [albumId],
  );
  // Albums are served from a day-long cache; pulling is how a retagged or
  // re-added one is fetched again without clearing everything in Settings.
  const pull = usePullRefresh(loading, refresh);
  const album = data?.album;
  const songs = useMemo(() => data?.songs ?? [], [data]);
  const starred = useStarred(albumId, Boolean(album?.starred));
  const offline = data?.offline === true;

  const downloadInput = useMemo(
    () =>
      album
        ? {
            kind: 'album' as const,
            id: albumId,
            name: album.name,
            artist: album.artist,
            year: album.year,
            coverArt: album.coverArt,
          }
        : null,
    [album, albumId],
  );
  // Not synced from here: this page can be drawn from a day-old cache, and
  // a stale track list would undo newer changes to the download. The
  // background sync reads albums fresh from the server instead.

  const artistId = album?.artistId;
  const more = useLibraryData(
    (library) => (artistId ? library.getArtist(artistId).then((detail) => detail.albums) : Promise.resolve([])),
    [artistId],
  );
  const moreAlbums = useMemo(
    () => (more.data ?? []).filter((other) => other.id !== albumId),
    [more.data, albumId],
  );

  /** The filter as typed, a beat after typing pauses (see FilterField). */
  const [filter, setFilter] = useState('');
  const onFilter = useCallback((value: string) => setFilter(value.trim().toLowerCase()), []);
  const deferredFilter = filter;
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

  const albumTitle = album?.name;
  const source = useMemo(
    () => (albumTitle ? { kind: 'album' as const, label: albumTitle } : undefined),
    [albumTitle],
  );

  const handlePlay = useCallback(
    (index: number) => toast.guard(playNow(visible, index, source)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playNow, visible, album?.name],
  );
  const handleQueue = useCallback(
    (song: Child) =>
      toast.guard(
        addToQueue([song]).then(() => toast.show('Added to queue', { icon: 'queue', detail: song.title })),
        "Couldn't queue",
      ),
    [addToQueue],
  );

  const total = songs.reduce((sum, song) => sum + (song.duration ?? 0), 0);
  const plate = songs[0] ? formatPlate(songs[0].suffix, songs[0].bitDepth, songs[0].samplingRate) : null;
  const genre = album?.genres?.[0]?.name ?? album?.genre;
  const title = album?.name ?? albumName ?? 'Album';
  const tileSize = Math.round((width - layout.screenPadding * 2 - space[3] * 2) / 2.35);

  // Built once per change to what it shows: the list re-renders its header
  // whenever it is handed a new one.
  const hero = useMemo(() => (
    <View>
      <DetailHero
        artworkUri={artworkUrl(album?.coverArt, 600)}
        eyebrow={[album?.isCompilation ? 'Compilation' : 'Album', album?.year, offline ? 'Offline' : null]
          .filter(Boolean)
          .join(' · ')}
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
            <View>
              <KeyRow>
                <Keycap
                  icon={IconPlayerPlayFilled}
                  iconFilled
                  label="Play"
                  variant="primary"
                  flex
                  onPress={() => toast.guard(playNow(songs, 0, source))}
                />
                <Keycap
                  icon={IconArrowsShuffle}
                  label="Shuffle"
                  flex
                  onPress={() => toast.guard(shufflePlay(songs, source))}
                />
                <Keycap
                  icon={IconListDetails}
                  square
                  accessibilityLabel="Add album to queue"
                  onPress={() =>
                    toast.guard(
                      addToQueue(songs).then(() =>
                        toast.show('Added to queue', {
                          icon: 'queue',
                          detail: `${title} · ${pluralize(songs.length, 'track')}`,
                        }),
                      ),
                      "Couldn't queue",
                    )
                  }
                />
                {!offline && <CollectionDownloadKey input={downloadInput} songs={songs} />}
              </KeyRow>
              <CollectionDownloadStatus input={downloadInput} />
            </View>
          ) : undefined
        }
      />
      {songs.length > MIN_ROWS_FOR_FILTER && (
        <View style={styles.filter}>
          <FilterField onChange={onFilter} placeholder="Find in album" resetKey={albumId} />
        </View>
      )}
    </View>
  ), [
    artworkUrl,
    album,
    offline,
    title,
    songs,
    total,
    plate,
    genre,
    navigation,
    playNow,
    shufflePlay,
    addToQueue,
    source,
    downloadInput,
    onFilter,
    albumId,
  ]);

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
            popOn={starred}
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
        {...HEAVY_LIST_PROPS}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl {...pull} progressViewOffset={navHeight} />}
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
