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
