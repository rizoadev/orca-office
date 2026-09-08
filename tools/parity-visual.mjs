#!/usr/bin/env node
// ============================================================
// parity-visual.mjs — gerbang verifikasi visual engine 3D kantor.
//
// Kenapa tidak diff polos: simulasi engine ini berjalan per-frame dan DUNIANYA TIDAK
// PERNAH DIAM — berkas matahari, uap kopi, dan lampu monitor semuanya bernapas mengikuti
// waktu simulasi. Dua tangkapan dari engine yang SAMA PERSIS tetap berbeda pixelnya
// kalau dipotret pada waktu simulasi yang berbeda. Diff polos akan menyalahkan engine
// untuk sesuatu yang cuma soal timing.
//
// Yang dilakukan:
//   1. Math.random di-seed identik → titik acak jalur agent sama di kedua app.
//   2. FRAME GATE: requestAnimationFrame dibungkus, callback engine hanya dijalankan
//      kalau nomornya sudah diizinkan lewat window.__gate. Di luar itu rAF tetap
//      dijadwalkan ulang (browser hidup) tapi engine tidak maju → engine membeku tepat
//      di frame N. Kedua app dibekukan pada N yang sama → keadaan dunia identik.
//      Efek samping yang dicari: jeda antar frame yang dieksekusi jadi >> 50ms, jadi
//      `Math.min(clock.getDelta(), 0.05)` SELALU memotong ke 0.05 → simMs bertambah
//      persis 50ms per frame, tidak peduli seberapa lambat GPU-nya.
//   3. Difoto dari tiga preset kamera yang bisa dipicu UI, lalu di-diff per area.
//
// Catatan pengukuran (headless swiftshader, 1500x900): ~2.9 fps; agent berjalan pada
// frame 2→160, DUDUK di frame ≈165–215, lalu berpindah lagi. F_SEATED dipilih di tengah
// jendela duduk itu.
//
// Ambang: meanDiff < 2/255 dianggap identik (sisa noise antialiasing/GPU).
//
//   node tools/parity-visual.mjs [baselineUrl] [candidateUrl]
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const A_URL = process.argv[2] || 'http://127.0.0.1:4318/';   // baseline (React)
const B_URL = process.argv[3] || 'http://127.0.0.1:4317/';   // candidate (Angular)
const OUT = '/tmp/parity';
const SEED = 20260909;
const EXE = '/home/rizoa/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';

const F_SEATED = 190;   // potret pertama: kedua agen sudah di kursi
const F_TWEEN = 40;     // tween kamera = 0.8s / 0.05s = 16 frame, diberi margin
const VIEWS = [
  { name: 'initial', btn: null },
  { name: 'over',    btn: /⌖|Recenter|awal/i },
  { name: 'street',  btn: /🛣|street|depan/i },
];

const pw = (() => {
  for (const d of [process.cwd(), path.join(process.cwd(), 'dashboard'),
    ...(process.env.PARITY_NODE_PATH ? process.env.PARITY_NODE_PATH.split(':') : []),
    '/home/rizoa/PROJECTS/LP-12pi']) {
    try { return createRequire(path.join(d, 'noop.js'))('playwright-core'); } catch { /* lanjut */ }
  }
  console.error('playwright-core tidak ditemukan — npm i -D playwright-core');
  process.exit(2);
})();
const { chromium } = pw;

const INIT = `(() => {
  let s = ${SEED} >>> 0;
  Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  window.__f = 0;
  window.__gate = 1e9;
  const raf = window.requestAnimationFrame.bind(window);
  const poll = (cb) => raf((t) => {
    if (window.__f >= window.__gate) return poll(cb);
    window.__f++;
    return cb(t);
  });
  window.requestAnimationFrame = (cb) => poll(cb);
})()`;

async function waitFrames(page, n) {
  // polling berbasis waktu, BUKAN rAF — kalau tidak, polling Playwright ikut
  // menyumbat antrean requestAnimationFrame yang dibungkus di atas.
  await page.waitForFunction((k) => window.__f >= k, n, { timeout: 900000, polling: 400 });
}
/** Bekukan kedua app pada frame n yang sama persis. */
async function freezeAt(pages, n) {
  await Promise.all(pages.map((p) => p.evaluate((k) => { window.__gate = k; }, n)));
  await Promise.all(pages.map((p) => waitFrames(p, n)));
}
const clickBtn = (page, re) => page.evaluate((src) => {
  const rx = new RegExp(src.slice(1, -2), 'i');
  const b = [...document.querySelectorAll('.topbar button')].find((x) => rx.test(x.textContent));
  if (b) b.click();
  return !!b;
}, re.source);

