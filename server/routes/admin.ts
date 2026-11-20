import {
  createHmac,
  scryptSync,
  timingSafeEqual,
  createHash,
  randomUUID,
} from "node:crypto";
import { Request, RequestHandler } from "express";
import { z } from "zod";
import { LIEUX_REFERENTIEL } from "../referentiel";

const SESSION_COOKIE = "admin_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const PIN_HASH_PATTERN = /^([a-f\d]{32}):([a-f\d]{128})$/i;
const attemptsByIp = new Map<string, { count: number; expiresAt: number }>();

/** Fichiers générés conservés en mémoire quand aucun bucket n'est configuré. */
const fichiersTemporaires = new Map<string, { buffer: Buffer; nom: string; expire: number }>();

const loginSchema = z.object({
  nom: z.string().trim().min(1).max(100),
  prenom: z.string().trim().min(1).max(100),
  pin: z.string().regex(/^\d{6}$/),
});

function normalizeCredential(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s/g, "")
    .toLocaleLowerCase("fr");
}

function safeEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;

  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  return cookie ? cookie.slice(name.length + 1) : null;
}

function createSession() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) return null;

  const payload = Buffer.from(
    JSON.stringify({ expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function hasValidSession(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!token || !secret || secret.length < 32) return false;

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;

  const expected = createHmac("sha256", secret).update(payload).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return false;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof session.expiresAt === "number" && session.expiresAt > Date.now();
  } catch {
    return false;
  }
}

function usesSecureCookie(request: Request) {
  const forwardedProto = request.get("x-forwarded-proto")?.split(",")[0].trim();
  const origin = request.get("origin") ?? request.get("referer") ?? "";
  return process.env.NODE_ENV === "production" || request.secure || forwardedProto === "https" || origin.startsWith("https://") || request.hostname === "localhost";
}

function secureCookieOptions(request: Request) {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    usesSecureCookie(request) ? "SameSite=None" : "SameSite=Lax",
    "Max-Age=0",
    ...(usesSecureCookie(request) ? ["Secure", "Partitioned"] : []),
  ].join("; ");
}

function setSessionCookie(token: string, request: Request) {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    usesSecureCookie(request) ? "SameSite=None" : "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    ...(usesSecureCookie(request) ? ["Secure", "Partitioned"] : []),
  ].join("; ");
}

function isLoginConfigured() {
  return Boolean(
    process.env.ADMIN_NOM?.trim() &&
      process.env.ADMIN_PRENOM?.trim() &&
      process.env.ADMIN_PIN_HASH &&
      PIN_HASH_PATTERN.test(process.env.ADMIN_PIN_HASH) &&
      process.env.ADMIN_SESSION_SECRET &&
      process.env.ADMIN_SESSION_SECRET.length >= 32,
  );
}

function isPinValid(pin: string) {
  const hash = process.env.ADMIN_PIN_HASH;
  if (!hash) return false;
  const match = PIN_HASH_PATTERN.exec(hash);
  if (!match) return false;

  const expected = Buffer.from(match[2], "hex");
  const actual = scryptSync(pin, match[1], expected.length, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return timingSafeEqual(actual, expected);
}

function loginAttempts(ip: string) {
  const now = Date.now();
  const record = attemptsByIp.get(ip);
  if (!record || record.expiresAt <= now) {
    const fresh = { count: 0, expiresAt: now + 15 * 60 * 1000 };
    attemptsByIp.set(ip, fresh);
    return fresh;
  }
  return record;
}

export const handleAdminLogin: RequestHandler = (request, response) => {
  if (!isLoginConfigured()) {
    response.status(503).json({ error: "La connexion administrateur n'est pas configurée sur le serveur." });
    return;
  }

  const ip = request.ip ?? "unknown";
  const attempts = loginAttempts(ip);
  if (attempts.count >= 5) {
    response.status(429).json({ error: "Trop de tentatives. Réessayez dans quinze minutes." });
    return;
  }

  const result = loginSchema.safeParse(request.body);
  if (!result.success) {
    attempts.count += 1;
    const invalidFields = { nom: false, prenom: false, pin: false };
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (field === "nom" || field === "prenom" || field === "pin") invalidFields[field] = true;
    }
    response.status(400).json({ invalidFields });
    return;
  }

  const credentials = result.data;
  const invalidFields = {
    nom: !safeEqual(normalizeCredential(credentials.nom), normalizeCredential(process.env.ADMIN_NOM!)),
    prenom: !safeEqual(normalizeCredential(credentials.prenom), normalizeCredential(process.env.ADMIN_PRENOM!)),
    pin: !isPinValid(credentials.pin),
  };

  if (invalidFields.nom || invalidFields.prenom || invalidFields.pin) {
    attempts.count += 1;
    response.status(401).json({ invalidFields });
    return;
  }

  const token = createSession();
  if (!token) {
    response.status(503).json({ error: "La session administrateur n'est pas configurée sur le serveur." });
    return;
  }

  attemptsByIp.delete(ip);
  response.setHeader("Set-Cookie", setSessionCookie(token, request));
  response.status(200).json({ authenticated: true });
};

