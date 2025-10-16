import type { Project } from '../types';
import type { Repository } from '../types';
import type { RowPatch, BulkPatch } from '../types';
import { TABLES } from './types';
import { IndexedDBDriver } from '../drivers/IndexedDBDriver';

export class ProjectRepo implements Repository<Project> {
  constructor(private db: IndexedDBDriver) {}

  async listByProject(_projectId: string): Promise<Project[]> {
    // Ikke relevant – returner alle prosjekter
    return this.db.listAll<Project>(TABLES.projects);
  }

  async get(id: string): Promise<Project | null> {
    return this.db.get<Project>(TABLES.projects, id);
  }

  async patch(id: string, patch: RowPatch): Promise<void> {
    const current = await this.get(id);
    if (!current) throw new Error('Project not found');
    const next = { ...current };
    Object.entries(patch.changes).forEach(([k, v]) => {
      (next as any)[k] = v.next;
    });
    await this.db.put<Project>(TABLES.projects, next);
  }

  async bulkPatch(_projectId: string, _bulk: BulkPatch): Promise<void> {
    // Ikke typisk brukt for projects i MVP, kan utvides
    return;
  }

  async create(data: Project): Promise<void> {
    await this.db.put<Project>(TABLES.projects, data);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(TABLES.projects, id);
  }
}
