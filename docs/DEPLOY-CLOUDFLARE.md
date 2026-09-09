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
wrangler secret put OFFICE_TOKEN          # Bearer penuh: baca state/billing/kill + tulis
wrangler secret put OFFICE_INGEST_TOKEN   # opsional: tulis-saja utk /api/event — aman dibagi
```

Proteksi endpoint telemetry: setelah `OFFICE_TOKEN` diset di Worker, tiap `/api/event` harus menyertakan `Authorization: Bearer <token>` yang sama — dan mesin pengirim harus `export OFFICE_TOKEN=<token>` (atau `/office connect <token>`).

**Sebaiknya pakai `OFFICE_INGEST_TOKEN`.** Extension kini terpasang lewat `pi install npm:pi-office`, artinya kredensial akan kamu bagikan ke mesin/orang lain. `OFFICE_TOKEN` memberi pembacanya `/api/state`, `/api/billing`, `/ws`, dan kill — jadi satu bocoran berarti seluruh isi kantor. `OFFICE_INGEST_TOKEN` diterima **hanya** di `POST /api/event`: boleh menulis telemetry, tidak bisa membaca apa pun. Tanpa secret itu, perilaku persis seperti sebelumnya.

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
| `POST /api/event` | ✅ (+ token opsional) | ✅ (`OFFICE_TOKEN` atau `OFFICE_INGEST_TOKEN`) |
| `POST /api/sessions/:id/kill` | SIGTERM + offline | offline only (tidak bisa SIGTERM) |
| `GET /api/billing/quote` · `POST /api/billing/feed/refresh` | ✅ (Pricing lokal) | tidak ada — Worker memakai harga dari cost yang direkam Pi / Turso |
| Static dashboard | dari disk | dari assets binding |
| WebSocket | `ws://:4317/ws` | Durable Object room (WS lewat `/ws`) |

## Autentikasi & cookie gateway

| Endpoint | Tanpa token | Dengan bearer | Dengan cookie | Notes |
|---|---|---|---|---|
| `GET /api/health` | ✅ | — | — | publik, untuk Orca proks |
| `GET /api/state` | 401 | ✅ | ✅ | 
| `GET /api/billing` | 401 | ✅ | ✅ | 
| `POST /api/event` | 401 | ✅ | — | hanya extension (bearer) |
| `GET /ws` | 401 | ✅ | ✅ | 
| `GET /gateway` | 200 | — | — | halaman form HTML |
| `POST /gateway` | token salah: 401 | — | — | token benar: set cookie + 302 |

### Cara kerja

1. Semua pembacaan (`GET /api/*`, `GET /ws`) dicek `isAuthorized()` — header `Authorization` dulu, lalu cookie `session`.
2. Cookie `session = sha256(OFFICE_TOKEN)`, HttpOnly + Secure + SameSite=Lax, 30 hari.
3. Browser memanggil `GET /gateway?token=...` (atau POST dengan field `token`) untuk mendapatkan cookie.
4. Worker menyet cookie lalu redirect 302 ke `/`.
5. Dashboard frontend tidak melakukan redirect otomatis (anti flicker): bila 401, Angular menampilkan panel `AccessGate` (inline, `shared/auth/`) yang menanyakan token — `AuthService.unauthorized()` jadi sinyal, `AppComponent` menyaring layout di `@if`.

### Loopback (localhost/127.0.0.1) **bebas autentikasi** — ini khusus untuk sesi Pi di mesin yang sama.
- Non-loopback (cloud, LAN) memerlukan cookie atau bearer.

## Keamanan: redaksi payload (client)

Extension Pi (`extension/redact.ts`) secara aktif meredaksi payload sebelum mengirim ke non-loopback:

- Secret: JWT, API keys, tokens, passwords — dihapus total
- Input tool: hanya key yang di-allowlist per tool (bash → `command,timeout`; read → `path,offset,limit`; write/edit → `path`). Result body dihapus, hanya `output_chars` disimpan.
- `sanitizeCommand()`: meredaksi `KEY=value` tokens (semua vendor) secara struktural, bukan regex yang mudah lolos.

Loopback (127.0.0.1) = full detail, Non-loopback (cloud/LAN) = saniter. WF approval browser perlu persetujuan manual jika diperlukan.

## Keamanan & batasan

- Harga & feed di mode cloud bergantung pada data yang dikirim extension (`reported`); tidak ada `pricing.json` lokal di Worker.
- Baca di Turso memakai naik `cost_rank` yang sudah direkam — konsisten dengan skema lokal.
- Pastikan `TURSO_DATABASE_URL` memakai skema `libsql://` (bukan `wss://` legacy) agar kompatibel dengan `@libsql/client/web`.