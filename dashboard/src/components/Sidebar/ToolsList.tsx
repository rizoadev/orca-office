import React from 'react';
import { FeedEvent } from '../../types';

interface ToolsListProps {
  events: FeedEvent[];
  query: string;
}

export const ToolsList: React.FC<ToolsListProps> = ({ events, query }) => {
  const list = events.filter(
    (e) => e.kind === 'tool' && (!query || (e.who + e.text).toLowerCase().includes(query.toLowerCase()))
  );

  if (list.length === 0) {
    return <p style={{ color: '#64748b', fontSize: '.8rem', padding: '12px' }}>Belum ada tool call — tunggu Pi atau tim bekerja…</p>;
  }

  return (
    <div>
      {list.slice(0, 40).map((e, idx) => (
        <div key={idx} className="ev">
          <div className="ic">🔧</div>
          <div>
            <div className="tx">
              <b>{e.who}</b> <span className="k-tool">tool</span>
              <br />
              <code>{e.code || e.text}</code>
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
