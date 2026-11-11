import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TrackPlayer, { useActiveMediaItem, useIsPlaying, useProgress } from '@rntp/player';

import { AmbientBackground } from '../components/AmbientBackground';
import { Appear } from '../components/Appear';
import { DotText, Display } from '../components/Display';
import { ArtworkFace } from '../components/faces/ArtworkFace';
import { TapeFace } from '../components/faces/TapeFace';
import { VinylFace } from '../components/faces/VinylFace';
import { IconButton } from '../components/IconButton';
import {
  IconArrowsShuffle,
  IconChevronDown,
  IconDeviceAudioTape,
  IconDots,
  IconGauge,
  IconHeart,
  IconHeartFilled,
  IconListDetails,
  IconMicrophone2,
  IconMoon,
  IconPhoto,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipBackFilled,
  IconPlayerSkipForwardFilled,
  IconRepeat,
  IconRepeatOnce,
  IconVinyl,
  type IconComponent,
} from '../components/icons';
import { Keycap } from '../components/Keycap';
import { Label } from '../components/Label';
import { Led } from '../components/Led';
import { PlayerToolsSheet } from '../components/PlayerToolsSheet';
import { ScrubBar } from '../components/ScrubBar';
import { SleepTimerSheet } from '../components/SleepTimerSheet';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { useQueuePosition } from '../hooks/useQueuePosition';
import { sleepLabel, useSleepTimer } from '../hooks/useSleepTimer';
import { navigateToAlbum, navigateToArtist } from '../navigation/ref';
import { extrasOf, formatPlate, isLossless, songFromMediaItem } from '../player/trackMapping';
import { useFavoritesStore, useStarred } from '../store/useFavoritesStore';
import { usePlayerStore, type SourceKind } from '../store/usePlayerStore';
import { usePlayerUiStore } from '../store/usePlayerUiStore';
import { useSettingsStore, type PlayerFace } from '../store/useSettingsStore';
import { toast } from '../store/useToastStore';
import { useMotion } from '../theme/motion';
import { layout, radius, space, stroke, type, withAlpha } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * The player: a face, a display and a row of keys.
 *
 * The face is the record — its cover, a spinning disc, or a cassette whose
 * tape winds across as the song plays — and it answers to the hand: drag it
 * sideways to change track and it leaves the way it was pushed while the
 * next comes in behind it; double-tap it to like. Below, the black display
 * reads out what's playing the way a device does: position in the queue,
 * the format plate, the title. The ruler under it is the position, and the
 * keys under that are the transport.
 *
 * Everything here renders against the immersive palette (see
 * PlayerOverlay): light type over the artwork's colour.
 */

const FACES: PlayerFace[] = ['artwork', 'vinyl', 'tape'];
const FACE_ICON = { artwork: IconPhoto, vinyl: IconVinyl, tape: IconDeviceAudioTape } as const;
const FACE_LABEL = { artwork: 'Art', vinyl: 'Vinyl', tape: 'Tape' } as const;

const SKIP_DISTANCE = 90;
/** If a skip brings no new track within this, the face stops waiting for one. */
const ARRIVAL_TIMEOUT_MS = 700;

/** How the header names where the queue came from. */
const SOURCE_EYEBROW: Record<SourceKind, string> = {
  album: 'Playing from album',
  playlist: 'Playing from playlist',
  liked: 'Playing from your likes',
  artist: 'Playing from artist',
  genre: 'Playing from genre',
  radio: 'Playing radio',
  mix: 'Playing mix',
  search: 'Playing from search',
  history: 'Playing from history',
  restored: 'Picking up from',
};

