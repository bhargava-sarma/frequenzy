import { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AmbientBackground } from '../components/AmbientBackground';
import { ListRow } from '../components/ListRow';
import { ScreenHeader } from '../components/ScreenHeader';
import { SectionHeader } from '../components/SectionHeader';
import { Segmented } from '../components/Segmented';
import { EmptyState, ErrorState, LoadingState } from '../components/ScreenState';
import { Shelf } from '../components/Shelf';
import { DOCK_CLEARANCE } from '../components/TabBar';
import { IconSettings } from '../components/icons';
import { getTopTracks, type ChartWindow, type TopTrack } from '../data/playHistory';
import { useArtwork } from '../hooks/useArtwork';
import { useLibraryData } from '../hooks/useLibraryData';
import type { HomeStackParamList, RootStackParamList } from '../navigation/types';
import { icon, layout, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { AlbumSummary } from '../types/subsonic';
import { pluralize } from '../utils/time';

/**
 * Home — your own charts, then album shelves.
 *
 * Playlists used to live here; they moved to Library, which is where a list
 * you maintain belongs. What's left is everything you don't maintain: what you
 * have been playing, what the server added recently, and a random shelf.
 */

/** How many albums each shelf asks for. Enough to scroll, not enough to stall. */
const SHELF_SIZE = 20;

/**
 * Play-derived orderings reshuffle as you listen, so a day-long TTL would
 * show a "recently played" shelf that's a day out of date. Ten minutes keeps
 * it honest without refetching on every visit.
 */
const SHELF_TTL_MS = 10 * 60 * 1000;

const WINDOWS = [
  { value: 'day' as const, label: 'Day' },
  { value: 'week' as const, label: 'Week' },
  { value: 'month' as const, label: 'Month' },
  { value: 'year' as const, label: 'Year' },
];

export function HomeScreen() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  // Settings lives on the root stack, two navigators up. navigate() bubbles
  // to find it, but the Home stack's types don't know the route exists.
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const artworkUrl = useArtwork();
  const { width } = useWindowDimensions();

  // Two and a half tiles across, so the cut-off third is visibly a hint that
  // the shelf scrolls rather than looking like a short list that ended.
  const tileSize = Math.round((width - layout.screenPadding * 2 - space[3] * 2) / 2.4);

  const {
    data: shelves,
    loading,
    error,
    refresh,
  } = useLibraryData(
    (library, forceRefresh) =>
      Promise.all([
        library.getAlbumsByType('newest', SHELF_SIZE, { forceRefresh }),
        library.getAlbumsByType('recent', SHELF_SIZE, { forceRefresh, ttlMs: SHELF_TTL_MS }),
        library.getAlbumsByType('frequent', SHELF_SIZE, { forceRefresh, ttlMs: SHELF_TTL_MS }),
        library.getAlbumsByType('random', SHELF_SIZE, { forceRefresh }),
      ]).then(([newest, recent, frequent, random]) => ({ newest, recent, frequent, random })),
    [],
  );

  const [chartWindow, setChartWindow] = useState<ChartWindow>('week');
  const [topTracks, setTopTracks] = useState<TopTrack[]>([]);

  const loadCharts = useCallback(() => {
    void getTopTracks(chartWindow, 5).then(setTopTracks);
  }, [chartWindow]);

  /**
   * Reload whenever Home comes back into view.
   *
   * Home lives in a tab navigator and never unmounts, so a mount-only effect
   * ran exactly once per launch — which is why the charts looked broken: plays
   * were being recorded correctly and simply never re-read.
   */
  useFocusEffect(loadCharts);

  function openAlbum(album: AlbumSummary) {
    navigation.navigate('Album', { albumId: album.id, albumName: album.name });
  }

  if (loading && !shelves) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <LoadingState label="Loading library" />
      </View>
    );
  }

  if (error && !shelves) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Lower intensity than the player: this screen is for reading. */}
      <AmbientBackground intensity={0.5} />

      <ScreenHeader
        title="Home"
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={space[3]}
            onPress={() => rootNavigation.navigate('Settings')}
            style={({ pressed }) => (pressed ? styles.pressed : null)}
          >
            <IconSettings
              size={icon.size}
              strokeWidth={icon.strokeWidth}
              color={color.textSecondary}
            />
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading && shelves != null}
            onRefresh={() => {
              refresh();
              loadCharts();
            }}
            tintColor={color.textSecondary}
          />
        }
      >
        <SectionHeader title="Your top tracks" />
        <View style={styles.chartSwitch}>
          <Segmented options={WINDOWS} value={chartWindow} onChange={setChartWindow} />
        </View>

        {topTracks.length === 0 ? (
          <View style={styles.chartEmpty}>
            <Text style={styles.chartHint}>
              Nothing played in this window yet. Counts build as you listen — they come from this
              device rather than from the server, which has no notion of a time window.
            </Text>
          </View>
        ) : (
          topTracks.map((track, index) => (
            <ListRow
              key={track.songId}
              title={track.title}
              // Plays only. The artist is already on the cover beside it, and
              // the one thing a chart row has to say is how often you played it.
              meta={pluralize(track.plays, 'play')}
              artworkUri={artworkUrl(track.coverArt)}
              last={index === topTracks.length - 1}
              // Opens the album rather than playing: a chart is something you
              // read, and a row that starts music on a glance is hostile.
              onPress={
                track.albumId
                  ? () => navigation.navigate('Album', { albumId: track.albumId! })
                  : undefined
              }
            />
          ))
        )}

        {shelves && (
          <>
            <Shelf
              title="Recently added"
              albums={shelves.newest}
              tileSize={tileSize}
              artworkUri={artworkUrl}
              onSelect={openAlbum}
            />
            {/* Both of these stay empty until enough has been scrobbled, and
                Shelf renders nothing rather than a labelled empty strip. */}
            <Shelf
              title="Recently played"
              albums={shelves.recent}
              tileSize={tileSize}
              artworkUri={artworkUrl}
              onSelect={openAlbum}
            />
            <Shelf
              title="Most played"
              albums={shelves.frequent}
              tileSize={tileSize}
              artworkUri={artworkUrl}
              onSelect={openAlbum}
            />
            {/* Rerolls on pull-to-refresh rather than on every render, so it
                works as a shelf you can return to rather than a slot machine. */}
            <Shelf
              title="From the shelf"
              albums={shelves.random}
              tileSize={tileSize}
              artworkUri={artworkUrl}
              onSelect={openAlbum}
            />
          </>
        )}

        {!shelves && topTracks.length === 0 && (
          <EmptyState
            label="Nothing here yet"
            hint="Check that Navidrome has scanned your library."
          />
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.paper },
    content: { paddingBottom: DOCK_CLEARANCE },

    chartSwitch: { paddingHorizontal: layout.screenPadding, paddingBottom: space[4] },
    ambient: { opacity: 0.6 },
    chartEmpty: { paddingHorizontal: layout.screenPadding, paddingBottom: space[4] },
    chartHint: { ...type.meta, color: color.textSecondary, lineHeight: 18 },

    pressed: { opacity: 0.6 },
  });
