import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useActiveMediaItem, useIsPlaying } from '@rntp/player';

import { AlbumActionsSheet } from '../components/AlbumActionsSheet';
import { AlbumTile } from '../components/AlbumTile';
import { useCollapsingHeader } from '../components/CollapsingHeader';
import { DetailHero } from '../components/DetailHero';
import { IconArrowsShuffle, IconDice5 } from '../components/icons';
import { Keycap, KeyRow } from '../components/Keycap';
import { Label } from '../components/Label';
import { DetailScaffold } from '../components/Scaffold';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { SectionHeader } from '../components/SectionHeader';
import { DOCK_CLEARANCE } from '../components/TabBar';
import { MIX_HUES } from '../components/Tiles';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import { useArtwork } from '../hooks/useArtwork';
import { useLibraryData } from '../hooks/useLibraryData';
import type { AnyStackParamList } from '../navigation/types';
import { EmptyMixError, playGenre, playMix } from '../player/mixes';
import { extrasOf } from '../player/trackMapping';
import { usePlayerStore } from '../store/usePlayerStore';
import { useServerStore } from '../store/useServerStore';
import { errorMessage, toast } from '../store/useToastStore';
import { pickInk } from '../theme/color';
import { fontFamily, layout, radius, space, withAlpha } from '../theme/tokens';
import type { AlbumSummary, Child } from '../types/subsonic';
import { pluralize } from '../utils/time';

/**
 * A genre: its albums as a grid, a handful of its tracks, and two ways to
 * hear it — everything in it shuffled, or a random cut.
 */
const SAMPLE_TRACKS = 8;

function hashOf(genre: string): number {
  let hash = 0;
  for (let i = 0; i < genre.length; i++) hash = (hash * 31 + genre.charCodeAt(i)) >>> 0;
  return hash;
}

/**
 * Two letters for the block, like an element on a chart: initials of the
 * first two words ("Hip Hop" → HH), else the first two letters ("Blues" →
 * BL). Only plain Latin goes in the dot-matrix face; anything else is set
 * in the text face, which has the glyphs.
 */
function monogramOf(genre: string): { text: string; dot: boolean } {
  const words = genre.split(/[\s\-_/&+,.;:]+/).filter(Boolean);
  const raw =
    words.length >= 2 ? [...words[0]][0] + [...words[1]][0] : [...(words[0] ?? genre)].slice(0, 2).join('');
  const text = raw.toUpperCase();
  return { text, dot: /^[A-Z0-9]+$/.test(text) };
}

