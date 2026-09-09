# Pi Extension — Office (Global)

Ekstensi ini membuat **setiap sesi `pi` di mesin** melaporkan dirinya ke kantor virtual ORCA24: persona Indonesia, tugas aktif, tool call, stream LLM, dan pemakaian token. Ia terpasang sebagai **global Pi extension** — dimuat otomatis oleh Pi dari `~/.pi/agent/extensions/` di folder mana pun Anda menjalankan `pi`.

## Satu kalimat

> **Sumber kebenaran ada di repo (`extension/*.ts`); `npm run sync:extension` membangunnya menjadi satu file global (`~/.pi/agent/extensions/pi-office.ts`) yang di-auto-load Pi untuk semua sesi.**

```
extension/                 ← sumber modular (repo ini)
├── index.ts               ← hook Pi: session_start, before_agent_start, tool_call, ...
├── client.ts              ← kirim POST /api/event (fire-and-forget)
├── config.ts              ← baca ~/.pi/office/config.json (atau orca.json)
├── identity.ts            ← machine-id stabil + identitas Orca
├── indonesian-names.ts    ← 100 persona (80 perempuan / 20 laki-laki) + sub-agent
├── redact.ts              ← redaksi rahasia & ringkasan payload sebelum keluar mesin
└── package.json           ← metadata extension
        │  npm run sync:extension  (tools/build-global-extension.js)
        ▼
~/.pi/agent/extensions/pi-office.ts   ← SATU file, siap di-auto-load Pi
```

## Cara memasang

### Mesin lain (rekomendasi): satu baris dari npm

```bash
pi install git:github.com/rizoadev/pi-office   # pasang extension (satu file, nol dependency)
# `pi install npm:pi-office` setara dan akan menyusul: isinya identik, tapi registry npm
### Dua cara mengelola — jangan ketuker

| Mesin | Cara | Update |
|---|---|---|
| **dev box ini** | file longgar `~/.pi/agent/extensions/pi-office.ts`, hasil `npm run sync:extension` | `node tools/build-global-extension.js && npm run sync:extension` → `/reload` |
| **laptop teammate** | paket git: `pi install git:github.com/rizoadev/pi-office@v1.2.2` | `pi update --extension git:github.com/rizoadev/pi-office@v1.2.3` |

`pi update --extension git:…` hanya bekerja untuk sumber yang terdaftar sebagai **paket** di
`settings.json`. Di dev box entry-nya `extensions/pi-office.ts` (path), jadi perintah itu
balas `No matching package found` — bukan error pi, melainkan memang bukan jalur mesin ini.
Keduanya menaruh file yang sama; jangan aktifkan dua-duanya sekaligus (extension sudah punya
guard defer, tapi satu jalur saja lebih jelas).
# menolak terbit sampai akun punya 2FA aktif atau granular token dengan bypass-2FA.
pi                                     # buka sesi pi apa pun
/office connect <token-kantor>         # satu kali per mesin
```

`/office connect` menulis `~/.pi/office/config.json` (mode 600) lalu **memakai token itu di sesi
yang sedang berjalan** — tidak perlu restart. Endpoint Worker cloud sudah jadi bawaan paket, jadi
yang perlu diisi hanya token. Dashboard-nya: `https://pi-office.hanirizo.workers.dev`.

Paket dibangun dari source yang sama lewat `tools/publish-package.js`:

```bash
npm run pack:extension            # build + npm pack --dry-run (lihat isi tarball)
npm run publish:extension         # pagar penuh, TIDAK menerbitkan apa pun (dry-run)
npm run publish:extension:live    # build → test → cek tarball → npm publish
```

