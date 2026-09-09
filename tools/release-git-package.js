#!/usr/bin/env node
// Terbitkan paket pi-office ke repo git-nya — jalur instalasi yang SUDAH bekerja hari ini.
//
// Kenapa skrip ini ada: `pi install git:github.com/rizoadev/pi-office` adalah satu-satunya
// jalur publish yang tidak mentok kebijakan 2FA akun npm. Tapi repo git itu adalah SALINAN
// dari packaging/pi-office — dan salinan yang tidak dijaga pasti melenceng. Jadi rilis
// harus lewat satu pintu yang menolak jalan kalau sumbernya tidak konsisten.
//
//   node tools/release-git-package.js            # dry-run: tunjukkan apa yang akan terjadi
//   node tools/release-git-package.js --push     # benar-benar commit + tag + push

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const REPO = path.resolve(import.meta.dirname, '..');
const PKG = path.join(REPO, 'packaging', 'pi-office');
const GIT_URL = process.env.PI_OFFICE_GIT_URL || 'https://github.com/rizoadev/pi-office.git';
const PUSH = process.argv.includes('--push');

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const manifest = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8'));
const FILES = ['package.json', 'pi-office.ts', 'README.md'];
assert.ok(manifest.name && manifest.version, 'packaging/pi-office/package.json harus punya name+version');

// 1. Artefak paket HARUS identik dengan bundle repo. Cek byte-per-byte: guard npm publish
//    sudah melakukan ini; rilis git tidak boleh jadi jalur belakang yang meloloskan drift.
const bundleRepo = fs.readFileSync(path.join(REPO, 'extensions-global', 'pi-office.ts'), 'utf8');
const bundlePkg = fs.readFileSync(path.join(PKG, 'pi-office.ts'), 'utf8');
assert.equal(bundlePkg, bundleRepo,
  'bundle paket ≠ bundle repo — jalankan: node tools/build-global-extension.js');

// 2. Tree bersih: rilis dari working tree yang ada edits belum ter-commit = tidak bisa
//    dilacak balik ke commit repo.
const dirty = run('git', ['status', '--porcelain'], REPO).trim();
if (dirty) {
  console.error('❌ working tree kotor; commit dulu sebelum rilis paket:\n' + dirty.split('\n').slice(0, 6).map((l) => '   ' + l).join('\n'));
  process.exit(1);
}
const headCommit = run('git', ['rev-parse', '--short', 'HEAD'], REPO).trim();

// 3. Repo tujuan: klon sementara, timpa 3 file, commit + tag.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-office-release-'));
try {
  run('git', ['clone', '--quiet', GIT_URL, 'dst'], tmp);
  const dst = path.join(tmp, 'dst');
  for (const f of FILES) fs.copyFileSync(path.join(PKG, f), path.join(dst, f));

  const changed = run('git', ['status', '--porcelain'], dst).trim();
  const tag = `v${manifest.version}`;
  console.log(`📦 ${manifest.name}@${manifest.version} ← orca-office@${headCommit}`);
  console.log(`   tag:     ${tag}`);
  console.log(`   berubah: ${changed ? changed.split('\n').map((l) => l.trim()).join(', ') : '(tidak ada — paket repo ini sudah sama)'}`);
  if (!PUSH) {
    console.log('↷ dry-run: tidak ada yang di-push. Tambah --push untuk menerbitkan.');
    process.exit(0);
  }
  if (!changed) console.log('   (tanpa perubahan file — tag baru tetap dibuat supaya ref rilis jelas)');

  run('git', ['add', '-A', ...FILES], dst);
  run('git', ['-c', 'user.name=Riza Masykur', '-c', 'user.email=riza@ikamai.com',
    'commit', '--allow-empty', '-m', `${manifest.name} ${manifest.version}

Dibangun dari rizoadev/orca-office@${headCommit} oleh tools/release-git-package.js.
Sumber: packaging/pi-office/ — JANGAN sunting salinan repo git ini langsung.`], dst);
  // Tag HARUS annotated + didorong eksplisit. `--follow-tags` tidak membawa tag
  // lightweight, jadi rilis sebelumnya mencetak "🎉 Terbit" sambil repo paket sebenarnya
  // punya NOL tag — `pi install ...@v1.2.0` gagal `git checkout`, dan tidak ada yang tahu
  // karena yang diuji adalah isi clone (HEAD), bukan ref yang di-pin.
  run('git', ['tag', '-f', '-a', tag, '-m', `${manifest.name} ${manifest.version} (dari orca-office@${headCommit})`], dst);
  run('git', ['push', 'origin', 'HEAD:main'], dst);
  run('git', ['push', '-f', 'origin', `refs/tags/${tag}`], dst);

  // Jangan pernah percaya push tanpa verifikasi ke remote.
  const remote = run('git', ['ls-remote', '--tags', GIT_URL], dst);
  if (!remote.includes(`refs/tags/${tag}`)) throw new Error(`tag ${tag} tidak ada di remote setelah push:\n${remote}`);
  const sha = run('git', ['rev-parse', 'HEAD'], dst).trim();
  if (!remote.includes(sha)) throw new Error(`commit ${sha} tidak menjadi ujung tag ${tag} di remote`);
  console.log(`   terverifikasi: ${tag} → ${sha.slice(0, 7)} ada di remote`);
  console.log(`\n🎉 Terbit. Instal di mesin mana pun:`);
  console.log(`   pi install git:github.com/rizoadev/${manifest.name}`);
  console.log(`   pi install git:github.com/rizoadev/${manifest.name}@${tag}   ← pin versi`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
