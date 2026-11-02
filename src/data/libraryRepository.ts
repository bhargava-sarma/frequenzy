import type { SubsonicClient } from '../api/client';
import type {
  AlbumSummary,
  ArtistInfo2,
  ArtistSummary,
  Child,
  Genre,
} from '../types/subsonic';
import { cacheKeys, type CacheStore } from './cache';

/**
 * Read-through cache over the Subsonic client.
 *
 * Screens talk to this rather than to the client directly, so navigating back
 * into an artist or album doesn't re-hit the server. Library metadata changes
 * only when you add music, so it tolerates a long TTL well.
 *
 * Serving policy is stale-while-revalidate: a stale entry is returned
 * immediately and refreshed in the background, so browsing stays instant and
 * the next visit sees fresh data. That trade suits a personal library, where
 * metadata being a few hours out of date is unnoticeable but a spinner on
 * every navigation is not.
 */

/** Library metadata is near-static; a day is generous and still self-healing. */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface ArtistDetail {
  artist: ArtistSummary;
  albums: AlbumSummary[];
}

export interface AlbumDetail {
  album: AlbumSummary;
  songs: Child[];
}

export interface LibraryRepositoryOptions {
  client: SubsonicClient;
  cache: CacheStore;
  ttlMs?: number;
}

export interface ReadOptions {
  /** Skip the cache entirely — for pull-to-refresh. */
  forceRefresh?: boolean;
  /**
   * Overrides the repository default for this read. Lists that reorder as you
   * listen go stale in minutes, not in a day.
   */
  ttlMs?: number;
}

/**
 * Server-side album orderings, per the Subsonic `getAlbumList2` spec.
 *
 * `recent` and `frequent` are derived from play history, so they stay empty
 * until something scrobbles — see src/player/scrobbler.ts.
 */
export type AlbumListType =
  | 'newest'
  | 'recent'
  | 'frequent'
  | 'random'
  | 'starred'
  | 'alphabeticalByName';

export class LibraryRepository {
  private readonly client: SubsonicClient;
  private readonly cache: CacheStore;
  private readonly ttlMs: number;

  /**
   * Deduplicates concurrent work per key. Without this, mounting three
   * components that each want the artist list produces three identical
   * requests on a cold cache.
   */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(options: LibraryRepositoryOptions) {
    this.client = options.client;
    this.cache = options.cache;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  }

  // -------------------------------------------------------------------------
  // Public reads
  // -------------------------------------------------------------------------

  async getArtists(options: ReadOptions = {}): Promise<ArtistSummary[]> {
    return this.readThrough(
      cacheKeys.artists(),
      async () => {
        const response = await this.client.getArtists();
        return (response.artists.index ?? []).flatMap((index) => index.artist);
      },
      options,
    );
  }

  async getArtist(id: string, options: ReadOptions = {}): Promise<ArtistDetail> {
    return this.readThrough(
      cacheKeys.artist(id),
      async () => {
        const response = await this.client.getArtist(id);
        const { album, ...artist } = response.artist;
        return { artist, albums: album ?? [] };
      },
      options,
    );
  }

  async getAlbum(id: string, options: ReadOptions = {}): Promise<AlbumDetail> {
    return this.readThrough(
      cacheKeys.album(id),
      async () => {
        const response = await this.client.getAlbum(id);
        const { song, ...album } = response.album;
        return { album, songs: song ?? [] };
      },
      options,
    );
  }

  /** Every album, paged out of the server's 500-per-request limit. */
  async getAllAlbums(options: ReadOptions = {}): Promise<AlbumSummary[]> {
    return this.readThrough(
      cacheKeys.albumList(),
      async () => {
        const pageSize = 500;
        const albums: AlbumSummary[] = [];

        for (let offset = 0; ; offset += pageSize) {
          const page = await this.client.getAlbumList2({ size: pageSize, offset });
          const batch = page.albumList2.album ?? [];
          albums.push(...batch);
          if (batch.length < pageSize) break;
        }

        return albums;
      },
      options,
    );
  }

  /**
   * One shelf's worth of albums in a server-side ordering.
   *
   * The ordering is done by Navidrome rather than by sorting `getAllAlbums`
   * locally, because play counts and last-played timestamps aren't in the
   * album summaries at all — only the server knows them.
   */
  async getAlbumsByType(
    type: AlbumListType,
    size = 20,
    options: ReadOptions = {},
  ): Promise<AlbumSummary[]> {
    return this.readThrough(
      cacheKeys.albumsByType(type, size),
      async () => {
        const response = await this.client.getAlbumList2({ type, size });
        return response.albumList2.album ?? [];
      },
      options,
    );
  }

  /** Every genre with its counts, most songs first. */
  async getGenres(options: ReadOptions = {}): Promise<Genre[]> {
    return this.readThrough(
      cacheKeys.genres(),
      async () => {
        const response = await this.client.getGenres();
        return (response.genres.genre ?? [])
          .filter((genre) => genre.value?.trim())
          .sort((a, b) => (b.songCount ?? 0) - (a.songCount ?? 0));
      },
      options,
    );
  }

  /** Up to 500 albums in a genre, alphabetically. */
  async getAlbumsByGenre(genre: string, options: ReadOptions = {}): Promise<AlbumSummary[]> {
    return this.readThrough(
      cacheKeys.albumsByGenre(genre),
      async () => {
        const response = await this.client.getAlbumList2({ type: 'byGenre', genre, size: 500 });
        return response.albumList2.album ?? [];
      },
      options,
    );
  }

  /**
   * Biography, images and similar artists.
   *
   * Comes from Navidrome's external agents (Last.fm, Spotify) and changes
   * about never, so a week's TTL; and an artist the agents know nothing
   * about answers with an empty object, which is cached like anything else.
   */
  async getArtistInfo(id: string, options: ReadOptions = {}): Promise<ArtistInfo2> {
    return this.readThrough(
      cacheKeys.artistInfo(id),
      async () => {
        const response = await this.client.getArtistInfo2(id);
        return response.artistInfo2 ?? {};
      },
      { ttlMs: 7 * 24 * 60 * 60 * 1000, ...options },
    );
  }

  /**
   * Drops a single album's cached entry.
   *
   * Call after starring a track: the cached copy still carries the old
   * `starred` value, and showing a heart that springs back on next navigation
   * is worse than refetching.
   */
  async invalidateAlbum(id: string): Promise<void> {
    await this.cache.remove(cacheKeys.album(id));
  }

  /** Wipes all cached library data. Used on sign-out. */
  async clear(): Promise<void> {
    this.inFlight.clear();
    await this.cache.clear();
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async readThrough<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: ReadOptions,
  ): Promise<T> {
    if (!options.forceRefresh) {
      const entry = await this.cache.get<T>(key);

      if (entry) {
        // >= so that a ttl of 0 means "always revalidate" rather than
        // "revalidate after 1ms". Immaterial at the real 24h TTL, but it
        // makes the boundary well defined and ttl=0 usable for debugging.
        const ttlMs = options.ttlMs ?? this.ttlMs;
        const isStale = Date.now() - entry.storedAt >= ttlMs;

        if (isStale) {
          // Serve what we have and refresh behind it. Failures here are
          // deliberately swallowed: we already have an answer for the caller,
          // and an offline refresh shouldn't surface as an error.
          void this.fetchAndStore(key, fetcher).catch(() => {});
        }

        return entry.value;
      }
    }

    return this.fetchAndStore(key, fetcher);
  }

  private async fetchAndStore<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const work = (async () => {
      const value = await fetcher();
      await this.cache.set(key, value);
      return value;
    })().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, work);
    return work;
  }
}
