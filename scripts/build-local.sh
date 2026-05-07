#!/usr/bin/env bash
# Build local complet : UI bundle + site Antora.
# Usage :
#   bash scripts/build-local.sh                # tout
#   bash scripts/build-local.sh --skip-fonts   # sans télécharger les WOFF2
#   bash scripts/build-local.sh --ui-only      # juste le UI bundle
#   bash scripts/build-local.sh --site-only    # juste le site (UI doit être déjà bâti)
#   bash scripts/build-local.sh --serve        # build + lance un serveur statique sur :8080

set -euo pipefail

# Toujours se positionner à la racine du repo, peu importe d'où on lance.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_FONTS=0
UI_ONLY=0
SITE_ONLY=0
SERVE=0
ANTORA_VERSION="3.1.0"

for arg in "$@"; do
  case "$arg" in
    --skip-fonts) SKIP_FONTS=1 ;;
    --ui-only)    UI_ONLY=1 ;;
    --site-only)  SITE_ONLY=1 ;;
    --serve)      SERVE=1 ;;
    -h|--help)
      sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
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
  echo "--- 1/4 install des deps UI bundle ---"
  if [[ -f ui-bundle/package-lock.json ]]; then
    (cd ui-bundle && npm ci --no-audit --no-fund)
  else
    (cd ui-bundle && npm install --no-audit --no-fund)
  fi

  echo
  echo "--- 2/4 fetch version Chappe ---"
  node scripts/fetch-chappe-version.js

  if [[ "$SKIP_FONTS" -eq 0 ]]; then
    echo
    echo "--- 3/4 fetch fonts (best-effort) ---"
    bash scripts/fetch-fonts.sh || echo "[build-local] fetch-fonts.sh a échoué — fallback fonts système"
  else
    echo
    echo "--- 3/4 fonts SKIPPED (--skip-fonts) ---"
  fi

  echo
  echo "--- 4/4 build UI bundle ---"
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
for sib in vidocq vauban cassini champollion chappe foy mansart; do
  if [[ ! -d "../$sib/.git" ]]; then
    MISSING+=("$sib")
  fi
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "[build-local] Clones frères manquants : ${MISSING[*]}" >&2
  echo "[build-local] Antora va échouer sur les sources concernées." >&2
fi

npx --yes "antora@^$ANTORA_VERSION" antora-playbook-local.yml
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
