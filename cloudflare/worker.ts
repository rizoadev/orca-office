/// <reference types="@cloudflare/workers-types" />

import { createClient, type Client } from '@libsql/client/web';

type CostSource = 'reported' | 'none';
type SessionStatus = 'working' | 'idle' | 'offline';

type Env = {
  ASSETS: Fetcher;
  OFFICE_ROOM: DurableObjectNamespace<OfficeRoom>;
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  OFFICE_TOKEN?: string;
};

type TelemetryEvent = {
  type?: string;
  payload?: Record<string, any>;
};

type SessionRow = {
  id: string;
  name: string;
  role: string;
  avatar: string;
  color: string;
  cwd: string | null;
  project: string | null;
  machine_id: string | null;
  machine_name: string | null;
  orca_name: string | null;
  orca_workspace: string | null;
  orca_pane: string | null;
  client_kind: string | null;
  model: string | null;
  pid: number | null;
  task: string | null;
  status: SessionStatus;
  is_subagent: number;
  parent_session_id: string | null;
  started_at: number;
  last_heartbeat: number;
  ended_at: number | null;
};

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization',
};

const schemaReady = new WeakMap<Env, Promise<void>>();

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

function db(env: Env): Client {
  return createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
}

function now(): number {
  return Date.now();
}

