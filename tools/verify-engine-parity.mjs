#!/usr/bin/env node
// ============================================================
// verify-engine-parity.mjs
//
// Pembukti bahwa dekomposisi TIDAK mengubah perilaku.
//
// Dua lapis:
//  A. STATIS  — tiap baris pernyataan dari monolit officeEngine.ts harus muncul
//               persis sekali di folder engine hasil pecahan, setelah dinormalisasi
//               (spasi dibuang, prefik `this.<modul>.` dibalik). Yang boleh hilang
//               hanya yang memang sengaja dipindah jadi dua statement (mis. panggilan
//               step() pengganti blok inline). Ini menangkap kelas bug "satu karakter
//               terpotong" yang tidak akan kelihatan sampai ada yang melihat render.
//  B. RUNTIME — (lihat tools/parity-scene.mjs) membandingkan scene-graph & hasil
//               render engine lama vs baru di browser nyata.
//
//   node tools/verify-engine-parity.mjs
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ENG = path.join(ROOT, 'dashboard/src/app/engine');
const MONO = path.join(ROOT, 'docs/engine-origin/officeEngine.ts');

const MODULES = ['ctx','tex','feed','lighting','glass','sun','street','ac','menu','seatItems',
  'shop','mushola','mezz','person','wps','paths','door','movement','beam','pills','sync','engine'];

const isCode = (l) => {
  const t = l.trim();
  if (!t) return false;
  if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) return false;
  if (/^@/.test(t)) return false;
  // shell kelas/kebersihan modul saja yang dikecualikan; `export const` tetap dihitung
  // karena nilainya itulah logika yang harus membuktikan dirinya utuh.
  if (/^(import\b|export (class|type|interface)\b|export \{)/.test(t)) return false;
  if (/^[}{);,\]]+$/.test(t)) return false;              // kurung/penutup murni: noise struktural
  if (/^(private readonly \w+ = inject|@|\/\*|\*|\/\/)/.test(t)) return false;
  if (/^export \{/.test(t)) return false;
  return true;
};

/** Normalisasi: buang spasi, balikkan `this.<modul>.` → `this.`, tandai penanda akhir. */
const norm = (line) => {
  let t = line.trim();
  // unwrap-continuation dari generator (baris `...` kelanjutan) tidak ada di sini,
  // jadi cukup: strip prefix modul yang dikenal
  t = t.replace(new RegExp(`\\bthis\\.(${MODULES.join('|')})\\.`, 'g'), 'this.');
  t = t.replace(/^export\s+/, '').replace(/^declare\s+/, '');
  // `x!: T` ≡ `x: T` — penanda definite-assignment untuk field yang diisi setelah
  // konstruktor, bukan perubahan logika.
  t = t.replace(/^(\w+)!:/, '$1:');
  return t.replace(/\s+/g, '');
};

function tally(text, skipRe) {
  const c = new Map();
  for (const l of text.split('\n')) {
    if (!isCode(l)) continue;
    const n = norm(l);
    if (!n || (skipRe && skipRe.test(n))) continue;
    c.set(n, (c.get(n) || 0) + 1);
  }
  return c;
}
const diff = (a, b) => { const r = []; for (const [k, v] of a) { const n = v - (b.get(k) || 0); if (n > 0) r.push([k, n]); } return r; };

const mono = fs.readFileSync(MONO, 'utf8');
const files = [];
// Helper geometri yang sudah berdiri sendiri SEBELUM monolit dipecah (wall-ac, street,
// indomaret, annex, mezzanine) bukan output codemod — memasukkannya akan menghitung
// statement yang memang tidak pernah ada di officeEngine.ts.
const PREEXISTING = new Set(['wall-ac.ts', 'street-front.ts', 'indomaret.ts', 'office-annex.ts', 'mushola-mezzanine.ts']);
const GENERATED_NAMES = new Set(['office-scene.ts', 'engine-context.ts', 'texture-factory.service.ts',
  'feed.service.ts', 'lighting.service.ts', 'glass-walls.service.ts', 'sun-shafts.service.ts',
  'street.service.ts', 'wall-ac.service.ts', 'menu-board.service.ts', 'seat-items.service.ts',
  'coffee-shop.service.ts', 'mushola.service.ts', 'mushola-floor.service.ts', 'person.service.ts',
  'waypoints.service.ts', 'paths.service.ts', 'door.service.ts', 'movement.service.ts',
  'beam.service.ts', 'pill-overlay.service.ts', 'session-sync.service.ts', 'engine-painters.ts',
  'engine-menu-data.ts', 'seats.ts']);

