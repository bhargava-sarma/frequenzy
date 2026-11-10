import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { AddToPlaylistSheet } from './AddToPlaylistSheet';
import {
  IconAlbum,
  IconCornerDownRight,
  IconHeart,
  IconHeartFilled,
  IconInfoCircle,
  IconListDetails,
  IconPlayerPlayFilled,
  IconPlaylistAdd,
  IconRadio,
  IconShare,
  IconUser,
  type IconComponent,
} from './icons';
import { Keycap, KeyRow } from './Keycap';
import { Sheet, SheetRow } from './Sheet';
import { TrackInfoSheet } from './TrackInfoSheet';
import { useArtwork } from '../hooks/useArtwork';
import { navigateToAlbum, navigateToArtist } from '../navigation/ref';
import { EmptyMixError, completeSong, startTrackRadio } from '../player/mixes';
import { useFavoritesStore, useStarred } from '../store/useFavoritesStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { toast } from '../store/useToastStore';
import { layout, space } from '../theme/tokens';
import type { Child } from '../types/subsonic';

/**
 * Everything you can do with one track, from wherever you long-pressed it.
 *
 * The four things done most sit as keys along the top — play, play next,
 * queue, like — and the rest as rows. Rows that would only lead back to the
 * screen you're on ("Go to album" from that album) are hidden rather than
 * disabled. Follow-on sheets (playlists, info) replace this one rather than
 * stacking, since two native modals at once is a stack Android doesn't
 * always unwind cleanly.
 */
export interface TrackActionsSheetProps {
  visible: boolean;
  onClose: () => void;
  song: Child | null;
  hide?: ('album' | 'artist' | 'play')[];
  /** One screen-specific row, e.g. removing from the playlist you're in. */
  extraAction?: { label: string; icon?: IconComponent; onPress: () => void; destructive?: boolean };
}

type Next = 'none' | 'playlist' | 'info';

