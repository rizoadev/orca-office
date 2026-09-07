import { officeEventEndpoint, readOfficeExtensionConfig } from './config.ts';
import { isLoopbackEndpoint, sanitizeEvent } from './redact.ts';

const CONFIG = readOfficeExtensionConfig();
const ENDPOINT = officeEventEndpoint(CONFIG);
const OFFICE_TOKEN = process.env.OFFICE_TOKEN || CONFIG?.token;
// A loopback hub is on this machine, so full telemetry is fine there. Anything else —
// LAN peer or the public Worker — gets the sanitized event.
const REDACT = !isLoopbackEndpoint(ENDPOINT);

export function officeTelemetryTarget(): { endpoint: string; redacting: boolean; authed: boolean } {
  return { endpoint: ENDPOINT, redacting: REDACT, authed: Boolean(OFFICE_TOKEN) };
}

export async function sendOfficeEvent(type: string, payload: Record<string, any>): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);

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
      // ignore
    }
  } catch {
    // Fail-safe: never crash or block Pi CLI
  }
}
