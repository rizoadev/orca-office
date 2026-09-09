// Satu jalur DB: libSQL. `file:` = SQLite lokal, `libsql://`/https = Turso cloud.
//
// Kenapa `file:` dan bukan node:sqlite: migrasi Turso membuat seluruh query async,
// dan `createOfficeServer({ dbPath })` (test e2e, `--db`) masih mengharapkan DB
// terisolasi. libSQL sudah bisa keduanya lewat satu API, jadi tidak perlu dua
// driver — satu implementasi, dan jalur yang diuji test adalah jalur yang dipakai produksi.

import path from 'node:path';
import { createClient } from '@libsql/client';
import { resolveUsageCost, COST_RANK, RANK_COST_SOURCE } from './pricing.js';
import { getLastPiCliPrompt, isWaitingPromptTask, projectNameFromCwd, readLocalMachineId, roundCost } from '../../lib/session-utils.ts';
import fs from 'node:fs';

// ── Turso wrapper ──────────────────────────────────────────────────────
// Mengeksekusi query via @libsql/client (async) sambil mempertahankan
// pola `this.db.prepare(sql).run/get/all(args)` warisan node:sqlite.
// Setiap method mengembalikan Promise — caller wajib `await`.
/** Normalisasi target DB jadi URL libSQL. `office.db`/`/tmp/x.db` → `file:`. */
export function resolveDatabaseUrl(target) {
  const value = target || process.env.TURSO_DATABASE_URL;
  if (!value) {
    throw new Error(
      'DB tidak terkonfigurasi: set TURSO_DATABASE_URL (libsql://…) di .env, ' +
      'atau jalankan dengan target SQLite lokal lewat --db / createOfficeServer({ dbPath }).'
    );
  }
  // `file:` diterima apa adanya — libSQL menerima bentuk satu-garis-miring (`file:/tmp/x.db`).
  // Membungkusnya lagi dengan path.resolve menghasilkan `<cwd>/file:/tmp/x.db`: file DB
  // dibuat di tempat tak terduga dan test/audit seolah jalan di DB kosong.
  if (/^file:/i.test(value)) return value;
  if (/^(libsql|https|wss):\/\//.test(value)) return value;
  if (value === ':memory:') return value;
  return `file:${path.resolve(value)}`;
}

function createDbClient(target) {
  const url = resolveDatabaseUrl(target);
  // authToken hanya untuk URL remote: libSQL menolaknya pada `file:`.
  const authToken = url.startsWith('file:') || url === ':memory:' ? undefined : process.env.TURSO_AUTH_TOKEN;
  if (!authToken && !url.startsWith('file:') && url !== ':memory:' && !process.env.TURSO_AUTH_TOKEN) {
    throw new Error('TURSO_AUTH_TOKEN wajib diisi untuk database remote.');
  }

  const client = createClient({ url, authToken });

  return {
    url,

    /** DDL tunggal. */
    exec(sql) {
      return client.execute(sql);
    },

    /** Batch atomik — dipakai untuk schema init. */
    batch(stmts) {
      return client.batch(stmts);
    },

    close() {
      client.close?.();
    },

    /** Mirip node:sqlite prepare(). */
    prepare(sql) {
      const wrap = (method) => (...args) => {
        // Normalize args:
        //   .all()           → no args (raw SQL)
        //   .all(30)         → [30]
        //   .run(a, b)       → [a, b]
        //   .run({$id: 'x'}) → named object
        let payload;
        if (args.length === 0) {
          payload = sql;
        } else if (args.length === 1 && args[0] != null && typeof args[0] === 'object' && !Array.isArray(args[0])) {
          // Named params object (e.g. { $id: 'x' })
          payload = { sql, args: args[0] };
        } else {
          // Positional args (e.g. .run('a', 'b') or .all(30))
          payload = { sql, args };
        }
        return client.execute(payload).then(method);
      };
      return {
        run: wrap((r) => ({
          changes: r.rowsAffected,
          lastInsertRowid: Number(r.lastInsertRowid) || 0,
        })),
        get: wrap((r) => r.rows[0] || undefined),
        all: wrap((r) => r.rows),
      };
    },
  };
}

// ── OfficeDB ──────────────────────────────────────────────────────────

export class OfficeDB {
  constructor(dbPath = null) {
    this.db = createDbClient(dbPath);
    // Schema saja yang blocking. Backfill sengaja TIDAK di jalan yang sama:
    // keduanya UPDATE baris per baris, dan pada Turso tiap statement = satu
    // round-trip jaringan. Dulu itu membuat `listen` tertunda puluhan detik,
    // sehingga start-dev.sh melaporkan "Hub tidak merespons" padahal hubnya sehat.
    //
    // Kontrak: pemanggil tidak melayani query sebelum `ready()` selesai
    // (index.js await sebelum `listen`). Satu titik, bukan gate per-method —
    // dulu ada `_waitReady()` dengan komentar "dipanggil di awal setiap method
    // publik" padahal tidak pernah dipanggil; dihapus karena rasa aman palsu.
    this._ready = this._initSchema();
    this._backfillReady = this._ready
      .then(() => Promise.all([this.backfillWaitingPromptTasks(), this.backfillMissingProjectNames()]))
      .catch((err) => console.error('⚠️ [backfill] error:', err?.message || err));
  }

  /**
   * Apakah baris yang kita tulis bakal mendarat di luar mesin ini.
   * Ini fakta penyimpanan, bukan fakta jaringan — `http://127.0.0.1:4317` yang menulis
   * ke Turso tetap 'remote', dan justru keadaan itulah yang lolos dari sensor sisi klien.
   */
  get storageIsRemote() { return !this.db.url.startsWith('file:'); }

  /** Selesaikan sebelum query pertama apa pun (lihat kontrak di constructor). */
  ready() { return this._ready; }

  /** Buat test/tool yang butuh DB sudah ter-backfill; gagal sudah di-log internal. */
  backfillReady() { return this._backfillReady; }

  async _initSchema() {
    // ── CREATE TABLE (batch atomik) ────────────────────────────────────
    // WAL hanya untuk `file:` (hub lokal masih melayani HTTP + WS bersamaan);
    // Turso sudah dikelola di sisinya sendiri.
    // Schema di-batch supaya tidak ada partial state.
    if (this.db.url.startsWith('file:')) {
      await this.db.exec('PRAGMA journal_mode = WAL;');
    }

    await this.db.batch([
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
        created_at INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
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
        created_at INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`,
      `CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id)`,
      `CREATE INDEX IF NOT EXISTS idx_logs_session ON logs(session_id)`,
      `CREATE INDEX IF NOT EXISTS idx_usage_session_model ON usage_events(session_id, model)`,
      `CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_events(created_at)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_dedupe ON usage_events(dedupe_key) WHERE dedupe_key IS NOT NULL`,
    ]);

    // ── Migrasi kolom (untuk database Turso yang mungkin sudah ada) ────
    // ALTER TABLE ADD COLUMN melempar error kalau kolom sudah ada —
    // dibungkus try-catch supaya startup tetap jalan.
    const migrations = [
      ['sessions', 'pid INTEGER'],
      ['sessions', 'project TEXT'],
      ['sessions', 'machine_id TEXT'],
      ['sessions', 'machine_name TEXT'],
      ['sessions', 'orca_name TEXT'],
      ['sessions', 'orca_workspace TEXT'],
      ['sessions', 'orca_pane TEXT'],
      ['sessions', 'client_kind TEXT'],
      ['usage_events', 'cost_rank INTEGER DEFAULT 0'],
      ['usage_events', 'dedupe_key TEXT'],
    ];
    for (const [table, colDef] of migrations) {
      try {
        await this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
      } catch { /* kolom sudah ada — skip */ }
    }
  }

  // ── Backfill (filesystem → DB) ──────────────────────────────────────

  async backfillMissingProjectNames() {
    try {
      const rows = await this.db.prepare('SELECT id, cwd FROM sessions WHERE project IS NULL').all();
      const stmt = this.db.prepare('UPDATE sessions SET project = ? WHERE id = ?');
      for (const row of rows) {
        const name = projectNameFromCwd(row.cwd);
        if (name) await stmt.run(name, row.id);
      }
    } catch { /* non-critical */ }
  }

  async backfillWaitingPromptTasks() {
    try {
      const sessions = await this.db.prepare('SELECT id, cwd, task FROM sessions WHERE task IS NOT NULL').all();
      const stmt = this.db.prepare('UPDATE sessions SET task = ? WHERE id = ?');
      for (const session of sessions) {
        if (!isWaitingPromptTask(session.task)) continue;
        const prompt = getLastPiCliPrompt(session.cwd || process.cwd(), session.id);
        if (prompt) await stmt.run(prompt, session.id);
      }
    } catch { /* non-critical */ }
  }

  // ── Session helpers ─────────────────────────────────────────────────

  shortSessionSuffix(sessionId) {
    const clean = String(sessionId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6);
    return clean || Math.random().toString(36).slice(2, 8);
  }

  async makeUniqueActiveSessionName(baseName, sessionId) {
    const rows = await this.db.prepare(
      'SELECT name FROM sessions WHERE id != ? AND status != ?'
    ).all(sessionId, 'offline');
    const activeNames = rows.map(row => row.name);

    if (!activeNames.includes(baseName)) return baseName;
    const suffix = this.shortSessionSuffix(sessionId);
    const candidate = `${baseName} · ${suffix}`;
    if (!activeNames.includes(candidate)) return candidate;
    let counter = 2;
    while (activeNames.includes(`${candidate}-${counter}`)) counter++;
    return `${candidate}-${counter}`;
  }

  async upsertSession(data) {
    const now = Date.now();
    const existing = await this.getSession(data.id);

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
    const pid = Number.isInteger(data.pid) && data.pid > 0 ? data.pid : (existing?.pid ?? null);
    const isSub = data.is_subagent !== undefined ? (data.is_subagent ? 1 : 0) : (existing?.is_subagent ?? 0);
    const parentSid = data.parent_session_id || existing?.parent_session_id || null;
    const startedAt = data.started_at || existing?.started_at || now;

    await this.db.prepare(`
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
        last_heartbeat = excluded.last_heartbeat
    `).run({
      $id: data.id,
      $name: await this.makeUniqueActiveSessionName(name, data.id),
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
      $pid: pid,
      $task: task,
      $status: pick('status', 'working'),
      $is_subagent: isSub,
      $parent_session_id: parentSid,
      $started_at: startedAt,
      $last_heartbeat: now,
    });

    return this.getSession(data.id);
  }

  async endSession(id) {
    const now = Date.now();
    await this.db.prepare('UPDATE sessions SET status = ?, ended_at = ? WHERE id = ?')
      .run('offline', now, id);
  }

  /**
   * Tandai offline sesi yang prosesnya terbukti mati.
   *
   * WAJIB dibatasi ke mesin ini. Semua laptop sekarang menulis ke Turso yang sama,
   * sementara `/proc/<pid>` hanyalah milik mesin tempat hub berjalan — tanpa filter
   * ini, hub di laptop A akan melihat pid sesi laptop B "tidak ada" dan mematikan
   * sesi orang lain. Sesi mesin lain tetap dibersihkan reapAbandonedSessions lewat
   * heartbeat, yang memang lintas mesin.
   */
  async reapDeadSessions() {
    if (!fs.existsSync('/proc')) return [];
    const machineId = readLocalMachineId();
    if (!machineId) return [];   // tanpa identitas, tidak ada hak mematikan sesi siapa pun
    const rows = await this.db.prepare(
      "SELECT id, name, pid FROM sessions WHERE status != 'offline' AND pid IS NOT NULL AND pid > 0 AND machine_id = ?"
    ).all(machineId);
    const dead = rows.filter((row) => !fs.existsSync(`/proc/${row.pid}`));
    for (const row of dead) await this.endSession(row.id);
    return dead;
  }

  async reapAbandonedSessions(olderThanMs) {
    const cutoff = Date.now() - olderThanMs;
    const rows = await this.db.prepare(
      "SELECT id, name FROM sessions WHERE status != 'offline' AND (pid IS NULL OR pid <= 0) AND COALESCE(last_heartbeat, 0) < ?"
    ).all(cutoff);
    for (const row of rows) await this.endSession(row.id);
    return rows;
  }

  // ── Tool calls ──────────────────────────────────────────────────────

  async recordToolCall(tc) {
    await this.db.prepare(`
      INSERT INTO tool_calls (
        id, session_id, tool_name, input_json, result_json, is_error, duration_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        result_json = excluded.result_json,
        is_error = excluded.is_error,
        duration_ms = excluded.duration_ms
    `).run(
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

  // ── Logs ────────────────────────────────────────────────────────────

  async appendLog(log) {
    await this.db.prepare(
      'INSERT INTO logs (session_id, level, source, message, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(log.session_id || null, log.level || 'info', log.source || 'pi-dev', log.message, Date.now());
  }

  // ── Reads ───────────────────────────────────────────────────────────

  async getSession(id) {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  }

  async getActiveSessions() {
    return this.db.prepare(
      "SELECT * FROM sessions WHERE status != 'offline' ORDER BY last_heartbeat DESC"
    ).all();
  }

  async getRecentToolCalls(limit = 40) {
    return this.db.prepare(`
      SELECT tc.*, s.name as session_name, s.avatar as session_avatar
      FROM tool_calls tc LEFT JOIN sessions s ON tc.session_id = s.id
      ORDER BY tc.created_at DESC LIMIT ?
    `).all(limit);
  }

  async getRecentLogs(limit = 100) {
    return this.db.prepare(`
      SELECT l.*, s.name as session_name, s.avatar as session_avatar
      FROM logs l LEFT JOIN sessions s ON l.session_id = s.id
      ORDER BY l.id DESC LIMIT ?
    `).all(limit);
  }

  // ── Usage / billing ─────────────────────────────────────────────────

  async recordUsage(evt) {
    const nonNeg = (value) => {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
    };

    const usage = {
      input: nonNeg(evt.input ?? evt.input_tokens),
      output: nonNeg(evt.output ?? evt.output_tokens),
      cacheRead: nonNeg(evt.cache_read ?? evt.cacheReadTokens ?? evt.cache_read_tokens),
      cacheWrite: nonNeg(evt.cache_write ?? evt.cacheWriteTokens ?? evt.cache_write_tokens),
    };
    const bucketSum = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
    const totalTokens = nonNeg(evt.total_tokens ?? evt.totalTokens) || bucketSum;
    const model = String(evt.model || 'pi-model').trim().slice(0, 200) || 'pi-model';
    const provider = evt.provider ? String(evt.provider).trim().slice(0, 120) : null;

    const { cost, costSource } = resolveUsageCost({
      model, provider, usage,
      reportedCost: Number(evt.reported_cost ?? evt.cost ?? 0),
    });

    const createdAt = Number(evt.created_at) || Date.now();
    const dedupeKey = evt.dedupe_key ? String(evt.dedupe_key).slice(0, 300) : null;

    const result = await this.db.prepare(`
      INSERT INTO usage_events (
        session_id, model, provider, input_tokens, output_tokens,
        cache_read_tokens, cache_write_tokens, total_tokens, cost, cost_source, cost_rank,
        dedupe_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    `).run(
      String(evt.session_id || 'unknown'),
      model, provider,
      usage.input, usage.output, usage.cacheRead, usage.cacheWrite,
      totalTokens, cost, costSource, COST_RANK[costSource] ?? 0,
      dedupeKey, createdAt
    );

    return { session_id: evt.session_id, model, provider, totalTokens, cost, costSource, inserted: result.changes > 0 };
  }

  async getBilling() {
    const rows = await this.db.prepare(`
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

    const withRates = rows.map((row) => {
      const totalTokens = row.totalTokens || 0;
      const cost = row.cost || 0;
      const ratePerToken = totalTokens > 0 ? cost / totalTokens : 0;
      return {
        line: {
          model: row.model, provider: row.provider || null,
          inputTokens: row.inputTokens || 0, outputTokens: row.outputTokens || 0,
          cacheReadTokens: row.cacheReadTokens || 0, cacheWriteTokens: row.cacheWriteTokens || 0,
          totalTokens, cost, turns: row.turns || 0,
          costSource: RANK_COST_SOURCE[row.costRank ?? 0] || 'none',
          firstUsedAt: row.firstUsedAt || 0, lastUsedAt: row.lastUsedAt || 0,
          ratePerToken, ratePerMillion: ratePerToken * 1_000_000,
        },
        sessionId: row.sessionId,
        session: { name: row.name, avatar: row.avatar, color: row.color, isSubagent: row.isSubagent, status: row.status },
      };
    });

    const users = new Map();
    const menu = new Map();

    for (const entry of withRates) {
      const { line, sessionId, session } = entry;
      const userId = sessionId || 'unknown';
      let user = users.get(userId);
      if (!user) {
        user = {
          sessionId: userId, name: session.name || `Sesi ${String(userId).slice(0, 8)}`,
          avatar: session.avatar || '☕', color: session.color || '#38bdf8',
          isSubagent: session.isSubagent || 0, status: session.status || 'offline',
          totalTokens: 0, cost: 0, turns: 0, lastUsedAt: 0, lines: [],
        };
        users.set(userId, user);
      }
      user.totalTokens += line.totalTokens;
      user.cost += line.cost;
      user.turns += line.turns;
      user.lastUsedAt = Math.max(user.lastUsedAt, line.lastUsedAt || 0);
      if (session.name) {
        user.name = session.name; user.avatar = session.avatar || user.avatar;
        user.color = session.color || user.color;
        user.isSubagent = session.isSubagent || 0; user.status = session.status || user.status;
      }
      user.lines.push(line);

      let brew = menu.get(line.model);
      if (!brew) {
        brew = {
          model: line.model, provider: line.provider || null,
          totalTokens: 0, cost: 0, turns: 0,
          firstUsedAt: line.firstUsedAt || Date.now(), lastUsedAt: 0,
          costSource: line.costSource, drinkers: new Set(),
        };
        menu.set(line.model, brew);
      }
      brew.totalTokens += line.totalTokens; brew.cost += line.cost; brew.turns += line.turns;
      brew.firstUsedAt = Math.min(brew.firstUsedAt, line.firstUsedAt || Date.now());
      brew.lastUsedAt = Math.max(brew.lastUsedAt, line.lastUsedAt || 0);
      brew.drinkers.add(userId);
    }

    const userList = [...users.values()]
      .map((u) => ({
        ...u, cost: roundCost(u.cost),
        ratePerToken: u.totalTokens > 0 ? u.cost / u.totalTokens : 0,
        lines: u.lines.map((l) => ({ ...l, cost: roundCost(l.cost) })).sort((a, b) => b.totalTokens - a.totalTokens),
      }))
      .sort((a, b) => b.cost - a.cost || b.totalTokens - a.totalTokens);

    const menuList = [...menu.values()]
      .map((b) => ({
        model: b.model, provider: b.provider, totalTokens: b.totalTokens,
        cost: roundCost(b.cost), turns: b.turns,
        firstUsedAt: b.firstUsedAt, lastUsedAt: b.lastUsedAt, costSource: b.costSource,
        drinkerCount: b.drinkers.size,
        ratePerToken: b.totalTokens > 0 ? b.cost / b.totalTokens : 0,
        ratePerMillion: b.totalTokens > 0 ? (b.cost / b.totalTokens) * 1_000_000 : 0,
      }))
      .sort((a, b) => a.firstUsedAt - b.firstUsedAt);

    const totals = userList.reduce(
      (acc, u) => ({ totalTokens: acc.totalTokens + u.totalTokens, cost: acc.cost + u.cost, turns: acc.turns + u.turns }),
      { totalTokens: 0, cost: 0, turns: 0 }
    );

    return {
      generatedAt: Date.now(),
      users: userList,
      menu: menuList,
      totals: {
        totalTokens: totals.totalTokens, cost: roundCost(totals.cost),
        turns: totals.turns, users: userList.length, models: menuList.length,
      },
    };
  }

  async getFullState() {
    const sessions = await this.getActiveSessions();
    const recent_tool_calls = await this.getRecentToolCalls(30);
    const recent_logs = await this.getRecentLogs(50);
    const billing = await this.getBilling();
    return {
      sessions, recent_tool_calls, recent_logs, billing,
      stats: { total_active: sessions.length, timestamp: Date.now() },
    };
  }
}
