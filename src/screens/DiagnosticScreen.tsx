import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, NoReachableServerError } from '../api/errors';
import { IconButton } from '../components/IconButton';
import { IconChevronLeft } from '../components/icons';
import { Keycap } from '../components/Keycap';
import { Label } from '../components/Label';
import { Led } from '../components/Led';
import { Panel } from '../components/Panel';
import { SteppingLights } from '../components/ScreenState';
import { useServerStore } from '../store/useServerStore';
import { hairline, layout, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

/**
 * Connection diagnostics, development builds only.
 *
 * Which address is live, how fast the cache serves against the network, and
 * the losslessness proof on a real track — run on the device that plays the
 * audio, from wherever it happens to be.
 */

type Tone = 'good' | 'bad' | undefined;
interface Row {
  label: string;
  value: string;
  tone?: Tone;
}

export function DiagnosticScreen() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const client = useServerStore((state) => state.client);
  const library = useServerStore((state) => state.library);
  const refreshConnection = useServerStore((state) => state.refreshConnection);

  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string[]>([]);

  const run = useCallback(async () => {
    if (!client || !library) return;
    setRunning(true);
    setRows([]);
    setError([]);
    const collected: Row[] = [];

    try {
      const startedAt = Date.now();
      const pong = await client.ping();
      const active = client.getConnectionState();
      collected.push({ label: 'Connected via', value: `${active?.kind ?? '?'} · ${Date.now() - startedAt}ms`, tone: 'good' });
      collected.push({ label: 'Server', value: `${pong.type ?? '?'} ${pong.serverVersion ?? ''}` });
      collected.push({ label: 'Subsonic API', value: pong.version });
      setRows([...collected]);

      const networkStartedAt = Date.now();
      const artists = await library.getArtists({ forceRefresh: true });
      const networkMs = Date.now() - networkStartedAt;
      const cacheStartedAt = Date.now();
      await library.getArtists();
      const cacheMs = Date.now() - cacheStartedAt;
      collected.push({ label: 'Artists', value: String(artists.length) });
      collected.push({ label: 'Cache read', value: `${cacheMs}ms vs ${networkMs}ms`, tone: cacheMs < networkMs ? 'good' : 'bad' });
      setRows([...collected]);

      const albums = await library.getAlbumsByType('random', 5);
      for (const album of albums) {
        const detail = await library.getAlbum(album.id);
        const track = detail.songs.find((song) => (song.size ?? 0) > 0);
        if (!track) continue;
        const probe = await client.probeStream(track.id);
        const matches = probe.totalBytes === track.size;
        collected.push({ label: 'Test track', value: track.title });
        collected.push({ label: 'Content type', value: probe.contentType ?? '?' });
        collected.push({ label: 'Source bytes', value: (track.size ?? 0).toLocaleString() });
        collected.push({ label: 'Stream bytes', value: (probe.totalBytes ?? 0).toLocaleString(), tone: matches ? 'good' : 'bad' });
        collected.push({ label: 'Transcoding', value: matches ? 'none — byte identical' : 'DETECTED', tone: matches ? 'good' : 'bad' });
        break;
      }
      setRows(collected);
    } catch (err) {
      if (err instanceof NoReachableServerError) {
        setError(['Could not reach the server.', ...err.attempts.map((a) => `${a.url} — ${a.error}`)]);
      } else if (err instanceof ApiError && err.isAuthError) {
        setError(['Navidrome rejected the stored credentials.']);
      } else {
        setError([err instanceof Error ? err.message : String(err)]);
      }
      setRows(collected);
    } finally {
      setRunning(false);
    }
  }, [client, library]);

  useEffect(() => {
    void run();
  }, [run]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.nav}>
        <IconButton icon={IconChevronLeft} accessibilityLabel="Back" variant="surface" onPress={() => navigation.goBack()} />
        <Text style={[type.title2, { color: color.label }]}>Diagnostics</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space[6] }]}>
        <Panel label="Connection & losslessness">
          {rows.map((row, index) => (
            <View key={`${row.label}-${index}`} style={[styles.row, index < rows.length - 1 && styles.rowLine]}>
              <Label tone="tertiary">{row.label}</Label>
              <View style={styles.value}>
                {row.tone && <Led color={row.tone === 'good' ? color.ledGreen : color.ledRed} size={6} />}
                <Text style={styles.valueText} numberOfLines={1}>
                  {row.value}
                </Text>
              </View>
            </View>
          ))}
          {running && (
            <View style={styles.running}>
              <SteppingLights />
            </View>
          )}
          {error.map((line, index) => (
            <Text key={line} style={[styles.error, index > 0 && styles.errorDetail]}>
              {line}
            </Text>
          ))}
        </Panel>
        <Keycap
          label="Re-probe"
          busy={running}
          onPress={() => {
            refreshConnection();
            void run();
          }}
        />
      </ScrollView>
    </View>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.background },
    nav: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: layout.screenPadding, paddingVertical: space[3] },
    content: { paddingHorizontal: layout.screenPadding, gap: space[3] },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40, gap: space[3] },
    rowLine: { borderBottomWidth: hairline, borderBottomColor: color.separator },
    value: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexShrink: 1 },
    valueText: { ...type.mono, color: color.label, flexShrink: 1 },
    running: { paddingVertical: space[4], alignItems: 'center' },
    error: { ...type.headline, color: color.destructive, marginTop: space[3] },
    errorDetail: { ...type.mono, fontSize: 11, color: color.labelSecondary, marginTop: space[1] },
  });
