import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * Route parameter types.
 *
 * Every tab carries the same detail screens, so following a link from a
 * track, an album or a chart stays inside the tab you were in — Search
 * results open in Search, Home shelves in Home — and back returns there.
 */

export interface AlbumRouteParams {
  albumId: string;
  /** Shown before the album loads, to avoid a blank bar. */
  albumName?: string;
}

export interface ArtistRouteParams {
  artistId: string;
  artistName?: string;
}

/**
 * Reserved id for the favourites view. Navidrome exposes starred tracks
 * through getStarred2 rather than as a playlist; real playlist ids are
 * UUIDs, so this cannot collide.
 */
export const LIKED_PLAYLIST_ID = '__liked__';

export interface PlaylistRouteParams {
  playlistId: string;
  playlistName?: string;
}

export interface GenreRouteParams {
  genre: string;
  /** The tile colour it was opened from, so the page matches what was tapped. */
  hue?: string;
}

/** The screens every tab can push. */
export type DetailRoutes = {
  Album: AlbumRouteParams;
  Artist: ArtistRouteParams;
  Playlist: PlaylistRouteParams;
  Genre: GenreRouteParams;
  History: undefined;
  Stats: undefined;
};

export type HomeStackParamList = { HomeFeed: undefined } & DetailRoutes;
export type SearchStackParamList = { SearchHome: undefined } & DetailRoutes;
export type LibraryStackParamList = { LibraryHome: undefined } & DetailRoutes;

/** Any tab stack — detail screens type their navigation against this. */
export type AnyStackParamList = HomeStackParamList & SearchStackParamList & LibraryStackParamList;

export type TabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Search: NavigatorScreenParams<SearchStackParamList>;
  Library: NavigatorScreenParams<LibraryStackParamList>;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  Settings: undefined;
  /** Development-only surfaces. */
  Diagnostics: undefined;
  Showcase: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
