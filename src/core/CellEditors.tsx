import React from 'react';

type Common = {
  value: any;
  autoFocus?: boolean;
  onChange: (v: any) => void;
  onEnter: () => void;
  onEscape: () => void;
  onBlur: () => void;
};

function useKeyHandlers({ onEnter, onEscape }: { onEnter: () => void; onEscape: () => void }) {
  return React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (e.key === 'Enter') onEnter();
      else if (e.key === 'Escape') onEscape();
    },
    [onEnter, onEscape]
  );
}

export function TextEditor({ value, autoFocus, onChange, onEnter, onEscape, onBlur }: Common) {
  const onKeyDown = useKeyHandlers({ onEnter, onEscape });
  return (
    <input
      autoFocus={autoFocus}
      type="text"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      style={inputStyle}
    />
  );
}

export function NumberEditor({ value, autoFocus, onChange, onEnter, onEscape, onBlur }: Common) {
  const onKeyDown = useKeyHandlers({ onEnter, onEscape });
  return (
    <input
      autoFocus={autoFocus}
      type="number"
      value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      style={inputStyle}
    />
  );
}

export function DateEditor({ value, autoFocus, onChange, onEnter, onEscape, onBlur }: Common) {
  const onKeyDown = useKeyHandlers({ onEnter, onEscape });
  // forventer YYYY-MM-DD
  return (
    <input
      autoFocus={autoFocus}
      type="date"
      value={value ?? ''}
      onChange={e => onChange(e.target.value || undefined)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      style={inputStyle}
    />
  );
}

export function SelectEditor({
  value,
  autoFocus,
  onChange,
  onEnter,
  onEscape,
  onBlur,
  options,
}: Common & { options: { value: string; label: string }[] }) {
  const onKeyDown = useKeyHandlers({ onEnter, onEscape });
  return (
    <select
      autoFocus={autoFocus}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      style={inputStyle}
    >
      {/* tomt valg for null */}
      <option value=""></option>
      {options.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ColorEditor({ value, autoFocus, onChange, onEnter, onEscape, onBlur }: Common) {
  const onKeyDown = useKeyHandlers({ onEnter, onEscape });
  return (
    <input
      autoFocus={autoFocus}
      type="color"
      value={value ?? '#000000'}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      style={{ ...inputStyle, padding: 0, height: 28 }}
    />
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 28,
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: '0 8px',
  fontSize: 13,
  outline: 'none',
};
