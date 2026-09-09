import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OfficeDB } from './db.js';
import { OfficeWebSocketHub } from './ws.js';
import { ratesForModel } from './pricing.js';
import { quoteFromPortkey } from './pricing-portkey.js';
import { feedStatus, refreshFeed } from './pricing-remote.js';

// Single-origin deployment: the hub serves the built dashboard itself, so the API,
// the WS hub and the SPA all live on :4317. No tunnel, no second port, no CORS dance.
export const DASHBOARD_DIST =
  process.env.OFFICE_DASHBOARD_DIST ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dashboard', 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8'
};

// Returns the file to serve for a dashboard path, falling back to index.html so the
// SPA can own client-side routes. Escapes outside dist are rejected, not served.
function resolveDashboardFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;

  const root = path.resolve(DASHBOARD_DIST);
  const candidate = path.resolve(root, '.' + path.posix.normalize(decoded));
  const insideRoot = candidate === root || candidate.startsWith(root + path.sep);
  if (!insideRoot) return null;

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return { file: candidate, isEntry: false };
  }
  const entry = path.join(root, 'index.html');
  return fs.existsSync(entry) ? { file: entry, isEntry: true } : null;
}

function serveDashboardAsset(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }
  const resolved = resolveDashboardFile(url.pathname);
  if (!resolved) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
    return;
  }
  const ext = path.extname(resolved.file).toLowerCase();
  const headers = {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    // Why: hashed assets under /assets/ are immutable; the entry must always revalidate
    // or an embedded webview keeps a stale bundle after a rebuild.
    'Cache-Control': resolved.isEntry ? 'no-cache' : 'public, max-age=31536000, immutable'
  };
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(resolved.file)
    .on('error', () => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Read failed' }));
    })
    .pipe(res);
}

export function createOfficeServer(options = {}) {
  const db = new OfficeDB(options.dbPath);
  
  const server = http.createServer(async (req, res) => {
    // CORS headers (dipertahankan untuk akses non-loopback yang melewati gateway)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Why: a malformed request target (e.g. the protocol-relative `//?x=y`) throws in
    // the URL constructor, and an uncaught throw here takes down the whole hub for
    // every session. Reject the request instead.
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request' }));
      return;
    }

    // GET /api/health
    if (req.method === 'GET' && url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', time: Date.now() }));
      return;
    }

    // GET /api/state
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const state = await db.getFullState();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(state));
      return;
    }

    // GET /api/billing — coffee-shop bill: tokens + USD per guest and per brew.
    if (req.method === 'GET' && url.pathname === '/api/billing') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(await db.getBilling()));
      return;
    }

    // GET /api/billing/quote?model=&provider=&portkey=1 — where would this price come from?
    if (req.method === 'GET' && url.pathname === '/api/billing/quote') {
      const model = url.searchParams.get('model') || '';
      const provider = url.searchParams.get('provider') || '';
      const local = ratesForModel(model, provider);
      const payload = {
        model,
        provider: provider || null,
        resolved: { source: local.source, matchedBy: local.matchedBy, rates: local.rates },
        feed: feedStatus(),
      };
      if (url.searchParams.get('portkey') === '1' && !local.rates) {
        try {
          payload.portkey = await quoteFromPortkey(model, provider);
        } catch (err) {
          payload.portkey = { ok: false, error: err?.message || 'Portkey lookup gagal.' };
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
      return;
    }

    // POST /api/billing/feed/refresh — pull the bulk price list now instead of waiting.
    if (req.method === 'POST' && url.pathname === '/api/billing/feed/refresh') {
      await refreshFeed();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(feedStatus()));
      return;
    }

    // POST /api/sessions/:id/kill (Control endpoint from dashboard)
    if (req.method === 'POST' && url.pathname.startsWith('/api/sessions/') && url.pathname.endsWith('/kill')) {
      const parts = url.pathname.split('/');
      const sessionId = parts.length === 5 ? decodeURIComponent(parts[3]) : '';
      const result = await killSession(db, hub, sessionId);
      sendJson(res, result.status, result.payload);
      return;
    }

    // POST /api/event (Telemetry endpoint from Pi extension / CLI)
    if (req.method === 'POST' && url.pathname === '/api/event') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const event = JSON.parse(body || '{}');
          await handleTelemetryEvent(db, hub, event);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ received: true, type: event.type }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bad JSON', message: err.message }));
        }
      });
      return;
    }

    // 404 for unknown API routes; everything else is the dashboard SPA.
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
      return;
    }
    serveDashboardAsset(req, res, url);
  });

  const hub = new OfficeWebSocketHub(server);

  return { server, db, hub };
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function readProcessCommand(pid) {
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim();
  } catch {
    return null;
  }
}

