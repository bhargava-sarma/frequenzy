import { create } from 'zustand';

import { haptics } from '../utils/haptics';
import { usePlaylistStore } from './usePlaylistStore';
import { useServerStore } from './useServerStore';
import { errorMessage, toast } from './useToastStore';

/**
 * Favourites, as they stand right now.
 *
 * A heart is drawn from whatever record the screen loaded — an album cached
 * this morning, a search result, the extras of a queued item — and each of
 * those is a copy. Starring through one left the others wrong: the player's
 * heart stayed lit on the next track, a list sprang back on return. So every
 * toggle lands here first, and every heart reads here before falling back to
 * its own record. Server-side truth still wins on the next fetch; this only
 * covers the gap until then.
 */

export type StarKind = 'song' | 'album' | 'artist';

interface FavoritesStore {
  /** id → starred, for everything toggled this session. */
  overrides: Record<string, boolean>;
  /**
   * Optimistic: the heart responds to the tap, not to the round trip, and
   * is put back if the server refuses.
   */
  setStarred: (
    target: { id: string; kind: StarKind; albumId?: string; title?: string },
    starred: boolean,
  ) => Promise<void>;
}

export const useFavoritesStore = create<FavoritesStore>((set, get) => ({
  overrides: {},

  setStarred: async (target, starred) => {
    const client = useServerStore.getState().client;
    if (!client) return;

    const previous = get().overrides[target.id];
    set({ overrides: { ...get().overrides, [target.id]: starred } });
    haptics.press();

    const param =
      target.kind === 'song'
        ? { id: target.id }
        : target.kind === 'album'
          ? { albumId: target.id }
          : { artistId: target.id };

    try {
      if (starred) await client.star(param);
      else await client.unstar(param);

      // Cached copies now disagree with the server; drop the one that a
      // return visit would show, and refresh the synthetic Liked playlist.
      const library = useServerStore.getState().library;
      if (target.kind === 'song' && target.albumId) void library?.invalidateAlbum(target.albumId);
      if (target.kind === 'album') void library?.invalidateAlbum(target.id);
      if (target.kind === 'song') void usePlaylistStore.getState().load();

      const noun = target.kind === 'song' ? '' : target.kind === 'album' ? ' album' : ' artist';
      toast.show(starred ? `Liked${noun}` : `Removed from liked${noun}s`, {
        icon: starred ? 'heart' : 'heartOff',
        detail: target.title,
      });
    } catch (error) {
      const overrides = { ...get().overrides };
      if (previous === undefined) delete overrides[target.id];
      else overrides[target.id] = previous;
      set({ overrides });
      toast.error("Couldn't update favourites", { detail: errorMessage(error) });
    }
  },
}));

/** The live starred state of `id`, given what the screen's own record says. */
export function useStarred(id: string | undefined | null, fallback: boolean): boolean {
  return useFavoritesStore((state) =>
    id != null && id in state.overrides ? state.overrides[id] : fallback,
  );
}

/** Non-hook read, for callbacks. */
export function isStarred(id: string, fallback: boolean): boolean {
  const overrides = useFavoritesStore.getState().overrides;
  return id in overrides ? overrides[id] : fallback;
}
