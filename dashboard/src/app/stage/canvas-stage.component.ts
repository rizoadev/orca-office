// ============================================================
// CanvasStageComponent — port 1:1 StageContainer.tsx + init engine
// DOM & class name dibuat identik dengan React supaya global CSS
// (port index.css) menata hasilnya persis sama.
// ============================================================

import {
  Component, ViewChild, ElementRef, AfterViewInit, OnDestroy,
  inject, effect, signal,
} from '@angular/core';
import { WebsocketService } from '../core/services/websocket.service';
import { OfficeEngineService } from '../engine/office-engine.service';
import { OfficeStateService } from '../core/services/office-state.service';
import { ToastService } from '../core/services/toast.service';
import { UiStateService } from '../core/services/ui-state.service';
import { PillOverlayComponent } from './pill-overlay.component';
import { assignDrinks, formatPerMillion, formatTokens } from '../core/utils/coffee-menu';

@Component({
  selector: 'canvas-stage',
  standalone: true,
  imports: [PillOverlayComponent],
  template: `
    <section class="stage">
      <div class="canvas-wrap" id="wrap">
        <canvas id="shop" #shopCanvas></canvas>

        <pill-overlay
          [agents]="ui.agents()"
          [labelsOn]="ui.labelsOn()"
          (selectAgent)="ui.selectAgent($event.id, $event.fly)"
        />

        <div class="floor-tag" id="floorTag"
          >☕ ORCA24 COWORKING · 1 LANTAI · 14 SEATS@if (isConnected()) {<span style="color:#4ade80;margin-left:6px">● LIVE WS</span>}</div>

        <div class="hint">🖱 drag orbit · scroll zoom · klik bubble untuk fokus kamera</div>
      </div>

      <div class="livebar">
        <span>📡</span>
        <div class="msg">{{ ui.liveMessage() }}</div>
      </div>
    </section>
  `,
})
export class CanvasStageComponent implements AfterViewInit, OnDestroy {
  @ViewChild('shopCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private engine = inject(OfficeEngineService);
  private ws = inject(WebsocketService);
  private state = inject(OfficeStateService);
  private toasts = inject(ToastService);
  protected ui = inject(UiStateService);

  isConnected = this.ws.isConnected;

  private engineReady = false;
  private clockTimer: ReturnType<typeof setInterval> | null = null;

  // ── sync effects (padanan useEffect di App.tsx) ─────────────────────
  private sessionEffect = effect(() => {
    const sessions = this.state.sessions();
    if (this.engineReady && sessions.length > 0) {
      this.engine.syncRealSessions(sessions);
    }
  });

  private toolEffect = effect(() => {
    const toolCalls = this.state.recentToolCalls();
    if (this.engineReady && toolCalls.length > 0) {
      this.engine.handleRealToolCall(toolCalls[0]);
    }
  });

  // Papan menu 3D ikut tagihan: menu terlaris = model paling sering diseduh.
  private menuEffect = effect(() => {
    const billing = this.state.billing();
    if (!this.engineReady || !billing) return;
    const rows = [...billing.menu]
      .sort((a, b) => b.turns - a.turns || b.totalTokens - a.totalTokens)
      .slice(0, 5);
    const drinks = assignDrinks(rows.map((r) => r.model));
    this.engine.setMenuBoard(
      rows.map((row, i) => ({
        drink: `${i < 3 ? '★ ' : ''}${drinks.get(row.model) ?? row.model}`,
        model: row.model,
        price: row.costSource === 'none' ? '?' : `${formatPerMillion(row.ratePerMillion)}/1M`,
        sold: `×${formatTokens(row.turns)} seduh`,
      })),
    );
  });

  ngAfterViewInit(): void {
    // Engine butuh canvas yang sudah punya ukuran layout.
    setTimeout(() => this.initEngine(), 50);

    // Clock ticker — interval 500ms sama seperti App.tsx.
    this.clockTimer = setInterval(() => this.ui.tickClock(), 500);
  }

  private initEngine(): void {
    const canvas = this.canvasRef?.nativeElement;
    const overlay = document.getElementById('overlay');
    if (!canvas || !overlay) {
      setTimeout(() => this.initEngine(), 100);
      return;
    }
    try {
      this.engine.init(canvas, overlay);
      this.engineReady = true;
      this.ui.attachEngine();
      this.toasts.show('☕ Selamat datang di ORCA24 — Coworking Space');
    } catch (err) {
      console.error('[CanvasStage] Engine init failed:', err);
    }
  }

  ngOnDestroy(): void {
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.sessionEffect.destroy();
    this.toolEffect.destroy();
    this.menuEffect.destroy();
    this.engineReady = false;
    this.ui.setEngineReady(false);
    this.engine.destroy();
  }
}
