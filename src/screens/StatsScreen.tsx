import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AlbumTile } from '../components/AlbumTile';
import { Chip, ChipRow } from '../components/Chip';
import { useCollapsingHeader, useNavBarHeight } from '../components/CollapsingHeader';
import { Display } from '../components/Display';
import { IconChartBar } from '../components/icons';
import { Label } from '../components/Label';
import { ListRow } from '../components/ListRow';
import { BarChart, StatTile } from '../components/Readouts';
import { DetailScaffold } from '../components/Scaffold';
import { EmptyState, LoadingState } from '../components/ScreenState';
import { SectionHeader } from '../components/SectionHeader';
import { DOCK_CLEARANCE } from '../components/TabBar';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import {
  getListeningStats,
  onPlayHistoryChanged,
  type ChartWindow,
  type ListeningStats,
} from '../data/playHistory';
import { useArtwork } from '../hooks/useArtwork';
import type { AnyStackParamList } from '../navigation/types';
import { playOutline } from '../player/mixes';
import { toast } from '../store/useToastStore';
import { layout, radius, space, type } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import type { Child } from '../types/subsonic';
import { formatDate, formatListening, pluralize } from '../utils/time';

/**
 * Listening, measured: totals on the display, your hours and days as level
 * meters, and the artists, albums and tracks you come back to.
 *
 * Built from this device's play log — the honest limit of a Subsonic client,
 * which has no server endpoint for windowed charts.
 */
const WINDOWS: { value: ChartWindow; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All time' },
];

const HOUR_LABELS: Record<number, string> = { 0: '00', 6: '06', 12: '12', 18: '18', 23: '23' };
const DAY_LABELS: Record<number, string> = { 0: 'M', 1: 'T', 2: 'W', 3: 'T', 4: 'F', 5: 'S', 6: 'S' };

