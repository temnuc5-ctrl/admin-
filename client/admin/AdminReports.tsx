import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clock3,
  FileSpreadsheet,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import { Link } from "react-router-dom";
import AdminLayout from "./AdminLayout";
import { CritereChart, StatutDonut, TrendChart, ZoneChart } from "./charts";
import {
  anomaliesDe,
  CRITERES,
  estConforme,
  formatDate,
  cleLieu,
  matchesDay,
  normaliser,
  reporterName,
  statsParCritere,
  statsParZone,
  tendance,
  ZONES,
  type ExpectedLocation,
  type Report,
  type ReportResponse,
} from "./data";

const SECTEUR_OPTIONS = ["Tous", ...ZONES] as const;
const LOGOS_SECTEUR: Record<string, string> = {
  LF: "/logo-lf.webp",
  NISSAN: "/logo-nissan.webp",
  ST: "/logo-st.webp",
};
const NISSAN_LINE_OPTIONS = ["Toutes", "Ligne D", "Ligne A"] as const;
const STATUT_OPTIONS = ["Toutes", "Évaluations reçues", "En attente"] as const;
const NISSAN_LINE_UNITS = { "Ligne D": "LD", "Ligne A": "LA" } as const;

interface LigneTable {
  key: string;
  secteur: string;
  unite: string;
  emplacement: string;
  statut: "Reçu" | "À recevoir";
  rapport?: Report;
  anomalie: number;
}

const pastille: Record<string, string> = {
  BON: "border-pine/25 bg-pine/[0.06] text-pine",
  MANQUE: "border-amber/40 bg-amber/[0.09] text-amber",
  "NON CONFORME": "border-clay/40 bg-clay/[0.08] text-clay",
  "N/A": "border-sand bg-sand/30 text-steel",
};

const libelleReponse: Record<string, string> = {
  BON: "Bon",
  MANQUE: "Manque",
  "NON CONFORME": "Non conforme",
  "N/A": "N/A",
};

