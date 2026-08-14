import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import TrackPlayer, {
  RepeatMode,
  useActiveMediaItem,
  useIsPlaying,
  useProgress,
} from '@rntp/player';

import { ArtworkWell, FormatBadge } from '../components/ArtworkWell';
import { ProgressBar } from '../components/ProgressBar';
import { TransportControls } from '../components/TransportControls';
import { EmptyState } from '../components/ScreenState';
import { IconChevronRight, IconHeart, IconHeartFilled, IconPlaylist } from '../components/icons';
import { extrasOf } from '../player/trackMapping';
import { useServerStore } from '../store/useServerStore';
import { color, icon, layout, space, type } from '../theme/tokens';

/**
 * Now Playing — full-screen panel, per spec 5.1.
 *
 * Full-bleed with no radius because it is a whole screen rather than a panel
 * inset into one. The accent appears exactly twice: the progress fill and the
 * play button (plus the heart when favourited, which is a state, not
 * decoration) — which is what keeps it meaningful.
 *
 * The artwork is measured rather than given a fixed cap. It used to be capped
 * at 320px, which left a band of dead panel above and below it on a tall
 * phone; it now takes whatever the transport and metadata don't need, so the
 * screen is filled by the one thing worth looking at.
 */
export function NowPlayingScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const activeItem = useActiveMediaItem();
  const isPlaying = useIsPlaying();
  const progress = useProgress(1);
  const client = useServerStore((state) => state.client);

  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>(RepeatMode.Off);
  /** Edge of the largest square that fits the space left for artwork. */
  const [artSize, setArtSize] = useState(0);

  const extras = extrasOf(activeItem);
  const [starred, setStarred] = useState<boolean | null>(null);
  const isStarred = starred ?? extras?.starred ?? false;

  function measureArtwork(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setArtSize(Math.floor(Math.min(width, height)));
  }

  if (!activeItem) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Header onClose={() => navigation.goBack()} />
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

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header
        onClose={() => navigation.goBack()}
        badge={
          <FormatBadge
            suffix={extras?.suffix}
            bitDepth={extras?.bitDepth}
            samplingRate={extras?.samplingRate}
          />
        }
      />

      {/* Absorbs all the slack; the controls below keep their natural height. */}
      <View style={styles.artArea} onLayout={measureArtwork}>
        {artSize > 0 && (
          <ArtworkWell
            uri={typeof activeItem.artworkUrl === 'string' ? activeItem.artworkUrl : undefined}
            size={artSize}
            surface="panel"
          />
        )}
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + space[4] }]}>
        <View style={styles.meta}>
          <View style={styles.metaText}>
            <Text style={styles.title} numberOfLines={2}>
              {activeItem.title ?? 'Unknown title'}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {activeItem.artist ?? 'Unknown artist'}
            </Text>
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
          shuffle={shuffle}
          repeat={repeat === RepeatMode.One ? 'one' : repeat === RepeatMode.All ? 'all' : 'off'}
          onPlayPause={() => (isPlaying ? TrackPlayer.pause() : TrackPlayer.play())}
          onPrevious={() => TrackPlayer.skipToPrevious()}
          onNext={() => TrackPlayer.skipToNext()}
          onToggleShuffle={() => {
            const next = !shuffle;
            TrackPlayer.setShuffleEnabled(next);
            setShuffle(next);
          }}
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

        {/* The queue lives here now rather than in the bottom nav — it belongs
            to what's playing, not to the library. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open queue"
          onPress={() => navigation.navigate('Queue')}
          style={({ pressed }) => [styles.queueButton, pressed && styles.pressed]}
        >
          <IconPlaylist
            size={icon.sizeSmall}
            strokeWidth={icon.strokeWidth}
            color={color.textInverseSecondary}
          />
          <Text style={styles.queueLabel}>Queue</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Header({ onClose, badge }: { onClose: () => void; badge?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close player"
        hitSlop={space[3]}
        onPress={onClose}
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}
      >
        {/* Chevron pointing down — this dismisses rather than navigating back. */}
        <IconChevronRight
          size={icon.size}
          strokeWidth={icon.strokeWidth}
          color={color.textInverseSecondary}
          style={styles.closeIcon}
        />
      </Pressable>

      <Text style={styles.headerLabel}>Now playing</Text>
      <View style={styles.headerRight}>{badge}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Full-bleed, no radius: this is the whole screen, not a panel inset in one.
  root: { flex: 1, backgroundColor: color.panel },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.panelPadding,
    paddingVertical: space[3],
  },
  close: { padding: space[1], marginRight: space[2] },
  closeIcon: { transform: [{ rotate: '90deg' }] },
  headerLabel: { ...type.label, color: color.textInverseSecondary, flex: 1 },
  headerRight: { alignItems: 'flex-end' },

  artArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.panelPadding,
    paddingVertical: space[4],
  },

  controls: { paddingHorizontal: layout.panelPadding },

  meta: { flexDirection: 'row', alignItems: 'flex-start' },
  metaText: { flex: 1 },
  title: { ...type.display, color: color.textInverse },
  artist: { ...type.meta, color: color.textInverseSecondary, marginTop: space[1] },
  heart: { marginLeft: space[4], paddingTop: space[1] },

  progress: { marginTop: space[5], marginBottom: space[5] },

  queueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    marginTop: space[5],
    paddingVertical: space[2],
  },
  queueLabel: { ...type.label, color: color.textInverseSecondary },

  pressed: { opacity: 0.6 },
});
