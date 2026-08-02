// All 101 French departements (metropolitan 01-95, including 2A/2B for
// Corse instead of 20; overseas 971-974 and 976), zero-padded to match this
// API's established 3-character code format (confirmed for the original 10
// Ile-de-France codes, e.g. '078' not '78'). '02A'/'02B' are a best-effort
// guess at that same 3-character convention for Corse and have not been
// verified against the live API -- if slot data for Corse never appears,
// check the real code here first. A generic fetch failure for an unverified
// code (4xx other than 401/403, 5xx, parse error) is silent and non-fatal:
// run.ts logs it and keeps previous data for that departement, the run
// continues. But a 401/403 is NOT: checkSlots.ts maps it to
// SessionExpiredError, which run.ts treats as immediately fatal for the
// whole run -- it aborts before writeState is ever called, so a bad code
// that trips a 401/403 loses that run's state entirely, not just its own
// departement's data.
export const DEPARTEMENTS = [
  '001', '002', '003', '004', '005', '006', '007', '008', '009', '010',
  '011', '012', '013', '014', '015', '016', '017', '018', '019',
  '021', '022', '023', '024', '025', '026', '027', '028', '029',
  '02A', '02B',
  '030', '031', '032', '033', '034', '035', '036', '037', '038', '039',
  '040', '041', '042', '043', '044', '045', '046', '047', '048', '049',
  '050', '051', '052', '053', '054', '055', '056', '057', '058', '059',
  '060', '061', '062', '063', '064', '065', '066', '067', '068', '069',
  '070', '071', '072', '073', '074', '075', '076', '077', '078', '079',
  '080', '081', '082', '083', '084', '085', '086', '087', '088', '089',
  '090', '091', '092', '093', '094', '095',
  '971', '972', '973', '974', '976',
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
