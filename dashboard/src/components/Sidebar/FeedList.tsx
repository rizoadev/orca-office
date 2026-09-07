import React from 'react';
import { FeedEvent } from '../../types';

interface FeedListProps {
  events: FeedEvent[];
  feedKind: 'all' | 'task' | 'tool' | 'chat' | 'move';
  query: string;
}

const ICONS: Record<string, string> = {
  task: '✅',
  tool: '🔧',
  chat: '💬',
  move: '🚶',
  sys: '☕',
};

export const FeedList: React.FC<FeedListProps> = ({ events, feedKind, query }) => {
  const list = events.filter(
    (e) =>
      (feedKind === 'all' || e.kind === feedKind) &&
      (!query || (e.who + e.text).toLowerCase().includes(query.toLowerCase()))
  );

  if (list.length === 0) {
    return <p style={{ color: '#64748b', fontSize: '.8rem', padding: '12px' }}>Feed kosong.</p>;
  }

  return (
    <div>
      {list.slice(0, 60).map((e, idx) => (
        <div key={idx} className="ev">
          <div className="ic">{ICONS[e.kind] || '•'}</div>
          <div>
            <div className="tx">
              <b>{e.who}</b> <span className={`k-${e.kind}`}>{e.kind}</span> — {e.text}
              {e.code && (
                <>
                  <br />
                  <code>{e.code}</code>
                </>
              )}
            </div>
            <div className="mt">
              #{e.n} · {e.t}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
