import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Artwork } from './Artwork';
import { IconDotsVertical, IconHeartFilled } from './icons';
import { PlayingBars } from './PlayingBars';
import { PressScale } from './Pressable';
import { hairline, layout, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * One row of a list: leading mark, two lines of text, trailing figures.
 *
 * The leading slot is artwork, a track number in mono, or nothing. When the
 * row is the one playing, the number (or a corner of the art) becomes the
 * level-bar mark and the title takes the accent — the accent's one job in a
 * list. Rows are exactly `layout.rowHeight` tall so lists can skip measuring.
 *
 * Every prop is a primitive or a stable callback so the memo holds; callers
 * pass handlers that take the row's subject as an argument.
 */
export interface ListRowProps {
  title: string;
  subtitle?: string;
  artworkUri?: string | null;
  /** Round artwork — artists. */
  round?: boolean;
  leading?: 'artwork' | 'index' | 'none';
  /** Shown in the index slot, 1-based. */
  index?: number;
  /** The row is the current track. */
  active?: boolean;
  /** And audio is running — animates the mark. */
  playing?: boolean;
  /** Mono figure on the right: a duration, a count. */
  trailingText?: string;
  starred?: boolean;
  /** Dims the row — e.g. tracks already played in the queue. */
  dimmed?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Shows a ⋮ button. */
  onMore?: () => void;
  last?: boolean;
  /** Extra trailing element, after the figures. */
  accessory?: React.ReactNode;
  /** A chart position, printed before the artwork. */
  rank?: number;
}

export const ListRow = memo(function ListRow({
  title,
  subtitle,
  artworkUri,
  round = false,
  leading = 'artwork',
  index,
  active = false,
  playing = false,
  trailingText,
  starred = false,
  dimmed = false,
  onPress,
  onLongPress,
  onMore,
  last = false,
  accessory,
  rank,
}: ListRowProps) {
  const color = useTheme();
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
      // Wide rows move less than buttons: the same percentage on a
      // full-width element reads as the list lurching.
      scaleTo={0.985}
      style={[styles.root, dimmed && styles.dimmed]}
    >
      {rank != null && (
        <Text style={[styles.rank, rank <= 3 && styles.rankTop]} numberOfLines={1}>
          {String(rank).padStart(2, '0')}
        </Text>
      )}

      {leading === 'artwork' && (
        <View>
          <Artwork uri={artworkUri} size={layout.thumbSize} round={round} />
          {active && (
            <View style={[styles.artBadge, round && styles.artBadgeRound]}>
              <PlayingBars playing={playing} color={color.accentInk} size={12} />
            </View>
          )}
        </View>
      )}

      {leading === 'index' && (
        <View style={styles.indexSlot}>
          {active ? (
            <PlayingBars playing={playing} color={color.accent} size={14} />
          ) : (
            <Text style={styles.index} numberOfLines={1}>
              {index != null ? String(index).padStart(2, '0') : ''}
            </Text>
          )}
        </View>
      )}

      <View
        style={[
          styles.text,
          leading === 'none' && styles.textFlush,
          !last && styles.separator,
        ]}
      >
        <View style={styles.lines}>
          <Text style={[styles.title, active && styles.titleActive]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {starred && <IconHeartFilled size={13} color={color.accent} />}
        {trailingText ? (
          <Text style={styles.trailing} numberOfLines={1}>
            {trailingText}
          </Text>
        ) : null}
        {accessory}
        {onMore && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`More for ${title}`}
            hitSlop={{ top: 14, bottom: 14, left: 8, right: 12 }}
            onPress={() => {
              haptics.tick();
              onMore();
            }}
            style={({ pressed }) => [styles.more, pressed && styles.pressed]}
          >
            <IconDotsVertical size={18} color={color.labelSecondary} strokeWidth={2} />
          </Pressable>
        )}
      </View>
    </PressScale>
  );
});

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignItems: 'center',
      height: layout.rowHeight,
      paddingLeft: layout.screenPadding,
    },
    dimmed: { opacity: 0.45 },
    artBadge: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    artBadgeRound: { borderRadius: layout.thumbSize / 2 },
    indexSlot: { width: 30, alignItems: 'flex-start', justifyContent: 'center' },
    rank: { ...type.monoLarge, width: 30, color: color.labelTertiary },
    rankTop: { color: color.accent },
    index: { ...type.mono, fontSize: 12.5, color: color.labelTertiary },
    // The separator runs under the text only — the leading column stays
    // clean, so a list reads as rows of songs rather than as a table.
    text: {
      flex: 1,
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      marginLeft: space[3],
      paddingRight: layout.screenPadding,
    },
    textFlush: { marginLeft: 0 },
    separator: { borderBottomWidth: hairline, borderBottomColor: color.separator },
    lines: { flex: 1, justifyContent: 'center' },
    title: { ...type.body, fontFamily: type.headline.fontFamily, fontSize: 15, color: color.label },
    titleActive: { color: color.accent },
    subtitle: { ...type.subhead, color: color.labelSecondary, marginTop: 2 },
    trailing: { ...type.mono, fontSize: 11.5, color: color.labelTertiary },
    more: { paddingVertical: space[2], paddingLeft: space[1] },
    pressed: { opacity: 0.5 },
  });
