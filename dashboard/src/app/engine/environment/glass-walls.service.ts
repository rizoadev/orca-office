// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from '../core/engine-context';

@Injectable()
export class GlassWallService {
  private readonly ctx = inject(EngineContext);

  buildWindowWall() {
    const X = -10.1;
    const Z0 = -7.7;
    const DEPTH = 16;
    const HEIGHT = 5.4;
    const ZC = Z0 + DEPTH / 2;

    const mat = (c: number, r = 0.8, m = 0.05) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const frameM = mat(0x1b1611, 0.45, 0.55);
    const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.ctx.scene.add(mesh);
      return mesh;
    };

    // Bukaan kaca: 0.18m di bawah sampai 5.12m di atas — praktis floor-to-ceiling.
    box(0.26, 0.18, DEPTH, mat(0x2a2118, 0.7), X, 0.09, ZC);
    box(0.3, 0.26, DEPTH, mat(0x2a2118, 0.7), X, HEIGHT - 0.13, ZC);
    box(0.3, HEIGHT, 0.3, frameM, X, HEIGHT / 2, Z0 + 0.15);
    box(0.3, HEIGHT, 0.3, frameM, X, HEIGHT / 2, Z0 + DEPTH - 0.15);

    const BAY = 2.0;
    for (let i = 0; i <= DEPTH / BAY; i++) {
      box(0.15, HEIGHT - 0.4, 0.11, frameM, X + 0.02, HEIGHT / 2, Z0 + i * BAY);
    }
    [1.8, 3.6].forEach((y) => {
      box(0.11, 0.09, DEPTH, frameM, X + 0.02, y, ZC);
    });

    // Ambang dalam: tempat gelas & pot kecil.
    box(0.34, 0.06, DEPTH, mat(0x6b4a2b, 0.6), X + 0.24, 0.2, ZC);

    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(DEPTH - 0.2, HEIGHT - 0.4),
      new THREE.MeshStandardMaterial({
        color: 0xcfe9ff,
        transparent: true,
        opacity: 0.13,
        roughness: 0.06,
        metalness: 0.15,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    glass.rotation.y = Math.PI / 2;
    glass.position.set(X + 0.05, HEIGHT / 2, ZC);
    this.ctx.scene.add(glass);

    const terrace = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, DEPTH + 2),
      mat(0xbfae94, 0.85)
    );
    terrace.rotation.x = -Math.PI / 2;
    terrace.position.set(-12.2, 0.02, ZC);
    terrace.receiveShadow = true;
    this.ctx.scene.add(terrace);

