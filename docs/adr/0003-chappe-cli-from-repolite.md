# ADR 0003 — Servir le site avec `chappe-cli` tiré depuis repolite

* Status: Accepted
* Date: 2026-05-07
* Deciders: Yann Blazart
* Supersedes: aspects "stage chappe-builder" et "launcher Java custom" de l'ADR 0001

## Context

L'ADR 0001 (Antora multi-component) ne disait rien sur la *façon de servir* le site. Le bootstrap initial de `vidocq-docs` a câblé deux solutions transitoires :

1. Un **stage Docker `chappe-builder`** qui clone `vidocq/chappe` comme repo frère, le compile (`mvn install`), puis assemble un classpath. Lourd (~3 min de build, plus le clone), et oblige le workflow Forgejo Actions à avoir un token avec scope `read:repository` sur un repo *autre* que le repo courant — ce qui ne marche pas avec le `${{ github.token }}` auto-injecté (limité au repo courant).
2. Un **launcher Java custom** (`server/src/main/java/io/vidocq/docs/ChappeDocsServer.java`) qui consomme l'API programmatique de Chappe — utile tant que Chappe n'avait pas de CLI standalone.

Les deux décisions étaient documentées comme transitoires, dépendantes de la livraison de **`chappe-cli`** côté Chappe.

Au moment de cet ADR, `chappe-cli` est livré :

* artefact Maven `io.vidocq.chappe:chappe-cli:0.1.0-SNAPSHOT` (avec classifier `shaded` pour le fat-jar)
* commande `chappe serve --root <dir> --port <p> --gzip [--config <yaml>]`
* publié sur `https://repo.vidocq.dev/snapshots` (repolite, l'instance Maven hébergée dans l'écosystème Vidocq)
* repolite a aussi un endpoint `/releases` pour les tags futurs

## Options considérées

### A. Continuer à compiler Chappe depuis ses sources dans le Dockerfile

* **−** Lourd (build complet + tests skip).
* **−** Couple `vidocq-docs` à la position d'un commit `chappe` (HEAD ou tag).
* **−** Exige le clone du repo `vidocq/chappe` dans le workflow CI → token avec scope `read:repository` étendu, complications quand un repo passe en privé.
* **+** Aucune dépendance sur l'infrastructure Maven.

### B. Builder une image OCI `chappe-cli` côté Chappe et l'utiliser comme `FROM` du runtime

* **+** Image runtime triviale : `FROM forge.vidocq.dev/vidocq/chappe-cli:X.Y.Z` puis `COPY` du site.
* **−** Demande un workflow CI côté Chappe qui publie cette image. Possible mais double les responsabilités d'image (jar + image).
* **−** Met la registry Forgejo OCI sur le chemin critique du build de `vidocq-docs`.

### C. Tirer le fat-jar `chappe-cli-shaded` depuis repolite (Maven)

* **+** Une seule source de vérité côté Chappe : la publication Maven.
* **+** Pas de clone de repo dans le workflow CI.
* **+** Le classifier `shaded` garantit qu'on tire un jar autoporteur (pas de transitives à résoudre).
* **+** Versionnable trivialement via le `--build-arg CHAPPE_VERSION=…`.
* **−** Dépendance sur la disponibilité de repolite pendant le build (acceptable, c'est l'infra Vidocq).
* **−** Nécessite Maven dans l'image builder (~50 Mo en plus pour le stage de fetch — le runtime final reste léger).

## Decision

**C** — fat-jar `chappe-cli` tiré de repolite à chaque build.

Le Dockerfile passe à 2 stages :

```
Stage 1 (alpine + curl)           : list & fetch chappe-cli-shaded.jar  → /opt/chappe/chappe-cli.jar
Stage 2 (eclipse-temurin:25-jre)  : COPY build/site + jar + entrypoint
```

**Note technique repolite** : la version actuelle de repolite n'expose pas le `maven-metadata.xml` au niveau SNAPSHOT (`/<group>/<artifact>/<version>-SNAPSHOT/maven-metadata.xml` → 404). Maven ne peut donc pas résoudre la coordonnée SNAPSHOT pour découvrir le timestamp courant. On bypass Maven : le stage `chappe-fetcher` liste le dossier SNAPSHOT via `curl`, sélectionne le dernier jar shaded par tri lexicographique sur `chappe-cli-X.Y.Z-YYYYMMDD.HHMMSS-N-shaded.jar`, et le télécharge. À l'avenir, configurer repolite pour générer ce metadata.xml permettra de revenir à `mvn dependency:copy`.

Le **build Antora est sorti du Dockerfile** : Antora doit cloner les 7 repos modules en HTTPS, ce qui demande des `~/.git-credentials`. Plutôt que de propager ces creds dans BuildKit (via `--secret` + helper), on garde la responsabilité du build Antora côté **runner / build local** ; le `docker build` se contente de `COPY build/site`. Cela simplifie les credentials et accélère le build (Antora n'est pas réinstallé à chaque image).

Le launcher Java custom (`server/`) est supprimé. La CLI Chappe (`chappe serve`) prend le relais à 100 %.

## Conséquences

* **Workflow Forgejo simplifié.** Plus de `Checkout chappe (frère)`. `REGISTRY_TOKEN` n'a plus besoin du scope `read:repository`.
* **Build plus rapide.** On ne compile plus Chappe — on télécharge un jar shaded déjà prêt.
* **Couplage sur la version Chappe explicite.** Le `--build-arg CHAPPE_VERSION` est passé au `docker build` ; pour pinner une version stable, surcharger dans le workflow ou en local.
* **`chappe-config.yml`** garde son rôle de documentation cible. Le launcher actuel utilise les flags CLI (`--root`, `--port`, `--gzip`) ; l'option `--config <yaml>` n'est pas encore branchée et arrivera quand la CLI Chappe consommera le YAML.
* **Repolite devient critique pour le build.** Si repolite est down, le build échoue. Acceptable à ce stade — pas de SLO formel sur l'infra interne.
* **Variable d'env `STAGING`** non encore propagée à Chappe : il manque côté CLI un mécanisme pour `Filter.addHeaderIfEnv` (le `Filter` existe en API mais pas exposé en flag CLI). Tracking : voir backlog Chappe.

## Liens

* `Dockerfile` (stages 1-3)
* `.forgejo/workflows/build.yml` (étape `Build & push image` avec `--build-arg`)
* Backlog Chappe : exposer `--header KEY=VALUE` et `--header-if-env VAR=VAL KEY=VALUE` côté CLI pour propager STAGING.
