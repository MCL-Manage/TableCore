import type { Id } from './common';

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox';

export type FormField = {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
};

export type FormTemplate = {
  id: Id;
  orgId?: Id;
  name: string;
  version: string;
  fields: FormField[];
};

export type FormEntry = {
  id: Id;
  projectId: Id;
  templateId: Id;
  values: Record<string, any>;
  status: 'draft' | 'active' | 'archived';
  createdAt: string;  // ISO
  updatedAt: string;  // ISO
  rowVersion?: number;
};