    // Semak di luar: siluet bulat, cukup untuk menjual kedalaman.
    const shrubM = mat(0x3f5a33, 0.9);
    [[-12.4, -5.6], [-13.1, -1.2], [-12.6, 3.4], [-13.4, 6.6]].forEach(([x, z], i) => {
      const r = 0.7 + (i % 2) * 0.35;
      const shrub = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), shrubM);
      shrub.position.set(x, r * 0.75, z);
      this.ctx.scene.add(shrub);
    });

    // Pot kecil di ambang jendela — di luar rentang meja bar supaya tetap terlihat.
    const potM = mat(0x8a4f2c, 0.8);
    [-6.8, -6.1, 4.6, 6.4].forEach((z, i) => {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.16, 12), potM);
      pot.position.set(X + 0.24, 0.31, z);
      pot.castShadow = true;
      this.ctx.scene.add(pot);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.13 + (i % 2) * 0.04, 10, 8), mat(0x4c7a3f, 0.85));
      leaf.position.set(X + 0.24, 0.5, z);
      leaf.castShadow = true;
      this.ctx.scene.add(leaf);
    });
  }

  // ── Meja panjang + bar stool di sepanjang dinding kaca ───────────────────────

  buildWindowBar() {
    const mat = (c: number, r = 0.8, m = 0.05) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const woodM = mat(0x7a5230, 0.55, 0.08);
    const steelM = mat(0x2b3038, 0.35, 0.85);
    const X = -9.5;
    const ZC = -1.0;
    const LEN = 9.2;
    const TOP_Y = 1.06;

    const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.ctx.scene.add(mesh);
      return mesh;
    };

    box(0.92, 0.07, LEN, woodM, X, TOP_Y, ZC);
    box(0.05, 0.26, LEN, mat(0x5c3a20, 0.7), X + 0.44, TOP_Y - 0.17, ZC);
    [-5.2, -1.0, 3.2].forEach((z) => {
      box(0.78, TOP_Y - 0.04, 0.07, steelM, X, (TOP_Y - 0.04) / 2, z);
      box(0.86, 0.04, 0.1, steelM, X, 0.02, z);
    });

    // Rak di tembok kaca + gelas gantung: bikin dinding kiri terasa berfungsi.
    box(0.26, 0.05, LEN, woodM, X - 0.42, 1.66, ZC);
    [-4.4, -2.4, 0.4, 2.4].forEach((z, i) => {
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.11, 10), mat(i % 2 ? 0xe8dcc8 : 0x9ec5d8, 0.6));
      mug.position.set(X - 0.42, 1.74, z);
      mug.castShadow = true;
      this.ctx.scene.add(mug);
    });

    const stoolAt = (z: number) => {
      const g = new THREE.Group();
      g.position.set(-8.72, 0, z);
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.06, 18), woodM);
      seat.position.y = 0.72;
      seat.castShadow = true;
      g.add(seat);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 10), steelM);
      post.position.y = 0.36;
      post.castShadow = true;
      g.add(post);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.035, 18), steelM);
      foot.position.y = 0.02;
      g.add(foot);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.014, 6, 18), steelM);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.26;
      g.add(ring);
      this.ctx.scene.add(g);
    };
    [-4.4, -2.4, 0.4, 2.4].forEach(stoolAt);

    // Lampu gantung di atas counter: satu point light untuk seluruh bar (murah),
    // tiga kap lampu sebagai visual.
    [-4.2, -1.0, 2.2].forEach((z) => {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.1, 6), mat(0x14181f, 0.6));
      cord.position.set(X, 3.5, z);
      this.ctx.scene.add(cord);
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.2, 16, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x2f2a24, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide })
      );
      shade.position.set(X, 2.9, z);
      shade.castShadow = true;
      this.ctx.scene.add(shade);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
      );
      bulb.position.set(X, 2.83, z);
      this.ctx.scene.add(bulb);
    });
    const barLight = new THREE.PointLight(0xffc98a, 0.9, 7, 2);
    barLight.position.set(X, 2.7, ZC);
    this.ctx.scene.add(barLight);
  }

  // ── Dinding kanan: full window ber-frame (mirror dari kiri) ──────────────────

  buildRightWindowWall() {
    const X = 10.1;
    const Z0 = -7.7;
    const DEPTH = 16;
    const HEIGHT = 5.4;
    const ZC = Z0 + DEPTH / 2;

    const mat = (c: number, r = 0.8, m = 0.05) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const frameM = mat(0x1b1611, 0.45, 0.55);
    const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.ctx.scene.add(mesh);
      return mesh;
    };

    // Bukaan kaca: floor-to-ceiling mirror dari sisi kiri.
    box(0.26, 0.18, DEPTH, mat(0x2a2118, 0.7), X, 0.09, ZC);
    box(0.3, 0.26, DEPTH, mat(0x2a2118, 0.7), X, HEIGHT - 0.13, ZC);
    box(0.3, HEIGHT, 0.3, frameM, X, HEIGHT / 2, Z0 + 0.15);
    box(0.3, HEIGHT, 0.3, frameM, X, HEIGHT / 2, Z0 + DEPTH - 0.15);

    // Vertical mullions
    const BAY = 2.0;
    for (let i = 0; i <= DEPTH / BAY; i++) {
      box(0.15, HEIGHT - 0.4, 0.11, frameM, X - 0.02, HEIGHT / 2, Z0 + i * BAY);
    }
    // Horizontal mullions
    [1.8, 3.6].forEach((y) => {
      box(0.11, 0.09, DEPTH, frameM, X - 0.02, y, ZC);
    });

    // Ambang dalam
    box(0.34, 0.06, DEPTH, mat(0x6b4a2b, 0.6), X - 0.24, 0.2, ZC);

    // Glass pane
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(DEPTH - 0.2, HEIGHT - 0.4),
      new THREE.MeshStandardMaterial({
        color: 0xcfe9ff,
        transparent: true,
        opacity: 0.13,
        roughness: 0.06,
        metalness: 0.15,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    glass.rotation.y = Math.PI / 2;
    glass.position.set(X - 0.05, HEIGHT / 2, ZC);
    this.ctx.scene.add(glass);

    // Outdoor terrace (gap 3m ke Office Annex)
    const terrace = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, DEPTH + 2),
      mat(0xbfae94, 0.85)
    );
    terrace.rotation.x = -Math.PI / 2;
    terrace.position.set(12.2, 0.02, ZC);
    terrace.receiveShadow = true;
    this.ctx.scene.add(terrace);

    // Semak di luar (sisi kanan, menghadap Office Annex gap)
    const shrubM = mat(0x3f5a33, 0.9);
    [[12.4, -5.6], [13.1, -1.2], [12.6, 3.4], [13.4, 6.6]].forEach(([x, z], i) => {
      const r = 0.7 + (i % 2) * 0.35;
      const shrub = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), shrubM);
      shrub.position.set(x, r * 0.75, z);
      this.ctx.scene.add(shrub);
    });

    // Pot kecil di ambang jendela kanan
    const potM = mat(0x8a4f2c, 0.8);
    [-6.8, -6.1, 4.6, 6.4].forEach((z, i) => {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.16, 12), potM);
      pot.position.set(X - 0.24, 0.31, z);
      pot.castShadow = true;
      this.ctx.scene.add(pot);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.13 + (i % 2) * 0.04, 10, 8), mat(0x4c7a3f, 0.85));
      leaf.position.set(X - 0.24, 0.5, z);
      leaf.castShadow = true;
      this.ctx.scene.add(leaf);
    });
  }

  // ── Berkas moonlight lembut (volumetrik palsu) + debu melayang ───────────────
}