const mk = async (url, tag) => {
  // browser TERPISAH per app: dua konteks WebGL swiftshader dalam satu proses saling
  // melambatkan sampai di bawah batas timeout.
  const browser = await chromium.launch({
    executablePath: EXE,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  await page.addInitScript(INIT);
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => document.querySelectorAll('.pill').length > 0, { timeout: 180000, polling: 500 }).catch(() => {});
  return { page, browser, tag, errors };
};

fs.mkdirSync(OUT, { recursive: true });
console.log(`baseline  ${A_URL}\ncandidate ${B_URL}`);
console.log(`seed ${SEED} · frame gate: duduk=f${F_SEATED}, +${F_TWEEN} per preset\n`);

const [a, b] = [await mk(A_URL, 'A'), await mk(B_URL, 'B')];
const pages = [a.page, b.page];
const probe = (page) => page.evaluate(() => ({
  f: window.__f,
  canvas: (() => { const c = document.querySelector('#shop'); const r = c.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; })(),
  pills: [...document.querySelectorAll('.pill')].filter((x) => getComputedStyle(x).display !== 'none')
    .map((x) => { const r = x.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`; }),
}));

const results = [];
let target = F_SEATED;
for (const v of VIEWS) {
  if (v.btn) await Promise.all(pages.map((p) => clickBtn(p, v.btn)));
  await freezeAt(pages, target);
  const pa = await probe(a.page), pb = await probe(b.page);
  if (pa.f !== pb.f) console.log(`  ⚠ frame tidak sejajar (A=${pa.f} B=${pb.f}) — hasil diff tidak bisa dipercaya`);
  for (const { page, tag } of [a, b]) await page.screenshot({ path: `${OUT}/${tag}-${v.name}.png` });
  console.log(`  ${v.name.padEnd(8)} A f=${pa.f} ${pa.canvas} pills=[${pa.pills.join(' | ')}]`);
  console.log(`  ${' '.repeat(v.name.length)} B f=${pb.f} ${pb.canvas} pills=[${pb.pills.join(' | ')}]`);
  results.push(v.name);
  target += F_TWEEN;
}
await Promise.all([a.browser.close(), b.browser.close()]);

// ── diff ──
const db = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const dp = await db.newPage();
const compare = (pa, pb) => dp.evaluate(async ([x, y]) => {
  const load = (d) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + d; });
  const [ia, ib] = await Promise.all([load(x), load(y)]);
  const W = Math.min(ia.width, ib.width), H = Math.min(ia.height, ib.height);
  const grab = (img) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(img, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
  const A = grab(ia), B = grab(ib);
  const box = (x0, y0, x1, y1) => {
    let s = 0, n = 0, big = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      const i = (yy * W + xx) * 4;
      const d = (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2])) / 3;
      s += d; n++; if (d > 24) big++;
    }
    return { mean: +(s / n).toFixed(3), pct: +(100 * big / n).toFixed(2) };
  };
  return { all: box(0, 0, W, H), scene: box(0, 60, 1120, 865), side: box(1120, 60, W, H) };
}, [fs.readFileSync(pa).toString('base64'), fs.readFileSync(pb).toString('base64')]);

console.log('\n            seluruh page        scene 3D                 sidebar');
let worst = 0, worstSide = 0;
for (const name of results) {
  const d = await compare(`${OUT}/A-${name}.png`, `${OUT}/B-${name}.png`);
  worst = Math.max(worst, d.scene.mean);
  worstSide = Math.max(worstSide, d.side.mean);
  console.log(`  ${name.padEnd(10)} ${String(d.all.mean).padStart(6)}/255   ${String(d.scene.mean).padStart(6)}/255 (${String(d.scene.pct).padStart(5)}% beda)   ${String(d.side.mean).padStart(6)}/255`);
}
await db.close();

const clean = (e) => e.filter((x) => !/THREE\.|PCFSoft|GL Driver|ReadPixels|WebGL/i.test(x));
const errB = clean(b.errors);
console.log(`\nconsole error → baseline: ${clean(a.errors).length} · candidate: ${errB.length}`);
errB.slice(0, 5).forEach((e) => console.log('  ! ' + e.slice(0, 140)));

const pass = worst < 2 && errB.length === 0;
console.log('');
console.log(pass
  ? `✓ LULUS — engine terpecah render identik dengan baseline di semua sudut (worst ${worst}/255; sidebar ${worstSide}/255 berisi teks jam yang memang beda per jalan).`
  : `✗ GAGAL — worst scene ${worst}/255, error ${errB.length}. Lihat ${OUT}/`);
process.exit(pass ? 0 : 1);
