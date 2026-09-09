# ☕ ORCA24 Coworking Space — Observabilitas Realtime Sesi & Tim

Platform observabilitas interaktif untuk **Pi Dev CLI**. Setiap sesi Pi Dev CLI yang Anda jalankan otomatis terdaftar ke **kantor virtual** dengan **persona Indonesia**, tugas aktif, deteksi spawn **sub-agent**, telemetry tool calls (`bash`, `read`, `edit`, …), stream respons LLM realtime, dan **tagihan coffee-shop** (token & USD per pegawai & per model) — dipush realtime via **SQLite + WebSocket**.

Repo ini adalah **sumber kebenaran** untuk proyek pi-office: kode extension modular, builder global Pi extension, backend hub, dashboard 3D, dan seluruh dokumentasi.

---

## Fitur

- 🪑 **Kantor 3D coffee-shop** — 14 kursi, tiap sesi jadi bubble agent dengan avatar & nama Indonesia.
- 🌐 **Extension Pi terpasang GLOBAL** — semua sesi `pi` di mesin otomatis terdaftar; `npm run sync:extension` membangun `extension/*.ts` menjadi `~/.pi/agent/extensions/pi-office.ts`.
- 🛡 **Redaksi rahasia** — payload tool diringkas & rahasia disensor sebelum keluar mesin (hub non-loopback).
- 👥 **Roster tim & hierarki sub-agent** — sesi induk → sub-agent terlihat sebagai anggota tim baru.
- ⚡ **Realtime tool-call feed, stream LLM, dan log terminal** via WebSocket.
- 📊 **Billing coffee-shop** — setiap model jadi nama minuman (Claude → Cappuccino, GPT → Cold Brew); harga per 1M token & total per pegawai.
- 🏷 **Identitas multi-mesin & Orca** — chip `🏢 device` + `🐋 Orca/workspace`, satu kantor dari banyak laptop.
- ☁️ **Dua mode deploy** — lokal (Node + SQLite + WS di `:4317`, satu origin) atau cloud (Cloudflare Worker + Durable Object + Turso).
- 🕹 **Kontrol Kill aman** — SIGTERM hanya dikirim ke proses yang terbukti Pi, tidak pernah ke proses lain.

## Arsitektur (ringkas)

```
┌──────────────────────────────────────────────────────────┐
│  Pi Dev CLI session (extension pi-office)                 │
│  • persona Indonesia • task • tool-call • sub-agent      │
│  • LLM stream • usage  →  POST /api/event (non-blocking) │
└──────────────────────────┬───────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────┐
│  Hub — satu origin :4317 (Node: http + node:sqlite + ws) │
│  • REST : /api/health · /api/state · /api/billing ...    │
│  • WS   : /ws broadcaster                                 │
│  • SQLite office.db (WAL) — sessions, tool_calls, logs,   │
│    usage_events                                           │
│  • Static: dashboard/dist                                 │
└─────────────┬───────────────────────────────┬────────────┘
              ▼ WS broadcast                  ▼ (mode cloud)
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ Dashboard Angular + Three.js │   │ Cloudflare Worker + DO        │
│ http://127.0.0.1:4317        │   │ + Turso (libSQL)              │
└──────────────────────────────┘   └──────────────────────────────┘
```

Detail arsitektur penuh: [docs/BACKEND.md](docs/BACKEND.md) · [docs/FRONTEND.md](docs/FRONTEND.md) · [docs/DATABASE.md](docs/DATABASE.md).

---

## Quickstart (30 detik)

```bash
cd ~/.pi/office
npm install                 # root
(cd server && npm install)  # server
(cd dashboard && npm install)
npm run build               # dashboard → dist
./start-dev.sh              # 🟢 sehat di http://127.0.0.1:4317
npm run sync:extension      # pasang pi-office extension ke global Pi
```

Lalu buka `http://127.0.0.1:4317` dan jalankan `pi` di mana saja — sesi Anda muncul sebagai bubble di kursi coffee-shop.

> Set-up otomatis penuh: `./scripts/bootstrap.sh` (prasyarat → deps → build → config → machine-id → sync extension → test → start).

