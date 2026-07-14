# Search Description Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap every description in the FlexSearch index at 100 characters of clean plain text, so a page without a frontmatter description can no longer flood the search dropdown with its entire summary.

**Architecture:** A single Hugo partial, `GetSearchDocs.html`, is the sole producer of index documents for both the eager path (inline `index.add()` in `flexsearch.index.js`) and the lazy path (`flexsearch-index.json`). Normalizing and truncating the description there fixes both consumers at once. A fixture page in the example site reproduces the bug, and a Node assertion script — wired into `pnpm test`, which the pre-commit hook already runs — locks the behavior in.

**Tech Stack:** Hugo 0.164 (extended), Go template partials, pnpm, Node 20+ (ESM, built-ins only — no new dependencies).

**Spec:** `docs/superpowers/specs/2026-07-14-flexsearch-description-cap-design.md`

## Global Constraints

- **Cap: 100 characters**, ellipsis `"..."`, so a truncated description is exactly **103** characters. Verbatim from the spec.
- **No new configuration parameter.** The cap is a fixed constant.
- **The cap applies to both sources** — a frontmatter `description` and the `.Summary` fallback receive identical treatment.
- **Do not touch the 33-rune title cap** on line 21 of `GetSearchDocs.html`. It works; changing it would silently alter existing titles.
- **Do not touch** `flexsearch.index.js` or `flexsearch.scss`.
- **No new npm dependencies.** The assertion script uses Node built-ins only.
- Commits follow Conventional Commits (commitlint runs on `commit-msg`). This is a `fix:`.
- `.husky/pre-commit` runs `pnpm test`. **A red test cannot be committed** — hence the single red→green→commit cycle in Task 1.

## File Structure

| File | Responsibility |
|------|----------------|
| `layouts/_partials/utilities/GetSearchDocs.html` (modify, lines 23-24) | The fix. Normalize and truncate `$description`. |
| `exampleSite/content/sixth.md` (create) | Fixture: a page with **no** frontmatter description whose summary swallows a whole table. Reproduces the bug. |
| `exampleSite/layouts/shortcodes/nbsp.html` (create) | Fixture helper: emits a literal `&nbsp;` entity from a template. Required — see Task 1 note. |
| `scripts/check-search-index.mjs` (create) | Asserts the invariants of the built index. The regression test. |
| `package.json` (modify, `scripts.test`) | Runs the assertion script after the build. |

---

### Task 1: Reproduce, fix, and lock in the description cap

**Files:**
- Create: `exampleSite/content/sixth.md`
- Create: `exampleSite/layouts/shortcodes/nbsp.html`
- Create: `scripts/check-search-index.mjs`
- Modify: `package.json` (the `test` script)
- Modify: `layouts/_partials/utilities/GetSearchDocs.html:23-24`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a built index at `exampleSite/public/flexsearch-index.json` — a JSON array of objects with keys `id`, `href`, `title`, `description`, `content`. Task 2 relies on the fixture page being titled exactly `Sixth page`.

**Why the `nbsp` shortcode is needed (do not skip it):** Goldmark decodes HTML entities written directly in Markdown, so an `&nbsp;` typed into `sixth.md` becomes a real U+00A0 character and never reproduces the bug. On a real Hinode site the entity is emitted by the *heading anchor render hook* through `safeHTML`, so it survives into the HTML as the literal six-character string `&nbsp;`, which `plainify` does **not** decode. A shortcode is the smallest faithful way to reproduce that condition. This was verified empirically against Hinode's own build, where `table-demo`'s description is 1,899 characters and contains a literal `&nbsp;`.

- [ ] **Step 1: Write the fixture shortcode**

Create `exampleSite/layouts/shortcodes/nbsp.html`:

```html
{{- /* Emits a literal &nbsp; entity, mirroring Hinode's heading anchor render hook.
       Goldmark decodes entities written directly in Markdown, so the entity must come
       from a template to reproduce what actually reaches the search index. */ -}}
&nbsp;
```

- [ ] **Step 2: Write the failing fixture page**

Create `exampleSite/content/sixth.md`. Note there is deliberately **no** `description` in the frontmatter — that is what forces the `.Summary` fallback. Hugo's summary is HTML-aware and will not split a table, so the whole table lands in the description.

```markdown
---
title: Sixth page
date: 2026-07-14
searchExclude: false
---

## Wrapped table {{< nbsp >}}

| Name    | Type   | Description                                                        |
|---------|--------|--------------------------------------------------------------------|
| alpha   | widget | The first record, with a description long enough to need wrapping. |
| bravo   | gadget | The second record, also with a fairly long trailing description.   |
| charlie | widget | The third record. Short.                                           |
```

