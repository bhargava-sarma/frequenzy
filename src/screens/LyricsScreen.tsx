import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TrackPlayer, { useActiveMediaItem, useProgress } from '@rntp/player';

import { AmbientBackground } from '../components/AmbientBackground';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState } from '../components/ScreenState';
import { activeLineIndex } from '../api/lrclib';
import { useLyrics } from '../hooks/useLyrics';
import { usePlayerUiStore } from '../store/usePlayerUiStore';
import { layout, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

/**
 * Lyrics, following the track.
 *
 * Timed lines come from LRCLIB. The active line is the only thing on screen
 * in the accent colour, which is the one-accent-for-meaning rule doing real
 * work: it marks where you are, and nothing else on the panel competes.
 *
 * Lines are tappable and seek. A lyric sheet already answers "where am I",
 * and once it does, "take me back to that bit" is the obvious next thing to
 * want — this is the same reasoning that makes the progress bar draggable.
 */

/** Progress tick. Finer than the player's 1s, or lines land visibly late. */
const TICK_SECONDS = 0.25;

/**
 * How long auto-scroll stands down after you scroll by hand.
 *
 * Without this, reading ahead is impossible: the next tick drags the view
 * straight back to the current line and the gesture feels broken.
 */
const MANUAL_SCROLL_GRACE_MS = 5000;

export function LyricsScreen() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const closeLyrics = usePlayerUiStore((state) => state.closeLyrics);

  const activeItem = useActiveMediaItem();
  const { position } = useProgress(TICK_SECONDS);
  const { status, lyrics, retry } = useLyrics(activeItem);

  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<number, number>>({});
  const viewportHeight = useRef(0);
  const manualUntil = useRef(0);

  const lines = lyrics?.lines ?? [];
  const synced = Boolean(lyrics?.synced);
  const index = useMemo(
    () => (synced ? activeLineIndex(lines, position) : -1),
    [synced, lines, position],
  );

  // Reset the recorded geometry when the words change, or the next track's
  // scroll would be aimed using the previous track's line positions.
  useEffect(() => {
    offsets.current = {};
    manualUntil.current = 0;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [lyrics]);

  useEffect(() => {
    if (index < 0 || !synced) return;
    if (Date.now() < manualUntil.current) return;

    const y = offsets.current[index];
    if (y == null || viewportHeight.current === 0) return;

    // Centred rather than pinned to the top: the lines after the current one
    // are the ones you are about to sing, and they need to be on screen.
    scrollRef.current?.scrollTo({
      y: Math.max(0, y - viewportHeight.current / 2),
      animated: true,
    });
  }, [index, synced]);

  const onLineLayout = useCallback((i: number, y: number) => {
    offsets.current[i] = y;
  }, []);

  const body = () => {
    if (status === 'loading' || status === 'idle') {
      return <EmptyState label="Looking for lyrics" />;
    }

    if (status === 'error') {
      return (
        <View style={styles.state}>
          <EmptyState
            label="Couldn't reach LRCLIB"
            hint="Lyrics come from a community database, separate from your server."
          />
          <View style={styles.retry}>
            <Button label="Try again" onPress={retry} />
          </View>
        </View>
      );
    }

    if (lyrics?.instrumental) {
      return <EmptyState label="Instrumental" hint="This recording has no words." />;
    }

    if (status === 'none' || (!lyrics?.plain && lines.length === 0)) {
      return (
        <View style={styles.state}>
          <EmptyState
            label="No lyrics found"
            hint="LRCLIB doesn't have this track. Tags that differ from the release can be the cause."
          />
          <View style={styles.retry}>
            <Button label="Look again" onPress={retry} />
          </View>
        </View>
      );
    }

    // Unsynced: a plain sheet, with no pretence of following along.
    if (!synced) {
      return (
        <View style={styles.plainBlock}>
          <Text style={styles.unsyncedNote}>Not time-synced</Text>
          <Text style={styles.plain} selectable>
            {lyrics?.plain}
          </Text>
        </View>
      );
    }

    return (
      <>
        {lines.map((line, i) => {
          // Blank LRC lines are the instrumental gaps. They keep their slot so
          // the previous line doesn't sit lit through the whole break, but
          // there is nothing to read and nothing to press.
          if (!line.text) {
            return (
              <View
                key={i}
                style={styles.gap}
                onLayout={(e) => onLineLayout(i, e.nativeEvent.layout.y)}
              />
            );
          }

          const isActive = i === index;
          return (
            <Pressable
              key={i}
              onPress={() => TrackPlayer.seekTo(line.time)}
              onLayout={(e) => onLineLayout(i, e.nativeEvent.layout.y)}
              accessibilityRole="button"
              accessibilityLabel={`Play from "${line.text}"`}
              style={styles.linePress}
            >
              <Text
                style={[
                  styles.line,
                  { color: isActive ? color.accent : color.textSecondary },
                  isActive && styles.lineActive,
                ]}
              >
                {line.text}
              </Text>
            </Pressable>
          );
        })}
      </>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AmbientBackground />

      <ScreenHeader
        title="Lyrics"
        onBack={closeLyrics}
        action={
          synced ? <Text style={styles.source}>LRCLIB</Text> : undefined
        }
      />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        onLayout={(e) => {
          viewportHeight.current = e.nativeEvent.layout.height;
        }}
        onScrollBeginDrag={() => {
          manualUntil.current = Date.now() + MANUAL_SCROLL_GRACE_MS;
        }}
        scrollEventThrottle={16}
      >
        {body()}
      </ScrollView>
    </View>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.paper },
    content: {
      paddingHorizontal: layout.screenPadding,
      // Half a screen of slack at each end so the first and last lines can
      // still reach the middle when centred.
      paddingTop: space[6],
      paddingBottom: space[6] * 6,
      flexGrow: 1,
    },

    linePress: { paddingVertical: space[2] },
    line: { ...type.title, fontSize: 19, lineHeight: 28 },
    lineActive: { ...type.display, fontSize: 21, lineHeight: 30 },
    gap: { height: space[5] },

    plainBlock: { paddingTop: space[2] },
    plain: { ...type.body, fontSize: 16, lineHeight: 26, color: color.textPrimary },
    unsyncedNote: {
      ...type.label,
      color: color.textSecondary,
      marginBottom: space[4],
    },

    source: { ...type.label, color: color.textSecondary },
    state: { flexGrow: 1, justifyContent: 'center' },
    retry: { alignItems: 'center', marginTop: space[4] },
  });