export function StatsScreen() {
  const color = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<AnyStackParamList>>();
  const artworkUrl = useArtwork();
  const navHeight = useNavBarHeight();
  const { width } = useWindowDimensions();
  const { onScroll, progress } = useCollapsingHeader(30, 80);

  const [range, setRange] = useState<ChartWindow>('month');
  const [stats, setStats] = useState<ListeningStats | null>(null);
  const [trackTarget, setTrackTarget] = useState<Child | null>(null);

  const load = useCallback(() => {
    void getListeningStats(range, { top: 10 }).then(setStats);
  }, [range]);

  useEffect(() => {
    load();
    return onPlayHistoryChanged(load);
  }, [load]);

  const [hours, hoursUnit] = formatListening(stats?.seconds ?? 0);
  const albumTile = Math.round((width - layout.screenPadding * 2 - space[3] * 2) / 2.6);
  const busiestHour = stats ? stats.byHour.indexOf(Math.max(...stats.byHour)) : -1;
  const empty = stats != null && stats.plays === 0;

  return (
    <DetailScaffold title="Stats" progress={progress} onBack={() => navigation.goBack()}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { paddingTop: navHeight + space[3] }]}>
          <Label tone="tertiary">
            {stats?.firstPlayAt ? `COUNTING SINCE ${formatDate(stats.firstPlayAt).toUpperCase()}` : 'LISTENING'}
          </Label>
          <Text style={[type.largeTitle, { color: color.label }]}>Stats</Text>
        </View>

        <ChipRow style={styles.windows}>
          {WINDOWS.map((option) => (
            <Chip key={option.value} label={option.label} selected={range === option.value} onPress={() => setRange(option.value)} />
          ))}
        </ChipRow>

        {stats == null ? (
          <LoadingState />
        ) : (
          <>
            <View style={styles.grid}>
              <View style={styles.gridRow}>
                <StatTile label="Plays" value={String(stats.plays)} />
                <StatTile label="Listened" value={hours} unit={hoursUnit} accent />
              </View>
              <View style={styles.gridRow}>
                <StatTile label="Tracks" value={String(stats.uniqueTracks)} />
                <StatTile label="Artists" value={String(stats.uniqueArtists)} />
              </View>
              <View style={styles.gridRow}>
                <StatTile label="Streak" value={String(stats.streak)} unit={stats.streak === 1 ? 'DAY' : 'DAYS'} />
                <StatTile label="Best run" value={String(stats.longestStreak)} unit={stats.longestStreak === 1 ? 'DAY' : 'DAYS'} />
              </View>
            </View>

            {empty ? (
              <EmptyState
                icon={IconChartBar}
                label="No plays in this window"
                hint="A track counts once it has played past halfway, or four minutes."
              />
            ) : (
              <>
                <SectionHeader index="01" title="Time of day" detail={busiestHour >= 0 ? `PEAK ${String(busiestHour).padStart(2, '0')}:00` : undefined} />
                <Display style={styles.chart} radius={radius.lg}>
                  <BarChart values={stats.byHour} labels={HOUR_LABELS} height={96} />
                </Display>

                <SectionHeader index="02" title="Day of week" />
                <Display style={styles.chart} radius={radius.lg}>
                  <BarChart values={stats.byWeekday} labels={DAY_LABELS} height={72} />
                </Display>

                {stats.topArtists.length > 0 && (
                  <>
                    <SectionHeader index="03" title="Top artists" />
                    {stats.topArtists.map((artist, index) => (
                      <ListRow
                        key={artist.key}
                        rank={index + 1}
                        title={artist.name}
                        subtitle={pluralize(artist.plays, 'play')}
                        artworkUri={artworkUrl(artist.coverArt)}
                        round
                        last={index === stats.topArtists.length - 1}
                        onPress={
                          artist.artistId
                            ? () => navigation.navigate('Artist', { artistId: artist.artistId as string, artistName: artist.name })
                            : undefined
                        }
                      />
                    ))}
                  </>
                )}

                {stats.topAlbums.length > 0 && (
                  <>
                    <SectionHeader index="04" title="Top albums" />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albums}>
                      {stats.topAlbums.map((album) => (
                        <AlbumTile
                          key={album.albumId}
                          title={album.name}
                          subtitle={pluralize(album.plays, 'play')}
                          artworkUri={artworkUrl(album.coverArt, 300)}
                          size={albumTile}
                          onPress={() => navigation.navigate('Album', { albumId: album.albumId, albumName: album.name })}
                        />
                      ))}
                    </ScrollView>
                  </>
                )}

                {stats.topTracks.length > 0 && (
                  <>
                    <SectionHeader index="05" title="Top tracks" />
                    {stats.topTracks.map((track, index) => {
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
                          trailingText={`${track.plays}×`}
                          last={index === stats.topTracks.length - 1}
                          // Plays, like a track row anywhere; its album and
                          // the rest are in the menu.
                          onPress={() => toast.guard(playOutline(song))}
                          onLongPress={() => setTrackTarget(song)}
                          onMore={() => setTrackTarget(song)}
                        />
                      );
                    })}
                  </>
                )}
              </>
            )}

            <View style={styles.footer}>
              <Label tone="tertiary" size={9.5}>
                PLAYS LOGGED ON THIS DEVICE
              </Label>
            </View>
          </>
        )}
      </Animated.ScrollView>

      <TrackActionsSheet visible={trackTarget != null} onClose={() => setTrackTarget(null)} song={trackTarget} />
    </DetailScaffold>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: DOCK_CLEARANCE },
  header: { paddingHorizontal: layout.screenPadding, paddingBottom: space[3], gap: space[1] },
  windows: { marginBottom: space[3] },
  grid: { paddingHorizontal: layout.screenPadding, gap: space[2] },
  gridRow: { flexDirection: 'row', gap: space[2] },
  chart: { marginHorizontal: layout.screenPadding, padding: space[4] },
  albums: { paddingHorizontal: layout.screenPadding, gap: space[3] },
  footer: { alignItems: 'center', paddingTop: space[7] },
});
