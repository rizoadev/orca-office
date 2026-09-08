// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from '../core/engine-context';
import { WallAcUnit, AcMode, createWallAcUnit } from '../wall-ac';

@Injectable()
export class WallAcService {
  private readonly ctx = inject(EngineContext);

  // AC tembok. `acMode` auto = daya mengikuti jumlah agent yang lagi kerja.
  wallAc: WallAcUnit | null = null;

  acMode: AcMode = 'auto';

  acPower = 0;

  initWallAc() {
    this.wallAc = createWallAcUnit({ x: 4.6, y: 4.15, z: -6.7 });
    this.ctx.scene.add(this.wallAc.group);
  }

  // Depan office: trotoar paving + kanstin + jalan raya aspal, membentang ke +z dari
  // lantai kayu. Dipisah dari initOfficeEnvironment() karena bidangnya datar dan
  // teksturnya kanvas sendiri — tidak ada satu pun yang bergantung pada isi ruangan.

  setAcMode(mode: AcMode) {
    this.acMode = mode;
  }

  // Daya AC: auto = ruangan ramai bikin AC kerja lebih keras; manual on/off untuk demo.

  updateAc(dt: number) {
    let target: number;
    if (this.acMode === 'off') {
      target = 0;
    } else if (this.acMode === 'on') {
      target = 1;
    } else {
      const working = this.ctx.agents.reduce(
        (n, a) => n + (a.present && a.mode === 'work' ? 1 : 0),
        0
      );
      target = Math.min(1, 0.42 + working * 0.15);
    }
    this.acPower += (target - this.acPower) * Math.min(1, dt * 1.8);
    this.wallAc?.update(dt, this.acPower);
    this.ctx.mezzanine?.update(dt);
  }
}
