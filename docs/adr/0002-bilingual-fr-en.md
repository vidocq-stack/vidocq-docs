# ADR 0002 — Documentation bilingue FR canonique + EN

* Status: Accepted
* Date: 2026-05-07
* Deciders: Yann Blazart

## Context

Le projet Vidocq est ancré dans un imaginaire historique français (Vidocq, Vauban, Cassini, Chappe, Foy, Mansart). Le français est la langue de travail première du projet, des commit messages et de la documentation interne. Mais l'écosystème Jakarta vit en anglais : la majorité des consommateurs potentiels d'un runtime MicroProfile / Jakarta REST ne parlent pas français.

La doc doit donc :

* avoir une **version FR canonique** (qualité native, pas de pidgin) ;
* avoir une **version EN traduite** complète (pas une traduction partielle) ;
* permettre la **bascule rapide entre langues** sur n'importe quelle page ;
* **ne pas privilégier l'EN sur le FR** dans l'URL (donc pas de `/en/` dans l'URL avec FR en deuxième classe).

## Options considérées

### Antora i18n natif

L'i18n d'Antora est marqué expérimental dans la documentation officielle. Il fonctionne via des fichiers de traduction superposés au composant principal, mais :

* la couverture HTML/UI n'est pas complète ;
* les exemples publics sont rares ;
* l'évolution future est incertaine.

Risque trop élevé pour une suite documentaire qui veut rester maintenable sur la durée.

### Fork par langue (un repo `<module>` et un repo `<module>-docs-en`)

Trop coûteux. Doublerait le nombre de repos. Désynchronisations garanties dès que la doc d'un module évolue.

### Sous-domaines `fr.docs.vidocq.dev` et `docs.vidocq.dev`

* Possible mais alourdit le déploiement.
* Le SEO est plus délicat (hreflang, canonicals).
* Pas de gain par rapport à des paths sur le même domaine.

### Composants parallèles `<module>` et `<module>-fr`

* Chaque module définit deux components Antora distincts dans son `docs/` : `<module>` (EN) et `<module>-fr` (FR).
* Tous deux sont packagés dans la même playbook.
* Le toggle FR/EN est implémenté **côté client** par un petit JS (`ui-bundle/src/js/site.js`) : si on est sur `/vauban/page.html`, le toggle FR pointe vers `/vauban-fr/page.html`. Si la page n'existe pas, fallback sur l'`index` du component cible.
* L'URL **n'a pas de préfixe `/fr` ou `/en`** : la langue est dans le nom du component, ce qui rend l'URL canonique (chaque page a son URL unique sans redirection).

## Decision

**Composants parallèles.**

* Les deux versions co-existent sur un pied d'égalité.
* Le **français est canonique** : on écrit d'abord en FR, puis on traduit en EN. Pas l'inverse.
* La structure de pages est **identique** entre les deux versions : même nombre de pages, mêmes ancres, même nav. Cela permet au toggle JS de calculer trivialement l'URL homologue.
* Les exemples de code, noms d'API, FQN sont **identiques** — seul le texte naturel autour change.

## Conséquences

* **Discipline éditoriale** : toute nouvelle page écrite en FR doit être traduite en EN avant merge. Pas de page FR-only ni EN-only.
* **CI** (à venir) : un linter pourrait vérifier la parité entre `docs/fr/` et `docs/en/` (mêmes fichiers, même nombre d'ancres).
* **SEO** : les balises `hreflang` doivent être ajoutées dans le `<head>` pour annoncer les versions FR↔EN. *(à implémenter dans le UI bundle)*
* **Page d'accueil** : `home-fr` est `start_page` par défaut (cohérent avec le positionnement du projet). Le toggle EN renverra vers `home`.

## Alternatives écartées (résumé)

| Option                     | Verdict | Raison |
|---------------------------|---------|--------|
| Antora i18n natif         | ✗ | Expérimental, risque sur la durée |
| Fork par langue           | ✗ | Multiplication des repos, désync |
| Sous-domaines             | ✗ | Lourd, SEO complexe, pas de gain |
| **Components parallèles** | ✓ | Stable, simple, sans préfixe URL |

## Liens

* https://docs.antora.org/antora/latest/component-version/
* https://docs.antora.org/antora/latest/component-with-no-master/
