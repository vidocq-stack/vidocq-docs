# syntax=docker/dockerfile:1.7
#
# Vidocq documentation — image Docker.
#
# Le site Antora est buildé HORS Dockerfile (par le runner / build local) :
# Antora doit cloner les 7 repos modules en HTTPS, ce qui demande des
# `~/.git-credentials`. Plutôt que de propager ces creds dans BuildKit
# (via --secret + helper), on garde la responsabilité du build Antora
# côté runner ; le `docker build` se contente de COPY le résultat.
#
# Pré-requis du `docker build` : `./build/site/` doit exister.
#   - en CI : étape "Build Antora site" du workflow le produit
#   - en local : `bash scripts/build-local.sh` le produit
#
# Stage 1 : tire le fat-jar chappe-cli-shaded depuis repolite (Maven).
# Stage 2 : runtime JRE 25 minimal qui sert le site via `chappe-cli`.

ARG CHAPPE_VERSION=0.1.0-SNAPSHOT
ARG MAVEN_REPO_URL=https://repo.vidocq.dev/snapshots

# ------------------------------------------------------------------
# Stage 1 — Fetch chappe-cli (fat-jar shaded) depuis repolite
# ------------------------------------------------------------------
# Maven n'est pas utilisable ici : repolite n'expose pas le
# `maven-metadata.xml` au niveau version SNAPSHOT, donc `mvn dependency:*`
# ne sait pas résoudre le timestamp courant. On fait l'inverse : on
# liste le dossier SNAPSHOT via curl, on prend le dernier shaded.jar par
# tri lexicographique (les timestamps `YYYYMMDD.HHMMSS-N` sont triables).
FROM alpine:3 AS chappe-fetcher
ARG CHAPPE_VERSION
ARG MAVEN_REPO_URL
RUN apk add --no-cache curl
WORKDIR /opt/chappe
# `mavencreds` est un secret BuildKit, contenu attendu : `user:token` (1 ligne).
# Monté UNIQUEMENT pendant ce RUN, jamais dans une couche finale.
RUN --mount=type=secret,id=mavencreds,target=/run/secrets/mavencreds,required=true \
    set -eu; \
    CREDS=$(cat /run/secrets/mavencreds); \
    DIR="${MAVEN_REPO_URL%/}/io/vidocq/chappe/chappe-cli/${CHAPPE_VERSION}/"; \
    echo "Listing $DIR"; \
    LATEST=$(curl -fsSL -u "$CREDS" "$DIR" \
              | grep -oE 'chappe-cli-[0-9.]+-[0-9.-]+-shaded\.jar' \
              | sort -V | tail -1); \
    [ -n "$LATEST" ] || { echo "ERROR: no shaded jar found in $DIR" >&2; exit 1; }; \
    echo "Fetching: $LATEST"; \
    curl -fsSL -u "$CREDS" "${DIR}${LATEST}" -o /opt/chappe/chappe-cli.jar; \
    ls -lh /opt/chappe/chappe-cli.jar

# ------------------------------------------------------------------
# Stage 2 — Runtime
# ------------------------------------------------------------------
FROM eclipse-temurin:25-jre-alpine
WORKDIR /opt/vidocq-docs

# Site Antora pré-bâti côté runner / local (cf. en-tête).
COPY build/site /var/www/vidocq-docs
COPY --from=chappe-fetcher /opt/chappe/chappe-cli.jar /opt/vidocq-docs/chappe-cli.jar
COPY chappe-config.yml /etc/chappe/config.yml

# Wrapper minimal : traduit les env vars en flags CLI Chappe.
COPY <<EOF /opt/vidocq-docs/entrypoint.sh
#!/bin/sh
set -eu
DOCROOT="\${CHAPPE_DOCROOT:-/var/www/vidocq-docs}"
PORT="\${CHAPPE_PORT:-8080}"
ARGS="serve --root \${DOCROOT} --port \${PORT}"
[ "\${CHAPPE_GZIP:-true}" = "true" ] && ARGS="\${ARGS} --gzip"
echo "[vidocq-docs] chappe \${ARGS}  (staging=\${STAGING:-false})"
exec java --enable-preview -jar /opt/vidocq-docs/chappe-cli.jar \${ARGS}
EOF
RUN chmod +x /opt/vidocq-docs/entrypoint.sh

LABEL org.opencontainers.image.source="https://forge.vidocq.dev/vidocq/vidocq-docs"
LABEL org.opencontainers.image.licenses="Apache-2.0"
LABEL org.opencontainers.image.title="Vidocq Documentation"
LABEL org.opencontainers.image.description="Documentation Antora de l'écosystème Vidocq, servie par chappe-cli."

ENV CHAPPE_DOCROOT=/var/www/vidocq-docs
ENV CHAPPE_PORT=8080
ENV CHAPPE_BIND=0.0.0.0
ENV CHAPPE_GZIP=true
ENV STAGING=false

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://localhost:${CHAPPE_PORT}/healthz || exit 1

ENTRYPOINT ["/opt/vidocq-docs/entrypoint.sh"]
