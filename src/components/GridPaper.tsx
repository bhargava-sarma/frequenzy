import { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { useTheme, useThemeControls } from '../theme/ThemeProvider';

/**
 * Engineering paper: a faint dot grid behind a screen.
 *
 * One tiny tile repeated by the platform's image renderer rather than a
 * screen-sized SVG — a full-screen bitmap per tab would cost megabytes for
 * what is a handful of pixels, while a 20pt tile costs nothing.
 */
const TILE = require('../../assets/grid-dot.png');

export const GridPaper = memo(function GridPaper() {
  const color = useTheme();
  const { gridPaper } = useThemeControls();
  if (!gridPaper) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image
        source={TILE}
        resizeMode="repeat"
        // Explicit 100%: a static image source carries its own 20pt size,
        // which beats absoluteFill's edges and would draw a single tile.
        style={[
          StyleSheet.absoluteFill,
          styles.fill,
          { tintColor: color.label, opacity: color.mode === 'light' ? 0.13 : 0.1 },
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
});
