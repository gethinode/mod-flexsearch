# Hinode Module - FlexSearch

<!-- Tagline -->
<p align="center">
    <b>A Hugo module to add full text search powered by FlexSearch to your Hinode site</b>
    <br />
</p>

<!-- Badges -->
<p align="center">
    <a href="https://gohugo.io" alt="Hugo website">
        <img src="https://img.shields.io/badge/generator-hugo-brightgreen">
    </a>
    <a href="https://gethinode.com" alt="Hinode theme">
        <img src="https://img.shields.io/badge/theme-hinode-blue">
    </a>
    <a href="https://github.com/gethinode/mod-flexsearch/commits/main" alt="Last commit">
        <img src="https://img.shields.io/github/last-commit/gethinode/mod-flexsearch.svg">
    </a>
    <a href="https://github.com/gethinode/mod-flexsearch/issues" alt="Issues">
        <img src="https://img.shields.io/github/issues/gethinode/mod-flexsearch.svg">
    </a>
    <a href="https://github.com/gethinode/mod-flexsearch/pulls" alt="Pulls">
        <img src="https://img.shields.io/github/issues-pr-raw/gethinode/mod-flexsearch.svg">
    </a>
    <a href="https://github.com/gethinode/mod-flexsearch/blob/main/LICENSE" alt="License">
        <img src="https://img.shields.io/github/license/gethinode/mod-flexsearch">
    </a>
</p>

## About

![Logo](https://raw.githubusercontent.com/gethinode/hinode/main/static/img/logo.png)

Hinode is a clean blog theme for [Hugo][hugo], an open-source static site generator. Hinode is available as a [template][repository_template], and a [main theme][repository]. This repository maintains a Hugo module to add [FlexSearch][flexsearch] to a Hinode site. Visit the Hinode documentation site for [installation instructions][hinode_docs].

## Contributing

This module uses [semantic-release][semantic-release] to automate the release of new versions. The package uses `husky` and `commitlint` to ensure commit messages adhere to the [Conventional Commits][conventionalcommits] specification. You can run `npx git-cz` from the terminal to help prepare the commit message.

## Configuration

This module supports the following parameters (see the section `params.modules` in `config.toml`):

| Setting                   | Default  | Description |
|---------------------------|----------|-------------|
| `flexsearch.canonifyURLs` | false    | If set, uses absolute URLs for the indexed pages instead of relative URLs. |
| `flexsearch.frontmatter`  | false    | If set, includes front matter in the page content. The search index function adds all parameters with the name `content`, `heading`, `title`, `preheading` recursively. |
| `flexsearch.filter`       | "params" | Restricts the scanned frontmatter variables to the named filter. By default, all front matter variables are scanned. Only applicable when `flexsearch.frontmatter` is set. |
| `flexsearch.summaryOnly`  | false    | If set, indexes each page's summary instead of its full content. Reduces the size of the generated search index considerably on large sites, at the cost of matching only summary text. |
| `flexsearch.lazyLoad`     | false    | If set, postpones fetching the search index until the visitor's first search interaction. By default the index is fetched as soon as the page's scripts run. See the note below on how the index is published. |

> [!NOTE]
> The search index is published as a separate per-language JSON asset
> (`js/flexsearch-index.<lang>.json`) and fetched at runtime; it is not bundled
> into the core script loaded on every page. The asset is generated after all
> pages have rendered (via `templates.Defer`), which keeps the index build off
> the render critical path and speeds up site builds. A site that sets a strict
> Content Security Policy must allow `connect-src 'self'`. The module declares
> this directive in its `csp` block, so sites using the Hinode CSP module pick
> it up automatically. Sites that override the `search-input.html` partial or
> the `ModalSearch` shortcode must keep the include of
> `assets/search-index.html`, which publishes the index asset.

In addition, the module recognizes the following site parameters (see the section `params.navigation` in `config.toml`):.

| Setting          | Default | Description |
|------------------|---------|-------------|
| `search.enabled` | false   | If set, enables search in the site's main navigation. |
| `search.modal`   | false   | If set, uses a modal form for search queries. Defaults to an embedded input field. |

The icon used by modal search is read from the central `[icons]` section in `params.toml`:

| Setting         | Default                | Description |
|-----------------|------------------------|-------------|
| `icons.search`  | `fas magnifying-glass` | Defines the icon used in the site's main navigation. Only applicable to `modal` search. |

> [!NOTE]
> The legacy `navigation.search.icon` parameter was deprecated in v3.3.0 in favour of `icons.search`. It still works but emits a deprecation warning; migrate any existing configuration to the `[icons]` section.

<!-- MARKDOWN LINKS -->
[conventionalcommits]: https://www.conventionalcommits.org
[flexsearch]: https://github.com/nextapps-de/flexsearch
[hugo]: https://gohugo.io
[hinode_docs]: https://gethinode.com
[repository]: https://github.com/gethinode/hinode.git
[repository_template]: https://github.com/gethinode/template.git
[semantic-release]: https://semantic-release.gitbook.io/
