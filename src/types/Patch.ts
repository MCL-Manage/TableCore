export type CellPatch = {
  rowId: string;
  colId: string;
  oldValue: any;
  nextValue: any;
};

export type RowPatch = {
  rowId: string;
  changes: Record<string, { old: any; next: any }>;
};

export type BulkPatch = {
  patches: CellPatch[];
};

export type Patch = CellPatch | RowPatch | BulkPatch;
