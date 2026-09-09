#!/bin/bash
# Start ORCA24 Coworking Hub — satu proses di :4317 yang menyajikan API, WS hub, DAN
# dashboard Angular hasil build. Tidak ada tunnel/cloud, tidak ada port kedua.
#
# Kenapa tidak pakai ng serve lagi: `npm run build` menaruh hasilnya di
# dashboard/dist dan server menyajikannya sendiri, jadi Orca cukup embed satu
# origin. Kalau mau HMR saat hack dashboard: `npm run dashboard` (4200, proxy ke 4317).
#
# PENTING: pakai `setsid` supaya proses TIDAK ikut mati saat shell yang
# men-launch-nya keluar.
set -e

# Auto-detect OFFICE_DIR dari lokasi script ini (sumber kebenaran)
OFFICE_DIR="${OFFICE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
PORT="${OFFICE_PORT:-4317}"
OFFICE_HOST="${OFFICE_HOST:-127.0.0.1}"
cd "$OFFICE_DIR"

# Matikan instance lama — HANYA lewat PID file yang kita tulis sendiri
stop_recorded() {
  local file="$OFFICE_DIR/$1" pid cmdline
  [ -f "$file" ] || return 0
  pid=$(tr -dc '0-9' < "$file")
  if [ -n "$pid" ] && [ -d "/proc/$pid" ]; then
    cmdline=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
    case "$cmdline" in
      *server/src/index.js*)
        kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
        echo "🛑 Menghentikan hub lama (pid $pid)"
        # Tunggu port lepas SEBELUM melanjut. Tanpa ini, proses baru lahir lalu mati
        # EADDRINUSE sementara health-check di bawah tetap hijau — menjawab hub lama
        # yang belum mati. Kegagalannya jadi tidak kelihatan, dan itu yang terjadi.
        for _ in $(seq 1 40); do
          ss -ltn 2>/dev/null | grep -q ":$PORT " || break
          sleep 0.25
        done
        ;;
      *) echo "⚠️  $1 berisi pid $pid yang bukan hub office — dibiarkan." ;;
    esac
  fi
  rm -f "$file"
}
stop_recorded .backend.pid

# Dashboard harus ada hasil build-nya; kalau belum, build dulu.
if [ ! -f "$OFFICE_DIR/dashboard/dist/browser/index.html" ] && \
   [ ! -f "$OFFICE_DIR/dashboard/dist/index.html" ]; then
  echo "📦 Dashboard belum di-build — menjalankan ng build..."
  (cd "$OFFICE_DIR/dashboard" && npx ng build --configuration production >/dev/null)
fi

OFFICE_HOST="$OFFICE_HOST" OFFICE_PORT="$PORT" NODE_DISABLE_COMPILE_CACHE=1 \
  setsid nohup node --env-file=.env server/src/index.js < /dev/null > "$OFFICE_DIR/backend.log" 2>&1 &
HUB_PID=$!
STARTED_AT=$(date +%s)

# Health check. `healthy` saja TIDAK CUKUP: itu hanya berarti "ada yang menjawab di
# :$PORT", dan yang menjawab bisa jadi hub lama yang gagal dibunuh. Karena itu setelah
# hijau kita wajib pencocokan PID (di bawah) dan penolakan eksplisit kalau beda.
healthy=""
for _ in $(seq 1 40); do
  if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/api/health"; then
    healthy=1
    break
  fi
  # Proses baru mati duluan (EADDRINUSE, DB error) → jangan tunggu 16 detik.
  if [ ! -d "/proc/$HUB_PID" ]; then
    echo "❌ Proses hub baru (pid $HUB_PID) keluar sebelum sehat — backend.log:"
    tail -8 "$OFFICE_DIR/backend.log" || true
    exit 1
  fi
  sleep 0.4
done

# Ambil PID listener
listener_pid() {
  local found=""
  for _ in $(seq 1 25); do
    found=$(ss -ltnp 2>/dev/null | grep -oE ":$PORT .*pid=[0-9]+" | grep -oE "pid=[0-9]+" | head -1 | cut -d= -f2)
    if [ -n "$found" ]; then echo "$found"; return 0; fi
    sleep 0.4
  done
  return 1
}

if [ -n "$healthy" ]; then
  pid=$(listener_pid || true)
  # Inti perbaikan: port harus dipegang OLEH proses yang baru kita lahirkan.
  if [ -n "$pid" ] && [ "$pid" != "$HUB_PID" ]; then
    echo "❌ :$PORT dipegang pid $pid, bukan hub yang baru start ($HUB_PID)."
    echo "   Ada proses hub lain di luar .backend.pid — hentikan dia dulu (atau lewat dashboard Kill)."
    [ -d "/proc/$HUB_PID" ] && kill -TERM "$HUB_PID" 2>/dev/null || true
    exit 1
  fi
  echo "${pid:-$HUB_PID}" > "$OFFICE_DIR/.backend.pid"
  echo "🟢 ORCA24 Hub sehat di http://$OFFICE_HOST:$PORT (Angular dashboard + API + WS, pid ${pid:-$HUB_PID})"
else
  echo "❌ Hub tidak merespons — cek $OFFICE_DIR/backend.log"
  tail -5 "$OFFICE_DIR/backend.log" || true
  rm -f "$OFFICE_DIR/.backend.pid"
  exit 1
fi
