import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AlbumTile } from '../components/AlbumTile';
import { Button } from '../components/Button';
import { ListRow } from '../components/ListRow';
import { ScreenHeader } from '../components/ScreenHeader';
import { Segmented } from '../components/Segmented';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { DOCK_CLEARANCE } from '../components/TabBar';
import { useArtwork } from '../hooks/useArtwork';
import { useLibraryData } from '../hooks/useLibraryData';
import { LIKED_PLAYLIST_ID, type LibraryStackParamList } from '../navigation/types';
import { useServerStore } from '../store/useServerStore';
import { layout, space } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Playlist } from '../types/subsonic';
import { formatDuration, pluralize } from '../utils/time';

/**
 * The complete library — by artist, by album, or by playlist.
 *
 * Albums are a grid rather than a list: this is where you come to find one you
 * already have in mind, and scanning a few hundred covers is far faster by
 * artwork than by reading a few hundred lines of text.
 *
 * Rows are revealed a page at a time. The data still arrives in one request —
 * Subsonic has no cursor for the artist index, and the album list is paged
 * into the cache already — but mounting 573 rows is what actually costs, and
 * there is no reason to build rows nobody has scrolled to.
 */

type Mode = 'artists' | 'albums' | 'playlists';

const MODES = [
  { value: 'artists' as const, label: 'Artists' },
  { value: 'albums' as const, label: 'Albums' },
  { value: 'playlists' as const, label: 'Lists' },
];

const GRID_COLUMNS = 2;

/** Shown immediately. */
const FIRST_PAGE = 10;
/** Added by each press of Load more. */
const PAGE_SIZE = 50;

