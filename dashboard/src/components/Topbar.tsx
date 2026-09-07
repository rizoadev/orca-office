import React from 'react';
import type { AcMode } from '../engine/wall-ac';

interface TopbarProps {
  clockTime: string;
  paused: boolean;
  onToggleMotion: () => void;
  onRecenter: () => void;
  onStreetView: () => void;
  acMode: AcMode;
  onCycleAcMode: () => void;
  isConnected: boolean;
  activeSessionsCount: number;
}

type EmbedMode = 'orca' | 'window' | 'browser';

// Orca menandai halaman tempat dashboard ini dibuka lewat query ?embedded=…
// (lihat src/renderer/src/components/office/OfficeWebview.tsx di repo Orca).
function readEmbedMode(): EmbedMode {
  const flag = new URLSearchParams(window.location.search).get('embedded');
  return flag === 'orca' ? 'orca' : flag === 'window' ? 'window' : 'browser';
}

/**
 * Minta dashboard tampil di jendela sendiri.
 *
 * Why: di dalam Orca halaman ini adalah <webview> yang di-sandbox tanpa preload, jadi
 * tidak ada bridge langsung ke host. Sinyalnya lewat hash: perubahan hash memicu event
 * 'did-navigate-in-page' di elemen webview, yang dipantau Orca untuk membuka jendelanya.
 * Ini satu-satunya jalur keluar yang tidak membuka permukaan navigasi/popup apa pun.
 */
function requestPopOut(embed: EmbedMode): void {
  if (embed === 'orca') {
    window.location.hash = 'orca-popout';
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return;
  }
  window.open(window.location.origin + '/', '_blank', 'noopener');
}

export const Topbar: React.FC<TopbarProps> = ({
  clockTime,
  paused,
  onToggleMotion,
  onRecenter,
  onStreetView,
  acMode,
  onCycleAcMode,
  isConnected,
  activeSessionsCount,
}) => {
  const embed = readEmbedMode();
  return (
    <header className="topbar">
      <div className="brand">
        <div className="cup">☕</div>
        <div>
          ORCA24 <span style={{ color: '#64748b', fontWeight: 500 }}>· Coworking Space</span>
        </div>
        <span
          className="sim-badge"
          style={{
            background: isConnected ? 'rgba(74,222,128,.12)' : 'rgba(248,113,113,.12)',
            borderColor: isConnected ? 'rgba(74,222,128,.35)' : 'rgba(248,113,113,.35)',
            color: isConnected ? '#86efac' : '#fca5a5'
          }}
        >
          {isConnected ? `● LIVE SYNC (${activeSessionsCount} SESI)` : 'OFFLINE'}
        </span>
        {embed === 'orca' ? (
          <button
            type="button"
            className="tbtn popout-btn"
            title="Buka Office di jendela baru"
            aria-label="Buka Office di jendela baru"
            onClick={() => requestPopOut(embed)}
          >
            ⧉
          </button>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span className="clock">
          🕒 <span>{clockTime}</span>
        </span>
        <button className="tbtn tbtn-compact" onClick={onToggleMotion}>
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <button
          className="tbtn tbtn-compact"
          onClick={onRecenter}
          title="Kembalikan kamera ke posisi awal"
          aria-label="Kembalikan kamera ke posisi awal"
        >
          ⌖ Recenter
        </button>
        <button
          className="tbtn tbtn-compact"
          onClick={onStreetView}
          title="Lihat trotoar dan jalan raya di depan office"
          aria-label="Lihat depan office"
        >
          🛣 Depan
        </button>
        <span className="topbar-sep" aria-hidden="true" />
        <button
          type="button"
          className={`tbtn tbtn-compact${acMode === 'off' ? '' : ' tbtn-on-cool'}`}
          aria-pressed={acMode !== 'off'}
          onClick={onCycleAcMode}
          title="AC di tembok belakang. AUTO = angin menguat saat banyak agent kerja, ON = penuh, OFF = pita menjuntai"
        >
          ❄ AC {acMode === 'auto' ? 'Auto' : acMode === 'on' ? 'On' : 'Off'}
        </button>
      </div>
    </header>
  );
};
