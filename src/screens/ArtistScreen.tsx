import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useActiveMediaItem, useIsPlaying } from '@rntp/player';

import { AlbumActionsSheet } from '../components/AlbumActionsSheet';
import { AlbumTile } from '../components/AlbumTile';
import { useCollapsingHeader, useNavBarHeight } from '../components/CollapsingHeader';
import { DetailHero, HeroBackdrop } from '../components/DetailHero';
import { IconButton } from '../components/IconButton';
import {
  IconArrowsShuffle,
  IconHeart,
  IconHeartFilled,
  IconPlayerPlayFilled,
  IconRadio,
} from '../components/icons';
import { Keycap, KeyRow } from '../components/Keycap';
import { DetailScaffold } from '../components/Scaffold';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { SectionHeader } from '../components/SectionHeader';
import { DOCK_CLEARANCE } from '../components/TabBar';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import { useArtwork } from '../hooks/useArtwork';
import { useLibraryData } from '../hooks/useLibraryData';
import { usePullRefresh } from '../hooks/usePullRefresh';
import type { AnyStackParamList } from '../navigation/types';
import { EmptyMixError, startArtistRadio } from '../player/mixes';
import { extrasOf } from '../player/trackMapping';
import { useFavoritesStore, useStarred } from '../store/useFavoritesStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { useServerStore } from '../store/useServerStore';
import { errorMessage, toast } from '../store/useToastStore';
import { layout, space } from '../theme/tokens';
import type { AlbumSummary, ArtistSummary, Child } from '../types/subsonic';
import { pluralize } from '../utils/time';

/**
 * An artist: who they are, what they're known for, everything you have of
 * theirs, and who sounds like them.
 *
 * The biography, images and similar artists come from Navidrome's external
 * agents and are simply absent when it has none configured. Top tracks the
 * same. Nothing here treats their absence as an error.
 */

/** Strips the HTML Last.fm biographies arrive in, and their trailing link. */
function plainBiography(html?: string): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<a [^>]*>.*?<\/a>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 0 ? text : undefined;
}

