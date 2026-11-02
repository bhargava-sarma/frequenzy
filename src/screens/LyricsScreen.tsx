import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TrackPlayer, { useActiveMediaItem, useProgress } from '@rntp/player';

import { activeLineIndex } from '../api/lrclib';
import { AmbientBackground } from '../components/AmbientBackground';
import { Chip, ChipRow } from '../components/Chip';
import { Glass } from '../components/Glass';
import { IconButton } from '../components/IconButton';
import {
  IconArrowBarToDown,
  IconChevronDown,
  IconLanguage,
  IconMicrophone2,
  IconMinus,
  IconPlus,
  IconTextSize,
} from '../components/icons';
import { Keycap } from '../components/Keycap';
import { Label } from '../components/Label';
import { PanelHandle } from '../components/PanelHandle';
import { EmptyState, LoadingState } from '../components/ScreenState';
import { useLyrics } from '../hooks/useLyrics';
import { extrasOf } from '../player/trackMapping';
import { usePlayerUiStore } from '../store/usePlayerUiStore';
import { useSettingsStore, type LyricsSize } from '../store/useSettingsStore';
import { layout, motion, radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemeControls, useThemedStyles } from '../theme/ThemeProvider';
import { romanizeLine } from '../utils/romanize';

/**
 * Lyrics, following the voice.
 *
 * From the server's own tags when it has them, LRCLIB otherwise. The current
 * line is the only thing in the accent, on a glass plate; lines are tappable
 * and seek. Scroll by hand and following pauses — reading ahead is
 * impossible if every tick drags the view back — with a key to resume.
 *
 * Timing that's a little early or late can be nudged per track; the
 * correction is remembered.
 */

const TICK_SECONDS = 0.25;
const MANUAL_SCROLL_GRACE_MS = 6000;
const LINE_FADE_MS = 260;
const TIMING = { duration: LINE_FADE_MS, easing: Easing.bezier(...motion.easing) };
const INACTIVE_OPACITY = 0.36;

const SIZES: Record<LyricsSize, { fontSize: number; lineHeight: number }> = {
  small: { fontSize: 20, lineHeight: 28 },
  medium: { fontSize: 26, lineHeight: 34 },
  large: { fontSize: 32, lineHeight: 41 },
};
const NEXT_SIZE: Record<LyricsSize, LyricsSize> = { small: 'medium', medium: 'large', large: 'small' };

