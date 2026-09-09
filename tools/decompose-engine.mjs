#!/usr/bin/env node
// ============================================================
// decompose-engine.mjs — pecah officeEngine.ts jadi layanan Angular per-subsystem.
//
// Kenapa codemod, bukan tulis ulang: file sumber byte-identik dengan baseline React
// dan itu satu-satunya ground truth visual. Menulis ulang 2771 baris dengan tangan
// = ribuan kesempatan salah transkripsi yang baru kelihatan sebagai "design berubah
// total". Codemod memindahkan badan fungsi VERBATIM; transformasi tunggalnya adalah
// `this.<X>` → `this.<pemilik>.<X>`, murni mekanis dan bisa diaudit baris per baris.
//
// Pra-kondisi (dites di bawah, script berhenti kalau gagal):
//   1. tidak ada `this` telanjang   2. tidak ada `function()` non-arrow di kelas
//   3. tidak ada getter/setter      4. graf antar-modul asiklik
//   5. semua metode & field terpetakan
//
//   node tools/decompose-engine.mjs --print   → rencana saja
//   node tools/decompose-engine.mjs           → tulis file
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ENG = 'src/app/engine';
// Sumber asli (baseline React) diarsipkan supaya src/app/engine hanya berisi layanan
// Angular sungguh — tidak ada monolit vanilla yang tertinggal di dalam proyek.
const SRC = path.join(ROOT, 'docs', 'engine-origin', 'officeEngine.ts');
const WRITE = !process.argv.includes('--print');

const src = fs.readFileSync(SRC, 'utf8');
const lines = src.split('\n');
const fail = (m) => { console.error('✗ ' + m); process.exit(1); };

// ────────────────────────────────────────────────────────────
// 1. Peta modul
// ────────────────────────────────────────────────────────────
const MODULES = {
  ctx:       { file: `${ENG}/core/engine-context.ts`,            cls: 'EngineContext' },
  tex:       { file: `${ENG}/core/texture-factory.service.ts`,   cls: 'TextureFactoryService' },
  feed:      { file: `${ENG}/core/feed.service.ts`,              cls: 'FeedService' },
  lighting:  { file: `${ENG}/environment/lighting.service.ts`,   cls: 'LightingService' },
  glass:     { file: `${ENG}/environment/glass-walls.service.ts`, cls: 'GlassWallService' },
  sun:       { file: `${ENG}/environment/sun-shafts.service.ts`, cls: 'SunShaftService' },
  street:    { file: `${ENG}/environment/street.service.ts`,     cls: 'StreetService' },
  ac:        { file: `${ENG}/furniture/wall-ac.service.ts`,      cls: 'WallAcService' },
  menu:      { file: `${ENG}/furniture/menu-board.service.ts`,   cls: 'MenuBoardService' },
  seatItems: { file: `${ENG}/furniture/seat-items.service.ts`,   cls: 'SeatItemsService' },
  shop:      { file: `${ENG}/rooms/coffee-shop.service.ts`,      cls: 'CoffeeShopService' },
  mezz:      { file: `${ENG}/rooms/mushola-floor.service.ts`,    cls: 'MusholaFloorService' },
  mushola:   { file: `${ENG}/rooms/mushola.service.ts`,          cls: 'MusholaService' },
  person:    { file: `${ENG}/avatars/person.service.ts`,         cls: 'PersonService' },
  wps:       { file: `${ENG}/navigation/waypoints.service.ts`,   cls: 'WaypointService' },
  paths:     { file: `${ENG}/navigation/paths.service.ts`,       cls: 'PathService' },
  door:      { file: `${ENG}/navigation/door.service.ts`,        cls: 'DoorService' },
  movement:  { file: `${ENG}/animation/movement.service.ts`,     cls: 'MovementService' },
  beam:      { file: `${ENG}/animation/beam.service.ts`,         cls: 'BeamService' },
  pills:     { file: `${ENG}/animation/pill-overlay.service.ts`, cls: 'PillOverlayService' },
  sync:      { file: `${ENG}/session/session-sync.service.ts`,   cls: 'SessionSyncService' },
  engine:    { file: `${ENG}/office-scene.ts`,                  cls: 'OfficeScene' },
};