export const handleAdminSession: RequestHandler = (request, response) => {
  if (!hasValidSession(request)) {
    response.status(401).json({ authenticated: false });
    return;
  }
  response.status(200).json({ authenticated: true });
};

export const handleAdminLogout: RequestHandler = (request, response) => {
  response.setHeader("Set-Cookie", secureCookieOptions(request));
  response.status(204).end();
};

export const requireAdmin: RequestHandler = (request, response, next) => {
  if (!hasValidSession(request)) {
    response.status(401).json({ error: "Authentification requise." });
    return;
  }
  next();
};

/* ------------------------------------------------------------- Supabase */

interface SupabaseConfig {
  url: string;
  /** Clé publique : suffisante pour les RPC ouverts à anon. */
  anonKey: string;
  /** Clé serveur : contourne les RLS, ne quitte JAMAIS le serveur. */
  serviceKey: string | null;
  bucket: string;
}

function supabaseConfig(): SupabaseConfig | null {
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)?.replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
  // La clé service_role suffit côté serveur : la clé anon n'est utile qu'en repli.
  if (!url || (!anonKey && !serviceKey)) return null;
  return {
    url,
    anonKey,
    serviceKey,
    bucket: process.env.SUPABASE_DASHBOARD_BUCKET || "dashboards",
  };
}

class SupabaseRequestError extends Error {
  constructor(readonly status: number, readonly detail = "") {
    super("Supabase request failed");
  }
}

function entetes(config: SupabaseConfig) {
  const key = config.serviceKey ?? config.anonKey;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };
}

async function lireJson<T>(url: string, config: SupabaseConfig, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...entetes(config), ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new SupabaseRequestError(response.status, detail.slice(0, 300));
  }
  return (await response.json()) as T;
}

interface RapportBrut {
  id: string;
  unite: string;
  emplacement: string;
  created_at: string;
  remarques?: string | null;
  rapporteurs?: { nom?: string; prenom?: string } | { nom?: string; prenom?: string }[] | null;
  [cle: string]: unknown;
}

async function lireTable(
  config: SupabaseConfig,
  table: string,
  secteur: string,
  from?: string,
  to?: string,
): Promise<RapportBrut[]> {
  const rows: RapportBrut[] = [];
  let offset = 0;

  while (true) {
    const url = new URL(`${config.url}/rest/v1/${table}`);
    url.searchParams.set("select", "*,rapporteurs(nom,prenom)");
    url.searchParams.set("order", "created_at.desc");
    url.searchParams.set("limit", "1000");
    url.searchParams.set("offset", String(offset));
    if (from) url.searchParams.set("created_at", `gte.${from}T00:00:00`);
    if (to) url.searchParams.append("created_at", `lte.${to}T23:59:59.999`);

    const page = await lireJson<RapportBrut[]>(url.toString(), config);
    if (!Array.isArray(page)) throw new Error("Supabase a renvoyé une liste invalide");
    rows.push(...page.map((row) => ({ ...row, secteur })));
    if (page.length < 1000) return rows;
    offset += 1000;
  }
}

async function lireRapports(config: SupabaseConfig, from?: string, to?: string) {
  const tables: [string, string][] = [
    ["LF", "rapports_lf"],
    ["NISSAN", "rapports_nissan"],
    ["ST", "rapports_st"],
  ];
  const pages = await Promise.all(
    tables.map(([secteur, table]) => lireTable(config, table, secteur, from, to)),
  );
  return pages.flat();
}

function nomRapporteur(row: RapportBrut): string | null {
  const relation = Array.isArray(row.rapporteurs) ? row.rapporteurs[0] : row.rapporteurs;
  if (!relation) return null;
  return [relation.prenom, relation.nom].filter(Boolean).join(" ") || null;
}

