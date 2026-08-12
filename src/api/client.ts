import { buildAuthParams } from './auth';
import {
  ConnectionKind,
  ServerConfig,
  UrlCandidate,
  resolveCandidates,
} from './config';
import {
  ApiError,
  NoReachableServerError,
  NotASubsonicServerError,
  SubsonicError,
  TransportError,
} from './errors';
import type {
  AlbumList2Response,
  AlbumResponse,
  ArtistResponse,
  ArtistsResponse,
  Child,
  PlaylistResponse,
  PlaylistsResponse,
  SearchResult3Response,
  SubsonicEnvelope,
  SubsonicResponseBody,
} from '../types/subsonic';

export type QueryValue = string | number | boolean | undefined | (string | number)[];
export type QueryParams = Record<string, QueryValue>;

export interface ConnectionState {
  kind: ConnectionKind;
  url: string;
  /** When this address was first proven reachable. */
  establishedAt: number;
  /** When we last got a successful response. Drives the staleness check. */
  lastOkAt: number;
}

export interface SubsonicClientOptions {
  config: ServerConfig;
  /**
   * How long to wait on the LOCAL address before giving up and trying remote.
   * Short by design: when away from home this address is simply absent, and
   * every millisecond here is dead time on the user's first request.
   */
  probeTimeoutMs?: number;
  /** Remote probe budget. Longer — Tailscale may need to negotiate a path. */
  remoteProbeTimeoutMs?: number;
  /** Budget for ordinary requests once connected. */
  requestTimeoutMs?: number;
  /** How long a proven connection stays trusted without a successful request. */
  connectionTtlMs?: number;
  /** Injected for tests; defaults to the platform fetch. */
  fetchImpl?: typeof fetch;
  /** Fires whenever the active connection changes. Feeds the debug screen. */
  onConnectionChange?: (state: ConnectionState | null) => void;
  log?: (message: string) => void;
}

/**
 * Subsonic API client for a single Navidrome server reachable at one or two
 * addresses.
 *
 * The client — not the screens — owns the question "which base URL is live
 * right now". Callers just await a method and never think about transport.
 */
export class SubsonicClient {
  private readonly config: ServerConfig;
  private readonly probeTimeoutMs: number;
  private readonly remoteProbeTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly connectionTtlMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly onConnectionChange?: (state: ConnectionState | null) => void;
  private readonly log: (message: string) => void;

  private connection: ConnectionState | null = null;
  /** Dedupes concurrent probes so a cold start doesn't ping N times. */
  private probeInFlight: Promise<ConnectionState> | null = null;

  constructor(options: SubsonicClientOptions) {
    this.config = options.config;
    this.probeTimeoutMs = options.probeTimeoutMs ?? 2000;
    this.remoteProbeTimeoutMs = options.remoteProbeTimeoutMs ?? 6000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15000;
    this.connectionTtlMs = options.connectionTtlMs ?? 5 * 60 * 1000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.onConnectionChange = options.onConnectionChange;
    this.log = options.log ?? (() => {});
  }

  // -------------------------------------------------------------------------
  // Connection management
  // -------------------------------------------------------------------------

  /** Current connection without triggering a probe. For debug/settings UI. */
  getConnectionState(): ConnectionState | null {
    return this.connection;
  }

  /**
   * Drops the cached connection so the next request re-probes from the top.
   * Call this on resume-from-background: the device may have moved between
   * home Wi-Fi and cellular while we weren't looking.
   */
  invalidateConnection(): void {
    if (this.connection) {
      this.log(`Connection invalidated (was ${this.connection.kind})`);
      this.connection = null;
      this.onConnectionChange?.(null);
    }
  }

  /** Returns a live connection, probing if we don't have a fresh one. */
  async ensureConnection(force = false): Promise<ConnectionState> {
    if (
      !force &&
      this.connection &&
      Date.now() - this.connection.lastOkAt < this.connectionTtlMs
    ) {
      return this.connection;
    }

    if (this.probeInFlight) return this.probeInFlight;

    this.probeInFlight = this.probe().finally(() => {
      this.probeInFlight = null;
    });
    return this.probeInFlight;
  }

