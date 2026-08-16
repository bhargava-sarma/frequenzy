import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button, ButtonRow } from './Button';
import { Sheet, SheetBody, SheetOption } from './Sheet';
import { editablePlaylists, usePlaylistStore } from '../store/usePlaylistStore';
import { hairline, layout, radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { pluralize } from '../utils/time';

/**
 * "Add to playlist", including making one on the spot.
 *
 * Creating from here rather than sending you to a separate screen matters:
 * the moment you most want a new playlist is when you have a track that
 * doesn't fit any of the existing ones, and that is exactly this moment.
 *
 * Favourites are excluded from the list. They are not a playlist on the
 * server, and the heart on the row is already how a track gets added to them.
 */
export interface AddToPlaylistSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Tracks to add. One from a row, many from an album's action. */
  songIds: string[];
  /** What's being added, for the header. */
  subject?: string;
}

export function AddToPlaylistSheet({
  visible,
  onClose,
  songIds,
  subject,
}: AddToPlaylistSheetProps) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);

  const playlists = usePlaylistStore((state) => state.playlists);
  const load = usePlaylistStore((state) => state.load);
  const create = usePlaylistStore((state) => state.create);
  const addTracks = usePlaylistStore((state) => state.addTracks);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  // Refetch each time it opens: a playlist made on another device, or on the
  // last visit to this sheet, should be here.
  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  // Reset on close so it never reopens mid-way through creating something.
  useEffect(() => {
    if (!visible) {
      setCreating(false);
      setName('');
    }
  }, [visible]);

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    try {
      await work();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const options = editablePlaylists(playlists);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={creating ? 'New playlist' : 'Add to playlist'}
      detail={subject ?? (songIds.length > 1 ? pluralize(songIds.length, 'track') : undefined)}
    >
      {creating ? (
        <SheetBody>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Playlist name"
            placeholderTextColor={color.textInverseSecondary}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => {
              if (name.trim()) void run(() => create(name, songIds));
            }}
          />
          <View style={styles.actions}>
            <ButtonRow>
              <Button
                label="Create"
                variant="primary"
                busy={busy}
                disabled={name.trim().length === 0}
                onPress={() => void run(() => create(name, songIds))}
              />
              <Button label="Cancel" onPress={() => setCreating(false)} />
            </ButtonRow>
          </View>
        </SheetBody>
      ) : (
        <ScrollView>
          <SheetOption label="New playlist…" emphasis onPress={() => setCreating(true)} />
          {options.map((playlist, index) => (
            <SheetOption
              key={playlist.id}
              label={playlist.name}
              detail={
                playlist.songCount != null ? pluralize(playlist.songCount, 'track') : undefined
              }
              disabled={busy}
              last={index === options.length - 1}
              onPress={() => void run(() => addTracks(playlist.id, songIds))}
            />
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    input: {
      ...type.body,
      color: color.textInverse,
      height: 48,
      paddingHorizontal: space[3],
      borderWidth: hairline,
      borderColor: color.panelLine,
      borderRadius: radius.sm,
      backgroundColor: color.panelRaised,
    },
    actions: { marginTop: space[4], paddingBottom: space[3] },
    // Kept for parity with the other sheet bodies.
    body: { paddingHorizontal: layout.panelPadding },
  });
