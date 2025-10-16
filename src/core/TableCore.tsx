import React from 'react';
import type { ColumnDef, Selection, KeyBindings } from '../types';
import { TextEditor, NumberEditor, DateEditor, SelectEditor, ColorEditor } from './CellEditors';
import { useClipboard } from './useClipboard';
import { useUndoRedo, HistoryAction, CellChange } from './useUndoRedo';

export type RowLike = { id: string; [key: string]: any };

export type TableCoreProps = {
  columns: ColumnDef[];
  rows: RowLike[];

  /** Tabell-oppsett */
  readonly?: boolean;
  freezeFirstColumn?: boolean;   // frys første kolonne
  enableFilters?: boolean;       // vis filtersrad (default: false)
  rowHeight?: number;            // px, default 32
  bodyHeight?: number;           // px, default 420

  selection?: Selection;
  keymap?: KeyBindings;

  onPatch?: (patch: { rowId: string; colId: string; oldValue: any; nextValue: any }) => void;
  onSelectionChange?: (sel: Selection) => void;
  onCommit?: () => void;

  /** Nye: reorder-events */
  onReorderRows?: (newRowIdOrder: string[]) => void;
  onReorderColumns?: (newColIdOrder: string[]) => void;
};

type EditingCell = { rowId: string; colId: string; draft: any };
type Rect = { r0: number; r1: number; c0: number; c1: number };

