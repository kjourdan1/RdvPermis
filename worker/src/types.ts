export interface Creneau {
  departement: string;
  centre: string;
  date: string; // "YYYY-MM-DD", Europe/Paris local date
  heure: string; // "HH:MM", Europe/Paris local time
}

// A Creneau plus whether it's new since the previous check -- computed once,
// in run.ts, by diffing against the previous state. Kept separate from
// Creneau itself because nothing upstream of that diff (the API response
// parsing in checkSlots.ts, findNewCreneaux's own inputs in diff.ts) knows
// yet whether something is new.
export interface StateCreneau extends Creneau {
  isNew: boolean;
}

export interface StateFile {
  creneaux: StateCreneau[];
  lastChecked: string; // ISO 8601 timestamp of the last real check
}
