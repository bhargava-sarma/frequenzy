import { Pressable, StyleSheet, View } from 'react-native';

import { icon, radius, space } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
  IconArrowsShuffle,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconRepeat,
} from './icons';

/**
 * Transport cluster, per spec 5.1:
 * shuffle — prev — play/pause — next — repeat.
 *
 * Play/pause is the single accent-filled control on the Now Playing screen,
 * which is what keeps the accent meaningful. Shuffle and repeat are smaller
 * (18px vs 20px) and dim when inactive — their state shows through opacity
 * and weight rather than a second color, since the palette has exactly one
 * accent by design.
 *
 * The icon swap on play/pause is instant. No scale bounce, no spring: the
 * spec asks for a toggle-switch feel, and a filled circle that pulses on
 * every tap is the opposite of that.
 */

export type RepeatMode = 'off' | 'all' | 'one';

export interface TransportControlsProps {
  playing: boolean;
  shuffle?: boolean;
  repeat?: RepeatMode;
  /** Disables prev/next at queue boundaries. */
  canSkipPrevious?: boolean;
  canSkipNext?: boolean;
  onPlayPause?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onToggleShuffle?: () => void;
  onCycleRepeat?: () => void;
}

export function TransportControls({
  playing,
  shuffle = false,
  repeat = 'off',
  canSkipPrevious = true,
  canSkipNext = true,
  onPlayPause,
  onPrevious,
  onNext,
  onToggleShuffle,
  onCycleRepeat,
}: TransportControlsProps) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.root}>
      <SecondaryControl
        onPress={onToggleShuffle}
        active={shuffle}
        accessibilityLabel="Shuffle"
      >
        <IconArrowsShuffle
          size={icon.sizeSmall}
          color={shuffle ? color.textInverse : color.textInverseSecondary}
          strokeWidth={icon.strokeWidth}
        />
        {/* Lit and dotted when on, matching how repeat reports itself — the
            icon tint alone was too easy to miss at 18px. */}
        {shuffle && <View style={styles.activeDot} />}
      </SecondaryControl>

      <SecondaryControl
        onPress={onPrevious}
        disabled={!canSkipPrevious}
        accessibilityLabel="Previous track"
      >
        <IconPlayerSkipBack
          size={icon.size}
          color={color.textInverse}
          strokeWidth={icon.strokeWidth}
        />
      </SecondaryControl>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause' : 'Play'}
        onPress={onPlayPause}
        style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
      >
        {playing ? (
          <IconPlayerPauseFilled size={icon.size} color={color.accentInk} />
        ) : (
          <IconPlayerPlayFilled size={icon.size} color={color.accentInk} />
        )}
      </Pressable>

      <SecondaryControl
        onPress={onNext}
        disabled={!canSkipNext}
        accessibilityLabel="Next track"
      >
        <IconPlayerSkipForward
          size={icon.size}
          color={color.textInverse}
          strokeWidth={icon.strokeWidth}
        />
      </SecondaryControl>

      <SecondaryControl
        onPress={onCycleRepeat}
        active={repeat !== 'off'}
        accessibilityLabel={`Repeat ${repeat}`}
      >
        <IconRepeat
          size={icon.sizeSmall}
          color={repeat !== 'off' ? color.textInverse : color.textInverseSecondary}
          strokeWidth={icon.strokeWidth}
        />
        {/* "Repeat one" needs distinguishing from "repeat all" without a
            second icon or hue, so it gets a small accent dot. */}
        {repeat === 'one' && <View style={styles.activeDot} />}
      </SecondaryControl>
    </View>
  );
}

function SecondaryControl({
  children,
  onPress,
  disabled = false,
  active = false,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  active?: boolean;
  accessibilityLabel: string;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: active }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={space[2]}
      style={({ pressed }) => [
        styles.secondary,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {children}
    </Pressable>
  );
}

const makeStyles = (color: Palette) => StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secondary: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.3 },
  pressed: { opacity: 0.7 },
  activeDot: {
    position: 'absolute',
    bottom: 8,
    width: 3,
    height: 3,
    borderRadius: radius.full,
    backgroundColor: color.accent,
  },
});
