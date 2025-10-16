import React from 'react';
import type { ColumnDef, Selection, KeyBindings } from '../types';
import { TextEditor, NumberEditor, DateEditor, SelectEditor, ColorEditor } from './CellEditors';

export type RowLike = { id: string; [key: string]: any };

export type TableCoreProps = {
  columns: ColumnDef[];
  rows: RowLike[];
  readonly?: boolean;
  selection?: Selection;
  keymap?: KeyBindings;
  onPatch?: (patch: { rowId: string; colId: string; oldValue: any; nextValue: any }) => void;
  onSelectionChange?: (sel: Selection) => void;
  onCommit?: () => void;
};

type EditingCell = {
  rowId: string;
  colId: string;
  draft: any;
};

export default function TableCore(props: TableCoreProps) {
  const { columns, rows, readonly } = props;

  const [editing, setEditing] = React.useState<EditingCell | null>(null);
  const tbodyRef = React.useRef<HTMLDivElement>(null);

  function startEdit(row: RowLike, col: ColumnDef) {
    if (readonly) return;
    const editable = col.editable ? !!col.editable(row) : true;
    if (!editable) return;
    setEditing({ rowId: row.id, colId: col.id, draft: row[col.id] });
  }

  function cancelEdit() {
    setEditing(null);
  }

  function commitEdit() {
    if (!editing) return;
    const { rowId, colId, draft } = editing;
    const row = rows.find(r => r.id === rowId);
    if (!row) return;

    const col = columns.find(c => c.id === colId)!;
    const oldValue = row[colId];

    // validering
    if (col.validate) {
      const err = col.validate(draft, row);
      if (err instanceof Error) {
        // enkel visuell feedback (blink bakgrunn)
        blinkCell(rowId, colId, '#fee2e2');
        return;
      }
    }

    if (props.onPatch && oldValue !== draft) {
      props.onPatch({ rowId, colId, oldValue, nextValue: draft });
    }
    setEditing(null);
    props.onCommit?.();
  }

  function blinkCell(rowId: string, colId: string, color: string) {
    const el = tbodyRef.current?.querySelector<HTMLDivElement>(`[data-cell="${rowId}:${colId}"]`);
    if (!el) return;
    const prev = el.style.backgroundColor;
    el.style.backgroundColor = color;
    setTimeout(() => (el.style.backgroundColor = prev), 300);
  }

  function renderCell(row: RowLike, col: ColumnDef) {
    const raw = row[col.id];
    const formatted =
      col.format ? col.format(raw, row) : raw === undefined || raw === null ? '' : String(raw);

    const isEditing = editing && editing.rowId === row.id && editing.colId === col.id;

    if (readonly) {
      return <span>{formatted}</span>;
    }

    if (!isEditing) {
      return (
        <div
          onDoubleClick={() => startEdit(row, col)}
          style={{ cursor: 'text' }}
        >
          {formatted}
        </div>
      );
    }

    const commonProps = {
      value: editing!.draft,
      autoFocus: true,
      onChange: (v: any) => setEditing(ec => (ec ? { ...ec, draft: v } : ec)),
      onEnter: commitEdit,
      onEscape: cancelEdit,
      onBlur: commitEdit,
    };

    switch (col.type) {
      case 'text':
        return <TextEditor {...commonProps} />;
      case 'number':
        return <NumberEditor {...commonProps} />;
      case 'date':
        return <DateEditor {...commonProps} />;
      case 'select':
        return <SelectEditor {...commonProps} options={col.options ?? []} />;
      case 'color':
        return <ColorEditor {...commonProps} />;
      default:
        return <TextEditor {...commonProps} />;
    }
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: columns.map(c => `${c.width ?? 160}px`).join(' '),
          background: '#f8fafc',
          borderBottom: '1px solid #e5e7eb',
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        {columns.map(col => (
          <div key={col.id} style={{ padding: '8px 10px' }}>
            {col.header}
          </div>
        ))}
      </div>

      {/* Body */}
      <div ref={tbodyRef}>
        {rows.map((row) => (
          <div
            key={row.id}
            style={{
              display: 'grid',
              gridTemplateColumns: columns.map(c => `${c.width ?? 160}px`).join(' '),
              borderBottom: '1px solid #f1f5f9',
              fontSize: 13,
            }}
          >
            {columns.map((col) => {
              const isEditing = editing && editing.rowId === row.id && editing.colId === col.id;
              return (
                <div
                  key={col.id}
                  data-cell={`${row.id}:${col.id}`}
                  style={{
                    padding: isEditing ? '3px 6px' : '6px 10px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    background: isEditing ? '#fff' : undefined,
                    color: isEditing ? '#111827' : undefined,
                  }}
                  onClick={() => startEdit(row, col)}
                >
                  {renderCell(row, col)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
