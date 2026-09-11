import { useCallback, useMemo, useState } from 'react';

import { layout } from '../theme/tokens';

/**
 * Reveals a long list a page at a time.
 *
 * Opening a 636-track playlist handed FlatList 636 items at once. It
 * virtualizes what it draws, but it still has to key, measure and manage the
 * whole set — and every track row here carries a pan gesture and three
 * worklets, so the cost per row is far above a plain <Text>. The result was a
 * screen that locked up for a second on open and stuttered while scrolling.
 *
 * Slicing costs nothing: the data is already in memory, so a page is a
 * pointer, not a fetch.
 */

/** Rows shown before the first Load more. */
export const FIRST_PAGE = 40;
/** Rows added per press. */
export const PAGE_SIZE = 60;

export interface PagedList<T> {
  /** The slice to render. */
  visible: T[];
  /** Total available, for the footer's label. */
  total: number;
  /** Whether a Load more control belongs at the end. */
  hasMore: boolean;
  /** How many the next press would add. */
  nextCount: number;
  loadMore: () => void;
  /** Call when the underlying collection changes identity. */
  reset: () => void;
}

export function usePagedList<T>(items: T[], firstPage = FIRST_PAGE): PagedList<T> {
  const [count, setCount] = useState(firstPage);

  const visible = useMemo(() => items.slice(0, count), [items, count]);
  const loadMore = useCallback(() => setCount((current) => current + PAGE_SIZE), []);
  const reset = useCallback(() => setCount(firstPage), [firstPage]);

  return {
    visible,
    total: items.length,
    hasMore: count < items.length,
    nextCount: Math.min(PAGE_SIZE, items.length - count),
    loadMore,
    reset,
  };
}

/**
 * FlatList tuning for row lists in this app.
 *
 * The defaults assume cheap rows. These are not — each is a gesture detector
 * with animated children — so the window is kept tight and offscreen rows are
 * detached rather than merely hidden.
 */
export const HEAVY_LIST_PROPS = {
  initialNumToRender: 12,
  maxToRenderPerBatch: 8,
  updateCellsBatchingPeriod: 50,
  windowSize: 7,
  removeClippedSubviews: true,
} as const;

/**
 * Track rows are a fixed height, so FlatList never has to measure one.
 *
 * Without this it lays out every cell to find where the next begins, which is
 * work proportional to the list on every data change — exactly the cost that
 * made each Load more slower than the one before it.
 */
export const trackItemLayout = (_data: unknown, index: number) => ({
  length: layout.rowHeight,
  offset: layout.rowHeight * index,
  index,
});
