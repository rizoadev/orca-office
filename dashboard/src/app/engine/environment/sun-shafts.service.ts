// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from '../core/engine-context';
import { TextureFactoryService } from '../core/texture-factory.service';

@Injectable()
export class SunShaftService {
  private readonly ctx = inject(EngineContext);
  private readonly tex = inject(TextureFactoryService);

  // Cahaya matahari dari dinding jendela kiri: berkas, genangan di lantai, debu.
  sunShafts: { m: THREE.MeshBasicMaterial; base: number; ph: number }[] = [];

  sunPools: { m: THREE.MeshBasicMaterial; base: number; ph: number }[] = [];

  dust: { pts: THREE.Points; motes: { t: number; lat: number; bay: number; sway: number }[]; bays: THREE.Vector3[]; dir: THREE.Vector3; span: number } | null = null;

  initSunShafts() {
    // Harus sama dengan arah lowSun di initLights — kalau tidak, berkas cahaya dan
    // bayangan kusen saling bertentangan dan otaknya langsung protes.
    const from = new THREE.Vector3(-14, 9.5, -7);
    const to = new THREE.Vector3(2, 0, 2);
    const dir = to.clone().sub(from).normalize();

    const fade = this.tex.createCanvasTex(8, 128, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(169,196,255,0.5)');
      grad.addColorStop(0.55, 'rgba(102,133,205,0.18)');
      grad.addColorStop(1, 'rgba(58,79,132,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    });

    const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...a.toArray(), ...b.toArray(), ...c.toArray(), ...d.toArray()]), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]), 2));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      geo.computeVertexNormals();
      return geo;
    };

    // 3 berkas, bukan 4: tiap quad tambahan adalah overdraw seukuran layar, dan
    // DoubleSide menggandakannya lagi. Tiga masih terbaca sebagai deretan sinar.
    const bays = [-3.7, -0.7, 2.3];
    const HALF = 0.75;
    const TOP_Y = 4.5;
    const X0 = -9.9;
    const t = TOP_Y / -dir.y;
    const land = new THREE.Vector3(X0, TOP_Y, 0).clone().add(dir.clone().multiplyScalar(t));
    const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();

    bays.forEach((zc) => {
      const topL = new THREE.Vector3(X0, TOP_Y, zc - HALF);
      const topR = new THREE.Vector3(X0, TOP_Y, zc + HALF);
      const botR = new THREE.Vector3(land.x, 0.03, zc + HALF + dir.z * t);
      const botL = new THREE.Vector3(land.x, 0.03, zc - HALF + dir.z * t);

      const shaft = new THREE.Mesh(
        quad(topL, topR, botR, botL),
        new THREE.MeshBasicMaterial({
          map: fade,
          color: 0x8fb3ff,
          transparent: true,
          opacity: 0.065,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      shaft.renderOrder = 3;
      this.ctx.scene.add(shaft);
      this.sunShafts.push({ m: shaft.material as THREE.MeshBasicMaterial, base: 0.065, ph: Math.random() * 9 });

      // Genangan cahaya di lantai: belah ketupat dari ujung berkas sepanjang meja bar.
      const p0 = botL.clone().addScaledVector(flat, -0.15);
      const p1 = botR.clone().addScaledVector(flat, -0.15);
      const p2 = botR.clone().addScaledVector(flat, 1.9);
      const p3 = botL.clone().addScaledVector(flat, 1.9);
      const pool = new THREE.Mesh(
        quad(p0, p1, p2, p3),
        new THREE.MeshBasicMaterial({
          color: 0x7da2ff,
          transparent: true,
          opacity: 0.045,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      pool.rotation.x = 0;
      pool.renderOrder = 2;
      this.ctx.scene.add(pool);
      this.sunPools.push({ m: pool.material as THREE.MeshBasicMaterial, base: 0.045, ph: Math.random() * 9 });
    });

    // Debu dalam berkas: 24 titik per bay, digerakkan sepanjang `dir` tiap frame.
    const motes: { t: number; lat: number; bay: number; sway: number }[] = [];
    const positions = new Float32Array(bays.length * 24 * 3);
    for (let bay = 0; bay < bays.length; bay++) {
      for (let i = 0; i < 24; i++) {
        motes.push({ t: Math.random(), lat: (Math.random() - 0.5) * 1.6, bay, sway: Math.random() * 6.28 });
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xa9c4ff,
        size: 0.03,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );
    pts.renderOrder = 4;
    this.ctx.scene.add(pts);
    this.dust = { pts, motes, bays: bays.map((z) => new THREE.Vector3(X0, TOP_Y, z)), dir, span: t };
    this.stepDust(0);
  }

  // Posisi debu dihitung ulang tiap frame: sepanjang berkas + ayunan lateral kecil.

  stepDust(dt: number) {
    const d = this.dust;
    if (!d) return;
    const attr = d.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
    d.motes.forEach((mote, i) => {
      mote.t += dt * 0.012;
      if (mote.t > 1) {
        mote.t = 0;
        mote.lat = (Math.random() - 0.5) * 1.6;
      }
      mote.sway += dt * 0.6;
      const start = d.bays[mote.bay];
      const x = start.x + d.dir.x * d.span * mote.t;
      const y = start.y + d.dir.y * d.span * mote.t;
      const z = start.z + d.dir.z * d.span * mote.t + Math.sin(mote.sway) * 0.05 + mote.lat * 0.35;
      attr.setXYZ(i, x, y, z);
    });
    attr.needsUpdate = true;
  }

  step(dt: number) {
    // Berkas matahari: napas pelan (debu & intensitas awan), bukan kedip.
    this.sunShafts.forEach((s) => {
      s.ph += dt;
      s.m.opacity = s.base * (0.82 + 0.18 * Math.sin(s.ph * 0.55));
    });
    this.sunPools.forEach((s) => {
      s.ph += dt;
      s.m.opacity = s.base * (0.86 + 0.14 * Math.sin(s.ph * 0.55 + 0.6));
    });
  }
}
