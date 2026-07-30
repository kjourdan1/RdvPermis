export interface Creneau {
  departement: string;
  centre: string;
  date: string; // "YYYY-MM-DD", Europe/Paris local date
  heure: string; // "HH:MM", Europe/Paris local time
}

export interface StateFile {
  creneaux: Creneau[];
  lastChecked: string; // ISO 8601 timestamp of the last real check
}
