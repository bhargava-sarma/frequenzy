import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './types';

/**
 * Navigation from outside the navigator.
 *
 * The player is an overlay above the navigator rather than a screen in it, so
 * it has no navigation context and `useNavigation` would throw. It still needs
 * to send you to an album or an artist, which is what this is for. Nothing
 * that lives inside a screen should use it — the hook is better there, since
 * it knows which stack it is in.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** Opens an album in the library tab. No-op before the container is ready. */
export function navigateToAlbum(albumId: string, albumName?: string): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Tabs', {
    screen: 'Library',
    params: { screen: 'Album', params: { albumId, albumName } },
  });
}

/** Opens an artist in the library tab. */
export function navigateToArtist(artistId: string, artistName?: string): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Tabs', {
    screen: 'Library',
    params: { screen: 'Artist', params: { artistId, artistName } },
  });
}
