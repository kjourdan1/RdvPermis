# IDF + Neighboring-Departments Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pinned special entry to `DepartementPicker`'s dropdown that replaces the current
department selection with Île-de-France's 8 departments plus the 8 that directly border the
region (16 total), so a visitor can jump straight to "IDF + nearby" without adding 16 departments
by hand.

**Architecture:** One new data constant in `web/lib/departements.ts` (single source of truth for
the 16 codes), consumed by `web/components/DepartementPicker.tsx`, which gains a keyword-matched
pinned option at the top of its existing dropdown list. No new files, no worker changes, no new
dependency.

**Tech Stack:** Next.js 15 (App Router, existing), React Client Component (existing), Vitest
(existing).

**Spec:** `docs/superpowers/specs/2026-08-02-idf-voisins-filter-design.md`

## Global Constraints

- Scope is "départements limitrophes" (bordering departments), not full neighboring
  administrative regions — exactly these 16 codes: `075, 077, 078, 091, 092, 093, 094, 095` (IDF)
  + `002, 010, 027, 028, 045, 051, 060, 089` (bordering).
- The preset entry REPLACES the current selection (`?dep=<16 codes>`), it does not toggle/add like
  `buildFilterHref` does for a single department.
- `DepartementPicker.tsx`'s existing selection logic (`buildFilterHref`, `foldForSearch`,
  `SEARCH_INDEX`, the `allSelected` branch, the focus-containment open/close, Escape-to-close, the
  combobox ARIA attributes) must not change behavior — this task only adds a new pinned option
  alongside the existing ones.
- No worker changes. No new dependency.

---

## Task 1: `IDF_ET_VOISINS` preset + dropdown entry

**Files:**
- Modify: `web/lib/departements.ts`
- Modify: `web/lib/departements.test.ts`
- Modify: `web/components/DepartementPicker.tsx`

**Interfaces:**
- Produces: `IDF_ET_VOISINS: string[]` exported from `web/lib/departements.ts` — 16 department
  codes, same 3-character zero-padded format as `DEPARTEMENTS[].code`.
- Consumes (in `DepartementPicker.tsx`): `IDF_ET_VOISINS` from `@/lib/departements`, alongside the
  already-imported `DEPARTEMENTS`, `foldForSearch`.

- [ ] **Step 1: Write the failing test for `IDF_ET_VOISINS`**

Add to `web/lib/departements.test.ts` (new `describe` block, after the existing `foldForSearch`
block):

```ts
describe('IDF_ET_VOISINS', () => {
  it('has exactly 16 entries with no duplicates', () => {
    expect(IDF_ET_VOISINS).toHaveLength(16);
    expect(new Set(IDF_ET_VOISINS).size).toBe(16);
  });

  it('is a subset of known department codes', () => {
    const knownCodes = new Set(DEPARTEMENTS.map((d) => d.code));
    expect(IDF_ET_VOISINS.every((code) => knownCodes.has(code))).toBe(true);
  });

  it('includes all 8 Île-de-France departments', () => {
    const idf = ['075', '077', '078', '091', '092', '093', '094', '095'];
    expect(idf.every((code) => IDF_ET_VOISINS.includes(code))).toBe(true);
  });

  it('includes the 8 bordering departments', () => {
    const bordering = ['002', '010', '027', '028', '045', '051', '060', '089'];
    expect(bordering.every((code) => IDF_ET_VOISINS.includes(code))).toBe(true);
  });
});
```

Update the top import line of the same file to also pull in `IDF_ET_VOISINS`:

```ts
import { DEPARTEMENTS, IDF_ET_VOISINS, foldForSearch } from './departements';
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd web
npm test -- departements.test.ts
```

Expected: FAIL — `IDF_ET_VOISINS` is not exported yet (import error or `undefined`).

- [ ] **Step 3: Implement `IDF_ET_VOISINS`**

In `web/lib/departements.ts`, add this export after the `DEPARTEMENTS` array (i.e., at the end of
the file):

