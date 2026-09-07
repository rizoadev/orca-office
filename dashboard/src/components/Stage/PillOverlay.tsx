import React from 'react';
import { agentDeviceLabel, agentWorkspaceLabel } from '../../lib/agent-identity';
import { AgentData } from '../../types';

interface PillOverlayProps {
  agents: AgentData[];
  onSelectAgent: (id: string, fly: boolean) => void;
  labelsOn: boolean;
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

function getCoffeeLine(agent: AgentData) {
  const stream = agent.llmStream;

  if (stream?.text) {
    if (stream.kind === 'response') return `Response: ${stream.text}`;
    if (stream.kind === 'thinking') return `Thinking: ${stream.text}`;
    if (stream.kind === 'tool') return `Tool: ${stream.text}`;
    return stream.text;
  }

  return `Prompt: ${agent.task || 'Belum ada prompt aktif'}`;
}

export const PillOverlay: React.FC<PillOverlayProps> = ({
  agents,
  onSelectAgent,
  labelsOn,
}) => {
  return (
    <div id="overlay" style={{ display: labelsOn ? 'block' : 'none' }}>
      {agents.map((a) => {
        const isMushola = a.mode === 'mushola';
        const deviceLabel = agentDeviceLabel(a);
        const workspaceLabel = agentWorkspaceLabel(a);
        const [txt, dc, col] = isMushola
          ? ['Saf', 'd-idle', '#a5b4fc']
          : (STATUS_TXT[a.mode] || STATUS_TXT.work);

        return (
          <div
            key={a.id}
            id={`pill-${a.id}`}
            className="pill"
            style={{ display: 'none' }}
            onClick={() => onSelectAgent(a.id, true)}
          >
            <div className="card">
              <div className="r1">
                <span className={`dot ${dc}`}></span>
                <span className="nm">{a.name}</span>
                {a.realSessionId && (
                  <span
                    className="sid-tag"
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '0.55rem',
                      fontWeight: 700,
                      background: 'rgba(56,189,248,0.15)',
                      border: '1px solid rgba(56,189,248,0.3)',
                      color: '#7dd3fc',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      marginLeft: 'auto',
                      whiteSpace: 'nowrap'
                    }}
                    title={`Real Pi Session: ${a.realSessionId}`}
                  >
                    #{a.realSessionId.slice(0, 8)}
                  </span>
                )}
              </div>
              {a.project && (
                <div className="prj" title={`Project git: ${a.project}`}>
                  <span className="pico">📁</span>
                  <span className="pname">{a.project}</span>
                </div>
              )}
              {deviceLabel && (
                <div className="prj" title={a.machineId ? `Machine ID: ${a.machineId}` : 'Device'}>
                  <span className="pico">🏢</span>
                  <span className="pname">{deviceLabel}</span>
                </div>
              )}
              {workspaceLabel && (
                <div className="prj" title={a.orcaPane ? `Orca pane: ${a.orcaPane}` : 'Orca workspace'}>
                  <span className="pico">🐋</span>
                  <span className="pname">{workspaceLabel}</span>
                </div>
              )}
              {isMushola ? (
                <div className="st" style={{ color: col }}>
                  🕌 Duduk di mushola
                </div>
              ) : (
                <>
                  <div className="st" style={{ color: col }}>
                    {txt} · {a.isRealPi ? 'Live Pi CLI' : 'floor 1'}
                  </div>
                  <div className="tk">
                    ☕ {getCoffeeLine(a)}
                  </div>
                </>
              )}
            </div>
            <div className="stem"></div>
            {a.talk && (
              <div className="talk">
                💬 {a.talk.text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
