import http from 'node:http';
import { WebSocket } from 'ws';
import { createOfficeServer } from '../server/src/server.js';
import fs from 'node:fs';

const TEST_DB = '/tmp/test_office.db';
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

const PORT = 4318;
const { server, db, hub } = createOfficeServer({ dbPath: TEST_DB });

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`🧪 [TEST E2E] Test server aktif di port ${PORT}`);

  try {
    // 1. Tes WebSocket Connection
    const wsReceived = [];
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);

    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });
    console.log('✅ 1. WebSocket terhubung');

    ws.on('message', (data) => {
      wsReceived.push(JSON.parse(data.toString()));
    });

    // 2. Kirim event session.register via HTTP POST
    const sessionPayload = {
      type: 'session.register',
      payload: {
        session_id: 'sesi_test_001',
        name: 'Budi Santoso',
        role: 'Backend Lead · API & Microservices',
        avatar: '🧔',
        color: '#6366f1',
        task: 'Refactoring WebSocket broadcaster',
        model: 'gemini-2.5-pro',
        machine_id: 'machine_test_001',
        machine_name: 'Laptop Test Rizoa',
        orca_name: 'Orca Dev',
        client_kind: 'pi'
      }
    };

    await postEvent(PORT, sessionPayload);
    console.log('✅ 2. HTTP POST session.register terkirim');

    // 3. Verifikasi SQLite
    await sleep(200);
    const session = db.getSession('sesi_test_001');
    if (!session || session.name !== 'Budi Santoso') {
      throw new Error(`Gagal verifikasi SQLite: ${JSON.stringify(session)}`);
    }
    if (session.machine_name !== 'Laptop Test Rizoa' || session.orca_name !== 'Orca Dev') {
      throw new Error(`Gagal verifikasi identity device: ${JSON.stringify(session)}`);
    }
    console.log(`✅ 3. SQLite menyimpan sesi: ${session.name} (${session.task}) @ ${session.machine_name}`);

    // 4. Kirim event team.register (Sub-Agent spawn)
    const subagentPayload = {
      type: 'team.register',
      payload: {
        subagent_id: 'sub_test_002',
        parent_session_id: 'sesi_test_001',
        name: 'Citra (Sub-Agent)',
        role: 'Unit Test Generator',
        avatar: '🤖',
        color: '#c084fc',
        task: 'Generate E2E regression tests'
      }
    };
    await postEvent(PORT, subagentPayload);
    console.log('✅ 4. HTTP POST team.register (Sub-Agent) terkirim');

    // 5. Kirim event tool.call & tool.result
    const toolCallPayload = {
      type: 'tool.call',
      payload: {
        call_id: 'tc_999',
        session_id: 'sesi_test_001',
        tool_name: 'bash',
        input: { command: 'npm test' }
      }
    };
    await postEvent(PORT, toolCallPayload);

    const toolResultPayload = {
      type: 'tool.result',
      payload: {
        call_id: 'tc_999',
        session_id: 'sesi_test_001',
        tool_name: 'bash',
        result: 'All 15 tests passed',
        is_error: false,
        duration_ms: 120
      }
    };
    await postEvent(PORT, toolResultPayload);
    console.log('✅ 5. Tool call & result terkirim');

    // 6. Verifikasi WebSocket Broadcast
    await sleep(300);
    const eventTypes = wsReceived.map(e => e.type);
    console.log('📡 Event diterima WebSocket client:', eventTypes);

    if (!eventTypes.includes('session_registered')) throw new Error('Missing session_registered in WS');
    if (!eventTypes.includes('team_spawned')) throw new Error('Missing team_spawned in WS');
    if (!eventTypes.includes('tool_called')) throw new Error('Missing tool_called in WS');
    if (!eventTypes.includes('tool_completed')) throw new Error('Missing tool_completed in WS');

    console.log('✅ 6. Seluruh event berhasil di-broadcast via WebSocket');

    // 7. Verifikasi REST /api/state
    const state = await getJson(PORT, '/api/state');
    if (state.sessions.length < 2) throw new Error('State sessions kurang dari 2');
    console.log(`✅ 7. REST /api/state mengembalikan ${state.sessions.length} sesi aktif dan ${state.recent_tool_calls.length} tool calls`);

    // 8. Tagihan: session.usage -> usage_events -> /api/billing (per tamu & per menu)
    await postEvent(PORT, {
      type: 'session.usage',
      payload: {
        session_id: 'sesi_test_001',
        model: 'semut/qwen3.8-flash:free',
        provider: '9router',
        input: 1000,
        output: 200,
        cache_read: 50,
        total_tokens: 1250,
        reported_cost: 0,
        dedupe_key: 'e2e_first'
      }
    });
    await sleep(200);

    const bill = await getJson(PORT, '/api/billing');
    const guest = bill.users.find((u) => u.sessionId === 'sesi_test_001');
    if (!guest) throw new Error('Tagihan tidak memuat sesi test');
    if (guest.totalTokens !== 1250) throw new Error(`Token tertagih salah: ${guest.totalTokens}`);
    if (!['table', 'feed', 'reported', 'none'].includes(guest.lines[0].costSource)) {
      throw new Error(`costSource tidak dikenal: ${guest.lines[0].costSource}`);
    }
    if (!bill.menu.some((m) => m.model === 'semut/qwen3.8-flash:free')) {
      throw new Error('Papan menu tidak memuat model yang dipakai');
    }
    if (!wsReceived.some((p) => p.type === 'usage_recorded')) {
      throw new Error('usage_recorded tidak ter-broadcast via WebSocket');
    }
    console.log(`✅ 8. Tagihan per tamu & menu teragregasi (${guest.totalTokens} tok, sumber harga: ${guest.lines[0].costSource})`);

    // 9. Backfill boleh dijalankan ulang: dedupe_key mencegah struk ganda.
    await postEvent(PORT, {
      type: 'session.usage',
      payload: {
        session_id: 'sesi_test_001',
        model: 'semut/qwen3.8-flash:free',
        input: 1000,
        output: 200,
        cache_read: 50,
        total_tokens: 1250,
        dedupe_key: 'e2e_first'
      }
    });
    await sleep(200);
    const replay = await getJson(PORT, '/api/billing');
    const replayed = replay.users.find((u) => u.sessionId === 'sesi_test_001');
    if (replayed.totalTokens !== 1250) {
      throw new Error(`dedupe_key gagal mencegah struk ganda: ${replayed.totalTokens} token`);
    }
    console.log('✅ 9. dedupe_key menahan replay backfill (token tidak berlipat)');

    console.log('\n🎉 [HASIL] SEMUA 9 PENGUJIAN E2E BERHASIL!');
    ws.close();
    hub.close();
    server.close(() => process.exit(0));
  } catch (err) {
    console.error('❌ [TEST GAGAL]:', err.message);
    process.exit(1);
  }
});

function postEvent(port, data) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/event',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      res.on('data', () => {});
      res.on('end', resolve);
    });
    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

function getJson(port, path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