```ts
// Île-de-France (8 departments) + the 8 departments that directly border the region —
// used by DepartementPicker's "IDF + voisins" preset. Bordering, not full neighboring
// administrative regions (e.g. excludes the Manche, all the way out in Normandie).
export const IDF_ET_VOISINS: string[] = [
  '075', '077', '078', '091', '092', '093', '094', '095',
  '002', '010', '027', '028', '045', '051', '060', '089',
];
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd web
npm test -- departements.test.ts
```

Expected: PASS, all `IDF_ET_VOISINS` tests plus the pre-existing `DEPARTEMENTS`/`foldForSearch`
tests in the same file green.

- [ ] **Step 5: Add the pinned dropdown entry to `DepartementPicker.tsx`**

Current file (for reference — this is what Step 5 modifies):

```tsx
'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DEPARTEMENTS, foldForSearch } from '@/lib/departements';
import { buildFilterHref } from '@/lib/creneaux';

const SEARCH_INDEX = DEPARTEMENTS.map((d) => ({
  ...d,
  haystack: `${foldForSearch(d.name)} ${d.code.toLowerCase()}`,
}));

export function DepartementPicker({ selected }: { selected: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const listboxId = useId();

  const selectedSet = new Set(selected);
  const allSelected = selected.length === DEPARTEMENTS.length;
  const selectedInfo = DEPARTEMENTS.filter((d) => selectedSet.has(d.code));

  const trimmedQuery = foldForSearch(query.trim());
  const options = SEARCH_INDEX.filter(
    (d) =>
      (allSelected || !selectedSet.has(d.code)) &&
      (trimmedQuery === '' || d.haystack.includes(trimmedQuery))
  );

  function toggle(code: string) {
    if (allSelected) {
      router.push(`?dep=${code}`);
    } else {
      router.push(buildFilterHref(selected, code));
    }
    setQuery('');
    setIsOpen(false);
  }

  return (
    <div className="space-y-3">
      <div
        className="relative"
        onFocus={() => setIsOpen(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsOpen(false);
          }
        }}
      >
        <input
          type="text"
          role="combobox"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsOpen(false);
            }
          }}
          placeholder="Ajouter un département (ex : Rhône, 69, Paris)"
          aria-label="Rechercher un département"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          autoComplete="off"
          className="w-full rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        {isOpen && options.length > 0 && (
          <div
            id={listboxId}
            role="listbox"
            className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md"
          >
            {options.map((d) => (
              <button
                key={d.code}
                type="button"
                role="option"
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
      {allSelected ? (
        <p className="text-sm text-muted-foreground">
          Tous les départements ({DEPARTEMENTS.length}) — ouvrez la liste ou recherchez-en un pour
          n&apos;afficher que celui-là.
        </p>
      ) : (
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
      )}
    </div>
  );
}
```

Replace the whole file with:

```tsx
'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DEPARTEMENTS, IDF_ET_VOISINS, foldForSearch } from '@/lib/departements';
import { buildFilterHref } from '@/lib/creneaux';

const SEARCH_INDEX = DEPARTEMENTS.map((d) => ({
  ...d,
  haystack: `${foldForSearch(d.name)} ${d.code.toLowerCase()}`,
}));

const IDF_PRESET_LABEL = `Île-de-France + départements voisins (${IDF_ET_VOISINS.length})`;
const IDF_PRESET_KEYWORDS = ['idf', 'ile de france', 'voisin', 'voisins'];

function matchesIdfPreset(trimmedQuery: string): boolean {
  return trimmedQuery === '' || IDF_PRESET_KEYWORDS.some((k) => k.includes(trimmedQuery));
}

export function DepartementPicker({ selected }: { selected: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const listboxId = useId();

  const selectedSet = new Set(selected);
  const allSelected = selected.length === DEPARTEMENTS.length;
  const selectedInfo = DEPARTEMENTS.filter((d) => selectedSet.has(d.code));

  const trimmedQuery = foldForSearch(query.trim());
  const options = SEARCH_INDEX.filter(
    (d) =>
      (allSelected || !selectedSet.has(d.code)) &&
      (trimmedQuery === '' || d.haystack.includes(trimmedQuery))
  );
  const showIdfPreset = matchesIdfPreset(trimmedQuery);

  function toggle(code: string) {
    if (allSelected) {
      router.push(`?dep=${code}`);
    } else {
      router.push(buildFilterHref(selected, code));
    }
    setQuery('');
    setIsOpen(false);
  }

  function applyPreset(codes: string[]) {
    router.push(`?dep=${codes.join(',')}`);
    setQuery('');
    setIsOpen(false);
  }

  return (
    <div className="space-y-3">
      <div
        className="relative"
        onFocus={() => setIsOpen(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsOpen(false);
          }
        }}
      >
        <input
          type="text"
          role="combobox"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsOpen(false);
            }
          }}
          placeholder="Ajouter un département (ex : Rhône, 69, Paris)"
          aria-label="Rechercher un département"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          autoComplete="off"
          className="w-full rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        {isOpen && (showIdfPreset || options.length > 0) && (
          <div
            id={listboxId}
            role="listbox"
            className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md"
          >
            {showIdfPreset && (
              <button
                type="button"
                role="option"
                onClick={() => applyPreset(IDF_ET_VOISINS)}
                className="block w-full px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent hover:text-accent-foreground"
              >
                {IDF_PRESET_LABEL}
              </button>
            )}
            {options.map((d) => (
              <button
                key={d.code}
                type="button"
                role="option"
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
      {allSelected ? (
        <p className="text-sm text-muted-foreground">
          Tous les départements ({DEPARTEMENTS.length}) — ouvrez la liste ou recherchez-en un pour
          n&apos;afficher que celui-là.
        </p>
      ) : (
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
      )}
    </div>
  );
}
```

What changed vs. the current file: two new module-level constants (`IDF_PRESET_LABEL`,
`IDF_PRESET_KEYWORDS`) and a `matchesIdfPreset` helper; inside the component, a `showIdfPreset`
value and an `applyPreset` function; the dropdown's visibility condition gains `|| options.length
> 0` → `showIdfPreset || options.length > 0`; and the dropdown panel renders the pinned preset
button before `options.map(...)` when `showIdfPreset` is true. Everything else — `toggle`,
`buildFilterHref`, `foldForSearch`, `SEARCH_INDEX`, the `allSelected` branch, the chip rendering,
the focus-containment open/close, Escape, and all ARIA attributes — is byte-identical to before.

- [ ] **Step 6: Typecheck and run the full test suite**

```bash
cd web
npm run typecheck
npm test
```

Expected: no errors, all tests pass (the 4 new `IDF_ET_VOISINS` tests from Step 1 plus every
pre-existing test in `departements.test.ts`, `creneaux.test.ts`, `state.test.ts`).

- [ ] **Step 7: Manually verify**

```bash
npm run dev
```

Open `http://localhost:3000` and check:
- Focusing the search input with nothing typed shows "Île-de-France + départements voisins (16)"
  pinned at the top of the list, above the regular department options.
- Typing "idf", "voisin", or "ile de france" (no accent needed) keeps that entry visible,
  filtering out unrelated department options as usual.
- Typing something unrelated (e.g. "rhone") hides the preset entry and shows only matching
  departments, same as before this change.
- Clicking the preset entry sets the selection to exactly the 16 departments (visible as 16
  individual removable badges below the search field) and closes the dropdown.
- Individual departments can still be searched, added, and removed exactly as before — this
  change doesn't alter that behavior.

**Known environment constraint**: this sandbox redacts `BLOB_READ_WRITE_TOKEN`-shaped secrets
before they reach disk, so `npm run dev`'s real page load will 500 regardless of this task's
correctness — a prior, already-diagnosed limitation. If you hit it, use the same fixture-render
approach used for this component in earlier tasks (a throwaway `react-dom/server` script against
the real, already-committed `DepartementPicker`, with `isOpen` forced open and a couple of `query`
values including `''`, `'idf'`, and `'rhone'`, to confirm the preset entry shows/hides correctly
and the regular option list is unaffected) — delete the script afterward, don't commit it. Note in
your report which method you used.

- [ ] **Step 8: Commit**

```bash
git add web/lib/departements.ts web/lib/departements.test.ts web/components/DepartementPicker.tsx
git commit -m "feat(web): add IDF + neighboring-departments preset to DepartementPicker"
```