export function GenreScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AnyStackParamList>>();
  const route = useRoute<RouteProp<AnyStackParamList, 'Genre'>>();
  const { genre, hue: tappedHue } = route.params;
  const artworkUrl = useArtwork();
  const { width } = useWindowDimensions();
  const { onScroll, progress } = useCollapsingHeader();

  const client = useServerStore((state) => state.client);
  const playNow = usePlayerStore((state) => state.playNow);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const activeItem = useActiveMediaItem();
  const isPlaying = useIsPlaying();
  const activeId = extrasOf(activeItem)?.subsonicId;

  const albums = useLibraryData((repo, forceRefresh) => repo.getAlbumsByGenre(genre, { forceRefresh }), [genre]);
  const [songs, setSongs] = useState<Child[]>([]);
  const [busy, setBusy] = useState<'shuffle' | 'mix' | null>(null);
  const [trackTarget, setTrackTarget] = useState<Child | null>(null);
  const [albumTarget, setAlbumTarget] = useState<AlbumSummary | null>(null);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    client
      .getSongsByGenre(genre, { count: SAMPLE_TRACKS })
      .then((response) => {
        if (!cancelled) setSongs(response.songsByGenre?.song ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client, genre]);

  const sorted = useMemo(
    () => [...(albums.data ?? [])].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)),
    [albums.data],
  );

  async function run(kind: 'shuffle' | 'mix') {
    if (busy) return;
    setBusy(kind);
    try {
      const count =
        kind === 'shuffle' ? await playGenre(genre) : await playMix({ label: `${genre} mix`, genre, size: 60 });
      toast.show(kind === 'shuffle' ? `Shuffling ${genre}` : `Playing a ${genre} mix`, {
        icon: 'radio',
        detail: pluralize(count, 'track'),
      });
    } catch (cause) {
      if (cause instanceof EmptyMixError) toast.show(cause.message, { icon: 'info' });
      else toast.error("Couldn't start playback", { detail: errorMessage(cause) });
    } finally {
      setBusy(null);
    }
  }

  const playSample = useCallback(
    (index: number) => void playNow(songs, index, { kind: 'genre', label: genre }),
    [playNow, songs, genre],
  );
  const queue = useCallback(
    (song: Child) =>
      void addToQueue([song]).then(() => toast.show('Added to queue', { icon: 'queue', detail: song.title })),
    [addToQueue],
  );

  const hash = hashOf(genre);
  const hue = tappedHue ?? MIX_HUES[hash % MIX_HUES.length];
  const ink = pickInk(hue);
  const monogram = monogramOf(genre);
  const columns = 2;
  const tile = Math.floor((width - layout.screenPadding * 2 - space[3] * (columns - 1)) / columns);
  const artSize = Math.min(232, Math.round(width * 0.58));
  const totalTracks = sorted.reduce((sum, album) => sum + (album.songCount ?? 0), 0);

  const header = (
    <View>
      <DetailHero
        eyebrow="Genre"
        title={genre}
        meta={
          sorted.length > 0
            ? [pluralize(sorted.length, 'album'), totalTracks ? pluralize(totalTracks, 'track') : null]
                .filter(Boolean)
                .join('  ·  ')
            : undefined
        }
        art={
          <View style={[styles.block, { width: artSize, height: artSize, backgroundColor: hue }]}>
            <Label color={withAlpha(ink, 0.7)} bold>
              {`No. ${String(hash % 100).padStart(2, '0')}`}
            </Label>
            <Text
              style={[
                monogram.dot ? styles.monogramDot : styles.monogramText,
                { color: ink, fontSize: Math.round(artSize * (monogram.dot ? 0.5 : 0.4)) },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {monogram.text}
            </Text>
          </View>
        }
        actions={
          <KeyRow>
            <Keycap
              icon={IconArrowsShuffle}
              label="Shuffle all"
              variant="primary"
              flex
              busy={busy === 'shuffle'}
              onPress={() => void run('shuffle')}
            />
            <Keycap icon={IconDice5} label="Random mix" flex busy={busy === 'mix'} onPress={() => void run('mix')} />
          </KeyRow>
        }
      />
      {songs.length > 0 && (
        <>
          <SectionHeader index="01" title="Tracks" />
          {songs.map((song, index) => (
            <TrackRow
              key={song.id}
              song={song}
              index={index}
              active={song.id === activeId}
              playing={isPlaying}
              last={index === songs.length - 1}
              subtitle="artistAlbum"
              onPlay={playSample}
              onMore={setTrackTarget}
              onQueue={queue}
            />
          ))}
        </>
      )}
      {sorted.length > 0 && <SectionHeader index={songs.length > 0 ? '02' : '01'} title="Albums" />}
    </View>
  );

  return (
    <DetailScaffold title={genre} progress={progress} onBack={() => navigation.goBack()}>
      <Animated.FlatList
        data={sorted}
        numColumns={columns}
        keyExtractor={(album) => album.id}
        onScroll={onScroll}
        scrollEventThrottle={16}
        columnWrapperStyle={styles.gridRow}
        ListHeaderComponent={header}
        ListEmptyComponent={
          albums.loading ? (
            <LoadingState />
          ) : albums.error ? (
            <ErrorState message={albums.error} onRetry={albums.refresh} />
          ) : (
            <EmptyState label="No albums" />
          )
        }
        renderItem={({ item }) => (
          <AlbumTile
            title={item.name}
            subtitle={item.artist}
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
      />
      <TrackActionsSheet visible={trackTarget != null} onClose={() => setTrackTarget(null)} song={trackTarget} />
      <AlbumActionsSheet visible={albumTarget != null} onClose={() => setAlbumTarget(null)} album={albumTarget} />
    </DetailScaffold>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: DOCK_CLEARANCE, flexGrow: 1 },
  gridRow: { gap: space[3], paddingHorizontal: layout.screenPadding, marginBottom: space[4] },
  block: { borderRadius: radius.lg, padding: space[4], justifyContent: 'space-between' },
  monogramDot: { fontFamily: fontFamily.dot, letterSpacing: 2 },
  monogramText: { fontFamily: fontFamily.bold, letterSpacing: -1 },
});