/**
 * A redacting client drops the tool body and reports only its size. Keep a marker so the
 * dashboard can still tell "finished" from "still running" — absence of result_json is
 * what drives that badge.
 */
function resultField(payload) {
  if (payload.result !== undefined && payload.result !== null) return payload.result;
  if (payload.output_chars !== undefined) {
    return JSON.stringify({ redacted: true, output_chars: Number(payload.output_chars) || 0 });
  }
  return null;
}

function sessionIdentityFromPayload(payload, fallbackKind = null) {
  const sessionId = String(payload?.session_id || payload?.subagent_id || '');
  const inferredOrcaPane = sessionId.startsWith('orca:') ? sessionId.slice('orca:'.length) : null;
  const inferredKind = sessionId.startsWith('orca:') ? 'orca' : fallbackKind;

  return {
    machine_id: payload.machine_id,
    machine_name: payload.machine_name,
    orca_name: payload.orca_name,
    orca_workspace: payload.orca_workspace,
    orca_pane: payload.orca_pane || inferredOrcaPane,
    client_kind: payload.client_kind || inferredKind,
  };
}

function assertSafeKillTarget(pid) {
  if (!Number.isInteger(pid) || pid <= 1) {
    return { ok: false, status: 400, reason: 'PID sesi tidak valid.' };
  }

  if (pid === process.pid) {
    return { ok: false, status: 400, reason: 'Menolak kill proses server kantor sendiri.' };
  }

  try {
    process.kill(pid, 0);
  } catch (err) {
    if (err?.code === 'ESRCH') {
      return { ok: true, alreadyExited: true, reason: 'Proses sudah tidak berjalan.' };
    }
    return { ok: false, status: 403, reason: err?.message || 'Tidak punya izin mengecek proses.' };
  }

  const cmdline = readProcessCommand(pid);
  if (cmdline && !/(^|[\s/.-])pi([\s/.-]|$)|pi-cli|node .*pi|bun .*pi|tsx .*pi/i.test(cmdline)) {
    return {
      ok: false,
      status: 409,
      reason: `PID ${pid} masih hidup tapi tidak tampak seperti proses Pi CLI.`,
    };
  }

  return { ok: true };
}

async function killSession(db, hub, sessionId) {
  if (!sessionId) {
    return { status: 400, payload: { ok: false, error: 'Session ID kosong.' } };
  }

  const session = await db.getSession(sessionId);
  if (!session) {
    return { status: 404, payload: { ok: false, error: 'Session tidak ditemukan.' } };
  }

  if (session.status === 'offline') {
    return { status: 200, payload: { ok: true, session_id: sessionId, signal_sent: false, message: 'Session sudah offline.' } };
  }

  const pid = Number(session.pid);
  let signalSent = false;
  let message = 'Session dihapus dari kantor; tidak ada PID proses untuk dikill.';

  if (Number.isInteger(pid) && pid > 0) {
    const safety = assertSafeKillTarget(pid);
    if (!safety.ok) {
      return { status: safety.status || 500, payload: { ok: false, error: safety.reason, session_id: sessionId, pid } };
    }

    if (safety.alreadyExited) {
      message = safety.reason;
    } else {
      try {
        process.kill(pid, 'SIGTERM');
        signalSent = true;
        message = `SIGTERM dikirim ke proses Pi CLI pid ${pid}.`;
      } catch (err) {
        if (err?.code === 'ESRCH') {
          message = 'Proses sudah tidak berjalan.';
        } else {
          return { status: 500, payload: { ok: false, error: err?.message || 'Gagal mengirim SIGTERM.', session_id: sessionId, pid } };
        }
      }
    }
  }

  await db.endSession(sessionId);
  const log = {
    session_id: sessionId,
    level: signalSent ? 'warn' : 'info',
    source: 'control',
    message: `🛑 Kill agent: ${session.name}. ${message}`,
    created_at: Date.now()
  };
  await db.appendLog(log);
  hub.broadcast('session_ended', { session_id: sessionId });
  hub.broadcast('log_appended', log);

  return {
    status: 200,
    payload: {
      ok: true,
      session_id: sessionId,
      pid: Number.isInteger(pid) && pid > 0 ? pid : null,
      signal_sent: signalSent,
      message,
    }
  };
}

