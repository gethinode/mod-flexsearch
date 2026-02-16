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
- `assets/js/modules/flexsearch/flexsearch.index.js`: FlexSearch initialization and search logic

**Search index configuration:**
- The JavaScript file generates a FlexSearch document index at build time from Hugo's page content
- Indexes three fields: `title` (forward tokenization), `description`, and `content` (full tokenization)
- Supports optional frontmatter indexing via `flexsearch.frontmatter` parameter
- Can use absolute URLs via `flexsearch.canonifyURLs` parameter
- Pages can be excluded with `searchExclude: true` in frontmatter
- Supports optional `indexTitle` parameter to override title in search results

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
- `localize` (default: true): Enable language-specific search

Navigation configuration under `params.navigation.search`:
- `enabled` (default: false): Enable search in navigation
- `modal` (default: false): Use modal instead of embedded search
- `icon` (default: "fas magnifying-glass"): Icon for modal search button

## Testing Locally

The `exampleSite/` directory contains a minimal Hugo site that imports this module using a local replacement path. Changes to the module are reflected immediately when running the dev server.
