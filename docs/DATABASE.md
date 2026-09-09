# Database — Skema & Model Data

## Mesin penyimpanan

Satu mesin penyimpanan, dua target — skemanya identik:

| Mode | Target URL | Driver |
|---|---|---|
| Lokal (hub Node) | `file:office.db` (+ WAL/SHM) | `@libsql/client` |
| Cloud (Worker) | `libsql://<db>.turso.io` | `@libsql/client/web` |
| Test e2e | `file:/tmp/office-e2e-test.db` | `@libsql/client` |

`resolveDatabaseUrl()` (di `server/src/db.js`) memilih: arg `dbPath` > `TURSO_DATABASE_URL` > lempar error. Path tanpa scheme dinormalisasi jadi `file:`. `TURSO_AUTH_TOKEN` hanya dikirim untuk target remote — libSQL menolaknya pada `file:`.

Kenapa satu driver: dulu hub lokal memakai `node:sqlite` dan cloud memakai libSQL, sehingga **jalur yang diuji test bukan jalur yang dipakai produksi** (migration ke Turso membuat `createOfficeServer({dbPath})` dan `npm test` mati diam-diam). Sekarang `file:` memberi SQLite lokal betulan lewat API async yang sama.

Lokal memakai `PRAGMA journal_mode = WAL` — pembacaan dashboard tidak pernah mengunci tulisan telemetry. Untuk Turso tidak diperlukan (dikelola di sisinya).

## Tabel

### `sessions` — satu baris per kursi kantor (sesi Pi atau sub-agent)

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | TEXT PK | session id Pi, atau `<session>_<subkey>` untuk sub-agent |
| `name` / `role` / `avatar` / `color` | TEXT | persona (nama Indonesia + emoji + warna) |
| `cwd` | TEXT | direktori kerja sesi |
| `project` | TEXT | nama repo — dihitung server: jalan naik dari cwd ke `.git` terdekat (maks 12 tingkat), cache in-memory |
| `machine_id` / `machine_name` | TEXT | identitas perangkat pengirim |
| `orca_name` / `orca_workspace` / `orca_pane` | TEXT | metadata opsional Orca |
| `client_kind` | TEXT | `pi` \| `orca` \| `subagent` |
| `model` | TEXT | model aktif sesi |
| `pid` | INTEGER | PID proses Pi — dasar reaper & kill safety |
| `task` | TEXT | deskripsi tugas aktif |
| `status` | TEXT | `working` \| `idle` \| `offline` |
| `is_subagent` | INTEGER | 0/1 |
| `parent_session_id` | TEXT | sesi induk (untuk sub-agent) |
| `started_at` / `last_heartbeat` / `ended_at` | INTEGER | epoch ms |

### `tool_calls` — telemetry eksekusi tool

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | TEXT PK | `call_id` dari extension |
| `session_id` | TEXT FK | pemanggil |
| `tool_name` | TEXT | `bash`, `read`, `edit`, `subagent`, … |
| `input_json` / `result_json` | TEXT | snapshot input/hasil |
| `is_error` | INTEGER | 0/1 |
| `duration_ms` | INTEGER | dihitung extension (jarak `tool_call` → `tool_result`) |
| `created_at` | INTEGER | epoch ms |

### `logs` — feed aktivitas kantor

`id` (autoincrement), `session_id`, `level` (`info`/`debug`/`warn`), `source` (`pi-session`/`subagent`/`tool_call`/`task`/`control`/`announcement`), `message`, `created_at`.

### `usage_events` — receipt billing per panggilan LLM

| Kolom | Tipe | Catatan |
|---|---|---|
| `session_id` | TEXT FK | peminum |
| `model` / `provider` | TEXT | model yang dipakai |
| `input_tokens` / `output_tokens` | INTEGER | token biasa |
| `cache_read_tokens` / `cache_write_tokens` | INTEGER | token cache |
| `total_tokens` | INTEGER | fallback = jumlah bucket bila Pi tidak kirim total |
| `cost` | REAL | USD, hasil resolusi berjenjang, dibulatkan 8 desimal |
| `cost_source` | TEXT | `none` \| `reported` \| `feed` \| `table` |
| `cost_rank` | INTEGER | versi numerik dari `cost_source` — agregasi memilih rank tertinggi per (sesi, model), bukan MAX() alfabetis |
| `dedupe_key` | TEXT | lihat partial index di bawah |
| `created_at` | INTEGER | epoch ms |

### Indeks

```sql
idx_sessions_status        sessions(status)
idx_tool_calls_session     tool_calls(session_id)
idx_logs_session           logs(session_id)
idx_usage_session_model    usage_events(session_id, model)
idx_usage_created          usage_events(created_at)
idx_usage_dedupe           usage_events(dedupe_key) WHERE dedupe_key IS NOT NULL  -- UNIQUE
```

`idx_usage_dedupe` adalah **partial unique index**: event live tidak membawa key (tiap turn dianggap baru), sedangkan backfill membawa key per baris log — sehingga backfill bisa dijalankan ulang tanpa duplikat.

## Migrasi ringan

`initSchema()` menjalankan `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`, lalu memeriksa `PRAGMA table_info(...)` dan menambah kolom yang hilang lewat `ALTER TABLE` (`pid`, `project`, kolom identitas mesin, `cost_rank`, `dedupe_key`). Artinya: database lama tetap jalan tanpa langkah migrasi manual.

Tidak ada foreign-key enforcement di SQLite yang diaktifkan; FK hanya dokumentatif.

## Backfill

`tools/backfill-usage.js` mengisi tagihan untuk sesi lama yang lahir sebelum billing ada:

```bash
npm run backfill:usage          # semua sesi
npm run backfill:usage -- sesi_xxx   # satu sesi
```

Membaca `~/.pi/agent/sessions/**/*.jsonl`, mengekstrak `usage` dari tiap assistant message, menulis dengan `dedupe_key` per baris log → aman dijalankan ulang.

## Query agregasi billing (garis besar)

`getBilling()` mengagregasi `usage_events` dua arah — per guest (session) dan per brew (model) — memilih sumber cost dengan `cost_rank` tertinggi per (session, model), lalu menghitung total. Sesi offline **tetap** masuk tagihan: receipt tidak hilang saat pelanggan pulang. Dashboard menerima hasil jadi (`usage_recorded` mengirim seluruh ringkasan) sehingga klien tidak pernah menghitung ulang ribuan baris.