const METHOD_OWNER = {
  createCanvasTex: 'tex', createSignTex: 'tex', createOakTex: 'tex',
  feed: 'feed', say: 'feed',
  initLights: 'lighting',
  buildWindowWall: 'glass', buildWindowBar: 'glass', buildRightWindowWall: 'glass',
  initSunShafts: 'sun', stepDust: 'sun',
  initStreetFront: 'street',
  initWallAc: 'ac', setAcMode: 'ac', updateAc: 'ac',
  setMenuBoard: 'menu', drawMenuBoard: 'menu',
  addSeatItems: 'seatItems', removeSeatItems: 'seatItems', revealSeatItems: 'seatItems',
  initOfficeEnvironment: 'shop',
  // LANTAI mushola (ruang: saf, slot, geometri tangga) — tidak tahu apa-apa soal rute.
  isMusholaBound: 'mezz', freeMusholaSpot: 'mezz', stairDescentFrom: 'mezz',
  // KEBIASAAN mushola (naik saat menganggur, turun saat ada kerja) — butuh sistem rute.
  goToMushola: 'mushola', leaveMushola: 'mushola', trackMusholaIdle: 'mushola',
  hashText: 'person', inferAgentGender: 'person', createPersonMesh: 'person',
  initWaypoints: 'wps',
  aisleFor: 'paths', randomRange: 'paths', randomizeGroundPoint: 'paths', isCentral: 'paths',
  buildEntrancePath: 'paths', buildExitPath: 'paths', groundExitPath: 'paths',
  startExit: 'paths', buildPath: 'paths', setPath: 'paths',
  requestDoorIfPassing: 'door', stepDoor: 'door',
  stepPerson: 'movement',
  beam: 'beam', burst: 'beam',
  updateFloatingPills: 'pills',
  syncRealSessions: 'sync', handleRealToolCall: 'sync', handleSubagentSpawn: 'sync', removeAgent: 'sync',
  animate: 'engine', start: 'engine', stop: 'engine', camPreset: 'engine', selectAgent: 'engine',
  resize: 'ctx', handleResize: 'ctx',
};

const FIELD_OWNER = {
  canvas: 'ctx', overlay: 'ctx', scene: 'ctx', camera: 'ctx', renderer: 'ctx', controls: 'ctx',
  clock: 'ctx', simMs: 'ctx', speed: 'ctx', paused: 'ctx', labelsOn: 'ctx',
  agents: 'ctx', seats: 'ctx', waypoints: 'ctx', playSpots: 'ctx',
  screens: 'ctx', steams: 'ctx', mezzanine: 'ctx', tv: 'ctx',
  onStateChange: 'ctx', onLiveMessage: 'ctx', onToast: 'ctx',
  events: 'feed', evN: 'feed',
  sunShafts: 'sun', sunPools: 'sun', dust: 'sun',
  streetFront: 'street',
  wallAc: 'ac', acMode: 'ac', acPower: 'ac',
  menuBoardRows: 'menu', menuSign: 'menu',
  seatItems: 'seatItems',
  frontDoorL: 'door', frontDoorR: 'door', doorAngleL: 'door', doorAngleR: 'door',
  doorHeldUntilL: 'door', doorHeldUntilR: 'door',
  DOOR_LEAD: 'door', DOOR_OPEN_ANGLE: 'door', DOOR_HOLD_OPEN_MS: 'door',
  musholaSlots: 'mezz', musholaIdleAfter: 'mezz',
  beams: 'beam',
  talkPair: 'movement', talkT: 'movement',
  tw: 'engine',          // tween kamera: hanya animator & camPreset/selectAgent yang menyentuh
  animId: 'engine',
};

// Helper top-level → file
const TOP_OWNER = {
  OFFICE_SEATS: 'core/engine-seats.ts', MenuBoardRow: 'core/engine-menu-data.ts',
  PLACEHOLDER_MENU: 'core/engine-menu-data.ts',
  paintSignBoard: 'core/engine-painters.ts', paintSkyBackdrop: 'core/engine-painters.ts',
  SIGN_FONT: 'core/engine-painters.ts', clipText: 'core/engine-painters.ts',
};
const IMPORTS_REPL = {
  'core/engine-menu-data.ts': { seats: '../rooms/seats', },
};

// ────────────────────────────────────────────────────────────
// 2. Parser top-level (pelacak kurung, bukan regex rapuh)
// ────────────────────────────────────────────────────────────
const CLASS_LINE = lines.findIndex((l) => l.startsWith('export class OfficeEngine'));
CLASS_LINE < 0 && fail('kelas tidak ditemukan');

