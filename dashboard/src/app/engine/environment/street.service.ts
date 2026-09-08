// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from '../core/engine-context';
import { StreetFront, createStreetFront } from '../street-front';
import { createIndomaret } from '../indomaret';
import { createOfficeAnnex } from '../office-annex';

@Injectable()
export class StreetService {
  private readonly ctx = inject(EngineContext);

  // Trotoar + jalan raya di depan facade. Susunan z-nya ada di street-front.ts.
  streetFront: StreetFront | null = null;

  initStreetFront() {
    this.streetFront = createStreetFront();
    this.ctx.scene.add(this.streetFront.group);
    // Unit kiri: Indomaret
    this.ctx.scene.add(createIndomaret().group);
    // Unit kanan: Office Annex (modern glass-walled office)
    this.ctx.scene.add(createOfficeAnnex().group);
  }
}
