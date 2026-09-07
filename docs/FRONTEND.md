# Frontend — Dashboard (dashboard/)

React 19 + TypeScript + Vite 6 + Three.js. Dibangun menjadi SPA statis di `dashboard/dist`, disajikan sendiri oleh hub Node (`:4317`) — satu origin dengan API & WS. Tanpa router eksternal; `App.tsx` mengatur layout.

## Struktur

```
dashboard/src/
├── main.tsx                    # Entry React
├── App.tsx                     # Layout utama: stage 3D + sidebar + toasts + kontrol
├── types.ts                    # Tipe bersama (Session, ToolCall, LogEntry, billing, ...)
├── hooks/
│   └── useOfficeSocket.ts      # WS + HTTP state: satu hook, seluruh realtime
├── lib/
│   ├── office-endpoints.ts     # URL API/WS — sadar mode dev (port 5173 → 4317)
│   ├── coffee-menu.ts          # Penamaan menu kopi per model + formatter token/USD
│   └── agent-identity.ts       # Label chip device/Orca untuk bubble
├── engine/
│   ├── officeEngine.ts         # Three.js: scene, 14 kursi, bubble agent, kamera orbit
│   ├── street-front.ts         # Lingkungan jalan depan
│   ├── indomaret.ts            # bangunan Indomaret di lingkungan
│   ├── mushola-mezzanine.ts    # Mushola + mezzanine
│   └── wall-ac.ts              # Unit AC dinding (dengan mode auto/on/off)
└── components/
    ├── Topbar.tsx / Navbar.tsx
    ├── Stage/
    │   ├── StageContainer.tsx  # Kanvas 3D + overlay
    │   ├── PillOverlay.tsx     # Pil info di atas bubble
    │   └── LiveBar.tsx         # Bar stream LLM realtime per bubble
    ├── Sidebar/
    │   ├── Sidebar.tsx / SidebarTabs.tsx
    │   ├── TeamList.tsx        # Roster tim (persona Indonesia)
    │   ├── TasksList.tsx / ToolsList.tsx / FeedList.tsx
    │   ├── SelectedCard.tsx    # Detail agent terpilih + tombol Kill
    │   ├── BillingPanel.tsx    # Tagihan coffee-shop per guest & per brew
    │   └── FloorStats.tsx      # Statistik lantai
    ├── TeamRoster.tsx / ToolCallsFeed.tsx / RealtimeLogs.tsx
    ├── OfficePreview.tsx
    └── Toast/ToastContainer.tsx
```

## Data flow

```
WS /ws ──► useOfficeSocket ──► state { sessions, recent_tool_calls,
                                       recent_logs, billing, stats }
                │                        ▲
                └── onopen: refetch ─────┘   (GET /api/state sebagai ground truth)
```

`useOfficeSocket`:

1. `GET /api/state` untuk snapshot awal.
2. Koneksi WS; tiap paket `{ type, payload }` memutasi state secara immutable:
   - `session_registered` / `team_spawned` → tambah sesi (dedupe by id)
   - `session_updated` / `task_updated` → merge ke sesi yang cocok
   - `session_ended` → status jadi `offline`, hitung ulang `total_active`
   - `tool_called` → prepend ke feed (maks 50), `tool_completed` → merge hasil
   - `llm_stream_updated` → pasang `liveStream` pada sesi (dipakai LiveBar)
   - `usage_recorded` → ganti `billing` (server sudah agregasi)
   - `log_appended` → prepend log (maks 100)
3. Putus → reconnect otomatis tiap 2 detik + refetch state.

`lib/office-endpoints.ts` membuat dashboard jalan di dua mode tanpa perubahan:

- Dev (`port 5173`): API & WS diarahkan ke `:4317` (match proxy di `vite.config.ts`).
- Build/produksi: same-origin (`''`), karena hub menyajikan dist sendiri. Protokol WS mengikuti halaman (`wss:` di HTTPS — penting saat di-embed via Worker cloud).

## Visual: coffee-shop 3D

`engine/officeEngine.ts` membuat scene Three.js dengan **14 kursi tetap** (`OFFICE_SEATS`, masing-masing punya `defaultRole` seperti *Lead Architect*, *Database Reliability*). Sesi dari WS dipetakan ke kursi; bubble menampilkan avatar, nama, task, live stream, dan chip identitas (`🏢 device`, `🐋 Orca/workspace`).

Tema coffee-shop menyusup sampai billing:

- Setiap model LLM diberi **nama minuman** (`coffee-menu.ts`): Claude → *Cappuccino*, GPT/Codex → *Cold Brew*, dst. Model gratis/router tanpa tagihan = *House Drip*. Nama di-hash agar stabil; bentrok digeser ke menu berikutnya (Espresso, Americano, …).
- `BillingPanel` menampilkan "menu board" harga per 1M token + total per guest.
- `sample.html` (root repo, juga di-serve dari dist) adalah versi simulasi mandiri dari office 3D untuk demo tanpa backend.

## Akses & gateway (klien non-loopback)

Ketika `OFFICE_TOKEN` diatur di Worker cloud, endpoint baca (`/api/state`, `/api/billing`, `/ws`) hanya menjawab klien yang menyertakan `Authorization: Bearer <token>` **atau** cookie sesi yang valid.

Klien yang mendapat 401 tidak akan di-redirect ke `/gateway`. Sebagai gantinya, React menampilkan panel `AccessGate` (inline) yang menanyakan token. Token diposting ke `/gateway` via POST; Worker menyet cookie SHA-256 `HttpOnly` + `Secure` + `SameSite=Lax` lalu menjawab `302 → /`. Cookie berlaku 30 hari.

Desain ini menghindari flicker tak berujung: dashboard Orca embedding men-reload via webview secara berkala; navigasi otomatis dari dalam `fetchInitialState` menjejalkan race condition yang menyebabkan kedip tanpa henti.

- `/gateway` = halaman form HTML, bukan SPA. Menerima POST dengan `Content-Type: application/x-www-form-urlencoded`, field `token`.
- Cookie dibaca oleh `GET /api/state`, `GET /api/billing`, `GET /ws` — pengecekan dilakukan via header `Authorization` dulu, baru `Cookie: session=<hash>`.
- `/api/health` tetap publik — tidak perlu autentikasi.

## Kontrol pengguna

- Pilih agent (klik bubble atau roster) → `SelectedCard` menampilkan detail + **Kill** (`POST /api/sessions/:id/kill`).
- Pause animasi, mode AC (`auto/on/off`), toggle label — state UI lokal di `App.tsx`.

## Menjalankan & build

```bash
# Dev dengan HMR (dua terminal):
npm run server      # hub :4317
npm run dashboard   # vite :5173, proxy /api & /ws → 4317

# Produksi (cara normal):
npm run build       # vite build → dashboard/dist, otomatis tersaji oleh hub
```

Setelah mengubah kode frontend, jalankan `npm run build` lagi — hub membaca dist dari disk tiap request, jadi tidak perlu restart hub (entry di-serve `no-cache`, jadi reload browser sudah cukup).
