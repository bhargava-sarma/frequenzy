/**
 * Verifies the LRCLIB client and the LRC parser.
 *
 *   npm run check:lyrics
 *
 * The parser cases run offline; the lookups hit the real LRCLIB API, which
 * needs no credentials — so unlike the other check scripts this one wants no
 * .env and reveals nothing about your server.
 */

import { activeLineIndex, baseTitle, fetchLyrics, parseLrc, primaryArtist } from '../src/api/lrclib';

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ${green('✓')} ${name}`);
  } else {
    failures++;
    console.log(`  ${red('✗')} ${name}`);
    console.log(`      got      ${a}`);
    console.log(`      expected ${e}`);
  }
}

console.log(bold('\n1. LRC PARSING'));

const sample = [
  '[ar:Some Artist]',
  '[ti:Some Song]',
  '[00:12.34]First line',
  '[00:15.00][01:30.50]A refrain',
  '[00:20.5]Tenths only',
  '[00:25.000]Millis',
  '[00:30.00]',
  'no timestamp at all',
  '[00:35.00]bracket [inside] the words',
].join('\n');

const parsed = parseLrc(sample);

check('metadata tags dropped', parsed.some((l) => l.text.startsWith('ar:')), false);
check('untimed line dropped', parsed.some((l) => l.text === 'no timestamp at all'), false);
check('line count', parsed.length, 7);
check('first timestamp', parsed[0].time, 12.34);
check('refrain emitted twice', parsed.filter((l) => l.text === 'A refrain').length, 2);
check('tenths parsed', parsed.find((l) => l.text === 'Tenths only')?.time, 20.5);
check('millis parsed', parsed.find((l) => l.text === 'Millis')?.time, 25);
check('blank gap kept', parsed.find((l) => l.time === 30)?.text, '');
check(
  'brackets inside words survive',
  parsed.find((l) => l.time === 35)?.text,
  'bracket [inside] the words',
);
check(
  'sorted ascending',
  parsed.map((l) => l.time).every((t, i, a) => i === 0 || a[i - 1] <= t),
  true,
);

console.log(bold('\n2. ACTIVE LINE LOOKUP'));
check('before the first line', activeLineIndex(parsed, 0), -1);
check('on the first line', activeLineIndex(parsed, 12.34), 0);
check('between lines holds the earlier', activeLineIndex(parsed, 14.9), 0);
check('past the end holds the last', activeLineIndex(parsed, 9999), parsed.length - 1);
check('empty lyrics', activeLineIndex([], 10), -1);

console.log(bold('\n3. TAG NORMALISATION'));
check('multi-artist split on ;', primaryArtist('24kGoldn; Justin Bieber; J Balvin'), '24kGoldn');
check('slash separator', primaryArtist('A / B'), 'A');
check('ampersand names survive', primaryArtist('Simon & Garfunkel'), 'Simon & Garfunkel');
check('comma names survive', primaryArtist('Earth, Wind & Fire'), 'Earth, Wind & Fire');
check('feat in artist', primaryArtist('Drake feat. Rihanna'), 'Drake');
check('parenthetical variant', baseTitle('Mood (Remix)'), 'Mood');
check('bracket variant', baseTitle('Song [Live]'), 'Song');
check('dash remaster', baseTitle('Bohemian Rhapsody - Remastered 2011'), 'Bohemian Rhapsody');
check('feat in title', baseTitle('Mood (feat. iann dior)'), 'Mood');
check('plain title untouched', baseTitle('Blinding Lights'), 'Blinding Lights');
check('never returns empty', baseTitle('(Remix)'), '(Remix)');

async function main() {
console.log(bold('\n4. LIVE LOOKUPS') + dim(' (lrclib.net)'));

const cases = [
  { trackName: 'Mood (Remix)', artistName: '24kGoldn', duration: 184 },
  { trackName: 'Bohemian Rhapsody', artistName: 'Queen' },
  { trackName: 'Blinding Lights', artistName: 'The Weeknd' },
  {
    trackName: 'Zzzz Not A Real Song Zzzz',
    artistName: 'Nobody At All',
  },
];

for (const query of cases) {
  const label = `${query.artistName} — ${query.trackName}`;
  try {
    const lyrics = await fetchLyrics(query);
    if (!lyrics) {
      console.log(`  ${green('✓')} ${label}\n      ${dim('not in the database (handled as null)')}`);
      continue;
    }
    const kind = lyrics.instrumental
      ? 'instrumental'
      : lyrics.synced
        ? `synced, ${lyrics.lines.length} lines`
        : 'plain only';
    console.log(`  ${green('✓')} ${label}\n      ${dim(kind)}`);
    if (lyrics.synced) {
      const first = lyrics.lines.find((l) => l.text);
      console.log(dim(`      first: [${first?.time.toFixed(2)}s] ${first?.text}`));
    }
  } catch (error) {
    const message = (error as Error).message;
    // LRCLIB is a free community service and rate-limits bursts. A 5xx says
    // nothing about our client, so it must not fail the suite.
    if (/responded 5\d\d/.test(message)) {
      console.log(`  ${dim('~')} ${label}\n      ${dim(`skipped — upstream ${message}`)}`);
    } else {
      failures++;
      console.log(`  ${red('✗')} ${label}\n      ${message}`);
    }
  }

  // Space the requests out; this is someone else's free server.
  await new Promise((resolve) => setTimeout(resolve, 400));
}

console.log(bold('\nRESULT'));
if (failures === 0) {
  console.log(`  ${green('✓')} ${bold('Parser and lookups behave.')}\n`);
} else {
  console.log(`  ${red('✗')} ${failures} check(s) failed.\n`);
  process.exit(1);
}
}

main().catch((error) => {
  console.error(red(`\nUnexpected failure: ${(error as Error).message}\n`));
  process.exit(1);
});
