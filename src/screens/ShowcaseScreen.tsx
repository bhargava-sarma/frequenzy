import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, ChipRow } from '../components/Chip';
import { DotText, Display } from '../components/Display';
import { ArtworkFace } from '../components/faces/ArtworkFace';
import { TapeFace } from '../components/faces/TapeFace';
import { VinylFace } from '../components/faces/VinylFace';
import { GridPaper } from '../components/GridPaper';
import { IconButton } from '../components/IconButton';
import {
  IconArrowsShuffle,
  IconChevronLeft,
  IconHeart,
  IconListDetails,
  IconMoon,
  IconPlayerPlayFilled,
} from '../components/icons';
import { Keycap, KeyRow } from '../components/Keycap';
import { Label } from '../components/Label';
import { Led } from '../components/Led';
import { ListRow } from '../components/ListRow';
import { Panel } from '../components/Panel';
import { BarChart, RatingPips, StatTile } from '../components/Readouts';
import { SteppingLights } from '../components/ScreenState';
import { ScrubBar } from '../components/ScrubBar';
import { SectionHeader } from '../components/SectionHeader';
import { Segmented } from '../components/Segmented';
import { Slider } from '../components/Slider';
import { MIX_HUES, MixCard, QuickKey } from '../components/Tiles';
import { Toggle } from '../components/Toggle';
import { layout, space, type } from '../theme/tokens';
import { ImmersiveScope, useTheme } from '../theme/ThemeProvider';

/**
 * Every primitive on one page, development builds only — the place to judge
 * the language as a whole before a screen depends on a piece of it.
 */
export function ShowcaseScreen() {
  const color = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [on, setOn] = useState(true);
  const [level, setLevel] = useState(0.6);
  const [mode, setMode] = useState<'a' | 'b' | 'c'>('b');
  const [position, setPosition] = useState(64);
  const [rating, setRating] = useState(3);
  const duration = 293;

  useEffect(() => {
    const timer = setInterval(() => setPosition((p) => (p >= duration ? 0 : p + 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: color.background, paddingTop: insets.top }]}>
      <GridPaper />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space[8] }]}>
        <View style={styles.nav}>
          <IconButton icon={IconChevronLeft} accessibilityLabel="Back" variant="surface" onPress={() => navigation.goBack()} />
          <Text style={[type.largeTitle, { color: color.label }]}>Components</Text>
        </View>

        <SectionHeader index="01" title="Keys" compact />
        <View style={styles.pad}>
          <KeyRow>
            <Keycap label="Play" icon={IconPlayerPlayFilled} iconFilled variant="primary" flex />
            <Keycap label="Shuffle" icon={IconArrowsShuffle} flex />
            <Keycap icon={IconHeart} square accessibilityLabel="Like" />
          </KeyRow>
          <View style={styles.gap} />
          <KeyRow>
            <Keycap label="Dark" variant="dark" flex size="sm" />
            <Keycap label="Ghost" variant="ghost" flex size="sm" />
            <Keycap label="Busy" busy flex size="sm" />
            <Keycap label="Off" disabled flex size="sm" />
          </KeyRow>
        </View>

        <SectionHeader index="02" title="Controls" />
        <Panel style={styles.pad}>
          <Segmented
            options={[
              { value: 'a', label: 'Day' },
              { value: 'b', label: 'Week' },
              { value: 'c', label: 'Month' },
            ]}
            value={mode}
            onChange={setMode}
          />
          <View style={styles.row}>
            <Text style={[type.callout, { color: color.label }]}>Slide switch</Text>
            <Toggle value={on} onChange={setOn} accessibilityLabel="Demo toggle" />
          </View>
          <Slider label="Fader" value={level} onChange={setLevel} readout={`${Math.round(level * 100)}%`} />
          <View style={styles.row}>
            <Text style={[type.callout, { color: color.label }]}>Rating</Text>
            <RatingPips value={rating} onChange={setRating} />
          </View>
          <View style={styles.row}>
            <Led color={color.ledGreen} />
            <Led color={color.ledAmber} blink />
            <Led color={color.ledRed} />
            <Led color={color.accent} on={false} />
            <SteppingLights />
          </View>
        </Panel>
        <ChipRow style={styles.chips}>
          <Chip label="All" selected />
          <Chip label="Tracks" count={42} />
          <Chip label="Sleep" icon={IconMoon} />
          <Chip label="Queue" icon={IconListDetails} />
        </ChipRow>

        <SectionHeader index="03" title="Display" />
        <View style={styles.pad}>
          <Display style={styles.display}>
            <Label tone="displayDim">Tape counter</Label>
            <DotText size={40}>04:51</DotText>
          </Display>
          <View style={[styles.row, styles.tiles]}>
            <StatTile label="Today" value="12" unit="PLAYS" />
            <StatTile label="Week" value="4.2" unit="HRS" accent />
            <StatTile label="Streak" value="5" unit="DAYS" />
          </View>
          <Display style={styles.display}>
            <BarChart values={[1, 3, 0, 5, 8, 2, 4, 6, 1, 0, 3, 7]} labels={{ 0: '00', 6: '06', 11: '11' }} />
          </Display>
        </View>

        <SectionHeader index="04" title="Tiles" />
        <View style={[styles.pad, styles.row]}>
          <QuickKey icon={IconArrowsShuffle} label="Shuffle all" caption="Whole library" primary onPress={() => {}} />
          <QuickKey icon={IconHeart} label="Liked" caption="128 tracks" onPress={() => {}} />
        </View>
        <ScrollView horizontal contentContainerStyle={styles.mixes} showsHorizontalScrollIndicator={false}>
          {['Discover', 'Electronic', 'The 90s'].map((title, index) => (
            <MixCard key={title} index={index + 1} title={title} caption="Random" hue={MIX_HUES[index]} width={140} onPress={() => {}} />
          ))}
        </ScrollView>

        <SectionHeader index="05" title="Rows" />
        <ListRow title="Xtal" subtitle="Aphex Twin" trailingText="4:51" leading="index" index={1} active playing />
        <ListRow title="Tha" subtitle="Aphex Twin" trailingText="9:01" leading="index" index={2} starred onMore={() => {}} />
        <ListRow title="Pulsewidth" subtitle="Aphex Twin" trailingText="3:47" rank={1} onMore={() => {}} last />

        <SectionHeader index="06" title="Faces" />
        <ImmersiveScope>
          <View style={[styles.faces, { backgroundColor: '#14100E' }]}>
            <ArtworkFace size={150} playing />
            <VinylFace size={150} playing progress={position / duration} />
          </View>
          <View style={[styles.faces, { backgroundColor: '#14100E' }]}>
            <TapeFace size={300} playing progress={position / duration} title="Selected Ambient Works" subtitle="Aphex Twin" />
          </View>
          <View style={[styles.pad, styles.scrub, { backgroundColor: '#14100E' }]}>
            <ScrubBar position={position} duration={duration} playing onSeek={setPosition} tone="onArtwork" />
          </View>
        </ImmersiveScope>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {},
  nav: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: layout.screenPadding, paddingTop: space[2] },
  pad: { marginHorizontal: layout.screenPadding },
  gap: { height: space[3] },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], marginTop: space[3] },
  chips: { marginTop: space[3] },
  display: { padding: space[4], gap: space[1] },
  tiles: { marginBottom: space[3] },
  mixes: { paddingHorizontal: layout.screenPadding, gap: space[3], marginTop: space[3] },
  faces: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: space[5] },
  scrub: { padding: space[4], borderRadius: 16 },
});
