# ADR 0001 — Antora multi-component

* Status: Accepted
* Date: 2026-05-07
* Deciders: Yann Blazart

## Context

The Vidocq ecosystem has seven independent repositories (`vidocq`, `vauban`,
`cassini`, `champollion`, `chappe`, `foy`, `mansart`), each with its own release
cycle. A unified documentation site must:

* read content **from each repo** (docs live with code, not in a separate repo);
* allow **parallel versions** per component (Vauban 0.1 + Cassini 0.2 without conflict);
* produce a static site served by Chappe;
* remain **readable with no runtime infrastructure at all** (no backend service for docs).

## Considered options

### MkDocs (Material)

* **+** Excellent theme, mature ecosystem.
* **+** Low friction for Python contributors.
* **−** Multi-repo: no native support. `monorepo` / `multirepo` plugins exist but are marginal and hacky.
* **−** Component versioning: possible via `mike`, but tied to distinct Git branches per version.
* **−** AsciiDoc source: possible via third-party plugins, quality varies.

### Docusaurus

* **+** Familiar JS stack, lots of templates.
* **+** Built-in versioning.
* **−** No native multi-repo support (workspaces possible, but heavy).
* **−** Markdown only (no AsciiDoc) — incompatible with the historic Java/Jakarta writing style of the contributors.
* **−** React / MDX: large attack surface for a site that should be pure static.

### Hugo

* **+** Extremely fast builds.
* **+** Pure static, trivial deployment.
* **−** No multi-repo, no multi-component, no native versioning.
* **−** Markdown only.
* **−** Theming = Go templates, specific learning curve.

### Antora

* **+** **Designed** for multi-repo docs (`content.sources` reads N Git repos).
* **+** **Designed** for versioned multi-component docs (`name: vauban`, `version: 0.1`).
* **+** Native AsciiDoc — better than Markdown for technical blocks (admonitions, tables, includes).
* **+** Static build, pure HTML output, no heavy client-side JS.
* **−** Smaller plugin ecosystem than MkDocs/Docusaurus.
* **−** The Handlebars UI bundle requires upfront work (but that is what we want for the 19th-century style).
* **−** Native i18n: experimental.

## Decision

Antora 3.x is selected.

## Consequences

* Each module repo carries a `docs/` directory that the playbook reads as a source.
* The UI bundle (`ui-bundle/`) is custom, hand-written: Handlebars + vanilla CSS + ~60 lines of JS.
* i18n is implemented **by explicit component duplication** (`vauban` and `vauban-fr`), not via Antora i18n. See [ADR 0002](0002-bilingual-fr-en.md).
* The final site is fully static, served by Chappe.

## Links

* https://docs.antora.org/
* https://docs.antora.org/antora/latest/playbook/
