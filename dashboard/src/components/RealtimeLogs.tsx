import React, { useRef, useEffect } from 'react';
import { LogEntry } from '../types';

interface RealtimeLogsProps {
  logs: LogEntry[];
}

export const RealtimeLogs: React.FC<RealtimeLogsProps> = ({ logs }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="rt-logs">
      <div className="rt-logs-header">
        <span className="rt-logs-title">
          📟 Live Terminal & Event Stream ({logs.length})
        </span>
        <span className="rt-logs-badge">Auto-scroll ON</span>
      </div>

      <div ref={containerRef} className="rt-logs-body">
        {logs.length === 0 ? (
          <div className="rt-logs-empty">
            Menunggu stream log dari sesi Pi Dev CLI…
          </div>
        ) : (
          logs.map((l, i) => {
            const time = new Date(l.created_at || Date.now()).toLocaleTimeString(
              'id-ID',
              { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
            );
            const isError = l.level === 'error';
            const isWarn = l.level === 'warn';

            return (
              <div key={i} className={`rt-log ${isError ? 'rt-log-error' : isWarn ? 'rt-log-warn' : ''}`}>
                <span className="rt-log-time">{time}</span>
                <span className={`rt-log-level ${isError ? 'rt-log-level-error' : isWarn ? 'rt-log-level-warn' : 'rt-log-level-info'}`}>
                  {l.source || 'pi'}
                </span>
                {l.session_name && (
                  <span className="rt-log-session">[{l.session_name}]</span>
                )}
                <span className="rt-log-msg">{l.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
