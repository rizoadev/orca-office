// ============================================================
// TopbarComponent — port 1:1 components/Topbar.tsx
// Tanpa scoped styles: tata letak diambil dari global styles.css
// (port index.css React) supaya visualnya identik.
// ============================================================

import { Component, inject } from '@angular/core';
import { UiStateService } from '../../core/services/ui-state.service';
import { WebsocketService } from '../../core/services/websocket.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  template: `
    <header class="topbar">
      <div class="brand">
        <div class="cup">☕</div>
        <div>
          ORCA24 <span style="color:#64748b;font-weight:500">· Coworking Space</span>
        </div>
        <span class="sim-badge" [style]="badgeStyle()">{{ badgeText() }}</span>
        @if (ui.embedMode() === 'orca') {
          <button
            type="button"
            class="tbtn popout-btn"
            title="Buka Office di jendela baru"
            aria-label="Buka Office di jendela baru"
            (click)="ui.requestPopOut()"
          >
            ⧉
          </button>
        }
      </div>

      <div style="display:flex;gap:8px;align-items:center">
        <span class="clock">🕒 <span>{{ ui.clockTime() }}</span></span>
        <button class="tbtn tbtn-compact" (click)="ui.toggleMotion()">
          {{ ui.paused() ? '▶ Resume' : '⏸ Pause' }}
        </button>
        <button
          class="tbtn tbtn-compact"
          (click)="ui.recenter()"
          title="Kembalikan kamera ke posisi awal"
          aria-label="Kembalikan kamera ke posisi awal"
        >
          ⌖ Recenter
        </button>
        <button
          class="tbtn tbtn-compact"
          (click)="ui.streetView()"
          title="Lihat trotoar dan jalan raya di depan office"
          aria-label="Lihat depan office"
        >
          🛣 Depan
        </button>
        <span class="topbar-sep" aria-hidden="true"></span>
        <button
          type="button"
          class="tbtn tbtn-compact"
          [class.tbtn-on-cool]="ui.acMode() !== 'off'"
          [attr.aria-pressed]="ui.acMode() !== 'off'"
          (click)="ui.cycleAcMode()"
          title="AC di tembok belakang. AUTO = angin menguat saat banyak agent kerja, ON = penuh, OFF = pita menjuntai"
        >
          ❄ AC {{ ui.acLabel() }}
        </button>
      </div>
    </header>
  `,
})
export class TopbarComponent {
  protected ui = inject(UiStateService);
  private ws = inject(WebsocketService);

  /** Badge live/offline — warna inline sama seperti React. */
  badgeStyle(): string {
    return this.ws.isConnected()
      ? 'background:rgba(74,222,128,.12);border-color:rgba(74,222,128,.35);color:#86efac'
      : 'background:rgba(248,113,113,.12);border-color:rgba(248,113,113,.35);color:#fca5a5';
  }

  badgeText(): string {
    return this.ws.isConnected()
      ? `● LIVE SYNC (${this.ui.activeSessionsCount()} SESI)`
      : 'OFFLINE';
  }
}
