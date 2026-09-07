import React from 'react';
import { agentDeviceLabel, agentIdentitySearchText, agentWorkspaceLabel } from '../../lib/agent-identity';
import { AgentData } from '../../types';

interface TeamListProps {
  agents: AgentData[];
  selectedId: string;
  onSelectAgent: (id: string, fly: boolean) => void;
  onKillAgent: (agent: AgentData) => void;
  query: string;
}

const STATUS_TXT: Record<string, [string, string, string]> = {
  work: ['Working', 'd-work', '#38bdf8'],
  talk: ['Coordinating', 'd-talk', '#fbbf24'],
  to: ['Walking', 'd-walk', '#c084fc'],
  back: ['Returning', 'd-walk', '#c084fc'],
  leaving: ['Leaving', 'd-walk', '#f97316'],
  break_play: ['Playground', 'd-break', '#4ade80'],
  break_out: ['Walked out', 'd-out', '#f87171'],
  idle: ['Idle', 'd-idle', '#94a3b8'],
};

export const TeamList: React.FC<TeamListProps> = ({
  agents,
  selectedId,
  onSelectAgent,
  onKillAgent,
  query,
}) => {
  const filtered = agents.filter((a) =>
    (a.name + a.task + a.role + agentIdentitySearchText(a)).toLowerCase().includes(query.toLowerCase())
  );

  if (filtered.length === 0) {
    return <p style={{ color: '#64748b', fontSize: '.8rem', padding: '12px' }}>Tidak ketemu.</p>;
  }

  return (
    <div>
      {filtered.map((a) => {
        const [txt, dc, col] = STATUS_TXT[a.mode] || STATUS_TXT.work;
        const isSelected = a.id === selectedId;
        const deviceLabel = agentDeviceLabel(a);
        const workspaceLabel = agentWorkspaceLabel(a);

        return (
          <div
            key={a.id}
            className={`row ${isSelected ? 'sel' : ''}`}
            onClick={() => onSelectAgent(a.id, true)}
          >
            <div className="t1">
              <div className="av2">{a.av}</div>
              <div className="n">
                {a.name}
                {a.realSessionId && (
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '0.62rem',
                      color: '#7dd3fc',
                      background: 'rgba(56,189,248,0.12)',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      border: '1px solid rgba(56,189,248,0.25)',
                      marginLeft: '6px',
                      fontWeight: 600
                    }}
                    title={`Full Session ID: ${a.realSessionId}`}
                  >
                    #{a.realSessionId.slice(0, 8)}
                  </span>
                )}
              </div>
              {a.isRealPi ? (
                <span className="fl" style={{ borderColor: '#4ade80', color: '#86efac' }}>
                  PI DEV
                </span>
              ) : (
                <span className="fl">1F</span>
              )}
              <button
                className="kill-agent-btn"
                disabled={a.mode === 'leaving' || a.mode === 'break_out'}
                title={a.realSessionId ? 'Kill proses Pi CLI agent ini' : 'Keluarkan agent simulasi dari kantor'}
                onClick={(event) => {
                  event.stopPropagation();
                  onKillAgent(a);
                }}
              >
                🛑 Kill
              </button>
            </div>
            <div className="tk2">
              <span className={`dot ${dc}`} style={{ display: 'inline-block' }}></span>{' '}
              <b style={{ color: col }}>{txt}</b> — {a.task}
            </div>
            <div className="pbar">
              <i style={{ width: `${a.prog}%` }}></i>
            </div>
            {(deviceLabel || workspaceLabel) && (
              <div className="meta">
                {deviceLabel && <span title={a.machineId ? `Machine ID: ${a.machineId}` : 'Device'}>🏢 {deviceLabel}</span>}
                {deviceLabel && workspaceLabel && <span>·</span>}
                {workspaceLabel && <span title={a.orcaPane ? `Orca pane: ${a.orcaPane}` : 'Orca workspace'}>🐋 {workspaceLabel}</span>}
              </div>
            )}
            <div className="meta">
              <span>idle {Math.floor(a.idle / 1000)}s</span>
              <span>·</span>
              <span>🔧 {a.toolsDone}</span>
              <span>·</span>
              <span>✅ {a.done}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
