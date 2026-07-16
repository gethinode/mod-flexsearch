/*
  Asserts the invariants of the generated FlexSearch index. Wired into `pnpm test`
  after the exampleSite build, so a regression in GetSearchDocs.html fails the build
  (and the pre-commit hook) instead of shipping silently.
*/
import { readFile } from 'node:fs/promises'

const INDEX = 'exampleSite/public/js/flexsearch-index.en.json'
const MAX_DESCRIPTION = 100
const ELLIPSIS = '...'
const MAX_LENGTH = MAX_DESCRIPTION + ELLIPSIS.length

const failures = []
const fail = (msg) => failures.push(msg)
const excerpt = (s) => JSON.stringify(s.slice(0, 60))

let docs
try {
  docs = JSON.parse(await readFile(INDEX, 'utf8'))
} catch (err) {
  console.error(`unable to read ${INDEX}: ${err.message}`)
  console.error('run `pnpm build` first, and confirm the exampleSite publishes the search index asset')
  process.exit(1)
}

if (!Array.isArray(docs) || docs.length === 0) {
  fail(`${INDEX} holds no documents; the exampleSite build did not populate the index`)
}

for (const doc of docs) {
  const description = doc.description ?? ''
  const where = `"${doc.title}"`

  // A page that demos the search UI inside its own content embeds the deferred
  // search-index publisher in .Content, which leaves a raw templates.Defer
  // placeholder (`__hdeferred/<id>__d=`) in the .Plain that GetSearchDocs.html
  // reads inside the deferred block. GetSearchDocs.html strips it; a leak here
  // means that strip regressed. Checked on every field of every doc.
  for (const [field, value] of Object.entries(doc)) {
    if (typeof value === 'string' && value.includes('__hdeferred')) {
      fail(`${where}: ${field} leaks a templates.Defer placeholder — ${excerpt(value)}`)
    }
  }

  // Hugo caps by rune, not UTF-16 code unit; count runes here too, otherwise a
  // correctly-capped description containing astral characters (e.g. emoji) would
  // false-fail against a .length that runs ahead of the true rune count.
  const runeLength = [...description].length
  if (runeLength > MAX_LENGTH) {
    fail(`${where}: description is ${runeLength} chars, over the ${MAX_LENGTH} limit — ${excerpt(description)}`)
  }
  if (/&[a-z]+;|&#\d+;/i.test(description)) {
    fail(`${where}: description carries an undecoded HTML entity — ${excerpt(description)}`)
  }
  // JS's \s covers tabs, newlines, NBSP, the wider Unicode space-separator family, and
  // the line/paragraph separators U+2028/U+2029, so [^\S ] flags any whitespace character
  // other than a plain ASCII space (the alternation also flags runs of 2+ spaces). This is
  // not literally identical to the Hugo collapse class in GetSearchDocs.html — Go's `\s`
  // is ASCII-only, so that partial spells out \p{Zs}/\p{Zl}/\p{Zp} plus a few explicit
  // code points (\x{000B}, \x{0085}, \x{FEFF}) to cover the rest — but the Hugo class is a
  // superset of everything this pattern flags, so nothing that trips this assertion can
  // survive the collapse.
  if (/[^\S ]| {2}/.test(description)) {
    fail(`${where}: description carries uncollapsed whitespace — ${excerpt(description)}`)
  }
  if (description !== description.trim()) {
    fail(`${where}: description is not trimmed — ${excerpt(description)}`)
  }
}

/*
  The fixture page proves the cap actually engages. Without this check the assertions
  above would pass vacuously if the fixture ever stopped producing a long summary.
*/
const fixture = docs.find((doc) => doc.title === 'Sixth page')
if (!fixture) {
  fail('fixture page "Sixth page" is missing from the index')
} else if (!fixture.description.endsWith(ELLIPSIS)) {
  fail(`fixture "Sixth page" was not truncated, so the cap is not engaging — ${excerpt(fixture.description)}`)
}

