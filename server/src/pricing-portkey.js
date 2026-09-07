// On-demand single-model price quote from Portkey's public pricing config endpoint.
//
// Why on-demand and not part of the ingest path: it is one HTTP call per model with no
// bulk variant, so wiring it into usage recording would put a third-party endpoint in the
// hot path of every LLM turn. The dashboard asks only when a receipt line has no price,
// and a human decides whether to paste the suggestion into pricing.json.
const PORTKEY_BASE =
  process.env.OFFICE_PORTKEY_BASE || 'https://api.portkey.ai/model-configs/pricing';
const QUOTE_TIMEOUT_MS = 6000;

// Portkey quotes are USD per 10K tokens; our ledger speaks USD per 1M.
const PER_10K_TO_PER_1M = 10_000;

function splitModelRef(model, provider) {
  const raw = String(model || '').trim();
  const tail = raw.includes('/') ? raw.slice(raw.lastIndexOf('/') + 1) : raw;
  const aliasVendor = raw.includes('/') ? raw.slice(0, raw.lastIndexOf('/')) : '';
  return {
    provider: String(provider || '').trim() || aliasVendor,
    model: tail,
  };
}

function toPerMillion(block) {
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) * PER_10K_TO_PER_1M : 0);
  return {
    input: num(block?.request_token?.price),
    output: num(block?.response_token?.price),
    cacheRead: num(block?.cache_read_input_token?.price),
    cacheWrite: num(block?.cache_write_input_token?.price),
  };
}

/**
 * @returns {Promise<{ ok: boolean, rates?: object, plan?: string, error?: string, queried?: string }>}
 */
export async function quoteFromPortkey(model, provider) {
  const ref = splitModelRef(model, provider);
  if (!ref.model) return { ok: false, error: 'Nama model kosong.' };
  if (!ref.provider) {
    return { ok: false, error: 'Butuh provider untuk query Portkey (endpoint-nya per provider/model).' };
  }

  const url = `${PORTKEY_BASE}/${encodeURIComponent(ref.provider)}/${encodeURIComponent(ref.model)}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, queried: url };
    }
    const data = await res.json();
    const plan = data?.pay_as_you_go ? 'pay_as_you_go' : Object.keys(data || {})[0];
    const block = data?.[plan];
    if (!block) return { ok: false, error: 'Respons tanpa blok harga.', queried: url };

    const rates = toPerMillion(block);
    if (!rates.input && !rates.output) {
      return { ok: false, error: 'Blok harga ada tapi nol semua.', queried: url };
    }
    return { ok: true, rates, plan, queried: url };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), queried: url };
  }
}
