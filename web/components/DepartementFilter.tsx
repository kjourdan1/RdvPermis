// web/components/DepartementFilter.tsx
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { DEPARTEMENTS, buildFilterHref } from '@/lib/creneaux';

export function DepartementFilter({ selected }: { selected: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {DEPARTEMENTS.map((departement) => {
        const isSelected = selected.includes(departement);
        return (
          <Link key={departement} href={buildFilterHref(selected, departement)}>
            <Badge variant={isSelected ? 'default' : 'outline'} className="cursor-pointer">
              {departement}
            </Badge>
          </Link>
        );
      })}
    </div>
  );
}
