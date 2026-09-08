# GRAPH PROMPT — Eksekusi Modular: ~/PROJECTS/office → Angular + Zard UI
# Target: 3D engine decomposed penuh (rooms/furniture/avatars/environment/navigation) + komponen global modular
# Referensi analisa: docs/REFACTOR_CHAIN_ANGULAR.md · docs/CODE-REVIEW.md

---

## ARSITEKTUR TARGET (modular global)

```
office (repo)/
├── dashboard/                              # Angular 19 standalone (menggantikan React)
│   ├── src/
│   │   ├── main.ts · app.config.ts · app.routes.ts
│   │   ├── app.component.ts                # shell: auth gate → layout
│   │   ├── core/
│   │   │   ├── models/types.ts             # SEMUA kontrak (port types.ts)
│   │   │   ├── services/
│   │   │   │   ├── endpoints.service.ts    # port lib/office-endpoints.ts
│   │   │   │   ├── auth.service.ts         # token signal + gate + ?auth=
│   │   │   │   ├── api.service.ts          # state/billing/kill/quote/feed
│   │   │   │   ├── websocket.service.ts    # port useOfficeSocket.ts
│   │   │   │   ├── office-state.service.ts # signals + reducer WS
│   │   │   │   └── toast.service.ts        # global toast
│   │   │   └── utils/coffee-menu.ts        # port lib/coffee-menu.ts
│   │   ├── shared/                         # 🔷 KOMPONEN GLOBAL MODULAR (Zard UI)
│   │   │   ├── auth/access-gate.component.ts
│   │   │   ├── layout/main-layout.component.ts
│   │   │   ├── topbar/{topbar,clock,connection-badge}.component.ts
│   │   │   ├── sidebar/{sidebar,sidebar-tabs,floor-stats,selected-card,search-bar}.component.ts
│   │   │   ├── team/{agent-card,team-list,locations-list,tasks-list}.component.ts
│   │   │   ├── feed/{tools-list,feed-list}.component.ts
│   │   │   ├── logs/realtime-logs.component.ts
│   │   │   └── billing/{billing-panel,bill-total,menu-board,bill-line,quote-button}.component.ts
│   │   ├── stage/
│   │   │   ├── canvas-stage.component.ts   # ngAfterViewInit engine bootstrap
│   │   │   ├── pill-overlay.component.ts   # bubble DOM (projection 3D→2D)
│   │   │   └── live-bar.component.ts
│   │   └── engine/                         # 🔮 3D ENGINE — DECOMPOSED (inti refactor)
│   │       ├── office-engine.service.ts    # orchestrator tipis (komposisi modul)
│   │       ├── types.ts                    # SeatConfig, MenuBoardRow, OFFICE_SEATS
│   │       ├── core/
│   │       │   ├── three-scene.service.ts  # renderer/controls/RAF/resize
│   │       │   ├── texture-factory.service.ts  # canvas tex: oak, sign, menu board
│   │       │   └── clock.service.ts
│   │       ├── rooms/                      # 🏠
│   │       │   ├── coffee-shop.room.ts     # 3× ruko 20×15, kaca kiri+kanan
│   │       │   ├── office-annex.room.ts    # open-plan + meeting + server + break
│   │       │   └── mushola-mezzanine.room.ts  # saf lantai 2 + tangga
│   │       ├── furniture/                  # 🪑
│   │       │   ├── seat-items.factory.ts   # per-seat monitor/steam/table/bar
│   │       │   └── builders/ (counter, table, stool, chair, meeting-table, rack, rug, menu-board)
│   │       ├── avatars/                    # 🧍
│   │       │   ├── person.builder.ts       # head/torso/arms/legs + face canvas + gender
│   │       │   └── avatar-state.ts         # mode & transisi
│   │       ├── environment/                # 🌍
│   │       │   ├── lighting.service.ts
│   │       │   ├── sky-dust.service.ts     # langit sabana + shafts + dust
│   │       │   ├── street-front.ts         # port existing
│   │       │   └── indomaret.ts            # port existing
│   │       ├── navigation/                 # 🧭
│   │       │   ├── waypoints.service.ts
│   │       │   └── path.builder.ts         # entrance/exit/mushola/buildPath
│   │       └── animation/                  # 🎞️
│   │           ├── movement.service.ts     # stepPerson + walk cycle
│   │           ├── door.service.ts         # pintu geser
│   │           ├── camera.service.ts       # presets + fly-to
│   │           ├── interaction.service.ts  # say/beam/burst
│   │           └── projection/             # 📐
│   │               └── pill-positioner.service.ts  # 3D→2D utk overlay
│   └── (angular.json · tailwind · styles.css)
├── server/src/                 # TypeScript hardening + auth + retensi (step 16)
├── cloudflare/worker.ts        # reaper DO + constant-time compare
├── extension/                  # tetap TS modular (bundle global)
└── docs/
    ├── REFACTOR_CHAIN_ANGULAR.md
    └── GRAPH_PROMPT_MODULAR.md   # ← file ini
```

