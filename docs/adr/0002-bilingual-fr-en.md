# ADR 0002 — Canonical FR documentation + EN translation

* Status: Accepted
* Date: 2026-05-07
* Deciders: Yann Blazart

## Context

The Vidocq project is rooted in a French historical imagination (Vidocq, Vauban,
Cassini, Chappe, Foy, Mansart). French is the primary working language of the
project, of commit messages, and of internal documentation. But the Jakarta
ecosystem is English-speaking: most potential consumers of a MicroProfile /
Jakarta REST runtime do not speak French.

The docs must therefore:

* have a **canonical FR version** (native quality, not pidgin);
* have a **full EN translated version** (not a partial translation);
* allow a **fast language toggle** on any page;
* **not privilege EN over FR** in the URL (so no `/en/` URL with FR as second class).

## Considered options

### Native Antora i18n

Antora i18n is marked experimental in the official documentation. It works via
translation files layered on top of the main component, but:

* the HTML/UI coverage is incomplete;
* public examples are rare;
* future evolution is uncertain.

Risk is too high for a documentation suite that must remain maintainable long term.

### Language fork (one `<module>` repo and one `<module>-docs-en` repo)

Too expensive. It would double the number of repos. Desynchronization would be
guaranteed as soon as module docs evolve.

### `fr.docs.vidocq.dev` and `docs.vidocq.dev` subdomains

* Possible, but deployment becomes heavier.
* SEO is trickier (`hreflang`, canonicals).
* No gain over paths on the same domain.

### Parallel `<module>` and `<module>-fr` components

* Each module defines two distinct Antora components in its `docs/`: `<module>` (EN) and `<module>-fr` (FR).
* Both are packaged in the same playbook.
* The FR/EN toggle is implemented **client-side** by a small JS file (`ui-bundle/src/js/site.js`): if the current page is `/vauban/page.html`, the FR toggle points to `/vauban-fr/page.html`. If the page does not exist, it falls back to the target component index.
* The URL **has no `/fr` or `/en` prefix**: the language is in the component name, which keeps the URL canonical (each page has a unique URL with no redirect).

## Decision

**Parallel components.**

* Both versions coexist on equal footing.
* **French is canonical**: we write in FR first, then translate to EN. Never the reverse.
* The page structure is **identical** between both versions: same number of pages, same anchors, same nav. That lets the JS toggle compute the counterpart URL trivially.
* Code examples, API names, and FQNs are **identical** — only the surrounding natural language changes.

## Consequences

* **Editorial discipline**: any new page written in FR must be translated into EN before merge. No FR-only or EN-only page.
* **CI** (to come): a linter could check parity between `docs/fr/` and `docs/en/` (same files, same number of anchors).
* **SEO**: `hreflang` tags must be added in the `<head>` to announce the FR↔EN versions. *(to be implemented in the UI bundle)*
* **Home page**: `home-fr` is the default `start_page` (consistent with the project positioning). The EN toggle will link to `home`.

## Rejected alternatives (summary)

| Option | Verdict | Reason |
|---|---|---|
| Native Antora i18n | ✗ | Experimental, long-term risk |
| Language fork | ✗ | Repo multiplication, drift |
| Subdomains | ✗ | Heavy, SEO complexity, no gain |
| **Parallel components** | ✓ | Stable, simple, no URL prefix |

## Links

* https://docs.antora.org/antora/latest/component-version/
* https://docs.antora.org/antora/latest/component-with-no-master/
