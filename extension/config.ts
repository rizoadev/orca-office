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

function officeDir(): string {
  return path.join(process.env.HOME || process.env.USERPROFILE || os.homedir(), '.pi', 'office');
}

function readJson(file: string): OfficeExtensionConfig | null {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as OfficeExtensionConfig;
    return raw?.enabled === false ? null : raw;
  } catch {
    return null;
  }
}

export function readOfficeExtensionConfig(): OfficeExtensionConfig | null {
  // config.json is owned by the Pi extension; orca.json remains a backwards-compatible
  // bridge config so existing Orca installs keep working.
  return readJson(path.join(officeDir(), 'config.json')) ?? readJson(path.join(officeDir(), 'orca.json'));
}

export function officeEventEndpoint(config = readOfficeExtensionConfig()): string {
  if (process.env.OFFICE_ENDPOINT) return process.env.OFFICE_ENDPOINT;
  if (config?.endpoint) return config.endpoint;
  if (config?.url) {
    try {
      return `${new URL(config.url).origin}/api/event`;
    } catch {
      // Fall through to local default.
    }
  }
  return 'http://127.0.0.1:4317/api/event';
}
