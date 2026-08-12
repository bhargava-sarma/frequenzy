import { md5 } from 'js-md5';

/**
 * Subsonic token authentication (the salt+token scheme, not legacy plaintext).
 *
 * Per the spec: token = md5(password + salt), and the salt travels alongside
 * it in the clear. We send `t` and `s` and never `p`, so the password itself
 * is not in any URL, query log, or reverse-proxy access log.
 *
 * SECURITY NOTE, since both configured addresses use plain http://:
 * the salt+token pair is replayable by anyone who can observe the traffic,
 * and is offline-brute-forceable back to the password. Over Tailscale this is
 * a non-issue — WireGuard already encrypts the whole path. On home Wi-Fi the
 * requests are readable by other devices on the LAN. For a personal server on
 * a trusted network that is a reasonable trade, but it's a real property of
 * the setup rather than something the token scheme fixes.
 *
 * js-md5 is a pure-JS implementation on purpose: it behaves identically under
 * Node, React Native, and the browser, so this file needs no changes when the
 * web app phase starts. expo-crypto would work on-device but is async and
 * would not run in the Node test scripts.
 */

/** Subsonic API version we speak. 1.16.1 is what Navidrome reports. */
export const SUBSONIC_API_VERSION = '1.16.1';

/**
 * Client identifier sent as `c` on every request.
 *
 * This is NOT cosmetic: Navidrome creates a "Player" entry per client name and
 * stores per-player transcoding preferences against it. A second name would
 * get its own player row with its own settings, so a lossless result verified
 * under one name would say nothing about the other. Every caller — app and dev
 * scripts alike — must use this exact constant.
 */
export const CLIENT_NAME = 'music-app';

const SALT_LENGTH = 12;
const SALT_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * The salt is transmitted in cleartext by design, so it needs to be unique
 * per request rather than unpredictable. We still prefer a CSPRNG where the
 * platform offers one and fall back to Math.random where it doesn't.
 */
function randomSalt(length = SALT_LENGTH): string {
  const cryptoObj = globalThis.crypto;

  if (typeof cryptoObj?.getRandomValues === 'function') {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    return Array.from(bytes, (b) => SALT_ALPHABET[b % SALT_ALPHABET.length]).join('');
  }

  let out = '';
  for (let i = 0; i < length; i++) {
    out += SALT_ALPHABET[Math.floor(Math.random() * SALT_ALPHABET.length)];
  }
  return out;
}

export interface AuthParams {
  u: string;
  t: string;
  s: string;
  v: string;
  c: string;
  f: 'json';
}

/** Builds a fresh salt+token pair. Call per request; never cache the token. */
export function buildAuthParams(username: string, password: string): AuthParams {
  const salt = randomSalt();
  return {
    u: username,
    t: md5(password + salt),
    s: salt,
    v: SUBSONIC_API_VERSION,
    c: CLIENT_NAME,
    f: 'json',
  };
}
