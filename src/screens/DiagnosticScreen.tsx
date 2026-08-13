import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import TrackPlayer, {
  RepeatMode,
  useActiveMediaItem,
  useIsPlaying,
  useProgress,
} from '@rntp/player';

import { ApiError, NoReachableServerError } from '../api/errors';
import { Button } from '../components/Button';
import { IconChevronRight } from '../components/icons';
import { ProgressBar } from '../components/ProgressBar';
import { TransportControls } from '../components/TransportControls';
import { useServerStore } from '../store/useServerStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { color, hairline, icon, layout, radius, space, type } from '../theme/tokens';
import type { Child } from '../types/subsonic';

/**
 * Connection diagnostics.
 *
 * Carries the "connected via local/remote" indicator the brief asks for, plus
 * the losslessness check — kept in the app rather than only in the dev script
 * so it can be re-run on the device that actually plays audio, from wherever
 * you happen to be.
 *
 * This is scaffolding standing in for the real screens until Phase 4; it will
 * end up folded into Settings.
 */

type Status = 'idle' | 'running' | 'ok' | 'error';

interface Row {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
}

export function DiagnosticScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const client = useServerStore((state) => state.client);
  const library = useServerStore((state) => state.library);
  const connection = useServerStore((state) => state.connection);
  const config = useServerStore((state) => state.config);
  const signOut = useServerStore((state) => state.signOut);
  const refreshConnection = useServerStore((state) => state.refreshConnection);

  const [status, setStatus] = useState<Status>('idle');
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string[]>([]);

  // Playback verification. We queue the WHOLE album rather than the single
  // verified track: with a one-item queue there is no next or previous, so
  // Media3 correctly hides those controls and skip calls are no-ops — which
  // looks like broken transport rather than an empty queue.
  const [testAlbum, setTestAlbum] = useState<Child[]>([]);
  const [testIndex, setTestIndex] = useState(0);
  const testTrack = testAlbum[testIndex] ?? null;

  const playNow = usePlayerStore((state) => state.playNow);
  const playerError = usePlayerStore((state) => state.error);
  const activeItem = useActiveMediaItem();
  const isPlaying = useIsPlaying();
  // Seconds, not milliseconds — the hook multiplies by 1000 internally.
  const progress = useProgress(1);

  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>(RepeatMode.Off);

  const run = useCallback(async () => {
    if (!client || !library) return;

    setStatus('running');
    setRows([]);
    setError([]);

    const collected: Row[] = [];

    try {
      const startedAt = Date.now();
      const pong = await client.ping();
      const active = client.getConnectionState();

      collected.push({
        label: 'Connected via',
        value: `${active?.kind ?? '?'} · ${Date.now() - startedAt}ms`,
        tone: 'good',
      });
      collected.push({ label: 'Server', value: `${pong.type ?? '?'} ${pong.serverVersion ?? ''}` });
      collected.push({ label: 'Subsonic API', value: pong.version });

      // Force one read over the network, then repeat it against the cache.
      // Comparing the two is the only way to show the cache is genuinely
      // serving on device rather than quietly falling through every time.
      const networkStartedAt = Date.now();
      const artists = await library.getArtists({ forceRefresh: true });
      const networkMs = Date.now() - networkStartedAt;

      const cacheStartedAt = Date.now();
      await library.getArtists();
      const cacheMs = Date.now() - cacheStartedAt;

      collected.push({ label: 'Artists', value: String(artists.length) });
      collected.push({
        label: 'Cache read',
        value: `${cacheMs}ms vs ${networkMs}ms network`,
        tone: cacheMs < networkMs ? 'good' : 'bad',
      });
      setRows([...collected]);

      // Exercise getArtist so its cache path is covered too.
      const firstArtist = artists[0];
      if (firstArtist) await library.getArtist(firstArtist.id);

      // Prefer a multi-track album for the playback test. This library is
      // singles-heavy (573 albums, 793 tracks), so grabbing "the first album"
      // usually yields a one-item queue with no next or previous to test.
      const albums = await library.getAllAlbums();
      const album =
        albums.find((candidate) => (candidate.songCount ?? 0) > 1) ?? albums[0];

      if (album) {
        const albumDetail = await library.getAlbum(album.id);
        const index = albumDetail.songs.findIndex((song) => (song.size ?? 0) > 0);
        const track = index >= 0 ? albumDetail.songs[index] : undefined;

        if (track) {
          setTestAlbum(albumDetail.songs);
          setTestIndex(index);

          const probe = await client.probeStream(track.id);
          const matches = probe.totalBytes === track.size;

          collected.push({
            label: 'Queue',
            value: `${albumDetail.songs.length} tracks · ${album.name}`,
          });
          collected.push({ label: 'Test track', value: track.title });
          collected.push({
            label: 'Format',
            value:
              `${(track.suffix ?? '?').toUpperCase()} · ` +
              `${track.bitDepth ?? '?'}/${
                track.samplingRate ? track.samplingRate / 1000 : '?'
              }`,
          });
          collected.push({ label: 'Content type', value: probe.contentType ?? '?' });
          collected.push({
            label: 'Source bytes',
            value: (track.size ?? 0).toLocaleString(),
          });
          collected.push({
            label: 'Stream bytes',
            value: (probe.totalBytes ?? 0).toLocaleString(),
            tone: matches ? 'good' : 'bad',
          });
          collected.push({
            label: 'Transcoding',
            value: matches ? 'none — byte identical' : 'DETECTED',
            tone: matches ? 'good' : 'bad',
          });
        }
      }

      setRows(collected);
      setStatus('ok');
    } catch (err) {
      if (err instanceof NoReachableServerError) {
        setError([
          'Could not reach the server.',
          ...err.attempts.map((a) => `${a.url} — ${a.error}`),
        ]);
      } else if (err instanceof ApiError && err.isAuthError) {
        setError(['Navidrome rejected the stored credentials.']);
      } else {
        setError([err instanceof Error ? err.message : String(err)]);
      }
      setRows(collected);
      setStatus('error');
    }
  }, [client, library]);

  useEffect(() => {
    void run();
  }, [run]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + space[4] }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={space[3]}
          onPress={() => navigation.goBack()}
          style={styles.headerBack}
        >
          <IconChevronRight
            size={icon.size}
            strokeWidth={icon.strokeWidth}
            color={color.textPrimary}
            style={styles.headerBackIcon}
          />
        </Pressable>
        <Text style={styles.headerLabel}>Connection</Text>
        <Text style={[styles.headerStatus, status === 'error' && styles.headerStatusBad]}>
          {status}
        </Text>
      </View>

      {/* The indicator the brief asks for: which address is live right now. */}
      <View style={styles.indicator}>
        <Text style={styles.indicatorLabel}>{config?.nickname || 'Navidrome'}</Text>
        <Text style={styles.indicatorValue}>
          {connection ? connection.kind : 'not connected'}
        </Text>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {rows.map((row) => (
          <View key={row.label} style={styles.row}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text
              style={[
                styles.rowValue,
                row.tone === 'good' && styles.rowValueGood,
                row.tone === 'bad' && styles.rowValueBad,
              ]}
              numberOfLines={1}
            >
              {row.value}
            </Text>
          </View>
        ))}

        {status === 'running' && <ActivityIndicator style={styles.spinner} color={color.accent} />}

        {error.length > 0 && (
          <View style={styles.errorBlock}>
            {error.map((line, index) => (
              <Text key={line} style={index === 0 ? styles.errorText : styles.errorDetail}>
                {line}
              </Text>
            ))}
          </View>
        )}

        {/* Playback check — proves the stream the checks above verified as
            lossless actually decodes and plays on this device. */}
        {testTrack && (
          <View style={styles.playback}>
            <Text style={styles.playbackLabel}>Playback</Text>

            {activeItem ? (
              <>
                <Text style={styles.playbackTitle} numberOfLines={1}>
                  {activeItem.title ?? testTrack.title}
                </Text>
                <Text style={styles.playbackMeta} numberOfLines={1}>
                  {activeItem.artist ?? testTrack.artist}
                </Text>
                <View style={styles.playbackProgress}>
                  <ProgressBar
                    position={progress.position}
                    duration={progress.duration || testTrack.duration}
                    surface="panel"
                  />
                </View>
                <TransportControls
                  playing={isPlaying}
                  shuffle={shuffle}
                  repeat={repeat === RepeatMode.One ? 'one' : repeat === RepeatMode.All ? 'all' : 'off'}
                  onPlayPause={() => (isPlaying ? TrackPlayer.pause() : TrackPlayer.play())}
                  onPrevious={() => TrackPlayer.skipToPrevious()}
                  onNext={() => TrackPlayer.skipToNext()}
                  onToggleShuffle={() => {
                    const next = !shuffle;
                    TrackPlayer.setShuffleEnabled(next);
                    setShuffle(next);
                  }}
                  onCycleRepeat={() => {
                    const next =
                      repeat === RepeatMode.Off
                        ? RepeatMode.All
                        : repeat === RepeatMode.All
                          ? RepeatMode.One
                          : RepeatMode.Off;
                    TrackPlayer.setRepeatMode(next);
                    setRepeat(next);
                  }}
                />
              </>
            ) : (
              <Button
                label={`Play album (${testAlbum.length} tracks)`}
                variant="primary"
                fullWidth
                onPress={() => void playNow(testAlbum, testIndex)}
              />
            )}

            {playerError && <Text style={styles.errorText}>{playerError}</Text>}
          </View>
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          onPress={() => {
            refreshConnection();
            void run();
          }}
          disabled={status === 'running'}
        >
          <Text style={styles.secondaryButtonText}>Re-probe</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          onPress={() => void signOut()}
        >
          <Text style={styles.secondaryButtonText}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space[3],
  },
  headerBack: { marginRight: space[3] },
  headerBackIcon: { transform: [{ rotate: '180deg' }] },
  headerLabel: { ...type.label, color: color.textSecondary, flex: 1 },
  headerStatus: { ...type.label, color: color.textPrimary },
  headerStatusBad: { color: color.accent },

  indicator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: layout.screenPadding,
    paddingVertical: space[3],
    paddingHorizontal: space[3],
    borderRadius: radius.md,
    backgroundColor: color.paperDim,
  },
  indicatorLabel: { ...type.body, color: color.textPrimary },
  indicatorValue: { ...type.label, color: color.textPrimary },

  list: { flex: 1, marginTop: space[5] },
  listContent: { paddingBottom: space[5] },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: layout.rowHeight - space[3],
    paddingHorizontal: layout.screenPadding,
    borderBottomWidth: hairline,
    borderBottomColor: color.paperLine,
  },
  rowLabel: { ...type.meta, color: color.textSecondary },
  rowValue: {
    ...type.numeral,
    fontSize: 12,
    color: color.textPrimary,
    flexShrink: 1,
    marginLeft: space[4],
  },
  rowValueGood: { color: color.textPrimary },
  rowValueBad: { color: color.accent },

  spinner: { alignSelf: 'center', marginTop: space[5] },

  // Transport lives on the dark panel surface per the two-zone split, even
  // when it appears inside an otherwise-paper screen.
  playback: {
    marginTop: space[5],
    marginHorizontal: layout.screenPadding,
    padding: layout.panelPadding,
    borderRadius: radius.md,
    backgroundColor: color.panel,
  },
  playbackLabel: { ...type.label, color: color.textInverseSecondary },
  playbackTitle: { ...type.title, color: color.textInverse, marginTop: space[3] },
  playbackMeta: { ...type.meta, color: color.textInverseSecondary, marginTop: space[1] },
  playbackProgress: { marginTop: space[4], marginBottom: space[4] },

  errorBlock: {
    marginTop: space[5],
    marginHorizontal: layout.screenPadding,
    borderLeftWidth: 2,
    borderLeftColor: color.accent,
    paddingLeft: space[3],
  },
  errorText: { ...type.body, color: color.accent },
  errorDetail: { ...type.meta, color: color.textSecondary, marginTop: space[1] },

  actions: {
    flexDirection: 'row',
    gap: space[3],
    paddingHorizontal: layout.screenPadding,
    // The dev switcher below owns the bottom safe-area inset, so this is
    // spacing between the two rather than a guess at the gesture bar.
    paddingBottom: space[4],
    paddingTop: space[3],
  },
  secondaryButton: {
    flex: 1,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: hairline,
    borderColor: color.paperLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { ...type.body, color: color.textPrimary },
  pressed: { opacity: 0.6 },
});
