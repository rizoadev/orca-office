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

## Cara memasang (global)

Extension office sudah diarahkan global lewat `config.json`/`orca.json` di `~/.pi/office/`. Untuk memasang/memperbarui ekstensinya ke mesin ini:

```bash
cd ~/.pi/office
npm install                 # sekali saja
npm run sync:extension      # bangun → ~/.pi/agent/extensions/pi-office.ts
```

Verifikasi cepat:

```bash
npm run test:extension      # mock fetch: cek identitas, auth, dan redaksi rahasia
```

Setelah itu **semua sesi `pi` baru** otomatis memuatnya (Pi auto-discover `~/.pi/agent/extensions/*.ts`). Sesi yang sudah berjalan perlu `/reload` atau mulai ulang.

> Untuk pemasangan di mesin lain tanpa repo: salin `extension/` (atau hasil build `pi-office.ts`) ke `~/.pi/agent/extensions/pi-office.ts` di mesin itu, lalu `npm install` di folder extension bila ada dependency.

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

Kalau hub **bukan loopback** (LAN/cloud publik), sebelum dikirim:

- `tool.call` → input diringkas ke **allowlist per tool** (`bash`: `command`,`timeout`; `read`: `path`,`offset`,`limit`; `write`/`edit`: `path`; `subagent`: `agent`,`task`, …). Kunci lain dibuang dan disebut di `_omitted`. `command` dipotong 160 karakter.
- `tool.result` → **body tidak pernah dikirim**. Hanya `output_chars` + `is_error` + durasi.
- `llm.stream`/`log.append`/`task`/`name` → dipotong + rahasia diredaksi.
- Pola rahasia: private key PEM, JWT, AWS AKIA, GitHub/Slack token, `sk-*`, assignment `KEY=value`, kredensial dalam URL.
- Tipe event tak dikenal → **fail-closed** (deep-clone ter-redaksi), bukan lolos mentah.

Ke hub loopback (`127.0.0.1`, `localhost`, `::1`) telemetry tetap detail penuh — dashboard lokal butuh itu.

### Konfigurasi endpoint

Prioritas (pertama menang):

1. `OFFICE_ENDPOINT` env
2. `~/.pi/office/config.json` → `endpoint`, atau `url` (origin + `/api/event`)
3. `~/.pi/office/orca.json` (jembatan kompatibel mundur)
4. Default `http://127.0.0.1:4317/api/event`

`config.json` contoh:

```json
{
  "url": "http://127.0.0.1:4317",
  "enabled": true,
  "machineName": "Nama-Device",
  "orcaName": "Orca Main"
}
```

Field opsional lain: `endpoint`, `token` (Bearer bila hub ber-proteksi), `machineId`, `orcaWorkspace`, `orcaPane`. `enabled: false` mematikan telemetry. `config.json` dan `orca.json` berada di `.gitignore` karena bisa memuat token — salin dari `config.example.json`.

Env pendukung: `OFFICE_TOKEN`, `OFFICE_MACHINE_NAME`, `OFFICE_MACHINE_ID`, `OFFICE_ORCA_NAME`, `OFFICE_ORCA_WORKSPACE`, `OFFICE_ORCA_PANE`.

### Identitas mesin

`identity.ts` membuat `machine-id` stabil di `~/.pi/office/machine-id` (mode 600, sekali). Dashboard menampilkan chip `🏢 device` + `🐋 Orca/workspace` — sesi dari beberapa laptop tetap kebaca asalnya.

## Stand-down otomatis (project vs global)

Hasil build menyertakan penjaga `hasProjectLocalOfficeExtension()`: saat `pi` dijalankan dari folder yang (atau parent-nya) memiliki `.pi/extensions/pi-office/index.{ts,js}`, extension global **mundur** — tidak mendaftarkan `office_*` dua kali dan tidak dobel kirim. Artinya aman: repo ini punya source di `extension/`, project lain bisa punya salinan lokal, dan global tidak bentrok.

## Menjalankan satu sesi dengan extension ini saja (tanpa global)

```bash
cd ~/.pi/office
npm run pi:office        # pi -e extension/index.ts
```

## Pemeliharaan

- Ubah source di `extension/*.ts` → `npm run sync:extension` (otomatis backup file global lama ke `*.bak-*`) → `npm run test:extension`.
- Builder `tools/build-global-extension.js` menggabung modul sesuai urutan dependensi dan **menolak** duplikasi nama top-level / default export ganda — aman dari kesalahan gabung.
- Banner hasil build: `GENERATED ... do not edit here` — edit di `extension/`, bukan di file global.