export function ArtistScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AnyStackParamList>>();
  const route = useRoute<RouteProp<AnyStackParamList, 'Artist'>>();
  const { artistId, artistName } = route.params;
  const artworkUrl = useArtwork();
  const { width } = useWindowDimensions();
  const navHeight = useNavBarHeight();
  const { scrollY, onScroll, progress } = useCollapsingHeader();

  const library = useServerStore((state) => state.library);
  const client = useServerStore((state) => state.client);
  const playNow = usePlayerStore((state) => state.playNow);
  const shufflePlay = usePlayerStore((state) => state.shufflePlay);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const setStarred = useFavoritesStore((state) => state.setStarred);
  const activeItem = useActiveMediaItem();
  const isPlaying = useIsPlaying();
  const activeId = extrasOf(activeItem)?.subsonicId;

  const { data, loading, error, refresh } = useLibraryData(
    (repo, forceRefresh) => repo.getArtist(artistId, { forceRefresh }),
    [artistId],
  );
  const info = useLibraryData((repo) => repo.getArtistInfo(artistId).catch(() => ({})), [artistId]);
  const pull = usePullRefresh(loading, refresh);

  const artist = data?.artist;
  const name = artist?.name ?? artistName ?? 'Artist';
  const starred = useStarred(artistId, Boolean(artist?.starred));

  // Newest first: a discography reads forward from what they're doing now.
  const albums = useMemo(
    () => [...(data?.albums ?? [])].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)),
    [data],
  );
  const trackCount = albums.reduce((sum, album) => sum + (album.songCount ?? 0), 0);

  const [topSongs, setTopSongs] = useState<Child[]>([]);
  useEffect(() => {
    if (!client || !name || name === 'Artist') return;
    let cancelled = false;
    client
      .getTopSongs(name, 5)
      .then((response) => {
        if (!cancelled) setTopSongs(response.topSongs?.song ?? []);
      })
      .catch(() => {
        // Top songs need an external agent; their absence is not an error.
      });
    return () => {
      cancelled = true;
    };
  }, [client, name]);

  const [gathering, setGathering] = useState<'play' | 'shuffle' | 'radio' | null>(null);
  const [trackTarget, setTrackTarget] = useState<Child | null>(null);
  const [albumTarget, setAlbumTarget] = useState<AlbumSummary | null>(null);

  /**
   * Every track by this artist, in album order. Fetched on press rather
   * than on load: an artist with twenty albums would otherwise fire twenty
   * requests to render a list of names. Reads go through the cache.
   */
  async function gatherSongs(): Promise<Child[]> {
    if (!library) return [];
    const ordered = [...albums].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
    const details = await Promise.all(ordered.map((album) => library.getAlbum(album.id)));
    return details.flatMap((detail) => detail.songs);
  }

  async function start(mode: 'play' | 'shuffle' | 'radio') {
    if (gathering) return;
    setGathering(mode);
    try {
      if (mode === 'radio') {
        const count = await startArtistRadio(artistId, name);
        toast.show('Radio started', { icon: 'radio', detail: `${count} tracks` });
        return;
      }
      const songs = await gatherSongs();
      if (songs.length === 0) {
        // Said, rather than a key that spins and then does nothing.
        toast.show('No tracks to play', { icon: 'info', detail: name });
        return;
      }
      const source = { kind: 'artist' as const, label: name };
      if (mode === 'shuffle') await shufflePlay(songs, source);
      else await playNow(songs, 0, source);
    } catch (cause) {
      if (cause instanceof EmptyMixError) toast.show(cause.message, { icon: 'info' });
      else toast.error("Couldn't start playback", { detail: errorMessage(cause) });
    } finally {
      setGathering(null);
    }
  }

  const playTop = useCallback(
    (index: number) =>
      toast.guard(playNow(topSongs, index, { kind: 'artist', label: `${name} — top tracks` })),
    [playNow, topSongs, name],
  );
  const queueTop = useCallback(
    (song: Child) =>
      toast.guard(
        addToQueue([song]).then(() => toast.show('Added to queue', { icon: 'queue', detail: song.title })),
        "Couldn't queue",
      ),
    [addToQueue],
  );

  const columns = 2;
  const tile = Math.floor((width - layout.screenPadding * 2 - space[3] * (columns - 1)) / columns);
  const similar = (info.data as { similarArtist?: ArtistSummary[] } | null)?.similarArtist ?? [];
  const bio = plainBiography((info.data as { biography?: string } | null)?.biography);
  const imageFromAgents = (info.data as { largeImageUrl?: string } | null)?.largeImageUrl;
  const cover = artworkUrl(artist?.coverArt, 600) ?? imageFromAgents;

  const header = (
    <View>
      <DetailHero
        round
        artworkUri={cover}
        eyebrow="Artist"
        title={name}
        meta={
          albums.length > 0
            ? [pluralize(albums.length, 'album'), trackCount > 0 ? pluralize(trackCount, 'track') : null]
                .filter(Boolean)
                .join('  ·  ')
            : undefined
        }
        description={bio}
        actions={
          albums.length > 0 ? (
            <KeyRow>
              <Keycap
                icon={IconPlayerPlayFilled}
                iconFilled
                label="Play"
                variant="primary"
                flex
                busy={gathering === 'play'}
                onPress={() => void start('play')}
              />
              <Keycap
                icon={IconArrowsShuffle}
                label="Shuffle"
                flex
                busy={gathering === 'shuffle'}
                onPress={() => void start('shuffle')}
              />
              <Keycap
                icon={IconRadio}
                square
                accessibilityLabel="Artist radio"
                busy={gathering === 'radio'}
                onPress={() => void start('radio')}
              />
            </KeyRow>
          ) : undefined
        }
      />
      {topSongs.length > 0 && (
        <>
          <SectionHeader index="01" title="Top tracks" />
          {topSongs.map((song, index) => (
            <TrackRow
              key={song.id}
              song={song}
              index={index}
              active={song.id === activeId}
              playing={isPlaying}
              last={index === topSongs.length - 1}
              subtitle="album"
              onPlay={playTop}
              onMore={setTrackTarget}
              onQueue={queueTop}
            />
          ))}
        </>
      )}
      {albums.length > 0 && (
        <SectionHeader
          index={topSongs.length > 0 ? '02' : '01'}
          title="Discography"
          detail={pluralize(albums.length, 'album').toUpperCase()}
        />
      )}
    </View>
  );

  const footer =
    similar.length > 0 ? (
      <View>
        <SectionHeader index={topSongs.length > 0 ? '03' : '02'} title="Similar artists" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.similar}>
          {similar.map((other) => (
            <AlbumTile
              key={other.id}
              title={other.name}
              subtitle={other.albumCount ? pluralize(other.albumCount, 'album') : undefined}
              artworkUri={artworkUrl(other.coverArt, 300)}
              size={Math.round(tile * 0.62)}
              round
              onPress={() => navigation.push('Artist', { artistId: other.id, artistName: other.name })}
            />
          ))}
        </ScrollView>
      </View>
    ) : null;

  return (
    <DetailScaffold
      title={name}
      progress={progress}
      onBack={() => navigation.goBack()}
      backdrop={<HeroBackdrop uri={artworkUrl(artist?.coverArt, 200) ?? imageFromAgents} scrollY={scrollY} />}
      trailing={
        <IconButton
          icon={starred ? IconHeartFilled : IconHeart}
          accessibilityLabel={starred ? 'Unlike artist' : 'Like artist'}
          active={starred}
          size={38}
          iconSize={19}
          popOn={starred}
          onPress={() => void setStarred({ id: artistId, kind: 'artist', title: name }, !starred)}
        />
      }
    >
      <Animated.FlatList
        data={albums}
        numColumns={columns}
        keyExtractor={(album) => album.id}
        onScroll={onScroll}
        scrollEventThrottle={16}
        columnWrapperStyle={styles.gridRow}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={
          loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={refresh} /> : <EmptyState label="No albums" />
        }
        renderItem={({ item }) => (
          <AlbumTile
            title={item.name}
            subtitle={item.songCount != null ? pluralize(item.songCount, 'track') : undefined}
            artworkUri={artworkUrl(item.coverArt, 300)}
            size={tile}
            year={item.year}
            onPress={() => navigation.push('Album', { albumId: item.id, albumName: item.name })}
            onLongPress={() => setAlbumTarget(item)}
          />
        )}
        contentContainerStyle={styles.list}
        initialNumToRender={6}
        windowSize={9}
        refreshControl={<RefreshControl {...pull} progressViewOffset={navHeight} />}
      />

      <TrackActionsSheet
        visible={trackTarget != null}
        onClose={() => setTrackTarget(null)}
        song={trackTarget}
        hide={['artist']}
      />
      <AlbumActionsSheet
        visible={albumTarget != null}
        onClose={() => setAlbumTarget(null)}
        album={albumTarget}
        hide={['artist']}
      />
    </DetailScaffold>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: DOCK_CLEARANCE, flexGrow: 1 },
  gridRow: { gap: space[3], paddingHorizontal: layout.screenPadding, marginBottom: space[4] },
  similar: { paddingHorizontal: layout.screenPadding, gap: space[4] },
});
