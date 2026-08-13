import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ListRow } from '../components/ListRow';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { useArtwork } from '../hooks/useArtwork';
import type { SearchStackParamList } from '../navigation/types';
import { usePlayerStore } from '../store/usePlayerStore';
import { useServerStore } from '../store/useServerStore';
import { color, hairline, layout, radius, space, type } from '../theme/tokens';
import type { AlbumSummary, ArtistSummary, Child } from '../types/subsonic';
import { formatDuration } from '../utils/time';

/** Rows are heterogeneous, so each carries its own kind. */
type ResultRow =
  | { kind: 'header'; key: string; title: string; count: string }
  | { kind: 'artist'; key: string; value: ArtistSummary }
  | { kind: 'album'; key: string; value: AlbumSummary }
  | { kind: 'song'; key: string; value: Child };

/**
 * Search across artists, albums and tracks.
 *
 * Goes straight to the server rather than through the library cache: search
 * results are a query, not a cacheable entity, and Navidrome already indexes
 * this far better than filtering a cached list in JS would.
 */
export function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SearchStackParamList>>();
  const insets = useSafeAreaInsets();
  const artworkUrl = useArtwork();

  const client = useServerStore((state) => state.client);
  const playNow = usePlayerStore((state) => state.playNow);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{
    artists: ArtistSummary[];
    albums: AlbumSummary[];
    songs: Child[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (!client || trimmed.length === 0) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }

    // Debounced: firing per keystroke would send a request for every prefix
    // of the query and race their responses out of order.
    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(() => {
      client
        .search3(trimmed, { artistCount: 10, albumCount: 20, songCount: 40 })
        .then((response) => {
          if (cancelled) return;
          setResults({
            artists: response.searchResult3.artist ?? [],
            albums: response.searchResult3.album ?? [],
            songs: response.searchResult3.song ?? [],
          });
          setError(null);
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, client]);

  // Flattened into one list so the whole result set scrolls as a unit rather
  // than as three independently scrolling sections.
  const rows = useMemo<ResultRow[]>(() => {
    if (!results) return [];
    const out: ResultRow[] = [];

    if (results.artists.length > 0) {
      out.push({
        kind: 'header',
        key: 'h-artists',
        title: 'Artists',
        count: String(results.artists.length),
      });
      results.artists.forEach((artist) =>
        out.push({ kind: 'artist', key: `ar-${artist.id}`, value: artist }),
      );
    }
    if (results.albums.length > 0) {
      out.push({
        kind: 'header',
        key: 'h-albums',
        title: 'Albums',
        count: String(results.albums.length),
      });
      results.albums.forEach((album) =>
        out.push({ kind: 'album', key: `al-${album.id}`, value: album }),
      );
    }
    if (results.songs.length > 0) {
      out.push({
        kind: 'header',
        key: 'h-songs',
        title: 'Tracks',
        count: String(results.songs.length),
      });
      results.songs.forEach((song) =>
        out.push({ kind: 'song', key: `so-${song.id}`, value: song }),
      );
    }
    return out;
  }, [results]);

  const isEmpty = results != null && rows.length === 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top + space[3] }]}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search artists, albums, tracks"
          placeholderTextColor={color.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={rows.length ? styles.listContent : styles.emptyContainer}
        ListEmptyComponent={
          error ? (
            <ErrorState message={error} />
          ) : loading ? (
            <LoadingState label="Searching" />
          ) : isEmpty ? (
            <EmptyState label="No results" hint={`Nothing matched "${query.trim()}".`} />
          ) : (
            <EmptyState label="Search your library" />
          )
        }
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return <SectionHeader title={item.title} count={item.count} />;
          }

          if (item.kind === 'artist') {
            return (
              <ListRow
                title={item.value.name}
                artworkUri={artworkUrl(item.value.coverArt)}
                onPress={() =>
                  navigation.navigate('Artist', {
                    artistId: item.value.id,
                    artistName: item.value.name,
                  })
                }
              />
            );
          }

          if (item.kind === 'album') {
            return (
              <ListRow
                title={item.value.name}
                meta={item.value.artist}
                artworkUri={artworkUrl(item.value.coverArt)}
                onPress={() =>
                  navigation.navigate('Album', {
                    albumId: item.value.id,
                    albumName: item.value.name,
                  })
                }
              />
            );
          }

          return (
            <ListRow
              title={item.value.title}
              meta={[item.value.artist, item.value.duration ? formatDuration(item.value.duration) : null]
                .filter(Boolean)
                .join(' · ')}
              artworkUri={artworkUrl(item.value.coverArt)}
              action="queue"
              onPress={() => void playNow([item.value])}
              onActionPress={() => void playNow([item.value])}
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  searchBar: { paddingHorizontal: layout.screenPadding, paddingBottom: space[3] },
  input: {
    ...type.body,
    color: color.textPrimary,
    height: 44,
    paddingHorizontal: space[3],
    borderWidth: hairline,
    borderColor: color.paperLine,
    borderRadius: radius.sm,
  },
  listContent: { paddingBottom: space[6] },
  emptyContainer: { flexGrow: 1 },
});
