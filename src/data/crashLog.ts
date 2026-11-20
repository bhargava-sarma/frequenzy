import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The last few things that went wrong, kept on the device.
 *
 * A crash on a phone leaves nothing behind for anyone to read: the screen
 * goes, and with it the only clue. So every error that reaches a boundary or
 * the global handler is written down here, with where it happened and when,
 * and Settings shows the latest — with a key to share it — so the next
 * report can say exactly what broke instead of "it crashed".
 *
 * Nothing leaves the device unless that key is pressed.
 */

const STORAGE_KEY = 'crashLog.v1';
const MAX_ENTRIES = 12;
/** Stacks are long and mostly repetition past the first frames. */
const MAX_STACK = 4000;

export interface CrashEntry {
  /** Epoch ms. */
  at: number;
  /** Which surface caught it: a screen name, "player", "global". */
  scope: string;
  message: string;
  stack?: string;
  componentStack?: string;
  /** Reported by the runtime as fatal — before this log, the app would have closed. */
  fatal: boolean;
}

const listeners = new Set<() => void>();

export function onCrashLogChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function getCrashLog(): Promise<CrashEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CrashEntry[]) : [];
  } catch {
    return [];
  }
}

/** Serialises writes, so two errors in the same tick don't overwrite each other. */
let writing: Promise<void> = Promise.resolve();

export function recordCrash(entry: Omit<CrashEntry, 'at'> & { at?: number }): Promise<void> {
  const full: CrashEntry = {
    at: entry.at ?? Date.now(),
    scope: entry.scope,
    message: String(entry.message || 'Unknown error').slice(0, 500),
    stack: entry.stack?.slice(0, MAX_STACK),
    componentStack: entry.componentStack?.slice(0, MAX_STACK),
    fatal: entry.fatal,
  };
  writing = writing.then(async () => {
    try {
      const existing = await getCrashLog();
      // The same error repeating — a render loop, a timer — is one entry with
      // the latest time, not a log filled with copies of itself.
      const rest = existing.filter((e) => !(e.message === full.message && e.scope === full.scope));
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([full, ...rest].slice(0, MAX_ENTRIES)));
      for (const listener of listeners) listener();
    } catch {
      // A log that cannot be written is no reason to fail again.
    }
  });
  return writing;
}

export async function clearCrashLog(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } finally {
    for (const listener of listeners) listener();
  }
}

/** A plain-text report, for sharing. */
export function formatCrash(entry: CrashEntry): string {
  return [
    `Frequenzy error — ${new Date(entry.at).toISOString()}`,
    `Where: ${entry.scope}${entry.fatal ? ' (fatal)' : ''}`,
    `Message: ${entry.message}`,
    entry.stack ? `\nStack:\n${entry.stack}` : '',
    entry.componentStack ? `\nComponents:\n${entry.componentStack}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack };
  return { message: String(error) };
}

export { describe as describeError };

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;

let installed = false;

/**
 * Catches what no boundary can: errors thrown in timers, event handlers and
 * promise callbacks outside React's render.
 *
 * In a release build React Native treats any of these as fatal and closes
 * the app — for a music player, that stops nothing (playback is native) but
 * throws away the screen you were on for what is usually one failed tap. So
 * in release the error is written down, `onError` is told, and the app stays
 * up. Development keeps the default red screen, which is more useful there.
 */
export function installGlobalErrorHandler(onError: (entry: CrashEntry) => void): void {
  if (installed) return;
  const utils = (globalThis as { ErrorUtils?: { getGlobalHandler(): GlobalHandler; setGlobalHandler(h: GlobalHandler): void } })
    .ErrorUtils;
  if (!utils) return;
  installed = true;

  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    const { message, stack } = describe(error);
    const entry: CrashEntry = { at: Date.now(), scope: 'global', message, stack, fatal: Boolean(isFatal) };
    void recordCrash(entry);
    try {
      onError(entry);
    } catch {
      // Reporting must not become the next error.
    }
    if (__DEV__) previous(error, isFatal);
  });
}
