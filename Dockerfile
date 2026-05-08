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
FROM eclipse-temurin:25-jdk-alpine AS chappe-fetcher
ARG CHAPPE_VERSION
ARG MAVEN_REPO_URL
RUN apk add --no-cache maven
WORKDIR /tmp/fetch
# Mini-pom dédié à la résolution. Pas de transitives (chappe-cli est shaded).
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
      <id>vidocq-repolite</id>
      <url>${MAVEN_REPO_URL}</url>
      <snapshots><enabled>true</enabled><updatePolicy>always</updatePolicy></snapshots>
      <releases><enabled>true</enabled></releases>
    </repository>
  </repositories>
</project>
EOF
# `mavensettings` est un secret BuildKit (cf. workflow `--secret id=...`).
# Monté UNIQUEMENT pendant ce RUN, jamais dans les couches finales de l'image.
RUN --mount=type=secret,id=mavensettings,target=/root/.m2/settings.xml,required=true \
    mvn -B -ntp \
      dependency:copy \
      -Dartifact=io.vidocq.chappe:chappe-cli:${CHAPPE_VERSION}:jar:shaded \
      -DoutputDirectory=/opt/chappe \
      -DstripVersion=true \
      -DstripClassifier=true \
      -Dtransitive=false \
    && ls -lh /opt/chappe/chappe-cli.jar

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
