// ============================================================
// SelectedCardComponent — port 1:1 Sidebar/SelectedCard.tsx
// ============================================================

import { Component, Input } from '@angular/core';
import type { AgentData } from '../../core/models/types';
import { agentDeviceLabel, agentWorkspaceLabel } from '../../core/utils/agent-identity';

@Component({
  selector: 'selected-card',
  standalone: true,
  template: `
    @if (!agent) {
      <div class="selcard">
        <div class="av">☕</div>
        <div>
          <div class="nm">ORCA24</div>
          <div class="rl">Klik bubble / nama di list untuk fokus kamera.</div>
        </div>
      </div>
    } @else {
      <div class="selcard">
        <div class="av">{{ agent.av }}</div>
        <div>
          <div class="nm">
            <span>{{ agent.name }}</span>
            @if (agent.realSessionId) {
              <span class="sid" [title]="agent.realSessionId">#{{ sidShort() }}</span>
            }
          </div>
          <div class="rl">{{ agent.role }} · {{ agent.mode }} · {{ agent.task }}</div>
          @if (agent.project) {
            <div class="rl mono-wood" [title]="'Project git: ' + agent.project">📁 {{ agent.project }}</div>
          }
          @if (deviceLabel()) {
            <div class="rl mono-cyan" [title]="machineTitle()">🏢 {{ deviceLabel() }}</div>
          }
          @if (workspaceLabel()) {
            <div class="rl mono-indigo" [title]="paneTitle()">🐋 {{ workspaceLabel() }}</div>
          }
        </div>
      </div>
    }
  `,
})
export class SelectedCardComponent {
  @Input() agent?: AgentData;

  sidShort(): string {
    return (this.agent?.realSessionId ?? '').slice(0, 8);
  }
  deviceLabel(): string | null {
    return this.agent ? agentDeviceLabel(this.agent) : null;
  }
  workspaceLabel(): string | null {
    return this.agent ? agentWorkspaceLabel(this.agent) : null;
  }
  machineTitle(): string {
    return this.agent?.machineId ? `Machine ID: ${this.agent.machineId}` : 'Device';
  }
  paneTitle(): string {
    return this.agent?.orcaPane ? `Orca pane: ${this.agent.orcaPane}` : 'Orca workspace';
  }
}
