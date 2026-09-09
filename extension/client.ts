import { officeEventEndpoint, officeTelemetryEnabled, readOfficeExtensionConfig } from './config.ts';
import { isLoopbackEndpoint, sanitizeEvent } from './redact.ts';

const SEND_TIMEOUT_MS = 1200;

let CONFIG = readOfficeExtensionConfig();
let ENDPOINT = officeEventEndpoint(CONFIG);
let OFFICE_TOKEN = process.env.OFFICE_TOKEN || CONFIG?.token || '';
let ENABLED = officeTelemetryEnabled();
// A loopback hub is on this machine, so full telemetry is fine there. Anything else —
// LAN peer or the public Worker — gets the sanitized event.
let REDACT = !isLoopbackEndpoint(ENDPOINT);
let lastError = '';
let lastSentAt = 0;

/**
 * Re-resolve endpoint/token after ~/.pi/office/config.json changes, so `/office connect`
 * takes effect in the running session instead of only after a Pi restart.
 */
export function refreshOfficeConfig(): void {
  CONFIG = readOfficeExtensionConfig();
  ENDPOINT = officeEventEndpoint(CONFIG);
  OFFICE_TOKEN = process.env.OFFICE_TOKEN || CONFIG?.token || '';
  ENABLED = officeTelemetryEnabled();
  REDACT = !isLoopbackEndpoint(ENDPOINT);
}

export function officeTelemetryTarget(): { endpoint: string; redacting: boolean; authed: boolean; enabled: boolean; lastError: string; lastSentAt: number } {
  return { endpoint: ENDPOINT, redacting: REDACT, authed: Boolean(OFFICE_TOKEN), enabled: ENABLED, lastError, lastSentAt };
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