async function lireEmplacementsAttendus(config: SupabaseConfig) {
  try {
    const données = await lireJson<unknown[]>(`${config.url}/rest/v1/rpc/get_expected_locations`, config, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (Array.isArray(données) && données.length) {
      return données
        .map((ligne) => ligne as { secteur?: string; unite?: string; emplacement?: string })
        .filter((l) => l.secteur && l.unite && l.emplacement)
        .map((l) => ({ secteur: l.secteur!, unite: l.unite!, emplacement: l.emplacement! }));
    }
  } catch {
    /* RPC absente : on retombe sur le référentiel embarqué. */
  }
  return LIEUX_REFERENTIEL;
}

function messageErreurSupabase(error: unknown): { status: number; error: string } {
  if (error instanceof SupabaseRequestError) {
    if ([401, 403].includes(error.status)) {
      return {
        status: 403,
        error:
          "Supabase a refusé la lecture. Renseignez SUPABASE_SERVICE_ROLE_KEY côté serveur (les tables sont protégées par RLS).",
      };
    }
    if (error.status === 404) {
      return { status: 502, error: "Une table de rapports est introuvable dans Supabase." };
    }
  }
  return { status: 502, error: "Les rapports n'ont pas pu être récupérés depuis Supabase." };
}

export const handleAdminConfig: RequestHandler = (_request, response) => {
  const config = supabaseConfig();
  response.status(200).json({
    supabase: Boolean(config),
    bucket: config?.bucket ?? null,
    anonKeyConfigured: Boolean(config?.anonKey),
    serviceRoleConfigured: Boolean(config?.serviceKey),
    bucketPublicUrl: config
      ? `${config.url}/storage/v1/object/public/${config.bucket}`
      : null,
  });
};

const periodeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  manqueEstAnomalie: z.boolean().optional(),
});

function periodeValide(from?: string, to?: string) {
  if (!from || !to) return true;
  return from <= to;
}

export const handleAdminReports: RequestHandler = async (request, response) => {
  const config = supabaseConfig();
  if (!config) {
    response.status(503).json({ error: "La connexion Supabase n'est pas configurée sur le serveur." });
    return;
  }

  const parsed = periodeSchema.safeParse(request.query);
  const from = parsed.success ? parsed.data.from : undefined;
  const to = parsed.success ? parsed.data.to : undefined;
  if (!periodeValide(from, to)) {
    response.status(400).json({ error: "La date de début doit précéder la date de fin." });
    return;
  }

  try {
    const [bruts, attendus] = await Promise.all([
      lireRapports(config, from, to),
      lireEmplacementsAttendus(config),
    ]);
    const reports = bruts.map((row) => ({
      ...row,
      // Le portail et l'export utilisent `sector` ; les tables stockent `secteur`.
      sector: String(row.secteur),
      rapporteur: nomRapporteur(row),
    }));
    response.status(200).json({
      reports,
      expectedLocations: attendus,
      generatedAt: new Date().toISOString(),
      source: config.serviceKey ? "service_role" : "anon",
    });
  } catch (error) {
    const { status, error: message } = messageErreurSupabase(error);
    response.status(status).json({ error: message });
  }
};

/* --------------------------------------------------------- Excel export */

