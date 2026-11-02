import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ListRenderItem,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useActiveMediaItem, useIsPlaying } from '@rntp/player';

import { AlbumActionsSheet } from '../components/AlbumActionsSheet';
import { AlbumTile } from '../components/AlbumTile';
import { Artwork } from '../components/Artwork';
import { Chip, ChipRow } from '../components/Chip';
import { IconCalendar, IconSearch, IconX } from '../components/icons';
import { Label } from '../components/Label';
import { ListRow } from '../components/ListRow';
import { PressScale } from '../components/Pressable';
import { TabScaffold } from '../components/Scaffold';
import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { SearchField } from '../components/SearchField';
import { SectionHeader } from '../components/SectionHeader';
import { DOCK_CLEARANCE } from '../components/TabBar';
import { MIX_HUES } from '../components/Tiles';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { TrackRow } from '../components/TrackRow';
import { clearRecentSearches, getRecentSearches, recordSearch } from '../data/recentSearches';
import { useArtwork } from '../hooks/useArtwork';
import { useLibraryData } from '../hooks/useLibraryData';
import { trackItemLayout } from '../hooks/usePagedList';
import type { SearchStackParamList } from '../navigation/types';
import { DECADES, EmptyMixError, decadeLabel, playMix } from '../player/mixes';
import { extrasOf } from '../player/trackMapping';
import { usePlayerStore } from '../store/usePlayerStore';
import { useServerStore } from '../store/useServerStore';
import { errorMessage, toast } from '../store/useToastStore';
import { pickInk } from '../theme/color';
import { layout, radius, space, type, withAlpha } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { AlbumSummary, ArtistSummary, Child } from '../types/subsonic';
import { haptics } from '../utils/haptics';
import { onSearchRequested } from '../utils/tabEvents';
import { pluralize } from '../utils/time';

/**
 * Search across tracks, albums and artists.
 *
 * Straight to the server rather than through the library cache: results are
 * a query, not an entity, and Navidrome indexes far better than filtering a
 * cached list in JS. "All" leads with the single best match and a few of
 * each kind; the scopes show everything of one kind.
 *
 * With nothing typed, the screen is a way in rather than a dead end: recent
 * searches, genres to browse, decades to play.
 */

type Scope = 'all' | 'songs' | 'albums' | 'artists';

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'songs', label: 'Tracks' },
  { value: 'albums', label: 'Albums' },
  { value: 'artists', label: 'Artists' },
];

const FETCH_COUNT = 60;
const DEBOUNCE_MS = 280;

interface Results {
  artists: ArtistSummary[];
  albums: AlbumSummary[];
  songs: Child[];
}

