export const DEPARTEMENTS = [
  '078', '091', '092', '093', '094', '095', '027', '028', '060', '045',
];

export interface PeakWindow {
  startHour: number;
  endHour: number;
}

export const PEAK_WINDOWS: PeakWindow[] = [
  { startHour: 8, endHour: 9 },
  { startHour: 12, endHour: 13 },
  { startHour: 17, endHour: 18 },
];

export const PEAK_CHECK_INTERVAL_MINUTES = 15;
export const OFF_PEAK_CHECK_INTERVAL_MINUTES = 30;
export const MIN_DELAY_MS = 1000;
export const MAX_DELAY_MS = 2000;
