import React, { useRef, useEffect } from 'react';
import { PillOverlay } from './PillOverlay';
import { LiveBar } from './LiveBar';
import { OfficeEngine } from '../../engine/officeEngine';
import { AgentData } from '../../types';

interface StageContainerProps {
  engine: OfficeEngine | null;
  agents: AgentData[];
  labelsOn: boolean;
  onToggleLabels: () => void;
  onSelectAgent: (id: string, fly: boolean) => void;
  liveMessage: string;
  isConnected: boolean;
}

export const StageContainer: React.FC<StageContainerProps> = ({
  engine,
  agents,
  labelsOn,
  onToggleLabels,
  onSelectAgent,
  liveMessage,
  isConnected,
}) => {
  return (
    <section className="stage">
      <div className="canvas-wrap" id="wrap">
        <canvas id="shop"></canvas>
        <PillOverlay
          agents={agents}
          onSelectAgent={onSelectAgent}
          labelsOn={labelsOn}
        />

        <div className="floor-tag" id="floorTag">
          ☕ ORCA24 COWORKING · 1 LANTAI · 14 SEATS
          {isConnected && (
            <span style={{ color: '#4ade80', marginLeft: '6px' }}>● LIVE WS</span>
          )}
        </div>

        <div className="hint">
          🖱 drag orbit · scroll zoom · klik bubble untuk fokus kamera
        </div>
      </div>

      <LiveBar message={liveMessage} />
    </section>
  );
};
