// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from '../core/engine-context';
import { FeedService } from '../core/feed.service';
import { MusholaFloorService } from '../rooms/mushola-floor.service';
import { SeatItemsService } from '../furniture/seat-items.service';
import type { AgentData } from '../../core/models/types';

@Injectable()
export class PathService {
  private readonly ctx = inject(EngineContext);
  private readonly feed = inject(FeedService);
  private readonly mezz = inject(MusholaFloorService);
  private readonly seatItems = inject(SeatItemsService);

  aisleFor(a: AgentData) {
    const x = a.seat[0];
    if (x < -4.5) return this.ctx.waypoints.gW;
    if (x > 4.5) return this.ctx.waypoints.gE;
    return a.seat[1] > 3 ? this.ctx.waypoints.gC : this.ctx.waypoints.gN;
  }

  randomRange(min: number, max: number) {
    return min + Math.random() * (max - min);
  }

  randomizeGroundPoint(point: THREE.Vector3, xRadius: number, zRadius: number) {
    return point.clone().add(new THREE.Vector3(
      this.randomRange(-xRadius, xRadius),
      0,
      this.randomRange(-zRadius, zRadius)
    ));
  }

  isCentral(a: AgentData) {
    return Math.abs(a.seat[0]) < 4.5;
  }

  buildEntrancePath(a: AgentData) {
    const seat = this.ctx.seats[a.id];
    const pts = [
      this.randomizeGroundPoint(this.ctx.waypoints.out, 1.25, 0.45),
      this.randomizeGroundPoint(this.ctx.waypoints.door, 0.95, 0.18),
      this.randomizeGroundPoint(this.ctx.waypoints.queue, 0.35, 0.2),
      this.randomizeGroundPoint(this.ctx.waypoints.order, 0.28, 0.12),
    ];
    a.orderStopIndex = pts.length - 1;
    a.orderUntil = null;
    a.hasOrderedCoffee = false;
    a.orderTaskBefore = null;

    const aisle = this.randomizeGroundPoint(this.aisleFor(a), 0.4, 0.35);

    if (aisle.distanceTo(this.ctx.waypoints.order) > 0.4) {
      pts.push(aisle);
    }
    if (seat) {
      pts.push(seat.stand.clone());
    }

    return pts;
  }

  buildExitPath(a: AgentData): THREE.Vector3[] {
    const current = a._p?.g.position.clone();
    // Sesi yang mati saat agent ada di lantai dua harus turun lewat lif, bukan
    // menembus pelantai. Titik awalnya tetap posisi dia sekarang.
    if (current && current.y > 0.5 && this.ctx.mezzanine) {
      if (a.musholaSpot != null) this.mezz.musholaSlots.delete(a.musholaSpot);
      a.musholaSpot = null;
      const atFoot = this.ctx.waypoints.mezzFoot.clone();
      return [current.clone(), ...this.mezz.stairDescentFrom(a), atFoot, ...this.groundExitPath(a, atFoot)];
    }
    if (current) current.y = 0;
    return this.groundExitPath(a, current);
  }

  private groundExitPath(a: AgentData, current: THREE.Vector3 | undefined): THREE.Vector3[] {
    // Kalau sesi berakhir saat agent masih di area luar/pintu, jangan paksa dia
    // masuk dulu; langsung balik ke luar supaya gerakannya tetap natural.
    if (current && current.z > this.ctx.waypoints.door.z - 0.2) {
      return [this.randomizeGroundPoint(this.ctx.waypoints.out, 1.25, 0.45)];
    }

    const pts: THREE.Vector3[] = [];
    const seat = this.ctx.seats[a.id];
    if (seat && (!current || current.distanceTo(seat.stand) > 0.35)) {
      pts.push(seat.stand.clone());
    }

    const aisle = this.randomizeGroundPoint(this.aisleFor(a), 0.4, 0.35);
    if (!current || current.distanceTo(aisle) > 0.35) {
      pts.push(aisle);
    }

    pts.push(
      this.randomizeGroundPoint(this.ctx.waypoints.door, 0.95, 0.18),
      this.randomizeGroundPoint(this.ctx.waypoints.out, 1.25, 0.45)
    );
    return pts;
  }

  startExit(a: AgentData) {
    if (a.mode === 'leaving' || a.after === 'break_out') return;

    this.seatItems.removeSeatItems(a.id);
    a.status = 'offline';
    a.task = 'Sesi selesai — berjalan keluar pintu';
    a.prog = 100;
    this.setPath(a, this.buildExitPath(a), 'leaving', { after: 'break_out' });
    this.feed.feed('move', 'ORCA24 Hub', `${a.name} selesai dan berjalan keluar pintu.`);
    if (this.ctx.onToast) this.ctx.onToast(`🚪 ${a.name} berjalan keluar pintu`);
  }

  buildPath(fromA: AgentData, toA?: AgentData, purpose?: string) {
    const F = this.ctx.seats[fromA.id];
    const pts = [F.stand.clone()];

    if (!toA) {
      if (purpose === 'out') {
        pts.push(this.aisleFor(fromA).clone(), this.ctx.waypoints.door.clone(), this.ctx.waypoints.out.clone());
      } else {
        const sp = this.ctx.playSpots[Math.floor(Math.random() * this.ctx.playSpots.length)].clone();
        pts.push(this.aisleFor(fromA).clone(), sp);
      }
      return pts;
    }

    const T = this.ctx.seats[toA.id];
    const af = this.aisleFor(fromA);
    const at = this.aisleFor(toA);

    if (af === at) {
      pts.push(af.clone());
    } else if (this.isCentral(fromA) && this.isCentral(toA)) {
      const mx = (fromA.seat[0] + toA.seat[0]) / 2;
      const mz = (fromA.seat[1] + toA.seat[1]) / 2 + 0.9;
      pts.push(new THREE.Vector3(mx, 0, mz));
    } else {
      pts.push(af.clone());
      if (Math.abs(fromA.seat[0] - toA.seat[0]) > 4) {
        pts.push(new THREE.Vector3((fromA.seat[0] + toA.seat[0]) / 2, 0, 1));
      }
      pts.push(at.clone());
    }
    pts.push(T.stand.clone());
    return pts;
  }

  setPath(a: AgentData, pts: THREE.Vector3[], mode: any, meta?: any) {
    a.path = pts;
    a.wi = 0;
    a.mode = mode;
    Object.assign(a, meta || {});
    a.phase = Math.random() * 9;
  }
}
