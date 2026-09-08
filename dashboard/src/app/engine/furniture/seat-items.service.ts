// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from '../core/engine-context';

@Injectable()
export class SeatItemsService {
  private readonly ctx = inject(EngineContext);

  seatItems: Record<string, { objects: THREE.Object3D[]; screen?: { m: THREE.MeshBasicMaterial; base: number; ph: number }; steam?: { m: THREE.Mesh; t: number; base: number } }> = {};

  addSeatItems(
    agentId: string,
    seatConfig: { seat: [number, number]; rot: number; topY?: number },
    color = 0x38bdf8
  ) {
    if (this.seatItems[agentId]) return;

    const mat = (c: number, r = 0.8, m = 0.05) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const seatPos = new THREE.Vector3(seatConfig.seat[0], 0, seatConfig.seat[1]);
    const tx = seatPos.x - Math.sin(seatConfig.rot) * 0.55;
    const tz = seatConfig.seat[1] - Math.cos(seatConfig.rot) * 0.55;
    // Meja bar lebih tinggi dari meja kerja; laptop & cangkir harus nempel permukaannya.
    const topY = seatConfig.topY ?? 0.76;
    const objects: THREE.Object3D[] = [];

    const laptop = new THREE.Group();
    laptop.position.set(tx, topY, tz);
    laptop.rotation.y = seatConfig.rot + Math.PI;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.035, 0.34), mat(0x14181f, 0.45));
    base.castShadow = true;
    laptop.add(base);
    const screenMat = new THREE.MeshBasicMaterial({ color });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.3), screenMat);
    screen.position.set(0, 0.17, -0.14);
    screen.rotation.x = -0.32;
    laptop.add(screen);
    this.ctx.scene.add(laptop);
    objects.push(laptop);

    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.1, 12), mat(0xf3e7d3, 0.5));
    cup.position.set(tx + 0.35, topY + 0.02, tz + 0.15);
    cup.castShadow = true;
    this.ctx.scene.add(cup);
    objects.push(cup);

    const steamMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.22),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 })
    );
    steamMesh.position.set(cup.position.x, cup.position.y + 0.2, cup.position.z);
    this.ctx.scene.add(steamMesh);
    objects.push(steamMesh);

    const screenPulse = { m: screenMat, base: color, ph: Math.random() * 9 };
    const steam = { m: steamMesh, t: Math.random() * 9, base: cup.position.y + 0.2 };    this.ctx.screens.push(screenPulse);
    this.ctx.steams.push(steam);
    this.seatItems[agentId] = { objects, screen: screenPulse, steam };
  }

  removeSeatItems(agentId: string) {
    const items = this.seatItems[agentId];
    if (!items) return;

    items.objects.forEach((object) => this.ctx.scene.remove(object));
    if (items.screen) {
      this.ctx.screens = this.ctx.screens.filter((screen) => screen !== items.screen);
    }
    if (items.steam) {
      this.ctx.steams = this.ctx.steams.filter((steam) => steam !== items.steam);
    }
    delete this.seatItems[agentId];
  }

  step(dt: number) {
    // Screens & steams
    this.ctx.screens.forEach((s) => {
      s.ph += dt;
      s.m.color.setHex(s.base).multiplyScalar(0.9 + 0.1 * Math.sin(s.ph * 7));
    });
    this.ctx.steams.forEach((s) => {
      s.t += dt;
      s.m.position.y += dt * 0.22;
      if (s.m.position.y > s.base + 0.5) s.m.position.y = s.base;
      (s.m.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.abs(Math.sin(s.t * 3)) * 0.14;
    });

    this.ctx.steams.forEach((s) => {
      s.t += dt;
      s.m.position.y += dt * 0.22;
      if (s.m.position.y > s.base + 0.5) s.m.position.y = s.base;
      (s.m.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.abs(Math.sin(s.t * 3)) * 0.14;
    });
  }
}
