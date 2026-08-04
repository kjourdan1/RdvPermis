// Narrowed further to just 4 departements -- 77 (Seine-et-Marne), 78
// (Yvelines), 27 (Eure), 28 (Eure-et-Loir) -- zero-padded to match this
// API's 3-character code format. Was 16 (IDF + all 8 bordering departements,
// see git history) after an earlier cutback from all 101 following a
// "Nombre maximum de requêtes atteint" anti-abuse block on 2026-08-03.
// Trading breadth for check frequency: with 4x fewer departements per run,
// PEAK/OFF_PEAK_CHECK_INTERVAL_MINUTES below are also cut 4x, so the
// requests-per-hour against the account stays at or under the previous,
// already-proven-safe rate (16 deps/60min off-peak == 4 deps/15min; 4
// deps/5min peak is even lower than the previous 16 deps/15min). Same 4
// codes as IDF_ET_VOISINS in web/lib/departements.ts -- keep the two lists
// in sync, the dashboard's department picker only offers what this actually
// checks.
export const DEPARTEMENTS = ['027', '028', '077', '078'];

export interface PeakWindow {
  startHour: number;
  endHour: number;
}

export const PEAK_WINDOWS: PeakWindow[] = [
  { startHour: 8, endHour: 9 },
  { startHour: 11, endHour: 14 },
  { startHour: 16, endHour: 18 },
];

export const PEAK_CHECK_INTERVAL_MINUTES = 5;
export const OFF_PEAK_CHECK_INTERVAL_MINUTES = 15;
export const MIN_DELAY_MS = 1000;
export const MAX_DELAY_MS = 2000;
