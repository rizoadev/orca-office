// ============================================================
// UiStateService — pengganti state lokal App.tsx (React)
//
// Di React, App.tsx memegang paused/acMode/labelsOn/selectedId/clock dan
// menurunkannya lewat props. Di Angular service sinyal ini jadi satu-satunya
// sumber truth, sehingga Topbar / Stage / Sidebar tidak perlu saling
// berteriak lewat CustomEvent di window.
// ============================================================

import { Injectable, Inject, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import type { AgentData, AcMode } from '../models/types';
import { OfficeEngineService } from '../../engine/office-engine.service';
import { OfficeStateService } from './office-state.service';
import { ToastService } from './toast.service';
import { ApiService } from './api.service';
import { WebsocketService } from './websocket.service';

type Tab = 'team' | 'locations' | 'tasks' | 'tools' | 'feed' | 'logs' | 'bill';
type FeedKind = 'all' | 'task' | 'tool' | 'chat' | 'move';

/** Orca menandai halaman tempat dashboard dibuka lewat query ?embedded=… */
type EmbedMode = 'orca' | 'window' | 'browser';

@Injectable({ providedIn: 'root' })
export class UiStateService {
  private readonly engine = inject(OfficeEngineService);
  private readonly office = inject(OfficeStateService);
  private readonly ws = inject(WebsocketService);
  private readonly toasts = inject(ToastService);
  private readonly api = inject(ApiService);
  private readonly doc = inject(DOCUMENT);

  // ── state UI ────────────────────────────────────────────────────────
  readonly selectedId = signal<string>('backend');
  readonly paused = signal<boolean>(false);
  readonly acMode = signal<AcMode>('auto');
  readonly labelsOn = signal<boolean>(true);
  readonly clockTime = signal<string>('00:00:00');
  readonly liveMessage = signal<string>('Barista bot memanaskan espresso machine…');
  readonly tab = signal<Tab>('team');
  readonly feedKind = signal<FeedKind>('all');
  readonly query = signal<string>('');

  // ── turunan dari engine ─────────────────────────────────────────────
  readonly agents = computed(() => this.engine.agents());
  readonly events = computed(() => this.engine.events());

  readonly selectedAgent = computed(() =>
    this.agents().find((a) => a.id === this.selectedId()),
  );

  /** Stats floor — rumus sama persis dengan App.tsx. */
  readonly workingCount = computed(
    () => this.agents().filter((a) => a.mode === 'work' || a.mode === 'talk').length,
  );
  readonly walkingCount = computed(
    () =>
      this.agents().filter(
        (a) => a.mode === 'to' || a.mode === 'back' || a.mode === 'leaving',
      ).length,
  );
  readonly idleCount = computed(
    () =>
      this.agents().filter((a) =>
        ['idle', 'break_play', 'break_out'].includes(a.mode),
      ).length,
  );
  readonly doneCount = computed(() =>
    this.agents().reduce((sum, a) => sum + (a.done || 0), 0),
  );

  readonly activeSessionsCount = computed(() => this.office.sessions().length);

  // ── engine hookup ───────────────────────────────────────────────────
  private engineHooked = false;

  /** Dipanggil CanvasStageComponent setelah engine berhasil init. */
  attachEngine(): void {
    if (this.engineHooked) return;
    this.engineHooked = true;
    this.engine.onLiveMessage = (msg) => this.liveMessage.set(msg);
    this.engine.onToast = (msg) => this.toasts.show(msg);
  }

  setEngineReady(ready: boolean): void {
    this.engineHooked = ready;
  }

  // ── clock ───────────────────────────────────────────────────────────
  /** Jam simulasi kantor, dibaca dari engine.simMs — identik dengan App.tsx. */
  tickClock(): void {
    const ms = this.engine.simMs;
    const s = (ms / 1000) | 0;
    const p = (n: number) => String(n).padStart(2, '0');
    this.clockTime.set(`${p((s / 3600) | 0)}:${p(((s / 60) | 0) % 60)}:${p(s % 60)}`);
  }

  // ── handlers topbar / stage ─────────────────────────────────────────
  toggleMotion(): void {
    const next = !this.paused();
    this.engine.setPaused(next);
    this.paused.set(next);
  }

  recenter(): void {
    // 'over' = posisi kamera yang sama dengan konstruktor, jadi tombol ini
    // benar-benar kembali ke view awal, bukan ke preset lain.
    this.engine.camPreset('over');
    this.toasts.show('⌖ Kamera kembali ke posisi awal');
  }

  // Preset 'street' ada supaya trotoar + jalan raya di depan office bisa dilihat:
  // view dollhouse memotong tanah tepat di garis facade.
  streetView(): void {
    this.engine.camPreset('street');
    this.toasts.show('🛣 Kamera ke depan office');
  }

  // AUTO → ON → OFF. Auto sengaja tidak pernah nol: ruangan sepi tetap dapat
  // angin dasar supaya pita tidak pernah terlihat "rusak".
  cycleAcMode(): void {
    const cur = this.acMode();
    const next: AcMode = cur === 'auto' ? 'on' : cur === 'on' ? 'off' : 'auto';
    this.engine.setAcMode(next);
    this.acMode.set(next);
    this.toasts.show(
      next === 'auto'
        ? '❄ AC kembali ke AUTO (mengikuti agent yang kerja)'
        : next === 'on'
          ? '❄ AC dipaksa ON penuh'
          : '🔌 AC OFF — pita menjuntai',
    );
  }

  acLabel(): string {
    const m = this.acMode();
    return m === 'auto' ? 'Auto' : m === 'on' ? 'On' : 'Off';
  }

  toggleLabels(): void {
    const next = !this.labelsOn();
    this.engine.setLabelsOn(next);
    this.labelsOn.set(next);
    this.toasts.show(next ? 'Labels ditampilkan' : 'Labels disembunyikan');
  }

  selectAgent(id: string, fly = true): void {
    this.selectedId.set(id);
    this.engine.selectAgent(id, fly);
  }

  // ── kill agent ──────────────────────────────────────────────────────
  async killAgent(agent: AgentData): Promise<void> {
    const isRealPiAgent = !!agent.realSessionId;
    const confirmed = this.doc.defaultView?.confirm(
      isRealPiAgent
        ? `Kill agent ${agent.name}? Proses Pi CLI akan dikirim SIGTERM.`
        : `Kill agent simulasi ${agent.name}? Agent akan dikeluarkan dari kantor.`,
    );
    if (!confirmed) return;

    try {
      if (isRealPiAgent) {
        // ApiService sudah melempar Error kalau !res.ok || !body.ok — sama seperti React.
        const data = await this.api.killSession(agent.realSessionId!);
        this.engine.startExit(agent);
        this.toasts.show(
          data.signal_sent
            ? `🛑 SIGTERM dikirim ke ${agent.name}`
            : `🧹 ${agent.name} dihapus dari kantor`,
        );
        this.ws.refetch();
      } else {
        this.engine.startExit(agent);
        this.toasts.show(`🛑 ${agent.name} dikeluarkan dari kantor`);
      }

      if (this.selectedId() === agent.id) {
        const next = this.agents().find((a) => a.id !== agent.id);
        if (next) this.selectedId.set(next.id);
      }
    } catch (err) {
      this.toasts.show(`⚠️ ${err instanceof Error ? err.message : 'Gagal kill agent'}`);
    }
  }

  // ── tab & pencarian ─────────────────────────────────────────────────
  setTab(t: Tab): void {
    this.tab.set(t);
  }
  setFeedKind(k: FeedKind): void {
    this.feedKind.set(k);
  }
  setQuery(q: string): void {
    this.query.set(q);
  }

  // ── pop-out (Orca webview) ──────────────────────────────────────────
  embedMode(): EmbedMode {
    const flag = new URLSearchParams(this.doc.defaultView?.location.search ?? '').get(
      'embedded',
    );
    return flag === 'orca' ? 'orca' : flag === 'window' ? 'window' : 'browser';
  }

  /**
   * Minta dashboard tampil di jendela sendiri.
   *
   * Why: di dalam Orca halaman ini adalah <webview> yang di-sandbox tanpa preload,
   * jadi tidak ada bridge langsung ke host. Sinyalnya lewat hash: perubahan hash
   * memicu event 'did-navigate-in-page' di elemen webview, yang dipantau Orca untuk
   * membuka jendelanya.
   */
  requestPopOut(): void {
    const win = this.doc.defaultView;
    if (!win) return;
    if (this.embedMode() === 'orca') {
      win.location.hash = 'orca-popout';
      win.history.replaceState(null, '', win.location.pathname + win.location.search);
      return;
    }
    win.open(win.location.origin + '/', '_blank', 'noopener');
  }

  /** Dipanggil BillingPanel saat user klik tagihan per tamu. */
  selectAgentBySession(sessionId: string): void {
    const agent = this.agents().find((a) => a.realSessionId === sessionId);
    if (agent) this.selectAgent(agent.id, true);
  }
}