export function SearchScreen() {
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<NativeStackNavigationProp<SearchStackParamList>>();
  const artworkUrl = useArtwork();
  const { width } = useWindowDimensions();
  const activeItem = useActiveMediaItem();
  const isPlaying = useIsPlaying();
  const activeId = extrasOf(activeItem)?.subsonicId;

  const client = useServerStore((state) => state.client);
  const playTrackNow = usePlayerStore((state) => state.playTrackNow);
  const addToQueue = usePlayerStore((state) => state.addToQueue);

  const inputRef = useRef<TextInput>(null);
  useEffect(() => onSearchRequested(() => inputRef.current?.focus()), []);

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [trackTarget, setTrackTarget] = useState<Child | null>(null);
  const [albumTarget, setAlbumTarget] = useState<AlbumSummary | null>(null);

  const genres = useLibraryData((library, forceRefresh) => library.getGenres({ forceRefresh }), []);

  useEffect(() => {
    void getRecentSearches().then(setRecent);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!client || trimmed.length === 0) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }

    // Debounced: per keystroke would race a request per prefix.
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      client
        .search3(trimmed, { artistCount: FETCH_COUNT, albumCount: FETCH_COUNT, songCount: FETCH_COUNT })
        .then((response) => {
          if (cancelled) return;
          setResults({
            artists: response.searchResult3.artist ?? [],
            albums: response.searchResult3.album ?? [],
            songs: response.searchResult3.song ?? [],
          });
          setError(null);
          // Recorded on a result, so history holds queries that went somewhere.
          void recordSearch(trimmed).then(setRecent);
        })
        .catch((cause: unknown) => {
          if (!cancelled) setError(errorMessage(cause));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, client]);

  const hasQuery = query.trim().length > 0;
  const songs = results?.songs ?? [];
  const albums = results?.albums ?? [];
  const artists = results?.artists ?? [];
  const total = songs.length + albums.length + artists.length;

  /** The match most likely meant: an exact name, else the first of each kind. */
  const top = useMemo(() => {
    if (!results) return null;
    const needle = query.trim().toLowerCase();
    const artist = artists.find((a) => a.name.toLowerCase() === needle);
    if (artist) return { kind: 'artist' as const, artist };
    const album = albums.find((a) => a.name.toLowerCase() === needle);
    if (album) return { kind: 'album' as const, album };
    const song = songs.find((s) => s.title.toLowerCase() === needle);
    if (song) return { kind: 'song' as const, song };
    if (artists[0]) return { kind: 'artist' as const, artist: artists[0] };
    if (albums[0]) return { kind: 'album' as const, album: albums[0] };
    if (songs[0]) return { kind: 'song' as const, song: songs[0] };
    return null;
  }, [results, query, artists, albums, songs]);

  const handlePlay = useCallback(
    (index: number) => {
      const song = songs[index];
      // One track, without discarding whatever is already queued.
      if (song) void playTrackNow(song).catch((e) => toast.error("Couldn't play", { detail: errorMessage(e) }));
    },
    [songs, playTrackNow],
  );
  const handleQueue = useCallback(
    (song: Child) => {
      void addToQueue([song])
        .then(() => toast.show('Added to queue', { icon: 'queue', detail: song.title }))
        .catch((e) => toast.error("Couldn't queue", { detail: errorMessage(e) }));
    },
    [addToQueue],
  );
  const openArtist = useCallback(
    (artist: ArtistSummary) =>
      navigation.navigate('Artist', { artistId: artist.id, artistName: artist.name }),
    [navigation],
  );
  const openAlbum = useCallback(
    (album: AlbumSummary) => navigation.navigate('Album', { albumId: album.id, albumName: album.name }),
    [navigation],
  );

  const renderSong = useCallback<ListRenderItem<Child>>(
    ({ item, index }) => (
      <TrackRow
        song={item}
        index={index}
        active={item.id === activeId}
        playing={isPlaying}
        last={index === songs.length - 1}
        subtitle="artistAlbum"
        onPlay={handlePlay}
        onMore={setTrackTarget}
        onQueue={handleQueue}
      />
    ),
    [activeId, isPlaying, songs.length, handlePlay, handleQueue],
  );

  const shelfTile = Math.round((width - layout.screenPadding * 2 - space[3] * 2) / 2.6);
  const gridColumns = 2;
  const gridTile = Math.floor((width - layout.screenPadding * 2 - space[3]) / gridColumns);

  // Rendered once, above whichever body is showing, so the text field is
  // never remounted: a field inside the scrolling content would be rebuilt
  // when the first keystroke swaps browse for results, and drop the keyboard.
  const header = (
    <View>
      <ScreenHeader
        eyebrow={hasQuery && results ? `${total} RESULTS` : 'FIND ANYTHING'}
        title="Search"
      />
      <SearchField
        ref={inputRef}
        value={query}
        onChangeText={setQuery}
        placeholder="Artists, albums, tracks"
      />
      {hasQuery && (
        <ChipRow style={styles.scopes}>
          {SCOPES.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={scope === option.value}
              count={
                !results || option.value === 'all'
                  ? undefined
                  : option.value === 'songs'
                    ? songs.length
                    : option.value === 'albums'
                      ? albums.length
                      : artists.length
              }
              onPress={() => setScope(option.value)}
            />
          ))}
        </ChipRow>
      )}
    </View>
  );

  // --- Empty query: browse -------------------------------------------------

  const browse = (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
      {recent.length > 0 && (
        <>
          <SectionHeader
            index="01"
            title="Recent"
            action="Clear"
            onAction={() => {
              void clearRecentSearches();
              setRecent([]);
            }}
            compact
          />
          <ChipRow>
            {recent.map((entry) => (
              <Chip key={entry} label={entry} icon={IconSearch} onPress={() => setQuery(entry)} />
            ))}
          </ChipRow>
        </>
      )}

      <SectionHeader index={recent.length > 0 ? '02' : '01'} title="Decades" compact={recent.length === 0} />
      <ChipRow>
        {DECADES.map((decade) => (
          <Chip
            key={decade}
            label={decadeLabel(decade)}
            icon={IconCalendar}
            onPress={() => {
              const label = `The ${decadeLabel(decade)}`;
              void playMix({ label, fromYear: decade, toYear: decade + 9 })
                .then((count) => toast.show(`Playing ${label}`, { icon: 'radio', detail: pluralize(count, 'track') }))
                .catch((e) =>
                  e instanceof EmptyMixError
                    ? toast.show(e.message, { icon: 'info' })
                    : toast.error("Couldn't start the mix", { detail: errorMessage(e) }),
                );
            }}
          />
        ))}
      </ChipRow>

      <SectionHeader
        index={recent.length > 0 ? '03' : '02'}
        title="Genres"
        detail={genres.data ? `${genres.data.length}` : undefined}
      />
      {genres.loading && !genres.data ? (
        <LoadingState />
      ) : (
        <View style={styles.genres}>
          {(genres.data ?? []).slice(0, 24).map((genre, index) => {
            const hue = MIX_HUES[index % MIX_HUES.length];
            const ink = pickInk(hue);
            return (
              <PressScale
                key={genre.value}
                accessibilityRole="button"
                accessibilityLabel={genre.value}
                onPress={() => {
                  haptics.tick();
                  navigation.navigate('Genre', { genre: genre.value, hue });
                }}
                scaleTo={0.95}
                style={[styles.genre, { width: gridTile, backgroundColor: hue }]}
              >
                <Text style={[type.headline, { color: ink }]} numberOfLines={2}>
                  {genre.value}
                </Text>
                <Label color={withAlpha(ink, 0.7)} size={9.5}>
                  {[
                    genre.albumCount ? pluralize(genre.albumCount, 'album') : null,
                    genre.songCount != null ? pluralize(genre.songCount, 'track') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Label>
              </PressScale>
            );
          })}
        </View>
      )}
    </ScrollView>
  );

  let body: React.ReactNode;

  // --- Results -------------------------------------------------------------

  const empty = error ? (
    <ErrorState message={error} />
  ) : loading && !results ? (
    <LoadingState label="Searching" />
  ) : (
    <EmptyState label="No results" hint={`Nothing matched “${query.trim()}”.`} icon={IconX} />
  );

  if (!hasQuery) {
    body = browse;
  } else if (scope === 'songs') {
    body = (
      <>
        <FlatList
          data={songs}
          keyExtractor={(song) => song.id}
          renderItem={renderSong}
          getItemLayout={trackItemLayout}
          ListEmptyComponent={empty}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          initialNumToRender={12}
          windowSize={9}
        />
      </>
    );
  } else if (scope === 'albums') {
    body = (
      <>
        <FlatList
          key="albums"
          data={albums}
          numColumns={gridColumns}
          keyExtractor={(album) => album.id}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => (
            <AlbumTile
              title={item.name}
              subtitle={item.artist}
              artworkUri={artworkUrl(item.coverArt, 300)}
              size={gridTile}
              year={item.year}
              onPress={() => openAlbum(item)}
              onLongPress={() => setAlbumTarget(item)}
            />
          )}
          ListEmptyComponent={empty}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
        />
      </>
    );
  } else if (scope === 'artists') {
    body = (
      <>
        <FlatList
          key="artists"
          data={artists}
          keyExtractor={(artist) => artist.id}
          getItemLayout={trackItemLayout}
          renderItem={({ item, index }) => (
            <ListRow
              title={item.name}
              subtitle={item.albumCount ? pluralize(item.albumCount, 'album') : undefined}
              artworkUri={artworkUrl(item.coverArt)}
              round
              last={index === artists.length - 1}
              onPress={() => openArtist(item)}
            />
          )}
          ListEmptyComponent={empty}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
        />
      </>
    );
  } else {
    body = (
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {total === 0 ? (
          <View style={styles.emptyWrap}>{empty}</View>
        ) : (
          <>
            {top && (
              <>
                <SectionHeader index="01" title="Top result" compact />
                <TopResult
                  top={top}
                  artworkUrl={artworkUrl}
                  onPress={() => {
                    if (top.kind === 'artist') openArtist(top.artist);
                    else if (top.kind === 'album') openAlbum(top.album);
                    else void playTrackNow(top.song);
                  }}
                  onLongPress={() => {
                    if (top.kind === 'album') setAlbumTarget(top.album);
                    if (top.kind === 'song') setTrackTarget(top.song);
                  }}
                />
              </>
            )}
            {songs.length > 0 && (
              <>
                <SectionHeader
                  index="02"
                  title="Tracks"
                  action={songs.length > 5 ? `All ${songs.length}` : undefined}
                  onAction={() => setScope('songs')}
                />
                {songs.slice(0, 5).map((song, index) => (
                  <TrackRow
                    key={song.id}
                    song={song}
                    index={index}
                    active={song.id === activeId}
                    playing={isPlaying}
                    last={index === Math.min(5, songs.length) - 1}
                    subtitle="artistAlbum"
                    onPlay={handlePlay}
                    onMore={setTrackTarget}
                    onQueue={handleQueue}
                  />
                ))}
              </>
            )}
            {albums.length > 0 && (
              <>
                <SectionHeader
                  index="03"
                  title="Albums"
                  action={albums.length > 6 ? `All ${albums.length}` : undefined}
                  onAction={() => setScope('albums')}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                  {albums.slice(0, 12).map((album) => (
                    <AlbumTile
                      key={album.id}
                      title={album.name}
                      subtitle={album.artist}
                      artworkUri={artworkUrl(album.coverArt, 300)}
                      size={shelfTile}
                      onPress={() => openAlbum(album)}
                      onLongPress={() => setAlbumTarget(album)}
                    />
                  ))}
                </ScrollView>
              </>
            )}
            {artists.length > 0 && (
              <>
                <SectionHeader
                  index="04"
                  title="Artists"
                  action={artists.length > 6 ? `All ${artists.length}` : undefined}
                  onAction={() => setScope('artists')}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                  {artists.slice(0, 12).map((artist) => (
                    <AlbumTile
                      key={artist.id}
                      title={artist.name}
                      subtitle={artist.albumCount ? pluralize(artist.albumCount, 'album') : undefined}
                      artworkUri={artworkUrl(artist.coverArt, 300)}
                      size={Math.round(shelfTile * 0.82)}
                      round
                      onPress={() => openArtist(artist)}
                    />
                  ))}
                </ScrollView>
              </>
            )}
          </>
        )}
      </ScrollView>
    );
  }

  return (
    <TabScaffold>
      {header}
      <View style={styles.body}>{body}</View>
      <TrackActionsSheet visible={trackTarget != null} onClose={() => setTrackTarget(null)} song={trackTarget} />
      <AlbumActionsSheet visible={albumTarget != null} onClose={() => setAlbumTarget(null)} album={albumTarget} />
    </TabScaffold>
  );
}

