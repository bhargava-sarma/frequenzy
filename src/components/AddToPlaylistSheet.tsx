import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, ButtonRow } from './Button';
import { Sheet, SheetBody, SheetOption } from './Sheet';
import { editablePlaylists, usePlaylistStore } from '../store/usePlaylistStore';
import { hairline, radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import type { Playlist } from '../types/subsonic';
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
  const findDuplicates = usePlaylistStore((state) => state.findDuplicates);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  /** Set when the chosen playlist already holds some of these tracks. */
  const [conflict, setConflict] = useState<{ playlist: Playlist; count: number } | null>(
    null,
  );

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
      setConflict(null);
      setChecking(null);
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

  /**
   * Looks before it adds.
   *
   * Subsonic will happily store the same track twice, so nothing upstream
   * stops this — and a silent second copy is only discovered later, halfway
   * down the playlist. The check costs one request and only on the playlist
   * actually chosen.
   */
  async function choose(playlist: Playlist) {
    setChecking(playlist.id);
    try {
      const duplicates = await findDuplicates(playlist.id, songIds);
      if (duplicates.length > 0) {
        setConflict({ playlist, count: duplicates.length });
        return;
      }
      await run(() => addTracks(playlist.id, songIds));
    } finally {
      setChecking(null);
    }
  }

  const options = editablePlaylists(playlists);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={conflict ? 'Already in playlist' : creating ? 'New playlist' : 'Add to playlist'}
      detail={subject ?? (songIds.length > 1 ? pluralize(songIds.length, 'track') : undefined)}
    >
      {conflict ? (
        <SheetBody>
          <Text style={styles.warning}>
            {conflict.count === songIds.length && songIds.length === 1
              ? `This track is already in ${conflict.playlist.name}.`
              : `${pluralize(conflict.count, 'track')} of these ${
                  conflict.count === 1 ? 'is' : 'are'
                } already in ${conflict.playlist.name}.`}
          </Text>
          <Text style={styles.warningHint}>
            Adding again will leave a second copy in the playlist.
          </Text>
          <View style={styles.actions}>
            <ButtonRow>
              <Button
                label="Add anyway"
                variant="primary"
                busy={busy}
                onPress={() => void run(() => addTracks(conflict.playlist.id, songIds))}
              />
              <Button label="Cancel" onPress={() => setConflict(null)} />
            </ButtonRow>
          </View>
        </SheetBody>
      ) : creating ? (
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
              disabled={busy || checking != null}
              last={index === options.length - 1}
              onPress={() => void choose(playlist)}
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
    warning: { ...type.body, color: color.textInverse, lineHeight: 21 },
    warningHint: {
      ...type.meta,
      color: color.textInverseSecondary,
      marginTop: space[2],
      lineHeight: 18,
    },
    // Kept for parity with the other sheet bodies.
  });
