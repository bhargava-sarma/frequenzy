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

export type LibraryStackParamList = {
  Artists: undefined;
  Artist: ArtistRouteParams;
  Album: AlbumRouteParams;
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

export type TabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Search: NavigatorScreenParams<SearchStackParamList>;
  Library: NavigatorScreenParams<LibraryStackParamList>;
  Queue: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  /** Full-screen player, presented over the tabs. */
  NowPlaying: undefined;
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