function text(value: unknown, fallback: string | null = null): string | null {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

function int(value: unknown, fallback: number | null = null): number | null {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

function projectNameFromCwd(cwd: string | null): string | null {
  if (!cwd) return null;
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  const name = parts.at(-1) ?? null;
  return name?.endsWith('.git') ? name.slice(0, -4) : name;
}

/**
 * Redacting clients drop the tool body and report only its size. Persist a marker so the
 * dashboard can still distinguish "finished" from "still running".
 */
function resultField(payload: Record<string, any>): unknown {
  if (payload.result !== undefined && payload.result !== null) return payload.result;
  if (payload.output_chars !== undefined) {
    return JSON.stringify({ redacted: true, output_chars: Number(payload.output_chars) || 0 });
  }
  return null;
}

function sessionIdentityFromPayload(payload: Record<string, any>, fallbackKind: string | null = null) {
  const sessionId = String(payload.session_id || payload.subagent_id || '');
  const inferredOrcaPane = sessionId.startsWith('orca:') ? sessionId.slice('orca:'.length) : null;
  const inferredKind = sessionId.startsWith('orca:') ? 'orca' : fallbackKind;
  return {
    machine_id: text(payload.machine_id),
    machine_name: text(payload.machine_name),
    orca_name: text(payload.orca_name),
    orca_workspace: text(payload.orca_workspace),
    orca_pane: text(payload.orca_pane) || inferredOrcaPane,
    client_kind: text(payload.client_kind) || inferredKind,
  };
}

const SESSION_COOKIE = 'office_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq !== -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/**
 * A reader is allowed with the bearer token (extensions, scripts) or a session cookie
 * (browser). The cookie stores sha256(token), not the token itself, so a stolen cookie
 * cannot be replayed as an Authorization header against the ingest endpoint.
 */
async function isAuthorized(request: Request, env: Env): Promise<boolean> {
  if (!env.OFFICE_TOKEN) return true;
  const header = request.headers.get('authorization') || '';
  if (header === `Bearer ${env.OFFICE_TOKEN}`) return true;
  const cookie = readCookie(request, SESSION_COOKIE);
  return cookie !== null && cookie === (await sha256Hex(env.OFFICE_TOKEN));
}

function gatewayPage(message?: string): Response {
  const notice = message ? `<p class="err">${message.replace(/[<>&]/g, '')}</p>` : '';
  return new Response(
    `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ORCA24 · akses kantor</title>
<style>
 body{font:15px/1.5 ui-sans-serif,system-ui,sans-serif;background:#0a0d13;color:#e2e8f0;display:grid;place-items:center;min-height:100vh;margin:0}
 form{background:#121722;border:1px solid #1f2a40;border-radius:14px;padding:26px;width:min(92vw,360px)}
 h1{font-size:17px;margin:0 0 4px}p.sub{color:#64748b;font-size:13px;margin:0 0 18px}
 input{width:100%;box-sizing:border-box;background:#0a0d13;border:1px solid #232e44;color:#e2e8f0;border-radius:9px;padding:10px 12px;font-family:ui-monospace,monospace}
 button{margin-top:14px;width:100%;background:#38bdf8;border:0;color:#04121c;font-weight:700;padding:10px;border-radius:9px;cursor:pointer}
 .err{color:#fda4af;font-size:13px;margin:0 0 12px}
</style></head><body>
<form method="post" action="/gateway">${notice}
<h1>☕ ORCA24 Coworking</h1>
<p class="sub">Kantor ini berisi sesi dari beberapa mesin. Masukkan token untuk masuk.</p>
<input type="password" name="token" placeholder="OFFICE_TOKEN" autofocus autocomplete="off">
<button>Masuk</button>
</form></body></html>`,
    { status: message ? 401 : 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

async function handleGateway(request: Request, env: Env): Promise<Response> {
  if (!env.OFFICE_TOKEN) {
    return new Response(null, { status: 302, headers: { location: '/' } });
  }
  let provided: string | null = new URL(request.url).searchParams.get('token');
  if (!provided && request.method === 'POST') {
    provided = (await request.formData()).get('token')?.toString() ?? null;
  }
  if (!provided) return gatewayPage();
  if (provided !== env.OFFICE_TOKEN) return gatewayPage('Token tidak cocok.');

  return new Response(null, {
    status: 302,
    headers: {
      location: '/',
      'set-cookie': `${SESSION_COOKIE}=${await sha256Hex(env.OFFICE_TOKEN)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`,
    },
  });
}

async function ensureSchema(env: Env): Promise<void> {
  let ready = schemaReady.get(env);
  if (ready) return ready;

  ready = (async () => {
    const client = db(env);
    await client.batch([
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        avatar TEXT NOT NULL,
        color TEXT NOT NULL,
        cwd TEXT,
        project TEXT,
        machine_id TEXT,
        machine_name TEXT,
        orca_name TEXT,
        orca_workspace TEXT,
        orca_pane TEXT,
        client_kind TEXT,
        model TEXT,
        pid INTEGER,
        task TEXT,
        status TEXT DEFAULT 'working',
        is_subagent INTEGER DEFAULT 0,
        parent_session_id TEXT,
        started_at INTEGER,
        last_heartbeat INTEGER,
        ended_at INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS tool_calls (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        input_json TEXT,
        result_json TEXT,
        is_error INTEGER DEFAULT 0,
        duration_ms INTEGER,
        created_at INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        level TEXT DEFAULT 'info',
        source TEXT,
        message TEXT NOT NULL,
        created_at INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS usage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        model TEXT NOT NULL,
        provider TEXT,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cache_read_tokens INTEGER DEFAULT 0,
        cache_write_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        cost REAL DEFAULT 0,
        cost_source TEXT DEFAULT 'none',
        cost_rank INTEGER DEFAULT 0,
        dedupe_key TEXT,
        created_at INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`,
      `CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id)`,
      `CREATE INDEX IF NOT EXISTS idx_logs_session ON logs(session_id)`,
      `CREATE INDEX IF NOT EXISTS idx_usage_session_model ON usage_events(session_id, model)`,
      `CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_events(created_at)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_dedupe ON usage_events(dedupe_key) WHERE dedupe_key IS NOT NULL`,
    ], 'write');
  })();

  schemaReady.set(env, ready);
  return ready;
}

async function getSession(client: Client, id: string): Promise<SessionRow | null> {
  const result = await client.execute({ sql: 'SELECT * FROM sessions WHERE id = ?', args: [id] });
  return (result.rows[0] as unknown as SessionRow) || null;
}

async function upsertSession(client: Client, data: Record<string, any>): Promise<SessionRow> {
  const id = String(data.id || data.session_id || 'unknown');
  const existing = await getSession(client, id);
  const timestamp = now();
  const cwd = text(data.cwd, existing?.cwd || null);
  const project = text(data.project, existing?.project || projectNameFromCwd(cwd));
  const status = text(data.status, existing?.status || 'working') as SessionStatus;

  const row = {
    id,
    name: text(data.name, existing?.name || 'Pegawai Pi')!,
    role: text(data.role, existing?.role || 'Developer')!,
    avatar: text(data.avatar, existing?.avatar || '🧑‍💻')!,
    color: text(data.color, existing?.color || '#38bdf8')!,
    cwd,
    project,
    machine_id: text(data.machine_id, existing?.machine_id || null),
    machine_name: text(data.machine_name, existing?.machine_name || null),
    orca_name: text(data.orca_name, existing?.orca_name || null),
    orca_workspace: text(data.orca_workspace, existing?.orca_workspace || null),
    orca_pane: text(data.orca_pane, existing?.orca_pane || null),
    client_kind: text(data.client_kind, existing?.client_kind || null),
    model: text(data.model, existing?.model || 'pi'),
    pid: int(data.pid, existing?.pid || null),
    task: text(data.task, existing?.task || 'Belum ada prompt Pi CLI'),
    status,
    is_subagent: data.is_subagent !== undefined ? (data.is_subagent ? 1 : 0) : (existing?.is_subagent || 0),
    parent_session_id: text(data.parent_session_id, existing?.parent_session_id || null),
    started_at: int(data.started_at, existing?.started_at || timestamp)!,
    last_heartbeat: timestamp,
  };

  await client.execute({
    sql: `INSERT INTO sessions (
      id, name, role, avatar, color, cwd, project, machine_id, machine_name,
      orca_name, orca_workspace, orca_pane, client_kind, model, pid, task, status,
      is_subagent, parent_session_id, started_at, last_heartbeat
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      role = excluded.role,
      avatar = excluded.avatar,
      color = excluded.color,
      cwd = excluded.cwd,
      project = excluded.project,
      machine_id = excluded.machine_id,
      machine_name = excluded.machine_name,
      orca_name = excluded.orca_name,
      orca_workspace = excluded.orca_workspace,
      orca_pane = excluded.orca_pane,
      client_kind = excluded.client_kind,
      model = excluded.model,
      pid = excluded.pid,
      task = excluded.task,
      status = excluded.status,
      is_subagent = excluded.is_subagent,
      parent_session_id = excluded.parent_session_id,
      started_at = excluded.started_at,
      last_heartbeat = excluded.last_heartbeat`,
    args: [
      row.id, row.name, row.role, row.avatar, row.color, row.cwd, row.project,
      row.machine_id, row.machine_name, row.orca_name, row.orca_workspace,
      row.orca_pane, row.client_kind, row.model, row.pid, row.task, row.status,
      row.is_subagent, row.parent_session_id, row.started_at, row.last_heartbeat,
    ],
  });

  return (await getSession(client, id))!;
}

async function endSession(client: Client, id: string): Promise<void> {
  await client.execute({ sql: `UPDATE sessions SET status = 'offline', ended_at = ? WHERE id = ?`, args: [now(), id] });
}

async function appendLog(client: Client, log: Record<string, any>): Promise<Record<string, any>> {
  const createdAt = int(log.created_at, now())!;
  await client.execute({
    sql: `INSERT INTO logs (session_id, level, source, message, created_at) VALUES (?, ?, ?, ?, ?)`,
    args: [text(log.session_id), text(log.level, 'info'), text(log.source, 'pi-dev'), String(log.message || ''), createdAt],
  });
  return { session_id: text(log.session_id), level: text(log.level, 'info'), source: text(log.source, 'pi-dev'), message: String(log.message || ''), created_at: createdAt };
}

async function recordToolCall(client: Client, tc: Record<string, any>): Promise<Record<string, any>> {
  const id = String(tc.id || `tc_${now()}_${Math.random().toString(36).slice(2, 6)}`);
  const input = tc.input_json ?? (typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input || {}));
  const result = tc.result_json ?? (tc.result === undefined ? null : typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result));
  await client.execute({
    sql: `INSERT INTO tool_calls (id, session_id, tool_name, input_json, result_json, is_error, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        result_json = excluded.result_json,
        is_error = excluded.is_error,
        duration_ms = excluded.duration_ms`,
    args: [id, String(tc.session_id || 'unknown'), String(tc.tool_name || 'tool'), input, result, tc.is_error ? 1 : 0, int(tc.duration_ms, 0), int(tc.created_at, now())],
  });
  return { id, session_id: String(tc.session_id || 'unknown'), tool_name: String(tc.tool_name || 'tool'), input_json: input, result_json: result, is_error: tc.is_error ? 1 : 0, duration_ms: int(tc.duration_ms, 0), created_at: int(tc.created_at, now()) };
}

async function recordUsage(client: Client, payload: Record<string, any>): Promise<Record<string, any>> {
  const nonNeg = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  };
  const input = nonNeg(payload.input ?? payload.input_tokens);
  const output = nonNeg(payload.output ?? payload.output_tokens);
  const cacheRead = nonNeg(payload.cache_read ?? payload.cacheReadTokens ?? payload.cache_read_tokens);
  const cacheWrite = nonNeg(payload.cache_write ?? payload.cacheWriteTokens ?? payload.cache_write_tokens);
  const totalTokens = nonNeg(payload.total_tokens ?? payload.totalTokens) || input + output + cacheRead + cacheWrite;
  const reportedCost = Number(payload.reported_cost ?? payload.cost ?? 0) || 0;
  const costSource: CostSource = reportedCost > 0 ? 'reported' : 'none';
  const dedupeKey = text(payload.dedupe_key, null);

  await client.execute({
    sql: `INSERT INTO usage_events (
      session_id, model, provider, input_tokens, output_tokens, cache_read_tokens,
      cache_write_tokens, total_tokens, cost, cost_source, cost_rank, dedupe_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
    args: [
      String(payload.session_id || 'unknown'), String(payload.model || 'pi-model').slice(0, 200), text(payload.provider),
      input, output, cacheRead, cacheWrite, totalTokens, reportedCost, costSource, costSource === 'reported' ? 1 : 0,
      dedupeKey, int(payload.created_at, now()),
    ],
  });

  return { session_id: payload.session_id, model: payload.model, totalTokens, cost: reportedCost, costSource };
}

async function getBilling(client: Client): Promise<Record<string, any>> {
  const result = await client.execute(`
    SELECT
      u.session_id AS sessionId,
      u.model AS model,
      MAX(u.provider) AS provider,
      SUM(u.input_tokens) AS inputTokens,
      SUM(u.output_tokens) AS outputTokens,
      SUM(u.cache_read_tokens) AS cacheReadTokens,
      SUM(u.cache_write_tokens) AS cacheWriteTokens,
      SUM(u.total_tokens) AS totalTokens,
      SUM(u.cost) AS cost,
      COUNT(*) AS turns,
      MIN(u.created_at) AS firstUsedAt,
      MAX(u.created_at) AS lastUsedAt,
      MAX(u.cost_rank) AS costRank,
      s.name AS name,
      s.avatar AS avatar,
      s.color AS color,
      s.is_subagent AS isSubagent,
      s.status AS status
    FROM usage_events u
    LEFT JOIN sessions s ON s.id = u.session_id
    GROUP BY u.session_id, u.model
  `);

  const users = new Map<string, any>();
  const menu = new Map<string, any>();

  for (const row of result.rows as any[]) {
    const sessionId = String(row.sessionId || 'unknown');
    const totalTokens = Number(row.totalTokens) || 0;
    const cost = Number(row.cost) || 0;
    const line = {
      model: row.model,
      provider: row.provider || null,
      inputTokens: Number(row.inputTokens) || 0,
      outputTokens: Number(row.outputTokens) || 0,
      cacheReadTokens: Number(row.cacheReadTokens) || 0,
      cacheWriteTokens: Number(row.cacheWriteTokens) || 0,
      totalTokens,
      cost,
      turns: Number(row.turns) || 0,
      costSource: row.costRank ? 'reported' : 'none',
      firstUsedAt: Number(row.firstUsedAt) || 0,
      lastUsedAt: Number(row.lastUsedAt) || 0,
      ratePerToken: totalTokens > 0 ? cost / totalTokens : 0,
      ratePerMillion: totalTokens > 0 ? (cost / totalTokens) * 1_000_000 : 0,
    };

    let user = users.get(sessionId);
    if (!user) {
      user = {
        sessionId,
        name: row.name || `Sesi ${sessionId.slice(0, 8)}`,
        avatar: row.avatar || '☕',
        color: row.color || '#38bdf8',
        isSubagent: Number(row.isSubagent) || 0,
        status: row.status || 'offline',
        totalTokens: 0,
        cost: 0,
        turns: 0,
        lastUsedAt: 0,
        lines: [],
      };
      users.set(sessionId, user);
    }
    user.totalTokens += line.totalTokens;
    user.cost += line.cost;
    user.turns += line.turns;
    user.lastUsedAt = Math.max(user.lastUsedAt, line.lastUsedAt);
    user.lines.push(line);

    let brew = menu.get(line.model);
    if (!brew) {
      brew = { model: line.model, provider: line.provider, totalTokens: 0, cost: 0, turns: 0, firstUsedAt: line.firstUsedAt || now(), lastUsedAt: 0, costSource: line.costSource, drinkers: new Set<string>() };
      menu.set(line.model, brew);
    }
    brew.totalTokens += line.totalTokens;
    brew.cost += line.cost;
    brew.turns += line.turns;
    brew.firstUsedAt = Math.min(brew.firstUsedAt, line.firstUsedAt || now());
    brew.lastUsedAt = Math.max(brew.lastUsedAt, line.lastUsedAt);
    brew.drinkers.add(sessionId);
  }

  const userList = [...users.values()].sort((a, b) => b.cost - a.cost || b.totalTokens - a.totalTokens);
  const menuList = [...menu.values()].map((brew) => ({
    model: brew.model,
    provider: brew.provider,
    totalTokens: brew.totalTokens,
    cost: brew.cost,
    turns: brew.turns,
    firstUsedAt: brew.firstUsedAt,
    lastUsedAt: brew.lastUsedAt,
    costSource: brew.costSource,
    drinkerCount: brew.drinkers.size,
    ratePerToken: brew.totalTokens > 0 ? brew.cost / brew.totalTokens : 0,
    ratePerMillion: brew.totalTokens > 0 ? (brew.cost / brew.totalTokens) * 1_000_000 : 0,
  })).sort((a, b) => a.firstUsedAt - b.firstUsedAt);

  const totals = userList.reduce((acc, user) => ({ totalTokens: acc.totalTokens + user.totalTokens, cost: acc.cost + user.cost, turns: acc.turns + user.turns }), { totalTokens: 0, cost: 0, turns: 0 });
  return { generatedAt: now(), users: userList, menu: menuList, totals: { ...totals, users: userList.length, models: menuList.length } };
}

async function getFullState(client: Client): Promise<Record<string, any>> {
  const [sessions, recentToolCalls, recentLogs, billing] = await Promise.all([
    client.execute(`SELECT * FROM sessions WHERE status != 'offline' ORDER BY last_heartbeat DESC`),
    client.execute(`SELECT tc.*, s.name AS session_name, s.avatar AS session_avatar FROM tool_calls tc LEFT JOIN sessions s ON tc.session_id = s.id ORDER BY tc.created_at DESC LIMIT 30`),
    client.execute(`SELECT l.*, s.name AS session_name, s.avatar AS session_avatar FROM logs l LEFT JOIN sessions s ON l.session_id = s.id ORDER BY l.id DESC LIMIT 50`),
    getBilling(client),
  ]);
  return { sessions: sessions.rows, recent_tool_calls: recentToolCalls.rows, recent_logs: recentLogs.rows, billing, stats: { total_active: sessions.rows.length, timestamp: now() } };
}

async function broadcast(env: Env, type: string, payload: unknown): Promise<void> {
  const id = env.OFFICE_ROOM.idFromName('global');
  const room = env.OFFICE_ROOM.get(id);
  await room.fetch('https://office-room.internal/broadcast', {
    method: 'POST',
    body: JSON.stringify({ type, payload, timestamp: now() }),
  });
}

async function handleTelemetryEvent(env: Env, event: TelemetryEvent): Promise<unknown> {
  const { type, payload } = event;
  if (!type || !payload) return null;
  const client = db(env);

  switch (type) {
    case 'session.register': {
      const session = await upsertSession(client, {
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
        status: payload.status || 'working',
        is_subagent: payload.is_subagent || 0,
        parent_session_id: payload.parent_session_id || null,
        ...sessionIdentityFromPayload(payload, payload.is_subagent ? 'subagent' : 'pi'),
      });
      await appendLog(client, { session_id: session.id, level: 'info', source: 'pi-session', message: `${session.name} (${session.role}) masuk kantor. Tugas: ${session.task}` });
      await broadcast(env, 'session_registered', session);
      return session;
    }
    case 'session.heartbeat': {
      const session = await upsertSession(client, { id: payload.session_id, task: payload.task, status: payload.status || 'working', pid: payload.pid, ...sessionIdentityFromPayload(payload) });
      await broadcast(env, 'session_updated', session);
      return session;
    }
    case 'session.end': {
      await endSession(client, String(payload.session_id));
      await appendLog(client, { session_id: payload.session_id, level: 'info', source: 'pi-session', message: `Sesi ${payload.session_id} selesai/offline.` });
      await broadcast(env, 'session_ended', { session_id: payload.session_id });
      return { session_id: payload.session_id };
    }
    case 'team.register': {
      const subagent = await upsertSession(client, {
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
        ...sessionIdentityFromPayload(payload, 'subagent'),
      });
      await appendLog(client, { session_id: subagent.id, level: 'info', source: 'subagent', message: `Sub-agent ${subagent.name} di-spawn oleh ${payload.parent_name || payload.parent_session_id}. Tugas: ${subagent.task}` });
      await broadcast(env, 'team_spawned', subagent);
      return subagent;
    }
    case 'task.update': {
      const session = await upsertSession(client, { id: payload.session_id, task: payload.task, status: payload.status || 'working', pid: payload.pid, ...sessionIdentityFromPayload(payload) });
      await appendLog(client, { session_id: payload.session_id, level: 'info', source: 'task', message: `Tugas diperbarui: ${payload.task}` });
      await broadcast(env, 'task_updated', session);
      return session;
    }
    case 'tool.call': {
      const tc = await recordToolCall(client, { id: payload.call_id, session_id: payload.session_id, tool_name: payload.tool_name, input: payload.input, created_at: now() });
      await appendLog(client, { session_id: payload.session_id, level: 'debug', source: 'tool_call', message: `Tool: ${payload.tool_name} dipanggil.` });
      await broadcast(env, 'tool_called', tc);
      return tc;
    }
    case 'tool.result': {
      const tc = await recordToolCall(client, { id: payload.call_id, session_id: payload.session_id, tool_name: payload.tool_name, result: resultField(payload), is_error: payload.is_error ? 1 : 0, duration_ms: payload.duration_ms || 0 });
      await broadcast(env, 'tool_completed', tc);
      return tc;
    }
    case 'llm.stream': {
      const stream = { session_id: payload.session_id, kind: payload.kind || 'status', text: payload.text || '', isFinal: !!payload.is_final, updatedAt: now() };
      await broadcast(env, 'llm_stream_updated', stream);
      return stream;
    }
    case 'session.usage': {
      const receipt = await recordUsage(client, payload);
      await broadcast(env, 'usage_recorded', await getBilling(client));
      return receipt;
    }
    case 'log.append': {
      const log = await appendLog(client, { session_id: payload.session_id, level: payload.level || 'info', source: payload.source || 'pi-cli', message: payload.message });
      await broadcast(env, 'log_appended', log);
      return log;
    }
    default:
      return null;
  }
}

async function killSession(env: Env, sessionId: string): Promise<Response> {
  const client = db(env);
  const session = await getSession(client, sessionId);
  if (!session) return json({ ok: false, error: 'Session tidak ditemukan.' }, 404);
  await endSession(client, sessionId);
  const log = await appendLog(client, { session_id: sessionId, level: 'info', source: 'control', message: `🛑 Cloud office: ${session.name} ditandai offline. SIGTERM lokal tidak tersedia di Cloudflare Worker.` });
  await broadcast(env, 'session_ended', { session_id: sessionId });
  await broadcast(env, 'log_appended', log);
  return json({ ok: true, session_id: sessionId, pid: null, signal_sent: false, message: 'Cloud backend tidak bisa SIGTERM; session ditandai offline.' });
}

export class OfficeRoom implements DurableObject {
  private sockets = new Set<WebSocket>();

  constructor(private readonly state: DurableObjectState, private readonly env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      const upgrade = request.headers.get('upgrade');
      if (upgrade !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.sockets.add(server);
      server.addEventListener('close', () => this.sockets.delete(server));
      server.addEventListener('error', () => this.sockets.delete(server));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const message = await request.text();
      for (const socket of [...this.sockets]) {
        try {
          socket.send(message);
        } catch {
          this.sockets.delete(socket);
        }
      }
      return json({ ok: true, clients: this.sockets.size });
    }

    return new Response('Not Found', { status: 404 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: jsonHeaders });

    const url = new URL(request.url);

    if (url.pathname === '/gateway') {
      return handleGateway(request, env);
    }

    if (url.pathname === '/ws') {
      // Why: the socket carries the same live feed as /api/state, so it cannot stay open
      // while the REST reads are gated.
      if (!(await isAuthorized(request, env))) return json({ error: 'Unauthorized' }, 401);
      const id = env.OFFICE_ROOM.idFromName('global');
      return env.OFFICE_ROOM.get(id).fetch(new Request('https://office-room.internal/ws', request));
    }

    if (url.pathname.startsWith('/api/')) {
      try {
        await ensureSchema(env);
        const client = db(env);

        if (request.method === 'GET' && url.pathname === '/api/health') {
          return json({ status: 'ok', target: 'cloudflare-worker', time: now() });
        }
        // Everything past this point returns office contents, not just liveness.
        if (!(await isAuthorized(request, env))) {
          return json({ error: 'Unauthorized', hint: 'buka /gateway untuk masuk dengan token' }, 401);
        }
        if (request.method === 'GET' && url.pathname === '/api/state') {
          return json(await getFullState(client));
        }
        if (request.method === 'GET' && url.pathname === '/api/billing') {
          return json(await getBilling(client));
        }
        if (request.method === 'POST' && url.pathname === '/api/event') {
          const event = (await request.json()) as TelemetryEvent;
          const result = await handleTelemetryEvent(env, event);
          return json({ received: true, type: event.type, result });
        }
        if (request.method === 'POST' && url.pathname.startsWith('/api/sessions/') && url.pathname.endsWith('/kill')) {
          const parts = url.pathname.split('/');
          return killSession(env, decodeURIComponent(parts[3] || ''));
        }
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : 'Worker error' }, 500);
      }
      return json({ error: 'Not Found' }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};