async function handleTelemetryEvent(db, hub, event) {
  const { type, payload } = event;
  if (!type || !payload) return;

  switch (type) {
    case 'session.register': {
      const session = await db.upsertSession({
        id: payload.session_id,
        name: payload.name,
        role: payload.role,
        avatar: payload.avatar,
        color: payload.color,
        cwd: payload.cwd,
        project: payload.project,
        model: payload.model,
        pid: payload.pid,
        task: payload.task,
        status: 'working',
        is_subagent: payload.is_subagent || 0,
        parent_session_id: payload.parent_session_id || null,
        ...sessionIdentityFromPayload(payload, payload.is_subagent ? 'subagent' : 'pi')
      });

      await db.appendLog({
        session_id: session.id,
        level: 'info',
        source: 'pi-session',
        message: `${session.name} (${session.role}) masuk kantor. Tugas: ${session.task}`
      });

      hub.broadcast('session_registered', session);
      break;
    }

    case 'session.heartbeat': {
      const session = await db.upsertSession({
        id: payload.session_id,
        task: payload.task,
        status: payload.status || 'working',
        pid: payload.pid,
        ...sessionIdentityFromPayload(payload)
      });
      hub.broadcast('session_updated', session);
      break;
    }

    case 'session.end': {
      await db.endSession(payload.session_id);
      await db.appendLog({
        session_id: payload.session_id,
        level: 'info',
        source: 'pi-session',
        message: `Sesi ${payload.session_id} selesai/offline.`
      });
      hub.broadcast('session_ended', { session_id: payload.session_id });
      break;
    }

    case 'team.register': {
      // Subagent registered as office team member
      const subagent = await db.upsertSession({
        id: payload.subagent_id,
        name: payload.name,
        role: payload.role || 'Sub-Agent Specialist',
        avatar: payload.avatar || '🤖',
        color: payload.color || '#a855f7',
        cwd: payload.cwd,
        project: payload.project,
        model: payload.model,
        task: payload.task,
        status: 'working',
        is_subagent: 1,
        parent_session_id: payload.parent_session_id,
        ...sessionIdentityFromPayload(payload, 'subagent')
      });

      await db.appendLog({
        session_id: subagent.id,
        level: 'info',
        source: 'subagent',
        message: `Sub-agent ${subagent.name} di-spawn oleh ${payload.parent_name || payload.parent_session_id}. Tugas: ${subagent.task}`
      });

      hub.broadcast('team_spawned', subagent);
      break;
    }

    case 'tool.call': {
      const tc = {
        id: payload.call_id || `tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        session_id: payload.session_id,
        tool_name: payload.tool_name,
        input: payload.input,
        created_at: Date.now()
      };
      await db.recordToolCall(tc);

      await db.appendLog({
        session_id: payload.session_id,
        level: 'debug',
        source: 'tool_call',
        message: `Tool: ${payload.tool_name} dipanggil.`
      });

      hub.broadcast('tool_called', tc);
      break;
    }

    case 'tool.result': {
      const tc = {
        id: payload.call_id,
        session_id: payload.session_id,
        tool_name: payload.tool_name,
        result: resultField(payload),
        is_error: payload.is_error ? 1 : 0,
        duration_ms: payload.duration_ms || 0
      };
      await db.recordToolCall(tc);

      hub.broadcast('tool_completed', tc);
      break;
    }

    case 'llm.stream': {
      hub.broadcast('llm_stream_updated', {
        session_id: payload.session_id,
        kind: payload.kind || 'status',
        text: payload.text || '',
        isFinal: !!payload.is_final,
        updatedAt: Date.now()
      });
      break;
    }

    case 'session.usage': {
      // Why: one receipt per LLM call. No log line and no session upsert here — turns
      // arrive many times per minute and would drown the feed and the heartbeat.
      const receipt = await db.recordUsage(payload);
      hub.broadcast('usage_recorded', await db.getBilling());
      return receipt;
    }

    case 'log.append': {
      await db.appendLog({
        session_id: payload.session_id,
        level: payload.level || 'info',
        source: payload.source || 'pi-cli',
        message: payload.message
      });

      hub.broadcast('log_appended', {
        session_id: payload.session_id,
        level: payload.level || 'info',
        source: payload.source || 'pi-cli',
        message: payload.message,
        created_at: Date.now()
      });
      break;
    }

    case 'task.update': {
      const session = await db.upsertSession({
        id: payload.session_id,
        task: payload.task,
        status: payload.status || 'working',
        pid: payload.pid,
        ...sessionIdentityFromPayload(payload)
      });

      await db.appendLog({
        session_id: payload.session_id,
        level: 'info',
        source: 'task',
        message: `Tugas diperbarui: ${payload.task}`
      });

      hub.broadcast('task_updated', session);
      break;
    }

    default:
      console.warn('[Server] Unknown event type:', type);
  }
}
