// ── Single source of truth for office utilities ────────────────────────
//
// Dipakai oleh TIGA konsumen:
//   1. extension/*.ts        → di-bundle ke extensions-global/pi-office.ts
//   2. server/src/db.js      → hub lokal (Turso)
//   3. tools/*.js            → skrip maintenance
//
// Kenapa satu file: fungsi-fungsi ini dulu diduplikasi antara extension dan
// server, lalu di-split separuh-separuh — hasilnya `roundCost is not defined`
// di server dan bundle extension global yang kehilangan definisi. Satu file,
// satu salinan, semua import dari sini.
//
// Aturan: TIDAK boleh ada dependensi ke DB, Pi runtime API, atau module lain.
// Hanya `node:fs`, `node:path`, dan `process.env` — supaya bisa di-inline ke
// bundle extension dan tetap jalan di server biasa.

import fs from 'node:fs';
import path from 'node:path';

// ── Pi session log readers ─────────────────────────────────────────────

/** Trim + collapse whitespace, truncate ke maxLength karakter. */
export function summarizePrompt(prompt: string, maxLength = 80): string {
  const clean = prompt.trim().replace(/\s+/g, ' ');
  return clean.length > maxLength ? clean.slice(0, maxLength - 3) + '...' : clean;
}

/** Root direktori session logs Pi CLI. */
export function getPiSessionsRoot(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return process.env.PI_SESSIONS_DIR || path.join(home, '.pi', 'agent', 'sessions');
}

/** Encode cwd jadi nama folder aman di bawah Pi sessions root. */
export function encodeCwdForPiSessions(cwd: string): string {
  return `--${path.resolve(cwd).replace(/^\/+/, '').replace(/\/+$/g, '').replace(/\/+/g, '-')}--`;
}

/** File JSONL session log, terbaru dulu, dibatasi 50. */
export function getSessionLogFiles(cwd: string, sessionId: string | null = null): string[] {
  const root = getPiSessionsRoot();
  const primaryDir = path.join(root, encodeCwdForPiSessions(cwd));
  const dirs: string[] = fs.existsSync(primaryDir)
    ? [primaryDir]
    : fs.existsSync(root)
      ? fs.readdirSync(root)
        .filter((entry) => entry.startsWith('--'))
        .map((entry) => path.join(root, entry))
      : [];

  const files = dirs.flatMap((dir) => {
    try {
      return fs.readdirSync(dir)
        .filter((file) => file.endsWith('.jsonl'))
        .map((file) => path.join(dir, file));
    } catch {
      return [];
    }
  });

  const scoped = sessionId
    ? files.filter((file) => path.basename(file).includes(sessionId))
    : files;

  return scoped
    .map((file) => ({ file, mtimeMs: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 50)
    .map(({ file }) => file);
}

/** Teks murni dari content field pesan (string | block[]). */
export function extractTextContent(content: any): string {
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

/** Prompt user terakhir dari session log — fallback untuk task. Fail-safe. */
export function getLastPiCliPrompt(cwd: string, sessionId: string | null = null): string | null {
  try {
    for (const file of getSessionLogFiles(cwd, sessionId)) {
      const lines = fs.readFileSync(file, 'utf8').trim().split('\n').reverse();
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (event?.type !== 'message' || event?.message?.role !== 'user') continue;
          const prompt = extractTextContent(event.message.content).trim();
          if (prompt) return summarizePrompt(prompt);
        } catch { /* baris JSONL yang masih ditulis — skip */ }
      }
    }
  } catch { /* jangan pernah blok startup Pi CLI */ }
  return null;
}

/** Penanda task placeholder: server akan ganti dengan prompt asli. */
export function isWaitingPromptTask(task: unknown): boolean {
  return typeof task === 'string' && /menunggu\s+prompt/i.test(task);
}

// ── Project identity ───────────────────────────────────────────────────

const projectNameCache = new Map<string, string | null>();
const PROJECT_ROOT_SEARCH_LIMIT = 12;

/**
 * Nama proyek: jalan naik dari cwd ke `.git` terdekat, supaya sesi yang mulai
 * di subdirektori tetap tercatat ke repo-nya, bukan ke `src/`. Dilewati kalau
 * path tidak ada di mesin ini (worktree SSH melaporkan path remote).
 */
export function projectNameFromCwd(cwd: string): string | null {
  if (typeof cwd !== 'string' || !cwd.trim()) return null;
  const key = cwd.trim();
  if (projectNameCache.has(key)) return projectNameCache.get(key) ?? null;

  const isAbsolute = /^([a-zA-Z]:[\\/]|[\\/])/.test(key);
  const basenameOf = (p: string) => {
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
    } catch { /* fail-safe */ }
  }
  projectNameCache.set(key, name || null);
  return name || null;
}

// ── Machine identity ───────────────────────────────────────────────────

/** Path file machine-id, sama dengan yang ditulis extension. */
export function officeMachineIdFile(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return process.env.OFFICE_MACHINE_ID_FILE || path.join(home, '.pi', 'office', 'machine-id');
}

/**
 * Machine-id milik mesin ini, read-only (tidak membuat file).
 *
 * Dibutuhkan hub supaya reaper bisa membedakan "proses ini sudah mati" dari
 * "pid ini milik mesin lain". Setelah kantor memakai satu Turso bersama, semua
 * sesi hidup di tabel yang sama, sementara `/proc/<pid>` hanya berlaku untuk
 * mesin tempat hub berjalan.
 */
export function readLocalMachineId(): string | null {
  const explicit = (process.env.OFFICE_MACHINE_ID || '').trim();
  if (explicit) return explicit;
  try {
    const value = fs.readFileSync(officeMachineIdFile(), 'utf8').trim();
    return value || null;
  } catch {
    return null;
  }
}

// ── Formatting helpers ─────────────────────────────────────────────────

/** Bulatkan biaya ke 8 desimal — cukup untuk USD fraksional, hindari float noise. */
export function roundCost(value: unknown): number {
  return Math.round((Number(value) || 0) * 1e8) / 1e8;
}

/** Potong dari DEPAN — sisa teks menunjukkan bagian terbaru. */
export function tailText(text: string, maxLength = 180): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length > maxLength ? '…' + clean.slice(clean.length - maxLength + 1) : clean;
}

/** Teks terlihat dari pesan assistant (blok `type: 'text'` saja). */
export function extractAssistantVisibleText(message: any): string {
  if (!Array.isArray(message?.content)) return '';
  return message.content
    .filter((item: any) => item?.type === 'text' && typeof item.text === 'string')
    .map((item: any) => item.text)
    .join(' ')
    .trim();
}

/** Nama tool call dari event stream Pi (beberapa bentuk payload). */
export function extractToolCallName(event: any): string | null {
  const update = event?.assistantMessageEvent;
  if (typeof update?.toolCall?.name === 'string') return update.toolCall.name;

  const idx = update?.contentIndex;
  const block = Number.isInteger(idx) ? update?.partial?.content?.[idx] || event?.message?.content?.[idx] : null;
  return typeof block?.name === 'string' ? block.name : null;
}
