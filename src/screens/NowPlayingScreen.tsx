import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import TrackPlayer, {
  RepeatMode,
  useActiveMediaItem,
  useIsPlaying,
  useProgress,
} from '@rntp/player';

import { AmbientBackground } from '../components/AmbientBackground';
import { DismissibleSheet } from '../components/DismissibleSheet';
import { ArtworkWell, FormatBadge } from '../components/ArtworkWell';
import { SleepTimerSheet } from '../components/SleepTimerSheet';
import { ProgressBar } from '../components/ProgressBar';
import { TransportControls } from '../components/TransportControls';
import { EmptyState } from '../components/ScreenState';
import {
  IconChevronDown,
  IconHeart,
  IconHeartFilled,
  IconMicrophone2,
  IconMoon,
  IconPlaylist,
} from '../components/icons';
import { extrasOf } from '../player/trackMapping';
import { usePlayerStore } from '../store/usePlayerStore';
import { useServerStore } from '../store/useServerStore';
import { hairline, icon, layout, motion, space, type, withAlpha } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

/**
 * Now Playing — full-screen panel, per spec 5.1.
 *
 * Full-bleed with no radius because it is a whole screen rather than a panel
 * inset into one. The accent appears exactly twice: the progress fill and the
 * play button (plus the heart when favourited, which is a state, not
 * decoration) — which is what keeps it meaningful.
 *
 * Artwork is 80% of the screen width rather than edge to edge. Full width left
 * the art touching both sides with no margin to sit in, which reads as a
 * cropping accident rather than as a deliberate frame.
 *
 * The title and artist are links: the album and the artist are the two places
 * you actually want to go from a track you're listening to, and making you
 * back out and search for them was the long way round.
 */
/** Peak of the artwork swell, and how long one breath takes. */
const BREATH_SCALE = 1.015;
const BREATH_PERIOD_MS = 2600;

