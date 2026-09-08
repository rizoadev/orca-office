// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from '../core/engine-context';

@Injectable()
export class PillOverlayService {
  private readonly ctx = inject(EngineContext);

  updateFloatingPills() {
    const w = this.ctx.canvas.parentElement?.clientWidth || this.ctx.canvas.clientWidth;
    const h = this.ctx.canvas.parentElement?.clientHeight || this.ctx.canvas.clientHeight;

    this.ctx.agents.forEach((a) => {
      const el = document.getElementById(`pill-${a.id}`);
      if (!el) return;

      if (!this.ctx.labelsOn || !a.present || !a._p) {
        el.style.display = 'none';
        return;
      }

      this.ctx.tv.set(a._p.g.position.x, a._p.g.position.y + 1.75, a._p.g.position.z).project(this.ctx.camera);
      if (this.ctx.tv.z > 1) {
        el.style.display = 'none';
        return;
      }

      const x = (this.ctx.tv.x * w) / 2 + w / 2;
      const y = (-this.ctx.tv.y * h) / 2 + h / 2;

      if (x < -80 || x > w + 80 || y < -40 || y > h + 60) {
        el.style.display = 'none';
        return;
      }

      el.style.display = 'block';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    });
  }
}
