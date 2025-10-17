import React from 'react';
import TableCore from '../core/TableCore';
import type { ColumnDef } from '../types';

type Activity = {
  id: string;
  code?: string;
  name: string;
  start?: string;
  end?: string;
  durationDays?: number;
  color?: string;
  status?: string;
  // Viktig for tree:
  parentId?: string | null;
  // (valgfritt) for summary-visning:
  rowType?: 'data' | 'summary';
};

const columns: ColumnDef[] = [
  { id: 'code', header: 'Kode', type: 'text', width: 100 },
  { id: 'name', header: 'Navn', type: 'text', width: 240, editable: () => true },
  { id: 'start', header: 'Start', type: 'date', width: 130 },
  { id: 'end', header: 'Slutt', type: 'date', width: 130 },
  { id: 'durationDays', header: 'Varighet (d)', type: 'number', width: 130 },
  { id: 'status', header: 'Status', type: 'select', options: ['planlagt','aktiv','ferdig'], width: 120 },
  { id: 'color', header: 'Farge', type: 'color', width: 110 },
];

const initialRows: Activity[] = [
  { id: 'A', code: 'A', name: 'Hovedleveranse', status: 'planlagt', parentId: null },
  { id: 'A1', code: 'A1', name: 'Analyse', status: 'aktiv', parentId: 'A' },
  { id: 'A2', code: 'A2', name: 'Design', status: 'planlagt', parentId: 'A' },
  { id: 'A2.1', code: 'A2.1', name: 'UI-design', status: 'planlagt', parentId: 'A2' },
  { id: 'A2.2', code: 'A2.2', name: 'Interaksjon', status: 'planlagt', parentId: 'A2' },
  // Eksempel på “sammendragslinje” for en gruppe:
  { id: 'SUM-A', name: 'Sum Hovedleveranse', rowType: 'summary', parentId: 'A' },

  { id: 'B', code: 'B', name: 'Implementering', status: 'planlagt', parentId: null },
  { id: 'B1', code: 'B1', name: 'Kjerne', status: 'planlagt', parentId: 'B' },
  { id: 'B2', code: 'B2', name: 'Adaptere', status: 'planlagt', parentId: 'B' },
];

export default function DemoProgress() {
  const [rows, setRows] = React.useState<Activity[]>(initialRows);

  function patchOne(p: { rowId: string; colId: string; oldValue: any; nextValue: any }) {
    setRows(prev =>
      prev.map(r => (r.id === p.rowId ? { ...r, [p.colId]: p.nextValue } : r))
    );
  }

  function bulkReorder(newOrderIds: string[]) {
    // re-ranger rows etter id-lista fra TableCore
    const byId = new Map(rows.map(r => [r.id, r]));
    const next: Activity[] = [];
    for (const id of newOrderIds) {
      const r = byId.get(id);
      if (r) next.push(r);
    }
    // legg til eventuelle som mangler (skulle ikke skje, men safe)
    for (const r of rows) if (!byId.has(r.id)) next.push(r);
    setRows(next);
  }

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', height: 'calc(100vh - 100px)', gap: 8 }}>
      <div style={{ color: '#9ca3af', fontSize: 14 }}>
        <strong>Test tre-modus:</strong> Klikk en rad og bruk <code>Alt+→</code> for å rykke inn, <code>Alt+←</code> for å rykke ut, <code>Alt+↑/Alt+↓</code> for å flytte opp/ned innen samme parent.  
        Vanlige piltaster <code>→/←</code> ekspanderer/kollapser hvis raden har barn.
      </div>

      <TableCore
        columns={columns}
        rows={rows}
        bodyHeight={520}
        // 🔽 Tre-aktivering:
        treeMode
        showSummaries
        getParentId={(r) => r.parentId ?? null}
        getRowType={(r) => r.rowType ?? 'data'}

        onPatch={patchOne}
        onReorderRows={bulkReorder}
        onReorderColumns={() => {}}
        onCommit={() => {}}
      />
    </div>
  );
}
