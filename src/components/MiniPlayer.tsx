import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import TrackPlayer, { useActiveMediaItem, useIsPlaying, useProgress } from '@rntp/player';

import Animated, { FadeInDown, useAnimatedStyle } from 'react-native-reanimated';

import { ArtworkWell } from './ArtworkWell';
import { PressScale } from './Pressable';
import { springs, useSpringValue } from '../theme/motion';
import {
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
} from './icons';
import { usePlayerUiStore } from '../store/usePlayerUiStore';
import { icon, radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

/**
 * The playing half of the floating dock.
 *
 * Renders nothing when the queue is empty, so the dock collapses to just the
 * three nav icons until there is something to control, then grows to hold it.
 * It draws no background of its own — the dock owns the panel fill and the
 * radius, and a second background here would show as a square inside a curve.
 *
 * The progress line sits below the track, between it and the nav row. At the
 * top of the dock it read as a divider belonging to whatever screen was above
 * it; between the two halves it reads as what it is — the state of the thing
 * directly above it.
 */
/** Diameter of the position knob. */
const KNOB_SIZE = 8;
/** Thickness of the readout, sized so the knob sits proud of it. */
const TRACK_HEIGHT = 4;

export function MiniPlayer() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const openPlayer = usePlayerUiStore((state) => state.openPlayer);
  const bodyRef = useRef<View>(null);
  const activeItem = useActiveMediaItem();
  const isPlaying = useIsPlaying();
  const progress = useProgress(1);
  const [trackWidth, setTrackWidth] = useState(0);

  // The artwork settles smaller while paused and springs back on play — the
  // same cue Apple Music gives on the full player, carried down to the dock.
  const artScale = useSpringValue(isPlaying ? 1 : 0.86, springs.gentle);
  const artStyle = useAnimatedStyle(() => ({ transform: [{ scale: artScale.value }] }));

  if (!activeItem) return null;

  const ratio =
    progress.duration > 0 ? Math.min(1, Math.max(0, progress.position / progress.duration)) : 0;

  return (
    // Rises into the dock the first time something plays, instead of the dock
    // jumping taller in a single frame.
    <Animated.View entering={new FadeInDown().springify().damping(springs.gentle.damping ?? 20)} style={styles.root}>
      <Pressable
        ref={bodyRef}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
        // Measured on press so the player knows where to grow from. Window
        // coordinates, since the overlay sits above the whole app.
        onPress={() =>
          bodyRef.current?.measureInWindow((x, y, width, height) =>
            openPlayer({ x, y, width, height }),
          )
        }
        accessibilityRole="button"
        accessibilityLabel={`Now playing: ${activeItem.title ?? 'track'}. Open player.`}
      >
        <Animated.View style={artStyle}>
          <ArtworkWell
            uri={typeof activeItem.artworkUrl === 'string' ? activeItem.artworkUrl : undefined}
            size={44}
            surface="panel"
          />
        </Animated.View>

        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {activeItem.title ?? 'Unknown title'}
          </Text>
          {activeItem.artist != null && (
            <Text style={styles.artist} numberOfLines={1}>
              {activeItem.artist}
            </Text>
          )}
        </View>

        <View style={styles.transport}>
          <Control
            label="Previous"
            onPress={() => TrackPlayer.skipToPrevious()}
            glyph={
              <IconPlayerSkipBack
                size={icon.sizeSmall}
                strokeWidth={icon.strokeWidth}
                color={color.label}
              />
            }
          />

          <PressScale
            noOrigin
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
            hitSlop={space[2]}
            onPress={() => (isPlaying ? TrackPlayer.pause() : TrackPlayer.play())}
            scaleTo={0.84}
            style={styles.playButton}
          >
            {isPlaying ? (
              <IconPlayerPauseFilled size={icon.size} color={color.accentInk} />
            ) : (
              <IconPlayerPlayFilled size={icon.size} color={color.accentInk} />
            )}
          </PressScale>

          <Control
            label="Next"
            onPress={() => TrackPlayer.skipToNext()}
            glyph={
              <IconPlayerSkipForward
                size={icon.sizeSmall}
                strokeWidth={icon.strokeWidth}
                color={color.label}
              />
            }
          />
        </View>
      </Pressable>

      {/* A readout, not a control. Seeking belongs on the full player.
          The knob rides the fill and hollows out when paused, so the dock says
          whether music is running without needing the play icon read. */}
      <View
        style={styles.progressTrack}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      >
        <View style={[styles.progressFill, { width: `${ratio * 100}%` }]} />
        {trackWidth > 0 && (
          <View
            style={[
              styles.knob,
              isPlaying ? styles.knobPlaying : styles.knobPaused,
              // Centred on the fill's leading edge, and clamped so it never
              // hangs off either end of the dock.
              {
                left: Math.min(
                  trackWidth - KNOB_SIZE,
                  Math.max(0, ratio * trackWidth - KNOB_SIZE / 2),
                ),
              },
            ]}
          />
        )}
      </View>
    </Animated.View>
  );
}

function Control({
  label,
  glyph,
  onPress,
}: {
  label: string;
  glyph: React.ReactNode;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <PressScale
      noOrigin
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={space[2]}
      onPress={onPress}
      scaleTo={0.8}
      style={styles.control}
    >
      {glyph}
    </PressScale>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: {},

    body: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: space[3],
      paddingVertical: space[2],
    },
    pressed: { opacity: 0.6 },

    text: { flex: 1, marginLeft: space[3], marginRight: space[2] },
    title: { ...type.callout, color: color.label },
    artist: { ...type.caption, color: color.labelSecondary, marginTop: 2 },

    transport: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
    control: { padding: space[1] },

    playButton: {
      width: 38,
      height: 38,
      borderRadius: radius.full,
      backgroundColor: color.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },

    progressTrack: {
      height: TRACK_HEIGHT,
      marginHorizontal: space[4],
      borderRadius: radius.full,
      backgroundColor: color.fillSecondary,
      justifyContent: 'center',
    },
    progressFill: { height: '100%', borderRadius: radius.full, backgroundColor: color.accent },
    knob: {
      position: 'absolute',
      width: KNOB_SIZE,
      height: KNOB_SIZE,
      borderRadius: KNOB_SIZE / 2,
      borderWidth: 1.5,
      borderColor: color.accent,
    },
    knobPlaying: { backgroundColor: color.accent },
    // Hollow: the dock's own surface shows through the ring.
    knobPaused: { backgroundColor: color.panel },
  });