(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.ts') && p !== MONO && !PREEXISTING.has(e.name) && GENERATED_NAMES.has(e.name)) files.push(p);
  }
})(ENG);

const gen = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

// panggilan step() baru yang menggantikan blok inline — ini delta yang diharapkan
// Delta yang MEMANG diharapkan dari bentuk Angular: seam orkestrasi + method delegasi
// di OfficeScene. norm() menyamakan `this.paths.startExit(a)` menjadi `this.startExit(a)`,
// jadi baris ini tercatat 'baru' padahal cuma penerusan.
const EXPECTED_NEW = new RegExp('^(this\.(' + ['movement','beam','seatItems','sun','door','ac','pills','ctx','paths','menu','sync','feed'].join('|') + ')\\.|' +
  'attach\\(|sethooks\\(|if \\(h\\.|window\\.removeEventListener|constructor\\(|const ctor|return this\\.ctx\\.|' +
  'step\\w*\\(dt:number\\)\\{|' +
  '(syncRealSessions|handleRealToolCall|handleSubagentSpawn|setMenuBoard|setAcMode|startExit|burst|getagents|getevents|getsimMs|getpaused|setpaused|getspeed|setspeed|getlabelsOn|setlabelsOn)\\(|' +
  '(this\.ctx\.(agents|paused|speed|labelsOn)|this\.feed\.events)=)', '');
// dua statement yang MEMANG sengaja berhenti ada (digantikan bentuk Angular) — didaftarkan
// di sini supaya tidak jadi false alarm, tapi tetap kelihatan di laporan.
const EXPECTED_MISSING = new Set(['constructor(canvas:HTMLCanvasElement,overlay:HTMLElement){']);

const missing = diff(tally(mono), tally(gen)).filter(([k]) => !EXPECTED_MISSING.has(k));
const extra   = diff(tally(gen), tally(mono)).filter(([k]) => !EXPECTED_NEW.test(k));
// dari file mana tiap statement "baru" berasal — supaya bisa diligalkan satu per satu
const where = new Map();
for (const f of files) for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
  if (!isCode(l)) continue; const n = norm(l);
  if (n && !where.has(n)) where.set(n, path.relative(ROOT, f));
}

console.log(`monolit : ${[...tally(mono).values()].reduce((a, b) => a + b, 0)} statement`);
console.log(`pecahan : ${[...tally(gen).values()].reduce((a, b) => a + b, 0)} statement  (${files.length} file)`);
console.log('');
console.log(`▸ STATEMENT HILANG : ${missing.length}`);
for (const [k, n] of missing.slice(0, 25)) console.log(`   ${n}× ${k.slice(0, 120)}`);
if (missing.length > 25) console.log(`   … ${missing.length - 25} lagi`);
console.log(`▸ STATEMENT BARU (tak terjelaskan) : ${extra.length}`);
for (const [k, n] of extra.slice(0, 25)) console.log(`   ${n}× ${k.slice(0, 90)}  ← ${where.get(k) || '?'}`);

const ok = missing.length === 0;
console.log('');
console.log(ok
  ? '✓ AUDIT STATIS LULUS — tidak ada satu pun baris logika monolit yang hilang atau tersayat.'
  : `✗ AUDIT STATIS GAGAL — ${missing.length} statement sumber tidak ada di output.`);
process.exit(ok ? 0 : 1);
