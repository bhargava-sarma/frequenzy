import { documentFile } from '../offline/nativeFs';
import { recordCrash } from './crashLog';

/**
 * Brings crashes from native code into the crash log.
 *
 * When the app dies in Java or Kotlin — the player, Media3, the Cast SDK —
 * no JavaScript runs to write anything down. The native side leaves a note
 * instead (plugins/withCrashRecorder.js): the stack trace of an uncaught
 * exception, and on Android 11+ the system's record of an ANR or a native
 * crash. Read once at launch, moved into the log that Settings → Diagnostics
 * shows and shares, and deleted.
 *
 * Builds made before the recorder existed simply have no files to read.
 */

const UNCAUGHT = 'native-crash.txt';
const EXIT = 'native-exit.txt';

function take(name: string): string | null {
  try {
    const file = documentFile(name);
    if (!file || !file.exists) return null;
    const text = file.textSync();
    file.delete();
    return text;
  } catch {
    return null;
  }
}

function firstLine(text: string): string {
  return text.split('\n').find((line) => line.trim().length > 0)?.trim() ?? '';
}

/** Moves any native crash notes into the crash log. Safe to call on every launch. */
export async function importNativeCrashes(): Promise<void> {
  // Format: time, thread, then the Java stack trace.
  const uncaught = take(UNCAUGHT);
  if (uncaught) {
    const [time, thread, ...trace] = uncaught.split('\n');
    const stack = trace.join('\n');
    await recordCrash({
      at: Number(time) || Date.now(),
      scope: `android (${thread || 'unknown thread'})`,
      message: firstLine(stack) || 'Native crash',
      stack,
      fatal: true,
    });
  }

  // Format: time, kind (ANR / Native crash / Crash), system description, trace.
  const exit = take(EXIT);
  if (exit) {
    const [time, kind, description, ...trace] = exit.split('\n');
    const at = Number(time) || Date.now();
    // A Java crash is already in the log from the note above, with its stack.
    if (kind === 'Crash' && uncaught) return;
    await recordCrash({
      at,
      scope: 'android (system)',
      message: [kind || 'Abnormal exit', description].filter(Boolean).join(': '),
      stack: trace.join('\n') || undefined,
      fatal: true,
    });
  }
}
