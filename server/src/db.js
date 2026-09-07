import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { resolveUsageCost, COST_RANK, RANK_COST_SOURCE } from './pricing.js';

const DB_PATH = process.env.OFFICE_DB_PATH || path.resolve(process.cwd(), 'office.db');

function summarizePrompt(prompt, maxLength = 80) {
  const cleanPrompt = prompt.trim().replace(/\s+/g, ' ');
  return cleanPrompt.length > maxLength ? cleanPrompt.slice(0, maxLength - 3) + '...' : cleanPrompt;
}

function getPiSessionsRoot() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return process.env.PI_SESSIONS_DIR || path.join(home, '.pi', 'agent', 'sessions');
}

function encodeCwdForPiSessions(cwd) {
  return `--${path.resolve(cwd).replace(/^\/+/, '').replace(/\/+$/g, '').replace(/\/+/g, '-')}--`;
}

export function getSessionLogFiles(cwd, sessionId = null) {
  const root = getPiSessionsRoot();
  const primaryDir = path.join(root, encodeCwdForPiSessions(cwd));
  const dirs = fs.existsSync(primaryDir)
    ? [primaryDir]
    : fs.existsSync(root)
      ? fs.readdirSync(root)
        .filter(entry => entry.startsWith('--'))
        .map(entry => path.join(root, entry))
      : [];

  const files = dirs
    .flatMap((dir) => {
      try {
        return fs.readdirSync(dir)
          .filter(file => file.endsWith('.jsonl'))
          .map(file => path.join(dir, file));
      } catch {
        return [];
      }
    });

  const scopedFiles = sessionId
    ? files.filter(file => path.basename(file).includes(sessionId))
    : files;

  return scopedFiles
    .map(file => ({ file, mtimeMs: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 50)
    .map(({ file }) => file);
}

function extractTextContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item?.type === 'text' && typeof item.text === 'string') return item.text;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function getLastPiCliPrompt(cwd, sessionId = null) {
  try {
    for (const file of getSessionLogFiles(cwd, sessionId)) {
      const lines = fs.readFileSync(file, 'utf8').trim().split('\n').reverse();
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (event?.type !== 'message' || event?.message?.role !== 'user') continue;

          const prompt = extractTextContent(event.message.content).trim();
          if (prompt) return summarizePrompt(prompt);
        } catch {
          // Ignore malformed JSONL lines from an actively-written session log.
        }
      }
    }
  } catch {
    // Fail-safe: telemetry storage should never fail because Pi history is missing.
  }

  return null;
}

function isWaitingPromptTask(task) {
  return typeof task === 'string' && /menunggu\s+prompt/i.test(task);
}

// The bubble's project chip. Walk up from cwd to the nearest `.git` so a Pi session
// started in a subdirectory is still credited to its repo, not to `src/`. The walk is
// skipped when the path is not on this machine (SSH-attached worktrees report remote
// paths) and falls back to the last path segment.
const projectNameCache = new Map();
const PROJECT_ROOT_SEARCH_LIMIT = 12;

