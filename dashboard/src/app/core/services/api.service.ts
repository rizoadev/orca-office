// ============================================================
// ApiService — REST calls ke hub (port akses endpoint dari App/Sidebar)
// ============================================================

import { Injectable } from '@angular/core';
import { officeApiUrl } from '../utils/endpoints';
import { BillingSummary, OfficeState } from '../models/types';

interface KillResult {
  ok: boolean;
  session_id: string;
  pid: number | null;
  signal_sent: boolean;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  async getState(): Promise<OfficeState> {
    const res = await fetch(officeApiUrl('/api/state'), { credentials: 'include' });
    if (!res.ok) throw new Error(`getState ${res.status}`);
    return res.json();
  }

  async getBilling(): Promise<BillingSummary> {
    const res = await fetch(officeApiUrl('/api/billing'), { credentials: 'include' });
    if (!res.ok) throw new Error(`getBilling ${res.status}`);
    return res.json();
  }

  async killSession(sessionId: string): Promise<KillResult> {
    const res = await fetch(
      officeApiUrl(`/api/sessions/${encodeURIComponent(sessionId)}/kill`),
      { method: 'POST', credentials: 'include' }
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.ok) {
      throw new Error(body?.error || `kill ${sessionId} → ${res.status}`);
    }
    return body;
  }

  async refreshBillingFeed(): Promise<unknown> {
    const res = await fetch(officeApiUrl('/api/billing/feed/refresh'), {
      method: 'POST',
      credentials: 'include',
    });
    return res.json();
  }

  /** Cek harga Portkey untuk satu (model, provider). */
  async getQuote(model: string, provider: string): Promise<unknown> {
    const params = new URLSearchParams({ model, provider, portkey: '1' });
    const res = await fetch(officeApiUrl(`/api/billing/quote?${params}`), {
      credentials: 'include',
    });
    return res.json();
  }
}