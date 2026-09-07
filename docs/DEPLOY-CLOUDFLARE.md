# Deploy Cloudflare Worker + Durable Object + Turso

Mode cloud menjalankan **keseluruhan** tumpukan dari satu Worker: static `dashboard/dist` (assets binding + SPA fallback), REST API, dan WebSocket lewat **Durable Object** (`OfficeRoom`) sebagai room global. Penyimpanan migrasi dari SQLite file ke **Turso (libSQL)**.

## Kenapa begitu

- **Satu Worker, satu origin** — Assets binding menyajikan dashboard, URL `/api/*` ditangani Worker, `/ws` di-route ke Durable Object `OfficeRoom` yang memegang koneksi WebSocket banyak-banyak. Lokal dan cloud berbagi kode UI yang sama (same-origin `/api` & `/ws`).
- **Turso** — Worker tidak punya filesystem persisten; Turso menggantikan `office.db`. Skema dibuat otomatis oleh Worker saat pertama `ensureSchema` (idempotent, tambah kolom bila ada yang hilang).
- **Durable Object = room WebSocket global** — satu instance `global` (`idFromName('global')`) menampung semua klien, dengan broadcast dikirim via `POST /broadcast` internal.
- **Kill di cloud** hanya menandai sesi `offline` — proses Pi ada di mesin Anda, Worker tidak berhak SIGTERM lintas jaringan.

## Prasyarat

```bash
node -v   # 16.17+ (disarankan 20+)
npm -v
wrangler   # dipakai via `npm run cf:*`, bukan global wajib
```

Turso: `~/.turso/turso` — buat db & token:

```bash
turso db create pi-office
turso db show pi-office --url          # → libsql://pi-office-<you>.turso.io
turso db tokens create pi-office       # → token rahasia
```

## Konfigurasi

`wrangler.toml` sudah jadi:

```toml
name = "pi-office"
main = "cloudflare/worker.ts"
[[assets]]       # directory = dashboard/dist, SPA fallback
[[durable_objects.bindings]]  # OFFICE_ROOM → OfficeRoom
[[migrations]]   # new_sqlite_classes OfficeRoom (v1)
```

> `account_id` di `wrangler.toml` milik akun deploy; ganti bila repo ini dipakai untuk akun lain.

## Secret (jangan pernah dilettakkan di file repo)

```bash
wrangler secret put TURSO_DATABASE_URL   # libsql://...
wrangler secret put TURSO_AUTH_TOKEN     # token turso
wrangler secret put OFFICE_TOKEN         # opsional: Bearer untuk POST /api/event
```

Proteksi endpoint telemetry: setelah `OFFICE_TOKEN` diset di Worker, tiap `/api/event` harus menyertakan `Authorization: Bearer <token>` yang sama — dan mesin pengirim harus `export OFFICE_TOKEN=<token>`.

## Build & deploy

```bash
cd ~/.pi/office
npm run cf:dev        # build dashboard + `wrangler dev` (test lokal)
npm run cf:deploy     # build dashboard + `wrangler deploy`
```

Deploy memuat `dashboard/dist` sebagai assets + Worker + Durable Object. Setelah berhasil, Anda dapat URL seperti `https://pi-office.<subdomain>.workers.dev`.

## Arahkan klien ke cloud

```bash
# Di setiap mesin / sesi Pi
export OFFICE_ENDPOINT=https://pi-office.<subdomain>.workers.dev/api/event
export OFFICE_TOKEN="...token yang sama dengan secret Worker..."
export OFFICE_MACHINE_NAME="Rizoa Office 1"
```

Frontend memakai same-origin `/api` dan `/ws`, jadi konfigurasi klien hanya butuh endpoint — UI berjalan identik dengan mode lokal.

## Perbedaan endpoint lokal vs cloud

| Endpoint | Lokal (Node hub) | Cloud (Worker) |
|---|---|---|
| `GET /api/health` | ✅ | ✅ (`target: cloudflare-worker`) |
| `GET /api/state` | ✅ | ✅ |
| `GET /api/billing` | ✅ | ✅ |
| `POST /api/event` | ✅ (+ token opsional) | ✅ (token via `OFFICE_TOKEN`) |
| `POST /api/sessions/:id/kill` | SIGTERM + offline | offline only (tidak bisa SIGTERM) |
| `GET /api/billing/quote` · `POST /api/billing/feed/refresh` | ✅ (Pricing lokal) | tidak ada — Worker memakai harga dari cost yang direkam Pi / Turso |
| Static dashboard | dari disk | dari assets binding |
| WebSocket | `ws://:4317/ws` | Durable Object room (WS lewat `/ws`) |

## Keamanan & batasan

- Harga & feed di mode cloud bergantung pada data yang dikirim extension (`reported`); tidak ada `pricing.json` lokal di Worker.
- Baca di Turso memakai naik `cost_rank` yang sudah direkam — konsisten dengan skema lokal.
- Pastikan `TURSO_DATABASE_URL` memakai skema `libsql://` (bukan `wss://` legacy) agar kompatibel dengan `@libsql/client/web`.