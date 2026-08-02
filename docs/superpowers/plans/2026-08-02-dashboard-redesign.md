# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the `web/` dashboard with a real visual identity, a search-based multi-department picker (replacing the static chip row), an "isNew" badge on créneaux, and drop "IDF" from the project's name.

**Architecture:** Reuses the existing shadcn/ui + Tailwind infrastructure, recolored via CSS custom properties to the user-provided mockup's blue palette. A new static `departements.ts` data file (code + French name, 101 entries) replaces the temporary 10-code list in `creneaux.ts`. The department picker becomes a small Client Component that still drives the same URL-based (`?dep=...`) filtering the Server Component page already does — no new data flow, no worker changes.

**Tech Stack:** Next.js 15 (App Router, existing), shadcn/ui + Tailwind CSS (existing), Vitest (existing).

**Spec:** `docs/superpowers/specs/2026-08-02-dashboard-redesign-design.md`

## Global Constraints

- No worker changes. `isNew` is already persisted in the Blob state (previous plan);
  this plan only displays it.
- Department selection stays a display-only filter — it must never change what the worker
  fetches. There is no write path from the dashboard back to the worker.
- Department codes are 3 characters, zero-padded, identical to `worker/src/config.ts`'s
  `DEPARTEMENTS` (e.g. `'078'`, `'02A'`, `'971'`) — this is what actually appears in
  `Creneau.departement` on real data, so any new department list must use the same format.
- No bouton "Actualiser" / no "Vérifications" counter — the real system only checks via cron,
  a fake counter or a button that just reloads the page would misrepresent that.
- `app/page.tsx` stays a Server Component; only the department picker becomes a Client
  Component (`"use client"`) — everything else keeps rendering server-side.

---

## Task 1: `web/lib/departements.ts` — canonical department code + name list

**Files:**
- Create: `web/lib/departements.ts`
- Create: `web/lib/departements.test.ts`

**Interfaces:**
- Produces:
  - `interface DepartementInfo { code: string; name: string }`
  - `DEPARTEMENTS: DepartementInfo[]` (101 entries) — consumed by Task 2 (creneaux.ts),
    Task 4 (DepartementPicker.tsx), Task 5 (CreneauGroup.tsx).

- [ ] **Step 1: Write the failing tests**

Create `web/lib/departements.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DEPARTEMENTS } from './departements';

describe('DEPARTEMENTS', () => {
  it('has exactly 101 entries with no duplicate codes', () => {
    expect(DEPARTEMENTS).toHaveLength(101);
    expect(new Set(DEPARTEMENTS.map((d) => d.code)).size).toBe(101);
  });

  it('uses 3-character codes for every entry, matching the worker format', () => {
    expect(DEPARTEMENTS.every((d) => d.code.length === 3)).toBe(true);
  });

  it('gives every entry a non-empty name', () => {
    expect(DEPARTEMENTS.every((d) => d.name.trim().length > 0)).toBe(true);
  });

  it('spot-checks known codes across the list, including edge cases', () => {
    const byCode = Object.fromEntries(DEPARTEMENTS.map((d) => [d.code, d.name]));
    expect(byCode['001']).toBe('Ain');
    expect(byCode['075']).toBe('Paris');
    expect(byCode['078']).toBe('Yvelines');
    expect(byCode['095']).toBe("Val-d'Oise");
    expect(byCode['02A']).toBe('Corse-du-Sud');
    expect(byCode['02B']).toBe('Haute-Corse');
    expect(byCode['069']).toBe('Rhône');
    expect(byCode['090']).toBe('Territoire de Belfort');
    expect(byCode['971']).toBe('Guadeloupe');
    expect(byCode['976']).toBe('Mayotte');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd web
npm test -- departements
```

Expected: FAIL — `Cannot find module './departements'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `web/lib/departements.ts`. The code for each entry is the 3-character, zero-padded code
already used by `worker/src/config.ts`'s `DEPARTEMENTS` (same source list, same transform:
`'01'` → `'001'`, `'2A'` → `'02A'`, DOM codes already 3 digits, unchanged); the name is the
matching French département name.

```typescript
// web/lib/departements.ts
export interface DepartementInfo {
  code: string; // 3 characters, zero-padded -- matches worker/src/config.ts and Creneau.departement
  name: string;
}

