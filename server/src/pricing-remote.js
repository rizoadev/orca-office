// Remote price feed (bulk) — layer 2 behind the operator's local pricing.json.
//
// Why bulk and not per-model: the hub records usage on every LLM call, so a per-model
// HTTP dependency would put the network in the ingest path. One 27KB file, cached to
// disk and refreshed daily, keeps billing working with the internet unplugged.
import fs from 'node:fs';
import path from 'node:path';

const FEED_URL =
  process.env.OFFICE_PRICING_FEED_URL || 'https://www.llm-prices.com/current-v1.json';
const CACHE_PATH =
  process.env.OFFICE_PRICING_CACHE ||
  path.resolve(process.cwd(), 'pricing-cache.json');
const REFRESH_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

let index = null; // Map<normalizedKey, entry>
let entries = [];
let loadedAt = 0;
let refreshing = null;
let lastError = null;

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[:_]/g, '-')
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Strip router aliases: `kenari/mimo-v2-5:free` -> `mimo-v2-5`, keep the vendor hint. */
function parseModelRef(model, provider) {
  const raw = String(model || '');
  const tail = raw.includes('/') ? raw.slice(raw.lastIndexOf('/') + 1) : raw;
  const cleaned = normalizeName(tail).replace(/-free$|:free$|-0\d{3}$/, '');
  const aliasVendor = raw.includes('/') ? normalizeName(raw.slice(0, raw.lastIndexOf('/'))) : '';
  return { name: cleaned, aliasVendor, provider: normalizeName(provider) };
}

function toRates(entry) {
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
  return {
    input: num(entry.input),
    output: num(entry.output),
    cacheRead: num(entry.input_cached),
    // The feed has no cache-write column. Most vendors bill a cache write at the plain
    // input rate (Anthropic charges 1.25x, OpenAI charges nothing extra), so input is the
    // closest honest number; override in pricing.json when you need the exact multiplier.
    cacheWrite: num(entry.input)
  };
}

function buildIndex(prices) {
  const map = new Map();
  for (const entry of prices) {
    const key = normalizeName(entry.id || entry.name);
    if (!key) continue;
    if (!map.has(key)) map.set(key, entry);
  }
  return map;
}

function readCacheFile() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    if (Array.isArray(raw?.prices) && raw.prices.length) return raw;
  } catch {
    // no cache yet
  }
  return null;
}

function writeCacheFile(data) {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify({ ...data, cached_at: Date.now() }));
  } catch {
    // Read-only disk must not break billing.
  }
}

function adopt(data, stampAt) {
  entries = Array.isArray(data?.prices) ? data.prices : [];
  index = buildIndex(entries);
  loadedAt = Number.isFinite(stampAt) && stampAt > 0 ? stampAt : Date.now();
}

/** Load from disk immediately; refresh in the background when the cache is stale. */
export function ensureFeed({ force = false } = {}) {
  if (!index) {
    const disk = readCacheFile();
    if (disk) adopt(disk, Number(disk.cached_at));
  }
  const stale = !index || Date.now() - loadedAt > REFRESH_MS;
  if (force || stale) void refreshFeed();
}

export function refreshFeed() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await fetch(FEED_URL, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data?.prices) || !data.prices.length) {
        throw new Error('feed tanpa daftar harga');
      }
      adopt(data);
      writeCacheFile(data);
      lastError = null;
      return data;
    } catch (err) {
      lastError = err?.message || String(err);
      if (!index) {
        const disk = readCacheFile();
        if (disk) adopt(disk);
      }
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/**
 * Best-effort match of a router alias to a feed entry. Ambiguity returns null instead of
 * guessing — a wrong price on a receipt is worse than a missing one.
 */
export function lookupFeed(model, provider) {
  ensureFeed();
  if (!index || !index.size) return null;

  const { name, aliasVendor, provider: providerName } = parseModelRef(model, provider);
  if (!name) return null;

  const vendorHint = [providerName, aliasVendor].find(Boolean);

  const exact = index.get(name);
  if (exact) return { entry: exact, rates: toRates(exact), matchedBy: `feed:${exact.id}` };

  // Substring candidates, longest shared id wins.
  const scored = [];
  for (const entry of entries) {
    const key = normalizeName(entry.id || entry.name);
    if (!key || key.length < 4) continue;
    if (!name.includes(key) && !key.includes(name)) continue;
    const vendorMatch =
      vendorHint && normalizeName(entry.vendor || '').includes(vendorHint) ? 1 : 0;
    scored.push({ entry, key, score: key.length + vendorMatch * 100 });
  }
  if (!scored.length) return null;

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const rivals = scored.filter((c) => c.score === best.score && c.entry.id !== best.entry.id);
  if (rivals.length) return null;

  return { entry: best.entry, rates: toRates(best.entry), matchedBy: `feed:${best.entry.id}` };
}

export function feedStatus() {
  return {
    url: FEED_URL,
    cachePath: CACHE_PATH,
    loaded: !!index,
    entries: entries.length,
    loadedAt,
    lastError
  };
}