export function NowPlayingScreen() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { reduce, timings, springs } = useMotion();

  const closePlayer = usePlayerUiStore((state) => state.closePlayer);
  const openQueue = usePlayerUiStore((state) => state.openQueue);
  const openLyrics = usePlayerUiStore((state) => state.openLyrics);

  const activeItem = useActiveMediaItem();
  const isPlaying = useIsPlaying();
  const { position, duration } = useProgress(1);
  const queuePosition = useQueuePosition();

  const shuffled = usePlayerStore((state) => state.shuffled);
  const setShuffled = usePlayerStore((state) => state.setShuffled);
  const repeat = usePlayerStore((state) => state.repeat);
  const cycleRepeat = usePlayerStore((state) => state.cycleRepeat);
  const speed = usePlayerStore((state) => state.speed);
  const source = usePlayerStore((state) => state.source);
  const face = useSettingsStore((state) => state.playerFace);
  const updateSettings = useSettingsStore((state) => state.update);
  const setStarred = useFavoritesStore((state) => state.setStarred);

  const extras = extrasOf(activeItem);
  // One object per track, not per render: this screen re-renders every
  // second with the position, and the sheets below key their state on it.
  const song = useMemo(() => songFromMediaItem(activeItem), [activeItem]);
  const starred = useStarred(extras?.subsonicId, Boolean(extras?.starred));
  const { state: sleep } = useSleepTimer();

  const [sheet, setSheet] = useState<'none' | 'actions' | 'sleep' | 'tools'>('none');
  const [faceArea, setFaceArea] = useState({ width: 0, height: 0 });

  const total = duration || activeItem?.duration || 0;
  const ratio = total > 0 ? Math.min(1, position / total) : 0;

  // --- Face gestures ---------------------------------------------------------

  const offset = useSharedValue(0);
  const burst = useSharedValue(0);
  const mediaId = activeItem?.mediaId;

  /**
   * Whether a skip in each direction will bring a different track. Previous
   * restarts the current one after a few seconds, and Next does nothing at
   * the end of a queue that isn't repeating — and a face that slid away for
   * a track that then never came would leave the player empty. Shared
   * values, because the gesture decides on the UI thread.
   */
  const previousChanges = useSharedValue(false);
  const nextChanges = useSharedValue(false);
  useEffect(() => {
    previousChanges.value = position <= 3 && (queuePosition.index > 0 || repeat === 'all');
    nextChanges.value =
      queuePosition.length > 1 &&
      (queuePosition.index < queuePosition.length - 1 || repeat === 'all');
  }, [position, queuePosition.index, queuePosition.length, repeat, previousChanges, nextChanges]);

  /**
   * A swipe-skip in flight. The old face leaves in the direction it was
   * pushed; the new one comes in from the other side once both things are
   * true — the old one has gone, and the player has actually changed track.
   * Waiting for both is what keeps the outgoing cover from sliding back in
   * as itself and then swapping.
   */
  const arrival = useRef<{
    direction: 1 | -1;
    left: boolean;
    changed: boolean;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const settleArrival = useCallback(
    (timedOut: boolean) => {
      const pending = arrival.current;
      if (!pending) return;
      if (!timedOut && !(pending.left && pending.changed)) return;
      clearTimeout(pending.timer);
      arrival.current = null;
      // Timed out — no new track came — so whatever is there just returns.
      if (!timedOut) offset.value = pending.direction * windowWidth * 0.55;
      offset.value = withSpring(0, springs.settle);
    },
    [offset, windowWidth, springs],
  );

  const beginArrival = useCallback(
    (direction: 1 | -1) => {
      if (arrival.current) clearTimeout(arrival.current.timer);
      arrival.current = {
        direction,
        left: false,
        changed: false,
        timer: setTimeout(() => settleArrival(true), ARRIVAL_TIMEOUT_MS),
      };
    },
    [settleArrival],
  );

  const faceLeft = useCallback(() => {
    if (!arrival.current) return;
    arrival.current.left = true;
    settleArrival(false);
  }, [settleArrival]);

  useEffect(() => {
    if (!arrival.current) return;
    arrival.current.changed = true;
    settleArrival(false);
  }, [mediaId, settleArrival]);

  useEffect(
    () => () => {
      if (arrival.current) clearTimeout(arrival.current.timer);
    },
    [],
  );

  const skip = useCallback((direction: 1 | -1) => {
    haptics.press();
    if (direction > 0) TrackPlayer.skipToNext();
    else TrackPlayer.skipToPrevious();
  }, []);

  const like = useCallback(() => {
    if (!extras) return;
    // The heart rises over the cover either way: on a track already liked it
    // is the answer to "did that take?", and double-tap never unlikes.
    if (!reduce) {
      burst.value = 0;
      burst.value = withTiming(1, { duration: 700 });
    }
    if (!starred) {
      void setStarred(
        { id: extras.subsonicId, kind: 'song', albumId: extras.albumId, title: activeItem?.title },
        true,
      );
    } else {
      haptics.tick();
    }
  }, [extras, starred, setStarred, activeItem?.title, reduce, burst]);

  const exit = timings.exit;
  const settle = springs.settle;

  const pan = Gesture.Pan()
    .activeOffsetX([-18, 18])
    .failOffsetY([-14, 14])
    .onUpdate((event) => {
      offset.value = event.translationX;
    })
    .onEnd((event, success) => {
      const fling = Math.abs(event.velocityX) > 900;
      // `success` is false when the system took the gesture back; that is
      // not a decision to change track.
      if (success && (Math.abs(event.translationX) > SKIP_DISTANCE || fling)) {
        const direction = event.translationX < 0 ? 1 : -1;
        const changes = direction > 0 ? nextChanges.value : previousChanges.value;
        if (changes) {
          // Off the side it was pushed toward; the next face follows it in.
          runOnJS(beginArrival)(direction);
          runOnJS(skip)(direction);
          offset.value = withTiming(-direction * windowWidth, exit, (finished) => {
            if (finished) runOnJS(faceLeft)();
          });
          return;
        }
        runOnJS(skip)(direction);
      }
      offset.value = withSpring(0, settle);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(260)
    .onEnd((_event, success) => {
      if (success) runOnJS(like)();
    });

  const faceGesture = Gesture.Race(pan, doubleTap);

  // The face follows the finger, tilting a touch as it goes, the way a card
  // pushed across a table does.
  const faceStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offset.value },
      { rotate: `${interpolate(offset.value, [-windowWidth, 0, windowWidth], [-5, 0, 5])}deg` },
    ],
    opacity: interpolate(Math.abs(offset.value), [0, windowWidth * 0.9], [1, 0.35], 'clamp'),
  }));

  // The like, drawn over the cover: up fast, held, gone.
  const burstStyle = useAnimatedStyle(() => ({
    opacity: interpolate(burst.value, [0, 0.12, 0.65, 1], [0, 1, 1, 0]),
    transform: [{ scale: interpolate(burst.value, [0, 0.22, 0.4, 1], [0.3, 1.18, 1, 1.06]) }],
  }));

  const seek = useCallback((seconds: number) => TrackPlayer.seekTo(seconds), []);

  const onFaceLayout = useCallback((event: LayoutChangeEvent) => {
    const { width: w, height: h } = event.nativeEvent.layout;
    setFaceArea((current) =>
      Math.round(current.width) === Math.round(w) && Math.round(current.height) === Math.round(h)
        ? current
        : { width: w, height: h },
    );
  }, []);

  // --- Nothing playing -------------------------------------------------------

  if (!activeItem) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <AmbientBackground variant="immersive" />
        <View style={styles.header}>
          <IconButton icon={IconChevronDown} accessibilityLabel="Close player" onPress={closePlayer} />
        </View>
        <View style={styles.empty}>
          <Display style={styles.emptyDisplay}>
            <Label tone="displayDim">Status</Label>
            <DotText size={34}>NO SIGNAL</DotText>
            <Text style={styles.emptyHint}>Pick something from your library to play.</Text>
          </Display>
        </View>
      </View>
    );
  }

  const art = typeof activeItem.artworkUrl === 'string' ? activeItem.artworkUrl : undefined;
  const plate = formatPlate(extras?.suffix, extras?.bitDepth, extras?.samplingRate);
  const lossless = isLossless(extras?.suffix);
  const faceSize = Math.max(
    120,
    Math.min(faceArea.width - layout.screenPadding * 2, (face === 'tape' ? faceArea.height / 0.66 : faceArea.height) - 12, 420),
  );
  const counter =
    queuePosition.length > 0 && queuePosition.index >= 0
      ? `${String(queuePosition.index + 1).padStart(2, '0')}/${String(queuePosition.length).padStart(2, '0')}`
      : '--/--';
  const nextFace = FACES[(FACES.indexOf(face) + 1) % FACES.length];
  const sleepText = sleepLabel(sleep);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AmbientBackground variant="immersive" />

      {/* Header: close, where this is playing from, options. */}
      <View style={styles.header}>
        <IconButton icon={IconChevronDown} accessibilityLabel="Close player" onPress={closePlayer} />
        <View style={styles.headerText}>
          <Label tone="onArtwork" style={styles.headerEyebrow}>
            {source ? SOURCE_EYEBROW[source.kind] : 'Now playing'}
          </Label>
          {source ? (
            <Text style={styles.headerTitle} numberOfLines={1}>
              {source.label}
            </Text>
          ) : null}
        </View>
        <IconButton icon={IconDots} accessibilityLabel="Track options" onPress={() => setSheet('actions')} />
      </View>

      {/* The face: swipe to skip, double-tap to like. */}
      <View style={styles.faceArea} onLayout={onFaceLayout}>
        {faceArea.height > 0 && (
          <GestureDetector gesture={faceGesture}>
            <Animated.View style={[styles.face, faceStyle]}>
              {/* Keyed on the face, so switching between them is one fading
                  out of the way of the next rather than a cut. */}
              <Appear key={face} rise={0} style={styles.face}>
                {face === 'vinyl' ? (
                  <VinylFace uri={art} size={faceSize} playing={isPlaying} progress={ratio} />
                ) : face === 'tape' ? (
                  <TapeFace
                    size={faceSize}
                    playing={isPlaying}
                    progress={ratio}
                    title={activeItem.title}
                    subtitle={activeItem.artist}
                  />
                ) : (
                  <ArtworkFace uri={art} size={faceSize} />
                )}
              </Appear>
              <Animated.View pointerEvents="none" style={[styles.burst, burstStyle]}>
                <IconHeartFilled size={Math.round(faceSize * 0.3)} color={color.accent} />
              </Animated.View>
            </Animated.View>
          </GestureDetector>
        )}
      </View>

      <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, space[3]) + space[2] }]}>
        {/* The display. */}
        <Display style={styles.display}>
          <View style={styles.statusLine}>
            <Led color={isPlaying ? color.ledGreen : color.ledAmber} size={6} />
            <Label tone="display" bold>
              {counter}
            </Label>
            <View style={styles.statusSpacer} />
            {speed !== 1 && (
              <Label tone="accent" bold>
                {`${speed}×`}
              </Label>
            )}
            {plate && (
              <Label tone={lossless ? 'display' : 'displayDim'} bold={lossless}>
                {plate}
              </Label>
            )}
          </View>

          <View style={styles.titleRow}>
            {/* Keyed on the track: a new title fades up into the display
                rather than replacing the old one mid-glance. */}
            <Appear key={mediaId ?? 'none'} rise={5} style={styles.titleText}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Open album ${extras?.albumTitle ?? ''}`}
                disabled={!extras?.albumId}
                onPress={() => extras?.albumId && navigateToAlbum(extras.albumId, extras.albumTitle)}
              >
                {/* Shrinks a little to fit before it truncates; never scrolls. */}
                <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {activeItem.title ?? 'Unknown title'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Open artist ${activeItem.artist ?? ''}`}
                disabled={!extras?.artistId}
                onPress={() => extras?.artistId && navigateToArtist(extras.artistId, activeItem.artist)}
              >
                <Text style={styles.artist} numberOfLines={1}>
                  {activeItem.artist ?? 'Unknown artist'}
                </Text>
              </Pressable>
            </Appear>
            <IconButton
              icon={starred ? IconHeartFilled : IconHeart}
              accessibilityLabel={starred ? 'Unlike' : 'Like'}
              variant="plain"
              color={starred ? color.accent : color.displayInk}
              size={42}
              iconSize={22}
              popOn={starred}
              onPress={() =>
                extras &&
                void setStarred(
                  { id: extras.subsonicId, kind: 'song', albumId: extras.albumId, title: activeItem.title },
                  !starred,
                )
              }
            />
          </View>
        </Display>

        <View style={styles.scrub}>
          <ScrubBar position={position} duration={total} tone="onArtwork" onSeek={seek} />
        </View>

        {/* Transport. */}
        <View style={styles.transport}>
          <IconButton
            icon={IconArrowsShuffle}
            accessibilityLabel={shuffled ? 'Shuffle on' : 'Shuffle off'}
            variant="plain"
            active={shuffled}
            color={shuffled ? color.accent : withAlpha(color.onArtwork, 0.75)}
            size={44}
            iconSize={21}
            popOn={shuffled}
            onPress={() => toast.guard(setShuffled(!shuffled), "Couldn't change shuffle")}
          />
          <Keycap
            icon={IconPlayerSkipBackFilled}
            iconFilled
            variant="dark"
            size="lg"
            square
            accessibilityLabel="Previous track"
            onPress={() => TrackPlayer.skipToPrevious()}
          />
          <Keycap
            icon={isPlaying ? IconPlayerPauseFilled : IconPlayerPlayFilled}
            iconFilled
            variant="primary"
            size="lg"
            accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
            style={styles.playKey}
            onPress={() => (isPlaying ? TrackPlayer.pause() : TrackPlayer.play())}
          />
          <Keycap
            icon={IconPlayerSkipForwardFilled}
            iconFilled
            variant="dark"
            size="lg"
            square
            accessibilityLabel="Next track"
            onPress={() => TrackPlayer.skipToNext()}
          />
          <IconButton
            icon={repeat === 'one' ? IconRepeatOnce : IconRepeat}
            accessibilityLabel={`Repeat ${repeat}`}
            variant="plain"
            active={repeat !== 'off'}
            color={repeat !== 'off' ? color.accent : withAlpha(color.onArtwork, 0.75)}
            size={44}
            iconSize={21}
            popOn={repeat}
            onPress={cycleRepeat}
          />
        </View>

        {/* Tools: a function strip, one key per tool, sized to the width. */}
        <View style={styles.tools}>
          <ToolKey icon={IconListDetails} label="Queue" onPress={openQueue} />
          <ToolKey icon={IconMicrophone2} label="Lyrics" onPress={openLyrics} />
          <ToolKey
            icon={IconMoon}
            label={sleepText ?? 'Sleep'}
            active={sleep != null}
            onPress={() => setSheet('sleep')}
          />
          <ToolKey
            icon={IconGauge}
            label={speed === 1 ? 'Speed' : `${speed}×`}
            active={speed !== 1}
            onPress={() => setSheet('tools')}
          />
          <ToolKey
            icon={FACE_ICON[face]}
            label={FACE_LABEL[face]}
            accessibilityLabel={`Player face: ${FACE_LABEL[face]}. Switch to ${FACE_LABEL[nextFace]}.`}
            onPress={() => updateSettings({ playerFace: nextFace })}
            last
          />
        </View>
      </View>

      <TrackActionsSheet
        visible={sheet === 'actions'}
        onClose={() => setSheet('none')}
        song={song}
        hide={['play']}
      />
      <SleepTimerSheet visible={sheet === 'sleep'} onClose={() => setSheet('none')} />
      <PlayerToolsSheet visible={sheet === 'tools'} onClose={() => setSheet('none')} />
    </View>
  );
}

