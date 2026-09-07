import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AccessGate } from './components/AccessGate';
import { Topbar } from './components/Topbar';
import { StageContainer } from './components/Stage/StageContainer';
import { Sidebar } from './components/Sidebar/Sidebar';
import { ToastContainer, ToastItem } from './components/Toast/ToastContainer';
import { OfficeEngine } from './engine/officeEngine';
import { useOfficeSocket } from './hooks/useOfficeSocket';
import { AgentData, FeedEvent } from './types';
import type { AcMode } from './engine/wall-ac';
import { assignDrinks, formatPerMillion, formatTokens } from './lib/coffee-menu';
import { officeApiUrl } from './lib/office-endpoints';

export function App() {
  const { state: wsState, isConnected, unauthorized, submitToken, refetch } = useOfficeSocket();

  const [engine, setEngine] = useState<OfficeEngine | null>(null);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string>('backend');
  const [clockTime, setClockTime] = useState<string>('00:00:00');
  const [paused, setPaused] = useState<boolean>(false);
  const [acMode, setAcMode] = useState<AcMode>('auto');
  const [labelsOn, setLabelsOn] = useState<boolean>(true);
  const [liveMessage, setLiveMessage] = useState<string>(
    'Barista bot memanaskan espresso machine…'
  );
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const engineRef = useRef<OfficeEngine | null>(null);

  const addToast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  // Akses cepat: ?auth= / ?token= di URL langsung dipakai untuk login otomatis saat
  // dashboard ke-load, lalu dihapus dari address bar supaya token tidak teringgal.
  // Dashboard di-serve sebagai static asset (edge) untuk path '/', jadi worker tidak
  // sempat menangkap query — auto-login di sisi klien inilah yang menangani link cepat.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const quick = params.get('auth') ?? params.get('token');
    if (!quick) return;
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState(null, '', cleanUrl);
    void submitToken(quick);
  }, [submitToken]);

  // Initialize Three.js Engine once canvas mounts
  useEffect(() => {
    const canvas = document.getElementById('shop') as HTMLCanvasElement;
    const overlay = document.getElementById('overlay') as HTMLElement;
    if (!canvas || !overlay || engineRef.current) return;

    const eng = new OfficeEngine(canvas, overlay);
    engineRef.current = eng;
    setEngine(eng);
    setAgents([...eng.agents]);
    setEvents([...eng.events]);

    eng.onStateChange = () => {
      setAgents([...eng.agents]);
      setEvents([...eng.events]);
    };

    eng.onLiveMessage = (msg) => {
      setLiveMessage(msg);
    };

    eng.onToast = (msg) => {
      addToast(msg);
    };

    eng.start();
    addToast('☕ Selamat datang di ORCA24 — Coworking Space');

    return () => {
      eng.stop();
      engineRef.current = null;
    };
    // unauthorized ikut: canvas baru ada di DOM setelah gate lolos, dan effect ini harus
    // sempat jalan lagi — deps lama tidak berubah, jadi engine tidak akan pernah start.
  }, [addToast, unauthorized]);

  // Sync real Pi sessions from WebSocket into 3D engine.
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.syncRealSessions(wsState.sessions);
      setAgents([...engineRef.current.agents]);
    }
  }, [wsState.sessions]);

  // Sync real Tool Calls from WebSocket
  useEffect(() => {
    if (engineRef.current && wsState.recent_tool_calls.length > 0) {
      const latest = wsState.recent_tool_calls[0];
      engineRef.current.handleRealToolCall(latest);
      setEvents([...engineRef.current.events]);
    }
  }, [wsState.recent_tool_calls]);

  // Papan menu 3D ikut tagihan: menu terlaris = model paling sering diseduh.
  const menuBoard = useMemo(() => {
    const rows = [...wsState.billing.menu].sort(
      (a, b) => b.turns - a.turns || b.totalTokens - a.totalTokens
    );
    const drinks = assignDrinks(rows.map((r) => r.model));
    return rows.slice(0, 5).map((row, index) => ({
      drink: `${index < 3 ? '★ ' : ''}${drinks.get(row.model) || row.model}`,
      model: row.model,
      price: row.costSource === 'none' ? '?' : `${formatPerMillion(row.ratePerMillion)}/1M`,
      sold: `×${formatTokens(row.turns)} seduh`,
    }));
  }, [wsState.billing.menu]);

  useEffect(() => {
    engine?.setMenuBoard(menuBoard);
  }, [engine, menuBoard]);

  // Clock ticker
  useEffect(() => {
    const timer = setInterval(() => {
      if (engineRef.current) {
        const ms = engineRef.current.simMs;
        const s = (ms / 1000) | 0;
        const p = (n: number) => String(n).padStart(2, '0');
        setClockTime(`${p((s / 3600) | 0)}:${p(((s / 60) | 0) % 60)}:${p(s % 60)}`);
      }
    }, 500);
    return () => clearInterval(timer);
  }, []);

  // Handlers
  const handleToggleMotion = () => {
    if (!engineRef.current) return;
    const next = !paused;
    engineRef.current.paused = next;
    setPaused(next);
  };

  const handleRecenter = () => {
    if (!engineRef.current) return;
    // 'over' = posisi kamera yang sama dengan konstruktor, jadi tombol ini
    // benar-benar kembali ke view awal, bukan ke preset lain.
    engineRef.current.camPreset('over');
    addToast('⌖ Kamera kembali ke posisi awal');
  };

  // Preset 'street' ada supaya trotoar + jalan raya di depan office bisa dilihat:
  // view dollhouse memotong tanah tepat di garis facade.
  const handleStreetView = () => {
    if (!engineRef.current) return;
    engineRef.current.camPreset('street');
    addToast('🛣 Kamera ke depan office');
  };

  // AUTO → ON → OFF. Auto sengaja tidak pernah nol: ruangan sepi tetap dapat
  // angin dasar supaya pita tidak pernah terlihat "rusak".
  const handleCycleAcMode = () => {
    if (!engineRef.current) return;
    const next: AcMode = acMode === 'auto' ? 'on' : acMode === 'on' ? 'off' : 'auto';
    engineRef.current.setAcMode(next);
    setAcMode(next);
    addToast(
      next === 'auto'
        ? '❄ AC kembali ke AUTO (mengikuti agent yang kerja)'
        : next === 'on'
          ? '❄ AC dipaksa ON penuh'
          : '🔌 AC OFF — pita menjuntai'
    );
  };

  const handleToggleLabels = () => {
    if (!engineRef.current) return;
    const next = !labelsOn;
    engineRef.current.labelsOn = next;
    setLabelsOn(next);
    addToast(next ? 'Labels ditampilkan' : 'Labels disembunyikan');
  };

  const handleSelectAgent = (id: string, fly: boolean) => {
    setSelectedId(id);
    engineRef.current?.selectAgent(id, fly);
  };

  const handleKillAgent = async (agent: AgentData) => {
    const isRealPiAgent = !!agent.realSessionId;
    const confirmed = window.confirm(
      isRealPiAgent
        ? `Kill agent ${agent.name}? Proses Pi CLI akan dikirim SIGTERM.`
        : `Kill agent simulasi ${agent.name}? Agent akan dikeluarkan dari kantor.`
    );
    if (!confirmed) return;

    try {
      if (isRealPiAgent) {
        const res = await fetch(
          officeApiUrl(`/api/sessions/${encodeURIComponent(agent.realSessionId!)}/kill`),
          { method: 'POST' }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Gagal kill agent.');
        }
        engineRef.current?.startExit(agent);
        setAgents(engineRef.current ? [...engineRef.current.agents] : []);
        addToast(data.signal_sent ? `🛑 SIGTERM dikirim ke ${agent.name}` : `🧹 ${agent.name} dihapus dari kantor`);
        refetch();
      } else {
        engineRef.current?.startExit(agent);
        addToast(`🛑 ${agent.name} dikeluarkan dari kantor`);
      }

      if (selectedId === agent.id) {
        const next = agents.find((a) => a.id !== agent.id);
        if (next) setSelectedId(next.id);
      }
    } catch (err) {
      addToast(`⚠️ ${err instanceof Error ? err.message : 'Gagal kill agent'}`);
    }
  };

  // Stats calculation
  const workingCount = agents.filter((a) => a.mode === 'work' || a.mode === 'talk').length;
  const walkingCount = agents.filter((a) => a.mode === 'to' || a.mode === 'back' || a.mode === 'leaving').length;
  const idleCount = agents.filter((a) => ['idle', 'break_play', 'break_out'].includes(a.mode)).length;
  const doneCount = agents.reduce((sum, a) => sum + (a.done || 0), 0);

  if (unauthorized) {
    return (
      <>
        <AccessGate onSubmit={submitToken} />
        <ToastContainer toasts={toasts} />
      </>
    );
  }

  return (
    <>
      <Topbar
        clockTime={clockTime}
        paused={paused}
        onToggleMotion={handleToggleMotion}
        onRecenter={handleRecenter}
        onStreetView={handleStreetView}
        acMode={acMode}
        onCycleAcMode={handleCycleAcMode}
        isConnected={isConnected}
        activeSessionsCount={wsState.sessions.length}
      />

      <div className="layout">
        <StageContainer
          engine={engine}
          agents={agents}
          labelsOn={labelsOn}
          onToggleLabels={handleToggleLabels}
          onSelectAgent={handleSelectAgent}
          liveMessage={liveMessage}
          isConnected={isConnected}
        />

        <Sidebar
          agents={agents}
          selectedId={selectedId}
          onSelectAgent={handleSelectAgent}
          onKillAgent={handleKillAgent}
          events={events}
          logs={wsState.recent_logs}
          billing={wsState.billing}
          stats={{
            working: workingCount,
            walking: walkingCount,
            idle: idleCount,
            done: doneCount,
          }}
        />
      </div>

      <ToastContainer toasts={toasts} />
    </>
  );
}

export default App;
