import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { IconPlaylist, IconPlus } from './icons';
import { Keycap, KeyRow } from './Keycap';
import { PromptSheet } from './PromptSheet';
import { Sheet, SheetBody, SheetRow } from './Sheet';
import { useArtwork } from '../hooks/useArtwork';
import { editablePlaylists, usePlaylistStore } from '../store/usePlaylistStore';
import { errorMessage, toast } from '../store/useToastStore';
import { space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeProvider';
import type { Playlist } from '../types/subsonic';
import { haptics } from '../utils/haptics';
import { pluralize } from '../utils/time';

/**
 * "Add to playlist", including making one on the spot — the moment you most
 * want a new playlist is when you have tracks that fit none of the others.
 *
 * Looks before it adds: Subsonic will happily store the same track twice,
 * and a silent second copy is only discovered later, halfway down the list.
 * Favourites are left out; the heart is how a track gets into those.
 */
export interface AddToPlaylistSheetProps {
  visible: boolean;
  onClose: () => void;
  songIds: string[];
  /** What's being added, for the header. */
  subject?: string;
  coverArt?: string;
}

export function AddToPlaylistSheet({
  visible,
  onClose,
  songIds,
  subject,
  coverArt,
}: AddToPlaylistSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const artworkUrl = useArtwork();

  const playlists = usePlaylistStore((state) => state.playlists);
  const load = usePlaylistStore((state) => state.load);
  const create = usePlaylistStore((state) => state.create);
  const addTracks = usePlaylistStore((state) => state.addTracks);
  const findDuplicates = usePlaylistStore((state) => state.findDuplicates);

  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ playlist: Playlist; count: number } | null>(null);

  // Refetched each time it opens: a playlist made elsewhere should be here.
  useEffect(() => {
    if (visible) {
      void load();
      setConflict(null);
      setBusy(null);
    }
  }, [visible, load]);

  const count = songIds.length;
  const what = count === 1 ? (subject ?? 'Track') : pluralize(count, 'track');

  async function add(playlist: Playlist) {
    setBusy(playlist.id);
    try {
      await addTracks(playlist.id, songIds);
      haptics.success();
      toast.success(`Added to ${playlist.name}`, { icon: 'playlist', detail: what });
      onClose();
    } catch (error) {
      toast.error("Couldn't add to playlist", { detail: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function choose(playlist: Playlist) {
    setBusy(playlist.id);
    const duplicates = await findDuplicates(playlist.id, songIds);
    setBusy(null);
    if (duplicates.length > 0) {
      setConflict({ playlist, count: duplicates.length });
      return;
    }
    await add(playlist);
  }

  const options = editablePlaylists(playlists);

  return (
    <>
      <Sheet
        visible={visible && !creating}
        onClose={onClose}
        title={conflict ? 'Already in playlist' : 'Add to playlist'}
        subtitle={what}
        artworkUri={coverArt ? artworkUrl(coverArt, 120) : null}
      >
        {conflict ? (
          <SheetBody>
            <Text style={styles.warning}>
              {conflict.count === count && count === 1
                ? `This track is already in ${conflict.playlist.name}.`
                : `${pluralize(conflict.count, 'track')} of these ${
                    conflict.count === 1 ? 'is' : 'are'
                  } already in ${conflict.playlist.name}.`}
            </Text>
            <Text style={styles.hint}>Adding again leaves a second copy in the playlist.</Text>
            <View style={styles.actions}>
              <KeyRow>
                <Keycap label="Cancel" flex onPress={() => setConflict(null)} />
                <Keycap
                  label="Add anyway"
                  variant="primary"
                  flex
                  busy={busy != null}
                  onPress={() => void add(conflict.playlist)}
                />
              </KeyRow>
            </View>
          </SheetBody>
        ) : (
          <ScrollView style={styles.list} bounces={false}>
            <SheetRow label="New playlist…" icon={IconPlus} tone="accent" onPress={() => setCreating(true)} />
            {options.map((playlist, index) => (
              <SheetRow
                key={playlist.id}
                icon={IconPlaylist}
                label={playlist.name}
                detail={
                  busy === playlist.id
                    ? '…'
                    : playlist.songCount != null
                      ? pluralize(playlist.songCount, 'track')
                      : undefined
                }
                disabled={busy != null}
                last={index === options.length - 1}
                onPress={() => void choose(playlist)}
              />
            ))}
          </ScrollView>
        )}
      </Sheet>

      <PromptSheet
        visible={visible && creating}
        onClose={() => setCreating(false)}
        title="New playlist"
        placeholder="Playlist name"
        confirmLabel="Create"
        onConfirm={async (name) => {
          try {
            await create(name, songIds);
            haptics.success();
            toast.success(`Created ${name}`, { icon: 'playlist', detail: what });
            setCreating(false);
            onClose();
          } catch (error) {
            toast.error("Couldn't create playlist", { detail: errorMessage(error) });
            throw error;
          }
        }}
      />
    </>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    list: { flexGrow: 0 },
    warning: { ...type.body, color: color.label, lineHeight: 21 },
    hint: { ...type.footnote, color: color.labelSecondary, marginTop: space[2], lineHeight: 18 },
    actions: { marginTop: space[5], marginBottom: space[2] },
  });