/** One key of the function strip: a glyph over a printed legend. */
function ToolKey({
  icon: Icon,
  label,
  onPress,
  active = false,
  last = false,
  accessibilityLabel,
}: {
  icon: IconComponent;
  label: string;
  onPress: () => void;
  active?: boolean;
  last?: boolean;
  accessibilityLabel?: string;
}) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const ink = active ? color.accent : color.onArtwork;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active }}
      onPress={() => {
        haptics.tick();
        onPress();
      }}
      style={({ pressed }) => [styles.toolKey, !last && styles.toolDivider, pressed && styles.toolPressed]}
    >
      <Icon size={20} color={ink} strokeWidth={1.9} />
      <Text style={[type.labelBold, styles.toolLegend, { color: active ? color.accent : withAlpha(color.onArtwork, 0.7) }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.screenPadding,
      paddingVertical: space[2],
      gap: space[3],
    },
    headerText: { flex: 1, alignItems: 'center' },
    headerEyebrow: { opacity: 0.7 },
    headerTitle: { ...type.callout, fontFamily: type.headline.fontFamily, color: color.onArtwork, marginTop: 2 },
    faceArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    face: { alignItems: 'center', justifyContent: 'center' },
    burst: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    controls: { paddingHorizontal: layout.screenPadding },
    display: { paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[3] },
    statusLine: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: space[2] },
    statusSpacer: { flex: 1 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    titleText: { flex: 1 },
    title: { ...type.title2, fontSize: 22, color: color.displayInk },
    artist: { ...type.body, color: color.accent, marginTop: 2 },
    scrub: { marginTop: space[3] },
    transport: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: space[3],
    },
    playKey: { width: 96 },
    tools: {
      flexDirection: 'row',
      marginTop: space[4],
      height: 58,
      borderRadius: radius.lg,
      backgroundColor: color.surface,
      borderWidth: stroke,
      borderColor: color.border,
      overflow: 'hidden',
    },
    toolKey: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5 },
    toolDivider: { borderRightWidth: 1, borderRightColor: withAlpha(color.onArtwork, 0.1) },
    toolPressed: { opacity: 0.55 },
    toolLegend: { fontSize: 8.5, letterSpacing: 0.9 },
    empty: { flex: 1, justifyContent: 'center', paddingHorizontal: layout.screenPadding },
    emptyDisplay: { padding: space[5], gap: space[2], borderRadius: radius.lg },
    emptyHint: { ...type.footnote, color: color.displayDim, marginTop: space[1] },
  });
