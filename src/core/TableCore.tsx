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

  const [editing, setEditing] = React.useState<EditingCell | null>(null);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [anchor, setAnchor] = React.useState<{ r: number; c: number } | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [dragRowIdx, setDragRowIdx] = React.useState<number | null>(null);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  const history = useUndoRedo();

  const colCount = renderColumns.length;
  const rowCount = renderRows.length;

  const total = rowCount;
  const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - 6);
  const visibleCount = Math.ceil(bodyHeight / rowHeight) + 12;
  const endIdx = Math.min(total - 1, startIdx + visibleCount - 1);
  const padTop = startIdx * rowHeight;
  const padBottom = Math.max(0, (total - endIdx - 1) * rowHeight);
  const windowRows = renderRows.slice(startIdx, endIdx + 1);

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

  React.useEffect(() => {
    function handleMouseUp() { if (isDragging) setIsDragging(false); }
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [isDragging]);

  function handleCellMouseDown(e: React.MouseEvent, rIdxAbs: number, cIdx: number) {
    e.preventDefault();
    if (cIdx === -1) return; // #-kolonne ikke markerbar
    rootRef.current?.focus();
    if (e.shiftKey) setRangeSelection(rIdxAbs, cIdx);
    else { setSingleSelection(rIdxAbs, cIdx); setIsDragging(true); }
  }

  function handleCellMouseEnter(_e: React.MouseEvent, rIdxAbs: number, cIdx: number) {
    if (!isDragging) return;
    if (cIdx === -1) return;
    setRangeSelection(rIdxAbs, cIdx);
  }

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
    const toId = renderRows[toAbsIdx]?.id;
    if (!fromId || !toId) return;

    const next = [...rowOrder];
    const fromPos = next.indexOf(fromId);
    const toPos = next.indexOf(toId);
    const [moved] = next.splice(fromPos, 1);
    next.splice(toPos, 0, moved);
    setRowOrder(next);
    setDragRowIdx(null);
    props.onReorderRows?.(next);
  }

  const HEADER_BG = '#0f172a';
  const HEADER_FG = '#e5e7eb';
  const BORDER_H = '#1f2937';
  const BORDER_V = '#243041';
  const SEL_OUTLINE = '#93c5fd';
  const SEL_FILL = 'rgba(147, 197, 253, 0.15)';

  const gridCols = `40px ${renderColumns.map(c => `${c.width ?? 160}px`).join(' ')}`;

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      style={{
        border: `1px solid ${BORDER_H}`,
        borderRadius: 0,
        overflow: 'hidden',
        outline: 'none',
        width: '100%',
      }}
    >
      {/* Header row */}
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
            style={{
              padding: '8px 10px',
              borderRight: i === renderColumns.length - 1 ? 'none' : `1px solid ${BORDER_V}`,
              background: HEADER_BG,
            }}
          >
            {col.header}
          </div>
        ))}
      </div>

      {/* Body */}
      <div
        ref={bodyRef}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        style={{ height: bodyHeight, overflow: 'auto', position: 'relative' }}
      >
        <div style={{ height: padTop }} />
        {windowRows.map((row, localIdx) => {
          const rIdxAbs = startIdx + localIdx;
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
              {/* # column with drag handle */}
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
                }}
              >
                {rIdxAbs + 1}
              </div>

              {/* data cells */}
              {renderColumns.map((col, cIdx) => {
                const selected = isSelectedCell(rIdxAbs, cIdx);
                const val = row[col.id];
                const formatted = col.format ? col.format(val, row) : val ?? '';
                return (
                  <div
                    key={col.id}
                    onMouseDown={(e) => handleCellMouseDown(e, rIdxAbs, cIdx)}
                    onMouseEnter={(e) => handleCellMouseEnter(e, rIdxAbs, cIdx)}
                    style={{
                      padding: '6px 10px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      background: selected ? SEL_FILL : undefined,
                      outline: selected ? `1px solid ${SEL_OUTLINE}` : 'none',
                      outlineOffset: selected ? -1 : 0,
                      borderRight: cIdx === renderColumns.length - 1 ? 'none' : `1px solid ${BORDER_V}`,
                      position: freezeFirstColumn && cIdx === 0 ? 'sticky' as const : undefined,
                      left: freezeFirstColumn && cIdx === 0 ? 40 : undefined,
                      zIndex: freezeFirstColumn && cIdx === 0 ? 1 : 0,
                    }}
                  >
                    {formatted}
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
}
