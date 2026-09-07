import { useState, useEffect, useRef, useCallback } from 'react';
import { officeApiUrl, officeWsUrl } from '../lib/office-endpoints';
import { OfficeState, Session, ToolCall, LogEntry, LlmStreamState } from '../types';

const EMPTY_BILLING: OfficeState['billing'] = {
  generatedAt: 0,
  users: [],
  menu: [],
  totals: { totalTokens: 0, cost: 0, turns: 0, users: 0, models: 0 }
};

export function useOfficeSocket() {
  const [state, setState] = useState<OfficeState>({
    sessions: [],
    recent_tool_calls: [],
    recent_logs: [],
    billing: EMPTY_BILLING,
    stats: { total_active: 0, timestamp: Date.now() }
  });
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastPing, setLastPing] = useState<number>(Date.now());
  const wsRef = useRef<WebSocket | null>(null);

  // Initial HTTP Fetch
  const fetchInitialState = useCallback(async () => {
    try {
      const res = await fetch(officeApiUrl('/api/state'));
      if (res.ok) {
        const data: OfficeState = await res.json();
        setState(data);
      }
    } catch {
      // Backend maybe starting up
    }
  }, []);

  useEffect(() => {
    fetchInitialState();

    let isMounted = true;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      const ws = new WebSocket(officeWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        setIsConnected(true);
        setLastPing(Date.now());
        fetchInitialState();
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const packet = JSON.parse(event.data);
          const { type, payload } = packet;

          setState((prev) => {
            switch (type) {
              case 'session_registered': {
                const s = payload as Session;
                const filtered = prev.sessions.filter((x) => x.id !== s.id);
                return {
                  ...prev,
                  sessions: [s, ...filtered],
                  stats: { ...prev.stats, total_active: filtered.length + 1 }
                };
              }
              case 'session_updated':
              case 'task_updated': {
                const s = payload as Session;
                return {
                  ...prev,
                  sessions: prev.sessions.map((x) => (x.id === s.id ? { ...x, ...s } : x))
                };
              }
              case 'session_ended': {
                const { session_id } = payload;
                const updated = prev.sessions.map((x) =>
                  x.id === session_id ? { ...x, status: 'offline' as const } : x
                );
                return {
                  ...prev,
                  sessions: updated,
                  stats: {
                    ...prev.stats,
                    total_active: updated.filter((x) => x.status !== 'offline').length
                  }
                };
              }
              case 'team_spawned': {
                const subagent = payload as Session;
                const filtered = prev.sessions.filter((x) => x.id !== subagent.id);
                return {
                  ...prev,
                  sessions: [subagent, ...filtered],
                  stats: { ...prev.stats, total_active: filtered.length + 1 }
                };
              }
              case 'tool_called': {
                const tc = payload as ToolCall;
                return {
                  ...prev,
                  recent_tool_calls: [tc, ...prev.recent_tool_calls.slice(0, 49)]
                };
              }
              case 'tool_completed': {
                const tc = payload as ToolCall;
                return {
                  ...prev,
                  recent_tool_calls: prev.recent_tool_calls.map((x) =>
                    x.id === tc.id ? { ...x, ...tc } : x
                  )
                };
              }
              case 'llm_stream_updated': {
                const stream = payload as LlmStreamState & { session_id: string };
                return {
                  ...prev,
                  sessions: prev.sessions.map((x) =>
                    x.id === stream.session_id ? { ...x, liveStream: stream } : x
                  )
                };
              }
              case 'usage_recorded': {
                // Server mengirim seluruh ringkasan tagihan (kecil, sudah teragregasi),
                // jadi klien tidak perlu menghitung ulang ribuan baris usage.
                return { ...prev, billing: payload as OfficeState['billing'] };
              }
              case 'log_appended': {
                const log = payload as LogEntry;
                return {
                  ...prev,
                  recent_logs: [log, ...prev.recent_logs.slice(0, 99)]
                };
              }
              default:
                return prev;
            }
          });
        } catch (err) {
          console.error('[WS Parse Error]', err);
        }
      };

      ws.onclose = () => {
        if (!isMounted) return;
        setIsConnected(false);
        reconnectTimeout = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      isMounted = false;
      clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, [fetchInitialState]);

  return { state, isConnected, lastPing, refetch: fetchInitialState };
}
