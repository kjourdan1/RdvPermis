// web/components/CreneauGroup.tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatHeure, type CreneauGroupData } from '@/lib/creneaux';

export function CreneauGroup({ group }: { group: CreneauGroupData }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-lg font-semibold">
        {group.departement} · {group.creneaux.length} créneau
        {group.creneaux.length > 1 ? 'x' : ''}
      </h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Centre</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Heure</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {group.creneaux.map((c, i) => (
            <TableRow key={`${c.centre}-${c.date}-${c.heure}-${i}`}>
              <TableCell>{c.centre}</TableCell>
              <TableCell>{new Date(`${c.date}T00:00:00`).toLocaleDateString('fr-FR')}</TableCell>
              <TableCell>{formatHeure(c.heure)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