- [ ] **Step 3: Write the assertion script**

Create `scripts/check-search-index.mjs`:

```js
/*
  Asserts the invariants of the generated FlexSearch index. Wired into `pnpm test`
  after the exampleSite build, so a regression in GetSearchDocs.html fails the build
  (and the pre-commit hook) instead of shipping silently.
*/
import { readFile } from 'node:fs/promises'

const INDEX = 'exampleSite/public/flexsearch-index.json'
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
  console.error('run `pnpm build` first, and confirm the exampleSite emits the searchindex output format')
  process.exit(1)
}

if (!Array.isArray(docs) || docs.length === 0) {
  fail(`${INDEX} holds no documents; the exampleSite build did not populate the index`)
}

for (const doc of docs) {
  const description = doc.description ?? ''
  const where = `"${doc.title}"`

  if (description.length > MAX_LENGTH) {
    fail(`${where}: description is ${description.length} chars, over the ${MAX_LENGTH} limit — ${excerpt(description)}`)
  }
  if (/&[a-z]+;|&#\d+;/i.test(description)) {
    fail(`${where}: description carries an undecoded HTML entity — ${excerpt(description)}`)
  }
  // \u00a0 is written as an escape on purpose: a literal non-breaking space in the source
  // would be indistinguishable from a normal space and would match every description.
  if (/[\n\r\t\u00a0]| {2}/.test(description)) {
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

if (failures.length > 0) {
  console.error(`FAIL ${INDEX}`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`PASS ${INDEX}: ${docs.length} documents, every description within ${MAX_LENGTH} chars`)
```

- [ ] **Step 4: Wire the assertion script into `pnpm test`**

In `package.json`, change the `test` script from:

```json
    "test": "pnpm build",
```

to:

```json
    "test": "pnpm build && node scripts/check-search-index.mjs",
```

Leave every other script untouched.

- [ ] **Step 5: Run the test to verify it FAILS**

Run: `pnpm test`

Expected: the build succeeds, then the assertion script exits non-zero with output containing:

```text
FAIL exampleSite/public/flexsearch-index.json
  - "Sixth page": description is 241 chars, over the 103 limit — "Wrapped table &nbsp; Name Type Description alpha widget The f"
  - "Sixth page": description carries an undecoded HTML entity — "Wrapped table &nbsp; Name Type Description alpha widget The f"
  - fixture "Sixth page" was not truncated, so the cap is not engaging — "Wrapped table &nbsp; Name Type Description alpha widget The f"
```

If it does not fail with an over-length description **and** a literal `&nbsp;`, stop — the fixture is not reproducing the bug and the rest of this task is meaningless.

- [ ] **Step 6: Apply the fix**

In `layouts/_partials/utilities/GetSearchDocs.html`, replace line 24:

```hugo
    {{- with .Description }}{{ $description = . }}{{ else }}{{ $description = $element.Summary | plainify }}{{ end -}}
```

with these three lines:

```hugo
    {{- with .Description }}{{ $description = . }}{{ else }}{{ $description = $element.Summary }}{{ end -}}
    {{- $description = $description | plainify | htmlUnescape -}}
    {{- $description = trim (replaceRE `[\s\p{Zs}\p{Zl}\p{Zp}\x{000B}\x{0085}\x{FEFF}]+` " " $description) " " | truncate 100 "..." | htmlUnescape -}}
```

Leave line 23 (`{{- $description := "" -}}`) exactly as it is.

Each step earns its place, so do not "simplify" any of them away:
- `plainify` strips tags (this was already there).
- `htmlUnescape` (first) decodes the entities `plainify` leaves behind — this is what turns a literal `&nbsp;` into a real U+00A0, which the whitespace collapse below can then absorb.
- `replaceRE` + `trim` collapse whitespace, and **must run before** `truncate`, or the 100-character budget gets spent on whitespace. The character class `[\s\p{Zs}\p{Zl}\p{Zp}\x{000B}\x{0085}\x{FEFF}]+` names the Unicode space/line/paragraph-separator categories and a few extra control/format code points explicitly, because Go's `\s` is ASCII-only and would otherwise leave them uncollapsed.
- `truncate` is word-boundary aware and appends the ellipsis only when it actually cuts, so short descriptions pass through untouched.
- `htmlUnescape` (second, after `truncate`) undoes the HTML-escaping that `truncate` applies to its plain-string input — without it, a truncated description containing an apostrophe, ampersand, or quote comes out with visible entities like `&#39;` instead of the original character.

