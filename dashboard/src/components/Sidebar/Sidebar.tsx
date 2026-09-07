import React, { useState } from 'react';
import { AgentData, BillingSummary, FeedEvent, LogEntry } from '../../types';
import { FloorStats } from './FloorStats';
import { SelectedCard } from './SelectedCard';
import { SidebarTabs } from './SidebarTabs';
import { TeamList } from './TeamList';
import { TasksList } from './TasksList';
import { ToolsList } from './ToolsList';
import { FeedList } from './FeedList';
import { BillingPanel } from './BillingPanel';
import { RealtimeLogs } from '../RealtimeLogs';

interface SidebarProps {
  agents: AgentData[];
  selectedId: string;
  onSelectAgent: (id: string, fly: boolean) => void;
  onKillAgent: (agent: AgentData) => void;
  events: FeedEvent[];
  logs: LogEntry[];
  billing: BillingSummary;
  stats: {
    working: number;
    walking: number;
    idle: number;
    done: number;
  };
}

export const Sidebar: React.FC<SidebarProps> = ({
  agents,
  selectedId,
  onSelectAgent,
  onKillAgent,
  events,
  logs,
  billing,
  stats,
}) => {
  const [tab, setTab] = useState<'team' | 'tasks' | 'tools' | 'feed' | 'logs' | 'bill'>('team');
  const [feedKind, setFeedKind] = useState<'all' | 'task' | 'tool' | 'chat' | 'move'>('all');
  const [query, setQuery] = useState('');

  const selectedAgent = agents.find((a) => a.id === selectedId);

  return (
    <aside className="side">
      <div className="side-head">
        <h1>
          ☕ Floor manager <span style={{ fontWeight: 400, color: '#64748b', fontSize: '.72rem' }}>· live state</span>
        </h1>
        <p>Semua bubble, tool calls, tasks & tagihan token — satu sumber state terintegrasi.</p>

        <FloorStats
          workingCount={stats.working}
          walkingCount={stats.walking}
          idleCount={stats.idle}
          doneCount={stats.done}
        />

        <SelectedCard agent={selectedAgent} />
      </div>

      <SidebarTabs
        activeTab={tab}
        onSetTab={setTab}
        feedKind={feedKind}
        onSetFeedKind={setFeedKind}
      />

      <div className="search">
        <input
          placeholder="🔍 cari tim / task / tool / menu…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="pane">
        {tab === 'team' && (
          <TeamList
            agents={agents}
            selectedId={selectedId}
            onSelectAgent={onSelectAgent}
            onKillAgent={onKillAgent}
            query={query}
          />
        )}
        {tab === 'tasks' && (
          <TasksList
            agents={agents}
            selectedId={selectedId}
            onSelectAgent={onSelectAgent}
            query={query}
          />
        )}
        {tab === 'tools' && <ToolsList events={events} query={query} />}
        {tab === 'feed' && (
          <FeedList events={events} feedKind={feedKind} query={query} />
        )}
        {tab === 'logs' && <RealtimeLogs logs={logs} />}
        {tab === 'bill' && (
          <BillingPanel
            billing={billing}
            query={query}
            onSelectUser={(sessionId) => {
              const agent = agents.find((a) => a.realSessionId === sessionId);
              if (agent) onSelectAgent(agent.id, true);
            }}
          />
        )}
      </div>
    </aside>
  );
};
