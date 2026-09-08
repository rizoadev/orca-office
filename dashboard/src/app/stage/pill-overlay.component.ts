// ============================================================
// PillOverlay — port 1:1 dari React components/Stage/PillOverlay.tsx
//
// Engine 3D mencari elemen lewat document.getElementById(`pill-${a.id}`)
// lalu menulis style.display/left/top langsung tiap frame (updateFloatingPills).
// Karena itu display awal di-set lewat atribut statis, BUKAN binding Angular —
// supaya change detection tidak menimpa nilai yang dihitung engine.
// ============================================================

import { Component, Input, output } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import type { AgentData, LlmStreamState } from '../core/models/types';
import { agentDeviceLabel, agentWorkspaceLabel } from '../core/utils/agent-identity';

@Component({
  selector: 'pill-overlay',
  standalone: true,
  imports: [NgFor],
  template: `
    <div id="overlay" [style.display]="labelsOn ? 'block' : 'none'">
      <div
        *ngFor="let a of agents"
        [id]="'pill-' + a.id"
        class="pill"
        style="display:none"
        (click)="selectAgent.emit({ id: a.id, fly: true })"
      >
        <div class="card">
          <div class="r1">
            <span [class]="dotClass(a)"></span>
            <span class="nm">{{ a.name }}</span>
            @if (a.realSessionId) {
              <span class="sid-tag" [title]="sidTitle(a)">#{{ sidShort(a) }}</span>
            }
          </div>

          @if (a.project) {
            <div class="prj" [title]="'Project git: ' + a.project">
              <span class="pico">📁</span><span class="pname">{{ a.project }}</span>
            </div>
          }
          @if (deviceLabel(a)) {
            <div class="prj" [title]="machineTitle(a)">
              <span class="pico">🏢</span><span class="pname">{{ deviceLabel(a) }}</span>
            </div>
          }
          @if (workspaceLabel(a)) {
            <div class="prj" [title]="paneTitle(a)">
              <span class="pico">🐋</span><span class="pname">{{ workspaceLabel(a) }}</span>
            </div>
          }

          @if (isMushola(a)) {
            <div class="st" [style.color]="statusColor(a)">🕌 Duduk di mushola</div>
          } @else {
            <div class="st" [style.color]="statusColor(a)">
              {{ statusText(a) }} · {{ a.isRealPi ? 'Live Pi CLI' : 'floor 1' }}
            </div>
            <div class="tk">☕ {{ coffeeLine(a) }}</div>
          }
        </div>

        <div class="stem"></div>

        @if (a.talk) {
          <div class="talk">💬 {{ a.talk.text }}</div>
        }
      </div>
    </div>
  `,
})
export class PillOverlayComponent {
  @Input() agents: AgentData[] = [];
  @Input() labelsOn = true;
  selectAgent = output<{ id: string; fly: boolean }>();

  /** [label, dot-class, warna] — sama persis dengan STATUS_TXT di React. */
  private static readonly STATUS: Record<string, [string, string, string]> = {
    work: ['Working', 'd-work', '#38bdf8'],
    talk: ['Coordinating', 'd-talk', '#fbbf24'],
    to: ['Walking', 'd-walk', '#c084fc'],
    back: ['Returning', 'd-walk', '#c084fc'],
    leaving: ['Leaving', 'd-walk', '#f97316'],
    break_play: ['Playground', 'd-break', '#4ade80'],
    break_out: ['Walked out', 'd-out', '#f87171'],
    idle: ['Idle', 'd-idle', '#94a3b8'],
  };

  private static readonly MUSHOLA: [string, string, string] = ['Saf', 'd-idle', '#a5b4fc'];

  isMushola(a: AgentData): boolean {
    return a.mode === 'mushola';
  }

  private triple(a: AgentData): [string, string, string] {
    return this.isMushola(a)
      ? PillOverlayComponent.MUSHOLA
      : PillOverlayComponent.STATUS[a.mode] ?? PillOverlayComponent.STATUS['work'];
  }

  statusText(a: AgentData): string {
    return this.triple(a)[0];
  }
  dotClass(a: AgentData): string {
    return `dot ${this.triple(a)[1]}`;
  }
  statusColor(a: AgentData): string {
    return this.triple(a)[2];
  }

  deviceLabel(a: AgentData): string | null {
    return agentDeviceLabel(a);
  }
  workspaceLabel(a: AgentData): string | null {
    return agentWorkspaceLabel(a);
  }

  sidTitle(a: AgentData): string {
    return `Real Pi Session: ${a.realSessionId ?? ''}`;
  }
  sidShort(a: AgentData): string {
    return (a.realSessionId ?? '').slice(0, 8);
  }
  machineTitle(a: AgentData): string {
    return a.machineId ? `Machine ID: ${a.machineId}` : 'Device';
  }
  paneTitle(a: AgentData): string {
    return a.orcaPane ? `Orca pane: ${a.orcaPane}` : 'Orca workspace';
  }

  /** Baris "☕ …" di bubble — meniru stream LLM real kalau ada. */
  coffeeLine(a: AgentData): string {
    const stream: LlmStreamState | undefined = a.llmStream;

    if (stream?.text) {
      if (stream.kind === 'response') return `Response: ${stream.text}`;
      if (stream.kind === 'thinking') return `Thinking: ${stream.text}`;
      if (stream.kind === 'tool') return `Tool: ${stream.text}`;
      return stream.text;
    }

    return `Prompt: ${a.task || 'Belum ada prompt aktif'}`;
  }
}