export const DEPARTEMENTS: DepartementInfo[] = [
  { code: '001', name: 'Ain' },
  { code: '002', name: 'Aisne' },
  { code: '003', name: 'Allier' },
  { code: '004', name: 'Alpes-de-Haute-Provence' },
  { code: '005', name: 'Hautes-Alpes' },
  { code: '006', name: 'Alpes-Maritimes' },
  { code: '007', name: 'Ardèche' },
  { code: '008', name: 'Ardennes' },
  { code: '009', name: 'Ariège' },
  { code: '010', name: 'Aube' },
  { code: '011', name: 'Aude' },
  { code: '012', name: 'Aveyron' },
  { code: '013', name: 'Bouches-du-Rhône' },
  { code: '014', name: 'Calvados' },
  { code: '015', name: 'Cantal' },
  { code: '016', name: 'Charente' },
  { code: '017', name: 'Charente-Maritime' },
  { code: '018', name: 'Cher' },
  { code: '019', name: 'Corrèze' },
  { code: '021', name: "Côte-d'Or" },
  { code: '022', name: "Côtes-d'Armor" },
  { code: '023', name: 'Creuse' },
  { code: '024', name: 'Dordogne' },
  { code: '025', name: 'Doubs' },
  { code: '026', name: 'Drôme' },
  { code: '027', name: 'Eure' },
  { code: '028', name: 'Eure-et-Loir' },
  { code: '029', name: 'Finistère' },
  { code: '02A', name: 'Corse-du-Sud' },
  { code: '02B', name: 'Haute-Corse' },
  { code: '030', name: 'Gard' },
  { code: '031', name: 'Haute-Garonne' },
  { code: '032', name: 'Gers' },
  { code: '033', name: 'Gironde' },
  { code: '034', name: 'Hérault' },
  { code: '035', name: 'Ille-et-Vilaine' },
  { code: '036', name: 'Indre' },
  { code: '037', name: 'Indre-et-Loire' },
  { code: '038', name: 'Isère' },
  { code: '039', name: 'Jura' },
  { code: '040', name: 'Landes' },
  { code: '041', name: 'Loir-et-Cher' },
  { code: '042', name: 'Loire' },
  { code: '043', name: 'Haute-Loire' },
  { code: '044', name: 'Loire-Atlantique' },
  { code: '045', name: 'Loiret' },
  { code: '046', name: 'Lot' },
  { code: '047', name: 'Lot-et-Garonne' },
  { code: '048', name: 'Lozère' },
  { code: '049', name: 'Maine-et-Loire' },
  { code: '050', name: 'Manche' },
  { code: '051', name: 'Marne' },
  { code: '052', name: 'Haute-Marne' },
  { code: '053', name: 'Mayenne' },
  { code: '054', name: 'Meurthe-et-Moselle' },
  { code: '055', name: 'Meuse' },
  { code: '056', name: 'Morbihan' },
  { code: '057', name: 'Moselle' },
  { code: '058', name: 'Nièvre' },
  { code: '059', name: 'Nord' },
  { code: '060', name: 'Oise' },
  { code: '061', name: 'Orne' },
  { code: '062', name: 'Pas-de-Calais' },
  { code: '063', name: 'Puy-de-Dôme' },
  { code: '064', name: 'Pyrénées-Atlantiques' },
  { code: '065', name: 'Hautes-Pyrénées' },
  { code: '066', name: 'Pyrénées-Orientales' },
  { code: '067', name: 'Bas-Rhin' },
  { code: '068', name: 'Haut-Rhin' },
  { code: '069', name: 'Rhône' },
  { code: '070', name: 'Haute-Saône' },
  { code: '071', name: 'Saône-et-Loire' },
  { code: '072', name: 'Sarthe' },
  { code: '073', name: 'Savoie' },
  { code: '074', name: 'Haute-Savoie' },
  { code: '075', name: 'Paris' },
  { code: '076', name: 'Seine-Maritime' },
  { code: '077', name: 'Seine-et-Marne' },
  { code: '078', name: 'Yvelines' },
  { code: '079', name: 'Deux-Sèvres' },
  { code: '080', name: 'Somme' },
  { code: '081', name: 'Tarn' },
  { code: '082', name: 'Tarn-et-Garonne' },
  { code: '083', name: 'Var' },
  { code: '084', name: 'Vaucluse' },
  { code: '085', name: 'Vendée' },
  { code: '086', name: 'Vienne' },
  { code: '087', name: 'Haute-Vienne' },
  { code: '088', name: 'Vosges' },
  { code: '089', name: 'Yonne' },
  { code: '090', name: 'Territoire de Belfort' },
  { code: '091', name: 'Essonne' },
  { code: '092', name: 'Hauts-de-Seine' },
  { code: '093', name: 'Seine-Saint-Denis' },
  { code: '094', name: 'Val-de-Marne' },
  { code: '095', name: "Val-d'Oise" },
  { code: '971', name: 'Guadeloupe' },
  { code: '972', name: 'Martinique' },
  { code: '973', name: 'Guyane' },
  { code: '974', name: 'La Réunion' },
  { code: '976', name: 'Mayotte' },
];
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- departements
```

Expected: PASS, all 4 tests green.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web/lib/departements.ts web/lib/departements.test.ts
git commit -m "feat(web): add the 101-departement code+name reference list"
```

