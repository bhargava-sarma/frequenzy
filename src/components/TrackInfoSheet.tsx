import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { IconCircleCheck } from './icons';
import { Keycap } from './Keycap';
import { Label } from './Label';
import { Led } from './Led';
import { RatingPips } from './Readouts';
import { Sheet } from './Sheet';
import { SteppingLights } from './ScreenState';
import { useArtwork } from '../hooks/useArtwork';
import { useServerStore } from '../store/useServerStore';
import { errorMessage, toast } from '../store/useToastStore';
import { formatPlate } from '../player/trackMapping';
import { hairline, layout, radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Child } from '../types/subsonic';
import { formatBytes, formatDuration, formatRelative } from '../utils/time';

/**
 * A track's spec sheet: everything the server knows about the file, laid out
 * like the plate on the back of a device — and a key that proves the stream
 * is the file, byte for byte.
 *
 * The proof is a two-byte range request: the total size in Content-Range is
 * what the server would send, and a transcode cannot coincidentally match
 * the source file's size.
 */
export interface TrackInfoSheetProps {
  visible: boolean;
  onClose: () => void;
  songId: string | null;
  /**
   * What the caller already knows about the track. Shown at once while the
   * full record loads, so the sheet rises at its real size instead of
   * opening as a spinner and then jumping taller.
   */
  initial?: Child | null;
}

type Verify =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'done'; ok: boolean; stream: number | null; source: number | null };

