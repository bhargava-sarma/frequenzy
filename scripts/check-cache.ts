/**
 * Verifies LibraryRepository caching behaviour without touching the network.
 *
 *   npm run check:cache
 *
 * Both the repository and the CacheStore contract are free of platform
 * imports, so the exact code the app runs can be exercised here against an
 * in-memory cache and a counting fake client. Anything that fails here would
 * otherwise only show up as a mystery extra request on device.
 */

import { LibraryRepository } from '../src/data/libraryRepository';
import type { CacheEntry, CacheStore } from '../src/data/cache';
import type { SubsonicClient } from '../src/api/client';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  const mark = pass ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
  const detail = pass ? '' : ` ${DIM}(got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})${RESET}`;
  console.log(`  ${mark} ${label}${detail}`);
}

/** In-memory CacheStore with the same semantics as the AsyncStorage one. */
function createMemoryCache(): CacheStore & { size: () => number } {
  const map = new Map<string, string>();
  return {
    async get<T>(key: string): Promise<CacheEntry<T> | null> {
      const raw = map.get(key);
      return raw ? (JSON.parse(raw) as CacheEntry<T>) : null;
    },
    async set<T>(key: string, value: T) {
      map.set(key, JSON.stringify({ value, storedAt: Date.now() } satisfies CacheEntry<T>));
    },
    async remove(key: string) {
      map.delete(key);
    },
    async clear() {
      map.clear();
    },
    size: () => map.size,
  };
}

/** Counts calls so we can assert how often the network would have been hit. */
function createFakeClient() {
  const calls = { getArtists: 0, getArtist: 0, getAlbum: 0 };

  const client = {
    async getArtists() {
      calls.getArtists += 1;
      return { artists: { index: [{ name: 'A', artist: [{ id: '1', name: 'Aphex Twin' }] }] } };
    },
    async getArtist(id: string) {
      calls.getArtist += 1;
      return { artist: { id, name: 'Aphex Twin', album: [{ id: 'al1', name: 'Selected Ambient' }] } };
    },
    async getAlbum(id: string) {
      calls.getAlbum += 1;
      return { album: { id, name: 'Selected Ambient', song: [{ id: 's1', title: 'Xtal' }] } };
    },
  } as unknown as SubsonicClient;

  return { client, calls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

async function main() {
  console.log('\nLibraryRepository');

  // --- cold read populates the cache ---------------------------------------
  {
    const { client, calls } = createFakeClient();
    const cache = createMemoryCache();
    const repo = new LibraryRepository({ client, cache });

    const artists = await repo.getArtists();
    check('cold read fetches once', calls.getArtists, 1);
    check('cold read returns data', artists.length, 1);
    check('cold read writes to cache', cache.size(), 1);
  }

  // --- warm read avoids the network ----------------------------------------
  {
    const { client, calls } = createFakeClient();
    const repo = new LibraryRepository({ client, cache: createMemoryCache() });

    await repo.getArtists();
    await repo.getArtists();
    await repo.getArtists();
    check('repeated reads fetch only once', calls.getArtists, 1);
  }

  // --- concurrent cold reads are deduplicated ------------------------------
  {
    const { client, calls } = createFakeClient();
    const repo = new LibraryRepository({ client, cache: createMemoryCache() });

    await Promise.all([repo.getArtists(), repo.getArtists(), repo.getArtists()]);
    check('3 concurrent cold reads collapse to 1 request', calls.getArtists, 1);
  }

  // --- forceRefresh bypasses a warm cache ----------------------------------
  {
    const { client, calls } = createFakeClient();
    const repo = new LibraryRepository({ client, cache: createMemoryCache() });

    await repo.getArtists();
    await repo.getArtists({ forceRefresh: true });
    check('forceRefresh re-fetches', calls.getArtists, 2);
  }

  // --- stale entries serve immediately, then revalidate --------------------
  {
    const { client, calls } = createFakeClient();
    const repo = new LibraryRepository({ client, cache: createMemoryCache(), ttlMs: 0 });

    await repo.getArtists();
    await flush(); // don't let both reads land in the same millisecond
    const served = await repo.getArtists();

    check('stale read still returns data', served.length, 1);
    await flush();
    check('stale read revalidated in background', calls.getArtists, 2);
  }

  // --- nested reads unwrap correctly ---------------------------------------
  {
    const { client } = createFakeClient();
    const repo = new LibraryRepository({ client, cache: createMemoryCache() });

    const artist = await repo.getArtist('1');
    check('getArtist splits albums out', artist.albums.length, 1);
    check('getArtist keeps artist fields', artist.artist.name, 'Aphex Twin');

    const album = await repo.getAlbum('al1');
    check('getAlbum splits songs out', album.songs.length, 1);
    check('getAlbum keeps album fields', album.album.name, 'Selected Ambient');
  }

  // --- invalidation --------------------------------------------------------
  {
    const { client, calls } = createFakeClient();
    const cache = createMemoryCache();
    const repo = new LibraryRepository({ client, cache });

    await repo.getAlbum('al1');
    await repo.invalidateAlbum('al1');
    await repo.getAlbum('al1');
    check('invalidateAlbum forces a refetch', calls.getAlbum, 2);

    await repo.getArtists();
    await repo.clear();
    check('clear empties the cache', cache.size(), 0);
  }

  console.log(
    failures === 0
      ? `\n${GREEN}All checks passed.${RESET}\n`
      : `\n${RED}${failures} check(s) failed.${RESET}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
