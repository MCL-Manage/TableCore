import type { CellType, Option } from './common';

export type Formatter<T = any> = (value: T, row: any) => string;
export type Parser<T = any> = (text: string) => T;
export type EditableGuard = (row: any) => boolean;
export type Validator<T = any> = (value: T, row: any) => Error | void;

export type ColumnDef<TRow = any, TValue = any> = {
  id: string;
  header: string;
  type: CellType;
  width?: number;
  editable?: EditableGuard;
  parse?: Parser<TValue>;
  format?: Formatter<TValue>;
  validate?: Validator<TValue>;
  options?: Option[]; // for select
};
