# vidocq-docs — Bug log

Format: one bug per section, dated, with a short id, symptom, repro, root-cause
hypothesis, and status. Convention inherited from the Vidocq workspace.

---

## DOCS-001 — Broken propagation of a Chappe fix to the staging container

- **Date**: 2026-05-09
- **Status**: FIXED (commits `vidocq-docs@fbaf155`, `vidocq-docs@7ef384d`)
- **Severity**: high (blocks delivery of any Chappe fix to staging)

### Symptom

After pushing a fix on `chappe/main` (commit `ef864e8`) and then pushing a
configuration change on `vidocq-docs/main`, the staging container kept serving
requests with the **old Chappe binary**. Several CI retrigger cycles did not
help:

- On curl: no visible `Server: Chappe/...` or `X-Chappe-Build`.
- In Portainer logs: `WARN: chappe-cli does not support --access-log
  (binary older than 500cb06)`.
- Yet `git log --oneline` on the Chappe side did contain the fix.

### Minimal repro

1. Push commit C1 on `chappe/main` introducing a new CLI flag.
2. Push commit C2 on `vidocq-docs/main` (any content) in the **same window**
   as the Chappe CI (before its `mvn deploy` has finished).
3. Wait for both CIs to complete.
4. `curl -I https://staging-doc.vidocq.dev/...` → the `Server` header is
   `openresty` (rewritten by NPM) and the Chappe image does not know the flag
   introduced by C1.

### Cause — three cascading traps

#### Trap 1 — Chappe vs vidocq-docs CI race

```
T0       push chappe@C1               → Chappe CI starts (build + test + mvn deploy ≈ 2-3 min)
T0+30s   push vidocq-docs@C2          → vidocq-docs CI starts (Antora + Docker build)
T0+1min  vidocq-docs Stage 1:
           mvn dependency:copy chappe-cli:0.1.0-SNAPSHOT:shaded
           → reposilite responds with the OLD snapshot
             (Chappe CI has not finished mvn deploy yet)
T0+2min  Chappe CI finishes deploy → snapshot updated on Maven side
T0+3min  vidocq-docs pushes an image that embeds the old jar
```

#### Trap 2 — BuildKit layer cache

Once the Chappe CI caught up, a retrigger of `vidocq-docs` (empty commit)
still cached the `RUN mvn dependency:copy ...` layer because the command had
not changed. The pre-cached jar was reused as-is.

The resulting OCI image has a new overall digest (because the following layers
— `COPY build/site` — changed), but the **Stage 1 layer remains broken**.
`<updatePolicy>always</updatePolicy>` in the mini Maven POM has no effect as
long as the `RUN` is not executed again.

#### Trap 3 — `Server` header masked by openresty

To verify which binary was running, we expected to read the `Server` header
injected by Chappe. But NPM (Nginx Proxy Manager) — the TLS front-end talking
to oauth2-proxy and then to Chappe — **rewrites** that header to
`Server: openresty` (default Nginx behavior unless `proxy_pass_header Server`
is enabled). No way to tell from the client side which binary was running
without access to Portainer.

### Fixes

| Trap | Fix | Commit |
|---|---|---|
| CI race | Docker entrypoint now does **feature detection**: `chappe-cli --help \| grep -q -- --access-log` before passing the flag. If missing, warn on stdout and start without access log → no more crash loop | `vidocq-docs@fbaf155` |
| BuildKit cache | `ARG CHAPPE_PULL_NONCE` injected into the `RUN`; the CI workflow passes `--build-arg CHAPPE_PULL_NONCE=$(date +%s)-${SHA}` on each build → different command → layer invalidated. Combined with `mvn -U`. Bonus: `unzip -p chappe-cli.jar chappe-build.properties` in build output to visually confirm which commit was pulled | `vidocq-docs@7ef384d` |
| Header rewritten | On the Chappe side: duplicate the header in a non-standard `X-Chappe-Build` that nginx forwards without rewriting | `chappe@8d670fb` |

### Validation

After the three fixes:
- curl-side header: `X-Chappe-Build: Chappe/0.1.0-SNAPSHOT+8d670fb0 (2026-05-09T19:43:04Z)`
- 624/624 burst requests on staging pass integrity (vs 43% failures pre-fix,
  see `chappe/BUG.md` CHAPPE-001).

### Lessons learned

- **Serialize pipelines** when A produces an artifact that B depends on.
  Ideal: trigger the `vidocq-docs` CI automatically *after* the Chappe CI
  succeeds (`workflow_run` or webhook), instead of letting both run in parallel.
- **Always invalidate BuildKit layers explicitly** when they depend on a mutable
  external resource (Maven snapshot, Docker `latest` tag). A dynamic `ARG` in
  the `RUN` is the simplest pattern.
- **Do not rely on the `Server` header** to identify a backend behind a reverse
  proxy. Duplicate into an `X-*` header or expose a dedicated endpoint
  (`/_<product>/version`).
- **Always log the pulled jar content** during the build (`unzip -p ... build.properties`):
  turns a 1h debug into a 30s debug.

---

