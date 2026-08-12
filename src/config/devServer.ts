import type { ServerConfig } from '../api/config';

/**
 * PHASE 0 SCAFFOLDING — replaced in Phase 1.
 *
 * Reads the dev server config from EXPO_PUBLIC_ environment variables so that
 * nothing is hardcoded in committed source. These values are inlined into the
 * JS bundle at build time, so they are readable by anyone holding the APK.
 * That is fine for a development build on your own phone and is NOT how the
 * shipped app will work: Phase 1 adds a setup screen writing to
 * expo-secure-store, and this file goes away.
 *
 * Each variable is accessed as a full literal `process.env.EXPO_PUBLIC_...`
 * expression on purpose — Expo's Babel transform does a textual substitution,
 * so destructuring `process.env` would leave the values undefined on device.
 */
export function loadDevServerConfig(): ServerConfig | null {
  const localUrl = process.env.EXPO_PUBLIC_NAVIDROME_LOCAL_URL;
  const remoteUrl = process.env.EXPO_PUBLIC_NAVIDROME_REMOTE_URL;
  const username = process.env.EXPO_PUBLIC_NAVIDROME_USERNAME;
  const password = process.env.EXPO_PUBLIC_NAVIDROME_PASSWORD;

  if (!username || !password || (!localUrl && !remoteUrl)) return null;

  return { localUrl, remoteUrl, username, password };
}
