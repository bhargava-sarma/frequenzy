import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useTheme } from '../theme/ThemeProvider';

/**
 * Pull-to-refresh that shows for as long as the refresh it started runs.
 *
 * Two ways this goes wrong otherwise. Fed a constant `false`, the spinner
 * snaps shut the moment the finger lifts, and a refresh that takes a second
 * looks like one that didn't happen. Fed a screen's `loading` flag directly,
 * it appears for loads nobody pulled for — a playlist list reloading because
 * a track was liked somewhere else. So the spinner is tied to the pull: it
 * starts with the gesture and ends when the work that gesture began has
 * been seen to start and then finish.
 *
 * Also carries the colours, so the platform's spinner is drawn in the
 * accent on the theme's raised surface rather than in its own defaults.
 */
export function usePullRefresh(busy: boolean, refresh: () => void) {
  const color = useTheme();
  const [pulled, setPulled] = useState(false);
  const sawBusy = useRef(false);

  useEffect(() => {
    if (!pulled) {
      sawBusy.current = false;
      return;
    }
    if (busy) {
      sawBusy.current = true;
      return;
    }
    if (sawBusy.current) setPulled(false);
  }, [pulled, busy]);

  // A refresh that never reports busy — nothing to reload — must still let go.
  useEffect(() => {
    if (!pulled) return;
    const timer = setTimeout(() => setPulled(false), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [pulled]);

  const onRefresh = useCallback(() => {
    setPulled(true);
    refresh();
  }, [refresh]);

  return useMemo(
    () => ({
      refreshing: pulled,
      onRefresh,
      colors: [color.accent],
      tintColor: color.accent,
      progressBackgroundColor: color.surfaceRaised,
    }),
    [pulled, onRefresh, color.accent, color.surfaceRaised],
  );
}

/** Longer than any request is allowed to take, so it only ever catches a refresh with nothing to do. */
const GIVE_UP_MS = 20_000;
