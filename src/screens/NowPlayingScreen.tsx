import { useEffect, useState } from 'react';
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
import TrackPlayer, {
  RepeatMode,
  useActiveMediaItem,
  useIsPlaying,
  useProgress,
} from '@rntp/player';

import { AmbientBackground } from '../components/AmbientBackground';
import { Glass } from '../components/Glass';
import { PressScale } from '../components/Pressable';
import { springs, useSpringValue } from '../theme/motion';
import { ArtworkWell, FormatBadge } from '../components/ArtworkWell';
import { ProgressBar } from '../components/ProgressBar';
import { TransportControls } from '../components/TransportControls';
import { EmptyState } from '../components/ScreenState';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import {
  IconChevronDown,
  IconDots,
  IconHeart,
  IconHeartFilled,
  IconMicrophone2,
  IconPlaylist,
} from '../components/icons';
import { navigateToAlbum, navigateToArtist } from '../navigation/ref';
import { extrasOf } from '../player/trackMapping';
import { usePlayerStore } from '../store/usePlayerStore';
import { usePlayerUiStore } from '../store/usePlayerUiStore';
import { useServerStore } from '../store/useServerStore';
import { icon, layout, motion, radius, space, type, withAlpha } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import type { Child } from '../types/subsonic';
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
/** How far the cover settles back while paused. */
const PAUSED_SCALE = 0.8;

/** Diameter of the glass buttons in the header. */
const HEADER_BUTTON = 38;

/** Crossfade between covers when the track changes. */
const COVER_FADE_MS = 260;

/** Peak of the artwork swell, and how long one breath takes. */
const BREATH_SCALE = 1.015;
const BREATH_PERIOD_MS = 2600;

export function NowPlayingScreen() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const closePlayer = usePlayerUiStore((state) => state.closePlayer);
  const openQueue = usePlayerUiStore((state) => state.openQueue);
  const openLyrics = usePlayerUiStore((state) => state.openLyrics);
  const { width } = useWindowDimensions();

  const activeItem = useActiveMediaItem();
  const isPlaying = useIsPlaying();
  const progress = useProgress(1);
  const client = useServerStore((state) => state.client);

  const shuffled = usePlayerStore((state) => state.shuffled);
  const setShuffled = usePlayerStore((state) => state.setShuffled);
  const [repeat, setRepeat] = useState<RepeatMode>(RepeatMode.Off);
  const extras = extrasOf(activeItem);
  const [starred, setStarred] = useState<boolean | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const isStarred = starred ?? extras?.starred ?? false;

  const artSize = Math.round(width * layout.artworkWidthRatio);


  if (!activeItem) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Header onClose={closePlayer} />
        <EmptyState label="Nothing playing" hint="Pick something from your library." />
      </View>
    );
  }

  /**
   * The playing track as a library record.
   *
   * The queue holds MediaItems, which carry only what the player needs; the
   * actions sheet works on Child like every other screen. Everything it needs
   * is already on the item or in its extras, so this reassembles rather than
   * refetches.
   */
  const actionSong: Child | null =
    activeItem && extras
      ? {
          id: extras.subsonicId,
          isDir: false,
          title: activeItem.title ?? '',
          artist: activeItem.artist,
          album: activeItem.albumTitle ?? extras.albumTitle,
          albumId: extras.albumId,
          artistId: extras.artistId,
          coverArt: extras.coverArt,
          duration: activeItem.duration,
          // Child carries a timestamp when starred; only its presence is read.
          starred: isStarred ? new Date().toISOString() : undefined,
        }
      : null;

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
    closePlayer();
    navigateToAlbum(extras.albumId, extras.albumTitle);
  }

  function openArtist() {
    if (!extras?.artistId) return;
    closePlayer();
    navigateToArtist(extras.artistId, activeItem?.artist);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
        {/* The whole screen becomes the cover's colours, drifting slowly —
            Apple Music's full-screen player rather than a tinted panel. */}
        <AmbientBackground variant="immersive" />

        <Header onClose={closePlayer} onOptions={() => setActionsOpen(true)} />

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
                  color={withAlpha(color.onArtwork, 0.75)}
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
              playing={isPlaying}
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
                  color={withAlpha(color.onArtwork, 0.75)}
                />
              }
              onPress={openQueue}
            />

            <FooterButton
              label="Lyrics"
              icon={
                <IconMicrophone2
                  size={icon.sizeSmall}
                  strokeWidth={icon.strokeWidth}
                  color={withAlpha(color.onArtwork, 0.75)}
                />
              }
              onPress={openLyrics}
            />
          </View>
        </View>

        <TrackActionsSheet
          visible={actionsOpen}
          onClose={() => setActionsOpen(false)}
          song={actionSong}
          onStarChanged={() => setStarred(!isStarred)}
        />
    </View>
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
  // Separate from the breath so the two never fight: this one springs the
  // cover back when music stops, the way Apple Music's player does, and the
  // breath only runs on top of it while playing.
  const rest = useSpringValue(playing ? 1 : PAUSED_SCALE, springs.gentle);

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

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value * rest.value }] }));

  return (
    <Animated.View style={style}>
      <ArtworkWell uri={uri} size={size} surface="panel" transitionMs={COVER_FADE_MS} />
    </Animated.View>
  );
}

