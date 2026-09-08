// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from './core/engine-context';
import { WallAcService } from './furniture/wall-ac.service';
import { BeamService } from './animation/beam.service';
import { DoorService } from './navigation/door.service';
import { FeedService } from './core/feed.service';
import { GlassWallService } from './environment/glass-walls.service';
import { LightingService } from './environment/lighting.service';
import { MenuBoardService } from './furniture/menu-board.service';
import { MusholaFloorService } from './rooms/mushola-floor.service';
import { MovementService } from './animation/movement.service';
import { MusholaService } from './rooms/mushola.service';
import { PathService } from './navigation/paths.service';
import { PersonService } from './avatars/person.service';
import { PillOverlayService } from './animation/pill-overlay.service';
import { SeatItemsService } from './furniture/seat-items.service';
import { CoffeeShopService } from './rooms/coffee-shop.service';
import { StreetService } from './environment/street.service';
import { SunShaftService } from './environment/sun-shafts.service';
import { SessionSyncService } from './session/session-sync.service';
import { TextureFactoryService } from './core/texture-factory.service';
import { WaypointService } from './navigation/waypoints.service';
import type { AgentData, FeedEvent, Session, ToolCall } from '../core/models/types';
import type { MenuBoardRow } from './core/engine-menu-data';
import { AcMode } from './wall-ac';

/**
 * Composition root engine 3D kantor. Urutan pembangunannya IDENTIK dengan
 * konstruktor OfficeEngine lama (lights → coffee shop → street → AC → waypoints →
 * resize → listener), karena urutan itu menentukan objek mana yang sudah ada saat
 * subsystem berikutnya membangun dirinya.
 */
@Injectable()
export class OfficeScene {
  private readonly ctx = inject(EngineContext);
  private readonly ac = inject(WallAcService);
  private readonly beam = inject(BeamService);
  private readonly door = inject(DoorService);
  private readonly feed = inject(FeedService);
  private readonly glass = inject(GlassWallService);
  private readonly lighting = inject(LightingService);
  private readonly menu = inject(MenuBoardService);
  private readonly mezz = inject(MusholaFloorService);
  private readonly movement = inject(MovementService);
  private readonly mushola = inject(MusholaService);
  private readonly paths = inject(PathService);
  private readonly person = inject(PersonService);
  private readonly pills = inject(PillOverlayService);
  private readonly seatItems = inject(SeatItemsService);
  private readonly shop = inject(CoffeeShopService);
  private readonly street = inject(StreetService);
  private readonly sun = inject(SunShaftService);
  private readonly sync = inject(SessionSyncService);
  private readonly tex = inject(TextureFactoryService);
  private readonly wps = inject(WaypointService);

  tw: { fp: THREE.Vector3; tp: THREE.Vector3; ft: THREE.Vector3; tt: THREE.Vector3; t: number } | null = null;

  animId = 0;

  /** Dipanggil CanvasStageComponent setelah canvas & overlay siap. */
  attach(canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.ctx.attach(canvas, overlay);
    this.lighting.initLights();
    this.shop.initOfficeEnvironment();
    this.street.initStreetFront();
    this.ac.initWallAc();
    this.wps.initWaypoints();
    this.ctx.resize();
    window.addEventListener('resize', this.ctx.handleResize);
    canvas.addEventListener('pointerdown', () => { this.tw = null; });
  }

  /** Hook yang dulu property publik OfficeEngine; UI Angular memasangnya di sini. */
  set hooks(h: { onStateChange?: () => void; onLiveMessage?: (m: string) => void; onToast?: (m: string) => void }) {
    if (h.onStateChange !== undefined) this.ctx.onStateChange = h.onStateChange;
    if (h.onLiveMessage !== undefined) this.ctx.onLiveMessage = h.onLiveMessage;
    if (h.onToast !== undefined) this.ctx.onToast = h.onToast;
  }

