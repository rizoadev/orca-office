# Instalasi Lengkap — Dari Nol Sampai Jalan

## Prasyarat

| Perangkat | Versi | Catatan |
|---|---|---|
| Node.js | **22.18+** (disarankan 24+, diuji di 24.x) | `db.js` meng-import `lib/session-utils.ts` → butuh *type stripping* (default mulai 23.6; di 22.x perlu `--experimental-strip-types`). `node:sqlite` sudah tidak dipakai |
| npm | 10+ | ikut Node |
| Git | tersedia | untuk repo |
| curl | tersedia | health check `start-dev.sh` |
| `pi` CLI | terpasang | hanya untuk memakai extension |
| Turso CLI & wrangler | opsional | hanya untuk mode cloud |

Cek cepat:

```bash
node -v && npm -v && git --version
```

## Cara cepat (bootstrap otomatis)

```bash
git clone <url-repo> ~/.pi/office   # kalau mulai dari remote
cd ~/.pi/office
./scripts/bootstrap.sh
```

`bootstrap.sh` idempotent: install deps, build dashboard, buat `config.json` & `machine-id` (kalau belum ada), pasang extension ke global Pi (`sync:extension`), jalankan test e2e, lalu start hub.

## Cara manual, langkah demi langkah

### 1. Install semua dependency

Tiga lokasi `package.json`: root (`ws` + `@libsql/client` + wrangler), `server/` (`ws` — satu-satunya dependensinya), `dashboard/` (Angular, Three.js, Tailwind v4, Zard UI).

```bash
cd ~/.pi/office
npm install                 # root: ws, @libsql/client; dev: wrangler
cd server && npm install    # server: ws
cd ../dashboard && npm install   # dashboard: @angular/*, three, tailwindcss v4, dsb.
cd ..
```

Atau sekali jalan:

```bash
npm --prefix . install && npm --prefix server install && npm --prefix dashboard install
```

### 2. Build dashboard

```bash
npm run build      # = cd dashboard && ng build --configuration production → dashboard/dist
```

Wajib sebelum start hub — hub menyajikan dist ini.

### 3. Konfigurasi lokal

```bash
cp config.example.json config.json && chmod 600 config.json
# Isi sesuai kebutuhan; untuk lokal murni, contoh sudah cukup.
```

Field yang tersedia: `url` (origin hub), `endpoint` (URL lengkap /api/event, menang), `token` (Bearer, opsional), `enabled` (`false` = matikan telemetry), `machineName`, `orcaName`, `machineId`, `orcaWorkspace`, `orcaPane`.

Machine identity stabil dibuat otomatis oleh extension di `~/.pi/office/machine-id` (0600). Boleh dibuat manual:

```bash
node -e 'console.log("office-machine-"+require("node:crypto").randomUUID())' > ~/.pi/office/machine-id
chmod 600 ~/.pi/office/machine-id
```

### 4. Start hub

```bash
./start-dev.sh
# 🟢 Kantor Pi Hub sehat di http://127.0.0.1:4317 (dashboard + API + WS satu origin)
```

Verifikasi:

```bash
curl -s http://127.0.0.1:4317/api/health
# {"status":"ok","time":...}
```

Stop: `./stop-dev.sh` (hanya menyentuh PID yang dicatatnya sendiri, dan hanya jika cmdline-nya benar-benar hub).

### 5. Pasang Pi extension (global)

```bash
npm run sync:extension   # extension/*.ts → ~/.pi/agent/extensions/pi-office.ts
npm run test:extension   # verifikasi redaksi & identitas
```

Detail lengkap: [EXTENSIONS.md](./EXTENSIONS.md).

### 6. Jalankan Pi dan lihat kantor

```bash
cd ~/.pi/office
pi
```

Buka `http://127.0.0.1:4317` — sesi baru muncul sebagai bubble di kursi coffee shop, dengan persona Indonesia dan task dari prompt terakhir Anda.

## Test & simulasi

```bash
npm test                    # e2e: WS connect + register + tool + billing, port 4318, DB /tmp
npm run simulate            # kirim event sesi palsu (Budi Santoso & kawan-kawan) ke hub
npm run backfill:usage      # isi tagihan sesi lama dari log JSONL Pi
```

## Mode lanjutan

- **LAN / multi-laptop**: hub bind `0.0.0.0` — di mesin lain set `export OFFICE_ENDPOINT=http://<IP-HUB>:4317/api/event` (+ opsional `OFFICE_MACHINE_NAME`, `OFFICE_ORCA_NAME`).
- **Cloud (Cloudflare Worker + Turso)**: [DEPLOY-CLOUDFLARE.md](./DEPLOY-CLOUDFLARE.md).
- **Embed di Orca**: [ORCA.md](./ORCA.md).

## Troubleshooting

| Gejala | Sebab umum | Solusi |
|---|---|---|
| `start-dev.sh` gagal, log kosong | port dipakai proses lain | `OFFICE_PORT=4318 ./start-dev.sh`, atau matikan pemakai lama |
| Hub jalan tapi dashboard 404 | `dashboard/dist` belum ada | `npm run build` |
| Sesi tidak muncul | extension global belum terpasang / endpoint salah | `npm run sync:extension`, cek `~/.pi/office/config.json` & `OFFICE_ENDPOINT` |
| Bubble stuck "working" | proses di-SIGKILL (tanpa `session.end`) | tunggu reaper (≤ 1 menit) — butuh pid tercatat; sesi tanpa pid dipulihkan saat restart hub (>6 jam) |
| Tagihan kosong | harga model belum ada di tabel/feed | isi `pricing.json`, atau `POST /api/billing/feed/refresh`, cek `GET /api/billing/quote?model=...&portkey=1` |
| Footer Pi tidak muncul | `pi-token-footer` belum terpasang | `./scripts/install-extensions.sh extras` |
| Kill dari dashboard ditolak 409 | PID hidup tapi bukan proses Pi | safety by design — verifikasi manual proses tersebut |
