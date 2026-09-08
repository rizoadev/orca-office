// ============================================================
// OfficeEngineService — jembatan Angular ↔ engine 3D kantor.
//
// Engine-nya sendiri sudah utuh terpecah jadi 21 service per-subsystem
// (lihat engine/office-scene.ts dan docs/ENGINE_MODULES.md). Kelas itu TIDAK
// tahu apa-apa soal Angular. Yang dilakukan service ini cuma tiga hal:
//
//   1. Membuat satu injector per-scene (createEnvironmentInjector) supaya seluruh
//      subsystem engine punya lifecycle sendiri dan bisa dibuang bersih saat
//      komponen dihancurkan — bukan singleton seumur aplikasi.
//   2. Menjalankan render loop di luar NgZone. requestAnimationFrame 60fps tidak
//      boleh memicu change detection; hasil yang perlu ke UI didorong lewat sinyal.
//   3. Menerjemahkan panggilan UI ke OfficeScene dan mendorong agents/events
//      kembali ke sinyal Angular.
// ============================================================

import { Injectable, EnvironmentInjector, createEnvironmentInjector, inject, NgZone, signal } from '@angular/core';
import type { AcMode, AgentData, FeedEvent, MenuBoardRow, Session, ToolCall } from '../core/models/types';
import { EngineContext } from './core/engine-context';
import { TextureFactoryService } from './core/texture-factory.service';
import { FeedService } from './core/feed.service';
import { LightingService } from './environment/lighting.service';
import { GlassWallService } from './environment/glass-walls.service';
import { SunShaftService } from './environment/sun-shafts.service';
import { StreetService } from './environment/street.service';
import { WallAcService } from './furniture/wall-ac.service';
import { MenuBoardService } from './furniture/menu-board.service';
import { SeatItemsService } from './furniture/seat-items.service';
import { CoffeeShopService } from './rooms/coffee-shop.service';
import { MusholaFloorService } from './rooms/mushola-floor.service';
import { MusholaService } from './rooms/mushola.service';
import { PersonService } from './avatars/person.service';
import { WaypointService } from './navigation/waypoints.service';
import { PathService } from './navigation/paths.service';
import { DoorService } from './navigation/door.service';
import { MovementService } from './animation/movement.service';
import { BeamService } from './animation/beam.service';
import { PillOverlayService } from './animation/pill-overlay.service';
import { SessionSyncService } from './session/session-sync.service';
import { OfficeScene } from './office-scene';

/** Semua subsystem engine, disediakan SEKALI per scene — urut tidak penting, DI yang membereskan. */
const ENGINE_PROVIDERS = [
  EngineContext,
  TextureFactoryService,
  FeedService,
  LightingService,
  GlassWallService,
  SunShaftService,
  StreetService,
  WallAcService,
  MenuBoardService,
  SeatItemsService,
  CoffeeShopService,
  MusholaFloorService,
  MusholaService,
  PersonService,
  WaypointService,
  PathService,
  DoorService,
  MovementService,
  BeamService,
  PillOverlayService,
  SessionSyncService,
  OfficeScene,
];

@Injectable({ providedIn: 'root' })
export class OfficeEngineService {
  private readonly injector = inject(EnvironmentInjector);
  private zone = inject(NgZone);

  private scene: OfficeScene | null = null;
  private env: EnvironmentInjector | null = null;

  private readonly _agents = signal<AgentData[]>([]);
  private readonly _events = signal<FeedEvent[]>([]);

  readonly agents = this._agents.asReadonly();
  readonly events = this._events.asReadonly();

  /** Dipasang UiStateService — persis seperti App.tsx memasang eng.onLiveMessage / eng.onToast. */
  onLiveMessage: (msg: string) => void = () => {};
  onToast: (msg: string) => void = () => {};

  init(canvas: HTMLCanvasElement, overlay: HTMLElement): void {
    if (this.scene) return;
    this.zone.runOutsideAngular(() => {
      const env = createEnvironmentInjector(ENGINE_PROVIDERS, this.injector, 'office-engine');
      const scene = env.get(OfficeScene);

      scene.attach(canvas, overlay);
      scene.hooks = {
        // Engine mengubah state di luar zone → hanya push sinyal, tanpa CD per frame.
        onStateChange: () => this.zone.run(() => this.sync()),
        onLiveMessage: (m) => this.onLiveMessage(m),
        onToast: (m) => this.onToast(m),
      };
      scene.start();

      this.env = env;
      this.scene = scene;
      this.sync();
    });
  }

  destroy(): void {
    this.scene?.stop();
    this.env?.destroy();
    this.scene = null;
    this.env = null;
    this._agents.set([]);
    this._events.set([]);
  }

  /** Perubahan state engine → sinyal. Dipanggil dari dalam zone, jadi aman dari luar. */
  private sync(): void {
    if (!this.scene) return;
    this._agents.set([...this.scene.agents]);
    this._events.set([...this.scene.events]);
  }

  // ── masuk ke engine: selalu di luar zone, lalu dorong hasilnya ke sinyal ──

  syncRealSessions(sessions: Session[]): void {
    if (!this.scene) return;
    this.zone.runOutsideAngular(() => {
      this.scene!.syncRealSessions(sessions);
      this.zone.run(() => this.sync());
    });
  }

  handleRealToolCall(tc: ToolCall): void {
    if (!this.scene) return;
    this.zone.runOutsideAngular(() => {
      this.scene!.handleRealToolCall(tc);
      this.zone.run(() => this.sync());
    });
  }

  handleSubagentSpawn(sub: Session): void { this.scene?.handleSubagentSpawn(sub); }
  setMenuBoard(rows: MenuBoardRow[]): void { this.scene?.setMenuBoard(rows); }
  setAcMode(mode: AcMode): void { this.scene?.setAcMode(mode); }
  setPaused(paused: boolean): void { if (this.scene) this.scene.paused = paused; }
  setLabelsOn(on: boolean): void { if (this.scene) this.scene.labelsOn = on; }
  setSpeed(speed: number): void { if (this.scene) this.scene.speed = speed; }
  camPreset(preset: 'over' | 'ground' | 'play' | 'street'): void { this.scene?.camPreset(preset); }
  selectAgent(id: string, fly = true): void { this.scene?.selectAgent(id, fly); }
  startExit(agent: AgentData): void { this.scene?.startExit(agent); }
  burst(): void { this.scene?.burst(); }
  get simMs(): number { return this.scene?.simMs ?? 0; }
  /** Untuk verifikasi: scene-graph asli, dipakai harness parity. */
  get rawScene(): OfficeScene | null { return this.scene; }
}
