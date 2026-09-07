# Integrasi Orca

Orca adalah aplikasi desktop yang menjalankan sesi `pi` dalam pane + worktree. Repo ini punya tiga titik integrasi dengan Orca:

1. **Identitas sesi** — sesi Pi di dalam pane Orca membawa nama Orca, workspace, dan pane di telemetry.
2. **Dashboard di-embed** — tampilan office bisa dibuka sebagai webview di Orca.
3. **Extension khusus Orca** (`orca-*`) — status spinner, prefill prompt, lapor status agen.

## 1. Identitas sesi Orca

Extension membaca env yang di-inject Orca ke sesi Pi:

| Env Orca | Dipakai untuk |
|---|---|
| `ORCA_NAME` | nama instance Orca → chip `🐋 Orca/...` di bubble |
| `ORCA_WORKSPACE_NAME` / `ORCA_WORKSPACE` | nama workspace → label workspace |
| `ORCA_PANE_KEY` | pane key → label pane |

Alternatif env prefix `OFFICE_*` menang atas `ORCA_*`: `OFFICE_ORCA_NAME`, `OFFICE_ORCA_WORKSPACE`, `OFFICE_ORCA_PANE`.

Atau lewat file konfigurasi `~/.pi/office/config.json`:

```json
{
  "url": "https://pi-office.hanirizo.workers.dev",
  "enabled": true,
  "machineName": "Rizoa Office",
  "orcaName": "Orca Main",
  "orcaWorkspace": "pi-office",
  "orcaPane": "main"
}
```

> `config.json` adalah sumber kebenaran sekarang; `orca.json` tetap didukung sebagai jembatan kompatibel mundur (dibaca bila `config.json` tidak ada). Keduanya di `.gitignore` karena bisa memuat token.

Server meng-infer label `orca` juga dari session id ber-prefix `orca:` — sesi yang dilaporkan relay Orca (bukan extension) tetap kebaca.

## 2. Dashboard di dalam Orca

Mode lokal: buka webview Orca ke `http://127.0.0.1:4317`. Karena hub menyajikan API, WS, dan SPA dari **satu origin**, embed tidak perlu konfigurasi CORS atau URL ekstra.

Catatan embed webview:

- Entry di-serve `Cache-Control: no-cache`, jadi setelah `npm run build` cukup reload — bundle basi tidak menempel.
- Mode cloud (Worker) memakai `wss:` dan HTTPS otomatis; `lib/office-endpoints.ts` menyesuaikan protokol dari halaman (`window.location`), jadi satu kode untuk lokal & cloud.

## 3. Extension Orca (`extensions-global/orca-*.ts`)

Dikelola Orca (`@orca-managed-pi-extension`) dan **hanya aktif ketika `ORCA_PANE_KEY` ada** — sesi pi manual di luar Orca tidak terpengaruh:

| Extension | Fungsi |
|---|---|
| `orca-agent-status.ts` | Mengirim status sesi ke Orca (non-blocking; 1 detik timeout; slot latest-only supaya receiver yang macet tidak menumpuk antrean) |
| `orca-prefill.ts` | Saat sesi baru dimulai dari Orca, mengisi editor dengan `ORCA_PI_PREFILL` (lalu menghapus env-nya) |
| `orca-titlebar-spinner.ts` | Spinner Braille di titlebar selama agen bekerja |

Pasang: `./scripts/install-extensions.sh extras`. Detail: [EXTENSIONS.md](./EXTENSIONS.md).

## 4. Alur kerja yang umum

1. Clone/update repo di worktree Orca.
2. Jalankan `./start-dev.sh` di mesin hub (sekali saja, tetap hidup di background).
3. Dari Orca, spawn sesi `pi` di pane mana pun — sesi otomatis terdaftar dengan identitas Orca/workspace miliknya.
4. Buka webview `http://127.0.0.1:4317` untuk melihat seluruh tim, feed tool calls, stream LLM, dan tagihan.
5. Saat ingin menghentikan sesi dari dashboard: tombol Kill mengirim SIGTERM (Node hub) atau menandai offline (cloud) — extension `orca-agent-status` lalu melaporkan state ke Orca.

## Multi-mesin

Sesi dari laptop/container lain ikut satu kantor dengan mengarahkan ke endpoint hub:

```bash
export OFFICE_ENDPOINT=http://<IP-ATAU-URL>:4317/api/event
export OFFICE_MACHINE_NAME="Rizoa MacBook Pro"
export OFFICE_ORCA_NAME="Orca Laptop Kedua"
```

`machine_id` stabil per mesin (`~/.pi/office/machine-id`) membuat setiap bubble tetap terasosiasi ke perangkat asalnya meski nama sama.
