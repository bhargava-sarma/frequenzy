import { useEffect, useState } from 'react';
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
import { EmptyMixError, startTrackRadio } from '../player/mixes';
import { useFavoritesStore, useStarred } from '../store/useFavoritesStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { errorMessage, toast } from '../store/useToastStore';
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
  // The song is held while a follow-on sheet is up: the caller usually
  // clears its target when this one closes.
  const [held, setHeld] = useState<Child | null>(song);

  useEffect(() => {
    if (visible && song) {
      setHeld(song);
      setNext('none');
      setPending('none');
    }
  }, [visible, song]);

  const target = song ?? held;

  function run(work: () => Promise<unknown> | void, message?: string, icon?: 'queue' | 'next') {
    onClose();
    void Promise.resolve()
      .then(work)
      .then(() => {
        if (message) toast.show(message, { icon, detail: target?.title });
      })
      .catch((error) => toast.error('Something went wrong', { detail: errorMessage(error) }));
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
                    onPress={() => run(() => playTrackNow(target))}
                  />
                )}
                <Keycap
                  icon={IconCornerDownRight}
                  label="Next"
                  accessibilityLabel="Play next"
                  size="sm"
                  flex
                  onPress={() => run(() => playNext([target]), 'Playing next', 'next')}
                />
                <Keycap
                  icon={IconListDetails}
                  label="Last"
                  accessibilityLabel="Play last"
                  size="sm"
                  flex
                  onPress={() => run(() => addToQueue([target]), 'Added to queue', 'queue')}
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
                  try {
                    const count = await startTrackRadio(target);
                    toast.show('Radio started', { icon: 'radio', detail: `${count} tracks like ${target.title}` });
                  } catch (error) {
                    if (error instanceof EmptyMixError) toast.show(error.message, { icon: 'info' });
                    else throw error;
                  }
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
