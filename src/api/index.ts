/**
 * Public surface of the API layer.
 *
 * Screens and stores should import from here rather than reaching into
 * individual files, so the internal layout stays free to change — and so this
 * directory can be lifted into a shared package for the web app later.
 */

export { SubsonicClient } from './client';
export type {
  ConnectionState,
  QueryParams,
  StreamProbe,
  SubsonicClientOptions,
} from './client';

export { normalizeBaseUrl, resolveCandidates, ConfigError } from './config';
export type { ConnectionKind, ServerConfig, UrlCandidate } from './config';

export { CLIENT_NAME, SUBSONIC_API_VERSION, buildAuthParams } from './auth';

export {
  ApiError,
  NoReachableServerError,
  NotASubsonicServerError,
  SubsonicError,
  TransportError,
} from './errors';

export type * from '../types/subsonic';
export { SubsonicErrorCode } from '../types/subsonic';