type Top =
  | { kind: 'artist'; artist: ArtistSummary }
  | { kind: 'album'; album: AlbumSummary }
  | { kind: 'song'; song: Child };

function TopResult({
  top,
  artworkUrl,
  onPress,
  onLongPress,
}: {
  top: Top;
  artworkUrl: (id?: string | null, size?: number) => string | undefined;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const cover =
    top.kind === 'artist' ? top.artist.coverArt : top.kind === 'album' ? top.album.coverArt : top.song.coverArt;
  const title = top.kind === 'artist' ? top.artist.name : top.kind === 'album' ? top.album.name : top.song.title;
  const kind = top.kind === 'artist' ? 'Artist' : top.kind === 'album' ? 'Album' : 'Track';
  const detail =
    top.kind === 'artist'
      ? top.artist.albumCount
        ? pluralize(top.artist.albumCount, 'album')
        : ''
      : top.kind === 'album'
        ? [top.album.artist, top.album.year].filter(Boolean).join(' · ')
        : [top.song.artist, top.song.album].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${kind}: ${title}`}
      onPress={() => {
        haptics.tick();
        onPress();
      }}
      onLongPress={() => {
        haptics.heavy();
        onLongPress();
      }}
      style={({ pressed }) => [styles.top, pressed && { opacity: 0.8 }]}
    >
      <Artwork uri={artworkUrl(cover, 300)} size={84} round={top.kind === 'artist'} shadow={false} />
      <View style={styles.topText}>
        <Label tone="accent" bold>
          {kind}
        </Label>
        <Text style={[type.title2, { color: color.label }]} numberOfLines={2}>
          {title}
        </Text>
        {detail ? (
          <Text style={[type.subhead, { color: color.labelSecondary }]} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    body: { flex: 1 },
    scroll: { paddingBottom: DOCK_CLEARANCE },
    list: { paddingBottom: DOCK_CLEARANCE, flexGrow: 1 },
    scopes: { marginBottom: space[2] },
    genres: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[3],
      paddingHorizontal: layout.screenPadding,
    },
    genre: {
      height: 92,
      borderRadius: radius.lg,
      padding: space[3],
      justifyContent: 'space-between',
    },
    gridRow: { gap: space[3], paddingHorizontal: layout.screenPadding, marginBottom: space[4] },
    row: { paddingHorizontal: layout.screenPadding, gap: space[3] },
    emptyWrap: { minHeight: 320 },
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[4],
      marginHorizontal: layout.screenPadding,
      padding: space[3],
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: color.separator,
      backgroundColor: color.surface,
    },
    topText: { flex: 1, gap: 3 },
  });