  // ──────────────────────────────────────────────────────────
  // Permukaan publik — SAMA seperti kelas OfficeEngine lama, supaya pemanggil Angular
  // tidak perlu tahu ada 20 service di belakangnya.
  // ──────────────────────────────────────────────────────────
  get agents(): AgentData[] { return this.ctx.agents; }
  get events(): FeedEvent[] { return this.feed.events; }
  get simMs(): number { return this.ctx.simMs; }
  get paused(): boolean { return this.ctx.paused; }
  set paused(v: boolean) { this.ctx.paused = v; }
  get speed(): number { return this.ctx.speed; }
  set speed(v: number) { this.ctx.speed = v; }
  get labelsOn(): boolean { return this.ctx.labelsOn; }
  set labelsOn(v: boolean) { this.ctx.labelsOn = v; }

  syncRealSessions(sessions: Session[]): void { this.sync.syncRealSessions(sessions); }
  handleRealToolCall(tc: ToolCall): void { this.sync.handleRealToolCall(tc); }
  handleSubagentSpawn(sub: Session): void { this.sync.handleSubagentSpawn(sub); }
  setMenuBoard(rows: MenuBoardRow[]): void { this.menu.setMenuBoard(rows); }
  setAcMode(mode: AcMode): void { this.ac.setAcMode(mode); }
  startExit(a: AgentData): void { this.paths.startExit(a); }
  burst(): void { this.beam.burst(); }

  animate = () => {
    this.animId = requestAnimationFrame(this.animate);
    const dt = Math.min(this.ctx.clock.getDelta(), 0.05);

    if (this.tw) {
      this.tw.t += dt / 0.8;
      const k = this.tw.t >= 1 ? 1 : 1 - Math.pow(1 - this.tw.t, 3);
      this.ctx.camera.position.lerpVectors(this.tw.fp, this.tw.tp, k);
      this.ctx.controls.target.lerpVectors(this.tw.ft, this.tw.tt, k);
      if (this.tw.t >= 1) this.tw = null;
    }

    this.ctx.controls.update();

    if (!this.ctx.paused) {
      this.ctx.simMs += dt * 1000 * this.ctx.speed;

      this.movement.stepAgents(dt);

      this.door.stepDoor(dt);
      this.beam.step(dt);
      this.seatItems.step(dt);
      this.sun.step(dt);
      this.sun.stepDust(dt);

      this.ac.updateAc(dt);
    }

    this.pills.updateFloatingPills();
    this.ctx.renderer.render(this.ctx.scene, this.ctx.camera);
  };

  start() {
    this.animate();
  }

  stop() {
    cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.ctx.handleResize);
  }

  camPreset(preset: 'over' | 'ground' | 'play' | 'street') {
    const P = {
      over: { p: [0, 13, 17], t: [0, 1, 0.5] },
      ground: { p: [-1, 6.5, 11], t: [-1, 0, 1.5] },
      play: { p: [2.5, 5, 11], t: [6.6, 0, 4] },
      // Satu-satunya preset yang membingkai depan bangunan. Kamera 'over' memotong
      // tanah di z=8,6, jadi trotoar/aspal (z > 9) tidak pernah masuk frame-nya.
      street: { p: [0, 9, 26], t: [0, 1.5, 6] },
    }[preset] || { p: [0, 13, 17], t: [0, 1, 0.5] };

    this.tw = {
      fp: this.ctx.camera.position.clone(),
      tp: new THREE.Vector3(...P.p as [number, number, number]),
      ft: this.ctx.controls.target.clone(),
      tt: new THREE.Vector3(...P.t as [number, number, number]),
      t: 0,
    };
  }

  selectAgent(id: string, fly = true) {
    const a = this.ctx.agents.find((x) => x.id === id);
    if (!a || !a.present || !a._p) return;

    if (fly) {
      const p = a._p.g.position;
      this.tw = {
        fp: this.ctx.camera.position.clone(),
        tp: new THREE.Vector3(p.x + 4.5, p.y + 5, p.z + 6.5),
        ft: this.ctx.controls.target.clone(),
        tt: new THREE.Vector3(p.x, p.y + 1, p.z),
        t: 0,
      };
    }
  }
}
