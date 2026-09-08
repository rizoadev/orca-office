# Peta Modul Engine 3D Kantor

Engine `src/app/engine/` dulunya satu kelas monolit (`OfficeEngine`, 3018 baris,
ber-`@ts-nocheck`) yang dipindah utuh dari versi React. Sekarang dia terpecah jadi
**21 service Angular `@Injectable()`** per-subsystem, tanpa `@ts-nocheck`, tanpa
vanilla wrapper.

## Cara pemecahannya (dan kenapa begitu)

Monolitnya adalah ground truth visual. Menulis ulang 2771 baris badan fungsi dengan
tangan = ribuan kesempatan salah transkripsi, dan gejalanya baru muncul sebagai
"kok design coffee shop berubah total". Maka pemecahan dikerjakan oleh codemod:

```
docs/engine-origin/officeEngine.ts        ← sumber asli (baseline React), diarsipkan
        │  node tools/decompose-engine.mjs
        ▼
src/app/engine/**/*.service.ts            ← 21 service + context
```

Badan fungsi dipindah **verbatim**. Satu-satunya transformasi adalah
`this.<X>` → `this.<pemilikX>.<X>`, yang murni mekanis. Peta pemetaan pemilik
(`METHOD_OWNER`, `FIELD_OWNER`) ditetapkan dari analisis call-graph dan
pembaca/penulis-per-field, bukan dari perkiraan.

Kalau nanti mau mengubah logika engine: sunting `docs/engine-origin/officeEngine.ts`
lalu jalankan generator, **atau** putuskan sumber kebenaran sudah pindah ke file hasil
pecahan dan hapus generatornya. Mencampur keduanya (sunting tangan + regenerate) akan
menimpa pekerjaanmu.

## Struktur

```
engine/
  office-scene.ts                Komposisi root: urutan boot + loop animate + API publik
  office-engine.service.ts       (tangan) jembatan DI Angular: NgZone, sinyal, lifecycle
  core/
    engine-context.ts            Dunia Three.js (scene/camera/renderer/controls) + jam sim
    engine-seats.ts              OFFICE_SEATS — 14 titik kursi
    engine-menu-data.ts          MenuBoardRow, PLACEHOLDER_MENU
    engine-painters.ts           paintSignBoard, paintSkyBackdrop, SIGN_FONT, clipText
    texture-factory.service.ts   createCanvasTex, createSignTex, createOakTex
    feed.service.ts              feed, say            → events, evN
  environment/
    lighting.service.ts          initLights
    glass-walls.service.ts       buildWindowWall, buildWindowBar, buildRightWindowWall
    sun-shafts.service.ts        initSunShafts, stepDust, step   → sunShafts, sunPools, dust
    street.service.ts            initStreetFront      → streetFront
  furniture/
    wall-ac.service.ts           initWallAc, setAcMode, updateAc → wallAc, acMode, acPower
    menu-board.service.ts        setMenuBoard, drawMenuBoard     → menuBoardRows, menuSign
    seat-items.service.ts        addSeatItems, removeSeatItems, step → seatItems
  rooms/
    coffee-shop.service.ts       initOfficeEnvironment   (ruang utama, ±990 baris)
    mushola-floor.service.ts     LANTAI-nya: isMusholaBound, freeMusholaSpot, stairDescentFrom
    mushola.service.ts           KEBIASAAN-nya: goToMushola, leaveMushola, trackMusholaIdle
  avatars/
    person.service.ts            createPersonMesh, inferAgentGender, hashText
  navigation/
    waypoints.service.ts         initWaypoints
    paths.service.ts             rute: buildPath, setPath, entrance/exit, aisleFor
    door.service.ts              pintu ganda: requestDoorIfPassing, stepDoor
  animation/
    movement.service.ts          stepAgents, stepPerson (jalannya cycle jalan)
    beam.service.ts              beam, burst, step       → beams
    pill-overlay.service.ts      updateFloatingPills — proyeksi 3D → koordinat bubble DOM
  session/
    session-sync.service.ts      syncRealSessions, handleRealToolCall, removeAgent
  wall-ac.ts / street-front.ts / indomaret.ts / office-annex.ts / mushola-mezzanine.ts
                                 pabrik geometri murni (hanya depend THREE), sudah mandiri
                                 sejak sebelum dipecah — tetap di sini, kini bertipe penuh
```

