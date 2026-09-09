# 🔍 Code Review — pi-office

**Tanggal:** 2026-09-08
**Reviewer:** Saarah (AI agent)
**Scope:** Seluruh kode sumber — backend Node, extension Pi, Cloudflare Worker, dashboard React+Three.js, tooling, docs

---

## Ringkasan Ejekusi

| Metrik | Nilai |
|---|---|
| Total LOC (source, tanpa node_modules/dist) | 12.294 |
| File sumber (`.ts`/`.tsx`/`.js`/`.sh`) | ~45 |
| Modul utama | 6 (server, extension, worker, dashboard engine, tools, docs) |
| Test e2e | ✅ 10/10 lulus |
| `npm run build` | ❌ Gagal — `dashboard/node_modules` kosong; root node_modules punya dependensi asing (`lucide-angular` 63 MB, tidak di-import) |
| Sesi Pi aktif (saat review) | 1 (ini) |

---

## Yang Bagus

- **Komentar "why" di kode** — `db.js:290` (SQLite cek NOT NULL sebelum `ON CONFLICT`), `pricing.js:36` (MAX() tekstual salah rank → `cost_rank` numerik), `redact.ts:110` (unknown event **fail closed**, bukan passthrough). Ini kode yang ditulis orang yang sudah kena burn-nya.
- **Integritas penagihan**: `resolveUsageCost` sadar "harga tidak diketahui ≠ $0.00" dan `lookupFeed` mengembalikan `null` saat ambigu — _wrong price is worse than no price_. Jarang ada kedewasaan begini.
- **Kill safety** (`server.js:236`): validasi cmdline `/proc/<pid>` sebelum SIGTERM, menolak pid sendiri, ESRCH ditangani. `stop-dev.sh` juga cuma menyentuh PID file sendiri.
- Redaksi berlapis + loopback-aware, dedupe partial index, `Cache-Control` immutable untuk hashed asset. Docs 7 file, saling nyambung.

---

## 🔴 High — harus dibereskan

### 1. Hub lokal tidak punya autentikasi, default bind `0.0.0.0`

`server/src/index.js:4` → `HOST = process.env.OFFICE_HOST || '0.0.0.0'`.

Kugrep seluruh `server/src/*.js`: **nol** pemeriksaan token. `docs/INSTALL.md:118` malah menganjurkan mode LAN. Akibatnya, siapa pun di jaringan yang sama bisa:

- `GET /api/state` → membaca **prompt user** (kolom `task`), `cwd`, nama mesin, model — untuk semua sesi
- `POST /api/event` → menyuntik sesi/subagent/log hantu
- `POST /api/sessions/:id/kill` → **SIGTERM ke proses Pi milikmu** (proteksi cmdline justru lolos untuk sesi Pi asli)

`start-dev.sh` meng-override ke `127.0.0.1`, jadi jalur "resmi" aman — tapi `npm run server` dan `npm run dev` tidak.

**Fix:** Default `127.0.0.1`; tolak bind non-loopback kalau `OFFICE_TOKEN` belum diset; implement pemeriksaan token di hub lokal.

> Catatan: `docs/DEPLOY-CLOUDFLARE.md:80` sudah menjanjikan "`✅ (+ token opsional)`" untuk lokal — **fitur itu tidak ada di kode.**

### 2. Boot hub crash pada DB lama — kubuktikan langsung

`db.js:initSchema()` membuat `CREATE UNIQUE INDEX idx_usage_dedupe ON usage_events(dedupe_key)` **sebelum** blok `ALTER TABLE ... ADD COLUMN dedupe_key`.

Kusimulasikan DB skema pra-`dedupe_key`, kubuka dengan `OfficeDB` sekarang:

```
❌ THREW: no such column: dedupe_key
```

Ini bukan teori — siapa pun yang upgrade tanpa DB baru tidak bisa menyalakan hub.

**Fix:** Pindahkan pembuatan indeks ke **setelah** migrasi kolom, dan bungkus pembuatan indeks dalam loop per-statement yang tahan ulang.

### 3. Repo ≠ runtime — yang jalan sekarang adalah copy tua

Hub yang hidup (pid 591248, uptime 1 hari 7 jam) jalan dari `/home/rizoa/.pi/office` — bukan dari repo ini, dan itu **bukan symlink** (`readlink -f` = direktori nyata).

Diff `~/.pi/office` vs repo: copy runtime **tidak punya** `extension/`, `docs/`, `cloudflare/`, `AccessGate.tsx`, `office-annex.ts`, `office-endpoints.ts`, `LocationsList.tsx`; dan `App.tsx`/`officeEngine.ts`/`useOfficeSocket.ts`/`types.ts` semuanya versi lama.

Penyebabnya: `start-dev.sh:13` dan `stop-dev.sh:5` hardcode `OFFICE_DIR="/home/rizoa/.pi/office"`. Jadi `./start-dev.sh` yang kamu jalankan **dari repo** justru me-restart salinan tua. README bilang "repo ini sumber kebenaran" tapi Quickstart-nya `cd ~/.pi/office`.