/** → [{name, kind, text}] untuk tiap deklarasi top-level setelah blok import */
function splitTopLevel(region) {
  const out = [];
  let buf = [], depth = 0, started = false, name = null;
  const flush = () => {
    const text = buf.join('\n').replace(/\s+$/, '');
    if (text.trim()) {
      const m = text.match(/(?:export\s+)?(?:const|let|function|type|interface)\s+([A-Za-z_]\w*)/);
      if (m) out.push({ name: m[1], text });
    }
    buf = []; depth = 0; started = false; name = null;
  };
  for (const l of region) {
    if (!buf.length && (!l.trim() || l.trim().startsWith('//'))) { buf.push(l); continue; }
    buf.push(l);
    for (const c of l) { if ('{[('.includes(c)) { depth++; started = true; } else if ('}])'.includes(c)) depth--; }
    if (started && depth === 0) flush();
    else if (!started && /;\s*$/.test(l)) flush();
  }
  flush();
  return out;
}

let CLASS_END = CLASS_LINE;
for (let i = CLASS_LINE + 1; i < lines.length; i++) { if (lines[i] === '}') { CLASS_END = i; break; } }
CLASS_END === CLASS_LINE && fail('akhir kelas tak ketemu');

const topRegion = lines.slice(0, CLASS_LINE).filter((l) => !/^import /.test(l) && !/^\/\/ @ts/.test(l) && l.trim());
const tops = splitTopLevel(topRegion);
const unmappedTop = tops.filter((t) => !(t.name in TOP_OWNER));
if (unmappedTop.length) fail('top-level belum terpetakan: ' + unmappedTop.map((t) => t.name).join(', '));

// ────────────────────────────────────────────────────────────
// 3. Parser kelas
// ────────────────────────────────────────────────────────────
const METHOD_RE = /^  (?:private |public |readonly )?(?:static |async )?([A-Za-z_]\w*)\s*(?:=\s*\(\s*\)\s*=>|\()/;
const marks = [];
for (let i = CLASS_LINE + 1; i < CLASS_END; i++) {
  const m = lines[i].match(METHOD_RE);
  if (m) marks.push({ name: m[1], line: i });
}
const bodies = {};
for (let k = 0; k < marks.length; k++) {
  // slice() sudah exclusive di ujung kanan → pakai line metode berikutnya apa adanya.
  // Pernah salah -1 di sini: tiap badan metode kehilangan baris terakhirnya, yang
  // menjatuhkan penutup `*/` komentar dokumen.
  const end = k + 1 < marks.length ? marks[k + 1].line : CLASS_END;
  bodies[marks[k].name] = lines.slice(marks[k].line, end).join('\n').replace(/\s+$/, '');
}

/** `Type = init` dipisah dengan memperhatikan kurung bersarang. */
function splitAssign(s) {
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ('([{<'.includes(c)) d++;
    else if (')]}>'.includes(c)) d--;
    else if (c === '=' && d === 0 && s[i + 1] !== '=' && !['=', '!', '<', '>'].includes(s[i - 1]))
      return { type: s.slice(0, i).trim().replace(/;$/, ''), init: s.slice(i).trim() };
  }
  return { type: s.trim().replace(/;$/, ''), init: '' };
}
const fields = [];
{
  let pend = [];
  for (const l of lines.slice(CLASS_LINE + 1, marks[0].line)) {
    if (!l.trim()) { pend = []; continue; }
    if (l.trim().startsWith('//')) { pend.push(l); continue; }
    let m = l.match(/^  (?:private |public |readonly )?([A-Za-z_]\w*)(\??):\s(.+)$/);
    if (m) {
      const { type, init } = splitAssign(m[3].replace(/;$/, ''));
      fields.push({ name: m[1], optional: m[2] === '?', type, init, comment: pend.join('\n') });
    } else {
      // field tanpa anotasi tipe: `  DOOR_LEAD = 1.7;` — TS menyimpulkan tipe dari init,
      // jadi deklarasinya bisa dipindah verbatim.
      m = l.match(/^  (?:private |public |readonly )?([A-Za-z_]\w*)\s*=\s*(?:(\([^)]*\)\s*=>)?\s*)(.+);$/);
      if (!m) { pend = []; continue; }
      fields.push({ name: m[1], optional: false, type: '', init: '= ' + m[3], comment: pend.join('\n') });
    }
    pend = [];
  }
}
const FIELD_NAMES = new Set(fields.map((f) => f.name));
const ALL = Object.keys(bodies);
ALL.filter((m) => !(m in METHOD_OWNER)).length && fail('metode belum terpetakan: ' + ALL.filter((m) => !(m in METHOD_OWNER)));
[...FIELD_NAMES].filter((f) => !(f in FIELD_OWNER)).length && fail('field belum terpetakan: ' + [...FIELD_NAMES].filter((f) => !(f in FIELD_OWNER)));