## Aturan dependensi

Graf modul **asiklik** dan generator menolak siklus, jadi tidak ada `forwardRef`.
Dua lapisan yang perlu disebut karena pernah memaksa keputusan desain:

- `MusholaFloorService` vs `MusholaService` — dipisah karena `PathService` butuh
  geometri tangga (`stairDescentFrom`) sementara perilaku mushola butuh `PathService`.
  Kalau keduanya satu modul, rute ⇄ mushola jadi siklus.
- State yang benar-benar lintas-subsystem (agents, seats, waypoints, screens, steams,
  mezzanine, jam simulasi) tinggal di `EngineContext`. Field yang terbukti dimiliki
  satu subsystem (mis. `dust`, `beams`, `doorAngleL`, `musholaSlots`) **pindah** ke
  service itu, bukan numpang di context.

Setiap scene dibuat dengan `createEnvironmentInjector(...)` (lihat
`office-engine.service.ts`), jadi seluruh graph engine ikut hancur saat komponen
canvas dihancurkan — bukan singleton seumur aplikasi.

## Gerbang verifikasi

Dua alat, keduanya di `tools/`, jalankan setelah menyentuh engine:

```bash
node tools/verify-engine-parity.mjs   # statis: tiap baris logika monolit harus sampai
node tools/parity-visual.mjs          # runtime: render dibanding baseline React
```

`verify-engine-parity.mjs` menormalkan tiap baris pernyataan (spasi dibuang, prefik
`this.<modul>.` dibalik) lalu menuntut **0 statement sumber hilang**. Dia sudah
membuktikan dirinya berguna: dia menangkap off-by-one yang memotong baris terakhir
tiap badan metode (menjatuhkan penutup `*/`) dan `export` yang nyasar ke dalam fungsi.

`parity-visual.mjs` tidak bisa sekadar men-diff dua screenshot. Dunianya engine ini
tidak pernah diam — berkas matahari, uap kopi, dan lampu monitor bernapas mengikuti
`simMs` — jadi dua tangkapan pada waktu simulasi berbeda akan selalu "beda". Harness-nya
membungkam itu dengan **frame gate**: `requestAnimationFrame` dibungkus dan callback
engine hanya jalan kalau nomornya diizinkan, sehingga kedua app bisa dibekukan pada
nomor frame yang sama persis. Karena engine memotong `dt` ke 0.05 s/frame, membeku di
frame N berarti `simMs` juga identik. `Math.random` ikut di-seed supaya jalur acak agen
sama.

Kondisi lulus: meanDiff scene < 2/255 di semua preset kamera, 0 console error.

## Hasil terakhir

| tangkap | meanDiff scene 3D |
|---|---|
| initial | 0.907 / 255 |
| over | 0.811 / 255 |
| street | 0.541 / 255 |

Audit statis: 2174 statement monolit → **0 hilang**; 30 baris baru semuanya seam
orkestrasi (`attach`, `hooks`, delegasi API, dispatch `step()`).

## Yang sengaja TIDAK diubah

Blok `this.steams.forEach(...)` di loop animasi **muncul dua kali** di monolit
React-nya. Menggabungkannya akan membuat uap kopi naik setengah kecepatan — perubahan
perilaku, bukan pembersihan — jadi duplikatnya dipertahankan utuh di
`SeatItemsService.step()` dengan komentar. Sama untuk `P.g.position.y = a._y` yang bisa
berisi `undefined` saat agen turun dari mezanine: ditandai `@ts-expect-error` dengan
alasan, tidak "dibetulkan".
