import { WebSocketServer } from 'ws';

export class OfficeWebSocketHub {
  constructor(server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.clients = new Set();

    this.wss.on('connection', (ws, req) => {
      this.clients.add(ws);
      const ip = req.socket.remoteAddress;

      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', (err) => {
        console.error('[WS] Client error:', err.message);
        this.clients.delete(ws);
      });
    });

    // Ping interval to keep connections alive and prune stale sockets
    this.interval = setInterval(() => {
      for (const ws of this.clients) {
        if (!ws.isAlive) {
          this.clients.delete(ws);
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, 30000);
  }

  broadcast(type, payload) {
    const message = JSON.stringify({
      type,
      payload,
      timestamp: Date.now()
    });

    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) {
        try {
          ws.send(message);
        } catch (err) {
          console.error('[WS] Send error:', err.message);
        }
      }
    }
  }

  close() {
    clearInterval(this.interval);
    this.wss.close();
  }
}
