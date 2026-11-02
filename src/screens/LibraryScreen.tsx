import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
  useWindowDimensions,
  type ListRenderItem,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AlbumActionsSheet } from '../components/AlbumActionsSheet';
import { AlbumTile } from '../components/AlbumTile';
import { AlphabetRail, indexLetter } from '../components/AlphabetRail';
import { Chip, ChipRow } from '../components/Chip';
import { IconButton } from '../components/IconButton';
import {
  IconAlbum,
  IconArrowsShuffle,
  IconCategory,
  IconLayoutGrid,
  IconLayoutList,
  IconPencil,
  IconPlayerPlayFilled,
  IconPlaylist,
  IconPlus,
  IconTrash,
  IconUser,
} from '../components/icons';
import { ListRow } from '../components/ListRow';
import { PromptSheet } from '../components/PromptSheet';
import { TabScaffold } from '../components/Scaffold';
import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { SearchField } from '../components/SearchField';
import { Sheet, SheetRow } from '../components/Sheet';
import { DOCK_CLEARANCE } from '../components/TabBar';
import { useArtwork } from '../hooks/useArtwork';
import { useLibraryData } from '../hooks/useLibraryData';
import { trackItemLayout } from '../hooks/usePagedList';
import { LIKED_PLAYLIST_ID, type LibraryStackParamList } from '../navigation/types';
import { EmptyMixError, playLiked } from '../player/mixes';
import { usePlayerStore, shuffleList } from '../store/usePlayerStore';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { useServerStore } from '../store/useServerStore';
import {
  useSettingsStore,
  type AlbumSort,
  type LibraryMode,
} from '../store/useSettingsStore';
import { errorMessage, toast } from '../store/useToastStore';
import { layout, space } from '../theme/tokens';
import type { AlbumSummary, ArtistSummary, Genre, Playlist } from '../types/subsonic';
import { haptics } from '../utils/haptics';
import { formatLength, pluralize } from '../utils/time';

/**
 * The whole collection — playlists, albums, artists, genres.
 *
 * Albums are a grid by default: this is where you come to find one you
 * already have in mind, and scanning covers is far faster than reading
 * names. Every list filters as you type, albums sort any way the server's
 * fields allow, and artists carry an A–Z strip for the long scroll.
 *
 * Each mode loads on first visit, not at launch: the full album list is
 * paged out of the server 500 at a time and is worth paying for only when
 * someone actually opens it.
 */

const MODES: { value: LibraryMode; label: string; icon: typeof IconAlbum }[] = [
  { value: 'playlists', label: 'Playlists', icon: IconPlaylist },
  { value: 'albums', label: 'Albums', icon: IconAlbum },
  { value: 'artists', label: 'Artists', icon: IconUser },
  { value: 'genres', label: 'Genres', icon: IconCategory },
];

const SORTS: { value: AlbumSort; label: string }[] = [
  { value: 'name', label: 'A–Z' },
  { value: 'artist', label: 'Artist' },
  { value: 'year', label: 'Year' },
  { value: 'newest', label: 'Added' },
  { value: 'recent', label: 'Played' },
  { value: 'frequent', label: 'Most played' },
  { value: 'random', label: 'Random' },
];

const collate = (a?: string, b?: string) =>
  (a ?? '').localeCompare(b ?? '', undefined, { sensitivity: 'base', numeric: true });

const time = (iso?: string) => (iso ? Date.parse(iso) || 0 : 0);

function sortAlbums(albums: AlbumSummary[], sort: AlbumSort, seed: number): AlbumSummary[] {
  const copy = [...albums];
  switch (sort) {
    case 'artist':
      return copy.sort(
        (a, b) => collate(a.artist, b.artist) || (a.year ?? 0) - (b.year ?? 0) || collate(a.name, b.name),
      );
    case 'year':
      return copy.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || collate(a.name, b.name));
    case 'newest':
      return copy.sort((a, b) => time(b.created) - time(a.created));
    case 'recent':
      return copy.sort((a, b) => time(b.played) - time(a.played));
    case 'frequent':
      return copy.sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0) || collate(a.name, b.name));
    case 'random':
      // Seeded by a counter the reroll key bumps, so re-renders don't reshuffle.
      return seed >= 0 ? shuffleList(copy) : copy;
    default:
      return copy.sort((a, b) => collate(a.name, b.name));
  }
}

