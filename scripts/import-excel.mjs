#!/usr/bin/env node
/**
 * Importe la feuille « Détail » d'un classeur de contrôle dans Supabase.
 *
 * Principe : le classeur est la source. Le script ne réinvente ni les lignes,
 * ni les colonnes, ni l'ordre : il lit la feuille, normalise uniquement les
 * codes de réponse et les libellés d'emplacement, puis insère une ligne par
 * contrôle (U33 ×3 et U04 ×2 restent trois et deux contrôles distincts).
 *
 * Usage :
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/import-excel.mjs "Dashboard.xlsx" --apply
 *
 * Sans --apply, le script affiche seulement ce qu'il ferait.
 */
import ExcelJS from "exceljs";

const CRITERES = [
  "pomme",
  "vanne_1",
  "palette",
  "vanne_2",
  "vasque",
  "rampe_2_sorties",
  "erogateurs",
  "tige_commande",
  "pedale",
  "flotteur",
  "ressort",
  "qualite_eau",
];

const SECTEURS = { LF: "rapports_lf", NISSAN: "rapports_nissan", ST: "rapports_st" };

/** Variantes de saisie observées dans le classeur → libellé canonique. */
const EMPLACEMENTS = {
  "Etage filtre": "Étage filtre",
  "Étage filtre": "Étage filtre",
  "1er étage": "1er étage",
  "2ème étage": "2ème étage",
  RDC: "RDC",
  "Bassin digesteur": "Bassin digesteur",
  "Sous filtre": "Sous filtre",
};

const REPONSES = {
  BON: "BON",
  MANQUE: "MANQUE",
  "NON CONFORM": "NON CONFORME",
  "NON CONFORME": "NON CONFORME",
  "N/A": "N/A",
  NA: "N/A",
};

const normaliserTexte = (valeur) =>
  String(valeur?.text ?? valeur ?? "")
    .replace(/\s+/g, " ")
    .trim();

function normaliserReponse(valeur) {
  const texte = normaliserTexte(valeur).toUpperCase();
  for (const [prefixe, code] of Object.entries(REPONSES)) {
    if (texte === prefixe || texte.startsWith(`${prefixe} `) || (prefixe === "NON CONFORM" && texte.startsWith("NON CONFORM"))) {
      return code;
    }
  }
  return null;
}

function lireDate(ws) {
  const ligne = normaliserTexte(ws.getRow(2).getCell(1).value);
  const match = /(\d{2})\/(\d{2})\/(\d{4})/.exec(ligne);
  if (!match) throw new Error("Date de contrôle introuvable dans la cellule A2.");
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function lireVerificateur(ws) {
  const ligne = normaliserTexte(ws.getRow(2).getCell(1).value);
  const match = /Vérifié par\s*:\s*(.+)$/i.exec(ligne);
  if (!match) return { nom: "INCONNU", prenom: "" };
  const mots = match[1].trim().split(/\s+/);
  if (mots.length === 1) return { nom: mots[0], prenom: "" };
  // « FNOUNE YASSINE » : le nom précède le prénom dans les en-têtes du classeur.
  const prenom = mots.pop();
  return { nom: mots.join(" "), prenom };
}

export async function lireClasseur(chemin) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(chemin);
  const ws = wb.getWorksheet("Détail");
  if (!ws) throw new Error("Feuille « Détail » absente du classeur.");

  const date = lireDate(ws);
  const verificateur = lireVerificateur(ws);
  const lignes = [];
  const rejets = [];

  ws.eachRow((row, numero) => {
    if (numero < 6) return;
    const valeurs = row.values.slice(1);
    if (!valeurs[0]) return;

    const secteur = normaliserTexte(valeurs[0]).toUpperCase();
    const unite = normaliserTexte(valeurs[1]);
    const emplacementBrut = normaliserTexte(valeurs[2]);
    const emplacement = EMPLACEMENTS[emplacementBrut];

    if (!SECTEURS[secteur]) {
      rejets.push({ ligne: numero, motif: `secteur inconnu « ${secteur} »` });
      return;
    }
    if (!emplacement) {
      rejets.push({ ligne: numero, motif: `emplacement inconnu « ${emplacementBrut} »` });
      return;
    }

    const reponses = {};
    CRITERES.forEach((cle, index) => {
      const brute = valeurs[3 + index];
      const code = normaliserReponse(brute);
      if (!code) rejets.push({ ligne: numero, motif: `réponse invalide (${cle}) « ${brute} »` });
      reponses[cle] = code;
    });

    const nbSource = Number(valeurs[15]);
    lignes.push({
      ligne_source: numero,
      secteur,
      unite,
      emplacement,
      emplacement_source: emplacementBrut,
      reponses,
      nb_points_nc_source: Number.isFinite(nbSource) ? nbSource : null,
      statut_source: normaliserTexte(valeurs[16]) || null,
      remarques: normaliserTexte(valeurs[17]) || null,
    });
  });

  return { date, verificateur, lignes, rejets, feuille: "Détail" };
}

