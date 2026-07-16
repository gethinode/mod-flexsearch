---
title: Ninth page
description: Demos the search input inside page content, so the search index must not leak a deferred placeholder token.
# The explicit summary is load-bearing: without it, RSS embeds the derived
# .Summary — which carries the raw templates.Defer placeholder emitted by the
# search-demo shortcode — and Hugo panics substituting a deferred placeholder
# inside RSS output ("deferred execution with id ... not found"). The page's
# .Plain still carries the token, which is what the index fixture needs.
summary: Demos the search input inside page content.
---

This page embeds the search UI in its own content. The included search-index
publisher runs inside `templates.Defer`, which leaves a raw placeholder token
in this page's in-memory plain text; `GetSearchDocs.html` must strip it before
publishing the index.

{{< search-demo >}}

Text after the demo, so the placeholder sits mid-content rather than at a
trimmed edge.
