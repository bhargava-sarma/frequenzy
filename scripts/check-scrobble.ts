/**
 * Verifies the scrobble path and the play-derived album shelves.
 *
 *   npm run check:scrobble
 *
 * Only sends `submission=false` — the "now playing" ping, which Navidrome
 * displays live and does not record. Nothing here writes to your play counts,
 * so the check is safe to run repeatedly.
 *
 * Reads credentials from `.env` (gitignored) and prints nothing secret.
 */

import { SubsonicClient } from '../src/api/client';
import type { ServerConfig } from '../src/api/config';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

const heading = (text: string) => console.log(`\n${BOLD}${text}${RESET}`);
const ok = (text: string) => console.log(`  ${GREEN}✓${RESET} ${text}`);
const warn = (text: string) => console.log(`  ${YELLOW}!${RESET} ${text}`);
const info = (text: string) => console.log(`    ${DIM}${text}${RESET}`);

function loadConfig(): ServerConfig {
  const { NAVIDROME_LOCAL_URL, NAVIDROME_REMOTE_URL, NAVIDROME_USERNAME, NAVIDROME_PASSWORD } =
    process.env;

  if (!NAVIDROME_USERNAME || !NAVIDROME_PASSWORD) {
    console.error(`\n${RED}Missing credentials — set them in .env.${RESET}\n`);
    process.exit(1);
  }

  return {
    localUrl: NAVIDROME_LOCAL_URL,
    remoteUrl: NAVIDROME_REMOTE_URL,
    username: NAVIDROME_USERNAME,
    password: NAVIDROME_PASSWORD,
  };
}

async function main() {
  const client = new SubsonicClient({ config: loadConfig(), log: (m) => info(m) });

  heading('Connection');
  const connection = await client.ensureConnection();
  ok(`Connected via ${connection.kind}`);

  // --- Scrobble ------------------------------------------------------------
  heading('Scrobble');

  const sample = await client.getAlbumList2({ type: 'newest', size: 1 });
  const album = sample.albumList2.album?.[0];
  if (!album) {
    warn('No albums on the server — nothing to scrobble against.');
    return;
  }

  const detail = await client.getAlbum(album.id);
  const song = detail.album.song?.[0];
  if (!song) {
    warn(`"${album.name}" has no tracks — nothing to scrobble against.`);
    return;
  }

  // submission=false is the now-playing ping. It proves the endpoint accepts
  // our parameters without adding a play to the counters this check reads.
  await client.scrobble(song.id, { submission: false });
  ok(`now-playing accepted for "${song.title}"`);
  info('submission=false, so no play was recorded');

  // --- Shelves -------------------------------------------------------------
  heading('Album shelves');

  for (const type of ['newest', 'recent', 'frequent', 'random'] as const) {
    const response = await client.getAlbumList2({ type, size: 20 });
    const albums = response.albumList2.album ?? [];

    if (albums.length > 0) {
      ok(`${type.padEnd(9)} ${albums.length} albums  ${DIM}e.g. ${albums[0].name}${RESET}`);
    } else if (type === 'recent' || type === 'frequent') {
      // Expected on a server with no listening history — these fill in as the
      // app scrobbles, which is the whole reason scrobbling went in.
      warn(`${type.padEnd(9)} empty — no play history recorded yet`);
    } else {
      warn(`${type.padEnd(9)} empty`);
    }
  }

  console.log();
}

main().catch((error: unknown) => {
  console.error(`\n${RED}${error instanceof Error ? error.message : String(error)}${RESET}\n`);
  process.exit(1);
});
