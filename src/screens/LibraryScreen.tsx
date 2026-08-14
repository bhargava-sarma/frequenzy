import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AlbumTile } from '../components/AlbumTile';
import { ListRow } from '../components/ListRow';
import { SectionHeader } from '../components/SectionHeader';
import { Segmented } from '../components/Segmented';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { useArtwork } from '../hooks/useArtwork';
import { useLibraryData } from '../hooks/useLibraryData';
import type { LibraryStackParamList } from '../navigation/types';
import { color, layout, space } from '../theme/tokens';
import { pluralize } from '../utils/time';

/**
 * The complete library, by artist or by album.
 *
 * The album mode is a grid rather than a list. Home shows a handful of albums
 * as shelves; this is where you come to find one you already have in mind, and
 * scanning a few hundred covers is far faster by artwork than by reading a few
 * hundred lines of text.
 */

type Mode = 'artists' | 'albums';

const MODES = [
  { value: 'artists' as const, label: 'Artists' },
  { value: 'albums' as const, label: 'Albums' },
];

const GRID_COLUMNS = 2;

export function LibraryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParamList>>();
  const insets = useSafeAreaInsets();
  const artworkUrl = useArtwork();
  const { width } = useWindowDimensions();

  const [mode, setMode] = useState<Mode>('artists');
  /**
   * Latches on the first visit to the album grid.
   *
   * getAllAlbums pages the entire library out of the server 500 at a time and
   * caches ~1.5 MB of JSON. Paying that on every launch for a tab you might
   * not open isn't worth it; paying it once, on the visit that needs it, is.
   */
  const [albumsRequested, setAlbumsRequested] = useState(false);

  const tileSize = Math.floor(
    (width - layout.screenPadding * 2 - space[3] * (GRID_COLUMNS - 1)) / GRID_COLUMNS,
  );

  const artists = useLibraryData(
    (library, forceRefresh) => library.getArtists({ forceRefresh }),
    [],
  );
  const albums = useLibraryData(
    (library, forceRefresh) =>
      albumsRequested ? library.getAllAlbums({ forceRefresh }) : Promise.resolve([]),
    [albumsRequested],
  );

  const active = mode === 'artists' ? artists : albums;

  const renderEmpty = useCallback(() => {
    if (active.loading) return <LoadingState label="Loading library" />;
    if (active.error) return <ErrorState message={active.error} onRetry={active.refresh} />;
    return (
      <EmptyState
        label={mode === 'artists' ? 'No artists' : 'No albums'}
        hint="Check that Navidrome has scanned your library."
      />
    );
  }, [active.loading, active.error, active.refresh, mode]);

  const header = (
    <>
      <SectionHeader
        title="Library"
        count={
          active.data
            ? pluralize(active.data.length, mode === 'artists' ? 'artist' : 'album')
            : undefined
        }
      />
      <View style={styles.switch}>
        <Segmented
          options={MODES}
          value={mode}
          onChange={(next) => {
            if (next === 'albums') setAlbumsRequested(true);
            setMode(next);
          }}
        />
      </View>
    </>
  );

  const refreshControl = (
    <RefreshControl
      refreshing={active.loading && active.data != null}
      onRefresh={active.refresh}
      tintColor={color.textSecondary}
    />
  );

  if (mode === 'albums') {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <FlatList
          data={albums.data ?? []}
          // Distinct keys per mode so switching starts a fresh list rather
          // than carrying a scroll offset from a list of a different shape.
          key="albums"
          numColumns={GRID_COLUMNS}
          keyExtractor={(album) => album.id}
          ListHeaderComponent={header}
          ListEmptyComponent={renderEmpty}
          columnWrapperStyle={styles.column}
          contentContainerStyle={
            albums.data?.length ? styles.gridContent : styles.emptyContainer
          }
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
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <FlatList
        data={artists.data ?? []}
        key="artists"
        keyExtractor={(artist) => artist.id}
        ListHeaderComponent={header}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={artists.data?.length ? styles.listContent : styles.emptyContainer}
        renderItem={({ item, index }) => (
          <ListRow
            title={item.name}
            meta={item.albumCount != null ? pluralize(item.albumCount, 'album') : undefined}
            artworkUri={artworkUrl(item.coverArt)}
            last={index === (artists.data?.length ?? 0) - 1}
            onPress={() =>
              navigation.navigate('Artist', { artistId: item.id, artistName: item.name })
            }
          />
        )}
        refreshControl={refreshControl}
        contentInsetAdjustmentBehavior="never"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  switch: { paddingHorizontal: layout.screenPadding, paddingBottom: space[4] },

  listContent: { paddingBottom: space[6] },
  gridContent: { paddingHorizontal: layout.screenPadding, paddingBottom: space[6] },
  column: { gap: space[3], marginBottom: space[5] },

  emptyContainer: { flexGrow: 1, paddingBottom: space[6] },
});
