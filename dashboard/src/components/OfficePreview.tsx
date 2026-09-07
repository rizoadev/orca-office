import React, { useState } from 'react';
import { Maximize2, RefreshCw, Coffee } from 'lucide-react';
import { Session } from '../types';

interface OfficePreviewProps {
  sessions: Session[];
}

export const OfficePreview: React.FC<OfficePreviewProps> = ({ sessions }) => {
  const [iframeKey, setIframeKey] = useState(0);

  const activeWorking = sessions.filter((s) => s.status === 'working').length;
  const activeIdle = sessions.filter((s) => s.status === 'idle').length;

  return (
    <div className="flex flex-col h-full bg-[#0e1320] rounded-xl border border-[#1a2233] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#141b29] border-b border-[#1a2233]">
        <div className="flex items-center gap-2.5">
          <Coffee className="w-4 h-4 text-amber-400" />
          <h2 className="font-extrabold text-xs text-white uppercase tracking-wider">
            Denah 3D Coworking Space (1 Lantai · 14 Kursi)
          </h2>
          <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
            {activeWorking} Kerja · {activeIdle} Rehat
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIframeKey((k) => k + 1)}
            className="p-1.5 rounded-lg bg-[#1c2434] hover:bg-[#253044] text-slate-300 transition-colors"
            title="Reload 3D View"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <a
            href="/sample.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Layar Penuh</span>
          </a>
        </div>
      </div>

      {/* 3D Iframe embed from sample.html */}
      <div className="flex-1 relative min-h-[380px] bg-black">
        <iframe
          key={iframeKey}
          src="/sample.html"
          title="ORCA24 3D Coworking Space"
          className="w-full h-full border-none"
        />
      </div>
    </div>
  );
};
