# CHAIN PROMPT — Refactor Total: ~/PROJECTS/office → Angular 19 + Zard UI

> **Repo:** `/home/rizoa/PROJECTS/office` (sumber kebenaran — BUKAN `~/.pi/office` yang cuma deployed copy)
> **Target stack:** Angular 19 standalone + Zard UI (shadcn-style untuk Angular) + Tailwind v4 + NgRx Signals + Three.js
> **Eksekusi:** Sequential, satu langkah per sesi kerja. STOP setelah tiap langkah untuk review.

---

## KONTEKS CODEBASE (hasil analisa menyeluruh)

| Lapisan | Stack sekarang | File kunci |
|---|---|---|
| **Backend lokal** | Node ESM + `node:sqlite` + `ws` | `server/src/{index,server,ws,db,pricing*,}.js` |
| **Backend cloud** | Cloudflare Worker + Durable Object + Turso (libSQL) | `cloudflare/worker.ts` (717 L) |
| **Dashboard** | React 19 + Vite + Three.js | `dashboard/src/**` (12.294 LOC total repo) |
| **Extension Pi** | TypeScript modular → di-bundle ke global | `extension/*.ts` + `extensions-global/pi-office.ts` |
| **3D Engine** | Satu kelas monolitik ~3.017 L + helper | `engine/officeEngine.ts` + `{wall-ac,mushola-mezzanine,indomaret,street-front,office-annex}.ts` |
| **Identity multi-mesin** | project/machine/orca/client_kind | `types.ts`, `lib/agent-identity.ts`, `db.js` kolom `machine_*` |
| **Auth gate** | Inline token (hub non-loopback) + `?auth=` quick-login | `components/AccessGate.tsx`, `hooks/useOfficeSocket.ts` |

**Fitur yang WAJIB dipertahankan 1:1 saat refactor:**
1. Kantor 3D **3 ruko**: coffee-shop (kaca kiri+kanan), mushola-mezzanine, office-annex; Indomaret + street-front di luar.
2. Persona Indonesia 100 (80F/20M) + deteksi sub-agent → tim baru.
3. Bubble agent realtime + tool-call feed + LLM stream + logs + billing coffee-shop.
4. Tab sidebar: **Team · 📍 Locs · Tasks · Tools · Feed · Logs · Bill** (Locs = grup per device/laptop).
5. Auto-login `?auth=`/`?token=` lalu dibersihkan dari address bar.
6. AccessGate inline saat hub non-loopback menjawab 401.
7. Endpoint resolver `office-endpoints.ts`: dev `:5173` → proxy `:4317`; same-origin relatif; loopback detection.
8. Kill aman (validasi `/proc/<pid>` cmdline) + reaper sesi mati.
9. Dua mode deploy: lokal Node vs cloud Worker+DO+Turso.

**Perbaikan yang ikut dibawa refactor (temuan docs/CODE-REVIEW.md):**
- H1: hub lokal default bind `127.0.0.1`; tolak bind non-loopback tanpa `OFFICE_TOKEN`; implement cek token lokal (docs menjanjikan tapi kode tidak ada).
- H1: boot crash DB lama — pindahkan `CREATE UNIQUE INDEX idx_usage_dedupe` **setelah** migrasi kolom `dedupe_key`.
- H1: repo ≠ runtime — `start-dev.sh` hardcode `~/.pi/office`; jadikan symlink atau `OFFICE_DIR` auto-detect dari repo.
- M: npm workspaces (`server`,`dashboard`) + hapus dependensi asing (`lucide-angular` 63 MB) + satu lockfile.
- M: hot path billing (agregat/debounce broadcast), retensi logs/tool_calls, batas body POST 64 KB.
- M: reaper di mode cloud (DO alarm), token compare constant-time, jangan token di query string (kecuali sekali-pakai + docs warning).

---

## LANGKAH EKSEKUSI

### STEP 1 — Bootstrap repo Angular + Zard UI
**Tujuan:** Struktur target siap, bisa `ng serve`, desain token mengikuti theme gelap existing.
**Instruksi:**
1. Di `~/PROJECTS/office`, buat workspace baru `office-dashboard-ng/` (folder baru, jangan timpa `dashboard/` React sampai step final cutover):
   ```bash
   cd ~/PROJECTS/office
   npx @angular/cli@19 new office-dashboard-ng --standalone --style=css --ssr=false --skip-tests
   ```
