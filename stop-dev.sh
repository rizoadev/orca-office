#!/bin/bash
# Hentikan Kantor Pi Hub. Hanya menyentuh proses yang kita catat sendiri di
# .backend.pid, dan hanya setelah cmdline-nya terbukti hub office — tidak ada
# pemindaian port/proses.
OFFICE_DIR="/home/rizoa/.pi/office"
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
