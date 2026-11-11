/**
 * A cache key for a cover art URL that ignores everything about the URL
 * except which picture it is.
 *
 * A cover URL carries the base address and this session's salt and token.
 * Used as the cache key — the default — that made every launch a cold cache:
 * a new salt each start meant no URL ever matched one from the session
 * before, so every cover in the library was downloaded again, and again
 * whenever the phone moved between the LAN and the remote address. Navidrome's
 * cover ids already change when the picture does, so the id and the requested
 * size identify the image completely.
 *
 * Returns undefined for anything that isn't a Subsonic cover (an artist
 * image hosted by Last.fm, say), which then caches under its own URL.
 */
export function artworkCacheKey(uri: string | null | undefined): string | undefined {
  if (!uri) return undefined;
  const at = uri.indexOf('/rest/getCoverArt');
  if (at < 0) return undefined;

  const query = uri.slice(at);
  const id = /[?&]id=([^&]+)/.exec(query)?.[1];
  if (!id) return undefined;
  const size = /[?&]size=(\d+)/.exec(query)?.[1] ?? 'full';
  return `cover:${id}:${size}`;
}
