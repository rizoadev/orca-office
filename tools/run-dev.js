#!/usr/bin/env node
// ============================================================
// run-dev.js — mode development dua proses:
//
//   :4317  hub Node      API + WS + SQLite (+ static, tapi itu untuk mode produksi)
//   :4200  ng serve      Angular dev server, HMR, proxy /api /ws /gateway → 4317
//
// Catatan sejarah: bagian frontend dulu men-spawn Vite di port 5173. Setelah
// dashboard pindah ke Angular, script itu tetap memanggil `npm run dev` di
// dashboard — yang sudah tidak ada — jadi `npm run dev` mati tanpa pesan.
// Kesannya: jangan hardcode nama runner di satu file dan nama script di file lain.
// Sekarang dipanggil `ng serve` langsung, tanpa lapisan npm-di-dalam-npm.
//
// Lihat start-dev.sh untuk mode SATU PROSES (hub menyajikan hasil build di :4317).
// ============================================================

import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const HUB_PORT = Number(process.env.OFFICE_PORT || 4317);
const NG_PORT = Number(process.env.NG_PORT || 4200);
const HOST = process.env.DEV_HOST || '0.0.0.0';

const portFree = (port) =>
  new Promise((res) => {
    const s = net.createServer();
    s.once('error', () => res(false));
    s.once('listening', () => s.close(() => res(true)));
    s.listen(port, '127.0.0.1');
  });

const kids = [];
let closing = false;

/** Anak proses dibuat `detached` → jadi kepala process group sendiri, jadi
 *  `ng serve` dan seluruh keturunan esbuild ikut mati, bukan cuma pembungkusnya. */
function shutdown(signal = 'SIGTERM') {
  if (closing) return;
  closing = true;
  for (const k of kids) {
    try {
      process.kill(-k.child.pid, signal);
    } catch {
      try { k.child.kill(signal); } catch { /* sudah mati */ }
    }
  }
}

async function main() {
  console.log('🚀 Menyalakan ORCA24 Coworking Space (mode dev, 2 proses)');
  console.log('─'.repeat(52));

  // Penjaga port: dua hub yang rebutan port akan gagal terlambat dan membingungkan.
  for (const [label, port, killHint] of [
    ['hub', HUB_PORT, 'pkill -f "node server/src/index.js"'],
    ['ng serve', NG_PORT, 'pkill -f "ng serve"'],
  ]) {
    if (!(await portFree(port))) {
      console.error(`\n✗ Port ${port} (${label}) sudah dipakai.`);
      console.error(`  Hentikan penghuninya dulu, atau pakai port lain:`);
      console.error(`    ${killHint}`);
      console.error(`    OFFICE_PORT=4399 NG_PORT=4299 npm run dev\n`);
      shutdown();
      process.exit(1);
    }
  }

  const server = spawn('node', ['server/src/index.js'], {
    cwd: root,
    stdio: 'inherit',
    detached: true,
    env: { ...process.env, OFFICE_PORT: String(HUB_PORT) },
  });
  kids.push({ name: 'hub', child: server });

  const ng = spawn('npx', ['ng', 'serve', '--host', HOST, '--port', String(NG_PORT), '--hmr'], {
    cwd: path.join(root, 'dashboard'),
    stdio: 'inherit',
    detached: true,
    env: process.env,
  });
  kids.push({ name: 'ng serve', child: ng });

  for (const k of kids) {
    k.child.on('exit', (code, sig) => {
      if (closing) return;
      if (code !== 0 && code !== null) console.error(`\n[${k.name}] keluar dengan kode ${code} (${sig ?? '-'})`);
      else console.log(`\n[${k.name}] berhenti.`);
      shutdown();
      process.exit(code ?? 0);
    });
    k.child.on('error', (e) => {
      console.error(`[${k.name}] gagal start: ${e.message}`);
      shutdown();
      process.exit(1);
    });
  }

  console.log(`
  hub        http://127.0.0.1:${HUB_PORT}        API + WS + SQLite
  dashboard  http://localhost:${NG_PORT}          ng serve (HMR, proxy /api+/ws → ${HUB_PORT})

  Ctrl-C untuk menghentikan keduanya.
  Butuh satu origin tanpa HMR: ./start-dev.sh  →  http://127.0.0.1:${HUB_PORT}
`);
}

process.on('SIGINT', () => { console.log('\n🛑 Menghentikan dev server...'); shutdown(); setTimeout(() => process.exit(0), 400); });
process.on('SIGTERM', () => { shutdown(); process.exit(0); });

main();
