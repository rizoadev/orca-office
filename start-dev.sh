#!/bin/bash
# Start Kantor Pi Hub — satu proses di :4317 yang menyajikan API, WS hub, DAN
# dashboard 3D hasil build. Tidak ada tunnel/cloud, tidak ada port kedua.
#
# Kenapa tidak pakai Vite dev lagi: `npm run build` menaruh hasilnya di
# dashboard/dist dan server menyajikannya sendiri, jadi Orca cukup embed satu
# origin. Kalau mau HMR saat hack dashboard: `npm run dashboard` (5173, proxy ke 4317).
#
# PENTING: pakai `setsid` supaya proses TIDAK ikut mati saat shell yang
# men-launch-nya keluar.
set -e

OFFICE_DIR="/home/rizoa/.pi/office"
PORT="${OFFICE_PORT:-4317}"
OFFICE_HOST="${OFFICE_HOST:-127.0.0.1}"
cd "$OFFICE_DIR"

# Matikan instance lama — HANYA lewat PID file yang kita tulis sendiri, dan hanya
# kalau PID itu masih merupakan proses hub ini. Tidak ada pemindaian port/proses.
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
        sleep 1
        ;;
      *) echo "⚠️  $1 berisi pid $pid yang bukan hub office — dibiarkan." ;;
    esac
  fi
  rm -f "$file"
}
stop_recorded .backend.pid

# Dashboard harus ada hasil build-nya; kalau belum, build dulu.
if [ ! -f "$OFFICE_DIR/dashboard/dist/index.html" ]; then
  echo "📦 Dashboard belum di-build — menjalankan vite build..."
  (cd "$OFFICE_DIR/dashboard" && npm run build >/dev/null)
fi

OFFICE_HOST="$OFFICE_HOST" OFFICE_PORT="$PORT" \
  setsid nohup node server/src/index.js < /dev/null > "$OFFICE_DIR/backend.log" 2>&1 &

# setsid fork — $! bukan PID node. Ambil PID listener dari port yang baru kita buka
# (read-only), lalu validasi cmdline-nya sebelum pernah dipakai untuk sinyal.
listener_pid() {
  local found=""
  for _ in $(seq 1 25); do
    found=$(ss -ltnp 2>/dev/null | grep -oE ":$PORT .*pid=[0-9]+" | grep -oE "pid=[0-9]+" | head -1 | cut -d= -f2)
    if [ -n "$found" ]; then
      echo "$found"
      return 0
    fi
    sleep 0.4
  done
  return 1
}

# Health check: node butuh beberapa ratus ms untuk buka port + init SQLite,
# jadi dicek berulang, bukan sekali.
healthy=""
for _ in $(seq 1 25); do
  if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/api/health"; then
    healthy=1
    break
  fi
  sleep 0.4
done

if [ -n "$healthy" ]; then
  pid=$(listener_pid || true)
  if [ -n "$pid" ]; then
    echo "$pid" > "$OFFICE_DIR/.backend.pid"
  fi
  echo "🟢 Kantor Pi Hub sehat di http://$OFFICE_HOST:$PORT (dashboard + API + WS satu origin, pid ${pid:-?})"
else
  echo "❌ Hub tidak merespons — cek $OFFICE_DIR/backend.log"
  tail -5 "$OFFICE_DIR/backend.log" || true
  rm -f "$OFFICE_DIR/.backend.pid"
  exit 1
fi

