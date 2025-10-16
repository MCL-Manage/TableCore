import React from 'react';

export type ToolbarAction = {
  id: string;
  label: string;
  tooltip?: string;
  onClick?: () => void;
  disabled?: boolean;
  icon?: 'add' | 'delete' | 'undo' | 'redo' | 'copy' | 'paste' | 'export' | 'filter' | 'save' | 'custom';
};

export type AppToolbarProps = {
  title?: string;
  leftActions?: ToolbarAction[];
  rightActions?: ToolbarAction[];
  children?: React.ReactNode; // f.eks. søkefelt eller filterchips
};

export default function AppToolbar({ title, leftActions = [], rightActions = [], children }: AppToolbarProps) {
  return (
    <div className="app-toolbar">
      <div className="app-toolbar__inner">
        <div className="app-toolbar__left">
          {title && <div className="app-toolbar__title">{title}</div>}
          <div className="app-toolbar__actions">
            {leftActions.map(a => (
              <button
                key={a.id}
                className="app-toolbar__btn"
                title={a.tooltip || a.label}
                onClick={a.onClick}
                disabled={a.disabled}
              >
                <Icon name={a.icon} />
                <span>{a.label}</span>
              </button>
            ))}
          </div>
          {children && <div className="app-toolbar__slot">{children}</div>}
        </div>

        <div className="app-toolbar__right">
          {rightActions.map(a => (
            <button
              key={a.id}
              className="app-toolbar__btn"
              title={a.tooltip || a.label}
              onClick={a.onClick}
              disabled={a.disabled}
            >
              <Icon name={a.icon} />
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Icon({ name }: { name?: ToolbarAction['icon'] }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  switch (name) {
    case 'add':     return (<svg {...common}><path d="M12 5v14M5 12h14" /></svg>);
    case 'delete':  return (<svg {...common}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>);
    case 'undo':    return (<svg {...common}><path d="M9 14H4v-5"/><path d="M4 9a9 9 0 1 1 3 7"/></svg>);
    case 'redo':    return (<svg {...common}><path d="M15 14h5V9"/><path d="M20 9a9 9 0 1 0-3 7"/></svg>);
    case 'copy':    return (<svg {...common}><rect x="9" y="9" width="13" height="13" rx="2"/><rect x="2" y="2" width="13" height="13" rx="2"/></svg>);
    case 'paste':   return (<svg {...common}><path d="M19 21H9a2 2 0 0 1-2-2V7h12v12a2 2 0 0 1-2 2z"/><path d="M5 7h14"/><path d="M12 3v4"/><rect x="9" y="2" width="6" height="4" rx="1"/></svg>);
    case 'export':  return (<svg {...common}><path d="M12 5v9"/><path d="M7 10l5-5 5 5"/><path d="M5 19h14"/></svg>);
    case 'filter':  return (<svg {...common}><path d="M22 3H2l8 9v7l4 2v-9l8-9z"/></svg>);
    case 'save':    return (<svg {...common}><path d="M19 21H5a2 2 0 0 1-2-2V5h13l3 3v11a2 2 0 0 1-2 2z"/><path d="M7 3v8h8"/></svg>);
    default:        return (<svg {...common}><circle cx="12" cy="12" r="9"/></svg>);
  }
}
