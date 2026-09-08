// ============================================================
// SidebarComponent — port 1:1 components/Sidebar/Sidebar.tsx
// ============================================================

import { Component, inject } from '@angular/core';
import { UiStateService } from '../../core/services/ui-state.service';
import { OfficeStateService } from '../../core/services/office-state.service';
import { FloorStatsComponent } from './floor-stats.component';
import { SelectedCardComponent } from './selected-card.component';
import { SidebarTabsComponent } from './sidebar-tabs.component';
import { TeamListComponent } from '../team/team-list.component';
import { LocationsListComponent } from '../team/locations-list.component';
import { TasksListComponent } from '../team/tasks-list.component';
import { ToolsListComponent } from '../feed/tools-list.component';
import { FeedListComponent } from '../feed/feed-list.component';
import { RealtimeLogsComponent } from '../logs/realtime-logs.component';
import { BillingPanelComponent } from '../billing/billing-panel.component';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    FloorStatsComponent,
    SelectedCardComponent,
    SidebarTabsComponent,
    TeamListComponent,
    LocationsListComponent,
    TasksListComponent,
    ToolsListComponent,
    FeedListComponent,
    RealtimeLogsComponent,
    BillingPanelComponent,
  ],
  template: `
    <aside class="side">
      <div class="side-head">
        <h1>
          ☕ Floor manager
          <span style="font-weight:400;color:#64748b;font-size:.72rem">· live state</span>
        </h1>
        <p>Semua bubble, tool calls, tasks &amp; tagihan token — satu sumber state terintegrasi.</p>

        <floor-stats
          [working]="ui.workingCount()"
          [walking]="ui.walkingCount()"
          [idle]="ui.idleCount()"
          [done]="ui.doneCount()"
        />

        <selected-card [agent]="ui.selectedAgent()" />
      </div>

      <sidebar-tabs />

      <div class="search">
        <input
          placeholder="🔍 cari tim / task / tool / menu…"
          [value]="ui.query()"
          (input)="ui.setQuery($any($event.target).value)"
        />
      </div>

      <div class="pane">
        @switch (ui.tab()) {
          @case ('locations') { <locations-list [agents]="ui.agents()" /> }
          @case ('team') { <team-list [agents]="ui.agents()" /> }
          @case ('tasks') { <tasks-list [agents]="ui.agents()" /> }
          @case ('tools') { <tools-list [events]="ui.events()" /> }
          @case ('feed') { <feed-list [events]="ui.events()" /> }
          @case ('logs') { <realtime-logs [logs]="office.recentLogs()" /> }
          @case ('bill') { <billing-panel [billing]="office.billing()" /> }
        }
      </div>
    </aside>
  `,
})
export class SidebarComponent {
  protected ui = inject(UiStateService);
  protected office = inject(OfficeStateService);
}
