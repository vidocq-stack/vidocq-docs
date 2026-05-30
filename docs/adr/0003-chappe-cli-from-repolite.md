# ADR 0003 — Serving the site with `chappe-cli` pulled from repolite

* Status: Accepted
* Date: 2026-05-07
* Deciders: Yann Blazart
* Supersedes: the “chappe-builder stage” and “custom Java launcher” aspects of ADR 0001

## Context

ADR 0001 (Antora multi-component) said nothing about *how* the site would be served. The initial `vidocq-docs` bootstrap wired two temporary solutions:

1. A **`chappe-builder` Docker stage** that clones `vidocq/chappe` as a sibling repo, builds it (`mvn install`), and then assembles a classpath. Heavy (~3 minutes of build time, plus the clone) and requires the Forgejo Actions workflow to have a token with `read:repository` scope on a repo *other* than the current one — which does not work with the auto-injected `${{ github.token }}` (limited to the current repo).
2. A **custom Java launcher** (`server/src/main/java/io/vidocq/docs/ChappeDocsServer.java`) that uses Chappe’s programmatic API — useful until Chappe had a standalone CLI.

Both decisions were documented as temporary and dependent on delivery of **`chappe-cli`** on the Chappe side.

At the time of this ADR, `chappe-cli` is delivered:

* Maven artifact `io.vidocq.chappe:chappe-cli:0.1.0-SNAPSHOT` (with `shaded` classifier for the fat JAR)
* Command `chappe serve --root <dir> --port <p> --gzip [--config <yaml>]`
* Published on `https://repo.vidocq.dev/snapshots` (repolite, the hosted Maven instance in the Vidocq ecosystem)
* repolite also exposes a `/releases` endpoint for future tags

## Options considered

### A. Continue compiling Chappe from source inside the Dockerfile

* **−** Heavy (full build + skipped tests).
* **−** Couples `vidocq-docs` to the position of a specific `chappe` commit (HEAD or tag).
* **−** Requires cloning `vidocq/chappe` in the CI workflow → token with extended `read:repository` scope, with complications if a repo becomes private.
* **+** No dependency on Maven infrastructure.

### B. Build a `chappe-cli` OCI image on the Chappe side and use it as the runtime `FROM`

* **+** Trivial runtime image: `FROM forge.vidocq.dev/vidocq/chappe-cli:X.Y.Z` then `COPY` the site.
* **−** Requires a CI workflow on the Chappe side that publishes this image. Possible, but it doubles the image responsibilities (JAR + image).
* **−** Puts the Forgejo OCI registry on the critical path of the `vidocq-docs` build.

### C. Pull the `chappe-cli-shaded` fat JAR from repolite (Maven)

* **+** Single source of truth on the Chappe side: Maven publication.
* **+** No repo clone in the CI workflow.
* **+** The `shaded` classifier guarantees a self-contained JAR (no transitive resolution).
* **+** Easy to version via `--build-arg CHAPPE_VERSION=…`.
* **−** Depends on repolite availability during the build (acceptable; it is Vidocq infrastructure).
* **−** Requires Maven in the builder image (~50 MB extra for the fetch stage — the final runtime remains lightweight).

## Decision

**C** — pull the `chappe-cli` fat JAR from repolite on every build.

The Dockerfile now has 2 stages:

```text
Stage 1 (eclipse-temurin:25-jdk)  : mvn dependency:copy   → /opt/chappe/chappe-cli.jar
Stage 2 (eclipse-temurin:25-jre)  : COPY build/site + jar + entrypoint
```

The **Antora build is moved out of the Dockerfile**: Antora must clone the 7 module repositories over HTTPS, which requires `~/.git-credentials`. Rather than propagate those credentials into BuildKit (via `--secret` + helper), we keep the Antora build responsibility on the **runner / local build**; `docker build` only performs `COPY build/site`. This simplifies credentials and speeds up the build (Antora is not reinstalled for every image).

The custom Java launcher (`server/`) is removed. The Chappe CLI (`chappe serve`) takes over completely.

## Consequences

* **Simplified Forgejo workflow.** No more `Checkout chappe (sibling)`. `REGISTRY_TOKEN` no longer needs `read:repository`.
* **Faster build.** We no longer compile Chappe — we download an already prepared shaded JAR.
* **Explicit Chappe version coupling.** `--build-arg CHAPPE_VERSION` is passed to `docker build`; to pin a stable version, override it in the workflow or locally.
* **`chappe-config.yml`** still serves as the target documentation. The current launcher uses CLI flags (`--root`, `--port`, `--gzip`); the `--config <yaml>` option is not wired yet and will arrive when the Chappe CLI consumes YAML.
* **Repolite becomes critical for the build.** If repolite is down, the build fails. Acceptable at this stage — there is no formal SLO for the internal infrastructure.
* **`STAGING` environment variable** is not yet propagated to Chappe: the CLI still lacks a mechanism for `Filter.addHeaderIfEnv` (the `Filter` exists in the API but is not exposed as a CLI flag). Tracking: see the Chappe backlog.

## Links

* `Dockerfile` (stages 1–3)
* `.forgejo/workflows/build.yml` (`Build & push image` step with `--build-arg`)
* Chappe backlog: expose `--header KEY=VALUE` and `--header-if-env VAR=VAL KEY=VALUE` on the CLI to propagate `STAGING`.
