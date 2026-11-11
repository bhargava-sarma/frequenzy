import { buildAuthParams, type AuthParams } from './auth';
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
  ArtistInfo2Response,
  ArtistResponse,
  ArtistsResponse,
  GenresResponse,
  LyricsListResponse,
  PlaylistResponse,
  PlaylistsResponse,
  RandomSongsResponse,
  ScanStatusResponse,
  SimilarSongs2Response,
  SimilarSongsResponse,
  SongResponse,
  SongsByGenreResponse,
  Starred2Response,
  SearchResult3Response,
  SubsonicEnvelope,
  SubsonicResponseBody,
  TopSongsResponse,
} from '../types/subsonic';

export type QueryValue = string | number | boolean | undefined | (string | number)[];
export type QueryParams = Record<string, QueryValue>;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Result of dialing one address. Modelled as a value rather than an exception
 * so the two attempts can be raced without try/catch tangling the control flow.
 * `skipped` marks an attempt that was never dialed because the other won first.
 */
type ProbeOutcome =
  | { ok: true; candidate: UrlCandidate; ms: number; skipped?: false }
  | { ok: false; candidate: UrlCandidate; error: unknown; skipped?: boolean };

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
  /**
   * Head start given to the local address before remote is dialed in
   * parallel.
   *
   * Calibrated from measurement, not taste: this LAN answers in 124-294ms
   * (once 424ms on a cold ARP entry), so a shorter window would sometimes let
   * remote win while sitting at home and quietly defeat local-first. Long
   * enough to cover that spread, still ~6x better than waiting out the full
   * local timeout when away.
   */
  staggerMs?: number;
  /** Budget for ordinary requests once connected. */
  requestTimeoutMs?: number;
  /** How long a proven connection stays trusted without a successful request. */
  connectionTtlMs?: number;
  /** Injected for tests; defaults to the platform fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Fires whenever the active connection changes. A null state comes with the
   * reason: `invalidated` means a re-probe is about to follow and the last
   * address may well still be good, `unreachable` means the probe finished
   * and nothing answered. The UI treats the two very differently — one is a
   * moment of checking, the other is being offline.
   */
  onConnectionChange?: (state: ConnectionState | null, cause?: ConnectionLoss) => void;
  log?: (message: string) => void;
}

