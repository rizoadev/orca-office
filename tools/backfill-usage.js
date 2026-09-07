// Backfill the coffee-shop bill from Pi's own session logs.
//
// Why: usage rows normally arrive live from the pi-office extension, which only loads at
// session start — so every session that predates billing would show an empty receipt.
// Pi already wrote the token + cost numbers into ~/.pi/agent/sessions/*.jsonl, so we read
// them once, per line, with a dedupe key that makes re-running this tool harmless.
import fs from 'node:fs';
import path from 'node:path';
import { OfficeDB, getSessionLogFiles } from '../server/src/db.js';

const db = new OfficeDB();
const only = process.argv[2] || null;

const sessions = only
  ? db.db.prepare('SELECT id, name, cwd FROM sessions WHERE id = ?').all(only)
  : db.db.prepare('SELECT id, name, cwd FROM sessions').all();

if (!sessions.length) {
  console.log('Tidak ada sesi di office.db untuk di-backfill.');
  process.exit(0);
}

let inserted = 0;
let skipped = 0;
let filesRead = 0;

for (const session of sessions) {
  const files = getSessionLogFiles(session.cwd || process.cwd(), session.id);
  let mine = 0;

  for (const file of files) {
    const base = path.basename(file);
    let lines;
    try {
      lines = fs.readFileSync(file, 'utf8').split('\n');
    } catch {
      continue;
    }
    filesRead++;

    lines.forEach((line, index) => {
      if (!line.trim()) return;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      const message = event?.message;
      if (event?.type !== 'message' || message?.role !== 'assistant') return;

      const usage = message.usage;
      const totalTokens = Number(usage?.totalTokens) || 0;
      if (!usage || totalTokens <= 0) return;

      const receipt = db.recordUsage({
        session_id: session.id,
        model: message.model || 'pi-model',
        provider: message.provider || null,
        input: usage.input,
        output: usage.output,
        cache_read: usage.cacheRead,
        cache_write: usage.cacheWrite,
        total_tokens: totalTokens,
        reported_cost: usage.cost?.total ?? 0,
        created_at: Number(message.timestamp) || Date.now(),
        dedupe_key: `${base}#${index}`
      });

      if (receipt.inserted) {
        inserted++;
        mine++;
      } else {
        skipped++;
      }
    });
  }

  console.log(`  ${session.name || session.id} → ${mine} struk baru (${files.length} log)`);
}

const bill = db.getBilling();
console.log('\n☕ Tagihan setelah backfill:');
console.log(`   ${filesRead} log dibaca · ${inserted} struk baru · ${skipped} sudah tercatat sebelumnya`);
console.log(`   ${bill.totals.users} tamu · ${bill.totals.models} menu · ${bill.totals.turns} seduh`);
console.log(`   ${bill.totals.totalTokens.toLocaleString('id-ID')} token · $${bill.totals.cost.toFixed(6)}`);

for (const brew of bill.menu) {
  console.log(`   • ${brew.model} — $${brew.ratePerMillion.toFixed(4)}/1M (${brew.costSource})`);
}
