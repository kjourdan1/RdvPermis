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
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-secondary to-primary-foreground/20 text-sm font-bold text-primary">
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
