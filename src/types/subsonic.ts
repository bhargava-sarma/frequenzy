/**
 * Subsonic API response types (API version 1.16.1, as served by Navidrome).
 *
 * Only fields we actually rely on are typed. Navidrome runs with
 * `openSubsonic: true`, so responses carry extra fields beyond the base
 * Subsonic spec; the extras we care about are marked OpenSubsonic below.
 *
 * Everything here is plain TypeScript with no React Native imports, so this
 * file is safe to lift into a shared package when the web app phase starts.
 */

/** Subsonic wraps every response in a single `subsonic-response` envelope. */
export interface SubsonicEnvelope<T = unknown> {
  'subsonic-response': SubsonicResponseBody & T;
}

export interface SubsonicResponseBody {
  status: 'ok' | 'failed';
  version: string;
  /** Navidrome reports `"navidrome"`. Used to confirm we reached the real server. */
  type?: string;
  serverVersion?: string;
  openSubsonic?: boolean;
  error?: SubsonicErrorBody;
}

export interface SubsonicErrorBody {
  code: SubsonicErrorCode;
  message: string;
}

/**
 * Error codes defined by the Subsonic spec. We treat these very differently:
 * auth failures are fatal (retrying against another URL won't help, it's the
 * same server and same credentials), while network failures trigger failover.
 */
export enum SubsonicErrorCode {
  Generic = 0,
  MissingParameter = 10,
  ClientTooOld = 20,
  ServerTooOld = 30,
  WrongCredentials = 40,
  TokenAuthNotSupported = 41,
  NotAuthorized = 50,
  TrialExpired = 60,
  NotFound = 70,
}

// ---------------------------------------------------------------------------
// Library entities
// ---------------------------------------------------------------------------

/** A song/track. Subsonic historically calls this a "Child". */
export interface Child {
  id: string;
  parent?: string;
  isDir: boolean;
  title: string;
  album?: string;
  artist?: string;
  track?: number;
  year?: number;
  genre?: string;
  coverArt?: string;
  /**
   * File size in bytes as stored on the server. This is the ground truth we
   * compare a stream response's Content-Length against to prove that no
   * transcoding happened. See scripts/check-connection.ts.
   */
  size?: number;
  contentType?: string;
  suffix?: string;
  /** Present only when the server intends to transcode — its absence is meaningful. */
  transcodedContentType?: string;
  transcodedSuffix?: string;
  duration?: number;
  bitRate?: number;
  path?: string;
  albumId?: string;
  artistId?: string;
  type?: string;
  /** ISO timestamp; present only when the track is starred/favorited. */
  starred?: string;
  /** OpenSubsonic: bit depth, e.g. 24. Feeds the `FLAC · 24/96` badge. */
  bitDepth?: number;
  /** OpenSubsonic: sample rate in Hz, e.g. 96000. */
  samplingRate?: number;
  /** OpenSubsonic: channel count. */
  channelCount?: number;
  discNumber?: number;
  /** Times played, as counted by the server across every client. */
  playCount?: number;
  /** ISO timestamp of the last play. */
  played?: string;
  /** ISO timestamp the file was added to the library. */
  created?: string;
  /** 1-5, or absent when unrated. */
  userRating?: number;
  bpm?: number;
  comment?: string;
  /** OpenSubsonic: every genre, where `genre` carries only the first. */
  genres?: { name: string }[];
  /** OpenSubsonic: the credited artists as one display string. */
  displayArtist?: string;
}

export interface ArtistSummary {
  id: string;
  name: string;
  albumCount?: number;
  coverArt?: string;
  artistImageUrl?: string;
  starred?: string;
}

/** getArtists groups artists alphabetically into index buckets. */
export interface ArtistIndex {
  name: string;
  artist: ArtistSummary[];
}

export interface ArtistsResponse {
  artists: {
    ignoredArticles?: string;
    index?: ArtistIndex[];
  };
}

export interface AlbumSummary {
  id: string;
  name: string;
  artist?: string;
  artistId?: string;
  coverArt?: string;
  songCount?: number;
  duration?: number;
  year?: number;
  genre?: string;
  starred?: string;
  /** ISO timestamp the album was added — drives "newest" sorting. */
  created?: string;
  /** Navidrome extras, present on getAlbumList2 and getAlbum. */
  playCount?: number;
  played?: string;
  userRating?: number;
  genres?: { name: string }[];
  isCompilation?: boolean;
  displayArtist?: string;
}

/** getArtist returns the artist plus their albums. */
export interface ArtistResponse {
  artist: ArtistSummary & { album?: AlbumSummary[] };
}

/** getAlbum returns the album plus its tracks. */
export interface AlbumResponse {
  album: AlbumSummary & { song?: Child[] };
}

/** getAlbumList2 is paginated (500 max per page) and carries songCount per album. */
export interface AlbumList2Response {
  albumList2: { album?: AlbumSummary[] };
}

export interface SearchResult3Response {
  searchResult3: {
    artist?: ArtistSummary[];
    album?: AlbumSummary[];
    song?: Child[];
  };
}

export interface Playlist {
  id: string;
  name: string;
  comment?: string;
  owner?: string;
  public?: boolean;
  songCount?: number;
  duration?: number;
  created?: string;
  changed?: string;
  coverArt?: string;
}

export interface PlaylistsResponse {
  playlists: { playlist?: Playlist[] };
}

export interface PlaylistResponse {
  playlist: Playlist & { entry?: Child[] };
}

/** getStarred2 — everything the account has favourited. */
export interface Starred2Response {
  starred2: {
    artist?: ArtistSummary[];
    album?: AlbumSummary[];
    song?: Child[];
  };
}

/** getSong. */
export interface SongResponse {
  song: Child;
}

export interface Genre {
  /** The genre's name. Subsonic calls it `value`. */
  value: string;
  songCount?: number;
  albumCount?: number;
}

export interface GenresResponse {
  genres: { genre?: Genre[] };
}

export interface SongsByGenreResponse {
  songsByGenre: { song?: Child[] };
}

export interface RandomSongsResponse {
  randomSongs: { song?: Child[] };
}

export interface TopSongsResponse {
  topSongs: { song?: Child[] };
}

export interface SimilarSongs2Response {
  similarSongs2: { song?: Child[] };
}

export interface SimilarSongsResponse {
  similarSongs: { song?: Child[] };
}

export interface ArtistInfo2 {
  biography?: string;
  musicBrainzId?: string;
  lastFmUrl?: string;
  smallImageUrl?: string;
  mediumImageUrl?: string;
  largeImageUrl?: string;
  /** Similar artists. With includeNotPresent=false, only ones in the library. */
  similarArtist?: ArtistSummary[];
}

export interface ArtistInfo2Response {
  artistInfo2: ArtistInfo2;
}

/** OpenSubsonic `songLyrics` extension: one entry per language/sync variant. */
export interface StructuredLyrics {
  lang?: string;
  synced: boolean;
  /** `start` is in milliseconds and present only on synced lyrics. */
  line?: { start?: number; value: string }[];
  displayArtist?: string;
  displayTitle?: string;
  /** Milliseconds to add to every start. */
  offset?: number;
}

export interface LyricsListResponse {
  lyricsList: { structuredLyrics?: StructuredLyrics[] };
}

export interface ScanStatus {
  scanning: boolean;
  count?: number;
  folderCount?: number;
  /** ISO timestamp, Navidrome extension. */
  lastScan?: string;
}

export interface ScanStatusResponse {
  scanStatus: ScanStatus;
}