/* ------------------------------------------------------------------ réseau */

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.");
  return { url, key };
}

async function appel(url, key, chemin, init = {}) {
  const reponse = await fetch(`${url}${chemin}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const texte = await reponse.text();
  if (!reponse.ok) throw new Error(`${reponse.status} ${texte.slice(0, 400)}`);
  return texte ? JSON.parse(texte) : null;
}

async function assurerRapporteur(url, key, { nom, prenom }) {
  const existants = await appel(
    url,
    key,
    `/rest/v1/rapporteurs?select=id,nom,prenom&nom=eq.${encodeURIComponent(nom)}&prenom=eq.${encodeURIComponent(prenom)}`,
  );
  if (existants?.length) return existants[0].id;
  const [cree] = await appel(url, key, "/rest/v1/rapporteurs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ nom, prenom }),
  });
  return cree.id;
}

async function dejaImporte(url, key, date) {
  let total = 0;
  for (const table of Object.values(SECTEURS)) {
    const lignes = await appel(
      url,
      key,
      `/rest/v1/${table}?select=id&created_at=gte.${date}T00:00:00&created_at=lte.${date}T23:59:59`,
    );
    total += lignes.length;
  }
  return total;
}

/* -------------------------------------------------------------------- main */

const args = process.argv.slice(2);
const chemin = args.find((arg) => !arg.startsWith("--"));
const appliquer = args.includes("--apply");

if (!chemin) {
  console.error('Usage : node scripts/import-excel.mjs "chemin/Dashboard.xlsx" [--apply]');
  process.exit(1);
}

const lecture = await lireClasseur(chemin);
const { date, verificateur, lignes, rejets } = lecture;

console.log(`Feuille « ${lecture.feuille} » · date ${date} · vérifié par ${verificateur.prenom} ${verificateur.nom}`);
console.log(`${lignes.length} contrôle(s) lus, ${rejets.length} rejet(s).`);
if (rejets.length) {
  for (const rejet of rejets) console.error(`  ligne ${rejet.ligne} : ${rejet.motif}`);
  process.exit(2);
}

const parSecteur = Object.fromEntries(
  Object.keys(SECTEURS).map((secteur) => [secteur, lignes.filter((l) => l.secteur === secteur).length]),
);
console.log("Répartition :", parSecteur);

const doublons = Object.entries(
  lignes.reduce((acc, ligne) => {
    const cle = `${ligne.secteur}|${ligne.unite}|${ligne.emplacement}`;
    acc[cle] = (acc[cle] ?? 0) + 1;
    return acc;
  }, {}),
).filter(([, nombre]) => nombre > 1);
console.log("Emplacements contrôlés plusieurs fois :", doublons.length ? doublons : "aucun");

if (!appliquer) {
  console.log("\nMode lecture seule. Relancez avec --apply pour écrire dans Supabase.");
  process.exit(0);
}

const { url, key } = config();
const existant = await dejaImporte(url, key, date);
if (existant > 0) {
  console.error(
    `\n${existant} contrôle(s) existent déjà au ${date}. Import annulé pour éviter les doublons.\n` +
      "Supprimez-les d'abord (SQL) si vous voulez rejouer l'import.",
  );
  process.exit(3);
}

const rapporteurId = await assurerRapporteur(url, key, verificateur);
console.log(`Rapporteur : ${rapporteurId}`);

const parTable = { LF: [], NISSAN: [], ST: [] };
lignes.forEach((ligne, index) => {
  // L'ordre du classeur est conservé par un horodatage croissant (09:00 + n min).
  const minutes = String(index % 60).padStart(2, "0");
  const heures = String(9 + Math.floor(index / 60)).padStart(2, "0");
  parTable[ligne.secteur].push({
    rapporteur_id: rapporteurId,
    unite: ligne.unite,
    emplacement: ligne.emplacement,
    ...ligne.reponses,
    remarques: ligne.remarques,
    created_at: `${date}T${heures}:${minutes}:00+01:00`,
  });
});

for (const [secteur, table] of Object.entries(SECTEURS)) {
  const lot = parTable[secteur];
  if (!lot.length) continue;
  await appel(url, key, `/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(lot),
  });
  console.log(`${table} : ${lot.length} ligne(s) insérée(s)`);
}

const apres = await dejaImporte(url, key, date);
console.log(`\nVérification : ${apres} contrôle(s) au ${date}.`);
process.exit(apres === lignes.length ? 0 : 4);
