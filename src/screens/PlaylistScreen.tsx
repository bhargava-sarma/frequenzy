import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useActiveMediaItem } from '@rntp/player';

import { AddToPlaylistSheet } from '../components/AddToPlaylistSheet';
import { AmbientBackground } from '../components/AmbientBackground';
import { ExpandFrom } from '../components/ExpandFrom';
import { ArtworkWell } from '../components/ArtworkWell';
import { Button, ButtonRow } from '../components/Button';
import { IconDots } from '../components/icons';
import { DOCK_CLEARANCE } from '../components/TabBar';
import { ScreenHeader } from '../components/ScreenHeader';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { Sheet, SheetBody, SheetOption } from '../components/Sheet';
import { SearchField } from '../components/SearchField';
import { TrackRow } from '../components/TrackRow';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { extrasOf } from '../player/trackMapping';
import { useArtwork } from '../hooks/useArtwork';
import { HEAVY_LIST_PROPS, trackItemLayout, usePagedList } from '../hooks/usePagedList';
import { LIKED_PLAYLIST_ID, type LibraryStackParamList } from '../navigation/types';
import { usePlayerStore } from '../store/usePlayerStore';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { useServerStore } from '../store/useServerStore';
import { hairline, icon, layout, radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Child, Playlist } from '../types/subsonic';
import { formatDuration, pluralize } from '../utils/time';

/** Below this, the list fits on a screen and a filter costs more than it saves. */
const MIN_ROWS_FOR_FILTER = 8;

/**
 * Playlist detail — the same shape as the album screen.
 *
 * Playlists are read straight from the server rather than through the library
 * cache: they change whenever you edit one, and there are few enough that the
 * round trip is cheaper than the confusion of a stale track list.
 */
