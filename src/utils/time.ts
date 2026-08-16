/**
 * Duration formatting for transport readouts.
 *
 * Always pair the output with the `numeral` type token, which carries
 * tabular figures — proportional digits make a running timer jitter
 * horizontally as the numbers change, which reads as sloppy on a panel.
 */

/** Seconds to `M:SS`, or `H:MM:SS` past an hour. */
export function formatDuration(totalSeconds: number | undefined | null): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '0:00';
  }

  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);

  const pad = (value: number) => String(value).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** "12 tracks" / "1 track" — used in section header counts. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
