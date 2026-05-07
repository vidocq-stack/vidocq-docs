# ADR 0001 — Antora multi-component

* Status: Accepted
* Date: 2026-05-07
* Deciders: Yann Blazart

## Context

L'écosystème Vidocq compte sept dépôts indépendants (`vidocq`, `vauban`, `cassini`, `champollion`, `chappe`, `foy`, `mansart`), chacun avec son propre cycle de release. Une documentation unifiée doit :

* lire le contenu **dans chaque repo** (la doc vit avec le code, pas dans un repo séparé) ;
* permettre des **versions parallèles** par composant (Vauban 0.1 + Cassini 0.2 sans conflit) ;
* produire un site statique servi par Chappe ;
* rester **lisible en l'absence de toute infra runtime** (pas de service backend pour la doc).

## Options considérées

### MkDocs (Material)

* **+** Excellent thème, écosystème mature.
* **+** Peu de friction côté contributeur Python.
* **−** Multi-repo : pas de support natif. Plugin `monorepo` ou `multirepo` mais marginal et bricolé.
* **−** Versioning par component : possible via `mike`, mais lié à branches Git distinctes par version.
* **−** AsciiDoc en source : possible via plugin tiers, qualité variable.

### Docusaurus

* **+** Stack JS familière, beaucoup de templates.
* **+** Versioning intégré.
* **−** Pas multi-repo natif (workspaces possibles, mais lourds).
* **−** Markdown uniquement (pas d'AsciiDoc) — incompatible avec l'écriture Java/Jakarta historique des contributeurs.
* **−** React / MDX : surface d'attaque importante pour un site qui devrait être statique pur.

### Hugo

* **+** Build extrêmement rapide.
* **+** Statique pur, déploiement trivial.
* **−** Pas multi-repo, ni multi-component, ni versioning natif.
* **−** Markdown uniquement.
* **−** Theming = templates Go, courbe d'apprentissage spécifique.

### Antora

* **+** **Conçu** pour la doc multi-repo (`content.sources` lit N dépôts Git).
* **+** **Conçu** pour le multi-component versionné (`name: vauban`, `version: 0.1`).
* **+** AsciiDoc natif — meilleur que Markdown sur les blocs techniques (admonitions, tables, includes).
* **+** Build statique, sortie HTML pur, pas de JS lourd côté client.
* **−** Écosystème de plugins moins riche que MkDocs/Docusaurus.
* **−** Le UI bundle Handlebars demande un investissement initial (mais c'est ce qu'on veut pour le style XIXᵉ).
* **−** i18n natif : expérimental.

## Decision

Antora 3.x est retenu.

## Conséquences

* Chaque repo de module porte un répertoire `docs/` que la *playbook* lit comme source.
* Le UI bundle (`ui-bundle/`) est custom, écrit à la main : Handlebars + CSS vanilla + ~60 lignes de JS.
* L'i18n est implémenté **par dédoublement explicite des components** (`vauban` et `vauban-fr`), pas via Antora i18n. Voir [ADR 0002](0002-bilingual-fr-en.md).
* Le site final est entièrement statique, servi par Chappe.

## Liens

* https://docs.antora.org/
* https://docs.antora.org/antora/latest/playbook/
