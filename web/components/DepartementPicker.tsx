'use client';

import { useState } from 'react';
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
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          placeholder="Ajouter un département (ex : Rhône, 69, Paris)"
          aria-label="Rechercher un département"
          autoComplete="off"
          className="w-full rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        {isOpen && options.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
            {options.map((d) => (
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
      {allSelected ? (
        <p className="text-sm text-muted-foreground">
          Tous les départements ({DEPARTEMENTS.length}) — recherchez-en un pour n&apos;afficher
          que celui-là.
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
