import { memo, useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Glass } from './Glass';
import type { IconComponent } from './icons';
import { mix } from '../theme/color';
import { springs } from '../theme/motion';
import { icon as iconTokens, radius, space, type, withAlpha } from '../theme/tokens';
import { useTheme, useThemeControls } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * A key, in the hardware sense.
 *
 * Two layers: a darker lip and a face resting on it, two points proud. A
 * press drives the face down onto the lip on a stiff spring, so the key
 * visibly travels and bottoms out under the finger, and lets it back up on
 * a looser one. With the haptic tick that is the whole of the feedback —
 * no ripple, no flash.
 *
 * Variants map to the keycap colours of the hardware this borrows from:
 * the one orange key (primary), white keys (secondary), grey keys (dark),
 * and printed legends with no key at all (ghost). `glass` floats over
 * artwork, where an opaque key would sit like a sticker.
 */

export type KeycapVariant = 'primary' | 'secondary' | 'dark' | 'ghost' | 'glass';
export type KeycapSize = 'sm' | 'md' | 'lg';

export interface KeycapProps {
  label?: string;
  icon?: IconComponent;
  /** Filled glyphs ignore stroke width; pass true so the size compensates. */
  iconFilled?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  variant?: KeycapVariant;
  size?: KeycapSize;
  disabled?: boolean;
  busy?: boolean;
  /** Stretch to fill a row. */
  flex?: boolean;
  /** Fixed square key — icon only. */
  square?: boolean;
  /** Lit state for toggles: the legend takes the accent. */
  active?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT: Record<KeycapSize, number> = { sm: 36, md: 46, lg: 56 };
const RADIUS: Record<KeycapSize, number> = { sm: 10, md: radius.md, lg: 14 };
const ICON: Record<KeycapSize, number> = { sm: 16, md: 19, lg: 24 };
/** How far the face stands proud of the lip, and so how far a press travels. */
const TRAVEL = 2.5;

export const Keycap = memo(function Keycap({
  label,
  icon: Icon,
  iconFilled = false,
  onPress,
  onLongPress,
  variant = 'secondary',
  size = 'md',
  disabled = false,
  busy = false,
  flex = false,
  square = false,
  active = false,
  accessibilityLabel,
  style,
}: KeycapProps) {
  const color = useTheme();
  const { resolved } = useThemeControls();
  const pressed = useSharedValue(0);
  const inert = disabled || busy;

  const height = HEIGHT[size];
  const corner = RADIUS[size];

  // Colours per variant. The lip is the face pushed toward black (or, on a
  // dark ground, toward the ground), which is what reads as the key's side.
  let face: string;
  let ink: string;
  let lip: string;
  let edge: string;
  switch (variant) {
    case 'primary':
      face = color.accent;
      ink = color.accentInk;
      lip = mix(color.accent, '#000000', 0.32);
      edge = withAlpha('#FFFFFF', 0.28);
      break;
    case 'dark':
      face = color.keyDark;
      ink = color.keyDarkInk;
      lip = mix(color.keyDark, '#000000', 0.55);
      edge = withAlpha('#FFFFFF', 0.12);
      break;
    case 'ghost':
    case 'glass':
      face = 'transparent';
      ink = variant === 'glass' ? color.onArtwork : color.label;
      lip = 'transparent';
      edge = variant === 'ghost' ? color.border : 'transparent';
      break;
    default:
      face = color.surfaceRaised;
      ink = color.label;
      lip = resolved === 'light' ? color.border : mix(color.surfaceRaised, '#000000', 0.6);
      edge = resolved === 'light' ? withAlpha('#FFFFFF', 0.9) : withAlpha('#FFFFFF', 0.08);
  }
  if (active && variant !== 'primary') ink = color.accent;

  const hasLip = variant === 'primary' || variant === 'secondary' || variant === 'dark';

  // A disabled key with a solid face is drawn in solid, faded colours rather
  // than at reduced opacity: a translucent key shows the grid paper and
  // ambient wash through its face, which reads as a rendering fault.
  if (disabled && hasLip) {
    face = mix(face, color.background, 0.55);
    lip = mix(lip, color.background, 0.55);
    ink = mix(ink, face, 0.55);
  }

  const faceStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: hasLip ? pressed.value * TRAVEL : 0 },
      { scale: hasLip ? 1 : 1 - pressed.value * 0.04 },
    ],
  }));

  const onPressIn = useCallback(() => {
    pressed.value = withSpring(1, springs.press);
  }, [pressed]);

  const onPressOut = useCallback(() => {
    pressed.value = withSpring(0, springs.release);
  }, [pressed]);

  const handlePress = useCallback(() => {
    haptics.press();
    onPress?.();
  }, [onPress]);

  const handleLongPress = useCallback(() => {
    if (!onLongPress) return;
    haptics.heavy();
    onLongPress();
  }, [onLongPress]);

  const content = busy ? (
    <ActivityIndicator size="small" color={ink} />
  ) : (
    <>
      {Icon && (
        <Icon
          size={iconFilled ? ICON[size] - 1 : ICON[size]}
          color={ink}
          strokeWidth={iconTokens.strokeWidth + 0.25}
        />
      )}
      {label != null && !square && (
        <Text
          style={[type.key, size === 'sm' && styles.labelSmall, { color: ink }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inert, busy, selected: active }}
      disabled={inert}
      onPress={handlePress}
      onLongPress={onLongPress ? handleLongPress : undefined}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={size === 'sm' ? space[2] : space[1]}
      style={[
        {
          height,
          borderRadius: corner,
          opacity: disabled && !hasLip ? 0.4 : 1,
        },
        square ? { width: height } : styles.wide,
        flex && styles.flex,
        style,
      ]}
    >
      {hasLip && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { top: TRAVEL, borderRadius: corner, backgroundColor: lip },
          ]}
        />
      )}
      <Animated.View
        style={[
          styles.face,
          {
            marginBottom: hasLip ? TRAVEL : 0,
            borderRadius: corner,
            backgroundColor: face,
            borderColor: edge,
            borderWidth: variant === 'glass' ? 0 : 1,
          },
          variant === 'ghost' && styles.ghostFace,
          faceStyle,
        ]}
      >
        {variant === 'glass' && (
          <Glass variant="thin" lite radius={corner} style={StyleSheet.absoluteFill} />
        )}
        <View style={[styles.content, square && styles.contentSquare]}>{content}</View>
      </Animated.View>
    </Pressable>
  );
});

/** Lays keys out in a row with the standard gap, each sharing the width. */
export function KeyRow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  wide: { minWidth: 72 },
  flex: { flex: 1 },
  // In normal flow, not absolute: the face is what gives a key without
  // `flex` its width, so a longer legend makes a wider key rather than a
  // truncated one. Its travel is a transform, which never moves layout.
  face: {
    flex: 1,
    overflow: 'hidden',
  },
  ghostFace: { borderStyle: 'solid' },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    paddingHorizontal: space[4],
  },
  contentSquare: { paddingHorizontal: 0 },
  labelSmall: { fontSize: 10.5, letterSpacing: 1 },
  row: { flexDirection: 'row', gap: space[2] },
});
