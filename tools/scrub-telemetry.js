// Audit & bersihkan telemetry yang TERLANJUR tersimpan di DB.
//
// Kenapa perlu: sensor telemetry diputuskan oleh `isLoopbackEndpoint(endpoint)` di sisi
// mesin. Sejak hub menulis ke Turso cloud, "hop pertama loopback" bukan lagi jaminan
// "data tidak keluar mesin" — payload mentah masuk ke database bersama. Baris yang sudah
// tertulis bersifat permanen, jadi memperbaikinya dua bagian: berhenti kirim mentah
// (extension/redact.ts) DAN tulis ulang baris lama (alat ini).
//
//   node --env-file=.env tools/scrub-telemetry.js            → audit saja (default)
//   node --env-file=.env tools/scrub-telemetry.js --apply     → perbaiki baris yang berubah
//
// Keluaran audit TIDAK pernah menampilkan isi baris atau nilai secret — hanya nama
// variabel, bentuk nilai, dan jumlah baris.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { sanitizeEvent } from '../extension/redact.ts';
import { resolveDatabaseUrl } from '../server/src/db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const APPLY = process.argv.includes('--apply');
const url = resolveDatabaseUrl(process.env.OFFICE_SCRUB_DB || null);
// Token hanya untuk target remote; `file:` tidak menerima authToken.
const client = createClient({
  url,
  authToken: url.startsWith('file:') || url === ':memory:' ? undefined : process.env.TURSO_AUTH_TOKEN,
});
console.log(`🗄️  target: ${url.startsWith('file:') ? url : 'Turso/cloud'} — mode ${APPLY ? 'APPLY' : 'audit (tidak menulis)'}`);

const SECRET_ASSIGN = /([A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|ACCESS_KEY|CREDENTIAL|AUTH|DSN)[A-Za-z0-9_]*)\s*[=:]\s*(\S{4,})/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g;

function classify(value) {
  if (!value) return {};
  const kinds = {};
  let m;
  SECRET_ASSIGN.lastIndex = 0;
  while ((m = SECRET_ASSIGN.exec(value))) {
    const raw = m[2];
    const shape = raw.includes('[redacted]') ? 'sudah-sensor'
      : raw.startsWith('$') ? 'referensi-shell'
      : /^["']?(libsql|https?):\/\//.test(raw) ? 'url'
      : raw.startsWith('eyJ') ? 'JWT'
      : `literal-${raw.length}char`;
    const key = m[1].toUpperCase();
    kinds[key] = kinds[key] || {};
    kinds[key][shape] = (kinds[key][shape] || 0) + 1;
  }
  JWT.lastIndex = 0;
  if (JWT.test(value)) (kinds['<jwt-di-manapun>'] ||= {}).found = 1;
  return kinds;
}

const rows = (await client.execute(
  'SELECT id, session_id, tool_name, input_json, result_json FROM tool_calls'
)).rows;

let dirty = 0;
const exposures = {};
const updates = [];

for (const row of rows) {
  let input = {};
  try { input = JSON.parse(row.input_json || '{}'); } catch { input = { _unparseable: row.input_json }; }

  // Perbandingan pakai sensor yang SAME dengan yang dipakai extension hari ini, jadi
  // "dirty" berarti "tersimpan lebih rinci daripada yang seharusnya keluar mesin".
  const wanted = sanitizeEvent('tool.call', { tool_name: row.tool_name, input }).input;
  const before = JSON.stringify(input);
  const after = JSON.stringify(wanted);
  for (const [key, shapes] of Object.entries(classify(before))) {
    exposures[key] ||= {};
    for (const [shape, n] of Object.entries(shapes)) exposures[key][shape] = (exposures[key][shape] || 0) + n;
  }
  if (before !== after) {
    dirty++;
    updates.push({ id: row.id, input: wanted, dropResult: true });
  } else if (row.result_json && row.result_json !== 'null' && row.result_json !== '{}') {
    // Input-nya sudah pas, tapi body hasil tool masih utuh → tetap harus dibuang.
    updates.push({ id: row.id, input, dropResult: true });
  }
}

console.log(`\n📊 tool_calls: ${rows.length} baris, ${dirty} tersimpan lebih rinci daripada hasil sensor`);
const flagged = Object.entries(exposures).filter(([k]) => k !== '<jwt-di-manapun>');
if (flagged.length) {
  console.log('\n⚠️  pola seperti kredensial ditemukan (nama variabel + bentuk nilai saja, bukan isinya):');
  for (const [key, shapes] of flagged.sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`   ${key.padEnd(28)} ${Object.entries(shapes).map(([s, n]) => `${s}×${n}`).join(', ')}`);
  }
}
const jwt = exposures['<jwt-di-manapun>'];
if (jwt) console.log(`   (JWT terdeteksi di ${jwt.found} baris)`);

// `result_json`: di jalur loopback dulu body hasil tool ikut tersimpan — inilah kanal
// paling rawan, karena output `cat .env` / `npm whoami` masuk apa adanya.
const withResult = rows.filter((r) => r.result_json && r.result_json !== 'null' && r.result_json !== '{}');
console.log(`\n📊 tool_calls dengan result_json terisi: ${withResult.length} — sensor tidak pernah menyimpan body ini`);

if (!APPLY) {
  console.log(`\n↷ Audit saja: ${updates.length} baris akan ditulis ulang. Tambah --apply untuk menjalankan.`);
} else {
  const backupDir = process.env.OFFICE_SCRUB_BACKUP_DIR || path.join(ROOT, '.backup');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `tool-calls-before-scrub-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(rows));
  try { fs.chmodSync(backupFile, 0o600); } catch { /* windows */ }
  console.log(`\n🗄️  backup baris lama → ${backupFile} (${rows.length} baris, mode 600)`);

  // `client.prepare()` tidak ada di @libsql/client — itu hanya ada di wrapper db.js.
  // Di sini pakai execute({ sql, args }) langsung.
  for (const u of updates) {
    await client.execute({ sql: 'UPDATE tool_calls SET input_json = ?, result_json = NULL WHERE id = ?', args: [JSON.stringify(u.input), u.id] });
  }
  console.log(`✅ Diperbaiki: ${updates.length} baris (input dipangkas ke bentuk hasil sensor, result_json dikosongkan)`);
}

await client.close();