2. Init Zard UI: `npx zard-cli@latest init --yes --type angular` lalu `npx zard-cli add` komponen yang dipakai.
3. Pasang Three.js: `npm i three @types/three canvas-confetti @types/canvas-confetti`.
4. Pindahkan design tokens dari `dashboard/src/index.css` → `styles.css` (`:root`/`.dark` CSS variables + Tailwind v4 `@theme`).
5. Salin font Google (Plus Jakarta Sans + JetBrains Mono) ke `index.html`.
6. Siapkan `src/app/` kosong ber-kerangka: `core/`, `shared/`, `stage/`, `engine/`, `features/`.
**Deliverable:** `ng build` hijau, halaman kosong dengan theme gelap ORCA24.
**Review point:** struktur + tema.

---

### STEP 2 — Core types + endpoint resolver + auth service
**Tujuan:** Semua kontrak data TS + auth state, tanpa UI.
**Instruksi:**
1. `core/models/` — salin SEMUA interface dari `dashboard/src/types.ts` (AgentMode, LlmStreamState, AgentData incl. `project/machineId/machineName/orcaName/orcaWorkspace/orcaPane/clientKind`, Session, ToolCall, LogEntry, FeedEvent, CostSource, BillLine, MenuRow, BillUser, BillingSummary, OfficeState).
2. `core/services/endpoints.service.ts` — port `lib/office-endpoints.ts`: `officeApiUrl`, `officeWsUrl`, `isLoopbackHub` (hostname localhost/127.0.0.1/::1) + dev `:5173` → `:4317`.
3. `core/services/auth.service.ts` — signal `token`, `unauthorized`, `busy`; `submitToken(token): Promise<boolean>`; auto-login dari `?auth=`/`?token=` + `history.replaceState` bersih; persist ke cookie `credentials:'include'` bila API-nya butuh.
4. `core/services/api.service.ts` — `getState`, `getBilling`, `killSession`, `refreshFeed`, `getQuote`, `getHealth`; semua lewat `endpoints`.
5. `core/services/websocket.service.ts` — port `useOfficeSocket.ts`: reconnect 2s, initial fetch, handling 401 → `unauthorized`, semua reducer event (9 type) ke state signals, subscribe helpers typed `on<T>`.
6. `core/services/office-state.service.ts` — signals `sessions/toolCalls/logs/billing/stats` + `applyEvent(type,payload)` reducer murni.
**Deliverable:** `ng build` hijau; service siap dipakai UI.
**Review point:** kesesuaian nama kolom & event vs server/worker.

---

### STEP 3 — App shell + routing + AccessGate
**Tujuan:** Kerangka halaman: gate → layout → stage + sidebar.
**Instruksi:**
1. `app.routes.ts` — route `''` → `AppComponent` (atau shell component).
2. `shared/layout/main-layout.component.ts` — topbar + grid `[stage | sidebar]` (`grid-cols-[1fr_380px]`, collapse <1024px).
3. `shared/auth/access-gate.component.ts` — port `AccessGate.tsx`: Zard UI `z-input` type password + `z-button`; state busy/error; submit → `auth.submitToken`.
4. `app.component.ts` — efek: kalau `auth.unauthorized()` → render gate; kalau tidak → layout; init ws connect saat authorized.
**Deliverable:** bisa ketik token → masuk ke layout kosong.
**Review point:** alur auth vs hub lokal (tanpa gate) vs cloud (gate).

---

### STEP 4 — Topbar + stateless widgets
**Tujuan:** Kontrol atas, jam, badge koneksi, AC toggle — Zard UI.
**Instruksi:**
1. `shared/topbar/topbar.component.ts` — port `Topbar.tsx`: brand ORCA24 ☕, sim-badge live/offline, clock (JetBrains Mono), tombol Pause/Recenter/Street, AC Auto/On/Off, pop-out Orca (`?embedded=orca`).
2. Emisi intent via output/event: `camPreset`, `pause`, `acMode`, `popout`.
3. Widget kecil: `connection-badge`, `clock` (interval 1s).
**Deliverable:** topbar fungsional di atas stage kosong.
**Review point:** perilaku embed Orca dipertahankan.

