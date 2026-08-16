import { create } from 'zustand';

import { LIKED_PLAYLIST_ID } from '../navigation/types';
import type { Playlist } from '../types/subsonic';
import { useServerStore } from './useServerStore';

/**
 * The playlist collection, and every edit to it.
 *
 * Playlists are the one part of the library this app writes to, so they get a
 * store rather than per-screen fetches: an edit made on a track row has to be
 * visible on the library list and inside the playlist itself, and three
 * screens each holding their own copy would disagree the moment one changed.
 *
 * Every mutation goes to Navidrome first and the local list is rebuilt from
 * the server's answer. Optimistic updates would be nicer to look at, but a
 * playlist that shows a track the server rejected is worse than a short wait —
 * this is the user's library, not a feed.
 */

interface PlaylistStore {
  playlists: Playlist[];
  loading: boolean;
  error: string | null;

  /** Refetches from the server. Safe to call often; it dedupes nothing. */
  load: () => Promise<void>;

  create: (name: string, songIds?: string[]) => Promise<Playlist | null>;
  rename: (playlistId: string, name: string) => Promise<void>;
  remove: (playlistId: string) => Promise<void>;
  addTracks: (playlistId: string, songIds: string[]) => Promise<void>;
  /** Removes by position — see the client's note on why ids won't do. */
  removeTrackAt: (playlistId: string, index: number) => Promise<void>;
}

function client() {
  const instance = useServerStore.getState().client;
  if (!instance) throw new Error('Not connected to a server');
  return instance;
}

export const usePlaylistStore = create<PlaylistStore>((set, get) => ({
  playlists: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true });
    try {
      const [lists, starred] = await Promise.all([
        client().getPlaylists(),
        client().getStarred2(),
      ]);

      const songs = starred.starred2.song ?? [];
      // Favourites are not a playlist on the server — Navidrome keeps them
      // behind getStarred2 — so they are synthesised here to sit alongside.
      const liked: Playlist = {
        id: LIKED_PLAYLIST_ID,
        name: 'Liked songs',
        songCount: songs.length,
        duration: songs.reduce((sum, song) => sum + (song.duration ?? 0), 0),
        coverArt: songs[0]?.coverArt,
      };

      set({
        playlists: [liked, ...(lists.playlists.playlist ?? [])],
        loading: false,
        error: null,
      });
    } catch (cause) {
      set({
        loading: false,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  },

  create: async (name, songIds = []) => {
    const response = await client().createPlaylist(name.trim(), songIds);
    await get().load();
    return response.playlist ?? null;
  },

  rename: async (playlistId, name) => {
    await client().updatePlaylist({ playlistId, name: name.trim() });
    await get().load();
  },

  remove: async (playlistId) => {
    await client().deletePlaylist(playlistId);
    await get().load();
  },

  addTracks: async (playlistId, songIds) => {
    if (songIds.length === 0) return;
    await client().updatePlaylist({ playlistId, songIdToAdd: songIds });
    await get().load();
  },

  removeTrackAt: async (playlistId, index) => {
    await client().updatePlaylist({ playlistId, songIndexToRemove: [index] });
    await get().load();
  },
}));

/** Playlists you can actually edit — everything but the synthetic favourites. */
export function editablePlaylists(playlists: Playlist[]): Playlist[] {
  return playlists.filter((playlist) => playlist.id !== LIKED_PLAYLIST_ID);
}
