// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from '../core/engine-context';

@Injectable()
export class LightingService {
  private readonly ctx = inject(EngineContext);

  initLights() {
    // Vibes malam: interior tetap hangat dari lampu coffeeshop, sementara cahaya luar
    // hanya moonlight lembut agar jendela sabana tidak berubah jadi bidang silau.
    this.ctx.scene.add(new THREE.AmbientLight(0x6d6470, 0.44));
    const hemi = new THREE.HemisphereLight(0x8ea7d8, 0x1b120d, 0.38);
    this.ctx.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0x9fb8ff, 0.32);
    sun.position.set(9, 16, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -34;
    sun.shadow.camera.right = 34;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -14;
    this.ctx.scene.add(sun);

    // Moonlight miring dari jendela kiri. Arahnya tetap sama agar bayangan kusen
    // masih terbaca, tapi intensitasnya jauh lebih rendah dari mode siang.
    const lowSun = new THREE.DirectionalLight(0x8fb3ff, 0.36);
    lowSun.position.set(-14, 9.5, -7);
    lowSun.target.position.set(2, 0, 2);
    lowSun.castShadow = true;
    lowSun.shadow.mapSize.set(2048, 2048);
    const lc = lowSun.shadow.camera;
    lc.left = -34;
    lc.right = 34;
    lc.top = 18;
    lc.bottom = -18;
    lc.near = 0.5;
    lc.far = 46;
    // Bias negatif kecil: tanpa ini permukaan lantai dapat 'shadow acne' dari kusen tipis.
    lowSun.shadow.bias = -0.0006;
    lowSun.shadow.normalBias = 0.02;
    this.ctx.scene.add(lowSun, lowSun.target);

    // Pantulan hangat dari interior supaya sisi kiri tidak jadi gelap total.
    const bounce = new THREE.PointLight(0xffc58f, 0.45, 16, 2);
    bounce.position.set(-7.4, 1.6, 1.2);
    this.ctx.scene.add(bounce);

    const warm = new THREE.PointLight(0xffb366, 0.55, 22);
    warm.position.set(0, 5, -1);
    this.ctx.scene.add(warm);

    const barGlow = new THREE.PointLight(0xff9a3c, 0.9, 10);
    barGlow.position.set(-5.5, 2.6, -4.6);
    this.ctx.scene.add(barGlow);

    // Warm rear-corner light sources behind the room, visible as an ambient halo
    // on the back wall and side walls. Sisi kanan dipindah ke lorong toilet.
    [
      [-9.35, 3.45, -5.95],
      [9.15, 3.05, -2.9],
    ].forEach(([x, y, z]) => {
      const cornerGlow = new THREE.PointLight(0xffbf78, 1.65, 9, 1.8);
      cornerGlow.position.set(x, y, z);
      this.ctx.scene.add(cornerGlow);
    });
  }

  // ── Dinding kiri: full window ber-frame + lanskap luar yang terang ──────────────
  // Kusen tipis tapi castShadow, jadi sinar sore menjatuhkan garis-garis diagonal
  // ke lantai — itu efek "matahari masuk" yang dicari, bukan sekadar lampu terang.
}
