# Design spec — home music player (mobile + web)

Style reference: Teenage Engineering. Panel-like, grid-aligned, functional.
Near-monochrome base, one accent color, tracked-out uppercase labels for
metadata, tabular numerals for time/counters. No gradients, no soft shadows,
no skeuomorphism. Corners stay tight (hardware-faceplate feel, not "app" feel).

---

## 1. Color tokens

Two surfaces: a dark "panel" surface for the player/transport, a light "paper"
surface for browsing/library. One accent used sparingly for state, not decoration.

```
--color-paper:        #EFECE4   // light surface (library, lists, nav)
--color-paper-dim:     #DCD8CB  // artwork placeholders, inactive fills
--color-paper-line:    #D8D5C9  // hairline borders on light surface

--color-panel:         #1A1A18  // dark surface (now playing, transport)
--color-panel-raised:  #2C2C29  // cards/art wells on dark surface
--color-panel-line:    #3A3A36  // hairline borders on dark surface

--color-text-primary:  #1A1A18  // on paper
--color-text-secondary:#8C8B84  // on paper, secondary/meta
--color-text-inverse:  #EFECE4  // on panel
--color-text-inverse-2:#8C8B84  // on panel, secondary/meta (same value works both ways)

--color-accent:        #E8703A  // burnt orange — progress fill, primary
                                 // action (play), active/favorited state,
                                 // selection. Nothing else uses it.
--color-accent-ink:    #1A1A18  // text/icon color when placed ON accent fill
```

Dark mode: for the web app, treat `--color-paper` and `--color-panel` as
already-fixed roles rather than swapping per OS theme — the player is
*always* the dark panel, the library is *always* the light paper. This is a
deliberate two-zone design, not a light/dark toggle. If you want a true dark
mode later, invert paper (paper→near-black, panel stays dark) but keep the
accent identical — don't add a second accent hue.

Accent usage rule: **one accent, used only for meaning** — active playback
state, favorited, selected/queued, progress. Never used for decorative
backgrounds or large fills. If more than ~10% of a screen is accent-colored,
it's being overused.

---

## 2. Typography

Single geometric/grotesk family, two weights only (Regular 400, Medium 500).
Recommended: **Inter** (free, wide platform support, good tabular-figure
support) or **Neue Haas Grotesk / Suisse Int'l** if licensing allows —
Inter is the pragmatic default for a solo build.

```
--font-family: 'Inter', -apple-system, sans-serif;
--font-family-mono: 'Inter', monospace;  // use tabular-nums feature, not a
                                          // separate mono face, for numerals
```

Type scale (mobile):

| Token | Size | Weight | Letter-spacing | Use |
|---|---|---|---|---|
| `display` | 20px | 500 | 0 | Track title on Now Playing |
| `title` | 16px | 500 | 0 | Album/playlist titles, list primary text |
| `body` | 13px | 500 | 0 | List rows, standard UI text |
| `label` | 11px | 500 | 0.08em (uppercase) | Section headers: "NOW PLAYING", "LIBRARY" |
| `meta` | 11-12px | 400 | 0.02–0.04em | Artist name, secondary row text |
| `numeral` | 10-11px | 400 | 0.05em | Timestamps — always `font-variant-numeric: tabular-nums` |

Rule: labels and section headers are UPPERCASE with wide tracking (this is
the single strongest "panel" signal). Titles and body text are sentence
case, never uppercase. Don't uppercase everything — that reads as shouting,
not as hardware.

---

## 3. Spacing & grid

8px base unit. Everything snaps to it.

```
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-5: 20px
--space-6: 24px
```

- Screen padding: 16-20px horizontal
- Card/panel internal padding: 16px
- List row height: 56-60px (44px min tap target + padding)
- Gaps between stacked elements: 12-16px

---

## 4. Corner radius

Kept tight — this is what separates "hardware panel" from "generic app."

```
--radius-sm: 4px    // buttons, pills, small chips
--radius-md: 6px     // cards, artwork wells, the main panel container
--radius-full: 999px // only for genuinely circular controls (play button,
                       // avatar, favorite toggle) — never for rectangular
                       // cards or buttons
```

Do not use 12-16px "app-standard" rounded rects anywhere. If a corner looks
soft, it's wrong for this design.

---

## 5. Core components

### 5.1 Now Playing panel (dark surface)
- Full-bleed dark panel (`--color-panel`), radius `--radius-md` if inset in
  a screen, full-bleed with no radius if it's a full screen
