// ============================================================
// WebsocketService — port useOfficeSocket WebSocket + reconnect
// ============================================================

import { Injectable, signal } from '@angular/core';
import { officeWsUrl } from '../utils/endpoints';
import { OfficeState, WsEventType, WsPacket } from '../models/types';
import { OfficeStateService } from './office-state.service';
import { AuthService } from './auth.service';

const RECONNECT_MS = 2000;

@Injectable({ providedIn: 'root' })
export class WebsocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers = new Map<string, Set<(payload: unknown) => void>>();
  private disposed = false;

  isConnected = signal(false);
  lastPing = signal(Date.now());

  constructor(
    private stateService: OfficeStateService,
    private authService: AuthService
  ) {}

  /** Subscribe ke satu event type WS. Return unsubscribe fn. */
  on<T = unknown>(type: WsEventType, handler: (payload: T) => void): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler as (p: unknown) => void);
    return () => {
      this.handlers.get(type)?.delete(handler as (p: unknown) => void);
    };
  }

  connect(): void {
    if (this.disposed || this.authService.unauthorized()) return;
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(officeWsUrl());
    this.ws = ws;

    ws.onopen = () => {
      this.isConnected.set(true);
      this.lastPing.set(Date.now());
      void this.refetch();
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const packet: WsPacket = JSON.parse(event.data);
        const { type, payload } = packet;
        this.stateService.applyEvent(type, payload);
        const subs = this.handlers.get(type);
        if (subs) {
          for (const sub of subs) {
            try {
              sub(payload);
            } catch {
              /* swallow */
            }
          }
        }
      } catch (err) {
        console.error('[WS Parse Error]', err);
      }
    };

    ws.onclose = () => {
      this.ws = null;
      this.isConnected.set(false);
      if (!this.disposed && !this.authService.unauthorized()) {
        this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_MS);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.isConnected.set(false);
  }

  dispose(): void {
    this.disposed = true;
    this.disconnect();
  }

  async refetch(): Promise<boolean> {
    return this.authService.authorizeViaProbe();
  }
}