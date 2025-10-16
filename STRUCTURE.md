# TableCore – Mappestruktur (v1)
tablecore/
│
├── README.md
├── STRUCTURE.md
│
├── core/ # Kjernekomponenter for tabellen
│ ├── TableCore.tsx # Grid-komponenten
│ ├── CellEditor.tsx # Standard celle-editorer
│ ├── useClipboard.ts # Kopier/lim logikk
│ ├── useUndoRedo.ts # Lokal historikk
│ └── utils.ts # Hjelpefunksjoner
│
├── adapters/ # Adaptere per modul
│ ├── ProgressTableAdapter.ts
│ ├── EstimatesTableAdapter.ts
│ └── FormTableAdapter.ts
│
├── domain/ # Domenelogikk og beregninger
│ ├── durationRules.ts
│ ├── validation.ts
│ └── calculators.ts
│
├── data/ # Repository-implementasjoner
│ ├── ProjectRepo.ts
│ ├── ActivityRepo.ts
│ ├── EstimateRepo.ts
│ ├── FormRepo.ts
│ └── types.ts
│
├── drivers/ # Database-drivere
│ ├── IndexedDBDriver.ts
│ ├── FirestoreDriver.ts
│ └── SupabaseDriver.ts
│
├── types/ # Datamodell- og kontraktsdefinisjoner
│ ├── ColumnDef.ts
│ ├── Patch.ts
│ ├── Activity.ts
│ ├── EstimateItem.ts
│ ├── FormTemplate.ts
│ ├── Repository.ts
│ └── index.ts
│
├── components/ # Felles UI-komponenter (f.eks. toolbars, modal)
│ ├── Toolbar.tsx
│ ├── StatusBar.tsx
│ └── ConfirmDialog.tsx
│
└── tests/ # Enkle manuelle og automatiske tester
├── clipboard.test.ts
├── performance.test.ts
├── validation.test.ts
└── demoData.json


