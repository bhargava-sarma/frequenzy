/**
 * Phase 0 connectivity + losslessness check.
 *
 * Runs the real SubsonicClient — the same file the app imports — against your
 * Navidrome server from this laptop, so the API layer is proven before any UI
 * exists. Run with:
 *
 *   npm run check:connection
 *
 * Reads credentials from `.env` (gitignored). Prints nothing secret: auth
 * params are redacted from every URL so the output is safe to paste.
 */

import { SubsonicClient } from '../src/api/client';
import { ApiError, NoReachableServerError } from '../src/api/errors';
import type { ServerConfig } from '../src/api/config';
import type { AlbumSummary, Child } from '../src/types/subsonic';

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

const heading = (text: string) => console.log(`\n${BOLD}${text}${RESET}`);
const ok = (text: string) => console.log(`  ${GREEN}✓${RESET} ${text}`);
const bad = (text: string) => console.log(`  ${RED}✗${RESET} ${text}`);
const warn = (text: string) => console.log(`  ${YELLOW}!${RESET} ${text}`);
const info = (text: string) => console.log(`    ${DIM}${text}${RESET}`);

const num = (n: number) => n.toLocaleString('en-US');

/** A check failed for a reason we can explain, rather than an unexpected crash. */
class CheckFailure extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
  }
}