export function NowPlayingScreen() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const activeItem = useActiveMediaItem();
  const isPlaying = useIsPlaying();
  const progress = useProgress(1);
  const client = useServerStore((state) => state.client);

  const shuffled = usePlayerStore((state) => state.shuffled);
  const setShuffled = usePlayerStore((state) => state.setShuffled);
  const [repeat, setRepeat] = useState<RepeatMode>(RepeatMode.Off);
  const [timerOpen, setTimerOpen] = useState(false);
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);

  /**
   * Reads the native timer.
   *
   * The countdown is owned by the player so it survives the JS runtime being
   * suspended, which means the only way to know where it is up to is to ask.
   */
  const readSleepTimer = useCallback(() => {
    const timer = TrackPlayer.getSleepTimer();
    setSleepRemaining(timer?.type === 'time' ? timer.remainingSeconds : null);
  }, []);

  // A minute is plenty for a countdown measured in tens of them, and keeps
  // this off the once-a-second path the progress bar is already on.
  useEffect(() => {
    readSleepTimer();
    const poll = setInterval(readSleepTimer, 60_000);
    return () => clearInterval(poll);
  }, [readSleepTimer]);

  const extras = extrasOf(activeItem);
  const [starred, setStarred] = useState<boolean | null>(null);
  const isStarred = starred ?? extras?.starred ?? false;

  const artSize = Math.round(width * layout.artworkWidthRatio);


  if (!activeItem) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Header onClose={() => navigation.goBack()} onSleepTimer={() => setTimerOpen(true)} />
        <EmptyState label="Nothing playing" hint="Pick something from your library." />
      </View>
    );
  }

  async function toggleStar() {
    if (!client || !extras) return;
    const next = !isStarred;
    // Optimistic: the heart should respond to the tap, not to the round trip.
    setStarred(next);
    try {
      if (next) await client.star({ id: extras.subsonicId });
      else await client.unstar({ id: extras.subsonicId });
    } catch {
      setStarred(!next); // server refused — put it back
    }
  }

  function openAlbum() {
    if (!extras?.albumId) return;
    navigation.goBack();
    navigation.navigate('Tabs', {
      screen: 'Library',
      params: {
        screen: 'Album',
        params: { albumId: extras.albumId, albumName: extras.albumTitle },
      },
    });
  }

  function openArtist() {
    if (!extras?.artistId) return;
    navigation.goBack();
    navigation.navigate('Tabs', {
      screen: 'Library',
      params: {
        screen: 'Artist',
        params: { artistId: extras.artistId, artistName: activeItem?.artist },
      },
    });
  }

  return (
    <DismissibleSheet onDismiss={() => navigation.goBack()} style={[styles.root, { paddingTop: insets.top }]}>
        {/* Behind everything, tinted by the current cover. */}
        <AmbientBackground />

        <Header
          onClose={() => navigation.goBack()}
          onSleepTimer={() => setTimerOpen(true)}
          timerActive={sleepRemaining != null}
        />

        {/* Absorbs the slack; everything below keeps its natural height. */}
        <View style={styles.artArea}>
          <BreathingArtwork
            uri={typeof activeItem.artworkUrl === 'string' ? activeItem.artworkUrl : undefined}
            size={artSize}
            playing={isPlaying}
          />
        </View>

        <View style={[styles.controls, { paddingBottom: insets.bottom + space[3] }]}>
          <View style={styles.meta}>
            <View style={styles.metaText}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Open album ${extras?.albumTitle ?? ''}`}
                disabled={!extras?.albumId}
                onPress={openAlbum}
                style={({ pressed }) => (pressed ? styles.pressed : null)}
              >
                <Text style={styles.title} numberOfLines={2}>
                  {activeItem.title ?? 'Unknown title'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Open artist ${activeItem.artist ?? ''}`}
                disabled={!extras?.artistId}
                onPress={openArtist}
                style={({ pressed }) => (pressed ? styles.pressed : null)}
              >
                <Text style={styles.artist} numberOfLines={1}>
                  {activeItem.artist ?? 'Unknown artist'}
                </Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isStarred ? 'Remove favourite' : 'Favourite'}
              hitSlop={space[3]}
              onPress={() => void toggleStar()}
              style={({ pressed }) => [styles.heart, pressed && styles.pressed]}
            >
              {isStarred ? (
                <IconHeartFilled size={icon.size} color={color.accent} />
              ) : (
                <IconHeart
                  size={icon.size}
                  strokeWidth={icon.strokeWidth}
                  color={color.textInverseSecondary}
                />
              )}
            </Pressable>
          </View>

          {/* The format readout sits between the title and the bar. It is a
            property of the track, so it belongs with the track's name rather
            than up in the chrome where it read as a screen title. */}
          <View style={styles.badgeRow}>
            <View style={styles.badgeCapsule}>
              <FormatBadge
                suffix={extras?.suffix}
                bitDepth={extras?.bitDepth}
                samplingRate={extras?.samplingRate}
              />
            </View>
          </View>

          <View style={styles.progress}>
            <ProgressBar
              position={progress.position}
              duration={progress.duration || activeItem.duration}
              surface="panel"
              onSeek={(seconds) => TrackPlayer.seekTo(seconds)}
            />
          </View>

          <TransportControls
            playing={isPlaying}
            shuffle={shuffled}
            repeat={
              repeat === RepeatMode.One ? 'one' : repeat === RepeatMode.All ? 'all' : 'off'
            }
            onPlayPause={() => (isPlaying ? TrackPlayer.pause() : TrackPlayer.play())}
            onPrevious={() => TrackPlayer.skipToPrevious()}
            onNext={() => TrackPlayer.skipToNext()}
            // Reorders the real queue rather than flipping the player's own
            // shuffle mode, so what the queue screen shows stays true.
            onToggleShuffle={() => void setShuffled(!shuffled)}
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

          <View style={styles.footer}>
            <FooterButton
              label="Queue"
              icon={
                <IconPlaylist
                  size={icon.sizeSmall}
                  strokeWidth={icon.strokeWidth}
                  color={color.textInverseSecondary}
                />
              }
              onPress={() => navigation.navigate('Queue')}
            />

            {/* Not wired up yet — deliberately inert rather than hidden, so the
              footer keeps its balance while the feature is built. */}
            <FooterButton
              label="Lyrics"
              icon={
                <IconMicrophone2
                  size={icon.sizeSmall}
                  strokeWidth={icon.strokeWidth}
                  color={color.textInverseSecondary}
                />
              }
            />
          </View>
        </View>

        <SleepTimerSheet
          visible={timerOpen}
          onClose={() => setTimerOpen(false)}
          remainingSeconds={sleepRemaining}
          onChanged={readSleepTimer}
        />
    </DismissibleSheet>
  );
}

