const { withMainApplication } = require('expo/config-plugins');

/**
 * Leaves a note when the app dies in native code, so the next launch can say
 * what happened.
 *
 * A JavaScript error is caught and logged by the app itself (src/data/
 * crashLog). A crash in Java or Kotlin — the player, Media3, the Cast SDK —
 * closes the process before any JavaScript runs, and on a phone with no
 * cable attached nothing of it survives. This adds two things to
 * MainApplication.onCreate:
 *
 * - An uncaught-exception handler that writes the stack trace to
 *   files/native-crash.txt and then hands the exception on, so the app still
 *   closes exactly as it would have. Nothing is swallowed.
 * - On Android 11+, a look at the system's record of how the last process
 *   ended. An ANR or a crash in native code never reaches the handler above;
 *   that record is written to files/native-exit.txt.
 *
 * The app reads both files on its next launch, moves them into the crash log
 * shown in Settings → Diagnostics, and deletes them (src/data/nativeCrash.ts).
 * Nothing leaves the device.
 */

const MARKER = '// frequenzy:crash-recorder';

const BLOCK = `
    ${MARKER}
    run {
      val crashFile = java.io.File(filesDir, "native-crash.txt")
      val previous = Thread.getDefaultUncaughtExceptionHandler()
      Thread.setDefaultUncaughtExceptionHandler { thread, error ->
        try {
          val trace = java.io.StringWriter()
          error.printStackTrace(java.io.PrintWriter(trace))
          crashFile.writeText(System.currentTimeMillis().toString() + "\\n" + thread.name + "\\n" + trace.toString())
        } catch (_: Throwable) {
        }
        if (previous != null) {
          previous.uncaughtException(thread, error)
        } else {
          android.os.Process.killProcess(android.os.Process.myPid())
          System.exit(10)
        }
      }
      if (android.os.Build.VERSION.SDK_INT >= 30) {
        val appContext = this
        Thread {
          try {
            val seenFile = java.io.File(appContext.filesDir, "native-exit-seen.txt")
            val seen = if (seenFile.exists()) seenFile.readText().trim().toLongOrNull() ?: 0L else 0L
            val manager = appContext.getSystemService(android.app.ActivityManager::class.java)
            val exit = manager?.getHistoricalProcessExitReasons(appContext.packageName, 0, 1)?.firstOrNull()
            if (exit != null && exit.timestamp > seen) {
              seenFile.writeText(exit.timestamp.toString())
              val label = when (exit.reason) {
                android.app.ApplicationExitInfo.REASON_ANR -> "ANR"
                android.app.ApplicationExitInfo.REASON_CRASH_NATIVE -> "Native crash"
                android.app.ApplicationExitInfo.REASON_CRASH -> "Crash"
                else -> null
              }
              if (label != null) {
                // ANR traces are text; a native crash's is a binary tombstone.
                var trace = ""
                if (exit.reason == android.app.ApplicationExitInfo.REASON_ANR) {
                  try {
                    exit.traceInputStream?.use { input ->
                      val out = java.io.ByteArrayOutputStream()
                      val buffer = ByteArray(8192)
                      while (out.size() < 48000) {
                        val read = input.read(buffer)
                        if (read <= 0) break
                        out.write(buffer, 0, read)
                      }
                      trace = out.toString("UTF-8")
                    }
                  } catch (_: Throwable) {
                  }
                }
                java.io.File(appContext.filesDir, "native-exit.txt").writeText(
                  exit.timestamp.toString() + "\\n" + label + "\\n" + (exit.description ?: "") + "\\n" + trace
                )
              }
            }
          } catch (_: Throwable) {
          }
        }.start()
      }
    }
`;

module.exports = function withCrashRecorder(config) {
  return withMainApplication(config, (config) => {
    const { modResults } = config;
    if (modResults.language !== 'kt') {
      throw new Error('withCrashRecorder: expected a Kotlin MainApplication.');
    }
    if (modResults.contents.includes(MARKER)) return config;

    const onCreate = /override fun onCreate\(\)\s*\{\s*\n(\s*)super\.onCreate\(\)\s*\n/;
    const match = modResults.contents.match(onCreate);
    if (!match) {
      throw new Error('withCrashRecorder: could not find super.onCreate() in MainApplication.onCreate.');
    }
    const insertAt = match.index + match[0].length;
    modResults.contents =
      modResults.contents.slice(0, insertAt) + BLOCK.replace(/^\n/, '') + modResults.contents.slice(insertAt);
    return config;
  });
};