**Fix:** `OFFICE_DIR="${OFFICE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"`, lalu jadikan `~/.pi/office` symlink ke repo (atau bikin `npm run deploy:local` yang menyalin + build secara eksplisit).

---

## 🟡 Medium

### 4. Dependensi & state instalasi berantakan

- **`npm run build` di mesin ini gagal**: `Cannot find package '@vitejs/plugin-react'`, `dashboard/node_modules` tidak ada. Jalur README/bootstrap memang meng-instalnya, tapi ini gampang kelewat → pakai **npm workspaces** (`"workspaces": ["server","dashboard"]`) supaya satu `npm install` cukup, dan tambahkan `"engines": { "node": ">=22" }`.
- **`package.json` + `package-lock.json` termodifikasi tapi tidak di-commit** (mtime 21:34:42, saat review mulai). Kugrep: bukan ulah `npm ci --dry-run`/`npm ls` (kucoba di /tmp, tidak menulis). Isinya menambah ke ROOT: `lucide-angular` **63 MB** — tidak di-import file mana pun (`Navbar.tsx:2` pakai `lucide-react`) — plus `tailwindcss`, `@tailwindcss/vite`, `postcss`, `three`, `@types/three`, `canvas-confetti` yang sudah jadi milik `dashboard/package.json`. `node_modules` root = 448 MB.
  - Kalau tidak disengaja: `git checkout -- package.json package-lock.json && npm ci` (+ `trash node_modules/lucide-angular`).
  - Kalau disengaja: commit dengan alasan.
- `dashboard/` punya **dua lockfile**: `package-lock.json` dan `pnpm-lock.yaml`. Package manager ambigu → buang satu.

### 5. Hot path & pertumbuhan tanpa batas

- Tiap `session.usage` memanggil `getBilling()` — `GROUP BY` penuh atas `usage_events` — lalu **menyiarkan tagihan lengkap ke semua klien WS** (`server.js:470`, worker `handleTelemetryEvent`). O(isi tabel) per turn, dan payload ikut tumbuh.
  - **Fix:** Agregat inkremental di DO/row cache, atau debounce broadcast ~1 s.
- Tidak ada `DELETE FROM` sama sekali di repo. `logs` dapat baris baru untuk tiap tool call + tiap task update → DB tumbuh selamanya.
  - **Fix:** Retensi harian (mis. logs 7 hari, tool_calls 24 jam).
- `POST /api/event` (`server.js:183`) mengakumulasi body tanpa batas ukuran. Yang bisa menyentuh port bisa menguras memori.
  - **Fix:** Tolak > ~64 KB.
- `getLastPiCliPrompt` di request path: `readFileSync` hingga 50 file JSONL penuh, sinkron. Dan kalau `cwd` tidak ada di mesin hub, fallback memindai **semua** direktori `--*` — di setup multi-mesin itu membaca log sesi milik mesin hub, bukan milik pengirim.
  - **Fix:** Lewati total kalau cwd tak ada, cache, dan keluarkan dari hot path.

### 6. Mode cloud belum matang

- **Tidak ada reaper.** Lokal punya `reapDeadSessions`; Worker tidak punya `setAlarm`/sweep → sesi yang kena SIGKILL duduk "working" selamanya di kantor cloud.
- `schemaReady = new WeakMap<Env, …>` hampir tidak pernah kena (Env baru per request) dan menyimpan promise **yang gagal** secara permanen → satu error schema = 500 terus-menerus.
- Perbandingan token di `handleGateway` tidak constant-time, dan token diterima lewat **query string** (`?token=`/`?auth=`) — masuk ke akses log & riwayat browser. Aku paham itu fitur "akses cepat" dan `App.tsx:41` menghapusnya dari address bar, tapi tetap: token di URL itu bocor. Minimal beri peringatan di docs bahwa itu jalur sekali-pakai.
- `killSession` cloud cuma menandai offline (benar), tapi UI menampilkan pesan yang sama seolah kill berhasil — sebaiknya toast beda warna.

### 7. Akurasi feed 3D (ini yang bikin dashboard "bohong")

- `officeEngine.ts:2994`: `agents.find(...) || this.agents[0]` → tool call dari sesi tak dikenal **dilempar ke agent acak** dan menambah `toolsDone`-nya.
  - **Fix:** `return` kalau tak ketemu.
- `App.tsx:104` hanya memproses `recent_tool_calls[0]`. Dua tool call datang dalam satu batch render → yang lama **hilang** dari feed.
  - **Fix:** Set `seenIds` / proses semua yang belum tertangani.
- Deteksi sub-agent tidak cocok untuk fan-out paralel: `subagentKey = input.agent` (`index.ts:247`) → beberapa lane dengan nama agen sama menghasilkan satu `${sessionId}_${key}` yang saling menimpa; panggilan `tasks[]` masuk sebagai satu `tool_call`.
  - **Fix:** Sertakan `toolCallId`/index per lane.
