import { createNavigationContainerRef } from '@react-navigation/native';

import { usePlayerUiStore } from '../store/usePlayerUiStore';
import type { DetailRoutes, RootStackParamList, TabParamList } from './types';

/**
 * Navigation from outside a screen — the player overlay, sheets, stores.
 *
 * Detail links open inside whichever tab is showing, so "Go to album" from a
 * search result lands in Search and back returns to the results. The player
 * is closed first: it sits above the navigator, and a push behind it would
 * be invisible.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

type TabName = keyof TabParamList;

function currentTab(): TabName {
  const root = navigationRef.getRootState();
  const tabs = root?.routes.find((route) => route.name === 'Tabs')?.state;
  const name = tabs?.routes[tabs.index ?? 0]?.name;
  return name === 'Search' || name === 'Library' || name === 'Home' ? name : 'Home';
}

export function navigateToDetail<K extends keyof DetailRoutes>(
  screen: K,
  ...params: DetailRoutes[K] extends undefined ? [] : [DetailRoutes[K]]
): void {
  if (!navigationRef.isReady()) return;
  usePlayerUiStore.getState().closePlayer();
  const tab = currentTab();
  // The nested-navigator call is typed per tab; every tab carries the same
  // detail routes, so the cast is a narrowing the compiler can't follow.
  (navigationRef.navigate as (...args: unknown[]) => void)('Tabs', {
    screen: tab,
    params: { screen, params: params[0] },
  });
}

export const navigateToAlbum = (albumId: string, albumName?: string) =>
  navigateToDetail('Album', { albumId, albumName });

export const navigateToArtist = (artistId: string, artistName?: string) =>
  navigateToDetail('Artist', { artistId, artistName });

export const navigateToGenre = (genre: string) => navigateToDetail('Genre', { genre });
