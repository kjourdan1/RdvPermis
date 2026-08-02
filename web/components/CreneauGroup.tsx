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
