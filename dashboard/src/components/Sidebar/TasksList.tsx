import React from 'react';
import { agentDeviceLabel, agentIdentitySearchText } from '../../lib/agent-identity';
import { AgentData } from '../../types';

interface TasksListProps {
  agents: AgentData[];
  selectedId: string;
  onSelectAgent: (id: string, fly: boolean) => void;
  query: string;
}

export const TasksList: React.FC<TasksListProps> = ({
  agents,
  selectedId,
  onSelectAgent,
  query,
}) => {
  const filtered = agents.filter((a) =>
    (a.name + a.task + agentIdentitySearchText(a)).toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div>
      {filtered.map((a) => {
        const isSelected = a.id === selectedId;
        const deviceLabel = agentDeviceLabel(a);
        return (
          <div
            key={a.id}
            className={`row ${isSelected ? 'sel' : ''}`}
            onClick={() => onSelectAgent(a.id, true)}
          >
            <div className="t1">
              <div className="av2">{a.av}</div>
              <div className="n">{a.task}</div>
            </div>
            <div className="tk2">
              {a.name} · {a.role}{deviceLabel ? ` · 🏢 ${deviceLabel}` : ''}
            </div>
            <div className="pbar">
              <i style={{ width: `${a.prog}%` }}></i>
            </div>
            {a.subs.map((s, idx) => (
              <div key={idx} className={`sub ${idx < a.subIdx ? 'done' : ''}`}>
                {idx < a.subIdx ? '✅' : '◽'} {s}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};
