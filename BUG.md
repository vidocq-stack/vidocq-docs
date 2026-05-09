# vidocq-docs — Registre des bugs

Format : un bug par section, daté, avec id court, symptôme, repro,
hypothèse de cause, statut. Convention héritée du workspace Vidocq.

---

## DOCS-001 — Propagation cassée d'un fix Chappe vers le container staging

- **Date** : 2026-05-09
- **Statut** : FIXED (commits `vidocq-docs@fbaf155`, `vidocq-docs@7ef384d`)
- **Sévérité** : élevée (bloque la livraison de tout fix Chappe en staging)

### Symptôme

Après push d'un fix sur `chappe/main` (commit `ef864e8`) puis push d'un changement
de configuration sur `vidocq-docs/main`, le container staging continuait de
servir les requêtes avec **l'ancien binaire Chappe**. Plusieurs cycles de
re-trigger CI n'amélioraient rien :

- Côté curl : aucun `Server: Chappe/...` ni `X-Chappe-Build` visible.
- Côté Portainer logs : `WARN: chappe-cli ne supporte pas --access-log
  (binaire antérieur à 500cb06)`.
- Pourtant `git log --oneline` côté chappe avait bien le fix.

### Repro minimal

1. Pousser un commit C1 sur `chappe/main` qui introduit un nouveau flag CLI.
2. Pousser un commit C2 sur `vidocq-docs/main` (peu importe son contenu)
   dans la **même fenêtre** que la CI chappe (avant qu'elle ait fini son
   `mvn deploy`).
3. Attendre que les deux CI se terminent.
4. `curl -I https://staging-doc.vidocq.dev/...` → le header `Server` est
   `openresty` (réécrit par NPM) et l'image Chappe ne connaît pas le flag
   introduit par C1.

### Cause — trois pièges en cascade

#### Piège 1 — Race CI `chappe` vs `vidocq-docs`

```
T0       push chappe@C1               → CI chappe démarre (build + test + mvn deploy ≈ 2-3 min)
T0+30s   push vidocq-docs@C2          → CI vidocq-docs démarre (Antora + Docker build)
T0+1min  vidocq-docs Stage 1 :
          mvn dependency:copy chappe-cli:0.1.0-SNAPSHOT:shaded
          → reposilite répond avec l'ANCIEN snapshot
            (CI chappe n'a pas encore fini mvn deploy)
T0+2min  CI chappe termine son deploy → snapshot mis à jour côté Maven
T0+3min  vidocq-docs push une image qui embarque l'ancien jar
```

#### Piège 2 — Cache layer BuildKit

Une fois la CI chappe rattrapée, retrigger de `vidocq-docs` (empty commit) :
**BuildKit cache le layer** `RUN mvn dependency:copy ...` parce que la commande
n'a pas changé. Le jar pré-caché est réutilisé tel quel.

L'image OCI résultante a une nouvelle digest globale (parce que les layers
suivants — `COPY build/site` — ont changé), mais le **layer Stage 1 reste
cassé**. `<updatePolicy>always</updatePolicy>` dans le mini-pom Maven n'a
aucun effet tant que le `RUN` n'est pas ré-exécuté.

#### Piège 3 — `Server` header masqué par openresty

Pour vérifier quel binaire tournait, attendu de lire le header `Server`
injecté par Chappe. Mais NPM (Nginx Proxy Manager) — frontal TLS qui parle
à oauth2-proxy puis à Chappe — **réécrit** ce header en `Server: openresty`
(comportement Nginx par défaut sauf `proxy_pass_header Server`). Pas moyen
de distinguer côté client quel binaire tournait sans accéder à Portainer.

### Correctifs

| Piège | Fix | Commit |
|---|---|---|
| Race CI | Entrypoint Docker fait du **feature-detection** : `chappe-cli --help \| grep -q -- --access-log` avant de passer le flag. Si absent, warning sur stdout, démarrage sans access log → plus de crash en boucle | `vidocq-docs@fbaf155` |
| Cache BuildKit | `ARG CHAPPE_PULL_NONCE` injecté dans le `RUN` ; le workflow CI passe `--build-arg CHAPPE_PULL_NONCE=$(date +%s)-${SHA}` à chaque build → commande différente → layer invalidé. Combiné avec `mvn -U`. Bonus : `unzip -p chappe-cli.jar chappe-build.properties` dans la sortie build pour valider visuellement quel commit a été pulled | `vidocq-docs@7ef384d` |
| Server réécrit | Côté Chappe : doubler le header dans un `X-Chappe-Build` non-standard que nginx propage sans réécrire | `chappe@8d670fb` |

### Validation

Après les trois fixes :
- Header côté curl : `X-Chappe-Build: Chappe/0.1.0-SNAPSHOT+8d670fb0 (2026-05-09T19:43:04Z)`
- 624/624 requêtes burst sur staging passent en intégrité (vs 43% fail
  pré-fix, cf. `chappe/BUG.md` CHAPPE-001).

### Leçons

- **Sérialiser les pipelines** quand A produit un artefact dont B dépend.
  Idéal : déclencher la CI `vidocq-docs` automatiquement *après* succès
  de la CI `chappe` (workflow `workflow_run` ou webhook), au lieu de
  laisser les deux tourner en parallèle.
- **Toujours invalider explicitement les layers BuildKit** qui dépendent
  d'une ressource externe mutable (snapshot Maven, latest tag Docker).
  Un `ARG` dynamique dans le `RUN` est le pattern le plus simple.
- **Ne pas dépendre du header `Server`** pour identifier un backend
  derrière un reverse proxy. Doubler dans un header `X-*` ou exposer un
  endpoint dédié (`/_<product>/version`).
- **Logger systématiquement le contenu du jar pulled** pendant le build
  (`unzip -p ... build.properties`) : transforme un debug d'1h en debug
  de 30s.
