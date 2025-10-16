export const TABLES = {
  projects: 'projects',
  activities: 'activities',
  dependencies: 'dependencies',
  estimateItems: 'estimateItems',
  formTemplates: 'formTemplates',
  formEntries: 'formEntries',
  events: 'events',
} as const;

export type TableName = typeof TABLES[keyof typeof TABLES];
