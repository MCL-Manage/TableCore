import type { Activity } from '../types';
import { parseISO } from './durationRules';

export function validateActivityDates(a: Activity): Error | void {
  if (!a.start || !a.end) return;
  const s = parseISO(a.start);
  const e = parseISO(a.end);
  if (!s || !e) return new Error('Ugyldig datoformat');
  if (e < s) return new Error('Sluttdato kan ikke være før startdato');
}

export function validateActivityDuration(a: Activity): Error | void {
  if (a.durationDays !== undefined && a.durationDays < 1) {
    return new Error('Varighet må være minst 1 dag');
  }
}