`publish:extension` sengaja dry-run. Alasannya nyata: `npm publish --prefix packaging/pi-office`
**tidak** memindahkan direktori publish — ia mem-pack `package.json` di cwd, jadi dari root repo
perintah itu menerbitkan `orca-office` sebanyak 207 file dengan nama yang salah. Skrip menolak
berjalan kecuali isi tarball persis `[package.json, pi-office.ts, README.md]`, nama & versi cocok,
kedua bundle (`extensions-global/` dan `packaging/`) identik byte, dan root `package.json`
berstatus `private: true`. Root juga sudah diganti nama jadi `orca-office` (mengikuti nama repo)
sekaligus `private: true`, jadi kecelakaan yang sama tidak bisa terjadi dua kali.

> **Jangan dua-duanya.** Kalau mesin punya salinan global hasil `sync:extension` **dan** paket
> npm terpasang, Pi memuat keduanya dan tool `office_*` bentrok. Builder menyematkan
> `officeExtensionShouldDeferToOtherCopy()`: salinan paket mundur saat ada file global, dan hanya
> memuat sendiri di mesin bersih. Sengaja bukan penanda `globalThis` — itu akan membuat `/reload`
> mematikan telemetry diam-diam.

### Mesin ini (dev): dari repo

Extension office sudah diarahkan global lewat `config.json`/`orca.json` di `~/.pi/office/`. Untuk memasang/memperbarui ekstensinya ke mesin ini:

```bash
cd ~/.pi/office
npm install                 # sekali saja
npm run sync:extension      # bangun → ~/.pi/agent/extensions/pi-office.ts
```

Verifikasi cepat:

```bash
npm run test:extension      # 4 kasus: default cloud, token env, redaksi, /office connect
```

Setelah itu **semua sesi `pi` baru** otomatis memuatnya (Pi auto-discover `~/.pi/agent/extensions/*.ts`). Sesi yang sudah berjalan perlu `/reload` atau mulai ulang.

> Alternatif manual tanpa npm/pi-package: salin `packaging/pi-office/pi-office.ts` ke
> `~/.pi/agent/extensions/pi-office.ts` mesin target. Extension hanya butuh builtin `node:*` —
> tidak ada `npm install` yang diperlukan.

## Perintah `/office`

| Perintah | Efek |
|---|---|
| `/office` | Endpoint, origin dashboard, ada/tidaknya token, status redaksi, `machine_name` + `machine_id`, waktu kirim terakhir + error terakhir |
| `/office connect <token>` | Simpan token di endpoint bawaan, kirim handshake `session.register` |
| `/office connect <url> <token>` | Sama, ke hub lain (LAN/hub sendiri) |
| `/office url <endpoint>` | Ganti endpoint saja |
| `/office local` / `/office cloud` | Pintar ke `http://127.0.0.1:4317/api/event` / Worker cloud |
| `/office test` | Satu `log.append` dan laporkan hasil HTTP (200 vs 401 vs timeout 1.2s) |
| `/office off` / `/office on` | Set `enabled:false` / `true` |

Perintah ini juga menjawab kegagalan senyap: `sendOfficeEvent()` **sengaja** menelan semua error
(telemetry tidak boleh menjatuhkan Pi CLI), jadi tanpa `/office` mesin yang di-401 Worker tidak
memperlihatkan apa pun. Sebagai gantinya `session_start` memberi satu kali hint `/office connect`
per sesi bila endpoint remote dan token belum ada.

## Cara kerja

### Hook yang dipasang

| Hook Pi | Efek telemetry |
|---|---|
| `session_start` | `session.register` — persona (nama/role/avatar/warna), cwd, model, pid, task |
| `before_agent_start` | `task.update` — tangkap prompt asli user sebagai tugas aktif |
| `tool_call` | `tool.call`; bila `toolName === 'subagent'` → juga `team.register` (sub-agent jadi anggota tim) |
| `tool_result` | `tool.result` — durasi + error flag |
| `message_start/update/end` | `llm.stream` — respons/thinking berjalan (rate-limit 180 ms) |
| `message_end` (assistant) | `session.usage` — token in/out/cache + cost |
| `agent_end` | `session.heartbeat` — status `idle` |
| `session_shutdown` | `session.end` — tandai offline |

