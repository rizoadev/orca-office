import { officeEventEndpoint, officeTelemetryEnabled, readOfficeExtensionConfig } from './config.ts';
import { sanitizeEvent } from './redact.ts';

const SEND_TIMEOUT_MS = 1200;

let CONFIG = readOfficeExtensionConfig();
let ENDPOINT = officeEventEndpoint(CONFIG);
let OFFICE_TOKEN = process.env.OFFICE_TOKEN || CONFIG?.token || '';
let ENABLED = officeTelemetryEnabled();

// Keputusan sensor TIDAK boleh lagi bergantung pada "hop pertama loopback".
// Sejak hub lokal menulis ke Turso/cloud, `http://127.0.0.1:4317` tetap berarti detail
// penuh tersimpan di database bersama — dan baris itu permanen. Jadi yang ditanya adalah
// tempat datanya DIDARAT, dan hanya hub yang tahu itu: dia melaporkannya lewat
// GET /api/health → `storage`. Gagal probe / jawaban tak dikenal = tetap men-sensor
// (fail-closed), bukan membuka.
let REDACT = true;
let hubStorage = 'unknown';
let storageProbed = false;
let lastError = '';
let lastSentAt = 0;

/** Tanya hub tempat datanya didarat. Panggil sebelum event pertama; jangan pernah blok. */
export async function probeHubStorage(): Promise<string> {
  if (storageProbed && !process.env.OFFICE_ENDPOINT) return hubStorage;
  storageProbed = true;
  try {
    const origin = new URL(ENDPOINT).origin;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 900);
    const headers: Record<string, string> = {};
    if (OFFICE_TOKEN) headers.Authorization = `Bearer ${OFFICE_TOKEN}`;
    const res = await fetch(`${origin}/api/health`, { headers, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return hubStorage;
    const body = (await res.json()) as { storage?: string };
    hubStorage = typeof body?.storage === 'string' ? body.storage : 'unknown';
    REDACT = hubStorage !== 'local-file';
  } catch {
    // Fail-closed: hub tak dikenal berarti sensor menyala.
  }
  return hubStorage;
}


/**
 * Re-resolve endpoint/token after ~/.pi/office/config.json changes, so `/office connect`
 * takes effect in the running session instead of only after a Pi restart.
 */
export function refreshOfficeConfig(): void {
  CONFIG = readOfficeExtensionConfig();
  ENDPOINT = officeEventEndpoint(CONFIG);
  OFFICE_TOKEN = process.env.OFFICE_TOKEN || CONFIG?.token || '';
  ENABLED = officeTelemetryEnabled();
  storageProbed = false;
  hubStorage = 'unknown';
  REDACT = true;
}

export function officeTelemetryTarget(): { endpoint: string; redacting: boolean; authed: boolean; enabled: boolean; hubStorage: string; lastError: string; lastSentAt: number } {
  return { endpoint: ENDPOINT, redacting: REDACT, authed: Boolean(OFFICE_TOKEN), enabled: ENABLED, hubStorage, lastError, lastSentAt };
}

export async function sendOfficeEvent(type: string, payload: Record<string, any>): Promise<boolean> {
  // `enabled: false` means this machine opted out — not "send to the default hub instead".
  if (!ENABLED) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (OFFICE_TOKEN) headers.Authorization = `Bearer ${OFFICE_TOKEN}`;

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ type, payload: REDACT ? sanitizeEvent(type, payload) : payload }),
      signal: controller.signal
    });

    clearTimeout(timeout);
    if (!res.ok) {
      lastError = `HTTP ${res.status}`;
      return false;
    }
    lastError = '';
    lastSentAt = Date.now();
    return true;
  } catch (err: any) {
    // Fail-safe: never crash or block Pi CLI
    lastError = err?.name === 'AbortError' ? `timeout ${SEND_TIMEOUT_MS}ms` : String(err?.message || err);
    return false;
  }
}
