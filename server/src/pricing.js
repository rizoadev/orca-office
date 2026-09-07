// Price list for the coffee-shop bill. Pi already reports a per-message cost, but
// routers/free tiers report 0, so the bill would be blank. An operator-owned local
// table (USD per 1M tokens) fills that gap — the numbers live in pricing.json so they
// are auditable and editable, never buried in code.
import fs from 'node:fs';
import path from 'node:path';
import { lookupFeed } from './pricing-remote.js';

export const TOKENS_PER_MILLION = 1_000_000;

// Authority order for a price on a receipt: the operator's own table beats the third-party
// feed, which beats whatever Pi reported. Stored per row so aggregation can pick the best.
export const COST_RANK = { none: 0, reported: 1, feed: 2, table: 3 };
export const RANK_COST_SOURCE = Object.fromEntries(
  Object.entries(COST_RANK).map(([source, rank]) => [rank, source])
);

const PRICING_PATH =
  process.env.OFFICE_PRICING_PATH || path.resolve(process.cwd(), 'pricing.json');

const RATE_KEYS = ['input', 'output', 'cacheRead', 'cacheWrite'];

// Cheap hot-reload: pricing edits are rare, so only re-read when the file changed.
let cache = { models: {}, providers: {} };
let cacheMtimeMs = -1;
let cacheCheckedAt = 0;
const RECHECK_MS = 5000;

function normalizeRates(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const rates = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let known = false;
  for (const key of RATE_KEYS) {
    const value = Number(raw[key]);
    if (Number.isFinite(value) && value >= 0) {
      rates[key] = value;
      known = true;
    }
  }
  return known ? rates : null;
}

// Why: routers hand out aliased names (`kenari/qwen3.8-flash:free`, `bai/deepseek-v4-flash`),
// so an exact-key table would need one entry per alias. `*` wildcards let a single rule
// cover a whole family; the most specific literal prefix wins.
function patternToRegExp(key) {
  const escaped = key
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function isZeroRates(rates) {
  return RATE_KEYS.every((key) => !rates[key]);
}

// Why: a bare rule (`*free*`) must never see the provider prefix, or a router literally
// named `freeflow` would mark every model behind it free. Only rules that themselves
// contain '/' are allowed to match the qualified `provider/model` form.
function wildcardCandidatesFor(key, targets) {
  return key.includes('/') ? targets : targets.slice(0, 1);
}

function readTable() {
  const now = Date.now();
  if (now - cacheCheckedAt < RECHECK_MS) return cache;
  cacheCheckedAt = now;

  try {
    const mtimeMs = fs.statSync(PRICING_PATH).mtimeMs;
    if (mtimeMs !== cacheMtimeMs) {
      const raw = JSON.parse(fs.readFileSync(PRICING_PATH, 'utf8'));
      cache = {
        models: raw?.models && typeof raw.models === 'object' ? raw.models : {},
        providers: raw?.providers && typeof raw.providers === 'object' ? raw.providers : {}
      };
      cacheMtimeMs = mtimeMs;
    }
  } catch {
    // No pricing.json (or malformed) => fall back to Pi-reported cost only.
    cacheMtimeMs = -1;
    cache = { models: {}, providers: {} };
  }
  return cache;
}

function bestWildcardMatch(models, targets) {
  let best = null;
  for (const key of Object.keys(models)) {
    if (!key.includes('*') || key === '*') continue;
    const candidates = wildcardCandidatesFor(key, targets);
    if (!candidates.some((target) => target && patternToRegExp(key).test(target))) continue;
    const rates = normalizeRates(models[key]);
    if (!rates) continue;
    const free = isZeroRates(rates);
    // Specificity = how many literal characters the rule pins down (`*deepseek*pro*`
    // beats `*deepseek*`). A zero-priced rule (free tier / subscription) always wins,
    // otherwise `*gemini*` would bill a `...-free` alias that the operator marked free.
    const score = { key, free, literal: key.split('*').join('').length, wildcards: key.split('*').length - 1 };
    if (
      !best ||
      (score.free && !best.free) ||
      (score.free === best.free &&
        (score.literal > best.literal ||
          (score.literal === best.literal && score.wildcards < best.wildcards)))
    ) {
      best = score;
    }
  }
  return best;
}

/** Rates in USD per 1M tokens, or null when the operator has not priced this model. */
export function ratesForModel(model, provider) {
  const table = readTable();
  const cleanModel = String(model || '').trim();
  const cleanProvider = String(provider || '').trim();

  const exactKeys = [
    cleanProvider && cleanModel ? `${cleanProvider}/${cleanModel}` : null,
    cleanModel,
    cleanModel ? cleanModel.toLowerCase() : null,
  ].filter(Boolean);

  for (const key of exactKeys) {
    const rates = normalizeRates(table.models[key]);
    if (rates) return { rates, source: 'table', matchedBy: key };
  }

  // Wildcards: bare model name, plus the qualified form for provider-scoped rules, so
  // `openai-codex/*` can price a whole subscription route at once.
  const wildcard = bestWildcardMatch(table.models, [
    cleanModel,
    cleanProvider ? `${cleanProvider}/${cleanModel}` : null,
  ]);
  if (wildcard) {
    const rates = normalizeRates(table.models[wildcard.key]);
    if (rates) return { rates, source: 'table', matchedBy: wildcard.key };
  }

  const providerRates = normalizeRates(table.providers[cleanProvider]);
  if (providerRates) {
    return { rates: providerRates, source: 'table', matchedBy: `provider:${cleanProvider}` };
  }

  const fallback = normalizeRates(table.models['*']);
  if (fallback) return { rates: fallback, source: 'table', matchedBy: '*' };

  // Layer 2: the bulk remote feed (cached on disk). Local rules always win so an
  // operator override is never silently outvoted by a third-party list.
  const feed = lookupFeed(cleanModel, cleanProvider);
  if (feed) {
    return { rates: normalizeRates(feed.rates), source: 'feed', matchedBy: feed.matchedBy };
  }

  return { rates: null, source: null, matchedBy: null };
}

/** USD for one usage bucket, using per-1M rates. */
export function costFromRates(usage, rates) {
  if (!rates) return 0;
  const perMillion =
    (usage.input || 0) * rates.input +
    (usage.output || 0) * rates.output +
    (usage.cacheRead || 0) * rates.cacheRead +
    (usage.cacheWrite || 0) * rates.cacheWrite;
  return perMillion / TOKENS_PER_MILLION;
}

/**
 * Resolve what a single LLM call costs. Order: local pricing.json → bulk remote feed →
 * Pi's own reported cost. If none of them knows, the price is genuinely unknown and is
 * surfaced as `none` — never silently rendered as a free $0.00 receipt.
 */
export function resolveUsageCost({ model, provider, usage, reportedCost }) {
  const { rates, source, matchedBy } = ratesForModel(model, provider);
  if (rates) {
    return { cost: costFromRates(usage, rates), costSource: source, rates, matchedBy };
  }

  const reported = Number.isFinite(reportedCost) ? reportedCost : 0;
  if (reported > 0) {
    return { cost: reported, costSource: 'reported', rates: null, matchedBy: null };
  }

  return { cost: 0, costSource: 'none', rates: null, matchedBy: null };
}

export function pricingPath() {
  return PRICING_PATH;
}
