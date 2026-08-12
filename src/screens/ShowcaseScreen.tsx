import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ButtonRow } from '../components/Button';
import { ArtworkWell, FormatBadge } from '../components/ArtworkWell';
import { ListRow } from '../components/ListRow';
import { ProgressBar } from '../components/ProgressBar';
import { SectionHeader } from '../components/SectionHeader';
import { TransportControls, type RepeatMode } from '../components/TransportControls';
import { color, layout, space, type } from '../theme/tokens';
import { formatDuration } from '../utils/time';

/**
 * Component showcase — the primitives in isolation, before real screens
 * depend on them.
 *
 * The top block is the dark panel zone and the bottom is light paper, shown
 * together so the two-zone split can be judged as a whole. This is a
 * development surface and is not part of the shipped navigation.
 */

const DEMO_TRACK = { title: 'Xtal', artist: 'Aphex Twin', duration: 293 };

const DEMO_ROWS = [
  { title: 'Selected Ambient Works 85–92', meta: 'Aphex Twin · 13 tracks' },
  { title: 'Untrue', meta: 'Burial · 12 tracks' },
  { title: 'Music Has the Right to Children', meta: 'Boards of Canada · 18 tracks' },
];

export function ShowcaseScreen() {
  const insets = useSafeAreaInsets();
  const [playing, setPlaying] = useState(true);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [favorited, setFavorited] = useState<Record<number, boolean>>({ 1: true });
  const [position, setPosition] = useState(64);

  // Runs the clock so the progress fill moves and the numerals actually
  // change — a static screenshot can't show whether tabular figures are
  // holding their column.
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setPosition((current) => (current >= DEMO_TRACK.duration ? 0 : current + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [playing]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* ---------------------------------------------------------------- */}
      {/* PANEL ZONE — always dark, per the two-zone split                  */}
      {/* ---------------------------------------------------------------- */}
      <View style={[styles.panel, { paddingTop: insets.top + space[4] }]}>
        <View style={styles.panelHeader}>
          <Text style={styles.panelLabel}>Now playing</Text>
          <FormatBadge suffix="flac" bitDepth={24} samplingRate={96000} />
        </View>

        <ArtworkWell size={220} style={styles.art} />

        <Text style={styles.trackTitle} numberOfLines={1}>
          {DEMO_TRACK.title}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {DEMO_TRACK.artist}
        </Text>

        <View style={styles.progressBlock}>
          <ProgressBar position={position} duration={DEMO_TRACK.duration} />
        </View>

        <TransportControls
          playing={playing}
          shuffle={shuffle}
          repeat={repeat}
          onPlayPause={() => setPlaying((value) => !value)}
          onToggleShuffle={() => setShuffle((value) => !value)}
          onCycleRepeat={() =>
            setRepeat((mode) => (mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off'))
          }
        />

        <View style={styles.panelButtons}>
          <ButtonRow>
            <Button label="Queue" surface="panel" />
            <Button label="Details" surface="panel" />
          </ButtonRow>
        </View>
      </View>

      {/* ---------------------------------------------------------------- */}
      {/* PAPER ZONE — always light                                        */}
      {/* ---------------------------------------------------------------- */}
      <SectionHeader title="Library" count="573 albums" />

      {DEMO_ROWS.map((row, index) => (
        <ListRow
          key={row.title}
          title={row.title}
          meta={row.meta}
          action="favorite"
          favorited={favorited[index] ?? false}
          active={index === 0}
          onActionPress={() =>
            setFavorited((current) => ({ ...current, [index]: !current[index] }))
          }
          last={index === DEMO_ROWS.length - 1}
        />
      ))}

      <SectionHeader title="Queue actions" count={formatDuration(DEMO_TRACK.duration)} />

      <ListRow
        title="Windowlicker"
        meta={`Aphex Twin · ${formatDuration(366)}`}
        action="queue"
      />
      <ListRow
        title="Avril 14th"
        meta={`Aphex Twin · ${formatDuration(125)}`}
        action="queue"
        last
      />

      <SectionHeader title="Buttons" />
      <View style={styles.buttonBlock}>
        <Button label="Play all" variant="primary" fullWidth />
        <View style={styles.gap} />
        <ButtonRow>
          <Button label="Shuffle" />
          <Button label="Disabled" disabled />
        </ButtonRow>
        <View style={styles.gap} />
        <Button label="Working" busy fullWidth />
      </View>

      <SectionHeader title="Progress on paper" />
      <View style={styles.buttonBlock}>
        <ProgressBar position={position} duration={DEMO_TRACK.duration} surface="paper" />
      </View>

      <View style={styles.footer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  content: { paddingBottom: space[6] },

  panel: {
    backgroundColor: color.panel,
    paddingHorizontal: layout.panelPadding,
    paddingBottom: space[6],
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space[5],
  },
  panelLabel: { ...type.label, color: color.textInverseSecondary },

  art: { alignSelf: 'center', marginBottom: space[5] },

  trackTitle: { ...type.display, color: color.textInverse },
  trackArtist: { ...type.meta, color: color.textInverseSecondary, marginTop: space[1] },

  progressBlock: { marginTop: space[5], marginBottom: space[5] },
  panelButtons: { marginTop: space[5] },

  buttonBlock: { paddingHorizontal: layout.screenPadding },
  gap: { height: space[3] },
  footer: { height: space[6] },
});
