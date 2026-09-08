// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from '../core/engine-context';
import { DoorService } from '../navigation/door.service';
import { FeedService } from '../core/feed.service';
import { MusholaService } from '../rooms/mushola.service';
import { PathService } from '../navigation/paths.service';
import { SessionSyncService } from '../session/session-sync.service';
import type { AgentData } from '../../core/models/types';

@Injectable()
export class MovementService {
  private readonly ctx = inject(EngineContext);
  private readonly door = inject(DoorService);
  private readonly feed = inject(FeedService);
  private readonly mushola = inject(MusholaService);
  private readonly paths = inject(PathService);
  private readonly sync = inject(SessionSyncService);

  talkPair: { x: string; y: string } | null = null;

  talkT = 0;

  stepPerson(a: AgentData, dt: number) {
    const P = a._p;
    if (!P) return;
    const now = performance.now();

    if (!a.path.length) {
      // Jangan tarik agent di lantai dua kembali ke kursi lantai satu.
      if (a.mode !== 'mushola') {
        a._y = this.ctx.seats[a.id]?.y || 0;
      }
      // @ts-expect-error Perilaku asli engine: saat mode mushola `_y` sengaja tidak
      // diisi ulang di atas, jadi posisi.y bisa ikut undefined. TIDAK 'diperbaiki'
      // supaya render identik dengan baseline React — mengubahnya akan menggeser
      // ketinggian avatar yang baru turun dari mezanine.
      P.g.position.y = a._y;

      if (a.mode === 'talk') {
        P.head.rotation.y = Math.sin(now * 0.002 + a.order) * 0.25;
        const s = Math.sin(now * 0.004);
        P.aL.rotation.x = -0.5 + s * 0.12;
        P.aR.rotation.x = -0.5 - s * 0.12;
      } else if (a.mode === 'work') {
        P.aL.rotation.x = -0.85;
        P.aR.rotation.x = -0.85 + Math.sin(now * 0.02 + a.order) * 0.12;
        P.head.rotation.x = 0.18 + Math.sin(now * 0.0015) * 0.04;
        P.head.rotation.y = 0;
      } else if (a.mode === 'mushola') {
        // Duduk bersila di sajadah, statis tanpa siklus.
        const ease = Math.min(1, dt * 3);
        P.g.rotation.x += (0.18 - P.g.rotation.x) * ease;
        P.lL.rotation.x += (-1.55 - P.lL.rotation.x) * ease;
        P.lR.rotation.x = P.lL.rotation.x;
        P.aL.rotation.x += (-0.9 - P.aL.rotation.x) * ease;
        P.aR.rotation.x += (-0.9 - P.aR.rotation.x) * ease;
        P.head.position.y += (1.22 - 0.12 - P.head.position.y) * ease;
        P.head.rotation.y = 0;
      } else {
        P.aL.rotation.x *= 0.9;
        P.aR.rotation.x *= 0.9;
        P.head.rotation.y = 0;
        P.g.rotation.x *= 0.85;
      }
      return;
    }

    if (a._y === undefined) a._y = P.g.position.y;
    const goal = a.path[a.wi];
    if (!goal) return;

    this.door.requestDoorIfPassing(goal, P.g.position);

    const dx = goal.x - P.g.position.x;
    const dz = goal.z - P.g.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.15 && Math.abs(goal.y - a._y) < 0.3) {
      a._y = goal.y;
      P.g.position.y = goal.y;

      if (a.orderStopIndex === a.wi && !a.hasOrderedCoffee) {
        P.g.rotation.y = Math.PI;
        P.head.rotation.y = Math.sin(now * 0.004 + a.order) * 0.12;
        P.aL.rotation.x = -0.72 + Math.sin(now * 0.006) * 0.1;
        P.aR.rotation.x = -1.05 + Math.sin(now * 0.007) * 0.12;
        P.lL.rotation.x = P.lR.rotation.x = 0;

        if (!a.orderUntil) {
          a.orderUntil = this.ctx.simMs + this.paths.randomRange(1800, 3200);
          a.orderTaskBefore = a.task;
          const modelLabel = a.model ? `${a.model}` : 'Pi CLI';
          a.task = `Loading ${modelLabel}…`;
          this.feed.feed('move', 'Barista Counter', `${a.name} berhenti sebentar.`);
          this.feed.say(a, modelLabel);
          if (this.ctx.onToast) this.ctx.onToast(`☕ ${a.name} — ${modelLabel}`);
        }

        if (this.ctx.simMs < a.orderUntil) {
          return;
        }

        a.hasOrderedCoffee = true;
        a.orderUntil = null;
        if (a.task.startsWith('Loading ')) {
          a.task = a.orderTaskBefore || 'Menuju seat';
        }
        a.orderTaskBefore = null;
        this.feed.feed('move', 'Barista Counter', `${a.name} siap lanjut ke seat.`);
        if (this.ctx.onToast) this.ctx.onToast(`🥤 ${a.name} lanjut ke seat`);
      }

      a.wi++;
      if (a.wi >= a.path.length) {
        a.path = [];
        const nextMode = a.after || (a.status === 'working' ? 'work' : 'idle');
        a.after = null;

        if (nextMode === 'break_out') {
          this.feed.feed('move', 'ORCA24 Hub', `${a.name} sudah keluar pintu.`);
          this.sync.removeAgent(a);
          return;
        }

        a.mode = nextMode;
        a.prog = nextMode === 'work' ? Math.max(a.prog || 0, 65) : 0;

        if (nextMode === 'mushola') {
          // Sampai di saf: menghadap dinding belakang (kiblat) dan jangan ditarik
          // kembali ke kursi — dia memang sedang tidak di kursinya.
          P.g.rotation.y = Math.PI;
          a.task = 'Duduk di mushola';
        } else {
          const S = this.ctx.seats[a.id];
          if (S) {
            P.g.position.copy(S.seat);
            a._y = S.y;
            P.g.rotation.y = S.rot + Math.PI;
          }
        }
        P.lL.rotation.x = P.lR.rotation.x = 0;
      }
      return;
    }

    const sp = a.speed * (this.ctx.speed > 1 ? 1.35 : 1);
    const st = Math.min(dist, sp * dt);
    if (dist > 1e-4) {
      P.g.position.x += (dx / dist) * st;
      P.g.position.z += (dz / dist) * st;
      P.g.rotation.y = Math.atan2(dx, dz);
    }
    a._y += Math.sign(goal.y - a._y) * Math.min(Math.abs(goal.y - a._y), sp * dt * 1.1);

    // Turun dari pose shalat begitu dia berjalan lagi.
    P.g.rotation.x *= 0.86;
    // Kepala kembali ke posisi normal (1.22) setelah sujud.
    P.head.position.y += (1.22 - P.head.position.y) * Math.min(1, dt * 2.4);
    a.phase = (a.phase || 0) + dt * 11;
    const sw = Math.sin(a.phase);
    P.lL.rotation.x = sw * 0.65;
    P.lR.rotation.x = -sw * 0.65;
    P.aL.rotation.x = -sw * 0.5;
    P.aR.rotation.x = sw * 0.5;
    P.head.rotation.x = 0;
    P.g.position.y = a._y + Math.abs(Math.cos(a.phase)) * 0.05;
  }

  stepAgents(dt: number) {
    this.ctx.agents.forEach((a) => {
      if (a.talk && this.ctx.simMs > a.talk.until) {
        a.talk = null;
      }
      if (a.present) this.stepPerson(a, dt);
      this.mushola.trackMusholaIdle(a, dt);
    });
  }
}
