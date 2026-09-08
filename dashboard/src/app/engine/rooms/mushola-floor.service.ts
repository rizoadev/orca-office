// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from '../core/engine-context';
import type { AgentData } from '../../core/models/types';

@Injectable()
export class MusholaFloorService {
  private readonly ctx = inject(EngineContext);

  // Agent yang menganggur naik lif ke saf di lantai dua dan tinggal di sana sampai
  // ada task baru. Kapasitas dibatasi jumlah helai sajadah, bukan angka acak.
  musholaIdleAfter = 42;

  musholaSlots = new Map<number, string>();

  isMusholaBound(a: AgentData): boolean {
    return a.mode === 'mushola' || a.after === 'mushola';
  }

  freeMusholaSpot(): number | null {
    const spots = this.ctx.mezzanine?.prayerSpots.length ?? 0;
    for (let i = 0; i < spots; i++) {
      if (!this.musholaSlots.has(i)) return i;
    }
    return null;
  }

  /** Titik turun, dimulai dari anak tangga terdekat dengan ketinggian agent sekarang. */

  stairDescentFrom(a: AgentData): THREE.Vector3[] {
    const stair = this.ctx.mezzanine?.stairWaypoints;
    if (!stair) return [];
    const y = a._y ?? a._p?.g.position.y ?? 0;
    let idx = 0;
    let best = Infinity;
    stair.forEach((w, i) => {
      const d = Math.abs(w.y - y);
      if (d < best) {
        best = d;
        idx = i;
      }
    });
    return stair.slice(0, idx + 1).reverse().map((w) => w.clone());
  }
}
