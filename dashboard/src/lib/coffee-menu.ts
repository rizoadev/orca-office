// Coffee-shop naming for the bill: every LLM model gets a drink on the menu board.
// Naming is presentation-only — the server stays model-agnostic and just reports tokens.

import { CostSource } from '../types';

/** Urutan cadangan kalau nama favorit sudah kepakai di menu. */
const HOUSE_MENU = [
  'Espresso',
  'Americano',
  'Cappuccino',
  'Latte',
  'Mocha',
  'Piccolo',
  'Flat White',
  'Long Black',
  'Cortado',
  'Macchiato',
  'Ristretto',
  'Doppio',
  'Lungo',
  'Affogato',
  'Cold Brew',
  'Nitro Cold Brew',
  'Vietnam Drip',
  'Con Panna',
  'Café Touba',
  'Breve',
];

/** Kopi gratisan / router tier tanpa tagihan per token. */
export const FREE_DRINK = 'House Drip';

// Preferensi nama per keluarga model. Bukan pemetaan kaku: kalau namanya sudah
// kepakai (mis. sonnet & opus sama-sama Cappuccino), model berikutnya geser ke menu lain.
const FAMILY_DRINKS: { match: RegExp; drink: string }[] = [
  { match: /opus/i, drink: 'Ristretto' },
  { match: /sonnet|claude|anthropic/i, drink: 'Cappuccino' },
  { match: /haiku/i, drink: 'Piccolo' },
  { match: /gpt-?5|codex|openai/i, drink: 'Cold Brew' },
  { match: /o3|chatgpt/i, drink: 'Nitro Cold Brew' },
  { match: /gemini.*pro|gemma/i, drink: 'Flat White' },
  { match: /gemini|bard/i, drink: 'Latte' },
  { match: /deepseek.*pro|deepseek/i, drink: 'Espresso' },
  { match: /kimi|moonshot/i, drink: 'Vietnam Drip' },
  { match: /glm|z-?ai|hunyuan|hy3/i, drink: 'Americano' },
  { match: /minimax|mimo/i, drink: 'Mocha' },
  { match: /qwen|qwq/i, drink: 'Long Black' },
  { match: /llama/i, drink: 'Cortado' },
  { match: /mistral|magistral/i, drink: 'Macchiato' },
  { match: /grok/i, drink: 'Affogato' },
  { match: /phi|olmo|smol|tiny/i, drink: 'Con Panna' },
];

function hashText(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function preferredDrink(model: string): string | null {
  // Keluarga model dulu: penjual terlaris di kantor ini mayoritas tier gratis, dan
  // "House Drip" untuk semuanya bikin papan menu tidak berguna. Status gratis sudah
  // ditampilkan lewat badge, jadi namanya tetap rasa kopi.
  const family = FAMILY_DRINKS.find((entry) => entry.match.test(model))?.drink ?? null;
  if (family) return family;
  return isFreeTierModel(model) ? FREE_DRINK : null;
}

/**
 * Nama alias router yang jelas-jelas gratis (`:free`, `-free`, `contributor`).
 * Harga tetap dari pricing.json; ini hanya penamaan menu.
 */
export function isFreeTierModel(model: string): boolean {
  return /(:free|-free|_free|free$|\/free$|contributor)/i.test(String(model || ''));
}

/**
 * Tugaskan nama kopi untuk daftar model. Urutan masuk = urutan pesan di daftar, jadi
 * nama yang sudah muncul di tagihan tidak berganti saat ada model baru.
 */
export function assignDrinks(models: string[]): Map<string, string> {
  const taken = new Set<string>();
  const assigned = new Map<string, string>();

  models.forEach((model, index) => {
    const wanted = preferredDrink(model);
    let drink = wanted && !taken.has(wanted) ? wanted : null;

    if (!drink) {
      const start = hashText(model) % HOUSE_MENU.length;
      for (let offset = 0; offset < HOUSE_MENU.length; offset++) {
        const candidate = HOUSE_MENU[(start + offset) % HOUSE_MENU.length];
        if (!taken.has(candidate)) {
          drink = candidate;
          break;
        }
      }
    }

    if (!drink) {
      // Menu-nya habis: beri penanda supaya dua model tidak berbagi satu nama.
      drink = `${HOUSE_MENU[index % HOUSE_MENU.length]} No.${index + 1}`;
    }

    taken.add(drink);
    assigned.set(model, drink);
  });

  return assigned;
}

export function drinkForModel(model: string): string {
  return preferredDrink(model) ?? HOUSE_MENU[hashText(model) % HOUSE_MENU.length];
}

export function formatTokens(value: number): string {
  const n = Number(value) || 0;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

/** Harga per token — angka kecil, jadi ditulis dalam notasi mikronya. */
export function formatPerToken(ratePerToken: number): string {
  const n = Number(ratePerToken) || 0;
  if (n === 0) return '$0';
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  const exponent = Math.floor(Math.log10(n));
  const mantissa = n / 10 ** exponent;
  return `$${mantissa.toFixed(2)}e${exponent}`;
}

/** Harga per 1M token — versi yang bisa dibaca manusia di papan menu. */
export function formatPerMillion(ratePerMillion: number): string {
  const n = Number(ratePerMillion) || 0;
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export function formatUsd(value: number): string {
  const n = Number(value) || 0;
  if (n === 0) return '$0.00';
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

/**
 * Sumber harga menentukan apakah angka nol itu benar-benar gratis atau cuma belum
 * dipatok — receipt tidak boleh berbohong.
 */
export function priceBadge(
  source: CostSource,
  cost: number
): { label: string; tone: 'free' | 'paid' | 'unknown' } {
  if (source === 'none') return { label: 'harga belum dipatok', tone: 'unknown' };
  if (source === 'reported') return { label: 'laporan Pi', tone: 'paid' };
  if (source === 'feed') return { label: cost === 0 ? 'gratis (feed)' : 'feed harga', tone: cost === 0 ? 'free' : 'paid' };
  if (cost === 0) return { label: 'gratis', tone: 'free' };
  return { label: 'pricing.json', tone: 'paid' };
}
