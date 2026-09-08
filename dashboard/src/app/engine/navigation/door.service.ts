// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from '../core/engine-context';

@Injectable()
export class DoorService {
  private readonly ctx = inject(EngineContext);

  // Pintu depan ganda: dua daun, engsel di tiang kiri & kanan, bertemu di tengah
  // bukaan. Keduanya mengayun ke luar (+z) — ke dalam akan menyapu sprite yang lagi
  // di area play. Tanda rotasi daun kanan dibalik dari yang kiri supaya sama-sama keluar.
  frontDoorL: THREE.Group | null = null;

  frontDoorR: THREE.Group | null = null;

  doorAngleL = 0;

  doorAngleR = 0;

  // Timer tahan dipisah per daun, bukan satu untuk berdua: kalau digabung, agen kedua
  // yang lewat di sisi berlawanan membuat daun pertama menutup mendadak di tengah ayunan.
  doorHeldUntilL = 0;

  doorHeldUntilR = 0;

  // Ambang trigger selalu dibandingkan ke waypoint pintu, bukan ke posisi bebas:
  // playC cuma 1.6 m dari pintu, jadi jarak saja bikin pintu menganga terus.
  DOOR_LEAD = 1.7;

  DOOR_OPEN_ANGLE = -1.42;

  DOOR_HOLD_OPEN_MS = 1200;

  requestDoorIfPassing(goal: THREE.Vector3, pos: THREE.Vector3) {
    const door = this.ctx.waypoints.door;
    if (!door) return;
    if (Math.abs(goal.x - door.x) > 1.1 || Math.abs(goal.z - door.z) > 0.45) return;
    if (Math.hypot(pos.x - door.x, pos.z - door.z) > this.DOOR_LEAD) return;
    // Daun mana yang terbuka mengikuti sisi lintasan agen, bukan dipilih acak per event:
    // waypoint pintu sudah di-randomize ±0.95 pada sumbu X, jadi kanan/kirinya berubah
    // sendiri tiap ada yang lewat dan tetap konsisten selama satu lintasan.
    if (goal.x < door.x) this.doorHeldUntilL = this.ctx.simMs + this.DOOR_HOLD_OPEN_MS;
    else this.doorHeldUntilR = this.ctx.simMs + this.DOOR_HOLD_OPEN_MS;
  }

  stepDoor(dt: number) {
    if (!this.frontDoorL || !this.frontDoorR) return;
    const openL = this.ctx.simMs < this.doorHeldUntilL;
    const openR = this.ctx.simMs < this.doorHeldUntilR;
    // Easing eksponensial cukup untuk buka+tutup yang terasa halus tanpa tween system.
    const ease = Math.min(1, dt * 7);
    const tL = openL ? this.DOOR_OPEN_ANGLE : 0;
    const tR = openR ? -this.DOOR_OPEN_ANGLE : 0;
    this.doorAngleL += (tL - this.doorAngleL) * ease;
    this.doorAngleR += (tR - this.doorAngleR) * ease;
    if (!openL && Math.abs(this.doorAngleL) < 0.002) this.doorAngleL = 0;
    if (!openR && Math.abs(this.doorAngleR) < 0.002) this.doorAngleR = 0;
    this.frontDoorL.rotation.y = this.doorAngleL;
    this.frontDoorR.rotation.y = this.doorAngleR;
  }
}
