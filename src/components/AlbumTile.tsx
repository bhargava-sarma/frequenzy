import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeProvider';
import { ArtworkWell } from './ArtworkWell';
import { PressScale } from './Pressable';

/**
 * Album as artwork rather than as a row.
 *
 * The list row in spec 5.2 is right for tracks, where the title carries the
 * meaning and a 40px thumbnail is incidental. It's the wrong unit for browsing
 * albums: a library is recognised by its covers, and a screen of 40px squares
 * shows almost none of them.
 *
 * Title and artist sit under the art in the standard body/meta pair, both
 * clamped to one line. Wrapping titles would make tiles different heights and
 * break the grid alignment, which is the one thing a grid has to get right.
 */
export interface AlbumTileProps {
  title: string;
  subtitle?: string;
  artworkUri?: string | null;
  /** Edge length of the artwork; the caption sits below it. */
  size: number;
  onPress?: () => void;
}

export const AlbumTile = memo(function AlbumTile({ title, subtitle, artworkUri, size, onPress }: AlbumTileProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      style={{ width: size }}
    >
      <ArtworkWell uri={artworkUri} size={size} surface="paper" />
      <View style={styles.caption}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </PressScale>
  );
});

const makeStyles = (color: Palette) => StyleSheet.create({
  caption: { marginTop: space[2] },
  title: { ...type.body, color: color.textPrimary },
  subtitle: { ...type.meta, color: color.textSecondary, marginTop: 2 },
});
