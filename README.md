# Frequenzy

A personal Android client for [Navidrome](https://www.navidrome.org/), built for
one thing above all: **playing a self-hosted FLAC library without ever
transcoding it.**

It exists because the Subsonic clients I tried either re-encoded audio behind my
back, or made queueing tracks a chore. So this one enforces losslessness at the
API layer and gives you a way to prove it, and it treats the queue as a
first-class interaction rather than a settings-menu afterthought.

Built with Expo and React Native, against the Subsonic API (1.16.1).

> **Personal project.** It is designed around one server, one user, and one
> library — mine. It is public because the approach may be useful, not because
> it is a general-purpose product.

---

## Contents

- [What it does](#what-it-does)
- [The lossless guarantee](#the-lossless-guarantee)
- [Connectivity: one server, two addresses](#connectivity-one-server-two-addresses)
- [Lyrics and romanisation](#lyrics-and-romanisation)
- [Design](#design)
- [Getting started](#getting-started)
- [Updating the app](#updating-the-app)
- [Verification scripts](#verification-scripts)
- [Project structure](#project-structure)
- [Security notes](#security-notes)
- [Tech stack](#tech-stack)
- [License](#license)

---

## What it does

**Library** — Browse by artist, album or playlist, and search across tracks,
albums and artists. Lists page in on demand rather than pulling the whole
library into memory, and everything is cached locally and refetched when stale.

**Playback** — Background playback with lock-screen, notification and Android
Auto controls, handled natively so they keep working when Android has reclaimed
the JS runtime.

**Queue** — A two-tier queue modelled on Apple Music. Playing an album replaces
the queue with it; anything you swipe in by hand keeps its place *ahead* of
what's left, so a deliberate pick is never buried behind forty album tracks.
Swipe right on any row to queue it, left to star it.

**Synced to the server, not just the device** — Favourites, full playlist
create/rename/delete/reorder, and scrobbles all write back to Navidrome, so
they are reflected everywhere rather than trapped in this app. Scrobbling
follows the Last.fm thresholds every Subsonic server expects: half the track or
four minutes, whichever comes first, and never under 30 seconds.

**Lyrics** — Time-synced lyrics from [LRCLIB](https://lrclib.net), scrolling
with the track. The current line is the only thing on screen in the accent
colour, and tapping any line seeks to it. Lyrics in another script are
romanised beneath the original — transliteration, not translation, so the line
stays singable rather than becoming prose you can't follow. See
[Lyrics and romanisation](#lyrics-and-romanisation).

**Also** — Play-history charts on Home (day/week/month/year), recent searches,
light/dark/AMOLED themes, and a diagnostics screen.

---

## The lossless guarantee

This is the core requirement, so it is enforced in one place and verifiable
from three.

Every stream request explicitly sends `format=raw` and `maxBitRate=0`. Both are
sent on *every* request rather than trusted to defaults — omitting either lets
a server-side or per-player transcoding profile silently downgrade the stream:

```ts
// src/api/client.ts
async getStreamUrl(songId: string): Promise<string> {
  const connection = await this.ensureConnection();
  return this.buildUrl(connection.url, 'stream', {
    id: songId,
    format: 'raw',
    maxBitRate: 0,
  });
}
```

Asserting it is not the same as proving it, so `probeStream()` issues a
`Range: bytes=0-1` request and reads the total size out of the `Content-Range`
header, without ever buffering the audio. Comparing that total against the
`size` Navidrome reports for the file is the actual proof: **a transcoded
stream cannot coincidentally match the source file's byte count.**

You can check it three ways:

| Where | How |
| --- | --- |
| On device | Diagnostics screen — probes a real track and shows both byte counts side by side |
| From a laptop | `npm run check:connection` |
| At a glance | The `FLAC · 24/96` badge on Now Playing, read from the stream itself |

There is deliberately **no quality setting**. A control that could silently
downgrade playback is the thing this app exists to avoid.

---

## Connectivity: one server, two addresses

The same Navidrome server is reachable on the home LAN and remotely over
Tailscale. That is modelled as **one server config with two candidate URLs and
one credential set** — never as "two profiles", which invites divergent caches
and a confusing "which am I in?" question.

Address selection races the two with a head start for local, the same
[Happy Eyeballs](https://www.rfc-editor.org/rfc/rfc8305) approach browsers use
for IPv6/IPv4:

- Local is dialled first. At home it answers in ~160ms — well inside the
  stagger — so the remote address is never contacted at all.
- If local hasn't answered within the stagger (400ms default), remote is dialled
  in parallel rather than waiting for local to time out.
- The winner is cached, and re-probed when the app returns to the foreground —
  the phone may have moved between Wi-Fi and cellular while backgrounded.

Probing strictly in sequence was the obvious first approach and the wrong one:
whenever the LAN address is absent — i.e. any time you are away from home —
every cold start burned the full local timeout before remote was even dialled.
Measured on device over 5G, that was **2.6s to first byte**, nearly all of it
spent waiting for a timeout that was entirely predictable.

A flat parallel race would have been simpler still, but would have defeated the
intent: Tailscale often beats the LAN on latency and would win the race while
you are sitting at home.

There is no SSID or network-state detection anywhere. Failover lives entirely
in the API client, so nothing above it needs to know which address won.

---

## Lyrics and romanisation

Lyrics come from LRCLIB, which is deliberately kept outside the Subsonic
client: a different host, no auth, no failover. A lyrics outage must never be
able to look like the music server going down.

Matching a local library to a lyrics database is most of the work. LRCLIB's
exact endpoint keys on artist, track, album and duration together, so it misses
whenever the tags carry a subtitle the release doesn't. A search recovers those,
and a final pass normalises the tags — Navidrome lists every credited artist
joined by ID3 separators (`24kGoldn; Justin Bieber; J Balvin`) while LRCLIB
files under the lead alone, and library titles carry variants (`Mood (Remix)`,
`- Remastered 2011`) that LRCLIB usually omits. Duration guards every loosened
search, so a live cut or a different edit is rejected rather than shown against
timings it doesn't fit.

Misses are cached as well as hits. Most of any library will never be in LRCLIB,
and without recording that, every play of those tracks costs two requests to
someone else's free server to learn the same thing again. Misses expire after
two weeks since the database grows; hits don't, since lyrics for a fixed
recording don't change.

**Romanisation** is transliteration, never translation. The general-purpose
libraries were measured and rejected: they drop Devanagari's inherent vowel, so
`कमल` becomes `kml` rather than `kamal`. Instead Sanscript produces full IAST
and the app supplies what IAST leaves out — schwa deletion for Indo-Aryan
scripts and deliberately *not* for Dravidian ones, where final vowels are
pronounced; candrabindu as a real nasal; and IAST `c` remapped to `ch`, since
bare `c` would have every "chai" misread. Hangul uses the algorithmic Revised
Romanization. Cyrillic, Greek and Arabic fall back to a general transliterator.
Japanese kanji stays approximate — reading it properly needs a dictionary far
too large to ship.

```
तुम ही हो, अब तुम ही हो   ->  tum hi ho, ab tum hi ho
दिल तो पागल है            ->  dil to pagal hai
ਤੇਰੇ ਬਿਨ ਨਹੀਂ ਲਗਦਾ ਦਿਲ     ->  tere bin nahin lagda dil
నువ్వు నాకు నచ్చావు        ->  nuvvu naku nachchavu
사랑해 그대여              ->  saranghae geudaeyeo
```

---

## Design

The visual language is **Teenage Engineering** — panel-like, grid-aligned and
functional. Near-monochrome, tracked-out uppercase labels for metadata, tabular
numerals so running timers don't jitter, tight corner radii, and no gradients,
soft shadows or skeuomorphism.

Two surfaces: a dark **panel** for the player and transport, a light **paper**
for browsing. One accent, used only for meaning — playback state, favourited,
selected, progress — never for decoration.

Two deliberate departures from the original spec, both driven by use:

- **The accent is derived from the current cover art.** Artwork is decoded in
  pure JS, its dominant hue extracted and whitewashed to stay subtle, then
  crossfaded over five seconds as tracks change. Ink colour is chosen by
  *measured* WCAG contrast rather than a lightness threshold, which keeps text
  legible against any cover. It can be pinned back to the fixed burnt orange in
  Settings.
- **Motion is anchored to your finger.** Opening the player, an album, a
  playlist or Settings expands the new surface out of the exact spot you
  pressed, rather than sliding in from a screen edge.

Motion is mechanical throughout — timing curves, no spring or bounce.

---

## Getting started

### Prerequisites

- Node 20+ and npm
- A running Navidrome server with a user account
- An Android device or emulator

> **Expo Go will not work.** The audio engine (`@rntp/player`) is a native
> TurboModule, so a development build is required.

### Install and run

```bash
git clone https://github.com/bhargava-sarma/frequenzy.git
cd frequenzy
npm install
```

Build and install a development client on your device (once per native
dependency change):

```bash
npx eas build --profile development --platform android
```

Then start the bundler and open the installed dev client:

```bash
npm start
```

For an installable APK you can hand to a device without the bundler running:

```bash
npx eas build --profile preview --platform android
```

### Connecting to your server

Server details are entered **in the app**, on first launch — not in a config
file. You will need your server address (including scheme and port, e.g.
`http://192.168.1.10:4533`), optionally a second address for remote access, and
your Navidrome username and password.

Credentials go to the device keystore via `expo-secure-store`, which on Android
is SharedPreferences encrypted with an Android Keystore key — not readable from
a backup or by another app.

---

## Updating the app

The app ships with over-the-air updates, so most changes reach the phone
without a build:

```bash
npx eas update --branch preview --environment preview -m "what changed"
```

That takes about 30 seconds and applies on next launch — no dev server, and
nothing needs to be on the local network.

A **rebuild is required** whenever dependencies or native config change, not
just when native code does. `runtimeVersion` uses the fingerprint policy, which
hashes the native dependency set, and a new package can't be known to be
pure JS in advance. When the fingerprint moves, the update is simply not
offered to older builds — a no-op rather than a crash, which is the reason for
choosing that policy over `appVersion`.

So: editing existing files ships over the air; adding a library needs
`eas build`.

---

## Verification scripts

Three scripts run the app's real modules from a laptop under Node, so the data
layer can be proven without a device in the loop.

```bash
npm run check:connection   # failover + losslessness against your server
npm run check:cache        # repository caching, fully offline
npm run check:scrobble     # scrobble path and play-derived shelves
npm run check:lyrics       # LRC parsing, tag normalisation, romanisation
```

`check:connection` and `check:scrobble` need a `.env`:

```bash
cp .env.example .env
```

`.env` is gitignored. Its values are read **only** by these scripts, and are
deliberately not prefixed `EXPO_PUBLIC_` — that prefix would inline them into
the app bundle, where anyone with the APK could read them.

Both scripts redact auth parameters from every URL they print, so their output
is safe to paste into an issue. `check:scrobble` only sends `submission=false`
— the "now playing" ping, which Navidrome displays live and does not record —
so it will not touch your play counts.

---

## Project structure

```
src/
  api/          Subsonic client, auth, URL failover, typed errors
  components/   Design-system primitives and shared UI
  data/         Library repository, caching, play history
  hooks/        Artwork URLs, paged lists, library fetching
  navigation/   Stacks, tabs, route types
  player/       Setup, track mapping, scrobbler
  screens/      One file per surface
  storage/      Keystore credentials, AsyncStorage cache
  store/        Zustand stores (player, playlists, server, UI)
  theme/        Tokens, provider, artwork colour extraction
  utils/        Formatting helpers
scripts/        Node verification scripts
```

Two structural decisions worth knowing:

**The player is not a navigation screen.** It renders in an overlay above the
navigator. Android's native stack detaches the screen underneath, which left a
black rectangle behind on swipe-down dismissal — and a stack can only slide a
screen in from an edge, when what this needs is to expand out of the control you
pressed. As an overlay it unmounts nothing, so there is nothing left unpainted.

**The API client and design tokens avoid platform imports.** Both are structured
to be liftable into a shared package if a web client follows.

---

## Security notes

- **No credentials, tokens or server addresses in the repository.** Server
  details are entered at runtime and stored in the device keystore. The
  `.env` used by the dev scripts is gitignored; `.env.example` is the committed
  template and holds only placeholder addresses.
- **Nothing secret is inlined into the bundle.** No `EXPO_PUBLIC_` variable
  carries a credential.
- Subsonic token auth is used (`t=md5(password+salt)`, `s=salt`) rather than
  sending the password on each request.
- `usesCleartextTraffic` is enabled, because Navidrome over a LAN or Tailscale
  address typically has no TLS certificate. Both are private networks; do not
  point this at a plaintext server across the public internet.

---

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | Expo SDK 57, React Native 0.86, React 19 |
| Language | TypeScript 6 (`strict`) |
| Audio | `@rntp/player` 5 (TurboModule, Media3) |
| Navigation | React Navigation 7 |
| State | Zustand 5 |
| Animation | Reanimated 4, Gesture Handler 2 |
| Images | `expo-image` |
| Storage | `expo-secure-store`, AsyncStorage |
| Server API | Subsonic 1.16.1 (Navidrome) |
| Lyrics | LRCLIB, Sanscript (IAST), Hangul RR, any-ascii |
| Delivery | EAS Build + EAS Update (fingerprint runtime) |

---

## License

MIT.
