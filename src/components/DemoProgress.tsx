import React from 'react';
import TableCore from '../core/TableCore';
import { getProgressColumns, applyActivityCanonRule } from '../adapters/ProgressTableAdapter';
import type { Activity } from '../types';
import { ensureDb } from '../data/initDb';
import { ActivityRepo } from '../data/ActivityRepo';
import AppToolbar from './AppToolbar';
import SaveIndicator, { SaveState } from './SaveIndicator';

function rid() { return Math.random().toString(36).slice(2, 10); }
const DEMO_PROJECT_ID = 'demo-project';

export default function DemoProgress() {
  const [rows, setRows] = React.useState<Activity[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState<{ rows: number[]; cols: number[] }>({ rows: [], cols: [] });
  const [saveState, setSaveState] = React.useState<SaveState>('idle');

  const repoRef = React.useRef<ActivityRepo | null>(null);

  React.useEffect(() => {
    (async () => {
      const db = await ensureDb();
      const repo = new ActivityRepo(db);
      repoRef.current = repo;

      const existing = await repo.listByProject(DEMO_PROJECT_ID);
      if (existing.length === 0) {
        const nowISO = new Date().toISOString().slice(0, 10);
        const demo: Activity[] = [
          { id: rid(), projectId: DEMO_PROJECT_ID, code: 'A-100', name: 'Kickoff', start: nowISO, end: nowISO, durationDays: 1, color: '#60a5fa', status: 'planned', rowVersion: 1 },
          { id: rid(), projectId: DEMO_PROJECT_ID, code: 'A-110', name: 'Design',  start: nowISO, end: addDaysISO(nowISO, 4),  durationDays: 5,  color: '#34d399', status: 'inprogress', rowVersion: 1 },
          { id: rid(), projectId: DEMO_PROJECT_ID, code: 'A-120', name: 'Bygging', start: addDaysISO(nowISO, 6), end: addDaysISO(nowISO, 20), durationDays: 15, color: '#fbbf24', status: 'planned', rowVersion: 1 },
          { id: rid(), projectId: DEMO_PROJECT_ID, code: 'A-130', name: 'Test',    start: addDaysISO(nowISO, 22), end: addDaysISO(nowISO, 26), durationDays: 5,  color: '#f472b6', status: 'planned', rowVersion: 1 },
        ];
        for (const d of demo) await repo.create(d);
        setRows(demo);
      } else {
        setRows(existing);
      }
      setLoading(false);
    })();
  }, []);

  const columns = getProgressColumns();

  async function addRow() {
    if (!repoRef.current) return;
    const base = new Date().toISOString().slice(0, 10);
    const row: Activity = {
      id: rid(),
      projectId: DEMO_PROJECT_ID,
      code: `A-${String(Math.floor(Math.random() * 900 + 100))}`,
      name: 'Ny aktivitet',
      start: base,
      end: base,
      durationDays: 1,
      color: '#60a5fa',
      status: 'planned',
      rowVersion: 1,
    };
    await repoRef.current.create(row);
    setRows(prev => [...prev, row]);
  }

  async function deleteSelected() {
    if (!repoRef.current || sel.rows.length === 0) return;
    // NB: indeksene er relativt enkle – de refererer til nåværende rekkefølge i tabellen
    const ids = sel.rows.map(i => rows[i]?.id).filter(Boolean) as string[];
    for (const id of ids) await repoRef.current.delete(id);
    setRows(prev => prev.filter(r => !ids.includes(r.id)));
    setSel({ rows: [], cols: [] });
  }

  function exportCSV() {
    const header = columns.map(c => c.header).join(',');
    const lines = rows.map(r => columns.map(c => csvSafe((r as any)[c.id])).join(','));
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'activities.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div>Henter data…</div>;

  return (
    <>
      <AppToolbar
        title="Progress"
        leftActions={[
          { id: 'add', label: 'Ny rad', icon: 'add', onClick: addRow },
          { id: 'del', label: 'Slett markert', icon: 'delete', onClick: deleteSelected, disabled: sel.rows.length === 0 },
          { id: 'export', label: 'Eksporter', icon: 'export', onClick: exportCSV },
        ]}
        rightActions={[
          { id: 'save-state', label: '', icon: 'save', disabled: true },
        ]}
      >
        <SaveIndicator state={saveState} />
      </AppToolbar>

      <TableCore
        columns={columns}
        rows={rows}
        readonly={false}
        /* Nye TableCore-innstillinger (fra grunnmodellen) */
        freezeFirstColumn={true}
        enableFilters={true}
        rowHeight={32}
        bodyHeight={420}
        onSelectionChange={(s) => setSel(s)}
        onPatch={async ({ rowId, colId, oldValue, nextValue }) => {
          const current = rows.find(r => r.id === rowId);
          if (!current || !repoRef.current) return;

          // Type-sikkert felt
          const key = colId as keyof Activity;

          // Ny rad med endringen
          const nextRow: Activity = { ...current, [key]: nextValue } as Activity;

          // Domeneregel (start/end/duration)
          const withCanon =
            (key === 'start' || key === 'durationDays' || key === 'end')
              ? applyActivityCanonRule(nextRow, key)
              : nextRow;

          // Optimistisk UI + lagre-indikator
          setSaveState('saving');
          setRows(prev => prev.map(r => (r.id === rowId ? { ...withCanon } : r)));

          try {
            await repoRef.current.patch(
              rowId,
              {
                rowId,
                changes: {
                  [key]: { old: oldValue, next: nextValue },
                  ...(key !== 'end' && withCanon.end !== current.end
                    ? { end: { old: current.end, next: withCanon.end } }
                    : {}),
                  ...(key !== 'durationDays' && withCanon.durationDays !== current.durationDays
                    ? { durationDays: { old: current.durationDays, next: withCanon.durationDays } }
                    : {}),
                } as any,
              },
              { rowVersion: current.rowVersion }
            );

            const fresh = await repoRef.current.get(rowId);
            if (fresh) setRows(prev => prev.map(r => (r.id === rowId ? fresh : r)));

            setSaveState('saved');
            // liten reset tilbake til "Klar"
            setTimeout(() => setSaveState('idle'), 1200);
          } catch (e) {
            console.error(e);
            setRows(prev => prev.map(r => (r.id === rowId ? current : r)));
            setSaveState('error');
            setTimeout(() => setSaveState('idle'), 1500);
            alert('Kunne ikke lagre endring (konflikt eller feil).');
          }
        }}
        onCommit={() => {}}
      />
    </>
  );
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO);
  const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
  const y = nd.getUTCFullYear();
  const m = String(nd.getUTCMonth() + 1).padStart(2, '0');
  const day = String(nd.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function csvSafe(v: any) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
