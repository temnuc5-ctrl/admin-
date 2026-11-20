/**
 * Générateur du classeur « Dashboard Douches de Sécurité ».
 *
 * Même module utilisé par :
 *  - la fonction Edge Supabase (supabase/functions/generate-excel-dashboard)
 *  - le serveur Express (repli local, /api/admin/export)
 *
 * Deux feuilles de calcul seulement sont visibles : « Synthèse » (graphiques
 * natifs Excel) et « Détail » (données brutes normalisées). Une troisième
 * feuille « Analyse » porte la matrice critère × zone et les classements.
 */
import ExcelJS from "exceljs";
import { addCharts, type ChartSpec } from "chartsheet";

export type Reponse = "BON" | "MANQUE" | "NON CONFORME" | "N/A";
export type CleCritere =
  | "pomme" | "vanne_1" | "palette" | "vanne_2" | "vasque" | "rampe_2_sorties"
  | "erogateurs" | "tige_commande" | "pedale" | "flotteur" | "ressort" | "qualite_eau";

export const CRITERES: { cle: CleCritere; libelle: string; court: string }[] = [
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
];

export interface RapportLigne {
  id?: string;
  secteur: string;
  unite: string;
  emplacement: string;
  /** ISO 8601 */
  controle_le: string;
  reponses: Partial<Record<CleCritere, Reponse | string | null>>;
  remarques?: string | null;
  rapporteur?: string | null;
}

export interface BuildOptions {
  /** Début et fin de période (inclus), ISO ; sert à l'affichage. */
  from?: string;
  to?: string;
  /** Un « MANQUE » est-il compté comme une anomalie ? (règle d'origine : oui) */
  manqueEstAnomalie?: boolean;
  /** Emplacements attendus non contrôlés pendant la période. */
  attendus?: { secteur: string; unite: string; emplacement: string }[];
  /** Nom affiché du site / de l'application. */
  site?: string;
  /** Libellé du générateur (écrit en pied de page). */
  generePar?: string;
}

const T = {
  pine: "FF16302B",
  pineDeep: "FF0D1F1B",
  pineSoft: "FF2C4F45",
  lime: "FFC6D879",
  limeDeep: "FFA8BE55",
  limeSoft: "FFEDF1D8",
  paper: "FFF4F4EC",
  sand: "FFE2E0D1",
  ink: "FF1A2724",
  muted: "FF6C7A73",
  white: "FFFFFFFF",
  amber: "FFC07A34",
  amberSoft: "FFFAEFE1",
  red: "FFA8452F",
  redSoft: "FFF8E7E2",
  green: "FF3F6B4E",
  greenSoft: "FFE6EFE4",
  steel: "FF5E6C66",
};

const ZONES = ["LF", "NISSAN", "ST"] as const;

/** chartsheet attend un RGB 6 chiffres, pas un ARGB 8 chiffres. */
const h6 = (argb: string) => argb.slice(-6);

/* ------------------------------------------------------------------ utils */

const norm = (v: unknown): Reponse => {
  const s = String(v ?? "").trim().toUpperCase();
  if (s.startsWith("NON CONF")) return "NON CONFORME";
  if (s.startsWith("MANQUE")) return "MANQUE";
  if (s.startsWith("N/A") || s === "NA") return "N/A";
  if (s.startsWith("BON")) return "BON";
  return "N/A";
};

const isAnomalie = (r: Reponse, manqueEstAnomalie: boolean) =>
  r === "NON CONFORME" || (manqueEstAnomalie && r === "MANQUE");

const pct = (n: number, d: number) => (d === 0 ? 0 : n / d);

const frDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeZone: "Africa/Casablanca",
  }).format(d);
};

const frNum = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const frPct = (n: number) => `${(n * 100).toFixed(1).replace(".", ",")} %`;

