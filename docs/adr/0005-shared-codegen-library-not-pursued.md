# ADR 0005 — Shared code-generation library across bricks

* Status: Not pursued
* Date: 2026-10-28
* Deciders: Yann Blazart
* Proposed by: Antoine Sabot-Durand, in [vidocq#70](https://codefloe.com/Vidocq/vidocq/issues/70)

## Context

Every Vidocq brick generates code at build time (annotation processors and
Maven plugins) instead of using runtime reflection. The question raised in
vidocq#70: should the bricks share one code-generation library, so that the
common mechanics are written once?

To answer it, the build-time codegen of 11 repositories was inventoried on
2026-10-27 (vauban, cassini, cyrano, grimm, dirac, champollion, mansart,
chappe, foy, vidocq, erasmus; ibarra, peano, ravel, knock, heisenberg,
humboldt and cervantes have none), test code excluded: about **16,000
lines**, in **11 annotation processors** and **7 Maven plugins**.

### What is really duplicated

| Mechanic | Where | Lines saved |
|---|---|---|
| Java string-literal escaping | cyrano, grimm, dirac, foy, champollion, cassini | ~90 |
| `META-INF/services` written from a processor | cassini, cyrano, grimm, dirac, foy, mansart, champollion, vauban | ~130 |
| Annotation-mirror readers | cassini, mansart, vauban, vidocq, foy | ~80 |
| Package / simple-name split | vauban, mansart, champollion, vidocq | ~20 |
| `module-info` rewrite | vauban, cassini (vidocq already reuses vauban's) | ~60 |
| Mojo running javac with a processor over dependency jars | champollion, mansart | ~60 |
| Class scanning in a Maven plugin | mansart vs `vauban-indexer` | ~80 |
| **Build-time total** | | **≈ 450–520, about 3 %** |

Box/unbox tables and emitters (Class-File API) are also near-duplicated in
cassini, mansart, cyrano and vauban (~120 lines), but that is **runtime**
code. The other ~97 % is domain rendering (CDI beans and proxies, JAX-RS
adapters, Rest Client proxies, JSON-B bindings, Jakarta Data repositories,
OpenAPI and metrics companions). The processors share no skeleton beyond the
small helpers above, and none uses a shared writer: each renders through
`Filer.createSourceFile`.

### What a shared library would cost

* **9 repositories** would take a processor-path dependency on it (vauban,
  cassini, cyrano, grimm, dirac, champollion, mansart, foy, vidocq) — and the
  runtime of cassini, cyrano and mansart too if the box/unbox helpers moved.
* The bricks are released independently. Every change to the library would
  force a coordinated bump of all 9, and it would become one more upstream of
  the TCK runners we keep decoupled on purpose.
* Precedents point the same way: the MicroProfile "CDI toolkit" idea (June
  2026) was dropped for the same reason (no real common core, release
  coupling across 7 bricks), and `vidocq-runtime-codegen-commons` (378 lines)
  ended up used by vidocq's plugin only.

## Decision

**No shared code-generation library.** Saving about 500 lines (3 %) does not
justify coupling 9 independently released repositories. Each brick keeps its
own codegen; consistency comes from conventions, not from a dependency.

## Consequences

Follow-ups:

1. **Fix the divergences that are bugs.** The inventory found one: cassini's
   `escapeString` escapes only `\` and `"`, so a `@Path` or `@DefaultValue`
   value containing a newline or a tab produces generated source that does not
   compile. Being fixed in cassini (logged in `cassini/BUG.md`, test first).
2. **A "codegen conventions" page** in vidocq-docs giving the reference
   version of each small helper (string-literal escaping, services writer,
   annotation-mirror reader, `module-info` rewrite). Bricks align on it by
   copying, with no dependency.
3. **Move mansart's class scanning onto `vauban-indexer`.** Mansart already
   depends on Vauban, so this adds no coupling.

## Revisit when

* the duplicated helpers grow well beyond a few hundred lines, or
* a brick needs a shared **runtime** helper (not only build-time code), or
* the bricks move to a single coordinated release train, removing the
  coupling cost.

## Links

* Study and discussion: https://codefloe.com/Vidocq/vidocq/issues/70
