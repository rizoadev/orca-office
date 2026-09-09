#!/bin/bash
PORT="${OFFICE_PORT:-4317}"
# Hentikan Kantor Pi Hub. Hanya menyentuh proses yang kita catat sendiri di
# .backend.pid, dan hanya setelah cmdline-nya terbukti hub office — tidak ada
# pemindaian port/proses.
# OFFICE_DIR dideteksi dari lokasi script, SAMA seperti start-dev.sh. Dulu di-hardcode
# ke /home/rizoa/.pi/office, jadi `./stop-dev.sh` dari salinan repo lain membaca PID file
# yang salah: ia bilang "proses hub sudah tidak ada" sementara hub repo tetap memegang
# :4317 — lalu start-dev berikutnya menabrak EADDRINUSE.
OFFICE_DIR="${OFFICE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
file="$OFFICE_DIR/.backend.pid"

if [ ! -f "$file" ]; then
  echo "Tidak ada .backend.pid — hub mungkin sudah mati."
  exit 0
fi

pid=$(tr -dc '0-9' < "$file")
if [ -n "$pid" ] && [ -d "/proc/$pid" ]; then
  cmdline=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
  case "$cmdline" in
    *server/src/index.js*)
      kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
      echo "🛑 Hub office dihentikan (pid $pid)."
      ;;
    *) echo "⚠️  pid $pid bukan hub office — tidak disentuh." ;;
  esac
else
  echo "🛑 Proses hub sudah tidak ada."
fi
rm -f "$file"

# Bunuh sampai port benar-benar lepas. kill -TERM saja async: kalau langsung balik,
# start-dev yang menyusul akan melihat port masih dipakai.
if [ -n "${pid:-}" ]; then
  for _ in $(seq 1 40); do
    ss -ltn 2>/dev/null | grep -q ":$PORT " || break
    sleep 0.25
  done
fi