// ── pra-kondisi ──
[...src.matchAll(/\bthis(?![\w.:])/g)].length && fail('ada `this` telanjang');
/^\s*(?:get|set)\s+\w+\s*\(/m.test(src) && fail('ada getter/setter');
const nonArrow = ALL.reduce((a, n) => a + (bodies[n].match(/\bfunction\s*[<(]?[\w]*\s*\(/g) || []).length, 0);
nonArrow && fail(`ada ${nonArrow} fungsi non-arrow (this-rebinding)`);

// ────────────────────────────────────────────────────────────
// 4. Transformasi `this.<X>` → pemiliknya
// ────────────────────────────────────────────────────────────
const DEPS = {};
function rewrite(body, self) {
  return body.replace(/\bthis\.([A-Za-z_]\w*)/g, (w, id) => {
    const owner = id in METHOD_OWNER ? METHOD_OWNER[id] : FIELD_NAMES.has(id) ? FIELD_OWNER[id] : null;
    if (!owner) return w; // `this.canvas` di dalam attach() dll tetap valid
    if (owner === self) return `this.${id}`;
    (DEPS[self] ||= new Set()).add(owner);
    return `this.${id === 'animate' ? id : owner}.${id}`;
  }).replace(/\bthis\.engine\.animate\b/g, 'this.animate');
}

/**
 * Koreksi tertarget yang TIDAK mengubah runtime — hanya membuat kode terbaca
 * TypeScript strict. Tiap entri wajib beralasan, dan generator GAGAL kalau targetnya
 * tidak ketemu, supaya patch tidak pernah diam-diam menjadi no-op.
 */
const LINE_PATCHES = [
  {
    where: 'movement',
    find: '      P.g.position.y = a._y;',
    why: [
      '      // @ts-expect-error Perilaku asli engine: saat mode mushola `_y` sengaja tidak',
      "      // diisi ulang di atas, jadi posisi.y bisa ikut undefined. TIDAK 'diperbaiki'",
      '      // supaya render identik dengan baseline React — mengubahnya akan menggeser',
      '      // ketinggian avatar yang baru turun dari mezanine.',
    ].join('\n'),
  },
];
const applied = new Map();
function applyPatches(text, mod) {
  let out = text;
  for (const p of LINE_PATCHES.filter((x) => x.where === mod)) {
    if (!out.includes(p.find)) continue;                 // belum tentu di metode ini
    out = out.replace(p.find, p.why + '\n' + p.find);
    applied.set(p, (applied.get(p) || 0) + 1);
  }
  return out;
}
/** Setelah semua badan ditulis ulang: tiap patch harus benar-benar kena sekali. */
function verifyPatches() {
  for (const p of LINE_PATCHES) {
    const n = applied.get(p) || 0;
    if (n !== 1) fail(`patch '${p.where}' kena ${n}× (harus tepat 1×) — sumber berubah, periksa manual`);
  }
}

const plan = {};
for (const [m, mod] of Object.entries(METHOD_OWNER)) if (m !== 'constructor') (plan[mod] ||= []).push(m);
for (const [mod, ms] of Object.entries(plan)) for (const m of ms) rewrite(bodies[m], mod); // pass 1: deps
const OUT = {};
const key = (mod, m) => `${mod}#${m}`;
for (const [mod, ms] of Object.entries(plan))
  for (const m of ms) OUT[key(mod, m)] = applyPatches(rewrite(bodies[m], mod), mod);

// graf modul harus asiklik
{
  const g = Object.fromEntries(Object.entries(DEPS).map(([k, v]) => [k, [...v].filter((d) => d !== 'ctx')]));
  const done = {};
  const walk = (n, st) => {
    st.includes(n) && fail('SIKLUS modul: ' + [...st, n].join(' → '));
    done[n] && !st.includes(n) && (done[n] === 2 ? null : null);
    if (done[n] === 2) return;
    done[n] = 2;
    for (const m of g[n] || []) walk(m, [...st, n]);
  };
  for (const n of Object.keys(g)) walk(n, []);
}

// ── verifikasi akhir generator ──
verifyPatches();

// ────────────────────────────────────────────────────────────
// 5. Emit
// ────────────────────────────────────────────────────────────
const GEN = `// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah ` + '`this.<X>` → `this.<pemilik>.<X>`' + `.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.`;

const rel = (from, to) => {
  const r = path.posix.relative(path.posix.dirname(from), path.posix.dirname(to));
  // tanpa ekstensi: Angular/TS menyelesaikan './x' → x.ts sendiri
  return (r ? (r.startsWith('.') ? r : './' + r) : '.') + '/' + path.posix.basename(to).replace(/\.ts$/, '');
};
/** Field yang baru terisi setelah konstruktor (di attach()) → butuh `!` agar lolos
 *  strictPropertyInitialization tanpa berbohong soal tipenya. */
const LATE = new Set(['canvas', 'overlay', 'scene', 'camera', 'renderer', 'controls']);
const declFor = (mod) => fields.filter((f) => FIELD_OWNER[f.name] === mod).map((f) =>
  `${f.comment ? f.comment + '\n' : ''}  ${f.name}${LATE.has(f.name) && !f.init ? '!' : ''}${f.optional ? '?' : ''}${f.type ? `: ${f.type}` : ''}${f.init ? ' ' + f.init : ''};`).join('\n\n');

const files = {};
const seenImports = new Map();

/** Simbol global → dari mana dia harus diimpor. Dideteksi dari pemakaian nyata,
 *  bukan daftar tangan — kalau ada simbol baru, generator yang mengeluhkan. */
const SYMBOLS = [
  [['AgentData','FeedEvent','Session','ToolCall','OfficeState','LogEntry'], (f) => `import type { $ } from '${r2(f, 'core/models/types')}';`],
  [['MenuBoardRow'],                    (f) => `import type { MenuBoardRow } from '${r2(f,'core/engine-menu-data')}';`],
  [['PLACEHOLDER_MENU'],                 (f) => `import { PLACEHOLDER_MENU } from '${r2(f,'core/engine-menu-data')}';`],
  [['paintSignBoard','paintSkyBackdrop','SIGN_FONT','clipText'], (f) => `import { $ } from '${r2(f,'core/engine-painters')}';`],
  [['OFFICE_SEATS'],                     (f) => `import { OFFICE_SEATS } from '${r2(f, 'core/engine-seats')}';`],
  [['confetti'],                         () => `import confetti from 'canvas-confetti';`],
  [['WallAcUnit','AcMode','createWallAcUnit'], (f) => `import { $ } from '${r2(f,'wall-ac')}';`],
  [['Mezzanine','MEZZ_DECK_Y','createMusholaMezzanine'], (f) => `import { $ } from '${r2(f,'mushola-mezzanine')}';`],
  [['StreetFront','createStreetFront'],  (f) => `import { $ } from '${r2(f,'street-front')}';`],
  [['createIndomaret'],                  (f) => `import { createIndomaret } from '${r2(f,'indomaret')}';`],
  [['createOfficeAnnex'],                (f) => `import { createOfficeAnnex } from '${r2(f,'office-annex')}';`],
];
/** path relatif ke file di bawah engine/, dengan atau tanpa prefiks dir. */
/** Path relatif dari sebuah file engine ke modul lain. Dua kasus berbeda sengaja
 *  dipisah: simbol app (types di src/app/core) TIDAK berada di bawah src/app/engine. */
function r2(fromFile, target) {
  const t = target.endsWith('.ts') ? target : target + '.ts';
  const APP_LEVEL = ['core/models/', 'utils/'];
  const to = APP_LEVEL.some((p) => t.startsWith(p)) ? `src/app/${t}` : `${ENG}/${t}`;
  return rel(fromFile, to);
}
function autoImports(file, text) {
  const out = [];
  for (const [syms, mk] of SYMBOLS) {
    const used = syms.filter((n) => new RegExp(`\\b${n}\\b`).test(text));
    if (!used.length) continue;
    out.push(mk(file).replace('$', used.join(', ')));
  }
  return out;
}

function emit(mod, { imports = [], doc = '', extra = '', methods = null, also = [] } = {}) {
  const f = MODULES[mod].file;
  const ms = methods ?? (plan[mod] || []);
  const deps = [...new Set([...(DEPS[mod] || []), ...also])].filter((d) => d !== mod).sort();
  const bodyText = ms.map((m) => OUT[key(mod, m)]).join('\n') + '\n' + declFor(mod);
  const imp = [...imports];
  if (mod !== 'ctx') imp.push(`import { EngineContext } from '${rel(f, MODULES.ctx.file)}';`);
  for (const d of deps) if (MODULES[d]?.cls && d !== 'ctx') imp.push(`import { ${MODULES[d].cls} } from '${rel(f, MODULES[d].file)}';`);
  for (const a of autoImports(f, (extra || '') + bodyText)) if (!imp.includes(a)) imp.push(a);
  seenImports.set(f, deps);
  files[f] = `${GEN}
import { Injectable${mod === 'ctx' ? '' : ', inject'} } from '@angular/core';
import * as THREE from 'three';
${imp.join('\n')}${imp.length ? '\n' : ''}
${doc}export class ${MODULES[mod].cls} {
${mod === 'ctx' ? '' : `  private readonly ctx = inject(EngineContext);\n${deps.filter((d) => d !== 'ctx').map((d) => `  private readonly ${d} = inject(${MODULES[d].cls});`).join('\n')}${deps.filter((d) => d !== 'ctx').length ? '\n' : ''}`}
${declFor(mod) ? declFor(mod) + '\n\n' : ''}${extra}${ms.map((m) => OUT[key(mod, m)]).join('\n\n')}
}
`;
  files[f] = files[f].replace(/@Injectable\([^)]*\)\n(?=export class)/, "@Injectable()\n");
  if (mod !== 'ctx') files[f] = files[f].replace('export class', "@Injectable()\nexport class");
}

// ── EngineContext: dunia + attach() = bagian konstruktor sebelum subsystem pertama ──
{
  const ctor = bodies.constructor.replace(/^  constructor\(canvas: HTMLCanvasElement, overlay: HTMLElement\) \{/, '').replace(/\}\s*$/, '');
  const cut = ctor.indexOf('this.initLights();');
  const bootCtx = ctor.slice(0, cut).trim();
  MODULES.ctx.bootTail = ctor.slice(cut).trim();
  const f = MODULES.ctx.file;
  files[f] = `${GEN}
import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { AgentData, FeedEvent } from '${r2(f, 'core/models/types')}';
import type { Mezzanine } from '${rel(f, `${ENG}/mushola-mezzanine.ts`)}';
import { PLACEHOLDER_MENU } from './engine-menu-data';

/**
 * Dunia Three.js + jam simulasi. Hanya memuat state yang benar-benar lintas-subsystem:
 * objek fundamental, clock, roster agent, tata letak kursi/waypoint, dan dua registry
 * geometri (monitor menyala + uap kopi) yang ditulis coffee-shop maupun seat-items lalu
 * digerakkan loop animasi. State lain tinggal di service pemiliknya.
 */
@Injectable()
export class EngineContext {
${declFor('ctx')}

  /** Persis isi konstruktor OfficeEngine lama (scene→camera→renderer→controls). */
  attach(canvas: HTMLCanvasElement, overlay: HTMLElement) {
${bootCtx}
  }

${OUT[key('ctx','resize')]}

${OUT[key('ctx','handleResize')]}
}
`;
}

// ────────────────────────────────────────────────────────────
// 4b. Pecah loop animate: blok inline → step(dt) milik modulnya.
//     Dipotong ber-anchor pada badan aslinya, jadi isinya tetap verbatim.
// ────────────────────────────────────────────────────────────
/** Buang baris kosong/komentar yang menempel setelah kurung penutup metode. */
function trimTrailing(t) {
  const l = t.split('\n');
  while (l.length && /^\s*(\/\/.*|\s*)$/.test(l[l.length - 1])) l.pop();
  return l.join('\n');
}
const dedent = (t, n = 2) => t.split('\n').map((l) => l.slice(n)).join('\n');
const A = bodies.animate.split('\n');
const at = (re, from = 0) => { for (let i = from; i < A.length; i++) if (re.test(A[i])) return i; return -1; };
const iTween = at(/if \(this\.tw\) \{/);
const iAgents = at(/this\.agents\.forEach\(\(a\) => \{/);
const iDoor = at(/this\.stepDoor\(dt\);/);
const iBeams = at(/\/\/ Beams/);
const iSeat = at(/\/\/ Screens & steams/);
const iSun = at(/\/\/ Berkas matahari/);
const iDust = at(/this\.stepDust\(dt\);/);
[iTween, iAgents, iDoor, iBeams, iSeat, iSun, iDust].every((i) => i > 0) ||
  fail('anchor loop animate tidak ketemu — struktur sumber berubah, periksa manual');

const SLICES = {
  tween:  A.slice(iTween, at(/this\.controls\.update\(\);/)).join('\n'),
  agents: A.slice(iAgents, iDoor).join('\n'),
  beams:  A.slice(iBeams, iSeat).join('\n'),
  seat:   A.slice(iSeat, iSun).join('\n'),
  sunIn:  A.slice(iSun, iDust).join('\n'),
};
// Tiap potongan: buang sisa komentar/blank di kedua ujung supaya tidak ada yang tertinggal.
for (const k in SLICES) SLICES[k] = trimTrailing(SLICES[k].replace(/\s+$/, ''));

/** step(dt) tiap modul = blok verbatim + indentasi disesuaikan. */
function addStep(mod, name, block, sig = 'dt: number') {
  const body = dedent(block);
  OUT[key(mod, name)] = `  ${name}(${sig}) {\n${applyPatches(trimTrailing(rewrite(body, mod)), mod)}\n  }`;
  (plan[mod] ||= []).push(name);
}
addStep('movement', 'stepAgents', SLICES.agents);
addStep('beam', 'step', SLICES.beams);
addStep('seatItems', 'step', SLICES.seat);
addStep('sun', 'step', SLICES.sunIn);

// animate versi orkestrator: Urutan panggilan identik, hanya blok inline pindah modul.
OUT[key('engine','animate')] = `  animate = () => {
    this.animId = requestAnimationFrame(this.animate);
    const dt = Math.min(this.ctx.clock.getDelta(), 0.05);

${rewrite(SLICES.tween, 'engine')}

    this.ctx.controls.update();

    if (!this.ctx.paused) {
      this.ctx.simMs += dt * 1000 * this.ctx.speed;

      this.movement.stepAgents(dt);

      this.door.stepDoor(dt);
      this.beam.step(dt);
      this.seatItems.step(dt);
      this.sun.step(dt);
      this.sun.stepDust(dt);

      this.ac.updateAc(dt);
    }

    this.pills.updateFloatingPills();
    this.ctx.renderer.render(this.ctx.scene, this.ctx.camera);
  };`;

// ── EngineContext tidak lagi punya `tw`; tween kamera milik orchestrator ──
FIELD_OWNER.tw = 'engine';


emit('tex'); emit('feed'); emit('lighting'); emit('glass'); emit('sun'); emit('street');
emit('ac'); emit('menu'); emit('seatItems'); emit('shop'); emit('mushola'); emit('person');
emit('mezz'); emit('wps'); emit('paths'); emit('door'); emit('movement'); emit('beam'); emit('pills'); emit('sync');

// ────────────────────────────────────────────────────────────
// 5b. Orchestrator = composition root: urutan boot identik dengan konstruktor lama.
// ────────────────────────────────────────────────────────────
emit('engine', {
  also: ['lighting', 'shop', 'street', 'wps', 'ac', 'menu', 'sync', 'feed', 'seatItems', 'paths', 'person', 'tex', 'glass', 'mushola', 'mezz', 'pills', 'beam', 'movement', 'door'],
  doc: `/**
 * Composition root engine 3D kantor. Urutan pembangunannya IDENTIK dengan
 * konstruktor OfficeEngine lama (lights → coffee shop → street → AC → waypoints →
 * resize → listener), karena urutan itu menentukan objek mana yang sudah ada saat
 * subsystem berikutnya membangun dirinya.
 */
`,
  extra: `  /** Dipanggil CanvasStageComponent setelah canvas & overlay siap. */
  attach(canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.ctx.attach(canvas, overlay);
    this.lighting.initLights();
    this.shop.initOfficeEnvironment();
    this.street.initStreetFront();
    this.ac.initWallAc();
    this.wps.initWaypoints();
    this.ctx.resize();
    window.addEventListener('resize', this.ctx.handleResize);
    canvas.addEventListener('pointerdown', () => { this.tw = null; });
  }

  /** Hook yang dulu property publik OfficeEngine; UI Angular memasangnya di sini. */
  set hooks(h: { onStateChange?: () => void; onLiveMessage?: (m: string) => void; onToast?: (m: string) => void }) {
    if (h.onStateChange !== undefined) this.ctx.onStateChange = h.onStateChange;
    if (h.onLiveMessage !== undefined) this.ctx.onLiveMessage = h.onLiveMessage;
    if (h.onToast !== undefined) this.ctx.onToast = h.onToast;
  }

  // ──────────────────────────────────────────────────────────
  // Permukaan publik — SAMA seperti kelas OfficeEngine lama, supaya pemanggil Angular
  // tidak perlu tahu ada 20 service di belakangnya.
  // ──────────────────────────────────────────────────────────
  get agents(): AgentData[] { return this.ctx.agents; }
  get events(): FeedEvent[] { return this.feed.events; }
  get simMs(): number { return this.ctx.simMs; }
  get paused(): boolean { return this.ctx.paused; }
  set paused(v: boolean) { this.ctx.paused = v; }
  get speed(): number { return this.ctx.speed; }
  set speed(v: number) { this.ctx.speed = v; }
  get labelsOn(): boolean { return this.ctx.labelsOn; }
  set labelsOn(v: boolean) { this.ctx.labelsOn = v; }

  syncRealSessions(sessions: Session[]): void { this.sync.syncRealSessions(sessions); }
  handleRealToolCall(tc: ToolCall): void { this.sync.handleRealToolCall(tc); }
  handleSubagentSpawn(sub: Session): void { this.sync.handleSubagentSpawn(sub); }
  setMenuBoard(rows: MenuBoardRow[]): void { this.menu.setMenuBoard(rows); }
  setAcMode(mode: AcMode): void { this.ac.setAcMode(mode); }
  startExit(a: AgentData): void { this.paths.startExit(a); }
  burst(): void { this.beam.burst(); }

`,
});

// ────────────────────────────────────────────────────────────
// ── top-level helpers ──
const byName = Object.fromEntries(tops.map((t) => [t.name, t.text]));
const topFiles = {};
for (const [n, file] of Object.entries(TOP_OWNER)) {
  (topFiles[`${ENG}/${file}`] ||= []).push(n);
}
for (const [f, names] of Object.entries(topFiles)) {
  const body = names.map((n) => {
    let t = byName[n];
    // cari baris deklarasi pertama — `export function …` juga deklarasi, jadi pola-nya
    // harus menerima kedua bentuk; kalau tidak, findIndex melompat ke `const` di DALAM
    // badan fungsi dan export nyasar ke sana.
    const ls = t.split('\n');
    const di = ls.findIndex((x) => /^\s*(?:export\s+)?(?:const|let|function|type|interface)\b/.test(x));
    if (di < 0 || /^\s*export\s/.test(ls[di])) return t;
    ls[di] = ls[di].replace(/^(\s*)(const|let|function|type|interface)\b/, '$1export $2');
    return ls.join('\n');
  }).join('\n\n');
  const head = '';
  files[f] = `${GEN}\n${head ? head + '\n' : ''}\n${body}\n`;
}


console.log(`${ALL.length} metode · ${fields.length} field · ${Object.keys(plan).length} modul\n`);
for (const [mod, ms] of Object.entries(plan)) {
  const d = [...(DEPS[mod] || [])].filter((x) => x !== 'ctx').join(', ');
  const nf = fields.filter((x) => FIELD_OWNER[x.name] === mod).length;
  console.log(`  ${(MODULES[mod].cls || mod).padEnd(22)} ${String(ms.length).padStart(2)} metode ${String(nf).padStart(2)} field  ${d ? '← ' + d : ''}`);
}
if (!WRITE) { console.log('\n[--print] tidak ada file ditulis'); process.exit(0); }
for (const [f, body] of Object.entries(files)) {
  const p = path.join(ROOT, 'dashboard', f);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}
console.log(`\n✓ ${Object.keys(files).length} file ditulis`);
for (const f of Object.keys(files).sort()) console.log('   ', f);
