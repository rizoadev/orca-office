// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from '../core/engine-context';
import confetti from 'canvas-confetti';

@Injectable()
export class BeamService {
  private readonly ctx = inject(EngineContext);

  beams: { pk: THREE.Mesh; li: THREE.Line; cur: THREE.QuadraticBezierCurve3; pr: number; sp: number }[] = [];

  beam(fromId: string, toId: string) {
    const fromA = this.ctx.agents.find((x) => x.id === fromId);
    const toA = this.ctx.agents.find((x) => x.id === toId);
    if (!fromA || !toA) return;

    const F = fromA._p.g;
    const T = toA._p.g;
    const p1 = F.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    const p2 = T.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    const mid = p1.clone().lerp(p2, 0.5);
    mid.y += 1.3;

    const cur = new THREE.QuadraticBezierCurve3(p1, mid, p2);
    const li = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(cur.getPoints(20)),
      new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.5 })
    );
    this.ctx.scene.add(li);

    const pk = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
    this.ctx.scene.add(pk);
    this.beams.push({ pk, li, cur, pr: 0, sp: 0.02 });
  }

  // Hanya agen yang memang berniat melewati doorway yang boleh membuka pintu.
  // Goal pintu di-randomize ±0.95 x / ±0.18 z, jadi window pembanding dilebarkan.

  burst() {
    confetti({ particleCount: 70, spread: 70, origin: { y: 0.7 } });
  }

  // =========================================================================
  // 100% REAL PI SESSIONS & TELEMETRY SYNC
  // =========================================================================

  step(dt: number) {
    // Beams
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.pr += b.sp * (this.ctx.speed > 1 ? 2 : 1);
      if (b.pr >= 1) {
        this.ctx.scene.remove(b.pk, b.li);
        this.beams.splice(i, 1);
      } else {
        b.pk.position.copy(b.cur.getPoint(b.pr));
      }
    }
  }
}
