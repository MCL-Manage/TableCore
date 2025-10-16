/**
 * Minimal IndexedDB-driver uten eksterne avhengigheter.
 * Lagrer rader per "tableName" (entity) som egne object stores.
 *
 * API:
 * - init(dbName, version, stores)
 * - getStore(tableName, mode)
 * - put(tableName, row)     // create/update
 * - get(tableName, id)
 * - delete(tableName, id)
 * - listByIndex(tableName, indexName, indexValue)
 * - listAll(tableName)
 * - bulkPut(tableName, rows)
 */

type StoreDef = {
  name: string;
  keyPath: string;       // f.eks. 'id'
  indices?: { name: string; keyPath: string; unique?: boolean }[];
};

export class IndexedDBDriver {
  private db: IDBDatabase | null = null;
  private dbName: string;
  private version: number;
  private stores: StoreDef[];

  constructor(dbName: string, version: number, stores: StoreDef[]) {
    this.dbName = dbName;
    this.version = version;
    this.stores = stores;
  }

  init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = () => {
        const db = req.result;
        this.stores.forEach(def => {
          if (!db.objectStoreNames.contains(def.name)) {
            const store = db.createObjectStore(def.name, { keyPath: def.keyPath });
            def.indices?.forEach(idx =>
              store.createIndex(idx.name, idx.keyPath, { unique: !!idx.unique })
            );
          }
        });
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  private getStore(tableName: string, mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) throw new Error('IndexedDB not initialized');
    const tx = this.db.transaction(tableName, mode);
    return tx.objectStore(tableName);
  }

  async put<T extends { id: string }>(tableName: string, row: T): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const store = this.getStore(tableName, 'readwrite');
      const req = store.put(row);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async bulkPut<T extends { id: string }>(tableName: string, rows: T[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const store = this.getStore(tableName, 'readwrite');
      rows.forEach(row => store.put(row));
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
    });
  }

  async get<T>(tableName: string, id: string): Promise<T | null> {
    return await new Promise<T | null>((resolve, reject) => {
      const store = this.getStore(tableName, 'readonly');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async delete(tableName: string, id: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const store = this.getStore(tableName, 'readwrite');
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async listAll<T>(tableName: string): Promise<T[]> {
    return await new Promise<T[]>((resolve, reject) => {
      const store = this.getStore(tableName, 'readonly');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  }

  async listByIndex<T>(tableName: string, indexName: string, value: string): Promise<T[]> {
    return await new Promise<T[]>((resolve, reject) => {
      const store = this.getStore(tableName, 'readonly');
      const idx = store.index(indexName);
      const req = idx.getAll(value);
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  }
}
