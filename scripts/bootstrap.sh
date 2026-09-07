#!/usr/bin/env bash
# bootstrap.sh — Persiapan repo pi-office dari nol di mesin baru.
#
# Yang dilakukan (idempotent — aman dijalankan ulang):
#   1. Cek prasyarat (Node 22+, npm, git)
#   2. Install semua dependency (root, server, dashboard)
#   3. Build dashboard → dashboard/dist
#   4. Generate config.json lokal dari contoh (tanpa menimpa yang sudah ada)
#   5. Generate machine-id stabil
#   6. Pasang Pi extension mode project
#   7. Jalankan test e2e (opsional, gagal tidak menghentikan)
#   8. Start hub lokal
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

banner() { printf "\n\033[1;36m== %s ==\033[0m\n" "$1"; }

banner "1/7 Prasyarat"
command -v node >/dev/null || { echo "❌ Node.js tidak ditemukan. Butuh Node 22+ (disarankan 26)."; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "❌ Node $(node -v) terlalu tua — server memakai node:sqlite yang butuh Node 22+."
  exit 1
fi
echo "✅ Node $(node -v), npm $(npm -v)"

banner "2/7 Dependencies"
[ -f package-lock.json ] && npm ci || npm install
(cd server && { [ -f package-lock.json ] && npm ci || npm install; })
(cd dashboard && { [ -f package-lock.json ] && npm ci || npm install; })
echo "✅ Semua dependency terpasang"

banner "3/7 Build dashboard"
(cd dashboard && npm run build)
echo "✅ dashboard/dist siap"

banner "4/7 Config lokal"
if [ ! -f config.json ]; then
  cp config.example.json config.json
  chmod 600 config.json
  echo "✅ config.json dibuat dari contoh (hub lokal :4317). Edit bila perlu."
else
  echo "↷ config.json sudah ada — dibiarkan."
fi

banner "5/7 Machine identity"
if [ ! -f machine-id ]; then
  MACHINE_ID_PREFIX="office-machine-" \
    node -e 'console.log("office-machine-" + require("node:crypto").randomUUID())' > machine-id
  chmod 600 machine-id
  echo "✅ machine-id dibuat."
else
  echo "↷ machine-id sudah ada — dibiarkan."
fi

banner "6/7 Pi extension (global)"
npm run sync:extension
npm run test:extension || echo "⚠️  test:extension gagal — cek output di atas."

banner "7/7 Test e2e + start hub"
if npm test >/tmp/office-e2e.log 2>&1; then
  echo "✅ Test e2e lulus (log: /tmp/office-e2e.log)"
else
  echo "⚠️  Test e2e gagal — lihat /tmp/office-e2e.log (bootstrap lanjut)."
fi
bash "$REPO_DIR/start-dev.sh"

echo
echo "🎉 Repo pi-office siap. Buka http://127.0.0.1:4317 lalu jalankan `pi` di mana saja."
