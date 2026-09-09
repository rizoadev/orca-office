import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readOfficeExtensionConfig } from './config.ts';
import { officeMachineIdFile } from '../lib/session-utils.ts';

export type OfficeClientKind = 'pi' | 'orca' | 'subagent';

export interface OfficeClientIdentity {
  machine_id: string;
  machine_name: string;
  orca_name?: string;
  orca_workspace?: string;
  orca_pane?: string;
  client_kind: OfficeClientKind;
}

const MACHINE_ID_PREFIX = 'office-machine-';

function clean(value: unknown, maxLength = 120): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

// Path file-nya satu sumber dengan hub (lib/session-utils.ts): hub membaca file yang sama
// untuk membatasi reaper, jadi kalau dua-duanya punya definisi sendiri, suatu hari cukup
// satu perubahan nama file untuk membuat reaper salah melihat sesi.
const machineIdFile = officeMachineIdFile;

function fallbackMachineId(): string {
  const raw = `${os.hostname()}|${os.platform()}|${os.arch()}`;
  return MACHINE_ID_PREFIX + crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function stableMachineId(): string {
  const config = readOfficeExtensionConfig();
  const explicit = clean(process.env.OFFICE_MACHINE_ID, 160) || clean(config?.machineId, 160);
  if (explicit) return explicit;

  const file = machineIdFile();
  try {
    const existing = clean(fs.readFileSync(file, 'utf8'), 160);
    if (existing) return existing;
  } catch {
    // The identity file is a convenience; fallback below keeps telemetry alive.
  }

  const generated = MACHINE_ID_PREFIX + crypto.randomUUID();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${generated}\n`, { flag: 'wx', mode: 0o600 });
    return generated;
  } catch {
    return fallbackMachineId();
  }
}

export function getOfficeClientIdentity(clientKind: OfficeClientKind): OfficeClientIdentity {
  const config = readOfficeExtensionConfig();
  const machineName =
    clean(process.env.OFFICE_MACHINE_NAME) ||
    clean(config?.machineName) ||
    clean(os.hostname()) ||
    'unknown-device';

  return {
    machine_id: stableMachineId(),
    machine_name: machineName,
    orca_name: clean(process.env.OFFICE_ORCA_NAME) || clean(process.env.ORCA_NAME) || clean(config?.orcaName),
    orca_workspace:
      clean(process.env.OFFICE_ORCA_WORKSPACE) ||
      clean(process.env.ORCA_WORKSPACE_NAME) ||
      clean(process.env.ORCA_WORKSPACE) ||
      clean(config?.orcaWorkspace),
    orca_pane: clean(process.env.OFFICE_ORCA_PANE) || clean(process.env.ORCA_PANE_KEY) || clean(config?.orcaPane),
    client_kind: clientKind
  };
}
