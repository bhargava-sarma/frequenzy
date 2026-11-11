import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import TrackPlayer, { useActiveMediaItem, useIsPlaying, useProgress } from '@rntp/player';

import { Artwork } from './Artwork';
import { IconButton } from './IconButton';
import { IconPlayerPauseFilled, IconPlayerPlayFilled, IconPlayerSkipForwardFilled } from './icons';
import { useArtwork } from '../hooks/useArtwork';
import { extrasOf } from '../player/trackMapping';
import { useMotion } from '../theme/motion';
import { space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { usePlayerUiStore } from '../store/usePlayerUiStore';
import { haptics } from '../utils/haptics';

/**
 * The playing half of the dock.
 *
 * Renders nothing with an empty queue, so the dock is just the tabs until
 * there is something to control. Tap to open the player, or swipe the row
 * sideways to skip, the way you'd thumb a cassette deck's transport without
 * looking. A hairline along the bottom reads position; the player reports
 * once a second, and the line glides between reports rather than ticking.
 */
const SKIP_DISTANCE = 70;
/** A report further than this from the last one is a seek or a new track: jump, don't glide. */
const GLIDE_LIMIT_SECONDS = 2.5;

export const MiniPlayer = memo(function MiniPlayer() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { reduce, timings, springs } = useMotion();
  const openPlayer = usePlayerUiStore((state) => state.openPlayer);
  const activeItem = useActiveMediaItem();
  const isPlaying = useIsPlaying();
  const { position, duration } = useProgress(1);
  const artworkUrl = useArtwork();

  const offset = useSharedValue(0);
  const fill = useSharedValue(0);
  const appear = useSharedValue(0);

  const total = duration || activeItem?.duration || 0;
  const ratio = total > 0 ? Math.min(1, Math.max(0, position / total)) : 0;

  useEffect(() => {
    const jumped = total <= 0 || Math.abs(ratio - fill.value) * total > GLIDE_LIMIT_SECONDS;
    if (reduce || jumped) fill.value = ratio;
    else fill.value = withTiming(ratio, { duration: 1000, easing: Easing.linear });
  }, [ratio, total, reduce, fill]);

  // The row fades up when there is first something to show.
  const showing = activeItem != null;
  useEffect(() => {
    appear.value = showing ? withTiming(1, timings.appear) : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showing, appear]);

  const skip = (direction: 1 | -1) => {
    haptics.press();
    if (direction > 0) TrackPlayer.skipToNext();
    else TrackPlayer.skipToPrevious();
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-16, 16])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      offset.value = event.translationX * 0.6;
    })
    .onEnd((event, success) => {
      // A drag the system took back — an edge gesture, an incoming call —
      // is not a decision to skip.
      if (success && (Math.abs(event.translationX) > SKIP_DISTANCE || Math.abs(event.velocityX) > 900)) {
        runOnJS(skip)(event.translationX < 0 ? 1 : -1);
      }
      offset.value = withSpring(0, springs.settle);
    });

  const rowStyle = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [{ translateX: offset.value }, { translateY: (1 - appear.value) * 6 }],
  }));
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));

  if (!activeItem) return null;

  // A thumbnail-sized request; the queued item carries the player's 512px cover.
  const art =
    artworkUrl(extrasOf(activeItem)?.coverArt) ??
    (typeof activeItem.artworkUrl === 'string' ? activeItem.artworkUrl : undefined);

  return (
    <View>
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>
          <Pressable
            style={({ pressed }) => [styles.body, pressed && styles.pressed]}
            onPress={() => {
              haptics.tick();
              openPlayer();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Now playing: ${activeItem.title ?? 'track'}. Open player.`}
          >
            <Artwork uri={art} size={42} radius={10} />
            <View style={styles.text}>
              <Text style={styles.title} numberOfLines={1}>
                {activeItem.title ?? 'Unknown title'}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {activeItem.artist ?? 'Unknown artist'}
              </Text>
            </View>

            <IconButton
              icon={isPlaying ? IconPlayerPauseFilled : IconPlayerPlayFilled}
              accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
              variant="accent"
              size={40}
              iconSize={18}
              popOn={isPlaying}
              onPress={() => (isPlaying ? TrackPlayer.pause() : TrackPlayer.play())}
            />
            <IconButton
              icon={IconPlayerSkipForwardFilled}
              accessibilityLabel="Next track"
              variant="plain"
              size={38}
              iconSize={18}
              color={color.label}
              onPress={() => TrackPlayer.skipToNext()}
            />
          </Pressable>
        </Animated.View>
      </GestureDetector>

      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: color.accent }, fillStyle]} />
      </View>
    </View>
  );
});

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    body: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      paddingLeft: space[2],
      paddingRight: space[1],
      paddingTop: space[2],
      paddingBottom: space[2] - 2,
    },
    pressed: { opacity: 0.8 },
    text: { flex: 1, marginLeft: space[1], marginRight: space[1] },
    title: { ...type.callout, fontFamily: type.headline.fontFamily, color: color.label },
    artist: { ...type.caption, color: color.labelSecondary, marginTop: 1 },
    track: {
      height: 2,
      marginHorizontal: space[4],
      borderRadius: 1,
      backgroundColor: color.separator,
      overflow: 'hidden',
    },
    // Full width, revealed by scaling from the left edge: a transform, so the
    // line moves without laying anything out.
    fill: { height: '100%', width: '100%', transformOrigin: 'left' },
  });
