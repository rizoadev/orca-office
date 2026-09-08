// ============================================================
// MainLayoutComponent — padanan <div className="layout"> di App.tsx
// Grid stage + sidebar. Tata letak murni dari global styles.css.
// ============================================================

import { Component } from '@angular/core';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  template: `
    <div class="layout">
      <ng-content select="[stage]" />
      <ng-content select="[sidebar]" />
    </div>
  `,
})
export class MainLayoutComponent {}
