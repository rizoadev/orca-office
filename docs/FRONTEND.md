# Frontend — Dashboard (`dashboard/`)

**Angular 19** (standalone components, signals) + TypeScript strict + **Three.js** + Tailwind CSS v4. Dibangun jadi SPA statis di `dashboard/dist`, disajikan sendiri oleh hub Node (`:4317`) — satu origin dengan API & WS. Tidak ada router: satu layar, `AppComponent` di-bootstrap langsung dari `main.ts`.

```bash
npm run dev          # hub :4317 + ng serve :4200 (HMR, proxy /api+/ws → 4317)
npm run build        # ng build --configuration production → dashboard/dist
./start-dev.sh       # satu proses saja di :4317 (sajikan hasil build, tanpa HMR)
```

## Struktur

```
dashboard/src/
├── main.ts                      bootstrapApplication(AppComponent, appConfig)
├── index.html                   + font Plus Jakarta Sans / JetBrains Mono
├── styles.css                   design system 2D (1680 baris, dipindah utuh dari
│                                dashboard/src/index.css React) + @theme Tailwind v4
└── app/
    ├── app.component.ts         gate: @if unauthorized → AccessGate, else layout
    ├── app.config.ts            provideZoneChangeDetection(eventCoalescing) +
    │                            provideHttpClient + provideZard — TANPA router
    ├── core/
    │   ├── models/types.ts      AgentData (+PersonRig), Session, ToolCall, LogEntry,
    │   │                        BillingSummary, OfficeState, paket WS, AgentMode
    │   ├── services/
    │   │   ├── websocket.service.ts     WS /ws + reconnect 2s, dorong ke OfficeState
    │   │   ├── office-state.service.ts  sinyal: sessions, toolCalls, logs, billing, stats
    │   │   ├── api.service.ts           fetch REST (credentials:'include')
    │   │   ├── auth.service.ts          ?auth=/?token= → POST /gateway → cookie, 401→sinyal
    │   │   ├── ui-state.service.ts      state layar: terpilih, tab, pause, AC, label,
    │   │   │                            pencarian, jam, toast, kamera
    │   │   └── toast.service.ts         antrean toast (#toasts)
    │   └── utils/
    │       ├── endpoints.ts     SELALU relatif/same-origin (lihat catatan proxy)
    │       ├── coffee-menu.ts   nama minuman per model LLM + formatter token/USD
    │       └── agent-identity.ts chip identitas (🏢 device, 🐋 Orca/workspace)
    ├── stage/
    │   ├── canvas-stage.component.ts   kanvas #shop + #overlay, pasang engine, sync state
    │   └── pill-overlay.component.ts   bubble melayang per agen (#pill-<id>)
    ├── shared/
    │   ├── topbar/                     kontrol + jam + badge LIVE SYNC
    │   ├── sidebar/                    Sidebar, SidebarTabs, FloorStats, SelectedCard
    │   ├── team/                       TeamList, LocationsList, TasksList
    │   ├── feed/                       FeedList, ToolsList
    │   ├── logs/                       RealtimeLogs
    │   ├── billing/                    BillingPanel, BillQuote
    │   ├── auth/                       AccessGate
    │   ├── toast/                      ToastContainer
    │   ├── layout/                     MainLayout (grid stage + sidebar)
    │   └── components/                 Zard UI (14 komponen, lihat catatan di bawah)
    └── engine/                         → lihat docs/ENGINE_MODULES.md
```

## Data flow

```
WS /ws ──► WebsocketService ──► OfficeStateService (signals)
                 ▲                    │  sessions, toolCalls, logs, billing, stats
                 │                    ▼
        GET /api/state (ground truth)   komponen (computed/@if) + CanvasStage
                                            │ effect() → engine
                                            ▼
                                        OfficeScene (Three.js)
```

1. `WebsocketService` membuka `/ws`; saat `onopen` dia refetch `GET /api/state` sebagai ground truth.
2. Tiap paket `{ type, payload }` memutasi sinyal secara immutable: `session_registered`/`team_spawned` (dedupe by id), `session_updated`/`task_updated` (merge), `session_ended` (status `offline`), `tool_called`/`tool_completed` (feed maks 50), `llm_stream_updated` (dipakai LiveBar), `usage_recorded` (billing), `log_appended` (maks 100).
3. Putus → reconnect otomatis + refetch state.
4. `CanvasStageComponent` punya `effect()` yang mendorong hasil ke engine 3D: daftar sesi → `engine.syncRealSessions()`, tool call → `engine.handleRealToolCall()`, menu → `engine.setMenuBoard()`.

**NgZone:** render loop 60fps harus di luar change detection. `OfficeEngineService` membuat scene lewat `NgZone.runOutsideAngular`, dan hanya mendorong hasil ke sinyal di dalam `zone.run()` — jadi animasi 3D tidak memicu CD per frame.

