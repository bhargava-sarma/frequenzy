import { SubsonicErrorCode } from '../types/subsonic';

/**
 * Error taxonomy for the Subsonic client.
 *
 * The distinction that matters most is `isFailoverWorthy`. Our connectivity
 * model tries the local URL first and falls back to the remote one — but
 * falling back is only sensible when the *transport* failed. Both URLs point
 * at the same Navidrome instance with the same credentials, so if the server
 * answered and rejected our login, retrying the other address just produces
 * the same rejection more slowly.
 */
export abstract class SubsonicError extends Error {
  abstract readonly isFailoverWorthy: boolean;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The server could not be reached at all: DNS failure, connection refused,
 * timeout, or a response that wasn't a Subsonic envelope. Worth failing over.
 */
export class TransportError extends SubsonicError {
  readonly isFailoverWorthy = true;

  constructor(
    message: string,
    readonly baseUrl: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

/**
 * Something answered at this address, but it isn't Navidrome — this is the
 * case that makes naive "is the LAN IP reachable?" checks dangerous. On a
 * café network, 192.168.x.x may well resolve to *someone else's* router.
 * Treated as a transport failure so we fail over to the remote URL.
 */
export class NotASubsonicServerError extends TransportError {
  constructor(baseUrl: string, detail: string) {
    super(`Address responded but is not a Subsonic server: ${detail}`, baseUrl);
  }
}

/**
 * Navidrome answered with a Subsonic-level error. Not worth failing over:
 * the server is up and has made a decision about our request.
 */
export class ApiError extends SubsonicError {
  readonly isFailoverWorthy = false;

  constructor(
    readonly code: SubsonicErrorCode,
    message: string,
    readonly endpoint: string,
  ) {
    super(`Subsonic error ${code} on ${endpoint}: ${message}`);
  }

  /** Bad username/password, or an account lacking permission. */
  get isAuthError(): boolean {
    return (
      this.code === SubsonicErrorCode.WrongCredentials ||
      this.code === SubsonicErrorCode.NotAuthorized ||
      this.code === SubsonicErrorCode.TokenAuthNotSupported
    );
  }
}

/** Every candidate URL was tried and none worked. */
export class NoReachableServerError extends SubsonicError {
  readonly isFailoverWorthy = false;

  constructor(readonly attempts: { url: string; error: string }[]) {
    super(
      `Could not reach the server at any configured address:\n` +
        attempts.map((a) => `  - ${a.url}: ${a.error}`).join('\n'),
    );
  }
}
