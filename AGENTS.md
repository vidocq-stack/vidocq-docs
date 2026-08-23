# CLAUDE.md

Contributor guidance for agents working on this repository. See also the companion `AGENTS.md` file.

## Documentation (Antora) conventions

The project documentation lives in `docs/en` of each sub-project as an Antora
component and is aggregated by the **vidocq-docs** site, which provides a
**shared UI bundle** (banner, logo, fonts, colours, footer, search).
**Never customise the documentation UI per project** — all visual harmonisation
is centralised in `vidocq-docs/ui-bundle`.

The site is **English-only** (ADR 0004, supersedes ADR 0002): there is no
`docs/fr` mirror anymore, and none must be reintroduced.

### Versioned documentation (ADR 0004)

Each **released** sub-project builds two doc lines:

- branch `docs/<version>` (e.g. `docs/0.2.0`) — the released train's docs.
  `antora.yml`: `version: '<version>'`, attribute `project-version: <version>`.
  This is the **default version** shown on the site (no URL segment).
- `main` — the in-development docs. `antora.yml`: `version: dev`,
  `prerelease: true`, `project-version: <current SNAPSHOT>`. Served under
  `/<component>/dev/`.

Never hardcode artifact versions in pages: use `{project-version}` (the version
the page documents) or `{release-version}` (latest release, for install flows).
Source blocks containing attributes need `subs=attributes+`.

**Release runbook** (on release train X): run
`node scripts/cut-docs-release.js --version X --next <snapshot>` from
vidocq-docs, then push. It cuts `docs/X` from every versioned repo's `main`
(freezing the dev docs), pins the branch's `antora.yml`, bumps `main` to the
next SNAPSHOT, and applies the retention window (**last 3 releases + dev**)
to both playbooks — the version dropdown follows the playbook automatically.
`--include <repo>` for a brick's first release, `--dry-run` to preview.
Dropped versions keep their `docs/*` branch (re-add to the playbook to
republish). Cut the docs at the same commit as the release itself: main's
docs then describe exactly the released code — never write docs on `main`
for unmerged features.

Never-released components (e.g. erasmus) build from `main` only.

### Gold reference
**Vauban** is the reference implementation for documentation structure. Mirror its
`docs/en` layout when creating or updating docs. **Chappe** (HTTP server)
and **Vidocq** (runtime orchestrator) are *special cases*, not references: they are not
Jakarta EE / MicroProfile spec implementations.

### Repository layout
- `docs/en/antora.yml` → `name: <project>`, `title:`, version + attributes as
  described above, `nav:`, `lang: en`.
- Pages in `modules/ROOT/pages/`, navigation in `modules/ROOT/nav.adoc`, images in
  `modules/ROOT/images/`.

### Site-level components (this repo)
- `content/home` — the landing component (versionless).
- `content/tutorials` — cross-brick step-by-step guides (versionless). Tutorials
  are learning-oriented and may span several bricks; reference material belongs
  in the brick components.

### Canonical navigation (section order)
`index` → `getting-started` → `usage` → `concepts` → `internals` → `tck` →
`performance` → `reference` → `migration`

Multi-module projects (e.g. Vidocq, Mansart) may append `modules/*` / `sub-modules/*`
sub-pages after `migration`.

### TCK / Performance rule (not mutually exclusive)
- Every **spec implementation** — i.e. **all projects except Chappe and Vidocq** — MUST
  have a **`tck`** section documenting TCK coverage/status.
- Projects with a performance story (e.g. **Chappe**) keep their **`performance`** section.
- When **both** sections exist, order them **TCK first, then Performance**.
- **Chappe** and **Vidocq** do not require a `tck` section (not spec implementations).

### `index.adoc` structure
Follow Vauban's `index.adoc`: page title (`= <Project>`), `:description:`, a centred logo
(`image::<project>-logo.png[...,role=module-logo]`), a `[.lead]` paragraph, then
`== Origin of the name`, an `== At a glance` table, and ecosystem / quick-links sections.

### Logo
Provide `modules/ROOT/images/<project>-logo.png` (PNG), referenced from `index.adoc`.

### Diagrams
Mermaid via kroki (self-hosted, SVGs fetched at build time). Quote any edge
label containing `@`, commas or periods (`-->|"@Inject"|`), never embed
AsciiDoc xrefs inside a diagram, and test new blocks against
`https://kroki.vidocq.dev/mermaid/svg` — kroki failures are silent (the page
ships without the diagram).

### Search
`@antora/lunr-extension` builds a static client-side index; the search box
lives in the shared UI header. Nothing to do per page.

> When you change these documentation rules, keep `AGENTS.md` and `CLAUDE.md` in sync.

## Terminology

Use **Java Modules** (or **Java module** for a single module) when referring to
the Java Platform Module System. Do **not** use the abbreviation **JPMS** — in
prose, identifiers, or documentation.
