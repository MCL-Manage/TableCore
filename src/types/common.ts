export type Id = string;

export type ISODateString = string; // ISO 8601, UTC ved lagring.

export type Selection = {
  rows: number[];      // indeks-basert (for Tabellvisning)
  cols: number[];      // indeks-basert
};

export type KeyBindings = Partial<{
  copy: string[];
  paste: string[];
  cut: string[];
  undo: string[];
  redo: string[];
  delete: string[];
  nextCell: string[];
  prevCell: string[];
}>;

export type CellType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'color'
  | 'custom';

export type Option = {
  value: string;
  label: string;
};
