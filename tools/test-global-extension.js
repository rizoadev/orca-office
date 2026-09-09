// Verify the generated bundle. Deterministic by design: HOME points at a temp dir, so the
// test exercises the PACKAGED defaults instead of whatever ~/.pi/office/config.json the
// developer happens to have right now — that coupling is what made this suite red/green at
// random. Cases: fresh machine (cloud default, no token), token from env, /office connect,
// and the install-method conflict guard.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = process.env.PI_OFFICE_REPO || path.resolve(import.meta.dirname, '..');
const TARGET = process.argv[2] || path.join(REPO, 'packaging', 'pi-office', 'pi-office.ts');
const DEFAULT_CLOUD = 'https://pi-office.hanirizo.workers.dev/api/event';

assert.ok(fs.existsSync(TARGET), `extension tidak ada: ${TARGET}`);

const SECRET_JWT = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.abcdef.ghijklmnop';
const CWD = '/home/rizoa/BUSINESS/IKAMAI/orca';

/**
 * Load an independent instance of the bundle under a clean HOME.
 * Copied to a unique filename because Pi/jiti cache modules by path, and module-scope
 * consts (endpoint, token) are resolved exactly once per instance — which is the behavior
 * under test.
 */
async function loadBundle({ tag, token, machineName }) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `pi-office-${tag}-`));
  const previousHome = process.env.HOME;
  process.env.HOME = home;
  delete process.env.OFFICE_ENDPOINT;
  delete process.env.OFFICE_TOKEN;
  delete process.env.OFFICE_MACHINE_ID_FILE;
  if (token) process.env.OFFICE_TOKEN = token;
  if (machineName) process.env.OFFICE_MACHINE_NAME = machineName;

  const copy = path.join(home, `pi-office-${tag}.ts`);
  fs.copyFileSync(TARGET, copy);

  const posted = [];
  globalThis.fetch = async (url, init) => {
    posted.push({ url: String(url), init });
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  };

  const notified = [];
  const hooks = new Map();
  const commands = new Map();
  const tools = new Set();
  const pi = {
    on: (name, fn) => hooks.set(name, fn),
    registerTool: (t) => tools.add(t.name),
    registerCommand: (name, def) => commands.set(name, def),
    getSessionName: () => 'test-session',
    setSessionName: () => {},
  };

  const mod = await import(`file://${copy}`);
  mod.default(pi);
  process.env.HOME = previousHome;

  const ctx = {
    cwd: CWD,
    mode: 'tui',
    sessionManager: { getSessionId: () => '01a07b50-test-0001' },
    model: { id: 'gpt-5' },
    ui: { notify: (text, level) => notified.push({ text, level }) },
  };

  return { mod, copy, posted, notified, hooks, commands, tools, ctx, home };
}

/** The full telemetry walk: register → prompt → tool call → tool result → idle. */
async function driveTelemetry(bundle) {
  const { hooks, ctx } = bundle;
  await hooks.get('session_start')({}, ctx);
  await hooks.get('before_agent_start')({ prompt: `baca config lalu set TURSO_AUTH_TOKEN=${SECRET_JWT}` }, ctx);
  await hooks.get('tool_call')({
    toolName: 'bash',
    toolCallId: 'tc1',
    input: { command: `cat /etc/passwd && export KEY=${SECRET_JWT}`, timeout: 30, hidden: 'should-be-dropped' },
  }, ctx);
  await hooks.get('tool_result')({
    toolName: 'bash',
    toolCallId: 'tc1',
    details: `OFFICE_TOKEN=${SECRET_JWT}\nprivate output of the command`,
    isError: false,
  }, ctx);
  await hooks.get('agent_end')({}, ctx);
  return bundle.posted.map((p) => ({ url: String(p.url), headers: p.init.headers, body: JSON.parse(p.init.body) }));
}

const byType = (wire, type) => wire.find((e) => e.body.type === type).body.payload;

// ── 1. Mesin baru: tanpa config.json, tanpa token ─────────────────────
const fresh = await loadBundle({ tag: 'fresh' });
const freshWire = await driveTelemetry(fresh);

assert.equal(`${new URL(freshWire[0].url).origin}/api/event`, DEFAULT_CLOUD, 'mesin baru harus mengirim ke worker cloud');
assert.ok(!freshWire[0].headers.Authorization, 'tanpa token tidak boleh ada header Authorization');
const hints = fresh.notified.filter((n) => /\/office connect/.test(n.text));
assert.equal(hints.length, 1, 'hint /office connect harus muncul tepat sekali');
assert.ok(fresh.tools.has('office_set_task') && fresh.tools.has('office_announce'), 'custom tools tidak terdaftar');
assert.ok(fresh.commands.has('office'), '/office harus terdaftar');

