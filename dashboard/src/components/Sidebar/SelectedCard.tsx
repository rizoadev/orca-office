import React from 'react';
import { agentDeviceLabel, agentWorkspaceLabel } from '../../lib/agent-identity';
import { AgentData } from '../../types';

interface SelectedCardProps {
  agent?: AgentData;
}

export const SelectedCard: React.FC<SelectedCardProps> = ({ agent }) => {
  const deviceLabel = agent ? agentDeviceLabel(agent) : null;
  const workspaceLabel = agent ? agentWorkspaceLabel(agent) : null;

  if (!agent) {
    return (
      <div className="selcard">
        <div className="av">☕</div>
        <div>
          <div className="nm">ORCA24</div>
          <div className="rl">Klik bubble / nama di list untuk fokus kamera.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="selcard">
      <div className="av">{agent.av}</div>
      <div>
        <div className="nm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>{agent.name}</span>
          {agent.realSessionId && (
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.65rem',
                color: '#7dd3fc',
                background: 'rgba(56,189,248,0.12)',
                padding: '1px 6px',
                borderRadius: '4px',
                border: '1px solid rgba(56,189,248,0.3)'
              }}
              title={agent.realSessionId}
            >
              #{agent.realSessionId.slice(0, 8)}
            </span>
          )}
        </div>
        <div className="rl">
          {agent.role} · {agent.mode} · {agent.task}
        </div>
        {agent.project && (
          <div
            className="rl"
            style={{
              marginTop: '3px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.62rem',
              color: 'var(--wood)'
            }}
            title={`Project git: ${agent.project}`}
          >
            📁 {agent.project}
          </div>
        )}
        {deviceLabel && (
          <div
            className="rl"
            style={{
              marginTop: '3px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.62rem',
              color: '#7dd3fc'
            }}
            title={agent.machineId ? `Machine ID: ${agent.machineId}` : 'Device'}
          >
            🏢 {deviceLabel}
          </div>
        )}
        {workspaceLabel && (
          <div
            className="rl"
            style={{
              marginTop: '3px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.62rem',
              color: '#a5b4fc'
            }}
            title={agent.orcaPane ? `Orca pane: ${agent.orcaPane}` : 'Orca workspace'}
          >
            🐋 {workspaceLabel}
          </div>
        )}
      </div>
    </div>
  );
};
