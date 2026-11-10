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
  /**
   * Mirrors the client's active connection so UI can show local vs remote.
   * Held through a re-probe: it only goes null once a probe has finished
   * with nothing answering, so a resume from background doesn't read as
   * going offline for the length of a ping.
   */
  connection: ConnectionState | null;
  /** A probe is in flight. With no connection, this is "linking", not "offline". */
  connecting: boolean;
  /**
   * The address cover art is requested from: the live one, else the last
   * that answered. Artwork is cached under a key that ignores the address,
   * so covers stay on screen while the connection is being re-proven.
   */
  artworkBase: string | null;
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
    const client: SubsonicClient = new SubsonicClient({
      config,
      onConnectionChange: (connection, cause) => {
        // A client that has been replaced (sign-out, new credentials) must
        // not write its last gasp over the session that replaced it.
        if (get().client !== client) return;
        if (connection) {
          set({ connection, connecting: false, artworkBase: connection.url });
        } else if (cause === 'invalidated') {
          // A re-probe follows; keep showing the last address until it lands.
          set({ connecting: true });
        } else {
          set({ connection: null, connecting: false });
        }
      },
      log: (message) => {
        if (__DEV__) console.log(`[subsonic] ${message}`);
      },
    });

    const library = new LibraryRepository({ client, cache: createAsyncStorageCache() });
    return { client, library, artworkBase: client.getArtworkBaseUrl() };
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
      })
      .finally(() => {
        if (get().client === client) set({ connecting: false });
      });
  };

  const signedOut = {
    status: 'needsSetup' as const,
    config: null,
    client: null,
    library: null,
    connection: null,
    connecting: false,
    artworkBase: null,
    info: null,
  };

  return {
    status: 'hydrating',
    config: null,
    client: null,
    library: null,
    connection: null,
    connecting: false,
    artworkBase: null,
    info: null,
    onSignOut: null,
    setOnSignOut: (handler) => set({ onSignOut: handler }),

    hydrate: async () => {
      let config: ServerConfig | null = null;
      try {
        config = await loadServerConfig();
      } catch {
        // The keystore can refuse to decrypt — after a device restore, say —
        // and an app that waits forever on it is a blank screen with no way
        // out. Unreadable credentials are the same as none: ask again.
        void clearServerConfig().catch(() => {});
      }

      if (!config) {
        set(signedOut);
        return;
      }

      try {
        const session = buildSession(config);
        set({ status: 'ready', config, ...session, connection: null, connecting: true, info: null });
        greet(session.client);
      } catch {
        set(signedOut);
      }
    },

    saveConfig: async (config, verified) => {
      await saveServerConfig(config);

      const session = buildSession(config);
      // Stored before adopting, so the adoption's own change notice is for
      // the client the store already holds rather than one it would ignore.
      set({ status: 'ready', config, ...session, connection: null, connecting: !verified, info: null });
      if (verified) session.client.adoptConnection(verified);
      greet(session.client);
    },

    signOut: async () => {
      // Drop cached library data and the queue too. They belong to the
      // account being signed out of, and leaving them behind would show a
      // stale library — or queue unplayable tracks — for whoever is next.
      // Each step is best-effort: a failed cleanup must never leave someone
      // unable to sign out.
      try {
        await get().onSignOut?.();
      } catch {
        // Account state is cleared as far as it could be.
      }
      try {
        await get().library?.clear();
      } catch {
        // A cache that would not clear is orphaned by the next account's keys.
      }
      try {
        await clearServerConfig();
      } catch {
        // Falls through to the setup screen either way.
      }

      set(signedOut);
    },

    refreshConnection: () => {
      const client = get().client;
      if (!client) return;

      // Invalidated, so requests made in the meantime wait for the probe
      // rather than going to an address the phone may have walked away from.
      // The store keeps showing the last connection until the probe settles
      // (see onConnectionChange): a resume shouldn't flash "offline".
      set({ connecting: true });
      client.invalidateConnection();

      // Re-probe immediately rather than waiting for the next request. The
      // probe is cheap (~135ms at home) and self-corrects if the network moved.
      void client
        .ensureConnection(true)
        .catch(() => {
          // Genuinely unreachable: the null connection state already says so.
        })
        .finally(() => {
          if (get().client === client) set({ connecting: false });
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