## DOCS-002 — Local Antora build silently renders the last commit, not the working tree

- **Date**: 2026-08-11
- **Status**: FIXED on branch `fix/mani-layout-paths` (not yet merged)
- **Severity**: medium (silent — the build succeeds and looks right)
- **Affected**: `antora-playbook-local.yml`, all 16 content sources

### Symptom

Editing a page and running `npm run build` produced a site without the edit. No
warning; the build reported success. Antora's own log gave the clue:

```
"source":{... "refname":"fix/mani-layout-paths","reftype":"branch","worktree":false}
```

`worktree: false` — content was read from the git object store, not from disk.

### Minimal repro

```bash
cd vidocq-docs/main
sed -i '' 's/Vidocq/VIDOCQ-TEST/' content/home-en/modules/ROOT/pages/index.adoc
npm run build
grep -c VIDOCQ-TEST build/site/home/index.html   # 0 — the edit is not in the output
```

### Root cause

All 16 sources carried `worktrees: HEAD`. In
`@antora/content-aggregator/lib/aggregate-content.js` (3.1.14) only `'.'` and
`true` set `usePrimaryWorktree`; any other value is treated as a list of
patterns matched against the names of **linked** worktrees under
`.git/worktrees`. `HEAD` never matches one, so the primary worktree was never
used and Antora fell back to the branch tip.

`branches: HEAD` is a different key and was correct throughout — the two look
symmetrical but are not, which is what made this easy to write and hard to see.

### Fix

`worktrees: HEAD` → `worktrees: .` on all 16 sources, with a comment in the
playbook warning against "correcting" it back.

### Lessons learned

- **A preview tool that reads commits is worse than one that fails**: authors
  saw stale output and assumed their edit was wrong. Any silent fallback in a
  local feedback loop should be an error instead.
- `branches:` and `worktrees:` do not share a vocabulary in Antora — `HEAD` is
  meaningful for the first, meaningless for the second.

---

## DOCS-003 — Four cross-component xrefs unresolved on the landing pages

- **Date**: 2026-08-11
- **Status**: FIXED on branch `fix/mani-layout-paths` (not yet merged)
- **Severity**: low (two dead links per language, build still succeeds)
- **Affected**: `content/home-en/…/index.adoc`, `content/home-fr/…/index.adoc`

### Symptom

```
ERROR (asciidoctor): target of xref not found: vidocq:getting-started.adoc
ERROR (asciidoctor): target of xref not found: vidocq-fr:getting-started.adoc
```

Rendered as `<a href="#vidocq:getting-started.adoc" class="xref unresolved">`
although `build/site/vidocq/getting-started.html` was generated normally.

### Root cause

`xref:vidocq:getting-started.adoc` — a **single** colon. Antora reads the
segment before a single colon as a *module* name within the current component,
so it looked for module `vidocq` inside `home-en`. Cross-component references
need two colons (empty module = ROOT). Every other cross-component link in the
same file already used `::`, which is why only these four failed.

### Fix

`xref:vidocq::getting-started.adoc` (and `vidocq-fr::`), 4 occurrences. Verified:
zero `xref unresolved` anywhere in `build/site` afterwards.

### Lessons learned

- Introduced in `188ca27` and shipped since: an asciidoctor `ERROR` that does
  not fail the build gets normalised as noise. Worth a `--fail-on-error` style
  gate in CI.

---

## DOCS-004 — FR/EN toggle dead outside a web root (file://, sub-path deploys)

- **Date**: 2026-08-11
- **Status**: FIXED on branch `fix/mani-layout-paths` (not yet merged)
- **Severity**: medium (the site is unusable in one language when opened from disk)
- **Affected**: `ui-bundle/src/js/site.js`, `setupLangToggle()`

### Symptom

Opening `file:///…/build/site/champollion-fr/index.html` and clicking **EN**
does nothing. Only the French half of the site is reachable.

### Root cause

The toggle assumed the component is the **first** path segment and emitted a
root-absolute href:

```js
var component = parts[0]
el.setAttribute('href', '/' + newParts.join('/'))
```

Over `file://`, `location.pathname` is `/Users/…/build/site/champollion-fr/index.html`,
so `parts[0]` is `Users` and the computed target is `/Users-fr/…`. The same
assumption breaks any deployment under a sub-path (`https://host/docs/…`).

### Fix

Derive the page's depth below the site root from the UI asset path Antora
rewrites per page (`../_/js/site.js`, `../../_/js/site.js`, …), locate the
component segment by that depth instead of assuming index 0, and emit a
**relative** href (`../champollion/index.html`).

Verified with a stub-DOM harness driving the built bundle over six cases —
`file://` at depth 1 and 2, web root, sub-path deploy, directory URL without
`index.html`, and EN→FR — all previously failing or wrong, all passing after.

### Lessons learned

- **Root-absolute URLs in UI JS are a deployment assumption in disguise.** The
  generated HTML is careful to use relative asset paths; the JS silently was
  not, so the two disagreed as soon as the site left `/`.
- Antora already encodes the answer per page in the UI asset path — prefer
  reading that over reconstructing the site root from `location`.
