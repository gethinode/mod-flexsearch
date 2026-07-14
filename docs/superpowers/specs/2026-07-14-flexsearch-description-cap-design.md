# Cap search result descriptions

**Date:** 2026-07-14
**Status:** Approved
**Repository:** `gethinode/mod-flexsearch`

## Problem

Search suggestions render an uncapped description. On a page without a frontmatter
`description`, the entry falls back to the page summary, which can run to hundreds of
words and floods the suggestion dropdown, pushing the remaining results off screen.

The Hinode example site reproduces this on `table-demo.md`. Three separate defects
compound there:

1. **No length cap.** `GetSearchDocs.html` assigns
   `$description = $element.Summary | plainify` with no truncation. Hinode configures
   `summaryLength = 20`, but that does not bound the result: Hugo's auto-summary is
   HTML-aware and will not split a block element, so a page opening with a table
   swallows the entire table into its summary.
2. **Undecoded entities.** `plainify` strips tags but leaves HTML entities intact, so
   `&nbsp;` reaches the dropdown as literal text.
3. **Uncollapsed whitespace.** Table markup injects newlines and runs of spaces that
   survive into the indexed string.

The same partial already caps the **title** at 33 runes (line 21). The description
simply never received equivalent treatment.

## Goals

- Bound every indexed description to a length that keeps five suggestions scannable.
- Emit a clean plain-text string: no entities, no whitespace runs.
- Shrink the generated index payload, which matters most under `flexsearch.lazyLoad`.

## Non-goals

- **The 33-rune title cap stays as written.** It works; rewriting it to use `truncate`
  would silently change existing titles.
- **Duplicated cell text from wrapped tables is not addressed here.** Hinode's
  `assets/table.html` carries both the plain and wrapped layouts in a single table,
  switched with display utilities, so `plainify` picks up each cell twice. That is a
  Hinode concern, and the cap neutralizes its effect on the dropdown.
- **No new configuration parameter.** A fixed constant solves the reported problem. If a
  site ever needs a different cap, the parameter can be added then.

## Design

One partial changes: `layouts/_partials/utilities/GetSearchDocs.html`, lines 23-24.

### Before

```hugo
{{- $description := "" -}}
{{- with .Description }}{{ $description = . }}{{ else }}{{ $description = $element.Summary | plainify }}{{ end -}}
```

### After

```hugo
{{- $description := "" -}}
{{- with .Description }}{{ $description = . }}{{ else }}{{ $description = $element.Summary }}{{ end -}}
{{- $description = $description | plainify | htmlUnescape -}}
{{- $description = trim (replaceRE `[\s\x{00A0}]+` " " $description) " " | truncate 100 "..." -}}
```

Sourcing is separated from normalizing, so a frontmatter description and a summary
fallback receive identical treatment.

### Why each step

| Step | Purpose |
|------|---------|
| `plainify` | Strips HTML tags. Already present today. |
| `htmlUnescape` | Decodes the entities `plainify` leaves behind. This is what removes the literal `&nbsp;`. |
| `replaceRE` + `trim` | Collapses newlines and space runs injected by table markup. Must run **before** truncation, or the 100-character budget is spent on whitespace. The character class names `\x{00A0}` explicitly because Go's `\s` is ASCII-only and would otherwise leave behind the non-breaking spaces `htmlUnescape` just produced. |
| `truncate 100 "..."` | Hugo's word-boundary-aware truncation. The ellipsis is appended only when the string is actually cut, so a short description passes through untouched. |

### Cap length

**100 characters.** The description column in the navbar dropdown is `19rem` wide
(roughly 45-50 characters per line), so 100 characters renders as about two lines —
enough to disambiguate two similar hits while keeping five results on screen. This is
roughly triple the existing 33-rune title cap.

The cap applies to **both** sources. SEO convention puts meta descriptions at around 155
characters, so a deliberately authored frontmatter description may be visibly cut with an
ellipsis. This is intentional: it keeps dropdown rows uniform, and the full description
still reaches the page's meta tag, which this change does not touch.

## Data flow

Unchanged. `GetSearchDocs.html` remains the single source of truth for index documents,
feeding both consumers:

- **Eager path:** inline `index.add(...)` statements in `flexsearch.index.js`
- **Lazy path:** `index.searchindex.json`, fetched on first search interaction

Both inherit the fix. `flexsearch.index.js` and `flexsearch.scss` are untouched.

## Impact on search recall

`description` is a FlexSearch-indexed field, so truncating it does drop the tail from
that field's index. Recall is nonetheless effectively unchanged: the same text is already
indexed in the `content` field (full `.Plain`, or the full summary under `summaryOnly`),
and `showResults()` searches `title`, `description`, and `content` together, deduplicating
hits by URL.

The one genuinely new gap is a page whose frontmatter description exceeds 100 characters
*and* whose tail words appear nowhere in its body. This is rare, and the payoff is a
materially smaller lazy-load payload.

## Verification

1. Build the mod-flexsearch example site with `lazyLoad` enabled; assert that no
   `description` in the emitted `searchindex` JSON exceeds 103 characters (100 plus the
   `...` suffix).
2. Assert no emitted description contains `&nbsp;`, a newline, or a double space.
3. Render the Hinode example site and confirm the `table-demo` suggestion is two clean
   lines of text.
