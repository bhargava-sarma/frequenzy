import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { SubsonicClient } from './src/api/client';
import { ApiError, NoReachableServerError } from './src/api/errors';
import { loadDevServerConfig } from './src/config/devServer';

/**
 * PHASE 0 SCAFFOLDING — replaced by real screens in Phase 4.
 *
 * Deliberately undesigned. Its only job is to prove the API client works
 * inside the React Native runtime, which differs from Node in ways that
 * matter here: Hermes rather than V8, RN's fetch rather than undici, and no
 * Node built-ins. Passing in Node does not prove passing on device.
 *
 * Nothing in this file should survive into the real app, so it intentionally
 * does not pull from the design tokens — those arrive in Phase 2 and this
 * screen would only muddy them.
 */

type Status = 'idle' | 'running' | 'ok' | 'error';

interface LogLine {
  text: string;
  tone: 'info' | 'good' | 'bad';
}

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [lines, setLines] = useState<LogLine[]>([]);
  const nextKey = useRef(0);

  const append = useCallback((text: string, tone: LogLine['tone'] = 'info') => {
    setLines((prev) => [...prev, { text, tone }]);
  }, []);

  const run = useCallback(async () => {
    nextKey.current += 1;
    setLines([]);
    setStatus('running');

    const config = loadDevServerConfig();
    if (!config) {
      append('No server config found.', 'bad');
      append('Set EXPO_PUBLIC_NAVIDROME_* in .env, then restart with -c to clear the cache.');
      setStatus('error');
      return;
    }

    const client = new SubsonicClient({
      config,
      log: (message) => append(message),
    });

    try {
      // 1. Connect — exercises the probe + failover path on-device.
      const startedAt = Date.now();
      const pong = await client.ping();
      const connection = client.getConnectionState()!;
      append(
        `Connected via ${connection.kind.toUpperCase()} in ${Date.now() - startedAt}ms`,
        'good',
      );
      append(`${pong.type ?? '?'} ${pong.serverVersion ?? ''} · api ${pong.version}`);

      // 2. Real data — proves JSON parsing and typing hold up under Hermes.
      const artistsResponse = await client.getArtists();
      const artists = (artistsResponse.artists.index ?? []).flatMap((i) => i.artist);
      append(`Fetched ${artists.length} artists`, 'good');

      // 3. Losslessness, verified on the device that will actually play it.
      const firstArtist = artists[0];
      if (firstArtist) {
        const detail = await client.getArtist(firstArtist.id);
        const album = detail.artist.album?.[0];

        if (album) {
          const albumDetail = await client.getAlbum(album.id);
          const track = albumDetail.album.song?.find((s) => (s.size ?? 0) > 0);

          if (track) {
            const probe = await client.probeStream(track.id);
            append(`Track: ${track.title}`);
            append(
              `${track.suffix ?? '?'} · ${track.bitDepth ?? '?'}bit/` +
                `${track.samplingRate ? track.samplingRate / 1000 : '?'}kHz`,
            );
            append(`content-type: ${probe.contentType ?? '?'}`);

            if (probe.totalBytes === track.size) {
              append(`Byte-identical: ${probe.totalBytes?.toLocaleString()} bytes`, 'good');
              append('No transcoding on device.', 'good');
            } else {
              append(
                `MISMATCH — source ${track.size?.toLocaleString()} vs ` +
                  `stream ${probe.totalBytes?.toLocaleString()}`,
                'bad',
              );
            }
          }
        }
      }

      setStatus('ok');
    } catch (error) {
      if (error instanceof NoReachableServerError) {
        append('Could not reach the server at any address.', 'bad');
        for (const attempt of error.attempts) append(`${attempt.url} → ${attempt.error}`, 'bad');
      } else if (error instanceof ApiError && error.isAuthError) {
        append(`Login rejected: ${error.message}`, 'bad');
      } else {
        append(error instanceof Error ? error.message : String(error), 'bad');
      }
      setStatus('error');
    }
  }, [append]);

  useEffect(() => {
    void run();
  }, [run]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.headerLabel}>PHASE 0 · CONNECTIVITY</Text>
        <Text style={[styles.headerStatus, statusStyles[status]]}>{status.toUpperCase()}</Text>
      </View>

      <ScrollView style={styles.log} contentContainerStyle={styles.logContent}>
        {lines.map((line, index) => (
          <Text key={`${nextKey.current}-${index}`} style={[styles.line, toneStyles[line.tone]]}>
            {line.text}
          </Text>
        ))}
        {status === 'running' && <ActivityIndicator style={styles.spinner} color="#E8703A" />}
      </ScrollView>

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={run}
        disabled={status === 'running'}
      >
        <Text style={styles.buttonText}>RUN AGAIN</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1A1A18', paddingTop: 56, paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3A3A36',
  },
  headerLabel: { color: '#8C8B84', fontSize: 11, letterSpacing: 1.2, fontWeight: '500' },
  headerStatus: { fontSize: 11, letterSpacing: 1.2, fontWeight: '500' },
  log: { flex: 1 },
  logContent: { paddingVertical: 16 },
  line: { fontSize: 12, lineHeight: 20, fontVariant: ['tabular-nums'] },
  spinner: { alignSelf: 'flex-start', marginTop: 12 },
  button: {
    marginBottom: 32,
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 4,
    backgroundColor: '#E8703A',
  },
  buttonPressed: { opacity: 0.7 },
  buttonText: { color: '#1A1A18', fontSize: 11, letterSpacing: 1.2, fontWeight: '500' },
});

const toneStyles = StyleSheet.create({
  info: { color: '#8C8B84' },
  good: { color: '#EFECE4' },
  bad: { color: '#E8703A' },
});

const statusStyles = StyleSheet.create({
  idle: { color: '#8C8B84' },
  running: { color: '#8C8B84' },
  ok: { color: '#EFECE4' },
  error: { color: '#E8703A' },
});
