import { memo, useCallback } from 'react';

import { IconHeart, IconHeartBroken, IconListDetails, IconX } from './icons';
import { ListRow } from './ListRow';
import { SwipeableRow } from './SwipeableRow';
import { useArtwork } from '../hooks/useArtwork';
import { useFavoritesStore, useStarred } from '../store/useFavoritesStore';
import { useTheme } from '../theme/ThemeProvider';
import type { Child } from '../types/subsonic';
import { formatDuration } from '../utils/time';

/**
 * One track in a list, and the reason long lists stay responsive.
 *
 * Memoised, with everything variable reduced to values that compare
 * cheaply. The swipe configuration is built in here rather than passed in:
 * it holds rendered icons, and an object literal of fresh JSX is a new prop
 * every render, which would defeat the memo while looking correct.
 *
 * Callers pass stable callbacks — useCallback, taking the song or index as
 * an argument instead of closing over it.
 */
export interface TrackRowProps {
  song: Child;
  /** Position within the list, handed back to onPlay. */
  index: number;
  active: boolean;
  /** Audio running, for the level mark on the active row. */
  playing?: boolean;
  last: boolean;
  /** 'index' shows track numbers instead of art — albums. */
  leading?: 'artwork' | 'index';
  /** The number shown in the index slot. Defaults to the tag, then position. */
  number?: number;
  /** Subtitle: the artist, artist and album, or nothing. */
  subtitle?: 'artist' | 'artistAlbum' | 'album' | 'none';
  /** What a left swipe does. Playlists remove; everywhere else likes. */
  leftAction?: 'like' | 'remove';
  onPlay: (index: number) => void;
  onMore: (song: Child) => void;
  onQueue: (song: Child) => void;
  onRemove?: (song: Child) => void;
}

export const TrackRow = memo(function TrackRow({
  song,
  index,
  active,
  playing = false,
  last,
  leading = 'artwork',
  number,
  subtitle = 'artist',
  leftAction = 'like',
  onPlay,
  onMore,
  onQueue,
  onRemove,
}: TrackRowProps) {
  const color = useTheme();
  const artworkUrl = useArtwork();
  const starred = useStarred(song.id, Boolean(song.starred));
  const setStarred = useFavoritesStore((state) => state.setStarred);

  const toggleLike = useCallback(() => {
    void setStarred(
      { id: song.id, kind: 'song', albumId: song.albumId, title: song.title },
      !starred,
    );
  }, [setStarred, song.id, song.albumId, song.title, starred]);

  const subtitleText =
    subtitle === 'none'
      ? undefined
      : subtitle === 'album'
      ? song.album
      : subtitle === 'artistAlbum'
        ? [song.artist, song.album].filter(Boolean).join(' · ')
        : song.artist;

  return (
    <SwipeableRow
      rightSwipe={{
        icon: <IconListDetails size={20} color={color.accentInk} strokeWidth={2} />,
        label: 'Queue',
        tone: 'accent',
        onAction: () => onQueue(song),
      }}
      leftSwipe={
        leftAction === 'remove'
          ? {
              icon: <IconX size={20} color="#FFFFFF" strokeWidth={2} />,
              label: 'Remove',
              tone: 'danger',
              onAction: () => onRemove?.(song),
            }
          : {
              icon: starred ? (
                <IconHeartBroken size={20} color={color.keyDarkInk} strokeWidth={2} />
              ) : (
                <IconHeart size={20} color={color.keyDarkInk} strokeWidth={2} />
              ),
              label: starred ? 'Unlike' : 'Like',
              tone: 'dark',
              onAction: toggleLike,
            }
      }
    >
      <ListRow
        title={song.title}
        subtitle={subtitleText}
        artworkUri={leading === 'artwork' ? artworkUrl(song.coverArt) : undefined}
        leading={leading}
        index={number ?? song.track ?? index + 1}
        active={active}
        playing={playing}
        starred={starred}
        trailingText={song.duration ? formatDuration(song.duration) : undefined}
        last={last}
        onPress={() => onPlay(index)}
        onLongPress={() => onMore(song)}
        onMore={() => onMore(song)}
      />
    </SwipeableRow>
  );
});
