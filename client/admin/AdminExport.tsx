import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Cloud,
  Download,
  FileSpreadsheet,
  FolderOpen,
  Loader2,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import AdminLayout from "./AdminLayout";

type ResultatExport = {
  fileName?: string;
  downloadUrl?: string;
  publicUrl?: string | null;
  bucketUrl?: string | null;
  bucketError?: string | null;
  generatedAt?: string;
  stats?: { controles: number; conformes: number; nonConformes: number; attendus: number };
  error?: string;
};

const jourIso = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const decaler = (jours: number) => {
  const date = new Date();
  date.setDate(date.getDate() - jours);
  return jourIso(date);
};

const PRESETS = [
  { id: "jour", label: "Aujourd'hui", from: () => jourIso(new Date()), to: () => jourIso(new Date()) },
  { id: "7j", label: "7 derniers jours", from: () => decaler(6), to: () => jourIso(new Date()) },
  { id: "30j", label: "30 derniers jours", from: () => decaler(29), to: () => jourIso(new Date()) },
  {
    id: "mois",
    label: "Ce mois",
    from: () => {
      const d = new Date();
      return jourIso(new Date(d.getFullYear(), d.getMonth(), 1));
    },
    to: () => jourIso(new Date()),
  },
];

const CONTENU = [
  ["Synthèse", "5 indicateurs, 4 graphiques natifs Excel, matrice de vigilance, top des emplacements à risque."],
  ["Détail", "Toutes les réponses, une ligne par contrôle, filtres, mise en forme conditionnelle et remarques."],
  ["Analyse", "Conformité par critère et par zone, unités les plus touchées, emplacements non reçus."],
];

