// ============================================================
// OfficeStateService — signals + reducer WS (port useOfficeSocket state)
// ============================================================

import { Injectable, signal, computed } from '@angular/core';
import {
  OfficeState, Session, ToolCall, LogEntry,
  BillingSummary, WsEventType, WsPacket,
} from '../models/types';

const EMPTY_BILLING: BillingSummary = {
  generatedAt: 0,
  users: [],
  menu: [],
  totals: { totalTokens: 0, cost: 0, turns: 0, users: 0, models: 0 },
};

const EMPTY_OFFICE_STATE: OfficeState = {
  sessions: [],
  recent_tool_calls: [],
  recent_logs: [],
  billing: EMPTY_BILLING,
  stats: { total_active: 0, timestamp: Date.now() },
};

@Injectable({ providedIn: 'root' })
export class OfficeStateService {
  private _state = signal<OfficeState>(EMPTY_OFFICE_STATE);

  state = this._state.asReadonly();

  sessions = computed(() => this._state().sessions);
  recentToolCalls = computed(() => this._state().recent_tool_calls);
  recentLogs = computed(() => this._state().recent_logs);
  billing = computed(() => this._state().billing);
  stats = computed(() => this._state().stats);
  activeSessionCount = computed(
    () => this._state().sessions.filter((s) => s.status !== 'offline').length
  );

  setState(data: OfficeState): void {
    this._state.set(data);
  }

  /**
   * Reducer murni untuk satu packet WS. Persis memetakan switch-case dari
   * useOfficeSocket.ts agar perilakunya identik 1:1.
   */
  applyEvent(type: WsEventType, payload: unknown): void {
    switch (type) {
      case 'session_registered': {
        const s = payload as Session;
        this._state.update((prev) => {
          const filtered = prev.sessions.filter((x) => x.id !== s.id);
          return {
            ...prev,
            sessions: [s, ...filtered],
            stats: { ...prev.stats, total_active: filtered.length + 1 },
          };
        });
        break;
      }

      case 'session_updated': {
        const s = payload as Session;
        this._state.update((prev) => ({
          ...prev,
          sessions: prev.sessions.map((x) => (x.id === s.id ? { ...x, ...s } : x)),
        }));
        break;
      }

      case 'session_ended': {
        const { session_id } = payload as { session_id: string };
        this._state.update((prev) => {
          const updated = prev.sessions.map((x) =>
            x.id === session_id ? { ...x, status: 'offline' as const } : x
          );
          return {
            ...prev,
            sessions: updated,
            stats: {
              ...prev.stats,
              total_active: updated.filter((x) => x.status !== 'offline').length,
            },
          };
        });
        break;
      }

      case 'team_spawned': {
        const subagent = payload as Session;
        this._state.update((prev) => {
          const filtered = prev.sessions.filter((x) => x.id !== subagent.id);
          return {
            ...prev,
            sessions: [subagent, ...filtered],
            stats: { ...prev.stats, total_active: filtered.length + 1 },
          };
        });
        break;
      }

      case 'tool_called': {
        const tc = payload as ToolCall;
        this._state.update((prev) => ({
          ...prev,
          recent_tool_calls: [tc, ...prev.recent_tool_calls.slice(0, 49)],
        }));
        break;
      }

      case 'tool_completed': {
        const tc = payload as ToolCall;
        this._state.update((prev) => ({
          ...prev,
          recent_tool_calls: prev.recent_tool_calls.map((x) =>
            x.id === tc.id ? { ...x, ...tc } : x
          ),
        }));
        break;
      }

      case 'llm_stream_updated': {
        const stream = payload as { session_id: string } & {
          kind: 'response' | 'thinking' | 'tool' | 'status';
          text: string;
          isFinal?: boolean;
          updatedAt: number;
        };
        this._state.update((prev) => ({
          ...prev,
          sessions: prev.sessions.map((x) =>
            x.id === stream.session_id ? { ...x, liveStream: stream } : x
          ),
        }));
        break;
      }

      case 'usage_recorded': {
        this._state.update((prev) => ({ ...prev, billing: payload as BillingSummary }));
        break;
      }

      case 'log_appended': {
        const log = payload as LogEntry;
        this._state.update((prev) => ({
          ...prev,
          recent_logs: [log, ...prev.recent_logs.slice(0, 99)],
        }));
        break;
      }

      default:
        break;
    }
  }
}