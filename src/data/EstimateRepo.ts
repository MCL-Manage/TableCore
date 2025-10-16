import type { EstimateItem } from '../types';
import type { Repository } from '../types';
import type { RowPatch, BulkPatch } from '../types';
import { TABLES } from './types';
import { IndexedDBDriver } from '../drivers/IndexedDBDriver';

export class EstimateRepo implements Repository<EstimateItem> {
  constructor(private db: IndexedDBDriver) {}

  async listByProject(projectId: string): Promise<EstimateItem[]> {
    const all = await this.db.listAll<EstimateItem>(TABLES.estimateItems);
    return all.filter(r => r.projectId === projectId);
  }

  async get(id: string): Promise<EstimateItem | null> {
    return this.db.get<EstimateItem>(TABLES.estimateItems, id);
  }

  async patch(id: string, patch: RowPatch, opts?: { rowVersion?: number }): Promise<void> {
    const current = await this.get(id);
    if (!current) throw new Error('EstimateItem not found');

    if (opts?.rowVersion !== undefined && current.rowVersion !== opts.rowVersion) {
      throw new Error('Conflict (rowVersion mismatch)');
    }

    const next: EstimateItem = { ...current };
    Object.entries(patch.changes).forEach(([k, v]) => {
      (next as any)[k] = v.next;
    });

    // derived subtotal (enkel v1)
    const qty = Number(next.qty ?? 0);
    const unitPrice = Number(next.unitPrice ?? 0);
    const vatPct = Number(next.vatPct ?? 0);
    const base = qty * unitPrice;
    next.subtotal = Math.round((base * (1 + vatPct / 100)) * 100) / 100;

    next.rowVersion = (current.rowVersion ?? 0) + 1;
    await this.db.put<EstimateItem>(TABLES.estimateItems, next);
  }

  async bulkPatch(projectId: string, bulk: BulkPatch): Promise<void> {
    const current = await this.listByProject(projectId);
    const map = new Map(current.map(a => [a.id, a]));
    const updates: EstimateItem[] = [];

    for (const p of bulk.patches) {
      const row = map.get(p.rowId);
      if (!row) continue;
      const next = { ...row, [p.colId]: p.nextValue } as EstimateItem;

      const qty = Number(next.qty ?? 0);
      const unitPrice = Number(next.unitPrice ?? 0);
      const vatPct = Number(next.vatPct ?? 0);
      const base = qty * unitPrice;
      next.subtotal = Math.round((base * (1 + vatPct / 100)) * 100) / 100;

      next.rowVersion = (row.rowVersion ?? 0) + 1;
      map.set(p.rowId, next);
    }

    map.forEach(v => updates.push(v));
    await this.db.bulkPut<EstimateItem>(TABLES.estimateItems, updates);
  }

  async create(data: EstimateItem): Promise<void> {
    const qty = Number(data.qty ?? 0);
    const unitPrice = Number(data.unitPrice ?? 0);
    const vatPct = Number(data.vatPct ?? 0);
    const base = qty * unitPrice;
    const subtotal = Math.round((base * (1 + vatPct / 100)) * 100) / 100;

    await this.db.put<EstimateItem>(TABLES.estimateItems, {
      ...data,
      subtotal,
      rowVersion: data.rowVersion ?? 1,
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(TABLES.estimateItems, id);
  }
}