export function LibraryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParamList>>();
  const artworkUrl = useArtwork();
  const { width } = useWindowDimensions();

  const mode = useSettingsStore((state) => state.libraryMode);
  const sort = useSettingsStore((state) => state.albumSort);
  const view = useSettingsStore((state) => state.albumView);
  const update = useSettingsStore((state) => state.update);

  const [filter, setFilter] = useState('');
  const deferredFilter = useDeferredValue(filter.trim().toLowerCase());
  const [seed, setSeed] = useState(0);
  const [albumTarget, setAlbumTarget] = useState<AlbumSummary | null>(null);
  const [playlistTarget, setPlaylistTarget] = useState<Playlist | null>(null);
  const [prompt, setPrompt] = useState<'create' | 'rename' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Playlist | null>(null);

  /** Latches per mode on first visit. */
  const [requested, setRequested] = useState<Record<LibraryMode, boolean>>({
    playlists: mode === 'playlists',
    albums: mode === 'albums',
    artists: mode === 'artists',
    genres: mode === 'genres',
  });

  const albums = useLibraryData(
    (library, forceRefresh) => (requested.albums ? library.getAllAlbums({ forceRefresh }) : Promise.resolve([])),
    [requested.albums],
  );
  const artists = useLibraryData(
    (library, forceRefresh) => (requested.artists ? library.getArtists({ forceRefresh }) : Promise.resolve([])),
    [requested.artists],
  );
  const genres = useLibraryData(
    (library, forceRefresh) => (requested.genres ? library.getGenres({ forceRefresh }) : Promise.resolve([])),
    [requested.genres],
  );

  const playlists = usePlaylistStore((state) => state.playlists);
  const playlistError = usePlaylistStore((state) => state.error);
  const playlistsLoading = usePlaylistStore((state) => state.loading);
  const loadPlaylists = usePlaylistStore((state) => state.load);
  const createPlaylist = usePlaylistStore((state) => state.create);
  const renamePlaylist = usePlaylistStore((state) => state.rename);
  const removePlaylist = usePlaylistStore((state) => state.remove);
  const client = useServerStore((state) => state.client);
  const playNow = usePlayerStore((state) => state.playNow);
  const shufflePlay = usePlayerStore((state) => state.shufflePlay);

  useEffect(() => {
    if (requested.playlists) void loadPlaylists();
  }, [requested.playlists, loadPlaylists]);

  function switchMode(next: LibraryMode) {
    setRequested((current) => ({ ...current, [next]: true }));
    setFilter('');
    update({ libraryMode: next });
  }

  // --- Derived lists --------------------------------------------------------

  const shownAlbums = useMemo(() => {
    const sorted = sortAlbums(albums.data ?? [], sort, sort === 'random' ? seed : -1);
    if (!deferredFilter) return sorted;
    return sorted.filter(
      (album) =>
        album.name.toLowerCase().includes(deferredFilter) ||
        (album.artist ?? '').toLowerCase().includes(deferredFilter) ||
        String(album.year ?? '').includes(deferredFilter),
    );
  }, [albums.data, sort, seed, deferredFilter]);

  const shownArtists = useMemo(() => {
    const list = artists.data ?? [];
    if (!deferredFilter) return list;
    return list.filter((artist) => artist.name.toLowerCase().includes(deferredFilter));
  }, [artists.data, deferredFilter]);

  const shownGenres = useMemo(() => {
    const list = genres.data ?? [];
    if (!deferredFilter) return list;
    return list.filter((genre) => genre.value.toLowerCase().includes(deferredFilter));
  }, [genres.data, deferredFilter]);

  const shownPlaylists = useMemo(() => {
    if (!deferredFilter) return playlists;
    return playlists.filter((playlist) => playlist.name.toLowerCase().includes(deferredFilter));
  }, [playlists, deferredFilter]);

  // --- Actions ----------------------------------------------------------------

  const openAlbum = useCallback(
    (album: AlbumSummary) => navigation.navigate('Album', { albumId: album.id, albumName: album.name }),
    [navigation],
  );
  const openArtist = useCallback(
    (artist: ArtistSummary) => navigation.navigate('Artist', { artistId: artist.id, artistName: artist.name }),
    [navigation],
  );
  const openPlaylist = useCallback(
    (playlist: Playlist) =>
      navigation.navigate('Playlist', { playlistId: playlist.id, playlistName: playlist.name }),
    [navigation],
  );

  async function playPlaylist(playlist: Playlist, shuffled: boolean) {
    setPlaylistTarget(null);
    try {
      if (playlist.id === LIKED_PLAYLIST_ID) {
        await playLiked(shuffled);
        return;
      }
      if (!client) return;
      const songs = (await client.getPlaylist(playlist.id)).playlist.entry ?? [];
      if (songs.length === 0) {
        toast.show('This playlist is empty', { icon: 'info' });
        return;
      }
      const source = { kind: 'playlist' as const, label: playlist.name };
      if (shuffled) await shufflePlay(songs, source);
      else await playNow(songs, 0, source);
    } catch (error) {
      if (error instanceof EmptyMixError) toast.show(error.message, { icon: 'info' });
      else toast.error("Couldn't play playlist", { detail: errorMessage(error) });
    }
  }

  // --- A–Z rail ---------------------------------------------------------------

  const listRef = useRef<FlatList<ArtistSummary>>(null);
  const letterIndex = useMemo(() => {
    const map = new Map<string, number>();
    shownArtists.forEach((artist, index) => {
      const letter = indexLetter(artist.name);
      if (!map.has(letter)) map.set(letter, index);
    });
    return map;
  }, [shownArtists]);
  const letters = useMemo(() => [...letterIndex.keys()], [letterIndex]);
  const jumpTo = useCallback(
    (letter: string) => {
      const index = letterIndex.get(letter);
      if (index != null) listRef.current?.scrollToIndex({ index, animated: false });
    },
    [letterIndex],
  );

  // --- Render -----------------------------------------------------------------

  const gridColumns = 2;
  const tile = Math.floor((width - layout.screenPadding * 2 - space[3] * (gridColumns - 1)) / gridColumns);

  const total =
    mode === 'albums'
      ? (albums.data?.length ?? 0)
      : mode === 'artists'
        ? (artists.data?.length ?? 0)
        : mode === 'genres'
          ? (genres.data?.length ?? 0)
          : playlists.length;
  const unit = mode === 'albums' ? 'album' : mode === 'artists' ? 'artist' : mode === 'genres' ? 'genre' : 'playlist';

  const status =
    mode === 'albums' ? albums : mode === 'artists' ? artists : mode === 'genres' ? genres : null;
  const loading = status ? status.loading && !status.data?.length : playlistsLoading && playlists.length === 0;
  const error = status ? status.error : playlistError;
  const refresh = status ? status.refresh : () => void loadPlaylists();

  const emptyComponent = loading ? (
    <LoadingState label="Loading library" />
  ) : error ? (
    <ErrorState message={error} onRetry={refresh} />
  ) : (
    <EmptyState
      label={deferredFilter ? 'No matches' : 'Nothing here'}
      hint={deferredFilter ? `Nothing matched “${filter.trim()}”.` : 'Check that Navidrome has scanned your library.'}
    />
  );

  const header = (
    <View>
      <ScreenHeader
        eyebrow={total > 0 ? `${pluralize(total, unit).toUpperCase()}` : 'COLLECTION'}
        title="Library"
        trailing={
          mode === 'playlists' ? (
            <IconButton icon={IconPlus} accessibilityLabel="New playlist" variant="surface" onPress={() => setPrompt('create')} />
          ) : mode === 'albums' ? (
            <IconButton
              icon={view === 'grid' ? IconLayoutList : IconLayoutGrid}
              accessibilityLabel={view === 'grid' ? 'Show as list' : 'Show as grid'}
              variant="surface"
              onPress={() => update({ albumView: view === 'grid' ? 'list' : 'grid' })}
            />
          ) : undefined
        }
      />
      <ChipRow style={styles.modes}>
        {MODES.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            icon={option.icon}
            selected={mode === option.value}
            onPress={() => switchMode(option.value)}
          />
        ))}
      </ChipRow>
      <SearchField
        value={filter}
        onChangeText={setFilter}
        placeholder={`Filter ${unit}s`}
      />
      {mode === 'albums' && (
        <ChipRow style={styles.sorts}>
          {SORTS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={sort === option.value}
              onPress={() => {
                if (option.value === 'random' && sort === 'random') setSeed((n) => n + 1);
                update({ albumSort: option.value });
              }}
            />
          ))}
        </ChipRow>
      )}
    </View>
  );

  const refreshControl = <RefreshControl refreshing={false} onRefresh={refresh} />;

  let body: React.ReactNode;
  if (mode === 'albums' && view === 'grid') {
    body = (
      <FlatList
        key="albums-grid"
        data={shownAlbums}
        numColumns={gridColumns}
        keyExtractor={(album) => album.id}
        columnWrapperStyle={styles.gridRow}
        renderItem={({ item }) => (
          <AlbumTile
            title={item.name}
            subtitle={item.artist}
            artworkUri={artworkUrl(item.coverArt, 300)}
            size={tile}
            year={item.year}
            onPress={() => openAlbum(item)}
            onLongPress={() => setAlbumTarget(item)}
          />
        )}
        ListEmptyComponent={emptyComponent}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        refreshControl={refreshControl}
      />
    );
  } else if (mode === 'albums') {
    body = (
      <FlatList
        key="albums-list"
        data={shownAlbums}
        keyExtractor={(album) => album.id}
        getItemLayout={trackItemLayout}
        renderItem={({ item, index }) => (
          <ListRow
            title={item.name}
            subtitle={[item.artist, item.year].filter(Boolean).join(' · ')}
            artworkUri={artworkUrl(item.coverArt)}
            trailingText={item.songCount != null ? `${item.songCount} TRK` : undefined}
            last={index === shownAlbums.length - 1}
            onPress={() => openAlbum(item)}
            onLongPress={() => setAlbumTarget(item)}
            onMore={() => setAlbumTarget(item)}
          />
        )}
        ListEmptyComponent={emptyComponent}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={14}
        windowSize={9}
        removeClippedSubviews
        refreshControl={refreshControl}
      />
    );
  } else if (mode === 'artists') {
    const renderArtist: ListRenderItem<ArtistSummary> = ({ item, index }) => (
      <ListRow
        title={item.name}
        subtitle={item.albumCount ? pluralize(item.albumCount, 'album') : undefined}
        artworkUri={artworkUrl(item.coverArt)}
        round
        starred={Boolean(item.starred)}
        last={index === shownArtists.length - 1}
        onPress={() => openArtist(item)}
      />
    );
    body = (
      <View style={styles.fill}>
        <FlatList
          ref={listRef}
          key="artists"
          data={shownArtists}
          keyExtractor={(artist) => artist.id}
          getItemLayout={trackItemLayout}
          renderItem={renderArtist}
          ListEmptyComponent={emptyComponent}
          contentContainerStyle={[styles.list, styles.railGutter]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={14}
          windowSize={9}
          removeClippedSubviews
          refreshControl={refreshControl}
          onScrollToIndexFailed={() => {}}
        />
        {!deferredFilter && <AlphabetRail letters={letters} onSelect={jumpTo} top={space[2]} bottom={DOCK_CLEARANCE - 24} />}
      </View>
    );
  } else if (mode === 'genres') {
    body = (
      <FlatList
        key="genres"
        data={shownGenres}
        keyExtractor={(genre) => genre.value}
        getItemLayout={trackItemLayout}
        renderItem={({ item, index }: { item: Genre; index: number }) => (
          <ListRow
            title={item.value}
            subtitle={[
              item.albumCount ? pluralize(item.albumCount, 'album') : null,
              item.songCount != null ? pluralize(item.songCount, 'track') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            leading="index"
            index={index + 1}
            last={index === shownGenres.length - 1}
            onPress={() => navigation.navigate('Genre', { genre: item.value })}
          />
        )}
        ListEmptyComponent={emptyComponent}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={refreshControl}
      />
    );
  } else {
    body = (
      <FlatList
        key="playlists"
        data={shownPlaylists}
        keyExtractor={(playlist) => playlist.id}
        getItemLayout={trackItemLayout}
        renderItem={({ item, index }) => {
          const liked = item.id === LIKED_PLAYLIST_ID;
          return (
            <ListRow
              title={item.name}
              subtitle={[
                item.songCount != null ? pluralize(item.songCount, 'track') : null,
                item.duration ? formatLength(item.duration) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              artworkUri={artworkUrl(item.coverArt)}
              starred={liked}
              last={index === shownPlaylists.length - 1}
              onPress={() => openPlaylist(item)}
              onLongPress={() => setPlaylistTarget(item)}
              onMore={() => setPlaylistTarget(item)}
            />
          );
        }}
        ListEmptyComponent={emptyComponent}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={refreshControl}
      />
    );
  }

  const editable = playlistTarget != null && playlistTarget.id !== LIKED_PLAYLIST_ID;

  return (
    <TabScaffold>
      {header}
      {/* Keyed on mode and view, so switching crossfades instead of cutting. */}
      <Animated.View key={`${mode}:${view}`} style={styles.fill} entering={FadeIn.duration(180)}>
        {body}
      </Animated.View>

      <AlbumActionsSheet visible={albumTarget != null} onClose={() => setAlbumTarget(null)} album={albumTarget} />

      <Sheet
        visible={playlistTarget != null && prompt == null && confirmDelete == null}
        onClose={() => setPlaylistTarget(null)}
        title={playlistTarget?.name}
        subtitle={playlistTarget?.songCount != null ? pluralize(playlistTarget.songCount, 'track') : undefined}
        artworkUri={artworkUrl(playlistTarget?.coverArt, 120) ?? null}
      >
        {playlistTarget && (
          <>
            <SheetRow label="Play" icon={IconPlayerPlayFilled} onPress={() => void playPlaylist(playlistTarget, false)} />
            <SheetRow label="Shuffle" icon={IconArrowsShuffle} onPress={() => void playPlaylist(playlistTarget, true)} last={!editable} />
            {editable && <SheetRow label="Rename" icon={IconPencil} onPress={() => setPrompt('rename')} />}
            {editable && (
              <SheetRow
                label="Delete playlist"
                icon={IconTrash}
                tone="destructive"
                last
                onPress={() => setConfirmDelete(playlistTarget)}
              />
            )}
          </>
        )}
      </Sheet>

      <Sheet
        visible={confirmDelete != null}
        onClose={() => {
          setConfirmDelete(null);
          setPlaylistTarget(null);
        }}
        title={`Delete ${confirmDelete?.name ?? 'playlist'}?`}
        subtitle="This removes it from Navidrome for every client."
      >
        <SheetRow
          label="Delete"
          icon={IconTrash}
          tone="destructive"
          onPress={() => {
            const target = confirmDelete;
            setConfirmDelete(null);
            setPlaylistTarget(null);
            if (!target) return;
            void removePlaylist(target.id)
              .then(() => {
                haptics.success();
                toast.show(`Deleted ${target.name}`, { icon: 'playlist' });
              })
              .catch((e) => toast.error("Couldn't delete", { detail: errorMessage(e) }));
          }}
        />
        <SheetRow
          label="Keep it"
          last
          onPress={() => {
            setConfirmDelete(null);
            setPlaylistTarget(null);
          }}
        />
      </Sheet>

      <PromptSheet
        visible={prompt != null}
        onClose={() => {
          setPrompt(null);
          setPlaylistTarget(null);
        }}
        title={prompt === 'rename' ? 'Rename playlist' : 'New playlist'}
        placeholder="Playlist name"
        initialValue={prompt === 'rename' ? (playlistTarget?.name ?? '') : ''}
        confirmLabel={prompt === 'rename' ? 'Save' : 'Create'}
        onConfirm={async (name) => {
          try {
            if (prompt === 'rename' && playlistTarget) {
              await renamePlaylist(playlistTarget.id, name);
              toast.show('Renamed', { icon: 'playlist', detail: name });
            } else {
              const created = await createPlaylist(name);
              haptics.success();
              toast.success(`Created ${name}`, { icon: 'playlist' });
              if (created) openPlaylist(created);
            }
          } catch (error) {
            toast.error('Something went wrong', { detail: errorMessage(error) });
            throw error;
          }
        }}
      />
    </TabScaffold>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  modes: { marginBottom: space[3] },
  sorts: { marginBottom: space[2] },
  list: { paddingBottom: DOCK_CLEARANCE, flexGrow: 1 },
  railGutter: { paddingRight: 18 },
  gridRow: { gap: space[3], paddingHorizontal: layout.screenPadding, marginBottom: space[4] },
});
