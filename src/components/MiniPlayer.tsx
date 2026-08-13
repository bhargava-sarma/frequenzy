import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import TrackPlayer, { useActiveMediaItem, useIsPlaying, useProgress } from '@rntp/player';

import { ArtworkWell } from './ArtworkWell';
import { IconPlayerPauseFilled, IconPlayerPlayFilled } from './icons';
import { color, hairline, icon, layout, radius, space, type } from '../theme/tokens';

/**
 * Persistent mini-player above the tab bar.
 *
 * Renders nothing when the queue is empty, so the tab bar sits flush at the
 * bottom until there is something to control.
 *
 * Uses the dark panel surface: this is transport, and the two-zone split
 * assigns transport to the panel regardless of what it sits next to. The
 * contrast against the light tab bar below is the point — it reads as a
 * distinct piece of hardware rather than another row of the list.
 */
export function MiniPlayer() {
  const navigation = useNavigation();
  const activeItem = useActiveMediaItem();
  const isPlaying = useIsPlaying();
  const progress = useProgress(1);

  if (!activeItem) return null;

  const ratio =
    progress.duration > 0 ? Math.min(1, Math.max(0, progress.position / progress.duration)) : 0;

  return (
    <View style={styles.root}>
      {/* Hairline progress along the top edge — a readout, not a control.
          Seeking belongs on the full Now Playing screen. */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${ratio * 100}%` }]} />
      </View>

      <Pressable
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
        onPress={() => navigation.navigate('NowPlaying')}
        accessibilityRole="button"
        accessibilityLabel={`Now playing: ${activeItem.title ?? 'track'}. Open player.`}
      >
        <ArtworkWell
          uri={typeof activeItem.artworkUrl === 'string' ? activeItem.artworkUrl : undefined}
          size={36}
          surface="panel"
        />

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

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          hitSlop={space[3]}
          onPress={() => (isPlaying ? TrackPlayer.pause() : TrackPlayer.play())}
          style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
        >
          {isPlaying ? (
            <IconPlayerPauseFilled size={icon.size} color={color.accentInk} />
          ) : (
            <IconPlayerPlayFilled size={icon.size} color={color.accentInk} />
          )}
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: color.panel },
  progressTrack: { height: 2, backgroundColor: color.panelLine },
  progressFill: { height: '100%', backgroundColor: color.accent },

  body: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space[2],
    borderBottomWidth: hairline,
    borderBottomColor: color.panelLine,
  },
  pressed: { opacity: 0.7 },

  text: { flex: 1, marginLeft: space[3] },
  title: { ...type.body, color: color.textInverse },
  artist: { ...type.meta, color: color.textInverseSecondary, marginTop: 1 },

  playButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: space[3],
  },
});