function Carte({
  eyebrow,
  titre,
  action,
  children,
  className = "",
}: {
  eyebrow?: string;
  titre: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card-paper relative overflow-hidden ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-sand/80 px-5 py-4">
        <div>
          {eyebrow && <p className="font-mono-label text-[8px] text-steel/80">{eyebrow}</p>}
          <h2 className="mt-1 text-[13px] font-semibold text-pine">{titre}</h2>
        </div>
        {action}
      </div>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

function Legende({ items }: { items: { label: string; color: string; value?: string | number }[] }) {
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-sand/70 pt-3">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span className="h-1.5 w-1.5" style={{ background: item.color }} />
          <span className="text-[10px] text-steel">{item.label}</span>
          {item.value !== undefined && (
            <span className="font-mono-label text-[9px] font-semibold text-pine">{item.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function AdminReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [expectedLocations, setExpectedLocations] = useState<ExpectedLocation[] | null>(null);
  const [query, setQuery] = useState("");
  const [sectorFilter, setSectorFilter] = useState<(typeof SECTEUR_OPTIONS)[number]>("Tous");
  const [nissanLineFilter, setNissanLineFilter] = useState<(typeof NISSAN_LINE_OPTIONS)[number]>("Toutes");
  const [statutFilter, setStatutFilter] = useState<(typeof STATUT_OPTIONS)[number]>("Toutes");
  const [dateFilter, setDateFilter] = useState("");
  const [manqueAnomalie, setManqueAnomalie] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toutAfficher, setToutAfficher] = useState(false);
  const [derniereSync, setDerniereSync] = useState<string>("");
  const uniteNissanFiltre = nissanLineFilter === "Toutes" ? null : NISSAN_LINE_UNITS[nissanLineFilter];

  const charger = useCallback(async (silencieux = false) => {
    if (silencieux) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/reports", { credentials: "same-origin", cache: "no-store" });
      const result = (await response.json()) as ReportResponse;
      if (!response.ok) throw new Error(result.error ?? "Les rapports ne sont pas disponibles.");
      setReports(result.reports ?? []);
      setExpectedLocations(result.expectedLocations ?? null);
      setDerniereSync(
        new Intl.DateTimeFormat("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Africa/Casablanca",
        }).format(new Date()),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Les rapports ne sont pas disponibles.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const reportsFiltres = useMemo(() => {
    const recherche = query.trim().toLocaleLowerCase("fr");
    return reports.filter((report) => {
      const secteurOk = sectorFilter === "Tous" || String(report.sector) === sectorFilter;
      const ligneOk = sectorFilter !== "NISSAN" || !uniteNissanFiltre || report.unite.trim().toUpperCase() === uniteNissanFiltre;
      const dateOk = matchesDay(report.created_at, dateFilter);
      const contenu = [
        report.sector,
        report.unite,
        report.emplacement,
        ...CRITERES.map((c) => report[c.cle]),
        report.remarques,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("fr");
      return secteurOk && ligneOk && dateOk && contenu.includes(recherche);
    });
  }, [reports, query, sectorFilter, nissanLineFilter, uniteNissanFiltre, dateFilter]);

  const lignes = useMemo<LigneTable[]>(() => {
    const recues: LigneTable[] = reportsFiltres.map((report, index) => ({
      key: `${report.id ?? index}`,
      secteur: String(report.sector),
      unite: report.unite,
      emplacement: report.emplacement,
      statut: "Reçu",
      rapport: report,
      anomalie: anomaliesDe(report, manqueAnomalie).total,
    }));

    if (!expectedLocations) return recues;

    const vus = new Set(reportsFiltres.map((r) => cleLieu(r.sector, r.unite, r.emplacement)));
    const attendues: LigneTable[] = expectedLocations
      .filter((lieu) => sectorFilter === "Tous" || String(lieu.secteur) === sectorFilter)
      .filter((lieu) => sectorFilter !== "NISSAN" || !uniteNissanFiltre || lieu.unite.trim().toUpperCase() === uniteNissanFiltre)
      .filter((lieu) => {
        const recherche = query.trim().toLocaleLowerCase("fr");
        if (!recherche) return true;
        return `${lieu.secteur} ${lieu.unite} ${lieu.emplacement}`.toLocaleLowerCase("fr").includes(recherche);
      })
      .filter((lieu) => !vus.has(cleLieu(lieu.secteur, lieu.unite, lieu.emplacement)))
      .map((lieu, index) => ({
        key: `attendu-${lieu.secteur}-${lieu.unite}-${lieu.emplacement}-${index}`,
        secteur: String(lieu.secteur),
        unite: lieu.unite,
        emplacement: lieu.emplacement,
        statut: "À recevoir" as const,
        anomalie: 0,
      }));

    const ordre = (secteur: string) => {
      const index = ZONES.indexOf(secteur as (typeof ZONES)[number]);
      return index === -1 ? 99 : index;
    };
    return [...recues, ...attendues].sort(
      (a, b) =>
        ordre(a.secteur) - ordre(b.secteur) ||
        a.unite.localeCompare(b.unite, "fr") ||
        a.emplacement.localeCompare(b.emplacement, "fr"),
    );
  }, [reportsFiltres, expectedLocations, sectorFilter, uniteNissanFiltre, query, manqueAnomalie]);

  const lignesFiltrees = useMemo(
    () => lignes.filter((ligne) => statutFilter === "Toutes" || (statutFilter === "Évaluations reçues" ? ligne.statut === "Reçu" : ligne.statut === "À recevoir")),
    [lignes, statutFilter],
  );
  const recusFiltres = lignesFiltrees.filter((ligne) => ligne.statut === "Reçu").length;
  const attenteFiltrees = lignesFiltrees.filter((ligne) => ligne.statut === "À recevoir").length;

  const conformes = reportsFiltres.filter((r) => estConforme(r, manqueAnomalie)).length;
  const nonConformes = reportsFiltres.length - conformes;
  const pointsNC = reportsFiltres.reduce((sum, r) => sum + anomaliesDe(r, manqueAnomalie).total, 0);
  const taux = reportsFiltres.length ? conformes / reportsFiltres.length : 0;
  const enAttente = lignes.filter((l) => l.statut === "À recevoir").length;
  const etatDouches = useMemo(() => {
    if (!expectedLocations) return null;

    const emplacements = new Set(
      expectedLocations
        .filter((lieu) => sectorFilter === "Tous" || String(lieu.secteur) === sectorFilter)
        .filter((lieu) => sectorFilter !== "NISSAN" || !uniteNissanFiltre || lieu.unite.trim().toUpperCase() === uniteNissanFiltre)
        .filter((lieu) => {
          const recherche = query.trim().toLocaleLowerCase("fr");
          return !recherche || `${lieu.secteur} ${lieu.unite} ${lieu.emplacement}`.toLocaleLowerCase("fr").includes(recherche);
        })
        .map((lieu) => cleLieu(lieu.secteur, lieu.unite, lieu.emplacement)),
    );
    const derniersRapports = new Map<string, Report>();
    for (const report of reportsFiltres) {
      const key = cleLieu(report.sector, report.unite, report.emplacement);
      if (!emplacements.has(key)) continue;
      const dernier = derniersRapports.get(key);
      if (!dernier || new Date(report.created_at) > new Date(dernier.created_at)) {
        derniersRapports.set(key, report);
      }
    }

    const operationnelles = [...emplacements].filter((key) => derniersRapports.get(key)?.operationnelle === true).length;
    return {
      operationnelles,
      inoperationnelles: emplacements.size - operationnelles,
    };
  }, [expectedLocations, reportsFiltres, sectorFilter, uniteNissanFiltre, query]);

  const zones = useMemo(() => statsParZone(reportsFiltres, manqueAnomalie), [reportsFiltres, manqueAnomalie]);
  const criteres = useMemo(
    () => statsParCritere(reportsFiltres).sort((a, b) => b.anomalies - a.anomalies),
    [reportsFiltres],
  );
  const serie = useMemo(() => tendance(reports, 14, manqueAnomalie), [reports, manqueAnomalie]);
  const lignesAffichees = toutAfficher ? lignesFiltrees : lignesFiltrees.slice(0, 12);
  const criteresActifs = criteres.filter((c) => c.anomalies > 0).length;

  const kpis = [
    {
      label: "Rapports reçus",
      valeur: reportsFiltres.length,
      note: `${zones.filter((z) => z.total > 0).length} zone(s) active(s)`,
      accent: "bg-pine",
    },
    {
      label: "Conformes",
      valeur: conformes,
      note: `${(taux * 100).toFixed(1).replace(".", ",")} % du parc`,
      accent: "bg-lime-deep",
    },
    {
      label: "Non conformes",
      valeur: nonConformes,
      note: `${pointsNC} point(s) d'anomalie`,
      accent: "bg-clay",
    },
    {
      label: "À recevoir",
      valeur: expectedLocations ? enAttente : "—",
      note: expectedLocations ? `sur ${expectedLocations.length} attendus` : "référentiel indisponible",
      accent: "bg-amber",
    },
  ];

  return (
    <AdminLayout>
      {/* En-tête */}
      <div className="animate-rise flex flex-col justify-between gap-6 border-b border-sand pb-7 lg:flex-row lg:items-end">
        <div>
          <p className="flex items-center gap-3 font-mono-label text-[9px] text-steel">
            <span className="h-px w-7 bg-lime-deep" />
            Suivi de réception
          </p>
          <h1 className="mt-3 font-display text-[2.6rem] font-normal leading-none tracking-[-0.035em] text-pine sm:text-[3rem]">
            Rapports reçus
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-6 text-steel">
            Contrôles des douches de sécurité par secteur, unité et emplacement. La conformité est recalculée
            selon vos filtres ; les rapports restent immuables en base.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 border border-sand bg-white/50 px-3 py-2">
            <span className={`h-1.5 w-1.5 ${error ? "bg-clay" : "live-dot bg-lime-deep"}`} />
            <span className="font-mono-label text-[8px] text-steel">
              {error ? "hors ligne" : derniereSync ? `synchronisé ${derniereSync}` : "synchronisation"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => charger(true)}
            disabled={refreshing || loading}
            className="group flex items-center gap-2 border border-sand bg-white/60 px-3 py-2 text-[11px] font-medium text-pine transition hover:border-pine/30 hover:bg-white disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.8} />
            Actualiser
          </button>
          <Link
            to="/admin/export"
            className="group flex items-center gap-2 bg-pine px-4 py-2.5 text-[11px] font-semibold text-white transition hover:bg-pine-deep"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" strokeWidth={1.8} />
            Dashboard Excel
            <ArrowUpRight className="h-3.5 w-3.5 text-lime transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={1.8} />
          </Link>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-6 flex items-start gap-3 border border-clay/25 bg-clay/[0.05] px-4 py-3.5">
          <TriangleAlert className="mt-px h-4 w-4 shrink-0 text-clay" strokeWidth={1.8} />
          <div>
            <p className="text-[12px] font-medium text-clay">Connexion aux données impossible</p>
            <p className="mt-1 text-[11px] leading-5 text-clay/80">{error}</p>
          </div>
        </div>
      )}

      {/* KPI */}
      <div className="animate-rise delay-1 mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="card-paper relative overflow-hidden px-4 pb-4 pt-4 sm:px-5">
            <span className={`absolute left-0 top-0 h-full w-[3px] ${kpi.accent}`} />
            <p className="font-mono-label text-[8px] text-steel">{kpi.label}</p>
            <p className="mt-3 font-display text-[2.1rem] leading-none tracking-tight text-pine">
              {loading ? <span className="inline-block h-8 w-10 animate-pulse bg-sand/60" /> : kpi.valeur}
            </p>
            <p className="mt-2 text-[10px] text-steel/80">{kpi.note}</p>
          </div>
        ))}
      </div>

      <section className="card-paper relative mt-4 overflow-hidden">
        <div className="border-b border-sand/80 px-5 py-4">
          <p className="font-mono-label text-[8px] text-steel/80">Statut binaire · 1 / 0</p>
          <h2 className="mt-1 text-[13px] font-semibold text-pine">État opérationnel des douches</h2>
          <p className="mt-1 text-[10px] text-steel">
            Dernier rapport de la période sélectionnée ; sans rapport ou statut renseigné, la douche compte comme 0.
          </p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-sand/80">
          <div className="bg-pine/[0.025] px-5 py-5 sm:px-7">
            <p className="font-mono-label text-[9px] font-semibold text-pine">1 · OPÉRATIONNELLES</p>
            <p className="mt-3 font-display text-4xl leading-none text-pine">
              {loading ? "—" : etatDouches?.operationnelles ?? "—"}
            </p>
            <p className="mt-2 text-[10px] text-steel">douche(s) opérationnelle(s)</p>
          </div>
          <div className="bg-clay/[0.025] px-5 py-5 sm:px-7">
            <p className="font-mono-label text-[9px] font-semibold text-clay">0 · INOPÉRATIONNELLES</p>
            <p className="mt-3 font-display text-4xl leading-none text-clay">
              {loading ? "—" : etatDouches?.inoperationnelles ?? "—"}
            </p>
            <p className="mt-2 text-[10px] text-steel">douche(s) inopérationnelle(s)</p>
          </div>
        </div>
      </section>

      {/* Graphiques */}
      <div className="animate-rise delay-2 mt-6 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Carte
          eyebrow="Répartition"
          titre="Conformité par zone"
          action={
            <span className="font-mono-label text-[8px] text-steel/70">
              {reportsFiltres.length} contrôle{reportsFiltres.length > 1 ? "s" : ""}
            </span>
          }
        >
          {loading ? (
            <div className="h-[218px] animate-pulse bg-sand/25" />
          ) : (
            <>
              <ZoneChart data={zones.filter((z) => z.total > 0)} />
              <Legende
                items={[
                  { label: "Conformes", color: "#16302b", value: conformes },
                  { label: "Non conformes", color: "#a8452f", value: nonConformes },
                ]}
              />
            </>
          )}
        </Carte>

        <Carte eyebrow="Vue d'ensemble" titre="Répartition des contrôles" action={
          <span className="font-mono-label text-[8px] text-steel/70">{(taux * 100).toFixed(0)} %</span>
        }>
          {loading ? (
            <div className="h-[218px] animate-pulse bg-sand/25" />
          ) : (
            <>
              <StatutDonut conformes={conformes} nonConformes={nonConformes} />
              <Legende
                items={[
                  { label: "Conformes", color: "#16302b" },
                  { label: "Non conformes", color: "#a8452f" },
                ]}
              />
            </>
          )}
        </Carte>
      </div>

      <div className="animate-rise delay-2 mt-4 grid gap-4 xl:grid-cols-[1fr_1.35fr]">
        <Carte
          eyebrow="Diagnostic"
          titre="Anomalies par point de contrôle"
          action={
            <span className="flex items-center gap-1.5 font-mono-label text-[8px] text-steel/70">
              <span className="h-1 w-1 bg-amber" />
              {criteresActifs} actif{criteresActifs > 1 ? "s" : ""}
            </span>
          }
        >
          {loading ? (
            <div className="h-[252px] animate-pulse bg-sand/25" />
          ) : (
            <CritereChart data={criteres} />
          )}
        </Carte>

        <Carte
          eyebrow="Quatorze derniers jours"
          titre="Tendance des contrôles"
          action={
            <div className="flex items-center gap-3 font-mono-label text-[8px] text-steel/70">
              <span className="flex items-center gap-1.5"><span className="h-1 w-1 bg-pine" />conformes</span>
              <span className="flex items-center gap-1.5"><span className="h-1 w-1 bg-clay" />non conformes</span>
            </div>
          }
        >
          {loading ? <div className="h-[190px] animate-pulse bg-sand/25" /> : <TrendChart data={serie} />}
        </Carte>
      </div>

      {/* Filtres + tableau */}
      <section className="animate-rise delay-3 mt-6">
        <div className="flex flex-col gap-3 border-b border-sand pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono-label text-[9px] text-steel">Détail par emplacement</p>
            <h2 className="mt-1 text-[15px] font-semibold text-pine">
              {loading ? "Chargement…" : `${lignesFiltrees.length} ligne${lignesFiltrees.length > 1 ? "s" : ""}`}
              <span className="ml-2 text-[11px] font-normal text-steel">
                {recusFiltres} reçue{recusFiltres > 1 ? "s" : ""} · {attenteFiltrees} en attente
              </span>
            </h2>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 border border-sand bg-white/50 px-3 py-2">
            <input
              type="checkbox"
              checked={manqueAnomalie}
              onChange={(event) => setManqueAnomalie(event.target.checked)}
              className="h-3.5 w-3.5 accent-[#16302b]"
            />
            <span className="text-[10px] text-steel">Compter MANQUE comme anomalie</span>
          </label>
        </div>

        <div
          className={`mt-4 grid gap-3 ${
            sectorFilter === "NISSAN"
              ? "lg:grid-cols-[minmax(220px,1fr)_auto_auto_auto_190px]"
              : "lg:grid-cols-[minmax(220px,1fr)_auto_auto_190px]"
          }`}
        >
          <label className="relative block">
            <span className="sr-only">Recherche générale</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-steel/70" strokeWidth={1.8} />
            <input
              placeholder="Rechercher une unité, un emplacement, un critère…"
              aria-label="Recherche générale"
              className="h-11 w-full border border-sand bg-white/60 pl-10 pr-4 text-[12px] text-pine outline-none transition placeholder:text-steel/55 focus:border-pine/40 focus:bg-white"
              onChange={(event) => setQuery(event.target.value)}
              value={query}
            />
          </label>

          <div className="flex border border-sand bg-white/50 p-0.5" role="group" aria-label="Filtrer par secteur">
            {SECTEUR_OPTIONS.map((secteur) => (
              <button
                key={secteur}
                type="button"
                onClick={() => {
                  setSectorFilter(secteur);
                  setNissanLineFilter("Toutes");
                }}
                aria-pressed={sectorFilter === secteur}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-[10px] font-medium transition ${
                  sectorFilter === secteur ? "bg-pine text-white" : "text-steel hover:bg-pine/[0.05] hover:text-pine"
                }`}
              >
                <img
                  src={secteur === "Tous" ? "/logo-general.webp" : LOGOS_SECTEUR[secteur]}
                  alt=""
                  className="h-7 w-7 shrink-0 rounded-sm bg-white object-contain"
                />
                {secteur}
              </button>
            ))}
          </div>

          {sectorFilter === "NISSAN" && (
            <div className="flex border border-sand bg-white/50 p-0.5" role="group" aria-label="Filtrer par ligne Nissan">
              {NISSAN_LINE_OPTIONS.map((ligne) => (
                <button
                  key={ligne}
                  type="button"
                  onClick={() => setNissanLineFilter(ligne)}
                  aria-pressed={nissanLineFilter === ligne}
                  className={`px-3.5 py-2 text-[10px] font-medium transition ${
                    nissanLineFilter === ligne ? "bg-pine text-white" : "text-steel hover:bg-pine/[0.05] hover:text-pine"
                  }`}
                >
                  {ligne}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap border border-sand bg-white/50 p-0.5" role="group" aria-label="Filtrer par état d'évaluation">
            {STATUT_OPTIONS.map((statut) => (
              <button
                key={statut}
                type="button"
                onClick={() => setStatutFilter(statut)}
                aria-pressed={statutFilter === statut}
                className={`px-2.5 py-2 text-[10px] font-medium transition ${
                  statutFilter === statut ? "bg-pine text-white" : "text-steel hover:bg-pine/[0.05] hover:text-pine"
                }`}
              >
                {statut}
              </button>
            ))}
          </div>

          <label className="relative block">
            <span className="sr-only">Date de réception</span>
            <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-steel/70" strokeWidth={1.8} />
            <input
              aria-label="Date de réception"
              className="h-11 w-full border border-sand bg-white/60 pl-10 pr-3 text-[11px] text-pine outline-none transition focus:border-pine/40 focus:bg-white"
              onChange={(event) => setDateFilter(event.target.value)}
              type="date"
              value={dateFilter}
            />
          </label>
        </div>

        <div className="card-paper mt-4 overflow-hidden">
          <div className="divide-y divide-sand/60 md:hidden">
            {loading ? (
              <div className="p-4"><div className="loading-sheen h-16 w-full bg-sand/25" /></div>
            ) : lignesAffichees.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <CircleDashed className="mx-auto h-6 w-6 text-steel/40" strokeWidth={1.4} />
                <p className="mt-3 text-[12px] font-medium text-pine">Aucun résultat</p>
              </div>
            ) : (
              lignesAffichees.map((ligne) => (
                <LigneMobile
                  key={ligne.key}
                  ligne={ligne}
                  ouvert={expanded === ligne.key}
                  onToggle={() => setExpanded(expanded === ligne.key ? null : ligne.key)}
                  manqueAnomalie={manqueAnomalie}
                />
              ))
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="border-b border-sand bg-pine/[0.03] font-mono-label text-[8px] text-steel">
                  <th className="px-4 py-3 font-medium">Secteur</th>
                  <th className="px-4 py-3 font-medium">Unité</th>
                  <th className="px-4 py-3 font-medium">Emplacement</th>
                  <th className="px-4 py-3 font-medium">Anomalies</th>
                  <th className="px-4 py-3 font-medium">État</th>
                  <th className="px-4 py-3 font-medium">Réception</th>
                  <th className="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <tr key={index} className="border-b border-sand/60">
                      <td className="px-4 py-4" colSpan={7}>
                        <div className="loading-sheen h-4 w-full bg-sand/30" />
                      </td>
                    </tr>
                  ))
                ) : lignesFiltrees.length === 0 ? (
                  <tr>
                    <td className="px-4 py-14 text-center" colSpan={7}>
                      <CircleDashed className="mx-auto h-6 w-6 text-steel/40" strokeWidth={1.4} />
                      <p className="mt-3 text-[12px] font-medium text-pine">Aucun résultat</p>
                      <p className="mt-1 text-[11px] text-steel">
                        {reports.length === 0
                          ? "Aucun rapport transmis pour le moment."
                          : "Aucun rapport ne correspond à ces filtres."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  lignesAffichees.map((ligne) => {
                    const ouvert = expanded === ligne.key;
                    const detail = ligne.rapport ? anomaliesDe(ligne.rapport, manqueAnomalie) : null;
                    return (
                      <FragmentRow
                        key={ligne.key}
                        ligne={ligne}
                        ouvert={ouvert}
                        detail={detail}
                        onToggle={() => setExpanded(ouvert ? null : ligne.key)}
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-sand/70 bg-white/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              {lignesFiltrees.length > 12 && (
                <button
                  type="button"
                  onClick={() => setToutAfficher((v) => !v)}
                  className="w-fit border border-sand bg-white/60 px-2.5 py-1.5 font-mono-label text-[8px] font-semibold text-pine transition hover:border-pine/30 hover:bg-white"
                >
                  {toutAfficher ? "Réduire la liste" : `Afficher les ${lignesFiltrees.length} lignes`}
                </button>
              )}
              <span className="text-[10px] text-steel/80">
              {expectedLocations === null
                ? "Référentiel des emplacements attendus indisponible : seuls les rapports reçus sont listés."
                  : `${expectedLocations.length} emplacements attendus · ${enAttente} non reçus`}
              </span>
            </div>
            <span className="font-mono-label text-[8px] text-steel/60">Heure du site · Africa/Casablanca</span>
          </div>
        </div>
      </section>
    </AdminLayout>
  );
}

function LigneMobile({
  ligne,
  ouvert,
  onToggle,
  manqueAnomalie,
}: {
  ligne: LigneTable;
  ouvert: boolean;
  onToggle: () => void;
  manqueAnomalie: boolean;
}) {
  const recu = ligne.statut === "Reçu";
  const detail = ligne.rapport ? anomaliesDe(ligne.rapport, manqueAnomalie) : null;
  const rapporteur = ligne.rapport ? reporterName(ligne.rapport) : "";
  return (
    <div className={ouvert ? "bg-lime/[0.06]" : ""}>
      <button
        type="button"
        onClick={() => recu && onToggle()}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
      >
        <span className="mt-1 h-1.5 w-1.5 shrink-0 bg-pine/70" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="text-[12px] font-semibold text-pine">{ligne.secteur}</span>
            <span className="font-mono text-[10px] text-steel">{ligne.unite}</span>
          </span>
          <span className="mt-0.5 block text-[11px] text-ink">{ligne.emplacement}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-2">
            {recu ? (
              <span
                className={`inline-flex items-center gap-1 font-mono-label text-[8px] font-semibold ${
                  (detail?.total ?? 0) === 0 ? "text-pine" : "text-clay"
                }`}
              >
                {(detail?.total ?? 0) === 0 ? (
                  <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
                ) : (
                  <TriangleAlert className="h-3 w-3" strokeWidth={2} />
                )}
                {(detail?.total ?? 0) === 0 ? "Conforme" : `${detail?.total} anomalie(s)`}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-mono-label text-[8px] font-semibold text-amber">
                <Clock3 className="h-3 w-3" strokeWidth={2} /> À recevoir
              </span>
            )}
            <span className="font-mono text-[9px] text-steel/80">{recu ? formatDate(ligne.rapport?.created_at) : "—"}</span>
          </span>
        </span>
        {recu && (
          <ChevronDown
            className={`mt-1 h-3.5 w-3.5 shrink-0 text-steel/60 transition-transform ${ouvert ? "rotate-180" : ""}`}
            strokeWidth={1.8}
          />
        )}
      </button>

      {ouvert && ligne.rapport && (
        <div className="px-4 pb-4">
          <div className="border border-sand/80 bg-white/60 p-3">
            <div className="grid gap-1.5">
              {CRITERES.map((critere) => {
                const reponse = normaliser(ligne.rapport?.[critere.cle]);
                return (
                  <div
                    key={critere.cle}
                    className={`flex items-center justify-between gap-2 border px-2.5 py-1.5 ${pastille[reponse]}`}
                  >
                    <span className="text-[10px] text-ink">{critere.libelle}</span>
                    <span className="font-mono-label text-[8px] font-semibold">{libelleReponse[reponse]}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 border-t border-sand/70 pt-2.5">
              {rapporteur && (
                <p className="mb-1 text-[10px] leading-5 text-ink">
                  <span className="font-mono-label text-[8px] text-steel">Rapporteur</span>
                  <span className="ml-2">{rapporteur}</span>
                </p>
              )}
              <p className="font-mono-label text-[8px] text-steel">Remarques terrain</p>
              <p className="mt-1 text-[10px] leading-5 text-ink">
                {ligne.rapport.remarques?.trim() || "Aucune remarque transmise."}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FragmentRow({
  ligne,
  ouvert,
  detail,
  onToggle,
}: {
  ligne: LigneTable;
  ouvert: boolean;
  detail: { total: number; nonConformes: number; manques: number } | null;
  onToggle: () => void;
}) {
  const recu = ligne.statut === "Reçu";
  const rapporteur = ligne.rapport ? reporterName(ligne.rapport) : "";
  return (
    <>
      <tr
        className={`border-b border-sand/60 transition-colors ${
          ouvert ? "bg-lime/[0.06]" : "hover:bg-pine/[0.025]"
        } ${recu ? "cursor-pointer" : ""}`}
        onClick={() => recu && onToggle()}
      >
        <td className="px-4 py-3.5">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-pine">
            <span className="h-1.5 w-1.5 bg-pine/70" />
            {ligne.secteur}
          </span>
        </td>
        <td className="px-4 py-3.5 text-[11px] text-ink">{ligne.unite}</td>
        <td className="px-4 py-3.5 text-[11px] text-ink">{ligne.emplacement}</td>
        <td className="px-4 py-3.5">
          {recu ? (
            <span
              className={`inline-flex min-w-6 items-center justify-center px-1.5 py-0.5 font-mono-label text-[9px] font-semibold ${
                (detail?.total ?? 0) === 0 ? "bg-pine/[0.06] text-pine" : "bg-clay/[0.08] text-clay"
              }`}
            >
              {detail?.total ?? 0}
            </span>
          ) : (
            <span className="font-mono-label text-[9px] text-steel/40">—</span>
          )}
        </td>
        <td className="px-4 py-3.5">
          {recu ? (
            <span
              className={`inline-flex items-center gap-1.5 font-mono-label text-[8px] font-semibold ${
                (detail?.total ?? 0) === 0 ? "text-pine" : "text-clay"
              }`}
            >
              {(detail?.total ?? 0) === 0 ? (
                <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
              ) : (
                <TriangleAlert className="h-3 w-3" strokeWidth={2} />
              )}
              {(detail?.total ?? 0) === 0 ? "Conforme" : "Non conforme"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-mono-label text-[8px] font-semibold text-amber">
              <Clock3 className="h-3 w-3" strokeWidth={2} />
              À recevoir
            </span>
          )}
        </td>
        <td className="px-4 py-3.5 text-[10px] tabular-nums text-steel">
          {recu ? formatDate(ligne.rapport?.created_at) : "—"}
        </td>
        <td className="px-2 py-3.5">
          {recu && (
            <ChevronDown
              className={`h-3.5 w-3.5 text-steel/60 transition-transform ${ouvert ? "rotate-180" : ""}`}
              strokeWidth={1.8}
            />
          )}
        </td>
      </tr>
      {ouvert && ligne.rapport && (
        <tr className="border-b border-sand/60 bg-lime/[0.04]">
          <td className="px-4 pb-6 pt-1" colSpan={7}>
            <div className="border border-sand/80 bg-white/60 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-mono-label text-[8px] text-steel">
                  <SlidersHorizontal className="h-3 w-3" strokeWidth={1.8} />
                  Détail des 12 points de contrôle
                </span>
                <span className="font-mono-label text-[8px] text-steel/60">
                  {detail?.nonConformes ?? 0} non conforme(s) · {detail?.manques ?? 0} manque(s)
                </span>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {CRITERES.map((critere) => {
                  const reponse = normaliser(ligne.rapport?.[critere.cle]);
                  return (
                    <div
                      key={critere.cle}
                      className={`flex items-center justify-between gap-2 border px-2.5 py-1.5 ${pastille[reponse]}`}
                    >
                      <span className="text-[10px] text-ink">{critere.libelle}</span>
                      <span className="font-mono-label text-[8px] font-semibold">{libelleReponse[reponse]}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap items-start justify-between gap-4 border-t border-sand/70 pt-3">
                <div>
                  {rapporteur && (
                    <p className="mb-2 text-[11px] text-ink">
                      <span className="font-mono-label text-[8px] text-steel">Rapporteur</span>
                      <span className="ml-2">{rapporteur}</span>
                    </p>
                  )}
                  <p className="font-mono-label text-[8px] text-steel">Remarques terrain</p>
                  <p className="mt-1 max-w-xl text-[11px] leading-5 text-ink">
                    {ligne.rapport.remarques?.trim() || "Aucune remarque transmise."}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono-label text-[8px] text-steel">Identifiant du rapport</p>
                  <p className="mt-1 font-mono text-[9px] text-steel">{ligne.rapport.id}</p>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
