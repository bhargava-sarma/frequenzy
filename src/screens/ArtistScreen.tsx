import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ListRow } from '../components/ListRow';
import { ScreenHeader } from '../components/ScreenHeader';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { useArtwork } from '../hooks/useArtwork';
import { useLibraryData } from '../hooks/useLibraryData';
import type { LibraryStackParamList } from '../navigation/types';
import { color, space } from '../theme/tokens';
import { formatDuration, pluralize } from '../utils/time';

/** An artist's albums. */
export function ArtistScreen() {
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

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader title={title} onBack={() => navigation.goBack()} />

      <FlatList
        data={albums}
        keyExtractor={(album) => album.id}
        ListHeaderComponent={
          albums.length > 0 ? (
            <SectionHeader title="Albums" count={pluralize(albums.length, 'album')} />
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
        contentContainerStyle={albums.length ? undefined : styles.emptyContainer}
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  emptyContainer: { flexGrow: 1, paddingBottom: space[6] },
});
