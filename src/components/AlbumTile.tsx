import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Artwork } from './Artwork';
import { Label } from './Label';
import { PressScale } from './Pressable';
import { space, type, withAlpha } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * An album as its cover, with a caption.
 *
 * A library is recognised by its covers, so browsing albums is a grid of art
 * rather than a list of names. Title and artist are clamped to one line each
 * so every tile in a row is the same height — the one thing a grid has to
 * get right. The year rides on the cover as a small printed tag.
 */
export interface AlbumTileProps {
  title: string;
  subtitle?: string;
  artworkUri?: string | null;
  size: number;
  year?: number;
  /** Round art and centred caption — artists. */
  round?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}

export const AlbumTile = memo(function AlbumTile({
  title,
  subtitle,
  artworkUri,
  size,
  year,
  round = false,
  onPress,
  onLongPress,
}: AlbumTileProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      onLongPress={
        onLongPress
          ? () => {
              haptics.heavy();
              onLongPress();
            }
          : undefined
      }
      scaleTo={0.96}
      style={{ width: size }}
    >
      <View>
        <Artwork uri={artworkUri} size={size} round={round} shadow={false} rim />
        {year ? (
          <View style={styles.yearTag}>
            <Label tone="onArtwork" size={9.5}>
              {String(year)}
            </Label>
          </View>
        ) : null}
      </View>
      <View style={[styles.caption, round && styles.captionRound]}>
        <Text style={[styles.title, round && styles.centered]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, round && styles.centered]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </PressScale>
  );
});

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    yearTag: {
      position: 'absolute',
      left: 6,
      bottom: 6,
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: withAlpha('#000000', 0.55),
    },
    caption: { marginTop: space[2] },
    captionRound: { alignItems: 'center' },
    title: { ...type.callout, fontFamily: type.headline.fontFamily, color: color.label },
    subtitle: { ...type.caption, color: color.labelSecondary, marginTop: 2 },
    centered: { textAlign: 'center' },
  });