- [ ] **Step 7: Run the test to verify it PASSES**

Run: `pnpm test`

Expected: exit 0, with the final line:

```text
PASS exampleSite/public/flexsearch-index.json: 7 documents, every description within 103 chars
```

- [ ] **Step 8: Confirm existing descriptions were not disturbed**

Run:

```bash
node -e "for (const d of require('./exampleSite/public/flexsearch-index.json')) console.log(String(d.description.length).padStart(3), JSON.stringify(d.description))"
```

Expected — the six pre-existing pages pass through byte-for-byte unchanged, and only the fixture is capped:

```text
 18 "Fifth example page"
 18 "First example page"
 37 "Fourth example page, no page content."
 25 "Nested section index page"
 28 "Top-level section index page"
 19 "Second example page"
103 "Wrapped table Name Type Description alpha widget The first record, with a description long enough to..."
```

The six existing descriptions must be unchanged, and the seventh must be exactly 103 characters, end in `...`, and contain no `&nbsp;`.

- [ ] **Step 9: Commit**

```bash
git add layouts/_partials/utilities/GetSearchDocs.html \
        exampleSite/content/sixth.md \
        exampleSite/layouts/shortcodes/nbsp.html \
        scripts/check-search-index.mjs \
        package.json
git commit -m "fix: cap search result descriptions at 100 characters

A page without a frontmatter description falls back to its summary. Hugo's
summary is HTML-aware and will not split a block element, so a page opening
with a table swallows the entire table and floods the search dropdown.

Normalize the description before indexing it — decode the entities plainify
leaves behind, collapse whitespace runs — then truncate it at 100 characters
on a word boundary, mirroring the 33-rune title cap in the same partial.

Covered by a fixture page in the example site and asserted by pnpm test."
```

Note the pre-commit hook runs `pnpm test`, so the commit itself re-verifies the fix.

---

### Task 2: Verify against the real Hinode example site

The mod-flexsearch example site is a minimal harness. This task confirms the fix on the page that actually triggered the report — Hinode's `table-demo`, whose description is currently **1,899 characters** and contains a literal `&nbsp;`. Hinode uses the **eager** path (no `lazyLoad`), so this also exercises the consumer Task 1 did not.

**Files:**
- Modify (temporarily, **never commit**): `/Users/mark/Development/GitHub/gethinode/hinode/exampleSite/config/_default/hugo.toml`

**Interfaces:**
- Consumes: the committed fix from Task 1, resolved through a local module replacement.
- Produces: evidence only. No commit in this task.

- [ ] **Step 1: Point Hinode at the local worktree**

In `hinode/exampleSite/config/_default/hugo.toml`, under `[module]` (there are commented-out examples of exactly this on the lines below `workspace = "hinode.work"`), add:

```toml
  replacements = 'github.com/gethinode/mod-flexsearch/v5 -> /Users/mark/Development/GitHub/gethinode/mod-flexsearch.worktrees/cap-search-description/'
```

A `replacements` entry is required here. A workspace `use` directive alone is not reliably enough — Hugo will keep resolving the module from Hinode's committed `_vendor/` copy.

- [ ] **Step 2: Confirm the replacement actually took**

Run from `/Users/mark/Development/GitHub/gethinode/hinode`:

```bash
export PATH="$PWD/node_modules/.bin:$PATH"
hugo config mounts -s exampleSite | grep -i flexsearch | head -3
```

Expected: paths pointing into `mod-flexsearch.worktrees/cap-search-description`, **not** into `_vendor/`.

**This gate is necessary but NOT sufficient** (learned during execution): `hugo config mounts` can report the replacement while the actual *build* still resolves the module from Hinode's committed `_vendor/` copy. The only reliable check is the measured result in Step 4. See Step 3.

- [ ] **Step 3: Build the Hinode example site**

Still from the Hinode repo root, with `node_modules/.bin` on `PATH`:

```bash
rm -rf exampleSite/public
hugo -s exampleSite --ignoreVendorPaths="github.com/gethinode/mod-flexsearch/v5"
```

`--ignoreVendorPaths` is **required**, not optional. Without it Hugo builds against the stale `_vendor/` copy of the module and reproduces the 1,899-character baseline exactly — a pass that tests none of your changes. The `rm -rf` is also required: `public/` is not cleaned between builds, so stale fingerprinted JS bundles accumulate and the Step 4 extraction can silently read an old one.

