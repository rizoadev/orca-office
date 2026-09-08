// ============================================================
// AccessGateComponent — port 1:1 components/AccessGate.tsx
//
// Inline unlock prompt, sengaja bukan redirect: dashboard hidup di dalam
// webview Orca yang men-set ulang src-nya sendiri, jadi navigasi otomatis
// = kedip tanpa akhir. Gaya dari global styles.css (.access-gate).
// ============================================================

import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-access-gate',
  standalone: true,
  template: `
    <div class="access-gate">
      <form (submit)="submit($event)">
        <h1>☕ ORCA24 Coworking</h1>
        <p class="sub">
          Kantor ini menampung sesi dari beberapa mesin, jadi isinya terkunci. Tempel
          <code> OFFICE_TOKEN </code> hub.
        </p>
        @if (error) {
          <p class="err">{{ error }}</p>
        }
        <input
          type="password"
          [value]="token"
          (input)="token = $any($event.target).value"
          placeholder="OFFICE_TOKEN"
          autofocus
          autocomplete="off"
          [attr.spellcheck]="false"
        />
        <button type="submit" [disabled]="busy || !token.trim()">
          {{ busy ? 'Memeriksa…' : 'Masuk' }}
        </button>
      </form>
    </div>
  `,
})
export class AccessGateComponent {
  private auth = inject(AuthService);

  token = '';
  busy = false;
  error: string | null = null;

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.token.trim() || this.busy) return;
    this.busy = true;
    this.error = null;
    const ok = await this.auth.submitToken(this.token.trim());
    if (!ok) this.error = 'Token tidak cocok dengan hub ini.';
    this.busy = false;
  }
}
