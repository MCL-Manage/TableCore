import type { ISODateString } from '../types';

/**
 * Enkle dato/varighetsregler:
 * - durationDays inkluderer både start og slutt (dvs. 1 dag = samme dato).
 * - end = start + (durationDays - 1) dager
 * - durationDays = (slutt - start) + 1
 */

export function toISODateUTC(d: Date): ISODateString {
  // Normaliser til YYYY-MM-DD (uten tidssone-støy)
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISO(date?: ISODateString): Date | null {
  if (!date) return null;
  // Tillat både YYYY-MM-DD og full ISO
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : d;
}

export function addDays(dateISO: ISODateString, days: number): ISODateString {
  const d = parseISO(dateISO);
  if (!d) return dateISO;
  const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
  return toISODateUTC(nd);
}

export function diffDaysInclusive(startISO?: ISODateString, endISO?: ISODateString): number | undefined {
  const s = parseISO(startISO);
  const e = parseISO(endISO);
  if (!s || !e) return undefined;
  const ms = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate())
          - Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
  const days = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
  return days;
}

export function calculateEnd(startISO?: ISODateString, durationDays?: number): ISODateString | undefined {
  if (!startISO || !durationDays || durationDays < 1) return undefined;
  return addDays(startISO, durationDays - 1);
}

export function calculateDuration(startISO?: ISODateString, endISO?: ISODateString): number | undefined {
  return diffDaysInclusive(startISO, endISO);
}
