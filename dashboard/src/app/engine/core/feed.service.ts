// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from './engine-context';
import type { AgentData, FeedEvent } from '../../core/models/types';

@Injectable()
export class FeedService {
  private readonly ctx = inject(EngineContext);

  evN = 0;

  events: FeedEvent[] = [];

  feed(kind: any, who: string, text: string, code?: string) {
    this.evN++;
    const now = new Date();
    const t = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    this.events.unshift({ n: this.evN, kind, who, text, code, t });
    if (this.events.length > 90) this.events.pop();

    if (this.ctx.onLiveMessage) this.ctx.onLiveMessage(`${who}: ${text}`);
    if (this.ctx.onStateChange) this.ctx.onStateChange();
  }

  say(a: AgentData, text: string) {
    a.talk = { text, until: this.ctx.simMs + 9000 };
    this.feed('chat', a.name, `“${text}”`);
    if (this.ctx.onStateChange) this.ctx.onStateChange();
  }
}
