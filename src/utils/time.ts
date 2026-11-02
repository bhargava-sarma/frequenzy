/**
 * Formatting for readouts. Pair figures with a mono style so running timers
 * hold their column — proportional digits make a timer jitter sideways.
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

/** A running time in words: "48 min", "2 hr 05 min". */
export function formatLength(totalSeconds: number | undefined | null): string {
  if (!totalSeconds || totalSeconds < 0 || !Number.isFinite(totalSeconds)) return '0 min';
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ${String(minutes % 60).padStart(2, '0')} min`;
}

/** Listening time as one short figure and a unit: ["4.2", "HRS"]. */
export function formatListening(totalSeconds: number): [string, string] {
  if (totalSeconds < 3600) return [String(Math.round(totalSeconds / 60)), 'MIN'];
  const hours = totalSeconds / 3600;
  return [hours < 100 ? hours.toFixed(1) : String(Math.round(hours)), 'HRS'];
}

/** "12 tracks" / "1 track". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Bytes as "48.2 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${value >= 100 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

/** "just now", "5 min ago", "yesterday", "3 days ago", "12 Mar 2024". */
export function formatRelative(when: string | number | Date, now = Date.now()): string {
  const time = new Date(when).getTime();
  if (!Number.isFinite(time)) return '';
  const diff = Math.max(0, now - time);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} hr ago`;
  if (diff < 2 * day) return 'yesterday';
  if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`;
  return formatDate(time);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "12 Mar 2024". Locale-independent on purpose: it is set in mono caps. */
export function formatDate(time: number | Date): string {
  const d = new Date(time);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "14:32". */
export function formatClock(time: number | Date): string {
  const d = new Date(time);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "MON 02 NOV" — the eyebrow line on Home. */
export function formatEyebrowDate(time: number | Date = Date.now()): string {
  const d = new Date(time);
  return `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`.toUpperCase();
}

/** "TODAY", "YESTERDAY", "MON 31 OCT" — history group headings. */
export function formatDayHeading(time: number, now = Date.now()): string {
  const day = new Date(time);
  day.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return formatEyebrowDate(time);
}

/** Good morning / afternoon / evening, and a night owl's greeting. */
export function greeting(time: number | Date = Date.now()): string {
  const hour = new Date(time).getHours();
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
