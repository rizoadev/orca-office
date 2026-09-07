import React, { useMemo, useState } from 'react';
import { BillLine, BillingSummary } from '../../types';
import {
  assignDrinks,
  drinkForModel,
  formatPerMillion,
  formatPerToken,
  formatTokens,
  formatUsd,
  priceBadge,
} from '../../lib/coffee-menu';

interface BillingPanelProps {
  billing: BillingSummary;
  query: string;
  onSelectUser: (sessionId: string) => void;
}

const MENU_TOP_N = 6;

function QuoteButton({ model, provider }: { model: string; provider: string | null }) {
  const [state, setState] = useState<{ busy: boolean; text: string | null; tone: string }>({
    busy: false,
    text: null,
    tone: 'unknown',
  });

  const ask = async () => {
    setState({ busy: true, text: 'menanya Portkey…', tone: 'unknown' });
    try {
      const host = window.location.hostname || '127.0.0.1';
      const params = new URLSearchParams({ model, provider: provider || '', portkey: '1' });
      const res = await fetch(`http://${host}:4317/api/billing/quote?${params}`);
      const data = await res.json();
      const quote = data?.portkey;
      if (quote?.ok) {
        setState({
          busy: false,
          tone: 'paid',
          text: `Portkey: ${formatPerMillion(quote.rates.input)} in / ${formatPerMillion(quote.rates.output)} out per 1M — salin ke pricing.json`,
        });
      } else {
        setState({ busy: false, tone: 'unknown', text: quote?.error || 'tidak ketemu' });
      }
    } catch (err) {
      setState({ busy: false, tone: 'unknown', text: 'server hub tidak menjawab' });
    }
  };

  return (
    <span className="bill-quote">
      <button className="bill-quote-btn" onClick={ask} disabled={state.busy}>
        {state.busy ? '…' : '🔎 cek harga'}
      </button>
      {state.text && <em className={`bill-quote-text tone-${state.tone}`}>{state.text}</em>}
    </span>
  );
}

function LineRow({ line, drink }: { line: BillLine; drink: string }) {
  const badge = priceBadge(line.costSource, line.cost);
  return (
    <div className="bill-line">
      <div className="bill-line-top">
        <span className="bill-drink">{drink}</span>
        <span className="bill-money">{formatUsd(line.cost)}</span>
      </div>
      <div className="bill-model" title={`${line.provider ? line.provider + ' · ' : ''}${line.model}`}>
        {line.model}
      </div>
      <div className="bill-tokens">
        <span title="token input">in {formatTokens(line.inputTokens)}</span>
        <span title="token output">out {formatTokens(line.outputTokens)}</span>
        <span title="cache read">cache {formatTokens(line.cacheReadTokens)}</span>
        <span title="total token">{formatTokens(line.totalTokens)} tok</span>
        <span title="jumlah panggilan LLM">{line.turns} seduh</span>
      </div>
      <div className="bill-rate">
        <b>{formatPerToken(line.ratePerToken)}</b>
        <span>/ token</span>
        <span className="bill-rate-mid">·</span>
        <span>{formatPerMillion(line.ratePerMillion)} / 1M</span>
        <span className={`bill-tag tone-${badge.tone}`}>{badge.label}</span>
      </div>
      {line.costSource === 'none' && <QuoteButton model={line.model} provider={line.provider} />}
    </div>
  );
}

