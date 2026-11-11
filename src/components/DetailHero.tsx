import { memo, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Artwork } from './Artwork';
import { Label } from './Label';
import { useNavBarHeight } from './CollapsingHeader';
import { layout, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemeControls, useThemedStyles } from '../theme/ThemeProvider';
import { artworkCacheKey } from '../utils/artworkKey';
import { useSvgId } from '../utils/svgId';

/**
 * The top of a detail screen: the cover, blurred into a wash behind itself,
 * then the cover, a printed kind ("ALBUM · 1997"), the title, a link to the
 * artist and a spec line — the album's label, read like a device's.
 *
 * The wash scrolls with the list, as part of the page.
 */
export interface DetailHeroProps {
  artworkUri?: string | null;
  round?: boolean;
  eyebrow: string;
  title: string;
  subtitle?: string;
  onSubtitlePress?: () => void;
  meta?: string;
  description?: string;
  /** The key row under the title. */
  actions?: ReactNode;
  /** Replaces the artwork, e.g. a genre's printed block. */
  art?: ReactNode;
}

const BACKDROP_HEIGHT = 440;

export const DetailHero = memo(function DetailHero({
  artworkUri,
  round = false,
  eyebrow,
  title,
  subtitle,
  onSubtitlePress,
  meta,
  description,
  actions,
  art,
}: DetailHeroProps) {
  const styles = useThemedStyles(makeStyles);
  const { reduceMotion } = useThemeControls();
  const navHeight = useNavBarHeight();
  const { width } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const artSize = Math.min(232, Math.round(width * 0.58));

  return (
    <View style={[styles.root, { paddingTop: navHeight + space[2] }]}>
      <View style={styles.art}>
        {/* The one cover on the page, and it arrives after the page does:
            faded in, it settles onto the placeholder rather than replacing
            it in a frame. Thumbnails in lists don't — a fade on every row
            that scrolls back into view reads as flicker. */}
        {art ?? (
          <Artwork
            uri={artworkUri}
            size={artSize}
            round={round}
            rim
            transitionMs={reduceMotion ? 0 : 220}
          />
        )}
      </View>

      <Label tone="secondary" bold style={styles.eyebrow}>
        {eyebrow}
      </Label>
      <Text style={styles.title} numberOfLines={3}>
        {title}
      </Text>
      {subtitle ? (
        <Pressable
          disabled={!onSubtitlePress}
          onPress={onSubtitlePress}
          hitSlop={8}
          accessibilityRole={onSubtitlePress ? 'link' : undefined}
        >
          {({ pressed }) => (
            <Text style={[styles.subtitle, pressed && styles.pressed]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </Pressable>
      ) : null}
      {meta ? (
        <Label tone="tertiary" style={styles.meta} numberOfLines={2}>
          {meta}
        </Label>
      ) : null}
      {description ? (
        <Pressable onPress={() => setExpanded((value) => !value)} hitSlop={6}>
          <Text style={styles.description} numberOfLines={expanded ? undefined : 3}>
            {description}
          </Text>
        </Pressable>
      ) : null}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
});

/**
 * The cover, blurred into a wash at the top of a detail screen.
 *
 * Drawn by the screen's scaffold, beneath the dot grid and the ambient
 * wash, rather than inside the list: there, its fade to the ground colour
 * ended in a visible seam where the grid and wash resumed below it. Here
 * those layers run continuously over it. It moves exactly with the list, as
 * if printed on the page — no parallax, no stretch.
 */
export const HeroBackdrop = memo(function HeroBackdrop({
  uri,
  scrollY,
}: {
  uri?: string | null;
  scrollY: SharedValue<number>;
}) {
  const color = useTheme();
  const { reduceMotion } = useThemeControls();
  const fadeId = useSvgId('herofade');

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -scrollY.value }] }));
  const cacheKey = artworkCacheKey(uri);
  const source = useMemo(() => (uri ? { uri, cacheKey } : null), [uri, cacheKey]);

  if (!source) return null;

  return (
    <Animated.View pointerEvents="none" style={[backdropStyles.root, style]}>
      <Image
        source={source}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        blurRadius={40}
        cachePolicy="memory-disk"
        // The wash arrives after the page does; fading it in keeps a slow
        // server from snapping a block of colour onto a screen being read.
        transition={reduceMotion ? 0 : 260}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: color.background, opacity: color.mode === 'light' ? 0.45 : 0.5 },
        ]}
      />
      <Svg width="100%" height={BACKDROP_HEIGHT} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color.background} stopOpacity={0} />
            <Stop offset="0.55" stopColor={color.background} stopOpacity={0.3} />
            <Stop offset="1" stopColor={color.background} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height={BACKDROP_HEIGHT} fill={`url(#${fadeId})`} />
      </Svg>
    </Animated.View>
  );
});

const backdropStyles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, height: BACKDROP_HEIGHT, overflow: 'hidden' },
});

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: { alignItems: 'center', paddingHorizontal: layout.screenPadding, paddingBottom: space[2] },
    art: { marginTop: space[2], marginBottom: space[5] },
    eyebrow: { marginBottom: space[2] },
    title: { ...type.title1, color: color.label, textAlign: 'center' },
    subtitle: { ...type.headline, color: color.accent, marginTop: space[1], textAlign: 'center' },
    pressed: { opacity: 0.55 },
    meta: { marginTop: space[3], textAlign: 'center', lineHeight: 15 },
    description: {
      ...type.footnote,
      color: color.labelSecondary,
      textAlign: 'center',
      marginTop: space[3],
      lineHeight: 18,
    },
    actions: { alignSelf: 'stretch', marginTop: space[5] },
  });