export default function TableCore(props: TableCoreProps) {
  const {
    columns,
    rows,
    readonly,
    freezeFirstColumn = true,
    enableFilters = false,   // <— default AV
    rowHeight = 32,
    bodyHeight = 420,
  } = props;

  const [editing, setEditing] = React.useState<EditingCell | null>(null);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [anchor, setAnchor] = React.useState<{ r: number; c: number } | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  // filter-state pr. kolonne (string)
  const [filters, setFilters] = React.useState<Record<string, string>>({});

  // virtuelt vindu
  const [scrollTop, setScrollTop] = React.useState(0);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  const history = useUndoRedo();

  const colCount = columns.length;

  // ---------- Filter ----------
  const filteredRows = React.useMemo(() => {
    const keys = Object.keys(filters).filter(k => (filters[k] ?? '') !== '');
    if (keys.length === 0 || !enableFilters) return rows;

    return rows.filter(r =>
      keys.every(k => {
        const v = r[k];
        const f = (filters[k] || '').toLowerCase();
        const col = columns.find(c => c.id === k);
        const type = col?.type ?? 'text';

        if (type === 'number') {
          const txt = f.replace(/\s/g, '');
          const num = typeof v === 'number' ? v : Number(v);
          if (txt.includes('..')) {
            const [a, b] = txt.split('..').map(Number);
            return !isNaN(a) && !isNaN(b) ? num >= a && num <= b : true;
          }
          if (txt.startsWith('>=')) return num >= Number(txt.slice(2));
          if (txt.startsWith('<=')) return num <= Number(txt.slice(2));
          if (txt.startsWith('>'))  return num >  Number(txt.slice(1));
          if (txt.startsWith('<'))  return num <  Number(txt.slice(1));
          return String(v ?? '').toLowerCase().includes(f);
        }

        if (type === 'date') {
          const s = String(v ?? '');
          if (f.includes('..')) {
            const [a, b] = f.split('..');
            return (a ? s >= a : true) && (b ? s <= b : true);
          }
          return s.includes(f);
        }

        return String(v ?? '').toLowerCase().includes(f);
      })
    );
  }, [rows, filters, columns, enableFilters]);

  // ---------- Virtualisering ----------
  const total = filteredRows.length;
  const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - 6);
  const visibleCount = Math.ceil(bodyHeight / rowHeight) + 12;
  const endIdx = Math.min(total - 1, startIdx + visibleCount - 1);
  const padTop = startIdx * rowHeight;
  const padBottom = Math.max(0, (total - endIdx - 1) * rowHeight);
  const windowRows = filteredRows.slice(startIdx, endIdx + 1);

  // ---------- Selection helpers ----------
  function clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v));
  }

  function setSingleSelection(r: number, c: number) {
    const rIdx = clamp(r, 0, filteredRows.length - 1);
    const cIdx = clamp(c, 0, colCount - 1);
    setAnchor({ r: rIdx, c: cIdx });
    setRect({ r0: rIdx, r1: rIdx, c0: cIdx, c1: cIdx });
    props.onSelectionChange?.({ rows: [rIdx], cols: [cIdx] });
  }

  function setRangeSelection(r: number, c: number) {
    if (!anchor) return setSingleSelection(r, c);
    const rIdx = clamp(r, 0, filteredRows.length - 1);
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

  // ---------- Drag-to-select ----------
  React.useEffect(() => {
    function handleMouseUp() { if (isDragging) setIsDragging(false); }
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [isDragging]);

  function handleCellMouseDown(e: React.MouseEvent, rIdxAbs: number, cIdx: number) {
    e.preventDefault();
    rootRef.current?.focus();
    if (e.shiftKey) setRangeSelection(rIdxAbs, cIdx);
    else { setSingleSelection(rIdxAbs, cIdx); setIsDragging(true); }
  }

  function handleCellMouseEnter(_e: React.MouseEvent, rIdxAbs: number, cIdx: number) {
    if (!isDragging) return;
    setRangeSelection(rIdxAbs, cIdx);
  }

  // ---------- Editing ----------
  function startEditByIndex(rIdxAbs: number, cIdx: number) {
    if (readonly) return;
    const row = filteredRows[rIdxAbs];
    if (!row) return;
    const col = columns[cIdx];
    const editable = col.editable ? !!col.editable(row) : true;
    if (!editable) return;
    setEditing({ rowId: row.id, colId: col.id, draft: row[col.id] });
  }

  function startEdit(rIdxAbs: number, cIdx: number) {
    if (isDragging) return;
    setSingleSelection(rIdxAbs, cIdx);
    startEditByIndex(rIdxAbs, cIdx);
  }

  function cancelEdit() { setEditing(null); }

  function commitSingleEdit() {
    if (!editing) return;
    const { rowId, colId, draft } = editing;
    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    const col = columns.find(c => c.id === colId)!;
    const oldValue = row[colId];

    if (col.validate) {
      const err = col.validate(draft, row);
      if (err instanceof Error) { blinkCell(rowId, colId, '#fee2e2'); return; }
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
    const el = bodyRef.current?.querySelector<HTMLDivElement>(`[data-cell="${rowId}:${colId}"]`);
    if (!el) return;
    const prev = el.style.backgroundColor;
    el.style.backgroundColor = color;
    setTimeout(() => (el.style.backgroundColor = prev), 250);
  }

  function renderCell(row: RowLike, col: ColumnDef, rIdxAbs: number, cIdx: number) {
    const raw = row[col.id];
    const formatted = col.format ? col.format(raw, row) : raw == null ? '' : String(raw);
    const isEditing = editing && editing.rowId === row.id && editing.colId === col.id;

    if (readonly) return <span>{formatted}</span>;

    if (!isEditing) return <div onDoubleClick={() => startEdit(rIdxAbs, cIdx)} style={{ cursor: 'text' }}>{formatted}</div>;

    const commonProps = {
      value: editing!.draft,
      autoFocus: true,
      onChange: (v: any) => setEditing(ec => (ec ? { ...ec, draft: v } : ec)),
      onEnter: commitSingleEdit,
      onEscape: cancelEdit,
      onBlur: commitSingleEdit,
    };

    switch (col.type) {
      case 'number': return <NumberEditor {...commonProps} />;
      case 'date':   return <DateEditor   {...commonProps} />;
      case 'select': return <SelectEditor {...commonProps} options={col.options ?? []} />;
      case 'color':  return <ColorEditor  {...commonProps} />;
      default:       return <TextEditor   {...commonProps} />;
    }
  }

  // ---------- Keyboard / Clipboard / Delete / Navigasjon ----------
  React.useEffect(() => { root
