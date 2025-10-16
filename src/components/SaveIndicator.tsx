import React from 'react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function SaveIndicator({ state }: { state: SaveState }) {
  const map: Record<SaveState, { text: string; color: string }> = {
    idle:   { text: 'Klar',     color: '#94a3b8' },
    saving: { text: 'Lagrer…',  color: '#fbbf24' },
    saved:  { text: 'Lagret',   color: '#34d399' },
    error:  { text: 'Feil',     color: '#f87171' },
  };
  const { text, color } = map[state];

  return (
    <div className="save-indicator" title={text} style={{ color }}>
      <span className="save-indicator__dot" style={{ backgroundColor: color }} />
      <span className="save-indicator__text">{text}</span>
    </div>
  );
}
