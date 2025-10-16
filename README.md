# TableCore v1 – Felles tabellmotor for Manage-systemet

### Huskereminder

TableCore er den felles datatabellmotoren i Manage-systemet.  
Den skal brukes i flere apper – som **Progress (fremdriftsplan)**, **Estimates (kalkyle)** og **Structured Docs (skjemaer)** – og gi en konsistent måte å vise, redigere og lagre tabulære data på.

Målet er at alle apper skal kunne bruke samme tabellkjerne (TableCore), med ulike adaptere og datamodeller, uten å måtte endre brukergrensesnittet eller logikken i domenet.

---

## 1. Grunntanker

- **Én kilde til sannhet:** all data lagres i database (lokal eller sky). Tabellen er kun visning + input.  
- **Patch-inn / patch-ut:** tabellen sender små endringer (patch), domenet validerer og lagrer.  
- **Gjenbruk:** samme TableCore brukes i flere moduler via adaptere.  
- **Skalerbart:** start lokalt (IndexedDB) og gå senere over til Firestore eller Supabase uten å endre UI.  

---

## 2. Lagdelt arkitektur

| Lag | Ansvar | Eksempler |
|-----|---------|------------|
| **UI** | Grid (TableCore), Gantt (Progress), Liste/Skjema | `TableCore`, `GanttDiagram` |
| **Adaptere** | Mapping mellom datamodell og kolonner | `ProgressTableAdapter`, `EstimatesTableAdapter` |
| **Domenetjenester** | Regler, beregninger, validering | `calculateDuration()`, `validateDates()` |
| **Repository** | CRUD og batch-operasjoner | `ActivityRepo`, `EstimateRepo` |
| **DB-driver** | Faktisk lagring / lasting | `IndexedDBDriver`, `FirestoreDriver`, `SupabaseDriver` |

---

## 3. Datamodell (grunnstruktur)

### Felles
**Project:** id, name, customer, status, createdAt  
**Event (audit):** id, projectId, artifactType, artifactId, kind(create/update/delete), by, at, payloadJson  

### Progress (fremdrift)
**Activity:** id, projectId, code, name, start, end, durationDays, color, parentId, isMilestone, status, sortIndex, rowVersion  
**Dependency:** id, projectId, fromId, toId, type(FS/SS/FF/SF), lagDays  
**Baseline:** id, projectId, label, createdAt  
**BaselinePoint:** id, baselineId, activityId, blStart, blEnd  

### Estimates (kalkyle)
**EstimateItem:** id, projectId, group, lineNo, name, qty, unit, unitPrice, vatPct, currency, subtotal(derived), notes, rowVersion  

### Structured Docs (skjemaer)
**FormTemplate:** id, orgId, name, version, fields[{id, label, type, required?, options?[]}]  
**FormEntry:** id, projectId, templateId, values{[fieldId]:any}, status(draft/active/archived), createdAt, updatedAt, rowVersion  

---

## 4. TableCore – kontrakt og funksjoner

### Props (inn)
- columns: ColumnDef[]  
- rows: Row[]  
- readonly?: boolean  
- selection?: Selection  
- keymap?: KeyBindings  
- onPatch?: (patch) => void  
- onSelectionChange?: (sel) => void  
- onCommit?: () => void  

### Patch-typer
- **CellPatch:** { rowId, colId, oldValue, nextValue }  
- **RowPatch:** { rowId, changes: {colId: {old,next}} }  
- **BulkPatch:** { patches: CellPatch[] }  

### MVP-funksjoner
- Multi-markering og autofill  
- Kopier/lim (TSV/HTML)  
- Undo/redo  
- Tastatur (Enter, Tab, Ctrl/Cmd + C/V/Z/Y)  
- Celltyper: tekst, tall, dato, select, farge  
- Validering med visuell tilbakemelding  
- Virtuell rulling (store datasett)

### Neste
- Frys kolonner, hurtigsøk, filter, grupper, custom editors.

---

## 5. Adaptere (eksempler)

**ProgressTableAdapter**
| Kolonne | Type | Logikk |
|----------|------|--------|
| code | text | — |
| name | text | — |
| start | date | endres → oppdater end |
| end | date | endres → oppdater durationDays |
| durationDays | number | derived |
| color | color | — |
| status | select | — |

**EstimatesTableAdapter**
| Kolonne | Type | Logikk |
|----------|------|--------|
| lineNo | int | — |
| group | text | — |
| name | text | — |
| qty | number | × unitPrice |
| unitPrice | number | × qty |
| subtotal | number | derived |
| vatPct | number | beregn total |
| currency | select | — |

**FormTableAdapter**
- Genereres dynamisk fra `FormTemplate.fields`.

---

## 6. Repository-kontrakt

- listByProject(projectId)  
- get(id)  
- patch(id, patch, {rowVersion})  
- bulkPatch(projectId, bulk)  
- create(data)  
- delete(id)

Optimistisk låsing: `rowVersion` økes ved lagring. Konflikt → vis diff og tilbud om “merge” eller reload.

---

## 7. DB-drivere

**IndexedDBDriver (stand-alone)**  
Lokal database med eksport/import (JSON).  
Transaksjonell patch/bulkPatch.

**FirestoreDriver**  
Collections per entitet (`/projects/{id}/activities`).  
Automatisk cache og offline-støtte.

**SupabaseDriver**  
SQL-basert med RLS for prosjekt-tilgang.  
Brukes for team/samarbeid.

---

## 8. Synkronisering og samtidighet

- Optimistic UI: vis endring umiddelbart, revert ved feil.  
- Row-locking: `editingBy` + `editingAt` (utløp etter N min).  
- Konfliktpolicy: “sist lagret vinner” + diff-visning.

---

## 9. ID-, tid- og språkregler

- ID: `ulid()` / `uuid()`  
- Tid: ISO 8601 (UTC) → vis i lokal tid.  
- Språk: alle etiketter i UI via `i18n`. Datamodell bruker engelske feltnavn.

---

## 10. Testmål (før første brukertest)

- Kopier/lim test: 2×3, 50×10, 1×1000 celler.  
- Undo/redo med blandede celltyper.  
- Dato-logikk: endre start/duration/end i ulike rekkefølger.  
- Ytelse: 10k rader, batch-patch 200 endringer.  
- Konflikt: simulér to klienter som endrer samme rad.  
- Eksport/import: rundtur uten datatap.

---

## 11. Neste steg

1. Implementere **IndexedDBDriver** som første driver.  
2. Lage **ProgressTableAdapter** (første reelle adapter).  
3. Bygge enkel testapp for TableCore med 2–3 kolonner og dummy-data.  
4. Utvide til Estimates og Structured Docs.  

---

**Versjon:** 1.0  
**Dato:** Oktober 2025  
**Forfatter:** MorningCoffee Labs
