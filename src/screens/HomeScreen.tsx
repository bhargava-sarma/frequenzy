import { useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { ListRow } from '../components/ListRow';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { Shelf } from '../components/Shelf';
import { useArtwork } from '../hooks/useArtwork';
import { useLibraryData } from '../hooks/useLibraryData';
import type { HomeStackParamList } from '../navigation/types';
import { usePlayerStore } from '../store/usePlayerStore';
import { useServerStore } from '../store/useServerStore';
import { color, layout, space } from '../theme/tokens';
import type { AlbumSummary, Playlist } from '../types/subsonic';
import { formatDuration, pluralize } from '../utils/time';

/**
 * Home — playlists and album shelves.
 *
 * This used to list every album in the library as identical 40px rows, which
 * made the one screen you open most a 573-row wall of text. It now shows four
 * short shelves of artwork instead; the complete list lives under Library,
 * where an exhaustive index belongs.
 *
 * Playlists stay here rather than taking a fifth tab: the spec fixes the
 * bottom nav at four icon-only items, and adding one to satisfy a feature
 * would break the thing that makes the nav read as a panel.
 */

/** How many albums each shelf asks for. Enough to scroll, not enough to stall. */
const SHELF_SIZE = 20;

/**
 * Play-derived orderings reshuffle as you listen, so a day-long TTL would
 * show a "recently played" shelf that's a day out of date. Ten minutes keeps
 * it honest without refetching on every visit.
 */
const SHELF_TTL_MS = 10 * 60 * 1000;

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const insets = useSafeAreaInsets();
  const artworkUrl = useArtwork();
  const { width } = useWindowDimensions();

  const client = useServerStore((state) => state.client);
  const addToQueue = usePlayerStore((state) => state.addToQueue);

  // Two and a half tiles across, so the cut-off third is visibly a hint that
  // the shelf scrolls rather than looking like a short list that ended.
  const tileSize = Math.round((width - layout.screenPadding * 2 - space[3] * 2) / 2.4);

  const {
    data: shelves,
    loading,
    error,
    refresh,
  } = useLibraryData(
    (library, forceRefresh) =>
      Promise.all([
        library.getAlbumsByType('newest', SHELF_SIZE, { forceRefresh }),
        library.getAlbumsByType('recent', SHELF_SIZE, { forceRefresh, ttlMs: SHELF_TTL_MS }),
        library.getAlbumsByType('frequent', SHELF_SIZE, { forceRefresh, ttlMs: SHELF_TTL_MS }),
        library.getAlbumsByType('random', SHELF_SIZE, { forceRefresh }),
      ]).then(([newest, recent, frequent, random]) => ({
        newest,
        recent,
        frequent,
        random,
      })),
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
        // Non-fatal: the shelves below are still worth showing.
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const isEmpty = useMemo(
    () =>
      playlists.length === 0 &&
      (!shelves ||
        shelves.newest.length + shelves.recent.length + shelves.frequent.length === 0),
    [playlists, shelves],
  );

  function openAlbum(album: AlbumSummary) {
    navigation.navigate('Album', { albumId: album.id, albumName: album.name });
  }

  /**
   * The row itself opens the playlist; only the trailing action queues it.
   * Tapping a row and having it start playing gives you no way to look at what
   * is in a playlist before committing to it.
   */
  async function queuePlaylist(playlistId: string) {
    if (!client) return;
    const response = await client.getPlaylist(playlistId);
    const songs = response.playlist.entry ?? [];
    if (songs.length > 0) await addToQueue(songs);
  }

  if (loading && !shelves) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <LoadingState label="Loading library" />
      </View>
    );
  }

  if (error && !shelves) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading && shelves != null}
            onRefresh={refresh}
            tintColor={color.textSecondary}
          />
        }
      >
        {isEmpty && (
          <EmptyState
            label="Nothing here yet"
            hint="Check that Navidrome has scanned your library."
          />
        )}

        {playlists.length > 0 && (
          <>
            <SectionHeader title="Playlists" count={String(playlists.length)} />
            {playlists.map((playlist, index) => (
              <ListRow
                key={playlist.id}
                title={playlist.name}
                meta={[
                  playlist.songCount != null ? pluralize(playlist.songCount, 'track') : null,
                  playlist.duration ? formatDuration(playlist.duration) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                artworkUri={artworkUrl(playlist.coverArt)}
                action="queue"
                last={index === playlists.length - 1}
                onPress={() =>
                  navigation.navigate('Playlist', {
                    playlistId: playlist.id,
                    playlistName: playlist.name,
                  })
                }
                onActionPress={() => void queuePlaylist(playlist.id)}
              />
            ))}
          </>
        )}

        {shelves && (
          <>
            <Shelf
              title="Recently added"
              albums={shelves.newest}
              tileSize={tileSize}
              artworkUri={artworkUrl}
              onSelect={openAlbum}
            />
            {/* Both of these stay empty until enough has been scrobbled, and
                Shelf renders nothing rather than a labelled empty strip. */}
            <Shelf
              title="Recently played"
              albums={shelves.recent}
              tileSize={tileSize}
              artworkUri={artworkUrl}
              onSelect={openAlbum}
            />
            <Shelf
              title="Most played"
              albums={shelves.frequent}
              tileSize={tileSize}
              artworkUri={artworkUrl}
              onSelect={openAlbum}
            />
            {/* Rerolls on pull-to-refresh rather than on every render, so it
                works as a shelf you can return to rather than a slot machine. */}
            <Shelf
              title="From the shelf"
              albums={shelves.random}
              tileSize={tileSize}
              artworkUri={artworkUrl}
              onSelect={openAlbum}
            />
          </>
        )}

        {/* Development entry points, stripped from release builds. */}
        {__DEV__ && (
          <>
            <SectionHeader title="Developer" />
            <ListRow
              title="Diagnostics"
              showArtwork={false}
              onPress={() => navigation.getParent()?.navigate('Diagnostics')}
            />
            <ListRow
              title="Components"
              showArtwork={false}
              last
              onPress={() => navigation.getParent()?.navigate('Showcase')}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  content: { paddingBottom: space[6] },
});
