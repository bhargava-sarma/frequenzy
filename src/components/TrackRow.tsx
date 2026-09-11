import { memo } from 'react';

import { ListRow } from './ListRow';
import { SwipeableRow } from './SwipeableRow';
import { IconHeart, IconHeartFilled, IconPlus, IconX } from './icons';
import { useArtwork } from '../hooks/useArtwork';
import { icon } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import type { Child } from '../types/subsonic';
import { formatDuration } from '../utils/time';

/**
 * One track in a list, and the reason long lists stay responsive.
 *
 * Every screen used to build its rows inline, which quietly made each render
 * of the list a render of every row in it. That is ruinous here rather than
 * merely wasteful: a row is a pan gesture plus three worklets, not a piece of
 * text, so re-rendering forty of them to add sixty more — or because a filter
 * gained a letter — costs far more than drawing them did.
 *
 * Memoised, with everything variable reduced to values that compare cheaply.
 * The swipe configuration is built in here rather than passed in for the same
 * reason: it holds a rendered icon element, and an object literal containing
 * fresh JSX is a new prop on every render, which would defeat the memo
 * silently while looking correct.
 *
 * Callers must pass stable callbacks — useCallback at the call site, taking
 * the song or index as an argument instead of closing over it.
 */
export interface TrackRowProps {
  song: Child;
  /** Position within the list being rendered, handed back to onPlay. */
  index: number;
  active: boolean;
  last: boolean;
  showArtwork?: boolean;
  /** What a left swipe does. Playlists remove; everywhere else stars. */
  leftAction?: 'star' | 'remove';
  /**
   * The trailing control. Search results queue — the heart would claim a
   * result is in your library when the point of searching was to find it.
   */
  action?: 'favorite' | 'queue';
  onPlay: (index: number) => void;
  onOptions: (song: Child) => void;
  onQueue: (song: Child) => void;
  onStar: (song: Child) => void;
  onRemove?: (song: Child) => void;
}

export const TrackRow = memo(function TrackRow({
  song,
  index,
  active,
  last,
  showArtwork = true,
  leftAction = 'star',
  action = 'favorite',
  onPlay,
  onOptions,
  onQueue,
  onStar,
  onRemove,
}: TrackRowProps) {
  const color = useTheme();
  const artworkUrl = useArtwork();

  const starred = Boolean(song.starred);
  const removing = leftAction === 'remove';

  return (
    <SwipeableRow
      rightSwipe={{
        icon: <IconPlus size={icon.size} color={color.accentInk} strokeWidth={2} />,
        label: 'Queue',
        onAction: () => onQueue(song),
      }}
      leftSwipe={
        removing
          ? {
              icon: <IconX size={icon.size} color={color.accentInk} strokeWidth={2} />,
              label: 'Remove',
              onAction: () => onRemove?.(song),
            }
          : {
              icon: starred ? (
                <IconHeartFilled size={icon.size} color={color.accentInk} />
              ) : (
                <IconHeart size={icon.size} color={color.accentInk} strokeWidth={2} />
              ),
              label: starred ? 'Unstar' : 'Star',
              onAction: () => onStar(song),
            }
      }
    >
      <ListRow
        title={song.title}
        meta={[song.artist, song.duration ? formatDuration(song.duration) : null]
          .filter(Boolean)
          .join(' · ')}
        artworkUri={showArtwork ? artworkUrl(song.coverArt) : undefined}
        showArtwork={showArtwork}
        action={action}
        favorited={starred}
        active={active}
        last={last}
        onPress={() => onPlay(index)}
        onLongPress={() => onOptions(song)}
        onActionPress={() => (action === 'queue' ? onQueue(song) : onStar(song))}
      />
    </SwipeableRow>
  );
});
