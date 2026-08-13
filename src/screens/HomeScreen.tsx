import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ListRow } from '../components/ListRow';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { useArtwork } from '../hooks/useArtwork';
import { useLibraryData } from '../hooks/useLibraryData';
import type { HomeStackParamList } from '../navigation/types';
import { usePlayerStore } from '../store/usePlayerStore';
import { useServerStore } from '../store/useServerStore';
import { color, space } from '../theme/tokens';
import type { AlbumSummary, Playlist } from '../types/subsonic';
import { formatDuration, pluralize } from '../utils/time';

type Row =
  | { kind: 'header'; key: string; title: string; count?: string }
  | { kind: 'playlist'; key: string; value: Playlist }
  | { kind: 'album'; key: string; value: AlbumSummary }
  /** Development-only entry points, stripped from release builds. */
  | { kind: 'dev'; key: string; title: string; target: 'Diagnostics' | 'Showcase' };

/**
 * Home — playlists and the album shelf.
 *
 * Playlists live here rather than taking a fifth tab: the spec fixes the
 * bottom nav at four icon-only items, and adding one to satisfy a feature
 * would break the thing that makes the nav read as a panel.
 */
export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const insets = useSafeAreaInsets();
  const artworkUrl = useArtwork();

  const client = useServerStore((state) => state.client);
  const playNow = usePlayerStore((state) => state.playNow);

  const { data: albums, loading, error, refresh } = useLibraryData(
    (library, forceRefresh) => library.getAllAlbums({ forceRefresh }),
    [],
  );

  // Playlists aren't cached — they change whenever you edit one, and a stale
  // playlist is more confusing than a slightly slower load.
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    client
      .getPlaylists()
      .then((response) => {
        if (!cancelled) setPlaylists(response.playlists.playlist ?? []);
      })
      .catch(() => {
        // Non-fatal: the album shelf below is still worth showing.
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];

    if (playlists.length > 0) {
      out.push({ kind: 'header', key: 'h-pl', title: 'Playlists', count: String(playlists.length) });
      playlists.forEach((playlist) =>
        out.push({ kind: 'playlist', key: `pl-${playlist.id}`, value: playlist }),
      );
    }

    if (albums && albums.length > 0) {
      out.push({
        kind: 'header',
        key: 'h-al',
        title: 'Albums',
        count: pluralize(albums.length, 'album'),
      });
      albums.forEach((album) => out.push({ kind: 'album', key: `al-${album.id}`, value: album }));
    }

    if (__DEV__) {
      out.push({ kind: 'header', key: 'h-dev', title: 'Developer' });
      out.push({ kind: 'dev', key: 'dev-diag', title: 'Diagnostics', target: 'Diagnostics' });
      out.push({ kind: 'dev', key: 'dev-show', title: 'Components', target: 'Showcase' });
    }

    return out;
  }, [playlists, albums]);

  async function playPlaylist(playlistId: string) {
    if (!client) return;
    const response = await client.getPlaylist(playlistId);
    const songs = response.playlist.entry ?? [];
    if (songs.length > 0) await playNow(songs);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={rows.length ? styles.listContent : styles.emptyContainer}
        ListEmptyComponent={
          loading ? (
            <LoadingState label="Loading library" />
          ) : error ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : (
            <EmptyState label="Nothing here yet" />
          )
        }
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return <SectionHeader title={item.title} count={item.count} />;
          }

          if (item.kind === 'dev') {
            return (
              <ListRow
                title={item.title}
                showArtwork={false}
                onPress={() => navigation.getParent()?.navigate(item.target)}
              />
            );
          }

          if (item.kind === 'playlist') {
            return (
              <ListRow
                title={item.value.name}
                meta={[
                  item.value.songCount != null
                    ? pluralize(item.value.songCount, 'track')
                    : null,
                  item.value.duration ? formatDuration(item.value.duration) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                artworkUri={artworkUrl(item.value.coverArt)}
                action="queue"
                onPress={() => void playPlaylist(item.value.id)}
                onActionPress={() => void playPlaylist(item.value.id)}
              />
            );
          }

          return (
            <ListRow
              title={item.value.name}
              meta={[item.value.artist, item.value.year ? String(item.value.year) : null]
                .filter(Boolean)
                .join(' · ')}
              artworkUri={artworkUrl(item.value.coverArt)}
              onPress={() =>
                navigation.navigate('Album', {
                  albumId: item.value.id,
                  albumName: item.value.name,
                })
              }
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  listContent: { paddingBottom: space[6] },
  emptyContainer: { flexGrow: 1 },
});
