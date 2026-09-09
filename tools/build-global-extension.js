// Bundle the office extension into one self-contained global Pi extension.
//
// Why: Pi auto-loads `~/.pi/agent/extensions/*.ts` as single files. The canonical
// source is split into modules under ./extension, so every `pi` session — in any
// folder, on any machine — needs those modules flattened into one installable file.
// Emitting it from source keeps global and repo copy from drifting apart.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, 'extension');

// Modules that live outside ./extension but are shared with the server and the
// maintenance scripts. They must be inlined here too: the bundle is a single file
// that Pi loads on its own, so a relative import out of ./extension would dangle.
const SHARED = ['lib/session-utils.ts'];

// Dependency order: leaf modules first, the Pi hook wiring last. Module-scope consts
// (client.ts resolves endpoint/token at load) must not reference a later declaration.
const MODULES = [
  'redact.ts',
  'config.ts',
  'identity.ts',
  'client.ts',
  'indonesian-names.ts',
  'index.ts'
];

const REPO_BUNDLE = path.join(ROOT, 'extensions-global', 'pi-office.ts');
// Publishable pi-package: `pi install npm:@rizoadev/pi-office` unpacks to
// ~/.pi/agent/npm/... and loads ./pi-office.ts from there. The bundle is emitted here too so
// the tarball is always exactly the code that runs on this machine.
const PACKAGE_DIR = path.join(ROOT, 'packaging', 'pi-office');
const PACKAGE_BUNDLE = path.join(PACKAGE_DIR, 'pi-office.ts');
const ENTRY_EXPORT = 'export default function (pi: any) {';
const GUARD = `// Stand down when a project ships its own copy of this extension, so Pi never
// registers office_set_task twice or double-posts one session.
function hasProjectLocalOfficeExtension(): boolean {
  try {
    let dir = path.resolve(process.cwd());
    while (true) {
      for (const name of ['index.ts', 'index.js']) {
        if (fs.existsSync(path.join(dir, '.pi', 'extensions', 'pi-office', name))) return true;
      }
      const parent = path.dirname(dir);
      if (parent === dir) return false;
      dir = parent;
    }
  } catch {
    return false;
  }
}
// Same problem across install methods: a machine can carry the file-based global copy
// (~/.pi/agent/extensions/pi-office.ts) AND a packaged copy (npm: install, git: clone, or a
// local path) at the same time. Pi loads both into one process, so the LLM would see two
// office_set_task tools and the office would get every event twice.
//
// Deliberately NOT a globalThis "already loaded" marker: that breaks /reload, which
// re-evaluates the module in the same process — the reloaded copy would see its own stale
// marker and stand down, killing telemetry silently until restart. Resolve the conflict from
// disk state instead, identical on first load and on reload: the explicit file copy wins,
// because it is the one npm run sync:extension publishes from source. A fresh laptop has no
// file copy, so the package is the only instance and loads normally.
function officeExtensionShouldDeferToOtherCopy(): boolean {
  try {
    const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
    const fileCopy = path.join(home, '.pi', 'agent', 'extensions', 'pi-office.ts');
    const self = new URL(import.meta.url).pathname;
    if (path.resolve(self) === path.resolve(fileCopy)) return false;
    if (!fs.existsSync(fileCopy)) return false;
    process.stderr.write('[pi-office] salinan global di ' + fileCopy + ' menang; salinan ini dilewati.\\n');
    return true;
  } catch {
    // Fail-safe: if identity cannot be resolved, load normally rather than vanish silently.
    return false;
  }
}
`;

function installTarget() {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.pi', 'agent', 'extensions', 'pi-office.ts');
}

