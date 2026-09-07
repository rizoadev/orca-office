import { AgentData } from '../types';

function clean(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function agentDeviceLabel(agent: AgentData): string | null {
  const machine = clean(agent.machineName) || clean(agent.machineId);
  const orca = clean(agent.orcaName);

  if (orca && machine) return `${orca} · ${machine}`;
  return orca || machine;
}

export function agentWorkspaceLabel(agent: AgentData): string | null {
  return clean(agent.orcaWorkspace) || clean(agent.orcaPane);
}

export function agentIdentitySearchText(agent: AgentData): string {
  return [
    agent.machineId,
    agent.machineName,
    agent.orcaName,
    agent.orcaWorkspace,
    agent.orcaPane,
    agent.clientKind,
  ]
    .filter(Boolean)
    .join(' ');
}
