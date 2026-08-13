import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ListRow } from '../components/ListRow';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { useArtwork } from '../hooks/useArtwork';
import { useLibraryData } from '../hooks/useLibraryData';
import type { LibraryStackParamList } from '../navigation/types';
import { color, layout, space } from '../theme/tokens';
import { pluralize } from '../utils/time';

/** Artist index — the entry point into the library. */
export function LibraryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LibraryStackParamList>>();
  const insets = useSafeAreaInsets();
  const artworkUrl = useArtwork();

  const { data, loading, error, refresh } = useLibraryData(
    (library, forceRefresh) => library.getArtists({ forceRefresh }),
    [],
  );

  const renderEmpty = useCallback(() => {
    if (loading) return <LoadingState label="Loading library" />;
    if (error) return <ErrorState message={error} onRetry={refresh} />;
    return <EmptyState label="No artists" hint="Check that Navidrome has scanned your library." />;
  }, [loading, error, refresh]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <FlatList
        data={data ?? []}
        keyExtractor={(artist) => artist.id}
        ListHeaderComponent={
          <SectionHeader
            title="Library"
            count={data ? pluralize(data.length, 'artist') : undefined}
          />
        }
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={data?.length ? undefined : styles.emptyContainer}
        renderItem={({ item, index }) => (
          <ListRow
            title={item.name}
            meta={item.albumCount != null ? pluralize(item.albumCount, 'album') : undefined}
            artworkUri={artworkUrl(item.coverArt)}
            last={index === (data?.length ?? 0) - 1}
            onPress={() =>
              navigation.navigate('Artist', { artistId: item.id, artistName: item.name })
            }
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={loading && data != null}
            onRefresh={refresh}
            tintColor={color.textSecondary}
          />
        }
        // The artist list runs to hundreds of rows; a fixed height lets
        // FlatList skip measurement and scroll without stutter.
        getItemLayout={(_, index) => ({
          length: layout.rowHeight,
          offset: layout.rowHeight * index,
          index,
        })}
        contentInsetAdjustmentBehavior="never"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  emptyContainer: { flexGrow: 1, paddingBottom: space[6] },
});
