import { create } from 'zustand';

import { SubsonicClient } from '../api/client';
import type { ConnectionState } from '../api/client';
import { resolveCandidates, type ServerConfig } from '../api/config';
import { LibraryRepository } from '../data/libraryRepository';
import { createAsyncStorageCache } from '../storage/asyncStorageCache';
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

/** What the server said about itself on the first successful ping. */
export interface ServerInfo {
  type?: string;
  version?: string;
  apiVersion?: string;
  openSubsonic: boolean;
}

interface ServerStore {
  status: ServerStatus;
  config: ServerConfig | null;
  client: SubsonicClient | null;
  /** Cached library reads. Screens use this rather than the raw client. */
  library: LibraryRepository | null;
  /** Mirrors the client's active connection so UI can show local vs remote. */
  connection: ConnectionState | null;
  info: ServerInfo | null;
  /**
   * Runs when the session is torn down on sign-out, so modules holding
   * account-scoped state (the queue, its saved copy) can drop it.
   */
  onSignOut: (() => Promise<void> | void) | null;
  setOnSignOut: (handler: (() => Promise<void> | void) | null) => void;

  /** Reads persisted credentials. Call once at app start. */
  hydrate: () => Promise<void>;
  /**
   * Persists a validated config and swaps in a client built from it.
   * Pass the connection returned by verifyServerConfig so the new client
   * inherits it instead of re-probing what we just proved.
   */
  saveConfig: (config: ServerConfig, verified?: ConnectionState) => Promise<void>;
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
  /** Builds the client and its cached read layer as one unit. */
  const buildSession = (config: ServerConfig) => {
    const client = new SubsonicClient({
      config,
      onConnectionChange: (connection) => set({ connection }),
      log: (message) => {
        if (__DEV__) console.log(`[subsonic] ${message}`);
      },
    });

    const library = new LibraryRepository({ client, cache: createAsyncStorageCache() });
    return { client, library };
  };

  /**
   * Warms the connection and learns the server's name and version.
   *
   * Fired in the background as soon as a session exists, so the first
   * screen's cover art has a base URL to resolve against by the time it
   * draws, rather than waiting for the first library read to probe.
   */
  const greet = (client: SubsonicClient) => {
    void client
      .ping()
      .then((pong) => {
        if (get().client !== client) return;
        set({
          info: {
            type: pong.type,
            version: pong.serverVersion,
            apiVersion: pong.version,
            openSubsonic: Boolean(pong.openSubsonic),
          },
        });
      })
      .catch(() => {
        // Unreachable right now; the connection indicator already says so.
      });
  };

  return {
    status: 'hydrating',
    config: null,
    client: null,
    library: null,
    connection: null,
    info: null,
    onSignOut: null,
    setOnSignOut: (handler) => set({ onSignOut: handler }),

    hydrate: async () => {
      const config = await loadServerConfig();

      if (!config) {
        set({
          status: 'needsSetup',
          config: null,
          client: null,
          library: null,
          connection: null,
          info: null,
        });
        return;
      }

      const session = buildSession(config);
      set({ status: 'ready', config, ...session, connection: null, info: null });
      greet(session.client);
    },

    saveConfig: async (config, verified) => {
      await saveServerConfig(config);

      const session = buildSession(config);
      if (verified) session.client.adoptConnection(verified);

      set({ status: 'ready', config, ...session, connection: verified ?? null, info: null });
      greet(session.client);
    },

    signOut: async () => {
      // Drop cached library data and the queue too. They belong to the
      // account being signed out of, and leaving them behind would show a
      // stale library — or queue unplayable tracks — for whoever is next.
      try {
        await get().onSignOut?.();
      } catch {
        // Clearing account state is best-effort; signing out must not fail.
      }
      await get().library?.clear();
      await clearServerConfig();

      set({
        status: 'needsSetup',
        config: null,
        client: null,
        library: null,
        connection: null,
        info: null,
      });
    },

    refreshConnection: () => {
      const client = get().client;
      if (!client) return;

      client.invalidateConnection();
      set({ connection: null });

      // Re-probe immediately rather than waiting for the next request. Without
      // this the indicator sits at "not connected" for as long as the app is
      // idle after a resume — reporting a problem that doesn't exist. The
      // probe is cheap (~135ms at home) and self-corrects if the network moved.
      void client.ensureConnection(true).catch(() => {
        // Genuinely unreachable: the null connection state already says so.
      });
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
