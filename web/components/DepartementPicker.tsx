'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SELECTABLE_DEPARTEMENTS, foldForSearch } from '@/lib/departements';
import { buildFilterHref } from '@/lib/creneaux';

const SEARCH_INDEX = SELECTABLE_DEPARTEMENTS.map((d) => ({
  ...d,
  haystack: `${foldForSearch(d.name)} ${d.code.toLowerCase()}`,
}));

export function DepartementPicker({ selected }: { selected: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const listboxId = useId();

  const selectedSet = new Set(selected);
  const allSelected = selected.length === SELECTABLE_DEPARTEMENTS.length;
  const selectedInfo = SELECTABLE_DEPARTEMENTS.filter((d) => selectedSet.has(d.code));

  const trimmedQuery = foldForSearch(query.trim());
  // Every matching departement stays listed regardless of selection state --
  // the checkbox next to it is what shows/toggles whether it's selected, so
  // items can't disappear out from under a user mid multi-select.
  const options = SEARCH_INDEX.filter(
    (d) => trimmedQuery === '' || d.haystack.includes(trimmedQuery)
  );

  function toggle(code: string) {
    // Always a plain toggle against the current selection (add if absent,
    // remove if present) so each checkbox only ever affects its own
    // departement -- no "starting from all-selected replaces the whole
    // selection" shortcut, which would fight the checkbox's own checked
    // state. The dropdown stays open so several departements can be
    // checked in one pass.
    router.push(buildFilterHref(selected, code));
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
            aria-multiselectable="true"
            // Without this, tapping an option on touch devices blurs the
            // input first (mobile browsers fire the synthetic mousedown
            // that precedes a tap's click without a matching relatedTarget,
            // so the onBlur check below can't tell the tap landed inside
            // this listbox) -- isOpen flips to false and unmounts this menu
            // before the tap's click event ever reaches the button.
            // preventDefault on mousedown stops that focus shift without
            // blocking the click that follows.
            onMouseDown={(e) => e.preventDefault()}
            className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md"
          >
            {options.map((d) => {
              const isChecked = selectedSet.has(d.code);
              return (
                <button
                  key={d.code}
                  type="button"
                  role="option"
                  aria-selected={isChecked}
                  onClick={() => toggle(d.code)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${
                      isChecked
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input'
                    }`}
                  >
                    {isChecked && <Check className="size-3" />}
                  </span>
                  <span className="mr-1.5 text-muted-foreground">{d.code}</span>
                  {d.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {allSelected ? (
        <p className="text-sm text-muted-foreground">
          Tous les départements ({SELECTABLE_DEPARTEMENTS.length}) — ouvrez la liste et décochez
          ceux que vous ne voulez pas voir.
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
