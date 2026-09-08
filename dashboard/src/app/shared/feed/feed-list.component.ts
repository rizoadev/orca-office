// ============================================================
// FeedListComponent — port 1:1 Sidebar/FeedList.tsx
// ============================================================

import { Component, Input, inject } from '@angular/core';
import type { FeedEvent } from '../../core/models/types';
import { UiStateService } from '../../core/services/ui-state.service';

const ICONS: Record<string, string> = {
  task: '✅',
  tool: '🔧',
  chat: '💬',
  move: '🚶',
  sys: '☕',
};

@Component({
  selector: 'feed-list',
  standalone: true,
  template: `
    @if (list().length === 0) {
      <p class="pane-empty">Feed kosong.</p>
    } @else {
      <div>
        @for (e of list(); track $index) {
          <div class="ev">
            <div class="ic">{{ icon(e) }}</div>
            <div>
              <div class="tx">
                <b>{{ e.who }}</b> <span [class]="'k-' + e.kind">{{ e.kind }}</span> — {{ e.text }}
                @if (e.code) {
                  <br />
                  <code>{{ e.code }}</code>
                }
              </div>
              <div class="mt">#{{ e.n }} · {{ e.t }}</div>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class FeedListComponent {
  @Input() events: FeedEvent[] = [];
  private ui = inject(UiStateService);

  list(): FeedEvent[] {
    const kind = this.ui.feedKind();
    const q = this.ui.query();
    return this.events
      .filter(
        (e) =>
          (kind === 'all' || e.kind === kind) &&
          (!q || (e.who + e.text).toLowerCase().includes(q)),
      )
      .slice(0, 60);
  }

  icon(e: FeedEvent): string {
    return ICONS[e.kind] ?? '•';
  }
}