---

## NODE EKSEKUSI

### NODE A — Bootstrap & Fondasi Angular
**goal:** Proyek Angular 19 + Zard UI + tema ORCA24 gelap + kerangka folder.
**deliverables:**
- `office-dashboard-ng/` (ng new standalone), zard init + add (card, badge, button, input, tabs, progress, avatar, tooltip, separator, skeleton, empty, spinner, sonner, dialog)
- `styles.css` = port `index.css` theme tokens (dark `#0b0d12/#131822/#20293c/…`) via Tailwind v4 `@theme`
- index.html: Google Fonts Plus Jakarta Sans + JetBrains Mono
- Folder skeleton `core/ shared/ stage/ engine/`
**deps:** —

### NODE B — Kontrak & State Services
**goal:** Semua type + service data, tanpa UI.
**deliverables:** models/types.ts (full port types.ts incl. identity fields) · endpoints/auth/api/websocket/office-state/toast services · coffee-menu utils.
**accept:** build hijau; reducer WS = 1:1 dengan useOfficeSocket.
**deps:** [A]

### NODE C — Shell + Auth Gate
**goal:** Gate → layout utama.
**deliverables:** app.routes, main-layout (topbar + grid stage/sidebar), access-gate (Zard), app.component wiring (unauthorized → gate).
**accept:** token salah → 401 inline; benar → layout.
**deps:** [B]

### NODE D — Topbar & Widget Kontrol
**goal:** Kontrol atas.
**deliverables:** topbar (brand, live badge, clock 1s, Pause/Recenter/Street, AC cycle, popout orca) + output events.
**deps:** [C]

### NODE E — Sidebar Framework (7 tabs + search + stats)
**goal:** Shell sidebar.
**deliverables:** sidebar tabs (Team/Locs/Tasks/Tools/Feed/Logs/Bill), floor-stats (4), selected-card, search-bar, pane `@switch` + empty states.
**deps:** [D]

### NODE F — Panel Roster: Team + Locs + Tasks
**goal:** 3 panel agent.
**deliverables:** team-list + agent-card (status dot, PI DEV/1F chip, session id, progress, kill), locations-list (group machine/orca, header + idle stat), tasks-list (sub checklist).
**deps:** [E]

### NODE G — Panel Stream: Tools + Feed + Logs
**goal:** 3 panel stream realtime.
**deliverables:** tools-list, feed-list (kind chips), realtime-logs (auto-scroll, level badge, id-ID time).
**deps:** [E]

### NODE H — Panel Billing
**goal:** Coffee-shop bill.
**deliverables:** billing-panel + bill-total + menu-board (assignDrinks, hot top3) + bill-line (tone: free/paid/unknown) + quote-button (Portkey), user → focus.
**deps:** [E]

### ── PARALLEL AMAN: [F,G,H] setelah E ──

### NODE I — Engine Core (scene/tekstur/clock)
**goal:** Fondasi render 3D.
**deliverables:** three-scene.service (renderer+controls+RAF+resize), texture-factory (createCanvasTex/createSignTex/createOakTex), clock.service; engine/types.ts (OFFICE_SEATS dll).
**deps:** [A]

### NODE J — Rooms: Coffee Shop + Annex + Mezzanine
**goal:** 3 ruko lengkap (tanpa agent).
**deliverables:** coffee-shop.room (2 dinding kaca full, bar, meja), office-annex.room (open-plan, meeting, server, break), mushola-mezzanine.room (saf + tangga + waypoint).
**accept:** visual 3 ruko + glass gaps 3 m identik React.
**deps:** [I]

