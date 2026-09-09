# ORCA24 Coworking — Deep Index & Dokumentasi Lengkap

> Sumber kebenaran: `~/PROJECTS/office` (git `feat/toilet-wall-panel@61cff96`).  
> Dokumen ini menengahi seluruh basis kode sampai ujung jari: arsitektur, graph, database,  
> setiap komponen frontend, setiap bagian perintilan kantor, furniture, pattern agen, dan total.

---

## 1. Arsitektur — Graph Konseptual

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (localhost:4200 dev / :4317 prod)                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Angular 19 SPA (dashboard/dist)                            │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────────┐  │   │
│  │  │ Topbar   │  │ Sidebar  │  │  CanvasStage              │  │   │
│  │  │ (kontrol)│  │ (roster, │  │  ┌────────────────────┐  │  │   │
│  │  └──────────┘  │ tabs,    │  │  │ Three.js Engine    │  │  │   │
│  │                │ bill)    │  │  │ 21 @Injectable      │  │  │   │
│  │  ┌──────────┐  └──────────┘  │  │ services           │  │  │   │
│  │  │ Toasts   │                │  └────────────────────┘  │  │   │
│  │  └──────────┘                └──────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│         │                         │                                │
│         │ GET /api/state          │ WS /ws                        │
│         ▼                         ▼                                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Node 24 Hub (server/src/index.js → :4317)                 │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │   │
│  │  │ REST API    │  │ WS Hub      │  │ Static SPA           │ │   │
│  │  │ /api/*      │  │ /ws         │  │ dashboard/dist       │ │   │
│  │  └──────┬──────┘  └──────┬──────┘  └─────────────────────┘ │   │
│  │         │                │                                  │   │
│  │         ▼                ▼                                  │   │
│  │  ┌─────────────────────────────────────┐                     │   │
│  │  │ OfficeDB (node:sqlite, office.db)   │                     │   │
│  │  │ sessions / tool_calls / logs /      │                     │   │
│  │  │ usage_events                        │                     │   │
│  │  └─────────────────────────────────────┘                     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│         ▲                         ▲                                │
│         │ POST /api/event         │ heartbeat                      │
│         │ (Pi extension)          │                                 │
│  ┌──────┴──────────────────────────────────────┐                  │
│  │  Pi CLI / Orca (extension/ → global)        │                  │
│  └─────────────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘

Single-origin: dev lewat proxy.conf.json (same-origin), prod hub saji dist sendiri.
```

### Aliran Data

```
1. Pi CLI / Orca mengirim event ke POST /api/event
   └─ server mencatat di SQLite + broadcast via WS

2. Browser Angular:
   GET /api/state (snapshot awal)
   └─ WebSocketService buka /ws, terima paket {type, payload}
      └─ OfficeStateService (signals) → komponen computed/@if
         └─ CanvasStageComponent.effect() → OfficeScene.syncRealSessions()
            └─ Engine 3D (21 services) update scene + animasi

3. User aksi (klik, tab, pause, AC)
   └─ UiStateService signal → komponen reaksi → engine method call
```

---

## 2. Backend — Hub Node 24

### 2.1 File Server

| File | Fungsi |
|------|--------|
| `server/src/index.js` | Entry: createOfficeServer + reap timer + listen |
| `server/src/server.js` | HTTP server: REST API + SPA static serving |
| `server/src/ws.js` | WebSocket hub: broadcast ke semua client |
| `server/src/db.js` | OfficeDB: schema, queries, billing aggregation |
| `server/src/pricing.js` | Tabel harga lokal (portkey + llm-prices fallback) |
| `server/src/pricing-portkey.js` | Lookup harga via Portkey API |
| `server/src/pricing-remote.js` | Feed harga bulk (pull + cache) |

### 2.2 REST API

| Method | Path | Fungsi |
|--------|------|--------|
| GET | `/api/health` | Heartbeat hub |
| GET | `/api/state` | Snapshot penuh: sessions + tool_calls + logs + billing + stats |
| GET | `/api/billing` | Agregat tagihan per guest & per brew (model) |
| GET | `/api/billing/quote?model=&provider=&portkey=1` | Satu baris harga: lokal + opsional Portkey |
| POST | `/api/billing/feed/refresh` | Pull refresh daftar harga bulk |
| POST | `/api/sessions/:id/kill` | Kill sesi (SIGTERM ke PID, safety check) |
| POST | `/api/event` | Telemetry dari Pi extension / CLI |
| GET | `/api/*` (unknown) | 404 |
| * | `/` + SPA paths | Sajikan `dashboard/dist` (fallback `index.html`) |

### 2.3 WebSocket (`/ws`)

Format paket: `{ type, payload, timestamp }`

Event keluar (broadcast ke semua client):

| Event Type | Trigger | Payload |
|------------|---------|---------|
| `session_registered` | `session.register` | Session object |
| `session_updated` | `session.heartbeat` / `task.update` | Session object |
| `session_ended` | `session.end` / kill | `{ session_id }` |
| `team_spawned` | `team.register` | Session object (sub-agent) |
| `tool_called` | `tool.call` | ToolCall object |
| `tool_completed` | `tool.result` | ToolCall object (terisi result) |
| `llm_stream_updated` | `llm.stream` | `{ session_id, kind, text, isFinal, updatedAt }` |
| `usage_recorded` | `session.usage` | BillingSummary lengkap (setiap receipt LLM) |
| `log_appended` | `log.append` | LogEntry object |
| `task_updated` | `task.update` | Session object |

### 2.4 Model Penyimpanan: Satu Driver, Dua Target

| Target | URL | Dipakai oleh |
|--------|-----|--------------|
| SQLite lokal | `file:office.db` | hub dev, `createOfficeServer({ dbPath })`, test e2e |
| Turso cloud | `libsql://<db>.turso.io` | hub produksi + `cloudflare/worker.ts` |

`node:sqlite` sudah tidak dipakai sama sekali. Semua method `OfficeDB` async, dan `server.js`
meng-`await` di setiap jalur (`/api/state`, `/api/billing`, `killSession`, `/api/event`).

Wrapper di `db.js` sengaja menahan pola warisan `prepare().run/get/all()` supaya migrasi tidak
mengubah 20 pemanggil sekaligus. Kontrak startup: **`await db.ready()` sebelum query pertama** —
`index.js` melakukannya sebelum `listen`, `test-e2e.js` juga. Tidak ada gate per-method; dulu ada
`_waitReady()` dengan komentar "dipanggil di awal setiap method publik" padahal tidak pernah
dipanggil, dan itu dihapus karena memberi rasa aman palsu.

### 2.5 Keamanan & Session Lifecycle

- **Auth**: `OFFICE_TOKEN` → `Authorization: Bearer` atau cookie `session=<SHA-256>`.
- **Loopback bypass**: `127.0.0.1` / `::1` tanpa token.
- **Kill safety**: cek PID ada, bukan PID server, cmdline cocok `pi`/`pi-cli`/`node ... pi`.
- **Reaper**:
  - `reapDeadSessions()`: startup sweep — proses yang `/proc/<pid>` hilang → `offline`.
  - `reapAbandonedSessions(olderThanMs)`: startup sweep — tanpa PID + heartbeat basi → `offline`.
  - Kedua fungsi **tidak di-timer** (hanya saat startup) agar sesi idle yang masih hidup tidak ditakut-takuti.

---

## 3. Database Design

### 3.1 Schema

```sql
PRAGMA journal_mode = WAL;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  avatar TEXT NOT NULL,
  color TEXT NOT NULL,
  cwd TEXT,
  project TEXT,               -- nama repo (di-backfill dari cwd → .git)
  machine_id TEXT,
  machine_name TEXT,
  orca_name TEXT,
  orca_workspace TEXT,
  orca_pane TEXT,
  client_kind TEXT,            -- 'pi' | 'orca' | 'subagent'
  model TEXT,                  -- model LLM (mis. openai-codex/gpt-5.6-luna)
  pid INTEGER,                 -- PID proses Pi CLI (null = heartbeat-only)
  task TEXT,                   -- deskripsi tugas saat ini
  status TEXT DEFAULT 'working', -- 'working' | 'idle' | 'offline'
  is_subagent INTEGER DEFAULT 0,
  parent_session_id TEXT,      -- untuk sub-agent
  started_at INTEGER,
  last_heartbeat INTEGER,
  ended_at INTEGER
);

CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  input_json TEXT,
  result_json TEXT,
  is_error INTEGER DEFAULT 0,
  duration_ms INTEGER,
  created_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  level TEXT DEFAULT 'info',   -- 'debug' | 'info' | 'warn' | 'error'
  source TEXT,                 -- 'pi-session' | 'subagent' | 'tool_call' | 'control'
  message TEXT NOT NULL,
  created_at INTEGER
);

CREATE TABLE usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_write_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  cost_source TEXT DEFAULT 'none',  -- 'table' | 'feed' | 'reported' | 'none'
  cost_rank INTEGER DEFAULT 0,      -- numeric rank agar MAX() jujur
  dedupe_key TEXT,                   -- UNIQUE partial index untuk backfill aman
  created_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

### 3.2 Indexes

| Index | Tujuan |
|-------|--------|
| `idx_sessions_status` | Filter sesi aktif cepat |
| `idx_tool_calls_session` | JOIN + filter per sesi |
| `idx_logs_session` | JOIN + filter per sesi |
| `idx_usage_session_model` | Agregasi billing per (session, model) |
| `idx_usage_created` | Urutan kronologis usage |
| `idx_usage_dedupe` (UNIQUE partial) | Backfill aman — `WHERE dedupe_key IS NOT NULL` |

### 3.3 Relasi & Konsep

```
sessions (1) ──< (N) tool_calls        via session_id
sessions (1) ──< (N) logs              via session_id
sessions (1) ──< (N) usage_events      via session_id

Sub-agent: sessions.parent_session_id → sessions.id (ref ke sesi induk)
```

### 3.4 Backfill Startup

- **`backfillMissingProjectNames()`**: sesi lama tanpa kolom `project` diisi dari `cwd` → cari `.git` ke atas (max 12 level) → nama repo.
- **`backfillWaitingPromptTasks()`**: sesi dengan task "Menunggu prompt..." diganti prompt terakhir dari log JSONL Pi CLI (`~/.pi/agent/sessions/`).

### 3.5 Pricing

- Sumber: `pricing.js` (tabel lokal), `pricing-portkey.js` (API Portkey), `pricing-remote.js` (feed bulk).
- `cost_source` di `usage_events`: `table` (tertinggi otoritas) → `feed` → `reported` → `none`.
- `cost_rank` numerik menggantikan `MAX(cost_source)` agar agregasi jujur.

### 3.6 Resolver DB & Auth (db.js)

```js
function resolveDatabaseUrl(target) {          // dbPath > TURSO_DATABASE_URL > error
  const value = target || process.env.TURSO_DATABASE_URL;
  return /^(libsql|https|wss|file):\/\//.test(value) ? value : `file:${path.resolve(value)}`;
}

function createDbClient(target) {
  const url = resolveDatabaseUrl(target);
  // authToken HANYA untuk remote: libSQL menolak token pada URL `file:`.
  const authToken = url.startsWith('file:') ? undefined : process.env.TURSO_AUTH_TOKEN;
  // ...
  return {
    exec(sql) { return client.execute(sql); },
    batch(stmts) { return client.batch(stmts); },
    prepare(sql) {
      // Normalize: no args → raw SQL; satu object non-array → named params ($id);
      // sisanya → positional. Lalu petakan bentuk hasil ke pola node:sqlite.
      return {
        run: wrap((r) => ({ changes: r.rowsAffected, lastInsertRowid: Number(r.lastInsertRowid) || 0 })),
        get: wrap((r) => r.rows[0] || undefined),
        all: wrap((r) => r.rows),
      };
    },
  };
}
```

Semua method `OfficeDB` menjadi `async`. `server.js` menambahkan `await` pada semua panggilan.  
Ini memungkinkan hub berjalan di atas Turso (libSQL cloud) tanpa mengubah logic query —  
namun schema dan indexing tetap sama. Deployment edge (`cloudflare/worker.ts`) menggunakan  
Durable Object SQLite + Turso sebagai sumber data yang sama.

---

## 4. Frontend — Angular 19

### 4.1 Struktur Direktori

```
dashboard/src/
├── main.ts                          bootstrapApplication(AppComponent, appConfig)
├── index.html                       font Plus Jakarta Sans / JetBrains Mono
├── styles.css                       design system 2D (1699 baris) + @theme Tailwind v4
├── angular.json                     outputPath: dist/ (langsung di-serve hub)
├── proxy.conf.json                  dev: /api, /ws, /gateway → localhost:4317
└── app/
    ├── app.component.ts             gate: @if unauthorized → AccessGate, else layout
    ├── app.config.ts                provideZoneChangeDetection + provideHttpClient + provideZard
    │                                TANPA router (bootstrap langsung)
    ├── core/
    │   ├── models/
    │   │   └── types.ts             AgentData, Session, ToolCall, LogEntry, BillingSummary,
    │   │                            OfficeState, WsPacket, SeatConfig, OFFICE_SEATS[14]
    │   ├── services/
    │   │   ├── websocket.service.ts  WS /ws + reconnect 2 detik + refetch state
    │   │   ├── office-state.service.ts sinyal: sessions, toolCalls, logs, billing, stats
    │   │   ├── api.service.ts        fetch REST (credentials:'include')
    │   │   ├── auth.service.ts       ?auth=/?token= → POST /gateway → cookie, 401→sinyal
    │   │   ├── ui-state.service.ts   state layar: terpilih, tab, pause, AC, label,
    │   │   │                         pencarian, jam, toast, kamera
    │   │   └── toast.service.ts      antrean toast (#toasts)
    │   └── utils/
    │       ├── endpoints.ts          SELALU relatif/same-origin
    │       ├── coffee-menu.ts        nama minuman per model LLM + formatter token/USD
    │       └── agent-identity.ts     chip identitas (🏢 device, 🐋 Orca/workspace)
    ├── stage/
    │   ├── canvas-stage.component.ts kanvas #shop + #overlay, pasang engine, sync state
    │   └── pill-overlay.component.ts bubble melayang per agen (#pill-<id>)
    ├── shared/
    │   ├── topbar/
    │   │   └── topbar.component.ts   kontrol + jam + badge LIVE SYNC
    │   ├── sidebar/
    │   │   ├── sidebar.component.ts  Sidebar (tabs + pane)
    │   │   ├── sidebar-tabs.component.ts 7 tab: Team · Locs · Tasks · Tools · Feed · Logs · Bill
    │   │   ├── team-list.component.ts     Roster tim (persona Indonesia)
    │   │   ├── locations-list.component.ts Roster per device/laptop
    │   │   ├── tasks-list.component.ts    Daftar tugas agen
    │   │   ├── tools-list.component.ts    Feed tool calls (5 chips: read/edit/bash/search/other)
    │   │   ├── feed-list.component.ts     Feed event timeline
    │   │   ├── selected-card.component.ts Detail agent terpilih + Kill
    │   │   ├── billing-panel.component.ts Tagihan coffee-shop per guest & per brew
    │   │   ├── bill-quote.component.ts    Harga satuan model (quote API)
    │   │   └── floor-stats.component.ts   Statistik lantai
    │   ├── team/
    │   │   └── team-list.component.ts     (alias dari sidebar/team-list)
    │   ├── feed/
    │   │   ├── feed-list.component.ts     Event feed
    │   │   └── tools-list.component.ts    Tool call chips
    │   ├── logs/
    │   │   └── realtime-logs.component.ts Terminal log realtime
    │   ├── billing/
    │   │   ├── billing-panel.component.ts Bill tab
    │   │   └── bill-quote.component.ts    Quote per model
    │   ├── auth/
    │   │   └── access-gate.component.ts  Panel 401 (token input)
    │   ├── toast/
    │   │   └── toast-container.component.ts Antrean toast
    │   ├── layout/
    │   │   └── main-layout.component.ts  Grid: stage + sidebar
    │   └── components/            Zard UI (14 komponen, sebagian besar belum dipakai UI utama)
    │       ├── avatar/             Avatar, AvatarGroup
    │       ├── badge/              Badge
    │       ├── button/             Button
    │       ├── card/               Card
    │       ├── dialog/             Dialog + DialogRef + DialogService
    │       ├── empty/              Empty state
    │       ├── input/              Input
    │       ├── input-group/        InputGroup
    │       ├── progress/           Progress
    │       ├── separator/          Separator
    │       ├── skeleton/           Skeleton
    │       ├── spinner/            Spinner
    │       ├── tabs/               Tabs
    │       └── tooltip/            Tooltip
    └── engine/                     → lihat §4.2
```

### 4.2 Komponen Frontend — Daftar Lengkap

#### Shared Components (digunakan)

| Komponen | File | Fungsi |
|----------|------|--------|
| `Topbar` | `topbar.component.ts` | Jam, badge LIVE SYNC, tombol pause/AC/label/recenter/street |
| `Sidebar` | `sidebar.component.ts` | Panel kanan, menampung tab + pane |
| `SidebarTabs` | `sidebar-tabs.component.ts` | 7 tombol tab |
| `TeamList` | `team-list.component.ts` | Roster agen dengan search |
| `LocationsList` | `locations-list.component.ts` | Agregasi per device/laptop |
| `TasksList` | `tasks-list.component.ts` | Daftar tugas agen |
| `ToolsList` | `tools-list.component.ts` | 5 chip: read · edit · bash · search · other |
| `FeedList` | `feed-list.component.ts` | Timeline event (task/tool/chat/move/sys) |
| `SelectedCard` | `selected-card.component.ts` | Detail agen terpilih + tombol **Kill** |
| `BillingPanel` | `billing-panel.component.ts` | Tagihan per guest & per brew |
| `BillQuote` | `bill-quote.component.ts` | Harga satuan model |
| `FloorStats` | `floor-stats.component.ts` | Ringkasan angka lantai |
| `RealtimeLogs` | `realtime-logs.component.ts` | Terminal log实时 |
| `ToastContainer` | `toast-container.component.ts` | Antrean toast |
| `AccessGate` | `access-gate.component.ts` | Panel autentikasi (401) |
| `MainLayout` | `main-layout.component.ts` | Grid: `canvas-stage` + `app-sidebar` |

#### Zard Components (terpasang, sebagian besar belum dipakai UI utama)

| Komponen | Fungsi |
|----------|--------|
| `Avatar` / `AvatarGroup` | Foto profil + grup |
| `Badge` | Label kecil |
| `Button` | Tombol |
| `Card` | Kartu |
| `Dialog` / `DialogRef` / `DialogService` | Modal |
| `Empty` | State kosong |
| `Input` / `InputGroup` | Form input |
| `Progress` | Progress bar |
| `Separator` | Pemisah visual |
| `Skeleton` | Loading placeholder |
| `Spinner` | Indikator loading |
| `Tabs` | Sistem tab |
| `Tooltip` | Tooltip |

> **Catatan**: UI utama memakai CSS global hasil port dari React (design system 2D), bukan komponen Zard.  
> Alasannya: target migrasi adalah tampilan identik 100% dengan baseline React. Mengganti varian Zard  
> akan menggeser visual. Zard dipakai untuk infrastruktur (`provideZard`, overlay, event manager).

### 4.3 State Management

- **`OfficeStateService`** (signals): `sessions`, `toolCalls`, `logs`, `billing`, `stats`.
- **`UiStateService`** (signals + computed): `selectedId`, `tab`, `paused`, `acMode`, `labelsOn`, `search`, `clock`, `toasts`, `camPreset`.
- **`WebsocketService`**: buka `/ws`, reconnect 2 detik, refetch `GET /api/state` saat onopen.
- **`AuthService`**: `unauthorized()` signal, `?auth=`/`?token=` auto-login, POST `/gateway`.

---

## 5. Engine 3D — 21 Service + 5 Helper

### 5.1 Peta Service

| # | Service | Folder | Tanggung Jawab |
|---|---------|--------|----------------|
| 1 | `EngineContext` | `core/` | Dunia Three.js: scene, camera, renderer, controls, clock, registry lintas-subsistem (agents, seats, waypoints, steams, screens, mezzanine) |
| 2 | `OfficeScene` | root | Composition root: urutan boot (`attach`), animate loop, public API façade |
| 3 | `OfficeEngineService` | root | DI façade untuk Angular: NgZone, signals, lifecycle |
| 4 | `LightingService` | `environment/` | Lampu: ambient, directional (matahari), hemisphere, point (meja) |
| 5 | `GlassWallService` | `environment/` | Dinding kaca transparan (kiri + kanan) |
| 6 | `SunShaftService` | `environment/` | Sun shafts volumetric + partikel debu |
| 7 | `StreetService` | `environment/` | Jalan depan, trotoar, aspal, marking |
| 8 | `WallAcService` | `furniture/` | AC ribbon dinding (auto/on/off) |
| 9 | `MenuBoardService` | `furniture/` | Papan menu 3D di dinding (teks + harga per 1M token) |
| 10 | `SeatItemsService` | `furniture/` | Item per kursi: meja, laptop, monitor, kabel, cangkir |
| 11 | `CoffeeShopService` | `rooms/` | Init environment: lantai, dinding, plafon, bar, mezzanine, 14 kursi, mushola |
| 12 | `MusholaFloorService` | `rooms/` | Saf mushola, slot duduk, tangga geometri |
| 13 | `MusholaService` | `rooms/` | Logika go/leave/musolla: track idle, slot management |
| 14 | `PersonService` | `avatars/` | Buat rig avatar: torso, kepala, lengan, kaki (gender-detect) |
| 15 | `WaypointService` | `navigation/` | Daftar waypoint: pintu, kursi, bar, mushola, jalan |
| 16 | `PathService` | `navigation/` | Bangun jalur: exit, stair descent, mushola entry |
| 17 | `DoorService` | `navigation/` | Animasi pintu geser (kaca) saat agent lewat |
| 18 | `MovementService` | `animation/` | stepAgents + stepPerson: walk cycle, mode poses (work/talk/mushola/idle), coffee order pause |
| 19 | `BeamService` | `animation/` | Beam event: klik/aksi → burst cahaya dari atas |
| 20 | `PillOverlayService` | `animation/` | Bubble info melayang: nama, task, model, live stream, status |
| 21 | `SessionSyncService` | `session/` | Sinkronisasi sesi nyata → engine: syncRealSessions, handleRealToolCall, handleSubagentSpawn |
| — | `TextureFactoryService` | `core/` | Generate texture programatik (plafon, lantai, dinding) |
| — | `FeedService` | `core/` | Feed event: prepend + dedupe + sort |
| — | `EngineSeats` | `core/` | OFFICE_SEATS[14] constant |
| — | `EngineMenuData` | `core/` | PLACEHOLDER_MENU + menu data |
| — | `EnginePainters` | `core/` | Painter util (text, shapes di scene) |

### 5.2 File Helper (non-service, factories murni)

| File | Fungsi |
|------|--------|
| `wall-ac.ts` | Factory AC unit dinding (3 varian: auto/on/off) |
| `street-front.ts` | Factory facade jalan: trotoar, aspal, marking, bangunan depan |
| `indomaret.ts` | Factory Indomaret (bangunan mini di lingkungan) |
| `office-annex.ts` | Factory office annex (bangunan samping) |
| `mushola-mezzanine.ts` | Factory mezzanine + saf mushola + tangga |

### 5.3 Urutan Boot (preservasi identik baseline React)

```
attach(canvas, overlay)
  └─ scene + camera + renderer + controls
initLights()
initOfficeEnvironment()      ← CoffeeShopService
initStreetFront()            ← StreetService + street-front.ts
initWallAc()                 ← WallAcService + wall-ac.ts
initWaypoints()              ← WaypointService
resize()
listeners (resize + pointerdown)
```

### 5.4 Urutan Animate (60fps, di luar NgZone)

```
tween camera (lerpVectors)
controls.update()
if (!paused):
  simMs += dt * 1000 * speed
  movement.stepAgents(dt)
  door.stepDoor(dt)
  beam.step(dt)
  seatItems.step(dt)
  sun.step(dt)
  sun.stepDust(dt)
  ac.updateAc(dt)
pills.updateFloatingPills()
renderer.render(scene, camera)
```

---

## 6. Desain Kantor — Layout 3D

### 6.1 Struktur Bangunan

```
Z positif ( depan )
 ┌─────────────────────────────────────────┐
 │  Jalan + Trotoar + Indomaret            │
 │  ┌──────────┐         ┌──────────┐      │
 │  │ Office   │         │ Office   │      │
 │  │ Annex    │         │ Annex    │      │
 │  └──────────┘         └──────────┘      │
 ├─────────────────────────────────────────┤
 │  Dinding kaca (kiri + kanan)            │
 │  ┌─────────────────────────────────┐    │
 │  │  14 SEAT (coffee shop)          │    │
 │  │  ┌──────┐            ┌──────┐   │    │
 │  │  │ Bar  │            │ Bar  │   │    │
 │  │  │ 3,9  │            │      │   │    │
 │  │  └──────┘            └──────┘   │    │
 │  │                                 │    │
 │  │  ┌─────────────────────────┐    │    │
 │  │  │ Mezzanine Mushola       │    │    │
 │  │  │ (3 slot saf + tangga)   │    │    │
 │  │  └─────────────────────────┘    │    │
 │  └─────────────────────────────────┘    │
 └─────────────────────────────────────────┘
Z negatif ( belakang )
```

### 6.2 14 Seat — Koordinat & Role

| Seat ID | Posisi (x, z) | Rotasi (rad) | Role Default | Bar? | topY |
|---------|---------------|--------------|--------------|------|------|
| seat_1 | (-3.6, 1.6) | π | Lead Architect | — | — |
| seat_2 | (3.4, 1.4) | π | Frontend Specialist | — | — |
| seat_3 | (-8.72, -2.4) | π/2 | Systems Engineer | ✅ | 1.06 |
| seat_4 | (0.2, -3.9) | 0 | UI/UX & Interaction | — | — |
| seat_5 | (3.6, -3.6) | 0 | Core Runtime | — | — |
| seat_6 | (-6.4, 1.8) | π/2 | QA & Verification | — | — |
| seat_7 | (6.2, 1.6) | -π/2 | Security & Sandbox | — | — |
| seat_8 | (-1.2, 4.4) | π | Data Pipelines | — | — |
| seat_9 | (-8.72, 0.4) | π/2 | API Integrator | ✅ | 1.06 |
| seat_10 | (6.4, -3.4) | -π/4 | DevOps & CI/CD | — | — |
| seat_11 | (-5.9, 6.2) | π | Benchmarker | — | — |
| seat_12 | (0.4, 4.6) | π | AI Model Tuning | — | — |
| seat_13 | (-4.4, 6.2) | π | Database Reliability | — | — |
| seat_14 | (-0.6, 0.95) | π | Telemetry & Ops | — | — |

> **Catatan**: `bar: true` berarti agen duduk di bar (counter tinggi), bukan di meja biasa.

### 6.3 Area

| Area | Komponen |
|------|----------|
| **Coffee Shop Main** | 14 seat, lantai kayu, dinding putih, plafon grid |
| **Bar Counter** | 2 buah bar (kiri & kanan belakang), untuk agen yang order kopi |
| **Glass Walls** | 2 dinding kaca transparan (kiri + kanan) |
| **Mushola / Mezzanine** | Di belakang kiri: tangga naik → 3 saf mushola + kiblat dinding |
| **Street Front** | Jalan, trotoar, marking, Indomaret, office annex |
| **AC Ribbon** | Unit AC di dinding (3 varian visual: auto/on/off) |
| **Menu Board** | Papan menu 3D di dinding (nama minuman + harga per 1M token) |
| **Sun Shafts** | Volumetric light shafts dari jendela atas + debu partikel |
| **Monitor Glow** | Layar laptop agen menyala (emissive material) |
| **Coffee Steam** | Uap naik dari cangkir di tiap meja |

### 6.4 Furniture per Seat

Tiap seat memiliki:
- Meja (rectangular box)
- Laptop (monitor + keyboard)
- Cangkir (cylinder, steam particle)
- Kursi (backrest + seat)
- Kabel (random curve dari laptop ke meja)

---

## 7. Pattern Agen — Cara Bekerja & Ngopi

### 7.1 Mode Agen

| Mode | Deskripsi | Pose |
|------|-----------|------|
| `work` | Duduk di seat, bekerja | Lengan di atas meja, kepala sedikit menengadah |
| `talk` | Berbicara dengan agen sebelah | Kepala kiri-kanan, lengan bergerak sedikit |
| `to` | Berjalan menuju tujuan | Walk cycle (ayun kaki + lengan + badan naik turun) |
| `back` | Kembali ke seat | Walk cycle |
| `leaving` | Keluar kantor | Menuju pintu keluar |
| `break_play` | Istirahat / main | — |
| `break_out` | Istirahat luar | Menuju exit → di-remove dari scene |
| `idle` | Diam di seat | Pose netral |
| `mushola` | Shalat di mezzanine | Duduk bersila, rotasi hadap kiblat |

### 7.2 Siklus Hidup Agen (Real Session → 3D)

```
1. Pi CLI kirim session.register → server catat SQLite + broadcast WS
   └─ Frontend terima session_registered → OfficeStateService tambah sinyal
      └─ SessionSyncService.syncRealSessions() → cari seat kosong → buat PersonRig
         └─ AgentData dimasukkan ke ctx.agents dengan mode 'work'

2. Heartbeat setiap ~30 detik → session_updated (tanpa perubahan visual)

3. Tool call → tool_called → tool_completed:
   └─ FeedList + ToolsList update
   └─ BeamService.burst() → cahaya dari atas agen
   └─ LiveBar (jika ada llm_stream) update

4. Task update → task_updated:
   └─ Bubble (pill) update teks

5. Session end / kill → session_ended:
   └─ Agent di-remove dari scene, bubble hilang
```

### 7.3 Pattern Ngopi (Coffee Order)

Agen yang duduk di **bar** (seat_3, seat_9) memiliki siklus khusus:

```
Agent di bar → panggil orderUntil = simMs + 1800..3200 ms
  └─ task berubah jadi "Loading <model>…"
  └─ Feed event: "Barista Counter — <nama> berhenti sebentar"
  └─ Toast: "☕ <nama> — <model>"
  └─ Tunggu sampai orderUntil
     └─ task kembali ke task asli
     └─ Feed event: "Barista Counter — <nama> siap lanjut ke seat"
     └─ Toast: "🥤 <nama> lanjut ke seat"
```

> Catatan: `hasOrderedCoffee` di-`set true` sekali per sesi. Agen tidak order lagi sampai reset.

### 7.4 Pattern Mushola

```
Agent mode → 'mushola'
  └─ PathService bangun jalur: seat → tangga → saf
  └─ MusholaService.trackMusholaIdle(): cek apakah ada saf kosong
     └─ Jika ada: assign ke slot, animasi naik tangga
     └─ Jika tidak: tunggu (queue) di dasar tangga
  └─ Di saf: duduk bersila, hadap kiblat (rotasi Y = π)
  └─ Saat task update / leaving → turun tangga → kembali ke seat
```

### 7.5 Pattern Percakapan (Talk)

```
Dua agen berdekatan → mode 'talk'
  └─ talkPair: {x, y} (dua ID agen)
  └─ Head: rotasi Y melingkar (sinus)
  └─ Lengan: ayun kecil (syntetic gesturing)
  └─ Durasi: acak, kemudian kembali ke 'work'
```

### 7.6 Gender Detection (Avatar)

`PersonService.createPersonMesh()` menerima `AgentData.av` (emoji avatar) dan mendeteksi gender:
- Jenis kelamin perempuan: avatar beruang bagian tubuh lebih ramping, proporsi sedikit berbeda.
- Jenis kelamin laki-laki: proporsi standar.
- Meskipun visualnya区别 subtle, ini dijaga agar konsisten dengan data asli.

### 7.7 Live Stream (LLM)

- `llm_stream_updated` dari WS → disimpan di `AgentData.llmStream`.
- `PillOverlayService` baca stream → tampilkan di bubble:
  - `thinking`: badge "berpikir"
  - `response`: teks respons
  - `tool`: nama tool yang sedang dijalankan
  - `status`: status singkat
- `LiveBar` di top bar menampilkan stream terbaru dari agen terpilih.

---

## 8. Frontend — Komponen, Tabs, & Kontrol

### 8.1 7 Tab Sidebar

| Tab | Ikon | Komponen | Fungsi |
|-----|------|----------|--------|
| Team | 👥 | `TeamList` | Roster semua agen dengan search |
| Locs | 📍 | `LocationsList` | Agregasi per device / laptop |
| Tasks | 📋 | `TasksList` | Daftar tugas agen |
| Tools | 🔧 | `ToolsList` | 5 chip: read · edit · bash · search · other |
| Feed | 📡 | `FeedList` | Timeline event (task/tool/chat/move/sys) |
| Logs | 📝 | `RealtimeLogs` | Terminal log realtime (maks 12 baris visible) |
| Bill | ☕ | `BillingPanel` | Tagihan per guest & per brew |

### 8.2 Kontrol Topbar

| Tombol | Fungsi |
|--------|--------|
| ⏸ | Pause / Resume animasi |
| ❄ | Siklus AC: `auto → on → off → auto` |
| 🏷 | Toggle label di bawah agen (nama + role) |
| ⌖ | Recenter kamera ke preset `over` |
| 🛣 | Street view (preset `street`) |
| 🔍 | Focus ke agen terpilih (fly-to) |
| Jam | Simulasi jam (0–24h, di-accelerate) |

### 8.3 Overlay & Pills

- `PillOverlayComponent` membuat elemen `#pill-<id>` untuk setiap agen.
- Posisi dihitung dari `PersonRig.head` → proyeksi ke screen space.
- Konten: nama, task, model, status chip, live stream indicator.
- Seleksi agen: klik pill → `selectAgent()` → kamera fly-to + `SelectedCard` update.

---

## 9. Desain Visual — Coffee Shop Identity

### 9.1 Tema

- **Nama ruang**: ORCA24 Coworking — "Pi Dev CLI Office"
- **Konsep**: coffee shop 3-ruko (3 shop units) dengan area mushola di mezzanine.
- **Warna**: dark navy (`#030817`) background, fog (`#08111f`), accent biru langit (`#38bdf8`), ungu (`#a855f7` untuk sub-agent).
- **Font**: Plus Jakarta Sans (UI) + JetBrains Mono (terminal/log).

### 9.2 Elemen Visual Kunci

| Elemen | Teknis |
|--------|--------|
| Dinding kaca | Transparan + reflectivity (MeshPhysicalMaterial) |
| Sun shafts | Cylinder geometry + transparent + volumetric fake (alpha gradient) |
| Debu partikel | Points geometry, berjalan mengikuti `simMs` |
| Monitor glow | Emissive MeshBasicMaterial, brightness di-`step` oleh `steams` registry |
| Coffee steam | Points geometry, naik dari cangkir (registry `steams`) |
| AC ribbon | Box geometry + 3 material varian (auto: biru, on: cyan, off: abu) |
| Menu board | Text geometry + CanvasTexture (harga per 1M token) |
| Mushola | Saf geometry (3 slot) + kiblat marker + tangga helix |
| Street | Plane + line marking + box building (Indomaret + Office Annex) |

---

## 10. Cara Kerja — End-to-End

### 10.1 Startup

```bash
npm run dev
  ├─ node server/src/index.js → :4317 (hub)
  │   ├─ OfficeDB(office.db) init schema + backfill
  │   ├─ reapDeadSessions() + reapAbandonedSessions(3600_000)
  │   ├─ HTTP server: /api/* + SPA static
  │   └─ OfficeWebSocketHub(/ws)
  └─ npx ng serve --host 0.0.0.0 --port 4200 --hmr (dashboard/)
      ├─ proxy /api, /ws, /gateway → localhost:4317
      └─ Angular dev server (HMR)
```

### 10.2 Browser Load

```
1. GET http://127.0.0.1:4200/ → index.html
2. Angular bootstrap → AppComponent
   ├─ AuthService.unauthorized()? → AccessGate
   └─ else:
      ├─ Topbar (jam + kontrol)
      ├─ MainLayout
      │   ├─ CanvasStage → attach canvas + overlay
      │   │   └─ OfficeScene.attach()
      │   │       ├─ EngineContext.attach() → scene/camera/renderer/controls
      │   │       ├─ initLights()
      │   │       ├─ initOfficeEnvironment() → 14 seat + bar + mezzanine + lantai
      │   │       ├─ initStreetFront() → jalan + Indomaret + annex
      │   │       ├─ initWallAc() → 3 unit AC
      │   │       ├─ initWaypoints() → register semua waypoint
      │   │       └─ resize()
      │   └─ Sidebar (7 tab)
      └─ ToastContainer
3. CanvasStage.effect()
   └─ GET /api/state (via proxy → :4317) → OfficeStateService.setFullState()
   └─ WebSocketService.connect('/ws')
       └─ onopen → refetch /api/state
       └─ onmessage → dispatch ke OfficeStateService
           └─ session_registered → syncRealSessions() → PersonService.createPersonMesh()
               → agent muncul di scene + bubble di overlay
```

### 10.3 Animate Loop (60fps)

```
requestAnimationFrame
  ├─ tween camera (jika ada camPreset/selectAgent)
  ├─ controls.update()
  ├─ if (!paused):
  │   ├─ simMs += dt * 1000 * speed
  │   ├─ movement.stepAgents(dt) → walk cycle, talk sway, mushola sit
  │   ├─ door.stepDoor(dt) → animasi pintu kaca
  │   ├─ beam.step(dt) → burst decay
  │   ├─ seatItems.step(dt) → monitor glow flicker
  │   ├─ sun.step(dt) → sun shaft pulse
  │   ├─ sun.stepDust(dt) → debu partikel
  │   └─ ac.updateAc(dt) → AC material + particle
  ├─ pills.updateFloatingPills() → overlay bubble position
  └─ renderer.render(scene, camera)
```

---

## 11. Total — Ringkasan Angka

| Kategori | Jumlah |
|----------|--------|
| **Backend** | |
| File server | 7 |
| Tabel database | 4 |
| Indexes | 6 (1 partial unique) |
| REST endpoints | 7 |
| WS event types (keluar) | 9 |
| **Frontend** | |
| File TypeScript | 127 |
| Komponen Angular | 30 |
| Services (Angular DI) | 27 (6 core + 21 engine) |
| Zard UI komponen | 14 |
| Tab sidebar | 7 |
| Tool chips | 5 |
| **Engine 3D** | |
| Service engine | 21 |
| Helper file (factory) | 5 |
| Seat agen | 14 |
| Mode agen | 9 |
| Preset kamera | 4 |
| Area bangunan | 5 (main, bar kiri, bar kanan, mushola+mezzanine, street) |
| WS packet types | 9 |

---

## 12. Deep Index — File per Fungsi

### Backend

| File | Fungsi |
|------|--------|
| `server/src/index.js` | createOfficeServer + reap timer + listen |
| `server/src/server.js` | HTTP server, REST API, SPA static serving |
| `server/src/ws.js` | WebSocket hub, broadcast, ping/pong keepalive |
| `server/src/db.js` | OfficeDB: schema, upsert, queries, billing, backfill, reap |
| `server/src/pricing.js` | Tabel harga lokal + ranking cost_source |
| `server/src/pricing-portkey.js` | Quote harga via Portkey API |
| `server/src/pricing-remote.js` | Feed harga bulk (pull + cache + status) |

### Frontend — Core

| File | Fungsi |
|------|--------|
| `dashboard/src/main.ts` | bootstrapApplication(AppComponent, appConfig) |
| `dashboard/src/index.html` | Entry HTML, font CDN |
| `dashboard/src/styles.css` | Design system 2D (1699 baris) + Tailwind v4 theme |
| `dashboard/src/app/app.component.ts` | Root: gate AccessGate vs layout (topbar + main-layout + toast) |
| `dashboard/src/app/app.config.ts` | provideZoneChangeDetection + provideHttpClient + provideZard |
| `dashboard/src/app/core/models/types.ts` | Semua tipe: AgentData, Session, ToolCall, LogEntry, BillingSummary, SeatConfig, OFFICE_SEATS |
| `dashboard/src/app/core/services/websocket.service.ts` | WS client: open, reconnect, dispatch ke OfficeState |
| `dashboard/src/app/core/services/office-state.service.ts` | Sinyal state: sessions, toolCalls, logs, billing, stats |
| `dashboard/src/app/core/services/api.service.ts` | fetch REST dengan credentials |
| `dashboard/src/app/core/services/auth.service.ts` | Auth: ?auth=/?token=, cookie, 401 signal |
| `dashboard/src/app/core/services/ui-state.service.ts` | Sinyal UI: selected, tab, paused, acMode, labels, search, toast, cam |
| `dashboard/src/app/core/services/toast.service.ts` | Antrean toast (#toasts) |
| `dashboard/src/app/core/utils/endpoints.ts` | URL builder (selalu relatif) |
| `dashboard/src/app/core/utils/coffee-menu.ts` | Nama minuman per model LLM + format USD/token |
| `dashboard/src/app/core/utils/agent-identity.ts` | Chip identitas device/Orca |

### Frontend — Stage

| File | Fungsi |
|------|--------|
| `dashboard/src/app/stage/canvas-stage.component.ts` | Kanvas #shop + #overlay, pasang OfficeScene, effect() sync state |
| `dashboard/src/app/stage/pill-overlay.component.ts` | Bubble #pill-<id>: nama, task, model, live stream, status |

### Frontend — Shared Components

| File | Fungsi |
|------|--------|
| `dashboard/src/app/shared/topbar/topbar.component.ts` | Kontrol + jam + badge LIVE SYNC |
| `dashboard/src/app/shared/sidebar/sidebar.component.ts` | Panel kanan |
| `dashboard/src/app/shared/sidebar/sidebar-tabs.component.ts` | 7 tab |
| `dashboard/src/app/shared/sidebar/team-list.component.ts` | Roster tim |
| `dashboard/src/app/shared/sidebar/locations-list.component.ts` | Per device |
| `dashboard/src/app/shared/sidebar/tasks-list.component.ts` | Daftar tugas |
| `dashboard/src/app/shared/sidebar/tools-list.component.ts` | 5 chip tool |
| `dashboard/src/app/shared/sidebar/feed-list.component.ts` | Event feed |
| `dashboard/src/app/shared/sidebar/selected-card.component.ts` | Detail + Kill |
| `dashboard/src/app/shared/sidebar/billing-panel.component.ts` | Tagihan |
| `dashboard/src/app/shared/sidebar/bill-quote.component.ts` | Quote harga |
| `dashboard/src/app/shared/sidebar/floor-stats.component.ts` | Statistik lantai |
| `dashboard/src/app/shared/logs/realtime-logs.component.ts` | Terminal log |
| `dashboard/src/app/shared/toast/toast-container.component.ts` | Antrean toast |
| `dashboard/src/app/shared/auth/access-gate.component.ts` | Panel 401 |
| `dashboard/src/app/shared/layout/main-layout.component.ts` | Grid layout |
| `dashboard/src/app/shared/components/avatar/avatar.component.ts` | Avatar |
| `dashboard/src/app/shared/components/avatar/avatar-group.component.ts` | AvatarGroup |
| `dashboard/src/app/shared/components/badge/badge.component.ts` | Badge |
| `dashboard/src/app/shared/components/button/button.component.ts` | Button |
| `dashboard/src/app/shared/components/card/card.component.ts` | Card |
| `dashboard/src/app/shared/components/dialog/dialog.component.ts` | Dialog |
| `dashboard/src/app/shared/components/dialog/dialog-ref.ts` | DialogRef |
| `dashboard/src/app/shared/components/dialog/dialog.service.ts` | DialogService |
| `dashboard/src/app/shared/components/empty/empty.component.ts` | Empty state |
| `dashboard/src/app/shared/components/input/input.component.ts` | Input |
| `dashboard/src/app/shared/components/input-group/input-group.component.ts` | InputGroup |
| `dashboard/src/app/shared/components/progress/progress.component.ts` | Progress |
| `dashboard/src/app/shared/components/separator/separator.component.ts` | Separator |
| `dashboard/src/app/shared/components/skeleton/skeleton.component.ts` | Skeleton |
| `dashboard/src/app/shared/components/spinner/spinner.component.ts` | Spinner |
| `dashboard/src/app/shared/components/tabs/tabs.component.ts` | Tabs |
| `dashboard/src/app/shared/components/tooltip/tooltip.component.ts` | Tooltip |

### Engine 3D — Services

| File | Fungsi |
|------|--------|
| `engine/office-scene.ts` | Composition root: boot order, animate loop, public API |
| `engine/office-engine.service.ts` | DI façade: NgZone, signals, lifecycle Angular |
| `engine/core/engine-context.ts` | Dunia Three.js: scene, camera, renderer, controls, clock, registries |
| `engine/core/engine-seats.ts` | OFFICE_SEATS[14] constant |
| `engine/core/engine-menu-data.ts` | PLACEHOLDER_MENU, menu board data |
| `engine/core/engine-painters.ts` | Painter util (teks, shapes di scene) |
| `engine/core/texture-factory.service.ts` | Generate texture programatik (plafon, lantai, dinding) |
| `engine/core/feed.service.ts` | Feed event: prepend + dedupe + sort |
| `engine/environment/lighting.service.ts` | Lampu: ambient, directional, hemisphere, point |
| `engine/environment/glass-walls.service.ts` | Dinding kaca transparan (kiri + kanan) |
| `engine/environment/sun-shafts.service.ts` | Sun shafts volumetric + partikel debu |
| `engine/environment/street.service.ts` | Jalan depan, trotoar, marking |
| `engine/furniture/wall-ac.service.ts` | AC ribbon dinding (auto/on/off) |
| `engine/furniture/menu-board.service.ts` | Papan menu 3D (nama minuman + harga) |
| `engine/furniture/seat-items.service.ts` | Item per kursi: meja, laptop, cangkir, kabel |
| `engine/rooms/coffee-shop.service.ts` | Init environment: lantai, dinding, plafon, bar, mezzanine, 14 kursi |
| `engine/rooms/mushola-floor.service.ts` | Saf mushola, slot duduk, tangga geometri |
| `engine/rooms/mushola.service.ts` | Logika go/leave/musolla: track idle, slot management |
| `engine/avatars/person.service.ts` | Buat rig avatar: torso, kepala, lengan, kaki (gender-detect) |
| `engine/navigation/waypoints.service.ts` | Daftar waypoint: pintu, kursi, bar, mushola, jalan |
| `engine/navigation/paths.service.ts` | Bangun jalur: exit, stair descent, mushola entry |
| `engine/navigation/door.service.ts` | Animasi pintu geser (kaca) saat agent lewat |
| `engine/animation/movement.service.ts` | stepAgents + stepPerson: walk cycle, mode poses, coffee order pause |
| `engine/animation/beam.service.ts` | Beam event: klik/aksi → burst cahaya |
| `engine/animation/pill-overlay.service.ts` | Bubble info melayang per agen |
| `engine/session/session-sync.service.ts` | Sinkronisasi sesi nyata → engine |

### Engine 3D — Helper Files (Factories)

| File | Fungsi |
|------|--------|
| `engine/wall-ac.ts` | Factory AC unit dinding (3 varian visual) |
| `engine/street-front.ts` | Factory facade jalan: trotoar, aspal, marking |
| `engine/indomaret.ts` | Factory Indomaret (bangunan mini) |
| `engine/office-annex.ts` | Factory office annex (bangunan samping) |
| `engine/mushola-mezzanine.ts` | Factory mezzanine + saf mushola + tangga |

### Extension (Pi CLI)

| File | Fungsi |
|------|--------|
| `extension/identity.ts` | Identitas sesi: machine_id, orca_name, client_kind |
| `extension/redact.ts` | Redaksi rahasia sebelum kirim ke hub |
| `extension/indonesian-names.ts` | Daftar nama Indonesia untuk persona avatar |
| `extension/index.ts` | Entry extension: POST /api/event |

### Tools

| File | Fungsi |
|------|--------|
| `tools/run-dev.js` | Jalankan hub :4317 + ng serve :4200 (proses group) |
| `tools/simulate-pi-session.js` | Simulasi sesi Pi untuk demo |
| `tools/test-e2e.js` | E2E test: WS + register + tool + billing |
| `tools/test-global-extension.js` | Test extension: redaksi + identitas |
| `tools/build-global-extension.js` | Bundle extension → satu file global |
| `tools/backfill-usage.js` | Backfill usage_events dari log JSONL Pi |
| `tools/decompose-engine.mjs` | Codemod: monolith engine → 21 service |
| `tools/verify-engine-parity.mjs` | Audit statis: 0 statement engine hilang |
| `tools/parity-visual.mjs` | Diff pixel vs baseline React (frame-gated) |

---

## 13. Catatan Arsitektur

- **Source of truth frontend**: `~/PROJECTS/office/dashboard/` (Angular 19).
- **Runtime copy lama** (`~/.pi/office/`): frontend React + Angular WIP sudah dihapus.
- **React baseline**: masih ada di git history (commit sebelum `a356771`), tidak di disk.
- **sample.html**: demo CDN mandiri — dihapus dari repo (komit `61cff96`); URL `/sample.html` di `:4317` sekarang resolves ke Angular via SPA fallback.
- **Zard UI**: 14 komponen terpasang; UI utama tetap CSS global hasil port dari React untuk memastikan identik 100%.
- **Engine decomposition**: 21 service, generator verbatim (`tools/decompose-engine.mjs`), tanpa `forwardRef` (graph acyclic).
- **`@ts-nocheck`**: 0 di seluruh proyek.
- **`noPropertyAccessFromIndexSignature: false`**: engine legitimately akses `waypoints.door` pada `Record<string,T>`.

---

*Dokumen ini dibuat dari pemeriksaan mendalam seluruh basis kode pada commit `61cff96`.*
