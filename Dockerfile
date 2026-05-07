# syntax=docker/dockerfile:1.7
#
# Vidocq documentation — image Docker.
# Stage 1 : build du UI bundle + génération Antora du site statique.
# Stage 2 : build du launcher Java `vidocq-docs-server` (jusqu'à ce que Chappe
#           expose une CLI standalone — cf. chappe-config.yml).
# Stage 3 : runtime JRE 25 minimal qui sert le site via le launcher.

# ------------------------------------------------------------------
# Stage 1 — Site Antora
# ------------------------------------------------------------------
FROM node:lts-alpine AS site-builder
WORKDIR /build

# Récupération des fonts (best-effort — fallback fonts système si KO)
COPY scripts/ ./scripts/
COPY ui-bundle/package*.json ./ui-bundle/
RUN cd ui-bundle && npm ci

# Téléchargement de la version Chappe (en CI : fetch HTTP, en local : pom)
COPY chappe-config.yml ./
COPY antora-playbook.yml ./
COPY antora-playbook-local.yml ./
COPY content/ ./content/
COPY ui-bundle/ ./ui-bundle/

RUN node scripts/fetch-chappe-version.js || true
RUN bash scripts/fetch-fonts.sh || echo "[fetch-fonts] best-effort, fallback fonts système"
RUN cd ui-bundle && npm run build

# Build Antora
RUN npx --yes antora@^3.1.0 antora-playbook.yml

# ------------------------------------------------------------------
# Stage 2 — Launcher Chappe
# ------------------------------------------------------------------
# Tant que `forge.vidocq.dev/vidocq/chappe` ne publie pas d'image officielle,
# on build le launcher en partant des sources frères dans l'arbre de build.
FROM eclipse-temurin:25-jdk-alpine AS chappe-builder
WORKDIR /build
RUN apk add --no-cache maven bash

# Le contexte de build doit inclure ../chappe (cf. .forgejo/workflows/build.yml).
# En CI on fait `docker build -f vidocq-docs/Dockerfile vidocq-docs/`. Pour
# inclure chappe : checkout supplémentaire et `docker build -f vidocq-docs/Dockerfile .`
COPY chappe/ ./chappe/
COPY vidocq-docs/server/ ./server/

# Install Chappe en local Maven repo (build complet + skip tests pour l'image)
WORKDIR /build/chappe
RUN if [ -f mvnw ]; then ./mvnw -ntp -DskipTests install ; else mvn -ntp -DskipTests install ; fi

# Compile le launcher
WORKDIR /build/server
RUN mvn -ntp -DskipTests package
RUN mvn -ntp dependency:copy-dependencies -DoutputDirectory=target/lib

# ------------------------------------------------------------------
# Stage 3 — Runtime
# ------------------------------------------------------------------
FROM eclipse-temurin:25-jre-alpine
WORKDIR /opt/vidocq-docs

# Site statique
COPY --from=site-builder /build/build/site /var/www/vidocq-docs

# Launcher + dépendances Chappe
COPY --from=chappe-builder /build/server/target/vidocq-docs-server-*.jar /opt/vidocq-docs/launcher.jar
COPY --from=chappe-builder /build/server/target/lib/ /opt/vidocq-docs/lib/

# Config (placeholder — utilisée quand la CLI Chappe sera dispo)
COPY chappe-config.yml /etc/chappe/config.yml

LABEL org.opencontainers.image.source="https://forge.vidocq.dev/vidocq/vidocq-docs"
LABEL org.opencontainers.image.licenses="Apache-2.0"
LABEL org.opencontainers.image.title="Vidocq Documentation"
LABEL org.opencontainers.image.description="Documentation Antora de l'écosystème Vidocq, servie par Chappe."

ENV CHAPPE_DOCROOT=/var/www/vidocq-docs
ENV CHAPPE_PORT=8080
ENV CHAPPE_BIND=0.0.0.0
ENV CHAPPE_CACHE="max-age=3600, public"
ENV STAGING=false

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://localhost:${CHAPPE_PORT}/healthz || exit 1

# `--enable-native-access=ALL-UNNAMED` couvre les zero-copy `FileChannel.transferTo()` de Chappe.
ENTRYPOINT ["java", "--enable-native-access=ALL-UNNAMED", \
            "-cp", "/opt/vidocq-docs/launcher.jar:/opt/vidocq-docs/lib/*", \
            "io.vidocq.docs.ChappeDocsServer"]
