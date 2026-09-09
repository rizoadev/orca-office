# ☕ pi-office — kantor virtual untuk sesi Pi CLI

Ekstensi [Pi](https://pi.dev) yang mendaftarkan setiap sesi `pi` ke **ORCA24 Coworking Space**:
kantor 3D (Three.js + Angular) tempat sesi-mu jadi "pegawai" berpersona Indonesia, lengkap dengan
tugas aktif, feed tool-call realtime, stream respons LLM, dan tagihan token per model.

## Pasang

```bash
pi install npm:@rizoadev/pi-office
```

Selesai. Semua sesi `pi` di mesin itu sekarang otomatis terdaftar ke kantor — di laptop mana pun,
tanpa perlu menjalankan hub lokal.

Lihat kantornya di: <https://pi-office.hanirizo.workers.dev>

## Connect (satu kali per mesin)

Paket ini sudah tahu **ke mana** harus mengirim (Worker cloud), tapi tidak boleh ikut membawa
**token** — token adalah kunci untuk membaca & menulis isi kantor. Jadi satu kali saja:

```
pi
/office connect <token>
```

Perintah itu menulis `~/.pi/office/config.json` (mode `0600`) dan langsung memakainya di sesi
yang sedang berjalan — tanpa restart. Setelah itu tiap `pi` tinggal jalan.

Butuh token? Minta ke owner kantor, atau kalau kamu deploy sendiri:
`wrangler secret put OFFICE_TOKEN` (lihat repo `orca-office`, docs/DEPLOY-CLOUDFLARE.md).

## Perintah

| Perintah | Fungsi |
|---|---|
| `/office` | Status: endpoint, dashboard, token ada/tidak, redaksi, identitas mesin, kirim terakhir |
| `/office connect <token>` | Simpan token + kirim handshake (pakai endpoint bawaan) |
| `/office connect <url> <token>` | Sama, tapi ke hub lain (mis. `http://192.168.1.10:4317/api/event`) |
| `/office url <endpoint>` | Ganti endpoint saja |
| `/office local` \| `/office cloud` | Cepat pindah ke hub `127.0.0.1:4317` atau Worker cloud |
| `/office test` | Kirim satu event dan laporkan hasilnya (200 / 401 / timeout) |
| `/office off` \| `/office on` | Matikan / nyalakan telemetry dari mesin ini |

Env var tetap dihormati dan menang di atas config: `OFFICE_ENDPOINT`, `OFFICE_TOKEN`,
`OFFICE_MACHINE_NAME`, `OFFICE_LOCAL=1` (paksa hub lokal), `OFFICE_DISABLED=1`.

## Tool untuk LLM

- `office_set_task` — perbarui teks "sedang dikerjakan" di bubble-mu
- `office_announce` — kirim pengumuman ke seluruh kantor

## Privasi

Sejak event meninggalkan mesin, payload disensor bila hub bukan loopback:

- hasil tool **tidak pernah** dikirim isinya — hanya panjang output, durasi, dan status error
- input tool diringkas ke allowlist field (`command`, `path`, …) dan dipotong; field yang dibuang
  terlihat sebagai `_omitted`
- assignment secret (`TOKEN=...`, JWT, API key, isi `.env`) dipola dan disensor
- nama project diturunkan dari `cwd`, path penuh tidak ikut ke hub non-loopback

Kirim ke hub loopback (`/office local`) = tanpa sensor, karena data tidak keluar mesin.

## Requirement

Node ≥ 22 (punya Pi CLI). Tidak ada runtime dependency — bundle ini satu file murni `node:*`.

## Sumber & versi

Dibangun dari <https://github.com/rizoadev/orca-office> (`extension/*.ts` + `lib/session-utils.ts`,
di-bundle oleh `tools/build-global-extension.js`). Jangan sunting `pi-office.ts` di sini —
perubahan akan tertimpa pada build berikutnya. Lisensi MIT.
