// Bangun, uji, dan terbitkan paket npm pi-office — dengan pagar anti-katastrop.
//
// Kenapa skrip ini ada: `npm publish --prefix packaging/pi-office` TIDAK mengubah
// direktori publish. Ia mem-pack package.json di cwd, jadi dari root repo perintah itu
// menerbitkan `orca-office` — 207 file, seluruh repo — di bawah nama yang salah. Perintah
// yang kelihatannya benar dan hening lebih berbahaya daripada perintah yang gagal keras,
// jadi isi tarball diperiksa sebelum apa pun dikirim ke registry.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG_DIR = path.join(ROOT, 'packaging', 'pi-office');
const EXPECTED_FILES = ['package.json', 'pi-office.ts', 'README.md'];
const DRY_RUN = process.argv.includes('--dry-run');

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const manifest = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8'));
const rootManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// 1. Jangan pernah menerbitkan sesuatu yang masih punya salinan editable di repo.
assert.equal(rootManifest.private, true, 'package.json root HARUS private:true — kalau tidak, `npm publish` di root menerbitkan seluruh repo');
// Scoped name yang valid: [@scope/]name — '/' hanya boleh sebagai pemisah scope.
assert.match(manifest.name, /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/, `nama paket tidak valid: ${manifest.name}`);
assert.ok(Array.isArray(manifest.pi?.extensions) && manifest.pi.extensions.length === 1,
  'manifest `pi.extensions` harus menunjuk tepat satu berkas bundle');
assert.ok(!Object.keys(manifest.dependencies || {}).length,
  'paket extension tidak boleh punya runtime dependency — bundle hanya memakai node:*');

// 2. Bundle harus berasal dari source saat ini, bukan artefak basi.
run('node', ['tools/build-global-extension.js'], ROOT);
const REPO_BUNDLE = path.join(ROOT, 'extensions-global', 'pi-office.ts');
const PACKAGE_BUNDLE = path.join(PKG_DIR, 'pi-office.ts');
for (const abs of [REPO_BUNDLE, PACKAGE_BUNDLE]) {
  assert.ok(fs.existsSync(abs), `bundle tidak ada: ${abs}`);
  assert.ok(fs.readFileSync(abs, 'utf8').includes(`OFFICE_EXTENSION_VERSION = '${manifest.version}'`),
    `${abs}: stamp versi ≠ manifest (${manifest.version}) — build tidak jalan atau manifest belum dinaikkan`);
}
assert.equal(
  fs.readFileSync(REPO_BUNDLE, 'utf8'),
  fs.readFileSync(PACKAGE_BUNDLE, 'utf8'),
  'extensions-global/ dan packaging/ berbeda — keduanya harus dari satu kali build'
);

// 3. Uji sebelum terbit.
run('node', ['tools/test-global-extension.js'], ROOT);

// 4. Inspeksi tarball: nama, versi, dan ISI persis.
const packOut = run('npm', ['pack', '--dry-run', '--json'], PKG_DIR);
const [packed] = JSON.parse(packOut);
assert.equal(packed.name, manifest.name, 'isi tarball bukan paket yang dimaksud');
assert.equal(packed.version, manifest.version);
const got = packed.files.map((f) => f.path).sort();
assert.deepEqual(got, [...EXPECTED_FILES].sort(), `isi tarball salah: ${got.join(', ')}`);
for (const f of packed.files) {
  assert.ok(!/(^|\/)(\.env|config\.json|machine-id|.*\.db)$/.test(f.path), `berkas runtime ikut ke tarball: ${f.path}`);
}
assert.ok(packed.size < 64 * 1024, `tarball ${packed.size} byte — seharusnya satu file extension, bukan repo`);

console.log(`✅ ${manifest.name}@${manifest.version} — ${packed.size} byte, ${got.length} file: ${got.join(', ')}`);

if (DRY_RUN) {
  console.log('↷ --dry-run: tidak ada yang dikirim ke registry.');
  process.exit(0);
}

// 5. Terbit. `--access public` wajib untuk scope, tidak berbahaya untuk unscoped.
try {
  run('npm', ['publish', '--access', 'public'], PKG_DIR);
} catch (err) {
  const out = `${err.stdout || ''}${err.stderr || ''}`;
  // JANGAN menutupi sebabnya dengan pesan karangan sendiri. Kasus nyata: registry menolak
  // karena 2FA, guard ini mencetak "belum punya hak terbit, jalankan npm login" — saran
  // yang salah persis ketika akun sudah terautentikasi. Baris npm error-nya yang dipercaya.
  const registryLines = out.split('\n').filter((l) => /^npm error/.test(l)).slice(0, 3);
  console.error(`\n❌ ${manifest.name}@${manifest.version} tidak terbit. Kata registry:`);
  for (const line of registryLines) console.error('   ' + line.replace(/^npm error\s*/, ''));
  if (!registryLines.length) console.error('   (tidak terbaca, output mentah 400 karakter terakhir):\n   ' + out.slice(-400));

  const hints = [];
  if (/Two-factor|bypass 2fa|one-time pass/i.test(out)) {
    hints.push('butuh 2FA: `npm publish --access public --otp=123456` (kode authenticator, berlaku ~30 detik)');
    hints.push('atau: npmjs.com → Access Tokens → granular token dengan "bypass 2FA" untuk automation');
  }
  if (/ENEEDAUTH|401/.test(out)) hints.push('belum login: `npm login` (cek: `npm whoami`)');
      if (/@/.test(manifest.name)) hints.push('scope harus sama dengan username npm (akun di mesin ini: rizoa) — atau pakai nama unscoped');
  if (hints.length) { console.error('   Kemungkinan jalan keluar:'); for (const h of hints) console.error('   • ' + h); }
  process.exit(1);
}

console.log(`\n🎉 Terbit. Uji di mesin lain:  pi install npm:${manifest.name}@${manifest.version}`);
