import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type OfficeExtensionConfig = {
  url?: string;
  endpoint?: string;
  token?: string;
  enabled?: boolean;
  machineId?: string;
  machineName?: string;
  orcaName?: string;
  orcaWorkspace?: string;
  orcaPane?: string;
};

/**
 * Office default when a machine has no config at all.
 *
 * Why cloud-first: a fresh `pi install npm:@rizoadev/pi-office` on another laptop has no
 * ~/.pi/office/config.json, and the old loopback fallback meant it silently posted to a hub
 * that does not exist there. Pointing at the deployed Worker makes the package work with zero
 * setup for a member of this office. A stranger's install just gets a 401 and no telemetry —
 * the token is what gates writes, not the URL.
 */
export const DEFAULT_CLOUD_ENDPOINT = 'https://pi-office.hanirizo.workers.dev/api/event';
export const DEFAULT_LOCAL_ENDPOINT = 'http://127.0.0.1:4317/api/event';

function officeDir(): string {
  return path.join(process.env.HOME || process.env.USERPROFILE || os.homedir(), '.pi', 'office');
}

export function officeConfigPath(): string {
  return path.join(officeDir(), 'config.json');
}

function parseJson(file: string): OfficeExtensionConfig | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as OfficeExtensionConfig;
  } catch {
    return null;
  }
}

/** Raw config, ignoring the `enabled` switch. Needed by `/office on` to read a saved token. */
export function readRawOfficeConfig(): OfficeExtensionConfig | null {
  return parseJson(officeConfigPath()) ?? parseJson(path.join(officeDir(), 'orca.json'));
}

export function readOfficeExtensionConfig(): OfficeExtensionConfig | null {
  // config.json is owned by the Pi extension; orca.json remains a backwards-compatible
  // bridge config so existing Orca installs keep working.
  const config = readRawOfficeConfig();
  return !config || config.enabled === false ? null : config;
}

/**
 * Telemetry opt-out. Distinct from readOfficeExtensionConfig(), which returns null when
 * disabled and would otherwise be read as "no config at all → use the packaged cloud
 * default". `enabled: false` must mean silent, not "report somewhere else".
 */
export function officeTelemetryEnabled(): boolean {
  if (process.env.OFFICE_DISABLED) return false;
  return readRawOfficeConfig()?.enabled !== false;
}

/** Merge into the extension-owned config file. Mode 0600 — this file can carry a bearer token. */
export function writeOfficeExtensionConfig(patch: Partial<OfficeExtensionConfig>): OfficeExtensionConfig {
  const file = officeConfigPath();
  const next = { ...(readRawOfficeConfig() ?? {}), ...patch };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  return next;
}

export function officeEventEndpoint(config = readOfficeExtensionConfig()): string {
  // `OFFICE_LOCAL=1` is the developer switch: run against a hub on this machine without
  // editing (or losing) a cloud config.
  if (process.env.OFFICE_ENDPOINT) return process.env.OFFICE_ENDPOINT;
  if (process.env.OFFICE_LOCAL) return DEFAULT_LOCAL_ENDPOINT;
  if (config?.endpoint) return config.endpoint;
  if (config?.url) {
    try {
      return `${new URL(config.url).origin}/api/event`;
    } catch {
      // Fall through to the packaged default.
    }
  }
  return DEFAULT_CLOUD_ENDPOINT;
}

/** Dashboard origin for the same hub, e.g. `https://pi-office.hanirizo.workers.dev`. */
export function officeHubOrigin(endpoint = officeEventEndpoint()): string | null {
  try {
    return new URL(endpoint).origin;
  } catch {
    return null;
  }
}