// ── 2. Mesin terdaftar: token dari env, payload wajib tersensor ───────
const authed = await loadBundle({ tag: 'authed', token: 'test-ingest-token', machineName: 'laptop-uji' });
const wire = await driveTelemetry(authed);

for (const event of wire) {
  assert.equal(event.headers.Authorization, 'Bearer test-ingest-token', 'bearer token harus terkirim');
  assert.equal(event.body.payload.session_id, '01a07b50-test-0001', 'session_id harus konsisten');
}

const register = byType(wire, 'session.register');
assert.ok(register.machine_id?.startsWith('office-machine-'), 'machine_id hilang');
assert.equal(register.machine_name, 'laptop-uji');
assert.equal(register.client_kind, 'pi');
process.env.HOME = authed.home;
assert.ok(fs.existsSync(path.join(authed.home, '.pi', 'office', 'machine-id')), 'machine-id harus dibuat sendiri');

const toolCall = byType(wire, 'tool.call');
assert.ok(!('hidden' in toolCall.input), 'field di luar allowlist tidak boleh ikut');
assert.ok(Array.isArray(toolCall.input._omitted), 'field yang dibuang harus terlihat sebagai _omitted');
assert.ok(toolCall.input.command.length < 200, 'command tidak dipotong');

const toolResult = byType(wire, 'tool.result');
assert.ok(!('result' in toolResult) && !('details' in toolResult), 'body hasil tool masih terkirim!');
assert.equal(typeof toolResult.output_chars, 'number');
assert.equal(toolResult.is_error, false);

const serialized = JSON.stringify(wire.map((w) => w.body));
assert.ok(!serialized.includes(SECRET_JWT), 'RAHASIA BOCOR ke telemetry');
assert.ok(!serialized.includes('private output of the command'), 'output tool bocor ke telemetry');
assert.ok(!/TURSO_AUTH_TOKEN=[A-Za-z0-9._-]{10,}/.test(serialized), 'assignment secret bocor');
assert.ok(!serialized.includes(authed.home), 'path HOME temp bocor ke telemetry');

// ── 3. /office connect: simpan config 0600, langsung dipakai (tanpa restart) ──
const office = authed.commands.get('office');
await office.handler('connect https://office.example/api/event secret-dari-command', authed.ctx);
const configFile = path.join(authed.home, '.pi', 'office', 'config.json');
const saved = JSON.parse(fs.readFileSync(configFile, 'utf8'));
assert.equal(saved.token, 'secret-dari-command');
assert.equal(saved.endpoint, 'https://office.example/api/event');
assert.equal(saved.enabled, true);
if (process.platform !== 'win32') {
  assert.equal(fs.statSync(configFile).mode & 0o777, 0o600, 'config.json harus 0600 — isinya token');
}

// client.ts caches endpoint at module load; refreshOfficeConfig() is what makes a connect
// land in the running session. Assert it, or a regression silently re-adds the restart step.
authed.posted.length = 0;
await office.handler('url https://office.example/api/event', authed.ctx);
await office.handler('test', authed.ctx);
const probe = authed.posted.at(-1);
assert.equal(new URL(String(probe.url)).origin, 'https://office.example', 'endpoint baru harus dipakai tanpa restart');

// /office off must actually silence telemetry
authed.posted.length = 0;
await office.handler('off', authed.ctx);
await authed.hooks.get('agent_end')({}, authed.ctx);
assert.equal(authed.posted.length, 0, 'enabled:false harus menghentikan telemetry');
await office.handler('on', authed.ctx);

// ── 4. Guard & stamp yang tidak bisa diuji lewat runtime ──────────────
const src = fs.readFileSync(TARGET, 'utf8');
assert.match(src, /officeExtensionShouldDeferToOtherCopy\(\)/, 'guard bentrok install-method hilang');
assert.doesNotMatch(src, /globalThis\[.__PI_OFFICE/, 'guard globalThis terlarang: /reload akan mematikan telemetry');
assert.match(src, /export const OFFICE_EXTENSION_VERSION = '\d+\.\d+\.\d+';/, 'version stamp hilang');
assert.doesNotMatch(src, /import .* from '\.\.\//, 'bundle tidak boleh punya import relatif keluar dir');

console.log(`✅ ${path.basename(path.dirname(TARGET))}/${path.basename(TARGET)} — ${wire.length} event terverifikasi`);
console.log('   cloud default :', DEFAULT_CLOUD);
console.log('   authed        : bearer + redaksi aktif, secret & body tool tidak keluar mesin ✅');
console.log('   /office       : status | connect | url | local | cloud | on | off | test');
console.log('   versi paket   :', authed.mod.OFFICE_EXTENSION_VERSION);
