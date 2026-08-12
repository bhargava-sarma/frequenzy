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

/**
 * Trailing slashes would produce `//rest/ping.view`, which some reverse
 * proxies handle badly. A missing scheme is a common typo when entering a
 * bare IP into the setup screen, so we assume http rather than failing.
 */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new ConfigError('Server URL is empty');

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new ConfigError(`Not a valid server URL: ${raw}`);
  }

  return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`;
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
