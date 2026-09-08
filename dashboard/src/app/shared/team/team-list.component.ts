// ============================================================
// TeamListComponent — port 1:1 Sidebar/TeamList.tsx
// ============================================================

import { Component, Input, inject } from '@angular/core';
import type { AgentData } from '../../core/models/types';
import { UiStateService } from '../../core/services/ui-state.service';
import {
  agentDeviceLabel,
  agentIdentitySearchText,
  agentWorkspaceLabel,
} from '../../core/utils/agent-identity';

type StatusTriple = [string, string, string];

const STATUS_TXT: Record<string, StatusTriple> = {
  work: ['Working', 'd-work', '#38bdf8'],
  talk: ['Coordinating', 'd-talk', '#fbbf24'],
  to: ['Walking', 'd-walk', '#c084fc'],
  back: ['Returning', 'd-walk', '#c084fc'],
  leaving: ['Leaving', 'd-walk', '#f97316'],
  break_play: ['Playground', 'd-break', '#4ade80'],
  break_out: ['Walked out', 'd-out', '#f87171'],
  idle: ['Idle', 'd-idle', '#94a3b8'],
};

@Component({
  selector: 'team-list',
  standalone: true,
  template: `
    @if (filtered().length === 0) {
      <p class="pane-empty">Tidak ketemu.</p>
    } @else {
      <div>
        @for (a of filtered(); track a.id) {
          <div class="row" [class.sel]="a.id === ui.selectedId()" (click)="ui.selectAgent(a.id, true)">
            <div class="t1">
              <div class="av2">{{ a.av }}</div>
              <div class="n">
                {{ a.name }}
                @if (a.realSessionId) {
                  <span class="sid" [title]="'Full Session ID: ' + a.realSessionId">#{{ sid(a) }}</span>
                }
              </div>
              @if (a.isRealPi) {
                <span class="fl" style="border-color:#4ade80;color:#86efac">PI DEV</span>
              } @else {
                <span class="fl">1F</span>
              }
              <button
                class="kill-agent-btn"
                [disabled]="a.mode === 'leaving' || a.mode === 'break_out'"
                [title]="a.realSessionId ? 'Kill proses Pi CLI agent ini' : 'Keluarkan agent simulasi dari kantor'"
                (click)="onKill($event, a)"
              >
                🛑 Kill
              </button>
            </div>

            <div class="tk2">
              <span [class]="'dot ' + dotClass(a)" style="display:inline-block"></span>
              <b [style.color]="color(a)">{{ text(a) }}</b> — {{ a.task }}
            </div>

            <div class="pbar"><i [style.width.%]="a.prog"></i></div>

            @if (deviceLabel(a) || workspaceLabel(a)) {
              <div class="meta">
                @if (deviceLabel(a)) {
                  <span [title]="machineTitle(a)">🏢 {{ deviceLabel(a) }}</span>
                }
                @if (deviceLabel(a) && workspaceLabel(a)) { <span>·</span> }
                @if (workspaceLabel(a)) {
                  <span [title]="paneTitle(a)">🐋 {{ workspaceLabel(a) }}</span>
                }
              </div>
            }

            <div class="meta">
              <span>idle {{ idleSec(a) }}s</span>
              <span>·</span>
              <span>🔧 {{ a.toolsDone }}</span>
              <span>·</span>
              <span>✅ {{ a.done }}</span>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class TeamListComponent {
  @Input() agents: AgentData[] = [];
  protected ui = inject(UiStateService);

  filtered(): AgentData[] {
    const q = this.ui.query().toLowerCase();
    return this.agents.filter((a) =>
      (a.name + a.task + a.role + agentIdentitySearchText(a)).toLowerCase().includes(q),
    );
  }

  onKill(event: MouseEvent, a: AgentData): void {
    event.stopPropagation();
    void this.ui.killAgent(a);
  }

  private triple(a: AgentData): StatusTriple {
    return STATUS_TXT[a.mode] ?? STATUS_TXT['work'];
  }
  text(a: AgentData): string { return this.triple(a)[0]; }
  dotClass(a: AgentData): string { return this.triple(a)[1]; }
  color(a: AgentData): string { return this.triple(a)[2]; }
  sid(a: AgentData): string { return (a.realSessionId ?? '').slice(0, 8); }
  idleSec(a: AgentData): number { return Math.floor(a.idle / 1000); }
  deviceLabel(a: AgentData): string | null { return agentDeviceLabel(a); }
  workspaceLabel(a: AgentData): string | null { return agentWorkspaceLabel(a); }
  machineTitle(a: AgentData): string { return a.machineId ? `Machine ID: ${a.machineId}` : 'Device'; }
  paneTitle(a: AgentData): string { return a.orcaPane ? `Orca pane: ${a.orcaPane}` : 'Orca workspace'; }
}