export function LibraryScreen() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParamList>>();
  const insets = useSafeAreaInsets();
  const artworkUrl = useArtwork();
  const { width } = useWindowDimensions();

  const client = useServerStore((state) => state.client);
  const [mode, setMode] = useState<Mode>('artists');
  const [visible, setVisible] = useState(FIRST_PAGE);

  /**
   * Latches per mode on first visit.
   *
   * getAllAlbums pages the entire library out of the server 500 at a time and
   * caches ~1.5 MB of JSON. Paying that on every launch for a mode you might
   * not open isn't worth it; paying it once, on the visit that needs it, is.
   */
  const [requested, setRequested] = useState<Record<Mode, boolean>>({
    artists: true,
    albums: false,
    playlists: false,
  });

  const tileSize = Math.floor(
    (width - layout.screenPadding * 2 - space[3] * (GRID_COLUMNS - 1)) / GRID_COLUMNS,
  );

  const artists = useLibraryData(
    (library, forceRefresh) => library.getArtists({ forceRefresh }),
    [],
  );
  const albums = useLibraryData(
    (library, forceRefresh) =>
      requested.albums ? library.getAllAlbums({ forceRefresh }) : Promise.resolve([]),
    [requested.albums],
  );

  // Playlists bypass the repository: they change whenever you edit one, and a
  // stale playlist is more confusing than a slightly slower load.
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [playlistError, setPlaylistError] = useState<string | null>(null);

  const loadPlaylists = useCallback(() => {
    if (!client) return;
    void client
      .getPlaylists()
      .then((response) => {
        // Favourites are not a playlist on the server — Navidrome keeps them
        // behind getStarred2 — so they're prepended here rather than being
        // absent from the one screen you'd look for them on.
        const liked: Playlist = { id: LIKED_PLAYLIST_ID, name: 'Liked songs' };
        setPlaylists([liked, ...(response.playlists.playlist ?? [])]);
        setPlaylistError(null);
      })
      .catch((cause: unknown) => {
        setPlaylistError(cause instanceof Error ? cause.message : String(cause));
      });
  }, [client]);

  useEffect(() => {
    if (requested.playlists) loadPlaylists();
  }, [requested.playlists, loadPlaylists]);

  function switchMode(next: Mode) {
    setRequested((current) => ({ ...current, [next]: true }));
    setVisible(FIRST_PAGE);
    setMode(next);
  }

  const total =
    mode === 'artists'
      ? (artists.data?.length ?? 0)
      : mode === 'albums'
        ? (albums.data?.length ?? 0)
        : (playlists?.length ?? 0);

  const loading =
    mode === 'artists'
      ? artists.loading
      : mode === 'albums'
        ? albums.loading
        : playlists == null && playlistError == null;

  const error =
    mode === 'artists' ? artists.error : mode === 'albums' ? albums.error : playlistError;

  const refresh =
    mode === 'artists' ? artists.refresh : mode === 'albums' ? albums.refresh : loadPlaylists;

  const shownArtists = useMemo(
    () => (artists.data ?? []).slice(0, visible),
    [artists.data, visible],
  );
  const shownAlbums = useMemo(() => (albums.data ?? []).slice(0, visible), [albums.data, visible]);
  const shownPlaylists = useMemo(() => (playlists ?? []).slice(0, visible), [playlists, visible]);

  const header = (
    <View style={styles.switch}>
      <Segmented options={MODES} value={mode} onChange={switchMode} />
    </View>
  );

  const footer =
    visible < total ? (
      <View style={styles.loadMore}>
        <Button
          label={`Load ${Math.min(PAGE_SIZE, total - visible)} more`}
          fullWidth
          onPress={() => setVisible((count) => count + PAGE_SIZE)}
        />
      </View>
    ) : (
      <View style={styles.listEnd} />
    );

  const renderEmpty = useCallback(() => {
    if (loading) return <LoadingState label="Loading library" />;
    if (error) return <ErrorState message={error} onRetry={refresh} />;
    return (
      <EmptyState label="Nothing here" hint="Check that Navidrome has scanned your library." />
    );
  }, [loading, error, refresh]);

  const refreshControl = (
    <RefreshControl
      refreshing={loading && total > 0}
      onRefresh={refresh}
      tintColor={color.textSecondary}
    />
  );

  const shell = (children: React.ReactNode) => (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader title="Library" />
      {children}
    </View>
  );

  if (mode === 'albums') {
    return shell(
      <FlatList
        data={shownAlbums}
        // Distinct keys per mode so switching starts a fresh list rather than
        // carrying a scroll offset from a list of a different shape.
        key="albums"
        numColumns={GRID_COLUMNS}
        keyExtractor={(album) => album.id}
        ListHeaderComponent={header}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={footer}
        columnWrapperStyle={styles.column}
        contentContainerStyle={shownAlbums.length ? styles.gridContent : styles.emptyContainer}
        renderItem={({ item }) => (
          <AlbumTile
            title={item.name}
            subtitle={item.artist}
            artworkUri={artworkUrl(item.coverArt, 400)}
            size={tileSize}
            onPress={() =>
              navigation.navigate('Album', { albumId: item.id, albumName: item.name })
            }
          />
        )}
        refreshControl={refreshControl}
      />,
    );
  }

  if (mode === 'playlists') {
    return shell(
      <FlatList
        data={shownPlaylists}
        key="playlists"
        keyExtractor={(playlist) => playlist.id}
        ListHeaderComponent={header}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={footer}
        contentContainerStyle={shownPlaylists.length ? styles.listContent : styles.emptyContainer}
        renderItem={({ item, index }) => (
          <ListRow
            title={item.name}
            meta={[
              item.songCount != null ? pluralize(item.songCount, 'track') : null,
              item.duration ? formatDuration(item.duration) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            artworkUri={artworkUrl(item.coverArt)}
            last={index === shownPlaylists.length - 1}
            onPress={() =>
              navigation.navigate('Playlist', {
                playlistId: item.id,
                playlistName: item.name,
              })
            }
          />
        )}
        refreshControl={refreshControl}
      />,
    );
  }

  return shell(
    <FlatList
      data={shownArtists}
      key="artists"
      keyExtractor={(artist) => artist.id}
      ListHeaderComponent={header}
      ListEmptyComponent={renderEmpty}
      ListFooterComponent={footer}
      contentContainerStyle={shownArtists.length ? styles.listContent : styles.emptyContainer}
      renderItem={({ item, index }) => (
        <ListRow
          title={item.name}
          meta={item.albumCount != null ? pluralize(item.albumCount, 'album') : undefined}
          artworkUri={artworkUrl(item.coverArt)}
          last={index === shownArtists.length - 1}
          onPress={() =>
            navigation.navigate('Artist', { artistId: item.id, artistName: item.name })
          }
        />
      )}
      refreshControl={refreshControl}
      contentInsetAdjustmentBehavior="never"
    />,
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.paper },
    switch: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: space[4],
      paddingBottom: space[4],
    },

    listContent: {},
    gridContent: { paddingHorizontal: layout.screenPadding },
    column: { gap: space[3], marginBottom: space[5] },

    loadMore: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: space[5],
      paddingBottom: DOCK_CLEARANCE,
    },
    listEnd: { height: DOCK_CLEARANCE },

    emptyContainer: { flexGrow: 1, paddingBottom: DOCK_CLEARANCE },
  });