- Top row: label `NOW PLAYING` (left) / format badge e.g. `FLAC · 24/96`
  (right) — this format badge is a deliberate nod to hardware spec
  readouts, and doubles as a lossless confirmation for you
- Square artwork well, `--color-panel-raised` fill with `--color-panel-line`
  hairline border, `--radius-md`. Show a placeholder icon (disc/vinyl
  glyph) when no art is cached — never stretch/crop art awkwardly
- Track title (`display`), artist (`meta`, secondary color) — sentence case
- Progress bar: 3px height, `--color-panel-line` track,
  `--color-accent` fill, `--radius-sm`. Time labels below in `numeral`
  style, tabular, current time left / remaining time right (as
  `-MM:SS` countdown — a nice hardware-readout touch)
- Transport row: shuffle (secondary icon) — prev — play/pause (filled
  circle, `--color-accent` bg, `--radius-full`, icon in `--color-accent-ink`)
  — next — repeat (secondary icon). Prev/next/play icons at ~20px, shuffle/
  repeat at ~18px and dimmed when inactive

### 5.2 Library / list rows (light surface)
- Row: 40px square thumbnail (`--color-paper-dim` fill, `--radius-sm`) +
  title (`body`, primary text) + meta line (`meta`, secondary text,
  format: `ARTIST · DURATION` or `MOOD · N TRACKS`) + trailing action icon
- Trailing action: heart outline (idle) / heart filled in `--color-accent`
  (favorited) — or a circular `+` button in accent fill for "add to queue"
  contexts
- Row separator: 0.5px hairline (`--color-paper-line`), full-bleed under
  content, not inset
- Section header above a list: `label` style, `LIBRARY` left /
  count right, e.g. `128 ALBUMS`

### 5.3 Swipe-to-queue interaction (your key UX requirement)
- Swipe right on a row → reveal "add to queue" affordance, accent-colored
  background reveal with a `+` icon, snap-back after action (mechanical,
  not bouncy — 150-200ms ease-out, no spring/overshoot)
- Swipe left → reveal "favorite" or "remove" depending on context
- Full swipe past threshold auto-commits the action; partial swipe
  snaps back
- Use `react-native-gesture-handler` + `reanimated` on mobile;
  on web, a pointer-based drag with the same visual language (or simplify
  to a hover-revealed action button, since swipe is a mobile-native
  pattern — don't force swipe gestures onto desktop web)

### 5.4 Bottom navigation (mobile)
- Icon-only, four items: Home, Search, Library, Queue — no labels
  (consistent with the minimal panel language)
- Active tab: primary text color icon; inactive: secondary/muted
- No active-state background pill or underline — color contrast alone
  signals state, keeping it flat

### 5.5 Buttons & controls generally
- Primary action (play, confirm): filled `--color-accent`,
  `--color-accent-ink` icon/text, `--radius-full` if circular /
  `--radius-sm` if rectangular
- Secondary action: outline only, 0.5-1px `--color-panel-line` or
  `--color-paper-line` border depending on surface, no fill
- Never more than one accent-filled control visible per screen at once —
  this mirrors general restraint principles and keeps the accent meaningful

---

## 6. Motion

Mechanical, not bouncy. Toggle-switch feel, not iOS jelly.

```
--duration-fast: 100ms
--duration-base: 180ms
--easing: cubic-bezier(0.2, 0, 0.2, 1)   // snappy ease-out, no overshoot
```

- No spring physics, no elastic/bounce easing anywhere
- Swipe actions and screen transitions: 150-200ms, ease-out
- Play/pause icon swap: instant or 100ms crossfade, no scale-bounce

---

## 7. Iconography

Line-based, consistent stroke weight, geometric — no filled/duotone icon
sets except where deliberately used for filled-state (e.g. filled heart
when favorited, filled play triangle inside the accent circle).
Recommended: **Tabler Icons** (outline set) — free, huge coverage, matches
this spec's minimal line language, easy to drop into React Native via
`@tabler/icons-react-native` or as SVGs.

---

## 8. What this spec deliberately excludes

- No gradients, drop shadows, blur, or glow anywhere
- No skeuomorphic textures (no fake vinyl grooves, no brushed metal)
- No dark-mode toggle — the two-zone paper/panel split *is* the design
- No more than one accent hue — do not add a second "info" or "success"
  color; if a new state is needed, use grayscale weight/opacity shifts
  on the existing palette instead of a new hue
