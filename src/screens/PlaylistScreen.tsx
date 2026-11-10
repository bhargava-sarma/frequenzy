import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useActiveMediaItem, useIsPlaying } from '@rntp/player';

import { AddToPlaylistSheet } from '../components/AddToPlaylistSheet';
import { useCollapsingHeader, useNavBarHeight } from '../components/CollapsingHeader';
import { DetailHero, HeroBackdrop } from '../components/DetailHero';
import { IconButton } from '../components/IconButton';
import {
  IconArrowsShuffle,
  IconCopy,
  IconDots,
  IconHeartFilled,
  IconListDetails,
  IconLock,
  IconPencil,
  IconPlayerPlayFilled,
  IconPlaylistX,
  IconTrash,
  IconWorld,
} from '../components/icons';
import { Keycap, KeyRow } from '../components/Keycap';
import { PromptSheet } from '../components/PromptSheet';
import { DetailScaffold } from '../components/Scaffold';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { SearchField } from '../components/SearchField';
import { Sheet, SheetRow } from '../components/Sheet';
import { DOCK_CLEARANCE } from '../components/TabBar';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import { useArtwork } from '../hooks/useArtwork';
import { usePullRefresh } from '../hooks/usePullRefresh';
import { LIKED_PLAYLIST_ID, type AnyStackParamList } from '../navigation/types';
import { extrasOf } from '../player/trackMapping';
import { useFavoritesStore } from '../store/useFavoritesStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { useServerStore } from '../store/useServerStore';
import { errorMessage, toast } from '../store/useToastStore';
import { space } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import type { Child, Playlist } from '../types/subsonic';
import { haptics } from '../utils/haptics';
import { formatLength, pluralize } from '../utils/time';

/**
 * A playlist — or Liked songs, which Navidrome keeps as stars rather than a
 * playlist, so it arrives from a different endpoint behind the same screen.
 *
 * Read straight from the server, not the library cache: playlists change
 * whenever you edit one, and there are few enough that the round trip is
 * cheaper than the confusion of a stale track list.
 */

const MIN_ROWS_FOR_FILTER = 14;

type Menu = 'none' | 'menu' | 'rename' | 'describe' | 'delete' | 'copy';