export function TrackInfoSheet({ visible, onClose, songId, initial }: TrackInfoSheetProps) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const client = useServerStore((state) => state.client);
  const artworkUrl = useArtwork();

  const [song, setSong] = useState<Child | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [verify, setVerify] = useState<Verify>({ state: 'idle' });

  // Read when the sheet opens, not tracked: a new object for the same track
  // must not refetch.
  const initialRef = useRef(initial);
  initialRef.current = initial;

  useEffect(() => {
    if (!visible || !songId || !client) return;
    let cancelled = false;
    const seed = initialRef.current?.id === songId ? initialRef.current : null;
    setSong(seed);
    setRating(seed?.userRating ?? 0);
    setError(null);
    setVerify({ state: 'idle' });
    client
      .getSong(songId)
      .then((response) => {
        if (cancelled) return;
        setSong(response.song);
        setRating(response.song.userRating ?? 0);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [visible, songId, client]);

  async function rate(value: number) {
    if (!client || !song) return;
    const previous = rating;
    setRating(value);
    try {
      await client.setRating(song.id, value);
    } catch (cause) {
      setRating(previous);
      toast.error("Couldn't save rating", { detail: errorMessage(cause) });
    }
  }

  async function runVerify() {
    if (!client || !song) return;
    setVerify({ state: 'running' });
    try {
      const probe = await client.probeStream(song.id);
      const source = song.size ?? null;
      setVerify({
        state: 'done',
        ok: source != null && probe.totalBytes === source,
        stream: probe.totalBytes,
        source,
      });
    } catch (cause) {
      setVerify({ state: 'idle' });
      toast.error('Verification failed', { detail: errorMessage(cause) });
    }
  }

  const rows: [string, string][] = song
    ? ([
        ['Artist', song.artist],
        ['Album', song.album],
        [
          'Track',
          [song.track ? `${String(song.track).padStart(2, '0')}` : null, song.discNumber ? `Disc ${song.discNumber}` : null]
            .filter(Boolean)
            .join(' · '),
        ],
        ['Year', song.year ? String(song.year) : undefined],
        ['Genre', song.genres?.map((g) => g.name).join(', ') || song.genre],
        [
          'Format',
          [
            formatPlate(song.suffix, song.bitDepth, song.samplingRate),
            song.channelCount ? `${song.channelCount} ch` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        ],
        ['Bitrate', song.bitRate ? `${song.bitRate} kbps` : undefined],
        ['Size', song.size ? formatBytes(song.size) : undefined],
        ['Length', song.duration ? formatDuration(song.duration) : undefined],
        ['BPM', song.bpm ? String(song.bpm) : undefined],
        ['Plays', song.playCount != null ? String(song.playCount) : undefined],
        ['Last played', song.played ? formatRelative(song.played) : undefined],
        ['Added', song.created ? formatRelative(song.created) : undefined],
      ].filter(([, value]) => value) as [string, string][])
    : [];

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={song?.title ?? 'Track info'}
      subtitle={song ? formatPlate(song.suffix, song.bitDepth, song.samplingRate) ?? undefined : undefined}
      artworkUri={song ? (artworkUrl(song.coverArt, 120) ?? null) : null}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} bounces={false}>
        {!song && !error && (
          <View style={styles.loading}>
            <SteppingLights />
          </View>
        )}
        {error && !song && <Text style={styles.error}>{error}</Text>}

        {song && (
          <>
            <View style={styles.plate}>
              {rows.map(([label, value], index) => (
                <View key={label} style={[styles.row, index < rows.length - 1 && styles.rowLine]}>
                  <Label tone="tertiary" style={styles.rowLabel}>
                    {label}
                  </Label>
                  <Text style={styles.rowValue} numberOfLines={2}>
                    {value}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.ratingRow}>
              <Label tone="tertiary">Rating</Label>
              <RatingPips value={rating} onChange={(value) => void rate(value)} />
            </View>

            {song.path ? (
              <View style={styles.path}>
                <Label tone="tertiary">Path</Label>
                <Text style={styles.pathText} selectable>
                  {song.path}
                </Text>
              </View>
            ) : null}

            <View style={styles.verify}>
              {verify.state === 'done' ? (
                <View style={styles.verdict}>
                  <Led color={verify.ok ? color.ledGreen : color.ledRed} size={9} />
                  <View style={styles.verdictText}>
                    <Text style={[type.headline, { color: color.label }]}>
                      {verify.ok ? 'Bit-perfect' : 'Not byte-identical'}
                    </Text>
                    <Text style={styles.verdictDetail}>
                      {verify.ok
                        ? `Stream and file are both ${formatBytes(verify.source ?? 0)}.`
                        : `Stream ${verify.stream != null ? formatBytes(verify.stream) : 'unknown'} vs file ${
                            verify.source != null ? formatBytes(verify.source) : 'unknown'
                          }.`}
                    </Text>
                  </View>
                  {verify.ok && <IconCircleCheck size={22} color={color.ledGreen} strokeWidth={2} />}
                </View>
              ) : (
                <Keycap
                  label="Verify bit-perfect"
                  variant="dark"
                  busy={verify.state === 'running'}
                  onPress={() => void runVerify()}
                />
              )}
            </View>
          </>
        )}
      </ScrollView>
    </Sheet>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    scroll: { flexGrow: 0 },
    content: { paddingHorizontal: layout.panelPadding + space[1], paddingBottom: space[2] },
    loading: { paddingVertical: space[7], alignItems: 'center' },
    error: { ...type.footnote, color: color.destructive, paddingVertical: space[4] },
    plate: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: color.separator,
      backgroundColor: color.surfaceSunken,
      paddingHorizontal: space[3],
    },
    row: { flexDirection: 'row', alignItems: 'center', minHeight: 38, gap: space[3] },
    rowLine: { borderBottomWidth: hairline, borderBottomColor: color.separator },
    rowLabel: { width: 92 },
    rowValue: { ...type.callout, color: color.label, flex: 1, textAlign: 'right' },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: space[4],
      paddingHorizontal: space[1],
    },
    path: { paddingHorizontal: space[1], paddingBottom: space[3], gap: space[1] },
    pathText: { ...type.mono, fontSize: 11, color: color.labelSecondary, lineHeight: 16 },
    verify: { marginTop: space[2] },
    verdict: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      padding: space[3],
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: color.separator,
      backgroundColor: color.surface,
    },
    verdictText: { flex: 1 },
    verdictDetail: { ...type.footnote, color: color.labelSecondary, marginTop: 2 },
  });
