import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useActiveMediaItem } from '@rntp/player';

import { ArtworkWell } from '../components/ArtworkWell';
import { Button, ButtonRow } from '../components/Button';
import { IconHeart, IconHeartFilled, IconPlus } from '../components/icons';
import { ListRow } from '../components/ListRow';
import { ScreenHeader } from '../components/ScreenHeader';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { SwipeableRow } from '../components/SwipeableRow';
import { extrasOf } from '../player/trackMapping';
import { useArtwork } from '../hooks/useArtwork';
import type { HomeStackParamList } from '../navigation/types';
import { usePlayerStore } from '../store/usePlayerStore';
import { useServerStore } from '../store/useServerStore';
import { color, icon, layout, space, type } from '../theme/tokens';
import type { Child, Playlist } from '../types/subsonic';
import { formatDuration, pluralize } from '../utils/time';

/**
 * Playlist detail — the same shape as the album screen.
 *
 * Playlists are read straight from the server rather than through the library
 * cache: they change whenever you edit one, and there are few enough that the
 * round trip is cheaper than the confusion of a stale track list.
 */
export function PlaylistScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<HomeStackParamList, 'Playlist'>>();
  const insets = useSafeAreaInsets();
  const artworkUrl = useArtwork();

  const { playlistId, playlistName } = route.params;

  const client = useServerStore((state) => state.client);
  const playNow = usePlayerStore((state) => state.playNow);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const activeItem = useActiveMediaItem();
  const activeId = extrasOf(activeItem)?.subsonicId;

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped to re-run the fetch; a plain function would need the effect to
  // depend on itself to pick up a retry.
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;

    setLoading(true);
    client
      .getPlaylist(playlistId)
      .then((response) => {
        if (cancelled) return;
        setPlaylist(response.playlist);
        setSongs(response.playlist.entry ?? []);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, playlistId, reloadToken]);

  const title = playlist?.name ?? playlistName ?? 'Playlist';
  const totalDuration =
    playlist?.duration ?? songs.reduce((sum, song) => sum + (song.duration ?? 0), 0);

  async function toggleStar(songId: string, starred: boolean) {
    if (!client) return;
    if (starred) await client.unstar({ id: songId });
    else await client.star({ id: songId });
    // The server owns favourites, so re-read rather than patching local state.
    refresh();
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader title={title} onBack={() => navigation.goBack()} />

      <FlatList
        data={songs}
        keyExtractor={(song, index) => `${song.id}-${index}`}
        ListHeaderComponent={
          playlist ? (
            <View>
              <View style={styles.hero}>
                <ArtworkWell
                  uri={artworkUrl(playlist.coverArt, 600)}
                  size={180}
                  surface="paper"
                />
                <Text style={styles.playlistTitle} numberOfLines={2}>
                  {playlist.name}
                </Text>
                {playlist.comment ? (
                  <Text style={styles.playlistMeta} numberOfLines={2}>
                    {playlist.comment}
                  </Text>
                ) : null}

                <View style={styles.actions}>
                  <ButtonRow>
                    <Button
                      label="Play"
                      variant="primary"
                      onPress={() => void playNow(songs)}
                    />
                    <Button label="Add to queue" onPress={() => void addToQueue(songs)} />
                  </ButtonRow>
                </View>
              </View>

              <SectionHeader
                title="Tracks"
                count={`${pluralize(songs.length, 'track')} · ${formatDuration(totalDuration)}`}
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : (
            <EmptyState label="Empty playlist" hint="Add tracks to it in Navidrome." />
          )
        }
        contentContainerStyle={songs.length ? styles.listContent : styles.emptyContainer}
        renderItem={({ item, index }) => (
          <SwipeableRow
            rightSwipe={{
              icon: <IconPlus size={icon.size} color={color.accentInk} strokeWidth={2} />,
              label: 'Queue',
              onAction: () => void addToQueue([item]),
            }}
            leftSwipe={{
              icon: item.starred ? (
                <IconHeartFilled size={icon.size} color={color.accentInk} />
              ) : (
                <IconHeart size={icon.size} color={color.accentInk} strokeWidth={2} />
              ),
              label: item.starred ? 'Unstar' : 'Star',
              onAction: () => void toggleStar(item.id, Boolean(item.starred)),
            }}
          >
            <ListRow
              title={item.title}
              meta={[item.artist, item.duration ? formatDuration(item.duration) : null]
                .filter(Boolean)
                .join(' · ')}
              artworkUri={artworkUrl(item.coverArt)}
              action="favorite"
              favorited={Boolean(item.starred)}
              active={item.id === activeId}
              last={index === songs.length - 1}
              // Starting mid-playlist queues the rest of it from that point.
              onPress={() => void playNow(songs, index)}
              onActionPress={() => void toggleStar(item.id, Boolean(item.starred))}
            />
          </SwipeableRow>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  listContent: { paddingBottom: space[6] },
  emptyContainer: { flexGrow: 1 },

  hero: { alignItems: 'center', paddingTop: space[5], paddingHorizontal: layout.screenPadding },
  playlistTitle: {
    ...type.display,
    color: color.textPrimary,
    marginTop: space[4],
    textAlign: 'center',
  },
  playlistMeta: {
    ...type.meta,
    color: color.textSecondary,
    marginTop: space[1],
    textAlign: 'center',
  },
  actions: { marginTop: space[5], alignSelf: 'stretch', alignItems: 'center' },
});