function bg(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thinBorder(cell: ExcelJS.Cell, argb = T.sand) {
  cell.border = {
    top: { style: "thin", color: { argb } },
    left: { style: "thin", color: { argb } },
    bottom: { style: "thin", color: { argb } },
    right: { style: "thin", color: { argb } },
  };
}

function noBorder(cell: ExcelJS.Cell) {
  cell.border = {};
}

const font = (size: number, opts: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({
  name: "Calibri",
  size,
  color: { argb: T.ink },
  ...opts,
});

/* ------------------------------------------------------------------ build */

export async function buildDashboardWorkbook(
  rapports: RapportLigne[],
  options: BuildOptions = {},
): Promise<Uint8Array> {
  const manqueEstAnomalie = options.manqueEstAnomalie ?? true;

  const lignes = rapports
    .map((r) => {
      const reponses = Object.fromEntries(
        CRITERES.map((c) => [c.cle, norm(r.reponses[c.cle])]),
      ) as Record<CleCritere, Reponse>;
      const anomalies = CRITERES.filter((c) => isAnomalie(reponses[c.cle], manqueEstAnomalie)).length;
      const nonConformes = CRITERES.filter((c) => reponses[c.cle] === "NON CONFORME").length;
      const manques = CRITERES.filter((c) => reponses[c.cle] === "MANQUE").length;
      return {
        ...r,
        secteur: String(r.secteur || "—").toUpperCase(),
        unite: String(r.unite || "—").trim(),
        emplacement: String(r.emplacement || "—").trim(),
        reponses,
        anomalies,
        nonConformes,
        manques,
        conforme: anomalies === 0,
      };
    })
    .sort(
      (a, b) =>
        new Date(a.controle_le).getTime() - new Date(b.controle_le).getTime() ||
        ZONES.indexOf(a.secteur as (typeof ZONES)[number]) -
          ZONES.indexOf(b.secteur as (typeof ZONES)[number]) ||
        a.unite.localeCompare(b.unite, "fr"),
    );

  const total = lignes.length;
  const conformes = lignes.filter((l) => l.conforme).length;
  const nonConformes = total - conformes;
  const pointsNC = lignes.reduce((s, l) => s + l.anomalies, 0);
  const totalNonConformes = lignes.reduce((s, l) => s + l.nonConformes, 0);
  const totalManques = lignes.reduce((s, l) => s + l.manques, 0);
  const taux = pct(conformes, total);

  const zones = ZONES.map((zone) => {
    const rows = lignes.filter((l) => l.secteur === zone);
    const ok = rows.filter((l) => l.conforme).length;
    return {
      zone,
      total: rows.length,
      conformes: ok,
      nonConformes: rows.length - ok,
      pointsNC: rows.reduce((s, l) => s + l.anomalies, 0),
      taux: pct(ok, rows.length),
    };
  }).filter((z) => z.total > 0);

  const criteres = CRITERES.map((c) => {
    const nc = lignes.filter((l) => l.reponses[c.cle] === "NON CONFORME").length;
    const manque = lignes.filter((l) => l.reponses[c.cle] === "MANQUE").length;
    const na = lignes.filter((l) => l.reponses[c.cle] === "N/A").length;
    const evalues = total - na;
    const ok = evalues - nc - manque;
    return { ...c, nc, manque, na, anomalies: nc + manque, evalues, taux: pct(ok, evalues) };
  });

  const unites = [...new Set(lignes.map((l) => `${l.secteur}|${l.unite}`))]
    .map((key) => {
      const [secteur, unite] = key.split("|");
      const rows = lignes.filter((l) => l.secteur === secteur && l.unite === unite);
      return {
        secteur,
        unite,
        total: rows.length,
        anomalies: rows.reduce((s, l) => s + l.anomalies, 0),
        nonConformes: rows.filter((l) => !l.conforme).length,
      };
    })
    .sort((a, b) => b.anomalies - a.anomalies || b.nonConformes - a.nonConformes)
    .slice(0, 10);

  const prioritaires = [...lignes]
    .filter((l) => l.anomalies > 0)
    .sort((a, b) => b.anomalies - a.anomalies)
    .slice(0, 6);

  const recus = new Set(lignes.map((l) => `${l.secteur}|${l.unite}|${l.emplacement}`));
  const attendus = options.attendus ?? [];
  const aRecevoir = attendus.filter((a) => !recus.has(`${a.secteur}|${a.unite}|${a.emplacement}`));

  /* ---------------------------------------------------------- workbook */

  const wb = new ExcelJS.Workbook();
  wb.creator = options.generePar ?? "Portail de supervision";
  wb.lastModifiedBy = options.generePar ?? "Portail de supervision";
  wb.created = new Date();
  wb.modified = new Date();
  wb.title = "Dashboard — Douches de sécurité";
  wb.subject = "Contrôle des douches de sécurité";
  wb.company = options.site ?? "Contrôle des douches de sécurité";

  const synthese = wb.addWorksheet("Synthèse", {
    properties: { tabColor: { argb: T.pine }, defaultRowHeight: 18 },
    views: [{ showGridLines: false, zoomScale: 100 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const detail = wb.addWorksheet("Détail", {
    properties: { tabColor: { argb: T.limeDeep } },
    views: [{ showGridLines: false, state: "frozen", ySplit: 7, xSplit: 3 }],
  });

  const analyse = wb.addWorksheet("Analyse", {
    properties: { tabColor: { argb: T.steel } },
    views: [{ showGridLines: false }],
  });

  const data = wb.addWorksheet("Données", {
    properties: { tabColor: { argb: T.sand } },
    state: "veryHidden",
  });

  /* ------------------------------------------------------------ Données */

  data.columns = [
    { width: 24 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
  ];

  data.getCell("A1").value = "Zone";
  data.getCell("B1").value = "Contrôles";
  data.getCell("C1").value = "Conformes";
  data.getCell("D1").value = "Non conformes";
  data.getCell("E1").value = "Points NC";
  data.getCell("F1").value = "Taux";
  zones.forEach((z, i) => {
    const r = i + 2;
    data.getCell(`A${r}`).value = z.zone;
    data.getCell(`B${r}`).value = z.total;
    data.getCell(`C${r}`).value = z.conformes;
    data.getCell(`D${r}`).value = z.nonConformes;
    data.getCell(`E${r}`).value = z.pointsNC;
    data.getCell(`F${r}`).value = z.taux;
  });

  data.getCell("A10").value = "Statut";
  data.getCell("B10").value = "Nombre";
  const statuts: [string, number][] = [
    ["Conforme", conformes],
    ["Non conforme", nonConformes],
    ["Points NC", totalNonConformes],
    ["Manques", totalManques],
  ];
  statuts.forEach(([label, value], i) => {
    data.getCell(`A${11 + i}`).value = label;
    data.getCell(`B${11 + i}`).value = value;
  });

  data.getCell("D10").value = "Critère";
  data.getCell("E10").value = "Anomalies";
  criteres
    .slice()
    .sort((a, b) => b.anomalies - a.anomalies)
    .forEach((c, i) => {
      data.getCell(`D${11 + i}`).value = c.court;
      data.getCell(`E${11 + i}`).value = c.anomalies;
    });

  data.getCell("G10").value = "Critère";
  ZONES.forEach((z, i) => (data.getCell(10, 8 + i).value = z));
  CRITERES.forEach((c, j) => {
    data.getCell(`G${11 + j}`).value = c.court;
    ZONES.forEach((z, i) => {
      const rows = lignes.filter((l) => l.secteur === z);
      const na = rows.filter((l) => l.reponses[c.cle] === "N/A").length;
      const evalues = rows.length - na;
      const ko = rows.filter((l) => isAnomalie(l.reponses[c.cle], manqueEstAnomalie)).length;
      data.getCell(11 + j, 8 + i).value = pct(evalues - ko, evalues);
    });
  });

  data.getCell("A20").value = "Unité";
  data.getCell("B20").value = "Secteur";
  data.getCell("C20").value = "Points NC";
  data.getCell("D20").value = "Douches NC";
  unites.forEach((u, i) => {
    data.getCell(`A${21 + i}`).value = `${u.secteur} · ${u.unite}`;
    data.getCell(`B${21 + i}`).value = u.total;
    data.getCell(`C${21 + i}`).value = u.anomalies;
    data.getCell(`D${21 + i}`).value = u.nonConformes;
  });

  const nbCriteres = CRITERES.length;
  const zoneRangeEnd = 1 + Math.max(zones.length, 1);

  /* ----------------------------------------------------------- Synthèse */

  synthese.columns = [
    { width: 2 }, { width: 21 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 },
    { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 },
    { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 },
  ];

  const periode =
    options.from && options.to
      ? options.from === options.to
        ? frDate(options.from)
        : `du ${frDate(options.from)} au ${frDate(options.to)}`
      : "toutes périodes confondues";

  // Bandeau : chaque ligne est fusionnée séparément, sinon la valeur écrite
  // dans une cellule non ancrée n'est jamais affichée par Excel.
  synthese.mergeCells("B2:K2");
  synthese.mergeCells("B3:K3");
  synthese.mergeCells("B4:K4");
  synthese.mergeCells("L2:P2");
  synthese.mergeCells("L3:P3");
  synthese.mergeCells("L4:P4");
  for (let r = 1; r <= 4; r += 1) {
    synthese.getRow(r).height = r === 3 ? 40 : 22;
    for (let c = 1; c <= 16; c += 1) bg(synthese.getCell(r, c), T.pine);
  }

  synthese.getCell("B2").value = "CONTRÔLE DES DOUCHES DE SÉCURITÉ";
  synthese.getCell("B2").font = font(9, { bold: true, color: { argb: T.lime } });
  synthese.getCell("B2").alignment = { vertical: "bottom", indent: 1 };
  synthese.getCell("B3").value = "Rapport de conformité";
  synthese.getCell("B3").font = font(26, { bold: true, color: { argb: T.white } });
  synthese.getCell("B3").alignment = { vertical: "middle", indent: 1 };
  synthese.getCell("B4").value = `${frNum(total)} contrôle${total > 1 ? "s" : ""} · ${periode}`;
  synthese.getCell("B4").font = font(10, { color: { argb: "FFAFBDB7" } });
  synthese.getCell("B4").alignment = { vertical: "top", indent: 1 };

  synthese.getCell("L2").value = "TAUX DE CONFORMITÉ GLOBAL";
  synthese.getCell("L2").alignment = { horizontal: "right", vertical: "bottom" };
  synthese.getCell("L2").font = font(8, { bold: true, color: { argb: T.lime } });
  synthese.getCell("L3").value = frPct(taux);
  synthese.getCell("L3").alignment = { horizontal: "right", vertical: "middle" };
  synthese.getCell("L3").font = font(30, { bold: true, color: { argb: T.white } });
  synthese.getCell("L4").value = `${conformes} conformes · ${nonConformes} non conforme${nonConformes > 1 ? "s" : ""}`;
  synthese.getCell("L4").alignment = { horizontal: "right", vertical: "top" };
  synthese.getCell("L4").font = font(9, { color: { argb: "FFAFBDB7" } });

  // Barre d'accent
  synthese.getRow(5).height = 3;
  for (let c = 1; c <= 16; c += 1) bg(synthese.getCell(5, c), T.lime);

  // Méta
  synthese.mergeCells("B7:M7");
  synthese.getCell("B7").value =
    `Source : rapports transmis depuis le terrain  ·  ${options.site ?? "Sites LF, NISSAN et ST"}` +
    (aRecevoir.length ? `  ·  ${aRecevoir.length} emplacement(s) attendu(s) non reçu(s)` : "");
  synthese.getCell("B7").font = font(9, { color: { argb: T.muted }, italic: true });
  synthese.mergeCells("N7:P7");
  synthese.getCell("N7").value = `Généré le ${frDate(new Date().toISOString())}`;
  synthese.getCell("N7").alignment = { horizontal: "right" };
  synthese.getCell("N7").font = font(8, { color: { argb: T.muted } });

  // KPI
  const kpis: { label: string; value: string; note: string; accent: string; fill: string }[] = [
    { label: "Douches contrôlées", value: frNum(total), note: `${zones.length} zone(s)`, accent: T.pine, fill: T.white },
    { label: "Conformes", value: frNum(conformes), note: frPct(taux), accent: T.green, fill: T.white },
    { label: "Non conformes", value: frNum(nonConformes), note: `${frPct(1 - taux)} du parc`, accent: T.red, fill: T.white },
    { label: "Points non conformes", value: frNum(pointsNC), note: `${frNum(totalNonConformes)} NC · ${frNum(totalManques)} manque(s)`, accent: T.amber, fill: T.white },
    { label: "À recevoir", value: attendus.length ? frNum(aRecevoir.length) : "—", note: attendus.length ? `sur ${attendus.length} attendus` : "référentiel non chargé", accent: T.steel, fill: T.white },
  ];

  const cardCols = [2, 5, 8, 11, 14];
  kpis.forEach((kpi, i) => {
    const c0 = cardCols[i];
    const c1 = c0 + 2;
    synthese.getRow(7).height = 5;
    for (let c = c0; c <= c1; c += 1) bg(synthese.getCell(7, c), kpi.accent);

    synthese.mergeCells(8, c0, 8, c1);
    const lab = synthese.getCell(8, c0);
    lab.value = kpi.label.toUpperCase();
    lab.font = font(7.5, { bold: true, color: { argb: T.muted } });
    lab.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    bg(lab, kpi.fill);

    synthese.mergeCells(9, c0, 10, c1);
    synthese.getRow(9).height = 26;
    synthese.getRow(10).height = 26;
    const val = synthese.getCell(9, c0);
    val.value = kpi.value;
    val.font = font(i === 2 || i === 3 ? 27 : 25, { bold: true, color: { argb: T.ink } });
    val.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    for (let r = 9; r <= 10; r += 1) for (let c = c0; c <= c1; c += 1) bg(synthese.getCell(r, c), kpi.fill);

    synthese.mergeCells(11, c0, 11, c1);
    const note = synthese.getCell(11, c0);
    note.value = kpi.note;
    note.font = font(8, { color: { argb: T.muted } });
    note.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    for (let c = c0; c <= c1; c += 1) bg(synthese.getCell(11, c), kpi.fill);

    for (let r = 8; r <= 11; r += 1) {
      for (let c = c0; c <= c1; c += 1) thinBorder(synthese.getCell(r, c), T.sand);
    }
  });

  // Titres de sections
  const section = (row: number, label: string, note?: string) => {
    synthese.mergeCells(row, 2, row, 10);
    const cell = synthese.getCell(row, 2);
    cell.value = label.toUpperCase();
    cell.font = font(10, { bold: true, color: { argb: T.pine } });
    cell.alignment = { vertical: "middle" };
    synthese.mergeCells(row, 11, row, 16);
    const n = synthese.getCell(row, 11);
    n.value = note ?? "";
    n.font = font(8, { color: { argb: T.muted } });
    n.alignment = { horizontal: "right", vertical: "middle" };
    for (let c = 2; c <= 16; c += 1) {
      bg(synthese.getCell(row, c), T.paper);
      synthese.getCell(row, c).border = { bottom: { style: "thin", color: { argb: T.sand } } };
    }
  };

  section(13, "Vue d'ensemble", "Cliquez sur un graphique pour le modifier");
  section(33, "Diagnostic par point de contrôle", manqueEstAnomalie ? "MANQUE compté comme anomalie" : "MANQUE non compté");
  let heatRow = 53;
  section(heatRow, "Matrice de vigilance — anomalies par critère", "0 = conforme sur toute la zone");

  /* ------------------------------------------------------------- charts */

  const zoneRef = `'Données'!$A$2:$A$${zoneRangeEnd}`;
  const charts: ChartSpec[] = [];

  if (total > 0) {
    charts.push({
      type: "column",
      title: "Douches conformes / non conformes par zone",
      categories: zoneRef,
      series: [
        { name: "Conformes", ref: `'Données'!$C$2:$C$${zoneRangeEnd}`, colour: h6(T.pine) },
        { name: "Non conformes", ref: `'Données'!$D$2:$D$${zoneRangeEnd}`, colour: h6(T.red) },
      ],
      stacked: true,
      legend: "b",
      dataLabels: true,
      anchor: { col: 1, row: 15 },
      width: 620,
      height: 320,
      sheet: "Synthèse",
    } as ChartSpec);

    charts.push({
      type: "doughnut",
      title: "Répartition des contrôles",
      categories: "'Données'!$A$11:$A$14",
      series: [{ name: "Contrôles", ref: "'Données'!$B$11:$B$14", colour: h6(T.pine) }],
      legend: "r",
      dataLabels: true,
      anchor: { col: 9, row: 15 },
      width: 430,
      height: 320,
      sheet: "Synthèse",
    } as ChartSpec);

    charts.push({
      type: "bar",
      title: "Points de contrôle les plus défaillants",
      categories: `'Données'!$D$11:$D$${10 + nbCriteres}`,
      series: [{ name: "Anomalies", ref: `'Données'!$E$11:$E$${10 + nbCriteres}`, colour: h6(T.amber) }],
      horizontal: true,
      legend: false,
      dataLabels: true,
      gridlines: false,
      anchor: { col: 1, row: 36 },
      width: 620,
      height: 340,
      sheet: "Synthèse",
    } as ChartSpec);

    if (zones.length > 0) {
      charts.push({
        type: "radar",
        title: "Profil de conformité par zone",
        categories: `'Données'!$G$11:$G$${10 + nbCriteres}`,
        series: zones.map((z) => {
          const colonne = String.fromCharCode(72 + ZONES.indexOf(z.zone as (typeof ZONES)[number]));
          return {
            name: z.zone,
            ref: `'Données'!$${colonne}$11:$${colonne}$${10 + nbCriteres}`,
            colour: h6([T.pine, T.limeDeep, T.red][ZONES.indexOf(z.zone as (typeof ZONES)[number])] ?? T.steel),
          };
        }),
        legend: "b",
        anchor: { col: 9, row: 36 },
        width: 430,
        height: 340,
        sheet: "Synthèse",
      } as ChartSpec);
    }
  } else {
    synthese.mergeCells("B15:P27");
    const vide = synthese.getCell("B15");
    vide.value =
      "Aucun contrôle reçu sur cette période.\n\n" +
      "Dès qu'un rapport sera transmis depuis le terrain, la synthèse affichera automatiquement " +
      "les indicateurs, les quatre graphiques et la matrice de vigilance.";
    vide.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    vide.font = font(11, { italic: true, color: { argb: T.muted } });
    vide.border = { top: { style: "thin", color: { argb: T.sand } }, bottom: { style: "thin", color: { argb: T.sand } } };
  }

  /* ----------------------------------------------------- heatmap table */

  // Ligne d'en-tête
  const heatHeader = heatRow + 1;
  synthese.getCell(heatHeader, 2).value = "Zone";
  synthese.getCell(heatHeader, 3).value = "Contrôles";
  synthese.getCell(heatHeader, 4).value = "Taux";
  CRITERES.forEach((c, i) => {
    synthese.getCell(heatHeader, 5 + i).value = c.court;
  });

  for (let c = 2; c <= 16; c += 1) {
    const cell = synthese.getCell(heatHeader, c);
    bg(cell, T.pine);
    cell.font = font(7.5, { bold: true, color: { argb: T.white } });
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true, textRotation: c >= 5 ? 90 : 0 };
  }
  synthese.getRow(heatHeader).height = 108;

  const heatRows = zones.map((z, i) => {
    const r = heatHeader + 1 + i;
    synthese.getCell(r, 2).value = z.zone;
    synthese.getCell(r, 2).font = font(9, { bold: true, color: { argb: T.ink } });
    synthese.getCell(r, 3).value = z.total;
    synthese.getCell(r, 4).value = z.taux;
    synthese.getCell(r, 4).numFmt = "0 %";
    CRITERES.forEach((c, j) => {
      const rows = lignes.filter((l) => l.secteur === z.zone);
      const count = rows.filter((l) => isAnomalie(l.reponses[c.cle], manqueEstAnomalie)).length;
      synthese.getCell(r, 5 + j).value = count;
    });
    for (let c = 2; c <= 16; c += 1) {
      const cell = synthese.getCell(r, c);
      thinBorder(cell, T.sand);
      if (c >= 5) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.font = font(8.5, { bold: false, color: { argb: T.ink } });
      } else {
        cell.alignment = { horizontal: c === 2 ? "left" : "center", vertical: "middle" };
        cell.font = font(9, { color: { argb: T.ink } });
      }
      if ((heatRowsIndex(i) % 2) === 1) bg(cell, T.paper);
    }
    return r;
  });

  function heatRowsIndex(i: number) {
    return i;
  }

  if (heatRows.length) {
    const heatRange = `E${heatRows[0]}:P${heatRows[heatRows.length - 1]}`;
    synthese.addConditionalFormatting({
      ref: heatRange,
      rules: [{
        type: "colorScale",
        priority: 1,
        cfvo: [{ type: "num", value: 0 }, { type: "percentile", value: 60 }, { type: "max" }],
        color: [{ argb: "FFF4F4EC" }, { argb: "FFE8C9A8" }, { argb: T.red }],
      }],
    });
  }

  /* ------------------------------------------- emplacements prioritaires */

  const prioriteRow = heatHeader + Math.max(zones.length, 1) + 3;
  section(prioriteRow, "Emplacements prioritaires", "Les 6 contrôles les plus défaillants");

  const pHeader = prioriteRow + 1;
  synthese.mergeCells(pHeader, 3, pHeader, 6);
  synthese.mergeCells(pHeader, 7, pHeader, 8);
  synthese.mergeCells(pHeader, 10, pHeader, 13);
  const pCols: [number, string][] = [
    [2, "Secteur"],
    [3, "Unité · emplacement"],
    [7, "Anomalies"],
    [9, "Détail"],
    [10, "Remarques"],
  ];
  pCols.forEach(([col, label]) => {
    const cell = synthese.getCell(pHeader, col);
    cell.value = label;
    cell.font = font(8, { bold: true, color: { argb: T.white } });
    cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  });
  for (let c = 2; c <= 13; c += 1) bg(synthese.getCell(pHeader, c), T.pineSoft);

  if (!prioritaires.length) {
    synthese.mergeCells(pHeader + 1, 2, pHeader + 1, 13);
    synthese.getCell(pHeader + 1, 2).value = total === 0
      ? "Aucun contrôle reçu sur la période."
      : "Aucune anomalie relevée sur la période. Tous les contrôles sont conformes.";
    synthese.getCell(pHeader + 1, 2).font = font(9, { italic: true, color: { argb: T.green } });
  }

  prioritaires.forEach((l, i) => {
    const r = pHeader + 1 + i;
    synthese.getCell(r, 2).value = l.secteur;
    synthese.getCell(r, 3).value = `${l.unite} · ${l.emplacement}`;
    synthese.mergeCells(r, 3, r, 5);
    synthese.mergeCells(r, 7, r, 8);
    synthese.getCell(r, 7).value = l.anomalies;
    synthese.getCell(r, 7).alignment = { horizontal: "center", vertical: "middle" };
    synthese.getCell(r, 9).value = `${l.nonConformes} NC · ${l.manques} manque(s)`;
    synthese.getCell(r, 10).value = l.remarques || "—";
    synthese.mergeCells(r, 10, r, 13);
    for (let c = 2; c <= 13; c += 1) {
      const cell = synthese.getCell(r, c);
      thinBorder(cell, T.sand);
      cell.font = font(8.5, { color: { argb: c === 2 ? T.pine : c === 9 ? T.steel : T.ink }, bold: c === 2 || c === 7 });
      cell.alignment = { vertical: "middle", indent: c === 2 || c >= 10 ? 1 : 0, horizontal: c === 7 ? "center" : "left" };
      if (i % 2 === 1) bg(cell, T.paper);
    }
    synthese.getRow(r).height = 22;
  });

  // Note de méthode
  const noteRow = pHeader + Math.max(prioritaires.length, 1) + 2;
  synthese.mergeCells(noteRow, 2, noteRow, 16);
  synthese.getCell(noteRow, 2).value =
    `Méthode : une douche est « conforme » si aucun point de contrôle n'est en anomalie (${manqueEstAnomalie ? "MANQUE et NON CONFORME" : "NON CONFORME uniquement"}). ` +
    "« N/A » est exclu du calcul de conformité du critère. Les rapports sont figés en base : toute correction passe par un nouveau contrôle.";
  synthese.getCell(noteRow, 2).font = font(7.5, { italic: true, color: { argb: T.muted } });
  synthese.getCell(noteRow, 2).alignment = { wrapText: true, vertical: "top" };
  synthese.getRow(noteRow).height = 26;

  synthese.mergeCells(noteRow + 1, 2, noteRow + 1, 16);
  synthese.getCell(noteRow + 1, 2).value = `${options.generePar ?? "Portail de supervision"} · ${new Date().toLocaleString("fr-FR", { timeZone: "Africa/Casablanca" })}`;
  synthese.getCell(noteRow + 1, 2).font = font(7.5, { color: { argb: T.muted } });

  /* -------------------------------------------------------------- Détail */

  detail.columns = [
    { key: "secteur", width: 10 },
    { key: "unite", width: 12 },
    { key: "emplacement", width: 22 },
    ...CRITERES.map((c) => ({ key: c.cle, width: Math.max(11, c.libelle.length + 3) })),
    { key: "anomalies", width: 10 },
    { key: "statut", width: 15 },
    { key: "remarques", width: 30 },
    { key: "date", width: 19 },
  ];

  detail.mergeCells(1, 1, 1, detail.columns.length);
  const dTitle = detail.getCell(1, 1);
  dTitle.value = "Journal des contrôles — données brutes";
  dTitle.font = font(16, { bold: true, color: { argb: T.white } });
  dTitle.alignment = { vertical: "middle", indent: 1 };
  bg(dTitle, T.pine);
  detail.getRow(1).height = 34;

  detail.mergeCells(2, 1, 2, detail.columns.length);
  detail.getCell(2, 1).value =
    `${frNum(total)} rapport(s) · ${periode} · une ligne par contrôle, colonnes identiques au classeur source`;
  detail.getCell(2, 1).font = font(8.5, { italic: true, color: { argb: T.muted } });
  detail.getCell(2, 1).alignment = { vertical: "middle", indent: 1 };
  detail.getRow(2).height = 20;

  detail.getRow(3).height = 4;
  for (let c = 1; c <= detail.columns.length; c += 1) bg(detail.getCell(3, c), T.lime);

  // En-tête (ligne 6) + ligne de regroupement (5)
  detail.mergeCells(5, 1, 5, 3);
  detail.getCell(5, 1).value = "IDENTIFICATION";
  detail.mergeCells(5, 4, 5, 15);
  detail.getCell(5, 4).value = "POINTS DE CONTRÔLE";
  detail.mergeCells(5, 16, 5, 18);
  detail.getCell(5, 16).value = "SYNTHÈSE";
  detail.getCell(5, 19).value = "AUDIT";
  for (let c = 1; c <= 19; c += 1) {
    const cell = detail.getCell(5, c);
    bg(cell, T.pineSoft);
    cell.font = font(7, { bold: true, color: { argb: T.lime } });
    cell.alignment = { horizontal: "center", vertical: "middle" };
  }

  // Libellés strictement identiques à la feuille « Détail » du classeur source.
  const headers = [
    "Zone", "Unité", "Emplacement",
    ...CRITERES.map((c) => c.libelle),
    "Nb points NC", "Statut", "Remarques (fichier d'origine)", "Date de contrôle",
  ];
  headers.forEach((h, i) => {
    const cell = detail.getCell(6, i + 1);
    cell.value = h;
    bg(cell, T.pine);
    cell.font = font(8, { bold: true, color: { argb: T.white } });
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true, textRotation: i >= 3 && i <= 14 ? 90 : 0 };
    cell.border = {
      left: { style: "thin", color: { argb: T.pineSoft } },
      right: { style: "thin", color: { argb: T.pineSoft } },
    };
  });
  detail.getRow(6).height = 72;

  lignes.forEach((l, i) => {
    const r = 7 + i;
    const row = detail.getRow(r);
    const date = new Date(l.controle_le);
    const values: (string | number | null)[] = [
      l.secteur,
      l.unite,
      l.emplacement,
      ...CRITERES.map((c) => l.reponses[c.cle]),
      l.anomalies,
      l.conforme ? "CONFORME" : "NON CONFORME",
      l.remarques || "",
      Number.isNaN(date.getTime())
        ? "—"
        : new Intl.DateTimeFormat("fr-FR", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "Africa/Casablanca",
          }).format(date),
    ];
    row.values = values;
    row.height = 20;
    for (let c = 1; c <= 19; c += 1) {
      const cell = detail.getCell(r, c);
      cell.font = font(8.5, {
        color: { argb: c <= 3 ? T.ink : T.steel },
        bold: c === 3 || c === 17,
      });
      cell.alignment = {
        vertical: "middle",
        horizontal: c >= 4 && c <= 17 ? "center" : "left",
        indent: c <= 3 || c >= 18 ? 1 : 0,
      };
      cell.border = { bottom: { style: "hair", color: { argb: T.sand } } };
      if (i % 2 === 1) bg(cell, T.paper);
    }
  });

  const firstData = 7;
  const lastData = 6 + lignes.length;
  if (lignes.length) {
    detail.autoFilter = { from: "A6", to: `S${lastData}` };
    const textRule = (text: string, style: Record<string, unknown>, priority: number) => ({
      type: "containsText" as const,
      operator: "containsText" as const,
      text,
      priority,
      style,
    });
    detail.addConditionalFormatting({
      ref: `D${firstData}:O${lastData}`,
      rules: [
        textRule("NON CONFORME", { fill: { type: "pattern", pattern: "solid", bgColor: { argb: T.redSoft } }, font: { color: { argb: T.red }, bold: true } }, 1),
        textRule("MANQUE", { fill: { type: "pattern", pattern: "solid", bgColor: { argb: T.amberSoft } }, font: { color: { argb: T.amber }, bold: true } }, 2),
        textRule("N/A", { font: { color: { argb: "FFB9C0BB" } } }, 3),
      ],
    });
    detail.addConditionalFormatting({
      ref: `P${firstData}:P${lastData}`,
      rules: [{
        type: "colorScale",
        priority: 4,
        cfvo: [{ type: "num", value: 0 }, { type: "max" }],
        color: [{ argb: "FFFFFFFF" }, { argb: T.amber }],
      }],
    });
    detail.addConditionalFormatting({
      ref: `Q${firstData}:Q${lastData}`,
      rules: [
        textRule("NON CONFORME", { fill: { type: "pattern", pattern: "solid", bgColor: { argb: T.redSoft } }, font: { color: { argb: T.red }, bold: true } }, 5),
        textRule("CONFORME", { fill: { type: "pattern", pattern: "solid", bgColor: { argb: T.greenSoft } }, font: { color: { argb: T.green }, bold: true } }, 6),
      ],
    });
  }

  detail.getCell(lastData + 2, 1).value = "Rappel : les rapports transmis ne sont jamais modifiés (immuabilité en base).";
  detail.getCell(lastData + 2, 1).font = font(8, { italic: true, color: { argb: T.muted } });

  /* ------------------------------------------------------------- Analyse */

  analyse.columns = [{ width: 26 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }];

  analyse.mergeCells("A1:G1");
  const aTitle = analyse.getCell("A1");
  aTitle.value = "Analyse détaillée";
  aTitle.font = font(16, { bold: true, color: { argb: T.white } });
  aTitle.alignment = { vertical: "middle", indent: 1 };
  bg(aTitle, T.pine);
  analyse.getRow(1).height = 34;
  analyse.mergeCells("A2:G2");
  analyse.getCell("A2").value = "Conformité par critère et par zone · points de vigilance";
  analyse.getCell("A2").font = font(8.5, { italic: true, color: { argb: T.muted } });
  analyse.getCell("A2").alignment = { indent: 1 };

  const aHead = 4;
  ["Point de contrôle", "Anomalies", "Non conforme", "Manque", "N/A", "Conformité", "Zone la plus touchée"].forEach((h, i) => {
    const cell = analyse.getCell(aHead, i + 1);
    cell.value = h;
    bg(cell, T.pine);
    cell.font = font(8, { bold: true, color: { argb: T.white } });
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true, indent: i === 0 ? 1 : 0 };
  });
  analyse.getRow(aHead).height = 30;

  criteres.forEach((c, i) => {
    const r = aHead + 1 + i;
    const parZone = ZONES.map((z) => {
      const rows = lignes.filter((l) => l.secteur === z);
      return { z, ko: rows.filter((l) => isAnomalie(l.reponses[c.cle], manqueEstAnomalie)).length };
    }).sort((a, b) => b.ko - a.ko);
    analyse.getCell(r, 1).value = c.libelle;
    analyse.getCell(r, 2).value = c.anomalies;
    analyse.getCell(r, 3).value = c.nc;
    analyse.getCell(r, 4).value = c.manque;
    analyse.getCell(r, 5).value = c.na;
    analyse.getCell(r, 6).value = c.taux;
    analyse.getCell(r, 6).numFmt = "0 %";
    analyse.getCell(r, 7).value = parZone[0]?.ko ? parZone[0].z : "—";
    for (let col = 1; col <= 7; col += 1) {
      const cell = analyse.getCell(r, col);
      cell.font = font(9, { color: { argb: col === 1 ? T.ink : T.steel }, bold: col === 1 });
      cell.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "center", indent: col === 1 ? 1 : 0 };
      cell.border = { bottom: { style: "hair", color: { argb: T.sand } } };
      if (i % 2 === 1) bg(cell, T.paper);
    }
    analyse.getRow(r).height = 22;
  });

  const aEnd = aHead + criteres.length;
  analyse.addConditionalFormatting({
    ref: `F${aHead + 1}:F${aEnd}`,
    rules: [{
      type: "colorScale",
      priority: 1,
      cfvo: [{ type: "num", value: 0 }, { type: "num", value: 0.75 }, { type: "num", value: 1 }],
      color: [{ argb: T.red }, { argb: "FFF6E7C9" }, { argb: T.greenSoft }],
    }],
  });
  analyse.addConditionalFormatting({
    ref: `B${aHead + 1}:B${aEnd}`,
    rules: [{
      type: "colorScale",
      priority: 2,
      cfvo: [{ type: "num", value: 0 }, { type: "max" }],
      color: [{ argb: "FFFFFFFF" }, { argb: T.amber }],
    }],
  });

  const uHead = aEnd + 3;
  analyse.mergeCells(uHead, 1, uHead, 4);
  analyse.getCell(uHead, 1).value = "UNITÉS LES PLUS TOUCHÉES";
  analyse.getCell(uHead, 1).font = font(10, { bold: true, color: { argb: T.pine } });
  ["Unité", "Contrôles", "Douches NC", "Points NC"].forEach((h, i) => {
    const cell = analyse.getCell(uHead + 1, i + 1);
    cell.value = h;
    bg(cell, T.pineSoft);
    cell.font = font(8, { bold: true, color: { argb: T.white } });
    cell.alignment = { horizontal: i === 0 ? "left" : "center", vertical: "middle", indent: i === 0 ? 1 : 0 };
  });
  unites.forEach((u, i) => {
    const r = uHead + 2 + i;
    analyse.getCell(r, 1).value = `${u.secteur} · ${u.unite}`;
    analyse.getCell(r, 2).value = u.total;
    analyse.getCell(r, 3).value = u.nonConformes;
    analyse.getCell(r, 4).value = u.anomalies;
    for (let col = 1; col <= 4; col += 1) {
      const cell = analyse.getCell(r, col);
      cell.font = font(9, { color: { argb: col === 1 ? T.ink : T.steel }, bold: col === 1 });
      cell.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "center", indent: col === 1 ? 1 : 0 };
      cell.border = { bottom: { style: "hair", color: { argb: T.sand } } };
    }
  });

  if (aRecevoir.length) {
    const mHead = uHead + unites.length + 3;
    analyse.mergeCells(mHead, 1, mHead, 4);
    analyse.getCell(mHead, 1).value = "EMPLACEMENTS ATTENDUS NON REÇUS";
    analyse.getCell(mHead, 1).font = font(10, { bold: true, color: { argb: T.amber } });
    aRecevoir.slice(0, 20).forEach((a, i) => {
      const cell = analyse.getCell(mHead + 1 + i, 1);
      cell.value = `${a.secteur} · ${a.unite} · ${a.emplacement}`;
      cell.font = font(9, { color: { argb: T.steel } });
      cell.alignment = { indent: 1 };
    });
  }

  synthese.getCell("A1").alignment = { vertical: "middle" };
  synthese.views = [{ showGridLines: false, zoomScale: 100 }];

  const brut = await wb.xlsx.writeBuffer();
  const sortie: Buffer = charts.length
    ? await addCharts(Buffer.from(brut) as never, charts)
    : Buffer.from(brut as unknown as ArrayBuffer);
  return new Uint8Array(sortie);
}

/* -------------------------------------------------------------- entry CLI */

export function resumeControles(rapports: RapportLigne[], manqueEstAnomalie = true) {
  const lignes = rapports.map((r) => {
    const reponses = Object.fromEntries(CRITERES.map((c) => [c.cle, norm(r.reponses[c.cle])])) as Record<CleCritere, Reponse>;
    const anomalies = CRITERES.filter((c) => isAnomalie(reponses[c.cle], manqueEstAnomalie)).length;
    return { ...r, anomalies, conforme: anomalies === 0, reponses };
  });
  const total = lignes.length;
  const conformes = lignes.filter((l) => l.conforme).length;
  return {
    total,
    conformes,
    nonConformes: total - conformes,
    pointsNC: lignes.reduce((s, l) => s + l.anomalies, 0),
    taux: pct(conformes, total),
  };
}

export { norm as normaliserReponse, frDate, frPct };
