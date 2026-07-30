import { getLatestState } from '../lib/state';

export const revalidate = 120;

function formatHeure(heure: string): string {
  return heure.replace(':', 'h');
}

export default async function DashboardPage() {
  const state = await getLatestState();
  const creneaux = state?.creneaux ?? [];
  const lastChecked = state?.lastChecked;

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>RdvPermis-IDF — Créneaux disponibles</h1>
      <p>
        Dernière vérification :{' '}
        {lastChecked
          ? new Date(lastChecked).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
          : 'jamais'}
      </p>
      {creneaux.length === 0 ? (
        <p>Aucun créneau disponible pour le moment.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Département</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Centre</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Date</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>Heure</th>
            </tr>
          </thead>
          <tbody>
            {creneaux.map((c, i) => (
              <tr
                key={`${c.departement}-${c.centre}-${c.date}-${c.heure}-${i}`}
                style={{ backgroundColor: '#e6ffed' }}
              >
                <td>{c.departement}</td>
                <td>{c.centre}</td>
                <td>{new Date(`${c.date}T00:00:00`).toLocaleDateString('fr-FR')}</td>
                <td>{formatHeure(c.heure)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
