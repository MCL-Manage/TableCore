import type { Id } from './common';

export type EstimateItem = {
  id: Id;
  projectId: Id;
  group?: string;
  lineNo?: number;
  name: string;
  qty?: number;
  unit?: string;
  unitPrice?: number;
  vatPct?: number;
  currency?: string;
  subtotal?: number;  // derived
  notes?: string;
  rowVersion?: number;
};