---

### STEP 5 — Sidebar framework: tabs + search + 7 panel mount
**Tujuan:** Shell sidebar dengan 7 tab (Team/Locs/Tasks/Tools/Feed/Logs/Bill), search query, panel container `@switch`.
**Instruksi:**
1. `shared/sidebar/sidebar.component.ts` + `sidebar-tabs.component.ts` (7 tombol, state active).
2. `shared/sidebar/floor-stats.component.ts` (4 stat) + `selected-card.component.ts` (agent terpilih) — Zard `z-card`.
3. `shared/sidebar/search-bar.component.ts` — signal `query`, filter di panel.
4. Panel sementara kosong (`empty` state) — diisi step 6–8.
**Review point:** struktur tab & search shared.

---

### STEP 6 — Panel: Team + 📍 Locs + Tasks
**Tujuan:** Tiga panel roster berbasis agent.
**Instruksi:**
1. `shared/team/team-list.component.ts` + `agent-card.component.ts` — port `TeamList.tsx`: avatar, nama, status dot (Working/Walking/Idle…), chip `PI DEV`/`1F`, badge `#session8`, progress bar, tombol Kill (destructive). Zard: `z-avatar`, `z-badge`, `z-progress`, `z-button`, `z-tooltip`.
2. `shared/team/locations-list.component.ts` — port `LocationsList.tsx`: grup per `machineId|machineName|orcaName` (key `machine:`/`orca:`/`__unknown__`), label konsisten, header grup + stat idle; pakai `agent-identity` helpers.
3. `shared/team/tasks-list.component.ts` — port `TasksList.tsx`: task utama + sub-agent checklist (✅/◽), progress.
**Deliverable:** ketiga panel render dari signal `sessions/agents`.
**Review point:** grouping Locs & filter search.

---

### STEP 7 — Panel: Tools + Feed + Logs
**Tujuan:** Tiga panel stream.
**Instruksi:**
1. `shared/feed/tools-list.component.ts` — port `ToolsList.tsx`: filter kind=tool, tampil `who + code` monospace.
2. `shared/feed/feed-list.component.ts` — port `FeedList.tsx`: chips filter (all/task/tool/chat/move) + badge kind.
3. `shared/logs/realtime-logs.component.ts` — port `RealtimeLogs.tsx`: auto-scroll (scroll ke bawah saat list bertambah), level badge info/warn/error, timestamp id-ID, `[session]` tag.
**Review point:** perilaku auto-scroll & filter.

---

### STEP 8 — Panel: Billing (coffee-shop)
**Tujuan:** Tagihan token + USD per pegawai & per menu.
**Instruksi:**
1. `shared/billing/billing-panel.component.ts` — total bill card, ranked menu (`assignDrinks`/`drinkForModel`, top-3 hot), per-user expandable lines, tone badge (`table/feed/reported/none` → free/paid/unknown), QuoteButton (Portkey lookup via `getQuote`), klik user → fokus kamera.
2. `lib/coffee-menu.ts` → `core/utils/coffee-menu.ts` (assignDrinks, formatUsd, formatTokens, formatPerMillion, formatPerToken, priceBadge, drinkForModel).
**Review point:** akurasi angka vs `server/src/pricing.js` semantic.

---

### STEP 9 — 3D Engine modularisasi (bagian 1: fondasi)
> Strategi: PECAH dulu ke modul tanpa mengubah geometri/angka. Konversi dijamin byte-identik per builder. Lihat GRAPH prompt untuk peta modul lengkap.
**Instruksi:**
1. `engine/core/three-scene.service.ts` — canvas, scene, camera, renderer, controls, resize observer, RAF loop (port `constructor`+`animate`+`start/stop`).
2. `engine/core/texture-factory.service.ts` — port `createCanvasTex/createSignTex/createOakTex/drawMenuBoard` (canvas texture helpers, oak texture procedural).
3. `engine/core/clock.service.ts` — `THREE.Clock`, `simMs`, `speed`, `paused`.
4. `engine/types.ts` — pindah `MenuBoardRow`, `SeatConfig`, `OFFICE_SEATS`, tipe internal.
**Deliverable:** scene kosong + lights render; belum ada furniture/agent.
**Review point:** fondasi render sama persis.

