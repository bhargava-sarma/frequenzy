import { create } from 'zustand';

import { SubsonicClient } from '../api/client';
import type { ConnectionState } from '../api/client';
import { resolveCandidates, type ServerConfig } from '../api/config';
import { clearServerConfig, loadServerConfig, saveServerConfig } from '../storage/credentials';

/**
 * Owns the server config and the single SubsonicClient instance.
 *
 * One client for the whole app, deliberately: the client caches which base URL
 * is currently live, and a second instance would re-probe independently and
 * could settle on a different address than the first. Screens read the client
 * from here rather than constructing their own.
 */

export type ServerStatus = 'hydrating' | 'needsSetup' | 'ready';

interface ServerStore {
  status: ServerStatus;
  config: ServerConfig | null;
  client: SubsonicClient | null;
  /** Mirrors the client's active connection so UI can show local vs remote. */
  connection: ConnectionState | null;

  /** Reads persisted credentials. Call once at app start. */
  hydrate: () => Promise<void>;
  /** Persists a validated config and swaps in a client built from it. */
  saveConfig: (config: ServerConfig) => Promise<void>;
  /** Forgets credentials and returns to setup. */
  signOut: () => Promise<void>;
  /**
   * Drops the cached connection so the next request re-probes. Call on
   * resume-from-background — the device may have moved between home Wi-Fi and
   * cellular while the app wasn't running.
   */
  refreshConnection: () => void;
}

export const useServerStore = create<ServerStore>((set, get) => {
  const buildClient = (config: ServerConfig) =>
    new SubsonicClient({
      config,
      onConnectionChange: (connection) => set({ connection }),
      log: (message) => {
        if (__DEV__) console.log(`[subsonic] ${message}`);
      },
    });

  return {
    status: 'hydrating',
    config: null,
    client: null,
    connection: null,

    hydrate: async () => {
      const config = await loadServerConfig();

      if (!config) {
        set({ status: 'needsSetup', config: null, client: null, connection: null });
        return;
      }

      set({ status: 'ready', config, client: buildClient(config), connection: null });
    },

    saveConfig: async (config) => {
      await saveServerConfig(config);
      set({ status: 'ready', config, client: buildClient(config), connection: null });
    },

    signOut: async () => {
      await clearServerConfig();
      set({ status: 'needsSetup', config: null, client: null, connection: null });
    },

    refreshConnection: () => {
      get().client?.invalidateConnection();
      set({ connection: null });
    },
  };
});

/**
 * Verifies a config against the real server before it is persisted.
 *
 * Saving first and discovering the password is wrong later would strand the
 * user in a "ready" state that cannot load anything, so the setup screen gates
 * on this. Uses a throwaway client so a failed attempt leaves no trace in the
 * app's live connection state.
 *
 * Throws the underlying SubsonicError so the caller can distinguish "wrong
 * password" from "server unreachable" — the two need very different advice.
 */
export async function verifyServerConfig(config: ServerConfig): Promise<ConnectionState> {
  resolveCandidates(config); // throws ConfigError on malformed input

  const probe = new SubsonicClient({ config });
  await probe.ping();

  const connection = probe.getConnectionState();
  if (!connection) throw new Error('Connected, but no active connection was recorded');

  return connection;
}
