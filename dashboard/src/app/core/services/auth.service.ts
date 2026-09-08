// ============================================================
// AuthService — token gate + quick-login ?auth=/?token= (port useOfficeSocket auth)
// ============================================================

import { Injectable, signal } from '@angular/core';
import { isLoopbackHub, officeApiUrl } from '../utils/endpoints';
import { OfficeState } from '../models/types';
import { OfficeStateService } from './office-state.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  token = signal<string | null>(null);
  unauthorized = signal(false);
  busy = signal(false);

  private lockedRef = false;

  constructor(private stateService: OfficeStateService) {}

  /** Proses auto-login ?auth=/?token= lalu bersihkan URL. Dipanggil sekali di bootstrap. */
  handleQuickLoginQuery(): void {
    const params = new URLSearchParams(window.location.search);
    const quick = params.get('auth') ?? params.get('token');
    if (!quick) return;
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState(null, '', cleanUrl);
    void this.submitToken(quick.trim());
  }

  /**
   * Probe awal: fetch /api/state. 401 + non-loopback = terkunci → unauthorized(true).
   * Mengembalikan false kalau hub masih belum siap / terkunci.
   */
  async authorizeViaProbe(): Promise<boolean> {
    try {
      const res = await fetch(officeApiUrl('/api/state'), { credentials: 'include' });
      const locked = res.status === 401 && !isLoopbackHub();
      this.lockedRef = locked;
      this.unauthorized.set(locked);
      if (res.ok) {
        const data: OfficeState = await res.json();
        this.stateService.setState(data);
      }
      return !locked;
    } catch {
      return !this.lockedRef;
    }
  }

  /** Submit token → POST /gateway (302 manual) → probe ulang. */
  async submitToken(token: string): Promise<boolean> {
    this.busy.set(true);
    this.token.set(token);
    try {
      await fetch(officeApiUrl('/gateway'), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
        credentials: 'include',
        redirect: 'manual',
      });
    } catch {
      // Offline hub — probe di bawah yang memutuskan.
    }
    const authorized = await this.authorizeViaProbe();
    this.busy.set(false);
    return authorized;
  }
}