function projectNameFromCwd(cwd) {
  if (typeof cwd !== 'string' || !cwd.trim()) return null;
  const key = cwd.trim();
  if (projectNameCache.has(key)) return projectNameCache.get(key);

  const isAbsolute = /^([a-zA-Z]:[\\/]|[\\/])/.test(key);
  const basenameOf = (p) => {
    const last = p.split(/[\\/]+/).filter(Boolean).pop() ?? '';
    return last.endsWith('.git') ? last.slice(0, -4) : last;
  };

  let name = basenameOf(key);
  if (isAbsolute && fs.existsSync(key)) {
    try {
      let dir = path.resolve(key);
      for (let depth = 0; depth < PROJECT_ROOT_SEARCH_LIMIT; depth += 1) {
        if (fs.existsSync(path.join(dir, '.git'))) {
          name = basenameOf(dir) || name;
          break;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    } catch {
      // Fail-safe: a missing project chip is never worth a telemetry write failure.
    }
  }

  projectNameCache.set(key, name || null);
  return name || null;
}

// Why: receipts are read as dollars; 12 decimals of float noise is not a price.
function roundCost(value) {
  return Math.round((Number(value) || 0) * 1e8) / 1e8;
}

export class OfficeDB {
  constructor(dbFile = DB_PATH) {
    this.dbFile = dbFile;
    const dir = path.dirname(dbFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new DatabaseSync(dbFile);
    this.initSchema();
    this.backfillWaitingPromptTasks();
    this.backfillMissingProjectNames();
  }

  initSchema() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS sessions (
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
      );

      CREATE TABLE IF NOT EXISTS tool_calls (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        input_json TEXT,
        result_json TEXT,
        is_error INTEGER DEFAULT 0,
        duration_ms INTEGER,
        created_at INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        level TEXT DEFAULT 'info',
        source TEXT,
        message TEXT NOT NULL,
        created_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS usage_events (
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
        created_at INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id);
      CREATE INDEX IF NOT EXISTS idx_logs_session ON logs(session_id);
      CREATE INDEX IF NOT EXISTS idx_usage_session_model ON usage_events(session_id, model);
      CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_events(created_at);
      -- Partial unique index: live events carry no key (every turn is new), while a
      -- backfill can be re-run safely because each log line has one.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_dedupe ON usage_events(dedupe_key) WHERE dedupe_key IS NOT NULL;
    `);

    const sessionColumns = this.db.prepare('PRAGMA table_info(sessions)').all().map(column => column.name);
    if (!sessionColumns.includes('pid')) {
      this.db.exec('ALTER TABLE sessions ADD COLUMN pid INTEGER');
    }
    if (!sessionColumns.includes('project')) {
      this.db.exec('ALTER TABLE sessions ADD COLUMN project TEXT');
    }
    for (const column of ['machine_id', 'machine_name', 'orca_name', 'orca_workspace', 'orca_pane', 'client_kind']) {
      if (!sessionColumns.includes(column)) {
        this.db.exec(`ALTER TABLE sessions ADD COLUMN ${column} TEXT`);
      }
    }

    // Why: cost_source is TEXT, so MAX() would rank 'table' over 'feed' by alphabet, not
    // by authority. A numeric rank keeps the aggregation honest on existing databases too.
    const usageColumns = this.db.prepare('PRAGMA table_info(usage_events)').all().map(column => column.name);
    if (!usageColumns.includes('cost_rank')) {
      this.db.exec('ALTER TABLE usage_events ADD COLUMN cost_rank INTEGER DEFAULT 0');
    }
    if (!usageColumns.includes('dedupe_key')) {
      this.db.exec('ALTER TABLE usage_events ADD COLUMN dedupe_key TEXT');
    }
  }

  // Rows written before `project` existed carry only cwd; fill them in once so the
  // bubble of a session that never re-registers still names its repo.
  backfillMissingProjectNames() {
    try {
      const rows = this.db.prepare('SELECT id, cwd FROM sessions WHERE project IS NULL').all();
      const update = this.db.prepare('UPDATE sessions SET project = ? WHERE id = ?');
      for (const row of rows) {
        const name = projectNameFromCwd(row.cwd);
        if (name) update.run(name, row.id);
      }
    } catch {
      // Non-critical cosmetic backfill; startup must not fail on it.
    }
  }

  backfillWaitingPromptTasks() {
    try {
      const sessions = this.db.prepare('SELECT id, cwd, task FROM sessions WHERE task IS NOT NULL').all();
      const updateTask = this.db.prepare('UPDATE sessions SET task = ? WHERE id = ?');

      for (const session of sessions) {
        if (!isWaitingPromptTask(session.task)) continue;

        const prompt = getLastPiCliPrompt(session.cwd || process.cwd(), session.id);
        if (prompt) updateTask.run(prompt, session.id);
      }
    } catch {
      // Non-critical cleanup only; keep server startup resilient.
    }
  }

  shortSessionSuffix(sessionId) {
    const clean = String(sessionId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6);
    return clean || Math.random().toString(36).slice(2, 8);
  }

  makeUniqueActiveSessionName(baseName, sessionId) {
    const activeNames = this.db.prepare(`
      SELECT name FROM sessions
      WHERE id != ? AND status != 'offline'
    `).all(sessionId).map(row => row.name);

    if (!activeNames.includes(baseName)) return baseName;

    const suffix = this.shortSessionSuffix(sessionId);
    const candidate = `${baseName} · ${suffix}`;
    if (!activeNames.includes(candidate)) return candidate;

    let counter = 2;
    while (activeNames.includes(`${candidate}-${counter}`)) counter++;
    return `${candidate}-${counter}`;
  }

  upsertSession(data) {
    const now = Date.now();
    const existing = this.getSession(data.id);

    // Why: SQLite checks NOT NULL on the VALUES row *before* ON CONFLICT runs, so an
    // update that omits a column must still insert a concrete value. Merge with the
    // existing row here and let the DO UPDATE write those same merged values.
    const pick = (key, fallback) => {
      const value = data[key];
      if (value !== undefined && value !== null) return value;
      if (existing && existing[key] !== undefined && existing[key] !== null) return existing[key];
      return fallback;
    };

    const cwd = pick('cwd', process.cwd());
    const project = pick('project', projectNameFromCwd(cwd));
    const machineId = pick('machine_id', null);
    const machineName = pick('machine_name', null);
    const orcaName = pick('orca_name', null);
    const orcaWorkspace = pick('orca_workspace', null);
    const orcaPane = pick('orca_pane', null);
    const clientKind = pick('client_kind', null);
    const hasExplicitTask = data.task !== undefined && data.task !== null;
    const needsPiPromptFallback = !hasExplicitTask || isWaitingPromptTask(data.task);
    const lastPiPrompt = needsPiPromptFallback ? getLastPiCliPrompt(cwd, data.id) : null;
    const task = hasExplicitTask && !isWaitingPromptTask(data.task)
      ? data.task
      : (lastPiPrompt ?? existing?.task ?? 'Belum ada prompt Pi CLI');
    const name = pick('name', 'Pegawai Pi');

    const stmt = this.db.prepare(`
      INSERT INTO sessions (
        id, name, role, avatar, color, cwd, project, machine_id, machine_name,
        orca_name, orca_workspace, orca_pane, client_kind, model, pid, task, status,
        is_subagent, parent_session_id, started_at, last_heartbeat
      ) VALUES (
        $id, $name, $role, $avatar, $color, $cwd, $project, $machine_id, $machine_name,
        $orca_name, $orca_workspace, $orca_pane, $client_kind, $model, $pid, $task, $status,
        $is_subagent, $parent_session_id, $started_at, $last_heartbeat
      )
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
        task = excluded.task,
        status = excluded.status,
        model = excluded.model,
        pid = excluded.pid,
        is_subagent = excluded.is_subagent,
        parent_session_id = excluded.parent_session_id,
        started_at = excluded.started_at,
        last_heartbeat = excluded.last_heartbeat;
    `);

    stmt.run({
      $id: data.id,
      $name: this.makeUniqueActiveSessionName(name, data.id),
      $role: pick('role', 'Developer'),
      $avatar: pick('avatar', '🧑‍💻'),
      $color: pick('color', '#38bdf8'),
      $cwd: cwd,
      $project: project,
      $machine_id: machineId,
      $machine_name: machineName,
      $orca_name: orcaName,
      $orca_workspace: orcaWorkspace,
      $orca_pane: orcaPane,
      $client_kind: clientKind,
      $model: pick('model', 'pi'),
      $pid: Number.isInteger(data.pid) && data.pid > 0 ? data.pid : (existing?.pid ?? null),
      $task: task,
      $status: pick('status', 'working'),
      $is_subagent: data.is_subagent !== undefined ? (data.is_subagent ? 1 : 0) : (existing?.is_subagent ?? 0),
      $parent_session_id: data.parent_session_id || existing?.parent_session_id || null,
      $started_at: data.started_at || existing?.started_at || now,
      $last_heartbeat: now
    });

    return this.getSession(data.id);
  }

  endSession(id) {
    const now = Date.now();
    this.db.prepare(`
      UPDATE sessions SET status = 'offline', ended_at = ? WHERE id = ?
    `).run(now, id);
  }

  /**
   * Retire sessions whose recorded Pi CLI process is provably gone. Only a read of
   * /proc/<pid> — never a signal, never a process sweep — and only sessions that
   * reported a pid, so a pid-less row is left alone rather than guessed at.
   */
  reapDeadSessions() {
    if (!fs.existsSync('/proc')) return [];
    const rows = this.db.prepare(
      "SELECT id, name, pid FROM sessions WHERE status != 'offline' AND pid IS NOT NULL AND pid > 0"
    ).all();
    const dead = rows.filter((row) => !fs.existsSync(`/proc/${row.pid}`));
    for (const row of dead) this.endSession(row.id);
    return dead;
  }

  /**
   * One-time startup sweep for rows written before sessions carried a pid: no process
   * proof and no contact for `olderThanMs` means abandoned. Deliberately not on a timer —
   * an idle-but-live Pi session stays quiet for a long time and must not be guessed at.
   */
  reapAbandonedSessions(olderThanMs) {
    const cutoff = Date.now() - olderThanMs;
    const rows = this.db.prepare(
      "SELECT id, name FROM sessions WHERE status != 'offline' AND (pid IS NULL OR pid <= 0) AND COALESCE(last_heartbeat, 0) < ?"
    ).all(cutoff);
    for (const row of rows) this.endSession(row.id);
    return rows;
  }

  recordToolCall(tc) {
    const stmt = this.db.prepare(`
      INSERT INTO tool_calls (
        id, session_id, tool_name, input_json, result_json, is_error, duration_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        result_json = excluded.result_json,
        is_error = excluded.is_error,
        duration_ms = excluded.duration_ms
    `);

    stmt.run(
      tc.id,
      tc.session_id,
      tc.tool_name,
      typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input || {}),
      tc.result ? (typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result)) : null,
      tc.is_error ? 1 : 0,
      tc.duration_ms || 0,
      tc.created_at || Date.now()
    );
  }

  appendLog(log) {
    const stmt = this.db.prepare(`
      INSERT INTO logs (session_id, level, source, message, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      log.session_id || null,
      log.level || 'info',
      log.source || 'pi-dev',
      log.message,
      Date.now()
    );
  }

  getSession(id) {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  }

  getActiveSessions() {
    return this.db.prepare(`
      SELECT * FROM sessions 
      WHERE status != 'offline' 
      ORDER BY last_heartbeat DESC
    `).all();
  }

  getRecentToolCalls(limit = 40) {
    return this.db.prepare(`
      SELECT tc.*, s.name as session_name, s.avatar as session_avatar
      FROM tool_calls tc
      LEFT JOIN sessions s ON tc.session_id = s.id
      ORDER BY tc.created_at DESC
      LIMIT ?
    `).all(limit);
  }

  getRecentLogs(limit = 100) {
    return this.db.prepare(`
      SELECT l.*, s.name as session_name, s.avatar as session_avatar
      FROM logs l
      LEFT JOIN sessions s ON l.session_id = s.id
      ORDER BY l.id DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * One LLM call = one receipt line. Cost is resolved at write time (price table or
   * Pi-reported) so a later pricing edit never rewrites history silently.
   */
  recordUsage(evt) {
    const nonNeg = (value) => {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
    };

    const usage = {
      input: nonNeg(evt.input ?? evt.input_tokens),
      output: nonNeg(evt.output ?? evt.output_tokens),
      cacheRead: nonNeg(evt.cache_read ?? evt.cacheReadTokens ?? evt.cache_read_tokens),
      cacheWrite: nonNeg(evt.cache_write ?? evt.cacheWriteTokens ?? evt.cache_write_tokens)
    };
    const bucketSum = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
    const totalTokens = nonNeg(evt.total_tokens ?? evt.totalTokens) || bucketSum;
    const model = String(evt.model || 'pi-model').trim().slice(0, 200) || 'pi-model';
    const provider = evt.provider ? String(evt.provider).trim().slice(0, 120) : null;

    const { cost, costSource } = resolveUsageCost({
      model,
      provider,
      usage,
      reportedCost: Number(evt.reported_cost ?? evt.cost ?? 0)
    });

    const createdAt = Number(evt.created_at) || Date.now();
    const dedupeKey = evt.dedupe_key ? String(evt.dedupe_key).slice(0, 300) : null;
    const inserted = this.db.prepare(`
      INSERT INTO usage_events (
        session_id, model, provider, input_tokens, output_tokens,
        cache_read_tokens, cache_write_tokens, total_tokens, cost, cost_source, cost_rank,
        dedupe_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    `).run(
      String(evt.session_id || 'unknown'),
      model,
      provider,
      usage.input,
      usage.output,
      usage.cacheRead,
      usage.cacheWrite,
      totalTokens,
      cost,
      costSource,
      COST_RANK[costSource] ?? 0,
      dedupeKey,
      createdAt
    ).changes > 0;

    return { session_id: evt.session_id, model, provider, totalTokens, cost, costSource, inserted };
  }

  /**
   * The coffee-shop bill: every token ever drunk, grouped per guest (session) and
   * per brew (model). Offline sessions stay on the books — a receipt does not vanish
   * when the customer leaves.
   */
  getBilling() {
    const rows = this.db.prepare(`
      SELECT
        u.session_id            AS sessionId,
        u.model                 AS model,
        MAX(u.provider)         AS provider,
        SUM(u.input_tokens)     AS inputTokens,
        SUM(u.output_tokens)    AS outputTokens,
        SUM(u.cache_read_tokens)  AS cacheReadTokens,
        SUM(u.cache_write_tokens) AS cacheWriteTokens,
        SUM(u.total_tokens)     AS totalTokens,
        SUM(u.cost)             AS cost,
        COUNT(*)                AS turns,
        MIN(u.created_at)       AS firstUsedAt,
        MAX(u.created_at)       AS lastUsedAt,
        MAX(u.cost_rank)        AS costRank,
        s.name                  AS name,
        s.avatar                AS avatar,
        s.color                 AS color,
        s.is_subagent           AS isSubagent,
        s.status                AS status
      FROM usage_events u
      LEFT JOIN sessions s ON s.id = u.session_id
      GROUP BY u.session_id, u.model
    `).all();

    // Why: this whole summary is broadcast on every LLM turn, so each receipt line keeps
    // only what the bill renders — no duplicated session fields per model.
    const withRates = rows.map((row) => {
      const totalTokens = row.totalTokens || 0;
      const cost = row.cost || 0;
      const ratePerToken = totalTokens > 0 ? cost / totalTokens : 0;
      return {
        line: {
          model: row.model,
          provider: row.provider || null,
          inputTokens: row.inputTokens || 0,
          outputTokens: row.outputTokens || 0,
          cacheReadTokens: row.cacheReadTokens || 0,
          cacheWriteTokens: row.cacheWriteTokens || 0,
          totalTokens,
          cost,
          turns: row.turns || 0,
          costSource: RANK_COST_SOURCE[row.costRank ?? 0] || 'none',
          firstUsedAt: row.firstUsedAt || 0,
          lastUsedAt: row.lastUsedAt || 0,
          ratePerToken,
          ratePerMillion: ratePerToken * 1_000_000
        },
        sessionId: row.sessionId,
        session: {
          name: row.name,
          avatar: row.avatar,
          color: row.color,
          isSubagent: row.isSubagent,
          status: row.status
        }
      };
    });

    const users = new Map();
    const menu = new Map();

    for (const entry of withRates) {
      const line = entry.line;
      const session = entry.session;
      const userId = entry.sessionId || 'unknown';
      let user = users.get(userId);
      if (!user) {
        user = {
          sessionId: userId,
          name: session.name || `Sesi ${String(userId).slice(0, 8)}`,
          avatar: session.avatar || '☕',
          color: session.color || '#38bdf8',
          isSubagent: session.isSubagent || 0,
          status: session.status || 'offline',
          totalTokens: 0,
          cost: 0,
          turns: 0,
          lastUsedAt: 0,
          lines: []
        };
        users.set(userId, user);
      }
      user.totalTokens += line.totalTokens;
      user.cost += line.cost;
      user.turns += line.turns;
      user.lastUsedAt = Math.max(user.lastUsedAt, line.lastUsedAt || 0);
      if (session.name) {
        user.name = session.name;
        user.avatar = session.avatar || user.avatar;
        user.color = session.color || user.color;
        user.isSubagent = session.isSubagent || 0;
        user.status = session.status || user.status;
      }
      user.lines.push(line);

      let brew = menu.get(line.model);
      if (!brew) {
        brew = {
          model: line.model,
          provider: line.provider || null,
          totalTokens: 0,
          cost: 0,
          turns: 0,
          firstUsedAt: line.firstUsedAt || Date.now(),
          lastUsedAt: 0,
          costSource: line.costSource,
          drinkers: new Set()
        };
        menu.set(line.model, brew);
      }
      brew.totalTokens += line.totalTokens;
      brew.cost += line.cost;
      brew.turns += line.turns;
      brew.firstUsedAt = Math.min(brew.firstUsedAt, line.firstUsedAt || Date.now());
      brew.lastUsedAt = Math.max(brew.lastUsedAt, line.lastUsedAt || 0);
      brew.drinkers.add(userId);
    }

    const userList = [...users.values()]
      .map((user) => ({
        ...user,
        cost: roundCost(user.cost),
        ratePerToken: user.totalTokens > 0 ? user.cost / user.totalTokens : 0,
        lines: user.lines
          .map((line) => ({ ...line, cost: roundCost(line.cost) }))
          .sort((a, b) => b.totalTokens - a.totalTokens)
      }))
      .sort((a, b) => b.cost - a.cost || b.totalTokens - a.totalTokens);

    const menuList = [...menu.values()]
      .map((brew) => ({
        model: brew.model,
        provider: brew.provider,
        totalTokens: brew.totalTokens,
        cost: roundCost(brew.cost),
        turns: brew.turns,
        firstUsedAt: brew.firstUsedAt,
        lastUsedAt: brew.lastUsedAt,
        costSource: brew.costSource,
        drinkerCount: brew.drinkers.size,
        ratePerToken: brew.totalTokens > 0 ? brew.cost / brew.totalTokens : 0,
        ratePerMillion:
          brew.totalTokens > 0 ? (brew.cost / brew.totalTokens) * 1_000_000 : 0
      }))
      .sort((a, b) => a.firstUsedAt - b.firstUsedAt);

    const totals = userList.reduce(
      (acc, user) => ({
        totalTokens: acc.totalTokens + user.totalTokens,
        cost: acc.cost + user.cost,
        turns: acc.turns + user.turns
      }),
      { totalTokens: 0, cost: 0, turns: 0 }
    );

    return {
      generatedAt: Date.now(),
      users: userList,
      menu: menuList,
      totals: {
        totalTokens: totals.totalTokens,
        cost: roundCost(totals.cost),
        turns: totals.turns,
        users: userList.length,
        models: menuList.length
      }
    };
  }

  getFullState() {
    return {
      sessions: this.getActiveSessions(),
      recent_tool_calls: this.getRecentToolCalls(30),
      recent_logs: this.getRecentLogs(50),
      billing: this.getBilling(),
      stats: {
        total_active: this.getActiveSessions().length,
        timestamp: Date.now()
      }
    };
  }
}