  /**
   * Tries each candidate address in priority order until one answers.
   *
   * An auth rejection aborts the whole sequence rather than advancing to the
   * next address: both addresses are the same Navidrome instance with the
   * same credentials, so a second attempt would fail identically and only
   * delay a clear error message.
   */
  private async probe(): Promise<ConnectionState> {
    const candidates: UrlCandidate[] = resolveCandidates(this.config);
    const attempts: { url: string; error: string }[] = [];

    for (const candidate of candidates) {
      const timeout =
        candidate.kind === 'local' ? this.probeTimeoutMs : this.remoteProbeTimeoutMs;

      this.log(`Probing ${candidate.kind} ${candidate.url} (${timeout}ms budget)`);
      const startedAt = Date.now();

      try {
        await this.fetchEnvelope(candidate.url, 'ping', {}, timeout);

        const now = Date.now();
        const state: ConnectionState = {
          kind: candidate.kind,
          url: candidate.url,
          establishedAt: now,
          lastOkAt: now,
        };
        this.connection = state;
        this.onConnectionChange?.(state);
        this.log(`Connected via ${candidate.kind} in ${now - startedAt}ms`);
        return state;
      } catch (error) {
        if (error instanceof ApiError) {
          this.log(`${candidate.url} reached, but rejected the request: ${error.message}`);
          this.connection = null;
          this.onConnectionChange?.(null);
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        this.log(`${candidate.kind} failed after ${Date.now() - startedAt}ms: ${message}`);
        attempts.push({ url: candidate.url, error: message });
      }
    }

    this.connection = null;
    this.onConnectionChange?.(null);
    throw new NoReachableServerError(attempts);
  }

  // -------------------------------------------------------------------------
  // Request plumbing
  // -------------------------------------------------------------------------

  /**
   * Builds a fully authenticated URL. Auth params are minted per call.
   *
   * Encoded by hand rather than with `URLSearchParams` so the output is
   * byte-identical under Node and React Native — see the note in config.ts.
   */
  buildUrl(baseUrl: string, endpoint: string, params: QueryParams = {}): string {
    const parts: string[] = [];

    const push = (key: string, value: string | number | boolean) => {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    };

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) push(key, item);
      } else {
        push(key, value);
      }
    }

    const auth = buildAuthParams(this.config.username, this.config.password);
    for (const [key, value] of Object.entries(auth)) push(key, value);

    return `${baseUrl}/rest/${endpoint}.view?${parts.join('&')}`;
  }

  /**
   * Performs one request against one address and unwraps the envelope.
   *
   * Anything that isn't a well-formed Subsonic envelope is reported as a
   * transport failure. That matters for the local address specifically: on a
   * foreign network some other device may well be sitting on the same private
   * IP, and it would happily return a 200 with unrelated content.
   */
  private async fetchEnvelope<T>(
    baseUrl: string,
    endpoint: string,
    params: QueryParams,
    timeoutMs: number,
  ): Promise<T & SubsonicResponseBody> {
    const url = this.buildUrl(baseUrl, endpoint, params);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
    } catch (error) {
      const aborted = controller.signal.aborted;
      throw new TransportError(
        aborted ? `Timed out after ${timeoutMs}ms` : `Network request failed`,
        baseUrl,
        error,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new TransportError(`HTTP ${response.status} ${response.statusText}`, baseUrl);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new NotASubsonicServerError(baseUrl, 'response was not valid JSON');
    }

    const body = (payload as Partial<SubsonicEnvelope<T>>)?.['subsonic-response'];
    if (!body || typeof body !== 'object') {
      throw new NotASubsonicServerError(baseUrl, 'response had no subsonic-response envelope');
    }

    if (body.status === 'failed') {
      const err = body.error;
      throw new ApiError(err?.code ?? 0, err?.message ?? 'Unknown error', endpoint);
    }

    return body as T & SubsonicResponseBody;
  }

  /**
   * Issues a request against the active connection, re-probing and retrying
   * once if the transport fails. One retry only — a second failure means the
   * server is genuinely unreachable, not that we picked the wrong address.
   */
  async request<T>(endpoint: string, params: QueryParams = {}): Promise<T & SubsonicResponseBody> {
    const connection = await this.ensureConnection();

    try {
      const body = await this.fetchEnvelope<T>(
        connection.url,
        endpoint,
        params,
        this.requestTimeoutMs,
      );
      connection.lastOkAt = Date.now();
      return body;
    } catch (error) {
      if (!(error instanceof SubsonicError) || !error.isFailoverWorthy) throw error;

      this.log(`${endpoint} failed on ${connection.kind}; re-probing and retrying once`);
      this.invalidateConnection();

      const retry = await this.ensureConnection(true);
      const body = await this.fetchEnvelope<T>(
        retry.url,
        endpoint,
        params,
        this.requestTimeoutMs,
      );
      retry.lastOkAt = Date.now();
      return body;
    }
  }

  // -------------------------------------------------------------------------
  // Endpoints — browsing
  // -------------------------------------------------------------------------

  /** Bare connectivity/credential check. */
  async ping(): Promise<SubsonicResponseBody> {
    return this.request('ping');
  }

  async getArtists(): Promise<ArtistsResponse> {
    return this.request<ArtistsResponse>('getArtists');
  }

  async getArtist(id: string): Promise<ArtistResponse> {
    return this.request<ArtistResponse>('getArtist', { id });
  }

  async getAlbum(id: string): Promise<AlbumResponse> {
    return this.request<AlbumResponse>('getAlbum', { id });
  }

  /**
   * Paginated album list. `size` is capped at 500 by the Subsonic spec, so
   * callers wanting the whole library must page with `offset`.
   */
  async getAlbumList2(
    options: { type?: string; size?: number; offset?: number } = {},
  ): Promise<AlbumList2Response> {
    return this.request<AlbumList2Response>('getAlbumList2', {
      type: options.type ?? 'alphabeticalByName',
      size: options.size ?? 500,
      offset: options.offset ?? 0,
    });
  }

  async search3(
    query: string,
    options: {
      artistCount?: number;
      albumCount?: number;
      songCount?: number;
    } = {},
  ): Promise<SearchResult3Response> {
    return this.request<SearchResult3Response>('search3', { query, ...options });
  }

  async getPlaylists(): Promise<PlaylistsResponse> {
    return this.request<PlaylistsResponse>('getPlaylists');
  }

  async getPlaylist(id: string): Promise<PlaylistResponse> {
    return this.request<PlaylistResponse>('getPlaylist', { id });
  }

  // -------------------------------------------------------------------------
  // Endpoints — mutations
  // -------------------------------------------------------------------------

  /** Favorites are written back to Navidrome so they're server-side truth. */
  async star(target: { id?: string; albumId?: string; artistId?: string }): Promise<void> {
    await this.request('star', target);
  }

  async unstar(target: { id?: string; albumId?: string; artistId?: string }): Promise<void> {
    await this.request('unstar', target);
  }

  async createPlaylist(name: string, songIds: string[] = []): Promise<void> {
    await this.request('createPlaylist', { name, songId: songIds });
  }

  async scrobble(id: string, submission = true): Promise<void> {
    await this.request('scrobble', { id, submission });
  }

  // -------------------------------------------------------------------------
  // Media URLs
  // -------------------------------------------------------------------------

  /**
   * Builds a stream URL that explicitly forbids transcoding.
   *
   * `format=raw` tells Navidrome to serve the file byte-for-byte, and
   * `maxBitRate=0` means "no cap" — omitting either lets a server-side or
   * per-player transcoding profile silently downgrade the stream. Both are
   * sent on every request rather than trusted to defaults.
   */
  async getStreamUrl(songId: string): Promise<string> {
    const connection = await this.ensureConnection();
    return this.buildUrl(connection.url, 'stream', {
      id: songId,
      format: 'raw',
      maxBitRate: 0,
    });
  }

  async getCoverArtUrl(coverArtId: string, size?: number): Promise<string> {
    const connection = await this.ensureConnection();
    return this.buildUrl(connection.url, 'getCoverArt', { id: coverArtId, size });
  }

  /**
   * Inspects what the server would actually send for a track, without
   * downloading it: a 2-byte range request returns the true total size in
   * the Content-Range header.
   *
   * Comparing that total against the `size` Navidrome reports in getAlbum is
   * the actual proof that nothing was re-encoded — a transcoded stream cannot
   * coincidentally match the source file's byte count.
   */
  async probeStream(songId: string): Promise<StreamProbe> {
    const url = await this.getStreamUrl(songId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: { Range: 'bytes=0-1' },
      });

      // Never buffer the audio itself — we only want the headers.
      await response.body?.cancel().catch(() => {});

      const contentRange = response.headers.get('content-range');
      const contentLength = response.headers.get('content-length');

      // "bytes 0-1/48234123" — the figure after the slash is the full size.
      const totalFromRange = contentRange?.match(/\/(\d+)\s*$/)?.[1];
      const totalBytes = totalFromRange
        ? Number(totalFromRange)
        : contentLength
          ? Number(contentLength)
          : null;

      return {
        url,
        status: response.status,
        contentType: response.headers.get('content-type'),
        totalBytes,
        acceptsRanges: response.status === 206 || response.headers.has('accept-ranges'),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface StreamProbe {
  url: string;
  status: number;
  contentType: string | null;
  /** Full size of what the server would send, in bytes. */
  totalBytes: number | null;
  acceptsRanges: boolean;
}

/** Convenience re-export so callers need only import from `api/`. */
export type { Child, ServerConfig };
