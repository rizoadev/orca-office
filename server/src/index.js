import { createOfficeServer, DASHBOARD_DIST } from './server.js';

const PORT = parseInt(process.env.OFFICE_PORT || '4317', 10);
const HOST = process.env.OFFICE_HOST || '0.0.0.0';
const REAP_INTERVAL_MS = 60_000;
const ABANDONED_AFTER_MS = 6 * 60 * 60 * 1000;

const { server, db, hub } = await createOfficeServer();
await db._ready;

async function reap() {
  try {
    const dead = await db.reapDeadSessions();
    for (const session of dead) {
      hub.broadcast('session_ended', { session_id: session.id });
    }
    if (dead.length > 0) {
      console.log(`🧹 [reap] ${dead.length} sesi dengan proses mati dipindah ke offline`);
    }
  } catch (err) {
    console.error('⚠️ [reap] error:', err?.message || err);
  }
}

server.listen(PORT, HOST, () => {
  console.log(`☕ [ORCA24 Hub] Berjalan di http://${HOST}:${PORT}`);
  console.log(`📡 [WebSocket] ws://${HOST}:${PORT}/ws`);
  console.log(`🗄️ [Turso] ${process.env.TURSO_DATABASE_URL}`);
  console.log(`🖼️ [Dashboard] disajikan dari ${DASHBOARD_DIST}`);
  // Fire-and-forget startup tasks; errors logged, not fatal.
  db.reapAbandonedSessions(ABANDONED_AFTER_MS)
    .then(abandoned => {
      if (abandoned.length > 0) {
        console.log(`🧹 [startup] ${abandoned.length} sesi tanpa pid & >6 jam dipindah ke offline`);
      }
    })
    .catch(err => console.error('⚠️ [startup-reap] error:', err?.message || err));
  reap();
});

const reapTimer = setInterval(reap, REAP_INTERVAL_MS);
reapTimer.unref?.();

process.on('unhandledRejection', (err) => {
  console.error('⚠️ [unhandledRejection]', err?.message || err);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Menutup ORCA24 Hub...');
  hub.close();
  server.close(() => {
    process.exit(0);
  });
});
