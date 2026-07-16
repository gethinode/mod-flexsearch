# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Hugo module for the Hinode theme that adds full-text search functionality powered by FlexSearch. The module integrates FlexSearch as a Hugo module dependency and provides both embedded and modal search interfaces.

## Development Commands

### Building and Testing
```bash
npm run start     # Start Hugo dev server on exampleSite (includes mod:vendor)
npm run build     # Build the exampleSite with Hugo (includes mod:vendor and cleanup)
npm test          # Run tests (executes build)
npm run clean     # Remove exampleSite/public and exampleSite/resources
```

### Hugo Module Management
```bash
npm run mod:tidy   # Tidy Hugo modules (runs on both root and exampleSite)
npm run mod:update # Update all Hugo modules to latest versions
npm run mod:vendor # Vendor Hugo modules into _vendor directory
```

### Commits
This project uses Conventional Commits enforced by commitlint and husky. Use `npx git-cz` to create properly formatted commit messages. Semantic-release automatically handles versioning and releases from the main branch.

## Architecture

### Module Structure

The repository follows Hugo's module structure with module mounts defined in `config.toml`:
- **assets/**: JavaScript (FlexSearch implementation), SCSS (search styling), SVG icons
- **layouts/**: Hugo templates (partials, shortcodes)
- **i18n/**: Translation files for search UI text
- **content/**: Content mounts (including modal template)
- **exampleSite/**: Test site that imports this module

The module imports `github.com/nextapps-de/flexsearch` and mounts its bundle to `assets/js/modules/flexsearch/flexsearch.bundle.min.js`.

### Search Implementation

**Two search modes** are supported via `params.navigation.search.modal` configuration:
1. **Embedded mode** (default): Search input in navigation bar with dropdown suggestions
2. **Modal mode**: Full-screen modal dialog triggered by a button/icon

**Key components:**

- `layouts/_partials/utilities/GetSearchConfig.html`: Returns search configuration (enabled, modal, icon) with backwards compatibility for deprecated parameter names
- `layouts/_partials/assets/search-input.html`: Embedded search form HTML structure
- `layouts/_shortcodes/ModalSearch.html`: Modal search dialog structure
- `layouts/_partials/assets/search-meta.html`: Recursive helper to extract frontmatter content for indexing
- `layouts/_partials/utilities/GetSearchDocs.html`: Single source of truth — builds the slice of index documents (accepts an explicit `site` because it runs inside `templates.Defer`)
- `layouts/_partials/assets/search-index.html`: Publishes the index documents as a per-language JSON asset from a `templates.Defer` block — i.e. after all pages have rendered, keeping the expensive `.Plain` walk off the render critical path. Included by `search-input.html` and `ModalSearch.html`; renders no output
- `layouts/_partials/utilities/GetSearchIndexPath.html`: Returns the deterministic publish path of the index asset (`js/flexsearch-index.<lang>.json`)
- `layouts/_partials/utilities/GetSearchIndex.html`: Returns the URL of the index asset (embedded into the runtime bundle at build time)
- `layouts/index.searchindex.json`: Legacy layout for the deprecated `searchindex` output format — now always emits an empty array; kept so sites that still list the format keep building
- `assets/js/modules/flexsearch/flexsearch.index.js`: FlexSearch initialization and search logic; fetches the index asset at runtime

**Search index configuration:**
- The index documents are built by `GetSearchDocs.html` from Hugo's page content
- Indexes three fields: `title` (forward tokenization), `description`, and `content` (full tokenization)
- Supports optional frontmatter indexing via `flexsearch.frontmatter` parameter
- Can index page summaries instead of full content via `flexsearch.summaryOnly` parameter
- Can use absolute URLs via `flexsearch.canonifyURLs` parameter
- Pages can be excluded with `searchExclude: true` in frontmatter
- Supports optional `indexTitle` parameter to override title in search results
- The index payload is never bundled into the page scripts: it is published as
  a per-language JSON asset (`js/flexsearch-index.<lang>.json`) from a
  `templates.Defer` block, so the `.Plain` walk over all pages runs after the
  site has rendered (reusing Hugo's cached content) instead of serializing the
  render pipeline inside the script-bundle mutex
- **Eager fetch (default):** the runtime fetches the JSON as soon as the core
  bundle executes on a page with a search input
- **Lazy fetch (`flexsearch.lazyLoad`):** the fetch is postponed until the
  first search interaction (focus/click on the input, or opening the modal)
- Requires CSP `connect-src 'self'` in both modes; the module declares it in
  its `csp` block

**Search behavior:**
- Shows up to 5 results across title, description, and content fields
- Deduplicates results by URL
- Keyboard shortcuts: Ctrl+/ to focus, Escape to close, Arrow keys for navigation
- Results appear in a dropdown with title and description snippets

### Internationalization

Translation files in `i18n/` provide localized strings for:
- `ui_search`: Search input placeholder and aria-label
- `ui_no_results`: Message when no results found

Supported languages: en, de, fr, nl, pl, zh-hans, zh-hant

### Configuration Parameters

Module configuration in `config.toml` under `params.modules.flexsearch`:
- `canonifyURLs` (default: false): Use absolute URLs instead of relative
- `frontmatter` (default: false): Include frontmatter content in search index
- `filter` (default: "params"): Restrict frontmatter scanning to specific key
- `summaryOnly` (default: false): Index page summaries instead of full content
- `lazyLoad` (default: false): Postpone fetching the search-index JSON until the first search interaction, instead of fetching it as soon as the page's scripts run
- `localize` (default: true): Enable language-specific search

Navigation configuration under `params.navigation.search`:
- `enabled` (default: false): Enable search in navigation
- `modal` (default: false): Use modal instead of embedded search
- `icon` (default: "fas magnifying-glass"): Icon for modal search button

## Testing Locally

The `exampleSite/` directory contains a minimal Hugo site that imports this module using a local replacement path. Changes to the module are reflected immediately when running the dev server.