---

## Task 2: Point `creneaux.ts` at the new department list

**Files:**
- Modify: `web/lib/creneaux.ts`

**Interfaces:**
- Consumes: `DEPARTEMENTS: DepartementInfo[]` from `@/lib/departements` (Task 1).
- Produces: `DEPARTEMENTS: string[]` (unchanged name/type/export, now derived from the 101-entry
  list instead of the old hardcoded 10 — every other export in this file keeps its exact current
  signature: `parseSelectedDepartements`, `filterAndGroup`, `buildFilterHref`, `formatHeure`,
  `CreneauGroupData`).

This is a pure refactor: `web/lib/creneaux.test.ts` already exercises `parseSelectedDepartements`,
`filterAndGroup`, and `buildFilterHref` using department codes (`'078'`, `'091'`, `'092'`,
`'093'`, `'095'`) that exist in both the old 10-code list and the new 101-code list, and asserts
`parseSelectedDepartements(undefined)` equals the (now 101-long) `DEPARTEMENTS` export directly
rather than a hardcoded count — so the existing test file needs no changes and must stay green
throughout.

- [ ] **Step 1: Confirm the existing tests pass before touching anything**

```bash
cd web
npm test -- creneaux
```

Expected: PASS (13 tests, unchanged from before this task).

- [ ] **Step 2: Replace the hardcoded department list with the import**

In `web/lib/creneaux.ts`, replace the top of the file (the import line and the `DEPARTEMENTS`
constant with its explanatory comment) with:

```typescript
// web/lib/creneaux.ts
import type { Creneau } from './state';
import { DEPARTEMENTS as DEPARTEMENTS_INFO } from './departements';

export const DEPARTEMENTS = DEPARTEMENTS_INFO.map((d) => d.code);
```

Leave everything below that (the `CreneauGroupData` interface, `parseSelectedDepartements`,
`filterAndGroup`, `buildFilterHref`, `formatHeure`) exactly as it is today — none of those
functions' bodies change, only what `DEPARTEMENTS` now contains.

- [ ] **Step 3: Run tests to verify they still pass**

```bash
npm test -- creneaux
```

Expected: PASS, still 13 tests green (same test file, unmodified).

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/lib/creneaux.ts
git commit -m "feat(web): source DEPARTEMENTS from the 101-entry departements.ts list"
```

---

## Task 3: Recolor `globals.css` to the mockup's blue palette

**Files:**
- Modify: `web/app/globals.css`

**Interfaces:**
- Produces: no code interface — this changes only the color values behind the shadcn CSS
  variable names every component already uses (`bg-primary`, `text-muted-foreground`,
  `bg-destructive/10`, etc.), so Tasks 4-6 automatically pick up the new palette without
  importing anything new.

- [ ] **Step 1: Replace the light-mode (`:root`) color tokens**

In `web/app/globals.css`, inside the existing `:root { ... }` block, replace these specific
lines (leave `--radius`, `--chart-*`, and `--sidebar-*` exactly as they are — this app doesn't
use charts or a sidebar):

Before:
```css
    --background: oklch(1 0 0);
    --foreground: oklch(0.145 0 0);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.145 0 0);
    --popover: oklch(1 0 0);
    --popover-foreground: oklch(0.145 0 0);
    --primary: oklch(0.205 0 0);
    --primary-foreground: oklch(0.985 0 0);
    --secondary: oklch(0.97 0 0);
    --secondary-foreground: oklch(0.205 0 0);
    --muted: oklch(0.97 0 0);
    --muted-foreground: oklch(0.556 0 0);
    --accent: oklch(0.97 0 0);
    --accent-foreground: oklch(0.205 0 0);
    --destructive: oklch(0.577 0.245 27.325);
    --border: oklch(0.922 0 0);
    --input: oklch(0.922 0 0);
    --ring: oklch(0.708 0 0);
