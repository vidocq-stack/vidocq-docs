#!/usr/bin/env bash
# Récupère les WOFF2 utilisés par le UI bundle Vidocq.
# Sources : Google Fonts (statiques) — repackagés en WOFF2 à hébergement local.
# AUCUNE référence à Google Fonts en CDN dans le bundle final.
#
# Usage : bash scripts/fetch-fonts.sh
#
# Les fichiers atterrissent dans ui-bundle/src/font/ et sont vendorés au bundle.
# Si la connexion échoue, le bundle utilise les fonts système en fallback.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/ui-bundle/src/font"
mkdir -p "$DEST"

declare -a FONTS=(
  "https://fonts.gstatic.com/s/ebgaramond/v30/SlGDmQSNjdsmc35JDF1K5FRyV0M.woff2|eb-garamond-regular.woff2"
  "https://fonts.gstatic.com/s/ebgaramond/v30/SlGFmQSNjdsmc35JDF1K5GRwSDw_ZA.woff2|eb-garamond-italic.woff2"
  "https://fonts.gstatic.com/s/ebgaramond/v30/SlGDmQSNjdsmc35JDF1K5FRyV0Mx.woff2|eb-garamond-semibold.woff2"
  "https://fonts.gstatic.com/s/cormorantgaramond/v17/co3YmX5slCNuHLi8bLeY9MK7whWMhyjornFLsS6V7w.woff2|cormorant-garamond-semibold.woff2"
  "https://fonts.gstatic.com/s/cormorantgaramond/v17/co3YmX5slCNuHLi8bLeY9MK7whWMhyjQqXFLsS6V7w.woff2|cormorant-garamond-bold.woff2"
  "https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPVmUsaaDhw.woff2|jetbrains-mono-regular.woff2"
  "https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPVmUsaaDhw.woff2|jetbrains-mono-semibold.woff2"
)

for entry in "${FONTS[@]}"; do
  url="${entry%%|*}"
  name="${entry##*|}"
  out="$DEST/$name"
  if [[ -f "$out" ]]; then
    echo "[fetch-fonts] $name déjà présent, skip"
    continue
  fi
  echo "[fetch-fonts] $name"
  if ! curl -fsSL "$url" -o "$out"; then
    echo "[fetch-fonts] ÉCHEC pour $name (URL : $url) — fallback sur fonts système" >&2
    rm -f "$out"
  fi
done

echo "[fetch-fonts] Terminé. Vendoré dans $DEST"