export default function AdminExport() {
  const [from, setFrom] = useState(decaler(6));
  const [to, setTo] = useState(jourIso(new Date()));
  const [manque, setManque] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResultatExport | null>(null);
  const [config, setConfig] = useState<{ bucket?: string | null; bucketPublicUrl?: string | null; serviceRoleConfigured?: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/admin/config", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setConfig(data))
      .catch(() => undefined);
  }, []);

  const presetActif = useMemo(() => {
    return PRESETS.find((preset) => preset.from() === from && preset.to() === to)?.id ?? null;
  }, [from, to]);

  async function creerDashboard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setBusy(true);
    try {
      const response = await fetch("/api/admin/export", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: to || from, manqueEstAnomalie: manque }),
      });
      const payload = (await response.json()) as ResultatExport;
      if (!response.ok) throw new Error(payload.error ?? "La génération du fichier a échoué.");
      setResult(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La génération du fichier a échoué.");
    } finally {
      setBusy(false);
    }
  }

  const peutLancer = Boolean(from && (!to || to >= from)) && !busy;
  const periodeLisible = `${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Casablanca" }).format(
    new Date(`${from}T12:00:00`),
  )}${to && to !== from ? ` → ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Casablanca" }).format(new Date(`${to}T12:00:00`))}` : ""}`;

  return (
    <AdminLayout>
      <div className="animate-rise flex flex-col justify-between gap-6 border-b border-sand pb-7 lg:flex-row lg:items-end">
        <div>
          <p className="flex items-center gap-3 font-mono-label text-[9px] text-steel">
            <span className="h-px w-7 bg-lime-deep" />
            Préparation des données
          </p>
          <h1 className="mt-3 font-display text-[2.6rem] font-normal leading-none tracking-[-0.035em] text-pine sm:text-[3rem]">
            Dashboard Excel
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-6 text-steel">
            Générez un classeur prêt à diffuser : indicateurs, graphiques natifs Excel et journal détaillé des
            contrôles. Le fichier est déposé dans le bucket public et un lien de téléchargement sécurisé est créé.
          </p>
        </div>
        {config?.bucketPublicUrl && (
          <a
            href={config.bucketPublicUrl}
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-2 border border-sand bg-white/60 px-3.5 py-2.5 text-[11px] font-medium text-pine transition hover:border-pine/30 hover:bg-white"
          >
            <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.8} />
            Bucket public
            <ArrowUpRight className="h-3.5 w-3.5 text-steel transition group-hover:text-pine" strokeWidth={1.8} />
          </a>
        )}
      </div>

      <div className="animate-rise delay-1 mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.72fr)]">
        <form className="card-paper self-start overflow-hidden" onSubmit={creerDashboard}>
          <div className="flex items-start justify-between gap-4 border-b border-sand px-5 py-4 sm:px-7">
            <div>
              <p className="font-mono-label text-[8px] text-steel">Paramètres</p>
              <h2 className="mt-1 text-[13px] font-semibold text-pine">Période à analyser</h2>
            </div>
            <span className="border border-sand px-2 py-1 font-mono-label text-[8px] text-steel">
              {Math.max(
                1,
                Math.round(
                  (new Date(`${to || from}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) /
                    86400000,
                ) + 1,
              )}{" "}
              jour(s)
            </span>
          </div>

          <div className="px-5 py-6 sm:px-7">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setFrom(preset.from());
                    setTo(preset.to());
                  }}
                  className={`border px-3 py-1.5 text-[10px] font-medium transition ${
                    presetActif === preset.id
                      ? "border-pine bg-pine text-white"
                      : "border-sand bg-white/50 text-steel hover:border-pine/30 hover:text-pine"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-[11px] font-medium text-pine">Du</span>
                <span className="relative block">
                  <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-steel/70" strokeWidth={1.8} />
                  <input
                    aria-label="Date de début"
                    className="h-12 w-full border border-sand bg-white/70 pl-10 pr-3 text-[13px] text-pine outline-none transition focus:border-pine/40 focus:bg-white"
                    max={to || undefined}
                    onChange={(event) => setFrom(event.target.value)}
                    required
                    type="date"
                    value={from}
                  />
                </span>
              </label>
              <label className="block">
                <span className="mb-2 block text-[11px] font-medium text-pine">Au</span>
                <span className="relative block">
                  <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-steel/70" strokeWidth={1.8} />
                  <input
                    aria-label="Date de fin"
                    className="h-12 w-full border border-sand bg-white/70 pl-10 pr-3 text-[13px] text-pine outline-none transition focus:border-pine/40 focus:bg-white"
                    min={from || undefined}
                    onChange={(event) => setTo(event.target.value)}
                    type="date"
                    value={to}
                  />
                </span>
                <span className="mt-2 block text-[10px] text-steel/70">Laissez la même date pour une journée unique.</span>
              </label>
            </div>

            <div className="mt-5 flex items-start justify-between gap-4 border border-sand bg-white/40 px-4 py-3">
              <div>
                <p className="text-[11px] font-medium text-pine">Compter « MANQUE » comme anomalie</p>
                <p className="mt-1 text-[10px] leading-4 text-steel">
                  Recommandé : une douche dont un équipement manque n'est pas opérationnelle.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={manque}
                onClick={() => setManque((v) => !v)}
                className={`relative mt-1 h-5 w-9 shrink-0 border transition ${
                  manque ? "border-pine bg-pine" : "border-sand bg-sand/40"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-3.5 w-3.5 transition-all ${
                    manque ? "left-[18px] bg-lime" : "left-0.5 bg-white"
                  }`}
                />
              </button>
            </div>

            <div className="mt-4 flex items-start gap-2 border-l-2 border-lime-deep bg-lime/[0.07] px-3 py-2.5">
              <Sparkles className="mt-px h-3.5 w-3.5 shrink-0 text-pine" strokeWidth={1.8} />
              <p className="text-[10px] leading-5 text-steel">
                <span className="font-medium text-pine">{periodeLisible}</span> — la génération n'est jamais
                automatique, elle démarre après validation.
              </p>
            </div>

            {error && (
              <p aria-live="polite" className="mt-4 flex items-start gap-2 border-l-2 border-clay bg-clay/[0.06] px-3 py-2.5 text-[11px] text-clay">
                <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                {error}
              </p>
            )}
            {result?.bucketError && (
              <p className="mt-4 flex items-start gap-2 border-l-2 border-amber bg-amber/[0.07] px-3 py-2.5 text-[11px] text-amber">
                <Cloud className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                {result.bucketError}
              </p>
            )}
          </div>

          <div className="flex flex-col justify-between gap-4 border-t border-sand bg-white/30 px-5 py-4 sm:flex-row sm:items-center sm:px-7">
            <span className="text-[10px] text-steel/80">
              {config?.serviceRoleConfigured
                ? `Dépôt automatique · bucket ${config.bucket ?? "dashboards"}`
                : "Clé service_role absente : lien de téléchargement temporaire (15 min)."}
            </span>
            <button
              className="group inline-flex h-11 items-center justify-center gap-3 bg-pine px-5 text-[12px] font-semibold text-white transition hover:bg-pine-deep disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!peutLancer}
              type="submit"
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                  Génération…
                </>
              ) : (
                <>
                  Créer le dashboard
                  <FileSpreadsheet className="h-3.5 w-3.5 text-lime" strokeWidth={1.8} />
                </>
              )}
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="card-paper overflow-hidden">
            <div className="border-b border-sand px-5 py-4">
              <p className="font-mono-label text-[8px] text-steel">Livrable</p>
              <h2 className="mt-1 text-[13px] font-semibold text-pine">Contenu du classeur</h2>
            </div>
            <ol className="divide-y divide-sand/70">
              {CONTENU.map(([titre, description], index) => (
                <li key={titre} className="flex gap-3 px-5 py-3.5">
                  <span className="mt-0.5 shrink-0 font-mono-label text-[9px] text-lime-deep">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <p className="text-[11px] font-semibold text-pine">{titre}</p>
                    <p className="mt-1 text-[10px] leading-5 text-steel">{description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {result && (
            <div className="animate-rise overflow-hidden border border-pine bg-pine text-white">
              <div className="grain grain-dark pointer-events-none absolute" aria-hidden="true" />
              <div className="relative border-b border-white/10 px-5 py-4">
                <p className="flex items-center gap-2 font-mono-label text-[8px] text-lime">
                  <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
                  Fichier généré
                </p>
                <p className="mt-2 break-all font-mono text-[10px] leading-5 text-white/70">{result.fileName}</p>
              </div>

              {result.stats && (
                <div className="relative grid grid-cols-3 divide-x divide-white/10 border-b border-white/10">
                  {[
                    ["Contrôles", result.stats.controles],
                    ["Conformes", result.stats.conformes],
                    ["Non conf.", result.stats.nonConformes],
                  ].map(([label, value]) => (
                    <div key={label} className="px-4 py-3">
                      <p className="font-mono-label text-[7px] text-white/40">{label}</p>
                      <p className="mt-1 font-display text-xl text-white">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="relative space-y-2 px-5 py-4">
                {result.downloadUrl && (
                  <a
                    href={result.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex h-11 w-full items-center justify-between bg-lime px-4 text-[12px] font-semibold text-pine-deep transition hover:bg-white"
                  >
                    Télécharger le fichier
                    <Download className="h-4 w-4 transition group-hover:translate-y-0.5" strokeWidth={2} />
                  </a>
                )}
                {result.publicUrl && (
                  <a
                    href={result.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex h-10 w-full items-center justify-between border border-white/20 px-4 text-[11px] text-white/85 transition hover:border-lime/50 hover:text-white"
                  >
                    Lien public du bucket
                    <ArrowUpRight className="h-3.5 w-3.5 text-lime" strokeWidth={1.8} />
                  </a>
                )}
                {result.bucketUrl && (
                  <a
                    href={result.bucketUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 px-1 pt-1 text-[10px] text-white/45 transition hover:text-white/80"
                  >
                    <FolderOpen className="h-3 w-3" strokeWidth={1.8} />
                    Parcourir le bucket
                  </a>
                )}
                <p className="pt-1 text-[9px] leading-4 text-white/35">
                  {result.downloadUrl?.startsWith("/api/")
                    ? "Lien temporaire valable 15 minutes, réservé à cette session."
                    : "Lien signé valable 7 jours · le fichier reste disponible dans le bucket."}
                </p>
              </div>
            </div>
          )}

          {!result && (
            <div className="border border-dashed border-sand bg-white/30 px-5 py-6">
              <FileSpreadsheet className="h-5 w-5 text-steel/40" strokeWidth={1.5} />
              <p className="mt-3 text-[11px] font-medium text-pine">Aucun fichier pour cette session</p>
              <p className="mt-1 text-[10px] leading-5 text-steel">
                Choisissez une période puis lancez la création. Un aperçu des indicateurs s'affichera ici.
              </p>
            </div>
          )}
        </aside>
      </div>
    </AdminLayout>
  );
}
