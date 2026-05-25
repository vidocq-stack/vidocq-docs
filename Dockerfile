# syntax=docker/dockerfile:1.7
#
# Vidocq documentation — image Docker.
#
# Le site Antora est buildé HORS Dockerfile (par le runner / build local) :
# Antora clone les repos modules PUBLICS sur Codeberg en HTTPS anonyme.
# On garde la responsabilité du build Antora côté runner ; le `docker build`
# se contente de COPY le résultat.
#
# Pré-requis du `docker build` : `./build/site/` doit exister.
#   - en CI : étape "Build Antora site" du workflow le produit
#   - en local : `bash scripts/build-local.sh` le produit
#
# Stage 1 : tire le fat-jar chappe-cli-shaded depuis le Central Portal
#           snapshots (public, anonyme), via Maven.
# Stage 2 : runtime JRE 25 minimal qui sert le site via `chappe-cli`.

ARG CHAPPE_VERSION=0.1.0-SNAPSHOT
ARG MAVEN_REPO_URL=https://central.sonatype.com/repository/maven-snapshots
# Invalide le layer dependency:copy à chaque build CI : sans ça BuildKit
# réutilise le jar caché de la précédente exécution même si un nouveau
# SNAPSHOT a été publié entre-temps. Le workflow CI passe `--build-arg
# CHAPPE_PULL_NONCE=$(date +%s)` pour forcer l'invalidation.
ARG CHAPPE_PULL_NONCE=initial

# ------------------------------------------------------------------
# Stage 1 — Fetch chappe-cli (fat-jar shaded) depuis le Central snapshots
# ------------------------------------------------------------------
FROM eclipse-temurin:25-jdk-alpine AS chappe-fetcher
ARG CHAPPE_VERSION
ARG MAVEN_REPO_URL
ARG CHAPPE_PULL_NONCE
RUN apk add --no-cache maven
WORKDIR /tmp/fetch
# Mini-pom dédié à la résolution. Pas de transitives (chappe-cli est shaded).
# Le repository est public (Central Portal snapshots) : aucun <server> credential.
RUN <<EOF cat > pom.xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>vidocq.docs.fetch</groupId>
  <artifactId>fetch</artifactId>
  <version>1</version>
  <packaging>pom</packaging>
  <repositories>
    <repository>
      <id>central-snapshots</id>
      <url>${MAVEN_REPO_URL}</url>
      <snapshots><enabled>true</enabled><updatePolicy>always</updatePolicy></snapshots>
      <releases><enabled>true</enabled></releases>
    </repository>
  </repositories>
</project>
EOF
# Le repo Central snapshots est public : résolution anonyme, aucun secret
# BuildKit ni settings.xml requis.
#
# Note : `-DstripVersion=true -DstripClassifier=true` ne fonctionnent pas sur
# les SNAPSHOT timestampés (`0.1.0-YYYYMMDD.HHMMSS-N`) avec dependency-plugin
# 3.7.0 — le fichier garde son nom complet. On fait un `mv` explicite après.
RUN echo "Pull nonce: ${CHAPPE_PULL_NONCE}" \
    && mvn -B -ntp -U \
      dependency:copy \
      -Dartifact=io.vidocq.chappe:chappe-cli:${CHAPPE_VERSION}:jar:shaded \
      -DoutputDirectory=/opt/chappe \
      -Dtransitive=false \
    && mv /opt/chappe/chappe-cli-*-shaded.jar /opt/chappe/chappe-cli.jar \
    && ls -lh /opt/chappe/chappe-cli.jar \
    && unzip -p /opt/chappe/chappe-cli.jar chappe-build.properties || true

# ------------------------------------------------------------------
# Stage 2 — Runtime
# ------------------------------------------------------------------
FROM eclipse-temurin:25-jre-alpine
WORKDIR /opt/vidocq-docs

# Site Antora pré-bâti côté runner / local (cf. en-tête).
COPY build/site /var/www/vidocq-docs
COPY --from=chappe-fetcher /opt/chappe/chappe-cli.jar /opt/vidocq-docs/chappe-cli.jar
COPY chappe-config.yml /etc/chappe/config.yml

# Endpoint /healthz statique pour le HEALTHCHECK Docker.
# `chappe serve` est un static-file server : il faut donc qu'un vrai fichier
# existe pour que GET /healthz retourne 200. Pas un endpoint applicatif.
RUN echo "ok" > /var/www/vidocq-docs/healthz

# Wrapper minimal : traduit les env vars en flags CLI Chappe.
COPY <<EOF /opt/vidocq-docs/entrypoint.sh
#!/bin/sh
set -eu
DOCROOT="\${CHAPPE_DOCROOT:-/var/www/vidocq-docs}"
PORT="\${CHAPPE_PORT:-8080}"
ARGS="serve --root \${DOCROOT} --port \${PORT}"
[ "\${CHAPPE_GZIP:-true}" = "true" ] && ARGS="\${ARGS} --gzip"

# Feature detection : --access-log a été introduit dans chappe@500cb06.
# Pour éviter de crasher l'image quand le SNAPSHOT pull-é est antérieur
# (race CI chappe vs vidocq-docs), on ne passe le flag que s'il est exposé
# dans le help. Cache le résultat pour éviter un double-démarrage JVM.
HELP_OUTPUT=\$(java -jar /opt/vidocq-docs/chappe-cli.jar --help 2>&1 || true)
if [ "\${CHAPPE_ACCESS_LOG:-true}" = "true" ]; then
  if echo "\$HELP_OUTPUT" | grep -q -- '--access-log'; then
    ARGS="\${ARGS} --access-log"
  else
    echo "[vidocq-docs] WARN: chappe-cli ne supporte pas --access-log (binaire antérieur à 500cb06), pas d'access log"
  fi
fi
echo "[vidocq-docs] chappe \${ARGS}  (staging=\${STAGING:-false})"
exec java -jar /opt/vidocq-docs/chappe-cli.jar \${ARGS}
EOF
RUN chmod +x /opt/vidocq-docs/entrypoint.sh

LABEL org.opencontainers.image.source="https://codeberg.org/Vidocq/vidocq-docs"
LABEL org.opencontainers.image.licenses="Apache-2.0"
LABEL org.opencontainers.image.title="Vidocq Documentation"
LABEL org.opencontainers.image.description="Documentation Antora de l'écosystème Vidocq, servie par chappe-cli."

ENV CHAPPE_DOCROOT=/var/www/vidocq-docs
ENV CHAPPE_PORT=8080
ENV CHAPPE_BIND=0.0.0.0
ENV CHAPPE_GZIP=true
ENV CHAPPE_ACCESS_LOG=true
ENV STAGING=false

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://localhost:${CHAPPE_PORT}/healthz || exit 1

ENTRYPOINT ["/opt/vidocq-docs/entrypoint.sh"]
