// ============================================================
// RealtimeLogsComponent — port 1:1 components/RealtimeLogs.tsx
// Auto-scroll ke bawah tiap ada log baru, persis React.
// ============================================================

import { Component, Input, OnChanges, SimpleChanges, ViewChild, ElementRef } from '@angular/core';
import type { LogEntry } from '../../core/models/types';

@Component({
  selector: 'realtime-logs',
  standalone: true,
  template: `
    <div class="rt-logs">
      <div class="rt-logs-header">
        <span class="rt-logs-title">
          📟 Live Terminal &amp; Event Stream ({{ logs.length }})
        </span>
        <span class="rt-logs-badge">Auto-scroll ON</span>
      </div>

      <div #body class="rt-logs-body">
        @if (logs.length === 0) {
          <div class="rt-logs-empty">Menunggu stream log dari sesi Pi Dev CLI…</div>
        } @else {
          @for (l of logs; track $index) {
            <div class="rt-log" [class.rt-log-error]="l.level === 'error'" [class.rt-log-warn]="l.level === 'warn'">
              <span class="rt-log-time">{{ time(l) }}</span>
              <span class="rt-log-level" [class]="levelClass(l)">{{ l.source || 'pi' }}</span>
              @if (l.session_name) {
                <span class="rt-log-session">[{{ l.session_name }}]</span>
              }
              <span class="rt-log-msg">{{ l.message }}</span>
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class RealtimeLogsComponent implements OnChanges {
  @Input() logs: LogEntry[] = [];
  @ViewChild('body') private body?: ElementRef<HTMLDivElement>;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['logs']) {
      queueMicrotask(() => {
        const el = this.body?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
  }

  private static readonly LOCALE = 'id-ID';

  time(l: LogEntry): string {
    return new Date(l.created_at || Date.now()).toLocaleTimeString(RealtimeLogsComponent.LOCALE, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  levelClass(l: LogEntry): string {
    if (l.level === 'error') return 'rt-log-level rt-log-level-error';
    if (l.level === 'warn') return 'rt-log-level rt-log-level-warn';
    return 'rt-log-level rt-log-level-info';
  }
}