---

## Dokumentasi Lengkap

| Dokumen | Isi |
|---|---|
| [docs/INSTALL.md](docs/INSTALL.md) | Instal dari nol: prasyarat, semua deps, build, run, test, troubleshooting |
| [docs/EXTENSIONS.md](docs/EXTENSIONS.md) | **Pi extension office (global)**: cara pasang (`sync:extension`), cara kerja, redaksi, tool kustom, konfigurasi |
| [docs/BACKEND.md](docs/BACKEND.md) | Hub: struktur file, REST API, WebSocket, event telemetry, kill safety, reaper, resolusi harga |
| [docs/FRONTEND.md](docs/FRONTEND.md) | Dashboard Angular 19 + Three.js: struktur, data flow socket, engine 3D terpecah, menu kopi, build |
| [docs/DATABASE.md](docs/DATABASE.md) | Skema SQLite & Turso: tabel, indeks, migrasi ringan, backfill |
| [docs/ORCA.md](docs/ORCA.md) | Integrasi Orca: identitas sesi, embed dashboard, multi-mesin |
| [docs/DEPLOY-CLOUDFLARE.md](docs/DEPLOY-CLOUDFLARE.md) | Deploy Worker + Durable Object + Turso, secret, beda perilaku lokal vs cloud |

## Isi Repo

```
<repo office/>   (mis. ~/PROJECTS/office — salinan runtime di ~/.pi/office hasil clone/sync)
├── server/                  Backend hub (Node + SQLite + WS)
├── dashboard/               Frontend (Angular 19 standalone + Tailwind v4 + Three.js)
├── cloudflare/worker.ts     Worker cloud (DO + Turso)
├── extension/               SUMBER extension Pi (modular; index, client, redact, ...)
├── tools/
│   ├── build-global-extension.js  Gabung extension/ → satu file global
│   └── test-global-extension.js   Verifikasi redaksi & identitas hasil build
├── scripts/
│   ├── bootstrap.sh         Setup idempotent satu perintah
│   └── install-extensions.sh  Salin extension tambahan (soul-anchor, footer, orca-*)
├── extensions-global/       Extension Pi lain yang dipakai mesin (referensi repo)
├── start-dev.sh · stop-dev.sh  Manage hub background
├── config.example.json · .env.example · wrangler.toml · plan.yaml
└── docs/                    Dokumentasi lengkap
```

## Skrip npm

| Perintah | Arti |
|---|---|
| `npm run sync:extension` | **Pasang pi-office ke global Pi** (`extension/*.ts` → `~/.pi/agent/extensions/pi-office.ts`) |
| `npm run test:extension` | Verifikasi global extension (identitas, auth, redaksi rahasia) |
| `npm run server` | Jalankan hub (foreground, `:4317`) |
| `npm run dashboard`  | `ng serve` Angular (HMR, `:4200`, proxy `/api`+`/ws` → 4317) |
| `npm run dev`        | `tools/run-dev.js`: hub `:4317` + `ng serve` `:4200` sekaligus |
| `npm run build` | Build dashboard → `dashboard/dist` |
| `npm test` | E2E (WS + register + tool + billing, port 4318) |
| `npm run simulate` | Kirim sesi palsu untuk demo |
| `npm run backfill:usage` | Isi tagihan sesi lama dari log JSONL Pi |
| `npm run cf:dev` / `npm run cf:deploy` | Cloudflare local / deploy |
| `npm run pi:office` | `pi -e extension/index.ts` (satu sesi saja) |

## Lingkungan

- **Node ≥ 22** (disarankan 26) karena `node:sqlite`.
- Env lengkap: [.env.example](.env.example). Field config extension: [docs/EXTENSIONS.md](docs/EXTENSIONS.md#konfigurasi-endpoint).
- Secret & runtime (`config.json`, `orca.json`, `cloud.env`, `machine-id`, `*.db`, `*.log`, `dashboard/dist`) berada di `.gitignore` — repo aman untuk remote.

---

Didukung `pi-office` extension & dashboard — dibangun untuk hidup berdampingan dengan Orca, tapi berjalan mandiri.