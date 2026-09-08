// ============================================================
// ToolsListComponent — port 1:1 Sidebar/ToolsList.tsx
// ============================================================

import { Component, Input, inject } from '@angular/core';
import type { FeedEvent } from '../../core/models/types';
import { UiStateService } from '../../core/services/ui-state.service';

@Component({
  selector: 'tools-list',
  standalone: true,
  template: `
    @if (list().length === 0) {
      <p class="pane-empty">Belum ada tool call — tunggu Pi atau tim bekerja…</p>
    } @else {
      <div>
        @for (e of list(); track $index) {
          <div class="ev">
            <div class="ic">🔧</div>
            <div>
              <div class="tx">
                <b>{{ e.who }}</b> <span class="k-tool">tool</span>
                <br />
                <code>{{ e.code || e.text }}</code>
              </div>
              <div class="mt">#{{ e.n }} · {{ e.t }}</div>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class ToolsListComponent {
  @Input() events: FeedEvent[] = [];
  private ui = inject(UiStateService);

  list(): FeedEvent[] {
    const q = this.ui.query();
    return this.events
      .filter((e) => e.kind === 'tool' && (!q || (e.who + e.text).toLowerCase().includes(q)))
      .slice(0, 40);
  }
}
