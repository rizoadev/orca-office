import React from 'react';

interface SidebarTabsProps {
  activeTab: 'team' | 'locations' | 'tasks' | 'tools' | 'feed' | 'logs' | 'bill';
  onSetTab: (tab: 'team' | 'locations' | 'tasks' | 'tools' | 'feed' | 'logs' | 'bill') => void;
  feedKind: 'all' | 'task' | 'tool' | 'chat' | 'move';
  onSetFeedKind: (kind: 'all' | 'task' | 'tool' | 'chat' | 'move') => void;
}

export const SidebarTabs: React.FC<SidebarTabsProps> = ({
  activeTab,
  onSetTab,
  feedKind,
  onSetFeedKind,
}) => {
  return (
    <>
      <div className="tabs">
        <button
          className={activeTab === 'team' ? 'active' : ''}
          onClick={() => onSetTab('team')}
        >
          Team
        </button>
        <button
          className={activeTab === 'locations' ? 'active' : ''}
          onClick={() => onSetTab('locations')}
          title="Group agent by device / laptop"
        >
          📍 Locs
        </button>
        <button
          className={activeTab === 'tasks' ? 'active' : ''}
          onClick={() => onSetTab('tasks')}
        >
          Tasks
        </button>
        <button
          className={activeTab === 'tools' ? 'active' : ''}
          onClick={() => onSetTab('tools')}
        >
          Tools
        </button>
        <button
          className={activeTab === 'feed' ? 'active' : ''}
          onClick={() => onSetTab('feed')}
        >
          Feed
        </button>
        <button
          className={activeTab === 'logs' ? 'active' : ''}
          onClick={() => onSetTab('logs')}
        >
          Logs
        </button>
        <button
          className={activeTab === 'bill' ? 'active' : ''}
          onClick={() => onSetTab('bill')}
          title="Tagihan token & biaya per pegawai"
        >
          ☕ Bill
        </button>
      </div>

      {activeTab === 'feed' && (
        <div className="chips">
          {(['all', 'task', 'tool', 'chat', 'move'] as const).map((k) => (
            <button
              key={k}
              className={`chip ${feedKind === k ? 'active' : ''}`}
              onClick={() => onSetFeedKind(k)}
            >
              {k === 'all' ? 'All' : k.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </>
  );
};