### NODE K — Environment & Lighting
**goal:** Dunia luar + cahaya.
**deliverables:** lighting.service, sky-dust.service (sabana malam + sun shafts + dust + pools), street-front, indomaret (port existing).
**deps:** [J]

### NODE L — Furniture System
**goal:** Builder furniture reusable.
**deliverables:** seat-items.factory (port addSeatItems/removeSeatItems) + builders: counter/table/stool/chair/meeting-table/rack/rug/menu-board + ac-unit (wall-ac ribbons).
**deps:** [K]

### NODE M — Avatar System
**goal:** Person builder modular + state.
**deliverables:** person.builder (parts + face canvas nama/emoji + inferAgentGender), avatar-state (mode set).
**deps:** [L]

### NODE N — Navigation & Movement
**goal:** Agent jalan & pintu.
**deliverables:** waypoints.service (initWaypoints/aisleFor), path.builder (entrance/exit/mushola/buildPath), movement.service (stepPerson), door.service (DOOR_* constants).
**deps:** [M]

### NODE O — Camera & Interaction
**goal:** Kontrol kamera + efek.
**deliverables:** camera.service (presets over/ground/play/street + selectAgent fly), interaction.service (say/beam/burst), idle-mushola.service (naik saf saat idle).
**deps:** [N]

### NODE P — OfficeEngine Orchestrator + Sync WS
**goal:** Rakit semua modul + data nyata.
**deliverables:** office-engine.service (agents/events signals, setMenuBoard/setAcMode/syncRealSessions/handleRealToolCall/startExit/pause/kill), pill-positioner.service (3D→2D).
**deps:** [O]

### ── GABUNGAN: [P] menunggu [F,G,H] (UI) & [O] (engine) ──

### NODE Q — Stage Component Angular + Overlay
**goal:** Canvas + bubble DOM + live bar.
**deliverables:** canvas-stage.component (engine bootstrap/destroy/resize), pill-overlay.component (posisi pill dari projection), live-bar.component.
**deps:** [P]

### NODE R — Cutover React → Angular
**goal:** Dashboard jadi Angular, build terpadu.
**deliverables:** pindah `office-dashboard-ng` → `dashboard`; hapus .tsx/vite react; root scripts `dashboard/build/start-dev`; `start-dev.sh` OFFICE_DIR auto-detect; symlink `~/.pi/office` → repo; SPA fallback tetap.
**deps:** [Q]

### NODE S — Backend & Worker Hardening
**goal:** Bawa fix code-review.
**deliverables:** server auth (Bearer 401 saat non-loopback) + default 127.0.0.1 · db.js migrasi indeks dedupe pasca-kolom + retensi logs 7d/tool_calls 24h + body ≤64 KB · worker: reaper setAlarm + constant-time compare + schemaReady per-DO · npm workspaces + bersih dependensi.
**deps:** [R]

### NODE T — E2E Acceptance
**goal:** Buktikan semuanya.
**accept:** 17 kriteria di REFACTOR_CHAIN_ANGULAR.md step 17 lulus.
**deps:** [S]

---

## ORDER & PARALLEL

```
A → B → C → D → E ─┬─ F ─┐
                   ├─ G ─┼── Q(butuh F/G/H + P) → R → S → T
                   ├─ H ─┘
I → J → K → L → M → N → O → P ─┘
```
- **Parallel-safe:** `[F,G,H]` (3 panel UI, setelah E) · `[K]` bisa paralel `[L]`? tidak — L butuh material/env dari K. Jaga dependensi.
- **Setelah tiap node:** build hijau + commit + review bareng Rizoa.

## ATURAN
1. **Jangan ubah angka/geometri** — modularisasi = pindah kode ke modul dengan perilaku identik; verifikasi visual tiap node.
2. **Zard UI wajib** untuk primitif UI; tidak ada CSS hand-rolled baru untuk tombol/kartu/badge.
3. **Signal-first** — tidak ada BehaviorSubject manual baru.
4. **Nol `any`** di kode baru; konversi file lama tetap diusahakan bertipe.
5. **Satu sumber kebenaran** — repo; `~/.pi/office` menjadi symlink.