const exportSchema = periodeSchema.extend({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function dateValide(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function nomFichier(from: string, to: string) {
  const date = new Date().toISOString().slice(0, 10);
  const periode = from === to ? from : `${from}_${to}`;
  return `Dashboard_Douches_Securite_${periode}_${date}.xlsx`;
}

async function televerserBucket(
  config: SupabaseConfig,
  chemin: string,
  buffer: Buffer,
  contentType: string,
) {
  if (!config.serviceKey) return null;
  const cheminEncode = chemin.split("/").map(encodeURIComponent).join("/");
  const url = `${config.url}/storage/v1/object/${config.bucket}/${cheminEncode}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: new Uint8Array(buffer),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new SupabaseRequestError(response.status, detail.slice(0, 300));
  }
  return `${config.url}/storage/v1/object/public/${config.bucket}/${cheminEncode}`;
}

async function urlSignee(config: SupabaseConfig, chemin: string) {
  if (!config.serviceKey) return null;
  const cheminEncode = chemin.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(
    `${config.url}/storage/v1/object/sign/${config.bucket}/${cheminEncode}`,
    {
      method: "POST",
      headers: {
        apikey: config.serviceKey,
        Authorization: `Bearer ${config.serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 7 }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as { signedURL?: string };
  return payload.signedURL ? `${config.url}/storage/v1${payload.signedURL.replace(/^\/storage\/v1/, "")}` : null;
}

export const handleAdminExport: RequestHandler = async (request, response) => {
  const parsed = exportSchema.safeParse(request.body);
  if (!parsed.success || !dateValide(parsed.data.from) || !dateValide(parsed.data.to)) {
    response.status(400).json({ error: "Sélectionnez une période valide." });
    return;
  }
  if (!periodeValide(parsed.data.from, parsed.data.to)) {
    response.status(400).json({ error: "La date de début doit précéder la date de fin." });
    return;
  }

  const config = supabaseConfig();
  if (!config) {
    response.status(503).json({ error: "La connexion Supabase n'est pas configurée sur le serveur." });
    return;
  }

  const { from, to } = parsed.data;
  try {
    const [bruts, attendus] = await Promise.all([
      lireRapports(config, from, to),
      lireEmplacementsAttendus(config),
    ]);

    const { buildDashboardWorkbook, CRITERES, normaliserReponse } = await import(
      "../dashboard/build-dashboard"
    );

    const lignes = bruts.map((row) => ({
      id: row.id,
      secteur: String(row.secteur),
      unite: row.unite,
      emplacement: row.emplacement,
      controle_le: row.created_at,
      remarques: row.remarques ?? "",
      rapporteur: nomRapporteur(row),
      reponses: Object.fromEntries(
        CRITERES.map((critere) => [critere.cle, normaliserReponse(row[critere.cle])]),
      ),
    }));

    const manque = parsed.data.manqueEstAnomalie ?? true;
    const buffer = await buildDashboardWorkbook(lignes as never, {
      from,
      to,
      attendus,
      manqueEstAnomalie: manque,
      site: process.env.SITE_LABEL ?? "Sites LF · NISSAN · ST",
      generePar: process.env.SITE_NAME ?? "Portail de supervision",
    });

    const fichier = nomFichier(from, to);
    const chemin = `${new Date().toISOString().slice(0, 10)}/${fichier}`;

    let downloadUrl: string | null = null;
    let publicUrl: string | null = null;
    let bucketError: string | null = null;

    try {
      publicUrl = await televerserBucket(config, chemin, Buffer.from(buffer), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      downloadUrl = (await urlSignee(config, chemin)) ?? publicUrl;
    } catch (error) {
      bucketError =
        error instanceof SupabaseRequestError && [400, 403, 404].includes(error.status)
          ? "Bucket indisponible : appliquez la migration storage (bucket « dashboards ») ou vérifiez SUPABASE_DASHBOARD_BUCKET."
          : "Le fichier n'a pas pu être déposé dans le bucket ; un lien temporaire est fourni.";
    }

    if (!downloadUrl) {
      const token = randomUUID();
      fichiersTemporaires.set(token, {
        buffer: Buffer.from(buffer),
        nom: fichier,
        expire: Date.now() + 15 * 60 * 1000,
      });
      downloadUrl = `/api/admin/export/file/${token}`;
    }

    const controlés = lignes.filter((l) => Object.keys(l.reponses).length > 0).length;
    const nonConformes = lignes.filter((l) =>
      Object.values(l.reponses).some((r) => r === "NON CONFORME" || (manque && r === "MANQUE")),
    ).length;

    response.status(200).json({
      fileName: fichier,
      downloadUrl,
      publicUrl,
      bucketUrl: publicUrl ? publicUrl.replace(`/${encodeURIComponent(chemin)}`, "") : null,
      bucketError,
      stats: {
        controles: controlés,
        conformes: controlés - nonConformes,
        nonConformes,
        attendus: attendus.length,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const { status, error: message } = messageErreurSupabase(error);
    response.status(status).json({ error: error instanceof SupabaseRequestError ? message : "Le tableau de bord Excel n'a pas pu être généré." });
  }
};

export const handleAdminExportFile: RequestHandler = (request, response) => {
  const fichier = fichiersTemporaires.get(String(request.params.token ?? ""));
  if (!fichier || fichier.expire < Date.now()) {
    response.status(404).json({ error: "Ce fichier a expiré. Relancez la génération." });
    return;
  }
  response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  response.setHeader("Content-Disposition", `attachment; filename="${fichier.nom}"`);
  response.status(200).end(fichier.buffer);
};
