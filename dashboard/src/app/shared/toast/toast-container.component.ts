// ============================================================
// ToastContainerComponent — port 1:1 Toast/ToastContainer.tsx
// Gaya diambil dari global styles.css (#toasts, .toast).
// ============================================================

import { Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  template: `
    <div id="toasts">
      @for (t of toasts.toasts(); track t.id) {
        <div class="toast">{{ t.text }}</div>
      }
    </div>
  `,
})
export class ToastContainerComponent {
  protected toasts = inject(ToastService);
}