export function TrackActionsSheet({ visible, onClose, song, hide = [], extraAction }: TrackActionsSheetProps) {
  const artworkUrl = useArtwork();
  const playTrackNow = usePlayerStore((state) => state.playTrackNow);
  const playNext = usePlayerStore((state) => state.playNext);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const setStarred = useFavoritesStore((state) => state.setStarred);
  const starred = useStarred(song?.id, Boolean(song?.starred));

  /** The follow-on sheet showing, and the one waiting for this to close. */
  const [next, setNext] = useState<Next>('none');
  const [pending, setPending] = useState<Next>('none');
  /**
   * The track this sheet was opened for, fixed for as long as it is up.
   *
   * Captured on the way open rather than followed from the prop. The player
   * hands over the playing track, which is a new object on every one of its
   * once-a-second renders and a different track altogether when the song
   * changes: following it reset the follow-on sheets every second — "Add to
   * playlist" opened and shut again before a playlist could be picked — and
   * would have put the wrong track in a playlist if the song ended while
   * one was being chosen. Held past close too, since the caller usually
   * clears its target then and the sheet still has an exit to play.
   */
  const [held, setHeld] = useState<Child | null>(song);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setHeld(song);
      setNext('none');
      setPending('none');
    }
  }

  const target = held ?? song;

  function run(work: () => Promise<unknown> | void, message?: string, icon?: 'queue' | 'next') {
    onClose();
    toast.guard(
      Promise.resolve()
        .then(work)
        .then(() => {
          if (message) toast.show(message, { icon, detail: target?.title });
        }),
      'Something went wrong',
      EmptyMixError,
    );
  }

  const showAlbum = !hide.includes('album') && target?.albumId;
  const showArtist = !hide.includes('artist') && target?.artistId;

  return (
    <>
      <Sheet
        visible={visible && next === 'none' && pending === 'none'}
        onClose={onClose}
        onClosed={() => {
          // Opened only once this sheet is fully gone: two native modals
          // overlapping is a stack Android doesn't always unwind cleanly.
          if (pending !== 'none') {
            setNext(pending);
            setPending('none');
          }
        }}
        title={target?.title ?? 'Track'}
        subtitle={[target?.artist, target?.album].filter(Boolean).join(' · ')}
        artworkUri={artworkUrl(target?.coverArt, 120) ?? null}
      >
        {target && (
          <>
            <View style={styles.keys}>
              <KeyRow>
                {!hide.includes('play') && (
                  <Keycap
                    icon={IconPlayerPlayFilled}
                    iconFilled
                    label="Play"
                    size="sm"
                    variant="primary"
                    flex
                    onPress={() => run(async () => playTrackNow(await completeSong(target)))}
                  />
                )}
                <Keycap
                  icon={IconCornerDownRight}
                  label="Next"
                  accessibilityLabel="Play next"
                  size="sm"
                  flex
                  onPress={() => run(async () => playNext([await completeSong(target)]), 'Playing next', 'next')}
                />
                <Keycap
                  icon={IconListDetails}
                  label="Last"
                  accessibilityLabel="Play last"
                  size="sm"
                  flex
                  onPress={() => run(async () => addToQueue([await completeSong(target)]), 'Added to queue', 'queue')}
                />
                <Keycap
                  icon={starred ? IconHeartFilled : IconHeart}
                  iconFilled={starred}
                  size="sm"
                  square
                  active={starred}
                  accessibilityLabel={starred ? 'Unlike' : 'Like'}
                  onPress={() => {
                    onClose();
                    void setStarred(
                      { id: target.id, kind: 'song', albumId: target.albumId, title: target.title },
                      !starred,
                    );
                  }}
                />
              </KeyRow>
            </View>

            <SheetRow label="Add to playlist…" icon={IconPlaylistAdd} onPress={() => setPending('playlist')} />
            <SheetRow
              label="Start radio"
              icon={IconRadio}
              onPress={() =>
                run(async () => {
                  const count = await startTrackRadio(await completeSong(target));
                  toast.show('Radio started', { icon: 'radio', detail: `${count} tracks like ${target.title}` });
                })
              }
            />
            {showAlbum && (
              <SheetRow
                label="Go to album"
                icon={IconAlbum}
                detail={target.album}
                onPress={() => run(() => navigateToAlbum(target.albumId as string, target.album))}
              />
            )}
            {showArtist && (
              <SheetRow
                label="Go to artist"
                icon={IconUser}
                detail={target.artist}
                onPress={() => run(() => navigateToArtist(target.artistId as string, target.artist))}
              />
            )}
            <SheetRow label="Track info" icon={IconInfoCircle} onPress={() => setPending('info')} />
            <SheetRow
              label="Share"
              icon={IconShare}
              last={!extraAction}
              onPress={() =>
                run(() =>
                  Share.share({
                    message: [target.title, target.artist, target.album].filter(Boolean).join(' — '),
                  }).then(() => undefined),
                )
              }
            />
            {extraAction && (
              <SheetRow
                label={extraAction.label}
                icon={extraAction.icon}
                tone={extraAction.destructive ? 'destructive' : 'default'}
                last
                onPress={() => run(extraAction.onPress)}
              />
            )}
          </>
        )}
      </Sheet>

      <AddToPlaylistSheet
        visible={visible && next === 'playlist'}
        onClose={() => {
          setNext('none');
          onClose();
        }}
        songIds={target ? [target.id] : []}
        subject={target?.title}
        coverArt={target?.coverArt}
      />

      <TrackInfoSheet
        visible={visible && next === 'info'}
        onClose={() => {
          setNext('none');
          onClose();
        }}
        songId={target?.id ?? null}
        initial={target}
      />
    </>
  );
}

const styles = StyleSheet.create({
  keys: { paddingHorizontal: layout.panelPadding + space[1], paddingTop: space[2], paddingBottom: space[3] },
});
