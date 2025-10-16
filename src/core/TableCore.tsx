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
  freezeFirstColumn?: boolean;
  rowHeight?: number;
  bodyHeight?: number;
  selection?: Selection;
  keymap?: KeyBindings;
  onPatch?: (patch: { rowId: string; colId: string; oldValue: any; nextValue: any }) => void;
  onSelectionChange?: (sel: Selection) => void;
  onCommit?: () => void;
  onReorderRows?: (rowIdsInNewOrder: string[]) => void;
  onReorderColumns?: (colIdsInNewOrder: string[]) => void;
};

type EditingCell = { rowId: string; colId: string; draft: any };
type Rect = { r0: number; r1: number; c0: number; c1: number };

export default function TableCore(props: TableCoreProps) {
  const {
    columns,
    rows,
    readonly,
    freezeFirstColumn = true,
    rowHeight = 32,
    bodyHeight = 420,
  } = props;

  // Orden
  const [colOrder, setColOrder] = React.useState<string[]>(() => columns.map(c => c.id));
  const [rowOrder, setRowOrder] = React.useState<string[]>(() => rows.map(r => r.id));
  React.useEffect(() => {
    setColOrder(prev => {
      const incoming = columns.map(c => c.id);
      const kept = prev.filter(id => incoming.includes(id));
      const added = incoming.filter(id => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [columns]);
  React.useEffect(() => {
    setRowOrder(prev => {
      const incoming = rows.map(r => r.id);
      const kept = prev.filter(id => incoming.includes(id));
      const added = incoming.filter(id => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [rows]);

  const renderColumns: ColumnDef[] = React.useMemo(
    () => colOrder.map(id => columns.find(c => c.id === id)!).filter(Boolean),
    [colOrder, columns]
  );
  const renderRows: RowLike[] = React.useMemo(
    () => rowOrder.map(id => rows.find(r => r.id === id)!).filter(Boolean),
    [rowOrder, rows]
  );

  // UI-state
  const [editing, setEditing] = React.useState<EditingCell | null>(null);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [anchor, setAnchor] = React.useState<{ r: number; c: number } | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [dragRowIdx, setDragRowIdx] = React.useState<number | null>(null);
  const [dragColIdx, setDragColIdx] = React.useState<number | null>(null);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  const history = useUndoRedo();

  const colCount = renderColumns.length;
  const rowCount = renderRows.length;

  // Virtualisering
  const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - 6);
  const visibleCount = Math.ceil(bodyHeight / rowHeight) + 12;
  const endIdx = Math.min(rowCount - 1, startIdx + visibleCount - 1);
  const padTop = startIdx * rowHeight;
  const padBottom = Math.max(0, (rowCount - endIdx - 1) * rowHeight);
  const windowRows = renderRows.slice(startIdx, endIdx + 1);

  // Seleksjon
  function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
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
    setRect({
      r0: Math.min(anchor.r, rIdx),
      r1: Math.max(anchor.r, rIdx),
      c0: Math.min(anchor.c, cIdx),
      c1: Math.max(anchor.c, cIdx),
    });
    const rowsA = Array.from({ length: Math.abs(rIdx - anchor.r) + 1 }, (_, i) => Math.min(anchor.r, rIdx) + i);
    const colsA = Array.from({ length: Math.abs(cIdx - anchor.c) + 1 }, (_, i) => Math.min(anchor.c, cIdx) + i);
    props.onSelectionChange?.({ rows: rowsA, cols: colsA });
  }
  function isSelectedCell(r: number, c: number) {
    if (!rect) return false;
    return r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1;
  }

  // Mouse markering
  React.useEffect(() => {
    function handleMouseUp() { if (isDragging) setIsDragging(false); }
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [isDragging]);
  function handleCellMouseDown(e: React.MouseEvent, rIdxAbs: number, cIdx: number) {
    e.preventDefault();
    if (cIdx === -1) return; // #-kolonnen ikke markerbar
    rootRef.current?.focus();
    if (e.shiftKey) setRangeSelection(rIdxAbs, cIdx);
    else { setSingleSelection(rIdxAbs, cIdx); setIsDragging(true); }
  }
  function handleCellMouseEnter(_e: React.MouseEvent, rIdxAbs: number, cIdx: number) {
    if (!isDragging) return;
    if (cIdx === -1) return;
    setRangeSelection(rIdxAbs, cIdx);
  }

  // RAD drag/slipp (via #)
  function onRowDragStart(e: React.DragEvent, fromAbsIdx: number) {
    setDragRowIdx(fromAbsIdx);
    e.dataTransfer.setData('text/plain', String(fromAbsIdx));
    e.dataTransfer.effectAllowed = 'move';
  }
  function onRowDragOver(e: React.DragEvent) { e.preventDefault(); }
  function onRowDrop(e: React.DragEvent, toAbsIdx: number) {
    e.preventDefault();
    const fromAbsIdx = dragRowIdx ?? Number(e.dataTransfer.getData('text/plain'));
    if (isNaN(fromAbsIdx) || fromAbsIdx === toAbsIdx) return;
    const fromId = renderRows[fromAbsIdx]?.id;
    const toId   = renderRows[toAbsIdx]?.id;
    if (!fromId || !toId) return;

    const next = [...rowOrder];
    const fromPos = next.indexOf(fromId);
    const toPos   = next.indexOf(toId);
    if (fromPos === -1 || toPos === -1) return;
    const [moved] = next.splice(fromPos, 1);
    next.splice(toPos, 0, moved);
    setRowOrder(next);
    setDragRowIdx(null);
    props.onReorderRows?.(next);
  }

  // KOLONNE drag/slipp (via header)
  function onHeaderDragStart(e: React.DragEvent, fromIdx: number) {
    setDragColIdx(fromIdx);
    e.dataTransfer.setData('text/plain', String(fromIdx));
    e.dataTransfer.effectAllowed = 'move';
  }
  function onHeaderDragOver(e: React.DragEvent) { e.preventDefault(); }
  function onHeaderDrop(e: React.DragEvent, toIdx: number) {
    e.preventDefault();
    const fromIdx = dragColIdx ?? Number(e.dataTransfer.getData('text/plain'));
    if (isNaN(fromIdx) || fromIdx === toIdx) return;
    const next = [...colOrder];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setColOrder(next);
    setDragColIdx(null);
    props.onReorderColumns?.(next);
  }

  // Redigering
  function startEditByIndex(rIdxAbs: number, cIdx: number) {
    if (readonly) return;
    const row = renderRows[rIdxAbs];
    if (!row) return;
    const col = renderColumns[cIdx];
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
    if (!isEditing) {
      return <div onDoubleClick={() => startEdit(rIdxAbs, cIdx)} style={{ cursor: 'text' }}>{formatted}</div>;
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
      case 'number': return <NumberEditor {...commonProps} />;
      case 'date':   return <DateEditor   {...commonProps} />;
      case 'select': return <SelectEditor {...commonProps} options={col.options ?? []} />;
      case 'color':  return <ColorEditor  {...commonProps} />;
      default:       return <TextEditor   {...commonProps} />;
    }
  }

  // Clipboard / navigasjon
  React.useEffect(() => { rootRef.current?.focus(); }, [rows.length]);
  const doCopy = React.useCallback(() => {
    if (!rect) return '';
    const out: string[] = [];
    for (let r = rect.r0; r <= rect.r1; r++) {
      const row = renderRows[r];
      const line: string[] = [];
      for (let c = rect.c0; c <= rect.c1; c++) {
        const col = renderColumns[c];
        const val = row[col.id];
        line.push(val == null ? '' : String(val));
      }
      out.push(line.join('\t'));
    }
    return out.join('\n');
  }, [rect, renderRows, renderColumns]);

  const doPaste = React.useCallback((data2D: string[][]) => {
    if (!rect || !props.onPatch) return;
    const changes: CellChange[] = [];
    const maxR = Math.min(rect.r0 + data2D.length - 1, rowCount - 1);
    const maxC = Math.min(rect.c0 + (data2D[0]?.length ?? 1) - 1, colCount - 1);
    for (let r = rect.r0; r <= maxR; r++) {
      const row = renderRows[r];
      const line = data2D[r - rect.r0] ?? [];
      for (let c = rect.c0; c <= maxC; c++) {
        const txt = line[c - rect.c0] ?? '';
        const col = renderColumns[c];
        const parsed = col.parse ? col.parse(txt) : coerce(col.type, txt);
        const oldValue = row[col.id];
        if (col.validate) {
          const err = col.validate(parsed, row);
          if (err instanceof Error) { blinkCell(row.id, col.id, '#fee2e2'); continue; }
        }
        if (oldValue !== parsed) {
          const ch: CellChange = { rowId: row.id, colId: col.id, oldValue, nextValue: parsed };
          props.onPatch(ch);
          changes.push(ch);
        }
      }
    }
    if (changes.length) { history.push({ changes }); props.onCommit?.(); }
  }, [rect, props.onPatch, props.onCommit, renderRows, renderColumns, colCount, rowCount, history]);

  const { onKeyDown: onClipboardKeys, onPaste, onCopy } = useClipboard({
    onCopyText: doCopy,
    onPasteMatrix: doPaste,
    onUndo: () => { const a = history.undo(); if (a) applyActionInverse(a); },
    onRedo: () => { const a = history.redo(); if (a) applyActionForward(a); },
  });

  function clearSelectionWithDelete() {
    if (!rect || !props.onPatch) return;
    const changes: CellChange[] = [];
    for (let r = rect.r0; r <= rect.r1; r++) {
      const row = renderRows[r];
      for (let c = rect.c0; c <= rect.c1; c++) {
        const col = renderColumns[c];
        const oldValue = row[col.id];
        const nextValue = emptyFor(col.type);
        if (oldValue !== nextValue) {
          props.onPatch({ rowId: row.id, colId: col.id, oldValue, nextValue });
          changes.push({ rowId: row.id, colId: col.id, oldValue, nextValue });
        }
      }
    }
    if (changes.length) { history.push({ changes }); props.onCommit?.(); }
  }
  function moveCursor(dr: number, dc: number) {
    if (!rect) return;
    const r = clamp((dr >= 0 ? rect.r1 : rect.r0) + dr, 0, rowCount - 1);
    const c = clamp((dc >= 0 ? rect.c1 : rect.c0) + dc, 0, colCount - 1);
    setSingleSelection(r, c);
    const y = r * rowHeight;
    const body = bodyRef.current!;
    if (y < body.scrollTop) body.scrollTop = y;
    else if (y + rowHeight > body.scrollTop + body.clientHeight) body.scrollTop = y - body.clientHeight + rowHeight;
  }
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    onClipboardKeys(e);
    if (e.defaultPrevented) return;
    const isMac = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
    const ctrl = isMac ? e.metaKey : e.ctrlKey;

    if (e.key === 'Delete') { e.preventDefault(); clearSelectionWithDelete(); return; }
    if (e.key === 'Tab')    { e.preventDefault(); moveCursor(0, e.shiftKey ? -1 : 1); return; }
    if (e.key === 'Enter')  { e.preventDefault(); moveCursor(e.shiftKey ? -1 : 1, 0); return; }
    if (e.key === 'ArrowUp')    { e.preventDefault(); moveCursor(-1,  0); return; }
    if (e.key === 'ArrowDown')  { e.preventDefault(); moveCursor( 1,  0); return; }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); moveCursor( 0, -1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); moveCursor( 0,  1); return; }
    if (ctrl && e.key.toLowerCase() === 'enter') { if (rect) startEdit(rect.r0, rect.c0); }
  }
  function applyActionForward(action: HistoryAction) {
    if (!props.onPatch) return;
    for (const ch of action.changes) props.onPatch({ rowId: ch.rowId, colId: ch.colId, oldValue: ch.oldValue, nextValue: ch.nextValue });
    props.onCommit?.();
  }
  function applyActionInverse(action: HistoryAction) {
    if (!props.onPatch) return;
    for (const ch of action.changes) props.onPatch({ rowId: ch.rowId, colId: ch.colId, oldValue: ch.nextValue, nextValue: ch.oldValue });
    props.onCommit?.();
  }

  // Render helpers
  const HEADER_BG = '#0f172a';
  const HEADER_FG = '#e5e7eb';
  const BORDER_H  = '#1f2937';
  const BORDER_V  = '#243041';
  const SEL_OUTLINE = '#93c5fd';
  const SEL_FILL    = 'rgba(147, 197, 253, 0.15)';

  const gridCols = `40px ${renderColumns.map(c => `${c.width ?? 160}px`).join(' ')}`;

  function hasValue(v: any) {
    if (v === null || v === undefined) return false;
    if (typeof v === 'string') return v.trim() !== '';
    return true;
  }
  function isRowEmpty(row: RowLike) {
    return renderColumns.every(col => !hasValue(row[col.id]));
  }

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPaste={onPaste}
      onCopy={onCopy}
      style={{
        border: `1px solid ${BORDER_H}`,
        borderRadius: 0,
        overflow: 'hidden',
        outline: 'none',
        width: '100%',
      }}
    >
      {/* Header (draggable columns) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: gridCols,
          background: HEADER_BG,
          color: HEADER_FG,
          borderBottom: `1px solid ${BORDER_H}`,
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        <div style={{
          padding: '8px 6px',
          textAlign: 'center',
          borderRight: `1px solid ${BORDER_V}`,
          position: 'sticky',
          left: 0,
          zIndex: 3,
        }}>#</div>
        {renderColumns.map((col, i) => (
          <div
            key={col.id}
            draggable
            onDragStart={(e) => onHeaderDragStart(e, i)}
            onDragOver={onHeaderDragOver}
            onDrop={(e) => onHeaderDrop(e, i)}
            title="Dra for å flytte kolonne"
            style={{
              padding: '8px 10px',
              borderRight: i === renderColumns.length - 1 ? 'none' : `1px solid ${BORDER_V}`,
              background: HEADER_BG,
              cursor: 'grab',
            }}
          >
            {col.header}
          </div>
        ))}
      </div>

      {/* Body (virtualized) */}
      <div
        ref={bodyRef}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        style={{ height: bodyHeight, overflow: 'auto', position: 'relative' }}
      >
        <div style={{ height: padTop }} />
        {windowRows.map((row, localIdx) => {
          const rIdxAbs = startIdx + localIdx;
          const rowIsEmpty = isRowEmpty(row);
          return (
            <div
              key={row.id}
              onDragOver={onRowDragOver}
              onDrop={(e) => onRowDrop(e, rIdxAbs)}
              style={{
                display: 'grid',
                gridTemplateColumns: gridCols,
                borderBottom: `1px solid ${BORDER_H}`,
                fontSize: 13,
                height: rowHeight,
                lineHeight: `${rowHeight - 12}px`,
              }}
            >
              {/* # kolonne */}
              <div
                draggable
                onDragStart={(e) => onRowDragStart(e, rIdxAbs)}
                title="Dra for å flytte rad"
                style={{
                  textAlign: 'center',
                  color: '#9ca3af',
                  borderRight: `1px solid ${BORDER_V}`,
                  cursor: 'grab',
                  position: 'sticky',
                  left: 0,
                  background: '#111827',
                  zIndex: 2,
                  userSelect: 'none',
                }}
              >
                {rowIsEmpty ? '' : (rIdxAbs + 1)}
              </div>

              {/* data-celler */}
              {renderColumns.map((col, cIdx) => {
                const selected = isSelectedCell(rIdxAbs, cIdx);
                const isEditing = editing && editing.rowId === row.id && editing.colId === col.id;

                return (
                  <div
                    key={col.id}
                    data-cell={`${row.id}:${col.id}`}
                    onMouseDown={(e) => handleCellMouseDown(e, rIdxAbs, cIdx)}
                    onMouseEnter={(e) => handleCellMouseEnter(e, rIdxAbs, cIdx)}
                    onDoubleClick={() => startEdit(rIdxAbs, cIdx)}
                    style={{
                      padding: isEditing ? '3px 6px' : '6px 10px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      background: isEditing ? '#fff' : selected ? SEL_FILL : undefined,
                      color: isEditing ? '#111827' : undefined,
                      outline: selected ? `1px solid ${SEL_OUTLINE}` : 'none',
                      outlineOffset: selected ? -1 : 0,
                      borderRight: cIdx === renderColumns.length - 1 ? 'none' : `1px solid ${BORDER_V}`,
                      position: freezeFirstColumn && cIdx === 0 ? 'sticky' as const : undefined,
                      left: freezeFirstColumn && cIdx === 0 ? 40 : undefined, // tar hensyn til # = 40px
                      zIndex: freezeFirstColumn && cIdx === 0 ? 1 : 0,
                      backgroundClip: 'padding-box',
                    }}
                  >
                    {renderCell(row, col, rIdxAbs, cIdx)}
                  </div>
                );
              })}
            </div>
          );
        })}
        <div style={{ height: padBottom }} />
      </div>
    </div>
  );

  /* helpers */
  function coerce(type: ColumnDef['type'], text: string) {
    switch (type) {
      case 'number': return text === '' ? undefined : Number(text.replace(',', '.'));
      case 'date':   return text || undefined;
      case 'select': return text || '';
      case 'color':  return text || '#000000';
      default:       return text;
    }
  }
  function emptyFor(type: ColumnDef['type']) {
    switch (type) {
      case 'number': return undefined;
      case 'date':   return undefined;
      case 'select': return '';
      case 'color':  return '#000000';
      default:       return '';
    }
  }
}