export function LyricsScreen() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const closeLyrics = usePlayerUiStore((state) => state.closeLyrics);

  const activeItem = useActiveMediaItem();
  const trackId = extrasOf(activeItem)?.subsonicId ?? '';
  const { position } = useProgress(TICK_SECONDS);
  const { status, lyrics, retry } = useLyrics(activeItem);

  const size = useSettingsStore((state) => state.lyricsSize);
  const romanize = useSettingsStore((state) => state.lyricsRomanize);
  const offset = useSettingsStore((state) => state.lyricsOffsets[trackId] ?? 0);
  const update = useSettingsStore((state) => state.update);
  const setLyricsOffset = useSettingsStore((state) => state.setLyricsOffset);

  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<number, number>>({});
  const viewportHeight = useRef(0);
  const manualUntil = useRef(0);
  const [following, setFollowing] = useState(true);

  const lines = useMemo(() => lyrics?.lines ?? [], [lyrics]);
  const synced = Boolean(lyrics?.synced);

  // Once per sheet, not per tick: this walks every line.
  const roman = useMemo(() => lines.map((line) => romanizeLine(line.text)), [lines]);
  const hasRoman = useMemo(() => roman.some(Boolean), [roman]);
  const romanPlain = useMemo(() => (lyrics?.plain ? romanizeLine(lyrics.plain) : null), [lyrics]);

  const index = useMemo(
    () => (synced ? activeLineIndex(lines, position + offset) : -1),
    [synced, lines, position, offset],
  );

  // New words, new geometry.
  useEffect(() => {
    offsets.current = {};
    manualUntil.current = 0;
    setFollowing(true);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [lyrics]);

  const scrollToLine = useCallback((i: number, animated = true) => {
    const y = offsets.current[i];
    if (y == null || viewportHeight.current === 0) return;
    // Centred: the next lines are the ones about to be sung.
    scrollRef.current?.scrollTo({ y: Math.max(0, y - viewportHeight.current * 0.4), animated });
  }, []);

  useEffect(() => {
    if (index < 0 || !synced) return;
    if (Date.now() < manualUntil.current) return;
    if (!following) setFollowing(true);
    scrollToLine(index);
  }, [index, synced, following, scrollToLine]);

  const onLineLayout = useCallback((i: number, y: number) => {
    offsets.current[i] = y;
  }, []);

  const seekTo = useCallback(
    (seconds: number) => {
      manualUntil.current = 0;
      setFollowing(true);
      TrackPlayer.seekTo(Math.max(0, seconds - offset));
    },
    [offset],
  );

  const resume = () => {
    manualUntil.current = 0;
    setFollowing(true);
    if (index >= 0) scrollToLine(index);
  };

  const fontStyle = SIZES[size];

  const body = () => {
    if (status === 'loading' || status === 'idle') return <LoadingState label="Looking for lyrics" />;

    if (status === 'error') {
      return (
        <View style={styles.state}>
          <EmptyState
            icon={IconMicrophone2}
            label="Couldn't reach LRCLIB"
            hint="Lyrics come from your server's tags or a community database, separate from your music."
            action={{ label: 'Try again', onPress: retry }}
          />
        </View>
      );
    }

    if (lyrics?.instrumental) {
      return <EmptyState icon={IconMicrophone2} label="Instrumental" hint="This recording has no words." />;
    }

    if (status === 'none' || (!lyrics?.plain && lines.length === 0)) {
      return (
        <View style={styles.state}>
          <EmptyState
            icon={IconMicrophone2}
            label="No lyrics found"
            hint="Neither your server nor LRCLIB has words for this track. Tags that differ from the release can be the cause."
            action={{ label: 'Look again', onPress: retry }}
          />
        </View>
      );
    }

    if (!synced) {
      return (
        <View style={styles.plainBlock}>
          <Label tone="tertiary" style={styles.unsynced}>
            Not time-synced
          </Label>
          <Text style={[styles.plain, { fontSize: fontStyle.fontSize * 0.68, lineHeight: fontStyle.lineHeight * 0.78 }]} selectable>
            {lyrics?.plain}
          </Text>
          {romanize && romanPlain && (
            <Text style={styles.plainRoman} selectable>
              {romanPlain}
            </Text>
          )}
        </View>
      );
    }

    return lines.map((line, i) =>
      !line.text ? (
        // Instrumental gaps keep their slot, so the previous line doesn't
        // sit lit through the whole break.
        <View key={i} style={styles.gap} onLayout={(e) => onLineLayout(i, e.nativeEvent.layout.y)} />
      ) : (
        <LyricRow
          key={i}
          index={i}
          text={line.text}
          roman={romanize ? roman[i] : null}
          time={line.time}
          active={i === index}
          past={i < index}
          fontSize={fontStyle.fontSize}
          lineHeight={fontStyle.lineHeight}
          idleColor={color.onArtwork}
          activeColor={color.accent}
          onLayout={onLineLayout}
          onSeek={seekTo}
        />
      ),
    );
  };

  const sourcePlate =
    status === 'ready' && lyrics ? (lyrics.source === 'server' ? 'From your server' : 'From LRCLIB') : ' ';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AmbientBackground variant="immersive" dim={0.3} />

      <PanelHandle>
        <View style={styles.header}>
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            <IconButton icon={IconChevronDown} accessibilityLabel="Close lyrics" onPress={closeLyrics} />
            <View style={styles.headerText}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {activeItem?.title ?? 'Lyrics'}
              </Text>
              <Label tone="onArtwork" style={styles.headerSub}>
                {sourcePlate}
              </Label>
            </View>
            <IconButton
              icon={IconTextSize}
              accessibilityLabel={`Text size: ${size}`}
              onPress={() => update({ lyricsSize: NEXT_SIZE[size] })}
            />
          </View>
        </View>
      </PanelHandle>

      {(synced || hasRoman || (romanPlain && !synced)) && status === 'ready' && (
        <ChipRow style={styles.tools}>
          {(hasRoman || romanPlain) && (
            <Chip
              label="Romanised"
              icon={IconLanguage}
              tone="onArtwork"
              selected={romanize}
              onPress={() => update({ lyricsRomanize: !romanize })}
            />
          )}
          {synced && (
            <>
              <Chip label="Earlier" icon={IconMinus} tone="onArtwork" onPress={() => setLyricsOffset(trackId, offset - 0.25)} />
              <Chip
                label={offset === 0 ? 'In sync' : `${offset > 0 ? '+' : ''}${offset.toFixed(2)}s`}
                tone="onArtwork"
                selected={offset !== 0}
                onPress={() => setLyricsOffset(trackId, 0)}
                accessibilityLabel="Reset lyric timing"
              />
              <Chip label="Later" icon={IconPlus} tone="onArtwork" onPress={() => setLyricsOffset(trackId, offset + 0.25)} />
            </>
          )}
        </ChipRow>
      )}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 260 }]}
        onLayout={(e) => {
          viewportHeight.current = e.nativeEvent.layout.height;
        }}
        onScrollBeginDrag={() => {
          manualUntil.current = Date.now() + MANUAL_SCROLL_GRACE_MS;
          if (synced) setFollowing(false);
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {body()}
      </ScrollView>

      {synced && !following && (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(160)}
          style={[styles.follow, { bottom: insets.bottom + space[5] }]}
        >
          <Keycap label="Follow" icon={IconArrowBarToDown} variant="primary" size="sm" onPress={resume} />
        </Animated.View>
      )}
    </View>
  );
}

