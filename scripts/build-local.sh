#!/usr/bin/env bash
# Build local complet : UI bundle + site Antora.
# Usage :
#   bash scripts/build-local.sh                # tout
#   bash scripts/build-local.sh --ui-only      # juste le UI bundle
#   bash scripts/build-local.sh --site-only    # juste le site (UI doit être déjà bâti)
#   bash scripts/build-local.sh --serve        # build + lance un serveur statique sur :8080
#
# Les fonts (EB Garamond, Cormorant Garamond, JetBrains Mono) sont auto-hébergées
# via les packages npm @fontsource/*, copiées dans le bundle par la task gulp `fonts`.
# Aucun appel CDN à l'exécution.

set -euo pipefail

# Toujours se positionner à la racine du repo, peu importe d'où on lance.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

UI_ONLY=0
SITE_ONLY=0
SERVE=0

for arg in "$@"; do
  case "$arg" in
    --ui-only)    UI_ONLY=1 ;;
    --site-only)  SITE_ONLY=1 ;;
    --serve)      SERVE=1 ;;
    --skip-fonts) echo "[build-local] --skip-fonts ignoré (fonts auto-incluses via @fontsource)." >&2 ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Argument inconnu : $arg" >&2; exit 2 ;;
  esac
done

echo "=== vidocq-docs build local ==="
echo "ROOT = $ROOT"

# ------------------------------------------------------------------
# Pré-checks
# ------------------------------------------------------------------
need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Outil requis manquant : $1" >&2; exit 1; }
}
need node
need npm
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "Node ≥ 20 requis (trouvé $(node --version))." >&2
  exit 1
fi

# ------------------------------------------------------------------
# UI bundle
# ------------------------------------------------------------------
if [[ "$SITE_ONLY" -eq 0 ]]; then
  echo
  echo "--- 1/3 install des deps UI bundle (incl. @fontsource/*) ---"
  if [[ -f ui-bundle/package-lock.json ]]; then
    (cd ui-bundle && npm ci --no-audit --no-fund)
  else
    (cd ui-bundle && npm install --no-audit --no-fund)
  fi

  echo
  echo "--- 2/3 fetch version Chappe ---"
  node scripts/fetch-chappe-version.js

  echo
  echo "--- 3/3 build UI bundle (CSS + JS + fonts + zip) ---"
  (cd ui-bundle && npm run build)
  echo "[build-local] UI bundle : $ROOT/ui-bundle/build/ui-bundle.zip"
fi

if [[ "$UI_ONLY" -eq 1 ]]; then
  echo
  echo "Terminé (UI seulement)."
  exit 0
fi

# ------------------------------------------------------------------
# Site Antora
# ------------------------------------------------------------------
echo
echo "--- Antora site ---"
if [[ ! -f ui-bundle/build/ui-bundle.zip ]]; then
  echo "ui-bundle/build/ui-bundle.zip absent — relance sans --site-only ou avec --ui-only d'abord." >&2
  exit 1
fi

# Vérifie que les sept clones frères sont là (sinon Antora va se plaindre).
MISSING=()
for sib in vidocq-mps vauban ravel cassini champollion chappe foy mansart; do
  if [[ ! -d "../$sib/.git" ]]; then
    MISSING+=("$sib")
  fi
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "[build-local] Clones frères manquants : ${MISSING[*]}" >&2
  echo "[build-local] Antora va échouer sur les sources concernées." >&2
fi

# Installe les deps Antora racine (antora CLI + asciidoctor-kroki) si absentes.
# Le `package.json` racine épingle les versions ; pas de `npm install` ad-hoc.
if [[ ! -d node_modules/@antora ]]; then
  echo "[build-local] install des deps Antora (root package.json)…"
  if [[ -f package-lock.json ]]; then
    npm ci --no-audit --no-fund
  else
    npm install --no-audit --no-fund
  fi
fi

# `node_modules/.bin/antora` est présent grâce au package.json racine.
node_modules/.bin/antora antora-playbook-local.yml
echo "[build-local] Site : $ROOT/build/site"

# ------------------------------------------------------------------
# Serve (optionnel)
# ------------------------------------------------------------------
if [[ "$SERVE" -eq 1 ]]; then
  echo
  echo "--- serve sur http://localhost:8080 ---"
  if command -v python3 >/dev/null 2>&1; then
    cd build/site && python3 -m http.server 8080
  elif command -v python >/dev/null 2>&1; then
    cd build/site && python -m http.server 8080
  else
    npx --yes http-server build/site -p 8080
  fi
fi

echo
echo "Terminé."