/*
  "Seventh page" carries a frontmatter description with an apostrophe, an ampersand, a
  double quote and an HTML tag — the only fixture that can trip the undecoded-entity
  assertion above. Without it, that assertion passes vacuously on every other page.
*/
const seventh = docs.find((doc) => doc.title === 'Seventh page')
if (!seventh) {
  fail('fixture page "Seventh page" is missing from the index')
} else {
  if (!seventh.description.endsWith(ELLIPSIS)) {
    fail(`fixture "Seventh page" was not truncated, so the cap is not engaging — ${excerpt(seventh.description)}`)
  }
  if (!seventh.description.includes("'") || !seventh.description.includes('&') || !seventh.description.includes('"')) {
    fail(`fixture "Seventh page" lost its apostrophe/ampersand/quote — ${excerpt(seventh.description)}`)
  }
  // Pinned to the exact string on purpose: word-boundary truncation cuts after "to",
  // yielding "...long enough to...". A regression that swaps `truncate` for a
  // `substr`-based mid-word cut (the exact change a previous reviewer recommended)
  // would instead yield "...long enough to fo...", which is a *different* string of
  // the *same* length — the generic length/ellipsis/entity checks above would not
  // catch it. Only an exact match on the full string guards the word-boundary
  // requirement itself.
  const SEVENTH_EXPECTED = 'Learn how to use Hinode\'s card shortcode & the "table" helper, plus tags and a tail long enough to...'
  if (seventh.description !== SEVENTH_EXPECTED) {
    fail(`fixture "Seventh page" description does not match the pinned word-boundary-truncated string — got ${excerpt(seventh.description)}, expected ${excerpt(SEVENTH_EXPECTED)}`)
  }
}

/*
  "Eighth page" carries a long CJK frontmatter description, to prove truncation caps by
  rune, not by byte — a byte-based cut would either overshoot the limit or corrupt a
  multi-byte character.
*/
const eighth = docs.find((doc) => doc.title === 'Eighth page')
const MIN_CJK_RUNE_LENGTH = 90
if (!eighth) {
  fail('fixture page "Eighth page" is missing from the index')
} else {
  if (!eighth.description.endsWith(ELLIPSIS)) {
    fail(`fixture "Eighth page" was not truncated, so the cap is not engaging — ${excerpt(eighth.description)}`)
  }
  // A lower bound, not just endsWith(ELLIPSIS): `endsWith('...')` alone holds for ANY
  // cut length, so it does not distinguish a rune-based cut (~103 runes for this
  // fixture) from a byte-based cut (each CJK character is 3 UTF-8 bytes, so a
  // byte-based truncate would cut far short of the rune cap while still ending in
  // "..."). Rune-count this too — `.length` counts UTF-16 code units, which for BMP
  // CJK characters equals rune count, but using `[...str].length` keeps the check
  // correct and consistent with the rune-counting used for MAX_LENGTH above.
  const eighthRuneLength = [...eighth.description].length
  if (eighthRuneLength < MIN_CJK_RUNE_LENGTH) {
    fail(`fixture "Eighth page" description is only ${eighthRuneLength} runes, under the ${MIN_CJK_RUNE_LENGTH}-rune floor — truncation likely cut by byte, not by rune — ${excerpt(eighth.description)}`)
  }
}

/*
  "Ninth page" embeds the search UI in its own content via the search-demo
  shortcode — the only fixture whose .Plain carries a deferred placeholder
  token, so the leak assertion above would pass vacuously without it.
*/
const ninth = docs.find((doc) => doc.title === 'Ninth page')
if (!ninth) {
  fail('fixture page "Ninth page" is missing from the index')
}

if (failures.length > 0) {
  console.error(`FAIL ${INDEX}`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`PASS ${INDEX}: ${docs.length} documents, every description within ${MAX_LENGTH} chars`)
