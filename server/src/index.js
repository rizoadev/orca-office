import { createOfficeServer, DASHBOARD_DIST } from './server.js';

const PORT = parseInt(process.env.OFFICE_PORT || '4317', 10);
const HOST = process.env.OFFICE_HOST || '0.0.0.0';
const REAP_INTERVAL_MS = 60_000;
// Rows written before sessions carried a pid have no process proof; give them a wide
// window so an idle-but-live session is never guessed at.
const ABANDONED_AFTER_MS = 6 * 60 * 60 * 1000;

const { server, db, hub } = createOfficeServer();

// Why: a Pi session that gets SIGKILLed never posts session.end, so its seat would
// stay "working" forever. Reap only what is provably dead (recorded pid, no /proc entry).
function reap() {
  const dead = db.reapDeadSessions();
  for (const session of dead) {
    hub.broadcast('session_ended', { session_id: session.id });
  }
  if (dead.length > 0) {
    console.log(`🧹 [reap] ${dead.length} sesi dengan proses mati dipindah ke offline`);
  }
}

server.listen(PORT, HOST, () => {
  console.log(`☕ [ORCA24 Hub] Berjalan di http://${HOST}:${PORT}`);
  console.log(`📡 [WebSocket] ws://${HOST}:${PORT}/ws`);
  console.log(`🗄️ [SQLite] Menggunakan file: ${db.dbFile}`);
  console.log(`🖼️ [Dashboard] disajikan dari ${DASHBOARD_DIST}`);
  const abandoned = db.reapAbandonedSessions(ABANDONED_AFTER_MS);
  if (abandoned.length > 0) {
    console.log(`🧹 [startup] ${abandoned.length} sesi tanpa pid & >6 jam dipindah ke offline`);
  }
  reap();
});

const reapTimer = setInterval(reap, REAP_INTERVAL_MS);
reapTimer.unref?.();

process.on('SIGINT', () => {
  console.log('\n🛑 Menutup ORCA24 Hub...');
  hub.close();
  server.close(() => {
    process.exit(0);
  });
});
