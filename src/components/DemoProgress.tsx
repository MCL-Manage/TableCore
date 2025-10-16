import React from 'react';
import TableCore from '../core/TableCore';
import { getProgressColumns, applyActivityCanonRule } from '../adapters/ProgressTableAdapter';
import type { Activity } from '../types';
import { ensureDb } from '../data/initDb';
import { ActivityRepo } from '../data/ActivityRepo';

function rid() { return Math.random().toString(36).slice(2, 10); }
const DEMO_PROJECT_ID = 'demo-project';

export default function DemoProgress() {
  const [rows, setRows] = React.useState<Activity[]>([]);
  const [loading, setLoading] = React.useState(true);
  const repoRef = React.useRef<ActivityRepo | null>(null);

  React.useEffect(() => {
    (async () => {
      const db = await ensureDb();
      const repo = new ActivityRepo(db);
      repoRef.current = repo;

      const existing = await repo.listByProject(DEMO_PROJECT_ID);
      if (existing.length === 0) {
        const nowISO = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const demo: Activity[] = [
          { id: rid(), projectId: DEMO_PROJECT_ID, code: 'A-100', name: 'Kickoff', start: nowISO, end: nowISO, durationDays: 1, color: '#60a5fa', status: 'planned', rowVersion: 1 },
          { id: rid(), projectId: DEMO_PROJECT_ID, code: 'A-110', name: 'Design',  start: nowISO, end: addDaysISO(nowISO, 4), durationDays: 5, color: '#34d399', status: 'inprogress', rowVersion: 1 },
          { id: rid(), projectId: DEMO_PROJECT_ID, code: 'A-120', name: 'Bygging', start: addDaysISO(nowISO, 6), end: addDaysISO(nowISO, 20), durationDays: 15, color: '#fbbf24', status: 'planned', rowVersion: 1 },
          { id: rid(), projectId: DEMO_PROJECT_ID, code: 'A-130', name: 'Test',    start: addDaysISO(nowISO, 22), end: addDaysISO(nowISO, 26), durationDays: 5, color: '#f472b6', status: 'planned', rowVersion: 1 },
        ];
        for (const d of demo) await repo.create(d);
        setRows(demo);
      } else {
        setRows(existing);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div>Henter data…</div>;

  const columns = getProgressColumns();
  return (
    <TableCore
      columns={columns}
      rows={rows}
      readonly={false}
      onPatch={async ({ rowId, colId, oldValue, nextValue }) => {
        const current = rows.find(r => r.id === rowId);
        if (!current || !repoRef.current) return;

        const nextRow = { ...current, [colId]: nextValue } as Activity;

        const withCanon = (colId === 'start' || colId === 'durationDays' || colId === 'end')
          ? applyActivityCanonRule(nextRow, colId as keyof Activity)
          : nextRow;

        // Optimistisk UI
        setRows(prev => prev.map(r => (r.id === rowId ? { ...withCanon } : r)));

        try {
          await repoRef.current.patch(
            rowId,
            {
              rowId,
              changes: {
                [colId]: { old: oldValue, next: nextValue },
                ...(colId !== 'end' && withCanon.end !== current.end
                  ? { end: { old: current.end, next: withCanon.end } }
                  : {}),
                ...(colId !== 'durationDays' && withCanon.durationDays !== current.durationDays
                  ? { durationDays: { old: current.durationDays, next: withCanon.durationDays } }
                  : {}),
              },
            },
            { rowVersion: current.rowVersion }
          );

          const fresh = await repoRef.current.get(rowId);
          if (fresh) {
            setRows(prev => prev.map(r => (r.id === rowId ? fresh : r)));
          }
        } catch (e) {
          console.error(e);
          setRows(prev => prev.map(r => (r.id === rowId ? current : r)));
          alert('Kunne ikke lagre endring (konflikt eller feil).');
        }
      }}
      onCommit={() => {}}
    />
  );
// ...
