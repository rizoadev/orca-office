# Pi Extensions — Global (untuk semua sesi Pi di mesin)

Folder ini adalah **referensi repo** untuk extension Pi pendukung yang terpasang di `~/.pi/agent/extensions/` pada mesin ini.

> ⚠️ **`pi-office` (extension kantor) TIDAK ada di folder ini.** Sumbernya modular di `extension/` dan dibangun ke `~/.pi/agent/extensions/pi-office.ts` lewat `npm run sync:extension`. Lihat [docs/EXTENSIONS.md](../docs/EXTENSIONS.md).

## Isi & peran

| File | Peran | Aktif saat |
|---|---|---|
| `soul-anchor.ts` | Pertahankan persona `~/.pi/agent/SYSTEM.md` dari injeksi endpoint | setiap request keluar |
| `pi-token-footer.ts` | Footer TUI: token ↑↓, cost, context %, git | semua sesi |
| `orca-agent-status.ts` | Status sesi → Orca (managed by Orca) | pane Orca |
| `orca-prefill.ts` | Prefill editor dari Orca | pane Orca + startup |
| `orca-titlebar-spinner.ts` | Spinner Braille di titlebar | pane Orca |

## Instalasi

```bash
cd ~/.pi/office
./scripts/install-extensions.sh extras   # salin extension pendukung di atas
```

Extension kantor (pi-office): `./scripts/install-extensions.sh office` atau langsung `npm run sync:extension`.