/** Aborts the run with a friendly message. Typed `never` so it narrows types. */
function fail(message: string, ...details: string[]): never {
  throw new CheckFailure(message, details);
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(2)} MB`;
}

/**
 * Strips credentials from a URL before printing. `t` and `s` together allow an
 * offline dictionary attack on the password, so they must never reach a log,
 * a screenshot, or a chat window.
 */
function redact(url: string): string {
  return url.replace(/([?&])(u|t|s|p)=[^&]*/g, '$1$2=REDACTED');
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadConfig(): ServerConfig {
  const { NAVIDROME_LOCAL_URL, NAVIDROME_REMOTE_URL, NAVIDROME_USERNAME, NAVIDROME_PASSWORD } =
    process.env;

  if (!NAVIDROME_USERNAME || !NAVIDROME_PASSWORD) {
    console.error(
      `\n${RED}Missing credentials.${RESET}\n\n` +
        `Copy the template and fill it in:\n` +
        `  cp .env.example .env\n\n` +
        `Then set NAVIDROME_USERNAME and NAVIDROME_PASSWORD (and at least one URL).\n`,
    );
    process.exit(1);
  }

  return {
    localUrl: NAVIDROME_LOCAL_URL,
    remoteUrl: NAVIDROME_REMOTE_URL,
    username: NAVIDROME_USERNAME,
    password: NAVIDROME_PASSWORD,
  };
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

async function main() {
  const config = loadConfig();

  const client = new SubsonicClient({
    config,
    log: (message) => info(message),
  });

  // --- 1. Connectivity ------------------------------------------------------
  heading('1. CONNECTIVITY');
  info(`local:  ${config.localUrl ?? '(not set)'}`);
  info(`remote: ${config.remoteUrl ?? '(not set)'}`);
  console.log();

  const startedAt = Date.now();
  const pong = await client.ping();
  const connection = client.getConnectionState()!;

  ok(
    `Connected via ${BOLD}${connection.kind.toUpperCase()}${RESET} ` +
      `(${connection.url}) in ${Date.now() - startedAt}ms`,
  );
  info(`server: ${pong.type ?? 'unknown'} ${pong.serverVersion ?? ''}`.trim());
  info(`subsonic api: ${pong.version} · openSubsonic: ${pong.openSubsonic ?? false}`);

  // --- 2. Real data ---------------------------------------------------------
  heading('2. LIBRARY DATA');

  const artistsResponse = await client.getArtists();
  const indexes = artistsResponse.artists.index ?? [];
  const artists = indexes.flatMap((index) => index.artist);
  const artistsJsonBytes = JSON.stringify(artistsResponse).length;

  if (artists.length === 0) {
    fail(
      'Authenticated, but the library returned zero artists.',
      'Check that Navidrome has finished scanning your music folder.',
    );
  }

  ok(`${num(artists.length)} artists across ${indexes.length} index buckets`);

  const albumCount = artists.reduce((sum, a) => sum + (a.albumCount ?? 0), 0);
  info(`${num(albumCount)} albums reported by artist metadata`);
  info(`getArtists payload: ${bytes(artistsJsonBytes)} of JSON`);

  // --- 3. Drill down to a real track ---------------------------------------
  heading('3. DRILL-DOWN');

  let sampleAlbum: AlbumSummary | undefined;
  let sampleTrack: Child | undefined;

  for (const artist of artists.slice(0, 10)) {
    const detail = await client.getArtist(artist.id);
    const album = detail.artist.album?.[0];
    if (!album) continue;

    const albumDetail = await client.getAlbum(album.id);
    const track = albumDetail.album.song?.find((song) => (song.size ?? 0) > 0);
    if (track) {
      sampleAlbum = album;
      sampleTrack = track;
      break;
    }
  }

  if (!sampleTrack || !sampleAlbum) {
    fail(
      'Could not find any album with a playable track to test.',
      'Checked the first 10 artists and found no album reporting a track size.',
    );
  }

  ok(`Sample track: ${sampleTrack.artist ?? '?'} — ${sampleTrack.title}`);
  info(`album: ${sampleAlbum.name}`);
  info(
    `format: ${sampleTrack.suffix ?? '?'} · ` +
      `${sampleTrack.bitDepth ?? '?'}bit/${
        sampleTrack.samplingRate ? sampleTrack.samplingRate / 1000 : '?'
      }kHz · ${sampleTrack.bitRate ?? '?'}kbps`,
  );
  info(`server-reported size: ${num(sampleTrack.size ?? 0)} bytes (${bytes(sampleTrack.size ?? 0)})`);

  // --- 4. The one that actually matters ------------------------------------
  heading('4. LOSSLESS VERIFICATION');

  const probe = await client.probeStream(sampleTrack.id);

  info(`stream url: ${redact(probe.url)}`);
  info(`http status: ${probe.status}${probe.status === 206 ? ' (partial — range honored)' : ''}`);
  info(`content-type: ${probe.contentType ?? 'not reported'}`);
  info(`bytes server would send: ${probe.totalBytes ? num(probe.totalBytes) : 'unknown'}`);
  console.log();

  const expected = sampleTrack.size ?? 0;
  const actual = probe.totalBytes ?? 0;

  if (expected > 0 && actual === expected) {
    ok(
      `${BOLD}Byte-identical to the source file — no transcoding.${RESET} ` +
        `${num(actual)} bytes in, ${num(actual)} bytes out.`,
    );
  } else if (actual > 0 && expected > 0) {
    bad(`${BOLD}Size mismatch — the server is re-encoding this stream.${RESET}`);
    info(`source file: ${num(expected)} bytes`);
    info(`stream:      ${num(actual)} bytes (${((actual / expected) * 100).toFixed(1)}% of source)`);
    info(`Check Navidrome → Settings → Players for a transcoding profile on "music-app".`);
  } else {
    warn('Could not compare sizes — the server did not report a usable length.');
  }

  if (sampleTrack.transcodedContentType || sampleTrack.transcodedSuffix) {
    warn(
      `Navidrome advertises a transcode target for this track ` +
        `(${sampleTrack.transcodedSuffix ?? sampleTrack.transcodedContentType}). ` +
        `format=raw should override it — the byte comparison above is the real answer.`,
    );
  }

  // --- 5. Sizing data for the caching decision ------------------------------
  heading('5. CACHE SIZING (SQLite vs AsyncStorage)');

  const sampleSize = Math.min(5, artists.length);
  let sampledAlbums = 0;
  let sampledTracks = 0;
  let sampledBytes = 0;

  for (const artist of artists.slice(0, sampleSize)) {
    const detail = await client.getArtist(artist.id);
    for (const album of detail.artist.album ?? []) {
      const albumDetail = await client.getAlbum(album.id);
      sampledAlbums += 1;
      sampledTracks += albumDetail.album.song?.length ?? 0;
      sampledBytes += JSON.stringify(albumDetail).length;
    }
  }

  if (sampledTracks > 0) {
    const bytesPerTrack = sampledBytes / sampledTracks;
    const estimatedTracks = albumCount > 0 ? (sampledTracks / sampledAlbums) * albumCount : 0;
    const projected = bytesPerTrack * estimatedTracks;

    info(`sampled ${sampledAlbums} albums / ${sampledTracks} tracks from ${sampleSize} artists`);
    info(`~${Math.round(bytesPerTrack)} bytes of JSON per track`);
    info(`~${Math.round(estimatedTracks / 100) * 100} tracks projected library-wide`);
    console.log();
    ok(`Projected full metadata cache: ${BOLD}${bytes(projected)}${RESET} (uncompressed JSON)`);
  }

  heading('RESULT');
  ok('API client authenticated and pulled real data end-to-end.\n');
}

main().catch((error) => {
  console.log();

  if (error instanceof CheckFailure) {
    bad(error.message);
    error.details.forEach(info);
  } else if (error instanceof NoReachableServerError) {
    bad('Could not reach your server at any configured address.');
    for (const attempt of error.attempts) {
      info(`${attempt.url} → ${attempt.error}`);
    }
    info('\nIs Navidrome running? Is this laptop on the tailnet or home Wi-Fi?');
  } else if (error instanceof ApiError && error.isAuthError) {
    bad(`Server reached, but it rejected the login: ${error.message}`);
    info('Check NAVIDROME_USERNAME / NAVIDROME_PASSWORD in .env.');
  } else {
    bad(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.log(`${DIM}${error.stack.split('\n').slice(1, 4).join('\n')}${RESET}`);
    }
  }

  console.log();
  process.exit(1);
});
