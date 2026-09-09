# Backend — ORCA24 Hub (server/)

Node.js murni tanpa framework HTTP: `node:http` + `node:sqlite` (bawaan Node) + `ws`. Satu proses, satu port (`4317`), satu origin untuk semua: REST API, WebSocket, dan dashboard hasil build.

## Struktur file

```
server/src/
├── index.js            # Bootstrap: listen, reaper sesi mati, SIGINT handler
├── server.js           # HTTP router: REST API + static file server dashboard
├── db.js               # OfficeDB: skema SQLite, upsert session, billing, reaper query
├── ws.js               # OfficeWebSocketHub: broadcaster /ws + ping/pong 30 dtk
├── pricing.js          # Tabel harga lokal (pricing.json) + resolusi cost berjenjang
├── pricing-remote.js   # Feed harga bulk dari llm-prices.com (cache 24 jam)
└── pricing-portkey.js  # Quote on-demand satu model dari Portkey (per 10K → per 1M)
```

## Menjalankan

```bash
npm run server            # foreground
# atau
./start-dev.sh            # background + health check + pid file
./stop-dev.sh             # matikan hanya pid yang tercatat sendiri
```

Variabel environment server:

| Env | Default | Fungsi |
|---|---|---|
| `OFFICE_PORT` | `4317` | Port listen |
| `OFFICE_HOST` | `0.0.0.0` | Bind address (`127.0.0.1` = lokal saja) |
| `OFFICE_DB_PATH` | `<cwd>/office.db` | Lokasi file SQLite |
| `OFFICE_DASHBOARD_DIST` | `../dashboard/dist` | Folder static dashboard |
| `OFFICE_PRICING_PATH` | `<cwd>/pricing.json` | Tabel harga lokal operator |
| `OFFICE_PRICING_FEED_URL` | `https://www.llm-prices.com/current-v1.json` | Feed harga bulk |
| `OFFICE_PRICING_CACHE` | `<cwd>/pricing-cache.json` | Cache feed di disk |

## REST API

Semua response JSON. Untuk dev, hub tetap membuka CORS (`*`) sebagai pertahanan tambahan. Jalur dev dashboard kini lewat `proxy.conf.json` (same-origin), sehingga faktanya tidak ada lagi lintas-origin yang perlu dipecah di sini.

| Method & Path | Fungsi |
|---|---|
| `GET /api/health` | Liveness check → `{ status: 'ok', time }` |
| `GET /api/state` | State penuh: sessions, tool calls terakhir (30), logs terakhir (50), billing, stats |
| `GET /api/billing` | Tagihan coffee-shop: agregat token + USD per sesi & per model |
| `GET /api/billing/quote?model=&provider=&portkey=1` | Dari mana harga sebuah model berasal (tabel/feed), opsi quote Portkey |
| `POST /api/billing/feed/refresh` | Tarik feed harga bulk sekarang juga |
| `POST /api/sessions/:id/kill` | Hentikan sesi (lihat "Kill safety" di bawah) |
| `POST /api/event` | Ingest telemetry dari extension (single entry point) |

### `POST /api/event`

Body: `{ "type": "<event>", "payload": { ... } }`. Router `handleTelemetryEvent`:

| `type` | Aksi server |
|---|---|
| `session.register` | Upsert sesi (status `working`), log "masuk kantor", broadcast `session_registered` |
| `session.heartbeat` | Upsert task/status/pid, broadcast `session_updated` |
| `session.end` | Tandai offline + `ended_at`, broadcast `session_ended` |
| `team.register` | Daftarkan sub-agent (`is_subagent: 1`, parent tercatat), broadcast `team_spawned` |
| `tool.call` | Simpan ke `tool_calls` + log debug, broadcast `tool_called` |
| `tool.result` | Update hasil + durasi + error flag, broadcast `tool_completed` |
| `llm.stream` | Tidak disimpan di DB — langsung broadcast `llm_stream_updated` |
| `session.usage` | Simpan receipt ke `usage_events` (dengan cost resolution), broadcast `usage_recorded` berisi tagihan teragregasi |
| `log.append` | Tambah baris log, broadcast `log_appended` |
| `task.update` | Update task + log, broadcast `task_updated` |

Identitas mesin (`machine_id`, `machine_name`, `orca_*`, `client_kind`) diambil dari payload; `client_kind` di-infer dari prefix `orca:` pada session id bila tidak dikirim.

## WebSocket `/ws`

- Semua klien menerima broadcast satu-ke-banyak, format `{ type, payload, timestamp }`.
- Tipe broadcast: `session_registered`, `session_updated`, `task_updated`, `session_ended`, `team_spawned`, `tool_called`, `tool_completed`, `llm_stream_updated`, `usage_recorded`, `log_appended`.
- Ping/pong tiap 30 detik; socket mati di-terminate & dibersihkan.

## Static dashboard

Setiap request non-`/api` disajikan dari `dashboard/dist`:

- Path tidak dikenal → fallback `index.html` (SPA).
- Asset `/assets/*` di-cache 1 tahun immutable; entry `no-cache` supaya webview Orca tidak menyimpan bundle basi.
- Path traversal (`..`, null byte, escape dari dist) ditolak, bukan disajikan.

## Kill safety (`POST /api/sessions/:id/kill`)

Berlapis, urut dievaluasi:

1. Session harus ada; kalau sudah `offline` → no-op sukses.
2. PID harus integer > 1 dan bukan proses hub sendiri.
3. `process.kill(pid, 0)` — kalau `ESRCH`, proses sudah mati (tandai offline saja).
4. `/proc/<pid>/cmdline` dicek: harus tampak seperti proses Pi (`pi`, `pi-cli`, `node .../pi`, dsb). PID hidup tapi bukan Pi → **HTTP 409**, tidak disentuh.
5. Lolos semua → `SIGTERM` ke proses, sesi ditandai offline, log `warn` + broadcast.

Cloudflare Worker tidak bisa SIGTERM (proses ada di mesin lain) — di sana kill hanya menandai offline.

## Reaper (pembersih zombie)

Di `index.js`, tiap 60 detik:

- `reapDeadSessions()` — sesi yang punya `pid` tercatat tapi `/proc/<pid>` sudah tidak ada → offline. Sesi yang di-SIGKILL tidak akan pernah kirim `session.end`, inilah penangkalnya.
- Saat startup: `reapAbandonedSessions(6 jam)` — baris tanpa pid yang lebih tua dari 6 jam → offline.

Keduanya sengaja konservatif: tanpa bukti proses mati, kursi tidak digusur (sesi idle yang masih hidup tidak boleh salah dipindah).

## Resolusi harga (billing)

Urutan otoritas (`COST_RANK`): `none(0) < reported(1) < feed(2) < table(3)`.

1. **`pricing.json`** — tabel milik operator, USD per 1M token, mendukung wildcard (`*`) pada nama model; rule yang mengandung `/` boleh match `provider/model`; hot-reload tiap 5 detik berdasar mtime. Otoritas tertinggi.
2. **Feed bulk** `llm-prices.com` — satu file ~27 KB, cache disk, refresh harian; sengaja tidak ada HTTP per-model di jalur ingest.
3. **Cost yang dilaporkan Pi** — dipakai kalau dua di atas tidak punya angka.
4. **Portkey quote** — hanya on-demand saat dashboard menanyakan `/api/billing/quote?portkey=1` untuk baris yang masih tanpa harga; konversi per-10K → per-1M token. Saran harga ditampilkan, keputusan memasukkannya ke `pricing.json` tetap milik manusia.

Cost dibulatkan ke 8 desimal (`roundCost`) agar 12 desimal noise float tidak jadi "harga".
