import { IndexedDBDriver } from '../drivers/IndexedDBDriver';
import { TABLES } from './types';

export const db = new IndexedDBDriver('tablecore-db', 1, [
  { name: TABLES.projects,      keyPath: 'id', indices: [{ name: 'by_name', keyPath: 'name', unique: false }] },
  { name: TABLES.activities,    keyPath: 'id', indices: [{ name: 'by_project', keyPath: 'projectId', unique: false }] },
  { name: TABLES.dependencies,  keyPath: 'id' },
  { name: TABLES.estimateItems, keyPath: 'id', indices: [{ name: 'by_project', keyPath: 'projectId', unique: false }] },
  { name: TABLES.formTemplates, keyPath: 'id' },
  { name: TABLES.formEntries,   keyPath: 'id', indices: [{ name: 'by_project', keyPath: 'projectId', unique: false }] },
  { name: TABLES.events,        keyPath: 'id', indices: [{ name: 'by_project', keyPath: 'projectId', unique: false }] },
]);

export async function ensureDb() {
  await db.init();
  return db;
}
