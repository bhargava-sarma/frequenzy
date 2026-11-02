import { memo, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeInDown,
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
import { Marquee } from './Marquee';
import { useArtwork } from '../hooks/useArtwork';
import { extrasOf } from '../player/trackMapping';
import { springs } from '../theme/motion';
import { space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useAnimatedAccent, useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { usePlayerUiStore } from '../store/usePlayerUiStore';
import { haptics } from '../utils/haptics';

/**
 * The playing half of the dock.
 *
 * Renders nothing with an empty queue, so the dock is just the tabs until
 * there is something to control. Tap to open the player — it grows out of
 * this exact spot — or swipe the row sideways to skip, the way you'd thumb
 * a cassette deck's transport without looking. A hairline along the bottom
 * reads position, gliding between the player's once-a-second reports.
 */
const SKIP_DISTANCE = 70;

export const MiniPlayer = memo(function MiniPlayer() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const openPlayer = usePlayerUiStore((state) => state.openPlayer);
  const bodyRef = useRef<View>(null);
  const activeItem = useActiveMediaItem();
  const isPlaying = useIsPlaying();
  const { position, duration } = useProgress(1);
  const accent = useAnimatedAccent();
  const artworkUrl = useArtwork();

  const offset = useSharedValue(0);
  const ratio = useSharedValue(0);

  const total = duration || activeItem?.duration || 0;
  useEffect(() => {
    const next = total > 0 ? Math.min(1, position / total) : 0;
    const jump = Math.abs(next - ratio.value) * Math.max(total, 1) > 2.5;
    ratio.value =
      isPlaying && !jump && total > 0
        ? withTiming(Math.min(1, (position + 1) / total), { duration: 1000, easing: Easing.linear })
        : next;
  }, [position, total, isPlaying, ratio]);

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
    .onEnd((event) => {
      if (Math.abs(event.translationX) > SKIP_DISTANCE || Math.abs(event.velocityX) > 900) {
        runOnJS(skip)(event.translationX < 0 ? 1 : -1);
      }
      offset.value = withSpring(0, springs.snappy);
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.max(0.0001, ratio.value) }],
    backgroundColor: accent.value,
  }));

  if (!activeItem) return null;

  // A thumbnail-sized request; the queued item carries the player's 512px cover.
  const art =
    artworkUrl(extrasOf(activeItem)?.coverArt) ??
    (typeof activeItem.artworkUrl === 'string' ? activeItem.artworkUrl : undefined);

  return (
    <Animated.View entering={new FadeInDown().springify().damping(20)}>
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>
          <Pressable
            ref={bodyRef}
            style={styles.body}
            onPress={() => {
              haptics.tick();
              bodyRef.current?.measureInWindow((x, y, width, height) =>
                openPlayer({ x, y, width, height }),
              );
            }}
            accessibilityRole="button"
            accessibilityLabel={`Now playing: ${activeItem.title ?? 'track'}. Open player.`}
          >
            <Artwork uri={art} size={42} radius={10} />
            <View style={styles.text}>
              <Marquee text={activeItem.title ?? 'Unknown title'} style={styles.title} speed={26} />
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
        <Animated.View style={[styles.fill, fillStyle]} />
      </View>
    </Animated.View>
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
    // Scaled from its left edge: scaleX runs about the centre, so the fill
    // is a full-width bar anchored left with transformOrigin.
    fill: { height: '100%', width: '100%', transformOrigin: 'left center' },
  });