```

After (values taken from the mockup's `:root` block -- `--paper`/`--white`/`--ink-*` for the
neutral tones, `--blue-*` for primary/accent, `--red-600` for destructive):
```css
    --background: #f4f5fa;
    --foreground: #1b1c28;
    --card: #ffffff;
    --card-foreground: #1b1c28;
    --popover: #ffffff;
    --popover-foreground: #1b1c28;
    --primary: #1a3aad;
    --primary-foreground: #ffffff;
    --secondary: #e8ecfb;
    --secondary-foreground: #1a3aad;
    --muted: #eceef5;
    --muted-foreground: #50515f;
    --accent: #e8ecfb;
    --accent-foreground: #1a3aad;
    --destructive: #ba2c1f;
    --border: #dde0ee;
    --input: #dde0ee;
    --ring: #3b5bdb;
```

Leave the `.dark { ... }` block untouched — this app has no theme toggle, dark mode is unused
dead code already (noted in a previous review), not something this plan adds new dependents on.

- [ ] **Step 2: Typecheck and run the full test suite**

```bash
cd web
npm run typecheck
npm test
```

Expected: no errors, all tests still passing (CSS-only change, nothing here is exercised by
Vitest).

- [ ] **Step 3: Commit**

```bash
git add web/app/globals.css
git commit -m "style(web): recolor shadcn tokens to the dashboard mockup's blue palette"
```

---

## Task 4: `components/DepartementPicker.tsx` — search-based department picker

**Files:**
- Create: `web/components/DepartementPicker.tsx`
- Delete: `web/components/DepartementFilter.tsx`

**Interfaces:**
- Consumes: `DEPARTEMENTS: DepartementInfo[]` from `@/lib/departements` (Task 1);
  `buildFilterHref(selected: string[], departement: string): string` from `@/lib/creneaux`
  (existing, unchanged signature); `Badge` from `@/components/ui/badge` (existing).
- Produces: `DepartementPicker({ selected: string[] })` — a React Client Component, consumed by
  Task 6 in place of the deleted `DepartementFilter`.

- [ ] **Step 1: Delete the old component**

```bash
git rm web/components/DepartementFilter.tsx
```

- [ ] **Step 2: Write the new component**

Create `web/components/DepartementPicker.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { DEPARTEMENTS } from '@/lib/departements';
import { buildFilterHref } from '@/lib/creneaux';

