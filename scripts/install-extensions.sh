#!/usr/bin/env bash
# install-extensions.sh — Pasang Pi extension untuk mesin ini.
#
# DUA HAL BERBEDA — jangan tertukar:
#
#   1. pi-office (telemetry kantor)  → WAJIB, dipasang GLOBAL lewat builder:
#        npm run sync:extension
#      (extension/*.ts digabung tools/build-global-extension.js menjadi
#       ~/.pi/agent/extensions/pi-office.ts — satu file yang di-auto-load Pi)
#
#   2. Extension pendukung opsional  → disalin dari extensions-global/:
#        ./scripts/install-extensions.sh extras
#      (soul-anchor, pi-token-footer, orca-*)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-all}"

install_extras() {
  local dst="$HOME/.pi/agent/extensions"
  mkdir -p "$dst"
  for ext in soul-anchor.ts pi-token-footer.ts orca-agent-status.ts orca-prefill.ts orca-titlebar-spinner.ts; do
    if [ -f "$REPO_DIR/extensions-global/$ext" ]; then
      cp "$REPO_DIR/extensions-global/$ext" "$dst/$ext"
      echo "✅ $ext → $dst/$ext"
    fi
  done
  echo
  echo "Catatan: orca-* hanya aktif di dalam pane Orca (butuh env ORCA_PANE_KEY)."
}

install_office() {
  echo "▶ Membangun & memasang pi-office extension ke global Pi…"
  (cd "$REPO_DIR" && npm run sync:extension)
  echo "▶ Verifikasi…"
  (cd "$REPO_DIR" && npm run test:extension || true)
}

case "$MODE" in
  office) install_office ;;
  extras) install_extras ;;
  all)
    install_office
    echo
    install_extras
    ;;
  *)
    echo "Pemakaian: $0 [office|extras|all]   (default: all)"
    exit 1
    ;;
esac