### Custom tools yang didaftarkan ke LLM

| Tool | Efek |
|---|---|
| `office_set_task` | ubah deskripsi tugas di bubble dashboard |
| `office_announce` | kirim pengumuman ke feed seluruh kantor |

### Redaksi otomatis (`redact.ts`)

**Keputusan sensor diambil dari tempat data didarat, bukan dari alamat hub.** Saat
`session_start`, extension menanyakan `GET /api/health` → `storage`: hanya `'local-file'`
yang membuka detail penuh; apa pun yang lain (atau probe gagal) = sensor menyala. Alasannya:
sejak hub lokal menulis ke Turso, `http://127.0.0.1:4317` tetap berarti barisnya mendarat di
database bersama — dan baris itu permanen.

Dan karena klien lama / sesi yang sudah berjalan tidak ikut ter-upgrade, **hub menegakkan
sendiri** (`enforceTelemetryPolicy` di `server.js`, dan selalu di Worker): payload di-sensor
ulang sebelum ditulis. Terbukti: POST `tool.call` berisi command mentah ke hub storage-remote
tersimpan sebagai `{"command":"cd"}` (test e2e no. 11/11d).

Saat sensor aktif, sebelum event meninggalkan mesin:

- `tool.call` → input diringkas ke **allowlist per tool** (`bash`: `command`,`timeout`; `read`: `path`,`offset`,`limit`; `write`/`edit`: `path`; `subagent`: `agent`,`task`, …). Kunci lain dibuang dan disebut di `_omitted`.
- `command` → **satu kata kerja** (`commandVerb()`): potong di segmen pertama (`&&`/`;`/`|`), buang flag dan pembungkus (`timeout 90 node` → `node`), sisakan `cd`/`git`/`npm`/`curl`. Sengaja tanpa subcommand — di situlah argumen (branch, URL, path) mulai ikut.
- `path` → **basename** saja (`/home/x/proyek/server/db.js` → `db.js`). Masih cukup untuk "dia sedang mengerjakan apa", tanpa membuka struktur repo.
- `subagent.task` → tetap teks (dipotong + disensor): ini satu-satunya cara melihat sub-agent bekerja.
- `tool.result` → **body tidak pernah dikirim**. Hanya `output_chars` + `is_error` + durasi.
- `llm.stream`/`log.append`/`task`/`name` → dipotong + rahasia diredaksi.
- Pola rahasia: private key PEM, JWT, AWS AKIA, GitHub/Slack token, `sk-*`, assignment `KEY=value`, kredensial dalam URL.
- Tipe event tak dikenal → **fail-closed** (deep-clone ter-redaksi), bukan lolos mentah.

Hub dengan storage `file:` lokal mengirim detail penuh — dashboard lokal memang butuh.
Tetapi itu bukan lagi konsekuensi dari "loopback": hub loopback yang menulis ke Turso wajib
tetap men-sensor, dan itu yang dicegah pagar di atas.

### Konfigurasi endpoint

Prioritas (pertama menang):

1. `OFFICE_ENDPOINT` env
2. `OFFICE_LOCAL=1` env → `http://127.0.0.1:4317/api/event` (saklar developer)
3. `~/.pi/office/config.json` → `endpoint`, atau `url` (origin + `/api/event`)
4. `~/.pi/office/orca.json` (jembatan kompatibel mundur)
5. Default **`https://pi-office.hanirizo.workers.dev/api/event`**

Dulunya default-nya loopback, sehingga laptop baru yang belum punya `config.json` mengirim ke
hub yang tidak ada di sana dan tetap sunyi. Sekarang default-nya Worker: `pi install` langsung
nyambung. Orang asing yang memasang tanpa token hanya dapat 401 — yang menjaga tulis/baca adalah
**token**, bukan URL.

`config.json` contoh:

```json
{
  "url": "http://127.0.0.1:4317",
  "enabled": true,
  "machineName": "Nama-Device",
  "orcaName": "Orca Main"
}
```

