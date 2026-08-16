import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * Route parameter types.
 *
 * Artist and Album appear in more than one stack — you can reach an album by
 * browsing the library or by searching — so their params are declared once
 * and reused rather than duplicated per navigator.
 */

export interface AlbumRouteParams {
  albumId: string;
  /** Shown as the header title before the album loads, to avoid a blank bar. */
  albumName?: string;
}

export interface ArtistRouteParams {
  artistId: string;
  artistName?: string;
}

/**
 * Reserved id for the favourites view.
 *
 * Navidrome exposes starred tracks through getStarred2 rather than as a
 * playlist, so they never appear in getPlaylists. Rather than build a second
 * near-identical screen, the playlist screen accepts this sentinel and reads
 * from the other endpoint. Real playlist ids are UUIDs, so it cannot collide.
 */
export const LIKED_PLAYLIST_ID = '__liked__';

export interface PlaylistRouteParams {
  playlistId: string;
  playlistName?: string;
}

export type LibraryStackParamList = {
  Artists: undefined;
  Artist: ArtistRouteParams;
  Album: AlbumRouteParams;
  Playlist: PlaylistRouteParams;
};

export type SearchStackParamList = {
  SearchHome: undefined;
  Artist: ArtistRouteParams;
  Album: AlbumRouteParams;
};

export type HomeStackParamList = {
  HomeFeed: undefined;
  Artist: ArtistRouteParams;
  Album: AlbumRouteParams;
};

/**
 * Three tabs, not four.
 *
 * The queue used to sit here, but a queue is a property of what's playing
 * rather than a place in the library — you go to it from the player, the way
 * every other music app arranges it. Giving it a permanent slot next to Home
 * and Library also spent a quarter of the nav on a screen that is empty until
 * something is playing.
 */
export type TabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Search: NavigatorScreenParams<SearchStackParamList>;
  Library: NavigatorScreenParams<LibraryStackParamList>;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  /** Reached from Home. */
  Settings: undefined;
  /** Development-only surfaces, not part of the shipped app. */
  Diagnostics: undefined;
  Showcase: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
