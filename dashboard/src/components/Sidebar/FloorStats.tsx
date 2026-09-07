import React from 'react';

interface FloorStatsProps {
  workingCount: number;
  walkingCount: number;
  idleCount: number;
  doneCount: number;
}

export const FloorStats: React.FC<FloorStatsProps> = ({
  workingCount,
  walkingCount,
  idleCount,
  doneCount,
}) => {
  return (
    <div className="stats">
      <div className="stat">
        <b style={{ color: '#38bdf8' }}>{workingCount}</b>
        <span>working</span>
      </div>
      <div className="stat">
        <b style={{ color: '#c084fc' }}>{walkingCount}</b>
        <span>walking</span>
      </div>
      <div className="stat">
        <b style={{ color: '#fbbf24' }}>{idleCount}</b>
        <span>idle/break</span>
      </div>
      <div className="stat">
        <b style={{ color: '#4ade80' }}>{doneCount}</b>
        <span>tasks done</span>
      </div>
    </div>
  );
};
