# ADR 0004 — English-only site, versioned docs, client-side search

* Status: Accepted (supersedes ADR 0002)
* Date: 2026-08-23
* Deciders: Yann Blazart

## Context

ADR 0002 made French the canonical documentation language with an English
mirror, wired as parallel Antora components (`<name>` / `<name>-fr`) and a
FR/EN toggle in the shared UI. Three months of practice showed the real cost:

* every docs change had to be written twice and *reviewed* twice — in a
  workspace whose official language is English everywhere else (code,
  commits, CI, driving files), the FR mirror was pure overhead;
* the audience that actually reads a MicroProfile runtime's documentation is
  English-speaking; the site even *defaulted* to the French start page, which
  confused first-time visitors arriving from the (English) blog;
* 32 Antora components (16 × 2 languages) doubled build time and doubled the
  surface where stale content could hide.

At the same time the 0.2.0 release train shipped on Maven Central while
`main` moved on to `0.3.0-SNAPSHOT` — a single unversioned doc line could no
longer describe both truthfully. And with ~190 pages, the lack of any
search became the top usability gap.

## Decision

1. **English only.** The `docs/fr` components are removed from every
   sub-project and from the playbook; the `home-fr` component and the UI
   language toggle are deleted. French remains the language of maintainer
   chat, nothing else. (This aligns the docs with the workspace-wide
   language rule instead of excepting them from it.)
2. **Versioned documentation.** Each released sub-project carries two doc
   lines: branch `docs/<version>` (Antora version `<version>`, e.g.
   `0.2.0`) documents the released train and is the site default
   (`urls.latest_version_segment: ''` keeps historical URLs stable); `main`
   builds as Antora version `dev` with `prerelease: true` under
   `/<component>/dev/`. Hardcoded artifact versions in pages are replaced by
   the `project-version` / `release-version` attributes defined per branch in
   `antora.yml` — a release bump edits one file per branch.
   Release runbook: on train X, `git branch docs/X main`, set
   `version: 'X'` / `project-version: X` (drop `prerelease`) on the branch,
   add the branch to both playbooks.
3. **Client-side search.** `@antora/lunr-extension` generates a static
   Lunr index at build time; the custom UI hosts the search box. No external
   service, no telemetry — consistent with the zero-dependency philosophy
   and the static Cloudflare Pages hosting.

## Consequences

* Halved build matrix (16 components + home + tutorials, one language).
* A `tutorials` component (versionless, like `home`) now hosts cross-brick
  step-by-step guides that had no natural home in any single component.
* The FR translations are not lost — they remain in git history should a
  localized site ever become worth the cost again.
* Components never released (e.g. erasmus) build from `main` only and show
  a single `dev` version until their first release.
