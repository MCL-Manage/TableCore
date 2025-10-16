import React from 'react';
import type { ColumnDef, Selection, KeyBindings } from '../types';
import { TextEditor, NumberEditor, DateEditor, SelectEditor, ColorEditor } from './CellEditors';
import { useClipboard } from './useClipboard';
import { useUndoRedo, HistoryAction, CellChange } from './useUndoRedo';

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

type Rect = { r0: number; r1: number; c0: number; c1: number };

export default function TableCore(props: TableCoreProps) {
  const { columns, rows, readonly } = props;

  const [editing, setEditing] = React.useState<EditingCell | null>(null);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [anchor, setAnchor] = React.useState<{ r: number; c: number } | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const tbodyRef = React.useRef<HTMLDivElement>(null);

  const history = useUndoRedo();

  // ---------- Selection helpers ----------
  const colCount = columns.length;
  const rowCount = rows.length;

  function clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v));
  }

  function setSingleSelection(r: number, c: number) {
    const rIdx = clamp(r, 0, rowCount - 1);
    const cIdx = clamp(c, 0, colCount - 1);
    setAnchor({ r: rIdx, c: cIdx });
    setRect({ r0: rIdx, r1: rIdx, c0: cIdx, c1: cIdx });
    props.onSelectionChange?.({ rows: [rIdx], cols: [cIdx] });
  }

  function setRangeSelection(r: number, c: number) {
    if (!anchor) return setSingleSelection(r, c);
    const rIdx = clamp(r, 0, rowCount - 1);
    const cIdx = clamp(c, 0, colCount - 1);
    const r0 = Math.min(anchor.r, rIdx);
    const r1 = Math.max(anchor.r, rIdx);
    const c0 = Math.min(anchor.c, cIdx);
    const c1 = Math.max(anchor.c, cIdx);
    setRect({ r0, r1, c0, c1 });
    const rowRange = Array.from({ length: r1 - r0 + 1 }, (_, i) => r0 + i);
    const colRange = Array.from({ length: c1 - c0 + 1 }, (_, i) => c0 + i);
    props.onSelectionChange?.({ rows: rowRange, cols: colRange });
  }

  function isSelectedCell(r: number, c: number) {
    if (!rect) return false;
    return r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1;
  }

  // ---------- Editing ----------
  function startEditByIndex(rIdx: number, cIdx: number) {
    if (readonly) return;
    const row = rows[rIdx];
    const col = columns[cIdx];
    const editable = col.editable ? !!col.editable(row) : true;
    if (!editable) return;
    setEditing({ rowId: row.id, colId: col.id, draft: row[col.id] });
  }

  function startEdit(row: RowLike, col: ColumnDef, rIdx: number, cIdx: number) {
    setSingleSelection(rIdx, cIdx);
    startEditByIndex(rIdx, cIdx);
  }

  function cancelEdit() {
    setEditing(null);
  }

  function commitSingleEdit() {
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
        blinkCell(rowId, colId, '#fee2e2');
        return;
      }
    }

    if (props.onPatch && oldValue !== draft) {
      const change: CellChange = { rowId, colId, oldValue, nextValue: draft };
      props.onPatch(change);
      history.push({ changes: [change] });
    }
    setEditing(null);
    props.onCommit?.();
  }

  function blinkCell(rowId: string, colId: string, color: string) {
    const el = tbodyRef.current?.querySelector<HTMLDivElement>(`[data-cell="${rowId}:${colId}"]`);
    if (!el) return;
    const prev = el.style.backgroundColor;
    el.style.backgroundColor = color;
    setTimeout(() => (el.style.backgroundColor = prev), 250);
  }

  function renderCell(row: RowLike, col: ColumnDef, rIdx: number, cIdx: number) {
    const raw = row[col.id];
    const formatted =
      col.format ? col.format(raw, row) : raw === undefined || raw === null ? '' : String(raw);

    const isEditing =
      editing && editing.rowId === row.id && editing.colId === col.id;

    if (readonly) {
      return <span>{formatted}</span>;
    }

    if (!isEditing) {
      return (
        <div
          onDoubleClick={() => startEdit(row, col, rIdx, cIdx)}
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
      onEnter: commitSingleEdit,
      onEscape: cancelEdit,
      onBlur: commitSingleEdit,
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

  // ---------- Keyboard & Clipboard ----------
  // Fokusér container for å fange Ctrl/Cmd + C/V/Z/Y
  React.useEffect(() => {
    rootRef.current?.focus();
  }, [rows.length]);

  const doCopy = React.useCallback(() => {
    if (!rect) return '';
    const rows2D = [];
    for (let r = rect.r0; r <= rect.r1; r++) {
      const row = rows[r];
      const line: string[] = [];
      for (let c = rect.c0; c <= rect.c1; c++) {
        const col = columns[c];
        const val = row[col.id];
        line.push(val == null ? '' : String(val));
      }
      rows2D.push(line.join('\t'));
    }
    return rows2D.join('\n');
  }, [rect, rows, columns]);

  const doPaste = React.useCallback((data2D: string[][]) => {
    if (!rect || !props.onPatch) return;
    const changes: CellChange[] = [];
    const maxR = Math.min(rect.r0 + data2D.length - 1, rowCount - 1);
    const maxC = Math.min(rect.c0 + (data2D[0]?.length ?? 1) - 1, colCount - 1);

    for (let r = rect.r0; r <= maxR; r++) {
      const line = data2D[r - rect.r0] ?? [];
      for (let c = rect.c0; c <= maxC; c++) {
        const txt = line[c - rect.c0] ?? '';
        const row = rows[r];
        const col = columns[c];
        const parsed = col.parse ? col.parse(txt) : coerce(col.type, txt);
        const oldValue = row[col.id];

        if (col.validate) {
          const err = col.validate(parsed, row);
          if (err instanceof Error) {
            blinkCell(row.id, col.id, '#fee2e2');
            continue;
          }
        }

        if (oldValue !== parsed) {
          const ch: CellChange = { rowId: row.id, colId: col.id, oldValue, nextValue: parsed };
          props.onPatch(ch);
          changes.push(ch);
        }
      }
    }
    if (changes.length) {
      history.push({ changes });
      props.onCommit?.();
    }
  }, [rect, props.onPatch, props.onCommit, rows, columns, rowCount, colCount, history]);

  const { onKeyDown, onPaste, onCopy } = useClipboard({
    onCopyText: doCopy,
    onPasteMatrix: doPaste,
    onUndo: () => {
      const action = history.undo();
      if (!action) return;
      applyActionInverse(action);
    },
    onRedo: () => {
      const action = history.redo();
      if (!action) return;
      applyActionForward(action);
    },
  });

  function applyActionForward(action: HistoryAction) {
    if (!props.onPatch) return;
    for (const ch of action.changes) {
      props.onPatch({ rowId: ch.rowId, colId: ch.colId, oldValue: ch.oldValue, nextValue: ch.nextValue });
    }
    props.onCommit?.();
  }

  function applyActionInverse(action: HistoryAction) {
    if (!props.onPatch) return;
    for (const ch of action.changes) {
      props.onPatch({ rowId: ch.rowId, colId: ch.colId, oldValue: ch.nextValue, nextValue: ch.oldValue });
    }
    props.onCommit?.();
  }

  // Klikkhåndtering for seleksjon (enkelt: klikk = single, Shift+klikk = range)
  function handleCellClick(e: React.MouseEvent, rIdx: number, cIdx: number) {
    if (e.shiftKey) {
      setRangeSelection(rIdx, cIdx);
    } else {
      setSingleSelection(rIdx, cIdx);
    }
  }

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onCopy={onCopy}
      style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', outline: 'none' }}
    >
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
        {rows.map((row, rIdx) => (
          <div
            key={row.id}
            style={{
              display: 'grid',
              gridTemplateColumns: columns.map(c => `${c.width ?? 160}px`).join(' '),
              borderBottom: '1px solid #f1f5f9',
              fontSize: 13,
            }}
          >
            {columns.map((col, cIdx) => {
              const selected = isSelectedCell(rIdx, cIdx);
              const isEditing =
                editing && editing.rowId === row.id && editing.colId === col.id;

              return (
                <div
                  key={col.id}
                  data-cell={`${row.id}:${col.id}`}
                  onClick={(e) => handleCellClick(e, rIdx, cIdx)}
                  onDoubleClick={() => startEdit(row, col, rIdx, cIdx)}
                  style={{
                    padding: isEditing ? '3px 6px' : '6px 10px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    background: isEditing ? '#fff' : selected ? '#e6f0ff' : undefined,
                    color: isEditing ? '#111827' : undefined,
                    outline: selected ? '2px solid #93c5fd' : 'none',
                    outlineOffset: selected ? -2 : 0,
                    cursor: 'text',
                  }}
                >
                  {renderCell(row, col, rIdx, cIdx)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function coerce(type: ColumnDef['type'], text: string) {
  switch (type) {
    case 'number':
      return text === '' ? undefined : Number(text);
    case 'date':
      // forventer YYYY-MM-DD
      return text || undefined;
    case 'select':
      return text || '';
    case 'color':
      return text || '#000000';
    default:
      return text;
  }
}
