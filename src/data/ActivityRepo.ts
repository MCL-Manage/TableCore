import type { Activity } from '../types';
import type { Repository } from '../types';
import type { RowPatch, BulkPatch } from '../types';
import { TABLES } from './types';
import { IndexedDBDriver } from '../drivers/IndexedDBDriver';

export class ActivityRepo implements Repository<Activity> {
  constructor(private db: IndexedDBDriver) {}

  async listByProject(projectId: string): Promise<Activity[]> {
    // For enkelhet i v1: hent alle og filtrer i minne
    const all = await this.db.listAll<Activity>(TABLES.activities);
    return all.filter(a => a.projectId === projectId);
  }

  async get(id: string): Promise<Activity | null> {
    return this.db.get<Activity>(TABLES.activities, id);
  }

  async patch(id: string, patch: RowPatch, opts?: { rowVersion?: number }): Promise<void> {
    const current = await this.get(id);
    if (!current) throw new Error('Activity not found');

    // enkel optimistic lock (valgfritt)
    if (opts?.rowVersion !== undefined && current.rowVersion !== opts.rowVersion) {
      throw new Error('Conflict (rowVersion mismatch)');
    }

    const next: Activity = { ...current };
    Object.entries(patch.changes).forEach(([k, v]) => {
      (next as any)[k] = v.next;
    });
    next.rowVersion = (current.rowVersion ?? 0) + 1;

    await this.db.put<Activity>(TABLES.activities, next);
  }

  async bulkPatch(projectId: string, bulk: BulkPatch): Promise<void> {
    const current = await this.listByProject(projectId);
    const map = new Map(current.map(a => [a.id, a]));
    const updates: Activity[] = [];

    for (const p of bulk.patches) {
      const row = map.get(p.rowId);
      if (!row) continue;
      const next = { ...row, [p.colId]: p.nextValue } as Activity;
      next.rowVersion = (row.rowVersion ?? 0) + 1;
      map.set(p.rowId, next);
    }

    map.forEach(v => updates.push(v));
    await this.db.bulkPut<Activity>(TABLES.activities, updates);
  }

  async create(data: Activity): Promise<void> {
    await this.db.put<Activity>(TABLES.activities, {
      ...data,
      rowVersion: data.rowVersion ?? 1,
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(TABLES.activities, id);
  }
}