export function PlaylistScreen() {
  const color = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<AnyStackParamList>>();
  const route = useRoute<RouteProp<AnyStackParamList, 'Playlist'>>();
  const { playlistId, playlistName } = route.params;
  const isLiked = playlistId === LIKED_PLAYLIST_ID;
  const artworkUrl = useArtwork();
  const navHeight = useNavBarHeight();
  const { scrollY, onScroll, progress } = useCollapsingHeader();

  const client = useServerStore((state) => state.client);
  const playNow = usePlayerStore((state) => state.playNow);
  const shufflePlay = usePlayerStore((state) => state.shufflePlay);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const setStarred = useFavoritesStore((state) => state.setStarred);
  const renamePlaylist = usePlaylistStore((state) => state.rename);
  const deletePlaylist = usePlaylistStore((state) => state.remove);
  const removeTrackAt = usePlaylistStore((state) => state.removeTrackAt);
  const loadPlaylists = usePlaylistStore((state) => state.load);
  const activeItem = useActiveMediaItem();
  const isPlaying = useIsPlaying();
  const activeId = extrasOf(activeItem)?.subsonicId;

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);
  const pull = usePullRefresh(loading, refresh);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    setLoading(true);

    const load = isLiked
      ? client.getStarred2().then((response) => {
          const starredSongs = response.starred2.song ?? [];
          return {
            playlist: {
              id: LIKED_PLAYLIST_ID,
              name: 'Liked songs',
              songCount: starredSongs.length,
              duration: starredSongs.reduce((sum, song) => sum + (song.duration ?? 0), 0),
              coverArt: starredSongs[0]?.coverArt,
            } satisfies Playlist,
            songs: starredSongs,
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
        if (!cancelled) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, playlistId, isLiked, reloadToken]);

  const [filter, setFilter] = useState('');
  const deferredFilter = useDeferredValue(filter.trim().toLowerCase());
  const [menu, setMenu] = useState<Menu>('none');
  const [trackTarget, setTrackTarget] = useState<Child | null>(null);

  const filtered = useMemo(() => {
    if (!deferredFilter) return songs;
    return songs.filter(
      (song) =>
        song.title.toLowerCase().includes(deferredFilter) ||
        (song.artist ?? '').toLowerCase().includes(deferredFilter) ||
        (song.album ?? '').toLowerCase().includes(deferredFilter),
    );
  }, [songs, deferredFilter]);

  /**
   * Each track's position in the playlist itself, not on screen. The server
   * removes by index — the same track may appear twice — and a filtered list
   * renumbers from zero, so the real index has to be carried. A Map, since
   * an indexOf per row would make a long playlist quadratic.
   */
  const positions = useMemo(() => {
    const map = new Map<Child, number>();
    songs.forEach((song, index) => map.set(song, index));
    return map;
  }, [songs]);
  const positionOf = useCallback((song: Child) => positions.get(song) ?? -1, [positions]);

  const title = playlist?.name ?? playlistName ?? 'Playlist';
  const source = { kind: isLiked ? ('liked' as const) : ('playlist' as const), label: title };
  const total = playlist?.duration ?? songs.reduce((sum, song) => sum + (song.duration ?? 0), 0);

  const handlePlay = useCallback(
    (index: number) => toast.guard(playNow(filtered, index, source)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playNow, filtered, title, isLiked],
  );
  const handleQueue = useCallback(
    (song: Child) =>
      toast.guard(
        addToQueue([song]).then(() => toast.show('Added to queue', { icon: 'queue', detail: song.title })),
        "Couldn't queue",
      ),
    [addToQueue],
  );

  /**
   * Removals in flight, sent one at a time.
   *
   * The server removes by position, and each position here is read off the
   * list as it stands after the removals before it. Sent side by side, two
   * requests could land in either order and the second would take out the
   * wrong track. The reload waits for the last of them: one fired after each
   * came back while the next was still pending, and briefly put that row
   * back on screen. If one fails, the positions after it are all off by one,
   * so the rest are dropped rather than sent.
   */
  const removals = useRef({ tail: Promise.resolve(), pending: 0, failed: false });

  const removeSong = useCallback(
    (song: Child) => {
      if (isLiked) {
        // Optimistic here too: the row goes with the swipe, and the reload
        // puts it back if the server wouldn't have it.
        setSongs((current) => current.filter((other) => other !== song));
        void setStarred({ id: song.id, kind: 'song', albumId: song.albumId, title: song.title }, false).finally(
          refresh,
        );
        return;
      }
      const position = positionOf(song);
      if (position < 0) return;
      // Optimistic, so the row closes the gap at once; the reload confirms.
      setSongs((current) => current.filter((_, index) => index !== position));

      const queue = removals.current;
      queue.pending += 1;
      queue.tail = queue.tail
        .then(async () => {
          if (queue.failed) return;
          await removeTrackAt(playlistId, position);
          toast.show('Removed from playlist', { icon: 'playlist', detail: song.title });
        })
        .catch((e: unknown) => {
          queue.failed = true;
          toast.error("Couldn't remove", { detail: errorMessage(e) });
        })
        .finally(() => {
          queue.pending -= 1;
          if (queue.pending === 0) {
            queue.failed = false;
            refresh();
          }
        });
    },
    [isLiked, setStarred, refresh, positionOf, removeTrackAt, playlistId],
  );

  async function setVisibility(isPublic: boolean) {
    if (!client || !playlist) return;
    try {
      await client.updatePlaylist({ playlistId, public: isPublic });
      toast.show(isPublic ? 'Playlist is public' : 'Playlist is private', { icon: 'playlist' });
      refresh();
      void loadPlaylists();
    } catch (cause) {
      toast.error("Couldn't change visibility", { detail: errorMessage(cause) });
    }
  }

  const header = (
    <View>
      <DetailHero
        artworkUri={artworkUrl(playlist?.coverArt, 600)}
        // Public or private only once it is known: assumed private until
        // loaded, a public playlist opened with the wrong word on it.
        eyebrow={
          isLiked
            ? 'Collection · Hearted'
            : playlist
              ? `Playlist · ${playlist.public ? 'Public' : 'Private'}`
              : 'Playlist'
        }
        title={title}
        subtitle={!isLiked && playlist?.owner ? `by ${playlist.owner}` : undefined}
        meta={songs.length > 0 ? [pluralize(songs.length, 'track'), formatLength(total)].join('  ·  ') : undefined}
        description={playlist?.comment}
        art={
          isLiked && !playlist?.coverArt ? (
            <View style={[styles.likedArt, { backgroundColor: color.accent }]}>
              <IconHeartFilled size={72} color={color.accentInk} />
            </View>
          ) : undefined
        }
        actions={
          songs.length > 0 ? (
            <KeyRow>
              <Keycap
                icon={IconPlayerPlayFilled}
                iconFilled
                label="Play"
                variant="primary"
                flex
                onPress={() => toast.guard(playNow(songs, 0, source))}
              />
              <Keycap
                icon={IconArrowsShuffle}
                label="Shuffle"
                flex
                onPress={() => toast.guard(shufflePlay(songs, source))}
              />
              <Keycap
                icon={IconListDetails}
                square
                accessibilityLabel="Add all to queue"
                onPress={() =>
                  toast.guard(
                    addToQueue(songs).then(() =>
                      toast.show('Added to queue', {
                        icon: 'queue',
                        detail: `${title} · ${pluralize(songs.length, 'track')}`,
                      }),
                    ),
                    "Couldn't queue",
                  )
                }
              />
            </KeyRow>
          ) : undefined
        }
      />
      {songs.length > MIN_ROWS_FOR_FILTER && (
        <View style={styles.filter}>
          <SearchField value={filter} onChangeText={setFilter} placeholder="Find in playlist" />
        </View>
      )}
    </View>
  );

  return (
    <DetailScaffold
      title={title}
      progress={progress}
      onBack={() => navigation.goBack()}
      backdrop={<HeroBackdrop uri={artworkUrl(playlist?.coverArt, 200)} scrollY={scrollY} />}
      trailing={
        isLiked ? undefined : (
          <IconButton
            icon={IconDots}
            accessibilityLabel="Playlist options"
            size={38}
            iconSize={20}
            disabled={!playlist}
            onPress={() => setMenu('menu')}
          />
        )
      }
    >
      <Animated.FlatList
        data={filtered}
        keyExtractor={(song) => `${song.id}-${positionOf(song)}`}
        onScroll={onScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : (
            <EmptyState
              label={deferredFilter ? 'No matches' : isLiked ? 'No liked songs yet' : 'This playlist is empty'}
              hint={
                deferredFilter
                  ? undefined
                  : isLiked
                    ? 'Swipe a track left, or tap its heart, to like it.'
                    : 'Add tracks from any track’s ⋮ menu.'
              }
            />
          )
        }
        renderItem={({ item, index }) => (
          <TrackRow
            song={item}
            index={index}
            active={item.id === activeId}
            playing={isPlaying}
            last={index === filtered.length - 1}
            subtitle="artistAlbum"
            leftAction="remove"
            onPlay={handlePlay}
            onMore={setTrackTarget}
            onQueue={handleQueue}
            onRemove={removeSong}
          />
        )}
        contentContainerStyle={styles.list}
        initialNumToRender={14}
        windowSize={9}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl {...pull} progressViewOffset={navHeight} />}
      />

      <Sheet
        visible={menu === 'menu'}
        onClose={() => setMenu('none')}
        title={title}
        subtitle={pluralize(songs.length, 'track')}
        artworkUri={artworkUrl(playlist?.coverArt, 120) ?? null}
      >
        <SheetRow label="Rename" icon={IconPencil} onPress={() => setMenu('rename')} />
        <SheetRow label={playlist?.comment ? 'Edit description' : 'Add description'} icon={IconPencil} onPress={() => setMenu('describe')} />
        <SheetRow
          label={playlist?.public ? 'Make private' : 'Make public'}
          icon={playlist?.public ? IconLock : IconWorld}
          onPress={() => {
            setMenu('none');
            void setVisibility(!playlist?.public);
          }}
        />
        <SheetRow
          label="Copy tracks to another playlist"
          icon={IconCopy}
          disabled={songs.length === 0}
          onPress={() => setMenu('copy')}
        />
        <SheetRow label="Delete playlist" icon={IconTrash} tone="destructive" last onPress={() => setMenu('delete')} />
      </Sheet>

      <Sheet
        visible={menu === 'delete'}
        onClose={() => setMenu('none')}
        title={`Delete ${title}?`}
        subtitle="This removes it from Navidrome for every client."
      >
        <SheetRow
          label="Delete"
          icon={IconTrash}
          tone="destructive"
          onPress={() => {
            setMenu('none');
            void deletePlaylist(playlistId)
              .then(() => {
                haptics.success();
                toast.show(`Deleted ${title}`, { icon: 'playlist' });
                navigation.goBack();
              })
              .catch((e) => toast.error("Couldn't delete", { detail: errorMessage(e) }));
          }}
        />
        <SheetRow label="Keep it" last onPress={() => setMenu('none')} />
      </Sheet>

      <PromptSheet
        visible={menu === 'rename'}
        onClose={() => setMenu('none')}
        title="Rename playlist"
        placeholder="Playlist name"
        initialValue={playlist?.name ?? ''}
        confirmLabel="Save"
        onConfirm={async (name) => {
          try {
            await renamePlaylist(playlistId, name);
            toast.show('Renamed', { icon: 'playlist', detail: name });
            refresh();
          } catch (e) {
            toast.error("Couldn't rename", { detail: errorMessage(e) });
            throw e;
          }
        }}
      />

      <PromptSheet
        visible={menu === 'describe'}
        onClose={() => setMenu('none')}
        title="Description"
        placeholder="What this playlist is for"
        initialValue={playlist?.comment ?? ''}
        confirmLabel="Save"
        allowEmpty
        multiline
        onConfirm={async (comment) => {
          if (!client) return;
          try {
            await client.updatePlaylist({ playlistId, comment });
            toast.show('Description saved', { icon: 'playlist' });
            refresh();
          } catch (e) {
            toast.error("Couldn't save", { detail: errorMessage(e) });
            throw e;
          }
        }}
      />

      <AddToPlaylistSheet
        visible={menu === 'copy'}
        onClose={() => setMenu('none')}
        songIds={songs.map((song) => song.id)}
        subject={title}
        coverArt={playlist?.coverArt}
      />

      <TrackActionsSheet
        visible={trackTarget != null}
        onClose={() => setTrackTarget(null)}
        song={trackTarget}
        extraAction={
          trackTarget
            ? {
                label: isLiked ? 'Remove from liked songs' : 'Remove from this playlist',
                icon: IconPlaylistX,
                destructive: true,
                onPress: () => removeSong(trackTarget),
              }
            : undefined
        }
      />
    </DetailScaffold>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: DOCK_CLEARANCE, flexGrow: 1 },
  filter: { marginTop: space[2] },
  likedArt: {
    width: 200,
    height: 200,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