export type ConnectionLoss = 'invalidated' | 'unreachable';

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
  private readonly staggerMs: number;
  private readonly requestTimeoutMs: number;
  private readonly connectionTtlMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly onConnectionChange?: (state: ConnectionState | null, cause?: ConnectionLoss) => void;
  private readonly log: (message: string) => void;

  private connection: ConnectionState | null = null;
  /**
   * The address that answered last, kept through invalidation and failed
   * probes. Only cover art URLs are built from it: artwork is cached on the
   * device under a key that ignores the address, so a URL at the last known
   * base still resolves from cache while a re-probe is in flight or the
   * server is out of reach — where a null would blank every cover on screen.
   * Seeded with the first configured address for the same reason on a cold
   * start. Streams and API calls never use it; they wait for a real probe.
   */
  private lastBaseUrl: string | null = null;
  /** Dedupes concurrent probes so a cold start doesn't ping N times. */
  private probeInFlight: Promise<ConnectionState> | null = null;

  /**
   * One salt+token pair for the life of this client.
   *
   * Media URLs are cache keys. Cover art is requested through expo-image and
   * stream URLs through ExoPlayer, both of which key on the URL string, so a
   * per-request salt made every one of them a miss — the same 40px thumbnail
   * was refetched from the server on every re-render of its row.
   */
  private authParams: AuthParams | null = null;

  constructor(options: SubsonicClientOptions) {
    this.config = options.config;
    this.probeTimeoutMs = options.probeTimeoutMs ?? 2000;
    this.remoteProbeTimeoutMs = options.remoteProbeTimeoutMs ?? 6000;
    this.staggerMs = options.staggerMs ?? 400;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15000;
    this.connectionTtlMs = options.connectionTtlMs ?? 5 * 60 * 1000;
    // Wrapped rather than stored bare: invoked as `this.fetchImpl(...)`, a
    // browser's fetch receives the client as its receiver and throws "Illegal
    // invocation". React Native's fetch doesn't care, which is why this only
    // ever surfaced on the web.
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.onConnectionChange = options.onConnectionChange;
    this.log = options.log ?? (() => {});

    try {
      this.lastBaseUrl = resolveCandidates(this.config)[0]?.url ?? null;
    } catch {
      // A malformed config is reported by the first probe, not here.
      this.lastBaseUrl = null;
    }
  }

  private auth(): AuthParams {
    this.authParams ??= buildAuthParams(this.config.username, this.config.password);
    return this.authParams;
  }

  // -------------------------------------------------------------------------
  // Connection management
  // -------------------------------------------------------------------------

  /** Current connection without triggering a probe. For debug/settings UI. */
  getConnectionState(): ConnectionState | null {
    return this.connection;
  }

  /**
   * Seeds this client with a connection another client already proved.
   *
   * Used when setup verifies credentials against the server and the app then
   * builds its long-lived client: without this the new client re-probes from
   * scratch and pays the full local timeout again, seconds after we already
   * learned which address answers.
   *
   * Safe because the proof was just obtained with this same config, and it is
   * self-correcting regardless — a stale address surfaces as a transport
   * failure on the next request and triggers a re-probe.
   */
  adoptConnection(state: ConnectionState): void {
    this.connection = { ...state };
    this.lastBaseUrl = state.url;
    this.onConnectionChange?.(this.connection);
    this.log(`Adopted verified ${state.kind} connection`);
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
      this.onConnectionChange?.(null, 'invalidated');
    }
  }

  /** The base cover art URLs are built against. See `lastBaseUrl`. */
  getArtworkBaseUrl(): string | null {
    return this.connection?.url ?? this.lastBaseUrl;
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

  /** Dials one address once, reporting the outcome instead of throwing. */
  private async attemptCandidate(
    candidate: UrlCandidate,
    timeoutMs: number,
  ): Promise<ProbeOutcome> {
    this.log(`Probing ${candidate.kind} ${candidate.url} (${timeoutMs}ms budget)`);
    const startedAt = Date.now();

    try {
      await this.fetchEnvelope(candidate.url, 'ping', {}, timeoutMs);
      return { ok: true, candidate, ms: Date.now() - startedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`${candidate.kind} failed after ${Date.now() - startedAt}ms: ${message}`);
      return { ok: false, candidate, error };
    }
  }

  private commit(outcome: Extract<ProbeOutcome, { ok: true }>): ConnectionState {
    const now = Date.now();
    const state: ConnectionState = {
      kind: outcome.candidate.kind,
      url: outcome.candidate.url,
      establishedAt: now,
      lastOkAt: now,
    };
    this.connection = state;
    this.lastBaseUrl = state.url;
    this.onConnectionChange?.(state);
    this.log(`Connected via ${outcome.candidate.kind} in ${outcome.ms}ms`);
    return state;
  }

  private failProbe(error: unknown): never {
    this.connection = null;
    this.onConnectionChange?.(null, 'unreachable');
    throw error;
  }

  private async probe(): Promise<ConnectionState> {
    const candidates: UrlCandidate[] = resolveCandidates(this.config);
    const local = candidates.find((c) => c.kind === 'local');
    const remote = candidates.find((c) => c.kind === 'remote');

    return local && remote
      ? this.probeStaggered(local, remote)
      : this.probeSequential(candidates);
  }

  /**
   * Races the two addresses with a head start for local (RFC 8305 "Happy
   * Eyeballs", as browsers do for IPv6/IPv4), then insists on local.
   *
   * Probing strictly in sequence means that when the LAN address is absent —
   * i.e. any time you're away from home — every cold start burns the full
   * local timeout before remote is even dialed. Measured on device over 5G,
   * that was 2.6s to first byte, nearly all of it spent waiting for a
   * timeout we could have predicted.
   *
   * The head start alone is not enough to keep us on the LAN at home, which
   * is what this originally got wrong. A stagger only delays remote; it does
   * not outrank it. On a phone the first request after the Wi-Fi radio has
   * been idle regularly overruns the window — the LAN measured 124-294ms
   * warm but 424ms on a cold ARP entry — while Tailscale, kept warm by its
   * own keepalives, answers immediately. Whenever local overran, remote won
   * the race and the app sat on Tailscale while on home Wi-Fi.
   *
   * So the race decides only how soon something is usable, never which
   * address we keep. If remote wins it, local keeps probing, and the moment
   * it answers the connection switches to it. Away, local simply fails in
   * the background and nothing changes.
   */
  private async probeStaggered(
    local: UrlCandidate,
    remote: UrlCandidate,
  ): Promise<ConnectionState> {
    let localWon = false;

    const localAttempt = this.attemptCandidate(local, this.probeTimeoutMs).then((outcome) => {
      if (outcome.ok) localWon = true;
      return outcome;
    });

    const remoteAttempt = (async (): Promise<ProbeOutcome> => {
      await sleep(this.staggerMs);
      if (localWon) {
        // Local already answered inside the head start — don't touch the network.
        return { ok: false, candidate: remote, skipped: true, error: undefined };
      }
      return this.attemptCandidate(remote, this.remoteProbeTimeoutMs);
    })();

    // Promise.any resolves on the first success and only rejects once every
    // attempt has failed, which is exactly the semantics we want here.
    const asWinner = async (attempt: Promise<ProbeOutcome>) => {
      const outcome = await attempt;
      if (!outcome.ok) throw outcome;
      return outcome;
    };

    try {
      const winner = await Promise.any([asWinner(localAttempt), asWinner(remoteAttempt)]);
      const state = this.commit(winner);

      // Remote answering first does not settle it — local may still be on its
      // way. Hand back the usable connection now and keep listening for local.
      if (winner.candidate.kind === 'remote') {
        this.preferLocalWhenItAnswers(state, localAttempt);
      }

      return state;
    } catch (aggregate) {
      // Read structurally rather than with `instanceof AggregateError`: the
      // global is missing on some JS engines, where Promise.any is a polyfill
      // that rejects with a plain Error carrying `errors` — and naming an
      // undefined global here would replace "unreachable" with a
      // ReferenceError.
      const errors = (aggregate as { errors?: unknown } | null)?.errors;
      const failures: ProbeOutcome[] = Array.isArray(errors) ? (errors as ProbeOutcome[]) : [];

      // An auth rejection means the server answered and refused us. Report
      // that rather than "unreachable" — the address was never the problem.
      const rejected = failures.find(
        (f) => !f.ok && !f.skipped && f.error instanceof ApiError,
      );
      if (rejected && !rejected.ok) return this.failProbe(rejected.error);

      return this.failProbe(
        new NoReachableServerError(
          failures
            .filter((f): f is Extract<ProbeOutcome, { ok: false }> => !f.ok && !f.skipped)
            .map((f) => ({
              url: f.candidate.url,
              error: f.error instanceof Error ? f.error.message : String(f.error),
            })),
        ),
      );
    }
  }

  /**
   * Switches an already-committed remote connection to local if local answers
   * late. Fire-and-forget: the caller is not kept waiting on it.
   *
   * Guarded on object identity rather than on `kind`. Between committing and
   * local answering, the connection may have been invalidated, re-probed by
   * a resume, or cleared by sign-out — and quietly reinstating an address
   * from a decision that is no longer current is worse than staying remote.
   */
  private preferLocalWhenItAnswers(
    committed: ConnectionState,
    localAttempt: Promise<ProbeOutcome>,
  ): void {
    void localAttempt.then((outcome) => {
      if (!outcome.ok) return;
      if (this.connection !== committed) return;

      this.log('Local answered after remote; switching to it');
      this.commit(outcome);
    });
  }

  /** Plain in-order fallback for when only one address is configured. */
  private async probeSequential(candidates: UrlCandidate[]): Promise<ConnectionState> {
    const attempts: { url: string; error: string }[] = [];

    for (const candidate of candidates) {
      const timeout =
        candidate.kind === 'local' ? this.probeTimeoutMs : this.remoteProbeTimeoutMs;
      const outcome = await this.attemptCandidate(candidate, timeout);

      if (outcome.ok) return this.commit(outcome);
      if (outcome.error instanceof ApiError) return this.failProbe(outcome.error);

      attempts.push({
        url: candidate.url,
        error: outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
      });
    }

    return this.failProbe(new NoReachableServerError(attempts));
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

    for (const [key, value] of Object.entries(this.auth())) push(key, value);

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
    options: {
      type?: string;
      size?: number;
      offset?: number;
      /** Required by type=byGenre. */
      genre?: string;
      /** Required by type=byYear. */
      fromYear?: number;
      toYear?: number;
    } = {},
  ): Promise<AlbumList2Response> {
    return this.request<AlbumList2Response>('getAlbumList2', {
      type: options.type ?? 'alphabeticalByName',
      size: options.size ?? 500,
      offset: options.offset ?? 0,
      genre: options.genre,
      fromYear: options.fromYear,
      toYear: options.toYear,
    });
  }

  async search3(
    query: string,
    options: {
      artistCount?: number;
      albumCount?: number;
      songCount?: number;
      artistOffset?: number;
      albumOffset?: number;
      songOffset?: number;
    } = {},
  ): Promise<SearchResult3Response> {
    return this.request<SearchResult3Response>('search3', { query, ...options });
  }

  /** One track with every field the server knows — path, bitrate, plays. */
  async getSong(id: string): Promise<SongResponse> {
    return this.request<SongResponse>('getSong', { id });
  }

  async getGenres(): Promise<GenresResponse> {
    return this.request<GenresResponse>('getGenres');
  }

  async getSongsByGenre(
    genre: string,
    options: { count?: number; offset?: number } = {},
  ): Promise<SongsByGenreResponse> {
    return this.request<SongsByGenreResponse>('getSongsByGenre', {
      genre,
      count: options.count ?? 100,
      offset: options.offset ?? 0,
    });
  }

  /** Random tracks, optionally narrowed to a genre or a span of years. */
  async getRandomSongs(
    options: { size?: number; genre?: string; fromYear?: number; toYear?: number } = {},
  ): Promise<RandomSongsResponse> {
    return this.request<RandomSongsResponse>('getRandomSongs', {
      size: options.size ?? 50,
      genre: options.genre,
      fromYear: options.fromYear,
      toYear: options.toYear,
    });
  }

  /**
   * An artist's most popular tracks. Navidrome answers from Last.fm, so
   * this is empty when the server has no agent configured — callers treat
   * empty as "unknown", never as an error.
   */
  async getTopSongs(artist: string, count = 10): Promise<TopSongsResponse> {
    return this.request<TopSongsResponse>('getTopSongs', { artist, count });
  }

  /** Tracks similar to an artist — the seed of an artist radio. */
  async getSimilarSongs2(artistId: string, count = 50): Promise<SimilarSongs2Response> {
    return this.request<SimilarSongs2Response>('getSimilarSongs2', { id: artistId, count });
  }

  /** Tracks similar to a song, album or artist id — the seed of a track radio. */
  async getSimilarSongs(id: string, count = 50): Promise<SimilarSongsResponse> {
    return this.request<SimilarSongsResponse>('getSimilarSongs', { id, count });
  }

  async getArtistInfo2(id: string, count = 12): Promise<ArtistInfo2Response> {
    return this.request<ArtistInfo2Response>('getArtistInfo2', {
      id,
      count,
      includeNotPresent: false,
    });
  }

  /** OpenSubsonic: lyrics embedded in the file or beside it on the server. */
  async getLyricsBySongId(id: string): Promise<LyricsListResponse> {
    return this.request<LyricsListResponse>('getLyricsBySongId', { id });
  }

  async getScanStatus(): Promise<ScanStatusResponse> {
    return this.request<ScanStatusResponse>('getScanStatus');
  }

  /** Admin only; a regular account gets a NotAuthorized ApiError. */
  async startScan(): Promise<ScanStatusResponse> {
    return this.request<ScanStatusResponse>('startScan');
  }

  async getPlaylists(): Promise<PlaylistsResponse> {
    return this.request<PlaylistsResponse>('getPlaylists');
  }

  async getPlaylist(id: string): Promise<PlaylistResponse> {
    return this.request<PlaylistResponse>('getPlaylist', { id });
  }

  /**
   * Everything favourited, across artists, albums and tracks.
   *
   * Navidrome exposes favourites through this rather than as a playlist, which
   * is why starred tracks never appeared in getPlaylists.
   */
  async getStarred2(): Promise<Starred2Response> {
    return this.request<Starred2Response>('getStarred2');
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

  /**
   * Creates a playlist and returns it, so the caller can navigate straight to
   * what it just made rather than refetching the whole list to find the id.
   */
  async createPlaylist(name: string, songIds: string[] = []): Promise<PlaylistResponse> {
    return this.request<PlaylistResponse>('createPlaylist', { name, songId: songIds });
  }

  /**
   * Edits a playlist in place.
   *
   * `songIndexToRemove` is by POSITION, not by song id — the Subsonic spec is
   * explicit about this, and it is the only way to remove one copy of a track
   * that appears in the playlist twice. Indexes shift as removals apply, so a
   * multi-row removal must be sent highest-first; the caller is responsible
   * for that ordering.
   */
  async updatePlaylist(options: {
    playlistId: string;
    name?: string;
    comment?: string;
    public?: boolean;
    songIdToAdd?: string[];
    songIndexToRemove?: number[];
  }): Promise<void> {
    await this.request('updatePlaylist', {
      playlistId: options.playlistId,
      name: options.name,
      comment: options.comment,
      public: options.public,
      songIdToAdd: options.songIdToAdd,
      songIndexToRemove: options.songIndexToRemove,
    });
  }

  async deletePlaylist(id: string): Promise<void> {
    await this.request('deletePlaylist', { id });
  }

  /**
   * Replaces a playlist's tracks wholesale, in the given order.
   *
   * `createPlaylist` with an existing `playlistId` overwrites the song list
   * — the only way the Subsonic API offers to reorder one, since
   * updatePlaylist can only append and remove.
   */
  async replacePlaylistSongs(playlistId: string, songIds: string[]): Promise<void> {
    await this.request('createPlaylist', { playlistId, songId: songIds });
  }

  /** 1-5 stars, or 0 to clear. */
  async setRating(id: string, rating: number): Promise<void> {
    await this.request('setRating', { id, rating: Math.max(0, Math.min(5, Math.round(rating))) });
  }

  /**
   * Reports a play to the server.
   *
   * `submission: false` is a "now playing" ping, which Navidrome shows live
   * and does not record. `submission: true` records the play, which is what
   * feeds its recently-played and most-played lists.
   *
   * `time` is when the track *started*, in epoch ms. Submissions are sent
   * partway through a track, so without it every play would be timestamped
   * several minutes late.
   */
  async scrobble(
    id: string,
    options: { submission?: boolean; time?: number } = {},
  ): Promise<void> {
    await this.request('scrobble', {
      id,
      submission: options.submission ?? true,
      time: options.time,
    });
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
   * Synchronous cover art URL for list rendering.
   *
   * Lists render row by row and cannot await per thumbnail, so this builds
   * against the live connection, or failing that the address that answered
   * last. Null only when the config itself is unusable.
   */
  buildCoverArtUrl(coverArtId: string, size?: number): string | null {
    const base = this.getArtworkBaseUrl();
    if (!base) return null;
    return this.buildUrl(base, 'getCoverArt', { id: coverArtId, size });
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
