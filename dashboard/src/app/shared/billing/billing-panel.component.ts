// ============================================================
// BillingPanelComponent — port 1:1 Sidebar/BillingPanel.tsx
// Tagihan token ditampilkan sebagai menu kedai kopi.
// ============================================================

import { Component, Input, signal, inject } from '@angular/core';
import type { BillLine, BillingSummary, CostSource, MenuRow } from '../../core/models/types';
import { UiStateService } from '../../core/services/ui-state.service';
import {
  assignDrinks,
  drinkForModel,
  formatPerMillion,
  formatPerToken,
  formatTokens,
  formatUsd,
  priceBadge,
} from '../../core/utils/coffee-menu';
import { BillQuoteComponent } from './bill-quote.component';

const MENU_TOP_N = 6;

type RankedRow = MenuRow & { drink: string };

@Component({
  selector: 'billing-panel',
  standalone: true,
  imports: [BillQuoteComponent],
  template: `
    @if (!billing || billing.users.length === 0) {
      <p class="bill-empty">
        Belum ada tagihan. Setiap panggilan LLM dari sesi Pi yang aktif akan tercatat di sini —
        papan menu 3D ikut berubah mengikuti kopi yang benar-benar diseduh.
      </p>
    } @else {
      <div class="bill">
        <!-- TOTAL -->
        <div class="bill-total">
          <div>
            <span class="bill-total-label">TOTAL BILL · SEMUA TAMU</span>
            <div class="bill-total-value">{{ formatUsd(billing.totals.cost) }}</div>
          </div>
          <div class="bill-total-meta">
            <span>{{ formatTokens(billing.totals.totalTokens) }} token</span>
            <span>{{ billing.totals.turns }} seduh</span>
            <span>{{ billing.totals.users }} tamu</span>
            <span>{{ billing.totals.models }} menu</span>
          </div>
        </div>

        <!-- MENU TERLARIS -->
        <div class="bill-section">
          <div class="bill-section-head">
            <b>☕ Menu terlaris</b>
            <span>paling sering diseduh · harga per 1M token</span>
          </div>

          @for (row of menu(); track row.model) {
            <div class="bill-menu-row">
              <span class="bill-rank" [class.hot]="rankOf(row) <= 3">#{{ rankOf(row) }}</span>
              <span class="bill-drink">{{ row.drink }}</span>
              <span class="bill-menu-model" [title]="row.model">{{ row.model }}</span>
              <span [class]="'bill-tag tone-' + badge(row.costSource, row.cost).tone">
                {{ badge(row.costSource, row.cost).label }}
              </span>
              <span class="bill-menu-price">
                {{ row.costSource === 'none' ? '?' : formatPerMillion(row.ratePerMillion) + '/1M' }}
              </span>
              <span class="bill-menu-perm">
                {{ row.turns }} seduh · {{ formatTokens(row.totalTokens) }} tok ·
                {{ formatPerToken(row.ratePerToken) }}/tok · {{ row.drinkerCount }} peminum
              </span>
            </div>
          }

          @if (!ui.query() && ranked().length > MENU_TOP_N) {
            <button class="bill-more" (click)="toggleMenu()">
              {{ showAllMenu() ? '↑ tutup menu' : '↓ ' + (ranked().length - MENU_TOP_N) + ' menu lainnya' }}
            </button>
          }
        </div>

        <!-- TAGIHAN PER TAMU -->
        <div class="bill-section">
          <div class="bill-section-head">
            <b>🧾 Tagihan per tamu</b>
            <span>klik untuk fokus kamera</span>
          </div>

          @for (user of users(); track user.sessionId) {
            <div class="bill-user" (click)="ui.selectAgentBySession(user.sessionId)">
              <div class="bill-user-head">
                <span class="bill-user-av">{{ user.avatar }}</span>
                <span class="bill-user-name">{{ user.name }}</span>
                @if (user.isSubagent) { <span class="bill-sub">sub</span> }
                <span class="bill-money">{{ formatUsd(user.cost) }}</span>
              </div>
              <div class="bill-user-meta">
                <span>{{ formatTokens(user.totalTokens) }} tok</span>
                <span>·</span>
                <span>{{ formatPerToken(user.ratePerToken) }}/token</span>
                <span>·</span>
                <span>{{ user.turns }} seduh</span>
              </div>

              @for (line of user.lines; track line.model) {
                <div class="bill-line">
                  <div class="bill-line-top">
                    <span class="bill-drink">{{ drinkOf(line.model) }}</span>
                    <span class="bill-money">{{ formatUsd(line.cost) }}</span>
                  </div>
                  <div class="bill-model" [title]="providerPrefix(line) + line.model">{{ line.model }}</div>
                  <div class="bill-tokens">
                    <span title="token input">in {{ formatTokens(line.inputTokens) }}</span>
                    <span title="token output">out {{ formatTokens(line.outputTokens) }}</span>
                    <span title="cache read">cache {{ formatTokens(line.cacheReadTokens) }}</span>
                    <span title="total token">{{ formatTokens(line.totalTokens) }} tok</span>
                    <span title="jumlah panggilan LLM">{{ line.turns }} seduh</span>
                  </div>
                  <div class="bill-rate">
                    <b>{{ formatPerToken(line.ratePerToken) }}</b>
                    <span>/ token</span>
                    <span class="bill-rate-mid">·</span>
                    <span>{{ formatPerMillion(line.ratePerMillion) }} / 1M</span>
                    <span [class]="'bill-tag tone-' + badge(line.costSource, line.cost).tone">
                      {{ badge(line.costSource, line.cost).label }}
                    </span>
                  </div>
                  @if (line.costSource === 'none') {
                    <bill-quote [model]="line.model" [provider]="line.provider ?? null" />
                  }
                </div>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class BillingPanelComponent {
  @Input() billing!: BillingSummary;
  protected readonly MENU_TOP_N = MENU_TOP_N;
  protected ui = inject(UiStateService);

  showAllMenu = signal(false);

  toggleMenu(): void {
    this.showAllMenu.update((v) => !v);
  }

  private drinks(): Map<string, string> {
    return assignDrinks((this.billing?.menu || []).map((row) => row.model));
  }

  /** Menu terlaris: model paling sering diseduh, bukan sekadar paling mahal. */
  ranked(): RankedRow[] {
    const drinks = this.drinks();
    return [...(this.billing?.menu || [])]
      .sort(
        (a, b) =>
          b.turns - a.turns || b.totalTokens - a.totalTokens || b.cost - a.cost,
      )
      .map((row) => ({ ...row, drink: drinks.get(row.model) || drinkForModel(row.model) }));
  }

  menu(): RankedRow[] {
    const ranked = this.ranked();
    const q = this.ui.query();
    const visible = this.showAllMenu() ? ranked : ranked.slice(0, MENU_TOP_N);
    if (!q) return visible;
    const lq = q.toLowerCase();
    return ranked.filter((r) => (r.model + r.drink).toLowerCase().includes(lq));
  }

  users(): BillingSummary['users'] {
    const list = this.billing?.users || [];
    const q = this.ui.query();
    if (!q) return list;
    const drinks = this.drinks();
    const lq = q.toLowerCase();
    return list.filter((user) =>
      (user.name + user.lines.map((l) => l.model + (drinks.get(l.model) || '')).join(' '))
        .toLowerCase()
        .includes(lq),
    );
  }

  rankOf(row: RankedRow): number {
    return this.ranked().indexOf(row) + 1;
  }

  drinkOf(model: string): string {
    return this.drinks().get(model) || drinkForModel(model);
  }

  providerPrefix(line: BillLine): string {
    return line.provider ? `${line.provider} · ` : '';
  }

  badge(costSource: CostSource, cost: number) {
    return priceBadge(costSource, cost);
  }

  // Helpers dipakai di template
  formatUsd = formatUsd;
  formatTokens = formatTokens;
  formatPerMillion = formatPerMillion;
  formatPerToken = formatPerToken;
}
