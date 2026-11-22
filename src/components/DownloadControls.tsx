import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  IconAlertTriangle,
  IconCircleArrowDown,
  IconCircleArrowDownFilled,
  IconCircleCheckFilled,
  IconDownload,
  IconTrash,
} from './icons';
import { Keycap } from './Keycap';
import { Label } from './Label';
import { Led } from './Led';
import { Sheet, SheetRow } from './Sheet';
import { downloadCollection, removeCollection, type CollectionInput } from '../offline/downloads';
import { collectionKey } from '../offline/types';
import {
  useCollectionDownload,
  useDownloadProgress,
  useDownloadStore,
  type TrackDownloadStatus,
} from '../store/useDownloadStore';
import { errorMessage, toast } from '../store/useToastStore';
import { space } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import type { Child } from '../types/subsonic';
import { haptics } from '../utils/haptics';
import { pluralize } from '../utils/time';

/**
 * The download controls that sit with an album or playlist: one key to keep
 * it on the device or let it go, and a line saying how far it has got.
 */

const KIND_WORD = { album: 'album', playlist: 'playlist', liked: 'liked songs' } as const;

/** Starts downloading a collection, saying so — or saying why it can't. */
export function startCollectionDownload(input: CollectionInput, songs: Child[]): void {
  try {
    if (songs.length === 0) {
      toast.show('Nothing to download yet', { icon: 'info' });
      return;
    }
    downloadCollection(input, songs);
    haptics.success();
    toast.show(`Downloading ${input.name}`, { icon: 'download', detail: pluralize(songs.length, 'track') });
  } catch (error) {
    toast.error("Couldn't download", { detail: errorMessage(error) });
  }
}

export function stopCollectionDownload(input: CollectionInput): void {
  removeCollection(collectionKey(input.kind, input.id));
  haptics.success();
  toast.show('Removed download', { icon: 'check', detail: input.name });
}

/**
 * A square key: arrow to download, lit while it is downloading, a filled
 * check once all of it is here. Pressed while kept, it asks before letting
 * the download go — those files took a while to fetch.
 */
export const CollectionDownloadKey = memo(function CollectionDownloadKey({
  input,
  songs,
}: {
  input: CollectionInput | null;
  songs: Child[];
}) {
  const key = input ? collectionKey(input.kind, input.id) : null;
  const status = useCollectionDownload(key);
  const [confirm, setConfirm] = useState(false);

  const complete = status.pinned && status.total > 0 && status.done >= status.total;
  const word = input ? KIND_WORD[input.kind] : 'collection';

  return (
    <>
      <Keycap
        icon={!status.pinned ? IconDownload : complete ? IconCircleCheckFilled : IconCircleArrowDown}
        iconFilled={complete}
        square
        active={status.pinned}
        disabled={!input}
        accessibilityLabel={status.pinned ? `Remove downloaded ${word}` : `Download ${word}`}
        onPress={() => {
          if (!input) return;
          if (status.pinned) setConfirm(true);
          else startCollectionDownload(input, songs);
        }}
      />
      <Sheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Remove download?"
        subtitle={`${input?.name ?? 'This'} won't be kept on this device any more. Tracks downloaded another way stay.`}
      >
        <SheetRow
          label="Remove download"
          icon={IconTrash}
          tone="destructive"
          onPress={() => {
            setConfirm(false);
            if (input) stopCollectionDownload(input);
          }}
        />
        <SheetRow label="Keep it" last onPress={() => setConfirm(false)} />
      </Sheet>
    </>
  );
});

/** "On this device · 12 tracks", "Downloading · 4 of 12", "Waiting for a connection". */
export const CollectionDownloadStatus = memo(function CollectionDownloadStatus({
  input,
}: {
  input: CollectionInput | null;
}) {
  const color = useTheme();
  const key = input ? collectionKey(input.kind, input.id) : null;
  const { pinned, done, total, failed } = useCollectionDownload(key);
  const paused = useDownloadStore((state) => state.paused);
  const blocked = useDownloadStore((state) => state.blocked);

  if (!pinned) return null;

  const complete = done >= total;
  const settled = done + failed >= total;
  const count = `${done} of ${total}`;
  let text: string;
  let led = color.ledAmber;
  if (complete) {
    text = `On this device · ${pluralize(total, 'track')}`;
    led = color.ledGreen;
  } else if (settled) {
    text = `${failed} couldn't download · ${count}`;
    led = color.ledRed;
  } else if (paused) {
    text = `Downloads paused · ${count}`;
  } else if (blocked === 'offline') {
    text = `Waiting for a connection · ${count}`;
  } else if (blocked === 'homeOnly') {
    text = `Waiting for the home network · ${count}`;
  } else if (blocked === 'storage') {
    text = `Storage full · ${count}`;
    led = color.ledRed;
  } else {
    text = `Downloading · ${count}`;
  }

  // A steady light: downloads can run for an hour, and a light breathing
  // that long is an animation running that long — the text says it's busy.
  return (
    <View style={styles.status}>
      <Led color={led} />
      <Label tone="secondary">{text}</Label>
    </View>
  );
});

/**
 * The mark on a track row: a filled arrow once it's on the device, an
 * outline while it waits or arrives, a warning if it couldn't be fetched.
 */
export const TrackDownloadMark = memo(function TrackDownloadMark({ status }: { status: TrackDownloadStatus }) {
  const color = useTheme();
  if (!status) return null;
  if (status === 'done') return <IconCircleArrowDownFilled size={14} color={color.labelSecondary} />;
  if (status === 'failed') return <IconAlertTriangle size={14} color={color.labelTertiary} strokeWidth={2} />;
  return (
    <IconCircleArrowDown
      size={14}
      color={status === 'active' ? color.accent : color.labelTertiary}
      strokeWidth={2}
    />
  );
});

/** How far the file arriving now has got, as "45%". Empty for any other track. */
export function useActivePercent(id: string | undefined | null): string | null {
  return useDownloadProgress((p) => {
    if (!id || p.id !== id) return null;
    if (p.total <= 0) return '…';
    return `${Math.min(99, Math.floor((p.bytes / p.total) * 100))}%`;
  });
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[3] },
});
