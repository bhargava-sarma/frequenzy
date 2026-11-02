import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { IconComponent } from './icons';
import { Label } from './Label';
import { Touchable } from './Touchable';
import { mix, pickInk } from '../theme/color';
import { radius, space, type, withAlpha } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';
import { useSvgId } from '../utils/svgId';

/**
 * A big function key: a glyph in the corner, a printed legend and a figure.
 * Home's shortcuts — shuffle everything, liked songs, history, stats.
 */
export const QuickKey = memo(function QuickKey({
  icon: Icon,
  label,
  caption,
  onPress,
  primary = false,
  busy = false,
}: {
  icon: IconComponent;
  label: string;
  caption?: string;
  onPress: () => void;
  primary?: boolean;
  busy?: boolean;
}) {
  const color = useTheme();
  const face = primary ? color.accent : color.surface;
  const ink = primary ? color.accentInk : color.label;
  const dim = primary ? withAlpha(color.accentInk, 0.7) : color.labelSecondary;

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={caption ? `${label}, ${caption}` : label}
      disabled={busy}
      onPress={() => {
        haptics.press();
        onPress();
      }}
      style={[
        styles.quick,
        {
          backgroundColor: face,
          borderColor: primary ? mix(color.accent, '#000000', 0.15) : color.separator,
          opacity: busy ? 0.6 : 1,
        },
      ]}
    >
      <View style={styles.quickTop}>
        <Icon size={20} color={ink} strokeWidth={2} />
        <View style={[styles.quickDot, { backgroundColor: primary ? color.accentInk : color.accent }]} />
      </View>
      <View>
        <Text style={[type.headline, { color: ink }]} numberOfLines={1}>
          {label}
        </Text>
        {caption ? (
          <Text style={[type.label, styles.quickCaption, { color: dim }]} numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>
    </Touchable>
  );
});

/**
 * A generated mix, as a coloured card: a big index number, the mix's name
 * and what it's drawn from. Colour comes from a fixed set of keycap hues so
 * a row of them reads as a panel of function keys.
 */
export const MixCard = memo(function MixCard({
  index,
  title,
  caption,
  hue,
  onPress,
  width,
}: {
  index: number;
  title: string;
  caption: string;
  hue: string;
  onPress: () => void;
  width: number;
}) {
  const glowId = useSvgId('mixglow');
  const ink = pickInk(hue);
  const height = Math.round(width * 1.08);

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={`${title} mix, ${caption}`}
      onPress={() => {
        haptics.press();
        onPress();
      }}
      style={[styles.mix, { width, height, backgroundColor: hue }]}
    >
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={glowId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.28} />
            <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.18} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${glowId})`} />
        {/* Concentric rings off the corner: a speaker grille, or a record. */}
        {[0.35, 0.5, 0.65, 0.8].map((r) => (
          <Circle
            key={r}
            cx={width}
            cy={height}
            r={width * r}
            stroke={ink}
            strokeOpacity={0.12}
            strokeWidth={1}
            fill="none"
          />
        ))}
      </Svg>
      <Label color={withAlpha(ink, 0.75)} bold>
        {`MIX ${String(index).padStart(2, '0')}`}
      </Label>
      <View>
        <Text style={[type.title2, { color: ink }]} numberOfLines={2}>
          {title}
        </Text>
        <Label color={withAlpha(ink, 0.7)} style={styles.mixCaption}>
          {caption}
        </Label>
      </View>
    </Touchable>
  );
});

/** Fixed keycap hues for generated cards, in display order. */
export const MIX_HUES = ['#FF6B2C', '#5B9BFF', '#3ED57F', '#FFCC33', '#FF5C9E', '#A08BFF', '#3CCFE4', '#ECEAE3'];

const styles = StyleSheet.create({
  quick: {
    flex: 1,
    minHeight: 92,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space[3],
    justifyContent: 'space-between',
  },
  quickTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  quickDot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  quickCaption: { marginTop: 3, fontSize: 9.5 },
  mix: {
    borderRadius: radius.lg,
    padding: space[3],
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  mixCaption: { marginTop: 4, fontSize: 9.5 },
});
