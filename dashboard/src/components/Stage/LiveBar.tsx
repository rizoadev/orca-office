import React from 'react';

interface LiveBarProps {
  message: string;
}

export const LiveBar: React.FC<LiveBarProps> = ({ message }) => {
  return (
    <div className="livebar">
      <span>📡</span>
      <div className="msg">{message}</div>
    </div>
  );
};
