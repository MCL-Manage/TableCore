import React from 'react';
import type { ColumnDef, Selection, KeyBindings } from '../types';
import { TextEditor, NumberEditor, DateEditor, SelectEditor, ColorEditor } from './CellEditors';
import { useClipboard } from './useClipboard';
import { useUndoRedo, CellChange, HistoryAction } from './useUndoRedo';

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
  onPatch?: (patch: CellChange) => void;
  onSelectionChange?: (sel: Selection) => void;
  onCommit?: () => void;
  onReorderRows?: (rowIds: string[]) => void;
  onReorderColumns?: (colIds: string[]) => void;

  // --- Tree/summary-utvidelser ---
  treeMode?: boolean;
  showSummaries?: boolean;
  getParentId?: (row: RowLike) => string | null;
  getRowType?: (row: RowLike) => 'data' | 'summary';
};

type EditingCell = { rowId: string; colId: string; draft: any };
type Rect = { r0: number; r1: number; c0: number; c1: number };

type VisibleRow = {
  row: RowLike;
  level: number;
  hasChildren: boolean;
  isSummary: boolean;
};

const PARENT_COL_ID = 'parentId';

export default function TableCore(props: TableCoreProps) {
  const {
    columns,
    rows,
    readonly,
    freezeFirstColumn = true,
    rowHeight = 32,
    bodyHeight = 420,
    treeMode = false,
    showSummaries = true,
    getParentId = (r: RowLike) => (r.parentId ?? null),
    getRowType = (_r: RowLike) => 'data',
  } = props;

  // Små CSS for editorne: transparent bakgrunn i dark-mode
  // (påvirker input/textarea som rendres av CellEditors)
  const editorCss = `
    .tc-editor input, .tc-editor textarea, .tc-editor select {
      background: transparent !important;
      color: inherit !important;
      border-color: #374151;
    }
    .tc-editor input:focus, .tc-editor textarea:focus, .tc-editor select:focus {
      outline: none;
      box-shadow: none;
      border-color: #93c5fd;
    }
  `;

  // ----- Orden (kolonner/rader) -----
  const [colOrder, setColOrder] = React.useState(() => columns.map(c => c.id));
  const [rowOrder, setRowOrder] = React.useState(() => rows.map(r => r.id));
  React.useEffect(() => {
    const inc = columns.map(c => c.id);
    setColOrder(prev => [...prev.filter(id => inc.includes(id)), ...inc.filter(id => !prev.includes(id))]);
  }, [columns]);
  React.useEffect(() => {
    const inc = rows.map(r => r.id);
    setRowOrder(prev => [...prev.filter(id => inc.includes(id)), ...inc.filter(id => !prev.includes(id))]);
  }, [rows]);

  const allCols = colOrder.map(id => columns.find(c => c.id === id)!).filter(Boolean);

  // ----- Build tree + visible list -----
  const idToRow = React.useMemo(() => {
    const m = new Map<string, RowLike>();
    for (const r of rows) m.set(r.id, r);
    return m;
  }, [rows]);

  const parentOf = React.useMemo(() => {
    const m = new Map<string, string | null>();
    for (const r of rows) m.set(r.id, getParentId(r));
    return m;
  }, [rows, getParentId]);

  const childrenOf = React.useMemo(() => {
    const m = new Map<string | null, string[]>();
    function add(parent: string | null, id: string) {
      const arr = m.get(parent) ?? [];
      arr.push(id);
      m.set(parent, arr);
    }
    for (const id of rowOrder) {
      const r = idToRow.get(id);
      if (!r) continue;
      const p = getParentId(r);
      add(p, id);
    }
    return m;
  }, [rowOrder, idToRow, getParentId]);

  // expanded state
  const [expanded, setExpanded] = React.useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const id of rowOrder) {
      const hasKids = (childrenOf.get(id)?.length ?? 0) > 0;
      if (hasKids) s.add(id);
    }
    return s;
  });
  React.useEffect(() => {
    setExpanded(prev => {
      const next = new Set(prev);
      for (const id of rowOrder) {
        const hasKids = (childrenOf.get(id)?.length ?? 0) > 0;
        if (hasKids && !next.has(id)) next.add(id);
      }
      return next;
    });
  }, [rowOrder, childrenOf]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const visible: VisibleRow[] = React.useMemo(() => {
    if (!treeMode) {
      return rowOrder
        .map(id => idToRow.get(id))
        .filter(Boolean)
        .map(r => ({ row: r!, level: 0, hasChildren: false, isSummary: getRowType(r!) === 'summary' }))
        .filter(v => showSummaries || !v.isSummary);
    }
    const out: VisibleRow[] = [];
    function walk(id: string, level: number) {
      const r = idToRow.get(id);
      if (!r) return;
      const kids = childrenOf.get(id) ?? [];
      const isSummary = getRowType(r) === 'summary';
      const hasChildren = kids.length > 0;
      if (!(isSummary && !showSummaries)) out.push({ row: r, level, hasChildren, isSummary });
      if (hasChildren && expanded.has(id)) {
        for (const cid of kids) walk(cid, level + 1);
      }
    }
    const roots = childrenOf.get(null) ?? [];
    for (const rid of roots) walk(rid, 0);
    return out;
  }, [treeMode, rowOrder, idToRow, childrenOf, expanded, getRowType, showSummaries]);

  // ----- UI-state -----
  const [editing, setEditing] = React.useState<EditingCell | null>(null);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [anchor, setAnchor] = React.useState<{ r: number; c: number } | null>(null);

  const [isDraggingRange, setIsDraggingRange] = React.useState(false);
  const dragStartRef = React.useRef<{ x: number; y: number; r: number; c: number } | null>(null);

  const [scrollTop, setScrollTop] = React.useState(0);
  const [dragRowIdx, setDragRowIdx] = React.useState<number | null>(null);
  const [dragColIdx, setDragColIdx] = React.useState<number | null>(null);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  const history = useUndoRedo();

  // ----- Virtualisering (på synlige rader) -----
  const rowCount = visible.length;
  const colCount = allCols.length;

  const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - 6);
  const visibleCount = Math.ceil(bodyHeight / rowHeight) + 12;
  const endIdx = Math.min(rowCount - 1, startIdx + visibleCount - 1);
  const padTop = startIdx * rowHeight;
  const padBottom = Math.max(0, (rowCount - endIdx - 1) * rowHeight);
  const windowRows = visible.slice(startIdx, endIdx + 1);

  // ----- Seleksjon -----
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  function setSingle(r: number, c: number) {
    const rIdx = clamp(r, 0, rowCount - 1);
    const cIdx = clamp(c, 0, colCount - 1);
    setAnchor({ r: rIdx, c: cIdx });
    setRect({ r0: rIdx, r1: rIdx, c0: cIdx, c1: cIdx });
    props.onSelectionChange?.({ rows: [rIdx], cols: [cIdx] });
  }
  function setRange(r: number, c: number) {
    if (!anchor) return setSingle(r, c);
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
  const isSel = (r: number, c: number) => !!rect && r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1;

  // Global mouse-up: skiller klikk vs. drag (4px terskel)
  React.useEffect(() => {
    function onMouseUp(e: MouseEvent) {
      const st = dragStartRef.current;
      if (!st) return;
      const dx = Math.abs(e.clientX - st.x);
      const dy = Math.abs(e.clientY - st.y);
      const moved = dx > 4 || dy > 4;
      if (!moved && !editing) startEdit(st.r, st.c);
      setIsDraggingRange(false);
      dragStartRef.current = null;
    }
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [editing]);

  // ----- Redigering -----
  function startEdit(rIdxAbs: number, cIdx: number) {
    if (readonly) return;
    const v = visible[rIdxAbs];
    if (!v) return;
    if (v.isSummary) return;
    const row = v.row;
    const col = allCols[cIdx];
    if (!row || !col) return;
    const editable = col.editable ? !!col.editable(row) : true;
    if (!editable) return;
    setEditing({ rowId: row.id, colId: col.id, draft: row[col.id] });
  }
  function commitEdit() {
    if (!editing) return;
    const { rowId, colId, draft } = editing;
    const row = rows.find(r => r.id === rowId);
    if (!row) { setEditing(null); return; }
    const old = row[colId];
    if (props.onPatch && old !== draft) props.onPatch({ rowId, colId, oldValue: old, nextValue: draft });
    history.push({ changes: [{ rowId, colId, oldValue: old, nextValue: draft }] });
    props.onCommit?.();
    setEditing(null);
  }
  function cancelEdit() { setEditing(null); }
  function renderEditor(col: ColumnDef, draft: any, setDraft: (v: any) => void) {
    const common = { value: draft, autoFocus: true, onChange: setDraft, onEnter: commitEdit, onEscape: cancelEdit, onBlur: commitEdit };
    switch (col.type) {
      case 'number': return <div className="tc-editor"><NumberEditor {...common} /></div>;
      case 'date':   return <div className="tc-editor"><DateEditor {...common} /></div>;
      case 'select': return <div className="tc-editor"><SelectEditor {...common} options={col.options ?? []} /></div>;
      case 'color':  return <div className="tc-editor"><ColorEditor {...common} /></div>;
      default:       return <div className="tc-editor"><TextEditor {...common} /></div>;
    }
  }

  // ----- Clipboard / Undo/Redo -----
  const doCopy = React.useCallback(() => {
    if (!rect) return '';
    const out: string[] = [];
    for (let r = rect.r0; r <= rect.r1; r++) {
      const row = visible[r].row;
      const line: string[] = [];
      for (let c = rect.c0; c <= rect.c1; c++) {
        const col = allCols[c];
        const val = row[col.id];
        line.push(val == null ? '' : String(val));
      }
      out.push(line.join('\t'));
    }
    return out.join('\n');
  }, [rect, visible, allCols]);

  const doPaste = React.useCallback((data2D: string[][]) => {
    if (!rect || !props.onPatch) return;
    const changes: CellChange[] = [];
    const maxR = Math.min(rect.r0 + data2D.length - 1, rowCount - 1);
    const maxC = Math.min(rect.c0 + (data2D[0]?.length ?? 1) - 1, colCount - 1);
    for (let r = rect.r0; r <= maxR; r++) {
      const row = visible[r].row;
      const line = data2D[r - rect.r0] ?? [];
      for (let c = rect.c0; c <= maxC; c++) {
        const txt = line[c - rect.c0] ?? '';
        const col = allCols[c];
        const parsed = col.parse ? col.parse(txt) : coerce(col.type, txt);
        const old = row[col.id];
        if (col.validate) {
          const err = col.validate(parsed, row);
          if (err instanceof Error) continue;
        }
        if (old !== parsed) {
          const ch: CellChange = { rowId: row.id, colId: col.id, oldValue: old, nextValue: parsed };
          props.onPatch(ch);
          changes.push(ch);
        }
      }
    }
    if (changes.length) { history.push({ changes }); props.onCommit?.(); }
  }, [rect, props.onPatch, props.onCommit, visible, allCols, colCount, rowCount, history]);

  const { onKeyDown: onClipboardKeys, onPaste, onCopy } = useClipboard({
    onCopyText: doCopy,
    onPasteMatrix: doPaste,
    onUndo: () => { const a = history.undo(); if (a) applyActionInverse(a); },
    onRedo: () => { const a = history.redo(); if (a) applyActionForward(a); },
  });

  // ----- Delete / Navigasjon + TREE HOTKEYS -----
  function clearSelectionWithDelete() {
    if (!rect || !props.onPatch) return;
    const changes: CellChange[] = [];
    for (let r = rect.r0; r <= rect.r1; r++) {
      const row = visible[r].row;
      for (let c = rect.c0; c <= rect.c1; c++) {
        const col = allCols[c];
        const old = row[col.id];
        const next = emptyFor(col.type);
        if (old !== next) {
          props.onPatch({ rowId: row.id, colId: col.id, oldValue: old, nextValue: next });
          changes.push({ rowId: row.id, colId: col.id, oldValue: old, nextValue: next });
        }
      }
    }
    if (changes.length) { history.push({ changes }); props.onCommit?.(); }
  }

  function moveCursor(dr: number, dc: number) {
    if (!rect) return;
    const r = clamp((dr >= 0 ? rect.r1 : rect.r0) + dr, 0, rowCount - 1);
    const c = clamp((dc >= 0 ? rect.c1 : rect.c0) + dc, 0, colCount - 1);
    setSingle(r, c);
    const y = r * rowHeight;
    const body = bodyRef.current!;
    if (y < body.scrollTop) body.scrollTop = y;
    else if (y + rowHeight > body.scrollTop + body.clientHeight) body.scrollTop = y - body.clientHeight + rowHeight;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    onClipboardKeys(e);
    if (e.defaultPrevented) return;

    if (editing) {
      if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
      return;
    }

    const isMac = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
    const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

    // Vanlige grid-taster
    if (e.key === 'Delete') { e.preventDefault(); clearSelectionWithDelete(); return; }
    if (e.key === 'Tab')    { e.preventDefault(); moveCursor(0, e.shiftKey ? -1 : 1); return; }
    if (e.key === 'Enter')  { e.preventDefault(); if (rect) startEdit(rect.r0, rect.c0); return; }

    // Navigasjon med piltaster (ALLTID navigasjon nå)
    if (e.key === 'ArrowUp')    { e.preventDefault(); moveCursor(-1,  0); return; }
    if (e.key === 'ArrowDown')  { e.preventDefault(); moveCursor( 1,  0); return; }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); moveCursor( 0, -1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); moveCursor( 0,  1); return; }

    if (!treeMode) return;

    // --- Tree-modus: Ctrl/Cmd + venstre/høyre = kollaps/ekspander
    const selIdx = rect?.r0 ?? 0;
    const v = visible[selIdx];
    if (!v) return;

    if (ctrlOrCmd && e.key === 'ArrowRight') {
      e.preventDefault();
      if (v.hasChildren && !expanded.has(v.row.id)) toggleExpand(v.row.id);
      return;
    }
    if (ctrlOrCmd && e.key === 'ArrowLeft') {
      e.preventDefault();
      if (v.hasChildren && expanded.has(v.row.id)) toggleExpand(v.row.id);
      return;
    }

    // Alt+pil = strukturell flytting
    if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      indentRow(v.row.id, selIdx);
      return;
    }
    if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      outdentRow(v.row.id);
      return;
    }
    if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault();
      moveRowWithinParent(v.row.id, -1);
      return;
    }
    if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault();
      moveRowWithinParent(v.row.id, +1);
      return;
    }
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

  // ----- Render helpers -----
  const HEADER_BG = '#0f172a', HEADER_FG = '#e5e7eb';
  const BORDER_H = '#1f2937', BORDER_V = '#243041';
  const SEL_OUT = '#93c5fd', SEL_FILL = 'rgba(147,197,253,0.15)';
  const gridCols = `40px ${allCols.map(c => `${c.width ?? 160}px`).join(' ')}`;
  const isEmptyRow = (r: RowLike) => allCols.every(c => {
    const v = r[c.id];
    return v === null || v === undefined || (typeof v === 'string' ? v.trim() === '' : false);
  });

  // ----- Cellehendelser -----
  function onCellMouseDown(e: React.MouseEvent, rAbs: number, cIdx: number) {
    if (cIdx === -1) return;
    e.preventDefault();
    rootRef.current?.focus();
    setSingle(rAbs, cIdx);
    setIsDraggingRange(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, r: rAbs, c: cIdx };
  }
  function onCellMouseEnter(_e: React.MouseEvent, rAbs: number, cIdx: number) {
    if (!isDraggingRange) return;
    if (cIdx === -1) return;
    setRange(rAbs, cIdx);
  }
  function onCellDoubleClick(_e: React.MouseEvent, rAbs: number, cIdx: number) {
    startEdit(rAbs, cIdx);
    setTimeout(() => {
      const el = bodyRef.current?.querySelector('input, textarea, select') as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      el?.select?.();
    }, 30);
  }

  // ----- Drag/slipp kolonner (header) -----
  function onHeaderDragStart(e: React.DragEvent, i: number) {
    setDragColIdx(i);
    e.dataTransfer.setData('text/plain', String(i));
    e.dataTransfer.effectAllowed = 'move';
  }
  function onHeaderDrop(e: React.DragEvent, to: number) {
    e.preventDefault();
    const from = dragColIdx ?? Number(e.dataTransfer.getData('text/plain'));
    if (isNaN(from) || from === to) return;
    const next = [...colOrder];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setColOrder(next);
    props.onReorderColumns?.(next);
    setDragColIdx(null);
  }

  // ----- Drag/slipp rader (via #) -----
  function onRowDragStart(e: React.DragEvent, idx: number) {
    const v = visible[idx];
    if (!v || v.isSummary) return;
    setDragRowIdx(idx);
    e.dataTransfer.setData('text/plain', String(idx));
    e.dataTransfer.effectAllowed = 'move';
  }
  function onRowDrop(e: React.DragEvent, to: number) {
    e.preventDefault();
    const from = dragRowIdx ?? Number(e.dataTransfer.getData('text/plain'));
    if (isNaN(from) || from === to) return;

    const vFrom = visible[from];
    let vTo = visible[to];

    if (!vFrom || !vTo) return;
    if (vTo.isSummary) {
      const alt = visible.slice(0, to).reverse().find(v => !v.isSummary);
      if (!alt) return;
      vTo = alt;
    }

    if (treeMode) {
      const pFrom = parentOf.get(vFrom.row.id) ?? null;
      const pTo = parentOf.get(vTo.row.id) ?? null;
      if (pFrom !== pTo) return;
    }

    const next = [...rowOrder];
    const fromPos = next.indexOf(vFrom.row.id);
    const toPos = next.indexOf(vTo.row.id);
    if (fromPos === -1 || toPos === -1) return;
    const [m] = next.splice(fromPos, 1);
    next.splice(toPos, 0, m);
    setRowOrder(next);
    props.onReorderRows?.(next);
    setDragRowIdx(null);
  }

  // ----- Render -----
  const baseFont = 13;
  function fontSizeForLevel(level: number) { return level >= 2 ? baseFont - 2 : baseFont; }
  function fontWeightFor(hasChildren: boolean) { return hasChildren ? 700 : 400; }
  function fontStyleFor(level: number) { return level >= 1 ? 'italic' as const : 'normal' as const; }

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPaste={onPaste}
      onCopy={onCopy}
      style={{
        border: `1px solid #1f2937`,
        borderRadius: 0,
        width: '100%',
        overflow: 'hidden',
        userSelect: editing ? 'text' : 'none',
        outline: 'none',
      }}
    >
      <style>{editorCss}</style>

      {/* Header */}
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
          textAlign: 'center',
          borderRight: `1px solid ${BORDER_V}`,
          position: 'sticky',
          left: 0,
          zIndex: 3,
          background: HEADER_BG,
        }}>#</div>
        {allCols.map((c, i) => (
          <div
            key={c.id}
            draggable
            onDragStart={(e) => onHeaderDragStart(e, i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onHeaderDrop(e, i)}
            style={{
              padding: '8px 10px',
              borderRight: i === allCols.length - 1 ? 'none' : `1px solid ${BORDER_V}`,
              cursor: 'grab',
              background: HEADER_BG,
            }}
          >
            {c.header}
          </div>
        ))}
      </div>

      {/* Body */}
      <div
        ref={bodyRef}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        style={{ height: bodyHeight, overflow: 'auto' }}
      >
        <div style={{ height: padTop }} />
        {windowRows.map((v, li) => {
          const rAbs = startIdx + li;
          const r = v.row;
          const isSummary = v.isSummary;
          const empty = isEmptyRow(r);
          const indentPx = v.level * 16;

          return (
            <div
              key={r.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onRowDrop(e, rAbs)}
              style={{
                display: 'grid',
                gridTemplateColumns: gridCols,
                borderBottom: `1px solid ${BORDER_H}`,
                height: rowHeight,
                lineHeight: `${rowHeight - 10}px`,
                background: isSummary ? '#0d1324' : undefined,
                opacity: isSummary ? 0.95 : 1,
                fontWeight: fontWeightFor(v.hasChildren),
                fontStyle: fontStyleFor(v.level),
                fontSize: fontSizeForLevel(v.level),
              }}
            >
              {/* # kolonne (caret + drag handle + nummer) */}
              <div
                draggable={!isSummary}
                onDragStart={(e) => onRowDragStart(e, rAbs)}
                title={isSummary ? 'Oppsummeringsrad' : 'Dra for å flytte rad'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  justifyContent: 'center',
                  borderRight: `1px solid ${BORDER_V}`,
                  background: '#111827',
                  color: '#9ca3af',
                  cursor: isSummary ? 'default' : 'grab',
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  padding: '0 4px',
                }}
              >
                {treeMode ? (
                  <span
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (v.hasChildren) toggleExpand(r.id);
                    }}
                    style={{
                      fontSize: 10,
                      lineHeight: '10px',
                      width: 10,
                      textAlign: 'center',
                      opacity: v.hasChildren ? 0.9 : 0.25,
                      cursor: v.hasChildren ? 'pointer' : 'default',
                      userSelect: 'none',
                    }}
                    title={v.hasChildren ? (expanded.has(r.id) ? 'Kollaps' : 'Ekspander') : undefined}
                  >
                    {v.hasChildren ? (expanded.has(r.id) ? '▾' : '▸') : '•'}
                  </span>
                ) : null}
                <span>{empty ? '' : (rAbs + 1)}</span>
              </div>

              {/* Data-celler */}
              {allCols.map((col, cIdx) => {
                const cellSelected = isSel(rAbs, cIdx);
                const isEditing = editing && editing.rowId === r.id && editing.colId === col.id;
                const value = r[col.id];
                const formatted = col.format ? col.format(value, r) : value ?? '';
                const isFirstDataCol = cIdx === 0;

                return (
                  <div
                    key={col.id}
                    data-cell={`${r.id}:${col.id}`}
                    onMouseDown={(e) => onCellMouseDown(e, rAbs, cIdx)}
                    onMouseEnter={(e) => onCellMouseEnter(e, rAbs, cIdx)}
                    onDoubleClick={(e) => onCellDoubleClick(e, rAbs, cIdx)}
                    style={{
                      padding: isEditing ? '3px 6px' : '6px 10px',
                      borderRight: cIdx === allCols.length - 1 ? 'none' : `1px solid ${BORDER_V}`,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      // ⬇️ Ikke bytt til hvit bakgrunn ved redigering
                      background: cellSelected ? SEL_FILL : undefined,
                      outline: cellSelected ? `1px solid ${SEL_OUT}` : 'none',
                      outlineOffset: -1,
                      // Ikke tving svart tekst i dark mode når vi redigerer
                      color: undefined,
                      position: freezeFirstColumn && cIdx === 0 ? 'sticky' as const : undefined,
                      left: freezeFirstColumn && cIdx === 0 ? 40 : undefined,
                      zIndex: freezeFirstColumn && cIdx === 0 ? 1 : 0,
                      cursor: isEditing ? 'text' : 'default',
                    }}
                  >
                    {treeMode && isFirstDataCol ? (
                      <span style={{ display: 'inline-block', marginLeft: indentPx }}>
                        {isEditing
                          ? renderEditor(col, editing!.draft, d => setEditing(e => (e ? { ...e, draft: d } : e)))
                          : formatted}
                      </span>
                    ) : (
                      <>
                        {isEditing
                          ? renderEditor(col, editing!.draft, d => setEditing(e => (e ? { ...e, draft: d } : e)))
                          : formatted}
                      </>
                    )}
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

  // ----- helpers -----
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

  // ----- TREE mutasjoner (via onPatch) -----
  function setParent(rowId: string, newParentId: string | null) {
    const oldParent = parentOf.get(rowId) ?? null;
    if (oldParent === newParentId) return;
    props.onPatch?.({ rowId, colId: PARENT_COL_ID, oldValue: oldParent, nextValue: newParentId });
  }
  function indentRow(rowId: string, selIdx: number) {
    const before = visible.slice(0, selIdx).reverse();
    const parentCandidate = before.find(v => !v.isSummary)?.row?.id ?? null;
    if (!parentCandidate) return;
    setParent(rowId, parentCandidate);
    setExpanded(prev => new Set(prev).add(parentCandidate));
  }
  function outdentRow(rowId: string) {
    const parent = parentOf.get(rowId);
    if (!parent) return;
    const grandParent = parentOf.get(parent) ?? null;
    setParent(rowId, grandParent);
  }
  function moveRowWithinParent(rowId: string, delta: number) {
    const parent = parentOf.get(rowId) ?? null;
    const order = [...rowOrder];
    const idx = order.indexOf(rowId);
    if (idx === -1) return;
    let j = idx + (delta < 0 ? -1 : 1);
    while (j >= 0 && j < order.length) {
      const candidateId = order[j];
      if ((parentOf.get(candidateId) ?? null) === parent) {
        const [m] = order.splice(idx, 1);
        order.splice(j, 0, m);
        setRowOrder(order);
        props.onReorderRows?.(order);
        break;
      }
      j += (delta < 0 ? -1 : 1);
    }
  }
}
