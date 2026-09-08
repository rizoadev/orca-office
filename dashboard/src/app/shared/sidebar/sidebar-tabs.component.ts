// ============================================================
// SidebarTabsComponent — port 1:1 Sidebar/SidebarTabs.tsx
// 7 tab + chip filter khusus Feed.
// ============================================================

import { Component, inject } from '@angular/core';
import { UiStateService } from '../../core/services/ui-state.service';

@Component({
  selector: 'sidebar-tabs',
  standalone: true,
  template: `
    <div class="tabs">
      <button [class.active]="ui.tab() === 'team'" (click)="ui.setTab('team')">Team</button>
      <button
        [class.active]="ui.tab() === 'locations'"
        (click)="ui.setTab('locations')"
        title="Group agent by device / laptop"
      >
        📍 Locs
      </button>
      <button [class.active]="ui.tab() === 'tasks'" (click)="ui.setTab('tasks')">Tasks</button>
      <button [class.active]="ui.tab() === 'tools'" (click)="ui.setTab('tools')">Tools</button>
      <button [class.active]="ui.tab() === 'feed'" (click)="ui.setTab('feed')">Feed</button>
      <button [class.active]="ui.tab() === 'logs'" (click)="ui.setTab('logs')">Logs</button>
      <button
        [class.active]="ui.tab() === 'bill'"
        (click)="ui.setTab('bill')"
        title="Tagihan token & biaya per pegawai"
      >
        ☕ Bill
      </button>
    </div>

    @if (ui.tab() === 'feed') {
      <div class="chips">
        @for (k of feedKinds; track k) {
          <button class="chip" [class.active]="ui.feedKind() === k" (click)="ui.setFeedKind(k)">
            {{ k === 'all' ? 'All' : k.toUpperCase() }}
          </button>
        }
      </div>
    }
  `,
})
export class SidebarTabsComponent {
  protected ui = inject(UiStateService);
  protected readonly feedKinds = ['all', 'task', 'tool', 'chat', 'move'] as const;
}
