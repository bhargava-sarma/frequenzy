import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useActiveMediaItem, useIsPlaying } from '@rntp/player';

import { AlbumActionsSheet } from '../components/AlbumActionsSheet';
import { IconButton } from '../components/IconButton';
import {
  IconArrowsShuffle,
  IconChartBar,
  IconHeart,
  IconHistory,
  IconSettings,
} from '../components/icons';
import { Label } from '../components/Label';
import { ListRow } from '../components/ListRow';
import { Panel } from '../components/Panel';
import { StatTile } from '../components/Readouts';
import { TabScaffold } from '../components/Scaffold';
import { ScreenHeader } from '../components/ScreenHeader';
import { ErrorState, LoadingState } from '../components/ScreenState';
import { SectionHeader } from '../components/SectionHeader';
import { Segmented } from '../components/Segmented';
import { Shelf } from '../components/Shelf';
import { DOCK_CLEARANCE } from '../components/TabBar';
import { MIX_HUES, MixCard, QuickKey } from '../components/Tiles';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import {
  getListeningStats,
  getPlaysToday,
  onPlayHistoryChanged,
  type ChartWindow,
  type ListeningStats,
  type TopTrack,
} from '../data/playHistory';
import { useArtwork } from '../hooks/useArtwork';
import { useLibraryData } from '../hooks/useLibraryData';
import { LIKED_PLAYLIST_ID, type HomeStackParamList, type RootStackParamList } from '../navigation/types';
import { DECADES, EmptyMixError, decadeLabel, playMix, shuffleLibrary } from '../player/mixes';
import { extrasOf } from '../player/trackMapping';
import { usePlaylistStore } from '../store/usePlaylistStore';
import { useServerStore } from '../store/useServerStore';
import { errorMessage, toast } from '../store/useToastStore';
import { layout, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeProvider';
import type { AlbumSummary, Child } from '../types/subsonic';
import { formatEyebrowDate, formatListening, greeting, pluralize } from '../utils/time';

/**
 * Home — the front panel.
 *
 * Read top to bottom like a device: a few readouts (what you've played,
 * how long, how many days running), a bank of function keys, generated
 * mixes as coloured cards, your chart, then shelves of albums in the
 * orderings only the server knows.
 */

const SHELF_SIZE = 20;
/** Play-derived orderings reshuffle as you listen; a day's TTL would lie. */
const SHELF_TTL_MS = 10 * 60 * 1000;

const WINDOWS = [
  { value: 'day' as const, label: 'Day' },
  { value: 'week' as const, label: 'Week' },
  { value: 'month' as const, label: 'Month' },
  { value: 'year' as const, label: 'Year' },
];

/** Decades offered as mixes; ones the library lacks just say so when pressed. */
const MIX_DECADES = DECADES.filter((decade) => decade >= 1970);

export function HomeScreen() {
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const artworkUrl = useArtwork();
  const { width } = useWindowDimensions();
  const activeItem = useActiveMediaItem();
  const isPlaying = useIsPlaying();
  const activeId = extrasOf(activeItem)?.subsonicId;
  const info = useServerStore((state) => state.info);

  const tileSize = Math.round((width - layout.screenPadding * 2 - space[3] * 2) / 2.35);
  const mixWidth = Math.round((width - layout.screenPadding * 2 - space[3] * 2) / 2.5);

  const shelves = useLibraryData(
    (library, forceRefresh) =>
      Promise.all([
        library.getAlbumsByType('newest', SHELF_SIZE, { forceRefresh }),
        library.getAlbumsByType('recent', SHELF_SIZE, { forceRefresh, ttlMs: SHELF_TTL_MS }),
        library.getAlbumsByType('frequent', SHELF_SIZE, { forceRefresh, ttlMs: SHELF_TTL_MS }),
      ]).then(([newest, recent, frequent]) => ({ newest, recent, frequent })),
    [],
  );
  // Separate so the reroll key reshuffles only this shelf.
  const random = useLibraryData(
    (library, forceRefresh) => library.getAlbumsByType('random', SHELF_SIZE, { forceRefresh }),
    [],
  );
  const genres = useLibraryData((library, forceRefresh) => library.getGenres({ forceRefresh }), []);

  const playlists = usePlaylistStore((state) => state.playlists);
  const loadPlaylists = usePlaylistStore((state) => state.load);
  const likedCount = playlists.find((p) => p.id === LIKED_PLAYLIST_ID)?.songCount;

  const [stats, setStats] = useState<ListeningStats | null>(null);
  const [today, setToday] = useState(0);
  const [chartWindow, setChartWindow] = useState<ChartWindow>('week');
  const [chart, setChart] = useState<TopTrack[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [albumTarget, setAlbumTarget] = useState<AlbumSummary | null>(null);
  const [trackTarget, setTrackTarget] = useState<Child | null>(null);

  useEffect(() => {
    void loadPlaylists();
  }, [loadPlaylists]);

  const loadStats = useCallback(() => {
    void getListeningStats('week', { top: 1 }).then(setStats);
    void getPlaysToday().then(setToday);
  }, []);

  const loadChart = useCallback(() => {
    void getListeningStats(chartWindow, { top: 5 }).then((result) => setChart(result.topTracks));
  }, [chartWindow]);

  /**
   * Re-read whenever Home comes into view, and whenever a play is logged
   * while it is. Home lives in a tab and never unmounts, so a mount-only
   * read showed the numbers from launch forever.
   */
  useFocusEffect(
    useCallback(() => {
      loadStats();
      loadChart();
      return onPlayHistoryChanged(() => {
        loadStats();
        loadChart();
      });
    }, [loadStats, loadChart]),
  );

  const refresh = useCallback(() => {
    shelves.refresh();
    random.refresh();
    genres.refresh();
    void loadPlaylists();
    loadStats();
    loadChart();
  }, [shelves, random, genres, loadPlaylists, loadStats, loadChart]);

  const openAlbum = useCallback(
    (album: AlbumSummary) => navigation.navigate('Album', { albumId: album.id, albumName: album.name }),
    [navigation],
  );

  async function startMix(key: string, start: () => Promise<number>, label: string) {
    if (busy) return;
    setBusy(key);
    try {
      const count = await start();
      toast.show(`Playing ${label}`, { icon: 'radio', detail: pluralize(count, 'track') });
    } catch (error) {
      if (error instanceof EmptyMixError) toast.show(error.message, { icon: 'info' });
      else toast.error("Couldn't start the mix", { detail: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  const mixes = useMemo(() => {
    const fromGenres = (genres.data ?? []).slice(0, 5).map((genre) => ({
      key: `g:${genre.value}`,
      title: genre.value,
      caption: genre.songCount != null ? `${genre.songCount} tracks` : 'Genre',
      start: () => playMix({ label: genre.value, genre: genre.value }),
    }));
    const fromDecades = MIX_DECADES.slice(-4)
      .reverse()
      .map((decade) => ({
        key: `d:${decade}`,
        title: `The ${decadeLabel(decade)}`,
        caption: `${decade}–${decade + 9}`,
        start: () =>
          playMix({ label: `The ${decadeLabel(decade)}`, fromYear: decade, toYear: decade + 9 }),
      }));
    return [
      {
        key: 'discover',
        title: 'Discover',
        caption: 'At random',
        start: () => playMix({ label: 'Discover', size: 100 }),
      },
      ...fromGenres,
      ...fromDecades,
    ];
  }, [genres.data]);

  const [listenValue, listenUnit] = formatListening(stats?.seconds ?? 0);
  const loadingFirst = shelves.loading && !shelves.data;

  return (
    <TabScaffold>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={shelves.loading && shelves.data != null} onRefresh={refresh} />
        }
      >
        <ScreenHeader
          eyebrow={formatEyebrowDate()}
          title={greeting()}
          hero
          trailing={
            <IconButton
              icon={IconSettings}
              accessibilityLabel="Settings"
              variant="surface"
              onPress={() => rootNavigation.navigate('Settings')}
            />
          }
        />

        <View style={styles.stats}>
          <StatTile label="Today" value={String(today)} unit={today === 1 ? 'PLAY' : 'PLAYS'} />
          <StatTile label="7 days" value={listenValue} unit={listenUnit} />
          <StatTile
            label="Streak"
            value={String(stats?.streak ?? 0)}
            unit={(stats?.streak ?? 0) === 1 ? 'DAY' : 'DAYS'}
            accent={(stats?.streak ?? 0) >= 3}
          />
        </View>

        <View style={styles.keys}>
          <View style={styles.keyRow}>
            <QuickKey
              icon={IconArrowsShuffle}
              label="Shuffle all"
              caption="Whole library"
              primary
              busy={busy === 'all'}
              onPress={() => void startMix('all', shuffleLibrary, 'everything on shuffle')}
            />
            <QuickKey
              icon={IconHeart}
              label="Liked"
              caption={likedCount != null ? pluralize(likedCount, 'track') : 'Favourites'}
              onPress={() =>
                navigation.navigate('Playlist', { playlistId: LIKED_PLAYLIST_ID, playlistName: 'Liked songs' })
              }
            />
          </View>
          <View style={styles.keyRow}>
            <QuickKey
              icon={IconHistory}
              label="History"
              caption="Recently played"
              onPress={() => navigation.navigate('History')}
            />
            <QuickKey
              icon={IconChartBar}
              label="Stats"
              caption={stats ? `${stats.plays} plays this week` : 'Listening'}
              onPress={() => navigation.navigate('Stats')}
            />
          </View>
        </View>

        <SectionHeader index="01" title="Mixes" detail={`${mixes.length} READY`} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mixes}
        >
          {mixes.map((mix, index) => (
            <MixCard
              key={mix.key}
              index={index + 1}
              title={mix.title}
              caption={busy === mix.key ? 'Building…' : mix.caption}
              hue={MIX_HUES[index % MIX_HUES.length]}
              width={mixWidth}
              onPress={() => void startMix(mix.key, mix.start, mix.title)}
            />
          ))}
        </ScrollView>

        <SectionHeader
          index="02"
          title="Your chart"
          action="Stats"
          onAction={() => navigation.navigate('Stats')}
        />
        <Panel padded={false} style={styles.chart}>
          <View style={styles.chartSwitch}>
            <Segmented options={WINDOWS} value={chartWindow} onChange={setChartWindow} size="sm" />
          </View>
          {chart.length === 0 ? (
            <View style={styles.chartEmpty}>
              <Text style={styles.chartHint}>
                Nothing played {chartWindow === 'day' ? 'today' : `this ${chartWindow}`} yet.
              </Text>
            </View>
          ) : (
            chart.map((track, index) => {
              const song: Child = {
                id: track.songId,
                isDir: false,
                title: track.title,
                artist: track.artist,
                albumId: track.albumId,
                coverArt: track.coverArt,
              };
              return (
                <ListRow
                  key={track.songId}
                  rank={index + 1}
                  title={track.title}
                  subtitle={track.artist}
                  artworkUri={artworkUrl(track.coverArt)}
                  active={track.songId === activeId}
                  playing={isPlaying}
                  trailingText={`${track.plays}×`}
                  last={index === chart.length - 1}
                  onPress={() =>
                    track.albumId
                      ? navigation.navigate('Album', { albumId: track.albumId })
                      : setTrackTarget(song)
                  }
                  onLongPress={() => setTrackTarget(song)}
                  onMore={() => setTrackTarget(song)}
                />
              );
            })
          )}
        </Panel>

        {loadingFirst && <LoadingState label="Loading library" />}
        {shelves.error && !shelves.data && <ErrorState message={shelves.error} onRetry={shelves.refresh} />}

        {shelves.data && (
          <>
            <Shelf
              index="03"
              title="Recently added"
              albums={shelves.data.newest}
              tileSize={tileSize}
              artworkUri={artworkUrl}
              onSelect={openAlbum}
              onLongPress={setAlbumTarget}
              showYear
            />
            <Shelf
              index="04"
              title="Recently played"
              albums={shelves.data.recent}
              tileSize={tileSize}
              artworkUri={artworkUrl}
              onSelect={openAlbum}
              onLongPress={setAlbumTarget}
            />
            <Shelf
              index="05"
              title="Most played"
              albums={shelves.data.frequent}
              tileSize={tileSize}
              artworkUri={artworkUrl}
              onSelect={openAlbum}
              onLongPress={setAlbumTarget}
            />
          </>
        )}
        {random.data && (
          <Shelf
            index="06"
            title="From the shelf"
            albums={random.data}
            tileSize={tileSize}
            artworkUri={artworkUrl}
            onSelect={openAlbum}
            onLongPress={setAlbumTarget}
            action="Reroll"
            onAction={random.refresh}
            showYear
          />
        )}

        <View style={styles.footer}>
          <Label tone="tertiary" size={9.5}>
            {[
              'FQ-1',
              // The build hash Navidrome appends in brackets is noise here.
              info?.type ? `${info.type} ${(info.version ?? '').replace(/\s*\(.*\)$/, '')}`.trim() : null,
              'lossless',
            ]
              .filter(Boolean)
              .join(' · ')}
          </Label>
        </View>
      </ScrollView>

      <AlbumActionsSheet
        visible={albumTarget != null}
        onClose={() => setAlbumTarget(null)}
        album={albumTarget}
      />
      <TrackActionsSheet
        visible={trackTarget != null}
        onClose={() => setTrackTarget(null)}
        song={trackTarget}
      />
    </TabScaffold>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    content: { paddingBottom: DOCK_CLEARANCE },
    stats: {
      flexDirection: 'row',
      gap: space[2],
      paddingHorizontal: layout.screenPadding,
      marginTop: space[3],
    },
    keys: { paddingHorizontal: layout.screenPadding, marginTop: space[3], gap: space[2] },
    keyRow: { flexDirection: 'row', gap: space[2] },
    mixes: { paddingHorizontal: layout.screenPadding, gap: space[3] },
    chart: { marginHorizontal: layout.screenPadding },
    chartSwitch: { padding: space[3], paddingBottom: space[2] },
    chartEmpty: { paddingHorizontal: space[4], paddingBottom: space[4], paddingTop: space[2] },
    chartHint: { ...type.footnote, color: color.labelSecondary },
    footer: { alignItems: 'center', paddingTop: space[8] },
  });
