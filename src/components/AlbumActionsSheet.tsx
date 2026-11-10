import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { AddToPlaylistSheet } from './AddToPlaylistSheet';
import {
  IconArrowsShuffle,
  IconCornerDownRight,
  IconHeart,
  IconHeartFilled,
  IconListDetails,
  IconPlayerPlayFilled,
  IconPlaylistAdd,
  IconRadio,
  IconShare,
  IconUser,
} from './icons';
import { Keycap, KeyRow } from './Keycap';
import { Sheet, SheetRow } from './Sheet';
import { useArtwork } from '../hooks/useArtwork';
import { navigateToArtist } from '../navigation/ref';
import { EmptyMixError, startArtistRadio } from '../player/mixes';
import { useFavoritesStore, useStarred } from '../store/useFavoritesStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { useServerStore } from '../store/useServerStore';
import { errorMessage, toast } from '../store/useToastStore';
import { layout, space } from '../theme/tokens';
import type { AlbumSummary, Child } from '../types/subsonic';
import { pluralize } from '../utils/time';

/**
 * What you can do with a whole album without opening it — from a long-press
 * on its tile, or the ⋯ on its page.
 *
 * Album summaries carry no tracks, so each action fetches them first through
 * the cached repository: one request the first time, nothing after.
 */
export interface AlbumActionsSheetProps {
  visible: boolean;
  onClose: () => void;
  album: AlbumSummary | null;
  hide?: ('artist')[];
}

export function AlbumActionsSheet({ visible, onClose, album, hide = [] }: AlbumActionsSheetProps) {
  const artworkUrl = useArtwork();
  const library = useServerStore((state) => state.library);
  const playNow = usePlayerStore((state) => state.playNow);
  const shufflePlay = usePlayerStore((state) => state.shufflePlay);
  const playNext = usePlayerStore((state) => state.playNext);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const setStarred = useFavoritesStore((state) => state.setStarred);
  const starred = useStarred(album?.id, Boolean(album?.starred));

  // The album this sheet was opened for, captured on the way open and held
  // through close: the caller clears its target then, and the sheet still
  // has an exit to play and perhaps a follow-on to show.
  const [held, setHeld] = useState<AlbumSummary | null>(album);
  const [pending, setPending] = useState(false);
  const [picking, setPicking] = useState<string[] | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setHeld(album);
      setPicking(null);
      setPending(false);
    }
  }

  const target = held ?? album;

  async function songs(): Promise<Child[]> {
    if (!library || !target) return [];
    return (await library.getAlbum(target.id)).songs;
  }

  function run(work: (tracks: Child[]) => Promise<unknown>, message?: string, icon?: 'queue' | 'next') {
    onClose();
    void (async () => {
      try {
        const tracks = await songs();
        if (tracks.length === 0) {
          toast.show('This album has no tracks', { icon: 'info' });
          return;
        }
        await work(tracks);
        if (message) toast.show(message, { icon, detail: `${target?.name} · ${pluralize(tracks.length, 'track')}` });
      } catch (error) {
        toast.error('Something went wrong', { detail: errorMessage(error) });
      }
    })();
  }

  const source = target ? { kind: 'album' as const, label: target.name } : undefined;

  return (
    <>
      <Sheet
        visible={visible && picking == null && !pending}
        onClose={onClose}
        onClosed={() => {
          if (!pending) return;
          // `pending` stays set until the tracks are in hand. Cleared first,
          // there was a stretch with nothing pending and nothing picked —
          // which is this sheet's own cue to show — so it rose again for as
          // long as the fetch took and dropped a second time.
          void songs()
            .then((tracks) => {
              setPicking(tracks.map((t) => t.id));
              setPending(false);
            })
            .catch((error) => {
              setPending(false);
              toast.error("Couldn't load tracks", { detail: errorMessage(error) });
              onClose();
            });
        }}
        title={target?.name ?? 'Album'}
        subtitle={[target?.artist, target?.year ? String(target.year) : null].filter(Boolean).join(' · ')}
        artworkUri={artworkUrl(target?.coverArt, 120) ?? null}
      >
        {target && (
          <>
            <View style={styles.keys}>
              <KeyRow>
                <Keycap
                  icon={IconPlayerPlayFilled}
                  iconFilled
                  label="Play"
                  size="sm"
                  variant="primary"
                  flex
                  onPress={() => run((tracks) => playNow(tracks, 0, source))}
                />
                <Keycap
                  icon={IconArrowsShuffle}
                  label="Shuffle"
                  size="sm"
                  flex
                  onPress={() => run((tracks) => shufflePlay(tracks, source))}
                />
                <Keycap
                  icon={starred ? IconHeartFilled : IconHeart}
                  iconFilled={starred}
                  size="sm"
                  square
                  active={starred}
                  accessibilityLabel={starred ? 'Unlike album' : 'Like album'}
                  onPress={() => {
                    onClose();
                    void setStarred({ id: target.id, kind: 'album', title: target.name }, !starred);
                  }}
                />
              </KeyRow>
            </View>
            <SheetRow
              label="Play next"
              icon={IconCornerDownRight}
              onPress={() => run((tracks) => playNext(tracks), 'Playing next', 'next')}
            />
            <SheetRow
              label="Add to queue"
              icon={IconListDetails}
              onPress={() => run((tracks) => addToQueue(tracks), 'Added to queue', 'queue')}
            />
            <SheetRow label="Add to playlist…" icon={IconPlaylistAdd} onPress={() => setPending(true)} />
            {target.artistId && (
              <SheetRow
                label="Artist radio"
                icon={IconRadio}
                detail={target.artist}
                onPress={() => {
                  onClose();
                  void startArtistRadio(target.artistId as string, target.artist ?? 'Artist')
                    .then((count) =>
                      toast.show('Radio started', { icon: 'radio', detail: `${count} tracks` }),
                    )
                    .catch((error) =>
                      error instanceof EmptyMixError
                        ? toast.show(error.message, { icon: 'info' })
                        : toast.error("Couldn't start radio", { detail: errorMessage(error) }),
                    );
                }}
              />
            )}
            {!hide.includes('artist') && target.artistId && (
              <SheetRow
                label="Go to artist"
                icon={IconUser}
                detail={target.artist}
                onPress={() => {
                  onClose();
                  navigateToArtist(target.artistId as string, target.artist);
                }}
              />
            )}
            <SheetRow
              label="Share"
              icon={IconShare}
              last
              onPress={() => {
                onClose();
                void Share.share({
                  message: [target.name, target.artist, target.year].filter(Boolean).join(' — '),
                }).catch(() => {});
              }}
            />
          </>
        )}
      </Sheet>

      <AddToPlaylistSheet
        visible={visible && picking != null}
        onClose={() => {
          setPicking(null);
          onClose();
        }}
        songIds={picking ?? []}
        subject={target?.name}
        coverArt={target?.coverArt}
      />
    </>
  );
}

const styles = StyleSheet.create({
  keys: { paddingHorizontal: layout.panelPadding + space[1], paddingTop: space[2], paddingBottom: space[3] },
});