export function DepartementPicker({ selected }: { selected: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const selectedInfo = DEPARTEMENTS.filter((d) => selected.includes(d.code));

  const trimmedQuery = query.trim().toLowerCase();
  const suggestions =
    trimmedQuery === ''
      ? []
      : DEPARTEMENTS.filter(
          (d) =>
            !selected.includes(d.code) &&
            (d.name.toLowerCase().includes(trimmedQuery) ||
              d.code.toLowerCase().includes(trimmedQuery))
        ).slice(0, 8);

  function toggle(code: string) {
    router.push(buildFilterHref(selected, code));
    setQuery('');
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ajouter un département (ex : Rhône, 69, Paris)"
          autoComplete="off"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {suggestions.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
            {suggestions.map((d) => (
              <button
                key={d.code}
                type="button"
                onClick={() => toggle(d.code)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span className="mr-1.5 text-muted-foreground">{d.code}</span>
                {d.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {selectedInfo.map((d) => (
          <Badge key={d.code} variant="secondary" className="gap-1 pr-1">
            {d.name} ({d.code})
            <button
              type="button"
              onClick={() => toggle(d.code)}
              aria-label={`Retirer ${d.name}`}
              className="ml-1 rounded-full hover:bg-primary/20"
            >
              ×
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd web
npm run typecheck
```

Expected: no errors. (No unit test for this component — Client Component with DOM/search
interaction, consistent with the previous `DepartementFilter` also having no test.)

- [ ] **Step 4: Commit**

```bash
git add web/components/DepartementPicker.tsx web/components/DepartementFilter.tsx
git commit -m "feat(web): replace the static department chip row with a search-based picker"
```

---

## Task 5: `CreneauGroup.tsx` — show department name and the "Nouveau" badge

**Files:**
- Modify: `web/components/CreneauGroup.tsx`

**Interfaces:**
- Consumes: `DEPARTEMENTS: DepartementInfo[]` from `@/lib/departements` (Task 1); `Badge` from
  `@/components/ui/badge` (existing); `Creneau.isNew?: boolean` from `@/lib/state` (already
  present, added in the previous plan).
- Produces: `CreneauGroup({ group: CreneauGroupData })` — same signature as today, consumed by
  Task 6.

- [ ] **Step 1: Update the component**

Replace the contents of `web/components/CreneauGroup.tsx`:

```tsx
// web/components/CreneauGroup.tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatHeure, type CreneauGroupData } from '@/lib/creneaux';
import { DEPARTEMENTS } from '@/lib/departements';

export function CreneauGroup({ group }: { group: CreneauGroupData }) {
  const info = DEPARTEMENTS.find((d) => d.code === group.departement);
  const name = info ? info.name : group.departement;

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-lg font-semibold">
        {group.departement} · {name} · {group.creneaux.length} créneau
        {group.creneaux.length > 1 ? 'x' : ''}
      </h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Centre</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Heure</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {group.creneaux.map((c, i) => (
            <TableRow key={`${c.centre}-${c.date}-${c.heure}-${i}`}>
              <TableCell>{c.centre}</TableCell>
              <TableCell>{new Date(`${c.date}T00:00:00`).toLocaleDateString('fr-FR')}</TableCell>
              <TableCell>{formatHeure(c.heure)}</TableCell>
              <TableCell>
                {c.isNew ? <Badge variant="destructive">Nouveau</Badge> : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd web
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/CreneauGroup.tsx
git commit -m "feat(web): show departement name and a Nouveau badge in CreneauGroup"
```

---

## Task 6: Rewrite `page.tsx`, drop "IDF" everywhere

**Files:**
- Modify: `web/app/page.tsx`
- Modify: `web/app/layout.tsx`
- Modify: `web/app/error.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `getLatestState` from `@/lib/state` (unchanged); `parseSelectedDepartements`,
  `filterAndGroup` from `@/lib/creneaux` (unchanged); `DepartementPicker` (Task 4); `CreneauGroup`
  (Task 5).

- [ ] **Step 1: Rewrite the page**

Replace the contents of `web/app/page.tsx`:

```tsx
import Link from 'next/link';
import { getLatestState } from '@/lib/state';
import { parseSelectedDepartements, filterAndGroup } from '@/lib/creneaux';
import { DepartementPicker } from '@/components/DepartementPicker';
import { CreneauGroup } from '@/components/CreneauGroup';

export const revalidate = 120;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ dep?: string }>;
}) {
  const { dep } = await searchParams;
  const selected = parseSelectedDepartements(dep);

  const state = await getLatestState();
  const creneaux = state?.creneaux ?? [];
  const lastChecked = state?.lastChecked;
  const groups = filterAndGroup(creneaux, selected);
  const totalSlotsShown = groups.reduce((sum, g) => sum + g.creneaux.length, 0);

  return (
    <>
      <div className="h-1 w-full bg-gradient-to-r from-primary via-white to-destructive" />
      <header className="bg-primary px-4 pb-4 pt-5 text-primary-foreground">
        <div className="mx-auto flex max-w-3xl items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-secondary to-primary-foreground/20 text-sm font-bold">
              RP
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">RdvPermis</h1>
              <p className="text-xs text-primary-foreground/70">
                Suivi des places d&apos;examen du permis de conduire
              </p>
            </div>
          </div>
          <Link
            href="https://github.com/kjourdan1/RdvPermis"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 whitespace-nowrap rounded-full border border-primary-foreground/25 px-3 py-1.5 text-xs text-primary-foreground/90 hover:bg-primary-foreground/10"
          >
            GitHub ↗
          </Link>
        </div>
        <div className="mx-auto mt-3 max-w-3xl rounded-md border border-primary-foreground/15 bg-primary-foreground/10 p-2.5 text-[11.5px] leading-relaxed text-primary-foreground/80">
          Projet communautaire indépendant, non affilié à l&apos;État ni à l&apos;ANTS.
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-6">
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
            <div className="text-2xl font-bold text-primary">{totalSlotsShown}</div>
            <div className="mt-1 text-xs text-muted-foreground">Places trouvées</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
            <div className="text-2xl font-bold text-primary">{selected.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">Départements sélectionnés</div>
          </div>
        </div>

        <section className="mb-6 rounded-lg border border-border bg-card p-3.5 shadow-sm">
          <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Départements à afficher
          </h2>
          <DepartementPicker selected={selected} />
          <p className="mt-3 text-xs text-muted-foreground">
            Dernière vérification :{' '}
            {lastChecked
              ? new Date(lastChecked).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
              : 'jamais'}
          </p>
        </section>

        {creneaux.length === 0 ? (
          <p className="text-muted-foreground">Aucun créneau disponible pour le moment.</p>
        ) : groups.length === 0 ? (
          <p className="text-muted-foreground">Aucun créneau pour les départements sélectionnés.</p>
        ) : (
          groups.map((group) => <CreneauGroup key={group.departement} group={group} />)
        )}
      </main>

      <footer className="mx-auto max-w-3xl px-4 pb-6 text-[11.5px] leading-relaxed text-muted-foreground">
        Code source et configuration du bot sur{' '}
        <Link
          href="https://github.com/kjourdan1/RdvPermis"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          github.com/kjourdan1/RdvPermis
        </Link>
        . Pour réserver un créneau réel, rendez-vous sur votre espace candidat officiel du permis
        de conduire.
      </footer>
    </>
  );
}
```

- [ ] **Step 2: Drop "IDF" from the page title**

In `web/app/layout.tsx`, change:

```typescript
export const metadata = {
  title: 'RdvPermis-IDF',
};
```

to:

```typescript
export const metadata = {
  title: 'RdvPermis',
};
```

Leave the rest of `layout.tsx` (the `<html>`/`<body>` structure, the `globals.css` import)
exactly as it is.

- [ ] **Step 3: Drop "IDF" from the error page**

In `web/app/error.tsx`, change the heading text from `RdvPermis-IDF` to `RdvPermis`:

```tsx
      <h1 className="mb-2 text-2xl font-bold">RdvPermis</h1>
```

Nothing else in that file changes.

- [ ] **Step 4: Drop "IDF" from the README example**

In `README.md`, find this line (the example `gh repo create` command for someone forking the
project):

```
  gh repo create RdvPermis-IDF --public --source=. --remote=origin --push
```

Change it to:

```
  gh repo create RdvPermis --public --source=. --remote=origin --push
```

- [ ] **Step 5: Run the full test suite, typecheck, and build**

```bash
cd web
npm test
npm run typecheck
npm run build
```

Expected: all tests pass (unchanged from Tasks 1-2, nothing here adds new test files beyond
`departements.test.ts`), no type errors, build succeeds.

- [ ] **Step 6: Manually verify**

```bash
npm run dev
```

Open `http://localhost:3000` and check:
- Header shows "RdvPermis" (no "IDF"), blue background, GitHub link, disclaimer banner.
- Two stat cards render with real numbers (Places trouvées, Départements sélectionnés).
- Typing in the search box (e.g. "rhone" or "69") shows matching suggestions; clicking one adds
  it as a removable chip and updates the URL (`?dep=...`).
- Clicking a chip's × removes that department and updates the URL; removing the last chip
  resets to all departments selected (per `buildFilterHref`'s existing `'?'` behavior).
- Each group's heading shows the department code, name, and créneau count (e.g. "078 · Yvelines
  · 2 créneaux").
- If any créneau in the current data has `isNew: true`, its row shows a red "Nouveau" badge.
- Colors throughout are the blue palette from `globals.css`, not the previous gray default.

If you cannot open a browser/visual tool in your environment, use `curl http://localhost:3000/`
and `curl 'http://localhost:3000/?dep=078'` and read the returned HTML for the expected
structure (header text, stat numbers, table rows, badge markup) instead — note in your report
which method you used, consistent with how the previous dashboard plan handled the same
constraint.

- [ ] **Step 7: Commit**

```bash
git add web/app/page.tsx web/app/layout.tsx web/app/error.tsx README.md
git commit -m "feat(web): redesign the dashboard page and drop IDF from the project name"
```
