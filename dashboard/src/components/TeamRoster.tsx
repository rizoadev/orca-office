import React from 'react';
import { Session } from '../types';
import { Bot, User, CheckCircle2, Clock, Terminal, Laptop } from 'lucide-react';

interface TeamRosterProps {
  sessions: Session[];
}

export const TeamRoster: React.FC<TeamRosterProps> = ({ sessions }) => {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#1f2a40]">
        <div className="flex items-center gap-2">
          <Laptop className="w-4 h-4 text-cyan-400" />
          <h2 className="font-extrabold text-sm text-white tracking-wide uppercase">
            Tim Kantor Terdaftar ({sessions.length})
          </h2>
        </div>
        <span className="text-[11px] text-slate-400">Auto-assigned Persona ID</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-slate-500 border border-dashed border-[#232e44] rounded-xl p-6">
            <User className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm font-semibold">Belum ada sesi Pi yang terhubung</p>
            <p className="text-xs mt-1 text-slate-600">
              Jalankan <code className="text-cyan-400">pi</code> di terminal untuk mendaftar otomatis ke kantor.
            </p>
          </div>
        ) : (
          sessions.map((session) => {
            const isSubagent = !!session.is_subagent;
            const isWorking = session.status === 'working';

            return (
              <div
                key={session.id}
                className="group relative p-3.5 rounded-xl bg-[#131824] hover:bg-[#182030] border border-[#20293c] hover:border-cyan-500/40 transition-all duration-200 shadow-sm"
              >
                {/* Header Row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0 shadow-inner border border-white/10"
                      style={{ backgroundColor: `${session.color}22` }}
                    >
                      {session.avatar || (isSubagent ? '🤖' : '🧑‍💻')}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-slate-100 truncate group-hover:text-cyan-300">
                          {session.name}
                        </h3>
                        {isSubagent && (
                          <span className="px-1.5 py-0.5 text-[9px] font-extrabold uppercase rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                            <Bot className="w-2.5 h-2.5" /> Sub-Agent
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-medium truncate">
                        {session.role}
                      </p>
                    </div>
                  </div>

                  {/* Status badge */}
                  <span
                    className={`flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                      isWorking
                        ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                        : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isWorking ? 'bg-cyan-400 animate-pulse-dot' : 'bg-amber-400'
                      }`}
                    />
                    {isWorking ? 'Working' : 'Idle'}
                  </span>
                </div>

                {/* Task active */}
                <div className="mt-2.5 p-2 rounded-lg bg-[#0b0e14] border border-[#1a2233]">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">
                    <Terminal className="w-3 h-3 text-cyan-400" />
                    <span>Lagi ngerjain apa:</span>
                  </div>
                  <p className="text-xs text-slate-200 font-medium line-clamp-2">
                    {session.task || 'Menunggu tugas baru dari Pi CLI...'}
                  </p>
                </div>

                {/* Footer metadata — nama di sini HARUS identik dengan footer Pi (session.name) */}
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span>ID: {session.id.slice(0, 12)}...</span>
                  <span title={session.model ? `Model: ${session.model}` : undefined}>{session.name}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