Use the project-pinned binary via `PATH` as above. Do **not** run `npm run build:example` — its `prestart` re-vendors the module from the remote and would wipe out the local override. Do not start a second `hugo server` if a dev server is already running; it poisons the shared CSS cache.

- [ ] **Step 4: Assert the real page is fixed**

```bash
python3 - <<'PY'
import glob, re
for f in glob.glob('exampleSite/public/js/core.bundle.en.min.*.js'):
    s = open(f, encoding='utf-8').read()
    if 'href:"/en/table-demo/"' not in s:
        continue
    i = s.index('href:"/en/table-demo/"')
    head = s[:i]
    j = head.rindex('description:"')
    desc = head[j + len('description:"'):-2]
    print('file       :', f.split('/')[-1])
    print('length     :', len(desc))
    print('has &nbsp; :', '&nbsp;' in desc)
    print('description:', desc)
    break
else:
    print('table-demo not found in any core bundle — the build did not index it')
PY
```

Expected: a length of **103 or less** (down from 1,899), `has &nbsp; : False`, and a readable one-line description ending in `...`.

- [ ] **Step 5: Revert every local-only change to Hinode**

```bash
cd /Users/mark/Development/GitHub/gethinode/hinode
git checkout -- exampleSite/config/_default/hugo.toml
git status --short
```

Expected: no modification to `hugo.toml`. Also revert `hugo_stats.json` if the build touched it. Hinode must be left exactly as it was found — the replacement path is machine-specific and must never be committed.

---

### Task 3: Open the pull request

**Files:** none.

**Interfaces:**
- Consumes: the commit from Task 1 and the evidence from Task 2.

- [ ] **Step 1: Confirm the branch is clean and green**

```bash
cd /Users/mark/Development/GitHub/gethinode/mod-flexsearch.worktrees/cap-search-description
git status --short
pnpm test
```

Expected: a clean working tree and a passing test.

- [ ] **Step 2: Push and open the PR against `main`**

Feature branches in this repo target `main` directly (`develop` is legacy). Because gethinode merges PRs with a merge commit, semantic-release reads the branch commits rather than the PR title — the `fix:` commit from Task 1 is what drives the patch release.

```bash
git push -u origin fix/cap-search-description
gh pr create --base main --title "fix: cap search result descriptions at 100 characters" --body "$(cat <<'EOF'
## Summary

A page without a frontmatter `description` falls back to its summary. Hugo's summary is HTML-aware and will not split a block element, so a page opening with a table swallows the entire table into the search index and floods the suggestion dropdown.

On the Hinode example site, `table-demo`'s indexed description was **1,899 characters** and contained a literal `&nbsp;`. It is now capped at 103.

## Changes

- `GetSearchDocs.html` normalizes the description (decodes the entities `plainify` leaves behind, collapses whitespace runs) and truncates it at 100 characters on a word boundary, mirroring the 33-rune title cap already in the same partial. The cap applies to both frontmatter descriptions and the summary fallback.
- Both consumers inherit the fix, since this partial is the single source of truth for the eager and lazy index paths.
- A fixture page in the example site reproduces the bug, and `pnpm test` now asserts the index invariants.

## Notes

No new configuration parameter — the cap is a fixed constant. Search recall is effectively unchanged: the truncated tail is still indexed in the `content` field, which is searched alongside `description`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Cap at 100 chars, in Hugo, at index build | Task 1, Step 6 |
| Cap applies to both frontmatter and summary sources | Task 1, Step 6 (sourcing split from normalizing) |
| Decode entities (`&nbsp;`) | Task 1, Step 6 (`htmlUnescape`); asserted Step 5/7 |
| Collapse whitespace | Task 1, Step 6 (`replaceRE` + `trim`); asserted Step 5/7 |
| No new config parameter | Global Constraints; nothing in any task adds one |
| Title cap untouched | Global Constraints; Step 6 explicitly leaves line 21 alone |
| `flexsearch.index.js` / `.scss` untouched | Global Constraints |
| Verification 1 — no description over 103 chars in emitted JSON | Task 1, Steps 3 and 7 |
| Verification 2 — no entity, newline, or double space | Task 1, Step 3 |
| Verification 3 — Hinode `table-demo` renders clean | Task 2 |

**Placeholder scan:** none — every step carries its literal file content, command, and expected output.

**Type consistency:** the fixture title `Sixth page` is used identically in `check-search-index.mjs` and in Task 1's expected output. The constant 100 and the `"..."` ellipsis agree across the partial, the script (`MAX_LENGTH = 103`), and every expected-output block.