- `stats.total_active` di `useOfficeSocket.ts` dihitung beda cara untuk register (`filtered.length+1`) vs end (`filter(status!=='offline')`) → angka bisa melenceng. Toh `Topbar` pakai `sessions.length`, jadi `stats` mubazir — hapus atau jadikan sumber tunggal.
- `activeToolCalls` (Map di extension) tidak pernah dibersihkan kalau `tool_result` tak datang → tumbuh di sesi panjang.
  - **Fix:** TTL sweep.

### 8. Duplikasi & coupling

Enam helper identik ada di **dua tempat**: `summarizePrompt`, `getPiSessionsRoot`, `encodeCwdForPiSessions`, `getSessionLogFiles`, `extractTextContent`, `getLastPiCliPrompt` — di `server/src/db.js` dan `extension/index.ts`. Kalau Pi mengubah format nama file log, dua-duanya harus ingat diedit.

**Fix:** Ekstrak ke modul bersama yang ikut di-bundle.

Dan `isLoopbackEndpoint` (`redact.ts:52`) menganggap `0.0.0.0` = loopback → klien yang menunjuk `http://0.0.0.0:4317` **tidak meredaksi apa pun**, padahal port itu bisa terjangkau LAN. Gabungan paling berbahaya: hub bind `0.0.0.0` + sesi lokal (endpoint `127.0.0.1` → tanpa redaksi) = isi tool & perintah bash utuh tersimpan di DB yang dibaca se-LAN.

---

## 🟢 Nitpick

- `sanitizeCommand` menghancurkan pemisah: `git pull && export KEY=…` tampil sebagai `cat x export KEY=[redacted]` — jangan buang `&&`/`;`, ganti jadi ` ; `.
- `tools/build-global-extension.js` menulis ke `extensions-global/pi-office.ts` **tanpa peduli argumen posisi** — `node tools/build-global-extension.js /tmp/x.ts` diam-diam menimpa file tracked. Perlu `--out` atau tolak arg tak dikenal.
- Banner hasil bundle menyebut "Source of truth: `~/.pi/office/extension/*.ts`" — hardcoded, dan salah untuk repo.
- `sample.html` pernah ter-commit dua kali (root + `dashboard/public/`). Root copy sudah dihapus.
- `tools/test-global-extension.js` hardcode `/home/rizoa/...` — pakai tmpdir.
- `config.example.json` tidak punya field `endpoint`/`token` padahal `docs/EXTENSIONS.md` mendeskripsikannya.
- Doc drift lain: "Loopback bebas autentikasi" ditulis di tabel cloud, padahal worker tidak punya pengecualian itu.
- `officeEngine.ts` 3.017 baris / 119 KB. Arah pemisahan modul scene (`wall-ac`, `street-front`, `indomaret`, `office-annex`, `mushola-mezzanine`) sudah benar — lanjutkan: tarik seat/persona layout, label painting, dan state machine agen keluar.
- Tidak ada skrip `typecheck` padahal `dashboard/tsconfig.json` `strict: true`; tidak ada CI.
- Test e2e lulus 10/10 tapi **tidak menutup jalur migrasi DB lama** — justru bug #2 lolos karena itu. Belum ada unit test untuk wildcard specificity `pricing.js` dan untuk `redact.ts` (baru tersentuh lewat mock `test:extension`).

---

## Saran Urutan Perbaikan

| Prioritas | PR | Isi |
|---|---|---|
| 1️⃣ | **"Jangan bohong & jangan bocor"** | Default `127.0.0.1` + token check di hub lokal + batas ukuran body + hapus `0.0.0.0` dari daftar loopback |
| 2️⃣ | **"Boot aman"** | Indeks setelah migrasi (bug #2) + test "golden legacy schema" yang membuka DB pra-`dedupe_key` dan pra-`pid` |
| 3️⃣ | **"Satu kebenaran"** | `start-dev`/`stop-dev` repo-relative, `~/.pi/office` jadi symlink, workspaces, bersih-bersih `lucide-angular` & satu lockfile, `npm run typecheck` + CI |

Saran: **#2 dulu** — itu satu-satunya yang bisa bikin hub tidak nyala sama sekali, dan kureprodusi dalam 30 detik.

---

## Catatan Lingkungan

- **Node:** v24.16.0
- **npm:** 11.13.0
- **OS:** Linux (RHEL-ish, `/proc` ada)
- **Hub yang berjalan:** pid 591248, uptime 1 hari 7 jam, cwd `/home/rizoa/.pi/office` (copy tua, bukan repo ini)
- **Review ini tidak mengubah apa pun di repo.** Working tree hanya punya drift `package.json`/`package-lock.json` yang sudah ada sebelum review dimulai (sudah kucek: bukan ulah perintah baca seperti `npm ci --dry-run`).