/**
 * One line, lifting as it becomes current. Memoised on `active`, so a tick
 * re-renders the two lines that changed rather than all of them. Opacity,
 * scale and colour move on one curve: three timings read as three things.
 */
const LyricRow = memo(function LyricRow({
  index,
  text,
  roman,
  time,
  active,
  past,
  fontSize,
  lineHeight,
  idleColor,
  activeColor,
  onLayout,
  onSeek,
}: {
  index: number;
  text: string;
  roman: string | null;
  time: number;
  active: boolean;
  past: boolean;
  fontSize: number;
  lineHeight: number;
  idleColor: string;
  activeColor: string;
  onLayout: (index: number, y: number) => void;
  onSeek: (seconds: number) => void;
}) {
  const { resolved } = useThemeControls();
  const lit = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    lit.value = withTiming(active ? 1 : 0, TIMING);
  }, [active, lit]);

  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(lit.value, [0, 1], [idleColor, activeColor]),
    opacity: interpolate(lit.value, [0, 1], [past ? INACTIVE_OPACITY * 0.8 : INACTIVE_OPACITY, 1]),
    transform: [{ scale: interpolate(lit.value, [0, 1], [0.97, 1]) }],
  }));
  const romanStyle = useAnimatedStyle(() => ({
    opacity: interpolate(lit.value, [0, 1], [INACTIVE_OPACITY * 0.8, 0.8]),
  }));

  return (
    <Pressable
      onPress={() => onSeek(time)}
      onLayout={(e) => onLayout(index, e.nativeEvent.layout.y)}
      accessibilityRole="button"
      accessibilityLabel={`Play from "${text}"`}
      style={lineStyles.press}
    >
      {active && (
        <Animated.View
          pointerEvents="none"
          entering={FadeIn.duration(LINE_FADE_MS)}
          exiting={FadeOut.duration(LINE_FADE_MS)}
          style={lineStyles.plate}
        >
          <Glass variant="clear" lite radius={radius.md} style={StyleSheet.absoluteFill} tintOpacity={resolved === 'dark' ? 0.1 : 0.5} />
        </Animated.View>
      )}
      <Animated.Text style={[lineStyles.line, { fontSize, lineHeight }, textStyle]}>{text}</Animated.Text>
      {roman && (
        <Animated.Text style={[lineStyles.roman, romanStyle]} numberOfLines={2}>
          {roman}
        </Animated.Text>
      )}
    </Pressable>
  );
});

const lineStyles = StyleSheet.create({
  press: {
    paddingVertical: space[3],
    paddingHorizontal: space[3],
    marginHorizontal: -space[3],
  },
  plate: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.md, overflow: 'hidden' },
  line: { fontFamily: type.title1.fontFamily, letterSpacing: -0.6, transformOrigin: 'left center' },
  roman: { ...type.subhead, fontSize: 13.5, lineHeight: 19, color: '#FFFFFF', marginTop: space[1] },
});

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.background },
    header: { paddingHorizontal: layout.screenPadding, paddingBottom: space[2] },
    grabber: {
      alignSelf: 'center',
      width: 38,
      height: 5,
      borderRadius: 3,
      backgroundColor: color.labelTertiary,
      marginTop: space[1],
      marginBottom: space[2],
      opacity: 0.6,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    headerText: { flex: 1, alignItems: 'center', gap: 2 },
    headerTitle: { ...type.headline, color: color.onArtwork },
    headerSub: { opacity: 0.65 },
    tools: { marginBottom: space[2] },
    content: { paddingHorizontal: layout.screenPadding, paddingTop: space[4], flexGrow: 1 },
    gap: { height: space[5] },
    plainBlock: { paddingTop: space[2] },
    unsynced: { marginBottom: space[4] },
    plain: { ...type.bodyRegular, color: color.onArtwork },
    plainRoman: { ...type.subhead, fontSize: 14, lineHeight: 22, color: color.labelSecondary, marginTop: space[5] },
    state: { flexGrow: 1, justifyContent: 'center' },
    follow: { position: 'absolute', alignSelf: 'center' },
  });
