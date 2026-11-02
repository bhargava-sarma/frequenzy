import { memo, useCallback } from 'react';
import { FlatList, StyleSheet, type ListRenderItem } from 'react-native';

import { AlbumTile } from './AlbumTile';
import { SectionHeader } from './SectionHeader';
import { layout, space } from '../theme/tokens';
import type { AlbumSummary } from '../types/subsonic';

/**
 * A horizontally scrolling row of albums under a numbered heading.
 *
 * A shelf with nothing in it renders nothing at all: play-derived shelves are
 * empty until enough has been scrobbled, and a labelled empty strip reads as
 * broken rather than as new.
 */
export interface ShelfProps {
  title: string;
  index?: string;
  albums: AlbumSummary[];
  tileSize: number;
  artworkUri: (coverArt: string | undefined, size?: number) => string | undefined;
  onSelect: (album: AlbumSummary) => void;
  onLongPress?: (album: AlbumSummary) => void;
  action?: string;
  onAction?: () => void;
  /** Show years on the covers. */
  showYear?: boolean;
}

export const Shelf = memo(function Shelf({
  title,
  index,
  albums,
  tileSize,
  artworkUri,
  onSelect,
  onLongPress,
  action,
  onAction,
  showYear = false,
}: ShelfProps) {
  const renderItem = useCallback<ListRenderItem<AlbumSummary>>(
    ({ item }) => (
      <AlbumTile
        title={item.name}
        subtitle={item.artist}
        artworkUri={artworkUri(item.coverArt, 300)}
        size={tileSize}
        year={showYear ? item.year : undefined}
        onPress={() => onSelect(item)}
        onLongPress={onLongPress ? () => onLongPress(item) : undefined}
      />
    ),
    [artworkUri, tileSize, showYear, onSelect, onLongPress],
  );

  if (albums.length === 0) return null;

  return (
    <>
      <SectionHeader title={title} index={index} action={action} onAction={onAction} />
      <FlatList
        data={albums}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(album) => album.id}
        contentContainerStyle={styles.content}
        renderItem={renderItem}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
      />
    </>
  );
});

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenPadding, gap: space[3] },
});
