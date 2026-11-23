import { ReactNode, useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ArrowUpRight, FileSpreadsheet, LayoutGrid, LogOut, ShieldCheck, Waves } from "lucide-react";

type AdminLayoutProps = { children: ReactNode };

const NAV = [
  { to: "/admin/reports", label: "Rapports reçus", index: "01", icon: LayoutGrid },
  { to: "/admin/export", label: "Dashboard Excel", index: "02", icon: FileSpreadsheet },
];

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/logo-general.webp"
        alt="HSELY"
        className="h-10 w-10 rounded-sm border border-white/25 bg-white object-contain"
      />
      <div className="leading-tight">
        <div className="font-mono-label text-[9px] text-white/55">Contrôles terrain</div>
        <div className="font-display text-[17px] tracking-tight text-white">Douches de sécurité</div>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<"checking" | "ready" | "unauthorized">("checking");
  const [signingOut, setSigningOut] = useState(false);
  const [supabase, setSupabase] = useState<{
    supabase: boolean;
    bucket: string | null;
    serviceRoleConfigured: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/session", { credentials: "same-origin" })
      .then((response) => {
        if (!active) return;
        if (response.ok) {
          setStatus("ready");
          fetch("/api/admin/config", { credentials: "same-origin" })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => active && data && setSupabase(data))
            .catch(() => undefined);
        } else {
          setStatus("unauthorized");
          navigate("/admin/login", { replace: true });
        }
      })
      .catch(() => {
        if (active) {
          setStatus("unauthorized");
          navigate("/admin/login", { replace: true });
        }
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function logout() {
    setSigningOut(true);
    try {
      await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
    } finally {
      navigate("/admin/login", { replace: true });
    }
  }

  if (status !== "ready") {
    return (
      <div className="admin-screen grain relative flex min-h-screen items-center justify-center overflow-hidden bg-paper text-sm text-steel">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 animate-pulse bg-pine" />
          {status === "checking" ? "Vérification de la session…" : "Redirection vers la connexion…"}
        </div>
      </div>
    );
  }

  const courant = NAV.find((item) => location.pathname.startsWith(item.to))?.label ?? "Supervision";
  const aujourdhui = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Casablanca",
  }).format(new Date());

  return (
    <div className="admin-screen min-h-screen bg-paper text-ink lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="sticky top-0 z-30 hidden h-screen flex-col overflow-hidden border-r border-white/10 bg-pine px-6 py-7 text-white lg:flex">
        <div className="grain grain-dark pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="grid-dark pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-24 bottom-24 h-64 w-64 rounded-full border border-white/[0.06]" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-10 bottom-40 h-36 w-36 rounded-full border border-lime/10" aria-hidden="true" />

        <div className="relative">
          <Brand />
        </div>

        <nav aria-label="Navigation de supervision" className="relative mt-12 space-y-1.5">
          <p className="mb-4 font-mono-label text-[9px] text-white/35">Supervision</p>
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `group relative flex h-12 items-center gap-3 border-l-2 pl-3 pr-2 text-sm transition-colors ${
                    isActive
                      ? "border-lime bg-white/[0.07] text-white"
                      : "border-transparent text-white/55 hover:border-white/20 hover:text-white"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`font-mono-label text-[9px] ${isActive ? "text-lime" : "text-white/30 group-hover:text-white/60"}`}
                    >
                      {item.index}
                    </span>
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.6} />
                    <span className="flex-1 text-[13px] font-medium">{item.label}</span>
                    <ArrowUpRight
                      className={`h-3.5 w-3.5 transition ${
                        isActive ? "text-lime opacity-100" : "opacity-0 group-hover:opacity-60"
                      }`}
                      strokeWidth={1.8}
                    />
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="relative mt-10 border border-white/10 bg-white/[0.035] p-4">
          <div className="flex items-center gap-2">
            <Waves className="h-3.5 w-3.5 text-lime" strokeWidth={1.8} />
            <span className="font-mono-label text-[8px] text-white/45">Source de données</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 ${supabase?.serviceRoleConfigured ? "live-dot bg-lime" : "bg-amber"}`}
              aria-hidden="true"
            />
            <span className="text-[12px] font-medium">
              {supabase === null
                ? "Vérification…"
                : supabase.serviceRoleConfigured
                  ? "Accès serveur configuré"
                  : supabase.supabase
                    ? "Accès rapports limité"
                    : "Supabase à configurer"}
            </span>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-white/40">
            {supabase?.serviceRoleConfigured
              ? `Lecture des rapports · bucket ${supabase.bucket ?? "dashboards"}`
              : supabase?.supabase
                ? "La clé anon est détectée, mais RLS bloque les rapports. Configurez SUPABASE_SERVICE_ROLE_KEY côté serveur."
                : "Configurez SUPABASE_URL et SUPABASE_ANON_KEY côté serveur."}
          </p>
        </div>

        <div className="relative mt-auto pt-6">
          <div className="mb-4 flex items-center justify-between border-t border-white/12 pt-5">
            <span className="flex items-center gap-2 text-[10px] text-white/40">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.7} />
              Session sécurisée · 8 h
            </span>
            <span className="font-mono-label text-[8px] text-white/25">v2.0</span>
          </div>
          <button
            className="flex w-full items-center gap-3 px-1 py-2 text-left text-[11px] text-white/60 transition hover:text-white disabled:opacity-50"
            disabled={signingOut}
            onClick={logout}
            type="button"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.7} />
            {signingOut ? "Déconnexion…" : "Se déconnecter"}
          </button>
        </div>
      </aside>

      <div className="relative min-w-0">
        <header className="sticky top-0 z-20 border-b border-sand/80 bg-paper/90 backdrop-blur-md">
          <div className="flex h-16 items-center justify-between gap-4 px-5 sm:px-8 xl:px-12">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center border border-sand bg-white/60 lg:hidden">
                <span className="h-2.5 w-2.5 rotate-45 bg-pine" />
              </div>
              <div className="flex items-center gap-2 text-[11px] text-steel">
                <span className="font-mono-label text-[9px] text-steel/80">Supervision</span>
                <span className="text-sand">/</span>
                <span className="font-medium text-pine">{courant}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="hidden font-mono-label text-[9px] text-steel sm:block">{aujourdhui}</span>
              <span className="hidden h-4 w-px bg-sand sm:block" />
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center bg-pine text-[10px] font-semibold text-lime">A</span>
                <span className="hidden text-[11px] font-medium text-pine sm:block">Administration</span>
              </div>
              <button
                className="grid h-8 w-8 place-items-center border border-sand text-steel transition hover:border-clay/40 hover:text-clay lg:hidden"
                onClick={logout}
                aria-label="Se déconnecter"
                type="button"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.7} />
              </button>
            </div>
          </div>

          <nav aria-label="Navigation mobile" className="flex border-t border-sand/70 px-5 lg:hidden">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-1 items-center justify-center gap-2 border-b-2 py-3 text-[11px] ${
                    isActive ? "border-pine font-semibold text-pine" : "border-transparent text-steel"
                  }`
                }
              >
                <item.icon className="h-3.5 w-3.5" strokeWidth={1.7} />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-[1480px] px-5 pb-16 pt-8 sm:px-8 sm:pt-10 xl:px-12">{children}</main>

        <footer className="mx-auto w-full max-w-[1480px] px-5 pb-8 sm:px-8 xl:px-12">
          <div className="tick-rule h-px w-full opacity-70" />
          <p className="mt-4 text-[10px] text-steel/70">
            Portail de supervision · les rapports transmis sont immuables · heure du site : Africa/Casablanca
          </p>
        </footer>
      </div>
    </div>
  );
}
