import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, hairline, icon, layout, radius, space, type } from '../theme/tokens';
import { ArtworkWell } from './ArtworkWell';
import { IconHeart, IconHeartFilled, IconPlus } from './icons';

/**
 * Library list row, per spec 5.2.
 *
 * 40px thumbnail + title + meta line + trailing action. The separator is a
 * 0.5px hairline running the FULL width beneath the row, not inset past the
 * thumbnail — inset separators read as a conventional mobile list, which is
 * what this design is deliberately not.
 *
 * `active` marks the currently playing row and tints the title with the
 * accent. That is the accent doing its one job — signalling meaningful state
 * — so a list should never have more than one active row.
 */

export type RowAction = 'favorite' | 'queue' | 'none';

export interface ListRowProps {
  title: string;
  /** Secondary line, e.g. `ARTIST · 3:42`. Rendered as given. */
  meta?: string;
  artworkUri?: string | null;
  /** Show a thumbnail well. Off for plain rows like playlists of text. */
  showArtwork?: boolean;
  action?: RowAction;
  favorited?: boolean;
  active?: boolean;
  onPress?: () => void;
  onActionPress?: () => void;
  /** Suppress the separator on the final row of a list. */
  last?: boolean;
}

export function ListRow({
  title,
  meta,
  artworkUri,
  showArtwork = true,
  action = 'none',
  favorited = false,
  active = false,
  onPress,
  onActionPress,
  last = false,
}: ListRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        !last && styles.separator,
        pressed && styles.pressed,
      ]}
    >
      {showArtwork && (
        <ArtworkWell uri={artworkUri} size={layout.thumbSize} surface="paper" />
      )}

      <View style={[styles.text, !showArtwork && styles.textNoArt]}>
        <Text style={[styles.title, active && styles.titleActive]} numberOfLines={1}>
          {title}
        </Text>
        {meta != null && (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        )}
      </View>

      {action !== 'none' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action === 'favorite' ? 'Favorite' : 'Add to queue'}
          onPress={onActionPress}
          // The row is the primary target, so the action needs its own
          // generous hit area to stay reachable without widening the icon.
          hitSlop={space[3]}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          {action === 'favorite' ? (
            favorited ? (
              <IconHeartFilled size={icon.size} color={color.accent} />
            ) : (
              <IconHeart
                size={icon.size}
                color={color.textSecondary}
                strokeWidth={icon.strokeWidth}
              />
            )
          ) : (
            <View style={styles.queueButton}>
              <IconPlus size={16} color={color.accentInk} strokeWidth={2} />
            </View>
          )}
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    height: layout.rowHeight,
    paddingHorizontal: layout.screenPadding,
    backgroundColor: color.paper,
  },
  separator: {
    borderBottomWidth: hairline,
    borderBottomColor: color.paperLine,
  },
  pressed: { opacity: 0.6 },

  text: { flex: 1, marginLeft: space[3], justifyContent: 'center' },
  textNoArt: { marginLeft: 0 },

  title: { ...type.body, color: color.textPrimary },
  titleActive: { color: color.accent },
  meta: { ...type.meta, color: color.textSecondary, marginTop: 2 },

  action: {
    marginLeft: space[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueButton: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
