import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Clock, Terminal, Users, Cpu } from 'lucide-react';

interface NavbarProps {
  isConnected: boolean;
  totalActive: number;
  totalSubagents: number;
}

export const Navbar: React.FC<NavbarProps> = ({ isConnected, totalActive, totalSubagents }) => {
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'Asia/Jakarta'
        }) + ' WIB'
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-3.5 bg-[#0d1119]/90 backdrop-blur-md border-b border-[#1a2233]">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-600 to-amber-500 flex items-center justify-center text-xl shadow-lg shadow-amber-900/30">
          ☕
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-extrabold text-base tracking-tight text-white">
              ORCA24 Coworking Space
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              Live Hub
            </span>
          </div>
          <p className="text-xs text-slate-400 font-medium">
            Observabilitas Sesi & Tim Virtual Realtime
          </p>
        </div>
      </div>

      {/* Center Stats */}
      <div className="hidden md:flex items-center gap-6 text-xs font-semibold">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#141b29] border border-[#232e44]">
          <Users className="w-4 h-4 text-cyan-400" />
          <span className="text-slate-400">Sesi Utama:</span>
          <span className="text-white font-mono font-bold text-sm">{totalActive - totalSubagents}</span>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#141b29] border border-[#232e44]">
          <Cpu className="w-4 h-4 text-purple-400" />
          <span className="text-slate-400">Sub-Agents:</span>
          <span className="text-white font-mono font-bold text-sm">{totalSubagents}</span>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#141b29] border border-[#232e44]">
          <Clock className="w-4 h-4 text-amber-400" />
          <span className="text-amber-300 font-mono">{timeStr}</span>
        </div>
      </div>

      {/* Right Status */}
      <div className="flex items-center gap-3">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
            isConnected
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400 animate-pulse'
          }`}
        >
          {isConnected ? (
            <>
              <Wifi className="w-3.5 h-3.5" />
              <span>WS CONNECTED (4317)</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5" />
              <span>OFFLINE (RECONNECTING...)</span>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
