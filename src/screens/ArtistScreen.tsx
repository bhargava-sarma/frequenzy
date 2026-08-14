import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Button, ButtonRow } from '../components/Button';
import { ListRow } from '../components/ListRow';
import { DOCK_CLEARANCE } from '../components/TabBar';
import { ScreenHeader } from '../components/ScreenHeader';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { useArtwork } from '../hooks/useArtwork';
import { useLibraryData } from '../hooks/useLibraryData';
import type { LibraryStackParamList } from '../navigation/types';
import { usePlayerStore } from '../store/usePlayerStore';
import { useServerStore } from '../store/useServerStore';
import { layout, space } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeProvider';
import type { Child } from '../types/subsonic';
import { formatDuration, pluralize } from '../utils/time';

/** An artist's albums. */
export function ArtistScreen() {
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParamList>>();
  const route = useRoute<RouteProp<LibraryStackParamList, 'Artist'>>();
  const insets = useSafeAreaInsets();
  const artworkUrl = useArtwork();

  const { artistId, artistName } = route.params;

  const { data, loading, error, refresh } = useLibraryData(
    (library, forceRefresh) => library.getArtist(artistId, { forceRefresh }),
    [artistId],
  );

  const albums = data?.albums ?? [];
  // Prefer the freshly loaded name, falling back to the one passed in so the
  // header isn't blank while loading.
  const title = data?.artist.name ?? artistName ?? 'Artist';

  const library = useServerStore((state) => state.library);
  const playNow = usePlayerStore((state) => state.playNow);
  const shufflePlay = usePlayerStore((state) => state.shufflePlay);
  const [gathering, setGathering] = useState(false);

  /**
   * Every track by this artist, in album order.
   *
   * The artist response carries albums but not their tracks, so this fetches
   * each album. It runs on press rather than on load: an artist with twenty
   * albums would otherwise fire twenty requests just to render a list of
   * album names. Reads go through the repository, so a second press and any
   * album already opened come from cache.
   */
  async function gatherSongs(): Promise<Child[]> {
    if (!library) return [];
    const details = await Promise.all(albums.map((album) => library.getAlbum(album.id)));
    return details.flatMap((detail) => detail.songs);
  }

  async function startPlayback(mode: 'ordered' | 'shuffled') {
    if (albums.length === 0 || gathering) return;
    setGathering(true);
    try {
      const songs = await gatherSongs();
      if (songs.length === 0) return;
      if (mode === 'shuffled') await shufflePlay(songs);
      else await playNow(songs);
    } finally {
      setGathering(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader title={title} onBack={() => navigation.goBack()} />

      <FlatList
        data={albums}
        keyExtractor={(album) => album.id}
        ListHeaderComponent={
          albums.length > 0 ? (
            <View>
              <View style={styles.actions}>
                <ButtonRow>
                  <Button
                    label="Play"
                    variant="primary"
                    busy={gathering}
                    onPress={() => void startPlayback('ordered')}
                  />
                  <Button
                    label="Shuffle"
                    busy={gathering}
                    onPress={() => void startPlayback('shuffled')}
                  />
                </ButtonRow>
              </View>
              <SectionHeader title="Albums" count={pluralize(albums.length, 'album')} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : (
            <EmptyState label="No albums" />
          )
        }
        contentContainerStyle={albums.length ? styles.listContent : styles.emptyContainer}
        renderItem={({ item, index }) => (
          <ListRow
            title={item.name}
            meta={[
              item.year ? String(item.year) : null,
              item.songCount != null ? pluralize(item.songCount, 'track') : null,
              item.duration ? formatDuration(item.duration) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            artworkUri={artworkUrl(item.coverArt)}
            last={index === albums.length - 1}
            onPress={() =>
              navigation.navigate('Album', { albumId: item.id, albumName: item.name })
            }
          />
        )}
      />
    </View>
  );
}

const makeStyles = (color: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  actions: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space[5],
    alignItems: 'center',
  },
  listContent: { paddingBottom: DOCK_CLEARANCE },
  emptyContainer: { flexGrow: 1, paddingBottom: DOCK_CLEARANCE },
});
