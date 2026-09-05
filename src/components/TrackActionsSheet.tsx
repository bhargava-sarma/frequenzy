import { useState } from 'react';
import { ScrollView } from 'react-native';

import { AddToPlaylistSheet } from './AddToPlaylistSheet';
import { Sheet, SheetOption } from './Sheet';
import { navigateToAlbum, navigateToArtist } from '../navigation/ref';
import { usePlayerStore } from '../store/usePlayerStore';
import { useServerStore } from '../store/useServerStore';
import type { Child } from '../types/subsonic';

/**
 * What you can do with one track, from wherever you long-pressed it.
 *
 * Long-press used to open "add to playlist" directly, which quietly decided
 * that adding to a playlist was the only thing anyone might want. Queueing is
 * more common, and the two navigation rows are how you get from a track you
 * are hearing to the rest of the record it came from.
 *
 * Rows the current screen would only bounce you back to are hidden rather
 * than disabled — "Go to album" from inside that album is noise, not a
 * disabled affordance worth explaining.
 */
export interface TrackActionsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The track. Null while nothing is targeted, which keeps callers simple. */
  song: Child | null;
  /** Suppresses navigation rows that lead back to the current screen. */
  hide?: ('album' | 'artist')[];
  /** One screen-specific row, e.g. removing from the playlist you're in. */
  extraAction?: { label: string; onPress: () => void; emphasis?: boolean };
  /** Called after a star is toggled, so the caller can refresh its list. */
  onStarChanged?: () => void;
}

export function TrackActionsSheet({
  visible,
  onClose,
  song,
  hide = [],
  extraAction,
  onStarChanged,
}: TrackActionsSheetProps) {
  const playNext = usePlayerStore((state) => state.playNext);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const client = useServerStore((state) => state.client);

  // The playlist picker replaces this sheet rather than stacking on it: two
  // native modals at once is a stack Android does not always unwind cleanly.
  const [pickingPlaylist, setPickingPlaylist] = useState(false);

  const starred = Boolean(song?.starred);

  function run(work: () => void | Promise<unknown>) {
    void Promise.resolve(work()).catch(() => {
      // Queue and star failures are self-correcting on the next read, and a
      // sheet that refuses to close on a transient error is worse.
    });
    onClose();
  }

  async function toggleStar() {
    if (!client || !song) return;
    if (starred) await client.unstar({ id: song.id });
    else await client.star({ id: song.id });
    onStarChanged?.();
  }

  const showAlbum = !hide.includes('album') && song?.albumId;
  const showArtist = !hide.includes('artist') && song?.artistId;

  return (
    <>
      <Sheet
        visible={visible && !pickingPlaylist}
        onClose={onClose}
        title={song?.title ?? 'Track'}
        detail={song?.artist}
      >
        <ScrollView>
          <SheetOption label="Play next" onPress={() => run(() => playNext([song!]))} />
          <SheetOption label="Add to queue" onPress={() => run(() => addToQueue([song!]))} />
          <SheetOption
            label="Add to playlist…"
            onPress={() => setPickingPlaylist(true)}
          />
          <SheetOption
            label={starred ? 'Remove from liked songs' : 'Add to liked songs'}
            onPress={() => run(toggleStar)}
          />
          {showAlbum && (
            <SheetOption
              label="Go to album"
              onPress={() =>
                run(() => navigateToAlbum(song!.albumId as string, song!.album))
              }
            />
          )}
          {showArtist && (
            <SheetOption
              label="Go to artist"
              onPress={() =>
                run(() => navigateToArtist(song!.artistId as string, song!.artist))
              }
            />
          )}
          {extraAction && (
            <SheetOption
              label={extraAction.label}
              emphasis={extraAction.emphasis}
              last
              onPress={() => run(extraAction.onPress)}
            />
          )}
        </ScrollView>
      </Sheet>

      <AddToPlaylistSheet
        visible={pickingPlaylist}
        onClose={() => {
          setPickingPlaylist(false);
          onClose();
        }}
        songIds={song ? [song.id] : []}
        subject={song?.title}
      />
    </>
  );
}