## Endpoint: kenapa relatif, bukan absolut

`core/utils/endpoints.ts` selalu mengembalikan path relatif (`/api/state`, `ws://<host>/ws`).

Versi React dulu membangun URL absolut ke `:4317` saat dev (port 5173). Itu **selalu gagal**: hub menjawab `Access-Control-Allow-Origin: *`, sedangkan semua fetch dikirim dengan `credentials:'include'` (butuh cookie token) — kombinasi yang secara eksplisit diblokir spesifikasi CORS.

Dev sekarang lewat `dashboard/proxy.conf.json` (`/api`, `/ws`, `/gateway` → `localhost:4317`): tetap same-origin, tidak ada lintas-origin sama sekali. Produksi juga relatif, karena hub menyajikan `dashboard/dist` sendiri.

## Engine 3D

Bukan satu kelas lagi. `engine/` berisi **21 `@Injectable` service per-subsystem** yang diorkestrasi `OfficeScene`, dengan `EngineContext` memegang dunia Three.js + jam simulasi. Ruang coffee-shop 14 kursi tetap (`OFFICE_SEATS`), dinding kaca, bar, sun shafts, debu, AC ribbon, mezanine mushola, facade jalan, Indomaret, office annex — semuanya dipindah dari monolit secara verbatim.

Detail, aturan dependensi, dan cara regenerate: **[docs/ENGINE_MODULES.md](ENGINE_MODULES.md)**.

Tema coffee-shop menyusup sampai billing: setiap model LLM dapat **nama minuman** (`coffee-menu.ts`) — Claude → *Cappuccino*, GPT/Codex → *Cold Brew*, model gratis/router → *House Drip*; hash stabil, bentrok mundur ke menu berikutnya. `BillingPanel` menampilkan papan harga per 1M token + total per tamu, dan papan menu 3D di scene ikut menggambarkan tagihan sungguhan.

## Zard UI — status jujur

Zard UI (Angular + Tailwind) terpasang lewat `components.json`; 14 komponen (card, badge, tabs, dialog, tooltip, avatar, …) ada di `shared/components/`.

Tapi **UI utama memakai CSS global hasil port design system React**, bukan komponen Zard. Alasannya: tujuan migrasi adalah tampilan identik 100% dengan baseline, dan mengganti `.card`/`.tabs`/`.row` dengan varian Zard akan menggeser visual. Yang terpakai dari Zard hari ini terutama `provideZard()` + infrastruktur `shared/core|utils` (overlay, event manager, merge-classes). Konsekuensinya: `shared/components/` sebagian besar belum dirujuk — kalau nanti memang tidak akan dipakai, folder itu kandidat penghapusan, bukan alasan untuk menahan upgrade Angular.

## Akses & gateway (klien non-loopback)

Kalau `OFFICE_TOKEN` dipasang, endpoint baca (`/api/state`, `/api/billing`, `/ws`) hanya menjawab klien dengan `Authorization: Bearer <token>` **atau** cookie sesi valid. `/api/health` tetap publik.

Klien yang kena 401 **tidak** di-redirect. `AuthService` men-set sinyal `unauthorized()`, `AppComponent` menampilkan `<app-access-gate>` inline. Token diposting ke `/gateway` (halaman form HTML, bukan SPA); server menyet cookie SHA-256 `HttpOnly` `Secure` `SameSite=Lax` lalu `302 → /`, berlaku 30 hari.

Desain tanpa redirect ini disengaja: dashboard di-embed Orca lewat webview yang reload berkala, dan navigasi otomatis dari dalam `fetchInitialState` menimbulkan race → flicker tanpa henti.

## Kontrol pengguna

Semua lewat `UiStateService` (menggantikan state lokal `App.tsx` + hack `CustomEvent` di window yang sempat dipakai versi port awal):

- Klik bubble atau baris roster → `selectAgent()` → kamera fokus (`camPreset`/tween) + `SelectedCard` detail, dengan **Kill** (`POST /api/sessions/:id/kill`).
- ⏸ Pause animasi, ❄ siklus AC `auto → on → off`, 🏷 toggle label, ⌖ recenter, 🛣 street view.
- Tab: Team · 📍 Locs · Tasks · Tools · Feed · Logs · ☕ Bill; pencarian memfilter roster.
- Tiap aksi memunculkan toast lewat `ToastService` (`#toasts`).

## Verifikasi

Karena dashboard ini hasil migrasi, ada alat pembandingnya (details di ENGINE_MODULES.md):

```bash
node tools/verify-engine-parity.mjs   # audit statis: tidak ada baris logika engine yang hilang
node tools/parity-visual.mjs          # diff pixel vs baseline React, frame-gated
```

Setelah mengubah kode frontend untuk produksi: `npm run build`. Hub membaca dist dari disk tiap request (entry di-serve `no-cache`), jadi **tidak perlu restart hub** — reload browser sudah cukup.
