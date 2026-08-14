import { FlatList, StyleSheet } from 'react-native';

import { layout, space } from '../theme/tokens';
import { AlbumTile } from './AlbumTile';
import { SectionHeader } from './SectionHeader';
import type { AlbumSummary } from '../types/subsonic';

/**
 * A horizontally scrolling row of albums under a section header.
 *
 * Shelves exist so Home can hold several orderings at once. A vertical list
 * can show one thing; four short horizontal rows show "what's new", "what I've
 * been playing" and "what I play most" in a single screen, which is the whole
 * point of a home screen as opposed to a browse screen.
 *
 * A shelf with nothing in it renders nothing at all. Recently-played and
 * most-played are empty until enough has been scrobbled, and a labelled empty
 * strip reads as broken rather than as new.
 */
export interface ShelfProps {
  title: string;
  albums: AlbumSummary[];
  /** Edge length of each tile. */
  tileSize: number;
  artworkUri: (coverArt: string | undefined, size?: number) => string | undefined;
  onSelect: (album: AlbumSummary) => void;
}

export function Shelf({ title, albums, tileSize, artworkUri, onSelect }: ShelfProps) {
  if (albums.length === 0) return null;

  return (
    <>
      <SectionHeader title={title} />
      <FlatList
        data={albums}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(album) => album.id}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => (
          <AlbumTile
            title={item.name}
            subtitle={item.artist}
            artworkUri={artworkUri(item.coverArt, 400)}
            size={tileSize}
            onPress={() => onSelect(item)}
          />
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.screenPadding,
    gap: space[3],
    paddingBottom: space[2],
  },
});
