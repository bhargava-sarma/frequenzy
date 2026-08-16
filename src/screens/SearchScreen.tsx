import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Button } from '../components/Button';
import { ListRow } from '../components/ListRow';
import { Segmented } from '../components/Segmented';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { DOCK_CLEARANCE } from '../components/TabBar';
import { IconX } from '../components/icons';
import { useArtwork } from '../hooks/useArtwork';
import type { SearchStackParamList } from '../navigation/types';
import { usePlayerStore } from '../store/usePlayerStore';
import { useServerStore } from '../store/useServerStore';
import { hairline, icon, layout, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { AlbumSummary, ArtistSummary, Child } from '../types/subsonic';
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
  const playNow = usePlayerStore((state) => state.playNow);
  const addToQueue = usePlayerStore((state) => state.addToQueue);

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

  return (
    <View style={[styles.root, { paddingTop: insets.top + space[3] }]}>
      {/* Field and scopes share one card, the way the dock joins the
          mini-player to the nav — they are one control for one job. */}
      <View style={styles.searchBar}>
        <View style={styles.card}>
          <View style={styles.inputWrap}>
            <TextInput
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
        </View>
      </View>

      <FlatList
        data={shown}
        key={scope}
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
            <ListRow
              title={song.title}
              meta={[song.artist, song.duration ? formatDuration(song.duration) : null]
                .filter(Boolean)
                .join(' · ')}
              artworkUri={artworkUrl(song.coverArt)}
              action="queue"
              last={index === shown.length - 1}
              onPress={() => void playNow([song])}
              // The trailing action queues rather than plays, matching the
              // icon and matching what it does everywhere else.
              onActionPress={() => void addToQueue([song])}
            />
          );
        }}
      />
    </View>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.paper },

    searchBar: { paddingHorizontal: layout.screenPadding, paddingBottom: space[4] },
    card: {
      backgroundColor: color.panel,
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
    emptyContainer: { flexGrow: 1 },
  });
