import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";

type InvalidFields = { nom: boolean; prenom: boolean; pin: boolean };

const CRITERES_APERCU = [
  ["Pomme", "ok"],
  ["Vanne 1", "ok"],
  ["Palette", "ok"],
  ["Érogateurs", "manque"],
  ["Qualité d'eau", "nc"],
] as const;

export default function AdminLogin() {
  const navigate = useNavigate();
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [invalidFields, setInvalidFields] = useState<InvalidFields>({ nom: false, prenom: false, pin: false });
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    fetch("/api/admin/session", { credentials: "same-origin" })
      .then((response) => setAuthenticated(response.ok))
      .catch(() => setAuthenticated(false))
      .finally(() => setCheckingSession(false));
  }, []);

  if (checkingSession) {
    return (
      <div className="admin-screen grain relative flex min-h-screen items-center justify-center overflow-hidden bg-paper text-sm text-steel">
        <span className="flex items-center gap-3">
          <span className="h-2 w-2 animate-pulse bg-pine" />
          Vérification de la session…
        </span>
      </div>
    );
  }
  if (authenticated) return <Navigate to="/admin/reports" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setInvalidFields({ nom: false, prenom: false, pin: false });
    setBusy(true);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, prenom, pin }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (result?.invalidFields) {
          setInvalidFields(result.invalidFields);
          return;
        }
        throw new Error(
          result?.error ?? "Le service de connexion est momentanément indisponible. Réessayez plus tard.",
        );
      }

      const sessionResponse = await fetch("/api/admin/session", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!sessionResponse.ok) throw new Error("La session n'a pas pu être établie. Réessayez.");
      navigate("/admin/reports", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La connexion a échoué.");
    } finally {
      setBusy(false);
    }
  }

  const champ =
    "h-12 w-full border bg-white/80 px-4 text-[15px] text-ink outline-none transition placeholder:text-steel/45 focus:bg-white";

  return (
    <main className="admin-screen min-h-screen bg-paper text-ink">
      <div className="grid min-h-screen lg:grid-cols-[1.02fr_1fr]">
        {/* Panneau éditorial */}
        <section className="grain grain-dark relative flex min-h-[380px] flex-col justify-between overflow-hidden bg-pine px-7 py-8 text-[#f4f5ef] sm:px-12 sm:py-10 lg:min-h-screen lg:px-[clamp(3rem,6vw,6rem)] lg:py-12">
          <div className="grid-dark pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
          <div
            className="pointer-events-none absolute -right-32 top-[22%] h-[420px] w-[420px] rounded-full border border-white/[0.06]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -right-10 top-[34%] h-[220px] w-[220px] rounded-full border border-lime/15"
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute bottom-0 right-0 h-40 w-40 bg-[radial-gradient(circle_at_100%_100%,rgba(198,216,121,0.16),transparent_65%)]" aria-hidden="true" />

          <div className="relative z-10 flex items-center gap-3">
            <img
              src="/logo-general.webp"
              alt="HSELY"
              className="h-10 w-10 rounded-sm border border-white/25 bg-white object-contain"
            />
            <div>
              <div className="font-mono-label text-[9px] text-white/50">Sécurité industrielle</div>
              <div className="font-display text-[17px] text-white">Douches de sécurité</div>
            </div>
          </div>

          <div className="relative z-10 max-w-xl py-12 lg:py-0">
            <p className="mb-6 flex items-center gap-3 font-mono-label text-[9px] text-lime">
              <span className="h-px w-8 bg-lime/60" />
              Espace de supervision
            </p>
            <h1 className="font-display text-[clamp(2.4rem,4.6vw,4.1rem)] font-normal leading-[1.02] tracking-[-0.03em] text-white">
              Des contrôles
              <br />
              <span className="italic text-lime">clairs</span>, des décisions
              <br />
              fiables.
            </h1>
            <p className="mt-7 max-w-sm text-[13px] leading-6 text-white/55">
              Consultez les rapports transmis depuis le terrain, suivez la conformité par zone et générez le
              dashboard Excel de la période.
            </p>
          </div>

          <div className="relative z-10">
            <div className="mb-6 max-w-sm border border-white/12 bg-white/[0.035] backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                <span className="font-mono-label text-[8px] text-white/40">Check-list · aperçu</span>
                <span className="flex items-center gap-1.5 font-mono-label text-[8px] text-lime">
                  <span className="h-1 w-1 bg-lime" /> en direct
                </span>
              </div>
              <ul>
                {CRITERES_APERCU.map(([label, etat], index) => (
                  <li
                    key={label}
                    className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-2 last:border-b-0"
                  >
                    <span className="font-mono-label text-[8px] text-white/30">{String(index + 1).padStart(2, "0")}</span>
                    <span className="flex-1 text-[11px] text-white/75">{label}</span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 ${
                          etat === "ok" ? "bg-lime" : etat === "manque" ? "bg-amber" : "bg-clay"
                        }`}
                      />
                      <span className="font-mono-label text-[7px] text-white/40">
                        {etat === "ok" ? "bon" : etat === "manque" ? "manque" : "non conforme"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between border-t border-white/12 pt-5 font-mono-label text-[8px] text-white/35">
              <span>3 secteurs · 12 points de contrôle</span>
              <span>Accès 01 / 02</span>
            </div>
          </div>
        </section>

        {/* Formulaire */}
        <section className="grain relative flex items-center justify-center overflow-hidden px-6 py-12 sm:px-10 lg:px-16">
          <div className="relative z-10 w-full max-w-[420px]">
            <div className="mb-10 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] text-steel">
                <ShieldCheck className="h-3.5 w-3.5 text-pine" strokeWidth={1.8} />
                Connexion protégée côté serveur
              </div>
              <span className="font-mono-label text-[8px] text-steel/60">SSL · HttpOnly</span>
            </div>

            <p className="font-mono-label text-[9px] text-steel">Administration · accès restreint</p>
            <h2 className="mt-3 font-display text-[2.6rem] font-normal leading-none tracking-[-0.03em] text-pine">
              Connexion
            </h2>
            <p className="mt-3 text-[13px] leading-6 text-steel">
              Saisissez les informations d'accès attribuées par le responsable du site.
            </p>

            <form className="mt-9 space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 flex items-center justify-between text-[11px] font-medium text-pine">
                    Nom
                    {invalidFields.nom && <span className="font-mono-label text-[8px] text-clay">incorrect</span>}
                  </span>
                  <input
                    autoComplete="family-name"
                    aria-describedby={invalidFields.nom ? "nom-error" : undefined}
                    aria-invalid={invalidFields.nom}
                    className={`${champ} ${
                      invalidFields.nom
                        ? "border-clay/60 focus:border-clay"
                        : "border-sand focus:border-pine focus:ring-2 focus:ring-pine/10"
                    }`}
                    name="nom"
                    onChange={(event) => setNom(event.target.value)}
                    required
                    value={nom}
                  />
                  {invalidFields.nom && (
                    <span className="mt-1.5 block text-[11px] text-clay" id="nom-error">
                      Nom incorrect
                    </span>
                  )}
                </label>
                <label className="block">
                  <span className="mb-2 flex items-center justify-between text-[11px] font-medium text-pine">
                    Prénom
                    {invalidFields.prenom && <span className="font-mono-label text-[8px] text-clay">incorrect</span>}
                  </span>
                  <input
                    autoComplete="given-name"
                    aria-describedby={invalidFields.prenom ? "prenom-error" : undefined}
                    aria-invalid={invalidFields.prenom}
                    className={`${champ} ${
                      invalidFields.prenom
                        ? "border-clay/60 focus:border-clay"
                        : "border-sand focus:border-pine focus:ring-2 focus:ring-pine/10"
                    }`}
                    name="prenom"
                    onChange={(event) => setPrenom(event.target.value)}
                    required
                    value={prenom}
                  />
                  {invalidFields.prenom && (
                    <span className="mt-1.5 block text-[11px] text-clay" id="prenom-error">
                      Prénom incorrect
                    </span>
                  )}
                </label>
              </div>

              <label className="block">
                <span className="mb-2 flex items-center justify-between text-[11px] font-medium text-pine">
                  <span className="flex items-center gap-2">
                    Code PIN
                    <LockKeyhole className="h-3 w-3 text-steel" strokeWidth={1.8} />
                  </span>
                  <span className="font-mono-label text-[8px] text-steel/60">6 chiffres</span>
                </span>
                <input
                  autoComplete="current-password"
                  aria-describedby={invalidFields.pin ? "pin-error" : "pin-help"}
                  aria-invalid={invalidFields.pin}
                  className={`${champ} font-mono text-[18px] tracking-[0.55em] ${
                    invalidFields.pin
                      ? "border-clay/60 focus:border-clay"
                      : "border-sand focus:border-pine focus:ring-2 focus:ring-pine/10"
                  }`}
                  inputMode="numeric"
                  maxLength={6}
                  name="pin"
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  pattern="[0-9]{6}"
                  required
                  type="password"
                  value={pin}
                />
                {invalidFields.pin ? (
                  <span className="mt-2 block text-[11px] text-clay" id="pin-error">
                    Code PIN incorrect
                  </span>
                ) : (
                  <span className="mt-2 block text-[10px] text-steel/70" id="pin-help">
                    Les caractères restent masqués · 5 tentatives maximum
                  </span>
                )}
              </label>

              {error && (
                <p
                  aria-live="polite"
                  className="border-l-2 border-clay bg-clay/[0.06] px-3 py-2.5 text-[12px] text-clay"
                >
                  {error}
                </p>
              )}

              <button
                className="group flex h-12 w-full items-center justify-between bg-pine px-5 text-[13px] font-semibold text-white transition hover:bg-pine-deep disabled:cursor-wait disabled:opacity-55"
                disabled={busy || pin.length !== 6 || !nom.trim() || !prenom.trim()}
                type="submit"
              >
                <span>{busy ? "Vérification…" : "Se connecter"}</span>
                <ArrowRight
                  className="h-4 w-4 transition group-hover:translate-x-0.5 group-disabled:translate-x-0"
                  strokeWidth={1.8}
                />
              </button>
            </form>

            <div className="mt-9 flex items-start gap-3 border-t border-sand pt-5">
              <span className="mt-1 h-1 w-1 shrink-0 bg-lime-deep" />
              <p className="text-[10px] leading-5 text-steel/80">
                Une difficulté d'accès ? Contactez l'administrateur du portail. Toute connexion est journalisée.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
