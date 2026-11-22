export const ZONES = ["LF", "NISSAN", "ST"] as const;
export type Secteur = (typeof ZONES)[number] | string;

export const CRITERES = [
  { cle: "pomme", libelle: "Pomme", court: "Pomme" },
  { cle: "vanne_1", libelle: "Vanne 1", court: "Vanne 1" },
  { cle: "palette", libelle: "Palette", court: "Palette" },
  { cle: "vanne_2", libelle: "Vanne 2", court: "Vanne 2" },
  { cle: "vasque", libelle: "Vasque", court: "Vasque" },
  { cle: "rampe_2_sorties", libelle: "Rampe 2 sorties", court: "Rampe 2 s." },
  { cle: "erogateurs", libelle: "Érogateurs", court: "Érogateurs" },
  { cle: "tige_commande", libelle: "Tige de commande", court: "Tige cmd" },
  { cle: "pedale", libelle: "Pédale", court: "Pédale" },
  { cle: "flotteur", libelle: "Flotteur", court: "Flotteur" },
  { cle: "ressort", libelle: "Ressort", court: "Ressort" },
  { cle: "qualite_eau", libelle: "Qualité d'eau", court: "Qualité eau" },
] as const;

export type CleCritere = (typeof CRITERES)[number]["cle"];
export type Reponse = "BON" | "MANQUE" | "NON CONFORME" | "N/A";

export interface Report {
  id: string;
  sector: Secteur;
  unite: string;
  emplacement: string;
  created_at: string;
  operationnelle?: boolean | null;
  remarques?: string | null;
  rapporteur?: string | null;
  rapporteurs?: { nom?: string; prenom?: string } | { nom?: string; prenom?: string }[] | null;
  [cle: string]: unknown;
}

export interface ExpectedLocation {
  secteur: Secteur;
  unite: string;
  emplacement: string;
}

export interface ReportResponse {
  reports: Report[];
  expectedLocations: ExpectedLocation[] | null;
  source?: string;
  generatedAt?: string;
  error?: string;
}

export const normaliser = (value: unknown): Reponse => {
  const texte = String(value ?? "").trim().toUpperCase();
  if (texte.startsWith("NON CONF")) return "NON CONFORME";
  if (texte.startsWith("MANQUE")) return "MANQUE";
  if (texte.startsWith("N/A") || texte === "NA") return "N/A";
  if (texte.startsWith("BON")) return "BON";
  return "N/A";
};

/** Clé de comparaison insensible aux accents, à la casse et aux espaces. */
export const cleLieu = (secteur: unknown, unite: unknown, emplacement: unknown) =>
  [secteur, unite, emplacement]
    .map((valeur) =>
      String(valeur ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase(),
    )
    .join("|");

export function reporterName(report: Report) {
  if (report.rapporteur) return report.rapporteur;
  const relation = report.rapporteurs;
  const reporter = Array.isArray(relation) ? relation[0] : relation;
  return [reporter?.prenom, reporter?.nom].filter(Boolean).join(" ");
}

export const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Casablanca",
  }).format(date);
};

export const formatJour = (value: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    timeZone: "Africa/Casablanca",
  }).format(new Date(value));

export function matchesDay(value: string, day: string) {
  if (!day) return true;
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
  return date === day;
}

export function anomaliesDe(report: Report, manqueEstAnomalie = true) {
  const values = CRITERES.map((c) => normaliser(report[c.cle]));
  const nonConformes = values.filter((v) => v === "NON CONFORME").length;
  const manques = values.filter((v) => v === "MANQUE").length;
  return {
    total: nonConformes + (manqueEstAnomalie ? manques : 0),
    nonConformes,
    manques,
  };
}

export function estConforme(report: Report, manqueEstAnomalie = true) {
  return anomaliesDe(report, manqueEstAnomalie).total === 0;
}

export interface StatsZone {
  zone: string;
  total: number;
  conformes: number;
  nonConformes: number;
  points: number;
  taux: number;
}

export function statsParZone(reports: Report[], manqueEstAnomalie = true): StatsZone[] {
  const zones = [...new Set([...ZONES, ...reports.map((r) => String(r.sector))])];
  return zones
    .map((zone) => {
      const rows = reports.filter((r) => String(r.sector) === String(zone));
      const conformes = rows.filter((r) => estConforme(r, manqueEstAnomalie)).length;
      return {
        zone: String(zone),
        total: rows.length,
        conformes,
        nonConformes: rows.length - conformes,
        points: rows.reduce((sum, r) => sum + anomaliesDe(r, manqueEstAnomalie).total, 0),
        taux: rows.length ? conformes / rows.length : 0,
      };
    })
    .filter((z) => z.total > 0 || ZONES.includes(z.zone as (typeof ZONES)[number]));
}

export function statsParCritere(reports: Report[]) {
  return CRITERES.map((critere) => {
    const values = reports.map((r) => normaliser(r[critere.cle]));
    const nc = values.filter((v) => v === "NON CONFORME").length;
    const manque = values.filter((v) => v === "MANQUE").length;
    const na = values.filter((v) => v === "N/A").length;
    const evalues = values.length - na;
    const ok = Math.max(evalues - nc - manque, 0);
    return {
      ...critere,
      nc,
      manque,
      na,
      anomalies: nc + manque,
      taux: evalues ? ok / evalues : 0,
    };
  });
}

export function tendance(reports: Report[], jours = 14, manqueEstAnomalie = true) {
  const parJour = new Map<string, { jour: string; label: string; conformes: number; nonConformes: number }>();
  const today = new Date();
  for (let i = jours - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Casablanca",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
    parJour.set(key, { jour: key, label: formatJour(date.toISOString()), conformes: 0, nonConformes: 0 });
  }
  for (const report of reports) {
    if (!report.created_at) continue;
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Casablanca",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(report.created_at));
    const entry = parJour.get(key);
    if (!entry) continue;
    if (estConforme(report, manqueEstAnomalie)) entry.conformes += 1;
    else entry.nonConformes += 1;
  }
  return [...parJour.values()];
}
