import React from 'react';
import { ToolCall } from '../types';
import { Wrench, CheckCircle, AlertCircle, Clock, Terminal } from 'lucide-react';

interface ToolCallsFeedProps {
  toolCalls: ToolCall[];
}

export const ToolCallsFeed: React.FC<ToolCallsFeedProps> = ({ toolCalls }) => {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#1f2a40]">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-amber-400" />
          <h2 className="font-extrabold text-sm text-white tracking-wide uppercase">
            Realtime Tool Calls ({toolCalls.length})
          </h2>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">Telemetry Pi CLI</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {toolCalls.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-slate-500 border border-dashed border-[#232e44] rounded-xl p-6">
            <Terminal className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm font-semibold">Belum ada tool call tercatat</p>
            <p className="text-xs mt-1 text-slate-600">
              Tool call Pi (bash, read, edit, subagent) akan muncul otomatis di sini.
            </p>
          </div>
        ) : (
          toolCalls.map((tc) => {
            const isDone = tc.result_json !== null && tc.result_json !== undefined;
            const isError = !!tc.is_error;
            let parsedInput: any = null;
            try {
              parsedInput = tc.input_json ? JSON.parse(tc.input_json) : null;
            } catch {
              parsedInput = tc.input_json;
            }

            return (
              <div
                key={tc.id}
                className="p-3 rounded-xl bg-[#121722] border border-[#1f2a40] hover:border-amber-500/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-xs text-amber-300 font-bold">
                      🔧
                    </span>
                    <span className="font-mono font-bold text-xs text-amber-300">
                      {tc.tool_name}
                    </span>
                    {tc.session_name && (
                      <span className="text-[11px] text-slate-400">
                        oleh <b className="text-slate-200">{tc.session_name}</b>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isDone ? (
                      <span
                        className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          isError
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {isError ? (
                          <AlertCircle className="w-2.5 h-2.5" />
                        ) : (
                          <CheckCircle className="w-2.5 h-2.5" />
                        )}
                        {isError ? 'Error' : 'Selesai'}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse">
                        <Clock className="w-2.5 h-2.5" /> Executing
                      </span>
                    )}

                    {tc.duration_ms > 0 && (
                      <span className="text-[10px] font-mono text-slate-500">
                        {tc.duration_ms}ms
                      </span>
                    )}
                  </div>
                </div>

                {/* Input snippet */}
                {parsedInput && (
                  <pre className="mt-1.5 p-2 rounded-lg bg-[#0a0d13] border border-[#161c27] text-[11px] font-mono text-slate-300 overflow-x-auto max-h-24 scrollbar-thin">
                    {typeof parsedInput === 'string'
                      ? parsedInput
                      : JSON.stringify(parsedInput, null, 2)}
                  </pre>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
