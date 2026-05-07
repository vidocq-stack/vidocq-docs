# syntax=docker/dockerfile:1.7
#
# Vidocq documentation — image Docker.
# Stage 1 : build UI bundle + Antora.
# Stage 2 : tire le fat-jar chappe-cli-shaded depuis repolite (Maven).
# Stage 3 : runtime JRE 25 minimal qui sert le site via `chappe-cli`.
#
# ⇢ Plus de stage chappe-builder (compilation depuis sources).
# ⇢ Plus de launcher Java custom : la CLI standalone Chappe (`chappe serve`)
#   prend le relais. Cf. ADR-0003.

ARG CHAPPE_VERSION=0.1.0-SNAPSHOT
ARG MAVEN_REPO_URL=https://repo.vidocq.dev/snapshots

# ------------------------------------------------------------------
# Stage 1 — Site Antora
# ------------------------------------------------------------------
FROM node:lts-alpine AS site-builder
WORKDIR /build
COPY ui-bundle/package*.json ./ui-bundle/
RUN cd ui-bundle && npm ci
COPY scripts/ ./scripts/
COPY antora-playbook.yml ./
COPY content/ ./content/
COPY ui-bundle/ ./ui-bundle/
RUN node scripts/fetch-chappe-version.js || echo "[fetch-chappe-version] best-effort"
RUN cd ui-bundle && npm run build
RUN npx --yes antora@^3.1.0 antora-playbook.yml

# ------------------------------------------------------------------
# Stage 2 — Fetch chappe-cli (fat-jar shaded) depuis repolite
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
RUN mvn -B -ntp \
      dependency:copy \
      -Dartifact=io.vidocq.chappe:chappe-cli:${CHAPPE_VERSION}:jar:shaded \
      -DoutputDirectory=/opt/chappe \
      -DstripVersion=true \
      -DstripClassifier=true \
      -Dtransitive=false \
    && ls -lh /opt/chappe/chappe-cli.jar

# ------------------------------------------------------------------
# Stage 3 — Runtime
# ------------------------------------------------------------------
FROM eclipse-temurin:25-jre-alpine
WORKDIR /opt/vidocq-docs

COPY --from=site-builder /build/build/site /var/www/vidocq-docs
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
