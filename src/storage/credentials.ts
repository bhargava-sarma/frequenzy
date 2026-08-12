import * as SecureStore from 'expo-secure-store';

import type { ServerConfig } from '../api/config';

/**
 * Credential persistence, backed by the platform keystore.
 *
 * The whole ServerConfig lives under one key rather than being split between
 * SecureStore and AsyncStorage. The password is the only true secret, but
 * splitting the record invites the two halves drifting apart — a saved
 * password pointing at a URL that was changed elsewhere. One record, one
 * write, no partial states. It is comfortably inside SecureStore's ~2KB
 * per-value budget.
 *
 * On Android this is backed by SharedPreferences encrypted with a key held in
 * the Android Keystore, so the value is not readable from a backup or by
 * another app.
 */

const CONFIG_KEY = 'navidrome.serverConfig';

/** Narrows untrusted JSON from storage back to a ServerConfig. */
function parseConfig(raw: string): ServerConfig | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const candidate = parsed as Partial<ServerConfig>;

  const hasCredentials =
    typeof candidate.username === 'string' &&
    candidate.username.length > 0 &&
    typeof candidate.password === 'string' &&
    candidate.password.length > 0;

  const hasAddress =
    typeof candidate.localUrl === 'string' || typeof candidate.remoteUrl === 'string';

  if (!hasCredentials || !hasAddress) return null;

  return {
    nickname: candidate.nickname,
    localUrl: candidate.localUrl,
    remoteUrl: candidate.remoteUrl,
    username: candidate.username as string,
    password: candidate.password as string,
  };
}

/** Returns the stored config, or null on first launch or if it's unusable. */
export async function loadServerConfig(): Promise<ServerConfig | null> {
  const raw = await SecureStore.getItemAsync(CONFIG_KEY);
  if (!raw) return null;

  const config = parseConfig(raw);
  if (!config) {
    // Corrupt or half-written record: drop it so the user gets a clean setup
    // screen rather than an app wedged against unparseable state.
    await SecureStore.deleteItemAsync(CONFIG_KEY);
    return null;
  }

  return config;
}

export async function saveServerConfig(config: ServerConfig): Promise<void> {
  await SecureStore.setItemAsync(CONFIG_KEY, JSON.stringify(config));
}

export async function clearServerConfig(): Promise<void> {
  await SecureStore.deleteItemAsync(CONFIG_KEY);
}
