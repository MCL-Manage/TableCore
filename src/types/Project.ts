import type { Id } from './common';

export type Project = {
  id: Id;
  name: string;
  customer?: string;
  status?: string;
  createdAt: string; // ISO
};