export function PlaylistScreen() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation();
  const route = useRoute<RouteProp<LibraryStackParamList, 'Playlist'>>();
  const insets = useSafeAreaInsets();
  const artworkUrl = useArtwork();

  const { playlistId, playlistName } = route.params;
  const isLiked = playlistId === LIKED_PLAYLIST_ID;

  const client = useServerStore((state) => state.client);
  const playNow = usePlayerStore((state) => state.playNow);
  const shufflePlay = usePlayerStore((state) => state.shufflePlay);
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

    // Favourites are not a playlist on the server, so they come from a
    // different endpoint and get a synthetic header to render against.
    const load = isLiked
      ? client.getStarred2().then((response) => {
          const songs = response.starred2.song ?? [];
          return {
            playlist: {
              id: LIKED_PLAYLIST_ID,
              name: 'Liked songs',
              songCount: songs.length,
              duration: songs.reduce((sum, song) => sum + (song.duration ?? 0), 0),
              // The set has no cover of its own, so it borrows the newest
              // favourite's — the same one the library row shows.
              coverArt: songs[0]?.coverArt,
            } satisfies Playlist,
            songs,
          };
        })
      : client.getPlaylist(playlistId).then((response) => ({
          playlist: response.playlist as Playlist,
          songs: response.playlist.entry ?? [],
        }));

    load
      .then((result) => {
        if (cancelled) return;
        setPlaylist(result.playlist);
        setSongs(result.songs);
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
  }, [client, playlistId, isLiked, reloadToken]);

  const renamePlaylist = usePlaylistStore((state) => state.rename);
  const deletePlaylist = usePlaylistStore((state) => state.remove);
  const removeTrackAt = usePlaylistStore((state) => state.removeTrackAt);

  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  /** Non-null while the add-to-playlist sheet is open, holding what to add. */
  const [actionTarget, setActionTarget] = useState<Child | null>(null);
  /** Bulk copy of the whole playlist, from its own menu — not a row action. */
  const [bulkTargets, setBulkTargets] = useState<string[] | null>(null);
  const [filter, setFilter] = useState('');

  // Deferred, so the field keeps painting while the rows catch up. See the
  // note in AlbumScreen for why this rather than a debounce.
  const deferredFilter = useDeferredValue(filter);

  const filtered = useMemo(() => {
    const needle = deferredFilter.trim().toLowerCase();
    if (!needle) return songs;
    return songs.filter(
      (song) =>
        song.title.toLowerCase().includes(needle) ||
        (song.artist ?? '').toLowerCase().includes(needle),
    );
  }, [songs, deferredFilter]);

  const filtering = deferredFilter.trim().length > 0;

  /**
   * Each track's position in the playlist itself, not in what's on screen.
   *
   * Two things need this. The server removes by index because the same track
   * may appear twice, so the index handed to it has to be the real one — a
   * filtered list renumbers from zero and would otherwise delete whatever sits
   * at that position in the full playlist. And the row key is built from it,
   * which is what keeps keys stable while a filter reorders the list.
   *
   * A Map rather than indexOf per row: the latter is a scan, and calling it
   * once per row turns rendering a long playlist into quadratic work.
   */
  const positions = useMemo(() => {
    const map = new Map<Child, number>();
    songs.forEach((song, index) => map.set(song, index));
    return map;
  }, [songs]);

  const positionOf = useCallback((song: Child) => positions.get(song) ?? -1, [positions]);

  // Stable identities, so a row re-renders only when its own data changes.
  const handlePlay = useCallback(
    (index: number) => void playNow(filtered, index),
    [playNow, filtered],
  );
  const handleQueue = useCallback((song: Child) => void addToQueue([song]), [addToQueue]);
  const handleOptions = useCallback((song: Child) => setActionTarget(song), []);
  const handleStar = useCallback(
    (song: Child) => void toggleStar(song.id, Boolean(song.starred)),
    // toggleStar is redeclared each render; it only closes over client and
    // refresh, both of which are stable for the life of the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const handleRemove = useCallback(
    (song: Child) => {
      void removeTrackAt(playlistId, positionOf(song)).then(refresh);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [removeTrackAt, playlistId, positionOf],
  );

  const paged = usePagedList(filtered);
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
    <ExpandFrom>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <AmbientBackground />

        <ScreenHeader
          title={title}
          onBack={() => navigation.goBack()}
          action={
            // Favourites are the server's, not a playlist — there is nothing
            // here that editing could legitimately change.
            isLiked ? undefined : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Playlist options"
                hitSlop={space[3]}
                onPress={() => setMenuOpen(true)}
              >
                <IconDots
                  size={icon.size}
                  strokeWidth={icon.strokeWidth}
                  color={color.textSecondary}
                />
              </Pressable>
            )
          }
        />

        {songs.length > MIN_ROWS_FOR_FILTER && (
          <SearchField value={filter} onChangeText={setFilter} placeholder="Find in playlist" />
        )}

        <FlatList
          data={paged.visible}
          {...HEAVY_LIST_PROPS}
          // Keyed on the position in the playlist, not in the filtered view.
          // An index into what is on screen changes the moment a filter
          // reorders things, which unmounts and rebuilds every row — the whole
          // of the delay that used to follow each keystroke.
          keyExtractor={(song) => `${song.id}-${positionOf(song)}`}
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
              <EmptyState
                label={
                  filtering ? 'No matches' : isLiked ? 'No liked songs' : 'Empty playlist'
                }
                hint={
                  filtering
                    ? undefined
                    : isLiked
                      ? 'Tap the heart on a track to add it here.'
                      : 'Add tracks to it in Navidrome.'
                }
              />
            )
          }
          contentContainerStyle={filtered.length ? styles.listContent : styles.emptyContainer}
          ListFooterComponent={
            paged.hasMore ? (
              <View style={styles.loadMore}>
                <Button
                  label={`Load ${paged.nextCount} more`}
                  fullWidth
                  onPress={paged.loadMore}
                />
              </View>
            ) : null
          }
          getItemLayout={trackItemLayout}
          renderItem={({ item, index }) => (
            <TrackRow
              song={item}
              index={index}
              active={item.id === activeId}
              last={index === paged.visible.length - 1}
              // Favourites are the server's own list: a left swipe there means
              // unstar, which is what takes it out. Elsewhere it means remove.
              leftAction={isLiked ? 'star' : 'remove'}
              onPlay={handlePlay}
              onOptions={handleOptions}
              onQueue={handleQueue}
              onStar={handleStar}
              onRemove={handleRemove}
            />
          )}
        />

        <Sheet
          visible={menuOpen}
          onClose={() => {
            setMenuOpen(false);
            setRenaming(false);
          }}
          title={renaming ? 'Rename playlist' : (playlist?.name ?? 'Playlist')}
        >
          {renaming ? (
            <SheetBody>
              <TextInput
                style={styles.input}
                value={draftName}
                onChangeText={setDraftName}
                placeholder="Playlist name"
                placeholderTextColor={color.textInverseSecondary}
                autoFocus
                returnKeyType="done"
              />
              <View style={styles.sheetActions}>
                <ButtonRow>
                  <Button
                    label="Save"
                    variant="primary"
                    disabled={draftName.trim().length === 0}
                    onPress={() => {
                      void renamePlaylist(playlistId, draftName).then(refresh);
                      setMenuOpen(false);
                      setRenaming(false);
                    }}
                  />
                  <Button label="Cancel" onPress={() => setRenaming(false)} />
                </ButtonRow>
              </View>
            </SheetBody>
          ) : (
            <>
              <SheetOption
                label="Add these tracks to another playlist"
                onPress={() => {
                  setMenuOpen(false);
                  setBulkTargets(songs.map((song) => song.id));
                }}
              />
              <SheetOption
                label="Rename"
                onPress={() => {
                  setDraftName(playlist?.name ?? '');
                  setRenaming(true);
                }}
              />
              <SheetOption
                label="Delete playlist"
                emphasis
                last
                onPress={() => {
                  void deletePlaylist(playlistId);
                  setMenuOpen(false);
                  navigation.goBack();
                }}
              />
            </>
          )}
        </Sheet>

        <AddToPlaylistSheet
          visible={bulkTargets != null}
          onClose={() => setBulkTargets(null)}
          songIds={bulkTargets ?? []}
          subject={playlist?.name}
        />

        <TrackActionsSheet
          visible={actionTarget != null}
          onClose={() => setActionTarget(null)}
          song={actionTarget}
          onStarChanged={refresh}
          extraAction={
            isLiked || !actionTarget
              ? undefined
              : {
                  label: 'Remove from this playlist',
                  emphasis: true,
                  onPress: () => {
                    void removeTrackAt(playlistId, positionOf(actionTarget)).then(refresh);
                  },
                }
          }
        />
      </View>
    </ExpandFrom>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.paper },
    listContent: { paddingBottom: DOCK_CLEARANCE },
    loadMore: { paddingHorizontal: layout.screenPadding, paddingTop: space[5] },
    input: {
      ...type.body,
      color: color.textInverse,
      height: 48,
      paddingHorizontal: space[3],
      borderWidth: hairline,
      borderColor: color.panelLine,
      borderRadius: radius.sm,
      backgroundColor: color.panelRaised,
    },
    sheetActions: { marginTop: space[4], paddingBottom: space[3] },
    emptyContainer: { flexGrow: 1 },

    hero: {
      alignItems: 'center',
      paddingTop: space[5],
      paddingHorizontal: layout.screenPadding,
    },
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
