// ============================================================
// TasksListComponent — port 1:1 Sidebar/TasksList.tsx
// ============================================================

import { Component, Input, inject } from '@angular/core';
import type { AgentData } from '../../core/models/types';
import { UiStateService } from '../../core/services/ui-state.service';
import { agentDeviceLabel, agentIdentitySearchText } from '../../core/utils/agent-identity';

@Component({
  selector: 'tasks-list',
  standalone: true,
  template: `
    <div>
      @for (a of filtered(); track a.id) {
        <div class="row" [class.sel]="a.id === ui.selectedId()" (click)="ui.selectAgent(a.id, true)">
          <div class="t1">
            <div class="av2">{{ a.av }}</div>
            <div class="n">{{ a.task }}</div>
          </div>
          <div class="tk2">{{ a.name }} · {{ a.role }}{{ deviceSuffix(a) }}</div>
          <div class="pbar"><i [style.width.%]="a.prog"></i></div>
          @for (s of a.subs; track $index) {
            <div class="sub" [class.done]="$index < a.subIdx">
              {{ $index < a.subIdx ? '✅' : '◽' }} {{ s }}
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class TasksListComponent {
  @Input() agents: AgentData[] = [];
  protected ui = inject(UiStateService);

  filtered(): AgentData[] {
    const q = this.ui.query().toLowerCase();
    return this.agents.filter((a) =>
      (a.name + a.task + agentIdentitySearchText(a)).toLowerCase().includes(q),
    );
  }

  deviceSuffix(a: AgentData): string {
    const d = agentDeviceLabel(a);
    return d ? ` · 🏢 ${d}` : '';
  }
}
