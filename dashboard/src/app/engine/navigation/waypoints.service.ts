// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from '../core/engine-context';
import { createMusholaMezzanine } from '../mushola-mezzanine';

@Injectable()
export class WaypointService {
  private readonly ctx = inject(EngineContext);

  initWaypoints() {
    this.ctx.waypoints = {
      gC: new THREE.Vector3(0, 0, 3.2),
      gN: new THREE.Vector3(0, 0, -2.4),
      gW: new THREE.Vector3(-5.5, 0, 0.4),
      gE: new THREE.Vector3(5, 0, 0.4),
      queue: new THREE.Vector3(-5.2, 0, -1.6),
      order: new THREE.Vector3(-5.2, 0, -3.6),
      bar: new THREE.Vector3(-5.2, 0, -3.6),
      door: new THREE.Vector3(6, 0, 7.2),
      out: new THREE.Vector3(6, 0, 11),
      playA: new THREE.Vector3(6.6, 0, 4.2),
      playB: new THREE.Vector3(7.9, 0, 5.2),
      playC: new THREE.Vector3(5.6, 0, 5.6),
      // Lorong & ruang toilet di pojok belakang kanan (belum dipakai path agent).
      corridor: new THREE.Vector3(8.78, 0, -2.6),
      toilet: new THREE.Vector3(8.78, 0, -5.4),
    };
    this.ctx.playSpots = [this.ctx.waypoints.playA, this.ctx.waypoints.playB, this.ctx.waypoints.playC];

    this.ctx.mezzanine = createMusholaMezzanine();
    this.ctx.scene.add(this.ctx.mezzanine.group);
    // Anak tangga naik 0.215 — di bawah ambang 0.3 mesin pergerakan, jadi agent
    // bisa naik ke lantai dua tanpa perubahan pada stepPerson.
    const stair = this.ctx.mezzanine.stairWaypoints;
    this.ctx.waypoints.mezzFoot = this.ctx.mezzanine.stairMouth;
    this.ctx.waypoints.mezzTop = stair[stair.length - 1];
    this.ctx.waypoints.mezzLanding = this.ctx.mezzanine.landing;
    this.ctx.waypoints.mezzPrayer = this.ctx.mezzanine.prayerSpots[0];
  }
}