/**
 * Sleep timer on the left, dismiss on the right.
 *
 * The screen title is gone: a full-bleed player showing one album cover does
 * not need a caption telling you it is the player.
 */
function Header({ onClose, onOptions }: { onClose: () => void; onOptions?: () => void }) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.header}>
      {/* Left slot, empty when nothing is playing so the chevron keeps its
          place rather than sliding across. */}
      {onOptions ? (
        <PressScale
          noOrigin
          accessibilityRole="button"
          accessibilityLabel="Track options"
          hitSlop={space[3]}
          onPress={onOptions}
          scaleTo={0.86}
          style={styles.headerButton}
        >
          <Glass variant="thin" lite radius={HEADER_BUTTON / 2} style={StyleSheet.absoluteFill} />
          <IconDots size={icon.size} strokeWidth={2} color={color.onArtwork} />
        </PressScale>
      ) : (
        <View style={styles.headerButton} />
      )}

      <PressScale
        noOrigin
        accessibilityRole="button"
        accessibilityLabel="Minimise player"
        hitSlop={space[3]}
        onPress={onClose}
        scaleTo={0.86}
        style={styles.headerButton}
      >
        <Glass variant="thin" lite radius={HEADER_BUTTON / 2} style={StyleSheet.absoluteFill} />
        <IconChevronDown size={icon.size} strokeWidth={2} color={color.onArtwork} />
      </PressScale>
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
    <PressScale
      noOrigin
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scaleTo={0.92}
      style={styles.footerButton}
    >
      <Glass variant="thin" lite radius={radius.full} style={StyleSheet.absoluteFill} />
      {glyph}
      <Text style={styles.footerLabel}>{label}</Text>
    </PressScale>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    // Full-bleed, no radius: this is the whole screen, not a panel inset in one.
    root: { flex: 1, backgroundColor: color.background },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.panelPadding,
      paddingVertical: space[3],
    },
    headerButton: {
      width: HEADER_BUTTON,
      height: HEADER_BUTTON,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },

    artArea: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: space[4],
    },

    controls: { paddingHorizontal: layout.panelPadding },

    meta: { flexDirection: 'row', alignItems: 'flex-start' },
    metaText: { flex: 1 },
    title: { ...type.title3, fontSize: 22, color: color.onArtwork },
    artist: { ...type.body, color: withAlpha(color.onArtwork, 0.7), marginTop: space[1] },
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
      borderRadius: radius.full,
      backgroundColor: withAlpha(color.onArtwork, 0.12),
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
      paddingHorizontal: space[4],
      borderRadius: radius.full,
    },
    footerLabel: { ...type.callout, color: color.onArtwork },

    pressed: { opacity: 0.6 },
  });
