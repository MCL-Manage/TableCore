import type { ColumnDef, Activity } from '../types';
import { calculateEnd, calculateDuration } from '../domain/durationRules';
import { validateActivityDates, validateActivityDuration } from '../domain/validation';

/**
 * En enkel kolonnemapping for Progress-aktiviteter.
 * Merk: TableCore i v1 viser verdier – redigering og patch-håndtering
 * kommer i neste iterasjoner. Denne adapteren etablerer format, validering m.m.
 */

const statusOptions = [
  { value: 'planned',   label: 'Planlagt' },
  { value: 'inprogress',label: 'Pågår' },
  { value: 'done',      label: 'Ferdig' },
];

export function getProgressColumns(): ColumnDef<Activity, any>[] {
  const cols: ColumnDef<Activity, any>[] = [
    { id: 'code', header: 'Kode', type: 'text', width: 100 },
    { id: 'name', header: 'Aktivitet', type: 'text', width: 240 },

    {
      id: 'start',
      header: 'Start',
      type: 'date',
      width: 120,
      validate: (_value, row) => validateActivityDates(row),
      // parse/format kan utvides senere ved redigerbar grid
    },

    {
      id: 'end',
      header: 'Slutt',
      type: 'date',
      width: 120,
      validate: (_value, row) => validateActivityDates(row),
    },

    {
      id: 'durationDays',
      header: 'Varighet (dager)',
      type: 'number',
      width: 120,
      validate: (_value, row) => validateActivityDuration(row),
    },

    { id: 'color', header: 'Farge', type: 'color', width: 80 },

    {
      id: 'status',
      header: 'Status',
      type: 'select',
      width: 140,
      options: statusOptions,
    },
  ];

  return cols;
}

/**
 * Domeneregel (kan brukes i onPatch senere):
 * - Endres start eller durationDays -> beregn end
 * - Endres end -> beregn durationDays
 */
export function applyActivityCanonRule(next: Activity, changedField: keyof Activity): Activity {
  const a: Activity = { ...next };

  if (changedField === 'start' || changedField === 'durationDays') {
    if (a.start && a.durationDays && a.durationDays >= 1) {
      a.end = calculateEnd(a.start, a.durationDays);
    }
  }
  if (changedField === 'end') {
    if (a.start && a.end) {
      a.durationDays = calculateDuration(a.start, a.end);
    }
  }
  return a;
}
