import type { FormEntry, FormTemplate } from '../types';
import type { Repository } from '../types';
import type { RowPatch, BulkPatch } from '../types';
import { TABLES } from './types';
import { IndexedDBDriver } from '../drivers/IndexedDBDriver';

export class FormTemplateRepo implements Repository<FormTemplate> {
  constructor(private db: IndexedDBDriver) {}

  async listByProject(_projectId: string): Promise<FormTemplate[]> {
    // Maler er typisk globale/organisasjonsbaserte – returner alle i v1
    return this.db.listAll<FormTemplate>(TABLES.formTemplates);
  }

  async get(id: string): Promise<FormTemplate | null> {
    return this.db.get<FormTemplate>(TABLES.formTemplates, id);
  }

  async patch(id: string, patch: RowPatch): Promise<void> {
    const current = await this.get(id);
    if (!current) throw new Error('FormTemplate not found');
    const next = { ...current };
    Object.entries(patch.changes).forEach(([k, v]) => {
      (next as any)[k] = v.next;
    });
    await this.db.put<FormTemplate>(TABLES.formTemplates, next);
  }

  async bulkPatch(_projectId: string, _bulk: BulkPatch): Promise<void> {
    return;
  }

  async create(data: FormTemplate): Promise<void> {
    await this.db.put<FormTemplate>(TABLES.formTemplates, data);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(TABLES.formTemplates, id);
  }
}

export class FormEntryRepo implements Repository<FormEntry> {
  constructor(private db: IndexedDBDriver) {}

  async listByProject(projectId: string): Promise<FormEntry[]> {
    const all = await this.db.listAll<FormEntry>(TABLES.formEntries);
    return all.filter(e => e.projectId === projectId);
  }

  async get(id: string): Promise<FormEntry | null> {
    return this.db.get<FormEntry>(TABLES.formEntries, id);
  }

  async patch(id: string, patch: RowPatch, opts?: { rowVersion?: number }): Promise<void> {
    const current = await this.get(id);
    if (!current) throw new Error('FormEntry not found');
    if (opts?.rowVersion !== undefined && current.rowVersion !== opts.rowVersion) {
      throw new Error('Conflict (rowVersion mismatch)');
    }
    const next: FormEntry = { ...current };
    Object.entries(patch.changes).forEach(([k, v]) => {
      (next as any)[k] = v.next;
    });
    next.rowVersion = (current.rowVersion ?? 0) + 1;
    next.updatedAt = new Date().toISOString();
    await this.db.put<FormEntry>(TABLES.formEntries, next);
  }

  async bulkPatch(projectId: string, bulk: BulkPatch): Promise<void> {
    const current = await this.listByProject(projectId);
    const map = new Map(current.map(a => [a.id, a]));
    const updates: FormEntry[] = [];

    for (const p of bulk.patches) {
      const row = map.get(p.rowId);
      if (!row) continue;
      const next = { ...row, [p.colId]: p.nextValue } as FormEntry;
      next.rowVersion = (row.rowVersion ?? 0) + 1;
      next.updatedAt = new Date().toISOString();
      map.set(p.rowId, next);
    }

    map.forEach(v => updates.push(v));
    await this.db.bulkPut<FormEntry>(TABLES.formEntries, updates);
  }

  async create(data: FormEntry): Promise<void> {
    await this.db.put<FormEntry>(TABLES.formEntries, {
      ...data,
      rowVersion: data.rowVersion ?? 1,
      createdAt: data.createdAt ?? new Date().toISOString(),
      updatedAt: data.updatedAt ?? new Date().toISOString(),
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(TABLES.formEntries, id);
  }
}
