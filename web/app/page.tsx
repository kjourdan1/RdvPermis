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

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-bold">RdvPermis-IDF — Créneaux disponibles</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Dernière vérification :{' '}
        {lastChecked
          ? new Date(lastChecked).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
          : 'jamais'}
      </p>
      <DepartementPicker selected={selected} />
      <div className="mt-6">
        {creneaux.length === 0 ? (
          <p className="text-muted-foreground">Aucun créneau disponible pour le moment.</p>
        ) : groups.length === 0 ? (
          <p className="text-muted-foreground">Aucun créneau pour les départements sélectionnés.</p>
        ) : (
          groups.map((group) => <CreneauGroup key={group.departement} group={group} />)
        )}
      </div>
    </main>
  );
}
