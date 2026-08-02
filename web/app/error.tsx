'use client';

import { Button } from '@/components/ui/button';

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-2xl font-bold">RdvPermis-IDF</h1>
      <p className="mb-4 text-muted-foreground">
        Impossible de charger les créneaux pour le moment, réessaie dans quelques instants.
      </p>
      <Button onClick={reset}>Réessayer</Button>
    </main>
  );
}
