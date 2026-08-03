// Île-de-France + the 8 bordering departements (16 total), zero-padded to
// match this API's 3-character code format. Scaled back from all 101 French
// departements (see git history) after the account got rate-limited by the
// site's own "Nombre maximum de requêtes atteint" anti-abuse control on
// 2026-08-03 -- checking all 101 every 15 minutes at peak was too much
// volume for a per-account limit. Same 16 codes as IDF_ET_VOISINS in
// web/lib/departements.ts -- keep the two lists in sync, the dashboard's
// department picker only offers what this actually checks.
export const DEPARTEMENTS = [
  '075', '077', '078', '091', '092', '093', '094', '095',
  '002', '010', '027', '028', '045', '051', '060', '089',
];

export interface PeakWindow {
  startHour: number;
  endHour: number;
}

export const PEAK_WINDOWS: PeakWindow[] = [
  { startHour: 8, endHour: 9 },
  { startHour: 11, endHour: 14 },
  { startHour: 16, endHour: 18 },
];

export const PEAK_CHECK_INTERVAL_MINUTES = 15;
export const OFF_PEAK_CHECK_INTERVAL_MINUTES = 60;
export const MIN_DELAY_MS = 1000;
export const MAX_DELAY_MS = 2000;
