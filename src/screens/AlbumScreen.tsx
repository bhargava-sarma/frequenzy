import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useActiveMediaItem } from '@rntp/player';

import { SearchField } from '../components/SearchField';
import { TrackRow } from '../components/TrackRow';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { AmbientBackground } from '../components/AmbientBackground';
import { ExpandFrom } from '../components/ExpandFrom';
import { ArtworkWell } from '../components/ArtworkWell';
import { Button, ButtonRow } from '../components/Button';
import { DOCK_CLEARANCE } from '../components/TabBar';
import { ScreenHeader } from '../components/ScreenHeader';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { extrasOf } from '../player/trackMapping';
import { useArtwork } from '../hooks/useArtwork';
import { HEAVY_LIST_PROPS, trackItemLayout } from '../hooks/usePagedList';
import { useLibraryData } from '../hooks/useLibraryData';
import type { LibraryStackParamList } from '../navigation/types';
import { usePlayerStore } from '../store/usePlayerStore';
import { useServerStore } from '../store/useServerStore';
import { layout, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeProvider';
import type { Child } from '../types/subsonic';
import { formatDuration, pluralize } from '../utils/time';

/**
 * Below this many rows the list is short enough to read at a glance, and a
 * filter field would cost more space than the scrolling it saves.
 */
const MIN_ROWS_FOR_FILTER = 8;

/** Album detail — artwork, actions, and the track list. */
export function AlbumScreen() {
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
  /**
   * Filtering is deferred, so typing never waits on the list.
   *
   * React keeps the field painting at the new value while the filtered rows
   * are rendered at lower priority, and abandons that work if another
   * keystroke lands first. Debouncing would also stop the stutter, but it
   * does so by making every search feel late; this only yields when it has to.
   */
  const deferredFilter = useDeferredValue(filter);

  const visible = useMemo(() => {
    const needle = deferredFilter.trim().toLowerCase();
    if (!needle) return songs;
    return songs.filter(
      (song) =>
        song.title.toLowerCase().includes(needle) ||
        (song.artist ?? '').toLowerCase().includes(needle),
    );
  }, [songs, deferredFilter]);

  const filtering = deferredFilter.trim().length > 0;

  // Stable identities, so a row only re-renders when its own data changes.
  const handlePlay = useCallback(
    (index: number) => void playNow(visible, index),
    [playNow, visible],
  );
  const handleQueue = useCallback((song: Child) => void addToQueue([song]), [addToQueue]);
  const handleOptions = useCallback((song: Child) => setActionTarget(song), []);

  const handleStar = useCallback(
    async (song: Child) => {
      if (!client) return;
      // Written straight back to Navidrome so favourites are server-side truth
      // rather than local state. The cached album still holds the old value,
      // so drop it — otherwise navigating away and back shows the heart snap
      // back.
      if (song.starred) await client.unstar({ id: song.id });
      else await client.star({ id: song.id });
      refresh();
    },
    [client, refresh],
  );

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
          getItemLayout={trackItemLayout}
          renderItem={({ item, index }) => (
            <TrackRow
              song={item}
              index={index}
              active={item.id === activeId}
              last={index === visible.length - 1}
              showArtwork={false}
              onPlay={handlePlay}
              onOptions={handleOptions}
              onQueue={handleQueue}
              onStar={handleStar}
            />
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
