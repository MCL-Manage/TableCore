import type { Id, ISODateString } from './common';

export type Activity = {
  id: Id;
  projectId: Id;
  code?: string;
  name: string;
  start?: ISODateString;    // ISO, lagres i UTC
  end?: ISODateString;      // ISO, lagres i UTC
  durationDays?: number;    // derived/kan beregnes
  color?: string;           // hex
  parentId?: Id | null;
  isMilestone?: boolean;
  status?: string;
  sortIndex?: number;
  rowVersion?: number;
};

export type Dependency = {
  id: Id;
  projectId: Id;
  fromId: Id;
  toId: Id;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays?: number;
};
