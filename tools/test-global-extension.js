// Verify the generated global extension: cloud endpoint, bearer auth, machine identity,
// and — the point of the whole file — that no tool body or secret survives redaction.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TARGET = process.argv[2]
  || path.join(process.env.HOME || os.homedir(), '.pi', 'agent', 'extensions', 'pi-office.ts');

assert.ok(fs.existsSync(TARGET), `extension tidak ada: ${TARGET}`);

const posted = [];
globalThis.fetch = async (url, init) => {
  posted.push({ url: String(url), init });
  return new Response(JSON.stringify({ received: true }), { status: 200 });
};

const { default: officeExtension } = await import(`file://${TARGET}`);

const hooks = new Map();
const pi = {
  on: (name, fn) => hooks.set(name, fn),
  registerTool: () => {},
  getSessionName: () => 'test-session',
  setSessionName: () => {},
};
officeExtension(pi);

const SECRET_JWT = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.abcdef.ghijklmnop';
const ctx = { cwd: '/home/rizoa/BUSINESS/IKAMAI/orca', sessionManager: { getSessionId: () => '01a07b50-test-0001' }, model: { id: 'gpt-5' } };

await hooks.get('session_start')({}, ctx);
await hooks.get('before_agent_start')({ prompt: `baca config lalu set TURSO_AUTH_TOKEN=${SECRET_JWT}` }, ctx);
await hooks.get('tool_call')({
  toolName: 'bash',
  toolCallId: 'tc1',
  input: { command: `cat /home/rizoa/.pi/office/cloud.env && export KEY=${SECRET_JWT}`, timeout: 30, hidden: 'should-be-dropped' },
}, ctx);
await hooks.get('tool_result')({
  toolName: 'bash',
  toolCallId: 'tc1',
  details: `OFFICE_TOKEN=${SECRET_JWT}\nprivate output of the command`,
  isError: false,
}, ctx);
await hooks.get('agent_end')({}, ctx);

const events = posted.map((p) => JSON.parse(p.init.body));
const byType = (type) => events.filter((e) => e.type === type);

for (const event of events) {
  assert.equal(event.payload.session_id, '01a07b50-test-0001', 'session_id harus konsisten');
}

// 1. target + auth
const endpoint = new URL(posted[0].url);
assert.equal(endpoint.pathname, '/api/event');
assert.notEqual(endpoint.hostname, '127.0.0.1', 'harusnya tidak lagi ke loopback');
assert.match(endpoint.hostname, /workers\.dev|localhost|127\.0\.0\.1/, `host tak terduga: ${endpoint.hostname}`);
const authHeader = posted[0].init.headers.Authorization || posted[0].init.headers.authorization;
assert.ok(authHeader?.startsWith('Bearer '), 'token bearer harus terkirim');

// 2. machine identity
const register = byType('session.register')[0];
assert.ok(register.payload.machine_id?.startsWith('office-machine-'), 'machine_id hilang');
assert.ok(register.payload.machine_name, 'machine_name hilang');
assert.equal(register.payload.client_kind, 'pi');

// 3. tool.call is summarized, not shipped whole
const toolCall = byType('tool.call')[0];
assert.equal(typeof toolCall.payload.input, 'object');
assert.ok(!('hidden' in toolCall.payload.input), 'key di luar allowlist tidak boleh ikut');
assert.ok(Array.isArray(toolCall.payload.input._omitted), 'field yang dibuang harus terlihat sebagai _omitted');
assert.ok(toolCall.payload.input.command.length < 200, 'command tidak dipotong');

// 4. tool.result never carries a body
const toolResult = byType('tool.result')[0];
assert.ok(!('result' in toolResult.payload), 'result body masih terkirim!');
assert.ok(!('details' in toolResult.payload), 'details masih terkirim!');
assert.equal(typeof toolResult.payload.output_chars, 'number');
assert.equal(toolResult.payload.is_error, false);

// 5. no secret anywhere in what left the machine
const wire = JSON.stringify(events);
assert.ok(!wire.includes(SECRET_JWT), 'RAHASIA BOCOR ke telemetry');
assert.ok(!wire.includes('private output of the command'), 'output tool bocor ke telemetry');
assert.ok(!/TURSO_AUTH_TOKEN=[A-Za-z0-9._-]{10,}/.test(wire), 'assignment secret bocor');

console.log(`✅ ${path.basename(TARGET)} — ${events.length} event, endpoint ${endpoint.origin}`);
console.log('   identity   :', register.payload.machine_name, '/', register.payload.client_kind);
console.log('   tool.call  :', JSON.stringify(toolCall.payload.input));
console.log('   tool.result:', JSON.stringify({ output_chars: toolResult.payload.output_chars, is_error: toolResult.payload.is_error }));
console.log('   redaksi    : secret & body tool tidak keluar dari mesin ✅');
