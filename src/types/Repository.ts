import type { BulkPatch, RowPatch } from './Patch';

export interface Repository<T> {
  listByProject(projectId: string): Promise<T[]>;
  get(id: string): Promise<T | null>;
  patch(id: string, patch: RowPatch, opts?: { rowVersion?: number }): Promise<void>;
  bulkPatch(projectId: string, bulk: BulkPatch): Promise<void>;
  create(data: T): Promise<void>;
  delete(id: string): Promise<void>;
}
