import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

console.log('🚀 Menyalakan ORCA24 Coworking Space...');
console.log('----------------------------------------------------');

// 1. Start Backend + WebSocket Hub (Port 4317)
const server = spawn('node', ['server/src/index.js'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, OFFICE_PORT: '4317' }
});

// 2. Start Frontend Vite Dev Server (Port 5173)
const vite = spawn('npm', ['run', 'dev', '--', '--host', '0.0.0.0', '--port', '5173'], {
  cwd: path.join(root, 'dashboard'),
  stdio: 'inherit',
  env: process.env
});

function cleanup() {
  console.log('\n🛑 Menghentikan seluruh dev server...');
  server.kill('SIGINT');
  vite.kill('SIGINT');
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

server.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[Backend] Keluar dengan kode: ${code}`);
  }
});

vite.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[Frontend] Keluar dengan kode: ${code}`);
  }
});