export const BillingPanel: React.FC<BillingPanelProps> = ({ billing, query, onSelectUser }) => {
  const [showAllMenu, setShowAllMenu] = useState(false);

  const drinks = useMemo(
    () => assignDrinks((billing?.menu || []).map((row) => row.model)),
    [billing?.menu]
  );

  // Menu terlaris: model paling sering diseduh, bukan sekadar paling mahal.
  const rankedMenu = useMemo(() => {
    const rows = [...(billing?.menu || [])].sort(
      (a, b) => b.turns - a.turns || b.totalTokens - a.totalTokens || b.cost - a.cost
    );
    return rows.map((row) => ({ ...row, drink: drinks.get(row.model) || drinkForModel(row.model) }));
  }, [billing?.menu, drinks]);

  const menu = useMemo(() => {
    const visible = showAllMenu ? rankedMenu : rankedMenu.slice(0, MENU_TOP_N);
    if (!query) return visible;
    return rankedMenu.filter((r) =>
      (r.model + r.drink).toLowerCase().includes(query.toLowerCase())
    );
  }, [rankedMenu, showAllMenu, query]);

  const users = useMemo(() => {
    const list = billing?.users || [];
    if (!query) return list;
    return list.filter((user) =>
      (user.name + user.lines.map((l) => l.model + (drinks.get(l.model) || '')).join(' '))
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  }, [billing?.users, drinks, query]);

  if (!billing || !billing.users.length) {
    return (
      <p className="bill-empty">
        Belum ada tagihan. Setiap panggilan LLM dari sesi Pi yang aktif akan tercatat di sini —
        papan menu 3D ikut berubah mengikuti kopi yang benar-benar diseduh.
      </p>
    );
  }

  const totals = billing.totals;

  return (
    <div className="bill">
      <div className="bill-total">
        <div>
          <span className="bill-total-label">TOTAL BILL · SEMUA TAMU</span>
          <div className="bill-total-value">{formatUsd(totals.cost)}</div>
        </div>
        <div className="bill-total-meta">
          <span>{formatTokens(totals.totalTokens)} token</span>
          <span>{totals.turns} seduh</span>
          <span>{totals.users} tamu</span>
          <span>{totals.models} menu</span>
        </div>
      </div>

      <div className="bill-section">
        <div className="bill-section-head">
          <b>☕ Menu terlaris</b>
          <span>paling sering diseduh · harga per 1M token</span>
        </div>
        {menu.map((row) => {
          const badge = priceBadge(row.costSource, row.cost);
          const rank = rankedMenu.indexOf(row) + 1;
          return (
            <div className="bill-menu-row" key={row.model}>
              <span className={`bill-rank${rank <= 3 ? ' hot' : ''}`}>#{rank}</span>
              <span className="bill-drink">{row.drink}</span>
              <span className="bill-menu-model" title={row.model}>
                {row.model}
              </span>
              <span className={`bill-tag tone-${badge.tone}`}>{badge.label}</span>
              <span className="bill-menu-price">
                {row.costSource === 'none' ? '?' : `${formatPerMillion(row.ratePerMillion)}/1M`}
              </span>
              <span className="bill-menu-perm">
                {row.turns} seduh · {formatTokens(row.totalTokens)} tok · {formatPerToken(row.ratePerToken)}/tok · {row.drinkerCount} peminum
              </span>
            </div>
          );
        })}
        {!query && rankedMenu.length > MENU_TOP_N && (
          <button className="bill-more" onClick={() => setShowAllMenu((v) => !v)}>
            {showAllMenu ? '↑ tutup menu' : `↓ ${rankedMenu.length - MENU_TOP_N} menu lainnya`}
          </button>
        )}
      </div>

      <div className="bill-section">
        <div className="bill-section-head">
          <b>🧾 Tagihan per tamu</b>
          <span>klik untuk fokus kamera</span>
        </div>
        {users.map((user) => (
          <div className="bill-user" key={user.sessionId} onClick={() => onSelectUser(user.sessionId)}>
            <div className="bill-user-head">
              <span className="bill-user-av">{user.avatar}</span>
              <span className="bill-user-name">{user.name}</span>
              {!!user.isSubagent && <span className="bill-sub">sub</span>}
              <span className="bill-money">{formatUsd(user.cost)}</span>
            </div>
            <div className="bill-user-meta">
              <span>{formatTokens(user.totalTokens)} tok</span>
              <span>·</span>
              <span>{formatPerToken(user.ratePerToken)}/token</span>
              <span>·</span>
              <span>{user.turns} seduh</span>
            </div>
            {user.lines.map((line) => (
              <LineRow key={`${user.sessionId}:${line.model}`} line={line} drink={drinks.get(line.model) || drinkForModel(line.model)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
