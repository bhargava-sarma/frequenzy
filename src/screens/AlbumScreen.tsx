import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useActiveMediaItem } from '@rntp/player';

import { SearchField } from '../components/SearchField';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { AmbientBackground } from '../components/AmbientBackground';
import { ExpandFrom } from '../components/ExpandFrom';
import { ArtworkWell } from '../components/ArtworkWell';
import { Button, ButtonRow } from '../components/Button';
import { IconHeart, IconHeartFilled, IconPlus } from '../components/icons';
import { ListRow } from '../components/ListRow';
import { DOCK_CLEARANCE } from '../components/TabBar';
import { ScreenHeader } from '../components/ScreenHeader';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { SwipeableRow } from '../components/SwipeableRow';
import { extrasOf } from '../player/trackMapping';
import { useArtwork } from '../hooks/useArtwork';
import { HEAVY_LIST_PROPS } from '../hooks/usePagedList';
import { useLibraryData } from '../hooks/useLibraryData';
import type { LibraryStackParamList } from '../navigation/types';
import { usePlayerStore } from '../store/usePlayerStore';
import { useServerStore } from '../store/useServerStore';
import { icon, layout, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Child } from '../types/subsonic';
import { formatDuration, pluralize } from '../utils/time';

/**
 * Below this many rows the list is short enough to read at a glance, and a
 * filter field would cost more space than the scrolling it saves.
 */
const MIN_ROWS_FOR_FILTER = 8;

/** Album detail — artwork, actions, and the track list. */
export function AlbumScreen() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation();
  const route = useRoute<RouteProp<LibraryStackParamList, 'Album'>>();
  const insets = useSafeAreaInsets();
  const artworkUrl = useArtwork();

  const { albumId, albumName } = route.params;

  const playNow = usePlayerStore((state) => state.playNow);
  const shufflePlay = usePlayerStore((state) => state.shufflePlay);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const client = useServerStore((state) => state.client);
  const activeItem = useActiveMediaItem();
  const activeId = extrasOf(activeItem)?.subsonicId;

  const { data, loading, error, refresh } = useLibraryData(
    (library, forceRefresh) => library.getAlbum(albumId, { forceRefresh }),
    [albumId],
  );

  const songs = data?.songs ?? [];
  const album = data?.album;
  const title = album?.name ?? albumName ?? 'Album';

  const totalDuration = songs.reduce((sum, song) => sum + (song.duration ?? 0), 0);

  /** Non-null while the actions sheet is open, holding the track it acts on. */
  const [actionTarget, setActionTarget] = useState<Child | null>(null);

  const [filter, setFilter] = useState('');

  /**
   * Filters on title and artist together. On a compilation the thing you
   * remember is often who sang it rather than what it was called.
   */
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return songs;
    return songs.filter(
      (song) =>
        song.title.toLowerCase().includes(needle) ||
        (song.artist ?? '').toLowerCase().includes(needle),
    );
  }, [songs, filter]);

  const filtering = filter.trim().length > 0;

  async function toggleStar(songId: string, starred: boolean) {
    if (!client) return;
    // Written straight back to Navidrome so favourites are server-side truth
    // rather than local state. The cached album still holds the old value, so
    // drop it — otherwise navigating away and back shows the heart snap back.
    if (starred) await client.unstar({ id: songId });
    else await client.star({ id: songId });
    refresh();
  }

  return (
    <ExpandFrom>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <AmbientBackground />

        <ScreenHeader title={title} onBack={() => navigation.goBack()} />

        {songs.length > MIN_ROWS_FOR_FILTER && (
          <SearchField value={filter} onChangeText={setFilter} placeholder="Find in album" />
        )}

        <FlatList
          data={visible}
          {...HEAVY_LIST_PROPS}
          keyExtractor={(song) => song.id}
          ListHeaderComponent={
            album ? (
              <View>
                <View style={styles.hero}>
                  <ArtworkWell
                    uri={artworkUrl(album.coverArt, 600)}
                    size={180}
                    surface="paper"
                  />
                  <Text style={styles.albumTitle} numberOfLines={2}>
                    {album.name}
                  </Text>
                  <Text style={styles.albumMeta} numberOfLines={1}>
                    {[album.artist, album.year ? String(album.year) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>

                  {/* Play and Shuffle both replace the queue with the whole
                    album — that's the collection you asked to hear. Anything
                    added by hand keeps its place ahead of what's left. */}
                  <View style={styles.actions}>
                    <ButtonRow>
                      <Button
                        label="Play"
                        variant="primary"
                        onPress={() => void playNow(songs)}
                      />
                      <Button label="Shuffle" onPress={() => void shufflePlay(songs)} />
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
              <EmptyState label={filtering ? 'No matches' : 'No tracks'} />
            )
          }
          contentContainerStyle={visible.length ? styles.listContent : styles.emptyContainer}
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
                showArtwork={false}
                action="favorite"
                favorited={Boolean(item.starred)}
                active={item.id === activeId}
                last={index === visible.length - 1}
                // Starting mid-album queues the whole album from that point,
                // rather than the single track — the queue is the point.
                onPress={() => void playNow(visible, index)}
                // Long-press is the app-wide gesture for "do something else
                // with this track".
                onLongPress={() => setActionTarget(item)}
                onActionPress={() => void toggleStar(item.id, Boolean(item.starred))}
              />
            </SwipeableRow>
          )}
        />

        <TrackActionsSheet
          visible={actionTarget != null}
          onClose={() => setActionTarget(null)}
          song={actionTarget}
          hide={['album']}
          onStarChanged={refresh}
        />
      </View>
    </ExpandFrom>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.paper },
    listContent: { paddingBottom: DOCK_CLEARANCE },
    emptyContainer: { flexGrow: 1 },

    hero: {
      alignItems: 'center',
      paddingTop: space[5],
      paddingHorizontal: layout.screenPadding,
    },
    albumTitle: {
      ...type.display,
      color: color.textPrimary,
      marginTop: space[4],
      textAlign: 'center',
    },
    albumMeta: { ...type.meta, color: color.textSecondary, marginTop: space[1] },
    actions: { marginTop: space[5], alignSelf: 'stretch', alignItems: 'center' },
  });
