// ============================================================
// BillQuoteComponent — port 1:1 QuoteButton di BillingPanel.tsx
// Model tanpa harga di pricing.json → tawarkan cek tarif ke Portkey.
// ============================================================

import { Component, Input, signal, inject } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { formatPerMillion } from '../../core/utils/coffee-menu';

interface QuoteState {
  busy: boolean;
  text: string | null;
  tone: string;
}

@Component({
  selector: 'bill-quote',
  standalone: true,
  template: `
    <span class="bill-quote">
      <button class="bill-quote-btn" [disabled]="state().busy" (click)="ask()">
        {{ state().busy ? '…' : '🔎 cek harga' }}
      </button>
      @if (state().text) {
        <em class="bill-quote-text" [class]="'bill-quote-text tone-' + state().tone">{{ state().text }}</em>
      }
    </span>
  `,
})
export class BillQuoteComponent {
  @Input() model = '';
  @Input() provider: string | null = null;

  private api = inject(ApiService);
  state = signal<QuoteState>({ busy: false, text: null, tone: 'unknown' });

  async ask(): Promise<void> {
    this.state.set({ busy: true, text: 'menanya Portkey…', tone: 'unknown' });
    try {
      const data = (await this.api.getQuote(this.model, this.provider || '')) as {
        portkey?: {
          ok?: boolean;
          rates?: { input: number; output: number };
          error?: string;
        };
      };
      const quote = data?.portkey;
      if (quote?.ok && quote.rates) {
        this.state.set({
          busy: false,
          tone: 'paid',
          text: `Portkey: ${formatPerMillion(quote.rates.input)} in / ${formatPerMillion(
            quote.rates.output,
          )} out per 1M — salin ke pricing.json`,
        });
      } else {
        this.state.set({ busy: false, tone: 'unknown', text: quote?.error || 'tidak ketemu' });
      }
    } catch {
      this.state.set({ busy: false, tone: 'unknown', text: 'server hub tidak menjawab' });
    }
  }
}
