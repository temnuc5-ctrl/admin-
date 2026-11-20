// Supabase Edge Function — génération du dashboard Excel.
//
// Déploiement :
//   supabase functions deploy generate-excel-dashboard --project-ref ayshwltvfmrlnkswpjld
//
// Variables lues (fournies automatiquement par Supabase) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_DASHBOARD_BUCKET (optionnelle, défaut : dashboards)
//
// Sécurité : la fonction n'accepte que l'appel du portail de supervision,
// authentifié avec la clé service_role. Une clé anon est refusée.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildDashboardWorkbook } from "./dashboard.ts";

const CRITERES = [
  "pomme", "vanne_1", "palette", "vanne_2", "vasque", "rampe_2_sorties",
  "erogateurs", "tige_commande", "pedale", "flotteur", "ressort", "qualite_eau",
];

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function reponse(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: JSON_HEADERS });
}

function dateValide(valeur: string) {
  const date = new Date(`${valeur}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === valeur;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return reponse({ error: "Méthode non autorisée." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = Deno.env.get("SUPABASE_DASHBOARD_BUCKET") ?? "dashboards";
  if (!url || !serviceKey) return reponse({ error: "Configuration Supabase incomplète." }, 503);

  const jeton = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (jeton !== serviceKey) {
    return reponse({ error: "Accès réservé au portail de supervision." }, 401);
  }

  let corps: { from?: string; to?: string; manqueEstAnomalie?: boolean };
  try {
    corps = await request.json();
  } catch {
    return reponse({ error: "Corps JSON invalide." }, 400);
  }

  const from = corps.from ?? "";
  const to = corps.to ?? from;
  if (!dateValide(from) || !dateValide(to) || from > to) {
    return reponse({ error: "Période invalide." }, 400);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  try {
    const tables: [string, string][] = [
      ["LF", "rapports_lf"],
      ["NISSAN", "rapports_nissan"],
      ["ST", "rapports_st"],
    ];

    const rapports: Record<string, unknown>[] = [];
    for (const [secteur, table] of tables) {
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from(table)
          .select("*, rapporteurs(nom,prenom)")
          .gte("created_at", `${from}T00:00:00`)
          .lte("created_at", `${to}T23:59:59.999`)
          .order("created_at", { ascending: false })
          .range(offset, offset + 999);
        if (error) throw new Error(`${table}: ${error.message}`);
        const page = (data ?? []) as Record<string, unknown>[];
        rapports.push(...page.map((ligne) => ({ ...ligne, secteur })));
        if (page.length < 1000) break;
        offset += 1000;
      }
    }

    const { data: attendus } = await supabase.rpc("get_expected_locations");

    const lignes = rapports.map((ligne) => {
      const relation = ligne.rapporteurs as { nom?: string; prenom?: string } | { nom?: string; prenom?: string }[] | null;
      const personne = Array.isArray(relation) ? relation[0] : relation;
      return {
        id: String(ligne.id ?? ""),
        secteur: String(ligne.secteur ?? ""),
        unite: String(ligne.unite ?? ""),
        emplacement: String(ligne.emplacement ?? ""),
        controle_le: String(ligne.created_at ?? ""),
        remarques: (ligne.remarques as string | null) ?? "",
        rapporteur: [personne?.prenom, personne?.nom].filter(Boolean).join(" ") || null,
        reponses: Object.fromEntries(CRITERES.map((cle) => [cle, ligne[cle]])),
      };
    });

    const manque = corps.manqueEstAnomalie ?? true;
    const fichier = await buildDashboardWorkbook(lignes as never, {
      from,
      to,
      attendus: (attendus as { secteur: string; unite: string; emplacement: string }[] | null) ?? [],
      manqueEstAnomalie: manque,
      site: Deno.env.get("SITE_LABEL") ?? "Sites LF · NISSAN · ST",
      generePar: Deno.env.get("SITE_NAME") ?? "Portail de supervision",
    });

    const nom = `Dashboard_Douches_Securite_${from}_${to}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const chemin = `${new Date().toISOString().slice(0, 10)}/${nom}`;
    const contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    const { error: erreurDepot } = await supabase.storage.from(bucket).upload(chemin, fichier, {
      contentType,
      upsert: true,
    });

    let publicUrl: string | null = null;
    let downloadUrl: string | null = null;
    let bucketError: string | null = null;

    if (erreurDepot) {
      bucketError = `Bucket « ${bucket} » indisponible : ${erreurDepot.message}`;
    } else {
      publicUrl = supabase.storage.from(bucket).getPublicUrl(chemin).data.publicUrl;
      const { data: signe } = await supabase.storage.from(bucket).createSignedUrl(chemin, 60 * 60 * 24 * 7);
      downloadUrl = signe?.signedUrl ?? publicUrl;
    }

    const nonConformes = lignes.filter((ligne) =>
      Object.values(ligne.reponses as Record<string, string>).some(
        (valeur) => valeur === "NON CONFORME" || (manque && valeur === "MANQUE"),
      ),
    ).length;

    return reponse({
      fileName: nom,
      downloadUrl,
      publicUrl,
      bucketUrl: publicUrl ? `${url}/storage/v1/object/public/${bucket}` : null,
      bucketError,
      stats: {
        controles: lignes.length,
        conformes: lignes.length - nonConformes,
        nonConformes,
        attendus: (attendus as unknown[] | null)?.length ?? 0,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Génération impossible.";
    return reponse({ error: `Le dashboard n'a pas pu être généré : ${message}` }, 500);
  }
});
