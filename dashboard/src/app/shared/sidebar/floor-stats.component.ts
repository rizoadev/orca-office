// ============================================================
// FloorStatsComponent — port 1:1 Sidebar/FloorStats.tsx
// ============================================================

import { Component, Input } from '@angular/core';

@Component({
  selector: 'floor-stats',
  standalone: true,
  template: `
    <div class="stats">
      <div class="stat"><b style="color:#38bdf8">{{ working }}</b><span>working</span></div>
      <div class="stat"><b style="color:#c084fc">{{ walking }}</b><span>walking</span></div>
      <div class="stat"><b style="color:#fbbf24">{{ idle }}</b><span>idle/break</span></div>
      <div class="stat"><b style="color:#4ade80">{{ done }}</b><span>tasks done</span></div>
    </div>
  `,
})
export class FloorStatsComponent {
  @Input() working = 0;
  @Input() walking = 0;
  @Input() idle = 0;
  @Input() done = 0;
}
