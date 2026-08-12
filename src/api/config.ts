/**
 * Server configuration.
 *
 * Deliberately modelled as ONE server that happens to be reachable at up to
 * two addresses — not as two profiles. There is a single credential pair and
 * a single library; only the transport address varies depending on whether
 * we're on home Wi-Fi or coming in over Tailscale.
 */

export type ConnectionKind = 'local' | 'remote';

export interface ServerConfig {
  /** Optional friendly name, purely cosmetic (e.g. "Home"). */
  nickname?: string;
  /** LAN address, tried first. */
  localUrl?: string;
  /** Tailscale address, used when the local one doesn't answer. */
  remoteUrl?: string;
  username: string;
  password: string;
}

export interface UrlCandidate {
  kind: ConnectionKind;
  url: string;
}

export class ConfigError extends Error {}

/** scheme :// host[:port] [/path] — deliberately strict about the whole string. */
const BASE_URL_PATTERN = /^(https?):\/\/([^/?#\s]+)(\/[^?#\s]*)?$/i;

/**
 * Normalizes a user-entered server address.
 *
 * Parsed by regex rather than `new URL()` on purpose. React Native ships a
 * regex approximation of URL rather than a spec-compliant parser, so the same
 * input can normalize differently under Node and on-device. Doing it by hand
 * keeps this module identical across Node, React Native, and the browser —
 * which is the point of keeping `api/` free of platform assumptions.
 *
 * Trailing slashes are stripped because they would produce `//rest/ping.view`,
 * which some reverse proxies mishandle. A missing scheme is assumed to be http
 * rather than rejected, since typing a bare IP into the setup screen is the
 * common case.
 */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new ConfigError('Server URL is empty');

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const match = BASE_URL_PATTERN.exec(withScheme);

  if (!match) throw new ConfigError(`Not a valid server URL: ${raw}`);

  const [, scheme, authority, path = ''] = match;
  return `${scheme.toLowerCase()}://${authority}${path.replace(/\/+$/, '')}`;
}

/**
 * Returns the addresses to try, in priority order: local first, then remote.
 *
 * Ordering is the entire failover policy — we never sniff the network to
 * guess where we are. Trying the LAN address and letting it time out is
 * self-correcting and needs no Android permissions, which is the tradeoff
 * this design accepts on purpose.
 */
export function resolveCandidates(config: ServerConfig): UrlCandidate[] {
  const candidates: UrlCandidate[] = [];

  if (config.localUrl?.trim()) {
    candidates.push({ kind: 'local', url: normalizeBaseUrl(config.localUrl) });
  }
  if (config.remoteUrl?.trim()) {
    candidates.push({ kind: 'remote', url: normalizeBaseUrl(config.remoteUrl) });
  }

  if (candidates.length === 0) {
    throw new ConfigError('At least one of localUrl or remoteUrl must be set');
  }
  if (!config.username?.trim()) {
    throw new ConfigError('Username is required');
  }
  if (!config.password) {
    throw new ConfigError('Password is required');
  }

  return candidates;
}
