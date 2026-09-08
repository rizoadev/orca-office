// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from '../core/engine-context';
import { FeedService } from '../core/feed.service';
import { MusholaFloorService } from './mushola-floor.service';
import { PathService } from '../navigation/paths.service';
import type { AgentData } from '../../core/models/types';

@Injectable()
export class MusholaService {
  private readonly ctx = inject(EngineContext);
  private readonly feed = inject(FeedService);
  private readonly mezz = inject(MusholaFloorService);
  private readonly paths = inject(PathService);

  goToMushola(a: AgentData) {
    const mezz = this.ctx.mezzanine;
    if (!mezz || !this.ctx.seats[a.id]) return;
    const spot = this.mezz.freeMusholaSpot();
    if (spot === null) return;

    this.mezz.musholaSlots.set(spot, a.id);
    a.musholaSpot = spot;
    const cur = a._p?.g.position.clone() ?? this.ctx.seats[a.id].stand.clone();
    this.paths.setPath(
      a,
      [
        cur,
        this.paths.aisleFor(a).clone(),
        this.ctx.waypoints.mezzFoot.clone(),
        ...mezz.stairWaypoints.map((w) => w.clone()),
        mezz.landing.clone(),
        mezz.prayerSpots[spot].clone()
      ],
      'to',
      { after: 'mushola' }
    );
    a.task = 'Naik ke mushola';
    this.feed.feed('move', 'ORCA24 Hub', `${a.name} naik ke lantai dua.`);
    if (this.ctx.onToast) this.ctx.onToast(`🕌 ${a.name} naik ke mushola`);
  }

  leaveMushola(a: AgentData) {
    if (a.musholaSpot != null) this.mezz.musholaSlots.delete(a.musholaSpot);
    a.musholaSpot = null;
    const seat = this.ctx.seats[a.id];
    const cur = a._p?.g.position.clone() ?? seat?.stand.clone() ?? new THREE.Vector3();
    this.paths.setPath(
      a,
      [cur, ...this.mezz.stairDescentFrom(a), this.ctx.waypoints.mezzFoot.clone(), this.paths.aisleFor(a).clone(), seat?.stand.clone() ?? cur],
      'back',
      { after: 'work' }
    );
    a.task = 'Ada task baru — turun ke meja';
    this.feed.feed('move', 'ORCA24 Hub', `${a.name} turun dari mushola kembali ke meja.`);
    if (this.ctx.onToast) this.ctx.onToast(`💻 ${a.name} turun dari mushola`);
  }

  /** Hitung waktu menganggur di meja; cukup lama -> antar ke saf. */

  trackMusholaIdle(a: AgentData, dt: number) {
    if (!this.ctx.mezzanine) return;
    const waiting = a.present && !a.path.length && a.mode === 'idle' && !this.mezz.isMusholaBound(a);
    a.idle = waiting ? a.idle + dt : 0;
    // Ambang tiap agent digeser dari urutan kursi supaya tidak naik berombongan.
    const threshold = this.mezz.musholaIdleAfter + (a.order % 6) * 7;
    if (waiting && a.idle >= threshold && this.mezz.musholaSlots.size < this.ctx.mezzanine.prayerSpots.length) {
      this.goToMushola(a);
    }
  }
}