---

### STEP 10 — 3D Engine modularisasi (bagian 2: ruangan & lingkungan)
**Instruksi:**
1. `engine/rooms/coffee-shop.room.ts` — port `initOfficeEnvironment` bagian coffee-shop + `buildWindowWall/buildWindowBar/buildRightWindowWall` (3 ruko identik 20×15, kaca kiri+kanan full glass window).
2. `engine/rooms/office-annex.room.ts` — port `office-annex.ts` (open-plan office, meeting room, server corner, break area).
3. `engine/rooms/mushola-mezzanine.room.ts` — port `mushola-mezzanine.ts` (saf lantai dua, tangga, waypoint).
4. `engine/environment/street-front.ts` + `indomaret.ts` — port dua file existing (trotoar, jalan, minimarket, z-order).
5. `engine/environment/sky-dust.ts` — port sabana/malam canvas + `initSunShafts/stepDust` + sun pools (debu, berkas cahaya).
6. `engine/environment/lighting.service.ts` — port `initLights` (ambient/dir/point, shadow).
7. `engine/furniture/ac-unit.ts` — port `wall-ac.ts` (pita kertas berkibar, RIBBON_* constants).
**Deliverable:** 3 ruko + lingkungan render; belum agent.
**Review point:** visual 3 ruko + glass gap 3m + annex.

---

### STEP 11 — 3D Engine modularisasi (bagian 3: avatar & furniture)
**Instruksi:**
1. `engine/furniture/seat-items.factory.ts` — port `addSeatItems/removeSeatItems` (per-seat: monitor screen + steam + table/stool variants incl. bar + topY).
2. `engine/furniture/` — builder per item: counter, table, stool, chair, meja-meeting, server rack, sajadah, menu-board 3D.
3. `engine/avatars/person.builder.ts` — port `createPersonMesh` (body parts modular: head/torso/arms/legs; canvas face dengan nama + emoji avatar; gender via `inferAgentGender` dari avatar emoji + fallback nama).
4. `engine/avatars/avatar-state.ts` — tipe mode + transisi (work/talk/to/back/leaving/break_play/break_out/idle/mushola).
**Deliverable:** avatar + furniture bisa di-instantiate; belum sync data.
**Review point:** proporsi avatar (1 unit ≈ 1.7 m) & emoji gender.

---

### STEP 12 — 3D Engine modularisasi (bagian 4: navigasi & animasi)
**Instruksi:**
1. `engine/navigation/waypoints.service.ts` — port `initWaypoints/aisleFor/randomizeGroundPoint/isCentral`.
2. `engine/navigation/path.builder.ts` — port `buildEntrancePath/buildExitPath/buildPath/stairDescentFrom/setPath`.
3. `engine/animation/movement.service.ts` — port `stepPerson` (walk cycle bob, rotasi, kecepatan, follow path), `stepDoor` + `requestDoorIfPassing` (pintu geser, DOOR_* constants).
4. `engine/animation/camera.service.ts` — port `camPreset (over/ground/play/street)`, `selectAgent(id, fly)`, tween.
5. `engine/animation/interaction.ts` — port `say` (bubble), `beam` (garis koordinasi), `burst` (confetti).
6. `engine/simulation/idle-mushola.service.ts` — port `trackMusholaIdle/goToMushola/leaveMushola/freeMusholaSpot` (idle → naik saf).
**Deliverable:** engine orchestrator bisa jalankan simulasi agen jalan.
**Review point:** animasi pintu + mushola idle.

---

### STEP 13 — 3D Engine orchestrator + sync data
**Tujuan:** `OfficeEngineService` tipis yang merangkai modul + sync WebSocket.
**Instruksi:**
1. `engine/office-engine.service.ts` — komposisi modul 9–12, expose: `agents: Signal<AgentData[]>`, `events: Signal<FeedEvent[]>`, `liveMessage`, callbacks `onSelect`, `onToast`; method `setMenuBoard`, `setAcMode`, `syncRealSessions`, `handleRealToolCall`, `startExit`, `kill`, `selectAgent`, `camPreset`, `pause`.
2. Port `syncRealSessions` (entrance dari pintu → seat mapping, seat items, persona, status offline → `startExit`) + `handleRealToolCall` (toolsDone++, latestToolName, LiveBar).
3. Port `updateFloatingPills` → `engine/projection/pill-positioner.service.ts` (proyeksi 3D→2D untuk overlay bubble DOM).
**Deliverable:** agent real dari WS muncul & jalan di 3 ruko.
**Review point:** sync & exit path.