Field opsional lain: `endpoint`, `token` (Bearer bila hub ber-proteksi), `machineId`, `orcaWorkspace`, `orcaPane`.

`enabled: false` mematikan telemetry. Dipisah dari pembacaan config (`officeTelemetryEnabled()`),
karena `readOfficeExtensionConfig()` mengembalikan `null` saat nonaktif dan dulu itu terbaca
"tidak ada config" sehingga **malah jatuh ke endpoint default dan terus mengirim**. `config.json` dan `orca.json` berada di `.gitignore` karena bisa memuat token — salin dari `config.example.json`.

Env pendukung: `OFFICE_TOKEN`, `OFFICE_LOCAL`, `OFFICE_DISABLED`, `OFFICE_MACHINE_NAME`, `OFFICE_MACHINE_ID`, `OFFICE_ORCA_NAME`, `OFFICE_ORCA_WORKSPACE`, `OFFICE_ORCA_PANE`.

### Dua level token di Worker

| Secret | Boleh dibagi? | Isi |
|---|---|---|
| `OFFICE_TOKEN` | hanya owner/dashboard | baca state + billing + kill + tulis |
| `OFFICE_INGEST_TOKEN` | ✅ ke teammate/laptop lain | hanya `POST /api/event` |

Tanpa `OFFICE_INGEST_TOKEN` perilaku persis seperti dulu. Dengan itu, orang yang memasang paket
dan menerima token tulis-saja tidak bisa membaca sesi, tagihan, atau mematikan sesi mesin lain.
Redaksi payload tetap berlapis di sisi mesin (lihat di atas), jadi kredensial tulis saja tidak
membuat data mentah ikut terkirim.

### Identitas mesin

`identity.ts` membuat `machine-id` stabil di `~/.pi/office/machine-id` (mode 600, sekali). Dashboard menampilkan chip `🏢 device` + `🐋 Orca/workspace` — sesi dari beberapa laptop tetap kebaca asalnya.

## Stand-down otomatis (project vs global)

Ada **dua** penjaga di hasil build, keduanya dibaca dari disk (bukan state proses) supaya tetap benar setelah `/reload`:

1. `hasProjectLocalOfficeExtension()` — saat `pi` dijalankan dari folder yang (atau parent-nya) memiliki `.pi/extensions/pi-office/index.{ts,js}`, extension global **mundur**. Repo ini punya source di `extension/`, project lain bisa punya salinan lokal, global tidak bentrok.
2. `officeExtensionShouldDeferToOtherCopy()` — salinan **paket** (npm/git/path) mundur kalau ada file global `~/.pi/agent/extensions/pi-office.ts` dan ia bukan file itu. Pi menolak tool bernama sama (`Tool "office_set_task" conflicts with ...`), jadi tanpa penjaga ini mesin dengan dua metode install akan gagal memuat salah satunya. File global menang karena itulah yang `sync:extension` bit dari source; mesin bersih (tanpa file itu) tetap memuat paket.

## Menjalankan satu sesi dengan extension ini saja (tanpa global)

```bash
cd ~/.pi/office
npm run pi:office        # pi -e extension/index.ts
```

## Pemeliharaan

- Ubah source di `extension/*.ts` → `npm run sync:extension` (otomatis backup file global lama ke `*.bak-*`) → `npm run test:extension`.
- Builder `tools/build-global-extension.js` menggabung modul sesuai urutan dependensi dan **menolak** duplikasi nama top-level / default export ganda — aman dari kesalahan gabung.
- Banner hasil build: `GENERATED ... do not edit here` — edit di `extension/`, bukan di file global.
- Naikkan versi paket npm di `packaging/pi-office/package.json` → `npm run publish:extension` (cek pagar) → `npm run publish:extension:live`. Builder menyematkan `OFFICE_EXTENSION_VERSION` dari manifest itu, dan `test:extension` menolak kalau stamp/version hilang, jadi tidak mungkin menerbitkan paket versi lama dari bundle basi.