/** Flatten one module: drop relative imports, keep bare ones for dedupe, un-export. */
function transform(source, file) {
  const bareImports = new Set();
  // Collapse multi-line `import {\n  a,\n  b,\n} from 'x'` into one line first — the
  // line-based matcher below only recognizes a complete import on a single line, and a
  // leftover `import {` would be emitted into the bundle as a syntax error.
  source = source.replace(
    /^import\s*\{([^}]*)\}\s*from\s*(['"][^'"]+['"]);?\s*$/gm,
    (_m, names, specifier) => `import { ${names.replace(/\s+/g, ' ').trim()} } from ${specifier};`
  );
  const lines = source.split('\n');
  const body = [];

  for (const line of lines) {
    const importMatch = line.match(/^import\s+(.+?)\s+from\s+['"](.+?)['"];?\s*$/);
    if (importMatch) {
      const [, , specifier] = importMatch;
      if (specifier.startsWith('.') || specifier.startsWith('/')) continue;
      bareImports.add(line);
      continue;
    }
    if (/^import\s+['"]/.test(line)) continue;

    if (line.trim() === ENTRY_EXPORT) {
      body.push('function officeExtension(pi: any) {');
      body.push('  if (hasProjectLocalOfficeExtension() || officeExtensionShouldDeferToOtherCopy()) return;');
      continue;
    }

    body.push(line.replace(/^export\s+(default\s+)?(?=(const|let|var|function|class|interface|type)\b)/, ''));
  }

  if (body.some((line) => /^\s{0,2}(export\s+)?default\b/.test(line) && !line.includes('officeExtension'))) {
    throw new Error(`${file}: only index.ts may hold a default export`);
  }

  return { code: body.join('\n').trim(), bareImports };
}

function topLevelNames(code, file) {
  const found = [];
  for (const match of code.matchAll(/^(?:function|const|let|var|class|interface|type)\s+([A-Za-z0-9_$]+)/gm)) {
    found.push({ name: match[1], file });
  }
  return found;
}

function readPackageManifest() {
  try {
    return JSON.parse(fs.readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

function build() {
  const bareImports = new Set();
  const chunks = [];
  const declarations = [];

  // Shared modules first — they are leaves, nothing in the bundle depends on order.
  for (const rel of SHARED) {
    const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const { code, bareImports: imports } = transform(source, rel);
    for (const line of imports) bareImports.add(line);
    declarations.push(...topLevelNames(code, rel));
    chunks.push(`// \u2500\u2500\u2500 ${rel} ${'\u2500'.repeat(Math.max(0, 62 - rel.length))}\n${code}`);
  }

  for (const file of MODULES) {
    const source = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
    const { code, bareImports: imports } = transform(source, file);
    for (const line of imports) bareImports.add(line);
    declarations.push(...topLevelNames(code, file));
    chunks.push(`// ─── ${file} ${'─'.repeat(Math.max(0, 62 - file.length))}\n${code}`);
  }

  const seen = new Map();
  for (const { name, file } of declarations) {
    if (seen.has(name)) {
      throw new Error(`Duplicate top-level "${name}" in ${file.ts ?? file} and ${seen.get(name)} — rename before bundling.`);
    }
    seen.set(name, file);
  }

  const manifest = readPackageManifest();
  const version = manifest?.version ?? '0.0.0-dev';
  const banner = `// GENERATED by tools/build-global-extension.js — do not edit here.
// Source of truth: extension/*.ts + lib/session-utils.ts   Rebuild: npm run sync:extension
//
// Office Extension — global Pi telemetry bridge to the ORCA24 office hub.
// Sends machine identity, and redacts tool payloads whenever the hub is not loopback.
// Install on another machine: pi install npm:@rizoadev/pi-office

export const OFFICE_EXTENSION_VERSION = '${version}';
`;

  return `${banner}${[...bareImports].sort().join('\n')}\n\n${GUARD}\n${chunks.join('\n\n')}\n\nexport default officeExtension;\n`;
}

const out = build();
const lines = out.split('\n').length;

fs.mkdirSync(path.dirname(REPO_BUNDLE), { recursive: true });
fs.writeFileSync(REPO_BUNDLE, out);
console.log(`✅ Bundle repo     → ${REPO_BUNDLE} (${lines} baris)`);

// Tarball content: `pi install npm:@rizoadev/pi-office` memuat berkas ini, bukan
// extensions-global/. Ditulis dalam run yang sama supaya keduanya tidak pernah beda.
fs.mkdirSync(PACKAGE_DIR, { recursive: true });
fs.writeFileSync(PACKAGE_BUNDLE, out);
console.log(`✅ Bundle paket    → ${PACKAGE_BUNDLE}`);

// --install: publish to the live Pi global extension dir. Backups go to
// ~/.pi/office/.backup/, never next to the extension — Pi scans that folder for *.ts.
if (process.argv.includes('--install')) {
  const target = installTarget();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    const backupDir = path.join(ROOT, '.backup');
    fs.mkdirSync(backupDir, { recursive: true });
    const backup = path.join(backupDir, `pi-office.ts.${Date.now()}`);
    fs.copyFileSync(target, backup);
    console.log(`🗄️  backup lama    → ${backup}`);
  }
  fs.writeFileSync(target, out);
  console.log(`✅ Terpasang global → ${target}`);
}
