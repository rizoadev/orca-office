// ============================================================
// LocationsListComponent — port 1:1 Sidebar/LocationsList.tsx
// Roster di-group per device (machineId/machineName → orcaName → unknown).
// ============================================================

import { Component, Input, inject } from '@angular/core';
import type { AgentData } from '../../core/models/types';
import { UiStateService } from '../../core/services/ui-state.service';

interface MachineGroup {
  key: string;
  label: string;
  agents: AgentData[];
  idle: number;
}

const STATUS_TXT: Record<string, [string, string]> = {
  work: ['Working', '#38bdf8'],
  talk: ['Coordinating', '#fbbf24'],
  to: ['Walking', '#c084fc'],
  back: ['Returning', '#c084fc'],
  leaving: ['Leaving', '#f97316'],
  break_play: ['Playground', '#4ade80'],
  break_out: ['Walked out', '#f87171'],
  idle: ['Idle', '#94a3b8'],
};

const trim = (value?: string | null): string => value?.trim() ?? '';

/** Grouping key — device dulu, lalu Orca window sebagai fallback kalau identitas mesin absen. */
function machineGroupKey(agent: AgentData): string {
  const machine = trim(agent.machineId) || trim(agent.machineName);
  if (machine) return `machine:${machine.toLowerCase()}`;
  const orca = trim(agent.orcaName);
  return orca ? `orca:${orca.toLowerCase()}` : '__unknown__';
}

/** Label harus konsisten dengan key: jangan campur orcaName, atau satu device bisa dapat judul milik agent acak. */
function machineGroupLabel(agent: AgentData): string {
  const name = trim(agent.machineName);
  if (name) return name;
  const id = trim(agent.machineId);
  if (id) return id.slice(0, 16);
  const orca = trim(agent.orcaName);
  if (orca) return orca;
  return 'Unknown Device';
}

const isActive = (a: AgentData): boolean => a.mode !== 'leaving' && a.mode !== 'break_out';

@Component({
  selector: 'locations-list',
  standalone: true,
  template: `
    @if (filtered().length === 0) {
      <p class="pane-empty">Tidak ketemu.</p>
    } @else {
      <div>
        <div class="loc-summary">
          <span>{{ filtered().length }} device{{ filtered().length !== 1 ? 's' : '' }}</span>
          <span>{{ totalAgents() }} agent{{ totalAgents() !== 1 ? 's' : '' }}</span>
        </div>

        @for (group of filtered(); track group.key) {
          <div class="loc-group">
            <div class="loc-head">
              <span class="ico">💻</span>
              <div class="grow">
                <div class="loc-label">{{ group.label }}</div>
                <div class="loc-sub">
                  @if (activeOf(group) > 0) {
                    <span class="active">{{ activeOf(group) }} active</span>
                    @if (group.idle > 0) {
                      , <span class="idle">{{ group.idle }} idle</span>
                    }
                  } @else {
                    <span style="color:#64748b">all offline</span>
                  }
                  <span> · {{ group.agents.length }} agent{{ group.agents.length !== 1 ? 's' : '' }}</span>
                </div>
              </div>
            </div>

            @for (a of group.agents; track a.id) {
              <div
                class="loc-agent"
                [class.sel]="a.id === ui.selectedId()"
                (click)="ui.selectAgent(a.id, true)"
              >
                <span class="av">{{ a.av }}</span>
                <div class="body">
                  <div class="loc-agent-name">
                    {{ a.name }}
                    @if (a.project) { <span class="loc-proj">{{ a.project }}</span> }
                  </div>
                  <div class="loc-status" [style.color]="statusColor(a)">
                    {{ statusText(a) }} — {{ a.task }}
                  </div>
                </div>
                @if (a.realSessionId) {
                  <span class="loc-sid">#{{ a.realSessionId.slice(0, 6) }}</span>
                }
              </div>
            }
          </div>
        }
      </div>
    }
  `,
})
export class LocationsListComponent {
  @Input() agents: AgentData[] = [];
  protected ui = inject(UiStateService);

  /** Grup per device, urut: paling banyak agent aktif dulu lalu alfabet. */
  private groups(): MachineGroup[] {
    const map = new Map<string, MachineGroup>();
    for (const a of this.agents) {
      const key = machineGroupKey(a);
      let group = map.get(key);
      if (!group) {
        group = { key, label: machineGroupLabel(a), agents: [], idle: 0 };
        map.set(key, group);
      }
      group.agents.push(a);
      if (a.mode === 'idle' || a.mode === 'break_play' || a.mode === 'break_out') group.idle++;
    }
    return [...map.values()].sort((x, y) => {
      const aActive = x.agents.filter(isActive).length;
      const bActive = y.agents.filter(isActive).length;
      if (bActive !== aActive) return bActive - aActive;
      return x.label.localeCompare(y.label);
    });
  }

  filtered(): MachineGroup[] {
    const groups = this.groups();
    const q = this.ui.query();
    if (!q) return groups;
    const lq = q.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        agents: g.agents.filter((a) =>
          (a.name + a.task + a.role + g.label).toLowerCase().includes(lq),
        ),
      }))
      .filter((g) => g.agents.length > 0);
  }

  totalAgents(): number {
    return this.filtered().reduce((s, g) => s + g.agents.length, 0);
  }

  activeOf(group: MachineGroup): number {
    return group.agents.filter(isActive).length;
  }

  statusText(a: AgentData): string {
    return (STATUS_TXT[a.mode] ?? STATUS_TXT['work'])[0];
  }
  statusColor(a: AgentData): string {
    return (STATUS_TXT[a.mode] ?? STATUS_TXT['work'])[1];
  }
}
