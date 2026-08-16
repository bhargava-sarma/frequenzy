import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AddToPlaylistSheet } from '../components/AddToPlaylistSheet';
import { AmbientBackground } from '../components/AmbientBackground';
import { Button } from '../components/Button';
import { ListRow } from '../components/ListRow';
import { SectionHeader } from '../components/SectionHeader';
import { Segmented } from '../components/Segmented';
import { Frosted } from '../components/Frosted';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { DOCK_CLEARANCE } from '../components/TabBar';
import { SwipeableRow } from '../components/SwipeableRow';
import { IconHeart, IconHeartFilled, IconPlus, IconX } from '../components/icons';
import { clearRecentSearches, getRecentSearches, recordSearch } from '../data/recentSearches';
import { useArtwork } from '../hooks/useArtwork';
import type { SearchStackParamList } from '../navigation/types';
import { usePlayerStore } from '../store/usePlayerStore';
import { useServerStore } from '../store/useServerStore';
import { hairline, icon, layout, motion, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { AlbumSummary, ArtistSummary, Child } from '../types/subsonic';
import { onSearchRequested } from '../utils/tabEvents';
import { formatDuration } from '../utils/time';

/**
 * Search across tracks, albums and artists.
 *
 * Goes straight to the server rather than through the library cache: search
 * results are a query, not a cacheable entity, and Navidrome already indexes
 * this far better than filtering a cached list in JS would.
 *
 * The three kinds are tabs rather than one stacked list. Stacked, a track
 * match could sit below a dozen artists and albums you weren't looking for,
 * and tracks are what you search for most — so they lead.
 */

type Scope = 'songs' | 'albums' | 'artists';

const SCOPES = [
  { value: 'songs' as const, label: 'Tracks' },
  { value: 'albums' as const, label: 'Albums' },
  { value: 'artists' as const, label: 'Artists' },
];

/** Shown per scope before Load more. */
const FIRST_PAGE = 20;
const PAGE_SIZE = 20;

/**
 * Asked for per scope.
 *
 * Deliberately larger than the first page: paging happens client-side, and a
 * second round trip to reveal rows the server would have sent anyway is worse
 * than one slightly bigger response.
 */
const FETCH_COUNT = 100;

export function SearchScreen() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<NativeStackNavigationProp<SearchStackParamList>>();
  const insets = useSafeAreaInsets();
  const artworkUrl = useArtwork();

  const client = useServerStore((state) => state.client);
  const playTrackNow = usePlayerStore((state) => state.playTrackNow);
  const addToQueue = usePlayerStore((state) => state.addToQueue);

  const inputRef = useRef<TextInput>(null);

  // Raised when the Search tab is tapped while already active.
  useEffect(() => onSearchRequested(() => inputRef.current?.focus()), []);

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('songs');
  const [visible, setVisible] = useState(FIRST_PAGE);
  const [results, setResults] = useState<{
    artists: ArtistSummary[];
    albums: AlbumSummary[];
    songs: Child[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  /** Non-null while the add-to-playlist sheet is open, holding what to add. */
  const [addTargets, setAddTargets] = useState<string[] | null>(null);

  useEffect(() => {
    void getRecentSearches().then(setRecent);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    setVisible(FIRST_PAGE);

    if (!client || trimmed.length === 0) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }

    // Debounced: firing per keystroke would send a request for every prefix
    // of the query and race their responses out of order.
    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(() => {
      client
        .search3(trimmed, {
          artistCount: FETCH_COUNT,
          albumCount: FETCH_COUNT,
          songCount: FETCH_COUNT,
        })
        .then((response) => {
          if (cancelled) return;
          setResults({
            artists: response.searchResult3.artist ?? [],
            albums: response.searchResult3.album ?? [],
            songs: response.searchResult3.song ?? [],
          });
          setError(null);
          // Recorded on a result rather than on a keystroke, so the history
          // holds queries that actually went somewhere.
          void recordSearch(trimmed).then(setRecent);
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, client]);

  // One list of three shapes; renderItem narrows by the active scope.
  const active: (ArtistSummary | AlbumSummary | Child)[] = results?.[scope] ?? [];
  const shown = useMemo(() => active.slice(0, visible), [active, visible]);

  // Reset paging when the scope changes, so switching tabs doesn't inherit a
  // page count from a list that may have been much longer.
  function switchScope(next: Scope) {
    setVisible(FIRST_PAGE);
    setScope(next);
  }

  const hasQuery = query.trim().length > 0;

  /**
   * Favourites are server-side truth, so this writes through and patches the
   * local copy rather than refetching — a search result set is a query, and
   * re-running it to learn one boolean would reshuffle the list under you.
   */
  async function toggleStar(song: Child) {
    if (!client) return;
    const next = song.starred ? undefined : new Date().toISOString();

    setResults((current) =>
      current
        ? {
            ...current,
            songs: current.songs.map((s) => (s.id === song.id ? { ...s, starred: next } : s)),
          }
        : current,
    );

    try {
      if (song.starred) await client.unstar({ id: song.id });
      else await client.star({ id: song.id });
    } catch {
      // Put it back: the row should not claim a favourite the server refused.
      setResults((current) =>
        current
          ? {
              ...current,
              songs: current.songs.map((s) =>
                s.id === song.id ? { ...s, starred: song.starred } : s,
              ),
            }
          : current,
      );
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + space[3] }]}>
      <AmbientBackground />

      {/* Field and scopes share one card, the way the dock joins the
          mini-player to the nav — they are one control for one job. */}
      <View style={styles.searchBar}>
        <Frosted style={styles.card}>
          <View style={styles.inputWrap}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Search your library"
              placeholderTextColor={color.textInverseSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />

            {/* Android has no built-in clear affordance — clearButtonMode is
                iOS-only, which is why the field had no way to be emptied. */}
            {hasQuery && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={space[3]}
                onPress={() => setQuery('')}
                style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
              >
                <IconX
                  size={icon.sizeSmall}
                  strokeWidth={icon.strokeWidth}
                  color={color.textInverseSecondary}
                />
              </Pressable>
            )}
          </View>

          <View style={styles.scopes}>
            <Segmented options={SCOPES} value={scope} onChange={switchScope} surface="panel" />
          </View>
        </Frosted>
      </View>

      {/* Keyed on the scope so switching tabs crossfades the results. */}
      <Animated.View key={scope} style={styles.list} entering={FadeIn.duration(motion.durationBase)}>
      <FlatList
        data={shown}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={shown.length ? styles.listContent : styles.emptyContainer}
        ListEmptyComponent={
          error ? (
            <ErrorState message={error} />
          ) : loading ? (
            <LoadingState label="Searching" />
          ) : hasQuery ? (
            <EmptyState label="No results" hint={`Nothing matched "${query.trim()}".`} />
          ) : recent.length > 0 ? (
            <View>
              <SectionHeader
                title="Recent"
                count={recent.length > 1 ? 'Clear' : undefined}
                onCountPress={() => {
                  void clearRecentSearches();
                  setRecent([]);
                }}
              />
              {recent.map((entry, index) => (
                <ListRow
                  key={entry}
                  title={entry}
                  showArtwork={false}
                  last={index === recent.length - 1}
                  onPress={() => setQuery(entry)}
                />
              ))}
            </View>
          ) : (
            <EmptyState label="Search your library" />
          )
        }
        ListFooterComponent={
          visible < active.length ? (
            <View style={styles.loadMore}>
              <Button
                label={`Load ${Math.min(PAGE_SIZE, active.length - visible)} more`}
                fullWidth
                onPress={() => setVisible((count) => count + PAGE_SIZE)}
              />
            </View>
          ) : (
            <View style={styles.listEnd} />
          )
        }
        renderItem={({ item, index }) => {
          if (scope === 'artists') {
            const artist = item as ArtistSummary;
            return (
              <ListRow
                title={artist.name}
                artworkUri={artworkUrl(artist.coverArt)}
                last={index === shown.length - 1}
                onPress={() =>
                  navigation.navigate('Artist', { artistId: artist.id, artistName: artist.name })
                }
              />
            );
          }

          if (scope === 'albums') {
            const album = item as AlbumSummary;
            return (
              <ListRow
                title={album.name}
                meta={album.artist}
                artworkUri={artworkUrl(album.coverArt)}
                last={index === shown.length - 1}
                onPress={() =>
                  navigation.navigate('Album', { albumId: album.id, albumName: album.name })
                }
              />
            );
          }

          const song = item as Child;
          return (
            // Swipeable like every other track row in the app — search results
            // were the one place a track couldn't be queued by gesture.
            <SwipeableRow
              rightSwipe={{
                icon: <IconPlus size={icon.size} color={color.accentInk} strokeWidth={2} />,
                label: 'Queue',
                onAction: () => void addToQueue([song]),
              }}
              leftSwipe={{
                icon: song.starred ? (
                  <IconHeartFilled size={icon.size} color={color.accentInk} />
                ) : (
                  <IconHeart size={icon.size} color={color.accentInk} strokeWidth={2} />
                ),
                label: song.starred ? 'Unstar' : 'Star',
                onAction: () => void toggleStar(song),
              }}
            >
              <ListRow
                title={song.title}
                meta={[song.artist, song.duration ? formatDuration(song.duration) : null]
                  .filter(Boolean)
                  .join(' · ')}
                artworkUri={artworkUrl(song.coverArt)}
                action="queue"
                last={index === shown.length - 1}
                // Plays this one without discarding whatever is queued.
                onPress={() => void playTrackNow(song)}
                onLongPress={() => setAddTargets([song.id])}
                // The trailing action queues rather than plays, matching the
                // icon and matching what it does everywhere else.
                onActionPress={() => void addToQueue([song])}
              />
            </SwipeableRow>
          );
        }}
      />
      </Animated.View>

      <AddToPlaylistSheet
        visible={addTargets != null}
        onClose={() => setAddTargets(null)}
        songIds={addTargets ?? []}
      />
    </View>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.paper },
    list: { flex: 1 },

    searchBar: { paddingHorizontal: layout.screenPadding, paddingBottom: space[4] },
    card: {
      borderRadius: layout.dockRadius,
      borderWidth: hairline,
      borderColor: color.panelLine,
      overflow: 'hidden',
      padding: space[2],
      gap: space[2],
    },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingRight: space[2],
    },
    input: {
      ...type.body,
      color: color.textInverse,
      flex: 1,
      height: 44,
      paddingHorizontal: space[3],
    },
    clear: { padding: space[1] },
    pressed: { opacity: 0.6 },

    scopes: {},

    listContent: {},
    loadMore: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: space[5],
      paddingBottom: DOCK_CLEARANCE,
    },
    listEnd: { height: DOCK_CLEARANCE },
    emptyContainer: { flexGrow: 1, paddingBottom: DOCK_CLEARANCE },
  });