/**
 * Artwork that breathes while the music plays.
 *
 * Not beat-synced — nothing here knows where the beats are, and guessing would
 * be worse than not trying. This is a slow swell on a fixed cycle, about one
 * and a half percent, which reads as the screen being alive rather than as an
 * effect. It settles back to rest on pause rather than freezing mid-swell,
 * so a paused player looks deliberately still.
 */
function BreathingArtwork({
  uri,
  size,
  playing,
}: {
  uri?: string;
  size: number;
  playing: boolean;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!playing) {
      cancelAnimation(scale);
      scale.value = withTiming(1, { duration: motion.durationScreen });
      return;
    }

    scale.value = withRepeat(
      withTiming(BREATH_SCALE, {
        duration: BREATH_PERIOD_MS,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );

    return () => cancelAnimation(scale);
  }, [playing, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style}>
      <ArtworkWell uri={uri} size={size} surface="panel" />
    </Animated.View>
  );
}

/**
 * Sleep timer on the left, dismiss on the right.
 *
 * The screen title is gone: a full-bleed player showing one album cover does
 * not need a caption telling you it is the player.
 */
function Header({
  onClose,
  onSleepTimer,
  timerActive = false,
}: {
  onClose: () => void;
  onSleepTimer: () => void;
  timerActive?: boolean;
}) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sleep timer"
        hitSlop={space[3]}
        onPress={onSleepTimer}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
      >
        {/* Accented while a timer is running — state, not decoration. */}
        <IconMoon
          size={icon.size}
          strokeWidth={icon.strokeWidth}
          color={timerActive ? color.accent : color.textInverseSecondary}
        />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Minimise player"
        hitSlop={space[3]}
        onPress={onClose}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
      >
        <IconChevronDown
          size={icon.size}
          strokeWidth={icon.strokeWidth}
          color={color.textInverseSecondary}
        />
      </Pressable>
    </View>
  );
}

function FooterButton({
  label,
  icon: glyph,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  onPress?: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.footerButton, pressed && styles.pressed]}
    >
      {glyph}
      <Text style={styles.footerLabel}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    // Full-bleed, no radius: this is the whole screen, not a panel inset in one.
    root: { flex: 1, backgroundColor: color.panel },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.panelPadding,
      paddingVertical: space[3],
    },
    headerButton: { padding: space[1] },

    artArea: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: space[4],
    },

    controls: { paddingHorizontal: layout.panelPadding },

    meta: { flexDirection: 'row', alignItems: 'flex-start' },
    metaText: { flex: 1 },
    title: { ...type.display, color: color.textInverse },
    artist: { ...type.meta, color: color.textInverseSecondary, marginTop: space[1] },
    heart: { marginLeft: space[4], paddingTop: space[1] },

    badgeRow: { marginTop: space[4], alignItems: 'center' },
    /**
     * A capsule around the format readout, at the dock's radius.
     *
     * Left bare and left-aligned it read as a stray line of metadata. Centred
     * in a faint chip it reads as a spec plate, which is what it is — kept to
     * a low-contrast fill so it never competes with the track title above it.
     */
    badgeCapsule: {
      paddingHorizontal: space[3],
      paddingVertical: space[1],
      borderRadius: layout.dockRadius,
      borderWidth: hairline,
      borderColor: color.panelLine,
      backgroundColor: withAlpha(color.panelRaised, layout.floatingOpacity),
    },
    progress: { marginTop: space[2], marginBottom: space[5] },

    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: space[5],
    },
    footerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      paddingVertical: space[2],
      paddingHorizontal: space[2],
    },
    footerLabel: { ...type.label, color: color.textInverseSecondary },

    pressed: { opacity: 0.6 },
  });