---

### STEP 14 — Canvas stage component (Angular) + overlay bubble
**Instruksi:**
1. `stage/canvas-stage.component.ts` — `<canvas>` + inisialisasi engine di `ngAfterViewInit`, destroy cleanup, `ResizeObserver`, floor-tag & hint.
2. `stage/pill-overlay.component.ts` — DOM pills di atas canvas (port `.pill .card` CSS) diposisikan dari projection service; klik → `selectAgent`.
3. `stage/live-bar.component.ts` — port `LiveBar.tsx` (pesan stream, koneksi dot).
**Deliverable:** stage Angular penuh: 3D + bubble + live bar.
**Review point:** overlay projection akurat saat orbit/zoom.

---

### STEP 15 — Cutover: hapus React, satukan build
**Instruksi:**
1. Pindahkan `office-dashboard-ng/` → `dashboard/` (gantikan React), atau ubah `dashboard/package.json` + angular config; hapus file `.tsx`, `vite.config.ts` React.
2. Root `package.json` scripts: `dashboard` → `ng serve` (proxy ke `:4317` tetap), `build` → `ng build` + salin `dist/browser` ke `dashboard/dist`.
3. `start-dev.sh`/`stop-dev.sh`: `OFFICE_DIR` auto-detect repo (`$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)`), lalu sertakan symlink `~/.pi/office → repo` (atau deploy copy eksplisit).
4. Pastikan server tetap serve SPA fallback dari `dashboard/dist`.
**Deliverable:** `npm run build` + `./start-dev.sh` → hub melayani Angular di `:4317`.
**Review point:** tidak ada sisa React; dua mode (dev proxy 5173 & served 4317) jalan.

---

### STEP 16 — Backend & worker hardening (bawa temuan code review)
**Instruksi:**
1. `server/src/server.js` → `server/src/*.ts` bertahap ATAU minimal: implement auth token lokal (cek `Authorization: Bearer` saat `OFFICE_HOST` non-loopback; 401 JSON), default host `127.0.0.1`.
2. `db.js`: pindah index dedupe setelah migrasi kolom; loop aman; tambah retensi (logs 7 hari, tool_calls 24 jam) + batas body 64 KB.
3. `cloudflare/worker.ts`: reaper via `state.storage.setAlarm`/sweep; `schemaReady` per-instance DO (bukan WeakMap global); constant-time token compare.
4. Root `package.json`: npm workspaces `["server","dashboard"]`; hapus dependensi asing; satu lockfile.
**Deliverable:** hub lokal aman default; DB lama tidak crash; cloud ada reaper.
**Review point:** jalankan ulang skenario code-review (DB lama, bind non-loopback, kill safety).

---

### STEP 17 — E2E acceptance test
**Kriteria lulus:**
- [ ] `ng build` zero error; bundle Angular ter-serve dari `:4317` (SPA fallback)
- [ ] Gate: hub non-loopback + token salah → 401 inline; token benar → masuk; loopback → tanpa gate
- [ ] Auto-login `?auth=` sekali pakai + address bar bersih
- [ ] 7 tab sidebar render & filter (Team/Locs/Tasks/Tools/Feed/Logs/Bill)
- [ ] Locs grouping benar per device/orca, label konsisten
- [ ] 3D: 3 ruko + Indomaret + street; agent real masuk dari pintu → duduk; tool call → feed + animasi
- [ ] Billing angka cocok (rate table/feed/reported/none, Quote Portkey)
- [ ] Kill hanya proses Pi (validasi cmdline); reaper pindahkan sesi mati → offline
- [ ] Cloud worker deploy (`wrangler dev`) memakai DO + Turso; reaper aktif
- [ ] Responsive <1024px
- [ ] Tidak ada `any` di kode baru; Zard UI dipakai untuk semua primitif
- [ ] `~/.pi/office` = symlink ke repo (satu sumber kebenaran)

---

*Siap dieksekusi. Mulai dari STEP 1 di `~/PROJECTS/office`.*
