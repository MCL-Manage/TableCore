import React from 'react';

export type ToolbarAction = {
  id: string;
  label: string;
  onClick?: () => void;
  icon?: 'add'|'delete'|'export'|'save'|'refresh'|'more'|'filter'|'print';
  disabled?: boolean;
  tooltip?: string;
};

export type AppToolbarProps = {
  title?: string;
  leftActions?: ToolbarAction[];
  rightActions?: ToolbarAction[];
  children?: React.ReactNode; // f.eks. SaveIndicator, breadcrumbs, filterchips osv.
  dense?: boolean;            // litt lavere høyde
  variant?: 'default'|'subtle';
};

const ICONS: Record<NonNullable<ToolbarAction['icon']>, JSX.Element> = {
  add:     <span aria-hidden>＋</span>,
  delete:  <span aria-hidden>🗑️</span>,
  export:  <span aria-hidden>⤓</span>,
  save:    <span aria-hidden>💾</span>,
  refresh: <span aria-hidden>⟳</span>,
  more:    <span aria-hidden>⋯</span>,
  filter:  <span aria-hidden>◫</span>,
  print:   <span aria-hidden>🖨️</span>,
};

export default function AppToolbar({
  title,
  leftActions = [],
  rightActions = [],
  children,
  dense = false,
  variant = 'default',
}: AppToolbarProps) {
  const H = dense ? 44 : 56;
  const BG = variant === 'subtle' ? '#0b1220' : '#0f172a';
  const BORDER = '#1f2937';
  const FG = '#e5e7eb';

  return (
    <div
      role="toolbar"
      aria-label={title ?? 'Verktøylinje'}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        gap: 8,
        height: H,
        background: BG,
        color: FG,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: '0 8px',
        marginBottom: 8,
      }}
    >
      {/* Venstre: knapper */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {leftActions.map(a => (
          <button
            key={a.id}
            onClick={a.onClick}
            title={a.tooltip ?? a.label}
            disabled={a.disabled}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: dense ? 30 : 36,
              padding: '0 10px',
              border: `1px solid ${BORDER}`,
              background: 'transparent',
              color: FG,
              borderRadius: 8,
              cursor: a.disabled ? 'not-allowed' : 'pointer',
              opacity: a.disabled ? 0.5 : 1,
            }}
          >
            {a.icon ? <span>{ICONS[a.icon]}</span> : null}
            <span style={{ fontSize: 13 }}>{a.label}</span>
          </button>
        ))}
      </div>

      {/* Midten: tittel / children */}
      <div style={{ textAlign: 'center', pointerEvents: 'none' }}>
        {title ? <strong style={{ fontSize: 14 }}>{title}</strong> : null}
        {children ? <div style={{ pointerEvents: 'auto' }}>{children}</div> : null}
      </div>

      {/* Høyre: knapper */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
        {rightActions.map(a => (
          <button
            key={a.id}
            onClick={a.onClick}
            title={a.tooltip ?? a.label}
            disabled={a.disabled}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: dense ? 30 : 36,
              padding: '0 10px',
              border: `1px solid ${BORDER}`,
              background: 'transparent',
              color: FG,
              borderRadius: 8,
              cursor: a.disabled ? 'not-allowed' : 'pointer',
              opacity: a.disabled ? 0.5 : 1,
            }}
          >
            {a.icon ? <span>{ICONS[a.icon]}</span> : null}
            <span style={{ fontSize: 13 }}>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
