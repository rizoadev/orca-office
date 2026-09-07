import http from 'node:http';

const ENDPOINT_PORT = process.env.OFFICE_PORT || 4317;

const SIM_EVENTS = [
  {
    type: 'session.register',
    payload: {
      session_id: 'sesi_budi_01',
      name: 'Budi Santoso',
      role: 'Backend Lead · API & Microservices',
      avatar: '🧔',
      color: '#6366f1',
      task: 'Optimasi query SQLite & WebSocket broadcaster',
      model: 'openai-codex/gpt-5.6-luna'
    },
    delay: 500
  },
  {
    type: 'tool.call',
    payload: {
      call_id: 'tc_01',
      session_id: 'sesi_budi_01',
      tool_name: 'read',
      input: { path: 'server/src/db.js' }
    },
    delay: 1500
  },
  {
    type: 'tool.result',
    payload: {
      call_id: 'tc_01',
      session_id: 'sesi_budi_01',
      tool_name: 'read',
      result: 'File db.js dibaca (124 baris)',
      is_error: false,
      duration_ms: 35
    },
    delay: 1000
  },
  {
    type: 'team.register',
    payload: {
      subagent_id: 'sub_citra_01',
      parent_session_id: 'sesi_budi_01',
      parent_name: 'Budi Santoso',
      name: 'Citra (Sub-Agent)',
      role: 'Unit Test Generator',
      avatar: '🤖',
      color: '#c084fc',
      task: 'Menulis skenario pengujian websocket reconnect'
    },
    delay: 2000
  },
  {
    type: 'tool.call',
    payload: {
      call_id: 'tc_sub_01',
      session_id: 'sub_citra_01',
      tool_name: 'bash',
      input: { command: 'npm test -- --coverage' }
    },
    delay: 1500
  },
  {
    type: 'tool.result',
    payload: {
      call_id: 'tc_sub_01',
      session_id: 'sub_citra_01',
      tool_name: 'bash',
      result: 'PASS: 12 tests passed, coverage 94%',
      is_error: false,
      duration_ms: 820
    },
    delay: 1200
  },
  {
    type: 'task.update',
    payload: {
      session_id: 'sesi_budi_01',
      task: 'Deployment dan review dashboard Vite',
      status: 'working'
    },
    delay: 1500
  },
  {
    type: 'log.append',
    payload: {
      session_id: 'sesi_budi_01',
      level: 'info',
      source: 'pi-announcement',
      message: '📢 Budi Santoso: Semua endpoint kantor siap digunakan!'
    },
    delay: 1000
  }
];

async function runSimulation() {
  console.log('🚀 Memulai simulasi aktivitas Pi Dev CLI...');
  for (const ev of SIM_EVENTS) {
    await sleep(ev.delay);
    await postEvent(ENDPOINT_PORT, ev);
    console.log(`📤 [Event Dikirim] ${ev.type}`);
  }
  console.log('✨ Simulasi selesai! Periksa dashboard Anda.');
}

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
    req.on('error', (e) => {
      console.warn(`[Koneksi Gagal] Pastikan server kantor menyala di port ${port}`);
      resolve();
    });
    req.write(JSON.stringify(data));
    req.end();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

runSimulation();
