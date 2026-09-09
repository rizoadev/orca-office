import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { createOfficeServer, enforceTelemetryPolicy } from '../server/src/server.js';
import fs from 'node:fs';

// DB test lewat driver yang sama dengan produksi: libSQL `file:` (bukan node:sqlite),
// jadi yang teruji adalah kode yang benar-benar jalan — bukan jalur kedua yang bisa basi.
const TEST_DB = process.env.OFFICE_TEST_DB || '/tmp/office-e2e-test.db';
for (const suffix of ['', '-wal', '-shm']) {
  if (fs.existsSync(TEST_DB + suffix)) fs.unlinkSync(TEST_DB + suffix);
}

const PORT = 4318;
const { server, db, hub } = createOfficeServer({ dbPath: TEST_DB });
// Schema + backfill selesai sebelum port buka (kontrak yang sama dengan index.js).

server.listen(PORT, '127.0.0.1', async () => {
  await db.ready();
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
    const session = await db.getSession('sesi_test_001');
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

    // 5b. Klien remote meredaksi body tool dan hanya mengirim output_chars. Feed harus
    // tetap bisa membedakan "selesai" dari "masih berjalan" tanpa isi hasilnya.
    await postEvent(PORT, { type: 'tool.call', payload: { call_id: 'tc_redacted', session_id: 'sesi_test_001', tool_name: 'bash', input: { command: 'cat .env', _omitted: ['content'] } } });
    await postEvent(PORT, { type: 'tool.result', payload: { call_id: 'tc_redacted', session_id: 'sesi_test_001', tool_name: 'bash', output_chars: 4096, is_error: false, duration_ms: 5 } });
    await sleep(200);
    const redactedTc = (await db.getRecentToolCalls(10)).find((x) => x.id === 'tc_redacted');
    if (!redactedTc?.result_json || !redactedTc.result_json.includes('redacted')) {
      throw new Error(`tool.result terredaksi tidak ditandai selesai: ${JSON.stringify(redactedTc)}`);
    }
    if (!redactedTc.result_json.includes('4096')) throw new Error('output_chars tidak tersimpan');
    console.log('✅ 5b. Result terredaksi tetap terbaca "selesai" + output_chars tersimpan');

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

    // 10. Reaper tidak boleh menyentuh mesin lain. Satu kantor kini berbagi satu DB,
    // sementara /proc/<pid> hanyalah milik mesin tempat hub berjalan.
    if (fs.existsSync('/proc')) {
      const GHOST_PID = 999999;   // tidak ada prosesnya, di mesin mana pun
      const LOCAL_MACHINE = 'e2e-mesin-lokal';
      const FOREIGN_MACHINE = 'e2e-mesin-orang-lain';
      process.env.OFFICE_MACHINE_ID = LOCAL_MACHINE;

      for (const [id, machine] of [['e2e_dead_local', LOCAL_MACHINE], ['e2e_dead_foreign', FOREIGN_MACHINE]]) {
        await db.upsertSession({
          id, name: id, role: 'Tester', avatar: '🧪', color: '#22c55e',
          cwd: '/tmp', model: 'test', pid: GHOST_PID, task: 'e2e reap', machine_id: machine,
        });
      }

      const reaped = await db.reapDeadSessions();
      const reapedIds = reaped.map((r) => r.id).sort();
      if (!reapedIds.includes('e2e_dead_local')) {
        throw new Error('reaper gagal membersihkan sesi proses mati milik mesin sendiri');
      }
      if (reapedIds.includes('e2e_dead_foreign')) {
        throw new Error('🔴 REAPER MEMATIKAN SESI MILIK MESIN LAIN — pid mesin lain tidak ada di /proc lokal');
      }
      const foreign = await db.getSession('e2e_dead_foreign');
      if (foreign?.status === 'offline') {
        throw new Error('🔴 Sesi mesin lain ikut di-offline-kan oleh hub lokal');
      }
      console.log(`✅ 10. reaper terbatas ke mesin ini (${reapedIds.join(', ')}); sesi mesin lain aman`);

      // Tanpa identitas mesin, reaper harus menyerah — bukan menebak.
      delete process.env.OFFICE_MACHINE_ID;
      process.env.OFFICE_MACHINE_ID_FILE = '/tmp/office-e2e-tidak-ada';
      const blind = await db.reapDeadSessions();
      if (blind.length > 0) throw new Error('reaper tetap jalan padahal identitas mesin tidak diketahui');
      console.log('✅ 10b. tanpa machine-id reaper tidak menebak (fail-closed)');
    }

    // 11. Pagar di sisi pencilan: keputusan sensor diambil dari TEMPAT DATA DIDARAT,
    //     bukan dari alamat hub. Dua keadaan diuji di jalur asli:
    const rawEvent = {
      type: 'tool.call',
      payload: { call_id: 'tc_sink_guard', session_id: 'sesi_test_001', tool_name: 'bash',
        input: { command: 'cd /home/rizoa/PROJECTS/office && grep -rn OFFICE_TOKEN .env', hidden: 'x' } }
    };

    // (a) storage remote → command mentah dipangkas sebelum ditulis, walau klien bodoh.
    const guarded = enforceTelemetryPolicy({ storageIsRemote: true }, rawEvent);
    assert.equal(guarded.payload.input.command, 'cd', 'sink guard harus memangkas ke kata kerja');
    assert.ok(!JSON.stringify(guarded.payload).includes('PROJECTS'), 'sink guard bocor path internal');

    // (b) storage file: lokal → detail penuh boleh lewat, dashboard lokal memang butuh.
    const passthrough = enforceTelemetryPolicy({ storageIsRemote: false }, rawEvent);
    assert.equal(passthrough.payload.input.command, rawEvent.payload.input.command,
      'sink guard tidak boleh merusak detail di hub file-lokal');

    // (c) jalur HTTP asli ke hub test (yang dbPath-nya `file:`): tersimpan detail.
    await postEvent(PORT, rawEvent);
    const stored = (await db.getRecentToolCalls(30)).find((x) => x.id === 'tc_sink_guard');
    if (!stored) throw new Error('tool call sink-guard tidak tersimpan');
    const storedInput = typeof stored.input_json === 'string' ? JSON.parse(stored.input_json) : stored.input_json;
    assert.match(storedInput.command, /PROJECTS/, 'hub file-lokal seharusnya menyimpan detail penuh');
    console.log('✅ 11. sensor ditentukan storage: remote→"cd", file-lokal→detail penuh (teruji di jalur HTTP)');

    // (d) dan kebalikannya, di proses yang sama tanpa menyentuh DB produksi:
    // hub test menyamar sebagai storage-remote, lalu wire-nya diuji ulang.
    Object.defineProperty(db, 'storageIsRemote', { value: true, configurable: true });
    await postEvent(PORT, { ...rawEvent, payload: { ...rawEvent.payload, call_id: 'tc_sink_guard_remote' } });
    await sleep(250);
    const storedRemote = (await db.getRecentToolCalls(30)).find((x) => x.id === 'tc_sink_guard_remote');
    const remoteInput = typeof storedRemote?.input_json === 'string' ? JSON.parse(storedRemote.input_json) : storedRemote?.input_json;
    if (remoteInput?.command !== 'cd') {
      throw new Error('🔴 storage remote masih menyimpan command mentah: ' + JSON.stringify(remoteInput?.command));
    }
    Object.defineProperty(db, 'storageIsRemote', { value: false, configurable: true });
    console.log('✅ 11d. hub storage-remote menyimpan "cd" lewat jalur HTTP yang sama');
    console.log('\n🎉 [HASIL] SEMUA 12 PENGUJIAN E2E BERHASIL!');
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
