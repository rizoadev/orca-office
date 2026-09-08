import React, { useMemo } from 'react';
import { AgentData } from '../../types';

interface LocationsListProps {
  agents: AgentData[];
  selectedId: string;
  onSelectAgent: (id: string, fly: boolean) => void;
  query: string;
}

interface MachineGroup {
  key: string;
  label: string;
  agents: AgentData[];
  idle: number;
}

const STATUS_TXT: Record<string, [string, string]> = {
  work: ['Working', '#38bdf8'],
  talk: ['Coordinating', '#fbbf24'],
  to: ['Walking', '#c084fc'],
  back: ['Returning', '#c084fc'],
  leaving: ['Leaving', '#f97316'],
  break_play: ['Playground', '#4ade80'],
  break_out: ['Walked out', '#f87171'],
  idle: ['Idle', '#94a3b8'],
};

const trim = (value?: string | null): string => value?.trim() ?? '';

/** Grouping key — device dulu, lalu Orca window sebagai fallback kalau identitas mesin absen. */
function machineGroupKey(agent: AgentData): string {
  const machine = trim(agent.machineId) || trim(agent.machineName);
  if (machine) return `machine:${machine.toLowerCase()}`;
  const orca = trim(agent.orcaName);
  return orca ? `orca:${orca.toLowerCase()}` : '__unknown__';
}

/** Label harus konsisten dengan key: jangan campur orcaName, atau satu device bisa dapat judul milik agent acak. */
function machineGroupLabel(agent: AgentData): string {
  const name = trim(agent.machineName);
  if (name) return name;
  const id = trim(agent.machineId);
  if (id) return id.slice(0, 16);
  const orca = trim(agent.orcaName);
  if (orca) return orca;
  return 'Unknown Device';
}

export const LocationsList: React.FC<LocationsListProps> = ({
  agents,
  selectedId,
  onSelectAgent,
  query,
}) => {
  const groups = useMemo(() => {
    const map = new Map<string, MachineGroup>();

    for (const a of agents) {
      const key = machineGroupKey(a);
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          label: machineGroupLabel(a),
          agents: [],
          idle: 0,
        };
        map.set(key, group);
      }
      group.agents.push(a);
      if (a.mode === 'idle' || a.mode === 'break_play' || a.mode === 'break_out') group.idle++;
    }

    // Sort: machines with more active agents first, then alphabetically
    return [...map.values()].sort((a, b) => {
      const aActive = a.agents.filter(x => x.mode !== 'leaving' && x.mode !== 'break_out').length;
      const bActive = b.agents.filter(x => x.mode !== 'leaving' && x.mode !== 'break_out').length;
      if (bActive !== aActive) return bActive - aActive;
      return a.label.localeCompare(b.label);
    });
  }, [agents]);

  const filtered = useMemo(() => {
    if (!query) return groups;
    const q = query.toLowerCase();
    return groups
      .map(g => ({
        ...g,
        agents: g.agents.filter(a =>
          (a.name + a.task + a.role + g.label).toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.agents.length > 0);
  }, [groups, query]);

  if (filtered.length === 0) {
    return <p style={{ color: '#64748b', fontSize: '.8rem', padding: '12px' }}>Tidak ketemu.</p>;
  }

  const totalMachines = filtered.length;
  const totalAgents = filtered.reduce((s, g) => s + g.agents.length, 0);

  return (
    <div>
      <div style={{
        padding: '8px 12px',
        fontSize: '.72rem',
        color: '#94a3b8',
        borderBottom: '1px solid rgba(148,163,184,0.12)',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>{totalMachines} device{totalMachines !== 1 ? 's' : ''}</span>
        <span>{totalAgents} agent{totalAgents !== 1 ? 's' : ''}</span>
      </div>

      {filtered.map((group) => {
        const activeCount = group.agents.filter(
          a => a.mode !== 'leaving' && a.mode !== 'break_out'
        ).length;

        return (
          <div
            key={group.key}
            style={{
              borderBottom: '1px solid rgba(148,163,184,0.08)',
              padding: '10px 12px 6px',
            }}
          >
            {/* Machine header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '6px',
            }}>
              <span style={{ fontSize: '1rem' }}>💻</span>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontWeight: 600,
                  fontSize: '.82rem',
                  color: '#e2e8f0',
                }}>
                  {group.label}
                </div>
                <div style={{
                  fontSize: '.68rem',
                  color: '#64748b',
                  fontFamily: "'JetBrains Mono', monospace",
                  marginTop: '1px',
                }}>
                  {activeCount > 0 ? (
                    <>
                      <span style={{ color: '#4ade80' }}>{activeCount} active</span>
                      {group.idle > 0 && (
                        <>, <span style={{ color: '#fbbf24' }}>{group.idle} idle</span></>
                      )}
                    </>
                  ) : (
                    <span style={{ color: '#64748b' }}>all offline</span>
                  )}
                  <span> · {group.agents.length} agent{group.agents.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>

            {/* Agent list under this machine */}
            {group.agents.map((a) => {
              const isSelected = a.id === selectedId;
              const [statusTxt, statusCol] = STATUS_TXT[a.mode] || STATUS_TXT.work;

              return (
                <div
                  key={a.id}
                  onClick={() => onSelectAgent(a.id, true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '5px 8px',
                    marginLeft: '20px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(56,189,248,0.1)' : 'transparent',
                    transition: 'background .15s',
                  }}
                >
                  <span style={{ fontSize: '.9rem' }}>{a.av}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '.78rem',
                      color: '#e2e8f0',
                      fontWeight: isSelected ? 600 : 400,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {a.name}
                      {a.project && (
                        <span style={{
                          fontSize: '.65rem',
                          color: '#64748b',
                          marginLeft: '6px',
                        }}>
                          {a.project}
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontSize: '.66rem',
                      color: statusCol,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {statusTxt} — {a.task}
                    </div>
                  </div>
                  {a.realSessionId && (
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '.58rem',
                      color: '#7dd3fc',
                      background: 'rgba(56,189,248,0.1)',
                      padding: '1px 4px',
                      borderRadius: '3px',
                      border: '1px solid rgba(56,189,248,0.2)',
                      flexShrink: 0,
                    }}>
                      #{a.realSessionId.slice(0, 6)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
